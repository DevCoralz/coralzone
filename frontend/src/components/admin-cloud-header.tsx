import { Link } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';

// Page header for every Cloud admin branch: breadcrumb, title, one-line
// purpose, and an optional actions slot (refresh buttons etc.).
export function AdminCloudHeader({ title, description, actions }: { title: string; description: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <p className="flex items-center gap-1 text-xs text-muted-foreground">
          <Link to="/admin/cloud" className="hover:text-foreground">Cloud storage</Link>
          <ChevronRight size={12} aria-hidden="true" />
          <span aria-current="page">{title}</span>
        </p>
        <h2 className="mt-2 font-display text-2xl font-normal">{title}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>
      {actions}
    </div>
  );
}
