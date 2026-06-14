import * as THREE from 'three';
import { Interpolation } from '../net/Interpolation.js';
import { makeCarMesh, makePoliceCarMesh, makeTankMesh } from './views.js';
import { bridgeY } from './bridgeLevel.js';
import { COLORS } from '../render/materials.js';

// A networked car: interpolated unless locally driven (then Game drives the mesh).
export class VehicleEntity {
  mesh: THREE.Group;
  interp = new Interpolation();

  constructor(scene: THREE.Scene, colorId: number, kind = 0) {
    this.mesh =
      kind === 2 ? makeTankMesh() : kind === 1 ? makePoliceCarMesh() : makeCarMesh(COLORS.car[colorId % COLORS.car.length]);
    scene.add(this.mesh);
  }

  update(now: number) {
    const s = this.interp.sample(now);
    if (!s) return;
    this.mesh.position.set(s.x, bridgeY(s.x, s.z), s.z);
    this.mesh.rotation.y = s.rotY;
  }

  dispose(scene: THREE.Scene) {
    scene.remove(this.mesh);
  }
}
