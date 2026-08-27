/**
 * @file Route for `/notifications` (FR-E4).
 *
 * Routing only: the segment resolves its parameters and mounts the screen that owns
 * the behaviour. Nothing under `app/` holds state or talks to the API.
 *
 * @module app/(student)/notifications/page
 */

import { RoleGuard } from '../../../views/layout/app-shell.jsx';
import { NotificationsScreen } from '../../../views/screens/student/notifications-screen.jsx';

/**
 * Renders the NotificationsScreen.
 *
 * @returns {import('react').ReactNode} The page.
 */
export default function Page() {
  return (
    <RoleGuard>
      <NotificationsScreen />
    </RoleGuard>
  );
}
