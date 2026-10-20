import { Link } from '@tanstack/react-router';

// The two pages of the Files and abuse branch: finding files, and choosing
// which file types are blocked. Each is its own page, so neither gets crowded.
export function AdminCloudFilesTabs({ active }: { active: 'search' | 'types' }) {
  const base = 'rounded-full border px-4 py-1.5 text-xs';
  const on = 'border-primary-glow/60 text-foreground';
  const off = 'border-glass-border text-muted-foreground hover:text-foreground';
  return (
    <nav aria-label="Files pages" className="-mt-3 mb-5 flex gap-2">
      <Link to="/admin/cloud/files" aria-current={active === 'search' ? 'page' : undefined} className={`${base} ${active === 'search' ? on : off}`}>Search files</Link>
      <Link to="/admin/cloud/files/blocked-types" aria-current={active === 'types' ? 'page' : undefined} className={`${base} ${active === 'types' ? on : off}`}>Blocked types</Link>
    </nav>
  );
}
