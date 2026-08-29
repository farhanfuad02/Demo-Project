/**
 * @file End-to-end tests over the real Express application.
 *
 * These exercise the layers the unit tests deliberately skip — routing, middleware
 * order, controllers, and the shape of what goes back on the wire — against an
 * in-memory store and a real HTTP stack.
 *
 * @module tests/integration/api
 */

import { beforeEach, describe, expect, it } from '@jest/globals';
import request from 'supertest';
import { DELIVERY_STATUS, GENDER, ORDER_STATUS, USER_ROLE } from '@hungry-ju/shared/enums';
import { Application } from '../../src/app.js';
import { Env } from '../../src/config/env.js';
import { TOKENS } from '../../src/config/container.js';
import { InMemoryDatabase } from '../../src/config/database/in-memory-database.js';
import { PasswordService } from '../../src/services/password-service.js';
import { Seeder } from '../../src/config/database/seed.js';
import { Logger } from '../../src/lib/logger.js';

/** The password every seeded account shares. */
const PASSWORD = 'Hungry@JU1';

/** @type {Application} */
let application;
/** @type {import('supertest').Agent} */
let api;

beforeEach(async () => {
  const db = await new InMemoryDatabase().connect();
  // bcrypt at the production cost is deliberately slow, and this suite signs in on almost
  // every test. The cost is injected rather than mocked, so the real hashing code runs.
  const passwordService = new PasswordService({ cost: 4 });
  await new Seeder({ db, logger: new Logger({ level: 'silent' }), passwordService }).run();

  application = new Application({ db, env: Env.current });
  application.container.registerValue(TOKENS.PASSWORD_SERVICE, passwordService);
  api = request(application.instance);
});

/**
 * Signs in and returns the access token.
 *
 * @param {string} email - Account to sign in as.
 * @returns {Promise<string>} Bearer token.
 */
async function signIn(email) {
  const response = await api
    .post('/api/auth/login')
    .send({ identifier: email, password: PASSWORD });
  expect(response.status).toBe(200);
  return response.body.data.accessToken;
}

/**
 * Adds an authorization header to a supertest request.
 *
 * @param {import('supertest').Test} test - The request.
 * @param {string} token - Bearer token.
 * @returns {import('supertest').Test} The request, authenticated.
 */
function as(test, token) {
  return test.set('Authorization', `Bearer ${token}`);
}

describe('GET /health', () => {
  it('reports the database is reachable', async () => {
    const response = await api.get('/health');
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ status: 'ok', database: true });
  });
});

describe('routing and error handling', () => {
  it('answers 404 with the error envelope for an unknown path', async () => {
    const response = await api.get('/api/does-not-exist');
    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('NOT_FOUND');
  });

  it('answers 401 for a guarded route with no token', async () => {
    expect((await api.get('/api/cart')).status).toBe(401);
  });

  it('answers 401 for a token that is not a token', async () => {
    expect((await as(api.get('/api/cart'), 'nonsense')).status).toBe(401);
  });

  it('stamps a correlation id on every response', async () => {
    const response = await api.get('/health');
    expect(response.headers['x-request-id']).toBeTruthy();
  });

  it('does not advertise the framework', async () => {
    expect((await api.get('/health')).headers['x-powered-by']).toBeUndefined();
  });
});

describe('authentication', () => {
  it('sets the refresh token as an httpOnly cookie and returns the access token in the body', async () => {
    const response = await api
      .post('/api/auth/login')
      .send({ identifier: 'farhan@juniv.edu', password: PASSWORD });

    expect(response.status).toBe(200);
    expect(response.body.data.accessToken).toBeTruthy();

    const cookie = response.headers['set-cookie'][0];
    expect(cookie).toContain('hju_refresh=');
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Lax');
    // Script on the page must never be able to read the long-lived token.
    expect(response.body.data).not.toHaveProperty('refreshToken');
  });

  it('refuses the wrong password', async () => {
    const response = await api
      .post('/api/auth/login')
      .send({ identifier: 'farhan@juniv.edu', password: 'Wrong@JU1' });
    expect(response.status).toBe(401);
  });

  it('refuses a hall that is not a JU hall, before it reaches a service', async () => {
    const response = await api.post('/api/auth/register').send({
      fullName: 'New Student',
      email: 'hall.check@juniv.edu',
      password: PASSWORD,
      gender: GENDER.MALE,
      hallName: 'Pritilata Hall',
      roomNo: '1',
    });

    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('refuses a real hall from the other gender list, with a message naming the options', async () => {
    const response = await api.post('/api/auth/register').send({
      fullName: 'New Student',
      email: 'hall.mismatch@juniv.edu',
      password: PASSWORD,
      gender: GENDER.FEMALE,
      hallName: 'SRJ',
      roomNo: '1',
    });

    expect(response.status).toBe(422);
    expect(response.body.error.message).toMatch(/not one of your halls/);
    expect(response.body.error.message).toMatch(/PRH/);
  });

  it('registers a student into a hall of their own gender', async () => {
    const response = await api.post('/api/auth/register').send({
      fullName: 'New Student',
      email: 'hall.ok@juniv.edu',
      password: PASSWORD,
      gender: GENDER.FEMALE,
      hallName: 'J24H',
      roomNo: '1',
    });

    expect(response.status).toBe(201);
    expect(response.body.data.user.gender).toBe(GENDER.FEMALE);
  });

  it('rejects a malformed body before it reaches a service', async () => {
    const response = await api.post('/api/auth/register').send({ fullName: 'X' });
    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('registers, verifies, and signs in end to end', async () => {
    const registration = await api.post('/api/auth/register').send({
      fullName: 'New Student',
      email: 'new.student@juniv.edu',
      password: PASSWORD,
      role: USER_ROLE.STUDENT,
    });
    expect(registration.status).toBe(201);

    // Signing in before verification is refused (BR-02).
    expect(
      (
        await api
          .post('/api/auth/login')
          .send({ identifier: 'new.student@juniv.edu', password: PASSWORD })
      ).status
    ).toBe(403);

    const token = new URL(registration.body.data.verificationLink).searchParams.get('token');
    expect((await api.post('/api/auth/verify').send({ token })).status).toBe(200);

    expect(
      (
        await api
          .post('/api/auth/login')
          .send({ identifier: 'new.student@juniv.edu', password: PASSWORD })
      ).status
    ).toBe(200);
  });

  it('renews a session from the refresh cookie', async () => {
    const agent = request.agent(application.instance);
    await agent
      .post('/api/auth/login')
      .send({ identifier: 'farhan@juniv.edu', password: PASSWORD });

    const renewed = await agent.post('/api/auth/refresh');
    expect(renewed.status).toBe(200);
    expect(renewed.body.data.accessToken).toBeTruthy();
  });

  it('ends the session on sign-out', async () => {
    const agent = request.agent(application.instance);
    await agent
      .post('/api/auth/login')
      .send({ identifier: 'farhan@juniv.edu', password: PASSWORD });
    await agent.post('/api/auth/logout');

    expect((await agent.post('/api/auth/refresh')).status).toBe(401);
  });

  it('returns the signed-in profile', async () => {
    const token = await signIn('farhan@juniv.edu');
    const response = await as(api.get('/api/auth/me'), token);

    expect(response.body.data.role).toBe(USER_ROLE.STUDENT);
    expect(response.body.data.profile.hallName).toBe('SRJ');
    expect(response.body.data.gender).toBe(GENDER.MALE);
    expect(response.body.data).not.toHaveProperty('passwordHash');
  });
});

describe('discovery', () => {
  it('lists approved shops to a visitor with no account', async () => {
    const response = await api.get('/api/shops');
    expect(response.status).toBe(200);
    expect(response.body.data.length).toBeGreaterThan(0);
    expect(response.body.meta.totalCount).toBeGreaterThan(0);
  });

  it('returns a shop with its menu', async () => {
    const { body } = await api.get('/api/shops');
    const detail = await api.get(`/api/shops/${body.data[0].id}`);

    expect(detail.status).toBe(200);
    expect(detail.body.data.menu.length).toBeGreaterThan(0);
  });

  it('matches partially (FR-C2)', async () => {
    const response = await api.get('/api/search').query({ q: 'khich' });
    expect(response.status).toBe(200);
    expect(response.body.data.items[0].name).toBe('Khichuri');
  });

  it('refuses a query too short to be useful', async () => {
    expect((await api.get('/api/search').query({ q: 'k' })).status).toBe(422);
  });

  it('answers 404 for a shop that does not exist', async () => {
    expect((await api.get('/api/shops/no-such-shop')).status).toBe(404);
  });
});

describe('role-based access', () => {
  it('refuses a student the admin endpoints', async () => {
    const token = await signIn('farhan@juniv.edu');
    expect((await as(api.get('/api/admin/users'), token)).status).toBe(403);
  });

  it('refuses a vendor a student cart', async () => {
    const token = await signIn('shihab.vendor@juniv.edu');
    expect((await as(api.get('/api/cart'), token)).status).toBe(403);
  });

  it('lets an admin through', async () => {
    const token = await signIn('admin@juniv.edu');
    expect((await as(api.get('/api/admin/users'), token)).status).toBe(200);
  });

  it('refuses a vendor acting on another vendor’s shop (IDOR)', async () => {
    const token = await signIn('sanjida.vendor@juniv.edu');
    const shops = await api.get('/api/shops');
    const otherShop = shops.body.data.find((shop) => shop.shopName === 'Bot Tola Bhorta Ghor');

    const response = await as(api.patch(`/api/shops/${otherShop.id}/status`), token).send({
      isOpen: false,
    });
    expect(response.status).toBe(403);
  });
});

describe('the full order lifecycle', () => {
  it('runs from cart to delivered, refusing every illegal move on the way', async () => {
    const studentToken = await signIn('farhan@juniv.edu');
    const riderToken = await signIn('rahim@juniv.edu');
    const vendorToken = await signIn('shihab.vendor@juniv.edu');

    const shops = await api.get('/api/shops');
    const shopId = shops.body.data[0].id;
    const detail = await api.get(`/api/shops/${shopId}`);
    const item = detail.body.data.menu.find((entry) => entry.isAvailable);

    // Cart (FR-C4, FR-C5).
    const added = await as(api.post('/api/cart/items'), studentToken).send({
      menuItemId: item.id,
      quantity: 2,
    });
    expect(added.status).toBe(200);
    expect(added.body.data.itemCount).toBe(2);
    expect(added.body.data.total).toBe(added.body.data.subtotal + added.body.data.deliveryFee);

    // Checkout (UC-01).
    const placed = await as(api.post('/api/orders'), studentToken).send({
      note: 'Leave it at the gate',
    });
    expect(placed.status).toBe(201);
    const orderId = placed.body.data.order.id;
    const pin = placed.body.data.confirmPin;
    expect(pin).toMatch(/^\d{4}$/);

    // The cart is emptied only after the order exists.
    expect((await as(api.get('/api/cart'), studentToken)).body.data.isEmpty).toBe(true);

    // Vendor accepts and starts cooking (FR-B4, FR-B5).
    expect((await as(api.post(`/api/orders/${orderId}/accept`), vendorToken)).status).toBe(200);
    expect(
      (
        await as(api.patch(`/api/orders/${orderId}/status`), vendorToken).send({
          status: ORDER_STATUS.PREPARING,
        })
      ).status
    ).toBe(200);

    // BR-04: the cancellation window has closed.
    const lateCancel = await as(api.post(`/api/orders/${orderId}/cancel`), studentToken).send({});
    expect(lateCancel.status).toBe(409);

    expect(
      (
        await as(api.patch(`/api/orders/${orderId}/status`), vendorToken).send({
          status: ORDER_STATUS.READY,
        })
      ).status
    ).toBe(200);

    // Delivery (FR-D2, FR-D3).
    const feed = await as(api.get('/api/deliveries/available'), riderToken);
    expect(feed.body.data).toHaveLength(1);
    const deliveryId = feed.body.data[0].id;

    expect((await as(api.post(`/api/deliveries/${deliveryId}/accept`), riderToken)).status).toBe(
      200
    );
    // A second accept loses the race.
    expect((await as(api.post(`/api/deliveries/${deliveryId}/accept`), riderToken)).status).toBe(
      409
    );

    for (const status of [DELIVERY_STATUS.HEADING_TO_VENDOR, DELIVERY_STATUS.PICKED_UP]) {
      expect(
        (await as(api.patch(`/api/deliveries/${deliveryId}/status`), riderToken).send({ status }))
          .status
      ).toBe(200);
    }

    // BR-10: the customer's PIN is the only way to close it.
    const wrongPin = pin === '0000' ? '1111' : '0000';
    expect(
      (
        await as(api.post(`/api/deliveries/${deliveryId}/complete`), riderToken).send({
          confirmPin: wrongPin,
        })
      ).status
    ).toBe(403);

    expect(
      (
        await as(api.post(`/api/deliveries/${deliveryId}/complete`), riderToken).send({
          confirmPin: pin,
        })
      ).status
    ).toBe(200);

    // Tracking reflects the finished order (FR-E1).
    const tracked = await as(api.get(`/api/orders/${orderId}`), studentToken);
    expect(tracked.body.data.status).toBe(ORDER_STATUS.DELIVERED);
    expect(tracked.body.data.isFinal).toBe(true);

    // Ratings (FR-C9, BR-08).
    expect(
      (
        await as(api.post(`/api/orders/${orderId}/ratings`), studentToken).send({
          targetType: 'shop',
          stars: 5,
          comment: 'Fast and hot',
        })
      ).status
    ).toBe(201);
    expect(
      (
        await as(api.post(`/api/orders/${orderId}/ratings`), studentToken).send({
          targetType: 'shop',
          stars: 1,
        })
      ).status
    ).toBe(409);

    // Earnings (FR-D7).
    const earnings = await as(api.get('/api/deliveries/earnings'), riderToken);
    expect(earnings.body.data.today.count).toBe(1);

    // Notifications (FR-E2).
    const notifications = await as(api.get('/api/notifications'), studentToken);
    expect(notifications.body.data.length).toBeGreaterThan(0);
  });

  it('delivers only to a hall on the matching gender list (FR-C6)', async () => {
    const studentToken = await signIn('farhan@juniv.edu');
    const shops = await api.get('/api/shops');
    const detail = await api.get(`/api/shops/${shops.body.data[0].id}`);
    const item = detail.body.data.menu.find((entry) => entry.isAvailable);
    await as(api.post('/api/cart/items'), studentToken).send({ menuItemId: item.id });

    // A hall that is not JU's at all never reaches a service.
    const invented = await as(api.post('/api/orders'), studentToken).send({
      deliveryHall: 'Some Other Hall',
      deliveryRoom: '1',
    });
    expect(invented.status).toBe(422);

    // A real hall, but from the female list, and this student is male.
    const wrongList = await as(api.post('/api/orders'), studentToken).send({
      deliveryHall: 'PRH',
      deliveryRoom: '1',
    });
    expect(wrongList.status).toBe(422);
    expect(wrongList.body.error.message).toMatch(/not one of your halls/);

    // The cart survived both refusals, so the student can simply pick again.
    expect((await as(api.get('/api/cart'), studentToken)).body.data.isEmpty).toBe(false);

    const accepted = await as(api.post('/api/orders'), studentToken).send({
      deliveryHall: 'ABH',
      deliveryRoom: '1',
    });
    expect(accepted.status).toBe(201);
    expect(accepted.body.data.order.deliveryHall).toBe('ABH');
  });

  it('cancels while the window is still open and notifies the vendor', async () => {
    const studentToken = await signIn('farhan@juniv.edu');
    const vendorToken = await signIn('shihab.vendor@juniv.edu');

    const shops = await api.get('/api/shops');
    const detail = await api.get(`/api/shops/${shops.body.data[0].id}`);
    const item = detail.body.data.menu.find((entry) => entry.isAvailable);

    await as(api.post('/api/cart/items'), studentToken).send({ menuItemId: item.id });
    const placed = await as(api.post('/api/orders'), studentToken).send({});
    const orderId = placed.body.data.order.id;

    const cancelled = await as(api.post(`/api/orders/${orderId}/cancel`), studentToken).send({
      reason: 'Changed my mind',
    });
    expect(cancelled.status).toBe(200);
    expect(cancelled.body.data.status).toBe(ORDER_STATUS.CANCELLED);

    const vendorNotifications = await as(api.get('/api/notifications'), vendorToken);
    expect(vendorNotifications.body.data.some((entry) => entry.type === 'order_cancelled')).toBe(
      true
    );
  });

  it('refuses a cart holding two vendors (BR-03)', async () => {
    const studentToken = await signIn('farhan@juniv.edu');
    const shops = await api.get('/api/shops');

    const first = await api.get(`/api/shops/${shops.body.data[0].id}`);
    const second = await api.get(`/api/shops/${shops.body.data[1].id}`);

    await as(api.post('/api/cart/items'), studentToken).send({
      menuItemId: first.body.data.menu.find((entry) => entry.isAvailable).id,
    });
    const clash = await as(api.post('/api/cart/items'), studentToken).send({
      menuItemId: second.body.data.menu.find((entry) => entry.isAvailable).id,
    });

    expect(clash.status).toBe(409);
  });

  it('refuses a sold-out item (BR-07)', async () => {
    const studentToken = await signIn('farhan@juniv.edu');
    const shops = await api.get('/api/shops');
    const detail = await api.get(`/api/shops/${shops.body.data[0].id}`);
    const soldOut = detail.body.data.menu.find((entry) => !entry.isAvailable);

    const response = await as(api.post('/api/cart/items'), studentToken).send({
      menuItemId: soldOut.id,
    });
    expect(response.status).toBe(422);
  });
});

describe('vendor management', () => {
  it('adds a dish, marks it sold out, and removes it', async () => {
    const token = await signIn('shihab.vendor@juniv.edu');
    const mine = await as(api.get('/api/shops/mine'), token);
    const shopId = mine.body.data.id;

    const created = await as(api.post(`/api/shops/${shopId}/menu`), token).send({
      name: 'Morog Polao',
      price: 150,
      category: 'Rice',
    });
    expect(created.status).toBe(201);

    const itemId = created.body.data.id;
    const toggled = await as(
      api.patch(`/api/shops/${shopId}/menu/${itemId}/availability`),
      token
    ).send({ isAvailable: false });
    expect(toggled.body.data.isAvailable).toBe(false);

    expect((await as(api.delete(`/api/shops/${shopId}/menu/${itemId}`), token)).status).toBe(204);
  });

  it('closes the shop so students cannot order (FR-B3)', async () => {
    const vendorToken = await signIn('shihab.vendor@juniv.edu');
    const studentToken = await signIn('farhan@juniv.edu');
    const mine = await as(api.get('/api/shops/mine'), vendorToken);

    await as(api.patch(`/api/shops/${mine.body.data.id}/status`), vendorToken).send({
      isOpen: false,
    });

    const detail = await api.get(`/api/shops/${mine.body.data.id}`);
    const item = detail.body.data.menu.find((entry) => entry.isAvailable);
    const response = await as(api.post('/api/cart/items'), studentToken).send({
      menuItemId: item.id,
    });

    expect(response.status).toBe(422);
  });

  it('serves sales analytics (FR-B6)', async () => {
    const token = await signIn('shihab.vendor@juniv.edu');
    const mine = await as(api.get('/api/shops/mine'), token);

    const response = await as(api.get(`/api/shops/${mine.body.data.id}/analytics`), token);
    expect(response.status).toBe(200);
    expect(response.body.data).toHaveProperty('ordersByDay');
  });
});

describe('administration', () => {
  it('approves a pending shop (FR-G1)', async () => {
    const adminToken = await signIn('admin@juniv.edu');

    // A fresh vendor registers a shop, which starts pending.
    const registration = await api.post('/api/auth/register').send({
      fullName: 'New Vendor',
      email: 'new.vendor@juniv.edu',
      password: PASSWORD,
      role: USER_ROLE.VENDOR,
    });
    const verifyToken = new URL(registration.body.data.verificationLink).searchParams.get('token');
    await api.post('/api/auth/verify').send({ token: verifyToken });
    const vendorToken = await signIn('new.vendor@juniv.edu');

    const shop = await as(api.post('/api/shops'), vendorToken).send({
      shopName: 'Fresh Stall',
      botTolaLocation: 'Bot Tola, stall 9',
      contactPhone: '01712345678',
    });
    expect(shop.body.data.approvalStatus).toBe('pending');

    const queue = await as(api.get('/api/admin/shops'), adminToken).query({ status: 'pending' });
    expect(queue.body.data).toHaveLength(1);

    const decision = await as(
      api.post(`/api/admin/shops/${shop.body.data.id}/decision`),
      adminToken
    ).send({ approved: true });
    expect(decision.body.data.approvalStatus).toBe('approved');
  });

  it('demands a reason to reject a shop', async () => {
    const adminToken = await signIn('admin@juniv.edu');
    const shops = await api.get('/api/shops');

    const response = await as(
      api.post(`/api/admin/shops/${shops.body.data[0].id}/decision`),
      adminToken
    ).send({ approved: false });

    expect(response.status).toBe(422);
  });

  it('suspends an account and locks it out at once (FR-G2)', async () => {
    const adminToken = await signIn('admin@juniv.edu');
    const studentToken = await signIn('nusrat@juniv.edu');

    const users = await as(api.get('/api/admin/users'), adminToken).query({ search: 'Nusrat' });
    const target = users.body.data[0];

    await as(api.patch(`/api/admin/users/${target.id}/status`), adminToken).send({
      suspended: true,
    });

    // The access token is still valid; the account is not.
    expect((await as(api.get('/api/cart'), studentToken)).status).toBe(403);
  });

  it('serves the audit trail and platform analytics', async () => {
    const adminToken = await signIn('admin@juniv.edu');

    expect((await as(api.get('/api/admin/audit-logs'), adminToken)).status).toBe(200);
    expect((await as(api.get('/api/admin/analytics'), adminToken)).status).toBe(200);
    expect((await as(api.get('/api/admin/summary'), adminToken)).status).toBe(200);
  });

  it('changes the delivery fee, and the next order pays it (FR-G6)', async () => {
    const adminToken = await signIn('admin@juniv.edu');
    await as(api.put('/api/admin/settings'), adminToken).send({
      key: 'deliveryFeeBdt',
      value: 40,
    });

    const studentToken = await signIn('farhan@juniv.edu');
    const shops = await api.get('/api/shops');
    const detail = await api.get(`/api/shops/${shops.body.data[0].id}`);
    const item = detail.body.data.menu.find((entry) => entry.isAvailable);

    const cart = await as(api.post('/api/cart/items'), studentToken).send({ menuItemId: item.id });
    expect(cart.body.data.deliveryFee).toBe(40);
  });
});

describe('notifications', () => {
  it('counts and clears unread messages', async () => {
    const studentToken = await signIn('farhan@juniv.edu');
    const vendorToken = await signIn('shihab.vendor@juniv.edu');

    const shops = await api.get('/api/shops');
    const detail = await api.get(`/api/shops/${shops.body.data[0].id}`);
    const item = detail.body.data.menu.find((entry) => entry.isAvailable);

    await as(api.post('/api/cart/items'), studentToken).send({ menuItemId: item.id });
    const placed = await as(api.post('/api/orders'), studentToken).send({});
    await as(api.post(`/api/orders/${placed.body.data.order.id}/accept`), vendorToken);

    const unread = await as(api.get('/api/notifications/unread-count'), studentToken);
    expect(unread.body.data.unread).toBeGreaterThan(0);

    await as(api.post('/api/notifications/read-all'), studentToken);
    expect(
      (await as(api.get('/api/notifications/unread-count'), studentToken)).body.data.unread
    ).toBe(0);
  });
});

describe('deliver mode', () => {
  it('refuses the feed until the student goes online (FR-D1)', async () => {
    const token = await signIn('nusrat@juniv.edu');
    expect((await as(api.get('/api/deliveries/available'), token)).status).toBe(403);

    await as(api.patch('/api/users/deliver-mode'), token).send({ enabled: true });
    expect((await as(api.get('/api/deliveries/available'), token)).status).toBe(200);
  });
});
