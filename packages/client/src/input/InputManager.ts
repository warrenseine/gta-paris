import * as THREE from 'three';
import { emptyInput, type InputCommand } from '@gta/shared';
import { getSettings } from '../ui/settings.js';

const CLASSIC_TURN = 3.2; // rad/s heading rotation in classic (turn-to-steer) mode

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
  private chars = new Set<string>(); // by e.key (layout-aware letters: w/z, a/q)
  /** One-shot key presses latched on keydown, consumed each sample. */
  private pressedOnce = new Set<string>();
  private pressedOnceChar = new Set<string>();
  private heading = 0; // classic-mode facing (rad), 0 = up-screen (-Z)
  private mouseDown = false;
  private mouseNdc = new THREE.Vector2(0, 0);
  private seq = 0;
  lastDevice: LastDevice = 'kbm';
  /** Latched aim direction — kept when the right stick is released. */
  private lastAimX = 0;
  private lastAimZ = 1;
  private lastMouseMove = 0;

  private raycaster = new THREE.Raycaster();
  private groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private hitPoint = new THREE.Vector3();

  constructor(dom: HTMLElement) {
    window.addEventListener('keydown', (e) => {
      const c = e.key.toLowerCase();
      if (!e.repeat) {
        this.pressedOnce.add(e.code);
        this.pressedOnceChar.add(c);
      }
      this.keys.add(e.code);
      this.chars.add(c);
      this.lastDevice = 'kbm';
    });
    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
      this.chars.delete(e.key.toLowerCase());
    });
    dom.addEventListener('mousemove', (e) => {
      this.mouseNdc.x = (e.clientX / window.innerWidth) * 2 - 1;
      this.mouseNdc.y = -(e.clientY / window.innerHeight) * 2 + 1;
      this.lastDevice = 'kbm';
      this.lastMouseMove = performance.now();
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
    let mapToggle = false;
    let mapHold = false;
    let zoomOut = false;

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
      if (rt > 0.4 || pad.buttons[5]?.pressed) fire = true; // R2 / RB
      if (pad.buttons[3]?.pressed) enterExit = true; // Y (top)
      if (pad.buttons[1]?.pressed) handbrake = true; // B
      if (pad.buttons[0]?.pressed) sprint = true; // A (hold to sprint)
      // L2 held = show the full map (released = hide).
      if ((pad.buttons[6]?.value ?? 0) > 0.4 || (pad.buttons[6]?.pressed ?? false)) mapHold = true;
      if (pad.buttons[4]?.pressed) zoomOut = true; // L1 held = zoom out
    }

    // Keyboard movement (additive; overrides if pressed). Letters are read by
    // e.key so the AZERTY ZQSD diamond matches its keycaps.
    const azerty = getSettings().layout === 'azerty';
    const fwd = azerty ? 'z' : 'w';
    const left = azerty ? 'q' : 'a';
    let kx = 0;
    let kz = 0;
    if (this.chars.has(fwd) || this.keys.has('ArrowUp')) kz -= 1; // up-screen = -Z
    if (this.chars.has('s') || this.keys.has('ArrowDown')) kz += 1;
    if (this.chars.has(left) || this.keys.has('ArrowLeft')) kx -= 1;
    if (this.chars.has('d') || this.keys.has('ArrowRight')) kx += 1;
    if (kx || kz) {
      mx = kx;
      mz = kz;
    }
    if (this.keys.has('ShiftLeft')) sprint = true;
    if (this.keys.has('Space')) handbrake = true;
    if (this.pressedOnceChar.has('f') || this.pressedOnceChar.has('y')) enterExit = true; // one-shot
    if (this.pressedOnceChar.has('m')) mapToggle = true; // one-shot
    if (this.mouseDown) fire = true;

    // Classic (turn-to-steer) scheme: left/right rotate the heading, up/down =
    // forward/back along it. Convert the raw intent into a world move vector;
    // facing is the heading (set in the aim section below).
    const classic = getSettings().scheme === 'classic';
    if (classic) {
      const turn = mx; // +right
      const forward = -mz; // up = forward
      this.heading += turn * CLASSIC_TURN * (1 / 30);
      mx = Math.sin(this.heading) * forward;
      mz = -Math.cos(this.heading) * forward;
    }

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
    cmd.mapToggle = mapToggle;
    cmd.mapHold = mapHold;
    cmd.zoomOut = zoomOut || this.keys.has('KeyQ');

    // --- Aim --- (latched: keep the last orientation when no fresh aim input)
    if (hasStickAim) {
      const al = Math.hypot(aimX, aimZ) || 1;
      this.lastAimX = aimX / al;
      this.lastAimZ = aimZ / al;
    } else if (this.lastDevice === 'kbm') {
      // Mouse -> ground plane -> aim vector from player (live, follows cursor).
      this.raycaster.setFromCamera(this.mouseNdc, camera as THREE.PerspectiveCamera);
      if (this.raycaster.ray.intersectPlane(this.groundPlane, this.hitPoint)) {
        const dx = this.hitPoint.x - playerX;
        const dz = this.hitPoint.z - playerZ;
        const dl = Math.hypot(dx, dz) || 1;
        this.lastAimX = dx / dl;
        this.lastAimZ = dz / dl;
      }
    }
    // else: gamepad with stick released -> keep last aim (no snap-back).
    cmd.aimX = this.lastAimX;
    cmd.aimZ = this.lastAimZ;
    // Actively aiming = right stick held, or the mouse moved recently. When not,
    // the character faces its movement direction instead of the latched aim.
    cmd.aiming = hasStickAim || performance.now() - this.lastMouseMove < 700;

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

    // Classic scheme: you always face your heading (keyboard-driven), so aim +
    // camera lead follow it — no mouse aiming.
    if (classic) {
      const hx = Math.sin(this.heading);
      const hz = -Math.cos(this.heading);
      this.lastAimX = hx;
      this.lastAimZ = hz;
      cmd.aimX = hx;
      cmd.aimZ = hz;
      cmd.aiming = true;
      cmd.lookX = hx;
      cmd.lookZ = hz;
    }

    // Vehicle controls now use moveX/moveZ directly (drive toward stick dir).
    cmd.throttle = -cmd.moveZ;
    cmd.steer = cmd.moveX;

    // Consume one-shot presses.
    this.pressedOnce.clear();
    this.pressedOnceChar.clear();

    return cmd;
  }
}
