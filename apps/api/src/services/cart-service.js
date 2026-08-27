/**
 * @file Cart management.
 *
 * @module services/cart-service
 */

import { USER_ROLE } from '@hungry-ju/shared/enums';
import { BaseService } from '../core/base-service.js';
import { ValidationError } from '../core/errors/app-error.js';

/**
 * FR-C4 and FR-C5: adding, changing, and clearing cart lines.
 *
 * The rules about what may go in a cart live on the `Cart` entity; this service supplies
 * the entity with the facts it cannot know — whether the shop is open, whether the item
 * still exists — and persists the result.
 *
 * @augments BaseService
 */
export class CartService extends BaseService {
  /** @type {import('../repositories/cart-repository.js').CartRepository} */
  #cartRepository;

  /** @type {import('../repositories/menu-item-repository.js').MenuItemRepository} */
  #menuItemRepository;

  /** @type {import('../repositories/shop-repository.js').ShopRepository} */
  #shopRepository;

  /** @type {import('./settings-service.js').SettingsService} */
  #settingsService;

  /**
   * @param {object} dependencies - Injected collaborators.
   * @param {import('../repositories/cart-repository.js').CartRepository} dependencies.cartRepository -
   *   Cart storage.
   * @param {import('../repositories/menu-item-repository.js').MenuItemRepository} dependencies.menuItemRepository -
   *   Menu storage.
   * @param {import('../repositories/shop-repository.js').ShopRepository} dependencies.shopRepository -
   *   Shop storage, for the open/closed check.
   * @param {import('./settings-service.js').SettingsService} dependencies.settingsService -
   *   Supplies the current delivery fee.
   */
  constructor({ cartRepository, menuItemRepository, shopRepository, settingsService }) {
    super();
    this.#cartRepository = cartRepository;
    this.#menuItemRepository = menuItemRepository;
    this.#shopRepository = shopRepository;
    this.#settingsService = settingsService;
  }

  /**
   * The student's cart, with the shop and the totals the cart screen shows.
   *
   * @param {import('@hungry-ju/shared/types').Actor} actor - Signed-in student.
   * @returns {Promise<Record<string, unknown>>} Cart, shop, and totals.
   */
  async view(actor) {
    this.assertRole(actor, USER_ROLE.STUDENT);
    const cart = await this.#cartRepository.findOrCreateByStudent(actor.id);
    return this.#present(cart);
  }

  /**
   * Adds an item to the cart (FR-C4).
   *
   * @param {import('@hungry-ju/shared/types').Actor} actor - Signed-in student.
   * @param {string} menuItemId - Item to add.
   * @param {number} [quantity] - Units to add.
   * @returns {Promise<Record<string, unknown>>} The updated cart.
   * @throws {ValidationError} When the shop is closed or the item is sold out (BR-07).
   */
  async addItem(actor, menuItemId, quantity = 1) {
    this.assertRole(actor, USER_ROLE.STUDENT);
    const menuItem = await this.#menuItemRepository.findByIdOrFail(menuItemId, 'Menu item');

    const shop = await this.#shopRepository.findByIdOrFail(menuItem.shopId, 'Shop');
    if (!shop.canReceiveOrders) {
      throw new ValidationError(`${shop.shopName} is closed right now.`);
    }

    const cart = await this.#cartRepository.findOrCreateByStudent(actor.id);
    cart.addItem(menuItem, quantity);
    const saved = await this.#cartRepository.saveAggregate(cart);
    return this.#present(saved);
  }

  /**
   * Changes the quantity of a line, or removes it when the quantity is zero (FR-C5).
   *
   * @param {import('@hungry-ju/shared/types').Actor} actor - Signed-in student.
   * @param {string} menuItemId - Line to change.
   * @param {number} quantity - New quantity.
   * @returns {Promise<Record<string, unknown>>} The updated cart.
   */
  async updateQuantity(actor, menuItemId, quantity) {
    this.assertRole(actor, USER_ROLE.STUDENT);
    const cart = await this.#cartRepository.findOrCreateByStudent(actor.id);
    cart.updateQuantity(menuItemId, quantity);
    const saved = await this.#cartRepository.saveAggregate(cart);
    return this.#present(saved);
  }

  /**
   * Removes a line (FR-C5).
   *
   * @param {import('@hungry-ju/shared/types').Actor} actor - Signed-in student.
   * @param {string} menuItemId - Line to remove.
   * @returns {Promise<Record<string, unknown>>} The updated cart.
   */
  async removeItem(actor, menuItemId) {
    this.assertRole(actor, USER_ROLE.STUDENT);
    const cart = await this.#cartRepository.findOrCreateByStudent(actor.id);
    cart.removeItem(menuItemId);
    const saved = await this.#cartRepository.saveAggregate(cart);
    return this.#present(saved);
  }

  /**
   * Empties the cart, which is what a student does to order from a different vendor.
   *
   * @param {import('@hungry-ju/shared/types').Actor} actor - Signed-in student.
   * @returns {Promise<Record<string, unknown>>} The empty cart.
   */
  async clear(actor) {
    this.assertRole(actor, USER_ROLE.STUDENT);
    const cart = await this.#cartRepository.findOrCreateByStudent(actor.id);
    cart.clear();
    const saved = await this.#cartRepository.saveAggregate(cart);
    return this.#present(saved);
  }

  /**
   * Re-reads every line against the live menu (UC-01 step 6).
   *
   * Called at checkout, where a stale price or a sold-out dish has to surface *before*
   * the order exists. The differences are reported rather than silently applied: a total
   * that changes without a word is how a marketplace loses trust.
   *
   * @param {import('../models/cart.js').Cart} cart - Cart to re-validate.
   * @returns {Promise<{ priceChanges: object[], unavailable: object[] }>} What moved.
   */
  async revalidate(cart) {
    const menuItems = await this.#menuItemRepository.findByIds(
      cart.items.map((item) => item.menuItemId)
    );

    /** @type {object[]} */
    const priceChanges = [];
    /** @type {object[]} */
    const unavailable = [];

    for (const line of cart.items) {
      const menuItem = menuItems.get(line.menuItemId);
      if (!menuItem || !menuItem.isAvailable) {
        unavailable.push({ menuItemId: line.menuItemId, itemName: line.itemName });
        continue;
      }
      if (!line.unitPrice.equals(menuItem.price)) {
        priceChanges.push({
          menuItemId: line.menuItemId,
          itemName: menuItem.name,
          was: line.unitPrice.taka,
          now: menuItem.price.taka,
        });
        line.refreshFrom(menuItem);
      }
    }

    for (const gone of unavailable) {
      cart.removeItem(gone.menuItemId);
    }
    if (priceChanges.length > 0 || unavailable.length > 0) {
      await this.#cartRepository.saveAggregate(cart);
    }
    return { priceChanges, unavailable };
  }

  /**
   * The student's cart entity, for the ordering service to turn into an order.
   *
   * @param {string} studentId - Owning student.
   * @returns {Promise<import('../models/cart.js').Cart>} The cart with its lines.
   */
  async cartOf(studentId) {
    return this.#cartRepository.findOrCreateByStudent(studentId);
  }

  /**
   * Empties the cart after a successful checkout.
   *
   * @param {import('../models/cart.js').Cart} cart - Cart to empty.
   * @returns {Promise<void>} Resolves once stored.
   */
  async empty(cart) {
    cart.clear();
    await this.#cartRepository.saveAggregate(cart);
  }

  /**
   * Adds the shop and the money lines a cart screen needs.
   *
   * @param {import('../models/cart.js').Cart} cart - Cart to present.
   * @returns {Promise<Record<string, unknown>>} Cart, shop, fee, and total.
   */
  async #present(cart) {
    const deliveryFee = await this.#settingsService.deliveryFee();
    const shop = cart.shopId ? await this.#shopRepository.findById(cart.shopId) : null;
    return {
      ...cart.toJSON(),
      shop: shop ? shop.toJSON() : null,
      deliveryFee: cart.isEmpty ? 0 : deliveryFee.taka,
      total: cart.isEmpty ? 0 : cart.subtotal.add(deliveryFee).taka,
    };
  }
}
