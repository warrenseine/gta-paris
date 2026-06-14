// Open-water test for the Seine. Shared so client prediction and the server
// agree on who's swimming / whose engine just died. Bridges and the île de la
// Cité count as dry land.

import type { Vec2 } from '../math.js';

export interface WaterField {
  seine: Vec2[];
  seineWidth: number;
  bridges: { x: number; z: number; rotationY: number; length: number; width: number }[];
  /** Île de la Cité (Notre-Dame's island), an ellipse of dry land in the river. */
  island?: { cx: number; cz: number; rx: number; rz: number };
}

function distToSeg(x: number, z: number, a: Vec2, b: Vec2): number {
  const abx = b.x - a.x;
  const abz = b.z - a.z;
  const t = Math.max(0, Math.min(1, ((x - a.x) * abx + (z - a.z) * abz) / (abx * abx + abz * abz || 1)));
  return Math.hypot(x - (a.x + abx * t), z - (a.z + abz * t));
}

/** True if (x,z) is over open Seine water — not on a bridge deck or the island. */
export function overWater(x: number, z: number, w: WaterField): boolean {
  if (w.island) {
    const dx = (x - w.island.cx) / w.island.rx;
    const dz = (z - w.island.cz) / w.island.rz;
    if (dx * dx + dz * dz <= 1) return false; // standing on the island
  }
  for (const b of w.bridges) {
    const cos = Math.cos(b.rotationY);
    const sin = Math.sin(b.rotationY);
    const dx = x - b.x;
    const dz = z - b.z;
    const lx = cos * dx - sin * dz;
    const lz = sin * dx + cos * dz;
    if (Math.abs(lx) <= b.length / 2 && Math.abs(lz) <= b.width / 2 + 1) return false; // on the deck
  }
  const hw = w.seineWidth / 2;
  for (let i = 0; i < w.seine.length - 1; i++) {
    if (distToSeg(x, z, w.seine[i], w.seine[i + 1]) < hw) return true;
  }
  return false;
}
