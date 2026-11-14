import { defineConfig } from 'tsup';

export default defineConfig({
  entry: { server: 'src/server.ts', migrate: 'src/db/migrate.ts' },
  format: 'esm',
  target: 'node22',
  platform: 'node',
  clean: true,
  // The shared package ships TypeScript source, so bundle it in.
  noExternal: ['@atlas/shared'],
});
