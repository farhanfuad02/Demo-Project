/**
 * @file Abstract controller shared by every HTTP controller.
 *
 * @module core/base-controller
 */

import { HTTP_STATUS } from '@hungry-ju/shared/constants';
import { UnauthorizedError } from './errors/app-error.js';

/**
 * Abstract controller: turns an HTTP request into a service call and a result into a
 * response.
 *
 * Controllers are the only layer that touches `req` and `res`. They parse, read the
 * actor, delegate, and shape the reply — nothing else. The coding standard says
 * "business logic in controllers"; in practice the rules live one layer down in the
 * services, because the same rule is reached from HTTP *and* from the scheduler
 * (BR-11 auto-cancel), and an Express handler cannot be called from a timer.
 *
 * @abstract
 */
export class BaseController {
  /**
   * @throws {TypeError} When constructed directly instead of through a subclass.
   */
  constructor() {
    if (new.target === BaseController) {
      throw new TypeError('BaseController is abstract');
    }
  }

  /**
   * Reads the principal attached by `AuthMiddleware`.
   *
   * @protected
   * @param {import('express').Request} request - Incoming request.
   * @returns {import('@hungry-ju/shared/types').Actor} The authenticated principal.
   * @throws {UnauthorizedError} When the route was not guarded and no actor is present.
   */
  actor(request) {
    if (!request.actor) {
      throw new UnauthorizedError();
    }
    return request.actor;
  }

  /**
   * Reads the principal without demanding one, for endpoints that are richer when
   * signed in but still work for a visitor (browsing shops, for example).
   *
   * @protected
   * @param {import('express').Request} request - Incoming request.
   * @returns {import('@hungry-ju/shared/types').Actor | null} Principal, or `null`.
   */
  optionalActor(request) {
    return request.actor ?? null;
  }

  /**
   * Reads the payload that `ValidationMiddleware` whitelisted.
   *
   * Falling back to the raw body would defeat the whitelist, so an unvalidated route
   * yields an empty object rather than unchecked input.
   *
   * @protected
   * @param {import('express').Request} request - Incoming request.
   * @returns {Record<string, unknown>} Validated body.
   */
  body(request) {
    return request.validated?.body ?? {};
  }

  /**
   * Reads the validated query string.
   *
   * @protected
   * @param {import('express').Request} request - Incoming request.
   * @returns {Record<string, unknown>} Validated query parameters.
   */
  query(request) {
    return request.validated?.query ?? {};
  }

  /**
   * Sends a 200 response.
   *
   * @protected
   * @param {import('express').Response} response - Outgoing response.
   * @param {unknown} data - Payload to serialise under `data`.
   * @returns {import('express').Response} The response, for the caller to return.
   */
  ok(response, data) {
    return response.status(HTTP_STATUS.OK).json({ data });
  }

  /**
   * Sends a 200 response carrying a page of results and its metadata.
   *
   * @protected
   * @param {import('express').Response} response - Outgoing response.
   * @param {import('@hungry-ju/shared/types').PaginatedResult} page - Items plus metadata.
   * @returns {import('express').Response} The response, for the caller to return.
   */
  okPaginated(response, page) {
    return response.status(HTTP_STATUS.OK).json({ data: page.items, meta: page.meta });
  }

  /**
   * Sends a 201 response.
   *
   * @protected
   * @param {import('express').Response} response - Outgoing response.
   * @param {unknown} data - Representation of the created resource.
   * @returns {import('express').Response} The response, for the caller to return.
   */
  created(response, data) {
    return response.status(HTTP_STATUS.CREATED).json({ data });
  }

  /**
   * Sends an empty 204 response.
   *
   * @protected
   * @param {import('express').Response} response - Outgoing response.
   * @returns {import('express').Response} The response, for the caller to return.
   */
  noContent(response) {
    return response.status(HTTP_STATUS.NO_CONTENT).end();
  }

  /**
   * Binds a controller method to its instance and funnels rejections into `next`.
   *
   * Routers pass method references around, which would otherwise lose `this` and take
   * the private fields with it. Doing the binding here means no route file has to
   * remember `.bind(controller)`.
   *
   * @param {string} method - Name of the method on this controller.
   * @returns {import('express').RequestHandler} Express-ready handler.
   */
  handle(method) {
    /**
     * @param {import('express').Request} request - Incoming request.
     * @param {import('express').Response} response - Outgoing response.
     * @param {import('express').NextFunction} next - Error channel.
     * @returns {Promise<void>} Resolves once the response is sent or the error forwarded.
     */
    return async (request, response, next) => {
      try {
        await this[method](request, response);
      } catch (error) {
        next(error);
      }
    };
  }
}
