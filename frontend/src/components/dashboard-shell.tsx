import { Link } from '@tanstack/react-router';
import { useState, type ReactNode } from 'react';
import { Home, Tv, Code2, Droplets, Wallet, Menu, UserRound, Settings2, LifeBuoy, ArrowUpRight } from 'lucide-react';
import bg from '@/assets/crystal-bg.jpg';
import { Button } from '@/components/ui/button';
import { MovieAnnouncements } from '@/components/movie-announcements';
import { Sheet, SheetContent, SheetTitle, SheetDescription, SheetTrigger } from '@/components/ui/sheet';

const tabs = [
  { to: '/dashboard', label: 'Home', icon: Home }, { to: '/movies', label: 'Movies', icon: Tv },
  { to: '/apis', label: 'APIs', icon: Code2 }, { to: '/drops', label: 'Drops', icon: Droplets },
  { to: '/wallet', label: 'Wallet', icon: Wallet },
] as const;
const menuItems = [
  { to: '/account', label: 'My account', icon: UserRound },
  { to: '/settings', label: 'Settings', icon: Settings2 },
  { to: '/support', label: 'Help & support', icon: LifeBuoy },
] as const;

export function DashboardShell({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return <div className="dashboard-shell relative isolate min-h-screen overflow-x-clip">
    <img src={bg} alt="" className="fixed inset-0 -z-20 h-full w-full object-cover" />
    <div className="dashboard-backdrop fixed inset-0 -z-10" />
    <MovieAnnouncements />
    <header className="mx-auto flex max-w-6xl items-center justify-between px-5 py-6 sm:px-8">
      <Link to="/" className="font-display text-2xl font-normal">CoralzOne<span className="text-primary-glow">.</span></Link>
      <div className="flex items-center gap-3">
        <span className="dashboard-demo rounded-full px-3 py-1 text-[10px] uppercase tracking-widest">Preview account</span>
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild><Button variant="glass" size="icon" className="h-10 w-10" aria-label="Open menu"><Menu /></Button></SheetTrigger>
          <SheetContent className="dashboard-menu border-glass-border">
            <SheetTitle className="font-display text-2xl font-normal">CoralzOne</SheetTitle>
            <SheetDescription className="text-muted-foreground">Your account</SheetDescription>
            <nav className="mt-8 space-y-3" aria-label="Account navigation">
              {menuItems.map(item => <Button asChild key={item.to} variant="glass" className="h-12 w-full justify-start rounded-lg font-normal"><Link to={item.to} onClick={() => setOpen(false)}><item.icon />{item.label}<ArrowUpRight className="ml-auto" /></Link></Button>)}
              <Button asChild variant="glass" className="mt-8 h-12 w-full justify-start font-normal"><Link to="/" onClick={() => setOpen(false)}><Home />Back to website</Link></Button>
            </nav>
          </SheetContent>
        </Sheet>
      </div>
    </header>
    <main className="mx-auto max-w-6xl px-5 pb-36 pt-4 sm:px-8 sm:pt-6">{children}</main>
    <nav className="dashboard-nav fixed bottom-5 left-1/2 z-40 grid w-[calc(100%-32px)] max-w-lg -translate-x-1/2 grid-cols-5 gap-1 p-2" aria-label="Main navigation">
      {tabs.map(tab => <Button asChild variant="ghost" key={tab.to} className="dashboard-nav-link h-14 flex-col gap-1 rounded-full px-1 text-[10px] font-normal sm:text-xs"><Link to={tab.to} activeOptions={{ exact: true }} activeProps={{ className: 'dashboard-nav-active' }}><tab.icon className="h-5 w-5" />{tab.label}</Link></Button>)}
    </nav>
  </div>;
}