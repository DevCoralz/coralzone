import { Link } from '@tanstack/react-router';
import { ArrowLeft } from 'lucide-react';

// Back link plus the two pages that belong to one user: what they hold, and
// what an admin can change. Each is its own page, so neither gets crowded.
export function AdminCloudUserTabs({ userId, active }: { userId: string; active: 'overview' | 'controls' }) {
  const base = 'rounded-full border px-4 py-1.5 text-xs';
  const on = 'border-primary-glow/60 text-foreground';
  const off = 'border-glass-border text-muted-foreground hover:text-foreground';
  return (
    <div className="-mt-3 mb-5 flex flex-wrap items-center justify-between gap-3">
      <Link to="/admin/cloud/users" className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"><ArrowLeft size={13} aria-hidden="true" />All users</Link>
      <nav aria-label="User pages" className="flex gap-2">
        <Link to="/admin/cloud/users/$userId" params={{ userId }} aria-current={active === 'overview' ? 'page' : undefined} className={`${base} ${active === 'overview' ? on : off}`}>Overview</Link>
        <Link to="/admin/cloud/users/$userId/controls" params={{ userId }} aria-current={active === 'controls' ? 'page' : undefined} className={`${base} ${active === 'controls' ? on : off}`}>Controls</Link>
      </nav>
    </div>
  );
}
