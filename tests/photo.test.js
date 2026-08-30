const { test } = require('node:test');
const assert = require('node:assert');
const config = require('../js/config.js');
const { applyRefBonus } = require('../js/ui/photo.js');
const { grantBalls } = require('../js/meta/balls.js');

const fresh = { balls: 30, refBonusClaimed: false };

test('ref 裂变：带 ref 的新档 +10 球并置标记', () => {
  const r = applyRefBonus(fresh, { ref: '1' }, config, grantBalls);
  assert.strictEqual(r.granted, true);
  assert.strictEqual(r.state.balls, 40);
  assert.strictEqual(r.state.refBonusClaimed, true);
});

test('ref 防刷：已领过不再发', () => {
  const r = applyRefBonus({ ...fresh, refBonusClaimed: true }, { ref: '1' }, config, grantBalls);
  assert.strictEqual(r.granted, false);
});

test('无 ref 参数：正常启动零影响', () => {
  assert.strictEqual(applyRefBonus(fresh, {}, config, grantBalls).granted, false);
  assert.strictEqual(applyRefBonus(fresh, null, config, grantBalls).granted, false);
});
