/**
 * @file Cash-on-delivery ledger.
 *
 * @module services/payment-service
 */

import { AUDIT_ACTION, AUDIT_ENTITY, PAYMENT_METHOD } from '@hungry-ju/shared/enums';
import { BaseService } from '../core/base-service.js';
import { Payment } from '../models/payment.js';

/**
 * FR-F1, the COD-Direct model of SRS section 12.1.
 *
 * The platform moves no money in the MVP: the rider collects the full total at the door
 * and settles the food price with the vendor on their next trip to Bot Tola. This
 * service therefore records rather than transfers — but recording it is what turns "the
 * rider says he paid" into something an admin can check (risk R2).
 *
 * @augments BaseService
 */
export class PaymentService extends BaseService {
  /** @type {import('../repositories/payment-repository.js').PaymentRepository} */
  #paymentRepository;

  /** @type {import('./audit-service.js').AuditService} */
  #auditService;

  /**
   * @param {object} dependencies - Injected collaborators.
   * @param {import('../repositories/payment-repository.js').PaymentRepository} dependencies.paymentRepository -
   *   Payment storage.
   * @param {import('./audit-service.js').AuditService} dependencies.auditService - Audit trail.
   */
  constructor({ paymentRepository, auditService }) {
    super();
    this.#paymentRepository = paymentRepository;
    this.#auditService = auditService;
  }

  /**
   * Opens the ledger entry when an order is placed.
   *
   * @param {import('../models/order.js').Order} order - Order just placed.
   * @returns {Promise<Payment>} The uncollected payment record.
   */
  async createForOrder(order) {
    return this.#paymentRepository.create(
      new Payment({ orderId: order.id, method: PAYMENT_METHOD.COD, amount: order.total })
    );
  }

  /**
   * Records that the rider collected the cash on completion.
   *
   * @param {string} orderId - Order that was delivered.
   * @param {string} riderUserId - Rider who took the money.
   * @returns {Promise<Payment | null>} The settled record, or `null` when none exists.
   */
  async markCollected(orderId, riderUserId) {
    const payment = await this.#paymentRepository.findByOrder(orderId);
    if (!payment || payment.isCollected) {
      return payment;
    }
    payment.markCollected(riderUserId);
    const saved = await this.#paymentRepository.save(payment);

    await this.#auditService.record({
      actorUserId: riderUserId,
      entityType: AUDIT_ENTITY.PAYMENT,
      entityId: saved.id,
      action: AUDIT_ACTION.UPDATE,
      newValue: { collected: true, amount: saved.amount.taka },
    });
    return saved;
  }

  /**
   * The payment record of an order.
   *
   * @param {string} orderId - Order to look up.
   * @returns {Promise<Payment | null>} Payment, or `null`.
   */
  async forOrder(orderId) {
    return this.#paymentRepository.findByOrder(orderId);
  }
}
