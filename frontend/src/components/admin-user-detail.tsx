import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import { ArrowLeft, Ban, ShieldAlert, ShieldCheck, Plus, RotateCcw, Mail, Calendar, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAdminUsers, updateUser } from '@/lib/admin-store';
import { formatNaira } from '@/lib/admin-data';
import { statusClass } from '@/components/admin-users';

const roles = ['Member', 'Moderator', 'Support', 'Admin'];

export function AdminUserDetail({ userId }: { userId: string }) {
  const user = useAdminUsers().find(u => u.id === userId);
  const [amount, setAmount] = useState('');
  const [notice, setNotice] = useState('');

  if (!user) {
    return (
      <div className="py-16 text-center">
        <p className="text-sm text-muted-foreground">This user could not be found.</p>
        <Button asChild variant="glass" className="mt-6 font-normal"><Link to="/admin/users"><ArrowLeft />Back to users</Link></Button>
      </div>
    );
  }

  const act = (message: string, patch: Parameters<typeof updateUser>[1]) => { updateUser(user.id, patch); setNotice(message); };
  const credit = () => {
    const value = Math.round(Number(amount));
    if (!Number.isFinite(value) || value <= 0) { setNotice('Enter an amount greater than zero.'); return; }
    act(`${formatNaira(value)} added to ${user.name}'s wallet.`, { balance: user.balance + value });
    setAmount('');
  };

  return (
    <>
      <Button asChild variant="ghost" className="mb-4 rounded-full px-2 text-xs font-normal"><Link to="/admin/users"><ArrowLeft />All users</Link></Button>

      <section className="dashboard-panel flex flex-col gap-5 p-5 sm:flex-row sm:items-center sm:p-7">
        <span className="dashboard-icon flex h-16 w-16 shrink-0 items-center justify-center rounded-full font-display text-2xl">{user.name[0]}</span>
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-2xl font-normal">{user.name}</h2>
          <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5"><Mail size={13} />{user.email}</span>
            <span className="flex items-center gap-1.5"><Calendar size={13} />Joined {user.joined}</span>
            <span className="flex items-center gap-1.5"><Clock size={13} />Seen {user.lastSeen}</span>
          </div>
        </div>
        <span className={`text-sm ${statusClass(user.status)}`}>{user.status}</span>
      </section>

      {notice && <p role="status" className="dashboard-panel mt-4 px-5 py-3 text-sm">{notice}</p>}

      <div className="mt-6 grid grid-cols-3 gap-3 sm:gap-5">
        {[{ label: 'Balance', value: formatNaira(user.balance) }, { label: 'API usage', value: user.usage.toLocaleString() }, { label: 'Plan', value: user.plan }].map(s => (
          <div key={s.label} className="dashboard-panel p-4 sm:p-5"><p className="text-xs text-muted-foreground">{s.label}</p><p className="mt-2 text-xl font-normal tabular-nums sm:text-2xl">{s.value}</p></div>
        ))}
      </div>

      <div className="mt-6 grid items-start gap-6 lg:grid-cols-2">
        <section className="dashboard-panel p-5 sm:p-7">
          <h3 className="font-display text-lg font-normal">Account status</h3>
          <p className="mt-1 text-xs text-muted-foreground">Restricted users can sign in but cannot spend. Suspended users are blocked.</p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Button variant="glass" disabled={user.status === 'Restricted'} onClick={() => act(`${user.name} is now restricted.`, { status: 'Restricted' })} className="font-normal"><ShieldAlert />Restrict</Button>
            <Button variant="glass" disabled={user.status === 'Suspended'} onClick={() => act(`${user.name} has been suspended.`, { status: 'Suspended' })} className="font-normal"><Ban />Ban / suspend</Button>
            <Button variant="crystal" disabled={user.status === 'Active'} onClick={() => act(`${user.name} is active again.`, { status: 'Active' })} className="font-normal"><ShieldCheck />Unsuspend</Button>
          </div>
        </section>

        <section className="dashboard-panel p-5 sm:p-7">
          <h3 className="font-display text-lg font-normal">Role</h3>
          <p className="mt-1 text-xs text-muted-foreground">Controls what this person can access.</p>
          <Select value={user.role} onValueChange={role => act(`${user.name}'s role changed to ${role}.`, { role })}>
            <SelectTrigger className="mt-5 rounded-full border-glass-border bg-transparent" aria-label="User role"><SelectValue /></SelectTrigger>
            <SelectContent>{roles.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
          </Select>
        </section>

        <section className="dashboard-panel p-5 sm:p-7">
          <h3 className="font-display text-lg font-normal">Add money</h3>
          <p className="mt-1 text-xs text-muted-foreground">Credit this user's wallet manually.</p>
          <div className="mt-5 flex gap-3">
            <Input type="number" min={1} inputMode="numeric" value={amount} onChange={e => setAmount(e.target.value)} placeholder="Amount in ₦" aria-label="Amount to add" className="rounded-full border-glass-border bg-transparent" />
            <Button variant="crystal" onClick={credit} className="shrink-0 font-normal"><Plus />Add</Button>
          </div>
        </section>

        <section className="dashboard-panel p-5 sm:p-7">
          <h3 className="font-display text-lg font-normal">Reset usage</h3>
          <p className="mt-1 text-xs text-muted-foreground">Sets this month's API usage back to zero.</p>
          <Button variant="glass" disabled={user.usage === 0} onClick={() => act(`${user.name}'s usage was reset.`, { usage: 0 })} className="mt-5 font-normal"><RotateCcw />Reset usage</Button>
        </section>
      </div>
    </>
  );
}
