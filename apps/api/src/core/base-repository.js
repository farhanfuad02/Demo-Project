/**
 * @file Abstract data-access gateway shared by every repository.
 *
 * @module core/base-repository
 */

import { NotFoundError } from './errors/app-error.js';

/**
 * Abstract data-access gateway.
 *
 * Subclasses supply only the row/model mapping; generic CRUD lives here, so a new entity
 * costs one small method instead of a copy of the whole gateway. Services depend on this
 * contract and never on the driver, which is what keeps business rules unit-testable
 * against a fake repository (NFR-12).
 *
 * @abstract
 * @template {import('./base-model.js').BaseModel} TModel
 */
export class BaseRepository {
  /** @type {import('../config/database/database.js').Database} */
  #db;

  /** @type {string} */
  #table;

  /**
   * @param {import('../config/database/database.js').Database} db - Database client.
   * @param {string} table - Physical table this repository owns.
   * @throws {TypeError} When constructed directly instead of through a subclass.
   */
  constructor(db, table) {
    if (new.target === BaseRepository) {
      throw new TypeError('BaseRepository is abstract');
    }
    this.#db = db;
    this.#table = table;
  }

  /**
   * Database client for subclass queries.
   *
   * @returns {import('../config/database/database.js').Database} The injected client.
   */
  get db() {
    return this.#db;
  }

  /**
   * Table this repository reads and writes.
   *
   * @returns {string} Table name.
   */
  get table() {
    return this.#table;
  }

  /**
   * Loads one row by primary key.
   *
   * @param {string} id - Primary key.
   * @returns {Promise<TModel | null>} Model, or `null` when absent.
   */
  async findById(id) {
    const row = await this.#db.findById(this.#table, id);
    return row ? this.toModel(row) : null;
  }

  /**
   * Loads one row by primary key or fails.
   *
   * Saves every caller the same three-line guard, and keeps 404 handling identical
   * across the API instead of depending on which service remembered to check.
   *
   * @param {string} id - Primary key.
   * @param {string} [resource] - Label used in the error message.
   * @returns {Promise<TModel>} The model.
   * @throws {NotFoundError} When no row matches.
   */
  async findByIdOrFail(id, resource = undefined) {
    const model = await this.findById(id);
    if (!model) {
      throw new NotFoundError(resource ?? this.#table);
    }
    return model;
  }

  /**
   * Loads the first row matching the criteria.
   *
   * @param {import('@hungry-ju/shared/types').Criteria} criteria - Column/value filter.
   * @returns {Promise<TModel | null>} Model, or `null` when nothing matches.
   */
  async findOne(criteria) {
    const row = await this.#db.findOne(this.#table, criteria);
    return row ? this.toModel(row) : null;
  }

  /**
   * Loads every row matching the criteria.
   *
   * @param {import('@hungry-ju/shared/types').Criteria} [criteria] - Column/value filter.
   * @param {import('../utils/query-options.js').QueryOptions} [options] - Sort/page window.
   * @returns {Promise<TModel[]>} Matching models.
   */
  async findMany(criteria = {}, options = undefined) {
    const rows = await this.#db.findMany(this.#table, criteria, options);
    return rows.map((row) => this.toModel(row));
  }

  /**
   * Counts rows matching the criteria.
   *
   * @param {import('@hungry-ju/shared/types').Criteria} [criteria] - Column/value filter.
   * @returns {Promise<number>} Matching row count.
   */
  async count(criteria = {}) {
    return this.#db.count(this.#table, criteria);
  }

  /**
   * Inserts a new row built from an entity.
   *
   * The entity validates itself first: a repository that writes an inconsistent row
   * turns an invariant into a suggestion.
   *
   * @param {TModel} model - Entity to persist.
   * @returns {Promise<TModel>} Entity rebuilt from the stored row, carrying its new id.
   */
  async create(model) {
    model.validate();
    const row = await this.#db.insert(this.#table, model.toPersistence());
    return this.toModel(row);
  }

  /**
   * Writes an already-persisted entity back in full.
   *
   * @param {TModel} model - Entity whose in-memory state is authoritative.
   * @returns {Promise<TModel>} Entity rebuilt from the stored row.
   */
  async save(model) {
    model.validate();
    const row = await this.#db.update(this.#table, model.id, model.toPersistence());
    return this.toModel(row);
  }

  /**
   * Applies a partial column update.
   *
   * @param {string} id - Primary key.
   * @param {Record<string, unknown>} changes - Columns to write.
   * @returns {Promise<TModel>} Updated entity.
   */
  async update(id, changes) {
    const row = await this.#db.update(this.#table, id, changes);
    return this.toModel(row);
  }

  /**
   * Removes one row.
   *
   * @param {string} id - Primary key.
   * @returns {Promise<boolean>} `true` when a row was removed.
   */
  async delete(id) {
    return this.#db.delete(this.#table, id);
  }

  /**
   * Runs a callback in one transaction; multi-table writes (order plus order items)
   * depend on it for atomicity.
   *
   * @template TResult
   * @param {() => Promise<TResult>} callback - Work to run inside the transaction.
   * @returns {Promise<TResult>} Whatever the callback resolved to, once committed.
   */
  async transaction(callback) {
    return this.#db.transaction(callback);
  }

  /**
   * Maps one storage row onto its domain entity.
   *
   * @abstract
   * @param {import('@hungry-ju/shared/types').PersistenceRow} _row - Row read from storage.
   * @returns {TModel} Hydrated entity.
   * @throws {Error} Until a subclass implements it.
   */
  toModel(_row) {
    throw new Error(`${this.constructor.name} must implement toModel()`);
  }
}
