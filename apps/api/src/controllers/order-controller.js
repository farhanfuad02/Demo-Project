/**
 * @file HTTP entry for orders.
 *
 * @module controllers/order-controller
 */

import { BaseController } from '../core/base-controller.js';
import { QueryOptions } from '../utils/query-options.js';

/**
 * UC-01, UC-03, and the vendor order board.
 *
 * @augments BaseController
 */
export class OrderController extends BaseController {
  /** @type {import('../services/order-service.js').OrderService} */
  #orderService;

  /** @type {import('../services/rating-service.js').RatingService} */
  #ratingService;

  /**
   * @param {object} dependencies - Injected collaborators.
   * @param {import('../services/order-service.js').OrderService} dependencies.orderService -
   *   Order rules.
   * @param {import('../services/rating-service.js').RatingService} dependencies.ratingService -
   *   Post-delivery ratings.
   */
  constructor({ orderService, ratingService }) {
    super();
    this.#orderService = orderService;
    this.#ratingService = ratingService;
  }

  /**
   * Places an order from the cart (UC-01).
   *
   * The confirmation PIN is returned exactly once, here. It is stored only as a hash, so
   * there is no endpoint that can hand it back later — which is the point (BR-10).
   *
   * @param {import('express').Request} request - Incoming request.
   * @param {import('express').Response} response - Outgoing response.
   * @returns {Promise<import('express').Response>} The response.
   */
  async place(request, response) {
    const result = await this.#orderService.place(this.actor(request), this.body(request));
    return this.created(response, result);
  }

  /**
   * The signed-in student's order history (FR-C8).
   *
   * @param {import('express').Request} request - Incoming request.
   * @param {import('express').Response} response - Outgoing response.
   * @returns {Promise<import('express').Response>} The response.
   */
  async index(request, response) {
    const page = await this.#orderService.historyOf(
      this.actor(request),
      new QueryOptions({ ...this.query(request), sortBy: 'placed_at' })
    );
    return this.okPaginated(response, page);
  }

  /**
   * One order with its delivery, for tracking (FR-E1).
   *
   * @param {import('express').Request} request - Incoming request.
   * @param {import('express').Response} response - Outgoing response.
   * @returns {Promise<import('express').Response>} The response.
   */
  async show(request, response) {
    const order = await this.#orderService.detail(this.actor(request), request.params.orderId);
    return this.ok(response, order);
  }

  /**
   * Cancels an order (UC-03).
   *
   * @param {import('express').Request} request - Incoming request.
   * @param {import('express').Response} response - Outgoing response.
   * @returns {Promise<import('express').Response>} The response.
   */
  async cancel(request, response) {
    const order = await this.#orderService.cancel(
      this.actor(request),
      request.params.orderId,
      this.body(request).reason
    );
    return this.ok(response, order);
  }

  /**
   * Refills the cart from a past order (FR-C8 reorder).
   *
   * @param {import('express').Request} request - Incoming request.
   * @param {import('express').Response} response - Outgoing response.
   * @returns {Promise<import('express').Response>} The response.
   */
  async reorder(request, response) {
    const cart = await this.#orderService.reorder(this.actor(request), request.params.orderId);
    return this.ok(response, cart);
  }

  /**
   * Rates the shop or the delivery partner of a delivered order (FR-C9).
   *
   * @param {import('express').Request} request - Incoming request.
   * @param {import('express').Response} response - Outgoing response.
   * @returns {Promise<import('express').Response>} The response.
   */
  async rate(request, response) {
    const rating = await this.#ratingService.rate(
      this.actor(request),
      request.params.orderId,
      this.body(request)
    );
    return this.created(response, rating);
  }

  /**
   * Ratings already left on an order, so the UI hides the forms that are done.
   *
   * @param {import('express').Request} request - Incoming request.
   * @param {import('express').Response} response - Outgoing response.
   * @returns {Promise<import('express').Response>} The response.
   */
  async ratings(request, response) {
    const ratings = await this.#ratingService.forOrder(this.actor(request), request.params.orderId);
    return this.ok(response, ratings);
  }

  /**
   * The vendor's order board (FR-B4).
   *
   * @param {import('express').Request} request - Incoming request.
   * @param {import('express').Response} response - Outgoing response.
   * @returns {Promise<import('express').Response>} The response.
   */
  async board(request, response) {
    const query = this.query(request);
    const page = await this.#orderService.boardOf(
      this.actor(request),
      request.params.shopId,
      query.statuses,
      new QueryOptions({ ...query, sortBy: 'placed_at' })
    );
    return this.okPaginated(response, page);
  }

  /**
   * Vendor accepts an order (FR-B4).
   *
   * @param {import('express').Request} request - Incoming request.
   * @param {import('express').Response} response - Outgoing response.
   * @returns {Promise<import('express').Response>} The response.
   */
  async accept(request, response) {
    const order = await this.#orderService.accept(this.actor(request), request.params.orderId);
    return this.ok(response, order);
  }

  /**
   * Vendor refuses an order (FR-B4).
   *
   * @param {import('express').Request} request - Incoming request.
   * @param {import('express').Response} response - Outgoing response.
   * @returns {Promise<import('express').Response>} The response.
   */
  async reject(request, response) {
    const order = await this.#orderService.reject(
      this.actor(request),
      request.params.orderId,
      this.body(request).reason
    );
    return this.ok(response, order);
  }

  /**
   * Vendor moves an order to preparing or ready (FR-B5).
   *
   * @param {import('express').Request} request - Incoming request.
   * @param {import('express').Response} response - Outgoing response.
   * @returns {Promise<import('express').Response>} The response.
   */
  async advance(request, response) {
    const order = await this.#orderService.advance(
      this.actor(request),
      request.params.orderId,
      this.body(request).status
    );
    return this.ok(response, order);
  }
}
