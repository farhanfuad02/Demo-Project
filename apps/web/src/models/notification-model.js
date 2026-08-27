/**
 * @file Notification, as the client sees it.
 *
 * @module models/notification-model
 */

import { BaseViewModel } from './base-view-model.js';

/**
 * One in-app message (FR-E4).
 *
 * @augments BaseViewModel
 */
export class NotificationModel extends BaseViewModel {
  /**
   * Headline.
   *
   * @returns {string} Title.
   */
  get title() {
    return /** @type {string} */ (this.raw.title ?? '');
  }

  /**
   * Message text.
   *
   * @returns {string} Body.
   */
  get body() {
    return /** @type {string} */ (this.raw.body ?? '');
  }

  /**
   * Whether the recipient has seen it.
   *
   * @returns {boolean} `true` once read.
   */
  get isRead() {
    return Boolean(this.raw.isRead);
  }

  /**
   * The order this message is about, when there is one.
   *
   * @returns {string | null} Order id.
   */
  get relatedOrderId() {
    return /** @type {string | null} */ (this.raw.relatedOrderId ?? null);
  }

  /**
   * When it arrived.
   *
   * @returns {Date | null} Timestamp.
   */
  get createdAt() {
    return this.raw.createdAt ? new Date(/** @type {string} */ (this.raw.createdAt)) : null;
  }

  /**
   * Age in words, because "3 minutes ago" reads faster than a timestamp on a phone.
   *
   * @returns {string} Relative time.
   */
  get relativeTime() {
    const at = this.createdAt;
    if (!at) {
      return '';
    }
    const seconds = Math.max(0, Math.round((Date.now() - at.getTime()) / 1000));
    if (seconds < 60) {
      return 'just now';
    }
    const minutes = Math.round(seconds / 60);
    if (minutes < 60) {
      return `${minutes} min ago`;
    }
    const hours = Math.round(minutes / 60);
    if (hours < 24) {
      return `${hours} h ago`;
    }
    return `${Math.round(hours / 24)} d ago`;
  }
}
