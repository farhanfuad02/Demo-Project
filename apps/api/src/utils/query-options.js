/**
 * @file Sort and page window passed from controllers down to the database.
 *
 * @module utils/query-options
 */

import { PAGINATION } from '@hungry-ju/shared/constants';

/**
 * An immutable list-query window: which page, how large, and in what order.
 *
 * Clamping lives in the constructor rather than in each controller, because
 * `?limit=1000000` is the cheapest denial-of-service a public list endpoint offers and
 * the clamp has to hold no matter which route forgot to think about it (NFR-04).
 */
export class QueryOptions {
  /** @type {number} */
  #page;

  /** @type {number} */
  #limit;

  /** @type {string | null} */
  #sortBy;

  /** @type {'asc' | 'desc'} */
  #sortDirection;

  /**
   * @param {object} [options] - Raw, possibly hostile, list parameters.
   * @param {number} [options.page] - 1-based page number.
   * @param {number} [options.limit] - Requested page size.
   * @param {string | null} [options.sortBy] - Column to order by.
   * @param {'asc' | 'desc'} [options.sortDirection] - Sort direction.
   */
  constructor({ page, limit, sortBy = null, sortDirection = 'desc' } = {}) {
    const requestedPage = Number(page) || PAGINATION.DEFAULT_PAGE;
    const requestedLimit = Number(limit) || PAGINATION.DEFAULT_LIMIT;

    this.#page = Math.max(1, Math.trunc(requestedPage));
    this.#limit = Math.min(PAGINATION.MAX_LIMIT, Math.max(1, Math.trunc(requestedLimit)));
    this.#sortBy = sortBy;
    this.#sortDirection = sortDirection === 'asc' ? 'asc' : 'desc';
    Object.freeze(this);
  }

  /**
   * Page number after clamping.
   *
   * @returns {number} 1-based page number.
   */
  get page() {
    return this.#page;
  }

  /**
   * Page size after clamping.
   *
   * @returns {number} Rows per page.
   */
  get limit() {
    return this.#limit;
  }

  /**
   * Column to order by.
   *
   * @returns {string | null} Column name, or `null` for storage order.
   */
  get sortBy() {
    return this.#sortBy;
  }

  /**
   * Sort direction.
   *
   * @returns {'asc' | 'desc'} Direction.
   */
  get sortDirection() {
    return this.#sortDirection;
  }

  /**
   * Rows to skip before the current page.
   *
   * @returns {number} Offset.
   */
  get offset() {
    return (this.#page - 1) * this.#limit;
  }

  /**
   * Builds the metadata block that accompanies a page of results.
   *
   * @param {number} totalCount - Total rows matching the filter.
   * @returns {import('@hungry-ju/shared/types').PaginationMeta} Page descriptor.
   */
  meta(totalCount) {
    const totalPages = Math.max(1, Math.ceil(totalCount / this.#limit));
    return {
      page: this.#page,
      limit: this.#limit,
      totalCount,
      totalPages,
      hasNext: this.#page < totalPages,
    };
  }

  /**
   * Wraps items and their metadata into the shape controllers send back.
   *
   * @param {object[]} items - Rows or models for this page.
   * @param {number} totalCount - Total rows matching the filter.
   * @returns {import('@hungry-ju/shared/types').PaginatedResult} Page plus metadata.
   */
  paginate(items, totalCount) {
    return { items, meta: this.meta(totalCount) };
  }
}
