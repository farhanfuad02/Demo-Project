/**
 * @file Client controller for the cart.
 *
 * @module controllers/cart-controller
 */

import { BaseController } from './base-controller.js';
import { CartModel } from '../models/cart-model.js';

/**
 * The cart, shared by the menu page, the cart badge, and checkout (FR-C4, FR-C5).
 *
 * One controller instance serves all three, so adding an item on a menu updates the
 * badge in the header without either component knowing the other exists.
 *
 * @augments BaseController
 */
export class CartController extends BaseController {
  /**
   * @param {import('../services/api-client.js').ApiClient} api - API gateways.
   */
  constructor(api) {
    super(api, { cart: CartModel.empty(), conflict: null, loaded: false });
  }

  /**
   * The current cart.
   *
   * @returns {CartModel} Cart.
   */
  get cart() {
    return /** @type {CartModel} */ (this.state.cart);
  }

  /**
   * Loads the cart.
   *
   * @param {object} [options] - Behaviour.
   * @param {boolean} [options.silent] - Skip the loading flag, for a background refresh.
   * @returns {Promise<CartModel | null>} The cart.
   */
  async load({ silent = false } = {}) {
    return this.run(
      async () => {
        const cart = new CartModel(await this.api.cart.show());
        this.setState({ cart, loaded: true });
        return cart;
      },
      { silent }
    );
  }

  /**
   * Adds an item (FR-C4).
   *
   * A cart already holding another vendor's food comes back as a conflict rather than an
   * error banner: the student is offered the one action that resolves it — clear the
   * cart and start here (BR-03).
   *
   * @param {import('../models/shop-model.js').MenuItemModel} item - Item to add.
   * @param {number} [quantity] - Units to add.
   * @returns {Promise<CartModel | null>} The updated cart.
   */
  async addItem(item, quantity = 1) {
    this.setState({ conflict: null });
    try {
      const cart = new CartModel(await this.api.cart.addItem(item.id, quantity));
      this.setState({ cart, loaded: true, error: null });
      return cart;
    } catch (error) {
      if (error.isConflict) {
        this.setState({
          conflict: { item, quantity, message: error.message },
        });
        return null;
      }
      this.setState({ error: error.message });
      return null;
    }
  }

  /**
   * Empties the cart and adds the item that collided with BR-03.
   *
   * @returns {Promise<CartModel | null>} The updated cart.
   */
  async resolveConflict() {
    const conflict = /** @type {{ item: object, quantity: number } | null} */ (this.state.conflict);
    if (!conflict) {
      return this.cart;
    }
    await this.api.cart.clear();
    this.setState({ conflict: null });
    return this.addItem(conflict.item, conflict.quantity);
  }

  /**
   * Abandons the pending add and keeps the existing cart.
   *
   * @returns {void}
   */
  dismissConflict() {
    this.setState({ conflict: null });
  }

  /**
   * Changes a line's quantity, or removes it at zero (FR-C5).
   *
   * @param {string} menuItemId - Line to change.
   * @param {number} quantity - New quantity.
   * @returns {Promise<CartModel | null>} The updated cart.
   */
  async updateQuantity(menuItemId, quantity) {
    return this.run(async () => {
      const cart = new CartModel(await this.api.cart.updateItem(menuItemId, quantity));
      this.setState({ cart });
      return cart;
    });
  }

  /**
   * Removes a line (FR-C5).
   *
   * @param {string} menuItemId - Line to remove.
   * @returns {Promise<CartModel | null>} The updated cart.
   */
  async removeItem(menuItemId) {
    return this.run(async () => {
      const cart = new CartModel(await this.api.cart.removeItem(menuItemId));
      this.setState({ cart });
      return cart;
    });
  }

  /**
   * Empties the cart.
   *
   * @returns {Promise<CartModel | null>} The empty cart.
   */
  async clear() {
    return this.run(async () => {
      const cart = new CartModel(await this.api.cart.clear());
      this.setState({ cart });
      return cart;
    });
  }

  /**
   * Replaces the held cart with one another controller produced, such as the cart a
   * reorder just refilled.
   *
   * @param {Record<string, unknown>} payload - Cart payload.
   * @returns {void}
   */
  adopt(payload) {
    this.setState({ cart: new CartModel(payload), loaded: true });
  }
}
