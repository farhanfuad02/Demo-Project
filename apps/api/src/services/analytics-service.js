/**
 * @file Read-side aggregations for the vendor and admin dashboards.
 *
 * @module services/analytics-service
 */

import { ORDER_STATUS, USER_ROLE } from '@hungry-ju/shared/enums';
import { BaseService } from '../core/base-service.js';
import { ForbiddenError } from '../core/errors/app-error.js';
import { Money } from '../utils/money.js';

/**
 * Sales and platform analytics (FR-B6, FR-G5).
 *
 * Everything here is read-only and derived, which is why it is a separate service: the
 * numbers can be recomputed, cached, or moved to a nightly job later without touching a
 * single write path (SRS section 10).
 *
 * @augments BaseService
 */
export class AnalyticsService extends BaseService {
  /** @type {import('../repositories/order-repository.js').OrderRepository} */
  #orderRepository;

  /** @type {import('../repositories/shop-repository.js').ShopRepository} */
  #shopRepository;

  /** @type {import('../repositories/delivery-repository.js').DeliveryRepository} */
  #deliveryRepository;

  /** @type {import('../repositories/user-repository.js').UserRepository} */
  #userRepository;

  /**
   * @param {object} dependencies - Injected collaborators.
   * @param {import('../repositories/order-repository.js').OrderRepository} dependencies.orderRepository -
   *   Order storage.
   * @param {import('../repositories/shop-repository.js').ShopRepository} dependencies.shopRepository -
   *   Shop storage.
   * @param {import('../repositories/delivery-repository.js').DeliveryRepository} dependencies.deliveryRepository -
   *   Delivery storage.
   * @param {import('../repositories/user-repository.js').UserRepository} dependencies.userRepository -
   *   Account storage.
   */
  constructor({ orderRepository, shopRepository, deliveryRepository, userRepository }) {
    super();
    this.#orderRepository = orderRepository;
    this.#shopRepository = shopRepository;
    this.#deliveryRepository = deliveryRepository;
    this.#userRepository = userRepository;
  }

  /**
   * A vendor's sales dashboard (FR-B6).
   *
   * Only delivered orders count towards revenue: an order that was cancelled or
   * rejected never became money, and counting it would flatter the number the vendor
   * plans their stock with.
   *
   * @param {import('@hungry-ju/shared/types').Actor} actor - Signed-in vendor.
   * @param {string} shopId - Shop to report on.
   * @param {number} [days] - Window length in days.
   * @returns {Promise<Record<string, unknown>>} Orders, revenue, top items, peak hours.
   * @throws {ForbiddenError} When the caller does not own the shop.
   */
  async forShop(actor, shopId, days = 7) {
    const shop = await this.#shopRepository.findByIdOrFail(shopId, 'Shop');
    this.assertOwnership(actor, shop.ownerUserId, 'These analytics belong to another vendor.');

    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const orders = await this.#orderRepository.findByShop(shopId);
    await this.#orderRepository.attachItemsToAll(orders);

    const inWindow = orders.filter((order) => order.createdAt >= since);
    const delivered = inWindow.filter((order) => order.status === ORDER_STATUS.DELIVERED);

    const revenue = Money.sum(delivered.map((order) => order.subtotal));
    const cancelled = inWindow.filter((order) =>
      [ORDER_STATUS.CANCELLED, ORDER_STATUS.REJECTED].includes(order.status)
    );

    return {
      windowDays: days,
      orderCount: inWindow.length,
      deliveredCount: delivered.length,
      cancelledCount: cancelled.length,
      cancellationRate:
        inWindow.length === 0 ? 0 : Math.round((cancelled.length / inWindow.length) * 100),
      revenue: revenue.taka,
      averageOrderValue:
        delivered.length === 0 ? 0 : Math.round((revenue.taka / delivered.length) * 100) / 100,
      topItems: this.#topItems(delivered),
      ordersByHour: this.#ordersByHour(inWindow),
      ordersByDay: this.#ordersByDay(inWindow, days),
    };
  }

  /**
   * The platform-wide dashboard (FR-G5).
   *
   * @param {import('@hungry-ju/shared/types').Actor} actor - Signed-in admin.
   * @param {number} [days] - Window length in days.
   * @returns {Promise<Record<string, unknown>>} Platform totals and trends.
   * @throws {ForbiddenError} When the caller is not an admin.
   */
  async forPlatform(actor, days = 7) {
    this.assertRole(actor, USER_ROLE.ADMIN);

    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const orders = await this.#orderRepository.findMany({});
    const inWindow = orders.filter((order) => order.createdAt >= since);
    const delivered = inWindow.filter((order) => order.status === ORDER_STATUS.DELIVERED);

    const [totalUsers, activeShops, deliveries] = await Promise.all([
      this.#userRepository.count({}),
      this.#shopRepository.count({ is_open: true }),
      this.#deliveryRepository.findMany({ status: 'delivered' }),
    ]);

    const grossValue = Money.sum(delivered.map((order) => order.total));
    const riderEarnings = Money.sum(delivered.map((order) => order.deliveryFee));

    return {
      windowDays: days,
      totalUsers,
      activeShops,
      orderCount: inWindow.length,
      deliveredCount: delivered.length,
      cancellationRate:
        inWindow.length === 0
          ? 0
          : Math.round(
              (inWindow.filter((order) =>
                [ORDER_STATUS.CANCELLED, ORDER_STATUS.REJECTED].includes(order.status)
              ).length /
                inWindow.length) *
                100
            ),
      grossOrderValue: grossValue.taka,
      riderEarnings: riderEarnings.taka,
      lifetimeDeliveries: deliveries.length,
      averageDeliveryMinutes: this.#averageDeliveryMinutes(deliveries),
      ordersByDay: this.#ordersByDay(inWindow, days),
    };
  }

  /**
   * Ranks items by units sold.
   *
   * @param {import('../models/order.js').Order[]} orders - Delivered orders.
   * @returns {Array<{ itemName: string, quantity: number, revenue: number }>} Top five items.
   */
  #topItems(orders) {
    /** @type {Map<string, { quantity: number, revenuePoisha: number }>} */
    const totals = new Map();
    for (const order of orders) {
      for (const line of order.items) {
        const entry = totals.get(line.itemName) ?? { quantity: 0, revenuePoisha: 0 };
        entry.quantity += line.quantity;
        entry.revenuePoisha += line.lineTotal.poisha;
        totals.set(line.itemName, entry);
      }
    }
    return [...totals.entries()]
      .map(([itemName, entry]) => ({
        itemName,
        quantity: entry.quantity,
        revenue: entry.revenuePoisha / 100,
      }))
      .sort((left, right) => right.quantity - left.quantity)
      .slice(0, 5);
  }

  /**
   * Counts orders per hour of the day, which is what shows a vendor the lunch spike.
   *
   * @param {import('../models/order.js').Order[]} orders - Orders in the window.
   * @returns {Array<{ hour: number, count: number }>} One entry per hour.
   */
  #ordersByHour(orders) {
    const buckets = Array.from({ length: 24 }, (_unused, hour) => ({ hour, count: 0 }));
    for (const order of orders) {
      buckets[order.createdAt.getHours()].count += 1;
    }
    return buckets;
  }

  /**
   * Counts orders per day over the window.
   *
   * Every day in the window is present, including the empty ones, so a chart drawn
   * from this does not silently compress a quiet Friday out of existence.
   *
   * @param {import('../models/order.js').Order[]} orders - Orders in the window.
   * @param {number} days - Window length.
   * @returns {Array<{ date: string, count: number }>} One entry per day, oldest first.
   */
  #ordersByDay(orders, days) {
    /** @type {Map<string, number>} */
    const counts = new Map();
    for (let offset = days - 1; offset >= 0; offset -= 1) {
      const day = new Date(Date.now() - offset * 24 * 60 * 60 * 1000);
      counts.set(day.toISOString().slice(0, 10), 0);
    }
    for (const order of orders) {
      const key = order.createdAt.toISOString().slice(0, 10);
      if (counts.has(key)) {
        counts.set(key, counts.get(key) + 1);
      }
    }
    return [...counts.entries()].map(([date, count]) => ({ date, count }));
  }

  /**
   * Mean minutes from claim to customer confirmation.
   *
   * @param {import('../models/delivery.js').Delivery[]} deliveries - Completed deliveries.
   * @returns {number} Average minutes, rounded; `0` when there is nothing to average.
   */
  #averageDeliveryMinutes(deliveries) {
    const timed = deliveries.filter((delivery) => delivery.acceptedAt && delivery.deliveredAt);
    if (timed.length === 0) {
      return 0;
    }
    const totalMinutes = timed.reduce(
      (total, delivery) =>
        total + (delivery.deliveredAt.getTime() - delivery.acceptedAt.getTime()) / 60_000,
      0
    );
    return Math.round(totalMinutes / timed.length);
  }
}
