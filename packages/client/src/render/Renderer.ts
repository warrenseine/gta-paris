import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';

// Subtle vignette to frame the view and hide the far cull at the edges.
const VignetteShader = {
  uniforms: { tDiffuse: { value: null }, strength: { value: 0.5 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float strength; varying vec2 vUv;
    void main(){
      vec4 c = texture2D(tDiffuse, vUv);
      vec2 d = vUv - 0.5;
      float v = smoothstep(0.85, 0.35, dot(d, d) * strength * 3.0);
      gl_FragColor = vec4(c.rgb * mix(1.0, v, 0.6), c.a);
    }`,
};

export class Renderer {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene: THREE.Scene;
  private sun: THREE.DirectionalLight;
  private composer: EffectComposer;
  private highQuality = true;

  constructor(container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x2b3340);
    // Fog doubles as cheap far-cull + atmosphere.
    this.scene.fog = new THREE.Fog(0x2b3340, 340, 820);

    this.sun = new THREE.DirectionalLight(0xffe9c8, 2.2);
    this.sun.position.set(120, 220, 80);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const S = 240; // shadow frustum half-size — follows the player (setFocus)
    const cam = this.sun.shadow.camera as THREE.OrthographicCamera;
    cam.left = -S;
    cam.right = S;
    cam.top = S;
    cam.bottom = -S;
    cam.near = 10;
    cam.far = 640;
    this.sun.shadow.bias = -0.0004;
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);
    this.scene.add(new THREE.AmbientLight(0x9aa7b5, 1.0));

    // Post-processing chain.
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, new THREE.PerspectiveCamera()));
    const bloom = new UnrealBloomPass(
      new THREE.Vector2(window.innerWidth, window.innerHeight),
      0.7, // strength
      0.5, // radius
      0.72, // threshold — only bright/emissive things bloom (lights, FX)
    );
    this.composer.addPass(bloom);
    this.composer.addPass(new ShaderPass(VignetteShader));
    this.composer.addPass(new OutputPass());
    const smaa = new SMAAPass(window.innerWidth, window.innerHeight);
    this.composer.addPass(smaa);

    this.applyResolution(); // cap internal pixels (big screens stay fast)
    window.addEventListener('resize', this.onResize);
    window.addEventListener('keydown', (e) => {
      if (e.code === 'KeyO') this.setHighQuality(!this.highQuality);
    });
  }

  /**
   * Cap the internal framebuffer to a pixel budget (~1080p) and upscale via CSS,
   * so fullscreen on a 4K/Retina display doesn't render millions of extra pixels
   * through the post-processing chain. Clamped to [0.75, min(DPR,2)].
   */
  private applyResolution() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const BUDGET = 2_100_000; // ~1920x1080 internal pixels
    const cap = Math.min(window.devicePixelRatio || 1, 2);
    const dpr = Math.max(0.75, Math.min(cap, Math.sqrt(BUDGET / (w * h))));
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(w, h);
    this.composer.setPixelRatio(dpr);
    this.composer.setSize(w, h);
  }

  /** Toggle the fancy pipeline (post + shadows) off for performance. */
  setHighQuality(on: boolean) {
    this.highQuality = on;
    this.renderer.shadowMap.enabled = on;
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if ((m as THREE.Mesh & { isMesh?: boolean }).isMesh) m.castShadow = on && m.castShadow;
    });
    this.renderer.shadowMap.needsUpdate = true;
  }

  /** Keep the shadow frustum + sun centred on the player so shadows stay sharp. */
  setFocus(x: number, z: number) {
    if (!this.highQuality) return;
    this.sun.target.position.set(x, 0, z);
    this.sun.position.set(x + 120, 220, z + 80);
  }

  private onResize = () => {
    this.applyResolution();
  };

  render(camera: THREE.Camera) {
    if (this.highQuality) {
      (this.composer.passes[0] as RenderPass).camera = camera;
      this.composer.render();
    } else {
      this.renderer.render(this.scene, camera);
    }
  }

  get aspect(): number {
    return window.innerWidth / window.innerHeight;
  }
}
