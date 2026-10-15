import { createFileRoute } from '@tanstack/react-router';
import { AdminShell } from '@/components/admin-shell';
import { AdminTeam } from '@/components/admin-team';

export const Route = createFileRoute('/admin/team')({
  head: () => ({
    meta: [
      { title: 'Admin team — CoralzOne Admin' },
      { name: 'description', content: 'Invite admins and manage their access.' },
      { property: 'og:title', content: 'Admin team — CoralzOne Admin' },
      { property: 'og:description', content: 'Invite admins and manage their access.' },
      { property: 'og:type', content: 'website' },
      { name: 'twitter:card', content: 'summary' },
      { name: 'robots', content: 'noindex, nofollow' },
    ],
  }),
  component: () => <AdminShell title="Admin team" subtitle="Invite admins and manage their access."><AdminTeam /></AdminShell>,
});
