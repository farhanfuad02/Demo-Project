/**
 * @file Unit tests for PasswordService, TokenService, EmailService, and AuthService.
 *
 * @module tests/unit/services/auth-services
 */

import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { TOKEN_TYPE, USER_ROLE, USER_STATUS } from '@hungry-ju/shared/enums';
import { AUTH } from '@hungry-ju/shared/constants';
import { TOKENS } from '../../../src/config/container.js';
import { EmailService, ConsoleEmailService } from '../../../src/services/email-service.js';
import { PasswordService } from '../../../src/services/password-service.js';
import { TokenService } from '../../../src/services/token-service.js';
import { Logger } from '../../../src/lib/logger.js';
import {
  ConflictError,
  ForbiddenError,
  UnauthorizedError,
  ValidationError,
} from '../../../src/core/errors/app-error.js';
import { makeContainer, makeUser } from '../../helpers/test-database.js';

/** A cheap cost factor: these tests care about the rules, not about bcrypt's speed. */
const FAST_COST = 4;

describe('PasswordService', () => {
  const service = new PasswordService({ cost: FAST_COST });

  describe('strength policy (FR-A3)', () => {
    it('accepts a password that meets every rule', () => {
      expect(() => service.assertStrong('Hungry@JU1')).not.toThrow();
    });

    it.each([
      ['Ab1@', 'too short'],
      ['hungry@ju1', 'no upper case'],
      ['HUNGRY@JU1', 'no lower case'],
      ['Hungry@JUx', 'no digit'],
      ['HungryJU123', 'no symbol'],
    ])('rejects %s (%s)', (password) => {
      expect(() => service.assertStrong(password)).toThrow(ValidationError);
    });

    it('reports every unmet rule at once rather than one at a time', () => {
      try {
        service.assertStrong('abc');
        throw new Error('should have thrown');
      } catch (error) {
        expect(error.message).toContain('8 characters');
        expect(error.message).toContain('uppercase');
        expect(error.message).toContain('digit');
      }
    });

    it('treats a missing password as failing every rule', () => {
      expect(() => service.assertStrong(undefined)).toThrow(ValidationError);
    });
  });

  it('hashes and verifies', async () => {
    const hash = await service.hash('Hungry@JU1');
    expect(hash).not.toBe('Hungry@JU1');
    expect(await service.verify('Hungry@JU1', hash)).toBe(true);
    expect(await service.verify('wrong', hash)).toBe(false);
  });

  it('refuses to hash a weak password', async () => {
    await expect(service.hash('weak')).rejects.toThrow(ValidationError);
  });

  it('hashes a generated secret without the strength policy', async () => {
    // A four-digit PIN cannot meet a password policy and does not need to.
    const hash = await service.hashSecret('1234');
    expect(await service.verify('1234', hash)).toBe(true);
  });

  it('answers false rather than throwing on missing input', async () => {
    expect(await service.verify('', 'hash')).toBe(false);
    expect(await service.verify('candidate', '')).toBe(false);
  });
});

describe('TokenService', () => {
  /** @type {import('../../../src/config/container.js').Container} */
  let container;
  /** @type {TokenService} */
  let service;
  /** @type {import('../../../src/models/user.js').User} */
  let user;

  beforeEach(async () => {
    ({ container } = await makeContainer());
    service = container.resolve(TOKENS.TOKEN_SERVICE);
    user = await makeUser(container);
  });

  it('hashes a token before storing it', () => {
    const hash = TokenService.hash('secret-token');
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).not.toContain('secret-token');
  });

  it('issues an access token carrying the role', () => {
    const token = service.issueAccessToken(user);
    const payload = service.verifyAccessToken(token);

    expect(payload.sub).toBe(user.id);
    expect(payload.role).toBe(USER_ROLE.STUDENT);
    expect(payload.type).toBe(TOKEN_TYPE.ACCESS);
  });

  it('refuses a garbled access token', () => {
    expect(() => service.verifyAccessToken('not-a-token')).toThrow(UnauthorizedError);
  });

  it('refuses a refresh token presented as an access token', async () => {
    const refresh = await service.issueRefreshToken(user);
    expect(() => service.verifyAccessToken(refresh)).toThrow(UnauthorizedError);
  });

  it('stores a refresh token so it can be revoked', async () => {
    const refresh = await service.issueRefreshToken(user);
    const { record } = await service.verifyRefreshToken(refresh);

    expect(record.userId).toBe(user.id);
    expect(record.isUsable).toBe(true);
  });

  it('refuses a refresh token after it has been revoked (FR-A9)', async () => {
    const refresh = await service.issueRefreshToken(user);
    const { record } = await service.verifyRefreshToken(refresh);
    await service.revoke(record);

    await expect(service.verifyRefreshToken(refresh)).rejects.toThrow(UnauthorizedError);
  });

  it('revokes every session of an account at once', async () => {
    await service.issueRefreshToken(user);
    await service.issueRefreshToken(user);
    expect(await service.revokeAllSessions(user.id)).toBe(2);
  });

  describe('single-use links', () => {
    it('consumes a verification token exactly once', async () => {
      const token = await service.issueOpaqueToken(user, TOKEN_TYPE.VERIFICATION, 60);
      expect(await service.consumeOpaqueToken(token, TOKEN_TYPE.VERIFICATION)).toBe(user.id);

      await expect(service.consumeOpaqueToken(token, TOKEN_TYPE.VERIFICATION)).rejects.toThrow(
        UnauthorizedError
      );
    });

    it('refuses a verification token presented at the reset endpoint', async () => {
      const token = await service.issueOpaqueToken(user, TOKEN_TYPE.VERIFICATION, 60);
      await expect(service.consumeOpaqueToken(token, TOKEN_TYPE.PASSWORD_RESET)).rejects.toThrow(
        UnauthorizedError
      );
    });

    it('refuses an expired token', async () => {
      const token = await service.issueOpaqueToken(user, TOKEN_TYPE.PASSWORD_RESET, -1);
      await expect(service.consumeOpaqueToken(token, TOKEN_TYPE.PASSWORD_RESET)).rejects.toThrow(
        UnauthorizedError
      );
    });
  });
});

describe('EmailService', () => {
  it('is abstract', () => {
    expect(() => new EmailService({ webAppUrl: 'http://localhost:3000' })).toThrow(TypeError);
  });

  it('builds a verification link the client can route on', async () => {
    const sent = [];
    const logger = new Logger({ level: 'silent' });
    const service = new ConsoleEmailService({ webAppUrl: 'http://localhost:3000', logger });
    jest.spyOn(service, 'send').mockImplementation(async (message) => {
      sent.push(message);
    });

    const link = await service.sendVerification(
      { fullName: 'Farhan', email: 'f@juniv.edu' },
      'tok en/+'
    );

    expect(link).toBe('http://localhost:3000/verify?token=tok%20en%2F%2B');
    expect(sent[0].to).toBe('f@juniv.edu');
  });

  it('says the reset link expires and works once', async () => {
    const logger = new Logger({ level: 'silent' });
    const service = new ConsoleEmailService({ webAppUrl: 'http://localhost:3000', logger });
    let captured;
    jest.spyOn(service, 'send').mockImplementation(async (message) => {
      captured = message;
    });

    await service.sendPasswordReset({ fullName: 'Farhan', email: 'f@juniv.edu' }, 'abc');
    expect(captured.html).toContain('15 minutes');
  });
});

describe('AuthService', () => {
  /** @type {import('../../../src/config/container.js').Container} */
  let container;
  /** @type {import('../../../src/services/auth-service.js').AuthService} */
  let service;

  /** A registration payload that satisfies every rule. */
  const validRegistration = {
    fullName: 'Farhan Fuad',
    email: 'farhan@juniv.edu',
    phone: '01700000004',
    password: 'Hungry@JU1',
    role: USER_ROLE.STUDENT,
  };

  beforeEach(async () => {
    ({ container } = await makeContainer());
    // Registration hashes a password, and the default cost makes the suite crawl.
    container.registerValue(TOKENS.PASSWORD_SERVICE, new PasswordService({ cost: FAST_COST }));
    service = container.resolve(TOKENS.AUTH_SERVICE);
  });

  describe('registration (FR-A1)', () => {
    it('creates a pending account and a verification link', async () => {
      const { user, verificationLink } = await service.register(validRegistration);

      expect(user.status).toBe(USER_STATUS.PENDING);
      expect(user.isActive).toBe(false);
      expect(verificationLink).toContain('/verify?token=');
    });

    it('creates a student profile alongside the account', async () => {
      const { user } = await service.register({
        ...validRegistration,
        hallName: 'Pritilata Hall',
        roomNo: '302',
      });
      const profile = await container
        .resolve(TOKENS.STUDENT_PROFILE_REPOSITORY)
        .findByUserId(user.id);

      expect(profile.hallName).toBe('Pritilata Hall');
    });

    it('refuses a duplicate e-mail (BR-01)', async () => {
      await service.register(validRegistration);
      await expect(
        service.register({ ...validRegistration, phone: '01799999999' })
      ).rejects.toThrow(ConflictError);
    });

    it('refuses a duplicate phone number (BR-01)', async () => {
      await service.register(validRegistration);
      await expect(
        service.register({ ...validRegistration, email: 'other@juniv.edu' })
      ).rejects.toThrow(ConflictError);
    });

    it('refuses to mint an admin account', async () => {
      await expect(
        service.register({ ...validRegistration, role: USER_ROLE.ADMIN })
      ).rejects.toThrow(ForbiddenError);
    });

    it('refuses a weak password', async () => {
      await expect(
        service.register({ ...validRegistration, password: 'password' })
      ).rejects.toThrow(ValidationError);
    });

    it('lower-cases the e-mail so BR-01 uniqueness is case-insensitive', async () => {
      const { user } = await service.register({ ...validRegistration, email: 'FARHAN@JUNIV.EDU' });
      expect(user.email).toBe('farhan@juniv.edu');
    });
  });

  describe('verification (FR-A2)', () => {
    it('activates the account', async () => {
      const { verificationLink } = await service.register(validRegistration);
      const token = new URL(verificationLink).searchParams.get('token');

      const verified = await service.verifyAccount(token);
      expect(verified.isActive).toBe(true);
    });

    it('refuses a link that has already been used', async () => {
      const { verificationLink } = await service.register(validRegistration);
      const token = new URL(verificationLink).searchParams.get('token');
      await service.verifyAccount(token);

      await expect(service.verifyAccount(token)).rejects.toThrow(UnauthorizedError);
    });
  });

  describe('sign-in (FR-A4, FR-A6)', () => {
    /**
     * Registers and verifies an account.
     *
     * @returns {Promise<import('../../../src/models/user.js').User>} The active account.
     */
    const activeAccount = async () => {
      const { verificationLink } = await service.register(validRegistration);
      return service.verifyAccount(new URL(verificationLink).searchParams.get('token'));
    };

    it('issues a token pair on the right password', async () => {
      await activeAccount();
      const session = await service.login('farhan@juniv.edu', 'Hungry@JU1');

      expect(session.accessToken).toBeTruthy();
      expect(session.refreshToken).toBeTruthy();
      expect(session.user.email).toBe('farhan@juniv.edu');
    });

    it('accepts the phone number as the identifier', async () => {
      await activeAccount();
      await expect(service.login('01700000004', 'Hungry@JU1')).resolves.toBeTruthy();
    });

    it('gives the same answer for a wrong password and an unknown account', async () => {
      await activeAccount();
      const wrongPassword = await service.login('farhan@juniv.edu', 'Wrong@JU1').catch((e) => e);
      const unknownAccount = await service.login('nobody@juniv.edu', 'Wrong@JU1').catch((e) => e);

      expect(wrongPassword.message).toBe(unknownAccount.message);
    });

    it('refuses an account that has not been verified', async () => {
      await service.register(validRegistration);
      await expect(service.login('farhan@juniv.edu', 'Hungry@JU1')).rejects.toThrow(ForbiddenError);
    });

    it('locks the account after the configured run of failures', async () => {
      await activeAccount();
      for (let attempt = 0; attempt < AUTH.MAX_FAILED_LOGINS - 1; attempt += 1) {
        await service.login('farhan@juniv.edu', 'Wrong@JU1').catch(() => {});
      }

      await expect(service.login('farhan@juniv.edu', 'Wrong@JU1')).rejects.toThrow(ForbiddenError);
      // Even the right password is refused while the lock stands.
      await expect(service.login('farhan@juniv.edu', 'Hungry@JU1')).rejects.toThrow(ForbiddenError);
    });

    it('resets the failure count after a success', async () => {
      const account = await activeAccount();
      await service.login('farhan@juniv.edu', 'Wrong@JU1').catch(() => {});
      await service.login('farhan@juniv.edu', 'Hungry@JU1');

      const reloaded = await container.resolve(TOKENS.USER_REPOSITORY).findById(account.id);
      expect(reloaded.failedLoginCount).toBe(0);
    });
  });

  describe('sessions', () => {
    /**
     * Signs in and returns the session.
     *
     * @returns {Promise<object>} The session.
     */
    const signIn = async () => {
      const { verificationLink } = await service.register(validRegistration);
      await service.verifyAccount(new URL(verificationLink).searchParams.get('token'));
      return service.login('farhan@juniv.edu', 'Hungry@JU1');
    };

    it('rotates the refresh token on every renewal', async () => {
      const session = await signIn();
      const renewed = await service.refreshSession(session.refreshToken);

      expect(renewed.refreshToken).not.toBe(session.refreshToken);
      // The old one is retired the moment it is exchanged.
      await expect(service.refreshSession(session.refreshToken)).rejects.toThrow(UnauthorizedError);
    });

    it('ends the session on sign-out', async () => {
      const session = await signIn();
      await service.logout(session.refreshToken);

      await expect(service.refreshSession(session.refreshToken)).rejects.toThrow(UnauthorizedError);
    });

    it('treats signing out with a dead token as success', async () => {
      await expect(service.logout('garbage')).resolves.toBeUndefined();
      await expect(service.logout(undefined)).resolves.toBeUndefined();
    });
  });

  describe('password reset (FR-A5)', () => {
    it('sets a new password and ends every existing session', async () => {
      const { verificationLink } = await service.register(validRegistration);
      await service.verifyAccount(new URL(verificationLink).searchParams.get('token'));
      const session = await service.login('farhan@juniv.edu', 'Hungry@JU1');

      const resetLink = await service.requestPasswordReset('farhan@juniv.edu');
      const token = new URL(resetLink).searchParams.get('token');
      await service.resetPassword(token, 'Brand@New9');

      await expect(service.login('farhan@juniv.edu', 'Brand@New9')).resolves.toBeTruthy();
      await expect(service.refreshSession(session.refreshToken)).rejects.toThrow(UnauthorizedError);
    });

    it('says nothing about whether an unknown account exists', async () => {
      await expect(service.requestPasswordReset('nobody@juniv.edu')).resolves.toBeNull();
    });
  });

  describe('resolveActor', () => {
    it('re-reads the account so a suspension takes effect at once', async () => {
      const { verificationLink } = await service.register(validRegistration);
      const account = await service.verifyAccount(
        new URL(verificationLink).searchParams.get('token')
      );
      const session = await service.login('farhan@juniv.edu', 'Hungry@JU1');

      expect((await service.resolveActor(session.accessToken)).id).toBe(account.id);

      account.suspend();
      await container.resolve(TOKENS.USER_REPOSITORY).save(account);

      // The token is still cryptographically valid; the account is not.
      await expect(service.resolveActor(session.accessToken)).rejects.toThrow(ForbiddenError);
    });

    it('attaches the shop a vendor owns', async () => {
      const vendor = await makeUser(container, { role: USER_ROLE.VENDOR });
      const shopService = container.resolve(TOKENS.SHOP_SERVICE);
      const shop = await shopService.register(
        { id: vendor.id, role: USER_ROLE.VENDOR, status: USER_STATUS.VERIFIED },
        {
          shopName: 'Test Shop',
          botTolaLocation: 'Bot Tola, stall 1',
          contactPhone: '01700000000',
        }
      );

      const token = container.resolve(TOKENS.TOKEN_SERVICE).issueAccessToken(vendor);
      expect((await service.resolveActor(token)).shopId).toBe(shop.id);
    });
  });
});
