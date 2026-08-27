'use client';

/**
 * @file Browse and search Bot Tola shops (FR-C1 to FR-C3).
 *
 * @module views/screens/student/shops-screen
 */

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { SEARCH } from '@hungry-ju/shared/constants';
import { useControllerState, useRegistry } from '../../providers/app-provider.jsx';
import { Alert, Badge, EmptyState, Money, PageHeader, Spinner } from '../../ui/primitives.jsx';
import { Input, Toggle } from '../../ui/form.jsx';

/**
 * One shop in the browse grid.
 *
 * @param {object} props - Component props.
 * @param {import('../../../models/shop-model.js').ShopModel} props.shop - Shop to show.
 * @returns {import('react').ReactNode} The card.
 */
function ShopCard({ shop }) {
  return (
    <Link
      href={`/shops/${shop.id}`}
      className="border-line bg-surface hover:border-brand-400 block rounded-xl border p-4 transition"
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-semibold">{shop.shopName}</h3>
        <Badge tone={shop.isOpen ? 'success' : 'neutral'}>{shop.isOpen ? 'Open' : 'Closed'}</Badge>
      </div>
      <p className="text-ink-soft mt-1 text-sm">{shop.location}</p>
      {shop.description ? (
        <p className="text-ink-soft mt-2 line-clamp-2 text-sm">{shop.description}</p>
      ) : null}
      <p className="mt-3 text-sm">
        <span aria-hidden="true">★</span> {shop.ratingLabel}
        {shop.operatingHours ? (
          <span className="text-ink-soft ml-2">· {shop.operatingHours}</span>
        ) : null}
      </p>
    </Link>
  );
}

/**
 * One dish in the search results.
 *
 * @param {object} props - Component props.
 * @param {import('../../../models/shop-model.js').MenuItemModel} props.item - Dish to show.
 * @returns {import('react').ReactNode} The row.
 */
function SearchResultRow({ item }) {
  return (
    <Link
      href={`/shops/${item.shopId}`}
      className="border-line bg-surface hover:border-brand-400 flex items-center justify-between gap-3 rounded-xl border p-4"
    >
      <div>
        <p className="font-medium">{item.name}</p>
        <p className="text-ink-soft text-sm">{item.shop?.shopName ?? 'Bot Tola'}</p>
      </div>
      <Money amount={item.price} bold />
    </Link>
  );
}

/**
 * The student home: search, filter, and the open-vendor grid.
 *
 * Search takes over the page when there is a query and gets out of the way when there is
 * not, so there is one screen rather than two that have to be kept consistent.
 *
 * @returns {import('react').ReactNode} The screen.
 */
export function ShopsScreen() {
  const registry = useRegistry();
  const state = useControllerState(registry.catalog);
  const [query, setQuery] = useState('');
  const [openOnly, setOpenOnly] = useState(false);

  useEffect(() => {
    void registry.catalog.loadShops({ openOnly });
  }, [registry, openOnly]);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < SEARCH.MIN_QUERY_LENGTH) {
      registry.catalog.clearSearch();
      return undefined;
    }
    // Debounced so a five-letter word is one request rather than five (NFR-02).
    const timer = setTimeout(() => {
      void registry.catalog.search(trimmed, { openOnly });
    }, 300);
    return () => clearTimeout(timer);
  }, [registry, query, openOnly]);

  const results = /** @type {{ items: unknown[], shops: unknown[] } | null} */ (
    state.searchResults
  );
  const shops = /** @type {import('../../../models/shop-model.js').ShopModel[]} */ (state.shops);

  return (
    <div>
      <PageHeader title="Bot Tola" subtitle="Order from the stalls without walking there." />

      <div className="mb-5 space-y-3">
        <Input
          id="shop-search"
          name="search"
          value={query}
          onChange={setQuery}
          placeholder="Search food or shops — try “khich”"
        />
        <Toggle label="Only shops open right now" checked={openOnly} onChange={setOpenOnly} />
      </div>

      <Alert>{state.error}</Alert>

      {state.loading && shops.length === 0 ? (
        <div className="flex justify-center py-10">
          <Spinner label="Loading shops…" />
        </div>
      ) : null}

      {results ? (
        <div className="space-y-6">
          <section>
            <h2 className="text-ink-soft mb-2 text-sm font-semibold tracking-wide uppercase">
              Dishes
            </h2>
            {results.items.length === 0 ? (
              <EmptyState title="No dishes matched" hint="Try a shorter word." />
            ) : (
              <div className="space-y-2">
                {results.items.map((item) => (
                  <SearchResultRow key={item.id} item={item} />
                ))}
              </div>
            )}
          </section>

          {results.shops.length > 0 ? (
            <section>
              <h2 className="text-ink-soft mb-2 text-sm font-semibold tracking-wide uppercase">
                Shops
              </h2>
              <div className="grid gap-3 sm:grid-cols-2">
                {results.shops.map((shop) => (
                  <ShopCard key={shop.id} shop={shop} />
                ))}
              </div>
            </section>
          ) : null}
        </div>
      ) : shops.length === 0 && !state.loading ? (
        <EmptyState title="No shops yet" hint="Vendors appear here once an admin approves them." />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {shops.map((shop) => (
            <ShopCard key={shop.id} shop={shop} />
          ))}
        </div>
      )}
    </div>
  );
}
