import * as THREE from 'three';
import { flat, COLORS } from '../render/materials.js';

// Blocky avatar: body + a "nose" wedge showing facing direction.
export function makePlayerMesh(color: number): THREE.Group {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(1, 1.8, 0.7), flat(color));
  body.position.y = 0.9;
  g.add(body);
  const nose = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.5, 0.5), flat(0x222222));
  nose.position.set(0, 1.3, 0.5); // +Z local = facing
  g.add(nose);
  return g;
}

// Blocky car: chassis + cabin + facing marker.
export function makeCarMesh(color: number): THREE.Group {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.0, 4.4), flat(color));
  body.position.y = 0.6;
  g.add(body);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.8, 2.0), flat(0x2a2f36));
  cabin.position.set(0, 1.3, -0.2);
  g.add(cabin);
  const hood = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.3, 0.4), flat(0x111111));
  hood.position.set(0, 0.9, 2.2); // +Z = forward
  g.add(hood);
  return g;
}

const PED_COLORS = [0x556070, 0x6b5d52, 0x4f6b58, 0x70566b, 0x5a5f6b];

// Small blocky pedestrian.
export function makePedMesh(colorId: number): THREE.Group {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.6, 0.5), flat(PED_COLORS[colorId % PED_COLORS.length]));
  body.position.y = 0.8;
  g.add(body);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.45, 0.45), flat(0xddc9b0));
  head.position.y = 1.85;
  g.add(head);
  return g;
}

export function makeDummyMesh(): THREE.Group {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(1, 1.8, 0.7), flat(COLORS.dummy));
  body.position.y = 0.9;
  g.add(body);
  return g;
}
