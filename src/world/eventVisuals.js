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
   * The funnel: two counter-rotating shells and a debris skirt where it lands.
   *
   * A single opaque cone was the whole thing before, and it failed in two
   * specific ways. It was cut off dead straight wherever the terrain occluded
   * it, so at close range it read as a pipe hanging in the air rather than
   * something touching the ground; and being very nearly axisymmetric, no
   * amount of spinning it about its own axis produced any visible motion.
   *
   * So: the skirt is a wide, faint flare at the base that both hides that
   * intersection and supplies the thing a viewer actually reads as ground
   * contact — a boil of lifted dirt. The two shells turn at different rates
   * and in opposite directions, which is what makes the column look like it
   * is rotating instead of merely standing there. And alpha is baked per
   * vertex so the top feathers into the cloud deck rather than ending, which
   * the art direction asks for everywhere else too.
   */
  _buildFunnel(scene) {
    this.funnelGroup = new THREE.Group();
    this.funnelGroup.visible = false;
    scene.add(this.funnelGroup);

    this.funnelShells = [];
    this.funnelMaterials = [];

    // Inner is dense and tight; outer is a wider, fainter haze around it, and
    // the pair reading against each other is most of the sense of depth.
    // Dark. A funnel is a silhouette against a lit sky, and the previous
    // mid-grey sat at almost exactly the luminance of the storm veil behind
    // it, which is why it read as a smudge rather than a shape.
    for (const [topRadius, bottomRadius, alpha, tint] of [
      [30, 6, 1, 0x41443a],
      [46, 13, 0.5, 0x5f6356],
    ]) {
      const geometry = twistedColumn(topRadius, bottomRadius, 190);
      const material = new THREE.MeshBasicMaterial({
        color: tint,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        side: THREE.DoubleSide,
        vertexColors: true, // carries the vertical alpha feather
        fog: false,
      });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.frustumCulled = false;
      mesh.userData.alpha = alpha;
      this.funnelGroup.add(mesh);
      this.funnelShells.push(mesh);
      this.funnelMaterials.push(material);
    }

    // The skirt. Wide, low, and open at the top so it reads as a cloud of
    // lifted ground rather than a cone sitting on the grass.
    const skirt = new THREE.CylinderGeometry(9, 40, 26, 16, 3, true);
    paintVerticalAlpha(skirt, 26, (t) => (1 - t) ** 1.4 * 0.85);
    this.skirtMaterial = new THREE.MeshBasicMaterial({
      color: 0x8a8267,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      side: THREE.DoubleSide,
      vertexColors: true,
      fog: false,
    });
    this.funnelSkirt = new THREE.Mesh(skirt, this.skirtMaterial);
    this.funnelSkirt.frustumCulled = false;
    this.funnelGroup.add(this.funnelSkirt);
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
    this.funnelGroup.visible = amount > 0.02;
    if (!this.funnelGroup.visible) return;

    // Comes in from the horizon on one side and closes as the event builds.
    const near = live.funnelNear;
    const distance = 620 - near * 470;
    const scale = 0.8 + near * 0.9;

    // Sit the column so its base lands on the ground rather than at a fixed
    // height: the whole point of the skirt is that the two meet.
    // Tracks in toward the road as it closes, rather than staying parked on
    // one bearing — a tornado that never gets nearer is scenery, not an event.
    this.funnelGroup.position.set(-150 + near * 105, HALF_COLUMN * scale, -distance);
    this.funnelGroup.scale.setScalar(scale);

    // A tornado is never plumb. A slow lean, on its own clock so it does not
    // beat against the rotation.
    this.funnelGroup.rotation.z = Math.sin(state.time * 0.23) * 0.1;
    this.funnelGroup.rotation.x = Math.cos(state.time * 0.17) * 0.06;

    const opacity = Math.min(1, amount);
    for (let i = 0; i < this.funnelShells.length; i++) {
      const shell = this.funnelShells[i];
      // Opposed and at different rates: matched shells would lock together and
      // the column would go back to looking rigid.
      shell.rotation.y = state.time * (i === 0 ? 1.15 : -0.72);
      this.funnelMaterials[i].opacity = opacity * 0.82 * shell.userData.alpha;
    }

    // The skirt sits at the foot of the column, spinning the other way again
    // and swelling as the funnel bears down.
    this.funnelSkirt.position.y = -HALF_COLUMN;
    this.funnelSkirt.rotation.y = -state.time * 0.5;
    this.funnelSkirt.scale.setScalar(0.85 + near * 0.5);
    this.skirtMaterial.opacity = opacity * (0.3 + near * 0.45);
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

const COLUMN_HEIGHT = 190;
const HALF_COLUMN = COLUMN_HEIGHT / 2;

/**
 * An open cone, twisted and leaned along its length, with a vertical alpha
 * feather baked in.
 *
 * The twist is what stops it reading as a traffic cone: it makes the
 * silhouette change as the shell turns, which is the only way a shape this
 * close to axisymmetric can show rotation at all.
 */
function twistedColumn(topRadius, bottomRadius, height) {
  const geometry = new THREE.CylinderGeometry(topRadius, bottomRadius, height, 18, 10, true);
  const position = geometry.attributes.position;
  const half = height / 2;

  for (let i = 0; i < position.count; i++) {
    const t = (position.getY(i) + half) / height; // 0 at the ground, 1 at the cloud
    const twist = (1 - t) * 2.1;
    const x = position.getX(i);
    const z = position.getZ(i);
    // Waist: real funnels pinch part-way down rather than tapering evenly.
    const pinch = 1 - Math.sin(t * Math.PI) * 0.22;
    position.setX(i, (x * Math.cos(twist) - z * Math.sin(twist)) * pinch + (1 - t) * 16);
    position.setZ(i, (x * Math.sin(twist) + z * Math.cos(twist)) * pinch);
  }
  position.needsUpdate = true;
  geometry.computeVertexNormals();

  // Dense through the body, feathering out into the cloud deck at the top and
  // into the debris skirt at the bottom, so neither end is an edge.
  paintVerticalAlpha(geometry, height, (t) => {
    const top = 1 - smoothRamp((t - 0.72) / 0.28);
    const bottom = smoothRamp(t / 0.08);
    return Math.min(top, 0.35 + bottom * 0.65);
  });
  return geometry;
}

/**
 * Write a per-vertex RGBA where alpha comes from height. Three multiplies
 * vertex alpha into the material's, which is the cheapest way to feather a
 * silhouette without a texture or a custom shader.
 */
function paintVerticalAlpha(geometry, height, alphaAt) {
  const position = geometry.attributes.position;
  const half = height / 2;
  const colors = new Float32Array(position.count * 4);
  for (let i = 0; i < position.count; i++) {
    const t = (position.getY(i) + half) / height;
    colors[i * 4] = 1;
    colors[i * 4 + 1] = 1;
    colors[i * 4 + 2] = 1;
    colors[i * 4 + 3] = alphaAt(t);
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 4));
}

function smoothRamp(x) {
  const t = x < 0 ? 0 : x > 1 ? 1 : x;
  return t * t * (3 - 2 * t);
}

function rand(min, max) {
  return min + Math.random() * (max - min);
}
