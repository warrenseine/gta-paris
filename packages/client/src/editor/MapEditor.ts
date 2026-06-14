import * as THREE from 'three';
import { computeBridges, type CityData } from '@gta/shared';
import { CityRenderer } from '../render/CityRenderer.js';

type Kind = 'building' | 'landmark' | 'tree' | 'road' | 'river' | 'park' | 'bridge';

interface Selection {
  kind: Kind;
  ref: any; // the data object (building/landmark/tree/road point/river point)
}

// In-game map editor: top-down ortho view over a clone of the live CityData.
// Move/rotate/scale/add/delete buildings & trees, nudge landmarks, drag road &
// river vertices, then export a custom-map.json that the client + server load.
export class MapEditor {
  active = false;
  private city: CityData;
  private group = new THREE.Group();
  private cam: THREE.OrthographicCamera;
  private raycaster = new THREE.Raycaster();
  private plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private kind: Kind = 'building';
  private mode: 'select' | 'add' | 'delete' = 'select';
  private sel: Selection | null = null;
  private marker: THREE.Mesh;
  private dragging = false;
  private panning = false;
  private panLast = { x: 0, y: 0 };
  private camCenter = new THREE.Vector3(0, 0, 0);
  private viewSize = 700;
  private autoBridges = true; // recompute bridges from roads until you edit one
  private pendingRoad: { x: number; z: number } | null = null; // first click of a new road
  private bar: HTMLDivElement;
  private dom: HTMLCanvasElement;

  constructor(
    private scene: THREE.Scene,
    private renderer: THREE.WebGLRenderer,
    city: CityData,
    private hide: THREE.Object3D[], // game visuals to hide while editing
  ) {
    this.city = structuredClone(city);
    this.dom = renderer.domElement;
    this.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 4000);
    this.cam.position.set(0, 1500, 0.01);
    this.cam.lookAt(0, 0, 0);

    const ringGeo = new THREE.RingGeometry(3, 4.4, 24);
    this.marker = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0xffe23a, side: THREE.DoubleSide, depthTest: false }));
    this.marker.rotation.x = -Math.PI / 2;
    this.marker.visible = false;
    this.group.add(this.marker);

    this.bar = document.createElement('div');
    this.bar.style.cssText =
      'position:fixed;top:0;left:0;right:0;z-index:50;display:none;padding:8px 12px;gap:8px;' +
      'background:rgba(10,12,16,.92);color:#fff;font:13px system-ui;align-items:center;flex-wrap:wrap;';
    document.body.appendChild(this.bar);

    window.addEventListener('keydown', this.onKey);
    this.dom.addEventListener('pointerdown', this.onDown);
    window.addEventListener('pointermove', this.onMove);
    window.addEventListener('pointerup', this.onUp);
    this.dom.addEventListener('wheel', this.onWheel, { passive: false });
    window.addEventListener('resize', () => this.resize());
  }

  toggle() {
    this.active = !this.active;
    this.bar.style.display = this.active ? 'flex' : 'none';
    for (const o of this.hide) o.visible = !this.active;
    if (this.active) {
      this.rebuild();
      this.scene.add(this.group);
      this.resize();
      this.renderUI();
    } else {
      this.scene.remove(this.group);
    }
  }

  /** Re-render the edited city (called after each change). */
  private rebuild() {
    // Drop the previous render (keep the marker).
    for (let i = this.group.children.length - 1; i >= 0; i--) {
      const c = this.group.children[i];
      if (c !== this.marker) this.group.remove(c);
    }
    this.group.add(new CityRenderer(this.city).group);
    this.placeMarker();
  }

  /** Regenerate bridges from the current roads/river (unless edited by hand). */
  private recomputeBridges() {
    if (this.autoBridges) this.city.bridges = computeBridges(this.city.roads, this.city.river);
  }

  private resize() {
    const a = window.innerWidth / window.innerHeight;
    const h = this.viewSize;
    this.cam.left = -h * a;
    this.cam.right = h * a;
    this.cam.top = h;
    this.cam.bottom = -h;
    this.cam.position.set(this.camCenter.x, 1500, this.camCenter.z + 0.01);
    this.cam.lookAt(this.camCenter.x, 0, this.camCenter.z);
    this.cam.updateProjectionMatrix();
  }

  private pan(dx: number, dz: number) {
    this.camCenter.x += dx;
    this.camCenter.z += dz;
    this.resize();
  }

  render() {
    const fog = this.scene.fog; // fog would swallow the high top-down view
    this.scene.fog = null;
    this.renderer.render(this.scene, this.cam);
    this.scene.fog = fog;
  }

  // ---- input ----------------------------------------------------------------

  private worldAt(e: PointerEvent): THREE.Vector3 {
    const ndc = new THREE.Vector2((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.cam);
    const p = new THREE.Vector3();
    this.raycaster.ray.intersectPlane(this.plane, p);
    return p;
  }

  private onWheel = (e: WheelEvent) => {
    if (!this.active) return;
    e.preventDefault();
    this.viewSize = Math.max(60, Math.min(1600, this.viewSize * (e.deltaY > 0 ? 1.1 : 0.9)));
    this.resize();
  };

  private onDown = (e: PointerEvent) => {
    if (!this.active) return;
    if (e.button === 2 || e.button === 1) {
      this.panning = true;
      this.panLast = { x: e.clientX, y: e.clientY };
      return;
    }
    const w = this.worldAt(e);
    if (this.mode === 'add') {
      this.addAt(w.x, w.z);
    } else if (this.mode === 'delete') {
      this.pick(w.x, w.z);
      this.deleteSel();
    } else {
      this.pick(w.x, w.z);
      this.dragging = !!this.sel;
    }
  };

  private onMove = (e: PointerEvent) => {
    if (!this.active) return;
    if (this.panning) {
      const dx = e.clientX - this.panLast.x;
      const dy = e.clientY - this.panLast.y;
      this.panLast = { x: e.clientX, y: e.clientY };
      const scale = (this.viewSize * 2) / window.innerHeight;
      this.camCenter.x -= dx * scale;
      this.camCenter.z -= dy * scale;
      this.resize();
      return;
    }
    if (this.dragging && this.sel) {
      const w = this.worldAt(e);
      this.moveSel(w.x, w.z);
      this.rebuild();
    }
  };

  private onUp = () => {
    this.panning = false;
    this.dragging = false;
  };

  private onKey = (e: KeyboardEvent) => {
    if (e.code === 'Backquote' || e.code === 'F2') {
      this.toggle();
      return;
    }
    if (!this.active) return;
    // Arrow keys pan the view.
    const panStep = this.viewSize * 0.12;
    if (e.code === 'ArrowLeft') return this.pan(-panStep, 0);
    if (e.code === 'ArrowRight') return this.pan(panStep, 0);
    if (e.code === 'ArrowUp') return this.pan(0, -panStep);
    if (e.code === 'ArrowDown') return this.pan(0, panStep);
    const k = e.key.toLowerCase();
    if (k === '1') this.setKind('building');
    else if (k === '2') this.setKind('landmark');
    else if (k === '3') this.setKind('tree');
    else if (k === '4') this.setKind('road');
    else if (k === '5') this.setKind('river');
    else if (k === '6') this.setKind('park');
    else if (k === '7') this.setKind('bridge');
    else if (k === 'a') this.setMode(this.mode === 'add' ? 'select' : 'add');
    else if (k === 'd') this.setMode(this.mode === 'delete' ? 'select' : 'delete');
    else if (k === 'q' || k === '[') this.rotateSel(-Math.PI / 12);
    else if (k === 'e' || k === ']') this.rotateSel(Math.PI / 12);
    else if (k === '-') this.scaleSel(0.9);
    else if (k === '=' || k === '+') this.scaleSel(1.1);
    else if (k === 'x' || e.code === 'Delete' || e.code === 'Backspace') this.deleteSel();
    else if (e.code === 'KeyS' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      this.exportMap();
    } else return;
    this.renderUI();
  };

  // ---- editing --------------------------------------------------------------

  private setKind(k: Kind) {
    this.kind = k;
    this.sel = null;
    this.pendingRoad = null;
    this.marker.visible = false;
  }
  private setMode(m: 'select' | 'add' | 'delete') {
    this.mode = m;
    this.pendingRoad = null;
  }

  private pick(x: number, z: number) {
    const near = <T>(arr: T[], gx: (t: T) => number, gz: (t: T) => number, max: number) => {
      let best: T | null = null;
      let bd = max;
      for (const t of arr) {
        const d = Math.hypot(gx(t) - x, gz(t) - z);
        if (d < bd) {
          bd = d;
          best = t;
        }
      }
      return best;
    };
    let ref: any = null;
    if (this.kind === 'building') ref = near(this.city.buildings, (b) => b.cx, (b) => b.cz, 30);
    else if (this.kind === 'landmark') ref = near(this.city.landmarks, (l) => l.position.x, (l) => l.position.z, 60);
    else if (this.kind === 'tree') ref = near(this.city.trees, (t) => t.x, (t) => t.z, 8);
    else if (this.kind === 'park') ref = near(this.city.parks, (p) => p.cx, (p) => p.cz, 90);
    else if (this.kind === 'bridge') ref = near(this.city.bridges, (b) => b.x, (b) => b.z, 40);
    else if (this.kind === 'road') ref = this.nearestPoint(this.city.roads.flatMap((r) => r.points), x, z, 40);
    else if (this.kind === 'river') ref = this.nearestPoint(this.city.river.points, x, z, 60);
    this.sel = ref ? { kind: this.kind, ref } : null;
    this.placeMarker();
  }

  private nearestPoint(pts: { x: number; z: number }[], x: number, z: number, max: number) {
    let best: { x: number; z: number } | null = null;
    let bd = max;
    for (const p of pts) {
      const d = Math.hypot(p.x - x, p.z - z);
      if (d < bd) {
        bd = d;
        best = p;
      }
    }
    return best;
  }

  private selPos(): { x: number; z: number } | null {
    if (!this.sel) return null;
    const r = this.sel.ref;
    if (this.sel.kind === 'building') return { x: r.cx, z: r.cz };
    if (this.sel.kind === 'landmark') return { x: r.position.x, z: r.position.z };
    if (this.sel.kind === 'park') return { x: r.cx, z: r.cz };
    return { x: r.x, z: r.z };
  }

  private moveSel(x: number, z: number) {
    if (!this.sel) return;
    const r = this.sel.ref;
    const k = this.sel.kind;
    if (k === 'building' || k === 'park') {
      r.cx = x;
      r.cz = z;
    } else if (k === 'landmark') {
      r.position.x = x;
      r.position.z = z;
    } else {
      r.x = x;
      r.z = z;
    }
    if (k === 'bridge') this.autoBridges = false;
    if (k === 'road' || k === 'river') this.recomputeBridges();
    this.placeMarker();
  }

  private rotateSel(da: number) {
    if (!this.sel) return;
    const r = this.sel.ref;
    const k = this.sel.kind;
    if (k === 'building' || k === 'landmark' || k === 'park' || k === 'bridge') {
      r.rotationY = (r.rotationY ?? 0) + da;
      if (k === 'bridge') this.autoBridges = false;
      this.rebuild();
    }
  }

  private scaleSel(f: number) {
    if (!this.sel) return;
    const r = this.sel.ref;
    const k = this.sel.kind;
    if (k === 'building') {
      r.hw *= f;
      r.hd *= f;
      r.height *= f;
    } else if (k === 'landmark') {
      r.scale = (r.scale ?? 1) * f;
    } else if (k === 'park') {
      r.hw *= f;
      r.hd *= f;
    } else if (k === 'bridge') {
      r.length *= f;
      r.width *= f;
      this.autoBridges = false;
    } else return;
    this.rebuild();
  }

  private addAt(x: number, z: number) {
    if (this.kind === 'building') {
      const id = Math.max(0, ...this.city.buildings.map((b) => b.id)) + 1;
      this.city.buildings.push({ id, cx: x, cz: z, hw: 9, hd: 9, height: 24, rotationY: 0, paletteId: 0 });
    } else if (this.kind === 'tree') {
      this.city.trees.push({ x, z });
    } else if (this.kind === 'park') {
      this.city.parks.push({ name: 'Park', cx: x, cz: z, hw: 28, hd: 28 });
    } else if (this.kind === 'bridge') {
      this.city.bridges.push({ x, z, rotationY: 0, length: 60, width: 18 });
      this.autoBridges = false;
    } else if (this.kind === 'road') {
      // First click sets the start; second click lays the segment.
      if (!this.pendingRoad) {
        this.pendingRoad = { x, z };
        this.marker.visible = true;
        this.marker.position.set(x, 2, z);
        return;
      }
      this.city.roads.push({
        name: `road-${this.city.roads.length}`,
        points: [{ ...this.pendingRoad }, { x, z }],
        width: 12,
      });
      this.pendingRoad = null;
      this.recomputeBridges();
    } else return;
    this.rebuild();
  }

  private deleteSel() {
    if (!this.sel) return;
    const r = this.sel.ref;
    const k = this.sel.kind;
    if (k === 'building') this.city.buildings = this.city.buildings.filter((b) => b !== r);
    else if (k === 'tree') this.city.trees = this.city.trees.filter((t) => t !== r);
    else if (k === 'park') this.city.parks = this.city.parks.filter((p) => p !== r);
    else if (k === 'bridge') {
      this.city.bridges = this.city.bridges.filter((b) => b !== r);
      this.autoBridges = false;
    } else return; // landmarks / road & river points aren't deletable
    this.sel = null;
    this.marker.visible = false;
    this.rebuild();
  }

  private placeMarker() {
    const p = this.selPos();
    if (!p) {
      this.marker.visible = false;
      return;
    }
    this.marker.visible = true;
    this.marker.position.set(p.x, 2, p.z);
  }

  private exportMap() {
    this.recomputeBridges();
    const blob = new Blob([JSON.stringify({ enabled: true, city: this.city })], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'custom-map.json';
    a.click();
    URL.revokeObjectURL(a.href);
  }

  private renderUI() {
    const btn = (label: string, on: boolean) =>
      `<span style="padding:3px 8px;border-radius:5px;background:${on ? '#ffcf4d' : 'rgba(255,255,255,.12)'};color:${on ? '#000' : '#fff'}">${label}</span>`;
    this.bar.innerHTML =
      "<b>MAP EDITOR</b><span style='opacity:.7'>(` exit)</span>" +
      `<span>type:</span>` +
      ['building', 'landmark', 'tree', 'road', 'river', 'park', 'bridge'].map((k, i) => btn(`${i + 1} ${k}`, this.kind === k)).join('') +
      `<span style="margin-left:10px">mode:</span>` +
      btn('select', this.mode === 'select') +
      btn('A add', this.mode === 'add') +
      btn('D delete', this.mode === 'delete') +
      `<span style="margin-left:10px;opacity:.8">drag=move · Q/E rotate · -/= scale · X delete · right-drag/arrows pan · wheel zoom</span>` +
      `<span id="ed-export" style="margin-left:auto;padding:4px 12px;border-radius:5px;background:#39d98a;color:#000;cursor:pointer;pointer-events:auto">Export (⌘S)</span>`;
    const exp = this.bar.querySelector('#ed-export') as HTMLElement;
    exp.onclick = () => this.exportMap();
  }
}
