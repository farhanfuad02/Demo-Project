/**
 * @file Audit log entry.
 *
 * @module models/audit-log
 */

import { BaseModel } from '../core/base-model.js';
import { ValidationError } from '../core/errors/app-error.js';

/**
 * One recorded state change: who did what to which entity, and when (BR-09, NFR-13).
 *
 * Implemented once, here, instead of as an "all actions are logged" sentence repeated in
 * every user story. When a student and a rider disagree about an order, this table is
 * the only account of what actually happened.
 *
 * @augments BaseModel
 */
export class AuditLog extends BaseModel {
  /** @type {string | null} */
  #actorUserId;

  /** @type {string} */
  #entityType;

  /** @type {string} */
  #entityId;

  /** @type {string} */
  #action;

  /** @type {unknown} */
  #oldValue;

  /** @type {unknown} */
  #newValue;

  /**
   * @param {object} attributes - Log columns.
   * @param {string | null} [attributes.id] - Primary key.
   * @param {Date | string | null} [attributes.createdAt] - Creation timestamp.
   * @param {Date | string | null} [attributes.updatedAt] - Last write timestamp.
   * @param {string | null} [attributes.actorUserId] - Who acted; `null` for the scheduler.
   * @param {string} attributes.entityType - Entity family touched.
   * @param {string} attributes.entityId - Entity touched.
   * @param {string} attributes.action - What kind of change it was.
   * @param {unknown} [attributes.oldValue] - State before.
   * @param {unknown} [attributes.newValue] - State after.
   */
  constructor({
    id,
    createdAt,
    updatedAt,
    actorUserId = null,
    entityType,
    entityId,
    action,
    oldValue = null,
    newValue = null,
  }) {
    super({ id, createdAt, updatedAt });
    this.#actorUserId = actorUserId;
    this.#entityType = entityType;
    this.#entityId = entityId;
    this.#action = action;
    this.#oldValue = oldValue;
    this.#newValue = newValue;
  }

  /**
   * Who acted.
   *
   * @returns {string | null} User id, or `null` when the system acted on its own.
   */
  get actorUserId() {
    return this.#actorUserId;
  }

  /**
   * Entity family touched.
   *
   * @returns {string} Entity type.
   */
  get entityType() {
    return this.#entityType;
  }

  /**
   * Entity touched.
   *
   * @returns {string} Entity id.
   */
  get entityId() {
    return this.#entityId;
  }

  /**
   * What kind of change it was.
   *
   * @returns {string} Action.
   */
  get action() {
    return this.#action;
  }

  /**
   * Checks own invariants.
   *
   * @returns {void} Returns nothing when the entity is consistent.
   * @throws {ValidationError} When the subject of the change is missing.
   */
  validate() {
    if (!this.#entityType || !this.#entityId || !this.#action) {
      throw new ValidationError('An audit entry must record the entity and the action.');
    }
  }

  /**
   * Row shape for the `audit_logs` table.
   *
   * @returns {import('@hungry-ju/shared/types').PersistenceRow} Row for the repository.
   */
  toPersistence() {
    return {
      ...this.baseRow(),
      actor_user_id: this.#actorUserId,
      entity_type: this.#entityType,
      entity_id: this.#entityId,
      action: this.#action,
      old_value: this.#oldValue === null ? null : JSON.stringify(this.#oldValue),
      new_value: this.#newValue === null ? null : JSON.stringify(this.#newValue),
    };
  }

  /**
   * Projection for the admin audit viewer.
   *
   * @returns {Record<string, unknown>} Serialisable entry.
   */
  toJSON() {
    return {
      id: this.id,
      actorUserId: this.#actorUserId,
      entityType: this.#entityType,
      entityId: this.#entityId,
      action: this.#action,
      oldValue: this.#oldValue,
      newValue: this.#newValue,
      createdAt: this.createdAt.toISOString(),
    };
  }

  /**
   * Rebuilds an entry from a stored row.
   *
   * @param {import('@hungry-ju/shared/types').PersistenceRow} row - Row from storage.
   * @returns {AuditLog} Hydrated entry.
   */
  static fromPersistence(row) {
    return new AuditLog({
      id: row.id,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      actorUserId: row.actor_user_id,
      entityType: row.entity_type,
      entityId: row.entity_id,
      action: row.action,
      oldValue: row.old_value ? JSON.parse(row.old_value) : null,
      newValue: row.new_value ? JSON.parse(row.new_value) : null,
    });
  }
}
