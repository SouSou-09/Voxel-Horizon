/* ==========================================================
   crops.js — 作物の成長管理 (小麦・米・トウモロコシ・トマト)
   耕地の上に植えて、時間経過で成長する。実物Minecraftを参考に。
   ========================================================== */
(function (global) {
  'use strict';
  const ID = Blocks.BLOCK_ID;

  const CROP_DEF = {
    wheat: { block: 'wheat_crop', stages: ['wheat_crop_1', 'wheat_crop_2', 'wheat_crop_3'], growTime: 120 },
    rice: { block: 'rice_crop', stages: ['rice_crop_1', 'rice_crop_2', 'rice_crop_3'], growTime: 100 },
    corn: { block: 'corn_crop', stages: ['corn_crop_1', 'corn_crop_2', 'corn_crop_3'], growTime: 160 },
    tomato: { block: 'tomato_crop', stages: ['tomato_crop_1', 'tomato_crop_2', 'tomato_crop_3'], growTime: 140 }
  };

  class CropManager {
    constructor(world) {
      this.world = world;
      this.crops = new Map();    // "x,y,z" -> { crop, stage, progress }
      this.timer = 0;
    }

    key(x, y, z) { return World.bkey(x, y, z); }

    /** 耕地の上に植える。植えられれば true */
    plant(x, y, z, cropName) {
      const def = CROP_DEF[cropName];
      if (!def) return false;
      if (this.world.getBlock(x, y, z) !== 0) return false;
      const below = this.world.getBlock(x, y - 1, z);
      if (below !== ID.farmland) return false;
      this.world.setBlock(x, y, z, ID[def.stages[0]]);
      this.crops.set(this.key(x, y, z), { crop: cropName, stage: 0, progress: 0 });
      return true;
    }

    /** 破壊時: 成長管理から削除してドロップ物を返す */
    harvest(x, y, z) {
      const key = this.key(x, y, z);
      const c = this.crops.get(key);
      if (!c) return null;
      this.crops.delete(key);
      const def = CROP_DEF[c.crop];
      const drops = [];
      const seedName = c.crop + '_seed';
      if (c.stage >= def.stages.length - 1) {
        // 完熟: 収穫物 + 追加の種
        drops.push({ id: c.crop, count: 1 + Math.floor(Math.random() * 2) });
        drops.push({ id: seedName, count: 1 + Math.floor(Math.random() * 2) });
      } else {
        // 未熟: 種だけ
        drops.push({ id: seedName, count: 1 });
      }
      return drops;
    }

    /** ブロック削除時に呼ぶ (成長中の作物だった場合の掃除) */
    onBlockBroken(x, y, z) { this.crops.delete(this.key(x, y, z)); }

    /** 定期更新。成長を進める */
    update(dt) {
      this.timer += dt;
      if (this.timer < 1) return;        // 1秒ごと
      const step = this.timer; this.timer = 0;
      const w = this.world;
      for (const [key, c] of this.crops) {
        const [x, y, z] = key.split(',').map(Number);
        if (!w.isLoaded(x, z)) continue;
        const def = CROP_DEF[c.crop];
        const blockId = w.getBlock(x, y, z);
        // 現在のステージに対応するブロックが無い = 壊れた or 別ブロック → 掃除
        if (blockId !== ID[def.stages[c.stage]]) { this.crops.delete(key); continue; }
        // 下が耕地でなくなったら枯れる
        const below = w.getBlock(x, y - 1, z);
        if (below !== ID.farmland && below !== ID.farmland_wet) {
          this.crops.delete(key);
          w.setBlock(x, y, z, 0);
          continue;
        }
        // 光が当たるほど速い (昼間のみ成長)
        const top = w.getHeight(x, z);
        const lit = y > top;
        if (c.stage >= def.stages.length - 1) continue;   // 完熟
        c.progress += step * (lit ? 1 : 0.4);
        if (c.progress >= def.growTime) {
          c.progress = 0;
          c.stage = Math.min(def.stages.length - 1, c.stage + 1);
          w.setBlock(x, y, z, ID[def.stages[c.stage]]);
        }
      }
    }

    serialize() {
      const out = {};
      for (const [k, v] of this.crops) out[k] = v;
      return out;
    }
    load(obj) {
      if (!obj) return;
      for (const k of Object.keys(obj)) this.crops.set(k, obj[k]);
    }
  }

  global.CropManager = CropManager;
  global.CROP_DEF = CROP_DEF;
})(window);
