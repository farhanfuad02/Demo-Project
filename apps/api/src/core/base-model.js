/**
 * @file Abstract root of the domain entities.
 *
 * @module core/base-model
 */

import { ValidationError } from './errors/app-error.js';

/**
 * Abstract root of every domain entity.
 *
 * Entities own their invariants; services orchestrate them and never reach inside. State
 * lives in private fields with getters, so a status can only move through a method that
 * checks whether the move is legal.
 *
 * @abstract
 */
export class BaseModel {
  /** @type {string | null} */
  #id;

  /** @type {Date} */
  #createdAt;

  /** @type {Date} */
  #updatedAt;

  /**
   * @param {object} [attributes] - Identity attributes shared by every entity.
   * @param {string | null} [attributes.id] - Primary key, `null` before the first insert.
   * @param {Date | string | null} [attributes.createdAt] - Row creation timestamp.
   * @param {Date | string | null} [attributes.updatedAt] - Last write timestamp.
   * @throws {TypeError} When constructed directly instead of through a subclass.
   */
  constructor({ id = null, createdAt = null, updatedAt = null } = {}) {
    if (new.target === BaseModel) {
      throw new TypeError('BaseModel is abstract');
    }
    this.#id = id;
    this.#createdAt = createdAt ? new Date(createdAt) : new Date();
    this.#updatedAt = updatedAt ? new Date(updatedAt) : this.#createdAt;
  }

  /**
   * Primary key.
   *
   * @returns {string | null} Id, or `null` when not yet persisted.
   */
  get id() {
    return this.#id;
  }

  /**
   * Row creation timestamp.
   *
   * @returns {Date} Timestamp.
   */
  get createdAt() {
    return this.#createdAt;
  }

  /**
   * Timestamp of the last mutation.
   *
   * @returns {Date} Timestamp.
   */
  get updatedAt() {
    return this.#updatedAt;
  }

  /**
   * Whether this entity has a database identity.
   *
   * @returns {boolean} `true` once an id has been assigned.
   */
  get isPersisted() {
    return this.#id !== null;
  }

  /**
   * Stamps the id assigned by the repository on insert.
   *
   * Repositories are the only callers. An entity that already has an id refuses to be
   * re-keyed, because that would silently orphan every row pointing at the old key.
   *
   * @param {string} id - Freshly generated primary key.
   * @returns {void}
   * @throws {ValidationError} When the entity already carries an id.
   */
  assignId(id) {
    if (this.#id !== null) {
      throw new ValidationError(`${this.constructor.name} already has an id.`);
    }
    this.#id = id;
  }

  /**
   * Marks the entity as changed. Every mutating method ends with this call, so the
   * updated timestamp reflects reality without each subclass repeating the bookkeeping.
   *
   * @protected
   * @returns {void}
   */
  touch() {
    this.#updatedAt = new Date();
  }

  /**
   * Identity columns every table shares, spread by subclasses into their own row.
   *
   * @protected
   * @returns {{ id: string | null, created_at: string, updated_at: string }} Base row.
   */
  baseRow() {
    return {
      id: this.#id,
      created_at: this.#createdAt.toISOString(),
      updated_at: this.#updatedAt.toISOString(),
    };
  }

  /**
   * Checks own invariants.
   *
   * @abstract
   * @returns {void} Returns nothing when the entity is consistent.
   * @throws {Error} Subclasses throw {@link ValidationError} when an invariant is broken.
   */
  validate() {
    throw new Error(`${this.constructor.name} must implement validate()`);
  }

  /**
   * Row shape matching the snake_case schema of SRS section 7.
   *
   * @abstract
   * @returns {import('@hungry-ju/shared/types').PersistenceRow} Row for the repository.
   * @throws {Error} Until a subclass implements it.
   */
  toPersistence() {
    throw new Error(`${this.constructor.name} must implement toPersistence()`);
  }

  /**
   * Client-safe shape. Never leaks password hashes, PINs, or internal counters.
   *
   * @abstract
   * @returns {Record<string, unknown>} Serialisable projection of the entity.
   * @throws {Error} Until a subclass implements it.
   */
  toJSON() {
    throw new Error(`${this.constructor.name} must implement toJSON()`);
  }
}
