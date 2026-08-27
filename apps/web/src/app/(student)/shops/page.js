/**
 * @file Route for `/shops` (FR-C1 to FR-C3).
 *
 * Routing only: the segment resolves its parameters and mounts the screen that owns
 * the behaviour. Nothing under `app/` holds state or talks to the API.
 *
 * @module app/(student)/shops/page
 */

import { ShopsScreen } from '../../../views/screens/student/shops-screen.jsx';

/**
 * Renders the ShopsScreen.
 *
 * @returns {import('react').ReactNode} The page.
 */
export default function Page() {
  return <ShopsScreen />;
}
