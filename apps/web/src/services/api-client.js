/**
 * @file Typed gateways over the REST API, grouped by resource.
 *
 * @module services/api-client
 */

/**
 * Base class for a resource gateway.
 *
 * Each gateway is the one place that knows a URL. Controllers call methods with names
 * from the domain — `place`, `accept`, `release` — and never assemble a path, so a route
 * change is a one-line edit here rather than a search across the view layer.
 *
 * @abstract
 */
class ResourceGateway {
  /** @type {import('./http-client.js').HttpClient} */
  #http;

  /**
   * @param {import('./http-client.js').HttpClient} http - Transport.
   * @throws {TypeError} When constructed directly instead of through a subclass.
   */
  constructor(http) {
    if (new.target === ResourceGateway) {
      throw new TypeError('ResourceGateway is abstract');
    }
    this.#http = http;
  }

  /**
   * The transport, for subclasses.
   *
   * @returns {import('./http-client.js').HttpClient} Transport.
   */
  get http() {
    return this.#http;
  }
}

/**
 * Epic A endpoints.
 *
 * @augments ResourceGateway
 */
export class AuthGateway extends ResourceGateway {
  /**
   * Registers an account (FR-A1).
   *
   * @param {Record<string, unknown>} payload - Registration fields.
   * @returns {Promise<Record<string, unknown>>} The pending account and verification link.
   */
  async register(payload) {
    return this.http.post('/auth/register', payload);
  }

  /**
   * Signs in (FR-A4).
   *
   * @param {string} identifier - E-mail address or phone number.
   * @param {string} password - Password.
   * @returns {Promise<Record<string, unknown>>} Account and access token.
   */
  async login(identifier, password) {
    return this.http.post('/auth/login', { identifier, password });
  }

  /**
   * Signs out (FR-A9).
   *
   * @returns {Promise<unknown>} Confirmation.
   */
  async logout() {
    return this.http.post('/auth/logout');
  }

  /**
   * Restores a session from the refresh cookie on a page load.
   *
   * @returns {Promise<Record<string, unknown>>} Account and access token.
   */
  async refresh() {
    return this.http.request('/auth/refresh', { method: 'POST', retryOnExpiry: false });
  }

  /**
   * Activates an account (FR-A2).
   *
   * @param {string} token - Token from the verification link.
   * @returns {Promise<Record<string, unknown>>} The verified account.
   */
  async verify(token) {
    return this.http.post('/auth/verify', { token });
  }

  /**
   * Re-sends the verification link.
   *
   * @param {string} identifier - E-mail address or phone number.
   * @returns {Promise<Record<string, unknown>>} Confirmation.
   */
  async resendVerification(identifier) {
    return this.http.post('/auth/verify/resend', { identifier });
  }

  /**
   * Starts a password reset (FR-A5).
   *
   * @param {string} identifier - E-mail address or phone number.
   * @returns {Promise<Record<string, unknown>>} Confirmation.
   */
  async forgotPassword(identifier) {
    return this.http.post('/auth/forgot-password', { identifier });
  }

  /**
   * Completes a password reset (FR-A5).
   *
   * @param {string} token - Token from the reset link.
   * @param {string} password - New password.
   * @returns {Promise<Record<string, unknown>>} Confirmation.
   */
  async resetPassword(token, password) {
    return this.http.post('/auth/reset-password', { token, password });
  }

  /**
   * The signed-in account and profile.
   *
   * @returns {Promise<Record<string, unknown>>} Account and profile.
   */
  async me() {
    return this.http.get('/auth/me');
  }
}

/**
 * Profile and Deliver Mode endpoints.
 *
 * @augments ResourceGateway
 */
export class UserGateway extends ResourceGateway {
  /**
   * Updates editable profile fields (FR-A8).
   *
   * @param {Record<string, unknown>} changes - Fields to update.
   * @returns {Promise<Record<string, unknown>>} The updated profile.
   */
  async updateProfile(changes) {
    return this.http.patch('/users/profile', changes);
  }

  /**
   * Updates the delivery address (FR-A8).
   *
   * @param {Record<string, unknown>} location - Hall and room.
   * @returns {Promise<Record<string, unknown>>} The updated student profile.
   */
  async updateLocation(location) {
    return this.http.patch('/users/location', location);
  }

  /**
   * Turns Deliver Mode on or off (FR-D1).
   *
   * @param {boolean} enabled - Desired state.
   * @returns {Promise<Record<string, unknown>>} The updated student profile.
   */
  async setDeliverMode(enabled) {
    return this.http.patch('/users/deliver-mode', { enabled });
  }
}

/**
 * Shop, menu, and discovery endpoints.
 *
 * @augments ResourceGateway
 */
export class ShopGateway extends ResourceGateway {
  /**
   * Lists shops (FR-C1).
   *
   * @param {Record<string, unknown>} [query] - Filters and paging.
   * @returns {Promise<{ data: unknown[], meta: unknown }>} Page of shops.
   */
  async browse(query = {}) {
    return this.http.requestPage('/shops', query);
  }

  /**
   * One shop with its menu (HJU-C02).
   *
   * @param {string} shopId - Shop to load.
   * @returns {Promise<Record<string, unknown>>} Shop and menu.
   */
  async detail(shopId) {
    return this.http.get(`/shops/${shopId}`);
  }

  /**
   * A shop's reviews.
   *
   * @param {string} shopId - Shop to load.
   * @returns {Promise<{ data: unknown[], meta: unknown }>} Page of reviews.
   */
  async reviews(shopId) {
    return this.http.requestPage(`/shops/${shopId}/reviews`);
  }

  /**
   * Searches dishes and shops (FR-C2).
   *
   * @param {Record<string, unknown>} query - Search terms and filters.
   * @returns {Promise<Record<string, unknown>>} Matching dishes and shops.
   */
  async search(query) {
    return this.http.get('/search', query);
  }

  /**
   * The signed-in vendor's shop.
   *
   * @returns {Promise<Record<string, unknown> | null>} Shop, or `null` when unregistered.
   */
  async mine() {
    return this.http.get('/shops/mine');
  }

  /**
   * Registers a shop (FR-B1).
   *
   * @param {Record<string, unknown>} details - Shop details.
   * @returns {Promise<Record<string, unknown>>} The pending shop.
   */
  async register(details) {
    return this.http.post('/shops', details);
  }

  /**
   * Updates shop details.
   *
   * @param {string} shopId - Shop to update.
   * @param {Record<string, unknown>} changes - Fields to update.
   * @returns {Promise<Record<string, unknown>>} The updated shop.
   */
  async update(shopId, changes) {
    return this.http.patch(`/shops/${shopId}`, changes);
  }

  /**
   * Opens or closes a shop (FR-B3).
   *
   * @param {string} shopId - Shop to change.
   * @param {boolean} isOpen - Desired state.
   * @returns {Promise<Record<string, unknown>>} The updated shop.
   */
  async setOpen(shopId, isOpen) {
    return this.http.patch(`/shops/${shopId}/status`, { isOpen });
  }

  /**
   * A shop's menu.
   *
   * @param {string} shopId - Shop to load.
   * @returns {Promise<unknown[]>} Menu items.
   */
  async menu(shopId) {
    return this.http.get(`/shops/${shopId}/menu`);
  }

  /**
   * Adds a menu item (FR-B2).
   *
   * @param {string} shopId - Shop to add to.
   * @param {Record<string, unknown>} item - Item details.
   * @returns {Promise<Record<string, unknown>>} The created item.
   */
  async addMenuItem(shopId, item) {
    return this.http.post(`/shops/${shopId}/menu`, item);
  }

  /**
   * Edits a menu item (FR-B2).
   *
   * @param {string} shopId - Owning shop.
   * @param {string} itemId - Item to edit.
   * @param {Record<string, unknown>} changes - Fields to update.
   * @returns {Promise<Record<string, unknown>>} The updated item.
   */
  async updateMenuItem(shopId, itemId, changes) {
    return this.http.patch(`/shops/${shopId}/menu/${itemId}`, changes);
  }

  /**
   * Marks an item sold out or back in stock (FR-B2).
   *
   * @param {string} shopId - Owning shop.
   * @param {string} itemId - Item to toggle.
   * @param {boolean} isAvailable - Desired state.
   * @returns {Promise<Record<string, unknown>>} The updated item.
   */
  async setMenuItemAvailability(shopId, itemId, isAvailable) {
    return this.http.patch(`/shops/${shopId}/menu/${itemId}/availability`, { isAvailable });
  }

  /**
   * Removes a menu item (FR-B2).
   *
   * @param {string} shopId - Owning shop.
   * @param {string} itemId - Item to remove.
   * @returns {Promise<unknown>} Confirmation.
   */
  async removeMenuItem(shopId, itemId) {
    return this.http.delete(`/shops/${shopId}/menu/${itemId}`);
  }

  /**
   * The vendor order board (FR-B4).
   *
   * @param {string} shopId - Shop whose orders to list.
   * @param {Record<string, unknown>} [query] - Filters and paging.
   * @returns {Promise<{ data: unknown[], meta: unknown }>} Page of orders.
   */
  async board(shopId, query = {}) {
    return this.http.requestPage(`/shops/${shopId}/orders`, query);
  }

  /**
   * Vendor sales analytics (FR-B6).
   *
   * @param {string} shopId - Shop to report on.
   * @param {number} [days] - Window length.
   * @returns {Promise<Record<string, unknown>>} Analytics.
   */
  async analytics(shopId, days = 7) {
    return this.http.get(`/shops/${shopId}/analytics`, { days });
  }
}

/**
 * Cart endpoints.
 *
 * @augments ResourceGateway
 */
export class CartGateway extends ResourceGateway {
  /**
   * The current cart.
   *
   * @returns {Promise<Record<string, unknown>>} Cart with totals.
   */
  async show() {
    return this.http.get('/cart');
  }

  /**
   * Adds an item (FR-C4).
   *
   * @param {string} menuItemId - Item to add.
   * @param {number} [quantity] - Units to add.
   * @returns {Promise<Record<string, unknown>>} The updated cart.
   */
  async addItem(menuItemId, quantity = 1) {
    return this.http.post('/cart/items', { menuItemId, quantity });
  }

  /**
   * Changes a line's quantity (FR-C5).
   *
   * @param {string} menuItemId - Line to change.
   * @param {number} quantity - New quantity; `0` removes it.
   * @returns {Promise<Record<string, unknown>>} The updated cart.
   */
  async updateItem(menuItemId, quantity) {
    return this.http.patch(`/cart/items/${menuItemId}`, { quantity });
  }

  /**
   * Removes a line (FR-C5).
   *
   * @param {string} menuItemId - Line to remove.
   * @returns {Promise<Record<string, unknown>>} The updated cart.
   */
  async removeItem(menuItemId) {
    return this.http.delete(`/cart/items/${menuItemId}`);
  }

  /**
   * Empties the cart (BR-03).
   *
   * @returns {Promise<Record<string, unknown>>} The empty cart.
   */
  async clear() {
    return this.http.delete('/cart');
  }
}

/**
 * Order endpoints.
 *
 * @augments ResourceGateway
 */
export class OrderGateway extends ResourceGateway {
  /**
   * Places an order (UC-01).
   *
   * @param {Record<string, unknown>} details - Delivery location and note.
   * @returns {Promise<Record<string, unknown>>} The order and its confirmation PIN.
   */
  async place(details) {
    return this.http.post('/orders', details);
  }

  /**
   * Order history (FR-C8).
   *
   * @param {Record<string, unknown>} [query] - Filters and paging.
   * @returns {Promise<{ data: unknown[], meta: unknown }>} Page of orders.
   */
  async history(query = {}) {
    return this.http.requestPage('/orders', query);
  }

  /**
   * One order with its delivery (FR-E1).
   *
   * @param {string} orderId - Order to load.
   * @returns {Promise<Record<string, unknown>>} Order, shop, and delivery.
   */
  async detail(orderId) {
    return this.http.get(`/orders/${orderId}`);
  }

  /**
   * Cancels an order (UC-03).
   *
   * @param {string} orderId - Order to cancel.
   * @param {string} [reason] - Why.
   * @returns {Promise<Record<string, unknown>>} The cancelled order.
   */
  async cancel(orderId, reason) {
    return this.http.post(`/orders/${orderId}/cancel`, { reason });
  }

  /**
   * Refills the cart from a past order (FR-C8).
   *
   * @param {string} orderId - Order to repeat.
   * @returns {Promise<Record<string, unknown>>} The refilled cart.
   */
  async reorder(orderId) {
    return this.http.post(`/orders/${orderId}/reorder`);
  }

  /**
   * Ratings already left on an order.
   *
   * @param {string} orderId - Order to check.
   * @returns {Promise<unknown[]>} Existing ratings.
   */
  async ratings(orderId) {
    return this.http.get(`/orders/${orderId}/ratings`);
  }

  /**
   * Rates the shop or the delivery partner (FR-C9).
   *
   * @param {string} orderId - Order being rated.
   * @param {Record<string, unknown>} rating - Target, stars, and comment.
   * @returns {Promise<Record<string, unknown>>} The stored rating.
   */
  async rate(orderId, rating) {
    return this.http.post(`/orders/${orderId}/ratings`, rating);
  }

  /**
   * Vendor accepts an order (FR-B4).
   *
   * @param {string} orderId - Order to accept.
   * @returns {Promise<Record<string, unknown>>} The accepted order.
   */
  async accept(orderId) {
    return this.http.post(`/orders/${orderId}/accept`);
  }

  /**
   * Vendor refuses an order (FR-B4).
   *
   * @param {string} orderId - Order to reject.
   * @param {string} reason - Why.
   * @returns {Promise<Record<string, unknown>>} The rejected order.
   */
  async reject(orderId, reason) {
    return this.http.post(`/orders/${orderId}/reject`, { reason });
  }

  /**
   * Vendor advances an order (FR-B5).
   *
   * @param {string} orderId - Order to advance.
   * @param {string} status - Next status.
   * @returns {Promise<Record<string, unknown>>} The updated order.
   */
  async advance(orderId, status) {
    return this.http.patch(`/orders/${orderId}/status`, { status });
  }
}

/**
 * Delivery endpoints.
 *
 * @augments ResourceGateway
 */
export class DeliveryGateway extends ResourceGateway {
  /**
   * The open feed (FR-D2).
   *
   * @returns {Promise<unknown[]>} Claimable deliveries.
   */
  async available() {
    return this.http.get('/deliveries/available');
  }

  /**
   * Claims a delivery (UC-02).
   *
   * @param {string} deliveryId - Delivery to claim.
   * @returns {Promise<Record<string, unknown>>} The claimed delivery.
   */
  async accept(deliveryId) {
    return this.http.post(`/deliveries/${deliveryId}/accept`);
  }

  /**
   * The rider's current job.
   *
   * @returns {Promise<Record<string, unknown> | null>} Active delivery, or `null`.
   */
  async active() {
    return this.http.get('/deliveries/active');
  }

  /**
   * Advances a delivery (FR-D5).
   *
   * @param {string} deliveryId - Delivery to advance.
   * @param {string} status - Next status.
   * @returns {Promise<Record<string, unknown>>} The updated delivery.
   */
  async advance(deliveryId, status) {
    return this.http.patch(`/deliveries/${deliveryId}/status`, { status });
  }

  /**
   * Completes a delivery with the customer's PIN (FR-D6).
   *
   * @param {string} deliveryId - Delivery to complete.
   * @param {string} confirmPin - PIN read out by the customer.
   * @returns {Promise<Record<string, unknown>>} The completed delivery.
   */
  async complete(deliveryId, confirmPin) {
    return this.http.post(`/deliveries/${deliveryId}/complete`, { confirmPin });
  }

  /**
   * Returns a delivery to the pool (FR-D8).
   *
   * @param {string} deliveryId - Delivery to release.
   * @returns {Promise<Record<string, unknown>>} The reopened delivery.
   */
  async release(deliveryId) {
    return this.http.post(`/deliveries/${deliveryId}/release`);
  }

  /**
   * Earnings summary and history (FR-D7).
   *
   * @returns {Promise<Record<string, unknown>>} Earnings.
   */
  async earnings() {
    return this.http.get('/deliveries/earnings');
  }
}

/**
 * Notification endpoints.
 *
 * @augments ResourceGateway
 */
export class NotificationGateway extends ResourceGateway {
  /**
   * Notification history (FR-E4).
   *
   * @param {Record<string, unknown>} [query] - Paging.
   * @returns {Promise<{ data: unknown[], meta: unknown }>} Page of notifications.
   */
  async list(query = {}) {
    return this.http.requestPage('/notifications', query);
  }

  /**
   * The unread count for the bell badge.
   *
   * @returns {Promise<Record<string, unknown>>} Unread count.
   */
  async unreadCount() {
    return this.http.get('/notifications/unread-count');
  }

  /**
   * Marks one notification as read.
   *
   * @param {string} notificationId - Notification to mark.
   * @returns {Promise<Record<string, unknown>>} The updated notification.
   */
  async markRead(notificationId) {
    return this.http.post(`/notifications/${notificationId}/read`);
  }

  /**
   * Marks every notification as read.
   *
   * @returns {Promise<Record<string, unknown>>} How many were marked.
   */
  async markAllRead() {
    return this.http.post('/notifications/read-all');
  }
}

/**
 * Administration endpoints.
 *
 * @augments ResourceGateway
 */
export class AdminGateway extends ResourceGateway {
  /**
   * Dashboard counts.
   *
   * @returns {Promise<Record<string, unknown>>} Headline counts.
   */
  async summary() {
    return this.http.get('/admin/summary');
  }

  /**
   * The shop approval queue (FR-G1).
   *
   * @param {Record<string, unknown>} [query] - Filters and paging.
   * @returns {Promise<{ data: unknown[], meta: unknown }>} Page of shops.
   */
  async shops(query = {}) {
    return this.http.requestPage('/admin/shops', query);
  }

  /**
   * Decides a shop application (FR-G1).
   *
   * @param {string} shopId - Shop being decided on.
   * @param {boolean} approved - The decision.
   * @param {string} [reason] - Why; required to reject.
   * @returns {Promise<Record<string, unknown>>} The decided shop.
   */
  async decideShop(shopId, approved, reason) {
    return this.http.post(`/admin/shops/${shopId}/decision`, { approved, reason });
  }

  /**
   * The user directory (FR-G2).
   *
   * @param {Record<string, unknown>} [query] - Filters and paging.
   * @returns {Promise<{ data: unknown[], meta: unknown }>} Page of accounts.
   */
  async users(query = {}) {
    return this.http.requestPage('/admin/users', query);
  }

  /**
   * Suspends or reactivates an account (FR-G2).
   *
   * @param {string} userId - Account to change.
   * @param {boolean} suspended - Desired state.
   * @returns {Promise<Record<string, unknown>>} The updated account.
   */
  async setUserSuspended(userId, suspended) {
    return this.http.patch(`/admin/users/${userId}/status`, { suspended });
  }

  /**
   * The live orders monitor (FR-G3).
   *
   * @param {Record<string, unknown>} [query] - Filters and paging.
   * @returns {Promise<{ data: unknown[], meta: unknown }>} Page of orders.
   */
  async orders(query = {}) {
    return this.http.requestPage('/admin/orders', query);
  }

  /**
   * Intervenes in an order (FR-G3).
   *
   * @param {string} orderId - Order to act on.
   * @param {string} action - Either `cancel` or `reassign`.
   * @param {string} [reason] - Why.
   * @returns {Promise<Record<string, unknown>>} The result.
   */
  async resolveOrder(orderId, action, reason) {
    return this.http.post(`/admin/orders/${orderId}/resolve`, { action, reason });
  }

  /**
   * The audit log viewer (NFR-13).
   *
   * @param {Record<string, unknown>} [query] - Filters and paging.
   * @returns {Promise<{ data: unknown[], meta: unknown }>} Page of entries.
   */
  async auditLog(query = {}) {
    return this.http.requestPage('/admin/audit-logs', query);
  }

  /**
   * Platform analytics (FR-G5).
   *
   * @param {number} [days] - Window length.
   * @returns {Promise<Record<string, unknown>>} Analytics.
   */
  async analytics(days = 7) {
    return this.http.get('/admin/analytics', { days });
  }

  /**
   * Tunable parameters (FR-G6).
   *
   * @returns {Promise<Record<string, unknown>>} Effective settings.
   */
  async settings() {
    return this.http.get('/admin/settings');
  }

  /**
   * Changes a tunable parameter (FR-G6).
   *
   * @param {string} key - Parameter name.
   * @param {unknown} value - New value.
   * @returns {Promise<Record<string, unknown>>} The effective settings.
   */
  async updateSetting(key, value) {
    return this.http.put('/admin/settings', { key, value });
  }
}

/**
 * The whole API surface, one gateway per resource.
 *
 * A single object is passed to every controller, so a controller declares what it needs
 * by reaching for one property rather than by taking eight constructor arguments.
 */
export class ApiClient {
  /** @type {import('./http-client.js').HttpClient} */
  #http;

  /**
   * @param {import('./http-client.js').HttpClient} http - Transport.
   */
  constructor(http) {
    this.#http = http;
    this.auth = new AuthGateway(http);
    this.users = new UserGateway(http);
    this.shops = new ShopGateway(http);
    this.cart = new CartGateway(http);
    this.orders = new OrderGateway(http);
    this.deliveries = new DeliveryGateway(http);
    this.notifications = new NotificationGateway(http);
    this.admin = new AdminGateway(http);
  }

  /**
   * The transport, for session-level concerns such as the access token.
   *
   * @returns {import('./http-client.js').HttpClient} Transport.
   */
  get http() {
    return this.#http;
  }
}
