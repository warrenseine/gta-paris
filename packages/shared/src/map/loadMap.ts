import { buildParis } from './paris.js';
import type { CityData } from './types.js';
import rawCustom from './custom-map.json';

// A map exported from the in-game editor overrides the procedural Paris. Both
// the client and the authoritative server call loadMap(), so they stay in sync.
// To use an edited map: export it from the editor, save it over custom-map.json
// (set "enabled": true), and restart.
const custom = rawCustom as { enabled?: boolean; city?: CityData };

export function loadMap(): CityData {
  if (custom.enabled && custom.city) return custom.city;
  return buildParis();
}
