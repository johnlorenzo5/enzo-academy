import { loadEnvFile } from 'node:process';
import { fileURLToPath } from 'node:url';
import { buildFirebaseApp } from './firebase-app.js';
import { firebaseBackend } from './firebase-store.js';
try { loadEnvFile(fileURLToPath(new URL('../.env', import.meta.url))); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
import { buildApp } from './app.js';
const port = Number(process.env.PORT ?? 3001);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('PORT must be an integer between 1 and 65535');
}
const app = process.env.API_MODE === 'demo' ? buildApp({ logger: true }) : buildFirebaseApp({ ...firebaseBackend(), logger: true });
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    app.close().then(() => process.exit(0)).catch(error => { app.log.error(error); process.exit(1); });
  });
}
try {
  await app.listen({ port, host: process.env.HOST ?? '127.0.0.1' });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
