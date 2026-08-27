'use client';

/**
 * @file Account verification screen (FR-A2).
 *
 * @module views/screens/auth/verify-screen
 */

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useRegistry } from '../../providers/app-provider.jsx';
import { Alert, Card, Spinner } from '../../ui/primitives.jsx';

/**
 * Consumes the token from the verification link.
 *
 * The token is used once, on mount, and the outcome is shown either way — a link that
 * has already been used looks identical to a wrong one from here, and saying so plainly
 * is more useful than a spinner that never resolves.
 *
 * @returns {import('react').ReactNode} The screen.
 */
export function VerifyScreen() {
  const registry = useRegistry();
  const token = useSearchParams().get('token');
  // A link with no token is decided during render: there is nothing to wait for, and a
  // spinner that resolves to an error a tick later is worse than the error itself.
  const [status, setStatus] = useState(token ? 'working' : 'failed');
  const [message, setMessage] = useState(
    token ? '' : 'This link is missing its verification token.'
  );

  useEffect(() => {
    if (!token) {
      return;
    }
    void (async () => {
      const verified = await registry.session.verify(token);
      if (verified) {
        setStatus('done');
      } else {
        setStatus('failed');
        setMessage(
          /** @type {string} */ (registry.session.state.error) ??
            'This link is invalid or has already been used.'
        );
      }
    })();
  }, [registry, token]);

  return (
    <div className="mx-auto max-w-md py-10">
      <Card title="Account verification">
        {status === 'working' ? <Spinner label="Verifying your account…" /> : null}

        {status === 'done' ? (
          <div>
            <Alert tone="success">Your account is active. You can sign in now.</Alert>
            <Link
              href="/login"
              className="text-brand-600 mt-4 inline-block text-sm hover:underline"
            >
              Go to sign in
            </Link>
          </div>
        ) : null}

        {status === 'failed' ? (
          <div>
            <Alert>{message}</Alert>
            <Link
              href="/login"
              className="text-brand-600 mt-4 inline-block text-sm hover:underline"
            >
              Back to sign in
            </Link>
          </div>
        ) : null}
      </Card>
    </div>
  );
}
