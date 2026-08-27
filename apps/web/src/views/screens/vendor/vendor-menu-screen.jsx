'use client';

/**
 * @file Menu management (FR-B2).
 *
 * @module views/screens/vendor/vendor-menu-screen
 */

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useControllerState, useRegistry } from '../../providers/app-provider.jsx';
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  Money,
  PageHeader,
  Spinner,
} from '../../ui/primitives.jsx';
import { Field, Input, Textarea } from '../../ui/form.jsx';

/** A blank menu item, used for the add form and after each save. */
const BLANK_ITEM = Object.freeze({
  name: '',
  description: '',
  price: '',
  category: 'General',
  prepTimeMin: '15',
});

/**
 * The add-or-edit form.
 *
 * @param {object} props - Component props.
 * @param {Record<string, string>} props.value - Current form values.
 * @param {(value: Record<string, string>) => void} props.onChange - Called with new values.
 * @param {() => void} props.onSubmit - Saves the item.
 * @param {() => void} [props.onCancel] - Abandons an edit.
 * @param {boolean} props.busy - Whether a save is in flight.
 * @param {boolean} props.editing - Whether this is an edit rather than an add.
 * @returns {import('react').ReactNode} The form.
 */
function ItemForm({ value, onChange, onSubmit, onCancel, busy, editing }) {
  /**
   * Updates one field.
   *
   * @param {string} field - Field name.
   * @returns {(next: string) => void} Change handler.
   */
  const set = (field) => (next) => onChange({ ...value, [field]: next });

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
      noValidate
    >
      <div className="grid gap-x-3 sm:grid-cols-2">
        <Field label="Dish name" required>
          {(id) => <Input id={id} name="name" value={value.name} onChange={set('name')} required />}
        </Field>
        <Field label="Price (৳)" required>
          {(id) => (
            <Input
              id={id}
              name="price"
              value={value.price}
              onChange={set('price')}
              inputMode="decimal"
              required
            />
          )}
        </Field>
        <Field label="Category">
          {(id) => (
            <Input id={id} name="category" value={value.category} onChange={set('category')} />
          )}
        </Field>
        <Field label="Preparation time (minutes)">
          {(id) => (
            <Input
              id={id}
              name="prepTimeMin"
              value={value.prepTimeMin}
              onChange={set('prepTimeMin')}
              inputMode="numeric"
            />
          )}
        </Field>
      </div>

      <Field label="Description" hint="Optional.">
        {(id) => (
          <Textarea
            id={id}
            name="description"
            value={value.description}
            onChange={set('description')}
            rows={2}
          />
        )}
      </Field>

      <div className="flex gap-2">
        <Button type="submit" busy={busy}>
          {editing ? 'Save changes' : 'Add to menu'}
        </Button>
        {onCancel ? (
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        ) : null}
      </div>
    </form>
  );
}

/**
 * The menu manager.
 *
 * @returns {import('react').ReactNode} The screen.
 */
export function VendorMenuScreen() {
  const registry = useRegistry();
  const state = useControllerState(registry.vendor);
  const [draft, setDraft] = useState({ ...BLANK_ITEM });
  const [editingId, setEditingId] = useState(null);
  const [editDraft, setEditDraft] = useState({ ...BLANK_ITEM });

  useEffect(() => {
    void registry.vendor.loadShop();
  }, [registry]);

  const shop = /** @type {import('../../../models/shop-model.js').ShopModel | null} */ (state.shop);
  const menu = /** @type {import('../../../models/shop-model.js').MenuItemModel[]} */ (state.menu);

  if (!state.loaded) {
    return (
      <div className="flex justify-center py-16">
        <Spinner label="Loading your menu…" />
      </div>
    );
  }

  if (!shop) {
    return (
      <EmptyState
        title="Register your shop first"
        action={
          <Link
            href="/vendor/shop"
            className="bg-brand-600 rounded-lg px-4 py-2 text-sm font-semibold text-white"
          >
            Register shop
          </Link>
        }
      />
    );
  }

  /**
   * Converts a form draft into the payload the API expects.
   *
   * @param {Record<string, string>} values - Form values.
   * @returns {Record<string, unknown>} Payload.
   */
  const toPayload = (values) => ({
    name: values.name,
    description: values.description || undefined,
    price: Number(values.price),
    category: values.category || 'General',
    prepTimeMin: Number(values.prepTimeMin) || 15,
  });

  return (
    <div className="space-y-5">
      <PageHeader title="Menu" subtitle={`${menu.length} dishes on ${shop.shopName}`} />
      <Alert>{state.error}</Alert>

      <Card title="Add a dish">
        <ItemForm
          value={draft}
          onChange={setDraft}
          busy={Boolean(state.loading)}
          editing={false}
          onSubmit={async () => {
            const saved = await registry.vendor.addMenuItem(toPayload(draft));
            if (saved) {
              setDraft({ ...BLANK_ITEM });
            }
          }}
        />
      </Card>

      <Card title="Your dishes">
        {menu.length === 0 ? (
          <EmptyState
            title="Nothing on the menu yet"
            hint="Students only see shops that have something to sell."
          />
        ) : (
          <ul className="divide-line divide-y">
            {menu.map((item) => (
              <li key={item.id} className="py-3">
                {editingId === item.id ? (
                  <ItemForm
                    value={editDraft}
                    onChange={setEditDraft}
                    busy={Boolean(state.loading)}
                    editing
                    onCancel={() => setEditingId(null)}
                    onSubmit={async () => {
                      const saved = await registry.vendor.updateMenuItem(
                        item.id,
                        toPayload(editDraft)
                      );
                      if (saved) {
                        setEditingId(null);
                      }
                    }}
                  />
                ) : (
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium">
                        {item.name}
                        <span className="ml-2">
                          <Badge tone={item.isAvailable ? 'success' : 'neutral'}>
                            {item.isAvailable ? 'Available' : 'Sold out'}
                          </Badge>
                        </span>
                      </p>
                      <p className="text-ink-soft text-sm">
                        {item.category} · <Money amount={item.price} /> · {item.prepTimeMin} min
                      </p>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="secondary"
                        busy={Boolean(state.loading)}
                        onClick={() =>
                          registry.vendor.setItemAvailability(item.id, !item.isAvailable)
                        }
                      >
                        {item.isAvailable ? 'Mark sold out' : 'Back in stock'}
                      </Button>
                      <Button
                        variant="ghost"
                        onClick={() => {
                          setEditingId(item.id);
                          setEditDraft({
                            name: item.name,
                            description: item.description,
                            price: String(item.price),
                            category: item.category,
                            prepTimeMin: String(item.prepTimeMin),
                          });
                        }}
                      >
                        Edit
                      </Button>
                      <Button
                        variant="ghost"
                        onClick={() => registry.vendor.removeMenuItem(item.id)}
                      >
                        Delete
                      </Button>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
