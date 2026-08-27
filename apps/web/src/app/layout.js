/**
 * @file Root layout: the single HTML document shell for every route.
 *
 * @module app/layout
 */

import { Geist, Geist_Mono } from 'next/font/google';
import '../styles/globals.css';
import { AppProvider } from '../views/providers/app-provider.jsx';
import { AppShell } from '../views/layout/app-shell.jsx';

/** Variable sans-serif face, self-hosted and hashed at build time. */
const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin'] });

/** Variable monospace face, used for figures that need to line up. */
const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] });

/**
 * Document metadata applied to every route unless a segment overrides it.
 *
 * @type {import('next').Metadata}
 */
export const metadata = {
  title: 'Hungry_JU — campus food ordering and peer delivery',
  description:
    'Order from the Bot Tola vendors at Jahangirnagar University and have a classmate deliver it.',
};

/**
 * Viewport settings.
 *
 * Zoom is left enabled deliberately: locking it is a common way to make a mobile layout
 * look tidy and an accessibility failure at the same time (NFR-09).
 *
 * @type {import('next').Viewport}
 */
export const viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#ea580c',
};

/**
 * Renders the document shell every route lives inside.
 *
 * The provider wraps the shell rather than each page, so the session, the cart, and the
 * notification badge survive navigation instead of being rebuilt on every route change.
 *
 * @param {object} props - Component props.
 * @param {import('react').ReactNode} props.children - Active route segment.
 * @returns {import('react').ReactNode} The document shell.
 */
export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full">
        <AppProvider>
          <AppShell>{children}</AppShell>
        </AppProvider>
      </body>
    </html>
  );
}
