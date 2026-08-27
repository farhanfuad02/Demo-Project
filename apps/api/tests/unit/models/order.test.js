/**
 * @file Unit tests for the order aggregate and its state machine.
 *
 * @module tests/unit/models/order
 */

import { describe, expect, it } from '@jest/globals';
import { ORDER_STATUS } from '@hungry-ju/shared/enums';
import { Cart } from '../../../src/models/cart.js';
import { MenuItem } from '../../../src/models/menu-item.js';
import { Order } from '../../../src/models/order.js';
import { OrderItem } from '../../../src/models/order-item.js';
import { OrderStateMachine } from '../../../src/models/order-state-machine.js';
import { Money } from '../../../src/utils/money.js';
import { ConflictError, ValidationError } from '../../../src/core/errors/app-error.js';

/**
 * Builds a cart holding one item.
 *
 * @param {number} [price] - Unit price in taka.
 * @param {number} [quantity] - Units.
 * @returns {Cart} The cart.
 */
function makeCart(price = 60, quantity = 2) {
  const cart = new Cart({ id: 'cart-1', studentId: 'student-1' });
  cart.addItem(
    new MenuItem({
      id: 'item-1',
      shopId: 'shop-1',
      name: 'Khichuri',
      price: Money.fromTaka(price),
    }),
    quantity
  );
  return cart;
}

/**
 * Builds an order from a cart.
 *
 * @param {object} [options] - Overrides.
 * @param {number} [options.price] - Unit price in taka.
 * @param {number} [options.quantity] - Units ordered.
 * @param {number} [options.fee] - Delivery fee in taka.
 * @returns {Order} The order.
 */
function makeOrder({ price = 60, quantity = 2, fee = 25 } = {}) {
  return Order.fromCart({
    cart: makeCart(price, quantity),
    reference: 'HJU-TEST',
    deliveryFee: Money.fromTaka(fee),
    deliveryHall: 'Pritilata Hall',
    deliveryRoom: '302',
  });
}

describe('OrderStateMachine', () => {
  const machine = OrderStateMachine.shared;

  it('is shared, because the table holds no per-order state', () => {
    expect(OrderStateMachine.shared).toBe(machine);
  });

  it.each([
    [ORDER_STATUS.PLACED, ORDER_STATUS.ACCEPTED, true],
    [ORDER_STATUS.PLACED, ORDER_STATUS.REJECTED, true],
    [ORDER_STATUS.PLACED, ORDER_STATUS.CANCELLED, true],
    [ORDER_STATUS.PLACED, ORDER_STATUS.PREPARING, false],
    [ORDER_STATUS.ACCEPTED, ORDER_STATUS.PREPARING, true],
    [ORDER_STATUS.ACCEPTED, ORDER_STATUS.CANCELLED, true],
    [ORDER_STATUS.ACCEPTED, ORDER_STATUS.REJECTED, false],
    [ORDER_STATUS.PREPARING, ORDER_STATUS.READY, true],
    [ORDER_STATUS.PREPARING, ORDER_STATUS.CANCELLED, false],
    [ORDER_STATUS.READY, ORDER_STATUS.PICKED_UP, true],
    [ORDER_STATUS.PICKED_UP, ORDER_STATUS.DELIVERED, true],
    [ORDER_STATUS.DELIVERED, ORDER_STATUS.CANCELLED, false],
  ])('%s -> %s is %s', (from, to, allowed) => {
    expect(machine.canTransition(from, to)).toBe(allowed);
  });

  it('marks the three end states as terminal', () => {
    expect(machine.isFinal(ORDER_STATUS.DELIVERED)).toBe(true);
    expect(machine.isFinal(ORDER_STATUS.CANCELLED)).toBe(true);
    expect(machine.isFinal(ORDER_STATUS.REJECTED)).toBe(true);
    expect(machine.isFinal(ORDER_STATUS.READY)).toBe(false);
  });

  it('allows cancellation only in the BR-04 window', () => {
    expect(machine.isCancellable(ORDER_STATUS.PLACED)).toBe(true);
    expect(machine.isCancellable(ORDER_STATUS.ACCEPTED)).toBe(true);
    expect(machine.isCancellable(ORDER_STATUS.PREPARING)).toBe(false);
  });
});

describe('Order', () => {
  it('freezes the totals at placement', () => {
    const order = makeOrder({ price: 60, quantity: 2, fee: 25 });
    expect(order.subtotal.taka).toBe(120);
    expect(order.deliveryFee.taka).toBe(25);
    expect(order.total.taka).toBe(145);
  });

  it('copies the item name and price rather than pointing at the menu', () => {
    const order = makeOrder();
    expect(order.items[0].itemName).toBe('Khichuri');
    expect(order.items[0].unitPrice.taka).toBe(60);
  });

  it('refuses to be built from an empty cart', () => {
    expect(() =>
      Order.fromCart({
        cart: new Cart({ studentId: 'u1' }),
        reference: 'HJU-X',
        deliveryFee: Money.fromTaka(25),
        deliveryHall: 'Hall',
        deliveryRoom: '1',
      })
    ).toThrow(ValidationError);
  });

  it('does not empty the cart it was built from — that is the service’s job', () => {
    const cart = makeCart();
    Order.fromCart({
      cart,
      reference: 'HJU-X',
      deliveryFee: Money.fromTaka(25),
      deliveryHall: 'Hall',
      deliveryRoom: '1',
    });
    expect(cart.isEmpty).toBe(false);
  });

  describe('lifecycle', () => {
    it('runs the happy path end to end', () => {
      const order = makeOrder();
      order.accept();
      order.startPreparing();
      order.markReady();
      order.markPickedUp();
      order.markDelivered();

      expect(order.status).toBe(ORDER_STATUS.DELIVERED);
      expect(order.isFinal).toBe(true);
    });

    it('refuses to skip a step', () => {
      const order = makeOrder();
      expect(() => order.markReady()).toThrow(ConflictError);
    });

    it('refuses to accept an order twice', () => {
      const order = makeOrder();
      order.accept();
      expect(() => order.accept()).toThrow(ConflictError);
    });

    it('demands a reason to reject', () => {
      expect(() => makeOrder().reject('')).toThrow(ValidationError);
    });

    it('records the rejection reason', () => {
      const order = makeOrder();
      order.reject('Out of beef today');
      expect(order.status).toBe(ORDER_STATUS.REJECTED);
      expect(order.toJSON().cancellationReason).toBe('Out of beef today');
    });
  });

  describe('BR-04: the cancellation window', () => {
    it('is open while placed', () => {
      const order = makeOrder();
      expect(order.isCancellable).toBe(true);
      order.cancel();
      expect(order.status).toBe(ORDER_STATUS.CANCELLED);
    });

    it('is open while accepted', () => {
      const order = makeOrder();
      order.accept();
      expect(order.isCancellable).toBe(true);
    });

    it('closes the moment preparation starts', () => {
      const order = makeOrder();
      order.accept();
      order.startPreparing();

      expect(order.isCancellable).toBe(false);
      expect(() => order.cancel()).toThrow(ConflictError);
    });
  });

  describe('admin override (FR-G3)', () => {
    it('cancels an order that is past the customer window', () => {
      const order = makeOrder();
      order.accept();
      order.startPreparing();
      order.markReady();

      order.forceCancel('Nobody collected it for an hour.');
      expect(order.status).toBe(ORDER_STATUS.CANCELLED);
    });

    it('still refuses an order that has already finished', () => {
      const order = makeOrder();
      order.accept();
      order.startPreparing();
      order.markReady();
      order.markPickedUp();
      order.markDelivered();

      expect(() => order.forceCancel('too late')).toThrow(ConflictError);
    });
  });

  describe('BR-11: the vendor accept deadline', () => {
    it('sets a deadline in the future when the order is placed', () => {
      const order = makeOrder();
      expect(order.acceptDeadline.getTime()).toBeGreaterThan(Date.now());
      expect(order.hasAcceptanceExpired).toBe(false);
    });

    it('reports expiry once the deadline passes with no answer', () => {
      const order = makeOrder();
      const expired = Order.fromPersistence({
        ...order.toPersistence(),
        accept_deadline: new Date(Date.now() - 1000).toISOString(),
      });
      expect(expired.hasAcceptanceExpired).toBe(true);
    });

    it('stops reporting expiry once the vendor has answered', () => {
      const order = makeOrder();
      order.accept();
      const restored = Order.fromPersistence({
        ...order.toPersistence(),
        accept_deadline: new Date(Date.now() - 1000).toISOString(),
      });
      expect(restored.hasAcceptanceExpired).toBe(false);
    });
  });

  it('refuses to persist totals that do not add up', () => {
    const order = makeOrder();
    const tampered = Order.fromPersistence({
      ...order.toPersistence(),
      total_poisha: 99999,
    });
    expect(() => tampered.validate()).toThrow(ValidationError);
  });

  it('requires a delivery destination (FR-C6)', () => {
    const order = makeOrder();
    const noAddress = Order.fromPersistence({ ...order.toPersistence(), delivery_hall: '' });
    noAddress.setItems(order.items);
    expect(() => noAddress.validate()).toThrow(ValidationError);
  });

  it('exposes a timeline for the tracking view', () => {
    const order = makeOrder();
    order.accept();
    const timeline = order.timeline();

    expect(timeline[0].status).toBe(ORDER_STATUS.PLACED);
    expect(timeline[0].at).toBeTruthy();
    expect(timeline.at(-1).at).toBeNull();
  });

  it('round-trips through persistence', () => {
    const order = makeOrder();
    order.accept();
    const restored = Order.fromPersistence(order.toPersistence());
    restored.setItems(order.items);

    expect(restored.status).toBe(ORDER_STATUS.ACCEPTED);
    expect(restored.total.taka).toBe(145);
    expect(restored.reference).toBe('HJU-TEST');
  });
});

describe('OrderItem', () => {
  it('is built from a cart line as a snapshot', () => {
    const cart = makeCart(60, 3);
    const line = OrderItem.fromCartItem(cart.items[0]);

    expect(line.itemName).toBe('Khichuri');
    expect(line.quantity).toBe(3);
    expect(line.lineTotal.taka).toBe(180);
  });

  it('rejects a line with no quantity', () => {
    const line = new OrderItem({
      menuItemId: 'i1',
      itemNameSnapshot: 'X',
      unitPriceSnapshot: Money.fromTaka(10),
      quantity: 0,
    });
    expect(() => line.validate()).toThrow(ValidationError);
  });

  it('rejects a line missing its snapshot', () => {
    const line = new OrderItem({
      menuItemId: 'i1',
      itemNameSnapshot: '',
      unitPriceSnapshot: Money.fromTaka(10),
      quantity: 1,
    });
    expect(() => line.validate()).toThrow(ValidationError);
  });

  it('stores the line total so history cannot be recomputed later', () => {
    const line = OrderItem.fromCartItem(makeCart(60, 2).items[0]);
    expect(line.toPersistence().line_total_poisha).toBe(12000);
  });
});
