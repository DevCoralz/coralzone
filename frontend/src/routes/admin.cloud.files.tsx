import { createFileRoute, Outlet } from '@tanstack/react-router';

// Layout for the Files and abuse branch: the search is admin.cloud.files.index.tsx,
// one file is admin.cloud.files.$fileId.tsx and the type list is
// admin.cloud.files.blocked-types.tsx. The admin guard already ran in the
// parent /admin/cloud route.
export const Route = createFileRoute('/admin/cloud/files')({
  component: Outlet,
});
