import * as THREE from 'three';

const GROUND = new THREE.Color();
const LUMA = new THREE.Color();

/**
 * Image-based lighting from the live sky.
 *
 * A hemisphere light gives every surface the same two colours of fill. Real
 * daylight is a picture: bright toward the sun, blue overhead, ground-coloured
 * below, and every glossy surface — car paint, glass, a wet road, water —
 * reflects that picture rather than a flat tint. So this keeps a tiny copy of
 * the sky dome (sharing the dome's own material, so it is always the same sky
 * the camera sees) over a ground-coloured lower hemisphere, and periodically
 * prefilters it into a PMREM environment map for the whole scene.
 *
 * Rebuilt on a timer rather than per frame: the sky only changes over seconds,
 * and one PMREM build is a few dozen small draws.
 */
export class EnvironmentLight {
  constructor(renderer, scene, skyMaterial, tier) {
    this.renderer = renderer;
    this.scene = scene;
    this.interval = tier.name === 'high' ? 0.6 : tier.name === 'medium' ? 1.2 : 2.5;
    this.size = tier.name === 'low' ? 64 : 128;
    this.timer = Infinity;

    // Rendered into a cube target, which the renderer prefilters (PMREM) into
    // the same reused buffers whenever `needsPMREMUpdate` is raised.
    this.cubeTarget = new THREE.WebGLCubeRenderTarget(this.size, { type: THREE.HalfFloatType });
    this.cubeCamera = new THREE.CubeCamera(0.1, 100, this.cubeTarget);
    this.envScene = new THREE.Scene();
    scene.environment = this.cubeTarget.texture;

    // Radius is irrelevant to the dome shader (it uses the view direction), but
    // it must sit inside the cube camera's far plane.
    this.dome = new THREE.Mesh(new THREE.SphereGeometry(40, 32, 16), skyMaterial);
    this.envScene.add(this.dome);

    // The ground half. Bright enough to be the bounce light under the car and
    // in the lower half of every reflection, which is what grounds glossy
    // materials — without it a car body reflects sky in its sills.
    this.groundMaterial = new THREE.MeshBasicMaterial({ color: 0x404040, side: THREE.BackSide });
    const ground = new THREE.Mesh(
      new THREE.SphereGeometry(30, 32, 8, 0, Math.PI * 2, Math.PI / 2 + 0.03, Math.PI / 2 - 0.03),
      this.groundMaterial
    );
    this.envScene.add(ground);

    // A sun the size of the real one is invisible at 128px; this is a soft,
    // generous disc so glossy surfaces pick up a warm hot-spot toward it.
    this.sunMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide });
    this.sun = new THREE.Mesh(new THREE.CircleGeometry(2.4, 24), this.sunMaterial);
    this.envScene.add(this.sun);
  }

  update(state, sky) {
    this.timer += state.dt;
    if (this.timer < this.interval) return;
    this.timer = 0;

    const live = state.live;

    // Counter-rotate with the road exactly as the visible sky does.
    this.dome.rotation.y = state.heading;

    const sunDirection = sky.sunDirection;
    this.sun.position
      .copy(sunDirection)
      .applyAxisAngle(THREE.Object3D.DEFAULT_UP, state.heading)
      .multiplyScalar(36);
    this.sun.lookAt(0, 0, 0);
    this.sunMaterial.color.copy(live.sunColor).multiplyScalar(live.sunIntensity * 0.9 * live.discOpacity);
    this.sun.visible = live.discOpacity > 0.05 && sunDirection.y > -0.05;

    // Ground radiance: its albedo lit by roughly what lights the scene.
    LUMA.copy(live.ambientColor).multiplyScalar(live.ambientIntensity * 0.12);
    LUMA.add(GROUND.copy(live.sunColor).multiplyScalar(live.sunIntensity * 0.05 * Math.max(0, sunDirection.y)));
    this.groundMaterial.color.copy(live.groundColor).multiply(LUMA);

    this.cubeCamera.update(this.renderer, this.envScene);
    this.cubeTarget.texture.needsPMREMUpdate = true;
  }
}
