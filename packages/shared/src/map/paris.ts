// Compact stylized Paris. Landmarks pulled close (~200-400m apart) into a dense
// playfield. Buildings generated procedurally as Haussmann-ish blocks between a
// radiating boulevard grid, with the Seine splitting north/south banks.

import type { CityData, BuildingDef, LandmarkDef } from './types.js';
import type { Vec2 } from '../math.js';
import { MAP_BOUNDS } from '../constants.js';

// Deterministic PRNG so client + server build identical cities.
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Landmark anchor positions (XZ), origin = Place de la Concorde.
export const LANDMARK_POS = {
  concorde: { x: 0, z: 0 },
  arc: { x: -320, z: -120 }, // west along Champs-Elysees
  eiffel: { x: -260, z: 240 }, // southwest, across the Seine
  louvre: { x: 220, z: 30 }, // east
  notredame: { x: 360, z: 150 }, // further east, on a Seine island
  sacrecoeur: { x: 60, z: -360 }, // north, on the hill
} as const;

// Seine runs roughly west -> east, curving, south of center.
const SEINE_POINTS = [
  { x: -600, z: 200 },
  { x: -300, z: 170 },
  { x: -60, z: 150 },
  { x: 200, z: 120 },
  { x: 380, z: 170 },
  { x: 600, z: 230 },
];
const SEINE_WIDTH = 60;

function nearSeine(x: number, z: number, margin: number): boolean {
  // Distance to the polyline (approx, segment by segment).
  for (let i = 0; i < SEINE_POINTS.length - 1; i++) {
    const a = SEINE_POINTS[i];
    const b = SEINE_POINTS[i + 1];
    const abx = b.x - a.x;
    const abz = b.z - a.z;
    const t = Math.max(0, Math.min(1, ((x - a.x) * abx + (z - a.z) * abz) / (abx * abx + abz * abz)));
    const px = a.x + abx * t;
    const pz = a.z + abz * t;
    if (Math.hypot(x - px, z - pz) < SEINE_WIDTH / 2 + margin) return true;
  }
  return false;
}

function nearLandmark(x: number, z: number, margin: number): boolean {
  for (const k of Object.keys(LANDMARK_POS) as (keyof typeof LANDMARK_POS)[]) {
    const p = LANDMARK_POS[k];
    if (Math.hypot(x - p.x, z - p.z) < margin) return true;
  }
  return false;
}

// Radiating boulevards (the Paris star) — buildings avoid these strips.
const BOULEVARDS = [
  { from: LANDMARK_POS.arc, to: LANDMARK_POS.concorde }, // Champs-Elysees
  { from: LANDMARK_POS.concorde, to: LANDMARK_POS.louvre },
  { from: LANDMARK_POS.concorde, to: LANDMARK_POS.sacrecoeur },
  { from: LANDMARK_POS.louvre, to: LANDMARK_POS.notredame },
  { from: LANDMARK_POS.arc, to: LANDMARK_POS.eiffel },
];
const ROAD_WIDTH = 18; // wide radiating boulevards (the étoile)
const STREET_WIDTH = 10; // ordinary streets between blocks

interface Seg {
  from: Vec2;
  to: Vec2;
  width: number;
}

// Boulevards (the radiating star) + a denser grid of streets carving the city
// into blocks, so it reads like a real street network rather than open ground.
function buildRoadSegments(): Seg[] {
  const segs: Seg[] = BOULEVARDS.map((b) => ({ from: { ...b.from }, to: { ...b.to }, width: ROAD_WIDTH }));
  const lines = [-480, -360, -240, -120, 120, 240, 360, 480];
  const lo = MAP_BOUNDS.minX + 24;
  const hi = MAP_BOUNDS.maxX - 24;
  for (const x of lines) segs.push({ from: { x, z: lo }, to: { x, z: hi }, width: STREET_WIDTH });
  for (const z of lines) segs.push({ from: { x: lo, z }, to: { x: hi, z }, width: STREET_WIDTH });
  return segs;
}

const ROADS = buildRoadSegments();

function onRoad(x: number, z: number, margin: number): boolean {
  for (const r of ROADS) {
    const abx = r.to.x - r.from.x;
    const abz = r.to.z - r.from.z;
    const t = Math.max(0, Math.min(1, ((x - r.from.x) * abx + (z - r.from.z) * abz) / (abx * abx + abz * abz)));
    const px = r.from.x + abx * t;
    const pz = r.from.z + abz * t;
    if (Math.hypot(x - px, z - pz) < r.width / 2 + margin) return true;
  }
  return false;
}

function buildBuildings(): BuildingDef[] {
  const rng = mulberry32(0x9a17);
  const buildings: BuildingDef[] = [];
  let id = 0;
  const step = 30; // block grid spacing
  for (let gx = MAP_BOUNDS.minX + 40; gx < MAP_BOUNDS.maxX - 40; gx += step) {
    for (let gz = MAP_BOUNDS.minZ + 40; gz < MAP_BOUNDS.maxZ - 40; gz += step) {
      // Jitter within the cell.
      const cx = gx + (rng() - 0.5) * 8;
      const cz = gz + (rng() - 0.5) * 8;
      if (nearSeine(cx, cz, 8)) continue;
      if (nearLandmark(cx, cz, 70)) continue;
      if (onRoad(cx, cz, 4)) continue;
      if (rng() < 0.1) continue; // courtyards / gaps
      const hw = 8 + rng() * 6;
      const hd = 8 + rng() * 6;
      // Haussmann: uniform ~18-28m cornice line, slightly taller toward edges.
      const edge = Math.max(Math.abs(cx), Math.abs(cz)) / 600;
      const height = 16 + rng() * 9 + edge * 14;
      buildings.push({
        id: id++,
        cx,
        cz,
        hw,
        hd,
        height,
        rotationY: (rng() - 0.5) * 0.25,
        paletteId: Math.floor(rng() * 6),
      });
    }
  }
  return buildings;
}

function buildLandmarks(): LandmarkDef[] {
  let id = 0;
  const mk = (key: LandmarkDef['key'], pos: { x: number; z: number }, scale: number, y = 0): LandmarkDef => ({
    id: id++,
    key,
    position: { x: pos.x, y, z: pos.z },
    rotationY: 0,
    scale,
  });
  return [
    mk('eiffel', LANDMARK_POS.eiffel, 1),
    mk('arc', LANDMARK_POS.arc, 1),
    mk('louvre', LANDMARK_POS.louvre, 1),
    mk('notredame', LANDMARK_POS.notredame, 1),
    mk('sacrecoeur', LANDMARK_POS.sacrecoeur, 1, 24), // on the hill
    mk('concorde', LANDMARK_POS.concorde, 1),
  ];
}

export function buildParis(): CityData {
  return {
    bounds: { ...MAP_BOUNDS },
    roads: ROADS.map((r, i) => ({
      name: `road-${i}`,
      points: [{ x: r.from.x, z: r.from.z }, { x: r.to.x, z: r.to.z }],
      width: r.width,
    })),
    buildings: buildBuildings(),
    landmarks: buildLandmarks(),
    river: { points: SEINE_POINTS, width: SEINE_WIDTH },
    bridges: [
      { x: -40, z: 150, rotationY: Math.PI / 2, length: SEINE_WIDTH + 20, width: 14 },
      { x: 220, z: 120, rotationY: Math.PI / 2, length: SEINE_WIDTH + 20, width: 14 },
    ],
    spawns: [
      { x: 0, z: -20, rotationY: 0 },
      { x: 30, z: 20, rotationY: Math.PI },
      { x: -260, z: 200, rotationY: 0 },
      { x: 200, z: 60, rotationY: Math.PI / 2 },
      { x: 60, z: -320, rotationY: 0 },
    ],
    pickups: [
      { x: 10, z: 0, weaponId: 1 },
      { x: -250, z: 230, weaponId: 2 },
      { x: 210, z: 40, weaponId: 3 },
    ],
    // A car parked ~6m from every spawn, plus a couple extra.
    vehicles: [
      { x: 4, z: -16, rotationY: 0, colorId: 0 },
      { x: 34, z: 16, rotationY: Math.PI, colorId: 1 },
      { x: -256, z: 204, rotationY: 0, colorId: 2 },
      { x: 204, z: 56, rotationY: Math.PI / 2, colorId: 3 },
      { x: 64, z: -324, rotationY: 0, colorId: 4 },
      { x: 220, z: 30, rotationY: Math.PI / 2, colorId: 0 },
    ],
  };
}
