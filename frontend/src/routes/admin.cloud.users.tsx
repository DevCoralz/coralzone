import { createFileRoute, Outlet } from '@tanstack/react-router';

// Layout for the Users branch: the list is admin.cloud.users.index.tsx and a
// single person is admin.cloud.users.$userId.*. The admin guard already ran in
// the parent /admin/cloud route.
export const Route = createFileRoute('/admin/cloud/users')({
  component: Outlet,
});
