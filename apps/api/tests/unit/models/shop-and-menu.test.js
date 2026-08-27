/**
 * @file Unit tests for Shop, MenuItem, and StudentProfile.
 *
 * @module tests/unit/models/shop-and-menu
 */

import { describe, expect, it } from '@jest/globals';
import { APPROVAL_STATUS } from '@hungry-ju/shared/enums';
import { MenuItem } from '../../../src/models/menu-item.js';
import { Shop } from '../../../src/models/shop.js';
import { StudentProfile } from '../../../src/models/student-profile.js';
import { Money } from '../../../src/utils/money.js';
import { ValidationError } from '../../../src/core/errors/app-error.js';

/**
 * Builds a shop with sensible defaults.
 *
 * @param {object} [overrides] - Attributes to change.
 * @returns {Shop} The shop.
 */
function makeShop(overrides = {}) {
  return new Shop({
    ownerUserId: 'vendor-1',
    shopName: 'Bot Tola Bhorta Ghor',
    botTolaLocation: 'Bot Tola, stall 4',
    contactPhone: '01700000002',
    ...overrides,
  });
}

describe('Shop', () => {
  it('starts pending and closed', () => {
    const shop = makeShop();
    expect(shop.approvalStatus).toBe(APPROVAL_STATUS.PENDING);
    expect(shop.isOpen).toBe(false);
    expect(shop.canReceiveOrders).toBe(false);
  });

  it('needs both approval and an open sign to take orders (BR-07)', () => {
    const shop = makeShop();
    shop.approve();
    expect(shop.canReceiveOrders).toBe(false);

    shop.setOpen(true);
    expect(shop.canReceiveOrders).toBe(true);
  });

  it('refuses to open before an admin has approved it', () => {
    expect(() => makeShop().setOpen(true)).toThrow(ValidationError);
  });

  it('approving does not open the shop — the owner decides that', () => {
    const shop = makeShop();
    shop.approve();
    expect(shop.isOpen).toBe(false);
  });

  it('closes the shop when an application is rejected', () => {
    const shop = makeShop();
    shop.approve();
    shop.setOpen(true);
    shop.reject('Could not verify the stall.');

    expect(shop.isApproved).toBe(false);
    expect(shop.isOpen).toBe(false);
    expect(shop.canReceiveOrders).toBe(false);
  });

  it('demands a reason to reject', () => {
    expect(() => makeShop().reject('')).toThrow(ValidationError);
  });

  describe('ratings', () => {
    it('reports no rating rather than zero stars before the first one', () => {
      expect(makeShop().ratingAverage).toBe(0);
      expect(makeShop().ratingCount).toBe(0);
    });

    it('keeps the running mean accurate as ratings arrive', () => {
      const shop = makeShop();
      shop.addRating(5);
      shop.addRating(4);
      shop.addRating(3);
      expect(shop.ratingAverage).toBe(4);
      expect(shop.ratingCount).toBe(3);
    });

    it('refuses a score outside one to five', () => {
      expect(() => makeShop().addRating(0)).toThrow(ValidationError);
      expect(() => makeShop().addRating(6)).toThrow(ValidationError);
      expect(() => makeShop().addRating(4.5)).toThrow(ValidationError);
    });
  });

  it('validates the details FR-B1 requires', () => {
    expect(() => makeShop({ shopName: 'A' }).validate()).toThrow(ValidationError);
    expect(() => makeShop({ botTolaLocation: '' }).validate()).toThrow(ValidationError);
    expect(() => makeShop({ contactPhone: '' }).validate()).toThrow(ValidationError);
    expect(() => makeShop({ ownerUserId: null }).validate()).toThrow(ValidationError);
  });

  it('round-trips through persistence', () => {
    const shop = makeShop({ id: 's1' });
    shop.approve();
    shop.setOpen(true);
    shop.addRating(5);

    const restored = Shop.fromPersistence(shop.toPersistence());
    expect(restored.isOpen).toBe(true);
    expect(restored.isApproved).toBe(true);
    expect(restored.ratingAverage).toBe(5);
  });
});

describe('MenuItem', () => {
  /**
   * Builds a menu item with sensible defaults.
   *
   * @param {object} [overrides] - Attributes to change.
   * @returns {MenuItem} The item.
   */
  const makeItem = (overrides = {}) =>
    new MenuItem({
      shopId: 'shop-1',
      name: 'Khichuri',
      price: Money.fromTaka(60),
      ...overrides,
    });

  it('is available by default', () => {
    expect(makeItem().isAvailable).toBe(true);
  });

  it('toggles availability, which is the one-tap sold-out control', () => {
    const item = makeItem();
    item.setAvailable(false);
    expect(item.isAvailable).toBe(false);
  });

  it('updates only the fields it was given', () => {
    const item = makeItem({ description: 'Hot and cheap' });
    item.update({ price: Money.fromTaka(70) });
    expect(item.price.taka).toBe(70);
    expect(item.description).toBe('Hot and cheap');
  });

  it('rejects a price of zero or less', () => {
    expect(() => makeItem({ price: Money.fromTaka(0) }).validate()).toThrow(ValidationError);
  });

  it('rejects a price that is not a Money value', () => {
    expect(() => makeItem({ price: 60 }).validate()).toThrow(ValidationError);
  });

  it('rejects a negative preparation time', () => {
    expect(() => makeItem({ prepTimeMin: -5 }).validate()).toThrow(ValidationError);
  });

  it('serialises the price in taka for the client', () => {
    expect(makeItem().toJSON().price).toBe(60);
  });

  it('round-trips through persistence without losing a poisha', () => {
    const item = makeItem({ id: 'i1', price: Money.fromTaka(12.5) });
    const restored = MenuItem.fromPersistence(item.toPersistence());
    expect(restored.price.equals(Money.fromTaka(12.5))).toBe(true);
  });
});

describe('StudentProfile', () => {
  it('starts offline with a full reliability score', () => {
    const profile = new StudentProfile({ userId: 'u1' });
    expect(profile.isDeliveryEnabled).toBe(false);
    expect(profile.reliabilityScore).toBe(100);
    expect(profile.hasDeliveryAddress).toBe(false);
  });

  it('knows when an order can actually be delivered to it', () => {
    const profile = new StudentProfile({ userId: 'u1' });
    profile.updateLocation({ hallName: 'Pritilata Hall' });
    expect(profile.hasDeliveryAddress).toBe(false);

    profile.updateLocation({ roomNo: '302' });
    expect(profile.hasDeliveryAddress).toBe(true);
  });

  it('keeps the rider average accurate by storing sum and count', () => {
    const profile = new StudentProfile({ userId: 'u1' });
    profile.addRiderRating(5);
    profile.addRiderRating(4);
    expect(profile.riderRatingAverage).toBe(4.5);
    expect(profile.riderRatingCount).toBe(2);
  });

  it('refuses an out-of-range rider rating', () => {
    expect(() => new StudentProfile({ userId: 'u1' }).addRiderRating(9)).toThrow(ValidationError);
  });

  it('deducts reliability but never below zero', () => {
    const profile = new StudentProfile({ userId: 'u1' });
    profile.penaliseReliability(30);
    expect(profile.reliabilityScore).toBe(70);

    profile.penaliseReliability(500);
    expect(profile.reliabilityScore).toBe(0);
  });

  it('requires an owning account', () => {
    expect(() => new StudentProfile({ userId: null }).validate()).toThrow(ValidationError);
  });

  it('round-trips through persistence', () => {
    const profile = new StudentProfile({ id: 'p1', userId: 'u1' });
    profile.setDeliveryEnabled(true);
    profile.addRiderRating(4);

    const restored = StudentProfile.fromPersistence(profile.toPersistence());
    expect(restored.isDeliveryEnabled).toBe(true);
    expect(restored.riderRatingAverage).toBe(4);
  });
});
