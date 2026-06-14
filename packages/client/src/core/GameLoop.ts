import { DT } from '@gta/shared';

// Fixed-step accumulator at the sim rate, render at display refresh.
export class GameLoop {
  private last = performance.now();
  private acc = 0;
  private running = false;

  constructor(
    private step: (dt: number) => void,
    private render: (alpha: number, frameDt: number) => void,
  ) {}

  start() {
    this.running = true;
    this.last = performance.now();
    requestAnimationFrame(this.frame);
  }

  private frame = (now: number) => {
    if (!this.running) return;
    let frameDt = (now - this.last) / 1000;
    this.last = now;
    if (frameDt > 0.25) frameDt = 0.25; // clamp after tab-out
    this.acc += frameDt;
    while (this.acc >= DT) {
      this.step(DT);
      this.acc -= DT;
    }
    this.render(this.acc / DT, frameDt);
    requestAnimationFrame(this.frame);
  };
}
