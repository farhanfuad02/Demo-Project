/**
 * @file Unit tests for the supporting record entities.
 *
 * @module tests/unit/models/records
 */

import { describe, expect, it } from '@jest/globals';
import {
  AUDIT_ACTION,
  AUDIT_ENTITY,
  NOTIFICATION_TYPE,
  PAYMENT_METHOD,
  RATING_TARGET,
  TOKEN_TYPE,
} from '@hungry-ju/shared/enums';
import { AuditLog } from '../../../src/models/audit-log.js';
import { AuthToken } from '../../../src/models/auth-token.js';
import { Notification } from '../../../src/models/notification.js';
import { Payment } from '../../../src/models/payment.js';
import { Rating } from '../../../src/models/rating.js';
import { SystemConfig } from '../../../src/models/system-config.js';
import { Money } from '../../../src/utils/money.js';
import { ValidationError } from '../../../src/core/errors/app-error.js';

describe('Payment', () => {
  /**
   * Builds a cash payment record.
   *
   * @returns {Payment} The payment.
   */
  const makePayment = () => new Payment({ orderId: 'order-1', amount: Money.fromTaka(145) });

  it('defaults to cash on delivery, the only MVP method', () => {
    expect(makePayment().method).toBe(PAYMENT_METHOD.COD);
    expect(makePayment().isCollected).toBe(false);
  });

  it('records who took the cash and when', () => {
    const payment = makePayment();
    payment.markCollected('rider-1');

    expect(payment.isCollected).toBe(true);
    expect(payment.toPersistence().collected_by_user_id).toBe('rider-1');
  });

  it('refuses to be collected twice', () => {
    const payment = makePayment();
    payment.markCollected('rider-1');
    expect(() => payment.markCollected('rider-2')).toThrow(ValidationError);
  });

  it('requires an order and an amount', () => {
    expect(() => new Payment({ orderId: null, amount: Money.zero() }).validate()).toThrow(
      ValidationError
    );
    expect(() => new Payment({ orderId: 'o1', amount: 145 }).validate()).toThrow(ValidationError);
  });
});

describe('Rating', () => {
  /**
   * Builds a shop rating.
   *
   * @param {object} [overrides] - Attributes to change.
   * @returns {Rating} The rating.
   */
  const makeRating = (overrides = {}) =>
    new Rating({
      orderId: 'order-1',
      raterUserId: 'student-1',
      targetType: RATING_TARGET.SHOP,
      targetId: 'shop-1',
      stars: 5,
      comment: 'Fast and hot',
      ...overrides,
    });

  it('accepts a whole number of stars from one to five', () => {
    expect(() => makeRating({ stars: 3 }).validate()).not.toThrow();
    expect(() => makeRating({ stars: 0 }).validate()).toThrow(ValidationError);
    expect(() => makeRating({ stars: 6 }).validate()).toThrow(ValidationError);
    expect(() => makeRating({ stars: 4.5 }).validate()).toThrow(ValidationError);
  });

  it('rejects a target type nobody defined', () => {
    expect(() => makeRating({ targetType: 'moon' }).validate()).toThrow(ValidationError);
  });

  it('keeps the score when a comment is moderated away (FR-G4)', () => {
    const rating = makeRating();
    rating.redactComment();

    expect(rating.comment).toBeNull();
    expect(rating.stars).toBe(5);
  });

  it('round-trips through persistence', () => {
    const restored = Rating.fromPersistence(makeRating({ id: 'r1' }).toPersistence());
    expect(restored.stars).toBe(5);
    expect(restored.targetType).toBe(RATING_TARGET.SHOP);
  });
});

describe('Notification', () => {
  /**
   * Builds a notification.
   *
   * @param {object} [overrides] - Attributes to change.
   * @returns {Notification} The notification.
   */
  const makeNotification = (overrides = {}) =>
    new Notification({
      userId: 'user-1',
      type: NOTIFICATION_TYPE.ORDER_ACCEPTED,
      title: 'Order accepted',
      body: 'Bot Tola accepted your order.',
      ...overrides,
    });

  it('starts unread', () => {
    expect(makeNotification().isRead).toBe(false);
  });

  it('can be marked read', () => {
    const notification = makeNotification();
    notification.markRead();
    expect(notification.isRead).toBe(true);
  });

  it('requires a recipient and text', () => {
    expect(() => makeNotification({ userId: null }).validate()).toThrow(ValidationError);
    expect(() => makeNotification({ body: '' }).validate()).toThrow(ValidationError);
  });
});

describe('AuditLog', () => {
  /**
   * Builds an audit entry.
   *
   * @param {object} [overrides] - Attributes to change.
   * @returns {AuditLog} The entry.
   */
  const makeEntry = (overrides = {}) =>
    new AuditLog({
      actorUserId: 'user-1',
      entityType: AUDIT_ENTITY.ORDER,
      entityId: 'order-1',
      action: AUDIT_ACTION.STATUS_CHANGE,
      oldValue: { status: 'placed' },
      newValue: { status: 'accepted' },
      ...overrides,
    });

  it('serialises its before and after values as JSON', () => {
    const row = makeEntry().toPersistence();
    expect(JSON.parse(row.old_value)).toEqual({ status: 'placed' });
  });

  it('allows a null actor, because the scheduler acts on nobody’s behalf', () => {
    expect(() => makeEntry({ actorUserId: null }).validate()).not.toThrow();
  });

  it('requires the subject of the change', () => {
    expect(() => makeEntry({ entityId: '' }).validate()).toThrow(ValidationError);
  });

  it('round-trips its values through persistence', () => {
    const restored = AuditLog.fromPersistence(makeEntry({ id: 'a1' }).toPersistence());
    expect(restored.toJSON().newValue).toEqual({ status: 'accepted' });
  });
});

describe('AuthToken', () => {
  /**
   * Builds a token record.
   *
   * @param {object} [overrides] - Attributes to change.
   * @returns {AuthToken} The record.
   */
  const makeToken = (overrides = {}) =>
    new AuthToken({
      userId: 'user-1',
      type: TOKEN_TYPE.REFRESH,
      tokenHash: 'sha256-hash',
      expiresAt: new Date(Date.now() + 60_000),
      ...overrides,
    });

  it('is usable while unexpired and unspent', () => {
    expect(makeToken().isUsable).toBe(true);
  });

  it('stops being usable once consumed, so a replayed link fails', () => {
    const token = makeToken();
    token.consume();
    expect(token.isUsable).toBe(false);
  });

  it('stops being usable once expired', () => {
    expect(makeToken({ expiresAt: new Date(Date.now() - 1000) }).isUsable).toBe(false);
  });

  it('never serialises its hash', () => {
    expect(makeToken().toJSON()).not.toHaveProperty('tokenHash');
  });

  it('requires an owner, a purpose, and a hash', () => {
    expect(() => makeToken({ tokenHash: '' }).validate()).toThrow(ValidationError);
    expect(() => makeToken({ userId: null }).validate()).toThrow(ValidationError);
  });
});

describe('SystemConfig', () => {
  it('records who last changed a parameter', () => {
    const entry = new SystemConfig({ key: 'deliveryFeeBdt', value: 25 });
    entry.setValue(30, 'admin-1');

    expect(entry.value).toBe(30);
    expect(entry.toPersistence().updated_by_user_id).toBe('admin-1');
  });

  it('requires a key', () => {
    expect(() => new SystemConfig({ key: '', value: 1 }).validate()).toThrow(ValidationError);
  });

  it('round-trips a value of any JSON type', () => {
    const entry = new SystemConfig({ id: 'c1', key: 'flags', value: { surge: true } });
    const restored = SystemConfig.fromPersistence(entry.toPersistence());
    expect(restored.value).toEqual({ surge: true });
  });
});
