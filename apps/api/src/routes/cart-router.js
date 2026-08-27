/**
 * @file Route table for `/api/cart`.
 *
 * @module routes/cart-router
 */

import { USER_ROLE } from '@hungry-ju/shared/enums';
import { BaseRouter } from '../core/base-router.js';
import { RbacMiddleware } from '../middleware/rbac-middleware.js';
import { ValidationMiddleware } from '../middleware/validation-middleware.js';
import { OrderingValidator } from '../validators/ordering-validator.js';

/**
 * Cart endpoints. There is no cart id in any path: a student has exactly one cart, and
 * it is always their own (SRS section 7).
 *
 * @augments BaseRouter
 */
export class CartRouter extends BaseRouter {
  /** @type {import('../controllers/cart-controller.js').CartController} */
  #controller;

  /** @type {import('../middleware/auth-middleware.js').AuthMiddleware} */
  #auth;

  /**
   * @param {object} dependencies - Injected collaborators.
   * @param {import('../controllers/cart-controller.js').CartController} dependencies.cartController -
   *   Handlers for these routes.
   * @param {import('../middleware/auth-middleware.js').AuthMiddleware} dependencies.authMiddleware -
   *   Sign-in guard.
   */
  constructor({ cartController, authMiddleware }) {
    super();
    this.#controller = cartController;
    this.#auth = authMiddleware;
  }

  /**
   * Declares the cart routes.
   *
   * @param {import('express').Router} router - Router to declare routes on.
   * @returns {void}
   */
  register(router) {
    router.use(this.#auth.handler(), RbacMiddleware.require(USER_ROLE.STUDENT));

    router.get('/', this.#controller.handle('show'));

    router.post(
      '/items',
      ValidationMiddleware.body(OrderingValidator.addToCart()),
      this.#controller.handle('addItem')
    );

    router.patch(
      '/items/:menuItemId',
      ValidationMiddleware.body(OrderingValidator.updateCartItem()),
      this.#controller.handle('updateItem')
    );

    router.delete('/items/:menuItemId', this.#controller.handle('removeItem'));
    router.delete('/', this.#controller.handle('clear'));
  }
}
