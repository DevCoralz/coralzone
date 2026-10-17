// <head> metadata for every /admin/cloud/* page. Always noindex.
export function cloudAdminHead(title: string, description: string) {
  const full = `${title} — CoralzOne Admin`;
  return {
    meta: [
      { title: full },
      { name: 'description', content: description },
      { property: 'og:title', content: full },
      { property: 'og:description', content: description },
      { property: 'og:type', content: 'website' },
      { name: 'twitter:card', content: 'summary' },
      { name: 'robots', content: 'noindex, nofollow' },
    ],
  };
}
