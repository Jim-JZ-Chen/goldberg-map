/**
 * goldberg.js —— 几何层
 * 戈德堡多面体生成：二十面体细分 -> 球面三角网格 -> 对偶 -> 五边形+六边形。
 * 只负责几何，不知道地形、领地、渲染。
 *
 * 接口：buildGoldberg(freq, method) -> {
 *   cells:    THREE.Vector3[][]  // 每个格子的多边形顶点（单位球面上，按逆时针排序）
 *   triVerts: THREE.Vector3[]    // 底层三角网格顶点
 *   triFaces: number[][]         // 底层三角形（顶点索引三元组）
 * }
 */
import * as THREE from 'three';
import { RELAX } from './config.js';

/**
 * 球面线性插值：沿大圆弧从 a 到 b。
 * @param {THREE.Vector3} a 起点（单位向量）
 * @param {THREE.Vector3} b 终点（单位向量）
 * @param {number} t 插值比例 [0,1]
 * @returns {THREE.Vector3} 球面上的插值点
 */
export function slerpVec(a, b, t) {
  const dot = Math.min(1, Math.max(-1, a.dot(b)));
  const th = Math.acos(dot);
  if (th < 1e-8) return a.clone();
  return a.clone().multiplyScalar(Math.sin((1 - t) * th) / Math.sin(th))
    .add(b.clone().multiplyScalar(Math.sin(t * th) / Math.sin(th)));
}

/**
 * 计算单位球面上三角形的面积（球面角盈公式）。
 * @param {THREE.Vector3} a @param {THREE.Vector3} b @param {THREE.Vector3} c
 * @returns {number} 球面三角形面积
 */
function sphericalArea(a, b, c) {
  const corner = (x, y, z) => {
    const u = new THREE.Vector3().crossVectors(x, y).normalize();
    const v = new THREE.Vector3().crossVectors(x, z).normalize();
    return Math.acos(Math.min(1, Math.max(-1, u.dot(v))));
  };
  return corner(a, b, c) + corner(b, c, a) + corner(c, a, b) - Math.PI;
}

/**
 * 等面积松弛（Snyder 等面积投影的数值实现）。
 * 目标函数 = 所有球面三角形面积与均值之差的平方和，沿切平面做梯度下降。
 * 三角形等面积 => 对偶出来的六边形也等面积。原地思想，返回新数组。
 * @param {THREE.Vector3[]} verts 三角网格顶点（会被替换）
 * @param {number[][]} faces 三角形面
 * @returns {THREE.Vector3[]} 松弛后的顶点
 */
function equalAreaRelax(verts, faces) {
  const adjF = verts.map(() => []);
  faces.forEach((f, fi) => f.forEach(v => adjF[v].push(fi)));
  const target = 4 * Math.PI / faces.length;
  const { iterations: ITER, step: STEP, h: H } = RELAX;
  for (let it = 0; it < ITER; it++) {
    const next = verts.map(v => v.clone());
    for (let v = 0; v < verts.length; v++) {
      const n = verts[v];
      const up = Math.abs(n.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
      const u1 = new THREE.Vector3().crossVectors(up, n).normalize();
      const u2 = new THREE.Vector3().crossVectors(n, u1);
      /** 顶点移动到 vv 时，其相邻三角形面积方差 */
      const energy = (vv) => {
        let e = 0;
        for (const fi of adjF[v]) {
          const f = faces[fi];
          const a = sphericalArea(
            f[0] === v ? vv : verts[f[0]],
            f[1] === v ? vv : verts[f[1]],
            f[2] === v ? vv : verts[f[2]]);
          e += (a - target) * (a - target);
        }
        return e;
      };
      const e0 = energy(n);
      const gx = (energy(n.clone().addScaledVector(u1, H)) - e0) / H;
      const gy = (energy(n.clone().addScaledVector(u2, H)) - e0) / H;
      next[v] = n.clone().addScaledVector(u1, -STEP * gx).addScaledVector(u2, -STEP * gy).normalize();
    }
    verts = next;
  }
  return verts;
}

/**
 * 生成戈德堡多面体 GP(m, 0)。
 * @param {number} freq 细分频率 m：格子总数 = 10m²+2，其中 12 个五边形
 * @param {'chord'|'slerp'|'relax'} method 细分方式：
 *   chord=平面插值再投影（最快，最不均匀）
 *   slerp=沿大圆弧插值（较均匀）
 *   relax=slerp + 等面积松弛迭代（最均匀，大 m 时需数百毫秒）
 * @returns {{cells: THREE.Vector3[][], triVerts: THREE.Vector3[], triFaces: number[][]}}
 */
export function buildGoldberg(freq, method) {
  const t = (1 + Math.sqrt(5)) / 2;
  const icoVerts = [
    [-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0],
    [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t],
    [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1]
  ].map(v => new THREE.Vector3(...v).normalize());
  const icoFaces = [
    [0,11,5],[0,5,1],[0,1,7],[0,7,10],[0,10,11],[1,5,9],[5,11,4],[11,10,2],
    [10,7,6],[7,1,8],[3,9,4],[3,4,2],[3,2,6],[3,6,8],[3,8,9],[4,9,5],
    [2,4,11],[6,2,10],[8,6,7],[9,8,1]
  ];

  // ---- 细分：每个三角形切成 freq² 个小三角形 ----
  const vMap = new Map(); // 位置去重：相邻三角形共享顶点
  const newVerts = [];
  const keyOf = v => v.x.toFixed(6) + ',' + v.y.toFixed(6) + ',' + v.z.toFixed(6);
  /** 取顶点索引，已存在则复用 */
  function getV(v) {
    const k = keyOf(v);
    if (vMap.has(k)) return vMap.get(k);
    const idx = newVerts.length;
    newVerts.push(v.clone().normalize());
    vMap.set(k, idx);
    return idx;
  }
  const newFaces = [];
  for (const [ia, ib, ic] of icoFaces) {
    const A = icoVerts[ia], B = icoVerts[ib], C = icoVerts[ic];
    const grid = [];
    for (let i = 0; i <= freq; i++) {
      grid[i] = [];
      for (let j = 0; j <= freq - i; j++) {
        const k = freq - i - j;
        let p;
        if (method === 'chord') {
          p = new THREE.Vector3()
            .addScaledVector(A, i / freq)
            .addScaledVector(B, j / freq)
            .addScaledVector(C, k / freq);
        } else {
          const ab = slerpVec(A, B, (i + j) === 0 ? 0 : j / (i + j));
          p = slerpVec(ab, C, k / freq);
        }
        grid[i][j] = getV(p);
      }
    }
    for (let i = 0; i < freq; i++) {
      for (let j = 0; j < freq - i; j++) {
        newFaces.push([grid[i][j], grid[i][j+1], grid[i+1][j]]);
        if (j < freq - i - 1) newFaces.push([grid[i][j+1], grid[i+1][j+1], grid[i+1][j]]);
      }
    }
  }
  let verts = newVerts;
  const faces = newFaces;

  if (method === 'relax') verts = equalAreaRelax(verts, faces);

  // ---- 对偶：每个原顶点变成一个格子 ----
  // 格子边数 = 该顶点周围的三角形数（5 -> 五边形，6 -> 六边形）
  const adj = verts.map(() => []);
  faces.forEach((f, fi) => f.forEach(v => adj[v].push(fi)));
  const centroids = faces.map(f =>
    new THREE.Vector3().add(verts[f[0]]).add(verts[f[1]]).add(verts[f[2]]).divideScalar(3));

  const cells = [];
  for (let v = 0; v < verts.length; v++) {
    const n = verts[v];
    // 在顶点切平面内按极角排序相邻三角形质心，得到有序多边形
    const up = Math.abs(n.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
    const u = new THREE.Vector3().crossVectors(up, n).normalize();
    const w = new THREE.Vector3().crossVectors(n, u);
    const pts = adj[v].map(fi => centroids[fi]).map(c => {
      const d = c.clone().sub(n);
      return { p: c.clone().normalize(), ang: Math.atan2(d.dot(w), d.dot(u)) };
    });
    pts.sort((a, b) => a.ang - b.ang);
    cells.push(pts.map(o => o.p));
  }
  return { cells, triVerts: verts, triFaces: faces };
}
