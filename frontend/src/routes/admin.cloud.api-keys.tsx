import { createFileRoute, Outlet } from '@tanstack/react-router';

// Layout for the API keys branch: the list is admin.cloud.api-keys.index.tsx
// and a single key is admin.cloud.api-keys.$keyId.tsx. The admin guard already
// ran in the parent /admin/cloud route.
export const Route = createFileRoute('/admin/cloud/api-keys')({
  component: Outlet,
});
