/**
 * @file Unit tests for QueryOptions.
 *
 * @module tests/unit/utils/query-options
 */

import { describe, expect, it } from '@jest/globals';
import { PAGINATION } from '@hungry-ju/shared/constants';
import { QueryOptions } from '../../../src/utils/query-options.js';

describe('QueryOptions', () => {
  it('falls back to the defaults when nothing is supplied', () => {
    const options = new QueryOptions();
    expect(options.page).toBe(PAGINATION.DEFAULT_PAGE);
    expect(options.limit).toBe(PAGINATION.DEFAULT_LIMIT);
    expect(options.offset).toBe(0);
  });

  it('clamps an oversized page size', () => {
    // The cheapest denial of service a public list endpoint offers.
    expect(new QueryOptions({ limit: 1_000_000 }).limit).toBe(PAGINATION.MAX_LIMIT);
  });

  it('clamps a page below one', () => {
    expect(new QueryOptions({ page: 0 }).page).toBe(1);
    expect(new QueryOptions({ page: -5 }).page).toBe(1);
  });

  it('coerces string parameters from a query string', () => {
    const options = new QueryOptions({ page: '3', limit: '10' });
    expect(options.page).toBe(3);
    expect(options.limit).toBe(10);
    expect(options.offset).toBe(20);
  });

  it('accepts only the two sort directions', () => {
    expect(new QueryOptions({ sortDirection: 'asc' }).sortDirection).toBe('asc');
    expect(new QueryOptions({ sortDirection: 'sideways' }).sortDirection).toBe('desc');
  });

  it('describes the page it selected', () => {
    const meta = new QueryOptions({ page: 2, limit: 10 }).meta(35);
    expect(meta).toEqual({ page: 2, limit: 10, totalCount: 35, totalPages: 4, hasNext: true });
  });

  it('reports no next page on the last one', () => {
    expect(new QueryOptions({ page: 4, limit: 10 }).meta(35).hasNext).toBe(false);
  });

  it('reports one page when there are no rows at all', () => {
    expect(new QueryOptions().meta(0).totalPages).toBe(1);
  });

  it('wraps items with their metadata', () => {
    const page = new QueryOptions({ limit: 2 }).paginate([{ id: 'a' }, { id: 'b' }], 5);
    expect(page.items).toHaveLength(2);
    expect(page.meta.totalCount).toBe(5);
  });

  it('is immutable', () => {
    expect(Object.isFrozen(new QueryOptions())).toBe(true);
  });
});
