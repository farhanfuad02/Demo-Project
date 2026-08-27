/**
 * @file Server-side record of an issued token.
 *
 * @module models/auth-token
 */

import { BaseModel } from '../core/base-model.js';
import { ValidationError } from '../core/errors/app-error.js';

/**
 * A refresh, verification, or password-reset token that the server can revoke.
 *
 * A JWT alone cannot be taken back, so "log out invalidates the session" (FR-A9) and
 * "reset links are single use" (SRS section 9) both need a row somewhere. Only the hash
 * is stored: a leaked database should not hand the attacker working reset links.
 *
 * @augments BaseModel
 */
export class AuthToken extends BaseModel {
  /** @type {string} */
  #userId;

  /** @type {string} */
  #type;

  /** @type {string} */
  #tokenHash;

  /** @type {Date} */
  #expiresAt;

  /** @type {Date | null} */
  #consumedAt;

  /**
   * @param {object} attributes - Token columns.
   * @param {string | null} [attributes.id] - Primary key.
   * @param {Date | string | null} [attributes.createdAt] - Creation timestamp.
   * @param {Date | string | null} [attributes.updatedAt] - Last write timestamp.
   * @param {string} attributes.userId - Account the token belongs to.
   * @param {string} attributes.type - Purpose, from `TOKEN_TYPE`.
   * @param {string} attributes.tokenHash - SHA-256 hash of the issued token.
   * @param {Date | string} attributes.expiresAt - When the token stops working.
   * @param {Date | string | null} [attributes.consumedAt] - When it was used or revoked.
   */
  constructor({ id, createdAt, updatedAt, userId, type, tokenHash, expiresAt, consumedAt = null }) {
    super({ id, createdAt, updatedAt });
    this.#userId = userId;
    this.#type = type;
    this.#tokenHash = tokenHash;
    this.#expiresAt = new Date(expiresAt);
    this.#consumedAt = consumedAt ? new Date(consumedAt) : null;
  }

  /**
   * Account the token belongs to.
   *
   * @returns {string} User id.
   */
  get userId() {
    return this.#userId;
  }

  /**
   * Purpose of the token.
   *
   * @returns {string} Token type.
   */
  get type() {
    return this.#type;
  }

  /**
   * Whether the token still works: not expired and not already used.
   *
   * @returns {boolean} `true` while usable.
   */
  get isUsable() {
    return this.#consumedAt === null && this.#expiresAt.getTime() > Date.now();
  }

  /**
   * Marks the token as spent, so a replayed reset link fails.
   *
   * @returns {void}
   */
  consume() {
    this.#consumedAt = new Date();
    this.touch();
  }

  /**
   * Checks own invariants.
   *
   * @returns {void} Returns nothing when the entity is consistent.
   * @throws {ValidationError} When the owner or the hash is missing.
   */
  validate() {
    if (!this.#userId || !this.#tokenHash || !this.#type) {
      throw new ValidationError('A token must record its owner, purpose, and hash.');
    }
  }

  /**
   * Row shape for the `auth_tokens` table.
   *
   * @returns {import('@hungry-ju/shared/types').PersistenceRow} Row for the repository.
   */
  toPersistence() {
    return {
      ...this.baseRow(),
      user_id: this.#userId,
      type: this.#type,
      token_hash: this.#tokenHash,
      expires_at: this.#expiresAt.toISOString(),
      consumed_at: this.#consumedAt ? this.#consumedAt.toISOString() : null,
    };
  }

  /**
   * Tokens are never serialised to a client; this exists so the contract of
   * `BaseModel` holds and an accidental serialisation leaks nothing.
   *
   * @returns {Record<string, unknown>} Identifier and purpose only.
   */
  toJSON() {
    return { id: this.id, type: this.#type, expiresAt: this.#expiresAt.toISOString() };
  }

  /**
   * Rebuilds a token record from a stored row.
   *
   * @param {import('@hungry-ju/shared/types').PersistenceRow} row - Row from storage.
   * @returns {AuthToken} Hydrated record.
   */
  static fromPersistence(row) {
    return new AuthToken({
      id: row.id,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      userId: row.user_id,
      type: row.type,
      tokenHash: row.token_hash,
      expiresAt: row.expires_at,
      consumedAt: row.consumed_at,
    });
  }
}
