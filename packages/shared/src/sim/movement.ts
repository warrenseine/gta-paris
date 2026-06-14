// Deterministic on-foot kinematic movement. Same function runs on client
// (prediction) and server (authority). No Rapier — simple capsule kinematics.

import type { InputCommand } from '../input.js';
import { PLAYER } from '../constants.js';
import type { BuildingDef } from '../map/types.js';
import { clamp } from '../math.js';
import { resolveAgainstBuildings, clampToBounds } from './collision.js';

export interface FootState {
  x: number;
  z: number;
  vx: number;
  vz: number;
  rotY: number; // facing (movement or aim)
  stamina: number; // 0..PLAYER.maxStamina; gates sprinting
}

export interface MoveWorld {
  buildings: BuildingDef[];
  trees?: { x: number; z: number }[]; // used by vehicles only
  boundary?: { x: number; z: number }[]; // Paris outline (Périphérique)
}

/** Advance an on-foot player one fixed step. Pure: returns a new state. */
export function stepFoot(s: FootState, input: InputCommand, dt: number, world: MoveWorld): FootState {
  const mlen = Math.hypot(input.moveX, input.moveZ);
  // Sprint is gated by stamina: needs a minimum to start, drains while used,
  // regenerates otherwise. Deterministic so client + server agree.
  let stamina = s.stamina ?? PLAYER.maxStamina;
  const sprinting = input.sprint && mlen > 1e-3 && stamina > PLAYER.staminaSprintMin;
  if (sprinting) stamina = Math.max(0, stamina - PLAYER.staminaDrain * dt);
  else stamina = Math.min(PLAYER.maxStamina, stamina + PLAYER.staminaRegen * dt);
  const target = sprinting ? PLAYER.sprintSpeed : PLAYER.walkSpeed;
  // Desired velocity from move intent.
  let dvx = 0;
  let dvz = 0;
  if (mlen > 1e-3) {
    dvx = (input.moveX / mlen) * target;
    dvz = (input.moveZ / mlen) * target;
  }
  // Accelerate toward desired velocity.
  const ax = clamp(dvx - s.vx, -PLAYER.accel * dt, PLAYER.accel * dt);
  const az = clamp(dvz - s.vz, -PLAYER.accel * dt, PLAYER.accel * dt);
  let vx = s.vx + ax;
  let vz = s.vz + az;
  // Damping when no input.
  if (mlen <= 1e-3) {
    const damp = Math.max(0, 1 - 12 * dt);
    vx *= damp;
    vz *= damp;
  }
  let x = s.x + vx * dt;
  let z = s.z + vz * dt;

  // Collision resolve.
  const resolved = resolveAgainstBuildings({ x, z, r: PLAYER.radius }, world.buildings);
  // If pushed back, kill velocity into the wall.
  if (resolved.x !== x || resolved.z !== z) {
    vx = (resolved.x - s.x) / dt;
    vz = (resolved.z - s.z) / dt;
  }
  const bounded = clampToBounds(resolved.x, resolved.z, PLAYER.radius, world.boundary);
  x = bounded.x;
  z = bounded.z;

  // Facing: while actively aiming, face the aim; otherwise face movement.
  let rotY = s.rotY;
  if (input.aiming && (Math.abs(input.aimX) > 1e-3 || Math.abs(input.aimZ) > 1e-3)) {
    rotY = Math.atan2(input.aimX, input.aimZ);
  } else if (mlen > 1e-3) {
    rotY = Math.atan2(vx, vz);
  }

  return { x, z, vx, vz, rotY, stamina };
}
