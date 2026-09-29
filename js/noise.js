/**
 * noise.js —— 噪声层
 * 经典 3D 柏林噪声 + fbm 分形叠加，可播种，纯函数无副作用。
 * 接口：makeNoise(seed) -> fbm(x, y, z, octaves) -> [-1, 1]
 */

/**
 * 构造一个可播种的 fbm 噪声采样函数。
 * @param {number} seed 整数种子，同一种子生成的地形完全一致
 * @returns {(x:number, y:number, z:number, octaves?:number) => number}
 *   采样函数，返回 [-1, 1] 的噪声值。octaves 控制细节层数（默认 4）。
 */
export function makeNoise(seed) {
  // 线性同余发生器洗牌得到置换表
  const perm = new Uint8Array(512);
  const p = Array.from({ length: 256 }, (_, i) => i);
  let s = seed;
  const rand = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
  for (let i = 255; i > 0; i--) {
    const j = (rand() * (i + 1)) | 0;
    [p[i], p[j]] = [p[j], p[i]];
  }
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];

  const fade = t => t * t * t * (t * (t * 6 - 15) + 10);
  const lerp = (t, a, b) => a + t * (b - a);
  /** 梯度点积：hash 选方向后与偏移向量点乘 */
  const grad = (h, x, y, z) => {
    const u = h < 8 ? x : y, v = h < 4 ? y : (h === 12 || h === 14 ? x : z);
    return ((h & 1) ? -u : u) + ((h & 2) ? -v : v);
  };

  /** 单倍频 3D 柏林噪声 */
  function noise(x, y, z) {
    const X = Math.floor(x) & 255, Y = Math.floor(y) & 255, Z = Math.floor(z) & 255;
    x -= Math.floor(x); y -= Math.floor(y); z -= Math.floor(z);
    const u = fade(x), v = fade(y), w = fade(z);
    const A = perm[X] + Y, AA = perm[A] + Z, AB = perm[A + 1] + Z;
    const B = perm[X + 1] + Y, BA = perm[B] + Z, BB = perm[B + 1] + Z;
    return lerp(w,
      lerp(v, lerp(u, grad(perm[AA] & 15, x, y, z), grad(perm[BA] & 15, x - 1, y, z)),
              lerp(u, grad(perm[AB] & 15, x, y - 1, z), grad(perm[BB] & 15, x - 1, y - 1, z))),
      lerp(v, lerp(u, grad(perm[AA + 1] & 15, x, y, z + 1), grad(perm[BA + 1] & 15, x - 1, y, z + 1)),
              lerp(u, grad(perm[AB + 1] & 15, x, y - 1, z + 1), grad(perm[BB + 1] & 15, x - 1, y - 1, z + 1))));
  }

  // fbm：多倍频叠加，低频出大陆轮廓，高频出海岸细节
  return (x, y, z, octaves = 4) => {
    let sum = 0, amp = 1, freq = 1, norm = 0;
    for (let o = 0; o < octaves; o++) {
      sum += noise(x * freq, y * freq, z * freq) * amp;
      norm += amp; amp *= 0.5; freq *= 2;
    }
    return sum / norm;
  };
}
