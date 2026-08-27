/**
 * @file Attaches the authenticated principal to the request.
 *
 * @module middleware/auth-middleware
 */

import { BaseMiddleware } from '../core/base-middleware.js';
import { UnauthorizedError } from '../core/errors/app-error.js';

/**
 * Resolves the bearer token into an `Actor`.
 *
 * Two modes, because some endpoints are richer when signed in but must still answer a
 * visitor: `require()` refuses without a valid token, `optional()` carries on with no
 * actor. Everything downstream reads `request.actor` and never the header.
 *
 * @augments BaseMiddleware
 */
export class AuthMiddleware extends BaseMiddleware {
  /** @type {import('../services/auth-service.js').AuthService} */
  #authService;

  /**
   * @param {object} dependencies - Injected collaborators.
   * @param {import('../services/auth-service.js').AuthService} dependencies.authService -
   *   Resolves a token into a principal.
   */
  constructor({ authService }) {
    super();
    this.#authService = authService;
  }

  /**
   * Reads the bearer token from the request.
   *
   * @param {import('express').Request} request - Incoming request.
   * @returns {string | null} Raw token, or `null` when absent.
   */
  static tokenFrom(request) {
    const header = request.get('authorization') ?? '';
    if (header.toLowerCase().startsWith('bearer ')) {
      return header.slice(7).trim();
    }
    return null;
  }

  /**
   * Guard that refuses unauthenticated requests.
   *
   * @returns {import('express').RequestHandler} Handler to mount.
   */
  handler() {
    return this.bind('require');
  }

  /**
   * Rejects the request unless a valid token names an active account.
   *
   * @param {import('express').Request} request - Incoming request.
   * @param {import('express').Response} _response - Outgoing response.
   * @param {import('express').NextFunction} next - Continuation.
   * @returns {Promise<void>} Resolves once the actor is attached or an error is forwarded.
   * @throws {UnauthorizedError} When no bearer token was supplied.
   */
  async require(request, _response, next) {
    const token = AuthMiddleware.tokenFrom(request);
    if (!token) {
      throw new UnauthorizedError('Sign in to continue.');
    }
    request.actor = await this.#authService.resolveActor(token);
    next();
  }

  /**
   * Guard that tolerates anonymous requests.
   *
   * @returns {import('express').RequestHandler} Handler to mount.
   */
  optional() {
    return this.bind('attachIfPresent');
  }

  /**
   * Attaches an actor when the token is valid, and carries on when it is not.
   *
   * An expired token on a public list is not an error: the visitor simply sees the
   * public version of the page rather than a sign-in wall.
   *
   * @param {import('express').Request} request - Incoming request.
   * @param {import('express').Response} _response - Outgoing response.
   * @param {import('express').NextFunction} next - Continuation.
   * @returns {Promise<void>} Resolves once the chain continues.
   */
  async attachIfPresent(request, _response, next) {
    const token = AuthMiddleware.tokenFrom(request);
    if (token) {
      try {
        request.actor = await this.#authService.resolveActor(token);
      } catch {
        request.actor = undefined;
      }
    }
    next();
  }
}
