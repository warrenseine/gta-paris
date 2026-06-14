import * as THREE from 'three';
import { Interpolation } from '../net/Interpolation.js';
import { makePlayerMesh } from './views.js';
import { COLORS } from '../render/materials.js';

// A non-local player: interpolated mesh + floating nickname label.
export class RemotePlayer {
  mesh: THREE.Group;
  label: THREE.Sprite;
  interp = new Interpolation();

  constructor(scene: THREE.Scene, nickname: string) {
    this.mesh = makePlayerMesh(COLORS.remote);
    this.label = makeLabel(nickname);
    this.label.position.y = 2.8;
    this.mesh.add(this.label);
    scene.add(this.mesh);
  }

  update(now: number) {
    const s = this.interp.sample(now);
    if (!s) return;
    this.mesh.position.set(s.x, 0, s.z);
    this.mesh.rotation.y = s.rotY;
  }

  dispose(scene: THREE.Scene) {
    scene.remove(this.mesh);
  }
}

function makeLabel(text: string): THREE.Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext('2d')!;
  ctx.font = 'bold 32px system-ui, sans-serif';
  ctx.fillStyle = '#fff';
  ctx.strokeStyle = 'rgba(0,0,0,.8)';
  ctx.lineWidth = 5;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.strokeText(text, 128, 32);
  ctx.fillText(text, 128, 32);
  const tex = new THREE.CanvasTexture(canvas);
  tex.minFilter = THREE.LinearFilter;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false }));
  sprite.scale.set(8, 2, 1);
  return sprite;
}
