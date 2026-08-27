/**
 * @file Data access for the cart aggregate.
 *
 * @module repositories/cart-repository
 */

import { BaseRepository } from '../core/base-repository.js';
import { Cart } from '../models/cart.js';
import { CartItem } from '../models/cart-item.js';

/**
 * Reads and writes the `carts` table together with its `cart_items` lines.
 *
 * The aggregate is loaded and stored whole. Saving lines individually would let a caller
 * persist an item without its cart, which is exactly how a cart ends up holding two
 * vendors in violation of BR-03.
 *
 * @augments BaseRepository<Cart>
 */
export class CartRepository extends BaseRepository {
  /**
   * @param {import('../config/database/database.js').Database} db - Database client.
   */
  constructor(db) {
    super(db, 'carts');
  }

  /**
   * Loads a student's cart with its lines, creating an empty one on first use.
   *
   * @param {string} studentId - Owning student.
   * @returns {Promise<Cart>} The cart, lines attached.
   */
  async findOrCreateByStudent(studentId) {
    const existing = await this.findOne({ student_id: studentId });
    if (existing) {
      await this.#attachItems(existing);
      return existing;
    }
    return this.create(new Cart({ studentId }));
  }

  /**
   * Stores the aggregate: the cart row, then its lines.
   *
   * Lines are rewritten rather than diffed. A cart is a handful of rows that changes
   * only on an explicit user action, so the simpler code wins over the cleverer one.
   *
   * @param {Cart} cart - Aggregate to store.
   * @returns {Promise<Cart>} The stored aggregate.
   */
  async saveAggregate(cart) {
    return this.transaction(async () => {
      cart.validate();
      const stored = cart.isPersisted ? await this.save(cart) : await this.create(cart);

      await this.db.deleteWhere('cart_items', { cart_id: stored.id });
      /** @type {CartItem[]} */
      const lines = [];
      for (const item of cart.items) {
        item.attachTo(stored.id);
        const row = await this.db.insert('cart_items', { ...item.toPersistence(), id: null });
        lines.push(CartItem.fromPersistence(row));
      }
      stored.setItems(lines);
      return stored;
    });
  }

  /**
   * Loads the lines of a cart and attaches them.
   *
   * @param {Cart} cart - Cart to fill.
   * @returns {Promise<void>} Resolves once the lines are attached.
   */
  async #attachItems(cart) {
    const rows = await this.db.findMany('cart_items', { cart_id: cart.id });
    cart.setItems(rows.map((row) => CartItem.fromPersistence(row)));
  }

  /**
   * Maps a stored row onto a cart, without its lines.
   *
   * @param {import('@hungry-ju/shared/types').PersistenceRow} row - Row from storage.
   * @returns {Cart} Hydrated cart.
   */
  toModel(row) {
    return Cart.fromPersistence(row);
  }
}
