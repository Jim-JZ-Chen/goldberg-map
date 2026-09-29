/**
 * territory.js —— 领地层
 * 把格子图划分成若干领地：连通分量分析 -> 最远点采样选首都 -> 多源 BFS 分归属。
 * 纯逻辑，只依赖邻接表和地形数组，不涉及渲染。
 *
 * 接口：assignTerritories(terrains, adj, count) -> { territoryOf, capitals }
 */
import { T_LAND } from './config.js';

/**
 * 求陆地的连通分量（被海洋隔开的陆地互不相通）。
 * @param {number[]} terrains 每个格子的地形索引
 * @param {number[][]} adj 邻接表
 * @returns {{comp: number[], comps: number[][]}} comp=格子->分量id，comps=按大小降序的分量成员列表
 */
function landComponents(terrains, adj) {
  const comp = new Array(terrains.length).fill(-1);
  const comps = [];
  for (let s = 0; s < terrains.length; s++) {
    if (terrains[s] !== T_LAND || comp[s] >= 0) continue;
    const id = comps.length, q = [s];
    comp[s] = id; comps.push([]);
    while (q.length) {
      const c = q.pop(); comps[id].push(c);
      for (const n of adj[c]) if (terrains[n] === T_LAND && comp[n] < 0) { comp[n] = id; q.push(n); }
    }
  }
  comps.sort((a, b) => b.length - a.length);
  return { comp, comps };
}

/**
 * 在一个连通分量内用「最远点采样」选下一个首都：
 * 选离本分量已有首都图距离最远的格子，保证领地彼此分散。
 * @param {number[]} compCells 分量内的格子列表
 * @param {number[]} existingSeeds 本分量内已选的首都
 * @param {number[]} terrains @param {number[][]} adj
 * @returns {number} 新首都格子索引
 */
function farthestPointSeed(compCells, existingSeeds, terrains, adj) {
  // 多源 BFS 求每个格子到最近已选首都的距离
  const d = new Map(compCells.map(c => [c, Infinity]));
  const bq = [];
  existingSeeds.forEach(s => { d.set(s, 0); bq.push(s); });
  while (bq.length) {
    const c = bq.shift();
    for (const n of adj[c]) if (terrains[n] === T_LAND && d.get(n) === Infinity) { d.set(n, d.get(c) + 1); bq.push(n); }
  }
  let best = compCells[0], bd = -1;
  for (const c of compCells) if (d.get(c) > bd) { bd = d.get(c); best = c; }
  return best;
}

/**
 * 划分领地。
 * @param {number[]} terrains 每个格子的地形索引
 * @param {number[][]} adj 邻接表
 * @param {number} count 期望领地数量（实际数量 = min(count, 连通分量足够时)）
 * @returns {{territoryOf: number[], capitals: number[]}}
 *   territoryOf: 每个格子的领地 id（所有地形都参与，保证边界连续闭合）；
 *   capitals: 每个领地的首都格子索引。
 */
export function assignTerritories(terrains, adj, count) {
  const territoryOf = new Array(terrains.length).fill(-1);
  const { comp, comps } = landComponents(terrains, adj);
  if (!comps.length) return { territoryOf, capitals: [] };

  // 选首都：先保证每个大陆至少 1 个，多余名额轮流给较大的大陆
  const seeds = [];
  for (let k = 0; k < count; k++) {
    const compCells = comps[k % comps.length];
    const inComp = seeds.filter(s => comp[s] === comp[compCells[0]]);
    seeds.push(farthestPointSeed(compCells, inComp, terrains, adj));
  }

  // 多源 BFS：每个格子归图距离最近的首都（平局先到先得）
  const bq = [];
  seeds.forEach((s, i) => { territoryOf[s] = i; bq.push(s); });
  while (bq.length) {
    const c = bq.shift();
    for (const n of adj[c]) {
      if (territoryOf[n] < 0) { territoryOf[n] = territoryOf[c]; bq.push(n); }
    }
  }
  return { territoryOf, capitals: seeds };
}
