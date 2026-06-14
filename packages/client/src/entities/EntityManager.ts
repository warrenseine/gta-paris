import * as THREE from 'three';
import type { Connection } from '../net/Connection.js';
import { RemotePlayer } from './RemotePlayer.js';
import { VehicleEntity } from './VehicleEntity.js';
import { NpcEntity } from './NpcEntity.js';
import { makePickupMesh } from './views.js';

export interface LocalPlayerFields {
  x: number;
  z: number;
  vx: number;
  vz: number;
  rotY: number;
  vehicleId: string;
  seq: number;
  health: number;
  stamina: number;
  wanted: boolean;
  stars: number;
  alive: boolean;
  weaponId: number;
  ammo: number;
  kills: number;
  deaths: number;
}

export interface VehicleFields {
  x: number;
  z: number;
  rotY: number;
  speed: number;
  driverId: string;
  colorId: number;
  kind: number; // 0 = car, 1 = police, 2 = tank
}

// Bridges Colyseus room state -> Three.js scene for remote players and all
// vehicles. Local player is predicted (reported via onLocal); the locally
// driven vehicle is positioned by Game (skipped here via skipVehicleId).
export class EntityManager {
  remotes = new Map<string, RemotePlayer>();
  vehicles = new Map<string, VehicleEntity>();
  vehicleStates = new Map<string, VehicleFields>();
  npcs = new Map<string, NpcEntity>();
  pickups = new Map<string, THREE.Object3D>();

  constructor(
    private scene: THREE.Scene,
    conn: Connection,
    private onLocal: (p: LocalPlayerFields) => void,
  ) {
    const $ = conn.$;
    const state = conn.room.state as any;

    $(state).players.onAdd((player: any, id: string) => {
      if (id === conn.sessionId) {
        $(player).onChange(() => {
          this.onLocal({
            x: player.x,
            z: player.z,
            vx: player.vx,
            vz: player.vz,
            rotY: player.rotY,
            vehicleId: player.vehicleId,
            seq: player.lastProcessedInputSeq,
            health: player.health,
            stamina: player.stamina,
            wanted: player.wanted,
            stars: player.stars,
            alive: player.alive,
            weaponId: player.weaponId,
            ammo: player.ammo,
            kills: player.kills,
            deaths: player.deaths,
          });
        });
        return;
      }
      const rp = new RemotePlayer(this.scene, player.nickname || 'Anon');
      this.remotes.set(id, rp);
      $(player).onChange(() => {
        // Hide remote avatar while driving (car represents them) or dead.
        rp.mesh.visible = !player.vehicleId && player.alive;
        rp.interp.push(player.x, player.z, player.rotY, performance.now());
      });
    });

    $(state).players.onRemove((_p: any, id: string) => {
      this.remotes.get(id)?.dispose(this.scene);
      this.remotes.delete(id);
    });

    $(state).vehicles.onAdd((v: any, id: string) => {
      const ve = new VehicleEntity(this.scene, v.colorId, v.kind);
      this.vehicles.set(id, ve);
      ve.mesh.position.set(v.x, 0, v.z);
      ve.mesh.rotation.y = v.rotY;
      const sync = () => {
        this.vehicleStates.set(id, {
          x: v.x,
          z: v.z,
          rotY: v.rotY,
          speed: v.speed,
          driverId: v.driverId,
          colorId: v.colorId,
          kind: v.kind,
        });
        ve.interp.push(v.x, v.z, v.rotY, performance.now());
      };
      sync();
      $(v).onChange(sync);
    });

    $(state).vehicles.onRemove((_v: any, id: string) => {
      this.vehicles.get(id)?.dispose(this.scene);
      this.vehicles.delete(id);
      this.vehicleStates.delete(id);
    });

    $(state).npcs.onAdd((npc: any, id: string) => {
      const ne = new NpcEntity(this.scene, npc.kind, npc.colorId);
      this.npcs.set(id, ne);
      ne.mesh.position.set(npc.x, 0, npc.z);
      ne.mesh.rotation.y = npc.rotY;
      $(npc).onChange(() => {
        ne.setDead(npc.dead);
        if (!npc.dead) ne.interp.push(npc.x, npc.z, npc.rotY, performance.now());
      });
    });
    $(state).npcs.onRemove((_npc: any, id: string) => {
      this.npcs.get(id)?.dispose(this.scene);
      this.npcs.delete(id);
    });

    $(state).pickups.onAdd((pk: any, id: string) => {
      const mesh = makePickupMesh(pk.kind, pk.weaponId);
      mesh.position.set(pk.x, 0.8, pk.z);
      this.scene.add(mesh);
      this.pickups.set(id, mesh);
      $(pk).onChange(() => {
        mesh.visible = pk.active;
      });
    });
    $(state).pickups.onRemove((_pk: any, id: string) => {
      const m = this.pickups.get(id);
      if (m) this.scene.remove(m);
      this.pickups.delete(id);
    });
  }

  /** Spin/bob active pickups. */
  animatePickups(t: number) {
    for (const m of this.pickups.values()) {
      if (!m.visible) continue;
      m.rotation.y += 0.03;
      m.position.y = 0.8 + Math.sin(t * 0.004 + m.position.x) * 0.12;
    }
  }

  update(now: number, skipVehicleId: string | null) {
    for (const rp of this.remotes.values()) rp.update(now);
    for (const [id, ve] of this.vehicles) {
      if (id === skipVehicleId) continue; // Game positions the driven car.
      ve.update(now);
    }
    for (const ne of this.npcs.values()) ne.update(now);
  }
}
