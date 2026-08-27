/**
 * @file Shared JSDoc type definitions.
 *
 * The project is plain JavaScript, so the type vocabulary that crosses layer boundaries
 * lives here as `@typedef` declarations instead of in `.d.ts` files. Reference them from
 * any module with the import form, e.g.
 * `@param {import('@hungry-ju/shared/types').Actor} actor`.
 *
 * This module has no runtime exports; importing it at runtime is never necessary.
 *
 * @module shared/types
 */

/**
 * Role of an authenticated principal.
 *
 * @typedef {'student' | 'vendor' | 'admin'} UserRole
 * @see module:shared/enums.USER_ROLE
 */

/**
 * Lifecycle state of an account.
 *
 * @typedef {'pending' | 'verified' | 'suspended'} UserStatus
 * @see module:shared/enums.USER_STATUS
 */

/**
 * Lifecycle state of an order.
 *
 * @typedef {'placed' | 'accepted' | 'preparing' | 'ready' | 'picked_up' | 'delivered'
 *   | 'cancelled' | 'rejected'} OrderStatus
 * @see module:shared/enums.ORDER_STATUS
 */

/**
 * Lifecycle state of a delivery assignment.
 *
 * @typedef {'pending' | 'available' | 'assigned' | 'heading_to_vendor' | 'picked_up'
 *   | 'delivered' | 'released'} DeliveryStatus
 * @see module:shared/enums.DELIVERY_STATUS
 */

/**
 * The authenticated principal a request acts as, resolved by `AuthMiddleware` and passed
 * down to services for ownership checks.
 *
 * @typedef {object} Actor
 * @property {string} id - User id.
 * @property {UserRole} role - Role used by the RBAC gate.
 * @property {UserStatus} status - Account status; only `verified` accounts may act.
 * @property {boolean} [deliverModeOn] - Whether a student currently accepts deliveries.
 * @property {string} [shopId] - Shop owned by the actor, when the role is `vendor`.
 */

/**
 * A database row in the snake_case shape of the schema in SRS section 7.
 *
 * @typedef {Record<string, unknown>} PersistenceRow
 */

/**
 * Repository filter criteria: column/value pairs combined with `AND`.
 *
 * @typedef {Record<string, unknown>} Criteria
 */

/**
 * Page descriptor returned alongside a list response.
 *
 * @typedef {object} PaginationMeta
 * @property {number} page - 1-based page number.
 * @property {number} limit - Page size actually applied after clamping.
 * @property {number} totalCount - Total matching rows.
 * @property {number} totalPages - Number of pages at this page size.
 * @property {boolean} hasNext - Whether a further page exists.
 */

/**
 * A page of results plus its metadata.
 *
 * @typedef {object} PaginatedResult
 * @property {object[]} items - The rows or models for this page.
 * @property {PaginationMeta} meta - Page descriptor.
 */

/**
 * Error envelope produced by `AppError.toJSON` and returned by `ErrorMiddleware`.
 *
 * @typedef {object} ErrorEnvelope
 * @property {{ code: string, message: string, details: unknown }} error - Failure detail;
 *   `details` is `null` unless a validator supplied field-level issues.
 */

/**
 * Field-level validation failure, flattened from a Zod issue list.
 *
 * @typedef {object} ValidationIssue
 * @property {string} path - Dotted path of the offending field.
 * @property {string} message - Human-readable reason.
 * @property {string} [code] - Machine-readable Zod issue code.
 */

/**
 * A Zod schema used by validators and the validation middleware.
 *
 * @typedef {import('zod').ZodType} Schema
 */

/**
 * Outbound email prepared by `EmailService`.
 *
 * @typedef {object} EmailMessage
 * @property {string} to - Recipient address.
 * @property {string} subject - Subject line.
 * @property {string} html - HTML body.
 * @property {string} [text] - Plain-text fallback body.
 */

/**
 * Structured context attached to a log line. Secrets are stripped by `Logger.redact`
 * before anything is written.
 *
 * @typedef {Record<string, unknown>} LogMeta
 */

export {};
