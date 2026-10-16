import { Link } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { LayoutGrid, Tags, HardDrive, KeyRound, Activity, BookOpen, ArrowLeft } from 'lucide-react';
import bg from '@/assets/crystal-bg.jpg';
import { Button } from '@/components/ui/button';

const sections = [
  { to: '/cloud', label: 'Overview', icon: LayoutGrid },
  { to: '/cloud/pricing', label: 'Pricing', icon: Tags },
  { to: '/cloud/storage', label: 'Storage', icon: HardDrive },
  { to: '/cloud/api-keys', label: 'API keys', icon: KeyRound },
  { to: '/cloud/usage', label: 'Usage', icon: Activity },
  { to: '/cloud/docs', label: 'Docs', icon: BookOpen },
] as const;

export function CloudShell({ children }: { children: ReactNode }) {
  return (
    <div className="dashboard-shell relative isolate min-h-screen overflow-x-clip">
      <img src={bg} alt="" className="fixed inset-0 -z-20 h-full w-full object-cover" />
      <div className="dashboard-backdrop fixed inset-0 -z-10" />
      <header className="mx-auto flex max-w-6xl items-center justify-between px-5 py-6 sm:px-8">
        <Link to="/cloud" className="flex items-center gap-2 font-display text-2xl font-normal">
          <span aria-hidden="true">☁️</span>CloudOne
        </Link>
        <Button asChild variant="glass" className="h-10 font-normal"><Link to="/dashboard"><ArrowLeft className="h-4 w-4" />Back to app</Link></Button>
      </header>
      <nav aria-label="Cloud navigation" className="mx-auto mb-2 flex max-w-6xl gap-1 overflow-x-auto px-5 pb-2 sm:px-8">
        {sections.map(section => (
          <Button asChild variant="ghost" key={section.to} className="h-10 shrink-0 justify-start rounded-lg px-4 font-normal">
            <Link to={section.to} activeOptions={{ exact: section.to === '/cloud' }} activeProps={{ className: 'dashboard-nav-active' }}>
              <section.icon className="h-4 w-4" />{section.label}
            </Link>
          </Button>
        ))}
      </nav>
      <main className="mx-auto max-w-6xl px-5 pb-24 pt-4 sm:px-8 sm:pt-6">{children}</main>
    </div>
  );
}
