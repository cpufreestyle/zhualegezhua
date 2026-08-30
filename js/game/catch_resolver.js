function captureChance(creature, circleZone, config, ballType) {
  const base = config.catch.baseRates[creature.rarity];
  const bonus = circleZone === 'none' ? 1 : config.catch.circleBonus[circleZone];
  const ballMult = (ballType && config.ballTypes[ballType]) ? config.ballTypes[ballType].mult : 1; // 未传或未知球种按 ×1 兜底，老调用不受影响
  return Math.min(config.catch.maxCapture, base * bonus * ballMult);
}
function rollCapture(creature, circleZone, rng, config, ballType) {
  return rng() < captureChance(creature, circleZone, config, ballType);
}
function rollFlee(creature, rng, config) {
  return rng() < config.catch.fleeOnFail[creature.rarity];
}
module.exports = { captureChance, rollCapture, rollFlee };
