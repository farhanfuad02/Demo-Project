/**
 * @file Unit tests for the repository layer, over a throwaway in-memory store.
 *
 * @module tests/unit/repositories/repositories
 */

import { beforeEach, describe, expect, it } from '@jest/globals';
import { DELIVERY_STATUS, ORDER_STATUS, USER_ROLE } from '@hungry-ju/shared/enums';
import { TOKENS } from '../../../src/config/container.js';
import { Cart } from '../../../src/models/cart.js';
import { Delivery } from '../../../src/models/delivery.js';
import { MenuItem } from '../../../src/models/menu-item.js';
import { Order } from '../../../src/models/order.js';
import { Student } from '../../../src/models/student.js';
import { Vendor } from '../../../src/models/vendor.js';
import { Money } from '../../../src/utils/money.js';
import { NotFoundError } from '../../../src/core/errors/app-error.js';
import { makeContainer, makeShop, makeUser } from '../../helpers/test-database.js';

/** @type {import('../../../src/config/container.js').Container} */
let container;

beforeEach(async () => {
  ({ container } = await makeContainer());
});

describe('BaseRepository, through UserRepository', () => {
  it('creates, reads, updates, and deletes', async () => {
    const repository = container.resolve(TOKENS.USER_REPOSITORY);
    const created = await repository.create(
      new Student({ fullName: 'Farhan Fuad', email: 'f@juniv.edu', passwordHash: 'h' })
    );

    expect(created.id).toBeTruthy();
    expect((await repository.findById(created.id)).fullName).toBe('Farhan Fuad');

    created.updateProfile({ fullName: 'Farhan F.' });
    await repository.save(created);
    expect((await repository.findById(created.id)).fullName).toBe('Farhan F.');

    expect(await repository.delete(created.id)).toBe(true);
    expect(await repository.findById(created.id)).toBeNull();
  });

  it('validates the entity before writing it', async () => {
    const repository = container.resolve(TOKENS.USER_REPOSITORY);
    const invalid = new Student({ fullName: 'A', email: null, phone: null, passwordHash: '' });
    await expect(repository.create(invalid)).rejects.toThrow();
  });

  it('fails loudly when a required row is missing', async () => {
    const repository = container.resolve(TOKENS.USER_REPOSITORY);
    await expect(repository.findByIdOrFail('nope', 'Account')).rejects.toThrow(NotFoundError);
  });

  it('hydrates each row into the class its role names', async () => {
    const repository = container.resolve(TOKENS.USER_REPOSITORY);
    await repository.create(
      new Vendor({ fullName: 'Shop Owner', email: 'v@juniv.edu', passwordHash: 'h' })
    );
    const found = await repository.findByEmail('v@juniv.edu');
    expect(found).toBeInstanceOf(Vendor);
    expect(found.role).toBe(USER_ROLE.VENDOR);
  });

  it('finds an account by either contact method (FR-A4)', async () => {
    const user = await makeUser(container, { email: 'both@juniv.edu', phone: '01711111111' });

    expect(
      (await container.resolve(TOKENS.USER_REPOSITORY).findByIdentifier('both@juniv.edu')).id
    ).toBe(user.id);
    expect(
      (await container.resolve(TOKENS.USER_REPOSITORY).findByIdentifier('01711111111')).id
    ).toBe(user.id);
    expect(await container.resolve(TOKENS.USER_REPOSITORY).findByIdentifier('nobody')).toBeNull();
  });

  it('reports a taken contact method (BR-01)', async () => {
    const repository = container.resolve(TOKENS.USER_REPOSITORY);
    await makeUser(container, { email: 'taken@juniv.edu', phone: '01722222222' });

    expect(await repository.contactIsTaken({ email: 'taken@juniv.edu' })).toBe(true);
    expect(await repository.contactIsTaken({ phone: '01722222222' })).toBe(true);
    expect(await repository.contactIsTaken({ email: 'free@juniv.edu' })).toBe(false);
  });
});

describe('ShopRepository', () => {
  it('lists only approved shops for students', async () => {
    await makeShop(container, { menu: [] });
    await makeShop(container, { approvalStatus: 'pending', menu: [] });

    const approved = await container.resolve(TOKENS.SHOP_REPOSITORY).findApproved();
    expect(approved).toHaveLength(1);
    expect(await container.resolve(TOKENS.SHOP_REPOSITORY).findPending()).toHaveLength(1);
  });

  it('finds the one shop a vendor owns', async () => {
    const { shop, owner } = await makeShop(container, { menu: [] });
    const found = await container.resolve(TOKENS.SHOP_REPOSITORY).findByOwner(owner.id);
    expect(found.id).toBe(shop.id);
  });

  it('searches approved shops by partial name', async () => {
    await makeShop(container, { menu: [] });
    const results = await container.resolve(TOKENS.SHOP_REPOSITORY).searchApproved('test');
    expect(results).toHaveLength(1);
  });
});

describe('MenuItemRepository', () => {
  it('lists a shop’s menu, optionally hiding sold-out items', async () => {
    const { shop } = await makeShop(container, {
      menu: [
        { name: 'Khichuri', price: 60 },
        { name: 'Egg Curry', price: 40, isAvailable: false },
      ],
    });
    const repository = container.resolve(TOKENS.MENU_ITEM_REPOSITORY);

    expect(await repository.findByShop(shop.id)).toHaveLength(2);
    expect(await repository.findByShop(shop.id, { availableOnly: true })).toHaveLength(1);
  });

  it('loads many items in one pass, keyed by id', async () => {
    const { items } = await makeShop(container, {
      menu: [
        { name: 'Singara', price: 12 },
        { name: 'Samosa', price: 15 },
      ],
    });
    const found = await container
      .resolve(TOKENS.MENU_ITEM_REPOSITORY)
      .findByIds(items.map((item) => item.id));

    expect(found.size).toBe(2);
    expect(found.get(items[0].id).name).toBe('Singara');
  });

  it('matches partially, which is what FR-C2 asks for', async () => {
    const { shop } = await makeShop(container, { menu: [{ name: 'Khichuri', price: 60 }] });
    const results = await container.resolve(TOKENS.MENU_ITEM_REPOSITORY).search('khich', [shop.id]);
    expect(results).toHaveLength(1);
  });

  it('never returns a sold-out item from a search', async () => {
    const { shop } = await makeShop(container, {
      menu: [{ name: 'Khichuri', price: 60, isAvailable: false }],
    });
    expect(
      await container.resolve(TOKENS.MENU_ITEM_REPOSITORY).search('khich', [shop.id])
    ).toHaveLength(0);
  });
});

describe('CartRepository', () => {
  it('creates a cart on first use rather than making the caller check', async () => {
    const student = await makeUser(container);
    const cart = await container.resolve(TOKENS.CART_REPOSITORY).findOrCreateByStudent(student.id);

    expect(cart.isEmpty).toBe(true);
    expect(cart.studentId).toBe(student.id);
  });

  it('stores the aggregate whole and reads it back with its lines', async () => {
    const student = await makeUser(container);
    const { items } = await makeShop(container, { menu: [{ name: 'Khichuri', price: 60 }] });
    const repository = container.resolve(TOKENS.CART_REPOSITORY);

    const cart = await repository.findOrCreateByStudent(student.id);
    cart.addItem(items[0], 2);
    await repository.saveAggregate(cart);

    const reloaded = await repository.findOrCreateByStudent(student.id);
    expect(reloaded.items).toHaveLength(1);
    expect(reloaded.itemCount).toBe(2);
    expect(reloaded.subtotal.taka).toBe(120);
  });

  it('replaces the lines rather than accumulating them', async () => {
    const student = await makeUser(container);
    const { items } = await makeShop(container, { menu: [{ name: 'Khichuri', price: 60 }] });
    const repository = container.resolve(TOKENS.CART_REPOSITORY);

    const cart = await repository.findOrCreateByStudent(student.id);
    cart.addItem(items[0]);
    await repository.saveAggregate(cart);
    await repository.saveAggregate(cart);

    expect(await repository.db.count('cart_items')).toBe(1);
  });
});

describe('OrderRepository', () => {
  /**
   * Builds an unsaved order for a student.
   *
   * @param {string} studentId - Ordering student.
   * @param {string} shopId - Vendor.
   * @param {import('../../../src/models/menu-item.js').MenuItem} item - Item ordered.
   * @returns {Order} The order.
   */
  const draftOrder = (studentId, shopId, item) => {
    const cart = new Cart({ studentId, shopId });
    cart.addItem(item, 2);
    return Order.fromCart({
      cart,
      reference: 'HJU-TEST',
      deliveryFee: Money.fromTaka(25),
      deliveryHall: 'Hall',
      deliveryRoom: '1',
    });
  };

  it('writes the order and its lines atomically', async () => {
    const student = await makeUser(container);
    const { shop, items } = await makeShop(container, { menu: [{ name: 'Khichuri', price: 60 }] });
    const repository = container.resolve(TOKENS.ORDER_REPOSITORY);

    const stored = await repository.createAggregate(draftOrder(student.id, shop.id, items[0]));
    expect(stored.items).toHaveLength(1);

    const reloaded = await repository.findWithItems(stored.id);
    expect(reloaded.items[0].itemName).toBe('Khichuri');
    expect(reloaded.total.taka).toBe(145);
  });

  it('attaches lines to a whole page in one pass', async () => {
    const student = await makeUser(container);
    const { shop, items } = await makeShop(container, { menu: [{ name: 'Khichuri', price: 60 }] });
    const repository = container.resolve(TOKENS.ORDER_REPOSITORY);

    await repository.createAggregate(draftOrder(student.id, shop.id, items[0]));
    await repository.createAggregate(draftOrder(student.id, shop.id, items[0]));

    const orders = await repository.attachItemsToAll(await repository.findByStudent(student.id));
    expect(orders).toHaveLength(2);
    expect(orders.every((order) => order.items.length === 1)).toBe(true);
  });

  it('finds orders the vendor never answered (BR-11)', async () => {
    const student = await makeUser(container);
    const { shop, items } = await makeShop(container, { menu: [{ name: 'Khichuri', price: 60 }] });
    const repository = container.resolve(TOKENS.ORDER_REPOSITORY);

    const stored = await repository.createAggregate(draftOrder(student.id, shop.id, items[0]));
    await repository.update(stored.id, {
      accept_deadline: new Date(Date.now() - 60_000).toISOString(),
    });

    const expired = await repository.findExpiredAwaitingAcceptance();
    expect(expired).toHaveLength(1);
    expect(expired[0].status).toBe(ORDER_STATUS.PLACED);
  });

  it('filters a vendor board by status', async () => {
    const student = await makeUser(container);
    const { shop, items } = await makeShop(container, { menu: [{ name: 'Khichuri', price: 60 }] });
    const repository = container.resolve(TOKENS.ORDER_REPOSITORY);
    await repository.createAggregate(draftOrder(student.id, shop.id, items[0]));

    expect(await repository.findByShop(shop.id, [ORDER_STATUS.PLACED])).toHaveLength(1);
    expect(await repository.findByShop(shop.id, [ORDER_STATUS.DELIVERED])).toHaveLength(0);
  });
});

describe('DeliveryRepository', () => {
  /**
   * Inserts a delivery already in the open feed.
   *
   * @param {object} [overrides] - Attributes to change.
   * @returns {Promise<Delivery>} The stored delivery.
   */
  const publishDelivery = async (overrides = {}) => {
    const delivery = new Delivery({
      orderId: `order-${Math.random()}`,
      studentId: 'student-1',
      earning: Money.fromTaka(25),
      confirmPinHash: 'hash',
      ...overrides,
    });
    delivery.publish();
    return container.resolve(TOKENS.DELIVERY_REPOSITORY).create(delivery);
  };

  it('shows a rider the open feed', async () => {
    await publishDelivery();
    const feed = await container.resolve(TOKENS.DELIVERY_REPOSITORY).findAvailableFor('rider-1');
    expect(feed).toHaveLength(1);
  });

  it('hides a student’s own order from their feed (BR-06)', async () => {
    await publishDelivery({ studentId: 'rider-1' });
    const feed = await container.resolve(TOKENS.DELIVERY_REPOSITORY).findAvailableFor('rider-1');
    expect(feed).toHaveLength(0);
  });

  describe('claim (FR-D3, NFR-11)', () => {
    it('binds the delivery to the winning rider', async () => {
      const stored = await publishDelivery();
      const claimed = await container
        .resolve(TOKENS.DELIVERY_REPOSITORY)
        .claim(stored.id, 'rider-1');

      expect(claimed.riderUserId).toBe('rider-1');
      expect(claimed.status).toBe(DELIVERY_STATUS.ASSIGNED);
    });

    it('lets exactly one of many simultaneous claims succeed', async () => {
      const stored = await publishDelivery();
      const repository = container.resolve(TOKENS.DELIVERY_REPOSITORY);

      const results = await Promise.all(
        Array.from({ length: 25 }, (unused, index) => repository.claim(stored.id, `rider-${index}`))
      );
      const winners = results.filter(Boolean);

      expect(winners).toHaveLength(1);
      expect(results.filter((result) => result === null)).toHaveLength(24);
    });

    it('returns null for a delivery somebody already holds', async () => {
      const stored = await publishDelivery();
      const repository = container.resolve(TOKENS.DELIVERY_REPOSITORY);
      await repository.claim(stored.id, 'rider-1');

      expect(await repository.claim(stored.id, 'rider-2')).toBeNull();
    });
  });

  it('finds the one delivery a rider is carrying (FR-D4)', async () => {
    const stored = await publishDelivery();
    const repository = container.resolve(TOKENS.DELIVERY_REPOSITORY);
    await repository.claim(stored.id, 'rider-1');

    expect((await repository.findActiveByRider('rider-1')).id).toBe(stored.id);
    expect(await repository.findActiveByRider('rider-2')).toBeNull();
  });

  it('totals a rider’s completed earnings', async () => {
    const repository = container.resolve(TOKENS.DELIVERY_REPOSITORY);
    for (let index = 0; index < 3; index += 1) {
      const stored = await publishDelivery();
      const claimed = await repository.claim(stored.id, 'rider-1');
      claimed.startHeadingToVendor();
      claimed.markPickedUp();
      claimed.complete(true);
      await repository.save(claimed);
    }

    const earnings = await repository.earningsFor('rider-1');
    expect(earnings.count).toBe(3);
    expect(earnings.totalPoisha).toBe(7500);
  });
});

describe('AuthTokenRepository', () => {
  it('revokes every refresh token of an account at once (FR-A9)', async () => {
    const user = await makeUser(container);
    const tokenService = container.resolve(TOKENS.TOKEN_SERVICE);
    await tokenService.issueRefreshToken(user);
    await tokenService.issueRefreshToken(user);

    const revoked = await container
      .resolve(TOKENS.AUTH_TOKEN_REPOSITORY)
      .revokeAllForUser(user.id, 'refresh');
    expect(revoked).toBe(2);
  });

  it('purges tokens that expired', async () => {
    const repository = container.resolve(TOKENS.AUTH_TOKEN_REPOSITORY);
    await repository.db.insert('auth_tokens', {
      user_id: 'u1',
      type: 'refresh',
      token_hash: 'old',
      expires_at: new Date(Date.now() - 1000).toISOString(),
      consumed_at: null,
    });
    expect(await repository.purgeExpired()).toBe(1);
  });
});

describe('SystemConfigRepository', () => {
  it('falls back to the compiled-in default until a key is set', async () => {
    const repository = container.resolve(TOKENS.SYSTEM_CONFIG_REPOSITORY);
    expect(await repository.valueOf('deliveryFeeBdt', 25)).toBe(25);

    await repository.put('deliveryFeeBdt', 30, 'admin-1');
    expect(await repository.valueOf('deliveryFeeBdt', 25)).toBe(30);
  });

  it('updates an existing key rather than adding a second row', async () => {
    const repository = container.resolve(TOKENS.SYSTEM_CONFIG_REPOSITORY);
    await repository.put('deliveryFeeBdt', 30, 'admin-1');
    await repository.put('deliveryFeeBdt', 35, 'admin-1');

    expect(await repository.count({})).toBe(1);
    expect((await repository.all()).deliveryFeeBdt).toBe(35);
  });
});

describe('NotificationRepository', () => {
  it('counts and clears unread messages', async () => {
    const notificationService = container.resolve(TOKENS.NOTIFICATION_SERVICE);
    const repository = container.resolve(TOKENS.NOTIFICATION_REPOSITORY);

    await notificationService.notify({
      userId: 'u1',
      type: 'order_delivered',
      context: { reference: 'HJU-1' },
    });
    expect(await repository.countUnread('u1')).toBe(1);

    expect(await repository.markAllRead('u1')).toBe(1);
    expect(await repository.countUnread('u1')).toBe(0);
  });
});

describe('MenuItem persistence through the repository', () => {
  it('keeps the price exact across a save and a reload', async () => {
    const { shop } = await makeShop(container, { menu: [] });
    const repository = container.resolve(TOKENS.MENU_ITEM_REPOSITORY);

    const stored = await repository.create(
      new MenuItem({ shopId: shop.id, name: 'Singara', price: Money.fromTaka(12.5) })
    );
    expect((await repository.findById(stored.id)).price.taka).toBe(12.5);
  });
});
