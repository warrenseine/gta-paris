// Cheap 2D collision used by the kinematic sim (no Rapier needed for Phase 1).
// Circle (player/car proxy) vs rotated box (building footprint).

import type { BuildingDef } from '../map/types.js';
import { CITY_RADIUS } from '../constants.js';

export interface Circle {
  x: number;
  z: number;
  r: number;
}

/**
 * Resolve a circle against a single rotated box; returns a corrected position.
 * Works in the box's local (axis-aligned) frame then rotates back.
 */
export function resolveCircleBox(c: Circle, b: BuildingDef): { x: number; z: number; hit: boolean } {
  const cos = Math.cos(-b.rotationY);
  const sin = Math.sin(-b.rotationY);
  // To local space (relative to box center, un-rotated).
  const dx = c.x - b.cx;
  const dz = c.z - b.cz;
  const lx = dx * cos - dz * sin;
  const lz = dx * sin + dz * cos;
  // Closest point on box to circle center.
  const px = Math.max(-b.hw, Math.min(b.hw, lx));
  const pz = Math.max(-b.hd, Math.min(b.hd, lz));
  const ox = lx - px;
  const oz = lz - pz;
  const d2 = ox * ox + oz * oz;
  if (d2 >= c.r * c.r) {
    // Could still be inside (center within box): handle penetration.
    const inside = lx > -b.hw && lx < b.hw && lz > -b.hd && lz < b.hd;
    if (!inside) return { x: c.x, z: c.z, hit: false };
  }
  let nx: number, nz: number, push: number;
  if (d2 > 1e-8) {
    const d = Math.sqrt(d2);
    nx = ox / d;
    nz = oz / d;
    push = c.r - d;
  } else {
    // Center inside box: push out along nearest face.
    const left = lx + b.hw;
    const right = b.hw - lx;
    const front = lz + b.hd;
    const back = b.hd - lz;
    const m = Math.min(left, right, front, back);
    if (m === left) {
      nx = -1; nz = 0; push = left + c.r;
    } else if (m === right) {
      nx = 1; nz = 0; push = right + c.r;
    } else if (m === front) {
      nx = 0; nz = -1; push = front + c.r;
    } else {
      nx = 0; nz = 1; push = back + c.r;
    }
  }
  const newLx = px + nx * c.r;
  const newLz = pz + nz * c.r;
  // Back to world space.
  const wcos = Math.cos(b.rotationY);
  const wsin = Math.sin(b.rotationY);
  const wx = newLx * wcos - newLz * wsin + b.cx;
  const wz = newLx * wsin + newLz * wcos + b.cz;
  void push;
  return { x: wx, z: wz, hit: true };
}

/** Resolve a circle against all buildings (broadphase by AABB radius). */
export function resolveAgainstBuildings(c: Circle, buildings: BuildingDef[]): Circle {
  let x = c.x;
  let z = c.z;
  for (const b of buildings) {
    const reach = Math.hypot(b.hw, b.hd) + c.r;
    if (Math.abs(x - b.cx) > reach || Math.abs(z - b.cz) > reach) continue;
    const r = resolveCircleBox({ x, z, r: c.r }, b);
    if (r.hit) {
      x = r.x;
      z = r.z;
    }
  }
  return { x, z, r: c.r };
}

/** Resolve a circle against tree trunks (circle-vs-circle pushout). */
export function resolveAgainstTrees(
  c: Circle,
  trees: { x: number; z: number }[],
  treeR: number,
): { x: number; z: number } {
  let x = c.x;
  let z = c.z;
  const min = c.r + treeR;
  for (const t of trees) {
    let dx = x - t.x;
    let dz = z - t.z;
    if (Math.abs(dx) > min || Math.abs(dz) > min) continue;
    const d = Math.hypot(dx, dz);
    if (d < min && d > 1e-4) {
      const push = min - d;
      dx /= d;
      dz /= d;
      x += dx * push;
      z += dz * push;
    }
  }
  return { x, z };
}

type Pt = { x: number; z: number };

function pointInPoly(x: number, z: number, poly: Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.z > z !== b.z > z && x < ((b.x - a.x) * (z - a.z)) / (b.z - a.z) + a.x) inside = !inside;
  }
  return inside;
}

function nearestOnPoly(x: number, z: number, poly: Pt[]): { px: number; pz: number; d: number } {
  let best = { px: poly[0].x, pz: poly[0].z, d: Infinity };
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    const abx = b.x - a.x;
    const abz = b.z - a.z;
    const t = Math.max(0, Math.min(1, ((x - a.x) * abx + (z - a.z) * abz) / (abx * abx + abz * abz || 1)));
    const px = a.x + abx * t;
    const pz = a.z + abz * t;
    const d = Math.hypot(x - px, z - pz);
    if (d < best.d) best = { px, pz, d };
  }
  return best;
}

/**
 * Clamp inside the Paris outline polygon (the Périphérique is the hard boundary).
 * Falls back to a circle if no polygon is supplied.
 */
export function clampToBounds(x: number, z: number, r: number, boundary?: Pt[]): { x: number; z: number } {
  if (boundary && boundary.length > 2) {
    const inside = pointInPoly(x, z, boundary);
    const n = nearestOnPoly(x, z, boundary);
    if (inside && n.d >= r) return { x, z };
    // Snap to r inside the boundary (centroid ≈ origin -> inward points to origin).
    const il = Math.hypot(n.px, n.pz) || 1;
    return { x: n.px - (n.px / il) * r, z: n.pz - (n.pz / il) * r };
  }
  const max = CITY_RADIUS - r;
  const d = Math.hypot(x, z);
  if (d > max) {
    const s = max / d;
    return { x: x * s, z: z * s };
  }
  return { x, z };
}
