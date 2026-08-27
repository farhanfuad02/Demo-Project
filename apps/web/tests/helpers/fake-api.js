/**
 * @file A stand-in API client for the client-controller tests.
 *
 * @module tests/helpers/fake-api
 */

import { ApiError } from '../../src/services/http-client.js';

/**
 * Builds a rejected-call helper, so a test can say what the server would have said.
 *
 * @param {object} failure - The failure to raise.
 * @param {number} failure.status - HTTP status.
 * @param {string} [failure.message] - Message.
 * @param {string} [failure.code] - Failure code.
 * @param {unknown} [failure.details] - Field-level detail.
 * @returns {ApiError} The error to throw.
 */
export function apiError({ status, message = 'failed', code = 'CONFLICT', details = null }) {
  return new ApiError({ status, message, code, details });
}

/**
 * A hand-written double of `ApiClient`.
 *
 * The controllers take their API client through the constructor, so a fake is enough to
 * test them — no module mocking, no network, and no DOM. That is the point of the
 * injection: the seam is where the tests need it.
 */
export class FakeApiClient {
  /** @type {Array<{ gateway: string, method: string, args: unknown[] }>} */
  calls = [];

  /**
   * @param {Record<string, Record<string, Function>>} [handlers] - Per-gateway responses.
   */
  constructor(handlers = {}) {
    this.http = {
      token: null,
      /**
       * @param {string | null} token - Access token.
       * @returns {void}
       */
      setAccessToken(token) {
        this.token = token;
      },
      /**
       * @returns {void}
       */
      onSessionLost() {},
    };

    for (const gateway of [
      'auth',
      'users',
      'shops',
      'cart',
      'orders',
      'deliveries',
      'notifications',
      'admin',
    ]) {
      this[gateway] = this.#buildGateway(gateway, handlers[gateway] ?? {});
    }
  }

  /**
   * Wraps each handler so the call is recorded before it runs.
   *
   * @param {string} name - Gateway name.
   * @param {Record<string, Function>} handlers - Handlers for this gateway.
   * @returns {Record<string, Function>} The recording gateway.
   */
  #buildGateway(name, handlers) {
    return Object.fromEntries(
      Object.entries(handlers).map(([method, handler]) => [
        method,
        async (...args) => {
          this.calls.push({ gateway: name, method, args });
          return handler(...args);
        },
      ])
    );
  }

  /**
   * How often one gateway method was called.
   *
   * @param {string} gateway - Gateway name.
   * @param {string} method - Method name.
   * @returns {number} Call count.
   */
  countOf(gateway, method) {
    return this.calls.filter((call) => call.gateway === gateway && call.method === method).length;
  }
}
