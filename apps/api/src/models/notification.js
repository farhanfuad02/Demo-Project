/**
 * @file In-app notification.
 *
 * @module models/notification
 */

import { BaseModel } from '../core/base-model.js';
import { ValidationError } from '../core/errors/app-error.js';

/**
 * A message addressed to one user (FR-E2, FR-E4).
 *
 * Storing notifications rather than only pushing them means a student who had the app
 * closed still learns their order was rejected, and it gives Phase 2 a place to hang a
 * push sender behind the same interface (SRS section 10).
 *
 * @augments BaseModel
 */
export class Notification extends BaseModel {
  /** @type {string} */
  #userId;

  /** @type {string} */
  #type;

  /** @type {string} */
  #title;

  /** @type {string} */
  #body;

  /** @type {string | null} */
  #relatedOrderId;

  /** @type {boolean} */
  #isRead;

  /**
   * @param {object} attributes - Notification columns.
   * @param {string | null} [attributes.id] - Primary key.
   * @param {Date | string | null} [attributes.createdAt] - Creation timestamp.
   * @param {Date | string | null} [attributes.updatedAt] - Last write timestamp.
   * @param {string} attributes.userId - Recipient.
   * @param {string} attributes.type - Event that produced it.
   * @param {string} attributes.title - Headline.
   * @param {string} attributes.body - Message text.
   * @param {string | null} [attributes.relatedOrderId] - Order the message is about.
   * @param {boolean} [attributes.isRead] - Whether the recipient has seen it.
   */
  constructor({
    id,
    createdAt,
    updatedAt,
    userId,
    type,
    title,
    body,
    relatedOrderId = null,
    isRead = false,
  }) {
    super({ id, createdAt, updatedAt });
    this.#userId = userId;
    this.#type = type;
    this.#title = title;
    this.#body = body;
    this.#relatedOrderId = relatedOrderId;
    this.#isRead = isRead;
  }

  /**
   * Recipient.
   *
   * @returns {string} User id.
   */
  get userId() {
    return this.#userId;
  }

  /**
   * Event that produced this message.
   *
   * @returns {string} Notification type.
   */
  get type() {
    return this.#type;
  }

  /**
   * Whether the recipient has seen it.
   *
   * @returns {boolean} `true` once read.
   */
  get isRead() {
    return this.#isRead;
  }

  /**
   * Marks the message as read.
   *
   * @returns {void}
   */
  markRead() {
    this.#isRead = true;
    this.touch();
  }

  /**
   * Checks own invariants.
   *
   * @returns {void} Returns nothing when the entity is consistent.
   * @throws {ValidationError} When the recipient or the text is missing.
   */
  validate() {
    if (!this.#userId) {
      throw new ValidationError('A notification must have a recipient.');
    }
    if (!this.#title || !this.#body) {
      throw new ValidationError('A notification must have a title and a body.');
    }
  }

  /**
   * Row shape for the `notifications` table.
   *
   * @returns {import('@hungry-ju/shared/types').PersistenceRow} Row for the repository.
   */
  toPersistence() {
    return {
      ...this.baseRow(),
      user_id: this.#userId,
      type: this.#type,
      title: this.#title,
      body: this.#body,
      related_order_id: this.#relatedOrderId,
      is_read: this.#isRead,
    };
  }

  /**
   * Client-safe projection.
   *
   * @returns {Record<string, unknown>} Serialisable notification.
   */
  toJSON() {
    return {
      id: this.id,
      type: this.#type,
      title: this.#title,
      body: this.#body,
      relatedOrderId: this.#relatedOrderId,
      isRead: this.#isRead,
      createdAt: this.createdAt.toISOString(),
    };
  }

  /**
   * Rebuilds a notification from a stored row.
   *
   * @param {import('@hungry-ju/shared/types').PersistenceRow} row - Row from storage.
   * @returns {Notification} Hydrated notification.
   */
  static fromPersistence(row) {
    return new Notification({
      id: row.id,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      userId: row.user_id,
      type: row.type,
      title: row.title,
      body: row.body,
      relatedOrderId: row.related_order_id,
      isRead: Boolean(row.is_read),
    });
  }
}
