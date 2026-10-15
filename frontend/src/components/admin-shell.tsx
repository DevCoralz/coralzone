import { Link } from '@tanstack/react-router';
import { useState, type ReactNode } from 'react';
import { LayoutDashboard, Users, CreditCard, Settings2, Megaphone, ShieldCheck, Menu, ArrowLeft } from 'lucide-react';
import bg from '@/assets/crystal-bg.jpg';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTitle, SheetDescription, SheetTrigger } from '@/components/ui/sheet';

const nav = [
  { to: '/admin', label: 'Overview', icon: LayoutDashboard },
  { to: '/admin/users', label: 'Users', icon: Users },
  { to: '/admin/payments', label: 'Payments', icon: CreditCard },
  { to: '/admin/site-settings', label: 'Site settings', icon: Settings2 },
  { to: '/admin/ads', label: 'Ads', icon: Megaphone },
  { to: '/admin/team', label: 'Admin team', icon: ShieldCheck },
] as const;

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <nav className="space-y-1" aria-label="Admin navigation">
      {nav.map(item => (
        <Button asChild variant="ghost" key={item.to} className="admin-nav-link h-11 w-full justify-start rounded-lg font-normal">
          <Link to={item.to} activeOptions={{ exact: item.to === '/admin' }} activeProps={{ className: 'admin-nav-active' }} onClick={onNavigate}>
            <item.icon className="h-4 w-4" />{item.label}
          </Link>
        </Button>
      ))}
    </nav>
  );
}

export function AdminShell({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="dashboard-shell relative isolate min-h-screen overflow-x-clip">
      <img src={bg} alt="" className="fixed inset-0 -z-20 h-full w-full object-cover" />
      <div className="dashboard-backdrop fixed inset-0 -z-10" />

      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-glass-border p-5 lg:flex" style={{ background: 'var(--dashboard-deep)' }}>
        <Link to="/admin" className="font-display text-xl font-normal">CoralzOne<span className="text-primary-glow">.</span> <span className="text-xs text-muted-foreground">Admin</span></Link>
        <div className="mt-8 flex-1"><NavLinks /></div>
        <Button asChild variant="glass" className="h-10 justify-start rounded-lg font-normal"><Link to="/dashboard"><ArrowLeft className="h-4 w-4" />Back to app</Link></Button>
      </aside>

      <div className="lg:pl-60">
        <header className="flex items-center justify-between gap-3 border-b border-glass-border px-5 py-4 sm:px-8">
          <div className="flex items-center gap-3">
            <Sheet open={open} onOpenChange={setOpen}>
              <SheetTrigger asChild><Button variant="glass" size="icon" className="h-10 w-10 lg:hidden" aria-label="Open admin menu"><Menu /></Button></SheetTrigger>
              <SheetContent side="left" className="dashboard-menu border-glass-border">
                <SheetTitle className="font-display text-2xl font-normal">Admin</SheetTitle>
                <SheetDescription className="text-muted-foreground">CoralzOne staff workspace</SheetDescription>
                <div className="mt-8"><NavLinks onNavigate={() => setOpen(false)} /></div>
                <Button asChild variant="glass" className="mt-8 h-11 w-full justify-start font-normal"><Link to="/dashboard" onClick={() => setOpen(false)}><ArrowLeft className="h-4 w-4" />Back to app</Link></Button>
              </SheetContent>
            </Sheet>
            <div>
              <h1 className="font-display text-xl font-normal sm:text-2xl">{title}</h1>
              <p className="text-xs text-muted-foreground">{subtitle}</p>
            </div>
          </div>
          <span className="dashboard-demo rounded-full px-3 py-1 text-[10px] uppercase tracking-widest">Demo data</span>
        </header>
        <p className="border-b border-glass-border px-5 py-2 text-[11px] text-muted-foreground sm:px-8">
          Preview workspace — actions change this screen only; nothing is saved to a live service yet.
        </p>
        <main className="px-5 py-6 sm:px-8 sm:py-8">{children}</main>
      </div>
    </div>
  );
}
