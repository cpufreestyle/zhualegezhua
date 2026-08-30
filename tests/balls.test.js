const { test } = require('node:test');
const assert = require('node:assert');
const config = require('../js/config.js');
const balls = require('../js/meta/balls.js');

const st = (over) => ({ balls: 5, masterBalls: 2, donutBalls: 1, ...over });

test('hasAnyBall：任一球 > 0 即可继续对局', () => {
  assert.strictEqual(balls.hasAnyBall(st({ balls: 0, donutBalls: 0 })), true);   // master 2
  assert.strictEqual(balls.hasAnyBall(st({ balls: 0, masterBalls: 0, donutBalls: 0 })), false);
});

test('spendBall：按类型扣减，无该球返回 ok:false', () => {
  assert.deepStrictEqual(balls.spendBall(st(), 'master').state.masterBalls, 1);
  assert.strictEqual(balls.spendBall(st({ masterBalls: 0 }), 'master').ok, false);
  assert.deepStrictEqual(balls.spendBall(st(), 'normal').state.balls, 4);
});

test('spendBall：默认类型 normal（向后兼容）', () => {
  assert.deepStrictEqual(balls.spendBall(st()).state.balls, 4);
});

test('grantBalls：奖励发放（图鉴/任务/彩蛋统一入口）', () => {
  const r = balls.grantBalls(st(), { master: 1, donut: 2 });
  assert.deepStrictEqual([r.state.masterBalls, r.state.donutBalls], [3, 3]);
});

test('donutEasterEgg：每 10 次出手 +1 甜甜圈球（209 不发，210 发）', () => {
  assert.strictEqual(balls.donutEasterEgg(st(), 209).granted, false);
  assert.strictEqual(balls.donutEasterEgg(st(), 210).granted, true);
  assert.strictEqual(balls.donutEasterEgg(st(), 210).state.donutBalls, 2);
});

test('typeDef：从 config 取球定义（颜色/倍率/冻结）', () => {
  assert.strictEqual(balls.typeDef('master', config).mult, 1.6);
  assert.strictEqual(balls.typeDef('donut', config).freezeMs, 5000);
  assert.deepStrictEqual(balls.typeDef('normal', config).color, 0xffffff);
});

test('totalBalls：三球总数（HUD 展示用）', () => {
  assert.strictEqual(balls.totalBalls(st()), 8);
});

test('countOf：单类型计数（HUD 守卫共用）', () => {
  assert.strictEqual(balls.countOf(st(), 'master'), 2);
  assert.strictEqual(balls.countOf(st(), 'donut'), 1);
  assert.strictEqual(balls.countOf(st(), 'normal'), 5);
  assert.strictEqual(balls.countOf(st({ balls: undefined }), 'normal'), 0);
});
