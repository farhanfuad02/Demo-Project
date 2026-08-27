/**
 * @file Low-level HTTP transport for the browser.
 *
 * @module services/http-client
 */

/**
 * A failed API call, carrying the server's own error envelope.
 *
 * The machine-readable code travels with it so a view can react to a conflict
 * differently from a validation failure without matching on message text — which is
 * free to change with wording or translation (NFR-10).
 *
 * @augments Error
 */
export class ApiError extends Error {
  /** @type {number} */
  #status;

  /** @type {string} */
  #code;

  /** @type {unknown} */
  #details;

  /**
   * @param {object} failure - What the server said.
   * @param {number} failure.status - HTTP status.
   * @param {string} failure.code - Machine-readable failure code.
   * @param {string} failure.message - Human-readable reason.
   * @param {unknown} [failure.details] - Field-level detail, when supplied.
   */
  constructor({ status, code, message, details = null }) {
    super(message);
    this.name = 'ApiError';
    this.#status = status;
    this.#code = code;
    this.#details = details;
  }

  /**
   * HTTP status.
   *
   * @returns {number} Status code.
   */
  get status() {
    return this.#status;
  }

  /**
   * Machine-readable failure code.
   *
   * @returns {string} Code.
   */
  get code() {
    return this.#code;
  }

  /**
   * Field-level detail.
   *
   * @returns {unknown} Details, or `null`.
   */
  get details() {
    return this.#details;
  }

  /**
   * Whether the resource moved under the caller — a delivery already taken, a cart
   * whose prices changed.
   *
   * @returns {boolean} `true` for a 409.
   */
  get isConflict() {
    return this.#status === 409;
  }

  /**
   * Whether the caller needs to sign in again.
   *
   * @returns {boolean} `true` for a 401.
   */
  get isUnauthorized() {
    return this.#status === 401;
  }

  /**
   * Field-level messages, keyed by field, for a form to render inline.
   *
   * @returns {Record<string, string>} Messages by field path; empty when none.
   */
  get fieldErrors() {
    if (!Array.isArray(this.#details)) {
      return {};
    }
    return Object.fromEntries(this.#details.map((issue) => [issue.path, issue.message]));
  }
}

/**
 * `fetch` with the project's conventions applied.
 *
 * One class owns the access token, the JSON envelope, and the refresh-and-retry dance,
 * so no view or controller ever writes a header by hand. When the access token expires
 * mid-session the client refreshes once and replays the request — the alternative is
 * throwing users back to the sign-in screen every fifteen minutes.
 */
export class HttpClient {
  /** @type {string} */
  #baseUrl;

  /** @type {string | null} */
  #accessToken = null;

  /** @type {Promise<boolean> | null} */
  #refreshInFlight = null;

  /** @type {(() => void) | null} */
  #onSessionLost = null;

  /**
   * @param {object} [options] - Transport configuration.
   * @param {string} [options.baseUrl] - Prefix for every path.
   */
  constructor({ baseUrl = '/api' } = {}) {
    this.#baseUrl = baseUrl;
  }

  /**
   * Stores the bearer token used for subsequent requests.
   *
   * @param {string | null} token - Access token, or `null` to clear it.
   * @returns {void}
   */
  setAccessToken(token) {
    this.#accessToken = token;
  }

  /**
   * The current access token.
   *
   * @returns {string | null} Token, or `null` when signed out.
   */
  get accessToken() {
    return this.#accessToken;
  }

  /**
   * Registers a callback for when the session cannot be recovered.
   *
   * @param {() => void} callback - Invoked after a failed refresh.
   * @returns {void}
   */
  onSessionLost(callback) {
    this.#onSessionLost = callback;
  }

  /**
   * Sends a request and unwraps the response envelope.
   *
   * @param {string} path - Path below the base URL.
   * @param {object} [options] - Request options.
   * @param {string} [options.method] - HTTP method.
   * @param {unknown} [options.body] - JSON body.
   * @param {Record<string, unknown>} [options.query] - Query parameters.
   * @param {boolean} [options.retryOnExpiry] - Refresh once and replay on a 401.
   * @returns {Promise<unknown>} The `data` field of the response.
   * @throws {ApiError} When the server reports a failure.
   */
  async request(path, { method = 'GET', body, query, retryOnExpiry = true } = {}) {
    const response = await this.#send(path, { method, body, query });

    if (response.status === 401 && retryOnExpiry) {
      const refreshed = await this.#refresh();
      if (refreshed) {
        return this.request(path, { method, body, query, retryOnExpiry: false });
      }
      this.#accessToken = null;
      this.#onSessionLost?.();
    }

    return HttpClient.#unwrap(response);
  }

  /**
   * Sends a request and returns both the page and its metadata.
   *
   * List endpoints answer with `data` plus `meta`; a caller rendering a pager needs
   * both, and `request` would drop the half it does not name.
   *
   * @param {string} path - Path below the base URL.
   * @param {Record<string, unknown>} [query] - Query parameters.
   * @returns {Promise<{ data: unknown[], meta: import('@hungry-ju/shared/types').PaginationMeta }>}
   *   The page.
   * @throws {ApiError} When the server reports a failure.
   */
  async requestPage(path, query = {}) {
    const response = await this.#send(path, { method: 'GET', query });
    if (response.status === 401) {
      const refreshed = await this.#refresh();
      if (refreshed) {
        return this.requestPage(path, query);
      }
      this.#accessToken = null;
      this.#onSessionLost?.();
    }
    const payload = await HttpClient.#payloadOf(response);
    if (!response.ok) {
      throw HttpClient.#toError(response.status, payload);
    }
    return { data: payload?.data ?? [], meta: payload?.meta ?? null };
  }

  /**
   * Convenience wrapper for a GET.
   *
   * @param {string} path - Path below the base URL.
   * @param {Record<string, unknown>} [query] - Query parameters.
   * @returns {Promise<unknown>} The response data.
   */
  async get(path, query) {
    return this.request(path, { method: 'GET', query });
  }

  /**
   * Convenience wrapper for a POST.
   *
   * @param {string} path - Path below the base URL.
   * @param {unknown} [body] - JSON body.
   * @returns {Promise<unknown>} The response data.
   */
  async post(path, body) {
    return this.request(path, { method: 'POST', body });
  }

  /**
   * Convenience wrapper for a PATCH.
   *
   * @param {string} path - Path below the base URL.
   * @param {unknown} [body] - JSON body.
   * @returns {Promise<unknown>} The response data.
   */
  async patch(path, body) {
    return this.request(path, { method: 'PATCH', body });
  }

  /**
   * Convenience wrapper for a PUT.
   *
   * @param {string} path - Path below the base URL.
   * @param {unknown} [body] - JSON body.
   * @returns {Promise<unknown>} The response data.
   */
  async put(path, body) {
    return this.request(path, { method: 'PUT', body });
  }

  /**
   * Convenience wrapper for a DELETE.
   *
   * @param {string} path - Path below the base URL.
   * @returns {Promise<unknown>} The response data.
   */
  async delete(path) {
    return this.request(path, { method: 'DELETE' });
  }

  /**
   * Performs the actual `fetch`.
   *
   * @param {string} path - Path below the base URL.
   * @param {object} options - Request options.
   * @param {string} options.method - HTTP method.
   * @param {unknown} [options.body] - JSON body.
   * @param {Record<string, unknown>} [options.query] - Query parameters.
   * @returns {Promise<Response>} The raw response.
   */
  async #send(path, { method, body, query }) {
    const url = new URL(
      `${this.#baseUrl}${path}`,
      globalThis.location?.origin ?? 'http://localhost'
    );
    for (const [key, value] of Object.entries(query ?? {})) {
      if (value !== undefined && value !== null && value !== '') {
        url.searchParams.set(key, String(value));
      }
    }

    /** @type {Record<string, string>} */
    const headers = { Accept: 'application/json' };
    if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
    }
    if (this.#accessToken) {
      headers.Authorization = `Bearer ${this.#accessToken}`;
    }

    return fetch(url.toString(), {
      method,
      headers,
      // The refresh token lives in an httpOnly cookie, so it has to be sent along.
      credentials: 'include',
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  }

  /**
   * Exchanges the refresh cookie for a new access token.
   *
   * Concurrent callers share one in-flight refresh: three requests failing at once
   * should rotate the token once, not three times, and rotation means the last two
   * would otherwise present a token the server has already retired.
   *
   * @returns {Promise<boolean>} `true` when the session was renewed.
   */
  async #refresh() {
    if (!this.#refreshInFlight) {
      this.#refreshInFlight = (async () => {
        try {
          const response = await this.#send('/auth/refresh', { method: 'POST' });
          if (!response.ok) {
            return false;
          }
          const payload = await HttpClient.#payloadOf(response);
          this.#accessToken = payload?.data?.accessToken ?? null;
          return Boolean(this.#accessToken);
        } catch {
          return false;
        } finally {
          this.#refreshInFlight = null;
        }
      })();
    }
    return this.#refreshInFlight;
  }

  /**
   * Reads the JSON body, tolerating an empty one.
   *
   * @param {Response} response - Response to read.
   * @returns {Promise<Record<string, unknown> | null>} Parsed body, or `null`.
   */
  static async #payloadOf(response) {
    if (response.status === 204) {
      return null;
    }
    try {
      return await response.json();
    } catch {
      return null;
    }
  }

  /**
   * Unwraps a successful response or throws the server's failure.
   *
   * @param {Response} response - Response to unwrap.
   * @returns {Promise<unknown>} The `data` field.
   * @throws {ApiError} When the response reports a failure.
   */
  static async #unwrap(response) {
    const payload = await HttpClient.#payloadOf(response);
    if (!response.ok) {
      throw HttpClient.#toError(response.status, payload);
    }
    return payload?.data ?? null;
  }

  /**
   * Builds an `ApiError` from a failure body.
   *
   * @param {number} status - HTTP status.
   * @param {Record<string, unknown> | null} payload - Parsed body.
   * @returns {ApiError} The error to throw.
   */
  static #toError(status, payload) {
    const envelope = payload?.error ?? {};
    return new ApiError({
      status,
      code: envelope.code ?? 'INTERNAL_ERROR',
      message: envelope.message ?? 'Something went wrong. Please try again.',
      details: envelope.details ?? null,
    });
  }
}
