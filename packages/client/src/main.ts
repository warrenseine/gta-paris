import { Game } from './core/Game.js';
import { Connection } from './net/Connection.js';
import { nicknameScreen } from './ui/NicknameScreen.js';

const app = document.getElementById('app');
if (!app) throw new Error('#app not found');

const nickname = await nicknameScreen();

// Connecting overlay (covers free-tier cold starts).
const status = document.createElement('div');
status.style.cssText =
  'position:fixed;inset:0;display:flex;align-items:center;justify-content:center;' +
  'background:#11141a;color:#fff;font-family:system-ui,sans-serif;font-size:20px;text-align:center;z-index:20;';
status.textContent = 'Connecting…';
document.body.appendChild(status);

const conn = new Connection();
try {
  await conn.join(nickname, {
    onRetry: (a) => {
      status.innerHTML =
        `Waking up the city…<div style="font-size:14px;opacity:.6;margin-top:8px">` +
        `free server cold start, ~30–60s (attempt ${a})</div>`;
    },
  });
} catch (err) {
  status.innerHTML =
    `<div>Could not reach the server.<br><span style="font-size:14px;opacity:.7">${String(err)}</span></div>`;
  throw err;
}
status.remove();

if (import.meta.env.DEV) (window as unknown as { __conn: Connection }).__conn = conn;

new Game(app, conn);
