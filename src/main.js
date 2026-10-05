import * as THREE from 'three';
import './style.css';

import { applyTier } from './config.js';
import { detectTier, tierFromQuery } from './quality.js';
import { setDetail } from './props/detail.js';
import { setSurfaceSize } from './world/surfaces.js';
import { Environment } from './environment.js';
import { Session } from './session.js';
import { Sfx } from './audio/sfx.js';
import { FrameClock } from './loop.js';
import { Post } from './post.js';
import { Sky } from './world/sky.js';
import { Car } from './world/car.js';
import { Weather } from './world/weather.js';
import { Atmosphere } from './world/atmosphere.js';
import { EnvironmentLight } from './world/envLight.js';
import { Garage } from './garage.js';
import { CAR_MODELS } from './world/carModels.js';
import { GarageStage } from './garage/stage.js';
import { GarageUi } from './garage/ui.js';
import { loadSave, writeSave, savedAgo } from './save.js';

import { toWorld, NORTH_EDGE } from './open/geo.js';
import { World } from './open/world.js';
import { Streamer } from './open/streamer.js';
import { Vehicle } from './open/vehicle.js';
import { ChaseCamera } from './open/camera.js';
import { Controls } from './open/controls.js';
import { Hud } from './open/hud.js';
import { MapLayers, Minimap, BigMap } from './open/maps.js';
import { RoadGraph, routeProgress } from './open/route.js';
import { Gameplay } from './open/gameplay.js';
import { Traffic } from './open/traffic.js';
import { Pedestrians } from './open/peds.js';
import { Landmarks3D } from './open/landmarks3d.js';
import { FarTerrain } from './open/farTerrain.js';
import { updateStreets } from './open/streets.js';
import { PauseMenu, Journal } from './open/menus.js';
import { NIGHT } from './open/materials.js';
import { biomeAt, KANO_CENTRE } from './open/north.js';

/**
 * Driveby: an open-world drive from Lagos to the Sahara.
 *
 * Lagos is the real city, built from OpenStreetMap; the north is made up but
 * shaped like the real thing. Drive anywhere, find places, keep the tank full,
 * run errands, with a friend in the passenger seat.
 */

// --- the device ---------------------------------------------------------------------
const tier = tierFromQuery() ?? detectTier();
applyTier(tier);
setDetail(tier.detail ?? 1);
setSurfaceSize(tier.textureSize ?? 512);
const RADIUS = { high: 1500, medium: 1100, low: 750 }[tier.name] ?? 1100;

const renderer = new THREE.WebGLRenderer({ antialias: tier.name === 'high', powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, tier.pixelRatio));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.getElementById('scene').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x000000, 0.004);
const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.3, 9000);

const ambient = new THREE.HemisphereLight(0xffffff, 0x888888, 1);
const sun = new THREE.DirectionalLight(0xffffff, 1);
scene.add(ambient, sun, sun.target);
if (tier.shadows) {
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  sun.castShadow = true;
  sun.shadow.mapSize.set(tier.shadows, tier.shadows);
  const reach = 70;
  Object.assign(sun.shadow.camera, { left: -reach, right: reach, top: reach, bottom: -reach, near: 1, far: 500 });
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.05;
}

// --- the look of the world: sky, light, weather, grade -------------------------------
const environment = new Environment();
environment.jumpToRegion('lagosCity');
const sky = new Sky(scene, tier);
const envLight = new EnvironmentLight(renderer, scene, sky.domeMaterial, tier);
const post = new Post(renderer, scene, camera, tier);
const sfx = new Sfx();
// Particles authored around a car at the origin facing -Z ride along with the car.
const carFrame = new THREE.Group();
scene.add(carFrame);
const weather = new Weather(carFrame, tier);
const atmosphere = tier.atmosphere ? new Atmosphere(carFrame, tier) : null;

// --- the car and the garage -------------------------------------------------------------
const garage = new Garage();
const car = new Car(scene, { realShadow: Boolean(tier.shadows), headlamps: tier.headlamps, model: garage.selected });
car.setPaint(garage.paintOf());
car.setLivery(garage.liveryOf());
post.setLook(garage.look);
const garageStage = new GarageStage(renderer);
garageStage.bindDrag(renderer.domElement);
const garageUi = new GarageUi({ garage, stage: garageStage });

// --- the world -----------------------------------------------------------------------------
const world = new World();
const hud = new Hud();
const controls = new Controls();
controls.bindButtons(hud.buttons);
const session = new Session(environment);
const clock = new FrameClock();

const vehicle = new Vehicle(world);
vehicle.stats = CAR_MODELS[garage.selected]?.stats ?? vehicle.stats;
const chase = new ChaseCamera(camera, world);
let streamer = null;
let gameplay = null;
let traffic = null;
let peds = null;
let landmarks = null;
let far = null;
let layers = null;
let minimap = null;
let bigMap = null;
let graph = null;
let route = null;
let routeCheck = 0;
let pause = null;
let journal = null;

// Where a new trip starts: by Tafawa Balewa Square on Lagos Island.
const START = { ...toWorld(6.4478, 3.3965), yaw: Math.PI * 0.5 };

const state = { time: 0, dt: 0, frame: 0, speed: 0, heading: 0, travelled: 0, lateral: 0, steer: 0, live: environment.live, spray: 0, smoke: 0, slip: 0, slide: 0, dirt: 0, edgePressure: 0 };
let mode = 'loading'; // loading → menu → driving
let overlay = null; // null | 'pause' | 'map' | 'journal' | 'garage'
let saveTimer = 0;

garage.onChange((g) => {
  post.setLook(g.look);
  if (car.modelId !== g.selected) car.setModel(g.selected, g.paintOf());
  car.setPaint(g.paintOf());
  car.setLivery(g.liveryOf());
  vehicle.stats = CAR_MODELS[g.selected]?.stats ?? vehicle.stats;
});

async function boot() {
  await world.load();
  layers = new MapLayers(world);
  const graphData = await world.loadGraph();
  graph = new RoadGraph();
  if (graphData.nodes.length) graph.addLagos(graphData);
  graph.addPolylines(world.north.roads);
  if (world.meta?.exit) graph.link(world.meta.exit.x, world.meta.exit.z, world.north.roads[0].pts[0][0], world.north.roads[0].pts[0][1]);
  await layers.load();

  streamer = new Streamer(scene, world, { radius: RADIUS, budgetMs: tier.name === 'low' ? 5 : 8, floraDensity: tier.name === 'low' ? 0.5 : 1 });
  gameplay = new Gameplay(scene, { world, hud, garage, vehicle, sfx });
  gameplay.onWaypoint = () => {
    route = null;
    routeCheck = 0;
  };
  traffic = new Traffic(scene, { world, graph, count: tier.name === 'low' ? 12 : 26 });
  peds = new Pedestrians(scene, { world, graph, count: tier.name === 'low' ? 20 : 44 });
  landmarks = new Landmarks3D(scene, world);
  far = new FarTerrain(scene, world);
  minimap = new Minimap(layers, hud.el.miniCanvas);
  bigMap = new BigMap(layers, {
    onWaypoint: (wp) => {
      gameplay.setWaypoint(wp);
      bigMap.update(mapData(true));
    },
    onClose: () => closeOverlay(),
  });
  pause = new PauseMenu({
    resume: () => closeOverlay(),
    map: () => openOverlay('map'),
    journal: () => openOverlay('journal'),
    garage: () => openOverlay('garage'),
    reset: () => {
      vehicle.recover();
      chase.snap(vehicle);
      closeOverlay();
    },
    cancelJob: () => {
      gameplay.cancelJob();
      openOverlay('pause');
    },
    toggleVoice: () => {
      gameplay.friend.setVoice(!gameplay.friend.voice);
      openOverlay('pause');
    },
    setLook: (look) => {
      garage.setLook(look);
      openOverlay('pause');
    },
    quit: () => {
      saveGame();
      closeOverlay();
      mode = 'menu';
      hud.setActive(false);
      session.screens.offerResume(resumeInfo());
      session.screens.reshowMenu();
    },
  });
  journal = new Journal({ onClose: () => openOverlay('pause') });
  session.screens.hooks = { stats: () => ({ found: `${loadSave()?.found?.length ?? 0} of ${gameplay.places.length}`, cash: garage.cash }) };

  // The first view: hovering over the start while the menu is up.
  vehicle.place(START.x, START.z, START.yaw);
  mode = 'menu';
  const save = loadSave();
  if (save) session.screens.offerResume(resumeInfo(save));
  session.begin();
}

function resumeInfo(save = loadSave()) {
  if (!save) return null;
  return { title: 'Continue', sub: `near ${areaName(save.x, save.z)} · ${save.found?.length ?? 0} places found · saved ${savedAgo(save)}` };
}

function areaName(x, z) {
  if (z > NORTH_EDGE) {
    let best = 'Lagos';
    let bestD = 2500;
    for (const p of world.pois.places ?? []) {
      const d = Math.hypot(p.x - x, p.z - z);
      if (d < bestD) {
        bestD = d;
        best = p.name;
      }
    }
    return best;
  }
  return { forest: 'the bush', savanna: 'the savanna', sahel: 'the Sahel', desert: 'the desert' }[biomeAt(x, z)];
}

session.screens.onGarage = () => openOverlay('garage', true);
session.onStart = (picked) => {
  const save = picked === 'resume' ? loadSave() : null;
  if (save) {
    vehicle.place(save.x, save.z, save.yaw ?? 0);
    vehicle.fuel = save.fuel ?? 1;
    vehicle.odometer = save.odometer ?? 0;
    gameplay.restore(save);
  } else {
    vehicle.place(START.x, START.z, START.yaw);
    vehicle.fuel = 1;
    vehicle.odometer = 0;
    gameplay.restore(null);
    setTimeout(() => gameplay.friend.say('Field trip! No plan, full tank, the whole country. Press M for the map and pick somewhere.', 7), 1500);
  }
  // Put the car on a real road as soon as the streets round it have loaded.
  spawnPending = !save;
  chase.snap(vehicle);
  mode = 'driving';
  hud.setActive(true);
  saveGame();
};
let spawnPending = false;

function saveGame() {
  if (mode !== 'driving' || !gameplay) return;
  writeSave({ x: vehicle.x, z: vehicle.z, yaw: vehicle.yaw, fuel: vehicle.fuel, odometer: vehicle.odometer, ...gameplay.snapshot() });
}
window.addEventListener('pagehide', saveGame);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') saveGame();
  else clock.reset();
});

// --- overlays: pause, map, journal, garage -------------------------------------------------
function mapData(full) {
  const labels = [];
  for (const p of world.pois.places ?? []) labels.push({ x: p.x, z: p.z, text: p.name, minScale: p.kind === 'suburb' ? 22 : 9 });
  for (const p of world.north.places) if (p.kind === 'village' || p.kind === 'city') labels.push({ x: p.x, z: p.z - 300, text: p.name, big: p.kind === 'city' });
  labels.push({ x: 3000, z: -2000, text: 'Lagos', big: true });
  labels.push({ x: KANO_CENTRE.x, z: KANO_CENTRE.z - 1500, text: 'Kano', big: true });
  return { route, icons: gameplay.icons(full), labels, waypoint: gameplay.waypoint, car: { x: vehicle.x, z: vehicle.z, yaw: vehicle.yaw } };
}

function hideOverlays() {
  if (pause?.open) pause.hide();
  if (bigMap?.open) bigMap.hide();
  if (journal?.open) journal.hide();
}

function openOverlay(name, fromMenu = false) {
  hideOverlays();
  overlay = name;
  controls.enabled = false;
  if (name === 'pause') {
    pause.show({ found: gameplay.found.size, total: gameplay.places.length, cash: garage.cash, km: vehicle.odometer / 1000, area: gameplay.area || areaName(vehicle.x, vehicle.z), voice: gameplay.friend.voice, look: garage.look, job: gameplay.job ? `${gameplay.job.cargo} → ${gameplay.job.to.name}` : null });
  } else if (name === 'map') {
    bigMap.show(vehicle, mapData(true));
  } else if (name === 'journal') {
    journal.show(gameplay.journal());
  } else if (name === 'garage') {
    session.screens.hide();
    hud.setActive(false);
    garageStage.resize(window.innerWidth, window.innerHeight);
    garageUi.open(() => {
      if (fromMenu || mode === 'menu') {
        overlay = null;
        controls.enabled = true;
        session.screens.reshowMenu();
      } else {
        hud.setActive(true);
        openOverlay('pause');
      }
    });
  }
}

function closeOverlay() {
  hideOverlays();
  overlay = null;
  controls.enabled = true;
  clock.reset();
}

controls.on('pause', () => {
  if (mode !== 'driving' || overlay === 'garage') return;
  if (overlay) closeOverlay();
  else openOverlay('pause');
});
controls.on('map', () => {
  if (mode !== 'driving' || overlay === 'garage') return;
  if (overlay === 'map') closeOverlay();
  else openOverlay('map');
});
controls.on('journal', () => {
  if (mode !== 'driving' || overlay === 'garage') return;
  if (overlay === 'journal') closeOverlay();
  else openOverlay('journal');
});
controls.on('reset', () => {
  if (mode !== 'driving' || overlay) return;
  vehicle.recover();
  chase.snap(vehicle);
});
controls.on('voice', () => gameplay?.friend.setVoice(!gameplay.friend.voice));
hud.el.menu.addEventListener('click', () => (overlay ? closeOverlay() : openOverlay('pause')));
hud.el.mini.addEventListener('click', () => openOverlay('map'));

vehicle.onHit = (strength) => {
  sfx.crash(strength);
  if (strength > 0.5 && Math.random() < 0.5) {
    gameplay?.friend.say(['Easy! Easy!', 'That one will leave a mark.', 'My mum is going to ask about that dent.', 'We are exploring, not demolishing.'][Math.floor(Math.random() * 4)], 3);
  }
};

// Audio needs a gesture.
const startAudio = () => {
  sfx.start();
  window.removeEventListener('pointerdown', startAudio);
  window.removeEventListener('keydown', startAudio);
};
window.addEventListener('pointerdown', startAudio);
window.addEventListener('keydown', startAudio);

function resize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
  post.setSize(w, h);
  garageStage.resize(w, h);
  if (bigMap?.open) bigMap.draw();
}
window.addEventListener('resize', resize);
window.visualViewport?.addEventListener('resize', resize);

// --- the frame ------------------------------------------------------------------------------
const REGION = { lagos: 'lagosCity', forest: 'rainforestBelt', savanna: 'guineaSavanna', sahel: 'sahelSavanna', desert: 'saharaDunes' };

function tick(now) {
  const dt = clock.tick(now ?? performance.now());
  requestAnimationFrame(tick);
  if (overlay === 'garage') {
    garageStage.render(dt);
    return;
  }
  state.dt = dt;
  state.time += dt;
  if (mode === 'loading') {
    renderer.render(scene, camera);
    return;
  }

  const simulating = mode === 'driving' && !overlay;
  if (spawnPending && mode === 'driving') {
    const road = world.nearestRoad(vehicle.x, vehicle.z, 400);
    if (road) {
      vehicle.place(road.x, road.z, road.angle);
      chase.snap(vehicle);
      spawnPending = false;
    }
  }
  controls.update();
  if (simulating) vehicle.update(dt, controls);

  // Where are we, for the weather and the light.
  const biome = vehicle.z > NORTH_EDGE ? 'lagos' : biomeAt(vehicle.x, vehicle.z);
  const inKano = Math.hypot(vehicle.x - KANO_CENTRE.x, vehicle.z - KANO_CENTRE.z) < KANO_CENTRE.r + 400;
  environment.enterRegion(inKano ? 'kanoCity' : REGION[biome], vehicle.odometer);
  environment.update(simulating ? dt : dt * 0.25, vehicle.odometer);
  state.live = environment.live;
  state.travelled = vehicle.odometer;

  // The world around the car.
  streamer.update(vehicle.x, vehicle.z, vehicle.yaw);
  landmarks.update(vehicle.x, vehicle.z);
  far.update(vehicle.x, vehicle.z, environment.live);

  if (mode === 'menu') {
    // Drift slowly round the start while the menu is up.
    const a = state.time * 0.05;
    camera.position.set(vehicle.x + Math.sin(a) * 60, vehicle.y + 26, vehicle.z + Math.cos(a) * 60);
    camera.lookAt(vehicle.x, vehicle.y + 4, vehicle.z);
  } else {
    chase.update(vehicle, dt, state.time, environment.live.fov ?? 62);
  }

  // The car.
  state.speed = vehicle.speed;
  state.steer = -vehicle.steer;
  state.slip = vehicle.slip;
  state.slide = vehicle.lateral;
  const loose = vehicle.surface === 'dirt' || vehicle.surface === 'sand' || vehicle.surface === 'grass';
  state.dirt = loose ? 1 : 0;
  const fast = Math.min(1.2, Math.abs(vehicle.speed) / 30);
  state.spray = loose ? Math.min(1.5, fast * (0.35 + vehicle.slip * 1.1)) : 0;
  state.smoke = loose ? 0 : Math.max(0, (vehicle.slip - 0.35) * 1.6);
  car.place({ x: vehicle.x, y: vehicle.y, z: vehicle.z, yaw: vehicle.yaw, pitch: -vehicle.pitch, roll: vehicle.roll + vehicle.bodyRoll }, state);
  carFrame.position.set(vehicle.x, vehicle.y, vehicle.z);
  carFrame.rotation.set(0, -vehicle.yaw, 0);

  if (simulating) {
    gameplay.night = environment.live.lampIntensity;
    gameplay.update(dt, state.time);
    traffic.update(dt, vehicle, sfx);
    peds.update(dt, state.time, vehicle);
    updateRoute(dt);
    saveTimer += dt;
    if (saveTimer > 5) {
      saveTimer = 0;
      saveGame();
    }
  }

  // HUD.
  if (mode === 'driving') {
    hud.setSpeed(vehicle.speed);
    hud.setFuel(vehicle.fuel);
    hud.setCash(garage.cash);
    const toGo = route ? routeProgress(route, vehicle.x, vehicle.z).remaining : null;
    hud.setArea(gameplay.area || 'Lagos', `${vehicle.z > NORTH_EDGE ? 'Lagos' : 'the north'}${toGo !== null ? ` · <b>${(toGo / 1000).toFixed(1)} km</b> to ${gameplay.waypoint?.label ?? 'waypoint'}` : ''}`);
    if (state.frame++ % 2 === 0) minimap.draw(vehicle, { route, icons: gameplay.icons(false) });
  }

  applyLighting();
  sky.update(state, camera);
  envLight.update(state, sky);
  weather.update(state);
  atmosphere?.update(state);
  post.update(state);
  sfx.update(state, state.live, session.player);
  session.update();
  // Windows light up from dusk, not under an overcast noon.
  NIGHT.value = Math.max(0, Math.min(1, (environment.live.lampIntensity - 0.35) / 0.4));
  updateStreets();
  post.render();
}

function updateRoute(dt) {
  const wp = gameplay.waypoint;
  if (!wp) {
    route = null;
    return;
  }
  if (Math.hypot(wp.x - vehicle.x, wp.z - vehicle.z) < 25) {
    gameplay.setWaypoint(null);
    hud.toast('You are here', wp.label ?? '', 2.5);
    route = null;
    return;
  }
  routeCheck -= dt;
  if (routeCheck > 0) return;
  routeCheck = 1.2;
  if (route && routeProgress(route, vehicle.x, vehicle.z).off < 45) return;
  route = graph.route(vehicle.x, vehicle.z, wp.x, wp.z) ?? [[vehicle.x, vehicle.z], [wp.x, wp.z]];
}

const SUN_DIR = new THREE.Vector3();
function applyLighting() {
  const live = state.live;
  scene.fog.color.copy(live.fogColor);
  // Thinner than the old road's fog: there is a horizon to see now. The
  // city's haze thickens it again.
  const haze = vehicle.z > NORTH_EDGE ? 1.5 : 1;
  scene.fog.density = Math.min(0.0045, Math.max(0.00055, live.fogDensity * 0.15 * haze));
  ambient.color.copy(live.ambientColor);
  ambient.groundColor.copy(live.groundColor).lerp(live.ambientColor, 0.35);
  ambient.intensity = live.ambientIntensity * 0.42;
  scene.environmentIntensity = 0.85;
  sun.color.copy(live.sunColor);
  sun.intensity = live.sunIntensity;
  SUN_DIR.copy(sky.sunDirection);
  sun.target.position.set(vehicle.x, vehicle.y, vehicle.z);
  sun.position.copy(SUN_DIR).multiplyScalar(200).add(sun.target.position);
}

requestAnimationFrame(tick);
boot();

if (import.meta.env.DEV) {
  window.__drive = {
    renderer,
    world, vehicle, environment, garage, scene, camera, controls, hud, CAR_MODELS,
    get gameplay() { return gameplay; },
    get streamer() { return streamer; },
    get graph() { return graph; },
    get traffic() { return traffic; },
  };
}

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
}
