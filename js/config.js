module.exports = {
  economy: { startBalls: 30, newSpeciesBonus: 15, dailyShareBonus: 20 },
  spawn: { min: 3, max: 5, weights: { common: 0.7, rare: 0.25, legendary: 0.05 } },
  catch: {
    baseRates: { common: 0.65, rare: 0.35, legendary: 0.12 },
    circleBonus: { excellent: 2.0, great: 1.5, nice: 1.2 },
    maxCapture: 0.95,
    fleeOnFail: { common: 0.10, rare: 0.12, legendary: 0.15 },
  },
  circle: { r1: 90, r2: 34, periodMs: 1600, zones: { excellent: 0.35, great: 0.7, nice: 1.0 } },
  throw: { gravity: -18, powerScale: 0.012, maxPower: 26, minSwipePx: 24 },
  creature: { scale: 0.28, glbScaleFactor: 1.3, fadeMs: 300, loadTimeoutMs: 10000, wanderRadius: 0.6, wanderIntervalMs: [2000, 4000] },
  planes: { scanTimeoutMs: 8000, secondTimeoutMs: 8000 },
  fpsCap: 30,
};
