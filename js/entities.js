/* ==========================================================
   entities.js — ドロップアイテム / モブ (ゾンビ・ブタ・ヒツジ)
   ========================================================== */
(function (global) {
  'use strict';
  const B = Blocks;
  const ID = Blocks.BLOCK_ID;

  /* ---------- 共通: AABB移動 (ボクセルスウィープ) ---------- */
  function moveAABB(world, pos, vel, hw, h, dt) {
    const sc = { x: pos.x, y: pos.y, z: pos.z };
    const r = SweepCollision.sweepMove(world, sc, hw, h,
      { x: vel.x * dt, y: vel.y * dt, z: vel.z * dt });
    pos.x = sc.x; pos.y = sc.y; pos.z = sc.z;
    return r;
  }

  /* ---------- ドロップアイテム ---------- */
  const dropMaterialCache = new Map();

  function makeDropMesh(itemId, atlasTexture) {
    const def = Blocks.itemDef(itemId);
    if (!def) return null;
    if (def.type === 'block') {
      const b = B.get(def.block);
      const geo = new THREE.BoxGeometry(0.28, 0.28, 0.28);
      const uv = geo.attributes.uv;
      const faceTiles = [b.tiles.side, b.tiles.side, b.tiles.top, b.tiles.bottom, b.tiles.side, b.tiles.side];
      for (let f = 0; f < 6; f++) {
        const [u0, v0, u1, v1] = Textures.uvRect(faceTiles[f]);
        for (let i = 0; i < 4; i++) {
          const k = f * 4 + i;
          const su = uv.getX(k), sv = uv.getY(k);
          uv.setXY(k, u0 + su * (u1 - u0), v0 + sv * (v1 - v0));
        }
      }
      uv.needsUpdate = true;
      let mat = dropMaterialCache.get('block');
      if (!mat) {
        mat = new THREE.MeshLambertMaterial({ map: atlasTexture, alphaTest: 0.5 });
        dropMaterialCache.set('block', mat);
      }
      return new THREE.Mesh(geo, mat);
    }
    // アイテムは板ポリ
    const geo = new THREE.PlaneGeometry(0.32, 0.32);
    const [u0, v0, u1, v1] = Textures.uvRect(def.tile);
    const uv = geo.attributes.uv;
    for (let i = 0; i < uv.count; i++) {
      const su = uv.getX(i), sv = uv.getY(i);
      uv.setXY(i, u0 + su * (u1 - u0), v0 + sv * (v1 - v0));
    }
    uv.needsUpdate = true;
    let mat = dropMaterialCache.get('item');
    if (!mat) {
      mat = new THREE.MeshBasicMaterial({ map: atlasTexture, alphaTest: 0.5, side: THREE.DoubleSide });
      dropMaterialCache.set('item', mat);
    }
    return new THREE.Mesh(geo, mat);
  }

  /* ---------- モブのモデル ---------- */
  function boxPart(w, h, d, color, x, y, z) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshLambertMaterial({ color }));
    m.position.set(x, y, z);
    return m;
  }

  function buildZombie() {
    const g = new THREE.Group();
    const legL = boxPart(0.28, 0.75, 0.28, 0x2c3f7a, -0.15, 0.375, 0);
    const legR = boxPart(0.28, 0.75, 0.28, 0x2c3f7a, 0.15, 0.375, 0);
    const body = boxPart(0.6, 0.72, 0.32, 0x2f7a4f, 0, 1.11, 0);
    const head = boxPart(0.5, 0.5, 0.5, 0x63a35d, 0, 1.72, 0);
    const armL = boxPart(0.22, 0.68, 0.24, 0x63a35d, -0.42, 1.3, -0.25);
    const armR = boxPart(0.22, 0.68, 0.24, 0x63a35d, 0.42, 1.3, -0.25);
    armL.rotation.x = armR.rotation.x = -1.4;
    g.add(legL, legR, body, head, armL, armR);
    return { group: g, legL, legR, head };
  }

  function buildPig() {
    const g = new THREE.Group();
    const body = boxPart(0.62, 0.55, 0.95, 0xe9a0a8, 0, 0.62, 0);
    const head = boxPart(0.5, 0.45, 0.42, 0xefaab2, 0, 0.72, -0.62);
    const snout = boxPart(0.22, 0.18, 0.1, 0xd98b95, 0, 0.66, -0.86);
    const legL = boxPart(0.2, 0.36, 0.2, 0xd98b95, -0.2, 0.18, -0.3);
    const legR = boxPart(0.2, 0.36, 0.2, 0xd98b95, 0.2, 0.18, -0.3);
    const legL2 = boxPart(0.2, 0.36, 0.2, 0xd98b95, -0.2, 0.18, 0.32);
    const legR2 = boxPart(0.2, 0.36, 0.2, 0xd98b95, 0.2, 0.18, 0.32);
    g.add(body, head, snout, legL, legR, legL2, legR2);
    return { group: g, legL, legR, legL2, legR2, head };
  }

  function buildSheep() {
    const g = new THREE.Group();
    const body = boxPart(0.7, 0.68, 1.05, 0xf1f1ef, 0, 0.75, 0);
    const head = boxPart(0.38, 0.4, 0.38, 0xd6cfc7, 0, 0.92, -0.66);
    const legL = boxPart(0.18, 0.5, 0.18, 0xd6cfc7, -0.22, 0.25, -0.3);
    const legR = boxPart(0.18, 0.5, 0.18, 0xd6cfc7, 0.22, 0.25, -0.3);
    const legL2 = boxPart(0.18, 0.5, 0.18, 0xd6cfc7, -0.22, 0.25, 0.32);
    const legR2 = boxPart(0.18, 0.5, 0.18, 0xd6cfc7, 0.22, 0.25, 0.32);
    g.add(body, head, legL, legR, legL2, legR2);
    return { group: g, legL, legR, legL2, legR2, head };
  }

  function buildCow() {
    const g = new THREE.Group();
    const body = boxPart(0.72, 0.62, 1.15, 0x6e4f3a, 0, 0.72, 0);
    const spot1 = boxPart(0.3, 0.3, 0.34, 0xf2f0ea, 0.2, 0.82, -0.1);
    const spot2 = boxPart(0.26, 0.26, 0.3, 0xf2f0ea, -0.22, 0.6, 0.3);
    const head = boxPart(0.5, 0.42, 0.42, 0x7d5b44, 0, 0.86, -0.72);
    const muzzle = boxPart(0.34, 0.2, 0.12, 0xd6b5a3, 0, 0.76, -0.96);
    const hornL = boxPart(0.08, 0.14, 0.08, 0xd6cfc7, -0.22, 1.12, -0.7);
    const hornR = boxPart(0.08, 0.14, 0.08, 0xd6cfc7, 0.22, 1.12, -0.7);
    const legs = [
      boxPart(0.2, 0.42, 0.2, 0x5c412e, -0.22, 0.21, -0.36),
      boxPart(0.2, 0.42, 0.2, 0x5c412e, 0.22, 0.21, -0.36),
      boxPart(0.2, 0.42, 0.2, 0x5c412e, -0.22, 0.21, 0.36),
      boxPart(0.2, 0.42, 0.2, 0x5c412e, 0.22, 0.21, 0.36)
    ];
    g.add(body, spot1, spot2, head, muzzle, hornL, hornR, ...legs);
    return { group: g, legL: legs[0], legR: legs[1], legL2: legs[2], legR2: legs[3], head };
  }

  function buildChicken() {
    const g = new THREE.Group();
    const body = boxPart(0.42, 0.4, 0.5, 0xf2f2f0, 0, 0.42, 0);
    const head = boxPart(0.3, 0.3, 0.28, 0xf7f7f5, 0, 0.72, -0.34);
    const beak = boxPart(0.12, 0.08, 0.1, 0xe8a32a, 0, 0.68, -0.5);
    const wattle = boxPart(0.1, 0.12, 0.06, 0xd64535, 0, 0.58, -0.42);
    const tail = boxPart(0.3, 0.3, 0.12, 0xe8e8e6, 0, 0.5, 0.3);
    tail.rotation.x = 0.5;
    const wingL = boxPart(0.08, 0.22, 0.32, 0xe0e0de, -0.26, 0.46, 0);
    const wingR = boxPart(0.08, 0.22, 0.32, 0xe0e0de, 0.26, 0.46, 0);
    const legL = boxPart(0.08, 0.26, 0.08, 0xe8a32a, -0.1, 0.13, 0);
    const legR = boxPart(0.08, 0.26, 0.08, 0xe8a32a, 0.1, 0.13, 0);
    g.add(body, head, beak, wattle, tail, wingL, wingR, legL, legR);
    return { group: g, legL, legR, wingL, wingR, head };
  }

  function buildSkeleton() {
    const g = new THREE.Group();
    const bone = 0xe6e3d8;
    const legL = boxPart(0.2, 0.78, 0.2, bone, -0.13, 0.39, 0);
    const legR = boxPart(0.2, 0.78, 0.2, bone, 0.13, 0.39, 0);
    const body = boxPart(0.5, 0.62, 0.24, bone, 0, 1.12, 0);
    const ribs = boxPart(0.56, 0.3, 0.28, 0xcfcabc, 0, 1.18, 0);
    const head = boxPart(0.46, 0.46, 0.46, bone, 0, 1.7, 0);
    const armL = boxPart(0.16, 0.62, 0.16, bone, -0.36, 1.18, 0);
    const armR = boxPart(0.16, 0.62, 0.16, bone, 0.36, 1.18, 0);
    const bow = boxPart(0.06, 0.9, 0.1, 0x8a6a3c, -0.4, 1.15, -0.15);
    g.add(legL, legR, body, ribs, head, armL, armR, bow);
    return { group: g, legL, legR, armL, armR, head };
  }

  /* v0.8: 村人 — 茶色のローブに大きな鼻、腕を前で組んだ姿 */
  function buildVillager() {
    const g = new THREE.Group();
    const robe = 0x8a5a34, robeDark = 0x6f4526, skin = 0xbd8a60;
    const legL = boxPart(0.26, 0.72, 0.28, robeDark, -0.14, 0.36, 0);
    const legR = boxPart(0.26, 0.72, 0.28, robeDark, 0.14, 0.36, 0);
    const body = boxPart(0.62, 0.78, 0.36, robe, 0, 1.11, 0);
    const belt = boxPart(0.64, 0.1, 0.38, 0x4e3320, 0, 0.98, 0);
    const head = boxPart(0.5, 0.52, 0.5, skin, 0, 1.76, 0);
    const nose = boxPart(0.12, 0.22, 0.14, 0xa87850, 0, 1.7, -0.3);   // 特徴的な大きな鼻
    const brow = boxPart(0.52, 0.08, 0.52, 0x6e5335, 0, 2.0, 0);      // 眉毛/額
    const armL = boxPart(0.2, 0.6, 0.22, robe, -0.42, 1.28, 0);
    const armR = boxPart(0.2, 0.6, 0.22, robe, 0.42, 1.28, 0);
    const hands = boxPart(0.44, 0.18, 0.2, skin, 0, 0.98, -0.26);     // 前で組んだ手
    g.add(legL, legR, body, belt, head, nose, brow, armL, armR, hands);
    return { group: g, legL, legR, head };
  }

  /* ===== v0.12: 海の生物 (aquatic: true で水中を泳ぐ挙動) ===== */
  // 魚 (銀色の細長い体と尾びれ)
  function buildFish() {
    const g = new THREE.Group();
    const body = boxPart(0.2, 0.26, 0.6, 0x8fa8b8, 0, 0.15, 0);
    const tail = boxPart(0.06, 0.3, 0.22, 0x7c95a6, 0, 0.15, 0.42);
    const fin = boxPart(0.04, 0.14, 0.2, 0x7c95a6, 0, 0.34, 0);
    const eyeL = boxPart(0.04, 0.05, 0.05, 0x1a1a1a, -0.11, 0.2, -0.24);
    g.add(body, tail, fin, eyeL);
    return { group: g, tail };
  }
  // 熱帯魚 (カラフルな小魚)
  function buildTropicalFish() {
    const g = new THREE.Group();
    const body = boxPart(0.16, 0.22, 0.44, 0xf2a03c, 0, 0.12, 0);
    const stripe = boxPart(0.18, 0.24, 0.1, 0x3a5ad0, 0, 0.12, 0.05);
    const tail = boxPart(0.05, 0.26, 0.18, 0xf2d03c, 0, 0.12, 0.32);
    g.add(body, stripe, tail);
    return { group: g, tail };
  }
  // 貝 (海底でじっとしている二枚貝。上殻が開閉する)
  function buildShellfish() {
    const g = new THREE.Group();
    const shellB = boxPart(0.4, 0.12, 0.4, 0xd8cfc0, 0, 0.06, 0);
    const shellT = boxPart(0.38, 0.1, 0.38, 0xc4b8a4, 0, 0.17, 0.02);
    const mantle = boxPart(0.3, 0.05, 0.3, 0xe8a0a8, 0, 0.13, 0);
    g.add(shellB, shellT, mantle);
    // v0.12.1: 上殻をヒンジ (後縁 z=+0.2) 回転で開閉させるため、
    // ヒンジ位置にピボットを置いたグループに入れ替える。
    const hinge = new THREE.Group();
    hinge.position.set(0, 0.12, 0.2);   // 後縁の蝶番
    shellT.position.set(0, 0.05, -0.18);
    hinge.add(shellT);
    g.add(hinge);
    return { group: g, shellTop: hinge };
  }
  // イルカ (大きな流線型・背びれ)
  function buildDolphin() {
    const g = new THREE.Group();
    const body = boxPart(0.55, 0.5, 1.6, 0x6a8ba0, 0, 0.3, 0);
    const snout = boxPart(0.24, 0.22, 0.4, 0x7c9cb2, 0, 0.2, -0.95);
    const dorsal = boxPart(0.08, 0.35, 0.3, 0x5a7a90, 0, 0.7, 0.1);
    const tailL = boxPart(0.3, 0.08, 0.3, 0x5a7a90, -0.22, 0.3, 0.95);
    const tailR = boxPart(0.3, 0.08, 0.3, 0x5a7a90, 0.22, 0.3, 0.95);
    const finL = boxPart(0.26, 0.06, 0.3, 0x5a7a90, -0.4, 0.12, -0.3);
    const finR = boxPart(0.26, 0.06, 0.3, 0x5a7a90, 0.4, 0.12, -0.3);
    g.add(body, snout, dorsal, tailL, tailR, finL, finR);
    return { group: g, tailL, tailR };
  }
  // 亀 (甲羅と4本のヒレ足・頭)
  function buildTurtle() {
    const g = new THREE.Group();
    const shell = boxPart(0.7, 0.3, 0.8, 0x4a7a3a, 0, 0.3, 0);
    const shellTop = boxPart(0.56, 0.12, 0.66, 0x5d9048, 0, 0.5, 0);
    const head = boxPart(0.26, 0.22, 0.3, 0x7aa060, 0, 0.28, -0.55);
    const flFL = boxPart(0.2, 0.08, 0.26, 0x6a9050, -0.42, 0.16, -0.28);
    const flFR = boxPart(0.2, 0.08, 0.26, 0x6a9050, 0.42, 0.16, -0.28);
    const flBL = boxPart(0.2, 0.08, 0.22, 0x6a9050, -0.4, 0.16, 0.3);
    const flBR = boxPart(0.2, 0.08, 0.22, 0x6a9050, 0.4, 0.16, 0.3);
    g.add(shell, shellTop, head, flFL, flFR, flBL, flBR);
    return { group: g, legL: flFL, legR: flFR, legL2: flBL, legR2: flBR, head };
  }

  /* v0.13: ムーシュルーム — きのこ島の赤い牛。背中にキノコが生えている */
  function buildMooshroom() {
    const g = new THREE.Group();
    const body = boxPart(0.72, 0.62, 1.15, 0xa83232, 0, 0.72, 0);
    const spot1 = boxPart(0.3, 0.3, 0.34, 0xf2f0ea, 0.2, 0.82, -0.1);
    const spot2 = boxPart(0.26, 0.26, 0.3, 0xf2f0ea, -0.22, 0.6, 0.3);
    const head = boxPart(0.5, 0.42, 0.42, 0xb84a44, 0, 0.86, -0.72);
    const muzzle = boxPart(0.34, 0.2, 0.12, 0xd8a8a0, 0, 0.76, -0.96);
    const hornL = boxPart(0.08, 0.14, 0.08, 0xd6cfc7, -0.22, 1.12, -0.7);
    const hornR = boxPart(0.08, 0.14, 0.08, 0xd6cfc7, 0.22, 1.12, -0.7);
    // 背中の赤キノコ (傘+柄の小さなキノコ)
    const mush1s = boxPart(0.06, 0.12, 0.06, 0xd8d0bc, 0.1, 1.09, 0.1);
    const mush1c = boxPart(0.2, 0.1, 0.2, 0xc93a2a, 0.1, 1.2, 0.1);
    const mush2s = boxPart(0.05, 0.1, 0.05, 0xd8d0bc, -0.18, 1.07, -0.25);
    const mush2c = boxPart(0.16, 0.08, 0.16, 0xc93a2a, -0.18, 1.16, -0.25);
    const legs = [
      boxPart(0.2, 0.42, 0.2, 0x8a2828, -0.22, 0.21, -0.36),
      boxPart(0.2, 0.42, 0.2, 0x8a2828, 0.22, 0.21, -0.36),
      boxPart(0.2, 0.42, 0.2, 0x8a2828, -0.22, 0.21, 0.36),
      boxPart(0.2, 0.42, 0.2, 0x8a2828, 0.22, 0.21, 0.36)
    ];
    g.add(body, spot1, spot2, head, muzzle, hornL, hornR, mush1s, mush1c, mush2s, mush2c, ...legs);
    return { group: g, legL: legs[0], legR: legs[1], legL2: legs[2], legR2: legs[3], head };
  }

  /* v0.13.2: エンダードラゴン — 黒紫の大型飛行ボス。角・翼・長い尻尾を持つ */
  function buildEnderDragon() {
    const g = new THREE.Group();
    const body = 0x1c1a26, dark = 0x121018, wing = 0x2a2438, eye = 0xd84fff, horn = 0x3a3348;
    // 胴体 (前後に長い)
    const torso = boxPart(1.5, 1.3, 3.2, body, 0, 0, 0);
    const chest = boxPart(1.3, 1.1, 1.4, dark, 0, 0.1, -1.6);
    // 首 (前上方に伸びる) + 頭
    const neck = boxPart(0.7, 0.7, 1.5, body, 0, 0.5, -2.5);
    const head = boxPart(1.0, 0.9, 1.5, dark, 0, 1.0, -3.4);
    const snout = boxPart(0.6, 0.4, 0.7, body, 0, 0.75, -4.3);
    // 角 (2本、頭の後ろ上方)
    const hornL = boxPart(0.16, 0.7, 0.16, horn, -0.4, 1.7, -3.0);
    hornL.rotation.x = -0.5;
    const hornR = boxPart(0.16, 0.7, 0.16, horn, 0.4, 1.7, -3.0);
    hornR.rotation.x = -0.5;
    // 目 (発光する紫)
    const eyeL = boxPart(0.18, 0.18, 0.06, eye, -0.32, 1.1, -4.1);
    const eyeR = boxPart(0.18, 0.18, 0.06, eye, 0.32, 1.1, -4.1);
    // 尻尾 (後方に伸びる3節、先が細い)
    const tail1 = boxPart(0.9, 0.8, 1.6, body, 0, 0.1, 2.2);
    const tail2 = boxPart(0.6, 0.55, 1.5, dark, 0, 0.1, 3.7);
    const tail3 = boxPart(0.35, 0.35, 1.4, wing, 0, 0.1, 5.1);
    // 翼 (左右の大きな板。羽ばたき用にピボットで回転させる)
    const wingLp = new THREE.Group();
    wingLp.position.set(-0.7, 0.6, -0.4);
    const wingL = boxPart(3.4, 0.12, 2.2, wing, -1.8, 0, 0.2);
    wingLp.add(wingL);
    const wingRp = new THREE.Group();
    wingRp.position.set(0.7, 0.6, -0.4);
    const wingR = boxPart(3.4, 0.12, 2.2, wing, 1.8, 0, 0.2);
    wingRp.add(wingR);
    g.add(torso, chest, neck, head, snout, hornL, hornR, eyeL, eyeR, tail1, tail2, tail3, wingLp, wingRp);
    return { group: g, wingL: wingLp, wingR: wingRp, head };
  }

  const MOB_DEF = {
    zombie: { hp: 20, hw: 0.3, h: 1.9, speed: 2.3, hostile: true, dmg: 3, range: 1.7, build: buildZombie, drop: null, burns: true },
    skeleton: { hp: 20, hw: 0.3, h: 1.9, speed: 2.5, hostile: true, dmg: 4, range: 2.2, build: buildSkeleton, drop: { id: 'bone', min: 0, max: 2 }, burns: true },
    pig: { hp: 10, hw: 0.42, h: 0.95, speed: 1.3, hostile: false, build: buildPig, drop: { id: 'porkchop_raw', min: 1, max: 3 } },
    sheep: { hp: 8, hw: 0.42, h: 1.15, speed: 1.4, hostile: false, build: buildSheep, drop: { id: 'wool', min: 1, max: 2 } },
    cow: { hp: 10, hw: 0.46, h: 1.3, speed: 1.3, hostile: false, build: buildCow, drop: { id: 'beef_raw', min: 1, max: 3 } },
    chicken: { hp: 4, hw: 0.22, h: 0.7, speed: 1.5, hostile: false, build: buildChicken, drop: { id: 'chicken_raw', min: 1, max: 1 } },
    villager: { hp: 20, hw: 0.32, h: 1.95, speed: 1.1, hostile: false, build: buildVillager, drop: null, passive: true, noDespawn: true },
    // v0.12: 海の生物 (aquatic=true で水中専用の泳ぎ挙動に分岐)
    fish: { hp: 3, hw: 0.18, h: 0.35, speed: 1.6, hostile: false, build: buildFish, drop: null, aquatic: true },
    tropical_fish: { hp: 3, hw: 0.14, h: 0.3, speed: 1.7, hostile: false, build: buildTropicalFish, drop: null, aquatic: true },
    shellfish: { hp: 4, hw: 0.22, h: 0.24, speed: 0, hostile: false, build: buildShellfish, drop: null, aquatic: true, bottomDweller: true },
    dolphin: { hp: 10, hw: 0.4, h: 0.7, speed: 3.0, hostile: false, build: buildDolphin, drop: null, aquatic: true },
    turtle: { hp: 12, hw: 0.4, h: 0.55, speed: 1.0, hostile: false, build: buildTurtle, drop: null, aquatic: true, amphibious: true },
    // v0.13: ムーシュルーム (きのこ島限定。倒すと牛肉、まれにキノコも)
    mooshroom: { hp: 10, hw: 0.46, h: 1.3, speed: 1.2, hostile: false, build: buildMooshroom, drop: { id: 'beef_raw', min: 1, max: 3 }, islandOnly: true },
    // v0.13.2: エンダードラゴン (エンドのボス。飛行・周回→急降下攻撃・撃破で報酬)
    ender_dragon: { hp: 200, hw: 1.6, h: 2.6, speed: 7, hostile: true, dmg: 8, range: 3.4,
                    build: buildEnderDragon, drop: null, flying: true, noDespawn: true, boss: true }
  };

  class EntityManager {
    constructor(scene, world) {
      this.scene = scene;
      this.world = world;
      this.items = [];
      this.mobs = [];
      this.atlas = world.solidMaterial.map;
      this.spawnTimer = 0;
      // v0.13.4: モブの湧き量を増加 (敵 10→16 / 動物 10→14)
      this.maxHostile = 16;
      this.maxPassive = 14;
      this.dragonSpawned = false;   // v0.13.2: エンダードラゴンを一度だけスポーン
    }

    /* ----- ドロップ ----- */
    dropItem(x, y, z, id, count = 1, spread = true) {
      if (!Blocks.itemDef(id)) return;
      const mesh = makeDropMesh(id, this.atlas);
      if (!mesh) return;
      // 壊したブロックの内部に埋まってスポーンしないよう、少し上にずらす
      // (sweepMove が埋め込み解決で1ブロックずつワープするのを防ぐ)
      const spawnY = Math.floor(y) + 1.05;
      mesh.position.set(x, spawnY, z);
      this.scene.add(mesh);
      this.items.push({
        id, count, mesh,
        pos: new THREE.Vector3(x, spawnY, z),
        vel: new THREE.Vector3(spread ? (Math.random() - 0.5) * 0.6 : 0, 0.8, spread ? (Math.random() - 0.5) * 0.6 : 0),
        age: 0, delay: 0.4, onGround: false
      });
      if (this.items.length > 200) {
        const old = this.items.shift();
        this.scene.remove(old.mesh);
      }
    }

    /* ----- モブ ----- */
    spawnMob(type, x, y, z) {
      const def = MOB_DEF[type];
      if (!def) return null;
      const parts = def.build();
      parts.group.position.set(x, y, z);
      this.scene.add(parts.group);
      const mob = {
        type, def, parts, group: parts.group,
        pos: new THREE.Vector3(x, y, z),
        vel: new THREE.Vector3(),
        hp: def.hp, yaw: Math.random() * Math.PI * 2,
        wanderTimer: 0, attackCd: 0, hurtFlash: 0, walkPhase: 0, onGround: false,
        burnTimer: 0, unloadGrace: 0
      };
      this.mobs.push(mob);
      return mob;
    }

    removeMob(mob, drops = true) {
      const i = this.mobs.indexOf(mob);
      if (i >= 0) this.mobs.splice(i, 1);
      this.scene.remove(mob.group);
      mob.group.traverse(o => { if (o.geometry) o.geometry.dispose(); });
      if (drops && mob.def.drop) {
        const d = mob.def.drop;
        const n = d.min + Math.floor(Math.random() * (d.max - d.min + 1));
        for (let k = 0; k < n; k++) this.dropItem(mob.pos.x, mob.pos.y + 0.5, mob.pos.z, d.id, 1);
      }
      // v0.13.2: エンダードラゴン撃破 — ドラゴンの卵 + 報酬 + 帰還ポータル出現
      if (mob.type === 'ender_dragon') {
        const w = this.world;
        // 帰還ポータルは撃破位置ではなく「中央島アリーナの中心」に建てる
        // (急降下中に島の外/虚空で倒されても、必ず帰還手段が確保されるように)
        let px = 0, pz = 0, baseY = 50;
        outer: for (let r = 0; r <= 20; r += 2) {
          for (let dz = -r; dz <= r; dz += 2) for (let dx = -r; dx <= r; dx += 2) {
            const nx = dx, nz = dz;
            if (!w.isLoaded(nx, nz)) continue;
            const h = w.getHeight(nx, nz);
            if (h > 20 && w.getBlock(nx, h, nz) === ID.end_stone) { px = nx; pz = nz; baseY = h; break outer; }
          }
        }
        // 帰還ポータル (床 3x3 エンドポータル、岩盤の受け皿) + 卵の台座
        // setBlock は高さマップを更新するので、配置後に getHeight が baseY+2 (卵) を返す。
        // そのため検出は「配置した固定座標」に対して行う必要がある。
        for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
          w.setBlock(px + dx, baseY, pz + dz, ID.end_portal);
          w.setBlock(px + dx, baseY - 1, pz + dz, ID.bedrock);
        }
        w.setBlock(px + 2, baseY, pz, ID.bedrock);
        w.setBlock(px + 2, baseY + 1, pz, ID.dragon_egg);
        // テスト/デバッグ用に配置座標を保持
        this.lastExitPortal = { x: px, y: baseY, z: pz, eggX: px + 2, eggY: baseY + 1, eggZ: pz };
        // 報酬はワールドにドロップせずプレイヤーのインベントリへ直接付与
        // (ドロップアイテムが着地時にポータル/卵を上書きするのを防ぐ)
        const reward = ['diamond', 'diamond', 'diamond', 'emerald', 'emerald', 'emerald', 'emerald', 'gold_ingot', 'gold_ingot', 'gold_ingot', 'gold_ingot', 'amethyst_shard', 'crystal_shard'];
        const player = global.Game && Game.player;
        for (const id of reward) {
          if (player && player.inventory) player.inventory.add(id, 1);
        }
        if (typeof global.onDragonDefeated === 'function') global.onDragonDefeated(reward.length);
      }
    }

    damageMob(mob, amount, knockFrom) {
      mob.hp -= amount;
      mob.hurtFlash = 0.3;
      if (knockFrom) {
        const dx = mob.pos.x - knockFrom.x, dz = mob.pos.z - knockFrom.z;
        const l = Math.hypot(dx, dz) || 1;
        mob.vel.x += (dx / l) * 5; mob.vel.z += (dz / l) * 5;
        if (mob.onGround) mob.vel.y = 4.5;
      }
      if (mob.hp <= 0) this.removeMob(mob);
    }

    /** 視線に最も近いモブを返す */
    pickMob(origin, dir, maxDist = 3.6) {
      let best = null, bestT = maxDist;
      const oc = new THREE.Vector3();
      for (const m of this.mobs) {
        const cx = m.pos.x, cy = m.pos.y + m.def.h * 0.5, cz = m.pos.z;
        oc.set(cx - origin.x, cy - origin.y, cz - origin.z);
        const t = oc.dot(dir);
        if (t < 0 || t > bestT) continue;
        const px = origin.x + dir.x * t, py = origin.y + dir.y * t, pz = origin.z + dir.z * t;
        const r = Math.max(m.def.hw + 0.35, m.def.h * 0.4);
        const d2 = (px - cx) ** 2 + (py - cy) ** 2 + (pz - cz) ** 2;
        if (d2 < r * r) { best = m; bestT = t; }
      }
      return best;
    }

    trySpawn(player, isNight, daylight) {
      const w = this.world;
      const hostileCount = this.mobs.filter(m => m.def.hostile).length;
      const passiveCount = this.mobs.length - hostileCount;
      const wantHostile = hostileCount < this.maxHostile;
      const wantPassive = passiveCount < this.maxPassive;
      if (!wantHostile && !wantPassive) return;

      // v0.13.2: エンドはエンダードラゴンのみ (一度だけ・中央島上空)
      if (w.dimension === 'end') {
        if (this.dragonSpawned) return;
        // 既に生きたドラゴンがいればスキップ
        for (const m of this.mobs) if (m.type === 'ender_dragon') { this.dragonSpawned = true; return; }
        this.dragonSpawned = true;
        // 中央島の上空にスポーン (プレイヤー到着時のロード後)
        if (w.isLoaded(0, 0)) {
          this.spawnMob('ender_dragon', 0.5, 48, 0.5);
        } else {
          this.dragonSpawned = false;   // 未生成なら次のtickで再試行
        }
        return;
      }

      // v0.13.1: ネザーは専用スポーン (ネザーラック/ソウルサンドの地表にゾンビ/スケルトン)
      if (w.dimension === 'nether') {
        if (!wantHostile) return;
        for (let attempt = 0; attempt < 10; attempt++) {
          const ang = Math.random() * Math.PI * 2;
          const dist = 18 + Math.random() * 30;
          const x = Math.floor(player.pos.x + Math.cos(ang) * dist);
          const z = Math.floor(player.pos.z + Math.sin(ang) * dist);
          if (!w.isLoaded(x, z)) continue;
          const h = w.getHeight(x, z);
          if (h < 1 || h <= World.SEA) continue;   // 溶岩海の上には出さない
          const ground = w.getBlock(x, h, z);
          if (ground !== ID.netherrack && ground !== ID.soul_sand && ground !== ID.basalt && ground !== ID.basalt_smooth) continue;
          if (w.getBlock(x, h + 1, z) !== 0 || w.getBlock(x, h + 2, z) !== 0) continue;
          this.spawnMob(Math.random() < 0.5 ? 'zombie' : 'skeleton', x + 0.5, h + 1, z + 0.5);
          return;
        }
        return;
      }

      for (let attempt = 0; attempt < 10; attempt++) {
        const ang = Math.random() * Math.PI * 2;
        // プレイヤーのすぐ近くには出さない (消えて見えるのを防ぐ)
        const dist = 20 + Math.random() * 32;
        const x = Math.floor(player.pos.x + Math.cos(ang) * dist);
        const z = Math.floor(player.pos.z + Math.sin(ang) * dist);
        if (!w.isLoaded(x, z)) continue;

        if (wantHostile && Math.random() < 0.5) {
          // 敵モブ: 夜は地上、昼間は暗所(洞窟など)に出現
          const h = w.getHeight(x, z);
          if (isNight) {
            if (h < 1) continue;
            const ground = w.getBlock(x, h, z);
            if (!B.isSolid(ground)) continue;
            if (w.getBlock(x, h + 1, z) !== 0 || w.getBlock(x, h + 2, z) !== 0) continue;
            this.spawnMob(Math.random() < 0.55 ? 'zombie' : 'skeleton', x + 0.5, h + 1, z + 0.5);
            return;
          } else {
            // 暗所: 洞窟内 (空に面していない)
            for (let y = Math.min(h + 1, World.WH - 3); y > 6; y--) {
              const b = w.getBlock(x, y, z);
              const b1 = w.getBlock(x, y - 1, z);
              if (b === 0 && w.getBlock(x, y + 1, z) === 0 && B.isSolid(b1)) {
                // 上にブロックがあって光が遮られている場所
                if (y + 2 < h + 1) {
                  this.spawnMob(Math.random() < 0.55 ? 'zombie' : 'skeleton', x + 0.5, y, z + 0.5);
                  return;
                }
                break;
              }
            }
            continue;
          }
        }

        // v0.12: 海の生物 — プレイヤー周辺の海列にスポーン
        // v0.12.1: 陸地の真ん中では水生ロールを無駄にしない。
        // 旧実装は「この候補列が海かどうか」に関わらず 55% で水生を試行したため、
        // 内陸では 55% の確率で必ず失敗し、パッシブ枠を食い潰していた。
        // 候補列が有効な海である場合のみ水生を試行する。
        const candH = w.getHeight(x, z);
        const candOcean = candH > 1 && candH < World.SEA - 3;
        if (wantPassive && candOcean && Math.random() < 0.55) {
          const h = candH;
          {
            // 水面の少し下〜海底の間の深さにスポーン
            const depth = World.SEA - h;
            const sy = h + 1.2 + Math.random() * Math.min(depth - 2, 6);
            if (sy < World.SEA - 0.5 && w.getBlock(x, Math.floor(sy), z) === ID.water) {
              const isWarm = w.getBlock(x, h, z) === ID.sand;  // 暖かい海の海底は砂
              const roll = Math.random();
              let type;
              if (isWarm) type = roll < 0.30 ? 'tropical_fish' : roll < 0.50 ? 'fish' : roll < 0.68 ? 'turtle' : roll < 0.86 ? 'shellfish' : 'dolphin';
              else type = roll < 0.45 ? 'fish' : roll < 0.62 ? 'shellfish' : roll < 0.85 ? 'dolphin' : 'turtle';
              this.spawnMob(type, x + 0.5, sy, z + 0.5);
              return;
            }
          }
          continue;
        }

        if (wantPassive) {
          const h = w.getHeight(x, z);
          if (h < 1 || h + 1 <= World.SEA) continue;
          // v0.12: 海列 (海底が水面より下) には陸の動物をスポーンしない。
          // 水上に出ている地表のみ有効 (島・海岸)。
          if (h < World.SEA) continue;
          const ground = w.getBlock(x, h, z);
          // v0.11.1: 草以外の地表にも動物をスポーンさせる。
          // v0.11 のバイオーム大型化で草の地表が減り、ground===grass だけだと
          // 動物がほとんどスポーンしなくなっていた。土・砂・雪など自然な地表でもOKに。
          const spawnable = ground === ID.grass || ground === ID.dirt || ground === ID.sand ||
            ground === ID.snow_block || ground === ID.mud || ground === ID.mycelium;   // v0.13: 菌糸 (ムーシュルーム)
          if (!spawnable) continue;
          if (w.getBlock(x, h + 1, z) !== 0 || w.getBlock(x, h + 2, z) !== 0) continue;
          // v0.13: きのこ島 (菌糸の地表) にはムーシュルームのみスポーン
          if (ground === ID.mycelium) {
            if (w.getBlock(x, h + 1, z) !== 0 || w.getBlock(x, h + 2, z) !== 0) continue;
            this.spawnMob('mooshroom', x + 0.5, h + 1, z + 0.5);
            return;
          }
          const roll = Math.random();
          const type = roll < 0.35 ? 'pig' : roll < 0.62 ? 'sheep' : roll < 0.87 ? 'cow' : 'chicken';
          this.spawnMob(type, x + 0.5, h + 1, z + 0.5);
          return;
        }
      }
    }

    update(dt, player, camera, isNight, dayLight) {
      const w = this.world;

      /* --- ドロップ --- */
      for (let i = this.items.length - 1; i >= 0; i--) {
        const it = this.items[i];
        it.age += dt; it.delay -= dt;
        it.vel.y -= 22 * dt;
        if (it.vel.y < -20) it.vel.y = -20;   // 終端速度 (無限加速しない)
        const r = moveAABB(w, it.pos, it.vel, 0.14, 0.28, dt);
        if (r.onGround) { it.vel.x *= 0.35; it.vel.z *= 0.35; it.vel.y = 0; }
        // 未生成チャンクでは物理を進めずその場で待機 (虚空落下・水平ドリフトで拾えなくなるのを防ぐ)
        if (!w.isLoaded(Math.floor(it.pos.x), Math.floor(it.pos.z))) {
          if (it.waitX === undefined) { it.waitX = it.pos.x; it.waitY = it.pos.y; it.waitZ = it.pos.z; }
          it.pos.set(it.waitX, it.waitY, it.waitZ);
          it.vel.set(0, 0, 0);
          it.age = Math.min(it.age, 240);   // 未読込中はデスポーン時計を進めすぎない
        } else if (it.waitX !== undefined) {
          it.waitX = it.waitY = it.waitZ = undefined;
        }
        // 万が一ワールド底より下に落ちたら消す (プレイヤーの元へ戻れないため)
        if (it.pos.y < -8) { this.scene.remove(it.mesh); this.items.splice(i, 1); continue; }
        it.mesh.position.copy(it.pos);
        it.mesh.position.y += 0.16 + Math.sin(it.age * 2.5) * 0.05;
        it.mesh.rotation.y += dt * 1.6;
        if (Blocks.itemDef(it.id).type !== 'block' && camera) {
          it.mesh.rotation.y = Math.atan2(camera.position.x - it.pos.x, camera.position.z - it.pos.z);
        }

        // 吸い寄せ & 取得
        const dx = player.pos.x - it.pos.x, dy = (player.pos.y + 0.9) - it.pos.y, dz = player.pos.z - it.pos.z;
        const d = Math.hypot(dx, dy, dz);
        if (it.delay <= 0 && d < 2.4 && !player.dead) {
          const pull = 8 * dt / Math.max(0.4, d);
          it.pos.x += dx * pull; it.pos.y += dy * pull; it.pos.z += dz * pull;
          // 引き寄せ中は固体に埋まらないよう、床にめり込んだら少し持ち上げる
          if (B.isSolid(w.getBlock(Math.floor(it.pos.x), Math.floor(it.pos.y), Math.floor(it.pos.z)))) {
            it.pos.y = Math.floor(it.pos.y) + 1.01;
            it.vel.y = Math.max(0, it.vel.y);
          }
        }
        if (it.delay <= 0 && d < 0.9 && !player.dead) {
          const left = player.inventory.add(it.id, it.count);
          if (left < it.count) {
            if (typeof global.onItemPickup === 'function') global.onItemPickup(it.id, it.count - left);
            it.count = left;
            if (left <= 0) { this.scene.remove(it.mesh); this.items.splice(i, 1); continue; }
          }
        }
        if (it.age > 300) { this.scene.remove(it.mesh); this.items.splice(i, 1); }
      }

      /* --- モブ --- */
      for (let i = this.mobs.length - 1; i >= 0; i--) {
        const m = this.mobs[i];
        const dx = player.pos.x - m.pos.x, dz = player.pos.z - m.pos.z;
        const distXZ = Math.hypot(dx, dz);
        const dist3 = Math.hypot(dx, player.pos.y - m.pos.y, dz);

        // 遠すぎるモブは消える (十分離れてから。近くで消えないように)
        // v0.8: 村人 (noDespawn) は距離デスポーンしない
        if (distXZ > 96 && !m.def.noDespawn) {
          this.removeMob(m, false); continue;
        }
        // 未読込チャンクに入ったモブは即消さず、しばらく待機させる
        const loaded = w.isLoaded(Math.floor(m.pos.x), Math.floor(m.pos.z));
        if (!loaded) {
          m.unloadGrace = (m.unloadGrace || 0) + dt;
          // v0.8: 敵モブ消失バグ修正 — 追跡中の敵モブと村人は未読込でも消さない
          if (m.unloadGrace > 30 && !m.def.noDespawn && !(m.def.hostile && distXZ < 22)) { this.removeMob(m, false); continue; }
          // 未読込の間は物理演算せず、その場で待機 (消えて見えるのを防ぐ)
          m.vel.set(0, 0, 0);
          continue;
        } else {
          m.unloadGrace = 0;
        }
        // v0.8: 敵モブ消失バグ修正 — プレイヤーに接近中の敵モブが「未生成の虚空」に
        // 突入して y<-5 ルールで消えてしまうのを防ぐ。追跡中に虚空 (地表より12以上下が
        // 未生成扱い) を検知したら、ブロックを「仮想的な固体」とみなしてその場に留まる。
        if (m.def.hostile && distXZ < 22 && !player.dead) {
          const fy = Math.floor(m.pos.y);
          const belowIsVoid = !B.isSolid(w.getBlock(Math.floor(m.pos.x), fy - 1, Math.floor(m.pos.z))) &&
                              w.getHeight(Math.floor(m.pos.x), Math.floor(m.pos.z)) - m.pos.y > 12;
          if (belowIsVoid && m.onGround === false && m.vel.y < -8) {
            m.vel.y = 0;                       // 落ち切らないようにブレーキ
            m.pos.y = Math.max(m.pos.y, w.getHeight(Math.floor(m.pos.x), Math.floor(m.pos.z)) + 1);
          }
        }

        // v0.12.1: 海の生物 — 種ごとのリアルな泳ぎ挙動。
        //   魚     : ゆったり回遊 + 時々ダッシュ (バースト＆コースト)。尾びれを大きく振る
        //   熱帯魚 : 小刻みに素早く方向転換し、砂底近くをホバリング。ひれを細かく動かす
        //   イルカ : 速く中層を泳ぎ、ときどき海面で跳躍 (ブリーチング) して弧を描く
        //   亀     : ゆっくり回遊し、甲羅をロールさせて揺れる。水面近くで休む
        //   貝     : 海底で開閉 (プレイヤーが近いと殻を閉じる)
        if (m.def.aquatic) {
          const bx = Math.floor(m.pos.x), by = Math.floor(m.pos.y), bz = Math.floor(m.pos.z);
          const hereWater = w.getBlock(bx, by, bz) === ID.water;
          const gy = w.getHeight(bx, bz);
          m.wanderTimer -= dt;
          const dx2 = player.pos.x - m.pos.x, dz2 = player.pos.z - m.pos.z;
          const dXZ = Math.hypot(dx2, dz2);

          /* --- 貝: 海底で開閉 --- */
          if (m.def.bottomDweller) {
            m.vel.set(0, 0, 0);
            m.pos.y = gy + 1.05;
            m.group.position.copy(m.pos);
            // プレイヤーが近いと殻を閉じ、離れるとゆっくり開く
            const target = (dXZ < 4 && !player.dead) ? 0 : 0.5;
            m.shellOpen = m.shellOpen === undefined ? 0.5 : m.shellOpen + (target - m.shellOpen) * Math.min(1, (target ? 1.5 : 6) * dt);
            if (m.parts.shellTop) m.parts.shellTop.rotation.x = -m.shellOpen;
            if (dXZ > 96) { this.removeMob(m, false); continue; }
            continue;
          }

          /* --- 種ごとの速度・方向の目標値 --- */
          let wx2 = 0, wz2 = 0, wy2 = 0;
          if (m.wanderTimer <= 0) {
            m.wanderTimer = 1.5 + Math.random() * 3;
            m.wanderDir = Math.random() * Math.PI * 2;
            m.wanderY = (Math.random() - 0.5) * 0.8;
            // イルカ: 海面で時々跳躍を試みる
            if (m.type === 'dolphin' && Math.random() < 0.30 && m.pos.y > World.SEA - 6) {
              m.breach = 1.1;   // 跳躍の持続タイマー
            }
          }
          // 魚: 時々ダッシュ (逃げや索餌の瞬発)。方向転換タイマーとは独立に
          // 持続タイマーで管理し、短いバーストが即座に打ち消されないようにする。
          if (m.type === 'fish') {
            if (m.burst === undefined) m.burst = 0;
            if (m.burst <= 0 && Math.random() < 0.9 * dt) m.burst = 0.7;
            else m.burst = Math.max(0, m.burst - dt);
          }
          // 逃げ (魚・熱帯魚・イルカはプレイヤーが近づくと逃げる)
          const flee = (m.type === 'fish' || m.type === 'tropical_fish' || m.type === 'dolphin') && dXZ < 6 && !player.dead;
          if (flee) {
            const l = dXZ || 1;
            wx2 = -dx2 / l * 1.6; wz2 = -dz2 / l * 1.6;
            m.breach = 0;
          } else {
            wx2 = Math.sin(m.wanderDir); wz2 = Math.cos(m.wanderDir);
            wy2 = m.wanderY || 0;
          }

          // 種ごとの目標速度と加速度 (熱帯魚は小刻み、亀はゆったり)
          let spd = m.def.speed;
          let accel = 6, vaccel = 4;
          if (m.type === 'tropical_fish') { accel = 14; vaccel = 10; }
          else if (m.type === 'turtle') { accel = 2.5; vaccel = 2; }
          else if (m.type === 'dolphin') { accel = 5; vaccel = 4; }
          if (m.type === 'fish' && m.burst > 0) spd *= 2.3;
          // 熱帯魚は砂底の少し上をホバリング (上下の漂いを底近くに固定)
          if (m.type === 'tropical_fish' && !flee) {
            const hover = gy + 1.6;
            wy2 = (hover - m.pos.y) * 1.2;
          }
          // 亀は水面近く (SEA-2 前後) でゆったり休む傾向
          if (m.type === 'turtle' && !flee && Math.random() < 0.5) {
            const rest = World.SEA - 1.8;
            wy2 = (rest - m.pos.y) * 0.5;
          }

          m.vel.x += (wx2 * spd - m.vel.x) * Math.min(1, accel * dt);
          m.vel.z += (wz2 * spd - m.vel.z) * Math.min(1, accel * dt);
          m.vel.y += (wy2 * spd * 0.5 - m.vel.y) * Math.min(1, vaccel * dt);

          /* --- イルカの跳躍 (ブリーチング): 上向きの速度を与えて弧を描く --- */
          if (m.type === 'dolphin') {
            if (m.breach > 0) {
              m.breach -= dt;
              m.vel.y = 3.6;   // 水面を突き破って上へ
            } else if (m.breach < 0) {
              // 落下中 (空中)。重力で水面へ戻る
              m.breach = Math.min(0, m.breach + dt);
            }
            // 水面上に出たら空中フェーズへ
            if (m.breach > 0 && m.pos.y > World.SEA + 0.3) { m.breach = -0.7; }
          }

          // 水面より上には出ない (イルカの跳躍を除く) / 海底より下には潜らない
          const allowBreach = m.type === 'dolphin' && m.breach !== 0;
          if (!allowBreach && m.pos.y > World.SEA - 0.4) m.vel.y = Math.min(m.vel.y, -0.3);
          if (m.pos.y < gy + 1.1) m.vel.y = Math.max(m.vel.y, 0.3);
          // 空中 (跳躍中) は重力で落下。水中でない通常状態は沈める
          if (!hereWater) m.vel.y -= (m.type === 'dolphin' && m.breach < 0 ? 14 : 8) * dt;
          const res2 = moveAABB(w, m.pos, m.vel, m.def.hw, m.def.h, dt);
          m.onGround = res2.onGround;
          if (res2.hitX || res2.hitZ) { m.wanderDir = Math.random() * Math.PI * 2; }
          if (m.pos.y < -5) { this.removeMob(m, false); continue; }

          /* --- 表示 --- */
          m.group.position.copy(m.pos);
          const moving = Math.hypot(m.vel.x, m.vel.z);
          if (moving > 0.05) m.yaw = Math.atan2(-m.vel.x, -m.vel.z);
          let yd = m.yaw - m.group.rotation.y;
          while (yd > Math.PI) yd -= Math.PI * 2;
          while (yd < -Math.PI) yd += Math.PI * 2;
          m.group.rotation.y += yd * Math.min(1, 8 * dt);

          // 尾びれ・ヒレのアニメーションを種ごとの泳速に比例させる
          const swimRate = m.type === 'tropical_fish' ? 11 : m.type === 'turtle' ? 3 : 6;
          const swimAmp = m.type === 'tropical_fish' ? 0.7 : m.type === 'turtle' ? 0.4 : 0.5;
          m.walkPhase += (moving + 0.4) * dt * swimRate;
          const sw = Math.sin(m.walkPhase) * swimAmp;
          if (m.parts.tail) m.parts.tail.rotation.y = sw;
          if (m.parts.tailL) { m.parts.tailL.rotation.y = sw * 0.4; m.parts.tailR.rotation.y = -sw * 0.4; }
          if (m.parts.legL) { m.parts.legL.rotation.z = sw * 0.3; m.parts.legR.rotation.z = -sw * 0.3; }
          if (m.parts.legL2) { m.parts.legL2.rotation.z = -sw * 0.3; m.parts.legR2.rotation.z = sw * 0.3; }

          // イルカ: 跳躍中は速度方向に体を傾ける (ピッチ)
          if (m.type === 'dolphin') {
            const pitch = m.breach !== 0 ? Math.max(-0.9, Math.min(0.9, -m.vel.y * 0.16)) : Math.max(-0.4, Math.min(0.4, -m.vel.y * 0.06));
            m.group.rotation.x += (pitch - m.group.rotation.x) * Math.min(1, 6 * dt);
          } else if (m.type === 'turtle') {
            // 亀: 泳ぎながらゆっくりロール (甲羅を揺らす)
            m.group.rotation.z = Math.sin(m.walkPhase * 0.5) * 0.12;
          }

          if (m.hurtFlash > 0) {
            m.hurtFlash -= dt;
            m.group.traverse(o => { if (o.material && o.material.emissive) o.material.emissive.setHex(0x661111); });
          } else {
            m.group.traverse(o => { if (o.material && o.material.emissive) o.material.emissive.setHex(0x000000); });
          }
          // 遠距離デスポーン
          if (dXZ > 96) { this.removeMob(m, false); continue; }
          continue;
        }

        let wishX = 0, wishZ = 0;
        m.wanderTimer -= dt;
        // v0.8: クリエイティブ/スペクテイターは敵モブに追跡・攻撃されない
        const playerTargetable = !player.dead && player.gameMode !== 'creative' && player.gameMode !== 'spectator';

        /* ===== v0.13.2: エンダードラゴン — 周回飛行 + 急降下攻撃 (重力なし) ===== */
        if (m.def.flying) {
          // 状態初期化
          if (m.phase === undefined) { m.phase = 'circle'; m.phaseT = 0; m.orbitA = Math.atan2(m.pos.z, m.pos.x); m.maxHp = m.def.hp; }

          // 翼の羽ばたき (フェーズで速さを変える)
          m.walkPhase += dt * (m.phase === 'dive' ? 9 : 4.5);
          const flap = Math.sin(m.walkPhase * 2.2) * 0.55;
          if (m.parts.wingL) m.parts.wingL.rotation.z = flap;
          if (m.parts.wingR) m.parts.wingR.rotation.z = -flap;
          // 胴体の上下うねり
          m.group.position.set(m.pos.x, m.pos.y + Math.sin(m.walkPhase * 0.8) * 0.25, m.pos.z);

          if (m.phase === 'circle') {
            m.phaseT += dt;
            // 原点 (中央島) 周りを高度を揺らしながら周回
            m.orbitA += dt * 0.42;
            const R = 26, targetY = 46 + Math.sin(m.phaseT * 0.7) * 5;
            const tx = Math.cos(m.orbitA) * R, tz = Math.sin(m.orbitA) * R;
            m.vel.x += (tx - m.pos.x) * Math.min(1, 2.2 * dt);
            m.vel.z += (tz - m.pos.z) * Math.min(1, 2.2 * dt);
            m.vel.y += (targetY - m.pos.y) * Math.min(1, 2.4 * dt);
            // プレイヤーが近くターゲット可能なら時々急降下へ
            if (m.phaseT > 6 && playerTargetable && distXZ < 70 && Math.random() < dt * 0.3) {
              m.phase = 'dive'; m.phaseT = 0;
              m.diveX = player.pos.x; m.diveY = player.pos.y; m.diveZ = player.pos.z;
              if (typeof global.Sound !== 'undefined' && Sound.roar) Sound.roar();
            }
          } else if (m.phase === 'dive') {
            m.phaseT += dt;
            // プレイヤー位置へ急降下 (先読みなしで単純追跡)
            const ddx = m.diveX - m.pos.x, ddy = m.diveY - m.pos.y, ddz = m.diveZ - m.pos.z;
            const dl = Math.hypot(ddx, ddy, ddz) || 1;
            const spd = 13;
            m.vel.x += ((ddx / dl) * spd - m.vel.x) * Math.min(1, 4 * dt);
            m.vel.y += ((ddy / dl) * spd - m.vel.y) * Math.min(1, 4 * dt);
            m.vel.z += ((ddz / dl) * spd - m.vel.z) * Math.min(1, 4 * dt);
            // 接触ダメージ (ターゲット可能なときだけ)
            if (playerTargetable && dist3 < (m.def.range || 3.4) && m.attackCd <= 0) {
              m.attackCd = 1.2;
              player.damage(m.def.dmg || 8, 'エンダードラゴン');
              const kl = distXZ || 1;
              player.vel.x += (dx / kl) * 7; player.vel.z += (dz / kl) * 7;
              player.vel.y = 5;   // 打ち上げ
            }
            // 通過/タイムアウトで周回に戻る
            if (m.phaseT > 3.2 || dl < 3) { m.phase = 'climb'; m.phaseT = 0; }
          } else {  // 'climb' — 急上昇して周回高度へ
            m.phaseT += dt;
            m.vel.y += (14 - m.vel.y) * Math.min(1, 3 * dt);
            m.vel.x += (Math.cos(m.orbitA) * 26 - m.pos.x) * Math.min(1, 1.2 * dt);
            m.vel.z += (Math.sin(m.orbitA) * 26 - m.pos.z) * Math.min(1, 1.2 * dt);
            if (m.phaseT > 1.6 || m.pos.y > 44) { m.phase = 'circle'; m.phaseT = 0; }
          }
          m.attackCd -= dt;

          // 速度上限 + 位置更新 (ブロックすり抜け。虚空にも落ちない)
          const vmax = 14;
          const vl = Math.hypot(m.vel.x, m.vel.y, m.vel.z);
          if (vl > vmax) { m.vel.multiplyScalar(vmax / vl); }
          m.pos.x += m.vel.x * dt; m.pos.y += m.vel.y * dt; m.pos.z += m.vel.z * dt;
          if (m.pos.y < 10) m.pos.y = 10;   // 虚空に沈まない

          // 向き: 進行方向 (モデルは -Z 向き)
          const mv = Math.hypot(m.vel.x, m.vel.z);
          if (mv > 0.5) m.yaw = Math.atan2(-m.vel.x, -m.vel.z);
          let dYaw = m.yaw - m.group.rotation.y;
          while (dYaw > Math.PI) dYaw -= Math.PI * 2;
          while (dYaw < -Math.PI) dYaw += Math.PI * 2;
          m.group.rotation.y += dYaw * Math.min(1, 4 * dt);
          // 急降下時は機首を下げる
          m.group.rotation.x += ((m.phase === 'dive' ? -0.45 : 0) - m.group.rotation.x) * Math.min(1, 5 * dt);

          if (m.hurtFlash > 0) {
            m.hurtFlash -= dt;
            m.group.traverse(o => { if (o.material && o.material.emissive) o.material.emissive.setHex(0x661144); });
          } else {
            m.group.traverse(o => { if (o.material && o.material.emissive) o.material.emissive.setHex(0x000000); });
          }
          continue;   // 陸モブの物理には進まない
        }

        if (m.def.hostile && distXZ < 22 && playerTargetable) {
          const l = distXZ || 1;
          wishX = dx / l; wishZ = dz / l;
          // 攻撃
          m.attackCd -= dt;
          const range = m.def.range || 1.7;
          if (dist3 < range && m.attackCd <= 0) {
            m.attackCd = m.type === 'skeleton' ? 1.6 : 1.1;
            player.damage(m.def.dmg || 3, m.type === 'skeleton' ? 'スケルトン' : 'ゾンビ');
            const l2 = distXZ || 1;
            player.vel.x += (dx / l2) * 3.5; player.vel.z += (dz / l2) * 3.5;
            if (player.onGround) player.vel.y = 3.2;
          }
          // スケルトンは一定距離を保つ
          if (m.type === 'skeleton' && distXZ < 6) { wishX = -dx / l; wishZ = -dz / l; }
        } else {
          if (m.wanderTimer <= 0) {
            m.wanderTimer = 2 + Math.random() * 4;
            m.wanderDir = Math.random() < 0.35 ? null : Math.random() * Math.PI * 2;
          }
          if (m.wanderDir !== null && m.wanderDir !== undefined) {
            wishX = Math.sin(m.wanderDir); wishZ = Math.cos(m.wanderDir);
          }
          // 逃げる (攻撃された直後)
          if (m.hurtFlash > 0 && !m.def.hostile && distXZ < 10) {
            const l = distXZ || 1;
            wishX = -dx / l; wishZ = -dz / l;
          }
        }

        const spd = m.def.speed * (m.def.hostile && distXZ < 22 ? 1 : 0.6);
        // v0.8: 移動を滑らかに — 加速度を下げて急な方向転換を滑らかに
        const smoothAccel = m.def.hostile ? 8 : 5;
        m.vel.x += (wishX * spd - m.vel.x) * Math.min(1, smoothAccel * dt);
        m.vel.z += (wishZ * spd - m.vel.z) * Math.min(1, smoothAccel * dt);

        const inWater = w.getBlock(Math.floor(m.pos.x), Math.floor(m.pos.y + 0.3), Math.floor(m.pos.z)) === ID.water;
        if (inWater) { m.vel.y += 16 * dt; m.vel.y = Math.min(m.vel.y, 2.5); }
        m.vel.y -= 26 * dt;
        if (m.vel.y < -50) m.vel.y = -50;

        const res = moveAABB(w, m.pos, m.vel, m.def.hw, m.def.h, dt);
        m.onGround = res.onGround;
        // v0.12.1: 段差は「ジャンプで発射」ではなく、1段分だけ滑らかに持ち上げる。
        // 旧実装は vel.y=7.4 で上向きに発射し重力で弧を描いていたため、1段の
        // 段差でも大きく跳ねて「ガクッ」と不自然だった。移動先の1段が空いていれば
        // その高さへ短時間で補間して上がる (Minecraft のオートステップ相当)。
        if ((res.hitX || res.hitZ) && m.onGround && m.vel.y <= 0.01) {
          const moving = Math.hypot(m.vel.x, m.vel.z);
          if (moving > 0.3) {
            const l = moving || 1;
            const fx = m.pos.x + (m.vel.x / l) * (m.def.hw + 0.4);
            const fz = m.pos.z + (m.vel.z / l) * (m.def.hw + 0.4);
            const fbx = Math.floor(fx), fbz = Math.floor(fz);
            const fby = Math.floor(m.pos.y);
            // 正面の1段目が固体で、その上2ブロックが空いていれば1段上がれる
            if (B.isSolid(w.getBlock(fbx, fby, fbz)) &&
                !B.isSolid(w.getBlock(fbx, fby + 1, fbz)) &&
                !B.isSolid(w.getBlock(fbx, fby + 2, fbz))) {
              const targetY = fby + 1.02;
              // 目標の高さへ滑らかに補間 (dt に比例、速すぎず跳ねない)
              const ny = m.pos.y + (targetY - m.pos.y) * Math.min(1, 14 * dt) + 4.5 * dt;
              m.pos.y = Math.min(ny, targetY);
              m.vel.y = 0;
              m.onGround = true;
            } else {
              m.vel.y = 7.4;   // 段差でない壁には従来通りジャンプ
            }
          }
        }

        // 落下ダメージ・空中で下に地面が無いときは自然落下
        if (m.pos.y < -5) { this.removeMob(m, false); continue; }

        // 昼間の日光でゾンビが燃える
        if (m.def.burns && !isNight && dayLight > 0.6) {
          const top = w.getHeight(Math.floor(m.pos.x), Math.floor(m.pos.z));
          if (m.pos.y > top) {
            m.burnTimer += dt;
            if (m.burnTimer > 1) { m.burnTimer = 0; m.hp -= 2; m.hurtFlash = 0.2; if (m.hp <= 0) { this.removeMob(m); continue; } }
          }
        }

        // 表示更新
        m.group.position.copy(m.pos);
        const moving = Math.hypot(m.vel.x, m.vel.z);
        // 進行方向を向く (モデルは -Z 向きに作られている)
        if (moving > 0.1) {
          m.yaw = Math.atan2(-m.vel.x, -m.vel.z);
        } else if (m.def.hostile && distXZ < 22 && playerTargetable) {
          // 静止している敵モブはプレイヤーの方を向く
          m.yaw = Math.atan2(-dx, -dz);
        }
        // v0.8: 向きを滑らかに補間 (最短角度で回転)
        let yawDiff = m.yaw - m.group.rotation.y;
        while (yawDiff > Math.PI) yawDiff -= Math.PI * 2;
        while (yawDiff < -Math.PI) yawDiff += Math.PI * 2;
        m.group.rotation.y += yawDiff * Math.min(1, 12 * dt);
        m.walkPhase += moving * dt * 5;
        const swing = Math.sin(m.walkPhase) * Math.min(0.55, moving * 0.22);
        const p = m.parts;
        if (p.legL) p.legL.rotation.x = swing;
        if (p.legR) p.legR.rotation.x = -swing;
        if (p.legL2) p.legL2.rotation.x = -swing;
        if (p.legR2) p.legR2.rotation.x = swing;
        if (m.hurtFlash > 0) {
          m.hurtFlash -= dt;
          m.group.traverse(o => { if (o.material) o.material.emissive && o.material.emissive.setHex(0x661111); });
        } else {
          m.group.traverse(o => { if (o.material && o.material.emissive) o.material.emissive.setHex(0x000000); });
        }
      }

      /* --- スポーン --- */
      this.spawnTimer -= dt;
      if (this.spawnTimer <= 0) {
        this.spawnTimer = 3;
        this.trySpawn(player, isNight, dayLight);
      }
    }

    clear() {
      for (const it of this.items) this.scene.remove(it.mesh);
      for (const m of this.mobs) this.scene.remove(m.group);
      this.items = []; this.mobs = [];
    }
  }

  global.EntityManager = EntityManager;
  global.MOB_DEF = MOB_DEF;
  global.moveAABB = moveAABB;
  global.makeItemMesh = makeDropMesh;
})(window);
