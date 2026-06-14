import { fileURLToPath } from 'node:url';
import { createServer } from 'node:http';
import { existsSync } from 'node:fs';
import express from 'express';
import { Server } from 'colyseus';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { ParisRoom } from './rooms/ParisRoom.js';

const PORT = Number(process.env.PORT ?? 2567);

const app = express();

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

// Serve the built client (single-process deploy). Path resolves the same from
// src/ (tsx dev) and dist/ (prod) — both live one level under packages/server.
const clientDist = fileURLToPath(new URL('../../client/dist', import.meta.url));
if (existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get('*', (_req, res) => res.sendFile(`${clientDist}/index.html`));
  console.log('[gta-paris] serving client from', clientDist);
} else {
  console.log('[gta-paris] client build not found (dev mode); run the Vite dev server separately');
}

const httpServer = createServer(app);
const gameServer = new Server({ transport: new WebSocketTransport({ server: httpServer }) });
gameServer.define('paris', ParisRoom);

gameServer
  .listen(PORT)
  .then(() => console.log(`[gta-paris] listening on http://localhost:${PORT}`))
  .catch((err: unknown) => {
    console.error('[gta-paris] failed to start:', err);
    process.exit(1);
  });
