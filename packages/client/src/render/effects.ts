import * as THREE from 'three';
import { COLORS } from './materials.js';

interface Tracer {
  line: THREE.Line;
  ttl: number;
}

// Pooled bullet tracers + hit sparks.
export class Effects {
  private tracers: Tracer[] = [];
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

  explosion(x: number, z: number) {
    // Expanding debris lines + a vertical flash, fading fast.
    const n = 10;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const r = 5 + Math.random() * 3;
      const geo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(x, 1, z),
        new THREE.Vector3(x + Math.cos(a) * r, 1 + Math.random() * 4, z + Math.sin(a) * r),
      ]);
      const mat = new THREE.LineBasicMaterial({ color: i % 2 ? 0xff8a2a : 0xffd23a, transparent: true });
      const line = new THREE.Line(geo, mat);
      this.group.add(line);
      this.tracers.push({ line, ttl: 0.4 + Math.random() * 0.3 });
    }
    const flashGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(x, 0.2, z),
      new THREE.Vector3(x, 10, z),
    ]);
    const flash = new THREE.Line(flashGeo, new THREE.LineBasicMaterial({ color: 0xffe08a, transparent: true }));
    this.group.add(flash);
    this.tracers.push({ line: flash, ttl: 0.5 });
  }

  update(dt: number) {
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const t = this.tracers[i];
      t.ttl -= dt;
      const mat = t.line.material as THREE.LineBasicMaterial;
      mat.opacity = Math.max(0, t.ttl / 0.1);
      if (t.ttl <= 0) {
        this.group.remove(t.line);
        t.line.geometry.dispose();
        (t.line.material as THREE.Material).dispose();
        this.tracers.splice(i, 1);
      }
    }
  }
}
