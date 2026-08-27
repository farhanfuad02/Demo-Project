/**
 * @file HTTP entry for notifications.
 *
 * @module controllers/notification-controller
 */

import { BaseController } from '../core/base-controller.js';
import { QueryOptions } from '../utils/query-options.js';

/**
 * FR-E2 and FR-E4.
 *
 * @augments BaseController
 */
export class NotificationController extends BaseController {
  /** @type {import('../services/notification-service.js').NotificationService} */
  #notificationService;

  /**
   * @param {object} dependencies - Injected collaborators.
   * @param {import('../services/notification-service.js').NotificationService} dependencies.notificationService -
   *   Notification rules.
   */
  constructor({ notificationService }) {
    super();
    this.#notificationService = notificationService;
  }

  /**
   * Lists the signed-in user's notifications, newest first.
   *
   * @param {import('express').Request} request - Incoming request.
   * @param {import('express').Response} response - Outgoing response.
   * @returns {Promise<import('express').Response>} The response.
   */
  async index(request, response) {
    const page = await this.#notificationService.list(
      this.actor(request).id,
      new QueryOptions({ ...this.query(request), sortBy: 'created_at' })
    );
    return this.okPaginated(response, page);
  }

  /**
   * The unread count for the bell badge.
   *
   * @param {import('express').Request} request - Incoming request.
   * @param {import('express').Response} response - Outgoing response.
   * @returns {Promise<import('express').Response>} The response.
   */
  async unreadCount(request, response) {
    const unread = await this.#notificationService.unreadCount(this.actor(request).id);
    return this.ok(response, { unread });
  }

  /**
   * Marks one notification as read.
   *
   * @param {import('express').Request} request - Incoming request.
   * @param {import('express').Response} response - Outgoing response.
   * @returns {Promise<import('express').Response>} The response.
   */
  async markRead(request, response) {
    const notification = await this.#notificationService.markRead(
      this.actor(request),
      request.params.notificationId
    );
    return this.ok(response, notification.toJSON());
  }

  /**
   * Marks every unread notification as read.
   *
   * @param {import('express').Request} request - Incoming request.
   * @param {import('express').Response} response - Outgoing response.
   * @returns {Promise<import('express').Response>} The response.
   */
  async markAllRead(request, response) {
    const marked = await this.#notificationService.markAllRead(this.actor(request));
    return this.ok(response, { marked });
  }
}
