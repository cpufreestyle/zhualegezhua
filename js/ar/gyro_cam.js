// js/ar/gyro_cam.js — 降级模式：陀螺仪转视角的虚拟房间（桌面/工具里视角固定）
// 小游戏 rAF 是全局函数（canvas.requestAnimationFrame 不存在）；部分宿主提供 canvas 版，故带回退
const raf = (typeof requestAnimationFrame === 'function')
  ? requestAnimationFrame
  : (cb) => canvas.requestAnimationFrame(cb);

function createGyroAR(canvas, THREE, renderer, scene, camera) {
  let yaw = 0; let pitch = -0.15; // 固定微俯视
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(50, 16, 16),
    new THREE.MeshBasicMaterial({ color: 0x8ecae6, side: THREE.BackSide })
  );
  scene.add(sky);
  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(6, 32),
    new THREE.MeshBasicMaterial({ color: 0x9fb8ad })
  );
  floor.rotation.x = -Math.PI / 2;
  scene.add(floor);

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
    },
  };
}
module.exports = { createGyroAR };
