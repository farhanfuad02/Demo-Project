/**
 * @file Unit tests for the middleware layer.
 *
 * @module tests/unit/middleware/middleware
 */

import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { z } from 'zod';
import { ERROR_CODE, USER_ROLE } from '@hungry-ju/shared/enums';
import { HTTP_STATUS } from '@hungry-ju/shared/constants';
import { TOKENS } from '../../../src/config/container.js';
import { AuthMiddleware } from '../../../src/middleware/auth-middleware.js';
import { ErrorMiddleware } from '../../../src/middleware/error-middleware.js';
import { RateLimitMiddleware } from '../../../src/middleware/rate-limit-middleware.js';
import { RbacMiddleware } from '../../../src/middleware/rbac-middleware.js';
import { RequestLogMiddleware } from '../../../src/middleware/request-log-middleware.js';
import { ValidationMiddleware } from '../../../src/middleware/validation-middleware.js';
import { Logger } from '../../../src/lib/logger.js';
import {
  ConflictError,
  ForbiddenError,
  UnauthorizedError,
} from '../../../src/core/errors/app-error.js';
import { makeContainer, makeUser } from '../../helpers/test-database.js';

/**
 * A stand-in Express response that records what it was told to send.
 *
 * @returns {object} The recorder.
 */
function makeResponse() {
  const response = {
    statusCode: null,
    body: null,
    headers: {},
    headersSent: false,
    listeners: {},
    /**
     * @param {number} code - Status.
     * @returns {object} This response.
     */
    status(code) {
      response.statusCode = code;
      return response;
    },
    /**
     * @param {unknown} payload - Body.
     * @returns {object} This response.
     */
    json(payload) {
      response.body = payload;
      return response;
    },
    /**
     * @param {string} name - Header name.
     * @param {string} value - Header value.
     * @returns {object} This response.
     */
    set(name, value) {
      response.headers[name] = value;
      return response;
    },
    /**
     * @param {string} event - Event name.
     * @param {Function} handler - Listener.
     * @returns {object} This response.
     */
    on(event, handler) {
      response.listeners[event] = handler;
      return response;
    },
  };
  return response;
}

/**
 * A stand-in Express request.
 *
 * @param {object} [overrides] - Fields to set.
 * @returns {object} The request.
 */
function makeRequest(overrides = {}) {
  return {
    method: 'GET',
    originalUrl: '/api/test',
    ip: '10.0.0.1',
    query: {},
    headers: {},
    /**
     * @param {string} name - Header name.
     * @returns {string | undefined} The value.
     */
    get(name) {
      return this.headers[name.toLowerCase()];
    },
    ...overrides,
  };
}

describe('AuthMiddleware', () => {
  /** @type {import('../../../src/config/container.js').Container} */
  let container;
  /** @type {AuthMiddleware} */
  let middleware;
  /** @type {string} */
  let token;

  beforeEach(async () => {
    ({ container } = await makeContainer());
    middleware = container.resolve(TOKENS.AUTH_MIDDLEWARE);
    const user = await makeUser(container);
    token = container.resolve(TOKENS.TOKEN_SERVICE).issueAccessToken(user);
  });

  it('reads a bearer token case-insensitively', () => {
    expect(
      AuthMiddleware.tokenFrom(makeRequest({ headers: { authorization: 'Bearer abc' } }))
    ).toBe('abc');
    expect(
      AuthMiddleware.tokenFrom(makeRequest({ headers: { authorization: 'bearer abc' } }))
    ).toBe('abc');
    expect(AuthMiddleware.tokenFrom(makeRequest({ headers: {} }))).toBeNull();
  });

  it('attaches the principal on a valid token', async () => {
    const request = makeRequest({ headers: { authorization: `Bearer ${token}` } });
    let called = false;

    await middleware.handler()(request, makeResponse(), () => {
      called = true;
    });

    expect(called).toBe(true);
    expect(request.actor.role).toBe(USER_ROLE.STUDENT);
  });

  it('refuses a request with no token', async () => {
    let error;
    await middleware.handler()(makeRequest(), makeResponse(), (thrown) => {
      error = thrown;
    });
    expect(error).toBeInstanceOf(UnauthorizedError);
  });

  it('carries on without an actor when the optional guard sees a bad token', async () => {
    const request = makeRequest({ headers: { authorization: 'Bearer nonsense' } });
    let called = false;

    await middleware.optional()(request, makeResponse(), () => {
      called = true;
    });

    // Browsing shops must work for a visitor whose token happened to expire.
    expect(called).toBe(true);
    expect(request.actor).toBeUndefined();
  });
});

describe('RbacMiddleware', () => {
  it('lets an allowed role through', async () => {
    const handler = RbacMiddleware.require(USER_ROLE.VENDOR);
    let called = false;

    await handler(makeRequest({ actor: { role: USER_ROLE.VENDOR } }), makeResponse(), () => {
      called = true;
    });
    expect(called).toBe(true);
  });

  it('refuses a role that is not listed', async () => {
    let error;
    await RbacMiddleware.require(USER_ROLE.ADMIN)(
      makeRequest({ actor: { role: USER_ROLE.STUDENT } }),
      makeResponse(),
      (thrown) => {
        error = thrown;
      }
    );
    expect(error).toBeInstanceOf(ForbiddenError);
  });

  it('refuses when the route was never guarded by AuthMiddleware', async () => {
    let error;
    await RbacMiddleware.require(USER_ROLE.ADMIN)(makeRequest(), makeResponse(), (thrown) => {
      error = thrown;
    });
    expect(error).toBeInstanceOf(UnauthorizedError);
  });
});

describe('ValidationMiddleware', () => {
  const schema = z.object({ name: z.string().min(2), quantity: z.coerce.number().int().min(1) });

  it('publishes the parsed payload for the controller', async () => {
    const request = makeRequest({ body: { name: 'Khichuri', quantity: '2' } });
    await ValidationMiddleware.body(schema)(request, makeResponse(), () => {});

    expect(request.validated.body).toEqual({ name: 'Khichuri', quantity: 2 });
  });

  it('strips a field the schema does not name', async () => {
    const request = makeRequest({ body: { name: 'Khichuri', quantity: 1, role: 'admin' } });
    await ValidationMiddleware.body(schema)(request, makeResponse(), () => {});

    // The whitelist is what stops an extra field becoming an extra column.
    expect(request.validated.body).not.toHaveProperty('role');
  });

  it('reports the failing field', async () => {
    let error;
    await ValidationMiddleware.body(schema)(
      makeRequest({ body: { name: 'X', quantity: 0 } }),
      makeResponse(),
      (thrown) => {
        error = thrown;
      }
    );

    expect(error.code).toBe(ERROR_CODE.VALIDATION);
    expect(error.details.map((issue) => issue.path)).toContain('name');
  });

  it('validates a query string too', async () => {
    const request = makeRequest({ query: { page: '2' } });
    await ValidationMiddleware.query(z.object({ page: z.coerce.number() }))(
      request,
      makeResponse(),
      () => {}
    );
    expect(request.validated.query).toEqual({ page: 2 });
  });
});

describe('RateLimitMiddleware', () => {
  it('allows requests up to the budget and refuses the next one', async () => {
    const handler = RateLimitMiddleware.of({ limit: 2, windowMs: 60_000, name: 'test' });
    const request = makeRequest();
    let allowed = 0;
    let error;

    for (let attempt = 0; attempt < 3; attempt += 1) {
      await handler(request, makeResponse(), (thrown) => {
        if (thrown) {
          error = thrown;
        } else {
          allowed += 1;
        }
      });
    }

    expect(allowed).toBe(2);
    expect(error.statusCode).toBe(HTTP_STATUS.TOO_MANY_REQUESTS);
  });

  it('keys on the account rather than the address, so one campus NAT is not one budget', async () => {
    const handler = RateLimitMiddleware.of({ limit: 1, windowMs: 60_000, name: 'per-user' });
    let refused = 0;

    for (const id of ['user-a', 'user-b']) {
      await handler(makeRequest({ actor: { id } }), makeResponse(), (thrown) => {
        if (thrown) {
          refused += 1;
        }
      });
    }
    expect(refused).toBe(0);
  });

  it('tells the caller when to try again', async () => {
    const handler = RateLimitMiddleware.of({ limit: 1, windowMs: 30_000, name: 'retry' });
    const request = makeRequest();
    const response = makeResponse();

    await handler(request, response, () => {});
    await handler(request, response, () => {});

    expect(Number(response.headers['Retry-After'])).toBeGreaterThan(0);
  });

  it('refills the budget once the window has passed', async () => {
    const handler = RateLimitMiddleware.of({ limit: 1, windowMs: 1, name: 'window' });
    const request = makeRequest();

    await handler(request, makeResponse(), () => {});
    await new Promise((resolve) => setTimeout(resolve, 5));

    let refused = false;
    await handler(request, makeResponse(), (thrown) => {
      refused = Boolean(thrown);
    });
    expect(refused).toBe(false);
  });
});

describe('ErrorMiddleware', () => {
  const logger = new Logger({ level: 'silent' });

  it('renders a deliberate failure with its own status', () => {
    const response = makeResponse();
    new ErrorMiddleware({ logger }).handler()(
      new ConflictError('Already taken'),
      makeRequest(),
      response,
      () => {}
    );

    expect(response.statusCode).toBe(HTTP_STATUS.CONFLICT);
    expect(response.body.error.message).toBe('Already taken');
  });

  it('never leaks a stack trace or a driver message to a client', () => {
    const response = makeResponse();
    new ErrorMiddleware({ logger, exposeStack: false }).handler()(
      new Error('SELECT * FROM users failed at /srv/app/db.js:42'),
      makeRequest(),
      response,
      () => {}
    );

    expect(response.statusCode).toBe(HTTP_STATUS.INTERNAL_ERROR);
    expect(JSON.stringify(response.body)).not.toContain('SELECT');
    expect(response.body.error.details).toBeNull();
  });

  it('includes the stack outside production, where it is what a developer needs', () => {
    const response = makeResponse();
    new ErrorMiddleware({ logger, exposeStack: true }).handler()(
      new Error('boom'),
      makeRequest(),
      response,
      () => {}
    );
    expect(response.body.error.details.message).toBe('boom');
  });

  it('hands a failure on when the response has already gone out', () => {
    const response = makeResponse();
    response.headersSent = true;
    let forwarded;

    new ErrorMiddleware({ logger }).handler()(
      new Error('late'),
      makeRequest(),
      response,
      (error) => {
        forwarded = error;
      }
    );
    expect(forwarded).toBeInstanceOf(Error);
  });

  it('turns an unmatched path into a 404', () => {
    let error;
    ErrorMiddleware.notFound()(
      makeRequest({ originalUrl: '/api/nope' }),
      makeResponse(),
      (thrown) => {
        error = thrown;
      }
    );

    expect(error.statusCode).toBe(HTTP_STATUS.NOT_FOUND);
    expect(error.message).toContain('/api/nope');
  });
});

describe('RequestLogMiddleware', () => {
  it('stamps a correlation id and records how the request ended', () => {
    const lines = [];
    const logger = new Logger({
      level: 'info',
      sink: {
        /**
         * @param {string} line - JSON line.
         * @returns {void}
         */
        info(line) {
          lines.push(JSON.parse(line));
        },
      },
    });

    const request = makeRequest();
    const response = makeResponse();
    response.statusCode = 200;

    new RequestLogMiddleware({ logger }).handler()(request, response, () => {});
    expect(request.requestId).toBeTruthy();
    expect(response.headers['X-Request-Id']).toBe(request.requestId);

    response.listeners.finish();
    expect(lines[0]).toMatchObject({ message: 'request', status: 200 });
    expect(lines[0].durationMs).toBeGreaterThanOrEqual(0);
  });

  it('reuses an incoming correlation id', () => {
    const request = makeRequest({ headers: { 'x-request-id': 'trace-123' } });
    new RequestLogMiddleware({ logger: new Logger({ level: 'silent' }) }).handler()(
      request,
      makeResponse(),
      () => {}
    );
    expect(request.requestId).toBe('trace-123');
  });
});

describe('Logger', () => {
  it('replaces secrets at any depth before writing', () => {
    const written = [];
    const logger = new Logger({
      level: 'info',
      sink: {
        /**
         * @param {string} line - JSON line.
         * @returns {void}
         */
        info(line) {
          written.push(line);
        },
      },
    });

    logger.info('sign-in', {
      email: 'f@juniv.edu',
      password: 'Hungry@JU1',
      nested: { refreshToken: 'secret', confirmPin: '1234' },
    });

    expect(written[0]).not.toContain('Hungry@JU1');
    expect(written[0]).not.toContain('1234');
    expect(written[0]).toContain('f@juniv.edu');
  });

  it('writes nothing below the configured level', () => {
    const sink = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), log: jest.fn() };
    const logger = new Logger({ level: 'warn', sink });

    logger.info('quiet');
    logger.warn('loud');

    expect(sink.info).not.toHaveBeenCalled();
    expect(sink.warn).toHaveBeenCalledTimes(1);
  });

  it('stamps a child logger’s context on every line', () => {
    const written = [];
    const logger = new Logger({
      level: 'info',
      sink: {
        /**
         * @param {string} line - JSON line.
         * @returns {void}
         */
        info(line) {
          written.push(JSON.parse(line));
        },
      },
    }).child({ requestId: 'trace-1' });

    logger.info('hello');
    expect(written[0].requestId).toBe('trace-1');
  });
});
