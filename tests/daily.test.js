const { test } = require('node:test');
const assert = require('node:assert');
const config = require('../js/config.js');
const daily = require('../js/meta/daily.js');

const st = (over) => ({
  dailyDate: '2026-08-30', dailyProgress: {}, dailyClaimed: {}, ...over,
});
const TODAY = '2026-08-30';
const TOMORROW = '2026-08-31';

test('rollDay：同日不变，跨日清空进度与领取', () => {
  assert.strictEqual(daily.rollDay(st(), TODAY).dailyProgress, undefined); // 返回 undefined 表示无需变化
  const r = daily.rollDay(st({ dailyProgress: { catch3: 2 }, dailyClaimed: { share1: true } }), TOMORROW);
  assert.deepStrictEqual(r.state.dailyProgress, {});
  assert.deepStrictEqual(r.state.dailyClaimed, {});
  assert.strictEqual(r.state.dailyDate, TOMORROW);
});

test('recordProgress：按 stat 名递增对应任务', () => {
  const r = daily.recordProgress(st(), 'catches', 1, TODAY, config);
  assert.strictEqual(r.state.dailyProgress.catch3, 1);
  // excellentHits/shares 记到 nice2/share1
  assert.strictEqual(daily.recordProgress(r.state, 'excellentHits', 1, TODAY, config).state.dailyProgress.nice2, 1);
  assert.strictEqual(daily.recordProgress(r.state, 'shares', 1, TODAY, config).state.dailyProgress.share1, 1);
});

test('recordProgress：跨日自动先 rollDay 再计数', () => {
  const r = daily.recordProgress(st({ dailyProgress: { catch3: 2 } }), 'catches', 1, TOMORROW, config);
  assert.strictEqual(r.state.dailyDate, TOMORROW);
  assert.strictEqual(r.state.dailyProgress.catch3, 1); // 跨天清零后重新计
});

test('recordProgress：无匹配 stat（如 throws）不改任务进度', () => {
  const r = daily.recordProgress(st(), 'throws', 1, TODAY, config);
  assert.deepStrictEqual(r.state.dailyProgress, {});
});

test('taskStatus：进度/完成/可领取三态', () => {
  const s = st({ dailyProgress: { catch3: 3 }, dailyClaimed: {} });
  const list = daily.taskStatus(s, TODAY, config);
  const catch3 = list.find((t) => t.id === 'catch3');
  assert.strictEqual(catch3.progress, 3);
  assert.strictEqual(catch3.done, true);
  assert.strictEqual(catch3.claimable, true);
  const claimed = daily.taskStatus(st({ dailyProgress: { catch3: 3 }, dailyClaimed: { catch3: true } }), TODAY, config);
  assert.strictEqual(claimed.find((t) => t.id === 'catch3').claimable, false);
});

test('claim：可领取时发放奖励并置 claimed；不可领取返回 ok:false', () => {
  const s = st({ dailyProgress: { catch3: 3 } });
  const r = daily.claim(s, 'catch3', TODAY, config);
  assert.strictEqual(r.ok, true);
  assert.deepStrictEqual(r.grant, config.daily.tasks.find((t) => t.id === 'catch3').reward);
  assert.strictEqual(r.state.dailyClaimed.catch3, true);
  const again = daily.claim(r.state, 'catch3', TODAY, config);
  assert.strictEqual(again.ok, false); // 幂等：已领取
  const notDone = daily.claim(st({ dailyProgress: { catch3: 1 } }), 'catch3', TODAY, config);
  assert.strictEqual(notDone.ok, false); // 未完成
});
