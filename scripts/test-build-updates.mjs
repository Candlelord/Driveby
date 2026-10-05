import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { hasBuildUpdate } from '../src/open/buildUpdates.js';
const mock = value => async (url, options) => {
  assert.equal(options.cache,'no-cache');
  return {ok:true,json:async()=>value};
};
assert.equal(await hasBuildUpdate('one','build-info.json',mock({version:'two'})),true);
assert.equal(await hasBuildUpdate('one','build-info.json',mock({version:'one'})),false);
assert.equal(await hasBuildUpdate('one','build-info.json',mock({version:''})),false);
assert.equal(await hasBuildUpdate('one','build-info.json',mock({version:42})),false);
assert.equal(await hasBuildUpdate('one','build-info.json',async()=>{throw Error('offline');}),false);
const info=JSON.parse(await readFile('dist/build-info.json','utf8'));
const entry=(await readdir('dist/assets')).find(name=>/^index-.*\.js$/.test(name));
assert.ok((await readFile('dist/assets/'+entry,'utf8')).includes(info.version),'published marker must match the running bundle version');
console.log('Build update checks passed: new/current versions, malformed/offline responses and bundle-marker agreement.');
