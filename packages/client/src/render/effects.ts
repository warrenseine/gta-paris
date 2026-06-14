import * as THREE from 'three';
import { COLORS } from './materials.js';

interface Tracer {
  line: THREE.Line;
  ttl: number;
}
interface Burst {
  mesh: THREE.Mesh;
  ttl: number;
  max: number;
  size: number;
  spin: number;
}

// Spiky star outline (cartoon explosion shape), flat in XZ.
function starGeometry(spikes: number, outer: number, inner: number): THREE.ShapeGeometry {
  const s = new THREE.Shape();
  for (let i = 0; i <= spikes * 2; i++) {
    const r = i % 2 ? inner : outer;
    const a = (i * Math.PI) / spikes;
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r;
    if (i === 0) s.moveTo(x, y);
    else s.lineTo(x, y);
  }
  return new THREE.ShapeGeometry(s);
}
const STAR = starGeometry(11, 1, 0.52);
const PUFF = new THREE.CircleGeometry(1, 10);

interface Puff {
  mesh: THREE.Mesh;
  ttl: number;
  max: number;
}

// Pooled bullet tracers, sparks, and comic explosions.
export class Effects {
  private tracers: Tracer[] = [];
  private bursts: Burst[] = [];
  private puffs: Puff[] = [];
  private group = new THREE.Group();

  constructor(scene: THREE.Scene) {
    scene.add(this.group);
  }

  tracer(ox: number, oz: number, tx: number, tz: number) {
    const geo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(ox, 1.0, oz),
      new THREE.Vector3(tx, 1.0, tz),
    ]);
    const mat = new THREE.LineBasicMaterial({ color: COLORS.tracer, transparent: true });
    const line = new THREE.Line(geo, mat);
    this.group.add(line);
    this.tracers.push({ line, ttl: 0.08 });
  }

  spark(x: number, z: number) {
    const geo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(x, 1.0, z),
      new THREE.Vector3(x, 2.0, z),
    ]);
    const mat = new THREE.LineBasicMaterial({ color: 0xff7b3a, transparent: true });
    const line = new THREE.Line(geo, mat);
    this.group.add(line);
    this.tracers.push({ line, ttl: 0.15 });
  }

  private star(x: number, z: number, y: number, color: number, size: number, ttl: number) {
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, depthWrite: false, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(STAR, mat);
    mesh.rotation.x = -Math.PI / 2; // lay flat, facing up
    mesh.position.set(x, y, z);
    mesh.scale.setScalar(size * 0.3);
    this.group.add(mesh);
    this.bursts.push({ mesh, ttl, max: ttl, size, spin: (Math.random() - 0.5) * 4 });
  }

  explosion(x: number, z: number) {
    // Comic boom: a big orange star + a yellow core + white flash, popping out.
    this.star(x, z, 3, 0xff8a1e, 18, 0.55);
    this.star(x, z, 3.2, 0xffe23a, 11, 0.5);
    this.star(x, z, 3.4, 0xffffff, 5, 0.32);
    // Debris streaks.
    const n = 12;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const r = 6 + Math.random() * 5;
      const geo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(x, 1.5, z),
        new THREE.Vector3(x + Math.cos(a) * r, 1.5 + Math.random() * 6, z + Math.sin(a) * r),
      ]);
      const mat = new THREE.LineBasicMaterial({ color: i % 2 ? 0xff6a1e : 0x3a3a3a, transparent: true });
      const line = new THREE.Line(geo, mat);
      this.group.add(line);
      this.tracers.push({ line, ttl: 0.4 + Math.random() * 0.4 });
    }
  }

  /** A rising grey smoke puff (for damaged vehicles). */
  smoke(x: number, z: number) {
    const mat = new THREE.MeshBasicMaterial({ color: 0x4a4a4a, transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(PUFF, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x + (Math.random() - 0.5) * 1.5, 1.6, z + (Math.random() - 0.5) * 1.5);
    mesh.scale.setScalar(0.7);
    this.group.add(mesh);
    this.puffs.push({ mesh, ttl: 1.1, max: 1.1 });
  }

  update(dt: number) {
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const t = this.tracers[i];
      t.ttl -= dt;
      (t.line.material as THREE.LineBasicMaterial).opacity = Math.max(0, t.ttl / 0.1);
      if (t.ttl <= 0) {
        this.group.remove(t.line);
        t.line.geometry.dispose();
        (t.line.material as THREE.Material).dispose();
        this.tracers.splice(i, 1);
      }
    }
    for (let i = this.bursts.length - 1; i >= 0; i--) {
      const b = this.bursts[i];
      b.ttl -= dt;
      const k = 1 - b.ttl / b.max; // 0 -> 1
      const pop = 1 - (1 - k) * (1 - k); // ease-out
      b.mesh.scale.setScalar(b.size * (0.3 + 0.7 * pop));
      b.mesh.rotation.z += b.spin * dt;
      (b.mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, b.ttl / b.max);
      if (b.ttl <= 0) {
        this.group.remove(b.mesh);
        (b.mesh.material as THREE.Material).dispose();
        this.bursts.splice(i, 1);
      }
    }
    for (let i = this.puffs.length - 1; i >= 0; i--) {
      const p = this.puffs[i];
      p.ttl -= dt;
      const k = 1 - p.ttl / p.max; // 0 -> 1
      p.mesh.position.y += 5 * dt; // drift up
      p.mesh.scale.setScalar(0.7 + k * 2.8); // billow out
      (p.mesh.material as THREE.MeshBasicMaterial).opacity = 0.55 * (1 - k);
      if (p.ttl <= 0) {
        this.group.remove(p.mesh);
        (p.mesh.material as THREE.Material).dispose();
        this.puffs.splice(i, 1);
      }
    }
  }
}
