const { test } = require('node:test');
const assert = require('node:assert');
const config = require('../js/config.js');
const eco = require('../js/meta/economy.js');

const st = (over) => ({ balls: 10, lastDailyShare: null, ...over });

test('新物种捕捉 +15', () => {
  const r = eco.applyCatch(st(), true, config);
  assert.strictEqual(r.gained, 15);
  assert.strictEqual(r.state.balls, 25);
});

test('重复物种不补球', () => {
  const r = eco.applyCatch(st(), false, config);
  assert.strictEqual(r.gained, 0);
});

test('每日分享：首日可领 +20 并记录日期', () => {
  const now = '2026-08-28T10:00:00+08:00';
  const r = eco.applyDailyShare(st(), now, config);
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.state.balls, 30);
  assert.strictEqual(r.state.lastDailyShare, now);
});

test('每日分享：同一天二次拒绝', () => {
  const now = '2026-08-28T10:00:00+08:00';
  const later = '2026-08-28T23:00:00+08:00';
  assert.strictEqual(eco.canDailyShare(st({ lastDailyShare: now }), later), false);
});

test('跨天后可再领', () => {
  const now = '2026-08-28T23:00:00+08:00';
  const tomorrow = '2026-08-29T08:00:00+08:00';
  assert.strictEqual(eco.canDailyShare(st({ lastDailyShare: now }), tomorrow), true);
});
// spendBall 测试已随函数迁往 tests/balls.test.js（v0.2 球种统一消耗）
