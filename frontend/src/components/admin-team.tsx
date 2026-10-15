import { useState } from 'react';
import { UserPlus, Trash2, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

type Member = { email: string; role: string; status: 'Active' | 'Invited'; owner?: boolean };
const roles = [
  { value: 'Super admin', detail: 'Full access, including admin team and payments' },
  { value: 'Admin', detail: 'Users, ads and site settings' },
  { value: 'Support', detail: 'View users and reset usage' },
];

const activityLog = [
  { who: 'owner@coralz.com', what: 'Updated top-up limits', when: '12 min ago' },
  { who: 'support@coralz.com', what: 'Reset usage for Zainab Bello', when: '1 hr ago' },
  { who: 'owner@coralz.com', what: 'Created ad “Developer plan — 20% off”', when: 'Yesterday' },
];

export function AdminTeam() {
  const [members, setMembers] = useState<Member[]>([
    { email: 'owner@coralz.com', role: 'Super admin', status: 'Active', owner: true },
    { email: 'support@coralz.com', role: 'Support', status: 'Active' },
  ]);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('Admin');
  const [error, setError] = useState('');

  const invite = () => {
    const value = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) { setError('Enter a valid email address.'); return; }
    if (members.some(m => m.email === value)) { setError('This person is already on the team.'); return; }
    setMembers(m => [...m, { email: value, role, status: 'Invited' }]);
    setEmail(''); setError('');
  };

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[1.4fr_1fr]">
      <div className="space-y-6">
        <section className="dashboard-panel p-5 sm:p-7">
          <h2 className="font-display text-lg font-normal">Invite an admin</h2>
          <div className="mt-4 flex flex-col gap-3 sm:flex-row">
            <Input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="name@example.com" aria-label="Admin email" className="rounded-full border-glass-border bg-transparent" />
            <Select value={role} onValueChange={setRole}>
              <SelectTrigger className="rounded-full border-glass-border bg-transparent sm:w-40" aria-label="Admin role"><SelectValue /></SelectTrigger>
              <SelectContent>{roles.map(r => <SelectItem key={r.value} value={r.value}>{r.value}</SelectItem>)}</SelectContent>
            </Select>
            <Button variant="crystal" onClick={invite} className="shrink-0 font-normal"><UserPlus />Invite</Button>
          </div>
          {error && <p role="alert" className="mt-3 text-sm text-primary-glow">{error}</p>}
        </section>

        <section className="dashboard-panel divide-y divide-glass-border">
          {members.map(m => (
            <div key={m.email} className="flex flex-wrap items-center gap-3 px-5 py-4">
              <span className="dashboard-icon flex h-9 w-9 shrink-0 items-center justify-center rounded-full font-display text-sm uppercase">{m.email[0]}</span>
              <div className="min-w-0 flex-1"><p className="truncate text-sm">{m.email}</p><p className={`text-[11px] ${m.status === 'Active' ? 'text-online' : 'text-muted-foreground'}`}>{m.owner ? 'Owner' : m.status}</p></div>
              {m.owner ? <span className="flex items-center gap-1.5 text-xs text-muted-foreground"><ShieldCheck size={14} />{m.role}</span> : (
                <>
                  <Select value={m.role} onValueChange={r => setMembers(list => list.map(x => x.email === m.email ? { ...x, role: r } : x))}>
                    <SelectTrigger className="h-9 w-36 rounded-full border-glass-border bg-transparent text-xs" aria-label={`Role for ${m.email}`}><SelectValue /></SelectTrigger>
                    <SelectContent>{roles.map(r => <SelectItem key={r.value} value={r.value}>{r.value}</SelectItem>)}</SelectContent>
                  </Select>
                  <Button variant="ghost" size="icon" onClick={() => setMembers(list => list.filter(x => x.email !== m.email))} aria-label={`Remove ${m.email}`} className="rounded-full"><Trash2 size={15} /></Button>
                </>
              )}
            </div>
          ))}
        </section>
      </div>

      <div className="space-y-6">
        <section className="dashboard-panel p-5 sm:p-7">
          <h2 className="font-display text-lg font-normal">Roles</h2>
          <div className="mt-4 space-y-4">{roles.map(r => <div key={r.value}><p className="text-sm">{r.value}</p><p className="mt-1 text-xs text-muted-foreground">{r.detail}</p></div>)}</div>
        </section>
        <section className="dashboard-panel p-5 sm:p-7">
          <h2 className="font-display text-lg font-normal">Recent admin activity</h2>
          <div className="mt-3 divide-y divide-glass-border">{activityLog.map((a, i) => <div key={i} className="py-3"><p className="text-sm">{a.what}</p><p className="mt-1 text-[11px] text-muted-foreground">{a.who} · {a.when}</p></div>)}</div>
        </section>
      </div>
    </div>
  );
}
