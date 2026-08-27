/**
 * @file One line of a placed order.
 *
 * @module models/order-item
 */

import { BaseModel } from '../core/base-model.js';
import { ValidationError } from '../core/errors/app-error.js';
import { Money } from '../utils/money.js';

/**
 * A frozen record of one item as it was ordered.
 *
 * The name and price are snapshots, not references. If the vendor renames the dish or
 * raises the price next week, this row must still say what the student ordered and what
 * they paid — otherwise the order history quietly rewrites itself and a receipt means
 * nothing (SRS section 7).
 *
 * @augments BaseModel
 */
export class OrderItem extends BaseModel {
  /** @type {string | null} */
  #orderId;

  /** @type {string} */
  #menuItemId;

  /** @type {string} */
  #itemNameSnapshot;

  /** @type {Money} */
  #unitPriceSnapshot;

  /** @type {number} */
  #quantity;

  /**
   * @param {object} attributes - Line columns.
   * @param {string | null} [attributes.id] - Primary key.
   * @param {Date | string | null} [attributes.createdAt] - Creation timestamp.
   * @param {Date | string | null} [attributes.updatedAt] - Last write timestamp.
   * @param {string | null} [attributes.orderId] - Owning order.
   * @param {string} attributes.menuItemId - Menu item ordered.
   * @param {string} attributes.itemNameSnapshot - Name at the moment of ordering.
   * @param {Money} attributes.unitPriceSnapshot - Price at the moment of ordering.
   * @param {number} attributes.quantity - Units ordered.
   */
  constructor({
    id,
    createdAt,
    updatedAt,
    orderId = null,
    menuItemId,
    itemNameSnapshot,
    unitPriceSnapshot,
    quantity,
  }) {
    super({ id, createdAt, updatedAt });
    this.#orderId = orderId;
    this.#menuItemId = menuItemId;
    this.#itemNameSnapshot = itemNameSnapshot;
    this.#unitPriceSnapshot = unitPriceSnapshot;
    this.#quantity = quantity;
  }

  /**
   * Owning order.
   *
   * @returns {string | null} Order id.
   */
  get orderId() {
    return this.#orderId;
  }

  /**
   * Menu item ordered.
   *
   * @returns {string} Menu item id.
   */
  get menuItemId() {
    return this.#menuItemId;
  }

  /**
   * Name as it was when ordered.
   *
   * @returns {string} Item name.
   */
  get itemName() {
    return this.#itemNameSnapshot;
  }

  /**
   * Price as it was when ordered.
   *
   * @returns {Money} Unit price.
   */
  get unitPrice() {
    return this.#unitPriceSnapshot;
  }

  /**
   * Units ordered.
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
    return this.#unitPriceSnapshot.multiply(this.#quantity);
  }

  /**
   * Binds this line to its order once the order has an id.
   *
   * @param {string} orderId - Owning order.
   * @returns {void}
   */
  attachTo(orderId) {
    this.#orderId = orderId;
    this.touch();
  }

  /**
   * Builds an order line from a cart line at checkout.
   *
   * @param {import('./cart-item.js').CartItem} cartItem - Line being ordered.
   * @returns {OrderItem} The frozen line.
   */
  static fromCartItem(cartItem) {
    return new OrderItem({
      menuItemId: cartItem.menuItemId,
      itemNameSnapshot: cartItem.itemName,
      unitPriceSnapshot: cartItem.unitPrice,
      quantity: cartItem.quantity,
    });
  }

  /**
   * Checks own invariants.
   *
   * @returns {void} Returns nothing when the entity is consistent.
   * @throws {ValidationError} When the snapshot is incomplete.
   */
  validate() {
    if (!this.#menuItemId || !this.#itemNameSnapshot) {
      throw new ValidationError('An order line must record which item was ordered.');
    }
    if (!(this.#unitPriceSnapshot instanceof Money)) {
      throw new ValidationError('An order line must record the price paid.');
    }
    if (!Number.isInteger(this.#quantity) || this.#quantity < 1) {
      throw new ValidationError('An order line quantity must be a positive whole number.');
    }
  }

  /**
   * Row shape for the `order_items` table.
   *
   * @returns {import('@hungry-ju/shared/types').PersistenceRow} Row for the repository.
   */
  toPersistence() {
    return {
      ...this.baseRow(),
      order_id: this.#orderId,
      menu_item_id: this.#menuItemId,
      item_name_snapshot: this.#itemNameSnapshot,
      unit_price_snapshot_poisha: this.#unitPriceSnapshot.poisha,
      quantity: this.#quantity,
      line_total_poisha: this.lineTotal.poisha,
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
      itemName: this.#itemNameSnapshot,
      unitPrice: this.#unitPriceSnapshot.taka,
      quantity: this.#quantity,
      lineTotal: this.lineTotal.taka,
    };
  }

  /**
   * Rebuilds a line from a stored row.
   *
   * @param {import('@hungry-ju/shared/types').PersistenceRow} row - Row from storage.
   * @returns {OrderItem} Hydrated line.
   */
  static fromPersistence(row) {
    return new OrderItem({
      id: row.id,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      orderId: row.order_id,
      menuItemId: row.menu_item_id,
      itemNameSnapshot: row.item_name_snapshot,
      unitPriceSnapshot: Money.fromPoisha(row.unit_price_snapshot_poisha),
      quantity: row.quantity,
    });
  }
}
