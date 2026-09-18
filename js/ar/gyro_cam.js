// js/ar/gyro_cam.js — 降级模式：陀螺仪转视角的虚拟房间（桌面/工具里视角固定）
// 小游戏 rAF 是全局函数（canvas.requestAnimationFrame 不存在）；部分宿主提供 canvas 版，故带回退
const raf = (typeof requestAnimationFrame === 'function')
  ? requestAnimationFrame
  : (cb) => canvas.requestAnimationFrame(cb);

// 渐变贴图：模块级缓存（每局新建 AR 会话复用，避免重复建离屏 canvas/上传纹理）
let skyTexCache = null;
let floorTexCache = null;

function makeSkyTexture() { // 天幕竖向渐变：顶部天蓝 → 地平线暖白（比纯色更有空间感）
  if (skyTexCache) return skyTexCache;
  const c = wx.createCanvas();
  c.width = 4; c.height = 256;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, '#6ec6e8');
  grad.addColorStop(0.55, '#bfe6f2');
  grad.addColorStop(1, '#f6efe2');
  g.fillStyle = grad;
  g.fillRect(0, 0, 4, 256);
  skyTexCache = c;
  return c;
}

function makeFloorTexture() { // 地面：径向渐变（中心亮 → 边缘暗）+ 同心环纹理做纵深线索
  if (floorTexCache) return floorTexCache;
  const S = 256;
  const c = wx.createCanvas();
  c.width = S; c.height = S;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(S / 2, S / 2, S * 0.05, S / 2, S / 2, S / 2);
  grad.addColorStop(0, '#c8d6c9');
  grad.addColorStop(0.6, '#a9bdae');
  grad.addColorStop(1, '#8ea596');
  g.fillStyle = grad;
  g.fillRect(0, 0, S, S);
  g.strokeStyle = 'rgba(255,255,255,0.12)'; // 细同心环：弱对比，只做纵深暗示
  g.lineWidth = 1;
  for (let r = 18; r < S / 2; r += 18) {
    g.beginPath();
    g.arc(S / 2, S / 2, r, 0, Math.PI * 2);
    g.stroke();
  }
  floorTexCache = c;
  return c;
}

function createGyroAR(canvas, THREE, renderer, scene, camera) {
  let yaw = 0; let pitch = -0.15; // 固定微俯视
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(50, 24, 16),
    new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(makeSkyTexture()), side: THREE.BackSide })
  );
  scene.add(sky);
  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(6, 48),
    new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(makeFloorTexture()) })
  );
  floor.rotation.x = -Math.PI / 2;
  scene.add(floor);
  // 雾：地平线暖白 → 地面圆盘边缘自然融进天幕，消除硬边
  scene.fog = new THREE.Fog(0xe8eef0, 4.5, 13);

  camera.matrixAutoUpdate = true;
  camera.position.set(0, 1.4, 0);
  camera.rotation.order = 'YXZ';
  camera.rotation.set(pitch, yaw, 0);
  // 裸 Camera 是恒等投影矩阵：陀螺仪模式必须自建透视矩阵，否则场景整体被裁成黑屏
  const fov = 70 * Math.PI / 180, near = 0.01, far = 100;
  const top = near * Math.tan(fov / 2), h = 2 * top, w = (canvas.width / canvas.height) * h;
  camera.projectionMatrix.makePerspective(-w / 2, w / 2, top, -top, near, far);
  camera.projectionMatrixInverse.getInverse(camera.projectionMatrix);

  function start() {
    if (typeof wx.onDeviceMotionChange === 'function' && wx.startDeviceMotionListening) {
      wx.startDeviceMotionListening({ interval: 'game', fail: (e) => console.warn('device motion 不可用', e) });
      wx.onDeviceMotionChange((res) => { // alpha 偏航 / beta 俯仰 近似映射，够用于伪 AR
        yaw = -res.alpha * Math.PI / 180;
        pitch = clamp((res.beta - 90) * Math.PI / 180, -1.2, 1.2);
        camera.rotation.set(pitch, yaw, 0);
      });
    }
    return Promise.resolve();
  }
  return {
    getSpawnCenter() { return { x: 0, y: 0, z: -2.5 }; }, // 假想地面固定点
    renderFrame() { renderer.autoClearColor = true; return null; },
    loop(cb) {
      const onFrame = () => { cb(); raf(onFrame); };
      raf(onFrame);
    },
    start,
    stop() {
      wx.offDeviceMotionChange && wx.offDeviceMotionChange();
      wx.stopDeviceMotionListening && wx.stopDeviceMotionListening();
      // 每局新建 AR 会话：回收天空球/地面网格，否则随局数累积泄漏 GPU 资源
      scene.remove(sky);
      sky.geometry.dispose();
      sky.material.dispose();
      scene.remove(floor);
      floor.geometry.dispose();
      floor.material.dispose();
      scene.fog = null; // 雾也随会话回收：否则菜单/结算页的 3D 底被雾影响
    },
  };
}
module.exports = { createGyroAR };
