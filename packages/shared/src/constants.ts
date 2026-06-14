// Core simulation + world constants shared by client and server.

/** Authoritative simulation tick rate (Hz). */
export const TICK_RATE = 30;
/** Fixed timestep in seconds. */
export const DT = 1 / TICK_RATE;
/** Server -> client snapshot send rate (Hz). Every other tick. */
export const SNAPSHOT_RATE = 15;

/** Playfield bounds in meters (compact stylized Paris ~1.2km square, origin = Concorde). */
export const MAP_BOUNDS = {
  minX: -600,
  maxX: 600,
  minZ: -600,
  maxZ: 600,
};

/** On-foot movement. */
export const PLAYER = {
  radius: 0.5,
  height: 1.8,
  walkSpeed: 6, // m/s
  sprintSpeed: 10,
  accel: 60, // m/s^2 (snappy)
  maxHealth: 100,
};

/** Camera rig. High + steep so the city reads top-down and buildings don't tower. */
export const CAMERA = {
  pitchDeg: 62, // tilt from horizontal
  distance: 95, // meters from target
  fov: 45,
  followLerp: 8, // critically-damped follow factor
};

/** Interest management. */
export const INTEREST_RADIUS = 150; // meters
export const GRID_CELL = 50; // meters

/** Lag compensation rewind cap (ms). */
export const MAX_REWIND_MS = 250;
