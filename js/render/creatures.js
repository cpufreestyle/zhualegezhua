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

function createPlaceholder(THREE, scene, creature, center) {
  if (!bodyGeo) bodyGeo = new THREE.SphereGeometry(0.18, 16, 16);
  if (!earGeo) earGeo = new THREE.SphereGeometry(0.06, 8, 8);
  let mat = matCache.get(creature.color);
  if (!mat) {
    mat = new THREE.MeshBasicMaterial({ color: creature.color });
    matCache.set(creature.color, mat);
  }
  const g = new THREE.Group();
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
module.exports = { CREATURES, byId, createPlaceholder };
