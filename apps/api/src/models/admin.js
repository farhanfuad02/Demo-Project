/**
 * @file Admin account: platform operator.
 *
 * @module models/admin
 */

import { USER_ROLE } from '@hungry-ju/shared/enums';
import { User } from './user.js';

/**
 * A platform operator: approvals, suspensions, dispute resolution.
 *
 * Admins are seeded rather than registered. Self-service creation of an account that can
 * suspend every user and cancel every order would be the single largest hole in the
 * system, so no registration path produces this class.
 *
 * @augments User
 */
export class Admin extends User {
  /**
   * Role of this account.
   *
   * @returns {import('@hungry-ju/shared/types').UserRole} Always `admin`.
   */
  get role() {
    return USER_ROLE.ADMIN;
  }

  /**
   * Rebuilds an admin from a stored row.
   *
   * @param {import('@hungry-ju/shared/types').PersistenceRow} row - Row from `users`.
   * @returns {Admin} Hydrated account.
   */
  static fromPersistence(row) {
    return new Admin(User.attributesFromRow(row));
  }
}
