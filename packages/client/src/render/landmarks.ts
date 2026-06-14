import * as THREE from 'three';
import type { LandmarkDef } from '@gta/shared';
import { flat, COLORS } from './materials.js';

// Low-poly but recognizable landmarks: primitives (boxes, cylinders, cones,
// spheres) composed into shapely silhouettes. +Z forward, Y up.

const STONE = COLORS.landmarkStone;
const ZINC = COLORS.landmarkZinc;
const GOLD = COLORS.landmarkGold;
const WHITE = 0xf2efe6;

function box(w: number, h: number, d: number, color: number, x = 0, y = 0, z = 0): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), flat(color));
  m.position.set(x, y, z);
  return m;
}
function cyl(r: number, h: number, color: number, x = 0, y = 0, z = 0, seg = 12): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, seg), flat(color));
  m.position.set(x, y, z);
  return m;
}
function cone(r: number, h: number, color: number, x = 0, y = 0, z = 0, seg = 8): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.ConeGeometry(r, h, seg), flat(color));
  m.position.set(x, y, z);
  return m;
}
function dome(r: number, color: number, x = 0, y = 0, z = 0): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), flat(color));
  m.position.set(x, y, z);
  return m;
}
// A row of columns along X.
function colonnade(count: number, spacing: number, r: number, h: number, z: number, color: number): THREE.Group {
  const g = new THREE.Group();
  const x0 = -((count - 1) * spacing) / 2;
  for (let i = 0; i < count; i++) g.add(cyl(r, h, color, x0 + i * spacing, h / 2, z, 8));
  return g;
}

function eiffel(): THREE.Group {
  const g = new THREE.Group();
  // Four legs angled inward, meeting at the first platform.
  const legPos = [
    [-16, -16], [16, -16], [-16, 16], [16, 16],
  ];
  for (const [lx, lz] of legPos) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(2, 4, 42, 6), flat(ZINC));
    leg.position.set(lx * 0.6, 21, lz * 0.6);
    leg.rotation.x = (lz / 16) * 0.14;
    leg.rotation.z = (-lx / 16) * 0.14;
    g.add(leg);
  }
  g.add(box(40, 3, 40, ZINC, 0, 40)); // first deck
  g.add(box(22, 36, 22, ZINC, 0, 60)); // mid section (tapered look via stack)
  g.add(box(18, 3, 18, ZINC, 0, 80)); // second deck
  g.add(box(10, 60, 10, ZINC, 0, 110));
  g.add(cyl(3, 40, ZINC, 0, 158, 0, 6));
  g.add(cone(2, 16, ZINC, 0, 184, 0, 6)); // spire
  return g;
}

function arcdetriomphe(): THREE.Group {
  const g = new THREE.Group();
  const W = 46, H = 50, D = 24, leg = 13;
  g.add(box(leg, H, D, STONE, -(W / 2 - leg / 2), H / 2));
  g.add(box(leg, H, D, STONE, W / 2 - leg / 2, H / 2));
  g.add(box(W, 16, D, STONE, 0, H - 8)); // top lintel
  g.add(box(W + 4, 8, D + 4, STONE, 0, H + 4)); // attic / cornice
  // Vault hint.
  g.add(box(W - leg * 2, H - 18, 4, 0x6a6258, 0, (H - 18) / 2, 0));
  return g;
}

function louvre(): THREE.Group {
  const g = new THREE.Group();
  g.add(box(120, 22, 26, STONE, 0, 11, -34)); // long wing
  g.add(box(26, 22, 84, STONE, -47, 11, 12));
  g.add(box(26, 22, 84, STONE, 47, 11, 12));
  const pyr = new THREE.Mesh(new THREE.ConeGeometry(13, 20, 4), flat(0x9fd0e0));
  pyr.rotation.y = Math.PI / 4;
  pyr.position.set(0, 10, 18);
  g.add(pyr);
  return g;
}

function notredame(): THREE.Group {
  const g = new THREE.Group();
  g.add(box(30, 26, 64, STONE, 0, 13, 6)); // nave
  g.add(box(15, 50, 15, STONE, -9, 25, -32)); // west towers
  g.add(box(15, 50, 15, STONE, 9, 25, -32));
  g.add(box(13, 13, 2, 0x6a6258, 0, 30, -39)); // rose window
  g.add(cone(4, 28, ZINC, 0, 44, 8, 8)); // spire
  // Flying-buttress hint.
  for (const z of [-6, 12, 26]) {
    g.add(box(3, 14, 3, STONE, -18, 8, z));
    g.add(box(3, 14, 3, STONE, 18, 8, z));
  }
  return g;
}

function sacrecoeur(): THREE.Group {
  const g = new THREE.Group();
  g.add(box(52, 22, 44, WHITE, 0, 11));
  g.add(cyl(9, 16, WHITE, 0, 26, 0)); // central drum
  g.add(dome(11, WHITE, 0, 34));
  g.add(cone(2.5, 8, WHITE, 0, 47)); // lantern
  for (const [x, z] of [[-20, -14], [20, -14], [-20, 14], [20, 14]]) {
    g.add(cyl(4, 8, WHITE, x, 24, z));
    g.add(dome(5, WHITE, x, 28, z));
  }
  return g;
}

function concorde(): THREE.Group {
  const g = new THREE.Group();
  g.add(box(8, 3, 8, STONE, 0, 1.5));
  g.add(box(3, 34, 3, GOLD, 0, 18));
  g.add(cone(2.2, 5, GOLD, 0, 37, 0, 4));
  g.add(cyl(6, 1, 0x6a93a8, -22, 0.5, 0)); // fountains
  g.add(cyl(6, 1, 0x6a93a8, 22, 0.5, 0));
  return g;
}

function opera(): THREE.Group {
  const g = new THREE.Group();
  g.add(box(54, 24, 38, STONE, 0, 12));
  g.add(colonnade(7, 6, 1.6, 14, 19, 0xcabfa6)); // front facade columns
  g.add(box(56, 5, 40, GOLD, 0, 26)); // gilt frieze
  g.add(cyl(11, 6, 0x5d7a52, 0, 31, -4)); // green dome drum
  g.add(dome(11, 0x4f6b46, 0, 37, -4));
  return g;
}

function pantheon(): THREE.Group {
  const g = new THREE.Group();
  g.add(box(40, 20, 50, STONE, 0, 10));
  g.add(colonnade(6, 6, 2, 20, 25, STONE)); // portico
  g.add(box(34, 6, 6, STONE, 0, 22, 25)); // pediment base
  g.add(cyl(13, 16, STONE, 0, 30, -2, 16)); // drum
  g.add(dome(13, ZINC, 0, 46, -2));
  g.add(cone(2, 8, GOLD, 0, 60, -2));
  return g;
}

function invalides(): THREE.Group {
  const g = new THREE.Group();
  g.add(box(70, 20, 40, STONE, 0, 10));
  g.add(cyl(12, 22, STONE, 0, 28, 0, 16)); // drum
  g.add(dome(13, GOLD, 0, 39)); // golden dome
  g.add(cone(2.5, 12, GOLD, 0, 56));
  return g;
}

function madeleine(): THREE.Group {
  const g = new THREE.Group();
  g.add(box(34, 4, 64, STONE, 0, 2)); // stylobate
  // Surrounding colonnade (front + back rows).
  g.add(colonnade(8, 4.2, 1.7, 24, 30, 0xcabfa6));
  g.add(colonnade(8, 4.2, 1.7, 24, -30, 0xcabfa6));
  g.add(box(34, 5, 64, STONE, 0, 27)); // roof
  return g;
}

function grandpalais(): THREE.Group {
  const g = new THREE.Group();
  g.add(box(90, 18, 44, STONE, 0, 9));
  g.add(colonnade(10, 8, 1.6, 16, 22, 0xcabfa6));
  // Glass barrel roof.
  const glass = new THREE.Mesh(new THREE.CylinderGeometry(16, 16, 70, 16, 1, false, 0, Math.PI), flat(0x8fc7d8));
  glass.rotation.z = Math.PI / 2;
  glass.position.set(0, 18, 0);
  g.add(glass);
  return g;
}

function montparnasse(): THREE.Group {
  const g = new THREE.Group();
  g.add(box(26, 120, 18, 0x2c3038, 0, 60)); // dark modern tower
  g.add(box(28, 6, 20, 0x44484f, 0, 3));
  return g;
}

const BUILDERS: Record<string, () => THREE.Group> = {
  eiffel,
  arcdetriomphe,
  arc: arcdetriomphe,
  louvre,
  notredame,
  sacrecoeur,
  concorde,
  opera,
  pantheon,
  invalides,
  madeleine,
  grandpalais,
  montparnasse,
};

export function buildLandmark(def: LandmarkDef): THREE.Group {
  const g = (BUILDERS[def.key] ?? concorde)();
  g.position.set(def.position.x, def.position.y, def.position.z);
  g.rotation.y = def.rotationY;
  g.scale.setScalar(def.scale);
  return g;
}
