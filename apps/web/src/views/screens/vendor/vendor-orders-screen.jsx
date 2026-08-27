'use client';

/**
 * @file The vendor order board (FR-B4, FR-B5, BR-11).
 *
 * @module views/screens/vendor/vendor-orders-screen
 */

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ORDER_STATUS } from '@hungry-ju/shared/enums';
import { useControllerState, useRegistry } from '../../providers/app-provider.jsx';
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  Modal,
  Money,
  PageHeader,
  Spinner,
} from '../../ui/primitives.jsx';
import { Field, Textarea } from '../../ui/form.jsx';

/**
 * Formats the seconds a vendor has left to answer.
 *
 * @param {number} seconds - Seconds remaining.
 * @returns {string} A `m:ss` countdown.
 */
function countdown(seconds) {
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, '0')}`;
}

/**
 * One order on the board.
 *
 * New orders carry a live countdown, because BR-11 auto-cancels an unanswered order and
 * a vendor who cannot see the clock will lose orders without ever knowing why.
 *
 * @param {object} props - Component props.
 * @param {import('../../../models/order-model.js').OrderModel} props.order - Order to show.
 * @param {boolean} props.busy - Whether an action is in flight.
 * @param {(orderId: string) => void} props.onAccept - Accepts the order.
 * @param {(order: object) => void} props.onReject - Opens the rejection dialog.
 * @param {(orderId: string, status: string) => void} props.onAdvance - Moves it forward.
 * @returns {import('react').ReactNode} The card.
 */
function BoardCard({ order, busy, onAccept, onReject, onAdvance }) {
  const next = order.vendorNextStep;
  const remaining = order.secondsUntilAcceptDeadline;

  return (
    <Card className="mb-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-semibold">{order.reference}</p>
          <p className="text-ink-soft text-sm">
            {order.destination} · {order.placedAt?.toLocaleTimeString() ?? ''}
          </p>
        </div>
        {order.awaitsVendor ? (
          <Badge tone={remaining < 60 ? 'failure' : 'pending'}>
            {remaining > 0 ? `${countdown(remaining)} to answer` : 'Expiring'}
          </Badge>
        ) : (
          <Badge tone={order.statusTone}>{order.statusLabel}</Badge>
        )}
      </div>

      <ul className="mt-3 space-y-1 text-sm">
        {order.items.map((line) => (
          <li key={line.id} className="flex justify-between">
            <span>
              {line.quantity}× {line.itemName}
            </span>
            <Money amount={line.lineTotal} />
          </li>
        ))}
      </ul>

      {order.note ? <p className="text-ink-soft mt-2 text-sm">Note: “{order.note}”</p> : null}

      <p className="border-line mt-2 border-t pt-2 text-sm">
        Food total <Money amount={order.subtotal} bold />
      </p>

      <div className="mt-3 flex flex-wrap gap-2">
        {order.awaitsVendor ? (
          <>
            <Button busy={busy} onClick={() => onAccept(order.id)}>
              Accept
            </Button>
            <Button variant="secondary" onClick={() => onReject(order)}>
              Reject
            </Button>
          </>
        ) : null}
        {next ? (
          <Button busy={busy} onClick={() => onAdvance(order.id, next.status)}>
            {next.label}
          </Button>
        ) : null}
        {order.status === ORDER_STATUS.READY ? (
          <span className="text-ink-soft self-center text-sm">Waiting for a delivery partner</span>
        ) : null}
      </div>
    </Card>
  );
}

/**
 * The kanban order board.
 *
 * @returns {import('react').ReactNode} The screen.
 */
export function VendorOrdersScreen() {
  const registry = useRegistry();
  const state = useControllerState(registry.vendor);
  const [rejecting, setRejecting] = useState(null);
  const [reason, setReason] = useState('');

  useEffect(() => {
    void (async () => {
      const shop = await registry.vendor.loadShop();
      if (shop) {
        registry.vendor.startBoard();
      }
    })();
    return () => registry.vendor.stopBoard();
  }, [registry]);

  const shop = /** @type {import('../../../models/shop-model.js').ShopModel | null} */ (state.shop);

  if (!state.loaded) {
    return (
      <div className="flex justify-center py-16">
        <Spinner label="Loading your shop…" />
      </div>
    );
  }

  if (!shop) {
    return (
      <EmptyState
        title="Register your shop first"
        hint="An admin approves it before students can order."
        action={
          <Link
            href="/vendor/shop"
            className="bg-brand-600 rounded-lg px-4 py-2 text-sm font-semibold text-white"
          >
            Register shop
          </Link>
        }
      />
    );
  }

  const columns = registry.vendor.columns();
  const total = columns.reduce((sum, column) => sum + column.orders.length, 0);

  return (
    <div>
      <PageHeader
        title="Orders"
        subtitle={`${shop.shopName} · ${shop.isOpen ? 'open' : 'closed'}`}
        action={
          <Button
            variant={shop.isOpen ? 'secondary' : 'primary'}
            busy={Boolean(state.loading)}
            onClick={() => registry.vendor.setOpen(!shop.isOpen)}
          >
            {shop.isOpen ? 'Close shop' : 'Open shop'}
          </Button>
        }
      />

      {!shop.isApproved ? (
        <Alert tone="pending">
          Your shop is {shop.approvalStatus}. Students cannot order until an admin approves it.
          {shop.decisionReason ? ` Reason: ${shop.decisionReason}` : ''}
        </Alert>
      ) : null}

      <Alert>{state.error}</Alert>

      {total === 0 ? (
        <EmptyState
          title="No live orders"
          hint="New orders appear here on their own — no need to refresh."
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {columns.map((column) => (
            <section key={column.status}>
              <h2 className="text-ink-soft mb-2 flex items-center gap-2 text-sm font-semibold tracking-wide uppercase">
                {column.label}
                <span className="bg-surface-soft rounded-full px-2 py-0.5 text-xs">
                  {column.orders.length}
                </span>
              </h2>
              {column.orders.length === 0 ? (
                <p className="border-line text-ink-soft rounded-lg border border-dashed px-3 py-4 text-center text-sm">
                  Nothing here
                </p>
              ) : (
                column.orders.map((order) => (
                  <BoardCard
                    key={order.id}
                    order={order}
                    busy={Boolean(state.loading)}
                    onAccept={(id) => registry.vendor.acceptOrder(id)}
                    onReject={(target) => {
                      setRejecting(target);
                      setReason('');
                    }}
                    onAdvance={(id, status) => registry.vendor.advanceOrder(id, status)}
                  />
                ))
              )}
            </section>
          ))}
        </div>
      )}

      <Modal
        open={Boolean(rejecting)}
        title="Reject this order?"
        onDismiss={() => setRejecting(null)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setRejecting(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              busy={Boolean(state.loading)}
              onClick={async () => {
                await registry.vendor.rejectOrder(rejecting.id, reason);
                setRejecting(null);
              }}
            >
              Reject order
            </Button>
          </>
        }
      >
        <Field label="Reason" hint="The student sees this." required>
          {(id) => (
            <Textarea
              id={id}
              name="reason"
              value={reason}
              onChange={setReason}
              rows={2}
              placeholder="Out of beef today"
            />
          )}
        </Field>
      </Modal>
    </div>
  );
}
