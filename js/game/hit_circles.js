function circleRadius(elapsedMs, config) {
  const { r1, r2, periodMs } = config.circle;
  const raw = (elapsedMs % periodMs) / periodMs;
  const p = raw < 0.5 ? raw * 2 : (1 - raw) * 2;
  return r1 + (r2 - r1) * p;
}
function judgeHit(dist, radius, config) {
  const ratio = Number.isFinite(radius) && radius > 0 ? dist / radius : Infinity;
  const z = config.circle.zones;
  if (ratio <= z.excellent) return 'excellent';
  if (ratio <= z.great) return 'great';
  if (ratio <= z.nice) return 'nice';
  return 'none';
}
module.exports = { circleRadius, judgeHit };
