import { Room, type Client } from 'colyseus';
import { Schema, MapSchema, ArraySchema, type, view, StateView } from '@colyseus/schema';
import {
  buildParis,
  stepFoot,
  stepCar,
  emptyInput,
  castRay,
  weapon,
  TICK_RATE,
  DT,
  MSG,
  PLAYER,
  CAR,
  INTEREST_RADIUS,
  MAX_REWIND_MS,
  type CityData,
  type FootState,
  type CarState,
  type InputCommand,
  type FireMessage,
  type HitTarget,
} from '@gta/shared';
import { spawnNpcs, stepNpc, reviveNpc, NPC_CAR, type NpcSimState } from '../sim/NpcSim.js';

export class PlayerState extends Schema {
  @type('string') id = '';
  @type('string') nickname = '';
  @type('number') x = 0;
  @type('number') z = 0;
  @type('number') vx = 0;
  @type('number') vz = 0;
  @type('number') rotY = 0;
  @type('number') health = 100;
  @type('boolean') alive = true;
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
  @type('string') driverId = '';
}

export class PickupState extends Schema {
  @type('string') id = '';
  @type('number') x = 0;
  @type('number') z = 0;
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

export class ParisRoom extends Room<GameState> {
  maxClients = 100;
  private city!: CityData;
  private sims = new Map<string, Sim>();
  private cars = new Map<string, CarState>();
  private pickupRespawn = new Map<string, number>();
  private npcSims: NpcSimState[] = [];
  private npcById = new Map<string, NpcSimState>();

  private addNpcState(n: NpcSimState) {
    const ns = new NpcState();
    ns.id = n.id;
    ns.x = n.x;
    ns.z = n.z;
    ns.rotY = n.rotY;
    ns.kind = n.kind;
    ns.colorId = n.colorId;
    this.state.npcs.set(n.id, ns);
  }

  onCreate() {
    this.setState(new GameState());
    this.city = buildParis();

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
    return this.city.spawns[Math.floor(Math.random() * this.city.spawns.length)];
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
      foot: { x: spawn.x, z: spawn.z, vx: 0, vz: 0, rotY: spawn.rotationY },
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
        sim.foot = { x: ox, z: oz, vx: 0, vz: 0, rotY: v.rotY };
        ps.x = ox;
        ps.z = oz;
      }
      ps.vehicleId = '';
      return;
    }
    let bestId = '';
    let bestD = 10;
    for (const [vid, v] of this.state.vehicles) {
      if (v.driverId) continue;
      const d = Math.hypot(v.x - sim.foot.x, v.z - sim.foot.z);
      if (d < bestD) {
        bestD = d;
        bestId = vid;
      }
    }
    if (bestId) {
      const v = this.state.vehicles.get(bestId)!;
      v.driverId = id;
      ps.vehicleId = bestId;
    }
  }

  /** Server-validated hitscan with lag compensation. */
  private handleFire(client: Client, msg: FireMessage) {
    const shooter = this.state.players.get(client.sessionId);
    const sim = this.sims.get(client.sessionId);
    if (!shooter || !sim || !shooter.alive) return; // firing from a car is allowed

    const w = weapon(shooter.weaponId);
    const tick = this.state.serverTick;
    // Rate limit + ammo.
    const minInterval = Math.max(1, Math.floor(TICK_RATE / w.fireRate) - 1);
    if (tick - sim.lastFireTick < minInterval) return;
    if (Number.isFinite(w.magazine) && shooter.ammo <= 0) return;
    sim.lastFireTick = tick;
    if (Number.isFinite(w.magazine)) shooter.ammo = Math.max(0, shooter.ammo - 1);

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
    this.broadcast(MSG.fireEvent, { ox: msg.ox, oz: msg.oz, tx, tz, hit: !!hitTargetId }, { except: client });
  }

  private applyDamage(killerId: string, victimId: string, dmg: number) {
    // NPC target? Kill it (no score), respawn later.
    const npc = this.npcById.get(victimId);
    if (npc) {
      if (npc.dead) return;
      npc.hp -= dmg;
      if (npc.hp <= 0) {
        npc.dead = true;
        npc.respawnAt = this.state.serverTick + (npc.kind === NPC_CAR ? 12 * TICK_RATE : 6 * TICK_RATE);
        this.state.npcs.delete(npc.id);
      }
      return;
    }
    const victim = this.state.players.get(victimId);
    if (!victim || !victim.alive) return;
    victim.health -= dmg;
    if (victim.health <= 0) {
      victim.health = 0;
      victim.alive = false;
      victim.deaths++;
      const killer = this.state.players.get(killerId);
      if (killer) killer.kills++;
      // Mirror into the non-filtered scoreboard.
      const vScore = this.state.scores.get(victimId);
      if (vScore) vScore.deaths++;
      const kScore = this.state.scores.get(killerId);
      if (kScore && killerId !== victimId) kScore.kills++;
      // Eject from vehicle on death.
      if (victim.vehicleId) {
        const v = this.state.vehicles.get(victim.vehicleId);
        if (v) v.driverId = '';
        victim.vehicleId = '';
      }
      const sim = this.sims.get(victimId);
      if (sim) sim.respawnAtTick = this.state.serverTick + RESPAWN_TICKS;
      this.pushKill(killer?.nickname ?? '?', victim.nickname);
    }
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
    sim.foot = { x: sp.x, z: sp.z, vx: 0, vz: 0, rotY: sp.rotationY };
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
    const world = { buildings: this.city.buildings };

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
            const next = stepCar(car, input, DT, world);
            this.cars.set(ps.vehicleId, next);
            sim.foot.x = next.x;
            sim.foot.z = next.z;
            sim.foot.rotY = next.rotY;
          }
        } else {
          sim.foot = stepFoot(sim.foot, input, DT, world);
        }
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
    for (const n of this.npcSims) {
      if (n.dead) {
        if (tickNo >= n.respawnAt) {
          reviveNpc(n, this.city);
          this.addNpcState(n);
        }
        continue;
      }
      stepNpc(n, DT, this.city, tickNo);
      const ns = this.state.npcs.get(n.id);
      if (ns) {
        ns.x = n.x;
        ns.z = n.z;
        ns.rotY = n.rotY;
      }
    }

    this.resolveCarCollisions();
    this.updatePickups(tickNo);
    this.updateInterest();
    this.state.serverTick++;
  }

  /** Server-side car-vs-car separation (player vehicles + NPC traffic). */
  private resolveCarCollisions() {
    const R = CAR.radius;
    const min = R * 2;
    interface C { x: number; z: number; set: (x: number, z: number) => void }
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
      });
    }
    for (const n of this.npcSims) {
      if (n.dead || n.kind !== NPC_CAR) continue;
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
        if (!ps.alive || ps.vehicleId) continue;
        if (Math.hypot(pk.x - ps.x, pk.z - ps.z) < PICKUP_RADIUS) {
          ps.weaponId = pk.weaponId;
          ps.ammo = weapon(pk.weaponId).magazine;
          const sim = this.sims.get(ps.id);
          if (sim) sim.reloadAtTick = 0;
          pk.active = false;
          this.pickupRespawn.set(id, tickNo + PICKUP_RESPAWN_TICKS);
          break;
        }
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
