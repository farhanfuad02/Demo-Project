/**
 * @file Data access for ratings.
 *
 * @module repositories/rating-repository
 */

import { BaseRepository } from '../core/base-repository.js';
import { Rating } from '../models/rating.js';

/**
 * Reads and writes the `ratings` table.
 *
 * @augments BaseRepository<Rating>
 */
export class RatingRepository extends BaseRepository {
  /**
   * @param {import('../config/database/database.js').Database} db - Database client.
   */
  constructor(db) {
    super(db, 'ratings');
  }

  /**
   * Whether this order has already been rated for this target (BR-08).
   *
   * @param {string} orderId - Order in question.
   * @param {string} targetType - Shop or rider.
   * @returns {Promise<boolean>} `true` when a rating already exists.
   */
  async existsForOrder(orderId, targetType) {
    return (await this.findOne({ order_id: orderId, target_type: targetType })) !== null;
  }

  /**
   * Ratings left for one target, newest first when sorted.
   *
   * @param {string} targetType - Shop or rider.
   * @param {string} targetId - Entity rated.
   * @param {import('../utils/query-options.js').QueryOptions} [options] - Sort/page window.
   * @returns {Promise<Rating[]>} Ratings.
   */
  async findForTarget(targetType, targetId, options = undefined) {
    return this.findMany({ target_type: targetType, target_id: targetId }, options);
  }

  /**
   * Ratings a student left on one order, so the UI can hide the forms already used.
   *
   * @param {string} orderId - Order in question.
   * @returns {Promise<Rating[]>} Ratings on this order.
   */
  async findByOrder(orderId) {
    return this.findMany({ order_id: orderId });
  }

  /**
   * Maps a stored row onto a rating.
   *
   * @param {import('@hungry-ju/shared/types').PersistenceRow} row - Row from storage.
   * @returns {Rating} Hydrated rating.
   */
  toModel(row) {
    return Rating.fromPersistence(row);
  }
}
