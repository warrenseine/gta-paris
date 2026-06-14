import * as THREE from 'three';
import {
  buildParis,
  castRay,
  stepFoot,
  stepCar,
  weapon,
  emptyInput,
  MSG,
  type CityData,
  type FootState,
  type CarState,
  type HitTarget,
  type InputCommand,
  type MoveWorld,
  type FireMessage,
  type FireEvent,
} from '@gta/shared';
import { Renderer } from '../render/Renderer.js';
import { FollowCamera } from '../render/FollowCamera.js';
import { CityRenderer } from '../render/CityRenderer.js';
import { Effects } from '../render/effects.js';
import { COLORS } from '../render/materials.js';
import { InputManager } from '../input/InputManager.js';
import { makePlayerMesh } from '../entities/views.js';
import { HUD } from '../ui/HUD.js';
import { GameLoop } from './GameLoop.js';
import type { Connection } from '../net/Connection.js';
import { Predictor } from '../net/Predictor.js';
import { EntityManager, type LocalPlayerFields } from '../entities/EntityManager.js';
import { AudioManager } from '../audio/AudioManager.js';

export class Game {
  private renderer: Renderer;
  private cam: FollowCamera;
  private input: InputManager;
  private effects: Effects;
  private hud: HUD;
  private city: CityData;
  private world: MoveWorld;

  private footPred: Predictor<FootState>;
  private carPred: Predictor<CarState> | null = null;
  private drivingId: string | null = null;
  private entities: EntityManager;
  private playerMesh: THREE.Group;

  private audio = new AudioManager();
  private local: LocalPlayerFields | null = null;
  private lastAimX = 0;
  private lastAimZ = 1;
  private fireCd = 0;
  private deathTime = 0;
  private scoreboardOpen = false;

  constructor(container: HTMLElement, private conn: Connection) {
    this.city = buildParis();
    this.world = { buildings: this.city.buildings };
    this.renderer = new Renderer(container);
    this.cam = new FollowCamera(this.renderer.aspect);
    this.input = new InputManager(this.renderer.renderer.domElement);
    this.effects = new Effects(this.renderer.scene);
    this.hud = new HUD();
    this.renderer.scene.add(new CityRenderer(this.city).group);

    const self = (conn.room.state as any).players?.get(conn.sessionId);
    const start: FootState = self
      ? { x: self.x, z: self.z, vx: 0, vz: 0, rotY: self.rotY }
      : { x: 0, z: -20, vx: 0, vz: 0, rotY: 0 };
    this.footPred = new Predictor<FootState>(start, stepFoot);

    this.playerMesh = makePlayerMesh(COLORS.player);
    this.renderer.scene.add(this.playerMesh);

    this.entities = new EntityManager(this.renderer.scene, conn, (p) => this.onLocal(p));

    this.audio.resume();

    // Remote players' shots -> cosmetic tracers + faint audio.
    conn.room.onMessage(MSG.fireEvent, (fx: FireEvent) => {
      this.effects.tracer(fx.ox, fx.oz, fx.tx, fx.tz);
      if (fx.hit) this.effects.spark(fx.tx, fx.tz);
      const d = Math.hypot(fx.ox - this.selfX, fx.oz - this.selfZ);
      this.audio.shot(Math.max(0.05, 0.4 * (1 - d / 150)));
    });

    // Scoreboard on Tab.
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Tab') {
        e.preventDefault();
        this.scoreboardOpen = true;
      }
    });
    window.addEventListener('keyup', (e) => {
      if (e.code === 'Tab') this.scoreboardOpen = false;
    });

    window.addEventListener('resize', () => this.cam.resize(this.renderer.aspect));
    if (import.meta.env.DEV) (window as unknown as { __game: Game }).__game = this;

    new GameLoop(
      (dt) => this.step(dt),
      (_alpha, frameDt) => this.render(frameDt),
    ).start();
  }

  /** Dev/test only: fire toward a world point, bypassing mouse aim. */
  devShootToward(wx: number, wz: number) {
    if (!this.alive || this.drivingId) return;
    const dx = wx - this.selfX;
    const dz = wz - this.selfZ;
    const l = Math.hypot(dx, dz) || 1;
    const cmd = { ...emptyInput(0), aimX: dx / l, aimZ: dz / l, fire: true };
    this.shoot(cmd, this.local?.weaponId ?? 1);
  }

  private get selfX(): number {
    return this.drivingId && this.carPred ? this.carPred.renderX : this.footPred.renderX;
  }
  private get selfZ(): number {
    return this.drivingId && this.carPred ? this.carPred.renderZ : this.footPred.renderZ;
  }
  private get alive(): boolean {
    return this.local ? this.local.alive : true;
  }

  private onLocal(p: LocalPlayerFields) {
    const wasAlive = this.local?.alive ?? true;
    this.local = p;
    if (wasAlive && !p.alive) this.deathTime = performance.now();
    if (!wasAlive && p.alive) {
      // Respawned: snap predictor to server position.
      this.footPred.reset({ x: p.x, z: p.z, vx: 0, vz: 0, rotY: p.rotY });
      this.drivingId = null;
      this.carPred = null;
    }

    if (p.vehicleId && p.vehicleId !== this.drivingId) {
      const v = this.entities.vehicleStates.get(p.vehicleId);
      const seed: CarState = v
        ? { x: v.x, z: v.z, rotY: v.rotY, speed: v.speed }
        : { x: p.x, z: p.z, rotY: p.rotY, speed: 0 };
      this.carPred = new Predictor<CarState>(seed, stepCar);
      this.drivingId = p.vehicleId;
    }
    if (!p.vehicleId && this.drivingId) {
      this.drivingId = null;
      this.carPred = null;
      this.footPred.reset({ x: p.x, z: p.z, vx: p.vx, vz: p.vz, rotY: p.rotY });
    }

    if (this.drivingId && this.carPred) {
      const v = this.entities.vehicleStates.get(this.drivingId);
      if (v) this.carPred.reconcile({ x: v.x, z: v.z, rotY: v.rotY, speed: v.speed }, p.seq, 1 / 30, this.world);
    } else {
      this.footPred.reconcile({ x: p.x, z: p.z, vx: p.vx, vz: p.vz, rotY: p.rotY }, p.seq, 1 / 30, this.world);
    }
  }

  private step(dt: number) {
    const cmd = this.input.sample(this.cam.camera, this.selfX, this.selfZ);
    this.lastAimX = cmd.aimX;
    this.lastAimZ = cmd.aimZ;
    this.fireCd -= dt;

    if (!this.alive) {
      this.effects.update(dt);
      return; // frozen while dead; server respawns us
    }

    if (this.drivingId && this.carPred) this.carPred.predict(cmd, dt, this.world);
    else this.footPred.predict(cmd, dt, this.world);
    this.conn.sendInput(cmd);

    const wId = this.local?.weaponId ?? 1;
    const ammo = this.local?.ammo ?? 0;
    if (!this.drivingId && cmd.fire && this.fireCd <= 0 && ammo > 0) this.shoot(cmd, wId);

    this.entities.animatePickups(performance.now());
    this.effects.update(dt);
  }

  private shoot(cmd: InputCommand, weaponId: number) {
    const w = weapon(weaponId);
    this.fireCd = 1 / w.fireRate;

    const ox = this.selfX + cmd.aimX * 0.8;
    const oz = this.selfZ + cmd.aimZ * 0.8;

    // Cosmetic local tracer toward nearest player/NPC or full range.
    const targets: HitTarget[] = [];
    for (const [id, rp] of this.entities.remotes) {
      if (!rp.mesh.visible) continue;
      targets.push({ id, x: rp.mesh.position.x, z: rp.mesh.position.z, r: 0.6 });
    }
    for (const [id, ne] of this.entities.npcs) {
      if (!ne.mesh.visible) continue;
      targets.push({ id, x: ne.mesh.position.x, z: ne.mesh.position.z, r: 0.7 });
    }
    const hit = castRay(ox, oz, cmd.aimX, cmd.aimZ, w.range, targets, this.city.buildings);
    const tx = hit ? hit.x : ox + cmd.aimX * w.range;
    const tz = hit ? hit.z : oz + cmd.aimZ * w.range;
    this.effects.tracer(ox, oz, tx, tz);
    this.audio.shot(0.5);
    if (hit) {
      this.effects.spark(tx, tz);
      this.audio.hit();
    }

    // Authoritative request; server validates with lag compensation.
    const msg: FireMessage = {
      seq: cmd.seq,
      ox,
      oz,
      dx: cmd.aimX,
      dz: cmd.aimZ,
      weaponId,
      clientTick: (this.conn.room.state as any).serverTick ?? 0,
    };
    this.conn.room.send(MSG.fire, msg);
  }

  private render(frameDt: number) {
    const dead = !this.alive;

    if (this.drivingId && this.carPred) {
      this.carPred.smooth(frameDt);
      const ve = this.entities.vehicles.get(this.drivingId);
      if (ve) {
        ve.mesh.position.set(this.carPred.renderX, 0, this.carPred.renderZ);
        ve.mesh.rotation.y = this.carPred.state.rotY;
      }
      this.playerMesh.visible = false;
    } else {
      this.footPred.smooth(frameDt);
      this.playerMesh.position.set(this.footPred.renderX, 0, this.footPred.renderZ);
      this.playerMesh.rotation.y = this.footPred.state.rotY;
      this.playerMesh.visible = !dead;
    }

    this.entities.update(performance.now(), this.drivingId);
    // Camera leads toward where you aim/look, not where you move.
    this.cam.update(this.selfX, this.selfZ, frameDt, this.lastAimX, this.lastAimZ);

    this.updateHud(dead);
    this.renderer.render(this.cam.camera);
  }

  /** Distance to the nearest driver-less car (for the enter prompt). */
  private nearestEnterableCar(): number {
    let best = Infinity;
    for (const [id, v] of this.entities.vehicleStates) {
      if (v.driverId) continue;
      const ve = this.entities.vehicles.get(id);
      if (!ve) continue;
      best = Math.min(best, Math.hypot(ve.mesh.position.x - this.selfX, ve.mesh.position.z - this.selfZ));
    }
    return best;
  }

  private updateHud(dead: boolean) {
    const l = this.local;
    const w = weapon(l?.weaponId ?? 1);
    const online = this.entities.remotes.size + 1;
    const respawnIn = Math.max(0, 3 - (performance.now() - this.deathTime) / 1000);

    const nearCar = !this.drivingId && !dead && this.nearestEnterableCar() < 10;
    this.hud.set({
      health: l?.health ?? 100,
      weapon: this.drivingId ? 'Driving' : w.name,
      ammo: this.drivingId ? '' : Number.isFinite(w.magazine) ? l?.ammo ?? 0 : '∞',
      hint: this.drivingId
        ? `WASD drive · F / A exit · Tab scores · ${online} online`
        : nearCar
          ? `▶ Press F / A to enter car`
          : `WASD move · aim · shoot · Tab scores · ${online} online`,
      kills: l?.kills ?? 0,
      deaths: l?.deaths ?? 0,
      dead,
      respawnIn,
    });

    const state = this.conn.room.state as any;
    const kf: { killer: string; victim: string }[] = [];
    state.killfeed?.forEach((e: any) => {
      kf.push({ killer: e.killer, victim: e.victim });
    });
    this.hud.setKillfeed(kf);

    if (this.scoreboardOpen) {
      const rows: { nickname: string; kills: number; deaths: number; me: boolean }[] = [];
      state.scores?.forEach((s: any, id: string) => {
        rows.push({ nickname: s.nickname, kills: s.kills, deaths: s.deaths, me: id === this.conn.sessionId });
      });
      this.hud.setScoreboard(rows);
    } else {
      this.hud.setScoreboard(null);
    }
  }
}
