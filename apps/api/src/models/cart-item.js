/**
 * @file One line of a shopping cart.
 *
 * @module models/cart-item
 */

import { BaseModel } from '../core/base-model.js';
import { ValidationError } from '../core/errors/app-error.js';
import { Money } from '../utils/money.js';

/**
 * A quantity of one menu item held in a cart.
 *
 * The name and price are copied from the menu so the cart can be rendered without a
 * second round-trip, but they are refreshed at checkout: what the student sees in the
 * cart is a convenience, and what they pay is re-read from the menu (UC-01 step 6).
 *
 * @augments BaseModel
 */
export class CartItem extends BaseModel {
  /** @type {string | null} */
  #cartId;

  /** @type {string} */
  #menuItemId;

  /** @type {string} */
  #itemName;

  /** @type {Money} */
  #unitPrice;

  /** @type {number} */
  #quantity;

  /**
   * @param {object} attributes - Line columns.
   * @param {string | null} [attributes.id] - Primary key.
   * @param {Date | string | null} [attributes.createdAt] - Creation timestamp.
   * @param {Date | string | null} [attributes.updatedAt] - Last write timestamp.
   * @param {string | null} [attributes.cartId] - Owning cart.
   * @param {string} attributes.menuItemId - Menu item this line refers to.
   * @param {string} attributes.itemName - Item name at the time it was added.
   * @param {Money} attributes.unitPrice - Item price at the time it was added.
   * @param {number} [attributes.quantity] - Number of units.
   */
  constructor({
    id,
    createdAt,
    updatedAt,
    cartId = null,
    menuItemId,
    itemName,
    unitPrice,
    quantity = 1,
  }) {
    super({ id, createdAt, updatedAt });
    this.#cartId = cartId;
    this.#menuItemId = menuItemId;
    this.#itemName = itemName;
    this.#unitPrice = unitPrice;
    this.#quantity = quantity;
  }

  /**
   * Owning cart.
   *
   * @returns {string | null} Cart id, or `null` before the cart is saved.
   */
  get cartId() {
    return this.#cartId;
  }

  /**
   * Menu item this line refers to.
   *
   * @returns {string} Menu item id.
   */
  get menuItemId() {
    return this.#menuItemId;
  }

  /**
   * Item name as shown in the cart.
   *
   * @returns {string} Name.
   */
  get itemName() {
    return this.#itemName;
  }

  /**
   * Unit price as shown in the cart.
   *
   * @returns {Money} Price per unit.
   */
  get unitPrice() {
    return this.#unitPrice;
  }

  /**
   * Number of units.
   *
   * @returns {number} Quantity.
   */
  get quantity() {
    return this.#quantity;
  }

  /**
   * Price for this line.
   *
   * @returns {Money} Unit price times quantity.
   */
  get lineTotal() {
    return this.#unitPrice.multiply(this.#quantity);
  }

  /**
   * Binds this line to a cart once the cart itself has an id.
   *
   * @param {string} cartId - Owning cart.
   * @returns {void}
   */
  attachTo(cartId) {
    this.#cartId = cartId;
    this.touch();
  }

  /**
   * Adds to the quantity — FR-C4's "re-adding an item increments quantity".
   *
   * @param {number} amount - Units to add.
   * @returns {void}
   * @throws {ValidationError} When the amount is not a positive whole number.
   */
  increaseBy(amount) {
    if (!Number.isInteger(amount) || amount < 1) {
      throw new ValidationError('A quantity increase must be a positive whole number.');
    }
    this.#quantity += amount;
    this.touch();
  }

  /**
   * Replaces the quantity outright (FR-C5).
   *
   * @param {number} quantity - New quantity.
   * @returns {void}
   * @throws {ValidationError} When the quantity is not a positive whole number.
   */
  setQuantity(quantity) {
    if (!Number.isInteger(quantity) || quantity < 1) {
      throw new ValidationError('A quantity must be a positive whole number.');
    }
    this.#quantity = quantity;
    this.touch();
  }

  /**
   * Refreshes the copied name and price from the live menu item.
   *
   * @param {import('./menu-item.js').MenuItem} menuItem - Current menu item.
   * @returns {boolean} `true` when the price changed, so checkout can show the diff.
   */
  refreshFrom(menuItem) {
    const changed = !this.#unitPrice.equals(menuItem.price);
    this.#itemName = menuItem.name;
    this.#unitPrice = menuItem.price;
    if (changed) {
      this.touch();
    }
    return changed;
  }

  /**
   * Checks own invariants.
   *
   * @returns {void} Returns nothing when the entity is consistent.
   * @throws {ValidationError} When a required field is missing or the quantity is invalid.
   */
  validate() {
    if (!this.#menuItemId) {
      throw new ValidationError('A cart line must refer to a menu item.');
    }
    if (!(this.#unitPrice instanceof Money)) {
      throw new ValidationError('A cart line must carry a price.');
    }
    if (!Number.isInteger(this.#quantity) || this.#quantity < 1) {
      throw new ValidationError('A quantity must be a positive whole number.');
    }
  }

  /**
   * Row shape for the `cart_items` table.
   *
   * @returns {import('@hungry-ju/shared/types').PersistenceRow} Row for the repository.
   */
  toPersistence() {
    return {
      ...this.baseRow(),
      cart_id: this.#cartId,
      menu_item_id: this.#menuItemId,
      item_name: this.#itemName,
      unit_price_poisha: this.#unitPrice.poisha,
      quantity: this.#quantity,
    };
  }

  /**
   * Client-safe projection.
   *
   * @returns {Record<string, unknown>} Serialisable line.
   */
  toJSON() {
    return {
      id: this.id,
      menuItemId: this.#menuItemId,
      itemName: this.#itemName,
      unitPrice: this.#unitPrice.taka,
      quantity: this.#quantity,
      lineTotal: this.lineTotal.taka,
    };
  }

  /**
   * Rebuilds a line from a stored row.
   *
   * @param {import('@hungry-ju/shared/types').PersistenceRow} row - Row from storage.
   * @returns {CartItem} Hydrated line.
   */
  static fromPersistence(row) {
    return new CartItem({
      id: row.id,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      cartId: row.cart_id,
      menuItemId: row.menu_item_id,
      itemName: row.item_name,
      unitPrice: Money.fromPoisha(row.unit_price_poisha),
      quantity: row.quantity,
    });
  }
}
