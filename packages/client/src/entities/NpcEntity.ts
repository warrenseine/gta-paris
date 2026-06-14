import * as THREE from 'three';
import { Interpolation } from '../net/Interpolation.js';
import { makePedMesh, makeCarMesh } from './views.js';
import { COLORS } from '../render/materials.js';

// Ambient NPC (ped or traffic car), interpolated like remote players.
export class NpcEntity {
  mesh: THREE.Group;
  kind: number;
  interp = new Interpolation();

  constructor(scene: THREE.Scene, kind: number, colorId: number) {
    this.kind = kind;
    this.mesh = kind === 1 ? makeCarMesh(COLORS.car[colorId % COLORS.car.length]) : makePedMesh(colorId);
    scene.add(this.mesh);
  }

  update(now: number) {
    const s = this.interp.sample(now);
    if (!s) return;
    this.mesh.position.set(s.x, 0, s.z);
    this.mesh.rotation.y = s.rotY;
  }

  dispose(scene: THREE.Scene) {
    scene.remove(this.mesh);
  }
}
