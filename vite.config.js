import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: { target: 'es2020', chunkSizeWarningLimit: 700 }, // three.js alone is ~550 kB minified
  // recon/ is the reconstruction package; its data/ holds GBs of local-only images, videos and
  // COLMAP output that the dev server must not crawl.
  server: { watch: { ignored: ['**/recon/**'] } },
});
