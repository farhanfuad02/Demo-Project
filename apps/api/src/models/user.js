/**
 * @file Abstract user entity, root of the single-table role hierarchy.
 *
 * @module models/user
 */

import { GENDER, USER_STATUS } from '@hungry-ju/shared/enums';
import { AUTH, ROLE_HOME_ROUTE } from '@hungry-ju/shared/constants';
import { BaseModel } from '../core/base-model.js';
import { ValidationError } from '../core/errors/app-error.js';

/**
 * Constructor attributes shared by every user subclass.
 *
 * @typedef {object} UserAttributes
 * @property {string | null} [id] - Primary key.
 * @property {Date | string | null} [createdAt] - Row creation timestamp.
 * @property {Date | string | null} [updatedAt] - Last write timestamp.
 * @property {string} fullName - Display name.
 * @property {string | null} [email] - Unique login e-mail (BR-01).
 * @property {string | null} [phone] - Unique contact phone (BR-01).
 * @property {string} passwordHash - Bcrypt hash; plaintext never reaches this layer.
 * @property {string | null} [gender] - `male` or `female`; decides which residence halls
 *   the account may choose from.
 * @property {string | null} [photoUrl] - Optional avatar URL.
 * @property {import('@hungry-ju/shared/types').UserStatus} [status] - Lifecycle state.
 * @property {number} [failedLoginCount] - Consecutive failed sign-ins (FR-A6).
 * @property {Date | string | null} [lockedUntil] - Lock expiry, when throttled.
 * @property {Date | string | null} [verifiedAt] - When the account was verified.
 */

/**
 * Abstract user (table `users`, single-table inheritance per SRS section 7).
 *
 * Student, Vendor, and Admin subclass it because role behaviour differs — where you land
 * after login, what you may do — while identity, credentials, and verification are
 * shared. Callers ask the object what it is instead of switching on a role string, so a
 * fourth role would add a subclass rather than edit every branch in the codebase.
 *
 * @abstract
 * @augments BaseModel
 */
export class User extends BaseModel {
  /** @type {string} */
  #fullName;

  /** @type {string | null} */
  #email;

  /** @type {string | null} */
  #phone;

  /** @type {string} */
  #passwordHash;

  /** @type {string | null} */
  #gender;

  /** @type {string | null} */
  #photoUrl;

  /** @type {import('@hungry-ju/shared/types').UserStatus} */
  #status;

  /** @type {number} */
  #failedLoginCount;

  /** @type {Date | null} */
  #lockedUntil;

  /** @type {Date | null} */
  #verifiedAt;

  /**
   * @param {UserAttributes} attributes - Identity and credential columns.
   * @throws {TypeError} When constructed directly instead of through a role subclass.
   */
  constructor({
    id,
    createdAt,
    updatedAt,
    fullName,
    email = null,
    phone = null,
    passwordHash,
    gender = null,
    photoUrl = null,
    status = USER_STATUS.PENDING,
    failedLoginCount = 0,
    lockedUntil = null,
    verifiedAt = null,
  }) {
    super({ id, createdAt, updatedAt });
    if (new.target === User) {
      throw new TypeError('User is abstract; construct Student, Vendor, or Admin');
    }
    this.#fullName = fullName;
    this.#email = email;
    this.#phone = phone;
    this.#passwordHash = passwordHash;
    this.#gender = gender;
    this.#photoUrl = photoUrl;
    this.#status = status;
    this.#failedLoginCount = failedLoginCount;
    this.#lockedUntil = lockedUntil ? new Date(lockedUntil) : null;
    this.#verifiedAt = verifiedAt ? new Date(verifiedAt) : null;
  }

  /**
   * Display name.
   *
   * @returns {string} Full name.
   */
  get fullName() {
    return this.#fullName;
  }

  /**
   * Login e-mail.
   *
   * @returns {string | null} E-mail address, when the account has one.
   */
  get email() {
    return this.#email;
  }

  /**
   * Contact phone.
   *
   * @returns {string | null} Phone number, when the account has one.
   */
  get phone() {
    return this.#phone;
  }

  /**
   * Stored credential hash.
   *
   * Exposed only so `PasswordService` can compare against it; nothing else reads this,
   * and `toJSON` never includes it.
   *
   * @returns {string} Bcrypt hash.
   */
  get passwordHash() {
    return this.#passwordHash;
  }

  /**
   * Account lifecycle state.
   *
   * @returns {import('@hungry-ju/shared/types').UserStatus} Current status.
   */
  get status() {
    return this.#status;
  }

  /**
   * Self-declared gender.
   *
   * @returns {string | null} Gender, when provided.
   */
  get gender() {
    return this.#gender;
  }

  /**
   * Avatar URL.
   *
   * @returns {string | null} Photo URL, when provided.
   */
  get photoUrl() {
    return this.#photoUrl;
  }

  /**
   * Consecutive failed sign-in attempts.
   *
   * @returns {number} Failure count since the last success.
   */
  get failedLoginCount() {
    return this.#failedLoginCount;
  }

  /**
   * When the account was verified.
   *
   * @returns {Date | null} Timestamp, or `null` while pending.
   */
  get verifiedAt() {
    return this.#verifiedAt;
  }

  /**
   * Role of this account. Subclasses answer with their `USER_ROLE` value.
   *
   * @abstract
   * @returns {import('@hungry-ju/shared/types').UserRole} Role.
   * @throws {Error} Until a subclass implements it.
   */
  get role() {
    throw new Error(`${this.constructor.name} must implement the role getter`);
  }

  /**
   * Which dashboard this account lands on after login (FR-A7).
   *
   * @returns {string} Route path.
   */
  get homeRoute() {
    return ROLE_HOME_ROUTE[this.role] ?? '/';
  }

  /**
   * BR-02: an account is usable only once verified and not suspended.
   *
   * @returns {boolean} `true` when the account may act.
   */
  get isActive() {
    return this.#status === USER_STATUS.VERIFIED;
  }

  /**
   * FR-A6: whether sign-in is currently throttled.
   *
   * @returns {boolean} `true` while the lock is in force.
   */
  get isLocked() {
    return this.#lockedUntil !== null && this.#lockedUntil.getTime() > Date.now();
  }

  /**
   * When the current lock expires.
   *
   * @returns {Date | null} Expiry, or `null` when not locked.
   */
  get lockedUntil() {
    return this.#lockedUntil;
  }

  /**
   * Replaces the stored credential hash and clears any lock, since a successful reset
   * proves control of the verified contact method.
   *
   * @param {string} newHash - Freshly computed bcrypt hash.
   * @returns {void}
   * @throws {ValidationError} When the hash is empty.
   */
  changePassword(newHash) {
    if (!newHash) {
      throw new ValidationError('A password hash is required.');
    }
    this.#passwordHash = newHash;
    this.#failedLoginCount = 0;
    this.#lockedUntil = null;
    this.touch();
  }

  /**
   * Moves the account from pending to verified (FR-A2).
   *
   * @returns {void}
   * @throws {ValidationError} When the account is suspended.
   */
  markVerified() {
    if (this.#status === USER_STATUS.SUSPENDED) {
      throw new ValidationError('A suspended account cannot be verified.');
    }
    this.#status = USER_STATUS.VERIFIED;
    this.#verifiedAt = new Date();
    this.touch();
  }

  /**
   * Suspends the account; every subsequent request is refused (FR-G2).
   *
   * @returns {void}
   */
  suspend() {
    this.#status = USER_STATUS.SUSPENDED;
    this.touch();
  }

  /**
   * Lifts a suspension, returning the account to whichever state its verification
   * implies — reactivating must not verify an account that never was.
   *
   * @returns {void}
   */
  reactivate() {
    this.#status = this.#verifiedAt ? USER_STATUS.VERIFIED : USER_STATUS.PENDING;
    this.#failedLoginCount = 0;
    this.#lockedUntil = null;
    this.touch();
  }

  /**
   * Records a failed sign-in and locks the account once the threshold is reached.
   *
   * @returns {boolean} `true` when this failure triggered a lock.
   */
  recordFailedLogin() {
    this.#failedLoginCount += 1;
    this.touch();
    if (this.#failedLoginCount < AUTH.MAX_FAILED_LOGINS) {
      return false;
    }
    this.#lockedUntil = new Date(Date.now() + AUTH.LOCKOUT_MINUTES * 60_000);
    this.#failedLoginCount = 0;
    return true;
  }

  /**
   * Clears the failure counter after a successful sign-in.
   *
   * @returns {void}
   */
  recordSuccessfulLogin() {
    this.#failedLoginCount = 0;
    this.#lockedUntil = null;
    this.touch();
  }

  /**
   * Applies editable profile fields, ignoring anything the user may not change.
   *
   * Undefined means "not submitted" and leaves the field alone; `null` is a deliberate
   * clear. Treating them the same would wipe a photo every time a name is edited.
   *
   * @param {Partial<Pick<UserAttributes, 'fullName' | 'phone' | 'gender' | 'photoUrl'>>} changes -
   *   Fields to update.
   * @returns {void}
   */
  updateProfile({ fullName, phone, gender, photoUrl } = {}) {
    if (fullName !== undefined) {
      this.#fullName = fullName;
    }
    if (phone !== undefined) {
      this.#phone = phone;
    }
    if (gender !== undefined) {
      this.#gender = gender;
    }
    if (photoUrl !== undefined) {
      this.#photoUrl = photoUrl;
    }
    this.touch();
  }

  /**
   * FR-A1: a full name, a credential, and at least one contact method.
   *
   * @returns {void} Returns nothing when the entity is consistent.
   * @throws {ValidationError} When an invariant is broken.
   */
  validate() {
    if (!this.#fullName || this.#fullName.trim().length < 2) {
      throw new ValidationError('A full name of at least 2 characters is required.');
    }
    if (!this.#email && !this.#phone) {
      throw new ValidationError('An e-mail address or a phone number is required.');
    }
    if (!this.#passwordHash) {
      throw new ValidationError('A password is required.');
    }
    // Gender stays optional — a vendor has no hall and no reason to state one — but when
    // it is given it has to be a value the hall lists are keyed by, or the student would
    // be offered a dropdown with nothing in it.
    if (this.#gender !== null && !Object.values(GENDER).includes(this.#gender)) {
      throw new ValidationError('Gender must be either male or female.');
    }
  }

  /**
   * Row shape for the `users` table.
   *
   * @returns {import('@hungry-ju/shared/types').PersistenceRow} Row for the repository.
   */
  toPersistence() {
    return {
      ...this.baseRow(),
      full_name: this.#fullName,
      email: this.#email,
      phone: this.#phone,
      password_hash: this.#passwordHash,
      gender: this.#gender,
      photo_url: this.#photoUrl,
      role: this.role,
      status: this.#status,
      failed_login_count: this.#failedLoginCount,
      locked_until: this.#lockedUntil ? this.#lockedUntil.toISOString() : null,
      verified_at: this.#verifiedAt ? this.#verifiedAt.toISOString() : null,
    };
  }

  /**
   * Client-safe projection. The credential hash, the lock, and the failure counter stay
   * on the server: they are useful to an attacker and to nobody else.
   *
   * @returns {Record<string, unknown>} Serialisable account.
   */
  toJSON() {
    return {
      id: this.id,
      fullName: this.#fullName,
      email: this.#email,
      phone: this.#phone,
      gender: this.#gender,
      photoUrl: this.#photoUrl,
      role: this.role,
      status: this.#status,
      homeRoute: this.homeRoute,
      createdAt: this.createdAt.toISOString(),
    };
  }

  /**
   * Attributes a subclass constructor needs, decoded from a stored row.
   *
   * @protected
   * @param {import('@hungry-ju/shared/types').PersistenceRow} row - Row from the store.
   * @returns {UserAttributes} Constructor attributes.
   */
  static attributesFromRow(row) {
    return {
      id: row.id,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      fullName: row.full_name,
      email: row.email,
      phone: row.phone,
      passwordHash: row.password_hash,
      gender: row.gender,
      photoUrl: row.photo_url,
      status: row.status,
      failedLoginCount: row.failed_login_count ?? 0,
      lockedUntil: row.locked_until,
      verifiedAt: row.verified_at,
    };
  }
}
