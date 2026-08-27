/**
 * @file Rating left after a completed delivery.
 *
 * @module models/rating
 */

import { RATING_TARGET } from '@hungry-ju/shared/enums';
import { BaseModel } from '../core/base-model.js';
import { ValidationError } from '../core/errors/app-error.js';

/**
 * One rating: of the shop, or of the delivery partner.
 *
 * Both kinds share a table because they share every column and every rule (BR-08: only
 * on a delivered order, once per order per target). Two near-identical tables would
 * mean writing the "once per order" constraint twice and getting it right once.
 *
 * @augments BaseModel
 */
export class Rating extends BaseModel {
  /** @type {string} */
  #orderId;

  /** @type {string} */
  #raterUserId;

  /** @type {string} */
  #targetType;

  /** @type {string} */
  #targetId;

  /** @type {number} */
  #stars;

  /** @type {string | null} */
  #comment;

  /**
   * @param {object} attributes - Rating columns.
   * @param {string | null} [attributes.id] - Primary key.
   * @param {Date | string | null} [attributes.createdAt] - Creation timestamp.
   * @param {Date | string | null} [attributes.updatedAt] - Last write timestamp.
   * @param {string} attributes.orderId - Order being rated.
   * @param {string} attributes.raterUserId - Student leaving the rating.
   * @param {string} attributes.targetType - Whether the shop or the rider is rated.
   * @param {string} attributes.targetId - Shop id, or rider user id.
   * @param {number} attributes.stars - Rating from 1 to 5.
   * @param {string | null} [attributes.comment] - Optional free text.
   */
  constructor({
    id,
    createdAt,
    updatedAt,
    orderId,
    raterUserId,
    targetType,
    targetId,
    stars,
    comment = null,
  }) {
    super({ id, createdAt, updatedAt });
    this.#orderId = orderId;
    this.#raterUserId = raterUserId;
    this.#targetType = targetType;
    this.#targetId = targetId;
    this.#stars = stars;
    this.#comment = comment;
  }

  /**
   * Order being rated.
   *
   * @returns {string} Order id.
   */
  get orderId() {
    return this.#orderId;
  }

  /**
   * Student leaving the rating.
   *
   * @returns {string} User id.
   */
  get raterUserId() {
    return this.#raterUserId;
  }

  /**
   * Whether the shop or the rider is being rated.
   *
   * @returns {string} Target type.
   */
  get targetType() {
    return this.#targetType;
  }

  /**
   * Entity being rated.
   *
   * @returns {string} Shop id or rider user id.
   */
  get targetId() {
    return this.#targetId;
  }

  /**
   * The score.
   *
   * @returns {number} Stars from 1 to 5.
   */
  get stars() {
    return this.#stars;
  }

  /**
   * Optional free text.
   *
   * @returns {string | null} Comment.
   */
  get comment() {
    return this.#comment;
  }

  /**
   * Removes abusive text while keeping the score (FR-G4).
   *
   * The stars stay because deleting the whole row would silently change a vendor's
   * average, which is not what moderating a comment is supposed to do.
   *
   * @returns {void}
   */
  redactComment() {
    this.#comment = null;
    this.touch();
  }

  /**
   * Checks own invariants.
   *
   * @returns {void} Returns nothing when the entity is consistent.
   * @throws {ValidationError} When the score or target is invalid.
   */
  validate() {
    if (!this.#orderId || !this.#raterUserId || !this.#targetId) {
      throw new ValidationError('A rating must record the order, the rater, and the target.');
    }
    if (!Object.values(RATING_TARGET).includes(this.#targetType)) {
      throw new ValidationError(`Unknown rating target "${this.#targetType}".`);
    }
    if (!Number.isInteger(this.#stars) || this.#stars < 1 || this.#stars > 5) {
      throw new ValidationError('A rating must be a whole number of stars from 1 to 5.');
    }
  }

  /**
   * Row shape for the `ratings` table.
   *
   * @returns {import('@hungry-ju/shared/types').PersistenceRow} Row for the repository.
   */
  toPersistence() {
    return {
      ...this.baseRow(),
      order_id: this.#orderId,
      rater_user_id: this.#raterUserId,
      target_type: this.#targetType,
      target_id: this.#targetId,
      stars: this.#stars,
      comment: this.#comment,
    };
  }

  /**
   * Client-safe projection.
   *
   * @returns {Record<string, unknown>} Serialisable rating.
   */
  toJSON() {
    return {
      id: this.id,
      orderId: this.#orderId,
      raterUserId: this.#raterUserId,
      targetType: this.#targetType,
      targetId: this.#targetId,
      stars: this.#stars,
      comment: this.#comment,
      createdAt: this.createdAt.toISOString(),
    };
  }

  /**
   * Rebuilds a rating from a stored row.
   *
   * @param {import('@hungry-ju/shared/types').PersistenceRow} row - Row from storage.
   * @returns {Rating} Hydrated rating.
   */
  static fromPersistence(row) {
    return new Rating({
      id: row.id,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      orderId: row.order_id,
      raterUserId: row.rater_user_id,
      targetType: row.target_type,
      targetId: row.target_id,
      stars: row.stars,
      comment: row.comment,
    });
  }
}
