// Tiny math helpers shared across sim + render. Keep dependency-free.

export interface Vec2 {
  x: number;
  z: number;
}

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Shortest-path angular lerp (radians). */
export function lerpAngle(a: number, b: number, t: number): number {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

export function len2(x: number, z: number): number {
  return Math.hypot(x, z);
}

/** Normalize a 2D vector; returns {x:0,z:0} if zero-length. */
export function norm2(x: number, z: number): Vec2 {
  const l = Math.hypot(x, z);
  if (l < 1e-6) return { x: 0, z: 0 };
  return { x: x / l, z: z / l };
}

export function dist2(ax: number, az: number, bx: number, bz: number): number {
  return Math.hypot(ax - bx, az - bz);
}
