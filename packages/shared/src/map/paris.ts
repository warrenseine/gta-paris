// Stylized but layout-faithful Paris: real landmark relative positions, the
// Étoile star + grands boulevards + quais as angled avenues (not a grid), the
// curving Seine, and green parks. Buildings fill the blocks between.

import type { CityData, BuildingDef, LandmarkDef, ParkDef, LandmarkKey } from './types.js';
import type { Vec2 } from '../math.js';
import { MAP_BOUNDS } from '../constants.js';

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
  notredame: { x: 150, z: 80 },
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
};

interface Seg {
  from: Vec2;
  to: Vec2;
  width: number;
}

// Avenues: connect places at real angles. Wide for the grand axes, medium else.
const AVENUES: [keyof typeof N, keyof typeof N, number][] = [
  // Étoile star.
  ['etoile', 'concorde', 20], // Champs-Élysées
  ['etoile', 'trocadero', 14],
  ['etoile', 'grandpalais', 13],
  ['etoile', 'monceau', 13],
  ['etoile', 'invalides', 13],
  // Rivoli / grand east axis.
  ['concorde', 'louvre', 16],
  ['louvre', 'chatelet', 16],
  ['chatelet', 'hoteldeville', 14],
  ['hoteldeville', 'bastille', 16],
  ['bastille', 'nation', 16],
  // North boulevards + opera.
  ['concorde', 'madeleine', 13],
  ['madeleine', 'opera', 14],
  ['opera', 'louvre', 14], // av. de l'Opéra
  ['opera', 'republique', 15], // grands boulevards
  ['republique', 'bastille', 14],
  ['republique', 'perelachaise', 13],
  ['opera', 'garedunord', 13],
  ['garedunord', 'sacrecoeur', 12],
  ['garedunord', 'buttes', 12],
  // South bank.
  ['invalides', 'eiffel', 14],
  ['trocadero', 'eiffel', 13], // pont d'Iéna axis
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
];

function buildAvenues(): Seg[] {
  return AVENUES.map(([a, c, w]) => ({ from: { ...N[a] }, to: { ...N[c] }, width: w }));
}
const ROADS = buildAvenues();

// Seine: curving W->E band through the south-centre, past the île (Notre-Dame).
const SEINE_POINTS: Vec2[] = [
  { x: -600, z: 80 },
  { x: -340, z: 80 },
  { x: -160, z: 55 },
  { x: 30, z: 55 },
  { x: 150, z: 70 },
  { x: 320, z: 95 },
  { x: 600, z: 150 },
];
const SEINE_WIDTH = 46;

const PARKS: ParkDef[] = [
  { name: 'Jardin des Tuileries', cx: -35, cz: -15, hw: 70, hd: 18 },
  { name: 'Champ de Mars', cx: -300, cz: 165, hw: 28, hd: 70 },
  { name: 'Jardin du Luxembourg', cx: 55, cz: 185, hw: 48, hd: 40 },
  { name: 'Parc Monceau', cx: -250, cz: -245, hw: 45, hd: 38 },
  { name: 'Buttes-Chaumont', cx: 320, cz: -245, hw: 50, hd: 45 },
  { name: 'Père-Lachaise', cx: 395, cz: -35, hw: 48, hd: 60 },
  { name: 'Bois de Boulogne', cx: -560, cz: -10, hw: 70, hd: 150 },
  { name: 'Bois de Vincennes', cx: 560, cz: 90, hw: 70, hd: 140 },
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

// Landmarks: position + key. y raised for the ones on higher ground.
const LANDMARKS: { key: LandmarkKey; at: Vec2; y?: number }[] = [
  { key: 'arcdetriomphe', at: N.etoile },
  { key: 'eiffel', at: N.eiffel },
  { key: 'louvre', at: N.louvre },
  { key: 'notredame', at: N.notredame },
  { key: 'sacrecoeur', at: N.sacrecoeur, y: 22 },
  { key: 'concorde', at: N.concorde },
  { key: 'opera', at: N.opera },
  { key: 'pantheon', at: N.pantheon },
  { key: 'invalides', at: N.invalides },
  { key: 'madeleine', at: N.madeleine },
  { key: 'grandpalais', at: N.grandpalais },
  { key: 'montparnasse', at: N.montparnasse },
];

function nearLandmark(x: number, z: number, margin: number): boolean {
  for (const l of LANDMARKS) if (Math.hypot(x - l.at.x, z - l.at.z) < margin) return true;
  return false;
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
      if (nearSeine(cx, cz, 10)) continue; // keep quais clear so the river is crossable
      if (nearLandmark(cx, cz, 60)) continue;
      if (inPark(cx, cz, 4)) continue;
      if (onRoad(cx, cz, 4)) continue;
      if (rng() < 0.08) continue;
      const hw = 7 + rng() * 6;
      const hd = 7 + rng() * 6;
      const edge = Math.max(Math.abs(cx), Math.abs(cz)) / 600;
      const height = 16 + rng() * 9 + edge * 14;
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

function buildLandmarks(): LandmarkDef[] {
  return LANDMARKS.map((l, id) => ({
    id,
    key: l.key,
    position: { x: l.at.x, y: l.y ?? 0, z: l.at.z },
    rotationY: 0,
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
    bridges: [
      { x: -300, z: 80, rotationY: Math.PI / 2, length: SEINE_WIDTH + 16, width: 12 },
      { x: 30, z: 55, rotationY: Math.PI / 2, length: SEINE_WIDTH + 16, width: 12 },
      { x: 150, z: 70, rotationY: Math.PI / 2, length: SEINE_WIDTH + 16, width: 12 },
      { x: 320, z: 95, rotationY: Math.PI / 2, length: SEINE_WIDTH + 16, width: 12 },
    ],
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
