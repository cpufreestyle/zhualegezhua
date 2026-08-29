const { createScopedThreejs } = require('../../libs/threejs-miniprogram.js');

function createThree(canvas) {
  const THREE = createScopedThreejs(canvas);
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setClearColor(0x000000, 0);
  const scene = new THREE.Scene();
  const camera = new THREE.Camera(); // VK 模式每帧由 frame.camera 矩阵驱动；陀螺仪模式设固定位姿
  scene.add(new THREE.HemisphereLight(0xffffff, 0x444444));
  const dir = new THREE.DirectionalLight(0xffffff);
  dir.position.set(0, 1, 0.5);
  scene.add(dir);
  return { THREE, renderer, scene, camera };
}
module.exports = { createThree };
