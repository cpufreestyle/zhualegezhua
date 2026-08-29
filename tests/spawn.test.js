const { test } = require('node:test');
const assert = require('node:assert');
const config = require('../js/config.js');
const { CREATURES } = require('../js/render/creatures.js');
const spawn = require('../js/meta/spawn.js');

test('场次在 min~max 之间', () => {
  for (let i = 0; i < 50; i++) {
    const list = spawn.rollEncounter(CREATURES, Math.random, config);
    assert.ok(list.length >= config.spawn.min && list.length <= config.spawn.max);
  }
});

test('全部来自 CREATURES 清单且稀有度分布合法', () => {
  const rarities = new Set(CREATURES.map((c) => c.rarity));
  for (let i = 0; i < 50; i++) {
    spawn.rollEncounter(CREATURES, Math.random, config).forEach((c) => {
      assert.ok(rarities.has(c.rarity));
      assert.ok(CREATURES.includes(c));
    });
  }
});

test('加权：纯 common 表永远返回 common', () => {
  const rarity = spawn.weightedPick({ common: 1, rare: 0, legendary: 0 }, Math.random);
  assert.strictEqual(rarity, 'common');
});

test('权重表含 CREATURES 没有的稀有度 → 跳过不产生 undefined', () => {
  const list = spawn.rollEncounter(CREATURES, Math.random, { ...config, spawn: { ...config.spawn, weights: { common: 0.7, rare: 0.2, epic: 0.1 } } });
  list.forEach((c) => assert.ok(c, 'undefined 混入了刷怪结果'));
});
