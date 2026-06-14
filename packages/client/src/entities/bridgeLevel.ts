import { bridgeHeight } from '@gta/shared';

// Shared bridge list so any entity can raise its mesh onto a deck. The sim is
// 2D (x,z); deck height is purely visual, so we resolve it at render time.
let bridges: { x: number; z: number; rotationY: number; length: number; width: number }[] = [];

export function setBridges(b: typeof bridges) {
  bridges = b;
}

/** Deck-top y at (x,z), or 0 on open ground. */
export function bridgeY(x: number, z: number): number {
  return bridges.length ? bridgeHeight(x, z, bridges) : 0;
}
