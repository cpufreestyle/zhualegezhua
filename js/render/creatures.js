const { attachCreatureGLB, resolveGlbUrl } = require('./gltf_loader.js');

const CREATURES = [
  { id: 'mochi_cat', name: '麻薯猫', rarity: 'common', color: 0xffc2d1, glbUrl: null },
  { id: 'shiba', name: '小柴犬', rarity: 'common', color: 0xf4a261, glbUrl: null },
  { id: 'slime', name: '果冻史莱姆', rarity: 'common', color: 0x7bdff2, glbUrl: null },
  { id: 'butterfly', name: '花瓣蝶', rarity: 'common', color: 0xffb4a2, glbUrl: null },
  { id: 'volt_mouse', name: '电电鼠', rarity: 'rare', color: 0xffe156, glbUrl: null },
  { id: 'dragonfruit', name: '小火龙果', rarity: 'rare', color: 0xff6b6b, glbUrl: null },
  { id: 'cloudsheep', name: '云朵绵羊', rarity: 'rare', color: 0xeeeeee, glbUrl: null },
  { id: 'star_dragon', name: '星星龙', rarity: 'legendary', color: 0xb892ff, glbUrl: null },
];
function byId(id) { return CREATURES.find((c) => c.id === id); }

// 共享几何体/材质缓存：精灵每局重复生成销毁，几何与材质按颜色复用，避免 GPU 缓冲泄漏
let bodyGeo = null; // 懒创建，首次用到时才建
let earGeo = null;
const matCache = new Map(); // color hex → 共享材质（身体/耳朵同色共用）

// 落地投影（blob shadow）：径向渐变软边圆盘，共享几何+材质，让精灵有"站在地面"的重量感
let shadowGeo = null;
let shadowMat = null;
let shadowTexCache = null;
function makeShadowTexture() {
  if (shadowTexCache) return shadowTexCache;
  const S = 64;
  const c = wx.createCanvas();
  c.width = S; c.height = S;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  grad.addColorStop(0, 'rgba(0,0,0,0.42)');
  grad.addColorStop(0.55, 'rgba(0,0,0,0.18)');
  grad.addColorStop(1, 'rgba(0,0,0,0)'); // 软边：无硬轮廓，贴任何地面都不违和
  g.fillStyle = grad;
  g.fillRect(0, 0, S, S);
  shadowTexCache = c;
  return c;
}
function createBlobShadow(THREE) {
  if (!shadowGeo) shadowGeo = new THREE.CircleGeometry(0.26, 24);
  if (!shadowMat) {
    shadowMat = new THREE.MeshBasicMaterial({
      map: new THREE.CanvasTexture(makeShadowTexture()),
      transparent: true,
      depthWrite: false, // 不写深度：避免与地面 z-fighting 时的边缘闪烁
    });
  }
  const m = new THREE.Mesh(shadowGeo, shadowMat);
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.012; // 略高于地面，防 z-fighting
  m.userData.isShadow = true; // 标记：GLB 换模时保留投影盘（共享资源，不随占位体清除）
  return m;
}

function createPlaceholder(THREE, scene, creature, center) {
  if (!bodyGeo) bodyGeo = new THREE.SphereGeometry(0.18, 16, 16);
  if (!earGeo) earGeo = new THREE.SphereGeometry(0.06, 8, 8);
  let mat = matCache.get(creature.color);
  if (!mat) {
    mat = new THREE.MeshBasicMaterial({ color: creature.color });
    matCache.set(creature.color, mat);
  }
  const g = new THREE.Group();
  g.add(createBlobShadow(THREE)); // 投影盘先加：换模只清非投影子体
  const body = new THREE.Mesh(bodyGeo, mat);
  body.position.y = 0.18;
  g.add(body);
  [-0.1, 0.1].forEach((x) => {
    const ear = new THREE.Mesh(earGeo, mat);
    ear.position.set(x, 0.34, 0);
    g.add(ear);
  });
  g.position.set(center.x, center.y, center.z);
  scene.add(g);
  return g;
}
// createCreature — 与 createPlaceholder 同构的生成入口：占位体先立即可见，
// 有 GLB（creature.glbUrl 或 Task 15 清单）时后台流式加载，就绪后原位替换并淡入
function createCreature(THREE, scene, creature, center) {
  const group = createPlaceholder(THREE, scene, creature, center);
  const url = resolveGlbUrl(creature);
  if (url) attachCreatureGLB(THREE, group, url);
  return group;
}
module.exports = { CREATURES, byId, createPlaceholder, createCreature };
