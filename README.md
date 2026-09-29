# goldberg-map · 戈德堡多面体球形战棋地图原型

在浏览器里交互展示戈德堡多面体（Goldberg Polyhedron GP(m,0)）：
12 个五边形 + N 个六边形密铺球面，并在此之上构建一个球形战棋地图原型。

## 功能

- **细分频率 m 可调**（1–10）：格子总数 = 10m² + 2，其中永远恰好 12 个五边形
- **三种细分方式对比**：
  - `chord` 弦投影（最快，格子大小差异最大）
  - `slerp` 球面弧细分（较均匀）
  - `relax` 等面积松弛（Snyder 思路的数值实现，最均匀）
- **柏林噪声地形**：海洋 / 陆地 / 森林 / 山脉，只有陆地可通行
- **领地系统**：连通陆块上最远点采样选首都，多源 BFS 划分全域；文明式边界——双方各在自己格子内侧画领地色边带
- **A\* 寻路演示**：点击两个陆地格子，自动绕开海洋/森林/山脉
- 欧拉公式验证、六边形面积均匀度等统计实时显示

## 运行

纯静态页面，three.js 走 CDN（jsDelivr），无需构建：

```bash
npx serve .        # 或任意静态服务器，ES Module 不能用 file:// 直接打开
```

## 分层架构

| 文件 | 层 | 职责 |
|---|---|---|
| `js/config.js` | 配置 | 地形/领地颜色、阈值、渲染与松弛参数 |
| `js/noise.js` | 工具 | 带种子的 3D 柏林噪声 + fbm |
| `js/goldberg.js` | 几何 | `buildGoldberg(freq, method)` → 格子多边形 + 三角网格 |
| `js/terrain.js` | 规则 | `classifyTerrain(fbm, center)` 按噪声阈值分类地形 |
| `js/territory.js` | 规则 | `assignTerritories(terrains, adj, count)` 领地划分 |
| `js/pathfinding.js` | 规则 | `astar(adj, centers, terrains, start, goal)` 邻接图上 A* |
| `js/mapModel.js` | 数据 | **核心接口** `buildMapModel(...)` → MapModel，渲染与规则只面向它工作 |
| `js/mapRenderer.js` | 渲染 | `renderMap(model, opts)` → three.js 场景对象 + 拾取网格 |
| `js/main.js` | 交互 | 场景初始化、UI 绑定、点击/悬停寻路演示 |

每个函数都带 JSDoc 注释；各层通过明确的接口通信，可单独替换（比如把渲染层换成 Babylon.js，数据层不用动）。

## 数学背景

- 对偶关系：测地线三角网格 ↔ 戈德堡格子（周围 5 个三角形的顶点 → 五边形，6 个 → 六边形）
- 欧拉公式 V−E+F=2 决定五边形永远恰好 12 个（球面曲率的「缺陷点」）
- 等面积松弛：最小化所有球面三角形面积的方差（球面角盈公式求面积），三角形等面积 ⇒ 对偶六边形等面积
- m=1 时是正十二面体；足球对应另一序列的 GP(1,1)（截角二十面体）
