/**
 * @file Abstract middleware shared by every cross-cutting request filter.
 *
 * @module core/base-middleware
 */

/**
 * Abstract cross-cutting request filter.
 *
 * Middleware is written as a class rather than a bare function for the same reason
 * services are: it takes its collaborators through the constructor, so the auth filter
 * can be tested with a fake token service instead of a live signing key.
 *
 * `handler()` returns the bound Express function; routers never see the instance.
 *
 * @abstract
 */
export class BaseMiddleware {
  /**
   * @throws {TypeError} When constructed directly instead of through a subclass.
   */
  constructor() {
    if (new.target === BaseMiddleware) {
      throw new TypeError('BaseMiddleware is abstract');
    }
  }

  /**
   * Wraps a method of this middleware as an Express handler, preserving `this` and
   * forwarding rejections to the error channel.
   *
   * @protected
   * @param {string} method - Name of the method to expose.
   * @returns {import('express').RequestHandler} Express-ready handler.
   */
  bind(method) {
    /**
     * @param {import('express').Request} request - Incoming request.
     * @param {import('express').Response} response - Outgoing response.
     * @param {import('express').NextFunction} next - Continuation.
     * @returns {Promise<void>} Resolves once the chain continues or an error is forwarded.
     */
    return async (request, response, next) => {
      try {
        await this[method](request, response, next);
      } catch (error) {
        next(error);
      }
    };
  }

  /**
   * The Express handler this middleware installs.
   *
   * @abstract
   * @returns {import('express').RequestHandler} Handler to mount.
   * @throws {Error} Until a subclass implements it.
   */
  handler() {
    throw new Error(`${this.constructor.name} must implement handler()`);
  }
}
