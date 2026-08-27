'use client';

/**
 * @file User directory and suspension (FR-G2).
 *
 * @module views/screens/admin/admin-users-screen
 */

import { useEffect, useState } from 'react';
import { USER_ROLE, USER_STATUS } from '@hungry-ju/shared/enums';
import { useControllerState, useRegistry } from '../../providers/app-provider.jsx';
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  PageHeader,
  Spinner,
} from '../../ui/primitives.jsx';
import { Input, Select } from '../../ui/form.jsx';

/** How each account status is coloured. */
const STATUS_TONE = Object.freeze({
  [USER_STATUS.VERIFIED]: 'success',
  [USER_STATUS.PENDING]: 'pending',
  [USER_STATUS.SUSPENDED]: 'failure',
});

/**
 * The user directory.
 *
 * @returns {import('react').ReactNode} The screen.
 */
export function AdminUsersScreen() {
  const registry = useRegistry();
  const state = useControllerState(registry.admin);
  const [role, setRole] = useState('');
  const [search, setSearch] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => {
      void registry.admin.loadUsers({
        role: role || undefined,
        search: search.trim() || undefined,
      });
    }, 250);
    return () => clearTimeout(timer);
  }, [registry, role, search]);

  const users = /** @type {Array<Record<string, any>>} */ (state.users);

  return (
    <div>
      <PageHeader
        title="Users"
        subtitle="Suspending an account ends every one of its sessions immediately."
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-2">
        <Input
          id="user-search"
          name="search"
          value={search}
          onChange={setSearch}
          placeholder="Search by name"
        />
        <Select
          id="user-role"
          name="role"
          value={role}
          onChange={setRole}
          options={[
            { value: '', label: 'All roles' },
            { value: USER_ROLE.STUDENT, label: 'Students' },
            { value: USER_ROLE.VENDOR, label: 'Vendors' },
            { value: USER_ROLE.ADMIN, label: 'Admins' },
          ]}
        />
      </div>

      <Alert>{state.error}</Alert>

      {state.loading && users.length === 0 ? (
        <div className="flex justify-center py-10">
          <Spinner label="Loading users…" />
        </div>
      ) : users.length === 0 ? (
        <EmptyState title="No accounts matched" />
      ) : (
        <Card>
          <ul className="divide-line divide-y">
            {users.map((user) => {
              const suspended = user.status === USER_STATUS.SUSPENDED;
              return (
                <li
                  key={user.id}
                  className="flex flex-wrap items-center justify-between gap-3 py-3"
                >
                  <div className="min-w-0">
                    <p className="font-medium">
                      {user.fullName}
                      <span className="ml-2">
                        <Badge tone={STATUS_TONE[user.status] ?? 'neutral'}>{user.status}</Badge>
                      </span>
                    </p>
                    <p className="text-ink-soft text-sm">
                      {user.role} · {user.email ?? user.phone}
                    </p>
                  </div>

                  {user.role === USER_ROLE.ADMIN ? (
                    <span className="text-ink-soft text-sm">
                      Admin accounts cannot be suspended here
                    </span>
                  ) : (
                    <Button
                      variant={suspended ? 'secondary' : 'danger'}
                      busy={Boolean(state.loading)}
                      onClick={() => registry.admin.setUserSuspended(user.id, !suspended)}
                    >
                      {suspended ? 'Reactivate' : 'Suspend'}
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </div>
  );
}
