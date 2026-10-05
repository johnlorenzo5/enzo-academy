import { defineConfig } from 'vite';
import { setTimeout as delay } from 'node:timers/promises';

async function waitForApi() {
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch('http://127.0.0.1:3001/api/health', {
        signal: AbortSignal.timeout(1000),
      });
      if (response.ok && (await response.json()).status === 'ok') return;
    } catch { /* The API may still be starting. */ }
    await delay(250);
  }
  throw new Error('API did not become ready at http://127.0.0.1:3001. Check the [api] startup error. Run npm run dev from the school directory to start both servers.');
}

export default defineConfig({
  plugins: [{
    name: 'wait-for-api',
    async configureServer() { await waitForApi(); },
  }],
  server: { host: '127.0.0.1', port: 5173, strictPort: true,
    proxy: { '/api': 'http://127.0.0.1:3001' } },
});
