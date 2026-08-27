/**
 * @file Unit tests for the user hierarchy.
 *
 * @module tests/unit/models/user
 */

import { describe, expect, it } from '@jest/globals';
import { USER_ROLE, USER_STATUS } from '@hungry-ju/shared/enums';
import { AUTH } from '@hungry-ju/shared/constants';
import { Admin } from '../../../src/models/admin.js';
import { Student } from '../../../src/models/student.js';
import { User } from '../../../src/models/user.js';
import { UserFactory } from '../../../src/models/user-factory.js';
import { Vendor } from '../../../src/models/vendor.js';
import { ValidationError } from '../../../src/core/errors/app-error.js';

/**
 * Builds a student with sensible defaults.
 *
 * @param {object} [overrides] - Attributes to change.
 * @returns {Student} The student.
 */
function makeStudent(overrides = {}) {
  return new Student({
    fullName: 'Farhan Fuad',
    email: 'farhan@juniv.edu',
    phone: '01700000004',
    passwordHash: 'hashed',
    ...overrides,
  });
}

describe('User', () => {
  it('is abstract', () => {
    expect(() => new User({ fullName: 'X', passwordHash: 'h' })).toThrow(TypeError);
  });

  it('starts pending until verified', () => {
    const student = makeStudent();
    expect(student.status).toBe(USER_STATUS.PENDING);
    expect(student.isActive).toBe(false);

    student.markVerified();
    expect(student.status).toBe(USER_STATUS.VERIFIED);
    expect(student.isActive).toBe(true);
    expect(student.verifiedAt).toBeInstanceOf(Date);
  });

  it('refuses to verify a suspended account', () => {
    const student = makeStudent();
    student.suspend();
    expect(() => student.markVerified()).toThrow(ValidationError);
  });

  it('returns a reactivated account to the state its verification implies', () => {
    const neverVerified = makeStudent();
    neverVerified.suspend();
    neverVerified.reactivate();
    expect(neverVerified.status).toBe(USER_STATUS.PENDING);

    const wasVerified = makeStudent();
    wasVerified.markVerified();
    wasVerified.suspend();
    wasVerified.reactivate();
    expect(wasVerified.status).toBe(USER_STATUS.VERIFIED);
  });

  describe('sign-in throttling (FR-A6)', () => {
    it('counts failures without locking below the threshold', () => {
      const student = makeStudent();
      for (let attempt = 1; attempt < AUTH.MAX_FAILED_LOGINS; attempt += 1) {
        expect(student.recordFailedLogin()).toBe(false);
      }
      expect(student.isLocked).toBe(false);
    });

    it('locks at the threshold and resets the counter', () => {
      const student = makeStudent();
      let locked = false;
      for (let attempt = 0; attempt < AUTH.MAX_FAILED_LOGINS; attempt += 1) {
        locked = student.recordFailedLogin();
      }
      expect(locked).toBe(true);
      expect(student.isLocked).toBe(true);
      expect(student.failedLoginCount).toBe(0);
    });

    it('clears the lock on a successful sign-in', () => {
      const student = makeStudent();
      student.recordFailedLogin();
      student.recordSuccessfulLogin();
      expect(student.failedLoginCount).toBe(0);
      expect(student.isLocked).toBe(false);
    });

    it('treats an expired lock as no lock', () => {
      const student = makeStudent({ lockedUntil: new Date(Date.now() - 1000) });
      expect(student.isLocked).toBe(false);
    });
  });

  it('clears the lock when the password is reset, since that proves control', () => {
    const student = makeStudent();
    for (let attempt = 0; attempt < AUTH.MAX_FAILED_LOGINS; attempt += 1) {
      student.recordFailedLogin();
    }
    student.changePassword('new-hash');
    expect(student.isLocked).toBe(false);
    expect(student.passwordHash).toBe('new-hash');
  });

  it('refuses an empty password hash', () => {
    expect(() => makeStudent().changePassword('')).toThrow(ValidationError);
  });

  describe('profile updates', () => {
    it('leaves a field alone when it was not submitted', () => {
      const student = makeStudent({ photoUrl: 'https://example.test/a.png' });
      student.updateProfile({ fullName: 'Farhan F.' });
      expect(student.photoUrl).toBe('https://example.test/a.png');
    });

    it('clears a field when null is sent deliberately', () => {
      const student = makeStudent({ photoUrl: 'https://example.test/a.png' });
      student.updateProfile({ photoUrl: null });
      expect(student.photoUrl).toBeNull();
    });
  });

  describe('validation (FR-A1)', () => {
    it('accepts an account with only an e-mail', () => {
      expect(() => makeStudent({ phone: null }).validate()).not.toThrow();
    });

    it('accepts an account with only a phone number', () => {
      expect(() => makeStudent({ email: null }).validate()).not.toThrow();
    });

    it('rejects an account with neither', () => {
      expect(() => makeStudent({ email: null, phone: null }).validate()).toThrow(ValidationError);
    });

    it('rejects a name that is barely there', () => {
      expect(() => makeStudent({ fullName: 'A' }).validate()).toThrow(ValidationError);
    });

    it('rejects an account with no credential', () => {
      expect(() => makeStudent({ passwordHash: '' }).validate()).toThrow(ValidationError);
    });
  });

  it('never serialises the credential hash or the lock state', () => {
    const student = makeStudent({ id: 'u1' });
    student.recordFailedLogin();
    const json = student.toJSON();

    expect(json).not.toHaveProperty('passwordHash');
    expect(json).not.toHaveProperty('failedLoginCount');
    expect(json).not.toHaveProperty('lockedUntil');
    expect(json.role).toBe(USER_ROLE.STUDENT);
  });

  it('round-trips through persistence', () => {
    const original = makeStudent({ id: 'u1' });
    original.markVerified();
    const restored = Student.fromPersistence(original.toPersistence());

    expect(restored.id).toBe('u1');
    expect(restored.email).toBe(original.email);
    expect(restored.status).toBe(USER_STATUS.VERIFIED);
    expect(restored.passwordHash).toBe('hashed');
  });
});

describe('role subclasses', () => {
  it.each([
    [Student, USER_ROLE.STUDENT, '/shops'],
    [Vendor, USER_ROLE.VENDOR, '/vendor/orders'],
    [Admin, USER_ROLE.ADMIN, '/admin/vendors'],
  ])('%p answers its own role and landing route', (UserClass, role, homeRoute) => {
    const user = new UserClass({ fullName: 'Test User', email: 'a@b.co', passwordHash: 'h' });
    expect(user.role).toBe(role);
    expect(user.homeRoute).toBe(homeRoute);
  });
});

describe('UserFactory', () => {
  it('builds the class that matches the role', () => {
    const attributes = { fullName: 'Test', email: 'a@b.co', passwordHash: 'h' };
    expect(UserFactory.create(USER_ROLE.VENDOR, attributes)).toBeInstanceOf(Vendor);
    expect(UserFactory.create(USER_ROLE.ADMIN, attributes)).toBeInstanceOf(Admin);
  });

  it('rebuilds the right class from a stored row', () => {
    const row = new Vendor({ fullName: 'V', email: 'v@b.co', passwordHash: 'h' }).toPersistence();
    expect(UserFactory.fromPersistence(row)).toBeInstanceOf(Vendor);
  });

  it('refuses a role nobody defined', () => {
    expect(() => UserFactory.create('wizard', {})).toThrow(ValidationError);
    expect(() => UserFactory.fromPersistence({ role: 'wizard' })).toThrow(ValidationError);
  });
});
