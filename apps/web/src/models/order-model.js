/**
 * @file The order and its delivery, as the client sees them.
 *
 * @module models/order-model
 */

import { DELIVERY_STATUS, ORDER_STATUS } from '@hungry-ju/shared/enums';
import { BaseViewModel } from './base-view-model.js';
import { ShopModel } from './shop-model.js';

/**
 * Human wording for each order status, and the stage it occupies in the tracker.
 *
 * Keeping the two together means the tracking view and the history row cannot describe
 * the same status differently.
 *
 * @type {Readonly<Record<string, { label: string, stage: number, tone: string }>>}
 */
const ORDER_PRESENTATION = Object.freeze({
  [ORDER_STATUS.PLACED]: { label: 'Waiting for the vendor', stage: 1, tone: 'pending' },
  [ORDER_STATUS.ACCEPTED]: { label: 'Accepted', stage: 2, tone: 'progress' },
  [ORDER_STATUS.PREPARING]: { label: 'Being prepared', stage: 3, tone: 'progress' },
  [ORDER_STATUS.READY]: { label: 'Ready for pickup', stage: 4, tone: 'progress' },
  [ORDER_STATUS.PICKED_UP]: { label: 'On the way', stage: 5, tone: 'progress' },
  [ORDER_STATUS.DELIVERED]: { label: 'Delivered', stage: 6, tone: 'success' },
  [ORDER_STATUS.CANCELLED]: { label: 'Cancelled', stage: 0, tone: 'failure' },
  [ORDER_STATUS.REJECTED]: { label: 'Rejected by vendor', stage: 0, tone: 'failure' },
});

/** The stages a tracker draws, in order (FR-E1). */
export const ORDER_STAGES = Object.freeze([
  { status: ORDER_STATUS.PLACED, label: 'Placed' },
  { status: ORDER_STATUS.ACCEPTED, label: 'Accepted' },
  { status: ORDER_STATUS.PREPARING, label: 'Preparing' },
  { status: ORDER_STATUS.READY, label: 'Ready' },
  { status: ORDER_STATUS.PICKED_UP, label: 'On the way' },
  { status: ORDER_STATUS.DELIVERED, label: 'Delivered' },
]);

/**
 * One line of a placed order.
 *
 * @augments BaseViewModel
 */
export class OrderLineModel extends BaseViewModel {
  /**
   * Item name as it was when ordered.
   *
   * @returns {string} Name.
   */
  get itemName() {
    return /** @type {string} */ (this.raw.itemName ?? '');
  }

  /**
   * Price per unit as it was when ordered.
   *
   * @returns {number} Unit price in taka.
   */
  get unitPrice() {
    return Number(this.raw.unitPrice ?? 0);
  }

  /**
   * Units ordered.
   *
   * @returns {number} Quantity.
   */
  get quantity() {
    return Number(this.raw.quantity ?? 0);
  }

  /**
   * Price for this line.
   *
   * @returns {number} Line total in taka.
   */
  get lineTotal() {
    return Number(this.raw.lineTotal ?? 0);
  }
}

/**
 * The delivery half of an order.
 *
 * @augments BaseViewModel
 */
export class DeliveryModel extends BaseViewModel {
  /**
   * Current stage.
   *
   * @returns {string} Delivery status.
   */
  get status() {
    return /** @type {string} */ (this.raw.status);
  }

  /**
   * Assigned delivery partner.
   *
   * @returns {string | null} Rider user id, or `null` while unassigned.
   */
  get riderUserId() {
    return /** @type {string | null} */ (this.raw.riderUserId ?? null);
  }

  /**
   * What the rider keeps for this job.
   *
   * @returns {number} Earning in taka.
   */
  get earning() {
    return Number(this.raw.earning ?? 0);
  }

  /**
   * The order this delivery carries, when the payload included it.
   *
   * @returns {OrderModel | null} Order, or `null`.
   */
  get order() {
    return OrderModel.maybeFrom(this.raw.order);
  }

  /**
   * Where to collect the food.
   *
   * @returns {Record<string, unknown> | null} Shop name, location, and phone.
   */
  get pickup() {
    return /** @type {Record<string, unknown> | null} */ (this.raw.pickup ?? null);
  }

  /**
   * Where to take it.
   *
   * @returns {Record<string, unknown> | null} Hall, room, and note.
   */
  get dropOff() {
    return /** @type {Record<string, unknown> | null} */ (this.raw.dropOff ?? null);
  }

  /**
   * Who is waiting for it.
   *
   * @returns {Record<string, unknown> | null} Customer name and phone.
   */
  get customer() {
    return /** @type {Record<string, unknown> | null} */ (this.raw.customer ?? null);
  }

  /**
   * Whether this job still occupies the rider (FR-D4).
   *
   * @returns {boolean} `true` while active.
   */
  get isActive() {
    return Boolean(this.raw.isActive);
  }

  /**
   * The one action the rider can take next, which is what the active-delivery panel
   * turns into its primary button.
   *
   * Returning a single next step rather than a menu of transitions keeps the rider
   * screen usable one-handed, on a phone, while walking.
   *
   * @returns {{ status: string, label: string } | null} Next step, or `null` when the
   *   next step is the customer's PIN.
   */
  get nextStep() {
    if (this.status === DELIVERY_STATUS.ASSIGNED) {
      return { status: DELIVERY_STATUS.HEADING_TO_VENDOR, label: 'Heading to the shop' };
    }
    if (this.status === DELIVERY_STATUS.HEADING_TO_VENDOR) {
      return { status: DELIVERY_STATUS.PICKED_UP, label: 'I have picked it up' };
    }
    return null;
  }

  /**
   * Whether the rider is now waiting on the customer's PIN (FR-D6).
   *
   * @returns {boolean} `true` once the food has been collected.
   */
  get awaitsConfirmation() {
    return this.status === DELIVERY_STATUS.PICKED_UP;
  }

  /**
   * Whether the rider may still hand this job back (FR-D8).
   *
   * @returns {boolean} `true` before pickup.
   */
  get isReleasable() {
    return [DELIVERY_STATUS.ASSIGNED, DELIVERY_STATUS.HEADING_TO_VENDOR].includes(this.status);
  }
}

/**
 * A placed order.
 *
 * @augments BaseViewModel
 */
export class OrderModel extends BaseViewModel {
  /**
   * Short human-quotable reference.
   *
   * @returns {string} Order reference.
   */
  get reference() {
    return /** @type {string} */ (this.raw.reference ?? '');
  }

  /**
   * Current status.
   *
   * @returns {string} Order status.
   */
  get status() {
    return /** @type {string} */ (this.raw.status);
  }

  /**
   * Human wording for the current status.
   *
   * @returns {string} Label.
   */
  get statusLabel() {
    return ORDER_PRESENTATION[this.status]?.label ?? this.status;
  }

  /**
   * Whether the status reads as good, in progress, or bad, for styling.
   *
   * @returns {string} One of `pending`, `progress`, `success`, `failure`.
   */
  get statusTone() {
    return ORDER_PRESENTATION[this.status]?.tone ?? 'pending';
  }

  /**
   * How far along the tracker this order is (FR-E1).
   *
   * @returns {number} Stage number; `0` for a cancelled or rejected order.
   */
  get stage() {
    return ORDER_PRESENTATION[this.status]?.stage ?? 0;
  }

  /**
   * The lines.
   *
   * @returns {OrderLineModel[]} Order lines.
   */
  get items() {
    return OrderLineModel.listFrom(/** @type {unknown[]} */ (this.raw.items));
  }

  /**
   * Total units ordered.
   *
   * @returns {number} Unit count.
   */
  get itemCount() {
    return Number(this.raw.itemCount ?? 0);
  }

  /**
   * Sum of the lines.
   *
   * @returns {number} Subtotal in taka.
   */
  get subtotal() {
    return Number(this.raw.subtotal ?? 0);
  }

  /**
   * Delivery fee charged.
   *
   * @returns {number} Fee in taka.
   */
  get deliveryFee() {
    return Number(this.raw.deliveryFee ?? 0);
  }

  /**
   * What the customer pays in cash.
   *
   * @returns {number} Total in taka.
   */
  get total() {
    return Number(this.raw.total ?? 0);
  }

  /**
   * Where it goes.
   *
   * @returns {string} Hall and room.
   */
  get destination() {
    return `${this.raw.deliveryHall ?? ''}, room ${this.raw.deliveryRoom ?? ''}`;
  }

  /**
   * Free-text note for the vendor and rider.
   *
   * @returns {string} Note; empty when none.
   */
  get note() {
    return /** @type {string} */ (this.raw.note ?? '');
  }

  /**
   * Why it was cancelled or rejected.
   *
   * @returns {string} Reason; empty when none.
   */
  get cancellationReason() {
    return /** @type {string} */ (this.raw.cancellationReason ?? '');
  }

  /**
   * Whether the student may still cancel (BR-04).
   *
   * @returns {boolean} `true` while cancellation is allowed.
   */
  get isCancellable() {
    return Boolean(this.raw.isCancellable);
  }

  /**
   * Whether the order has finished, one way or another.
   *
   * @returns {boolean} `true` for delivered, cancelled, and rejected.
   */
  get isFinal() {
    return Boolean(this.raw.isFinal);
  }

  /**
   * Whether it arrived.
   *
   * @returns {boolean} `true` when delivered.
   */
  get isDelivered() {
    return this.status === ORDER_STATUS.DELIVERED;
  }

  /**
   * Whether the vendor still has to answer (FR-B4).
   *
   * @returns {boolean} `true` while awaiting a decision.
   */
  get awaitsVendor() {
    return this.status === ORDER_STATUS.PLACED;
  }

  /**
   * When the order was placed.
   *
   * @returns {Date | null} Timestamp.
   */
  get placedAt() {
    return this.raw.placedAt ? new Date(/** @type {string} */ (this.raw.placedAt)) : null;
  }

  /**
   * Seconds left for the vendor to answer (BR-11), so the board can show a countdown.
   *
   * @returns {number} Seconds remaining; `0` once the deadline has passed.
   */
  get secondsUntilAcceptDeadline() {
    if (!this.raw.acceptDeadline || !this.awaitsVendor) {
      return 0;
    }
    const remaining =
      new Date(/** @type {string} */ (this.raw.acceptDeadline)).getTime() - Date.now();
    return Math.max(0, Math.round(remaining / 1000));
  }

  /**
   * The next status a vendor can move this order to (FR-B5).
   *
   * @returns {{ status: string, label: string } | null} Next step, or `null` when the
   *   vendor's part is done.
   */
  get vendorNextStep() {
    if (this.status === ORDER_STATUS.ACCEPTED) {
      return { status: ORDER_STATUS.PREPARING, label: 'Start preparing' };
    }
    if (this.status === ORDER_STATUS.PREPARING) {
      return { status: ORDER_STATUS.READY, label: 'Mark ready for pickup' };
    }
    return null;
  }

  /**
   * The shop fulfilling it, when the payload included one.
   *
   * @returns {ShopModel | null} Shop, or `null`.
   */
  get shop() {
    return ShopModel.maybeFrom(this.raw.shop);
  }

  /**
   * The delivery, when the payload included one.
   *
   * @returns {DeliveryModel | null} Delivery, or `null`.
   */
  get delivery() {
    return DeliveryModel.maybeFrom(this.raw.delivery);
  }

  /**
   * Whether an admin has flagged this order as stuck (FR-G3).
   *
   * @returns {boolean} `true` when overdue.
   */
  get isStuck() {
    return Boolean(this.raw.isStuck);
  }

  /**
   * The milestones reached so far, for the tracking view.
   *
   * @returns {Array<{ status: string, label: string, reached: boolean, at: string | null }>}
   *   Stages with their timestamps.
   */
  timeline() {
    const timestamps = new Map(
      /** @type {Array<{ status: string, at: string | null }>} */ (this.raw.timeline ?? []).map(
        (entry) => [entry.status, entry.at]
      )
    );
    return ORDER_STAGES.map((stage, index) => ({
      status: stage.status,
      label: stage.label,
      reached: this.stage > index,
      at: timestamps.get(stage.status) ?? null,
    }));
  }
}
