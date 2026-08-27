/**
 * @file Route table for `/api/notifications`.
 *
 * @module routes/notification-router
 */

import { BaseRouter } from '../core/base-router.js';
import { ValidationMiddleware } from '../middleware/validation-middleware.js';
import { CommonValidator } from '../validators/common-validator.js';

/**
 * Notification endpoints (FR-E4).
 *
 * @augments BaseRouter
 */
export class NotificationRouter extends BaseRouter {
  /** @type {import('../controllers/notification-controller.js').NotificationController} */
  #controller;

  /** @type {import('../middleware/auth-middleware.js').AuthMiddleware} */
  #auth;

  /**
   * @param {object} dependencies - Injected collaborators.
   * @param {import('../controllers/notification-controller.js').NotificationController} dependencies.notificationController -
   *   Handlers for these routes.
   * @param {import('../middleware/auth-middleware.js').AuthMiddleware} dependencies.authMiddleware -
   *   Sign-in guard.
   */
  constructor({ notificationController, authMiddleware }) {
    super();
    this.#controller = notificationController;
    this.#auth = authMiddleware;
  }

  /**
   * Declares the notification routes.
   *
   * @param {import('express').Router} router - Router to declare routes on.
   * @returns {void}
   */
  register(router) {
    router.use(this.#auth.handler());

    router.get(
      '/',
      ValidationMiddleware.query(CommonValidator.pagination()),
      this.#controller.handle('index')
    );

    router.get('/unread-count', this.#controller.handle('unreadCount'));
    router.post('/read-all', this.#controller.handle('markAllRead'));
    router.post('/:notificationId/read', this.#controller.handle('markRead'));
  }
}
