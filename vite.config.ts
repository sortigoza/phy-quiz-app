import { readFileSync } from 'node:fs';
import { defineConfig, type Plugin } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import pkg from './package.json' with { type: 'json' };
import { renderLlmsTxt } from './src/docs/llms';

/**
 * Files served beside the app at stable paths, so they can be linked to:
 * `llms.txt` for AI agents, and the example banks and repository the docs link to.
 * Emitted into the build and served by the dev server from the same map.
 */
function publishedFiles(): Plugin {
  const files: Record<string, { type: string; read: () => string }> = {
    'llms.txt': {
      type: 'text/plain; charset=utf-8',
      read: () => renderLlmsTxt(pkg.version),
    },
    ...Object.fromEntries(
      ['kinematics.json', 'advanced-quantum-mechanics.json', 'physics-course.json'].map((name) => [
        `examples/${name}`,
        {
          type: 'application/json; charset=utf-8',
          read: () => readFileSync(new URL(`./examples/${name}`, import.meta.url), 'utf8'),
        },
      ]),
    ),
  };

  return {
    name: 'published-files',
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const file = files[(request.url ?? '').split('?')[0]?.replace(/^\//, '') ?? ''];
        if (!file) return next();
        response.setHeader('Content-Type', file.type);
        response.end(file.read());
      });
    },
    generateBundle() {
      for (const [fileName, file] of Object.entries(files)) {
        this.emitFile({ type: 'asset', fileName, source: file.read() });
      }
    },
  };
}

export default defineConfig({
  // Relative base: the same build works at a domain root, on a GitHub Pages
  // project subpath, or from any static host, with no rebuild. See SPEC section 11.
  base: './',
  plugins: [
    react(),
    publishedFiles(),
    // Prompt mode: a new service worker waits until the app offers a reload,
    // and the app never offers it during an attempt. See SPEC section 8.4.
    VitePWA({
      registerType: 'prompt',
      injectRegister: false,
      // The glob below already takes the icons; listing them again duplicates them.
      includeManifestIcons: false,
      manifest: {
        name: 'Physics Quiz',
        short_name: 'Physics Quiz',
        description: 'Local-first progressive web app for multiple-choice physics quizzes.',
        // Relative, so the app installs and works at a GitHub Pages project
        // subpath as well as at a domain root. See SPEC section 11.
        start_url: '.',
        scope: './',
        display: 'standalone',
        theme_color: '#07050d',
        background_color: '#07050d',
        icons: [
          { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'maskable-icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // The app shell, its icons, the KaTeX fonts (woff2 is all a browser
        // that runs a service worker asks for) and the library music. Banks are
        // data, held in IndexedDB, so the examples and llms.txt stay out.
        globPatterns: ['**/*.{html,js,css,woff2,png,svg,ico,mid}'],
        // Every navigation is the one page: bank links live in the fragment.
        navigateFallback: 'index.html',
      },
    }),
  ],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}', 'scripts/**/*.test.ts'],
  },
});
