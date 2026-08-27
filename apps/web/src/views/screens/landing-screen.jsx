'use client';

/**
 * @file The public landing page.
 *
 * @module views/screens/landing-screen
 */

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useSession } from '../providers/app-provider.jsx';
import { Card, Spinner } from '../ui/primitives.jsx';

/** What the platform does, in the three sentences a first-time visitor will read. */
const PITCH = Object.freeze([
  {
    title: 'Order from Bot Tola',
    body: 'Browse every approved stall, see live prices, and order without walking there or queueing between classes.',
  },
  {
    title: 'A classmate delivers',
    body: 'Students on their way past pick up your order. You pay cash at the door and confirm with a PIN.',
  },
  {
    title: 'Earn between classes',
    body: 'Switch on deliver mode when you are free and keep the delivery fee on every order you carry.',
  },
]);

/**
 * The landing page.
 *
 * A signed-in visitor never sees it: they are sent to whichever dashboard their role
 * implies (FR-A7), because a marketing page is not what someone with an order in
 * progress opened the app for.
 *
 * @returns {import('react').ReactNode} The screen.
 */
export function LandingScreen() {
  const router = useRouter();
  const { user, ready } = useSession();

  useEffect(() => {
    if (ready && user) {
      router.replace(user.homeRoute);
    }
  }, [ready, user, router]);

  if (!ready) {
    return (
      <div className="flex justify-center py-16">
        <Spinner label="Loading…" />
      </div>
    );
  }

  return (
    <div className="py-6">
      <section className="mb-10 text-center">
        <h1 className="text-3xl font-bold sm:text-4xl">
          Campus food, delivered by <span className="text-brand-600">your classmates</span>
        </h1>
        <p className="text-ink-soft mx-auto mt-3 max-w-xl">
          Hungry_JU connects Jahangirnagar University students with the Bot Tola vendor cluster —
          and pays students to make the trip.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Link
            href="/register"
            className="bg-brand-600 rounded-lg px-5 py-2.5 text-sm font-semibold text-white"
          >
            Create an account
          </Link>
          <Link
            href="/shops"
            className="border-line rounded-lg border px-5 py-2.5 text-sm font-semibold"
          >
            Browse the shops
          </Link>
        </div>
      </section>

      <div className="grid gap-4 sm:grid-cols-3">
        {PITCH.map((item) => (
          <Card key={item.title} title={item.title}>
            <p className="text-ink-soft text-sm">{item.body}</p>
          </Card>
        ))}
      </div>
    </div>
  );
}
