const { test } = require('node:test');
const assert = require('node:assert');
const config = require('../js/config.js');
const bl = require('../js/game/ballistics.js');

test('短滑（< minSwipePx）返回 null 不投掷', () => {
  assert.strictEqual(bl.computeThrowVelocity({ dx: 5, dy: -5, ms: 100 }, config), null);
});

test('竖直上滑：向前 vz 为正，vx≈0，vy 为正（抛物弧）', () => {
  const v = bl.computeThrowVelocity({ dx: 0, dy: -300, ms: 200 }, config);
  assert.ok(v.vx > -0.001 && v.vx < 0.001);
  assert.ok(v.vz > 0);
  assert.ok(v.vy > 0);
  assert.ok(v.vz <= config.throw.maxPower * 1.6 + 0.001); // 上限保护
});

test('斜滑：vx 方向与 dx 同号', () => {
  const v = bl.computeThrowVelocity({ dx: 150, dy: -250, ms: 150 }, config);
  assert.ok(v.vx > 0);
});

test('更长更快滑动 → 速度更大', () => {
  const weak = bl.computeThrowVelocity({ dx: 0, dy: -120, ms: 400 }, config);
  const strong = bl.computeThrowVelocity({ dx: 0, dy: -300, ms: 80 }, config);
  assert.ok(strong.vz > weak.vz);
});
