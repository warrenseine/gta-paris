import type { Server as HttpServer } from 'node:http';
import type { InputCommand } from '@gta/shared';

// Optional WebRTC (geckos.io) datachannel for low-latency, unreliable input —
// avoids TCP head-of-line blocking on the hottest path. Everything degrades to
// the reliable Colyseus WebSocket if WebRTC can't init or a client can't connect.

type InputCb = (cmd: InputCommand) => void;
const inputHandlers = new Map<string, InputCb>();
// Open datachannels keyed by Colyseus sessionId, for pushing snapshots down.
const channels = new Map<string, { emit: (event: string, data: unknown) => void }>();

/** ParisRoom registers a per-player input sink (same path as the WS MSG.input). */
export function registerUdpInput(sessionId: string, cb: InputCb) {
  inputHandlers.set(sessionId, cb);
}
export function unregisterUdpInput(sessionId: string) {
  inputHandlers.delete(sessionId);
}

/** True if this session has a live datachannel (so the server should stream UDP). */
export function hasUdpChannel(sessionId: string): boolean {
  return channels.has(sessionId);
}

/** Push an unreliable position snapshot down the datachannel, if connected. */
export function sendSnapshot(sessionId: string, data: unknown) {
  channels.get(sessionId)?.emit('snapshot', data);
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
        const sid = channel.userData.sessionId as string | undefined;
        if (sid) channels.delete(sid);
      });
      // Client announces which Colyseus session this channel belongs to.
      channel.on('auth', (sessionId: unknown) => {
        if (typeof sessionId === 'string') {
          channel.userData.sessionId = sessionId;
          channels.set(sessionId, channel as unknown as { emit: (e: string, d: unknown) => void });
        }
      });
      // Unreliable movement input → route into that player's sim queue.
      channel.on('input', (data: unknown) => {
        const sid = channel.userData.sessionId as string | undefined;
        if (sid) inputHandlers.get(sid)?.(data as InputCommand);
      });
      // Round-trip ping for the in-game net readout.
      channel.on('ping', (t) => channel.emit('pong', t));
    });
    console.log(`[gta-paris] WebRTC (geckos) input channel up, UDP ${UDP_MIN}-${UDP_MAX}`);
  } catch (err) {
    console.warn('[gta-paris] WebRTC unavailable, using WebSocket only:', (err as Error).message);
  }
}
