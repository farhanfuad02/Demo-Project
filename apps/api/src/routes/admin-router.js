/**
 * @file Route table for `/api/admin`.
 *
 * @module routes/admin-router
 */

import { USER_ROLE } from '@hungry-ju/shared/enums';
import { BaseRouter } from '../core/base-router.js';
import { RbacMiddleware } from '../middleware/rbac-middleware.js';
import { ValidationMiddleware } from '../middleware/validation-middleware.js';
import { AccountValidator } from '../validators/account-validator.js';
import { CatalogValidator } from '../validators/catalog-validator.js';

/**
 * Epic G endpoints.
 *
 * The admin gate is applied once to the whole router rather than per route: a new admin
 * endpoint is then guarded by default, which is the right direction for a mistake to
 * fall on a surface that can suspend accounts.
 *
 * @augments BaseRouter
 */
export class AdminRouter extends BaseRouter {
  /** @type {import('../controllers/admin-controller.js').AdminController} */
  #controller;

  /** @type {import('../middleware/auth-middleware.js').AuthMiddleware} */
  #auth;

  /**
   * @param {object} dependencies - Injected collaborators.
   * @param {import('../controllers/admin-controller.js').AdminController} dependencies.adminController -
   *   Handlers for these routes.
   * @param {import('../middleware/auth-middleware.js').AuthMiddleware} dependencies.authMiddleware -
   *   Sign-in guard.
   */
  constructor({ adminController, authMiddleware }) {
    super();
    this.#controller = adminController;
    this.#auth = authMiddleware;
  }

  /**
   * Declares the administration routes.
   *
   * @param {import('express').Router} router - Router to declare routes on.
   * @returns {void}
   */
  register(router) {
    router.use(this.#auth.handler(), RbacMiddleware.require(USER_ROLE.ADMIN));

    router.get('/summary', this.#controller.handle('summary'));

    router.get(
      '/shops',
      ValidationMiddleware.query(CatalogValidator.shopQueue()),
      this.#controller.handle('shopQueue')
    );

    router.post(
      '/shops/:shopId/decision',
      ValidationMiddleware.body(CatalogValidator.shopDecision()),
      this.#controller.handle('decideShop')
    );

    router.get(
      '/users',
      ValidationMiddleware.query(AccountValidator.userDirectory()),
      this.#controller.handle('users')
    );

    router.patch(
      '/users/:userId/status',
      ValidationMiddleware.body(AccountValidator.suspendUser()),
      this.#controller.handle('setUserStatus')
    );

    router.get(
      '/orders',
      ValidationMiddleware.query(AccountValidator.orderMonitor()),
      this.#controller.handle('orders')
    );

    router.post(
      '/orders/:orderId/resolve',
      ValidationMiddleware.body(AccountValidator.resolveOrder()),
      this.#controller.handle('resolveOrder')
    );

    router.get(
      '/audit-logs',
      ValidationMiddleware.query(AccountValidator.auditLog()),
      this.#controller.handle('auditLog')
    );

    router.get(
      '/analytics',
      ValidationMiddleware.query(AccountValidator.analyticsWindow()),
      this.#controller.handle('analytics')
    );

    router.get('/settings', this.#controller.handle('settings'));

    router.put(
      '/settings',
      ValidationMiddleware.body(AccountValidator.updateSetting()),
      this.#controller.handle('updateSetting')
    );

    router.post('/reviews/:ratingId/moderate', this.#controller.handle('moderateReview'));
  }
}
