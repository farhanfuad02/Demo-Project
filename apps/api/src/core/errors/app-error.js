/**
 * @file Root of the application error hierarchy and its concrete subclasses.
 *
 * Every failure the API reports on purpose is an `AppError`. Anything else that reaches
 * `ErrorMiddleware` is a bug, is logged with its stack, and becomes an opaque 500 — so a
 * stack trace or a driver message can never leak to a client (SRS section 9).
 *
 * @module core/errors/app-error
 */

import { ERROR_CODE } from '@hungry-ju/shared/enums';
import { HTTP_STATUS } from '@hungry-ju/shared/constants';

/**
 * Base class for every deliberate, client-visible failure.
 *
 * Subclasses fix the status and code, which is why controllers never build error
 * responses by hand: they throw, and one middleware renders the envelope.
 *
 * @augments Error
 */
export class AppError extends Error {
  /** @type {number} */
  #statusCode;

  /** @type {string} */
  #code;

  /** @type {unknown} */
  #details;

  /**
   * @param {string} message - Human-readable reason, safe to show a user.
   * @param {number} [statusCode] - HTTP status this failure maps to.
   * @param {string} [code] - Machine-readable code from {@link ERROR_CODE}.
   * @param {unknown} [details] - Optional field-level detail, e.g. validation issues.
   */
  constructor(
    message,
    statusCode = HTTP_STATUS.INTERNAL_ERROR,
    code = ERROR_CODE.INTERNAL,
    details = null
  ) {
    super(message);
    this.name = this.constructor.name;
    this.#statusCode = statusCode;
    this.#code = code;
    this.#details = details;
    Error.captureStackTrace?.(this, this.constructor);
  }

  /**
   * HTTP status this failure maps to.
   *
   * @returns {number} Status code.
   */
  get statusCode() {
    return this.#statusCode;
  }

  /**
   * Machine-readable failure code.
   *
   * @returns {string} Code from {@link ERROR_CODE}.
   */
  get code() {
    return this.#code;
  }

  /**
   * Field-level detail, when a validator supplied any.
   *
   * @returns {unknown} Details, or `null`.
   */
  get details() {
    return this.#details;
  }

  /**
   * Distinguishes deliberate failures from bugs without an `instanceof` check that would
   * break across module realms.
   *
   * @returns {boolean} Always `true` for this hierarchy.
   */
  get isOperational() {
    return true;
  }

  /**
   * Renders the wire envelope described by `ErrorEnvelope`.
   *
   * @returns {import('@hungry-ju/shared/types').ErrorEnvelope} Body for the HTTP response.
   */
  toJSON() {
    return {
      error: {
        code: this.#code,
        message: this.message,
        details: this.#details,
      },
    };
  }
}

/**
 * Input failed schema or business validation (HTTP 422).
 *
 * @augments AppError
 */
export class ValidationError extends AppError {
  /**
   * @param {string} [message] - Summary shown to the user.
   * @param {import('@hungry-ju/shared/types').ValidationIssue[] | null} [issues] - Field-level
   *   failures flattened from Zod.
   */
  constructor(message = 'The submitted data is invalid.', issues = null) {
    super(message, HTTP_STATUS.UNPROCESSABLE, ERROR_CODE.VALIDATION, issues);
  }
}

/**
 * Credentials are missing, expired, or wrong (HTTP 401).
 *
 * @augments AppError
 */
export class UnauthorizedError extends AppError {
  /**
   * @param {string} [message] - Reason, deliberately vague so it cannot enumerate accounts.
   */
  constructor(message = 'Authentication is required.') {
    super(message, HTTP_STATUS.UNAUTHORIZED, ERROR_CODE.UNAUTHORIZED);
  }
}

/**
 * The actor is authenticated but not allowed to touch this resource (HTTP 403).
 *
 * @augments AppError
 */
export class ForbiddenError extends AppError {
  /**
   * @param {string} [message] - Reason.
   */
  constructor(message = 'You are not allowed to perform this action.') {
    super(message, HTTP_STATUS.FORBIDDEN, ERROR_CODE.FORBIDDEN);
  }
}

/**
 * No such resource, or none this actor may see (HTTP 404).
 *
 * @augments AppError
 */
export class NotFoundError extends AppError {
  /**
   * @param {string} [resource] - Resource name used to build the message.
   */
  constructor(resource = 'Resource') {
    super(`${resource} was not found.`, HTTP_STATUS.NOT_FOUND, ERROR_CODE.NOT_FOUND);
  }
}

/**
 * The request lost a race or collided with a uniqueness rule (HTTP 409).
 *
 * This is what a delivery partner receives when another partner won the atomic claim
 * first (UC-02 alternate flow A1).
 *
 * @augments AppError
 */
export class ConflictError extends AppError {
  /**
   * @param {string} [message] - Reason.
   * @param {unknown} [details] - What changed, so the client can show a diff rather than
   *   only an apology — checkout uses this to list moved prices and sold-out items.
   */
  constructor(message = 'The resource has already changed.', details = null) {
    super(message, HTTP_STATUS.CONFLICT, ERROR_CODE.CONFLICT, details);
  }
}

/**
 * The caller exceeded a throttling budget (HTTP 429).
 *
 * @augments AppError
 */
export class RateLimitError extends AppError {
  /**
   * @param {string} [message] - Reason.
   * @param {number} [retryAfterSeconds] - Seconds until the budget refills.
   */
  constructor(message = 'Too many requests. Please slow down.', retryAfterSeconds = 60) {
    super(message, HTTP_STATUS.TOO_MANY_REQUESTS, ERROR_CODE.RATE_LIMITED, {
      retryAfterSeconds,
    });
  }
}
