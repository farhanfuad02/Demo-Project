/**
 * @file Unit tests for the cart aggregate.
 *
 * @module tests/unit/models/cart
 */

import { describe, expect, it } from '@jest/globals';
import { Cart } from '../../../src/models/cart.js';
import { CartItem } from '../../../src/models/cart-item.js';
import { MenuItem } from '../../../src/models/menu-item.js';
import { Money } from '../../../src/utils/money.js';
import { ConflictError, ValidationError } from '../../../src/core/errors/app-error.js';

/**
 * Builds a menu item.
 *
 * @param {object} [overrides] - Attributes to change.
 * @returns {MenuItem} The item.
 */
function makeItem(overrides = {}) {
  return new MenuItem({
    id: overrides.id ?? 'item-1',
    shopId: overrides.shopId ?? 'shop-1',
    name: overrides.name ?? 'Khichuri',
    price: Money.fromTaka(overrides.price ?? 60),
    isAvailable: overrides.isAvailable ?? true,
  });
}

describe('Cart', () => {
  it('starts empty and unbound to any vendor', () => {
    const cart = new Cart({ studentId: 'u1' });
    expect(cart.isEmpty).toBe(true);
    expect(cart.shopId).toBeNull();
    expect(cart.subtotal.taka).toBe(0);
  });

  it('binds to the vendor of the first item added', () => {
    const cart = new Cart({ studentId: 'u1' });
    cart.addItem(makeItem());
    expect(cart.shopId).toBe('shop-1');
  });

  describe('BR-03: one cart, one vendor', () => {
    it('accepts more items from the same shop', () => {
      const cart = new Cart({ studentId: 'u1' });
      cart.addItem(makeItem({ id: 'item-1' }));
      expect(() => cart.addItem(makeItem({ id: 'item-2' }))).not.toThrow();
    });

    it('refuses an item from a different shop', () => {
      const cart = new Cart({ studentId: 'u1' });
      cart.addItem(makeItem({ shopId: 'shop-1' }));
      expect(() => cart.addItem(makeItem({ id: 'item-9', shopId: 'shop-2' }))).toThrow(
        ConflictError
      );
    });

    it('unbinds the vendor once the cart empties, so the next item may come from anywhere', () => {
      const cart = new Cart({ studentId: 'u1' });
      cart.addItem(makeItem());
      cart.removeItem('item-1');

      expect(cart.shopId).toBeNull();
      expect(() => cart.addItem(makeItem({ id: 'item-9', shopId: 'shop-2' }))).not.toThrow();
    });
  });

  describe('FR-C4: re-adding merges quantities', () => {
    it('increments an existing line rather than adding a second one', () => {
      const cart = new Cart({ studentId: 'u1' });
      cart.addItem(makeItem(), 2);
      cart.addItem(makeItem(), 3);

      expect(cart.items).toHaveLength(1);
      expect(cart.items[0].quantity).toBe(5);
      expect(cart.itemCount).toBe(5);
    });
  });

  it('refuses a sold-out item (BR-07)', () => {
    const cart = new Cart({ studentId: 'u1' });
    expect(() => cart.addItem(makeItem({ isAvailable: false }))).toThrow(ValidationError);
  });

  it('totals the lines', () => {
    const cart = new Cart({ studentId: 'u1' });
    cart.addItem(makeItem({ id: 'a', price: 60 }), 2);
    cart.addItem(makeItem({ id: 'b', price: 25 }), 1);
    expect(cart.subtotal.taka).toBe(145);
  });

  describe('FR-C5: editing quantities', () => {
    it('sets a new quantity', () => {
      const cart = new Cart({ studentId: 'u1' });
      cart.addItem(makeItem(), 1);
      cart.updateQuantity('item-1', 4);
      expect(cart.itemCount).toBe(4);
    });

    it('removes the line when the quantity reaches zero', () => {
      const cart = new Cart({ studentId: 'u1' });
      cart.addItem(makeItem(), 1);
      cart.updateQuantity('item-1', 0);
      expect(cart.isEmpty).toBe(true);
    });

    it('refuses to change a line that is not there', () => {
      const cart = new Cart({ studentId: 'u1' });
      expect(() => cart.updateQuantity('ghost', 2)).toThrow(ValidationError);
    });
  });

  it('hands out a copy of its lines, so a caller cannot splice the aggregate', () => {
    const cart = new Cart({ studentId: 'u1' });
    cart.addItem(makeItem());
    cart.items.pop();
    expect(cart.items).toHaveLength(1);
  });

  it('clears both the lines and the vendor binding', () => {
    const cart = new Cart({ studentId: 'u1' });
    cart.addItem(makeItem());
    cart.clear();
    expect(cart.isEmpty).toBe(true);
    expect(cart.shopId).toBeNull();
  });

  it('requires an owner', () => {
    expect(() => new Cart({ studentId: null }).validate()).toThrow(ValidationError);
  });

  it('rejects lines without a vendor binding', () => {
    const cart = new Cart({ studentId: 'u1' });
    cart.setItems([
      new CartItem({ menuItemId: 'x', itemName: 'X', unitPrice: Money.fromTaka(10) }),
    ]);
    expect(() => cart.validate()).toThrow(ValidationError);
  });
});

describe('CartItem', () => {
  /**
   * Builds a cart line.
   *
   * @param {object} [overrides] - Attributes to change.
   * @returns {CartItem} The line.
   */
  const makeLine = (overrides = {}) =>
    new CartItem({
      menuItemId: 'item-1',
      itemName: 'Khichuri',
      unitPrice: Money.fromTaka(60),
      quantity: 2,
      ...overrides,
    });

  it('computes its line total', () => {
    expect(makeLine().lineTotal.taka).toBe(120);
  });

  it('increases by a positive whole number only', () => {
    const line = makeLine();
    line.increaseBy(3);
    expect(line.quantity).toBe(5);
    expect(() => line.increaseBy(0)).toThrow(ValidationError);
    expect(() => line.increaseBy(1.5)).toThrow(ValidationError);
  });

  it('refuses a quantity below one', () => {
    expect(() => makeLine().setQuantity(0)).toThrow(ValidationError);
  });

  it('reports whether a refresh changed the price, so checkout can show a diff', () => {
    const line = makeLine();
    const sameItem = new MenuItem({
      id: 'item-1',
      shopId: 's1',
      name: 'Khichuri',
      price: Money.fromTaka(60),
    });
    expect(line.refreshFrom(sameItem)).toBe(false);

    const dearer = new MenuItem({
      id: 'item-1',
      shopId: 's1',
      name: 'Khichuri Special',
      price: Money.fromTaka(70),
    });
    expect(line.refreshFrom(dearer)).toBe(true);
    expect(line.unitPrice.taka).toBe(70);
    expect(line.itemName).toBe('Khichuri Special');
  });

  it('round-trips through persistence', () => {
    const restored = CartItem.fromPersistence(makeLine({ id: 'l1', cartId: 'c1' }).toPersistence());
    expect(restored.quantity).toBe(2);
    expect(restored.unitPrice.taka).toBe(60);
  });
});
