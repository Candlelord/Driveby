import * as THREE from 'three';
import './style.css';

import { CONFIG } from './config.js';
import { PathFrame, heading } from './path.js';
import { MoodDirector } from './moodDirector.js';
import { Input } from './input.js';
import { Ui } from './ui.js';
import { Sky } from './world/sky.js';
import { Road } from './world/road.js';
import { Terrain } from './world/terrain.js';
import { Props } from './world/props.js';
import { Car } from './world/car.js';
import { Weather } from './world/weather.js';

const container = document.getElementById('scene');

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
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

const director = new MoodDirector();
const frame = new PathFrame();

const sky = new Sky(scene);
const terrain = new Terrain(scene);
const road = new Road(scene);
const props = new Props(scene);
const car = new Car(scene);
const weather = new Weather(scene);

const input = new Input(renderer.domElement, {
  tiltButton: document.getElementById('tilt-btn'),
});
const ui = new Ui();

const state = {
  travelled: 0,
  lateral: 0,
  steer: 0,
  speed: CONFIG.speed,
  heading: 0,
  time: 0,
  dt: 0,
  hasInput: false,
  live: director.live,
  propWeights: director.propWeights,
};

const lookTarget = new THREE.Vector3(0, 1.8, -20);
const lookSmoothed = new THREE.Vector3(0, 1.8, -20);
const camTarget = new THREE.Vector3();
const sunDirection = new THREE.Vector3();

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

const clock = new THREE.Clock();

function tick() {
  // Clamped so a backgrounded tab doesn't teleport the car on resume.
  const dt = Math.min(clock.getDelta(), 1 / 20);
  state.dt = dt;
  state.time += dt;

  updateDriving(dt);
  director.update(dt);

  frame.setOrigin(state.travelled);
  state.heading = heading(state.travelled);
  state.hasInput = input.hasInput;

  updateCamera(dt);
  sky.update(state, camera);
  applyLighting();

  terrain.update(state, frame);
  road.update(state, frame);
  props.update(state, frame);
  car.update(state, frame);
  weather.update(state);

  ui.update(director, state);

  renderer.render(scene, camera);
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

  camTarget.set(state.lateral * 0.45, CONFIG.camHeight, CONFIG.camDistance);
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
}

// Prime the profile so frame zero is already correct, then go.
director.update(0);
tick();

// Handles for poking at the sim from the dev console while tuning.
if (import.meta.env.DEV) {
  window.__roadtrip = { state, director, scene, camera, renderer, CONFIG };
}

// PWA shell. Stubbed for now — enough structure to install, not a full offline story.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {
      // Not fatal: the game runs fine without it.
    });
  });
}
