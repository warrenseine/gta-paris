import {
  resolveAgainstBuildings,
  clampToBounds,
  MAP_BOUNDS,
  type CityData,
  type Vec2,
} from '@gta/shared';

// Server-authoritative ambient NPCs: pedestrians wander, traffic follows the
// boulevard polylines. NPCs are cosmetic (no collision with players) to keep
// client-side prediction simple. Interest management caps how many sync.

export const NPC_PED = 0;
export const NPC_CAR = 1;

export interface NpcSimState {
  id: string;
  kind: number;
  x: number;
  z: number;
  rotY: number;
  colorId: number;
  hp: number;
  dead: boolean;
  respawnAt: number;
  // ped
  tx: number;
  tz: number;
  repathAt: number;
  // traffic
  path: Vec2[];
  seg: number;
  dir: number; // +1 / -1 along the path
  speed: number;
}

export const PED_HP = 20;
export const CAR_HP = 70;

const PED_COUNT = 150;
const TRAFFIC_COUNT = 26;
const PED_SPEED = 1.6;
const PED_RADIUS = 0.4;
// Peds cluster in the central playfield where the landmarks + action are.
const PED_AREA = 470;

function rand(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function walkablePoint(city: CityData): { x: number; z: number } {
  // Reject points that land inside a building (push-out distance > 0).
  for (let i = 0; i < 8; i++) {
    const x = rand(Math.max(MAP_BOUNDS.minX + 30, -PED_AREA), Math.min(MAP_BOUNDS.maxX - 30, PED_AREA));
    const z = rand(Math.max(MAP_BOUNDS.minZ + 30, -PED_AREA), Math.min(MAP_BOUNDS.maxZ - 30, PED_AREA));
    const r = resolveAgainstBuildings({ x, z, r: PED_RADIUS }, city.buildings);
    if (Math.hypot(r.x - x, r.z - z) < 0.01) return { x, z };
  }
  return { x: 0, z: 0 };
}

export function spawnNpcs(city: CityData): NpcSimState[] {
  const npcs: NpcSimState[] = [];

  for (let i = 0; i < PED_COUNT; i++) {
    const p = walkablePoint(city);
    const t = walkablePoint(city);
    npcs.push({
      id: `ped${i}`,
      kind: NPC_PED,
      x: p.x,
      z: p.z,
      rotY: 0,
      colorId: Math.floor(rand(0, 5)),
      hp: PED_HP,
      dead: false,
      respawnAt: 0,
      tx: t.x,
      tz: t.z,
      repathAt: 0,
      path: [],
      seg: 0,
      dir: 1,
      speed: 0,
    });
  }

  // Traffic: each car oscillates along one boulevard polyline.
  const roads = city.roads;
  for (let i = 0; i < TRAFFIC_COUNT; i++) {
    const road = roads[i % roads.length];
    const path = road.points.map((p) => ({ x: p.x, z: p.z }));
    const startSeg = Math.floor(rand(0, Math.max(1, path.length - 1)));
    const a = path[startSeg];
    npcs.push({
      id: `car${i}`,
      kind: NPC_CAR,
      x: a.x,
      z: a.z,
      rotY: 0,
      colorId: Math.floor(rand(0, 5)),
      hp: CAR_HP,
      dead: false,
      respawnAt: 0,
      tx: 0,
      tz: 0,
      repathAt: 0,
      path,
      seg: startSeg,
      dir: Math.random() < 0.5 ? 1 : -1,
      speed: rand(10, 18),
    });
  }

  return npcs;
}

export function stepNpc(n: NpcSimState, dt: number, city: CityData, tick: number) {
  if (n.kind === NPC_PED) stepPed(n, dt, city, tick);
  else stepCarNpc(n, dt);
}

/** Bring a killed NPC back to life at a fresh spot. */
export function reviveNpc(n: NpcSimState, city: CityData) {
  n.dead = false;
  n.hp = n.kind === NPC_CAR ? CAR_HP : PED_HP;
  if (n.kind === NPC_PED) {
    const p = walkablePoint(city);
    n.x = p.x;
    n.z = p.z;
    const t = walkablePoint(city);
    n.tx = t.x;
    n.tz = t.z;
  } else {
    n.seg = 0;
    n.x = n.path[0]?.x ?? 0;
    n.z = n.path[0]?.z ?? 0;
    n.speed = 12;
  }
}

function stepPed(n: NpcSimState, dt: number, city: CityData, tick: number) {
  const dx = n.tx - n.x;
  const dz = n.tz - n.z;
  const d = Math.hypot(dx, dz);
  if (d < 1.5 || tick >= n.repathAt) {
    const t = walkablePoint(city);
    n.tx = t.x;
    n.tz = t.z;
    n.repathAt = tick + Math.floor(rand(150, 450)); // ~5-15s @30Hz
    return;
  }
  const nx = dx / d;
  const nz = dz / d;
  n.rotY = Math.atan2(nx, nz);
  let px = n.x + nx * PED_SPEED * dt;
  let pz = n.z + nz * PED_SPEED * dt;
  const r = resolveAgainstBuildings({ x: px, z: pz, r: PED_RADIUS }, city.buildings);
  // If a building blocked us, repath next tick.
  if (Math.hypot(r.x - px, r.z - pz) > 0.01) n.repathAt = tick;
  px = r.x;
  pz = r.z;
  const b = clampToBounds(px, pz, PED_RADIUS);
  n.x = b.x;
  n.z = b.z;
}

function stepCarNpc(n: NpcSimState, dt: number) {
  if (n.path.length < 2) return;
  let target = n.path[n.seg + n.dir];
  if (!target) {
    // Reached an end -> reverse.
    n.dir *= -1;
    target = n.path[n.seg + n.dir];
    if (!target) return;
  }
  const dx = target.x - n.x;
  const dz = target.z - n.z;
  const d = Math.hypot(dx, dz);
  if (d < 1.5) {
    n.seg += n.dir;
    if (n.seg <= 0) {
      n.seg = 0;
      n.dir = 1;
    } else if (n.seg >= n.path.length - 1) {
      n.seg = n.path.length - 1;
      n.dir = -1;
    }
    return;
  }
  const nx = dx / d;
  const nz = dz / d;
  n.rotY = Math.atan2(nx, nz);
  n.x += nx * n.speed * dt;
  n.z += nz * n.speed * dt;
}
