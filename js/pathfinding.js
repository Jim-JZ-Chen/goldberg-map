/**
 * pathfinding.js —— 规则层（寻路）
 * A* 寻路，跑在格子邻接图上，只走可通行地形。
 */
import { TERRAIN } from './config.js';

/**
 * 判断格子是否可通行。
 * @param {number[]} terrains 地形数组
 * @param {number} cell 格子索引
 * @returns {boolean}
 */
export function isPassable(terrains, cell) {
  return TERRAIN[terrains[cell]].passable;
}

/**
 * A* 寻路。
 * @param {number[][]} adj 邻接表
 * @param {THREE.Vector3[]} centers 格子中心（用于距离与启发函数）
 * @param {number[]} terrains 地形数组（不可通行格子直接跳过）
 * @param {number} start 起点格子索引
 * @param {number} goal 终点格子索引
 * @returns {number[]|null} 路径（格子索引序列，含起终点）；不可达返回 null
 */
export function astar(adj, centers, terrains, start, goal) {
  const dist = (a, b) => centers[a].distanceTo(centers[b]); // 球面弦距，启发函数可采纳
  const open = new Map([[start, 0]]); // cell -> f
  const g = new Map([[start, 0]]);    // cell -> 实际代价
  const came = new Map();
  const closed = new Set();
  while (open.size) {
    let cur = -1, best = Infinity;
    for (const [k, f] of open) if (f < best) { best = f; cur = k; }
    if (cur === goal) {
      const path = [cur];
      while (came.has(cur)) { cur = came.get(cur); path.unshift(cur); }
      return path;
    }
    open.delete(cur); closed.add(cur);
    for (const nb of adj[cur]) {
      if (closed.has(nb) || !isPassable(terrains, nb)) continue;
      const ng = g.get(cur) + dist(cur, nb);
      if (ng < (g.get(nb) ?? Infinity)) {
        g.set(nb, ng); came.set(nb, cur);
        open.set(nb, ng + dist(nb, goal));
      }
    }
  }
  return null;
}
