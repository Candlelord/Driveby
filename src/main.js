import * as THREE from 'three';
import './style.css';

import { CONFIG, applyTier } from './config.js';
import { detectTier, tierFromQuery } from './quality.js';
import { setDetail } from './props/detail.js';
import { applyPainterlyShading } from './style/painterly.js';
import { PathFrame, heading } from './path.js';
import { Environment } from './environment.js';
import { CarPhysics } from './physics.js';
import { MOOD_PROFILES } from './moods.js';
import { TERRAIN_SETS, TERRAIN_POOLS } from './terrainSets.js';
import { CLIMATE_PROFILES } from './climates.js';
import { EVENT_NAMES } from './events.js';
import { Session } from './session.js';
import { Sfx } from './audio/sfx.js';
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
import { Features } from './world/features.js';
import { Landmarks } from './world/landmarks.js';
import { EventVisuals } from './world/eventVisuals.js';
import { Atmosphere } from './world/atmosphere.js';

const tier = tierFromQuery() ?? detectTier();
applyTier(tier);
// Must run before any geometry is constructed.
setDetail(tier.detail ?? 1);
// And this before the first material compiles: it rewrites the shared lighting
// chunk so every standard material gets the painterly falloff.
applyPainterlyShading();

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

// A hemisphere in place of flat ambient is the cheapest fake GI there is: the
// fill comes from the sky above and from light bounced off the ground below,
// so the underside of everything carries the ground's colour instead of grey.
// This is most of what "soft bounced light" means in the art brief.
const ambient = new THREE.HemisphereLight(0xffffff, 0x888888, 1);
scene.add(ambient);

const sun = new THREE.DirectionalLight(0xffffff, 1);
sun.position.set(60, 90, -40);
scene.add(sun, sun.target);

// One real cast shadow, for the car alone. The frustum is a tight box around
// the origin — where the car always is — so the map stays sharp at a small
// size, and the long soft shadow anchors the car to the road the way the
// concept art's does. Traffic passing through the box picks it up for free.
if (tier.shadows) {
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  sun.castShadow = true;
  sun.shadow.mapSize.set(tier.shadows, tier.shadows);
  const frustum = sun.shadow.camera;
  frustum.left = -16;
  frustum.right = 16;
  frustum.top = 16;
  frustum.bottom = -16;
  frustum.near = 40;
  frustum.far = 220;
  sun.shadow.bias = -0.0006;
  sun.shadow.radius = 4;
}

const environment = new Environment();
const physics = new CarPhysics();
const frame = new PathFrame();

const sky = new Sky(scene, tier);
const terrain = new Terrain(scene, tier);
const road = new Road(scene);
const props = new Props(scene, tier);
const features = new Features(scene, tier);
const landmarks = new Landmarks(scene, CONFIG);
const eventVisuals = new EventVisuals(scene, tier);
// Birds, fireflies, exhaust and spray are four extra Points systems updated
// every frame; the lowest tier does without them.
const atmosphere = tier.atmosphere ? new Atmosphere(scene, tier) : null;
const traffic = new Traffic(scene, tier);
const car = new Car(scene, { realShadow: Boolean(tier.shadows) });
const weather = new Weather(scene, tier);

const input = new Input(renderer.domElement, {
  tiltButton: document.getElementById('tilt-btn'),
});
const ui = new Ui();
const post = new Post(renderer, scene, camera, tier);
const sfx = new Sfx();
const session = new Session(environment);

// Audio cannot start until the browser has seen a gesture, so the first real
// input is what opens the context.
const startAudio = () => {
  sfx.start();
  window.removeEventListener('pointerdown', startAudio);
  window.removeEventListener('keydown', startAudio);
};
window.addEventListener('pointerdown', startAudio);
window.addEventListener('keydown', startAudio);

// Real track ends replace the mock song timer once a library is connected.
session.player.onTrackEnd(() => environment.songFinished(state.travelled));
session.begin();

const state = {
  travelled: 0,
  lateral: 0,
  steer: 0,
  speed: 0,
  roll: 0,
  bob: 0,
  edgePressure: 0,
  heading: 0,
  time: 0,
  dt: 0,
  hasInput: false,
  live: environment.live,
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
  features.update(state, frame);
  landmarks.update(state, frame);
  props.update(state, frame, environment);
  traffic.update(state, frame);
  car.update(state, frame);
  weather.update(state);
  eventVisuals.update(state, camera);
  atmosphere?.update(state);

  ui.update(environment, state, landmarks.label);
  post.update(state);
  sfx.update(state, state.live, session.player);
  session.update();

  post.render();
  requestAnimationFrame(tick);
}

function updateDriving(dt) {
  physics.update(dt, input.value, state.live, state.live.shake);

  state.travelled = physics.travelled;
  state.lateral = physics.lateral;
  state.steer = physics.steer;
  state.speed = physics.speed;
  state.roll = physics.roll;
  state.bob = physics.bob;
  state.edgePressure = physics.edgePressure;
}

function applyLighting() {
  const live = state.live;

  scene.fog.color.copy(live.fogColor);
  scene.fog.density = live.fogDensity;

  ambient.color.copy(live.ambientColor);
  // Bounce is the ground colour pulled toward the sky's, so it always agrees
  // with whatever terrain and weather are underneath.
  ambient.groundColor.copy(live.groundColor).lerp(live.ambientColor, 0.35);
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

  // Extreme weather adds an irregular shake on top of the handheld drift.
  const shake = state.live.shake;
  const shakeX = shake > 0 ? Math.sin(state.time * 27.3) * Math.sin(state.time * 11.1) * shake * 0.5 : 0;
  const shakeY = shake > 0 ? Math.sin(state.time * 33.7 + 2.1) * shake * 0.35 : 0;

  camTarget.set(
    state.lateral * 0.45 + swayX + shakeX,
    CONFIG.camHeight + swayY + shakeY,
    CONFIG.camDistance
  );
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
  camera.rotateZ(cameraRoll + (physics.shakeRoll ?? 0));

  // Field of view is part of each mood: wide and open for happy, tighter and
  // more closed-in for sad.
  const targetFov = state.live.fov;
  if (Math.abs(targetFov - cameraFov) > 0.01) {
    cameraFov += (targetFov - cameraFov) * (1 - Math.exp(-3 * dt));
    camera.fov = cameraFov;
    camera.updateProjectionMatrix();
  }
}

// Debug: force an extreme weather event. The spec asks for manual triggers so
// the events can be validated without waiting for their random schedule.
const EVENT_KEYS = { 1: 'tornado', 2: 'lightning', 3: 'snow', 4: 'sandstorm', 5: 'aurora' };
window.addEventListener('keydown', (event) => {
  const name = EVENT_KEYS[event.key];
  if (name) {
    environment.events.force(name);
    ui.flashEvent(name);
  } else if (event.key === '0') {
    environment.events.stop();
  } else if (event.key === 'm' || event.key === 'M') {
    sfx.setMuted(!sfx.muted);
  } else if (event.key === 'r' || event.key === 'R') {
    session.showReview();
  } else if (event.key === 'l' || event.key === 'L') {
    landmarks.force((landmarks.activeIndex + 1) % 6, state.travelled);
  }
});

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
    physics,
    props,
    features,
    landmarks,
    eventVisuals,
    atmosphere,
    sfx,
    session,
    MOOD_PROFILES,
    TERRAIN_SETS,
    TERRAIN_POOLS,
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
