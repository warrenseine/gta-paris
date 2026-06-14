// Arcade kinematic car model (GTA1/top-down style). Same step on client + server.
// Tuned for fun, not realism. Rapier can replace the body later behind this API.

import type { InputCommand } from '../input.js';
import type { BuildingDef } from '../map/types.js';
import type { Vec2 } from '../math.js';
import { clamp } from '../math.js';
import { resolveAgainstBuildings, resolveAgainstTrees, clampToBounds } from './collision.js';
import { overWater, type WaterField } from './water.js';

export interface CarState {
  x: number;
  z: number;
  rotY: number; // heading
  speed: number; // signed forward speed (m/s)
  /** Speed at which the car struck a building this step (0 = no wall hit). Transient. */
  wallImpact?: number;
}

export const CAR = {
  radius: 2.0, // collision circle (smaller = less "sticky" against walls)
  maxSpeed: 40, // ~145 km/h
  enginePower: 30, // m/s^2 accel
  drag: 0.5,
  rollingResist: 4,
  /** How fast the car can swing its heading toward the input direction (rad/s). */
  turnRate: 3.4,
};

export interface CarWorld {
  buildings: BuildingDef[];
  trees?: Vec2[];
  boundary?: Vec2[];
  water?: WaterField; // the Seine — driving in kills the engine (car sinks)
  maxSpeed?: number; // per-vehicle cap (tanks are slower than cars)
}

const TREE_RADIUS = 1.1;

/**
 * Arcade, direction-based driving (like on-foot but with momentum): the input
 * vector (moveX/moveZ, world space) is the desired heading. The car turns toward
 * it — faster at low speed, lazier at high speed — and drives forward. Pushing
 * opposite the current heading brakes. Forward-only (no manual reverse).
 */
export function stepCar(s: CarState, input: InputCommand, dt: number, world: CarWorld): CarState {
  let speed = s.speed;
  let rotY = s.rotY;
  const il = Math.hypot(input.moveX, input.moveZ);
  const maxSpeed = world.maxSpeed ?? CAR.maxSpeed;

  if (il > 0.15) {
    const target = Math.atan2(input.moveX, input.moveZ);
    let diff = target - rotY;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;

    const speedFrac = clamp(speed / maxSpeed, 0, 1);
    const turn = CAR.turnRate * (1 - 0.45 * speedFrac) * dt;
    rotY += clamp(diff, -turn, turn);

    // Accelerate when aligned with intent; brake when pushing against heading.
    const align = Math.cos(diff); // 1 aligned .. -1 opposite
    speed += CAR.enginePower * il * align * (align < 0 ? 1.6 : 1) * dt;
  }

  // In the Seine: the engine drowns — the car bogs to a stop and can't drive out.
  if (world.water && overWater(s.x, s.z, world.water)) speed *= Math.max(0, 1 - 7 * dt);

  if (input.handbrake) speed *= Math.max(0, 1 - 5 * dt);
  speed -= speed * CAR.drag * dt;
  speed -= CAR.rollingResist * dt;
  speed = clamp(speed, 0, maxSpeed);
  if (speed < 0.05) speed = 0;

  let x = s.x + Math.sin(rotY) * speed * dt;
  let z = s.z + Math.cos(rotY) * speed * dt;

  let wallImpact = 0;
  const resolved = resolveAgainstBuildings({ x, z, r: CAR.radius }, world.buildings);
  if (resolved.x !== x || resolved.z !== z) {
    wallImpact = speed; // incoming speed into the wall (drives crash damage)
    speed *= 0.7; // glance off walls instead of slamming to a stop
    x = resolved.x;
    z = resolved.z;
  }
  if (world.trees) {
    const t = resolveAgainstTrees({ x, z, r: CAR.radius }, world.trees, TREE_RADIUS);
    if (t.x !== x || t.z !== z) {
      speed *= 0.85; // trees barely slow you
      x = t.x;
      z = t.z;
    }
  }
  const bounded = clampToBounds(x, z, CAR.radius, world.boundary);
  x = bounded.x;
  z = bounded.z;

  return { x, z, rotY, speed, wallImpact };
}
