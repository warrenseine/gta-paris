import { Client, getStateCallbacks, type Room } from 'colyseus.js';
import geckos, { type ClientChannel } from '@geckos.io/client';
import { MSG, type InputCommand } from '@gta/shared';

// Wraps the Colyseus client/room (reliable WebSocket) plus an optional geckos.io
// WebRTC datachannel for low-latency, unreliable movement input. Falls back to
// the WebSocket if the datachannel never opens.
export class Connection {
  private client: Client;
  room!: Room;
  sessionId = '';
  $!: ReturnType<typeof getStateCallbacks>;
  private channel: ClientChannel | null = null;
  private udpReady = false;

  constructor(endpoint?: string) {
    // Prod: same origin as the page (server serves the client). Dev: VITE_SERVER_URL.
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const url = endpoint ?? import.meta.env.VITE_SERVER_URL ?? `${proto}://${location.host}`;
    this.client = new Client(url);
  }

  /**
   * Join the default instance, retrying through a cold start (free-tier hosts
   * sleep when idle and take ~30-60s to wake; the first join races the spin-up).
   */
  async join(
    nickname: string,
    opts: { timeoutMs?: number; onRetry?: (attempt: number) => void } = {},
  ): Promise<Room> {
    const deadline = Date.now() + (opts.timeoutMs ?? 90_000);
    let attempt = 0;
    for (;;) {
      try {
        this.room = await this.client.joinOrCreate('paris', { nickname });
        this.sessionId = this.room.sessionId;
        this.$ = getStateCallbacks(this.room);
        this.openChannel(); // best-effort WebRTC; never blocks the join
        return this.room;
      } catch (err) {
        attempt++;
        if (Date.now() >= deadline) throw err;
        opts.onRetry?.(attempt);
        await new Promise((r) => setTimeout(r, 2000));
      }
    }
  }

  /** Open the WebRTC datachannel and authenticate it to this session. */
  private openChannel() {
    try {
      // Signaling rides the same origin (through Caddy/HTTPS); ICE finds the
      // server's UDP port directly. Default port is the page port (443/80).
      const channel = geckos({ port: location.protocol === 'https:' ? 443 : 80 });
      this.channel = channel;
      channel.onConnect((err) => {
        if (err) {
          this.udpReady = false;
          return; // stay on WebSocket
        }
        channel.emit('auth', this.sessionId, { reliable: true });
        this.udpReady = true;
      });
      channel.onDisconnect(() => {
        this.udpReady = false;
      });
    } catch {
      this.udpReady = false;
    }
  }

  /** Movement input: unreliable WebRTC when available, else reliable WebSocket. */
  sendInput(cmd: InputCommand) {
    if (this.udpReady && this.channel) this.channel.emit('input', cmd as unknown as Record<string, unknown>);
    else this.room.send(MSG.input, cmd);
  }
}
