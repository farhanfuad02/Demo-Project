/**
 * @file Unit tests for the storage layer.
 *
 * @module tests/unit/config/database
 */

import { beforeEach, describe, expect, it } from '@jest/globals';
import { CriteriaMatcher } from '../../../src/config/database/criteria-matcher.js';
import { Database, TABLES } from '../../../src/config/database/database.js';
import { InMemoryDatabase } from '../../../src/config/database/in-memory-database.js';
import { NotFoundError } from '../../../src/core/errors/app-error.js';
import { QueryOptions } from '../../../src/utils/query-options.js';

describe('Database', () => {
  it('cannot be constructed directly', () => {
    expect(() => new Database()).toThrow(TypeError);
  });

  it('names every table the application expects', () => {
    expect(TABLES).toContain('orders');
    expect(TABLES).toContain('deliveries');
    expect(Object.isFrozen(TABLES)).toBe(true);
  });

  it('reports which method a partial implementation is missing', async () => {
    /** A storage engine that implements nothing. */
    class Partial extends Database {}
    await expect(new Partial().connect()).rejects.toThrow(/Partial must implement connect/);
  });
});

describe('CriteriaMatcher', () => {
  const row = { id: '1', status: 'placed', total: 120, name: 'Khichuri', rider: null };

  it('matches everything when the filter is empty', () => {
    expect(CriteriaMatcher.matches(row, {})).toBe(true);
  });

  it('combines criteria with AND', () => {
    expect(CriteriaMatcher.matches(row, { status: 'placed', total: 120 })).toBe(true);
    expect(CriteriaMatcher.matches(row, { status: 'placed', total: 999 })).toBe(false);
  });

  it('matches null exactly, which is how an unassigned rider is found', () => {
    expect(CriteriaMatcher.matches(row, { rider: null })).toBe(true);
  });

  it.each([
    [{ status: { $in: ['placed', 'accepted'] } }, true],
    [{ status: { $in: ['delivered'] } }, false],
    [{ status: { $nin: ['delivered'] } }, true],
    [{ status: { $ne: 'delivered' } }, true],
    [{ total: { $gt: 100 } }, true],
    [{ total: { $gte: 120 } }, true],
    [{ total: { $lt: 100 } }, false],
    [{ total: { $lte: 120 } }, true],
    [{ name: { $like: 'khich' } }, true],
    [{ name: { $like: 'biryani' } }, false],
  ])('applies %o', (criteria, expected) => {
    expect(CriteriaMatcher.matches(row, criteria)).toBe(expected);
  });

  it('matches partially and case-insensitively, which FR-C2 requires', () => {
    expect(CriteriaMatcher.matchesValue('Khichuri', { $like: 'KHICH' })).toBe(true);
  });

  it('refuses an operator it does not know rather than matching everything', () => {
    expect(CriteriaMatcher.matchesValue(1, { $regex: '.*' })).toBe(false);
  });
});

describe('InMemoryDatabase', () => {
  /** @type {InMemoryDatabase} */
  let db;

  beforeEach(async () => {
    db = await new InMemoryDatabase().connect();
  });

  it('creates every declared table', async () => {
    expect(await db.count('users')).toBe(0);
    expect(await db.healthCheck()).toBe(true);
  });

  it('refuses to touch a table nobody declared', () => {
    expect(() => db.rows('unicorns')).toThrow(NotFoundError);
  });

  it('assigns a primary key on insert', async () => {
    const row = await db.insert('users', { full_name: 'Farhan' });
    expect(row.id).toBeTruthy();
    expect(await db.findById('users', row.id)).toMatchObject({ full_name: 'Farhan' });
  });

  it('keeps a caller-supplied key', async () => {
    const row = await db.insert('users', { id: 'fixed', full_name: 'Farhan' });
    expect(row.id).toBe('fixed');
  });

  it('returns copies, so a reader cannot mutate stored state', async () => {
    const stored = await db.insert('users', { full_name: 'Farhan' });
    const read = await db.findById('users', stored.id);
    read.full_name = 'Someone else';
    expect((await db.findById('users', stored.id)).full_name).toBe('Farhan');
  });

  it('never lets an update change the primary key', async () => {
    const row = await db.insert('users', { full_name: 'Farhan' });
    const updated = await db.update('users', row.id, { id: 'hijacked', full_name: 'Fuad' });
    expect(updated.id).toBe(row.id);
    expect(updated.full_name).toBe('Fuad');
  });

  it('fails an update against a row that is not there', async () => {
    await expect(db.update('users', 'missing', {})).rejects.toThrow(NotFoundError);
  });

  it('sorts and pages', async () => {
    for (const name of ['c', 'a', 'd', 'b']) {
      await db.insert('users', { full_name: name });
    }
    const page = await db.findMany(
      'users',
      {},
      new QueryOptions({ sortBy: 'full_name', sortDirection: 'asc', limit: 2, page: 2 })
    );
    expect(page.map((row) => row.full_name)).toEqual(['c', 'd']);
  });

  it('deletes one row and reports whether it existed', async () => {
    const row = await db.insert('users', { full_name: 'Farhan' });
    expect(await db.delete('users', row.id)).toBe(true);
    expect(await db.delete('users', row.id)).toBe(false);
  });

  it('deletes by criteria', async () => {
    await db.insert('cart_items', { cart_id: 'c1' });
    await db.insert('cart_items', { cart_id: 'c1' });
    await db.insert('cart_items', { cart_id: 'c2' });
    expect(await db.deleteWhere('cart_items', { cart_id: 'c1' })).toBe(2);
    expect(await db.count('cart_items')).toBe(1);
  });

  describe('updateWhere', () => {
    it('applies the write while the expectation still holds', async () => {
      const row = await db.insert('deliveries', { status: 'available', rider_user_id: null });
      const claimed = await db.updateWhere(
        'deliveries',
        row.id,
        { status: 'available', rider_user_id: null },
        { status: 'assigned', rider_user_id: 'rider-1' }
      );
      expect(claimed.rider_user_id).toBe('rider-1');
    });

    it('refuses once the expectation has stopped holding', async () => {
      const row = await db.insert('deliveries', { status: 'assigned', rider_user_id: 'rider-1' });
      const second = await db.updateWhere(
        'deliveries',
        row.id,
        { status: 'available', rider_user_id: null },
        { rider_user_id: 'rider-2' }
      );
      expect(second).toBeNull();
      expect((await db.findById('deliveries', row.id)).rider_user_id).toBe('rider-1');
    });

    it('lets exactly one of many simultaneous claims win', async () => {
      // This is the guarantee FR-D3 and NFR-11 are about.
      const row = await db.insert('deliveries', { status: 'available', rider_user_id: null });
      const attempts = Array.from({ length: 20 }, (unused, index) =>
        db.updateWhere(
          'deliveries',
          row.id,
          { status: 'available', rider_user_id: null },
          { status: 'assigned', rider_user_id: `rider-${index}` }
        )
      );
      const winners = (await Promise.all(attempts)).filter(Boolean);
      expect(winners).toHaveLength(1);
    });
  });

  describe('transaction', () => {
    it('commits every write when the body succeeds', async () => {
      await db.transaction(async () => {
        await db.insert('orders', { reference: 'HJU-1' });
        await db.insert('order_items', { item_name_snapshot: 'Khichuri' });
      });
      expect(await db.count('orders')).toBe(1);
      expect(await db.count('order_items')).toBe(1);
    });

    it('rolls every write back when the body throws', async () => {
      await expect(
        db.transaction(async () => {
          await db.insert('orders', { reference: 'HJU-2' });
          throw new Error('line insert failed');
        })
      ).rejects.toThrow('line insert failed');

      // An order row with no lines would be an unpayable order.
      expect(await db.count('orders')).toBe(0);
    });

    it('lets a nested transaction join the outer one instead of dead-locking', async () => {
      const result = await db.transaction(async () => {
        await db.insert('orders', { reference: 'outer' });
        return db.transaction(async () => {
          await db.insert('orders', { reference: 'inner' });
          return 'done';
        });
      });
      expect(result).toBe('done');
      expect(await db.count('orders')).toBe(2);
    });

    it('keeps serving transactions after one of them fails', async () => {
      await expect(db.transaction(async () => Promise.reject(new Error('first')))).rejects.toThrow(
        'first'
      );
      await expect(db.transaction(async () => 'second')).resolves.toBe('second');
    });
  });
});
