// Weapon stat tables. Hitscan only for MVP.

export interface WeaponDef {
  id: number;
  name: string;
  damage: number;
  /** Rounds per second. */
  fireRate: number;
  /** Effective range in meters. */
  range: number;
  /** Cone half-angle in radians (0 = perfectly accurate). */
  spread: number;
  magazine: number;
  /** Pellets per shot (shotgun). */
  pellets: number;
}

export const WEAPONS: Record<number, WeaponDef> = {
  0: { id: 0, name: 'Fists', damage: 8, fireRate: 2, range: 2, spread: 0, magazine: Infinity, pellets: 1 },
  1: { id: 1, name: 'Pistol', damage: 18, fireRate: 4, range: 80, spread: 0.02, magazine: 12, pellets: 1 },
  2: { id: 2, name: 'SMG', damage: 11, fireRate: 12, range: 70, spread: 0.06, magazine: 30, pellets: 1 },
  3: { id: 3, name: 'Shotgun', damage: 9, fireRate: 1.2, range: 30, spread: 0.18, magazine: 8, pellets: 7 },
};

export function weapon(id: number): WeaponDef {
  return WEAPONS[id] ?? WEAPONS[0];
}
