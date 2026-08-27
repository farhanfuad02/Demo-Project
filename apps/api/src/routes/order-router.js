/**
 * @file Route table for `/api/orders`.
 *
 * @module routes/order-router
 */

import { USER_ROLE } from '@hungry-ju/shared/enums';
import { RATE_LIMIT } from '@hungry-ju/shared/constants';
import { BaseRouter } from '../core/base-router.js';
import { RateLimitMiddleware } from '../middleware/rate-limit-middleware.js';
import { RbacMiddleware } from '../middleware/rbac-middleware.js';
import { ValidationMiddleware } from '../middleware/validation-middleware.js';
import { OrderingValidator } from '../validators/ordering-validator.js';

/**
 * Order endpoints, for both sides of the transaction.
 *
 * @augments BaseRouter
 */
export class OrderRouter extends BaseRouter {
  /** @type {import('../controllers/order-controller.js').OrderController} */
  #controller;

  /** @type {import('../middleware/auth-middleware.js').AuthMiddleware} */
  #auth;

  /**
   * @param {object} dependencies - Injected collaborators.
   * @param {import('../controllers/order-controller.js').OrderController} dependencies.orderController -
   *   Handlers for these routes.
   * @param {import('../middleware/auth-middleware.js').AuthMiddleware} dependencies.authMiddleware -
   *   Sign-in guard.
   */
  constructor({ orderController, authMiddleware }) {
    super();
    this.#controller = orderController;
    this.#auth = authMiddleware;
  }

  /**
   * Declares the order routes.
   *
   * @param {import('express').Router} router - Router to declare routes on.
   * @returns {void}
   */
  register(router) {
    router.use(this.#auth.handler());

    const studentOnly = RbacMiddleware.require(USER_ROLE.STUDENT);
    const vendorOnly = RbacMiddleware.require(USER_ROLE.VENDOR);

    router.post(
      '/',
      studentOnly,
      // Placing an order costs a vendor real preparation; throttling it is what keeps a
      // stuck retry loop from filling somebody's kitchen queue.
      RateLimitMiddleware.of({
        limit: RATE_LIMIT.ORDER_PER_MIN,
        windowMs: 60_000,
        name: 'place-order',
      }),
      ValidationMiddleware.body(OrderingValidator.placeOrder()),
      this.#controller.handle('place')
    );

    router.get(
      '/',
      studentOnly,
      ValidationMiddleware.query(OrderingValidator.listOrders()),
      this.#controller.handle('index')
    );

    router.get('/:orderId', this.#controller.handle('show'));

    router.post(
      '/:orderId/cancel',
      studentOnly,
      ValidationMiddleware.body(OrderingValidator.cancelOrder()),
      this.#controller.handle('cancel')
    );

    router.post('/:orderId/reorder', studentOnly, this.#controller.handle('reorder'));

    router.get('/:orderId/ratings', studentOnly, this.#controller.handle('ratings'));

    router.post(
      '/:orderId/ratings',
      studentOnly,
      ValidationMiddleware.body(OrderingValidator.rate()),
      this.#controller.handle('rate')
    );

    router.post('/:orderId/accept', vendorOnly, this.#controller.handle('accept'));

    router.post(
      '/:orderId/reject',
      vendorOnly,
      ValidationMiddleware.body(OrderingValidator.rejectOrder()),
      this.#controller.handle('reject')
    );

    router.patch(
      '/:orderId/status',
      vendorOnly,
      ValidationMiddleware.body(OrderingValidator.advanceOrder()),
      this.#controller.handle('advance')
    );
  }
}
