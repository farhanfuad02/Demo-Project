/**
 * @file Turns thrown errors into HTTP responses, and unmatched routes into 404s.
 *
 * @module middleware/error-middleware
 */

import { HTTP_STATUS } from '@hungry-ju/shared/constants';
import { ERROR_CODE } from '@hungry-ju/shared/enums';
import { BaseMiddleware } from '../core/base-middleware.js';
import { AppError, NotFoundError } from '../core/errors/app-error.js';

/**
 * The last handler in the chain.
 *
 * Deliberate failures — `AppError` and its subclasses — become their own status and
 * message. Anything else is a bug: it is logged with its stack and answered with an
 * opaque 500, because a driver message or a file path in a response body is
 * reconnaissance handed to whoever asked for it.
 *
 * @augments BaseMiddleware
 */
export class ErrorMiddleware extends BaseMiddleware {
  /** @type {import('../lib/logger.js').Logger} */
  #logger;

  /** @type {boolean} */
  #exposeStack;

  /**
   * @param {object} dependencies - Injected collaborators.
   * @param {import('../lib/logger.js').Logger} dependencies.logger - Where failures are recorded.
   * @param {boolean} [dependencies.exposeStack] - Include the stack in the body; never in
   *   production.
   */
  constructor({ logger, exposeStack = false }) {
    super();
    this.#logger = logger;
    this.#exposeStack = exposeStack;
  }

  /**
   * A handler for paths no router claimed.
   *
   * @returns {import('express').RequestHandler} Handler to mount after every route.
   */
  static notFound() {
    /**
     * @param {import('express').Request} request - Incoming request.
     * @param {import('express').Response} _response - Outgoing response.
     * @param {import('express').NextFunction} next - Error channel.
     * @returns {void}
     */
    return (request, _response, next) => {
      next(new NotFoundError(`Route ${request.method} ${request.originalUrl}`));
    };
  }

  /**
   * The error handler.
   *
   * Express identifies an error handler by its four-parameter signature, so this one is
   * built directly rather than through `bind`.
   *
   * @returns {import('express').ErrorRequestHandler} Handler to mount last.
   */
  handler() {
    /**
     * @param {Error} error - Whatever was thrown.
     * @param {import('express').Request} request - Incoming request.
     * @param {import('express').Response} response - Outgoing response.
     * @param {import('express').NextFunction} next - Continuation, for a sent response.
     * @returns {void}
     */
    return (error, request, response, next) => {
      if (response.headersSent) {
        next(error);
        return;
      }

      if (error instanceof AppError) {
        this.#logger.warn('Request rejected', {
          method: request.method,
          path: request.originalUrl,
          status: error.statusCode,
          code: error.code,
          message: error.message,
          actorId: request.actor?.id,
        });
        response.status(error.statusCode).json(error.toJSON());
        return;
      }

      this.#logger.error('Unhandled failure', {
        method: request.method,
        path: request.originalUrl,
        message: error.message,
        stack: error.stack,
        actorId: request.actor?.id,
      });

      response.status(HTTP_STATUS.INTERNAL_ERROR).json({
        error: {
          code: ERROR_CODE.INTERNAL,
          message: 'Something went wrong on our side. Please try again.',
          details: this.#exposeStack ? { message: error.message, stack: error.stack } : null,
        },
      });
    };
  }
}
