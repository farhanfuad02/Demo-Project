/**
 * @file Unit tests for the cart, ordering, and settings services.
 *
 * @module tests/unit/services/ordering-services
 */

import { beforeEach, describe, expect, it } from '@jest/globals';
import { APPROVAL_STATUS, ORDER_STATUS, USER_ROLE } from '@hungry-ju/shared/enums';
import { ORDER_DEFAULTS } from '@hungry-ju/shared/constants';
import { TOKENS } from '../../../src/config/container.js';
import { Money } from '../../../src/utils/money.js';
import { SETTING_KEY } from '../../../src/services/settings-service.js';
import {
  ConflictError,
  ForbiddenError,
  ValidationError,
} from '../../../src/core/errors/app-error.js';
import {
  actorFor,
  makeContainer,
  makeShop,
  makeUser,
  placeOrder,
} from '../../helpers/test-database.js';

/** @type {import('../../../src/config/container.js').Container} */
let container;
/** @type {import('../../../src/models/user.js').User} */
let student;
/** @type {import('@hungry-ju/shared/types').Actor} */
let studentActor;

beforeEach(async () => {
  ({ container } = await makeContainer());
  student = await makeUser(container);
  studentActor = actorFor(student);
});

describe('SettingsService', () => {
  it('serves the compiled-in defaults until an admin changes anything', async () => {
    const service = container.resolve(TOKENS.SETTINGS_SERVICE);
    expect((await service.deliveryFee()).taka).toBe(ORDER_DEFAULTS.DELIVERY_FEE_BDT);
    expect(await service.vendorAcceptTimeoutSeconds()).toBe(
      ORDER_DEFAULTS.VENDOR_ACCEPT_TIMEOUT_SEC
    );
  });

  it('applies a change without a redeploy (FR-G6)', async () => {
    const service = container.resolve(TOKENS.SETTINGS_SERVICE);
    await service.set({ id: 'admin-1' }, SETTING_KEY.DELIVERY_FEE_BDT, 40);
    expect((await service.deliveryFee()).taka).toBe(40);
  });

  it('reports the effective values, defaults included', async () => {
    const settings = await container.resolve(TOKENS.SETTINGS_SERVICE).all();
    expect(settings).toHaveProperty(SETTING_KEY.DELIVERY_FEE_BDT);
    expect(settings).toHaveProperty(SETTING_KEY.RELEASE_PENALTY_POINTS);
  });
});

describe('CartService', () => {
  /** @type {import('../../../src/services/cart-service.js').CartService} */
  let service;

  beforeEach(() => {
    service = container.resolve(TOKENS.CART_SERVICE);
  });

  it('starts empty and reports zero money lines', async () => {
    const cart = await service.view(studentActor);
    expect(cart.isEmpty).toBe(true);
    expect(cart.total).toBe(0);
    expect(cart.deliveryFee).toBe(0);
  });

  it('adds an item and shows the fee and total (FR-C5)', async () => {
    const { items } = await makeShop(container, { menu: [{ name: 'Khichuri', price: 60 }] });
    const cart = await service.addItem(studentActor, items[0].id, 2);

    expect(cart.itemCount).toBe(2);
    expect(cart.subtotal).toBe(120);
    expect(cart.total).toBe(145);
    expect(cart.shop.shopName).toBe('Test Shop');
  });

  it('refuses a shop that is closed (BR-07)', async () => {
    const { items } = await makeShop(container, {
      isOpen: false,
      menu: [{ name: 'Khichuri', price: 60 }],
    });
    await expect(service.addItem(studentActor, items[0].id, 1)).rejects.toThrow(ValidationError);
  });

  it('refuses a shop that has not been approved (BR-02)', async () => {
    const { items } = await makeShop(container, {
      approvalStatus: APPROVAL_STATUS.PENDING,
      menu: [{ name: 'Khichuri', price: 60 }],
    });
    await expect(service.addItem(studentActor, items[0].id, 1)).rejects.toThrow(ValidationError);
  });

  it('refuses a sold-out item (BR-07)', async () => {
    const { items } = await makeShop(container, {
      menu: [{ name: 'Egg Curry', price: 40, isAvailable: false }],
    });
    await expect(service.addItem(studentActor, items[0].id, 1)).rejects.toThrow(ValidationError);
  });

  it('refuses a second vendor (BR-03)', async () => {
    const first = await makeShop(container, { menu: [{ name: 'Khichuri', price: 60 }] });
    const second = await makeShop(container, { menu: [{ name: 'Burger', price: 110 }] });

    await service.addItem(studentActor, first.items[0].id, 1);
    await expect(service.addItem(studentActor, second.items[0].id, 1)).rejects.toThrow(
      ConflictError
    );
  });

  it('lets a cleared cart take a different vendor', async () => {
    const first = await makeShop(container, { menu: [{ name: 'Khichuri', price: 60 }] });
    const second = await makeShop(container, { menu: [{ name: 'Burger', price: 110 }] });

    await service.addItem(studentActor, first.items[0].id, 1);
    await service.clear(studentActor);
    await expect(service.addItem(studentActor, second.items[0].id, 1)).resolves.toBeTruthy();
  });

  it('removes a line when its quantity reaches zero', async () => {
    const { items } = await makeShop(container, { menu: [{ name: 'Khichuri', price: 60 }] });
    await service.addItem(studentActor, items[0].id, 2);

    const cart = await service.updateQuantity(studentActor, items[0].id, 0);
    expect(cart.isEmpty).toBe(true);
  });

  it('refuses a vendor trying to use a cart', async () => {
    const vendor = await makeUser(container, { role: USER_ROLE.VENDOR });
    await expect(service.view(actorFor(vendor))).rejects.toThrow(ForbiddenError);
  });

  describe('revalidate (UC-01 step 6)', () => {
    it('reports a price that moved and refreshes the line', async () => {
      const { items } = await makeShop(container, { menu: [{ name: 'Khichuri', price: 55 }] });
      await service.addItem(studentActor, items[0].id, 1);

      const menuRepository = container.resolve(TOKENS.MENU_ITEM_REPOSITORY);
      const item = await menuRepository.findById(items[0].id);
      item.update({ price: Money.fromTaka(60) });
      await menuRepository.save(item);

      const cart = await service.cartOf(student.id);
      const { priceChanges } = await service.revalidate(cart);

      expect(priceChanges).toEqual([
        { menuItemId: items[0].id, itemName: 'Khichuri', was: 55, now: 60 },
      ]);
    });

    it('removes an item that sold out while the cart sat there', async () => {
      const { items } = await makeShop(container, { menu: [{ name: 'Khichuri', price: 60 }] });
      await service.addItem(studentActor, items[0].id, 1);

      const menuRepository = container.resolve(TOKENS.MENU_ITEM_REPOSITORY);
      const item = await menuRepository.findById(items[0].id);
      item.setAvailable(false);
      await menuRepository.save(item);

      const cart = await service.cartOf(student.id);
      const { unavailable } = await service.revalidate(cart);

      expect(unavailable).toHaveLength(1);
      expect(cart.isEmpty).toBe(true);
    });

    it('reports nothing when nothing moved', async () => {
      const { items } = await makeShop(container, { menu: [{ name: 'Khichuri', price: 60 }] });
      await service.addItem(studentActor, items[0].id, 1);

      const result = await service.revalidate(await service.cartOf(student.id));
      expect(result.priceChanges).toHaveLength(0);
      expect(result.unavailable).toHaveLength(0);
    });
  });
});

describe('OrderService', () => {
  /** @type {import('../../../src/services/order-service.js').OrderService} */
  let service;

  beforeEach(() => {
    service = container.resolve(TOKENS.ORDER_SERVICE);
  });

  describe('placing an order (UC-01)', () => {
    it('creates the order, its delivery, its payment, and empties the cart', async () => {
      const { items } = await makeShop(container, { menu: [{ name: 'Khichuri', price: 60 }] });
      const { order, confirmPin } = await placeOrder(container, {
        student,
        item: items[0],
        quantity: 2,
      });

      expect(order.status).toBe(ORDER_STATUS.PLACED);
      expect(order.total).toBe(145);
      expect(confirmPin).toMatch(/^\d{4}$/);

      expect((await container.resolve(TOKENS.CART_SERVICE).view(studentActor)).isEmpty).toBe(true);
      expect(await container.resolve(TOKENS.DELIVERY_SERVICE).forOrder(order.id)).toBeTruthy();
      expect(await container.resolve(TOKENS.PAYMENT_SERVICE).forOrder(order.id)).toBeTruthy();
    });

    it('notifies the vendor', async () => {
      const { items, owner } = await makeShop(container, {
        menu: [{ name: 'Khichuri', price: 60 }],
      });
      await placeOrder(container, { student, item: items[0] });

      const notifications = await container
        .resolve(TOKENS.NOTIFICATION_REPOSITORY)
        .findByUser(owner.id);
      expect(notifications[0].type).toBe('order_placed');
    });

    it('records an audit entry (BR-09)', async () => {
      const { items } = await makeShop(container, { menu: [{ name: 'Khichuri', price: 60 }] });
      const { order } = await placeOrder(container, { student, item: items[0] });

      const entries = await container
        .resolve(TOKENS.AUDIT_LOG_REPOSITORY)
        .findForEntity('order', order.id);
      expect(entries).toHaveLength(1);
    });

    it('refuses an empty cart', async () => {
      await expect(service.place(studentActor, {})).rejects.toThrow(ValidationError);
    });

    it('refuses once the shop has closed (alternate flow A2)', async () => {
      const { shop, items } = await makeShop(container, {
        menu: [{ name: 'Khichuri', price: 60 }],
      });
      await container.resolve(TOKENS.CART_SERVICE).addItem(studentActor, items[0].id, 1);

      const shopRepository = container.resolve(TOKENS.SHOP_REPOSITORY);
      const reloaded = await shopRepository.findById(shop.id);
      reloaded.setOpen(false);
      await shopRepository.save(reloaded);

      await expect(
        service.place(studentActor, { deliveryHall: 'Hall', deliveryRoom: '1' })
      ).rejects.toThrow(ConflictError);
    });

    it('refuses and reports the diff when a price moved (alternate flow A1)', async () => {
      const { items } = await makeShop(container, { menu: [{ name: 'Khichuri', price: 55 }] });
      await container.resolve(TOKENS.CART_SERVICE).addItem(studentActor, items[0].id, 1);

      const menuRepository = container.resolve(TOKENS.MENU_ITEM_REPOSITORY);
      const item = await menuRepository.findById(items[0].id);
      item.update({ price: Money.fromTaka(60) });
      await menuRepository.save(item);

      const failure = await service
        .place(studentActor, { deliveryHall: 'Hall', deliveryRoom: '1' })
        .catch((error) => error);

      expect(failure).toBeInstanceOf(ConflictError);
      expect(failure.details.priceChanges[0]).toMatchObject({ was: 55, now: 60 });
      // No order exists, and the cart is preserved for re-confirmation.
      expect(await container.resolve(TOKENS.ORDER_REPOSITORY).count({})).toBe(0);
    });

    it('falls back to the profile address when checkout supplies none', async () => {
      const { items } = await makeShop(container, { menu: [{ name: 'Khichuri', price: 60 }] });
      await container.resolve(TOKENS.CART_SERVICE).addItem(studentActor, items[0].id, 1);

      const { order } = await service.place(studentActor, {});
      expect(order.deliveryHall).toBe('Test Hall');
    });

    it('refuses when there is no address anywhere (FR-C6)', async () => {
      const profileRepository = container.resolve(TOKENS.STUDENT_PROFILE_REPOSITORY);
      const profile = await profileRepository.findByUserId(student.id);
      profile.updateLocation({ hallName: null, roomNo: null });
      await profileRepository.save(profile);

      const { items } = await makeShop(container, { menu: [{ name: 'Khichuri', price: 60 }] });
      await container.resolve(TOKENS.CART_SERVICE).addItem(studentActor, items[0].id, 1);

      await expect(service.place(studentActor, {})).rejects.toThrow(ValidationError);
    });

    it('charges the fee an admin set, not the compiled default', async () => {
      await container
        .resolve(TOKENS.SETTINGS_SERVICE)
        .set({ id: 'admin-1' }, SETTING_KEY.DELIVERY_FEE_BDT, 40);

      const { items } = await makeShop(container, { menu: [{ name: 'Khichuri', price: 60 }] });
      const { order } = await placeOrder(container, { student, item: items[0] });

      expect(order.deliveryFee).toBe(40);
      expect(order.total).toBe(100);
    });
  });

  describe('vendor actions (FR-B4, FR-B5)', () => {
    /**
     * Places an order and returns everything needed to act on it.
     *
     * @returns {Promise<object>} Order, vendor actor, and shop.
     */
    const setup = async () => {
      const shopFixture = await makeShop(container, { menu: [{ name: 'Khichuri', price: 60 }] });
      const { order } = await placeOrder(container, { student, item: shopFixture.items[0] });
      return { ...shopFixture, order, vendorActor: actorFor(shopFixture.owner) };
    };

    it('accepts an order and tells the student', async () => {
      const { order, vendorActor } = await setup();
      const accepted = await service.accept(vendorActor, order.id);

      expect(accepted.status).toBe(ORDER_STATUS.ACCEPTED);
      const notifications = await container
        .resolve(TOKENS.NOTIFICATION_REPOSITORY)
        .findByUser(student.id);
      expect(notifications.some((entry) => entry.type === 'order_accepted')).toBe(true);
    });

    it('rejects an order with a reason and withdraws the delivery', async () => {
      const { order, vendorActor } = await setup();
      const rejected = await service.reject(vendorActor, order.id, 'Out of beef today');

      expect(rejected.status).toBe(ORDER_STATUS.REJECTED);
      const delivery = await container.resolve(TOKENS.DELIVERY_SERVICE).forOrder(order.id);
      expect(delivery.status).toBe('released');
    });

    it('publishes the delivery only once the food is ready', async () => {
      const { order, vendorActor } = await setup();
      const deliveryService = container.resolve(TOKENS.DELIVERY_SERVICE);

      await service.accept(vendorActor, order.id);
      await service.advance(vendorActor, order.id, ORDER_STATUS.PREPARING);
      expect((await deliveryService.forOrder(order.id)).status).toBe('pending');

      await service.advance(vendorActor, order.id, ORDER_STATUS.READY);
      expect((await deliveryService.forOrder(order.id)).status).toBe('available');
    });

    it('refuses a status only a rider controls', async () => {
      const { order, vendorActor } = await setup();
      await service.accept(vendorActor, order.id);
      await expect(service.advance(vendorActor, order.id, ORDER_STATUS.DELIVERED)).rejects.toThrow(
        ValidationError
      );
    });

    it('refuses a vendor acting on another vendor’s order', async () => {
      const { order } = await setup();
      const otherVendor = await makeUser(container, { role: USER_ROLE.VENDOR });
      await expect(service.accept(actorFor(otherVendor), order.id)).rejects.toThrow(ForbiddenError);
    });
  });

  describe('cancellation (UC-03)', () => {
    it('cancels while placed and notifies everyone concerned', async () => {
      const { items, owner } = await makeShop(container, {
        menu: [{ name: 'Khichuri', price: 60 }],
      });
      const { order } = await placeOrder(container, { student, item: items[0] });

      const cancelled = await service.cancel(studentActor, order.id, 'Changed my mind');
      expect(cancelled.status).toBe(ORDER_STATUS.CANCELLED);

      const vendorNotifications = await container
        .resolve(TOKENS.NOTIFICATION_REPOSITORY)
        .findByUser(owner.id);
      expect(vendorNotifications.some((entry) => entry.type === 'order_cancelled')).toBe(true);
    });

    it('refuses once preparation has begun (BR-04)', async () => {
      const { items, owner } = await makeShop(container, {
        menu: [{ name: 'Khichuri', price: 60 }],
      });
      const { order } = await placeOrder(container, { student, item: items[0] });
      const vendorActor = actorFor(owner);

      await service.accept(vendorActor, order.id);
      await service.advance(vendorActor, order.id, ORDER_STATUS.PREPARING);

      await expect(service.cancel(studentActor, order.id)).rejects.toThrow(ConflictError);
    });

    it('refuses to cancel somebody else’s order', async () => {
      const { items } = await makeShop(container, { menu: [{ name: 'Khichuri', price: 60 }] });
      const { order } = await placeOrder(container, { student, item: items[0] });
      const other = await makeUser(container);

      await expect(service.cancel(actorFor(other), order.id)).rejects.toThrow(ForbiddenError);
    });
  });

  describe('history and reorder (FR-C8)', () => {
    it('lists the student’s orders with their lines', async () => {
      const { items } = await makeShop(container, { menu: [{ name: 'Khichuri', price: 60 }] });
      await placeOrder(container, { student, item: items[0] });

      const page = await service.historyOf(studentActor);
      expect(page.items).toHaveLength(1);
      expect(page.items[0].items).toHaveLength(1);
      expect(page.meta.totalCount).toBe(1);
    });

    it('refills the cart from a past order rather than ordering directly', async () => {
      const { items } = await makeShop(container, { menu: [{ name: 'Khichuri', price: 60 }] });
      const { order } = await placeOrder(container, { student, item: items[0], quantity: 3 });

      const cart = await service.reorder(studentActor, order.id);
      expect(cart.itemCount).toBe(3);
      // Still a cart, so the student passes through checkout and sees today's prices.
      expect(await container.resolve(TOKENS.ORDER_REPOSITORY).count({})).toBe(1);
    });
  });

  describe('object-level read access', () => {
    it('lets the customer, the vendor, and an admin see an order', async () => {
      const { items, owner } = await makeShop(container, {
        menu: [{ name: 'Khichuri', price: 60 }],
      });
      const { order } = await placeOrder(container, { student, item: items[0] });
      const admin = await makeUser(container, { role: USER_ROLE.ADMIN });

      await expect(service.detail(studentActor, order.id)).resolves.toBeTruthy();
      await expect(service.detail(actorFor(owner), order.id)).resolves.toBeTruthy();
      await expect(service.detail(actorFor(admin), order.id)).resolves.toBeTruthy();
    });

    it('refuses an unrelated student (IDOR)', async () => {
      const { items } = await makeShop(container, { menu: [{ name: 'Khichuri', price: 60 }] });
      const { order } = await placeOrder(container, { student, item: items[0] });
      const stranger = await makeUser(container);

      await expect(service.detail(actorFor(stranger), order.id)).rejects.toThrow(ForbiddenError);
    });
  });

  describe('BR-11: the vendor accept timeout', () => {
    it('cancels an order the vendor never answered', async () => {
      const { items } = await makeShop(container, { menu: [{ name: 'Khichuri', price: 60 }] });
      const { order } = await placeOrder(container, { student, item: items[0] });

      const orderRepository = container.resolve(TOKENS.ORDER_REPOSITORY);
      await orderRepository.update(order.id, {
        accept_deadline: new Date(Date.now() - 1000).toISOString(),
      });

      expect(await service.expireUnansweredOrders()).toBe(1);
      expect((await orderRepository.findById(order.id)).status).toBe(ORDER_STATUS.CANCELLED);
    });

    it('leaves an order the vendor answered in time alone', async () => {
      const { items, owner } = await makeShop(container, {
        menu: [{ name: 'Khichuri', price: 60 }],
      });
      const { order } = await placeOrder(container, { student, item: items[0] });
      await service.accept(actorFor(owner), order.id);

      await container.resolve(TOKENS.ORDER_REPOSITORY).update(order.id, {
        accept_deadline: new Date(Date.now() - 1000).toISOString(),
      });
      expect(await service.expireUnansweredOrders()).toBe(0);
    });
  });
});
