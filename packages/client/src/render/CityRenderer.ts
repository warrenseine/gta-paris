import * as THREE from 'three';
import type { CityData } from '@gta/shared';
import { PALETTES } from '@gta/shared';
import { flat, buildingMaterials, COLORS } from './materials.js';
import { buildLandmark } from './landmarks.js';

const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1);

// Builds the static city once: ground, river, roads, instanced buildings, landmarks.
export class CityRenderer {
  readonly group = new THREE.Group();

  constructor(city: CityData) {
    this.buildGround(city);
    this.buildParks(city);
    this.buildRoads(city);
    this.buildRiver(city); // after roads so the Seine sits on top where streets cross it
    this.buildIsland(city); // île de la Cité, above the river
    this.buildBuildings(city);
    this.buildTrees(city);
    this.buildLandmarks(city);
  }

  private buildIsland(city: CityData) {
    const isl = city.island;
    if (!isl) return;
    const geo = new THREE.CircleGeometry(1, 28);
    const m = new THREE.Mesh(geo, flat(COLORS.ground));
    m.scale.set(isl.rx, isl.rz, 1);
    m.rotation.x = -Math.PI / 2;
    m.position.set(isl.cx, 0.18, isl.cz); // just above the Seine ribbon (0.14)
    this.group.add(m);
  }

  private buildGround(city: CityData) {
    // Dark suburbs underneath everything.
    const outside = new THREE.Mesh(new THREE.CircleGeometry(1200, 8), flat(0x2a3326));
    outside.rotation.x = -Math.PI / 2;
    outside.position.y = -0.2;
    this.group.add(outside);

    // City ground = the Paris outline polygon (the Périph itself is a road).
    const shape = new THREE.Shape();
    city.boundary.forEach((p, i) => {
      if (i) shape.lineTo(p.x, -p.z);
      else shape.moveTo(p.x, -p.z); // -z so rotateX(-90) maps back to world +Z
    });
    shape.closePath();
    const ground = new THREE.Mesh(new THREE.ShapeGeometry(shape), flat(COLORS.ground));
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.1;
    this.group.add(ground);
  }

  private buildRiver(city: CityData) {
    // Flat ribbon following the Seine polyline.
    const pts = city.river.points;
    const hw = city.river.width / 2;
    const positions: number[] = [];
    const index: number[] = [];
    for (let i = 0; i < pts.length; i++) {
      const prev = pts[Math.max(0, i - 1)];
      const next = pts[Math.min(pts.length - 1, i + 1)];
      const tx = next.x - prev.x;
      const tz = next.z - prev.z;
      const tl = Math.hypot(tx, tz) || 1;
      // Perpendicular.
      const nx = -tz / tl;
      const nz = tx / tl;
      positions.push(pts[i].x + nx * hw, 0, pts[i].z + nz * hw);
      positions.push(pts[i].x - nx * hw, 0, pts[i].z - nz * hw);
    }
    for (let i = 0; i < pts.length - 1; i++) {
      const a = i * 2;
      index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setIndex(index);
    geo.computeVertexNormals();
    // Double-sided: the ribbon's normals can point down, which front-side
    // culling would hide from the steep top-down camera.
    const riverMat = new THREE.MeshLambertMaterial({ color: COLORS.river, side: THREE.DoubleSide });
    const river = new THREE.Mesh(geo, riverMat);
    river.position.y = 0.14; // clearly above roads/ground
    this.group.add(river);

    // Bridges.
    for (const b of city.bridges) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(b.length, 1, b.width), flat(COLORS.bridge));
      m.position.set(b.x, 0.4, b.z);
      m.rotation.y = b.rotationY;
      this.group.add(m);
    }
  }

  private buildParks(city: CityData) {
    for (const p of city.parks) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(p.hw * 2, p.hd * 2), flat(COLORS.park));
      m.rotation.x = -Math.PI / 2;
      m.position.set(p.cx, 0.02, p.cz);
      this.group.add(m);
    }
  }

  private buildRoads(city: CityData) {
    for (const r of city.roads) {
      for (let i = 0; i < r.points.length - 1; i++) {
        const a = r.points[i];
        const b = r.points[i + 1];
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const len = Math.hypot(dx, dz);
        const m = new THREE.Mesh(new THREE.PlaneGeometry(r.width, len), flat(COLORS.road));
        m.rotation.x = -Math.PI / 2;
        m.rotation.z = -Math.atan2(dz, dx) + Math.PI / 2;
        m.position.set((a.x + b.x) / 2, 0.08, (a.z + b.z) / 2); // clearly above parks/ground
        this.group.add(m);
      }
    }
  }

  private buildBuildings(city: CityData) {
    // Group instances by palette -> one InstancedMesh per color, few draw calls.
    const byPalette = new Map<number, typeof city.buildings>();
    for (const b of city.buildings) {
      const arr = byPalette.get(b.paletteId) ?? [];
      arr.push(b);
      byPalette.set(b.paletteId, arr);
    }
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const pos = new THREE.Vector3();
    const scl = new THREE.Vector3();
    for (const [paletteId, arr] of byPalette) {
      const color = PALETTES[paletteId] ?? PALETTES[0];
      const inst = new THREE.InstancedMesh(UNIT_BOX, buildingMaterials(color), arr.length);
      arr.forEach((b, i) => {
        q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), b.rotationY);
        pos.set(b.cx, b.height / 2, b.cz);
        scl.set(b.hw * 2, b.height, b.hd * 2);
        m.compose(pos, q, scl);
        inst.setMatrixAt(i, m);
      });
      inst.instanceMatrix.needsUpdate = true;
      this.group.add(inst);
    }
  }

  private buildTrees(city: CityData) {
    const pts = city.trees;
    if (!pts.length) return;
    let seed = 0x7e5;
    const rng = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };

    const trunkGeo = new THREE.CylinderGeometry(0.35, 0.45, 3, 5);
    const foliageGeo = new THREE.IcosahedronGeometry(2.4, 0);
    const trunks = new THREE.InstancedMesh(trunkGeo, flat(0x5a3f2a), pts.length);
    const foliage = new THREE.InstancedMesh(foliageGeo, flat(0x4a7c3a), pts.length);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const v = new THREE.Vector3();
    const one = new THREE.Vector3(1, 1, 1);
    pts.forEach((p, i) => {
      const s = 0.8 + rng() * 0.6;
      m.compose(v.set(p.x, 1.5, p.z), q, one);
      trunks.setMatrixAt(i, m);
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rng() * 6.28);
      m.compose(v.set(p.x, 4 + s, p.z), q, one.set(s, s * 1.1, s));
      foliage.setMatrixAt(i, m);
      q.identity();
    });
    trunks.instanceMatrix.needsUpdate = true;
    foliage.instanceMatrix.needsUpdate = true;
    this.group.add(trunks, foliage);
  }

  private buildLandmarks(city: CityData) {
    for (const l of city.landmarks) this.group.add(buildLandmark(l));
  }
}
