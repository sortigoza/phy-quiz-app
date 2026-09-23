import { readFileSync } from 'node:fs';
import { defineConfig, type Plugin } from 'vitest/config';
import react from '@vitejs/plugin-react';
import pkg from './package.json' with { type: 'json' };
import { renderLlmsTxt } from './src/docs/llms';

/**
 * Files served beside the app at stable paths, so they can be linked to:
 * `llms.txt` for AI agents, and the example bank the Help screen offers.
 * Emitted into the build and served by the dev server from the same map.
 */
function publishedFiles(): Plugin {
  const files: Record<string, { type: string; read: () => string }> = {
    'llms.txt': {
      type: 'text/plain; charset=utf-8',
      read: () => renderLlmsTxt(pkg.version),
    },
    'examples/kinematics.json': {
      type: 'application/json; charset=utf-8',
      read: () => readFileSync(new URL('./examples/kinematics.json', import.meta.url), 'utf8'),
    },
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
  plugins: [react(), publishedFiles()],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
