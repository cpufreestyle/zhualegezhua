function applyCatch(state, isNewSpecies, config) {
  const gained = isNewSpecies ? config.economy.newSpeciesBonus : 0;
  return { gained, state: { ...state, balls: state.balls + gained } };
}
function sameDay(a, b) {
  const da = new Date(a); const db = new Date(b);
  return da.getFullYear() === db.getFullYear() && da.getMonth() === db.getMonth() && da.getDate() === db.getDate();
}
function canDailyShare(state, now) {
  return !state.lastDailyShare || !sameDay(state.lastDailyShare, now);
}
function applyDailyShare(state, now, config) {
  if (!canDailyShare(state, now)) return { ok: false, gained: 0, state };
  return {
    ok: true,
    gained: config.economy.dailyShareBonus,
    state: { ...state, balls: state.balls + config.economy.dailyShareBonus, lastDailyShare: now },
  };
}
// spendBall 已移至 js/meta/balls.js（v0.2 球种系统统一三球消耗），此处不再保留旧的单球版
module.exports = { applyCatch, canDailyShare, applyDailyShare, sameDay };
