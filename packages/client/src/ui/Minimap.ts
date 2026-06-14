import type { CityData, LandmarkKey } from '@gta/shared';

export interface Blip {
  x: number;
  z: number;
}
export interface MinimapView {
  px: number;
  pz: number;
  rotY: number;
  remotes: Blip[];
  npcs: { x: number; z: number; kind: number }[];
  vehicles: Blip[];
  pickups: Blip[];
}

const BASE_RES = 1024; // offscreen base canvas resolution
const VIEW = 512; // live canvas internal resolution
const SMALL_RADIUS = 200; // meters shown around player in corner mode

const LANDMARK_LABEL: Record<LandmarkKey, string> = {
  eiffel: 'Eiffel',
  arc: 'Arc',
  arcdetriomphe: 'Arc de Triomphe',
  louvre: 'Louvre',
  notredame: 'Notre-Dame',
  sacrecoeur: 'Sacré-Cœur',
  concorde: 'Concorde',
  opera: 'Opéra',
  pantheon: 'Panthéon',
  invalides: 'Invalides',
  madeleine: 'Madeleine',
  grandpalais: 'Grand Palais',
  montparnasse: 'Montparnasse',
  parcdesprinces: 'Parc des Princes',
};

// Semi-transparent live minimap. Corner mode follows the player zoomed in;
// toggled mode is near-fullscreen, fully zoomed out to show all of Paris.
export class Minimap {
  private base: HTMLCanvasElement;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private wrap: HTMLDivElement;
  private expanded = false;
  private toggled = false; // M key
  private held = false; // L2 (hold)
  private scaleBase: number;
  private city: CityData;

  constructor(city: CityData) {
    this.city = city;
    this.scaleBase = BASE_RES / (city.bounds.maxX - city.bounds.minX);
    this.base = this.renderBase();

    this.canvas = document.createElement('canvas');
    this.canvas.width = VIEW;
    this.canvas.height = VIEW;
    this.ctx = this.canvas.getContext('2d')!;

    this.wrap = document.createElement('div');
    this.wrap.style.cssText =
      'position:fixed;top:14px;left:14px;z-index:5;border:2px solid rgba(255,255,255,.25);' +
      'border-radius:8px;overflow:hidden;opacity:.82;transition:opacity .15s;';
    this.canvas.style.cssText = 'display:block;width:210px;height:210px;image-rendering:auto;';
    this.wrap.appendChild(this.canvas);
    document.body.appendChild(this.wrap);
  }

  /** M key: flip the sticky full-map state. */
  toggle() {
    this.toggled = !this.toggled;
    this.apply();
  }

  /** L2: show the full map only while held. */
  setHeld(held: boolean) {
    if (held === this.held) return;
    this.held = held;
    this.apply();
  }

  private apply() {
    const expanded = this.toggled || this.held;
    if (expanded === this.expanded) return;
    this.expanded = expanded;
    if (expanded) {
      const s = Math.min(window.innerWidth, window.innerHeight) * 0.82;
      this.wrap.style.top = '50%';
      this.wrap.style.left = '50%';
      this.wrap.style.transform = 'translate(-50%,-50%)';
      this.wrap.style.opacity = '0.94';
      this.canvas.style.width = `${s}px`;
      this.canvas.style.height = `${s}px`;
    } else {
      this.wrap.style.top = '14px';
      this.wrap.style.left = '14px';
      this.wrap.style.transform = 'none';
      this.wrap.style.opacity = '0.82';
      this.canvas.style.width = '210px';
      this.canvas.style.height = '210px';
    }
  }

  /** Pre-draw the static city to an offscreen canvas (once). */
  private renderBase(): HTMLCanvasElement {
    const c = document.createElement('canvas');
    c.width = BASE_RES;
    c.height = BASE_RES;
    const ctx = c.getContext('2d')!;
    const s = this.scaleBase;
    const { minX, minZ } = this.city.bounds;
    const wx = (x: number) => (x - minX) * s;
    const wz = (z: number) => (z - minZ) * s;

    ctx.fillStyle = '#2b303a';
    ctx.fillRect(0, 0, BASE_RES, BASE_RES);

    // Buildings.
    ctx.fillStyle = '#525a66';
    for (const b of this.city.buildings) {
      const w = b.hw * 2 * s;
      const d = b.hd * 2 * s;
      ctx.fillRect(wx(b.cx) - w / 2, wz(b.cz) - d / 2, Math.max(1, w), Math.max(1, d));
    }

    // Boulevards.
    ctx.strokeStyle = '#1c2027';
    ctx.lineCap = 'round';
    for (const r of this.city.roads) {
      ctx.lineWidth = Math.max(2, r.width * s);
      ctx.beginPath();
      r.points.forEach((p, i) => {
        if (i) ctx.lineTo(wx(p.x), wz(p.z));
        else ctx.moveTo(wx(p.x), wz(p.z));
      });
      ctx.stroke();
    }

    // Seine.
    ctx.strokeStyle = '#3f7ea0';
    ctx.lineWidth = Math.max(3, this.city.river.width * s);
    ctx.beginPath();
    this.city.river.points.forEach((p, i) => {
      if (i) ctx.lineTo(wx(p.x), wz(p.z));
      else ctx.moveTo(wx(p.x), wz(p.z));
    });
    ctx.stroke();

    // Landmark markers + labels.
    ctx.textAlign = 'center';
    ctx.font = '600 18px system-ui';
    for (const l of this.city.landmarks) {
      const x = wx(l.position.x);
      const z = wz(l.position.z);
      ctx.fillStyle = '#ffcf4d';
      ctx.beginPath();
      ctx.arc(x, z, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.strokeStyle = 'rgba(0,0,0,.7)';
      ctx.lineWidth = 3;
      const label = LANDMARK_LABEL[l.key];
      ctx.strokeText(label, x, z - 12);
      ctx.fillText(label, x, z - 12);
    }
    return c;
  }

  update(v: MinimapView) {
    const ctx = this.ctx;
    const radius = this.expanded ? (this.city.bounds.maxX - this.city.bounds.minX) / 2 : SMALL_RADIUS;
    const cx = this.expanded ? (this.city.bounds.minX + this.city.bounds.maxX) / 2 : v.px;
    const cz = this.expanded ? (this.city.bounds.minZ + this.city.bounds.maxZ) / 2 : v.pz;
    const span = radius * 2;
    const s = this.scaleBase;

    ctx.fillStyle = '#23272f';
    ctx.fillRect(0, 0, VIEW, VIEW);
    // Blit the visible slice of the prerendered base.
    const sx = (cx - radius - this.city.bounds.minX) * s;
    const sy = (cz - radius - this.city.bounds.minZ) * s;
    const ss = span * s;
    ctx.drawImage(this.base, sx, sy, ss, ss, 0, 0, VIEW, VIEW);

    const toX = (x: number) => ((x - (cx - radius)) / span) * VIEW;
    const toZ = (z: number) => ((z - (cz - radius)) / span) * VIEW;
    const dot = (x: number, z: number, color: string, r: number) => {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(toX(x), toZ(z), r, 0, Math.PI * 2);
      ctx.fill();
    };

    for (const p of v.pickups) dot(p.x, p.z, '#39d98a', 3);
    for (const n of v.npcs) dot(n.x, n.z, n.kind === 1 ? '#c9a14b' : '#9aa3ad', n.kind === 1 ? 3 : 2);
    for (const c of v.vehicles) dot(c.x, c.z, '#d6d6d6', 3.5);
    for (const r of v.remotes) dot(r.x, r.z, '#5fa8ff', 4);

    // Player as a facing triangle. World facing (sin rotY, cos rotY) maps to a
    // screen rotation of (PI - rotY) given +Z points down on the map.
    ctx.save();
    ctx.translate(toX(v.px), toZ(v.pz));
    ctx.rotate(Math.PI - v.rotY);
    ctx.fillStyle = '#ffcf4d';
    ctx.strokeStyle = 'rgba(0,0,0,.6)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, -7);
    ctx.lineTo(5, 6);
    ctx.lineTo(-5, 6);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
}
