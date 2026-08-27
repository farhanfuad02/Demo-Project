/**
 * @file Vendor account: the Bot Tola shop owner.
 *
 * @module models/vendor
 */

import { USER_ROLE, USER_STATUS } from '@hungry-ju/shared/enums';
import { User } from './user.js';

/**
 * A shop owner.
 *
 * A vendor account carries a second gate on top of verification: BR-02 says the shop
 * must also be approved by an admin. That gate lives on the `Shop` entity rather than
 * here, because an owner whose shop was rejected still needs to sign in and see why.
 *
 * @augments User
 */
export class Vendor extends User {
  /**
   * Role of this account.
   *
   * @returns {import('@hungry-ju/shared/types').UserRole} Always `vendor`.
   */
  get role() {
    return USER_ROLE.VENDOR;
  }

  /**
   * Whether this account may sign in and manage its shop.
   *
   * @returns {boolean} `true` when verified and not suspended.
   */
  get isActive() {
    return this.status === USER_STATUS.VERIFIED;
  }

  /**
   * Rebuilds a vendor from a stored row.
   *
   * @param {import('@hungry-ju/shared/types').PersistenceRow} row - Row from `users`.
   * @returns {Vendor} Hydrated account.
   */
  static fromPersistence(row) {
    return new Vendor(User.attributesFromRow(row));
  }
}
