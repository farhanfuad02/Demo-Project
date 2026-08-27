/**
 * @file Client controller for Deliver Mode.
 *
 * @module controllers/deliver-controller
 */

import { REALTIME } from '@hungry-ju/shared/constants';
import { BaseController } from './base-controller.js';
import { DeliveryModel } from '../models/order-model.js';

/**
 * The delivery partner's side: the open feed, the active job, and earnings (Epic D).
 *
 * @augments BaseController
 */
export class DeliverController extends BaseController {
  /** @type {ReturnType<typeof setInterval> | null} */
  #feedTimer = null;

  /**
   * @param {import('../services/api-client.js').ApiClient} api - API gateways.
   */
  constructor(api) {
    super(api, { available: [], active: null, earnings: null, lostRace: null });
  }

  /**
   * Loads the open feed (FR-D2).
   *
   * @param {object} [options] - Behaviour.
   * @param {boolean} [options.silent] - Skip the loading flag, for the auto-refresh.
   * @returns {Promise<DeliveryModel[] | null>} Claimable deliveries.
   */
  async loadFeed({ silent = false } = {}) {
    return this.run(
      async () => {
        const available = DeliveryModel.listFrom(await this.api.deliveries.available());
        this.setState({ available });
        return available;
      },
      { silent }
    );
  }

  /**
   * Loads the rider's current job.
   *
   * @returns {Promise<DeliveryModel | null>} Active delivery, or `null` when free.
   */
  async loadActive() {
    return this.run(async () => {
      const active = DeliveryModel.maybeFrom(await this.api.deliveries.active());
      this.setState({ active });
      return active;
    });
  }

  /**
   * Starts auto-refreshing the feed, which is what makes it feel live (FR-D2).
   *
   * @returns {void}
   */
  startFeed() {
    this.stopFeed();
    void this.loadFeed();
    this.#feedTimer = setInterval(() => {
      void this.loadFeed({ silent: true });
    }, REALTIME.POLL_INTERVAL_MS);
  }

  /**
   * Stops auto-refreshing.
   *
   * @returns {void}
   */
  stopFeed() {
    if (this.#feedTimer) {
      clearInterval(this.#feedTimer);
      this.#feedTimer = null;
    }
  }

  /**
   * Claims a delivery (UC-02).
   *
   * Losing the race is not an error: another partner simply got there first, so the
   * message is set aside as `lostRace` and the feed refreshes underneath it, exactly as
   * the use case describes (alternate flow A1).
   *
   * @param {string} deliveryId - Delivery to claim.
   * @returns {Promise<DeliveryModel | null>} The claimed delivery, or `null` when lost.
   */
  async accept(deliveryId) {
    this.setState({ lostRace: null });
    try {
      this.setState({ loading: true, error: null });
      const active = new DeliveryModel(await this.api.deliveries.accept(deliveryId));
      this.setState({ loading: false, active });
      await this.loadFeed({ silent: true });
      return active;
    } catch (error) {
      this.setState({
        loading: false,
        lostRace: error.isConflict ? error.message : null,
        error: error.isConflict ? null : error.message,
      });
      await this.loadFeed({ silent: true });
      return null;
    }
  }

  /**
   * Advances the active delivery (FR-D5).
   *
   * @param {string} deliveryId - Delivery to advance.
   * @param {string} status - Next status.
   * @returns {Promise<DeliveryModel | null>} The updated delivery.
   */
  async advance(deliveryId, status) {
    return this.run(async () => {
      const active = new DeliveryModel(await this.api.deliveries.advance(deliveryId, status));
      this.setState({ active });
      return active;
    });
  }

  /**
   * Completes the delivery with the customer's PIN (FR-D6).
   *
   * @param {string} deliveryId - Delivery to complete.
   * @param {string} confirmPin - PIN read out by the customer.
   * @returns {Promise<DeliveryModel | null>} The completed delivery, or `null` when the
   *   PIN was wrong.
   */
  async complete(deliveryId, confirmPin) {
    return this.run(async () => {
      const completed = new DeliveryModel(
        await this.api.deliveries.complete(deliveryId, confirmPin)
      );
      this.setState({ active: null });
      await this.loadEarnings();
      return completed;
    });
  }

  /**
   * Hands the job back to the pool (FR-D8).
   *
   * @param {string} deliveryId - Delivery to release.
   * @returns {Promise<DeliveryModel | null>} The reopened delivery.
   */
  async release(deliveryId) {
    return this.run(async () => {
      const released = new DeliveryModel(await this.api.deliveries.release(deliveryId));
      this.setState({ active: null });
      await this.loadFeed({ silent: true });
      return released;
    });
  }

  /**
   * Loads the earnings summary and history (FR-D7).
   *
   * @returns {Promise<Record<string, unknown> | null>} Earnings.
   */
  async loadEarnings() {
    return this.run(async () => {
      const earnings = await this.api.deliveries.earnings();
      this.setState({
        earnings: { ...earnings, history: DeliveryModel.listFrom(earnings.history) },
      });
      return earnings;
    });
  }

  /**
   * Dismisses the "somebody else took it" notice.
   *
   * @returns {void}
   */
  dismissLostRace() {
    this.setState({ lostRace: null });
  }
}
