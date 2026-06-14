import { lerp, lerpAngle } from '@gta/shared';

interface Snap {
  t: number; // local receive time (ms)
  x: number;
  z: number;
  rotY: number;
}

// Buffers remote-entity snapshots and renders ~INTERP_DELAY ms in the past,
// interpolating between the two bracketing snapshots. Hides jitter/loss.
const INTERP_DELAY = 100; // ms

export class Interpolation {
  private buf: Snap[] = [];

  push(x: number, z: number, rotY: number, now: number) {
    this.buf.push({ t: now, x, z, rotY });
    if (this.buf.length > 30) this.buf.shift();
  }

  /** Sample interpolated transform at (now - delay). */
  sample(now: number): { x: number; z: number; rotY: number } | null {
    if (this.buf.length === 0) return null;
    const target = now - INTERP_DELAY;
    if (this.buf.length === 1 || target <= this.buf[0].t) {
      const s = this.buf[0];
      return { x: s.x, z: s.z, rotY: s.rotY };
    }
    const last = this.buf[this.buf.length - 1];
    if (target >= last.t) {
      // Slight extrapolation cap: just hold the latest.
      return { x: last.x, z: last.z, rotY: last.rotY };
    }
    for (let i = 0; i < this.buf.length - 1; i++) {
      const a = this.buf[i];
      const b = this.buf[i + 1];
      if (target >= a.t && target <= b.t) {
        const f = (target - a.t) / Math.max(1, b.t - a.t);
        return { x: lerp(a.x, b.x, f), z: lerp(a.z, b.z, f), rotY: lerpAngle(a.rotY, b.rotY, f) };
      }
    }
    return { x: last.x, z: last.z, rotY: last.rotY };
  }
}
