const { rollFlee } = require('./catch_resolver.js');

function nextWanderTarget(home, radius, rng) {
  const a = rng() * Math.PI * 2;
  const r = radius * (0.3 + 0.7 * rng());
  return { x: home.x + Math.cos(a) * r, z: home.z + Math.sin(a) * r };
}
function wanderIntervalMs(rng, config) {
  const [a, b] = config.creature.wanderIntervalMs;
  return a + rng() * (b - a);
}
function reactToFailedCapture(creature, rng, config) {
  return { flee: rollFlee(creature, rng, config) }; // 委托 catch_resolver，单一事实源
}
// 运行时：每帧 update(dtMs, applyPos)；受击挣扎由 main 直接触发 scale 抖动，这里只管游走。
// applyPos 契约：每帧回调当前插值位置 {x,z}（同一可变对象引用，消费方即时使用勿缓存；y 由渲染侧按出生平面高度决定）。
// home 为出生锚点（游走目标以其为圆心防漂移），位置事实源在状态机内部。
function createRuntime(creature, home, rng, config) {
  const SPEED = 0.35; // 世界单位/秒
  let state = 'idle';
  let waitMs = config.creature.wanderIntervalMs[0]; // 初始等待取最短间隔
  let target = null;
  let freezeUntil = 0; // 甜甜圈球冻结截止时间戳（Date.now 绝对时间）；0 表示未冻结
  const pos = { x: home.x, z: home.z }; // 当前位置由状态机内部维护（唯一事实源），home 仅作游走锚点
  return {
    get state() { return state; },
    get target() { return target; },
    get freezeUntil() { return freezeUntil; },
    set freezeUntil(v) { freezeUntil = v; },
    update(dtMs, applyPos) {
      const step = SPEED * (dtMs / 1000);
      if (state === 'idle') {
        waitMs -= dtMs;
        if (waitMs <= 0 && Date.now() >= freezeUntil) { // 冻结期不触发新游走（waitMs 继续走，解冻后立刻可触发）
          target = nextWanderTarget(home, config.creature.wanderRadius, rng); // 锚定 spawn 点防漂移
          state = 'wander';
        }
      } else if (state === 'wander') { // else-if 是刻意的：转换帧不位移
        const dx = target.x - pos.x, dz = target.z - pos.z;
        const dist = Math.hypot(dx, dz);
        if (dist <= step) {
          pos.x = target.x; pos.z = target.z; // 到位钳制防过冲
          state = 'idle';
          waitMs = wanderIntervalMs(rng, config);
        } else {
          pos.x += (dx / dist) * step;
          pos.z += (dz / dist) * step;
        }
      }
      applyPos(pos); // 每帧回调当前插值位置 {x,z}
    },
  };
}
module.exports = { nextWanderTarget, wanderIntervalMs, reactToFailedCapture, createRuntime };
