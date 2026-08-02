/* ==========================================================
   inventory.js — インベントリ / クラフト判定 / かまど
   スタック形式: { id: 'stone', count: 3, dura?: 59 }
   ========================================================== */
(function (global) {
  'use strict';
  const { ITEMS, RECIPES, SMELTING, FUEL } = Blocks;

  function maxStack(id) {
    const d = ITEMS[id];
    return d ? d.stack : 64;
  }

  function newStack(id, count) {
    const d = ITEMS[id];
    if (!d) return null;
    const s = { id, count: count || 1 };
    if (d.type === 'tool') s.dura = d.tool.durability;
    return s;
  }

  function sameItem(a, b) {
    if (!a || !b) return false;
    if (a.id !== b.id) return false;
    if (ITEMS[a.id] && ITEMS[a.id].type === 'tool') return false; // 道具は重ねない
    return true;
  }

  class Inventory {
    constructor(size = 36) {
      this.size = size;
      this.slots = new Array(size).fill(null);
      this.selected = 0;   // ホットバー選択 (0-8)
    }

    get(i) { return this.slots[i] || null; }
    set(i, stack) { this.slots[i] = stack && stack.count > 0 ? stack : null; }
    held() { return this.slots[this.selected]; }

    /** 追加。入り切らなかった数を返す */
    add(id, count = 1) {
      if (!ITEMS[id]) return count;
      const max = maxStack(id);
      // 既存スタックに合流
      if (max > 1) {
        for (let i = 0; i < this.size && count > 0; i++) {
          const s = this.slots[i];
          if (s && s.id === id && s.count < max) {
            const put = Math.min(max - s.count, count);
            s.count += put; count -= put;
          }
        }
      }
      // 空きスロット
      for (let i = 0; i < this.size && count > 0; i++) {
        if (!this.slots[i]) {
          const put = Math.min(max, count);
          const st = newStack(id, put);
          this.slots[i] = st; count -= put;
        }
      }
      return count;
    }

    countOf(id) {
      let n = 0;
      for (const s of this.slots) if (s && s.id === id) n += s.count;
      return n;
    }

    /** 指定アイテムを count 個消費できたら true */
    consume(id, count = 1) {
      if (this.countOf(id) < count) return false;
      for (let i = 0; i < this.size && count > 0; i++) {
        const s = this.slots[i];
        if (s && s.id === id) {
          const take = Math.min(s.count, count);
          s.count -= take; count -= take;
          if (s.count <= 0) this.slots[i] = null;
        }
      }
      return true;
    }

    /** スロットのアイテムを1個減らす */
    decrement(i, n = 1) {
      const s = this.slots[i];
      if (!s) return;
      s.count -= n;
      if (s.count <= 0) this.slots[i] = null;
    }

    /** 道具の耐久を消費。壊れたら true */
    damageTool(i, amount = 1) {
      const s = this.slots[i];
      if (!s || s.dura === undefined) return false;
      s.dura -= amount;
      if (s.dura <= 0) { this.slots[i] = null; return true; }
      return false;
    }

    serialize() { return this.slots.map(s => (s ? Object.assign({}, s) : null)); }
    load(arr) {
      if (!Array.isArray(arr)) return;
      for (let i = 0; i < this.size; i++) {
        const s = arr[i];
        this.slots[i] = s && ITEMS[s.id] ? Object.assign({}, s) : null;
      }
    }
  }

  /* ==========================================================
     クラフト判定
     ========================================================== */
  function trimGrid(names, size) {
    let minR = size, maxR = -1, minC = size, maxC = -1;
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        if (names[r * size + c]) {
          if (r < minR) minR = r; if (r > maxR) maxR = r;
          if (c < minC) minC = c; if (c > maxC) maxC = c;
        }
      }
    }
    if (maxR < 0) return null;
    const w = maxC - minC + 1, h = maxR - minR + 1;
    const out = [];
    for (let r = 0; r < h; r++) {
      const row = [];
      for (let c = 0; c < w; c++) row.push(names[(r + minR) * size + (c + minC)]);
      out.push(row);
    }
    return { w, h, cells: out };
  }

  function trimPattern(pattern, key) {
    const rows = pattern.map(r => r.split('').map(ch => (ch === ' ' ? null : key[ch])));
    const h0 = rows.length, w0 = Math.max(...rows.map(r => r.length));
    for (const r of rows) while (r.length < w0) r.push(null);
    let minR = h0, maxR = -1, minC = w0, maxC = -1;
    for (let r = 0; r < h0; r++) for (let c = 0; c < w0; c++) {
      if (rows[r][c]) {
        if (r < minR) minR = r; if (r > maxR) maxR = r;
        if (c < minC) minC = c; if (c > maxC) maxC = c;
      }
    }
    if (maxR < 0) return null;
    const cells = [];
    for (let r = minR; r <= maxR; r++) cells.push(rows[r].slice(minC, maxC + 1));
    return { w: maxC - minC + 1, h: maxR - minR + 1, cells };
  }

  const patternCache = new WeakMap();
  function getPattern(recipe) {
    let p = patternCache.get(recipe);
    if (!p) { p = trimPattern(recipe.pattern, recipe.key); patternCache.set(recipe, p); }
    return p;
  }

  /** grid: (size*size) の stack 配列。 戻り値 {id,count} | null */
  function craftResult(grid, size) {
    const names = grid.map(s => (s ? s.id : null));
    const g = trimGrid(names, size);
    if (!g) return null;
    const total = names.filter(Boolean).length;

    for (const rec of RECIPES) {
      if (rec.type === 'shaped') {
        const p = getPattern(rec);
        if (!p || p.w !== g.w || p.h !== g.h) continue;
        if (p.w > size || p.h > size) continue;
        let ok = true;
        for (let r = 0; r < p.h && ok; r++) {
          for (let c = 0; c < p.w; c++) {
            if (p.cells[r][c] !== g.cells[r][c]) { ok = false; break; }
          }
        }
        if (ok) return { id: rec.result, count: rec.count };
      } else {
        if (rec.ingredients.length !== total) continue;
        const need = rec.ingredients.slice();
        let ok = true;
        for (const n of names) {
          if (!n) continue;
          const idx = need.indexOf(n);
          if (idx < 0) { ok = false; break; }
          need.splice(idx, 1);
        }
        if (ok && need.length === 0) return { id: rec.result, count: rec.count };
      }
    }
    return null;
  }

  /* ==========================================================
     かまど
     ========================================================== */
  class Furnace {
    constructor(data) {
      this.input = null; this.fuel = null; this.output = null;
      this.burn = 0;      // 残り燃焼時間(秒)
      this.burnMax = 0;
      this.progress = 0;  // 0..1
      if (data) this.load(data);
    }

    tick(dt) {
      const SMELT_TIME = 8;   // 1回あたりの秒数
      const canSmelt = () => {
        if (!this.input) return false;
        const res = SMELTING[this.input.id];
        if (!res) return false;
        if (this.output && (this.output.id !== res || this.output.count >= maxStack(res))) return false;
        return true;
      };

      if (this.burn > 0) this.burn = Math.max(0, this.burn - dt);

      if (this.burn <= 0 && canSmelt() && this.fuel && FUEL[this.fuel.id]) {
        const secs = FUEL[this.fuel.id] * SMELT_TIME;
        this.burn = this.burnMax = secs;
        this.fuel.count--;
        if (this.fuel.count <= 0) this.fuel = null;
      }

      if (this.burn > 0 && canSmelt()) {
        this.progress += dt / SMELT_TIME;
        if (this.progress >= 1) {
          this.progress = 0;
          const res = SMELTING[this.input.id];
          if (this.output) this.output.count++;
          else this.output = newStack(res, 1);
          this.input.count--;
          if (this.input.count <= 0) this.input = null;
        }
      } else {
        this.progress = Math.max(0, this.progress - dt * 0.3);
      }
      return this.burn > 0;
    }

    serialize() {
      return {
        input: this.input, fuel: this.fuel, output: this.output,
        burn: this.burn, burnMax: this.burnMax, progress: this.progress
      };
    }
    load(d) {
      this.input = d.input || null; this.fuel = d.fuel || null; this.output = d.output || null;
      this.burn = d.burn || 0; this.burnMax = d.burnMax || 0; this.progress = d.progress || 0;
    }
  }

  global.InventorySystem = { Inventory, Furnace, craftResult, newStack, maxStack, sameItem };
})(window);
