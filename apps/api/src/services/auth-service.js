/**
 * @file Registration, verification, sign-in, sign-out, and password reset.
 *
 * @module services/auth-service
 */

import { AUDIT_ACTION, AUDIT_ENTITY, TOKEN_TYPE, USER_ROLE } from '@hungry-ju/shared/enums';
import { AUTH } from '@hungry-ju/shared/constants';
import { BaseService } from '../core/base-service.js';
import {
  ConflictError,
  ForbiddenError,
  UnauthorizedError,
  ValidationError,
} from '../core/errors/app-error.js';
import { UserFactory } from '../models/user-factory.js';
import { HallPolicy } from './hall-policy.js';

/**
 * Registration payload accepted from the client (FR-A1).
 *
 * @typedef {object} RegistrationPayload
 * @property {string} fullName - Display name.
 * @property {string} [email] - Login e-mail; must be unused (BR-01).
 * @property {string} [phone] - Contact phone; must be unused (BR-01).
 * @property {string} password - Plaintext password, checked against FR-A3 rules.
 * @property {import('@hungry-ju/shared/types').UserRole} [role] - Account type to create.
 * @property {string} [gender] - `male` or `female`; decides which halls are on offer.
 * @property {string} [hallName] - Residence hall code, for students.
 * @property {string} [roomNo] - Room or gate, for students.
 */

/**
 * What a successful sign-in hands back to the controller.
 *
 * @typedef {object} AuthSession
 * @property {import('../models/user.js').User} user - Authenticated account.
 * @property {string} accessToken - Short-lived bearer token.
 * @property {string} refreshToken - Refresh token for the httpOnly cookie.
 */

/**
 * Epic A: everything about proving who someone is.
 *
 * @augments BaseService
 */
export class AuthService extends BaseService {
  /** @type {import('../repositories/user-repository.js').UserRepository} */
  #userRepository;

  /** @type {import('../repositories/student-profile-repository.js').StudentProfileRepository} */
  #studentProfileRepository;

  /** @type {import('../repositories/shop-repository.js').ShopRepository} */
  #shopRepository;

  /** @type {import('./password-service.js').PasswordService} */
  #passwordService;

  /** @type {import('./token-service.js').TokenService} */
  #tokenService;

  /** @type {import('./email-service.js').EmailService} */
  #emailService;

  /** @type {import('./audit-service.js').AuditService} */
  #auditService;

  /**
   * @param {object} dependencies - Injected collaborators.
   * @param {import('../repositories/user-repository.js').UserRepository} dependencies.userRepository -
   *   Account storage.
   * @param {import('../repositories/student-profile-repository.js').StudentProfileRepository} dependencies.studentProfileRepository -
   *   Student profile storage.
   * @param {import('../repositories/shop-repository.js').ShopRepository} dependencies.shopRepository -
   *   Used to attach a vendor's shop to the actor.
   * @param {import('./password-service.js').PasswordService} dependencies.passwordService -
   *   Hashing and strength rules.
   * @param {import('./token-service.js').TokenService} dependencies.tokenService - Session tokens.
   * @param {import('./email-service.js').EmailService} dependencies.emailService - Outbound mail.
   * @param {import('./audit-service.js').AuditService} dependencies.auditService - Audit trail.
   */
  constructor({
    userRepository,
    studentProfileRepository,
    shopRepository,
    passwordService,
    tokenService,
    emailService,
    auditService,
  }) {
    super();
    this.#userRepository = userRepository;
    this.#studentProfileRepository = studentProfileRepository;
    this.#shopRepository = shopRepository;
    this.#passwordService = passwordService;
    this.#tokenService = tokenService;
    this.#emailService = emailService;
    this.#auditService = auditService;
  }

  /**
   * Registers an account and sends the verification link.
   *
   * Admin accounts cannot be created here at any price: an open endpoint that mints a
   * role able to suspend every user and cancel every order would be the largest hole in
   * the system, so admins are seeded instead.
   *
   * @param {RegistrationPayload} payload - Validated registration fields.
   * @returns {Promise<{ user: import('../models/user.js').User, verificationLink: string }>} The
   *   pending account and the link that activates it.
   * @throws {ConflictError} When the e-mail or phone number is already registered (BR-01).
   * @throws {ForbiddenError} When an admin account is requested.
   * @throws {ValidationError} When the hall does not belong to the stated gender.
   */
  async register(payload) {
    const role = payload.role ?? USER_ROLE.STUDENT;
    if (role === USER_ROLE.ADMIN) {
      throw new ForbiddenError('Admin accounts cannot be registered.');
    }

    const email = payload.email ? payload.email.trim().toLowerCase() : null;
    const phone = payload.phone ? payload.phone.trim() : null;
    if (await this.#userRepository.contactIsTaken({ email, phone })) {
      throw new ConflictError('That e-mail address or phone number is already registered.');
    }

    const gender = payload.gender ?? null;
    // Checked before the account is written, so a mismatched hall does not leave a
    // half-registered user behind for the student to trip over on their second attempt.
    HallPolicy.assertMatchesGender(payload.hallName, gender);

    const passwordHash = await this.#passwordService.hash(payload.password);
    const user = await this.#userRepository.create(
      UserFactory.create(role, {
        fullName: payload.fullName.trim(),
        email,
        phone,
        passwordHash,
        gender,
      })
    );

    if (role === USER_ROLE.STUDENT) {
      const profile = await this.#studentProfileRepository.findOrCreateByUserId(user.id);
      if (payload.hallName || payload.roomNo) {
        profile.updateLocation({ hallName: payload.hallName, roomNo: payload.roomNo });
        await this.#studentProfileRepository.save(profile);
      }
    }

    const token = await this.#tokenService.issueOpaqueToken(user, TOKEN_TYPE.VERIFICATION, 60 * 24);
    const verificationLink = await this.#emailService.sendVerification(user, token);

    await this.#auditService.record({
      actorUserId: user.id,
      entityType: AUDIT_ENTITY.USER,
      entityId: user.id,
      action: AUDIT_ACTION.CREATE,
      newValue: { role, status: user.status },
    });

    return { user, verificationLink };
  }

  /**
   * Consumes a verification token and activates the account (FR-A2).
   *
   * @param {string} verificationToken - Token from the e-mailed link.
   * @returns {Promise<import('../models/user.js').User>} The verified account.
   * @throws {UnauthorizedError} When the link is invalid or already used.
   */
  async verifyAccount(verificationToken) {
    const userId = await this.#tokenService.consumeOpaqueToken(
      verificationToken,
      TOKEN_TYPE.VERIFICATION
    );
    const user = await this.#userRepository.findByIdOrFail(userId, 'Account');
    user.markVerified();
    const verified = await this.#userRepository.save(user);

    await this.#auditService.record({
      actorUserId: user.id,
      entityType: AUDIT_ENTITY.USER,
      entityId: user.id,
      action: AUDIT_ACTION.UPDATE,
      newValue: { status: verified.status },
    });
    return verified;
  }

  /**
   * Re-sends the verification link.
   *
   * Answers the same way whether or not the account exists, so the endpoint cannot be
   * used to discover who is registered.
   *
   * @param {string} identifier - E-mail address or phone number.
   * @returns {Promise<string | null>} The link when one was sent, otherwise `null`.
   */
  async resendVerification(identifier) {
    const user = await this.#userRepository.findByIdentifier(identifier);
    if (!user || user.isActive || !user.email) {
      return null;
    }
    const token = await this.#tokenService.issueOpaqueToken(user, TOKEN_TYPE.VERIFICATION, 60 * 24);
    return this.#emailService.sendVerification(user, token);
  }

  /**
   * Signs a user in (FR-A4), counting failures and locking the account at the threshold
   * (FR-A6).
   *
   * Wrong password and unknown account produce the same message on purpose: telling an
   * attacker which half was right halves their work.
   *
   * @param {string} identifier - E-mail address or phone number.
   * @param {string} password - Plaintext password.
   * @returns {Promise<AuthSession>} Authenticated user plus the token pair.
   * @throws {UnauthorizedError} When the credentials do not match.
   * @throws {ForbiddenError} When the account is locked, unverified, or suspended.
   */
  async login(identifier, password) {
    const user = await this.#userRepository.findByIdentifier(identifier);
    if (!user) {
      throw new UnauthorizedError('E-mail, phone, or password is incorrect.');
    }
    if (user.isLocked) {
      throw new ForbiddenError(
        `Too many failed attempts. Try again after ${user.lockedUntil.toLocaleTimeString()}.`
      );
    }

    const matches = await this.#passwordService.verify(password, user.passwordHash);
    if (!matches) {
      const locked = user.recordFailedLogin();
      await this.#userRepository.save(user);
      if (locked) {
        throw new ForbiddenError(
          `Too many failed attempts. Your account is locked for ${AUTH.LOCKOUT_MINUTES} minutes.`
        );
      }
      throw new UnauthorizedError('E-mail, phone, or password is incorrect.');
    }

    if (!user.isActive) {
      throw new ForbiddenError(
        'Your account is not active yet. Check your e-mail for the verification link.'
      );
    }

    user.recordSuccessfulLogin();
    await this.#userRepository.save(user);

    const [accessToken, refreshToken] = await Promise.all([
      this.#tokenService.issueAccessToken(user),
      this.#tokenService.issueRefreshToken(user),
    ]);

    await this.#auditService.record({
      actorUserId: user.id,
      entityType: AUDIT_ENTITY.USER,
      entityId: user.id,
      action: AUDIT_ACTION.LOGIN,
    });

    return { user, accessToken, refreshToken };
  }

  /**
   * Ends the session by revoking the presented refresh token (FR-A9).
   *
   * @param {string} refreshToken - Token from the httpOnly cookie.
   * @returns {Promise<void>} Resolves once revoked.
   */
  async logout(refreshToken) {
    if (!refreshToken) {
      return;
    }
    try {
      const { record, payload } = await this.#tokenService.verifyRefreshToken(refreshToken);
      await this.#tokenService.revoke(record);
      await this.#auditService.record({
        actorUserId: payload.sub,
        entityType: AUDIT_ENTITY.USER,
        entityId: payload.sub,
        action: AUDIT_ACTION.LOGOUT,
      });
    } catch {
      // Signing out with a token that is already dead is the outcome the caller wanted.
    }
  }

  /**
   * Exchanges a refresh token for a fresh pair, rotating the old one out.
   *
   * Rotation matters: without it, a refresh token copied off a shared machine keeps
   * working for its full lifetime even after the owner signs out elsewhere.
   *
   * @param {string} refreshToken - Token from the httpOnly cookie.
   * @returns {Promise<AuthSession>} Replacement session.
   * @throws {UnauthorizedError} When the token is invalid, expired, or revoked.
   * @throws {ForbiddenError} When the account is no longer active.
   */
  async refreshSession(refreshToken) {
    const { payload, record } = await this.#tokenService.verifyRefreshToken(refreshToken);
    const user = await this.#userRepository.findByIdOrFail(payload.sub, 'Account');
    if (!user.isActive) {
      throw new ForbiddenError('This account is no longer active.');
    }

    await this.#tokenService.revoke(record);
    const [accessToken, replacement] = await Promise.all([
      this.#tokenService.issueAccessToken(user),
      this.#tokenService.issueRefreshToken(user),
    ]);
    return { user, accessToken, refreshToken: replacement };
  }

  /**
   * Starts the reset flow (FR-A5).
   *
   * Always resolves successfully, whether or not the account exists, so the endpoint
   * cannot enumerate users.
   *
   * @param {string} identifier - E-mail address or phone number.
   * @returns {Promise<string | null>} The link when one was sent, otherwise `null`.
   */
  async requestPasswordReset(identifier) {
    const user = await this.#userRepository.findByIdentifier(identifier);
    if (!user || !user.email) {
      return null;
    }
    const token = await this.#tokenService.issueOpaqueToken(
      user,
      TOKEN_TYPE.PASSWORD_RESET,
      AUTH.RESET_TOKEN_TTL_MIN
    );
    return this.#emailService.sendPasswordReset(user, token);
  }

  /**
   * Completes a reset with a single-use token, then ends every existing session so a
   * password change actually locks out whoever prompted it.
   *
   * @param {string} resetToken - Token from the e-mailed link.
   * @param {string} newPassword - Replacement password.
   * @returns {Promise<void>} Resolves once the password is changed.
   * @throws {UnauthorizedError} When the link is invalid or already used.
   */
  async resetPassword(resetToken, newPassword) {
    const userId = await this.#tokenService.consumeOpaqueToken(
      resetToken,
      TOKEN_TYPE.PASSWORD_RESET
    );
    const user = await this.#userRepository.findByIdOrFail(userId, 'Account');
    const passwordHash = await this.#passwordService.hash(newPassword);
    user.changePassword(passwordHash);
    await this.#userRepository.save(user);
    await this.#tokenService.revokeAllSessions(user.id);

    await this.#auditService.record({
      actorUserId: user.id,
      entityType: AUDIT_ENTITY.USER,
      entityId: user.id,
      action: AUDIT_ACTION.UPDATE,
      newValue: { passwordChanged: true },
    });
  }

  /**
   * Resolves the principal for the auth middleware.
   *
   * The account is re-read on every request rather than trusted from the token, so an
   * admin suspending someone takes effect immediately instead of whenever their access
   * token happens to expire.
   *
   * @param {string} accessToken - Raw bearer token.
   * @returns {Promise<import('@hungry-ju/shared/types').Actor>} The principal.
   * @throws {UnauthorizedError} When the token is invalid or the account is gone.
   * @throws {ForbiddenError} When the account is suspended or unverified.
   */
  async resolveActor(accessToken) {
    const payload = this.#tokenService.verifyAccessToken(accessToken);
    const user = await this.#userRepository.findById(payload.sub);
    if (!user) {
      throw new UnauthorizedError('This account no longer exists.');
    }
    if (!user.isActive) {
      throw new ForbiddenError('This account is not active.');
    }

    /** @type {import('@hungry-ju/shared/types').Actor} */
    const actor = { id: user.id, role: user.role, status: user.status };

    if (user.role === USER_ROLE.VENDOR) {
      const shop = await this.#shopRepository.findByOwner(user.id);
      actor.shopId = shop?.id;
    }
    if (user.role === USER_ROLE.STUDENT) {
      const profile = await this.#studentProfileRepository.findByUserId(user.id);
      actor.deliverModeOn = profile?.isDeliveryEnabled ?? false;
    }
    return actor;
  }
}
