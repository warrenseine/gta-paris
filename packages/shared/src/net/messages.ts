// Client -> server and server -> client message payloads (non-state events).
import type { InputCommand } from '../input.js';

export const MSG = {
  input: 'i',
  fire: 'f',
  fireEvent: 'fx',
  explosion: 'ex',
} as const;

/** Server -> clients: an explosion to render (destroyed car). */
export interface ExplosionEvent {
  x: number;
  z: number;
}

export type InputMessage = InputCommand;

/** Client -> server: a hitscan shot request (validated server-side in Phase 4). */
export interface FireMessage {
  seq: number;
  ox: number;
  oz: number;
  dx: number;
  dz: number;
  weaponId: number;
  clientTick: number;
}

/** Server -> clients: cosmetic tracer/hit to render. */
export interface FireEvent {
  ox: number;
  oz: number;
  tx: number;
  tz: number;
  hit: boolean;
  weaponId: number;
}
