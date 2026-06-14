import { lerp, lerpAngle, type InputCommand, type MoveWorld } from '@gta/shared';

interface XZR {
  x: number;
  z: number;
  rotY: number;
}

type StepFn<S> = (state: S, input: InputCommand, dt: number, world: MoveWorld) => S;

interface HistoryEntry {
  seq: number;
  input: InputCommand;
}

// Generic client-side prediction + server reconciliation. Works for any state
// with {x,z,rotY} advanced by a pure step function (on-foot or vehicle).
// Keeps the previous sim state so the render frame can interpolate between sim
// ticks (alpha) — smooth at high speed where one 30Hz step covers >1m.
export class Predictor<S extends XZR> {
  state: S;
  private prev: XZR;
  private history: HistoryEntry[] = [];
  errX = 0;
  errZ = 0;

  constructor(start: S, private step: StepFn<S>) {
    this.state = { ...start };
    this.prev = { x: start.x, z: start.z, rotY: start.rotY };
  }

  reset(start: S) {
    this.state = { ...start };
    this.prev = { x: start.x, z: start.z, rotY: start.rotY };
    this.history.length = 0;
    this.errX = 0;
    this.errZ = 0;
  }

  predict(input: InputCommand, dt: number, world: MoveWorld) {
    this.snapPrev();
    this.state = this.step(this.state, input, dt, world);
    this.history.push({ seq: input.seq, input });
    if (this.history.length > 200) this.history.shift();
  }

  reconcile(server: S, lastProcessedSeq: number, dt: number, world: MoveWorld) {
    const prevX = this.state.x + this.errX;
    const prevZ = this.state.z + this.errZ;

    this.history = this.history.filter((h) => h.seq > lastProcessedSeq);
    this.state = { ...server };
    for (const h of this.history) {
      this.state = this.step(this.state, h.input, dt, world);
    }
    // Anchor interpolation at the corrected state to avoid a double-jump.
    this.snapPrev();

    this.errX = prevX - this.state.x;
    this.errZ = prevZ - this.state.z;
    if (Math.hypot(this.errX, this.errZ) > 8) {
      this.errX = 0;
      this.errZ = 0;
    }
  }

  private snapPrev() {
    this.prev.x = this.state.x;
    this.prev.z = this.state.z;
    this.prev.rotY = this.state.rotY;
  }

  smooth(frameDt: number) {
    const k = Math.exp(-12 * frameDt);
    this.errX *= k;
    this.errZ *= k;
  }

  // Latest predicted position (for gameplay logic: pickups, shooting, camera target).
  get renderX(): number {
    return this.state.x + this.errX;
  }
  get renderZ(): number {
    return this.state.z + this.errZ;
  }

  // Interpolated between the previous and current sim tick (for smooth visuals).
  renderXAt(alpha: number): number {
    return lerp(this.prev.x, this.state.x, alpha) + this.errX;
  }
  renderZAt(alpha: number): number {
    return lerp(this.prev.z, this.state.z, alpha) + this.errZ;
  }
  renderRotAt(alpha: number): number {
    return lerpAngle(this.prev.rotY, this.state.rotY, alpha);
  }
}
