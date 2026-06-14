import * as THREE from 'three';
import { CAMERA } from '@gta/shared';

// Tilted top-down follow rig. Keeps the player centred; the view only drifts
// toward where you're aiming (mouse / right stick), heavily smoothed. No
// velocity look-ahead, so changing movement direction doesn't jerk the camera.
const AIM_LEAD = 7; // meters the view leads toward the aim direction
const AIM_EASE = 2.5; // how slowly the aim lead follows (lower = smoother)

export class FollowCamera {
  readonly camera: THREE.PerspectiveCamera;
  private current = new THREE.Vector3();
  private focus = new THREE.Vector3();
  private leadX = 0;
  private leadZ = 0;
  private seeded = false;

  constructor(aspect: number) {
    this.camera = new THREE.PerspectiveCamera(CAMERA.fov, aspect, 0.5, 2000);
  }

  resize(aspect: number) {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  /** target = player ground position; aim = unit view-orientation vector. */
  update(tx: number, tz: number, dt: number, aimX = 0, aimZ = 0) {
    const pitch = (CAMERA.pitchDeg * Math.PI) / 180;
    const horiz = Math.cos(pitch) * CAMERA.distance;
    const vert = Math.sin(pitch) * CAMERA.distance;

    // Ease the aim lead slowly so only deliberate re-orientation pans the view.
    const ak = 1 - Math.exp(-AIM_EASE * dt);
    this.leadX += (aimX * AIM_LEAD - this.leadX) * ak;
    this.leadZ += (aimZ * AIM_LEAD - this.leadZ) * ak;

    // Smooth the focus point toward the player too (no instantaneous snapping).
    const desiredFocus = new THREE.Vector3(tx + this.leadX, 0, tz + this.leadZ);
    if (!this.seeded) {
      this.focus.copy(desiredFocus);
      this.current.set(desiredFocus.x, vert, desiredFocus.z + horiz);
      this.seeded = true;
    }
    const fk = 1 - Math.exp(-CAMERA.followLerp * dt);
    this.focus.lerp(desiredFocus, fk);

    const desired = new THREE.Vector3(this.focus.x, vert, this.focus.z + horiz);
    this.current.lerp(desired, fk);

    this.camera.position.copy(this.current);
    this.camera.lookAt(this.focus.x, 0, this.focus.z);
  }
}
