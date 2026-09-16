import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';

// Fills %TITLE% / %DESCRIPTION% in index.html from content.json so the tab title and link
// previews (which read the static HTML, not the JS) match the wedding. Read on every call so
// dev-server edits show on the next reload.
function contentHtml() {
  const attr = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  return {
    name: 'wedding-content-html',
    transformIndexHtml(html) {
      const c = JSON.parse(readFileSync(new URL('./content.json', import.meta.url), 'utf8'));
      const title = (c.site && c.site.title) || `${c.couple.partner1} & ${c.couple.partner2} — Wedding`;
      const description = (c.site && c.site.description) || '';
      return html.replace(/%TITLE%/g, attr(title)).replace(/%DESCRIPTION%/g, attr(description));
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [contentHtml()],
  build: { target: 'es2020', chunkSizeWarningLimit: 700 }, // three.js alone is ~550 kB minified
  // recon/ is the model package; its data/ holds hundreds of MB of local-only bakes, reference
  // images and .blend snapshots that the dev server must not crawl.
  server: { watch: { ignored: ['**/recon/**'] } },
});
