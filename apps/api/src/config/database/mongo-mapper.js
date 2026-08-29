/**
 * @file Translation between the row/criteria vocabulary and MongoDB documents.
 *
 * @module config/database/mongo-mapper
 */

/**
 * A filter that can never match, used when a criterion is unsatisfiable.
 *
 * The in-process store answers `false` for a malformed criterion — `{ $in: 'placed' }`
 * with a string instead of an array, or an operator nobody implements. MongoDB would
 * instead reject the query and turn a silent empty result into a 500, so the same shape
 * is translated into a filter the server accepts and no document can satisfy.
 *
 * @type {Readonly<Record<string, unknown>>}
 */
const IMPOSSIBLE = Object.freeze({ _id: Object.freeze({ $in: [] }) });

/**
 * Criteria operators that mean the same thing in MongoDB, and how to carry them across.
 *
 * `$like` is the only one that has to change shape: the in-process store implements it
 * as a case-insensitive substring test, which is `$regex` over an escaped fragment here.
 * Escaping is not optional — a search for `c++` would otherwise be an invalid regular
 * expression, and one for `.*` would match the whole collection.
 *
 * @type {Readonly<Record<string, (operand: unknown) => Record<string, unknown> | null>>}
 */
const OPERATORS = Object.freeze({
  /**
   * Membership test.
   *
   * @param {unknown} operand - Array of accepted values.
   * @returns {Record<string, unknown> | null} Mongo fragment, or `null` when unsatisfiable.
   */
  $in: (operand) => (Array.isArray(operand) ? { $in: operand } : null),

  /**
   * Exclusion test.
   *
   * @param {unknown} operand - Array of rejected values.
   * @returns {Record<string, unknown> | null} Mongo fragment, or `null` when unsatisfiable.
   */
  $nin: (operand) => (Array.isArray(operand) ? { $nin: operand } : null),

  /**
   * Inequality test.
   *
   * @param {unknown} operand - Value to differ from.
   * @returns {Record<string, unknown>} Mongo fragment.
   */
  $ne: (operand) => ({ $ne: operand }),

  /**
   * Greater-than test.
   *
   * @param {unknown} operand - Lower bound, exclusive.
   * @returns {Record<string, unknown>} Mongo fragment.
   */
  $gt: (operand) => ({ $gt: operand }),

  /**
   * Greater-or-equal test.
   *
   * @param {unknown} operand - Lower bound, inclusive.
   * @returns {Record<string, unknown>} Mongo fragment.
   */
  $gte: (operand) => ({ $gte: operand }),

  /**
   * Less-than test.
   *
   * @param {unknown} operand - Upper bound, exclusive.
   * @returns {Record<string, unknown>} Mongo fragment.
   */
  $lt: (operand) => ({ $lt: operand }),

  /**
   * Less-or-equal test.
   *
   * @param {unknown} operand - Upper bound, inclusive.
   * @returns {Record<string, unknown>} Mongo fragment.
   */
  $lte: (operand) => ({ $lte: operand }),

  /**
   * Case-insensitive substring test (FR-C2 partial matching).
   *
   * @param {unknown} operand - Fragment to look for.
   * @returns {Record<string, unknown>} Mongo fragment.
   */
  $like: (operand) => ({
    $regex: String(operand).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
    $options: 'i',
  }),
});

/**
 * Converts between what the repositories speak and what the driver expects.
 *
 * The application's primary key is called `id`; MongoDB's is `_id`. Rather than teach
 * thirteen repositories a second name for the same thing, the rename happens here and
 * only here, so a row that comes back out of MongoDB is indistinguishable from one that
 * came out of the JSON store.
 */
export class MongoMapper {
  /**
   * The filter that matches nothing.
   *
   * @returns {Record<string, unknown>} An unsatisfiable filter.
   */
  static get impossibleFilter() {
    return { ...IMPOSSIBLE };
  }

  /**
   * Turns a stored document into a row.
   *
   * @param {Record<string, unknown> | null} document - Document from the driver.
   * @returns {import('@hungry-ju/shared/types').PersistenceRow | null} Row, or `null`.
   */
  static toRow(document) {
    if (!document) {
      return null;
    }
    const { _id, ...columns } = document;
    return { id: _id, ...columns };
  }

  /**
   * Turns a row into a document, assigning the primary key when the caller did not.
   *
   * @param {import('@hungry-ju/shared/types').PersistenceRow} row - Row to store.
   * @param {string} fallbackId - Key to use when the row carries none.
   * @returns {Record<string, unknown>} Document ready to insert.
   */
  static toDocument(row, fallbackId) {
    const { id, ...columns } = row;
    return { _id: id ?? fallbackId, ...columns };
  }

  /**
   * Strips the columns no update is allowed to write.
   *
   * Re-keying a row would orphan its children while every foreign key still points at
   * the old value, so `id` is dropped here exactly as the in-process store drops it.
   *
   * @param {Record<string, unknown>} changes - Columns the caller asked to write.
   * @returns {Record<string, unknown>} Columns that may actually be written.
   */
  static writableChanges(changes) {
    const { id: _ignored, ...writable } = changes;
    return writable;
  }

  /**
   * Translates one column name.
   *
   * @param {string} column - Name used by the repositories.
   * @returns {string} Name used by MongoDB.
   */
  static toField(column) {
    return column === 'id' ? '_id' : column;
  }

  /**
   * Translates a criteria object into a MongoDB filter.
   *
   * @param {import('@hungry-ju/shared/types').Criteria} [criteria] - Filter; empty matches all.
   * @returns {Record<string, unknown>} Equivalent MongoDB filter.
   */
  static toFilter(criteria = {}) {
    /** @type {Record<string, unknown>} */
    const filter = {};

    for (const [column, expected] of Object.entries(criteria)) {
      const field = MongoMapper.toField(column);

      if (expected === null || typeof expected !== 'object' || Array.isArray(expected)) {
        filter[field] = expected;
        continue;
      }

      /** @type {Record<string, unknown>} */
      const fragment = {};
      for (const [operator, operand] of Object.entries(expected)) {
        const translate = OPERATORS[operator];
        const translated = translate ? translate(operand) : null;
        if (!translated) {
          return MongoMapper.impossibleFilter;
        }
        Object.assign(fragment, translated);
      }
      filter[field] = fragment;
    }

    return filter;
  }

  /**
   * Translates a sort/page window into a driver sort specification.
   *
   * `_id` is appended as a tie-breaker because MongoDB does not promise a stable order
   * for documents that compare equal, and an unstable order across pages makes rows
   * appear twice or not at all while paging.
   *
   * @param {import('../../utils/query-options.js').QueryOptions} [options] - Window.
   * @returns {Record<string, 1 | -1> | null} Sort specification, or `null` for natural order.
   */
  static toSort(options = undefined) {
    if (!options?.sortBy) {
      return null;
    }
    const direction = options.sortDirection === 'asc' ? 1 : -1;
    return { [MongoMapper.toField(options.sortBy)]: direction, _id: direction };
  }
}
