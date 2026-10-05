import * as THREE from 'three';

/** Start once, wait briefly at boot, and keep a safe shader fallback on failure. */
export function loadMaterialAsset(url, { loader = new THREE.TextureLoader(), timeoutMs = 8000 } = {}) {
  const ready = { value: 0 };
  let finish, timer;
  const loaded = new Promise(resolve => { finish = resolve; });
  timer = setTimeout(() => finish(false), timeoutMs);
  const texture = loader.load(url, () => {
    ready.value = 1;
    clearTimeout(timer); finish(true);
  }, undefined, () => { clearTimeout(timer); finish(false); });
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 4;
  texture.colorSpace = THREE.NoColorSpace;
  return { texture, ready, loaded };
}
