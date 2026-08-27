/**
 * @file Route table for `/api/auth`.
 *
 * @module routes/auth-router
 */

import { RATE_LIMIT } from '@hungry-ju/shared/constants';
import { BaseRouter } from '../core/base-router.js';
import { RateLimitMiddleware } from '../middleware/rate-limit-middleware.js';
import { ValidationMiddleware } from '../middleware/validation-middleware.js';
import { AuthValidator } from '../validators/auth-validator.js';

/**
 * Epic A endpoints.
 *
 * Sign-in and the two link-sending endpoints are throttled: each is cheap to send and
 * expensive to serve, which is the definition of an endpoint worth abusing (SRS
 * section 9).
 *
 * @augments BaseRouter
 */
export class AuthRouter extends BaseRouter {
  /** @type {import('../controllers/auth-controller.js').AuthController} */
  #controller;

  /** @type {import('../middleware/auth-middleware.js').AuthMiddleware} */
  #auth;

  /**
   * @param {object} dependencies - Injected collaborators.
   * @param {import('../controllers/auth-controller.js').AuthController} dependencies.authController -
   *   Handlers for these routes.
   * @param {import('../middleware/auth-middleware.js').AuthMiddleware} dependencies.authMiddleware -
   *   Guard for the signed-in endpoints.
   */
  constructor({ authController, authMiddleware }) {
    super();
    this.#controller = authController;
    this.#auth = authMiddleware;
  }

  /**
   * Declares the authentication routes.
   *
   * @param {import('express').Router} router - Router to declare routes on.
   * @returns {void}
   */
  register(router) {
    const loginThrottle = RateLimitMiddleware.of({
      limit: RATE_LIMIT.LOGIN_PER_MIN,
      windowMs: 60_000,
      name: 'login',
    });
    const linkThrottle = RateLimitMiddleware.of({
      limit: RATE_LIMIT.OTP_RESEND_PER_HOUR,
      windowMs: 60 * 60_000,
      name: 'auth-link',
    });

    router.post(
      '/register',
      ValidationMiddleware.body(AuthValidator.register()),
      this.#controller.handle('register')
    );

    router.post(
      '/verify',
      ValidationMiddleware.body(AuthValidator.verify()),
      this.#controller.handle('verify')
    );

    router.post(
      '/verify/resend',
      linkThrottle,
      ValidationMiddleware.body(AuthValidator.resend()),
      this.#controller.handle('resendVerification')
    );

    router.post(
      '/login',
      loginThrottle,
      ValidationMiddleware.body(AuthValidator.login()),
      this.#controller.handle('login')
    );

    router.post('/logout', this.#controller.handle('logout'));
    router.post('/refresh', this.#controller.handle('refresh'));

    router.post(
      '/forgot-password',
      linkThrottle,
      ValidationMiddleware.body(AuthValidator.forgotPassword()),
      this.#controller.handle('forgotPassword')
    );

    router.post(
      '/reset-password',
      ValidationMiddleware.body(AuthValidator.resetPassword()),
      this.#controller.handle('resetPassword')
    );

    router.get('/me', this.#auth.handler(), this.#controller.handle('me'));
  }
}
