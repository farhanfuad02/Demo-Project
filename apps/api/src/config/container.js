/**
 * @file Dependency-injection container and its resolution tokens.
 *
 * @module config/container
 */

import { Logger } from '../lib/logger.js';
import { AuditLogRepository } from '../repositories/audit-log-repository.js';
import { AuthTokenRepository } from '../repositories/auth-token-repository.js';
import { CartRepository } from '../repositories/cart-repository.js';
import { DeliveryRepository } from '../repositories/delivery-repository.js';
import { MenuItemRepository } from '../repositories/menu-item-repository.js';
import { NotificationRepository } from '../repositories/notification-repository.js';
import { OrderRepository } from '../repositories/order-repository.js';
import { PaymentRepository } from '../repositories/payment-repository.js';
import { RatingRepository } from '../repositories/rating-repository.js';
import { ShopRepository } from '../repositories/shop-repository.js';
import { StudentProfileRepository } from '../repositories/student-profile-repository.js';
import { SystemConfigRepository } from '../repositories/system-config-repository.js';
import { UserRepository } from '../repositories/user-repository.js';
import { AdminService } from '../services/admin-service.js';
import { AnalyticsService } from '../services/analytics-service.js';
import { AuditService } from '../services/audit-service.js';
import { AuthService } from '../services/auth-service.js';
import { CartService } from '../services/cart-service.js';
import { DeliveryService } from '../services/delivery-service.js';
import { ConsoleEmailService } from '../services/email-service.js';
import { MenuService } from '../services/menu-service.js';
import { NotificationService } from '../services/notification-service.js';
import { OrderService } from '../services/order-service.js';
import { PasswordService } from '../services/password-service.js';
import { PaymentService } from '../services/payment-service.js';
import { RatingService } from '../services/rating-service.js';
import { SchedulerService } from '../services/scheduler-service.js';
import { SettingsService } from '../services/settings-service.js';
import { ShopService } from '../services/shop-service.js';
import { TokenService } from '../services/token-service.js';
import { UserService } from '../services/user-service.js';
import { AdminController } from '../controllers/admin-controller.js';
import { AuthController } from '../controllers/auth-controller.js';
import { CartController } from '../controllers/cart-controller.js';
import { DeliveryController } from '../controllers/delivery-controller.js';
import { NotificationController } from '../controllers/notification-controller.js';
import { OrderController } from '../controllers/order-controller.js';
import { ShopController } from '../controllers/shop-controller.js';
import { UserController } from '../controllers/user-controller.js';
import { AuthMiddleware } from '../middleware/auth-middleware.js';
import { ErrorMiddleware } from '../middleware/error-middleware.js';
import { RequestLogMiddleware } from '../middleware/request-log-middleware.js';
import { AdminRouter } from '../routes/admin-router.js';
import { AuthRouter } from '../routes/auth-router.js';
import { CartRouter } from '../routes/cart-router.js';
import { DeliveryRouter } from '../routes/delivery-router.js';
import { NotificationRouter } from '../routes/notification-router.js';
import { OrderRouter } from '../routes/order-router.js';
import { SearchRouter } from '../routes/search-router.js';
import { ShopRouter } from '../routes/shop-router.js';
import { UserRouter } from '../routes/user-router.js';

/**
 * Resolution tokens. Symbols rather than strings, so a typo is an undefined import
 * rather than a silently unresolvable key.
 *
 * @type {Readonly<Record<string, symbol>>}
 */
export const TOKENS = Object.freeze({
  DB: Symbol('db'),
  ENV: Symbol('env'),
  LOGGER: Symbol('logger'),

  USER_REPOSITORY: Symbol('userRepository'),
  STUDENT_PROFILE_REPOSITORY: Symbol('studentProfileRepository'),
  SHOP_REPOSITORY: Symbol('shopRepository'),
  MENU_ITEM_REPOSITORY: Symbol('menuItemRepository'),
  CART_REPOSITORY: Symbol('cartRepository'),
  ORDER_REPOSITORY: Symbol('orderRepository'),
  DELIVERY_REPOSITORY: Symbol('deliveryRepository'),
  PAYMENT_REPOSITORY: Symbol('paymentRepository'),
  RATING_REPOSITORY: Symbol('ratingRepository'),
  NOTIFICATION_REPOSITORY: Symbol('notificationRepository'),
  AUDIT_LOG_REPOSITORY: Symbol('auditLogRepository'),
  AUTH_TOKEN_REPOSITORY: Symbol('authTokenRepository'),
  SYSTEM_CONFIG_REPOSITORY: Symbol('systemConfigRepository'),

  PASSWORD_SERVICE: Symbol('passwordService'),
  TOKEN_SERVICE: Symbol('tokenService'),
  EMAIL_SERVICE: Symbol('emailService'),
  AUDIT_SERVICE: Symbol('auditService'),
  NOTIFICATION_SERVICE: Symbol('notificationService'),
  SETTINGS_SERVICE: Symbol('settingsService'),
  AUTH_SERVICE: Symbol('authService'),
  USER_SERVICE: Symbol('userService'),
  SHOP_SERVICE: Symbol('shopService'),
  MENU_SERVICE: Symbol('menuService'),
  CART_SERVICE: Symbol('cartService'),
  ORDER_SERVICE: Symbol('orderService'),
  DELIVERY_SERVICE: Symbol('deliveryService'),
  PAYMENT_SERVICE: Symbol('paymentService'),
  RATING_SERVICE: Symbol('ratingService'),
  ADMIN_SERVICE: Symbol('adminService'),
  ANALYTICS_SERVICE: Symbol('analyticsService'),
  SCHEDULER_SERVICE: Symbol('schedulerService'),

  AUTH_CONTROLLER: Symbol('authController'),
  USER_CONTROLLER: Symbol('userController'),
  SHOP_CONTROLLER: Symbol('shopController'),
  CART_CONTROLLER: Symbol('cartController'),
  ORDER_CONTROLLER: Symbol('orderController'),
  DELIVERY_CONTROLLER: Symbol('deliveryController'),
  NOTIFICATION_CONTROLLER: Symbol('notificationController'),
  ADMIN_CONTROLLER: Symbol('adminController'),

  AUTH_MIDDLEWARE: Symbol('authMiddleware'),
  ERROR_MIDDLEWARE: Symbol('errorMiddleware'),
  REQUEST_LOG_MIDDLEWARE: Symbol('requestLogMiddleware'),

  AUTH_ROUTER: Symbol('authRouter'),
  USER_ROUTER: Symbol('userRouter'),
  SHOP_ROUTER: Symbol('shopRouter'),
  SEARCH_ROUTER: Symbol('searchRouter'),
  CART_ROUTER: Symbol('cartRouter'),
  ORDER_ROUTER: Symbol('orderRouter'),
  DELIVERY_ROUTER: Symbol('deliveryRouter'),
  NOTIFICATION_ROUTER: Symbol('notificationRouter'),
  ADMIN_ROUTER: Symbol('adminRouter'),
});

/**
 * A small service locator that wires repositories into services into controllers.
 *
 * Every class in this application takes its collaborators through its constructor and
 * reaches for no global. That is what makes them unit-testable — a service can be handed
 * a fake repository — but it also means something has to do the assembling. This is that
 * something, and it is the only file that knows the whole graph.
 *
 * Factories are lazy and memoised, so registration order does not matter and each
 * dependency is constructed once.
 */
export class Container {
  /** @type {Map<symbol, () => unknown>} */
  #factories = new Map();

  /** @type {Map<symbol, unknown>} */
  #instances = new Map();

  /**
   * Registers a lazy factory under a token.
   *
   * @param {symbol} token - Key from {@link TOKENS}.
   * @param {(container: Container) => unknown} factory - Builder run on first resolution.
   * @returns {this} This container, for chaining.
   */
  register(token, factory) {
    this.#factories.set(token, factory);
    return this;
  }

  /**
   * Registers an already-built value.
   *
   * @param {symbol} token - Key from {@link TOKENS}.
   * @param {unknown} value - The instance.
   * @returns {this} This container, for chaining.
   */
  registerValue(token, value) {
    this.#instances.set(token, value);
    return this;
  }

  /**
   * Resolves a token, building and memoising it on first use.
   *
   * @template T
   * @param {symbol} token - Key from {@link TOKENS}.
   * @returns {T} The registered instance.
   * @throws {Error} When nothing is registered under the token.
   */
  resolve(token) {
    if (this.#instances.has(token)) {
      return /** @type {T} */ (this.#instances.get(token));
    }
    const factory = this.#factories.get(token);
    if (!factory) {
      throw new Error(`Nothing is registered for ${String(token.description)}.`);
    }
    const instance = factory(this);
    this.#instances.set(token, instance);
    return /** @type {T} */ (instance);
  }

  /**
   * Forgets every built instance while keeping the registrations, so a test can start
   * from a clean object graph without re-declaring it.
   *
   * @returns {void}
   */
  reset() {
    this.#instances.clear();
  }

  /**
   * Registers the whole application graph.
   *
   * @param {object} dependencies - The two things the container cannot build itself.
   * @param {import('./database/database.js').Database} dependencies.db - Connected database.
   * @param {import('./env.js').Env} dependencies.env - Process configuration.
   * @returns {Container} The bootstrapped container.
   */
  static bootstrap({ db, env }) {
    const container = new Container();

    container.registerValue(TOKENS.DB, db);
    container.registerValue(TOKENS.ENV, env);
    container.register(TOKENS.LOGGER, () => new Logger({ level: env.logLevel }));

    Container.#registerRepositories(container);
    Container.#registerServices(container, env);
    Container.#registerControllers(container, env);
    Container.#registerHttp(container, env);

    return container;
  }

  /**
   * Registers every repository.
   *
   * @param {Container} container - Container to register into.
   * @returns {void}
   */
  static #registerRepositories(container) {
    /** @type {Array<[symbol, new (db: unknown) => unknown]>} */
    const repositories = [
      [TOKENS.USER_REPOSITORY, UserRepository],
      [TOKENS.STUDENT_PROFILE_REPOSITORY, StudentProfileRepository],
      [TOKENS.SHOP_REPOSITORY, ShopRepository],
      [TOKENS.MENU_ITEM_REPOSITORY, MenuItemRepository],
      [TOKENS.CART_REPOSITORY, CartRepository],
      [TOKENS.ORDER_REPOSITORY, OrderRepository],
      [TOKENS.DELIVERY_REPOSITORY, DeliveryRepository],
      [TOKENS.PAYMENT_REPOSITORY, PaymentRepository],
      [TOKENS.RATING_REPOSITORY, RatingRepository],
      [TOKENS.NOTIFICATION_REPOSITORY, NotificationRepository],
      [TOKENS.AUDIT_LOG_REPOSITORY, AuditLogRepository],
      [TOKENS.AUTH_TOKEN_REPOSITORY, AuthTokenRepository],
      [TOKENS.SYSTEM_CONFIG_REPOSITORY, SystemConfigRepository],
    ];

    for (const [token, RepositoryClass] of repositories) {
      container.register(token, (c) => new RepositoryClass(c.resolve(TOKENS.DB)));
    }
  }

  /**
   * Registers every service.
   *
   * @param {Container} container - Container to register into.
   * @param {import('./env.js').Env} env - Process configuration.
   * @returns {void}
   */
  static #registerServices(container, env) {
    container.register(TOKENS.PASSWORD_SERVICE, () => new PasswordService());

    container.register(
      TOKENS.TOKEN_SERVICE,
      (c) =>
        new TokenService({
          accessSecret: env.jwtAccessSecret,
          refreshSecret: env.jwtRefreshSecret,
          authTokenRepository: c.resolve(TOKENS.AUTH_TOKEN_REPOSITORY),
        })
    );

    container.register(
      TOKENS.EMAIL_SERVICE,
      (c) =>
        new ConsoleEmailService({
          webAppUrl: env.webAppUrl,
          logger: c.resolve(TOKENS.LOGGER),
        })
    );

    container.register(
      TOKENS.AUDIT_SERVICE,
      (c) =>
        new AuditService({
          auditLogRepository: c.resolve(TOKENS.AUDIT_LOG_REPOSITORY),
          logger: c.resolve(TOKENS.LOGGER),
        })
    );

    container.register(
      TOKENS.NOTIFICATION_SERVICE,
      (c) =>
        new NotificationService({
          notificationRepository: c.resolve(TOKENS.NOTIFICATION_REPOSITORY),
          logger: c.resolve(TOKENS.LOGGER),
        })
    );

    container.register(
      TOKENS.SETTINGS_SERVICE,
      (c) =>
        new SettingsService({
          systemConfigRepository: c.resolve(TOKENS.SYSTEM_CONFIG_REPOSITORY),
        })
    );

    container.register(
      TOKENS.AUTH_SERVICE,
      (c) =>
        new AuthService({
          userRepository: c.resolve(TOKENS.USER_REPOSITORY),
          studentProfileRepository: c.resolve(TOKENS.STUDENT_PROFILE_REPOSITORY),
          shopRepository: c.resolve(TOKENS.SHOP_REPOSITORY),
          passwordService: c.resolve(TOKENS.PASSWORD_SERVICE),
          tokenService: c.resolve(TOKENS.TOKEN_SERVICE),
          emailService: c.resolve(TOKENS.EMAIL_SERVICE),
          auditService: c.resolve(TOKENS.AUDIT_SERVICE),
        })
    );

    container.register(
      TOKENS.USER_SERVICE,
      (c) =>
        new UserService({
          userRepository: c.resolve(TOKENS.USER_REPOSITORY),
          studentProfileRepository: c.resolve(TOKENS.STUDENT_PROFILE_REPOSITORY),
          deliveryRepository: c.resolve(TOKENS.DELIVERY_REPOSITORY),
          auditService: c.resolve(TOKENS.AUDIT_SERVICE),
        })
    );

    container.register(
      TOKENS.SHOP_SERVICE,
      (c) =>
        new ShopService({
          shopRepository: c.resolve(TOKENS.SHOP_REPOSITORY),
          menuItemRepository: c.resolve(TOKENS.MENU_ITEM_REPOSITORY),
          auditService: c.resolve(TOKENS.AUDIT_SERVICE),
        })
    );

    container.register(
      TOKENS.MENU_SERVICE,
      (c) =>
        new MenuService({
          menuItemRepository: c.resolve(TOKENS.MENU_ITEM_REPOSITORY),
          shopRepository: c.resolve(TOKENS.SHOP_REPOSITORY),
          auditService: c.resolve(TOKENS.AUDIT_SERVICE),
        })
    );

    container.register(
      TOKENS.CART_SERVICE,
      (c) =>
        new CartService({
          cartRepository: c.resolve(TOKENS.CART_REPOSITORY),
          menuItemRepository: c.resolve(TOKENS.MENU_ITEM_REPOSITORY),
          shopRepository: c.resolve(TOKENS.SHOP_REPOSITORY),
          settingsService: c.resolve(TOKENS.SETTINGS_SERVICE),
        })
    );

    container.register(
      TOKENS.PAYMENT_SERVICE,
      (c) =>
        new PaymentService({
          paymentRepository: c.resolve(TOKENS.PAYMENT_REPOSITORY),
          auditService: c.resolve(TOKENS.AUDIT_SERVICE),
        })
    );

    container.register(
      TOKENS.DELIVERY_SERVICE,
      (c) =>
        new DeliveryService({
          deliveryRepository: c.resolve(TOKENS.DELIVERY_REPOSITORY),
          orderRepository: c.resolve(TOKENS.ORDER_REPOSITORY),
          shopRepository: c.resolve(TOKENS.SHOP_REPOSITORY),
          userRepository: c.resolve(TOKENS.USER_REPOSITORY),
          studentProfileRepository: c.resolve(TOKENS.STUDENT_PROFILE_REPOSITORY),
          passwordService: c.resolve(TOKENS.PASSWORD_SERVICE),
          paymentService: c.resolve(TOKENS.PAYMENT_SERVICE),
          notificationService: c.resolve(TOKENS.NOTIFICATION_SERVICE),
          settingsService: c.resolve(TOKENS.SETTINGS_SERVICE),
          auditService: c.resolve(TOKENS.AUDIT_SERVICE),
        })
    );

    container.register(
      TOKENS.ORDER_SERVICE,
      (c) =>
        new OrderService({
          orderRepository: c.resolve(TOKENS.ORDER_REPOSITORY),
          shopRepository: c.resolve(TOKENS.SHOP_REPOSITORY),
          studentProfileRepository: c.resolve(TOKENS.STUDENT_PROFILE_REPOSITORY),
          userRepository: c.resolve(TOKENS.USER_REPOSITORY),
          cartService: c.resolve(TOKENS.CART_SERVICE),
          deliveryService: c.resolve(TOKENS.DELIVERY_SERVICE),
          paymentService: c.resolve(TOKENS.PAYMENT_SERVICE),
          notificationService: c.resolve(TOKENS.NOTIFICATION_SERVICE),
          settingsService: c.resolve(TOKENS.SETTINGS_SERVICE),
          auditService: c.resolve(TOKENS.AUDIT_SERVICE),
        })
    );

    container.register(
      TOKENS.RATING_SERVICE,
      (c) =>
        new RatingService({
          ratingRepository: c.resolve(TOKENS.RATING_REPOSITORY),
          orderRepository: c.resolve(TOKENS.ORDER_REPOSITORY),
          shopRepository: c.resolve(TOKENS.SHOP_REPOSITORY),
          deliveryRepository: c.resolve(TOKENS.DELIVERY_REPOSITORY),
          studentProfileRepository: c.resolve(TOKENS.STUDENT_PROFILE_REPOSITORY),
          auditService: c.resolve(TOKENS.AUDIT_SERVICE),
        })
    );

    container.register(
      TOKENS.ADMIN_SERVICE,
      (c) =>
        new AdminService({
          userRepository: c.resolve(TOKENS.USER_REPOSITORY),
          shopRepository: c.resolve(TOKENS.SHOP_REPOSITORY),
          orderRepository: c.resolve(TOKENS.ORDER_REPOSITORY),
          deliveryRepository: c.resolve(TOKENS.DELIVERY_REPOSITORY),
          auditLogRepository: c.resolve(TOKENS.AUDIT_LOG_REPOSITORY),
          tokenService: c.resolve(TOKENS.TOKEN_SERVICE),
          notificationService: c.resolve(TOKENS.NOTIFICATION_SERVICE),
          auditService: c.resolve(TOKENS.AUDIT_SERVICE),
        })
    );

    container.register(
      TOKENS.ANALYTICS_SERVICE,
      (c) =>
        new AnalyticsService({
          orderRepository: c.resolve(TOKENS.ORDER_REPOSITORY),
          shopRepository: c.resolve(TOKENS.SHOP_REPOSITORY),
          deliveryRepository: c.resolve(TOKENS.DELIVERY_REPOSITORY),
          userRepository: c.resolve(TOKENS.USER_REPOSITORY),
        })
    );

    container.register(
      TOKENS.SCHEDULER_SERVICE,
      (c) =>
        new SchedulerService({
          orderService: c.resolve(TOKENS.ORDER_SERVICE),
          authTokenRepository: c.resolve(TOKENS.AUTH_TOKEN_REPOSITORY),
          logger: c.resolve(TOKENS.LOGGER),
        })
    );
  }

  /**
   * Registers every controller.
   *
   * @param {Container} container - Container to register into.
   * @param {import('./env.js').Env} env - Process configuration.
   * @returns {void}
   */
  static #registerControllers(container, env) {
    container.register(
      TOKENS.AUTH_CONTROLLER,
      (c) =>
        new AuthController({
          authService: c.resolve(TOKENS.AUTH_SERVICE),
          userService: c.resolve(TOKENS.USER_SERVICE),
          secureCookies: env.isProduction,
        })
    );

    container.register(
      TOKENS.USER_CONTROLLER,
      (c) => new UserController({ userService: c.resolve(TOKENS.USER_SERVICE) })
    );

    container.register(
      TOKENS.SHOP_CONTROLLER,
      (c) =>
        new ShopController({
          shopService: c.resolve(TOKENS.SHOP_SERVICE),
          menuService: c.resolve(TOKENS.MENU_SERVICE),
          ratingService: c.resolve(TOKENS.RATING_SERVICE),
          analyticsService: c.resolve(TOKENS.ANALYTICS_SERVICE),
        })
    );

    container.register(
      TOKENS.CART_CONTROLLER,
      (c) => new CartController({ cartService: c.resolve(TOKENS.CART_SERVICE) })
    );

    container.register(
      TOKENS.ORDER_CONTROLLER,
      (c) =>
        new OrderController({
          orderService: c.resolve(TOKENS.ORDER_SERVICE),
          ratingService: c.resolve(TOKENS.RATING_SERVICE),
        })
    );

    container.register(
      TOKENS.DELIVERY_CONTROLLER,
      (c) => new DeliveryController({ deliveryService: c.resolve(TOKENS.DELIVERY_SERVICE) })
    );

    container.register(
      TOKENS.NOTIFICATION_CONTROLLER,
      (c) =>
        new NotificationController({
          notificationService: c.resolve(TOKENS.NOTIFICATION_SERVICE),
        })
    );

    container.register(
      TOKENS.ADMIN_CONTROLLER,
      (c) =>
        new AdminController({
          adminService: c.resolve(TOKENS.ADMIN_SERVICE),
          analyticsService: c.resolve(TOKENS.ANALYTICS_SERVICE),
          settingsService: c.resolve(TOKENS.SETTINGS_SERVICE),
          ratingService: c.resolve(TOKENS.RATING_SERVICE),
        })
    );
  }

  /**
   * Registers middleware and routers.
   *
   * @param {Container} container - Container to register into.
   * @param {import('./env.js').Env} env - Process configuration.
   * @returns {void}
   */
  static #registerHttp(container, env) {
    container.register(
      TOKENS.AUTH_MIDDLEWARE,
      (c) => new AuthMiddleware({ authService: c.resolve(TOKENS.AUTH_SERVICE) })
    );

    container.register(
      TOKENS.ERROR_MIDDLEWARE,
      (c) =>
        new ErrorMiddleware({
          logger: c.resolve(TOKENS.LOGGER),
          exposeStack: !env.isProduction,
        })
    );

    container.register(
      TOKENS.REQUEST_LOG_MIDDLEWARE,
      (c) => new RequestLogMiddleware({ logger: c.resolve(TOKENS.LOGGER) })
    );

    container.register(
      TOKENS.AUTH_ROUTER,
      (c) =>
        new AuthRouter({
          authController: c.resolve(TOKENS.AUTH_CONTROLLER),
          authMiddleware: c.resolve(TOKENS.AUTH_MIDDLEWARE),
        })
    );

    container.register(
      TOKENS.USER_ROUTER,
      (c) =>
        new UserRouter({
          userController: c.resolve(TOKENS.USER_CONTROLLER),
          authMiddleware: c.resolve(TOKENS.AUTH_MIDDLEWARE),
        })
    );

    container.register(
      TOKENS.SHOP_ROUTER,
      (c) =>
        new ShopRouter({
          shopController: c.resolve(TOKENS.SHOP_CONTROLLER),
          orderController: c.resolve(TOKENS.ORDER_CONTROLLER),
          authMiddleware: c.resolve(TOKENS.AUTH_MIDDLEWARE),
        })
    );

    container.register(
      TOKENS.SEARCH_ROUTER,
      (c) => new SearchRouter({ shopController: c.resolve(TOKENS.SHOP_CONTROLLER) })
    );

    container.register(
      TOKENS.CART_ROUTER,
      (c) =>
        new CartRouter({
          cartController: c.resolve(TOKENS.CART_CONTROLLER),
          authMiddleware: c.resolve(TOKENS.AUTH_MIDDLEWARE),
        })
    );

    container.register(
      TOKENS.ORDER_ROUTER,
      (c) =>
        new OrderRouter({
          orderController: c.resolve(TOKENS.ORDER_CONTROLLER),
          authMiddleware: c.resolve(TOKENS.AUTH_MIDDLEWARE),
        })
    );

    container.register(
      TOKENS.DELIVERY_ROUTER,
      (c) =>
        new DeliveryRouter({
          deliveryController: c.resolve(TOKENS.DELIVERY_CONTROLLER),
          authMiddleware: c.resolve(TOKENS.AUTH_MIDDLEWARE),
        })
    );

    container.register(
      TOKENS.NOTIFICATION_ROUTER,
      (c) =>
        new NotificationRouter({
          notificationController: c.resolve(TOKENS.NOTIFICATION_CONTROLLER),
          authMiddleware: c.resolve(TOKENS.AUTH_MIDDLEWARE),
        })
    );

    container.register(
      TOKENS.ADMIN_ROUTER,
      (c) =>
        new AdminRouter({
          adminController: c.resolve(TOKENS.ADMIN_CONTROLLER),
          authMiddleware: c.resolve(TOKENS.AUTH_MIDDLEWARE),
        })
    );
  }
}
