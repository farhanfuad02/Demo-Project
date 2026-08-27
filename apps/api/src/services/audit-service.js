/**
 * @file Records state changes to the audit trail.
 *
 * @module services/audit-service
 */

import { AUDIT_ACTION } from '@hungry-ju/shared/enums';
import { BaseService } from '../core/base-service.js';
import { AuditLog } from '../models/audit-log.js';

/**
 * Writes the audit trail (BR-09, NFR-13).
 *
 * Every other service depends on this one rather than writing rows itself, so "who
 * changed this order and when" has exactly one answer and one format.
 *
 * @augments BaseService
 */
export class AuditService extends BaseService {
  /** @type {import('../repositories/audit-log-repository.js').AuditLogRepository} */
  #auditLogRepository;

  /** @type {import('../lib/logger.js').Logger} */
  #logger;

  /**
   * @param {object} dependencies - Injected collaborators.
   * @param {import('../repositories/audit-log-repository.js').AuditLogRepository} dependencies.auditLogRepository -
   *   Trail storage.
   * @param {import('../lib/logger.js').Logger} dependencies.logger - Fallback output.
   */
  constructor({ auditLogRepository, logger }) {
    super();
    this.#auditLogRepository = auditLogRepository;
    this.#logger = logger;
  }

  /**
   * Records one change.
   *
   * A failure to write the trail is logged but never thrown: losing an audit line is
   * bad, and failing a delivered order because of it is worse.
   *
   * @param {object} entry - What happened.
   * @param {string | null} entry.actorUserId - Who acted; `null` for the scheduler.
   * @param {string} entry.entityType - Entity family.
   * @param {string} entry.entityId - Entity id.
   * @param {string} entry.action - Kind of change.
   * @param {unknown} [entry.oldValue] - State before.
   * @param {unknown} [entry.newValue] - State after.
   * @returns {Promise<void>} Resolves once written or logged.
   */
  async record({ actorUserId, entityType, entityId, action, oldValue = null, newValue = null }) {
    try {
      await this.#auditLogRepository.create(
        new AuditLog({ actorUserId, entityType, entityId, action, oldValue, newValue })
      );
    } catch (error) {
      this.#logger.error('Failed to write audit entry', {
        entityType,
        entityId,
        action,
        reason: error.message,
      });
    }
  }

  /**
   * Records a lifecycle transition, the most common entry by far.
   *
   * @param {object} entry - What moved.
   * @param {string | null} entry.actorUserId - Who acted.
   * @param {string} entry.entityType - Entity family.
   * @param {string} entry.entityId - Entity id.
   * @param {string} entry.from - Status before.
   * @param {string} entry.to - Status after.
   * @returns {Promise<void>} Resolves once written.
   */
  async recordTransition({ actorUserId, entityType, entityId, from, to }) {
    await this.record({
      actorUserId,
      entityType,
      entityId,
      action: AUDIT_ACTION.STATUS_CHANGE,
      oldValue: { status: from },
      newValue: { status: to },
    });
  }
}
