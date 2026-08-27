/**
 * @file In-process implementation of the storage contract.
 *
 * @module config/database/in-memory-database
 */

import { NotFoundError } from '../../core/errors/app-error.js';
import { Identifier } from '../../utils/identifier.js';
import { CriteriaMatcher } from './criteria-matcher.js';
import { Database, TABLES } from './database.js';

/**
 * Storage held in process memory.
 *
 * Node runs one request at a time on the main thread, so a block of synchronous
 * statements is already indivisible with respect to other requests. The transaction
 * support here therefore only needs to do two things: serialise overlapping
 * transactions through a queue, and restore a snapshot if the body throws — which is
 * what makes "order and its lines both land, or neither does" true (NFR-11).
 *
 * @augments Database
 */
export class InMemoryDatabase extends Database {
  /** @type {Map<string, import('@hungry-ju/shared/types').PersistenceRow[]>} */
  #tables = new Map();

  /** @type {Promise<unknown>} */
  #transactionQueue = Promise.resolve();

  /** @type {number} */
  #transactionDepth = 0;

  /** @type {boolean} */
  #connected = false;

  /**
   * Creates every declared table, empty.
   *
   * @returns {Promise<this>} The connected database.
   */
  async connect() {
    for (const table of TABLES) {
      if (!this.#tables.has(table)) {
        this.#tables.set(table, []);
      }
    }
    this.#connected = true;
    return this;
  }

  /**
   * Drops the connection flag; rows stay in memory for a later reconnect.
   *
   * @returns {Promise<void>} Resolves immediately.
   */
  async disconnect() {
    this.#connected = false;
  }

  /**
   * Reports whether the store is usable.
   *
   * @returns {Promise<boolean>} `true` once connected.
   */
  async healthCheck() {
    return this.#connected;
  }

  /**
   * Live row array for a table.
   *
   * @protected
   * @param {string} table - Table name.
   * @returns {import('@hungry-ju/shared/types').PersistenceRow[]} The rows.
   * @throws {NotFoundError} When the table was never declared in {@link TABLES}.
   */
  rows(table) {
    const rows = this.#tables.get(table);
    if (!rows) {
      throw new NotFoundError(`Table "${table}"`);
    }
    return rows;
  }

  /**
   * Replaces the whole dataset, used by the loader and the seeder.
   *
   * @protected
   * @param {Record<string, import('@hungry-ju/shared/types').PersistenceRow[]>} data - Rows
   *   keyed by table name.
   * @returns {void}
   */
  load(data) {
    for (const table of TABLES) {
      this.#tables.set(table, Array.isArray(data[table]) ? [...data[table]] : []);
    }
  }

  /**
   * Snapshot of the whole dataset, used when writing the JSON file.
   *
   * @protected
   * @returns {Record<string, import('@hungry-ju/shared/types').PersistenceRow[]>} Rows by table.
   */
  snapshot() {
    return Object.fromEntries(
      [...this.#tables.entries()].map(([table, rows]) => [table, rows.map((row) => ({ ...row }))])
    );
  }

  /**
   * Hook the file-backed subclass overrides to persist after each write. Doing nothing
   * here keeps the memory store free of file concerns.
   *
   * @protected
   * @returns {void}
   */
  onChange() {
    // Intentionally empty: memory storage has nothing to flush.
  }

  /**
   * Reads one row by primary key.
   *
   * @param {string} table - Table name.
   * @param {string} id - Primary key.
   * @returns {Promise<import('@hungry-ju/shared/types').PersistenceRow | null>} Row or `null`.
   */
  async findById(table, id) {
    const row = this.rows(table).find((candidate) => candidate.id === id);
    return row ? { ...row } : null;
  }

  /**
   * Reads the first row matching the criteria.
   *
   * @param {string} table - Table name.
   * @param {import('@hungry-ju/shared/types').Criteria} criteria - Filter.
   * @returns {Promise<import('@hungry-ju/shared/types').PersistenceRow | null>} Row or `null`.
   */
  async findOne(table, criteria) {
    const row = this.rows(table).find((candidate) => CriteriaMatcher.matches(candidate, criteria));
    return row ? { ...row } : null;
  }

  /**
   * Reads every row matching the criteria, sorted and paged.
   *
   * Copies are returned so a caller cannot mutate stored state by editing what it read;
   * that is the same guarantee a real driver gives, and code written against it keeps
   * working after the engine changes.
   *
   * @param {string} table - Table name.
   * @param {import('@hungry-ju/shared/types').Criteria} [criteria] - Filter.
   * @param {import('../../utils/query-options.js').QueryOptions} [options] - Sort/page window.
   * @returns {Promise<import('@hungry-ju/shared/types').PersistenceRow[]>} Matching rows.
   */
  async findMany(table, criteria = {}, options = undefined) {
    let matched = this.rows(table).filter((row) => CriteriaMatcher.matches(row, criteria));

    if (options?.sortBy) {
      const column = options.sortBy;
      const direction = options.sortDirection === 'asc' ? 1 : -1;
      matched = [...matched].sort((left, right) => {
        if (left[column] === right[column]) {
          return 0;
        }
        return left[column] > right[column] ? direction : -direction;
      });
    }

    if (options) {
      matched = matched.slice(options.offset, options.offset + options.limit);
    }

    return matched.map((row) => ({ ...row }));
  }

  /**
   * Counts rows matching the criteria.
   *
   * @param {string} table - Table name.
   * @param {import('@hungry-ju/shared/types').Criteria} [criteria] - Filter.
   * @returns {Promise<number>} Matching row count.
   */
  async count(table, criteria = {}) {
    return this.rows(table).filter((row) => CriteriaMatcher.matches(row, criteria)).length;
  }

  /**
   * Inserts a row, assigning a primary key when the caller did not supply one.
   *
   * @param {string} table - Table name.
   * @param {import('@hungry-ju/shared/types').PersistenceRow} row - Row to write.
   * @returns {Promise<import('@hungry-ju/shared/types').PersistenceRow>} The stored row.
   */
  async insert(table, row) {
    const stored = { ...row, id: row.id ?? Identifier.uuid() };
    this.rows(table).push(stored);
    this.onChange();
    return { ...stored };
  }

  /**
   * Applies a partial update to one row.
   *
   * @param {string} table - Table name.
   * @param {string} id - Primary key.
   * @param {Record<string, unknown>} changes - Columns to write.
   * @returns {Promise<import('@hungry-ju/shared/types').PersistenceRow>} The stored row.
   * @throws {NotFoundError} When no row has that key.
   */
  async update(table, id, changes) {
    const rows = this.rows(table);
    const index = rows.findIndex((candidate) => candidate.id === id);
    if (index === -1) {
      throw new NotFoundError(table);
    }
    // The primary key is never a writable column: re-keying a row would orphan its
    // children while every foreign key still points at the old value.
    const { id: _ignored, ...writable } = changes;
    rows[index] = { ...rows[index], ...writable };
    this.onChange();
    return { ...rows[index] };
  }

  /**
   * Updates a row only while it still matches the expected column values.
   *
   * @param {string} table - Table name.
   * @param {string} id - Primary key.
   * @param {import('@hungry-ju/shared/types').Criteria} expected - Columns that must hold.
   * @param {Record<string, unknown>} changes - Columns to write.
   * @returns {Promise<import('@hungry-ju/shared/types').PersistenceRow | null>} Stored row, or
   *   `null` when the expectation no longer held.
   */
  async updateWhere(table, id, expected, changes) {
    const rows = this.rows(table);
    const index = rows.findIndex((candidate) => candidate.id === id);
    if (index === -1 || !CriteriaMatcher.matches(rows[index], expected)) {
      return null;
    }
    const { id: _ignored, ...writable } = changes;
    rows[index] = { ...rows[index], ...writable };
    this.onChange();
    return { ...rows[index] };
  }

  /**
   * Removes one row.
   *
   * @param {string} table - Table name.
   * @param {string} id - Primary key.
   * @returns {Promise<boolean>} `true` when a row was removed.
   */
  async delete(table, id) {
    const rows = this.rows(table);
    const index = rows.findIndex((candidate) => candidate.id === id);
    if (index === -1) {
      return false;
    }
    rows.splice(index, 1);
    this.onChange();
    return true;
  }

  /**
   * Removes every row matching the criteria.
   *
   * @param {string} table - Table name.
   * @param {import('@hungry-ju/shared/types').Criteria} criteria - Filter.
   * @returns {Promise<number>} Number of rows removed.
   */
  async deleteWhere(table, criteria) {
    const rows = this.rows(table);
    const kept = rows.filter((row) => !CriteriaMatcher.matches(row, criteria));
    const removed = rows.length - kept.length;
    if (removed > 0) {
      this.#tables.set(table, kept);
      this.onChange();
    }
    return removed;
  }

  /**
   * Runs a callback atomically.
   *
   * Nested calls join the transaction already in progress instead of dead-locking on
   * the queue, so a service may call another service that also opens a transaction.
   *
   * @template TResult
   * @param {() => Promise<TResult>} callback - Work to run.
   * @returns {Promise<TResult>} Whatever the callback resolved to, once committed.
   */
  async transaction(callback) {
    if (this.#transactionDepth > 0) {
      return callback();
    }

    const run = async () => {
      const backup = this.snapshot();
      this.#transactionDepth += 1;
      try {
        const result = await callback();
        this.onChange();
        return result;
      } catch (error) {
        this.load(backup);
        throw error;
      } finally {
        this.#transactionDepth -= 1;
      }
    };

    // Chain onto the queue so two transactions never interleave their awaits, and keep
    // the queue alive after a rejection by swallowing it on the tail only.
    const result = this.#transactionQueue.then(run, run);
    this.#transactionQueue = result.catch(() => undefined);
    return result;
  }
}
