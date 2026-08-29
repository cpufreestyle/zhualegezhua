const { test } = require('node:test');
const assert = require('node:assert');
const config = require('../js/config.js');
const cr = require('../js/game/catch_resolver.js');

const creature = { id: 'slime', rarity: 'common' };

test('基础捕捉率 = 配置值', () => {
  assert.strictEqual(cr.captureChance(creature, 'none', config), 0.65);
});

test('Excellent 加成 ×2 封顶 0.95', () => {
  assert.strictEqual(cr.captureChance(creature, 'excellent', config), 0.95);
});

test('传说基础 0.12', () => {
  assert.strictEqual(cr.captureChance({ rarity: 'legendary' }, 'none', config), 0.12);
});

test('rollCapture 用 rng 决策', () => {
  assert.strictEqual(cr.rollCapture(creature, 'none', () => 0.7, config), false); // 0.7 ≥ 0.65 不中
  assert.strictEqual(cr.rollCapture(creature, 'none', () => 0.1, config), true);  // 0.1 < 0.65 命中
});

test('rollFlee 按稀有度概率', () => {
  assert.strictEqual(cr.rollFlee({ rarity: 'legendary' }, () => 0.10, config), true);
  assert.strictEqual(cr.rollFlee({ rarity: 'common' }, () => 0.10, config), false);
});
