// js/ui/photo.js — 捕捉瞬间截图合成 + 分享 + ref 裂变判定（wx 依赖集中在工厂内，模块顶层 Node 安全）
function createPhoto({ canvas }) {
  let lastTempPath = null; // 最近一次合成成功路径（分享用）；任一步失败置 null 走无图回退

  function captureMoment() {
    try {
      wx.canvasToTempFilePath({
        canvas, // 主 canvas：VK 模式含相机底图（renderer 刚画完捕捉瞬间帧）
        success: (res) => { lastTempPath = res.tempFilePath; },
        fail: () => { lastTempPath = null; },
      });
    } catch (e) { lastTempPath = null; }
  }

  function shareCatchMoment(creatureName) {
    const opts = { title: '我在房间里抓到了' + creatureName + '！来抓个抓～', query: 'ref=1' };
    if (lastTempPath) opts.imageUrl = lastTempPath;
    try { wx.shareAppMessage(opts); } catch (e) { /* 工具内模拟：不崩 */ }
    lastTempPath = null;
  }

  return { captureMoment, shareCatchMoment };
}

// 新档首启 ref 礼：被分享者 +10 球（一次性防刷：存档标记）
function applyRefBonus(save, launchQuery, config, grant) {
  if (save.refBonusClaimed) return { granted: false, state: save };
  if (!launchQuery || !launchQuery.ref) return { granted: false, state: save };
  return {
    granted: true,
    state: { ...grant(save, { balls: config.share.refBonus }).state, refBonusClaimed: true },
  };
}

module.exports = { createPhoto, applyRefBonus };
