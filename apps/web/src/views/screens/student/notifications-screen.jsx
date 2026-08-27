'use client';

/**
 * @file Notification history (FR-E4).
 *
 * @module views/screens/student/notifications-screen
 */

import Link from 'next/link';
import { useEffect } from 'react';
import { useControllerState, useRegistry } from '../../providers/app-provider.jsx';
import { Alert, Button, EmptyState, PageHeader, Spinner } from '../../ui/primitives.jsx';

/**
 * The notification list.
 *
 * @returns {import('react').ReactNode} The screen.
 */
export function NotificationsScreen() {
  const registry = useRegistry();
  const state = useControllerState(registry.notifications);

  useEffect(() => {
    void registry.notifications.load();
  }, [registry]);

  const notifications =
    /** @type {import('../../../models/notification-model.js').NotificationModel[]} */ (
      state.notifications
    );
  const hasUnread = notifications.some((notification) => !notification.isRead);

  return (
    <div>
      <PageHeader
        title="Notifications"
        subtitle="Every update on your orders, in one place."
        action={
          hasUnread ? (
            <Button variant="secondary" onClick={() => registry.notifications.markAllRead()}>
              Mark all read
            </Button>
          ) : null
        }
      />

      <Alert>{state.error}</Alert>

      {state.loading && notifications.length === 0 ? (
        <div className="flex justify-center py-10">
          <Spinner label="Loading…" />
        </div>
      ) : notifications.length === 0 ? (
        <EmptyState
          title="Nothing yet"
          hint="You will hear from us when an order changes status."
        />
      ) : (
        <ul className="space-y-2">
          {notifications.map((notification) => {
            const body = (
              <div
                className={`rounded-xl border p-4 ${notification.isRead ? 'border-line bg-surface' : 'border-brand-200 bg-brand-50'}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <p className="font-medium">{notification.title}</p>
                  <span className="text-ink-soft shrink-0 text-xs">
                    {notification.relativeTime}
                  </span>
                </div>
                <p className="text-ink-soft mt-1 text-sm">{notification.body}</p>
              </div>
            );

            return (
              <li key={notification.id}>
                {notification.relatedOrderId ? (
                  <Link
                    href={`/orders/${notification.relatedOrderId}`}
                    onClick={() => registry.notifications.markRead(notification.id)}
                    className="block"
                  >
                    {body}
                  </Link>
                ) : (
                  <button
                    type="button"
                    onClick={() => registry.notifications.markRead(notification.id)}
                    className="block w-full text-left"
                  >
                    {body}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
