/**
 * @file Unit tests for the client-side controllers.
 *
 * @module tests/unit/controllers
 */

import { describe, expect, it, jest } from '@jest/globals';
import { DELIVERY_STATUS, ORDER_STATUS, USER_ROLE } from '@hungry-ju/shared/enums';
import { BaseController } from '../../src/controllers/base-controller.js';
import { CartController } from '../../src/controllers/cart-controller.js';
import { CatalogController } from '../../src/controllers/catalog-controller.js';
import { DeliverController } from '../../src/controllers/deliver-controller.js';
import { NotificationController } from '../../src/controllers/notification-controller.js';
import { OrderController } from '../../src/controllers/order-controller.js';
import { SessionController } from '../../src/controllers/session-controller.js';
import { VendorController } from '../../src/controllers/vendor-controller.js';
import { apiError, FakeApiClient } from '../helpers/fake-api.js';

/** A cart payload the fake API can hand back. */
const CART_PAYLOAD = {
  items: [
    { id: 'l1', menuItemId: 'i1', itemName: 'Khichuri', unitPrice: 60, quantity: 1, lineTotal: 60 },
  ],
  itemCount: 1,
  subtotal: 60,
  deliveryFee: 25,
  total: 85,
  shop: { id: 'shop-1', shopName: 'Test Shop' },
};

describe('BaseController', () => {
  /** A controller that exposes the protected helpers. */
  class ConcreteController extends BaseController {
    /**
     * @param {Function} work - Work to run.
     * @param {object} [options] - Behaviour.
     * @returns {Promise<unknown>} The result.
     */
    async doWork(work, options) {
      return this.run(work, options);
    }
  }

  it('is abstract', () => {
    expect(() => new BaseController(new FakeApiClient())).toThrow(TypeError);
  });

  it('publishes a new frozen snapshot on every change', () => {
    const controller = new ConcreteController(new FakeApiClient(), { count: 0 });
    const first = controller.getState();

    controller.setState({ count: 1 });
    const second = controller.getState();

    // Identity has to change, or useSyncExternalStore cannot tell it apart.
    expect(second).not.toBe(first);
    expect(Object.isFrozen(second)).toBe(true);
    expect(second.count).toBe(1);
  });

  it('notifies subscribers and stops when they unsubscribe', () => {
    const controller = new ConcreteController(new FakeApiClient());
    const listener = jest.fn();

    const unsubscribe = controller.subscribe(listener);
    controller.setState({ a: 1 });
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
    controller.setState({ a: 2 });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('raises and clears the loading flag around an operation', async () => {
    const controller = new ConcreteController(new FakeApiClient());
    const seen = [];
    controller.subscribe(() => seen.push(controller.state.loading));

    await controller.doWork(async () => 'done');
    expect(seen).toEqual([true, false]);
  });

  it('turns a failure into a message rather than an unhandled rejection', async () => {
    const controller = new ConcreteController(new FakeApiClient());
    const result = await controller.doWork(async () => {
      throw apiError({ status: 409, message: 'Already taken' });
    });

    expect(result).toBeNull();
    expect(controller.state.error).toBe('Already taken');
    expect(controller.state.errorCode).toBe('CONFLICT');
    expect(controller.state.loading).toBe(false);
  });

  it('re-throws when the caller needs to react to the failure itself', async () => {
    const controller = new ConcreteController(new FakeApiClient());
    await expect(
      controller.doWork(
        async () => {
          throw apiError({ status: 409 });
        },
        { rethrow: true }
      )
    ).rejects.toThrow();
  });

  it('leaves the loading flag alone for a background refresh', async () => {
    const controller = new ConcreteController(new FakeApiClient());
    const seen = [];
    controller.subscribe(() => seen.push(controller.state.loading));

    await controller.doWork(async () => 'quiet', { silent: true });
    expect(seen).toEqual([false]);
  });

  it('clears an error on request, for a form retrying', () => {
    const controller = new ConcreteController(new FakeApiClient(), { error: 'boom' });
    controller.clearError();
    expect(controller.state.error).toBeNull();
  });
});

describe('SessionController', () => {
  /**
   * Builds a session controller over a fake API.
   *
   * @param {object} handlers - Auth and user handlers.
   * @returns {{ controller: SessionController, api: FakeApiClient }} The pair.
   */
  const build = (handlers) => {
    const api = new FakeApiClient(handlers);
    return { controller: new SessionController(api), api };
  };

  const profile = {
    id: 'u1',
    fullName: 'Farhan Fuad',
    role: USER_ROLE.STUDENT,
    homeRoute: '/shops',
  };

  it('restores a session from the refresh cookie on first load', async () => {
    const { controller, api } = build({
      auth: {
        refresh: async () => ({ accessToken: 'access-1' }),
        me: async () => profile,
      },
    });

    const user = await controller.bootstrap();
    expect(user.fullName).toBe('Farhan Fuad');
    expect(api.http.token).toBe('access-1');
    expect(controller.state.ready).toBe(true);
  });

  it('treats a visitor with no cookie as signed out, not as an error', async () => {
    const { controller } = build({
      auth: {
        refresh: async () => {
          throw apiError({ status: 401 });
        },
      },
    });

    await controller.bootstrap();
    expect(controller.state.user).toBeNull();
    expect(controller.state.ready).toBe(true);
    // A red banner on the home page would say the site is broken.
    expect(controller.state.error).toBeNull();
  });

  it('shares one attempt between concurrent callers, because refresh tokens rotate', async () => {
    // The second call would present a token the first already spent. Before this was
    // shared, that 401 published `ready` with no user and bounced every guarded page to
    // sign-in — reproducible on any hard reload under React strict mode.
    let refreshes = 0;
    const { controller } = build({
      auth: {
        refresh: async () => {
          refreshes += 1;
          if (refreshes > 1) {
            throw apiError({ status: 401, message: 'This session is no longer valid.' });
          }
          await new Promise((resolve) => setTimeout(resolve, 10));
          return { accessToken: 'access-1' };
        },
        me: async () => profile,
      },
    });

    const [first, second] = await Promise.all([controller.bootstrap(), controller.bootstrap()]);

    expect(refreshes).toBe(1);
    expect(first).not.toBeNull();
    expect(second).toBe(first);
    expect(controller.state.user).not.toBeNull();
    expect(controller.state.ready).toBe(true);
  });

  it('does not repeat the attempt once the session is settled', async () => {
    let refreshes = 0;
    const { controller } = build({
      auth: {
        refresh: async () => {
          refreshes += 1;
          return { accessToken: 'access-1' };
        },
        me: async () => profile,
      },
    });

    await controller.bootstrap();
    await controller.bootstrap();
    expect(refreshes).toBe(1);
  });

  it('holds the access token in memory only', async () => {
    const { controller, api } = build({
      auth: {
        login: async () => ({ accessToken: 'access-2' }),
        me: async () => profile,
      },
    });

    await controller.login('farhan@juniv.edu', 'Hungry@JU1');
    expect(api.http.token).toBe('access-2');
    // Never localStorage, which any injected script can read.
    expect(JSON.stringify(controller.state)).not.toContain('access-2');
  });

  it('reports a failed sign-in without a session', async () => {
    const { controller } = build({
      auth: {
        login: async () => {
          throw apiError({ status: 401, message: 'E-mail, phone, or password is incorrect.' });
        },
      },
    });

    expect(await controller.login('x', 'y')).toBeNull();
    expect(controller.state.error).toContain('incorrect');
    expect(controller.state.user).toBeNull();
  });

  it('clears the local session even when the sign-out request fails', async () => {
    const { controller, api } = build({
      auth: {
        login: async () => ({ accessToken: 'access-3' }),
        me: async () => profile,
        logout: async () => {
          throw apiError({ status: 500 });
        },
      },
    });
    await controller.login('a', 'b');

    await controller.logout();
    // A user on a shared machine must not stay signed in because the network dropped.
    expect(controller.state.user).toBeNull();
    expect(api.http.token).toBeNull();
  });

  it('re-reads the profile after changing the delivery address', async () => {
    const { controller, api } = build({
      auth: { login: async () => ({ accessToken: 'a' }), me: async () => profile },
      users: { updateLocation: async () => ({ hallName: 'PRH' }) },
    });
    await controller.login('a', 'b');

    await controller.updateLocation({ hallName: 'PRH', roomNo: '302' });
    expect(api.countOf('auth', 'me')).toBe(2);
  });
});

describe('CartController', () => {
  it('loads the cart into a model', async () => {
    const controller = new CartController(
      new FakeApiClient({ cart: { show: async () => CART_PAYLOAD } })
    );
    await controller.load();

    expect(controller.cart.itemCount).toBe(1);
    expect(controller.cart.total).toBe(85);
    expect(controller.state.loaded).toBe(true);
  });

  it('adds an item', async () => {
    const controller = new CartController(
      new FakeApiClient({ cart: { addItem: async () => CART_PAYLOAD } })
    );
    await controller.addItem({ id: 'i1' }, 1);

    expect(controller.cart.itemCount).toBe(1);
    expect(controller.state.error).toBeNull();
  });

  describe('BR-03 clashes', () => {
    it('offers the resolution rather than an error banner', async () => {
      const controller = new CartController(
        new FakeApiClient({
          cart: {
            addItem: async () => {
              throw apiError({ status: 409, message: 'Your cart already holds another vendor.' });
            },
          },
        })
      );

      await controller.addItem({ id: 'i1' }, 2);
      expect(controller.state.conflict).toMatchObject({ quantity: 2 });
      expect(controller.state.error).toBeNull();
    });

    it('clears the cart and retries when the student confirms', async () => {
      let cleared = false;
      const api = new FakeApiClient({
        cart: {
          addItem: async () => {
            if (!cleared) {
              throw apiError({ status: 409, message: 'clash' });
            }
            return CART_PAYLOAD;
          },
          clear: async () => {
            cleared = true;
            return { items: [], itemCount: 0 };
          },
        },
      });
      const controller = new CartController(api);

      await controller.addItem({ id: 'i1' }, 1);
      await controller.resolveConflict();

      expect(controller.state.conflict).toBeNull();
      expect(controller.cart.itemCount).toBe(1);
    });

    it('keeps the existing cart when the student declines', async () => {
      const controller = new CartController(
        new FakeApiClient({
          cart: {
            addItem: async () => {
              throw apiError({ status: 409, message: 'clash' });
            },
          },
        })
      );

      await controller.addItem({ id: 'i1' }, 1);
      controller.dismissConflict();
      expect(controller.state.conflict).toBeNull();
    });
  });

  it('surfaces a non-conflict failure as an error', async () => {
    const controller = new CartController(
      new FakeApiClient({
        cart: {
          addItem: async () => {
            throw apiError({ status: 422, code: 'VALIDATION_ERROR', message: 'Sold out' });
          },
        },
      })
    );

    await controller.addItem({ id: 'i1' });
    expect(controller.state.error).toBe('Sold out');
    expect(controller.state.conflict).toBeNull();
  });

  it('adopts a cart another controller produced, such as a reorder', () => {
    const controller = new CartController(new FakeApiClient());
    controller.adopt(CART_PAYLOAD);
    expect(controller.cart.itemCount).toBe(1);
  });
});

describe('CatalogController', () => {
  it('loads the shop list', async () => {
    const controller = new CatalogController(
      new FakeApiClient({
        shops: {
          browse: async () => ({
            data: [{ id: 's1', shopName: 'Test Shop' }],
            meta: { totalCount: 1 },
          }),
        },
      })
    );

    await controller.loadShops();
    expect(controller.state.shops[0].shopName).toBe('Test Shop');
  });

  it('fetches a shop and its reviews together', async () => {
    const api = new FakeApiClient({
      shops: {
        detail: async () => ({
          id: 's1',
          shopName: 'Test Shop',
          menu: [{ id: 'i1', name: 'Khichuri' }],
        }),
        reviews: async () => ({ data: [{ id: 'r1', stars: 5 }] }),
      },
    });
    const controller = new CatalogController(api);

    await controller.loadShop('s1');
    expect(controller.state.shop.menu).toHaveLength(1);
    expect(controller.state.reviews).toHaveLength(1);
  });

  it('turns search results into models', async () => {
    const controller = new CatalogController(
      new FakeApiClient({
        shops: {
          search: async () => ({ items: [{ id: 'i1', name: 'Khichuri' }], shops: [] }),
        },
      })
    );

    await controller.search('khich');
    expect(controller.state.searchResults.items[0].name).toBe('Khichuri');

    controller.clearSearch();
    expect(controller.state.searchResults).toBeNull();
  });

  it('remembers the filters it was given', async () => {
    const api = new FakeApiClient({ shops: { browse: async () => ({ data: [], meta: {} }) } });
    const controller = new CatalogController(api);

    await controller.loadShops({ openOnly: true });
    expect(api.calls[0].args[0].openOnly).toBe('true');
  });
});

describe('OrderController', () => {
  it('keeps the confirmation PIN, which is shown exactly once', async () => {
    const controller = new OrderController(
      new FakeApiClient({
        orders: {
          place: async () => ({ order: { id: 'o1', reference: 'HJU-1' }, confirmPin: '4821' }),
        },
      })
    );

    const result = await controller.place({});
    expect(result.confirmPin).toBe('4821');
    expect(controller.state.confirmPin).toBe('4821');

    controller.dismissPin();
    expect(controller.state.confirmPin).toBeNull();
  });

  it('keeps the diff when checkout collides with a price change', async () => {
    const controller = new OrderController(
      new FakeApiClient({
        orders: {
          place: async () => {
            throw apiError({
              status: 409,
              message: 'Some items changed.',
              details: {
                priceChanges: [{ itemName: 'Khichuri', was: 55, now: 60 }],
                unavailable: [],
              },
            });
          },
        },
      })
    );

    expect(await controller.place({})).toBeNull();
    expect(controller.state.priceChanges.priceChanges[0].now).toBe(60);
  });

  it('loads the history into models', async () => {
    const controller = new OrderController(
      new FakeApiClient({
        orders: {
          history: async () => ({
            data: [{ id: 'o1', reference: 'HJU-1', status: ORDER_STATUS.DELIVERED }],
            meta: { totalCount: 1 },
          }),
        },
      })
    );

    await controller.loadHistory();
    expect(controller.state.orders[0].statusLabel).toBe('Delivered');
  });

  it('replaces the cancelled order in the list it is already showing', async () => {
    const controller = new OrderController(
      new FakeApiClient({
        orders: {
          history: async () => ({ data: [{ id: 'o1', status: ORDER_STATUS.PLACED }], meta: {} }),
          cancel: async () => ({ id: 'o1', status: ORDER_STATUS.CANCELLED }),
        },
      })
    );

    await controller.loadHistory();
    await controller.cancel('o1');

    expect(controller.state.orders[0].status).toBe(ORDER_STATUS.CANCELLED);
  });

  it('knows which ratings have already been left (BR-08)', async () => {
    const controller = new OrderController(
      new FakeApiClient({
        orders: { rate: async () => ({ id: 'r1', targetType: 'shop', stars: 5 }) },
      })
    );

    await controller.rate('o1', { targetType: 'shop', stars: 5 });
    expect(controller.hasRated('shop')).toBe(true);
    expect(controller.hasRated('rider')).toBe(false);
  });

  it('stops polling once the order reaches an end state', async () => {
    jest.useFakeTimers();
    try {
      const controller = new OrderController(
        new FakeApiClient({
          orders: {
            detail: async () => ({ id: 'o1', status: ORDER_STATUS.DELIVERED, isFinal: true }),
            ratings: async () => [],
          },
        })
      );

      controller.startTracking('o1');
      controller.stopTracking();
      // Nothing should be scheduled once tracking has stopped.
      expect(jest.getTimerCount()).toBe(0);
    } finally {
      jest.useRealTimers();
    }
  });
});

describe('DeliverController', () => {
  it('loads the open feed', async () => {
    const controller = new DeliverController(
      new FakeApiClient({
        deliveries: {
          available: async () => [
            {
              id: 'd1',
              status: DELIVERY_STATUS.AVAILABLE,
              earning: 25,
              pickup: { shopName: 'Test Shop' },
            },
          ],
        },
      })
    );

    await controller.loadFeed();
    expect(controller.state.available[0].pickup.shopName).toBe('Test Shop');
  });

  it('treats losing the race as news, not as an error', async () => {
    const controller = new DeliverController(
      new FakeApiClient({
        deliveries: {
          accept: async () => {
            throw apiError({
              status: 409,
              message: 'This order was just accepted by another delivery partner.',
            });
          },
          available: async () => [],
        },
      })
    );

    expect(await controller.accept('d1')).toBeNull();
    expect(controller.state.lostRace).toContain('another delivery partner');
    expect(controller.state.error).toBeNull();

    controller.dismissLostRace();
    expect(controller.state.lostRace).toBeNull();
  });

  it('refreshes the feed after a lost race, so the stale card disappears', async () => {
    const api = new FakeApiClient({
      deliveries: {
        accept: async () => {
          throw apiError({ status: 409, message: 'taken' });
        },
        available: async () => [],
      },
    });
    const controller = new DeliverController(api);

    await controller.accept('d1');
    expect(api.countOf('deliveries', 'available')).toBe(1);
  });

  it('clears the active delivery once it is completed', async () => {
    const controller = new DeliverController(
      new FakeApiClient({
        deliveries: {
          complete: async () => ({ id: 'd1', status: DELIVERY_STATUS.DELIVERED }),
          earnings: async () => ({ today: { count: 1, earnings: 25 }, history: [] }),
        },
      })
    );

    await controller.complete('d1', '4821');
    expect(controller.state.active).toBeNull();
    expect(controller.state.earnings.today.count).toBe(1);
  });
});

describe('VendorController', () => {
  /**
   * Builds a vendor controller with a shop already loaded.
   *
   * @param {object} handlers - Shop and order handlers.
   * @returns {Promise<{ controller: VendorController, api: FakeApiClient }>} The pair.
   */
  const withShop = async (handlers) => {
    const api = new FakeApiClient({
      shops: {
        mine: async () => ({
          id: 'shop-1',
          shopName: 'Test Shop',
          isOpen: true,
          approvalStatus: 'approved',
        }),
        menu: async () => [{ id: 'i1', name: 'Khichuri', price: 60, isAvailable: true }],
        ...handlers.shops,
      },
      orders: handlers.orders ?? {},
    });
    const controller = new VendorController(api);
    await controller.loadShop();
    return { controller, api };
  };

  it('loads the shop and its menu together', async () => {
    const { controller } = await withShop({});
    expect(controller.shop.shopName).toBe('Test Shop');
    expect(controller.state.menu).toHaveLength(1);
  });

  it('reports a vendor who has not registered a shop yet', async () => {
    const controller = new VendorController(
      new FakeApiClient({ shops: { mine: async () => null } })
    );
    await controller.loadShop();

    expect(controller.shop).toBeNull();
    expect(controller.state.loaded).toBe(true);
  });

  it('patches the menu in place when an item is toggled, so the tap feels instant', async () => {
    const { controller } = await withShop({
      shops: {
        setMenuItemAvailability: async () => ({
          id: 'i1',
          name: 'Khichuri',
          price: 60,
          isAvailable: false,
        }),
      },
    });

    await controller.setItemAvailability('i1', false);
    expect(controller.state.menu[0].isAvailable).toBe(false);
  });

  it('splits the board into its kanban columns', async () => {
    const { controller } = await withShop({
      shops: {
        board: async () => ({
          data: [
            { id: 'o1', status: ORDER_STATUS.PLACED },
            { id: 'o2', status: ORDER_STATUS.READY },
          ],
          meta: {},
        }),
      },
    });

    await controller.loadBoard();
    const columns = controller.columns();

    expect(columns.find((column) => column.status === ORDER_STATUS.PLACED).orders).toHaveLength(1);
    expect(columns.find((column) => column.status === ORDER_STATUS.ACCEPTED).orders).toHaveLength(
      0
    );
  });

  it('refreshes the board after accepting an order', async () => {
    const { controller, api } = await withShop({
      shops: { board: async () => ({ data: [], meta: {} }) },
      orders: { accept: async () => ({ id: 'o1' }) },
    });

    await controller.acceptOrder('o1');
    expect(api.countOf('shops', 'board')).toBe(1);
  });
});

describe('NotificationController', () => {
  it('keeps the last badge count when a refresh fails', async () => {
    let shouldFail = false;
    const controller = new NotificationController(
      new FakeApiClient({
        notifications: {
          unreadCount: async () => {
            if (shouldFail) {
              throw apiError({ status: 500 });
            }
            return { unread: 3 };
          },
        },
      })
    );

    await controller.refreshBadge();
    expect(controller.state.unread).toBe(3);

    shouldFail = true;
    // A badge that fails to refresh is not worth interrupting anyone over.
    expect(await controller.refreshBadge()).toBe(3);
    expect(controller.state.error).toBeNull();
  });

  it('reloads the list and the badge after marking everything read', async () => {
    const api = new FakeApiClient({
      notifications: {
        list: async () => ({ data: [], meta: {} }),
        unreadCount: async () => ({ unread: 0 }),
        markAllRead: async () => ({ marked: 3 }),
      },
    });
    const controller = new NotificationController(api);

    await controller.markAllRead();
    expect(api.countOf('notifications', 'list')).toBe(1);
    expect(controller.state.unread).toBe(0);
  });
});
