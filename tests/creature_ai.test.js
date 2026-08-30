const { test } = require('node:test');
const assert = require('node:assert');
const config = require('../js/config.js');
const ai = require('../js/game/creature_ai.js');

test('游走目标在 home 半径内', () => {
  const home = { x: 0, y: 0, z: -2.5 };
  for (let i = 0; i < 100; i++) {
    const t = ai.nextWanderTarget(home, config.creature.wanderRadius, Math.random);
    const d = Math.hypot(t.x - home.x, t.z - home.z);
    assert.ok(d <= config.creature.wanderRadius + 1e-9);
  }
});

test('受击后按稀有度概率决定是否逃跑', () => {
  const c = { rarity: 'legendary' }; // 0.15
  assert.strictEqual(ai.reactToFailedCapture(c, () => 0.14, config).flee, true);
  assert.strictEqual(ai.reactToFailedCapture(c, () => 0.16, config).flee, false);
});

test('运行时状态机：idle → 拾目标 → wander 到位回 idle', () => {
  const rt = ai.createRuntime({ rarity: 'common' }, { x: 0, y: 0, z: -2.5 }, () => 0.5, config);
  let pos = { x: 0, y: 0, z: -2.5 };
  rt.update(2500, (p) => { pos = p; }); // 超过最短间隔 → 进入 wander
  assert.strictEqual(rt.state, 'wander');
  rt.update(60000, (p) => { pos = p; }); // 足够时间走到目标
  assert.strictEqual(rt.state, 'idle');
});

test('freezeUntil：冻结期内 wander 不触发，解冻后恢复', () => {
  // freezeUntil 以真实 Date.now() 语义存储（生产侧甜甜圈球直接写入绝对时间戳），测试也用真实时钟
  const rt = ai.createRuntime({ rarity: 'common' }, { x: 0, y: 0, z: -2.5 }, () => 0.5, config);
  rt.freezeUntil = Date.now() + 5000;
  rt.update(3000, () => {}); // 超过最短 wander 间隔 2000ms，但冻结中
  assert.strictEqual(rt.state, 'idle'); // 冻结中：不进入 wander
  rt.freezeUntil = 0; // 解冻
  rt.update(3000, () => {});
  assert.strictEqual(rt.state, 'wander'); // 解冻后正常游走
});
