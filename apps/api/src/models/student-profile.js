/**
 * @file Student-only attributes: delivery address, rider standing, deliver mode.
 *
 * @module models/student-profile
 */

import { BaseModel } from '../core/base-model.js';
import { ValidationError } from '../core/errors/app-error.js';

/**
 * Where a student lives and how they perform as a delivery partner.
 *
 * Split from `users` so vendor and admin rows do not carry hall, room, and rider-rating
 * columns that can only ever be null for them (3NF hygiene, SRS section 7).
 *
 * @augments BaseModel
 */
export class StudentProfile extends BaseModel {
  /** @type {string} */
  #userId;

  /** @type {string | null} */
  #hallName;

  /** @type {string | null} */
  #roomNo;

  /** @type {boolean} */
  #isDeliveryEnabled;

  /** @type {number} */
  #riderRatingSum;

  /** @type {number} */
  #riderRatingCount;

  /** @type {number} */
  #reliabilityScore;

  /**
   * @param {object} attributes - Profile columns.
   * @param {string | null} [attributes.id] - Primary key.
   * @param {Date | string | null} [attributes.createdAt] - Creation timestamp.
   * @param {Date | string | null} [attributes.updatedAt] - Last write timestamp.
   * @param {string} attributes.userId - Owning account.
   * @param {string | null} [attributes.hallName] - Residence hall.
   * @param {string | null} [attributes.roomNo] - Room or gate.
   * @param {boolean} [attributes.isDeliveryEnabled] - Whether Deliver Mode is on (FR-D1).
   * @param {number} [attributes.riderRatingSum] - Total stars received as a rider.
   * @param {number} [attributes.riderRatingCount] - Number of rider ratings received.
   * @param {number} [attributes.reliabilityScore] - Standing from 0 to 100.
   */
  constructor({
    id,
    createdAt,
    updatedAt,
    userId,
    hallName = null,
    roomNo = null,
    isDeliveryEnabled = false,
    riderRatingSum = 0,
    riderRatingCount = 0,
    reliabilityScore = 100,
  }) {
    super({ id, createdAt, updatedAt });
    this.#userId = userId;
    this.#hallName = hallName;
    this.#roomNo = roomNo;
    this.#isDeliveryEnabled = isDeliveryEnabled;
    this.#riderRatingSum = riderRatingSum;
    this.#riderRatingCount = riderRatingCount;
    this.#reliabilityScore = reliabilityScore;
  }

  /**
   * Owning account.
   *
   * @returns {string} User id.
   */
  get userId() {
    return this.#userId;
  }

  /**
   * Residence hall.
   *
   * @returns {string | null} Hall name.
   */
  get hallName() {
    return this.#hallName;
  }

  /**
   * Room or gate.
   *
   * @returns {string | null} Room number.
   */
  get roomNo() {
    return this.#roomNo;
  }

  /**
   * Whether the student currently accepts deliveries.
   *
   * @returns {boolean} `true` while in Deliver Mode.
   */
  get isDeliveryEnabled() {
    return this.#isDeliveryEnabled;
  }

  /**
   * Standing used by admins to spot unreliable riders (SRS section 12.4).
   *
   * @returns {number} Score from 0 to 100.
   */
  get reliabilityScore() {
    return this.#reliabilityScore;
  }

  /**
   * Number of rider ratings received.
   *
   * @returns {number} Rating count.
   */
  get riderRatingCount() {
    return this.#riderRatingCount;
  }

  /**
   * Mean rider rating.
   *
   * @returns {number} Average stars, rounded to two decimals; `0` before any rating.
   */
  get riderRatingAverage() {
    if (this.#riderRatingCount === 0) {
      return 0;
    }
    return Math.round((this.#riderRatingSum / this.#riderRatingCount) * 100) / 100;
  }

  /**
   * Whether an order may be delivered to this profile as it stands (FR-C6).
   *
   * @returns {boolean} `true` once a hall and a room are on file.
   */
  get hasDeliveryAddress() {
    return Boolean(this.#hallName && this.#roomNo);
  }

  /**
   * Updates the delivery address.
   *
   * @param {object} changes - Address fields.
   * @param {string} [changes.hallName] - Residence hall.
   * @param {string} [changes.roomNo] - Room or gate.
   * @returns {void}
   */
  updateLocation({ hallName, roomNo }) {
    if (hallName !== undefined) {
      this.#hallName = hallName;
    }
    if (roomNo !== undefined) {
      this.#roomNo = roomNo;
    }
    this.touch();
  }

  /**
   * Turns Deliver Mode on or off (FR-D1).
   *
   * @param {boolean} enabled - Desired state.
   * @returns {void}
   */
  setDeliveryEnabled(enabled) {
    this.#isDeliveryEnabled = enabled;
    this.touch();
  }

  /**
   * Records a rating received as a delivery partner.
   *
   * The sum and the count are kept rather than the average alone, so a later rating
   * cannot drift the mean the way repeatedly averaging an average would.
   *
   * @param {number} stars - Rating from 1 to 5.
   * @returns {void}
   * @throws {ValidationError} When the rating is outside 1 to 5.
   */
  addRiderRating(stars) {
    if (!Number.isInteger(stars) || stars < 1 || stars > 5) {
      throw new ValidationError('A rating must be a whole number of stars from 1 to 5.');
    }
    this.#riderRatingSum += stars;
    this.#riderRatingCount += 1;
    this.touch();
  }

  /**
   * Lowers the reliability score, applied when a rider releases an accepted order
   * (FR-D8).
   *
   * @param {number} points - Points to deduct.
   * @returns {void}
   */
  penaliseReliability(points) {
    this.#reliabilityScore = Math.max(0, this.#reliabilityScore - points);
    this.touch();
  }

  /**
   * Checks own invariants.
   *
   * @returns {void} Returns nothing when the entity is consistent.
   * @throws {ValidationError} When the owning account is missing.
   */
  validate() {
    if (!this.#userId) {
      throw new ValidationError('A student profile must belong to an account.');
    }
  }

  /**
   * Row shape for the `student_profiles` table.
   *
   * @returns {import('@hungry-ju/shared/types').PersistenceRow} Row for the repository.
   */
  toPersistence() {
    return {
      ...this.baseRow(),
      user_id: this.#userId,
      hall_name: this.#hallName,
      room_no: this.#roomNo,
      is_delivery_enabled: this.#isDeliveryEnabled,
      rider_rating_sum: this.#riderRatingSum,
      rider_rating_count: this.#riderRatingCount,
      reliability_score: this.#reliabilityScore,
    };
  }

  /**
   * Client-safe projection.
   *
   * @returns {Record<string, unknown>} Serialisable profile.
   */
  toJSON() {
    return {
      id: this.id,
      userId: this.#userId,
      hallName: this.#hallName,
      roomNo: this.#roomNo,
      isDeliveryEnabled: this.#isDeliveryEnabled,
      riderRatingAverage: this.riderRatingAverage,
      riderRatingCount: this.#riderRatingCount,
      reliabilityScore: this.#reliabilityScore,
    };
  }

  /**
   * Rebuilds a profile from a stored row.
   *
   * @param {import('@hungry-ju/shared/types').PersistenceRow} row - Row from storage.
   * @returns {StudentProfile} Hydrated profile.
   */
  static fromPersistence(row) {
    return new StudentProfile({
      id: row.id,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      userId: row.user_id,
      hallName: row.hall_name,
      roomNo: row.room_no,
      isDeliveryEnabled: Boolean(row.is_delivery_enabled),
      riderRatingSum: row.rider_rating_sum ?? 0,
      riderRatingCount: row.rider_rating_count ?? 0,
      reliabilityScore: row.reliability_score ?? 100,
    });
  }
}
