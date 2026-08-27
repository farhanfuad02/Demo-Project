/**
 * @file Money value object.
 *
 * @module utils/money
 */

import { ValidationError } from '../core/errors/app-error.js';

/** Smallest currency unit per taka. Bangladeshi taka subdivides into 100 poisha. */
const POISHA_PER_TAKA = 100;

/**
 * An immutable amount in Bangladeshi taka, stored as an integer number of poisha.
 *
 * Floats have no business in a financial record: `0.1 + 0.2` is not `0.3`, and an order
 * total that disagrees with the sum of its lines by one poisha is a dispute waiting to
 * happen. Every arithmetic operation returns a new instance, so an amount that has been
 * handed to another object cannot be mutated behind its back.
 */
export class Money {
  /** @type {number} */
  #poisha;

  /**
   * @param {number} poisha - Whole poisha; never a fraction.
   * @throws {ValidationError} When the amount is not a non-negative integer.
   */
  constructor(poisha) {
    if (!Number.isInteger(poisha) || poisha < 0) {
      throw new ValidationError('An amount must be a non-negative whole number of poisha.');
    }
    this.#poisha = poisha;
    Object.freeze(this);
  }

  /**
   * Builds an amount from taka, which is how prices are entered and displayed.
   *
   * @param {number} taka - Amount in taka; at most two decimal places.
   * @returns {Money} The amount.
   * @throws {ValidationError} When the value is not a finite non-negative number.
   */
  static fromTaka(taka) {
    if (typeof taka !== 'number' || !Number.isFinite(taka) || taka < 0) {
      throw new ValidationError('An amount in taka must be a non-negative number.');
    }
    return new Money(Math.round(taka * POISHA_PER_TAKA));
  }

  /**
   * Builds an amount from a stored poisha column.
   *
   * @param {number} poisha - Whole poisha as read from storage.
   * @returns {Money} The amount.
   */
  static fromPoisha(poisha) {
    return new Money(poisha);
  }

  /**
   * The zero amount, used as the seed of a sum.
   *
   * @returns {Money} Zero taka.
   */
  static zero() {
    return new Money(0);
  }

  /**
   * Adds up a list of amounts.
   *
   * @param {Money[]} amounts - Amounts to total.
   * @returns {Money} The sum.
   */
  static sum(amounts) {
    return amounts.reduce((total, amount) => total.add(amount), Money.zero());
  }

  /**
   * Raw storage value.
   *
   * @returns {number} Whole poisha.
   */
  get poisha() {
    return this.#poisha;
  }

  /**
   * Display value.
   *
   * @returns {number} Amount in taka, to two decimal places.
   */
  get taka() {
    return this.#poisha / POISHA_PER_TAKA;
  }

  /**
   * Adds another amount.
   *
   * @param {Money} other - Amount to add.
   * @returns {Money} A new amount; neither operand changes.
   */
  add(other) {
    return new Money(this.#poisha + other.poisha);
  }

  /**
   * Subtracts another amount.
   *
   * @param {Money} other - Amount to subtract.
   * @returns {Money} A new amount.
   * @throws {ValidationError} When the result would be negative.
   */
  subtract(other) {
    return new Money(this.#poisha - other.poisha);
  }

  /**
   * Repeats this amount, for a line total of quantity times unit price.
   *
   * @param {number} factor - Whole multiplier, such as an item quantity.
   * @returns {Money} A new amount.
   * @throws {ValidationError} When the factor is not a non-negative integer.
   */
  multiply(factor) {
    if (!Number.isInteger(factor) || factor < 0) {
      throw new ValidationError('A multiplier must be a non-negative whole number.');
    }
    return new Money(this.#poisha * factor);
  }

  /**
   * Value equality, since two distinct instances of the same amount are the same money.
   *
   * @param {Money} other - Amount to compare with.
   * @returns {boolean} `true` when both hold the same number of poisha.
   */
  equals(other) {
    return other instanceof Money && other.poisha === this.#poisha;
  }

  /**
   * Human-readable amount with the taka sign.
   *
   * @returns {string} For example `৳125.50`.
   */
  toString() {
    return `৳${this.taka.toFixed(2)}`;
  }

  /**
   * Serialised as taka so the client never has to know about poisha.
   *
   * @returns {number} Amount in taka.
   */
  toJSON() {
    return this.taka;
  }
}
