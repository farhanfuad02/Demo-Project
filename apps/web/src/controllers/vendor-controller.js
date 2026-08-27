/**
 * @file Client controller for the vendor dashboard.
 *
 * @module controllers/vendor-controller
 */

import { ORDER_STATUS } from '@hungry-ju/shared/enums';
import { REALTIME } from '@hungry-ju/shared/constants';
import { BaseController } from './base-controller.js';
import { MenuItemModel, ShopModel } from '../models/shop-model.js';
import { OrderModel } from '../models/order-model.js';

/** Statuses the vendor board shows, in the order the kanban columns appear. */
export const BOARD_COLUMNS = Object.freeze([
  { status: ORDER_STATUS.PLACED, label: 'New' },
  { status: ORDER_STATUS.ACCEPTED, label: 'Accepted' },
  { status: ORDER_STATUS.PREPARING, label: 'Preparing' },
  { status: ORDER_STATUS.READY, label: 'Ready' },
]);

/**
 * Epic B: the vendor's shop, menu, order board, and analytics.
 *
 * @augments BaseController
 */
export class VendorController extends BaseController {
  /** @type {ReturnType<typeof setInterval> | null} */
  #boardTimer = null;

  /**
   * @param {import('../services/api-client.js').ApiClient} api - API gateways.
   */
  constructor(api) {
    super(api, { shop: null, menu: [], orders: [], analytics: null, loaded: false });
  }

  /**
   * The vendor's shop.
   *
   * @returns {ShopModel | null} Shop, or `null` when not registered yet.
   */
  get shop() {
    return /** @type {ShopModel | null} */ (this.state.shop);
  }

  /**
   * Loads the vendor's shop and, when it exists, its menu.
   *
   * @returns {Promise<ShopModel | null>} The shop.
   */
  async loadShop() {
    return this.run(async () => {
      const shop = ShopModel.maybeFrom(await this.api.shops.mine());
      this.setState({ shop, loaded: true });
      if (shop) {
        await this.loadMenu();
      }
      return shop;
    });
  }

  /**
   * Registers a shop for admin approval (FR-B1).
   *
   * @param {Record<string, unknown>} details - Shop details.
   * @returns {Promise<ShopModel | null>} The pending shop.
   */
  async registerShop(details) {
    return this.run(async () => {
      const shop = new ShopModel(await this.api.shops.register(details));
      this.setState({ shop, loaded: true });
      return shop;
    });
  }

  /**
   * Opens or closes the shop (FR-B3).
   *
   * @param {boolean} isOpen - Desired state.
   * @returns {Promise<ShopModel | null>} The updated shop.
   */
  async setOpen(isOpen) {
    return this.run(async () => {
      const shop = new ShopModel(await this.api.shops.setOpen(this.shop.id, isOpen));
      this.setState({ shop });
      return shop;
    });
  }

  /**
   * Loads the menu (FR-B2).
   *
   * @returns {Promise<MenuItemModel[] | null>} Menu items.
   */
  async loadMenu() {
    const menu = MenuItemModel.listFrom(await this.api.shops.menu(this.shop.id));
    this.setState({ menu });
    return menu;
  }

  /**
   * Adds a menu item (FR-B2).
   *
   * @param {Record<string, unknown>} item - Item details.
   * @returns {Promise<MenuItemModel[] | null>} The updated menu.
   */
  async addMenuItem(item) {
    return this.run(async () => {
      await this.api.shops.addMenuItem(this.shop.id, item);
      return this.loadMenu();
    });
  }

  /**
   * Edits a menu item (FR-B2).
   *
   * @param {string} itemId - Item to edit.
   * @param {Record<string, unknown>} changes - Fields to update.
   * @returns {Promise<MenuItemModel[] | null>} The updated menu.
   */
  async updateMenuItem(itemId, changes) {
    return this.run(async () => {
      await this.api.shops.updateMenuItem(this.shop.id, itemId, changes);
      return this.loadMenu();
    });
  }

  /**
   * Marks an item sold out or back in stock (FR-B2).
   *
   * The menu is patched in place rather than reloaded: this is the one-tap control a
   * vendor uses mid-rush, and it has to feel instant (risk R3).
   *
   * @param {string} itemId - Item to toggle.
   * @param {boolean} isAvailable - Desired state.
   * @returns {Promise<MenuItemModel | null>} The updated item.
   */
  async setItemAvailability(itemId, isAvailable) {
    return this.run(async () => {
      const updated = new MenuItemModel(
        await this.api.shops.setMenuItemAvailability(this.shop.id, itemId, isAvailable)
      );
      this.setState({
        menu: this.state.menu.map((item) => (item.id === itemId ? updated : item)),
      });
      return updated;
    });
  }

  /**
   * Removes a menu item (FR-B2).
   *
   * @param {string} itemId - Item to remove.
   * @returns {Promise<MenuItemModel[] | null>} The updated menu.
   */
  async removeMenuItem(itemId) {
    return this.run(async () => {
      await this.api.shops.removeMenuItem(this.shop.id, itemId);
      return this.loadMenu();
    });
  }

  /**
   * Loads the order board (FR-B4).
   *
   * @param {object} [options] - Behaviour.
   * @param {boolean} [options.silent] - Skip the loading flag, for the auto-refresh.
   * @returns {Promise<OrderModel[] | null>} Orders on the board.
   */
  async loadBoard({ silent = false } = {}) {
    return this.run(
      async () => {
        const page = await this.api.shops.board(this.shop.id, {
          statuses: BOARD_COLUMNS.map((column) => column.status).join(','),
          limit: 50,
        });
        const orders = OrderModel.listFrom(page.data);
        this.setState({ orders });
        return orders;
      },
      { silent }
    );
  }

  /**
   * Starts auto-refreshing the board.
   *
   * A vendor is not going to sit refreshing a browser while cooking, and BR-11 gives
   * them a countdown to answer within — so the board has to come to them.
   *
   * @returns {void}
   */
  startBoard() {
    this.stopBoard();
    void this.loadBoard();
    this.#boardTimer = setInterval(() => {
      void this.loadBoard({ silent: true });
    }, REALTIME.POLL_INTERVAL_MS);
  }

  /**
   * Stops auto-refreshing the board.
   *
   * @returns {void}
   */
  stopBoard() {
    if (this.#boardTimer) {
      clearInterval(this.#boardTimer);
      this.#boardTimer = null;
    }
  }

  /**
   * Accepts an order (FR-B4).
   *
   * @param {string} orderId - Order to accept.
   * @returns {Promise<OrderModel[] | null>} The refreshed board.
   */
  async acceptOrder(orderId) {
    return this.run(async () => {
      await this.api.orders.accept(orderId);
      return this.loadBoard({ silent: true });
    });
  }

  /**
   * Refuses an order (FR-B4).
   *
   * @param {string} orderId - Order to reject.
   * @param {string} reason - Why.
   * @returns {Promise<OrderModel[] | null>} The refreshed board.
   */
  async rejectOrder(orderId, reason) {
    return this.run(async () => {
      await this.api.orders.reject(orderId, reason);
      return this.loadBoard({ silent: true });
    });
  }

  /**
   * Moves an order to preparing or ready (FR-B5).
   *
   * @param {string} orderId - Order to advance.
   * @param {string} status - Next status.
   * @returns {Promise<OrderModel[] | null>} The refreshed board.
   */
  async advanceOrder(orderId, status) {
    return this.run(async () => {
      await this.api.orders.advance(orderId, status);
      return this.loadBoard({ silent: true });
    });
  }

  /**
   * Loads sales analytics (FR-B6).
   *
   * @param {number} [days] - Window length.
   * @returns {Promise<Record<string, unknown> | null>} Analytics.
   */
  async loadAnalytics(days = 7) {
    return this.run(async () => {
      const analytics = await this.api.shops.analytics(this.shop.id, days);
      this.setState({ analytics });
      return analytics;
    });
  }

  /**
   * Splits the board into its kanban columns.
   *
   * @returns {Array<{ status: string, label: string, orders: OrderModel[] }>} Columns.
   */
  columns() {
    return BOARD_COLUMNS.map((column) => ({
      ...column,
      orders: this.state.orders.filter((order) => order.status === column.status),
    }));
  }
}
