import type { Server as HttpServer } from 'node:http';
import type { InputCommand } from '@gta/shared';

// Optional WebRTC (geckos.io) datachannel for low-latency, unreliable input —
// avoids TCP head-of-line blocking on the hottest path. Everything degrades to
// the reliable Colyseus WebSocket if WebRTC can't init or a client can't connect.

type InputCb = (cmd: InputCommand) => void;
const inputHandlers = new Map<string, InputCb>();

/** ParisRoom registers a per-player input sink (same path as the WS MSG.input). */
export function registerUdpInput(sessionId: string, cb: InputCb) {
  inputHandlers.set(sessionId, cb);
}
export function unregisterUdpInput(sessionId: string) {
  inputHandlers.delete(sessionId);
}

// UDP port range for the datachannels — must be opened in the firewall/Security
// Group and reachable on the host's public IP (run the container host-networked).
const UDP_MIN = Number(process.env.GECKOS_UDP_MIN ?? 20000);
const UDP_MAX = Number(process.env.GECKOS_UDP_MAX ?? 20100);

export async function setupUdp(httpServer: HttpServer): Promise<void> {
  try {
    const { default: geckos } = await import('@geckos.io/server');
    const io = geckos({ portRange: { min: UDP_MIN, max: UDP_MAX }, iceServers: [] });
    io.addServer(httpServer);
    io.onConnection((channel) => {
      channel.onDisconnect(() => {
        /* channel maps to a session via auth; nothing to free here */
      });
      // Client announces which Colyseus session this channel belongs to.
      channel.on('auth', (sessionId: unknown) => {
        if (typeof sessionId === 'string') channel.userData.sessionId = sessionId;
      });
      // Unreliable movement input → route into that player's sim queue.
      channel.on('input', (data: unknown) => {
        const sid = channel.userData.sessionId as string | undefined;
        if (sid) inputHandlers.get(sid)?.(data as InputCommand);
      });
    });
    console.log(`[gta-paris] WebRTC (geckos) input channel up, UDP ${UDP_MIN}-${UDP_MAX}`);
  } catch (err) {
    console.warn('[gta-paris] WebRTC unavailable, using WebSocket only:', (err as Error).message);
  }
}
