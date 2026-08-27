'use client';

/**
 * @file Tunable platform parameters (FR-G6).
 *
 * @module views/screens/admin/admin-settings-screen
 */

import { useEffect, useState } from 'react';
import { useControllerState, useRegistry } from '../../providers/app-provider.jsx';
import { Alert, Button, Card, PageHeader, Spinner } from '../../ui/primitives.jsx';
import { Field, Input } from '../../ui/form.jsx';

/**
 * The parameters an admin may change, with the wording that explains what each one does.
 *
 * Describing the effect rather than the field name matters here: "vendor accept timeout"
 * means nothing until you know that exceeding it cancels a student's order.
 *
 * @type {ReadonlyArray<{ key: string, label: string, hint: string }>}
 */
const SETTINGS = Object.freeze([
  {
    key: 'deliveryFeeBdt',
    label: 'Delivery fee (৳)',
    hint: 'Charged to the student and kept in full by the delivery partner.',
  },
  {
    key: 'vendorAcceptTimeoutSec',
    label: 'Vendor accept timeout (seconds)',
    hint: 'An order the vendor never answers is cancelled automatically after this.',
  },
  {
    key: 'releasePenaltyPoints',
    label: 'Release penalty (points)',
    hint: 'Reliability a partner loses for handing back an accepted delivery.',
  },
]);

/**
 * The system configuration screen.
 *
 * @returns {import('react').ReactNode} The screen.
 */
export function AdminSettingsScreen() {
  const registry = useRegistry();
  const state = useControllerState(registry.admin);
  const [draft, setDraft] = useState({});
  const [saved, setSaved] = useState('');
  const [syncedSettings, setSyncedSettings] = useState(null);

  useEffect(() => {
    void registry.admin.loadSettings();
  }, [registry]);

  const settings = /** @type {Record<string, unknown> | null} */ (state.settings);

  // Seeded during render each time the effective settings change, including after a save.
  if (settings && settings !== syncedSettings) {
    setSyncedSettings(settings);
    setDraft(
      Object.fromEntries(SETTINGS.map((setting) => [setting.key, String(settings[setting.key])]))
    );
  }

  if (!settings) {
    return (
      <div className="flex justify-center py-16">
        {state.error ? <Alert>{state.error}</Alert> : <Spinner label="Loading settings…" />}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="System settings"
        subtitle="Changes take effect on the next order — no redeploy needed."
      />

      <Alert>{state.error}</Alert>
      <Alert tone="success">{saved}</Alert>

      <Card>
        {SETTINGS.map((setting) => (
          <form
            key={setting.key}
            className="border-line mb-4 border-b pb-4 last:mb-0 last:border-0 last:pb-0"
            onSubmit={async (event) => {
              event.preventDefault();
              const updated = await registry.admin.updateSetting(
                setting.key,
                Number(draft[setting.key])
              );
              setSaved(updated ? `${setting.label} updated.` : '');
            }}
            noValidate
          >
            <Field label={setting.label} hint={setting.hint}>
              {(id) => (
                <Input
                  id={id}
                  name={setting.key}
                  value={draft[setting.key] ?? ''}
                  onChange={(value) =>
                    setDraft((current) => ({ ...current, [setting.key]: value }))
                  }
                  inputMode="numeric"
                />
              )}
            </Field>
            <Button type="submit" variant="secondary" busy={Boolean(state.loading)}>
              Save
            </Button>
          </form>
        ))}
      </Card>
    </div>
  );
}
