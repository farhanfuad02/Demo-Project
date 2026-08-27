/**
 * @file Shop registration, browsing, and open/closed control.
 *
 * @module services/shop-service
 */

import { AUDIT_ACTION, AUDIT_ENTITY, USER_ROLE } from '@hungry-ju/shared/enums';
import { BaseService } from '../core/base-service.js';
import { ConflictError, ForbiddenError, NotFoundError } from '../core/errors/app-error.js';
import { Shop } from '../models/shop.js';
import { QueryOptions } from '../utils/query-options.js';

/**
 * Epic B, minus the menu: registering a shop, opening it, and letting students find it.
 *
 * @augments BaseService
 */
export class ShopService extends BaseService {
  /** @type {import('../repositories/shop-repository.js').ShopRepository} */
  #shopRepository;

  /** @type {import('../repositories/menu-item-repository.js').MenuItemRepository} */
  #menuItemRepository;

  /** @type {import('./audit-service.js').AuditService} */
  #auditService;

  /**
   * @param {object} dependencies - Injected collaborators.
   * @param {import('../repositories/shop-repository.js').ShopRepository} dependencies.shopRepository -
   *   Shop storage.
   * @param {import('../repositories/menu-item-repository.js').MenuItemRepository} dependencies.menuItemRepository -
   *   Menu storage, for the shop detail view.
   * @param {import('./audit-service.js').AuditService} dependencies.auditService - Audit trail.
   */
  constructor({ shopRepository, menuItemRepository, auditService }) {
    super();
    this.#shopRepository = shopRepository;
    this.#menuItemRepository = menuItemRepository;
    this.#auditService = auditService;
  }

  /**
   * Registers a shop for admin approval (FR-B1).
   *
   * @param {import('@hungry-ju/shared/types').Actor} actor - Signed-in vendor.
   * @param {object} details - Shop details.
   * @param {string} details.shopName - Display name.
   * @param {string} details.botTolaLocation - Stall location.
   * @param {string} details.contactPhone - Contact number.
   * @param {string} [details.operatingHours] - Human-readable hours.
   * @param {string} [details.description] - Short description.
   * @param {string} [details.photoUrl] - Cover image.
   * @returns {Promise<Shop>} The pending shop.
   * @throws {ForbiddenError} When the caller is not a vendor.
   * @throws {ConflictError} When this vendor already registered a shop.
   */
  async register(actor, details) {
    this.assertRole(actor, USER_ROLE.VENDOR);
    if (await this.#shopRepository.findByOwner(actor.id)) {
      throw new ConflictError('You have already registered a shop.');
    }

    const shop = await this.#shopRepository.create(new Shop({ ownerUserId: actor.id, ...details }));
    await this.#auditService.record({
      actorUserId: actor.id,
      entityType: AUDIT_ENTITY.SHOP,
      entityId: shop.id,
      action: AUDIT_ACTION.CREATE,
      newValue: { shopName: shop.shopName, approvalStatus: shop.approvalStatus },
    });
    return shop;
  }

  /**
   * The shop belonging to the signed-in vendor.
   *
   * @param {import('@hungry-ju/shared/types').Actor} actor - Signed-in vendor.
   * @returns {Promise<Shop | null>} The shop, or `null` when not registered yet.
   */
  async myShop(actor) {
    this.assertRole(actor, USER_ROLE.VENDOR);
    return this.#shopRepository.findByOwner(actor.id);
  }

  /**
   * The shop browse list (FR-C1).
   *
   * @param {object} [filters] - Optional narrowing.
   * @param {string} [filters.search] - Partial name or location.
   * @param {boolean} [filters.openOnly] - Only shops currently taking orders.
   * @param {QueryOptions} [options] - Sort/page window.
   * @returns {Promise<import('@hungry-ju/shared/types').PaginatedResult>} Page of shops.
   */
  async browse({ search = null, openOnly = false } = {}, options = new QueryOptions()) {
    const shops = search
      ? await this.#shopRepository.searchApproved(search)
      : await this.#shopRepository.findApproved();

    const filtered = openOnly ? shops.filter((shop) => shop.isOpen) : shops;

    // Open shops first, then by rating: a student scanning the list wants somewhere they
    // can actually order from, not the best-rated stall that shut an hour ago.
    const ranked = [...filtered].sort((left, right) => {
      if (left.isOpen !== right.isOpen) {
        return left.isOpen ? -1 : 1;
      }
      return right.ratingAverage - left.ratingAverage;
    });

    const page = ranked.slice(options.offset, options.offset + options.limit);
    return options.paginate(
      page.map((shop) => shop.toJSON()),
      ranked.length
    );
  }

  /**
   * A shop with its menu, which is the vendor detail screen (HJU-C02).
   *
   * @param {string} shopId - Shop to load.
   * @param {object} [options] - View options.
   * @param {boolean} [options.includeUnavailable] - Include sold-out items, greyed out.
   * @returns {Promise<Record<string, unknown>>} Shop plus its menu.
   * @throws {NotFoundError} When the shop does not exist or is not approved.
   */
  async detail(shopId, { includeUnavailable = true } = {}) {
    const shop = await this.#shopRepository.findByIdOrFail(shopId, 'Shop');
    if (!shop.isApproved) {
      throw new NotFoundError('Shop');
    }
    const items = await this.#menuItemRepository.findByShop(shopId, {
      availableOnly: !includeUnavailable,
    });
    return { ...shop.toJSON(), menu: items.map((item) => item.toJSON()) };
  }

  /**
   * Opens or closes a shop (FR-B3).
   *
   * @param {import('@hungry-ju/shared/types').Actor} actor - Signed-in vendor.
   * @param {string} shopId - Shop to change.
   * @param {boolean} isOpen - Desired state.
   * @returns {Promise<Shop>} The updated shop.
   * @throws {ForbiddenError} When the caller does not own the shop.
   */
  async setOpen(actor, shopId, isOpen) {
    const shop = await this.#assertOwnShop(actor, shopId);
    shop.setOpen(isOpen);
    const saved = await this.#shopRepository.save(shop);
    await this.#auditService.record({
      actorUserId: actor.id,
      entityType: AUDIT_ENTITY.SHOP,
      entityId: shop.id,
      action: AUDIT_ACTION.UPDATE,
      newValue: { isOpen },
    });
    return saved;
  }

  /**
   * Updates shop details.
   *
   * @param {import('@hungry-ju/shared/types').Actor} actor - Signed-in vendor.
   * @param {string} shopId - Shop to change.
   * @param {object} changes - Fields to update.
   * @returns {Promise<Shop>} The updated shop.
   * @throws {ForbiddenError} When the caller does not own the shop.
   */
  async updateDetails(actor, shopId, changes) {
    const shop = await this.#assertOwnShop(actor, shopId);
    shop.updateDetails(changes);
    return this.#shopRepository.save(shop);
  }

  /**
   * Loads a shop and checks the caller owns it.
   *
   * Ownership is checked against the stored row and not against the token's `shopId`
   * claim: a claim is whatever the client sends back, and this is the IDOR guard.
   *
   * @param {import('@hungry-ju/shared/types').Actor} actor - Signed-in vendor.
   * @param {string} shopId - Shop to load.
   * @returns {Promise<Shop>} The shop.
   * @throws {ForbiddenError} When the caller does not own it.
   */
  async #assertOwnShop(actor, shopId) {
    const shop = await this.#shopRepository.findByIdOrFail(shopId, 'Shop');
    this.assertOwnership(actor, shop.ownerUserId, 'This shop belongs to another vendor.');
    return shop;
  }
}
