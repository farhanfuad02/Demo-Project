/**
 * @file Payment record.
 *
 * @module models/payment
 */

import { ESCROW_STATUS, PAYMENT_METHOD } from '@hungry-ju/shared/enums';
import { BaseModel } from '../core/base-model.js';
import { ValidationError } from '../core/errors/app-error.js';
import { Money } from '../utils/money.js';

/**
 * What was owed on an order and whether it has been collected.
 *
 * The MVP settles in cash (FR-F1), so this row is a ledger entry rather than a gateway
 * transaction: it records that the rider collected the full total at the door. The
 * escrow columns exist from day one so Phase 2 adds a gateway adapter instead of a
 * migration (SRS section 10).
 *
 * @augments BaseModel
 */
export class Payment extends BaseModel {
  /** @type {string} */
  #orderId;

  /** @type {string} */
  #method;

  /** @type {Money} */
  #amount;

  /** @type {string | null} */
  #escrowStatus;

  /** @type {string | null} */
  #gatewayTxnId;

  /** @type {string | null} */
  #collectedByUserId;

  /** @type {Date | null} */
  #collectedAt;

  /**
   * @param {object} attributes - Payment columns.
   * @param {string | null} [attributes.id] - Primary key.
   * @param {Date | string | null} [attributes.createdAt] - Creation timestamp.
   * @param {Date | string | null} [attributes.updatedAt] - Last write timestamp.
   * @param {string} attributes.orderId - Order being paid for.
   * @param {string} [attributes.method] - Payment method.
   * @param {Money} attributes.amount - Amount owed.
   * @param {string | null} [attributes.escrowStatus] - Phase 2 escrow state.
   * @param {string | null} [attributes.gatewayTxnId] - Phase 2 gateway reference.
   * @param {string | null} [attributes.collectedByUserId] - Rider who took the cash.
   * @param {Date | string | null} [attributes.collectedAt] - When cash changed hands.
   */
  constructor({
    id,
    createdAt,
    updatedAt,
    orderId,
    method = PAYMENT_METHOD.COD,
    amount,
    escrowStatus = null,
    gatewayTxnId = null,
    collectedByUserId = null,
    collectedAt = null,
  }) {
    super({ id, createdAt, updatedAt });
    this.#orderId = orderId;
    this.#method = method;
    this.#amount = amount;
    this.#escrowStatus = escrowStatus;
    this.#gatewayTxnId = gatewayTxnId;
    this.#collectedByUserId = collectedByUserId;
    this.#collectedAt = collectedAt ? new Date(collectedAt) : null;
  }

  /**
   * Order being paid for.
   *
   * @returns {string} Order id.
   */
  get orderId() {
    return this.#orderId;
  }

  /**
   * Payment method.
   *
   * @returns {string} Method.
   */
  get method() {
    return this.#method;
  }

  /**
   * Amount owed.
   *
   * @returns {Money} Amount.
   */
  get amount() {
    return this.#amount;
  }

  /**
   * Whether the money has been collected.
   *
   * @returns {boolean} `true` once settled.
   */
  get isCollected() {
    return this.#collectedAt !== null;
  }

  /**
   * Records that the rider took the cash at the door (FR-F1).
   *
   * @param {string} riderUserId - Rider who collected.
   * @returns {void}
   * @throws {ValidationError} When the payment was already collected.
   */
  markCollected(riderUserId) {
    if (this.isCollected) {
      throw new ValidationError('This payment has already been collected.');
    }
    this.#collectedByUserId = riderUserId;
    this.#collectedAt = new Date();
    this.#escrowStatus = ESCROW_STATUS.RELEASED;
    this.touch();
  }

  /**
   * Checks own invariants.
   *
   * @returns {void} Returns nothing when the entity is consistent.
   * @throws {ValidationError} When the order or amount is missing.
   */
  validate() {
    if (!this.#orderId) {
      throw new ValidationError('A payment must belong to an order.');
    }
    if (!(this.#amount instanceof Money)) {
      throw new ValidationError('A payment must record an amount.');
    }
  }

  /**
   * Row shape for the `payments` table.
   *
   * @returns {import('@hungry-ju/shared/types').PersistenceRow} Row for the repository.
   */
  toPersistence() {
    return {
      ...this.baseRow(),
      order_id: this.#orderId,
      method: this.#method,
      amount_poisha: this.#amount.poisha,
      escrow_status: this.#escrowStatus,
      gateway_txn_id: this.#gatewayTxnId,
      collected_by_user_id: this.#collectedByUserId,
      collected_at: this.#collectedAt ? this.#collectedAt.toISOString() : null,
    };
  }

  /**
   * Client-safe projection.
   *
   * @returns {Record<string, unknown>} Serialisable payment.
   */
  toJSON() {
    return {
      id: this.id,
      orderId: this.#orderId,
      method: this.#method,
      amount: this.#amount.taka,
      isCollected: this.isCollected,
      collectedAt: this.#collectedAt ? this.#collectedAt.toISOString() : null,
    };
  }

  /**
   * Rebuilds a payment from a stored row.
   *
   * @param {import('@hungry-ju/shared/types').PersistenceRow} row - Row from storage.
   * @returns {Payment} Hydrated payment.
   */
  static fromPersistence(row) {
    return new Payment({
      id: row.id,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      orderId: row.order_id,
      method: row.method,
      amount: Money.fromPoisha(row.amount_poisha),
      escrowStatus: row.escrow_status,
      gatewayTxnId: row.gateway_txn_id,
      collectedByUserId: row.collected_by_user_id,
      collectedAt: row.collected_at,
    });
  }
}
