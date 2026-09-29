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
 * 构建地形板块网格（按地形着色 + 领地染色的合并网格）。
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
    const c = TERRAIN[model.terrain[ci]].color.clone();
    const terr = model.territoryOf[ci];
    if (model.terrain[ci] === 1 && terr >= 0) c.lerp(TERRITORY_COLORS[terr], 0.45); // 陆地按领地染色
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

/**
 * 构建文明式领地边界：分界线两侧，双方各在自己格子内侧画一条领地色边带。
 * 边界端点 = 原始三角网格边两侧三角形的质心（即对偶格子的共享边端点）。
 */
function buildBorderGeometry(model) {
  const edgePts = new Map(); // 原始边 -> {两端格子, 两侧三角形质心}
  const triCentroids = model.triFaces.map(f =>
    new THREE.Vector3().add(model.triVerts[f[0]]).add(model.triVerts[f[1]]).add(model.triVerts[f[2]])
      .divideScalar(3).normalize());
  model.triFaces.forEach((f, fi) => {
    for (let i = 0; i < 3; i++) {
      const a = f[i], b = f[(i + 1) % 3];
      const k = Math.min(a, b) + '_' + Math.max(a, b);
      if (!edgePts.has(k)) edgePts.set(k, { a: Math.min(a, b), b: Math.max(a, b), pts: [] });
      edgePts.get(k).pts.push(triCentroids[fi]);
    }
  });

  const pos = [], col = [];
  const { borderWidth: W, borderLift: LIFT } = RENDER;
  for (const e of edgePts.values()) {
    if (e.pts.length !== 2) continue;
    const ta = model.territoryOf[e.a], tb = model.territoryOf[e.b];
    if (ta === tb) continue; // 同领地无边界
    const p1 = e.pts[0], p2 = e.pts[1];
    const mid = p1.clone().add(p2).normalize();
    for (const [cell, terr] of [[e.a, ta], [e.b, tb]]) {
      // 朝自己格子中心的切向偏移
      const inw = model.centers[cell].clone().normalize().sub(mid);
      inw.sub(mid.clone().multiplyScalar(inw.dot(mid))).normalize();
      const c = TERRITORY_COLORS[terr];
      const a1 = p1.clone().normalize().multiplyScalar(LIFT);
      const a2 = p2.clone().normalize().multiplyScalar(LIFT);
      const b1 = p1.clone().addScaledVector(inw, W).normalize().multiplyScalar(LIFT);
      const b2 = p2.clone().addScaledVector(inw, W).normalize().multiplyScalar(LIFT);
      pos.push(a1, a2, b1, b1, a2, b2);
      for (let k = 0; k < 6; k++) col.push(c);
    }
  }
  if (!pos.length) return null;
  const g = new THREE.BufferGeometry().setFromPoints(pos);
  const cols = new Float32Array(col.length * 3);
  col.forEach((cc, i) => { cols[i * 3] = cc.r; cols[i * 3 + 1] = cc.g; cols[i * 3 + 2] = cc.b; });
  g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  return g;
}

/**
 * 渲染整张地图。
 * @param {MapModel} model 地图模型
 * @param {{shrink?: boolean, wireframe?: boolean, borders?: boolean}} opts 渲染开关
 * @returns 见文件头接口说明
 */
export function renderMap(model, opts = {}) {
  const shrink = opts.shrink ? RENDER.shrinkWithGaps : 1.0;
  const group = new THREE.Group();
  const disposables = [];

  // 地形板块
  const { geometry, pickGeometry, pickIndex } = buildTerrainGeometry(model, shrink);
  group.add(new THREE.Mesh(geometry, matTerrain));
  disposables.push(geometry, pickGeometry);

  // 垫底内球：板块间隙处不透穿到背面
  const ig = new THREE.SphereGeometry(RENDER.innerSphereR, 64, 48);
  group.add(new THREE.Mesh(ig, new THREE.MeshBasicMaterial({ color: 0x0a0e14 })));
  disposables.push(ig);

  // 格子描边
  const edgePos = [];
  model.cells.forEach((poly, ci) => {
    const center = model.centers[ci];
    const ring = poly.map(p =>
      center.clone().add(p.clone().multiplyScalar(SPHERE_R).sub(center).multiplyScalar(shrink)));
    for (let i = 0; i < ring.length; i++) edgePos.push(ring[i], ring[(i + 1) % ring.length]);
  });
  const eg = new THREE.BufferGeometry().setFromPoints(edgePos);
  group.add(new THREE.LineSegments(eg, matEdge));
  disposables.push(eg);

  // 底层三角网格（调试用）
  if (opts.wireframe) {
    const wp = [];
    for (const f of model.triFaces) {
      wp.push(model.triVerts[f[0]], model.triVerts[f[1]],
              model.triVerts[f[1]], model.triVerts[f[2]],
              model.triVerts[f[2]], model.triVerts[f[0]]);
    }
    const wg = new THREE.BufferGeometry().setFromPoints(wp);
    group.add(new THREE.LineSegments(wg, matWire));
    disposables.push(wg);
  }

  // 领地边界 + 首都标记
  if (opts.borders) {
    const bg = buildBorderGeometry(model);
    if (bg) {
      group.add(new THREE.Mesh(bg, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide })));
      disposables.push(bg);
    }
    model.capitals.forEach((c, i) => {
      const mg = new THREE.SphereGeometry(RENDER.capitalRadius, 16, 12);
      const marker = new THREE.Mesh(mg, new THREE.MeshBasicMaterial({ color: TERRITORY_COLORS[i] }));
      marker.position.copy(model.centers[c]).multiplyScalar(RENDER.capitalLift);
      group.add(marker);
      disposables.push(mg);
    });
  }

  // 不可见拾取网格
  const pickMesh = new THREE.Mesh(pickGeometry, new THREE.MeshBasicMaterial({ visible: false }));
  group.add(pickMesh);

  return {
    group, pickMesh, pickIndex,
    dispose() { disposables.forEach(d => d.dispose()); },
  };
}

/**
 * 生成单个格子的高亮几何体（选中/路径/悬停覆盖层用）。
 * @param {MapModel} model
 * @param {number} cell 格子索引
 * @param {number} lift 抬升比例
 * @returns {THREE.BufferGeometry}
 */
export function cellOverlayGeometry(model, cell, lift = RENDER.overlayLift) {
  const center = model.centers[cell].clone().multiplyScalar(lift);
  const pos = [];
  const ring = model.cells[cell];
  for (let i = 0; i < ring.length; i++) {
    pos.push(center,
      ring[i].clone().multiplyScalar(SPHERE_R * lift),
      ring[(i + 1) % ring.length].clone().multiplyScalar(SPHERE_R * lift));
  }
  return new THREE.BufferGeometry().setFromPoints(pos);
}
