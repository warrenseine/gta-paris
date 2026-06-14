import * as THREE from 'three';
import { flat } from '../render/materials.js';

const SKIN = 0xe0b89a;

// Low-poly humanoid: legs, torso, arms, head + a small face marker for facing.
// +Z is forward (matches rotY). `shirt` = torso/arms color, `pants` = legs.
function makeHuman(shirt: number, pants = 0x3a3f48): THREE.Group {
  const g = new THREE.Group();

  const legGeo = new THREE.BoxGeometry(0.28, 0.95, 0.32);
  const lLeg = new THREE.Mesh(legGeo, flat(pants));
  lLeg.position.set(-0.17, 0.48, 0);
  const rLeg = new THREE.Mesh(legGeo, flat(pants));
  rLeg.position.set(0.17, 0.48, 0);
  g.add(lLeg, rLeg);

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.85, 0.42), flat(shirt));
  torso.position.y = 1.35;
  g.add(torso);

  const armGeo = new THREE.BoxGeometry(0.2, 0.78, 0.26);
  const lArm = new THREE.Mesh(armGeo, flat(shirt));
  lArm.position.set(-0.47, 1.34, 0);
  const rArm = new THREE.Mesh(armGeo, flat(shirt));
  rArm.position.set(0.47, 1.34, 0);
  g.add(lArm, rArm);

  const head = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.42, 0.42), flat(SKIN));
  head.position.y = 2.0;
  g.add(head);

  // Face marker (nose) so facing direction reads at a glance.
  const face = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, 0.12), flat(0x2a2a2a));
  face.position.set(0, 2.0, 0.24);
  g.add(face);

  return g;
}

export function makePlayerMesh(color: number): THREE.Group {
  return makeHuman(color);
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

const PED_SHIRTS = [0x556070, 0x6b5d52, 0x4f6b58, 0x70566b, 0x8a5a3c];
const PED_PANTS = [0x2f333a, 0x3a3026, 0x26332b, 0x33262f, 0x2a2a2a];

export function makePedMesh(colorId: number): THREE.Group {
  return makeHuman(PED_SHIRTS[colorId % PED_SHIRTS.length], PED_PANTS[colorId % PED_PANTS.length]);
}
