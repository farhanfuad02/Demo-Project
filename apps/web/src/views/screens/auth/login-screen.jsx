'use client';

/**
 * @file Sign-in screen (FR-A4).
 *
 * @module views/screens/auth/login-screen
 */

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { useControllerState, useRegistry } from '../../providers/app-provider.jsx';
import { Alert, Button, Card } from '../../ui/primitives.jsx';
import { Field, Input } from '../../ui/form.jsx';

/**
 * The sign-in form.
 *
 * One field accepts either an e-mail address or a phone number, because FR-A4 lets an
 * account be identified by whichever the user actually remembers — asking them to pick
 * first would be a choice with no right answer.
 *
 * @returns {import('react').ReactNode} The screen.
 */
export function LoginScreen() {
  const registry = useRegistry();
  const router = useRouter();
  const searchParams = useSearchParams();
  const state = useControllerState(registry.session);

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');

  /**
   * Signs in and continues to wherever the user was headed.
   *
   * @param {import('react').FormEvent} event - Submit event.
   * @returns {Promise<void>} Resolves once the navigation is queued.
   */
  const submit = async (event) => {
    event.preventDefault();
    const user = await registry.session.login(identifier, password);
    if (user) {
      router.replace(searchParams.get('next') || user.homeRoute);
    }
  };

  return (
    <div className="mx-auto max-w-md py-6">
      <h1 className="mb-1 text-2xl font-bold">Welcome back</h1>
      <p className="text-ink-soft mb-6 text-sm">Order from Bot Tola without leaving your hall.</p>

      <Card>
        <form onSubmit={submit} noValidate>
          <Alert>{state.error}</Alert>

          <div className="mt-3">
            <Field label="E-mail or phone" required>
              {(id) => (
                <Input
                  id={id}
                  name="identifier"
                  value={identifier}
                  onChange={setIdentifier}
                  placeholder="you@juniv.edu or 01XXXXXXXXX"
                  autoComplete="username"
                  required
                />
              )}
            </Field>
          </div>

          <Field label="Password" required>
            {(id) => (
              <Input
                id={id}
                name="password"
                type="password"
                value={password}
                onChange={setPassword}
                autoComplete="current-password"
                required
              />
            )}
          </Field>

          <Button type="submit" busy={Boolean(state.loading)} full>
            Sign in
          </Button>
        </form>

        <div className="mt-4 flex justify-between text-sm">
          <Link href="/forgot-password" className="text-brand-600 hover:underline">
            Forgot password?
          </Link>
          <Link href="/register" className="text-brand-600 hover:underline">
            Create an account
          </Link>
        </div>
      </Card>
    </div>
  );
}
