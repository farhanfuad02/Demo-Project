/**
 * @file Builds the right `User` subclass for a role.
 *
 * @module models/user-factory
 */

import { USER_ROLE } from '@hungry-ju/shared/enums';
import { ValidationError } from '../core/errors/app-error.js';
import { Admin } from './admin.js';
import { Student } from './student.js';
import { Vendor } from './vendor.js';

/**
 * Role to concrete class. Adding a role means adding an entry here and a subclass —
 * not editing a `switch` in the repository, the auth service, and the seeder.
 *
 * @type {Readonly<Record<string, typeof Student | typeof Vendor | typeof Admin>>}
 */
const ROLE_CLASS = Object.freeze({
  [USER_ROLE.STUDENT]: Student,
  [USER_ROLE.VENDOR]: Vendor,
  [USER_ROLE.ADMIN]: Admin,
});

/**
 * Resolves the concrete user class for a role.
 *
 * The abstract `User` cannot name its own subclasses without a circular import, so the
 * dispatch lives one level up. `UserRepository` is its main caller: a row carries a role
 * string, and everything above the repository wants an object that knows what it is.
 */
export class UserFactory {
  /**
   * Builds a new account of the given role.
   *
   * @param {import('@hungry-ju/shared/types').UserRole} role - Role to create.
   * @param {import('./user.js').UserAttributes} attributes - Constructor attributes.
   * @returns {import('./user.js').User} The account.
   * @throws {ValidationError} When the role is unknown.
   */
  static create(role, attributes) {
    const UserClass = ROLE_CLASS[role];
    if (!UserClass) {
      throw new ValidationError(`Unknown user role "${role}".`);
    }
    return new UserClass(attributes);
  }

  /**
   * Rebuilds an account from a stored row, using the row's own role column.
   *
   * @param {import('@hungry-ju/shared/types').PersistenceRow} row - Row from `users`.
   * @returns {import('./user.js').User} Hydrated account.
   * @throws {ValidationError} When the stored role is unknown.
   */
  static fromPersistence(row) {
    const UserClass = ROLE_CLASS[row.role];
    if (!UserClass) {
      throw new ValidationError(`Unknown user role "${row.role}".`);
    }
    return UserClass.fromPersistence(row);
  }
}
