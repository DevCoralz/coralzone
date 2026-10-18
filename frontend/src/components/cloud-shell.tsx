import { Link } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { LayoutGrid, Tags, HardDrive, Boxes, KeyRound, Activity, BookOpen, ArrowLeft, Cloud, Home, Code2, Droplets, Wallet } from 'lucide-react';
import bg from '@/assets/crystal-bg.jpg';
import { Button } from '@/components/ui/button';

const sections = [
  { to: '/cloud', label: 'Overview', icon: LayoutGrid },
  { to: '/cloud/pricing', label: 'Pricing', icon: Tags },
  { to: '/cloud/storage', label: 'Storage', icon: HardDrive },
  { to: '/cloud/buckets', label: 'Buckets', icon: Boxes },
  { to: '/cloud/api-keys', label: 'API keys', icon: KeyRound },
  { to: '/cloud/usage', label: 'Usage', icon: Activity },
  { to: '/cloud/docs', label: 'Docs', icon: BookOpen },
] as const;

const tabs = [
  { to: '/dashboard', label: 'Home', icon: Home, exact: true },
  { to: '/cloud', label: 'Cloud', icon: Cloud, exact: false },
  { to: '/apis', label: 'APIs', icon: Code2, exact: true },
  { to: '/drops', label: 'Drops', icon: Droplets, exact: true },
  { to: '/wallet', label: 'Wallet', icon: Wallet, exact: true },
] as const;

export function CloudShell({ children }: { children: ReactNode }) {
  return (
    <div className="dashboard-shell relative isolate min-h-screen overflow-x-clip">
      <img src={bg} alt="" className="fixed inset-0 -z-20 h-full w-full object-cover" />
      <div className="dashboard-backdrop fixed inset-0 -z-10" />
      <header className="mx-auto flex max-w-6xl items-center justify-between px-5 py-6 sm:px-8">
        <Link to="/cloud" className="flex items-center gap-2 font-display text-2xl font-normal">
          <Cloud className="h-6 w-6 text-primary-glow" />CloudOne
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
      <main className="mx-auto max-w-6xl px-5 pb-36 pt-4 sm:px-8 sm:pt-6">{children}</main>
      <nav className="dashboard-nav fixed bottom-5 left-1/2 z-40 grid w-[calc(100%-32px)] max-w-lg -translate-x-1/2 grid-cols-5 gap-1 p-2" aria-label="Main navigation">
        {tabs.map(tab => <Button asChild variant="ghost" key={tab.to} className="dashboard-nav-link h-14 flex-col gap-1 rounded-lg px-1 text-[10px] font-normal sm:text-xs"><Link to={tab.to} activeOptions={{ exact: tab.exact }} activeProps={{ className: 'dashboard-nav-active' }}><tab.icon className="h-5 w-5" />{tab.label}</Link></Button>)}
      </nav>
    </div>
  );
}
