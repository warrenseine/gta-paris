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

  // Limbs pivot from the hip/shoulder so the walk swing looks right.
  for (const limb of [lLeg, rLeg]) limb.geometry.translate(0, -0.475, 0);
  lLeg.position.y = 0.95;
  rLeg.position.y = 0.95;
  for (const limb of [lArm, rArm]) limb.geometry.translate(0, -0.39, 0);
  lArm.position.y = 1.73;
  rArm.position.y = 1.73;

  g.userData.walk = { lLeg, rLeg, lArm, rArm, phase: 0 };
  return g;
}

// Swing limbs while moving; settle to neutral when still.
export function animateWalk(group: THREE.Object3D, speed: number, dt: number) {
  const w = group.userData.walk as
    | { lLeg: THREE.Mesh; rLeg: THREE.Mesh; lArm: THREE.Mesh; rArm: THREE.Mesh; phase: number }
    | undefined;
  if (!w) return;
  const intensity = Math.min(1, speed / 5);
  w.phase += dt * (4 + speed * 0.9);
  const swing = Math.sin(w.phase) * 0.7 * intensity;
  w.lLeg.rotation.x = swing;
  w.rLeg.rotation.x = -swing;
  w.lArm.rotation.x = -swing;
  w.rArm.rotation.x = swing;
}

// Swim: lie prone (caller tilts the body) and paddle arms + flutter legs.
export function animateSwim(group: THREE.Object3D, dt: number) {
  const w = group.userData.walk as
    | { lLeg: THREE.Mesh; rLeg: THREE.Mesh; lArm: THREE.Mesh; rArm: THREE.Mesh; phase: number }
    | undefined;
  if (!w) return;
  w.phase += dt * 7;
  const s = Math.sin(w.phase);
  w.lArm.rotation.x = -1.5 + s * 0.9; // alternating overhead strokes
  w.rArm.rotation.x = -1.5 - s * 0.9;
  w.lLeg.rotation.x = s * 0.5; // flutter kick
  w.rLeg.rotation.x = -s * 0.5;
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

// Cop: dark-blue uniform humanoid with a cap.
export function makeCopMesh(): THREE.Group {
  const g = makeHuman(0x26407a, 0x1b2b52);
  const cap = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.16, 0.46), flat(0x16204a));
  cap.position.y = 2.24;
  g.add(cap);
  return g;
}

// Police car: white body, blue accents, a roof light bar.
export function makePoliceCarMesh(): THREE.Group {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.0, 4.4), flat(0xe8edf2)));
  (g.children[0] as THREE.Mesh).position.y = 0.6;
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.85, 0.8, 1.8), flat(0x2740a0));
  cabin.position.set(0, 1.3, -0.6);
  g.add(cabin);
  const door = new THREE.Mesh(new THREE.BoxGeometry(2.24, 0.5, 1.6), flat(0x2740a0));
  door.position.set(0, 0.6, 0);
  g.add(door);
  // Roof light bar (red + blue).
  const red = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.2, 0.4), new THREE.MeshLambertMaterial({ color: 0xff2a2a, emissive: 0x660000 }));
  red.position.set(-0.35, 1.85, -0.3);
  const blue = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.2, 0.4), new THREE.MeshLambertMaterial({ color: 0x2a5cff, emissive: 0x001466 }));
  blue.position.set(0.35, 1.85, -0.3);
  g.add(red, blue);
  // Headlights front.
  const hl = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.14, 0.45), new THREE.MeshLambertMaterial({ color: 0xfff2b0, emissive: 0x8a7a20 }));
  hl.position.set(0, 1.12, 2.0);
  g.add(hl);
  return g;
}

// Army tank: hull + tracks + turret with a long gun barrel. +Z forward.
export function makeTankMesh(): THREE.Group {
  const g = new THREE.Group();
  const olive = 0x4b5320;
  const dark = 0x3a4019;
  const hull = new THREE.Mesh(new THREE.BoxGeometry(3.0, 1.1, 5.2), flat(olive));
  hull.position.y = 0.9;
  g.add(hull);
  // Tracks down each side.
  for (const sx of [-1, 1]) {
    const track = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.0, 5.6), flat(dark));
    track.position.set(sx * 1.7, 0.5, 0);
    g.add(track);
  }
  // Turret + barrel in a subgroup that rotates to aim at the target.
  const turret = new THREE.Group();
  const cupola = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.9, 2.4), flat(0x555c28));
  cupola.position.set(0, 1.7, 0);
  turret.add(cupola);
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 3.4, 8), flat(0x2f3416));
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0, 1.8, 2.1); // extends out the front of the turret
  turret.add(barrel);
  g.add(turret);
  g.userData.turret = turret; // rotated by the renderer to face the target
  g.scale.setScalar(1.3); // a bit bigger / more imposing
  return g;
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
