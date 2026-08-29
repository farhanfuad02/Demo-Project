/**
 * @file Single source of truth for every enumerated value in SRS section 7.
 *
 * Frozen so a typo in a status string fails at review time, not at runtime in production.
 * The matching JSDoc union types live in `@/shared/types`.
 *
 * @module shared/enums
 */

/**
 * Gender, which on this campus is an address question rather than a demographic one:
 * JU's residence halls are gender-segregated, so it is what decides which hall list a
 * student picks from (`@hungry-ju/shared/halls`).
 *
 * Two values, because the halls come in two sets and a student who belongs to neither
 * has no hall to be offered.
 *
 * @type {Readonly<Record<string, string>>}
 */
export const GENDER = Object.freeze({
  MALE: 'male',
  FEMALE: 'female',
});

/**
 * Roles a user account can hold; drives RBAC and post-login routing (FR-A7).
 *
 * @type {Readonly<Record<string, string>>}
 */
export const USER_ROLE = Object.freeze({
  STUDENT: 'student',
  VENDOR: 'vendor',
  ADMIN: 'admin',
});

/**
 * Account lifecycle: `pending` until verified, `suspended` by an admin (BR-02).
 *
 * @type {Readonly<Record<string, string>>}
 */
export const USER_STATUS = Object.freeze({
  PENDING: 'pending',
  VERIFIED: 'verified',
  SUSPENDED: 'suspended',
});

/**
 * Review outcome for a vendor shop application (FR-G2).
 *
 * @type {Readonly<Record<string, string>>}
 */
export const APPROVAL_STATUS = Object.freeze({
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
});

/**
 * Order lifecycle of SRS section 6 state machine.
 *
 * @type {Readonly<Record<string, string>>}
 */
export const ORDER_STATUS = Object.freeze({
  PLACED: 'placed',
  ACCEPTED: 'accepted',
  PREPARING: 'preparing',
  READY: 'ready',
  PICKED_UP: 'picked_up',
  DELIVERED: 'delivered',
  CANCELLED: 'cancelled',
  REJECTED: 'rejected',
});

/**
 * Delivery assignment lifecycle.
 *
 * A delivery exists from the moment the order is placed, because that is when the
 * customer is shown their confirmation PIN (SRS section 12.4). It stays `pending` and
 * invisible to riders until the vendor marks the food ready, and only then enters the
 * open feed as `available`.
 *
 * @type {Readonly<Record<string, string>>}
 */
export const DELIVERY_STATUS = Object.freeze({
  PENDING: 'pending',
  AVAILABLE: 'available',
  ASSIGNED: 'assigned',
  HEADING_TO_VENDOR: 'heading_to_vendor',
  PICKED_UP: 'picked_up',
  DELIVERED: 'delivered',
  RELEASED: 'released',
});

/**
 * Supported payment methods; only `cod` is in MVP scope.
 *
 * @type {Readonly<Record<string, string>>}
 */
export const PAYMENT_METHOD = Object.freeze({
  COD: 'cod',
  ONLINE: 'online',
});

/**
 * Phase 2 only; kept here so the enum column exists from day one.
 *
 * @type {Readonly<Record<string, string>>}
 */
export const ESCROW_STATUS = Object.freeze({
  HELD: 'held',
  RELEASED: 'released',
  REFUNDED: 'refunded',
});

/**
 * Who a payout split pays out to.
 *
 * @type {Readonly<Record<string, string>>}
 */
export const PAYEE_TYPE = Object.freeze({
  VENDOR: 'vendor',
  RIDER: 'rider',
  PLATFORM: 'platform',
});

/**
 * What a rating is about: the shop or the delivery partner.
 *
 * @type {Readonly<Record<string, string>>}
 */
export const RATING_TARGET = Object.freeze({
  SHOP: 'shop',
  RIDER: 'rider',
});

/**
 * Event that produced an in-app notification.
 *
 * @type {Readonly<Record<string, string>>}
 */
export const NOTIFICATION_TYPE = Object.freeze({
  ORDER_PLACED: 'order_placed',
  ORDER_ACCEPTED: 'order_accepted',
  ORDER_REJECTED: 'order_rejected',
  ORDER_PREPARING: 'order_preparing',
  ORDER_READY: 'order_ready',
  ORDER_ASSIGNED: 'order_assigned',
  ORDER_PICKED_UP: 'order_picked_up',
  ORDER_DELIVERED: 'order_delivered',
  ORDER_CANCELLED: 'order_cancelled',
  VENDOR_APPROVED: 'vendor_approved',
  VENDOR_REJECTED: 'vendor_rejected',
  ACCOUNT_SUSPENDED: 'account_suspended',
});

/**
 * Kind of change recorded in the audit log (FR-G5).
 *
 * @type {Readonly<Record<string, string>>}
 */
export const AUDIT_ACTION = Object.freeze({
  CREATE: 'create',
  UPDATE: 'update',
  DELETE: 'delete',
  STATUS_CHANGE: 'status_change',
  LOGIN: 'login',
  LOGOUT: 'logout',
});

/**
 * Purpose a signed token was issued for. Encoded in the payload so a refresh token can
 * never be replayed as an access token, nor a reset link as a session.
 *
 * @type {Readonly<Record<string, string>>}
 */
export const TOKEN_TYPE = Object.freeze({
  ACCESS: 'access',
  REFRESH: 'refresh',
  VERIFICATION: 'verification',
  PASSWORD_RESET: 'password_reset',
});

/**
 * Entity families referenced by an audit log row (FR-G5 / NFR-13).
 *
 * @type {Readonly<Record<string, string>>}
 */
export const AUDIT_ENTITY = Object.freeze({
  USER: 'user',
  SHOP: 'shop',
  MENU_ITEM: 'menu_item',
  ORDER: 'order',
  DELIVERY: 'delivery',
  RATING: 'rating',
  PAYMENT: 'payment',
});

/**
 * Machine-readable failure codes returned in the error envelope. The client switches on
 * these rather than on message text, which is free to change with translations (NFR-10).
 *
 * @type {Readonly<Record<string, string>>}
 */
export const ERROR_CODE = Object.freeze({
  VALIDATION: 'VALIDATION_ERROR',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  RATE_LIMITED: 'RATE_LIMITED',
  INTERNAL: 'INTERNAL_ERROR',
});
