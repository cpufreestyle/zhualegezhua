// js/ar/gyro_cam.js — 降级模式：陀螺仪转视角的虚拟房间（桌面/工具里视角固定）
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

  function start() {
    if (typeof wx.onDeviceMotionChange === 'function' && wx.startDeviceMotionListening) {
      wx.startDeviceMotionListening({ interval: 'game' });
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
      const onFrame = () => { cb(); canvas.requestAnimationFrame(onFrame); };
      canvas.requestAnimationFrame(onFrame);
    },
    start,
    stop() { wx.stopDeviceMotionListening && wx.stopDeviceMotionListening(); },
  };
}
module.exports = { createGyroAR };
