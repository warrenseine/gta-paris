import { Room, type Client } from 'colyseus';
import { Schema, MapSchema, ArraySchema, type, view, StateView } from '@colyseus/schema';
import {
  buildParis,
  stepFoot,
  stepCar,
  emptyInput,
  castRay,
  resolveAgainstBuildings,
  overWater,
  weapon,
  SHELL,
  TICK_RATE,
  DT,
  MSG,
  PLAYER,
  CAR,
  INTEREST_RADIUS,
  MAX_REWIND_MS,
  TANK_MAX_SPEED,
  type CityData,
  type WaterField,
  type FootState,
  type CarState,
  type InputCommand,
  type FireMessage,
  type HitTarget,
} from '@gta/shared';
import {
  spawnNpcs,
  stepNpc,
  reviveNpc,
  stepPoliceCar,
  NPC_CAR,
  NPC_PED,
  NPC_COP,
  NPC_POLICE,
  NPC_TANK,
  type NpcSimState,
} from '../sim/NpcSim.js';

export class PlayerState extends Schema {
  @type('string') id = '';
  @type('string') nickname = '';
  @type('number') x = 0;
  @type('number') z = 0;
  @type('number') vx = 0;
  @type('number') vz = 0;
  @type('number') rotY = 0;
  @type('number') health = 100;
  @type('number') stamina = 100;
  @type('boolean') alive = true;
  @type('boolean') wanted = false;
  @type('uint8') stars = 0; // wanted level 0..5
  @type('number') weaponId = 1;
  @type('number') ammo = 12;
  @type('number') kills = 0;
  @type('number') deaths = 0;
  @type('string') vehicleId = '';
  @type('number') lastProcessedInputSeq = 0;
}

export class VehicleState extends Schema {
  @type('string') id = '';
  @type('number') x = 0;
  @type('number') z = 0;
  @type('number') rotY = 0;
  @type('number') speed = 0;
  @type('number') colorId = 0;
  @type('uint8') kind = 0; // 0 = car, 1 = police, 2 = tank
  @type('string') driverId = '';
}

export class PickupState extends Schema {
  @type('string') id = '';
  @type('number') x = 0;
  @type('number') z = 0;
  @type('uint8') kind = 0; // 0 = weapon, 1 = health
  @type('number') weaponId = 1;
  @type('boolean') active = true;
}

export class NpcState extends Schema {
  @type('string') id = '';
  @type('number') x = 0;
  @type('number') z = 0;
  @type('number') rotY = 0;
  @type('uint8') kind = 0; // 0 = ped, 1 = car
  @type('uint8') colorId = 0;
  @type('boolean') dead = false; // corpse on the ground
}

export class KillEntry extends Schema {
  @type('string') killer = '';
  @type('string') victim = '';
}

// Non-view-filtered: every client gets the full scoreboard regardless of range.
export class ScoreEntry extends Schema {
  @type('string') nickname = '';
  @type('number') kills = 0;
  @type('number') deaths = 0;
}

export class GameState extends Schema {
  @view() @type({ map: PlayerState }) players = new MapSchema<PlayerState>();
  @view() @type({ map: VehicleState }) vehicles = new MapSchema<VehicleState>();
  @view() @type({ map: NpcState }) npcs = new MapSchema<NpcState>();
  @type({ map: PickupState }) pickups = new MapSchema<PickupState>();
  @type({ map: ScoreEntry }) scores = new MapSchema<ScoreEntry>();
  @type([KillEntry]) killfeed = new ArraySchema<KillEntry>();
  @type('number') serverTick = 0;
}

interface Snap {
  tick: number;
  x: number;
  z: number;
}

interface Sim {
  foot: FootState;
  queue: InputCommand[];
  prevEnter: boolean;
  lastToggleTick: number; // enter/exit debounce
  history: Snap[]; // for lag compensation
  lastFireTick: number;
  reloadAtTick: number;
  respawnAtTick: number;
}

const REWIND_TICKS = Math.ceil((MAX_REWIND_MS / 1000) * TICK_RATE);
const RESPAWN_TICKS = 3 * TICK_RATE;
const RELOAD_TICKS = Math.ceil(1.4 * TICK_RATE);
const PICKUP_RESPAWN_TICKS = 8 * TICK_RATE;
const PICKUP_RADIUS = 1.6;
const ENTER_COOLDOWN_TICKS = Math.ceil(0.5 * TICK_RATE); // debounce car enter/exit
const CORPSE_TICKS = 7 * TICK_RATE; // how long a dead ped stays on the ground
const STAR_DECAY_TICKS = 22 * TICK_RATE; // time to shed ONE star while evading
const POLICE_SIGHT = 130; // police notice gunfire within this range
const COP_FIRE_RANGE = 45;
const COP_DAMAGE = 10;
const CAR_MAX_HP = 100;

export class ParisRoom extends Room<GameState> {
  maxClients = 100;
  private city!: CityData;
  private water!: WaterField;
  private sims = new Map<string, Sim>();
  private cars = new Map<string, CarState>();
  private pickupRespawn = new Map<string, number>();
  private carHp = new Map<string, number>(); // player-vehicle health
  private vehicleSpawns: { x: number; z: number; rotationY: number; colorId: number }[] = [];
  private npcSims: NpcSimState[] = [];
  private npcById = new Map<string, NpcSimState>();
  private vjCounter = 0; // carjacked-vehicle id counter
  private ejectCounter = 0;
  private copCounter = 0;
  private tankCounter = 0;
  private dispatchCounter = 0;
  // playerId -> wanted level (1..5) + tick the heat expires.
  private stars = new Map<string, { n: number; until: number }>();

  private addNpcState(n: NpcSimState) {
    const ns = new NpcState();
    ns.id = n.id;
    ns.x = n.x;
    ns.z = n.z;
    ns.rotY = n.rotY;
    ns.kind = n.kind;
    ns.colorId = n.colorId;
    ns.dead = n.dead;
    this.state.npcs.set(n.id, ns);
  }

  onCreate() {
    this.setState(new GameState());
    this.city = buildParis();
    this.water = {
      seine: this.city.river.points,
      seineWidth: this.city.river.width,
      bridges: this.city.bridges,
      island: this.city.island,
    };

    this.vehicleSpawns = this.city.vehicles.map((v) => ({ ...v }));
    this.city.vehicles.forEach((v, i) => {
      const id = `v${i}`;
      const vs = new VehicleState();
      vs.id = id;
      vs.x = v.x;
      vs.z = v.z;
      vs.rotY = v.rotationY;
      vs.colorId = v.colorId;
      this.state.vehicles.set(id, vs);
      this.cars.set(id, { x: v.x, z: v.z, rotY: v.rotationY, speed: 0 });
      this.carHp.set(id, CAR_MAX_HP);
    });

    // Ambient NPCs (peds + traffic).
    this.npcSims = spawnNpcs(this.city);
    for (const n of this.npcSims) {
      this.npcById.set(n.id, n);
      this.addNpcState(n);
    }

    this.city.pickups.forEach((pk, i) => {
      const id = `p${i}`;
      const ps = new PickupState();
      ps.id = id;
      ps.x = pk.x;
      ps.z = pk.z;
      ps.kind = pk.kind;
      ps.weaponId = pk.weaponId;
      this.state.pickups.set(id, ps);
    });

    this.setSimulationInterval(() => this.tick(), 1000 / TICK_RATE);

    this.onMessage(MSG.input, (client, input: InputCommand) => {
      const sim = this.sims.get(client.sessionId);
      if (sim && sim.queue.length < 8) sim.queue.push(input);
    });

    this.onMessage(MSG.fire, (client, msg: FireMessage) => this.handleFire(client, msg));

    console.log('[gta-paris] ParisRoom created, authoritative sim @', TICK_RATE, 'Hz');
  }

  private randomSpawn() {
    const sp = this.city.spawns[Math.floor(Math.random() * this.city.spawns.length)];
    const safe = this.offRoad(sp.x, sp.z); // never drop the player onto a roadway
    return { x: safe.x, z: safe.z, rotationY: sp.rotationY };
  }

  /** Nudge a point off every nearby road so spawns don't land in traffic. */
  private offRoad(x: number, z: number): { x: number; z: number } {
    const CLEAR = 4; // player radius + margin beyond the kerb
    for (let iter = 0; iter < 16; iter++) {
      let sx = 0;
      let sz = 0;
      let hits = 0;
      for (const r of this.city.roads) {
        for (let i = 0; i < r.points.length - 1; i++) {
          const a = r.points[i];
          const b = r.points[i + 1];
          const abx = b.x - a.x;
          const abz = b.z - a.z;
          const t = Math.max(0, Math.min(1, ((x - a.x) * abx + (z - a.z) * abz) / (abx * abx + abz * abz || 1)));
          const dx = x - (a.x + abx * t);
          const dz = z - (a.z + abz * t);
          const d = Math.hypot(dx, dz);
          const need = r.width / 2 + CLEAR;
          if (d < need) {
            if (d < 0.001) {
              // Dead-centre on the road: pick a deterministic sideways normal.
              const l = Math.hypot(abx, abz) || 1;
              sx += (-abz / l) * need;
              sz += (abx / l) * need;
            } else {
              const push = need - d;
              sx += (dx / d) * push;
              sz += (dz / d) * push;
            }
            hits++;
          }
        }
      }
      if (!hits) break; // clear of every road
      x += sx + (sx >= 0 ? 0.5 : -0.5);
      z += sz + (sz >= 0 ? 0.5 : -0.5);
    }
    return { x, z };
  }

  onJoin(client: Client, options: { nickname?: string }) {
    const spawn = this.randomSpawn();
    const p = new PlayerState();
    p.id = client.sessionId;
    p.nickname = (options?.nickname ?? 'Anon').slice(0, 16) || 'Anon';
    p.x = spawn.x;
    p.z = spawn.z;
    p.rotY = spawn.rotationY;
    this.state.players.set(client.sessionId, p);
    this.sims.set(client.sessionId, {
      foot: { x: spawn.x, z: spawn.z, vx: 0, vz: 0, rotY: spawn.rotationY, stamina: PLAYER.maxStamina },
      queue: [],
      prevEnter: false,
      lastToggleTick: -999,
      history: [],
      lastFireTick: -999,
      reloadAtTick: 0,
      respawnAtTick: 0,
    });
    client.view = new StateView();
    const sc = new ScoreEntry();
    sc.nickname = p.nickname;
    this.state.scores.set(client.sessionId, sc);
    console.log(`[gta-paris] ${p.nickname} joined (${this.clients.length} online)`);
  }

  onLeave(client: Client) {
    const ps = this.state.players.get(client.sessionId);
    if (ps?.vehicleId) {
      const v = this.state.vehicles.get(ps.vehicleId);
      if (v) v.driverId = '';
    }
    this.state.players.delete(client.sessionId);
    this.state.scores.delete(client.sessionId);
    this.sims.delete(client.sessionId);
  }

  private handleEnterExit(id: string, ps: PlayerState, sim: Sim) {
    if (ps.vehicleId) {
      const v = this.state.vehicles.get(ps.vehicleId);
      if (v) {
        v.driverId = '';
        const ox = v.x + Math.cos(v.rotY) * 2.5;
        const oz = v.z - Math.sin(v.rotY) * 2.5;
        sim.foot = { x: ox, z: oz, vx: 0, vz: 0, rotY: v.rotY, stamina: sim.foot.stamina };
        ps.x = ox;
        ps.z = oz;
      }
      ps.vehicleId = '';
      return;
    }
    // Find the nearest car within reach: a player vehicle (free OR occupied =
    // carjack) or an NPC traffic car (carjack the AI driver).
    let bestD = 10;
    let bestVid = '';
    let bestNpc: NpcSimState | null = null;
    for (const [vid, v] of this.state.vehicles) {
      const d = Math.hypot(v.x - sim.foot.x, v.z - sim.foot.z);
      if (d < bestD) {
        bestD = d;
        bestVid = vid;
        bestNpc = null;
      }
    }
    for (const n of this.npcSims) {
      if (n.dead || (n.kind !== NPC_CAR && n.kind !== NPC_POLICE && n.kind !== NPC_TANK)) continue;
      const reach = n.kind === NPC_TANK ? 14 : 10; // tanks are big — grab from further
      const d = Math.hypot(n.x - sim.foot.x, n.z - sim.foot.z);
      if (d < Math.min(bestD, reach)) {
        bestD = d;
        bestNpc = n;
        bestVid = '';
      }
    }

    if (bestNpc) {
      this.carjackNpcCar(bestNpc, id, ps);
    } else if (bestVid) {
      const v = this.state.vehicles.get(bestVid);
      if (!v) return;
      if (v.driverId && v.driverId !== id) this.ejectDriver(v.driverId); // carjack a player
      v.driverId = id;
      ps.vehicleId = bestVid;
    }
  }

  /** Kick a player out of their car onto the street beside it. */
  private ejectDriver(driverId: string) {
    const dp = this.state.players.get(driverId);
    if (!dp || !dp.vehicleId) return;
    const v = this.state.vehicles.get(dp.vehicleId);
    const dsim = this.sims.get(driverId);
    if (v && dsim) {
      const ox = v.x + Math.cos(v.rotY) * 3;
      const oz = v.z - Math.sin(v.rotY) * 3;
      dsim.foot = { x: ox, z: oz, vx: 0, vz: 0, rotY: v.rotY, stamina: dsim.foot.stamina };
      dp.x = ox;
      dp.z = oz;
    }
    dp.vehicleId = '';
  }

  /** Take an NPC vehicle (traffic / police / tank): eject its driver, convert it. */
  private carjackNpcCar(npc: NpcSimState, id: string, ps: PlayerState) {
    // Ejected driver beside the vehicle — a cop if it's a police car, else a civilian.
    const ex = npc.x + Math.cos(npc.rotY) * 3;
    const ez = npc.z - Math.sin(npc.rotY) * 3;
    if (npc.kind === NPC_POLICE) this.deployCop(ex, ez, id); // a real officer who gives chase
    else this.spawnEjectedPed(ex, ez);
    // New player vehicle at the car's pose, keeping its breed (police / tank).
    const kind = npc.kind === NPC_TANK ? 2 : npc.kind === NPC_POLICE ? 1 : 0;
    const vid = `vj${this.vjCounter++}`;
    const vs = new VehicleState();
    vs.id = vid;
    vs.x = npc.x;
    vs.z = npc.z;
    vs.rotY = npc.rotY;
    vs.colorId = npc.colorId;
    vs.kind = kind;
    vs.driverId = id;
    this.state.vehicles.set(vid, vs);
    this.cars.set(vid, { x: npc.x, z: npc.z, rotY: npc.rotY, speed: 0 });
    this.carHp.set(vid, kind === 2 ? 320 : CAR_MAX_HP);
    ps.vehicleId = vid;
    // Stealing the law is a crime — instant heat.
    if (kind === 1) this.addStars(id, 1);
    if (kind === 2) this.addStars(id, 3);
    // Retire the NPC (regenerates later for traffic; dispatched units don't).
    npc.dead = true;
    npc.respawnAt = npc.kind === NPC_CAR ? this.state.serverTick + 14 * TICK_RATE : Number.MAX_SAFE_INTEGER;
    this.state.npcs.delete(npc.id);
  }

  private spawnEjectedPed(x: number, z: number) {
    const n: NpcSimState = {
      id: `eject${this.ejectCounter++}`,
      kind: 0,
      x,
      z,
      rotY: 0,
      colorId: Math.floor(Math.random() * 5),
      hp: 20,
      dead: false,
      respawnAt: 0,
      tx: x,
      tz: z,
      repathAt: 0,
      path: [],
      seg: 0,
      dir: 1,
      speed: 0,
      targetId: '',
      fireCd: 0,
      deployed: false,
    };
    this.npcSims.push(n);
    this.npcById.set(n.id, n);
    this.addNpcState(n);
  }

  /** Server-validated hitscan with lag compensation. */
  private handleFire(client: Client, msg: FireMessage) {
    const shooter = this.state.players.get(client.sessionId);
    const sim = this.sims.get(client.sessionId);
    if (!shooter || !sim || !shooter.alive) return; // firing from a car is allowed

    // Driving a tank? The main gun fires explosive shells, not bullets.
    const drivingVeh = shooter.vehicleId ? this.state.vehicles.get(shooter.vehicleId) : undefined;
    const isTank = drivingVeh?.kind === 2;
    const w = isTank ? weapon(SHELL.weaponId) : weapon(shooter.weaponId);
    const tick = this.state.serverTick;
    // Rate limit + ammo.
    const minInterval = Math.max(1, Math.floor(TICK_RATE / w.fireRate) - 1);
    if (tick - sim.lastFireTick < minInterval) return;
    if (Number.isFinite(w.magazine) && shooter.ammo <= 0) return;
    sim.lastFireTick = tick;
    if (Number.isFinite(w.magazine)) shooter.ammo = Math.max(0, shooter.ammo - 1);

    // Firing near police -> wanted.
    for (const n of this.npcSims) {
      if (n.dead || (n.kind !== NPC_POLICE && n.kind !== NPC_COP && n.kind !== NPC_TANK)) continue;
      if (Math.hypot(n.x - shooter.x, n.z - shooter.z) < POLICE_SIGHT) {
        this.addStars(client.sessionId, 1);
        break;
      }
    }

    if (isTank) {
      // Lob a shell: find the first thing the aim line hits, blow it up there.
      const impact = castRay(msg.ox, msg.oz, msg.dx, msg.dz, w.range, [], this.city.buildings);
      const ix = impact ? impact.x : msg.ox + msg.dx * w.range;
      const iz = impact ? impact.z : msg.oz + msg.dz * w.range;
      this.explodeAt(ix, iz, client.sessionId);
      this.broadcast(MSG.fireEvent, { ox: msg.ox, oz: msg.oz, tx: ix, tz: iz, hit: true, weaponId: SHELL.weaponId });
      return;
    }

    // Rewind targets to the tick the client was seeing.
    const rewindTick = clamp(msg.clientTick, tick - REWIND_TICKS, tick);
    const targets: HitTarget[] = [];
    for (const [id, p] of this.state.players) {
      if (id === client.sessionId || !p.alive) continue;
      const s = this.sims.get(id);
      const pos = s ? rewound(s.history, rewindTick) : { x: p.x, z: p.z };
      targets.push({ id, x: pos.x, z: pos.z, r: 0.6 });
    }
    // NPCs are shootable too (no lag comp needed — they move slowly).
    for (const n of this.npcSims) {
      if (n.dead) continue;
      targets.push({ id: n.id, x: n.x, z: n.z, r: n.kind === NPC_CAR ? 1.7 : 0.7 });
    }
    // Player vehicles (so cars can be shot up and explode).
    for (const [vid, v] of this.state.vehicles) {
      if (vid === shooter.vehicleId) continue; // not your own ride
      targets.push({ id: vid, x: v.x, z: v.z, r: 1.7 });
    }

    let hitTargetId: string | null = null;
    let hx = 0;
    let hz = 0;
    for (let pellet = 0; pellet < w.pellets; pellet++) {
      const spread = (Math.random() - 0.5) * 2 * w.spread;
      const c = Math.cos(spread);
      const sN = Math.sin(spread);
      const dx = msg.dx * c - msg.dz * sN;
      const dz = msg.dx * sN + msg.dz * c;
      const hit = castRay(msg.ox, msg.oz, dx, dz, w.range, targets, this.city.buildings);
      if (hit) {
        if (!hitTargetId) {
          hitTargetId = hit.targetId;
          hx = hit.x;
          hz = hit.z;
        }
        this.applyDamage(client.sessionId, hit.targetId, w.damage);
      }
    }

    // Broadcast a cosmetic tracer to other nearby clients.
    const tx = hitTargetId ? hx : msg.ox + msg.dx * w.range;
    const tz = hitTargetId ? hz : msg.oz + msg.dz * w.range;
    this.broadcast(
      MSG.fireEvent,
      { ox: msg.ox, oz: msg.oz, tx, tz, hit: !!hitTargetId, weaponId: shooter.weaponId },
      { except: client },
    );
  }

  private applyDamage(killerId: string, victimId: string, dmg: number) {
    // NPC target? Kill it (no score), respawn later.
    const npc = this.npcById.get(victimId);
    if (npc) {
      if (npc.dead) return;
      npc.hp -= dmg;
      if (npc.hp <= 0) {
        npc.dead = true;
        const ns = this.state.npcs.get(npc.id);
        // Killing the law raises heat (cops worth more than a squad car).
        if (this.state.players.has(killerId)) {
          if (npc.kind === NPC_COP) this.addStars(killerId, 2);
          else if (npc.kind === NPC_POLICE) this.addStars(killerId, 1);
          else if (npc.kind === NPC_TANK) this.addStars(killerId, 2);
        }
        if (npc.kind === NPC_CAR || npc.kind === NPC_POLICE || npc.kind === NPC_TANK) {
          this.broadcast(MSG.explosion, { x: npc.x, z: npc.z });
          npc.respawnAt = this.state.serverTick + 12 * TICK_RATE;
          this.state.npcs.delete(npc.id);
        } else if (npc.kind === NPC_COP) {
          if (ns) ns.dead = true; // body lingers briefly, then is removed (no respawn)
          npc.respawnAt = this.state.serverTick + CORPSE_TICKS;
          npc.noRevive = true;
        } else {
          if (ns) ns.dead = true;
          npc.respawnAt = this.state.serverTick + CORPSE_TICKS;
        }
      }
      return;
    }
    // Player vehicle target? Damage the car (can explode).
    if (this.carHp.has(victimId)) {
      this.damageCar(victimId, dmg, killerId);
      return;
    }
    const victim = this.state.players.get(victimId);
    if (!victim || !victim.alive) return;
    victim.health -= dmg;
    if (victim.health <= 0) this.killPlayer(victimId, killerId);
  }

  /** Tank shell blast: area damage to players, vehicles and NPCs around a point. */
  private explodeAt(x: number, z: number, killerId: string) {
    this.broadcast(MSG.explosion, { x, z });
    const R = SHELL.radius;
    const kv = this.state.players.get(killerId)?.vehicleId;
    for (const [pid, p] of this.state.players) {
      if (!p.alive || p.vehicleId) continue; // in-car damage routed via the vehicle
      const d = Math.hypot(p.x - x, p.z - z);
      if (d > R) continue;
      p.health -= SHELL.damage * (1 - d / R);
      if (p.health <= 0) this.killPlayer(pid, killerId);
    }
    for (const [vid, v] of this.state.vehicles) {
      if (vid === kv) continue; // not your own tank
      const d = Math.hypot(v.x - x, v.z - z);
      if (d <= R) this.damageCar(vid, SHELL.damage * (1 - d / R), killerId);
    }
    for (const n of this.npcSims) {
      if (n.dead) continue;
      const d = Math.hypot(n.x - x, n.z - z);
      if (d <= R) this.applyDamage(killerId, n.id, SHELL.damage * (1 - d / R));
    }
  }

  private killPlayer(victimId: string, killerId: string) {
    const victim = this.state.players.get(victimId);
    if (!victim || !victim.alive) return;
    victim.health = 0;
    victim.alive = false;
    victim.deaths++;
    this.stars.delete(victimId); // wasted — heat clears
    const killer = this.state.players.get(killerId);
    if (killer && killerId !== victimId) killer.kills++;
    const vScore = this.state.scores.get(victimId);
    if (vScore) vScore.deaths++;
    const kScore = this.state.scores.get(killerId);
    if (kScore && killerId !== victimId) kScore.kills++;
    if (victim.vehicleId) {
      const v = this.state.vehicles.get(victim.vehicleId);
      if (v) v.driverId = '';
      victim.vehicleId = '';
    }
    const sim = this.sims.get(victimId);
    if (sim) sim.respawnAtTick = this.state.serverTick + RESPAWN_TICKS;
    this.pushKill(killer?.nickname ?? '?', victim.nickname);
  }

  /** Damage a player vehicle; explode (killing the driver) at 0 hp. */
  private damageCar(vid: string, dmg: number, attackerId: string) {
    const hp = (this.carHp.get(vid) ?? CAR_MAX_HP) - dmg;
    if (hp > 0) {
      this.carHp.set(vid, hp);
      return;
    }
    const v = this.state.vehicles.get(vid);
    if (v) this.broadcast(MSG.explosion, { x: v.x, z: v.z });
    // Kill the driver, if any.
    if (v?.driverId) this.killPlayer(v.driverId, attackerId || v.driverId);
    // Respawn the wreck at a vehicle spawn, repaired.
    const sp = this.vehicleSpawns[Math.floor(Math.random() * this.vehicleSpawns.length)];
    const car = this.cars.get(vid);
    if (car && sp) {
      car.x = sp.x;
      car.z = sp.z;
      car.rotY = sp.rotationY;
      car.speed = 0;
    }
    if (v) v.driverId = '';
    this.carHp.set(vid, CAR_MAX_HP);
  }

  private pushKill(killer: string, victim: string) {
    const e = new KillEntry();
    e.killer = killer;
    e.victim = victim;
    this.state.killfeed.push(e);
    while (this.state.killfeed.length > 5) this.state.killfeed.shift();
  }

  private respawn(ps: PlayerState, sim: Sim) {
    const sp = this.randomSpawn();
    sim.foot = { x: sp.x, z: sp.z, vx: 0, vz: 0, rotY: sp.rotationY, stamina: PLAYER.maxStamina };
    sim.history.length = 0;
    ps.x = sp.x;
    ps.z = sp.z;
    ps.rotY = sp.rotationY;
    ps.health = PLAYER.maxHealth;
    ps.alive = true;
    ps.weaponId = 1;
    ps.ammo = weapon(1).magazine;
    ps.vehicleId = '';
  }

  private tick() {
    const tickNo = this.state.serverTick;
    const world = {
      buildings: this.city.buildings,
      trees: this.city.trees,
      boundary: this.city.boundary,
      water: this.water,
    };

    for (const [id, sim] of this.sims) {
      const ps = this.state.players.get(id);
      if (!ps) continue;

      if (!ps.alive) {
        if (tickNo >= sim.respawnAtTick) this.respawn(ps, sim);
        continue;
      }

      const inputs = sim.queue.length ? sim.queue : [emptyInput(ps.lastProcessedInputSeq)];
      let lastSeq = ps.lastProcessedInputSeq;

      for (const input of inputs) {
        // Enter/exit on rising edge, debounced (avoid instant re-toggle).
        if (input.enterExit && !sim.prevEnter && tickNo - sim.lastToggleTick > ENTER_COOLDOWN_TICKS) {
          sim.lastToggleTick = tickNo;
          this.handleEnterExit(id, ps, sim);
        }
        sim.prevEnter = input.enterExit;

        if (ps.vehicleId) {
          const car = this.cars.get(ps.vehicleId);
          if (car) {
            const veh = this.state.vehicles.get(ps.vehicleId);
            const carWorld = veh?.kind === 2 ? { ...world, maxSpeed: TANK_MAX_SPEED } : world;
            const next = stepCar(car, input, DT, carWorld);
            this.cars.set(ps.vehicleId, next);
            // Crash damage only on an actual building impact, proportional to the
            // speed driven into the wall, accumulating until the car explodes.
            // (No false hits from turning, water, or being nudged while parked.)
            if (next.wallImpact && next.wallImpact > 9) {
              this.damageCar(ps.vehicleId, (next.wallImpact - 8) * 2.0, id);
            }
            sim.foot.x = next.x;
            sim.foot.z = next.z;
            sim.foot.rotY = next.rotY;
            // Sinking in the Seine: the driver drowns unless they bail out.
            if (overWater(next.x, next.z, this.water)) {
              ps.health -= PLAYER.drownDps * DT;
              if (ps.health <= 0) this.killPlayer(id, id);
            }
          }
        } else {
          sim.foot = stepFoot(sim.foot, input, DT, world);
        }
        if (!ps.alive) break; // drowned this step
        lastSeq = input.seq;
      }
      sim.queue.length = 0;

      // Auto-reload.
      const w = weapon(ps.weaponId);
      if (Number.isFinite(w.magazine) && ps.ammo <= 0 && sim.reloadAtTick === 0) {
        sim.reloadAtTick = tickNo + RELOAD_TICKS;
      }
      if (sim.reloadAtTick > 0 && tickNo >= sim.reloadAtTick) {
        ps.ammo = w.magazine;
        sim.reloadAtTick = 0;
      }

      ps.x = sim.foot.x;
      ps.z = sim.foot.z;
      ps.vx = sim.foot.vx;
      ps.vz = sim.foot.vz;
      ps.rotY = sim.foot.rotY;
      ps.stamina = sim.foot.stamina;
      ps.stars = this.starsOf(id);
      ps.wanted = ps.stars > 0;
      ps.lastProcessedInputSeq = lastSeq;

      // Record lag-comp history.
      sim.history.push({ tick: tickNo, x: ps.x, z: ps.z });
      if (sim.history.length > REWIND_TICKS + 2) sim.history.shift();
    }

    // Driverless cars coast.
    for (const [vid, v] of this.state.vehicles) {
      const car = this.cars.get(vid)!;
      if (!v.driverId && Math.abs(car.speed) > 0.05) {
        this.cars.set(vid, stepCar(car, emptyInput(), DT, world));
      }
      const c = this.cars.get(vid)!;
      v.x = c.x;
      v.z = c.z;
      v.rotY = c.rotY;
      v.speed = c.speed;
    }

    // Ambient NPCs.
    const purge: string[] = [];
    for (const n of this.npcSims) {
      if (n.dead) {
        if (tickNo >= n.respawnAt) {
          this.state.npcs.delete(n.id); // clear corpse
          if (n.noRevive) {
            purge.push(n.id); // dispatched units / cops: gone for good (no leak)
          } else {
            reviveNpc(n, this.city);
            this.addNpcState(n);
          }
        }
        continue;
      }
      if (n.kind === NPC_POLICE) this.stepPolice(n);
      else if (n.kind === NPC_COP) this.stepCop(n, tickNo);
      else if (n.kind === NPC_TANK) this.stepTank(n, tickNo);
      else stepNpc(n, DT, this.city, tickNo);
      const ns = this.state.npcs.get(n.id);
      if (ns) {
        ns.x = n.x;
        ns.z = n.z;
        ns.rotY = n.rotY;
      }
    }
    if (purge.length) {
      const gone = new Set(purge);
      this.npcSims = this.npcSims.filter((n) => !gone.has(n.id));
      for (const id of purge) this.npcById.delete(id);
    }

    this.resolveCarCollisions();
    this.resolveRunOver(tickNo);
    this.updatePickups(tickNo);
    this.decayStars(tickNo);
    this.updateInterest();
    this.state.serverTick++;
  }

  /** Cars hitting people: peds are thrown + killed; players are knocked back + hurt. */
  private resolveRunOver(tickNo: number) {
    const cars: { x: number; z: number; rotY: number; speed: number; driverId: string }[] = [];
    for (const [vid, car] of this.cars) {
      cars.push({ ...car, driverId: this.state.vehicles.get(vid)?.driverId ?? '' });
    }
    for (const n of this.npcSims) if (!n.dead && n.kind === NPC_CAR) cars.push({ ...n, driverId: '' });

    for (const car of cars) {
      const fast = Math.abs(car.speed);
      if (fast < 6) continue;

      // Pedestrians and cops: thrown + killed.
      for (const ped of this.npcSims) {
        if (ped.dead || (ped.kind !== NPC_PED && ped.kind !== NPC_COP)) continue;
        if (Math.hypot(ped.x - car.x, ped.z - car.z) > CAR.radius + 0.8) continue;
        // Vehicular manslaughter raises heat (mowing a cop earns more).
        if (car.driverId && this.state.players.has(car.driverId)) {
          this.addStars(car.driverId, ped.kind === NPC_COP ? 2 : 1);
        }
        ped.dead = true;
        ped.x += Math.sin(car.rotY) * 5;
        ped.z += Math.cos(car.rotY) * 5;
        ped.respawnAt = tickNo + CORPSE_TICKS;
        if (ped.kind === NPC_COP) ped.noRevive = true;
        const ns = this.state.npcs.get(ped.id);
        if (ns) {
          ns.x = ped.x;
          ns.z = ped.z;
          ns.dead = true;
        }
      }

      // On-foot players: knocked back + damaged (lethal if hit hard).
      for (const [pid, sim] of this.sims) {
        if (pid === car.driverId) continue;
        const ps = this.state.players.get(pid);
        if (!ps || !ps.alive || ps.vehicleId) continue;
        const reach = CAR.radius + PLAYER.radius;
        if (Math.hypot(sim.foot.x - car.x, sim.foot.z - car.z) > reach) continue;
        // Knock the player along the car's heading.
        sim.foot.x = car.x + Math.sin(car.rotY) * (reach + 1.5);
        sim.foot.z = car.z + Math.cos(car.rotY) * (reach + 1.5);
        sim.foot.vx = 0;
        sim.foot.vz = 0;
        const dmg = Math.min(60, (fast - 4) * 5);
        ps.health -= dmg;
        if (ps.health <= 0) this.killPlayer(pid, car.driverId || pid);
      }
    }
  }

  /** Current wanted level. Stars fall off one at a time (see decayStars). */
  private starsOf(pid: string): number {
    return this.stars.get(pid)?.n ?? 0;
  }

  /** Shed one star per STAR_DECAY_TICKS of no fresh crime (gradual cooldown). */
  private decayStars(tickNo: number) {
    for (const [pid, e] of this.stars) {
      if (tickNo < e.until) continue;
      e.n -= 1;
      if (e.n <= 0) this.stars.delete(pid);
      else e.until = tickNo + STAR_DECAY_TICKS;
    }
  }

  private isWanted(pid: string): boolean {
    return this.starsOf(pid) > 0;
  }

  /** Raise a player's wanted level, refresh the heat timer, and dispatch heat. */
  private addStars(pid: string, by: number) {
    const cur = this.starsOf(pid);
    const n = Math.min(5, cur + by);
    if (n <= 0) return;
    this.stars.set(pid, { n, until: this.state.serverTick + STAR_DECAY_TICKS });
    const ps = this.state.players.get(pid);
    if (!ps) return;
    // Escalating response: extra patrol cars at 3+, an army tank at 5.
    if (n > cur) {
      for (let lvl = cur + 1; lvl <= n; lvl++) {
        if (lvl >= 3) this.spawnPoliceNear(ps.x, ps.z);
        if (lvl >= 5) this.spawnTankNear(ps.x, ps.z, pid);
      }
    }
  }

  /** Count of live NPCs of a kind (caps escalation spam). */
  private countNpc(kind: number): number {
    let n = 0;
    for (const s of this.npcSims) if (!s.dead && s.kind === kind) n++;
    return n;
  }

  private spawnPoliceNear(x: number, z: number) {
    if (this.countNpc(NPC_POLICE) >= 8) return;
    const a = Math.random() * Math.PI * 2;
    const px = x + Math.cos(a) * 90;
    const pz = z + Math.sin(a) * 90;
    const n = this.blankNpc(`pol${this.dispatchCounter++}`, NPC_POLICE, px, pz);
    n.hp = 70;
    n.speed = 16;
    n.path = [{ x: px, z: pz }, { x, z }]; // roll toward the action
    this.npcSims.push(n);
    this.npcById.set(n.id, n);
    this.addNpcState(n);
  }

  private spawnTankNear(x: number, z: number, targetId: string) {
    if (this.countNpc(NPC_TANK) >= 1) return; // one tank at a time
    const a = Math.random() * Math.PI * 2;
    const tx = x + Math.cos(a) * 75; // close enough to actually see it roll in
    const tz = z + Math.sin(a) * 75;
    const n = this.blankNpc(`tank${this.tankCounter++}`, NPC_TANK, tx, tz);
    n.hp = 320;
    n.speed = 0;
    n.targetId = targetId;
    this.npcSims.push(n);
    this.npcById.set(n.id, n);
    this.addNpcState(n);
  }

  private blankNpc(id: string, kind: number, x: number, z: number): NpcSimState {
    return {
      id,
      kind,
      x,
      z,
      rotY: 0,
      colorId: 0,
      hp: 70,
      dead: false,
      respawnAt: Number.MAX_SAFE_INTEGER, // dispatched units don't auto-respawn
      tx: 0,
      tz: 0,
      repathAt: 0,
      path: [],
      seg: 0,
      dir: 1,
      speed: 0,
      targetId: '',
      fireCd: 0,
      deployed: false,
      noRevive: true, // dispatched heat doesn't repopulate the world
    };
  }

  /** Nearest alive wanted player to a point, within range. */
  private nearestWanted(x: number, z: number, range: number): { id: string; x: number; z: number } | null {
    let best: { id: string; x: number; z: number } | null = null;
    let bd = range;
    for (const [id, p] of this.state.players) {
      if (!p.alive || !this.isWanted(id)) continue;
      const d = Math.hypot(p.x - x, p.z - z);
      if (d < bd) {
        bd = d;
        best = { id, x: p.x, z: p.z };
      }
    }
    return best;
  }

  /** Police car: patrol, but stop and deploy a cop when a wanted player is near. */
  private stepPolice(n: NpcSimState) {
    const target = this.nearestWanted(n.x, n.z, POLICE_SIGHT);
    if (target) {
      n.speed *= 0.7; // brake to a stop
      n.rotY = Math.atan2(target.x - n.x, target.z - n.z);
      if (!n.deployed) {
        // More heat = more boots on the ground.
        const squad = Math.max(1, Math.min(this.starsOf(target.id), 3));
        for (let i = 0; i < squad; i++) this.deployCop(n.x + 3 + i * 2.2, n.z + 3, target.id);
        n.deployed = true;
      }
    } else {
      n.deployed = false;
      stepPoliceCar(n, DT);
    }
  }

  private deployCop(x: number, z: number, targetId: string) {
    const n: NpcSimState = {
      id: `cop${this.copCounter++}`,
      kind: NPC_COP,
      x,
      z,
      rotY: 0,
      colorId: 0,
      hp: 40,
      dead: false,
      respawnAt: 0,
      tx: 0,
      tz: 0,
      repathAt: 0,
      path: [],
      seg: 0,
      dir: 1,
      speed: 0,
      targetId,
      fireCd: 0,
      deployed: true,
    };
    this.npcSims.push(n);
    this.npcById.set(n.id, n);
    this.addNpcState(n);
  }

  /** Cop on foot: chase the wanted player and shoot. */
  private stepCop(n: NpcSimState, tickNo: number) {
    const ps = this.state.players.get(n.targetId);
    const dx = ps ? ps.x - n.x : 0;
    const dz = ps ? ps.z - n.z : 0;
    const d = Math.hypot(dx, dz);
    // Give up: target gone, no longer wanted, dead, or too far.
    if (!ps || !ps.alive || !this.isWanted(n.targetId) || d > 240) {
      n.dead = true;
      n.noRevive = true; // give up the chase and despawn (purged next tick)
      n.respawnAt = tickNo;
      this.state.npcs.delete(n.id);
      return;
    }
    n.rotY = Math.atan2(dx, dz);
    if (d > COP_FIRE_RANGE * 0.7) {
      const sp = 5;
      const nx = n.x + (dx / d) * sp * DT;
      const nz = n.z + (dz / d) * sp * DT;
      const r = resolveAgainstBuildings({ x: nx, z: nz, r: 0.4 }, this.city.buildings);
      n.x = r.x;
      n.z = r.z;
    }
    n.fireCd -= DT;
    if (d < COP_FIRE_RANGE && n.fireCd <= 0) {
      n.fireCd = 0.8;
      // Cops aren't crack shots — and the further the target, the worse their
      // aim (close ~15% miss, at the edge of range ~85%).
      const missChance = Math.max(0.15, Math.min(0.85, 0.15 + 0.7 * (d / COP_FIRE_RANGE)));
      const miss = Math.random() < missChance;
      let tx = ps.x;
      let tz = ps.z;
      if (miss) {
        const off = (Math.random() < 0.5 ? -1 : 1) * (2 + Math.random() * 3.5);
        tx = ps.x + (-dz / d) * off; // veer the shot sideways
        tz = ps.z + (dx / d) * off;
      } else {
        this.applyDamage('', n.targetId, COP_DAMAGE);
      }
      this.broadcast(MSG.fireEvent, { ox: n.x, oz: n.z, tx, tz, hit: !miss, weaponId: 1 });
    }
    void tickNo;
  }

  /** Army tank: grind toward the wanted player and lob shells. */
  private stepTank(n: NpcSimState, tickNo: number) {
    const ps = this.state.players.get(n.targetId);
    // Stand down and withdraw once the target is gone / no longer wanted, so the
    // tank slot frees up for the next 5-star spree (otherwise it blocks forever).
    if (!ps || !ps.alive || !this.isWanted(n.targetId)) {
      n.dead = true;
      n.noRevive = true;
      n.respawnAt = tickNo;
      this.state.npcs.delete(n.id);
      return;
    }
    const dx = ps.x - n.x;
    const dz = ps.z - n.z;
    const d = Math.hypot(dx, dz) || 1;
    n.rotY = Math.atan2(dx, dz);
    const FIRE = 70;
    if (d > FIRE * 0.8) {
      const sp = 7; // slow and menacing
      const r = resolveAgainstBuildings({ x: n.x + (dx / d) * sp * DT, z: n.z + (dz / d) * sp * DT, r: CAR.radius }, this.city.buildings);
      n.x = r.x;
      n.z = r.z;
    }
    n.fireCd -= DT;
    if (d < FIRE && n.fireCd <= 0) {
      n.fireCd = 2.4;
      this.explodeAt(ps.x, ps.z, n.id);
      this.broadcast(MSG.fireEvent, { ox: n.x, oz: n.z, tx: ps.x, tz: ps.z, hit: true, weaponId: SHELL.weaponId });
    }
  }

  /** Server-side car-vs-car separation (player vehicles + NPC traffic). */
  private resolveCarCollisions() {
    const R = CAR.radius;
    const min = R * 2;
    interface C { x: number; z: number; set: (x: number, z: number) => void; slow: () => void }
    const list: C[] = [];

    for (const [vid, v] of this.state.vehicles) {
      const car = this.cars.get(vid);
      if (!car) continue;
      list.push({
        x: car.x,
        z: car.z,
        set: (x, z) => {
          car.x = x;
          car.z = z;
          v.x = x;
          v.z = z;
        },
        slow: () => {
          if (!v.driverId) car.speed *= 0.5; // only nudge driverless cars
        },
      });
    }
    for (const n of this.npcSims) {
      if (n.dead || (n.kind !== NPC_CAR && n.kind !== NPC_POLICE && n.kind !== NPC_TANK)) continue;
      list.push({
        x: n.x,
        z: n.z,
        set: (x, z) => {
          n.x = x;
          n.z = z;
          const ns = this.state.npcs.get(n.id);
          if (ns) {
            ns.x = x;
            ns.z = z;
          }
        },
        slow: () => {
          n.speed *= 0.35; // back off instead of grinding into the car ahead
        },
      });
    }

    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i];
        const b = list[j];
        let dx = b.x - a.x;
        let dz = b.z - a.z;
        let d = Math.hypot(dx, dz);
        if (d === 0) {
          dx = 1;
          dz = 0;
          d = 1;
        }
        if (d < min) {
          const push = (min - d) / 2;
          dx /= d;
          dz /= d;
          a.x -= dx * push;
          a.z -= dz * push;
          b.x += dx * push;
          b.z += dz * push;
          a.set(a.x, a.z);
          b.set(b.x, b.z);
          a.slow();
          b.slow();
        }
      }
    }
  }

  private updatePickups(tickNo: number) {
    for (const [id, pk] of this.state.pickups) {
      if (!pk.active) {
        const at = this.pickupRespawn.get(id) ?? 0;
        if (tickNo >= at) pk.active = true;
        continue;
      }
      for (const [, ps] of this.state.players) {
        if (!ps.alive) continue;
        // Cars roll over pickups too (wider reach when driving).
        const reach = ps.vehicleId ? PICKUP_RADIUS + CAR.radius : PICKUP_RADIUS;
        if (Math.hypot(pk.x - ps.x, pk.z - ps.z) >= reach) continue;
        if (pk.kind === 1) {
          if (ps.health >= PLAYER.maxHealth) continue; // only grab health when hurt
          ps.health = Math.min(PLAYER.maxHealth, ps.health + 50);
        } else {
          ps.weaponId = pk.weaponId;
          ps.ammo = weapon(pk.weaponId).magazine;
          const sim = this.sims.get(ps.id);
          if (sim) sim.reloadAtTick = 0;
        }
        pk.active = false;
        this.pickupRespawn.set(id, tickNo + PICKUP_RESPAWN_TICKS);
        break;
      }
    }
  }

  private updateInterest() {
    const R2 = INTEREST_RADIUS * INTEREST_RADIUS;
    for (const client of this.clients) {
      const v = client.view;
      const self = this.state.players.get(client.sessionId);
      if (!v || !self) continue;
      for (const [id, p] of this.state.players) {
        const near = id === client.sessionId || sq(p.x - self.x, p.z - self.z) < R2;
        const has = v.has(p);
        if (near && !has) v.add(p);
        else if (!near && has) v.remove(p);
      }
      for (const [vid, veh] of this.state.vehicles) {
        const near = self.vehicleId === vid || sq(veh.x - self.x, veh.z - self.z) < R2;
        const has = v.has(veh);
        if (near && !has) v.add(veh);
        else if (!near && has) v.remove(veh);
      }
      for (const [, npc] of this.state.npcs) {
        const near = sq(npc.x - self.x, npc.z - self.z) < R2;
        const has = v.has(npc);
        if (near && !has) v.add(npc);
        else if (!near && has) v.remove(npc);
      }
    }
  }
}

function sq(dx: number, dz: number): number {
  return dx * dx + dz * dz;
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/** Position of a player at (or just before) a given server tick. */
function rewound(history: Snap[], tick: number): { x: number; z: number } {
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i].tick <= tick) return { x: history[i].x, z: history[i].z };
  }
  return history.length ? { x: history[0].x, z: history[0].z } : { x: 0, z: 0 };
}
