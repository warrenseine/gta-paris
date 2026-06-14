// Device-independent input command. Produced by the client InputManager,
// applied locally for prediction AND sent to the server. Single code path.

export interface InputCommand {
  seq: number;
  /** Movement intent, left stick / WASD, normalized to unit disc. */
  moveX: number;
  moveZ: number;
  /** Aim direction in world XZ plane (unit vector). Right stick or mouse->ground. */
  aimX: number;
  aimZ: number;
  /** View-look offset in screen space (cursor offset from centre / right stick), -1..1. Client-only (camera). */
  lookX: number;
  lookZ: number;
  fire: boolean;
  enterExit: boolean;
  handbrake: boolean;
  sprint: boolean;
  /** Throttle/steer for vehicles, derived from move on the client. */
  throttle: number; // -1..1
  steer: number; // -1..1
}

export function emptyInput(seq = 0): InputCommand {
  return {
    seq,
    moveX: 0,
    moveZ: 0,
    aimX: 0,
    aimZ: 1,
    lookX: 0,
    lookZ: 0,
    fire: false,
    enterExit: false,
    handbrake: false,
    sprint: false,
    throttle: 0,
    steer: 0,
  };
}
