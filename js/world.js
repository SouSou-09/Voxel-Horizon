/* ==========================================================
   world.js — チャンク管理 / 地形生成 / メッシュ生成 / レイキャスト
   ========================================================== */
(function (global) {
  'use strict';

  const CX = 16, CZ = 16, WH = 96;      // チャンクサイズ / ワールド高さ (v0.10.3: 64→96。高山の頭打ち解消)
  const SEA = 30;                        // 海面
  const B = Blocks;
  const ID = Blocks.BLOCK_ID;

  const idx = (x, y, z) => x + z * CX + y * CX * CZ;

  /* ---------- 面データ ---------- */
  // uVec/vVec は AO 計算用の接線方向単位ベクトル (頂点ごとの配列確保を避ける)
  const FACES = [
    { dir: [1, 0, 0], axis: 0, ua: 2, va: 1, uVec: [0, 0, 1], vVec: [0, 1, 0], shade: 0.76, corners: [[1, 1, 1], [1, 0, 1], [1, 1, 0], [1, 0, 0]], uvs: [[0, 1], [0, 0], [1, 1], [1, 0]] },
    { dir: [-1, 0, 0], axis: 0, ua: 2, va: 1, uVec: [0, 0, 1], vVec: [0, 1, 0], shade: 0.76, corners: [[0, 1, 0], [0, 0, 0], [0, 1, 1], [0, 0, 1]], uvs: [[0, 1], [0, 0], [1, 1], [1, 0]] },
    { dir: [0, 1, 0], axis: 1, ua: 0, va: 2, uVec: [1, 0, 0], vVec: [0, 0, 1], shade: 1.0, corners: [[0, 1, 1], [1, 1, 1], [0, 1, 0], [1, 1, 0]], uvs: [[0, 0], [1, 0], [0, 1], [1, 1]] },
    { dir: [0, -1, 0], axis: 1, ua: 0, va: 2, uVec: [1, 0, 0], vVec: [0, 0, 1], shade: 0.52, corners: [[1, 0, 1], [0, 0, 1], [1, 0, 0], [0, 0, 0]], uvs: [[1, 0], [0, 0], [1, 1], [0, 1]] },
    { dir: [0, 0, 1], axis: 2, ua: 0, va: 1, uVec: [1, 0, 0], vVec: [0, 1, 0], shade: 0.9, corners: [[0, 1, 1], [0, 0, 1], [1, 1, 1], [1, 0, 1]], uvs: [[0, 1], [0, 0], [1, 1], [1, 0]] },
    { dir: [0, 0, -1], axis: 2, ua: 0, va: 1, uVec: [1, 0, 0], vVec: [0, 1, 0], shade: 0.9, corners: [[1, 1, 0], [1, 0, 0], [0, 1, 0], [0, 0, 0]], uvs: [[0, 1], [0, 0], [1, 1], [1, 0]] }
  ];
  const AO_LEVEL = [0.46, 0.66, 0.83, 1.0];
  const SHADOW = 0.58;   // 空が見えないブロックの暗さ

  class Chunk {
    constructor(cx, cz) {
      this.cx = cx; this.cz = cz;
      this.blocks = new Uint8Array(CX * CZ * WH);
      this.height = new Int16Array(CX * CZ);
      this.generated = false;
      this.dirty = true;
      this.mesh = null;
      this.water = null;
    }
    get(x, y, z) { return this.blocks[idx(x, y, z)]; }
    set(x, y, z, v) { this.blocks[idx(x, y, z)] = v; }
  }

  class World {
    constructor(seed, scene, dimension) {
      this.seed = seed >>> 0;
      this.scene = scene;
      this.dimension = dimension || 'overworld';   // v0.13.1: 'overworld' | 'nether' / v0.13.2: 'end'
      this.chunks = new Map();
      this.editsByChunk = new Map();  // chunkKey -> Map("x,y,z" -> id)
      this.pending = new Map();       // chunkKey -> [{x,y,z,id}]
      this.furnaces = new Map();      // "x,y,z" -> Furnace
      this.chests = new Map();        // "x,y,z" -> [27 stacks]
      this.crops = new CropManager(this);
      this.torches = new Set();       // "x,y,z"
      this.doorState = new Map();     // "x,y,z" -> true で開 (ドア・トラップドア)
      this.fluidLevel = new Map();    // "x,y,z" -> 水位レベル (0=源, 1..3=流れ) v0.4
      this.fluidQueue = [];           // 流体更新キュー [{x,y,z,t}] v0.4
      this.fluidQueued = new Set();   // キュー重複防止 "x,y,z" v0.4
      this.fluidTime = 0;
      this.renderDistance = 3;
      // v0.13.1: ネザーは同一シードにオフセットを加えて独立した地形にする
      // v0.13.2: エンドも別オフセットで独立した地形にする
      const dimOff = this.dimension === 'nether' ? 1013904223
                   : this.dimension === 'end' ? 2147483647 : 0;
      this.perlin = new Perlin(this.seed + dimOff);
      this.perlin2 = new Perlin(this.seed + 7771 + dimOff);
      this.perlin3 = new Perlin(this.seed + 22222 + dimOff);

      const tex = Textures.makeThreeTexture();
      this.solidMaterial = new THREE.MeshLambertMaterial({
        map: tex, vertexColors: true, alphaTest: 0.5, side: THREE.FrontSide
      });
      this.waterMaterial = new THREE.MeshLambertMaterial({
        map: tex, vertexColors: true, transparent: true, opacity: 0.72,
        side: THREE.DoubleSide, depthWrite: false
      });
      this.group = new THREE.Group();
      scene.add(this.group);
      this._lastChunk = null;
    }

    /* ---------- 座標ユーティリティ ---------- */
    static key(cx, cz) { return cx + ',' + cz; }
    static bkey(x, y, z) { return x + ',' + y + ',' + z; }

    getChunk(cx, cz) { return this.chunks.get(World.key(cx, cz)); }

    getBlock(x, y, z) {
      if (y < 0 || y >= WH) return 0;
      const cx = x >> 4, cz = z >> 4;
      let c = this._lastChunk;
      if (!c || c.cx !== cx || c.cz !== cz) {
        c = this.chunks.get(World.key(cx, cz));
        if (!c) return 0;
        this._lastChunk = c;
      }
      // & 15 で負座標のチャンク境界(-1など)も正しく 0..15 に収める
      return c.blocks[idx(x & 15, y, z & 15)];
    }

    isLoaded(x, z) { return !!this.chunks.get(World.key(x >> 4, z >> 4)); }

    getHeight(x, z) {
      const c = this.chunks.get(World.key(x >> 4, z >> 4));
      if (!c) return -1;
      return c.height[(x & 15) + (z & 15) * CX];
    }

    /** ブロック設置/破壊。record=true でセーブ対象に記録 */
    setBlock(x, y, z, id, record = true) {
      if (y < 0 || y >= WH) return false;
      const cx = x >> 4, cz = z >> 4;
      const c = this.chunks.get(World.key(cx, cz));
      if (!c) return false;
      const lx = x & 15, lz = z & 15;
      const prev = c.blocks[idx(lx, y, lz)];
      if (prev === id) return false;
      c.blocks[idx(lx, y, lz)] = id;

      // 高さマップ更新
      const hIdx = lx + lz * CX;
      const def = B.get(id);
      if (def.opaque && y > c.height[hIdx]) c.height[hIdx] = y;
      else if (!def.opaque && y === c.height[hIdx]) {
        let ny = y - 1;
        while (ny > 0 && !B.get(c.blocks[idx(lx, ny, lz)]).opaque) ny--;
        c.height[hIdx] = ny;
      }

      if (record) {
        const ck = World.key(cx, cz);
        let m = this.editsByChunk.get(ck);
        if (!m) { m = new Map(); this.editsByChunk.set(ck, m); }
        m.set(World.bkey(x, y, z), id);
      }

      // 松明リスト
      const bk = World.bkey(x, y, z);
      if (id === ID.torch) this.torches.add(bk); else this.torches.delete(bk);
      // ドア/トラップドアの開状態はブロックが消えたら破棄
      if (prev === ID.door_oak || prev === ID.trapdoor) {
        if (id !== prev) this.doorState.delete(bk);
      }
      // かまど
      if (id === ID.furnace && !this.furnaces.has(bk)) this.furnaces.set(bk, new InventorySystem.Furnace());
      if (prev === ID.furnace && id !== ID.furnace) this.furnaces.delete(bk);
      // チェスト
      if (id === ID.chest && !this.chests.has(bk)) this.chests.set(bk, new Array(27).fill(null));
      if (prev === ID.chest && id !== ID.chest) this.chests.delete(bk);

      // v0.4: 流体の設置・除去を検知して更新キューへ
      const prevLiquid = B.isLiquid(prev), nextLiquid = B.isLiquid(id);
      if (nextLiquid && !prevLiquid) {
        if (!this.fluidLevel.has(bk)) this.fluidLevel.set(bk, 0);   // 設置された流体は源として扱う
        this.scheduleFluid(x, y, z);
      } else if (!nextLiquid && prevLiquid) {
        this.fluidLevel.delete(bk);
        // 流体が消えたので周囲の流体を再評価 (流れが消える)
        this.scheduleFluid(x + 1, y, z); this.scheduleFluid(x - 1, y, z);
        this.scheduleFluid(x, y, z + 1); this.scheduleFluid(x, y, z - 1);
        this.scheduleFluid(x, y + 1, z);
      } else if (nextLiquid) {
        this.scheduleFluid(x, y, z);
      } else if (!prevLiquid && !nextLiquid && id === 0) {
        // v0.4.1: 固体ブロックを壊して空気になったとき、隣接する流体を再スケジュール
        // (壁を掘ったら水が流れ込むようにする。これが「水が流れない」主原因)
        this.scheduleFluid(x + 1, y, z); this.scheduleFluid(x - 1, y, z);
        this.scheduleFluid(x, y, z + 1); this.scheduleFluid(x, y, z - 1);
        this.scheduleFluid(x, y + 1, z); this.scheduleFluid(x, y - 1, z);
      }

      this.markDirty(cx, cz);
      if (lx === 0) this.markDirty(cx - 1, cz);
      if (lx === CX - 1) this.markDirty(cx + 1, cz);
      if (lz === 0) this.markDirty(cx, cz - 1);
      if (lz === CZ - 1) this.markDirty(cx, cz + 1);
      return true;
    }

    markDirty(cx, cz) {
      const c = this.chunks.get(World.key(cx, cz));
      if (c) c.dirty = true;
    }

    /* ---------- 地形生成 (v1.0: 5倍リアル化) ---------- */
    /* 設計:
       1) 大陸性マスク — 広大な陸と海の分布を決定 (超低周波)
       2) 山脈 — リッジノイズの連なる鋭い稜線 (大陸性マスクでマスク)
       3) 侵食 — ワープノイズで谷と尾根の侵食パターン
       4) 丘陵 — ビロウノイズの丸みのある丘
       5) 微細起伏 — 高周波のディテール
       これらを階層的に合成し、急激な崖・なだらかな平原・連なる山脈を実現する */

    /** 温度・湿度・標高ノイズをまとめて返す (バイオーム判定用) */
    climateAt(wx, wz) {
      // v0.11: バイオームを大きく — 気候ノイズの周波数を約 1/2.5 に引き下げ
      // (竹林が「林」と呼べる規模になるよう、1バイオーム数百ブロック規模に拡大)
      // ドメインワープで境界を蛇行させ自然な分布は維持
      const tw = this.perlin2.warp2(wx * 0.0030, wz * 0.0030, 1.0, 0.4);
      const temp = this.perlin2.fbm2(tw.x, tw.z, 3);
      const hw = this.perlin2.warp2(wx * 0.0034 + 500, wz * 0.0034 - 400, 1.0, 0.4);
      const humid = this.perlin2.fbm2(hw.x, hw.z, 3);
      const elev = this.perlin2.fbm2(wx * 0.0024 + 90, wz * 0.0024 + 77, 3);
      const rare = this.perlin3.fbm2(wx * 0.0020 - 200, wz * 0.0020 + 150, 2);
      // v1.0.2: 湿度と希少性に温度との相関を持たせ、現実的なバイオーム分布にする
      // (高温地域ほど湿度が上がり、ジャングル/桜が出現しやすい。寒冷は乾燥し雪原に)
      const humidEff = humid + temp * 0.10;
      const rareEff = rare + temp * 0.08;
      return { temp, humid, elev, rare, humidEff, rareEff };
    }

    biomeAt(wx, wz) {
      const { temp, humid, elev, rare, humidEff, rareEff } = this.climateAt(wx, wz);
      // v0.10.2: 地形の smoothstep 範囲 (TERRAIN.elevLo/elevHi/volcanic) と整合させ、
      // 「バイオーム表示」と「実際の地形の高さ」が一致するようにする (#1)
      // v0.11: 火山バイオームは標高が高い地域 (山岳帯) のみに出現させる。
      // elev ゲートにより、実際の地形高が Y60+ の山に限定される。
      if (rareEff > 0.24 && temp > 0.10 && elev > 0.08) return 'volcanic';
      if (elev > 0.27) return 'high_mountains';
      if (elev > 0.15) return 'mountains';
      if (temp > 0.22) {
        // v0.13: メサ (荒野) — 高温・乾燥の希少地域に赤いテラコッタの大地
        // (rare 条件を緩めて出現率を確保。Minecraft でもメサは砂漠程度の広さで見つかる)
        if (rareEff > 0.12 && humidEff < -0.18) return 'mesa';
        if (humidEff > 0.14) return 'jungle';
        if (humidEff < -0.10) return 'savanna';
        return 'desert';
      }
      // v0.13: きのこ島 — 極めて希少な島バイオーム (温暖な気候帯に稀に出現)
      if (rareEff > 0.42 && temp > 0.02 && temp < 0.22) return 'mushroom_island';
      if (temp < -0.24) {
        if (humidEff > 0.06) return 'taiga';
        return 'snow';
      }
      if (rareEff > 0.22 && humidEff > 0.12) return 'cherry';
      if (rareEff < -0.20 && humidEff > 0.10) return 'flower_field';
      if (humidEff > 0.26 && elev < -0.04) return 'swamp';
      if (humidEff > 0.22) return 'bamboo_forest';
      if (humidEff > 0.16) return 'birch_forest';
      if (humidEff > 0.06) return 'forest';
      return 'plains';
    }

    /* ==========================================================
       v0.10.2: 地形生成パラメータ集約 (#9)
       各層の寄与を一箇所で調整できるようにし、マジックナンバーの
       散在を解消する。値を変えれば terrainHeight の挙動が変わる。
       ========================================================== */
    static get TERRAIN() {
      return {
        // 山脈 (リッジノイズ)
        mountain: { maskThresh: 0.08, maskRange: 0.35, height: 40 },
        // バイオーム標高による起伏 (smoothstep 化 #2)
        //   山岳〜高山: elev が mountain.elevLo〜elevHi で立ち上がる
        //   v0.10.3: WH 拡大 (64→96) に合わせて振幅を 46→58 に強化
        elevLo: 0.10, elevHi: 0.34, elevAmp: 58,
        //   低地: elev が負に大きいほど沈む
        lowThresh: -0.10, lowRange: 0.25, lowAmp: 16,
        // 火山の隆起 (v0.11: 強化して山頂が Y60+ に達するように)
        volcanic: { rareThresh: 0.22, rareHi: 0.45, amp: 30 },
        // 丘陵
        hillBase: 2.5, hillScale: 9,
        // 侵食
        erosion: { valleyThresh: -0.15, valleyRange: 0.35, valleyAmp: 9, ridgeThresh: 0.2, ridgeAmp: 5 },
        // 微細起伏
        detailAmp: 1.2,
        // フィーチャ (渓谷・崖・湖)
        feature: {
          maskThresh: 0.16, maskRange: 0.14,
          ravineThresh: 0.965, ravineAmp: 22,
          cliffThresh: 0.955, cliffAmp: 9,
          lakeThresh: -0.40, lakeRange: 0.20, lakeAmp: 10
        },
        // 洞窟 (#3: フィーチャ範囲での無効化マージン)
        cave: { cheeseThresh: 0.74, densityThresh: 0.10, spagBase: 0.058, featureMargin: 0.06 },
        // v0.12: 海溝 (大洋底の深い割れ目)。深い海 (c < minC) のみ発動
        trench: { minC: -0.16, ridgeThresh: 0.930, amp: 13 },
        // v0.12: 暖かい海 (浅い暖海域。珊瑚礁ができる)
        warmOcean: { tempThresh: 0.14, hMax: 22 }
      };
    }

    /* v0.6/v1.0: 地形フィーチャ (渓谷・湖・崖) のパラメータ */
    landFeatureAt(wx, wz) {
      const rn = this.perlin3.fbm2(wx * 0.006 + 700, wz * 0.006 - 350, 2);
      const ridge = 1 - Math.abs(rn);
      const cn = this.perlin2.fbm2(wx * 0.011 - 900, wz * 0.011 + 640, 2);
      const cridge = 1 - Math.abs(cn);
      const lake = this.perlin2.fbm2(wx * 0.0035 + 1500, wz * 0.0035 - 1100, 2);
      return { ridge, cridge, lake };
    }

    /**
     * 地形の高さ (v0.10.2)
     * 戻り値 { h, featureActive } — 高さと、フィーチャ(渓谷/湖)が発動したか。
     * featureActive は洞窟生成で地表穴・水漏れを防ぐマスクに使う (#3)。
     *
     * #1: 山の高さは「リッジ山脈」と「バイオーム標高(elev)」の2系統を
     *     統合し、max() で滑らかに合成 (二重加算による急崖を解消)。
     * #2: バイオーム補正は全て smoothstep で滑らかにブレンド。
     */
    terrainInfo(wx, wz) {
      const P = World.TERRAIN;
      /* --- 1) 大陸性マスク --- */
      const continent = this.perlin.fbm2(wx * 0.0011, wz * 0.0011, 4, 0.55, 2);
      const cw = this.perlin.warp2(wx * 0.0011, wz * 0.0011, 1.2, 0.1);
      const continent2 = this.perlin.fbm2(cw.x, cw.z, 3, 0.5, 2);
      const continental = continent * 0.7 + continent2 * 0.3;   // -1..1

      /* --- 2) ベース高度 --- */
      const c = continental;
      let h = SEA + 1;
      // v0.12.1: 陸側の上昇を強化 (26→60, 8→22)。
      // v0.12 で海の負側だけを三乗で深くし、陸側の上昇を据え置いたため、
      // 陸地の約49%が h<=SEA+1 の「湿った砂浜」に偏り、草地が陸の31.5%にまで
      // 減少していた (湿った列はバイオーム無視で地表が砂/泥/粘土に強制される)。
      // 内陸を SEA+3〜9 に隆起させて草地バイオームを取り戻し、動物のスポーン床を確保する。
      if (c > 0) h += c * c * 75 + c * 30;   // 陸: 内陸ほど高く隆起 (海の深化と対称に)
      else {
        // v0.12: 海を2倍以上深く。実際の continental は -0.3 程度までしか下がらないため、
        // 線形 c*16 (最深 5) では浅かった。負側を 3乗で強調し、最深部を SEA-30 以上にする。
        h += c * 16 + c * c * c * 900;      // c=-0.3 で 16*-0.3 + 900*-0.027 = -4.8-24.3 = -29
      }

      /* --- 3) 山 (v0.10.2 #1: リッジ山脈とバイオーム標高を統合) --- */
      // リッジ山脈 (帯状に連なる)
      const mMask = this.perlin2.fbm2(wx * 0.0016 + 300, wz * 0.0016 - 250, 3);
      let ridgeH = 0;
      if (mMask > P.mountain.maskThresh && c > 0.02) {
        const mStrength = Math.min(1, (mMask - P.mountain.maskThresh) / P.mountain.maskRange);
        const mw = this.perlin3.warp2(wx * 0.0028 + 150, wz * 0.0028 - 120, 1.2, 0.107);
        const ridge = this.perlin3.ridged2(mw.x, mw.z, 4, 0.5, 2.0);
        ridgeH = ridge * mStrength * P.mountain.height;
      }
      // バイオーム標高による起伏 (smoothstep で滑らかに #2)
      const { elev, rareEff } = this.climateAt(wx, wz);
      const elevH = smoothstep(P.elevLo, P.elevHi, elev) * P.elevAmp;
      // 統合: 加算せず大きい方を採用し、陸地でのみ有効化 (急崖と二重加算を解消)
      const land = smoothstep(0.0, 0.10, c);
      h += Math.max(ridgeH, elevH) * land;
      // 低地 (elev が負に大きいと沈む)
      h -= smoothstep(P.lowThresh, P.lowThresh - P.lowRange, elev) * P.lowAmp;
      // 火山の隆起 (elev ゲートで平地の孤立した盛り上がりを抑制)
      const volcLand = smoothstep(0.02, P.elevLo, elev);
      h += smoothstep(P.volcanic.rareThresh, P.volcanic.rareHi, rareEff) * P.volcanic.amp * volcLand;

      /* --- 4) 丘陵 --- */
      const hillW = this.perlin.warp2(wx * 0.006 + 30, wz * 0.006 - 12, 1.0, 0.108);
      const hill = this.perlin.fbm2(hillW.x, hillW.z, 4, 0.5, 2);
      const hillAmp = P.hillBase + Math.max(0, c) * P.hillScale;
      h += hill * hillAmp;

      /* --- 5) 侵食 --- */
      if (!this._dbgNoErosion) {
        const ero = this.perlin2.fbm2(wx * 0.008 - 60, wz * 0.008 + 45, 4, 0.5, 2);
        if (ero < P.erosion.valleyThresh) {
          const depth = Math.min(1, (P.erosion.valleyThresh - ero) / P.erosion.valleyRange);
          h -= depth * depth * P.erosion.valleyAmp;
        } else if (ero > P.erosion.ridgeThresh) {
          h += (ero - P.erosion.ridgeThresh) * P.erosion.ridgeAmp;
        }
      }

      /* --- 6) 微細起伏 --- */
      const detail = this.perlin.fbm2(wx * 0.021, wz * 0.021, 3, 0.5, 2);
      h += detail * P.detailAmp;

      /* --- 6.5) v0.12: 海溝 (trench) — 大洋底に走る深い割れ目 --- */
      // 深い海 (c が負に大きい) でのみ、リッジノイズの谷筋に沿って海底をさらに掘り下げる。
      // 現実の海溝のように、大洋の中に細長く連なる最深部を作る。
      let trench = 0;
      if (c < P.trench.minC) {
        const tn = this.perlin3.fbm2(wx * 0.0016 + 5120, wz * 0.0016 - 4330, 3);
        const tridge = 1 - Math.abs(tn);          // 稜線 (0..1、1に近いほど谷筋)
        if (tridge > P.trench.ridgeThresh) {
          const depth = (tridge - P.trench.ridgeThresh) / (1 - P.trench.ridgeThresh);
          const oceanic = Math.min(1, (P.trench.minC - c) / 0.20);   // 深い海ほど強く
          trench = depth * depth * P.trench.amp * oceanic;
          h -= trench;
        }
      }

      /* --- 7) 地形フィーチャ (渓谷・崖・湖) — 発動したかを記録 (#3) --- */
      let featureActive = false;
      const fMask = this.perlin.fbm2(wx * 0.0018 + 999, wz * 0.0018 - 888, 2);
      if (!this._dbgNoFeatures && fMask > P.feature.maskThresh) {
        const fStr = Math.min(1, (fMask - P.feature.maskThresh) / P.feature.maskRange);
        const lf = this.landFeatureAt(wx, wz);
        if (lf.ridge > P.feature.ravineThresh) {
          const depth = (lf.ridge - P.feature.ravineThresh) / (1 - P.feature.ravineThresh);
          h -= depth * depth * P.feature.ravineAmp * fStr;
          featureActive = true;
        }
        if (lf.cridge > P.feature.cliffThresh) {
          const cside = this.perlin2.noise2(wx * 0.011 - 900 + 40, wz * 0.011 + 640);
          const cstr = (lf.cridge - P.feature.cliffThresh) / (1 - P.feature.cliffThresh);
          h += (cside > 0 ? 1 : -0.35) * cstr * P.feature.cliffAmp * fStr;
          featureActive = true;
        }
        if (lf.lake < P.feature.lakeThresh) {
          const ldep = Math.min(1, (P.feature.lakeThresh - lf.lake) / P.feature.lakeRange);
          h -= ldep * P.feature.lakeAmp * fStr;
          featureActive = true;
        }
      }
      /* --- v0.10.3: Y56 平坦化バグ修正 ---
         旧実装は Math.min(WH-8=56, h) でハードクリップしていたため、
         合成高さが 56 を超える山は全て標高 56 の「平坦な台地」に潰れていた。
         上限に近づくほど伸びが鈍る漸近関数 (soft cap) で滑らかに圧縮し、
         ワールド高さも 64→96 に拡大して高山が頭打ちにならないようにする。
         v0.10.4 B8: ソフトキャップの開始を WH-14 (82) から WH-22 (74) に下げた。
         旧設定では標高 74〜93 の範囲で圧縮が強すぎ、高山の上部が
         「なだらかな台地」に潰れていた。開始を下げて圧縮を緩やかにし、
         高い山ほど頂上が鋭く残るようにする。 */
      const SOFT = WH - 22;   // 74: ここから緩やかに圧縮を開始
      if (h > SOFT) {
        const over = h - SOFT;
        // over が大きいほど HEADROOM (=WH-3-SOFT=19) に漸近する
        const headroom = (WH - 3) - SOFT;
        h = SOFT + headroom * (1 - Math.exp(-over / headroom));
      }
      return { h: Math.max(2, Math.min(WH - 3, Math.floor(h))), featureActive, trench, continent: c };
    }

    /** 旧インターフェース互換 (高さのみ) */
    terrainHeight(wx, wz) { return this.terrainInfo(wx, wz).h; }

    /** v0.12.2: 表示用バイオーム名 (海列は warm_ocean / ocean、陸は biomeAt) */
    displayBiomeAt(wx, wz) {
      if (this.dimension === 'nether') return this.netherFeatureAt(wx, wz);   // v0.13.1
      if (this.dimension === 'end') return this.endFeatureAt(wx, wz);         // v0.13.2
      const ti = this.terrainInfo(wx, wz);
      if (ti.h < SEA) {
        const temp = this.climateAt(wx, wz).temp;
        if (ti.h >= SEA - 8 && temp > World.TERRAIN.warmOcean.tempThresh) return 'warm_ocean';
        if (temp < -0.14) return 'icebergs';   // v0.13: 寒冷な海は氷山バイオーム表示
        return 'ocean';
      }
      return this.biomeAt(wx, wz);
    }

    generateChunk(cx, cz) {
      const ck = World.key(cx, cz);
      if (this.chunks.has(ck)) return this.chunks.get(ck);
      const c = new Chunk(cx, cz);
      this.chunks.set(ck, c);
      const rnd = mulberry32((this.seed ^ (cx * 73856093) ^ (cz * 19349663)) >>> 0);

      // v0.13.1: ネザー次元は専用の生成パス (ネザーラックの洞窟世界)
      if (this.dimension === 'nether') return this.generateNetherChunk(c, cx, cz, rnd, ck);
      // v0.13.2: エンド次元は専用の生成パス (虚空に浮かぶエンドストーンの島)
      if (this.dimension === 'end') return this.generateEndChunk(c, cx, cz, rnd, ck);

      // 列ごとの地形高さ・バイオーム・フィーチャ活性を1回だけ計算 (#8: 二重計算解消)
      const colH = new Int16Array(CX * CZ);
      const colBiome = new Array(CX * CZ);
      const colFeat = new Uint8Array(CX * CZ);   // #3: フィーチャ(渓谷/湖)発動フラグ
      const colVolc = new Float32Array(CX * CZ); // v0.11: 火山隆起強度 (溶岩流の発生源判定に使用)
      for (let lz = 0; lz < CZ; lz++) {
        for (let lx = 0; lx < CX; lx++) {
          const i = lx + lz * CX;
          const wx = (cx << 4) + lx, wz = (cz << 4) + lz;
          const ti = this.terrainInfo(wx, wz);
          colH[i] = ti.h;
          colFeat[i] = ti.featureActive ? 1 : 0;
          colVolc[i] = ti.volcanicLift || 0;
          // v0.12: 暖かい海 — 海底が浅く (SEA-8 より浅い) 暖かい海域を専用バイオームに。
          // biomeAt は陸地バイオームしか返さないため、海列はここで上書きする。
          let biome = this.biomeAt(wx, wz);
          if (ti.h < SEA) {
            if (ti.h >= SEA - 8) {
              const temp = this.climateAt(wx, wz).temp;
              if (temp > World.TERRAIN.warmOcean.tempThresh) biome = 'warm_ocean';
            }
          }
          // v0.13: 氷山 — 寒冷な海 (temp が低い海列) を氷山バイオームに。
          // 陸の biomeAt による分岐を上書きし、凍った海の専用バイオームとする。
          if (ti.h < SEA && biome !== 'warm_ocean') {
            const temp = this.climateAt(wx, wz).temp;
            if (temp < -0.14) biome = 'icebergs';
          }
          colBiome[i] = biome;
        }
      }

      for (let lz = 0; lz < CZ; lz++) {
        for (let lx = 0; lx < CX; lx++) {
          const wx = (cx << 4) + lx, wz = (cz << 4) + lz;
          const ci = lx + lz * CX;
          const h = colH[ci];
          const biome = colBiome[ci];
          const featureActive = colFeat[ci] === 1;
          // v0.6: 湖判定は陸地 (h>SEA) でのみ必要なので、その時だけ計算 (#8)
          const lf = (h > SEA) ? this.landFeatureAt(wx, wz) : null;

          // v0.3: 水辺の地層バリエーション (泥・粘土)
          const wet = h <= SEA + 1;
          // v0.10.1: 列ごと rnd() だと砂/泥/粘土が市松模様になる。
          // Minecraft のようにノイズで「まとまった砂浜・粘土の溜まり」にする
          const beachN = wet ? this.perlin2.fbm2(wx * 0.03 + 44, wz * 0.03 - 26, 2) : 0;
          const mudR = wet ? (beachN < -0.18 ? 0.1 : (beachN > 0.22 ? 0.3 : 0.9)) : 0;
          // v1.0: 地層バリエーション用ノイズ (列ごとに1回)
          // 深さに応じた石の種類の変化・砂利層・粘土の帯を自然に生成
          const strataN = this.perlin2.fbm2(wx * 0.05 + 220, wz * 0.05 - 180, 3);
          const strataR = this.perlin.fbm2(wx * 0.08 - 90, wz * 0.08 + 55, 2);
          // 山麓 (高原への移行部): 高度が中程度の山地は岩と土の混合
          const isFoothill = (biome === 'mountains' && h < SEA + 12) || biome === 'birch_forest';
          const isHighland = biome === 'high_mountains' || (biome === 'mountains' && h >= SEA + 12);
          for (let y = 0; y <= h; y++) {
            let id = ID.stone;
            if (y === 0) id = ID.bedrock;
            else if (y === h) {
              if (biome === 'warm_ocean') id = ID.sand;   // v0.12: 暖かい海の海底は砂
              else if (biome === 'icebergs') id = ID.packed_ice;   // v0.13: 氷山の海底は氷塊
              else if (biome === 'mesa') id = ID.red_sand;   // v0.13: メサの地表は赤砂
              else if (biome === 'mushroom_island') id = ID.mycelium;   // v0.13: きのこ島の地表は菌糸
              else if (wet) id = mudR < 0.22 ? ID.mud : (mudR < 0.36 ? ID.clay : ID.sand);
              else if (biome === 'desert' || biome === 'savanna') id = ID.sand;
              else if (biome === 'snow' || biome === 'taiga' || biome === 'high_mountains') id = ID.snow_block;
              else if (isHighland) id = strataR > 0.2 ? ID.gravel : ID.stone;
              else if (biome === 'volcanic') id = (strataR > 0.35 ? ID.obsidian : (strataR < -0.35 ? ID.magma : (strataN > 0.15 ? ID.basalt : ID.cobblestone)));
              else if (biome === 'swamp') id = ID.mud;
              else id = ID.grass;
            } else if (y > h - 4) {
              // 表土層 (y=h-1..h-3): バイオームに応じた土・砂・岩
              if (wet) id = mudR < 0.22 ? ID.mud : (mudR < 0.36 ? ID.clay : ID.sand);
              else if (biome === 'mesa') {
                // v0.13: メサ — 深度に応じた水平のテラコッタ縞模様 (層状地形)
                // 色はノイズで帯状に遷移し、現実のメサの地層を表現する
                const band = Math.sin(y * 0.42 + strataN * 5.2) + strataR * 0.8;
                id = band > 1.1 ? ID.terracotta_white
                   : band > 0.4 ? ID.terracotta_yellow
                   : band > -0.2 ? ID.terracotta_orange
                   : band > -0.9 ? ID.terracotta_red : ID.terracotta_brown;
                if (y > h - 2) id = y === h ? ID.red_sand : id;
              }
              else if (biome === 'icebergs') id = y > h - 3 ? ID.packed_ice : (strataR > 0.2 ? ID.packed_ice : ID.stone);
              else if (biome === 'mushroom_island') id = y > h - 3 ? ID.mycelium : ID.dirt;
              else if ((biome === 'desert' || biome === 'savanna') && h > SEA) {
                // 砂漠は表土も砂、さらに深い層は砂岩的に
                id = y > h - 3 ? ID.sand : (strataN > 0.1 ? ID.stone : ID.sand);
              }
              else if (isHighland) id = y > h - 3 ? ID.stone : (strataR > 0.15 ? ID.gravel : ID.stone);
              else if (biome === 'volcanic') id = y > h - 2 ? ID.cobblestone : (strataN > 0.1 ? ID.obsidian : (strataR < -0.3 ? ID.magma : (strataN < -0.15 ? ID.basalt : ID.cobblestone)));
              else if (biome === 'swamp') id = y > h - 3 ? ID.mud : (strataN < -0.2 ? ID.clay : ID.dirt);
              else if (isFoothill) id = y > h - 2 ? ID.dirt : (strataR > 0.3 ? ID.stone : ID.dirt);
              else id = ID.dirt;
            } else if (y > h - 9 && strataN > 0.28) {
              // v1.0: 砂利の帯 (地層の変化)
              id = ID.gravel;
            } else if (y > h - 14 && y < h - 6 && strataN < -0.30) {
              // v1.0: 粘土の帯 (かつての湖底)
              id = ID.clay;
            }
            c.blocks[idx(lx, y, lz)] = id;
          }
          // 水
          for (let y = h + 1; y <= SEA; y++) c.blocks[idx(lx, y, lz)] = ID.water;
          // v0.12: 暖かい海 — 砂の海底に珊瑚・海草を生やす
          if (biome === 'warm_ocean' && h < SEA - 1) {
            const decoR = rnd();
            if (decoR < 0.30) {
              const coralR = rnd();
              const coral = coralR < 0.22 ? ID.coral_red : coralR < 0.44 ? ID.coral_blue :
                            coralR < 0.66 ? ID.coral_pink : coralR < 0.82 ? ID.coral_yellow : ID.sea_grass;
              if (c.blocks[idx(lx, h + 1, lz)] === ID.water) c.blocks[idx(lx, h + 1, lz)] = coral;
            }
          }
          // v0.6: 湖 (海抜よりわずかに高い窪地にも水を張る)
          // v0.10.2 #11: 湖の水位を海面 (SEA) に統一。従来は湖ごとに SEA+3 など
          // バラバラで、隣の海と段差ができて不自然だった。湖は h<SEA の窪地に張る。
          if (h > SEA - 6 && h < SEA && lf && lf.lake < -0.40 &&
              biome !== 'desert' && biome !== 'volcanic' && biome !== 'savanna') {
            for (let y = h + 1; y <= SEA; y++) c.blocks[idx(lx, y, lz)] = ID.water;
          }
          // 雪原の水面は凍る (v0.3)
          if (biome === 'snow' && h < SEA) c.blocks[idx(lx, SEA, lz)] = ID.ice;
          // v0.13: 氷山バイオームの海面は氷 (凍った海)。一部は青氷の小さな浮氷
          if (biome === 'icebergs' && h < SEA) {
            c.blocks[idx(lx, SEA, lz)] = ID.ice;
            const floeR = this.perlin2.fbm2(wx * 0.07 + 33, wz * 0.07 - 18, 2);
            if (floeR > 0.28) c.blocks[idx(lx, SEA + 1, lz)] = floeR > 0.45 ? ID.blue_ice : ID.packed_ice;
          }

          // v1.0: 洞窟 = チーズ洞穴 (fbm3 の大空洞) + スパゲッティ洞窟 (ridged トンネル) の複合
          // チーズ: 広い地下空洞。スパゲッティ: ノイズの稜線(|n|が小さい帯)に沿った蛇行トンネル
          const n04x = wx * 0.04, n04z = wz * 0.04;
          const n017x = wx * 0.017 + 60, n017z = wz * 0.017 - 40;
          // チーズ洞穴用 (低周波で大きな空洞)
          const chX = wx * 0.024 + 900, chZ = wz * 0.024 - 700;
          // スパゲッティ洞窟用 (2系統のノイズが交差する帯)
          const spX = wx * 0.055 + 300, spZ = wz * 0.055 + 140;
          const spX2 = wx * 0.055 - 520, spZ2 = wz * 0.055 + 260;
          // 洞窟密度マスク (列ごとに1回): 場所によって洞窟の多い/少ない地域を作る
          const caveDensity = this.perlin.fbm2(wx * 0.006 + 777, wz * 0.006 - 333, 2);
          // v0.10.3 C1: 地表に開く洞窟「入口」の列かどうか。
          // 専用ノイズで局在化した入口列では、洞窟が地表まで掘り抜かれ
          // Minecraft のように地上から降りられる洞窟ができる。
          const entranceN = this.perlin2.fbm2(wx * 0.013 + 2100, wz * 0.013 - 1600, 2);
          const isEntrance = entranceN > 0.55;
          // v0.10.2 #3: 渓谷・湖フィーチャが発動した列では洞窟を掘らない。
          const caveAllowed = !featureActive;
          for (let y = 1; y < h - 1; y++) {
            const bi = idx(lx, y, lz);
            // v0.10.3 C2: 深度 (地表からの深さ) に応じて洞窟を太くする。
            // 旧実装は (h-y) が大きいほど閾値を下げてしまい「深いほど細い」
            // 逆転した挙動だった。depthFrac を正の係数で掛け、深部ほど太くする。
            const depthFrac = Math.max(0, Math.min(1, (h - y) / 40));
            // v0.10.4 B3: 旧 v0.10.3 は深いほど spagThresh を大きくしてしまい
            // 「浅いほど太く深いほど細い」逆転していた。閾値は小さいほど太いので、
            // 深いほど閾値を小さくして太くする (浅い 0.074 → 深い 0.052)。
            const spagThresh = 0.074 - depthFrac * 0.022;   // 深いほど小さい=太い
            // --- チーズ洞穴 ---
            const cheese = this.perlin3.fbm3(chX, y * 0.045, chZ, 3);
            // --- スパゲッティ洞窟: 2つの ridged トンネルが絡む ---
            const sp1 = this.perlin3.fbm3(spX, y * 0.075, spZ, 3);
            const sp2 = this.perlin3.fbm3(spX2, y * 0.075 + 31.7, spZ2, 3);
            const spag = Math.sqrt(sp1 * sp1 + sp2 * sp2);
            // C1: 入口列では地表近くまで掘る許可 (y < h-2 → 入口は y < h まで)
            const surfaceGuard = isEntrance ? 0 : 2;
            const isCave = caveAllowed && (
              (cheese > 0.74 && y < h - 3 && caveDensity > 0.10) ||
              (spag < spagThresh && y < h - surfaceGuard && caveDensity > 0.0));
            if (isCave) {
              const cur = c.blocks[bi];
              // v0.10.4 B2: 洞窟は「石」のみを掘る。
              // 旧実装は岩盤以外なら表土 (草・土・砂) も掘り抜いていたため、
              // 入口ノイズの列で地表に 1×1 の穴が無数に開いていた。
              // 表土は残すことで、洞窟入口は地中の石が露出した自然な窪みになる。
              if (cur === ID.stone) c.blocks[bi] = 0;
            }
            // v0.10.2 #7: 鉱石は単独散布ではなく「鉱脈」として生成する。
            // 鉱脈シード (veinSeed) とその周辺 (veinField) を組み合わせ、
            // 起点の周囲に塊として鉱石が生成されるようにする (Minecraft の鉱脈)。
            if (c.blocks[bi] !== ID.stone) continue;
            // 鉱脈の局所シード: 列と高度に基づくハッシュ (チャンク乱数とは独立)
            const veinField = this.perlin3.fbm3(wx * 0.11 + 1300, y * 0.11, wz * 0.11 - 800, 2);
            const r = rnd();
            // 鉱脈コア (起点): veinField が高い場所にだけ鉱脈が発生し、
            // その周辺 (veinField がやや高い帯) にも連なって生成される
            const vein = veinField > 0.28;   // 鉱脈の塊 (コア+周辺)
            if (vein) {
              // 深度に応じた鉱石を塊として配置 (従来の確率を鉱脈密度に変換)
              // v0.11: 深層 (y<16) では深層岩バリアントの鉱石も生成
              if (y < 12 && r < 0.06) c.blocks[bi] = ID.amethyst_ore;
              else if (y < 14 && r < 0.16) c.blocks[bi] = y < 8 && rnd() < 0.4 ? ID.diamond_ore_deepslate : ID.diamond_ore;
              else if (y < 12 && r < 0.20) c.blocks[bi] = ID.crystal_ore;
              else if (y < 16 && r < 0.24) c.blocks[bi] = y < 8 && rnd() < 0.4 ? ID.emerald_ore_deepslate : ID.emerald_ore;
              else if (y < 18 && r < 0.32) c.blocks[bi] = y < 8 && rnd() < 0.4 ? ID.lapis_ore_deepslate : ID.lapis_ore;
              else if (y < 18 && r < 0.48) c.blocks[bi] = y < 8 && rnd() < 0.4 ? ID.redstone_ore_deepslate : ID.redstone_ore;
              else if (y < 10 && r < 0.58) c.blocks[bi] = ID.sulfur_ore;
              else if (y < 30 && r < 0.70) c.blocks[bi] = ID.salt_ore;
              else if (y < 24 && r < 0.82) c.blocks[bi] = ID.silver_ore;
              else if (y < 22 && r < 0.92) c.blocks[bi] = y < 8 && rnd() < 0.4 ? ID.gold_ore_deepslate : ID.gold_ore;
              else if (y < 48 && r < 1.05) c.blocks[bi] = y < 8 && rnd() < 0.4 ? ID.copper_ore_deepslate : ID.copper_ore;
              else if (y < 40 && r < 1.30) c.blocks[bi] = y < 8 && rnd() < 0.4 ? ID.iron_ore_deepslate : ID.iron_ore;
              else if (r < 1.65) c.blocks[bi] = ID.coal_ore;
              // 鉱脈に稀に溶岩ポケット (y<11)
              else if (r < 1.72 && y < 11) c.blocks[bi] = ID.lava;
            } else {
              // 鉱脈外の環境生成物 (砂利・マグマ・苔・溶岩・v0.11: 石材バリエーション)
              if (r < 0.0050 && y > h - 10) c.blocks[bi] = ID.gravel;
              else if (r < 0.0062 && y < 12) c.blocks[bi] = ID.magma;
              else if (r < 0.0070 && y > h - 4) c.blocks[bi] = ID.moss;
              else if (r < 0.0082 && y < 11) c.blocks[bi] = ID.lava;
              // v0.11: 地中に安山岩・閃緑岩・花崗岩の塊 (地層の多様性)
              else if (r < 0.012 && y > h - 20 && strataN > 0.25) c.blocks[bi] = ID.andesite;
              else if (r < 0.015 && y > h - 25 && strataN < -0.28) c.blocks[bi] = ID.diorite;
              else if (r < 0.018 && y > h - 30 && strataR > 0.30) c.blocks[bi] = ID.granite;
              else if (r < 0.020 && y < 10) c.blocks[bi] = ID.deepslate;
            }
            /* ===== v0.13: 洞窟バイオーム ===== */
            // (1) ディープダーク: 深層 (y<10) の広い帯で石をスカルクに置き換える。
            //     洞窟の壁・床にも及ぶため、掘った後の空洞がスカルクに縁取られる。
            if (y < 10 && (c.blocks[bi] === ID.stone || c.blocks[bi] === ID.deepslate)) {
              const deepN = this.perlin2.fbm2(wx * 0.02 + 999, wz * 0.02 - 888, 2);
              if (deepN > 0.26) {   // 局在化した帯のみ (全域を覆わない)
                const vein = this.perlin3.fbm3(wx * 0.13 + 500, y * 0.13, wz * 0.13 + 500, 2);
                if (vein > 0.28) c.blocks[bi] = (vein > 0.55 && rnd() < 0.08) ? ID.sculk_catalyst : ID.sculk;
              }
            }
            // (2) 繁茂した洞窟: 中層のまとまった帯で洞窟床を苔にする
            const lushN = this.perlin2.fbm2(wx * 0.015 + 555, wz * 0.015 - 444, 2);
            const isLush = lushN > 0.34;
            if (isLush && y > 8 && y < h - 4 && c.blocks[bi] === ID.stone) {
              const bl2 = c.blocks[idx(lx, y - 1, lz)];
              // 床 (下が空洞) は苔床に。壁・天井もノイズで苔むす
              if (bl2 === 0) c.blocks[bi] = ID.moss;
              else if (this.perlin3.fbm3(wx * 0.09 - 77, y * 0.09, wz * 0.09 + 88, 2) > 0.30) c.blocks[bi] = ID.moss;
            }
            // v0.10.4 B5: 洞窟の深部に溶岩湖、浅部の洞窟底に地下水たまり。
            // 旧実装は「掘り抜かれた空気」にだけ流体を置いていたが、スキャン順
            // (y昇順) では洞窟底の流体しか置けず、上の空気セルは空洞のまま
            // 「1ブロックの深さしかない水溜り」になっていた。
            // 空気でも石でも洞窟の底 (下が固体) なら流体を置き、石は置き換える。
            if (c.blocks[bi] === 0 || c.blocks[bi] === ID.stone) {
              const belowB = c.blocks[idx(lx, y - 1, lz)];
              const solidBelow = belowB !== 0 && belowB !== ID.bedrock && B.isSolid(belowB);
              if (solidBelow) {
                if (y < 11 && rnd() < 0.028) {
                  // 深部の溶岩湖
                  c.blocks[bi] = ID.lava;
                  this.fluidLevel.set(this.fluidKey(wx, y, wz), 0);
                } else if (y < 24 && y >= 11 && rnd() < 0.012) {
                  // 浅〜中部の地下水たまり
                  c.blocks[bi] = ID.water;
                  this.fluidLevel.set(this.fluidKey(wx, y, wz), 0);
                }
              }
            }
            // v0.3: 洞窟の壁にキノコ・蔦が生える
            if (c.blocks[idx(lx, y, lz)] === 0 && y > 2) {
              const below = c.blocks[idx(lx, y - 1, lz)];
              if ((below === ID.stone || below === ID.moss || below === ID.dirt) && rnd() < 0.006) {
                c.blocks[idx(lx, y, lz)] = rnd() < 0.6 ? ID.mushroom_brown : ID.mushroom_red;
              } else if (rnd() < 0.004 && lx > 0 && lx < CX - 1) {
                const side = c.blocks[idx(lx + (rnd() < 0.5 ? 1 : -1), y, lz)];
                if (side === ID.stone || side === ID.moss) c.blocks[idx(lx, y, lz)] = ID.vine;
              }
              // v0.13: 繁茂した洞窟 — 苔床の上に草/小キノコ、天井からグロウベリーの蔓を吊るす
              if (isLush) {
                if (below === ID.moss && rnd() < 0.10) {
                  c.blocks[idx(lx, y, lz)] = rnd() < 0.7 ? ID.tall_grass : ID.mushroom_brown;
                } else if (below === 0 && (c.blocks[idx(lx, y + 1, lz)] === ID.stone || c.blocks[idx(lx, y + 1, lz)] === ID.moss) && rnd() < 0.06) {
                  // 天井に吊るす (y+1 が天井ブロック)
                  c.blocks[idx(lx, y, lz)] = ID.glow_berry_vine;
                  this.torches.add(World.bkey(wx, y, wz));   // 発光ブロックとして登録
                }
              }
            }
          }
        }
      }

      c.generated = true;
      this.recalcHeight(c);

      // v0.4.1: 地形生成の水・溶岩を水源 (レベル0) として登録
      // (登録がないと海の水をバケツですくえず、流れの起点にもならなかった)
      for (let y = 0; y < WH; y++) {
        for (let lz = 0; lz < CZ; lz++) {
          for (let lx = 0; lx < CX; lx++) {
            const bid = c.blocks[idx(lx, y, lz)];
            if (bid === ID.water || bid === ID.lava) {
              this.fluidLevel.set(this.fluidKey((cx << 4) + lx, y, (cz << 4) + lz), 0);
            }
          }
        }
      }

      // 植生 (チャンク境界をまたぐので setBlockGen 経由)
      for (let lz = 0; lz < CZ; lz++) {
        for (let lx = 0; lx < CX; lx++) {
          const wx = (cx << 4) + lx, wz = (cz << 4) + lz;
          const top = c.height[lx + lz * CX];
          const surf = c.blocks[idx(lx, top, lz)];
          if (top <= SEA) continue;
          const biome = colBiome[lx + lz * CX];   // 事前計算済み (biomeAt の再計算を回避)
          // v0.5: 植樹できる地表 (バイオームごとに地表ブロックが異なる)
          const canTree = surf === ID.grass
            || (biome === 'taiga' && surf === ID.snow_block)
            || (biome === 'savanna' && surf === ID.sand)
            || (biome === 'mountains' && surf === ID.stone);
          if (canTree) {
            // v0.5: バイオーム別の樹種と密度
            const treeKind = biome === 'birch_forest' ? 'birch'
              : biome === 'taiga' ? 'spruce'
              : biome === 'cherry' ? 'cherry'
              : biome === 'jungle' ? 'jungle'
              : 'oak';
            // v1.0: 林冠クラスターノイズ — 木が群生する「森のまとまり」と「林間」を作る
            // 一定密度の乱数ではなく、ノイズで局所的な密度を揺らして自然な林にする
            const canopy = this.perlin2.fbm2(wx * 0.016 + 44, wz * 0.016 - 28, 3);
            const canopyBoost = Math.max(0, canopy) * 1.6;   // 0..~1.1 森のまとまり度
            const baseDensity = biome === 'jungle' ? 0.045
              : biome === 'birch_forest' ? 0.028
              : biome === 'taiga' ? 0.026
              : biome === 'cherry' ? 0.030
              : biome === 'savanna' ? 0.003
              : biome === 'mountains' ? 0.002
              : biome === 'forest' ? 0.015 : 0.004;
            // クラスターノイズが高いほど密度が上がり、低いところは林間 (まばら)
            const density = baseDensity * (0.25 + canopyBoost * 1.4);
            if (rnd() < density && (biome === 'birch_forest' || biome === 'forest' || biome === 'taiga' || biome === 'cherry' || biome === 'jungle' || biome === 'plains' || biome === 'savanna' || biome === 'mountains')) {
              let tooClose = false;
              for (let ax = -2; ax <= 2 && !tooClose; ax++) {
                for (let az = -2; az <= 2 && !tooClose; az++) {
                  if (ax === 0 && az === 0) continue;
                  const nx2 = wx + ax, nz2 = wz + az;
                  const nh = this.getHeight(nx2, nz2);
                  const nb = this.getBlock(nx2, nh, nz2);
                  if (B.get(nb).tool === 'axe' && (nb === ID.log || nb === ID.birch_log || nb === ID.spruce_log || nb === ID.cherry_log)) tooClose = true;
                }
              }
              if (tooClose) continue;
              this.growTreeKind(wx, top + 1, wz, rnd, treeKind);
              if (rnd() < 0.7) {
                const ax = wx + Math.floor(rnd() * 5) - 2, az = wz + Math.floor(rnd() * 5) - 2;
                this.scatterLitter(ax, az);
              }
            } else {
              // 花 (v0.2 草原 / v0.5 花畑は高密度・タイガにも少し)
              const flowerDensity = biome === 'flower_field' ? 0.16
                : biome === 'plains' ? 0.022
                : biome === 'taiga' ? 0.006 : 0;
              if (flowerDensity > 0 && c.blocks[idx(lx, top + 1, lz)] === 0 && rnd() < flowerDensity) {
                const fr = rnd();
                c.blocks[idx(lx, top + 1, lz)] = fr < 0.20 ? ID.flower_dandelion
                  : fr < 0.40 ? ID.flower_poppy : fr < 0.58 ? ID.flower_daisy
                  : fr < 0.72 ? ID.flower_tulip : fr < 0.84 ? ID.flower_orchid
                  : fr < 0.93 ? ID.flower_cornflower : ID.flower_allium;
                c.dirty = true;
              }
            }
          } else if (surf === ID.sand && (biome === 'desert' || biome === 'savanna') && rnd() < 0.006) {
            const hgt = 2 + ((rnd() * 2) | 0);
            for (let i = 0; i < hgt; i++) this.setBlockGen(wx, top + 1 + i, wz, ID.cactus);
          }
          // v0.3: 高草 (草原・森)
          if ((surf === ID.grass) && (biome === 'plains' || biome === 'forest') &&
              c.blocks[idx(lx, top + 1, lz)] === 0 && rnd() < 0.10) {
            c.blocks[idx(lx, top + 1, lz)] = ID.tall_grass;
            c.dirty = true;
          }
          // v0.3: 水辺のサトウキビ (砂の上・水面のすぐ隣)
          if (surf === ID.sand && Math.abs(top - SEA) <= 1 && c.blocks[idx(lx, top + 1, lz)] === 0 && rnd() < 0.05) {
            const hgt = 2 + ((rnd() * 2) | 0);
            for (let i = 0; i < hgt; i++) this.setBlockGen(wx, top + 1 + i, wz, ID.sugarcane);
          }
          // v0.3: 草原に竹 (小さな藪)
          if (surf === ID.grass && biome === 'plains' && c.blocks[idx(lx, top + 1, lz)] === 0 && rnd() < 0.004) {
            const hgt = 3 + ((rnd() * 3) | 0);
            for (let i = 0; i < hgt; i++) this.setBlockGen(wx, top + 1 + i, wz, ID.bamboo);
          }
          // v0.3: カボチャ・スイカ (草原に稀)
          if (surf === ID.grass && biome === 'plains' && c.blocks[idx(lx, top + 1, lz)] === 0 && rnd() < 0.003) {
            c.blocks[idx(lx, top + 1, lz)] = rnd() < 0.5 ? ID.pumpkin : ID.melon_block;
            c.dirty = true;
          }
          // v0.5: 竹林に竹を密植
          if (surf === ID.grass && biome === 'bamboo_forest' && c.blocks[idx(lx, top + 1, lz)] === 0 && rnd() < 0.14) {
            const hgt = 3 + ((rnd() * 4) | 0);
            for (let i = 0; i < hgt; i++) this.setBlockGen(wx, top + 1 + i, wz, ID.bamboo);
          }
          // v0.5: ジャングルにも竹がまばらに
          if (surf === ID.grass && biome === 'jungle' && c.blocks[idx(lx, top + 1, lz)] === 0 && rnd() < 0.03) {
            const hgt = 3 + ((rnd() * 3) | 0);
            for (let i = 0; i < hgt; i++) this.setBlockGen(wx, top + 1 + i, wz, ID.bamboo);
          }
          // v0.5: サバンナの高草
          if (surf === ID.grass && biome === 'savanna' && c.blocks[idx(lx, top + 1, lz)] === 0 && rnd() < 0.18) {
            c.blocks[idx(lx, top + 1, lz)] = ID.tall_grass;
            c.dirty = true;
          }
          // v0.5: 火山地帯の地表にマグマ・溶岩が点在
          if ((surf === ID.cobblestone) && biome === 'volcanic' && rnd() < 0.012) {
            c.blocks[idx(lx, top, lz)] = rnd() < 0.6 ? ID.magma : ID.lava;
            if (c.blocks[idx(lx, top, lz)] === ID.lava) this.fluidLevel.set(this.fluidKey(wx, top, wz), 0);
            c.dirty = true;
          }
          // v0.11: 火山の斜面を伝う溶岩流。
          // 隆起の中心 (colVolc 最大) から下り方向に、地表を浅く抉って
          // 溶岩とマグマを這わせる (Minecraft のバサルト柱＋溶岩流の表現)。
          if (biome === 'volcanic' && top >= 60) {
            const ci0 = lx + lz * CX;
            const v0 = colVolc[ci0];
            // 火口 (summit): 局所的に隆起が最大の頂上。中央に溶岩湖を開く
            let isSummit = v0 > 0.55;
            if (isSummit) {
              for (let ddz = -1; ddz <= 1 && isSummit; ddz++) {
                for (let ddx = -1; ddx <= 1 && isSummit; ddx++) {
                  if (ddx === 0 && ddz === 0) continue;
                  const nx = lx + ddx, nz = lz + ddz;
                  if (nx < 0 || nz < 0 || nx >= CX || nz >= CZ) continue;
                  if (colVolc[nx + nz * CX] >= v0) isSummit = false;
                }
              }
            }
            if (isSummit && c.blocks[idx(lx, top, lz)] !== ID.bedrock) {
              // 火口底: 3ブロック抉って溶岩湖
              for (let dy = 0; dy < 3 && top - dy > 0; dy++) {
                c.blocks[idx(lx, top - dy, lz)] = ID.lava;
                this.fluidLevel.set(this.fluidKey(wx, top - dy, wz), 0);
              }
              c.dirty = true;
              this.recalcHeight(c);
              continue;
            }
            // 溶岩流の筋: 隆起強度が高い筋 (v0>0.30) から発生し、下り方向に這う
            if (v0 > 0.30 && rnd() < 0.10 && surf !== 0) {
              // 下り方向 = colH が最も低い隣接列
              let bdx = 0, bdz = 0, bh = top;
              for (const [ddx, ddz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
                const nx = lx + ddx, nz = lz + ddz;
                if (nx < 0 || nz < 0 || nx >= CX || nz >= CZ) continue;
                const nh = colH[nx + nz * CX];
                if (nh < bh) { bh = nh; bdx = ddx; bdz = ddz; }
              }
              if (bdx !== 0 || bdz !== 0) {
                // 現在の列の地表を1段抉って溶岩 (流れの筋の一部)
                if (c.blocks[idx(lx, top, lz)] === ID.cobblestone) {
                  c.blocks[idx(lx, top, lz)] = ID.lava;
                  this.fluidLevel.set(this.fluidKey(wx, top, wz), 0);
                  c.dirty = true;
                  // 下り側の列にも溶岩を這わせる (表面を浅く抉る)
                  const nx = lx + bdx, nz = lz + bdz;
                  const nh2 = colH[nx + nz * CX];
                  if (c.blocks[idx(nx, nh2, nz)] === ID.cobblestone) {
                    c.blocks[idx(nx, nh2, nz)] = rnd() < 0.7 ? ID.lava : ID.magma;
                    if (c.blocks[idx(nx, nh2, nz)] === ID.lava) this.fluidLevel.set(this.fluidKey(wx + bdx, nh2, wz + bdz), 0);
                    c.dirty = true;
                  }
                  this.recalcHeight(c);
                }
              }
            }
          }
          // v0.13: メサの枯れ木 (赤砂の地表にまばらに)
          if (biome === 'mesa' && surf === ID.red_sand && c.blocks[idx(lx, top + 1, lz)] === 0 && rnd() < 0.020) {
            c.blocks[idx(lx, top + 1, lz)] = ID.dead_bush;
            c.dirty = true;
          }
          // v0.13: きのこ島の巨大キノコ (赤/茶。稀に高密度のキノコ林)
          if (biome === 'mushroom_island' && surf === ID.mycelium && rnd() < 0.018) {
            this.growGiantMushroom(wx, top + 1, wz, rnd);
          }
          // v0.13: きのこ島のムーシュルーム (ワールド生成スポーン)
          if (biome === 'mushroom_island' && surf === ID.mycelium && rnd() < 0.004) {
            this.pendingSpawns = this.pendingSpawns || [];
            this.pendingSpawns.push({ type: 'mooshroom', x: wx + 0.5, y: top + 1, z: wz + 0.5 });
          }
          // v0.13: 雪原・タイガの地表に薄い積雪層 (装飾)
          if ((biome === 'snow' || biome === 'taiga') && surf === ID.snow_block &&
              c.blocks[idx(lx, top + 1, lz)] === 0 && rnd() < 0.25) {
            c.blocks[idx(lx, top + 1, lz)] = ID.snow_layer;
            c.dirty = true;
          }
          // v0.5: 沼地の水たまり (地表を1段下げて水を張る)
          if (biome === 'swamp' && surf === ID.mud && top > SEA && rnd() < 0.05) {
            c.blocks[idx(lx, top, lz)] = ID.water;
            this.fluidLevel.set(this.fluidKey(wx, top, wz), 0);
            c.dirty = true;
          }
        }
      }

      // ===== v0.6: 地形フィーチャ (オアシス・滝・温泉・鍾乳洞) =====
      this.genLandFeatures(c, cx, cz, rnd, colBiome, colH);

      // ===== v0.7: 構造物 (村・寺院・ダンジョン) =====
      this.genStructures(c, cx, cz, rnd, colBiome, colH);

      // 保留ブロック (隣チャンクの木など)
      const pend = this.pending.get(ck);
      if (pend) {
        for (const p of pend) {
          const lx = p.x & 15, lz = p.z & 15;
          if (p.y >= 0 && p.y < WH) {
            const cur = c.blocks[idx(lx, p.y, lz)];
            if (p.force) {
              // v0.7: 構造物の強制設置 (岩盤以外を上書き)
              if (cur !== ID.bedrock) {
                c.blocks[idx(lx, p.y, lz)] = p.id;
                if (p.id === ID.chest) {
                  const bk = World.bkey(p.x, p.y, p.z);
                  if (!this.chests.has(bk)) this.chests.set(bk, new Array(27).fill(null));
                }
              }
            } else if (cur === 0 || cur === ID.leaves || cur === ID.birch_leaves || cur === ID.water) {
              c.blocks[idx(lx, p.y, lz)] = p.id;
            }
          }
        }
        this.pending.delete(ck);
      }

      // プレイヤーの変更を適用
      const edits = this.editsByChunk.get(ck);
      if (edits) {
        for (const [k, id] of edits) {
          const [x, y, z] = k.split(',').map(Number);
          const lx = x & 15, lz = z & 15;
          if (y >= 0 && y < WH && lx >= 0 && lx < CX && lz >= 0 && lz < CZ) {
            c.blocks[idx(lx, y, lz)] = id;
            const bk = World.bkey(x, y, z);
            if (id === ID.torch) this.torches.add(bk);
            if (id === ID.furnace && !this.furnaces.has(bk)) this.furnaces.set(bk, new InventorySystem.Furnace());
            if (id === ID.chest && !this.chests.has(bk)) this.chests.set(bk, new Array(27).fill(null));
          }
        }
      }

      this.recalcHeight(c);
      c.dirty = true;
      // v0.10.4 B4: 未生成チャンクに pending されていたチェストのルートをマージ。
      // (構造物がチャンク境界をまたぎ、チェストブロックが後から生成された場合)
      if (this.pendingChestLoot && this.pendingChestLoot.size) {
        for (const [bk, stacks] of this.pendingChestLoot) {
          const [px, py, pz] = bk.split(',').map(Number);
          if ((px >> 4) !== cx || (pz >> 4) !== cz) continue;   // このチャンクのものだけ
          if (c.blocks[idx(px & 15, py, pz & 15)] !== ID.chest) continue;   // チェストが無い
          let arr = this.chests.get(bk);
          if (!arr) { arr = new Array(27).fill(null); this.chests.set(bk, arr); }
          for (let i = 0; i < 27; i++) if (stacks[i] && !arr[i]) arr[i] = stacks[i];
          this.pendingChestLoot.delete(bk);
        }
      }
      // 隣接チャンクの境界を作り直す
      this.markDirty(cx - 1, cz); this.markDirty(cx + 1, cz);
      this.markDirty(cx, cz - 1); this.markDirty(cx, cz + 1);
      return c;
    }

    /* ==========================================================
       v0.13.1: ネザー次元
       - 岩盤天井 (y=WH-1) とネザーラックの地殻に囲まれた洞窟世界
       - 溶岩海 (y<=SEA)、大きな溶岩湖、ソウルサンドの谷、
         玄武岩の柱、天井のグロウストーン鉱脈、ネザー金/水晶鉱石
       ========================================================== */

    /** ネザーの地表高 (溶岩海から突き出た大地の高さ) */
    netherHeight(wx, wz) {
      const base = this.perlin.fbm2(wx * 0.011, wz * 0.011, 3);          // 大起伏
      const hills = this.perlin2.fbm2(wx * 0.045 + 31, wz * 0.045 - 17, 2); // 細かい丘
      const ridge = 1 - Math.abs(this.perlin.fbm2(wx * 0.016 - 90, wz * 0.016 + 55, 3)); // 尾根
      // 溶岩海 (SEA=30) を広げるため大地の中央を海抜より下に。fbm2 はやや正に偏るため下げ幅を大きく
      let h = SEA - 9 + base * 34 + hills * 8 + Math.max(0, ridge - 0.62) * 22;
      return Math.max(5, Math.min(68, Math.floor(h)));
    }

    /** ソウルサンドの谷かどうか (局在化した帯) */
    isSoulValley(wx, wz) {
      return this.perlin2.fbm2(wx * 0.014 + 700, wz * 0.014 - 300, 2) > 0.05;
    }

    /** デバッグ表示用のネザー地形名 */
    netherFeatureAt(wx, wz) {
      const h = this.netherHeight(wx, wz);
      if (h <= SEA) return 'nether_lava_sea';
      return this.isSoulValley(wx, wz) ? 'nether_soul_valley' : 'nether_wastes';
    }

    /** ネザーチャンクの生成 */
    generateNetherChunk(c, cx, cz, rnd, ck) {
      const colH = new Int16Array(CX * CZ);
      const colSoul = new Uint8Array(CX * CZ);
      // 列ごとの高さ
      for (let lz = 0; lz < CZ; lz++) {
        for (let lx = 0; lx < CX; lx++) {
          const i = lx + lz * CX;
          const wx = (cx << 4) + lx, wz = (cz << 4) + lz;
          colH[i] = this.netherHeight(wx, wz);
          colSoul[i] = this.isSoulValley(wx, wz) ? 1 : 0;
        }
      }

      for (let lz = 0; lz < CZ; lz++) {
        for (let lx = 0; lx < CX; lx++) {
          const wx = (cx << 4) + lx, wz = (cz << 4) + lz;
          const ci = lx + lz * CX;
          const h = colH[ci];
          const soul = colSoul[ci] === 1;
          // 地層ノイズ (玄武岩・マグマの帯)
          const strataN = this.perlin2.fbm2(wx * 0.05 + 220, wz * 0.05 - 180, 3);

          // --- 地殻 (ネザーラック) ---
          for (let y = 0; y <= h; y++) {
            let id = ID.netherrack;
            if (y === 0) id = ID.bedrock;
            else if (y === h) {
              // 地表: ソウルサンドの谷 or ネザーラック (稀にマグマ)
              if (soul) id = ID.soul_sand;
              else if (strataN > 0.34) id = ID.magma;
              else if (strataN < -0.40) id = ID.basalt;
            } else if (y > h - 3 && soul) {
              id = ID.soul_sand;   // 谷の表土層もソウルサンド
            } else if (strataN > 0.42) {
              id = ID.basalt_smooth;   // 玄武岩の帯
            }
            c.blocks[idx(lx, y, lz)] = id;
          }
          // --- 溶岩海 ---
          for (let y = h + 1; y <= SEA; y++) {
            c.blocks[idx(lx, y, lz)] = ID.lava;
          }
          // --- 岩盤天井 ---
          c.blocks[idx(lx, WH - 1, lz)] = ID.bedrock;
          // 天井直下 (WH-2) に凹凸のあるネザーラックの天井 (天井高 ~ WH-6)
          const ceilH = WH - 6 + Math.floor(this.perlin2.fbm2(wx * 0.06 + 11, wz * 0.06 - 7, 2) * 3);
          for (let y = ceilH; y <= WH - 2; y++) {
            c.blocks[idx(lx, y, lz)] = ID.netherrack;
          }

          // --- 洞窟 (ネザーの大空洞): 地殻の中を掘る ---
          for (let y = 2; y < h - 1; y++) {
            const bi = idx(lx, y, lz);
            if (c.blocks[bi] !== ID.netherrack && c.blocks[bi] !== ID.basalt &&
                c.blocks[bi] !== ID.basalt_smooth && c.blocks[bi] !== ID.soul_sand &&
                c.blocks[bi] !== ID.magma) continue;
            // チーズ洞穴 (大きな空洞)
            const cheese = this.perlin3.fbm3(wx * 0.020 + 500, y * 0.042, wz * 0.020 - 300, 3);
            // スパゲッティ (トンネル)
            const sp1 = this.perlin3.fbm3(wx * 0.05 + 300, y * 0.07, wz * 0.05 + 140, 3);
            const sp2 = this.perlin3.fbm3(wx * 0.05 - 520, y * 0.07 + 31.7, wz * 0.05 + 260, 3);
            const spag = Math.sqrt(sp1 * sp1 + sp2 * sp2);
            if (cheese > 0.66 || spag < 0.055) {
              c.blocks[bi] = 0;
              continue;
            }
            // --- 鉱脈 (ネザー金・水晶・溶岩ポケット) ---
            const veinField = this.perlin3.fbm3(wx * 0.11 + 1300, y * 0.11, wz * 0.11 - 800, 2);
            const r = rnd();
            if (veinField > 0.24) {
              if (r < 0.14) c.blocks[bi] = ID.nether_quartz_ore;
              else if (r < 0.30) c.blocks[bi] = ID.nether_gold_ore;
              else if (r < 0.36 && y < 20) c.blocks[bi] = ID.magma;
            } else if (r < 0.004) {
              c.blocks[bi] = ID.magma;
            }
          }
        }
      }

      c.generated = true;
      this.recalcHeight(c);

      // 溶岩を水源登録 (流体シミュレーション)
      for (let y = 0; y < WH; y++) {
        for (let lz = 0; lz < CZ; lz++) {
          for (let lx = 0; lx < CX; lx++) {
            if (c.blocks[idx(lx, y, lz)] === ID.lava) {
              this.fluidLevel.set(this.fluidKey((cx << 4) + lx, y, (cz << 4) + lz), 0);
            }
          }
        }
      }

      // --- 装飾 (setBlockGen 経由でチャンク境界対応) ---
      for (let lz = 0; lz < CZ; lz++) {
        for (let lx = 0; lx < CX; lx++) {
          const wx = (cx << 4) + lx, wz = (cz << 4) + lz;
          const ci = lx + lz * CX;
          const h = colH[ci];
          // (1) 天井のグロウストーン鉱脈 (天井に垂れ下がる発光の塊)
          if (rnd() < 0.030) {
            // 天井下面を探す (WH-2 から下へ最初の空気の上)
            for (let y = WH - 2; y > WH - 12; y--) {
              if (c.blocks[idx(lx, y, lz)] !== 0 && c.blocks[idx(lx, y - 1, lz)] === 0) {
                // 天井の下面が見つかった: 1-3ブロックのグロウストーンを下に垂らす
                const len = 1 + ((rnd() * 3) | 0);
                for (let k = 0; k < len; k++) {
                  this.setBlockGen(wx, y - 1 - k, wz, ID.glowstone);
                }
                // 周囲にも少し広げる
                if (rnd() < 0.5) this.setBlockGen(wx + 1, y - 1, wz, ID.glowstone);
                if (rnd() < 0.5) this.setBlockGen(wx, y - 1, wz + 1, ID.glowstone);
                break;
              }
            }
          }
          // (2) 玄武岩の柱 (地表から天井方向にそびえる石柱)
          if (h > SEA && !colSoul[ci] && rnd() < 0.006) {
            const bh = 6 + ((rnd() * 14) | 0);
            for (let k = 1; k <= bh; k++) {
              const y = h + k;
              if (y >= WH - 8) break;
              if (this.getBlock(wx, y, wz) === 0) {
                this.setBlockGen(wx, y, wz, rnd() < 0.7 ? ID.basalt : ID.basalt_smooth);
              } else break;
            }
          }
          // (3) 大きな溶岩湖 (溶岩海より高い台地の窪地)
          if (h > SEA + 4 && rnd() < 0.012) {
            // 3x3 を掘って溶岩を張る
            for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
              const nx = wx + dx, nz = wz + dz;
              const nh = this.getHeight(nx, nz);
              if (nh > SEA) {
                this.setBlockGen(nx, nh, nz, ID.lava);
                this.fluidLevel.set(this.fluidKey(nx, nh, nz), 0);
                if (dx === 0 && dz === 0) this.setBlockGen(nx, nh - 1, nz, ID.lava);
                this.fluidLevel.set(this.fluidKey(nx, nh - 1, nz), 0);
              }
            }
          }
        }
      }

      // 保留ブロック・プレイヤー変更を適用 (overworld と同じ処理)
      const pend = this.pending.get(ck);
      if (pend) {
        for (const p of pend) {
          const lx = p.x & 15, lz = p.z & 15;
          if (p.y >= 0 && p.y < WH) {
            const cur = c.blocks[idx(lx, p.y, lz)];
            if (p.force) {
              if (cur !== ID.bedrock) {
                c.blocks[idx(lx, p.y, lz)] = p.id;
                if (p.id === ID.chest) {
                  const bk = World.bkey(p.x, p.y, p.z);
                  if (!this.chests.has(bk)) this.chests.set(bk, new Array(27).fill(null));
                }
              }
            } else if (cur === 0 || cur === ID.lava) {
              c.blocks[idx(lx, p.y, lz)] = p.id;
            }
          }
        }
        this.pending.delete(ck);
      }
      const edits = this.editsByChunk.get(ck);
      if (edits) {
        for (const [k, id] of edits) {
          const [x, y, z] = k.split(',').map(Number);
          const lx = x & 15, lz = z & 15;
          if (y >= 0 && y < WH && lx >= 0 && lx < CX && lz >= 0 && lz < CZ) {
            c.blocks[idx(lx, y, lz)] = id;
            const bk = World.bkey(x, y, z);
            if (id === ID.torch) this.torches.add(bk);
            if (id === ID.furnace && !this.furnaces.has(bk)) this.furnaces.set(bk, new InventorySystem.Furnace());
            if (id === ID.chest && !this.chests.has(bk)) this.chests.set(bk, new Array(27).fill(null));
          }
        }
      }

      this.recalcHeight(c);
      c.dirty = true;
      this.markDirty(cx - 1, cz); this.markDirty(cx + 1, cz);
      this.markDirty(cx, cz - 1); this.markDirty(cx, cz + 1);
      return c;
    }

    /* ==========================================================
       v0.13.2: エンド次元
       - 虚空 (空気) の上に浮かぶエンドストーンの島々
       - 中央島 (0,0 付近) は黒曜石柱とボス戦の舞台、外周に小島を散らす
       - 岩盤の床/天井はなく、下は奈落 (落下 = 死亡)
       ========================================================== */

    /** エンドの島の高さ (虚空は -1、島の中心ほど高い) */
    endIslandHeight(wx, wz) {
      // 中央の大島: 原点からの距離で盛り上がる (半径 ~70)
      const d0 = Math.hypot(wx, wz);
      const n0 = this.perlin.fbm2(wx * 0.012, wz * 0.012, 3);
      let h = -1;
      if (d0 < 76) {
        // 中央島: 高さ 38〜54、外縁に向かって下がる。中央 (d0<14) は平らな闘技場
        const edge = 1 - Math.max(0, d0 - 14) / 62;
        h = 40 + edge * 10 + n0 * 4;
      } else {
        // 外周の小島群: 距離 90〜220 の帯にノイズで点在させる
        const band = Math.max(0, 1 - Math.abs(d0 - 150) / 75);
        if (band > 0) {
          const isl = this.perlin2.fbm2(wx * 0.017 + 1234, wz * 0.017 - 987, 3);
          // ノイズが高い場所だけ島になる (虚空に浮かぶ点々)
          if (isl > 0.42) {
            const t = Math.min(1, (isl - 0.42) / 0.30);
            h = 38 + t * 12 + band * 5 + this.perlin.fbm2(wx * 0.05 + 50, wz * 0.05 - 30, 2) * 3;
          }
        }
      }
      return h < 0 ? -1 : Math.max(30, Math.min(58, Math.floor(h)));
    }

    /** デバッグ表示用のエンド地形名 */
    endFeatureAt(wx, wz) {
      const h = this.endIslandHeight(wx, wz);
      if (h < 0) return 'end_void';
      return Math.hypot(wx, wz) < 76 ? 'end_central' : 'end_outer';
    }

    /** エンドチャンクの生成 (浮島・虚空・黒曜石柱) */
    generateEndChunk(c, cx, cz, rnd, ck) {
      const colH = new Int16Array(CX * CZ);
      for (let lz = 0; lz < CZ; lz++) {
        for (let lx = 0; lx < CX; lx++) {
          const i = lx + lz * CX;
          const wx = (cx << 4) + lx, wz = (cz << 4) + lz;
          colH[i] = this.endIslandHeight(wx, wz);
        }
      }

      for (let lz = 0; lz < CZ; lz++) {
        for (let lx = 0; lx < CX; lx++) {
          const wx = (cx << 4) + lx, wz = (cz << 4) + lz;
          const ci = lx + lz * CX;
          const h = colH[ci];
          if (h < 0) continue;   // 虚空 (空気のまま)

          // --- 島の本体 (エンドストーン) ---
          // 外縁ほど薄くなる: 表面から下に 3〜8 ブロック。裾はノイズでギザギザに
          const rim = this.perlin2.fbm2(wx * 0.06 + 77, wz * 0.06 - 55, 2);
          const depth = 4 + Math.max(0, Math.floor((h - 36) * 0.35)) + Math.floor(rim * 2.5);
          for (let y = h; y > h - depth && y > 0; y--) {
            let id = ID.end_stone;
            // 下部は黒曜石の脈を混ぜる (エンドの硬い岩盤の代替)
            if (y < h - 2 && rim > 0.42 && rnd() < 0.22) id = ID.obsidian;
            c.blocks[idx(lx, y, lz)] = id;
          }
          // 島の裾 (一番下) に希少な黒曜石の鍾乳 (下から見える装飾)
          const drip = this.perlin3.fbm3(wx * 0.09 + 400, h * 0.09, wz * 0.09 - 300, 2);
          if (drip > 0.55) {
            const tip = h - depth - ((rnd() * 3) | 0);
            if (tip > 1) c.blocks[idx(lx, tip, lz)] = ID.obsidian;
          }
        }
      }

      c.generated = true;
      this.recalcHeight(c);

      // --- 中央島: 黒曜石柱の円環 (ボス戦の舞台) ---
      const bcx = (cx << 4) + 8, bcz = (cz << 4) + 8;
      const dc = Math.hypot(bcx, bcz);
      if (dc < 40 && !this._endPillarsDone) {
        // チャンクまたぎを避けて1回だけ生成 (0,0 を含むチャンクで判定)
        if (bcx >= -8 && bcx < 8 && bcz >= -8 && bcz < 8) {
          this._endPillarsDone = true;
          // 周囲のチャンクも生成してから柱を建てる (setBlockForce で pending 処理)
          const ringR = 18;
          const heights = [6, 8, 9, 10, 11, 12, 13, 14];
          for (let k = 0; k < 8; k++) {
            const ang = (k / 8) * Math.PI * 2;
            const px = Math.round(Math.cos(ang) * ringR);
            const pz = Math.round(Math.sin(ang) * ringR);
            const gh = this.endIslandHeight(px, pz);
            if (gh < 0) continue;
            const ph = heights[k];
            for (let y = gh + 1; y <= gh + ph; y++) this.setBlockForce(px, y, pz, ID.obsidian);
            // 柱の先端にクリスタル台座 (装飾。将来的なエンドクリスタルの場所)
            this.setBlockForce(px, gh + ph + 1, pz, ID.end_crystal_base);
          }
        }
      }

      // --- 外周の小島: 紫の装飾 (希少なシュルームライトの瘤) ---
      for (let lz = 0; lz < CZ; lz++) {
        for (let lx = 0; lx < CX; lx++) {
          const ci = lx + lz * CX;
          const h = colH[ci];
          if (h < 0) continue;
          const wx = (cx << 4) + lx, wz = (cz << 4) + lz;
          // 島の表面に低確率で発光するシュルームライト (エンドの光源)
          if (rnd() < 0.012 && Math.hypot(wx, wz) > 40) {
            c.blocks[idx(lx, h + 1, lz)] = ID.shroomlight;
            this.torches.add(World.bkey(wx, h + 1, wz));
            c.dirty = true;
          }
        }
      }

      // 保留ブロック・プレイヤー変更を適用 (他次元と同じ処理)
      const pend = this.pending.get(ck);
      if (pend) {
        for (const p of pend) {
          const lx = p.x & 15, lz = p.z & 15;
          if (p.y >= 0 && p.y < WH) {
            const cur = c.blocks[idx(lx, p.y, lz)];
            if (p.force) {
              if (cur !== ID.bedrock) {
                c.blocks[idx(lx, p.y, lz)] = p.id;
                if (p.id === ID.chest) {
                  const bk = World.bkey(p.x, p.y, p.z);
                  if (!this.chests.has(bk)) this.chests.set(bk, new Array(27).fill(null));
                }
              }
            } else if (cur === 0) {
              c.blocks[idx(lx, p.y, lz)] = p.id;
            }
          }
        }
        this.pending.delete(ck);
      }
      const edits = this.editsByChunk.get(ck);
      if (edits) {
        for (const [k, id] of edits) {
          const [x, y, z] = k.split(',').map(Number);
          const lx = x & 15, lz = z & 15;
          if (y >= 0 && y < WH && lx >= 0 && lx < CX && lz >= 0 && lz < CZ) {
            c.blocks[idx(lx, y, lz)] = id;
            const bk = World.bkey(x, y, z);
            if (id === ID.torch) this.torches.add(bk);
            if (id === ID.furnace && !this.furnaces.has(bk)) this.furnaces.set(bk, new InventorySystem.Furnace());
            if (id === ID.chest && !this.chests.has(bk)) this.chests.set(bk, new Array(27).fill(null));
          }
        }
      }

      this.recalcHeight(c);
      c.dirty = true;
      this.markDirty(cx - 1, cz); this.markDirty(cx + 1, cz);
      this.markDirty(cx, cz - 1); this.markDirty(cx, cz + 1);
      return c;
    }

    recalcHeight(c) {
      for (let lz = 0; lz < CZ; lz++) {
        for (let lx = 0; lx < CX; lx++) {
          let y = WH - 1;
          while (y > 0 && !B.get(c.blocks[idx(lx, y, lz)]).opaque) y--;
          c.height[lx + lz * CX] = y;
        }
      }
    }

    /* ===== v0.6: 地形フィーチャ ===== */
    /* オアシス / 滝 / 温泉 / 鍾乳洞 をチャンクに散らす */
    genLandFeatures(c, cx, cz, rnd, colBiome, colH) {
      const fchance = this.perlin2.noise2(cx * 0.35 + 77, cz * 0.35 - 55);
      // チャンクごとに1種類まで (疎に)
      const roll = rnd();

      /* --- オアシス (砂漠) --- */
      if (roll < 0.05) {
        const ox = cx * 16 + 4 + ((rnd() * 8) | 0), oz = cz * 16 + 4 + ((rnd() * 8) | 0);
        const biome = this.biomeAt(ox, oz);
        if (biome === 'desert') {
          const h = this.getHeight(ox, oz);
          // 3x3 の水たまりを掘って水を張る
          for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) {
            const r2 = dx * dx + dz * dz;
            if (r2 > 6) continue;
            const wx = ox + dx, wz = oz + dz;
            const hh = this.getHeight(wx, wz);
            for (let y = hh; y >= hh - 1; y--) this.setBlockGen(wx, y, wz, 0);
            this.setBlockGen(wx, hh - 1, wz, ID.water);
            this.fluidLevel.set(this.fluidKey(wx, hh - 1, wz), 0);
            if (r2 <= 2) this.setBlockGen(wx, hh, wz, ID.water), this.fluidLevel.set(this.fluidKey(wx, hh, wz), 0);
          }
          // 周囲にサトウキビと草
          for (let dx = -3; dx <= 3; dx++) for (let dz = -3; dz <= 3; dz++) {
            if (dx * dx + dz * dz < 7) continue;
            if (rnd() < 0.3) {
              const wx = ox + dx, wz = oz + dz;
              const hh = this.getHeight(wx, wz);
              if (this.getBlock(wx, hh, wz) === ID.sand && this.getBlock(wx, hh + 1, wz) === 0) {
                const hgt = 1 + ((rnd() * 2) | 0);
                for (let i = 0; i < hgt; i++) this.setBlockGen(wx, hh + 1 + i, wz, rnd() < 0.5 ? ID.sugarcane : ID.tall_grass);
              }
            }
          }
        }
      }

      /* --- 滝 (山岳/高山の崖) --- */
      if (roll >= 0.05 && roll < 0.10) {
        const wx = cx * 16 + ((rnd() * 16) | 0), wz = cz * 16 + ((rnd() * 16) | 0);
        const biome = this.biomeAt(wx, wz);
        if (biome === 'mountains' || biome === 'high_mountains') {
          const h = this.getHeight(wx, wz);
          if (h > SEA + 8) {
            // 崖の縁に水源を置き、下へ流す
            this.setBlockGen(wx, h, wz, ID.water);
            this.fluidLevel.set(this.fluidKey(wx, h, wz), 0);
            this.scheduleFluid(wx, h, wz);
          }
        }
      }

      /* --- 温泉 (山岳・雪原の窪地に湯) --- */
      if (roll >= 0.10 && roll < 0.16) {
        const wx = cx * 16 + 3 + ((rnd() * 10) | 0), wz = cz * 16 + 3 + ((rnd() * 10) | 0);
        const biome = this.biomeAt(wx, wz);
        if (biome === 'mountains' || biome === 'snow' || biome === 'taiga' || biome === 'high_mountains') {
          const h = this.getHeight(wx, wz);
          for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
            const x2 = wx + dx, z2 = wz + dz;
            const hh = this.getHeight(x2, z2);
            for (let y = hh; y >= hh - 1; y--) this.setBlockGen(x2, y, z2, 0);
            this.setBlockGen(x2, hh - 1, z2, ID.water);
            this.fluidLevel.set(this.fluidKey(x2, hh - 1, z2), 0);
          }
          // 縁を石で囲む
          for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) {
            if (Math.abs(dx) !== 2 && Math.abs(dz) !== 2) continue;
            const x2 = wx + dx, z2 = wz + dz;
            const hh = this.getHeight(x2, z2);
            if (this.getBlock(x2, hh + 1, z2) === 0) this.setBlockGen(x2, hh, z2, ID.stone);
          }
        }
      }

      /* --- 鍾乳洞 (v0.10.2 #4: 複数列・接地形状に修正) --- */
      // 洞窟の天井から鍾乳石、床から石筍を複数列に生成する。
      // 従来は1チャンクに1列のみ・空中浮遊の石だったのを、洞窟に沿った
      // まとまった鍾乳洞らしい見た目にする。
      if (roll >= 0.16 && roll < 0.30) {
        // チャンク内の複数の候補列を走査
        const tries = 5 + ((rnd() * 4) | 0);
        for (let t = 0; t < tries; t++) {
          const lxc = (rnd() * 16) | 0, lzc = (rnd() * 16) | 0;
          const wx = cx * 16 + lxc, wz = cz * 16 + lzc;
          // v0.10.3 C4: 探索開始高さを colH[0] (チャンクの角の列) ではなく
          // その列自身の実高さ colH[lxc+lzc*16] から始める。
          // 旧実装は角の列の高さを使い回していたため、地形が起伏していると
          // 殆どの列で洞窟を見つけられず、鍾乳洞が事実上生成されなかった。
          const colTop = colH[lxc + lzc * CX] || 40;
          for (let y = Math.min(colTop, WH - 8); y > 6; y--) {
            const above = this.getBlock(wx, y + 1, wz);
            const cur = this.getBlock(wx, y, wz);
            const below = this.getBlock(wx, y - 1, wz);
            // 天井に石がある空洞 → 鍾乳石 (下に向かって伸びる、先端は接地を試みる)
            if (cur === 0 && above === ID.stone) {
              const len = 2 + ((rnd() * 3) | 0);   // 2-4連
              for (let i = 1; i <= len; i++) {
                const yy = y - i + 1;
                if (yy <= 0) break;
                const at = this.getBlock(wx, yy, wz);
                if (at !== 0) break;   // 床に達したら止める (接地)
                this.setBlockGen(wx, yy, wz, ID.stone);
              }
              break;
            }
            // 床に石がある空洞 → 石筍 (上に向かって伸びる)
            if (cur === 0 && below === ID.stone) {
              const len = 1 + ((rnd() * 3) | 0);   // 1-3連
              for (let i = 0; i < len; i++) {
                const yy = y + i;
                if (yy >= WH) break;
                if (this.getBlock(wx, yy, wz) !== 0) break;   // 天井に達したら止める
                this.setBlockGen(wx, yy, wz, ID.cobblestone);
              }
              break;
            }
          }
        }
      }
    }

    /* ===== v0.7/v0.8: 構造物 ===== */
    /* v0.8: リージョン単位の決定論的配置に変更し、異様な生成頻度を大幅に低減。
       各 8×8 チャンク (128×128 ブロック) のリージョンに最大1箇所だけ配置する。 */
    regionRoll(rx, rz, salt) {
      // 決定論的ハッシュ (0..1)。同じ座標・シードなら毎回同じ値。
      let n = (this.seed ^ (rx * 73856093) ^ (rz * 19349663) ^ (salt * 83492791)) >>> 0;
      n = Math.imul(n ^ (n >>> 15), 2246822519) >>> 0;
      n = Math.imul(n ^ (n >>> 13), 3266489917) >>> 0;
      return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
    }

    genStructures(c, cx, cz, rnd, colBiome, colH) {
      // リージョンの中央チャンクでのみ生成判定を行う
      const rx = Math.floor(cx / 8), rz = Math.floor(cz / 8);
      const lcx = ((cx % 8) + 8) % 8, lcz = ((cz % 8) + 8) % 8;
      const hx = Math.floor(this.regionRoll(rx, rz, 1) * 6) + 1;  // 1..6
      const hz = Math.floor(this.regionRoll(rx, rz, 2) * 6) + 1;  // 1..6
      if (lcx !== hx || lcz !== hz) return;

      const bx = cx * 16 + 8, bz = cz * 16 + 8;
      const biome = this.biomeAt(bx, bz);
      const kind = this.regionRoll(rx, rz, 3);
      const vrand = mulberry32((this.seed ^ (rx * 374761393) ^ (rz * 668265263)) >>> 0);

      // v0.10.3 S1: 構造物の立地適性チェック。
      // 中心周辺 9×9 の高さを調べ、(a) 激しい段差がない、(b) 水上でない
      // 場所にだけ村・寺院を建てる。崖の縁や海上に構造物が浮くのを防ぐ。
      const suitable = (rad, maxSlope) => {
        let mn = 1e9, mx = -1e9;
        for (let dx = -rad; dx <= rad; dx += 2) for (let dz = -rad; dz <= rad; dz += 2) {
          const hh = this.getHeight(bx + dx, bz + dz);
          if (hh < 0) return false;
          const surf = this.getBlock(bx + dx, hh, bz + dz);
          if (B.isLiquid(surf)) return false;   // 水上は不適
          if (hh < SEA) return false;            // 海面以下も不適
          if (hh < mn) mn = hh; if (hh > mx) mx = hh;
        }
        return (mx - mn) <= maxSlope;
      };

      /* --- 村 (v0.8: 平原限定。頻度 ~11%) --- */
      if (biome === 'plains' && kind < 0.11) {
        if (!suitable(9, 5)) return;   // 段差 5 以内の平坦な陸地のみ
        this.buildVillage(bx, bz, vrand);
        return;
      }

      /* --- 寺院 (砂漠・ジャングル。頻度 ~9%) --- */
      if ((biome === 'desert' || biome === 'jungle') && kind >= 0.11 && kind < 0.20) {
        if (!suitable(6, 6)) return;
        this.buildTemple(bx, bz, vrand, biome);
        return;
      }

      /* --- ダンジョン (地下。どのバイオームでも ~6%) --- */
      if (kind >= 0.20 && kind < 0.26) {
        // v0.10.3 S3: ダンジョンを近くの洞窟にトンネルで接続するため、
        // 地表の深さに応じたYを選び、接続処理を渡す。
        const gy = this.getHeight(bx, bz);
        const y = Math.max(10, Math.min(gy - 8, 12 + (vrand() * 20 | 0)));
        this.buildDungeon(bx, y, bz, vrand);
        this.connectDungeonToCave(bx, y, bz, vrand);
        return;
      }

      /* ===== v0.13: 氷山 (凍った海に浮かぶ巨大な氷塊。水中部分も生成) ===== */
      if (kind >= 0.26 && kind < 0.38) {
        // リージョン中心周辺が氷山バイオームの海列かを確認
        const cb = this.displayBiomeAt(bx, bz);
        if (cb !== 'icebergs') return;
        const gy = this.getHeight(bx, bz);
        if (gy >= SEA) return;   // 陸地には作らない
        this.buildIceberg(bx, bz, gy, vrand);
        return;
      }

      /* ===== v0.13: 海の構造物 (沈没船 / 海底神殿 / 水中遺跡) ===== */
      if (kind >= 0.38 && kind < 0.50) {
        const gy = this.getHeight(bx, bz);
        const db = this.displayBiomeAt(bx, bz);
        // 十分に深い海 (氷山バイオームは除く) にのみ生成
        if (gy >= SEA - 4 || db === 'icebergs') return;
        const pick = vrand();
        if (pick < 0.40) this.buildShipwreck(bx, gy, bz, vrand);
        else if (pick < 0.72) this.buildUnderwaterRuins(bx, gy, bz, vrand);
        else this.buildOceanMonument(bx, gy, bz, vrand);
        return;
      }

      /* ===== v0.13.2: エンドポータル部屋 (地下の遺跡。どのバイオームでも ~6%) ===== */
      if (kind >= 0.50 && kind < 0.56) {
        const gy = this.getHeight(bx, bz);
        if (gy < SEA) return;   // 海底には作らない
        // ダンジョンよりやや深めのYを選ぶ
        const y = Math.max(8, Math.min(gy - 12, 8 + (vrand() * 10 | 0)));
        this.buildEndPortalRoom(bx, y, bz, vrand);
        return;
      }
    }

    /* ===== v0.13.2: エンドポータル部屋 =====
       ダンジョン風の地下遺跡 (9x9) の床に 5x5 のエンドポータルフレームを埋め、
       内側 3x3 をエンドポータルで満たす。ポータルは非固体なので、
       中央に踏み込むとポータル内に沈み込み、転移判定 (main.js) が発火する。 */
    buildEndPortalRoom(x, y, z, rnd) {
      const r = 4, hgt = 5;
      // 空洞を掘る
      for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++)
        for (let dy = 0; dy < hgt; dy++) this.setBlockForce(x + dx, y + dy, z + dz, 0);
      // 壁・床・天井 (ダンジョンと同じ丸石/苔石の遺跡スタイル)
      for (let dx = -r - 1; dx <= r + 1; dx++) for (let dz = -r - 1; dz <= r + 1; dz++) {
        const edge = Math.abs(dx) > r || Math.abs(dz) > r;
        for (let dy = -1; dy <= hgt; dy++) {
          const shell = edge || dy < 0 || dy >= hgt;
          if (!shell) continue;
          const id = rnd() < 0.4 ? ID.mossy_cobblestone : ID.cobblestone;
          this.setBlockForce(x + dx, y + dy, z + dz, id);
        }
      }
      // ポータル: 床レベル (y-1) に 5x5 フレーム + 内側 3x3 ポータル
      for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) {
        const ring = Math.max(Math.abs(dx), Math.abs(dz)) === 2;
        this.setBlockForce(x + dx, y - 1, z + dz, ring ? ID.end_frame : ID.end_portal);
      }
      // ポータルの真下に受け皿 (転移失敗時に落ち続けないように)
      for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++)
        this.setBlockForce(x + dx, y - 2, z + dz, ID.obsidian);
      // 四隅の柱と松明 (遺跡らしさ + 光源)
      for (const [px, pz] of [[-3, -3], [3, -3], [-3, 3], [3, 3]]) {
        const pid = rnd() < 0.4 ? ID.mossy_cobblestone : ID.cobblestone;
        for (let dy = 0; dy < hgt - 1; dy++) this.setBlockForce(x + px, y + dy, z + pz, pid);
      }
      this.setBlockForce(x - 3, y + 2, z, ID.torch);
      this.setBlockForce(x + 3, y + 2, z, ID.torch);
      this.setBlockForce(x, y + 2, z - 3, ID.torch);
      this.setBlockForce(x, y + 2, z + 3, ID.torch);
      // 宝のチェスト (ダンジョンのルートテーブルを流用)
      this.setBlockForce(x - 3, y, z + 3, ID.chest);
      this.fillLootChest(x - 3, y, z + 3, rnd, 'dungeon');
      // 番人 (シルバーフィッシュがいないのでゾンビで代用)
      this.pendingSpawns = this.pendingSpawns || [];
      this.pendingSpawns.push({ type: 'zombie', x: x + 2.5, y: y + 1, z: z + 2.5 });
      this.pendingSpawns.push({ type: 'zombie', x: x - 2.5, y: y + 1, z: z - 2.5 });
    }

    /* ===== v0.13: 巨大キノコ (きのこ島) ===== */
    /* 柄 (mushroom_stem) の柱 + 傘 (赤/茶キノコブロック) の古典的な形 */
    growGiantMushroom(x, y, z, rnd) {
      const isRed = rnd() < 0.5;
      const capId = isRed ? ID.mushroom_block_red : ID.mushroom_block_brown;
      const hgt = isRed ? 5 + ((rnd() * 3) | 0) : 6 + ((rnd() * 3) | 0);   // 赤 5-7, 茶 6-8
      // 柄
      for (let i = 0; i < hgt; i++) this.setBlockGen(x, y + i, z, ID.mushroom_stem);
      const topY = y + hgt - 1;
      if (isRed) {
        // 赤キノコ: 頂上に 5x5 の平らな傘 + その上に 3x3
        for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) {
          if (Math.abs(dx) === 2 && Math.abs(dz) === 2 && rnd() < 0.5) continue;   // 角を欠いて丸みを
          this.setBlockGen(x + dx, topY, z + dz, capId);
        }
        for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++)
          this.setBlockGen(x + dx, topY + 1, z + dz, capId);
      } else {
        // 茶キノコ: 頂上に 7x7 の薄い円盤状の傘
        for (let dx = -3; dx <= 3; dx++) for (let dz = -3; dz <= 3; dz++) {
          const r2 = dx * dx + dz * dz;
          if (r2 > 11) continue;
          this.setBlockGen(x + dx, topY, z + dz, capId);
        }
        this.setBlockGen(x, topY + 1, z, capId);
      }
    }

    /* ===== v0.13: 巨大氷山 (水上の峰 + 水中の大きな基部) ===== */
    buildIceberg(x, z, seaFloor, rnd) {
      // 峰の高さ (海面より上) と基部の深さ (海面より下)。基部は峰より大きい (現実の氷山)
      const peakH = 8 + ((rnd() * 10) | 0);          // 8-17
      const baseDepth = Math.min(SEA - seaFloor - 1, 14 + ((rnd() * 14) | 0));  // 海底まで
      const peakR = 3 + ((rnd() * 4) | 0);           // 峰の半径 3-6
      const baseR = peakR + 3 + ((rnd() * 3) | 0);   // 基部の半径 (峰より大きい)
      // 水中の基部: 海面から海底に向かって広がる逆円錐 (青氷の芯 + 氷塊の外殻)
      for (let dy = 0; dy <= baseDepth; dy++) {
        const yy = SEA - 1 - dy;
        if (yy <= seaFloor) break;
        const rr = Math.round(baseR * (1 - dy / (baseDepth + 4)));
        for (let dx = -rr; dx <= rr; dx++) for (let dz = -rr; dz <= rr; dz++) {
          const dist = Math.sqrt(dx * dx + dz * dz) + (rnd() - 0.5) * 1.2;
          if (dist > rr) continue;
          const core = dist < rr * 0.45;
          this.setBlockForce(x + dx, yy, z + dz, core ? ID.blue_ice : ID.packed_ice);
        }
      }
      // 基部の下に岩の根 (海底に接地させる)
      for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) {
        if (dx * dx + dz * dz > 6) continue;
        for (let yy = seaFloor + 1; yy <= Math.min(seaFloor + 2, SEA - baseDepth - 1); yy++)
          this.setBlockForce(x + dx, yy, z + dz, ID.stone);
      }
      // 水上の峰: 海面から上に窄まる円錐。頂上は雪を被る
      for (let dy = 0; dy <= peakH; dy++) {
        const yy = SEA + dy;
        const rr = Math.max(0, Math.round(peakR * (1 - dy / (peakH + 2))));
        for (let dx = -rr; dx <= rr; dx++) for (let dz = -rr; dz <= rr; dz++) {
          const dist = Math.sqrt(dx * dx + dz * dz) + (rnd() - 0.5) * 1.4;
          if (dist > rr) continue;
          const snowCap = dy >= peakH - 2 || dist >= rr - 0.6;
          this.setBlockForce(x + dx, yy, z + dz, snowCap ? ID.snow_block : (rnd() < 0.25 ? ID.blue_ice : ID.packed_ice));
        }
      }
      // 頂上に薄い積雪
      this.setBlockForce(x, SEA + peakH + 1, z, ID.snow_layer);
    }

    /* ===== v0.13: 沈没船 (海底に沈んだ木造船 + 宝のチェスト) ===== */
    buildShipwreck(x, floorY, z, rnd) {
      const len = 9 + ((rnd() * 4) | 0);   // 船体の長さ 9-12
      const wid = 5;
      const along = rnd() < 0.5;           // true: X軸方向, false: Z軸方向
      const tilt = (rnd() * 2) | 0;        // 0=直立 1=浅く傾く
      const hull = ID.planks, mast = ID.log, trim = ID.cobblestone;
      const y0 = floorY + 1;
      for (let i = 0; i < len; i++) {
        // 船体の断面: 中央が深く、端が浅いV字底
        const t = Math.abs(i - (len - 1) / 2) / ((len - 1) / 2);   // 0中央..1端
        const halfW = Math.max(1, Math.round((wid / 2) * (1 - t * t * 0.7)));
        const depth = Math.max(1, 3 - Math.round(t * 2));
        for (let w = -halfW; w <= halfW; w++) {
          for (let dy = 0; dy <= depth + 1; dy++) {
            const wall = Math.abs(w) === halfW || dy === 0;
            const isRibTop = dy === depth + 1;
            // 舷側・底のみ (内部は空洞)。上面縁は飾りの丸石
            if (!wall && !isRibTop) continue;
            if (isRibTop && Math.abs(w) < halfW) continue;
            const yy = y0 + dy - (tilt && w > 0 ? 1 : 0);
            if (yy <= floorY) continue;
            const bx2 = along ? x + i - (len >> 1) : x + w;
            const bz2 = along ? z + w : z + i - (len >> 1);
            const id = isRibTop ? trim : (dy === 0 ? mast : hull);
            this.setBlockForce(bx2, yy, bz2, id);
          }
          // 船体内部を空気に (地形に埋もれないよう)
          for (let dy = 1; dy <= depth; dy++) {
            if (Math.abs(w) >= halfW) continue;
            const bx2 = along ? x + i - (len >> 1) : x + w;
            const bz2 = along ? z + w : z + i - (len >> 1);
            this.setBlockForce(bx2, y0 + dy, bz2, 0);
          }
        }
      }
      // マスト (折れかけの短い帆柱)
      const mastH = 4 + ((rnd() * 3) | 0);
      for (let i = 0; i < mastH; i++) this.setBlockForce(x, y0 + 2 + i, z, mast);
      // 宝のチェスト (船内中央)
      const chestX = along ? x : x, chestZ = along ? z : z;
      this.setBlockForce(chestX, y0 + 1, chestZ, ID.chest);
      this.fillLootChest(chestX, y0 + 1, chestZ, rnd, 'temple');
    }

    /* ===== v0.13: 海底神殿 (プリズマリンの神殿 + 金縁の黒曜石の核) ===== */
    buildOceanMonument(x, floorY, z, rnd) {
      const y0 = floorY + 1;
      const s = 13;   // 13x13 の基壇
      const wall = ID.prismarine, dark = ID.dark_prismarine, lamp = ID.sea_lantern;
      const cx0 = x - (s >> 1), cz0 = z - (s >> 1);
      // 基壇 (床)
      for (let dx = 0; dx < s; dx++) for (let dz = 0; dz < s; dz++)
        this.setBlockForce(cx0 + dx, y0, cz0 + dz, (dx + dz) % 3 === 0 ? dark : wall);
      // 外壁 (高さ5、所々にシーランタンを埋め込む)
      for (let dy = 1; dy <= 5; dy++) {
        for (let dx = 0; dx < s; dx++) for (let dz = 0; dz < s; dz++) {
          const edge = dx === 0 || dz === 0 || dx === s - 1 || dz === s - 1;
          if (!edge) continue;
          // 四隅の柱はダークプリズマリンで高く
          const corner = (dx === 0 || dx === s - 1) && (dz === 0 || dz === s - 1);
          const id = corner ? dark : (dy === 3 && (dx + dz) % 4 === 0 ? lamp : wall);
          this.setBlockForce(cx0 + dx, y0 + dy, cz0 + dz, id);
        }
      }
      // 入口 (4面の中央を開ける)
      for (let dy = 1; dy <= 3; dy++) {
        this.setBlockForce(cx0 + (s >> 1), y0 + dy, cz0, 0);
        this.setBlockForce(cx0 + (s >> 1), y0 + dy, cz0 + s - 1, 0);
        this.setBlockForce(cx0, y0 + dy, cz0 + (s >> 1), 0);
        this.setBlockForce(cx0 + s - 1, y0 + dy, cz0 + (s >> 1), 0);
      }
      // 内部を空洞に
      for (let dx = 1; dx < s - 1; dx++) for (let dz = 1; dz < s - 1; dz++)
        for (let dy = 1; dy <= 5; dy++) this.setBlockForce(cx0 + dx, y0 + dy, cz0 + dz, 0);
      // 尖塔屋根 (段々に窄む)
      for (let r = 0; r < 4; r++) {
        const yy = y0 + 6 + r;
        const in0 = r, in1 = s - 1 - r;
        for (let dx = in0; dx <= in1; dx++) for (let dz = in0; dz <= in1; dz++)
          this.setBlockForce(cx0 + dx, yy, cz0 + dz, r === 3 ? dark : wall);
      }
      // 頂上にシーランタン
      this.setBlockForce(x, y0 + 10, z, lamp);
      // 中央に金縁の黒曜石の核 + 宝のチェスト
      this.setBlockForce(x, y0 + 1, z, ID.gold_trimmed_obsidian);
      this.setBlockForce(x + 2, y0 + 1, z, ID.chest);
      this.fillLootChest(x + 2, y0 + 1, z, rnd, 'temple');
      // 内部照明
      this.setBlockForce(x - 3, y0 + 1, z - 3, lamp);
      this.setBlockForce(x + 3, y0 + 1, z + 3, lamp);
    }

    /* ===== v0.13: 水中遺跡 (苔むした石レンガの廃墟) ===== */
    buildUnderwaterRuins(x, floorY, z, rnd) {
      const y0 = floorY + 1;
      const w = 7 + ((rnd() * 4) | 0), d = 7 + ((rnd() * 4) | 0);
      const brick = () => rnd() < 0.55 ? ID.mossy_stone_bricks : ID.stone_bricks;
      // 床 (欠けた石レンガ)
      for (let dx = 0; dx < w; dx++) for (let dz = 0; dz < d; dz++) {
        if (rnd() < 0.85) this.setBlockForce(x + dx - (w >> 1), y0, z + dz - (d >> 1), brick());
      }
      // 壁の残骸 (所々崩れた高さ1-4の壁)
      for (let dx = 0; dx < w; dx++) for (let dz = 0; dz < d; dz++) {
        const edge = dx === 0 || dz === 0 || dx === w - 1 || dz === d - 1;
        if (!edge || rnd() < 0.35) continue;   // 35% は崩れて無い
        const hh = 1 + ((rnd() * 4) | 0);
        for (let dy = 1; dy <= hh; dy++)
          this.setBlockForce(x + dx - (w >> 1), y0 + dy, z + dz - (d >> 1), brick());
      }
      // 柱 (2-4本、高さまちまち)
      const pillars = 2 + ((rnd() * 3) | 0);
      for (let i = 0; i < pillars; i++) {
        const px = x + ((rnd() * w) | 0) - (w >> 1), pz = z + ((rnd() * d) | 0) - (d >> 1);
        const hh = 2 + ((rnd() * 3) | 0);
        for (let dy = 1; dy <= hh; dy++) this.setBlockForce(px, y0 + dy, pz, dy === hh ? ID.chiseled_stone_bricks : brick());
      }
      // 宝のチェスト (埋もれた遺跡のお宝)
      if (rnd() < 0.8) {
        this.setBlockForce(x, y0 + 1, z, ID.chest);
        this.fillLootChest(x, y0 + 1, z, rnd, 'dungeon');
      }
    }

    /* 村: 数軒の家 + 井戸 + 畑 + 砂利道 + 松明 + 村人 (v0.8: 道と村人を追加) */
    buildVillage(x, z, rnd) {
      const houses = 3 + ((rnd() * 3) | 0);
      const placed = [];
      // v0.10.3 S5: 井戸を本格的な構造物に (旧版は 3×3 を掘って水を入れただけの穴)
      this.buildWell(x, z);
      // 家を並べる
      for (let i = 0; i < houses; i++) {
        const hx = x + ((rnd() * 25) | 0) - 12, hz = z + ((rnd() * 25) | 0) - 12;
        if (Math.abs(hx - x) < 3 && Math.abs(hz - z) < 3) continue;
        let okSpace = true;
        for (const p of placed) if (Math.abs(p[0] - hx) < 7 && Math.abs(p[1] - hz) < 7) { okSpace = false; break; }
        if (!okSpace) continue;
        placed.push([hx, hz]);
        this.buildHouse(hx, hz, rnd);
      }
      // 畑
      let farmPos = null;
      if (rnd() < 0.7) {
        farmPos = [x + ((rnd() * 15) | 0) - 7, z + ((rnd() * 15) | 0) - 7];
        this.buildFarm(farmPos[0], farmPos[1], rnd);
      }
      // v0.8: 井戸から各家・畑へ砂利道を引く (幅2)
      const pathTargets = placed.map(p => [p[0] + 2, p[1] + 2]);
      if (farmPos) pathTargets.push(farmPos);
      for (const t of pathTargets) this.buildPath(x, z, t[0], t[1]);
      // 松明で照らす
      for (let i = 0; i < 4; i++) {
        const tx2 = x + ((rnd() * 17) | 0) - 8, tz2 = z + ((rnd() * 17) | 0) - 8;
        const th = this.getHeight(tx2, tz2);
        if (this.getBlock(tx2, th + 1, tz2) === 0) this.setBlockGen(tx2, th + 1, tz2, ID.torch);
      }
      // v0.8: 村人をスポーン (家の数だけ。ワールド生成イベントとして記録)
      const villagerCount = Math.max(2, placed.length);
      this.pendingSpawns = this.pendingSpawns || [];
      for (let i = 0; i < villagerCount; i++) {
        const p = placed.length ? placed[i % placed.length] : [x, z];
        const vx = p[0] + 2 + ((rnd() * 3) | 0) - 1, vz = p[1] + 2 + ((rnd() * 3) | 0) - 1;
        this.pendingSpawns.push({ type: 'villager', x: vx + 0.5, z: vz + 0.5 });
      }
    }

    /**
     * v0.10.3 S5: 村の中心の井戸。
     * 旧版は「地面に 3×3 の穴を掘って水を流し込む」だけで、
     * 地面に開いた不自然な水溜りだった。Minecraft の村の井戸らしく、
     * 丸石の縁取り + 深い井戸穴 + 4本の柱 + 屋根を作る。
     */
    buildWell(x, z) {
      const base = this.flattenArea(x - 2, z - 2, 5, 5);
      // 井戸穴: 中央 2×2 を y-4 まで掘って水を張る
      for (let dx = -1; dx <= 0; dx++) for (let dz = -1; dz <= 0; dz++) {
        const wx = x + dx, wz = z + dz;
        for (let y = base; y >= base - 4; y--) this.setBlockForce(wx, y, wz, ID.water);
        this.fluidLevel.set(this.fluidKey(wx, base - 4, wz), 0);
      }
      // 縁取り (5×5 の外周を丸石で囲む。水の段は空けておく)
      for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) {
        const edge = Math.abs(dx) === 2 || Math.abs(dz) === 2;
        if (!edge) continue;
        this.setBlockForce(x + dx, base, z + dz, ID.cobblestone);
      }
      // 4隅の柱 (高さ3)
      for (const [px, pz] of [[-2, -2], [2, -2], [-2, 2], [2, 2]]) {
        for (let dy = 1; dy <= 3; dy++) this.setBlockForce(x + px, base + dy, z + pz, ID.cobblestone);
      }
      // 屋根 (5×5 の木の板。縁は階段ブロックで軒を表現)
      for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) {
        const eave = Math.abs(dx) === 2 || Math.abs(dz) === 2;
        this.setBlockForce(x + dx, base + 4, z + dz, eave ? ID.planks_stairs : ID.planks);
      }
      // 屋根の下に松明 (夜でも井戸が見えるように)
      this.setBlockForce(x + 1, base + 3, z + 1, ID.torch);
    }

    /* v0.8: 2点間に砂利道を敷く (L字の幅2。上に乗る邪魔なブロックは除去) */
    buildPath(x0, z0, x1, z1) {
      const lay = (px, pz) => {
        const h = this.getHeight(px, pz);
        const top = this.getBlock(px, h, pz);
        // 自然の地表ブロックのみ道にする (建物・水・作物は避ける)
        const natural = top === ID.grass || top === ID.dirt || top === ID.sand ||
                        top === ID.snow_block || top === ID.tall_grass;
        if (!natural) return;
        this.setBlockForce(px, h, pz, ID.gravel);
        const above = this.getBlock(px, h + 1, pz);
        if (above === ID.tall_grass || above === ID.sugarcane) this.setBlockForce(px, h + 1, pz, 0);
      };
      const steps = Math.max(Math.abs(x1 - x0), Math.abs(z1 - z0));
      if (steps === 0) return;
      // L字: まずX方向、次にZ方向
      const sx = Math.sign(x1 - x0), sz = Math.sign(z1 - z0);
      let cx = x0, cz = z0;
      while (cx !== x1) { lay(cx, cz); lay(cx, cz + 1); cx += sx; }
      while (cz !== z1) { lay(cx, cz); lay(cx + 1, cz); cz += sz; }
      lay(x1, z1); lay(x1, z1 + 1);
    }

    /**
     * v0.10.2 #6: 構造物用の整地。敷地範囲を中央値の高さに揃え、
     * 低い所は土で埋めて土台を作り、高い所は削る。
     * 傾斜地で建物が浮いたり崖にめり込んだりするのを防ぐ。
     * 戻り値: 整地後の基準高さ
     */
    flattenArea(x, z, w, d) {
      const hs = [];
      for (let dx = 0; dx < w; dx++) for (let dz = 0; dz < d; dz++)
        hs.push(this.getHeight(x + dx, z + dz));
      hs.sort((a, b) => a - b);
      const base = hs[Math.floor(hs.length / 2)];   // 中央値
      for (let dx = 0; dx < w; dx++) for (let dz = 0; dz < d; dz++) {
        const wx = x + dx, wz = z + dz;
        const hh = this.getHeight(wx, wz);
        if (hh < base) {
          // 低い: 土台を積む (土で埋め、表面を草に)
          for (let y = hh + 1; y < base; y++) this.setBlockForce(wx, y, wz, ID.dirt);
          const surf = this.getBlock(wx, hh, wz);
          if (surf === ID.sand) this.setBlockForce(wx, base, wz, ID.grass);
        } else if (hh > base) {
          // 高い: 削る
          for (let y = base + 1; y <= hh + 1; y++) {
            const bid = this.getBlock(wx, y, wz);
            if (bid !== 0 && bid !== ID.water && bid !== ID.lava) this.setBlockForce(wx, y, wz, 0);
          }
        }
      }
      return base;
    }

    /* 家: 小さな木造の家 (床・壁・屋根・ドア・窓) */
    buildHouse(x, z, rnd) {
      const w = 5 + ((rnd() * 2) | 0), d = 5 + ((rnd() * 2) | 0);
      // v0.10.2 #6: 敷地を中央値の高さに整地し、土台を作ってから建てる
      const base = this.flattenArea(x, z, w, d);
      const wood = rnd() < 0.5 ? ID.planks : ID.cobblestone;
      const doorSide = (rnd() * 4) | 0;
      for (let dx = 0; dx < w; dx++) for (let dz = 0; dz < d; dz++) {
        // 床
        this.setBlockForce(x + dx, base, z + dz, wood);
        // 壁 (高さ3)
        const edge = dx === 0 || dz === 0 || dx === w - 1 || dz === d - 1;
        if (edge) {
          for (let dy = 1; dy <= 3; dy++) {
            // ドア開口 (底2段)
            if (dy <= 2) {
              if (doorSide === 0 && dz === 0 && dx === (w >> 1)) { this.setBlockForce(x + dx, base + dy, z + dz, 0); continue; }
              if (doorSide === 1 && dz === d - 1 && dx === (w >> 1)) { this.setBlockForce(x + dx, base + dy, z + dz, 0); continue; }
              if (doorSide === 2 && dx === 0 && dz === (d >> 1)) { this.setBlockForce(x + dx, base + dy, z + dz, 0); continue; }
              if (doorSide === 3 && dx === w - 1 && dz === (d >> 1)) { this.setBlockForce(x + dx, base + dy, z + dz, 0); continue; }
            }
            // 窓 (中段・ガラス)
            if (dy === 2 && ((dx === 0 || dx === w - 1) && (dz === 1 || dz === d - 2) ||
                (dz === 0 || dz === d - 1) && (dx === 1 || dx === w - 2)) && rnd() < 0.5) {
              this.setBlockForce(x + dx, base + dy, z + dz, ID.glass);
              continue;
            }
            this.setBlockForce(x + dx, base + dy, z + dz, wood);
          }
        } else {
          // 内部の空間は空にする (地形に埋もれないよう。屋根裏の高さまで)
          for (let dy = 1; dy <= 4 + Math.ceil((w + 2) / 2); dy++) this.setBlockForce(x + dx, base + dy, z + dz, 0);
        }
      }
      // v0.8: 屋根は木の階段ブロックを使った切妻屋根 (両端から段々にせり上がる)
      const roofLayers = Math.ceil((w + 2) / 2);
      for (let r = 0; r < roofLayers; r++) {
        const ry = base + 4 + r;
        const xIn0 = -1 + r, xIn1 = w - r;   // 内側にせり出す範囲
        for (let dx = xIn0; dx <= xIn1; dx++) {
          for (let dz = -1; dz <= d; dz++) {
            const edge = dx === xIn0 || dx === xIn1;
            // 縁は階段ブロック、中は板材
            this.setBlockForce(x + dx, ry, z + dz, edge ? ID.planks_stairs : ID.planks);
          }
        }
      }
      // ドアを設置
      let doorX = x, doorZ = z;
      if (doorSide === 0) { doorX = x + (w >> 1); doorZ = z; }
      else if (doorSide === 1) { doorX = x + (w >> 1); doorZ = z + d - 1; }
      else if (doorSide === 2) { doorX = x; doorZ = z + (d >> 1); }
      else { doorX = x + w - 1; doorZ = z + (d >> 1); }
      this.setBlockForce(doorX, base + 1, doorZ, ID.door_oak);
      // 中に松明とチェスト (v0.10.3 S2: 中身入り)
      // v0.10.4 B7: 旧実装は松明を「天井 (base+3)」に置いていた。
      // 床 (base) の建材が不透過でないと高さマップが床より下に落ち、
      // 家の内部が「空が見える」扱いで真っ明るくなり、松明の意味がなかった。
      // 松明は床の1マス上 (base+1) に置き、夜の家の中がちゃんと明るいようにする。
      this.setBlockForce(x + (w >> 1), base + 1, z + (d >> 1), ID.torch);
      if (rnd() < 0.5) {
        this.setBlockForce(x + 1, base + 1, z + 1, ID.chest);
        this.fillLootChest(x + 1, base + 1, z + 1, rnd, 'house');
      }
      // v0.10.3 S4: 家の内装 (ベッド・作業台・かまど)。
      // 家が「殺風景な空き箱」だったので住んでいる感じを出す。
      // ベッドは出入口から遠い角に置く。
      const corners = [[1, 1], [w - 2, 1], [1, d - 2], [w - 2, d - 2]];
      const bedCorner = doorSide === 0 ? corners[2] : doorSide === 1 ? corners[1] : doorSide === 2 ? corners[3] : corners[0];
      if (rnd() < 0.75 && !(bedCorner[0] === 1 && bedCorner[1] === 1))   // チェストの角と重ならないように
        this.setBlockForce(x + bedCorner[0], base + 1, z + bedCorner[1], ID.bed);
      // 作業台 (65%) と かまど (50%) を別の角に置く
      const others = corners.filter(c => c !== bedCorner && !(c[0] === 1 && c[1] === 1));
      if (rnd() < 0.65 && others.length) {
        const c = others[(rnd() * others.length) | 0];
        this.setBlockForce(x + c[0], base + 1, z + c[1], ID.crafting_table);
      }
      if (rnd() < 0.5 && others.length > 1) {
        const c = others[(rnd() * others.length) | 0];
        this.setBlockForce(x + c[0], base + 1, z + c[1], ID.furnace);
      }
    }

    /* 畑: 耕地 + 水 + 作物 (v0.10.4 B10: 周囲に柵を立てて囲う) */
    buildFarm(x, z, rnd) {
      for (let dx = 0; dx < 5; dx++) for (let dz = 0; dz < 5; dz++) {
        const wx = x + dx, wz = z + dz;
        const hh = this.getHeight(wx, wz);
        if (dx === 2 && dz === 2) {
          this.setBlockForce(wx, hh, wz, ID.water);
          this.fluidLevel.set(this.fluidKey(wx, hh, wz), 0);
        } else {
          this.setBlockForce(wx, hh, wz, ID.farmland);
          this.setBlockForce(wx, hh + 1, wz, 0);
          if (rnd() < 0.7) {
            this.setBlockForce(wx, hh + 1, wz, ID.wheat_crop_1 + ((rnd() * 3) | 0));
          }
        }
      }
      // v0.10.4 B10: 畑の外周に柵を立てる。
      // ただの裸の耕地だったのを、村人が管理する畑らしく囲う。
      for (let dx = -1; dx <= 5; dx++) for (let dz = -1; dz <= 5; dz++) {
        const edge = dx === -1 || dz === -1 || dx === 5 || dz === 5;
        if (!edge) continue;
        const wx = x + dx, wz = z + dz;
        const hh = this.getHeight(wx, wz);
        if (hh < 0) continue;
        if (this.getBlock(wx, hh + 1, wz) === 0) this.setBlockForce(wx, hh + 1, wz, ID.fence);
      }
    }

    /* 寺院: 砂漠は砂岩風(砂)、ジャングルは石の遺跡 */
    buildTemple(x, z, rnd, biome) {
      // v0.10.2 #6: 7x7 の基壇範囲を整地してから建てる
      const y0 = this.flattenArea(x, z, 7, 7);
      const wall = biome === 'desert' ? ID.sand : (rnd() < 0.5 ? ID.cobblestone : ID.mossy_cobblestone);
      const s = 7;
      // 基壇
      for (let dx = 0; dx < s; dx++) for (let dz = 0; dz < s; dz++)
        for (let dy = 0; dy <= 1; dy++) this.setBlockForce(x + dx, y0 + dy, z + dz, wall);
      // 内部を掘り抜く
      for (let dx = 1; dx < s - 1; dx++) for (let dz = 1; dz < s - 1; dz++)
        for (let dy = 2; dy <= 5; dy++) this.setBlockForce(x + dx, y0 + dy, z + dz, 0);
      // 柱
      for (const [px, pz] of [[0, 0], [s - 1, 0], [0, s - 1], [s - 1, s - 1]]) {
        for (let dy = 2; dy <= 5; dy++) this.setBlockForce(x + px, y0 + dy, z + pz, wall);
      }
      // 屋根
      for (let dx = 0; dx < s; dx++) for (let dz = 0; dz < s; dz++)
        this.setBlockForce(x + dx, y0 + 6, z + dz, wall);
      // 内部に宝のチェスト + 松明 (v0.10.3 S2: 寺院専用のお宝テーブル)
      this.setBlockForce(x + (s >> 1), y0 + 2, z + (s >> 1), ID.chest);
      this.fillLootChest(x + (s >> 1), y0 + 2, z + (s >> 1), rnd, 'temple');
      this.setBlockForce(x + 1, y0 + 3, z + 1, ID.torch);
      this.setBlockForce(x + s - 2, y0 + 3, z + s - 2, ID.torch);
    }

    /* ダンジョン: 地下の小部屋 (丸石) + チェスト + 中央に「スポナー風」マグマ */
    buildDungeon(x, y, z, rnd) {
      const w = 7, hgt = 4, d = 7;
      // 空洞を掘る
      for (let dx = 0; dx < w; dx++) for (let dz = 0; dz < d; dz++)
        for (let dy = 0; dy < hgt; dy++) this.setBlockForce(x + dx - 3, y + dy, z + dz - 3, 0);
      // 壁・床・天井を丸石 (一部苔むし)
      for (let dx = -1; dx <= w; dx++) for (let dz = -1; dz <= d; dz++) {
        const edge = dx < 0 || dz < 0 || dx >= w || dz >= d;
        for (let dy = -1; dy <= hgt; dy++) {
          const shell = edge || dy < 0 || dy >= hgt;
          if (!shell) continue;
          const id = rnd() < 0.4 ? ID.mossy_cobblestone : ID.cobblestone;
          this.setBlockForce(x + dx - 3, y + dy, z + dz - 3, id);
        }
      }
      // 中央にスポナー風ブロック (マグマ) とチェスト2つ (v0.10.3 S2: ダンジョン専用ルート)
      this.setBlockForce(x, y, z, ID.magma);
      this.setBlockForce(x - 2, y, z, ID.chest);
      this.fillLootChest(x - 2, y, z, rnd, 'dungeon');
      this.setBlockForce(x + 2, y, z, ID.chest);
      this.fillLootChest(x + 2, y, z, rnd, 'dungeon');
      this.setBlockForce(x, y + hgt - 1, z, ID.torch);
      // v0.10.4 B9: ダンジョンの四隅に丸石の柱を立てる。
      // ただの立方体の部屋だったのを、遺跡らしい構造にする。
      for (const [px, pz] of [[-2, -2], [2, -2], [-2, 2], [2, 2]]) {
        const pid = rnd() < 0.4 ? ID.mossy_cobblestone : ID.cobblestone;
        for (let dy = 0; dy < hgt - 1; dy++) this.setBlockForce(x + px, y + dy, z + pz, pid);
      }
      // v0.10.3 S6: ダンジョンの番人 (ゾンビ) をスポーン。
      // Minecraft のスポナーの代わりに、生成時に2〜3体配置する。
      this.pendingSpawns = this.pendingSpawns || [];
      const guards = 2 + ((rnd() * 2) | 0);
      for (let i = 0; i < guards; i++) {
        const gx = x - 2 + ((rnd() * 5) | 0), gz = z - 2 + ((rnd() * 5) | 0);
        this.pendingSpawns.push({ type: 'zombie', x: gx + 0.5, y: y + 1, z: gz + 0.5 });
      }
    }

    /**
     * v0.10.3 S2: チェストへのルート (お宝) 生成。
     * 構造物ごとのルートテーブルを定義し、重み付きで抽選してチェストに入れる。
     * 「チェストが全部空っぽ」だった問題を解消し、探索の報酬にする。
     */
    fillLootChest(x, y, z, rnd, tableName) {
      const bk = World.bkey(x, y, z);
      const table = World.LOOT_TABLES[tableName] || World.LOOT_TABLES.house;
      const rolls = table.rolls[0] + ((rnd() * (table.rolls[1] - table.rolls[0] + 1)) | 0);
      const totalW = table.entries.reduce((s, e) => s + e[1], 0);
      const used = new Set();
      const stacks = new Array(27).fill(null);
      for (let r = 0; r < rolls; r++) {
        let slot = (rnd() * 27) | 0;
        let guard = 0;
        while (used.has(slot) && guard++ < 20) slot = (rnd() * 27) | 0;
        if (used.has(slot)) continue;
        let pick = rnd() * totalW, entry = table.entries[0];
        for (const e of table.entries) { pick -= e[1]; if (pick <= 0) { entry = e; break; } }
        const count = entry[2] + ((rnd() * (entry[3] - entry[2] + 1)) | 0);
        stacks[slot] = { id: entry[0], count };
        used.add(slot);
      }
      // v0.10.4 B4: チェストのブロックがまだ置かれていない
      // (未生成チャンクに pending された) 場合、this.chests には登録されない。
      // そのまま捨てるとルートが永久に消えるため、グローバルの保留マップ
      // (pendingChestLoot) に残し、チャンク生成時にマージする。
      const cx = x >> 4, cz = z >> 4;
      const c = this.chunks.get(World.key(cx, cz));
      if (c && c.generated && this.getBlock(x, y, z) === ID.chest) {
        // 既にブロックがある → 直接マージ
        let arr = this.chests.get(bk);
        if (!arr) { arr = new Array(27).fill(null); this.chests.set(bk, arr); }
        for (let i = 0; i < 27; i++) if (stacks[i] && !arr[i]) arr[i] = stacks[i];
      } else {
        // 未生成 → 保留 (チャンク生成時にマージ)
        if (!this.pendingChestLoot) this.pendingChestLoot = new Map();
        if (!this.pendingChestLoot.has(bk)) this.pendingChestLoot.set(bk, stacks);
      }
    }

    /**
     * v0.10.3 S3: ダンジョンを近くの天然洞窟にトンネルで接続する。
     * Minecraft ではダンジョンは洞窟に面して生成されるため、
     * 洞窟探検中に偶然見つけることができる。このゲームでは完全に岩盤に
     * 埋まって孤立していたので、見つける術がなかった。
     * 手順: ダンジョン中心から4方向に探索し、最も近い「天然の空洞」
     * (空気の上下が石) を見つけて、そこまで高さ2のトンネルを掘る。
     */
    connectDungeonToCave(x, y, z, rnd) {
      // v0.10.4 B6: 旧実装は2つの深刻なバグがあった。
      //  (1) トンネルを best.ty (洞窟の高さ) で水平に掘っていたが、
      //      ダンジョン y と洞窟 ty は最大2ブロックずれるため、途中で床が抜ける。
      //  (2) トンネル起点を「中心から4マス」固定にしていたが、洞窟が5マス目に
      //      あると1マスしか掘らず、ほぼ接続できなかった。
      // 修正: ダンジョンの床高 y で掘り、目標の洞窟セルに着いたら縦に繋ぐ。
      //      またトンネルは「洞窟の1歩手前」まで掘って壁を残し、プレイヤーが
      //      最後の1マスを掘って「発見」する体験にする (Minecraft 同様)。
      const isCaveCell = (cx, cy, cz) => {
        if (this.getBlock(cx, cy, cz) !== 0) return false;
        const up = this.getBlock(cx, cy + 1, cz), dn = this.getBlock(cx, cy - 1, cz);
        return (up === ID.stone || up === ID.mossy_cobblestone || up === ID.cobblestone) &&
               (dn === ID.stone || dn === ID.mossy_cobblestone || dn === ID.cobblestone);
      };
      const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
      let best = null;
      for (const [dx, dz] of dirs) {
        for (let r = 4; r <= 14; r++) {
          const cx = x + dx * r, cz = z + dz * r;
          for (let cy = y - 1; cy <= y + 1; cy++) {
            if (isCaveCell(cx, cy, cz)) {
              if (!best || r < best.dist) best = { dist: r, dir: [dx, dz], tx: cx, ty: cy, tz: cz };
              break;
            }
          }
          if (best && best.dist === r) break;
        }
      }
      if (!best || best.dist < 4) return;   // 近くに洞窟なし → 孤立ダンジョンのまま (稀)
      const [dx, dz] = best.dir;
      // ダンジョンの壁の外側 (中心から4マス) から、洞窟の1歩手前まで掘る。
      // トンネルの高さはダンジョンの床 y に固定 (床が抜けないように)。
      const end = best.dist - 1;   // 洞窟セルの1歩手前で止める (発見体験のため壁を残す)
      for (let r = 4; r <= end; r++) {
        const cx = x + dx * r, cz = z + dz * r;
        for (let dy = 0; dy <= 1; dy++) this.setBlockForce(cx, y + dy, cz, 0);
        // トンネルの床が空洞なら丸石で補強 (落下防止)
        if (this.getBlock(cx, y - 1, cz) === 0) this.setBlockForce(cx, y - 1, cz, ID.cobblestone);
        // 側面の溶岩・水が流れ込まないよう、トンネル脇の流体は塞ぐ
        if (dx !== 0) {
          if (B.isLiquid(this.getBlock(cx, y, cz + 1))) this.setBlockForce(cx, y, cz + 1, ID.cobblestone);
          if (B.isLiquid(this.getBlock(cx, y, cz - 1))) this.setBlockForce(cx, y, cz - 1, ID.cobblestone);
        } else {
          if (B.isLiquid(this.getBlock(cx + 1, y, cz))) this.setBlockForce(cx + 1, y, cz, ID.cobblestone);
          if (B.isLiquid(this.getBlock(cx - 1, y, cz))) this.setBlockForce(cx - 1, y, cz, ID.cobblestone);
        }
      }
      // 目標の洞窟がダンジョンとYがずれている場合は、洞窟セル側で縦に繋ぐ。
      // (洞窟側は掘ってよい。トンネル側は壁を残す)
      if (best.ty !== y) {
        const lo = Math.min(y, best.ty), hi = Math.max(y + 1, best.ty);
        for (let cy = lo; cy <= hi; cy++) this.setBlockForce(best.tx, cy, best.tz, 0);
      }
    }

    /** 生成中の設置 (未生成チャンクは保留) */
    setBlockGen(x, y, z, id) {
      if (y < 0 || y >= WH) return;
      const cx = x >> 4, cz = z >> 4;
      const c = this.chunks.get(World.key(cx, cz));
      if (c && c.generated) {
        const lx = x & 15, lz = z & 15;
        const cur = c.blocks[idx(lx, y, lz)];
        if (cur === 0 || cur === ID.leaves || cur === ID.birch_leaves || cur === ID.water) {
          c.blocks[idx(lx, y, lz)] = id;
          c.dirty = true;
        }
      } else {
        const ck = World.key(cx, cz);
        let arr = this.pending.get(ck);
        if (!arr) { arr = []; this.pending.set(ck, arr); }
        arr.push({ x, y, z, id, force: false });
      }
    }

    /* v0.7: 構造物用の強制設置 (地形の固体ブロックも上書きする。岩盤は除く) */
    setBlockForce(x, y, z, id) {
      if (y < 0 || y >= WH) return;
      const cx = x >> 4, cz = z >> 4;
      const c = this.chunks.get(World.key(cx, cz));
      if (c && c.generated) {
        const lx = x & 15, lz = z & 15;
        if (c.blocks[idx(lx, y, lz)] === ID.bedrock) return;   // 岩盤は壊さない
        c.blocks[idx(lx, y, lz)] = id;
        // 高さマップ更新 (setBlock と同等。getHeight が最新の地表を返すようにする)
        const hIdx = lx + lz * CX;
        const def = B.get(id);
        if (def.opaque && y > c.height[hIdx]) c.height[hIdx] = y;
        else if (!def.opaque && y === c.height[hIdx]) {
          let ny = y - 1;
          while (ny > 0 && !B.get(c.blocks[idx(lx, ny, lz)]).opaque) ny--;
          c.height[hIdx] = ny;
        }
        c.dirty = true;
        if (id === ID.chest) {
          const bk = World.bkey(x, y, z);
          if (!this.chests.has(bk)) this.chests.set(bk, new Array(27).fill(null));
        }
      } else {
        const ck = World.key(cx, cz);
        let arr = this.pending.get(ck);
        if (!arr) { arr = []; this.pending.set(ck, arr); }
        arr.push({ x, y, z, id, force: true });
      }
    }

    /** 地表の高さを調べて落ち葉を置く */
    scatterLitter(x, z) {
      const c = this.chunks.get(World.key(x >> 4, z >> 4));
      if (!c || !c.generated) return;
      const lx = x & 15, lz = z & 15;
      let y = WH - 1;
      while (y > 0 && !B.get(c.blocks[idx(lx, y, lz)]).opaque) y--;
      const surf = c.blocks[idx(lx, y, lz)];
      if ((surf === ID.grass || surf === ID.dirt) && c.blocks[idx(lx, y + 1, lz)] === 0) {
        c.blocks[idx(lx, y + 1, lz)] = ID.leaf_litter;
        c.dirty = true;
      }
    }

    growTree(x, y, z, rnd, birch = false) {
      const h = birch ? 5 + ((rnd() * 2) | 0) : 4 + ((rnd() * 3) | 0);
      const logId = birch ? ID.birch_log : ID.log;
      const leafId = birch ? ID.birch_leaves : ID.leaves;
      for (let i = 0; i < h; i++) this.setBlockGen(x, y + i, z, logId);
      const top = y + h;
      for (let dy = -2; dy <= 1; dy++) {
        const r = dy <= -1 ? 2 : 1;
        for (let dx = -r; dx <= r; dx++) {
          for (let dz = -r; dz <= r; dz++) {
            if (dx === 0 && dz === 0 && dy < 1) continue;
            if (Math.abs(dx) === r && Math.abs(dz) === r && rnd() < 0.6) continue;
            this.setBlockGen(x + dx, top + dy, z + dz, leafId);
          }
        }
      }
    }

    /* v0.5: 樹種を指定して木を生やす */
    growTreeKind(x, y, z, rnd, kind) {
      if (kind === 'spruce') {
        // トウヒ: 高く細い針葉樹 (円錐形)
        const h = 6 + ((rnd() * 3) | 0);
        for (let i = 0; i < h; i++) this.setBlockGen(x, y + i, z, ID.spruce_log);
        for (let dy = 0; dy < h - 1; dy++) {
          const yy = y + 2 + dy;
          const r = Math.max(0, 2 - Math.floor(dy / 2));
          for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) {
            if (dx === 0 && dz === 0) continue;
            if (Math.abs(dx) === r && Math.abs(dz) === r && rnd() < 0.5) continue;
            this.setBlockGen(x + dx, yy, z + dz, ID.spruce_leaves);
          }
        }
        this.setBlockGen(x, y + h, z, ID.spruce_leaves);
        return;
      }
      if (kind === 'cherry') {
        // 桜: 普通の高さ・丸い樹冠 (ピンク)
        const h = 4 + ((rnd() * 2) | 0);
        for (let i = 0; i < h; i++) this.setBlockGen(x, y + i, z, ID.cherry_log);
        const top = y + h;
        for (let dy = -1; dy <= 1; dy++) {
          const r = dy === 0 ? 2 : 1;
          for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) {
            if (dx === 0 && dz === 0 && dy < 1) continue;
            this.setBlockGen(x + dx, top + dy, z + dz, ID.cherry_leaves);
          }
        }
        return;
      }
      if (kind === 'jungle') {
        // ジャングルの高木: 高い幹・上部に葉・幹に蔦
        const h = 7 + ((rnd() * 4) | 0);
        for (let i = 0; i < h; i++) this.setBlockGen(x, y + i, z, ID.log);
        const top = y + h;
        for (let dy = -2; dy <= 1; dy++) {
          const r = dy <= -1 ? 2 : 1;
          for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) {
            if (dx === 0 && dz === 0 && dy < 1) continue;
            if (Math.abs(dx) === r && Math.abs(dz) === r && rnd() < 0.6) continue;
            this.setBlockGen(x + dx, top + dy, z + dz, ID.leaves);
          }
        }
        // 幹に蔦
        for (let i = 2; i < h - 1; i++) {
          if (rnd() < 0.4) {
            const dx = rnd() < 0.5 ? 1 : -1, dz = rnd() < 0.5 ? 1 : -1;
            this.setBlockGen(x + (rnd() < 0.5 ? dx : 0), y + i, z + (rnd() < 0.5 ? dz : 0), ID.vine);
          }
        }
        return;
      }
      // デフォルトは従来のオーク/白樺
      this.growTree(x, y, z, rnd, kind === 'birch');
    }

    /* ---------- メッシュ生成 ---------- */
    buildMesh(c) {
      const pos = [], nor = [], uv = [], col = [];
      const wpos = [], wnor = [], wuv = [], wcol = [];
      const ox = c.cx << 4, oz = c.cz << 4;

      const opaqueAt = (x, y, z) => B.isOpaque(this.getBlock(x, y, z));

      // 高さマップを周囲1列分キャッシュ (getHeight の Map 参照を面ごとに行わない)
      const HPAD = 18;
      const hmap = new Int16Array(HPAD * HPAD);
      for (let hz = -1; hz <= CZ; hz++)
        for (let hx = -1; hx <= CX; hx++)
          hmap[(hx + 1) + (hz + 1) * HPAD] = this.getHeight(ox + hx, oz + hz);
      const heightAt = (lx, lz) => hmap[(lx + 1) + (lz + 1) * HPAD];

      for (let y = 0; y < WH; y++) {
        for (let lz = 0; lz < CZ; lz++) {
          for (let lx = 0; lx < CX; lx++) {
            const id = c.blocks[idx(lx, y, lz)];
            if (id === 0) continue;
            const def = B.get(id);
            const wx = ox + lx, wz = oz + lz;
            const isWater = def.liquid;
            const P = isWater ? wpos : pos, N = isWater ? wnor : nor;
            const U = isWater ? wuv : uv, C = isWater ? wcol : col;

            // 交差プレーン (作物・花など)
            if (def.model === 'cross') {
              const lit = (y + 1 > heightAt(lx, lz)) ? 1 : SHADOW;
              this.pushCross(P, N, U, C, lx, y, lz, def.tiles.top, lit);
              continue;
            }
            // 非立方体 (松明・ベッド・ハーフブロックなど)
            if (def.model === 'torch' || def.model === 'box' || def.model === 'slab' ||
                def.model === 'stairs' || def.model === 'fence' || def.model === 'ladder' ||
                def.model === 'door' || def.model === 'trapdoor' || def.model === 'sign') {
              const lit = (y + 1 > heightAt(lx, lz)) ? 1 : SHADOW;
              this.pushCustomModel(P, N, U, C, lx, y, lz, def, def.light ? 1 : lit, wx, wz);
              continue;
            }

            const waterTopLow = isWater && this.getBlock(wx, y + 1, wz) !== ID.water;

            for (let f = 0; f < 6; f++) {
              const face = FACES[f];
              const nx = wx + face.dir[0], ny = y + face.dir[1], nz = wz + face.dir[2];
              const nid = this.getBlock(nx, ny, nz);
              const ndef = B.get(nid);
              if (isWater) {
                if (nid === ID.water || ndef.opaque) continue;
              } else {
                if (ndef.opaque) continue;
                if (nid === id && !def.opaque && id !== ID.leaves) continue; // ガラス同士など
              }

              // 面テクスチャ
              let tile = def.tiles.side;
              if (face.dir[1] === 1) tile = def.tiles.top;
              else if (face.dir[1] === -1) tile = def.tiles.bottom;
              const [u0, v0, u1, v1] = Textures.uvRect(tile);

              // 空の明るさ
              const skyLit = (ny > heightAt(lx + face.dir[0], lz + face.dir[2])) ? 1 : SHADOW;
              const base = face.shade * skyLit;

              for (let i = 0; i < 4; i++) {
                const cpos = face.corners[i];
                let px = lx + cpos[0], py = y + cpos[1], pz = lz + cpos[2];
                if (waterTopLow && cpos[1] === 1) py = y + 0.88;
                P.push(px, py, pz);
                N.push(face.dir[0], face.dir[1], face.dir[2]);
                const fu = face.uvs[i][0], fv = face.uvs[i][1];
                U.push(u0 + fu * (u1 - u0), v0 + fv * (v1 - v0));

                // アンビエントオクルージョン (接線ベクトルで配列確保なしに計算)
                let ao = 1;
                if (!isWater) {
                  const du = cpos[face.ua] === 1 ? 1 : -1;
                  const dv = cpos[face.va] === 1 ? 1 : -1;
                  const uv = face.uVec, vv = face.vVec;
                  const u0x = uv[0] * du, u0y = uv[1] * du, u0z = uv[2] * du;
                  const v0x = vv[0] * dv, v0y = vv[1] * dv, v0z = vv[2] * dv;
                  const s1 = opaqueAt(nx + u0x, ny + u0y, nz + u0z) ? 1 : 0;
                  const s2 = opaqueAt(nx + v0x, ny + v0y, nz + v0z) ? 1 : 0;
                  const s3 = opaqueAt(nx + u0x + v0x, ny + u0y + v0y, nz + u0z + v0z) ? 1 : 0;
                  ao = AO_LEVEL[(s1 && s2) ? 0 : 3 - (s1 + s2 + s3)];
                }
                const b = base * ao;
                C.push(b, b, b);
              }
            }
          }
        }
      }

      // 三角形化 (4頂点 -> 6インデックス)
      const finish = (P, N, U, C, material) => {
        if (P.length === 0) return null;
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
        geo.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
        geo.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
        geo.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
        const quads = P.length / 12;
        const index = new (quads * 4 > 65535 ? Uint32Array : Uint16Array)(quads * 6);
        for (let q = 0; q < quads; q++) {
          const o = q * 4, i = q * 6;
          index[i] = o; index[i + 1] = o + 1; index[i + 2] = o + 2;
          index[i + 3] = o + 2; index[i + 4] = o + 1; index[i + 5] = o + 3;
        }
        geo.setIndex(new THREE.BufferAttribute(index, 1));
        geo.computeBoundingSphere();
        const mesh = new THREE.Mesh(geo, material);
        mesh.position.set(ox, 0, oz);
        mesh.frustumCulled = true;
        return mesh;
      };

      if (c.mesh) { this.group.remove(c.mesh); c.mesh.geometry.dispose(); c.mesh = null; }
      if (c.water) { this.group.remove(c.water); c.water.geometry.dispose(); c.water = null; }

      c.mesh = finish(pos, nor, uv, col, this.solidMaterial);
      if (c.mesh) this.group.add(c.mesh);
      c.water = finish(wpos, wnor, wuv, wcol, this.waterMaterial);
      if (c.water) this.group.add(c.water);
      c.dirty = false;
    }

    /** 交差プレーン (作物: 両面描画) */
    pushCross(P, N, U, C, lx, y, lz, tile, bright) {
      const [u0, v0, u1, v1] = Textures.uvRect(tile);
      for (const plane of B.CROSS_PLANES) {
        const zs = plane.z !== undefined ? [plane.z, plane.z] : [plane.z0, plane.z1];
        const xs = plane.z !== undefined ? [plane.x0, plane.x1] : [plane.x, plane.x];
        for (let side = 0; side < 2; side++) {
          // 頂点順: [x0,y0,z0] [x1,y0,z1] [x0,y1,z0] [x1,y1,z1]
          const quad = [
            [xs[0], 0, zs[0]], [xs[1], 0, zs[1]],
            [xs[0], 0.9, zs[0]], [xs[1], 0.9, zs[1]]
          ];
          const order = side === 0 ? [0, 1, 2, 3] : [1, 0, 3, 2];
          for (const i of order) {
            const c = quad[i];
            P.push(lx + c[0], y + c[1], lz + c[2]);
            const nx = plane.z !== undefined ? 0 : (side ? -1 : 1);
            const nz = plane.z !== undefined ? (side ? -1 : 1) : 0;
            N.push(nx, 0, nz);
            const fu = (i === 1 || i === 3) ? 1 : 0, fv = c[1] > 0 ? 1 : 0;
            U.push(u0 + fu * (u1 - u0), v0 + fv * (v1 - v0));
            C.push(bright, bright, bright);
          }
        }
      }
    }

    /** 任意サイズのボックス (松明用) */
    pushBox(P, N, U, C, lx, y, lz, box, def, bright) {
      const b = box || { x0: 0, x1: 1, y0: 0, y1: 1, z0: 0, z1: 1 };
      for (let f = 0; f < 6; f++) {
        const face = FACES[f];
        const tile = face.dir[1] === 1 ? def.tiles.top : (face.dir[1] === -1 ? def.tiles.bottom : def.tiles.side);
        const [u0, v0, u1, v1] = Textures.uvRect(tile);
        const shade = bright * face.shade;
        for (let i = 0; i < 4; i++) {
          const cp = face.corners[i];
          const px = lx + (cp[0] ? b.x1 : b.x0);
          const py = y + (cp[1] ? b.y1 : b.y0);
          const pz = lz + (cp[2] ? b.z1 : b.z0);
          P.push(px, py, pz);
          N.push(face.dir[0], face.dir[1], face.dir[2]);
          const fu = face.uvs[i][0], fv = face.uvs[i][1];
          U.push(u0 + fu * (u1 - u0), v0 + fv * (v1 - v0));
          C.push(shade, shade, shade);
        }
      }
    }

    /** 複数ボックスのモデル (階段・柵など) */
    pushCustomModel(P, N, U, C, lx, y, lz, def, bright, wx, wz) {
      let boxes = def.modelBoxes || [def.box];
      // ドア / トラップドアの開状態: 開いているときは90°回転させた姿で描画
      if ((def.model === 'door' || def.model === 'trapdoor') && wx !== undefined) {
        const open = this.doorState.get(World.bkey(wx, y, wz));
        if (open) boxes = boxes.map(b => this.rotateBox(b));
      }
      for (const b of boxes) {
        if (!b) continue;
        this.pushBox(P, N, U, C, lx, y, lz, b, def, bright);
      }
    }

    /** ブロック中心まわりに水平90°回転したボックス */
    rotateBox(b) {
      return {
        x0: b.z0, x1: b.z1, y0: b.y0, y1: b.y1,
        z0: 1 - b.x1, z1: 1 - b.x0
      };
    }

    /* ---------- チャンクのロード / アンロード ---------- */
    update(px, pz, maxWork = 2) {
      const pcx = Math.floor(px / CX), pcz = Math.floor(pz / CZ);
      const R = this.renderDistance;
      let work = 0;

      // 生成候補を近い順に
      const need = [];
      for (let dz = -R; dz <= R; dz++) {
        for (let dx = -R; dx <= R; dx++) {
          const d2 = dx * dx + dz * dz;
          if (d2 > (R + 0.5) * (R + 0.5)) continue;
          need.push({ cx: pcx + dx, cz: pcz + dz, d2 });
        }
      }
      need.sort((a, b) => a.d2 - b.d2);

      for (const n of need) {
        if (work >= maxWork) break;
        if (!this.chunks.has(World.key(n.cx, n.cz))) {
          this.generateChunk(n.cx, n.cz);
          work++;
        }
      }

      // メッシュ更新 (周囲4チャンクが生成済みのもののみ)
      for (const n of need) {
        if (work >= maxWork + 1) break;
        const c = this.chunks.get(World.key(n.cx, n.cz));
        if (!c || !c.dirty) continue;
        if (!this.getChunk(n.cx - 1, n.cz) || !this.getChunk(n.cx + 1, n.cz) ||
            !this.getChunk(n.cx, n.cz - 1) || !this.getChunk(n.cx, n.cz + 1)) continue;
        this.buildMesh(c);
        work++;
      }

      // 遠いチャンクを破棄
      const limit = R + 2;
      for (const [k, c] of this.chunks) {
        if (Math.abs(c.cx - pcx) > limit || Math.abs(c.cz - pcz) > limit) {
          if (c.mesh) { this.group.remove(c.mesh); c.mesh.geometry.dispose(); }
          if (c.water) { this.group.remove(c.water); c.water.geometry.dispose(); }
          this.chunks.delete(k);
          if (this._lastChunk === c) this._lastChunk = null;
        }
      }
      return work;
    }

    /** プレイヤー周辺のチャンクが揃っているか */
    ready(px, pz) {
      const pcx = Math.floor(px / CX), pcz = Math.floor(pz / CZ);
      for (let dz = -1; dz <= 1; dz++)
        for (let dx = -1; dx <= 1; dx++)
          if (!this.getChunk(pcx + dx, pcz + dz)) return false;
      return true;
    }

    /* ---------- レイキャスト ---------- */
    raycast(origin, dir, maxDist = 5, hitLiquid = false) {
      let x = Math.floor(origin.x), y = Math.floor(origin.y), z = Math.floor(origin.z);
      const sx = Math.sign(dir.x), sy = Math.sign(dir.y), sz = Math.sign(dir.z);
      const tdx = sx !== 0 ? Math.abs(1 / dir.x) : Infinity;
      const tdy = sy !== 0 ? Math.abs(1 / dir.y) : Infinity;
      const tdz = sz !== 0 ? Math.abs(1 / dir.z) : Infinity;
      let tmx = sx > 0 ? (x + 1 - origin.x) / dir.x : (sx < 0 ? (x - origin.x) / dir.x : Infinity);
      let tmy = sy > 0 ? (y + 1 - origin.y) / dir.y : (sy < 0 ? (y - origin.y) / dir.y : Infinity);
      let tmz = sz > 0 ? (z + 1 - origin.z) / dir.z : (sz < 0 ? (z - origin.z) / dir.z : Infinity);
      let nx = 0, ny = 0, nz = 0, t = 0;

      for (let i = 0; i < 256; i++) {
        const id = this.getBlock(x, y, z);
        if (id !== 0 && (hitLiquid ? true : !B.isLiquid(id))) {
          return { x, y, z, nx, ny, nz, id, dist: t };
        }
        if (tmx < tmy && tmx < tmz) { x += sx; t = tmx; tmx += tdx; nx = -sx; ny = 0; nz = 0; }
        else if (tmy < tmz) { y += sy; t = tmy; tmy += tdy; nx = 0; ny = -sy; nz = 0; }
        else { z += sz; t = tmz; tmz += tdz; nx = 0; ny = 0; nz = -sz; }
        if (t > maxDist) break;
      }
      return null;
    }

    /* ==========================================================
       v0.4 流体シミュレーション (水・溶岩)
       - fluidLevel: "x,y,z" -> 0(源) 1..3(流れ)
       - setBlock で流体が設置/除去されると scheduleFluid で周囲を更新
       - tickFluids をゲームループから毎フレーム呼ぶ
       ========================================================== */

    fluidKey(x, y, z) { return x + ',' + y + ',' + z; }

    isFluidBlock(id) { return id === ID.water || id === ID.lava; }

    /** 流体の源かどうか (水位0) */
    isFluidSource(x, y, z) {
      const id = this.getBlock(x, y, z);
      if (!this.isFluidBlock(id)) return false;
      return (this.fluidLevel.get(this.fluidKey(x, y, z)) || 0) === 0;
    }

    /** 指定位置の流体レベル (無ければ -1) */
    fluidLevelAt(x, y, z) {
      const id = this.getBlock(x, y, z);
      if (!this.isFluidBlock(id)) return -1;
      return this.fluidLevel.get(this.fluidKey(x, y, z)) || 0;
    }

    /** 流体セルを更新キューに積む */
    scheduleFluid(x, y, z) {
      const id = this.getBlock(x, y, z);
      if (!this.isFluidBlock(id)) return;
      const k = this.fluidKey(x, y, z);
      if (this.fluidQueued.has(k)) return;
      this.fluidQueued.add(k);
      // 溶岩は水の4倍ゆっくり流れる
      const delay = id === ID.lava ? 1.2 : 0.3;
      this.fluidQueue.push({ x, y, z, t: this.fluidTime + delay });
    }

    /**
     * 1セルの流体を評価して拡散する。変化した隣接セルも再スケジュールする。
     * 戻り値: 何か変化したら true
     */
    evalFluid(x, y, z) {
      const id = this.getBlock(x, y, z);
      if (!this.isFluidBlock(id)) return false;
      const level = this.fluidLevel.get(this.fluidKey(x, y, z)) || 0;
      let changed = false;

      // v0.4.1: 流れ (レベル>0) の存続判定。
      // 上に同種の流体があるか、レベルの浅い隣接流体があるか。無ければ消える。
      if (level > 0) {
        let fed = false;
        const upId = this.getBlock(x, y + 1, z);
        if (upId === id) fed = true;   // 上から落ちてくる
        if (!fed) {
          const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
          for (const [dx, dz] of dirs) {
            const nid = this.getBlock(x + dx, y, z + dz);
            if (nid === id && (this.fluidLevel.get(this.fluidKey(x + dx, y, z + dz)) || 0) < level) { fed = true; break; }
          }
        }
        if (!fed) {
          // 供給元がないので消える
          this.setBlock(x, y, z, 0);
          this.fluidLevel.delete(this.fluidKey(x, y, z));
          return true;
        }
      }

      // --- 下へ流れる (源でも流れでも無条件で下へ。下はレベル0=擬似源) ---
      const belowId = this.getBlock(x, y - 1, z);
      if (y > 0 && (belowId === 0 || (B.isLiquid(belowId) === false && !B.isSolid(belowId) && belowId !== 0))) {
        // 下が空気(または非固体の置き換え可能ブロック)なら落ちる
        if (belowId === 0) {
          this.setBlock(x, y - 1, z, id);
          this.fluidLevel.set(this.fluidKey(x, y - 1, z), 0);
          this.scheduleFluid(x, y - 1, z);
          changed = true;
        }
      }

      // --- 横へ流れる (下が流体内 or 固体のとき) ---
      const supportId = this.getBlock(x, y - 1, z);
      const canSpreadSideways = y > 0 && (B.isSolid(supportId) || this.isFluidBlock(supportId) || level === 0);
      if (level < 3 && canSpreadSideways) {
        const nextLevel = level + 1;
        const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
        for (const [dx, dz] of dirs) {
          const nx = x + dx, nz = z + dz;
          const nid = this.getBlock(nx, y, nz);
          if (nid === 0) {
            this.setBlock(nx, y, nz, id);
            this.fluidLevel.set(this.fluidKey(nx, y, nz), nextLevel);
            this.scheduleFluid(nx, y, nz);
            changed = true;
          }
        }
      }

      // --- 水と溶岩の反応 (隣接チェック) ---
      this.checkFluidReaction(x, y, z);

      return changed;
    }

    /** 水と溶岩が接したときの反応 (丸石/黒曜石) */
    checkFluidReaction(x, y, z) {
      const id = this.getBlock(x, y, z);
      if (!this.isFluidBlock(id)) return;
      const isWater = id === ID.water;
      const isLava = id === ID.lava;
      const dirs = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
      for (const [dx, dy, dz] of dirs) {
        const nx = x + dx, ny = y + dy, nz = z + dz;
        const nid = this.getBlock(nx, ny, nz);
        if (isWater && nid === ID.lava) {
          // 水が溶岩源に接すると黒曜石、溶岩の流れに接すると丸石
          const lavaSource = this.isFluidSource(nx, ny, nz);
          this.setBlock(nx, ny, nz, lavaSource ? ID.obsidian : ID.cobblestone);
          this.fluidLevel.delete(this.fluidKey(nx, ny, nz));
        } else if (isLava && nid === ID.water) {
          // 溶岩(自分)が水に接する。自分が源なら黒曜石、流れなら丸石になる
          const selfSource = this.isFluidSource(x, y, z);
          this.setBlock(x, y, z, selfSource ? ID.obsidian : ID.cobblestone);
          this.fluidLevel.delete(this.fluidKey(x, y, z));
          return;
        }
      }
    }

    /** ゲームループから毎フレーム呼ぶ。時間が来たキューを処理 */
    tickFluids(dt) {
      this.fluidTime += dt;
      let processed = 0;
      const maxPerFrame = 24;
      while (this.fluidQueue.length > 0 && processed < maxPerFrame) {
        const job = this.fluidQueue[0];
        if (job.t > this.fluidTime && processed > 0) break;   // 先頭が未来なら止める (ただし最低1件は消化)
        if (job.t > this.fluidTime && this.fluidQueue.length > 1) {
          // 先頭が未来なら、処理可能なジョブを後ろから探して差し替え
          let found = -1;
          for (let i = 1; i < Math.min(this.fluidQueue.length, 16); i++) {
            if (this.fluidQueue[i].t <= this.fluidTime) { found = i; break; }
          }
          if (found < 0) break;
          this.fluidQueue[0] = this.fluidQueue[found];
          this.fluidQueue.splice(found, 1);
        }
        this.fluidQueue.shift();
        const k = this.fluidKey(job.x, job.y, job.z);
        this.fluidQueued.delete(k);
        this.evalFluid(job.x, job.y, job.z);
        processed++;
      }
    }

    /** 流体セーブ (水位レベルのみ。ブロック自体は通常セーブ) */
    serializeFluids() {
      const out = {};
      for (const [k, v] of this.fluidLevel) out[k] = v;
      return out;
    }
    loadFluids(obj) {
      if (!obj) return;
      for (const k of Object.keys(obj)) this.fluidLevel.set(k, obj[k]);
    }

    /** 砂・砂利の落下 */
    applyGravity(x, y, z) {
      let steps = 0;
      let cy = y;
      while (steps++ < WH) {
        const id = this.getBlock(x, cy, z);
        if (id !== ID.sand && id !== ID.gravel) break;
        const below = this.getBlock(x, cy - 1, z);
        if (below === 0 || B.isLiquid(below)) {
          this.setBlock(x, cy, z, 0);
          this.setBlock(x, cy - 1, z, id);
          cy--;
        } else break;
      }
      // 上のブロックも連鎖
      const above = this.getBlock(x, y + 1, z);
      if (above === ID.sand || above === ID.gravel) this.applyGravity(x, y + 1, z);
    }

    /* ---------- セーブ ---------- */
    serializeEdits() {
      const out = {};
      for (const [, m] of this.editsByChunk) for (const [k, v] of m) out[k] = v;
      return out;
    }
    loadEdits(obj) {
      if (!obj) return;
      for (const k of Object.keys(obj)) {
        const [x, , z] = k.split(',').map(Number);
        const ck = World.key(x >> 4, z >> 4);
        let m = this.editsByChunk.get(ck);
        if (!m) { m = new Map(); this.editsByChunk.set(ck, m); }
        m.set(k, obj[k]);
      }
    }
    serializeFurnaces() {
      const out = {};
      for (const [k, f] of this.furnaces) out[k] = f.serialize();
      return out;
    }
    loadFurnaces(obj) {
      if (!obj) return;
      for (const k of Object.keys(obj)) this.furnaces.set(k, new InventorySystem.Furnace(obj[k]));
    }
    serializeChests() {
      const out = {};
      for (const [k, arr] of this.chests) out[k] = arr;
      return out;
    }
    loadChests(obj) {
      if (!obj) return;
      for (const k of Object.keys(obj)) {
        const arr = new Array(27).fill(null);
        (obj[k] || []).forEach((s, i) => { if (s && i < 27) arr[i] = s; });
        this.chests.set(k, arr);
      }
    }
    serializeDoors() { return Array.from(this.doorState.keys()); }
    loadDoors(arr) {
      if (!Array.isArray(arr)) return;
      for (const k of arr) this.doorState.set(k, true);
    }

    dispose() {
      for (const [, c] of this.chunks) {
        if (c.mesh) { this.group.remove(c.mesh); c.mesh.geometry.dispose(); }
        if (c.water) { this.group.remove(c.water); c.water.geometry.dispose(); }
      }
      this.chunks.clear();
      this.scene.remove(this.group);
    }
  }

  World.CX = CX; World.CZ = CZ; World.WH = WH; World.SEA = SEA;

  /* v0.10.3 S2: 構造物チェストのルートテーブル。
     各エントリ: [アイテム名, 重み, 最小個数, 最大個数] */
  World.LOOT_TABLES = {
    house: {
      rolls: [2, 4],
      entries: [
        ['bread', 8, 1, 2], ['apple', 6, 1, 2], ['wheat', 7, 1, 3],
        ['coal', 6, 1, 3], ['stick', 5, 1, 4], ['torch', 5, 2, 4],
        ['iron_ingot', 3, 1, 2], ['bucket', 2, 1, 1], ['melon_slice', 4, 1, 2]
      ]
    },
    dungeon: {
      rolls: [3, 5],
      entries: [
        ['iron_ingot', 6, 1, 2], ['gold_ingot', 4, 1, 2], ['redstone_dust', 5, 1, 4],
        ['coal', 5, 1, 3], ['bread', 4, 1, 2], ['bucket', 3, 1, 1],
        ['diamond', 2, 1, 1], ['emerald', 2, 1, 1], ['lapis_lazuli', 3, 1, 3],
        ['torch', 4, 2, 4]
      ]
    },
    temple: {
      rolls: [3, 6],
      entries: [
        ['gold_ingot', 6, 1, 3], ['emerald', 3, 1, 2], ['diamond', 3, 1, 1],
        ['lapis_lazuli', 4, 2, 4], ['amethyst_shard', 3, 1, 2], ['crystal_shard', 3, 1, 2],
        ['iron_ingot', 5, 1, 2], ['apple', 3, 1, 2]
      ]
    }
  };

  global.World = World;
})(window);
