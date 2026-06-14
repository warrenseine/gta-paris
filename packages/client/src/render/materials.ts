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

export const COLORS = {
  ground: 0x3a4150,
  road: 0x2b2f37,
  river: 0x2b5d7a,
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
