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
