import { Client, getStateCallbacks, type Room } from 'colyseus.js';
import { MSG, type InputCommand } from '@gta/shared';

// Wraps the Colyseus client/room. Transport is WebSocket (Phase 2); swap to
// WebRTC datachannels later behind this class.
export class Connection {
  private client: Client;
  room!: Room;
  sessionId = '';
  $!: ReturnType<typeof getStateCallbacks>;

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
        return this.room;
      } catch (err) {
        attempt++;
        if (Date.now() >= deadline) throw err;
        opts.onRetry?.(attempt);
        await new Promise((r) => setTimeout(r, 2000));
      }
    }
  }

  sendInput(cmd: InputCommand) {
    this.room.send(MSG.input, cmd);
  }
}
