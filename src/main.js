import * as THREE from 'three';
import './style.css';

import { CONFIG, applyTier } from './config.js';
import { detectTier, tierFromQuery } from './quality.js';
import { PathFrame, heading } from './path.js';
import { Environment } from './environment.js';
import { MOOD_PROFILES } from './moods.js';
import { TERRAIN_PROFILES } from './terrains.js';
import { CLIMATE_PROFILES } from './climates.js';
import { Input } from './input.js';
import { Ui } from './ui.js';
import { Post } from './post.js';
import { Sky } from './world/sky.js';
import { Road } from './world/road.js';
import { Terrain } from './world/terrain.js';
import { Props } from './world/props.js';
import { Car } from './world/car.js';
import { Traffic } from './world/traffic.js';
import { Weather } from './world/weather.js';

const tier = tierFromQuery() ?? detectTier();
applyTier(tier);

const container = document.getElementById('scene');

const renderer = new THREE.WebGLRenderer({
  // MSAA is the first thing worth giving up on a phone; the grade pass hides
  // most of what it was buying.
  antialias: tier.name === 'high',
  powerPreference: 'high-performance',
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, tier.pixelRatio));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
container.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x000000, 0.01);

const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 1500);
camera.position.set(0, CONFIG.camHeight, CONFIG.camDistance);

const ambient = new THREE.AmbientLight(0xffffff, 1);
scene.add(ambient);

const sun = new THREE.DirectionalLight(0xffffff, 1);
sun.position.set(60, 90, -40);
scene.add(sun, sun.target);

const environment = new Environment();
const frame = new PathFrame();

const sky = new Sky(scene, tier);
const terrain = new Terrain(scene, tier);
const road = new Road(scene);
const props = new Props(scene, tier);
const traffic = new Traffic(scene, tier);
const car = new Car(scene);
const weather = new Weather(scene, tier);

const input = new Input(renderer.domElement, {
  tiltButton: document.getElementById('tilt-btn'),
});
const ui = new Ui();
const post = new Post(renderer, scene, camera, tier);

const state = {
  travelled: 0,
  lateral: 0,
  steer: 0,
  speed: CONFIG.speed,
  heading: 0,
  time: 0,
  dt: 0,
  hasInput: false,
  live: environment.live,
  propWeights: environment.propWeights,
};

const lookTarget = new THREE.Vector3(0, 1.8, -20);
const lookSmoothed = new THREE.Vector3(0, 1.8, -20);
const camTarget = new THREE.Vector3();
const sunDirection = new THREE.Vector3();

let cameraRoll = 0;
let cameraFov = 62;
let running = true;

const clock = new THREE.Clock();

function resize() {
  const width = window.innerWidth;
  const height = window.innerHeight;
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height);
  post.setSize(width, height);
}
window.addEventListener('resize', resize);
// Mobile browsers collapse the address bar without firing a window resize.
window.visualViewport?.addEventListener('resize', resize);

// Stop rendering entirely when backgrounded — on a phone this is the difference
// between a game and a battery drain.
document.addEventListener('visibilitychange', () => {
  const visible = document.visibilityState === 'visible';
  const wasRunning = running;
  running = visible;
  if (visible && !wasRunning) {
    clock.getDelta(); // discard the time spent hidden
    requestAnimationFrame(tick);
  }
});

function tick() {
  if (!running) return;

  // Clamped so a slow frame doesn't teleport the car.
  const dt = Math.min(clock.getDelta(), 1 / 20);
  state.dt = dt;
  state.time += dt;

  updateDriving(dt);
  environment.update(dt, state.travelled);

  frame.setOrigin(state.travelled);
  state.heading = heading(state.travelled);
  state.hasInput = input.hasInput;

  updateCamera(dt);
  sky.update(state, camera);
  applyLighting();

  terrain.update(state, frame);
  road.update(state, frame);
  props.update(state, frame);
  traffic.update(state, frame);
  car.update(state, frame);
  weather.update(state);

  ui.update(environment, state);
  post.update(state);

  post.render();
  requestAnimationFrame(tick);
}

function updateDriving(dt) {
  // Smooth the raw input so taps feel like steering rather than teleporting.
  const target = input.value;
  state.steer += (target - state.steer) * (1 - Math.exp(-CONFIG.steerResponse * dt));

  state.lateral += state.steer * CONFIG.steerRate * dt;
  state.lateral = Math.max(-CONFIG.maxLateral, Math.min(CONFIG.maxLateral, state.lateral));

  // No fail state: the car simply never leaves the road.
  state.travelled += state.speed * dt;
}

function applyLighting() {
  const live = state.live;

  scene.fog.color.copy(live.fogColor);
  scene.fog.density = live.fogDensity;

  ambient.color.copy(live.ambientColor);
  ambient.intensity = live.ambientIntensity;

  sun.color.copy(live.sunColor);
  sun.intensity = live.sunIntensity;

  // Keep the key light locked to the visible sun, counter-rotated with the road
  // so shading stays consistent as the car turns.
  sunDirection.copy(sky.sunDirection).applyAxisAngle(THREE.Object3D.DEFAULT_UP, state.heading);
  sun.position.copy(sunDirection).multiplyScalar(120);
}

function updateCamera(dt) {
  const lag = 1 - Math.exp(-CONFIG.camLag * dt);

  // A slow two-frequency drift keeps the camera from feeling rail-mounted.
  const swayX = Math.sin(state.time * 0.63) * Math.sin(state.time * 0.29) * CONFIG.camSway;
  const swayY = Math.sin(state.time * 0.47 + 1.3) * CONFIG.camSway * 0.6;

  camTarget.set(state.lateral * 0.45 + swayX, CONFIG.camHeight + swayY, CONFIG.camDistance);
  camera.position.lerp(camTarget, lag);

  // Aim at a point up the road so corners lead the car instead of trailing it.
  frame.point(state.travelled + CONFIG.camLookAhead, 0, 0, lookTarget);
  lookTarget.set(
    lookTarget.x * 0.5 + state.lateral * 0.3,
    lookTarget.y * 0.5 + 1.9,
    -CONFIG.camLookAhead * 0.45
  );
  lookSmoothed.lerp(lookTarget, lag);
  camera.lookAt(lookSmoothed);

  // Bank into the corner. Curvature comes from the road itself rather than the
  // player's steering, so the horizon tilts with the bend, not with a tap.
  const curvature = heading(state.travelled + 55) - state.heading;
  cameraRoll += (curvature * CONFIG.camRoll - cameraRoll) * (1 - Math.exp(-2.4 * dt));
  camera.rotateZ(cameraRoll);

  // Field of view is part of each mood: wide and open for happy, tighter and
  // more closed-in for sad.
  const targetFov = state.live.fov;
  if (Math.abs(targetFov - cameraFov) > 0.01) {
    cameraFov += (targetFov - cameraFov) * (1 - Math.exp(-3 * dt));
    camera.fov = cameraFov;
    camera.updateProjectionMatrix();
  }
}

tick();

// Handles for poking at the sim from the dev console while tuning.
if (import.meta.env.DEV) {
  window.__roadtrip = {
    state,
    environment,
    traffic,
    scene,
    camera,
    renderer,
    post,
    tier,
    CONFIG,
    MOOD_PROFILES,
    TERRAIN_PROFILES,
    CLIMATE_PROFILES,
  };
}

// PWA shell. Stubbed for now — enough structure to install, not a full offline story.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {
      // Not fatal: the game runs fine without it.
    });
  });
}
