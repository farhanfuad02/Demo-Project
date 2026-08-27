'use client';

/**
 * @file The two halves of the password-reset flow (FR-A5).
 *
 * @module views/screens/auth/password-screens
 */

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { useControllerState, useRegistry } from '../../providers/app-provider.jsx';
import { Alert, Button, Card } from '../../ui/primitives.jsx';
import { Field, Input } from '../../ui/form.jsx';

/**
 * Asks for a reset link.
 *
 * The confirmation is identical whether or not the account exists. That is not vagueness
 * for its own sake: an endpoint that answers differently is a way to find out who has an
 * account here, and this one refuses to be (SRS section 9).
 *
 * @returns {import('react').ReactNode} The screen.
 */
export function ForgotPasswordScreen() {
  const registry = useRegistry();
  const state = useControllerState(registry.session);
  const [identifier, setIdentifier] = useState('');
  const [sent, setSent] = useState(null);

  /**
   * Requests the reset link.
   *
   * @param {import('react').FormEvent} event - Submit event.
   * @returns {Promise<void>} Resolves once the request is answered.
   */
  const submit = async (event) => {
    event.preventDefault();
    const result = await registry.session.forgotPassword(identifier);
    if (result) {
      setSent(result);
    }
  };

  return (
    <div className="mx-auto max-w-md py-6">
      <h1 className="mb-1 text-2xl font-bold">Forgot your password?</h1>
      <p className="text-ink-soft mb-6 text-sm">
        We will send a reset link to the contact method on your account.
      </p>

      <Card>
        {sent ? (
          <div>
            <Alert tone="success">
              If that account exists, a reset link is on its way. It expires in 15 minutes and works
              once.
            </Alert>
            {sent.resetLink ? (
              <div className="bg-info-soft text-info mt-4 rounded-lg p-3 text-sm">
                <p className="font-semibold">Development mode</p>
                <p className="mt-1 break-all">
                  <Link href={sent.resetLink} className="underline">
                    Open the reset link
                  </Link>
                </p>
              </div>
            ) : null}
          </div>
        ) : (
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
                    autoComplete="username"
                    required
                  />
                )}
              </Field>
            </div>
            <Button type="submit" busy={Boolean(state.loading)} full>
              Send reset link
            </Button>
          </form>
        )}

        <p className="mt-4 text-center text-sm">
          <Link href="/login" className="text-brand-600 hover:underline">
            Back to sign in
          </Link>
        </p>
      </Card>
    </div>
  );
}

/**
 * Sets a new password from a reset link.
 *
 * @returns {import('react').ReactNode} The screen.
 */
export function ResetPasswordScreen() {
  const registry = useRegistry();
  const router = useRouter();
  const token = useSearchParams().get('token') ?? '';
  const state = useControllerState(registry.session);
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [mismatch, setMismatch] = useState(false);

  /**
   * Applies the new password and returns to sign-in.
   *
   * @param {import('react').FormEvent} event - Submit event.
   * @returns {Promise<void>} Resolves once the navigation is queued.
   */
  const submit = async (event) => {
    event.preventDefault();
    if (password !== confirmation) {
      setMismatch(true);
      return;
    }
    setMismatch(false);
    const done = await registry.session.resetPassword(token, password);
    if (done) {
      router.replace('/login');
    }
  };

  return (
    <div className="mx-auto max-w-md py-6">
      <h1 className="mb-1 text-2xl font-bold">Choose a new password</h1>
      <p className="text-ink-soft mb-6 text-sm">
        Every signed-in session ends when your password changes.
      </p>

      <Card>
        <form onSubmit={submit} noValidate>
          <Alert>{state.error}</Alert>

          <div className="mt-3">
            <Field
              label="New password"
              hint="At least 8 characters with upper and lower case, a digit, and a symbol."
              required
            >
              {(id) => (
                <Input
                  id={id}
                  name="password"
                  type="password"
                  value={password}
                  onChange={setPassword}
                  autoComplete="new-password"
                  required
                />
              )}
            </Field>
          </div>

          <Field
            label="Repeat password"
            error={mismatch ? 'The two passwords do not match.' : undefined}
            required
          >
            {(id) => (
              <Input
                id={id}
                name="confirmation"
                type="password"
                value={confirmation}
                onChange={setConfirmation}
                autoComplete="new-password"
                required
              />
            )}
          </Field>

          <Button type="submit" busy={Boolean(state.loading)} full>
            Change password
          </Button>
        </form>
      </Card>
    </div>
  );
}
