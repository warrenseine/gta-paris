import * as THREE from 'three';
import { Interpolation } from '../net/Interpolation.js';
import { makePedMesh, makeCarMesh, makeCopMesh, makePoliceCarMesh, makeTankMesh, animateWalk } from './views.js';
import { bridgeY } from './bridgeLevel.js';
import { getLocalPos } from './localPos.js';
import { COLORS } from '../render/materials.js';

// Ambient NPC (ped or traffic car), interpolated like remote players.
export class NpcEntity {
  mesh: THREE.Group;
  kind: number;
  dead = false;
  interp = new Interpolation();

  constructor(scene: THREE.Scene, kind: number, colorId: number) {
    this.kind = kind;
    this.mesh =
      kind === 4
        ? makeTankMesh()
        : kind === 3
          ? makePoliceCarMesh()
          : kind === 2
            ? makeCopMesh()
            : kind === 1
              ? makeCarMesh(COLORS.car[colorId % COLORS.car.length])
              : makePedMesh(colorId);
    scene.add(this.mesh);
  }

  setDead(dead: boolean) {
    if (dead === this.dead) return;
    this.dead = dead;
    if (dead) {
      // Lie flat on the ground (a body).
      this.mesh.rotation.x = -Math.PI / 2;
      this.mesh.position.y = 0.3;
    } else {
      this.mesh.rotation.x = 0;
      this.mesh.position.y = 0;
    }
  }

  private lastNow = 0;

  update(now: number) {
    if (this.dead) return; // frozen corpse
    const s = this.interp.sample(now);
    if (!s) return;
    const dt = this.lastNow ? Math.min(0.1, (now - this.lastNow) / 1000) : 0;
    const speed = dt > 0 ? Math.hypot(s.x - this.mesh.position.x, s.z - this.mesh.position.z) / dt : 0;
    this.lastNow = now;
    this.mesh.position.set(s.x, bridgeY(s.x, s.z), s.z);
    this.mesh.rotation.y = s.rotY;
    animateWalk(this.mesh, speed, dt);
    // Tank turret tracks the local player.
    if (this.kind === 4) {
      const turret = this.mesh.userData.turret as THREE.Object3D | undefined;
      if (turret) {
        const lp = getLocalPos();
        turret.rotation.y = Math.atan2(lp.x - s.x, lp.z - s.z) - s.rotY;
      }
    }
  }

  dispose(scene: THREE.Scene) {
    scene.remove(this.mesh);
  }
}
