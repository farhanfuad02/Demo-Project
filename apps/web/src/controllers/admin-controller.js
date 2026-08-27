/**
 * @file Client controller for the admin dashboard.
 *
 * @module controllers/admin-controller
 */

import { BaseController } from './base-controller.js';
import { OrderModel } from '../models/order-model.js';
import { ShopModel } from '../models/shop-model.js';

/**
 * Epic G: approvals, users, the live orders monitor, analytics, and settings.
 *
 * @augments BaseController
 */
export class AdminController extends BaseController {
  /**
   * @param {import('../services/api-client.js').ApiClient} api - API gateways.
   */
  constructor(api) {
    super(api, {
      summary: null,
      shops: [],
      users: [],
      orders: [],
      auditLog: [],
      analytics: null,
      settings: null,
    });
  }

  /**
   * Loads the dashboard counts.
   *
   * @returns {Promise<Record<string, unknown> | null>} Headline counts.
   */
  async loadSummary() {
    return this.run(async () => {
      const summary = await this.api.admin.summary();
      this.setState({ summary });
      return summary;
    });
  }

  /**
   * Loads the shop approval queue (FR-G1).
   *
   * @param {string} [status] - Which queue to show.
   * @returns {Promise<ShopModel[] | null>} Shops.
   */
  async loadShops(status = 'pending') {
    return this.run(async () => {
      const page = await this.api.admin.shops({ status });
      const shops = ShopModel.listFrom(page.data);
      this.setState({ shops });
      return shops;
    });
  }

  /**
   * Approves or rejects a shop application (FR-G1).
   *
   * @param {string} shopId - Shop being decided on.
   * @param {boolean} approved - The decision.
   * @param {string} [reason] - Why; required to reject.
   * @param {string} [queue] - Queue to reload afterwards.
   * @returns {Promise<ShopModel[] | null>} The refreshed queue.
   */
  async decideShop(shopId, approved, reason, queue = 'pending') {
    return this.run(async () => {
      await this.api.admin.decideShop(shopId, approved, reason);
      return this.loadShops(queue);
    });
  }

  /**
   * Loads the user directory (FR-G2).
   *
   * @param {Record<string, unknown>} [filters] - Role, status, and search text.
   * @returns {Promise<unknown[] | null>} Accounts.
   */
  async loadUsers(filters = {}) {
    return this.run(async () => {
      const page = await this.api.admin.users(filters);
      this.setState({ users: page.data, userFilters: filters });
      return page.data;
    });
  }

  /**
   * Suspends or reactivates an account (FR-G2).
   *
   * @param {string} userId - Account to change.
   * @param {boolean} suspended - Desired state.
   * @returns {Promise<unknown[] | null>} The refreshed directory.
   */
  async setUserSuspended(userId, suspended) {
    return this.run(async () => {
      await this.api.admin.setUserSuspended(userId, suspended);
      return this.loadUsers(this.state.userFilters ?? {});
    });
  }

  /**
   * Loads the live orders monitor (FR-G3).
   *
   * @param {Record<string, unknown>} [filters] - Status and the stuck threshold.
   * @returns {Promise<OrderModel[] | null>} Orders.
   */
  async loadOrders(filters = {}) {
    return this.run(async () => {
      const page = await this.api.admin.orders(filters);
      const orders = OrderModel.listFrom(page.data);
      this.setState({ orders, orderFilters: filters });
      return orders;
    });
  }

  /**
   * Intervenes in a stuck or disputed order (FR-G3).
   *
   * @param {string} orderId - Order to act on.
   * @param {string} action - Either `cancel` or `reassign`.
   * @param {string} [reason] - Why.
   * @returns {Promise<OrderModel[] | null>} The refreshed monitor.
   */
  async resolveOrder(orderId, action, reason) {
    return this.run(async () => {
      await this.api.admin.resolveOrder(orderId, action, reason);
      return this.loadOrders(this.state.orderFilters ?? {});
    });
  }

  /**
   * Loads the audit trail (NFR-13).
   *
   * @param {Record<string, unknown>} [filters] - Entity type and id.
   * @returns {Promise<unknown[] | null>} Entries.
   */
  async loadAuditLog(filters = {}) {
    return this.run(async () => {
      const page = await this.api.admin.auditLog(filters);
      this.setState({ auditLog: page.data });
      return page.data;
    });
  }

  /**
   * Loads platform analytics (FR-G5).
   *
   * @param {number} [days] - Window length.
   * @returns {Promise<Record<string, unknown> | null>} Analytics.
   */
  async loadAnalytics(days = 7) {
    return this.run(async () => {
      const analytics = await this.api.admin.analytics(days);
      this.setState({ analytics });
      return analytics;
    });
  }

  /**
   * Loads the tunable parameters (FR-G6).
   *
   * @returns {Promise<Record<string, unknown> | null>} Effective settings.
   */
  async loadSettings() {
    return this.run(async () => {
      const settings = await this.api.admin.settings();
      this.setState({ settings });
      return settings;
    });
  }

  /**
   * Changes a tunable parameter (FR-G6).
   *
   * @param {string} key - Parameter name.
   * @param {unknown} value - New value.
   * @returns {Promise<Record<string, unknown> | null>} The effective settings.
   */
  async updateSetting(key, value) {
    return this.run(async () => {
      const settings = await this.api.admin.updateSetting(key, value);
      this.setState({ settings });
      return settings;
    });
  }
}
