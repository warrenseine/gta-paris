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

const buildingCache = new Map<number, THREE.MeshLambertMaterial>();
export function buildingMaterial(color: number): THREE.MeshLambertMaterial {
  let m = buildingCache.get(color);
  if (!m) {
    m = new THREE.MeshLambertMaterial({ color, map: facadeTexture() });
    buildingCache.set(color, m);
  }
  return m;
}

export const COLORS = {
  ground: 0x3a4150,
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
