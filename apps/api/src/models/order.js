/**
 * @file Order aggregate: the central entity of the platform.
 *
 * @module models/order
 */

import { ORDER_STATUS, PAYMENT_METHOD } from '@hungry-ju/shared/enums';
import { ORDER_DEFAULTS } from '@hungry-ju/shared/constants';
import { BaseModel } from '../core/base-model.js';
import { ConflictError, ValidationError } from '../core/errors/app-error.js';
import { Money } from '../utils/money.js';
import { OrderItem } from './order-item.js';
import { OrderStateMachine } from './order-state-machine.js';

/**
 * A placed order and its frozen lines.
 *
 * Every status change goes through a method that consults the state machine first, so an
 * illegal move is impossible rather than merely discouraged. Totals are computed once, at
 * placement, and stored: an order is a financial record, and a record that recalculates
 * itself from today's menu is not a record.
 *
 * @augments BaseModel
 */
export class Order extends BaseModel {
  /** @type {string} */
  #reference;

  /** @type {string} */
  #studentId;

  /** @type {string} */
  #shopId;

  /** @type {string} */
  #status;

  /** @type {OrderItem[]} */
  #items;

  /** @type {Money} */
  #subtotal;

  /** @type {Money} */
  #deliveryFee;

  /** @type {Money} */
  #total;

  /** @type {string} */
  #deliveryHall;

  /** @type {string} */
  #deliveryRoom;

  /** @type {string | null} */
  #note;

  /** @type {string} */
  #paymentMethod;

  /** @type {string | null} */
  #cancellationReason;

  /** @type {Date} */
  #placedAt;

  /** @type {Date} */
  #acceptDeadline;

  /** @type {Date | null} */
  #acceptedAt;

  /** @type {Date | null} */
  #readyAt;

  /** @type {Date | null} */
  #completedAt;

  /**
   * @param {object} attributes - Order columns.
   * @param {string | null} [attributes.id] - Primary key.
   * @param {Date | string | null} [attributes.createdAt] - Creation timestamp.
   * @param {Date | string | null} [attributes.updatedAt] - Last write timestamp.
   * @param {string} attributes.reference - Short human-quotable reference.
   * @param {string} attributes.studentId - Ordering student.
   * @param {string} attributes.shopId - Vendor fulfilling the order.
   * @param {string} [attributes.status] - Lifecycle state.
   * @param {OrderItem[]} [attributes.items] - Frozen order lines.
   * @param {Money} attributes.subtotal - Sum of the lines at placement.
   * @param {Money} attributes.deliveryFee - Fee at placement.
   * @param {Money} attributes.total - Subtotal plus fee at placement.
   * @param {string} attributes.deliveryHall - Destination hall.
   * @param {string} attributes.deliveryRoom - Destination room or gate.
   * @param {string | null} [attributes.note] - Free-text note for the rider.
   * @param {string} [attributes.paymentMethod] - Payment method; COD in the MVP.
   * @param {string | null} [attributes.cancellationReason] - Reason, when cancelled.
   * @param {Date | string | null} [attributes.placedAt] - When the order was placed.
   * @param {Date | string | null} [attributes.acceptDeadline] - Vendor accept deadline (BR-11).
   * @param {Date | string | null} [attributes.acceptedAt] - When the vendor accepted.
   * @param {Date | string | null} [attributes.readyAt] - When the food became ready.
   * @param {Date | string | null} [attributes.completedAt] - When the order reached an end state.
   */
  constructor({
    id,
    createdAt,
    updatedAt,
    reference,
    studentId,
    shopId,
    status = ORDER_STATUS.PLACED,
    items = [],
    subtotal,
    deliveryFee,
    total,
    deliveryHall,
    deliveryRoom,
    note = null,
    paymentMethod = PAYMENT_METHOD.COD,
    cancellationReason = null,
    placedAt = null,
    acceptDeadline = null,
    acceptedAt = null,
    readyAt = null,
    completedAt = null,
  }) {
    super({ id, createdAt, updatedAt });
    this.#reference = reference;
    this.#studentId = studentId;
    this.#shopId = shopId;
    this.#status = status;
    this.#items = items;
    this.#subtotal = subtotal;
    this.#deliveryFee = deliveryFee;
    this.#total = total;
    this.#deliveryHall = deliveryHall;
    this.#deliveryRoom = deliveryRoom;
    this.#note = note;
    this.#paymentMethod = paymentMethod;
    this.#cancellationReason = cancellationReason;
    this.#placedAt = placedAt ? new Date(placedAt) : new Date();
    this.#acceptDeadline = acceptDeadline
      ? new Date(acceptDeadline)
      : new Date(this.#placedAt.getTime() + ORDER_DEFAULTS.VENDOR_ACCEPT_TIMEOUT_SEC * 1000);
    this.#acceptedAt = acceptedAt ? new Date(acceptedAt) : null;
    this.#readyAt = readyAt ? new Date(readyAt) : null;
    this.#completedAt = completedAt ? new Date(completedAt) : null;
  }

  /**
   * Builds a new order from a validated cart at checkout (UC-01).
   *
   * The cart is not mutated here; emptying it is the ordering service's job, and only
   * after the order has actually been written.
   *
   * @param {object} parameters - Checkout inputs.
   * @param {import('./cart.js').Cart} parameters.cart - Cart being ordered.
   * @param {string} parameters.reference - Generated order reference.
   * @param {Money} parameters.deliveryFee - Fee in force at this moment.
   * @param {string} parameters.deliveryHall - Destination hall.
   * @param {string} parameters.deliveryRoom - Destination room or gate.
   * @param {string | null} [parameters.note] - Free-text note.
   * @returns {Order} The order, ready to be persisted with status `placed`.
   * @throws {ValidationError} When the cart is empty.
   */
  static fromCart({ cart, reference, deliveryFee, deliveryHall, deliveryRoom, note = null }) {
    if (cart.isEmpty) {
      throw new ValidationError('Your cart is empty.');
    }
    const items = cart.items.map((cartItem) => OrderItem.fromCartItem(cartItem));
    const subtotal = Money.sum(items.map((item) => item.lineTotal));
    return new Order({
      reference,
      studentId: cart.studentId,
      shopId: cart.shopId,
      items,
      subtotal,
      deliveryFee,
      total: subtotal.add(deliveryFee),
      deliveryHall,
      deliveryRoom,
      note,
    });
  }

  /**
   * Short human-quotable reference.
   *
   * @returns {string} Order reference.
   */
  get reference() {
    return this.#reference;
  }

  /**
   * Ordering student.
   *
   * @returns {string} User id.
   */
  get studentId() {
    return this.#studentId;
  }

  /**
   * Vendor fulfilling the order.
   *
   * @returns {string} Shop id.
   */
  get shopId() {
    return this.#shopId;
  }

  /**
   * Current lifecycle state.
   *
   * @returns {string} Order status.
   */
  get status() {
    return this.#status;
  }

  /**
   * The frozen lines, as a copy.
   *
   * @returns {OrderItem[]} Order lines.
   */
  get items() {
    return [...this.#items];
  }

  /**
   * Sum of the lines at placement.
   *
   * @returns {Money} Subtotal.
   */
  get subtotal() {
    return this.#subtotal;
  }

  /**
   * Delivery fee at placement, which is also the rider's earning under COD-Direct
   * (SRS section 12.1).
   *
   * @returns {Money} Fee.
   */
  get deliveryFee() {
    return this.#deliveryFee;
  }

  /**
   * Amount the customer pays in cash on delivery.
   *
   * @returns {Money} Total.
   */
  get total() {
    return this.#total;
  }

  /**
   * Destination hall.
   *
   * @returns {string} Hall name.
   */
  get deliveryHall() {
    return this.#deliveryHall;
  }

  /**
   * Destination room or gate.
   *
   * @returns {string} Room number.
   */
  get deliveryRoom() {
    return this.#deliveryRoom;
  }

  /**
   * Free-text note for the vendor and rider.
   *
   * @returns {string | null} Note.
   */
  get note() {
    return this.#note;
  }

  /**
   * When the vendor must have answered by (BR-11).
   *
   * @returns {Date} Deadline.
   */
  get acceptDeadline() {
    return this.#acceptDeadline;
  }

  /**
   * Whether the vendor has run out of time to answer.
   *
   * @returns {boolean} `true` when still `placed` past the deadline.
   */
  get hasAcceptanceExpired() {
    return this.#status === ORDER_STATUS.PLACED && this.#acceptDeadline.getTime() <= Date.now();
  }

  /**
   * BR-04: whether the student may still cancel.
   *
   * @returns {boolean} `true` while cancellation is allowed.
   */
  get isCancellable() {
    return OrderStateMachine.shared.isCancellable(this.#status);
  }

  /**
   * Whether the order has reached an end state.
   *
   * @returns {boolean} `true` for delivered, cancelled, and rejected.
   */
  get isFinal() {
    return OrderStateMachine.shared.isFinal(this.#status);
  }

  /**
   * Whether the food is waiting at the counter for a rider.
   *
   * @returns {boolean} `true` when ready for pickup.
   */
  get isReadyForPickup() {
    return this.#status === ORDER_STATUS.READY;
  }

  /**
   * Total units across all lines.
   *
   * @returns {number} Unit count.
   */
  get itemCount() {
    return this.#items.reduce((total, item) => total + item.quantity, 0);
  }

  /**
   * Replaces the lines wholesale; the repository uses it after loading them.
   *
   * @param {OrderItem[]} items - Lines belonging to this order.
   * @returns {void}
   */
  setItems(items) {
    this.#items = items;
  }

  /**
   * Applies a status change after checking the transition table.
   *
   * Every public status method funnels through here, which is why there is exactly one
   * place where an order's status is assigned.
   *
   * @private
   * @param {string} nextStatus - Target status.
   * @returns {void}
   * @throws {import('../core/errors/app-error.js').ConflictError} When the move is illegal.
   */
  #transitionTo(nextStatus) {
    OrderStateMachine.shared.assertTransition(this.#status, nextStatus);
    this.#status = nextStatus;
    this.touch();
  }

  /**
   * Vendor accepts the order (FR-B4).
   *
   * @returns {void}
   * @throws {import('../core/errors/app-error.js').ConflictError} When not pending acceptance.
   */
  accept() {
    this.#transitionTo(ORDER_STATUS.ACCEPTED);
    this.#acceptedAt = new Date();
  }

  /**
   * Vendor refuses the order (FR-B4).
   *
   * @param {string} reason - Why the order was refused.
   * @returns {void}
   * @throws {ValidationError} When no reason is supplied.
   * @throws {import('../core/errors/app-error.js').ConflictError} When not pending acceptance.
   */
  reject(reason) {
    if (!reason || reason.trim() === '') {
      throw new ValidationError('A rejection reason is required.');
    }
    this.#transitionTo(ORDER_STATUS.REJECTED);
    this.#cancellationReason = reason;
    this.#completedAt = new Date();
  }

  /**
   * Vendor starts cooking. This is the point of no return for cancellation (BR-04).
   *
   * @returns {void}
   * @throws {import('../core/errors/app-error.js').ConflictError} When not accepted.
   */
  startPreparing() {
    this.#transitionTo(ORDER_STATUS.PREPARING);
  }

  /**
   * Vendor marks the food ready for pickup (FR-B5). This is what puts the order into
   * the delivery feed.
   *
   * @returns {void}
   * @throws {import('../core/errors/app-error.js').ConflictError} When not preparing.
   */
  markReady() {
    this.#transitionTo(ORDER_STATUS.READY);
    this.#readyAt = new Date();
  }

  /**
   * Rider collects the food (FR-D5).
   *
   * @returns {void}
   * @throws {import('../core/errors/app-error.js').ConflictError} When not ready.
   */
  markPickedUp() {
    this.#transitionTo(ORDER_STATUS.PICKED_UP);
  }

  /**
   * Customer confirms receipt (FR-D6). Only the delivery service calls this, and only
   * after the PIN matched — never on the rider's word alone (BR-10).
   *
   * @returns {void}
   * @throws {import('../core/errors/app-error.js').ConflictError} When not picked up.
   */
  markDelivered() {
    this.#transitionTo(ORDER_STATUS.DELIVERED);
    this.#completedAt = new Date();
  }

  /**
   * Cancels the order (FR-C7, BR-04).
   *
   * @param {string} [reason] - Why it was cancelled.
   * @returns {void}
   * @throws {import('../core/errors/app-error.js').ConflictError} When preparation has begun.
   */
  cancel(reason = 'Cancelled by the customer.') {
    this.#transitionTo(ORDER_STATUS.CANCELLED);
    this.#cancellationReason = reason;
    this.#completedAt = new Date();
  }

  /**
   * Admin override: cancels the order however far it has gone (FR-G3).
   *
   * This is the one path that skips the transition table, and it exists because BR-04's
   * cancellation window protects the vendor from a late customer cancel — it was never
   * meant to trap an order that a dispute has stranded. Terminal orders are still
   * refused: there is nothing to intervene in once the food was delivered.
   *
   * @param {string} reason - Why the admin intervened.
   * @returns {void}
   * @throws {ConflictError} When the order has already finished.
   */
  forceCancel(reason) {
    if (this.isFinal) {
      throw new ConflictError('This order has already finished.');
    }
    this.#status = ORDER_STATUS.CANCELLED;
    this.#cancellationReason = reason;
    this.#completedAt = new Date();
    this.touch();
  }

  /**
   * The status timeline the tracking screen renders (FR-E1).
   *
   * @returns {Array<{ status: string, at: string | null }>} Milestones in order.
   */
  timeline() {
    return [
      { status: ORDER_STATUS.PLACED, at: this.#placedAt.toISOString() },
      { status: ORDER_STATUS.ACCEPTED, at: this.#acceptedAt?.toISOString() ?? null },
      { status: ORDER_STATUS.READY, at: this.#readyAt?.toISOString() ?? null },
      { status: ORDER_STATUS.DELIVERED, at: this.#completedAt?.toISOString() ?? null },
    ];
  }

  /**
   * Checks own invariants, including that the stored total still equals its parts.
   *
   * @returns {void} Returns nothing when the entity is consistent.
   * @throws {ValidationError} When a required field is missing or the totals disagree.
   */
  validate() {
    if (!this.#studentId || !this.#shopId) {
      throw new ValidationError('An order must have a customer and a vendor.');
    }
    if (this.#items.length === 0) {
      throw new ValidationError('An order must contain at least one item.');
    }
    if (!this.#deliveryHall || !this.#deliveryRoom) {
      throw new ValidationError('A delivery hall and room are required.');
    }
    if (!this.#subtotal.add(this.#deliveryFee).equals(this.#total)) {
      throw new ValidationError('The order total does not match its subtotal and delivery fee.');
    }
    for (const item of this.#items) {
      item.validate();
    }
  }

  /**
   * Row shape for the `orders` table. Lines are stored separately.
   *
   * @returns {import('@hungry-ju/shared/types').PersistenceRow} Row for the repository.
   */
  toPersistence() {
    return {
      ...this.baseRow(),
      reference: this.#reference,
      student_id: this.#studentId,
      shop_id: this.#shopId,
      status: this.#status,
      subtotal_poisha: this.#subtotal.poisha,
      delivery_fee_poisha: this.#deliveryFee.poisha,
      total_poisha: this.#total.poisha,
      delivery_hall: this.#deliveryHall,
      delivery_room: this.#deliveryRoom,
      note: this.#note,
      payment_method: this.#paymentMethod,
      cancellation_reason: this.#cancellationReason,
      placed_at: this.#placedAt.toISOString(),
      accept_deadline: this.#acceptDeadline.toISOString(),
      accepted_at: this.#acceptedAt ? this.#acceptedAt.toISOString() : null,
      ready_at: this.#readyAt ? this.#readyAt.toISOString() : null,
      completed_at: this.#completedAt ? this.#completedAt.toISOString() : null,
    };
  }

  /**
   * Client-safe projection.
   *
   * @returns {Record<string, unknown>} Serialisable order.
   */
  toJSON() {
    return {
      id: this.id,
      reference: this.#reference,
      studentId: this.#studentId,
      shopId: this.#shopId,
      status: this.#status,
      items: this.#items.map((item) => item.toJSON()),
      itemCount: this.itemCount,
      subtotal: this.#subtotal.taka,
      deliveryFee: this.#deliveryFee.taka,
      total: this.#total.taka,
      deliveryHall: this.#deliveryHall,
      deliveryRoom: this.#deliveryRoom,
      note: this.#note,
      paymentMethod: this.#paymentMethod,
      cancellationReason: this.#cancellationReason,
      isCancellable: this.isCancellable,
      isFinal: this.isFinal,
      placedAt: this.#placedAt.toISOString(),
      acceptDeadline: this.#acceptDeadline.toISOString(),
      timeline: this.timeline(),
    };
  }

  /**
   * Rebuilds an order from a stored row; lines are attached by the repository.
   *
   * @param {import('@hungry-ju/shared/types').PersistenceRow} row - Row from storage.
   * @returns {Order} Hydrated order without its lines.
   */
  static fromPersistence(row) {
    return new Order({
      id: row.id,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      reference: row.reference,
      studentId: row.student_id,
      shopId: row.shop_id,
      status: row.status,
      subtotal: Money.fromPoisha(row.subtotal_poisha),
      deliveryFee: Money.fromPoisha(row.delivery_fee_poisha),
      total: Money.fromPoisha(row.total_poisha),
      deliveryHall: row.delivery_hall,
      deliveryRoom: row.delivery_room,
      note: row.note,
      paymentMethod: row.payment_method,
      cancellationReason: row.cancellation_reason,
      placedAt: row.placed_at,
      acceptDeadline: row.accept_deadline,
      acceptedAt: row.accepted_at,
      readyAt: row.ready_at,
      completedAt: row.completed_at,
    });
  }
}
