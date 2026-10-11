import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globalSetup: ['./test/global-setup.ts'],
    // Uploaded map files go to a throwaway folder, never the dev storage.
    env: { STORAGE_DIR: join(tmpdir(), 'atlas-ink-test-storage') },
    // Test files share one database.
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 30_000,
  },
});
