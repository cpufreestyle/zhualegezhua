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
        if (!(typeof wx.isVKSupport === 'function' && wx.isVKSupport('v2'))) {
          return startGyro('设备不支持 VK', resolve);
        }
        const vk = createVKAR(canvas, THREE, renderer);
        timer = setTimeout(() => { // start 迟迟不回调
          if (stopped) return;
          if (mode) return;
          try { vk.stop(); } catch (e) { /* 忽略 */ }
          startGyro('VK 启动超时', resolve);
        }, scanTimeoutMs);
        vk.start((err) => {
          if (stopped) return;
          if (mode) return;
          clearTimeout(timer);
          if (err) return startGyro('VK 启动失败: ' + err, resolve);
          impl = vk; mode = 'vk';
          resolve({ mode });
        });
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
