import { rm } from 'node:fs/promises';
import { buildApp } from './app';
import { sql } from './db/client';
import { env } from './env';
import { uploadsDir } from './modules/atlas/files';
import { resumeTiling } from './modules/atlas/tiling';

const app = await buildApp({ logger: { level: env.isProduction ? 'info' : 'debug' } });

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, async () => {
    await app.close();
    await sql.end({ timeout: 5 });
    process.exit(0);
  });
}

// Nothing is mid-upload at startup, so any half-received files are leftovers from a crash.
await rm(uploadsDir(), { recursive: true, force: true });
await app.listen({ host: env.API_HOST, port: env.API_PORT });
// Maps that were mid-tiling when the server last stopped start over.
await resumeTiling(app.log);
