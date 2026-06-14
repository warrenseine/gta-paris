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
  private occBoost = 0; // eased 0..1 — rises when the player is occluded
  private occTarget = 0;
  private zoom = 0; // eased 0..1 — L1 zoom-out
  private zoomTarget = 0;
  private boundX = Infinity; // focus clamp half-extents (keeps the void off-screen)
  private boundZ = Infinity;

  constructor(aspect: number) {
    this.camera = new THREE.PerspectiveCamera(CAMERA.fov, aspect, 0.5, 2000);
  }

  /** Limit how far the focus can drift so we never frame much beyond the Périph. */
  setBounds(hx: number, hz: number) {
    this.boundX = hx;
    this.boundZ = hz;
  }

  resize(aspect: number) {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  /** When occluded by a building, ramp the camera toward top-down + further out. */
  setOccluded(occluded: boolean) {
    this.occTarget = occluded ? 1 : 0;
  }

  /** L1: pull the camera way out for a tactical view. */
  setZoomedOut(zoomed: boolean) {
    this.zoomTarget = zoomed ? 1 : 0;
  }

  /** target = player ground position; aim = unit view-orientation vector. */
  update(tx: number, tz: number, dt: number, aimX = 0, aimZ = 0) {
    this.occBoost += (this.occTarget - this.occBoost) * (1 - Math.exp(-5 * dt));
    this.zoom += (this.zoomTarget - this.zoom) * (1 - Math.exp(-6 * dt));
    const pitch = ((CAMERA.pitchDeg + this.occBoost * 27) * Math.PI) / 180; // toward ~89deg (near top-down)
    const distance = (CAMERA.distance + this.occBoost * 22) * (1 + this.zoom * 4); // up to ~5x out
    const horiz = Math.cos(pitch) * distance;
    const vert = Math.sin(pitch) * distance;

    // Ease the aim lead slowly so only deliberate re-orientation pans the view.
    const ak = 1 - Math.exp(-AIM_EASE * dt);
    this.leadX += (aimX * AIM_LEAD - this.leadX) * ak;
    this.leadZ += (aimZ * AIM_LEAD - this.leadZ) * ak;

    // Smooth the focus point toward the player too (no instantaneous snapping).
    // Clamp it inside an ellipse so the camera never frames the empty suburbs
    // beyond the Périphérique (the player can still walk to the very edge).
    let fx = tx + this.leadX;
    let fz = tz + this.leadZ;
    if (Number.isFinite(this.boundX)) {
      const e = (fx / this.boundX) ** 2 + (fz / this.boundZ) ** 2;
      if (e > 1) {
        const s = 1 / Math.sqrt(e);
        fx *= s;
        fz *= s;
      }
    }
    const desiredFocus = new THREE.Vector3(fx, 0, fz);
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
