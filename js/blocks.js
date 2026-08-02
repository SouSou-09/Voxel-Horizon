/* ==========================================================
   blocks.js — ブロック定義 / アイテム定義 / クラフトレシピ
   ========================================================== */
(function (global) {
  'use strict';
  const T = Textures.TILE;

  const BLOCKS = [];        // id -> 定義
  const BLOCK_ID = {};      // name -> id

  function block(id, name, label, opt) {
    const d = Object.assign({
      id, name, label,
      tiles: { top: 0, side: 0, bottom: 0 },
      solid: true,       // 当たり判定あり
      opaque: true,      // 隣接面をカリングする / 光を遮る
      liquid: false,
      model: 'cube',     // cube | torch | cross
      hardness: 1,
      tool: 'none',      // 適正ツール
      level: 0,          // ドロップに必要なツール強度 (0=素手可)
      drop: name,
      dropCount: 1,
      light: 0
    }, opt);
    BLOCKS[id] = d;
    BLOCK_ID[name] = id;
    return d;
  }

  function tiles(top, side, bottom) { return { top, side, bottom: bottom === undefined ? side : bottom }; }

  /** 作物などの交差プレーンモデル用の面定義 (world.js が参照) */
  const CROSS_PLANES = [
    { x0: 0.15, x1: 0.85, z: 0.5 },
    { z0: 0.15, z1: 0.85, x: 0.5 }
  ];

  BLOCKS[0] = { id: 0, name: 'air', label: '空気', solid: false, opaque: false, model: 'none', tiles: tiles(0, 0), hardness: 0 };
  BLOCK_ID.air = 0;

  block(1, 'grass', '草ブロック', { tiles: tiles(T.grass_top, T.grass_side, T.dirt), hardness: 0.6, tool: 'shovel', drop: 'dirt' });
  block(2, 'dirt', '土', { tiles: tiles(T.dirt, T.dirt), hardness: 0.5, tool: 'shovel' });
  block(3, 'stone', '石', { tiles: tiles(T.stone, T.stone), hardness: 1.5, tool: 'pickaxe', level: 1, drop: 'cobblestone' });
  block(4, 'cobblestone', '丸石', { tiles: tiles(T.cobblestone, T.cobblestone), hardness: 2.0, tool: 'pickaxe', level: 1 });
  block(5, 'log', '原木', { tiles: tiles(T.log_top, T.log_side), hardness: 2.0, tool: 'axe' });
  block(6, 'leaves', '葉', { tiles: tiles(T.leaves, T.leaves), hardness: 0.2, opaque: false, tool: 'none', drop: null });
  block(7, 'sand', '砂', { tiles: tiles(T.sand, T.sand), hardness: 0.5, tool: 'shovel' });
  block(8, 'water', '水', { tiles: tiles(T.water, T.water), hardness: Infinity, solid: false, opaque: false, liquid: true, drop: null });
  block(9, 'planks', '木の板', { tiles: tiles(T.planks, T.planks), hardness: 2.0, tool: 'axe' });
  block(10, 'glass', 'ガラス', { tiles: tiles(T.glass, T.glass), hardness: 0.3, opaque: false, drop: null });
  block(11, 'coal_ore', '石炭鉱石', { tiles: tiles(T.coal_ore, T.coal_ore), hardness: 3.0, tool: 'pickaxe', level: 1, drop: 'coal' });
  block(12, 'iron_ore', '鉄鉱石', { tiles: tiles(T.iron_ore, T.iron_ore), hardness: 3.0, tool: 'pickaxe', level: 2 });
  block(13, 'gold_ore', '金鉱石', { tiles: tiles(T.gold_ore, T.gold_ore), hardness: 3.0, tool: 'pickaxe', level: 3 });
  block(14, 'diamond_ore', 'ダイヤ鉱石', { tiles: tiles(T.diamond_ore, T.diamond_ore), hardness: 3.0, tool: 'pickaxe', level: 3, drop: 'diamond' });
  block(15, 'bedrock', '岩盤', { tiles: tiles(T.bedrock, T.bedrock), hardness: Infinity, drop: null });
  block(16, 'crafting_table', '作業台', { tiles: tiles(T.crafting_top, T.crafting_side, T.planks), hardness: 2.5, tool: 'axe' });
  block(17, 'furnace', 'かまど', { tiles: tiles(T.furnace_top, T.furnace_side, T.furnace_side), hardness: 3.5, tool: 'pickaxe', level: 1 });
  block(18, 'snow_block', '雪ブロック', { tiles: tiles(T.snow, T.snow_side, T.dirt), hardness: 0.4, tool: 'shovel' });
  block(19, 'gravel', '砂利', { tiles: tiles(T.gravel, T.gravel), hardness: 0.6, tool: 'shovel' });
  block(20, 'obsidian', '黒曜石', { tiles: tiles(T.obsidian, T.obsidian), hardness: 12, tool: 'pickaxe', level: 4 });
  block(21, 'bookshelf', '本棚', { tiles: tiles(T.planks, T.bookshelf), hardness: 2.0, tool: 'axe' });
  block(22, 'iron_block', '鉄ブロック', { tiles: tiles(T.iron_block, T.iron_block), hardness: 5, tool: 'pickaxe', level: 2 });
  block(23, 'gold_block', '金ブロック', { tiles: tiles(T.gold_block, T.gold_block), hardness: 5, tool: 'pickaxe', level: 3 });
  block(24, 'diamond_block', 'ダイヤブロック', { tiles: tiles(T.diamond_block, T.diamond_block), hardness: 5, tool: 'pickaxe', level: 3 });
  block(25, 'wool', '羊毛', { tiles: tiles(T.wool, T.wool), hardness: 0.8 });
  block(26, 'cactus', 'サボテン', { tiles: tiles(T.cactus_top, T.cactus_side), hardness: 0.4, opaque: false });
  block(27, 'torch', '松明', {
    tiles: tiles(T.torch, T.torch), hardness: 0.1, solid: false, opaque: false, model: 'torch', light: 1,
    box: { x0: 0.4, x1: 0.6, y0: 0, y1: 0.62, z0: 0.4, z1: 0.6 }
  });
  block(28, 'brick', 'レンガ', { tiles: tiles(T.brick, T.brick), hardness: 2.5, tool: 'pickaxe', level: 1 });
  block(29, 'chest', 'チェスト', { tiles: tiles(T.chest_top, T.chest_side, T.chest_top), hardness: 2.5, tool: 'axe' });
  block(30, 'bed', 'ベッド', {
    tiles: tiles(T.bed_top, T.bed_side, T.planks), hardness: 0.4, solid: false, opaque: false, model: 'box',
    box: { x0: 0, x1: 1, y0: 0, y1: 0.56, z0: 0, z1: 1 }
  });
  block(31, 'birch_log', '白樺の原木', { tiles: tiles(T.birch_log_top, T.birch_log_side), hardness: 2.0, tool: 'axe' });
  block(32, 'birch_leaves', '白樺の葉', { tiles: tiles(T.birch_leaves, T.birch_leaves), hardness: 0.2, opaque: false, drop: null });
  block(33, 'birch_planks', '白樺の板', { tiles: tiles(T.birch_planks, T.birch_planks), hardness: 2.0, tool: 'axe' });
  block(34, 'leaf_litter', '落ち葉', {
    tiles: tiles(T.leaf_litter, T.leaf_litter), hardness: 0.05, solid: false, opaque: false, model: 'box',
    box: { x0: 0, x1: 1, y0: 0, y1: 0.22, z0: 0, z1: 1 }, drop: null
  });
  block(35, 'amethyst_ore', 'アメジスト鉱石', { tiles: tiles(T.amethyst_ore, T.amethyst_ore), hardness: 3.0, tool: 'pickaxe', level: 3, drop: 'amethyst_shard', dropCount: 2 });
  block(36, 'amethyst_block', 'アメジストブロック', { tiles: tiles(T.amethyst_block, T.amethyst_block), hardness: 1.5, tool: 'pickaxe', level: 1 });
  block(37, 'farmland', '耕地', {
    tiles: tiles(T.farmland, T.dirt, T.dirt), hardness: 0.6, tool: 'shovel', drop: 'dirt',
    box: { x0: 0, x1: 1, y0: 0, y1: 0.94, z0: 0, z1: 1 }
  });
  block(38, 'farmland_wet', '湿った耕地', {
    tiles: tiles(T.farmland_wet, T.dirt, T.dirt), hardness: 0.6, tool: 'shovel', drop: 'dirt',
    box: { x0: 0, x1: 1, y0: 0, y1: 0.94, z0: 0, z1: 1 }
  });
  const cropOpt = (cropName) => ({
    tiles: tiles(T[cropName], T[cropName]), hardness: 0.05, solid: false, opaque: false, model: 'cross', drop: null
  });
  block(40, 'wheat_crop', '小麦の苗', cropOpt('wheat_crop_1'));
  block(41, 'wheat_crop_1', '小麦(幼)', cropOpt('wheat_crop_1'));
  block(42, 'wheat_crop_2', '小麦(中)', cropOpt('wheat_crop_2'));
  block(43, 'wheat_crop_3', '小麦(成熟)', cropOpt('wheat_crop_3'));
  block(44, 'rice_crop', '稲の苗', cropOpt('rice_crop_1'));
  block(45, 'rice_crop_1', '稲(幼)', cropOpt('rice_crop_1'));
  block(46, 'rice_crop_2', '稲(中)', cropOpt('rice_crop_2'));
  block(47, 'rice_crop_3', '稲(成熟)', cropOpt('rice_crop_3'));
  block(48, 'corn_crop', 'トウモロコシの苗', cropOpt('corn_crop_1'));
  block(49, 'corn_crop_1', 'トウモロコシ(幼)', cropOpt('corn_crop_1'));
  block(50, 'corn_crop_2', 'トウモロコシ(中)', cropOpt('corn_crop_2'));
  block(51, 'corn_crop_3', 'トウモロコシ(成熟)', cropOpt('corn_crop_3'));
  block(52, 'tomato_crop', 'トマトの苗', cropOpt('tomato_crop_1'));
  block(53, 'tomato_crop_1', 'トマト(幼)', cropOpt('tomato_crop_1'));
  block(54, 'tomato_crop_2', 'トマト(中)', cropOpt('tomato_crop_2'));
  block(55, 'tomato_crop_3', 'トマト(成熟)', cropOpt('tomato_crop_3'));

  /* ===== v0.2 追加: 建築パーツ ===== */
  block(56, 'door_oak', '木のドア', {
    tiles: tiles(T.door_oak, T.door_oak), hardness: 3, tool: 'axe',
    solid: false, opaque: false, model: 'door',
    modelBoxes: [{ x0: 0.44, x1: 0.56, y0: 0, y1: 1, z0: 0, z1: 1 }],
    box: { x0: 0.44, x1: 0.56, y0: 0, y1: 1, z0: 0, z1: 1 }
  });
  block(57, 'trapdoor', 'トラップドア', {
    tiles: tiles(T.trapdoor, T.trapdoor), hardness: 3, tool: 'axe',
    solid: false, opaque: false, model: 'trapdoor',
    modelBoxes: [{ x0: 0, x1: 1, y0: 0, y1: 0.19, z0: 0, z1: 1 }],
    box: { x0: 0, x1: 1, y0: 0, y1: 0.19, z0: 0, z1: 1 }
  });
  block(58, 'ladder', '梯子', {
    tiles: tiles(T.ladder, T.ladder), hardness: 0.4, tool: 'axe',
    solid: false, opaque: false, model: 'ladder',
    modelBoxes: [{ x0: 0, x1: 1, y0: 0, y1: 1, z0: 0.44, z1: 0.56 }],
    box: { x0: 0, x1: 1, y0: 0, y1: 1, z0: 0.44, z1: 0.56 }, climbable: true
  });
  block(59, 'fence', '柵', {
    tiles: tiles(T.fence, T.fence), hardness: 2, tool: 'axe',
    model: 'fence',
    modelBoxes: [
      { x0: 0.375, x1: 0.625, y0: 0, y1: 1, z0: 0.375, z1: 0.625 },  // 柱
      { x0: 0.25, x1: 0.75, y0: 0.4, y1: 0.55, z0: 0.43, z1: 0.57 }, // 横桟
      { x0: 0.25, x1: 0.75, y0: 0.7, y1: 0.85, z0: 0.43, z1: 0.57 }
    ],
    box: { x0: 0.375, x1: 0.625, y0: 0, y1: 1, z0: 0.375, z1: 0.625 }
  });
  block(60, 'sign', '看板', {
    tiles: tiles(T.sign, T.sign), hardness: 1, tool: 'axe',
    solid: false, opaque: false, model: 'sign',
    modelBoxes: [
      { x0: 0.2, x1: 0.8, y0: 0.25, y1: 0.65, z0: 0.45, z1: 0.55 },  // 板
      { x0: 0.46, x1: 0.54, y0: 0, y1: 0.25, z0: 0.46, z1: 0.54 }    // 支柱
    ],
    box: { x0: 0.2, x1: 0.8, y0: 0, y1: 0.65, z0: 0.45, z1: 0.55 }
  });
  block(61, 'stone_stairs', '石の階段', {
    tiles: tiles(T.stairs, T.stairs), hardness: 2, tool: 'pickaxe', level: 1,
    model: 'stairs',
    modelBoxes: [
      { x0: 0, x1: 1, y0: 0, y1: 0.5, z0: 0, z1: 1 },      // 下段
      { x0: 0.5, x1: 1, y0: 0.5, y1: 1, z0: 0, z1: 1 }     // 上段 (奥)
    ],
    box: { x0: 0, x1: 1, y0: 0, y1: 1, z0: 0, z1: 1 }      // 衝突判定はフルブロックとして扱う (段差登りで自然に)
  });
  block(62, 'stone_slab', '石のハーフブロック', {
    tiles: tiles(T.slab, T.slab), hardness: 2, tool: 'pickaxe', level: 1,
    model: 'slab',
    modelBoxes: [{ x0: 0, x1: 1, y0: 0, y1: 0.5, z0: 0, z1: 1 }],
    box: { x0: 0, x1: 1, y0: 0, y1: 0.5, z0: 0, z1: 1 }
  });
  block(63, 'planks_stairs', '木の階段', {
    tiles: tiles(T.planks, T.planks), hardness: 2, tool: 'axe',
    model: 'stairs',
    modelBoxes: [
      { x0: 0, x1: 1, y0: 0, y1: 0.5, z0: 0, z1: 1 },
      { x0: 0.5, x1: 1, y0: 0.5, y1: 1, z0: 0, z1: 1 }
    ],
    box: { x0: 0, x1: 1, y0: 0, y1: 1, z0: 0, z1: 1 }
  });
  block(64, 'planks_slab', '木のハーフブロック', {
    tiles: tiles(T.planks, T.planks), hardness: 2, tool: 'axe',
    model: 'slab',
    modelBoxes: [{ x0: 0, x1: 1, y0: 0, y1: 0.5, z0: 0, z1: 1 }],
    box: { x0: 0, x1: 1, y0: 0, y1: 0.5, z0: 0, z1: 1 }
  });

  /* ===== v0.2 追加: 花 ===== */
  // 花は一括登録 (BLOCK_ID を順に確保)
  const FLOWER_IDS = {};
  const FLOWERS = [
    ['dandelion', 'タンポポ'], ['poppy', 'ポピー'], ['orchid', '蘭'],
    ['tulip', 'チューリップ'], ['daisy', 'ヒナギク'], ['allium', 'アリウム'],
    ['cornflower', 'ヤグルマギク'], ['lily', 'ユリ']
  ];
  for (const [name, label] of FLOWERS) {
    const id = 70 + Object.keys(FLOWER_IDS).length;
    BLOCK_ID['flower_' + name] = id;
    FLOWER_IDS[name] = id;
    block(id, 'flower_' + name, label, {
      tiles: tiles(T['flower_' + name], T['flower_' + name]),
      hardness: 0.05, solid: false, opaque: false, model: 'cross', drop: 'flower_' + name
    });
  }

  /* ===== v0.3 追加: 新鉱石 ===== */
  block(39, 'lapis_ore', 'ラピスラズリ鉱石', { tiles: tiles(T.lapis_ore, T.lapis_ore), hardness: 3.0, tool: 'pickaxe', level: 2, drop: 'lapis_lazuli', dropCount: 2 });
  block(65, 'emerald_ore', 'エメラルド鉱石', { tiles: tiles(T.emerald_ore, T.emerald_ore), hardness: 3.0, tool: 'pickaxe', level: 3, drop: 'emerald' });
  block(66, 'redstone_ore', 'レッドストーン鉱石', { tiles: tiles(T.redstone_ore, T.redstone_ore), hardness: 3.0, tool: 'pickaxe', level: 2, drop: 'redstone_dust', dropCount: 3, light: 0.4 });
  block(67, 'copper_ore', '銅鉱石', { tiles: tiles(T.copper_ore, T.copper_ore), hardness: 3.0, tool: 'pickaxe', level: 2 });
  block(68, 'silver_ore', '銀鉱石', { tiles: tiles(T.silver_ore, T.silver_ore), hardness: 3.0, tool: 'pickaxe', level: 2 });
  block(78, 'crystal_ore', '水晶鉱石', { tiles: tiles(T.crystal_ore, T.crystal_ore), hardness: 3.0, tool: 'pickaxe', level: 3, drop: 'crystal_shard', dropCount: 2, light: 0.5 });
  block(79, 'sulfur_ore', '硫黄鉱石', { tiles: tiles(T.sulfur_ore, T.sulfur_ore), hardness: 3.0, tool: 'pickaxe', level: 1, drop: 'sulfur', dropCount: 2 });
  block(80, 'salt_ore', '岩塩鉱石', { tiles: tiles(T.salt_ore, T.salt_ore), hardness: 3.0, tool: 'pickaxe', level: 1, drop: 'salt', dropCount: 2 });

  /* ===== v0.3 追加: 地面・装飾ブロック ===== */
  block(69, 'ice', '氷', { tiles: tiles(T.ice, T.ice), hardness: 0.5, tool: 'pickaxe', opaque: false, drop: null });
  block(81, 'mud', '泥', { tiles: tiles(T.mud, T.mud), hardness: 0.5, tool: 'shovel' });
  block(82, 'clay', '粘土', { tiles: tiles(T.clay, T.clay), hardness: 0.6, tool: 'shovel', drop: 'clay_ball', dropCount: 3 });
  block(83, 'moss', '苔ブロック', { tiles: tiles(T.moss, T.moss), hardness: 0.3, tool: 'shovel' });
  block(84, 'vine', '蔦', {
    tiles: tiles(T.vine, T.vine), hardness: 0.1, solid: false, opaque: false, model: 'box', climbable: true,
    modelBoxes: [{ x0: 0, x1: 1, y0: 0, y1: 1, z0: 0, z1: 0.12 }],
    box: { x0: 0, x1: 1, y0: 0, y1: 1, z0: 0, z1: 0.12 }
  });
  block(85, 'tall_grass', '背の高い草', {
    tiles: tiles(T.tall_grass, T.tall_grass), hardness: 0.05, solid: false, opaque: false, model: 'cross', drop: null
  });
  block(86, 'mushroom_brown', '茶色のキノコ', {
    tiles: tiles(T.mushroom_brown, T.mushroom_brown), hardness: 0.05, solid: false, opaque: false, model: 'cross', drop: 'mushroom_brown'
  });
  block(87, 'mushroom_red', '赤色のキノコ', {
    tiles: tiles(T.mushroom_red, T.mushroom_red), hardness: 0.05, solid: false, opaque: false, model: 'cross', drop: 'mushroom_red'
  });
  block(88, 'bamboo', '竹', {
    tiles: tiles(T.bamboo, T.bamboo), hardness: 0.2, solid: false, opaque: false, model: 'box', tool: 'axe',
    modelBoxes: [{ x0: 0.375, x1: 0.625, y0: 0, y1: 1, z0: 0.375, z1: 0.625 }],
    box: { x0: 0.375, x1: 0.625, y0: 0, y1: 1, z0: 0.375, z1: 0.625 }
  });
  block(89, 'sugarcane', 'サトウキビ', {
    tiles: tiles(T.sugarcane, T.sugarcane), hardness: 0.05, solid: false, opaque: false, model: 'cross', drop: 'sugarcane'
  });
  block(90, 'pumpkin', 'カボチャ', { tiles: tiles(T.pumpkin_top, T.pumpkin_side), hardness: 1.0, tool: 'axe' });
  block(91, 'melon_block', 'スイカ', { tiles: tiles(T.melon_block, T.melon_block), hardness: 1.0, tool: 'axe', drop: 'melon_slice', dropCount: 4 });
  block(92, 'mossy_cobblestone', '苔むした丸石', { tiles: tiles(T.mossy_cobblestone, T.mossy_cobblestone), hardness: 2.0, tool: 'pickaxe', level: 1 });
  block(93, 'magma', 'マグマブロック', { tiles: tiles(T.magma, T.magma), hardness: 2.5, tool: 'pickaxe', level: 1, light: 1 });
  block(94, 'terracotta', 'テラコッタ', { tiles: tiles(T.terracotta, T.terracotta), hardness: 1.8, tool: 'pickaxe', level: 1 });

  /* ===== v0.3 追加: 鉱物ブロック ===== */
  block(95, 'copper_block', '銅ブロック', { tiles: tiles(T.copper_block, T.copper_block), hardness: 5, tool: 'pickaxe', level: 2 });
  block(96, 'silver_block', '銀ブロック', { tiles: tiles(T.silver_block, T.silver_block), hardness: 5, tool: 'pickaxe', level: 2 });
  block(97, 'lapis_block', 'ラピスラズリブロック', { tiles: tiles(T.lapis_block, T.lapis_block), hardness: 3, tool: 'pickaxe', level: 2 });
  block(98, 'emerald_block', 'エメラルドブロック', { tiles: tiles(T.emerald_block, T.emerald_block), hardness: 5, tool: 'pickaxe', level: 3 });
  block(99, 'redstone_block', 'レッドストーンブロック', { tiles: tiles(T.redstone_block, T.redstone_block), hardness: 3, tool: 'pickaxe', level: 2, light: 0.6 });
  block(100, 'crystal_block', '水晶ブロック', { tiles: tiles(T.crystal_block, T.crystal_block), hardness: 3, tool: 'pickaxe', level: 3, light: 0.7 });

  /* ===== v0.4 追加: 溶岩 ===== */
  block(101, 'lava', '溶岩', { tiles: tiles(T.lava, T.lava), hardness: Infinity, solid: false, opaque: false, liquid: true, drop: null, light: 1 });

  /* ===== v0.5 追加: 桜・針葉樹 ===== */
  block(102, 'cherry_log', '桜の原木', { tiles: tiles(T.cherry_log_top, T.cherry_log_side), hardness: 2.0, tool: 'axe' });
  block(103, 'cherry_leaves', '桜の葉', { tiles: tiles(T.cherry_leaves, T.cherry_leaves), hardness: 0.2, opaque: false, drop: null });
  block(104, 'cherry_planks', '桜の板', { tiles: tiles(T.cherry_planks, T.cherry_planks), hardness: 2.0, tool: 'axe' });
  block(105, 'spruce_log', 'トウヒの原木', { tiles: tiles(T.spruce_log_top, T.spruce_log_side), hardness: 2.0, tool: 'axe' });
  block(106, 'spruce_leaves', 'トウヒの葉', { tiles: tiles(T.spruce_leaves, T.spruce_leaves), hardness: 0.2, opaque: false, drop: null });

  /* ===== v0.11 追加: 新ブロック30種 ===== */
  // --- 石材 (10) ---
  block(107, 'basalt', '玄武岩', { tiles: tiles(T.basalt, T.basalt), hardness: 2.5, tool: 'pickaxe', level: 1 });
  block(108, 'basalt_smooth', '滑らかな玄武岩', { tiles: tiles(T.basalt_smooth, T.basalt_smooth), hardness: 2.5, tool: 'pickaxe', level: 1 });
  block(109, 'andesite', '安山岩', { tiles: tiles(T.andesite, T.andesite), hardness: 1.8, tool: 'pickaxe', level: 1 });
  block(110, 'diorite', '閃緑岩', { tiles: tiles(T.diorite, T.diorite), hardness: 1.8, tool: 'pickaxe', level: 1 });
  block(111, 'granite', '花崗岩', { tiles: tiles(T.granite, T.granite), hardness: 1.8, tool: 'pickaxe', level: 1 });
  block(112, 'deepslate', '深層岩', { tiles: tiles(T.deepslate, T.deepslate), hardness: 3.0, tool: 'pickaxe', level: 1 });
  block(113, 'sandstone', '砂岩', { tiles: tiles(T.sandstone_top, T.sandstone_side, T.sandstone_top), hardness: 2.0, tool: 'pickaxe', level: 1 });
  block(114, 'stone_bricks', '石レンガ', { tiles: tiles(T.stone_bricks, T.stone_bricks), hardness: 2.5, tool: 'pickaxe', level: 1 });
  block(115, 'mossy_stone_bricks', '苔むした石レンガ', { tiles: tiles(T.mossy_stone_bricks, T.mossy_stone_bricks), hardness: 2.5, tool: 'pickaxe', level: 1 });
  block(116, 'cracked_stone_bricks', 'ひび割れた石レンガ', { tiles: tiles(T.cracked_stone_bricks, T.cracked_stone_bricks), hardness: 2.5, tool: 'pickaxe', level: 1 });
  // --- 鉱石・鉱物 (8) ---
  block(117, 'coal_block', '石炭ブロック', { tiles: tiles(T.coal_block, T.coal_block), hardness: 5, tool: 'pickaxe', level: 1 });
  block(118, 'copper_ore_deepslate', '深層銅鉱石', { tiles: tiles(T.copper_ore_deepslate, T.copper_ore_deepslate), hardness: 3.5, tool: 'pickaxe', level: 2, drop: 'copper_ore' });
  block(119, 'iron_ore_deepslate', '深層鉄鉱石', { tiles: tiles(T.iron_ore_deepslate, T.iron_ore_deepslate), hardness: 3.5, tool: 'pickaxe', level: 2, drop: 'iron_ore' });
  block(120, 'gold_ore_deepslate', '深層金鉱石', { tiles: tiles(T.gold_ore_deepslate, T.gold_ore_deepslate), hardness: 3.5, tool: 'pickaxe', level: 3, drop: 'gold_ore' });
  block(121, 'diamond_ore_deepslate', '深層ダイヤ鉱石', { tiles: tiles(T.diamond_ore_deepslate, T.diamond_ore_deepslate), hardness: 3.5, tool: 'pickaxe', level: 3, drop: 'diamond_ore' });
  block(122, 'lapis_ore_deepslate', '深層ラピス鉱石', { tiles: tiles(T.lapis_ore_deepslate, T.lapis_ore_deepslate), hardness: 3.5, tool: 'pickaxe', level: 2, drop: 'lapis_ore' });
  block(123, 'redstone_ore_deepslate', '深層レッドストーン鉱石', { tiles: tiles(T.redstone_ore_deepslate, T.redstone_ore_deepslate), hardness: 3.5, tool: 'pickaxe', level: 2, drop: 'redstone_ore', light: 0.4 });
  block(124, 'emerald_ore_deepslate', '深層エメラルド鉱石', { tiles: tiles(T.emerald_ore_deepslate, T.emerald_ore_deepslate), hardness: 3.5, tool: 'pickaxe', level: 3, drop: 'emerald_ore' });
  // --- 木材 (4) ---
  block(125, 'spruce_planks', 'トウヒの板', { tiles: tiles(T.spruce_planks, T.spruce_planks), hardness: 2.0, tool: 'axe' });
  block(126, 'dark_oak_log', 'ダークオークの原木', { tiles: tiles(T.dark_oak_log_top, T.dark_oak_log_side), hardness: 2.0, tool: 'axe' });
  block(127, 'dark_oak_leaves', 'ダークオークの葉', { tiles: tiles(T.dark_oak_leaves, T.dark_oak_leaves), hardness: 0.2, opaque: false, drop: null });
  block(128, 'dark_oak_planks', 'ダークオークの板', { tiles: tiles(T.dark_oak_planks, T.dark_oak_planks), hardness: 2.0, tool: 'axe' });
  // --- 装飾・自然 (8) ---
  block(129, 'prismarine', 'プリズマリン', { tiles: tiles(T.prismarine, T.prismarine), hardness: 2.5, tool: 'pickaxe', level: 1 });
  block(130, 'prismarine_bricks', 'プリズマリンレンガ', { tiles: tiles(T.prismarine_bricks, T.prismarine_bricks), hardness: 2.5, tool: 'pickaxe', level: 1 });
  block(131, 'sea_lantern', 'シーランタン', { tiles: tiles(T.sea_lantern, T.sea_lantern), hardness: 0.3, tool: 'pickaxe', light: 1 });
  block(132, 'glowstone', 'グロウストーン', { tiles: tiles(T.glowstone, T.glowstone), hardness: 0.3, tool: 'pickaxe', light: 1 });
  block(133, 'shroomlight', 'シュルームライト', { tiles: tiles(T.shroomlight, T.shroomlight), hardness: 0.3, tool: 'axe', light: 1 });
  block(134, 'soul_sand', 'ソウルサンド', { tiles: tiles(T.soul_sand, T.soul_sand), hardness: 0.5, tool: 'shovel' });
  block(135, 'nether_bricks', 'ネザーレンガ', { tiles: tiles(T.nether_bricks, T.nether_bricks), hardness: 2.5, tool: 'pickaxe', level: 1 });
  block(136, 'netherrack', 'ネザーラック', { tiles: tiles(T.netherrack, T.netherrack), hardness: 0.4, tool: 'pickaxe', level: 1 });
  // --- 植物 (6) ---
  block(137, 'azalea_leaves', 'ツツジの葉', { tiles: tiles(T.azalea_leaves, T.azalea_leaves), hardness: 0.2, opaque: false, drop: null });
  block(138, 'flowering_azalea_leaves', '開花したツツジの葉', { tiles: tiles(T.flowering_azalea_leaves, T.flowering_azalea_leaves), hardness: 0.2, opaque: false, drop: null });
  block(139, 'spore_blossom', '胞子の花', {
    tiles: tiles(T.spore_blossom, T.spore_blossom), hardness: 0.05, solid: false, opaque: false, model: 'cross', drop: 'spore_blossom'
  });
  block(140, 'dripleaf', 'ドリップリーフ', {
    tiles: tiles(T.dripleaf, T.dripleaf), hardness: 0.05, solid: false, opaque: false, model: 'cross', drop: 'dripleaf'
  });
  block(141, 'lily_pad', '睡蓮の葉', {
    tiles: tiles(T.lily_pad, T.lily_pad), hardness: 0.05, solid: false, opaque: false, model: 'cross', drop: 'lily_pad'
  });
  block(142, 'moss_carpet', '苔の絨毯', {
    tiles: tiles(T.moss_carpet, T.moss_carpet), hardness: 0.05, solid: false, opaque: false, model: 'box',
    box: { x0: 0, x1: 1, y0: 0, y1: 0.06, z0: 0, z1: 1 }, drop: 'moss_carpet'
  });
  // --- 建築 (4) ---
  block(143, 'note_block', '音符ブロック', { tiles: tiles(T.note_block, T.note_block), hardness: 2.0, tool: 'axe' });
  block(144, 'jukebox', 'ジュークボックス', { tiles: tiles(T.jukebox, T.jukebox), hardness: 2.0, tool: 'axe' });
  block(145, 'jack_o_lantern', 'ジャック・オ・ランタン', {
    tiles: tiles(T.pumpkin_carved_top, T.pumpkin_carved_side), hardness: 1.0, tool: 'axe', light: 1
  });
  block(146, 'lantern', 'ランタン', {
    tiles: tiles(T.lantern, T.lantern), hardness: 0.1, solid: false, opaque: false, model: 'box', light: 1,
    box: { x0: 0.3, x1: 0.7, y0: 0, y1: 0.6, z0: 0.3, z1: 0.7 }, drop: 'lantern'
  });
  block(147, 'copper_block_oxidized', '酸化した銅ブロック', { tiles: tiles(T.copper_block_oxidized, T.copper_block_oxidized), hardness: 5, tool: 'pickaxe', level: 2 });

  /* ===== v0.12 追加: 珊瑚 (暖かい海の海底に生成) ===== */
  // 珊瑚は交差プレーンモデル (cross) の非固体ブロック。暖かい海の砂の上に生える。
  block(148, 'coral_red', '赤珊瑚', {
    tiles: tiles(T.coral_red, T.coral_red), hardness: 0.1, solid: false, opaque: false, model: 'cross', drop: 'coral_red'
  });
  block(149, 'coral_blue', '青珊瑚', {
    tiles: tiles(T.coral_blue, T.coral_blue), hardness: 0.1, solid: false, opaque: false, model: 'cross', drop: 'coral_blue'
  });
  block(150, 'coral_pink', 'ピンク珊瑚', {
    tiles: tiles(T.coral_pink, T.coral_pink), hardness: 0.1, solid: false, opaque: false, model: 'cross', drop: 'coral_pink'
  });
  block(151, 'coral_yellow', '黄珊瑚', {
    tiles: tiles(T.coral_yellow, T.coral_yellow), hardness: 0.1, solid: false, opaque: false, model: 'cross', drop: 'coral_yellow'
  });
  block(152, 'sea_grass', '海草', {
    tiles: tiles(T.sea_grass, T.sea_grass), hardness: 0.05, solid: false, opaque: false, model: 'cross', drop: 'sea_grass'
  });

  /* ===== v0.13 追加: 新バイオーム用ブロック ===== */
  // --- 気象 ---
  block(153, 'snow_layer', '積雪', {
    tiles: tiles(T.snow, T.snow), hardness: 0.2, solid: false, opaque: false, model: 'box', tool: 'shovel',
    box: { x0: 0, x1: 1, y0: 0, y1: 0.13, z0: 0, z1: 1 }, drop: 'snowball', dropCount: 1
  });
  // --- 氷山 ---
  block(154, 'packed_ice', '氷塊', { tiles: tiles(T.packed_ice, T.packed_ice), hardness: 0.6, tool: 'pickaxe', drop: null });
  block(155, 'blue_ice', '青氷', { tiles: tiles(T.blue_ice, T.blue_ice), hardness: 0.8, tool: 'pickaxe', drop: null });
  // --- きのこ島 ---
  block(156, 'mycelium', '菌糸', { tiles: tiles(T.mycelium_top, T.mycelium_side, T.dirt), hardness: 0.6, tool: 'shovel', drop: 'dirt' });
  block(157, 'mushroom_stem', 'キノコの柄', { tiles: tiles(T.mushroom_stem, T.mushroom_stem), hardness: 0.2, tool: 'axe' });
  block(158, 'mushroom_block_red', '赤キノコブロック', { tiles: tiles(T.mushroom_block_red, T.mushroom_block_red), hardness: 0.2, tool: 'axe' });
  block(159, 'mushroom_block_brown', '茶キノコブロック', { tiles: tiles(T.mushroom_block_brown, T.mushroom_block_brown), hardness: 0.2, tool: 'axe' });
  // --- メサ ---
  block(160, 'terracotta_red', '赤のテラコッタ', { tiles: tiles(T.terracotta_red, T.terracotta_red), hardness: 1.8, tool: 'pickaxe', level: 1 });
  block(161, 'terracotta_orange', '橙のテラコッタ', { tiles: tiles(T.terracotta_orange, T.terracotta_orange), hardness: 1.8, tool: 'pickaxe', level: 1 });
  block(162, 'terracotta_yellow', '黄のテラコッタ', { tiles: tiles(T.terracotta_yellow, T.terracotta_yellow), hardness: 1.8, tool: 'pickaxe', level: 1 });
  block(163, 'terracotta_brown', '茶のテラコッタ', { tiles: tiles(T.terracotta_brown, T.terracotta_brown), hardness: 1.8, tool: 'pickaxe', level: 1 });
  block(164, 'terracotta_white', '白のテラコッタ', { tiles: tiles(T.terracotta_white, T.terracotta_white), hardness: 1.8, tool: 'pickaxe', level: 1 });
  block(165, 'red_sand', '赤砂', { tiles: tiles(T.red_sand, T.red_sand), hardness: 0.5, tool: 'shovel' });
  block(166, 'dead_bush', '枯れ木', {
    tiles: tiles(T.dead_bush, T.dead_bush), hardness: 0.05, solid: false, opaque: false, model: 'cross', drop: null
  });
  // --- 繁茂した洞窟 / ディープダーク ---
  block(167, 'glow_berry_vine', 'グロウベリーの蔓', {
    tiles: tiles(T.glow_berry_vine, T.glow_berry_vine), hardness: 0.05, solid: false, opaque: false, model: 'cross',
    light: 0.85, drop: 'glow_berries', dropCount: 2
  });
  block(168, 'sculk', 'スカルク', { tiles: tiles(T.sculk, T.sculk), hardness: 0.6, tool: 'shovel' });
  block(169, 'sculk_catalyst', 'スカルク触媒', { tiles: tiles(T.sculk_catalyst_top, T.sculk_catalyst_side), hardness: 1.2, tool: 'pickaxe', level: 1, light: 0.35 });
  // --- 海の構造物 ---
  block(170, 'dark_prismarine', 'ダークプリズマリン', { tiles: tiles(T.dark_prismarine, T.dark_prismarine), hardness: 2.5, tool: 'pickaxe', level: 1 });
  block(171, 'gold_trimmed_obsidian', '金縁の黒曜石', { tiles: tiles(T.gold_trimmed_obsidian, T.gold_trimmed_obsidian), hardness: 12, tool: 'pickaxe', level: 4, drop: 'obsidian' });
  block(172, 'fire', '炎', {
    tiles: tiles(T.fire, T.fire), hardness: 0.05, solid: false, opaque: false, model: 'cross', light: 1, drop: null
  });

  /* ===== v0.13.1 追加: ネザー次元用ブロック ===== */
  // ポータル: 黒曜石のフレームの内側を埋める紫の渦 (透過・非固体・回収不可)
  block(173, 'portal', 'ネザーポータル', {
    tiles: tiles(T.portal, T.portal), hardness: -1, solid: false, opaque: false, model: 'cross',
    light: 0.7, drop: null, noPlace: true
  });
  // ネザー金鉱石: ネザーラックに埋まる金 (地上より豊富に取れる)
  block(174, 'nether_gold_ore', 'ネザー金鉱石', { tiles: tiles(T.nether_gold_ore, T.nether_gold_ore), hardness: 2.0, tool: 'pickaxe', level: 1, drop: 'gold_nugget', dropCount: 4 });
  // ネザー水晶鉱石: エンチャント (v0.15.1) 用の水晶の素材源
  block(175, 'nether_quartz_ore', 'ネザー水晶鉱石', { tiles: tiles(T.nether_quartz_ore, T.nether_quartz_ore), hardness: 2.0, tool: 'pickaxe', level: 1, drop: 'crystal_shard', dropCount: 2 });

  /* ===== v0.13.2 追加: エンド次元用ブロック ===== */
  // エンドストーン: エンドの浮島を構成する淡い石
  block(176, 'end_stone', 'エンドストーン', { tiles: tiles(T.end_stone, T.end_stone), hardness: 2.5, tool: 'pickaxe', level: 1 });
  // エンドポータルフレーム: ダンジョン地下のエンドポータル部屋の枠 (破壊不可)
  block(177, 'end_frame', 'エンドポータルフレーム', { tiles: tiles(T.end_frame, T.end_frame), hardness: -1, drop: null });
  // エンドポータル: 星空の転移ブロック (透過・非固体・回収不可)
  block(178, 'end_portal', 'エンドポータル', {
    tiles: tiles(T.end_portal, T.end_portal), hardness: -1, solid: false, opaque: false, model: 'cross',
    light: 0.9, drop: null, noPlace: true
  });
  // ドラゴンの卵: エンダードラゴン撃破の報酬 (飾りブロック)
  block(179, 'dragon_egg', 'ドラゴンの卵', { tiles: tiles(T.dragon_egg, T.dragon_egg), hardness: 1.5, light: 0.3 });
  // エンドクリスタルの台座 (黒曜石柱の先端装飾)
  block(180, 'end_crystal_base', 'クリスタル台座', { tiles: tiles(T.end_crystal_base, T.end_crystal_base), hardness: -1, drop: null });

  /* ==========================================================
     アイテム定義
     ========================================================== */
  const ITEMS = {};
  function item(name, label, opt) {
    ITEMS[name] = Object.assign({ name, label, stack: 64, tile: 0, type: 'material' }, opt);
  }

  // ブロックアイテム (設置できるもの)
  const PLACEABLE = ['grass', 'dirt', 'stone', 'cobblestone', 'log', 'leaves', 'sand', 'planks', 'glass',
    'coal_ore', 'iron_ore', 'gold_ore', 'diamond_ore', 'crafting_table', 'furnace', 'snow_block',
    'gravel', 'obsidian', 'bookshelf', 'iron_block', 'gold_block', 'diamond_block', 'wool', 'cactus', 'torch', 'brick',
    'chest', 'bed', 'birch_log', 'birch_leaves', 'birch_planks', 'leaf_litter', 'amethyst_ore', 'amethyst_block',
    'door_oak', 'trapdoor', 'ladder', 'fence', 'sign', 'stone_stairs', 'stone_slab', 'planks_stairs', 'planks_slab',
    'flower_dandelion', 'flower_poppy', 'flower_orchid', 'flower_tulip', 'flower_daisy', 'flower_allium', 'flower_cornflower', 'flower_lily',
    'lapis_ore', 'emerald_ore', 'redstone_ore', 'copper_ore', 'silver_ore', 'crystal_ore', 'sulfur_ore', 'salt_ore',
    'ice', 'mud', 'clay', 'moss', 'vine', 'tall_grass', 'mushroom_brown', 'mushroom_red',
    'bamboo', 'sugarcane', 'pumpkin', 'melon_block', 'mossy_cobblestone', 'magma', 'terracotta',
    'copper_block', 'silver_block', 'lapis_block', 'emerald_block', 'redstone_block', 'crystal_block',
    'cherry_log', 'cherry_leaves', 'cherry_planks', 'spruce_log', 'spruce_leaves',
    // v0.11 追加ブロック
    'basalt', 'basalt_smooth', 'andesite', 'diorite', 'granite', 'deepslate', 'sandstone',
    'stone_bricks', 'mossy_stone_bricks', 'cracked_stone_bricks',
    'coal_block', 'copper_ore_deepslate', 'iron_ore_deepslate', 'gold_ore_deepslate', 'diamond_ore_deepslate',
    'lapis_ore_deepslate', 'redstone_ore_deepslate', 'emerald_ore_deepslate',
    'spruce_planks', 'dark_oak_log', 'dark_oak_leaves', 'dark_oak_planks',
    'prismarine', 'prismarine_bricks', 'sea_lantern', 'glowstone', 'shroomlight',
    'soul_sand', 'nether_bricks', 'netherrack',
    'azalea_leaves', 'flowering_azalea_leaves', 'spore_blossom', 'dripleaf', 'lily_pad', 'moss_carpet',
    'note_block', 'jukebox', 'jack_o_lantern', 'lantern', 'copper_block_oxidized',
    // v0.12 追加ブロック (珊瑚・海草)
    'coral_red', 'coral_blue', 'coral_pink', 'coral_yellow', 'sea_grass',
    // v0.13 追加ブロック
    'snow_layer', 'packed_ice', 'blue_ice',
    'mycelium', 'mushroom_stem', 'mushroom_block_red', 'mushroom_block_brown',
    'terracotta_red', 'terracotta_orange', 'terracotta_yellow', 'terracotta_brown', 'terracotta_white',
    'red_sand', 'dead_bush', 'glow_berry_vine', 'sculk', 'sculk_catalyst',
    'dark_prismarine', 'gold_trimmed_obsidian', 'fire',
    // v0.13.1 追加ブロック (ポータルは noPlace なので含めない)
    'nether_gold_ore', 'nether_quartz_ore',
    // v0.13.2 追加ブロック (end_portal/end_frame/end_crystal_base は noPlace/破壊不可なので含めない)
    'end_stone', 'dragon_egg'];
  for (const n of PLACEABLE) {
    const b = BLOCKS[BLOCK_ID[n]];
    item(n, b.label, { type: 'block', block: b.id, tile: b.model === 'cube' ? b.tiles.side : b.tiles.top });
  }

  // 素材
  item('stick', '棒', { tile: T.stick });
  item('coal', '石炭', { tile: T.coal });
  item('iron_ingot', '鉄インゴット', { tile: T.iron_ingot });
  item('gold_ingot', '金インゴット', { tile: T.gold_ingot });
  item('diamond', 'ダイヤモンド', { tile: T.diamond });
  item('amethyst_shard', 'アメジストの欠片', { tile: T.amethyst_shard });

  // v0.3 鉱物・素材
  item('lapis_lazuli', 'ラピスラズリ', { tile: T.lapis_lazuli });
  item('emerald', 'エメラルド', { tile: T.emerald });
  item('redstone_dust', 'レッドストーン', { tile: T.redstone_dust });
  item('copper_ingot', '銅インゴット', { tile: T.copper_ingot });
  item('silver_ingot', '銀インゴット', { tile: T.silver_ingot });
  item('crystal_shard', '水晶の欠片', { tile: T.crystal_shard });
  item('sulfur', '硫黄', { tile: T.sulfur });
  item('salt', '塩', { tile: T.salt });
  item('clay_ball', '粘土玉', { tile: T.clay_ball });
  item('brick_item', 'レンガ(素材)', { tile: T.brick_item });
  item('melon_slice', 'スイカの薄切り', { tile: T.melon_slice, type: 'food', food: { hunger: 2, heal: 0 } });
  // v0.13 素材・食料
  item('snowball', '雪玉', { tile: T.snowball, stack: 16 });
  item('glow_berries', 'グロウベリー', { tile: T.glow_berries, type: 'food', food: { hunger: 2, heal: 0 }, stack: 64 });
  // v0.13.1: ネザー金鉱石のドロップ (9個で金インゴットに精錬不要で精練)
  item('gold_nugget', '金塊', { tile: T.gold_nugget });

  // v0.4 バケツ
  item('bucket', 'バケツ', { tile: T.bucket, stack: 16, type: 'bucket', bucket: 'empty' });
  item('water_bucket', '水入りバケツ', { tile: T.water_bucket, stack: 1, type: 'bucket', bucket: 'water' });
  item('lava_bucket', '溶岩入りバケツ', { tile: T.lava_bucket, stack: 1, type: 'bucket', bucket: 'lava' });

  // 農業
  item('wheat_seed', '小麦の種', { tile: T.wheat_seed, type: 'seed', crop: 'wheat' });
  item('rice_seed', '米の種', { tile: T.rice_seed, type: 'seed', crop: 'rice' });
  item('corn_seed', 'トウモロコシの種', { tile: T.corn_seed, type: 'seed', crop: 'corn' });
  item('tomato_seed', 'トマトの種', { tile: T.tomato_seed, type: 'seed', crop: 'tomato' });
  item('wheat', '小麦', { tile: T.wheat });
  item('rice', '米', { tile: T.rice, type: 'food', food: { hunger: 2, heal: 0 } });
  item('corn', 'トウモロコシ', { tile: T.corn, type: 'food', food: { hunger: 3, heal: 0 } });
  item('tomato', 'トマト', { tile: T.tomato, type: 'food', food: { hunger: 3, heal: 0 } });
  item('bread', 'パン', { tile: T.bread, type: 'food', food: { hunger: 5, heal: 0 } });

  // 食料
  item('apple', 'リンゴ', { tile: T.apple, type: 'food', food: { hunger: 4, heal: 0 }, stack: 64 });
  item('porkchop_raw', '生の豚肉', { tile: T.porkchop_raw, type: 'food', food: { hunger: 3, heal: 0 } });
  item('porkchop_cooked', '焼き豚', { tile: T.porkchop_cooked, type: 'food', food: { hunger: 8, heal: 1 } });
  item('beef_raw', '生の牛肉', { tile: T.beef_raw, type: 'food', food: { hunger: 3, heal: 0 } });
  item('beef_cooked', 'ステーキ', { tile: T.beef_cooked, type: 'food', food: { hunger: 8, heal: 1 } });
  item('chicken_raw', '生の鶏肉', { tile: T.chicken_raw, type: 'food', food: { hunger: 2, heal: 0 } });
  item('chicken_cooked', '焼き鳥', { tile: T.chicken_cooked, type: 'food', food: { hunger: 6, heal: 1 } });
  item('bone', '骨', { tile: T.bone });

  // 染料 (花からクラフト)
  const DYE_DEFS = [
    ['dye_yellow', '黄色の染料', 'flower_dandelion'],
    ['dye_red', '赤の染料', 'flower_poppy'],
    ['dye_blue', '青の染料', 'flower_orchid'],
    ['dye_pink', '桃色の染料', 'flower_tulip'],
    ['dye_white', '白の染料', 'flower_daisy'],
    ['dye_purple', '紫の染料', 'flower_allium'],
    ['dye_light_blue', '空色の染料', 'flower_cornflower']
  ];
  for (const [name, label] of DYE_DEFS) {
    item(name, label, { tile: T[name] });
  }

  // 道具
  const TIER = { wooden: 1, stone: 2, iron: 3, diamond: 4 };
  const SPEED = { wooden: 3, stone: 5, iron: 7, diamond: 9 };
  const DURA = { wooden: 60, stone: 132, iron: 251, diamond: 1562 };
  const DMG = { pickaxe: 2, axe: 3, shovel: 1, sword: 3, hoe: 1 };
  const KIND_LABEL = { pickaxe: 'ツルハシ', axe: '斧', shovel: 'シャベル', sword: '剣', hoe: 'クワ' };
  const MAT_LABEL = { wooden: '木の', stone: '石の', iron: '鉄の', diamond: 'ダイヤの' };

  for (const mat of Object.keys(TIER)) {
    for (const kind of ['pickaxe', 'axe', 'shovel', 'sword', 'hoe']) {
      const name = mat + '_' + kind;
      item(name, MAT_LABEL[mat] + KIND_LABEL[kind], {
        type: 'tool', stack: 1, tile: T[name],
        tool: {
          kind, tier: TIER[mat], speed: SPEED[mat],
          damage: DMG[kind] + TIER[mat] * (kind === 'sword' ? 1.2 : 0.5),
          durability: DURA[mat]
        }
      });
    }
  }

  /* ==========================================================
     クラフトレシピ
     ========================================================== */
  const RECIPES = [];
  function shaped(pattern, key, result, count) {
    RECIPES.push({ type: 'shaped', pattern, key, result, count: count || 1 });
  }
  function shapeless(ingredients, result, count) {
    RECIPES.push({ type: 'shapeless', ingredients, result, count: count || 1 });
  }

  shapeless(['log'], 'planks', 4);
  shaped(['P', 'P'], { P: 'planks' }, 'stick', 4);
  shaped(['PP', 'PP'], { P: 'planks' }, 'crafting_table', 1);
  shaped(['CCC', 'C C', 'CCC'], { C: 'cobblestone' }, 'furnace', 1);
  shaped(['C', 'S'], { C: 'coal', S: 'stick' }, 'torch', 4);
  shaped(['III', 'III', 'III'], { I: 'iron_ingot' }, 'iron_block', 1);
  shaped(['GGG', 'GGG', 'GGG'], { G: 'gold_ingot' }, 'gold_block', 1);
  shaped(['DDD', 'DDD', 'DDD'], { D: 'diamond' }, 'diamond_block', 1);
  shapeless(['iron_block'], 'iron_ingot', 9);
  shapeless(['gold_block'], 'gold_ingot', 9);
  // v0.13.1: 金塊 (ネザー金鉱石のドロップ) <-> 金インゴット
  shaped(['NNN', 'NNN', 'NNN'], { N: 'gold_nugget' }, 'gold_ingot', 1);
  shapeless(['gold_ingot'], 'gold_nugget', 9);
  shapeless(['diamond_block'], 'diamond', 9);
  shaped(['PPP', 'PPP', 'PPP'], { P: 'planks' }, 'bookshelf', 1);
  shaped(['PPP', 'P P', 'PPP'], { P: 'planks' }, 'chest', 1);
  shaped(['WWW', 'PPP'], { W: 'wool', P: 'planks' }, 'bed', 1);
  shaped(['CC', 'CC'], { C: 'cobblestone' }, 'brick', 4);
  shaped(['SS', 'SS'], { S: 'stone' }, 'brick', 4);

  const TOOL_MATERIAL = { wooden: 'planks', stone: 'cobblestone', iron: 'iron_ingot', diamond: 'diamond' };
  for (const mat of Object.keys(TOOL_MATERIAL)) {
    const M = TOOL_MATERIAL[mat];
    shaped(['MMM', ' S ', ' S '], { M, S: 'stick' }, mat + '_pickaxe', 1);
    shaped(['MM', 'MS', ' S'], { M, S: 'stick' }, mat + '_axe', 1);
    shaped(['M', 'S', 'S'], { M, S: 'stick' }, mat + '_shovel', 1);
    shaped(['M', 'M', 'S'], { M, S: 'stick' }, mat + '_sword', 1);
    shaped(['MM', ' S', ' S'], { M, S: 'stick' }, mat + '_hoe', 1);
  }
  shaped(['SSS'], { S: 'wheat' }, 'bread', 1);
  shapeless(['wheat'], 'wheat_seed', 2);
  shapeless(['amethyst_shard'], 'amethyst_block', 1);
  shaped(['AA', 'AA'], { A: 'amethyst_shard' }, 'amethyst_block', 1);
  shapeless(['amethyst_block'], 'amethyst_shard', 4);
  shapeless(['birch_log'], 'birch_planks', 4);
  shaped(['LL', 'LL'], { L: 'birch_leaves' }, 'leaf_litter', 1);

  /* v0.2 建築レシピ */
  shaped(['PP', 'PP', 'PP'], { P: 'planks' }, 'door_oak', 1);
  shaped(['PPP', 'PPP'], { P: 'planks' }, 'trapdoor', 2);
  shaped(['S S', 'SSS', 'S S'], { S: 'stick' }, 'ladder', 3);
  shaped(['PSP', 'PSP'], { P: 'planks', S: 'stick' }, 'fence', 3);
  shaped(['PPP', 'PPP', ' S '], { P: 'planks', S: 'stick' }, 'sign', 3);
  shaped(['S  ', 'SS ', 'SSS'], { S: 'stone' }, 'stone_stairs', 4);
  shaped(['SSS'], { S: 'stone' }, 'stone_slab', 6);
  shaped(['P  ', 'PP ', 'PPP'], { P: 'planks' }, 'planks_stairs', 4);
  shaped(['PPP'], { P: 'planks' }, 'planks_slab', 6);

  /* v0.2 染料レシピ (花→染料) */
  shapeless(['flower_dandelion'], 'dye_yellow', 2);
  shapeless(['flower_poppy'], 'dye_red', 2);
  shapeless(['flower_orchid'], 'dye_blue', 2);
  shapeless(['flower_tulip'], 'dye_pink', 2);
  shapeless(['flower_daisy'], 'dye_white', 2);
  shapeless(['flower_allium'], 'dye_purple', 2);
  shapeless(['flower_cornflower'], 'dye_light_blue', 2);

  // 木材の相互変換 (板材の種類を変えられる)
  shapeless(['birch_planks'], 'planks', 1);
  shapeless(['planks'], 'birch_planks', 1);

  /* v0.3 鉱物ブロックの圧縮・展開 */
  shaped(['CCC', 'CCC', 'CCC'], { C: 'copper_ingot' }, 'copper_block', 1);
  shaped(['SSS', 'SSS', 'SSS'], { S: 'silver_ingot' }, 'silver_block', 1);
  shaped(['LLL', 'LLL', 'LLL'], { L: 'lapis_lazuli' }, 'lapis_block', 1);
  shaped(['EEE', 'EEE', 'EEE'], { E: 'emerald' }, 'emerald_block', 1);
  shaped(['RRR', 'RRR', 'RRR'], { R: 'redstone_dust' }, 'redstone_block', 1);
  shaped(['CC', 'CC'], { C: 'crystal_shard' }, 'crystal_block', 1);
  shapeless(['copper_block'], 'copper_ingot', 9);
  shapeless(['silver_block'], 'silver_ingot', 9);
  shapeless(['lapis_block'], 'lapis_lazuli', 9);
  shapeless(['emerald_block'], 'emerald', 9);
  shapeless(['redstone_block'], 'redstone_dust', 9);
  shapeless(['crystal_block'], 'crystal_shard', 4);

  /* v0.3 その他のクラフト */
  shaped(['CC', 'CC'], { C: 'clay_ball' }, 'clay', 1);
  shapeless(['cobblestone', 'moss'], 'mossy_cobblestone', 1);
  shaped(['BB', 'BB'], { B: 'brick_item' }, 'brick', 1);
  shapeless(['melon_slice', 'melon_slice', 'melon_slice', 'melon_slice'], 'melon_block', 1);
  shapeless(['lapis_lazuli'], 'dye_blue', 1);   // ラピスラズリは青染料としても使える

  /* v0.4 バケツ */
  shaped(['I I', ' I '], { I: 'iron_ingot' }, 'bucket', 1);

  /* v0.5 桜・針葉樹 */
  shapeless(['cherry_log'], 'cherry_planks', 4);
  shapeless(['cherry_planks'], 'planks', 1);
  shapeless(['spruce_log'], 'planks', 4);

  /* エイリアス名 -> 正規名 (後方互換) */
  const ALIASES = {
    wood_log: 'log', wood_planks: 'planks', wood_leaves: 'leaves',
    log_block: 'log', birch_log_block: 'birch_log',
    iron: 'iron_ingot', gold: 'gold_ingot',
    porkchop: 'porkchop_cooked', beef: 'beef_cooked', chicken: 'chicken_cooked'
  };

  /* 精錬レシピ */
  const SMELTING = {
    cobblestone: 'stone',
    sand: 'glass',
    iron_ore: 'iron_ingot',
    gold_ore: 'gold_ingot',
    porkchop_raw: 'porkchop_cooked',
    beef_raw: 'beef_cooked',
    chicken_raw: 'chicken_cooked',
    log: 'coal',
    // v0.3
    copper_ore: 'copper_ingot',
    silver_ore: 'silver_ingot',
    clay_ball: 'brick_item',
    clay: 'terracotta'
  };

  /* 燃料 (単位: 精錬できる回数) */
  const FUEL = { coal: 8, log: 1.5, planks: 1.5, stick: 0.5, crafting_table: 1.5, bookshelf: 1.5, wooden_pickaxe: 1, wooden_axe: 1 };

  function canonical(name) { return (name && ALIASES[name]) || name; }

  global.Blocks = {
    BLOCKS, BLOCK_ID, ITEMS, RECIPES, SMELTING, FUEL, CROSS_PLANES, ALIASES, canonical,
    get(id) { return BLOCKS[id] || BLOCKS[0]; },
    idOf(name) { return BLOCK_ID[name] || 0; },
    itemDef(name) { return ITEMS[canonical(name)] || null; },
    isOpaque(id) { const b = BLOCKS[id]; return b ? b.opaque : false; },
    isSolid(id) { const b = BLOCKS[id]; return b ? b.solid : false; },
    isLiquid(id) { const b = BLOCKS[id]; return b ? !!b.liquid : false; }
  };
})(window);
