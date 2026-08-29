/**
 * @file Unit tests for the client-side read models.
 *
 * @module tests/unit/models
 */

import { describe, expect, it } from '@jest/globals';
import { DELIVERY_STATUS, ORDER_STATUS, USER_ROLE } from '@hungry-ju/shared/enums';
import { BaseViewModel } from '../../src/models/base-view-model.js';
import { CartModel } from '../../src/models/cart-model.js';
import { NotificationModel } from '../../src/models/notification-model.js';
import { DeliveryModel, OrderModel } from '../../src/models/order-model.js';
import { SessionModel } from '../../src/models/session-model.js';
import { MenuItemModel, ShopModel } from '../../src/models/shop-model.js';

describe('BaseViewModel', () => {
  it('is abstract', () => {
    expect(() => new BaseViewModel({})).toThrow(TypeError);
  });

  it('tolerates a missing payload rather than crashing a render', () => {
    expect(new SessionModel(undefined).fullName).toBe('');
  });

  it('builds a list, and an empty one from nothing', () => {
    expect(ShopModel.listFrom([{ id: 'a' }, { id: 'b' }])).toHaveLength(2);
    expect(ShopModel.listFrom(undefined)).toEqual([]);
  });

  it('turns a null payload into null, which is what "no active delivery" looks like', () => {
    expect(DeliveryModel.maybeFrom(null)).toBeNull();
    expect(DeliveryModel.maybeFrom({ id: 'd1' })).toBeInstanceOf(DeliveryModel);
  });
});

describe('SessionModel', () => {
  /**
   * Builds a session.
   *
   * @param {object} [overrides] - Payload fields.
   * @returns {SessionModel} The session.
   */
  const makeSession = (overrides = {}) =>
    new SessionModel({
      id: 'u1',
      fullName: 'Farhan Fuad',
      email: 'farhan@juniv.edu',
      role: USER_ROLE.STUDENT,
      homeRoute: '/shops',
      ...overrides,
    });

  it('answers what it is rather than making the view compare strings', () => {
    expect(makeSession().isStudent).toBe(true);
    expect(makeSession({ role: USER_ROLE.VENDOR }).isVendor).toBe(true);
    expect(makeSession({ role: USER_ROLE.ADMIN }).isAdmin).toBe(true);
  });

  it('shortens the name for a greeting that fits on a phone', () => {
    expect(makeSession().firstName).toBe('Farhan');
  });

  it('knows whether an order can be delivered without asking for an address', () => {
    expect(makeSession().hasDeliveryAddress).toBe(false);
    expect(makeSession({ profile: { hallName: 'PRH', roomNo: '302' } }).hasDeliveryAddress).toBe(
      true
    );
  });

  it('reads the rider fields off the student profile', () => {
    const session = makeSession({
      profile: { isDeliveryEnabled: true, riderRatingAverage: 4.5, reliabilityScore: 95 },
    });

    expect(session.deliverModeOn).toBe(true);
    expect(session.riderRating).toBe(4.5);
    expect(session.reliabilityScore).toBe(95);
  });

  it('defaults reliability to full for an account with no profile yet', () => {
    expect(makeSession().reliabilityScore).toBe(100);
  });
});

describe('ShopModel and MenuItemModel', () => {
  it('says "New" rather than nought stars before the first rating', () => {
    expect(new ShopModel({ ratingCount: 0 }).ratingLabel).toBe('New');
    expect(new ShopModel({ ratingAverage: 4.5, ratingCount: 12 }).ratingLabel).toBe('4.5 (12)');
  });

  it('explains why a shop cannot take an order', () => {
    expect(new ShopModel({ canReceiveOrders: true }).closedReason).toBeNull();
    expect(new ShopModel({ approvalStatus: 'pending' }).closedReason).toContain('not approved');
    expect(new ShopModel({ approvalStatus: 'approved', isOpen: false }).closedReason).toContain(
      'closed'
    );
  });

  it('groups a menu in the order the vendor arranged it', () => {
    const items = MenuItemModel.listFrom([
      { id: '1', name: 'Khichuri', category: 'Rice' },
      { id: '2', name: 'Cold Coffee', category: 'Drinks' },
      { id: '3', name: 'Tehari', category: 'Rice' },
    ]);
    const grouped = MenuItemModel.groupByCategory(items);

    // Not alphabetised: drinks belong below the rice they accompany.
    expect(grouped.map((group) => group.category)).toEqual(['Rice', 'Drinks']);
    expect(grouped[0].items).toHaveLength(2);
  });

  it('carries the shop a search result came from', () => {
    const item = new MenuItemModel({ id: '1', shop: { id: 's1', shopName: 'Akhi Fast Food' } });
    expect(item.shop.shopName).toBe('Akhi Fast Food');
  });
});

describe('CartModel', () => {
  /**
   * Builds a cart payload.
   *
   * @param {object} [overrides] - Payload fields.
   * @returns {CartModel} The cart.
   */
  const makeCart = (overrides = {}) =>
    new CartModel({
      items: [
        {
          id: 'l1',
          menuItemId: 'i1',
          itemName: 'Khichuri',
          unitPrice: 60,
          quantity: 2,
          lineTotal: 120,
        },
      ],
      itemCount: 2,
      subtotal: 120,
      deliveryFee: 25,
      total: 145,
      shop: { id: 'shop-1', shopName: 'Test Shop' },
      ...overrides,
    });

  it('starts empty', () => {
    expect(CartModel.empty().isEmpty).toBe(true);
    expect(CartModel.empty().total).toBe(0);
  });

  it('uses the server’s totals rather than recomputing them', () => {
    // The fee is admin-tunable, so a client-side sum would disagree with the order.
    expect(makeCart().total).toBe(145);
    expect(makeCart().deliveryFee).toBe(25);
  });

  it('reports how many of an item it already holds, so a card can show a stepper', () => {
    expect(makeCart().quantityOf('i1')).toBe(2);
    expect(makeCart().quantityOf('other')).toBe(0);
  });

  it('predicts a BR-03 clash before the request is sent', () => {
    expect(makeCart().wouldConflictWith('shop-2')).toBe(true);
    expect(makeCart().wouldConflictWith('shop-1')).toBe(false);
    expect(CartModel.empty().wouldConflictWith('shop-2')).toBe(false);
  });
});

describe('OrderModel', () => {
  /**
   * Builds an order payload.
   *
   * @param {object} [overrides] - Payload fields.
   * @returns {OrderModel} The order.
   */
  const makeOrder = (overrides = {}) =>
    new OrderModel({
      id: 'o1',
      reference: 'HJU-7K2M',
      status: ORDER_STATUS.PLACED,
      items: [{ id: 'l1', itemName: 'Khichuri', unitPrice: 60, quantity: 2, lineTotal: 120 }],
      itemCount: 2,
      subtotal: 120,
      deliveryFee: 25,
      total: 145,
      deliveryHall: 'PRH',
      deliveryRoom: '302',
      isCancellable: true,
      isFinal: false,
      placedAt: new Date().toISOString(),
      acceptDeadline: new Date(Date.now() + 300_000).toISOString(),
      timeline: [{ status: ORDER_STATUS.PLACED, at: new Date().toISOString() }],
      ...overrides,
    });

  it.each([
    [ORDER_STATUS.PLACED, 'Waiting for the vendor', 'pending'],
    [ORDER_STATUS.PREPARING, 'Being prepared', 'progress'],
    [ORDER_STATUS.DELIVERED, 'Delivered', 'success'],
    [ORDER_STATUS.CANCELLED, 'Cancelled', 'failure'],
  ])('describes %s in words a student understands', (status, label, tone) => {
    const order = makeOrder({ status });
    expect(order.statusLabel).toBe(label);
    expect(order.statusTone).toBe(tone);
  });

  it('places the order on the tracker, and off it when cancelled', () => {
    expect(makeOrder({ status: ORDER_STATUS.READY }).stage).toBe(4);
    expect(makeOrder({ status: ORDER_STATUS.CANCELLED }).stage).toBe(0);
  });

  it('marks the stages already reached', () => {
    const timeline = makeOrder({ status: ORDER_STATUS.PREPARING }).timeline();
    expect(timeline[0].reached).toBe(true);
    expect(timeline[1].reached).toBe(true);
    expect(timeline[3].reached).toBe(false);
  });

  it('counts down the vendor’s deadline (BR-11)', () => {
    expect(makeOrder().secondsUntilAcceptDeadline).toBeGreaterThan(280);
  });

  it('stops counting down once the vendor has answered', () => {
    expect(makeOrder({ status: ORDER_STATUS.ACCEPTED }).secondsUntilAcceptDeadline).toBe(0);
  });

  it('never reports a negative countdown', () => {
    const expired = makeOrder({ acceptDeadline: new Date(Date.now() - 60_000).toISOString() });
    expect(expired.secondsUntilAcceptDeadline).toBe(0);
  });

  it('offers the vendor only the step they control next (FR-B5)', () => {
    expect(makeOrder({ status: ORDER_STATUS.ACCEPTED }).vendorNextStep.status).toBe(
      ORDER_STATUS.PREPARING
    );
    expect(makeOrder({ status: ORDER_STATUS.PREPARING }).vendorNextStep.status).toBe(
      ORDER_STATUS.READY
    );
    expect(makeOrder({ status: ORDER_STATUS.READY }).vendorNextStep).toBeNull();
  });

  it('formats the destination', () => {
    expect(makeOrder().destination).toBe('PRH, room 302');
  });
});

describe('DeliveryModel', () => {
  /**
   * Builds a delivery payload.
   *
   * @param {string} status - Delivery status.
   * @returns {DeliveryModel} The delivery.
   */
  const makeDelivery = (status) => new DeliveryModel({ id: 'd1', status, earning: 25 });

  it('offers a rider one next step at a time', () => {
    expect(makeDelivery(DELIVERY_STATUS.ASSIGNED).nextStep.status).toBe(
      DELIVERY_STATUS.HEADING_TO_VENDOR
    );
    expect(makeDelivery(DELIVERY_STATUS.HEADING_TO_VENDOR).nextStep.status).toBe(
      DELIVERY_STATUS.PICKED_UP
    );
    expect(makeDelivery(DELIVERY_STATUS.PICKED_UP).nextStep).toBeNull();
  });

  it('knows when it is waiting on the customer’s PIN', () => {
    expect(makeDelivery(DELIVERY_STATUS.PICKED_UP).awaitsConfirmation).toBe(true);
    expect(makeDelivery(DELIVERY_STATUS.ASSIGNED).awaitsConfirmation).toBe(false);
  });

  it('allows a release only before pickup (FR-D8)', () => {
    expect(makeDelivery(DELIVERY_STATUS.ASSIGNED).isReleasable).toBe(true);
    expect(makeDelivery(DELIVERY_STATUS.HEADING_TO_VENDOR).isReleasable).toBe(true);
    expect(makeDelivery(DELIVERY_STATUS.PICKED_UP).isReleasable).toBe(false);
  });
});

describe('NotificationModel', () => {
  it('reports age in words', () => {
    expect(
      new NotificationModel({ createdAt: new Date(Date.now() - 30_000).toISOString() }).relativeTime
    ).toBe('just now');
    expect(
      new NotificationModel({ createdAt: new Date(Date.now() - 300_000).toISOString() })
        .relativeTime
    ).toBe('5 min ago');
    expect(
      new NotificationModel({ createdAt: new Date(Date.now() - 7_200_000).toISOString() })
        .relativeTime
    ).toBe('2 h ago');
    expect(
      new NotificationModel({ createdAt: new Date(Date.now() - 172_800_000).toISOString() })
        .relativeTime
    ).toBe('2 d ago');
  });

  it('says nothing about a message with no timestamp', () => {
    expect(new NotificationModel({}).relativeTime).toBe('');
  });
});
