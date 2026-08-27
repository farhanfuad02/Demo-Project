/**
 * @file Role gate for routes.
 *
 * @module middleware/rbac-middleware
 */

import { BaseMiddleware } from '../core/base-middleware.js';
import { ForbiddenError, UnauthorizedError } from '../core/errors/app-error.js';

/**
 * Refuses a request whose actor holds none of the listed roles.
 *
 * This is the coarse gate — "vendors only". The fine one — "the vendor who owns *this*
 * shop" — belongs in the service, because a router cannot know which shop a request is
 * about until the row is read. Both are needed: skipping the second is what an IDOR is
 * (SRS section 9).
 *
 * @augments BaseMiddleware
 */
export class RbacMiddleware extends BaseMiddleware {
  /** @type {string[]} */
  #roles;

  /**
   * @param {...string} roles - Roles allowed through.
   */
  constructor(...roles) {
    super();
    this.#roles = roles;
  }

  /**
   * Builds a gate for the given roles.
   *
   * @param {...string} roles - Roles allowed through.
   * @returns {import('express').RequestHandler} Handler to mount.
   */
  static require(...roles) {
    return new RbacMiddleware(...roles).handler();
  }

  /**
   * The role gate.
   *
   * @returns {import('express').RequestHandler} Handler to mount.
   */
  handler() {
    return this.bind('check');
  }

  /**
   * Lets the request through when the actor holds one of the roles.
   *
   * @param {import('express').Request} request - Incoming request.
   * @param {import('express').Response} _response - Outgoing response.
   * @param {import('express').NextFunction} next - Continuation.
   * @returns {Promise<void>} Resolves once the chain continues.
   * @throws {UnauthorizedError} When the route was not guarded by `AuthMiddleware` first.
   * @throws {ForbiddenError} When the actor holds none of the roles.
   */
  async check(request, _response, next) {
    if (!request.actor) {
      throw new UnauthorizedError('Sign in to continue.');
    }
    if (!this.#roles.includes(request.actor.role)) {
      throw new ForbiddenError('Your role cannot perform this action.');
    }
    next();
  }
}
