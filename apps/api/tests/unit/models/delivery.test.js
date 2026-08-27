/**
 * @file Unit tests for the delivery entity and its state machine.
 *
 * @module tests/unit/models/delivery
 */

import { describe, expect, it } from '@jest/globals';
import { DELIVERY_STATUS } from '@hungry-ju/shared/enums';
import { Delivery } from '../../../src/models/delivery.js';
import { DeliveryStateMachine } from '../../../src/models/delivery-state-machine.js';
import { Money } from '../../../src/utils/money.js';
import {
  ConflictError,
  ForbiddenError,
  ValidationError,
} from '../../../src/core/errors/app-error.js';

/**
 * Builds a delivery in its initial state.
 *
 * @param {object} [overrides] - Attributes to change.
 * @returns {Delivery} The delivery.
 */
function makeDelivery(overrides = {}) {
  return new Delivery({
    orderId: 'order-1',
    studentId: 'student-1',
    earning: Money.fromTaka(25),
    confirmPinHash: 'hashed-pin',
    ...overrides,
  });
}

/**
 * Builds a delivery already published to the feed.
 *
 * @returns {Delivery} The delivery.
 */
function makeAvailable() {
  const delivery = makeDelivery();
  delivery.publish();
  return delivery;
}

describe('DeliveryStateMachine', () => {
  const machine = DeliveryStateMachine.shared;

  it.each([
    [DELIVERY_STATUS.PENDING, DELIVERY_STATUS.AVAILABLE, true],
    [DELIVERY_STATUS.AVAILABLE, DELIVERY_STATUS.ASSIGNED, true],
    [DELIVERY_STATUS.ASSIGNED, DELIVERY_STATUS.HEADING_TO_VENDOR, true],
    [DELIVERY_STATUS.ASSIGNED, DELIVERY_STATUS.RELEASED, true],
    [DELIVERY_STATUS.HEADING_TO_VENDOR, DELIVERY_STATUS.PICKED_UP, true],
    [DELIVERY_STATUS.PICKED_UP, DELIVERY_STATUS.DELIVERED, true],
    [DELIVERY_STATUS.PICKED_UP, DELIVERY_STATUS.RELEASED, false],
    [DELIVERY_STATUS.DELIVERED, DELIVERY_STATUS.RELEASED, false],
  ])('%s -> %s is %s', (from, to, allowed) => {
    expect(machine.canTransition(from, to)).toBe(allowed);
  });

  it('counts an assignment as occupying its rider until it is done (FR-D4)', () => {
    expect(machine.isActive(DELIVERY_STATUS.ASSIGNED)).toBe(true);
    expect(machine.isActive(DELIVERY_STATUS.PICKED_UP)).toBe(true);
    expect(machine.isActive(DELIVERY_STATUS.AVAILABLE)).toBe(false);
    expect(machine.isActive(DELIVERY_STATUS.DELIVERED)).toBe(false);
  });
});

describe('Delivery', () => {
  it('exists from placement but stays out of the feed until the food is ready', () => {
    const delivery = makeDelivery();
    expect(delivery.status).toBe(DELIVERY_STATUS.PENDING);
    expect(delivery.isClaimable).toBe(false);

    delivery.publish();
    expect(delivery.isClaimable).toBe(true);
  });

  describe('claiming', () => {
    it('binds the delivery to its rider', () => {
      const delivery = makeAvailable();
      delivery.assignTo('rider-1');

      expect(delivery.riderUserId).toBe('rider-1');
      expect(delivery.status).toBe(DELIVERY_STATUS.ASSIGNED);
      expect(delivery.acceptedAt).toBeInstanceOf(Date);
      expect(delivery.isActive).toBe(true);
    });

    it('refuses the customer their own order (BR-06)', () => {
      const delivery = makeAvailable();
      expect(() => delivery.assignTo('student-1')).toThrow(ForbiddenError);
    });

    it('refuses a delivery somebody else already holds', () => {
      const delivery = makeAvailable();
      delivery.assignTo('rider-1');
      expect(() => delivery.assignTo('rider-2')).toThrow(ConflictError);
    });

    it('refuses a delivery that has not been published yet', () => {
      expect(() => makeDelivery().assignTo('rider-1')).toThrow(ConflictError);
    });
  });

  describe('progress', () => {
    it('runs the happy path to completion', () => {
      const delivery = makeAvailable();
      delivery.assignTo('rider-1');
      delivery.startHeadingToVendor();
      delivery.markPickedUp();
      delivery.complete(true);

      expect(delivery.status).toBe(DELIVERY_STATUS.DELIVERED);
      expect(delivery.deliveredAt).toBeInstanceOf(Date);
      expect(delivery.isActive).toBe(false);
    });

    it('refuses to skip to pickup', () => {
      const delivery = makeAvailable();
      delivery.assignTo('rider-1');
      expect(() => delivery.markPickedUp()).toThrow(ConflictError);
    });
  });

  describe('BR-10: only the customer closes a delivery', () => {
    it('refuses to complete when the PIN did not match', () => {
      const delivery = makeAvailable();
      delivery.assignTo('rider-1');
      delivery.startHeadingToVendor();
      delivery.markPickedUp();

      expect(() => delivery.complete(false)).toThrow(ForbiddenError);
      expect(delivery.status).toBe(DELIVERY_STATUS.PICKED_UP);
    });

    it('refuses to complete before the food has been collected', () => {
      const delivery = makeAvailable();
      delivery.assignTo('rider-1');
      expect(() => delivery.complete(true)).toThrow(ConflictError);
    });
  });

  describe('FR-D8: releasing', () => {
    it('clears the rider and counts the release', () => {
      const delivery = makeAvailable();
      delivery.assignTo('rider-1');
      delivery.release();

      expect(delivery.riderUserId).toBeNull();
      expect(delivery.status).toBe(DELIVERY_STATUS.RELEASED);
      expect(delivery.toJSON().releaseCount).toBe(1);
    });

    it('refuses once the food is in the rider’s hands', () => {
      const delivery = makeAvailable();
      delivery.assignTo('rider-1');
      delivery.startHeadingToVendor();
      delivery.markPickedUp();

      expect(() => delivery.release()).toThrow(ConflictError);
    });

    it('can be reopened for another partner, keeping its release history', () => {
      const delivery = makeAvailable();
      delivery.assignTo('rider-1');
      delivery.release();
      delivery.reopen();

      expect(delivery.isClaimable).toBe(true);
      expect(delivery.toJSON().releaseCount).toBe(1);
    });
  });

  it('never serialises the PIN hash', () => {
    expect(makeDelivery().toJSON()).not.toHaveProperty('confirmPinHash');
  });

  it('requires an order, a PIN, and an earning', () => {
    expect(() => makeDelivery({ orderId: null }).validate()).toThrow(ValidationError);
    expect(() => makeDelivery({ confirmPinHash: '' }).validate()).toThrow(ValidationError);
    expect(() => makeDelivery({ earning: 25 }).validate()).toThrow(ValidationError);
  });

  it('round-trips through persistence', () => {
    const delivery = makeAvailable();
    delivery.assignTo('rider-1');

    const restored = Delivery.fromPersistence(delivery.toPersistence());
    expect(restored.riderUserId).toBe('rider-1');
    expect(restored.status).toBe(DELIVERY_STATUS.ASSIGNED);
    expect(restored.earning.taka).toBe(25);
    expect(restored.confirmPinHash).toBe('hashed-pin');
  });
});
