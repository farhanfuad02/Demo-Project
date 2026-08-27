/**
 * @file HTTP entry for shops and their menus.
 *
 * @module controllers/shop-controller
 */

import { BaseController } from '../core/base-controller.js';
import { QueryOptions } from '../utils/query-options.js';

/**
 * Epic B and the discovery half of Epic C.
 *
 * @augments BaseController
 */
export class ShopController extends BaseController {
  /** @type {import('../services/shop-service.js').ShopService} */
  #shopService;

  /** @type {import('../services/menu-service.js').MenuService} */
  #menuService;

  /** @type {import('../services/rating-service.js').RatingService} */
  #ratingService;

  /** @type {import('../services/analytics-service.js').AnalyticsService} */
  #analyticsService;

  /**
   * @param {object} dependencies - Injected collaborators.
   * @param {import('../services/shop-service.js').ShopService} dependencies.shopService -
   *   Shop rules.
   * @param {import('../services/menu-service.js').MenuService} dependencies.menuService -
   *   Menu rules and search.
   * @param {import('../services/rating-service.js').RatingService} dependencies.ratingService -
   *   Shop reviews.
   * @param {import('../services/analytics-service.js').AnalyticsService} dependencies.analyticsService -
   *   Vendor sales analytics.
   */
  constructor({ shopService, menuService, ratingService, analyticsService }) {
    super();
    this.#shopService = shopService;
    this.#menuService = menuService;
    this.#ratingService = ratingService;
    this.#analyticsService = analyticsService;
  }

  /**
   * A vendor's sales dashboard (FR-B6).
   *
   * @param {import('express').Request} request - Incoming request.
   * @param {import('express').Response} response - Outgoing response.
   * @returns {Promise<import('express').Response>} The response.
   */
  async analytics(request, response) {
    const analytics = await this.#analyticsService.forShop(
      this.actor(request),
      request.params.shopId,
      this.query(request).days
    );
    return this.ok(response, analytics);
  }

  /**
   * Lists shops students may order from (FR-C1).
   *
   * @param {import('express').Request} request - Incoming request.
   * @param {import('express').Response} response - Outgoing response.
   * @returns {Promise<import('express').Response>} The response.
   */
  async index(request, response) {
    const query = this.query(request);
    const page = await this.#shopService.browse(
      { search: query.search, openOnly: query.openOnly },
      new QueryOptions(query)
    );
    return this.okPaginated(response, page);
  }

  /**
   * Returns one shop with its menu (HJU-C02).
   *
   * @param {import('express').Request} request - Incoming request.
   * @param {import('express').Response} response - Outgoing response.
   * @returns {Promise<import('express').Response>} The response.
   */
  async show(request, response) {
    return this.ok(response, await this.#shopService.detail(request.params.shopId));
  }

  /**
   * Registers a shop for admin approval (FR-B1).
   *
   * @param {import('express').Request} request - Incoming request.
   * @param {import('express').Response} response - Outgoing response.
   * @returns {Promise<import('express').Response>} The response.
   */
  async register(request, response) {
    const shop = await this.#shopService.register(this.actor(request), this.body(request));
    return this.created(response, shop.toJSON());
  }

  /**
   * Returns the signed-in vendor's own shop, approval status included.
   *
   * @param {import('express').Request} request - Incoming request.
   * @param {import('express').Response} response - Outgoing response.
   * @returns {Promise<import('express').Response>} The response.
   */
  async mine(request, response) {
    const shop = await this.#shopService.myShop(this.actor(request));
    return this.ok(response, shop ? shop.toJSON() : null);
  }

  /**
   * Updates shop details.
   *
   * @param {import('express').Request} request - Incoming request.
   * @param {import('express').Response} response - Outgoing response.
   * @returns {Promise<import('express').Response>} The response.
   */
  async update(request, response) {
    const shop = await this.#shopService.updateDetails(
      this.actor(request),
      request.params.shopId,
      this.body(request)
    );
    return this.ok(response, shop.toJSON());
  }

  /**
   * Opens or closes a shop (FR-B3).
   *
   * @param {import('express').Request} request - Incoming request.
   * @param {import('express').Response} response - Outgoing response.
   * @returns {Promise<import('express').Response>} The response.
   */
  async setStatus(request, response) {
    const shop = await this.#shopService.setOpen(
      this.actor(request),
      request.params.shopId,
      this.body(request).isOpen
    );
    return this.ok(response, shop.toJSON());
  }

  /**
   * Lists a shop's menu.
   *
   * @param {import('express').Request} request - Incoming request.
   * @param {import('express').Response} response - Outgoing response.
   * @returns {Promise<import('express').Response>} The response.
   */
  async menu(request, response) {
    return this.ok(response, await this.#menuService.listForShop(request.params.shopId));
  }

  /**
   * Adds an item to a shop's menu (FR-B2).
   *
   * @param {import('express').Request} request - Incoming request.
   * @param {import('express').Response} response - Outgoing response.
   * @returns {Promise<import('express').Response>} The response.
   */
  async addMenuItem(request, response) {
    const item = await this.#menuService.create(
      this.actor(request),
      request.params.shopId,
      this.body(request)
    );
    return this.created(response, item);
  }

  /**
   * Edits a menu item (FR-B2).
   *
   * @param {import('express').Request} request - Incoming request.
   * @param {import('express').Response} response - Outgoing response.
   * @returns {Promise<import('express').Response>} The response.
   */
  async updateMenuItem(request, response) {
    const item = await this.#menuService.update(
      this.actor(request),
      request.params.itemId,
      this.body(request)
    );
    return this.ok(response, item);
  }

  /**
   * Marks an item sold out or back in stock (FR-B2).
   *
   * @param {import('express').Request} request - Incoming request.
   * @param {import('express').Response} response - Outgoing response.
   * @returns {Promise<import('express').Response>} The response.
   */
  async setMenuItemAvailability(request, response) {
    const item = await this.#menuService.setAvailability(
      this.actor(request),
      request.params.itemId,
      this.body(request).isAvailable
    );
    return this.ok(response, item);
  }

  /**
   * Removes a menu item (FR-B2).
   *
   * @param {import('express').Request} request - Incoming request.
   * @param {import('express').Response} response - Outgoing response.
   * @returns {Promise<import('express').Response>} The response.
   */
  async removeMenuItem(request, response) {
    await this.#menuService.remove(this.actor(request), request.params.itemId);
    return this.noContent(response);
  }

  /**
   * Lists a shop's reviews.
   *
   * @param {import('express').Request} request - Incoming request.
   * @param {import('express').Response} response - Outgoing response.
   * @returns {Promise<import('express').Response>} The response.
   */
  async reviews(request, response) {
    const page = await this.#ratingService.forShop(
      request.params.shopId,
      new QueryOptions({ ...this.query(request), sortBy: 'created_at' })
    );
    return this.okPaginated(response, page);
  }

  /**
   * Searches dishes and shops (FR-C2, FR-C3).
   *
   * @param {import('express').Request} request - Incoming request.
   * @param {import('express').Response} response - Outgoing response.
   * @returns {Promise<import('express').Response>} The response.
   */
  async search(request, response) {
    const query = this.query(request);
    const results = await this.#menuService.search(query.q, {
      category: query.category,
      maxPrice: query.maxPrice,
      openOnly: query.openOnly,
    });
    return this.ok(response, results);
  }
}
