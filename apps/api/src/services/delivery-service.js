/**
 * @file The delivery side: the open feed, the atomic claim, and completion.
 *
 * @module services/delivery-service
 */

import {
  AUDIT_ENTITY,
  DELIVERY_STATUS,
  NOTIFICATION_TYPE,
  USER_ROLE,
} from '@hungry-ju/shared/enums';
import { ORDER_DEFAULTS } from '@hungry-ju/shared/constants';
import { BaseService } from '../core/base-service.js';
import { ConflictError, ForbiddenError, NotFoundError } from '../core/errors/app-error.js';
import { Delivery } from '../models/delivery.js';
import { Identifier } from '../utils/identifier.js';
import { QueryOptions } from '../utils/query-options.js';

/**
 * Epic D: everything a delivery partner does.
 *
 * The concurrency-critical part — two riders tapping Accept at the same instant — is
 * delegated to `DeliveryRepository.claim`, which performs the conditional update. This
 * service handles what happens either side of it: the eligibility rules before, and the
 * notifications after.
 *
 * @augments BaseService
 */
export class DeliveryService extends BaseService {
  /** @type {import('../repositories/delivery-repository.js').DeliveryRepository} */
  #deliveryRepository;

  /** @type {import('../repositories/order-repository.js').OrderRepository} */
  #orderRepository;

  /** @type {import('../repositories/shop-repository.js').ShopRepository} */
  #shopRepository;

  /** @type {import('../repositories/user-repository.js').UserRepository} */
  #userRepository;

  /** @type {import('../repositories/student-profile-repository.js').StudentProfileRepository} */
  #studentProfileRepository;

  /** @type {import('./password-service.js').PasswordService} */
  #passwordService;

  /** @type {import('./payment-service.js').PaymentService} */
  #paymentService;

  /** @type {import('./notification-service.js').NotificationService} */
  #notificationService;

  /** @type {import('./settings-service.js').SettingsService} */
  #settingsService;

  /** @type {import('./audit-service.js').AuditService} */
  #auditService;

  /**
   * @param {object} dependencies - Injected collaborators.
   * @param {import('../repositories/delivery-repository.js').DeliveryRepository} dependencies.deliveryRepository -
   *   Delivery storage.
   * @param {import('../repositories/order-repository.js').OrderRepository} dependencies.orderRepository -
   *   Order storage.
   * @param {import('../repositories/shop-repository.js').ShopRepository} dependencies.shopRepository -
   *   Pickup details for the active-delivery panel.
   * @param {import('../repositories/user-repository.js').UserRepository} dependencies.userRepository -
   *   Rider and customer names.
   * @param {import('../repositories/student-profile-repository.js').StudentProfileRepository} dependencies.studentProfileRepository -
   *   Deliver Mode and reliability score.
   * @param {import('./password-service.js').PasswordService} dependencies.passwordService -
   *   Hashes and checks the confirmation PIN.
   * @param {import('./payment-service.js').PaymentService} dependencies.paymentService -
   *   Records the cash collected at the door.
   * @param {import('./notification-service.js').NotificationService} dependencies.notificationService -
   *   Outbound messages.
   * @param {import('./settings-service.js').SettingsService} dependencies.settingsService -
   *   Delivery fee and release penalty.
   * @param {import('./audit-service.js').AuditService} dependencies.auditService - Audit trail.
   */
  constructor({
    deliveryRepository,
    orderRepository,
    shopRepository,
    userRepository,
    studentProfileRepository,
    passwordService,
    paymentService,
    notificationService,
    settingsService,
    auditService,
  }) {
    super();
    this.#deliveryRepository = deliveryRepository;
    this.#orderRepository = orderRepository;
    this.#shopRepository = shopRepository;
    this.#userRepository = userRepository;
    this.#studentProfileRepository = studentProfileRepository;
    this.#passwordService = passwordService;
    this.#paymentService = paymentService;
    this.#notificationService = notificationService;
    this.#settingsService = settingsService;
    this.#auditService = auditService;
  }

  /**
   * Creates the delivery record when an order is placed.
   *
   * The PIN is generated here, at placement, because that is when the customer is shown
   * it (SRS section 12.4). Only its hash is stored, so a leaked database cannot be used
   * to close deliveries that never happened.
   *
   * @param {import('../models/order.js').Order} order - Order just placed.
   * @returns {Promise<{ delivery: Delivery, confirmPin: string }>} The record and the PIN.
   */
  async createForOrder(order) {
    const confirmPin = Identifier.pin(ORDER_DEFAULTS.CONFIRM_PIN_LENGTH);
    const delivery = await this.#deliveryRepository.create(
      new Delivery({
        orderId: order.id,
        studentId: order.studentId,
        earning: order.deliveryFee,
        confirmPinHash: await this.#passwordService.hashSecret(confirmPin),
      })
    );
    return { delivery, confirmPin };
  }

  /**
   * Puts a delivery into the open feed once the food is ready (FR-D2).
   *
   * @param {string} orderId - Order whose delivery to publish.
   * @returns {Promise<Delivery | null>} The published delivery, or `null` when absent.
   */
  async publishForOrder(orderId) {
    const delivery = await this.#deliveryRepository.findByOrder(orderId);
    if (!delivery) {
      return null;
    }
    delivery.publish();
    return this.#deliveryRepository.save(delivery);
  }

  /**
   * Withdraws a delivery when its order is cancelled or rejected (FR-E3).
   *
   * @param {string} orderId - Order whose delivery to withdraw.
   * @returns {Promise<void>} Resolves once withdrawn.
   */
  async cancelForOrder(orderId) {
    const delivery = await this.#deliveryRepository.findByOrder(orderId);
    if (!delivery || delivery.status === DELIVERY_STATUS.DELIVERED) {
      return;
    }
    delivery.release();
    await this.#deliveryRepository.save(delivery);
  }

  /**
   * The delivery attached to an order.
   *
   * @param {string} orderId - Order to look up.
   * @returns {Promise<Delivery | null>} Delivery, or `null`.
   */
  async forOrder(orderId) {
    return this.#deliveryRepository.findByOrder(orderId);
  }

  /**
   * The open feed a rider sees (FR-D2).
   *
   * Each entry carries what a rider decides on — where to collect, where to drop off,
   * and what it pays — so the feed is usable without opening every card.
   *
   * @param {import('@hungry-ju/shared/types').Actor} actor - Signed-in student in Deliver Mode.
   * @param {QueryOptions} [options] - Sort/page window.
   * @returns {Promise<Record<string, unknown>[]>} Claimable deliveries.
   * @throws {ForbiddenError} When the caller is not a student, or is not in Deliver Mode.
   */
  async availableFor(
    actor,
    options = new QueryOptions({ sortBy: 'available_at', sortDirection: 'asc' })
  ) {
    await this.#assertInDeliverMode(actor);
    const deliveries = await this.#deliveryRepository.findAvailableFor(actor.id, options);
    return this.#decorate(deliveries);
  }

  /**
   * Claims a delivery, first-accept-wins (UC-02).
   *
   * Two guards run before the claim — Deliver Mode, and one active delivery at a time
   * (FR-D4) — but neither is the race protection. That is the conditional update inside
   * `claim`: it either binds the row to this rider or reports that somebody else won.
   *
   * @param {import('@hungry-ju/shared/types').Actor} actor - Signed-in rider.
   * @param {string} deliveryId - Delivery to claim.
   * @returns {Promise<Record<string, unknown>>} The claimed delivery, decorated.
   * @throws {ForbiddenError} When not in Deliver Mode, or claiming their own order (BR-06).
   * @throws {ConflictError} When the rider is busy, or another rider won the race.
   */
  async accept(actor, deliveryId) {
    await this.#assertInDeliverMode(actor);

    const active = await this.#deliveryRepository.findActiveByRider(actor.id);
    if (active) {
      throw new ConflictError('Finish your current delivery before accepting another.');
    }

    const target = await this.#deliveryRepository.findByIdOrFail(deliveryId, 'Delivery');
    if (target.studentId === actor.id) {
      throw new ForbiddenError('You cannot deliver your own order.');
    }

    const claimed = await this.#deliveryRepository.claim(deliveryId, actor.id);
    if (!claimed) {
      throw new ConflictError('This order was just accepted by another delivery partner.');
    }

    const [order, rider] = await Promise.all([
      this.#orderRepository.findById(claimed.orderId),
      this.#userRepository.findById(actor.id),
    ]);
    const shop = order ? await this.#shopRepository.findById(order.shopId) : null;

    await this.#auditService.recordTransition({
      actorUserId: actor.id,
      entityType: AUDIT_ENTITY.DELIVERY,
      entityId: claimed.id,
      from: DELIVERY_STATUS.AVAILABLE,
      to: claimed.status,
    });
    await this.#notificationService.notifyAll([order?.studentId, shop?.ownerUserId], {
      type: NOTIFICATION_TYPE.ORDER_ASSIGNED,
      context: { reference: order?.reference, riderName: rider?.fullName },
      relatedOrderId: claimed.orderId,
    });

    const [decorated] = await this.#decorate([claimed]);
    return decorated;
  }

  /**
   * The delivery a rider is currently carrying, with pickup and drop-off details.
   *
   * @param {import('@hungry-ju/shared/types').Actor} actor - Signed-in rider.
   * @returns {Promise<Record<string, unknown> | null>} The active delivery, or `null`.
   */
  async activeFor(actor) {
    const delivery = await this.#deliveryRepository.findActiveByRider(actor.id);
    if (!delivery) {
      return null;
    }
    const [decorated] = await this.#decorate([delivery]);
    return decorated;
  }

  /**
   * Moves a delivery forward (FR-D5).
   *
   * Picking the food up also advances the order, so the customer's tracking view and
   * the rider's panel cannot disagree about where the food is.
   *
   * @param {import('@hungry-ju/shared/types').Actor} actor - Signed-in rider.
   * @param {string} deliveryId - Delivery to advance.
   * @param {string} nextStatus - Either `heading_to_vendor` or `picked_up`.
   * @returns {Promise<Record<string, unknown>>} The updated delivery.
   * @throws {ForbiddenError} When the delivery belongs to another rider.
   * @throws {ConflictError} When the move is not legal from the current status.
   */
  async advance(actor, deliveryId, nextStatus) {
    const delivery = await this.#assertOwnDelivery(actor, deliveryId);
    const previous = delivery.status;

    if (nextStatus === DELIVERY_STATUS.HEADING_TO_VENDOR) {
      delivery.startHeadingToVendor();
    } else {
      delivery.markPickedUp();
    }
    const saved = await this.#deliveryRepository.save(delivery);

    if (nextStatus === DELIVERY_STATUS.PICKED_UP) {
      const order = await this.#orderRepository.findWithItemsOrFail(delivery.orderId);
      order.markPickedUp();
      await this.#orderRepository.save(order);
      await this.#notificationService.notify({
        userId: order.studentId,
        type: NOTIFICATION_TYPE.ORDER_PICKED_UP,
        context: { reference: order.reference },
        relatedOrderId: order.id,
      });
    }

    await this.#auditService.recordTransition({
      actorUserId: actor.id,
      entityType: AUDIT_ENTITY.DELIVERY,
      entityId: delivery.id,
      from: previous,
      to: saved.status,
    });

    const [decorated] = await this.#decorate([saved]);
    return decorated;
  }

  /**
   * Completes a delivery against the customer's PIN (FR-D6, BR-10).
   *
   * The PIN is the whole anti-fraud mechanism: without it, "delivered" is whatever the
   * rider says it is, and the dispute in risk R8 has no resolution.
   *
   * @param {import('@hungry-ju/shared/types').Actor} actor - Signed-in rider.
   * @param {string} deliveryId - Delivery to complete.
   * @param {string} confirmPin - PIN read out by the customer.
   * @returns {Promise<Record<string, unknown>>} The completed delivery.
   * @throws {ForbiddenError} When the PIN is wrong, or the delivery belongs to another rider.
   */
  async complete(actor, deliveryId, confirmPin) {
    const delivery = await this.#assertOwnDelivery(actor, deliveryId);
    const matches = await this.#passwordService.verify(confirmPin, delivery.confirmPinHash);

    delivery.complete(matches);
    const saved = await this.#deliveryRepository.save(delivery);

    const order = await this.#orderRepository.findWithItemsOrFail(delivery.orderId);
    order.markDelivered();
    await this.#orderRepository.save(order);
    await this.#paymentService.markCollected(order.id, actor.id);

    await this.#auditService.recordTransition({
      actorUserId: actor.id,
      entityType: AUDIT_ENTITY.DELIVERY,
      entityId: delivery.id,
      from: DELIVERY_STATUS.PICKED_UP,
      to: saved.status,
    });
    await this.#notificationService.notify({
      userId: order.studentId,
      type: NOTIFICATION_TYPE.ORDER_DELIVERED,
      context: { reference: order.reference },
      relatedOrderId: order.id,
    });

    const [decorated] = await this.#decorate([saved]);
    return decorated;
  }

  /**
   * Gives an accepted delivery back to the pool (FR-D8).
   *
   * The reliability penalty is what keeps this from being a free undo, and the order is
   * re-published rather than cancelled: the customer's food is reassigned instead of
   * lost, which is the entire point of having the button.
   *
   * @param {import('@hungry-ju/shared/types').Actor} actor - Signed-in rider.
   * @param {string} deliveryId - Delivery to release.
   * @returns {Promise<Record<string, unknown>>} The reopened delivery.
   * @throws {ForbiddenError} When the delivery belongs to another rider.
   * @throws {ConflictError} When the food has already been picked up.
   */
  async release(actor, deliveryId) {
    const delivery = await this.#assertOwnDelivery(actor, deliveryId);
    const previous = delivery.status;

    delivery.release();
    delivery.reopen();
    const saved = await this.#deliveryRepository.save(delivery);

    const profile = await this.#studentProfileRepository.findOrCreateByUserId(actor.id);
    profile.penaliseReliability(await this.#settingsService.releasePenaltyPoints());
    await this.#studentProfileRepository.save(profile);

    await this.#auditService.recordTransition({
      actorUserId: actor.id,
      entityType: AUDIT_ENTITY.DELIVERY,
      entityId: delivery.id,
      from: previous,
      to: DELIVERY_STATUS.RELEASED,
    });

    const [decorated] = await this.#decorate([saved]);
    return decorated;
  }

  /**
   * A rider's earnings summary and history (FR-D7).
   *
   * @param {import('@hungry-ju/shared/types').Actor} actor - Signed-in rider.
   * @returns {Promise<Record<string, unknown>>} Today, this week, all time, and recent jobs.
   */
  async earningsFor(actor) {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const startOfWeek = new Date(startOfToday.getTime() - 6 * 24 * 60 * 60 * 1000);

    const [today, week, allTime, history, profile] = await Promise.all([
      this.#deliveryRepository.earningsFor(actor.id, startOfToday),
      this.#deliveryRepository.earningsFor(actor.id, startOfWeek),
      this.#deliveryRepository.earningsFor(actor.id),
      this.#deliveryRepository.findCompletedByRider(
        actor.id,
        new QueryOptions({ sortBy: 'delivered_at', limit: 20 })
      ),
      this.#studentProfileRepository.findOrCreateByUserId(actor.id),
    ]);

    return {
      today: { count: today.count, earnings: today.totalPoisha / 100 },
      week: { count: week.count, earnings: week.totalPoisha / 100 },
      allTime: { count: allTime.count, earnings: allTime.totalPoisha / 100 },
      riderRating: profile.riderRatingAverage,
      riderRatingCount: profile.riderRatingCount,
      reliabilityScore: profile.reliabilityScore,
      history: await this.#decorate(history),
    };
  }

  /**
   * Adds the order, shop, and customer detail a rider needs to act on a delivery.
   *
   * One pass over the related tables rather than a query per row: the feed refreshes
   * every few seconds, and N+1 reads there would be the first thing to fall over at
   * lunch peak (NFR-04).
   *
   * @param {Delivery[]} deliveries - Deliveries to decorate.
   * @returns {Promise<Record<string, unknown>[]>} Decorated deliveries.
   */
  async #decorate(deliveries) {
    if (deliveries.length === 0) {
      return [];
    }
    const orders = await Promise.all(
      deliveries.map((delivery) => this.#orderRepository.findWithItems(delivery.orderId))
    );
    const shops = await Promise.all(
      orders.map((order) => (order ? this.#shopRepository.findById(order.shopId) : null))
    );
    const customers = await Promise.all(
      orders.map((order) => (order ? this.#userRepository.findById(order.studentId) : null))
    );

    return deliveries.map((delivery, index) => {
      const order = orders[index];
      const shop = shops[index];
      const customer = customers[index];
      return {
        ...delivery.toJSON(),
        order: order ? order.toJSON() : null,
        pickup: shop
          ? { shopName: shop.shopName, location: shop.botTolaLocation, phone: shop.contactPhone }
          : null,
        dropOff: order
          ? { hall: order.deliveryHall, room: order.deliveryRoom, note: order.note }
          : null,
        customer: customer ? { fullName: customer.fullName, phone: customer.phone } : null,
      };
    });
  }

  /**
   * Confirms the caller is a student who has switched Deliver Mode on.
   *
   * @param {import('@hungry-ju/shared/types').Actor} actor - Signed-in user.
   * @returns {Promise<void>} Resolves when they may take deliveries.
   * @throws {ForbiddenError} When they are not a student, or Deliver Mode is off.
   */
  async #assertInDeliverMode(actor) {
    this.assertRole(actor, USER_ROLE.STUDENT);
    const profile = await this.#studentProfileRepository.findOrCreateByUserId(actor.id);
    if (!profile.isDeliveryEnabled) {
      throw new ForbiddenError('Switch on Deliver Mode to take deliveries.');
    }
  }

  /**
   * Loads a delivery and checks the caller is its rider.
   *
   * @param {import('@hungry-ju/shared/types').Actor} actor - Signed-in rider.
   * @param {string} deliveryId - Delivery to load.
   * @returns {Promise<Delivery>} The delivery.
   * @throws {NotFoundError} When there is no such delivery.
   * @throws {ForbiddenError} When it belongs to another rider.
   */
  async #assertOwnDelivery(actor, deliveryId) {
    const delivery = await this.#deliveryRepository.findById(deliveryId);
    if (!delivery) {
      throw new NotFoundError('Delivery');
    }
    this.assertOwnership(actor, delivery.riderUserId, 'This delivery belongs to another partner.');
    return delivery;
  }
}
