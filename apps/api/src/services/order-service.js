/**
 * @file Placing, tracking, and progressing orders.
 *
 * @module services/order-service
 */

import { AUDIT_ENTITY, NOTIFICATION_TYPE, ORDER_STATUS, USER_ROLE } from '@hungry-ju/shared/enums';
import { BaseService } from '../core/base-service.js';
import { ConflictError, ForbiddenError, ValidationError } from '../core/errors/app-error.js';
import { Order } from '../models/order.js';
import { HallPolicy } from './hall-policy.js';
import { Identifier } from '../utils/identifier.js';
import { QueryOptions } from '../utils/query-options.js';

/**
 * The order lifecycle from checkout to completion (UC-01, UC-03, Epic C and B).
 *
 * This service coordinates; it does not decide. Whether a transition is legal is the
 * order's own business (its state machine), and what a delivery does about it is the
 * delivery service's. Keeping the coordination in one place is what makes "place an
 * order" one readable method instead of a rule spread over three controllers.
 *
 * @augments BaseService
 */
export class OrderService extends BaseService {
  /** @type {import('../repositories/order-repository.js').OrderRepository} */
  #orderRepository;

  /** @type {import('../repositories/shop-repository.js').ShopRepository} */
  #shopRepository;

  /** @type {import('../repositories/student-profile-repository.js').StudentProfileRepository} */
  #studentProfileRepository;

  /** @type {import('../repositories/user-repository.js').UserRepository} */
  #userRepository;

  /** @type {import('./cart-service.js').CartService} */
  #cartService;

  /** @type {import('./delivery-service.js').DeliveryService} */
  #deliveryService;

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
   * @param {import('../repositories/order-repository.js').OrderRepository} dependencies.orderRepository -
   *   Order storage.
   * @param {import('../repositories/shop-repository.js').ShopRepository} dependencies.shopRepository -
   *   Shop storage.
   * @param {import('../repositories/student-profile-repository.js').StudentProfileRepository} dependencies.studentProfileRepository -
   *   Supplies the default delivery address.
   * @param {import('../repositories/user-repository.js').UserRepository} dependencies.userRepository -
   *   Supplies the gender that decides which halls the student may deliver to.
   * @param {import('./cart-service.js').CartService} dependencies.cartService - Cart rules.
   * @param {import('./delivery-service.js').DeliveryService} dependencies.deliveryService -
   *   Delivery lifecycle.
   * @param {import('./payment-service.js').PaymentService} dependencies.paymentService -
   *   Cash ledger.
   * @param {import('./notification-service.js').NotificationService} dependencies.notificationService -
   *   Outbound messages.
   * @param {import('./settings-service.js').SettingsService} dependencies.settingsService -
   *   Delivery fee and timeouts.
   * @param {import('./audit-service.js').AuditService} dependencies.auditService - Audit trail.
   */
  constructor({
    orderRepository,
    shopRepository,
    studentProfileRepository,
    userRepository,
    cartService,
    deliveryService,
    paymentService,
    notificationService,
    settingsService,
    auditService,
  }) {
    super();
    this.#orderRepository = orderRepository;
    this.#shopRepository = shopRepository;
    this.#studentProfileRepository = studentProfileRepository;
    this.#userRepository = userRepository;
    this.#cartService = cartService;
    this.#deliveryService = deliveryService;
    this.#paymentService = paymentService;
    this.#notificationService = notificationService;
    this.#settingsService = settingsService;
    this.#auditService = auditService;
  }

  /**
   * Places an order from the student's cart (UC-01).
   *
   * The re-validation in the middle is the whole point of the flow: between adding an
   * item and tapping Place Order, the vendor may have closed, sold out, or changed a
   * price. When anything moved, the order is *not* created and the differences are
   * returned for the student to confirm (alternate flows A1 and A2).
   *
   * @param {import('@hungry-ju/shared/types').Actor} actor - Signed-in student.
   * @param {object} details - Checkout details.
   * @param {string} [details.deliveryHall] - Destination hall code; defaults to the profile.
   * @param {string} [details.deliveryRoom] - Destination room; defaults to the profile.
   * @param {string} [details.note] - Free-text note.
   * @returns {Promise<{ order: Record<string, unknown>, confirmPin: string }>} The order and
   *   the PIN the student reads out on delivery.
   * @throws {ValidationError} When the cart is empty, no address is available, or the hall
   *   does not belong to the student's gender.
   * @throws {ConflictError} When the shop closed or prices moved during checkout.
   */
  async place(actor, { deliveryHall, deliveryRoom, note = null }) {
    this.assertRole(actor, USER_ROLE.STUDENT);

    const cart = await this.#cartService.cartOf(actor.id);
    if (cart.isEmpty) {
      throw new ValidationError('Your cart is empty.');
    }

    const shop = await this.#shopRepository.findByIdOrFail(cart.shopId, 'Shop');
    if (!shop.canReceiveOrders) {
      throw new ConflictError(`${shop.shopName} has closed. Your cart has been kept.`);
    }

    const { priceChanges, unavailable } = await this.#cartService.revalidate(cart);
    if (priceChanges.length > 0 || unavailable.length > 0) {
      throw new ConflictError(
        'Some items changed while you were ordering. Review your cart and try again.',
        { priceChanges, unavailable }
      );
    }

    const profile = await this.#studentProfileRepository.findOrCreateByUserId(actor.id);
    const hall = deliveryHall ?? profile.hallName;
    const room = deliveryRoom ?? profile.roomNo;
    if (!hall || !room) {
      throw new ValidationError('Add your hall and room before placing an order.');
    }

    // Checkout accepts a hall for this one order without saving it, so the stored profile
    // having passed this check earlier proves nothing about the hall actually being used.
    // JU's halls are gender-segregated, and sending a rider to the wrong one is a delivery
    // that cannot be completed.
    const student = await this.#userRepository.findByIdOrFail(actor.id, 'Account');
    HallPolicy.assertMatchesGender(hall, student.gender);

    const deliveryFee = await this.#settingsService.deliveryFee();
    const draft = Order.fromCart({
      cart,
      reference: Identifier.orderReference(),
      deliveryFee,
      deliveryHall: hall,
      deliveryRoom: room,
      note,
    });

    const order = await this.#orderRepository.createAggregate(draft);
    const { confirmPin } = await this.#deliveryService.createForOrder(order);
    await this.#paymentService.createForOrder(order);
    await this.#cartService.empty(cart);

    await this.#auditService.record({
      actorUserId: actor.id,
      entityType: AUDIT_ENTITY.ORDER,
      entityId: order.id,
      action: 'create',
      newValue: { reference: order.reference, total: order.total.taka },
    });
    await this.#notificationService.notify({
      userId: shop.ownerUserId,
      type: NOTIFICATION_TYPE.ORDER_PLACED,
      context: { reference: order.reference },
      relatedOrderId: order.id,
    });

    return { order: order.toJSON(), confirmPin };
  }

  /**
   * A student's order history (FR-C8).
   *
   * @param {import('@hungry-ju/shared/types').Actor} actor - Signed-in student.
   * @param {QueryOptions} [options] - Sort/page window.
   * @returns {Promise<import('@hungry-ju/shared/types').PaginatedResult>} Page of orders.
   */
  async historyOf(actor, options = new QueryOptions({ sortBy: 'placed_at' })) {
    const [orders, totalCount] = await Promise.all([
      this.#orderRepository.findByStudent(actor.id, options),
      this.#orderRepository.countByStudent(actor.id),
    ]);
    await this.#orderRepository.attachItemsToAll(orders);
    return options.paginate(
      orders.map((order) => order.toJSON()),
      totalCount
    );
  }

  /**
   * One order, with its delivery, for the tracking screen (FR-E1).
   *
   * @param {import('@hungry-ju/shared/types').Actor} actor - Signed-in user.
   * @param {string} orderId - Order to load.
   * @returns {Promise<Record<string, unknown>>} Order, shop, and delivery.
   * @throws {ForbiddenError} When the caller is neither the customer, the vendor, nor an admin.
   */
  async detail(actor, orderId) {
    const order = await this.#orderRepository.findWithItemsOrFail(orderId);
    const shop = await this.#shopRepository.findById(order.shopId);
    await this.#assertMayView(actor, order, shop);

    const delivery = await this.#deliveryService.forOrder(order.id);
    return {
      ...order.toJSON(),
      shop: shop ? shop.toJSON() : null,
      delivery: delivery ? delivery.toJSON() : null,
    };
  }

  /**
   * Cancels an order (UC-03).
   *
   * Eligibility is re-checked here, at the moment of the write, and not when the button
   * was rendered — the vendor may have started cooking in between, which is exactly the
   * race UC-03's alternate flow describes.
   *
   * @param {import('@hungry-ju/shared/types').Actor} actor - Signed-in student or admin.
   * @param {string} orderId - Order to cancel.
   * @param {string} [reason] - Why it is being cancelled.
   * @returns {Promise<Record<string, unknown>>} The cancelled order.
   * @throws {ForbiddenError} When the order belongs to someone else.
   * @throws {ConflictError} When preparation has already begun (BR-04).
   */
  async cancel(actor, orderId, reason = 'Cancelled by the customer.') {
    const order = await this.#orderRepository.findWithItemsOrFail(orderId);
    this.assertOwnership(actor, order.studentId, 'This order belongs to another student.');

    const previous = order.status;
    order.cancel(reason);
    const saved = await this.#orderRepository.save(order);

    await this.#deliveryService.cancelForOrder(order.id);
    await this.#auditService.recordTransition({
      actorUserId: actor.id,
      entityType: AUDIT_ENTITY.ORDER,
      entityId: order.id,
      from: previous,
      to: saved.status,
    });

    const shop = await this.#shopRepository.findById(order.shopId);
    const delivery = await this.#deliveryService.forOrder(order.id);
    await this.#notificationService.notifyAll(
      [order.studentId, shop?.ownerUserId, delivery?.riderUserId],
      {
        type: NOTIFICATION_TYPE.ORDER_CANCELLED,
        context: { reference: order.reference, reason },
        relatedOrderId: order.id,
      }
    );
    return saved.toJSON();
  }

  /**
   * Repeats a past order by refilling the cart (FR-C8 reorder).
   *
   * The cart is refilled rather than an order created directly, so the student passes
   * through checkout again and sees today's prices and availability.
   *
   * @param {import('@hungry-ju/shared/types').Actor} actor - Signed-in student.
   * @param {string} orderId - Order to repeat.
   * @returns {Promise<Record<string, unknown>>} The refilled cart.
   * @throws {ForbiddenError} When the order belongs to someone else.
   */
  async reorder(actor, orderId) {
    const order = await this.#orderRepository.findWithItemsOrFail(orderId);
    this.assertOwnership(actor, order.studentId, 'This order belongs to another student.');

    await this.#cartService.clear(actor);
    let cart = null;
    for (const item of order.items) {
      cart = await this.#cartService.addItem(actor, item.menuItemId, item.quantity);
    }
    return cart ?? this.#cartService.view(actor);
  }

  /**
   * The vendor's order board (FR-B4).
   *
   * @param {import('@hungry-ju/shared/types').Actor} actor - Signed-in vendor.
   * @param {string} shopId - Shop whose orders to list.
   * @param {string[]} [statuses] - Restrict to these statuses.
   * @param {QueryOptions} [options] - Sort/page window.
   * @returns {Promise<import('@hungry-ju/shared/types').PaginatedResult>} Page of orders.
   * @throws {ForbiddenError} When the caller does not own the shop.
   */
  async boardOf(
    actor,
    shopId,
    statuses = undefined,
    options = new QueryOptions({ sortBy: 'placed_at' })
  ) {
    await this.#assertOwnsShop(actor, shopId);
    const orders = await this.#orderRepository.findByShop(shopId, statuses, options);
    await this.#orderRepository.attachItemsToAll(orders);
    const totalCount = await this.#orderRepository.count(
      statuses ? { shop_id: shopId, status: { $in: statuses } } : { shop_id: shopId }
    );
    return options.paginate(
      orders.map((order) => order.toJSON()),
      totalCount
    );
  }

  /**
   * Vendor accepts an order (FR-B4).
   *
   * @param {import('@hungry-ju/shared/types').Actor} actor - Signed-in vendor.
   * @param {string} orderId - Order to accept.
   * @returns {Promise<Record<string, unknown>>} The accepted order.
   * @throws {ForbiddenError} When the caller does not own the shop.
   * @throws {ConflictError} When the order is no longer awaiting a decision.
   */
  async accept(actor, orderId) {
    const order = await this.#orderRepository.findWithItemsOrFail(orderId);
    const shop = await this.#assertOwnsShop(actor, order.shopId);

    order.accept();
    const saved = await this.#orderRepository.save(order);
    await this.#auditService.recordTransition({
      actorUserId: actor.id,
      entityType: AUDIT_ENTITY.ORDER,
      entityId: order.id,
      from: ORDER_STATUS.PLACED,
      to: saved.status,
    });
    await this.#notificationService.notify({
      userId: order.studentId,
      type: NOTIFICATION_TYPE.ORDER_ACCEPTED,
      context: { reference: order.reference, shopName: shop.shopName },
      relatedOrderId: order.id,
    });
    return saved.toJSON();
  }

  /**
   * Vendor refuses an order (FR-B4).
   *
   * @param {import('@hungry-ju/shared/types').Actor} actor - Signed-in vendor.
   * @param {string} orderId - Order to reject.
   * @param {string} reason - Why it is refused.
   * @returns {Promise<Record<string, unknown>>} The rejected order.
   * @throws {ForbiddenError} When the caller does not own the shop.
   */
  async reject(actor, orderId, reason) {
    const order = await this.#orderRepository.findWithItemsOrFail(orderId);
    const shop = await this.#assertOwnsShop(actor, order.shopId);

    const previous = order.status;
    order.reject(reason);
    const saved = await this.#orderRepository.save(order);

    await this.#deliveryService.cancelForOrder(order.id);
    await this.#auditService.recordTransition({
      actorUserId: actor.id,
      entityType: AUDIT_ENTITY.ORDER,
      entityId: order.id,
      from: previous,
      to: saved.status,
    });
    await this.#notificationService.notify({
      userId: order.studentId,
      type: NOTIFICATION_TYPE.ORDER_REJECTED,
      context: { reference: order.reference, shopName: shop.shopName, reason },
      relatedOrderId: order.id,
    });
    return saved.toJSON();
  }

  /**
   * Moves an accepted order forward through preparation and readiness (FR-B5).
   *
   * Marking an order ready is what publishes its delivery to the rider feed, so the two
   * happen together rather than depending on a rider refreshing at the right moment.
   *
   * @param {import('@hungry-ju/shared/types').Actor} actor - Signed-in vendor.
   * @param {string} orderId - Order to advance.
   * @param {string} nextStatus - Either `preparing` or `ready`.
   * @returns {Promise<Record<string, unknown>>} The updated order.
   * @throws {ForbiddenError} When the caller does not own the shop.
   * @throws {ValidationError} When asked for a status the vendor does not control.
   * @throws {ConflictError} When the move is not legal from the current status.
   */
  async advance(actor, orderId, nextStatus) {
    const order = await this.#orderRepository.findWithItemsOrFail(orderId);
    const shop = await this.#assertOwnsShop(actor, order.shopId);
    const previous = order.status;

    if (nextStatus === ORDER_STATUS.PREPARING) {
      order.startPreparing();
    } else if (nextStatus === ORDER_STATUS.READY) {
      order.markReady();
    } else {
      throw new ValidationError(`A vendor cannot move an order to "${nextStatus}".`);
    }

    const saved = await this.#orderRepository.save(order);
    if (nextStatus === ORDER_STATUS.READY) {
      await this.#deliveryService.publishForOrder(order.id);
    }

    await this.#auditService.recordTransition({
      actorUserId: actor.id,
      entityType: AUDIT_ENTITY.ORDER,
      entityId: order.id,
      from: previous,
      to: saved.status,
    });
    await this.#notificationService.notify({
      userId: order.studentId,
      type:
        nextStatus === ORDER_STATUS.READY
          ? NOTIFICATION_TYPE.ORDER_READY
          : NOTIFICATION_TYPE.ORDER_PREPARING,
      context: { reference: order.reference, shopName: shop.shopName },
      relatedOrderId: order.id,
    });
    return saved.toJSON();
  }

  /**
   * Cancels orders the vendor never answered (BR-11).
   *
   * Without this, an unresponsive vendor leaves a student waiting indefinitely — which
   * the SRS calls the highest trust-per-line-of-code feature in the system.
   *
   * @param {Date} [now] - Reference time; injectable for tests.
   * @returns {Promise<number>} Number of orders auto-cancelled.
   */
  async expireUnansweredOrders(now = new Date()) {
    const expired = await this.#orderRepository.findExpiredAwaitingAcceptance(now);
    for (const order of expired) {
      order.cancel('The vendor did not respond in time.');
      await this.#orderRepository.save(order);
      await this.#deliveryService.cancelForOrder(order.id);
      await this.#auditService.recordTransition({
        actorUserId: null,
        entityType: AUDIT_ENTITY.ORDER,
        entityId: order.id,
        from: ORDER_STATUS.PLACED,
        to: ORDER_STATUS.CANCELLED,
      });
      await this.#notificationService.notify({
        userId: order.studentId,
        type: NOTIFICATION_TYPE.ORDER_CANCELLED,
        context: { reference: order.reference, reason: 'The vendor did not respond in time.' },
        relatedOrderId: order.id,
      });
    }
    return expired.length;
  }

  /**
   * Confirms the signed-in vendor owns a shop.
   *
   * @param {import('@hungry-ju/shared/types').Actor} actor - Signed-in vendor.
   * @param {string} shopId - Shop to check.
   * @returns {Promise<import('../models/shop.js').Shop>} The shop.
   * @throws {ForbiddenError} When the caller does not own it.
   */
  async #assertOwnsShop(actor, shopId) {
    const shop = await this.#shopRepository.findByIdOrFail(shopId, 'Shop');
    this.assertOwnership(actor, shop.ownerUserId, 'This order belongs to another vendor.');
    return shop;
  }

  /**
   * Object-level read guard: customer, fulfilling vendor, assigned rider, or admin.
   *
   * @param {import('@hungry-ju/shared/types').Actor} actor - Signed-in user.
   * @param {Order} order - Order being read.
   * @param {import('../models/shop.js').Shop | null} shop - Shop fulfilling it.
   * @returns {Promise<void>} Resolves when the caller may see it.
   * @throws {ForbiddenError} When they may not.
   */
  async #assertMayView(actor, order, shop) {
    if (actor.role === USER_ROLE.ADMIN) {
      return;
    }
    if (actor.id === order.studentId) {
      return;
    }
    if (shop && actor.id === shop.ownerUserId) {
      return;
    }
    const delivery = await this.#deliveryService.forOrder(order.id);
    if (delivery && delivery.riderUserId === actor.id) {
      return;
    }
    throw new ForbiddenError('You cannot view this order.');
  }
}
