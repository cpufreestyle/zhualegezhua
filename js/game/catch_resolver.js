function captureChance(creature, circleZone, config) {
  const base = config.catch.baseRates[creature.rarity];
  const bonus = circleZone === 'none' ? 1 : config.catch.circleBonus[circleZone];
  return Math.min(config.catch.maxCapture, base * bonus);
}
function rollCapture(creature, circleZone, rng, config) {
  return rng() < captureChance(creature, circleZone, config);
}
function rollFlee(creature, rng, config) {
  return rng() < config.catch.fleeOnFail[creature.rarity];
}
module.exports = { captureChance, rollCapture, rollFlee };
