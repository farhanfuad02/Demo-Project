/**
 * @file Per-caller request throttling.
 *
 * @module middleware/rate-limit-middleware
 */

import { BaseMiddleware } from '../core/base-middleware.js';
import { RateLimitError } from '../core/errors/app-error.js';

/**
 * A fixed-window counter over an in-process map.
 *
 * Sign-in, verification resend, and order placement are throttled because each is cheap
 * to send and expensive to serve: brute force, mail cost, and vendor spam respectively
 * (SRS section 9). The counter is per process, which is honest for the single-instance
 * MVP; behind several instances this becomes a shared store, and the seam is this class.
 *
 * @augments BaseMiddleware
 */
export class RateLimitMiddleware extends BaseMiddleware {
  /** @type {Map<string, { count: number, resetAt: number }>} */
  #buckets = new Map();

  /** @type {number} */
  #limit;

  /** @type {number} */
  #windowMs;

  /** @type {string} */
  #name;

  /**
   * @param {object} options - Throttle configuration.
   * @param {number} options.limit - Requests allowed per window.
   * @param {number} options.windowMs - Window length in milliseconds.
   * @param {string} [options.name] - Label used to keep buckets of different routes apart.
   */
  constructor({ limit, windowMs, name = 'default' }) {
    super();
    this.#limit = limit;
    this.#windowMs = windowMs;
    this.#name = name;
  }

  /**
   * Builds a throttle.
   *
   * @param {object} options - Throttle configuration.
   * @param {number} options.limit - Requests allowed per window.
   * @param {number} options.windowMs - Window length in milliseconds.
   * @param {string} [options.name] - Label for the bucket namespace.
   * @returns {import('express').RequestHandler} Handler to mount.
   */
  static of(options) {
    return new RateLimitMiddleware(options).handler();
  }

  /**
   * The throttle.
   *
   * @returns {import('express').RequestHandler} Handler to mount.
   */
  handler() {
    return this.bind('consume');
  }

  /**
   * Charges one request against the caller's budget.
   *
   * The key prefers the account over the address, so several students behind one campus
   * NAT do not throttle each other — while an anonymous flood still falls back to the
   * address it comes from.
   *
   * @param {import('express').Request} request - Incoming request.
   * @param {import('express').Response} response - Outgoing response.
   * @param {import('express').NextFunction} next - Continuation.
   * @returns {Promise<void>} Resolves once the chain continues.
   * @throws {RateLimitError} When the budget is exhausted.
   */
  async consume(request, response, next) {
    const key = `${this.#name}:${request.actor?.id ?? request.ip}`;
    const now = Date.now();
    const bucket = this.#buckets.get(key);

    if (!bucket || bucket.resetAt <= now) {
      this.#buckets.set(key, { count: 1, resetAt: now + this.#windowMs });
      this.#sweep(now);
      next();
      return;
    }

    bucket.count += 1;
    if (bucket.count > this.#limit) {
      const retryAfterSeconds = Math.ceil((bucket.resetAt - now) / 1000);
      response.set('Retry-After', String(retryAfterSeconds));
      throw new RateLimitError('Too many requests. Please slow down.', retryAfterSeconds);
    }
    next();
  }

  /**
   * Drops expired buckets so a long-running process does not accumulate one entry per
   * address that ever called it.
   *
   * @param {number} now - Current timestamp.
   * @returns {void}
   */
  #sweep(now) {
    if (this.#buckets.size < 1000) {
      return;
    }
    for (const [key, bucket] of this.#buckets) {
      if (bucket.resetAt <= now) {
        this.#buckets.delete(key);
      }
    }
  }
}
