/* ==========================================================
   noise.js — シード付き乱数 + Perlin ノイズ
   ========================================================== */
(function (global) {
  'use strict';

  /** 高速シード乱数 (mulberry32) */
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /** 文字列 → 数値シード */
  function hashSeed(str) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  class Perlin {
    constructor(seed) {
      const rnd = mulberry32(seed >>> 0);
      const perm = new Uint8Array(256);
      for (let i = 0; i < 256; i++) perm[i] = i;
      for (let i = 255; i > 0; i--) {
        const j = Math.floor(rnd() * (i + 1));
        const t = perm[i]; perm[i] = perm[j]; perm[j] = t;
      }
      this.p = new Uint8Array(512);
      for (let i = 0; i < 512; i++) this.p[i] = perm[i & 255];
    }

    static fade(t) { return t * t * t * (t * (t * 6 - 15) + 10); }
    static lerp(a, b, t) { return a + t * (b - a); }

    /** 2D 勾配 (8方向の単位ベクトル) — 等方的で縞が出にくい */
    static grad2(hash, x, y) {
      switch (hash & 7) {
        case 0: return  x + y;
        case 1: return  x - y;
        case 2: return -x + y;
        case 3: return -x - y;
        case 4: return  x * 1.414;
        case 5: return -x * 1.414;
        case 6: return  y * 1.414;
        default: return -y * 1.414;
      }
    }

    static grad(hash, x, y, z) {
      const h = hash & 15;
      const u = h < 8 ? x : y;
      const v = h < 4 ? y : (h === 12 || h === 14 ? x : z);
      return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
    }

    /** 3D パーリンノイズ  戻り値 約 -1..1 */
    noise3(x, y, z) {
      const p = this.p;
      const X = Math.floor(x) & 255, Y = Math.floor(y) & 255, Z = Math.floor(z) & 255;
      x -= Math.floor(x); y -= Math.floor(y); z -= Math.floor(z);
      const u = Perlin.fade(x), v = Perlin.fade(y), w = Perlin.fade(z);
      const A = p[X] + Y, AA = p[A] + Z, AB = p[A + 1] + Z;
      const B = p[X + 1] + Y, BA = p[B] + Z, BB = p[B + 1] + Z;
      const L = Perlin.lerp, G = Perlin.grad;
      return L(
        L(
          L(G(p[AA], x, y, z), G(p[BA], x - 1, y, z), u),
          L(G(p[AB], x, y - 1, z), G(p[BB], x - 1, y - 1, z), u), v),
        L(
          L(G(p[AA + 1], x, y, z - 1), G(p[BA + 1], x - 1, y, z - 1), u),
          L(G(p[AB + 1], x, y - 1, z - 1), G(p[BB + 1], x - 1, y - 1, z - 1), u), v),
        w);
    }

    /**
     * 真の 2D パーリンノイズ (v0.10.2)
     * 旧実装は noise3(x, 0.137, z) の薄切りで、振幅が減衰し等方性も崩れていた。
     * 専用の 2D 版で品質を底上げする。戻り値 約 -1..1
     */
    noise2(x, z) {
      const p = this.p;
      const X = Math.floor(x) & 255, Y = Math.floor(z) & 255;
      x -= Math.floor(x); z -= Math.floor(z);
      const u = Perlin.fade(x), v = Perlin.fade(z);
      const A = p[X] + Y, B = p[X + 1] + Y;
      const G = Perlin.grad2, L = Perlin.lerp;
      return L(
        L(G(p[A], x, z), G(p[B], x - 1, z), u),
        L(G(p[A + 1], x, z - 1), G(p[B + 1], x - 1, z - 1), u), v) * 0.709;
    }

    /** 2D フラクタルノイズ */
    fbm2(x, z, octaves = 4, persistence = 0.5, lacunarity = 2) {
      let amp = 1, freq = 1, sum = 0, norm = 0;
      for (let i = 0; i < octaves; i++) {
        sum += this.noise2(x * freq, z * freq) * amp;
        norm += amp;
        amp *= persistence; freq *= lacunarity;
      }
      return sum / norm;
    }

    /** 3D フラクタルノイズ */
    fbm3(x, y, z, octaves = 3, persistence = 0.5, lacunarity = 2) {
      let amp = 1, freq = 1, sum = 0, norm = 0;
      for (let i = 0; i < octaves; i++) {
        sum += this.noise3(x * freq, y * freq, z * freq) * amp;
        norm += amp;
        amp *= persistence; freq *= lacunarity;
      }
      return sum / norm;
    }

    /* ========== v1.0: リアルな地形生成のための高度ノイズ ========== */

    /** リッジノイズ: 1-|fbm| で山脈のような鋭い稜線を作る (0..1) */
    ridged2(x, z, octaves = 4, persistence = 0.5, lacunarity = 2) {
      let amp = 1, freq = 1, sum = 0, norm = 0;
      for (let i = 0; i < octaves; i++) {
        sum += (1 - Math.abs(this.noise2(x * freq, z * freq))) * amp;
        norm += amp;
        amp *= persistence; freq *= lacunarity;
      }
      return sum / norm;   // 0..1 (1に近いほど稜線)
    }

    /** ビロウノイズ: |fbm| で丸みのある丘 (0..1) */
    billow2(x, z, octaves = 4, persistence = 0.5, lacunarity = 2) {
      let amp = 1, freq = 1, sum = 0, norm = 0;
      for (let i = 0; i < octaves; i++) {
        sum += Math.abs(this.noise2(x * freq, z * freq)) * amp;
        norm += amp;
        amp *= persistence; freq *= lacunarity;
      }
      return sum / norm;   // 0..1
    }

    /** ドメインワープ: 座標自体を別ノイズで歪ませて自然な蛇行を作る */
    warp2(x, z, warpAmp = 1, warpScale = 0.5) {
      const qx = this.noise2(x + 5.2, z + 1.3);
      const qz = this.noise2(x - 8.7, z - 3.9);
      return { x: x + qx * warpAmp * warpScale, z: z + qz * warpAmp * warpScale };
    }

    /** ワープした座標での fbm2 */
    fbm2Warped(x, z, octaves = 4, warpAmp = 1, warpScale = 0.5) {
      const w = this.warp2(x, z, warpAmp, warpScale);
      return this.fbm2(w.x, w.z, octaves);
    }

    /** 0..1 に正規化された fbm (使いやすさのため) */
    fbm2n(x, z, octaves = 4, persistence = 0.5, lacunarity = 2) {
      return this.fbm2(x, z, octaves, persistence, lacunarity) * 0.5 + 0.5;
    }
  }

  /** smoothstep 補間 (edge0..edge1 を 0..1 に滑らかにマップ) v0.10.2 */
  function smoothstep(edge0, edge1, x) {
    const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
    return t * t * (3 - 2 * t);
  }

  global.Perlin = Perlin;
  global.smoothstep = smoothstep;
  global.mulberry32 = mulberry32;
  global.hashSeed = hashSeed;
})(window);
