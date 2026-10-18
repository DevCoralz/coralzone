import { createFileRoute, Outlet } from '@tanstack/react-router';

// Layout for one person's pages: overview (the index) and controls.
export const Route = createFileRoute('/admin/cloud/users/$userId')({
  component: Outlet,
});
