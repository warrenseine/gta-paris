import * as THREE from 'three';
import {
  buildParis,
  castRay,
  stepFoot,
  stepCar,
  weapon,
  PLAYER,
  MSG,
  type CityData,
  type FootState,
  type CarState,
  type HitTarget,
  type MoveWorld,
  type FireMessage,
  type FireEvent,
  type ExplosionEvent,
} from '@gta/shared';
import { Renderer } from '../render/Renderer.js';
import { FollowCamera } from '../render/FollowCamera.js';
import { CityRenderer } from '../render/CityRenderer.js';
import { Effects } from '../render/effects.js';
import { COLORS } from '../render/materials.js';
import { InputManager } from '../input/InputManager.js';
import { makePlayerMesh } from '../entities/views.js';
import { HUD } from '../ui/HUD.js';
import { Minimap } from '../ui/Minimap.js';
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
  private minimap: Minimap;
  private city: CityData;
  private world: MoveWorld;

  private footPred: Predictor<FootState>;
  private carPred: Predictor<CarState> | null = null;
  private drivingId: string | null = null;
  private entities: EntityManager;
  private playerMesh: THREE.Group;

  private audio = new AudioManager();
  private local: LocalPlayerFields | null = null;
  private lookX = 0;
  private lookZ = 0;
  private aimX = 0;
  private aimZ = 1;
  private fireCd = 0;
  private lockedPos: { x: number; z: number } | null = null;
  private visor: HTMLDivElement;
  private tmpVec = new THREE.Vector3();
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

    const self = (conn.room.state as { players?: { get(id: string): FootState | undefined } }).players?.get(
      conn.sessionId,
    );
    const start: FootState = self
      ? { x: self.x, z: self.z, vx: 0, vz: 0, rotY: self.rotY, stamina: PLAYER.maxStamina }
      : { x: 0, z: -20, vx: 0, vz: 0, rotY: 0, stamina: PLAYER.maxStamina };
    this.footPred = new Predictor<FootState>(start, stepFoot);

    this.playerMesh = makePlayerMesh(COLORS.player);
    this.renderer.scene.add(this.playerMesh);

    this.entities = new EntityManager(this.renderer.scene, conn, (p) => this.onLocal(p));
    this.minimap = new Minimap(this.city);

    // Drive-by auto-aim reticle.
    this.visor = document.createElement('div');
    this.visor.style.cssText =
      'position:fixed;width:42px;height:42px;border:2px solid #ff4d4d;border-radius:50%;' +
      'box-shadow:0 0 8px rgba(255,77,77,.7);pointer-events:none;display:none;z-index:4;' +
      'transform:translate(-50%,-50%);transition:left .05s linear,top .05s linear;';
    document.body.appendChild(this.visor);

    this.audio.resume();

    // Remote players' shots -> cosmetic tracers + faint audio.
    conn.room.onMessage(MSG.fireEvent, (fx: FireEvent) => {
      this.effects.tracer(fx.ox, fx.oz, fx.tx, fx.tz);
      if (fx.hit) this.effects.spark(fx.tx, fx.tz);
      const d = Math.hypot(fx.ox - this.selfX, fx.oz - this.selfZ);
      this.audio.shot(fx.weaponId, Math.max(0.05, 0.45 * (1 - d / 160)));
    });

    // Car destroyed -> explosion FX + boom (distance-scaled).
    conn.room.onMessage(MSG.explosion, (e: ExplosionEvent) => {
      this.effects.explosion(e.x, e.z);
      const d = Math.hypot(e.x - this.selfX, e.z - this.selfZ);
      this.audio.boom(Math.max(0.1, 0.7 * (1 - d / 220)));
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
      (alpha, frameDt) => this.render(alpha, frameDt),
    ).start();
  }

  /** Dev/test only: fire toward a world point, bypassing mouse aim. */
  devShootToward(wx: number, wz: number) {
    if (!this.alive || this.drivingId) return;
    const dx = wx - this.selfX;
    const dz = wz - this.selfZ;
    const l = Math.hypot(dx, dz) || 1;
    this.shoot(0, this.local?.weaponId ?? 1, dx / l, dz / l);
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
      this.footPred.reset({ x: p.x, z: p.z, vx: 0, vz: 0, rotY: p.rotY, stamina: p.stamina });
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
      this.footPred.reset({ x: p.x, z: p.z, vx: p.vx, vz: p.vz, rotY: p.rotY, stamina: p.stamina });
    }

    if (this.drivingId && this.carPred) {
      const v = this.entities.vehicleStates.get(this.drivingId);
      if (v) this.carPred.reconcile({ x: v.x, z: v.z, rotY: v.rotY, speed: v.speed }, p.seq, 1 / 30, this.world);
    } else {
      this.footPred.reconcile(
        { x: p.x, z: p.z, vx: p.vx, vz: p.vz, rotY: p.rotY, stamina: p.stamina },
        p.seq,
        1 / 30,
        this.world,
      );
    }
  }

  private step(dt: number) {
    const cmd = this.input.sample(this.cam.camera, this.selfX, this.selfZ);
    this.lookX = cmd.lookX;
    this.lookZ = cmd.lookZ;
    this.aimX = cmd.aimX;
    this.aimZ = cmd.aimZ;
    this.fireCd -= dt;

    if (cmd.mapToggle) this.minimap.toggle();
    this.minimap.setHeld(cmd.mapHold);

    if (!this.alive) {
      this.effects.update(dt);
      return; // frozen while dead; server respawns us
    }

    if (this.drivingId && this.carPred) this.carPred.predict(cmd, dt, this.world);
    else this.footPred.predict(cmd, dt, this.world);
    this.conn.sendInput(cmd);

    const wId = this.local?.weaponId ?? 1;
    const ammo = this.local?.ammo ?? 0;
    if (cmd.fire && this.fireCd <= 0 && ammo > 0) {
      // Auto-aim (foot + car): snap to the locked target, else fire along aim.
      const aim = this.aimDir();
      let ax = aim.x;
      let az = aim.z;
      const t = this.lockedPos;
      if (t) {
        const dx = t.x - this.selfX;
        const dz = t.z - this.selfZ;
        const dl = Math.hypot(dx, dz) || 1;
        ax = dx / dl;
        az = dz / dl;
      }
      this.shoot(cmd.seq, wId, ax, az);
    }

    this.entities.animatePickups(performance.now());
    this.effects.update(dt);
  }

  /** Targets shootable by the local player (visible remotes + NPCs). */
  private hitTargets(): HitTarget[] {
    const targets: HitTarget[] = [];
    for (const [id, rp] of this.entities.remotes) {
      if (rp.mesh.visible) targets.push({ id, x: rp.mesh.position.x, z: rp.mesh.position.z, r: 0.6 });
    }
    for (const [id, ne] of this.entities.npcs) {
      if (ne.mesh.visible && !ne.dead) targets.push({ id, x: ne.mesh.position.x, z: ne.mesh.position.z, r: 0.7 });
    }
    return targets;
  }

  private shoot(seq: number, weaponId: number, aimX: number, aimZ: number) {
    const w = weapon(weaponId);
    this.fireCd = 1 / w.fireRate;

    const ox = this.selfX + aimX * 0.8;
    const oz = this.selfZ + aimZ * 0.8;

    // Cosmetic local tracer toward the nearest target or full range.
    const hit = castRay(ox, oz, aimX, aimZ, w.range, this.hitTargets(), this.city.buildings);
    const tx = hit ? hit.x : ox + aimX * w.range;
    const tz = hit ? hit.z : oz + aimZ * w.range;
    this.effects.tracer(ox, oz, tx, tz);
    this.audio.shot(weaponId, 0.5);
    if (hit) {
      this.effects.spark(tx, tz);
      this.audio.hit();
    }

    // Authoritative request; server validates with lag compensation.
    const msg: FireMessage = {
      seq,
      ox,
      oz,
      dx: aimX,
      dz: aimZ,
      weaponId,
      clientTick: (this.conn.room.state as { serverTick?: number }).serverTick ?? 0,
    };
    this.conn.room.send(MSG.fire, msg);
  }

  private render(alpha: number, frameDt: number) {
    const dead = !this.alive;
    let camX: number;
    let camZ: number;
    let lookX = this.lookX;
    let lookZ = this.lookZ;

    if (this.drivingId && this.carPred) {
      this.carPred.smooth(frameDt);
      camX = this.carPred.renderXAt(alpha);
      camZ = this.carPred.renderZAt(alpha);
      const rot = this.carPred.renderRotAt(alpha);
      const ve = this.entities.vehicles.get(this.drivingId);
      if (ve) {
        ve.mesh.position.set(camX, 0, camZ);
        ve.mesh.rotation.y = rot;
      }
      this.playerMesh.visible = false;
      lookX = Math.sin(rot); // camera leads toward car heading
      lookZ = Math.cos(rot);
    } else {
      this.footPred.smooth(frameDt);
      camX = this.footPred.renderXAt(alpha);
      camZ = this.footPred.renderZAt(alpha);
      this.playerMesh.position.set(camX, 0, camZ);
      this.playerMesh.rotation.y = this.footPred.renderRotAt(alpha);
      this.playerMesh.visible = !dead;
    }

    if (dead) {
      this.lockedPos = null;
      this.visor.style.display = 'none';
    } else {
      this.updateAim();
    }

    this.entities.update(performance.now(), this.drivingId);
    this.cam.update(camX, camZ, frameDt, lookX, lookZ);
    this.cam.setOccluded(this.occluded(camX, camZ));
    this.updateMinimap();
    this.updateHud(dead);
    this.renderer.render(this.cam.camera);
  }

  /** The direction the player is aiming/looking — used to steer auto-aim. */
  private aimDir(): { x: number; z: number } {
    if (this.drivingId && this.carPred) {
      // In a car: right stick / mouse-look steers aim; otherwise aim ahead.
      if (Math.hypot(this.lookX, this.lookZ) > 0.35) {
        const l = Math.hypot(this.aimX, this.aimZ) || 1;
        return { x: this.aimX / l, z: this.aimZ / l };
      }
      return { x: Math.sin(this.carPred.state.rotY), z: Math.cos(this.carPred.state.rotY) };
    }
    return { x: this.aimX, z: this.aimZ };
  }

  /**
   * Auto-aim assist (foot + car): lock the nearest visible enemy that lies in
   * the aim direction (within a cone), so the right stick / cursor chooses the
   * target instead of always the closest. Places the visor reticle on it.
   */
  private updateAim() {
    const aim = this.aimDir();
    const RANGE = 75;
    const CONE = 0.5; // cos(60deg)
    let best: { x: number; z: number } | null = null;
    let bd = RANGE;
    for (const t of this.hitTargets()) {
      const dx = t.x - this.selfX;
      const dz = t.z - this.selfZ;
      const d = Math.hypot(dx, dz);
      if (d < 0.001 || d > RANGE) continue;
      if ((dx / d) * aim.x + (dz / d) * aim.z < CONE) continue; // outside the aim cone
      if (d < bd) {
        bd = d;
        best = { x: t.x, z: t.z };
      }
    }
    this.lockedPos = best;
    if (!best) {
      this.visor.style.display = 'none';
      return;
    }
    const v = this.tmpVec.set(best.x, 1.2, best.z).project(this.cam.camera);
    this.visor.style.display = 'block';
    this.visor.style.left = `${(v.x * 0.5 + 0.5) * window.innerWidth}px`;
    this.visor.style.top = `${(-v.y * 0.5 + 0.5) * window.innerHeight}px`;
  }

  /** True if a building taller than the camera ray occludes the player. */
  private occluded(px: number, pz: number): boolean {
    const cam = this.cam.camera.position;
    for (const s of [0.3, 0.5, 0.7]) {
      const sx = px + (cam.x - px) * s;
      const sz = pz + (cam.z - pz) * s;
      const rayY = 1.5 + (cam.y - 1.5) * s;
      for (const b of this.city.buildings) {
        if (b.height <= rayY) continue;
        if (Math.abs(sx - b.cx) < b.hw + 0.5 && Math.abs(sz - b.cz) < b.hd + 0.5) return true;
      }
    }
    return false;
  }

  private updateMinimap() {
    const remotes: { x: number; z: number }[] = [];
    for (const rp of this.entities.remotes.values()) {
      if (rp.mesh.visible) remotes.push({ x: rp.mesh.position.x, z: rp.mesh.position.z });
    }
    const npcs: { x: number; z: number; kind: number }[] = [];
    for (const ne of this.entities.npcs.values()) {
      npcs.push({ x: ne.mesh.position.x, z: ne.mesh.position.z, kind: ne.kind });
    }
    const vehicles: { x: number; z: number }[] = [];
    for (const ve of this.entities.vehicles.values()) {
      vehicles.push({ x: ve.mesh.position.x, z: ve.mesh.position.z });
    }
    const pickups: { x: number; z: number }[] = [];
    for (const m of this.entities.pickups.values()) {
      if (m.visible) pickups.push({ x: m.position.x, z: m.position.z });
    }
    const rotY = this.drivingId && this.carPred ? this.carPred.state.rotY : this.footPred.state.rotY;
    this.minimap.update({ px: this.selfX, pz: this.selfZ, rotY, remotes, npcs, vehicles, pickups });
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
      stamina: this.drivingId ? 100 : (this.footPred.state.stamina / PLAYER.maxStamina) * 100,
      weapon: this.drivingId ? 'Driving' : w.name,
      ammo: this.drivingId ? '' : Number.isFinite(w.magazine) ? l?.ammo ?? 0 : '∞',
      hint: this.drivingId
        ? `WASD drive · Y exit · Tab scores · ${online} online`
        : nearCar
          ? `▶ Press F / Y to enter car`
          : `WASD move · A sprint · aim · shoot · ${online} online`,
      kills: l?.kills ?? 0,
      deaths: l?.deaths ?? 0,
      dead,
      respawnIn,
      wanted: l?.wanted ?? false,
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
