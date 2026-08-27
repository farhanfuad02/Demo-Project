/**
 * @file Password hashing and strength policy.
 *
 * @module services/password-service
 */

import bcrypt from 'bcryptjs';
import { AUTH } from '@hungry-ju/shared/constants';
import { BaseService } from '../core/base-service.js';
import { ValidationError } from '../core/errors/app-error.js';

/** Rules of FR-A3, each with the message shown when it fails. */
const STRENGTH_RULES = Object.freeze([
  {
    test: /.{8,}/,
    message: `at least ${AUTH.PASSWORD_MIN_LENGTH} characters`,
  },
  { test: /[a-z]/, message: 'a lowercase letter' },
  { test: /[A-Z]/, message: 'an uppercase letter' },
  { test: /\d/, message: 'a digit' },
  { test: /[^A-Za-z0-9]/, message: 'a special character' },
]);

/**
 * Hashes, verifies, and judges passwords.
 *
 * Every path that touches a plaintext password goes through this one class, so the cost
 * factor and the strength policy are single decisions rather than per-endpoint habits.
 * Nothing else in the system ever sees a plaintext password for longer than one call.
 *
 * @augments BaseService
 */
export class PasswordService extends BaseService {
  /** @type {number} */
  #cost;

  /**
   * @param {object} [dependencies] - Injected configuration.
   * @param {number} [dependencies.cost] - Bcrypt cost factor.
   */
  constructor({ cost = AUTH.BCRYPT_COST } = {}) {
    super();
    this.#cost = cost;
  }

  /**
   * Checks a password against the strength policy (FR-A3).
   *
   * Every unmet rule is reported at once. Revealing them one at a time turns choosing a
   * password into a guessing game and is the fastest way to make users pick
   * `Password1!`.
   *
   * @param {string} password - Candidate password.
   * @returns {void} Returns nothing when the password is strong enough.
   * @throws {ValidationError} When one or more rules are unmet.
   */
  assertStrong(password) {
    const unmet = STRENGTH_RULES.filter((rule) => !rule.test.test(password ?? '')).map(
      (rule) => rule.message
    );
    if (unmet.length > 0) {
      throw new ValidationError(`Your password needs ${unmet.join(', ')}.`, [
        { path: 'password', message: `Missing: ${unmet.join(', ')}` },
      ]);
    }
  }

  /**
   * Hashes a password after checking its strength.
   *
   * @param {string} password - Plaintext password.
   * @returns {Promise<string>} Bcrypt hash.
   * @throws {ValidationError} When the password is too weak.
   */
  async hash(password) {
    this.assertStrong(password);
    return bcrypt.hash(password, this.#cost);
  }

  /**
   * Hashes a value without the strength policy, for short secrets such as the delivery
   * PIN which is generated rather than chosen.
   *
   * @param {string} value - Value to hash.
   * @returns {Promise<string>} Bcrypt hash.
   */
  async hashSecret(value) {
    return bcrypt.hash(value, this.#cost);
  }

  /**
   * Compares a candidate against a stored hash.
   *
   * @param {string} candidate - Plaintext value supplied by the user.
   * @param {string} hash - Stored bcrypt hash.
   * @returns {Promise<boolean>} `true` on a match.
   */
  async verify(candidate, hash) {
    if (!candidate || !hash) {
      return false;
    }
    return bcrypt.compare(candidate, hash);
  }
}
