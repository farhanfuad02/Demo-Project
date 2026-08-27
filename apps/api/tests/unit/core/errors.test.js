/**
 * @file Unit tests for the error hierarchy.
 *
 * @module tests/unit/core/errors
 */

import { describe, expect, it } from '@jest/globals';
import { ERROR_CODE } from '@hungry-ju/shared/enums';
import { HTTP_STATUS } from '@hungry-ju/shared/constants';
import {
  AppError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
  RateLimitError,
  UnauthorizedError,
  ValidationError,
} from '../../../src/core/errors/app-error.js';

describe('AppError', () => {
  it('carries a status, a code, and a name taken from the subclass', () => {
    const error = new AppError('Boom', 418, 'TEAPOT');
    expect(error.statusCode).toBe(418);
    expect(error.code).toBe('TEAPOT');
    expect(error.name).toBe('AppError');
    expect(error).toBeInstanceOf(Error);
  });

  it('marks itself as a deliberate failure rather than a bug', () => {
    expect(new AppError('Boom').isOperational).toBe(true);
  });

  it('renders the wire envelope', () => {
    expect(
      new ValidationError('Bad input', [{ path: 'email', message: 'Required' }]).toJSON()
    ).toEqual({
      error: {
        code: ERROR_CODE.VALIDATION,
        message: 'Bad input',
        details: [{ path: 'email', message: 'Required' }],
      },
    });
  });
});

describe('error subclasses', () => {
  it.each([
    [new ValidationError(), HTTP_STATUS.UNPROCESSABLE, ERROR_CODE.VALIDATION],
    [new UnauthorizedError(), HTTP_STATUS.UNAUTHORIZED, ERROR_CODE.UNAUTHORIZED],
    [new ForbiddenError(), HTTP_STATUS.FORBIDDEN, ERROR_CODE.FORBIDDEN],
    [new NotFoundError(), HTTP_STATUS.NOT_FOUND, ERROR_CODE.NOT_FOUND],
    [new ConflictError(), HTTP_STATUS.CONFLICT, ERROR_CODE.CONFLICT],
    [new RateLimitError(), HTTP_STATUS.TOO_MANY_REQUESTS, ERROR_CODE.RATE_LIMITED],
  ])('%s maps to its status and code', (error, status, code) => {
    expect(error.statusCode).toBe(status);
    expect(error.code).toBe(code);
    expect(error).toBeInstanceOf(AppError);
  });

  it('names the missing resource in a 404', () => {
    expect(new NotFoundError('Order').message).toBe('Order was not found.');
  });

  it('carries what changed on a conflict, so checkout can show a diff', () => {
    const error = new ConflictError('Prices moved', { priceChanges: [{ was: 55, now: 60 }] });
    expect(error.details.priceChanges).toHaveLength(1);
  });

  it('tells the caller when to retry after a throttle', () => {
    expect(new RateLimitError('Slow down', 30).details).toEqual({ retryAfterSeconds: 30 });
  });
});
