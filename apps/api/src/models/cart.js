/**
 * @file Shopping cart aggregate.
 *
 * @module models/cart
 */

import { BaseModel } from '../core/base-model.js';
import { ConflictError, ValidationError } from '../core/errors/app-error.js';
import { Money } from '../utils/money.js';
import { CartItem } from './cart-item.js';

/**
 * A student's single active cart.
 *
 * The cart is an aggregate: its lines are reached only through it, so BR-03 (one cart,
 * one vendor) and FR-C4 (re-adding merges quantities) are enforced in one object instead
 * of in whichever service happened to touch a line last.
 *
 * @augments BaseModel
 */
export class Cart extends BaseModel {
  /** @type {string} */
  #studentId;

  /** @type {string | null} */
  #shopId;

  /** @type {CartItem[]} */
  #items;

  /**
   * @param {object} attributes - Cart columns.
   * @param {string | null} [attributes.id] - Primary key.
   * @param {Date | string | null} [attributes.createdAt] - Creation timestamp.
   * @param {Date | string | null} [attributes.updatedAt] - Last write timestamp.
   * @param {string} attributes.studentId - Owning student.
   * @param {string | null} [attributes.shopId] - Vendor the cart is bound to.
   * @param {CartItem[]} [attributes.items] - Existing lines.
   */
  constructor({ id, createdAt, updatedAt, studentId, shopId = null, items = [] }) {
    super({ id, createdAt, updatedAt });
    this.#studentId = studentId;
    this.#shopId = shopId;
    this.#items = items;
  }

  /**
   * Owning student.
   *
   * @returns {string} User id.
   */
  get studentId() {
    return this.#studentId;
  }

  /**
   * Vendor this cart is bound to.
   *
   * @returns {string | null} Shop id, or `null` while the cart is empty.
   */
  get shopId() {
    return this.#shopId;
  }

  /**
   * The lines, as a copy so callers cannot splice the aggregate's own array.
   *
   * @returns {CartItem[]} Cart lines.
   */
  get items() {
    return [...this.#items];
  }

  /**
   * Whether the cart holds nothing.
   *
   * @returns {boolean} `true` when there are no lines.
   */
  get isEmpty() {
    return this.#items.length === 0;
  }

  /**
   * Total number of units across all lines, for the cart badge.
   *
   * @returns {number} Unit count.
   */
  get itemCount() {
    return this.#items.reduce((total, item) => total + item.quantity, 0);
  }

  /**
   * Sum of every line (FR-C5).
   *
   * @returns {Money} Subtotal before the delivery fee.
   */
  get subtotal() {
    return Money.sum(this.#items.map((item) => item.lineTotal));
  }

  /**
   * Finds a line by menu item.
   *
   * @param {string} menuItemId - Menu item to look for.
   * @returns {CartItem | undefined} The line, when present.
   */
  findItem(menuItemId) {
    return this.#items.find((item) => item.menuItemId === menuItemId);
  }

  /**
   * Adds a menu item, merging into the existing line when it is already there.
   *
   * @param {import('./menu-item.js').MenuItem} menuItem - Item to add.
   * @param {number} [quantity] - Units to add.
   * @returns {CartItem} The line that now holds the item.
   * @throws {ValidationError} When the item is sold out (BR-07).
   * @throws {ConflictError} When the item belongs to a different shop (BR-03).
   */
  addItem(menuItem, quantity = 1) {
    if (!menuItem.isAvailable) {
      throw new ValidationError(`${menuItem.name} is sold out right now.`);
    }
    if (this.#shopId !== null && this.#shopId !== menuItem.shopId) {
      throw new ConflictError(
        'Your cart already holds items from another vendor. Clear it first to order here.'
      );
    }

    this.#shopId = menuItem.shopId;
    const existing = this.findItem(menuItem.id);
    if (existing) {
      existing.increaseBy(quantity);
      this.touch();
      return existing;
    }

    const line = new CartItem({
      cartId: this.id,
      menuItemId: menuItem.id,
      itemName: menuItem.name,
      unitPrice: menuItem.price,
      quantity,
    });
    line.validate();
    this.#items.push(line);
    this.touch();
    return line;
  }

  /**
   * Sets the quantity of one line, removing it when the quantity drops to zero.
   *
   * @param {string} menuItemId - Line to change.
   * @param {number} quantity - New quantity; `0` removes the line.
   * @returns {void}
   * @throws {ValidationError} When the line is not in the cart.
   */
  updateQuantity(menuItemId, quantity) {
    const line = this.findItem(menuItemId);
    if (!line) {
      throw new ValidationError('That item is not in your cart.');
    }
    if (quantity === 0) {
      this.removeItem(menuItemId);
      return;
    }
    line.setQuantity(quantity);
    this.touch();
  }

  /**
   * Removes a line. Emptying the cart also unbinds the vendor, so the next item added
   * may come from anywhere.
   *
   * @param {string} menuItemId - Line to remove.
   * @returns {void}
   */
  removeItem(menuItemId) {
    this.#items = this.#items.filter((item) => item.menuItemId !== menuItemId);
    if (this.#items.length === 0) {
      this.#shopId = null;
    }
    this.touch();
  }

  /**
   * Empties the cart and unbinds the vendor.
   *
   * @returns {void}
   */
  clear() {
    this.#items = [];
    this.#shopId = null;
    this.touch();
  }

  /**
   * Replaces the lines wholesale; the repository uses it after loading them.
   *
   * @param {CartItem[]} items - Lines belonging to this cart.
   * @returns {void}
   */
  setItems(items) {
    this.#items = items;
  }

  /**
   * Checks own invariants, including BR-03 across every line.
   *
   * @returns {void} Returns nothing when the entity is consistent.
   * @throws {ValidationError} When the cart has no owner.
   * @throws {ConflictError} When lines from more than one vendor slipped in.
   */
  validate() {
    if (!this.#studentId) {
      throw new ValidationError('A cart must belong to a student.');
    }
    if (this.#items.length > 0 && !this.#shopId) {
      throw new ValidationError('A cart with items must be bound to a vendor.');
    }
    for (const item of this.#items) {
      item.validate();
    }
  }

  /**
   * Row shape for the `carts` table. Lines are stored separately.
   *
   * @returns {import('@hungry-ju/shared/types').PersistenceRow} Row for the repository.
   */
  toPersistence() {
    return {
      ...this.baseRow(),
      student_id: this.#studentId,
      shop_id: this.#shopId,
    };
  }

  /**
   * Client-safe projection, including the totals the cart screen needs.
   *
   * @returns {Record<string, unknown>} Serialisable cart.
   */
  toJSON() {
    return {
      id: this.id,
      studentId: this.#studentId,
      shopId: this.#shopId,
      items: this.#items.map((item) => item.toJSON()),
      itemCount: this.itemCount,
      subtotal: this.subtotal.taka,
      isEmpty: this.isEmpty,
    };
  }

  /**
   * Rebuilds a cart from a stored row; lines are attached by the repository.
   *
   * @param {import('@hungry-ju/shared/types').PersistenceRow} row - Row from storage.
   * @returns {Cart} Hydrated cart without its lines.
   */
  static fromPersistence(row) {
    return new Cart({
      id: row.id,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      studentId: row.student_id,
      shopId: row.shop_id,
    });
  }
}
