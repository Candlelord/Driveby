import * as THREE from 'three';
import { softDotTexture } from './textures.js';

/**
 * The things only an extreme weather event puts on screen: a funnel cloud, wind
 * debris, and aurora ribbons. All driven by single numbers on the blended
 * profile, all hidden and costing nothing when their event is not running.
 */
export class EventVisuals {
  constructor(scene, tier) {
    this._buildFunnel(scene);
    this._buildDebris(scene, Math.round(tier.rainStreaks * 0.35));
    this._buildAurora(scene);
  }

  /**
   * A tapered, twisted column. It lives in the sky group's frame conceptually —
   * but simply parking it far ahead and to one side reads correctly, since a
   * tornado that stays put on the horizon is exactly what you would see.
   */
  _buildFunnel(scene) {
    this.funnelMaterial = new THREE.MeshBasicMaterial({
      color: 0x6d6f5e,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      side: THREE.DoubleSide,
      fog: false,
    });

    // Open-ended cone, wide at the cloud base and narrow at the ground.
    const geometry = new THREE.CylinderGeometry(26, 5, 150, 14, 6, true);
    const position = geometry.attributes.position;
    for (let i = 0; i < position.count; i++) {
      const y = position.getY(i);
      const t = (y + 75) / 150;
      // Lean and twist the column so it is not a plain cone.
      const twist = (1 - t) * 1.6;
      const x = position.getX(i);
      const z = position.getZ(i);
      position.setX(i, x * Math.cos(twist) - z * Math.sin(twist) + (1 - t) * 14);
      position.setZ(i, x * Math.sin(twist) + z * Math.cos(twist));
    }
    position.needsUpdate = true;
    geometry.computeVertexNormals();

    this.funnel = new THREE.Mesh(geometry, this.funnelMaterial);
    this.funnel.frustumCulled = false;
    this.funnel.visible = false;
    scene.add(this.funnel);
  }

  /** Tumbling flecks torn along by the wind. */
  _buildDebris(scene, count) {
    this.debrisCount = count;
    this.debrisPositions = new Float32Array(count * 3);
    this.debrisSpin = new Float32Array(count * 2);

    for (let i = 0; i < count; i++) {
      this.debrisPositions[i * 3] = rand(-55, 55);
      this.debrisPositions[i * 3 + 1] = rand(0, 30);
      this.debrisPositions[i * 3 + 2] = rand(-150, 25);
      this.debrisSpin[i * 2] = rand(0, Math.PI * 2);
      this.debrisSpin[i * 2 + 1] = rand(0.5, 2.5);
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(this.debrisPositions, 3));
    geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 400);

    this.debrisMaterial = new THREE.PointsMaterial({
      color: 0x8a7d63,
      map: softDotTexture(),
      size: 0.9,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      fog: true,
    });

    this.debrisGeometry = geometry;
    this.debris = new THREE.Points(geometry, this.debrisMaterial);
    this.debris.frustumCulled = false;
    this.debris.visible = false;
    scene.add(this.debris);
  }

  /**
   * Slow colour ribbons across the sky. Parented to a group the caller parks on
   * the camera, so they sit at infinity like the rest of the sky.
   */
  _buildAurora(scene) {
    this.auroraGroup = new THREE.Group();
    this.auroraGroup.visible = false;
    scene.add(this.auroraGroup);

    this.auroraMaterials = [];
    const palette = [0x46ff9a, 0x7a5cff, 0xff5ca8];

    for (let band = 0; band < 3; band++) {
      const segments = 40;
      const positions = new Float32Array((segments + 1) * 2 * 3);
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

      const indices = [];
      for (let i = 0; i < segments; i++) {
        const a = i * 2;
        indices.push(a, a + 1, a + 3, a, a + 3, a + 2);
      }
      geometry.setIndex(indices);
      geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1200);

      const material = new THREE.MeshBasicMaterial({
        color: palette[band],
        transparent: true,
        opacity: 0,
        depthWrite: false,
        depthTest: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        fog: false,
      });

      const mesh = new THREE.Mesh(geometry, material);
      mesh.renderOrder = -3;
      mesh.frustumCulled = false;
      mesh.userData = { positions, segments, band };
      this.auroraGroup.add(mesh);
      this.auroraMaterials.push(material);
    }
  }

  update(state, camera) {
    const live = state.live;
    this._updateFunnel(state, live);
    this._updateDebris(state, live);
    this._updateAurora(state, live, camera);
  }

  _updateFunnel(state, live) {
    const amount = live.funnel;
    this.funnel.visible = amount > 0.02;
    if (!this.funnel.visible) return;

    // Comes in from the horizon on one side and closes as the event builds.
    const near = live.funnelNear;
    const distance = 620 - near * 480;
    this.funnel.position.set(-120 + near * 60, 46, -distance);
    this.funnel.rotation.y = state.time * 0.9;
    this.funnel.scale.setScalar(0.7 + near * 0.6);
    this.funnelMaterial.opacity = Math.min(1, amount) * 0.55;
  }

  _updateDebris(state, live) {
    const amount = live.debris;
    this.debris.visible = amount > 0.02;
    if (!this.debris.visible) return;

    const speed = 26 + amount * 60;
    const drift = (state.speed + speed) * state.dt;
    const lift = live.wind * 6 * state.dt;

    for (let i = 0; i < this.debrisCount; i++) {
      const pi = i * 3;
      let x = this.debrisPositions[pi] + live.wind * 22 * state.dt;
      let y = this.debrisPositions[pi + 1] + Math.sin(state.time * this.debrisSpin[i * 2 + 1] + this.debrisSpin[i * 2]) * 3 * state.dt + lift;
      let z = this.debrisPositions[pi + 2] + drift;

      if (x > 55) x -= 110;
      if (x < -55) x += 110;
      if (y > 32) y -= 32;
      if (y < 0) y += 32;
      if (z > 25) z -= 175;

      this.debrisPositions[pi] = x;
      this.debrisPositions[pi + 1] = y;
      this.debrisPositions[pi + 2] = z;
    }

    this.debrisGeometry.setDrawRange(0, Math.round(this.debrisCount * Math.min(1, amount)));
    this.debrisGeometry.attributes.position.needsUpdate = true;
    this.debrisMaterial.opacity = Math.min(1, amount) * 0.55;
    this.debrisMaterial.size = 0.7 + amount * 0.8;
  }

  _updateAurora(state, live, camera) {
    const amount = live.aurora;
    this.auroraGroup.visible = amount > 0.02;
    if (!this.auroraGroup.visible) return;

    this.auroraGroup.position.copy(camera.position);
    this.auroraGroup.rotation.y = state.heading;

    for (const mesh of this.auroraGroup.children) {
      const { positions, segments, band } = mesh.userData;
      const radius = 620 - band * 40;
      const phase = state.time * (0.05 + band * 0.015);
      let p = 0;

      for (let i = 0; i <= segments; i++) {
        // A shallow arc across the northern sky rather than a full ring.
        const angle = -1.5 + (i / segments) * 3.0;
        const wave =
          Math.sin(angle * 2.4 + phase * 3 + band) * 0.5 +
          Math.sin(angle * 5.1 - phase * 4.5 + band * 2) * 0.25;
        const baseY = 150 + band * 55 + wave * 70;
        const height = 190 + wave * 90;

        const x = Math.sin(angle) * radius;
        const z = -Math.cos(angle) * radius;
        positions[p++] = x;
        positions[p++] = baseY;
        positions[p++] = z;
        positions[p++] = x;
        positions[p++] = baseY + height;
        positions[p++] = z;
      }

      mesh.geometry.attributes.position.needsUpdate = true;
      mesh.material.opacity = amount * (0.16 - band * 0.03);
    }
  }
}

function rand(min, max) {
  return min + Math.random() * (max - min);
}
