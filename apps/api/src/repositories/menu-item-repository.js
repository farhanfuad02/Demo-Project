/**
 * @file Data access for menu items.
 *
 * @module repositories/menu-item-repository
 */

import { BaseRepository } from '../core/base-repository.js';
import { MenuItem } from '../models/menu-item.js';

/**
 * Reads and writes the `menu_items` table.
 *
 * @augments BaseRepository<MenuItem>
 */
export class MenuItemRepository extends BaseRepository {
  /**
   * @param {import('../config/database/database.js').Database} db - Database client.
   */
  constructor(db) {
    super(db, 'menu_items');
  }

  /**
   * Lists a shop's menu.
   *
   * @param {string} shopId - Owning shop.
   * @param {object} [filters] - Optional narrowing.
   * @param {boolean} [filters.availableOnly] - Hide sold-out items.
   * @param {string} [filters.category] - Restrict to one category.
   * @returns {Promise<MenuItem[]>} Menu items.
   */
  async findByShop(shopId, { availableOnly = false, category = undefined } = {}) {
    /** @type {import('@hungry-ju/shared/types').Criteria} */
    const criteria = { shop_id: shopId };
    if (availableOnly) {
      criteria.is_available = true;
    }
    if (category) {
      criteria.category = category;
    }
    return this.findMany(criteria);
  }

  /**
   * Loads several items at once, which is what checkout re-validation needs (UC-01
   * step 6) without one query per line.
   *
   * @param {string[]} ids - Menu item ids.
   * @returns {Promise<Map<string, MenuItem>>} Items keyed by id; missing ids are absent.
   */
  async findByIds(ids) {
    const items = await this.findMany({ id: { $in: ids } });
    return new Map(items.map((item) => [item.id, item]));
  }

  /**
   * Finds available items whose name or description contains the fragment (FR-C2).
   *
   * @param {string} fragment - Partial name typed by the student.
   * @param {string[]} [shopIds] - Restrict to these shops; omit to search everywhere.
   * @returns {Promise<MenuItem[]>} Matching items.
   */
  async search(fragment, shopIds = undefined) {
    /** @type {import('@hungry-ju/shared/types').Criteria} */
    const criteria = { is_available: true, name: { $like: fragment } };
    if (shopIds) {
      criteria.shop_id = { $in: shopIds };
    }
    const byName = await this.findMany(criteria);

    // Descriptions are searched only when the name search comes up empty: a student
    // typing "khich" wants Khichuri first, not every dish that mentions it.
    if (byName.length > 0) {
      return byName;
    }
    const descriptionCriteria = { ...criteria, name: undefined, description: { $like: fragment } };
    delete descriptionCriteria.name;
    return this.findMany(descriptionCriteria);
  }

  /**
   * Removes every item of a shop, used when a shop is deleted.
   *
   * @param {string} shopId - Owning shop.
   * @returns {Promise<number>} Number of items removed.
   */
  async deleteByShop(shopId) {
    return this.db.deleteWhere(this.table, { shop_id: shopId });
  }

  /**
   * Maps a stored row onto a menu item.
   *
   * @param {import('@hungry-ju/shared/types').PersistenceRow} row - Row from storage.
   * @returns {MenuItem} Hydrated item.
   */
  toModel(row) {
    return MenuItem.fromPersistence(row);
  }
}
