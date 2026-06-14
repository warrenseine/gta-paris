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

  /** Gunshot, shaped per weapon. weaponId: 1 pistol, 2 SMG, 3 shotgun. */
  shot(weaponId = 1, vol = 0.5) {
    this.ensure();
    if (!this.ctx || !this.noise) return;
    const t = this.ctx.currentTime;

    // Per-weapon character.
    let dur = 0.13;
    let bp = 2200; // band-pass centre
    let q = 0.9;
    let punch = 70; // low-end thump frequency
    if (weaponId === 3) {
      dur = 0.4; bp = 900; q = 0.5; punch = 55; vol *= 1.25; // shotgun: deep boomy blast
    } else if (weaponId === 2) {
      dur = 0.08; bp = 3000; q = 1.4; punch = 90; // SMG: tight high crack
    }

    // Noise body through a band-pass.
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    const bpf = this.ctx.createBiquadFilter();
    bpf.type = 'bandpass';
    bpf.frequency.value = bp;
    bpf.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(bpf).connect(g).connect(this.ctx.destination);
    src.start(t);
    src.stop(t + dur + 0.05);

    // Low-end "thump" transient for body.
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(punch * 2.4, t);
    osc.frequency.exponentialRampToValueAtTime(punch, t + dur * 0.8);
    const og = this.ctx.createGain();
    og.gain.setValueAtTime(vol * 0.6, t);
    og.gain.exponentialRampToValueAtTime(0.001, t + dur * 0.9);
    osc.connect(og).connect(this.ctx.destination);
    osc.start(t);
    osc.stop(t + dur);
  }

  /** Explosion: low noise burst + descending tone, scaled by distance. */
  boom(vol = 0.6) {
    this.ensure();
    if (!this.ctx || !this.noise) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(900, t);
    lp.frequency.exponentialRampToValueAtTime(120, t + 0.5);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
    src.connect(lp).connect(g).connect(this.ctx.destination);
    src.start(t);
    src.stop(t + 0.6);
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
