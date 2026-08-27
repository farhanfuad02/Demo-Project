/**
 * @file Logs one line per request, with a correlation id.
 *
 * @module middleware/request-log-middleware
 */

import { randomUUID } from 'node:crypto';
import { BaseMiddleware } from '../core/base-middleware.js';

/**
 * Stamps each request with an id and records how it ended.
 *
 * The id travels back in `X-Request-Id`, so a student reporting "it failed at 1:15" can
 * be matched to one line in the log instead of a minute of traffic. The duration is
 * recorded because NFR-01 states a p95 target, and a target nobody measures is a wish.
 *
 * @augments BaseMiddleware
 */
export class RequestLogMiddleware extends BaseMiddleware {
  /** @type {import('../lib/logger.js').Logger} */
  #logger;

  /**
   * @param {object} dependencies - Injected collaborators.
   * @param {import('../lib/logger.js').Logger} dependencies.logger - Where lines are written.
   */
  constructor({ logger }) {
    super();
    this.#logger = logger;
  }

  /**
   * The request logger.
   *
   * @returns {import('express').RequestHandler} Handler to mount first.
   */
  handler() {
    return this.bind('log');
  }

  /**
   * Records the request once the response has finished.
   *
   * @param {import('express').Request} request - Incoming request.
   * @param {import('express').Response} response - Outgoing response.
   * @param {import('express').NextFunction} next - Continuation.
   * @returns {Promise<void>} Resolves once the chain continues.
   */
  async log(request, response, next) {
    const requestId = request.get('x-request-id') ?? randomUUID();
    const startedAt = process.hrtime.bigint();

    request.requestId = requestId;
    response.set('X-Request-Id', requestId);

    response.on('finish', () => {
      const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
      this.#logger.info('request', {
        requestId,
        method: request.method,
        path: request.originalUrl,
        status: response.statusCode,
        durationMs: Math.round(durationMs),
        actorId: request.actor?.id,
      });
    });

    next();
  }
}
