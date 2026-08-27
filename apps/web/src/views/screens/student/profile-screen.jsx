'use client';

/**
 * @file Profile and delivery address (FR-A8).
 *
 * @module views/screens/student/profile-screen
 */

import { useState } from 'react';
import { useControllerState, useRegistry, useSession } from '../../providers/app-provider.jsx';
import { Alert, Button, Card, PageHeader, Stat } from '../../ui/primitives.jsx';
import { Field, Input } from '../../ui/form.jsx';

/**
 * The profile screen: identity, delivery address, and rider standing.
 *
 * The two forms are separate because they answer different questions and fail
 * independently — a rejected phone number should not discard a hall the student just
 * typed.
 *
 * @returns {import('react').ReactNode} The screen.
 */
export function ProfileScreen() {
  const registry = useRegistry();
  const { user } = useSession();
  const state = useControllerState(registry.session);

  const [profile, setProfile] = useState({ fullName: '', phone: '' });
  const [location, setLocation] = useState({ hallName: '', roomNo: '' });
  const [saved, setSaved] = useState('');
  const [syncedUser, setSyncedUser] = useState(null);

  // Seeded during render rather than from an effect: the session arrives asynchronously,
  // and an effect would show one frame of empty inputs before filling them in.
  if (user && user !== syncedUser) {
    setSyncedUser(user);
    setProfile({ fullName: user.fullName, phone: user.phone ?? '' });
    setLocation({ hallName: user.hallName ?? '', roomNo: user.roomNo ?? '' });
  }

  if (!user) {
    return null;
  }

  /**
   * Saves the identity fields.
   *
   * @param {import('react').FormEvent} event - Submit event.
   * @returns {Promise<void>} Resolves once saved.
   */
  const saveProfile = async (event) => {
    event.preventDefault();
    const updated = await registry.session.updateProfile(profile);
    setSaved(updated ? 'Profile saved.' : '');
  };

  /**
   * Saves the delivery address.
   *
   * @param {import('react').FormEvent} event - Submit event.
   * @returns {Promise<void>} Resolves once saved.
   */
  const saveLocation = async (event) => {
    event.preventDefault();
    const updated = await registry.session.updateLocation(location);
    setSaved(updated ? 'Delivery address saved.' : '');
  };

  return (
    <div className="space-y-5">
      <PageHeader title="Your profile" subtitle={`Signed in as ${user.email ?? user.phone}`} />

      <Alert>{state.error}</Alert>
      <Alert tone="success">{saved}</Alert>

      <Card title="About you">
        <form onSubmit={saveProfile} noValidate>
          <Field label="Full name" required>
            {(id) => (
              <Input
                id={id}
                name="fullName"
                value={profile.fullName}
                onChange={(value) => setProfile((current) => ({ ...current, fullName: value }))}
                required
              />
            )}
          </Field>
          <Field label="Phone">
            {(id) => (
              <Input
                id={id}
                name="phone"
                value={profile.phone}
                onChange={(value) => setProfile((current) => ({ ...current, phone: value }))}
                inputMode="tel"
              />
            )}
          </Field>
          <Button type="submit" busy={Boolean(state.loading)}>
            Save profile
          </Button>
        </form>
      </Card>

      {user.isStudent ? (
        <>
          <Card title="Delivery address">
            <p className="text-ink-soft mb-3 text-sm">
              Orders are delivered here unless you change it at checkout.
            </p>
            <form onSubmit={saveLocation} noValidate>
              <div className="grid gap-x-3 sm:grid-cols-2">
                <Field label="Hall" required>
                  {(id) => (
                    <Input
                      id={id}
                      name="hallName"
                      value={location.hallName}
                      onChange={(value) =>
                        setLocation((current) => ({ ...current, hallName: value }))
                      }
                      required
                    />
                  )}
                </Field>
                <Field label="Room / gate" required>
                  {(id) => (
                    <Input
                      id={id}
                      name="roomNo"
                      value={location.roomNo}
                      onChange={(value) =>
                        setLocation((current) => ({ ...current, roomNo: value }))
                      }
                      required
                    />
                  )}
                </Field>
              </div>
              <Button type="submit" busy={Boolean(state.loading)}>
                Save address
              </Button>
            </form>
          </Card>

          <div className="grid gap-3 sm:grid-cols-3">
            <Stat
              label="Rider rating"
              value={user.riderRating > 0 ? user.riderRating.toFixed(1) : '—'}
              hint="From students you delivered to"
            />
            <Stat
              label="Reliability"
              value={`${user.reliabilityScore}%`}
              hint="Drops when you release an accepted order"
            />
            <Stat
              label="Deliver mode"
              value={user.deliverModeOn ? 'On' : 'Off'}
              hint="Change it on the Deliver page"
            />
          </div>
        </>
      ) : null}
    </div>
  );
}
