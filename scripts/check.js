// scripts/check.js — node scripts/check.js，退出码非 0 即有模块损坏
const path = require('path');
global.wx = {
  getStorageSync: () => undefined,
  setStorageSync: () => {},
  isVKSupport: () => false,
  getSystemInfoSync: () => ({ windowWidth: 375, windowHeight: 667, pixelRatio: 2 }),
  onDeviceMotionChange: () => {},
  startDeviceMotionListening: () => {},
};
const mods = [
  './js/config.js',
  './js/core/events.js',
  './js/meta/economy.js',
  './js/meta/spawn.js',
  './js/meta/storage.js',
  './js/game/catch_resolver.js',
  './js/game/hit_circles.js',
  './js/game/ballistics.js',
  './js/render/creatures.js',
];
let failed = 0;
for (const m of mods) {
  try { require(path.join(__dirname, '..', m)); } catch (e) { console.error('FAIL', m, e.message); failed++; }
}
if (failed) { console.error(`${failed} module(s) broken`); process.exit(1); }
console.log('check ok:', mods.length, 'modules');
