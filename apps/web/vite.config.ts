import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  // Pre-bundle what the lazily loaded scene editor and map viewer import, so opening the first
  // scene or map in dev does not trigger a dependency re-optimisation and page reload.
  optimizeDeps: {
    include: ['@tiptap/pm/state', '@tiptap/pm/view', 'leaflet', 'react-dom/server'],
  },
  server: {
    port: 5173,
    strictPort: true,
    // Same-origin API calls: session cookies work without CORS.
    proxy: { '/api': 'http://localhost:3000' },
  },
});
