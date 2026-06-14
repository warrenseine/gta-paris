// Hitscan resolution in the XZ plane. Ray vs target circles, occluded by
// building boxes. Server-authoritative; client runs same math for predicted FX.

import type { BuildingDef } from '../map/types.js';

export interface HitTarget {
  id: string;
  x: number;
  z: number;
  r: number;
}

export interface RayHit {
  targetId: string;
  /** Distance along ray. */
  t: number;
  x: number;
  z: number;
}

/** Ray-circle: returns nearest positive t or null. */
function rayCircle(
  ox: number,
  oz: number,
  dx: number,
  dz: number,
  cx: number,
  cz: number,
  r: number,
): number | null {
  const fx = ox - cx;
  const fz = oz - cz;
  const a = dx * dx + dz * dz;
  const b = 2 * (fx * dx + fz * dz);
  const c = fx * fx + fz * fz - r * r;
  const disc = b * b - 4 * a * c;
  if (disc < 0) return null;
  const sq = Math.sqrt(disc);
  const t1 = (-b - sq) / (2 * a);
  if (t1 >= 0) return t1;
  const t2 = (-b + sq) / (2 * a);
  return t2 >= 0 ? t2 : null;
}

/** Ray vs rotated box; returns entry t or null. */
function rayBox(
  ox: number,
  oz: number,
  dx: number,
  dz: number,
  b: BuildingDef,
): number | null {
  // Transform ray to box local frame.
  const cos = Math.cos(-b.rotationY);
  const sin = Math.sin(-b.rotationY);
  const rx = ox - b.cx;
  const rz = oz - b.cz;
  const lox = rx * cos - rz * sin;
  const loz = rx * sin + rz * cos;
  const ldx = dx * cos - dz * sin;
  const ldz = dx * sin + dz * cos;
  let tmin = -Infinity;
  let tmax = Infinity;
  // X slab.
  if (Math.abs(ldx) < 1e-8) {
    if (lox < -b.hw || lox > b.hw) return null;
  } else {
    let t1 = (-b.hw - lox) / ldx;
    let t2 = (b.hw - lox) / ldx;
    if (t1 > t2) [t1, t2] = [t2, t1];
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
  }
  // Z slab.
  if (Math.abs(ldz) < 1e-8) {
    if (loz < -b.hd || loz > b.hd) return null;
  } else {
    let t1 = (-b.hd - loz) / ldz;
    let t2 = (b.hd - loz) / ldz;
    if (t1 > t2) [t1, t2] = [t2, t1];
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
  }
  if (tmax < Math.max(tmin, 0)) return null;
  return tmin >= 0 ? tmin : 0;
}

/**
 * Cast a ray from origin in unit dir up to maxRange.
 * Returns nearest target hit, or null if a wall blocks first / nothing hit.
 */
export function castRay(
  ox: number,
  oz: number,
  dx: number,
  dz: number,
  maxRange: number,
  targets: HitTarget[],
  buildings: BuildingDef[],
): RayHit | null {
  // Nearest wall distance.
  let wall = maxRange;
  for (const b of buildings) {
    const reach = Math.hypot(b.hw, b.hd);
    // Cheap broadphase: skip boxes clearly behind/away (center projection).
    const toC = (b.cx - ox) * dx + (b.cz - oz) * dz;
    if (toC < -reach || toC > maxRange + reach) continue;
    const t = rayBox(ox, oz, dx, dz, b);
    if (t !== null && t < wall) wall = t;
  }
  // Nearest target within wall distance.
  let best: RayHit | null = null;
  for (const tg of targets) {
    const t = rayCircle(ox, oz, dx, dz, tg.x, tg.z, tg.r);
    if (t === null || t > wall || t > maxRange) continue;
    if (!best || t < best.t) {
      best = { targetId: tg.id, t, x: ox + dx * t, z: oz + dz * t };
    }
  }
  return best;
}
