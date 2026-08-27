/**
 * @file Admin-tunable system parameter.
 *
 * @module models/system-config
 */

import { BaseModel } from '../core/base-model.js';
import { ValidationError } from '../core/errors/app-error.js';

/**
 * One tunable platform parameter (FR-G6): delivery fee, cancellation window, vendor
 * accept timeout.
 *
 * These live in the database rather than in `constants` because an admin has to change
 * the delivery fee during a rainy lunch peak (risk R1) without a redeploy. The constants
 * remain the defaults used when a key has never been set.
 *
 * @augments BaseModel
 */
export class SystemConfig extends BaseModel {
  /** @type {string} */
  #key;

  /** @type {unknown} */
  #value;

  /** @type {string | null} */
  #updatedByUserId;

  /**
   * @param {object} attributes - Config columns.
   * @param {string | null} [attributes.id] - Primary key.
   * @param {Date | string | null} [attributes.createdAt] - Creation timestamp.
   * @param {Date | string | null} [attributes.updatedAt] - Last write timestamp.
   * @param {string} attributes.key - Parameter name.
   * @param {unknown} attributes.value - Parameter value.
   * @param {string | null} [attributes.updatedByUserId] - Admin who last changed it.
   */
  constructor({ id, createdAt, updatedAt, key, value, updatedByUserId = null }) {
    super({ id, createdAt, updatedAt });
    this.#key = key;
    this.#value = value;
    this.#updatedByUserId = updatedByUserId;
  }

  /**
   * Parameter name.
   *
   * @returns {string} Key.
   */
  get key() {
    return this.#key;
  }

  /**
   * Parameter value.
   *
   * @returns {unknown} Value.
   */
  get value() {
    return this.#value;
  }

  /**
   * Records a new value and who set it.
   *
   * @param {unknown} value - New value.
   * @param {string} adminUserId - Admin making the change.
   * @returns {void}
   */
  setValue(value, adminUserId) {
    this.#value = value;
    this.#updatedByUserId = adminUserId;
    this.touch();
  }

  /**
   * Checks own invariants.
   *
   * @returns {void} Returns nothing when the entity is consistent.
   * @throws {ValidationError} When the key is missing.
   */
  validate() {
    if (!this.#key) {
      throw new ValidationError('A configuration entry must have a key.');
    }
  }

  /**
   * Row shape for the `system_config` table.
   *
   * @returns {import('@hungry-ju/shared/types').PersistenceRow} Row for the repository.
   */
  toPersistence() {
    return {
      ...this.baseRow(),
      config_key: this.#key,
      config_value: JSON.stringify(this.#value),
      updated_by_user_id: this.#updatedByUserId,
    };
  }

  /**
   * Client-safe projection.
   *
   * @returns {Record<string, unknown>} Serialisable entry.
   */
  toJSON() {
    return {
      id: this.id,
      key: this.#key,
      value: this.#value,
      updatedAt: this.updatedAt.toISOString(),
    };
  }

  /**
   * Rebuilds an entry from a stored row.
   *
   * @param {import('@hungry-ju/shared/types').PersistenceRow} row - Row from storage.
   * @returns {SystemConfig} Hydrated entry.
   */
  static fromPersistence(row) {
    return new SystemConfig({
      id: row.id,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      key: row.config_key,
      value: row.config_value === null ? null : JSON.parse(row.config_value),
      updatedByUserId: row.updated_by_user_id,
    });
  }
}
