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

test('rng 恰在阈值处不中（< 语义）', () => {
  assert.strictEqual(cr.rollCapture(creature, 'none', () => 0.65, config), false);
});

test('ballMult：大师球 ×1.6 叠加圈加成', () => {
  assert.strictEqual(cr.captureChance(creature, 'none', config, 'master'), 0.95); // 0.65×1.6 封顶
  assert.strictEqual(cr.captureChance(creature, 'nice', config, 'master'), 0.95); // 0.65×1.2×1.6 封顶
  // 期望值写成表达式而非 0.56 字面量：0.35×1.6 浮点直积是 0.5599999999999999，字面量会假失败
  assert.strictEqual(cr.captureChance({ rarity: 'rare' }, 'none', config, 'master'), 0.35 * 1.6);
  assert.strictEqual(cr.captureChance(creature, 'none', config, 'donut'), 0.65); // ×1.0 不变
});

test('rollCapture：ballMult 透传', () => {
  assert.strictEqual(cr.rollCapture(creature, 'none', () => 0.94, config, 'master'), true);
  assert.strictEqual(cr.rollCapture(creature, 'none', () => 0.94, config, 'normal'), false);
});
