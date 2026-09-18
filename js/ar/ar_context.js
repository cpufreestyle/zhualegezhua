// js/ar/ar_context.js — VK 优先 → 失败/超时降级陀螺仪。游戏层只面向本模块。
const { createVKAR } = require('./vk_session.js');
const { createGyroAR } = require('./gyro_cam.js');

function createARContext({ canvas, THREE, renderer, scene, camera, scanTimeoutMs, preferGyro }) {
  let impl = null;
  let mode = null;
  let stopped = false; // stop() 竞态闸门：封死“先 stop 后 start”的僵尸会话
  let timer = null; // 提升到闭包层，stop() 才能取消启动超时计时
  const startGyro = (reason, resolve) => {
    if (stopped) return;
    impl = createGyroAR(canvas, THREE, renderer, scene, camera);
    mode = 'gyro';
    impl.start().then(() => resolve({ mode, reason }));
  };
  return {
    get mode() { return mode; },
    start() {
      return new Promise((resolve) => {
        if (preferGyro) return startGyro('强制经典模式', resolve); // 扫描二次超时降级：跳过 VK 支持检测直接走陀螺仪
        // 开发者工具：无真实相机帧且 VK 运行时不完整 → 直接经典模式（spec：工具内自动走经典模式）
        let platform = '';
        try { platform = (wx.getSystemInfoSync() || {}).platform || ''; } catch (e) { /* 取不到按真机处理 */ }
        if (platform === 'devtools') return startGyro('开发者工具：经典模式', resolve);
        if (!(typeof wx.isVKSupport === 'function' && wx.isVKSupport('v2'))) {
          return startGyro('设备不支持 VK', resolve);
        }
        let vk = null;
        try {
          vk = createVKAR(canvas, THREE, renderer); // 构造期可能抛（如缺 OES_vertex_array_object / WebGL 上下文异常）
        } catch (e) {
          return startGyro('VK 初始化异常: ' + (e && e.message), resolve); // 兜底：绝不让异常冒泡冻结 UI
        }
        timer = setTimeout(() => { // start 迟迟不回调
          if (stopped) return;
          if (mode) return;
          try { vk.stop(); } catch (e) { /* 忽略 */ }
          startGyro('VK 启动超时', resolve);
        }, scanTimeoutMs);
        try {
          vk.start((err) => {
            if (stopped) return;
            if (mode) return;
            clearTimeout(timer);
            if (err) return startGyro('VK 启动失败: ' + err, resolve);
            impl = vk; mode = 'vk';
            resolve({ mode });
          });
        } catch (e) {
          clearTimeout(timer);
          startGyro('VK 启动异常: ' + (e && e.message), resolve);
        }
      });
    },
    getPlaneAnchor() { return mode === 'vk' ? impl.getPlaneAnchor() : null; },
    getSpawnCenter() { return mode === 'vk' ? null : impl.getSpawnCenter(); }, // vk 用锚点矩阵
    setTracking(v) { if (mode === 'vk') impl.setTracking(v); },
    renderFrame() { return mode === 'vk' ? impl.renderFrame(camera) : impl.renderFrame(); },
    loop(cb) { impl.loop(cb); },
    stop() { stopped = true; clearTimeout(timer); if (impl) impl.stop(); },
  };
}
module.exports = { createARContext };
