/**
 * @file Index definitions for the MongoDB engine.
 *
 * @module config/database/mongo-indexes
 */

/**
 * Indexes created at boot, keyed by collection.
 *
 * Two kinds live here, and the distinction matters. The plain indexes exist for speed:
 * every one of them backs a filter a repository actually issues, so the list is a map of
 * how the application reads rather than a guess about it. The unique ones exist for
 * correctness — they are the same invariants the services already check, stated a second
 * time where two concurrent requests cannot step over them. A service that reads "no cart
 * for this student" and then writes one can be beaten to the write by a second request;
 * the index is what makes losing that race an error instead of a duplicate.
 *
 * `phone` is unique only over documents that actually have one, because an account
 * without a phone number stores `null` and a plain unique index would allow exactly one
 * such account to exist.
 *
 * @type {Readonly<Record<string, Array<{ key: Record<string, 1 | -1>, unique?: boolean,
 *   partialFilterExpression?: Record<string, unknown>, name: string }>>>}
 */
export const MONGO_INDEXES = Object.freeze({
  users: [
    { name: 'users_email_unique', key: { email: 1 }, unique: true },
    {
      name: 'users_phone_unique',
      key: { phone: 1 },
      unique: true,
      partialFilterExpression: { phone: { $type: 'string' } },
    },
    { name: 'users_role_status', key: { role: 1, status: 1 } },
  ],
  student_profiles: [{ name: 'student_profiles_user_unique', key: { user_id: 1 }, unique: true }],
  shops: [
    { name: 'shops_owner_unique', key: { owner_user_id: 1 }, unique: true },
    { name: 'shops_approval_status', key: { approval_status: 1 } },
    { name: 'shops_shop_name', key: { shop_name: 1 } },
  ],
  menu_items: [
    { name: 'menu_items_shop', key: { shop_id: 1 } },
    { name: 'menu_items_shop_available', key: { shop_id: 1, is_available: 1 } },
    { name: 'menu_items_category', key: { category: 1 } },
  ],
  carts: [{ name: 'carts_student_unique', key: { student_id: 1 }, unique: true }],
  cart_items: [{ name: 'cart_items_cart', key: { cart_id: 1 } }],
  orders: [
    { name: 'orders_student_placed', key: { student_id: 1, placed_at: -1 } },
    { name: 'orders_shop_status', key: { shop_id: 1, status: 1 } },
    { name: 'orders_status_placed', key: { status: 1, placed_at: 1 } },
  ],
  order_items: [{ name: 'order_items_order', key: { order_id: 1 } }],
  deliveries: [
    { name: 'deliveries_order_unique', key: { order_id: 1 }, unique: true },
    { name: 'deliveries_status', key: { status: 1 } },
    { name: 'deliveries_rider_status', key: { rider_student_id: 1, status: 1 } },
  ],
  payments: [
    { name: 'payments_order', key: { order_id: 1 } },
    { name: 'payments_collected_at', key: { collected_at: -1 } },
  ],
  ratings: [
    // BR-08: one rating per order per target.
    { name: 'ratings_order_target_unique', key: { order_id: 1, target_type: 1 }, unique: true },
    { name: 'ratings_target', key: { target_type: 1, target_id: 1 } },
  ],
  notifications: [{ name: 'notifications_user_read', key: { user_id: 1, is_read: 1 } }],
  audit_logs: [
    { name: 'audit_logs_entity', key: { entity_type: 1, entity_id: 1 } },
    { name: 'audit_logs_created_at', key: { created_at: -1 } },
  ],
  auth_tokens: [
    { name: 'auth_tokens_hash_unique', key: { token_hash: 1 }, unique: true },
    { name: 'auth_tokens_user_type', key: { user_id: 1, type: 1 } },
    { name: 'auth_tokens_expires_at', key: { expires_at: 1 } },
  ],
  system_config: [{ name: 'system_config_key_unique', key: { config_key: 1 }, unique: true }],
});
