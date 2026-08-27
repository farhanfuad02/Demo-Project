/**
 * @file Data access for payments.
 *
 * @module repositories/payment-repository
 */

import { BaseRepository } from '../core/base-repository.js';
import { Payment } from '../models/payment.js';

/**
 * Reads and writes the `payments` table.
 *
 * @augments BaseRepository<Payment>
 */
export class PaymentRepository extends BaseRepository {
  /**
   * @param {import('../config/database/database.js').Database} db - Database client.
   */
  constructor(db) {
    super(db, 'payments');
  }

  /**
   * Finds the payment record of an order.
   *
   * @param {string} orderId - Order to look up.
   * @returns {Promise<Payment | null>} Payment, or `null`.
   */
  async findByOrder(orderId) {
    return this.findOne({ order_id: orderId });
  }

  /**
   * Totals collected cash over a window, for the platform analytics page (FR-G5).
   *
   * @param {Date} [since] - Only count payments collected at or after this time.
   * @returns {Promise<{ count: number, totalPoisha: number }>} Payment count and value.
   */
  async collectedTotals(since = undefined) {
    /** @type {import('@hungry-ju/shared/types').Criteria} */
    const criteria = { collected_at: { $ne: null } };
    if (since) {
      criteria.collected_at = { $gte: since.toISOString() };
    }
    const rows = await this.db.findMany(this.table, criteria);
    return {
      count: rows.length,
      totalPoisha: rows.reduce((total, row) => total + Number(row.amount_poisha ?? 0), 0),
    };
  }

  /**
   * Maps a stored row onto a payment.
   *
   * @param {import('@hungry-ju/shared/types').PersistenceRow} row - Row from storage.
   * @returns {Payment} Hydrated payment.
   */
  toModel(row) {
    return Payment.fromPersistence(row);
  }
}
