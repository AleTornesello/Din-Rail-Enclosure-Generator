import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { BuildResult, MeshData } from './geometry/enclosure';

const PART_COLORS: Record<string, number> = {
  base: 0x3d4f66,
  cover: 0xe8e4da,
  body: 0xe8e4da,
};

export class Viewer {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private controls: OrbitControls;
  private group = new THREE.Group();
  private railMesh: THREE.Mesh | null = null;
  private partMeshes = new Map<string, THREE.Mesh>();
  private grid: THREE.GridHelper;
  private clip = new THREE.Plane(new THREE.Vector3(-1, 0, 0), 0);
  private explode = 0;
  private showRail = true;
  private section = false;
  private framed = false;
  private last: BuildResult | null = null;
  private inset = 0;

  constructor(private host: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.localClippingEnabled = true;
    host.appendChild(this.renderer.domElement);

    this.camera = new THREE.PerspectiveCamera(35, 1, 1, 5000);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;

    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x8090a0, 1.6));
    const key = new THREE.DirectionalLight(0xffffff, 1.8);
    key.position.set(150, 220, 260);
    this.scene.add(key);
    const fill = new THREE.DirectionalLight(0xffffff, 0.6);
    fill.position.set(-200, -80, 120);
    this.scene.add(fill);

    this.grid = new THREE.GridHelper(400, 40, 0x8a94a3, 0xc4cad3);
    this.grid.rotation.x = Math.PI / 2; // lie in the XY (mounting plate) plane
    (this.grid.material as THREE.Material).transparent = true;
    (this.grid.material as THREE.Material).opacity = 0.35;
    this.scene.add(this.grid);
    this.scene.add(this.group);

    new ResizeObserver(() => this.resize()).observe(host);
    this.resize();
    const loop = () => {
      this.controls.update();
      this.renderer.render(this.scene, this.camera);
      requestAnimationFrame(loop);
    };
    loop();
  }

  private resize(): void {
    const w = this.host.clientWidth || 1;
    const h = this.host.clientHeight || 1;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    if (this.inset > 0 && this.inset < w / 2) this.camera.setViewOffset(w, h, -this.inset / 2, 0, w, h);
    else this.camera.clearViewOffset();
    this.camera.updateProjectionMatrix();
  }

  private geometry(m: MeshData): THREE.BufferGeometry {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(m.positions, 3));
    geo.setIndex(new THREE.BufferAttribute(m.indices, 1));
    const flat = geo.toNonIndexed();
    flat.computeVertexNormals();
    geo.dispose();
    return flat;
  }

  setResult(result: BuildResult, railDepth: number): void {
    this.last = result;
    for (const mesh of this.partMeshes.values()) {
      this.group.remove(mesh);
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
    }
    this.partMeshes.clear();
    for (const part of result.parts) {
      const mat = new THREE.MeshStandardMaterial({
        color: PART_COLORS[part.id] ?? 0xcccccc,
        roughness: 0.6,
        metalness: 0.05,
        side: THREE.DoubleSide,
        clippingPlanes: this.section ? [this.clip] : [],
      });
      const mesh = new THREE.Mesh(this.geometry(part), mat);
      mesh.name = part.id;
      this.partMeshes.set(part.id, mesh);
      this.group.add(mesh);
    }
    if (this.railMesh) {
      this.group.remove(this.railMesh);
      this.railMesh.geometry.dispose();
    }
    this.railMesh = new THREE.Mesh(
      this.geometry(result.rail),
      new THREE.MeshStandardMaterial({ color: 0xb8bec6, metalness: 0.7, roughness: 0.35, side: THREE.DoubleSide }),
    );
    this.railMesh.visible = this.showRail;
    this.group.add(this.railMesh);
    this.grid.position.z = -railDepth - 0.01;
    this.applyExplode();
    if (!this.framed) {
      this.frame();
      this.framed = true;
    }
  }

  private applyExplode(): void {
    const depth = this.last?.dims.depth ?? 50;
    const cover = this.partMeshes.get('cover');
    if (cover) cover.position.z = this.explode * depth * 0.8;
    if (this.railMesh) this.railMesh.position.z = -this.explode * 15;
  }

  setExplode(v: number): void {
    this.explode = v;
    this.applyExplode();
  }

  setShowRail(v: boolean): void {
    this.showRail = v;
    if (this.railMesh) this.railMesh.visible = v;
  }

  setSection(v: boolean): void {
    this.section = v;
    for (const mesh of this.partMeshes.values()) {
      (mesh.material as THREE.MeshStandardMaterial).clippingPlanes = v ? [this.clip] : [];
    }
  }

  /** Points the camera at the enclosure from a preset direction. */
  frame(view: 'iso' | 'front' | 'side' | 'top' = 'iso'): void {
    const d = this.last?.dims ?? { width: 70, height: 90, depth: 58 };
    const size = Math.max(d.width, d.height, d.depth);
    const target = new THREE.Vector3(0, 0, d.depth / 2);
    const dir = {
      iso: new THREE.Vector3(-1.3, 0.8, 2),
      front: new THREE.Vector3(0, 0, 1),
      side: new THREE.Vector3(1, 0, 0),
      top: new THREE.Vector3(0, 1, 0.001),
    }[view].normalize();
    this.controls.target.copy(target);
    this.camera.position.copy(target).addScaledVector(dir, size * 2.9);
    this.camera.near = size / 50;
    this.camera.far = size * 50;
    this.camera.updateProjectionMatrix();
    this.controls.update();
  }

  /** Keeps the model centred in the part of the viewport not covered by the panel. */
  setInsetLeft(px: number): void {
    this.inset = px;
    this.resize();
  }
}
