/**
 * @file Abstract database gateway: the contract every storage engine must satisfy.
 *
 * @module config/database/database
 */

/**
 * The table set the application expects to exist, in creation order.
 *
 * Declared once here so a new engine has a checklist, and so the seeder and the JSON
 * store cannot drift apart about what "empty" looks like.
 *
 * @type {readonly string[]}
 */
export const TABLES = Object.freeze([
  'users',
  'student_profiles',
  'shops',
  'menu_items',
  'carts',
  'cart_items',
  'orders',
  'order_items',
  'deliveries',
  'payments',
  'ratings',
  'notifications',
  'audit_logs',
  'auth_tokens',
  'system_config',
]);

/**
 * Abstract storage gateway.
 *
 * Repositories talk to this interface and never to a driver, which is the seam that
 * lets the MVP ship on a JSON file and Phase 2 move to PostgreSQL by adding one
 * subclass instead of editing every repository (SRS section 10).
 *
 * @abstract
 */
export class Database {
  /**
   * @throws {TypeError} When constructed directly instead of through a subclass.
   */
  constructor() {
    if (new.target === Database) {
      throw new TypeError('Database is abstract');
    }
  }

  /**
   * Opens the connection and makes sure every table exists.
   *
   * @abstract
   * @returns {Promise<this>} The connected database.
   * @throws {Error} Until a subclass implements it.
   */
  async connect() {
    throw new Error(`${this.constructor.name} must implement connect()`);
  }

  /**
   * Closes the connection and flushes anything pending.
   *
   * @abstract
   * @returns {Promise<void>} Resolves once closed.
   * @throws {Error} Until a subclass implements it.
   */
  async disconnect() {
    throw new Error(`${this.constructor.name} must implement disconnect()`);
  }

  /**
   * Cheap round-trip used by the readiness probe (NFR-05).
   *
   * @abstract
   * @returns {Promise<boolean>} `true` when the store answers.
   * @throws {Error} Until a subclass implements it.
   */
  async healthCheck() {
    throw new Error(`${this.constructor.name} must implement healthCheck()`);
  }

  /**
   * Reads one row by primary key.
   *
   * @abstract
   * @param {string} _table - Table name.
   * @param {string} _id - Primary key.
   * @returns {Promise<import('@hungry-ju/shared/types').PersistenceRow | null>} Row or `null`.
   * @throws {Error} Until a subclass implements it.
   */
  async findById(_table, _id) {
    throw new Error(`${this.constructor.name} must implement findById()`);
  }

  /**
   * Reads the first row matching the criteria.
   *
   * @abstract
   * @param {string} _table - Table name.
   * @param {import('@hungry-ju/shared/types').Criteria} _criteria - Filter.
   * @returns {Promise<import('@hungry-ju/shared/types').PersistenceRow | null>} Row or `null`.
   * @throws {Error} Until a subclass implements it.
   */
  async findOne(_table, _criteria) {
    throw new Error(`${this.constructor.name} must implement findOne()`);
  }

  /**
   * Reads every row matching the criteria.
   *
   * @abstract
   * @param {string} _table - Table name.
   * @param {import('@hungry-ju/shared/types').Criteria} _criteria - Filter.
   * @param {import('../../utils/query-options.js').QueryOptions} [_options] - Sort/page window.
   * @returns {Promise<import('@hungry-ju/shared/types').PersistenceRow[]>} Matching rows.
   * @throws {Error} Until a subclass implements it.
   */
  async findMany(_table, _criteria, _options) {
    throw new Error(`${this.constructor.name} must implement findMany()`);
  }

  /**
   * Counts rows matching the criteria.
   *
   * @abstract
   * @param {string} _table - Table name.
   * @param {import('@hungry-ju/shared/types').Criteria} _criteria - Filter.
   * @returns {Promise<number>} Matching row count.
   * @throws {Error} Until a subclass implements it.
   */
  async count(_table, _criteria) {
    throw new Error(`${this.constructor.name} must implement count()`);
  }

  /**
   * Inserts a row, assigning a primary key when the caller did not.
   *
   * @abstract
   * @param {string} _table - Table name.
   * @param {import('@hungry-ju/shared/types').PersistenceRow} _row - Row to write.
   * @returns {Promise<import('@hungry-ju/shared/types').PersistenceRow>} The stored row.
   * @throws {Error} Until a subclass implements it.
   */
  async insert(_table, _row) {
    throw new Error(`${this.constructor.name} must implement insert()`);
  }

  /**
   * Applies a partial update to one row.
   *
   * @abstract
   * @param {string} _table - Table name.
   * @param {string} _id - Primary key.
   * @param {Record<string, unknown>} _changes - Columns to write.
   * @returns {Promise<import('@hungry-ju/shared/types').PersistenceRow>} The stored row.
   * @throws {Error} Until a subclass implements it.
   */
  async update(_table, _id, _changes) {
    throw new Error(`${this.constructor.name} must implement update()`);
  }

  /**
   * Updates a row only while it still matches the expected column values.
   *
   * This is the primitive behind first-accept-wins delivery assignment (FR-D3): the
   * read and the write are one indivisible step, so of two riders tapping Accept at the
   * same instant exactly one can succeed (NFR-11, risk R4).
   *
   * @abstract
   * @param {string} _table - Table name.
   * @param {string} _id - Primary key.
   * @param {import('@hungry-ju/shared/types').Criteria} _expected - Columns that must still hold.
   * @param {Record<string, unknown>} _changes - Columns to write.
   * @returns {Promise<import('@hungry-ju/shared/types').PersistenceRow | null>} The stored row,
   *   or `null` when the expectation no longer held.
   * @throws {Error} Until a subclass implements it.
   */
  async updateWhere(_table, _id, _expected, _changes) {
    throw new Error(`${this.constructor.name} must implement updateWhere()`);
  }

  /**
   * Removes one row.
   *
   * @abstract
   * @param {string} _table - Table name.
   * @param {string} _id - Primary key.
   * @returns {Promise<boolean>} `true` when a row was removed.
   * @throws {Error} Until a subclass implements it.
   */
  async delete(_table, _id) {
    throw new Error(`${this.constructor.name} must implement delete()`);
  }

  /**
   * Removes every row matching the criteria.
   *
   * @abstract
   * @param {string} _table - Table name.
   * @param {import('@hungry-ju/shared/types').Criteria} _criteria - Filter.
   * @returns {Promise<number>} Number of rows removed.
   * @throws {Error} Until a subclass implements it.
   */
  async deleteWhere(_table, _criteria) {
    throw new Error(`${this.constructor.name} must implement deleteWhere()`);
  }

  /**
   * Runs a callback atomically: either every write inside it lands, or none does.
   *
   * @abstract
   * @template TResult
   * @param {() => Promise<TResult>} _callback - Work to run.
   * @returns {Promise<TResult>} Whatever the callback resolved to, once committed.
   * @throws {Error} Until a subclass implements it.
   */
  async transaction(_callback) {
    throw new Error(`${this.constructor.name} must implement transaction()`);
  }
}
