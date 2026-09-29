/**
 * main.js —— 交互层
 * 场景初始化、UI 绑定、点击/悬停交互。
 * 通过 MapModel（数据层）+ renderMap（渲染层）+ astar（规则层）组合成完整应用。
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TERRAIN, TERRITORY_COLORS, RENDER } from './config.js';
import { makeNoise } from './noise.js';
import { buildMapModel, verifyEuler } from './mapModel.js';
import { renderMap, cellOverlayGeometry } from './mapRenderer.js';
import { astar, isPassable } from './pathfinding.js';

// ---------- 场景 ----------
const container = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
container.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0d1117);

const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.1, 100);
camera.position.set(0, 0.6, 3.4);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.autoRotate = true;
controls.autoRotateSpeed = 1.2;
controls.minDistance = 1.8;
controls.maxDistance = 10;

scene.add(new THREE.AmbientLight(0xffffff, 0.55));
const key = new THREE.DirectionalLight(0xffffff, 1.6); key.position.set(3, 4, 5); scene.add(key);
const fill = new THREE.DirectionalLight(0x58d6ff, 0.5); fill.position.set(-4, -2, -3); scene.add(fill);

// ---------- 状态 ----------
let model = null;          // 当前 MapModel
let rendered = null;       // renderMap 的返回值
let terrainSeed = (Math.random() * 1e9) | 0;
const overlayGroup = new THREE.Group();
scene.add(overlayGroup);
let overlayGeos = [];      // 覆盖层几何体（用于释放）
let selStart = -1, selEnd = -1;

// ---------- UI 元素 ----------
const $ = id => document.getElementById(id);
const freqInput = $('freq'), methodInput = $('method'), terrCountInput = $('terrCount');
const gapsInput = $('gaps'), wireInput = $('wireframe'), rotInput = $('autorotate');
const gameModeInput = $('gameMode'), bordersInput = $('showBorders');

// ---------- 重建 ----------
/** 按当前 UI 参数重建整张地图并刷新统计面板 */
function rebuild() {
  if (rendered) { scene.remove(rendered.group); rendered.dispose(); rendered = null; }

  model = buildMapModel(+freqInput.value, methodInput.value, terrainSeed, +terrCountInput.value, makeNoise);
  rendered = renderMap(model, {
    shrink: gapsInput.checked,
    wireframe: wireInput.checked,
    borders: bordersInput.checked,
  });
  scene.add(rendered.group);

  clearOverlays();
  selStart = selEnd = -1;
  $('sPath').textContent = '点击两个格子';

  // 统计面板
  const { penta, hexa, hexaAreas, terrainCount } = model.stats;
  $('freqVal').textContent = model.freq;
  $('methodVal').textContent = methodInput.selectedOptions[0].textContent.split('（')[0];
  $('terrVal').textContent = new Set(model.territoryOf.filter(t => t >= 0)).size;
  $('sPenta').textContent = penta;
  $('sHexa').textContent = hexa;
  $('sV').textContent = model.triFaces.length;
  $('sE').textContent = model.cells.reduce((s, c) => s + c.length, 0) / 2;
  $('sF').textContent = model.cells.length + (verifyEuler(model) ? ' ✓' : ' ✗');
  terrainCount.forEach((c, i) => $('sT' + i).textContent = c);
  $('sUniform').textContent = hexaAreas.length
    ? (Math.max(...hexaAreas) / Math.min(...hexaAreas)).toFixed(3)
    : '—（无六边形）';
  $('pathStat').style.display = gameModeInput.checked ? '' : 'none';
}

// ---------- 覆盖层 ----------
const highlightMats = {
  hover: new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.22 }),
  start: new THREE.MeshBasicMaterial({ color: 0x3fb950 }),
  end:   new THREE.MeshBasicMaterial({ color: 0xf85149 }),
  path:  new THREE.MeshBasicMaterial({ color: 0xd29922 }),
  nbr:   new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.10 }),
};

/** 在格子上加一块高亮覆盖层 */
function addOverlay(cell, mat) {
  const g = cellOverlayGeometry(model, cell);
  overlayGroup.add(new THREE.Mesh(g, mat));
  overlayGeos.push(g);
}
/** 清空所有高亮覆盖层 */
function clearOverlays() {
  overlayGeos.forEach(g => g.dispose());
  overlayGeos = [];
  overlayGroup.clear();
}

// ---------- 格子拾取 ----------
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
/**
 * 把屏幕坐标转换成格子索引：射线检测拾取网格，再二分定位三角形归属的格子。
 * @returns {number} 格子索引，未命中返回 -1
 */
function pickCell(ev) {
  if (!rendered) return -1;
  pointer.x = (ev.clientX / innerWidth) * 2 - 1;
  pointer.y = -(ev.clientY / innerHeight) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  const hit = raycaster.intersectObject(rendered.pickMesh)[0];
  if (!hit) return -1;
  const tri = hit.faceIndex, idx = rendered.pickIndex;
  let lo = 0, hi = idx.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1, d = idx[mid];
    if (tri < d.triStart) hi = mid - 1;
    else if (tri >= d.triStart + d.triCount) lo = mid + 1;
    else return mid;
  }
  return -1;
}

// ---------- 点击选格 + 寻路演示 ----------
let downPos = null;
renderer.domElement.addEventListener('pointerdown', ev => downPos = [ev.clientX, ev.clientY]);
renderer.domElement.addEventListener('pointerup', ev => {
  if (!gameModeInput.checked || !downPos) return;
  const moved = Math.hypot(ev.clientX - downPos[0], ev.clientY - downPos[1]);
  downPos = null;
  if (moved > 6) return; // 拖动视角不算点击
  const ci = pickCell(ev);
  if (ci < 0) return;
  if (!isPassable(model.terrain, ci)) {
    $('sPath').textContent = `${TERRAIN[model.terrain[ci]].name}不可通行，请点击陆地`;
    return;
  }
  controls.autoRotate = false; rotInput.checked = false;
  if (selStart < 0 || selEnd >= 0) {
    // 选起点（或重置重选），并高亮邻居展示邻接关系
    clearOverlays();
    selStart = ci; selEnd = -1;
    addOverlay(ci, highlightMats.start);
    model.adj[ci].forEach(n => addOverlay(n, highlightMats.nbr));
    $('sPath').textContent = `起点 = ${ci} 号格（${model.adj[ci].length} 个邻居），再点终点`;
  } else if (ci !== selStart) {
    // 选终点，跑 A*
    selEnd = ci;
    const path = astar(model.adj, model.centers, model.terrain, selStart, selEnd);
    clearOverlays();
    addOverlay(selStart, highlightMats.start);
    addOverlay(selEnd, highlightMats.end);
    if (path) {
      path.slice(1, -1).forEach(p => addOverlay(p, highlightMats.path));
      $('sPath').textContent = `${selStart} → ${selEnd}：${path.length - 1} 步（绕行陆地）`;
    } else {
      $('sPath').textContent = '不可达：两块陆地不相连';
    }
  }
});

// 悬停高亮（仅鼠标）
let hoverCell = -1, hoverMesh = null;
renderer.domElement.addEventListener('pointermove', ev => {
  if (!gameModeInput.checked || ev.pointerType !== 'mouse') return;
  const ci = pickCell(ev);
  if (ci === hoverCell) return;
  hoverCell = ci;
  if (hoverMesh) { overlayGroup.remove(hoverMesh); hoverMesh.geometry.dispose(); hoverMesh = null; }
  if (ci >= 0 && ci !== selStart && ci !== selEnd) {
    hoverMesh = new THREE.Mesh(cellOverlayGeometry(model, ci), highlightMats.hover);
    overlayGroup.add(hoverMesh);
  }
});

// ---------- UI 事件 ----------
freqInput.addEventListener('input', rebuild);
methodInput.addEventListener('change', rebuild);
terrCountInput.addEventListener('input', rebuild);
gapsInput.addEventListener('change', rebuild);
wireInput.addEventListener('change', rebuild);
bordersInput.addEventListener('change', rebuild);
rotInput.addEventListener('change', () => controls.autoRotate = rotInput.checked);
gameModeInput.addEventListener('change', () => {
  $('pathStat').style.display = gameModeInput.checked ? '' : 'none';
  if (!gameModeInput.checked) { clearOverlays(); selStart = selEnd = -1; }
});
$('newMap').addEventListener('click', () => { terrainSeed = (Math.random() * 1e9) | 0; rebuild(); });

// 面板收起 / 展开；窄屏默认收起避免遮挡球面
const panel = $('panel'), collapseBtn = $('collapseBtn');
collapseBtn.addEventListener('click', () => {
  const collapsed = panel.classList.toggle('collapsed');
  collapseBtn.textContent = collapsed ? '☰' : '—';
});
if (innerWidth < 640) { panel.classList.add('collapsed'); collapseBtn.textContent = '☰'; }

// ---------- 启动 ----------
rebuild();
renderer.setAnimationLoop(() => {
  controls.update();
  renderer.render(scene, camera);
});
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});
