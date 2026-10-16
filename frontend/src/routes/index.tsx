import { createFileRoute, Link } from "@tanstack/react-router";
import bg from "@/assets/crystal-bg.jpg";
import { Button } from "@/components/ui/button";
import { SiteActivity } from "@/components/site-activity";
import { CloudAnnouncements } from "@/components/cloud-announcements";
import { getBrandMetadata } from "@/lib/brand.functions";

export const Route = createFileRoute("/")({
  loader: () => getBrandMetadata(),
  head: ({ loaderData }) => ({
    meta: [
      { title: "CoralzOne — Cloud, APIs, Numbers & More" },
      { name: "description", content: "One ecosystem: cloud storage, REST APIs, foreign numbers, and more." },
      { property: "og:title", content: "CoralzOne — One ecosystem for everything" },
      { property: "og:description", content: "Cloud storage, REST APIs, foreign numbers, and more." },
      { property: "og:type", content: "website" },
      { property: "og:site_name", content: "CoralzOne" },
      { property: "og:url", content: `${loaderData?.origin ?? ""}/` },
      ...(loaderData?.socialImage ? [
        { property: "og:image", content: loaderData.socialImage },
        { name: "twitter:image", content: loaderData.socialImage },
      ] : []),
      { property: "og:image:width", content: "1200" },
      { property: "og:image:height", content: "630" },
      { property: "og:image:alt", content: "CoralzOne royal-blue crystal logo — Cloud, REST APIs and Foreign Numbers" },
      { name: "twitter:title", content: "CoralzOne — One ecosystem" },
      { name: "twitter:description", content: "Cloud storage, REST APIs, foreign numbers and more in one crystal-clear place." },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [{ rel: "canonical", href: `${loaderData?.origin ?? ""}/` }],
    scripts: [{ type: "application/ld+json", children: JSON.stringify({
      "@context": "https://schema.org", "@type": "WebSite", name: "CoralzOne", alternateName: "Coralz One", url: `${loaderData?.origin ?? ""}/`,
    }) }],
  }),
  component: Index,
});

const features = ["Cloud", "REST APIs", "Foreign Numbers", "More soon"];

function Index() {
  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden">
      <img src={bg} alt="" className="absolute inset-0 -z-10 h-full w-full object-cover" />
      <div className="absolute inset-0 -z-10 bg-overlay" />

      <header className="flex items-center justify-between px-6 py-5">
        <span className="font-display text-xl font-normal text-foreground">CoralzOne</span>
        <Button asChild variant="crystal" className="px-5 py-2 text-sm"><Link to="/auth">Sign in</Link></Button>
      </header>

      <main className="flex flex-1 items-center justify-center px-5 py-5">
        <div className="glass-card w-full max-w-xl p-6 text-center sm:p-10">
          <p className="mb-4 text-xs uppercase text-muted-foreground">One ecosystem</p>
          <h1 className="font-display text-4xl font-normal text-foreground text-glow sm:text-6xl">CoralzOne</h1>
          <p className="mx-auto mt-5 max-w-md text-base text-muted-foreground">
            Store files in the Cloud, plug into REST APIs, grab foreign numbers — all in one crystal-clear place. More tools landing as we grow.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            {features.map((f) => (
              <span key={f} className="glass-chip px-3 py-1 text-xs">{f}</span>
            ))}
          </div>
          <Button asChild variant="crystal" className="mt-7 h-auto px-10 py-4 text-base font-semibold"><Link to="/auth">Get Started</Link></Button>
          <div className="mt-4"><Button asChild variant="link" className="text-xs font-normal text-muted-foreground"><Link to="/dashboard">Explore dashboard</Link></Button></div>
          <SiteActivity />
        </div>
      </main>

      <CloudAnnouncements />
      <footer className="py-5 text-center text-xs text-muted-foreground">
        © {new Date().getFullYear()} · Powered by <span className="font-semibold text-foreground">Coralz</span>
      </footer>
    </div>
  );
}
