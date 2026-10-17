import { Link } from '@tanstack/react-router';
import { CLOUD_ADMIN_SECTIONS } from '@/lib/admin-cloud-sections';
import { Button } from '@/components/ui/button';

// Sub-navigation for the Cloud admin tree. Scrolls sideways on phones.
export function AdminCloudNav() {
  return (
    <nav aria-label="Cloud admin sections" className="-mx-1 mb-6 flex gap-1 overflow-x-auto px-1 pb-2">
      {CLOUD_ADMIN_SECTIONS.map(section => (
        <Button asChild variant="ghost" key={section.to} className="admin-nav-link h-10 shrink-0 justify-start rounded-lg px-4 font-normal">
          <Link to={section.to} activeOptions={{ exact: section.to === '/admin/cloud' }} activeProps={{ className: 'admin-nav-active' }}>
            <section.icon className="h-4 w-4" />{section.label}
          </Link>
        </Button>
      ))}
    </nav>
  );
}
