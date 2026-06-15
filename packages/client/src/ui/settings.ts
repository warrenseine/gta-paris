// Persisted player options (control scheme + keyboard layout).
export type ControlScheme = 'modern' | 'classic';
export type KbLayout = 'qwerty' | 'azerty';

interface Settings {
  scheme: ControlScheme; // modern = strafe (twin-stick); classic = turn-to-steer (GTA London)
  layout: KbLayout;
}

const KEY = 'gtaparis.settings';
const DEFAULTS: Settings = { scheme: 'modern', layout: 'qwerty' };

let current: Settings = load();

function load(): Settings {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || '{}') };
  } catch {
    return { ...DEFAULTS };
  }
}

export function getSettings(): Settings {
  return current;
}

export function setSettings(patch: Partial<Settings>): void {
  current = { ...current, ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    /* ignore */
  }
}
