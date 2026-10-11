import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/server.ts'],
  format: 'esm',
  target: 'node22',
  platform: 'node',
  clean: true,
  // The shared package ships TypeScript source, so bundle it in.
  noExternal: ['@atlas/shared'],
});
