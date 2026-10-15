import { useSyncExternalStore } from 'react';
import { adminUsers, type AdminUser } from '@/lib/admin-data';

// Session-only preview store: changes live in memory until the separate backend is connected.
let users: AdminUser[] = adminUsers.map(u => ({ ...u }));
const listeners = new Set<() => void>();

export function updateUser(id: string, patch: Partial<AdminUser>) {
  users = users.map(u => (u.id === id ? { ...u, ...patch } : u));
  listeners.forEach(l => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useAdminUsers() {
  return useSyncExternalStore(subscribe, () => users, () => users);
}
