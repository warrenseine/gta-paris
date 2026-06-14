import type { Vec2, Vec3 } from '../math.js';

export type LandmarkKey =
  | 'eiffel'
  | 'arc'
  | 'louvre'
  | 'notredame'
  | 'sacrecoeur'
  | 'concorde'
  | 'opera'
  | 'pantheon'
  | 'invalides'
  | 'madeleine'
  | 'montparnasse'
  | 'grandpalais'
  | 'parcdesprinces'
  | 'bnf'
  | 'arcdetriomphe';

/** A green space (park). Axis-aligned rectangle for simplicity. */
export interface ParkDef {
  name: string;
  cx: number;
  cz: number;
  hw: number;
  hd: number;
  /** Ground rotation (radians) for diagonal parks like the Champ de Mars. */
  rotationY?: number;
}

export interface RoadDef {
  name: string;
  /** Centerline polyline in world XZ. */
  points: Vec2[];
  width: number;
}

/** Axis-rotated box building generated from a rectangular footprint. */
export interface BuildingDef {
  id: number;
  /** Center position (XZ). */
  cx: number;
  cz: number;
  /** Footprint half-extents before rotation. */
  hw: number; // half width (x)
  hd: number; // half depth (z)
  height: number;
  rotationY: number;
  paletteId: number;
}

export interface LandmarkDef {
  id: number;
  key: LandmarkKey;
  position: Vec3;
  rotationY: number;
  scale: number;
}

export interface RiverDef {
  /** Curved centerline (XZ). Rendered as a flat ribbon, acts as soft boundary. */
  points: Vec2[];
  width: number;
}

export interface SpawnPoint {
  x: number;
  z: number;
  rotationY: number;
}

export interface PickupSpawn {
  x: number;
  z: number;
  /** 0 = weapon (use weaponId), 1 = health pack. */
  kind: number;
  weaponId: number;
}

export interface VehicleSpawn {
  x: number;
  z: number;
  rotationY: number;
  colorId: number;
}

export interface CityData {
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  roads: RoadDef[];
  buildings: BuildingDef[];
  landmarks: LandmarkDef[];
  river: RiverDef;
  parks: ParkDef[];
  trees: Vec2[];
  /** Paris outline polygon (the Périphérique). Movement is clamped inside it. */
  boundary: Vec2[];
  /** Île de la Cité: dry land (ellipse) splitting the Seine under Notre-Dame. */
  island?: { cx: number; cz: number; rx: number; rz: number };
  bridges: { x: number; z: number; rotationY: number; length: number; width: number }[];
  spawns: SpawnPoint[];
  pickups: PickupSpawn[];
  vehicles: VehicleSpawn[];
}

/** Flat-shaded building color palettes (Haussmann creams, greys, roof zinc). */
export const PALETTES: number[] = [
  0xd8cfbf, // cream stone
  0xc9b89a, // warm limestone
  0xbfc3c7, // pale grey
  0xa8a2a6, // zinc grey
  0xcabfb0, // sand
  0x9fa6ad, // slate
];
