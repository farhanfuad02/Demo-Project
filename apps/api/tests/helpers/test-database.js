/**
 * @file Builders that give each test its own database and object graph.
 *
 * @module tests/helpers/test-database
 */

import { InMemoryDatabase } from '../../src/config/database/in-memory-database.js';
import { Container, TOKENS } from '../../src/config/container.js';
import { Env } from '../../src/config/env.js';
import { Money } from '../../src/utils/money.js';
import { MenuItem } from '../../src/models/menu-item.js';
import { Shop } from '../../src/models/shop.js';
import { StudentProfile } from '../../src/models/student-profile.js';
import { UserFactory } from '../../src/models/user-factory.js';
import { USER_ROLE, APPROVAL_STATUS, GENDER } from '@hungry-ju/shared/enums';

/**
 * A fresh, connected in-memory database.
 *
 * Each test gets its own instance rather than sharing one and truncating between runs:
 * a shared store makes tests order-dependent, which is the failure mode that wastes the
 * most time to diagnose.
 *
 * @returns {Promise<InMemoryDatabase>} The database.
 */
export async function makeDatabase() {
  return new InMemoryDatabase().connect();
}

/**
 * A container wired over a throwaway database.
 *
 * @returns {Promise<{ container: Container, db: InMemoryDatabase }>} Container and store.
 */
export async function makeContainer() {
  const db = await makeDatabase();
  const container = Container.bootstrap({ db, env: Env.current });
  return { container, db };
}

/**
 * Inserts a user directly, bypassing registration.
 *
 * Tests about ordering should not have to run a verification flow first, so this creates
 * an account already in the state those tests need.
 *
 * @param {Container} container - Wired container.
 * @param {object} [attributes] - Overrides.
 * @param {string} [attributes.role] - Role to create.
 * @param {string} [attributes.fullName] - Display name.
 * @param {string} [attributes.email] - E-mail address.
 * @param {string} [attributes.phone] - Phone number.
 * @param {string} [attributes.gender] - Gender, which decides the halls on offer.
 * @param {boolean} [attributes.verified] - Whether to mark the account verified.
 * @returns {Promise<import('../../src/models/user.js').User>} The stored account.
 */
export async function makeUser(
  container,
  {
    role = USER_ROLE.STUDENT,
    fullName = 'Test Student',
    email = `${role}-${Math.random().toString(36).slice(2, 8)}@juniv.edu`,
    phone = undefined,
    gender = GENDER.MALE,
    verified = true,
  } = {}
) {
  const repository = container.resolve(TOKENS.USER_REPOSITORY);
  const user = UserFactory.create(role, {
    fullName,
    email,
    phone: phone ?? null,
    gender,
    passwordHash: '$2b$04$abcdefghijklmnopqrstuv',
  });
  if (verified) {
    user.markVerified();
  }
  const stored = await repository.create(user);

  if (role === USER_ROLE.STUDENT) {
    await container.resolve(TOKENS.STUDENT_PROFILE_REPOSITORY).create(
      new StudentProfile({
        userId: stored.id,
        hallName: 'SRJ',
        roomNo: '101',
        isDeliveryEnabled: false,
      })
    );
  }
  return stored;
}

/**
 * The actor object a service expects for a user.
 *
 * @param {import('../../src/models/user.js').User} user - Account to act as.
 * @param {object} [extra] - Extra actor fields, such as `shopId`.
 * @returns {import('@hungry-ju/shared/types').Actor} The actor.
 */
export function actorFor(user, extra = {}) {
  return { id: user.id, role: user.role, status: user.status, ...extra };
}

/**
 * Inserts an approved, open shop with a small menu.
 *
 * @param {Container} container - Wired container.
 * @param {object} [options] - Shop options.
 * @param {import('../../src/models/user.js').User} [options.owner] - Owning vendor.
 * @param {boolean} [options.isOpen] - Whether the shop takes orders.
 * @param {string} [options.approvalStatus] - Review outcome.
 * @param {Array<{ name: string, price: number, isAvailable?: boolean }>} [options.menu] - Menu.
 * @returns {Promise<{ shop: import('../../src/models/shop.js').Shop, items:
 *   import('../../src/models/menu-item.js').MenuItem[], owner:
 *   import('../../src/models/user.js').User }>} Shop, menu, and owner.
 */
export async function makeShop(
  container,
  {
    owner = undefined,
    isOpen = true,
    approvalStatus = APPROVAL_STATUS.APPROVED,
    menu = [{ name: 'Khichuri', price: 60 }],
  } = {}
) {
  const vendor = owner ?? (await makeUser(container, { role: USER_ROLE.VENDOR }));
  const shop = await container.resolve(TOKENS.SHOP_REPOSITORY).create(
    new Shop({
      ownerUserId: vendor.id,
      shopName: 'Test Shop',
      botTolaLocation: 'Bot Tola, stall 1',
      contactPhone: '01700000000',
      approvalStatus,
      isOpen,
    })
  );

  const menuRepository = container.resolve(TOKENS.MENU_ITEM_REPOSITORY);
  const items = [];
  for (const entry of menu) {
    items.push(
      await menuRepository.create(
        new MenuItem({
          shopId: shop.id,
          name: entry.name,
          price: Money.fromTaka(entry.price),
          isAvailable: entry.isAvailable ?? true,
        })
      )
    );
  }
  return { shop, items, owner: vendor };
}

/**
 * Places an order end to end, for tests that start from an existing one.
 *
 * @param {Container} container - Wired container.
 * @param {object} options - What to order.
 * @param {import('../../src/models/user.js').User} options.student - Ordering student.
 * @param {import('../../src/models/menu-item.js').MenuItem} options.item - Item to order.
 * @param {number} [options.quantity] - Units to order.
 * @returns {Promise<{ order: Record<string, unknown>, confirmPin: string }>} The order.
 */
export async function placeOrder(container, { student, item, quantity = 1 }) {
  const actor = actorFor(student);
  await container.resolve(TOKENS.CART_SERVICE).addItem(actor, item.id, quantity);
  return container.resolve(TOKENS.ORDER_SERVICE).place(actor, {
    deliveryHall: 'SRJ',
    deliveryRoom: '101',
  });
}
