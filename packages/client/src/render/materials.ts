import * as THREE from 'three';

// Flat-shaded, untextured palette. Cached so we reuse material instances.
const cache = new Map<number, THREE.MeshLambertMaterial>();

export function flat(color: number): THREE.MeshLambertMaterial {
  let m = cache.get(color);
  if (!m) {
    m = new THREE.MeshLambertMaterial({ color, flatShading: true });
    cache.set(color, m);
  }
  return m;
}

// Procedural facade: grid of windows + a door at the base. White ground so the
// per-building palette colour shows through (map multiplies the material color).
let facadeTex: THREE.Texture | null = null;
function facadeTexture(): THREE.Texture {
  if (facadeTex) return facadeTex;
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, 128, 128);
  // Windows.
  const cols = 4;
  const rows = 5;
  const mx = 10;
  const wgap = (128 - mx * 2) / cols;
  const top = 8;
  const wh = 16;
  const vgap = 22;
  ctx.fillStyle = '#5b6b7a';
  for (let r = 0; r < rows; r++) {
    for (let col = 0; col < cols; col++) {
      const x = mx + col * wgap + wgap * 0.18;
      const y = top + r * vgap;
      if (y + wh > 110) continue; // leave room for the door row
      ctx.fillRect(x, y, wgap * 0.64, wh);
    }
  }
  // Door (bottom centre).
  ctx.fillStyle = '#3a2f28';
  ctx.fillRect(64 - 9, 110, 18, 18);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  facadeTex = tex;
  return tex;
}

// Zinc rooftop: grey base with a few darker units/skylights.
let roofTex: THREE.Texture | null = null;
function roofTexture(): THREE.Texture {
  if (roofTex) return roofTex;
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#8f97a0';
  ctx.fillRect(0, 0, 64, 64);
  ctx.fillStyle = '#767e87';
  ctx.fillRect(8, 10, 18, 12); // rooftop unit
  ctx.fillRect(38, 30, 16, 20);
  ctx.fillStyle = '#5e656d';
  ctx.fillRect(30, 8, 6, 6); // vent
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  roofTex = tex;
  return tex;
}

// Per-palette material array for the building box: walls = facade, top = roof,
// bottom = plain. BoxGeometry group order: +x,-x,+y(top),-y(bottom),+z,-z.
const buildingCache = new Map<number, THREE.MeshLambertMaterial[]>();
export function buildingMaterials(color: number): THREE.MeshLambertMaterial[] {
  let arr = buildingCache.get(color);
  if (!arr) {
    const wall = new THREE.MeshLambertMaterial({ color, map: facadeTexture() });
    const roof = new THREE.MeshLambertMaterial({ color: 0xb8bdc4, map: roofTexture() });
    const base = new THREE.MeshLambertMaterial({ color: 0x2a2d33 });
    arr = [wall, wall, roof, base, wall, wall];
    buildingCache.set(color, arr);
  }
  return arr;
}

export const COLORS = {
  ground: 0x3a4150,
  park: 0x3f6b42,
  road: 0x2b2f37,
  river: 0x3f86b0,
  bridge: 0x6b6f76,
  player: 0xffcf4d,
  remote: 0x5fa8ff,
  car: [0xd14b4b, 0x4bd17a, 0x4b7ad1, 0xd1c14b, 0xb84bd1],
  dummy: 0xc0473a,
  tracer: 0xfff1a8,
  landmarkStone: 0xe8e2d4,
  landmarkZinc: 0x8f9aa3,
  landmarkGold: 0xd9b25a,
};
