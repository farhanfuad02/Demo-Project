/**
 * @file Route table for `/api/deliveries`.
 *
 * @module routes/delivery-router
 */

import { USER_ROLE } from '@hungry-ju/shared/enums';
import { BaseRouter } from '../core/base-router.js';
import { RbacMiddleware } from '../middleware/rbac-middleware.js';
import { ValidationMiddleware } from '../middleware/validation-middleware.js';
import { CommonValidator } from '../validators/common-validator.js';
import { OrderingValidator } from '../validators/ordering-validator.js';

/**
 * Delivery endpoints. Every one is student-only, because a delivery partner *is* a
 * student in Deliver Mode rather than a separate account type (SRS section 3).
 *
 * @augments BaseRouter
 */
export class DeliveryRouter extends BaseRouter {
  /** @type {import('../controllers/delivery-controller.js').DeliveryController} */
  #controller;

  /** @type {import('../middleware/auth-middleware.js').AuthMiddleware} */
  #auth;

  /**
   * @param {object} dependencies - Injected collaborators.
   * @param {import('../controllers/delivery-controller.js').DeliveryController} dependencies.deliveryController -
   *   Handlers for these routes.
   * @param {import('../middleware/auth-middleware.js').AuthMiddleware} dependencies.authMiddleware -
   *   Sign-in guard.
   */
  constructor({ deliveryController, authMiddleware }) {
    super();
    this.#controller = deliveryController;
    this.#auth = authMiddleware;
  }

  /**
   * Declares the delivery routes.
   *
   * The fixed segments come before `/:deliveryId` so `available`, `active`, and
   * `earnings` are never read as ids.
   *
   * @param {import('express').Router} router - Router to declare routes on.
   * @returns {void}
   */
  register(router) {
    router.use(this.#auth.handler(), RbacMiddleware.require(USER_ROLE.STUDENT));

    router.get(
      '/available',
      ValidationMiddleware.query(CommonValidator.pagination()),
      this.#controller.handle('available')
    );

    router.get('/active', this.#controller.handle('active'));
    router.get('/earnings', this.#controller.handle('earnings'));

    router.post('/:deliveryId/accept', this.#controller.handle('accept'));

    router.patch(
      '/:deliveryId/status',
      ValidationMiddleware.body(OrderingValidator.advanceDelivery()),
      this.#controller.handle('advance')
    );

    router.post(
      '/:deliveryId/complete',
      ValidationMiddleware.body(OrderingValidator.completeDelivery()),
      this.#controller.handle('complete')
    );

    router.post('/:deliveryId/release', this.#controller.handle('release'));
  }
}
