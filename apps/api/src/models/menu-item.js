/**
 * @file Menu item entity.
 *
 * @module models/menu-item
 */

import { BaseModel } from '../core/base-model.js';
import { ValidationError } from '../core/errors/app-error.js';
import { Money } from '../utils/money.js';

/**
 * One dish on a shop's menu.
 *
 * The price lives here, but an order line copies it (see `OrderItem`): a vendor raising
 * the price of Khichuri tomorrow must not rewrite what a student paid today.
 *
 * @augments BaseModel
 */
export class MenuItem extends BaseModel {
  /** @type {string} */
  #shopId;

  /** @type {string} */
  #name;

  /** @type {string | null} */
  #description;

  /** @type {Money} */
  #price;

  /** @type {string | null} */
  #photoUrl;

  /** @type {string} */
  #category;

  /** @type {boolean} */
  #isAvailable;

  /** @type {number} */
  #prepTimeMin;

  /**
   * @param {object} attributes - Menu item columns.
   * @param {string | null} [attributes.id] - Primary key.
   * @param {Date | string | null} [attributes.createdAt] - Creation timestamp.
   * @param {Date | string | null} [attributes.updatedAt] - Last write timestamp.
   * @param {string} attributes.shopId - Owning shop.
   * @param {string} attributes.name - Dish name.
   * @param {string | null} [attributes.description] - Short description.
   * @param {Money} attributes.price - Current price.
   * @param {string | null} [attributes.photoUrl] - Dish photo.
   * @param {string} [attributes.category] - Menu category.
   * @param {boolean} [attributes.isAvailable] - Whether it can be ordered right now.
   * @param {number} [attributes.prepTimeMin] - Typical preparation time in minutes.
   */
  constructor({
    id,
    createdAt,
    updatedAt,
    shopId,
    name,
    description = null,
    price,
    photoUrl = null,
    category = 'General',
    isAvailable = true,
    prepTimeMin = 15,
  }) {
    super({ id, createdAt, updatedAt });
    this.#shopId = shopId;
    this.#name = name;
    this.#description = description;
    this.#price = price;
    this.#photoUrl = photoUrl;
    this.#category = category;
    this.#isAvailable = isAvailable;
    this.#prepTimeMin = prepTimeMin;
  }

  /**
   * Owning shop.
   *
   * @returns {string} Shop id.
   */
  get shopId() {
    return this.#shopId;
  }

  /**
   * Dish name.
   *
   * @returns {string} Name.
   */
  get name() {
    return this.#name;
  }

  /**
   * Short description.
   *
   * @returns {string | null} Description.
   */
  get description() {
    return this.#description;
  }

  /**
   * Current price.
   *
   * @returns {Money} Price.
   */
  get price() {
    return this.#price;
  }

  /**
   * Menu category.
   *
   * @returns {string} Category.
   */
  get category() {
    return this.#category;
  }

  /**
   * Whether the item can be ordered right now (BR-07).
   *
   * @returns {boolean} `true` when available.
   */
  get isAvailable() {
    return this.#isAvailable;
  }

  /**
   * Typical preparation time.
   *
   * @returns {number} Minutes.
   */
  get prepTimeMin() {
    return this.#prepTimeMin;
  }

  /**
   * Applies editable fields.
   *
   * @param {object} changes - Fields to update.
   * @param {string} [changes.name] - Dish name.
   * @param {string | null} [changes.description] - Description.
   * @param {Money} [changes.price] - New price.
   * @param {string | null} [changes.photoUrl] - Photo.
   * @param {string} [changes.category] - Category.
   * @param {number} [changes.prepTimeMin] - Preparation time.
   * @returns {void}
   */
  update({ name, description, price, photoUrl, category, prepTimeMin } = {}) {
    if (name !== undefined) {
      this.#name = name;
    }
    if (description !== undefined) {
      this.#description = description;
    }
    if (price !== undefined) {
      this.#price = price;
    }
    if (photoUrl !== undefined) {
      this.#photoUrl = photoUrl;
    }
    if (category !== undefined) {
      this.#category = category;
    }
    if (prepTimeMin !== undefined) {
      this.#prepTimeMin = prepTimeMin;
    }
    this.touch();
  }

  /**
   * Toggles availability — the one-tap sold-out control that keeps menus honest
   * (mitigation for risk R3).
   *
   * @param {boolean} available - Desired state.
   * @returns {void}
   */
  setAvailable(available) {
    this.#isAvailable = available;
    this.touch();
  }

  /**
   * Checks own invariants.
   *
   * @returns {void} Returns nothing when the entity is consistent.
   * @throws {ValidationError} When a required field is missing or the price is unusable.
   */
  validate() {
    if (!this.#shopId) {
      throw new ValidationError('A menu item must belong to a shop.');
    }
    if (!this.#name || this.#name.trim().length < 2) {
      throw new ValidationError('An item name of at least 2 characters is required.');
    }
    if (!(this.#price instanceof Money) || this.#price.poisha <= 0) {
      throw new ValidationError('An item price greater than zero is required.');
    }
    if (!Number.isInteger(this.#prepTimeMin) || this.#prepTimeMin < 0) {
      throw new ValidationError('Preparation time must be a whole number of minutes.');
    }
  }

  /**
   * Row shape for the `menu_items` table.
   *
   * @returns {import('@hungry-ju/shared/types').PersistenceRow} Row for the repository.
   */
  toPersistence() {
    return {
      ...this.baseRow(),
      shop_id: this.#shopId,
      name: this.#name,
      description: this.#description,
      price_poisha: this.#price.poisha,
      photo_url: this.#photoUrl,
      category: this.#category,
      is_available: this.#isAvailable,
      prep_time_min: this.#prepTimeMin,
    };
  }

  /**
   * Client-safe projection.
   *
   * @returns {Record<string, unknown>} Serialisable item.
   */
  toJSON() {
    return {
      id: this.id,
      shopId: this.#shopId,
      name: this.#name,
      description: this.#description,
      price: this.#price.taka,
      photoUrl: this.#photoUrl,
      category: this.#category,
      isAvailable: this.#isAvailable,
      prepTimeMin: this.#prepTimeMin,
    };
  }

  /**
   * Rebuilds a menu item from a stored row.
   *
   * @param {import('@hungry-ju/shared/types').PersistenceRow} row - Row from storage.
   * @returns {MenuItem} Hydrated item.
   */
  static fromPersistence(row) {
    return new MenuItem({
      id: row.id,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      shopId: row.shop_id,
      name: row.name,
      description: row.description,
      price: Money.fromPoisha(row.price_poisha),
      photoUrl: row.photo_url,
      category: row.category,
      isAvailable: Boolean(row.is_available),
      prepTimeMin: row.prep_time_min ?? 15,
    });
  }
}
