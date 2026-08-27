/**
 * @file Unit tests for the browser transport.
 *
 * @module tests/unit/http-client
 */

import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { ApiError, HttpClient } from '../../src/services/http-client.js';

/**
 * Installs a fake `fetch` that answers from a queue of scripted responses.
 *
 * @param {Array<{ status: number, body?: unknown }>} responses - Responses, in order.
 * @returns {{ requests: Array<{ url: string, init: RequestInit }> }} What was requested.
 */
function stubFetch(responses) {
  const requests = [];
  let index = 0;

  globalThis.fetch = jest.fn(async (url, init) => {
    requests.push({ url, init });
    const scripted = responses[Math.min(index, responses.length - 1)];
    index += 1;

    return {
      ok: scripted.status >= 200 && scripted.status < 300,
      status: scripted.status,
      /**
       * @returns {Promise<unknown>} The scripted body.
       */
      async json() {
        if (scripted.body === undefined) {
          throw new Error('no body');
        }
        return scripted.body;
      },
    };
  });

  return { requests };
}

afterEach(() => {
  delete globalThis.fetch;
});

describe('ApiError', () => {
  it('classifies the statuses the views branch on', () => {
    expect(new ApiError({ status: 409, code: 'CONFLICT', message: 'x' }).isConflict).toBe(true);
    expect(new ApiError({ status: 401, code: 'UNAUTHORIZED', message: 'x' }).isUnauthorized).toBe(
      true
    );
  });

  it('flattens validation issues into per-field messages for a form', () => {
    const error = new ApiError({
      status: 422,
      code: 'VALIDATION_ERROR',
      message: 'Invalid',
      details: [
        { path: 'email', message: 'Enter a valid e-mail address.' },
        { path: 'password', message: 'Too short.' },
      ],
    });

    expect(error.fieldErrors).toEqual({
      email: 'Enter a valid e-mail address.',
      password: 'Too short.',
    });
  });

  it('reports no field errors when the server sent none', () => {
    expect(new ApiError({ status: 500, code: 'INTERNAL_ERROR', message: 'x' }).fieldErrors).toEqual(
      {}
    );
  });
});

describe('HttpClient', () => {
  it('unwraps the data envelope', async () => {
    stubFetch([{ status: 200, body: { data: { id: 'u1' } } }]);
    const client = new HttpClient({ baseUrl: '/api' });

    expect(await client.get('/auth/me')).toEqual({ id: 'u1' });
  });

  it('keeps the metadata a pager needs', async () => {
    stubFetch([{ status: 200, body: { data: [{ id: 'a' }], meta: { totalCount: 1 } } }]);
    const client = new HttpClient({ baseUrl: '/api' });

    const page = await client.requestPage('/shops');
    expect(page.data).toHaveLength(1);
    expect(page.meta.totalCount).toBe(1);
  });

  it('sends the bearer token once it has one', async () => {
    const { requests } = stubFetch([{ status: 200, body: { data: null } }]);
    const client = new HttpClient({ baseUrl: '/api' });
    client.setAccessToken('access-1');

    await client.get('/cart');
    expect(requests[0].init.headers.Authorization).toBe('Bearer access-1');
  });

  it('always sends cookies, since the refresh token lives in one', async () => {
    const { requests } = stubFetch([{ status: 200, body: { data: null } }]);
    await new HttpClient().get('/cart');

    expect(requests[0].init.credentials).toBe('include');
  });

  it('drops empty query parameters instead of sending blanks', async () => {
    const { requests } = stubFetch([{ status: 200, body: { data: [] } }]);
    await new HttpClient().get('/shops', { search: 'khich', openOnly: undefined, category: '' });

    expect(requests[0].url).toContain('search=khich');
    expect(requests[0].url).not.toContain('openOnly');
    expect(requests[0].url).not.toContain('category');
  });

  it('turns a failure body into an ApiError', async () => {
    stubFetch([
      {
        status: 409,
        body: { error: { code: 'CONFLICT', message: 'Already taken', details: null } },
      },
    ]);

    const failure = await new HttpClient().post('/deliveries/d1/accept').catch((error) => error);
    expect(failure).toBeInstanceOf(ApiError);
    expect(failure.status).toBe(409);
    expect(failure.message).toBe('Already taken');
  });

  it('still produces a usable error when the body is not JSON', async () => {
    stubFetch([{ status: 502 }]);
    const failure = await new HttpClient().get('/shops').catch((error) => error);

    expect(failure).toBeInstanceOf(ApiError);
    expect(failure.message).toContain('Something went wrong');
  });

  it('returns null for a 204', async () => {
    stubFetch([{ status: 204 }]);
    expect(await new HttpClient().delete('/shops/s1/menu/i1')).toBeNull();
  });

  describe('token expiry', () => {
    it('refreshes once and replays the request', async () => {
      const { requests } = stubFetch([
        { status: 401, body: { error: { code: 'UNAUTHORIZED', message: 'expired' } } },
        { status: 200, body: { data: { accessToken: 'fresh-token' } } },
        { status: 200, body: { data: { id: 'cart-1' } } },
      ]);

      const client = new HttpClient({ baseUrl: '/api' });
      client.setAccessToken('stale');

      expect(await client.get('/cart')).toEqual({ id: 'cart-1' });
      expect(requests[1].url).toContain('/auth/refresh');
      expect(requests[2].init.headers.Authorization).toBe('Bearer fresh-token');
    });

    it('gives up and reports a lost session when the refresh fails', async () => {
      stubFetch([
        { status: 401, body: { error: { code: 'UNAUTHORIZED', message: 'expired' } } },
        { status: 401, body: { error: { code: 'UNAUTHORIZED', message: 'no cookie' } } },
      ]);

      const client = new HttpClient();
      let lost = false;
      client.onSessionLost(() => {
        lost = true;
      });
      client.setAccessToken('stale');

      await expect(client.get('/cart')).rejects.toThrow(ApiError);
      expect(lost).toBe(true);
      expect(client.accessToken).toBeNull();
    });

    it('does not retry the refresh endpoint itself', async () => {
      const { requests } = stubFetch([
        { status: 401, body: { error: { code: 'UNAUTHORIZED', message: 'no cookie' } } },
      ]);

      const client = new HttpClient();
      await client
        .request('/auth/refresh', { method: 'POST', retryOnExpiry: false })
        .catch(() => {});

      expect(requests).toHaveLength(1);
    });
  });
});
