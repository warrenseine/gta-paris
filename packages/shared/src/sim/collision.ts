// Cheap 2D collision used by the kinematic sim (no Rapier needed for Phase 1).
// Circle (player/car proxy) vs rotated box (building footprint).

import type { BuildingDef } from '../map/types.js';
import { MAP_BOUNDS } from '../constants.js';

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

/** Clamp inside the map bounds. */
export function clampToBounds(x: number, z: number, r: number): { x: number; z: number } {
  return {
    x: Math.max(MAP_BOUNDS.minX + r, Math.min(MAP_BOUNDS.maxX - r, x)),
    z: Math.max(MAP_BOUNDS.minZ + r, Math.min(MAP_BOUNDS.maxZ - r, z)),
  };
}
