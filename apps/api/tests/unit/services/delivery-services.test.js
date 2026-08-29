/**
 * @file Unit tests for the delivery, rating, payment, and admin services.
 *
 * @module tests/unit/services/delivery-services
 */

import { beforeEach, describe, expect, it } from '@jest/globals';
import {
  APPROVAL_STATUS,
  DELIVERY_STATUS,
  GENDER,
  ORDER_STATUS,
  RATING_TARGET,
  USER_ROLE,
  USER_STATUS,
} from '@hungry-ju/shared/enums';
import { TOKENS } from '../../../src/config/container.js';
import { PasswordService } from '../../../src/services/password-service.js';
import {
  ConflictError,
  ForbiddenError,
  ValidationError,
} from '../../../src/core/errors/app-error.js';
import {
  actorFor,
  makeContainer,
  makeShop,
  makeUser,
  placeOrder,
} from '../../helpers/test-database.js';

/** @type {import('../../../src/config/container.js').Container} */
let container;

beforeEach(async () => {
  ({ container } = await makeContainer());
  // The PIN is hashed with bcrypt on every order; the default cost makes this suite slow.
  container.registerValue(TOKENS.PASSWORD_SERVICE, new PasswordService({ cost: 4 }));
});

/**
 * Places an order and drives it to "ready for pickup".
 *
 * @returns {Promise<object>} Everything a delivery test needs.
 */
async function readyOrder() {
  const student = await makeUser(container, { fullName: 'Ordering Student' });
  const { items, owner, shop } = await makeShop(container, {
    menu: [{ name: 'Khichuri', price: 60 }],
  });
  const { order, confirmPin } = await placeOrder(container, { student, item: items[0] });

  const orderService = container.resolve(TOKENS.ORDER_SERVICE);
  const vendorActor = actorFor(owner);
  await orderService.accept(vendorActor, order.id);
  await orderService.advance(vendorActor, order.id, ORDER_STATUS.PREPARING);
  await orderService.advance(vendorActor, order.id, ORDER_STATUS.READY);

  const delivery = await container.resolve(TOKENS.DELIVERY_SERVICE).forOrder(order.id);
  return { student, owner, shop, order, delivery, confirmPin, vendorActor };
}

/**
 * Creates a student who is online as a delivery partner.
 *
 * @returns {Promise<{ rider: object, riderActor: object }>} The rider.
 */
async function onlineRider() {
  const rider = await makeUser(container, { fullName: 'Delivery Partner' });
  await container.resolve(TOKENS.USER_SERVICE).setDeliverMode(actorFor(rider), true);
  return { rider, riderActor: actorFor(rider) };
}

describe('DeliveryService', () => {
  /** @type {import('../../../src/services/delivery-service.js').DeliveryService} */
  let service;

  beforeEach(() => {
    service = container.resolve(TOKENS.DELIVERY_SERVICE);
  });

  describe('the open feed (FR-D2)', () => {
    it('shows a ready order with pickup, drop-off, and earnings', async () => {
      await readyOrder();
      const { riderActor } = await onlineRider();

      const feed = await service.availableFor(riderActor);
      expect(feed).toHaveLength(1);
      expect(feed[0].pickup.shopName).toBe('Test Shop');
      expect(feed[0].dropOff.hall).toBe('SRJ');
      expect(feed[0].earning).toBe(25);
    });

    it('refuses a student who has not gone online', async () => {
      await readyOrder();
      const offline = await makeUser(container);
      await expect(service.availableFor(actorFor(offline))).rejects.toThrow(ForbiddenError);
    });

    it('hides a student’s own order from them (BR-06)', async () => {
      const { student } = await readyOrder();
      await container.resolve(TOKENS.USER_SERVICE).setDeliverMode(actorFor(student), true);

      expect(await service.availableFor(actorFor(student))).toHaveLength(0);
    });

    it('shows nothing until the vendor marks the food ready', async () => {
      const student = await makeUser(container);
      const { items } = await makeShop(container, { menu: [{ name: 'Khichuri', price: 60 }] });
      await placeOrder(container, { student, item: items[0] });

      const { riderActor } = await onlineRider();
      expect(await service.availableFor(riderActor)).toHaveLength(0);
    });
  });

  describe('claiming (UC-02)', () => {
    it('binds the delivery and notifies the customer and vendor', async () => {
      const { delivery, student, owner } = await readyOrder();
      const { rider, riderActor } = await onlineRider();

      const claimed = await service.accept(riderActor, delivery.id);
      expect(claimed.riderUserId).toBe(rider.id);
      expect(claimed.status).toBe(DELIVERY_STATUS.ASSIGNED);

      const notifications = container.resolve(TOKENS.NOTIFICATION_REPOSITORY);
      expect(
        (await notifications.findByUser(student.id)).some((n) => n.type === 'order_assigned')
      ).toBe(true);
      expect(
        (await notifications.findByUser(owner.id)).some((n) => n.type === 'order_assigned')
      ).toBe(true);
    });

    it('refuses the second of two riders (alternate flow A1)', async () => {
      const { delivery } = await readyOrder();
      const first = await onlineRider();
      const second = await onlineRider();

      await service.accept(first.riderActor, delivery.id);
      await expect(service.accept(second.riderActor, delivery.id)).rejects.toThrow(ConflictError);
    });

    it('lets exactly one of several simultaneous accepts win (NFR-11)', async () => {
      const { delivery } = await readyOrder();
      const riders = await Promise.all([onlineRider(), onlineRider(), onlineRider()]);

      const results = await Promise.allSettled(
        riders.map(({ riderActor }) => service.accept(riderActor, delivery.id))
      );
      const won = results.filter((result) => result.status === 'fulfilled');

      expect(won).toHaveLength(1);
      expect(results.filter((r) => r.status === 'rejected')).toHaveLength(2);
    });

    it('refuses a second delivery while one is active (FR-D4)', async () => {
      const first = await readyOrder();
      const second = await readyOrder();
      const { riderActor } = await onlineRider();

      await service.accept(riderActor, first.delivery.id);
      await expect(service.accept(riderActor, second.delivery.id)).rejects.toThrow(ConflictError);
    });

    it('refuses a student their own order even by direct call (BR-06)', async () => {
      const { student, delivery } = await readyOrder();
      await container.resolve(TOKENS.USER_SERVICE).setDeliverMode(actorFor(student), true);

      await expect(service.accept(actorFor(student), delivery.id)).rejects.toThrow(ForbiddenError);
    });
  });

  describe('progress and completion (FR-D5, FR-D6)', () => {
    /**
     * Claims a delivery and drives it to the point of collection.
     *
     * @returns {Promise<object>} The claimed delivery and its context.
     */
    const pickedUp = async () => {
      const context = await readyOrder();
      const { rider, riderActor } = await onlineRider();
      await service.accept(riderActor, context.delivery.id);
      await service.advance(riderActor, context.delivery.id, DELIVERY_STATUS.HEADING_TO_VENDOR);
      await service.advance(riderActor, context.delivery.id, DELIVERY_STATUS.PICKED_UP);
      return { ...context, rider, riderActor };
    };

    it('advances the order alongside the delivery on pickup', async () => {
      const { order } = await pickedUp();
      const stored = await container.resolve(TOKENS.ORDER_REPOSITORY).findById(order.id);
      expect(stored.status).toBe(ORDER_STATUS.PICKED_UP);
    });

    it('completes on the right PIN and settles the cash', async () => {
      const { delivery, riderActor, confirmPin, order } = await pickedUp();
      const completed = await service.complete(riderActor, delivery.id, confirmPin);

      expect(completed.status).toBe(DELIVERY_STATUS.DELIVERED);
      expect((await container.resolve(TOKENS.ORDER_REPOSITORY).findById(order.id)).status).toBe(
        ORDER_STATUS.DELIVERED
      );
      expect((await container.resolve(TOKENS.PAYMENT_SERVICE).forOrder(order.id)).isCollected).toBe(
        true
      );
    });

    it('refuses the wrong PIN (BR-10)', async () => {
      const { delivery, riderActor, confirmPin, order } = await pickedUp();
      const wrongPin = confirmPin === '0000' ? '1111' : '0000';

      await expect(service.complete(riderActor, delivery.id, wrongPin)).rejects.toThrow(
        ForbiddenError
      );
      expect((await container.resolve(TOKENS.ORDER_REPOSITORY).findById(order.id)).status).toBe(
        ORDER_STATUS.PICKED_UP
      );
    });

    it('refuses a rider acting on somebody else’s delivery', async () => {
      const { delivery } = await pickedUp();
      const stranger = await onlineRider();

      await expect(
        service.advance(stranger.riderActor, delivery.id, DELIVERY_STATUS.PICKED_UP)
      ).rejects.toThrow(ForbiddenError);
    });
  });

  describe('releasing (FR-D8)', () => {
    it('returns the job to the pool and costs the rider reliability', async () => {
      const { delivery } = await readyOrder();
      const { rider, riderActor } = await onlineRider();
      await service.accept(riderActor, delivery.id);

      const released = await service.release(riderActor, delivery.id);
      expect(released.status).toBe(DELIVERY_STATUS.AVAILABLE);
      expect(released.riderUserId).toBeNull();

      const profile = await container
        .resolve(TOKENS.STUDENT_PROFILE_REPOSITORY)
        .findByUserId(rider.id);
      expect(profile.reliabilityScore).toBeLessThan(100);
    });

    it('lets another partner take the released job', async () => {
      const { delivery } = await readyOrder();
      const first = await onlineRider();
      const second = await onlineRider();

      await service.accept(first.riderActor, delivery.id);
      await service.release(first.riderActor, delivery.id);

      await expect(service.accept(second.riderActor, delivery.id)).resolves.toBeTruthy();
    });

    it('refuses once the food has been collected', async () => {
      const { delivery } = await readyOrder();
      const { riderActor } = await onlineRider();
      await service.accept(riderActor, delivery.id);
      await service.advance(riderActor, delivery.id, DELIVERY_STATUS.HEADING_TO_VENDOR);
      await service.advance(riderActor, delivery.id, DELIVERY_STATUS.PICKED_UP);

      await expect(service.release(riderActor, delivery.id)).rejects.toThrow(ConflictError);
    });
  });

  it('totals earnings for the rider dashboard (FR-D7)', async () => {
    const { delivery, confirmPin } = await readyOrder();
    const { riderActor } = await onlineRider();
    await service.accept(riderActor, delivery.id);
    await service.advance(riderActor, delivery.id, DELIVERY_STATUS.HEADING_TO_VENDOR);
    await service.advance(riderActor, delivery.id, DELIVERY_STATUS.PICKED_UP);
    await service.complete(riderActor, delivery.id, confirmPin);

    const earnings = await service.earningsFor(riderActor);
    expect(earnings.today).toEqual({ count: 1, earnings: 25 });
    expect(earnings.allTime.earnings).toBe(25);
    expect(earnings.history).toHaveLength(1);
  });
});

describe('UserService', () => {
  it('refuses to take a rider offline mid-delivery', async () => {
    const { delivery } = await readyOrder();
    const { riderActor } = await onlineRider();
    await container.resolve(TOKENS.DELIVERY_SERVICE).accept(riderActor, delivery.id);

    await expect(
      container.resolve(TOKENS.USER_SERVICE).setDeliverMode(riderActor, false)
    ).rejects.toThrow(ConflictError);
  });

  it('refuses a phone number another account already uses (BR-01)', async () => {
    await makeUser(container, { phone: '01733333333' });
    const second = await makeUser(container);

    await expect(
      container.resolve(TOKENS.USER_SERVICE).updateProfile(actorFor(second), {
        phone: '01733333333',
      })
    ).rejects.toThrow(ConflictError);
  });

  it('returns the student profile alongside the account', async () => {
    const student = await makeUser(container);
    const profile = await container.resolve(TOKENS.USER_SERVICE).profileOf(actorFor(student));
    expect(profile.profile.hallName).toBe('SRJ');
  });

  it('saves a hall from the list the student gender allows', async () => {
    const student = await makeUser(container, { gender: GENDER.FEMALE });

    const saved = await container
      .resolve(TOKENS.USER_SERVICE)
      .updateLocation(actorFor(student), { hallName: 'TBH', roomNo: '7' });

    expect(saved.hallName).toBe('TBH');
  });

  it('refuses a hall from the other list (JU halls are gender-segregated)', async () => {
    const student = await makeUser(container, { gender: GENDER.FEMALE });

    await expect(
      container
        .resolve(TOKENS.USER_SERVICE)
        .updateLocation(actorFor(student), { hallName: 'SRJ', roomNo: '7' })
    ).rejects.toThrow(/not one of your halls/);
  });

  it('clears a hall that the new gender cannot live in, rather than trapping the student', async () => {
    // Refusing the gender change would be a deadlock: the hall cannot be fixed until the
    // gender is right, and the gender cannot be changed while the hall is wrong.
    const student = await makeUser(container, { gender: GENDER.MALE });
    const userService = container.resolve(TOKENS.USER_SERVICE);
    await userService.updateLocation(actorFor(student), { hallName: 'ABH', roomNo: '3' });

    await userService.updateProfile(actorFor(student), { gender: GENDER.FEMALE });

    const after = await userService.profileOf(actorFor(student));
    expect(after.gender).toBe(GENDER.FEMALE);
    expect(after.profile.hallName).toBeNull();
  });

  it('keeps a hall that is still valid after the gender changes back', async () => {
    const student = await makeUser(container, { gender: GENDER.MALE });
    const userService = container.resolve(TOKENS.USER_SERVICE);
    await userService.updateLocation(actorFor(student), { hallName: 'ABH', roomNo: '3' });

    await userService.updateProfile(actorFor(student), { fullName: 'Renamed Student' });

    const after = await userService.profileOf(actorFor(student));
    expect(after.profile.hallName).toBe('ABH');
  });
});

describe('RatingService', () => {
  /**
   * Drives an order all the way to delivered.
   *
   * @returns {Promise<object>} The delivered order and its participants.
   */
  const deliveredOrder = async () => {
    const context = await readyOrder();
    const { rider, riderActor } = await onlineRider();
    const deliveryService = container.resolve(TOKENS.DELIVERY_SERVICE);

    await deliveryService.accept(riderActor, context.delivery.id);
    await deliveryService.advance(
      riderActor,
      context.delivery.id,
      DELIVERY_STATUS.HEADING_TO_VENDOR
    );
    await deliveryService.advance(riderActor, context.delivery.id, DELIVERY_STATUS.PICKED_UP);
    await deliveryService.complete(riderActor, context.delivery.id, context.confirmPin);

    return { ...context, rider, studentActor: actorFor(context.student) };
  };

  it('rates the shop and updates its running average', async () => {
    const { order, shop, studentActor } = await deliveredOrder();
    await container
      .resolve(TOKENS.RATING_SERVICE)
      .rate(studentActor, order.id, { targetType: RATING_TARGET.SHOP, stars: 5 });

    const reloaded = await container.resolve(TOKENS.SHOP_REPOSITORY).findById(shop.id);
    expect(reloaded.ratingAverage).toBe(5);
    expect(reloaded.ratingCount).toBe(1);
  });

  it('rates the delivery partner and updates their standing', async () => {
    const { order, rider, studentActor } = await deliveredOrder();
    await container
      .resolve(TOKENS.RATING_SERVICE)
      .rate(studentActor, order.id, { targetType: RATING_TARGET.RIDER, stars: 4 });

    const profile = await container
      .resolve(TOKENS.STUDENT_PROFILE_REPOSITORY)
      .findByUserId(rider.id);
    expect(profile.riderRatingAverage).toBe(4);
  });

  it('refuses a second rating of the same target (BR-08)', async () => {
    const { order, studentActor } = await deliveredOrder();
    const service = container.resolve(TOKENS.RATING_SERVICE);
    await service.rate(studentActor, order.id, { targetType: RATING_TARGET.SHOP, stars: 5 });

    await expect(
      service.rate(studentActor, order.id, { targetType: RATING_TARGET.SHOP, stars: 1 })
    ).rejects.toThrow(ConflictError);
  });

  it('refuses to rate an order that has not been delivered (BR-08)', async () => {
    const { order, student } = await readyOrder();
    await expect(
      container
        .resolve(TOKENS.RATING_SERVICE)
        .rate(actorFor(student), order.id, { targetType: RATING_TARGET.SHOP, stars: 5 })
    ).rejects.toThrow(ValidationError);
  });

  it('refuses to rate somebody else’s order', async () => {
    const { order } = await deliveredOrder();
    const stranger = await makeUser(container);

    await expect(
      container
        .resolve(TOKENS.RATING_SERVICE)
        .rate(actorFor(stranger), order.id, { targetType: RATING_TARGET.SHOP, stars: 5 })
    ).rejects.toThrow(ForbiddenError);
  });

  it('removes an abusive comment but keeps the score (FR-G4)', async () => {
    const { order, studentActor } = await deliveredOrder();
    const service = container.resolve(TOKENS.RATING_SERVICE);
    const rating = await service.rate(studentActor, order.id, {
      targetType: RATING_TARGET.SHOP,
      stars: 1,
      comment: 'something abusive',
    });

    const admin = await makeUser(container, { role: USER_ROLE.ADMIN });
    const moderated = await service.moderate(actorFor(admin), rating.id);

    expect(moderated.comment).toBeNull();
    expect(moderated.stars).toBe(1);
  });
});

describe('AdminService', () => {
  /** @type {import('../../../src/services/admin-service.js').AdminService} */
  let service;
  /** @type {import('@hungry-ju/shared/types').Actor} */
  let adminActor;

  beforeEach(async () => {
    service = container.resolve(TOKENS.ADMIN_SERVICE);
    adminActor = actorFor(await makeUser(container, { role: USER_ROLE.ADMIN }));
  });

  describe('shop approval (FR-G1)', () => {
    it('approves a pending shop and tells the vendor', async () => {
      const { shop, owner } = await makeShop(container, {
        approvalStatus: APPROVAL_STATUS.PENDING,
        isOpen: false,
        menu: [],
      });

      const decided = await service.decideShop(adminActor, shop.id, true);
      expect(decided.approvalStatus).toBe(APPROVAL_STATUS.APPROVED);

      const notifications = await container
        .resolve(TOKENS.NOTIFICATION_REPOSITORY)
        .findByUser(owner.id);
      expect(notifications[0].type).toBe('vendor_approved');
    });

    it('demands a reason to reject', async () => {
      const { shop } = await makeShop(container, {
        approvalStatus: APPROVAL_STATUS.PENDING,
        isOpen: false,
        menu: [],
      });
      await expect(service.decideShop(adminActor, shop.id, false)).rejects.toThrow(ValidationError);
    });

    it('refuses a non-admin', async () => {
      const { shop } = await makeShop(container, { menu: [] });
      const student = await makeUser(container);
      await expect(service.decideShop(actorFor(student), shop.id, true)).rejects.toThrow(
        ForbiddenError
      );
    });
  });

  describe('user suspension (FR-G2)', () => {
    it('suspends an account and ends its sessions', async () => {
      const student = await makeUser(container);
      await container.resolve(TOKENS.TOKEN_SERVICE).issueRefreshToken(student);

      const suspended = await service.setUserSuspended(adminActor, student.id, true);
      expect(suspended.status).toBe(USER_STATUS.SUSPENDED);

      const tokens = await container
        .resolve(TOKENS.AUTH_TOKEN_REPOSITORY)
        .findMany({ user_id: student.id, consumed_at: null });
      expect(tokens).toHaveLength(0);
    });

    it('reactivates an account back to verified', async () => {
      const student = await makeUser(container);
      await service.setUserSuspended(adminActor, student.id, true);

      const reactivated = await service.setUserSuspended(adminActor, student.id, false);
      expect(reactivated.status).toBe(USER_STATUS.VERIFIED);
    });

    it('refuses an admin suspending themselves', async () => {
      await expect(service.setUserSuspended(adminActor, adminActor.id, true)).rejects.toThrow(
        ValidationError
      );
    });
  });

  describe('dispute tools (FR-G3)', () => {
    it('force-cancels an order that is past the customer window', async () => {
      const { order } = await readyOrder();
      const cancelled = await service.forceCancelOrder(adminActor, order.id, 'Nobody collected it');

      expect(cancelled.status).toBe(ORDER_STATUS.CANCELLED);
      expect((await container.resolve(TOKENS.DELIVERY_SERVICE).forOrder(order.id)).status).toBe(
        DELIVERY_STATUS.RELEASED
      );
    });

    it('returns a stuck delivery to the pool', async () => {
      const { delivery } = await readyOrder();
      const { riderActor } = await onlineRider();
      await container.resolve(TOKENS.DELIVERY_SERVICE).accept(riderActor, delivery.id);

      const reopened = await service.reassignDelivery(adminActor, delivery.orderId);
      expect(reopened.status).toBe(DELIVERY_STATUS.AVAILABLE);
      expect(reopened.riderUserId).toBeNull();
    });

    it('flags an order nobody has moved for too long', async () => {
      const { order } = await readyOrder();
      await container
        .resolve(TOKENS.ORDER_REPOSITORY)
        .update(order.id, { created_at: new Date(Date.now() - 60 * 60_000).toISOString() });

      const page = await service.orders(adminActor, { stuckMinutes: 20 });
      expect(page.items[0].isStuck).toBe(true);
    });
  });

  it('summarises the platform for the dashboard', async () => {
    await readyOrder();
    const summary = await service.summary(adminActor);

    expect(summary.students).toBeGreaterThan(0);
    expect(summary.vendors).toBeGreaterThan(0);
    expect(summary.activeOrders).toBe(1);
  });
});

describe('AnalyticsService', () => {
  it('counts only delivered orders as revenue', async () => {
    const context = await readyOrder();
    const { riderActor } = await onlineRider();
    const deliveryService = container.resolve(TOKENS.DELIVERY_SERVICE);

    await deliveryService.accept(riderActor, context.delivery.id);
    await deliveryService.advance(
      riderActor,
      context.delivery.id,
      DELIVERY_STATUS.HEADING_TO_VENDOR
    );
    await deliveryService.advance(riderActor, context.delivery.id, DELIVERY_STATUS.PICKED_UP);
    await deliveryService.complete(riderActor, context.delivery.id, context.confirmPin);

    const analytics = await container
      .resolve(TOKENS.ANALYTICS_SERVICE)
      .forShop(actorFor(context.owner), context.shop.id);

    expect(analytics.deliveredCount).toBe(1);
    expect(analytics.revenue).toBe(60);
    expect(analytics.topItems[0]).toMatchObject({ itemName: 'Khichuri', quantity: 1 });
  });

  it('refuses a vendor asking about another vendor’s shop', async () => {
    const { shop } = await makeShop(container, { menu: [] });
    const otherVendor = await makeUser(container, { role: USER_ROLE.VENDOR });

    await expect(
      container.resolve(TOKENS.ANALYTICS_SERVICE).forShop(actorFor(otherVendor), shop.id)
    ).rejects.toThrow(ForbiddenError);
  });

  it('refuses a student asking for platform analytics', async () => {
    const student = await makeUser(container);
    await expect(
      container.resolve(TOKENS.ANALYTICS_SERVICE).forPlatform(actorFor(student))
    ).rejects.toThrow(ForbiddenError);
  });

  it('reports every day in the window, quiet ones included', async () => {
    const admin = await makeUser(container, { role: USER_ROLE.ADMIN });
    const analytics = await container
      .resolve(TOKENS.ANALYTICS_SERVICE)
      .forPlatform(actorFor(admin), 7);

    expect(analytics.ordersByDay).toHaveLength(7);
  });
});

describe('SchedulerService', () => {
  it('runs the auto-cancel and cleanup jobs in one pass', async () => {
    const student = await makeUser(container);
    const { items } = await makeShop(container, { menu: [{ name: 'Khichuri', price: 60 }] });
    const { order } = await placeOrder(container, { student, item: items[0] });

    await container
      .resolve(TOKENS.ORDER_REPOSITORY)
      .update(order.id, { accept_deadline: new Date(Date.now() - 1000).toISOString() });

    const result = await container.resolve(TOKENS.SCHEDULER_SERVICE).runOnce();
    expect(result.expiredOrders).toBe(1);
  });

  it('logs a failing job instead of dying with it', async () => {
    const scheduler = container.resolve(TOKENS.SCHEDULER_SERVICE);
    const orderService = container.resolve(TOKENS.ORDER_SERVICE);
    orderService.expireUnansweredOrders = async () => {
      throw new Error('database unavailable');
    };

    // A scheduler that dies on the first bad tick takes BR-11 with it.
    await expect(scheduler.runOnce()).resolves.toMatchObject({ expiredOrders: 0 });
  });

  it('starts and stops cleanly', () => {
    const scheduler = container.resolve(TOKENS.SCHEDULER_SERVICE);
    scheduler.start();
    scheduler.start();
    expect(() => scheduler.stop()).not.toThrow();
    expect(() => scheduler.stop()).not.toThrow();
  });
});
