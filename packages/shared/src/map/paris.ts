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
  louvre: { x: 72, z: 6 }, // north bank, right beside the Tuileries (kept off the river)
  rivoliW: { x: -95, z: -20 }, // straight rue de Rivoli along the Tuileries' north edge
  rivoliE: { x: 40, z: -20 },
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
  garedelyon: { x: 320, z: 180 }, // south bank of the Seine (like the real Gare de Lyon)
  sacrecoeur: { x: 45, z: -310 },
  buttes: { x: 320, z: -240 },
  perelachaise: { x: 390, z: -30 },
  parcdesprinces: { x: -430, z: 250 }, // SW stadium, near the Bois de Boulogne
  bnf: { x: 420, z: 250 }, // Bibliothèque François Mitterrand, SE south bank
};

interface Seg {
  from: Vec2;
  to: Vec2;
  width: number;
}

const dist = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.z - b.z);

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
  ['concorde', 'rivoliW', 14], // rue de Rivoli: straight axis along the Tuileries
  ['rivoliW', 'rivoliE', 16],
  ['rivoliE', 'louvre', 14],
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
    'etoile', 'monceau', 'buttes', 'perelachaise',
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
  { x: -1000, z: 250 }, // flows in from beyond the Périphérique (west)
  { x: -520, z: 130 },
  { x: -340, z: 80 },
  { x: -160, z: 55 },
  { x: 30, z: 55 },
  { x: 150, z: 70 },
  { x: 300, z: 140 }, // dips south of the Bastille/Nation cluster (they stay north)
  { x: 520, z: 210 },
  { x: 1000, z: 330 }, // flows out past the boundary (south-east)
];
const SEINE_WIDTH = 46;

const PARKS: ParkDef[] = [
  { name: 'Jardin des Tuileries', cx: -28, cz: 2, hw: 62, hd: 16 }, // just south of the straight rue de Rivoli (z=-20)
  { name: 'Champ de Mars', cx: -300, cz: 148, hw: 24, hd: 44 }, // long lawn south of the Eiffel toward the École Militaire
  { name: 'Jardin du Luxembourg', cx: 55, cz: 185, hw: 48, hd: 40 },
  { name: 'Parc Monceau', cx: -250, cz: -245, hw: 45, hd: 38 },
  { name: 'Buttes-Chaumont', cx: 320, cz: -245, hw: 50, hd: 45 },
  { name: 'Père-Lachaise', cx: 395, cz: -35, hw: 48, hd: 60 },
  { name: 'Bois de Boulogne', cx: -560, cz: -10, hw: 70, hd: 150 },
  { name: 'Bois de Vincennes', cx: 560, cz: 90, hw: 70, hd: 140 },
  { name: 'Parc des Princes', cx: -430, cz: 250, hw: 32, hd: 26 },
  { name: 'Place des Vosges', cx: 205, cz: 22, hw: 17, hd: 17 }, // Marais garden square
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

type Bridge = { x: number; z: number; rotationY: number; length: number; width: number };

function inDeck(px: number, pz: number, b: Bridge): boolean {
  const cos = Math.cos(b.rotationY);
  const sin = Math.sin(b.rotationY);
  const dx = px - b.x;
  const dz = pz - b.z;
  const lx = cos * dx - sin * dz;
  const lz = sin * dx + cos * dz;
  return Math.abs(lx) <= b.length / 2 && Math.abs(lz) <= b.width / 2;
}

// Deck every span where a road runs over open water, then keep only a MINIMAL
// set of decks that still covers all crossings (greedy by area) — so the many
// roads converging on the île don't pile up a tangle of redundant bridges.
function buildBridges(): Bridge[] {
  const wet = (x: number, z: number) => {
    for (let i = 0; i < SEINE_POINTS.length - 1; i++) {
      if (distToSeg(x, z, SEINE_POINTS[i], SEINE_POINTS[i + 1]) < SEINE_WIDTH / 2) return true;
    }
    return false;
  };
  const cands: Bridge[] = [];
  const wetPts: Vec2[] = [];
  for (const r of ROADS) {
    const dx = r.to.x - r.from.x;
    const dz = r.to.z - r.from.z;
    const len = Math.hypot(dx, dz);
    if (len < 1) continue;
    const ux = dx / len;
    const uz = dz / len;
    const rotationY = Math.atan2(-dz, dx); // deck long (X) axis along the road
    const width = Math.max(r.width + 2, 12); // slim ribbon matching the road (not a slab)
    const steps = Math.max(2, Math.ceil(len / 3));
    let spanStart = -1;
    const deck = (d0: number, d1: number) => {
      const mid = (d0 + d1) / 2;
      cands.push({ x: r.from.x + ux * mid, z: r.from.z + uz * mid, rotationY, length: d1 - d0 + 14, width });
    };
    for (let i = 0; i <= steps; i++) {
      const d = (len * i) / steps;
      const px = r.from.x + ux * d;
      const pz = r.from.z + uz * d;
      const isWet = wet(px, pz);
      if (isWet) {
        wetPts.push({ x: px, z: pz });
        if (spanStart < 0) spanStart = d;
      } else if (spanStart >= 0) {
        deck(spanStart, d);
        spanStart = -1;
      }
    }
    if (spanStart >= 0) deck(spanStart, len);
  }

  // Greedy minimal cover: biggest decks first, drop any that cover no new water.
  cands.sort((a, b) => b.length * b.width - a.length * a.width);
  const covered = new Array(wetPts.length).fill(false);
  const out: Bridge[] = [];
  for (const b of cands) {
    let useful = false;
    for (let i = 0; i < wetPts.length; i++) {
      if (!covered[i] && inDeck(wetPts[i].x, wetPts[i].z, b)) {
        useful = true;
        break;
      }
    }
    if (!useful) continue;
    for (let i = 0; i < wetPts.length; i++) {
      if (!covered[i] && inDeck(wetPts[i].x, wetPts[i].z, b)) covered[i] = true;
    }
    out.push(b);
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
  { key: 'bnf', at: N.bnf },
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

  // Place des Vosges: a uniform building frame (the famous arcaded pavilions)
  // ringing the garden on all four sides.
  const pv = PARKS.find((p) => p.name === 'Place des Vosges');
  if (pv) {
    const gap = 3;
    const d = 9; // frame depth (half = 4.5)
    const out = pv.hw + gap + d / 2; // centre offset to the N/S rows
    const sideOut = pv.hd + gap + d / 2;
    const span = pv.hw + gap + d; // N/S rows reach over the corners
    const frame: BuildingDef[] = [
      { cx: pv.cx, cz: pv.cz - sideOut, hw: span, hd: d / 2 }, // north
      { cx: pv.cx, cz: pv.cz + sideOut, hw: span, hd: d / 2 }, // south
      { cx: pv.cx + out, cz: pv.cz, hw: d / 2, hd: pv.hd + gap }, // east
      { cx: pv.cx - out, cz: pv.cz, hw: d / 2, hd: pv.hd + gap }, // west
    ].map((f) => ({ ...f, id: id++, height: 24, rotationY: 0, paletteId: 1 }));
    buildings.push(...frame);
  }
  return buildings;
}

// Trees: scattered in parks, lining the avenues. Deterministic (shared so the
// server can collide cars against them and the client renders the same set).
function buildTrees(): Vec2[] {
  const rng = mulberry32(0x7e5);
  const pts: Vec2[] = [];
  for (const p of PARKS) {
    // Place des Vosges: a formal garden — a dense grid of trees with the central
    // cross paths kept clear.
    if (p.name === 'Place des Vosges') {
      for (let gx = -p.hw + 3; gx <= p.hw - 3; gx += 4.5) {
        for (let gz = -p.hd + 3; gz <= p.hd - 3; gz += 4.5) {
          if (Math.abs(gx) < 4 || Math.abs(gz) < 4) continue; // keep the cross paths open
          pts.push({ x: p.cx + gx, z: p.cz + gz });
        }
      }
      continue;
    }
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

// Push a landmark off the roadway (and out of the Seine) so it sits beside the
// street on dry land. Sums pushes from nearby roads + the river; capped so it
// stays next to its node.
function offRoad(x: number, z: number): { x: number; z: number } {
  const CLEAR = 12;
  const ox = x;
  const oz = z;
  const pushFrom = (
    ax: number,
    az: number,
    bx: number,
    bz: number,
    need: number,
    acc: { sx: number; sz: number; hits: number },
  ) => {
    const abx = bx - ax;
    const abz = bz - az;
    const t = Math.max(0, Math.min(1, ((x - ax) * abx + (z - az) * abz) / (abx * abx + abz * abz || 1)));
    const dx = x - (ax + abx * t);
    const dz = z - (az + abz * t);
    const d = Math.hypot(dx, dz);
    if (d < need) {
      if (d < 0.001) {
        const l = Math.hypot(abx, abz) || 1;
        acc.sx += (-abz / l) * need;
        acc.sz += (abx / l) * need;
      } else {
        acc.sx += (dx / d) * (need - d);
        acc.sz += (dz / d) * (need - d);
      }
      acc.hits++;
    }
  };
  for (let it = 0; it < 16; it++) {
    const acc = { sx: 0, sz: 0, hits: 0 };
    for (const r of ROADS) pushFrom(r.from.x, r.from.z, r.to.x, r.to.z, r.width / 2 + CLEAR, acc);
    for (let i = 0; i < SEINE_POINTS.length - 1; i++) {
      pushFrom(SEINE_POINTS[i].x, SEINE_POINTS[i].z, SEINE_POINTS[i + 1].x, SEINE_POINTS[i + 1].z, SEINE_WIDTH / 2 + CLEAR, acc);
    }
    if (!acc.hits) break;
    x += acc.sx;
    z += acc.sz;
    if (Math.hypot(x - ox, z - oz) > 60) break; // stay next to the node
  }
  return { x, z };
}

function buildLandmarks(): LandmarkDef[] {
  return LANDMARKS.map((l, id) => {
    let px = l.at.x + (l.off?.x ?? 0);
    let pz = l.at.z + (l.off?.z ?? 0);
    // Arc stays centred in its roundabout, Notre-Dame on its island, and the
    // (large) Louvre is hand-placed beside the Tuileries; nudge the rest.
    if (l.key !== 'arcdetriomphe' && l.key !== 'notredame' && l.key !== 'louvre') {
      const s = offRoad(px, pz);
      px = s.x;
      pz = s.z;
    }
    return {
      id,
      key: l.key,
      position: { x: px, y: l.y ?? 0, z: pz },
      rotationY: l.rotationY ?? 0,
      scale: 1,
    };
  });
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
