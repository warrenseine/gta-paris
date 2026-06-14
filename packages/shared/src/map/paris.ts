// Stylized but layout-faithful Paris: real landmark relative positions, the
// Étoile star + grands boulevards + quais as angled avenues (not a grid), the
// curving Seine, and green parks. Buildings fill the blocks between.

import type { CityData, BuildingDef, LandmarkDef, ParkDef, LandmarkKey } from './types.js';
import type { Vec2 } from '../math.js';
import { MAP_BOUNDS, CITY_RADIUS, PERIPH_WIDTH } from '../constants.js';

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

// Named places (world XZ; +x east, +z south). Positions follow the real city's
// relative layout, scaled into the playfield.
const N = {
  etoile: { x: -360, z: -150 },
  trocadero: { x: -380, z: 30 },
  eiffel: { x: -300, z: 110 },
  champdemars: { x: -300, z: 175 },
  invalides: { x: -150, z: 95 },
  grandpalais: { x: -210, z: 5 },
  concorde: { x: -120, z: -35 },
  madeleine: { x: -120, z: -95 },
  opera: { x: -45, z: -120 },
  monceau: { x: -250, z: -245 },
  louvre: { x: 55, z: 5 },
  palais: { x: 25, z: -40 },
  chatelet: { x: 120, z: 35 },
  hoteldeville: { x: 160, z: 45 },
  notredame: { x: 150, z: 72 }, // on the île de la Cité (river centerline)
  pantheon: { x: 110, z: 175 },
  luxembourg: { x: 55, z: 180 },
  montparnasse: { x: -25, z: 265 },
  saintmichel: { x: 110, z: 100 },
  republique: { x: 230, z: -110 },
  bastille: { x: 250, z: 65 },
  nation: { x: 380, z: 120 },
  garedunord: { x: 70, z: -210 },
  garedelyon: { x: 305, z: 140 },
  sacrecoeur: { x: 45, z: -310 },
  buttes: { x: 320, z: -240 },
  perelachaise: { x: 390, z: -30 },
  parcdesprinces: { x: -430, z: 250 }, // SW stadium, near the Bois de Boulogne
};

interface Seg {
  from: Vec2;
  to: Vec2;
  width: number;
}

const dist = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.z - b.z);

// Segment intersection point (or null).
function segInt(p1: Vec2, p2: Vec2, p3: Vec2, p4: Vec2): Vec2 | null {
  const d = (p2.x - p1.x) * (p4.z - p3.z) - (p2.z - p1.z) * (p4.x - p3.x);
  if (Math.abs(d) < 1e-9) return null;
  const t = ((p3.x - p1.x) * (p4.z - p3.z) - (p3.z - p1.z) * (p4.x - p3.x)) / d;
  const u = ((p3.x - p1.x) * (p2.z - p1.z) - (p3.z - p1.z) * (p2.x - p1.x)) / d;
  if (t < 0 || t > 1 || u < 0 || u > 1) return null;
  return { x: p1.x + t * (p2.x - p1.x), z: p1.z + t * (p2.z - p1.z) };
}

function pointInPoly(x: number, z: number, poly: Vec2[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.z > z !== b.z > z && x < ((b.x - a.x) * (z - a.z)) / (b.z - a.z) + a.x) inside = !inside;
  }
  return inside;
}

// The Périphérique outline: an irregular rounded blob (wider E-W), not a circle.
function buildOutline(): Vec2[] {
  const rng = mulberry32(0x5a17);
  const pts: Vec2[] = [];
  const count = 26;
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2;
    const jitter = 0.9 + rng() * 0.16;
    pts.push({ x: Math.cos(a) * 565 * jitter, z: Math.sin(a) * 495 * jitter });
  }
  return pts;
}
const OUTLINE = buildOutline();

// Île de la Cité: dry land splitting the Seine, with Notre-Dame on it.
const ISLAND = { cx: N.notredame.x, cz: N.notredame.z, rx: 46, rz: 15 };

// Avenues between named places (real-ish angles). Width: grand axes wider.
const AVENUES: [keyof typeof N, keyof typeof N, number][] = [
  ['etoile', 'concorde', 20], // Champs-Élysées
  ['etoile', 'trocadero', 14],
  ['etoile', 'grandpalais', 13],
  ['etoile', 'monceau', 13],
  ['etoile', 'invalides', 13],
  ['concorde', 'louvre', 16], // Rivoli axis
  ['louvre', 'chatelet', 16],
  ['chatelet', 'hoteldeville', 14],
  ['hoteldeville', 'bastille', 16],
  ['bastille', 'nation', 16],
  ['concorde', 'madeleine', 13],
  ['madeleine', 'opera', 14],
  ['opera', 'louvre', 14],
  ['opera', 'republique', 15], // grands boulevards
  ['republique', 'bastille', 14],
  ['republique', 'perelachaise', 13],
  ['opera', 'garedunord', 13],
  ['garedunord', 'sacrecoeur', 12],
  ['garedunord', 'buttes', 12],
  ['invalides', 'eiffel', 14],
  ['trocadero', 'eiffel', 13],
  ['eiffel', 'champdemars', 12],
  ['invalides', 'saintmichel', 15], // bd Saint-Germain
  ['saintmichel', 'luxembourg', 13],
  ['luxembourg', 'pantheon', 12],
  ['luxembourg', 'montparnasse', 14],
  ['saintmichel', 'notredame', 12],
  ['chatelet', 'notredame', 12],
  ['notredame', 'pantheon', 12],
  ['bastille', 'garedelyon', 14],
  ['garedelyon', 'nation', 13],
  ['pantheon', 'montparnasse', 12], // close the Left-Bank loop
  ['monceau', 'madeleine', 12],
];

// Build the full network: avenues + dead-end killers + radial links to the
// Périphérique + the Périphérique loop itself (all drivable, all connected).
function buildRoads(): Seg[] {
  const segs: Seg[] = [];
  const adj = new Map<string, Set<string>>();
  for (const k of Object.keys(N)) adj.set(k, new Set());
  const link = (a: keyof typeof N, c: keyof typeof N, w: number) => {
    if (adj.get(a)!.has(c)) return;
    adj.get(a)!.add(c);
    adj.get(c)!.add(a);
    segs.push({ from: { ...N[a] }, to: { ...N[c] }, width: w });
  };
  for (const [a, c, w] of AVENUES) link(a, c, w);

  // No dead ends: any node with <2 links connects to its nearest non-neighbour.
  const keys = Object.keys(N) as (keyof typeof N)[];
  for (const k of keys) {
    let guard = 0;
    while (adj.get(k)!.size < 2 && guard++ < 4) {
      let best: keyof typeof N | null = null;
      let bd = Infinity;
      for (const o of keys) {
        if (o === k || adj.get(k)!.has(o)) continue;
        const d = dist(N[k], N[o]);
        if (d < bd) {
          bd = d;
          best = o;
        }
      }
      if (!best) break;
      link(k, best, 12);
    }
  }

  // Radial avenues out to the nearest Périphérique vertex (so it's reachable).
  const outer: (keyof typeof N)[] = [
    'etoile', 'monceau', 'buttes', 'perelachaise', 'nation', 'garedelyon',
    'montparnasse', 'champdemars', 'trocadero', 'sacrecoeur', 'garedunord', 'bastille',
  ];
  for (const k of outer) {
    let bi = 0;
    let bd = Infinity;
    OUTLINE.forEach((p, idx) => {
      const d = dist(N[k], p);
      if (d < bd) {
        bd = d;
        bi = idx;
      }
    });
    segs.push({ from: { ...N[k] }, to: { ...OUTLINE[bi] }, width: 12 });
  }

  // Place de l'Étoile: a roundabout ring around the Arc de Triomphe.
  const raR = 34;
  const raN = 12;
  const ra: Vec2[] = [];
  for (let i = 0; i < raN; i++) {
    const a = (i / raN) * Math.PI * 2;
    ra.push({ x: N.etoile.x + Math.cos(a) * raR, z: N.etoile.z + Math.sin(a) * raR });
  }
  for (let i = 0; i < raN; i++) {
    segs.push({ from: { ...ra[i] }, to: { ...ra[(i + 1) % raN] }, width: 9 });
  }

  // The Périphérique ring (a closed loop of road).
  for (let i = 0; i < OUTLINE.length; i++) {
    segs.push({ from: { ...OUTLINE[i] }, to: { ...OUTLINE[(i + 1) % OUTLINE.length] }, width: PERIPH_WIDTH });
  }
  return segs;
}
const ROADS = buildRoads();

// Seine: curving W->E band through the south-centre, past the île (Notre-Dame).
const SEINE_POINTS: Vec2[] = [
  { x: -520, z: 130 },
  { x: -340, z: 80 },
  { x: -160, z: 55 },
  { x: 30, z: 55 },
  { x: 150, z: 70 },
  { x: 320, z: 95 },
  { x: 500, z: 200 },
];
const SEINE_WIDTH = 46;

const PARKS: ParkDef[] = [
  { name: 'Jardin des Tuileries', cx: -30, cz: 16, hw: 62, hd: 13 }, // south of rue de Rivoli
  { name: 'Champ de Mars', cx: -300, cz: 165, hw: 28, hd: 70 },
  { name: 'Jardin du Luxembourg', cx: 55, cz: 185, hw: 48, hd: 40 },
  { name: 'Parc Monceau', cx: -250, cz: -245, hw: 45, hd: 38 },
  { name: 'Buttes-Chaumont', cx: 320, cz: -245, hw: 50, hd: 45 },
  { name: 'Père-Lachaise', cx: 395, cz: -35, hw: 48, hd: 60 },
  { name: 'Bois de Boulogne', cx: -560, cz: -10, hw: 70, hd: 150 },
  { name: 'Bois de Vincennes', cx: 560, cz: 90, hw: 70, hd: 140 },
  { name: 'Parc des Princes', cx: -430, cz: 250, hw: 32, hd: 26 },
];

function distToSeg(x: number, z: number, a: Vec2, b: Vec2): number {
  const abx = b.x - a.x;
  const abz = b.z - a.z;
  const t = Math.max(0, Math.min(1, ((x - a.x) * abx + (z - a.z) * abz) / (abx * abx + abz * abz || 1)));
  return Math.hypot(x - (a.x + abx * t), z - (a.z + abz * t));
}

function onRoad(x: number, z: number, margin: number): boolean {
  for (const r of ROADS) if (distToSeg(x, z, r.from, r.to) < r.width / 2 + margin) return true;
  return false;
}

function nearSeine(x: number, z: number, margin: number): boolean {
  for (let i = 0; i < SEINE_POINTS.length - 1; i++) {
    if (distToSeg(x, z, SEINE_POINTS[i], SEINE_POINTS[i + 1]) < SEINE_WIDTH / 2 + margin) return true;
  }
  return false;
}

function inPark(x: number, z: number, margin: number): boolean {
  for (const p of PARKS) {
    if (Math.abs(x - p.cx) < p.hw + margin && Math.abs(z - p.cz) < p.hd + margin) return true;
  }
  return false;
}

// A bridge wherever an avenue crosses the Seine (so no road fords open water).
function buildBridges() {
  const out: { x: number; z: number; rotationY: number; length: number; width: number }[] = [];
  for (const r of ROADS) {
    if (r.width === PERIPH_WIDTH) continue; // périph rings outside the river
    for (let i = 0; i < SEINE_POINTS.length - 1; i++) {
      const hit = segInt(r.from, r.to, SEINE_POINTS[i], SEINE_POINTS[i + 1]);
      if (!hit) continue;
      const dx = r.to.x - r.from.x;
      const dz = r.to.z - r.from.z;
      const rl = Math.hypot(dx, dz) || 1;
      // Span the water diagonally: a shallow crossing needs a longer deck so the
      // ends land on dry banks (the deck must reach the road, not float mid-river).
      const sx = SEINE_POINTS[i + 1].x - SEINE_POINTS[i].x;
      const sz = SEINE_POINTS[i + 1].z - SEINE_POINTS[i].z;
      const sl = Math.hypot(sx, sz) || 1;
      const sinT = Math.abs((dx / rl) * (sz / sl) - (dz / rl) * (sx / sl));
      const span = SEINE_WIDTH / Math.max(0.35, sinT);
      out.push({
        x: hit.x,
        z: hit.z,
        rotationY: Math.atan2(-dz, dx), // align the deck's long (X) axis with the road
        length: Math.min(150, span + 30), // +30 → ~15m onto each bank
        width: Math.max(r.width + 8, 18),
      });
    }
  }
  return out;
}

// Landmarks: position + key. `off` nudges the building off a road junction so it
// sits beside the street, not on it (the node stays put for road connectivity).
const LANDMARKS: { key: LandmarkKey; at: Vec2; y?: number; off?: Vec2; rotationY?: number }[] = [
  { key: 'arcdetriomphe', at: N.etoile },
  { key: 'eiffel', at: N.eiffel },
  { key: 'louvre', at: N.louvre },
  { key: 'notredame', at: N.notredame },
  { key: 'sacrecoeur', at: N.sacrecoeur },
  { key: 'concorde', at: N.concorde },
  { key: 'opera', at: N.opera, off: { x: 6, z: -28 } },
  { key: 'pantheon', at: N.pantheon },
  { key: 'invalides', at: N.invalides },
  { key: 'madeleine', at: N.madeleine, off: { x: 0, z: -26 } },
  { key: 'grandpalais', at: N.grandpalais, off: { x: -8, z: -26 } },
  { key: 'montparnasse', at: N.montparnasse },
  { key: 'parcdesprinces', at: N.parcdesprinces },
];

function nearLandmark(x: number, z: number, margin: number): boolean {
  for (const l of LANDMARKS) if (Math.hypot(x - l.at.x, z - l.at.z) < margin) return true;
  return false;
}

function distToBoundary(x: number, z: number): number {
  let d = Infinity;
  for (let i = 0, j = OUTLINE.length - 1; i < OUTLINE.length; j = i++) {
    d = Math.min(d, distToSeg(x, z, OUTLINE[i], OUTLINE[j]));
  }
  return d;
}

function buildBuildings(): BuildingDef[] {
  const rng = mulberry32(0x9a17);
  const buildings: BuildingDef[] = [];
  let id = 0;
  const step = 28;
  for (let gx = MAP_BOUNDS.minX + 40; gx < MAP_BOUNDS.maxX - 40; gx += step) {
    for (let gz = MAP_BOUNDS.minZ + 40; gz < MAP_BOUNDS.maxZ - 40; gz += step) {
      const cx = gx + (rng() - 0.5) * 7;
      const cz = gz + (rng() - 0.5) * 7;
      // Inside the Périphérique only (with clearance from the ring road).
      if (!pointInPoly(cx, cz, OUTLINE)) continue;
      if (distToBoundary(cx, cz) < PERIPH_WIDTH + 10) continue;
      if (nearSeine(cx, cz, 10)) continue; // keep quais clear so the river is crossable
      if (nearLandmark(cx, cz, 60)) continue;
      if (inPark(cx, cz, 4)) continue;
      if (onRoad(cx, cz, 13)) continue; // building footprints must clear the roadway
      if (rng() < 0.08) continue;
      const hw = 7 + rng() * 6;
      const hd = 7 + rng() * 6;
      const edge = Math.hypot(cx, cz) / CITY_RADIUS;
      const height = 16 + rng() * 9 + edge * 12;
      buildings.push({
        id: id++,
        cx,
        cz,
        hw,
        hd,
        height,
        rotationY: (rng() - 0.5) * 0.2,
        paletteId: Math.floor(rng() * 6),
      });
    }
  }
  return buildings;
}

// Trees: scattered in parks, lining the avenues. Deterministic (shared so the
// server can collide cars against them and the client renders the same set).
function buildTrees(): Vec2[] {
  const rng = mulberry32(0x7e5);
  const pts: Vec2[] = [];
  for (const p of PARKS) {
    const n = Math.floor((p.hw * p.hd) / 260);
    for (let i = 0; i < n; i++) {
      pts.push({ x: p.cx + (rng() - 0.5) * 2 * (p.hw - 3), z: p.cz + (rng() - 0.5) * 2 * (p.hd - 3) });
    }
  }
  for (const r of ROADS) {
    if (r.width === PERIPH_WIDTH) continue; // don't line the ring road
    const len = Math.hypot(r.to.x - r.from.x, r.to.z - r.from.z);
    const ux = (r.to.x - r.from.x) / len;
    const uz = (r.to.z - r.from.z) / len;
    const off = r.width / 2 + 3;
    for (let d = 14; d < len - 14; d += 24) {
      const px = r.from.x + ux * d;
      const pz = r.from.z + uz * d;
      pts.push({ x: px - uz * off, z: pz + ux * off });
      pts.push({ x: px + uz * off, z: pz - ux * off });
    }
  }
  return pts.filter(
    (p) =>
      pointInPoly(p.x, p.z, OUTLINE) &&
      distToBoundary(p.x, p.z) > 5 &&
      !nearSeine(p.x, p.z, 2) &&
      !onRoad(p.x, p.z, 1), // never on the roadway itself
  );
}

function buildLandmarks(): LandmarkDef[] {
  return LANDMARKS.map((l, id) => ({
    id,
    key: l.key,
    position: { x: l.at.x + (l.off?.x ?? 0), y: l.y ?? 0, z: l.at.z + (l.off?.z ?? 0) },
    rotationY: l.rotationY ?? 0,
    scale: 1,
  }));
}

export const LANDMARK_POS = N;

export function buildParis(): CityData {
  return {
    bounds: { ...MAP_BOUNDS },
    roads: ROADS.map((r, i) => ({
      name: `ave-${i}`,
      points: [{ x: r.from.x, z: r.from.z }, { x: r.to.x, z: r.to.z }],
      width: r.width,
    })),
    buildings: buildBuildings(),
    landmarks: buildLandmarks(),
    river: { points: SEINE_POINTS, width: SEINE_WIDTH },
    parks: PARKS,
    trees: buildTrees(),
    boundary: OUTLINE,
    island: ISLAND,
    bridges: buildBridges(),
    spawns: [
      { x: N.concorde.x, z: N.concorde.z - 14, rotationY: 0 },
      { x: N.louvre.x, z: N.louvre.z - 16, rotationY: Math.PI },
      { x: N.eiffel.x + 20, z: N.eiffel.z, rotationY: Math.PI / 2 },
      { x: N.bastille.x, z: N.bastille.z - 16, rotationY: 0 },
      { x: N.opera.x, z: N.opera.z + 16, rotationY: 0 },
      { x: N.pantheon.x, z: N.pantheon.z - 16, rotationY: Math.PI },
    ],
    pickups: [
      { x: N.concorde.x + 12, z: N.concorde.z, kind: 0, weaponId: 1 },
      { x: N.louvre.x, z: N.louvre.z + 14, kind: 0, weaponId: 2 },
      { x: N.eiffel.x + 24, z: N.eiffel.z + 8, kind: 0, weaponId: 3 },
      { x: N.bastille.x + 10, z: N.bastille.z, kind: 0, weaponId: 2 },
      { x: N.republique.x, z: N.republique.z + 12, kind: 0, weaponId: 3 },
      { x: N.opera.x - 10, z: N.opera.z + 16, kind: 1, weaponId: 0 }, // health
      { x: N.pantheon.x + 10, z: N.pantheon.z - 16, kind: 1, weaponId: 0 },
      { x: N.notredame.x - 8, z: N.notredame.z + 10, kind: 1, weaponId: 0 },
    ],
    vehicles: [
      { x: N.concorde.x + 6, z: N.concorde.z - 18, rotationY: 0, colorId: 0 },
      { x: N.louvre.x - 8, z: N.louvre.z - 18, rotationY: Math.PI, colorId: 1 },
      { x: N.eiffel.x + 26, z: N.eiffel.z + 4, rotationY: Math.PI / 2, colorId: 2 },
      { x: N.bastille.x - 6, z: N.bastille.z - 16, rotationY: 0, colorId: 3 },
      { x: N.opera.x + 8, z: N.opera.z + 18, rotationY: 0, colorId: 4 },
      { x: N.pantheon.x - 6, z: N.pantheon.z - 16, rotationY: Math.PI, colorId: 1 },
      { x: N.etoile.x + 30, z: N.etoile.z + 20, rotationY: Math.PI / 2, colorId: 0 },
    ],
  };
}
