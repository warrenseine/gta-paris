import * as THREE from 'three';

export class Renderer {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene: THREE.Scene;

  constructor(container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x9fb4c4);
    // Fog doubles as cheap far-cull + atmosphere.
    this.scene.fog = new THREE.Fog(0x9fb4c4, 340, 760);

    const sun = new THREE.DirectionalLight(0xfff4e0, 2.0);
    sun.position.set(120, 200, 80);
    this.scene.add(sun);
    this.scene.add(new THREE.AmbientLight(0x9aa7b5, 1.1));

    window.addEventListener('resize', this.onResize);
  }

  private onResize = () => {
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  };

  render(camera: THREE.Camera) {
    this.renderer.render(this.scene, camera);
  }

  get aspect(): number {
    return window.innerWidth / window.innerHeight;
  }
}
