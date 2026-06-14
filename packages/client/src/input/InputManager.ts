import * as THREE from 'three';
import { emptyInput, type InputCommand } from '@gta/shared';

const DEADZONE = 0.18;

function applyDeadzone(v: number): number {
  if (Math.abs(v) < DEADZONE) return 0;
  return (v - Math.sign(v) * DEADZONE) / (1 - DEADZONE);
}

export type LastDevice = 'kbm' | 'gamepad';

// Produces a single device-independent InputCommand each tick.
// KB/mouse aim is derived by raycasting cursor -> ground so it matches the
// gamepad right-stick aim vector exactly (sim never branches on device).
export class InputManager {
  private keys = new Set<string>();
  /** One-shot key presses latched on keydown, consumed each sample. */
  private pressedOnce = new Set<string>();
  private mouseDown = false;
  private mouseNdc = new THREE.Vector2(0, 0);
  private seq = 0;
  lastDevice: LastDevice = 'kbm';

  private raycaster = new THREE.Raycaster();
  private groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private hitPoint = new THREE.Vector3();

  constructor(dom: HTMLElement) {
    window.addEventListener('keydown', (e) => {
      if (!e.repeat) this.pressedOnce.add(e.code);
      this.keys.add(e.code);
      this.lastDevice = 'kbm';
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    dom.addEventListener('mousemove', (e) => {
      this.mouseNdc.x = (e.clientX / window.innerWidth) * 2 - 1;
      this.mouseNdc.y = -(e.clientY / window.innerHeight) * 2 + 1;
      this.lastDevice = 'kbm';
    });
    dom.addEventListener('mousedown', (e) => {
      if (e.button === 0) this.mouseDown = true;
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouseDown = false;
    });
    dom.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  private pollGamepad(): Gamepad | null {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const p of pads) if (p && p.connected) return p;
    return null;
  }

  /**
   * Sample input for this tick.
   * camera + playerPos needed to convert mouse cursor into a world aim vector.
   */
  sample(camera: THREE.Camera, playerX: number, playerZ: number): InputCommand {
    const cmd = emptyInput(++this.seq);

    // --- Movement + buttons ---
    let mx = 0;
    let mz = 0;
    let fire = false;
    let aimX = 0;
    let aimZ = 0;
    let hasStickAim = false;
    let enterExit = false;
    let handbrake = false;
    let sprint = false;

    const pad = this.pollGamepad();
    if (pad) {
      const lx = applyDeadzone(pad.axes[0] ?? 0);
      const ly = applyDeadzone(pad.axes[1] ?? 0);
      const rx = applyDeadzone(pad.axes[2] ?? 0);
      const ry = applyDeadzone(pad.axes[3] ?? 0);
      if (lx || ly) {
        mx = lx;
        mz = ly; // stick up = ly<0 = up-screen = -Z world
        this.lastDevice = 'gamepad';
      }
      if (rx || ry) {
        aimX = rx;
        aimZ = ry; // up-screen = -Z
        hasStickAim = true;
        this.lastDevice = 'gamepad';
      }
      const rt = pad.buttons[7]?.value ?? 0;
      if (rt > 0.4 || pad.buttons[5]?.pressed) fire = true;
      if (pad.buttons[0]?.pressed) enterExit = true; // A
      if (pad.buttons[1]?.pressed) handbrake = true; // B
      if (pad.buttons[10]?.pressed) sprint = true; // L3
    }

    // Keyboard movement (additive; overrides if pressed).
    let kx = 0;
    let kz = 0;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) kz -= 1; // up-screen = -Z
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) kz += 1;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) kx -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) kx += 1;
    if (kx || kz) {
      mx = kx;
      mz = kz;
    }
    if (this.keys.has('ShiftLeft')) sprint = true;
    if (this.keys.has('Space')) handbrake = true;
    if (this.pressedOnce.has('KeyF')) enterExit = true; // one-shot, latched
    if (this.mouseDown) fire = true;

    // Normalize move to unit disc.
    const ml = Math.hypot(mx, mz);
    if (ml > 1) {
      mx /= ml;
      mz /= ml;
    }
    cmd.moveX = mx;
    cmd.moveZ = mz;
    cmd.sprint = sprint;
    cmd.handbrake = handbrake;
    cmd.enterExit = enterExit;
    cmd.fire = fire;

    // --- Aim ---
    if (hasStickAim) {
      const al = Math.hypot(aimX, aimZ) || 1;
      cmd.aimX = aimX / al;
      cmd.aimZ = aimZ / al;
    } else {
      // Mouse -> ground plane -> aim vector from player.
      this.raycaster.setFromCamera(this.mouseNdc, camera as THREE.PerspectiveCamera);
      if (this.raycaster.ray.intersectPlane(this.groundPlane, this.hitPoint)) {
        const dx = this.hitPoint.x - playerX;
        const dz = this.hitPoint.z - playerZ;
        const dl = Math.hypot(dx, dz) || 1;
        cmd.aimX = dx / dl;
        cmd.aimZ = dz / dl;
      }
    }

    // --- Look (camera lead): screen-space + player-INDEPENDENT, so walking
    // doesn't pan the view. Only moving the mouse / right stick re-orients. ---
    const clamp1 = (v: number) => Math.max(-1, Math.min(1, v));
    if (hasStickAim) {
      cmd.lookX = clamp1(aimX); // raw right-stick offset
      cmd.lookZ = clamp1(aimZ);
    } else {
      cmd.lookX = clamp1(this.mouseNdc.x);
      cmd.lookZ = clamp1(-this.mouseNdc.y); // up-screen = -Z
    }

    // Vehicle controls now use moveX/moveZ directly (drive toward stick dir).
    cmd.throttle = -cmd.moveZ;
    cmd.steer = cmd.moveX;

    // Consume one-shot presses.
    this.pressedOnce.clear();

    return cmd;
  }
}
