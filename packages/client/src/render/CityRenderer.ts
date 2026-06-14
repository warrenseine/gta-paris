import * as THREE from 'three';
import type { CityData } from '@gta/shared';
import { PALETTES } from '@gta/shared';
import { flat, buildingMaterial, COLORS } from './materials.js';
import { buildLandmark } from './landmarks.js';

const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1);

// Builds the static city once: ground, river, roads, instanced buildings, landmarks.
export class CityRenderer {
  readonly group = new THREE.Group();

  constructor(city: CityData) {
    this.buildGround(city);
    this.buildRiver(city);
    this.buildRoads(city);
    this.buildBuildings(city);
    this.buildLandmarks(city);
  }

  private buildGround(city: CityData) {
    const w = city.bounds.maxX - city.bounds.minX;
    const d = city.bounds.maxZ - city.bounds.minZ;
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(w, d), flat(COLORS.ground));
    ground.rotation.x = -Math.PI / 2;
    ground.position.set((city.bounds.minX + city.bounds.maxX) / 2, -0.05, (city.bounds.minZ + city.bounds.maxZ) / 2);
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
    const river = new THREE.Mesh(geo, flat(COLORS.river));
    river.position.y = 0.02;
    this.group.add(river);

    // Bridges.
    for (const b of city.bridges) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(b.length, 1, b.width), flat(COLORS.bridge));
      m.position.set(b.x, 0.4, b.z);
      m.rotation.y = b.rotationY;
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
        m.position.set((a.x + b.x) / 2, 0.01, (a.z + b.z) / 2);
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
      const inst = new THREE.InstancedMesh(UNIT_BOX, buildingMaterial(color), arr.length);
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

  private buildLandmarks(city: CityData) {
    for (const l of city.landmarks) this.group.add(buildLandmark(l));
  }
}
