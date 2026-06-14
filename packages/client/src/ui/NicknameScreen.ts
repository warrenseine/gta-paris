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

    const btn = document.createElement('button');
    btn.textContent = 'PLAY';
    btn.style.cssText =
      'padding:12px 40px;font-size:18px;font-weight:700;border:0;border-radius:8px;background:#ffcf4d;color:#1a1d22;cursor:pointer;';
    overlay.append(row, btn);
    document.body.appendChild(overlay);

    const go = () => {
      const name = (input.value.trim() || randomName()).slice(0, 16);
      overlay.remove();
      resolve(name);
    };
    btn.onclick = go;
    input.onkeydown = (e) => {
      if (e.key === 'Enter') go();
    };
    setTimeout(() => input.focus(), 0);
  });
}
