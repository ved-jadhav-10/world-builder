import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  // Pre-bundle editor internals the lazily loaded scene editor imports, so opening the first
  // scene in dev does not trigger a dependency re-optimisation and page reload.
  optimizeDeps: { include: ['@tiptap/pm/state', '@tiptap/pm/view'] },
  server: {
    port: 5173,
    strictPort: true,
    // Same-origin API calls: session cookies work without CORS.
    proxy: { '/api': 'http://localhost:3000' },
  },
});
