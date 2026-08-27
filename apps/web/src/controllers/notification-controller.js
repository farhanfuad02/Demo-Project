/**
 * @file Client controller for notifications.
 *
 * @module controllers/notification-controller
 */

import { REALTIME } from '@hungry-ju/shared/constants';
import { BaseController } from './base-controller.js';
import { NotificationModel } from '../models/notification-model.js';

/**
 * The notification bell and its list (FR-E2, FR-E4).
 *
 * Only the unread count is polled in the background; the list itself is fetched when
 * somebody actually opens it. Polling a full list every few seconds to render one badge
 * is the kind of thing that makes a page feel heavy for no visible benefit.
 *
 * @augments BaseController
 */
export class NotificationController extends BaseController {
  /** @type {ReturnType<typeof setInterval> | null} */
  #timer = null;

  /**
   * @param {import('../services/api-client.js').ApiClient} api - API gateways.
   */
  constructor(api) {
    super(api, { notifications: [], unread: 0 });
  }

  /**
   * Loads the notification list.
   *
   * @returns {Promise<NotificationModel[] | null>} Notifications.
   */
  async load() {
    return this.run(async () => {
      const page = await this.api.notifications.list();
      const notifications = NotificationModel.listFrom(page.data);
      this.setState({ notifications });
      return notifications;
    });
  }

  /**
   * Refreshes the unread badge.
   *
   * @returns {Promise<number>} Unread count.
   */
  async refreshBadge() {
    try {
      const { unread } = await this.api.notifications.unreadCount();
      this.setState({ unread });
      return unread;
    } catch {
      // A badge that fails to refresh is not worth interrupting anyone over.
      return this.state.unread;
    }
  }

  /**
   * Starts polling the badge.
   *
   * @returns {void}
   */
  startPolling() {
    this.stopPolling();
    void this.refreshBadge();
    this.#timer = setInterval(() => {
      void this.refreshBadge();
    }, REALTIME.POLL_INTERVAL_MS * 2);
  }

  /**
   * Stops polling the badge.
   *
   * @returns {void}
   */
  stopPolling() {
    if (this.#timer) {
      clearInterval(this.#timer);
      this.#timer = null;
    }
  }

  /**
   * Marks one notification as read.
   *
   * @param {string} notificationId - Notification to mark.
   * @returns {Promise<void>} Resolves once marked.
   */
  async markRead(notificationId) {
    await this.api.notifications.markRead(notificationId);
    await Promise.all([this.load(), this.refreshBadge()]);
  }

  /**
   * Marks every notification as read.
   *
   * @returns {Promise<void>} Resolves once marked.
   */
  async markAllRead() {
    await this.api.notifications.markAllRead();
    await Promise.all([this.load(), this.refreshBadge()]);
  }
}
