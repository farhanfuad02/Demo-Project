'use client';

/**
 * @file Shop registration and details (FR-B1, FR-B3).
 *
 * @module views/screens/vendor/vendor-shop-screen
 */

import { useEffect, useState } from 'react';
import { useControllerState, useRegistry } from '../../providers/app-provider.jsx';
import { Alert, Badge, Button, Card, PageHeader, Spinner, Stat } from '../../ui/primitives.jsx';
import { Field, Input, Textarea } from '../../ui/form.jsx';

/** A blank shop registration. */
const BLANK_SHOP = Object.freeze({
  shopName: '',
  botTolaLocation: '',
  contactPhone: '',
  operatingHours: '',
  description: '',
});

/**
 * Shop registration for a vendor who has not applied yet, and the shop card for one who
 * has.
 *
 * The pending state is shown honestly rather than hidden: a vendor whose application is
 * sitting in a queue should be able to see that, not wonder whether the form worked.
 *
 * @returns {import('react').ReactNode} The screen.
 */
export function VendorShopScreen() {
  const registry = useRegistry();
  const state = useControllerState(registry.vendor);
  const [form, setForm] = useState({ ...BLANK_SHOP });
  const [syncedShop, setSyncedShop] = useState(null);

  useEffect(() => {
    void registry.vendor.loadShop();
  }, [registry]);

  const shop = /** @type {import('../../../models/shop-model.js').ShopModel | null} */ (state.shop);

  // Seeded during render once the shop has loaded, so the form never flashes blank.
  if (shop && shop !== syncedShop) {
    setSyncedShop(shop);
    setForm({
      shopName: shop.shopName,
      botTolaLocation: shop.location,
      contactPhone: shop.contactPhone,
      operatingHours: shop.operatingHours,
      description: shop.description,
    });
  }

  /**
   * Updates one field.
   *
   * @param {string} field - Field name.
   * @returns {(value: string) => void} Change handler.
   */
  const set = (field) => (value) => setForm((current) => ({ ...current, [field]: value }));

  if (!state.loaded) {
    return (
      <div className="flex justify-center py-16">
        <Spinner label="Loading…" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title={shop ? 'Your shop' : 'Register your shop'}
        subtitle={
          shop
            ? 'Students see this on the browse page.'
            : 'An admin reviews every application before your shop goes live.'
        }
      />

      <Alert>{state.error}</Alert>

      {shop ? (
        <>
          <Card>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">{shop.shopName}</h2>
                <p className="text-ink-soft text-sm">{shop.location}</p>
              </div>
              <div className="flex items-center gap-2">
                <Badge tone={shop.isApproved ? 'success' : shop.isPending ? 'pending' : 'failure'}>
                  {shop.approvalStatus}
                </Badge>
                <Badge tone={shop.isOpen ? 'success' : 'neutral'}>
                  {shop.isOpen ? 'Open' : 'Closed'}
                </Badge>
              </div>
            </div>

            {!shop.isApproved ? (
              <Alert tone={shop.isPending ? 'pending' : 'failure'}>
                {shop.isPending
                  ? 'Waiting for an admin to approve your shop. Students cannot order yet.'
                  : `Your application was rejected. ${shop.decisionReason}`}
              </Alert>
            ) : (
              <div className="mt-4">
                <Button
                  variant={shop.isOpen ? 'secondary' : 'primary'}
                  busy={Boolean(state.loading)}
                  onClick={() => registry.vendor.setOpen(!shop.isOpen)}
                >
                  {shop.isOpen ? 'Close for now' : 'Open for orders'}
                </Button>
              </div>
            )}
          </Card>

          <div className="grid gap-3 sm:grid-cols-2">
            <Stat
              label="Rating"
              value={shop.ratingCount > 0 ? shop.rating.toFixed(1) : '—'}
              hint={`${shop.ratingCount} student ratings`}
            />
            <Stat label="Hours" value={shop.operatingHours || '—'} />
          </div>
        </>
      ) : (
        <Card>
          <form
            onSubmit={async (event) => {
              event.preventDefault();
              await registry.vendor.registerShop({
                ...form,
                description: form.description || undefined,
              });
            }}
            noValidate
          >
            <Field label="Shop name" required>
              {(id) => (
                <Input
                  id={id}
                  name="shopName"
                  value={form.shopName}
                  onChange={set('shopName')}
                  required
                />
              )}
            </Field>

            <Field label="Where in Bot Tola" hint="For example, stall 4." required>
              {(id) => (
                <Input
                  id={id}
                  name="botTolaLocation"
                  value={form.botTolaLocation}
                  onChange={set('botTolaLocation')}
                  required
                />
              )}
            </Field>

            <div className="grid gap-x-3 sm:grid-cols-2">
              <Field label="Contact phone" required>
                {(id) => (
                  <Input
                    id={id}
                    name="contactPhone"
                    value={form.contactPhone}
                    onChange={set('contactPhone')}
                    inputMode="tel"
                    required
                  />
                )}
              </Field>
              <Field label="Opening hours">
                {(id) => (
                  <Input
                    id={id}
                    name="operatingHours"
                    value={form.operatingHours}
                    onChange={set('operatingHours')}
                    placeholder="08:00 - 22:00"
                  />
                )}
              </Field>
            </div>

            <Field label="Description" hint="Optional. What do you cook best?">
              {(id) => (
                <Textarea
                  id={id}
                  name="description"
                  value={form.description}
                  onChange={set('description')}
                  rows={2}
                />
              )}
            </Field>

            <Button type="submit" busy={Boolean(state.loading)} full>
              Submit for approval
            </Button>
          </form>
        </Card>
      )}
    </div>
  );
}
