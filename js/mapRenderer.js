/**
 * mapRenderer.js —— 渲染层
 * 输入 MapModel，输出 three.js 场景对象。不修改模型，不处理交互。
 *
 * 接口：renderMap(model, opts) -> {
 *   group: THREE.Group      // 所有网格的容器，直接 add 进场景
 *   pickMesh: THREE.Mesh    // 不可见拾取网格（射线检测用）
 *   pickIndex: {triStart, triCount}[]  // 三角形序号 -> 格子 的映射表
 *   dispose(): void         // 释放所有 GPU 资源
 * }
 */
import * as THREE from 'three';
import { TERRAIN, TERRITORY_COLORS, RENDER, SPHERE_R } from './config.js';

const matTerrain = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.1, side: THREE.DoubleSide });
const matEdge = new THREE.LineBasicMaterial({ color: 0x0d1117 });
const matWire = new THREE.LineBasicMaterial({ color: 0x58d6ff, transparent: true, opacity: 0.25 });

/**
 * 构建地形板块网格（按地形着色的合并网格）。
 * @returns {{geometry: THREE.BufferGeometry, pickGeometry: THREE.BufferGeometry, pickIndex: Array}}
 */
function buildTerrainGeometry(model, shrink) {
  const pos = [], col = [], pickPos = [];
  const pickIndex = [];
  model.cells.forEach((poly, ci) => {
    const center = model.centers[ci];
    const ring = poly.map(p =>
      center.clone().add(p.clone().multiplyScalar(SPHERE_R).sub(center).multiplyScalar(shrink)));
    const pickRing = poly.map(p => p.clone().multiplyScalar(SPHERE_R)); // 拾取用完整板块（无收缩）
    const c = TERRAIN[model.terrain[ci]].color.clone(); // 地块只按地形着色，领地归属靠边界色带区分
    const triStart = pickPos.length / 3;
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i], b = ring[(i + 1) % ring.length];
      pos.push(center, a, b); // 中心为顶点的扇形三角化（中心凸出形成微锥面）
      col.push(c, c, c);
      pickPos.push(center, pickRing[i], pickRing[(i + 1) % pickRing.length]);
    }
    pickIndex.push({ triStart, triCount: ring.length });
  });

  const geometry = new THREE.BufferGeometry().setFromPoints(pos);
  const cols = new Float32Array(col.length * 3);
  col.forEach((cc, i) => { cols[i * 3] = cc.r; cols[i * 3 + 1] = cc.g; cols[i * 3 + 2] = cc.b; });
  geometry.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  geometry.computeVertexNormals();
  return { geometry, pickGeometry: new THREE.BufferGeometry().setFromPoints(pickPos), pickIndex };
}
