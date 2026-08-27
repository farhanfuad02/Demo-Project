/**
 * @file Ratings for shops and delivery partners.
 *
 * @module services/rating-service
 */

import { AUDIT_ACTION, AUDIT_ENTITY, ORDER_STATUS, RATING_TARGET } from '@hungry-ju/shared/enums';
import { BaseService } from '../core/base-service.js';
import { ConflictError, ValidationError } from '../core/errors/app-error.js';
import { Rating } from '../models/rating.js';
import { QueryOptions } from '../utils/query-options.js';

/**
 * FR-C9: rating the vendor and the delivery partner after a delivery.
 *
 * BR-08 is enforced in one place here — delivered orders only, once per order per
 * target — because a rating system that can be gamed is worse than none: it makes bad
 * vendors look chosen rather than merely listed.
 *
 * @augments BaseService
 */
export class RatingService extends BaseService {
  /** @type {import('../repositories/rating-repository.js').RatingRepository} */
  #ratingRepository;

  /** @type {import('../repositories/order-repository.js').OrderRepository} */
  #orderRepository;

  /** @type {import('../repositories/shop-repository.js').ShopRepository} */
  #shopRepository;

  /** @type {import('../repositories/delivery-repository.js').DeliveryRepository} */
  #deliveryRepository;

  /** @type {import('../repositories/student-profile-repository.js').StudentProfileRepository} */
  #studentProfileRepository;

  /** @type {import('./audit-service.js').AuditService} */
  #auditService;

  /**
   * @param {object} dependencies - Injected collaborators.
   * @param {import('../repositories/rating-repository.js').RatingRepository} dependencies.ratingRepository -
   *   Rating storage.
   * @param {import('../repositories/order-repository.js').OrderRepository} dependencies.orderRepository -
   *   Order storage, for the eligibility check.
   * @param {import('../repositories/shop-repository.js').ShopRepository} dependencies.shopRepository -
   *   Shop aggregates.
   * @param {import('../repositories/delivery-repository.js').DeliveryRepository} dependencies.deliveryRepository -
   *   Finds the rider who delivered.
   * @param {import('../repositories/student-profile-repository.js').StudentProfileRepository} dependencies.studentProfileRepository -
   *   Rider rating aggregates.
   * @param {import('./audit-service.js').AuditService} dependencies.auditService - Audit trail.
   */
  constructor({
    ratingRepository,
    orderRepository,
    shopRepository,
    deliveryRepository,
    studentProfileRepository,
    auditService,
  }) {
    super();
    this.#ratingRepository = ratingRepository;
    this.#orderRepository = orderRepository;
    this.#shopRepository = shopRepository;
    this.#deliveryRepository = deliveryRepository;
    this.#studentProfileRepository = studentProfileRepository;
    this.#auditService = auditService;
  }

  /**
   * Rates the shop or the delivery partner of a delivered order (BR-08).
   *
   * The average is maintained on the target as it is written, rather than recomputed on
   * every browse: the shop list is the hottest read path in the system and must not
   * scan the ratings table to render a star (SRS section 7 documents the trade-off).
   *
   * @param {import('@hungry-ju/shared/types').Actor} actor - Signed-in student.
   * @param {string} orderId - Order being rated.
   * @param {object} rating - The rating.
   * @param {string} rating.targetType - Shop or rider.
   * @param {number} rating.stars - Score from 1 to 5.
   * @param {string} [rating.comment] - Optional free text.
   * @returns {Promise<Record<string, unknown>>} The stored rating.
   * @throws {ValidationError} When the order is not delivered, or has no rider to rate.
   * @throws {ConflictError} When this target was already rated on this order.
   */
  async rate(actor, orderId, { targetType, stars, comment = null }) {
    const order = await this.#orderRepository.findByIdOrFail(orderId, 'Order');
    this.assertOwnership(actor, order.studentId, 'This order belongs to another student.');

    if (order.status !== ORDER_STATUS.DELIVERED) {
      throw new ValidationError('You can rate an order once it has been delivered.');
    }
    if (await this.#ratingRepository.existsForOrder(orderId, targetType)) {
      throw new ConflictError('You have already left this rating.');
    }

    const targetId = await this.#resolveTarget(order, targetType);
    const rating = await this.#ratingRepository.create(
      new Rating({ orderId, raterUserId: actor.id, targetType, targetId, stars, comment })
    );

    await this.#applyToAggregate(targetType, targetId, stars);
    await this.#auditService.record({
      actorUserId: actor.id,
      entityType: AUDIT_ENTITY.RATING,
      entityId: rating.id,
      action: AUDIT_ACTION.CREATE,
      newValue: { targetType, targetId, stars },
    });
    return rating.toJSON();
  }

  /**
   * Reviews left for a shop, for its detail page.
   *
   * @param {string} shopId - Shop to list.
   * @param {QueryOptions} [options] - Sort/page window.
   * @returns {Promise<import('@hungry-ju/shared/types').PaginatedResult>} Page of reviews.
   */
  async forShop(shopId, options = new QueryOptions({ sortBy: 'created_at' })) {
    const [ratings, totalCount] = await Promise.all([
      this.#ratingRepository.findForTarget(RATING_TARGET.SHOP, shopId, options),
      this.#ratingRepository.count({ target_type: RATING_TARGET.SHOP, target_id: shopId }),
    ]);
    return options.paginate(
      ratings.map((rating) => rating.toJSON()),
      totalCount
    );
  }

  /**
   * Ratings already left on one order, so the UI can hide the forms that are done.
   *
   * @param {import('@hungry-ju/shared/types').Actor} actor - Signed-in student.
   * @param {string} orderId - Order to check.
   * @returns {Promise<Record<string, unknown>[]>} Existing ratings.
   */
  async forOrder(actor, orderId) {
    const order = await this.#orderRepository.findByIdOrFail(orderId, 'Order');
    this.assertOwnership(actor, order.studentId, 'This order belongs to another student.');
    const ratings = await this.#ratingRepository.findByOrder(orderId);
    return ratings.map((rating) => rating.toJSON());
  }

  /**
   * Removes an abusive comment while keeping the score (FR-G4).
   *
   * @param {import('@hungry-ju/shared/types').Actor} actor - Signed-in admin.
   * @param {string} ratingId - Rating to moderate.
   * @returns {Promise<Record<string, unknown>>} The moderated rating.
   */
  async moderate(actor, ratingId) {
    const rating = await this.#ratingRepository.findByIdOrFail(ratingId, 'Rating');
    rating.redactComment();
    const saved = await this.#ratingRepository.save(rating);
    await this.#auditService.record({
      actorUserId: actor.id,
      entityType: AUDIT_ENTITY.RATING,
      entityId: saved.id,
      action: AUDIT_ACTION.UPDATE,
      newValue: { commentRemoved: true },
    });
    return saved.toJSON();
  }

  /**
   * Works out which entity a rating is about.
   *
   * @param {import('../models/order.js').Order} order - Order being rated.
   * @param {string} targetType - Shop or rider.
   * @returns {Promise<string>} Shop id, or rider user id.
   * @throws {ValidationError} When the target cannot be resolved.
   */
  async #resolveTarget(order, targetType) {
    if (targetType === RATING_TARGET.SHOP) {
      return order.shopId;
    }
    const delivery = await this.#deliveryRepository.findByOrder(order.id);
    if (!delivery?.riderUserId) {
      throw new ValidationError('This order has no delivery partner to rate.');
    }
    return delivery.riderUserId;
  }

  /**
   * Folds a new score into the target's running average.
   *
   * @param {string} targetType - Shop or rider.
   * @param {string} targetId - Entity rated.
   * @param {number} stars - Score.
   * @returns {Promise<void>} Resolves once stored.
   */
  async #applyToAggregate(targetType, targetId, stars) {
    if (targetType === RATING_TARGET.SHOP) {
      const shop = await this.#shopRepository.findByIdOrFail(targetId, 'Shop');
      shop.addRating(stars);
      await this.#shopRepository.save(shop);
      return;
    }
    const profile = await this.#studentProfileRepository.findOrCreateByUserId(targetId);
    profile.addRiderRating(stars);
    await this.#studentProfileRepository.save(profile);
  }
}
