/**
 * @file Client controller for placing and tracking orders.
 *
 * @module controllers/order-controller
 */

import { REALTIME } from '@hungry-ju/shared/constants';
import { BaseController } from './base-controller.js';
import { OrderModel } from '../models/order-model.js';

/**
 * The student's side of an order: checkout, history, and live tracking.
 *
 * Tracking polls rather than holding a socket open. The SRS calls for status updates
 * within five seconds (NFR-03) and explicitly recommends polling for the MVP; a poll is
 * also the only thing that survives the campus Wi-Fi dropping and coming back, which a
 * socket does not (SRS section 2.4).
 *
 * @augments BaseController
 */
export class OrderController extends BaseController {
  /** @type {ReturnType<typeof setInterval> | null} */
  #pollTimer = null;

  /**
   * @param {import('../services/api-client.js').ApiClient} api - API gateways.
   */
  constructor(api) {
    super(api, { orders: [], order: null, confirmPin: null, ratings: [], priceChanges: null });
  }

  /**
   * Places the order in the cart (UC-01).
   *
   * A conflict means prices or availability moved during checkout; the differences are
   * kept in state so the view can show the diff the SRS asks for rather than a generic
   * failure (UC-01 alternate flow A1).
   *
   * @param {Record<string, unknown>} details - Delivery location and note.
   * @returns {Promise<{ order: OrderModel, confirmPin: string } | null>} The placed order.
   */
  async place(details) {
    this.setState({ priceChanges: null });
    try {
      this.setState({ loading: true, error: null });
      const result = await this.api.orders.place(details);
      const order = new OrderModel(result.order);
      this.setState({
        loading: false,
        order,
        confirmPin: result.confirmPin,
        orders: [order, ...this.state.orders],
      });
      return { order, confirmPin: result.confirmPin };
    } catch (error) {
      this.setState({
        loading: false,
        error: error.message,
        priceChanges: error.isConflict ? (error.details ?? {}) : null,
      });
      return null;
    }
  }

  /**
   * Loads the order history (FR-C8).
   *
   * @returns {Promise<OrderModel[] | null>} The orders.
   */
  async loadHistory() {
    return this.run(async () => {
      const page = await this.api.orders.history();
      const orders = OrderModel.listFrom(page.data);
      this.setState({ orders, meta: page.meta });
      return orders;
    });
  }

  /**
   * Loads one order and its ratings.
   *
   * @param {string} orderId - Order to load.
   * @param {object} [options] - Behaviour.
   * @param {boolean} [options.silent] - Skip the loading flag, for a poll.
   * @returns {Promise<OrderModel | null>} The order.
   */
  async loadOrder(orderId, { silent = false } = {}) {
    return this.run(
      async () => {
        const order = new OrderModel(await this.api.orders.detail(orderId));
        this.setState({ order });
        if (order.isDelivered && !silent) {
          this.setState({ ratings: await this.api.orders.ratings(orderId) });
        }
        return order;
      },
      { silent }
    );
  }

  /**
   * Starts polling one order's status (FR-E1, NFR-03).
   *
   * Polling stops on its own once the order reaches an end state: a delivered order will
   * never change again, and a page left open overnight should not keep asking.
   *
   * @param {string} orderId - Order to watch.
   * @returns {void}
   */
  startTracking(orderId) {
    this.stopTracking();
    void this.loadOrder(orderId);
    this.#pollTimer = setInterval(async () => {
      const order = await this.loadOrder(orderId, { silent: true });
      if (order?.isFinal) {
        this.stopTracking();
        void this.loadOrder(orderId);
      }
    }, REALTIME.POLL_INTERVAL_MS);
  }

  /**
   * Stops polling.
   *
   * @returns {void}
   */
  stopTracking() {
    if (this.#pollTimer) {
      clearInterval(this.#pollTimer);
      this.#pollTimer = null;
    }
  }

  /**
   * Cancels an order (UC-03).
   *
   * @param {string} orderId - Order to cancel.
   * @param {string} [reason] - Why.
   * @returns {Promise<OrderModel | null>} The cancelled order.
   */
  async cancel(orderId, reason) {
    return this.run(async () => {
      const order = new OrderModel(await this.api.orders.cancel(orderId, reason));
      this.setState({
        order,
        orders: this.state.orders.map((existing) => (existing.id === order.id ? order : existing)),
      });
      return order;
    });
  }

  /**
   * Refills the cart from a past order (FR-C8).
   *
   * @param {string} orderId - Order to repeat.
   * @returns {Promise<Record<string, unknown> | null>} The refilled cart payload.
   */
  async reorder(orderId) {
    return this.run(() => this.api.orders.reorder(orderId));
  }

  /**
   * Rates the shop or the delivery partner (FR-C9).
   *
   * @param {string} orderId - Order being rated.
   * @param {Record<string, unknown>} rating - Target, stars, and comment.
   * @returns {Promise<Record<string, unknown> | null>} The stored rating.
   */
  async rate(orderId, rating) {
    return this.run(async () => {
      const stored = await this.api.orders.rate(orderId, rating);
      this.setState({ ratings: [...this.state.ratings, stored] });
      return stored;
    });
  }

  /**
   * Whether a target has already been rated on the loaded order (BR-08).
   *
   * @param {string} targetType - Shop or rider.
   * @returns {boolean} `true` when a rating already exists.
   */
  hasRated(targetType) {
    return this.state.ratings.some((rating) => rating.targetType === targetType);
  }

  /**
   * Forgets the confirmation PIN once the student has written it down.
   *
   * @returns {void}
   */
  dismissPin() {
    this.setState({ confirmPin: null });
  }
}
