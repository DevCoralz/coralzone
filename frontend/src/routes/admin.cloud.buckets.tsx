import { createFileRoute, Outlet } from '@tanstack/react-router';

// Layout for the Buckets branch: the list is admin.cloud.buckets.index.tsx and
// a single bucket is admin.cloud.buckets.$bucketId.tsx. The admin guard already
// ran in the parent /admin/cloud route.
export const Route = createFileRoute('/admin/cloud/buckets')({
  component: Outlet,
});
