/**
 * @file Delivery assignment entity.
 *
 * @module models/delivery
 */

import { DELIVERY_STATUS } from '@hungry-ju/shared/enums';
import { BaseModel } from '../core/base-model.js';
import { ConflictError, ForbiddenError, ValidationError } from '../core/errors/app-error.js';
import { Money } from '../utils/money.js';
import { DeliveryStateMachine } from './delivery-state-machine.js';

/**
 * The delivery half of an order: who is carrying it, how far along they are, and the
 * PIN that proves it arrived.
 *
 * Kept separate from `Order` so rider concerns stay out of the order row and so the
 * atomic claim has a small row of its own to compete over (NFR-11).
 *
 * @augments BaseModel
 */
export class Delivery extends BaseModel {
  /** @type {string} */
  #orderId;

  /** @type {string} */
  #studentId;

  /** @type {string | null} */
  #riderUserId;

  /** @type {string} */
  #status;

  /** @type {Money} */
  #earning;

  /** @type {string} */
  #confirmPinHash;

  /** @type {Date | null} */
  #availableAt;

  /** @type {Date | null} */
  #acceptedAt;

  /** @type {Date | null} */
  #pickedUpAt;

  /** @type {Date | null} */
  #deliveredAt;

  /** @type {number} */
  #releaseCount;

  /**
   * @param {object} attributes - Delivery columns.
   * @param {string | null} [attributes.id] - Primary key.
   * @param {Date | string | null} [attributes.createdAt] - Creation timestamp.
   * @param {Date | string | null} [attributes.updatedAt] - Last write timestamp.
   * @param {string} attributes.orderId - Order being delivered.
   * @param {string} attributes.studentId - Customer, kept here to enforce BR-06 cheaply.
   * @param {string | null} [attributes.riderUserId] - Assigned delivery partner.
   * @param {string} [attributes.status] - Lifecycle state.
   * @param {Money} attributes.earning - What the rider keeps (the delivery fee).
   * @param {string} attributes.confirmPinHash - Hash of the customer's confirmation PIN.
   * @param {Date | string | null} [attributes.availableAt] - When it entered the open feed.
   * @param {Date | string | null} [attributes.acceptedAt] - When a rider claimed it.
   * @param {Date | string | null} [attributes.pickedUpAt] - When the food was collected.
   * @param {Date | string | null} [attributes.deliveredAt] - When the customer confirmed.
   * @param {number} [attributes.releaseCount] - How often it has been given back.
   */
  constructor({
    id,
    createdAt,
    updatedAt,
    orderId,
    studentId,
    riderUserId = null,
    status = DELIVERY_STATUS.PENDING,
    earning,
    confirmPinHash,
    availableAt = null,
    acceptedAt = null,
    pickedUpAt = null,
    deliveredAt = null,
    releaseCount = 0,
  }) {
    super({ id, createdAt, updatedAt });
    this.#orderId = orderId;
    this.#studentId = studentId;
    this.#riderUserId = riderUserId;
    this.#status = status;
    this.#earning = earning;
    this.#confirmPinHash = confirmPinHash;
    this.#availableAt = availableAt ? new Date(availableAt) : null;
    this.#acceptedAt = acceptedAt ? new Date(acceptedAt) : null;
    this.#pickedUpAt = pickedUpAt ? new Date(pickedUpAt) : null;
    this.#deliveredAt = deliveredAt ? new Date(deliveredAt) : null;
    this.#releaseCount = releaseCount;
  }

  /**
   * Order being delivered.
   *
   * @returns {string} Order id.
   */
  get orderId() {
    return this.#orderId;
  }

  /**
   * Customer expecting the food.
   *
   * @returns {string} User id.
   */
  get studentId() {
    return this.#studentId;
  }

  /**
   * Assigned delivery partner.
   *
   * @returns {string | null} User id, or `null` while unassigned.
   */
  get riderUserId() {
    return this.#riderUserId;
  }

  /**
   * Current lifecycle state.
   *
   * @returns {string} Delivery status.
   */
  get status() {
    return this.#status;
  }

  /**
   * What the rider keeps for this job.
   *
   * @returns {Money} Earning.
   */
  get earning() {
    return this.#earning;
  }

  /**
   * Hash of the confirmation PIN, compared inside the delivery service only.
   *
   * @returns {string} Bcrypt hash.
   */
  get confirmPinHash() {
    return this.#confirmPinHash;
  }

  /**
   * Whether this assignment currently occupies its rider (FR-D4).
   *
   * @returns {boolean} `true` while active.
   */
  get isActive() {
    return DeliveryStateMachine.shared.isActive(this.#status);
  }

  /**
   * Whether a rider may still claim this delivery.
   *
   * @returns {boolean} `true` when unassigned and in the open feed.
   */
  get isClaimable() {
    return this.#status === DELIVERY_STATUS.AVAILABLE && this.#riderUserId === null;
  }

  /**
   * When a rider claimed it.
   *
   * @returns {Date | null} Timestamp.
   */
  get acceptedAt() {
    return this.#acceptedAt;
  }

  /**
   * When the customer confirmed receipt.
   *
   * @returns {Date | null} Timestamp.
   */
  get deliveredAt() {
    return this.#deliveredAt;
  }

  /**
   * Applies a status change after checking the transition table.
   *
   * @private
   * @param {string} nextStatus - Target status.
   * @returns {void}
   * @throws {ConflictError} When the move is illegal.
   */
  #transitionTo(nextStatus) {
    DeliveryStateMachine.shared.assertTransition(this.#status, nextStatus);
    this.#status = nextStatus;
    this.touch();
  }

  /**
   * Publishes the delivery to the open feed once the vendor marks the food ready.
   *
   * @returns {void}
   * @throws {ConflictError} When the delivery is no longer pending.
   */
  publish() {
    this.#transitionTo(DELIVERY_STATUS.AVAILABLE);
    this.#availableAt = new Date();
  }

  /**
   * Binds the delivery to a rider (FR-D3).
   *
   * The in-memory guard here is deliberately *not* the concurrency control — the
   * repository's conditional update is. This check exists so a mistake in a service
   * fails immediately instead of producing a delivery with two owners.
   *
   * @param {string} riderUserId - Rider claiming the job.
   * @returns {void}
   * @throws {ForbiddenError} When the rider is the customer (BR-06).
   * @throws {ConflictError} When the delivery is already claimed.
   */
  assignTo(riderUserId) {
    if (riderUserId === this.#studentId) {
      throw new ForbiddenError('You cannot deliver your own order.');
    }
    if (!this.isClaimable) {
      throw new ConflictError('This order was just accepted by another delivery partner.');
    }
    this.#transitionTo(DELIVERY_STATUS.ASSIGNED);
    this.#riderUserId = riderUserId;
    this.#acceptedAt = new Date();
  }

  /**
   * Rider sets off towards the shop (FR-D5).
   *
   * @returns {void}
   * @throws {ConflictError} When not newly assigned.
   */
  startHeadingToVendor() {
    this.#transitionTo(DELIVERY_STATUS.HEADING_TO_VENDOR);
  }

  /**
   * Rider collects the food (FR-D5).
   *
   * @returns {void}
   * @throws {ConflictError} When the rider is not on their way yet.
   */
  markPickedUp() {
    this.#transitionTo(DELIVERY_STATUS.PICKED_UP);
    this.#pickedUpAt = new Date();
  }

  /**
   * Completes the delivery. The caller must already have verified the PIN — the entity
   * refuses to complete without that assertion, so BR-10 cannot be skipped by calling
   * this method directly.
   *
   * @param {boolean} pinVerified - Whether the customer's PIN matched.
   * @returns {void}
   * @throws {ForbiddenError} When the PIN was not verified.
   * @throws {ConflictError} When the food has not been picked up.
   */
  complete(pinVerified) {
    if (!pinVerified) {
      throw new ForbiddenError('The confirmation PIN is incorrect.');
    }
    this.#transitionTo(DELIVERY_STATUS.DELIVERED);
    this.#deliveredAt = new Date();
  }

  /**
   * Returns the job to the pool (FR-D8), clearing the rider so it can be claimed again.
   *
   * @returns {void}
   * @throws {ConflictError} When the food has already been picked up.
   */
  release() {
    this.#transitionTo(DELIVERY_STATUS.RELEASED);
    this.#riderUserId = null;
    this.#acceptedAt = null;
    this.#releaseCount += 1;
  }

  /**
   * Puts a released or pending delivery back into the open feed.
   *
   * A fresh row is not used, because the release history on this one is what tells an
   * admin that an order keeps being abandoned.
   *
   * @returns {void}
   */
  reopen() {
    this.#status = DELIVERY_STATUS.AVAILABLE;
    this.#riderUserId = null;
    this.#acceptedAt = null;
    this.#availableAt = new Date();
    this.touch();
  }

  /**
   * Checks own invariants.
   *
   * @returns {void} Returns nothing when the entity is consistent.
   * @throws {ValidationError} When a required field is missing.
   */
  validate() {
    if (!this.#orderId) {
      throw new ValidationError('A delivery must belong to an order.');
    }
    if (!this.#confirmPinHash) {
      throw new ValidationError('A delivery must carry a confirmation PIN.');
    }
    if (!(this.#earning instanceof Money)) {
      throw new ValidationError('A delivery must record the rider earning.');
    }
  }

  /**
   * Row shape for the `deliveries` table.
   *
   * @returns {import('@hungry-ju/shared/types').PersistenceRow} Row for the repository.
   */
  toPersistence() {
    return {
      ...this.baseRow(),
      order_id: this.#orderId,
      student_id: this.#studentId,
      rider_user_id: this.#riderUserId,
      status: this.#status,
      earning_poisha: this.#earning.poisha,
      confirm_pin_hash: this.#confirmPinHash,
      available_at: this.#availableAt ? this.#availableAt.toISOString() : null,
      accepted_at: this.#acceptedAt ? this.#acceptedAt.toISOString() : null,
      picked_up_at: this.#pickedUpAt ? this.#pickedUpAt.toISOString() : null,
      delivered_at: this.#deliveredAt ? this.#deliveredAt.toISOString() : null,
      release_count: this.#releaseCount,
    };
  }

  /**
   * Client-safe projection. The PIN hash never leaves the server.
   *
   * @returns {Record<string, unknown>} Serialisable delivery.
   */
  toJSON() {
    return {
      id: this.id,
      orderId: this.#orderId,
      riderUserId: this.#riderUserId,
      status: this.#status,
      earning: this.#earning.taka,
      isActive: this.isActive,
      acceptedAt: this.#acceptedAt ? this.#acceptedAt.toISOString() : null,
      pickedUpAt: this.#pickedUpAt ? this.#pickedUpAt.toISOString() : null,
      deliveredAt: this.#deliveredAt ? this.#deliveredAt.toISOString() : null,
      releaseCount: this.#releaseCount,
    };
  }

  /**
   * Rebuilds a delivery from a stored row.
   *
   * @param {import('@hungry-ju/shared/types').PersistenceRow} row - Row from storage.
   * @returns {Delivery} Hydrated delivery.
   */
  static fromPersistence(row) {
    return new Delivery({
      id: row.id,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      orderId: row.order_id,
      studentId: row.student_id,
      riderUserId: row.rider_user_id,
      status: row.status,
      earning: Money.fromPoisha(row.earning_poisha),
      confirmPinHash: row.confirm_pin_hash,
      availableAt: row.available_at,
      acceptedAt: row.accepted_at,
      pickedUpAt: row.picked_up_at,
      deliveredAt: row.delivered_at,
      releaseCount: row.release_count ?? 0,
    });
  }
}
