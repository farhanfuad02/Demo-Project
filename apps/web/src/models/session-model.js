/**
 * @file The signed-in account, as the client sees it.
 *
 * @module models/session-model
 */

import { USER_ROLE } from '@hungry-ju/shared/enums';
import { BaseViewModel } from './base-view-model.js';

/**
 * The signed-in user, their role, and their student profile when they have one.
 *
 * Views ask this object questions — `isVendor`, `canDeliver`, `hasDeliveryAddress` —
 * rather than comparing role strings, so a navigation bar reads as intent instead of as
 * a chain of equality checks.
 *
 * @augments BaseViewModel
 */
export class SessionModel extends BaseViewModel {
  /**
   * Display name.
   *
   * @returns {string} Full name.
   */
  get fullName() {
    return /** @type {string} */ (this.raw.fullName ?? '');
  }

  /**
   * First name, for a greeting that fits on a phone.
   *
   * @returns {string} First word of the full name.
   */
  get firstName() {
    return this.fullName.split(' ')[0] ?? '';
  }

  /**
   * E-mail address.
   *
   * @returns {string | null} E-mail.
   */
  get email() {
    return /** @type {string | null} */ (this.raw.email ?? null);
  }

  /**
   * Phone number.
   *
   * @returns {string | null} Phone.
   */
  get phone() {
    return /** @type {string | null} */ (this.raw.phone ?? null);
  }

  /**
   * Role of this account.
   *
   * @returns {string} Role.
   */
  get role() {
    return /** @type {string} */ (this.raw.role);
  }

  /**
   * Where this account lands after signing in (FR-A7).
   *
   * @returns {string} Route path.
   */
  get homeRoute() {
    return /** @type {string} */ (this.raw.homeRoute ?? '/');
  }

  /**
   * Whether this is a student account.
   *
   * @returns {boolean} `true` for a student.
   */
  get isStudent() {
    return this.role === USER_ROLE.STUDENT;
  }

  /**
   * Whether this is a vendor account.
   *
   * @returns {boolean} `true` for a vendor.
   */
  get isVendor() {
    return this.role === USER_ROLE.VENDOR;
  }

  /**
   * Whether this is an admin account.
   *
   * @returns {boolean} `true` for an admin.
   */
  get isAdmin() {
    return this.role === USER_ROLE.ADMIN;
  }

  /**
   * The student profile, when this account has one.
   *
   * @returns {Record<string, unknown> | null} Profile, or `null`.
   */
  get profile() {
    return /** @type {Record<string, unknown> | null} */ (this.raw.profile ?? null);
  }

  /**
   * Residence hall.
   *
   * @returns {string | null} Hall name.
   */
  get hallName() {
    return /** @type {string | null} */ (this.profile?.hallName ?? null);
  }

  /**
   * Room or gate.
   *
   * @returns {string | null} Room number.
   */
  get roomNo() {
    return /** @type {string | null} */ (this.profile?.roomNo ?? null);
  }

  /**
   * Whether an order can be delivered without asking for an address first (FR-C6).
   *
   * @returns {boolean} `true` once a hall and room are on file.
   */
  get hasDeliveryAddress() {
    return Boolean(this.hallName && this.roomNo);
  }

  /**
   * Whether Deliver Mode is currently on (FR-D1).
   *
   * @returns {boolean} `true` while accepting deliveries.
   */
  get deliverModeOn() {
    return Boolean(this.profile?.isDeliveryEnabled);
  }

  /**
   * Mean rating this student has earned as a delivery partner.
   *
   * @returns {number} Average stars; `0` before any rating.
   */
  get riderRating() {
    return Number(this.profile?.riderRatingAverage ?? 0);
  }

  /**
   * Standing shown on the earnings page (SRS section 12.4).
   *
   * @returns {number} Reliability score from 0 to 100.
   */
  get reliabilityScore() {
    return Number(this.profile?.reliabilityScore ?? 100);
  }
}
