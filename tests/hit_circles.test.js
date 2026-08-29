const { test } = require('node:test');
const assert = require('node:assert');
const config = require('../js/config.js');
const hc = require('../js/game/hit_circles.js');

test('半径在 r1→r2 之间往复（ping-pong）', () => {
  const r0 = hc.circleRadius(0, config);                 // 最大
  const rHalf = hc.circleRadius(800, config);            // 1600ms 周期中点 = 最小
  const rFull = hc.circleRadius(1600, config);           // 回到最大
  assert.strictEqual(r0, config.circle.r1);
  assert.strictEqual(rHalf, config.circle.r2);
  assert.strictEqual(rFull, config.circle.r1);
});

test('分区判定：越靠圈心评价越高', () => {
  assert.strictEqual(hc.judgeHit(10, 100, config), 'excellent');   // 0.10 ≤ 0.35
  assert.strictEqual(hc.judgeHit(50, 100, config), 'great');       // 0.50 ≤ 0.70
  assert.strictEqual(hc.judgeHit(90, 100, config), 'nice');        // 0.90 ≤ 1.0
  assert.strictEqual(hc.judgeHit(120, 100, config), 'none');
});

test('退化半径（0/NaN）→ none', () => {
  assert.strictEqual(hc.judgeHit(10, 0, config), 'none');
  assert.strictEqual(hc.judgeHit(10, NaN, config), 'none');
});

test('分区边界为闭区间（≤）', () => {
  assert.strictEqual(hc.judgeHit(35, 100, config), 'excellent');
  assert.strictEqual(hc.judgeHit(70, 100, config), 'great');
  assert.strictEqual(hc.judgeHit(100, 100, config), 'nice');
});
