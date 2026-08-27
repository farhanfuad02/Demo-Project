/**
 * @file HTTP entry for deliveries.
 *
 * @module controllers/delivery-controller
 */

import { BaseController } from '../core/base-controller.js';
import { QueryOptions } from '../utils/query-options.js';

/**
 * Epic D over HTTP.
 *
 * @augments BaseController
 */
export class DeliveryController extends BaseController {
  /** @type {import('../services/delivery-service.js').DeliveryService} */
  #deliveryService;

  /**
   * @param {object} dependencies - Injected collaborators.
   * @param {import('../services/delivery-service.js').DeliveryService} dependencies.deliveryService -
   *   Delivery rules.
   */
  constructor({ deliveryService }) {
    super();
    this.#deliveryService = deliveryService;
  }

  /**
   * The open feed (FR-D2).
   *
   * @param {import('express').Request} request - Incoming request.
   * @param {import('express').Response} response - Outgoing response.
   * @returns {Promise<import('express').Response>} The response.
   */
  async available(request, response) {
    const deliveries = await this.#deliveryService.availableFor(
      this.actor(request),
      new QueryOptions({ ...this.query(request), sortBy: 'available_at', sortDirection: 'asc' })
    );
    return this.ok(response, deliveries);
  }

  /**
   * Claims a delivery, first-accept-wins (UC-02).
   *
   * @param {import('express').Request} request - Incoming request.
   * @param {import('express').Response} response - Outgoing response.
   * @returns {Promise<import('express').Response>} The response.
   */
  async accept(request, response) {
    const delivery = await this.#deliveryService.accept(
      this.actor(request),
      request.params.deliveryId
    );
    return this.ok(response, delivery);
  }

  /**
   * The rider's current job, or `null` when free.
   *
   * @param {import('express').Request} request - Incoming request.
   * @param {import('express').Response} response - Outgoing response.
   * @returns {Promise<import('express').Response>} The response.
   */
  async active(request, response) {
    return this.ok(response, await this.#deliveryService.activeFor(this.actor(request)));
  }

  /**
   * Moves the delivery forward (FR-D5).
   *
   * @param {import('express').Request} request - Incoming request.
   * @param {import('express').Response} response - Outgoing response.
   * @returns {Promise<import('express').Response>} The response.
   */
  async advance(request, response) {
    const delivery = await this.#deliveryService.advance(
      this.actor(request),
      request.params.deliveryId,
      this.body(request).status
    );
    return this.ok(response, delivery);
  }

  /**
   * Completes the delivery against the customer's PIN (FR-D6).
   *
   * @param {import('express').Request} request - Incoming request.
   * @param {import('express').Response} response - Outgoing response.
   * @returns {Promise<import('express').Response>} The response.
   */
  async complete(request, response) {
    const delivery = await this.#deliveryService.complete(
      this.actor(request),
      request.params.deliveryId,
      this.body(request).confirmPin
    );
    return this.ok(response, delivery);
  }

  /**
   * Gives an accepted delivery back to the pool (FR-D8).
   *
   * @param {import('express').Request} request - Incoming request.
   * @param {import('express').Response} response - Outgoing response.
   * @returns {Promise<import('express').Response>} The response.
   */
  async release(request, response) {
    const delivery = await this.#deliveryService.release(
      this.actor(request),
      request.params.deliveryId
    );
    return this.ok(response, delivery);
  }

  /**
   * Earnings summary and history (FR-D7).
   *
   * @param {import('express').Request} request - Incoming request.
   * @param {import('express').Response} response - Outgoing response.
   * @returns {Promise<import('express').Response>} The response.
   */
  async earnings(request, response) {
    return this.ok(response, await this.#deliveryService.earningsFor(this.actor(request)));
  }
}
