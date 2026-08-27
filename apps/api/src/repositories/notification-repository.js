/**
 * @file Data access for notifications.
 *
 * @module repositories/notification-repository
 */

import { BaseRepository } from '../core/base-repository.js';
import { Notification } from '../models/notification.js';

/**
 * Reads and writes the `notifications` table.
 *
 * @augments BaseRepository<Notification>
 */
export class NotificationRepository extends BaseRepository {
  /**
   * @param {import('../config/database/database.js').Database} db - Database client.
   */
  constructor(db) {
    super(db, 'notifications');
  }

  /**
   * A user's notification history (FR-E4).
   *
   * @param {string} userId - Recipient.
   * @param {import('../utils/query-options.js').QueryOptions} [options] - Sort/page window.
   * @returns {Promise<Notification[]>} Notifications.
   */
  async findByUser(userId, options = undefined) {
    return this.findMany({ user_id: userId }, options);
  }

  /**
   * Counts unread notifications, for the bell badge.
   *
   * @param {string} userId - Recipient.
   * @returns {Promise<number>} Unread count.
   */
  async countUnread(userId) {
    return this.count({ user_id: userId, is_read: false });
  }

  /**
   * Marks every unread notification of a user as read.
   *
   * @param {string} userId - Recipient.
   * @returns {Promise<number>} Number of notifications marked.
   */
  async markAllRead(userId) {
    const unread = await this.findMany({ user_id: userId, is_read: false });
    for (const notification of unread) {
      notification.markRead();
      await this.save(notification);
    }
    return unread.length;
  }

  /**
   * Maps a stored row onto a notification.
   *
   * @param {import('@hungry-ju/shared/types').PersistenceRow} row - Row from storage.
   * @returns {Notification} Hydrated notification.
   */
  toModel(row) {
    return Notification.fromPersistence(row);
  }
}
