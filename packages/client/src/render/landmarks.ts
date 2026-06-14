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

// A square (4-sided) tapered section, aligned to axes.
function frustum(rBottom: number, rTop: number, h: number, color: number, y: number): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBottom, h, 4), flat(color));
  m.rotation.y = Math.PI / 4;
  m.position.y = y;
  return m;
}

function eiffel(): THREE.Group {
  const g = new THREE.Group();
  // Four distinct splayed legs that lean inward and meet under the platform.
  const legLen = 50;
  const corner = 14;
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(5.5, legLen, 5.5), flat(ZINC));
      leg.geometry.translate(0, legLen / 2, 0); // pivot at the foot
      leg.position.set(sx * corner, 0, sz * corner);
      leg.rotation.z = sx * 0.22; // lean the top toward the centre
      leg.rotation.x = -sz * 0.22;
      g.add(leg);
    }
  }
  // Arch panels spanning between the legs (open underneath = the iconic arch).
  for (const [ax, az, ry] of [
    [0, corner, 0],
    [0, -corner, 0],
    [corner, 0, Math.PI / 2],
    [-corner, 0, Math.PI / 2],
  ] as const) {
    const arch = new THREE.Mesh(new THREE.BoxGeometry(20, 8, 2), flat(0x6a7079));
    arch.position.set(ax, 22, az);
    arch.rotation.y = ry;
    g.add(arch);
  }
  g.add(box(40, 4, 40, ZINC, 0, 46)); // first platform
  g.add(frustum(15, 8, 56, ZINC, 76)); // mid section
  g.add(box(20, 3, 20, ZINC, 0, 106)); // second platform
  g.add(frustum(6, 2, 70, ZINC, 142)); // upper
  g.add(cyl(1.6, 24, ZINC, 0, 189, 0, 6)); // mast
  g.add(cone(1.4, 8, ZINC, 0, 205, 0, 6)); // tip
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
  const ROOF = 0x444b57; // dark slate mansard
  // U-shaped palace opening WEST toward the Tuileries; closed wing on the east.
  // Each wing is a stone block capped by a mansard roof slab.
  const wing = (w: number, h: number, d: number, x: number, z: number) => {
    g.add(box(w, h, d, STONE, x, h / 2, z));
    // Roof slab sunk so its base sits inside the wall (no coplanar faces = no
    // z-fighting); eaves overhang slightly.
    g.add(box(w + 1.5, 3, d + 1.5, ROOF, x, h, z));
  };
  wing(16, 16, 58, 22, 0); // east wing (back of the U)
  wing(52, 15, 15, -3, -22); // north wing
  wing(52, 15, 15, -3, 22); // south wing

  // Pavilions: taller corner/central blocks with pointed pavilion roofs (the
  // château silhouette).
  const pav = (x: number, z: number) => {
    g.add(box(15, 22, 15, STONE, x, 11, z));
    const cap = new THREE.Mesh(new THREE.ConeGeometry(11, 9, 4), flat(ROOF));
    cap.rotation.y = Math.PI / 4;
    cap.position.set(x, 26, z);
    g.add(cap);
  };
  pav(28, -22); // four corner pavilions
  pav(28, 22);
  pav(-28, -22);
  pav(-28, 22);
  pav(28, 0); // central pavilion on the back wing

  const pyr = new THREE.Mesh(new THREE.ConeGeometry(7, 11, 4), flat(0x9fd0e0));
  pyr.rotation.y = Math.PI / 4;
  pyr.position.set(-8, 5.5, 0); // glass pyramid in the courtyard, toward the opening
  g.add(pyr);
  return g;
}

function notredame(): THREE.Group {
  const g = new THREE.Group();
  // Smaller cathedral, long axis E-W; west front (towers) at the -x end so it
  // fits lengthwise on the île de la Cité.
  g.add(box(46, 18, 16, STONE, 0, 9, 0)); // nave
  g.add(box(9, 30, 7, STONE, -20, 15, -4)); // west towers
  g.add(box(9, 30, 7, STONE, -20, 15, 4));
  g.add(box(7, 9, 2, 0x6a6258, -25, 16, 0)); // rose window on the west facade
  g.add(cone(3, 18, ZINC, 8, 27, 0, 8)); // spire over the crossing
  // Flying-buttress hints along the long sides.
  for (const x of [-2, 8, 16]) {
    g.add(box(2.5, 10, 2.5, STONE, x, 6, -10));
    g.add(box(2.5, 10, 2.5, STONE, x, 6, 10));
  }
  return g;
}

function sacrecoeur(): THREE.Group {
  const g = new THREE.Group();
  // Montmartre mound so the basilica sits on a hill instead of floating.
  const hill = new THREE.Mesh(new THREE.CylinderGeometry(42, 58, 16, 18), flat(0x4a6b3f));
  hill.position.y = -8; // top of the mound at y≈0 (basilica base)
  g.add(hill);
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

function parcdesprinces(): THREE.Group {
  const g = new THREE.Group();
  // Oval stadium: a green pitch ringed by a raked grandstand wall.
  const pitch = new THREE.Mesh(new THREE.CircleGeometry(1, 28), flat(0x3f7a3a));
  pitch.scale.set(30, 20, 1);
  pitch.rotation.x = -Math.PI / 2;
  pitch.position.y = 0.2;
  g.add(pitch);
  // Stand ring: a torus flattened into an oval bowl.
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1, 0.32, 8, 28), flat(0xcdd2d8));
  ring.scale.set(33, 22, 9);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 7;
  g.add(ring);
  // Outer wall.
  const wall = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 9, 28, 1, true), flat(0xb7bcc4));
  wall.scale.set(34, 1, 23);
  wall.position.y = 4.5;
  g.add(wall);
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
  parcdesprinces,
};

export function buildLandmark(def: LandmarkDef): THREE.Group {
  const g = (BUILDERS[def.key] ?? concorde)();
  g.position.set(def.position.x, def.position.y, def.position.z);
  g.rotation.y = def.rotationY;
  g.scale.setScalar(def.scale);
  return g;
}
