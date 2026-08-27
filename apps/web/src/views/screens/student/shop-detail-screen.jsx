'use client';

/**
 * @file One shop, its menu, and the add-to-cart controls (HJU-C02, FR-C4).
 *
 * @module views/screens/student/shop-detail-screen
 */

import Link from 'next/link';
import { useEffect } from 'react';
import { MenuItemModel } from '../../../models/shop-model.js';
import { useControllerState, useRegistry, useSession } from '../../providers/app-provider.jsx';
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  Modal,
  Money,
  Spinner,
} from '../../ui/primitives.jsx';
import { QuantityStepper } from '../../ui/form.jsx';

/**
 * One dish, with either an Add button or a stepper depending on what the cart holds.
 *
 * Sold-out items stay visible but greyed with no Add control, which is what HJU-C02's
 * AC-02 asks for: hiding them would leave a student wondering whether the shop stopped
 * selling their usual order.
 *
 * @param {object} props - Component props.
 * @param {MenuItemModel} props.item - Dish to show.
 * @param {number} props.inCart - How many are already in the cart.
 * @param {boolean} props.canOrder - Whether the shop is taking orders.
 * @param {boolean} props.busy - Whether a cart change is in flight.
 * @param {(item: MenuItemModel) => void} props.onAdd - Adds one.
 * @param {(item: MenuItemModel, quantity: number) => void} props.onChange - Sets the quantity.
 * @returns {import('react').ReactNode} The menu row.
 */
function MenuRow({ item, inCart, canOrder, busy, onAdd, onChange }) {
  const unavailable = !item.isAvailable;

  return (
    <li
      className={`border-line flex items-start justify-between gap-4 border-b py-3 last:border-0 ${unavailable ? 'opacity-55' : ''}`}
    >
      <div className="min-w-0">
        <p className="font-medium">
          {item.name}
          {unavailable ? (
            <span className="ml-2">
              <Badge tone="neutral">Sold out</Badge>
            </span>
          ) : null}
        </p>
        {item.description ? (
          <p className="text-ink-soft mt-0.5 text-sm">{item.description}</p>
        ) : null}
        <p className="mt-1 text-sm">
          <Money amount={item.price} bold />
          {item.prepTimeMin ? (
            <span className="text-ink-soft ml-2">· about {item.prepTimeMin} min</span>
          ) : null}
        </p>
      </div>

      <div className="shrink-0">
        {unavailable || !canOrder ? null : inCart > 0 ? (
          <QuantityStepper
            value={inCart}
            busy={busy}
            onChange={(quantity) => onChange(item, quantity)}
            label={`Quantity of ${item.name}`}
          />
        ) : (
          <Button variant="secondary" busy={busy} onClick={() => onAdd(item)}>
            Add
          </Button>
        )}
      </div>
    </li>
  );
}

/**
 * The shop detail screen.
 *
 * @param {object} props - Component props.
 * @param {string} props.shopId - Shop to show.
 * @returns {import('react').ReactNode} The screen.
 */
export function ShopDetailScreen({ shopId }) {
  const registry = useRegistry();
  const { user } = useSession();
  const catalogState = useControllerState(registry.catalog);
  const cartState = useControllerState(registry.cart);

  useEffect(() => {
    void registry.catalog.loadShop(shopId);
    if (user?.isStudent) {
      void registry.cart.load({ silent: true });
    }
  }, [registry, shopId, user]);

  const shop = /** @type {import('../../../models/shop-model.js').ShopModel | null} */ (
    catalogState.shop
  );
  const cart = /** @type {import('../../../models/cart-model.js').CartModel} */ (cartState.cart);
  const conflict = /** @type {{ message: string } | null} */ (cartState.conflict);

  if (!shop) {
    return (
      <div className="flex justify-center py-16">
        {catalogState.error ? <Alert>{catalogState.error}</Alert> : <Spinner label="Loading…" />}
      </div>
    );
  }

  const canOrder = shop.canReceiveOrders && Boolean(user?.isStudent);
  const grouped = MenuItemModel.groupByCategory(shop.menu);

  return (
    <div>
      <Link href="/shops" className="text-brand-600 text-sm hover:underline">
        ← All shops
      </Link>

      <header className="mt-3 mb-5">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold">{shop.shopName}</h1>
          <Badge tone={shop.isOpen ? 'success' : 'neutral'}>
            {shop.isOpen ? 'Open' : 'Closed'}
          </Badge>
        </div>
        <p className="text-ink-soft mt-1 text-sm">
          {shop.location}
          {shop.operatingHours ? ` · ${shop.operatingHours}` : ''} · ★ {shop.ratingLabel}
        </p>
      </header>

      {shop.closedReason ? <Alert tone="pending">{shop.closedReason}</Alert> : null}
      {!user ? (
        <Alert tone="progress">
          <Link href="/login" className="underline">
            Sign in
          </Link>{' '}
          to add items to a cart.
        </Alert>
      ) : null}
      <Alert>{cartState.error}</Alert>

      <div className="mt-4 space-y-4">
        {grouped.length === 0 ? (
          <EmptyState title="This shop has not added any dishes yet" />
        ) : (
          grouped.map((group) => (
            <Card key={group.category} title={group.category}>
              <ul>
                {group.items.map((item) => (
                  <MenuRow
                    key={item.id}
                    item={item}
                    inCart={cart.quantityOf(item.id)}
                    canOrder={canOrder}
                    busy={Boolean(cartState.loading)}
                    onAdd={(added) => registry.cart.addItem(added)}
                    onChange={(changed, quantity) =>
                      registry.cart.updateQuantity(changed.id, quantity)
                    }
                  />
                ))}
              </ul>
            </Card>
          ))
        )}
      </div>

      {cart.itemCount > 0 ? (
        <div className="sticky bottom-4 mt-6">
          <Link
            href="/cart"
            className="bg-brand-600 flex items-center justify-between rounded-xl px-4 py-3 text-white shadow-lg"
          >
            <span className="font-semibold">
              {cart.itemCount} item{cart.itemCount === 1 ? '' : 's'} in cart
            </span>
            <span className="font-semibold">
              <Money amount={cart.subtotal} /> · View cart →
            </span>
          </Link>
        </div>
      ) : null}

      <Modal
        open={Boolean(conflict)}
        title="Start a new cart?"
        onDismiss={() => registry.cart.dismissConflict()}
        footer={
          <>
            <Button variant="secondary" onClick={() => registry.cart.dismissConflict()}>
              Keep my cart
            </Button>
            <Button onClick={() => registry.cart.resolveConflict()}>Clear and add</Button>
          </>
        }
      >
        {conflict?.message} A cart can only hold items from one vendor, so adding this will empty
        the current one.
      </Modal>
    </div>
  );
}
