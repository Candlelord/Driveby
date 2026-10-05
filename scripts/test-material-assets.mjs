import assert from 'node:assert/strict';
import * as THREE from 'three';
import { loadMaterialAsset } from '../src/open/materialAsset.js';
function fakeLoader() {
  const stub = { calls: 0, load(url, success, progress, failure) {
    stub.calls++; stub.success = success; stub.failure = failure;
    return new THREE.Texture();
  } };
  return stub;
}
const loader = fakeLoader();
const success = loadMaterialAsset('wall.webp', { loader, timeoutMs: 100 });
assert.equal(success.ready.value, 0, 'shader must use fallback until the image arrives');
loader.success();
assert.equal(await success.loaded, true);
assert.equal(success.ready.value, 1);
assert.equal(success.texture.wrapS, THREE.RepeatWrapping);
const failureLoader = fakeLoader();
const failure = loadMaterialAsset('missing.webp', { loader: failureLoader, timeoutMs: 100 });
failureLoader.failure();
assert.equal(await failure.loaded, false, 'failed optional asset must not reject boot');
assert.equal(failure.ready.value, 0);
const slowLoader = fakeLoader();
const slow = loadMaterialAsset('slow.webp', { loader: slowLoader, timeoutMs: 5 });
assert.equal(await slow.loaded, false, 'hung request must not block boot indefinitely');
slowLoader.success();
assert.equal(slow.ready.value, 1, 'late image may improve the material after boot');
console.log('Material loading checks passed: success, fallback, bounded wait and late recovery.');
