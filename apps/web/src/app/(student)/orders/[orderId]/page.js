/**
 * @file Route for `/orders/[orderId]` (FR-E1, UC-03).
 *
 * Routing only: the segment resolves its parameters and mounts the screen that owns
 * the behaviour. Nothing under `app/` holds state or talks to the API.
 *
 * @module app/(student)/orders/[orderId]/page
 */

import { USER_ROLE } from '@hungry-ju/shared/enums';
import { RoleGuard } from '../../../../views/layout/app-shell.jsx';
import { OrderDetailScreen } from '../../../../views/screens/student/order-detail-screen.jsx';

/**
 * Parameters to prerender.
 *
 * Orders live in the API's database, not in the repository, so there is no real
 * build-time list to walk; unlisted ids are rendered on demand. The single placeholder
 * exists because a static export refuses to emit a dynamic segment with no routes at
 * all — that build has no runtime, so only this one id resolves there.
 *
 * @returns {Promise<Array<{ orderId: string }>>} One placeholder parameter.
 */
export async function generateStaticParams() {
  return [{ orderId: 'placeholder' }];
}
/**
 * Renders the OrderDetailScreen.
 *
 * @param {object} props - Route props.
 * @param {Promise<{ orderId: string }>} props.params - Dynamic segment; a
 *   promise since Next.js 16.
 * @returns {Promise<import('react').ReactNode>} The page.
 */
export default async function Page({ params }) {
  const { orderId } = await params;
  return (
    <RoleGuard roles={[USER_ROLE.STUDENT]}>
      <OrderDetailScreen orderId={orderId} />
    </RoleGuard>
  );
}
