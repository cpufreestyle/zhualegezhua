// js/meta/balls.js — 三种球的定义查询/消耗/奖励/彩蛋（纯函数，不感知 wx）
function typeDef(type, config) {
  return config.ballTypes[type] || config.ballTypes.normal;
}

// 单类型计数（HUD 展示与切换守卫共用）
function countOf(state, type) {
  return type === 'master' ? (state.masterBalls || 0) : (type === 'donut' ? (state.donutBalls || 0) : (state.balls || 0));
}

function totalBalls(state) {
  return countOf(state, 'normal') + countOf(state, 'master') + countOf(state, 'donut');
}

function hasAnyBall(state) {
  return totalBalls(state) > 0;
}

function spendBall(state, type) {
  const key = type === 'master' ? 'masterBalls' : (type === 'donut' ? 'donutBalls' : 'balls');
  if ((state[key] || 0) <= 0) return { ok: false, state };
  return { ok: true, state: { ...state, [key]: state[key] - 1 } };
}

// 奖励统一入口：grant = { balls?, master?, donut? }（图鉴成就/任务/彩蛋共用）；返回 { state } 与 spendBall 等保持同形
function grantBalls(state, grant) {
  const next = { ...state };
  if (grant.balls) next.balls = (next.balls || 0) + grant.balls;
  if (grant.master) next.masterBalls = (next.masterBalls || 0) + grant.master;
  if (grant.donut) next.donutBalls = (next.donutBalls || 0) + grant.donut;
  return { state: next };
}

// 隐藏彩蛋：累计每 10 次出手 +1 甜甜圈球（throws 为累计值，恰好是 10 的倍数时触发）
function donutEasterEgg(state, throws) {
  if (throws > 0 && throws % 10 === 0) {
    return { granted: true, state: grantBalls(state, { donut: 1 }).state };
  }
  return { granted: false, state };
}

module.exports = { typeDef, countOf, totalBalls, hasAnyBall, spendBall, grantBalls, donutEasterEgg };
