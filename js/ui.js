/* ==========================================================
   ui.js — HUD / インベントリ / クラフト / かまど UI
   ========================================================== */
(function (global) {
  'use strict';
  const IS = InventorySystem;

  const $ = (id) => document.getElementById(id);

  const UI = {
    game: null,
    held: null,            // カーソルで持っているスタック
    craftSlots: new Array(9).fill(null),
    craftSize: 2,
    openScreen: null,      // 'inventory' | 'furnace' | 'chest' | 'pause' | null
    furnace: null,         // 開いているかまど
    furnaceKey: null,
    chest: null,           // 開いているチェスト (27スロットの配列)
    chestKey: null,
    pointer: { x: 0, y: 0 }
  };

  /* ---------- スロット描画 ---------- */
  function renderSlot(el, stack, selected) {
    el.innerHTML = '';
    el.classList.toggle('selected', !!selected);
    if (!stack) return;
    const def = Blocks.itemDef(stack.id);
    if (!def) return;
    const icon = document.createElement('div');
    icon.className = 'icon';
    icon.style.backgroundPosition = Textures.iconPosition(def.tile);
    el.appendChild(icon);
    if (stack.count > 1) {
      const c = document.createElement('span');
      c.className = 'count';
      c.textContent = stack.count;
      el.appendChild(c);
    }
    if (stack.dura !== undefined && def.tool) {
      const bar = document.createElement('div');
      bar.className = 'durability';
      const inner = document.createElement('span');
      inner.style.width = Math.max(0, (stack.dura / def.tool.durability) * 100) + '%';
      bar.appendChild(inner);
      el.appendChild(bar);
    }
  }

  function makeSlot(container, index) {
    const el = document.createElement('div');
    el.className = 'slot';
    el.dataset.container = container;
    el.dataset.index = index;
    attachSlotEvents(el);
    return el;
  }

  /* ---------- コンテナへのアクセス ---------- */
  function getStack(container, index) {
    const inv = UI.game.player.inventory;
    switch (container) {
      case 'inv': return inv.get(index);
      case 'craft': return UI.craftSlots[index];
      case 'craftout': return craftPreview();
      case 'fin': return UI.furnace ? UI.furnace.input : null;
      case 'ffuel': return UI.furnace ? UI.furnace.fuel : null;
      case 'fout': return UI.furnace ? UI.furnace.output : null;
      case 'chest': return UI.chest ? UI.chest[index] : null;
    }
    return null;
  }

  function setStack(container, index, stack) {
    const inv = UI.game.player.inventory;
    switch (container) {
      case 'inv': inv.set(index, stack); break;
      case 'craft': UI.craftSlots[index] = stack && stack.count > 0 ? stack : null; break;
      case 'fin': if (UI.furnace) UI.furnace.input = stack && stack.count > 0 ? stack : null; break;
      case 'ffuel': if (UI.furnace) UI.furnace.fuel = stack && stack.count > 0 ? stack : null; break;
      case 'fout': if (UI.furnace) UI.furnace.output = stack && stack.count > 0 ? stack : null; break;
      case 'chest': if (UI.chest) UI.chest[index] = stack && stack.count > 0 ? stack : null; break;
    }
  }

  /** クラフト結果のプレビュー */
  function craftPreview() {
    const size = UI.craftSize;
    const grid = [];
    for (let r = 0; r < size; r++)
      for (let c = 0; c < size; c++)
        grid.push(UI.craftSlots[r * 3 + c] || null);
    const res = IS.craftResult(grid, size);
    return res ? { id: res.id, count: res.count } : null;
  }

  function consumeCraft() {
    const size = UI.craftSize;
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        const i = r * 3 + c;
        const s = UI.craftSlots[i];
        if (s) { s.count--; if (s.count <= 0) UI.craftSlots[i] = null; }
      }
    }
  }

  /* ---------- スロット操作 ---------- */
  function slotAction(container, index, rightClick) {
    const cur = getStack(container, index);

    // クラフト結果
    if (container === 'craftout' || container === 'fout') {
      const out = cur;
      if (!out) return;
      if (UI.held && (UI.held.id !== out.id || UI.held.count + out.count > IS.maxStack(out.id))) return;
      if (container === 'craftout') {
        // Shift的な連続クラフトはしない: 1回分
        if (UI.held) UI.held.count += out.count;
        else UI.held = IS.newStack(out.id, out.count);
        consumeCraft();
        if (global.Sound) Sound.craft();
      } else {
        if (UI.held) UI.held.count += out.count;
        else UI.held = IS.newStack(out.id, out.count);
        setStack('fout', 0, null);
      }
      refreshAll();
      return;
    }

    if (!UI.held) {
      if (!cur) return;
      if (rightClick && cur.count > 1) {
        const half = Math.ceil(cur.count / 2);
        UI.held = Object.assign({}, cur, { count: half });
        cur.count -= half;
        if (cur.count <= 0) setStack(container, index, null);
      } else {
        UI.held = cur;
        setStack(container, index, null);
      }
    } else {
      if (!cur) {
        if (rightClick) {
          const one = Object.assign({}, UI.held, { count: 1 });
          setStack(container, index, one);
          UI.held.count--;
          if (UI.held.count <= 0) UI.held = null;
        } else {
          setStack(container, index, UI.held);
          UI.held = null;
        }
      } else if (cur.id === UI.held.id && cur.dura === undefined) {
        const max = IS.maxStack(cur.id);
        const put = rightClick ? Math.min(1, max - cur.count) : Math.min(UI.held.count, max - cur.count);
        cur.count += put;
        UI.held.count -= put;
        if (UI.held.count <= 0) UI.held = null;
      } else {
        // 交換
        setStack(container, index, UI.held);
        UI.held = cur;
      }
    }
    refreshAll();
  }

  function attachSlotEvents(el) {
    let timer = null, longPressed = false;
    el.addEventListener('contextmenu', e => e.preventDefault());
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      longPressed = false;
      if (e.button === 2) {
        slotAction(el.dataset.container, +el.dataset.index, true);
        longPressed = true;
        return;
      }
      timer = setTimeout(() => {
        longPressed = true;
        slotAction(el.dataset.container, +el.dataset.index, true);
      }, 350);
    });
    el.addEventListener('pointerup', (e) => {
      e.preventDefault();
      if (timer) { clearTimeout(timer); timer = null; }
      if (!longPressed) slotAction(el.dataset.container, +el.dataset.index, false);
    });
    el.addEventListener('pointerleave', () => { if (timer) { clearTimeout(timer); timer = null; } });
  }

  /* ---------- 構築 ---------- */
  function buildStatic() {
    // ホットバー
    const hb = $('hotbar');
    hb.innerHTML = '';
    for (let i = 0; i < 9; i++) {
      const el = document.createElement('div');
      el.className = 'slot';
      el.dataset.hotbar = i;
      el.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        UI.game.player.inventory.selected = i;
        UI.refreshHotbar();
        showItemName();
      });
      hb.appendChild(el);
    }

    // インベントリ画面
    const grid = $('craft-grid');
    grid.innerHTML = '';
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) grid.appendChild(makeSlot('craft', r * 3 + c));
    $('craft-output').innerHTML = '';
    $('craft-output').appendChild(makeSlot('craftout', 0));

    const main = $('inv-main'); main.innerHTML = '';
    for (let i = 9; i < 36; i++) main.appendChild(makeSlot('inv', i));
    const ihb = $('inv-hotbar'); ihb.innerHTML = '';
    for (let i = 0; i < 9; i++) ihb.appendChild(makeSlot('inv', i));

    // かまど画面
    $('furnace-input').innerHTML = ''; $('furnace-input').appendChild(makeSlot('fin', 0));
    $('furnace-fuel').innerHTML = ''; $('furnace-fuel').appendChild(makeSlot('ffuel', 0));
    $('furnace-output').innerHTML = ''; $('furnace-output').appendChild(makeSlot('fout', 0));
    const fmain = $('furnace-inv'); fmain.innerHTML = '';
    for (let i = 9; i < 36; i++) fmain.appendChild(makeSlot('inv', i));
    const fhb = $('furnace-inv-hotbar'); fhb.innerHTML = '';
    for (let i = 0; i < 9; i++) fhb.appendChild(makeSlot('inv', i));

    // チェスト画面
    const cs = $('chest-slots'); cs.innerHTML = '';
    for (let i = 0; i < 27; i++) cs.appendChild(makeSlot('chest', i));
    const cmain = $('chest-inv'); cmain.innerHTML = '';
    for (let i = 9; i < 36; i++) cmain.appendChild(makeSlot('inv', i));
    const chb = $('chest-inv-hotbar'); chb.innerHTML = '';
    for (let i = 0; i < 9; i++) chb.appendChild(makeSlot('inv', i));
  }

  /* ---------- 更新 ---------- */
  UI.refreshHotbar = function () {
    const inv = UI.game.player.inventory;
    const hb = $('hotbar');
    for (let i = 0; i < 9; i++) renderSlot(hb.children[i], inv.get(i), i === inv.selected);
  };

  function refreshContainer(root) {
    root.querySelectorAll('.slot').forEach(el => {
      renderSlot(el, getStack(el.dataset.container, +el.dataset.index), false);
    });
  }

  function refreshHeld() {
    const el = $('held-stack');
    if (!UI.held) { el.classList.add('hidden'); return; }
    const def = Blocks.itemDef(UI.held.id);
    el.classList.remove('hidden');
    el.innerHTML = '';
    const icon = document.createElement('div');
    icon.className = 'icon';
    icon.style.backgroundPosition = Textures.iconPosition(def.tile);
    el.appendChild(icon);
    if (UI.held.count > 1) {
      const c = document.createElement('span');
      c.className = 'count';
      c.textContent = UI.held.count;
      el.appendChild(c);
    }
    el.style.left = UI.pointer.x + 'px';
    el.style.top = UI.pointer.y + 'px';
  }

  function refreshAll() {
    UI.refreshHotbar();
    if (UI.openScreen === 'inventory') refreshContainer($('inventory-screen'));
    if (UI.openScreen === 'furnace') refreshContainer($('furnace-screen'));
    if (UI.openScreen === 'chest') refreshContainer($('chest-screen'));
    refreshHeld();
  }
  UI.refreshAll = refreshAll;

  /* ---------- v0.13.2: ボス体力バー ---------- */
  UI.setBossBar = function (name, frac) {
    const el = $('boss-bar');
    if (!el) return;
    if (!name) { el.classList.add('hidden'); return; }
    el.classList.remove('hidden');
    $('boss-bar-name').textContent = name;
    $('boss-bar-fill').style.width = (Math.max(0, Math.min(1, frac === undefined ? 1 : frac)) * 100) + '%';
  };

  /* ---------- ステータスバー ---------- */
  UI.updateStats = function () {
    const p = UI.game.player;
    const hearts = $('health-bar');
    const hunger = $('hunger-bar');
    const air = $('air-bar');

    function bar(el, value, max, fullChar, color) {
      const n = max / 2;
      if (el.children.length !== n) {
        el.innerHTML = '';
        for (let i = 0; i < n; i++) {
          const s = document.createElement('span');
          s.className = 'icon';
          s.textContent = fullChar;
          el.appendChild(s);
        }
      }
      for (let i = 0; i < n; i++) {
        const v = value - i * 2;
        const s = el.children[i];
        s.style.color = v >= 2 ? color : (v >= 1 ? color : '#3a3a3a');
        s.style.opacity = v >= 2 ? '1' : (v >= 1 ? '0.55' : '0.55');
      }
    }

    bar(hearts, Math.ceil(p.health), 20, '♥', '#ff4d4d');
    bar(hunger, Math.ceil(p.hunger), 20, '🍖', '#e0a44a');

    if (p.headInWater && p.air < 20) {
      air.classList.remove('hidden');
      bar(air, Math.ceil(p.air), 20, '●', '#7fd8ff');
    } else air.classList.add('hidden');
  };

  /* ---------- v0.11: クリエイティブブロック一覧 ---------- */
  const CREATIVE_TABS = [
    { id: 'all', label: 'すべて', filter: () => true },
    { id: 'natural', label: '自然', filter: d => ['grass','dirt','stone','sand','gravel','snow_block','ice','clay','mud','moss','obsidian','cobblestone','mossy_cobblestone','bedrock','andesite','diorite','granite','deepslate','basalt','basalt_smooth','netherrack','soul_sand','terracotta','magma'].includes(d.name) },
    { id: 'wood', label: '木材', filter: d => d.name.includes('log') || d.name.includes('planks') || d.name.includes('leaves') },
    { id: 'ore', label: '鉱石', filter: d => d.name.includes('ore') || d.name.includes('_block') && !['wool','magma','note_block'].includes(d.name) },
    { id: 'build', label: '建築', filter: d => ['brick','stone_bricks','mossy_stone_bricks','cracked_stone_bricks','glass','bookshelf','door_oak','trapdoor','ladder','fence','sign','stone_stairs','stone_slab','planks_stairs','planks_slab','nether_bricks','prismarine','prismarine_bricks','sandstone','note_block','jukebox','jack_o_lantern','lantern','copper_block_oxidized','coal_block'].includes(d.name) },
    { id: 'deco', label: '装飾', filter: d => d.name.startsWith('flower_') || ['tall_grass','vine','mushroom_brown','mushroom_red','cactus','bamboo','sugarcane','pumpkin','melon_block','azalea_leaves','flowering_azalea_leaves','spore_blossom','dripleaf','lily_pad','moss_carpet','sea_lantern','glowstone','shroomlight','torch','chest','bed','crafting_table','furnace'].includes(d.name) }
  ];
  let creativeTab = 'all';
  let creativeSearch = '';

  function renderCreativePanel() {
    const wrap = $('creative-blocks');
    if (!wrap) return;
    const grid = $('creative-grid');
    if (!grid) return;
    grid.innerHTML = '';
    // タブ
    const tabBar = document.createElement('div');
    tabBar.className = 'creative-tabs';
    for (const t of CREATIVE_TABS) {
      const b = document.createElement('button');
      b.className = 'creative-tab' + (creativeTab === t.id ? ' active' : '');
      b.textContent = t.label;
      b.addEventListener('click', () => { creativeTab = t.id; renderCreativePanel(); });
      tabBar.appendChild(b);
    }
    grid.appendChild(tabBar);
    // アイテムグリッド
    const itemGrid = document.createElement('div');
    itemGrid.className = 'creative-item-grid';
    const tab = CREATIVE_TABS.find(t => t.id === creativeTab) || CREATIVE_TABS[0];
    const q = creativeSearch.trim().toLowerCase();
    for (const name of Object.keys(Blocks.ITEMS)) {
      const def = Blocks.itemDef(name);
      if (!def || def.type !== 'block') continue;
      const bd = Blocks.get(def.block);
      if (!bd || !bd.label) continue;
      if (q && !bd.label.toLowerCase().includes(q) && !name.includes(q)) continue;
      if (!tab.filter(bd)) continue;
      const el = document.createElement('div');
      el.className = 'creative-slot';
      el.title = bd.label;
      const icon = document.createElement('div');
      icon.className = 'icon';
      icon.style.backgroundPosition = Textures.iconPosition(def.tile);
      el.appendChild(icon);
      const lbl = document.createElement('span');
      lbl.className = 'creative-label';
      lbl.textContent = bd.label;
      el.appendChild(lbl);
      el.addEventListener('click', () => {
        const inv = UI.game.player.inventory;
        inv.set(inv.selected, { id: name, count: 64 });
        UI.refreshHotbar();
        if (global.Sound) Sound.click && Sound.click();
        UI.toast(bd.label + ' をホットバーに追加');
      });
      itemGrid.appendChild(el);
    }
    grid.appendChild(itemGrid);
  }

  /* ---------- 画面切替 ---------- */
  UI.openInventory = function (useTable) {
    UI.craftSize = useTable ? 3 : 2;
    $('craft-grid').classList.toggle('big', !!useTable);
    // 2x2のときは使わないスロットを隠す
    const grid = $('craft-grid');
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) {
        const el = grid.children[r * 3 + c];
        const visible = useTable || (r < 2 && c < 2);
        el.style.display = visible ? '' : 'none';
      }
    }
    $('inv-title').textContent = useTable ? '作業台' : 'インベントリ';
    $('craft-hint').textContent = useTable ? '3×3 クラフト' : '2×2 クラフト（作業台を置くと3×3）';
    // v0.11: クリエイティブでは左にブロック一覧を表示
    const cb = $('creative-blocks');
    const isCreative = UI.game && UI.game.player && UI.game.player.gameMode === 'creative';
    if (cb) {
      cb.classList.toggle('hidden', !isCreative);
      if (isCreative) renderCreativePanel();
    }
    $('inventory-screen').classList.toggle('creative-mode', !!isCreative);
    show('inventory-screen');
    UI.openScreen = 'inventory';
    refreshAll();
  };

  UI.openFurnace = function (furnace, key) {
    UI.furnace = furnace;
    UI.furnaceKey = key;
    show('furnace-screen');
    UI.openScreen = 'furnace';
    refreshAll();
  };

  UI.openChest = function (arr, key) {
    UI.chest = arr;
    UI.chestKey = key;
    show('chest-screen');
    UI.openScreen = 'chest';
    refreshAll();
  };

  UI.openPause = function () {
    show('pause-screen');
    UI.openScreen = 'pause';
  };

  UI.closeScreens = function () {
    // クラフト枠のアイテムを戻す
    const p = UI.game.player;
    for (let i = 0; i < 9; i++) {
      const s = UI.craftSlots[i];
      if (s) {
        const left = p.inventory.add(s.id, s.count);
        if (left > 0) UI.game.entities.dropItem(p.pos.x, p.pos.y + 1, p.pos.z, s.id, left);
        UI.craftSlots[i] = null;
      }
    }
    if (UI.held) {
      const left = p.inventory.add(UI.held.id, UI.held.count);
      if (left > 0) UI.game.entities.dropItem(p.pos.x, p.pos.y + 1, p.pos.z, UI.held.id, left);
      UI.held = null;
    }
    hide('inventory-screen'); hide('furnace-screen'); hide('chest-screen'); hide('pause-screen');
    UI.furnace = null; UI.furnaceKey = null;
    UI.chest = null; UI.chestKey = null;
    UI.openScreen = null;
    refreshHeld();
    UI.refreshHotbar();
  };

  function show(id) { $(id).classList.remove('hidden'); }
  function hide(id) { $(id).classList.add('hidden'); }
  UI.show = show; UI.hide = hide;

  /* ---------- かまど表示更新 ---------- */
  let furnaceUiTimer = 0;
  UI.updateFurnaceUI = function () {
    if (UI.openScreen !== 'furnace' || !UI.furnace) return;
    const now = performance.now();
    if (now - furnaceUiTimer < 200) return;
    furnaceUiTimer = now;
    const f = UI.furnace;
    $('burn-indicator').classList.toggle('on', f.burn > 0);
    $('smelt-progress').firstElementChild.style.width = Math.min(100, f.progress * 100) + '%';
    refreshContainer($('furnace-screen'));
  };

  /* ---------- 通知 ---------- */
  UI.toast = function (msg, warn) {
    const area = $('toast-area');
    const el = document.createElement('div');
    el.className = 'toast' + (warn ? ' warn' : '');
    el.textContent = msg;
    area.appendChild(el);
    setTimeout(() => {
      el.style.transition = 'opacity .4s';
      el.style.opacity = '0';
      setTimeout(() => el.remove(), 400);
    }, 1800);
    while (area.children.length > 4) area.firstElementChild.remove();
  };

  let nameTimer = null;
  function showItemName() {
    const s = UI.game.player.inventory.held();
    const el = $('item-name-popup');
    if (!s) { el.classList.remove('show'); return; }
    const def = Blocks.itemDef(s.id);
    el.textContent = def ? def.label : s.id;
    el.classList.add('show');
    clearTimeout(nameTimer);
    nameTimer = setTimeout(() => el.classList.remove('show'), 1400);
  }
  UI.showItemName = showItemName;

  /* ---------- 初期化 ---------- */
  UI.init = function (game) {
    UI.game = game;
    buildStatic();
    UI.refreshHotbar();
    UI.updateStats();

    document.addEventListener('pointermove', (e) => {
      UI.pointer.x = e.clientX; UI.pointer.y = e.clientY;
      if (UI.held) refreshHeld();
    });

    document.querySelectorAll('[data-close]').forEach(btn => {
      btn.addEventListener('click', () => UI.closeScreens());
    });
    // v0.11: クリエイティブ検索
    const cs = $('creative-search');
    if (cs) cs.addEventListener('input', () => { creativeSearch = cs.value; renderCreativePanel(); });
  };

  global.UI = UI;
})(window);
