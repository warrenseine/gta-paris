import * as THREE from 'three';
import type { LandmarkDef } from '@gta/shared';
import { flat, COLORS } from './materials.js';

// Procedural blocky landmarks — recognizable silhouettes from primitives.
// (Hand-modeled glTF can replace these later behind the same per-key builder.)

function box(w: number, h: number, d: number, color: number, y: number): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), flat(color));
  m.position.y = y;
  return m;
}

function eiffel(): THREE.Group {
  const g = new THREE.Group();
  const c = COLORS.landmarkZinc;
  // Four tapering legs implied by a stack of shrinking boxes + a spire.
  const levels = [
    { w: 46, h: 4, y: 2 },
    { w: 30, h: 60, y: 36 },
    { w: 16, h: 70, y: 100 },
    { w: 8, h: 70, y: 168 },
    { w: 3, h: 50, y: 226 },
  ];
  for (const l of levels) g.add(box(l.w, l.h, l.w, c, l.y));
  // Platform decks.
  g.add(box(38, 2, 38, c, 38));
  g.add(box(22, 2, 22, c, 104));
  return g;
}

function arc(): THREE.Group {
  const g = new THREE.Group();
  const c = COLORS.landmarkStone;
  const W = 44, H = 48, D = 22, leg = 12, archW = W - leg * 2;
  // Two legs + top lintel = an arch.
  g.add(box(leg, H, D, c, H / 2));
  const left = box(leg, H, D, c, H / 2); left.position.x = -(archW / 2 + leg / 2); g.add(left);
  const right = box(leg, H, D, c, H / 2); right.position.x = archW / 2 + leg / 2; g.add(right);
  g.add(box(W, 14, D, c, H - 7));
  return g;
}

function louvre(): THREE.Group {
  const g = new THREE.Group();
  const c = COLORS.landmarkStone;
  // Long low U-shaped palace wings.
  g.add(box(120, 22, 26, c, 11)); // north wing
  const s1 = box(26, 22, 80, c, 11); s1.position.set(-47, 0, 53); g.add(s1);
  const s2 = box(26, 22, 80, c, 11); s2.position.set(47, 0, 53); g.add(s2);
  // Glass pyramid.
  const pyr = new THREE.Mesh(new THREE.ConeGeometry(14, 20, 4), flat(0x9fd0e0));
  pyr.position.set(0, 10, 50); pyr.rotation.y = Math.PI / 4; g.add(pyr);
  return g;
}

function notredame(): THREE.Group {
  const g = new THREE.Group();
  const c = COLORS.landmarkStone;
  g.add(box(34, 30, 70, c, 15)); // nave
  const t1 = box(14, 56, 14, c, 28); t1.position.set(-10, 0, -38); g.add(t1);
  const t2 = box(14, 56, 14, c, 28); t2.position.set(10, 0, -38); g.add(t2);
  // Spire.
  const spire = new THREE.Mesh(new THREE.ConeGeometry(4, 30, 6), flat(COLORS.landmarkZinc));
  spire.position.set(0, 45, 6); g.add(spire);
  return g;
}

function sacrecoeur(): THREE.Group {
  const g = new THREE.Group();
  const c = 0xf2efe6; // white travertine
  g.add(box(50, 26, 50, c, 13));
  // Central + side domes.
  const dome = (r: number, x: number, z: number, y: number) => {
    const m = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), flat(c));
    m.position.set(x, y, z); return m;
  };
  g.add(dome(14, 0, 0, 26));
  g.add(box(10, 30, 10, c, 15)); // drum under main dome
  g.add(dome(7, -20, -16, 26));
  g.add(dome(7, 20, -16, 26));
  return g;
}

function concorde(): THREE.Group {
  const g = new THREE.Group();
  // Luxor obelisk.
  const ob = box(3, 34, 3, COLORS.landmarkGold, 17);
  const cap = new THREE.Mesh(new THREE.ConeGeometry(2.2, 5, 4), flat(COLORS.landmarkGold));
  cap.position.y = 36.5; cap.rotation.y = Math.PI / 4;
  g.add(ob); g.add(cap);
  g.add(box(8, 3, 8, COLORS.landmarkStone, 1.5)); // base
  return g;
}

const BUILDERS: Record<string, () => THREE.Group> = {
  eiffel, arc, louvre, notredame, sacrecoeur, concorde,
};

export function buildLandmark(def: LandmarkDef): THREE.Group {
  const g = (BUILDERS[def.key] ?? concorde)();
  g.position.set(def.position.x, def.position.y, def.position.z);
  g.rotation.y = def.rotationY;
  g.scale.setScalar(def.scale);
  return g;
}
