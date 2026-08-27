'use client';

/**
 * @file The application frame: header, navigation, and route guards.
 *
 * @module views/layout/app-shell
 */

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { USER_ROLE } from '@hungry-ju/shared/enums';
import { useControllerState, useRegistry, useSession } from '../providers/app-provider.jsx';
import { Badge, Spinner } from '../ui/primitives.jsx';

/** Navigation offered to each role, so the header is built from data rather than from JSX branches. */
const NAV_BY_ROLE = Object.freeze({
  [USER_ROLE.STUDENT]: [
    { href: '/shops', label: 'Browse' },
    { href: '/cart', label: 'Cart' },
    { href: '/orders', label: 'Orders' },
    { href: '/deliver', label: 'Deliver' },
    { href: '/profile', label: 'Profile' },
  ],
  [USER_ROLE.VENDOR]: [
    { href: '/vendor/orders', label: 'Orders' },
    { href: '/vendor/menu', label: 'Menu' },
    { href: '/vendor/shop', label: 'Shop' },
    { href: '/vendor/analytics', label: 'Analytics' },
  ],
  [USER_ROLE.ADMIN]: [
    { href: '/admin/vendors', label: 'Vendors' },
    { href: '/admin/orders', label: 'Orders' },
    { href: '/admin/users', label: 'Users' },
    { href: '/admin/analytics', label: 'Analytics' },
    { href: '/admin/settings', label: 'Settings' },
  ],
});

/**
 * The header, its navigation, and the cart and notification badges.
 *
 * @returns {import('react').ReactNode} The header.
 */
function AppHeader() {
  const registry = useRegistry();
  const router = useRouter();
  const pathname = usePathname();
  const { user } = useSession();
  const cartState = useControllerState(registry.cart);
  const notificationState = useControllerState(registry.notifications);

  useEffect(() => {
    if (!user) {
      return undefined;
    }
    registry.notifications.startPolling();
    if (user.isStudent) {
      void registry.cart.load({ silent: true });
    }
    return () => registry.notifications.stopPolling();
  }, [registry, user]);

  const links = user ? (NAV_BY_ROLE[user.role] ?? []) : [];
  const cartCount = /** @type {import('../../models/cart-model.js').CartModel} */ (cartState.cart)
    .itemCount;

  /**
   * Signs out and returns to the sign-in screen.
   *
   * @returns {Promise<void>} Resolves once signed out.
   */
  const signOut = async () => {
    await registry.session.logout();
    router.push('/login');
  };

  return (
    <header className="border-line bg-surface sticky top-0 z-40 border-b">
      <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-3">
        <Link href={user ? user.homeRoute : '/'} className="text-brand-600 text-lg font-bold">
          Hungry_JU
        </Link>

        {user ? (
          <>
            <nav className="scroll-x ml-auto flex items-center gap-1" aria-label="Main">
              {links.map((link) => {
                const active = pathname.startsWith(link.href);
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    className={`relative rounded-lg px-3 py-1.5 text-sm font-medium whitespace-nowrap ${active ? 'bg-brand-50 text-brand-700' : 'text-ink-soft hover:bg-surface-soft'}`}
                  >
                    {link.label}
                    {link.label === 'Cart' && cartCount > 0 ? (
                      <span className="bg-brand-600 ml-1 rounded-full px-1.5 text-xs text-white">
                        {cartCount}
                      </span>
                    ) : null}
                  </Link>
                );
              })}
            </nav>

            <Link
              href="/notifications"
              aria-label="Notifications"
              className="text-ink-soft hover:bg-surface-soft relative rounded-lg px-2 py-1.5 text-sm"
            >
              🔔
              {Number(notificationState.unread) > 0 ? (
                <span className="bg-bad absolute -top-0.5 -right-0.5 rounded-full px-1.5 text-[10px] font-bold text-white">
                  {notificationState.unread}
                </span>
              ) : null}
            </Link>

            <button
              type="button"
              onClick={signOut}
              className="text-ink-soft hover:bg-surface-soft rounded-lg px-3 py-1.5 text-sm whitespace-nowrap"
            >
              Sign out
            </button>
          </>
        ) : (
          <nav className="ml-auto flex items-center gap-2" aria-label="Main">
            <Link href="/login" className="rounded-lg px-3 py-1.5 text-sm font-medium">
              Sign in
            </Link>
            <Link
              href="/register"
              className="bg-brand-600 rounded-lg px-3 py-1.5 text-sm font-semibold text-white"
            >
              Register
            </Link>
          </nav>
        )}
      </div>
    </header>
  );
}

/**
 * The page frame every route renders inside.
 *
 * @param {object} props - Component props.
 * @param {import('react').ReactNode} props.children - Page content.
 * @returns {import('react').ReactNode} The shell.
 */
export function AppShell({ children }) {
  return (
    <div className="flex min-h-full flex-col">
      <AppHeader />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">{children}</main>
      <footer className="border-line text-ink-soft border-t px-4 py-6 text-center text-xs">
        Hungry_JU — campus food ordering and peer delivery, Jahangirnagar University.
      </footer>
    </div>
  );
}

/**
 * Refuses a page to anyone who may not see it.
 *
 * This is a convenience, not a security control: the API enforces the same rules
 * server-side on every request, because hiding a button has never stopped anyone from
 * calling an endpoint (SRS section 9).
 *
 * @param {object} props - Component props.
 * @param {import('react').ReactNode} props.children - Guarded content.
 * @param {string[]} [props.roles] - Roles allowed through; omit to require only a session.
 * @returns {import('react').ReactNode} The content, or a placeholder while redirecting.
 */
export function RoleGuard({ children, roles = [] }) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, ready } = useSession();

  useEffect(() => {
    if (!ready) {
      return;
    }
    if (!user) {
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
      return;
    }
    if (roles.length > 0 && !roles.includes(user.role)) {
      router.replace(user.homeRoute);
    }
  }, [ready, user, roles, router, pathname]);

  if (!ready) {
    return (
      <div className="flex justify-center py-16">
        <Spinner label="Restoring your session…" />
      </div>
    );
  }
  if (!user || (roles.length > 0 && !roles.includes(user.role))) {
    return (
      <div className="text-ink-soft py-16 text-center text-sm">
        <Badge tone="pending">Redirecting…</Badge>
      </div>
    );
  }
  return children;
}
