import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import { Search, ChevronRight } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useAdminUsers } from '@/lib/admin-store';
import { formatNaira, type AdminUserStatus } from '@/lib/admin-data';

const filters = ['All', 'Active', 'Restricted', 'Suspended'] as const;

export function statusClass(status: AdminUserStatus) {
  return status === 'Active' ? 'text-online' : status === 'Restricted' ? 'text-primary-glow' : 'text-muted-foreground';
}

export function AdminUsers() {
  const users = useAdminUsers();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<(typeof filters)[number]>('All');
  const q = query.trim().toLowerCase();
  const rows = users.filter(u => (filter === 'All' || u.status === filter) && (!q || u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q) || u.id.includes(q)));

  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-0 flex-1 sm:max-w-sm">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search name, email or ID" aria-label="Search users" className="rounded-full border-glass-border bg-transparent pl-9" />
        </div>
        <div className="dashboard-segment flex rounded-full p-1" aria-label="Filter by status">
          {filters.map(f => (
            <Button key={f} variant="ghost" aria-pressed={filter === f} onClick={() => setFilter(f)} className={`h-8 rounded-full px-3 text-xs font-normal ${filter === f ? 'dashboard-selected' : ''}`}>{f}</Button>
          ))}
        </div>
      </div>

      <section className="dashboard-panel mt-5 overflow-hidden">
        <div className="hidden grid-cols-[2fr_1fr_1fr_1fr_auto] gap-4 border-b border-glass-border px-5 py-3 text-[11px] uppercase tracking-wider text-muted-foreground md:grid">
          <span>User</span><span>Status</span><span>Balance</span><span>Last seen</span><span className="w-4" />
        </div>
        <div className="divide-y divide-glass-border">
          {rows.map(user => (
            <Link key={user.id} to="/admin/user/$userId" params={{ userId: user.id }} className="admin-row grid grid-cols-[1fr_auto] items-center gap-3 px-5 py-4 md:grid-cols-[2fr_1fr_1fr_1fr_auto] md:gap-4">
              <div className="flex min-w-0 items-center gap-3">
                <span className="dashboard-icon flex h-9 w-9 shrink-0 items-center justify-center rounded-full font-display text-sm">{user.name[0]}</span>
                <div className="min-w-0"><p className="truncate text-sm">{user.name}</p><p className="truncate text-[11px] text-muted-foreground">{user.email} · {user.role}</p></div>
              </div>
              <span className={`hidden text-xs md:block ${statusClass(user.status)}`}>{user.status}</span>
              <span className="hidden text-sm tabular-nums md:block">{formatNaira(user.balance)}</span>
              <span className="hidden text-xs text-muted-foreground md:block">{user.lastSeen}</span>
              <span className="flex items-center gap-2"><span className={`text-[11px] md:hidden ${statusClass(user.status)}`}>{user.status}</span><ChevronRight size={16} className="text-muted-foreground" /></span>
            </Link>
          ))}
          {rows.length === 0 && <p className="px-5 py-10 text-center text-sm text-muted-foreground">No users match your search.</p>}
        </div>
      </section>
    </>
  );
}
