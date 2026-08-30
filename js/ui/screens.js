// js/ui/screens.js — HUD 三屏（开始/图鉴/结算）：离屏 Canvas → CanvasTexture → 全屏正交 quad 透叠
const { CREATURES } = require('../render/creatures.js');
const eco = require('../meta/economy.js'); // Node-safe：判断每日分享是否已领
const ballsMeta = require('../meta/balls.js'); // 局内三球计数条：读各球种余量
const daily = require('../meta/daily.js'); // 结算页任务区：进度/可领状态查询

function createScreens({ THREE, bus, config, canvas }) {
  const info = wx.getSystemInfoSync();
  const uiScale = canvas.width / info.windowWidth; // 逻辑 px → 画布物理 px 缩放
  const W = canvas.width;
  const H = canvas.height;
  const hud = wx.createCanvas(); // 第二次 createCanvas = 离屏画布，仅作纹理源
  hud.width = W;
  hud.height = H;
  const ctx = hud.getContext('2d');

  const tex = new THREE.CanvasTexture(hud);
  tex.generateMipmaps = false; // r108：非 2 次幂尺寸必须关 mipmap，否则纹理黑块
  tex.minFilter = THREE.LinearFilter;

  const scene2 = new THREE.Scene();
  const cam2 = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const quad = new THREE.Mesh(
    new THREE.PlaneGeometry(2, 2),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true })
  );
  scene2.add(quad);

  const RARITY = { common: '普通', rare: '稀有', legendary: '传说' };
  let visible = false;
  let state = null;
  let buttons = []; // [{x,y,w,h,tag}] 画布物理 px，命中检测用
  let cornerText = ''; // 当前角标缓存：drawPlayHud 全屏擦除后按此恢复，否则经典模式标识在局内丢失

  const px = (n) => Math.round(n * uiScale);

  function overlay() { // 半透明压暗底
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, 0, W, H);
  }

  function label(text, x, y, size, color, align, baseline) {
    ctx.fillStyle = color;
    ctx.font = px(size) + 'px sans-serif';
    ctx.textAlign = align || 'center';
    ctx.textBaseline = baseline || 'middle';
    ctx.fillText(text, x, y);
  }

  function button(x, y, w, h, text, tag, fill) { // 画按钮并记录矩形（fill 可选：置灰态用）
    ctx.fillStyle = fill || '#ffd166';
    ctx.fillRect(x, y, w, h);
    label(text, x + w / 2, y + h / 2, 17, '#333');
    buttons.push({ x, y, w, h, tag });
  }

  const centerBtn = (y, text, tag) => button((W - px(200)) / 2, y, px(200), px(46), text, tag);

  // 对局中 HUD：左上三球计数条，选中球高亮；按钮 tag 为 ball:<type>（触摸分发走 ui:tap）
  function drawPlayHud(save, selectedBall) {
    buttons = [];
    ctx.clearRect(0, 0, W, H);
    ctx.textBaseline = 'middle';
    ctx.font = px(13) + 'px sans-serif';
    const types = [['normal', '球'], ['master', '大师'], ['donut', '甜甜圈']];
    types.forEach(([type, labelTxt], i) => {
      const x = px(12) + i * px(76);
      const sel = type === selectedBall;
      ctx.fillStyle = sel ? '#ffd166' : 'rgba(255,255,255,0.25)';
      ctx.fillRect(x, px(12), px(68), px(30));
      ctx.fillStyle = '#333';
      ctx.textAlign = 'left';
      ctx.fillText(labelTxt + '×' + ballsMeta.countOf(save, type), x + px(6), px(27));
      buttons.push({ x, y: px(12), w: px(68), h: px(30), tag: 'ball:' + type });
    });
    if (cornerText) setCornerLabel(cornerText); // 全屏 clearRect 连角标擦掉了：恢复（VK 空角标则跳过）
    tex.needsUpdate = true;
    visible = true;
  }

  function drawStart() {
    label('抓了个抓', W / 2, H * 0.28, 38, '#ffffff');
    centerBtn(H * 0.52, '开始捕捉', 'play');
    centerBtn(H * 0.52 + px(46) + px(18), '我的图鉴', 'dex');
  }

  function drawDex(save) {
    label('我的图鉴', W / 2, H * 0.07, 22, '#ffffff');
    const colW = W / 2;
    const rowH = (H * 0.62) / 4;
    CREATURES.forEach((c, i) => { // 2 列 × 4 行
      const col = i % 2;
      const row = Math.floor(i / 2);
      const x = col * colW + px(14);
      const y = H * 0.13 + row * rowH;
      const rec = save && save.dex[c.id];
      label(c.name + '（' + (RARITY[c.rarity] || c.rarity) + '）', x, y, 14, '#ffffff', 'left');
      const n = rec ? rec.caught : 0;
      label(n > 0 ? '已捕捉 ' + n : '未捕捉', col * colW + colW - px(14), y, 14, n > 0 ? '#ffd166' : '#aaaaaa', 'right');
    });
    const y2 = H * 0.82;
    const claimed = !eco.canDailyShare(save, new Date().toISOString());
    button(W * 0.06, y2, W * 0.42, px(46),
      claimed ? '今日已领' : '分享得' + config.economy.dailyShareBonus + '球',
      'share', claimed ? '#9aa0a6' : undefined); // 已领置灰提示，tag 不变仍可重分享（收益不发）
    button(W * 0.52, y2, W * 0.42, px(46), '返回', 'back');
  }

  function setCornerLabel(text) { // 对局中右上角常驻小字：经典模式标识；空串擦除角部
    cornerText = text; // 记录当前角标：供 drawPlayHud 全屏重绘后恢复
    if (text) {
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      ctx.font = px(24) + 'px sans-serif';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, W - px(16), px(40));
    } else {
      ctx.clearRect(W - px(120), 0, px(120), px(56)); // 收窄到 px(120)：px(160) 会裁掉甜甜圈球芯片右缘（芯片止于 px(232)），120 仍盖住"经典模式"四字（≈96px + 8px 余量）
    }
    tex.needsUpdate = true;
  }

  function drawResult(save, reason) {
    label(reason === 'balls' ? '球用完啦！' : (reason === 'cleared' ? '全都抓到啦！' : '精灵都跑光了'),
      W / 2, H * 0.26, 30, '#ffffff');
    label('累计捕捉 ' + save.stats.catches + ' | 命中 ' + save.stats.hits + ' | 出手 ' + save.stats.throws,
      W / 2, H * 0.38, 16, '#dddddd');
    // 今日任务区：进度 + 可领取红点 + 领取按钮（tag: claim:<taskId>）
    daily.taskStatus(save, new Date().toISOString(), config).forEach((t, i) => {
      const y = H * 0.52 + i * px(34);
      ctx.textAlign = 'left';
      ctx.fillStyle = t.claimed ? '#9aa0a6' : (t.claimable ? '#ffd166' : '#fff');
      ctx.font = px(13) + 'px sans-serif';
      ctx.textBaseline = 'middle';
      const rewardStr = t.reward.donut ? ('🍩×' + t.reward.donut) : ('球×' + t.reward.balls);
      ctx.fillText((t.claimable ? '● ' : '') + t.desc + '  ' + t.progress + '/' + t.target + '  →' + rewardStr, px(24), y);
      if (t.claimable) buttons.push({ x: W - px(90), y: y - px(18), w: px(76), h: px(26), tag: 'claim:' + t.id });
    });
    centerBtn(H * 0.68, '再来一局', 'play');
    centerBtn(H * 0.68 + px(64), '查看图鉴', 'dex');
  }

  // 捕捉瞬间浮层：大字庆祝 + 分享/继续（分享动作 Task 7 接线，此处仅 UI）
  function showCatchMoment(save, creatureName) {
    state = 'moment';
    buttons = [];
    overlay();
    label('抓到了！' + creatureName, W / 2, H * 0.38, 28, '#fff');
    centerBtn(H * 0.52, '📷 分享这一刻', 'shareMoment');
    centerBtn(H * 0.66, '继续', 'continue');
    tex.needsUpdate = true;
    visible = true;
  }

  function show(next, save, reason) {
    state = next;
    buttons = [];
    ctx.clearRect(0, 0, W, H);
    overlay();
    if (next === 'start') drawStart();
    else if (next === 'dex') drawDex(save);
    else if (next === 'result') drawResult(save, reason);
    tex.needsUpdate = true; // r108 CanvasTexture 每次重绘后必须手动标记
    visible = true;
  }

  function hide() {
    ctx.clearRect(0, 0, W, H);
    tex.needsUpdate = true;
    buttons = [];
    state = null;
    cornerText = ''; // 清角标缓存：防上局"经典模式"在下一局 drawPlayHud 恢复时闪现
    visible = false;
  }

  wx.onTouchStart((e) => { // HUD 显示时接管命中检测，未显示直接吞掉
    if (!visible) return;
    const t = e.touches[0];
    const x = t.clientX * uiScale;
    const y = t.clientY * uiScale;
    for (let i = 0; i < buttons.length; i++) {
      const b = buttons[i];
      if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) {
        bus.emit('ui:tap', { tag: b.tag, state });
        return; // 只响应最先命中的按钮
      }
    }
  });

  return {
    show,
    hide,
    setCornerLabel,
    drawPlayHud,
    showCatchMoment,
    scene2,
    cam2,
    get visible() { return visible; },
    get state() { return state; }, // 暴露当前屏名：game.js 的 hud:refresh 凭 'moment' 守卫不擦捕捉瞬间浮层
  };
}
module.exports = { createScreens };
