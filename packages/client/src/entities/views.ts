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

// Blocky car. +Z is forward: bright headlights up front, red taillights at back,
// cabin set toward the rear so the longer hood reads as the front.
export function makeCarMesh(color: number): THREE.Group {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.0, 4.4), flat(color));
  body.position.y = 0.6;
  g.add(body);

  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.85, 0.8, 1.8), flat(0x20242b));
  cabin.position.set(0, 1.3, -0.6); // toward the back
  g.add(cabin);

  // Windshield (lighter, front face of cabin) to bias the "face" forward.
  const windshield = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.6, 0.15), flat(0x8fbfd6));
  windshield.position.set(0, 1.35, 0.32);
  g.add(windshield);

  // Flat light bars on the TOP edges so front/back read from the top-down camera.
  const headMat = new THREE.MeshLambertMaterial({ color: 0xfff2b0, emissive: 0x8a7a20 });
  const tailMat = new THREE.MeshLambertMaterial({ color: 0xd83030, emissive: 0x6a0c0c });
  const barGeo = new THREE.BoxGeometry(1.7, 0.14, 0.45);
  const head = new THREE.Mesh(barGeo, headMat);
  head.position.set(0, 1.12, 2.0); // front
  g.add(head);
  const tail = new THREE.Mesh(barGeo, tailMat);
  tail.position.set(0, 1.12, -2.0); // back
  g.add(tail);
  return g;
}

const PED_SHIRTS = [0x556070, 0x6b5d52, 0x4f6b58, 0x70566b, 0x8a5a3c];
const PED_PANTS = [0x2f333a, 0x3a3026, 0x26332b, 0x33262f, 0x2a2a2a];

export function makePedMesh(colorId: number): THREE.Group {
  return makeHuman(PED_SHIRTS[colorId % PED_SHIRTS.length], PED_PANTS[colorId % PED_PANTS.length]);
}

// Pickup: a glowing pad + an item shape that reads from above.
// kind 1 = health (red cross); kind 0 = weapon (weaponId 1 pistol, 2 SMG, 3 shotgun).
export function makePickupMesh(kind: number, weaponId: number): THREE.Group {
  const g = new THREE.Group();
  const padColor = kind === 1 ? 0xff4d5e : weaponId === 3 ? 0xff8a3a : weaponId === 2 ? 0x39d98a : 0x5fd0ff;
  const pad = new THREE.Mesh(
    new THREE.CylinderGeometry(0.9, 0.9, 0.18, 16),
    new THREE.MeshLambertMaterial({ color: padColor, emissive: padColor, emissiveIntensity: 0.5 }),
  );
  pad.position.y = 0.1;
  g.add(pad);

  const metal = 0x33373d;
  const part = (w: number, h: number, d: number, color: number, x = 0, y = 0, z = 0) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), flat(color));
    m.position.set(x, 0.9 + y, z);
    g.add(m);
  };

  if (kind === 1) {
    part(0.9, 0.25, 0.3, 0xffffff); // white cross
    part(0.3, 0.25, 0.9, 0xffffff);
    part(1.0, 0.2, 1.0, 0xd83b4b, 0, -0.18); // red base
  } else if (weaponId === 3) {
    part(0.22, 0.22, 1.5, metal, 0, 0, 0.1); // shotgun: long double barrel
    part(0.22, 0.22, 1.5, metal, 0.18, 0, 0.1);
    part(0.3, 0.32, 0.5, 0x6b4a2f, 0, 0, -0.7); // stock
  } else if (weaponId === 2) {
    part(0.26, 0.28, 1.0, metal); // SMG body
    part(0.22, 0.5, 0.22, metal, 0, -0.3, 0.2); // magazine
    part(0.24, 0.34, 0.3, 0x222222, 0, -0.1, -0.45); // grip
  } else {
    part(0.24, 0.26, 0.7, metal, 0, 0, 0.1); // pistol slide
    part(0.22, 0.36, 0.26, 0x222222, 0, -0.22, -0.18); // grip
  }
  return g;
}
