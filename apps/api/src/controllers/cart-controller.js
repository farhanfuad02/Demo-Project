/**
 * @file HTTP entry for the cart.
 *
 * @module controllers/cart-controller
 */

import { BaseController } from '../core/base-controller.js';

/**
 * FR-C4 and FR-C5.
 *
 * Every method answers with the whole cart rather than the line that changed, so the
 * badge, the subtotal, and the total can never drift from the lines they describe.
 *
 * @augments BaseController
 */
export class CartController extends BaseController {
  /** @type {import('../services/cart-service.js').CartService} */
  #cartService;

  /**
   * @param {object} dependencies - Injected collaborators.
   * @param {import('../services/cart-service.js').CartService} dependencies.cartService -
   *   Cart rules.
   */
  constructor({ cartService }) {
    super();
    this.#cartService = cartService;
  }

  /**
   * Returns the current cart.
   *
   * @param {import('express').Request} request - Incoming request.
   * @param {import('express').Response} response - Outgoing response.
   * @returns {Promise<import('express').Response>} The response.
   */
  async show(request, response) {
    return this.ok(response, await this.#cartService.view(this.actor(request)));
  }

  /**
   * Adds an item (FR-C4).
   *
   * @param {import('express').Request} request - Incoming request.
   * @param {import('express').Response} response - Outgoing response.
   * @returns {Promise<import('express').Response>} The response.
   */
  async addItem(request, response) {
    const { menuItemId, quantity } = this.body(request);
    const cart = await this.#cartService.addItem(this.actor(request), menuItemId, quantity);
    return this.ok(response, cart);
  }

  /**
   * Changes a line's quantity, or removes it at zero (FR-C5).
   *
   * @param {import('express').Request} request - Incoming request.
   * @param {import('express').Response} response - Outgoing response.
   * @returns {Promise<import('express').Response>} The response.
   */
  async updateItem(request, response) {
    const cart = await this.#cartService.updateQuantity(
      this.actor(request),
      request.params.menuItemId,
      this.body(request).quantity
    );
    return this.ok(response, cart);
  }

  /**
   * Removes a line (FR-C5).
   *
   * @param {import('express').Request} request - Incoming request.
   * @param {import('express').Response} response - Outgoing response.
   * @returns {Promise<import('express').Response>} The response.
   */
  async removeItem(request, response) {
    const cart = await this.#cartService.removeItem(this.actor(request), request.params.menuItemId);
    return this.ok(response, cart);
  }

  /**
   * Empties the cart, which is how a student switches vendor (BR-03).
   *
   * @param {import('express').Request} request - Incoming request.
   * @param {import('express').Response} response - Outgoing response.
   * @returns {Promise<import('express').Response>} The response.
   */
  async clear(request, response) {
    return this.ok(response, await this.#cartService.clear(this.actor(request)));
  }
}
