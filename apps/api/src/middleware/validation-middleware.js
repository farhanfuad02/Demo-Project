/**
 * @file Whitelists request input against a schema.
 *
 * @module middleware/validation-middleware
 */

import { BaseMiddleware } from '../core/base-middleware.js';
import { ValidationError } from '../core/errors/app-error.js';

/**
 * Parses body and query against Zod schemas and publishes the result as
 * `request.validated`.
 *
 * Controllers read only from there, never from `request.body`, so an unvalidated field
 * has no path into a service. Zod strips unknown keys, which turns the schema into a
 * whitelist rather than a set of assertions about input that arrives regardless.
 *
 * @augments BaseMiddleware
 */
export class ValidationMiddleware extends BaseMiddleware {
  /** @type {{ body?: import('zod').ZodType, query?: import('zod').ZodType }} */
  #schemas;

  /**
   * @param {object} schemas - Schemas to apply.
   * @param {import('zod').ZodType} [schemas.body] - Schema for the request body.
   * @param {import('zod').ZodType} [schemas.query] - Schema for the query string.
   */
  constructor(schemas) {
    super();
    this.#schemas = schemas;
  }

  /**
   * Builds a validator for a body schema.
   *
   * @param {import('zod').ZodType} schema - Schema for the request body.
   * @returns {import('express').RequestHandler} Handler to mount.
   */
  static body(schema) {
    return new ValidationMiddleware({ body: schema }).handler();
  }

  /**
   * Builds a validator for a query schema.
   *
   * @param {import('zod').ZodType} schema - Schema for the query string.
   * @returns {import('express').RequestHandler} Handler to mount.
   */
  static query(schema) {
    return new ValidationMiddleware({ query: schema }).handler();
  }

  /**
   * The validator.
   *
   * @returns {import('express').RequestHandler} Handler to mount.
   */
  handler() {
    return this.bind('validate');
  }

  /**
   * Parses whatever this instance was configured with.
   *
   * @param {import('express').Request} request - Incoming request.
   * @param {import('express').Response} _response - Outgoing response.
   * @param {import('express').NextFunction} next - Continuation.
   * @returns {Promise<void>} Resolves once the payload is attached.
   * @throws {ValidationError} When either schema rejects the input.
   */
  async validate(request, _response, next) {
    request.validated = {};

    if (this.#schemas.body) {
      request.validated.body = ValidationMiddleware.#parse(this.#schemas.body, request.body ?? {});
    }
    if (this.#schemas.query) {
      request.validated.query = ValidationMiddleware.#parse(this.#schemas.query, request.query);
    }
    next();
  }

  /**
   * Runs one schema, turning a Zod failure into the project's error type.
   *
   * @param {import('zod').ZodType} schema - Schema to apply.
   * @param {unknown} input - Raw input.
   * @returns {Record<string, unknown>} The validated, whitelisted payload.
   * @throws {ValidationError} When the schema rejects the input.
   */
  static #parse(schema, input) {
    const result = schema.safeParse(input);
    if (result.success) {
      return result.data;
    }
    /** @type {import('@hungry-ju/shared/types').ValidationIssue[]} */
    const issues = result.error.issues.map((issue) => ({
      path: issue.path.join('.') || '(root)',
      message: issue.message,
      code: issue.code,
    }));
    throw new ValidationError(issues[0]?.message ?? 'The submitted data is invalid.', issues);
  }
}
