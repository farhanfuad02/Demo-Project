/**
 * @file MongoDB implementation of the storage contract.
 *
 * @module config/database/mongo-database
 */

import { AsyncLocalStorage } from 'node:async_hooks';
import { MongoClient } from 'mongodb';
import { ConflictError, NotFoundError } from '../../core/errors/app-error.js';
import { Identifier } from '../../utils/identifier.js';
import { Database, TABLES } from './database.js';
import { MongoMapper } from './mongo-mapper.js';
import { MONGO_INDEXES } from './mongo-indexes.js';

/** Server error code for a duplicate key, which a unique index raises on violation. */
const DUPLICATE_KEY = 11000;

/** Server error code for `NamespaceExists`, returned when a collection is already there. */
const NAMESPACE_EXISTS = 48;

/** Server error code for `IndexOptionsConflict`. */
const INDEX_OPTIONS_CONFLICT = 85;

/** Server error code for `IndexKeySpecsConflict`. */
const INDEX_KEY_SPECS_CONFLICT = 86;

/**
 * Storage backed by MongoDB.
 *
 * This is the engine the storage seam was built for: `Database` exists so the MVP could
 * ship on a JSON file and a later phase could move to a real server by adding one
 * subclass rather than editing thirteen repositories (SRS section 10). Nothing above this
 * file knows which engine is running.
 *
 * Two details are worth naming, because they are where a document store and the
 * in-process store could quietly disagree:
 *
 * - The application's primary key is `id` and MongoDB's is `_id`. {@link MongoMapper}
 *   renames in both directions, so a row read back here is shaped exactly like one read
 *   back from the JSON store.
 * - `updateWhere` becomes a single `findOneAndUpdate`, which the server applies
 *   atomically. That is a stronger guarantee than the in-process store can give and it is
 *   what first-accept-wins delivery assignment rests on (FR-D3, NFR-11, risk R4): of two
 *   riders tapping Accept at the same instant, the second one's filter no longer matches
 *   and it gets `null` back.
 *
 * @augments Database
 */
export class MongoDatabase extends Database {
  /** @type {string} */
  #uri;

  /** @type {string} */
  #databaseName;

  /** @type {MongoClient | null} */
  #client = null;

  /** @type {import('mongodb').Db | null} */
  #db = null;

  /** @type {import('mongodb').MongoClientOptions} */
  #clientOptions;

  /** @type {boolean} */
  #supportsTransactions = false;

  /**
   * Carries the active session down to every operation the callback performs, so a
   * repository does not have to accept and forward a session it has no business knowing
   * about. Passing one explicitly would mean changing the signature of every method on
   * `Database` for the benefit of a single engine.
   *
   * @type {AsyncLocalStorage<{ session: import('mongodb').ClientSession }>}
   */
  #sessions = new AsyncLocalStorage();

  /**
   * @param {object} options - Connection settings.
   * @param {string} options.uri - MongoDB connection string.
   * @param {string} [options.databaseName] - Database to use; defaults to the URI's own.
   * @param {import('mongodb').MongoClientOptions} [options.clientOptions] - Driver overrides.
   */
  constructor({ uri, databaseName = undefined, clientOptions = {} }) {
    super();
    if (!uri) {
      throw new TypeError('MongoDatabase requires a connection URI');
    }
    this.#uri = uri;
    this.#databaseName = databaseName || MongoDatabase.databaseNameFromUri(uri) || 'hungry_ju';
    this.#clientOptions = {
      // `undefined` in a change set means "leave this column alone", which is how the
      // in-process store behaves when it spreads an undefined property. Without this the
      // driver would write an explicit null and erase the column instead.
      ignoreUndefined: true,
      serverSelectionTimeoutMS: 10_000,
      ...clientOptions,
    };
  }

  /**
   * Reads the database name out of a connection string.
   *
   * @param {string} uri - MongoDB connection string.
   * @returns {string} Database name, or an empty string when the URI names none.
   */
  static databaseNameFromUri(uri) {
    const withoutQuery = uri.split('?')[0];
    const separator = withoutQuery.indexOf('/', withoutQuery.indexOf('//') + 2);
    if (separator === -1) {
      return '';
    }
    return decodeURIComponent(withoutQuery.slice(separator + 1));
  }

  /**
   * Name of the database in use.
   *
   * @returns {string} Database name.
   */
  get databaseName() {
    return this.#databaseName;
  }

  /**
   * Whether the deployment can run multi-document transactions.
   *
   * A single `mongod` cannot: transactions need a replica set or a sharded cluster. Atlas
   * and any `--replSet` deployment can, and the answer is settled once at connect time.
   *
   * @returns {boolean} `true` when transactions are available.
   */
  get supportsTransactions() {
    return this.#supportsTransactions;
  }

  /**
   * Opens the connection, creates every declared collection, and builds the indexes.
   *
   * Collections are created up front rather than left to appear on first insert, so an
   * empty database looks the same as the JSON store's empty database and a typo in a
   * table name fails at boot instead of silently writing into a new collection.
   *
   * @returns {Promise<this>} The connected database.
   */
  async connect() {
    if (this.#client) {
      return this;
    }

    const client = new MongoClient(this.#uri, this.#clientOptions);
    await client.connect();
    this.#client = client;
    this.#db = client.db(this.#databaseName);

    this.#supportsTransactions = await this.#detectTransactionSupport();
    await this.#createCollections();
    await this.#createIndexes();

    return this;
  }

  /**
   * Closes the connection.
   *
   * @returns {Promise<void>} Resolves once the driver has shut down.
   */
  async disconnect() {
    if (!this.#client) {
      return;
    }
    const client = this.#client;
    this.#client = null;
    this.#db = null;
    await client.close();
  }

  /**
   * Pings the server (NFR-05).
   *
   * @returns {Promise<boolean>} `true` when the server answers.
   */
  async healthCheck() {
    if (!this.#db) {
      return false;
    }
    try {
      await this.#db.command({ ping: 1 });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * The collection behind a declared table.
   *
   * @param {string} table - Table name.
   * @returns {import('mongodb').Collection} The collection.
   * @throws {Error} When the database is not connected.
   * @throws {NotFoundError} When the table was never declared in {@link TABLES}.
   */
  collection(table) {
    if (!this.#db) {
      throw new Error('MongoDatabase is not connected: call connect() first');
    }
    if (!TABLES.includes(table)) {
      throw new NotFoundError(`Table "${table}"`);
    }
    return this.#db.collection(table);
  }

  /**
   * Reads one row by primary key.
   *
   * @param {string} table - Table name.
   * @param {string} id - Primary key.
   * @returns {Promise<import('@hungry-ju/shared/types').PersistenceRow | null>} Row or `null`.
   */
  async findById(table, id) {
    const document = await this.collection(table).findOne({ _id: id }, this.#options());
    return MongoMapper.toRow(document);
  }

  /**
   * Reads the first row matching the criteria.
   *
   * @param {string} table - Table name.
   * @param {import('@hungry-ju/shared/types').Criteria} [criteria] - Filter.
   * @returns {Promise<import('@hungry-ju/shared/types').PersistenceRow | null>} Row or `null`.
   */
  async findOne(table, criteria = {}) {
    const document = await this.collection(table).findOne(
      MongoMapper.toFilter(criteria),
      this.#options()
    );
    return MongoMapper.toRow(document);
  }

  /**
   * Reads every row matching the criteria, sorted and paged.
   *
   * @param {string} table - Table name.
   * @param {import('@hungry-ju/shared/types').Criteria} [criteria] - Filter.
   * @param {import('../../utils/query-options.js').QueryOptions} [options] - Sort/page window.
   * @returns {Promise<import('@hungry-ju/shared/types').PersistenceRow[]>} Matching rows.
   */
  async findMany(table, criteria = {}, options = undefined) {
    let cursor = this.collection(table).find(MongoMapper.toFilter(criteria), this.#options());

    const sort = MongoMapper.toSort(options);
    if (sort) {
      cursor = cursor.sort(sort);
    }
    if (options) {
      cursor = cursor.skip(options.offset).limit(options.limit);
    }

    const documents = await cursor.toArray();
    return documents.map((document) => MongoMapper.toRow(document));
  }

  /**
   * Counts rows matching the criteria.
   *
   * @param {string} table - Table name.
   * @param {import('@hungry-ju/shared/types').Criteria} [criteria] - Filter.
   * @returns {Promise<number>} Matching row count.
   */
  async count(table, criteria = {}) {
    return this.collection(table).countDocuments(MongoMapper.toFilter(criteria), this.#options());
  }

  /**
   * Inserts a row, assigning a primary key when the caller did not supply one.
   *
   * @param {string} table - Table name.
   * @param {import('@hungry-ju/shared/types').PersistenceRow} row - Row to write.
   * @returns {Promise<import('@hungry-ju/shared/types').PersistenceRow>} The stored row.
   * @throws {ConflictError} When the row violates a unique index.
   */
  async insert(table, row) {
    const document = MongoMapper.toDocument(row, Identifier.uuid());
    try {
      await this.collection(table).insertOne(document, this.#options());
    } catch (error) {
      throw MongoDatabase.#translateError(error, table);
    }
    return MongoMapper.toRow(document);
  }

  /**
   * Applies a partial update to one row.
   *
   * @param {string} table - Table name.
   * @param {string} id - Primary key.
   * @param {Record<string, unknown>} changes - Columns to write.
   * @returns {Promise<import('@hungry-ju/shared/types').PersistenceRow>} The stored row.
   * @throws {NotFoundError} When no row has that key.
   * @throws {ConflictError} When the change violates a unique index.
   */
  async update(table, id, changes) {
    const row = await this.#applyUpdate(table, { _id: id }, changes);
    if (!row) {
      throw new NotFoundError(table);
    }
    return row;
  }

  /**
   * Updates a row only while it still matches the expected column values.
   *
   * The whole operation is one `findOneAndUpdate`, so the read and the write cannot be
   * separated by another writer. This is the primitive behind first-accept-wins delivery
   * assignment (FR-D3).
   *
   * @param {string} table - Table name.
   * @param {string} id - Primary key.
   * @param {import('@hungry-ju/shared/types').Criteria} expected - Columns that must hold.
   * @param {Record<string, unknown>} changes - Columns to write.
   * @returns {Promise<import('@hungry-ju/shared/types').PersistenceRow | null>} Stored row, or
   *   `null` when the expectation no longer held.
   * @throws {ConflictError} When the change violates a unique index.
   */
  async updateWhere(table, id, expected, changes) {
    return this.#applyUpdate(table, { ...MongoMapper.toFilter(expected), _id: id }, changes);
  }

  /**
   * Removes one row.
   *
   * @param {string} table - Table name.
   * @param {string} id - Primary key.
   * @returns {Promise<boolean>} `true` when a row was removed.
   */
  async delete(table, id) {
    const result = await this.collection(table).deleteOne({ _id: id }, this.#options());
    return result.deletedCount === 1;
  }

  /**
   * Removes every row matching the criteria.
   *
   * @param {string} table - Table name.
   * @param {import('@hungry-ju/shared/types').Criteria} criteria - Filter.
   * @returns {Promise<number>} Number of rows removed.
   */
  async deleteWhere(table, criteria) {
    const result = await this.collection(table).deleteMany(
      MongoMapper.toFilter(criteria),
      this.#options()
    );
    return result.deletedCount ?? 0;
  }

  /**
   * Runs a callback atomically: either every write inside it lands, or none does.
   *
   * Nested calls join the transaction already in progress rather than opening a second
   * one, so a service may call another service that also opens a transaction.
   *
   * On a deployment without transaction support — a single `mongod`, which is what a
   * developer usually has — the callback runs directly. That is the honest trade: the
   * alternative is refusing to start at all, and every write inside such a callback is
   * still individually atomic. Anything that must not half-commit should run against a
   * replica set, which is what the deployment guidance in the README asks for.
   *
   * @template TResult
   * @param {() => Promise<TResult>} callback - Work to run.
   * @returns {Promise<TResult>} Whatever the callback resolved to, once committed.
   */
  async transaction(callback) {
    if (!this.#supportsTransactions || this.#sessions.getStore()) {
      return callback();
    }

    const session = this.#client.startSession();
    try {
      return await session.withTransaction(() => this.#sessions.run({ session }, callback));
    } finally {
      await session.endSession();
    }
  }

  /**
   * Driver options for the current operation, carrying the active session when there
   * is one.
   *
   * @returns {{ session?: import('mongodb').ClientSession }} Options to pass to the driver.
   */
  #options() {
    const store = this.#sessions.getStore();
    return store ? { session: store.session } : {};
  }

  /**
   * Runs one conditional update and maps the result back to a row.
   *
   * @param {string} table - Table name.
   * @param {Record<string, unknown>} filter - Document filter, primary key included.
   * @param {Record<string, unknown>} changes - Columns to write.
   * @returns {Promise<import('@hungry-ju/shared/types').PersistenceRow | null>} Stored row, or
   *   `null` when nothing matched.
   * @throws {ConflictError} When the change violates a unique index.
   */
  async #applyUpdate(table, filter, changes) {
    const writable = MongoMapper.writableChanges(changes);
    const collection = this.collection(table);

    // `$set: {}` is rejected by the server, so an update that writes nothing degrades to
    // a read of the row it would have written — which is the same answer, and still
    // reports "no such row" through a null result.
    if (Object.keys(writable).length === 0) {
      return MongoMapper.toRow(await collection.findOne(filter, this.#options()));
    }

    try {
      const document = await collection.findOneAndUpdate(
        filter,
        { $set: writable },
        { ...this.#options(), returnDocument: 'after' }
      );
      return MongoMapper.toRow(document);
    } catch (error) {
      throw MongoDatabase.#translateError(error, table);
    }
  }

  /**
   * Asks the server whether it is a replica set member or a router.
   *
   * @returns {Promise<boolean>} `true` when transactions can be started.
   */
  async #detectTransactionSupport() {
    try {
      const hello = await this.#db.admin().command({ hello: 1 });
      return Boolean(hello.setName) || hello.msg === 'isdbgrid';
    } catch {
      return false;
    }
  }

  /**
   * Creates every declared collection, ignoring the ones that already exist.
   *
   * @returns {Promise<void>} Resolves once all collections are present.
   */
  async #createCollections() {
    const existing = new Set(
      await this.#db
        .listCollections({}, { nameOnly: true })
        .toArray()
        .then((entries) => entries.map((entry) => entry.name))
    );

    for (const table of TABLES) {
      if (existing.has(table)) {
        continue;
      }
      try {
        await this.#db.createCollection(table);
      } catch (error) {
        // Another process booting at the same moment may have won the race.
        if (error?.code !== NAMESPACE_EXISTS) {
          throw error;
        }
      }
    }
  }

  /**
   * Builds the indexes declared in {@link MONGO_INDEXES}.
   *
   * A definition that conflicts with an index already in the database is reported rather
   * than swallowed: it means the declaration here and the deployed database disagree,
   * and the fix is to drop the stale index, not to keep running without the new one.
   *
   * @returns {Promise<void>} Resolves once every index exists.
   * @throws {Error} When an index cannot be created for any reason but a benign conflict.
   */
  async #createIndexes() {
    for (const [table, definitions] of Object.entries(MONGO_INDEXES)) {
      for (const { key, name, ...options } of definitions) {
        try {
          await this.#db.collection(table).createIndex(key, { name, ...options });
        } catch (error) {
          const benign =
            error?.code === INDEX_OPTIONS_CONFLICT || error?.code === INDEX_KEY_SPECS_CONFLICT;
          if (!benign) {
            throw error;
          }
        }
      }
    }
  }

  /**
   * Turns a duplicate-key failure into the error the API already knows how to report.
   *
   * Without this a unique index would surface as an unhandled driver error and a 500,
   * when what actually happened is the same 409 the service raises when it notices the
   * duplicate itself.
   *
   * @param {Error & { code?: number, keyPattern?: Record<string, unknown> }} error - Driver error.
   * @param {string} table - Table the write targeted.
   * @returns {Error} The error to throw.
   */
  static #translateError(error, table) {
    if (error?.code !== DUPLICATE_KEY) {
      return error;
    }
    const columns = Object.keys(error.keyPattern ?? {}).join(', ');
    return new ConflictError(
      columns
        ? `A ${table} record with this ${columns} already exists`
        : `This ${table} record already exists`
    );
  }
}
