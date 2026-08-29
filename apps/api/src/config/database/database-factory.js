/**
 * @file Chooses and builds the storage engine the process will run on.
 *
 * @module config/database/database-factory
 */

import { JsonFileDatabase } from './json-file-database.js';
import { MongoDatabase } from './mongo-database.js';

/** Engine names `DATABASE_DRIVER` accepts. */
export const DATABASE_DRIVER = Object.freeze({
  MONGODB: 'mongodb',
  JSON: 'json',
});

/**
 * Builds the storage engine described by the environment.
 *
 * The choice is made in one place so that `server.js`, the seeder, and any future script
 * all boot the same engine without each repeating the decision. The default is
 * deliberate: set `MONGODB_URI` and you get MongoDB, set nothing and you get the JSON
 * file that has always worked offline. Nobody has to configure a database to run the
 * project, and nobody has to edit code to use a real one.
 *
 * @param {import('../env.js').Env} env - Process configuration.
 * @returns {import('./database.js').Database} An unconnected engine; call `connect()`.
 * @throws {Error} When `DATABASE_DRIVER=mongodb` but no connection string was given.
 */
export function createDatabase(env) {
  if (env.databaseDriver === DATABASE_DRIVER.MONGODB) {
    if (!env.mongodbUri) {
      throw new Error('DATABASE_DRIVER is "mongodb" but MONGODB_URI is not set.');
    }
    return new MongoDatabase({ uri: env.mongodbUri, databaseName: env.mongodbDatabase });
  }
  return new JsonFileDatabase(env.databaseFile);
}

/**
 * A one-line description of where the data lives, for the boot log.
 *
 * @param {import('./database.js').Database} db - The engine that was built.
 * @returns {Record<string, unknown>} Fields to log alongside "Database ready".
 */
export function describeDatabase(db) {
  if (db instanceof MongoDatabase) {
    return {
      driver: DATABASE_DRIVER.MONGODB,
      database: db.databaseName,
      transactions: db.supportsTransactions ? 'enabled' : 'unavailable (not a replica set)',
    };
  }
  return { driver: DATABASE_DRIVER.JSON, file: db.filePath };
}
