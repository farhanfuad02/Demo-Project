/**
 * @file The MongoDB engine, exercised against a real server.
 *
 * The rest of the suite runs on the in-process store, which is the right default: it is
 * fast and it needs nothing installed. But an engine is only interchangeable if something
 * proves it, so this file starts a real `mongod` (a one-node replica set, because
 * transactions need one) and runs two things against it — the storage contract itself,
 * and the whole ordering flow over HTTP, with every repository, service, and controller
 * unchanged. If the seam holds, this passes without a line of application code knowing
 * which engine it is talking to.
 *
 * The server is skipped rather than failed when its binary cannot be started, so a
 * checkout on a machine that has never downloaded it still runs the rest of the suite.
 *
 * @module tests/integration/mongo-database
 */

import { afterAll, beforeEach, describe, expect, it } from '@jest/globals';
import request from 'supertest';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { DELIVERY_STATUS, ORDER_STATUS } from '@hungry-ju/shared/enums';
import { Application } from '../../src/app.js';
import { TOKENS } from '../../src/config/container.js';
import { MongoDatabase } from '../../src/config/database/mongo-database.js';
import { Env } from '../../src/config/env.js';
import { ConflictError, NotFoundError } from '../../src/core/errors/app-error.js';
import { Logger } from '../../src/lib/logger.js';
import { PasswordService } from '../../src/services/password-service.js';
import { Seeder } from '../../src/config/database/seed.js';
import { QueryOptions } from '../../src/utils/query-options.js';

/** The password every seeded account shares. */
const PASSWORD = 'Hungry@JU1';

/** How long a cold `mongod` start may take before the suite gives up. */
const BOOT_TIMEOUT_MS = 120_000;

/**
 * Starts a one-node replica set, or reports that MongoDB is unavailable here.
 *
 * @returns {Promise<MongoMemoryReplSet | null>} The running server, or `null`.
 */
async function startServer() {
  try {
    return await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  } catch {
    return null;
  }
}

const server = await startServer();
const describeMongo = server ? describe : describe.skip;

/** @type {MongoDatabase} */
let db;
/** @type {number} */
let databaseSuffix = 0;

afterAll(async () => {
  await db?.disconnect();
  await server?.stop();
});

/**
 * A connected engine over a database of its own.
 *
 * Each test gets a fresh database name rather than sharing one and truncating between
 * runs: a shared store makes tests order-dependent, which is the failure mode that wastes
 * the most time to diagnose.
 *
 * @returns {Promise<MongoDatabase>} The connected engine.
 */
async function connect() {
  await db?.disconnect();
  databaseSuffix += 1;
  db = new MongoDatabase({
    uri: server.getUri(),
    databaseName: `hungry_ju_test_${process.pid}_${databaseSuffix}`,
  });
  return db.connect();
}

describeMongo('MongoDatabase', () => {
  beforeEach(async () => {
    await connect();
  }, BOOT_TIMEOUT_MS);

  it('reports the deployment can run transactions', () => {
    expect(db.supportsTransactions).toBe(true);
  });

  it('answers the readiness probe', async () => {
    await expect(db.healthCheck()).resolves.toBe(true);
  });

  it('refuses a table it was never told about', () => {
    expect(() => db.collection('invoices')).toThrow(NotFoundError);
  });

  it('assigns a primary key when the caller supplies none, and reads it back as id', async () => {
    const stored = await db.insert('shops', { id: null, shop_name: 'Bot Tola Bhorta Ghor' });

    expect(stored.id).toEqual(expect.any(String));
    expect(stored).not.toHaveProperty('_id');
    await expect(db.findById('shops', stored.id)).resolves.toEqual(stored);
  });

  it('keeps a primary key the caller chose', async () => {
    await db.insert('shops', { id: 'shop-1', shop_name: 'Akhi Fast Food' });
    await expect(db.findById('shops', 'shop-1')).resolves.toMatchObject({ id: 'shop-1' });
  });

  it('returns null rather than throwing for a row that is not there', async () => {
    await expect(db.findById('shops', 'missing')).resolves.toBeNull();
    await expect(db.findOne('shops', { shop_name: 'missing' })).resolves.toBeNull();
  });

  describe('criteria', () => {
    beforeEach(async () => {
      await db.insert('orders', { id: 'a', status: 'placed', total: 120, note: 'Khichuri' });
      await db.insert('orders', { id: 'b', status: 'accepted', total: 60, note: 'Dal' });
      await db.insert('orders', { id: 'c', status: 'delivered', total: 200, note: null });
    });

    /**
     * The ids matching a filter, sorted so the assertion does not depend on scan order.
     *
     * @param {import('@hungry-ju/shared/types').Criteria} criteria - Filter to apply.
     * @returns {Promise<string[]>} Matching ids.
     */
    const idsFor = async (criteria) =>
      (await db.findMany('orders', criteria)).map((row) => row.id).sort();

    it('combines criteria with AND', async () => {
      await expect(idsFor({ status: 'placed', total: 120 })).resolves.toEqual(['a']);
      await expect(idsFor({ status: 'placed', total: 999 })).resolves.toEqual([]);
    });

    it('matches null exactly, which is how an unassigned rider is found', async () => {
      await expect(idsFor({ note: null })).resolves.toEqual(['c']);
    });

    it.each([
      [{ status: { $in: ['placed', 'accepted'] } }, ['a', 'b']],
      [{ status: { $nin: ['delivered'] } }, ['a', 'b']],
      [{ status: { $ne: 'delivered' } }, ['a', 'b']],
      [{ total: { $gt: 120 } }, ['c']],
      [{ total: { $gte: 120 } }, ['a', 'c']],
      [{ total: { $lt: 120 } }, ['b']],
      [{ total: { $lte: 120 } }, ['a', 'b']],
      [{ note: { $like: 'khich' } }, ['a']],
      [{ total: { $gte: 60 }, status: { $ne: 'placed' } }, ['b', 'c']],
    ])('applies %o', async (criteria, expected) => {
      await expect(idsFor(criteria)).resolves.toEqual(expected);
    });

    it('treats a fragment with regular-expression syntax as literal text', async () => {
      await db.insert('orders', { id: 'd', status: 'placed', total: 10, note: 'C++ shop' });

      await expect(idsFor({ note: { $like: 'c++' } })).resolves.toEqual(['d']);
      await expect(idsFor({ note: { $like: '.*' } })).resolves.toEqual([]);
    });

    it('matches nothing when a criterion cannot be satisfied', async () => {
      await expect(idsFor({ status: { $in: 'placed' } })).resolves.toEqual([]);
      await expect(idsFor({ status: { $nowhere: 'placed' } })).resolves.toEqual([]);
    });

    it('counts without reading the rows', async () => {
      await expect(db.count('orders', { status: { $ne: 'delivered' } })).resolves.toBe(2);
      await expect(db.count('orders', {})).resolves.toBe(3);
    });

    it('sorts and pages', async () => {
      const page = new QueryOptions({ page: 1, limit: 2, sortBy: 'total', sortDirection: 'asc' });
      const rows = await db.findMany('orders', {}, page);
      expect(rows.map((row) => row.id)).toEqual(['b', 'a']);

      const second = new QueryOptions({ page: 2, limit: 2, sortBy: 'total', sortDirection: 'asc' });
      expect((await db.findMany('orders', {}, second)).map((row) => row.id)).toEqual(['c']);
    });
  });

  describe('writes', () => {
    it('applies a partial update and leaves the other columns alone', async () => {
      await db.insert('orders', { id: 'a', status: 'placed', total: 120 });

      const updated = await db.update('orders', 'a', { status: 'accepted' });

      expect(updated).toEqual({ id: 'a', status: 'accepted', total: 120 });
    });

    it('never lets an update re-key a row', async () => {
      await db.insert('orders', { id: 'a', status: 'placed' });

      const updated = await db.update('orders', 'a', { id: 'b', status: 'accepted' });

      expect(updated.id).toBe('a');
      await expect(db.findById('orders', 'b')).resolves.toBeNull();
    });

    it('reports a row that is not there', async () => {
      await expect(db.update('orders', 'missing', { status: 'accepted' })).rejects.toThrow(
        NotFoundError
      );
    });

    it('deletes one row and reports whether it existed', async () => {
      await db.insert('orders', { id: 'a' });

      await expect(db.delete('orders', 'a')).resolves.toBe(true);
      await expect(db.delete('orders', 'a')).resolves.toBe(false);
    });

    it('deletes every row matching a filter', async () => {
      await db.insert('order_items', { id: '1', order_id: 'a' });
      await db.insert('order_items', { id: '2', order_id: 'a' });
      await db.insert('order_items', { id: '3', order_id: 'b' });

      await expect(db.deleteWhere('order_items', { order_id: 'a' })).resolves.toBe(2);
      await expect(db.count('order_items', {})).resolves.toBe(1);
    });

    it('turns a unique-index violation into a conflict rather than a crash', async () => {
      await db.insert('users', { id: 'u1', email: 'farhan@juniv.edu' });

      await expect(db.insert('users', { id: 'u2', email: 'farhan@juniv.edu' })).rejects.toThrow(
        ConflictError
      );
    });

    it('enforces one rating per order per target (BR-08) in the database itself', async () => {
      await db.insert('ratings', { id: 'r1', order_id: 'o1', target_type: 'shop', stars: 5 });

      await expect(
        db.insert('ratings', { id: 'r2', order_id: 'o1', target_type: 'shop', stars: 1 })
      ).rejects.toThrow(ConflictError);
      await expect(
        db.insert('ratings', { id: 'r3', order_id: 'o1', target_type: 'rider', stars: 4 })
      ).resolves.toMatchObject({ id: 'r3' });
    });
  });

  describe('updateWhere', () => {
    beforeEach(async () => {
      await db.insert('deliveries', { id: 'd1', status: 'available', rider_student_id: null });
    });

    it('writes while the expectation still holds', async () => {
      const claimed = await db.updateWhere(
        'deliveries',
        'd1',
        { status: 'available' },
        { status: 'accepted', rider_student_id: 'rahim' }
      );

      expect(claimed).toMatchObject({ status: 'accepted', rider_student_id: 'rahim' });
    });

    it('declines once the expectation has gone stale', async () => {
      await db.update('deliveries', 'd1', { status: 'accepted' });

      await expect(
        db.updateWhere('deliveries', 'd1', { status: 'available' }, { status: 'accepted' })
      ).resolves.toBeNull();
    });

    it('gives exactly one of many simultaneous riders the job (FR-D3)', async () => {
      const riders = ['rahim', 'nusrat', 'farhan', 'mitu', 'tanvir'];

      const results = await Promise.all(
        riders.map((rider) =>
          db.updateWhere(
            'deliveries',
            'd1',
            { status: 'available', rider_student_id: null },
            { status: 'accepted', rider_student_id: rider }
          )
        )
      );

      const winners = results.filter((result) => result !== null);
      expect(winners).toHaveLength(1);

      const stored = await db.findById('deliveries', 'd1');
      expect(stored.rider_student_id).toBe(winners[0].rider_student_id);
    });
  });

  describe('transactions', () => {
    it('commits every write in the callback', async () => {
      await db.transaction(async () => {
        await db.insert('orders', { id: 'o1', status: 'placed' });
        await db.insert('order_items', { id: 'i1', order_id: 'o1' });
      });

      await expect(db.count('orders', {})).resolves.toBe(1);
      await expect(db.count('order_items', {})).resolves.toBe(1);
    });

    it('rolls the order and its lines back together when the body throws', async () => {
      await expect(
        db.transaction(async () => {
          await db.insert('orders', { id: 'o1', status: 'placed' });
          await db.insert('order_items', { id: 'i1', order_id: 'o1' });
          throw new Error('payment declined');
        })
      ).rejects.toThrow('payment declined');

      await expect(db.count('orders', {})).resolves.toBe(0);
      await expect(db.count('order_items', {})).resolves.toBe(0);
    });

    it('lets a nested transaction join the one already open', async () => {
      const result = await db.transaction(async () => {
        await db.insert('orders', { id: 'o1', status: 'placed' });
        return db.transaction(async () => {
          await db.insert('order_items', { id: 'i1', order_id: 'o1' });
          return 'done';
        });
      });

      expect(result).toBe('done');
      await expect(db.count('order_items', {})).resolves.toBe(1);
    });
  });
});

describeMongo('the API over MongoDB', () => {
  /** @type {Application} */
  let application;
  /** @type {import('supertest').Agent} */
  let api;

  beforeEach(async () => {
    await connect();
    // bcrypt at the production cost is deliberately slow, and this flow signs in three
    // times. The cost is injected rather than mocked, so the real hashing code runs.
    const passwordService = new PasswordService({ cost: 4 });
    await new Seeder({ db, logger: new Logger({ level: 'silent' }), passwordService }).run();

    application = new Application({ db, env: Env.current });
    application.container.registerValue(TOKENS.PASSWORD_SERVICE, passwordService);
    api = request(application.instance);
  }, BOOT_TIMEOUT_MS);

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

  it('reports the store is reachable', async () => {
    const response = await api.get('/health');

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ status: 'ok', database: true });
  });

  it('seeds the demonstration dataset', async () => {
    const response = await api.get('/api/shops');

    expect(response.status).toBe(200);
    expect(response.body.data.length).toBeGreaterThan(0);
  });

  it('carries an order from cart to delivered', async () => {
    const studentToken = await signIn('farhan@juniv.edu');
    const vendorToken = await signIn('shihab.vendor@juniv.edu');
    const riderToken = await signIn('rahim@juniv.edu');

    const shops = await api.get('/api/shops');
    const shopId = shops.body.data[0].id;
    const detail = await api.get(`/api/shops/${shopId}`);
    const item = detail.body.data.menu.find((entry) => entry.isAvailable);

    const added = await as(api.post('/api/cart/items'), studentToken).send({
      menuItemId: item.id,
      quantity: 2,
    });
    expect(added.status).toBe(200);
    expect(added.body.data.itemCount).toBe(2);

    const placed = await as(api.post('/api/orders'), studentToken).send({
      note: 'Leave it at the gate',
    });
    expect(placed.status).toBe(201);
    const orderId = placed.body.data.order.id;
    const pin = placed.body.data.confirmPin;

    // The cart is emptied only after the order and its lines are both stored.
    expect((await as(api.get('/api/cart'), studentToken)).body.data.isEmpty).toBe(true);

    expect((await as(api.post(`/api/orders/${orderId}/accept`), vendorToken)).status).toBe(200);
    for (const status of [ORDER_STATUS.PREPARING, ORDER_STATUS.READY]) {
      expect(
        (await as(api.patch(`/api/orders/${orderId}/status`), vendorToken).send({ status })).status
      ).toBe(200);
    }

    const feed = await as(api.get('/api/deliveries/available'), riderToken);
    expect(feed.body.data).toHaveLength(1);
    const deliveryId = feed.body.data[0].id;

    expect((await as(api.post(`/api/deliveries/${deliveryId}/accept`), riderToken)).status).toBe(
      200
    );
    // A second accept loses the race (FR-D3).
    expect((await as(api.post(`/api/deliveries/${deliveryId}/accept`), riderToken)).status).toBe(
      409
    );

    for (const status of [DELIVERY_STATUS.HEADING_TO_VENDOR, DELIVERY_STATUS.PICKED_UP]) {
      expect(
        (await as(api.patch(`/api/deliveries/${deliveryId}/status`), riderToken).send({ status }))
          .status
      ).toBe(200);
    }

    expect(
      (
        await as(api.post(`/api/deliveries/${deliveryId}/complete`), riderToken).send({
          confirmPin: pin,
        })
      ).status
    ).toBe(200);

    const tracked = await as(api.get(`/api/orders/${orderId}`), studentToken);
    expect(tracked.body.data.status).toBe(ORDER_STATUS.DELIVERED);
    expect(tracked.body.data.isFinal).toBe(true);
  }, 60_000);

  it('refuses a second account on an e-mail that is already taken', async () => {
    const response = await api.post('/api/auth/register').send({
      fullName: 'Farhan Fuad',
      email: 'farhan@juniv.edu',
      password: PASSWORD,
      gender: 'male',
      hallName: 'SRJ',
      roomNo: '214',
    });

    expect(response.status).toBe(409);
  });
});
