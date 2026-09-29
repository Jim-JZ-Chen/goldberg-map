/**
 * config.js —— 配置层
 * 所有可调参数与常量定义集中于此，改玩法数值只动这个文件。
 * 不依赖 three.js 以外的任何东西。
 */
import * as THREE from 'three';

/** 地形定义。passable 决定 A* 寻路是否可通过。 */
export const TERRAIN = [
  { name: '海洋', color: new THREE.Color(0x1a4a6e), passable: false },
  { name: '陆地', color: new THREE.Color(0x8ba860), passable: true },
  { name: '森林', color: new THREE.Color(0x2d6a4f), passable: false },
  { name: '山脉', color: new THREE.Color(0x9a9a9a), passable: false },
];
export const T_OCEAN = 0, T_LAND = 1, T_FOREST = 2, T_MOUNTAIN = 3;

/** 地形分类阈值（噪声归一化到 [0,1] 后的分档边界） */
export const TERRAIN_THRESHOLDS = { ocean: 0.36, land: 0.68, forest: 0.82 };

/** 领地配色（决定最大领地数量） */
export const TERRITORY_COLORS = [0xe74c3c, 0x3498db, 0xf39c12, 0x9b59b6, 0x1abc9c, 0xe67e22, 0xfd79a8, 0x00cec9]
  .map(c => new THREE.Color(c));

/** 渲染参数 */
export const RENDER = {
  shrinkWithGaps: 0.90,   // 「板块间隙」开启时格子向内收缩比例
  borderWidth: 0.016,     // 领地边带宽度（切平面距离）
  borderLift: 1.018,      // 边带抬升（避免与板块表面深度冲突）
  overlayLift: 1.012,     // 选中/路径高亮抬升
  capitalLift: 1.02,      // 首都标记抬升
  capitalRadius: 0.022,   // 首都小球半径
  innerSphereR: 0.88,     // 垫底内球半径（挡住板块间隙的透视）
};

/** 等面积松弛迭代参数（Snyder 思路的数值实现） */
export const RELAX = { iterations: 350, step: 0.15, h: 1e-4 };

/** 球半径（整个项目的世界尺度基准，勿改） */
export const SPHERE_R = 1.0;
