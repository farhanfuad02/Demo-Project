/**
 * @file Unit tests for the row/criteria to document translation.
 *
 * @module tests/unit/config/mongo-mapper
 */

import { describe, expect, it } from '@jest/globals';
import { MongoDatabase } from '../../../src/config/database/mongo-database.js';
import { MongoMapper } from '../../../src/config/database/mongo-mapper.js';
import { QueryOptions } from '../../../src/utils/query-options.js';

describe('MongoMapper', () => {
  describe('rows and documents', () => {
    it('renames the primary key in both directions', () => {
      expect(MongoMapper.toRow({ _id: 'o1', status: 'placed' })).toEqual({
        id: 'o1',
        status: 'placed',
      });
      expect(MongoMapper.toDocument({ id: 'o1', status: 'placed' }, 'unused')).toEqual({
        _id: 'o1',
        status: 'placed',
      });
    });

    it('passes a missing row straight through', () => {
      expect(MongoMapper.toRow(null)).toBeNull();
    });

    it('assigns the fallback key when the row carries none', () => {
      expect(MongoMapper.toDocument({ id: null, status: 'placed' }, 'generated')._id).toBe(
        'generated'
      );
      expect(MongoMapper.toDocument({ status: 'placed' }, 'generated')._id).toBe('generated');
    });

    it('refuses to let an update re-key a row', () => {
      expect(MongoMapper.writableChanges({ id: 'other', status: 'accepted' })).toEqual({
        status: 'accepted',
      });
    });
  });

  describe('filters', () => {
    it('matches everything when the criteria are empty', () => {
      expect(MongoMapper.toFilter()).toEqual({});
      expect(MongoMapper.toFilter({})).toEqual({});
    });

    it('translates the primary key', () => {
      expect(MongoMapper.toFilter({ id: 'o1' })).toEqual({ _id: 'o1' });
    });

    it('keeps a null criterion as an exact match', () => {
      expect(MongoMapper.toFilter({ rider_student_id: null })).toEqual({ rider_student_id: null });
    });

    it.each([
      [{ status: { $in: ['placed'] } }, { status: { $in: ['placed'] } }],
      [{ status: { $nin: ['placed'] } }, { status: { $nin: ['placed'] } }],
      [{ status: { $ne: 'placed' } }, { status: { $ne: 'placed' } }],
      [{ total: { $gt: 1 } }, { total: { $gt: 1 } }],
      [{ total: { $gte: 1 } }, { total: { $gte: 1 } }],
      [{ total: { $lt: 1 } }, { total: { $lt: 1 } }],
      [{ total: { $lte: 1 } }, { total: { $lte: 1 } }],
    ])('carries %o across unchanged', (criteria, expected) => {
      expect(MongoMapper.toFilter(criteria)).toEqual(expected);
    });

    it('combines two operators on one column', () => {
      expect(MongoMapper.toFilter({ total: { $gte: 60, $lt: 200 } })).toEqual({
        total: { $gte: 60, $lt: 200 },
      });
    });

    it('turns a substring test into a case-insensitive regular expression', () => {
      expect(MongoMapper.toFilter({ full_name: { $like: 'nusrat' } })).toEqual({
        full_name: { $regex: 'nusrat', $options: 'i' },
      });
    });

    it('escapes regular-expression syntax in the fragment', () => {
      // Unescaped, `.*` would match every row and `c++` would not be a valid pattern at
      // all — a search box is user input, and this is where it stops being one.
      expect(MongoMapper.toFilter({ name: { $like: 'c++ (.*)' } }).name.$regex).toBe(
        'c\\+\\+ \\(\\.\\*\\)'
      );
    });

    it.each([
      ['an operator nobody implements', { status: { $nowhere: 'placed' } }],
      ['a membership test without a list', { status: { $in: 'placed' } }],
      ['an exclusion test without a list', { status: { $nin: 'placed' } }],
    ])('answers with an unsatisfiable filter for %s', (_label, criteria) => {
      expect(MongoMapper.toFilter(criteria)).toEqual({ _id: { $in: [] } });
    });
  });

  describe('sorting', () => {
    it('leaves the order to the store when nothing was asked for', () => {
      expect(MongoMapper.toSort()).toBeNull();
      expect(MongoMapper.toSort(new QueryOptions({}))).toBeNull();
    });

    it('breaks ties on the primary key so paging cannot repeat or skip a row', () => {
      const options = new QueryOptions({ sortBy: 'placed_at', sortDirection: 'desc' });

      expect(MongoMapper.toSort(options)).toEqual({ placed_at: -1, _id: -1 });
    });

    it('sorts ascending when asked', () => {
      const options = new QueryOptions({ sortBy: 'total', sortDirection: 'asc' });

      expect(MongoMapper.toSort(options)).toEqual({ total: 1, _id: 1 });
    });
  });
});

describe('MongoDatabase', () => {
  it('refuses to be built without a connection string', () => {
    expect(() => new MongoDatabase({ uri: '' })).toThrow(TypeError);
  });

  it.each([
    ['mongodb://localhost:27017/hungry_ju', 'hungry_ju'],
    ['mongodb://localhost:27017/hungry_ju?replicaSet=rs0', 'hungry_ju'],
    ['mongodb+srv://user:pw@cluster.mongodb.net/hungry_ju?retryWrites=true', 'hungry_ju'],
    ['mongodb://localhost:27017', ''],
    ['mongodb://localhost:27017/?replicaSet=rs0', ''],
  ])('reads the database name out of %s', (uri, expected) => {
    expect(MongoDatabase.databaseNameFromUri(uri)).toBe(expected);
  });

  it('falls back to a default name when neither the URI nor the caller names one', () => {
    expect(new MongoDatabase({ uri: 'mongodb://localhost:27017' }).databaseName).toBe('hungry_ju');
  });

  it('prefers the name the caller passed over the one in the URI', () => {
    const db = new MongoDatabase({
      uri: 'mongodb://localhost:27017/from_uri',
      databaseName: 'from_caller',
    });

    expect(db.databaseName).toBe('from_caller');
  });

  it('reports no transaction support before it has connected', () => {
    expect(new MongoDatabase({ uri: 'mongodb://localhost:27017' }).supportsTransactions).toBe(
      false
    );
  });

  it('refuses to work before it is connected', async () => {
    const db = new MongoDatabase({ uri: 'mongodb://localhost:27017' });

    expect(() => db.collection('orders')).toThrow(/not connected/);
    await expect(db.healthCheck()).resolves.toBe(false);
  });
});
