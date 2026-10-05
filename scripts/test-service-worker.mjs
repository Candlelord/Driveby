import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

// Exercise cache routing without requiring a browser or a network connection.
const handlers = {};
const stored = new Map();
let calls = 0;
let offline = false;
let status = 200;
let fetchOptions;
const context = {
  URL,
  self: {
    location: new URL('https://driveby.test/game/sw.js'),
    addEventListener: (name, fn) => { handlers[name] = fn; },
  },
  caches: {
    match: async (r) => stored.get(typeof r === 'string' ? r : r.url),
    open: async () => ({ put: async (r, response) => stored.set(r.url, response) }),
  },
  fetch: async (request, options) => {
    fetchOptions = options;
    calls++;
    if (offline) throw new Error('offline');
    return { ok: status === 200, status, clone() { return this; } };
  },
};
vm.createContext(context);
vm.runInContext(readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8'), context);
const request = (path, mode = 'cors') => ({
  url: `https://driveby.test/game/${path}`, method: 'GET', mode, destination: '',
});
const run = async (r) => {
  let response;
  handlers.fetch({ request: r, respondWith: (p) => { response = p; } });
  return await response;
};

const world = request('world/meta.json');
stored.set(world.url, { status: 200, old: true });
assert.equal((await run(world)).old, undefined, 'map must refresh despite a cached copy');
assert.equal(calls, 1);
assert.equal(fetchOptions.cache, 'no-cache', 'world refresh must revalidate the browser HTTP cache too');
offline = true;
assert.equal((await run(world)).status, 200, 'cached map works offline');
stored.set('./index.html', { html: true });
await assert.rejects(run(request('world/missing.json')), 'map misses must not return HTML');
assert.equal((await run(request('', 'navigate'))).html, true, 'navigation keeps shell fallback');
offline = false;
status = 404;
const missing = request('world/missing.json');
await run(missing);
assert.equal(stored.has(missing.url), false, 'failed downloads must not be cached');
status = 200;
const asset = request('assets/app.hash.js');
stored.set(asset.url, { cached: true });
const before = calls;
assert.equal((await run(asset)).cached, true);
assert.equal(calls, before, 'hashed assets remain cache-first');
console.log('Service worker cache checks passed.');
