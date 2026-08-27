/**
 * @file Row filtering for the in-process store.
 *
 * @module config/database/criteria-matcher
 */

/**
 * Comparison operators a criteria value may use instead of a plain equality test.
 *
 * The set is deliberately small. It covers what the repositories actually ask for and
 * nothing more, because a filter language rich enough to express arbitrary queries would
 * push business rules out of the services and into filter objects assembled far away.
 *
 * @type {Readonly<Record<string, (value: unknown, operand: unknown) => boolean>>}
 */
const OPERATORS = Object.freeze({
  /**
   * Membership test.
   *
   * @param {unknown} value - Column value.
   * @param {unknown} operand - Array of accepted values.
   * @returns {boolean} `true` when the value is one of them.
   */
  $in: (value, operand) => Array.isArray(operand) && operand.includes(value),

  /**
   * Exclusion test.
   *
   * @param {unknown} value - Column value.
   * @param {unknown} operand - Array of rejected values.
   * @returns {boolean} `true` when the value is none of them.
   */
  $nin: (value, operand) => Array.isArray(operand) && !operand.includes(value),

  /**
   * Inequality test.
   *
   * @param {unknown} value - Column value.
   * @param {unknown} operand - Value to differ from.
   * @returns {boolean} `true` when they differ.
   */
  $ne: (value, operand) => value !== operand,

  /**
   * Greater-than test.
   *
   * @param {unknown} value - Column value.
   * @param {unknown} operand - Lower bound, exclusive.
   * @returns {boolean} `true` when the value is above the bound.
   */
  $gt: (value, operand) => value > operand,

  /**
   * Greater-or-equal test.
   *
   * @param {unknown} value - Column value.
   * @param {unknown} operand - Lower bound, inclusive.
   * @returns {boolean} `true` when the value is at or above the bound.
   */
  $gte: (value, operand) => value >= operand,

  /**
   * Less-than test.
   *
   * @param {unknown} value - Column value.
   * @param {unknown} operand - Upper bound, exclusive.
   * @returns {boolean} `true` when the value is below the bound.
   */
  $lt: (value, operand) => value < operand,

  /**
   * Less-or-equal test.
   *
   * @param {unknown} value - Column value.
   * @param {unknown} operand - Upper bound, inclusive.
   * @returns {boolean} `true` when the value is at or below the bound.
   */
  $lte: (value, operand) => value <= operand,

  /**
   * Case-insensitive substring test, which is what FR-C2 partial matching needs.
   *
   * @param {unknown} value - Column value.
   * @param {unknown} operand - Fragment to look for.
   * @returns {boolean} `true` when the fragment occurs in the value.
   */
  $like: (value, operand) =>
    typeof value === 'string' &&
    String(value).toLowerCase().includes(String(operand).toLowerCase()),
});

/**
 * Decides whether a stored row satisfies a criteria object.
 *
 * Criteria keys are combined with `AND`, matching how a SQL `WHERE` clause built from
 * the same object would behave — so swapping the JSON store for a real database later
 * does not change what any repository means.
 */
export class CriteriaMatcher {
  /**
   * Tests one column value against one criteria value.
   *
   * @param {unknown} value - Column value from the row.
   * @param {unknown} expected - Plain value, or an object of operators.
   * @returns {boolean} `true` when the column satisfies the expectation.
   */
  static matchesValue(value, expected) {
    if (expected !== null && typeof expected === 'object' && !Array.isArray(expected)) {
      return Object.entries(expected).every(([operator, operand]) => {
        const test = OPERATORS[operator];
        return test ? test(value, operand) : false;
      });
    }
    return value === expected;
  }

  /**
   * Tests a whole row.
   *
   * @param {import('@hungry-ju/shared/types').PersistenceRow} row - Row from the store.
   * @param {import('@hungry-ju/shared/types').Criteria} [criteria] - Filter; empty matches all.
   * @returns {boolean} `true` when every criterion holds.
   */
  static matches(row, criteria = {}) {
    return Object.entries(criteria).every(([column, expected]) =>
      CriteriaMatcher.matchesValue(row[column], expected)
    );
  }
}
