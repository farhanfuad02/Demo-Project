/**
 * @file Data access for issued tokens.
 *
 * @module repositories/auth-token-repository
 */

import { BaseRepository } from '../core/base-repository.js';
import { AuthToken } from '../models/auth-token.js';

/**
 * Reads and writes the `auth_tokens` table.
 *
 * @augments BaseRepository<AuthToken>
 */
export class AuthTokenRepository extends BaseRepository {
  /**
   * @param {import('../config/database/database.js').Database} db - Database client.
   */
  constructor(db) {
    super(db, 'auth_tokens');
  }

  /**
   * Finds a usable token by its hash.
   *
   * The lookup is by hash and type together, so a verification token cannot be
   * presented at the password-reset endpoint even if the raw string is known.
   *
   * @param {string} tokenHash - Hash of the presented token.
   * @param {string} type - Expected purpose.
   * @returns {Promise<AuthToken | null>} Token record, or `null`.
   */
  async findUsable(tokenHash, type) {
    const record = await this.findOne({ token_hash: tokenHash, type });
    return record && record.isUsable ? record : null;
  }

  /**
   * Marks every token of a type belonging to a user as spent.
   *
   * Signing out revokes the whole family rather than one row, so a session restored
   * from a second tab cannot outlive the logout the user just performed (FR-A9).
   *
   * @param {string} userId - Account whose tokens to revoke.
   * @param {string} type - Purpose to revoke.
   * @returns {Promise<number>} Number of tokens revoked.
   */
  async revokeAllForUser(userId, type) {
    const tokens = await this.findMany({ user_id: userId, type, consumed_at: null });
    for (const token of tokens) {
      token.consume();
      await this.save(token);
    }
    return tokens.length;
  }

  /**
   * Removes tokens that expired before the given moment.
   *
   * @param {Date} [before] - Cut-off; defaults to now.
   * @returns {Promise<number>} Number of rows removed.
   */
  async purgeExpired(before = new Date()) {
    return this.db.deleteWhere(this.table, { expires_at: { $lt: before.toISOString() } });
  }

  /**
   * Maps a stored row onto a token record.
   *
   * @param {import('@hungry-ju/shared/types').PersistenceRow} row - Row from storage.
   * @returns {AuthToken} Hydrated record.
   */
  toModel(row) {
    return AuthToken.fromPersistence(row);
  }
}
