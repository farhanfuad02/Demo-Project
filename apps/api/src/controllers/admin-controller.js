/**
 * @file HTTP entry for administration.
 *
 * @module controllers/admin-controller
 */

import { BaseController } from '../core/base-controller.js';
import { QueryOptions } from '../utils/query-options.js';

/**
 * Epic G over HTTP.
 *
 * @augments BaseController
 */
export class AdminController extends BaseController {
  /** @type {import('../services/admin-service.js').AdminService} */
  #adminService;

  /** @type {import('../services/analytics-service.js').AnalyticsService} */
  #analyticsService;

  /** @type {import('../services/settings-service.js').SettingsService} */
  #settingsService;

  /** @type {import('../services/rating-service.js').RatingService} */
  #ratingService;

  /**
   * @param {object} dependencies - Injected collaborators.
   * @param {import('../services/admin-service.js').AdminService} dependencies.adminService -
   *   Administration rules.
   * @param {import('../services/analytics-service.js').AnalyticsService} dependencies.analyticsService -
   *   Platform analytics.
   * @param {import('../services/settings-service.js').SettingsService} dependencies.settingsService -
   *   Tunable parameters.
   * @param {import('../services/rating-service.js').RatingService} dependencies.ratingService -
   *   Review moderation.
   */
  constructor({ adminService, analyticsService, settingsService, ratingService }) {
    super();
    this.#adminService = adminService;
    this.#analyticsService = analyticsService;
    this.#settingsService = settingsService;
    this.#ratingService = ratingService;
  }

  /**
   * Headline counts for the dashboard.
   *
   * @param {import('express').Request} request - Incoming request.
   * @param {import('express').Response} response - Outgoing response.
   * @returns {Promise<import('express').Response>} The response.
   */
  async summary(request, response) {
    return this.ok(response, await this.#adminService.summary(this.actor(request)));
  }

  /**
   * The shop approval queue (FR-G1).
   *
   * @param {import('express').Request} request - Incoming request.
   * @param {import('express').Response} response - Outgoing response.
   * @returns {Promise<import('express').Response>} The response.
   */
  async shopQueue(request, response) {
    const query = this.query(request);
    const page = await this.#adminService.shopQueue(
      this.actor(request),
      query.status,
      new QueryOptions(query)
    );
    return this.okPaginated(response, page);
  }

  /**
   * Approves or rejects a shop application (FR-G1).
   *
   * @param {import('express').Request} request - Incoming request.
   * @param {import('express').Response} response - Outgoing response.
   * @returns {Promise<import('express').Response>} The response.
   */
  async decideShop(request, response) {
    const { approved, reason } = this.body(request);
    const shop = await this.#adminService.decideShop(
      this.actor(request),
      request.params.shopId,
      approved,
      reason
    );
    return this.ok(response, shop);
  }

  /**
   * The user directory (FR-G2).
   *
   * @param {import('express').Request} request - Incoming request.
   * @param {import('express').Response} response - Outgoing response.
   * @returns {Promise<import('express').Response>} The response.
   */
  async users(request, response) {
    const query = this.query(request);
    const page = await this.#adminService.users(
      this.actor(request),
      { role: query.role, status: query.status, search: query.search },
      new QueryOptions(query)
    );
    return this.okPaginated(response, page);
  }

  /**
   * Suspends or reactivates an account (FR-G2).
   *
   * @param {import('express').Request} request - Incoming request.
   * @param {import('express').Response} response - Outgoing response.
   * @returns {Promise<import('express').Response>} The response.
   */
  async setUserStatus(request, response) {
    const user = await this.#adminService.setUserSuspended(
      this.actor(request),
      request.params.userId,
      this.body(request).suspended
    );
    return this.ok(response, user);
  }

  /**
   * The live orders monitor (FR-G3).
   *
   * @param {import('express').Request} request - Incoming request.
   * @param {import('express').Response} response - Outgoing response.
   * @returns {Promise<import('express').Response>} The response.
   */
  async orders(request, response) {
    const query = this.query(request);
    const page = await this.#adminService.orders(
      this.actor(request),
      { status: query.status, stuckMinutes: query.stuckMinutes },
      new QueryOptions({ ...query, sortBy: 'placed_at' })
    );
    return this.okPaginated(response, page);
  }

  /**
   * Intervenes in a stuck or disputed order (FR-G3).
   *
   * @param {import('express').Request} request - Incoming request.
   * @param {import('express').Response} response - Outgoing response.
   * @returns {Promise<import('express').Response>} The response.
   */
  async resolveOrder(request, response) {
    const { action, reason } = this.body(request);
    const actor = this.actor(request);
    const { orderId } = request.params;

    if (action === 'reassign') {
      return this.ok(response, await this.#adminService.reassignDelivery(actor, orderId));
    }
    return this.ok(
      response,
      await this.#adminService.forceCancelOrder(actor, orderId, reason ?? 'Cancelled by an admin.')
    );
  }

  /**
   * The audit log viewer (NFR-13).
   *
   * @param {import('express').Request} request - Incoming request.
   * @param {import('express').Response} response - Outgoing response.
   * @returns {Promise<import('express').Response>} The response.
   */
  async auditLog(request, response) {
    const query = this.query(request);
    const page = await this.#adminService.auditLog(
      this.actor(request),
      { entityType: query.entityType, entityId: query.entityId },
      new QueryOptions({ ...query, sortBy: 'created_at' })
    );
    return this.okPaginated(response, page);
  }

  /**
   * Platform-wide analytics (FR-G5).
   *
   * @param {import('express').Request} request - Incoming request.
   * @param {import('express').Response} response - Outgoing response.
   * @returns {Promise<import('express').Response>} The response.
   */
  async analytics(request, response) {
    const analytics = await this.#analyticsService.forPlatform(
      this.actor(request),
      this.query(request).days
    );
    return this.ok(response, analytics);
  }

  /**
   * Reads the tunable parameters (FR-G6).
   *
   * @param {import('express').Request} request - Incoming request.
   * @param {import('express').Response} response - Outgoing response.
   * @returns {Promise<import('express').Response>} The response.
   */
  async settings(request, response) {
    this.actor(request);
    return this.ok(response, await this.#settingsService.all());
  }

  /**
   * Changes one tunable parameter (FR-G6).
   *
   * @param {import('express').Request} request - Incoming request.
   * @param {import('express').Response} response - Outgoing response.
   * @returns {Promise<import('express').Response>} The response.
   */
  async updateSetting(request, response) {
    const { key, value } = this.body(request);
    const settings = await this.#settingsService.set(this.actor(request), key, value);
    return this.ok(response, settings);
  }

  /**
   * Removes an abusive review comment (FR-G4).
   *
   * @param {import('express').Request} request - Incoming request.
   * @param {import('express').Response} response - Outgoing response.
   * @returns {Promise<import('express').Response>} The response.
   */
  async moderateReview(request, response) {
    const rating = await this.#ratingService.moderate(this.actor(request), request.params.ratingId);
    return this.ok(response, rating);
  }
}
