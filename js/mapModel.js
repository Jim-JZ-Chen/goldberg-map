/**
 * mapModel.js —— 数据层（核心接口）
 * 把几何层的网格组装成游戏可用的地图模型。
 * 渲染层和规则层都只面向 MapModel 工作，互不感知对方。
 *
 * MapModel = {
 *   freq: number,                // 细分频率
 *   cells: THREE.Vector3[][],    // 格子多边形顶点（单位球面，逆时针）
 *   centers: THREE.Vector3[],    // 格子中心（已乘球半径）
 *   adj: number[][],             // 邻接表（游戏逻辑层唯一依赖的拓扑）
 *   terrain: number[],           // 地形索引（TERRAIN 下标）
 *   territoryOf: number[],       // 领地 id（-1 表示无）
 *   capitals: number[],          // 首都格子索引
 *   triVerts: THREE.Vector3[],   // 底层三角网格顶点（边界渲染用）
 *   triFaces: number[][],        // 底层三角形
 *   stats: { penta, hexa, hexaAreas, terrainCount }  // 统计信息
 * }
 */
import * as THREE from 'three';
import { SPHERE_R } from './config.js';
import { buildGoldberg } from './goldberg.js';
import { classifyTerrain } from './terrain.js';
import { assignTerritories } from './territory.js';

/**
 * 构建邻接表：原始三角网格的每条边连接两个顶点 => 对应的两个对偶格子相邻。
 * @param {number[][]} triFaces 底层三角形
 * @param {number} cellCount 格子数
 * @returns {number[][]} 邻接表
 */
function buildAdjacency(triFaces, cellCount) {
  const adj = Array.from({ length: cellCount }, () => []);
  const seen = new Set();
  for (const f of triFaces) {
    for (let i = 0; i < 3; i++) {
      const u = f[i], v = f[(i + 1) % 3];
      const k = Math.min(u, v) + '_' + Math.max(u, v);
      if (seen.has(k)) continue;
      seen.add(k);
      adj[u].push(v); adj[v].push(u);
    }
  }
  return adj;
}

/**
 * 生成完整地图模型。
 * @param {number} freq 细分频率 m
 * @param {'chord'|'slerp'|'relax'} method 细分方式
 * @param {number} seed 地形种子
 * @param {number} territoryCount 领地数量
 * @param {Function} makeNoiseFn 噪声工厂（注入，方便测试替换）
 * @returns {MapModel}
 */
export function buildMapModel(freq, method, seed, territoryCount, makeNoiseFn) {
  const { cells, triVerts, triFaces } = buildGoldberg(freq, method);
  const fbm = makeNoiseFn(seed);

  // 格子中心
  const centers = cells.map(poly => {
    const c = new THREE.Vector3();
    poly.forEach(p => c.add(p));
    return c.divideScalar(poly.length).normalize().multiplyScalar(SPHERE_R);
  });

  const adj = buildAdjacency(triFaces, cells.length);
  const terrain = centers.map(c => classifyTerrain(fbm, c));
  const { territoryOf, capitals } = assignTerritories(terrain, adj, territoryCount);

  // 统计
  let penta = 0, hexa = 0;
  const hexaAreas = [];
  const terrainCount = [0, 0, 0, 0];
  cells.forEach((poly, ci) => {
    if (poly.length === 5) penta++; else hexa++;
    terrainCount[terrain[ci]]++;
    if (poly.length === 6) {
      // 平面近似面积（用于均匀度对比，不需要精确球面面积）
      const c = centers[ci];
      let area = 0;
      for (let i = 0; i < 6; i++) {
        const a = poly[i].clone().multiplyScalar(SPHERE_R);
        const b = poly[(i + 1) % 6].clone().multiplyScalar(SPHERE_R);
        area += new THREE.Vector3().subVectors(a, c)
          .cross(new THREE.Vector3().subVectors(b, c)).length() / 2;
      }
      hexaAreas.push(area);
    }
  });

  return { freq, cells, centers, adj, terrain, territoryOf, capitals, triVerts, triFaces,
           stats: { penta, hexa, hexaAreas, terrainCount } };
}

/**
 * 欧拉公式验证：对偶网格的 V−E+F 应等于 2。
 * @param {MapModel} model
 * @returns {boolean}
 */
export function verifyEuler(model) {
  const F = model.cells.length;
  const E = model.cells.reduce((s, c) => s + c.length, 0) / 2;
  const V = model.triFaces.length;
  return V - E + F === 2;
}
