/**
 * @file Fixed, non-secret values shared across layers.
 *
 * Tunable ones live in SystemConfig (FR-G6); the values here are compile-time constants
 * and are frozen so a caller cannot mutate them at runtime.
 *
 * @module shared/constants
 */

/**
 * HTTP status codes used by the error hierarchy and controllers.
 *
 * @type {Readonly<Record<string, number>>}
 */
export const HTTP_STATUS = Object.freeze({
  OK: 200,
  CREATED: 201,
  NO_CONTENT: 204,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  UNPROCESSABLE: 422,
  TOO_MANY_REQUESTS: 429,
  INTERNAL_ERROR: 500,
});

/**
 * Credential and session policy (Epic A, SRS section 9).
 *
 * @type {Readonly<{
 *   BCRYPT_COST: number,
 *   ACCESS_TOKEN_TTL: string,
 *   REFRESH_TOKEN_TTL: string,
 *   REFRESH_TOKEN_TTL_MS: number,
 *   RESET_TOKEN_TTL_MIN: number,
 *   MAX_FAILED_LOGINS: number,
 *   LOCKOUT_MINUTES: number,
 *   PASSWORD_MIN_LENGTH: number,
 * }>}
 */
export const AUTH = Object.freeze({
  BCRYPT_COST: 12,
  ACCESS_TOKEN_TTL: '15m',
  REFRESH_TOKEN_TTL: '7d',
  REFRESH_TOKEN_TTL_MS: 7 * 24 * 60 * 60 * 1000,
  RESET_TOKEN_TTL_MIN: 15,
  MAX_FAILED_LOGINS: 5,
  LOCKOUT_MINUTES: 15,
  PASSWORD_MIN_LENGTH: 8,
});

/**
 * Defaults for the admin-tunable parameters of FR-G6.
 *
 * @type {Readonly<{
 *   DELIVERY_FEE_BDT: number,
 *   VENDOR_ACCEPT_TIMEOUT_SEC: number,
 *   CANCEL_WINDOW_STATUSES: string[],
 *   CONFIRM_PIN_LENGTH: number,
 *   MAX_ACTIVE_DELIVERIES_PER_RIDER: number,
 * }>}
 */
export const ORDER_DEFAULTS = Object.freeze({
  DELIVERY_FEE_BDT: 25,
  VENDOR_ACCEPT_TIMEOUT_SEC: 300,
  CANCEL_WINDOW_STATUSES: ['placed', 'accepted'],
  CONFIRM_PIN_LENGTH: 4,
  MAX_ACTIVE_DELIVERIES_PER_RIDER: 1,
});

/**
 * List-query page defaults and the hard ceiling on page size.
 *
 * @type {Readonly<{ DEFAULT_PAGE: number, DEFAULT_LIMIT: number, MAX_LIMIT: number }>}
 */
export const PAGINATION = Object.freeze({
  DEFAULT_PAGE: 1,
  DEFAULT_LIMIT: 20,
  MAX_LIMIT: 100,
});

/**
 * Throttling budgets enforced by `RateLimitMiddleware`.
 *
 * @type {Readonly<{
 *   LOGIN_PER_MIN: number,
 *   ORDER_PER_MIN: number,
 *   OTP_RESEND_PER_HOUR: number,
 * }>}
 */
export const RATE_LIMIT = Object.freeze({
  LOGIN_PER_MIN: 10,
  ORDER_PER_MIN: 5,
  OTP_RESEND_PER_HOUR: 3,
});

/**
 * Tracking polls until Phase 2 swaps in WebSockets (SRS section 10).
 *
 * @type {Readonly<{ POLL_INTERVAL_MS: number }>}
 */
export const REALTIME = Object.freeze({
  POLL_INTERVAL_MS: 5000,
});

/**
 * Search behaviour for FR-C2. The minimum query length keeps a single keystroke from
 * scanning every menu item, which is what NFR-02 (results in ≤ 1 s) is about.
 *
 * @type {Readonly<{ MIN_QUERY_LENGTH: number, MAX_RESULTS: number }>}
 */
export const SEARCH = Object.freeze({
  MIN_QUERY_LENGTH: 2,
  MAX_RESULTS: 50,
});

/**
 * Routes each role lands on after login (FR-A7). Kept beside the roles themselves so the
 * API and the client cannot disagree about where a vendor belongs.
 *
 * @type {Readonly<Record<string, string>>}
 */
export const ROLE_HOME_ROUTE = Object.freeze({
  student: '/shops',
  vendor: '/vendor/orders',
  admin: '/admin/vendors',
});
