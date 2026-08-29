/**
 * @file Seeds a demonstrable dataset: admin, vendors with menus, and students.
 *
 * @module config/database/seed
 */

import { APPROVAL_STATUS, GENDER, USER_ROLE } from '@hungry-ju/shared/enums';
import { Env } from '../env.js';
import { Logger } from '../../lib/logger.js';
import { MenuItem } from '../../models/menu-item.js';
import { Shop } from '../../models/shop.js';
import { StudentProfile } from '../../models/student-profile.js';
import { UserFactory } from '../../models/user-factory.js';
import { MenuItemRepository } from '../../repositories/menu-item-repository.js';
import { ShopRepository } from '../../repositories/shop-repository.js';
import { StudentProfileRepository } from '../../repositories/student-profile-repository.js';
import { UserRepository } from '../../repositories/user-repository.js';
import { PasswordService } from '../../services/password-service.js';
import { Money } from '../../utils/money.js';
import { createDatabase, describeDatabase } from './database-factory.js';

/**
 * The password every seeded account shares.
 *
 * A shared, published password is right here and wrong anywhere else: these accounts
 * exist so an examiner can sign in as each role in ten seconds. The seeder refuses to
 * run in production for exactly that reason.
 */
const DEMO_PASSWORD = 'Hungry@JU1';

/** Accounts created for the demonstration. */
const DEMO_USERS = Object.freeze([
  {
    role: USER_ROLE.ADMIN,
    fullName: 'Hungry_JU Admin',
    email: 'admin@juniv.edu',
    phone: '01700000001',
  },
  {
    role: USER_ROLE.VENDOR,
    fullName: 'Md. Shihab Hossen',
    email: 'shihab.vendor@juniv.edu',
    phone: '01700000002',
  },
  {
    role: USER_ROLE.VENDOR,
    fullName: 'Sanjida Akter Akhi',
    email: 'sanjida.vendor@juniv.edu',
    phone: '01700000003',
  },
  {
    role: USER_ROLE.VENDOR,
    fullName: 'Tanvir Ahmed',
    email: 'tanvir.vendor@juniv.edu',
    phone: '01700000007',
  },
  {
    role: USER_ROLE.VENDOR,
    fullName: 'Rezaul Karim',
    email: 'rezaul.vendor@juniv.edu',
    phone: '01700000008',
  },
  {
    role: USER_ROLE.VENDOR,
    fullName: 'Mitu Rani Das',
    email: 'mitu.vendor@juniv.edu',
    phone: '01700000009',
  },
  {
    role: USER_ROLE.VENDOR,
    fullName: 'Jubayer Hasan',
    email: 'jubayer.vendor@juniv.edu',
    phone: '01700000010',
  },
  {
    role: USER_ROLE.STUDENT,
    fullName: 'Farhan Fuad',
    email: 'farhan@juniv.edu',
    phone: '01700000004',
    gender: GENDER.MALE,
    hallName: 'SRJ',
    roomNo: '214',
  },
  {
    role: USER_ROLE.STUDENT,
    fullName: 'Rahim Uddin',
    email: 'rahim@juniv.edu',
    phone: '01700000005',
    gender: GENDER.MALE,
    hallName: 'MH',
    roomNo: '108',
    isDeliveryEnabled: true,
  },
  {
    role: USER_ROLE.STUDENT,
    fullName: 'Nusrat Jahan',
    email: 'nusrat@juniv.edu',
    phone: '01700000006',
    gender: GENDER.FEMALE,
    hallName: 'PRH',
    roomNo: '302',
  },
]);

/** Shops and their menus, keyed by the e-mail of the owning vendor. */
const DEMO_SHOPS = Object.freeze([
  {
    ownerEmail: 'shihab.vendor@juniv.edu',
    shopName: 'Bot Tola Bhorta Ghor',
    botTolaLocation: 'Bot Tola, stall 4',
    contactPhone: '01700000002',
    operatingHours: '08:00 - 22:00',
    description: 'Rice, bhorta platters, and hot khichuri all day.',
    menu: [
      { name: 'Khichuri', price: 60, category: 'Rice', prepTimeMin: 12 },
      { name: 'Beef Tehari', price: 130, category: 'Rice', prepTimeMin: 18 },
      { name: 'Aloo Bhorta', price: 25, category: 'Bhorta', prepTimeMin: 5 },
      { name: 'Shutki Bhorta', price: 45, category: 'Bhorta', prepTimeMin: 5 },
      { name: 'Dal', price: 20, category: 'Sides', prepTimeMin: 4 },
      { name: 'Egg Curry', price: 40, category: 'Curry', prepTimeMin: 10, isAvailable: false },
    ],
  },
  {
    ownerEmail: 'sanjida.vendor@juniv.edu',
    shopName: 'Akhi Fast Food',
    botTolaLocation: 'Bot Tola, stall 11',
    contactPhone: '01700000003',
    operatingHours: '10:00 - 23:00',
    description: 'Burgers, rolls, and the cheapest singara on campus.',
    menu: [
      { name: 'Chicken Burger', price: 110, category: 'Burger', prepTimeMin: 12 },
      { name: 'Chicken Roll', price: 70, category: 'Roll', prepTimeMin: 8 },
      { name: 'Singara', price: 12, category: 'Snacks', prepTimeMin: 3 },
      { name: 'Cold Coffee', price: 60, category: 'Drinks', prepTimeMin: 5 },
      { name: 'French Fries', price: 80, category: 'Snacks', prepTimeMin: 7 },
    ],
  },
  {
    ownerEmail: 'tanvir.vendor@juniv.edu',
    shopName: 'JU Cha Adda',
    botTolaLocation: 'Bot Tola, stall 2',
    contactPhone: '01700000007',
    operatingHours: '07:00 - 23:30',
    description: 'Tea, toast, and the adda that comes free with both.',
    menu: [
      { name: 'Malai Cha', price: 25, category: 'Drinks', prepTimeMin: 4 },
      { name: 'Rong Cha', price: 10, category: 'Drinks', prepTimeMin: 3 },
      { name: 'Lebu Cha', price: 15, category: 'Drinks', prepTimeMin: 3 },
      { name: 'Butter Toast', price: 35, category: 'Snacks', prepTimeMin: 6 },
      { name: 'Chicken Sandwich', price: 90, category: 'Snacks', prepTimeMin: 9 },
      { name: 'Nimki', price: 15, category: 'Snacks', prepTimeMin: 2 },
      { name: 'Chocolate Biscuit', price: 20, category: 'Snacks', prepTimeMin: 1 },
    ],
  },
  {
    ownerEmail: 'rezaul.vendor@juniv.edu',
    shopName: 'Bot Tola Biriyani House',
    botTolaLocation: 'Bot Tola, stall 7',
    contactPhone: '01700000008',
    operatingHours: '11:00 - 21:00',
    description: 'Kacchi on Fridays, biriyani every other day of the week.',
    menu: [
      { name: 'Chicken Biriyani', price: 150, category: 'Biriyani', prepTimeMin: 20 },
      { name: 'Mutton Kacchi', price: 260, category: 'Biriyani', prepTimeMin: 30 },
      { name: 'Morog Polao', price: 170, category: 'Biriyani', prepTimeMin: 22 },
      { name: 'Beef Kala Bhuna', price: 190, category: 'Curry', prepTimeMin: 25 },
      { name: 'Borhani', price: 40, category: 'Drinks', prepTimeMin: 2 },
      { name: 'Firni', price: 45, category: 'Dessert', prepTimeMin: 3 },
      { name: 'Chicken Roast', price: 140, category: 'Curry', prepTimeMin: 18, isAvailable: false },
    ],
  },
  {
    ownerEmail: 'mitu.vendor@juniv.edu',
    shopName: 'Mitu Pitha Ghor',
    botTolaLocation: 'Bot Tola, stall 15',
    contactPhone: '01700000009',
    operatingHours: '16:00 - 22:00',
    description: 'Winter pithas made to order, plus sweets that outlast the season.',
    menu: [
      { name: 'Bhapa Pitha', price: 30, category: 'Pitha', prepTimeMin: 10 },
      { name: 'Chitoi Pitha', price: 25, category: 'Pitha', prepTimeMin: 8 },
      { name: 'Patishapta', price: 40, category: 'Pitha', prepTimeMin: 12 },
      { name: 'Nakshi Pitha', price: 50, category: 'Pitha', prepTimeMin: 15, isAvailable: false },
      { name: 'Roshogolla', price: 20, category: 'Dessert', prepTimeMin: 2 },
      { name: 'Doi', price: 55, category: 'Dessert', prepTimeMin: 2 },
    ],
  },
  {
    ownerEmail: 'jubayer.vendor@juniv.edu',
    shopName: 'Campus Juice Bar',
    botTolaLocation: 'Bot Tola, stall 6',
    contactPhone: '01700000010',
    operatingHours: '09:00 - 19:00',
    description: 'Cold-pressed juice and lassi; shuts before the evening rush.',
    isOpen: false,
    menu: [
      { name: 'Mango Lassi', price: 70, category: 'Drinks', prepTimeMin: 5 },
      { name: 'Sugarcane Juice', price: 30, category: 'Drinks', prepTimeMin: 3 },
      { name: 'Orange Juice', price: 80, category: 'Drinks', prepTimeMin: 5 },
      { name: 'Green Coconut', price: 60, category: 'Drinks', prepTimeMin: 2 },
      { name: 'Fruit Salad', price: 95, category: 'Dessert', prepTimeMin: 8 },
    ],
  },
]);

/**
 * Fills an empty database with a working demonstration dataset.
 *
 * Every seeded account is verified and every shop approved, so the flow an examiner
 * actually wants to see — browse, order, deliver — works on the first run without
 * anybody clicking through six verification e-mails first.
 */
export class Seeder {
  /** @type {import('./database.js').Database} */
  #db;

  /** @type {import('../../lib/logger.js').Logger} */
  #logger;

  /** @type {PasswordService} */
  #passwordService;

  /**
   * @param {object} dependencies - Injected collaborators.
   * @param {import('./database.js').Database} dependencies.db - Connected database.
   * @param {import('../../lib/logger.js').Logger} dependencies.logger - Progress output.
   * @param {PasswordService} [dependencies.passwordService] - Hashing for the demo password.
   *   Injectable so a test suite can seed at a low bcrypt cost; production keeps the real
   *   one, because a seeded account is still a real account.
   */
  constructor({ db, logger, passwordService = new PasswordService() }) {
    this.#db = db;
    this.#logger = logger;
    this.#passwordService = passwordService;
  }

  /**
   * Writes the dataset.
   *
   * @param {object} [options] - Seeding options.
   * @param {boolean} [options.force] - Seed even when accounts already exist. Existing
   *   accounts and shops are left alone, so this tops the dataset up rather than
   *   duplicating it.
   * @returns {Promise<{ seeded: boolean, users: number, shops: number, items: number }>} What
   *   was written.
   */
  async run({ force = false } = {}) {
    const userRepository = new UserRepository(this.#db);
    const profileRepository = new StudentProfileRepository(this.#db);
    const shopRepository = new ShopRepository(this.#db);
    const menuItemRepository = new MenuItemRepository(this.#db);

    const existing = await userRepository.count({});
    if (existing > 0 && !force) {
      this.#logger.info('Database already has accounts; skipping seed', { users: existing });
      return { seeded: false, users: existing, shops: 0, items: 0 };
    }

    const passwordHash = await this.#passwordService.hash(DEMO_PASSWORD);

    /** @type {Map<string, import('../../models/user.js').User>} */
    const usersByEmail = new Map();
    let userCount = 0;
    for (const definition of DEMO_USERS) {
      // On a forced re-run the database already holds most of the dataset. Re-using the
      // stored account instead of creating a second one is what lets `--force` act as a
      // top-up, so a demo database that already carries orders can gain a new shop
      // without being thrown away first.
      const alreadyStored = await userRepository.findByEmail(definition.email);
      if (alreadyStored) {
        usersByEmail.set(definition.email, alreadyStored);
        continue;
      }

      const user = UserFactory.create(definition.role, {
        fullName: definition.fullName,
        email: definition.email,
        phone: definition.phone,
        gender: definition.gender ?? null,
        passwordHash,
      });
      user.markVerified();
      const stored = await userRepository.create(user);
      usersByEmail.set(definition.email, stored);
      userCount += 1;

      if (definition.role === USER_ROLE.STUDENT) {
        await profileRepository.create(
          new StudentProfile({
            userId: stored.id,
            hallName: definition.hallName,
            roomNo: definition.roomNo,
            isDeliveryEnabled: definition.isDeliveryEnabled ?? false,
          })
        );
      }
    }

    let itemCount = 0;
    let shopCount = 0;
    for (const definition of DEMO_SHOPS) {
      const owner = usersByEmail.get(definition.ownerEmail);
      // One vendor owns one shop (SRS section 3), so an owner that already has one has
      // already been seeded.
      if (await shopRepository.findByOwner(owner.id)) {
        continue;
      }

      const shop = new Shop({
        ownerUserId: owner.id,
        shopName: definition.shopName,
        botTolaLocation: definition.botTolaLocation,
        contactPhone: definition.contactPhone,
        operatingHours: definition.operatingHours,
        description: definition.description,
        approvalStatus: APPROVAL_STATUS.APPROVED,
        isOpen: definition.isOpen ?? true,
      });
      const storedShop = await shopRepository.create(shop);
      shopCount += 1;

      for (const item of definition.menu) {
        await menuItemRepository.create(
          new MenuItem({
            shopId: storedShop.id,
            name: item.name,
            description: item.description ?? null,
            price: Money.fromTaka(item.price),
            category: item.category,
            prepTimeMin: item.prepTimeMin,
            isAvailable: item.isAvailable ?? true,
          })
        );
        itemCount += 1;
      }
    }

    return {
      seeded: true,
      users: userCount,
      shops: shopCount,
      items: itemCount,
    };
  }

  /**
   * The sign-in details to print after seeding.
   *
   * The shared password is reported separately rather than on each row, because the
   * logger redacts any field called `password` — which is the behaviour we want
   * everywhere else and would only hide the demo credential here.
   *
   * @returns {{ sharedPassword: string, accounts: Array<{ role: string, email: string }> }}
   *   Demo credentials.
   */
  static credentials() {
    return {
      sharedPassword: DEMO_PASSWORD,
      accounts: DEMO_USERS.map((user) => ({ role: user.role, email: user.email })),
    };
  }
}

/**
 * Runs the seeder as a script.
 *
 * @returns {Promise<void>} Resolves once the dataset is written.
 * @throws {Error} When invoked against a production environment.
 */
async function main() {
  const env = Env.current;
  if (env.isProduction) {
    throw new Error('Refusing to seed demonstration accounts into production.');
  }

  const logger = new Logger({ level: 'info' });
  const db = createDatabase(env);
  await db.connect();
  logger.info('Seeding into', describeDatabase(db));

  const force = process.argv.includes('--force');
  const result = await new Seeder({ db, logger }).run({ force });

  if (result.seeded) {
    const { sharedPassword, accounts } = Seeder.credentials();
    logger.info('Seed complete', result);
    logger.info('Every demo account signs in with the same password', { sharedPassword });
    for (const account of accounts) {
      logger.info('Demo account', account);
    }
  }
  await db.disconnect();
}

// Only run when invoked directly, so importing `Seeder` in a test does not write a file.
if (process.argv[1] && process.argv[1].endsWith('seed.js')) {
  main().catch((error) => {
    console.error('Seeding failed:', error);
    process.exit(1);
  });
}
