import { Hammer } from 'lucide-react';

// Honest placeholder for a branch that exists in the tree but isn't built
// yet. Shows no fake numbers — only what the page will do and when.
export function AdminCloudPlanned({ step, items }: { step: number; items: string[] }) {
  return (
    <section className="dashboard-panel p-5 sm:p-7" aria-label="Not built yet">
      <div className="flex items-center gap-3">
        <Hammer size={18} className="text-primary-glow" aria-hidden="true" />
        <h3 className="font-display text-lg font-normal">Arrives in build step {step}</h3>
      </div>
      <p className="mt-3 text-sm text-muted-foreground">This page is wired into the admin tree already. It will do the following once its step ships:</p>
      <ul className="mt-4 space-y-2 text-sm">
        {items.map(item => (
          <li key={item} className="flex gap-2"><span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-primary-glow" aria-hidden="true" /><span>{item}</span></li>
        ))}
      </ul>
    </section>
  );
}
