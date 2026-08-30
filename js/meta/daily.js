// js/meta/daily.js — 每日任务：进度记录/跨天重置/状态查询/领取（纯函数）
// 进度语义：dailyProgress 存"当日事件计数"，由 recordProgress 在事件发生时递增（非 lifetime 差值）
// 本地日历日比较（parse 后比 y/m/d）：调用方传完整 ISO（含时间），字符串比较会让同日两个时刻永不相等 → 每次都 rollDay 清进度
function sameDay(dateA, todayIso) {
  if (!dateA) return false;
  const da = new Date(dateA);
  const db = new Date(todayIso);
  return da.getFullYear() === db.getFullYear() && da.getMonth() === db.getMonth() && da.getDate() === db.getDate();
}

// 返回 { state }（跨天）或 {} 内无 state（同日，调用方判 undefined 跳过）
function rollDay(state, todayIso) {
  if (sameDay(state.dailyDate, todayIso)) return {};
  return {
    state: { ...state, dailyDate: todayIso, dailyProgress: {}, dailyClaimed: {} },
  };
}

function recordProgress(state, statName, inc, todayIso, config) {
  const rolled = rollDay(state, todayIso).state || state;
  const task = config.daily.tasks.find((t) => t.stat === statName);
  if (!task) return { state: rolled };
  const cur = rolled.dailyProgress[task.id] || 0;
  return {
    state: { ...rolled, dailyProgress: { ...rolled.dailyProgress, [task.id]: Math.min(cur + inc, task.target) } },
  };
}

function taskStatus(state, todayIso, config) {
  const rolled = rollDay(state, todayIso).state || state;
  return config.daily.tasks.map((t) => {
    const progress = rolled.dailyProgress[t.id] || 0;
    const done = progress >= t.target;
    const claimed = !!rolled.dailyClaimed[t.id];
    return {
      id: t.id, desc: t.desc, progress, target: t.target,
      done, claimed, claimable: done && !claimed,
      reward: t.reward,
    };
  });
}

function claim(state, taskId, todayIso, config) {
  const rolled = rollDay(state, todayIso).state || state;
  const task = config.daily.tasks.find((t) => t.id === taskId);
  if (!task) return { ok: false, state: rolled };
  const progress = rolled.dailyProgress[taskId] || 0;
  const already = !!rolled.dailyClaimed[taskId];
  if (progress < task.target || already) return { ok: false, state: rolled };
  return {
    ok: true,
    grant: task.reward,
    state: { ...rolled, dailyClaimed: { ...rolled.dailyClaimed, [taskId]: true } },
  };
}

module.exports = { rollDay, recordProgress, taskStatus, claim };
