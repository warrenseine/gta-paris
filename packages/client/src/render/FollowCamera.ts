import * as THREE from 'three';
import { CAMERA } from '@gta/shared';

// Tilted top-down follow rig. Fixed pitch (~55deg), follows a target on the
// ground plane with critically-damped smoothing and slight look-ahead.
export class FollowCamera {
  readonly camera: THREE.PerspectiveCamera;
  private current = new THREE.Vector3();

  constructor(aspect: number) {
    this.camera = new THREE.PerspectiveCamera(CAMERA.fov, aspect, 0.5, 2000);
  }

  resize(aspect: number) {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  /** target = ground position to look at; heading optional for look-ahead. */
  update(tx: number, tz: number, dt: number, lookAheadX = 0, lookAheadZ = 0) {
    const pitch = (CAMERA.pitchDeg * Math.PI) / 180;
    // Camera sits behind/above on the -Z..Y arc. Pitch from horizontal.
    const horiz = Math.cos(pitch) * CAMERA.distance;
    const vert = Math.sin(pitch) * CAMERA.distance;

    const focusX = tx + lookAheadX * 6;
    const focusZ = tz + lookAheadZ * 6;

    const desired = new THREE.Vector3(focusX, vert, focusZ + horiz);
    const k = 1 - Math.exp(-CAMERA.followLerp * dt);
    this.current.lerp(desired, k);
    if (this.current.lengthSq() === 0) this.current.copy(desired);

    this.camera.position.copy(this.current);
    this.camera.lookAt(focusX, 0, focusZ);
  }
}
