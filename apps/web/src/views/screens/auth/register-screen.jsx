'use client';

/**
 * @file Registration screen (FR-A1).
 *
 * @module views/screens/auth/register-screen
 */

import Link from 'next/link';
import { useState } from 'react';
import { USER_ROLE } from '@hungry-ju/shared/enums';
import { useControllerState, useRegistry } from '../../providers/app-provider.jsx';
import { Alert, Button, Card } from '../../ui/primitives.jsx';
import { Field, Input, Select } from '../../ui/form.jsx';
import { GenderSelect, HallSelect } from '../../ui/hall-select.jsx';

/** Roles a visitor may register as. Admin is absent on purpose — those accounts are seeded. */
const ROLE_OPTIONS = Object.freeze([
  { value: USER_ROLE.STUDENT, label: 'Student — order and deliver' },
  { value: USER_ROLE.VENDOR, label: 'Vendor — sell from a Bot Tola shop' },
]);

/**
 * The registration form.
 *
 * Hall and room are optional here even though an order needs them (FR-C6). Asking for
 * everything at sign-up is how a two-minute registration becomes a five-minute one that
 * nobody finishes; the checkout collects them if they are still missing.
 *
 * @returns {import('react').ReactNode} The screen.
 */
export function RegisterScreen() {
  const registry = useRegistry();
  const state = useControllerState(registry.session);
  const [form, setForm] = useState({
    fullName: '',
    email: '',
    phone: '',
    password: '',
    role: USER_ROLE.STUDENT,
    gender: '',
    hallName: '',
    roomNo: '',
  });
  const [result, setResult] = useState(null);

  /**
   * Updates one field.
   *
   * @param {string} field - Field name.
   * @returns {(value: string) => void} Change handler.
   */
  const set = (field) => (value) => setForm((current) => ({ ...current, [field]: value }));

  /**
   * Submits the registration.
   *
   * @param {import('react').FormEvent} event - Submit event.
   * @returns {Promise<void>} Resolves once the answer is in.
   */
  const submit = async (event) => {
    event.preventDefault();
    const payload = Object.fromEntries(Object.entries(form).filter(([, value]) => value !== ''));
    const created = await registry.session.register(payload);
    if (created) {
      setResult(created);
    }
  };

  if (result) {
    return (
      <div className="mx-auto max-w-md py-6">
        <Card title="Check your e-mail">
          <p className="text-ink-soft text-sm">
            We have sent a verification link to <strong>{form.email || form.phone}</strong>. Your
            account stays inactive until you use it (BR-02).
          </p>
          {result.verificationLink ? (
            <div className="bg-info-soft text-info mt-4 rounded-lg p-3 text-sm">
              <p className="font-semibold">Development mode</p>
              <p className="mt-1 break-all">
                No mail service is configured, so here is the link:{' '}
                <Link href={result.verificationLink} className="underline">
                  verify my account
                </Link>
              </p>
            </div>
          ) : null}
          <div className="mt-5">
            <Link href="/login" className="text-brand-600 text-sm hover:underline">
              Back to sign in
            </Link>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md py-6">
      <h1 className="mb-1 text-2xl font-bold">Create your account</h1>
      <p className="text-ink-soft mb-6 text-sm">
        Give an e-mail address or a phone number — either one works to sign in.
      </p>

      <Card>
        <form onSubmit={submit} noValidate>
          <Alert>{state.error}</Alert>

          <div className="mt-3">
            <Field label="I want to" required>
              {(id) => (
                <Select
                  id={id}
                  name="role"
                  value={form.role}
                  onChange={set('role')}
                  options={ROLE_OPTIONS}
                />
              )}
            </Field>
          </div>

          <Field label="Full name" required>
            {(id) => (
              <Input
                id={id}
                name="fullName"
                value={form.fullName}
                onChange={set('fullName')}
                autoComplete="name"
                required
              />
            )}
          </Field>

          <Field label="E-mail" hint="Used for the verification link.">
            {(id) => (
              <Input
                id={id}
                name="email"
                type="email"
                value={form.email}
                onChange={set('email')}
                placeholder="you@juniv.edu"
                autoComplete="email"
              />
            )}
          </Field>

          <Field label="Phone">
            {(id) => (
              <Input
                id={id}
                name="phone"
                value={form.phone}
                onChange={set('phone')}
                placeholder="01XXXXXXXXX"
                inputMode="tel"
                autoComplete="tel"
              />
            )}
          </Field>

          <Field
            label="Password"
            hint="At least 8 characters with upper and lower case, a digit, and a symbol."
            required
          >
            {(id) => (
              <Input
                id={id}
                name="password"
                type="password"
                value={form.password}
                onChange={set('password')}
                autoComplete="new-password"
                required
              />
            )}
          </Field>

          {form.role === USER_ROLE.STUDENT ? (
            <>
              <Field label="Gender" hint="JU halls are separate, so this decides your hall list.">
                {(id) => (
                  <GenderSelect
                    id={id}
                    value={form.gender}
                    onChange={(value) =>
                      // The hall belongs to the old list once the gender moves, so it goes
                      // rather than being submitted as a hall this student cannot live in.
                      setForm((current) => ({ ...current, gender: value, hallName: '' }))
                    }
                  />
                )}
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Hall" hint="You can add this later.">
                  {(id) => (
                    <HallSelect
                      id={id}
                      value={form.hallName}
                      gender={form.gender}
                      onChange={set('hallName')}
                    />
                  )}
                </Field>
                <Field label="Room / gate">
                  {(id) => (
                    <Input id={id} name="roomNo" value={form.roomNo} onChange={set('roomNo')} />
                  )}
                </Field>
              </div>
            </>
          ) : null}

          <Button type="submit" busy={Boolean(state.loading)} full>
            Create account
          </Button>
        </form>

        <p className="text-ink-soft mt-4 text-center text-sm">
          Already registered?{' '}
          <Link href="/login" className="text-brand-600 hover:underline">
            Sign in
          </Link>
        </p>
      </Card>
    </div>
  );
}
