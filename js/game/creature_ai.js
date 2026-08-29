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
// 运行时：每帧 update(dtMs, applyPos)；受击挣扎由 main 直接触发 scale 抖动，这里只管游走
// 语义约定：home 传"当前锚定点"，applyPos(state==='wander' ? target : null) 通知渲染侧插值移动
function createRuntime(creature, home, rng, config) {
  const SPEED = 0.35; // 世界单位/秒
  let state = 'idle';
  let waitMs = config.creature.wanderIntervalMs[0]; // 初始等待取最短间隔：超过即进入首次游走
  let target = null;
  return {
    get state() { return state; },
    get target() { return target; },
    update(dtMs, applyPos) {
      const dt = dtMs / 1000;
      if (state === 'idle') {
        waitMs -= dtMs;
        if (waitMs <= 0) {
          target = nextWanderTarget(home, config.creature.wanderRadius, rng);
          state = 'wander';
        }
      } else if (state === 'wander') {
        const dx = target.x - home.x, dz = target.z - home.z;
        // home 即当前位置语义：由 applyPos 侧维护 home 最近位置
        const dist = Math.hypot(dx, dz);
        const step = SPEED * dt;
        if (dist <= step) { state = 'idle'; waitMs = wanderIntervalMs(rng, config); }
      }
      applyPos(state === 'wander' ? target : null);
    },
  };
}
module.exports = { nextWanderTarget, wanderIntervalMs, reactToFailedCapture, createRuntime };
