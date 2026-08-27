/**
 * @file Data access for the order aggregate.
 *
 * @module repositories/order-repository
 */

import { ORDER_STATUS } from '@hungry-ju/shared/enums';
import { BaseRepository } from '../core/base-repository.js';
import { Order } from '../models/order.js';
import { OrderItem } from '../models/order-item.js';

/**
 * Reads and writes the `orders` table together with its `order_items` lines.
 *
 * @augments BaseRepository<Order>
 */
export class OrderRepository extends BaseRepository {
  /**
   * @param {import('../config/database/database.js').Database} db - Database client.
   */
  constructor(db) {
    super(db, 'orders');
  }

  /**
   * Inserts an order and its lines in one transaction.
   *
   * Both halves land or neither does: an order row without lines would be an unpayable
   * order, and lines without an order would be invisible rows nobody ever collects.
   *
   * @param {Order} order - Aggregate to store.
   * @returns {Promise<Order>} The stored order with its lines.
   */
  async createAggregate(order) {
    return this.transaction(async () => {
      const stored = await this.create(order);
      /** @type {OrderItem[]} */
      const lines = [];
      for (const item of order.items) {
        item.attachTo(stored.id);
        const row = await this.db.insert('order_items', { ...item.toPersistence(), id: null });
        lines.push(OrderItem.fromPersistence(row));
      }
      stored.setItems(lines);
      return stored;
    });
  }

  /**
   * Loads an order with its lines.
   *
   * @param {string} orderId - Order to load.
   * @returns {Promise<Order | null>} Order with lines, or `null`.
   */
  async findWithItems(orderId) {
    const order = await this.findById(orderId);
    if (!order) {
      return null;
    }
    await this.attachItems(order);
    return order;
  }

  /**
   * Loads an order with its lines or fails.
   *
   * @param {string} orderId - Order to load.
   * @returns {Promise<Order>} Order with lines.
   * @throws {import('../core/errors/app-error.js').NotFoundError} When there is no such order.
   */
  async findWithItemsOrFail(orderId) {
    const order = await this.findByIdOrFail(orderId, 'Order');
    await this.attachItems(order);
    return order;
  }

  /**
   * Attaches the lines belonging to an order.
   *
   * @param {Order} order - Order to fill.
   * @returns {Promise<void>} Resolves once the lines are attached.
   */
  async attachItems(order) {
    const rows = await this.db.findMany('order_items', { order_id: order.id });
    order.setItems(rows.map((row) => OrderItem.fromPersistence(row)));
  }

  /**
   * Attaches lines to a whole list, so a history page costs one pass instead of one
   * query per order inside a loop.
   *
   * @param {Order[]} orders - Orders to fill.
   * @returns {Promise<Order[]>} The same orders, lines attached.
   */
  async attachItemsToAll(orders) {
    if (orders.length === 0) {
      return orders;
    }
    const rows = await this.db.findMany('order_items', {
      order_id: { $in: orders.map((order) => order.id) },
    });
    for (const order of orders) {
      order.setItems(
        rows.filter((row) => row.order_id === order.id).map((row) => OrderItem.fromPersistence(row))
      );
    }
    return orders;
  }

  /**
   * A student's order history (FR-C8).
   *
   * @param {string} studentId - Ordering student.
   * @param {import('../utils/query-options.js').QueryOptions} [options] - Sort/page window.
   * @returns {Promise<Order[]>} Orders, newest first when sorted by `placed_at`.
   */
  async findByStudent(studentId, options = undefined) {
    return this.findMany({ student_id: studentId }, options);
  }

  /**
   * A vendor's order board (FR-B4).
   *
   * @param {string} shopId - Shop whose orders to list.
   * @param {string[]} [statuses] - Restrict to these statuses.
   * @param {import('../utils/query-options.js').QueryOptions} [options] - Sort/page window.
   * @returns {Promise<Order[]>} Orders.
   */
  async findByShop(shopId, statuses = undefined, options = undefined) {
    /** @type {import('@hungry-ju/shared/types').Criteria} */
    const criteria = { shop_id: shopId };
    if (statuses) {
      criteria.status = { $in: statuses };
    }
    return this.findMany(criteria, options);
  }

  /**
   * Orders the vendor has not answered before the deadline (BR-11).
   *
   * The lines come with them. The scheduler cancels these orders and writes them back,
   * and an order without its lines fails its own validation on save — so returning a
   * partial aggregate here would break the auto-cancel job in production while looking
   * perfectly reasonable at the call site.
   *
   * @param {Date} [now] - Reference time; injectable so tests need no clock control.
   * @returns {Promise<Order[]>} Orders past their accept deadline, lines attached.
   */
  async findExpiredAwaitingAcceptance(now = new Date()) {
    const expired = await this.findMany({
      status: ORDER_STATUS.PLACED,
      accept_deadline: { $lte: now.toISOString() },
    });
    return this.attachItemsToAll(expired);
  }

  /**
   * Counts a student's orders, for page metadata.
   *
   * @param {string} studentId - Ordering student.
   * @returns {Promise<number>} Order count.
   */
  async countByStudent(studentId) {
    return this.count({ student_id: studentId });
  }

  /**
   * Maps a stored row onto an order, without its lines.
   *
   * @param {import('@hungry-ju/shared/types').PersistenceRow} row - Row from storage.
   * @returns {Order} Hydrated order.
   */
  toModel(row) {
    return Order.fromPersistence(row);
  }
}
