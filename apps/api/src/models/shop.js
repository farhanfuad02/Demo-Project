/**
 * @file Vendor shop entity.
 *
 * @module models/shop
 */

import { APPROVAL_STATUS } from '@hungry-ju/shared/enums';
import { BaseModel } from '../core/base-model.js';
import { ValidationError } from '../core/errors/app-error.js';

/**
 * A Bot Tola shop.
 *
 * Two independent gates decide whether students can order: the admin has to approve the
 * shop (BR-02) and the owner has to have it open (BR-07). Keeping them separate is what
 * lets a vendor close for the evening without losing their approval.
 *
 * @augments BaseModel
 */
export class Shop extends BaseModel {
  /** @type {string} */
  #ownerUserId;

  /** @type {string} */
  #shopName;

  /** @type {string} */
  #botTolaLocation;

  /** @type {string} */
  #contactPhone;

  /** @type {string} */
  #operatingHours;

  /** @type {string | null} */
  #description;

  /** @type {string | null} */
  #photoUrl;

  /** @type {string} */
  #approvalStatus;

  /** @type {string | null} */
  #decisionReason;

  /** @type {boolean} */
  #isOpen;

  /** @type {number} */
  #ratingSum;

  /** @type {number} */
  #ratingCount;

  /**
   * @param {object} attributes - Shop columns.
   * @param {string | null} [attributes.id] - Primary key.
   * @param {Date | string | null} [attributes.createdAt] - Creation timestamp.
   * @param {Date | string | null} [attributes.updatedAt] - Last write timestamp.
   * @param {string} attributes.ownerUserId - Vendor account owning the shop.
   * @param {string} attributes.shopName - Display name.
   * @param {string} attributes.botTolaLocation - Stall location within Bot Tola.
   * @param {string} attributes.contactPhone - Contact number.
   * @param {string} [attributes.operatingHours] - Human-readable hours.
   * @param {string | null} [attributes.description] - Short description.
   * @param {string | null} [attributes.photoUrl] - Cover image.
   * @param {string} [attributes.approvalStatus] - Review outcome (FR-G1).
   * @param {string | null} [attributes.decisionReason] - Reason recorded with the decision.
   * @param {boolean} [attributes.isOpen] - Whether the shop currently takes orders.
   * @param {number} [attributes.ratingSum] - Total stars received.
   * @param {number} [attributes.ratingCount] - Number of ratings received.
   */
  constructor({
    id,
    createdAt,
    updatedAt,
    ownerUserId,
    shopName,
    botTolaLocation,
    contactPhone,
    operatingHours = '',
    description = null,
    photoUrl = null,
    approvalStatus = APPROVAL_STATUS.PENDING,
    decisionReason = null,
    isOpen = false,
    ratingSum = 0,
    ratingCount = 0,
  }) {
    super({ id, createdAt, updatedAt });
    this.#ownerUserId = ownerUserId;
    this.#shopName = shopName;
    this.#botTolaLocation = botTolaLocation;
    this.#contactPhone = contactPhone;
    this.#operatingHours = operatingHours;
    this.#description = description;
    this.#photoUrl = photoUrl;
    this.#approvalStatus = approvalStatus;
    this.#decisionReason = decisionReason;
    this.#isOpen = isOpen;
    this.#ratingSum = ratingSum;
    this.#ratingCount = ratingCount;
  }

  /**
   * Vendor account owning this shop.
   *
   * @returns {string} User id.
   */
  get ownerUserId() {
    return this.#ownerUserId;
  }

  /**
   * Display name.
   *
   * @returns {string} Shop name.
   */
  get shopName() {
    return this.#shopName;
  }

  /**
   * Stall location within the Bot Tola cluster.
   *
   * @returns {string} Location.
   */
  get botTolaLocation() {
    return this.#botTolaLocation;
  }

  /**
   * Contact number.
   *
   * @returns {string} Phone number.
   */
  get contactPhone() {
    return this.#contactPhone;
  }

  /**
   * Review outcome.
   *
   * @returns {string} One of the approval statuses.
   */
  get approvalStatus() {
    return this.#approvalStatus;
  }

  /**
   * Whether an admin has approved this shop.
   *
   * @returns {boolean} `true` when approved.
   */
  get isApproved() {
    return this.#approvalStatus === APPROVAL_STATUS.APPROVED;
  }

  /**
   * Whether the owner currently has the shop open.
   *
   * @returns {boolean} `true` when open.
   */
  get isOpen() {
    return this.#isOpen;
  }

  /**
   * BR-07: a shop takes orders only when approved *and* open.
   *
   * @returns {boolean} `true` when students may order.
   */
  get canReceiveOrders() {
    return this.isApproved && this.#isOpen;
  }

  /**
   * Mean rating.
   *
   * @returns {number} Average stars to two decimals; `0` before any rating.
   */
  get ratingAverage() {
    if (this.#ratingCount === 0) {
      return 0;
    }
    return Math.round((this.#ratingSum / this.#ratingCount) * 100) / 100;
  }

  /**
   * Number of ratings received.
   *
   * @returns {number} Rating count.
   */
  get ratingCount() {
    return this.#ratingCount;
  }

  /**
   * Approves the shop (FR-G1). Approval does not open it: the owner decides when they
   * are actually behind the counter.
   *
   * @param {string | null} [reason] - Optional note recorded with the decision.
   * @returns {void}
   */
  approve(reason = null) {
    this.#approvalStatus = APPROVAL_STATUS.APPROVED;
    this.#decisionReason = reason;
    this.touch();
  }

  /**
   * Rejects the shop with a reason, and closes it so a previously approved shop cannot
   * keep taking orders after being rejected.
   *
   * @param {string} reason - Why the application was refused.
   * @returns {void}
   * @throws {ValidationError} When no reason is supplied.
   */
  reject(reason) {
    if (!reason || reason.trim() === '') {
      throw new ValidationError('A rejection reason is required.');
    }
    this.#approvalStatus = APPROVAL_STATUS.REJECTED;
    this.#decisionReason = reason;
    this.#isOpen = false;
    this.touch();
  }

  /**
   * Opens or closes the shop (FR-B3).
   *
   * @param {boolean} open - Desired state.
   * @returns {void}
   * @throws {ValidationError} When opening a shop that is not approved.
   */
  setOpen(open) {
    if (open && !this.isApproved) {
      throw new ValidationError('A shop can only open once an admin has approved it.');
    }
    this.#isOpen = open;
    this.touch();
  }

  /**
   * Applies editable shop details.
   *
   * @param {object} changes - Fields to update.
   * @param {string} [changes.shopName] - Display name.
   * @param {string} [changes.botTolaLocation] - Stall location.
   * @param {string} [changes.contactPhone] - Contact number.
   * @param {string} [changes.operatingHours] - Human-readable hours.
   * @param {string | null} [changes.description] - Short description.
   * @param {string | null} [changes.photoUrl] - Cover image.
   * @returns {void}
   */
  updateDetails({
    shopName,
    botTolaLocation,
    contactPhone,
    operatingHours,
    description,
    photoUrl,
  } = {}) {
    if (shopName !== undefined) {
      this.#shopName = shopName;
    }
    if (botTolaLocation !== undefined) {
      this.#botTolaLocation = botTolaLocation;
    }
    if (contactPhone !== undefined) {
      this.#contactPhone = contactPhone;
    }
    if (operatingHours !== undefined) {
      this.#operatingHours = operatingHours;
    }
    if (description !== undefined) {
      this.#description = description;
    }
    if (photoUrl !== undefined) {
      this.#photoUrl = photoUrl;
    }
    this.touch();
  }

  /**
   * Records a rating left for this shop (BR-08).
   *
   * @param {number} stars - Rating from 1 to 5.
   * @returns {void}
   * @throws {ValidationError} When the rating is outside 1 to 5.
   */
  addRating(stars) {
    if (!Number.isInteger(stars) || stars < 1 || stars > 5) {
      throw new ValidationError('A rating must be a whole number of stars from 1 to 5.');
    }
    this.#ratingSum += stars;
    this.#ratingCount += 1;
    this.touch();
  }

  /**
   * Checks own invariants (FR-B1).
   *
   * @returns {void} Returns nothing when the entity is consistent.
   * @throws {ValidationError} When a required detail is missing.
   */
  validate() {
    if (!this.#ownerUserId) {
      throw new ValidationError('A shop must have an owner.');
    }
    if (!this.#shopName || this.#shopName.trim().length < 2) {
      throw new ValidationError('A shop name of at least 2 characters is required.');
    }
    if (!this.#botTolaLocation) {
      throw new ValidationError('A Bot Tola location is required.');
    }
    if (!this.#contactPhone) {
      throw new ValidationError('A contact phone number is required.');
    }
  }

  /**
   * Row shape for the `shops` table.
   *
   * @returns {import('@hungry-ju/shared/types').PersistenceRow} Row for the repository.
   */
  toPersistence() {
    return {
      ...this.baseRow(),
      owner_user_id: this.#ownerUserId,
      shop_name: this.#shopName,
      bot_tola_location: this.#botTolaLocation,
      contact_phone: this.#contactPhone,
      operating_hours: this.#operatingHours,
      description: this.#description,
      photo_url: this.#photoUrl,
      approval_status: this.#approvalStatus,
      decision_reason: this.#decisionReason,
      is_open: this.#isOpen,
      rating_sum: this.#ratingSum,
      rating_count: this.#ratingCount,
    };
  }

  /**
   * Client-safe projection.
   *
   * @returns {Record<string, unknown>} Serialisable shop.
   */
  toJSON() {
    return {
      id: this.id,
      ownerUserId: this.#ownerUserId,
      shopName: this.#shopName,
      botTolaLocation: this.#botTolaLocation,
      contactPhone: this.#contactPhone,
      operatingHours: this.#operatingHours,
      description: this.#description,
      photoUrl: this.#photoUrl,
      approvalStatus: this.#approvalStatus,
      decisionReason: this.#decisionReason,
      isOpen: this.#isOpen,
      canReceiveOrders: this.canReceiveOrders,
      ratingAverage: this.ratingAverage,
      ratingCount: this.#ratingCount,
      createdAt: this.createdAt.toISOString(),
    };
  }

  /**
   * Rebuilds a shop from a stored row.
   *
   * @param {import('@hungry-ju/shared/types').PersistenceRow} row - Row from storage.
   * @returns {Shop} Hydrated shop.
   */
  static fromPersistence(row) {
    return new Shop({
      id: row.id,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      ownerUserId: row.owner_user_id,
      shopName: row.shop_name,
      botTolaLocation: row.bot_tola_location,
      contactPhone: row.contact_phone,
      operatingHours: row.operating_hours,
      description: row.description,
      photoUrl: row.photo_url,
      approvalStatus: row.approval_status,
      decisionReason: row.decision_reason,
      isOpen: Boolean(row.is_open),
      ratingSum: row.rating_sum ?? 0,
      ratingCount: row.rating_count ?? 0,
    });
  }
}
