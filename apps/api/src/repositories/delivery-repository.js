/**
 * @file Data access for deliveries, including the concurrency-critical claim.
 *
 * @module repositories/delivery-repository
 */

import { DELIVERY_STATUS } from '@hungry-ju/shared/enums';
import { BaseRepository } from '../core/base-repository.js';
import { Delivery } from '../models/delivery.js';

/**
 * Reads and writes the `deliveries` table.
 *
 * @augments BaseRepository<Delivery>
 */
export class DeliveryRepository extends BaseRepository {
  /**
   * @param {import('../config/database/database.js').Database} db - Database client.
   */
  constructor(db) {
    super(db, 'deliveries');
  }

  /**
   * Finds the delivery attached to an order. There is at most one (SRS section 7).
   *
   * @param {string} orderId - Order to look up.
   * @returns {Promise<Delivery | null>} Delivery, or `null`.
   */
  async findByOrder(orderId) {
    return this.findOne({ order_id: orderId });
  }

  /**
   * The open feed a delivery partner sees (FR-D2).
   *
   * The student's own orders are excluded here rather than in the UI, because BR-06 is
   * a rule and not a display preference: a rider who guessed a delivery id must not be
   * able to claim their own order by calling the endpoint directly.
   *
   * @param {string} riderUserId - Rider viewing the feed.
   * @param {import('../utils/query-options.js').QueryOptions} [options] - Sort/page window.
   * @returns {Promise<Delivery[]>} Claimable deliveries.
   */
  async findAvailableFor(riderUserId, options = undefined) {
    return this.findMany(
      {
        status: DELIVERY_STATUS.AVAILABLE,
        rider_user_id: null,
        student_id: { $ne: riderUserId },
      },
      options
    );
  }

  /**
   * The delivery a rider is currently carrying (FR-D4).
   *
   * @param {string} riderUserId - Rider to check.
   * @returns {Promise<Delivery | null>} Active delivery, or `null` when free.
   */
  async findActiveByRider(riderUserId) {
    return this.findOne({
      rider_user_id: riderUserId,
      status: {
        $in: [
          DELIVERY_STATUS.ASSIGNED,
          DELIVERY_STATUS.HEADING_TO_VENDOR,
          DELIVERY_STATUS.PICKED_UP,
        ],
      },
    });
  }

  /**
   * A rider's completed deliveries (FR-D7).
   *
   * @param {string} riderUserId - Rider whose history to list.
   * @param {import('../utils/query-options.js').QueryOptions} [options] - Sort/page window.
   * @returns {Promise<Delivery[]>} Completed deliveries.
   */
  async findCompletedByRider(riderUserId, options = undefined) {
    return this.findMany(
      { rider_user_id: riderUserId, status: DELIVERY_STATUS.DELIVERED },
      options
    );
  }

  /**
   * Binds a delivery to a rider, and only if nobody else got there first (FR-D3).
   *
   * This single call is where first-accept-wins actually lives. The write is applied
   * only while the row still reads `available` with no rider, so two simultaneous
   * accepts cannot both succeed — the loser gets `null` and, one layer up, a 409
   * (UC-02 alternate flow A1, NFR-11, risk R4). Reading the row and then writing it in
   * two steps would leave exactly the gap this closes.
   *
   * @param {string} deliveryId - Delivery being claimed.
   * @param {string} riderUserId - Rider claiming it.
   * @returns {Promise<Delivery | null>} The claimed delivery, or `null` when already taken.
   */
  async claim(deliveryId, riderUserId) {
    const row = await this.db.updateWhere(
      this.table,
      deliveryId,
      { status: DELIVERY_STATUS.AVAILABLE, rider_user_id: null },
      {
        status: DELIVERY_STATUS.ASSIGNED,
        rider_user_id: riderUserId,
        accepted_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }
    );
    return row ? this.toModel(row) : null;
  }

  /**
   * Sums what a rider has earned from completed deliveries (FR-D7).
   *
   * @param {string} riderUserId - Rider to total.
   * @param {Date} [since] - Only count deliveries completed at or after this time.
   * @returns {Promise<{ count: number, totalPoisha: number }>} Delivery count and earnings.
   */
  async earningsFor(riderUserId, since = undefined) {
    /** @type {import('@hungry-ju/shared/types').Criteria} */
    const criteria = { rider_user_id: riderUserId, status: DELIVERY_STATUS.DELIVERED };
    if (since) {
      criteria.delivered_at = { $gte: since.toISOString() };
    }
    const rows = await this.db.findMany(this.table, criteria);
    return {
      count: rows.length,
      totalPoisha: rows.reduce((total, row) => total + Number(row.earning_poisha ?? 0), 0),
    };
  }

  /**
   * Maps a stored row onto a delivery.
   *
   * @param {import('@hungry-ju/shared/types').PersistenceRow} row - Row from storage.
   * @returns {Delivery} Hydrated delivery.
   */
  toModel(row) {
    return Delivery.fromPersistence(row);
  }
}
