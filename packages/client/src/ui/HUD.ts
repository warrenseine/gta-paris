// DOM HUD: health, weapon/ammo, score, hint, killfeed, death overlay, scoreboard.
export interface HudState {
  health: number;
  stamina: number; // 0..100
  weapon: string;
  ammo: number | string;
  hint: string;
  kills: number;
  deaths: number;
  dead: boolean;
  respawnIn: number;
  killedBy: string; // who/what wasted us
  stars: number; // wanted level 0..5
}

export interface ScoreRow {
  nickname: string;
  kills: number;
  deaths: number;
  me: boolean;
}

export class HUD {
  private root: HTMLDivElement;
  private health: HTMLDivElement;
  private stamina: HTMLDivElement;
  private staminaFill: HTMLDivElement;
  private weapon: HTMLDivElement;
  private score: HTMLDivElement;
  private wanted: HTMLDivElement;
  private hint: HTMLDivElement;
  private killfeed: HTMLDivElement;
  private overlay: HTMLDivElement;
  private board: HTMLDivElement;

  constructor() {
    this.root = document.createElement('div');
    this.root.style.cssText =
      'position:fixed;inset:0;pointer-events:none;font-family:system-ui,sans-serif;color:#fff;text-shadow:0 1px 3px rgba(0,0,0,.7);';

    // Bottom-right stack: health + stamina above the weapon/ammo readout.
    this.health = this.panel('right:18px;bottom:60px;font-size:22px;font-weight:700;text-align:right;');
    this.stamina = this.panel('right:18px;bottom:50px;width:120px;height:5px;border-radius:3px;background:rgba(255,255,255,.2);');
    this.staminaFill = document.createElement('div');
    this.staminaFill.style.cssText = 'height:100%;width:100%;border-radius:3px;background:#5fd0ff;transition:width .1s;';
    this.stamina.appendChild(this.staminaFill);
    this.weapon = this.panel('right:18px;bottom:18px;font-size:20px;text-align:right;');
    this.score = this.panel('right:18px;top:14px;font-size:16px;text-align:right;opacity:.9;');
    this.wanted = this.panel(
      'top:12px;left:50%;transform:translateX(-50%);font-size:24px;font-weight:800;color:#ffd23b;' +
        'letter-spacing:3px;display:none;text-shadow:0 0 6px rgba(255,90,0,.8);',
    );
    this.hint = this.panel(
      'left:50%;transform:translateX(-50%);bottom:18px;font-size:14px;opacity:.85;text-align:center;',
    );
    this.killfeed = this.panel('right:18px;top:44px;font-size:14px;text-align:right;line-height:1.5;');
    this.overlay = this.panel(
      'inset:0;display:none;flex-direction:column;align-items:center;justify-content:center;' +
        'background:rgba(120,10,10,.35);font-size:54px;font-weight:800;letter-spacing:2px;',
    );
    this.board = this.panel(
      'left:50%;top:60px;transform:translateX(-50%);display:none;background:rgba(10,12,16,.85);' +
        'padding:16px 22px;border-radius:10px;font-size:15px;min-width:280px;',
    );
    document.body.appendChild(this.root);
  }

  private panel(css: string): HTMLDivElement {
    const d = document.createElement('div');
    d.style.cssText = 'position:absolute;' + css;
    this.root.appendChild(d);
    return d;
  }

  set(s: HudState) {
    this.health.textContent = `♥ ${Math.max(0, Math.round(s.health))}`;
    this.health.style.color = s.health < 30 ? '#ff5b5b' : '#fff';
    this.staminaFill.style.width = `${Math.max(0, Math.min(100, s.stamina))}%`;
    this.staminaFill.style.background = s.stamina < 20 ? '#ff8a3a' : '#5fd0ff';
    this.weapon.textContent = `${s.weapon}  ${s.ammo}`;
    this.score.textContent = `K ${s.kills}  /  D ${s.deaths}`;
    this.hint.textContent = s.hint;
    const stars = Math.max(0, Math.min(5, s.stars | 0));
    this.wanted.style.display = stars > 0 ? 'block' : 'none';
    if (stars > 0) this.wanted.textContent = '★'.repeat(stars) + '☆'.repeat(5 - stars);

    if (s.dead) {
      this.overlay.style.display = 'flex';
      const by = s.killedBy
        ? `<div style="font-size:22px;font-weight:600;margin-top:14px;opacity:.95">killed by ${esc(s.killedBy)}</div>`
        : '';
      this.overlay.innerHTML =
        `WASTED${by}<div style="font-size:18px;font-weight:500;margin-top:10px;opacity:.85">` +
        `respawn in ${Math.ceil(s.respawnIn)}s</div>`;
    } else {
      this.overlay.style.display = 'none';
    }
  }

  setKillfeed(lines: { killer: string; victim: string }[]) {
    this.killfeed.innerHTML = lines
      .map((l) => `<div><span style="color:#ffcf4d">${esc(l.killer)}</span> ▸ ${esc(l.victim)}</div>`)
      .join('');
  }

  setScoreboard(rows: ScoreRow[] | null) {
    if (!rows) {
      this.board.style.display = 'none';
      return;
    }
    const sorted = [...rows].sort((a, b) => b.kills - a.kills || a.deaths - b.deaths);
    this.board.style.display = 'block';
    this.board.innerHTML =
      `<div style="font-weight:700;margin-bottom:8px;opacity:.8">SCOREBOARD</div>` +
      sorted
        .map(
          (r) =>
            `<div style="display:flex;justify-content:space-between;gap:24px;${r.me ? 'color:#ffcf4d' : ''}">` +
            `<span>${esc(r.nickname)}</span><span>${r.kills} / ${r.deaths}</span></div>`,
        )
        .join('');
  }
}

function esc(s: string): string {
  return s.replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c] ?? c));
}
