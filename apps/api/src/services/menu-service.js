/**
 * @file Menu item management and search.
 *
 * @module services/menu-service
 */

import { AUDIT_ACTION, AUDIT_ENTITY } from '@hungry-ju/shared/enums';
import { SEARCH } from '@hungry-ju/shared/constants';
import { BaseService } from '../core/base-service.js';
import { ForbiddenError, ValidationError } from '../core/errors/app-error.js';
import { MenuItem } from '../models/menu-item.js';
import { Money } from '../utils/money.js';

/**
 * FR-B2 menu management and FR-C2/C3 discovery.
 *
 * Search lives here rather than in a service of its own because it is a read over the
 * same two tables: splitting it out would buy a class and cost a join.
 *
 * @augments BaseService
 */
export class MenuService extends BaseService {
  /** @type {import('../repositories/menu-item-repository.js').MenuItemRepository} */
  #menuItemRepository;

  /** @type {import('../repositories/shop-repository.js').ShopRepository} */
  #shopRepository;

  /** @type {import('./audit-service.js').AuditService} */
  #auditService;

  /**
   * @param {object} dependencies - Injected collaborators.
   * @param {import('../repositories/menu-item-repository.js').MenuItemRepository} dependencies.menuItemRepository -
   *   Menu storage.
   * @param {import('../repositories/shop-repository.js').ShopRepository} dependencies.shopRepository -
   *   Shop storage, for ownership checks.
   * @param {import('./audit-service.js').AuditService} dependencies.auditService - Audit trail.
   */
  constructor({ menuItemRepository, shopRepository, auditService }) {
    super();
    this.#menuItemRepository = menuItemRepository;
    this.#shopRepository = shopRepository;
    this.#auditService = auditService;
  }

  /**
   * Lists a shop's menu.
   *
   * @param {string} shopId - Shop whose menu to list.
   * @param {object} [filters] - Optional narrowing.
   * @param {boolean} [filters.availableOnly] - Hide sold-out items.
   * @param {string} [filters.category] - Restrict to one category.
   * @returns {Promise<Record<string, unknown>[]>} Menu items.
   */
  async listForShop(shopId, filters = {}) {
    const items = await this.#menuItemRepository.findByShop(shopId, filters);
    return items.map((item) => item.toJSON());
  }

  /**
   * Adds an item to a shop's menu (FR-B2).
   *
   * @param {import('@hungry-ju/shared/types').Actor} actor - Signed-in vendor.
   * @param {string} shopId - Shop to add to.
   * @param {object} details - Item details, with the price in taka.
   * @param {string} details.name - Dish name.
   * @param {number} details.price - Price in taka.
   * @param {string} [details.description] - Description.
   * @param {string} [details.category] - Category.
   * @param {string} [details.photoUrl] - Photo.
   * @param {number} [details.prepTimeMin] - Preparation time in minutes.
   * @returns {Promise<Record<string, unknown>>} The created item.
   * @throws {ForbiddenError} When the caller does not own the shop.
   */
  async create(actor, shopId, details) {
    await this.#assertOwnsShop(actor, shopId);
    const item = await this.#menuItemRepository.create(
      new MenuItem({ ...details, shopId, price: Money.fromTaka(details.price) })
    );
    await this.#auditService.record({
      actorUserId: actor.id,
      entityType: AUDIT_ENTITY.MENU_ITEM,
      entityId: item.id,
      action: AUDIT_ACTION.CREATE,
      newValue: { name: item.name, price: item.price.taka },
    });
    return item.toJSON();
  }

  /**
   * Edits a menu item (FR-B2).
   *
   * @param {import('@hungry-ju/shared/types').Actor} actor - Signed-in vendor.
   * @param {string} itemId - Item to edit.
   * @param {object} changes - Fields to update; `price` is in taka.
   * @returns {Promise<Record<string, unknown>>} The updated item.
   * @throws {ForbiddenError} When the caller does not own the shop.
   */
  async update(actor, itemId, changes) {
    const item = await this.#menuItemRepository.findByIdOrFail(itemId, 'Menu item');
    await this.#assertOwnsShop(actor, item.shopId);

    const previous = { name: item.name, price: item.price.taka };
    item.update({
      ...changes,
      price: changes.price === undefined ? undefined : Money.fromTaka(changes.price),
    });
    const saved = await this.#menuItemRepository.save(item);

    await this.#auditService.record({
      actorUserId: actor.id,
      entityType: AUDIT_ENTITY.MENU_ITEM,
      entityId: item.id,
      action: AUDIT_ACTION.UPDATE,
      oldValue: previous,
      newValue: { name: saved.name, price: saved.price.taka },
    });
    return saved.toJSON();
  }

  /**
   * Marks an item sold out or back in stock (FR-B2).
   *
   * @param {import('@hungry-ju/shared/types').Actor} actor - Signed-in vendor.
   * @param {string} itemId - Item to toggle.
   * @param {boolean} isAvailable - Desired state.
   * @returns {Promise<Record<string, unknown>>} The updated item.
   * @throws {ForbiddenError} When the caller does not own the shop.
   */
  async setAvailability(actor, itemId, isAvailable) {
    const item = await this.#menuItemRepository.findByIdOrFail(itemId, 'Menu item');
    await this.#assertOwnsShop(actor, item.shopId);
    item.setAvailable(isAvailable);
    const saved = await this.#menuItemRepository.save(item);
    return saved.toJSON();
  }

  /**
   * Removes an item from the menu (FR-B2).
   *
   * @param {import('@hungry-ju/shared/types').Actor} actor - Signed-in vendor.
   * @param {string} itemId - Item to remove.
   * @returns {Promise<void>} Resolves once removed.
   * @throws {ForbiddenError} When the caller does not own the shop.
   */
  async remove(actor, itemId) {
    const item = await this.#menuItemRepository.findByIdOrFail(itemId, 'Menu item');
    await this.#assertOwnsShop(actor, item.shopId);
    await this.#menuItemRepository.delete(itemId);
    await this.#auditService.record({
      actorUserId: actor.id,
      entityType: AUDIT_ENTITY.MENU_ITEM,
      entityId: itemId,
      action: AUDIT_ACTION.DELETE,
      oldValue: { name: item.name },
    });
  }

  /**
   * Searches dishes and shops with partial matching (FR-C2).
   *
   * Only approved shops are searched, and the shop each dish belongs to travels with it
   * so the results list can say where to get the food without a second request.
   *
   * @param {string} query - What the student typed.
   * @param {object} [filters] - Optional narrowing (FR-C3).
   * @param {string} [filters.category] - Restrict to one category.
   * @param {number} [filters.maxPrice] - Highest acceptable price in taka.
   * @param {boolean} [filters.openOnly] - Only shops currently taking orders.
   * @returns {Promise<{ items: Record<string, unknown>[], shops: Record<string, unknown>[] }>}
   *   Matching dishes and shops.
   * @throws {ValidationError} When the query is too short to be useful.
   */
  async search(query, { category = null, maxPrice = null, openOnly = false } = {}) {
    const fragment = (query ?? '').trim();
    if (fragment.length < SEARCH.MIN_QUERY_LENGTH) {
      throw new ValidationError(`Type at least ${SEARCH.MIN_QUERY_LENGTH} characters to search.`);
    }

    const shops = await this.#shopRepository.findApproved();
    const usableShops = openOnly ? shops.filter((shop) => shop.canReceiveOrders) : shops;
    const shopById = new Map(usableShops.map((shop) => [shop.id, shop]));

    let items = await this.#menuItemRepository.search(fragment, [...shopById.keys()]);
    if (category) {
      items = items.filter((item) => item.category === category);
    }
    if (maxPrice !== null) {
      const ceiling = Money.fromTaka(maxPrice);
      items = items.filter((item) => item.price.poisha <= ceiling.poisha);
    }

    const matchedShops = usableShops.filter((shop) =>
      `${shop.shopName} ${shop.botTolaLocation}`.toLowerCase().includes(fragment.toLowerCase())
    );

    return {
      items: items.slice(0, SEARCH.MAX_RESULTS).map((item) => ({
        ...item.toJSON(),
        shop: shopById.get(item.shopId)?.toJSON() ?? null,
      })),
      shops: matchedShops.slice(0, SEARCH.MAX_RESULTS).map((shop) => shop.toJSON()),
    };
  }

  /**
   * Confirms the signed-in vendor owns the shop behind an item.
   *
   * @param {import('@hungry-ju/shared/types').Actor} actor - Signed-in vendor.
   * @param {string} shopId - Shop to check.
   * @returns {Promise<void>} Resolves when the caller owns it.
   * @throws {ForbiddenError} When they do not.
   */
  async #assertOwnsShop(actor, shopId) {
    const shop = await this.#shopRepository.findByIdOrFail(shopId, 'Shop');
    this.assertOwnership(actor, shop.ownerUserId, 'This menu belongs to another vendor.');
  }
}
