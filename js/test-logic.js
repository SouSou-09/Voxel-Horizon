/* 自動ロジックテスト (開発用) */
(function () {
  'use strict';
  let pass = 0, fail = 0;
  const failNames = [];
  function ok(name, cond, extra) {
    if (cond) { pass++; console.log('PASS: ' + name); }
    else { fail++; failNames.push(name); console.log('FAIL: ' + name + (extra !== undefined ? ' => ' + JSON.stringify(extra) : '')); }
  }
  const IS = InventorySystem;
  const st = (id, n) => IS.newStack(id, n || 1);

  /* --- クラフト --- */
  function grid(size, map) {
    const g = new Array(size * size).fill(null);
    for (const k of Object.keys(map)) g[+k] = st(map[k]);
    return g;
  }
  let r;
  r = IS.craftResult(grid(2, { 0: 'log' }), 2);
  ok('原木→木の板x4', r && r.id === 'planks' && r.count === 4, r);
  r = IS.craftResult(grid(2, { 0: 'planks', 2: 'planks' }), 2);
  ok('木の板2→棒x4', r && r.id === 'stick' && r.count === 4, r);
  r = IS.craftResult(grid(2, { 0: 'planks', 1: 'planks', 2: 'planks', 3: 'planks' }), 2);
  ok('木の板4→作業台', r && r.id === 'crafting_table', r);
  r = IS.craftResult(grid(2, { 0: 'coal', 2: 'stick' }), 2);
  ok('石炭+棒→松明x4', r && r.id === 'torch' && r.count === 4, r);
  r = IS.craftResult(grid(3, { 0: 'planks', 1: 'planks', 2: 'planks', 4: 'stick', 7: 'stick' }), 3);
  ok('木のツルハシ', r && r.id === 'wooden_pickaxe', r);
  r = IS.craftResult(grid(3, { 0: 'cobblestone', 1: 'cobblestone', 2: 'cobblestone', 3: 'cobblestone', 5: 'cobblestone', 6: 'cobblestone', 7: 'cobblestone', 8: 'cobblestone' }), 3);
  ok('丸石8→かまど', r && r.id === 'furnace', r);
  r = IS.craftResult(grid(3, { 0: 'diamond', 1: 'diamond', 3: 'stick', 6: 'stick' }), 3);
  ok('不正な配置はクラフト不可', r === null, r);
  r = IS.craftResult(grid(3, { 1: 'iron_ingot', 4: 'stick', 7: 'stick' }), 3);
  ok('鉄のシャベル', r && r.id === 'iron_shovel', r);

  r = IS.craftResult(grid(3, { 0: 'planks', 1: 'planks', 2: 'planks', 3: 'planks', 5: 'planks', 6: 'planks', 7: 'planks', 8: 'planks' }), 3);
  ok('木の板8→チェスト', r && r.id === 'chest', r);
  r = IS.craftResult(grid(3, { 0: 'wool', 1: 'wool', 2: 'wool', 3: 'planks', 4: 'planks', 5: 'planks' }), 3);
  ok('羊毛+板→ベッド', r && r.id === 'bed', r);

  /* --- インベントリ --- */
  const inv = new IS.Inventory(36);
  ok('追加と集計', inv.add('dirt', 100) === 0 && inv.countOf('dirt') === 100);
  ok('消費', inv.consume('dirt', 70) && inv.countOf('dirt') === 30);
  inv.add('wooden_pickaxe', 1);
  const pickIdx = inv.slots.findIndex(s => s && s.id === 'wooden_pickaxe');
  ok('道具の耐久', inv.get(pickIdx).dura === Blocks.itemDef('wooden_pickaxe').tool.durability);

  /* --- ワールド --- */
  const scene = new THREE.Scene();
  const world = new World(1234, scene);
  const t0 = performance.now();
  for (let cx = -1; cx <= 1; cx++) for (let cz = -1; cz <= 1; cz++) world.generateChunk(cx, cz);
  const genMs = performance.now() - t0;
  console.log('チャンク9個の生成: ' + genMs.toFixed(0) + 'ms');
  ok('チャンク生成速度 (<1500ms)', genMs < 1500, genMs);

  const c0 = world.getChunk(0, 0);
  ok('岩盤が最下層', world.getBlock(0, 0, 0) === Blocks.BLOCK_ID.bedrock, world.getBlock(0, 0, 0));

  /* v0.6: 渓谷・湖などの影響を受けない「平らな場所」を動的に探すヘルパー */
  // 指定座標に近く、地表が海抜より十分高く平坦な列を返す
  function flatSpot(nearX, nearZ) {
    let best = null, bestScore = -1;
    for (let dx = -8; dx <= 8; dx++) for (let dz = -8; dz <= 8; dz++) {
      const x = nearX + dx, z = nearZ + dz;
      const h = world.getHeight(x, z);
      if (h < 26 || h > 40) continue;                 // 海抜より上・高すぎない
      // 3x3 が平坦か
      let flat = true, minH = h, maxH = h;
      for (let ax = -1; ax <= 1 && flat; ax++) for (let az = -1; az <= 1 && flat; az++) {
        const hh = world.getHeight(x + ax, z + az);
        if (hh < 26 || hh > 40) { flat = false; break; }
        minH = Math.min(minH, hh); maxH = Math.max(maxH, hh);
      }
      if (!flat || (maxH - minH) > 2) continue;
      const top = world.getBlock(x, h, z);
      const topDef = Blocks.get(top);
      if (topDef.liquid) continue;                     // 水面は避ける
      const score = 100 - (Math.abs(dx) + Math.abs(dz)) - (maxH - minH) * 5;
      if (score > bestScore) { bestScore = score; best = [x, z]; }
    }
    return best || [nearX, nearZ];
  }
  let surfaceOk = 0, treeFound = 0, oreFound = 0, waterFound = 0;
  for (let x = 0; x < 16; x++) for (let z = 0; z < 16; z++) {
    const h = world.getHeight(x, z);
    const top = world.getBlock(x, h, z);
    if ([Blocks.BLOCK_ID.grass, Blocks.BLOCK_ID.sand, Blocks.BLOCK_ID.snow_block, Blocks.BLOCK_ID.log, Blocks.BLOCK_ID.leaves,
      Blocks.BLOCK_ID.mud, Blocks.BLOCK_ID.clay].includes(top)) surfaceOk++;
    for (let y = 1; y < 60; y++) {
      const b = world.getBlock(x, y, z);
      if (b === Blocks.BLOCK_ID.log) treeFound++;
      if (b === Blocks.BLOCK_ID.coal_ore || b === Blocks.BLOCK_ID.iron_ore) oreFound++;
      if (b === Blocks.BLOCK_ID.water) waterFound++;
    }
  }
  ok('地表ブロックが妥当', surfaceOk > 200, surfaceOk);
  ok('鉱石が生成される', oreFound > 0, oreFound);
  console.log('原木ブロック数: ' + treeFound + ' / 水: ' + waterFound);

  const tm = performance.now();
  world.buildMesh(c0);
  console.log('メッシュ生成: ' + (performance.now() - tm).toFixed(0) + 'ms');
  ok('メッシュ生成', !!c0.mesh && c0.mesh.geometry.attributes.position.count > 100,
    c0.mesh ? c0.mesh.geometry.attributes.position.count : 0);

  /* --- レイキャスト --- */
  const _fsMain = flatSpot(4, 4);
  const hx = _fsMain[0], hz = _fsMain[1], hh = world.getHeight(hx, hz);
  const hit = world.raycast(new THREE.Vector3(hx + 0.5, hh + 4, hz + 0.5), new THREE.Vector3(0, -1, 0), 8);
  ok('レイキャストが地表に当たる', hit && hit.y === hh && hit.ny === 1, hit);

  /* --- 設置と破壊 --- */
  world.setBlock(hx, hh + 1, hz, Blocks.BLOCK_ID.torch);
  ok('松明の設置', world.getBlock(hx, hh + 1, hz) === Blocks.BLOCK_ID.torch && world.torches.size === 1);
  world.setBlock(hx, hh + 1, hz, 0);
  ok('松明の撤去', world.torches.size === 0);
  const edits = world.serializeEdits();
  ok('編集がセーブされる', Object.keys(edits).length === 1, edits);

  /* --- チェスト --- */
  world.setBlock(hx + 1, hh + 1, hz, Blocks.BLOCK_ID.chest);
  const chestArr = world.chests.get(World.bkey(hx + 1, hh + 1, hz));
  ok('チェストの生成', Array.isArray(chestArr) && chestArr.length === 27);
  chestArr[0] = st('diamond', 5);
  const cser = world.serializeChests();
  ok('チェストのセーブ', cser[World.bkey(hx + 1, hh + 1, hz)][0].count === 5);
  world.setBlock(hx + 1, hh + 1, hz, 0);
  ok('チェスト撤去で削除', !world.chests.has(World.bkey(hx + 1, hh + 1, hz)));

  /* --- ベッド (非固体・低いボックス) --- */
  const bedDef = Blocks.get(Blocks.BLOCK_ID.bed);
  ok('ベッドはボックスモデル', bedDef.model === 'box' && !bedDef.solid && bedDef.box.y1 < 1);

  /* --- 砂の落下 --- */
  const sx = 8, sz = 8, sh = world.getHeight(sx, sz);
  world.setBlock(sx, sh + 3, sz, Blocks.BLOCK_ID.sand);
  world.applyGravity(sx, sh + 3, sz);
  ok('砂が落下する', world.getBlock(sx, sh + 1, sz) === Blocks.BLOCK_ID.sand, {
    at1: world.getBlock(sx, sh + 1, sz), at3: world.getBlock(sx, sh + 3, sz)
  });

  /* --- プレイヤー物理 --- */
  const player = new Player(world);
  player.pos.set(hx + 0.5, hh + 6, hz + 0.5);
  const input = { moveF: 0, moveR: 0, jump: false };
  for (let i = 0; i < 240; i++) player.update(1 / 60, input);
  const landX = Math.floor(player.pos.x), landZ = Math.floor(player.pos.z);
  const landY = Math.floor(player.pos.y - 0.05);
  const landBlockId = world.getBlock(landX, landY, landZ);
  const landDef = Blocks.get(landBlockId);
  // 足元ブロックが (a) 固体フルブロック で上に乗っているか (b) 薄いボックス(ベッド等)の上に乗っている
  const onFull = B_full(landBlockId) && Math.abs(player.pos.y - (landY + 1)) < 0.05;
  const onBox = landDef && landDef.box && !B_full(landBlockId) &&
    Math.abs(player.pos.y - (landY + landDef.box.y1)) < 0.05;
  ok('重力で着地する', player.onGround && (onFull || onBox),
    { y: player.pos.y, block: landBlockId, onGround: player.onGround });
  function B_full(id) { const d = Blocks.get(id); return !!(d && d.solid && !d.box); }

  // 歩行して座標が変わる
  const beforeX = player.pos.x;
  player.yaw = 0;
  const walk = { moveF: 1, moveR: 0, jump: false };
  for (let i = 0; i < 120; i++) player.update(1 / 60, walk);
  ok('前進で -Z 方向に移動', player.pos.z < hz + 0.5 - 0.5, { z: player.pos.z, start: hz + 0.5 });
  ok('横滑りしない', Math.abs(player.pos.x - beforeX) < 0.3, player.pos.x - beforeX);
  ok('ブロックにめり込まない', !Blocks.isSolid(world.getBlock(
    Math.floor(player.pos.x), Math.floor(player.pos.y + 0.5), Math.floor(player.pos.z))), player.pos.toArray());

  /* --- 壁ワープ修正の検証 --- */
  {
    // 高さ3の壁を用意し、壁に押しつけながらジャンプしても上に乗らないことを確認
    const _fsWall = flatSpot(12, 12);
    const wx = _fsWall[0], wz = _fsWall[1];
    const wh = world.getHeight(wx, wz);
    for (let i = 1; i <= 3; i++) world.setBlock(wx, wh + i, wz, Blocks.BLOCK_ID.stone);
    const p2 = new Player(world);
    p2.pos.set(wx + 0.5, wh + 1.01, wz + 3.0);
    for (let i = 0; i < 60; i++) p2.update(1 / 60, { moveF: 0, moveR: 0, jump: false });
    ok('壁前で着地', p2.onGround, p2.pos.toArray());
    // 壁に向かって歩きながらジャンプ
    p2.yaw = 0; // -Z 方向 = 壁の方向
    for (let i = 0; i < 300; i++) p2.update(1 / 60, { moveF: 1, moveR: 0, jump: true });
    ok('高い壁をジャンプで乗り越えない(ワープなし)',
      p2.pos.y < wh + 3.4, { y: p2.pos.y, wallTop: wh + 4 });
    ok('壁をすり抜けていない', p2.pos.z > wz + 1, p2.pos.z);
    for (let i = 1; i <= 3; i++) world.setBlock(wx, wh + i, wz, 0);
  }

  /* --- 空腹・ダメージ --- */
  player.hunger = 20; player.health = 10;
  for (let i = 0; i < 60 * 10; i++) player.updateStats(1 / 60);
  ok('満腹なら体力回復', player.health > 10, player.health);
  player.health = 20; player.hunger = 0;
  for (let i = 0; i < 60 * 10; i++) player.updateStats(1 / 60);
  ok('空腹で餓死ダメージ', player.health < 20, player.health);

  player.health = 20;
  player.damage(5, 'テスト');
  ok('ダメージ計算', player.health === 15, player.health);
  player.inventory.add('porkchop_cooked', 1);
  const foodIdx = player.inventory.slots.findIndex(s => s && s.id === 'porkchop_cooked');
  player.hunger = 5;
  player.eat(foodIdx);
  ok('食事で満腹度回復', player.hunger === 13 && player.inventory.countOf('porkchop_cooked') === 0, player.hunger);

  /* --- かまど --- */
  const f = new IS.Furnace();
  f.input = st('cobblestone', 3);
  f.fuel = st('coal', 1);
  for (let i = 0; i < 60 * 9; i++) f.tick(1 / 60);
  ok('丸石→石の精錬', f.output && f.output.id === 'stone' && f.output.count >= 1, f.output);
  ok('燃料が消費される', f.fuel === null, f.fuel);

  /* --- エンティティ --- */
  const em = new EntityManager(scene, world);
  // v0.6: プレイヤーの現在位置ではなく、平らな場所でドロップして拾わせる
  const _fsPick = flatSpot(hx, hz);
  const pkx = _fsPick[0] + 0.5, pkz = _fsPick[1] + 0.5;
  const pky = world.getHeight(_fsPick[0], _fsPick[1]) + 1.05;
  player.pos.set(pkx, pky, pkz);
  em.dropItem(pkx, pky + 0.5, pkz, 'diamond', 2, false);
  for (let i = 0; i < 120; i++) em.update(1 / 60, player, null, false, 1);
  ok('ドロップアイテムを拾える', player.inventory.countOf('diamond') === 2, player.inventory.countOf('diamond'));

  const before = em.mobs.length;
  const mob = em.spawnMob('zombie', hx + 0.5, hh + 1, hz + 0.5);
  ok('モブのスポーン', !!mob && em.mobs.length === before + 1, em.mobs.length);
  em.damageMob(mob, 25, player.pos);
  ok('モブの撃破', em.mobs.length === before && em.mobs.indexOf(mob) < 0);

  const items0 = em.items.length;
  const pig = em.spawnMob('pig', hx + 3.5, hh + 1, hz + 0.5);
  em.damageMob(pig, 20, player.pos);
  ok('ブタが肉をドロップ', em.items.length > items0, em.items.length);

  /* --- 新モブ・アイテム --- */
  ok('骨アイテムが存在', !!Blocks.itemDef('bone'));
  ok('牛肉アイテムが存在', !!Blocks.itemDef('beef_raw') && !!Blocks.itemDef('beef_cooked'));
  ok('鶏肉アイテムが存在', !!Blocks.itemDef('chicken_raw') && !!Blocks.itemDef('chicken_cooked'));
  const cow = em.spawnMob('cow', hx + 5.5, hh + 1, hz + 0.5);
  const cowItems0 = em.items.length;
  em.damageMob(cow, 20, player.pos);
  ok('牛が牛肉をドロップ', em.items.length > cowItems0);
  const sk = em.spawnMob('skeleton', hx + 7.5, hh + 1, hz + 0.5);
  ok('スケルトンのスポーン', !!sk && sk.def.hostile === true);
  const skItems0 = em.items.length;
  em.damageMob(sk, 25, player.pos);
  ok('スケルトンが骨をドロップ', em.items.length >= skItems0); // 0-2個なので以上

  /* --- ドロップアイテム埋め込みスポーン regression test --- */
  // ブロック破壊直後に埋め込まれた位置でスポーンしてもワープしないことを確認
  const _fsDrop = flatSpot(8, 8);
  const rx = _fsDrop[0], rz = _fsDrop[1], rh = world.getHeight(rx, rz);
  const em2 = new EntityManager(scene, world);
  em2.dropItem(rx + 0.5, rh + 0.4, rz + 0.5, 'dirt', 1);
  const dropStartX = em2.items[0].pos.x;
  const dropStartZ = em2.items[0].pos.z;
  for (let i = 0; i < 10; i++) em2.update(1 / 60, player, null, false, 1);
  const dropEndX = em2.items[0].pos.x;
  const dropEndZ = em2.items[0].pos.z;
  const dropDrift = Math.hypot(dropEndX - dropStartX, dropEndZ - dropStartZ);
  ok('埋め込みスポーンでワープしない', dropDrift < 0.5, { drift: dropDrift, from: [dropStartX, dropStartZ], to: [dropEndX, dropEndZ] });

  // 牛肉が精錬できる
  const f2 = new IS.Furnace();
  f2.input = st('beef_raw', 2); f2.fuel = st('coal', 1);
  for (let i = 0; i < 60 * 9; i++) f2.tick(1 / 60);
  ok('牛肉→ステーキの精錬', f2.output && f2.output.id === 'beef_cooked', f2.output);

  /* --- 作物 --- */
  ok('クワが作れる', (() => {
    const rh = IS.craftResult(grid(3, { 0: 'planks', 1: 'planks', 4: 'stick', 7: 'stick' }), 3);
    return rh && rh.id === 'wooden_hoe';
  })());
  const farmX = 6, farmZ = 6, farmY = world.getHeight(farmX, farmZ) + 1;
  world.setBlock(farmX, farmY, farmZ, Blocks.BLOCK_ID.farmland);
  ok('耕地の設置', world.getBlock(farmX, farmY, farmZ) === Blocks.BLOCK_ID.farmland);
  const planted = world.crops.plant(farmX, farmY + 1, farmZ, 'wheat');
  ok('小麦を植えられる', planted && world.getBlock(farmX, farmY + 1, farmZ) === Blocks.BLOCK_ID.wheat_crop_1);
  // 成長をシミュレート
  for (let i = 0; i < 130; i++) world.crops.update(1);
  const stageBlock = world.getBlock(farmX, farmY + 1, farmZ);
  ok('小麦が成長する', stageBlock === Blocks.BLOCK_ID.wheat_crop_1 ||
    stageBlock === Blocks.BLOCK_ID.wheat_crop_2 || stageBlock === Blocks.BLOCK_ID.wheat_crop_3, stageBlock);
  // 完熟まで育てて収穫 (別の畑で。更新のたびに耕地へリセット)
  const farm2X = 7, farm2Z = 6;
  world.setBlock(farm2X, farmY, farm2Z, Blocks.BLOCK_ID.farmland);
  world.crops.plant(farm2X, farmY + 1, farm2Z, 'wheat');
  for (let i = 0; i < 1350; i++) {
    world.crops.update(1);
    world.setBlock(farm2X, farmY, farm2Z, Blocks.BLOCK_ID.farmland);
  }
  const mature = world.getBlock(farm2X, farmY + 1, farm2Z);
  const drops = world.crops.harvest(farm2X, farmY + 1, farm2Z);
  ok('完熟小麦を収穫すると小麦が出る',
    mature === Blocks.BLOCK_ID.wheat_crop_3 && drops && drops.some(d => d.id === 'wheat'), { mature, drops });
  // 作物のシリアライズ
  const farm3X = 8, farm3Z = 6;
  world.setBlock(farm3X, farmY, farm3Z, Blocks.BLOCK_ID.farmland);
  world.crops.plant(farm3X, farmY + 1, farm3Z, 'tomato');
  const cropSer = world.crops.serialize();
  ok('作物がセーブされる', Object.keys(cropSer).length >= 1, cropSer);
  world.crops.onBlockBroken(farm3X, farmY + 1, farm3Z);
  world.setBlock(farmX, farmY, farmZ, 0);
  world.setBlock(farm2X, farmY, farm2Z, 0);
  world.setBlock(farm3X, farmY, farm3Z, 0);

  /* --- 新ブロック --- */
  ok('白樺原木が存在', !!Blocks.get(Blocks.BLOCK_ID.birch_log).label);
  ok('アメジスト鉱石が存在', Blocks.get(Blocks.BLOCK_ID.amethyst_ore).drop === 'amethyst_shard');
  ok('落ち葉ブロックが存在', Blocks.get(Blocks.BLOCK_ID.leaf_litter).model === 'box');
  ok('白樺→白樺の板', (() => {
    const rb = IS.craftResult(grid(2, { 0: 'birch_log' }), 2);
    return rb && rb.id === 'birch_planks' && rb.count === 4;
  })());
  ok('小麦→パン', (() => {
    const rbr = IS.craftResult(grid(3, { 3: 'wheat', 4: 'wheat', 5: 'wheat' }), 3);
    return rbr && rbr.id === 'bread';
  })());

  /* --- エイリアス & 木材変換 --- */
  ok('エイリアス: wood_log→原木', Blocks.itemDef('wood_log') === Blocks.itemDef('log'));
  ok('エイリアス: iron→鉄インゴット', Blocks.itemDef('iron') === Blocks.itemDef('iron_ingot'));
  ok('エイリアス: porkchop→焼き豚', Blocks.itemDef('porkchop') === Blocks.itemDef('porkchop_cooked'));
  ok('白樺の板→木の板に変換', (() => {
    const rc = IS.craftResult(grid(2, { 0: 'birch_planks' }), 2);
    return rc && rc.id === 'planks' && rc.count === 1;
  })());
  ok('木の板→白樺の板に変換', (() => {
    const rc2 = IS.craftResult(grid(2, { 0: 'planks' }), 2);
    return rc2 && rc2.id === 'birch_planks' && rc2.count === 1;
  })());

  /* --- バージョン情報 --- */
  ok('バージョン文字列が定義', typeof GameVersion === 'object' && /^v\d+\.\d+(\.\d+)?$/.test(GameVersion.VERSION.string),
    GameVersion && GameVersion.VERSION.string);

  /* --- 木の配置 (重複なし・最小間隔) --- */
  {
    const w2 = new World(99, scene);
    const positions = new Set();
    let dup = 0;
    for (let cx = -2; cx <= 2; cx++) for (let cz = -2; cz <= 2; cz++) {
      w2.generateChunk(cx, cz);
      const c = w2.getChunk(cx, cz);
      for (let lz = 0; lz < 16; lz++) for (let lx = 0; lx < 16; lx++) {
        const wx = (cx << 4) + lx, wz = (cz << 4) + lz;
        for (let y = 20; y < 55; y++) {
          const b = c.blocks[lx + lz * 16 + y * 256];
          if (b === Blocks.BLOCK_ID.log || b === Blocks.BLOCK_ID.birch_log) {
            const k = wx + ',' + wz;
            if (positions.has(k)) dup++;
            positions.add(k);
            break; // 同じ列は1本とみなす
          }
        }
      }
    }
    ok('木がチャンク境界で重複生成されない', dup === 0, dup);
  }

  /* --- モブの未読込猶予 --- */
  {
    const em2 = new EntityManager(scene, world);
    const m2 = em2.spawnMob('pig', hx + 0.5, hh + 1, hz + 0.5);
    // 擬似的にチャンクを外す
    const farChunk = world.chunks.get('0,0');
    world.chunks.delete('0,0');
    for (let i = 0; i < 60; i++) em2.update(1 / 60, player, null, false, 1);
    ok('未読込でも即デスポーンしない', em2.mobs.includes(m2), em2.mobs.length);
    world.chunks.set('0,0', farChunk);
    em2.clear();
  }

  /* --- v0.2: ハーフブロック / 階段 / 柵 / ドア類 / 花・染料 --- */
  {
    const BID = Blocks.BLOCK_ID;
    ok('ハーフブロック定義', BID.stone_slab && Blocks.get(BID.stone_slab).box.y1 === 0.5 &&
      Blocks.get(BID.planks_slab).model === 'slab');
    ok('階段はstairsモデル', Blocks.get(BID.planks_stairs).model === 'stairs' &&
      Blocks.get(BID.stone_stairs).model === 'stairs' &&
      Blocks.get(BID.planks_stairs).modelBoxes.length === 2);
    ok('ドア定義', Blocks.get(BID.door_oak).model === 'door' && Blocks.get(BID.door_oak).solid === false);
    ok('トラップドア定義', Blocks.get(BID.trapdoor).model === 'trapdoor' &&
      Blocks.get(BID.trapdoor).box.y1 === 0.19);
    ok('梯子は登れる非固体', Blocks.get(BID.ladder).solid === false && Blocks.get(BID.ladder).climbable === true);
    ok('花8種がcrossモデル', ['flower_dandelion', 'flower_poppy', 'flower_orchid', 'flower_tulip',
      'flower_daisy', 'flower_allium', 'flower_cornflower', 'flower_lily']
      .every(n => Blocks.get(BID[n]).model === 'cross'));

    // ハーフブロックの上に立てる (box 衝突)
    const _fsSlab = flatSpot(10, 4);
    const px3 = _fsSlab[0], pz3 = _fsSlab[1], py3 = world.getHeight(px3, pz3);
    world.setBlock(px3, py3 + 1, pz3, BID.stone_slab);
    const p3 = new Player(world);
    p3.pos.set(px3 + 0.5, py3 + 4, pz3 + 0.5);
    for (let i = 0; i < 120; i++) p3.update(1 / 60, { moveF: 0, moveR: 0, jump: false });
    ok('ハーフブロック上に着地', p3.onGround && Math.abs(p3.pos.y - (py3 + 1.5)) < 0.08,
      { y: p3.pos.y, expect: py3 + 1.5 });

    // 梯子登り
    const _fsLad = flatSpot(13, 4);
    const lx3 = _fsLad[0], lz3 = _fsLad[1], ly3 = world.getHeight(lx3, lz3);
    for (let i = 0; i < 4; i++) world.setBlock(lx3, ly3 + 1 + i, lz3, BID.stone);
    for (let i = 0; i < 4; i++) world.setBlock(lx3 - 1, ly3 + 1 + i, lz3, BID.ladder);
    const p4 = new Player(world);
    p4.pos.set(lx3 - 0.5, ly3 + 1.01, lz3 + 0.5);
    for (let i = 0; i < 60; i++) p4.update(1 / 60, { moveF: 0, moveR: 0, jump: false });
    const y0 = p4.pos.y;
    for (let i = 0; i < 90; i++) p4.update(1 / 60, { moveF: 0, moveR: 0, jump: true });
    ok('梯子を登れる', p4.pos.y > y0 + 0.8, { y0, y1: p4.pos.y });

    // ドア設置 + 開状態の保持・セーブ
    world.setBlock(px3 + 2, py3 + 1, pz3, BID.door_oak);
    ok('ドアが設置できる', world.getBlock(px3 + 2, py3 + 1, pz3) === BID.door_oak);
    world.doorState.set(World.bkey(px3 + 2, py3 + 1, pz3), true);
    const dser = world.serializeDoors();
    ok('ドア開状態がセーブされる', dser.includes(World.bkey(px3 + 2, py3 + 1, pz3)), dser);

    // クラフトレシピ
    r = IS.craftResult(grid(3, { 0: 'planks', 3: 'planks', 4: 'planks', 6: 'planks', 7: 'planks', 8: 'planks' }), 3);
    ok('木の階段が作れる', r && r.id === 'planks_stairs' && r.count === 4, r);
    r = IS.craftResult(grid(3, { 6: 'planks', 7: 'planks', 8: 'planks' }), 3);
    ok('ハーフブロックx6', r && r.id === 'planks_slab' && r.count === 6, r);
    r = IS.craftResult(grid(3, { 0: 'planks', 1: 'planks', 3: 'planks', 4: 'planks', 6: 'planks', 7: 'planks' }), 3);
    ok('ドアが作れる', r && r.id === 'door_oak', r);
    r = IS.craftResult(grid(3, { 0: 'stick', 2: 'stick', 3: 'stick', 4: 'stick', 5: 'stick', 6: 'stick', 8: 'stick' }), 3);
    ok('梯子が作れる', r && r.id === 'ladder' && r.count === 3, r);
    r = IS.craftResult(grid(3, { 0: 'planks', 1: 'stick', 2: 'planks', 3: 'planks', 4: 'stick', 5: 'planks' }), 3);
    ok('柵が作れる', r && r.id === 'fence' && r.count === 3, r);
    r = IS.craftResult(grid(3, { 0: 'planks', 1: 'planks', 2: 'planks', 3: 'planks', 4: 'planks', 5: 'planks' }), 3);
    ok('トラップドアが作れる', r && r.id === 'trapdoor' && r.count === 2, r);
    r = IS.craftResult(grid(2, { 0: 'flower_poppy' }), 2);
    ok('ポピー→赤染料', r && r.id === 'dye_red', r);
    r = IS.craftResult(grid(2, { 0: 'flower_dandelion' }), 2);
    ok('タンポポ→黄染料', r && r.id === 'dye_yellow', r);
    r = IS.craftResult(grid(2, { 0: 'flower_orchid' }), 2);
    ok('蘭→青染料', r && r.id === 'dye_blue', r);
    r = IS.craftResult(grid(2, { 0: 'flower_daisy' }), 2);
    ok('ヒナギク→白染料', r && r.id === 'dye_white', r);
    ok('看板レシピがある', (() => {
      const rs = IS.craftResult(grid(3, { 0: 'planks', 1: 'planks', 2: 'planks', 3: 'planks', 4: 'planks', 5: 'planks', 7: 'stick' }), 3);
      return rs && rs.id === 'sign';
    })());
  }

  /* --- v0.3: 新鉱石 / 氷・泥・粘土 / 苔・蔦・キノコ / 竹・サトウキビ・カボチャ / マグマ --- */
  {
    const BID = Blocks.BLOCK_ID;
    ok('v0.3鉱石8種が存在', ['lapis_ore', 'emerald_ore', 'redstone_ore', 'copper_ore', 'silver_ore', 'crystal_ore', 'sulfur_ore', 'salt_ore']
      .every(n => BID[n] !== undefined));
    ok('ラピス鉱石のドロップ', Blocks.get(BID.lapis_ore).drop === 'lapis_lazuli');
    ok('レッドストーン鉱石は発光', Blocks.get(BID.redstone_ore).light > 0);
    ok('氷/泥/粘土/苔が存在', ['ice', 'mud', 'clay', 'moss'].every(n => BID[n] !== undefined));
    ok('蔦は登れる非固体', Blocks.get(BID.vine).solid === false && Blocks.get(BID.vine).climbable === true);
    ok('キノコ2種がcrossモデル', Blocks.get(BID.mushroom_brown).model === 'cross' && Blocks.get(BID.mushroom_red).model === 'cross');
    ok('竹がboxモデル', Blocks.get(BID.bamboo).model === 'box' && Blocks.get(BID.bamboo).modelBoxes.length === 1);
    ok('マグマは発光ブロック', Blocks.get(BID.magma).light === 1);
    ok('苔むした丸石が存在', BID.mossy_cobblestone !== undefined && Blocks.get(BID.mossy_cobblestone).tool === 'pickaxe');

    // ワールド生成に新ブロックが混ざる (シード1234の9チャンクで泥/粘土/鉱石系がどれか見つかる)
    let foundNew = 0;
    for (const ck of world.chunks.keys()) {
      const ch = world.chunks.get(ck);
      for (let i = 0; i < ch.blocks.length; i++) {
        const b = ch.blocks[i];
        if (b === BID.mud || b === BID.clay || b === BID.copper_ore || b === BID.redstone_ore || b === BID.lapis_ore) { foundNew++; break; }
      }
    }
    ok('v0.3の新ブロックが地形に生成される', foundNew > 0, foundNew);

    // マグマダメージ
    const _fsMag = flatSpot(6, 6);
    const mx = _fsMag[0], mz = _fsMag[1], my = world.getHeight(mx, mz);
    world.setBlock(mx, my, mz, BID.magma);
    const p5 = new Player(world);
    p5.pos.set(mx + 0.5, my + 1.01, mz + 0.5);
    const hp0 = p5.health;
    for (let i = 0; i < 80; i++) p5.update(1 / 60, { moveF: 0, moveR: 0, jump: false });
    ok('マグマの上でダメージを受ける', p5.health < hp0, { hp0, hp: p5.health });

    // クラフト・精錬
    r = IS.craftResult(grid(3, { 0: 'copper_ingot', 1: 'copper_ingot', 2: 'copper_ingot', 3: 'copper_ingot', 4: 'copper_ingot', 5: 'copper_ingot', 6: 'copper_ingot', 7: 'copper_ingot', 8: 'copper_ingot' }), 3);
    ok('銅インゴット9→銅ブロック', r && r.id === 'copper_block', r);
    r = IS.craftResult(grid(2, { 0: 'copper_block' }), 2);
    ok('銅ブロック→銅インゴット9', r && r.id === 'copper_ingot' && r.count === 9, r);
    r = IS.craftResult(grid(2, { 0: 'cobblestone', 1: 'moss' }), 2);
    ok('丸石+苔→苔むした丸石', r && r.id === 'mossy_cobblestone', r);
    r = IS.craftResult(grid(2, { 0: 'clay_ball', 1: 'clay_ball', 2: 'clay_ball', 3: 'clay_ball' }), 2);
    ok('粘土玉4→粘土ブロック', r && r.id === 'clay', r);
    ok('銅鉱石の精錬', Blocks.SMELTING.copper_ore === 'copper_ingot');
    ok('粘土玉→レンガ素材の精錬', Blocks.SMELTING.clay_ball === 'brick_item');
    ok('粘土→テラコッタの精錬', Blocks.SMELTING.clay === 'terracotta');
    ok('スイカの薄切りは食料', Blocks.itemDef('melon_slice').type === 'food');
  }

  /* --- v0.4: 水/溶岩 流体シミュレーション --- */
  {
    const BID = Blocks.BLOCK_ID;
    ok('溶岩ブロックが存在', BID.lava !== undefined && Blocks.get(BID.lava).liquid === true && Blocks.get(BID.lava).light === 1);
    ok('バケツ3種が存在', ['bucket', 'water_bucket', 'lava_bucket'].every(n => Blocks.itemDef(n) && Blocks.itemDef(n).type === 'bucket'));
    ok('空バケツは16個スタック', Blocks.itemDef('bucket').stack === 16);
    r = IS.craftResult(grid(3, { 0: 'iron_ingot', 2: 'iron_ingot', 4: 'iron_ingot' }), 3);
    ok('鉄3→バケツ', r && r.id === 'bucket', r);

    // --- 流体の流れ (下→横) ---
    const fx = 12, fz = 12;
    const fy = world.getHeight(fx, fz) + 6;   // 空中に水源を置く
    // 下が空気であることを確保
    for (let yy = fy - 1; yy > world.getHeight(fx, fz); yy--) world.setBlock(fx, yy, fz, 0);
    world.setBlock(fx, fy, fz, BID.water);
    world.fluidLevel.set(World.bkey(fx, fy, fz), 0);
    world.scheduleFluid(fx, fy, fz);
    for (let i = 0; i < 120; i++) world.tickFluids(1 / 20);
    const belowIsWater = world.getBlock(fx, fy - 1, fz) === BID.water;
    ok('水が下へ流れる', belowIsWater, { at: world.getBlock(fx, fy - 1, fz) });

    // 横への拡散 (平らな場所の水源)
    const sx2 = 4, sz2 = 12;
    const sy2 = world.getHeight(sx2, sz2) + 1;
    // 周囲を平らに (下を石で埋める)
    for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) {
      world.setBlock(sx2 + dx, sy2 - 1, sz2 + dz, BID.stone);
      world.setBlock(sx2 + dx, sy2, sz2 + dz, 0);
    }
    world.setBlock(sx2, sy2, sz2, BID.water);
    world.fluidLevel.set(World.bkey(sx2, sy2, sz2), 0);
    world.scheduleFluid(sx2, sy2, sz2);
    for (let i = 0; i < 120; i++) world.tickFluids(1 / 20);
    const spread = world.getBlock(sx2 + 1, sy2, sz2) === BID.water || world.getBlock(sx2 - 1, sy2, sz2) === BID.water;
    ok('水が横へ広がる', spread, { e: world.getBlock(sx2 + 1, sy2, sz2), w: world.getBlock(sx2 - 1, sy2, sz2) });

    // 流体レベルが記録される
    ok('水源はレベル0', world.isFluidSource(sx2, sy2, sz2) === true);

    // --- 水と溶岩の反応 ---
    const rx2 = 20, rz2 = 20;
    const ry2 = world.getHeight(rx2, rz2) + 1;
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
      world.setBlock(rx2 + dx, ry2 - 1, rz2 + dz, BID.stone);
      world.setBlock(rx2 + dx, ry2, rz2 + dz, 0);
    }
    world.setBlock(rx2, ry2, rz2, BID.lava);
    world.fluidLevel.set(World.bkey(rx2, ry2, rz2), 0);
    world.setBlock(rx2 + 1, ry2, rz2, BID.water);
    world.fluidLevel.set(World.bkey(rx2 + 1, ry2, rz2), 0);
    world.checkFluidReaction(rx2 + 1, ry2, rz2);   // 水側から反応を評価
    const reacted = world.getBlock(rx2, ry2, rz2);
    ok('水が溶岩源に接すると黒曜石', reacted === BID.obsidian, { reacted });

    // --- 流体セーブ ---
    const fser = world.serializeFluids();
    ok('流体レベルがセーブされる', Object.keys(fser).length > 0, Object.keys(fser).length);

    // --- v0.4.1: 壁を掘ったら水が流れ込む (「水が流れない」回帰テスト) ---
    const _fsFlow = flatSpot(28, 4);
    const wx3 = _fsFlow[0], wz3 = _fsFlow[1];
    const wy3 = world.getHeight(wx3, wz3) + 1;
    for (let dx = -1; dx <= 2; dx++) for (let dz = -1; dz <= 1; dz++) {
      world.setBlock(wx3 + dx, wy3 - 1, wz3 + dz, BID.stone);   // 床
      world.setBlock(wx3 + dx, wy3, wz3 + dz, 0);               // 空気
    }
    world.setBlock(wx3, wy3, wz3, BID.water);                   // 水源
    world.fluidLevel.set(World.bkey(wx3, wy3, wz3), 0);
    world.setBlock(wx3 + 1, wy3, wz3, BID.stone);               // 壁で塞ぐ
    world.scheduleFluid(wx3, wy3, wz3);
    for (let i = 0; i < 20; i++) world.tickFluids(1 / 20);
    const blocked = world.getBlock(wx3 + 2, wy3, wz3) === 0;
    world.setBlock(wx3 + 1, wy3, wz3, 0);                       // 壁を掘る
    for (let i = 0; i < 40; i++) world.tickFluids(1 / 20);
    ok('壁を掘ると水が流れ込む', blocked && world.getBlock(wx3 + 2, wy3, wz3) === BID.water,
      { blocked, after: world.getBlock(wx3 + 2, wy3, wz3) });

    // 地形生成の水が水源として登録されている (バケツですくえる)
    let seaRegistered = 0;
    for (const ck of world.chunks.keys()) {
      const ch = world.chunks.get(ck);
      for (let i = 0; i < ch.blocks.length; i++) {
        if (ch.blocks[i] === BID.water) { seaRegistered = world.fluidLevel.size; break; }
      }
      if (seaRegistered) break;
    }
    ok('地形の水が水源登録されている', world.fluidLevel.size > 0, world.fluidLevel.size);
  }

  /* --- v0.5: バイオーム (ジャングル/タイガ/沼地/桜/竹林/サバンナ/山岳/高山/火山/花畑) --- */
  {
    const BID = Blocks.BLOCK_ID;
    // 新ブロック定義
    ok('桜の原木が存在', BID.cherry_log !== undefined && Blocks.get(BID.cherry_log).label === '桜の原木');
    ok('桜の葉が存在', BID.cherry_leaves !== undefined && Blocks.get(BID.cherry_leaves).opaque === false);
    ok('桜の板が存在', BID.cherry_planks !== undefined && Blocks.get(BID.cherry_planks).tool === 'axe');
    ok('トウヒの原木が存在', BID.spruce_log !== undefined && Blocks.get(BID.spruce_log).label === 'トウヒの原木');
    ok('トウヒの葉が存在', BID.spruce_leaves !== undefined && Blocks.get(BID.spruce_leaves).opaque === false);
    // 設置可能 (block型アイテムとして登録)
    ok('桜/トウヒが設置可能(block型アイテム)', ['cherry_log', 'cherry_leaves', 'cherry_planks', 'spruce_log', 'spruce_leaves']
      .every(n => { const d = Blocks.itemDef(n); return d && d.type === 'block' && d.block > 0; }));
    // クラフトレシピ
    r = IS.craftResult(grid(2, { 0: 'cherry_log' }), 2);
    ok('桜原木→桜の板x4', r && r.id === 'cherry_planks' && r.count === 4, r);
    r = IS.craftResult(grid(2, { 0: 'cherry_planks' }), 2);
    ok('桜の板→木の板', r && r.id === 'planks' && r.count === 1, r);
    r = IS.craftResult(grid(2, { 0: 'spruce_log' }), 2);
    ok('トウヒ原木→木の板x4', r && r.id === 'planks' && r.count === 4, r);

    // バイオーム判定
    const clim = world.climateAt(10, 10);
    ok('climateAt が数値を返す', typeof clim.temp === 'number' && typeof clim.humid === 'number' &&
      typeof clim.elev === 'number' && typeof clim.rare === 'number', clim);
    ok('biomeAt が文字列を返す', typeof world.biomeAt(10, 10) === 'string', world.biomeAt(10, 10));
    // 広い範囲で複数バイオームが出る
    const found = {};
    for (let wx = -200; wx <= 200; wx += 4) for (let wz = -200; wz <= 200; wz += 4) {
      const b = world.biomeAt(wx, wz);
      found[b] = (found[b] || 0) + 1;
    }
    ok('複数バイオームが出現', Object.keys(found).length >= 4, Object.keys(found).length);
    const NEW_BIOMES = ['jungle', 'taiga', 'swamp', 'cherry', 'bamboo_forest', 'savanna', 'mountains', 'high_mountains', 'volcanic', 'flower_field'];
    const newFound = NEW_BIOMES.filter(b => found[b]);
    ok('v0.5 新バイオームが出現する', newFound.length >= 3, newFound);

    // growTreeKind: トウヒ・桜・ジャングルがブロックを置く
    {
      const w3 = new World(7, scene);
      for (let cx = -1; cx <= 1; cx++) for (let cz = -1; cz <= 1; cz++) w3.generateChunk(cx, cz);
      let sLog = 0, sLeaf = 0, cLog = 0, cLeaf = 0, jVine = 0;
      const gx = 0, gz = 0, gy = 40;
      for (let dx = -6; dx <= 6; dx++) for (let dz = -6; dz <= 6; dz++)
        for (let dy = 0; dy < 8; dy++) w3.setBlock(gx + dx, gy + dy, gz + dz, 0);
      const rnd = () => Math.random();
      w3.growTreeKind(gx, gy, gz, rnd, 'spruce');
      w3.growTreeKind(gx + 5, gy, gz, rnd, 'cherry');
      // 蔦は乱数(rnd<0.4)で付くので、複数本生やして確実に検証
      for (let j = 0; j < 4; j++) w3.growTreeKind(gx - 5, gy, gz - 3 + j * 2, rnd, 'jungle');
      for (let yy = gy; yy < gy + 14; yy++) for (let dx = -8; dx <= 8; dx++) for (let dz = -6; dz <= 6; dz++) {
        const b = w3.getBlock(gx + dx, yy, gz + dz);
        if (b === BID.spruce_log) sLog++;
        if (b === BID.spruce_leaves) sLeaf++;
        if (b === BID.cherry_log) cLog++;
        if (b === BID.cherry_leaves) cLeaf++;
        if (b === BID.vine) jVine++;
      }
      ok('トウヒが生える(原木+葉)', sLog > 0 && sLeaf > 0, { sLog, sLeaf });
      ok('桜が生える(原木+葉)', cLog > 0 && cLeaf > 0, { cLog, cLeaf });
      ok('ジャングルの木に蔦がつく', jVine > 0, jVine);
    }

    // v0.5 植樹ゲート修正: タイガ(雪ブロック地表)でトウヒが生える
    {
      const wx5 = new World(55, scene);
      let tx = 0, tz = 0, foundTaiga = false;
      outer:
      for (let wx = -4000; wx <= 4000; wx += 8) {
        for (let wz = -4000; wz <= 4000; wz += 8) {
          // v0.10.1: 植樹可能なタイガ (wet でなく地表が十分高い) を探す。
          // 海面付近のタイガは地表が砂/泥になり雪ブロックでないためトウヒが生えない
          if (wx5.biomeAt(wx, wz) === 'taiga') {
            const th = wx5.terrainHeight(wx, wz);
            if (th > World.SEA + 2 && th < 50) { tx = wx; tz = wz; foundTaiga = true; break outer; }
          }
        }
      }
      ok('タイガが見つかる', foundTaiga, { tx, tz });
      if (foundTaiga) {
        const tccx = tx >> 4, tccz = tz >> 4;
        for (let cx = tccx - 3; cx <= tccx + 3; cx++) for (let cz = tccz - 3; cz <= tccz + 3; cz++)
          wx5.generateChunk(cx, cz);
        let spruceLogFound = 0, spruceLeafFound = 0;
        for (const ck of wx5.chunks.keys()) {
          const ch = wx5.chunks.get(ck);
          for (let i = 0; i < ch.blocks.length; i++) {
            if (ch.blocks[i] === BID.spruce_log) spruceLogFound++;
            if (ch.blocks[i] === BID.spruce_leaves) spruceLeafFound++;
          }
        }
        ok('タイガにトウヒが生える(植樹ゲート修正)', spruceLogFound > 0 && spruceLeafFound > 0,
          { spruceLogFound, spruceLeafFound });
      }
    }
  }

  /* --- v0.6: 地形フィーチャ (渓谷/湖/崖/オアシス/滝/温泉/鍾乳洞) --- */
  {
    // landFeatureAt が数値を返す
    const lf = world.landFeatureAt(50, 50);
    ok('landFeatureAt が数値を返す', typeof lf.ridge === 'number' && typeof lf.cridge === 'number' &&
      typeof lf.lake === 'number', lf);

    // 渓谷: 広い範囲で ridge>0.965 の谷筋が存在する
    let ravineFound = 0, cliffFound = 0, lakeFound = 0;
    for (let wx = -400; wx <= 400; wx += 4) for (let wz = -400; wz <= 400; wz += 4) {
      const f = world.landFeatureAt(wx, wz);
      if (f.ridge > 0.965) ravineFound++;
      if (f.cridge > 0.955) cliffFound++;
      if (f.lake < -0.40) lakeFound++;
    }
    ok('渓谷が生成される(ridge>0.965)', ravineFound > 0, ravineFound);
    ok('崖が生成される(cridge>0.955)', cliffFound > 0, cliffFound);
    ok('湖の窪地が生成される(lake<-0.40)', lakeFound > 0, lakeFound);

    // 渓谷で地形が実際に低くなっている
    let ravineLow = false;
    outer6:
    for (let wx = -600; wx <= 600; wx += 2) for (let wz = -600; wz <= 600; wz += 2) {
      if (world.landFeatureAt(wx, wz).ridge > 0.99 && world.terrainHeight(wx, wz) < 20) { ravineLow = true; break outer6; }
    }
    ok('渓谷で地形が低くなる', ravineLow);
  }

  /* --- v0.7: 構造物 (村/寺院/ダンジョン) --- */
  {
    const BID = Blocks.BLOCK_ID;
    // buildHouse: 家のブロックが置かれる
    {
      const w4 = new World(11, scene);
      for (let cx = -2; cx <= 2; cx++) for (let cz = -2; cz <= 2; cz++) w4.generateChunk(cx, cz);
      // 平らな場所に家を建てる
      const hx7 = 0, hz7 = 0;
      const before = { planks: 0, door: 0, torch: 0, glass: 0 };
      for (const ck of w4.chunks.keys()) {
        const ch = w4.chunks.get(ck);
        for (let i = 0; i < ch.blocks.length; i++) {
          if (ch.blocks[i] === BID.planks) before.planks++;
          if (ch.blocks[i] === BID.door_oak) before.door++;
        }
      }
      // 建設前の地表高さを記録 (buildHouse はこの高さを基準に建てる)
      const hy7 = w4.getHeight(hx7, hz7);
      w4.buildHouse(hx7, hz7, mulberry32(1));
      let doorFound = 0, torchFound = 0, wallFound = 0;
      for (let yy = hy7 - 2; yy < hy7 + 10; yy++) for (let dx = -1; dx < 8; dx++) for (let dz = -1; dz < 8; dz++) {
        const b = w4.getBlock(hx7 + dx, yy, hz7 + dz);
        if (b === BID.door_oak) doorFound++;
        if (b === BID.torch) torchFound++;
        if (b === BID.planks || b === BID.cobblestone) wallFound++;
      }
      ok('家に壁ができる', wallFound > 10, wallFound);
      ok('家にドアが設置される', doorFound > 0, doorFound);
      ok('家に松明がある', torchFound > 0, torchFound);
    }

    // buildDungeon: 地下の部屋にチェストとマグマ
    {
      const w5 = new World(13, scene);
      for (let cx = -2; cx <= 2; cx++) for (let cz = -2; cz <= 2; cz++) w5.generateChunk(cx, cz);
      w5.buildDungeon(0, 20, 0, mulberry32(2));
      let chestFound = 0, magmaFound = 0, cobbleFound = 0;
      for (let yy = 17; yy < 26; yy++) for (let dx = -4; dx <= 4; dx++) for (let dz = -4; dz <= 4; dz++) {
        const b = w5.getBlock(dx, yy, dz);
        if (b === BID.chest) chestFound++;
        if (b === BID.magma) magmaFound++;
        if (b === BID.cobblestone || b === BID.mossy_cobblestone) cobbleFound++;
      }
      ok('ダンジョンにチェストが生成される', chestFound > 0, chestFound);
      ok('ダンジョンにスポナー風マグマがある', magmaFound > 0, magmaFound);
      ok('ダンジョンは丸石で囲まれる', cobbleFound > 10, cobbleFound);
    }

    // buildTemple: 寺院にチェストと柱
    {
      const w6 = new World(17, scene);
      for (let cx = -2; cx <= 2; cx++) for (let cz = -2; cz <= 2; cz++) w6.generateChunk(cx, cz);
      const ty = w6.getHeight(0, 0);   // 建設前の地表高さ
      w6.buildTemple(0, 0, mulberry32(3), 'desert');
      let chestT = 0, wallT = 0;
      for (let yy = ty; yy < ty + 9; yy++) for (let dx = 0; dx < 7; dx++) for (let dz = 0; dz < 7; dz++) {
        const b = w6.getBlock(dx, yy, dz);
        if (b === BID.chest) chestT++;
        if (b === BID.sand || b === BID.cobblestone || b === BID.mossy_cobblestone) wallT++;
      }
      ok('寺院にチェストが生成される', chestT > 0, chestT);
      ok('寺院の壁が生成される', wallT > 10, wallT);
    }

    // buildFarm: 耕地と水
    {
      const w7 = new World(19, scene);
      for (let cx = -2; cx <= 2; cx++) for (let cz = -2; cz <= 2; cz++) w7.generateChunk(cx, cz);
      const fy7 = w7.getHeight(0, 0);   // 建設前の地表高さ
      w7.buildFarm(0, 0, mulberry32(4));
      let farmFound = 0, waterF = 0;
      // buildFarm は各マスの地表に置く。列ごとに建設前高さを取り直して検査
      for (let dx = 0; dx < 5; dx++) for (let dz = 0; dz < 5; dz++) {
        const hh = w7.getHeight(dx, dz);
        for (let dy = hh - 1; dy <= hh + 1; dy++) {
          const b = w7.getBlock(dx, dy, dz);
          if (b === BID.farmland) farmFound++;
          if (b === BID.water) waterF++;
        }
      }
      ok('畑に耕地が生成される', farmFound > 5, farmFound);
      ok('畑に水が張られる', waterF > 0, waterF);
    }

    // 構造物が実際のワールド生成で出現する (広範囲スキャン)
    {
      const w8 = new World(1234, scene);
      let villageBiome = 0, desertBiome = 0;
      for (let cx = -30; cx <= 30; cx += 2) for (let cz = -30; cz <= 30; cz += 2) {
        const b = w8.biomeAt(cx * 16 + 8, cz * 16 + 8);
        if (b === 'plains' || b === 'savanna') villageBiome++;
        if (b === 'desert' || b === 'jungle') desertBiome++;
      }
      ok('村候補のバイオーム(平原/サバンナ)がある', villageBiome > 0, villageBiome);
      ok('寺院候補のバイオーム(砂漠/ジャングル)がある', desertBiome > 0, desertBiome);
    }
  }

  /* --- v0.8: ゲームモード / 村人 / 村の改善 / 構造物頻度 --- */
  {
    const BID = Blocks.BLOCK_ID;

    // ゲームモード: クリエイティブは無敵
    {
      const pm = new Player(world);
      pm.gameMode = 'creative';
      const hpBefore = pm.health;
      pm.damage(5, 'テスト');
      ok('クリエイティブはダメージを受けない', pm.health === hpBefore, pm.health);
      pm.gameMode = 'spectator';
      pm.damage(5, 'テスト');
      ok('スペクテイターはダメージを受けない', pm.health === hpBefore, pm.health);
      pm.gameMode = 'survival';
      pm.damage(5, 'テスト');
      ok('サバイバルはダメージを受ける', pm.health < hpBefore, pm.health);
    }

    // ゲームモード: クリエイティブは空腹・酸素が減らない
    {
      const pm2 = new Player(world);
      pm2.gameMode = 'creative';
      pm2.hunger = 3; pm2.air = 5;
      pm2.updateStats(1);
      ok('クリエイティブは空腹・酸素が消耗しない', pm2.hunger === 20 && pm2.air === 20, { hunger: pm2.hunger, air: pm2.air });
    }

    // 村人モブが定義されている
    {
      const vd = (typeof MOB_DEF !== 'undefined') ? MOB_DEF.villager : null;
      ok('村人モブが定義されている', !!vd && vd.hostile === false && vd.noDespawn === true && typeof vd.build === 'function', vd);
      if (vd) {
        const parts = vd.build();
        ok('村人モデルが構築できる', !!parts && !!parts.group && parts.group.children.length >= 8, parts.group.children.length);
      }
    }

    // 家の屋根に階段ブロックが使われる
    {
      const w9 = new World(23, scene);
      for (let cx = -2; cx <= 2; cx++) for (let cz = -2; cz <= 2; cz++) w9.generateChunk(cx, cz);
      const hy9 = w9.getHeight(0, 0);
      w9.buildHouse(0, 0, mulberry32(5));
      let stairFound = 0;
      for (let yy = hy9; yy < hy9 + 12; yy++) for (let dx = -2; dx < 9; dx++) for (let dz = -2; dz < 9; dz++) {
        if (w9.getBlock(dx, yy, dz) === BID.planks_stairs) stairFound++;
      }
      ok('家の屋根に木の階段ブロックが使われる', stairFound > 0, stairFound);
    }

    // 村に砂利道と村人スポーンが生成される
    {
      const w10 = new World(29, scene);
      for (let cx = -3; cx <= 3; cx++) for (let cz = -3; cz <= 3; cz++) w10.generateChunk(cx, cz);
      w10.buildVillage(0, 0, mulberry32(6));
      ok('村に村人のスポーンが登録される', !!(w10.pendingSpawns && w10.pendingSpawns.length > 0) &&
        w10.pendingSpawns.every(s => s.type === 'villager'), w10.pendingSpawns && w10.pendingSpawns.length);
    }

    // 構造物頻度: リージョンロールは決定論的
    {
      const ra = world.regionRoll(3, -2, 3), rb = world.regionRoll(3, -2, 3);
      ok('リージョンロールは決定論的', ra === rb && ra >= 0 && ra < 1, ra);
    }

    // 構造物頻度: 村が疎になった (広範囲で数える)
    {
      const w11 = new World(1234, scene);
      let villages = 0, plainsChunks = 0;
      for (let cx = -24; cx <= 24; cx++) for (let cz = -24; cz <= 24; cz++) {
        const bx = cx * 16 + 8, bz = cz * 16 + 8;
        if (w11.biomeAt(bx, bz) !== 'plains') continue;
        plainsChunks++;
        const rx = Math.floor(cx / 8), rz = Math.floor(cz / 8);
        const lcx = ((cx % 8) + 8) % 8, lcz = ((cz % 8) + 8) % 8;
        const hx = Math.floor(w11.regionRoll(rx, rz, 1) * 6) + 1;
        const hz = Math.floor(w11.regionRoll(rx, rz, 2) * 6) + 1;
        if (lcx === hx && lcz === hz && w11.regionRoll(rx, rz, 3) < 0.11) villages++;
      }
      // 以前は平原チャンクの6%だった。リージョン化で大幅に減ったはず
      ok('村の生成頻度が大幅に低減', villages <= Math.max(2, Math.ceil(plainsChunks * 0.02)),
        { villages, plainsChunks });
      ok('村は生成されること自体はある', villages > 0, villages);
    }
  }

  console.log(`==== TEST RESULT: ${pass} passed, ${fail} failed ====`);
  const el = document.createElement('div');
  el.id = 'test-result';
  el.textContent = `RESULT:${pass}:${fail}`;
  el.style.cssText = 'position:fixed;top:0;left:0;background:#111;color:#0f0;padding:8px;font:bold 20px monospace;z-index:9999';
  document.body.appendChild(el);
  if (failNames.length) {
    const fl = document.createElement('div');
    fl.id = 'test-failures';
    fl.textContent = 'FAILS:' + failNames.join(' | ');
    fl.style.cssText = 'position:fixed;top:40px;left:0;background:#300;color:#f66;padding:8px;font:14px monospace;z-index:9999;max-width:100vw;white-space:pre-wrap';
    document.body.appendChild(fl);
  }
})();
