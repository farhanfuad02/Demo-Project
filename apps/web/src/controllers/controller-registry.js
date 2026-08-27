/**
 * @file Client-side dependency graph: one instance of each controller per browser tab.
 *
 * @module controllers/controller-registry
 */

import { ApiClient } from '../services/api-client.js';
import { HttpClient } from '../services/http-client.js';
import { AdminController } from './admin-controller.js';
import { CartController } from './cart-controller.js';
import { CatalogController } from './catalog-controller.js';
import { DeliverController } from './deliver-controller.js';
import { NotificationController } from './notification-controller.js';
import { OrderController } from './order-controller.js';
import { SessionController } from './session-controller.js';
import { VendorController } from './vendor-controller.js';

/**
 * Builds and holds the client's controllers.
 *
 * This is the browser-side counterpart of the server's DI container, and it exists for
 * the same reason: every controller takes its collaborators through its constructor, so
 * something has to assemble them, and doing it in one place keeps that graph readable.
 *
 * Instances are shared across the whole tab, which is what lets the cart badge in the
 * header and the Add button on a menu page be the same state rather than two copies of
 * it that drift apart.
 */
export class ControllerRegistry {
  /** @type {HttpClient} */
  #http;

  /** @type {ApiClient} */
  #api;

  /**
   * @param {object} [options] - Registry configuration.
   * @param {string} [options.baseUrl] - API prefix; the Next.js rewrite serves `/api`.
   */
  constructor({ baseUrl = '/api' } = {}) {
    this.#http = new HttpClient({ baseUrl });
    this.#api = new ApiClient(this.#http);

    this.session = new SessionController(this.#api);
    this.catalog = new CatalogController(this.#api);
    this.cart = new CartController(this.#api);
    this.orders = new OrderController(this.#api);
    this.deliver = new DeliverController(this.#api);
    this.vendor = new VendorController(this.#api);
    this.admin = new AdminController(this.#api);
    this.notifications = new NotificationController(this.#api);
  }

  /**
   * The API client, for a view that needs a call no controller wraps yet.
   *
   * @returns {ApiClient} API client.
   */
  get api() {
    return this.#api;
  }

  /**
   * Stops every background timer.
   *
   * Called when the provider unmounts. Timers that outlive their page keep polling an
   * API nobody is looking at, and in development survive a hot reload to poll twice.
   *
   * @returns {void}
   */
  dispose() {
    this.orders.stopTracking();
    this.deliver.stopFeed();
    this.vendor.stopBoard();
    this.notifications.stopPolling();
  }
}
