function weightedPick(table, rng) {
  let sum = 0;
  for (const k in table) sum += table[k];
  let r = rng() * sum;
  const keys = Object.keys(table);
  for (const k of keys) {
    r -= table[k];
    if (r < 0) return k;
  }
  return keys[keys.length - 1];
}
function rollEncounterCount(rng, config) {
  const { min, max } = config.spawn;
  return min + Math.floor(rng() * (max - min + 1));
}
function rollEncounter(creatures, rng, config) {
  const count = rollEncounterCount(rng, config);
  const list = [];
  for (let i = 0; i < count; i++) {
    const rarity = weightedPick(config.spawn.weights, rng);
    const pool = creatures.filter((c) => c.rarity === rarity);
    const pick = pool[Math.floor(rng() * pool.length)];
    if (!pick) continue; // 权重表配置了 CREATURES 没有的稀有度时跳过，防 undefined 入场
    list.push(pick);
  }
  return list;
}
module.exports = { weightedPick, rollEncounterCount, rollEncounter };
