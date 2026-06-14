// Arcade kinematic car model (GTA1/top-down style). Same step on client + server.
// Tuned for fun, not realism. Rapier can replace the body later behind this API.

import type { InputCommand } from '../input.js';
import type { BuildingDef } from '../map/types.js';
import { clamp } from '../math.js';
import { resolveAgainstBuildings, clampToBounds } from './collision.js';

export interface CarState {
  x: number;
  z: number;
  rotY: number; // heading
  speed: number; // signed forward speed (m/s)
}

export const CAR = {
  radius: 1.6,
  maxSpeed: 42, // ~150 km/h
  reverseSpeed: 12,
  enginePower: 28, // m/s^2 accel
  brakePower: 50,
  drag: 0.6,
  rollingResist: 3,
  /** Steering rate (rad/s) at full lock, scaled by speed. */
  turnRate: 2.4,
  grip: 0.92,
};

export interface CarWorld {
  buildings: BuildingDef[];
}

export function stepCar(s: CarState, input: InputCommand, dt: number, world: CarWorld): CarState {
  let speed = s.speed;
  const throttle = input.throttle; // -1..1

  // Longitudinal forces.
  if (throttle > 0.01) {
    speed += CAR.enginePower * throttle * dt;
  } else if (throttle < -0.01) {
    if (speed > 0.1) speed -= CAR.brakePower * -throttle * dt; // braking
    else speed += CAR.enginePower * throttle * dt; // reverse
  }
  // Handbrake hard stop-ish.
  if (input.handbrake) speed *= Math.max(0, 1 - 4 * dt);
  // Resistance.
  speed -= speed * CAR.drag * dt;
  speed -= Math.sign(speed) * CAR.rollingResist * dt;
  speed = clamp(speed, -CAR.reverseSpeed, CAR.maxSpeed);
  if (Math.abs(speed) < 0.05) speed = 0;

  // Steering scales with speed (no turning when stopped), reverses in reverse.
  const speedFactor = clamp(Math.abs(speed) / 12, 0, 1);
  const steerSign = speed >= 0 ? 1 : -1;
  const rotY = s.rotY + input.steer * CAR.turnRate * speedFactor * steerSign * dt;

  // Integrate position along heading.
  let x = s.x + Math.sin(rotY) * speed * dt;
  let z = s.z + Math.cos(rotY) * speed * dt;

  // Collision: resolve circle, bleed speed on impact.
  const resolved = resolveAgainstBuildings({ x, z, r: CAR.radius }, world.buildings);
  if (resolved.x !== x || resolved.z !== z) {
    speed *= 0.4;
    x = resolved.x;
    z = resolved.z;
  }
  const bounded = clampToBounds(x, z, CAR.radius);
  x = bounded.x;
  z = bounded.z;

  return { x, z, rotY, speed };
}
