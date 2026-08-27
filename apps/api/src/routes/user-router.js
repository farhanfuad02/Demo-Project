/**
 * @file Route table for `/api/users`.
 *
 * @module routes/user-router
 */

import { USER_ROLE } from '@hungry-ju/shared/enums';
import { BaseRouter } from '../core/base-router.js';
import { RbacMiddleware } from '../middleware/rbac-middleware.js';
import { ValidationMiddleware } from '../middleware/validation-middleware.js';
import { AccountValidator } from '../validators/account-validator.js';
import { OrderingValidator } from '../validators/ordering-validator.js';

/**
 * Profile and Deliver Mode endpoints.
 *
 * Every route here acts on the signed-in account and takes no user id, which removes
 * the whole class of "edit someone else's profile" bugs by construction.
 *
 * @augments BaseRouter
 */
export class UserRouter extends BaseRouter {
  /** @type {import('../controllers/user-controller.js').UserController} */
  #controller;

  /** @type {import('../middleware/auth-middleware.js').AuthMiddleware} */
  #auth;

  /**
   * @param {object} dependencies - Injected collaborators.
   * @param {import('../controllers/user-controller.js').UserController} dependencies.userController -
   *   Handlers for these routes.
   * @param {import('../middleware/auth-middleware.js').AuthMiddleware} dependencies.authMiddleware -
   *   Sign-in guard.
   */
  constructor({ userController, authMiddleware }) {
    super();
    this.#controller = userController;
    this.#auth = authMiddleware;
  }

  /**
   * Declares the profile routes.
   *
   * @param {import('express').Router} router - Router to declare routes on.
   * @returns {void}
   */
  register(router) {
    router.use(this.#auth.handler());

    router.get('/profile', this.#controller.handle('show'));

    router.patch(
      '/profile',
      ValidationMiddleware.body(AccountValidator.updateProfile()),
      this.#controller.handle('update')
    );

    router.patch(
      '/location',
      RbacMiddleware.require(USER_ROLE.STUDENT),
      ValidationMiddleware.body(AccountValidator.updateLocation()),
      this.#controller.handle('updateLocation')
    );

    router.patch(
      '/deliver-mode',
      RbacMiddleware.require(USER_ROLE.STUDENT),
      ValidationMiddleware.body(OrderingValidator.deliverMode()),
      this.#controller.handle('setDeliverMode')
    );
  }
}
