/**
 * @file Unit tests for engine selection.
 *
 * @module tests/unit/config/database-factory
 */

import { describe, expect, it } from '@jest/globals';
import { createDatabase, describeDatabase } from '../../../src/config/database/database-factory.js';
import { JsonFileDatabase } from '../../../src/config/database/json-file-database.js';
import { MongoDatabase } from '../../../src/config/database/mongo-database.js';
import { Env } from '../../../src/config/env.js';

/**
 * A configuration built from nothing but the variables under test.
 *
 * @param {Record<string, string>} values - Variables to set.
 * @returns {Env} The configuration.
 */
function envWith(values) {
  return new Env({ NODE_ENV: 'test', ...values });
}

describe('createDatabase', () => {
  it('uses the JSON file when nothing is configured', () => {
    expect(createDatabase(envWith({}))).toBeInstanceOf(JsonFileDatabase);
  });

  it('uses MongoDB as soon as a connection string is given', () => {
    const db = createDatabase(envWith({ MONGODB_URI: 'mongodb://localhost:27017/hungry_ju' }));

    expect(db).toBeInstanceOf(MongoDatabase);
    expect(db.databaseName).toBe('hungry_ju');
  });

  it('lets the database name be overridden separately from the URI', () => {
    const db = createDatabase(
      envWith({ MONGODB_URI: 'mongodb://localhost:27017/ignored', MONGODB_DB_NAME: 'chosen' })
    );

    expect(db.databaseName).toBe('chosen');
  });

  it('lets the driver be pinned back to the JSON file while a URI is still set', () => {
    const db = createDatabase(
      envWith({ MONGODB_URI: 'mongodb://localhost:27017/hungry_ju', DATABASE_DRIVER: 'json' })
    );

    expect(db).toBeInstanceOf(JsonFileDatabase);
  });

  it('fails loudly rather than falling back when MongoDB is asked for without a URI', () => {
    expect(() => createDatabase(envWith({ DATABASE_DRIVER: 'mongodb' }))).toThrow(/MONGODB_URI/);
  });
});

describe('describeDatabase', () => {
  it('names the file the JSON store writes to', () => {
    const description = describeDatabase(createDatabase(envWith({})));

    expect(description.driver).toBe('json');
    expect(description.file).toEqual(expect.stringContaining('hungry-ju.json'));
  });

  it('names the MongoDB database and whether transactions are available', () => {
    const description = describeDatabase(
      createDatabase(envWith({ MONGODB_URI: 'mongodb://localhost:27017/hungry_ju' }))
    );

    expect(description).toEqual({
      driver: 'mongodb',
      database: 'hungry_ju',
      transactions: 'unavailable (not a replica set)',
    });
  });
});
