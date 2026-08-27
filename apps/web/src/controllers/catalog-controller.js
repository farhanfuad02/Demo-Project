/**
 * @file Client controller for browsing shops, menus, and search.
 *
 * @module controllers/catalog-controller
 */

import { BaseController } from './base-controller.js';
import { MenuItemModel, ShopModel } from '../models/shop-model.js';

/**
 * Discovery: the shop list, one shop's menu, and search (FR-C1 to FR-C3).
 *
 * @augments BaseController
 */
export class CatalogController extends BaseController {
  /**
   * @param {import('../services/api-client.js').ApiClient} api - API gateways.
   */
  constructor(api) {
    super(api, {
      shops: [],
      shop: null,
      reviews: [],
      searchResults: null,
      filters: { search: '', openOnly: false },
    });
  }

  /**
   * Loads the shop list (FR-C1).
   *
   * @param {Record<string, unknown>} [filters] - Search text and the open-only toggle.
   * @returns {Promise<ShopModel[] | null>} The shops.
   */
  async loadShops(filters = {}) {
    const merged = { ...this.state.filters, ...filters };
    this.setState({ filters: merged });
    return this.run(async () => {
      const page = await this.api.shops.browse({
        search: merged.search || undefined,
        openOnly: merged.openOnly ? 'true' : undefined,
      });
      const shops = ShopModel.listFrom(page.data);
      this.setState({ shops, meta: page.meta });
      return shops;
    });
  }

  /**
   * Loads one shop with its menu and reviews (HJU-C02).
   *
   * The two requests go out together: they are independent, and a menu that waits for a
   * review list it does not need is a slower page for no reason (NFR-01).
   *
   * @param {string} shopId - Shop to load.
   * @returns {Promise<ShopModel | null>} The shop.
   */
  async loadShop(shopId) {
    return this.run(async () => {
      const [detail, reviews] = await Promise.all([
        this.api.shops.detail(shopId),
        this.api.shops.reviews(shopId),
      ]);
      const shop = new ShopModel(detail);
      this.setState({ shop, reviews: reviews.data });
      return shop;
    });
  }

  /**
   * Searches dishes and shops (FR-C2, FR-C3).
   *
   * @param {string} query - What the student typed.
   * @param {Record<string, unknown>} [filters] - Category, price ceiling, open-only.
   * @returns {Promise<Record<string, unknown> | null>} Matching dishes and shops.
   */
  async search(query, filters = {}) {
    return this.run(async () => {
      const results = await this.api.shops.search({
        q: query,
        category: filters.category || undefined,
        maxPrice: filters.maxPrice || undefined,
        openOnly: filters.openOnly ? 'true' : undefined,
      });
      const searchResults = {
        items: MenuItemModel.listFrom(results.items),
        shops: ShopModel.listFrom(results.shops),
      };
      this.setState({ searchResults });
      return searchResults;
    });
  }

  /**
   * Clears the search results, returning the page to the browse list.
   *
   * @returns {void}
   */
  clearSearch() {
    this.setState({ searchResults: null });
  }
}
