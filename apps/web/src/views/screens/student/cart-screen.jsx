'use client';

/**
 * @file Cart and checkout (FR-C5, FR-C6, UC-01).
 *
 * @module views/screens/student/cart-screen
 */

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useControllerState, useRegistry, useSession } from '../../providers/app-provider.jsx';
import {
  Alert,
  Button,
  Card,
  EmptyState,
  Money,
  PageHeader,
  Spinner,
} from '../../ui/primitives.jsx';
import { Field, Input, QuantityStepper, Textarea } from '../../ui/form.jsx';

/**
 * The money lines, which FR-C5 requires to recalculate as the cart changes.
 *
 * @param {object} props - Component props.
 * @param {import('../../../models/cart-model.js').CartModel} props.cart - Cart to total.
 * @returns {import('react').ReactNode} The totals block.
 */
function CartTotals({ cart }) {
  return (
    <dl className="space-y-2 text-sm">
      <div className="flex justify-between">
        <dt className="text-ink-soft">Subtotal</dt>
        <dd>
          <Money amount={cart.subtotal} />
        </dd>
      </div>
      <div className="flex justify-between">
        <dt className="text-ink-soft">Delivery fee</dt>
        <dd>
          <Money amount={cart.deliveryFee} />
        </dd>
      </div>
      <div className="border-line flex justify-between border-t pt-2 text-base">
        <dt className="font-semibold">Total to pay in cash</dt>
        <dd>
          <Money amount={cart.total} bold />
        </dd>
      </div>
    </dl>
  );
}

/**
 * The cart, its checkout form, and the confirmation PIN.
 *
 * Checkout lives on the same screen as the cart rather than behind a second navigation:
 * the SRS targets a first order in under three minutes (NFR-08), and a step that exists
 * only to confirm what is already on screen is the easiest one to remove.
 *
 * @returns {import('react').ReactNode} The screen.
 */
export function CartScreen() {
  const registry = useRegistry();
  const router = useRouter();
  const { user } = useSession();
  const cartState = useControllerState(registry.cart);
  const orderState = useControllerState(registry.orders);

  const [hall, setHall] = useState(user?.hallName ?? '');
  const [room, setRoom] = useState(user?.roomNo ?? '');
  const [note, setNote] = useState('');
  const [syncedUser, setSyncedUser] = useState(user);

  useEffect(() => {
    void registry.cart.load();
  }, [registry]);

  // The session arrives after the first render, so the address fields are seeded from it
  // during render rather than in an effect — React's documented way to derive state from
  // a changed input without the extra render pass an effect would cost.
  if (user !== syncedUser) {
    setSyncedUser(user);
    setHall(user?.hallName ?? '');
    setRoom(user?.roomNo ?? '');
  }

  const cart = /** @type {import('../../../models/cart-model.js').CartModel} */ (cartState.cart);
  const placed = /** @type {{ reference: string, id: string } | null} */ (orderState.order);
  const pin = /** @type {string | null} */ (orderState.confirmPin);
  const priceChanges = /** @type {{ priceChanges?: object[], unavailable?: object[] } | null} */ (
    orderState.priceChanges
  );

  /**
   * Places the order.
   *
   * @param {import('react').FormEvent} event - Submit event.
   * @returns {Promise<void>} Resolves once the answer is in.
   */
  const checkout = async (event) => {
    event.preventDefault();
    const result = await registry.orders.place({
      deliveryHall: hall,
      deliveryRoom: room,
      note: note || undefined,
    });
    if (result) {
      await registry.cart.load({ silent: true });
    } else {
      // A rejected checkout usually means the cart moved underneath it; reload so the
      // student is looking at what the server actually holds (UC-01 alternate flow A1).
      await registry.cart.load({ silent: true });
    }
  };

  if (pin && placed) {
    return (
      <div className="mx-auto max-w-md py-6">
        <Card title="Order placed">
          <p className="text-ink-soft text-sm">
            Your order <strong>{placed.reference}</strong> is with the vendor.
          </p>

          <div className="border-brand-400 bg-brand-50 my-5 rounded-xl border-2 border-dashed p-5 text-center">
            <p className="text-brand-700 text-xs font-semibold tracking-wide uppercase">
              Delivery PIN
            </p>
            <p className="text-brand-700 mt-1 text-4xl font-bold tracking-[0.3em]">{pin}</p>
            <p className="text-brand-700 mt-2 text-xs">
              Read this out only when the food is in your hands. It is the proof that the delivery
              happened, and it is shown once.
            </p>
          </div>

          <div className="flex gap-2">
            <Button
              full
              onClick={() => {
                registry.orders.dismissPin();
                router.push(`/orders/${placed.id}`);
              }}
            >
              Track this order
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  if (cartState.loading && !cartState.loaded) {
    return (
      <div className="flex justify-center py-16">
        <Spinner label="Loading your cart…" />
      </div>
    );
  }

  if (cart.isEmpty) {
    return (
      <div>
        <PageHeader title="Your cart" />
        <EmptyState
          title="Your cart is empty"
          hint="Pick a shop and add something to get started."
          action={
            <Link
              href="/shops"
              className="bg-brand-600 rounded-lg px-4 py-2 text-sm font-semibold text-white"
            >
              Browse Bot Tola
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Your cart"
        subtitle={cart.shop ? `From ${cart.shop.shopName}` : undefined}
        action={
          <Button variant="ghost" onClick={() => registry.cart.clear()}>
            Clear cart
          </Button>
        }
      />

      <Alert>{cartState.error ?? orderState.error}</Alert>

      {priceChanges?.priceChanges?.length || priceChanges?.unavailable?.length ? (
        <Alert tone="pending">
          <div>
            <p className="font-semibold">Some items changed while you were ordering.</p>
            <ul className="mt-1 list-disc pl-5">
              {priceChanges.priceChanges?.map((change) => (
                <li key={change.menuItemId}>
                  {change.itemName}: was ৳{change.was}, now ৳{change.now}
                </li>
              ))}
              {priceChanges.unavailable?.map((gone) => (
                <li key={gone.menuItemId}>{gone.itemName} sold out and was removed</li>
              ))}
            </ul>
            <p className="mt-1">Check the cart and place the order again.</p>
          </div>
        </Alert>
      ) : null}

      <Card>
        <ul className="divide-line divide-y">
          {cart.items.map((line) => (
            <li key={line.menuItemId} className="flex items-center justify-between gap-4 py-3">
              <div className="min-w-0">
                <p className="font-medium">{line.itemName}</p>
                <p className="text-ink-soft text-sm">
                  <Money amount={line.unitPrice} /> each
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <QuantityStepper
                  value={line.quantity}
                  busy={Boolean(cartState.loading)}
                  onChange={(quantity) => registry.cart.updateQuantity(line.menuItemId, quantity)}
                  label={`Quantity of ${line.itemName}`}
                />
                <span className="w-16 text-right">
                  <Money amount={line.lineTotal} bold />
                </span>
              </div>
            </li>
          ))}
        </ul>

        <div className="border-line mt-4 border-t pt-4">
          <CartTotals cart={cart} />
        </div>
      </Card>

      <Card title="Where should it go?">
        <form onSubmit={checkout} noValidate>
          <div className="grid gap-x-3 sm:grid-cols-2">
            <Field label="Hall" required>
              {(id) => <Input id={id} name="hall" value={hall} onChange={setHall} required />}
            </Field>
            <Field label="Room / gate" required>
              {(id) => <Input id={id} name="room" value={room} onChange={setRoom} required />}
            </Field>
          </div>

          <Field label="Note for the vendor or rider" hint="Optional.">
            {(id) => (
              <Textarea
                id={id}
                name="note"
                value={note}
                onChange={setNote}
                placeholder="Call when you reach the gate"
              />
            )}
          </Field>

          <p className="bg-surface-soft text-ink-soft mb-4 rounded-lg px-3 py-2 text-sm">
            Payment is cash on delivery. You pay <Money amount={cart.total} bold /> to the delivery
            partner at the door.
          </p>

          <Button type="submit" busy={Boolean(orderState.loading)} full>
            Place order
          </Button>
        </form>
      </Card>
    </div>
  );
}
