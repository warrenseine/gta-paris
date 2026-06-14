import type { InputCommand, MoveWorld } from '@gta/shared';

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
export class Predictor<S extends XZR> {
  state: S;
  private history: HistoryEntry[] = [];
  errX = 0;
  errZ = 0;

  constructor(start: S, private step: StepFn<S>) {
    this.state = { ...start };
  }

  /** Re-seed sim state (e.g. on enter/exit transition). Clears prediction error. */
  reset(start: S) {
    this.state = { ...start };
    this.history.length = 0;
    this.errX = 0;
    this.errZ = 0;
  }

  predict(input: InputCommand, dt: number, world: MoveWorld) {
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

    this.errX = prevX - this.state.x;
    this.errZ = prevZ - this.state.z;
    if (Math.hypot(this.errX, this.errZ) > 8) {
      this.errX = 0;
      this.errZ = 0;
    }
  }

  smooth(frameDt: number) {
    const k = Math.exp(-12 * frameDt);
    this.errX *= k;
    this.errZ *= k;
  }

  get renderX(): number {
    return this.state.x + this.errX;
  }
  get renderZ(): number {
    return this.state.z + this.errZ;
  }
}
