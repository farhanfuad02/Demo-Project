/**
 * @file Data access for accounts.
 *
 * @module repositories/user-repository
 */

import { BaseRepository } from '../core/base-repository.js';
import { UserFactory } from '../models/user-factory.js';

/**
 * Reads and writes the `users` table.
 *
 * Hydration goes through `UserFactory`, so every layer above receives a `Student`,
 * `Vendor`, or `Admin` — an object that knows its own role — rather than a bag of
 * columns with a role string that each caller must interpret.
 *
 * @augments BaseRepository<import('../models/user.js').User>
 */
export class UserRepository extends BaseRepository {
  /**
   * @param {import('../config/database/database.js').Database} db - Database client.
   */
  constructor(db) {
    super(db, 'users');
  }

  /**
   * Finds an account by e-mail address.
   *
   * @param {string} email - E-mail to look for.
   * @returns {Promise<import('../models/user.js').User | null>} Account, or `null`.
   */
  async findByEmail(email) {
    return this.findOne({ email: email.toLowerCase() });
  }

  /**
   * Finds an account by phone number.
   *
   * @param {string} phone - Phone number to look for.
   * @returns {Promise<import('../models/user.js').User | null>} Account, or `null`.
   */
  async findByPhone(phone) {
    return this.findOne({ phone });
  }

  /**
   * Finds an account by whichever contact method the user typed (FR-A4).
   *
   * @param {string} identifier - E-mail address or phone number.
   * @returns {Promise<import('../models/user.js').User | null>} Account, or `null`.
   */
  async findByIdentifier(identifier) {
    const normalised = identifier.trim();
    return (await this.findByEmail(normalised)) ?? (await this.findByPhone(normalised));
  }

  /**
   * Whether an e-mail or phone number is already registered (BR-01).
   *
   * @param {object} contacts - Contact methods to check.
   * @param {string | null} [contacts.email] - E-mail address.
   * @param {string | null} [contacts.phone] - Phone number.
   * @returns {Promise<boolean>} `true` when either is taken.
   */
  async contactIsTaken({ email = null, phone = null }) {
    if (email && (await this.findByEmail(email))) {
      return true;
    }
    if (phone && (await this.findByPhone(phone))) {
      return true;
    }
    return false;
  }

  /**
   * Maps a stored row onto the right user subclass.
   *
   * @param {import('@hungry-ju/shared/types').PersistenceRow} row - Row from `users`.
   * @returns {import('../models/user.js').User} Hydrated account.
   */
  toModel(row) {
    return UserFactory.fromPersistence(row);
  }
}
