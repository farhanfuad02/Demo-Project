/**
 * @file Route table for `/api/shops` and `/api/search`.
 *
 * @module routes/shop-router
 */

import { USER_ROLE } from '@hungry-ju/shared/enums';
import { BaseRouter } from '../core/base-router.js';
import { RbacMiddleware } from '../middleware/rbac-middleware.js';
import { ValidationMiddleware } from '../middleware/validation-middleware.js';
import { AccountValidator } from '../validators/account-validator.js';
import { CatalogValidator } from '../validators/catalog-validator.js';
import { OrderingValidator } from '../validators/ordering-validator.js';

/**
 * Shop, menu, and order-board endpoints.
 *
 * Browsing is open to visitors — a student deciding whether to sign up should be able to
 * see what Bot Tola is selling — while everything that writes is behind a role gate.
 *
 * @augments BaseRouter
 */
export class ShopRouter extends BaseRouter {
  /** @type {import('../controllers/shop-controller.js').ShopController} */
  #controller;

  /** @type {import('../controllers/order-controller.js').OrderController} */
  #orderController;

  /** @type {import('../middleware/auth-middleware.js').AuthMiddleware} */
  #auth;

  /**
   * @param {object} dependencies - Injected collaborators.
   * @param {import('../controllers/shop-controller.js').ShopController} dependencies.shopController -
   *   Shop and menu handlers.
   * @param {import('../controllers/order-controller.js').OrderController} dependencies.orderController -
   *   Vendor order board handler.
   * @param {import('../middleware/auth-middleware.js').AuthMiddleware} dependencies.authMiddleware -
   *   Sign-in guard.
   */
  constructor({ shopController, orderController, authMiddleware }) {
    super();
    this.#controller = shopController;
    this.#orderController = orderController;
    this.#auth = authMiddleware;
  }

  /**
   * Declares the shop routes.
   *
   * `/mine` is declared before `/:shopId` because Express matches in declaration order,
   * and otherwise "mine" would be read as a shop id.
   *
   * @param {import('express').Router} router - Router to declare routes on.
   * @returns {void}
   */
  register(router) {
    const vendorOnly = [this.#auth.handler(), RbacMiddleware.require(USER_ROLE.VENDOR)];

    router.get(
      '/',
      ValidationMiddleware.query(CatalogValidator.browseShops()),
      this.#controller.handle('index')
    );

    router.get('/mine', ...vendorOnly, this.#controller.handle('mine'));

    router.post(
      '/',
      ...vendorOnly,
      ValidationMiddleware.body(CatalogValidator.registerShop()),
      this.#controller.handle('register')
    );

    router.get('/:shopId', this.#controller.handle('show'));
    router.get('/:shopId/menu', this.#controller.handle('menu'));
    router.get('/:shopId/reviews', this.#controller.handle('reviews'));

    router.patch(
      '/:shopId',
      ...vendorOnly,
      ValidationMiddleware.body(CatalogValidator.updateShop()),
      this.#controller.handle('update')
    );

    router.patch(
      '/:shopId/status',
      ...vendorOnly,
      ValidationMiddleware.body(CatalogValidator.shopStatus()),
      this.#controller.handle('setStatus')
    );

    router.post(
      '/:shopId/menu',
      ...vendorOnly,
      ValidationMiddleware.body(CatalogValidator.createMenuItem()),
      this.#controller.handle('addMenuItem')
    );

    router.patch(
      '/:shopId/menu/:itemId',
      ...vendorOnly,
      ValidationMiddleware.body(CatalogValidator.updateMenuItem()),
      this.#controller.handle('updateMenuItem')
    );

    router.patch(
      '/:shopId/menu/:itemId/availability',
      ...vendorOnly,
      ValidationMiddleware.body(CatalogValidator.itemAvailability()),
      this.#controller.handle('setMenuItemAvailability')
    );

    router.delete(
      '/:shopId/menu/:itemId',
      ...vendorOnly,
      this.#controller.handle('removeMenuItem')
    );

    router.get(
      '/:shopId/orders',
      ...vendorOnly,
      ValidationMiddleware.query(OrderingValidator.vendorBoard()),
      this.#orderController.handle('board')
    );

    router.get(
      '/:shopId/analytics',
      ...vendorOnly,
      ValidationMiddleware.query(AccountValidator.analyticsWindow()),
      this.#controller.handle('analytics')
    );
  }
}
