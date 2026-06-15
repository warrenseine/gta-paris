import { type ControlScheme, getSettings, type KbLayout, setSettings } from './settings.js';

// Random Paris/GTA-flavored nicknames. Combos kept <= 16 chars.
const PREFIX = [
  'Baguette', 'Croissant', 'Escargot', 'Beret', 'Fromage', 'Mime', 'Pigeon',
  'Crêpe', 'Café', 'Camembert', 'Pierre', 'Gigi', 'Vroom', 'Métro', 'Quasi',
  'Garlic', 'Madame', 'Petit', 'Zut',
];
const SUFFIX = [
  'Bandit', 'Boss', 'Menace', 'Mayhem', 'Voyou', 'Goon', 'Crook', 'Fear',
  'Force', 'Power', 'Napol', 'Racaille',
];
const GEMS = [
  'Sacré Bleu', 'Notre Damn', 'Mona Loca', 'Le Voyou', 'Zut Alors',
  'Escarghost', 'Croque Mort', 'Vroom Vroom', 'Pigeon Pro', 'Beretta Bob',
  'Au Revoir', 'Quasi Motor', 'Brie-zy', 'Tour de Crime', 'Pépé Le Pew',
];

const pick = <T>(a: T[]): T => a[Math.floor(Math.random() * a.length)];

// A two-option segmented toggle wired to a getter/setter.
function segmented<T extends string>(
  label: string,
  choices: [T, string][],
  get: () => T,
  set: (v: T) => void,
): HTMLElement {
  const wrap = document.createElement('div');
  wrap.style.cssText = 'display:flex;align-items:center;gap:10px;font-size:13px;';
  const cap = document.createElement('span');
  cap.textContent = label;
  cap.style.cssText = 'opacity:.7;width:84px;text-align:right;';
  wrap.appendChild(cap);
  const btns: HTMLButtonElement[] = [];
  const paint = () => {
    const cur = get();
    btns.forEach((b, i) => {
      const on = choices[i][0] === cur;
      b.style.background = on ? '#ffcf4d' : '#1c2027';
      b.style.color = on ? '#1a1d22' : '#fff';
    });
  };
  for (const [val, text] of choices) {
    const b = document.createElement('button');
    b.textContent = text;
    b.style.cssText = 'padding:7px 14px;border:1px solid #333;border-radius:7px;cursor:pointer;';
    b.onclick = () => {
      set(val);
      paint();
    };
    btns.push(b);
    wrap.appendChild(b);
  }
  paint();
  return wrap;
}

export function randomName(): string {
  const name = Math.random() < 0.4 ? pick(GEMS) : `${pick(PREFIX)} ${pick(SUFFIX)}`;
  return name.slice(0, 16);
}

// Pre-game nickname entry. Resolves with the chosen name.
export function nicknameScreen(): Promise<string> {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.style.cssText =
      'position:fixed;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;' +
      'background:#11141a;color:#fff;font-family:system-ui,sans-serif;gap:18px;z-index:10;';
    overlay.innerHTML = `
      <div style="font-size:42px;font-weight:800;letter-spacing:1px;">GTA <span style="color:#ffcf4d">PARIS</span></div>
      <div style="opacity:.7;font-size:14px;">Pick a name and join the default instance</div>
    `;

    const row = document.createElement('div');
    row.style.cssText = 'display:flex;gap:8px;align-items:center;';
    const input = document.createElement('input');
    input.placeholder = 'Nickname';
    input.maxLength = 16;
    input.value = randomName();
    input.style.cssText =
      'padding:12px 16px;font-size:18px;border-radius:8px;border:1px solid #333;background:#1c2027;color:#fff;width:260px;text-align:center;';
    const dice = document.createElement('button');
    dice.textContent = '🎲';
    dice.title = 'Random name';
    dice.style.cssText =
      'padding:10px 14px;font-size:20px;border:1px solid #333;border-radius:8px;background:#1c2027;cursor:pointer;';
    dice.onclick = () => {
      input.value = randomName();
      input.focus();
    };
    row.append(input, dice);

    const options = document.createElement('div');
    options.style.cssText = 'display:flex;flex-direction:column;gap:10px;margin-top:6px;';
    options.append(
      segmented<ControlScheme>(
        'Controls',
        [
          ['modern', 'Modern (strafe)'],
          ['classic', 'Classic (turn)'],
        ],
        () => getSettings().scheme,
        (v) => setSettings({ scheme: v }),
      ),
      segmented<KbLayout>(
        'Keyboard',
        [
          ['qwerty', 'QWERTY'],
          ['azerty', 'AZERTY'],
        ],
        () => getSettings().layout,
        (v) => setSettings({ layout: v }),
      ),
    );
    overlay.appendChild(options);

    const btn = document.createElement('button');
    btn.textContent = 'PLAY';
    btn.style.cssText =
      'padding:12px 40px;font-size:18px;font-weight:700;border:0;border-radius:8px;background:#ffcf4d;color:#1a1d22;cursor:pointer;';
    overlay.append(row, btn);
    document.body.appendChild(overlay);

    let raf = 0;
    const go = () => {
      cancelAnimationFrame(raf);
      const name = (input.value.trim() || randomName()).slice(0, 16);
      overlay.remove();
      resolve(name);
    };
    btn.onclick = go;
    input.onkeydown = (e) => {
      if (e.key === 'Enter') go();
    };
    setTimeout(() => input.focus(), 0);

    // Gamepad navigation (the in-game InputManager isn't running yet here).
    const focusables = () => Array.from(overlay.querySelectorAll('button')) as HTMLButtonElement[];
    let focus = focusables().length - 1; // start on PLAY
    let prev: boolean[] = [];
    let lastNav = 0;
    const paint = () => {
      focusables().forEach((b, i) => {
        b.style.outline = i === focus ? '3px solid #5fd0ff' : 'none';
      });
    };
    paint();
    const loop = () => {
      const pads = navigator.getGamepads ? navigator.getGamepads() : [];
      let pad: Gamepad | null = null;
      for (const p of pads) if (p?.connected) pad = p;
      if (pad) {
        const gp = pad;
        const f = focusables();
        const down = (i: number) => gp.buttons[i]?.pressed ?? false;
        const edge = (i: number) => down(i) && !prev[i];
        const ax = pad.axes[0] ?? 0;
        const ay = pad.axes[1] ?? 0;
        const now = performance.now();
        let d = 0;
        if (edge(13) || edge(15) || ay > 0.6 || ax > 0.6) d = 1;
        else if (edge(12) || edge(14) || ay < -0.6 || ax < -0.6) d = -1;
        if (d && now - lastNav > 180) {
          focus = (focus + d + f.length) % f.length;
          lastNav = now;
          paint();
        }
        if (edge(0)) {
          f[focus]?.click(); // A activates
          paint();
        }
        if (edge(9)) go(); // Start = play
        prev = gp.buttons.map((b) => b.pressed);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
  });
}
