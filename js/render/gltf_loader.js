// js/render/gltf_loader.js — GLB 流式加载：占位体立即显示，模型后台替换，失败静默保留
const config = require('../config.js');
const { registerGLTFLoader } = require('../../libs/gltf-loader.js');

// Task 15 产出的 id → CDN url 清单；文件未产出时回落空表（require 防御，不阻塞游戏）
let GLB_MANIFEST = {};
try { GLB_MANIFEST = require('./glb_manifest.js') || {}; } catch (e) { /* Task 15 未产出时回落 */ }

const FADE_MS = 300; // 模型淡入时长
const warned = { loader: false }; // GLTFLoader 不可用时只告警一次，不刷屏

// 尺寸归一：占位体身体球 r=0.18 圆心 y=0.18（跨度 0~0.36），耳朵顶到 0.40，总高约 0.40；
// 目标整体高 ≈ config.creature.scale * 1.3 = 0.364。制作管线约定：GLB 以 1 单位高、原点脚底归一，
// 故缩放系数即目标高，模型底部与占位体球底同贴 group 原点（y=0）。若后续实际 GLB 比例不符，仅需调此常量。
const MODEL_SCALE = config.creature.scale * 1.3;

const fades = [];            // 淡入补间表 {obj, from, to, t, dur}：模块级复用，完成后尾部换入移除，零逐帧分配
const prefetched = new Set(); // 已开始加载的 url（含失败，避免反复打扰网络）

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

// 成功：清掉占位体网格（body/ears 是 group 的 children），换入 gltf.scene 并登记 300ms 淡入
// 失败/超时：保留占位体（游戏继续），不重试、不阻塞主流程
function attachCreatureGLB(THREE, group, glbUrl, onDone) {
  if (!ensureGLTFLoader(THREE)) return;
  prefetched.add(glbUrl); // 记为已加载/已启动：预取阶段跳过
  const loader = new THREE.GLTFLoader();
  const timer = setTimeout(() => { // 超时按失败处理：r108 DefaultLoadingManager 无 abort，只能放任请求；
    if (loader.manager && loader.manager.abort) loader.manager.abort(); // 占位体继续顶住；模型晚到成功仍会替换（晚到好过不到）
  }, 10000);
  loader.load(glbUrl, (gltf) => {
    clearTimeout(timer);
    while (group.children.length) group.remove(group.children[0]);
    const model = gltf.scene;
    model.scale.setScalar(0.01); // 淡入起点，首帧不闪大
    model.position.y = 0;
    group.add(model);
    // 补间目标是模型本体而非外层 group：group 定位/寻的由 AI 与投掷系统按原点驱动，保持不动
    fades.push({ obj: model, from: 0.01, to: MODEL_SCALE, t: 0, dur: FADE_MS });
    if (onDone) onDone();
  }, undefined, () => { clearTimeout(timer); /* 失败保留占位体，静默 */ });
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

module.exports = { ensureGLTFLoader, attachCreatureGLB, updateFades, prefetchCreatures, resolveGlbUrl };
