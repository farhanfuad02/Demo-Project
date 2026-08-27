/**
 * @file Creates and reads in-app notifications.
 *
 * @module services/notification-service
 */

import { NOTIFICATION_TYPE } from '@hungry-ju/shared/enums';
import { BaseService } from '../core/base-service.js';
import { Notification } from '../models/notification.js';
import { QueryOptions } from '../utils/query-options.js';

/**
 * Message templates keyed by event. Holding them in one table means the wording of
 * "your order is on its way" is a one-line change rather than a search across services.
 *
 * @type {Readonly<Record<string, (context: Record<string, unknown>) => { title: string, body: string }>>}
 */
const TEMPLATES = Object.freeze({
  /**
   * @param {Record<string, unknown>} context - Message context.
   * @returns {{ title: string, body: string }} Rendered message.
   */
  [NOTIFICATION_TYPE.ORDER_PLACED]: (context) => ({
    title: 'New order received',
    body: `Order ${context.reference} is waiting for your response.`,
  }),

  /**
   * @param {Record<string, unknown>} context - Message context.
   * @returns {{ title: string, body: string }} Rendered message.
   */
  [NOTIFICATION_TYPE.ORDER_ACCEPTED]: (context) => ({
    title: 'Order accepted',
    body: `${context.shopName} accepted order ${context.reference}.`,
  }),

  /**
   * @param {Record<string, unknown>} context - Message context.
   * @returns {{ title: string, body: string }} Rendered message.
   */
  [NOTIFICATION_TYPE.ORDER_REJECTED]: (context) => ({
    title: 'Order rejected',
    body: `${context.shopName} could not take order ${context.reference}: ${context.reason}`,
  }),

  /**
   * @param {Record<string, unknown>} context - Message context.
   * @returns {{ title: string, body: string }} Rendered message.
   */
  [NOTIFICATION_TYPE.ORDER_PREPARING]: (context) => ({
    title: 'Your food is being prepared',
    body: `${context.shopName} started preparing order ${context.reference}.`,
  }),

  /**
   * @param {Record<string, unknown>} context - Message context.
   * @returns {{ title: string, body: string }} Rendered message.
   */
  [NOTIFICATION_TYPE.ORDER_READY]: (context) => ({
    title: 'Ready for pickup',
    body: `Order ${context.reference} is ready and waiting for a delivery partner.`,
  }),

  /**
   * @param {Record<string, unknown>} context - Message context.
   * @returns {{ title: string, body: string }} Rendered message.
   */
  [NOTIFICATION_TYPE.ORDER_ASSIGNED]: (context) => ({
    title: 'A delivery partner is on the way',
    body: `${context.riderName} is delivering order ${context.reference}.`,
  }),

  /**
   * @param {Record<string, unknown>} context - Message context.
   * @returns {{ title: string, body: string }} Rendered message.
   */
  [NOTIFICATION_TYPE.ORDER_PICKED_UP]: (context) => ({
    title: 'Your food is on its way',
    body: `Order ${context.reference} has been picked up. Keep your PIN ready.`,
  }),

  /**
   * @param {Record<string, unknown>} context - Message context.
   * @returns {{ title: string, body: string }} Rendered message.
   */
  [NOTIFICATION_TYPE.ORDER_DELIVERED]: (context) => ({
    title: 'Delivered',
    body: `Order ${context.reference} was delivered. Enjoy your meal.`,
  }),

  /**
   * @param {Record<string, unknown>} context - Message context.
   * @returns {{ title: string, body: string }} Rendered message.
   */
  [NOTIFICATION_TYPE.ORDER_CANCELLED]: (context) => ({
    title: 'Order cancelled',
    body: `Order ${context.reference} was cancelled. ${context.reason ?? ''}`.trim(),
  }),

  /**
   * @param {Record<string, unknown>} context - Message context.
   * @returns {{ title: string, body: string }} Rendered message.
   */
  [NOTIFICATION_TYPE.VENDOR_APPROVED]: (context) => ({
    title: 'Your shop is approved',
    body: `${context.shopName} can now open and receive orders.`,
  }),

  /**
   * @param {Record<string, unknown>} context - Message context.
   * @returns {{ title: string, body: string }} Rendered message.
   */
  [NOTIFICATION_TYPE.VENDOR_REJECTED]: (context) => ({
    title: 'Shop application rejected',
    body: `${context.shopName} was not approved: ${context.reason}`,
  }),

  /**
   * @returns {{ title: string, body: string }} Rendered message.
   */
  [NOTIFICATION_TYPE.ACCOUNT_SUSPENDED]: () => ({
    title: 'Account suspended',
    body: 'Your account has been suspended. Contact the Hungry_JU team for details.',
  }),
});

/**
 * Creates and reads in-app notifications (FR-E2, FR-E4).
 *
 * @augments BaseService
 */
export class NotificationService extends BaseService {
  /** @type {import('../repositories/notification-repository.js').NotificationRepository} */
  #notificationRepository;

  /** @type {import('../lib/logger.js').Logger} */
  #logger;

  /**
   * @param {object} dependencies - Injected collaborators.
   * @param {import('../repositories/notification-repository.js').NotificationRepository} dependencies.notificationRepository -
   *   Notification storage.
   * @param {import('../lib/logger.js').Logger} dependencies.logger - Fallback output.
   */
  constructor({ notificationRepository, logger }) {
    super();
    this.#notificationRepository = notificationRepository;
    this.#logger = logger;
  }

  /**
   * Sends one notification.
   *
   * Failures are swallowed on purpose: UC-03's exception flow says a cancellation still
   * commits when the notification service is down. A state change must never be undone
   * because a message could not be stored.
   *
   * @param {object} message - Message to send.
   * @param {string} message.userId - Recipient.
   * @param {string} message.type - Event that produced it.
   * @param {Record<string, unknown>} [message.context] - Template values.
   * @param {string | null} [message.relatedOrderId] - Order the message is about.
   * @returns {Promise<Notification | null>} The stored notification, or `null` on failure.
   */
  async notify({ userId, type, context = {}, relatedOrderId = null }) {
    const template = TEMPLATES[type];
    if (!template) {
      this.#logger.warn('No notification template', { type });
      return null;
    }
    try {
      const { title, body } = template(context);
      return await this.#notificationRepository.create(
        new Notification({ userId, type, title, body, relatedOrderId })
      );
    } catch (error) {
      this.#logger.error('Failed to store notification', { type, userId, reason: error.message });
      return null;
    }
  }

  /**
   * Sends the same event to several recipients, such as vendor and rider on a
   * cancellation (FR-E3).
   *
   * @param {string[]} userIds - Recipients; falsy entries are skipped.
   * @param {object} message - Message to send.
   * @param {string} message.type - Event that produced it.
   * @param {Record<string, unknown>} [message.context] - Template values.
   * @param {string | null} [message.relatedOrderId] - Order the message is about.
   * @returns {Promise<void>} Resolves once every message is attempted.
   */
  async notifyAll(userIds, { type, context = {}, relatedOrderId = null }) {
    await Promise.all(
      userIds
        .filter(Boolean)
        .map((userId) => this.notify({ userId, type, context, relatedOrderId }))
    );
  }

  /**
   * Lists a user's notifications, newest first.
   *
   * @param {string} userId - Recipient.
   * @param {QueryOptions} [options] - Page window.
   * @returns {Promise<import('@hungry-ju/shared/types').PaginatedResult>} Page of messages.
   */
  async list(userId, options = new QueryOptions({ sortBy: 'created_at' })) {
    const [items, totalCount] = await Promise.all([
      this.#notificationRepository.findByUser(userId, options),
      this.#notificationRepository.count({ user_id: userId }),
    ]);
    return options.paginate(
      items.map((notification) => notification.toJSON()),
      totalCount
    );
  }

  /**
   * Counts unread messages for the bell badge.
   *
   * @param {string} userId - Recipient.
   * @returns {Promise<number>} Unread count.
   */
  async unreadCount(userId) {
    return this.#notificationRepository.countUnread(userId);
  }

  /**
   * Marks one message as read.
   *
   * @param {import('@hungry-ju/shared/types').Actor} actor - Signed-in user.
   * @param {string} notificationId - Message to mark.
   * @returns {Promise<Notification>} The updated message.
   * @throws {import('../core/errors/app-error.js').ForbiddenError} When it belongs to someone else.
   */
  async markRead(actor, notificationId) {
    const notification = await this.#notificationRepository.findByIdOrFail(
      notificationId,
      'Notification'
    );
    this.assertOwnership(actor, notification.userId);
    notification.markRead();
    return this.#notificationRepository.save(notification);
  }

  /**
   * Marks every unread message of a user as read.
   *
   * @param {import('@hungry-ju/shared/types').Actor} actor - Signed-in user.
   * @returns {Promise<number>} Number of messages marked.
   */
  async markAllRead(actor) {
    return this.#notificationRepository.markAllRead(actor.id);
  }
}
