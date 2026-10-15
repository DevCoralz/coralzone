export function dashboardHead(title: string, description: string, path: string, origin = '') {
  return {
    meta: [
      { title: `${title} — CoralzOne` }, { name: 'description', content: description },
      { property: 'og:title', content: `${title} — CoralzOne` },
      { property: 'og:description', content: description }, { property: 'og:type', content: 'website' },
      { name: 'twitter:card', content: 'summary_large_image' },
    ],
    links: origin ? [{ rel: 'canonical', href: `${origin}${path}` }] : [],
  };
}