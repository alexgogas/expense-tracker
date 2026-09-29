import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import { viteStaticCopy } from 'vite-plugin-static-copy';

// categorization-engine.js stays at the repo root, unmoved and unmodified — it's documented
// (CLAUDE.md) as require()-able from Node as a plain CommonJS-ish script, so converting it to an
// ES module would break that. This copies that single root file into both the dev server's
// served output and the production build, without duplicating it.
export default defineConfig({
  // GitHub Pages serves this project from a subpath (https://<user>.github.io/expense-tracker/),
  // not the domain root — a relative base keeps every generated/rewritten asset URL (including
  // the /categorization-engine.js and /src/main.jsx references in web/index.html) correct there
  // without hardcoding the repo name, and still works unchanged for `vite dev`/`vite preview`.
  base: './',
  plugins: [
    preact(),
    viteStaticCopy({
      targets: [
        { src: '../categorization-engine.js', dest: '.' }
      ]
    })
  ]
});
