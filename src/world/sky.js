import * as THREE from 'three';
import { softDotTexture } from './textures.js';

const VERTEX_SHADER = /* glsl */ `
  varying vec3 vWorldPosition;
  void main() {
    vWorldPosition = (modelMatrix * vec4(position, 1.0)).xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const FRAGMENT_SHADER = /* glsl */ `
  uniform vec3 topColor;
  uniform vec3 bottomColor;
  uniform float offset;
  uniform float exponent;
  varying vec3 vWorldPosition;

  void main() {
    float h = normalize(vWorldPosition + vec3(0.0, offset, 0.0)).y;
    vec3 sky = mix(bottomColor, topColor, pow(max(h, 0.0), exponent));
    gl_FragColor = vec4(sky, 1.0);
    #include <colorspace_fragment>
  }
`;

/**
 * Gradient sky dome + a sun/moon disc, both parented to a group that rides
 * along with the camera. The dome's bottom colour is kept equal to the fog
 * colour so distant geometry dissolves into the horizon with no visible seam.
 *
 * The group counter-rotates with the road heading, so the sun stays put in the
 * world while the car turns underneath it.
 */
export class Sky {
  constructor(scene) {
    this.group = new THREE.Group();
    scene.add(this.group);

    this.domeMaterial = new THREE.ShaderMaterial({
      uniforms: {
        topColor: { value: new THREE.Color(0x000000) },
        bottomColor: { value: new THREE.Color(0x000000) },
        offset: { value: 120 },
        exponent: { value: 0.75 },
      },
      vertexShader: VERTEX_SHADER,
      fragmentShader: FRAGMENT_SHADER,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    });

    this.dome = new THREE.Mesh(new THREE.SphereGeometry(900, 24, 14), this.domeMaterial);
    this.dome.renderOrder = -2;
    this.dome.frustumCulled = false;
    this.group.add(this.dome);

    this.discMaterial = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      depthTest: false,
      fog: false,
    });

    this.disc = new THREE.Mesh(new THREE.CircleGeometry(1, 32), this.discMaterial);
    this.disc.renderOrder = -1;
    this.disc.frustumCulled = false;
    this.group.add(this.disc);

    // Soft halo behind the disc — sells "sun" over "white circle". Needs an
    // alpha falloff or its own rim reads as a second hard-edged disc.
    this.haloMaterial = this.discMaterial.clone();
    this.haloMaterial.map = softDotTexture();
    this.haloMaterial.blending = THREE.AdditiveBlending;
    this.halo = new THREE.Mesh(new THREE.CircleGeometry(1, 32), this.haloMaterial);
    this.halo.renderOrder = -1;
    this.halo.frustumCulled = false;
    this.group.add(this.halo);

    this.sunDirection = new THREE.Vector3(0, 1, 0);
    this._discPosition = new THREE.Vector3();
  }

  update(state, camera) {
    const live = state.live;

    this.domeMaterial.uniforms.topColor.value.copy(live.skyTop);
    this.domeMaterial.uniforms.bottomColor.value.copy(live.skyBottom);

    // Ride with the camera, counter-rotate with the road so the sky is world-fixed.
    this.group.position.copy(camera.position);
    this.group.rotation.y = state.heading;

    const az = live.sunAzimuth;
    const el = live.sunElevation;
    const cosEl = Math.cos(el);
    this.sunDirection.set(Math.sin(az) * cosEl, Math.sin(el), -Math.cos(az) * cosEl).normalize();

    this._discPosition.copy(this.sunDirection).multiplyScalar(760);
    this.disc.position.copy(this._discPosition);
    this.disc.scale.setScalar(live.discSize);
    this.disc.lookAt(this.group.position);
    this.discMaterial.color.copy(live.discColor);
    this.discMaterial.opacity = live.discOpacity;

    this.halo.position.copy(this._discPosition).multiplyScalar(0.995);
    this.halo.scale.setScalar(live.discSize * 3.2);
    this.halo.quaternion.copy(this.disc.quaternion);
    this.haloMaterial.color.copy(live.sunColor);
    this.haloMaterial.opacity = live.discOpacity * 0.32;
  }
}
