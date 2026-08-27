/**
 * @file Shop and menu item, as the client sees them.
 *
 * @module models/shop-model
 */

import { APPROVAL_STATUS } from '@hungry-ju/shared/enums';
import { BaseViewModel } from './base-view-model.js';

/**
 * One dish on a menu.
 *
 * @augments BaseViewModel
 */
export class MenuItemModel extends BaseViewModel {
  /**
   * Dish name.
   *
   * @returns {string} Name.
   */
  get name() {
    return /** @type {string} */ (this.raw.name ?? '');
  }

  /**
   * Short description.
   *
   * @returns {string} Description; empty when none.
   */
  get description() {
    return /** @type {string} */ (this.raw.description ?? '');
  }

  /**
   * Price in taka.
   *
   * @returns {number} Price.
   */
  get price() {
    return Number(this.raw.price ?? 0);
  }

  /**
   * Menu category.
   *
   * @returns {string} Category.
   */
  get category() {
    return /** @type {string} */ (this.raw.category ?? 'General');
  }

  /**
   * Whether the item can be ordered right now (BR-07).
   *
   * @returns {boolean} `true` when available.
   */
  get isAvailable() {
    return Boolean(this.raw.isAvailable);
  }

  /**
   * Typical preparation time.
   *
   * @returns {number} Minutes.
   */
  get prepTimeMin() {
    return Number(this.raw.prepTimeMin ?? 0);
  }

  /**
   * Owning shop.
   *
   * @returns {string} Shop id.
   */
  get shopId() {
    return /** @type {string} */ (this.raw.shopId);
  }

  /**
   * The shop this dish came back with, on a search result.
   *
   * @returns {ShopModel | null} Shop, or `null` when the payload had none.
   */
  get shop() {
    return ShopModel.maybeFrom(this.raw.shop);
  }

  /**
   * Groups a menu by category, preserving the order the categories first appear in.
   *
   * A vendor arranges their menu deliberately; re-sorting it alphabetically would put
   * drinks above the rice they exist to accompany.
   *
   * @param {MenuItemModel[]} items - Items to group.
   * @returns {Array<{ category: string, items: MenuItemModel[] }>} Grouped menu.
   */
  static groupByCategory(items) {
    /** @type {Map<string, MenuItemModel[]>} */
    const groups = new Map();
    for (const item of items) {
      if (!groups.has(item.category)) {
        groups.set(item.category, []);
      }
      groups.get(item.category).push(item);
    }
    return [...groups.entries()].map(([category, grouped]) => ({ category, items: grouped }));
  }
}

/**
 * A Bot Tola shop.
 *
 * @augments BaseViewModel
 */
export class ShopModel extends BaseViewModel {
  /**
   * Display name.
   *
   * @returns {string} Shop name.
   */
  get shopName() {
    return /** @type {string} */ (this.raw.shopName ?? '');
  }

  /**
   * Stall location within Bot Tola.
   *
   * @returns {string} Location.
   */
  get location() {
    return /** @type {string} */ (this.raw.botTolaLocation ?? '');
  }

  /**
   * Contact number.
   *
   * @returns {string} Phone.
   */
  get contactPhone() {
    return /** @type {string} */ (this.raw.contactPhone ?? '');
  }

  /**
   * Opening hours as the vendor wrote them.
   *
   * @returns {string} Hours.
   */
  get operatingHours() {
    return /** @type {string} */ (this.raw.operatingHours ?? '');
  }

  /**
   * Short description.
   *
   * @returns {string} Description.
   */
  get description() {
    return /** @type {string} */ (this.raw.description ?? '');
  }

  /**
   * Whether the shop is currently open.
   *
   * @returns {boolean} `true` when open.
   */
  get isOpen() {
    return Boolean(this.raw.isOpen);
  }

  /**
   * Whether students may order right now (BR-07).
   *
   * @returns {boolean} `true` when approved and open.
   */
  get canReceiveOrders() {
    return Boolean(this.raw.canReceiveOrders);
  }

  /**
   * Review outcome.
   *
   * @returns {string} Approval status.
   */
  get approvalStatus() {
    return /** @type {string} */ (this.raw.approvalStatus);
  }

  /**
   * Whether an admin has approved this shop.
   *
   * @returns {boolean} `true` when approved.
   */
  get isApproved() {
    return this.approvalStatus === APPROVAL_STATUS.APPROVED;
  }

  /**
   * Whether the application is still waiting on an admin.
   *
   * @returns {boolean} `true` while pending.
   */
  get isPending() {
    return this.approvalStatus === APPROVAL_STATUS.PENDING;
  }

  /**
   * Reason recorded with the admin's decision.
   *
   * @returns {string} Reason; empty when none.
   */
  get decisionReason() {
    return /** @type {string} */ (this.raw.decisionReason ?? '');
  }

  /**
   * Mean rating.
   *
   * @returns {number} Average stars.
   */
  get rating() {
    return Number(this.raw.ratingAverage ?? 0);
  }

  /**
   * Number of ratings received.
   *
   * @returns {number} Rating count.
   */
  get ratingCount() {
    return Number(this.raw.ratingCount ?? 0);
  }

  /**
   * The rating as a short label, honest about having none yet.
   *
   * @returns {string} For example `4.5 (12)`, or `New`.
   */
  get ratingLabel() {
    if (this.ratingCount === 0) {
      return 'New';
    }
    return `${this.rating.toFixed(1)} (${this.ratingCount})`;
  }

  /**
   * The menu, when this payload carried one.
   *
   * @returns {MenuItemModel[]} Menu items.
   */
  get menu() {
    return MenuItemModel.listFrom(/** @type {unknown[]} */ (this.raw.menu));
  }

  /**
   * Owner account, when the payload carried one (admin queue).
   *
   * @returns {Record<string, unknown> | null} Owner.
   */
  get owner() {
    return /** @type {Record<string, unknown> | null} */ (this.raw.owner ?? null);
  }

  /**
   * Why the shop cannot take an order, for a banner that says something useful.
   *
   * @returns {string | null} Explanation, or `null` when it can.
   */
  get closedReason() {
    if (this.canReceiveOrders) {
      return null;
    }
    if (!this.isApproved) {
      return 'This shop is not approved yet.';
    }
    return 'This shop is closed right now. You can browse the menu, but not order.';
  }
}
