/**
 * @file The cart, as the client sees it.
 *
 * @module models/cart-model
 */

import { BaseViewModel } from './base-view-model.js';
import { ShopModel } from './shop-model.js';

/**
 * One line of the cart.
 *
 * @augments BaseViewModel
 */
export class CartLineModel extends BaseViewModel {
  /**
   * Menu item this line refers to.
   *
   * @returns {string} Menu item id.
   */
  get menuItemId() {
    return /** @type {string} */ (this.raw.menuItemId);
  }

  /**
   * Item name.
   *
   * @returns {string} Name.
   */
  get itemName() {
    return /** @type {string} */ (this.raw.itemName ?? '');
  }

  /**
   * Price per unit in taka.
   *
   * @returns {number} Unit price.
   */
  get unitPrice() {
    return Number(this.raw.unitPrice ?? 0);
  }

  /**
   * Number of units.
   *
   * @returns {number} Quantity.
   */
  get quantity() {
    return Number(this.raw.quantity ?? 0);
  }

  /**
   * Price for this line.
   *
   * @returns {number} Line total in taka.
   */
  get lineTotal() {
    return Number(this.raw.lineTotal ?? 0);
  }
}

/**
 * The student's single cart, with the money lines the checkout screen shows.
 *
 * The totals are the server's own numbers rather than a client-side sum: the delivery
 * fee is admin-tunable (FR-G6), and a client that computes its own total will disagree
 * with the order it just placed the first time an admin changes it.
 *
 * @augments BaseViewModel
 */
export class CartModel extends BaseViewModel {
  /**
   * An empty cart, for the state before the first load.
   *
   * @returns {CartModel} An empty cart.
   */
  static empty() {
    return new CartModel({ items: [], itemCount: 0, subtotal: 0, deliveryFee: 0, total: 0 });
  }

  /**
   * The lines.
   *
   * @returns {CartLineModel[]} Cart lines.
   */
  get items() {
    return CartLineModel.listFrom(/** @type {unknown[]} */ (this.raw.items));
  }

  /**
   * Whether the cart holds nothing.
   *
   * @returns {boolean} `true` when empty.
   */
  get isEmpty() {
    return this.items.length === 0;
  }

  /**
   * Total units across all lines, for the badge.
   *
   * @returns {number} Unit count.
   */
  get itemCount() {
    return Number(this.raw.itemCount ?? 0);
  }

  /**
   * Sum of the lines.
   *
   * @returns {number} Subtotal in taka.
   */
  get subtotal() {
    return Number(this.raw.subtotal ?? 0);
  }

  /**
   * Delivery fee in force.
   *
   * @returns {number} Fee in taka.
   */
  get deliveryFee() {
    return Number(this.raw.deliveryFee ?? 0);
  }

  /**
   * What the customer will pay in cash.
   *
   * @returns {number} Total in taka.
   */
  get total() {
    return Number(this.raw.total ?? 0);
  }

  /**
   * The vendor this cart is bound to (BR-03).
   *
   * @returns {ShopModel | null} Shop, or `null` while the cart is empty.
   */
  get shop() {
    return ShopModel.maybeFrom(this.raw.shop);
  }

  /**
   * How many of one item the cart already holds, so a menu card can show a stepper
   * instead of an Add button.
   *
   * @param {string} menuItemId - Item to look for.
   * @returns {number} Quantity in the cart; `0` when absent.
   */
  quantityOf(menuItemId) {
    return this.items.find((line) => line.menuItemId === menuItemId)?.quantity ?? 0;
  }

  /**
   * Whether adding an item from this shop would collide with BR-03.
   *
   * @param {string} shopId - Shop the item belongs to.
   * @returns {boolean} `true` when the cart holds another vendor's items.
   */
  wouldConflictWith(shopId) {
    return !this.isEmpty && this.shop?.id !== shopId;
  }
}
