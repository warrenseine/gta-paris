import * as THREE from 'three';
import { Interpolation } from '../net/Interpolation.js';
import { makePedMesh, makeCarMesh, makeCopMesh, makePoliceCarMesh } from './views.js';
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
      kind === 3
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

  update(now: number) {
    if (this.dead) return; // frozen corpse
    const s = this.interp.sample(now);
    if (!s) return;
    this.mesh.position.set(s.x, 0, s.z);
    this.mesh.rotation.y = s.rotY;
  }

  dispose(scene: THREE.Scene) {
    scene.remove(this.mesh);
  }
}
