import * as THREE from 'three';
import { tuneModel, materialsNamed, nodeNamed, nodesMatching, mountWheel, cloneModel } from './models.js';

/**
 * Turn a loaded car model into something that drives: an independent copy,
 * turned to face -Z, with its wheels on pivots, sitting on the road, and its
 * paint and lamp materials found by name.
 *
 * Shared by the player's car (world/car.js) and the garage showroom.
 */
export function buildCarModel(scene, def, { shadows = false } = {}) {
  const root = tuneModel(cloneModel(scene), { shadows });
  root.rotation.y = def.yaw;
  const group = new THREE.Group();
  group.add(root);
  group.updateMatrixWorld(true);

  // Wheels: named nodes, or a pattern. Front or rear is read off where the
  // wheel sits once the model has been turned to face -Z.
  const nodes = Array.isArray(def.wheels)
    ? def.wheels.map((name) => nodeNamed(root, name)).filter(Boolean)
    : nodesMatching(root, def.wheels);
  const here = new THREE.Vector3();
  const wheels = nodes.map((node) => {
    node.getWorldPosition(here);
    return { ...mountWheel(node, group), steers: here.z < 0, node };
  });

  // The model's lowest point is the ground.
  group.updateMatrixWorld(true);
  group.position.y = -new THREE.Box3().setFromObject(root).min.y;

  const model = {
    group,
    root,
    wheels,
    paint: materialsNamed(root, def.paint),
    accent: def.accent ? materialsNamed(root, def.accent) : [],
    head: materialsNamed(root, def.head),
    tail: materialsNamed(root, def.tail),
  };

  // Lamp textures carry the glow too, so the same map drives the emissive.
  for (const lamp of [...model.head, ...model.tail]) {
    if (lamp.map) {
      lamp.emissive.set(0xffffff);
      lamp.emissiveMap = lamp.map;
      lamp.needsUpdate = true;
    }
  }
  return model;
}
