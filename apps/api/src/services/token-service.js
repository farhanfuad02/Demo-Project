/**
 * @file Session tokens: signing, verification, and revocable records.
 *
 * @module services/token-service
 */

import { createHash } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { TOKEN_TYPE } from '@hungry-ju/shared/enums';
import { AUTH } from '@hungry-ju/shared/constants';
import { BaseService } from '../core/base-service.js';
import { UnauthorizedError } from '../core/errors/app-error.js';
import { AuthToken } from '../models/auth-token.js';
import { Identifier } from '../utils/identifier.js';

/**
 * Issues and validates the tokens a session is made of.
 *
 * Access tokens are stateless JWTs, kept short-lived so a compromised one expires on its
 * own. Everything long-lived — refresh, verification, reset — also gets a row, because
 * only a stored record can be revoked, and FR-A9 requires logging out to actually end a
 * session. What is stored is the SHA-256 of the token, never the token: a stolen
 * database should not yield working refresh tokens.
 *
 * @augments BaseService
 */
export class TokenService extends BaseService {
  /** @type {string} */
  #accessSecret;

  /** @type {string} */
  #refreshSecret;

  /** @type {import('../repositories/auth-token-repository.js').AuthTokenRepository} */
  #authTokenRepository;

  /**
   * @param {object} dependencies - Injected collaborators.
   * @param {string} dependencies.accessSecret - Signing key for access tokens.
   * @param {string} dependencies.refreshSecret - Signing key for refresh tokens.
   * @param {import('../repositories/auth-token-repository.js').AuthTokenRepository} dependencies.authTokenRepository -
   *   Storage for revocable tokens.
   */
  constructor({ accessSecret, refreshSecret, authTokenRepository }) {
    super();
    this.#accessSecret = accessSecret;
    this.#refreshSecret = refreshSecret;
    this.#authTokenRepository = authTokenRepository;
  }

  /**
   * Hashes a token for storage and lookup.
   *
   * @param {string} token - Raw token.
   * @returns {string} Hex SHA-256 digest.
   */
  static hash(token) {
    return createHash('sha256').update(token).digest('hex');
  }

  /**
   * Signs a short-lived access token (NFR-06).
   *
   * @param {import('../models/user.js').User} user - Account signing in.
   * @returns {string} Signed JWT.
   */
  issueAccessToken(user) {
    return jwt.sign(
      { sub: user.id, role: user.role, status: user.status, type: TOKEN_TYPE.ACCESS },
      this.#accessSecret,
      { expiresIn: AUTH.ACCESS_TOKEN_TTL }
    );
  }

  /**
   * Signs a refresh token and stores its hash so it can be revoked.
   *
   * The payload carries a unique `jti`. Without it, two tokens minted for the same user
   * within the same second are byte-identical — and since revocation is keyed on the
   * token's hash, rotating a token would revoke its own replacement.
   *
   * @param {import('../models/user.js').User} user - Account signing in.
   * @returns {Promise<string>} Signed JWT.
   */
  async issueRefreshToken(user) {
    const token = jwt.sign(
      { sub: user.id, type: TOKEN_TYPE.REFRESH, jti: Identifier.uuid() },
      this.#refreshSecret,
      { expiresIn: AUTH.REFRESH_TOKEN_TTL }
    );
    const { exp } = jwt.decode(token);
    await this.#authTokenRepository.create(
      new AuthToken({
        userId: user.id,
        type: TOKEN_TYPE.REFRESH,
        tokenHash: TokenService.hash(token),
        expiresAt: new Date(exp * 1000),
      })
    );
    return token;
  }

  /**
   * Reads and checks an access token.
   *
   * @param {string} token - Raw bearer token.
   * @returns {{ sub: string, role: string, status: string }} Decoded payload.
   * @throws {UnauthorizedError} When the token is missing, expired, or not an access token.
   */
  verifyAccessToken(token) {
    try {
      const payload = jwt.verify(token, this.#accessSecret);
      if (payload.type !== TOKEN_TYPE.ACCESS) {
        throw new UnauthorizedError('Wrong token type.');
      }
      return payload;
    } catch {
      throw new UnauthorizedError('Your session has expired. Please sign in again.');
    }
  }

  /**
   * Reads a refresh token and confirms its stored record is still usable.
   *
   * @param {string} token - Raw refresh token.
   * @returns {Promise<{ payload: { sub: string }, record: AuthToken }>} Payload and record.
   * @throws {UnauthorizedError} When the token is invalid, expired, or already revoked.
   */
  async verifyRefreshToken(token) {
    let payload;
    try {
      payload = jwt.verify(token, this.#refreshSecret);
    } catch {
      throw new UnauthorizedError('Your session has expired. Please sign in again.');
    }
    const record = await this.#authTokenRepository.findUsable(
      TokenService.hash(token),
      TOKEN_TYPE.REFRESH
    );
    if (!record) {
      throw new UnauthorizedError('This session is no longer valid.');
    }
    return { payload, record };
  }

  /**
   * Issues an opaque single-use token for e-mail verification or password reset.
   *
   * These are random strings rather than JWTs: they travel in a URL that people paste
   * into chat windows, and a random string leaks nothing about the account if it does.
   *
   * @param {import('../models/user.js').User} user - Account the link is for.
   * @param {string} type - Purpose, from `TOKEN_TYPE`.
   * @param {number} ttlMinutes - Lifetime in minutes.
   * @returns {Promise<string>} The raw token to put in the link.
   */
  async issueOpaqueToken(user, type, ttlMinutes) {
    const token = Identifier.token();
    await this.#authTokenRepository.create(
      new AuthToken({
        userId: user.id,
        type,
        tokenHash: TokenService.hash(token),
        expiresAt: new Date(Date.now() + ttlMinutes * 60_000),
      })
    );
    return token;
  }

  /**
   * Consumes a single-use token, so a replayed link fails.
   *
   * @param {string} token - Raw token from the link.
   * @param {string} type - Expected purpose.
   * @returns {Promise<string>} Id of the account the token belonged to.
   * @throws {UnauthorizedError} When the token is unknown, expired, or already used.
   */
  async consumeOpaqueToken(token, type) {
    const record = await this.#authTokenRepository.findUsable(TokenService.hash(token), type);
    if (!record) {
      throw new UnauthorizedError('This link is invalid or has already been used.');
    }
    record.consume();
    await this.#authTokenRepository.save(record);
    return record.userId;
  }

  /**
   * Revokes a refresh token record, which is what signing out does (FR-A9).
   *
   * @param {AuthToken} record - Stored record to revoke.
   * @returns {Promise<void>} Resolves once revoked.
   */
  async revoke(record) {
    record.consume();
    await this.#authTokenRepository.save(record);
  }

  /**
   * Revokes every refresh token of an account, used when a password changes or an
   * admin suspends the user.
   *
   * @param {string} userId - Account whose sessions to end.
   * @returns {Promise<number>} Number of sessions ended.
   */
  async revokeAllSessions(userId) {
    return this.#authTokenRepository.revokeAllForUser(userId, TOKEN_TYPE.REFRESH);
  }
}
