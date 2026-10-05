import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { loadGltf } from '../world/models.js';
import { buildCarModel } from '../world/carBuild.js';
import { createLivery } from '../world/livery.js';
import { CAR_MODELS } from '../world/carModels.js';

/**
 * The showroom: the car on a turntable under studio light, rendered straight
 * to the canvas in place of the world while the garage is open.
 *
 * A separate scene with its own small environment map, so it looks the same
 * whatever the weather behind the menu is doing. Drag to turn the car.
 */
export class GarageStage {
  constructor(renderer) {
    this.renderer = renderer;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0c0c0e);
    this.camera = new THREE.PerspectiveCamera(34, 1, 0.1, 80);
    this.camera.position.set(5.6, 1.9, 6.4);
    this.camera.lookAt(0, 0.75, 0);

    const pmrem = new THREE.PMREMGenerator(renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.85;
    pmrem.dispose();

    const key = new THREE.DirectionalLight(0xfff2e0, 2.4);
    key.position.set(-4, 7, 5);
    const rim = new THREE.DirectionalLight(0xc6f000, 1.1);
    rim.position.set(5, 3, -6);
    const fill = new THREE.HemisphereLight(0xdde6ff, 0x1a1a1c, 0.35);
    this.scene.add(key, rim, fill);

    // The floor: a dark disc with a lime ring, and a soft pool of light.
    const floor = new THREE.Mesh(
      new THREE.CylinderGeometry(3.6, 3.6, 0.14, 64),
      new THREE.MeshStandardMaterial({ color: 0x151517, roughness: 0.55, metalness: 0.2 })
    );
    floor.position.y = -0.07;
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(3.45, 0.035, 8, 96),
      new THREE.MeshBasicMaterial({ color: 0xc6f000 })
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.005;
    this.scene.add(floor, ring);

    this.turntable = new THREE.Group();
    this.scene.add(this.turntable);

    this.livery = createLivery();
    this.model = null;
    this.angle = -0.6;
    this.spinning = true;
    this._ticket = 0;
    this._drag = null;
    this.id = null;
  }

  /** Put a car on the turntable. Resolves when it is there. */
  async show(id, paint, livery) {
    const def = CAR_MODELS[id];
    if (!def) return;
    this.id = id;
    const ticket = ++this._ticket;
    let gltf;
    try {
      gltf = await loadGltf(def.model);
    } catch {
      return;
    }
    if (ticket !== this._ticket) return;
    if (this.model) this.turntable.remove(this.model.group);
    this.model = buildCarModel(gltf.scene, def, { shadows: false });
    for (const material of this.model.paint) this.livery.apply(material);
    this.turntable.add(this.model.group);
    // Bigger vehicles need the camera further back.
    const size = new THREE.Box3().setFromObject(this.model.group).getSize(new THREE.Vector3());
    this.fit = Math.max(1, Math.max(size.x, size.z) / 4.4);
    this.resize(this.width ?? window.innerWidth, this.height ?? window.innerHeight);
    this.setLook(paint, livery);
    // Lamps: the showroom has them lit a little.
    for (const m of this.model.head) m.emissiveIntensity = 0.9;
    for (const m of this.model.tail) m.emissiveIntensity = 1.1;
  }

  setLook(paint, livery) {
    if (!this.model) return;
    this.paint = paint;
    for (const m of this.model.paint) m.color.set(paint);
    this.livery.set(livery, paint, '07');
  }

  resize(width, height) {
    this.width = width;
    this.height = height;
    this.camera.aspect = width / height;
    // A narrow screen, or a big vehicle, needs the car further off to fit.
    this.camera.position.set(5.6, 1.9, 6.4).multiplyScalar((width / height < 1 ? 1.5 : 1) * (this.fit ?? 1));
    this.camera.lookAt(0, 0.75, 0);
    this.camera.updateProjectionMatrix();
  }

  /** Pointer-drag turns the car; call with the canvas element. */
  bindDrag(element) {
    element.addEventListener('pointerdown', (e) => {
      this._drag = { x: e.clientX, angle: this.angle };
      this.spinning = false;
      element.setPointerCapture?.(e.pointerId);
    });
    element.addEventListener('pointermove', (e) => {
      if (this._drag) this.angle = this._drag.angle + (e.clientX - this._drag.x) * 0.01;
    });
    const end = () => {
      this._drag = null;
      clearTimeout(this._resume);
      this._resume = setTimeout(() => (this.spinning = true), 2500);
    };
    element.addEventListener('pointerup', end);
    element.addEventListener('pointercancel', end);
  }

  render(dt) {
    if (this.spinning) this.angle += dt * 0.4;
    this.turntable.rotation.y = this.angle;
    if (this.model) this.livery.track(this.model.group);
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.render(this.scene, this.camera);
  }
}
