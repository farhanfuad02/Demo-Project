/**
 * @file Route for `/shops/[shopId]` (HJU-C02).
 *
 * Routing only: the segment resolves its parameters and mounts the screen that owns
 * the behaviour. Nothing under `app/` holds state or talks to the API.
 *
 * @module app/(student)/shops/[shopId]/page
 */

import { ShopDetailScreen } from '../../../../views/screens/student/shop-detail-screen.jsx';

/**
 * Renders the ShopDetailScreen.
 *
 * @param {object} props - Route props.
 * @param {Promise<{ shopId: string }>} props.params - Dynamic segment; a
 *   promise since Next.js 16.
 * @returns {Promise<import('react').ReactNode>} The page.
 */
export default async function Page({ params }) {
  const { shopId } = await params;
  return <ShopDetailScreen shopId={shopId} />;
}
