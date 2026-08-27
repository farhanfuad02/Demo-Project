/**
 * @file Data access for tunable platform parameters.
 *
 * @module repositories/system-config-repository
 */

import { BaseRepository } from '../core/base-repository.js';
import { SystemConfig } from '../models/system-config.js';

/**
 * Reads and writes the `system_config` table.
 *
 * @augments BaseRepository<SystemConfig>
 */
export class SystemConfigRepository extends BaseRepository {
  /**
   * @param {import('../config/database/database.js').Database} db - Database client.
   */
  constructor(db) {
    super(db, 'system_config');
  }

  /**
   * Reads one parameter, falling back to the compiled-in default when it was never set.
   *
   * @param {string} key - Parameter name.
   * @param {unknown} fallback - Value to use when the key is absent.
   * @returns {Promise<unknown>} The stored value, or the fallback.
   */
  async valueOf(key, fallback) {
    const entry = await this.findOne({ config_key: key });
    return entry ? entry.value : fallback;
  }

  /**
   * Writes one parameter, creating it when it does not exist yet.
   *
   * @param {string} key - Parameter name.
   * @param {unknown} value - New value.
   * @param {string} adminUserId - Admin making the change.
   * @returns {Promise<SystemConfig>} The stored entry.
   */
  async put(key, value, adminUserId) {
    const existing = await this.findOne({ config_key: key });
    if (!existing) {
      return this.create(new SystemConfig({ key, value, updatedByUserId: adminUserId }));
    }
    existing.setValue(value, adminUserId);
    return this.save(existing);
  }

  /**
   * Every parameter, as a plain object for the admin config screen.
   *
   * @returns {Promise<Record<string, unknown>>} Values keyed by parameter name.
   */
  async all() {
    const entries = await this.findMany({});
    return Object.fromEntries(entries.map((entry) => [entry.key, entry.value]));
  }

  /**
   * Maps a stored row onto a config entry.
   *
   * @param {import('@hungry-ju/shared/types').PersistenceRow} row - Row from storage.
   * @returns {SystemConfig} Hydrated entry.
   */
  toModel(row) {
    return SystemConfig.fromPersistence(row);
  }
}
