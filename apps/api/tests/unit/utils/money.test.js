/**
 * @file Unit tests for the Money value object.
 *
 * @module tests/unit/utils/money
 */

import { describe, expect, it } from '@jest/globals';
import { Money } from '../../../src/utils/money.js';
import { ValidationError } from '../../../src/core/errors/app-error.js';

describe('Money', () => {
  describe('construction', () => {
    it('stores whole poisha', () => {
      expect(new Money(1250).poisha).toBe(1250);
    });

    it('rejects a fractional amount', () => {
      expect(() => new Money(12.5)).toThrow(ValidationError);
    });

    it('rejects a negative amount', () => {
      expect(() => new Money(-1)).toThrow(ValidationError);
    });

    it('converts taka to poisha without floating-point drift', () => {
      // 0.1 + 0.2 famously is not 0.3; going through integers is the whole point.
      const total = Money.fromTaka(0.1).add(Money.fromTaka(0.2));
      expect(total.poisha).toBe(30);
      expect(total.taka).toBe(0.3);
    });

    it('rejects a non-numeric taka amount', () => {
      expect(() => Money.fromTaka('60')).toThrow(ValidationError);
    });
  });

  describe('arithmetic', () => {
    it('adds without mutating either operand', () => {
      const left = Money.fromTaka(60);
      const right = Money.fromTaka(25);
      const sum = left.add(right);

      expect(sum.taka).toBe(85);
      expect(left.taka).toBe(60);
      expect(right.taka).toBe(25);
    });

    it('subtracts', () => {
      expect(Money.fromTaka(100).subtract(Money.fromTaka(25)).taka).toBe(75);
    });

    it('refuses to go below zero', () => {
      expect(() => Money.fromTaka(10).subtract(Money.fromTaka(20))).toThrow(ValidationError);
    });

    it('multiplies by a quantity', () => {
      expect(Money.fromTaka(60).multiply(3).taka).toBe(180);
    });

    it('rejects a fractional multiplier', () => {
      expect(() => Money.fromTaka(60).multiply(1.5)).toThrow(ValidationError);
    });

    it('sums a list, starting from zero', () => {
      const lines = [Money.fromTaka(60), Money.fromTaka(25), Money.fromTaka(12)];
      expect(Money.sum(lines).taka).toBe(97);
      expect(Money.sum([]).taka).toBe(0);
    });
  });

  describe('equality and formatting', () => {
    it('compares by value, not identity', () => {
      expect(Money.fromTaka(60).equals(Money.fromTaka(60))).toBe(true);
      expect(Money.fromTaka(60).equals(Money.fromTaka(61))).toBe(false);
      expect(Money.fromTaka(60).equals(60)).toBe(false);
    });

    it('formats with the taka sign', () => {
      expect(Money.fromTaka(125.5).toString()).toBe('৳125.50');
    });

    it('serialises as taka so the client never sees poisha', () => {
      expect(JSON.parse(JSON.stringify({ total: Money.fromTaka(85) }))).toEqual({ total: 85 });
    });
  });

  it('is immutable', () => {
    const amount = Money.fromTaka(60);
    expect(Object.isFrozen(amount)).toBe(true);
  });
});
