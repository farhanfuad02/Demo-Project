/**
 * @file Data access for the audit trail.
 *
 * @module repositories/audit-log-repository
 */

import { BaseRepository } from '../core/base-repository.js';
import { AuditLog } from '../models/audit-log.js';

/**
 * Reads and writes the `audit_logs` table.
 *
 * There is deliberately no update or delete path exposed beyond what `BaseRepository`
 * provides: a trail that can be edited is not evidence of anything (NFR-13).
 *
 * @augments BaseRepository<AuditLog>
 */
export class AuditLogRepository extends BaseRepository {
  /**
   * @param {import('../config/database/database.js').Database} db - Database client.
   */
  constructor(db) {
    super(db, 'audit_logs');
  }

  /**
   * Everything that ever happened to one entity, for a dispute investigation.
   *
   * @param {string} entityType - Entity family.
   * @param {string} entityId - Entity id.
   * @returns {Promise<AuditLog[]>} Entries.
   */
  async findForEntity(entityType, entityId) {
    return this.findMany({ entity_type: entityType, entity_id: entityId });
  }

  /**
   * The admin audit viewer feed.
   *
   * @param {import('@hungry-ju/shared/types').Criteria} [criteria] - Optional filter.
   * @param {import('../utils/query-options.js').QueryOptions} [options] - Sort/page window.
   * @returns {Promise<AuditLog[]>} Entries.
   */
  async findRecent(criteria = {}, options = undefined) {
    return this.findMany(criteria, options);
  }

  /**
   * Maps a stored row onto an entry.
   *
   * @param {import('@hungry-ju/shared/types').PersistenceRow} row - Row from storage.
   * @returns {AuditLog} Hydrated entry.
   */
  toModel(row) {
    return AuditLog.fromPersistence(row);
  }
}
