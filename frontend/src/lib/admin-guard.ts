// Route-level admin gate, shared by every /admin/* route's beforeLoad.
// Non-admins (and signed-out visitors) get the normal 404 page, so the
// admin area's existence is never revealed. This is a UX gate only — every
// admin server function re-checks with requireAdmin() (admin.functions.ts)
// because each one has its own HTTP endpoint that can be called directly.
import { notFound } from '@tanstack/react-router';
import { getIsAdmin } from './admin.functions';

export async function adminRouteGuard(): Promise<void> {
  const isAdmin = await getIsAdmin();
  if (!isAdmin) throw notFound();
}
