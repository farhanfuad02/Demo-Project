/**
 * @file Student account: customer, and — after a mode toggle — delivery partner.
 *
 * @module models/student
 */

import { USER_ROLE } from '@hungry-ju/shared/enums';
import { User } from './user.js';

/**
 * A verified JU student.
 *
 * The SRS is explicit that a delivery partner is not a separate account type but a
 * student who switched into Deliver Mode (section 3), so there is no `Rider` class:
 * modelling one would invite a second account per person and break the rule that a
 * student may not deliver their own order (BR-06).
 *
 * @augments User
 */
export class Student extends User {
  /**
   * Role of this account.
   *
   * @returns {import('@hungry-ju/shared/types').UserRole} Always `student`.
   */
  get role() {
    return USER_ROLE.STUDENT;
  }

  /**
   * Rebuilds a student from a stored row.
   *
   * @param {import('@hungry-ju/shared/types').PersistenceRow} row - Row from `users`.
   * @returns {Student} Hydrated account.
   */
  static fromPersistence(row) {
    return new Student(User.attributesFromRow(row));
  }
}
