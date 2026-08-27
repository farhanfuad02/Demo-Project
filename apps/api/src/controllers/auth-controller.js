/**
 * @file HTTP entry for the authentication endpoints.
 *
 * @module controllers/auth-controller
 */

import { AUTH } from '@hungry-ju/shared/constants';
import { BaseController } from '../core/base-controller.js';

/** Name of the cookie the refresh token travels in. */
const REFRESH_COOKIE = 'hju_refresh';

/**
 * Epic A over HTTP.
 *
 * The refresh token goes into an httpOnly cookie and the access token into the response
 * body. That split is deliberate: script on the page can hold the short-lived token it
 * needs for requests, and cannot read the long-lived one that could rebuild a session —
 * which is what makes an XSS bug a bad afternoon rather than a permanent account
 * takeover (SRS section 9).
 *
 * @augments BaseController
 */
export class AuthController extends BaseController {
  /** @type {import('../services/auth-service.js').AuthService} */
  #authService;

  /** @type {import('../services/user-service.js').UserService} */
  #userService;

  /** @type {boolean} */
  #secureCookies;

  /**
   * @param {object} dependencies - Injected collaborators.
   * @param {import('../services/auth-service.js').AuthService} dependencies.authService -
   *   Epic A rules.
   * @param {import('../services/user-service.js').UserService} dependencies.userService -
   *   Supplies the signed-in profile.
   * @param {boolean} [dependencies.secureCookies] - Mark cookies `Secure`; on in production.
   */
  constructor({ authService, userService, secureCookies = false }) {
    super();
    this.#authService = authService;
    this.#userService = userService;
    this.#secureCookies = secureCookies;
  }

  /**
   * Registers an account and mails the verification link (FR-A1).
   *
   * The link comes back in the body only outside production, where there is no mail
   * provider and the flow would otherwise be untestable.
   *
   * @param {import('express').Request} request - Incoming request.
   * @param {import('express').Response} response - Outgoing response.
   * @returns {Promise<import('express').Response>} The response.
   */
  async register(request, response) {
    const { user, verificationLink } = await this.#authService.register(this.body(request));
    return this.created(response, {
      user: user.toJSON(),
      verificationLink: this.#secureCookies ? undefined : verificationLink,
    });
  }

  /**
   * Consumes a verification token and activates the account (FR-A2).
   *
   * @param {import('express').Request} request - Incoming request.
   * @param {import('express').Response} response - Outgoing response.
   * @returns {Promise<import('express').Response>} The response.
   */
  async verify(request, response) {
    const user = await this.#authService.verifyAccount(this.body(request).token);
    return this.ok(response, { user: user.toJSON() });
  }

  /**
   * Re-sends the verification link.
   *
   * @param {import('express').Request} request - Incoming request.
   * @param {import('express').Response} response - Outgoing response.
   * @returns {Promise<import('express').Response>} The response.
   */
  async resendVerification(request, response) {
    const link = await this.#authService.resendVerification(this.body(request).identifier);
    return this.ok(response, {
      sent: true,
      verificationLink: this.#secureCookies ? undefined : link,
    });
  }

  /**
   * Signs a user in (FR-A4).
   *
   * @param {import('express').Request} request - Incoming request.
   * @param {import('express').Response} response - Outgoing response.
   * @returns {Promise<import('express').Response>} The response.
   */
  async login(request, response) {
    const { identifier, password } = this.body(request);
    const session = await this.#authService.login(identifier, password);
    this.#setRefreshCookie(response, session.refreshToken);
    return this.ok(response, {
      user: session.user.toJSON(),
      accessToken: session.accessToken,
    });
  }

  /**
   * Signs a user out and clears the cookie (FR-A9).
   *
   * @param {import('express').Request} request - Incoming request.
   * @param {import('express').Response} response - Outgoing response.
   * @returns {Promise<import('express').Response>} The response.
   */
  async logout(request, response) {
    await this.#authService.logout(request.cookies?.[REFRESH_COOKIE]);
    response.clearCookie(REFRESH_COOKIE, { path: '/' });
    return this.ok(response, { signedOut: true });
  }

  /**
   * Exchanges the refresh cookie for a fresh token pair.
   *
   * @param {import('express').Request} request - Incoming request.
   * @param {import('express').Response} response - Outgoing response.
   * @returns {Promise<import('express').Response>} The response.
   */
  async refresh(request, response) {
    const session = await this.#authService.refreshSession(request.cookies?.[REFRESH_COOKIE]);
    this.#setRefreshCookie(response, session.refreshToken);
    return this.ok(response, {
      user: session.user.toJSON(),
      accessToken: session.accessToken,
    });
  }

  /**
   * Starts the password-reset flow (FR-A5).
   *
   * @param {import('express').Request} request - Incoming request.
   * @param {import('express').Response} response - Outgoing response.
   * @returns {Promise<import('express').Response>} The response.
   */
  async forgotPassword(request, response) {
    const link = await this.#authService.requestPasswordReset(this.body(request).identifier);
    // The answer is the same whether or not the account exists, so this endpoint cannot
    // be used to find out who is registered.
    return this.ok(response, {
      sent: true,
      resetLink: this.#secureCookies ? undefined : link,
    });
  }

  /**
   * Completes a reset with a single-use token (FR-A5).
   *
   * @param {import('express').Request} request - Incoming request.
   * @param {import('express').Response} response - Outgoing response.
   * @returns {Promise<import('express').Response>} The response.
   */
  async resetPassword(request, response) {
    const { token, password } = this.body(request);
    await this.#authService.resetPassword(token, password);
    return this.ok(response, { reset: true });
  }

  /**
   * Returns the signed-in account, for client bootstrapping.
   *
   * @param {import('express').Request} request - Incoming request.
   * @param {import('express').Response} response - Outgoing response.
   * @returns {Promise<import('express').Response>} The response.
   */
  async me(request, response) {
    return this.ok(response, await this.#userService.profileOf(this.actor(request)));
  }

  /**
   * Writes the refresh cookie.
   *
   * `SameSite=Lax` blocks the cookie on cross-site POSTs, which is what makes a
   * cookie-borne CSRF against these endpoints a non-event.
   *
   * @param {import('express').Response} response - Outgoing response.
   * @param {string} refreshToken - Token to store.
   * @returns {void}
   */
  #setRefreshCookie(response, refreshToken) {
    response.cookie(REFRESH_COOKIE, refreshToken, {
      httpOnly: true,
      sameSite: 'lax',
      secure: this.#secureCookies,
      path: '/',
      maxAge: AUTH.REFRESH_TOKEN_TTL_MS,
    });
  }
}
