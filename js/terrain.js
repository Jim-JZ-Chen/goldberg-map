/**
 * terrain.js —— 地形层
 * 根据噪声把格子分类为海洋/陆地/森林/山脉。
 * 纯函数，不持有状态。
 */
import { TERRAIN_THRESHOLDS, T_OCEAN, T_LAND, T_FOREST, T_MOUNTAIN } from './config.js';

/**
 * 对一个球面点做地形分类。
 * @param {Function} fbm 噪声采样函数（makeNoise 的返回值）
 * @param {THREE.Vector3} center 格子中心（单位球面上）
 * @returns {number} 地形索引：0海洋 1陆地 2森林 3山脉
 */
export function classifyTerrain(fbm, center) {
  // 系数 1.6 控制大陆尺度：越大陆地越碎
  const t = (fbm(center.x * 1.6, center.y * 1.6, center.z * 1.6, 4) + 1) / 2; // 归一化到 [0,1]
  const th = TERRAIN_THRESHOLDS;
  if (t < th.ocean) return T_OCEAN;
  if (t < th.land) return T_LAND;
  if (t < th.forest) return T_FOREST;
  return T_MOUNTAIN;
}
