/**
 * Vite is two things at once, and it helps to keep them apart.
 *
 * In development it is a server that hands the browser your source files
 * almost untouched, and replaces a module the instant you save it. In
 * production it is a bundler that packs everything into a few static files.
 * The same config describes both.
 *
 * The proxy below is the whole reason this project needs no CORS headers in
 * development. The browser refuses to let a page served from one origin read
 * a response from another — that is the same-origin policy, and localhost:5173
 * and localhost:3000 are different origins. Rather than weakening the API to
 * accommodate the browser, the dev server forwards anything starting with
 * /api to the API itself. As far as the browser is concerned there is one
 * origin and no cross-origin request ever happens.
 */
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

/**
 * `mode` is what `--mode demo` sets, and it is the only switch the demo
 * build needs.
 *
 * The flag is defined here rather than in a .env file so that there is one
 * fewer file to keep in step, and so that nothing about the demo depends on
 * an environment variable being set correctly on whatever machine builds it.
 * `define` performs a literal substitution at build time, which is also what
 * lets the bundler drop the branch that is not taken.
 */
export default defineConfig(({ mode }) => ({
  define: {
    'import.meta.env.VITE_DEMO': JSON.stringify(mode === 'demo' ? '1' : ''),
  },
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        // The API has no /api prefix of its own: /api/wards must arrive as
        // /wards. The prefix exists only to tell the dev server what to
        // forward.
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
  },
}));
