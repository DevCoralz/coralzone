// Single source of truth for the Cloud admin "tree". The hub cards and the
// sub-navigation both read this list, so adding a branch means adding one
// entry here plus its route file — nothing else drifts.
//
// status: 'live' = the page does real work today; 'planned' = the page
// exists in the tree but is a placeholder until its build step ships.
import { LayoutGrid, Boxes, Users, FileWarning, KeyRound, Receipt, Settings2, type LucideIcon } from 'lucide-react';

export type CloudAdminPath =
  | '/admin/cloud'
  | '/admin/cloud/buckets'
  | '/admin/cloud/users'
  | '/admin/cloud/files'
  | '/admin/cloud/api-keys'
  | '/admin/cloud/billing'
  | '/admin/cloud/settings';

export interface CloudAdminSection {
  to: CloudAdminPath;
  label: string;
  description: string;
  icon: LucideIcon;
  status: 'live' | 'planned';
  step: number;
}

export const CLOUD_ADMIN_SECTIONS: readonly CloudAdminSection[] = [
  { to: '/admin/cloud', label: 'Overview', description: 'Service health and platform-wide totals.', icon: LayoutGrid, status: 'live', step: 1 },
  { to: '/admin/cloud/buckets', label: 'Buckets', description: 'Every bucket: owner, size, file count. Freeze or delete.', icon: Boxes, status: 'planned', step: 4 },
  { to: '/admin/cloud/users', label: 'Users & usage', description: 'Look up a user, see their storage, cap or ban them.', icon: Users, status: 'planned', step: 5 },
  { to: '/admin/cloud/files', label: 'Files & abuse', description: 'Browse all files, remove abuse, block file types.', icon: FileWarning, status: 'live', step: 7 },
  { to: '/admin/cloud/api-keys', label: 'API keys', description: 'Keys across all users: last used, revoke, rate-limit.', icon: KeyRound, status: 'planned', step: 6 },
  { to: '/admin/cloud/billing', label: 'Billing & extra storage', description: 'Extra-storage purchases, manual adjustments, failed payments.', icon: Receipt, status: 'planned', step: 8 },
  { to: '/admin/cloud/settings', label: 'System settings', description: 'Global limits, plan quotas, file types, maintenance mode.', icon: Settings2, status: 'planned', step: 2 },
];
