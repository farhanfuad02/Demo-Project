/**
 * @file Platform administration: approvals, suspensions, disputes, analytics.
 *
 * @module services/admin-service
 */

import {
  AUDIT_ENTITY,
  APPROVAL_STATUS,
  NOTIFICATION_TYPE,
  ORDER_STATUS,
  USER_ROLE,
  USER_STATUS,
} from '@hungry-ju/shared/enums';
import { BaseService } from '../core/base-service.js';
import { ValidationError } from '../core/errors/app-error.js';
import { QueryOptions } from '../utils/query-options.js';

/**
 * Epic G: the operator's tools.
 *
 * Every method here takes an admin actor, and the routes are guarded by role — but the
 * guards are repeated in the service rather than trusted from the router, because an
 * endpoint that suspends any account is the one place where a missing check is
 * catastrophic rather than annoying.
 *
 * @augments BaseService
 */
export class AdminService extends BaseService {
  /** @type {import('../repositories/user-repository.js').UserRepository} */
  #userRepository;

  /** @type {import('../repositories/shop-repository.js').ShopRepository} */
  #shopRepository;

  /** @type {import('../repositories/order-repository.js').OrderRepository} */
  #orderRepository;

  /** @type {import('../repositories/delivery-repository.js').DeliveryRepository} */
  #deliveryRepository;

  /** @type {import('../repositories/audit-log-repository.js').AuditLogRepository} */
  #auditLogRepository;

  /** @type {import('./token-service.js').TokenService} */
  #tokenService;

  /** @type {import('./notification-service.js').NotificationService} */
  #notificationService;

  /** @type {import('./audit-service.js').AuditService} */
  #auditService;

  /**
   * @param {object} dependencies - Injected collaborators.
   * @param {import('../repositories/user-repository.js').UserRepository} dependencies.userRepository -
   *   Account storage.
   * @param {import('../repositories/shop-repository.js').ShopRepository} dependencies.shopRepository -
   *   Shop storage.
   * @param {import('../repositories/order-repository.js').OrderRepository} dependencies.orderRepository -
   *   Order storage.
   * @param {import('../repositories/delivery-repository.js').DeliveryRepository} dependencies.deliveryRepository -
   *   Delivery storage.
   * @param {import('../repositories/audit-log-repository.js').AuditLogRepository} dependencies.auditLogRepository -
   *   Audit trail reads.
   * @param {import('./token-service.js').TokenService} dependencies.tokenService - Session
   *   revocation on suspension.
   * @param {import('./notification-service.js').NotificationService} dependencies.notificationService -
   *   Outbound messages.
   * @param {import('./audit-service.js').AuditService} dependencies.auditService - Audit writes.
   */
  constructor({
    userRepository,
    shopRepository,
    orderRepository,
    deliveryRepository,
    auditLogRepository,
    tokenService,
    notificationService,
    auditService,
  }) {
    super();
    this.#userRepository = userRepository;
    this.#shopRepository = shopRepository;
    this.#orderRepository = orderRepository;
    this.#deliveryRepository = deliveryRepository;
    this.#auditLogRepository = auditLogRepository;
    this.#tokenService = tokenService;
    this.#notificationService = notificationService;
    this.#auditService = auditService;
  }

  /**
   * Shops waiting for a decision (FR-G1).
   *
   * @param {import('@hungry-ju/shared/types').Actor} actor - Signed-in admin.
   * @param {string} [status] - Which queue to show.
   * @param {QueryOptions} [options] - Sort/page window.
   * @returns {Promise<import('@hungry-ju/shared/types').PaginatedResult>} Page of shops.
   */
  async shopQueue(actor, status = APPROVAL_STATUS.PENDING, options = new QueryOptions()) {
    this.assertRole(actor, USER_ROLE.ADMIN);
    const [shops, totalCount] = await Promise.all([
      this.#shopRepository.findMany({ approval_status: status }, options),
      this.#shopRepository.count({ approval_status: status }),
    ]);

    const owners = await Promise.all(
      shops.map((shop) => this.#userRepository.findById(shop.ownerUserId))
    );
    return options.paginate(
      shops.map((shop, index) => ({
        ...shop.toJSON(),
        owner: owners[index] ? owners[index].toJSON() : null,
      })),
      totalCount
    );
  }

  /**
   * Approves or rejects a shop application (FR-G1).
   *
   * @param {import('@hungry-ju/shared/types').Actor} actor - Signed-in admin.
   * @param {string} shopId - Shop being decided on.
   * @param {boolean} approved - The decision.
   * @param {string} [reason] - Why; required to reject.
   * @returns {Promise<Record<string, unknown>>} The decided shop.
   * @throws {ValidationError} When rejecting without a reason.
   */
  async decideShop(actor, shopId, approved, reason = null) {
    this.assertRole(actor, USER_ROLE.ADMIN);
    const shop = await this.#shopRepository.findByIdOrFail(shopId, 'Shop');
    const previous = shop.approvalStatus;

    if (approved) {
      shop.approve(reason);
    } else {
      if (!reason) {
        throw new ValidationError('Tell the vendor why their application was rejected.');
      }
      shop.reject(reason);
    }
    const saved = await this.#shopRepository.save(shop);

    await this.#auditService.recordTransition({
      actorUserId: actor.id,
      entityType: AUDIT_ENTITY.SHOP,
      entityId: shop.id,
      from: previous,
      to: saved.approvalStatus,
    });
    await this.#notificationService.notify({
      userId: shop.ownerUserId,
      type: approved ? NOTIFICATION_TYPE.VENDOR_APPROVED : NOTIFICATION_TYPE.VENDOR_REJECTED,
      context: { shopName: shop.shopName, reason },
    });
    return saved.toJSON();
  }

  /**
   * The user directory (FR-G2).
   *
   * @param {import('@hungry-ju/shared/types').Actor} actor - Signed-in admin.
   * @param {object} [filters] - Optional narrowing.
   * @param {string} [filters.role] - Restrict to one role.
   * @param {string} [filters.status] - Restrict to one status.
   * @param {string} [filters.search] - Partial name or e-mail.
   * @param {QueryOptions} [options] - Sort/page window.
   * @returns {Promise<import('@hungry-ju/shared/types').PaginatedResult>} Page of accounts.
   */
  async users(
    actor,
    { role = null, status = null, search = null } = {},
    options = new QueryOptions()
  ) {
    this.assertRole(actor, USER_ROLE.ADMIN);

    /** @type {import('@hungry-ju/shared/types').Criteria} */
    const criteria = {};
    if (role) {
      criteria.role = role;
    }
    if (status) {
      criteria.status = status;
    }
    if (search) {
      criteria.full_name = { $like: search };
    }

    const [users, totalCount] = await Promise.all([
      this.#userRepository.findMany(criteria, options),
      this.#userRepository.count(criteria),
    ]);
    return options.paginate(
      users.map((user) => user.toJSON()),
      totalCount
    );
  }

  /**
   * Suspends or reactivates an account (FR-G2).
   *
   * Suspension also revokes every session, so the effect is immediate rather than
   * delayed until whatever access token the user is holding expires.
   *
   * @param {import('@hungry-ju/shared/types').Actor} actor - Signed-in admin.
   * @param {string} userId - Account to change.
   * @param {boolean} suspended - Desired state.
   * @returns {Promise<Record<string, unknown>>} The updated account.
   * @throws {ValidationError} When an admin tries to suspend themselves.
   */
  async setUserSuspended(actor, userId, suspended) {
    this.assertRole(actor, USER_ROLE.ADMIN);
    if (userId === actor.id) {
      throw new ValidationError('You cannot suspend your own account.');
    }

    const user = await this.#userRepository.findByIdOrFail(userId, 'Account');
    const previous = user.status;

    if (suspended) {
      user.suspend();
    } else {
      user.reactivate();
    }
    const saved = await this.#userRepository.save(user);

    if (suspended) {
      await this.#tokenService.revokeAllSessions(user.id);
      await this.#notificationService.notify({
        userId: user.id,
        type: NOTIFICATION_TYPE.ACCOUNT_SUSPENDED,
      });
    }
    await this.#auditService.recordTransition({
      actorUserId: actor.id,
      entityType: AUDIT_ENTITY.USER,
      entityId: user.id,
      from: previous,
      to: saved.status,
    });
    return saved.toJSON();
  }

  /**
   * The live orders monitor (FR-G3).
   *
   * Stuck orders are flagged rather than merely listed: an order nobody has picked up
   * for twenty minutes is the failure mode risk R1 predicts, and the admin has to see
   * it without reading timestamps.
   *
   * @param {import('@hungry-ju/shared/types').Actor} actor - Signed-in admin.
   * @param {object} [filters] - Optional narrowing.
   * @param {string} [filters.status] - Restrict to one status.
   * @param {number} [filters.stuckMinutes] - Age at which an active order counts as stuck.
   * @param {QueryOptions} [options] - Sort/page window.
   * @returns {Promise<import('@hungry-ju/shared/types').PaginatedResult>} Page of orders.
   */
  async orders(
    actor,
    { status = null, stuckMinutes = 20 } = {},
    options = new QueryOptions({ sortBy: 'placed_at' })
  ) {
    this.assertRole(actor, USER_ROLE.ADMIN);

    /** @type {import('@hungry-ju/shared/types').Criteria} */
    const criteria = status ? { status } : {};
    const [orders, totalCount] = await Promise.all([
      this.#orderRepository.findMany(criteria, options),
      this.#orderRepository.count(criteria),
    ]);
    await this.#orderRepository.attachItemsToAll(orders);

    const cutoff = Date.now() - stuckMinutes * 60_000;
    const shops = await Promise.all(
      orders.map((order) => this.#shopRepository.findById(order.shopId))
    );
    const deliveries = await Promise.all(
      orders.map((order) => this.#deliveryRepository.findByOrder(order.id))
    );

    return options.paginate(
      orders.map((order, index) => ({
        ...order.toJSON(),
        shop: shops[index] ? shops[index].toJSON() : null,
        delivery: deliveries[index] ? deliveries[index].toJSON() : null,
        isStuck: !order.isFinal && order.createdAt.getTime() < cutoff,
      })),
      totalCount
    );
  }

  /**
   * Force-cancels an order in a dispute (FR-G3).
   *
   * @param {import('@hungry-ju/shared/types').Actor} actor - Signed-in admin.
   * @param {string} orderId - Order to cancel.
   * @param {string} reason - Why the admin intervened.
   * @returns {Promise<Record<string, unknown>>} The cancelled order.
   * @throws {ValidationError} When the order has already finished.
   */
  async forceCancelOrder(actor, orderId, reason) {
    this.assertRole(actor, USER_ROLE.ADMIN);
    const order = await this.#orderRepository.findWithItemsOrFail(orderId);
    if (order.isFinal) {
      throw new ValidationError('This order has already finished.');
    }

    const previous = order.status;
    // Admin intervention bypasses the customer cancellation window (BR-04) on purpose:
    // the window protects the vendor from a late cancel, not the platform from a stuck
    // order that nobody is going to deliver.
    order.forceCancel(reason);
    const saved = await this.#orderRepository.save(order);

    const delivery = await this.#deliveryRepository.findByOrder(orderId);
    if (delivery && delivery.status !== 'delivered') {
      delivery.release();
      await this.#deliveryRepository.save(delivery);
    }

    await this.#auditService.recordTransition({
      actorUserId: actor.id,
      entityType: AUDIT_ENTITY.ORDER,
      entityId: order.id,
      from: previous,
      to: ORDER_STATUS.CANCELLED,
    });
    const shop = await this.#shopRepository.findById(order.shopId);
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
   * Returns a stuck delivery to the pool so somebody else can take it (FR-G3).
   *
   * @param {import('@hungry-ju/shared/types').Actor} actor - Signed-in admin.
   * @param {string} orderId - Order whose delivery to reassign.
   * @returns {Promise<Record<string, unknown>>} The reopened delivery.
   * @throws {ValidationError} When the order has no delivery to reassign.
   */
  async reassignDelivery(actor, orderId) {
    this.assertRole(actor, USER_ROLE.ADMIN);
    const delivery = await this.#deliveryRepository.findByOrder(orderId);
    if (!delivery) {
      throw new ValidationError('This order has no delivery record.');
    }
    const previous = delivery.status;
    delivery.reopen();
    const saved = await this.#deliveryRepository.save(delivery);

    await this.#auditService.recordTransition({
      actorUserId: actor.id,
      entityType: AUDIT_ENTITY.DELIVERY,
      entityId: delivery.id,
      from: previous,
      to: saved.status,
    });
    return saved.toJSON();
  }

  /**
   * The audit log viewer (NFR-13).
   *
   * @param {import('@hungry-ju/shared/types').Actor} actor - Signed-in admin.
   * @param {object} [filters] - Optional narrowing.
   * @param {string} [filters.entityType] - Restrict to one entity family.
   * @param {string} [filters.entityId] - Restrict to one entity.
   * @param {QueryOptions} [options] - Sort/page window.
   * @returns {Promise<import('@hungry-ju/shared/types').PaginatedResult>} Page of entries.
   */
  async auditLog(
    actor,
    { entityType = null, entityId = null } = {},
    options = new QueryOptions({ sortBy: 'created_at' })
  ) {
    this.assertRole(actor, USER_ROLE.ADMIN);

    /** @type {import('@hungry-ju/shared/types').Criteria} */
    const criteria = {};
    if (entityType) {
      criteria.entity_type = entityType;
    }
    if (entityId) {
      criteria.entity_id = entityId;
    }

    const [entries, totalCount] = await Promise.all([
      this.#auditLogRepository.findRecent(criteria, options),
      this.#auditLogRepository.count(criteria),
    ]);
    return options.paginate(
      entries.map((entry) => entry.toJSON()),
      totalCount
    );
  }

  /**
   * Counts for the admin dashboard header.
   *
   * @param {import('@hungry-ju/shared/types').Actor} actor - Signed-in admin.
   * @returns {Promise<Record<string, number>>} Headline counts.
   */
  async summary(actor) {
    this.assertRole(actor, USER_ROLE.ADMIN);
    const [students, vendors, pendingShops, activeOrders, deliveredOrders] = await Promise.all([
      this.#userRepository.count({ role: USER_ROLE.STUDENT, status: USER_STATUS.VERIFIED }),
      this.#userRepository.count({ role: USER_ROLE.VENDOR, status: USER_STATUS.VERIFIED }),
      this.#shopRepository.count({ approval_status: APPROVAL_STATUS.PENDING }),
      this.#orderRepository.count({
        status: {
          $in: [
            ORDER_STATUS.PLACED,
            ORDER_STATUS.ACCEPTED,
            ORDER_STATUS.PREPARING,
            ORDER_STATUS.READY,
            ORDER_STATUS.PICKED_UP,
          ],
        },
      }),
      this.#orderRepository.count({ status: ORDER_STATUS.DELIVERED }),
    ]);
    return { students, vendors, pendingShops, activeOrders, deliveredOrders };
  }
}
