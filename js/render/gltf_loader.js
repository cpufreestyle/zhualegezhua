// js/render/gltf_loader.js — GLB 流式加载：占位体立即显示，模型后台替换，失败静默保留
// 官方 shim 用 wx.arrayBufferToBase64 把 GLB 内嵌贴图转 base64 data URI——该 API 属小程序侧，
// 小游戏运行时缺失（实测 lib 3.16.2 报 "wx.arrayBufferToBase64 is not a function"）→ 自实现 polyfill。
// 放在 require 官方 shim 之前：shim 运行期直接引用 wx.arrayBufferToBase64。
(function polyfillArrayBufferToBase64() {
  if (typeof wx === 'undefined' || typeof wx.arrayBufferToBase64 === 'function') return;
  const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  wx.arrayBufferToBase64 = function (buf) {
    const bytes = new Uint8Array(buf);
    let out = '';
    for (let i = 0; i < bytes.length; i += 3) {
      const b0 = bytes[i];
      const b1 = bytes[i + 1];
      const b2 = bytes[i + 2];
      out += B64[b0 >> 2];
      out += B64[((b0 & 0x03) << 4) | ((b1 === undefined ? 0 : b1) >> 4)];
      out += b1 === undefined ? '=' : B64[((b1 & 0x0f) << 2) | ((b2 === undefined ? 0 : b2) >> 6)];
      out += b2 === undefined ? '=' : B64[b2 & 0x3f];
    }
    return out;
  };
})();

const config = require('../config.js');
const { registerGLTFLoader } = require('../../libs/gltf-loader.js');

// Task 15 产出的 id → CDN url 清单；文件未产出时回落空表（require 防御，不阻塞游戏）
let GLB_MANIFEST = {};
try { GLB_MANIFEST = require('./glb_manifest.js') || {}; } catch (e) { /* Task 15 未产出时回落 */ }

const FADE_MS = config.creature.fadeMs; // 模型淡入时长
const LOAD_TIMEOUT_MS = config.creature.loadTimeoutMs; // GLB 加载超时：超时按失败处理，占位体继续顶住
const RETRY_DELAY_MS = 20000; // GLB 失败后的后台重试间隔：每 URL 只重试一次，不阻塞主流程
const warned = { loader: false }; // GLTFLoader 不可用时只告警一次，不刷屏

// 尺寸归一：占位体身体球 r=0.18 圆心 y=0.18（跨度 0~0.36），耳朵顶到 0.40，总高约 0.40；
// 目标整体高 ≈ config.creature.scale * config.creature.glbScaleFactor = 0.364。制作管线约定：GLB 以 1 单位高、原点脚底归一，
// 故缩放系数即目标高，模型底部与占位体球底同贴 group 原点（y=0）。若后续实际 GLB 比例不符，仅需调 config.creature.glbScaleFactor。
const MODEL_SCALE = config.creature.scale * config.creature.glbScaleFactor;

const fades = [];            // 淡入补间表 {obj, from, to, t, dur}：模块级复用，完成后尾部换入移除，零逐帧分配
const prefetched = new Set(); // 已开始加载的 url（含失败，避免反复打扰网络）
const retried = new Set();    // 已后台重试过的 url：每 URL 只补试一次，防止无限重试风暴

function resolveGlbUrl(creature) { // 优先 creature.glbUrl，其次 Task 15 清单，空串视为无模型
  return creature.glbUrl || GLB_MANIFEST[creature.id] || '';
}

function ensureGLTFLoader(THREE) { // 官方 shim 把 GLTFLoader 挂上 THREE 命名空间（幂等）
  if (THREE.GLTFLoader) return true;
  try { registerGLTFLoader(THREE); } catch (e) { /* 注册异常按不可用处理 */ }
  if (!THREE.GLTFLoader) {
    if (!warned.loader) {
      warned.loader = true;
      console.warn('[gltf] THREE.GLTFLoader 不可用，精灵保持占位体（游戏继续）');
    }
    return false;
  }
  return true;
}

// 确定性失败（网络错误/解析失败）的后台重试：每 URL 只补一次，超时不算失败（请求仍在飞，晚到自会成功）
function scheduleRetry(THREE, group, glbUrl) {
  if (retried.has(glbUrl)) return;
  retried.add(glbUrl);
  setTimeout(() => { attachCreatureGLB(THREE, group, glbUrl); }, RETRY_DELAY_MS); // 后台补试；再失败即放弃，占位体顶住
}

// 释放一个未挂进场景的模型（迟到模型防泄漏）
function disposeDetachedModel(model) {
  model.traverse((n) => {
    if (n.geometry) n.geometry.dispose();
    if (n.material) {
      const mats = Array.isArray(n.material) ? n.material : [n.material];
      mats.forEach((m) => { Object.values(m).forEach((v) => { if (v && v.isTexture) v.dispose(); }); m.dispose(); });
    }
  });
}

// 成功：清掉占位体网格（body/ears 是 group 的 children），换入 gltf.scene 并登记 300ms 淡入
// 失败：保留占位体（游戏继续），确定性失败后台重试一次，不阻塞主流程
function attachCreatureGLB(THREE, group, glbUrl, onDone) {
  if (!ensureGLTFLoader(THREE)) return;
  prefetched.add(glbUrl); // 记为已加载/已启动：预取阶段跳过
  const loader = new THREE.GLTFLoader();
  const timer = setTimeout(() => { // 超时按失败处理：r108 DefaultLoadingManager 无 abort，只能放任请求；
    if (loader.manager && loader.manager.abort) loader.manager.abort(); // 占位体继续顶住；模型晚到成功仍会替换（晚到好过不到）
  }, LOAD_TIMEOUT_MS);
  loader.load(glbUrl, (gltf) => {
    clearTimeout(timer);
    if (!group.parent) { // 加载期间精灵已被捕获/逃跑（组已脱离场景）：模型无处安放，立即释放防 GPU 泄漏
      disposeDetachedModel(gltf.scene);
      return;
    }
    for (let i = group.children.length - 1; i >= 0; i--) { // 只清占位体（身体/耳朵）；投影盘 isShadow 保留（共享资源，不随换模清除）
      const ch = group.children[i];
      if (!(ch.userData && ch.userData.isShadow)) group.remove(ch);
    }
    const model = gltf.scene;
    model.scale.setScalar(0.01); // 淡入起点，首帧不闪大
    model.position.y = 0;
    group.add(model);
    group.userData.glbModel = model; // 登记模型本体：移除精灵时按此回收 GPU 资源（占位体无此标记，天然不受影响）
    // 补间目标是模型本体而非外层 group：group 定位/寻的由 AI 与投掷系统按原点驱动，保持不动
    fades.push({ obj: model, from: 0.01, to: MODEL_SCALE, t: 0, dur: FADE_MS });
    if (onDone) onDone();
  }, undefined, () => { clearTimeout(timer); scheduleRetry(THREE, group, glbUrl); /* 确定性失败：占位体顶住，后台补试一次 */ });
}

function updateFades(dtMs) { // 每帧推进淡入（game.js 主循环调用）；逆序遍历 + 尾部换入移除，零分配
  for (let i = fades.length - 1; i >= 0; i--) {
    const f = fades[i];
    f.t += dtMs;
    const k = f.t >= f.dur ? 1 : f.t / f.dur;
    f.obj.scale.setScalar(f.from + (f.to - f.from) * k);
    if (k >= 1) {
      fades[i] = fades[fades.length - 1];
      fades.pop();
    }
  }
}

// 释放精灵 GLB 模型的 GPU 资源；占位体共享缓存(creatures.js)不在 glbModel 之下，不受影响
function disposeCreature(obj) {
  const model = obj && obj.userData && obj.userData.glbModel;
  if (!model) return;
  model.traverse((n) => {
    if (n.geometry) n.geometry.dispose();
    if (n.material) {
      const mats = Array.isArray(n.material) ? n.material : [n.material];
      mats.forEach((m) => {
        Object.values(m).forEach((v) => { if (v && v.isTexture) v.dispose(); });
        m.dispose();
      });
    }
  });
  obj.userData.glbModel = null;
}

const noop = () => {};
function prefetchCreatures(THREE) { // 捕捉当前精灵时预取其余 GLB：命中适配层 HTTP 缓存，下次出场即换模型
  if (!ensureGLTFLoader(THREE)) return;
  const { CREATURES } = require('./creatures.js'); // 懒取：模块加载期反向 require 会拿到空 exports（循环依赖）
  CREATURES.forEach((c) => {
    const url = resolveGlbUrl(c);
    if (!url || prefetched.has(url)) return;
    prefetched.add(url);
    try {
      new THREE.GLTFLoader().load(url, noop, undefined, noop); // 裸加载进缓存，解析结果弃置
    } catch (e) { /* 预取失败静默：正式加载时再真实暴露 */ }
  });
}

module.exports = { ensureGLTFLoader, attachCreatureGLB, updateFades, prefetchCreatures, resolveGlbUrl, disposeCreature, MODEL_SCALE, FADE_MS };
