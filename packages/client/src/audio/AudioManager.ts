// Minimal synthesized SFX via WebAudio — no asset files. Started on the PLAY
// gesture so the AudioContext is allowed to run.
export class AudioManager {
  private ctx: AudioContext | null = null;
  private noise: AudioBuffer | null = null;

  private ensure() {
    if (this.ctx) return;
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    this.ctx = new Ctor();
    // Pre-bake a short white-noise buffer for gunshots.
    const len = Math.floor(this.ctx.sampleRate * 0.2);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    this.noise = buf;
  }

  resume() {
    this.ensure();
    this.ctx?.resume();
  }

  /** Gunshot: noise burst with a fast decay. vol scales for distance/remote. */
  shot(vol = 0.5) {
    this.ensure();
    if (!this.ctx || !this.noise) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 1800;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
    src.connect(lp).connect(g).connect(this.ctx.destination);
    src.start(t);
    src.stop(t + 0.2);
  }

  /** Hit confirmation tick. */
  hit() {
    this.ensure();
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    o.type = 'square';
    o.frequency.setValueAtTime(880, t);
    o.frequency.exponentialRampToValueAtTime(220, t + 0.08);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.25, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
    o.connect(g).connect(this.ctx.destination);
    o.start(t);
    o.stop(t + 0.1);
  }
}
