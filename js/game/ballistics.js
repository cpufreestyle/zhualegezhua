// 滑动轨迹 → 初速度。坐标约定：屏幕 dy 向上滑为负 → 世界 z 向前为正。
// power 由滑动长度与滑动速度共同决定，参数全部在 config.throw，真机手感调参集中改这里。
function computeThrowVelocity(swipe, config) {
  const len = Math.hypot(swipe.dx, swipe.dy);
  if (len < config.throw.minSwipePx) return null;
  const t = Math.max(swipe.ms, 1);
  const swipeSpeed = len / t; // px/ms
  const power = Math.min(config.throw.maxPower, len * config.throw.powerScale)
    * Math.min(1, 0.6 + 0.4 * swipeSpeed);
  const nx = swipe.dx / len;
  const ny = swipe.dy / len; // 负 = 向上
  return { vx: nx * power * 0.8, vy: power * 1.1, vz: -ny * power * 1.6 };
}
module.exports = { computeThrowVelocity };
