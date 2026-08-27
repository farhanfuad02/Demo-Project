/**
 * @file Data access for shops.
 *
 * @module repositories/shop-repository
 */

import { APPROVAL_STATUS } from '@hungry-ju/shared/enums';
import { BaseRepository } from '../core/base-repository.js';
import { Shop } from '../models/shop.js';

/**
 * Reads and writes the `shops` table.
 *
 * @augments BaseRepository<Shop>
 */
export class ShopRepository extends BaseRepository {
  /**
   * @param {import('../config/database/database.js').Database} db - Database client.
   */
  constructor(db) {
    super(db, 'shops');
  }

  /**
   * Finds the shop a vendor owns. One vendor owns one shop in the MVP (SRS section 3).
   *
   * @param {string} ownerUserId - Vendor account.
   * @returns {Promise<Shop | null>} Shop, or `null` when the vendor has not registered one.
   */
  async findByOwner(ownerUserId) {
    return this.findOne({ owner_user_id: ownerUserId });
  }

  /**
   * Lists shops students may browse (FR-C1).
   *
   * Closed shops are included but flagged, because a student looking for their usual
   * stall should learn it is closed rather than conclude the platform lost it.
   *
   * @param {import('../utils/query-options.js').QueryOptions} [options] - Sort/page window.
   * @returns {Promise<Shop[]>} Approved shops.
   */
  async findApproved(options = undefined) {
    return this.findMany({ approval_status: APPROVAL_STATUS.APPROVED }, options);
  }

  /**
   * Counts approved shops, for the page metadata.
   *
   * @returns {Promise<number>} Approved shop count.
   */
  async countApproved() {
    return this.count({ approval_status: APPROVAL_STATUS.APPROVED });
  }

  /**
   * Lists shops waiting for an admin decision (FR-G1).
   *
   * @param {import('../utils/query-options.js').QueryOptions} [options] - Sort/page window.
   * @returns {Promise<Shop[]>} Pending shops.
   */
  async findPending(options = undefined) {
    return this.findMany({ approval_status: APPROVAL_STATUS.PENDING }, options);
  }

  /**
   * Finds approved shops whose name or location contains the fragment (FR-C2).
   *
   * @param {string} fragment - Partial name typed by the student.
   * @param {import('../utils/query-options.js').QueryOptions} [options] - Sort/page window.
   * @returns {Promise<Shop[]>} Matching shops.
   */
  async searchApproved(fragment, options = undefined) {
    const byName = await this.findMany(
      { approval_status: APPROVAL_STATUS.APPROVED, shop_name: { $like: fragment } },
      options
    );
    if (byName.length > 0) {
      return byName;
    }
    return this.findMany(
      { approval_status: APPROVAL_STATUS.APPROVED, bot_tola_location: { $like: fragment } },
      options
    );
  }

  /**
   * Maps a stored row onto a shop.
   *
   * @param {import('@hungry-ju/shared/types').PersistenceRow} row - Row from storage.
   * @returns {Shop} Hydrated shop.
   */
  toModel(row) {
    return Shop.fromPersistence(row);
  }
}
