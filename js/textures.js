/* ==========================================================
   textures.js — プロシージャル生成テクスチャアトラス
   16x16px タイルを 16列 x 16行 (=256x256px) に描画
   ========================================================== */
(function (global) {
  'use strict';

  /* v0.11.2: タイル解像度 TS は可変 (8 / 16 / 32 px)。
     ペインターは全て 16px 基準の座標 (BASE) で描く。
     等倍・拡大は activeCtx.scale(S, S) で直接描画、縮小は 16px で描いてから縮小転写する。 */
  let TS = 16;            // タイル1枚の実ピクセル数 (可変)
  const BASE = 16;        // ペインターの基準タイルサイズ (常に16)
  const COLS = 16;        // 列数
  const ROWS = 16;        // 行数

  const canvas = document.createElement('canvas');
  canvas.width = TS * COLS;
  canvas.height = TS * ROWS;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  const TILE = {};      // 名前 -> タイル番号
  const painters = [];  // タイル番号 -> 描画関数

  // 描画先コンテキスト (縮小時は中間 16px キャンバスに一時差し替える)
  let activeCtx = ctx;
  function setActiveCtx(c) { activeCtx = c; }

  function def(name, painter) {
    const index = painters.length;
    TILE[name] = index;
    painters.push(painter);
    return index;
  }

  /* ---------- 描画ヘルパ (activeCtx 経由で描画先を差替可能に) ---------- */
  function px(x, y, w, h, c) { activeCtx.fillStyle = c; activeCtx.fillRect(x, y, w, h); }
  function fillTile(ox, oy, color) { px(ox, oy, BASE, BASE, color); }

  function speckle(ox, oy, colors, count, rnd) {
    for (let i = 0; i < count; i++) {
      const x = (rnd() * BASE) | 0, y = (rnd() * BASE) | 0;
      const w = rnd() < 0.25 ? 2 : 1;
      px(ox + x, oy + y, w, w, colors[(rnd() * colors.length) | 0]);
    }
  }

  function blobs(ox, oy, color, count, size, rnd) {
    for (let i = 0; i < count; i++) {
      const x = (rnd() * (BASE - size)) | 0, y = (rnd() * (BASE - size)) | 0;
      px(ox + x, oy + y, size, size, color);
    }
  }

  /* ---------- ブロックテクスチャ ---------- */
  // v0.8: bloxd 風の明るくフラットな色調にパレットを刷新
  def('grass_top', (ox, oy, rnd) => {
    fillTile(ox, oy, '#6ec64e');
    speckle(ox, oy, ['#7ed85e', '#63b846', '#8ae068', '#5cb03e'], 70, rnd);
  });

  def('dirt', (ox, oy, rnd) => {
    fillTile(ox, oy, '#9a6c4c');
    speckle(ox, oy, ['#a87a58', '#8a5c40', '#b08660', '#7c5038'], 70, rnd);
  });

  def('grass_side', (ox, oy, rnd) => {
    fillTile(ox, oy, '#9a6c4c');
    speckle(ox, oy, ['#a87a58', '#8a5c40', '#7c5038'], 55, rnd);
    // 上部の草の縁
    for (let x = 0; x < BASE; x++) {
      const h = 3 + ((rnd() * 3) | 0);
      for (let y = 0; y < h; y++) {
        px(ox + x, oy + y, 1, 1, ['#6ec64e', '#7ed85e', '#63b846'][(rnd() * 3) | 0]);
      }
    }
  });

  def('stone', (ox, oy, rnd) => {
    fillTile(ox, oy, '#989898');
    speckle(ox, oy, ['#a8a8a8', '#8a8a8a', '#b2b2b2', '#808080'], 70, rnd);
  });

  def('cobblestone', (ox, oy, rnd) => {
    fillTile(ox, oy, '#7d7d7d');
    for (let i = 0; i < 10; i++) {
      const w = 3 + ((rnd() * 3) | 0), h = 3 + ((rnd() * 3) | 0);
      const x = (rnd() * (BASE - w)) | 0, y = (rnd() * (BASE - h)) | 0;
      px(ox + x, oy + y, w, h, ['#949494', '#6a6a6a', '#a0a0a0'][(rnd() * 3) | 0]);
      px(ox + x, oy + y, w, 1, '#5c5c5c');
    }
    speckle(ox, oy, ['#606060', '#8f8f8f'], 40, rnd);
  });

  def('log_side', (ox, oy, rnd) => {
    fillTile(ox, oy, '#6b4f2a');
    for (let x = 0; x < BASE; x++) {
      if (rnd() < 0.35) px(ox + x, oy, 1, BASE, rnd() < 0.5 ? '#5a4122' : '#7d5e33');
    }
    speckle(ox, oy, ['#4e3819', '#83643a'], 30, rnd);
  });

  def('log_top', (ox, oy, rnd) => {
    fillTile(ox, oy, '#a9834c');
    activeCtx.strokeStyle = '#7d5e33';
    for (let r = 2; r <= 7; r += 2) {
      activeCtx.beginPath();
      activeCtx.arc(ox + 8, oy + 8, r, 0, Math.PI * 2);
      activeCtx.stroke();
    }
    px(ox + 7, oy + 7, 2, 2, '#6b4f2a');
  });

  def('leaves', (ox, oy, rnd) => {
    activeCtx.clearRect(ox, oy, BASE, BASE);
    for (let y = 0; y < BASE; y++) {
      for (let x = 0; x < BASE; x++) {
        if (rnd() < 0.14) continue;  // 葉のすき間
        const c = ['#3f8f2f', '#4da63a', '#357c27', '#57b844'][(rnd() * 4) | 0];
        px(ox + x, oy + y, 1, 1, c);
      }
    }
  });

  def('sand', (ox, oy, rnd) => {
    fillTile(ox, oy, '#eadfa8');
    speckle(ox, oy, ['#f4eaba', '#dccf96', '#fbf4cc'], 60, rnd);
  });

  def('water', (ox, oy, rnd) => {
    fillTile(ox, oy, '#3f8fe0');
    speckle(ox, oy, ['#4f9fec', '#3782d0', '#5faff6'], 50, rnd);
  });

  def('planks', (ox, oy, rnd) => {
    fillTile(ox, oy, '#c29a5f');
    for (let y = 0; y < BASE; y += 4) px(ox, oy + y, BASE, 1, '#a37a45');
    speckle(ox, oy, ['#d0a86d', '#b28a51'], 35, rnd);
  });

  def('glass', (ox, oy, rnd) => {
    activeCtx.clearRect(ox, oy, BASE, BASE);
    px(ox, oy, BASE, 1, '#d7ecf5'); px(ox, oy + BASE - 1, BASE, 1, '#d7ecf5');
    px(ox, oy, 1, BASE, '#d7ecf5'); px(ox + BASE - 1, oy, 1, BASE, '#d7ecf5');
    px(ox + 2, oy + 2, 5, 1, '#eaf6fb'); px(ox + 2, oy + 2, 1, 4, '#eaf6fb');
    px(ox + 10, oy + 11, 4, 1, '#c9e2ee');
  });

  function oreTile(color, dark) {
    return (ox, oy, rnd) => {
      painters[TILE.stone](ox, oy, rnd);
      for (let i = 0; i < 5; i++) {
        const s = 2 + ((rnd() * 2) | 0);
        const x = 1 + ((rnd() * (BASE - s - 2)) | 0), y = 1 + ((rnd() * (BASE - s - 2)) | 0);
        px(ox + x, oy + y, s, s, color);
        px(ox + x, oy + y, 1, 1, dark);
      }
    };
  }
  def('coal_ore', oreTile('#2b2b2b', '#131313'));
  def('iron_ore', oreTile('#d8a878', '#a97b4e'));
  def('gold_ore', oreTile('#f5d33c', '#c9a018'));
  def('diamond_ore', oreTile('#5ce6de', '#2ba7a0'));

  def('bedrock', (ox, oy, rnd) => {
    fillTile(ox, oy, '#3a3a3a');
    blobs(ox, oy, '#242424', 12, 3, rnd);
    blobs(ox, oy, '#585858', 10, 2, rnd);
  });

  def('crafting_top', (ox, oy, rnd) => {
    painters[TILE.planks](ox, oy, rnd);
    px(ox, oy, BASE, 2, '#7d5e33');
    px(ox + 7, oy, 2, BASE, '#7d5e33');
    px(ox, oy + 7, BASE, 2, '#7d5e33');
  });

  def('crafting_side', (ox, oy, rnd) => {
    painters[TILE.planks](ox, oy, rnd);
    px(ox + 2, oy + 3, 5, 5, '#6d5030');
    px(ox + 9, oy + 6, 5, 6, '#6d5030');
    px(ox + 3, oy + 4, 3, 1, '#c9a76f');
  });

  def('furnace_front', (ox, oy, rnd) => {
    painters[TILE.stone](ox, oy, rnd);
    px(ox + 3, oy + 7, 10, 7, '#2a2a2a');
    px(ox + 4, oy + 11, 8, 3, '#5b5b5b');
    px(ox + 5, oy + 12, 2, 1, '#8f8f8f');
  });

  def('furnace_side', (ox, oy, rnd) => { painters[TILE.stone](ox, oy, rnd); });

  def('furnace_top', (ox, oy, rnd) => {
    painters[TILE.stone](ox, oy, rnd);
    px(ox + 4, oy + 4, 8, 8, '#5f5f5f');
    px(ox + 6, oy + 6, 4, 4, '#3d3d3d');
  });

  def('snow', (ox, oy, rnd) => {
    fillTile(ox, oy, '#f2f7f9');
    speckle(ox, oy, ['#ffffff', '#e2ecf1'], 60, rnd);
  });

  def('snow_side', (ox, oy, rnd) => {
    painters[TILE.dirt](ox, oy, rnd);
    px(ox, oy, BASE, 4, '#f2f7f9');
    for (let x = 0; x < BASE; x++) if (rnd() < 0.5) px(ox + x, oy + 4, 1, 1, '#f2f7f9');
  });

  def('gravel', (ox, oy, rnd) => {
    fillTile(ox, oy, '#877f7a');
    blobs(ox, oy, '#6e6763', 14, 3, rnd);
    blobs(ox, oy, '#a09892', 12, 2, rnd);
    speckle(ox, oy, ['#5c5551', '#b3aba5'], 40, rnd);
  });

  def('obsidian', (ox, oy, rnd) => {
    fillTile(ox, oy, '#150f22');
    speckle(ox, oy, ['#2b1f45', '#3d2c63', '#0d0917'], 60, rnd);
  });

  def('bookshelf', (ox, oy, rnd) => {
    painters[TILE.planks](ox, oy, rnd);
    const books = ['#a33', '#3a6', '#36a', '#aa3', '#a3a', '#3aa'];
    for (let row = 0; row < 2; row++) {
      let x = 1;
      while (x < BASE - 1) {
        const w = 1 + ((rnd() * 2) | 0);
        px(ox + x, oy + 2 + row * 7, w, 5, books[(rnd() * books.length) | 0]);
        x += w + 1;
      }
    }
  });

  function metalBlock(base, light, dark) {
    return (ox, oy, rnd) => {
      fillTile(ox, oy, base);
      px(ox + 1, oy + 1, BASE - 2, 1, light);
      px(ox + 1, oy + 1, 1, BASE - 2, light);
      px(ox + 1, oy + BASE - 2, BASE - 2, 1, dark);
      px(ox + BASE - 2, oy + 1, 1, BASE - 2, dark);
      speckle(ox, oy, [light, dark], 20, rnd);
    };
  }
  def('iron_block', metalBlock('#d8d8d8', '#f0f0f0', '#a8a8a8'));
  def('gold_block', metalBlock('#f5d33c', '#ffeb87', '#c19a12'));
  def('diamond_block', metalBlock('#4fe3d4', '#a8fff5', '#1f9d92'));

  def('wool', (ox, oy, rnd) => {
    fillTile(ox, oy, '#e9ecef');
    speckle(ox, oy, ['#ffffff', '#d5d9dd'], 70, rnd);
  });

  def('cactus_side', (ox, oy, rnd) => {
    fillTile(ox, oy, '#2f7a2f');
    px(ox, oy, 1, BASE, '#245f24'); px(ox + BASE - 1, oy, 1, BASE, '#245f24');
    for (let i = 0; i < 14; i++) px(ox + 2 + ((rnd() * 12) | 0), oy + ((rnd() * BASE) | 0), 1, 2, '#8fd48f');
  });
  def('cactus_top', (ox, oy, rnd) => {
    fillTile(ox, oy, '#3d8f3d');
    px(ox + 4, oy + 4, 8, 8, '#4fa54f');
    speckle(ox, oy, ['#8fd48f', '#2b6b2b'], 25, rnd);
  });

  // v0.8: 松明 — 炭化した先端・明るい炎・木柄のハイライトで読みやすく
  def('torch', (ox, oy) => {
    activeCtx.clearRect(ox, oy, BASE, BASE);
    // 柄 (木) — 右にハイライト
    px(ox + 7, oy + 8, 2, 8, '#7a5a33');
    px(ox + 8, oy + 8, 1, 8, '#977448');
    px(ox + 7, oy + 15, 2, 1, '#5a4122');
    // 炭化した先端
    px(ox + 7, oy + 7, 2, 1, '#3a2c1c');
    // 炎 (外側オレンジ → 内側黄 → 芯白)
    px(ox + 6, oy + 3, 4, 4, '#ff9c2a');
    px(ox + 7, oy + 2, 2, 1, '#ff9c2a');
    px(ox + 6, oy + 4, 4, 2, '#ffcf4d');
    px(ox + 7, oy + 3, 2, 2, '#fff3b0');
  });

  def('brick', (ox, oy, rnd) => {
    fillTile(ox, oy, '#9c5a4a');
    for (let y = 0; y < BASE; y += 4) {
      px(ox, oy + y, BASE, 1, '#c9bcb4');
      const off = (y / 4) % 2 === 0 ? 0 : 4;
      for (let x = off; x < BASE; x += 8) px(ox + x, oy + y, 1, 4, '#c9bcb4');
    }
    speckle(ox, oy, ['#8a4c3e', '#ad6a58'], 30, rnd);
  });

  /* 白樺 */
  def('birch_log_side', (ox, oy, rnd) => {
    fillTile(ox, oy, '#e8e3d5');
    // 白樺特有の黒い横模様
    for (let i = 0; i < 9; i++) {
      const y = (rnd() * BASE) | 0, w = 2 + ((rnd() * 3) | 0), x = (rnd() * (BASE - w)) | 0;
      px(ox + x, oy + y, w, 1, '#3a362f');
    }
    speckle(ox, oy, ['#d8d3c4', '#f2ede1'], 25, rnd);
  });
  def('birch_log_top', (ox, oy, rnd) => {
    fillTile(ox, oy, '#cfc39f');
    activeCtx.strokeStyle = '#a99a76';
    for (let r = 2; r <= 7; r += 2) {
      activeCtx.beginPath(); activeCtx.arc(ox + 8, oy + 8, r, 0, Math.PI * 2); activeCtx.stroke();
    }
    px(ox + 7, oy + 7, 2, 2, '#8a7f63');
  });
  def('birch_leaves', (ox, oy, rnd) => {
    activeCtx.clearRect(ox, oy, BASE, BASE);
    for (let y = 0; y < BASE; y++) {
      for (let x = 0; x < BASE; x++) {
        if (rnd() < 0.16) continue;
        px(ox + x, oy + y, 1, 1, ['#5fae3f', '#74c44f', '#549a37', '#80d15c'][(rnd() * 4) | 0]);
      }
    }
  });
  def('birch_planks', (ox, oy, rnd) => {
    fillTile(ox, oy, '#d8c98f');
    for (let y = 0; y < BASE; y += 4) px(ox, oy + y, BASE, 1, '#b5a66e');
    speckle(ox, oy, ['#e3d59c', '#c5b67f'], 40, rnd);
  });
  def('leaf_litter', (ox, oy, rnd) => {
    // 地面に散らばった落ち葉: 茶系の葉の形を複数描いて「落ち葉」に見せる
    activeCtx.clearRect(ox, oy, BASE, BASE);
    // 薄い土の下地
    fillTile(ox, oy, '#7d613d');
    // 葉っぱを散りばめる (形: 小さな楕円)
    for (let i = 0; i < 16; i++) {
      const x = 1 + ((rnd() * (BASE - 5)) | 0);
      const y = 1 + ((rnd() * (BASE - 5)) | 0);
      const c = ['#b8792e', '#a3621f', '#c99444', '#8f5c22', '#d4a050'][(rnd() * 5) | 0];
      // 葉っぱ (横長の3px)
      px(ox + x, oy + y + 1, 4, 2, c);
      px(ox + x + 1, oy + y, 2, 1, c);
      px(ox + x + 1, oy + y + 3, 2, 1, c);
      // 葉脈
      px(ox + x + 2, oy + y, 1, 4, '#7a4c18');
    }
    // 隙間に土を覗かせる
    for (let i = 0; i < 40; i++) {
      const x = (rnd() * BASE) | 0, y = (rnd() * BASE) | 0;
      px(ox + x, oy + y, 1, 1, '#6b5133');
    }
  });

  /* アメジスト */
  def('amethyst_ore', (ox, oy, rnd) => {
    painters[TILE.stone](ox, oy, rnd);
    for (let i = 0; i < 5; i++) {
      const s = 2 + ((rnd() * 2) | 0);
      const x = 1 + ((rnd() * (BASE - s - 2)) | 0), y = 1 + ((rnd() * (BASE - s - 2)) | 0);
      px(ox + x, oy + y, s, s, '#9b5ce0');
      px(ox + x, oy + y, 1, 1, '#d9b3ff');
    }
  });
  def('amethyst_block', (ox, oy, rnd) => {
    fillTile(ox, oy, '#8a4fd6');
    blobs(ox, oy, '#b07fe8', 8, 3, rnd);
    blobs(ox, oy, '#d9b3ff', 5, 2, rnd);
    speckle(ox, oy, ['#6b33b0', '#c99cf0'], 30, rnd);
  });
  def('amethyst_shard', (ox, oy) => {
    activeCtx.clearRect(ox, oy, BASE, BASE);
    px(ox + 5, oy + 3, 3, 8, '#9b5ce0');
    px(ox + 8, oy + 5, 3, 6, '#b07fe8');
    px(ox + 6, oy + 4, 1, 3, '#e8d0ff');
    px(ox + 5, oy + 11, 6, 2, '#6b33b0');
  });

  /* 作物 */
  def('farmland', (ox, oy, rnd) => {
    fillTile(ox, oy, '#4a3722');
    speckle(ox, oy, ['#5c4529', '#3b2c1a'], 60, rnd);
    for (let x = 1; x < BASE; x += 4) px(ox + x, oy, 2, BASE, '#33261a');
  });
  def('farmland_wet', (ox, oy, rnd) => {
    fillTile(ox, oy, '#38291a');
    speckle(ox, oy, ['#4a3722', '#2b1f12'], 60, rnd);
    for (let x = 1; x < BASE; x += 4) px(ox + x, oy, 2, BASE, '#241a0f');
  });
  function cropTile(colors) {
    return (ox, oy, rnd) => {
      activeCtx.clearRect(ox, oy, BASE, BASE);
      for (let i = 0; i < 5; i++) {
        const x = 2 + i * 3;
        const h = 4 + ((rnd() * 10) | 0);
        px(ox + x, oy + BASE - h, 1, h, colors[0]);
        px(ox + x, oy + BASE - h - 1, 2, 2, colors[1]);
      }
    };
  }
  def('wheat_crop_1', cropTile(['#4d9e3a', '#74c44f']));
  def('wheat_crop_2', cropTile(['#74a53a', '#b5c44f']));
  def('wheat_crop_3', (ox, oy, rnd) => {
    activeCtx.clearRect(ox, oy, BASE, BASE);
    for (let i = 0; i < 5; i++) {
      const x = 2 + i * 3;
      px(ox + x, oy + 2, 2, 5, '#d8b848'); px(ox + x + 1, oy + 3, 1, 2, '#f0d86a');
      px(ox + x + 1, oy + 7, 1, 9, '#8a8a2a');
    }
  });
  def('rice_crop_1', cropTile(['#3f8e6b', '#5fae8f']));
  def('rice_crop_2', cropTile(['#4fa57c', '#7fc4a3']));
  def('rice_crop_3', (ox, oy, rnd) => {
    activeCtx.clearRect(ox, oy, BASE, BASE);
    for (let i = 0; i < 5; i++) {
      const x = 2 + i * 3;
      px(ox + x + 1, oy + 4, 1, 12, '#4fa57c');
      px(ox + x, oy + 2, 2, 4, '#e8d87a');
    }
  });
  def('corn_crop_1', cropTile(['#3f8e3f', '#5fae5f']));
  def('corn_crop_2', cropTile(['#4fa54f', '#74c474']));
  def('corn_crop_3', (ox, oy, rnd) => {
    activeCtx.clearRect(ox, oy, BASE, BASE);
    for (let i = 0; i < 5; i++) {
      const x = 2 + i * 3;
      px(ox + x + 1, oy + 1, 1, 15, '#4fa54f');
      px(ox + x, oy + 5, 2, 4, '#f0d53a'); px(ox + x, oy + 9, 2, 4, '#f0d53a');
    }
  });
  def('tomato_crop_1', cropTile(['#3f8e3f', '#5fae5f']));
  def('tomato_crop_2', cropTile(['#4fa54f', '#a3d18f']));
  def('tomato_crop_3', (ox, oy, rnd) => {
    activeCtx.clearRect(ox, oy, BASE, BASE);
    for (let i = 0; i < 4; i++) {
      const x = 3 + i * 4;
      px(ox + x + 1, oy + 1, 1, 13, '#4fa54f');
      px(ox + x, oy + 6, 3, 3, '#e04430'); px(ox + x, oy + 11, 2, 2, '#c93a28');
    }
  });
  def('wheat_seed', (ox, oy) => {
    activeCtx.clearRect(ox, oy, BASE, BASE);
    px(ox + 3, oy + 10, 4, 3, '#b5a53c'); px(ox + 9, oy + 9, 4, 3, '#c9b648');
    px(ox + 6, oy + 12, 4, 2, '#9c8f2e'); px(ox + 11, oy + 12, 3, 2, '#b5a53c');
  });
  def('rice_seed', (ox, oy) => {
    activeCtx.clearRect(ox, oy, BASE, BASE);
    px(ox + 4, oy + 10, 3, 4, '#e8d87a'); px(ox + 9, oy + 10, 3, 4, '#f0e492');
    px(ox + 6, oy + 12, 5, 2, '#d8c86a');
  });
  def('corn_seed', (ox, oy) => {
    activeCtx.clearRect(ox, oy, BASE, BASE);
    px(ox + 5, oy + 8, 6, 6, '#f0d53a'); px(ox + 6, oy + 9, 2, 2, '#fff0a0');
    px(ox + 5, oy + 14, 6, 1, '#c9a02e');
  });
  def('tomato_seed', (ox, oy) => {
    activeCtx.clearRect(ox, oy, BASE, BASE);
    px(ox + 5, oy + 10, 6, 4, '#e8e0b0'); px(ox + 6, oy + 11, 2, 2, '#fff8d0');
  });
  def('wheat', (ox, oy) => {
    activeCtx.clearRect(ox, oy, BASE, BASE);
    px(ox + 5, oy + 3, 3, 5, '#d8b848'); px(ox + 6, oy + 4, 1, 3, '#f0d86a');
    px(ox + 6, oy + 8, 1, 7, '#8a8a2a');
  });
  def('rice', (ox, oy) => {
    activeCtx.clearRect(ox, oy, BASE, BASE);
    px(ox + 5, oy + 4, 4, 6, '#e8d87a'); px(ox + 6, oy + 5, 2, 2, '#fff4b0');
    px(ox + 6, oy + 10, 1, 5, '#8a8a2a');
  });
  def('corn', (ox, oy) => {
    activeCtx.clearRect(ox, oy, BASE, BASE);
    px(ox + 4, oy + 4, 6, 9, '#f0d53a'); px(ox + 5, oy + 5, 2, 3, '#fff0a0');
    px(ox + 4, oy + 13, 6, 1, '#5fae5f');
  });
  def('tomato', (ox, oy) => {
    activeCtx.clearRect(ox, oy, BASE, BASE);
    px(ox + 4, oy + 5, 8, 8, '#e04430'); px(ox + 5, oy + 6, 3, 3, '#f07a68');
    px(ox + 7, oy + 3, 3, 3, '#4fa54f');
  });
  def('bread', (ox, oy) => {
    activeCtx.clearRect(ox, oy, BASE, BASE);
    px(ox + 3, oy + 6, 10, 6, '#c98f45'); px(ox + 4, oy + 5, 8, 2, '#e8b878');
    px(ox + 3, oy + 12, 10, 1, '#9c6e33');
  });
  function hoe(color, dark) {
    return (ox, oy) => {
      activeCtx.clearRect(ox, oy, BASE, BASE);
      handle(ox, oy);
      px(ox + 8, oy + 2, 6, 2, color);
      px(ox + 12, oy + 4, 2, 4, color);
      px(ox + 11, oy + 4, 1, 3, dark);
    };
  }
  def('wooden_hoe', hoe('#a9763f', '#7d5527'));
  def('stone_hoe', hoe('#9a9a9a', '#6e6e6e'));
  def('iron_hoe', hoe('#e2e2e2', '#a5a5a5'));
  def('diamond_hoe', hoe('#4fe3d4', '#26a99e'));
  def('bone', (ox, oy) => {
    activeCtx.clearRect(ox, oy, BASE, BASE);
    px(ox + 4, oy + 7, 8, 2, '#e6e3d8');
    px(ox + 3, oy + 5, 2, 2, '#f4f2ea'); px(ox + 3, oy + 9, 2, 2, '#f4f2ea');
    px(ox + 11, oy + 5, 2, 2, '#f4f2ea'); px(ox + 11, oy + 9, 2, 2, '#f4f2ea');
    px(ox + 6, oy + 7, 1, 2, '#c9c4b4');
  });

  def('chest_side', (ox, oy, rnd) => {
    fillTile(ox, oy, '#8a6431');
    speckle(ox, oy, ['#7a5729', '#9a723c'], 40, rnd);
    px(ox, oy, BASE, 1, '#5c4020'); px(ox, oy + BASE - 1, BASE, 1, '#5c4020');
    px(ox, oy, 1, BASE, '#5c4020'); px(ox + BASE - 1, oy, 1, BASE, '#5c4020');
    px(ox, oy + 5, BASE, 2, '#5c4020');
    px(ox + 6, oy + 4, 4, 5, '#c9a227');
    px(ox + 7, oy + 6, 2, 2, '#4a3512');
  });
  def('chest_top', (ox, oy, rnd) => {
    fillTile(ox, oy, '#966d36');
    speckle(ox, oy, ['#8a6431', '#a67c40'], 40, rnd);
    px(ox, oy, BASE, 1, '#5c4020'); px(ox, oy + BASE - 1, BASE, 1, '#5c4020');
    px(ox, oy, 1, BASE, '#5c4020'); px(ox + BASE - 1, oy, 1, BASE, '#5c4020');
  });
  def('bed_top', (ox, oy, rnd) => {
    fillTile(ox, oy, '#b83b3b');
    speckle(ox, oy, ['#c94a4a', '#a33131'], 40, rnd);
    px(ox + 1, oy + 1, BASE - 2, 5, '#f2f2f2');   // 枕
    px(ox + 1, oy + 6, BASE - 2, 1, '#d8d8d8');
  });
  def('bed_side', (ox, oy, rnd) => {
    fillTile(ox, oy, '#b83b3b');
    speckle(ox, oy, ['#c94a4a', '#a33131'], 30, rnd);
    px(ox, oy + 10, BASE, 6, '#f2f2f2');
    px(ox, oy + 14, 3, 2, '#6b4f2a'); px(ox + BASE - 3, oy + 14, 3, 2, '#6b4f2a');
  });

  /* ---------- アイテムアイコン ---------- */
  function handle(ox, oy) {
    for (let i = 0; i < 8; i++) px(ox + 3 + i, oy + 13 - i, 2, 2, '#8a6a3c');
  }

  function pickaxe(color, dark) {
    return (ox, oy) => {
      activeCtx.clearRect(ox, oy, BASE, BASE);
      handle(ox, oy);
      px(ox + 4, oy + 3, 8, 2, color);
      px(ox + 2, oy + 4, 2, 2, color); px(ox + 12, oy + 4, 2, 2, color);
      px(ox + 1, oy + 5, 2, 2, dark); px(ox + 13, oy + 5, 2, 2, dark);
      px(ox + 7, oy + 5, 2, 2, dark);
    };
  }
  function axe(color, dark) {
    return (ox, oy) => {
      activeCtx.clearRect(ox, oy, BASE, BASE);
      handle(ox, oy);
      px(ox + 7, oy + 2, 6, 6, color);
      px(ox + 5, oy + 4, 2, 4, color);
      px(ox + 12, oy + 3, 1, 5, dark);
      px(ox + 7, oy + 7, 5, 1, dark);
    };
  }
  function shovel(color, dark) {
    return (ox, oy) => {
      activeCtx.clearRect(ox, oy, BASE, BASE);
      handle(ox, oy);
      px(ox + 8, oy + 2, 5, 6, color);
      px(ox + 9, oy + 8, 3, 1, dark);
      px(ox + 12, oy + 3, 1, 4, dark);
    };
  }
  function sword(color, dark) {
    return (ox, oy) => {
      activeCtx.clearRect(ox, oy, BASE, BASE);
      px(ox + 2, oy + 12, 3, 3, '#6b4f2a');
      px(ox + 3, oy + 10, 5, 2, '#9a9a9a');
      for (let i = 0; i < 8; i++) px(ox + 5 + i, oy + 10 - i, 2, 2, color);
      px(ox + 11, oy + 2, 2, 2, dark);
    };
  }

  def('stick', (ox, oy) => { activeCtx.clearRect(ox, oy, BASE, BASE); for (let i = 0; i < 9; i++) { px(ox + 4 + i * 0.7 | 0, oy + 13 - i, 2, 2, '#8a6a3c'); } for (let i = 0; i < 9; i++) { px(ox + 5 + i * 0.7 | 0, oy + 13 - i, 1, 1, '#a8844e'); } });
  def('coal', (ox, oy, rnd) => {
    activeCtx.clearRect(ox, oy, BASE, BASE);
    px(ox + 4, oy + 5, 8, 7, '#1e1e1e');
    px(ox + 3, oy + 7, 10, 4, '#1e1e1e');
    px(ox + 5, oy + 6, 3, 2, '#3d3d3d');
    speckle(ox, oy, [], 0, rnd);
  });
  function ingot(color, light, dark) {
    return (ox, oy) => {
      activeCtx.clearRect(ox, oy, BASE, BASE);
      px(ox + 3, oy + 6, 10, 5, color);
      px(ox + 4, oy + 5, 8, 1, light);
      px(ox + 3, oy + 11, 10, 1, dark);
      px(ox + 5, oy + 7, 3, 1, light);
    };
  }
  def('iron_ingot', ingot('#d8d8d8', '#f7f7f7', '#9c9c9c'));
  def('gold_ingot', ingot('#f5d33c', '#fff0a0', '#bf9412'));
  def('diamond', (ox, oy) => {
    activeCtx.clearRect(ox, oy, BASE, BASE);
    px(ox + 6, oy + 3, 4, 2, '#8ff5ec');
    px(ox + 4, oy + 5, 8, 4, '#4fe3d4');
    px(ox + 5, oy + 9, 6, 2, '#2fbfb2');
    px(ox + 7, oy + 11, 2, 1, '#1f9d92');
    px(ox + 6, oy + 5, 2, 2, '#d3fffb');
  });
  def('apple', (ox, oy) => {
    activeCtx.clearRect(ox, oy, BASE, BASE);
    px(ox + 4, oy + 5, 8, 8, '#cc3b30');
    px(ox + 3, oy + 7, 10, 4, '#cc3b30');
    px(ox + 5, oy + 6, 2, 2, '#f07a70');
    px(ox + 8, oy + 2, 1, 4, '#6b4f2a');
    px(ox + 9, oy + 2, 3, 2, '#4d9e3a');
  });
  def('porkchop_raw', (ox, oy) => {
    activeCtx.clearRect(ox, oy, BASE, BASE);
    px(ox + 3, oy + 5, 10, 7, '#e88b8b');
    px(ox + 4, oy + 4, 8, 1, '#f5b3b3');
    px(ox + 5, oy + 7, 5, 3, '#f7cfcf');
    px(ox + 3, oy + 12, 10, 1, '#b96b6b');
  });
  def('porkchop_cooked', (ox, oy) => {
    activeCtx.clearRect(ox, oy, BASE, BASE);
    px(ox + 3, oy + 5, 10, 7, '#b3763f');
    px(ox + 4, oy + 4, 8, 1, '#d19a5e');
    px(ox + 5, oy + 7, 5, 3, '#e0b378');
    px(ox + 3, oy + 12, 10, 1, '#8a5a2e');
  });

  const MABASE = {
    wooden: ['#a9763f', '#7d5527'],
    stone: ['#9a9a9a', '#6e6e6e'],
    iron: ['#e2e2e2', '#a5a5a5'],
    diamond: ['#4fe3d4', '#26a99e']
  };
  for (const m of Object.keys(MABASE)) {
    const [c, d] = MABASE[m];
    def(m + '_pickaxe', pickaxe(c, d));
    def(m + '_axe', axe(c, d));
    def(m + '_shovel', shovel(c, d));
    def(m + '_sword', sword(c, d));
  }

  /* 生肉/焼肉 (豚・牛・鶏) */
  function meatTile(rawColor, light, dark) {
    return (ox, oy) => {
      activeCtx.clearRect(ox, oy, BASE, BASE);
      px(ox + 3, oy + 5, 10, 7, rawColor);
      px(ox + 4, oy + 4, 8, 1, light);
      px(ox + 5, oy + 7, 5, 3, light);
      px(ox + 3, oy + 12, 10, 1, dark);
    };
  }
  def('beef_raw', meatTile('#c94040', '#e87878', '#8f2c2c'));
  def('beef_cooked', meatTile('#7d4a24', '#a86b38', '#55331a'));
  def('chicken_raw', meatTile('#e8b0a8', '#f7d8d0', '#b58278'));
  def('chicken_cooked', meatTile('#c98f45', '#e8b878', '#9c6e33'));

  /* ===== v0.2 追加: 建築パーツ ===== */
  // ドア (木のドア。中央に取っ手)
  def('door_oak', (ox, oy) => {
    activeCtx.clearRect(ox, oy, BASE, BASE);
    px(ox + 2, oy, 12, BASE, '#a9763f');           // 板
    px(ox + 2, oy, 12, 1, '#c59050');
    px(ox + 3, oy + 7, 10, 2, '#7d5527');        // 横桟
    px(ox + 10, oy + 8, 3, 3, '#d8c98f');        // 取っ手
    px(ox + 2, oy, 1, BASE, '#7d5527');
    px(ox + 13, oy, 1, BASE, '#7d5527');
  });
  // トラップドア
  def('trapdoor', (ox, oy) => {
    activeCtx.clearRect(ox, oy, BASE, BASE);
    px(ox, oy + 3, BASE, 10, '#a9763f');
    px(ox, oy + 3, BASE, 1, '#c59050');
    px(ox, oy + 12, BASE, 1, '#7d5527');
    for (let x = 1; x < BASE; x += 4) px(ox + x, oy + 3, 1, 10, '#8a6438');
  });
  // 梯子 (横桟) — v0.8: ハイライトで桟を立体的に
  def('ladder', (ox, oy) => {
    activeCtx.clearRect(ox, oy, BASE, BASE);
    px(ox + 2, oy, 2, BASE, '#8a6438');
    px(ox + 12, oy, 2, BASE, '#8a6438');
    px(ox + 3, oy, 1, BASE, '#b08248');
    px(ox + 13, oy, 1, BASE, '#b08248');
    for (let y = 1; y < BASE; y += 3) px(ox + 4, oy + y, 8, 1, '#c08a4e');
  });
  // 柵 (縦棒)
  def('fence', (ox, oy) => {
    activeCtx.clearRect(ox, oy, BASE, BASE);
    px(ox + 2, oy, 3, BASE, '#a9763f');
    px(ox + 11, oy, 3, BASE, '#a9763f');
    px(ox, oy + 4, BASE, 2, '#c59050');
    px(ox, oy + 10, BASE, 2, '#c59050');
  });
  // 看板 (板+支柱)
  def('sign', (ox, oy) => {
    activeCtx.clearRect(ox, oy, BASE, BASE);
    px(ox + 2, oy + 2, 12, 8, '#c59050');
    px(ox + 2, oy + 2, 12, 1, '#e0b070');
    px(ox + 7, oy + 10, 2, 6, '#8a6438');
  });
  // 階段 (側面に段差)
  def('stairs', (ox, oy) => {
    activeCtx.clearRect(ox, oy, BASE, BASE);
    px(ox, oy + 8, BASE, 8, '#9a9a9a');   // 下段
    px(ox + 8, oy, 8, 8, '#b5b5b5');     // 上段
    px(ox, oy + 8, BASE, 1, '#6e6e6e');
    px(ox + 8, oy, 8, 1, '#6e6e6e');
  });
  // ハーフブロック (下半分)
  def('slab', (ox, oy) => {
    activeCtx.clearRect(ox, oy, BASE, BASE);
    px(ox, oy + 8, BASE, 8, '#9a9a9a');
    px(ox, oy + 8, BASE, 1, '#c9c9c9');
    px(ox, oy + 15, BASE, 1, '#6e6e6e');
  });

  /* ===== v0.2 追加: 花と染料 ===== */
  const flowerColors = {
    dandelion: '#f5d33c', poppy: '#cc3b30', orchid: '#5f8fd0',
    tulip: '#e878a8', daisy: '#f2f2f2', allium: '#b078d0',
    cornflower: '#4f7fd8', lily: '#e8e8f8'
  };
  for (const name of Object.keys(flowerColors)) {
    def('flower_' + name, (ox, oy) => {
      activeCtx.clearRect(ox, oy, BASE, BASE);
      const c = flowerColors[name];
      px(ox + 7, oy + 7, 2, 9, '#4d9e3a');     // 茎
      px(ox + 5, oy + 9, 2, 3, '#4d9e3a');      // 葉
      px(ox + 9, oy + 9, 2, 3, '#4d9e3a');
      // 花冠
      px(ox + 5, oy + 2, 6, 6, c);
      px(ox + 6, oy + 3, 4, 4, c);
      px(ox + 7, oy + 4, 2, 2, '#f8f0a0');     // 中心
    });
  }
  // 染料 (花から作れる粉)
  const dyeColors = {
    yellow: '#f5d33c', red: '#cc3b30', blue: '#3f6fd0',
    pink: '#e878a8', white: '#f2f2f2', purple: '#8a4fd6', light_blue: '#6fa8e0'
  };
  for (const name of Object.keys(dyeColors)) {
    def('dye_' + name, (ox, oy) => {
      activeCtx.clearRect(ox, oy, BASE, BASE);
      const c = dyeColors[name];
      px(ox + 4, oy + 4, 8, 8, c);
      px(ox + 5, oy + 5, 3, 3, '#ffffff55');
      px(ox + 4, oy + 11, 8, 1, '#00000033');
    });
  }

  /* ===== v0.3 追加: 鉱石 ===== */
  def('lapis_ore', oreTile('#3f5fd8', '#20328a'));
  def('emerald_ore', oreTile('#3fd87a', '#1f8a4a'));
  def('redstone_ore', oreTile('#e04030', '#8a1f14'));
  def('copper_ore', oreTile('#e08a50', '#a05a30'));
  def('silver_ore', oreTile('#d0d8e0', '#98a4b0'));
  def('crystal_ore', oreTile('#a8e8f0', '#5fb8c8'));
  def('sulfur_ore', oreTile('#e8d83c', '#a89a20'));
  def('salt_ore', oreTile('#f0f0f0', '#c0c0c0'));

  /* ===== v0.3 追加: 氷/泥/粘土/苔/蔦 ===== */
  def('ice', (ox, oy, rnd) => {
    fillTile(ox, oy, '#b8dcf0');
    speckle(ox, oy, ['#cfe8f8', '#a0cce8', '#e0f2fb'], 60, rnd);
    px(ox + 3, oy + 5, 6, 1, '#ffffff');
    px(ox + 8, oy + 10, 5, 1, '#ffffff');
  });
  def('mud', (ox, oy, rnd) => {
    fillTile(ox, oy, '#5c4632');
    speckle(ox, oy, ['#6b5340', '#4e3a28', '#75604a'], 90, rnd);
  });
  def('clay', (ox, oy, rnd) => {
    fillTile(ox, oy, '#a4a8b0');
    speckle(ox, oy, ['#b0b6be', '#949aa4', '#c0c6ce'], 70, rnd);
  });
  def('moss', (ox, oy, rnd) => {
    fillTile(ox, oy, '#4a7a34');
    blobs(ox, oy, '#5f9440', 10, 3, rnd);
    blobs(ox, oy, '#3a6528', 8, 2, rnd);
    speckle(ox, oy, ['#74b050', '#2f5620'], 40, rnd);
  });
  def('vine', (ox, oy, rnd) => {
    activeCtx.clearRect(ox, oy, BASE, BASE);
    for (let i = 0; i < 4; i++) {
      const x = 2 + i * 4;
      const len = 8 + ((rnd() * 8) | 0);
      px(ox + x, oy, 1, len, '#3f7430');
      px(ox + x + 1, oy + 2, 1, 3, '#50923e');
      for (let y = 2; y < len; y += 4) px(ox + x, oy + y, 2, 2, '#63aa4e');
    }
  });
  // v0.8: 高草 — 根元から穂先までグラデーションを付けて立体感を出す
  def('tall_grass', (ox, oy, rnd) => {
    activeCtx.clearRect(ox, oy, BASE, BASE);
    for (let i = 0; i < 7; i++) {
      const x = 1 + i * 2;
      const h = 9 + ((rnd() * 7) | 0);
      const base = ['#57b040', '#64c44c', '#4da038'][(rnd() * 3) | 0];
      px(ox + x, oy + BASE - h, 1, h, base);
      // 根元を暗く、穂先を明るく
      px(ox + x, oy + BASE - 3, 1, 3, '#3d8a2c');
      if (h > 8) px(ox + x, oy + BASE - h, 1, 2, '#82d85f');
    }
  });
  function mushroomTile(cap, capDark) {
    return (ox, oy) => {
      activeCtx.clearRect(ox, oy, BASE, BASE);
      px(ox + 7, oy + 8, 3, 7, '#e8e0cc');       // 軸
      px(ox + 6, oy + 13, 5, 2, '#d0c8b0');
      px(ox + 4, oy + 4, 9, 4, cap);             // 傘
      px(ox + 5, oy + 3, 7, 2, cap);
      px(ox + 4, oy + 7, 9, 1, capDark);
      px(ox + 6, oy + 4, 2, 2, '#f5f0e0');       // 斑点
      px(ox + 10, oy + 5, 2, 2, '#f5f0e0');
    };
  }
  def('mushroom_brown', mushroomTile('#8a6a4a', '#6b5038'));
  def('mushroom_red', mushroomTile('#c93a2a', '#9c2a1e'));
  // v0.8: 竹 — 筒状のハイライトと節の立体感、小さな葉
  def('bamboo', (ox, oy, rnd) => {
    activeCtx.clearRect(ox, oy, BASE, BASE);
    px(ox + 6, oy, 4, BASE, '#82c452');      // 幹の基本色
    px(ox + 7, oy, 2, BASE, '#a5dd72');      // 筒のハイライト
    for (let y = 3; y < BASE; y += 5) {      // 節 (濃い輪 + 上下の影)
      px(ox + 6, oy + y, 4, 1, '#548c32');
      px(ox + 6, oy + y + 1, 4, 1, '#6aa842');
    }
    px(ox + 2, oy + 4, 4, 2, '#5f9e3c');   // 葉
    px(ox + 10, oy + 9, 4, 2, '#5f9e3c');
    px(ox + 3, oy + 3, 2, 1, '#77bc4e');
    px(ox + 11, oy + 8, 2, 1, '#77bc4e');
  });
  // v0.8: サトウキビ — 茎のハイライト・明確な節・葉を追加してより茎らしく
  def('sugarcane', (ox, oy, rnd) => {
    activeCtx.clearRect(ox, oy, BASE, BASE);
    for (const x of [3, 8, 12]) {
      px(ox + x, oy, 2, BASE, '#b4e084');        // 茎
      px(ox + x, oy, 1, BASE, '#d2f0a6');        // ハイライト
      for (let y = 4; y < BASE; y += 5) px(ox + x, oy + y, 2, 1, '#8fc45c');  // 節
    }
    // 葉 (斜めに広がる細い葉)
    px(ox + 5, oy + 2, 3, 1, '#9ed46c');
    px(ox + 6, oy + 1, 2, 1, '#9ed46c');
    px(ox + 10, oy + 7, 3, 1, '#9ed46c');
    px(ox + 11, oy + 6, 2, 1, '#9ed46c');
    px(ox + 1, oy + 11, 2, 1, '#9ed46c');
  });
  def('pumpkin_side', (ox, oy, rnd) => {
    fillTile(ox, oy, '#d8872a');
    for (let x = 1; x < BASE; x += 4) px(ox + x, oy, 1, BASE, '#b56a1e');
    speckle(ox, oy, ['#e89a3a', '#c97a24'], 30, rnd);
  });
  def('pumpkin_top', (ox, oy, rnd) => {
    fillTile(ox, oy, '#d8872a');
    for (let x = 1; x < BASE; x += 4) px(ox + x, oy, 1, BASE, '#b56a1e');
    px(ox + 7, oy + 7, 3, 3, '#5f7a2a');   // へた
    px(ox + 8, oy + 6, 1, 1, '#4a6120');
  });
  def('melon_block', (ox, oy, rnd) => {
    fillTile(ox, oy, '#74b83c');
    for (let x = 0; x < BASE; x += 4) px(ox + x, oy, 2, BASE, '#4a8a24');
    speckle(ox, oy, ['#8aca50', '#3d741e'], 30, rnd);
  });
  def('mossy_cobblestone', (ox, oy, rnd) => {
    painters[TILE.cobblestone](ox, oy, rnd);
    blobs(ox, oy, '#4a7a34', 6, 3, rnd);
    speckle(ox, oy, ['#5f9440', '#3a6528'], 30, rnd);
  });
  def('magma', (ox, oy, rnd) => {
    fillTile(ox, oy, '#2a1a12');
    blobs(ox, oy, '#e05a1a', 8, 3, rnd);
    blobs(ox, oy, '#ffb43a', 5, 2, rnd);
    speckle(ox, oy, ['#ff7a2a', '#3a241a', '#c94a10'], 50, rnd);
  });
  def('terracotta', (ox, oy, rnd) => {
    fillTile(ox, oy, '#b5654a');
    speckle(ox, oy, ['#c07050', '#a55a42', '#ba6a4e'], 50, rnd);
  });

  /* ===== v0.3 追加: 鉱物ブロック ===== */
  def('copper_block', metalBlock('#c97a4a', '#e89a68', '#9c5a34'));
  def('silver_block', metalBlock('#c8d0d8', '#e8eef2', '#98a4b0'));
  def('lapis_block', metalBlock('#2f4fbf', '#4f6fe0', '#1f3590'));
  def('emerald_block', metalBlock('#2fc96a', '#5fe894', '#1f9448'));
  def('redstone_block', metalBlock('#c03020', '#e05038', '#8a1f14'));
  def('crystal_block', metalBlock('#9fdce8', '#d0f4fb', '#5fb8c8'));

  /* ===== v0.3 追加: アイテム ===== */
  def('lapis_lazuli', (ox, oy) => {
    activeCtx.clearRect(ox, oy, BASE, BASE);
    px(ox + 4, oy + 6, 8, 6, '#2f4fbf');
    px(ox + 5, oy + 5, 6, 2, '#4f6fe0');
    px(ox + 6, oy + 7, 3, 2, '#6f8ff0');
    px(ox + 4, oy + 12, 8, 1, '#1f3590');
  });
  def('emerald', (ox, oy) => {
    activeCtx.clearRect(ox, oy, BASE, BASE);
    px(ox + 5, oy + 4, 6, 3, '#5fe894');
    px(ox + 4, oy + 6, 8, 5, '#2fc96a');
    px(ox + 6, oy + 11, 4, 2, '#1f9448');
    px(ox + 6, oy + 6, 2, 2, '#c8ffe0');
  });
  def('redstone_dust', (ox, oy, rnd) => {
    activeCtx.clearRect(ox, oy, BASE, BASE);
    for (let i = 0; i < 8; i++) px(ox + 2 + ((rnd() * 10) | 0), oy + 8 + ((rnd() * 5) | 0), 2, 2, '#e04030');
    for (let i = 0; i < 4; i++) px(ox + 4 + ((rnd() * 8) | 0), oy + 9 + ((rnd() * 4) | 0), 1, 1, '#ff6a50');
  });
  def('copper_ingot', ingot('#d8875a', '#f0a878', '#a05a30'));
  def('silver_ingot', ingot('#d0d8e0', '#f0f4f8', '#98a4b0'));
  def('crystal_shard', (ox, oy) => {
    activeCtx.clearRect(ox, oy, BASE, BASE);
    px(ox + 5, oy + 3, 3, 8, '#9fdce8');
    px(ox + 8, oy + 5, 3, 6, '#bfeef5');
    px(ox + 6, oy + 4, 1, 3, '#ffffff');
    px(ox + 5, oy + 11, 6, 2, '#5fb8c8');
  });
  def('sulfur', (ox, oy, rnd) => {
    activeCtx.clearRect(ox, oy, BASE, BASE);
    for (let i = 0; i < 7; i++) px(ox + 3 + ((rnd() * 9) | 0), oy + 8 + ((rnd() * 5) | 0), 2, 2, '#e8d83c');
    for (let i = 0; i < 4; i++) px(ox + 5 + ((rnd() * 7) | 0), oy + 9 + ((rnd() * 4) | 0), 1, 1, '#f5ec7a');
  });
  def('salt', (ox, oy, rnd) => {
    activeCtx.clearRect(ox, oy, BASE, BASE);
    for (let i = 0; i < 7; i++) px(ox + 3 + ((rnd() * 9) | 0), oy + 8 + ((rnd() * 5) | 0), 2, 2, '#f0f0f0');
    for (let i = 0; i < 4; i++) px(ox + 5 + ((rnd() * 7) | 0), oy + 9 + ((rnd() * 4) | 0), 1, 1, '#ffffff');
  });
  def('clay_ball', (ox, oy) => {
    activeCtx.clearRect(ox, oy, BASE, BASE);
    px(ox + 4, oy + 6, 8, 6, '#a4a8b0');
    px(ox + 5, oy + 5, 6, 2, '#c0c6ce');
    px(ox + 4, oy + 12, 8, 1, '#848a94');
  });
  def('brick_item', (ox, oy) => {
    activeCtx.clearRect(ox, oy, BASE, BASE);
    px(ox + 3, oy + 6, 10, 6, '#9c5a4a');
    px(ox + 3, oy + 6, 10, 1, '#c9bcb4');
    px(ox + 3, oy + 11, 10, 1, '#8a4c3e');
    px(ox + 7, oy + 7, 1, 4, '#c9bcb4');
  });
  def('melon_slice', (ox, oy) => {
    activeCtx.clearRect(ox, oy, BASE, BASE);
    px(ox + 3, oy + 5, 10, 6, '#e04430');
    px(ox + 4, oy + 6, 8, 4, '#f05a44');
    px(ox + 3, oy + 11, 10, 2, '#74b83c');   // 皮
    px(ox + 3, oy + 10, 10, 1, '#e8f0d0');
    px(ox + 5, oy + 7, 1, 1, '#3a2a1a');     // 種
    px(ox + 8, oy + 8, 1, 1, '#3a2a1a');
    px(ox + 10, oy + 7, 1, 1, '#3a2a1a');
  });

  /* ===== v0.4 追加: 溶岩・バケツ ===== */
  def('lava', (ox, oy, rnd) => {
    fillTile(ox, oy, '#e05018');
    speckle(ox, oy, ['#f06420', '#c84010', '#f88030', '#b03008'], 70, rnd);
    blobs(ox, oy, '#ffb030', 12, 3, rnd);
    blobs(ox, oy, '#ffd850', 5, 2, rnd);
  });
  def('bucket', (ox, oy) => {
    activeCtx.clearRect(ox, oy, BASE, BASE);
    px(ox + 4, oy + 3, 8, 2, '#c8ccd4');   // 口
    px(ox + 3, oy + 5, 10, 2, '#b0b6c0');
    px(ox + 4, oy + 7, 8, 6, '#9aa0ac');   // 胴
    px(ox + 5, oy + 13, 6, 1, '#787e8a');  // 底
    px(ox + 4, oy + 3, 8, 1, '#e4e8ee');
  });
  def('water_bucket', (ox, oy) => {
    activeCtx.clearRect(ox, oy, BASE, BASE);
    px(ox + 4, oy + 3, 8, 2, '#c8ccd4');
    px(ox + 3, oy + 5, 10, 2, '#b0b6c0');
    px(ox + 4, oy + 7, 8, 6, '#9aa0ac');
    px(ox + 5, oy + 13, 6, 1, '#787e8a');
    px(ox + 4, oy + 4, 8, 3, '#3a76d8');   // 水面
    px(ox + 5, oy + 4, 6, 1, '#5a98ec');
  });
  def('lava_bucket', (ox, oy) => {
    activeCtx.clearRect(ox, oy, BASE, BASE);
    px(ox + 4, oy + 3, 8, 2, '#c8ccd4');
    px(ox + 3, oy + 5, 10, 2, '#b0b6c0');
    px(ox + 4, oy + 7, 8, 6, '#9aa0ac');
    px(ox + 5, oy + 13, 6, 1, '#787e8a');
    px(ox + 4, oy + 4, 8, 3, '#d84810');   // 溶岩面
    px(ox + 5, oy + 4, 6, 1, '#f07820');
  });

  /* ===== v0.5 追加: 桜・針葉樹 ===== */
  def('cherry_log_side', (ox, oy, rnd) => {
    fillTile(ox, oy, '#5a4a52');
    for (let x = 0; x < BASE; x += 3) px(ox + x, oy, 1, BASE, rnd() < 0.5 ? '#4a3c44' : '#6a5a62');
    speckle(ox, oy, ['#6a5a62', '#4a3c44'], 20, rnd);
  });
  def('cherry_log_top', (ox, oy, rnd) => {
    fillTile(ox, oy, '#8a6a62');
    px(ox + 3, oy + 3, 10, 10, '#a8847a');
    px(ox + 5, oy + 5, 6, 6, '#c09a8e');
    px(ox + 7, oy + 7, 2, 2, '#8a6a62');
    speckle(ox, oy, ['#9a7a70'], 10, rnd);
  });
  def('cherry_leaves', (ox, oy, rnd) => {
    fillTile(ox, oy, '#f0a8c0');
    speckle(ox, oy, ['#f5c0d0', '#e890b0', '#f8d0dc', '#e078a0'], 100, rnd);
  });
  def('cherry_planks', (ox, oy, rnd) => {
    fillTile(ox, oy, '#d8a8b0');
    for (let y = 0; y < BASE; y += 4) px(ox, oy + y, BASE, 1, '#c09098');
    speckle(ox, oy, ['#e0b8c0', '#c898a0'], 24, rnd);
  });
  def('spruce_log_side', (ox, oy, rnd) => {
    fillTile(ox, oy, '#3a2a1a');
    for (let x = 0; x < BASE; x += 2) px(ox + x, oy, 1, BASE, rnd() < 0.5 ? '#2e2012' : '#463522');
    speckle(ox, oy, ['#463522', '#2e2012'], 18, rnd);
  });
  def('spruce_log_top', (ox, oy, rnd) => {
    fillTile(ox, oy, '#5a4430');
    px(ox + 3, oy + 3, 10, 10, '#6a523c');
    px(ox + 5, oy + 5, 6, 6, '#7a6248');
    px(ox + 7, oy + 7, 2, 2, '#5a4430');
  });
  def('spruce_leaves', (ox, oy, rnd) => {
    fillTile(ox, oy, '#2a4a2a');
    speckle(ox, oy, ['#355a35', '#1e3a1e', '#3f6a3f', '#182a18'], 100, rnd);
  });

  /* ===== v0.11 追加: 新ブロック30種のテクスチャ ===== */
  // --- 石材 ---
  def('basalt', (ox, oy, rnd) => {
    fillTile(ox, oy, '#4a4a52');
    for (let x = 0; x < BASE; x += 3) px(ox + x, oy, 1, BASE, rnd() < 0.5 ? '#3c3c44' : '#585860');
    speckle(ox, oy, ['#404048', '#54545c'], 40, rnd);
  });
  def('basalt_smooth', (ox, oy, rnd) => {
    fillTile(ox, oy, '#55555e');
    speckle(ox, oy, ['#4e4e56', '#5e5e66'], 30, rnd);
  });
  def('andesite', (ox, oy, rnd) => {
    fillTile(ox, oy, '#8a8a8e');
    speckle(ox, oy, ['#95959a', '#7a7a7e', '#a0a0a4'], 60, rnd);
  });
  def('diorite', (ox, oy, rnd) => {
    fillTile(ox, oy, '#c8c8cc');
    speckle(ox, oy, ['#b8b8bc', '#d8d8dc', '#a8a8ac'], 55, rnd);
  });
  def('granite', (ox, oy, rnd) => {
    fillTile(ox, oy, '#9a6a58');
    speckle(ox, oy, ['#a87868', '#8a5c4c', '#b08070'], 55, rnd);
  });
  def('deepslate', (ox, oy, rnd) => {
    fillTile(ox, oy, '#3a3a40');
    speckle(ox, oy, ['#2e2e34', '#48484e'], 60, rnd);
  });
  def('sandstone', (ox, oy, rnd) => {
    fillTile(ox, oy, '#e0d0a0');
    speckle(ox, oy, ['#e8d8a8', '#d4c494', '#f0e0b0'], 45, rnd);
  });
  def('sandstone_top', (ox, oy, rnd) => {
    fillTile(ox, oy, '#e0d0a0');
    speckle(ox, oy, ['#e8d8a8', '#d4c494'], 30, rnd);
  });
  def('sandstone_side', (ox, oy, rnd) => {
    fillTile(ox, oy, '#e0d0a0');
    speckle(ox, oy, ['#e8d8a8', '#d4c494'], 35, rnd);
    for (let x = 0; x < BASE; x++) {
      const h = 1 + ((rnd() * 2) | 0);
      for (let y = 0; y < h; y++) px(ox + x, oy + BASE - 1 - y, 1, 1, '#c8b888');
    }
  });
  def('stone_bricks', (ox, oy, rnd) => {
    fillTile(ox, oy, '#7a7a7a');
    for (let y = 0; y < BASE; y += 4) {
      const off = (y / 4) % 2 === 0 ? 0 : 4;
      for (let x = 0; x < BASE; x += 8) px(ox + x + off, oy + y, 1, 4, '#6a6a6a');
      px(ox, oy + y, BASE, 1, '#6a6a6a');
    }
    speckle(ox, oy, ['#8a8a8a', '#6e6e6e'], 30, rnd);
  });
  def('mossy_stone_bricks', (ox, oy, rnd) => {
    painters[TILE.stone_bricks](ox, oy, rnd);
    blobs(ox, oy, '#4a7a3a', 8, 3, rnd);
    blobs(ox, oy, '#5a8a48', 6, 2, rnd);
  });
  def('cracked_stone_bricks', (ox, oy, rnd) => {
    painters[TILE.stone_bricks](ox, oy, rnd);
    px(ox + 3, oy + 2, 1, 4, '#5a5a5a'); px(ox + 9, oy + 7, 1, 5, '#5a5a5a');
    px(ox + 12, oy + 3, 1, 3, '#5a5a5a'); px(ox + 6, oy + 11, 1, 4, '#5a5a5a');
  });
  // --- 鉱石・鉱物 ---
  def('coal_block', (ox, oy, rnd) => {
    fillTile(ox, oy, '#1a1a1a');
    speckle(ox, oy, ['#242424', '#101010'], 50, rnd);
  });
  def('copper_ore_deepslate', (ox, oy, rnd) => {
    painters[TILE.deepslate](ox, oy, rnd);
    for (let i = 0; i < 4; i++) {
      const s = 2 + ((rnd() * 2) | 0);
      const x = 1 + ((rnd() * (BASE - s - 2)) | 0), y = 1 + ((rnd() * (BASE - s - 2)) | 0);
      px(ox + x, oy + y, s, s, '#c07848');
      px(ox + x, oy + y, 1, 1, '#9a5c34');
    }
  });
  def('iron_ore_deepslate', (ox, oy, rnd) => {
    painters[TILE.deepslate](ox, oy, rnd);
    for (let i = 0; i < 4; i++) {
      const s = 2 + ((rnd() * 2) | 0);
      const x = 1 + ((rnd() * (BASE - s - 2)) | 0), y = 1 + ((rnd() * (BASE - s - 2)) | 0);
      px(ox + x, oy + y, s, s, '#d8a878');
      px(ox + x, oy + y, 1, 1, '#a97b4e');
    }
  });
  def('gold_ore_deepslate', (ox, oy, rnd) => {
    painters[TILE.deepslate](ox, oy, rnd);
    for (let i = 0; i < 4; i++) {
      const s = 2 + ((rnd() * 2) | 0);
      const x = 1 + ((rnd() * (BASE - s - 2)) | 0), y = 1 + ((rnd() * (BASE - s - 2)) | 0);
      px(ox + x, oy + y, s, s, '#f5d33c');
      px(ox + x, oy + y, 1, 1, '#c9a018');
    }
  });
  def('diamond_ore_deepslate', (ox, oy, rnd) => {
    painters[TILE.deepslate](ox, oy, rnd);
    for (let i = 0; i < 4; i++) {
      const s = 2 + ((rnd() * 2) | 0);
      const x = 1 + ((rnd() * (BASE - s - 2)) | 0), y = 1 + ((rnd() * (BASE - s - 2)) | 0);
      px(ox + x, oy + y, s, s, '#5ce6de');
      px(ox + x, oy + y, 1, 1, '#2ba7a0');
    }
  });
  // --- 木材 ---
  def('spruce_planks', (ox, oy, rnd) => {
    fillTile(ox, oy, '#6a4a2c');
    for (let y = 0; y < BASE; y += 4) px(ox, oy + y, BASE, 1, '#543820');
    speckle(ox, oy, ['#78563a', '#5c4024'], 30, rnd);
  });
  def('dark_oak_log_side', (ox, oy, rnd) => {
    fillTile(ox, oy, '#3a2a1a');
    for (let x = 0; x < BASE; x++) {
      if (rnd() < 0.3) px(ox + x, oy, 1, BASE, rnd() < 0.5 ? '#2e2012' : '#463522');
    }
    speckle(ox, oy, ['#2e2012', '#4a3826'], 25, rnd);
  });
  def('dark_oak_log_top', (ox, oy, rnd) => {
    fillTile(ox, oy, '#5a4430');
    px(ox + 3, oy + 3, 10, 10, '#6a523c');
    px(ox + 5, oy + 5, 6, 6, '#7a6248');
    px(ox + 7, oy + 7, 2, 2, '#5a4430');
  });
  def('dark_oak_leaves', (ox, oy, rnd) => {
    activeCtx.clearRect(ox, oy, BASE, BASE);
    for (let y = 0; y < BASE; y++) {
      for (let x = 0; x < BASE; x++) {
        if (rnd() < 0.12) continue;
        const c = ['#2a4a1a', '#3a5a24', '#1e3a12', '#466a2e'][(rnd() * 4) | 0];
        px(ox + x, oy + y, 1, 1, c);
      }
    }
  });
  def('dark_oak_planks', (ox, oy, rnd) => {
    fillTile(ox, oy, '#4a3020');
    for (let y = 0; y < BASE; y += 4) px(ox, oy + y, BASE, 1, '#382418');
    speckle(ox, oy, ['#563a28', '#402a1c'], 30, rnd);
  });
  // --- 装飾・自然 ---
  def('prismarine', (ox, oy, rnd) => {
    fillTile(ox, oy, '#5a9a8a');
    for (let y = 0; y < BASE; y += 4) px(ox, oy + y, BASE, 1, '#4a8a7a');
    for (let x = 0; x < BASE; x += 8) px(ox + x, oy, 1, BASE, '#4a8a7a');
    speckle(ox, oy, ['#6aaaaa', '#4a7a6a'], 35, rnd);
  });
  def('prismarine_bricks', (ox, oy, rnd) => {
    fillTile(ox, oy, '#6aaaaa');
    for (let y = 0; y < BASE; y += 4) {
      const off = (y / 4) % 2 === 0 ? 0 : 4;
      for (let x = 0; x < BASE; x += 8) px(ox + x + off, oy + y, 1, 4, '#5a9a9a');
      px(ox, oy + y, BASE, 1, '#5a9a9a');
    }
  });
  def('sea_lantern', (ox, oy, rnd) => {
    fillTile(ox, oy, '#c8e8e8');
    speckle(ox, oy, ['#d8f0f0', '#b8d8d8'], 40, rnd);
    px(ox + 2, oy + 2, BASE - 4, BASE - 4, '#e8f8f8');
    speckle(ox, oy, ['#f0ffff'], 20, rnd);
  });
  def('glowstone', (ox, oy, rnd) => {
    fillTile(ox, oy, '#a87840');
    blobs(ox, oy, '#e8c860', 10, 3, rnd);
    blobs(ox, oy, '#f0d878', 8, 2, rnd);
    speckle(ox, oy, ['#c09050', '#906030'], 30, rnd);
  });
  def('shroomlight', (ox, oy, rnd) => {
    fillTile(ox, oy, '#e8a030');
    blobs(ox, oy, '#f0c050', 8, 3, rnd);
    blobs(ox, oy, '#f8e080', 6, 2, rnd);
    speckle(ox, oy, ['#d89028', '#f0b840'], 35, rnd);
  });
  def('soul_sand', (ox, oy, rnd) => {
    fillTile(ox, oy, '#6a4a38');
    speckle(ox, oy, ['#7a5a48', '#5a3a2c', '#8a6a58'], 60, rnd);
    blobs(ox, oy, '#4a3226', 6, 2, rnd);
  });
  def('nether_bricks', (ox, oy, rnd) => {
    fillTile(ox, oy, '#3a1a1a');
    for (let y = 0; y < BASE; y += 4) {
      const off = (y / 4) % 2 === 0 ? 0 : 4;
      for (let x = 0; x < BASE; x += 8) px(ox + x + off, oy + y, 1, 4, '#2a1212');
      px(ox, oy + y, BASE, 1, '#2a1212');
    }
  });
  def('netherrack', (ox, oy, rnd) => {
    fillTile(ox, oy, '#7a3a30');
    speckle(ox, oy, ['#8a4a40', '#6a2e26', '#9a5a4e'], 70, rnd);
  });
  // --- 植物 ---
  def('azalea_leaves', (ox, oy, rnd) => {
    activeCtx.clearRect(ox, oy, BASE, BASE);
    for (let y = 0; y < BASE; y++) {
      for (let x = 0; x < BASE; x++) {
        if (rnd() < 0.1) continue;
        const c = ['#5a9a4a', '#6aaa5a', '#4a8a3e', '#7aba6a'][(rnd() * 4) | 0];
        px(ox + x, oy + y, 1, 1, c);
      }
    }
  });
  def('flowering_azalea_leaves', (ox, oy, rnd) => {
    painters[TILE.azalea_leaves](ox, oy, rnd);
    for (let i = 0; i < 8; i++) {
      const x = 1 + ((rnd() * 14) | 0), y = 1 + ((rnd() * 14) | 0);
      px(ox + x, oy + y, 1, 1, '#f0a0c0');
      if (rnd() < 0.5) px(ox + x + 1, oy + y, 1, 1, '#f5b8d0');
    }
  });
  def('spore_blossom', (ox, oy, rnd) => {
    activeCtx.clearRect(ox, oy, BASE, BASE);
    // 中心の花
    px(ox + 6, oy + 6, 4, 4, '#e8a0c0');
    px(ox + 7, oy + 7, 2, 2, '#f0c0d8');
    // 葉
    for (const [dx, dy] of [[5, 7], [10, 7], [7, 5], [7, 10]]) px(ox + dx, oy + dy, 2, 2, '#6aaa5a');
    // 胞子
    for (let i = 0; i < 6; i++) {
      const x = (rnd() * BASE) | 0, y = (rnd() * BASE) | 0;
      px(ox + x, oy + y, 1, 1, '#f0d0e0');
    }
  });
  def('dripleaf', (ox, oy, rnd) => {
    activeCtx.clearRect(ox, oy, BASE, BASE);
    // 茎
    px(ox + 7, oy + 2, 2, 12, '#5a8a4a');
    // 葉
    px(ox + 4, oy + 4, 8, 4, '#6aaa5a');
    px(ox + 5, oy + 8, 6, 3, '#7aba6a');
  });
  def('lily_pad', (ox, oy, rnd) => {
    activeCtx.clearRect(ox, oy, BASE, BASE);
    // 円形のパッド
    for (let y = 0; y < BASE; y++) {
      for (let x = 0; x < BASE; x++) {
        const dx = x - 7.5, dy = y - 7.5;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < 6.5 && !(x > 10 && y < 5)) { // 切れ込み
          const c = d > 5.5 ? '#3a7a2a' : (rnd() < 0.3 ? '#4a9a3a' : '#5aaa4a');
          px(ox + x, oy + y, 1, 1, c);
        }
      }
    }
  });
  def('moss_carpet', (ox, oy, rnd) => {
    activeCtx.clearRect(ox, oy, BASE, BASE);
    fillTile(ox, oy, '#4a7a3a');
    speckle(ox, oy, ['#5a8a48', '#3a6a2e'], 50, rnd);
  });
  // --- 建築 ---
  def('bookshelf_top', (ox, oy, rnd) => {
    fillTile(ox, oy, '#c29a5f');
    for (let y = 0; y < BASE; y += 4) px(ox, oy + y, BASE, 1, '#a37a45');
  });
  def('note_block', (ox, oy, rnd) => {
    fillTile(ox, oy, '#6a4a2c');
    speckle(ox, oy, ['#78563a', '#5c4024'], 30, rnd);
    px(ox + 5, oy + 5, 6, 6, '#4a3020');
    px(ox + 6, oy + 6, 4, 4, '#6a5a4a');
    px(ox + 7, oy + 7, 2, 2, '#8a7a6a');
  });
  def('jukebox', (ox, oy, rnd) => {
    fillTile(ox, oy, '#6a4a2c');
    speckle(ox, oy, ['#78563a', '#5c4024'], 30, rnd);
    px(ox + 2, oy + 2, 12, 12, '#4a3020');
    px(ox + 3, oy + 3, 10, 10, '#8a6a5a');
    px(ox + 4, oy + 4, 8, 8, '#3a2418');
    px(ox + 5, oy + 5, 6, 6, '#2a1a10');
  });
  def('pumpkin_carved_top', (ox, oy, rnd) => {
    painters[TILE.pumpkin_top](ox, oy, rnd);
  });
  def('pumpkin_carved_side', (ox, oy, rnd) => {
    painters[TILE.pumpkin_side](ox, oy, rnd);
    // 目
    px(ox + 3, oy + 4, 2, 3, '#1a1a1a');
    px(ox + 11, oy + 4, 2, 3, '#1a1a1a');
    // 鼻
    px(ox + 7, oy + 7, 2, 2, '#1a1a1a');
    // 口
    px(ox + 3, oy + 10, 2, 2, '#1a1a1a');
    px(ox + 5, oy + 11, 6, 2, '#1a1a1a');
    px(ox + 11, oy + 10, 2, 2, '#1a1a1a');
  });
  def('lantern', (ox, oy, rnd) => {
    activeCtx.clearRect(ox, oy, BASE, BASE);
    // フレーム
    px(ox + 4, oy + 3, 8, 2, '#5a4a38');
    px(ox + 4, oy + 11, 8, 2, '#5a4a38');
    px(ox + 4, oy + 3, 2, 10, '#5a4a38');
    px(ox + 10, oy + 3, 2, 10, '#5a4a38');
    // 火
    px(ox + 6, oy + 5, 4, 6, '#f0c050');
    px(ox + 7, oy + 6, 2, 4, '#f8e080');
    // チェーン
    px(ox + 7, oy, 2, 3, '#4a4a4a');
  });
  // --- 鉱石 (深層岩) の続き ---
  def('lapis_ore_deepslate', (ox, oy, rnd) => {
    painters[TILE.deepslate](ox, oy, rnd);
    for (let i = 0; i < 4; i++) {
      const s = 2 + ((rnd() * 2) | 0);
      const x = 1 + ((rnd() * (BASE - s - 2)) | 0), y = 1 + ((rnd() * (BASE - s - 2)) | 0);
      px(ox + x, oy + y, s, s, '#4a6ac0');
      px(ox + x, oy + y, 1, 1, '#38509a');
    }
  });
  def('redstone_ore_deepslate', (ox, oy, rnd) => {
    painters[TILE.deepslate](ox, oy, rnd);
    for (let i = 0; i < 4; i++) {
      const s = 2 + ((rnd() * 2) | 0);
      const x = 1 + ((rnd() * (BASE - s - 2)) | 0), y = 1 + ((rnd() * (BASE - s - 2)) | 0);
      px(ox + x, oy + y, s, s, '#e04040');
      px(ox + x, oy + y, 1, 1, '#a02828');
    }
  });
  def('emerald_ore_deepslate', (ox, oy, rnd) => {
    painters[TILE.deepslate](ox, oy, rnd);
    for (let i = 0; i < 4; i++) {
      const s = 2 + ((rnd() * 2) | 0);
      const x = 1 + ((rnd() * (BASE - s - 2)) | 0), y = 1 + ((rnd() * (BASE - s - 2)) | 0);
      px(ox + x, oy + y, s, s, '#40c060');
      px(ox + x, oy + y, 1, 1, '#2a9044');
    }
  });
  def('copper_block_oxidized', (ox, oy, rnd) => {
    fillTile(ox, oy, '#4a8a7a');
    speckle(ox, oy, ['#5a9a8a', '#3a7a6a', '#6aaaaa'], 50, rnd);
  });

  /* ===== v0.12 追加: 珊瑚・海草 (交差プレーン用・枝状のシルエット) ===== */
  function coralPainter(base, light, dark) {
    return (ox, oy, rnd) => {
      activeCtx.clearRect(ox, oy, BASE, BASE);
      // 中央から枝分かれする珊瑚のシルエット
      const cx = ox + 8;
      // 幹
      for (let y = 15; y >= 4; y--) px(cx - 1, oy + y, 2, 1, y % 3 ? base : dark);
      // 左右の枝
      for (let i = 0; i < 4; i++) {
        const by = 12 - i * 2;
        const len = 3 + ((rnd() * 3) | 0);
        for (let k = 0; k < len; k++) {
          px(cx - 2 - k, oy + by - ((k * 0.6) | 0), 1, 1, k % 2 ? light : base);
          px(cx + 1 + k, oy + by - ((k * 0.6) | 0), 1, 1, k % 2 ? light : base);
        }
      }
      // 先端の房
      px(cx - 2, oy + 2, 4, 2, light);
      px(cx - 3, oy + 3, 6, 1, base);
    };
  }
  def('coral_red', coralPainter('#e05545', '#f47a68', '#b83a30'));
  def('coral_blue', coralPainter('#3a7bd5', '#5fa0ec', '#2c5aa8'));
  def('coral_pink', coralPainter('#ef7fb4', '#f8a4cc', '#cf5a92'));
  def('coral_yellow', coralPainter('#e8c33a', '#f4dc6a', '#c39a20'));
  def('sea_grass', (ox, oy, rnd) => {
    activeCtx.clearRect(ox, oy, BASE, BASE);
    for (let i = 0; i < 6; i++) {
      const gx = ox + 2 + ((rnd() * 12) | 0);
      const h = 6 + ((rnd() * 8) | 0);
      for (let y = 15; y > 15 - h; y--) {
        const sway = ((15 - y) * 0.3 + i) | 0;
        px(gx + (sway % 2), oy + y, 1, 1, ['#2e8b57', '#3aa06a', '#247048'][(rnd() * 3) | 0]);
      }
    }
  });

  /* ===== v0.13 追加: 新バイオーム用テクスチャ ===== */
  // --- 氷山 ---
  def('packed_ice', (ox, oy, rnd) => {
    fillTile(ox, oy, '#7aaee0');
    speckle(ox, oy, ['#8cbcea', '#68a0d4', '#a0cdef'], 70, rnd);
    px(ox + 2, oy + 4, 7, 1, '#e8f4fb'); px(ox + 9, oy + 11, 5, 1, '#e8f4fb');
  });
  def('blue_ice', (ox, oy, rnd) => {
    fillTile(ox, oy, '#4a90e2');
    speckle(ox, oy, ['#5aa0ec', '#3a80d2', '#74b4f4'], 70, rnd);
    px(ox + 4, oy + 3, 8, 2, '#d8eafc'); px(ox + 6, oy + 6, 5, 1, '#bcd8f8');
    px(ox + 3, oy + 10, 7, 1, '#e0f0fc');
  });
  // --- きのこ島 ---
  def('mycelium_top', (ox, oy, rnd) => {
    fillTile(ox, oy, '#8d7a92');
    speckle(ox, oy, ['#9a87a0', '#7e6c84', '#a795ac', '#6e5c74'], 80, rnd);
    for (let i = 0; i < 6; i++) {
      const x = (rnd() * 14) | 0, y = (rnd() * 14) | 0;
      px(ox + x, oy + y, 2, 1, '#5f9e5a');   // 緑の胞子
    }
  });
  def('mycelium_side', (ox, oy, rnd) => {
    fillTile(ox, oy, '#9a6c4c');
    speckle(ox, oy, ['#a87a58', '#8a5c40'], 50, rnd);
    for (let x = 0; x < BASE; x++) {
      const h = 3 + ((rnd() * 3) | 0);
      for (let y = 0; y < h; y++) px(ox + x, oy + y, 1, 1, ['#8d7a92', '#7e6c84', '#9a87a0'][(rnd() * 3) | 0]);
    }
  });
  def('mushroom_stem', (ox, oy, rnd) => {
    fillTile(ox, oy, '#d8d0bc');
    speckle(ox, oy, ['#c9c0ac', '#e4dcc8', '#b8b09c'], 60, rnd);
    for (let x = 1; x < BASE; x += 5) px(ox + x, oy, 1, BASE, '#bfb69f');
  });
  def('mushroom_block_red', (ox, oy, rnd) => {
    fillTile(ox, oy, '#c93a2a');
    speckle(ox, oy, ['#b8322a', '#d84a3a'], 40, rnd);
    for (let i = 0; i < 6; i++) {
      const x = 1 + ((rnd() * 12) | 0), y = 1 + ((rnd() * 12) | 0);
      px(ox + x, oy + y, 3, 3, '#f2ede2');
    }
  });
  def('mushroom_block_brown', (ox, oy, rnd) => {
    fillTile(ox, oy, '#8a6a4a');
    speckle(ox, oy, ['#7a5c3e', '#987856', '#6b5038'], 60, rnd);
  });
  // --- メサ ---
  function terracottaTile(color, dark, light) {
    return (ox, oy, rnd) => {
      fillTile(ox, oy, color);
      speckle(ox, oy, [dark, light], 55, rnd);
    };
  }
  def('terracotta_red', terracottaTile('#9e4a38', '#8a4030', '#ae5644'));
  def('terracotta_orange', terracottaTile('#c06a3a', '#aa5c30', '#d07a48'));
  def('terracotta_yellow', terracottaTile('#d0964a', '#bc8640', '#daa658'));
  def('terracotta_brown', terracottaTile('#6e4a34', '#5e3e2c', '#7e5640'));
  def('terracotta_white', terracottaTile('#d8bfa8', '#c6ac96', '#e6ccb8'));
  def('red_sand', (ox, oy, rnd) => {
    fillTile(ox, oy, '#c06236');
    speckle(ox, oy, ['#cc7040', '#b0542c', '#d88050'], 70, rnd);
  });
  def('dead_bush', (ox, oy, rnd) => {
    activeCtx.clearRect(ox, oy, BASE, BASE);
    const stem = '#8a6a42', branch = '#9a7a52';
    px(ox + 7, oy + 9, 2, 7, stem);
    px(ox + 4, oy + 6, 2, 6, branch); px(ox + 10, oy + 5, 2, 7, branch);
    px(ox + 2, oy + 4, 2, 4, stem); px(ox + 12, oy + 3, 2, 5, stem);
    px(ox + 5, oy + 3, 2, 3, branch); px(ox + 9, oy + 2, 2, 4, branch);
    px(ox + 3, oy + 7, 3, 1, stem); px(ox + 10, oy + 8, 3, 1, stem);
  });
  // --- 繁茂した洞窟 / ディープダーク ---
  def('glow_berry_vine', (ox, oy, rnd) => {
    activeCtx.clearRect(ox, oy, BASE, BASE);
    // 垂れ下がる蔓
    for (let i = 0; i < 3; i++) {
      const x = 3 + i * 5;
      for (let y = 0; y < 13; y++) px(ox + x, oy + y, 1, 1, y % 2 ? '#3f7430' : '#50923e');
    }
    // 光る実
    px(ox + 3, oy + 9, 3, 3, '#f2c14e'); px(ox + 4, oy + 10, 1, 1, '#fbe08a');
    px(ox + 9, oy + 11, 3, 3, '#f2c14e'); px(ox + 10, oy + 12, 1, 1, '#fbe08a');
    px(ox + 11, oy + 5, 3, 3, '#eda93a'); px(ox + 12, oy + 6, 1, 1, '#fbe08a');
  });
  def('sculk', (ox, oy, rnd) => {
    fillTile(ox, oy, '#0a1420');
    speckle(ox, oy, ['#101d2c', '#060d16', '#16283a'], 80, rnd);
    for (let i = 0; i < 7; i++) {
      const x = (rnd() * 14) | 0, y = (rnd() * 14) | 0;
      px(ox + x, oy + y, 2, 1, '#1f6a72');   // 青緑の発光筋
    }
  });
  def('sculk_catalyst_top', (ox, oy, rnd) => {
    painters[TILE.sculk](ox, oy, rnd);
    // 中央の骨のような白い格子
    px(ox + 5, oy + 5, 6, 6, '#b8c4c0');
    px(ox + 6, oy + 6, 4, 4, '#0a1420');
    px(ox + 7, oy + 7, 2, 2, '#2fd8c8');
  });
  def('sculk_catalyst_side', (ox, oy, rnd) => {
    painters[TILE.sculk](ox, oy, rnd);
    for (let y = 2; y < BASE; y += 4) px(ox, oy + y, BASE, 1, '#1f6a72');
  });
  // --- 海の構造物 ---
  def('dark_prismarine', (ox, oy, rnd) => {
    fillTile(ox, oy, '#2c5048');
    for (let y = 0; y < BASE; y += 4) px(ox, oy + y, BASE, 1, '#22403a');
    for (let x = 0; x < BASE; x += 8) px(ox + x, oy, 1, BASE, '#22403a');
    speckle(ox, oy, ['#35605a', '#1e3833'], 40, rnd);
  });
  def('gold_trimmed_obsidian', (ox, oy, rnd) => {
    fillTile(ox, oy, '#17101f');
    speckle(ox, oy, ['#221733', '#0d0817', '#2c1f42'], 60, rnd);
    px(ox, oy, BASE, 1, '#d8a83c'); px(ox, oy + BASE - 1, BASE, 1, '#d8a83c');
    px(ox, oy, 1, BASE, '#d8a83c'); px(ox + BASE - 1, oy, 1, BASE, '#d8a83c');
    px(ox + 2, oy + 2, 2, 2, '#f0c860'); px(ox + BASE - 4, oy + 2, 2, 2, '#f0c860');
    px(ox + 2, oy + BASE - 4, 2, 2, '#f0c860'); px(ox + BASE - 4, oy + BASE - 4, 2, 2, '#f0c860');
  });
  // --- 炎 (交差プレーン) ---
  def('fire', (ox, oy, rnd) => {
    activeCtx.clearRect(ox, oy, BASE, BASE);
    // 炎のシルエット (外側オレンジ→内側黄→芯白)
    const flame = [
      [7, 2, '#f8e878'], [6, 3, '#f8e878'], [8, 4, '#f8d050'],
      [5, 5, '#f0a830'], [6, 5, '#f8e878'], [7, 6, '#fbe898'],
      [9, 6, '#f0a830'], [4, 7, '#e08820'], [5, 7, '#f8d050'],
      [6, 8, '#f8e878'], [8, 8, '#f8d050'], [10, 8, '#e08820'],
      [4, 9, '#e08820'], [5, 10, '#f0a830'], [6, 10, '#f8d050'],
      [8, 10, '#f8d050'], [9, 11, '#f0a830'], [5, 12, '#e08820'],
      [6, 13, '#f0a830'], [7, 12, '#f0a830'], [8, 13, '#e08820'],
      [9, 12, '#e08820'], [6, 14, '#c96a10'], [7, 15, '#c96a10'], [8, 14, '#c96a10']
    ];
    for (const [x, y, c] of flame) px(ox + x, oy + y, 1, 1, c);
    // 小さな火の粉
    px(ox + 3, oy + 3, 1, 1, '#f8d050'); px(ox + 12, oy + 5, 1, 1, '#f0a830');
  });
  // --- v0.13.1: ネザー次元 ---
  // ポータル (紫の渦・半透明)
  def('portal', (ox, oy, rnd) => {
    activeCtx.clearRect(ox, oy, BASE, BASE);
    // 縦の渦ストライプ (濃い紫〜明るい紫)
    for (let x = 0; x < BASE; x++) {
      const phase = Math.sin(x * 0.9) * 0.5 + 0.5;
      const c = phase > 0.7 ? '#b070f0' : phase > 0.4 ? '#8a4ad0' : phase > 0.2 ? '#6a2ab0' : '#4a1a80';
      for (let y = 0; y < BASE; y++) {
        // 斜めの揺らぎで渦感を出す
        const wob = Math.sin((y * 0.7) + x * 0.4) * 0.25;
        px(ox + x, oy + y, 1, 1, rnd() < 0.06 + wob * 0.2 ? '#d8a8f8' : c);
      }
    }
    // 明るい粒
    for (let i = 0; i < 8; i++) {
      const x = (rnd() * BASE) | 0, y = (rnd() * BASE) | 0;
      px(ox + x, oy + y, 1, 1, '#e8c8ff');
    }
  });
  def('nether_gold_ore', (ox, oy, rnd) => {
    painters[TILE.netherrack](ox, oy, rnd);
    for (let i = 0; i < 5; i++) {
      const s = 2 + ((rnd() * 2) | 0);
      const x = 1 + ((rnd() * (BASE - s - 2)) | 0), y = 1 + ((rnd() * (BASE - s - 2)) | 0);
      px(ox + x, oy + y, s, s, '#f0c040');
      px(ox + x, oy + y, 1, 1, '#fbe88a');
    }
  });
  def('nether_quartz_ore', (ox, oy, rnd) => {
    painters[TILE.netherrack](ox, oy, rnd);
    for (let i = 0; i < 5; i++) {
      const s = 2 + ((rnd() * 2) | 0);
      const x = 1 + ((rnd() * (BASE - s - 2)) | 0), y = 1 + ((rnd() * (BASE - s - 2)) | 0);
      px(ox + x, oy + y, s, s, '#e8dcd0');
      px(ox + x, oy + y, 1, 1, '#fbf4ea');
    }
  });
  // --- アイテム ---
  def('snowball', (ox, oy) => {
    activeCtx.clearRect(ox, oy, BASE, BASE);
    px(ox + 5, oy + 5, 6, 6, '#f0f4f8');
    px(ox + 6, oy + 6, 3, 3, '#ffffff');
    px(ox + 5, oy + 10, 6, 1, '#ccd6e0');
  });
  def('glow_berries', (ox, oy) => {
    activeCtx.clearRect(ox, oy, BASE, BASE);
    px(ox + 7, oy + 2, 2, 4, '#4d9e3a');
    px(ox + 4, oy + 6, 3, 3, '#f2c14e'); px(ox + 5, oy + 7, 1, 1, '#fbe08a');
    px(ox + 9, oy + 8, 3, 3, '#f2c14e'); px(ox + 10, oy + 9, 1, 1, '#fbe08a');
    px(ox + 6, oy + 11, 3, 3, '#eda93a'); px(ox + 7, oy + 12, 1, 1, '#fbe08a');
  });
  // v0.13.1: 金塊 (小さな金の粒)
  def('gold_nugget', (ox, oy) => {
    activeCtx.clearRect(ox, oy, BASE, BASE);
    px(ox + 6, oy + 6, 4, 4, '#f0c040');
    px(ox + 7, oy + 7, 2, 2, '#fbe88a');
    px(ox + 6, oy + 10, 4, 1, '#c89828');
  });
  /* ===== v0.13.2: エンド次元 ===== */
  // エンドストーン (淡い黄緑がかった石)
  def('end_stone', (ox, oy, rnd) => {
    fillTile(ox, oy, '#d8d8a8');
    speckle(ox, oy, ['#e0e0b0', '#c8c898', '#d0d09a', '#e8e8bc'], 70, rnd);
    blobs(ox, oy, '#c0c090', 5, 2, rnd);
  });
  // エンドポータル (星空・黒い宇宙に瞬く星)
  def('end_portal', (ox, oy, rnd) => {
    fillTile(ox, oy, '#05050c');
    speckle(ox, oy, ['#0a0a18', '#000004'], 30, rnd);
    // 瞬く星 (白・水色・紫)
    for (let i = 0; i < 18; i++) {
      const x = (rnd() * BASE) | 0, y = (rnd() * BASE) | 0;
      const c = ['#ffffff', '#c0e0ff', '#d0c0ff', '#e8f0ff'][(rnd() * 4) | 0];
      px(ox + x, oy + y, 1, 1, c);
      if (rnd() < 0.3) px(ox + x, oy + y, 1, 1, '#ffffff');
    }
  });
  // エンドポータルフレーム (緑がかった装飾石)
  def('end_frame', (ox, oy, rnd) => {
    fillTile(ox, oy, '#5a6a50');
    speckle(ox, oy, ['#4e5e46', '#66785c', '#54644a'], 55, rnd);
    // 上面の装飾 (エンダーアイの模様)
    px(ox + 3, oy + 3, 10, 10, '#3e4a38');
    px(ox + 5, oy + 5, 6, 6, '#6a8a5a');
    px(ox + 6, oy + 7, 4, 2, '#9ab87a');
    px(ox + 7, oy + 6, 2, 4, '#9ab87a');
  });
  // 黒曜石柱の先端 (エンドクリスタルの台座)
  def('end_crystal_base', (ox, oy, rnd) => {
    painters[TILE.bedrock] ? painters[TILE.bedrock](ox, oy, rnd) : fillTile(ox, oy, '#3a3a3a');
    px(ox + 2, oy + 2, 12, 3, '#5a4a6a');
    px(ox + 3, oy + 3, 10, 1, '#7a6a9a');
  });
  // ドラゴンの卵 (黒い卵に紫の斑点)
  def('dragon_egg', (ox, oy, rnd) => {
    activeCtx.clearRect(ox, oy, BASE, BASE);
    fillTile(ox, oy, '#18181f');
    speckle(ox, oy, ['#22222c', '#101018'], 40, rnd);
    blobs(ox, oy, '#4a3a6a', 5, 2, rnd);
    px(ox + 5, oy + 4, 2, 2, '#6a5a9a');
  });

  /* ---------- 描画実行 (解像度可変) ---------- */
  let dataURL = '';
  function render() {
    canvas.width = TS * COLS;
    canvas.height = TS * ROWS;
    ctx.imageSmoothingEnabled = false;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const S = TS / 16;
    const rnd = mulberry32(12345);
    if (TS >= 16) {
      // 等倍・拡大: 16px 基準座標を S 倍でスケーリングして直接描画
      setActiveCtx(ctx);
      ctx.setTransform(S, 0, 0, S, 0, 0);
      for (let i = 0; i < painters.length; i++) {
        painters[i]((i % COLS) * 16, Math.floor(i / COLS) * 16, rnd);
      }
      ctx.setTransform(1, 0, 0, 1, 0, 0);
    } else {
      // 縮小 (8px など): 16px の中間キャンバスに等倍で描いてから縮小転写する
      // (サブピクセルの fillRect が抜け落ちてタイルが疎になるのを防ぐ)
      const tmp = render._tmp || (render._tmp = document.createElement('canvas'));
      tmp.width = 16 * COLS; tmp.height = 16 * ROWS;
      const tctx = tmp.getContext('2d');
      tctx.imageSmoothingEnabled = false;
      tctx.setTransform(1, 0, 0, 1, 0, 0);
      tctx.clearRect(0, 0, tmp.width, tmp.height);
      setActiveCtx(tctx);
      for (let i = 0; i < painters.length; i++) {
        painters[i]((i % COLS) * 16, Math.floor(i / COLS) * 16, rnd);
      }
      setActiveCtx(ctx);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(tmp, 0, 0, tmp.width, tmp.height, 0, 0, canvas.width, canvas.height);
      ctx.imageSmoothingEnabled = false;
      // 半透明の端を不透明化 (葉の隙間の alpha=0 は保持)
      const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const d = img.data;
      for (let i = 0; i < d.length; i += 4) {
        if (d[i + 3] > 0 && d[i + 3] < 255) d[i + 3] = 255;
      }
      ctx.putImageData(img, 0, 0);
    }

    dataURL = canvas.toDataURL('image/png');
    document.documentElement.style.setProperty('--atlas', `url(${dataURL})`);
  }

  /** 解像度を変更してアトラスを再描画 (任意の整数 px、実用上は 8 / 16 / 32) */
  function setResolution(ts) {
    ts = Math.max(2, Math.min(64, ts | 0));
    TS = ts;
    render();
  }

  render();  // 初期描画 (TS=16)

  /** UI 用: タイル番号から background-position を返す */
  function iconPosition(tile) {
    const col = tile % COLS, row = Math.floor(tile / COLS);
    return `${(col * 100) / (COLS - 1)}% ${(row * 100) / (ROWS - 1)}%`;
  }

  /** three.js テクスチャ */
  function makeThreeTexture() {
    const tex = new THREE.CanvasTexture(canvas);
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestMipmapNearestFilter;
    tex.generateMipmaps = true;
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
    if ('encoding' in tex) tex.encoding = THREE.sRGBEncoding;
    return tex;
  }

  /** UVパディング (mipmapのにじみ防止) — TS が変わっても常に 0.5px 分 */
  function uvRect(tile) {
    const PAD = 0.5 / (TS * COLS);
    const col = tile % COLS, row = Math.floor(tile / COLS);
    const u0 = col / COLS + PAD, v0 = 1 - (row + 1) / ROWS + PAD;
    const u1 = (col + 1) / COLS - PAD, v1 = 1 - row / ROWS - PAD;
    return [u0, v0, u1, v1];
  }

  /** 現在のタイルサイズ (px) */
  function getTS() { return TS; }

  global.Textures = { canvas, get dataURL() { return dataURL; }, TILE, COLS, ROWS, get TS() { return TS; }, iconPosition, makeThreeTexture, uvRect, render, setResolution, getTS };
})(window);
