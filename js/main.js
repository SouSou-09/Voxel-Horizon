/* ==========================================================
   main.js — ゲーム全体の制御
   ========================================================== */
(function (global) {
  'use strict';

  const SAVE_KEY = 'craftworld3d_save_v1';
  const DAY_LENGTH = 600;      // 1日 = 600秒
  const B = Blocks;
  const ID = Blocks.BLOCK_ID;
  const $ = (id) => document.getElementById(id);

  const Game = {
    scene: null, camera: null, renderer: null,
    world: null, player: null, entities: null,
    time: 0.05,            // 0..1 (0 = 朝6時)
    running: false,
    debug: false,
    lastFrame: 0,
    fps: 0,
    saveTimer: 0,
    mining: { target: null, progress: 0, cooldown: 0 },
    placeTimer: 0,
    particles: [],
    // v0.13: 天候 ('clear'|'rain'|'thunder'|事実上の雪は降水タイプで決まる)
    weather: { type: 'clear', timer: 90, nextStrike: 0, flash: 0, precipType: 'none' },
    // v0.13.1: 次元 ('overworld' | 'nether')。非アクティブ次元のキャッシュとポータル転移状態
    dimension: 'overworld',
    dimCache: null,
    portalCooldown: 0,
    portalLink: null
  };
  global.Game = Game;

  /* ==========================================================
     Three.js セットアップ
     ========================================================== */
  function initThree() {
    const canvas = $('game-canvas');
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, Input.touchMode ? 1.3 : 2));
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    if ('outputEncoding' in renderer) renderer.outputEncoding = THREE.sRGBEncoding;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87ceeb);
    scene.fog = new THREE.Fog(0x87ceeb, 24, 90);

    const camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.1, 400);
    camera.rotation.order = 'YXZ';
    scene.add(camera);   // カメラに持ち物メッシュを付けるため必須

    const ambient = new THREE.AmbientLight(0xffffff, 0.55);
    const hemi = new THREE.HemisphereLight(0xbfe3ff, 0x5a4a35, 0.35);
    const sun = new THREE.DirectionalLight(0xffffff, 0.85);
    sun.position.set(60, 100, 30);
    scene.add(ambient, hemi, sun);

    // 太陽 / 月 / 星
    const sunMesh = new THREE.Mesh(new THREE.PlaneGeometry(26, 26),
      new THREE.MeshBasicMaterial({ color: 0xfff3b0, fog: false, transparent: true }));
    const moonMesh = new THREE.Mesh(new THREE.PlaneGeometry(18, 18),
      new THREE.MeshBasicMaterial({ color: 0xdfe8f5, fog: false, transparent: true }));
    scene.add(sunMesh, moonMesh);

    const starGeo = new THREE.BufferGeometry();
    const starPos = [];
    for (let i = 0; i < 500; i++) {
      const v = new THREE.Vector3(Math.random() * 2 - 1, Math.random(), Math.random() * 2 - 1).normalize().multiplyScalar(180);
      starPos.push(v.x, v.y, v.z);
    }
    starGeo.setAttribute('position', new THREE.Float32BufferAttribute(starPos, 3));
    const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 1.4, fog: false, transparent: true, opacity: 0 }));
    scene.add(stars);

    // v0.12.2: 雲レイヤー — Minecraft のように空を漂うボクセルの雲。
    // 薄い白色の直方体をランダムに配置し、updateSky で風方向にドリフトさせる。
    const clouds = new THREE.Group();
    // v0.12.3: 雲は全て同一の半透明マテリアルを共有 (46個の重複マテリアル生成を削減)
    const cloudMat = new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.62, fog: false });
    const cloudRng = (s => () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296)(987654321);
    for (let i = 0; i < 46; i++) {
      const w2 = 3 + cloudRng() * 8, d2 = 3 + cloudRng() * 6;
      const m2 = new THREE.Mesh(new THREE.BoxGeometry(w2, 0.7, d2), cloudMat);
      m2.position.set((cloudRng() * 2 - 1) * 130, 0, (cloudRng() * 2 - 1) * 130);
      m2.userData.drift = 0.55 + cloudRng() * 0.5;
      clouds.add(m2);
    }
    const CLOUD_Y = 88;
    clouds.position.y = CLOUD_Y;
    scene.add(clouds);

    // 選択ブロックの枠
    const hlGeo = new THREE.BoxGeometry(1.002, 1.002, 1.002);
    const highlight = new THREE.LineSegments(new THREE.EdgesGeometry(hlGeo),
      new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.55 }));
    highlight.visible = false;
    scene.add(highlight);

    // 破壊進行のオーバーレイ
    const breakBox = new THREE.Mesh(new THREE.BoxGeometry(1.01, 1.01, 1.01),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0 }));
    breakBox.visible = false;
    scene.add(breakBox);

    // 松明用ライト
    const torchLights = [];
    for (let i = 0; i < 4; i++) {
      const l = new THREE.PointLight(0xffb45a, 0, 13, 2);
      l.position.set(0, -100, 0);
      scene.add(l);
      torchLights.push(l);
    }

    // v0.13: 降水パーティクル (雨/雪) — カメラの周りの直方体領域を落下する点群
    const PRECIP_N = 700;
    const precipGeo = new THREE.BufferGeometry();
    const precipPos = new Float32Array(PRECIP_N * 3);
    precipGeo.setAttribute('position', new THREE.BufferAttribute(precipPos, 3));
    const precipMat = new THREE.PointsMaterial({
      color: 0xaac4e8, size: 0.09, transparent: true, opacity: 0.55,
      depthWrite: false, sizeAttenuation: true
    });
    const precip = new THREE.Points(precipGeo, precipMat);
    precip.visible = false;
    precip.frustumCulled = false;   // カメラに追随するためカリングしない
    scene.add(precip);
    const precipVel = new Float32Array(PRECIP_N);   // 粒ごとの落下速度 (雨は速く雪は遅い)

    Object.assign(Game, { renderer, scene, camera, ambient, hemi, sun, sunMesh, moonMesh, stars, clouds, highlight, breakBox, torchLights, precip, precipVel });

    window.addEventListener('resize', onResize);
    onResize();
  }

  function onResize() {
    if (!Game.renderer) return;
    const w = window.innerWidth, h = window.innerHeight;
    Game.renderer.setSize(w, h, false);
    Game.camera.aspect = w / h;
    Game.camera.updateProjectionMatrix();
  }

  /* ==========================================================
     手持ちアイテム表示
     ========================================================== */
  let handMesh = null, handItemId = null, handSwing = 0;
  function updateHandItem() {
    const s = Game.player.heldItem();
    const id = s ? s.id : null;
    if (id === handItemId) return;
    handItemId = id;
    if (handMesh) { Game.camera.remove(handMesh); handMesh = null; }
    if (!id) return;
    const m = global.makeItemMesh(id, Game.world.solidMaterial.map);
    if (!m) return;
    const isBlock = Blocks.itemDef(id).type === 'block';
    m.scale.setScalar(isBlock ? 1.6 : 1.5);
    m.position.set(0.42, -0.35, -0.65);
    m.rotation.set(isBlock ? 0.2 : 0, isBlock ? -0.6 : -0.4, isBlock ? 0.1 : 0.5);
    m.renderOrder = 999;
    handMesh = m;
    Game.camera.add(m);
  }

  function swingHand() { handSwing = 1; }

  function animateHand(dt) {
    if (!handMesh) return;
    if (handSwing > 0) handSwing = Math.max(0, handSwing - dt * 3.2);
    const s = Math.sin(handSwing * Math.PI);
    handMesh.position.y = -0.35 - s * 0.22;
    handMesh.position.x = 0.42 - s * 0.1;
    handMesh.rotation.z = (Blocks.itemDef(handItemId).type === 'block' ? 0.1 : 0.5) - s * 0.9;
  }

  /* ==========================================================
     ワールド開始
     ========================================================== */
  function startGame(seedInput, saveData, gameMode) {
    if (Game.world) {
      Game.entities.clear();
      Game.world.dispose();
      Game.scene.remove(Game.world.group);
    }
    const seed = saveData ? saveData.seed : (seedInput ? hashSeed(seedInput) : (Math.random() * 0xffffffff) >>> 0);

    const world = new World(seed, Game.scene);
    world.renderDistance = Game.settings.renderDistance;
    if (saveData) { world.loadEdits(saveData.edits); world.loadFurnaces(saveData.furnaces); world.loadChests(saveData.chests); world.crops.load(saveData.crops); if (world.loadDoors) world.loadDoors(saveData.doors); }

    const player = new Player(world);
    const entities = new EntityManager(Game.scene, world);
    Game.world = world; Game.player = player; Game.entities = entities;
    Game.dimension = 'overworld'; Game.dimCache = null; Game.portalCooldown = 0; Game.portalLink = null;
    Game.time = saveData && saveData.time !== undefined ? saveData.time : 0.05;
    // v0.13.1: ネザーのセーブデータがあれば保持 (最初のポータル転移時にロード)
    Game._netherSave = saveData && saveData.dims && saveData.dims.nether ? saveData.dims.nether : null;
    // v0.13.2: エンドのセーブデータも同様に保持
    Game._endSave = saveData && saveData.dims && saveData.dims.end ? saveData.dims.end : null;
    // v0.13.1: 保存時にネザーにいた場合は、まずオーバーワールドで開始してから自動転移する
    Game._resumeNether = !!(saveData && saveData.dimension === 'nether' && Game._netherSave);
    // v0.13.2: 保存時にエンドにいた場合も同様 (転移先は中央島)
    Game._resumeEnd = !!(saveData && saveData.dimension === 'end' && Game._endSave);

    UI.init(Game);
    updateHandItem();

    $('start-screen').classList.add('hidden');
    $('loading-screen').classList.remove('hidden');
    $('hud').classList.add('hidden');

    if (saveData && saveData.player) {
      player.load(saveData.player);
    } else {
      player.gameMode = gameMode || 'survival';
      if (player.gameMode === 'spectator') {
        // スペクテイターは空中からスタート
        player.pos.y += 14;
      }
      if (player.gameMode === 'creative') giveCreativeKit(player);
    }
    // HUD のモード表示を更新
    document.body.classList.toggle('mode-spectator', player.gameMode === 'spectator');
    document.body.classList.toggle('mode-creative', player.gameMode === 'creative');

    // 初期チャンクの生成
    const cx = Math.floor(player.pos.x), cz = Math.floor(player.pos.z);
    let frames = 0;
    function preload() {
      world.update(saveData ? player.pos.x : 0, saveData ? player.pos.z : 0, 6);
      frames++;
      const ready = world.ready(saveData ? player.pos.x : 0, saveData ? player.pos.z : 0);
      $('loading-text').textContent = `ワールドを生成中… (${Math.min(99, frames * 4)}%)`;
      if (ready && frames > 6) {
        if (!saveData) placeSpawn(player, world);
        finishLoad();
      } else requestAnimationFrame(preload);
    }
    preload();
  }

  function placeSpawn(player, world) {
    for (let r = 0; r < 12; r++) {
      for (let dz = -r; dz <= r; dz++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
          const x = dx, z = dz;
          if (!world.isLoaded(x, z)) continue;
          const h = world.getHeight(x, z);
          const top = world.getBlock(x, h, z);
          if (h > World.SEA && (top === ID.grass || top === ID.sand || top === ID.snow_block)) {
            player.pos.set(x + 0.5, h + 1.05, z + 0.5);
            player.spawn.copy(player.pos);
            return;
          }
        }
      }
    }
    player.pos.set(0.5, 45, 0.5);
    player.spawn.copy(player.pos);
  }

  // v0.8: クリエイティブ開始時の初期キット (主要ブロック)
  function giveCreativeKit(player) {
    const kit = ['grass', 'dirt', 'stone', 'cobblestone', 'planks', 'log', 'sand', 'glass',
                 'torch', 'brick', 'leaves', 'wool', 'crafting_table', 'furnace', 'chest',
                 'ladder', 'fence', 'door_oak', 'stone_stairs', 'planks_stairs', 'stone_slab',
                 'planks_slab', 'bed', 'water_bucket', 'lava_bucket', 'flower_poppy', 'dandelion'];
    for (let i = 0; i < kit.length; i++) player.inventory.set(i, { id: kit[i], count: 64 });
  }

  function finishLoad() {
    $('loading-screen').classList.add('hidden');
    $('hud').classList.remove('hidden');
    $('touch-controls').classList.toggle('hidden', !Game.settings.touchControls);
    Game.running = true;
    // v0.13.1: 保存時にネザーにいた場合はネザーへ転移して再開
    if (Game._resumeNether) {
      Game._resumeNether = false;
      const pos = Game.player.pos;
      // 仮のポータル位置としてプレイヤー座標を渡し、1:8 でネザー側の対応地点へ
      switchDimension('nether', { x: pos.x, y: pos.y, z: pos.z });
    }
    // v0.13.2: 保存時にエンドにいた場合はエンドへ転移して再開 (中央島スタート)
    if (Game._resumeEnd) {
      Game._resumeEnd = false;
      const pos = Game.player.pos;
      switchDimension('end', { x: pos.x, y: pos.y, z: pos.z });
    }
    Game.lastFrame = performance.now();
    UI.refreshAll();
    UI.updateStats();
    const modeMsg = { survival: '生存せよ！ 木を殴って木材を集めよう',
                      creative: 'クリエイティブ: 自由に建築しよう (ダブルジャンプで飛行)',
                      spectator: 'スペクテイター: 世界を自由に観察しよう (Space/Shiftで上下)' };
    UI.toast(modeMsg[Game.player.gameMode] || modeMsg.survival);
    requestAnimationFrame(loop);
  }

  /* ==========================================================
     採掘・設置
     ========================================================== */
  const _eye = new THREE.Vector3(), _dir = new THREE.Vector3();

  function currentTool() {
    const s = Game.player.heldItem();
    if (!s) return null;
    const def = Blocks.itemDef(s.id);
    return def && def.type === 'tool' ? def.tool : null;
  }

  function breakTime(def) {
    // v0.8: クリエイティブは即破壊 (岩盤は不可)
    if (Game.player && Game.player.gameMode === 'creative') {
      return def.id === ID.bedrock ? Infinity : 0.001;
    }
    if (!isFinite(def.hardness)) return Infinity;
    const tool = currentTool();
    const canHarvest = def.level === 0 || (tool && tool.kind === def.tool && tool.tier >= def.level);
    const correct = tool && tool.kind === def.tool;
    const speed = correct ? tool.speed : 1;
    return Math.max(0.05, (canHarvest ? def.hardness * 1.5 : def.hardness * 5) / speed);
  }

  function canHarvestBlock(def) {
    const tool = currentTool();
    return def.level === 0 || (tool && tool.kind === def.tool && tool.tier >= def.level);
  }

  function updateMining(dt) {
    const p = Game.player, w = Game.world, m = Game.mining;
    if (m.cooldown > 0) m.cooldown -= dt;

    if (!Input.attack || UI.openScreen || p.dead || p.gameMode === 'spectator') {
      m.target = null; m.progress = 0;
      Game.breakBox.visible = false;
      return;
    }

    p.eye(_eye); p.lookDir(_dir);

    // モブへの攻撃を優先
    const mob = Game.entities.pickMob(_eye, _dir, 3.6);
    if (mob && m.cooldown <= 0) {
      const tool = currentTool();
      const dmg = tool ? tool.damage : 1;
      Game.entities.damageMob(mob, dmg, p.pos);
      Sound.hit();
      m.cooldown = 0.55;
      swingHand();
      p.addExhaustion(0.1);
      if (tool) damageHeldTool(1);
      return;
    }

    const hit = w.raycast(_eye, _dir, 5);
    if (!hit) { m.target = null; m.progress = 0; Game.breakBox.visible = false; return; }

    const key = hit.x + ',' + hit.y + ',' + hit.z;
    if (m.target !== key) { m.target = key; m.progress = 0; }

    const def = B.get(hit.id);
    const t = breakTime(def);
    if (!isFinite(t)) { Game.breakBox.visible = false; return; }

    m.progress += dt / t;
    swingHand();
    Game.digSoundTimer = (Game.digSoundTimer || 0) - dt;
    if (Game.digSoundTimer <= 0) { Game.digSoundTimer = 0.24; Sound.dig(soundMaterial(def)); }

    Game.breakBox.visible = true;
    Game.breakBox.position.set(hit.x + 0.5, hit.y + 0.5, hit.z + 0.5);
    Game.breakBox.material.opacity = Math.min(0.55, m.progress * 0.55);

    if (m.progress >= 1) {
      m.progress = 0;
      breakBlock(hit.x, hit.y, hit.z, def);
      Game.breakBox.visible = false;
    }
  }

  function soundMaterial(def) {
    if (!def) return 'dirt';
    if (def.id === ID.glass) return 'glass';
    if (def.id === ID.sand) return 'sand';
    if (def.tool === 'axe' || def.id === ID.log || def.id === ID.planks) return 'wood';
    if (def.tool === 'pickaxe') return 'stone';
    return 'dirt';
  }

  function damageHeldTool(amount) {
    const p = Game.player;
    const idx = p.inventory.selected;
    const s = p.inventory.get(idx);
    if (!s || s.dura === undefined) return;
    if (p.inventory.damageTool(idx, amount)) {
      UI.toast('道具が壊れた！', true);
      updateHandItem();
    }
    UI.refreshHotbar();
  }

  function breakBlock(x, y, z, def) {
    const w = Game.world, p = Game.player;
    const key = World.bkey(x, y, z);

    // チェストの中身をドロップ
    if (def.id === ID.chest) {
      const arr = w.chests.get(key);
      if (arr) {
        for (const s of arr) if (s) Game.entities.dropItem(x + 0.5, y + 0.5, z + 0.5, s.id, s.count);
      }
      if (UI.chestKey === key) UI.closeScreens();
    }

    // かまどの中身をドロップ
    if (def.id === ID.furnace) {
      const f = w.furnaces.get(key);
      if (f) {
        for (const s of [f.input, f.fuel, f.output]) {
          if (s) Game.entities.dropItem(x + 0.5, y + 0.5, z + 0.5, s.id, s.count);
        }
      }
    }

    spawnParticles(x, y, z, def);
    Sound.dig(soundMaterial(def));

    // 成長中の作物は harvest() でドロップを決める
    const cropDrops = w.crops ? w.crops.harvest(x, y, z) : null;
    w.setBlock(x, y, z, 0);

    // ドロップ
    if (cropDrops) {
      for (const d of cropDrops) Game.entities.dropItem(x + 0.5, y + 0.4, z + 0.5, d.id, d.count);
    } else if (canHarvestBlock(def)) {
      if (def.drop) Game.entities.dropItem(x + 0.5, y + 0.4, z + 0.5, def.drop, def.dropCount);
      else if (def.id === ID.leaves) {
        if (Math.random() < 0.06) Game.entities.dropItem(x + 0.5, y + 0.4, z + 0.5, 'apple', 1);
        if (Math.random() < 0.04) Game.entities.dropItem(x + 0.5, y + 0.4, z + 0.5, 'stick', 1);
        if (Math.random() < 0.08) Game.entities.dropItem(x + 0.5, y + 0.4, z + 0.5, 'wheat_seed', 1);
      } else if (def.id === ID.birch_leaves) {
        if (Math.random() < 0.05) Game.entities.dropItem(x + 0.5, y + 0.4, z + 0.5, 'stick', 1);
        if (Math.random() < 0.06) Game.entities.dropItem(x + 0.5, y + 0.4, z + 0.5, 'wheat_seed', 1);
      } else if (def.id === ID.grass) {
        // 草を壊すとたまに作物の種が手に入る
        const seedRoll = Math.random();
        if (seedRoll < 0.05) Game.entities.dropItem(x + 0.5, y + 0.4, z + 0.5, 'wheat_seed', 1);
        else if (seedRoll < 0.08) Game.entities.dropItem(x + 0.5, y + 0.4, z + 0.5, 'rice_seed', 1);
        else if (seedRoll < 0.10) Game.entities.dropItem(x + 0.5, y + 0.4, z + 0.5, 'corn_seed', 1);
        else if (seedRoll < 0.12) Game.entities.dropItem(x + 0.5, y + 0.4, z + 0.5, 'tomato_seed', 1);
      }
    }

    // 上のブロックが松明なら壊す / 作物が耕地と一緒に消えた時は掃除 / 砂の落下
    const above = w.getBlock(x, y + 1, z);
    if (above === ID.torch) {
      w.setBlock(x, y + 1, z, 0);
      Game.entities.dropItem(x + 0.5, y + 1.4, z + 0.5, 'torch', 1);
      NetBroadcastEdit(x, y + 1, z, 0);
    }
    if (w.crops) w.crops.onBlockBroken(x, y, z);
    w.applyGravity(x, y + 1, z);
    NetBroadcastEdit(x, y, z, 0);

    if (currentTool()) damageHeldTool(1);
    p.addExhaustion(0.005);
  }

  function spawnParticles(x, y, z, def) {
    const tile = def.tiles ? def.tiles.side : 0;
    const [u0, v0, u1, v1] = Textures.uvRect(tile);
    for (let i = 0; i < 6; i++) {
      const geo = new THREE.PlaneGeometry(0.12, 0.12);
      const uv = geo.attributes.uv;
      const su0 = u0 + (u1 - u0) * Math.random() * 0.6;
      const sv0 = v0 + (v1 - v0) * Math.random() * 0.6;
      for (let k = 0; k < uv.count; k++) {
        uv.setXY(k, su0 + uv.getX(k) * (u1 - u0) * 0.3, sv0 + uv.getY(k) * (v1 - v0) * 0.3);
      }
      uv.needsUpdate = true;
      const mat = new THREE.MeshBasicMaterial({ map: Game.world.solidMaterial.map, side: THREE.DoubleSide });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(x + 0.2 + Math.random() * 0.6, y + 0.2 + Math.random() * 0.6, z + 0.2 + Math.random() * 0.6);
      Game.scene.add(mesh);
      Game.particles.push({
        mesh, life: 0.8,
        vel: new THREE.Vector3((Math.random() - 0.5) * 2.5, 2 + Math.random() * 2, (Math.random() - 0.5) * 2.5)
      });
    }
  }

  function updateParticles(dt) {
    for (let i = Game.particles.length - 1; i >= 0; i--) {
      const p = Game.particles[i];
      p.life -= dt;
      p.vel.y -= 18 * dt;
      p.mesh.position.addScaledVector(p.vel, dt);
      p.mesh.lookAt(Game.camera.position);
      if (p.life <= 0) {
        Game.scene.remove(p.mesh);
        p.mesh.geometry.dispose();
        p.mesh.material.dispose();
        Game.particles.splice(i, 1);
      }
    }
  }

  function tryUse() {
    const p = Game.player, w = Game.world;
    // v0.8: スペクテイターは設置・使用不可
    if (p.dead || UI.openScreen || p.gameMode === 'spectator') return;
    const stack = p.heldItem();
    p.eye(_eye); p.lookDir(_dir);
    const hit = w.raycast(_eye, _dir, 5);
    swingHand();

    // 食べる
    if (stack) {
      const def = Blocks.itemDef(stack.id);
      if (def && def.type === 'food') {
        if (p.eat(p.inventory.selected)) {
          Sound.eat();
          UI.toast(def.label + 'を食べた');
          UI.refreshHotbar();
          updateHandItem();
        }
        return;
      }
    }

    if (!hit) return;

    // クワで土・草を耕して耕地にする
    if (stack) {
      const heldDef = Blocks.itemDef(stack.id);
      if (heldDef && heldDef.type === 'tool' && heldDef.tool.kind === 'hoe') {
        if (hit.id === ID.grass || hit.id === ID.dirt) {
          w.setBlock(hit.x, hit.y, hit.z, ID.farmland);
          Sound.dig('dirt');
          damageHeldTool(1);
          return;
        }
      }
      // 種を耕地に植える
      if (heldDef && heldDef.type === 'seed') {
        if (hit.id === ID.farmland || hit.id === ID.farmland_wet) {
          const px2 = hit.x, py2 = hit.y + 1, pz2 = hit.z;
          if (w.getBlock(px2, py2, pz2) === 0 && w.crops.plant(px2, py2, pz2, heldDef.crop)) {
            Sound.place('dirt');
            p.inventory.decrement(p.inventory.selected, 1);
            UI.refreshHotbar();
            updateHandItem();
            UI.toast(heldDef.label + 'を植えた');
          }
          return;
        }
        UI.toast('耕地の上に植えてください (クワで土を耕す)', true);
        return;
      }

      // v0.4: バケツ操作
      if (heldDef && heldDef.type === 'bucket') {
        // 空バケツ: 水/溶岩の源をすくう (液体も拾うレイキャストで狙う)
        if (heldDef.bucket === 'empty') {
          const lhit = w.raycast(_eye, _dir, 5, true);
          if (lhit && (lhit.id === ID.water || lhit.id === ID.lava)) {
            const hx2 = lhit.x, hy2 = lhit.y, hz2 = lhit.z;
            if (!w.isFluidSource(hx2, hy2, hz2)) { UI.toast('流れている水はすくえない (源をすくおう)', true); return; }
            w.setBlock(hx2, hy2, hz2, 0);
            w.fluidLevel.delete(World.bkey(hx2, hy2, hz2));
            p.inventory.set(p.inventory.selected, { id: lhit.id === ID.water ? 'water_bucket' : 'lava_bucket', count: 1 });
            Sound.place('sand');
            UI.toast(lhit.id === ID.water ? '水をすくった' : '溶岩をすくった');
            UI.refreshHotbar(); updateHandItem();
          } else {
            UI.toast('水か溶岩の源に向かって使おう', true);
          }
          return;
        }
        // 水/溶岩バケツ: 設置面の隣に源を置く
        const fluidId = heldDef.bucket === 'water' ? ID.water : ID.lava;
        const nx = hit.x + hit.nx, ny = hit.y + hit.ny, nz = hit.z + hit.nz;
        const cur = w.getBlock(nx, ny, nz);
        if (cur !== 0 && !B.isLiquid(cur)) { UI.toast('そこには置けない', true); return; }
        w.setBlock(nx, ny, nz, fluidId);
        w.fluidLevel.set(World.bkey(nx, ny, nz), 0);
        w.scheduleFluid(nx, ny, nz);
        Sound.place('sand');
        p.inventory.set(p.inventory.selected, { id: 'bucket', count: 1 });
        UI.toast(heldDef.bucket === 'water' ? '水を置いた' : '溶岩を置いた');
        UI.refreshHotbar(); updateHandItem();
        return;
      }
    }

    // 設置面のブロックを操作 (作業台・かまど)
    if (!Input.sneak) {
      if (hit.id === ID.crafting_table) { openInventory(true); return; }
      if (hit.id === ID.furnace) {
        const key = World.bkey(hit.x, hit.y, hit.z);
        let f = w.furnaces.get(key);
        if (!f) { f = new InventorySystem.Furnace(); w.furnaces.set(key, f); }
        UI.openFurnace(f, key);
        exitPointerLock();
        return;
      }
      if (hit.id === ID.chest) {
        const key = World.bkey(hit.x, hit.y, hit.z);
        let arr = w.chests.get(key);
        if (!arr) { arr = new Array(27).fill(null); w.chests.set(key, arr); }
        UI.openChest(arr, key);
        exitPointerLock();
        return;
      }
      if (hit.id === ID.bed) { sleep(hit); return; }
      // v0.2: ドア / トラップドアの開閉 (スニーク中は設置優先)
      if (hit.id === ID.door_oak || hit.id === ID.trapdoor) {
        const bk = World.bkey(hit.x, hit.y, hit.z);
        const open = !w.doorState.get(bk);
        w.doorState.set(bk, open);
        w.markDirty(hit.x >> 4, hit.z >> 4);
        Sound.place('wood');
        return;
      }
      // 看板を見る
      if (hit.id === ID.sign) {
        UI.toast('看板: まだ何も書かれていない');
        return;
      }
    }

    if (!stack) return;
    const def = Blocks.itemDef(stack.id);
    if (!def || def.type !== 'block') return;

    const nx = hit.x + hit.nx, ny = hit.y + hit.ny, nz = hit.z + hit.nz;
    const cur = w.getBlock(nx, ny, nz);
    if (cur !== 0 && !B.isLiquid(cur)) return;
    if (ny < 0 || ny >= World.WH) return;

    // プレイヤーと重なる場所には置けない
    const bd = B.get(def.block);
    if (bd.solid && intersectsPlayer(nx, ny, nz)) return;
    if (bd.solid && intersectsMobs(nx, ny, nz)) return;

    // 松明は上が固体のときのみ
    if (def.block === ID.torch && !B.isSolid(w.getBlock(nx, ny - 1, nz))) {
      UI.toast('松明は地面や台の上に置こう', true);
      return;
    }

    // 梯子は側面 (設置面が水平方向) にのみ
    if (def.block === ID.ladder && hit.ny !== 0) {
      UI.toast('梯子はブロックの側面に置こう', true);
      return;
    }

    // 看板は地面の上にのみ
    if (def.block === ID.sign && hit.ny !== 1) {
      UI.toast('看板は地面の上に立てよう', true);
      return;
    }

    // v0.13: 炎は地面・側面どこにでも点火できる (完全な空中には置けない)
    if (def.block === ID.fire) {
      const belowOk = B.isSolid(w.getBlock(nx, ny - 1, nz));
      const sideOk = B.isSolid(w.getBlock(nx + 1, ny, nz)) || B.isSolid(w.getBlock(nx - 1, ny, nz)) ||
                     B.isSolid(w.getBlock(nx, ny, nz + 1)) || B.isSolid(w.getBlock(nx, ny, nz - 1)) ||
                     B.isSolid(w.getBlock(nx, ny + 1, nz));
      if (!belowOk && !sideOk) return;
      // v0.13.1: 黒曜石の枠内に置いた炎はポータルを点火する (炎は残さずポータルに変換)
      const frame = findPortalFrame(w, nx, ny, nz);
      if (frame) {
        if (p.gameMode !== 'creative') p.inventory.decrement(p.inventory.selected, 1);
        UI.refreshHotbar(); updateHandItem();
        ignitePortal(w, frame, nx, ny, nz);
        return;
      }
    }

    // 花は草・土・耕地の上にのみ
    if (bd.model === 'cross' && stack.id.indexOf('flower_') === 0) {
      const below = w.getBlock(nx, ny - 1, nz);
      if (below !== ID.grass && below !== ID.dirt && below !== ID.farmland && below !== ID.farmland_wet) {
        UI.toast('花は草や土の上に植えよう', true);
        return;
      }
    }

    w.setBlock(nx, ny, nz, def.block);
    w.applyGravity(nx, ny, nz);
    Sound.place(soundMaterial(bd));
    NetBroadcastEdit(nx, ny, nz, def.block);
    if (p.gameMode !== 'creative') p.inventory.decrement(p.inventory.selected, 1);   // v0.8: クリエイティブは消費なし
    UI.refreshHotbar();
    updateHandItem();
  }

  /** ベッドで寝る */
  function sleep(hit) {
    const p = Game.player;
    p.spawn.set(hit.x + 0.5, hit.y + 1.1, hit.z + 0.5);
    if (!Game.isNight) {
      UI.toast('リスポーン地点を設定した（夜になったら眠れる）');
      return;
    }
    if (Game.entities.mobs.some(m => m.def.hostile && m.pos.distanceTo(p.pos) < 10)) {
      UI.toast('近くにモンスターがいる！', true);
      return;
    }
    Game.time = 0.0;                     // 朝6時へ
    p.health = Math.min(p.maxHealth, p.health + 4);
    Sound.levelDay();
    UI.toast('おはよう！ 朝になった');
  }

  /* ==========================================================
     v0.13.1: ネザー次元 — ポータル検出・点火・転移
     ========================================================== */
  /** 黒曜石のポータル枠を検出。炎を置いたブロックが枠の内側なら枠情報を返す (X/Z 両方向対応) */
  function findPortalFrame(w, x, y, z) {
    return findPortalFrameAxis(w, x, y, z, 'x') || findPortalFrameAxis(w, x, y, z, 'z');
  }
  function findPortalFrameAxis(w, x, y, z, axis) {
    // axis='x': 枠がX方向に並ぶ (面はZ向き)。get(a,b) は a=水平座標, b=垂直座標
    const get = axis === 'x' ? (a, b) => w.getBlock(a, b, z) : (a, b) => w.getBlock(x, b, a);
    const c0 = axis === 'x' ? x : z;
    // 内側の左端を求める
    let left = c0;
    while (get(left - 1, y) !== ID.obsidian && left > c0 - 5) left--;
    if (get(left - 1, y) !== ID.obsidian) return null;
    let right = c0;
    while (get(right + 1, y) !== ID.obsidian && right < c0 + 5) right++;
    if (get(right + 1, y) !== ID.obsidian) return null;
    const wdt = right - left + 1;
    if (wdt < 2 || wdt > 3) return null;
    // 底辺チェック (y の1つ下が全て黒曜石)
    let baseY = y - 1;
    for (let bx = left; bx <= right; bx++) {
      if (get(bx, baseY) !== ID.obsidian) return null;
    }
    // 上端を探す
    let top = y;
    while (get(left, top) !== ID.obsidian && top < y + 5) top++;
    if (get(left, top) !== ID.obsidian) return null;
    const hgt = top - y;   // 内部の高さ
    if (hgt < 3 || hgt > 4) return null;
    // 左右の柱と天井が全て黒曜石か
    for (let ty = y - 1; ty <= top; ty++) {
      if (get(left - 1, ty) !== ID.obsidian) return null;
      if (get(right + 1, ty) !== ID.obsidian) return null;
    }
    for (let bx = left; bx <= right; bx++) {
      if (get(bx, top) !== ID.obsidian) return null;
      // 内部が空気 or 炎であること
      for (let iy = y; iy < top; iy++) {
        const cb = get(bx, iy);
        if (cb !== 0 && cb !== ID.fire) return null;
      }
    }
    return { left, right, bottom: y, top, axis, x, z };
  }

  /** ポータル枠の内部をポータルブロックで埋める (点火) */
  function ignitePortal(w, frame, x, y, z) {
    for (let ba = frame.left; ba <= frame.right; ba++) {
      for (let iy = frame.bottom; iy < frame.top; iy++) {
        if (frame.axis === 'x') w.setBlock(ba, iy, frame.z, ID.portal);
        else w.setBlock(frame.x, iy, ba, ID.portal);
      }
    }
    Sound.thunder && Sound.thunder(0.3);
    UI.toast('ポータルが開いた！');
    return true;
  }

  /** プレイヤーがポータルブロックに触れているか (ID.portal = ネザーポータル) */
  function playerInPortal(p) {
    const bx = Math.floor(p.pos.x), bz = Math.floor(p.pos.z);
    for (let by = Math.floor(p.pos.y); by <= Math.floor(p.pos.y + 1); by++) {
      if (Game.world.getBlock(bx, by, bz) === ID.portal) return { x: bx, y: by, z: bz };
    }
    return null;
  }

  /** v0.13.2: プレイヤーがエンドポータルブロックに触れているか */
  function playerInEndPortal(p) {
    const bx = Math.floor(p.pos.x), bz = Math.floor(p.pos.z);
    for (let by = Math.floor(p.pos.y); by <= Math.floor(p.pos.y + 1); by++) {
      if (Game.world.getBlock(bx, by, bz) === ID.end_portal) return { x: bx, y: by, z: bz };
    }
    return null;
  }

  /** 次元を転移する (to: 'overworld'|'nether'|'end') */
  function switchDimension(to, portalPos) {
    const from = Game.dimension;
    if (from === to) return;
    const w = Game.world;

    // 現在の次元をキャッシュ/保存
    const snapshot = {
      edits: w.serializeEdits(), furnaces: w.serializeFurnaces(), chests: w.serializeChests(),
      crops: w.crops ? w.crops.serialize() : {}, doors: w.serializeDoors ? w.serializeDoors() : []
    };

    // v0.13.2: 3次元対応の汎用キャッシュ (出発次元をキャッシュし、行き先のデータを取り出す)
    Game.dimCache = Game.dimCache || {};
    Game.dimCache[from] = snapshot;
    const targetData = Game.dimCache[to] || (to === 'nether' ? Game._netherSave : null) || (to === 'end' ? Game._endSave : null) || null;
    if (to === 'nether') Game._netherSave = null;   // 一度使ったら破棄 (以後はキャッシュで管理)
    if (to === 'end') Game._endSave = null;

    // 既存ワールドを破棄して新次元を構築
    Game.entities.clear();
    if (UI.setBossBar) UI.setBossBar(null);   // v0.13.2: ボスバーを消す
    w.dispose();
    Game.scene.remove(w.group);

    const nw = new World(w.seed, Game.scene, to);
    nw.renderDistance = Game.settings.renderDistance;
    if (targetData) {
      nw.loadEdits(targetData.edits); nw.loadFurnaces(targetData.furnaces);
      nw.loadChests(targetData.chests); nw.crops.load(targetData.crops);
      if (nw.loadDoors) nw.loadDoors(targetData.doors);
    }
    Game.world = nw;
    Game.dimension = to;
    Game.entities.world = nw; Game.entities.atlas = nw.solidMaterial.map;
    Game.player.world = nw;

    // 天候はオーバーワールドのみ (ネザー・エンドでは止める)
    if (to !== 'overworld') { Game.weather.type = 'clear'; Game.weather.flash = 0; if (Game.precip) Game.precip.visible = false; Sound.rainStop && Sound.rainStop(); }

    // 移動先座標: ネザーは1:8リンク、エンドは1:1 (転移先は常に中央島)
    let destX, destZ;
    if (to === 'nether') { destX = Math.floor(portalPos.x / 8); destZ = Math.floor(portalPos.z / 8); }
    else if (from === 'nether' && to === 'overworld') { destX = Math.floor(portalPos.x * 8); destZ = Math.floor(portalPos.z * 8); }
    else if (to === 'end') { destX = 0; destZ = 0; }               // エンド: 常に中央島 (原点)
    else { destX = Math.floor(portalPos.x); destZ = Math.floor(portalPos.z); }  // エンド→OWなど 1:1

    // 転移先ポータルを探索 or 生成
    Game.portalLink = { x: destX, z: destZ };
    Game.portalCooldown = 6;   // 即時の往復を防ぐ

    $('hud').classList.add('hidden');
    $('loading-screen').classList.remove('hidden');
    $('loading-text').textContent = to === 'nether' ? 'ネザーへ転移中…' : to === 'end' ? 'エンドへ転移中…' : 'オーバーワールドへ帰還中…';

    let frames = 0;
    function preloadDim() {
      nw.update(destX, destZ, 6);
      frames++;
      if (nw.ready(destX, destZ) && frames > 4) {
        if (to === 'end') {
          // v0.13.2: エンドは中央島の地表に直接立たせる (ポータル探索はしない)
          const gy = findEndGround(nw, destX, destZ);
          Game.player.pos.set(destX + 0.5, gy + 1.05, destZ + 6.5);
          Game.player.vel.set(0, 0, 0);
          Game.player.spawn.copy(Game.player.pos);
        } else {
          // 帰還ポータルを探す (近くに既存ポータルがあればそこへ、無ければ生成)
          const exitPortal = findOrBuildReturnPortal(nw, destX, destZ, to);
          if (global.__cwTest) global.__cwTest.lastExit = exitPortal;
          placePlayerAtPortal(Game.player, exitPortal);
        }
        $('loading-screen').classList.add('hidden');
        $('hud').classList.remove('hidden');
        UI.toast(to === 'nether' ? 'ネザーに来た。溶岩とソウルサンドの世界だ'
               : to === 'end' ? 'エンドに来た。虚空に浮かぶ島と、あの気配…'
               : 'オーバーワールドに帰還した');
        Sound.portal && Sound.portal();
      } else {
        requestAnimationFrame(preloadDim);
      }
    }
    preloadDim();
  }

  /** v0.13.2: エンドの中央島で安全な地表の高さを探す (見つからなければ足場を作る) */
  function findEndGround(w, x, z) {
    for (let r = 0; r <= 30; r += 3) {
      for (let dz = -r; dz <= r; dz += 3) for (let dx = -r; dx <= r; dx += 3) {
        const nx = x + dx, nz = z + dz;
        if (!w.isLoaded(nx, nz)) continue;
        const h = w.getHeight(nx, nz);
        if (h > 20 && w.getBlock(nx, h, nz) === ID.end_stone) return h;
      }
    }
    // 虚空に落ちないよう足場を生成
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++)
      w.setBlock(x + dx, 40, z + dz, ID.end_stone);
    return 40;
  }

  /** 転移先の近くにポータルを探し、無ければ自動生成して出口位置を返す */
  function findOrBuildReturnPortal(w, cx, cz, to) {
    // v0.13.2: エンド帰還はエンドポータル (exit portal) を使う
    const pid = to === 'overworld' && Game._endExit ? ID.end_portal : ID.portal;
    // 既存ポータルを半径40で探索 (高さは全層走査 — 帰還ポータルが別物として増殖するのを防ぐ)
    for (let r = 0; r <= 40; r += 4) {
      for (let dz = -r; dz <= r; dz += 4) for (let dx = -r; dx <= r; dx += 4) {
        const px = cx + dx, pz = cz + dz;
        if (!w.isLoaded(px, pz)) continue;
        for (let y = 1; y <= World.WH - 2; y++) {
          if (w.getBlock(px, y, pz) === pid) return { x: px, y, z: pz };
        }
      }
    }
    // 無ければ生成: 安全な地面を探してポータルを建てる
    let bx = cx, bz = cz, baseY;
    if (to === 'nether') {
      // ネザー: 溶岩海より上の地表を探す
      baseY = findNetherGround(w, bx, bz);
      if (global.__cwTest) global.__cwTest.lastGround = { x: bx, z: bz, baseY };
    } else {
      baseY = w.getHeight(bx, bz) + 1;
      if (global.__cwTest) global.__cwTest.lastGround = { x: bx, z: bz, baseY, to };
    }
    if (pid === ID.end_portal) {
      // v0.13.2: エンド帰還ポータル (床に埋め込む 3x3 エンドポータル + 岩盤の受け皿)
      baseY = Math.max(4, Math.min(baseY, World.WH - 3));
      for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
        w.setBlock(bx + dx, baseY - 1, bz + dz, ID.end_portal);
        w.setBlock(bx + dx, baseY - 2, bz + dz, ID.bedrock);
      }
      const portalPos = { x: bx, y: baseY, z: bz };
      if (global.__cwTest) global.__cwTest.lastPortal = { x: bx, y: baseY, z: bz, to, kind: 'end_exit' };
      return portalPos;
    }
    const usedBaseY = buildPortalAt(w, bx, baseY, bz);
    const portalPos = { x: bx, y: usedBaseY + 1, z: bz };
    // デバッグ/テスト用: 自動生成したポータルの実位置を記録
    if (global.__cwTest) global.__cwTest.lastPortal = { x: bx, y: usedBaseY, z: bz, to };
    return portalPos;
  }

  /** ネザーで安全な地面 (溶岩海より上のネザーラック) を探す */
  function findNetherGround(w, x, z) {
    for (let r = 0; r <= 24; r += 3) {
      for (let dz = -r; dz <= r; dz += 3) for (let dx = -r; dx <= r; dx += 3) {
        const nx = x + dx, nz = z + dz;
        if (!w.isLoaded(nx, nz)) continue;
        const h = w.getHeight(nx, nz);
        const top = w.getBlock(nx, h, nz);
        if (h > World.SEA + 1 && h < World.WH - 12 && (top === ID.netherrack || top === ID.soul_sand || top === ID.basalt || top === ID.basalt_smooth)) {
          return h + 1;
        }
      }
    }
    // 見つからなければ溶岩海の上に足場を作る (ネザーの天井を誤認しないよう高さを制限)
    const h = Math.max(World.SEA + 2, Math.min(w.getHeight(x, z) + 1, World.SEA + 8));
    for (let dx = -1; dx <= 4; dx++) for (let dz = -1; dz <= 3; dz++) {
      w.setBlock(x + dx, h - 1, z + dz, ID.netherrack);
    }
    return h;
  }

  /** 指定位置にポータル (黒曜石枠+ポータルブロック) を建てる */
  function buildPortalAt(w, x, baseY, z) {
    // 4x5 ポータル (内部 2x3)。baseY+4 がワールド高さ内に収まるようクランプ
    baseY = Math.max(1, Math.min(baseY, World.WH - 5));
    for (let dx = 0; dx < 4; dx++) {
      for (let dy = 0; dy < 5; dy++) {
        const isFrame = dx === 0 || dx === 3 || dy === 0 || dy === 4;
        w.setBlock(x + dx, baseY + dy, z, isFrame ? ID.obsidian : ID.portal);
      }
    }
    return baseY;
  }

  /** ポータルの前にプレイヤーを立たせる */
  function placePlayerAtPortal(p, portal) {
    p.pos.set(portal.x + 0.5, portal.y + 0.05, portal.z + 2.2);
    p.vel.set(0, 0, 0);
    p.spawn.copy(p.pos);
  }

  /** ポータル転移の監視 (ループから毎フレーム) */
  function updatePortal(dt) {
    if (Game.portalCooldown > 0) Game.portalCooldown -= dt;
    if (Game.portalCooldown > 0 || Game.player.dead) return;
    const p = Game.player;
    // v0.13.2: エンドポータル (地下の遺跡・帰還ポータル両方で使う)
    const ep = playerInEndPortal(p);
    if (ep) {
      Game.portalCooldown = 6;
      if (Game.dimension === 'end') { Game._endExit = true; switchDimension('overworld', ep); }
      else switchDimension('end', ep);
      return;
    }
    const pp = playerInPortal(p);
    if (!pp) return;
    const to = Game.dimension === 'overworld' ? 'nether' : 'overworld';
    Game.portalCooldown = 6;
    switchDimension(to, pp);
  }

  // v0.13.1/v0.13.2: 自動テスト用フック (本番動作には影響しない)
  global.__cwTest = {
    findPortalFrame, ignitePortal, switchDimension, updatePortal,
    playerInPortal, playerInEndPortal, buildPortalAt, findNetherGround, findEndGround
  };

  function intersectsPlayer(x, y, z) {
    const p = Game.player.pos;
    return (x + 1 > p.x - Player.HW && x < p.x + Player.HW &&
            y + 1 > p.y && y < p.y + Player.PH &&
            z + 1 > p.z - Player.HW && z < p.z + Player.HW);
  }

  function intersectsMobs(x, y, z) {
    for (const m of Game.entities.mobs) {
      if (x + 1 > m.pos.x - m.def.hw && x < m.pos.x + m.def.hw &&
          y + 1 > m.pos.y && y < m.pos.y + m.def.h &&
          z + 1 > m.pos.z - m.def.hw && z < m.pos.z + m.def.hw) return true;
    }
    return false;
  }

  /* ==========================================================
     昼夜サイクル
     ========================================================== */
  // v0.12.3: 空色の定数と作業用 Color をモジュールスコープに保持し、
  // 毎フレームの new THREE.Color() 生成 (GC 負荷) を排除する
  const SKY_DAY = new THREE.Color(0x87ceeb);
  const SKY_NIGHT = new THREE.Color(0x080b1a);
  const SKY_DUSK = new THREE.Color(0xff9d5c);
  const SKY_UNDER = new THREE.Color(0x1f4f8f);
  const SKY_NETHER = new THREE.Color(0x30100c);   // v0.13.1: ネザーの暗赤の空
  const SKY_END = new THREE.Color(0x0a0812);      // v0.13.2: エンドの黒い虚空
  const SKY_SCRATCH = new THREE.Color();   // 使い回し (scene.background / fog.color が参照)

  function updateSky(dt) {
    // v0.13.2: エンドは昼夜なし・黒い星空・薄い紫の霧。島の輪郭が見える程度の明るさ
    if (Game.dimension === 'end') {
      const sky = SKY_SCRATCH.copy(SKY_END);
      Game.scene.background = sky;
      Game.scene.fog.color = sky;
      const rd = Game.world.renderDistance * 16;
      Game.scene.fog.near = rd * 0.5;
      Game.scene.fog.far = rd * 1.1;
      Game.ambient.intensity = 0.34;
      Game.hemi.intensity = 0.2;
      Game.sun.intensity = 0.06;
      Game.sun.color.setHex(0xb9a8ff);
      Game.sunMesh.material.opacity = 0;
      Game.moonMesh.material.opacity = 0;
      Game.stars.position.copy(Game.camera.position);
      Game.stars.material.opacity = 0.9;
      if (Game.clouds) Game.clouds.visible = false;
      Game.daylight = 0.5; Game.isNight = false;   // モブは昼として扱う
      $('clock-display').textContent = '🐉 エンド';
      return;
    }
    // v0.13.1: ネザーは昼夜なし・暗赤の空・濃い霧。時計は回し続けるが表示は「ネザー」
    if (Game.dimension === 'nether') {
      const sky = SKY_SCRATCH.copy(SKY_NETHER);
      Game.scene.background = sky;
      Game.scene.fog.color = sky;
      const rd = Game.world.renderDistance * 16;
      Game.scene.fog.near = rd * 0.28;
      Game.scene.fog.far = rd * 0.72;
      Game.ambient.intensity = 0.42;
      Game.hemi.intensity = 0.24;
      Game.sun.intensity = 0.05;
      Game.sunMesh.material.opacity = 0;
      Game.moonMesh.material.opacity = 0;
      Game.stars.material.opacity = 0;
      if (Game.clouds) Game.clouds.visible = false;
      Game.daylight = 0.55; Game.isNight = false;   // モブは昼として扱う (ネザーで燃えないので)
      $('clock-display').textContent = '🔥 ネザー';
      return;
    }
    Game.time = (Game.time + dt / DAY_LENGTH) % 1;
    const angle = Game.time * Math.PI * 2;
    const elev = Math.sin(angle);
    const daylight = Math.max(0, Math.min(1, (elev + 0.18) / 0.45));
    Game.daylight = daylight;
    Game.isNight = elev < -0.05;

    const sky = SKY_SCRATCH.copy(SKY_NIGHT).lerp(SKY_DAY, daylight);
    const duskAmount = Math.max(0, 1 - Math.abs(elev) * 5) * Math.min(1, daylight * 2.2);
    sky.lerp(SKY_DUSK, duskAmount * 0.45);

    const under = Game.player.headInWater;
    if (under) sky.lerp(SKY_UNDER, 0.75);

    // v0.13: 天候による暗転 (雨は曇天に、雷雨はさらに暗く。落雷の閃光で一瞬明るく)
    const wt = Game.weather || { type: 'clear', flash: 0 };
    const weatherDark = wt.type === 'thunder' ? 0.62 : wt.type === 'rain' ? 0.38 : 0;
    if (weatherDark > 0) sky.multiplyScalar(1 - weatherDark * (0.4 + daylight * 0.6));
    if (wt.flash > 0) sky.lerp(SKY_DAY, wt.flash * 0.7);   // 雷の閃光

    Game.scene.background = sky;
    Game.scene.fog.color = sky;
    const rd = Game.world.renderDistance * 16;
    // v0.13: 雨天は霧を濃く (視界が悪くなる)
    const fogScale = wt.type === 'thunder' ? 0.55 : wt.type === 'rain' ? 0.72 : 1;
    Game.scene.fog.near = under ? 0.5 : rd * 0.45 * fogScale;
    Game.scene.fog.far = under ? 14 : rd * 1.05 * fogScale;

    Game.ambient.intensity = (0.22 + daylight * 0.5) * (1 - weatherDark * 0.4) + (wt.flash > 0 ? wt.flash * 0.5 : 0);
    Game.hemi.intensity = 0.15 + daylight * 0.3;
    Game.sun.intensity = (0.1 + daylight * 0.8) * (1 - weatherDark);
    Game.sun.color.setHex(duskAmount > 0.5 ? 0xffc38a : 0xffffff);

    const cam = Game.camera.position;
    const sx = Math.cos(angle) * 150, sy = Math.sin(angle) * 150;
    Game.sun.position.set(cam.x + sx, cam.y + sy, cam.z + 40);
    Game.sunMesh.position.set(cam.x + sx, cam.y + sy, cam.z + 40);
    Game.sunMesh.lookAt(cam);
    Game.sunMesh.material.opacity = Math.max(0, Math.min(1, elev * 4 + 0.4)) * (1 - weatherDark);
    Game.moonMesh.position.set(cam.x - sx, cam.y - sy, cam.z - 40);
    Game.moonMesh.lookAt(cam);
    Game.moonMesh.material.opacity = Math.max(0, Math.min(1, -elev * 4 + 0.4)) * (1 - weatherDark);
    Game.stars.position.copy(cam);
    Game.stars.material.opacity = Math.max(0, 1 - daylight * 2) * (1 - weatherDark);

    // v0.12.2: 雲を風方向にドリフトさせ、プレイヤー中心に保つ (ワープアラウンド)
    if (Game.clouds) {
      Game.clouds.position.x = cam.x;
      Game.clouds.position.z = cam.z;
      Game.clouds.position.y = 88;
      // v0.12.3: 不透明度は共有マテリアルに1回だけ設定 (46回のループを削減)
      Game.clouds.visible = daylight > 0.02;
      if (Game.clouds.visible) {
        Game.clouds.children[0].material.opacity = 0.28 + daylight * 0.34;
        for (const cl of Game.clouds.children) {
          cl.position.x += cl.userData.drift * dt;
          if (cl.position.x > 140) cl.position.x = -140;   // 端でループ
        }
      }
    }

    // 時刻表示 (v0.13: 天候アイコンも表示)
    const hours = (Game.time * 24 + 6) % 24;
    const hh = Math.floor(hours), mm = Math.floor((hours - hh) * 60);
    let wIcon = '';
    if (wt.type === 'thunder') wIcon = ' ⛈';
    else if (wt.type === 'rain') wIcon = wt.precipType === 'snow' ? ' 🌨' : wt.precipType === 'rain' ? ' 🌧' : ' ☁';
    $('clock-display').textContent = `${Game.isNight ? '🌙' : '☀'} ${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}${wIcon}`;
  }

  let torchTimer = 0;
  function updateTorchLights(dt) {
    torchTimer -= dt;
    if (torchTimer > 0) return;
    torchTimer = 0.4;
    const p = Game.player.pos;
    const list = [];
    for (const key of Game.world.torches) {
      const [x, y, z] = key.split(',').map(Number);
      const d2 = (x - p.x) ** 2 + (y - p.y) ** 2 + (z - p.z) ** 2;
      if (d2 < 400) list.push({ x, y, z, d2 });
    }
    list.sort((a, b) => a.d2 - b.d2);
    Game.torchLights.forEach((l, i) => {
      const t = list[i];
      if (t) {
        l.intensity = 1.1;
        l.position.set(t.x + 0.5, t.y + 0.6, t.z + 0.5);
      } else { l.intensity = 0; }
    });
  }

  /* ==========================================================
     v0.13: 天候システム (雨 / 雷雨 / 雪)
     ========================================================== */
  // バイオームごとの降水タイプ。寒冷は雪、砂漠・メサ・火山は降らない
  const WEATHER_BY_BIOME = {
    snow: 'snow', taiga: 'snow', high_mountains: 'snow', icebergs: 'snow',
    desert: 'none', mesa: 'none', volcanic: 'none'
  };
  function precipTypeAt(biome) { return WEATHER_BY_BIOME[biome] || 'rain'; }

  function updateWeather(dt) {
    const wt = Game.weather;
    const p = Game.player, w = Game.world;
    if (!p || !w) return;
    // v0.13.1/v0.13.2: ネザー・エンドに天候はない (降水・雷・音をすべて止める)
    if (Game.dimension !== 'overworld') {
      if (Game.precip) Game.precip.visible = false;
      if (Game._rainSndOn) { Sound.rainStop(); Game._rainSndOn = false; }
      wt.flash = 0; wt.precipType = 'none';
      return;
    }

    /* --- 状態遷移タイマー --- */
    wt.timer -= dt;
    if (wt.timer <= 0) {
      if (wt.type === 'clear') {
        // 晴れ → 雨 (80%) か雷雨 (20%)
        wt.type = Math.random() < 0.2 ? 'thunder' : 'rain';
        wt.timer = 30 + Math.random() * 60;             // 降水は 30-90 秒
        wt.nextStrike = 3 + Math.random() * 4;          // 雷雨: 最初の落雷まで
      } else {
        wt.type = 'clear';
        wt.timer = 100 + Math.random() * 160;           // 晴れは 100-260 秒
      }
    }

    /* --- プレイヤー地点の降水タイプ (バイオーム依存) --- */
    const bx = Math.floor(p.pos.x), bz = Math.floor(p.pos.z);
    const biome = w.displayBiomeAt ? w.displayBiomeAt(bx, bz) : 'plains';
    const active = wt.type !== 'clear';
    wt.precipType = active ? precipTypeAt(biome) : 'none';
    // プレイヤーが雨の当たらない場所 (地下・水中) にいると音・粒を弱める
    const surfY = w.getHeight(bx, bz);
    const exposed = p.pos.y > surfY - 1 && !p.headInWater;

    /* --- 降水パーティクル --- */
    const precip = Game.precip;
    if (precip) {
      const show = active && wt.precipType !== 'none' && exposed;
      precip.visible = show;
      if (show) {
        const isSnow = wt.precipType === 'snow';
        const mat = precip.material;
        mat.color.setHex(isSnow ? 0xffffff : 0x9db8e8);
        mat.size = isSnow ? 0.12 : 0.08;
        mat.opacity = isSnow ? 0.85 : 0.5;
        const pos = precip.geometry.attributes.position;
        const arr = pos.array;
        const vel = Game.precipVel;
        const cx = p.pos.x, cy = p.pos.y, cz = p.pos.z;
        const R = 11;   // 半径 (プレイヤー周辺 11m)
        const H = 14;   // 高さ範囲
        const n = pos.count;
        for (let i = 0; i < n; i++) {
          let x = arr[i * 3], y = arr[i * 3 + 1], z = arr[i * 3 + 2];
          if (vel[i] === 0 || y < cy - 2) {
            // 再配置: プレイヤー上空のランダムな位置へ
            x = cx + (Math.random() * 2 - 1) * R;
            z = cz + (Math.random() * 2 - 1) * R;
            y = cy + 4 + Math.random() * H;
            vel[i] = isSnow ? 1.6 + Math.random() * 1.2 : 14 + Math.random() * 6;
          }
          y -= vel[i] * dt;
          if (isSnow) {
            // 雪はゆらゆら揺れる
            x += Math.sin((y + i) * 0.8) * dt * 1.2;
            z += Math.cos((y + i * 1.7) * 0.7) * dt * 1.2;
          } else {
            // 雨はわずかに斜め (風)
            x += 1.6 * dt;
          }
          arr[i * 3] = x; arr[i * 3 + 1] = y; arr[i * 3 + 2] = z;
        }
        pos.needsUpdate = true;
      }
    }

    /* --- 雨音 --- */
    const wantRainSound = active && wt.precipType === 'rain' && exposed;
    if (wantRainSound && !Game._rainSndOn) { Sound.rainStart(); Game._rainSndOn = true; }
    else if (!wantRainSound && Game._rainSndOn) { Sound.rainStop(); Game._rainSndOn = false; }

    /* --- 雷雨: 落雷 + 閃光 + 火災 --- */
    if (wt.flash > 0) wt.flash = Math.max(0, wt.flash - dt * 3.5);
    if (wt.type === 'thunder') {
      wt.nextStrike -= dt;
      if (wt.nextStrike <= 0) {
        wt.nextStrike = 3 + Math.random() * 7;
        // プレイヤー周辺 4-28m の地点に落雷
        const ang = Math.random() * Math.PI * 2;
        const dist = 4 + Math.random() * 24;
        const lx = Math.floor(p.pos.x + Math.cos(ang) * dist);
        const lz = Math.floor(p.pos.z + Math.sin(ang) * dist);
        const near = dist < 12;
        wt.flash = near ? 1.0 : 0.55;
        Sound.thunder(near);
        if (w.isLoaded(lx, lz)) {
          const ly = w.getHeight(lx, lz);
          const lbiome = w.displayBiomeAt ? w.displayBiomeAt(lx, lz) : 'plains';
          // その場所で雨が降っている (乾燥バイオーム以外) なら火を点ける
          if (precipTypeAt(lbiome) === 'rain' && ly > World.SEA) {
            const above = w.getBlock(lx, ly + 1, lz);
            if (above === 0 && B.isSolid(w.getBlock(lx, ly, lz))) {
              w.setBlock(lx, ly + 1, lz, ID.fire);
            }
          }
        }
      }
    }

    /* --- 炎ブロックの燃え尽き (雨で消える + 時間経過) --- */
    Game._fireTick = (Game._fireTick || 0) - dt;
    if (Game._fireTick <= 0) {
      Game._fireTick = 2.5;
      // プレイヤー周辺の炎を稀に消す (永遠に燃え続けないように)
      for (let i = 0; i < 8; i++) {
        const fx = Math.floor(p.pos.x + (Math.random() * 2 - 1) * 20);
        const fz = Math.floor(p.pos.z + (Math.random() * 2 - 1) * 20);
        if (!w.isLoaded(fx, fz)) continue;
        const fy = w.getHeight(fx, fz);
        for (let dy = 0; dy <= 2; dy++) {
          if (w.getBlock(fx, fy + dy, fz) === ID.fire) {
            // 雨が降っていれば高確率、晴れでも低確率で消える
            const extinguish = active ? 0.6 : 0.12;
            if (Math.random() < extinguish) w.setBlock(fx, fy + dy, fz, 0);
          }
        }
      }
    }
  }

  /* ==========================================================
     v0.13.2: エンダードラゴン — ボスバー・撃破報酬
     (ドラゴン本体のAI/モデルは entities.js 側。ここではHUD連携のみ)
     ========================================================== */
  function updateDragon(dt) {
    if (!Game.entities || !Game.entities.mobs) return;
    let dragon = null;
    for (const m of Game.entities.mobs) {
      if (m.type === 'ender_dragon' && !m.dead) { dragon = m; break; }
    }
    if (UI.setBossBar) {
      if (dragon && Game.dimension === 'end') UI.setBossBar('エンダードラゴン', Math.max(0, dragon.hp) / (dragon.maxHp || 200));
      else UI.setBossBar(null);
    }
  }

  /* ==========================================================
     メインループ
     ========================================================== */
  function loop(now) {
    if (!Game.running) return;
    requestAnimationFrame(loop);
    let dt = (now - Game.lastFrame) / 1000;
    Game.lastFrame = now;
    if (dt > 0.1) dt = 0.1;
    Game.fps = Game.fps * 0.9 + (1 / Math.max(dt, 1e-4)) * 0.1;

    // 常時表示ステータス (FPS・座標)
    if (!Game._statusAcc || now - Game._statusAcc > 250) {
      Game._statusAcc = now;
      const sp = Game.player;
      $('status-display').textContent =
        `${(global.GameVersion && GameVersion.VERSION.string) || 'v0.2'}  FPS ${Game.fps.toFixed(0)}  X:${sp.pos.x.toFixed(1)} Y:${sp.pos.y.toFixed(1)} Z:${sp.pos.z.toFixed(1)}`;
    }

    const p = Game.player, w = Game.world;
    const paused = !!UI.openScreen;

    // 視点
    if (!paused) {
      const look = Input.consumeLook();
      p.yaw -= look.x;
      p.pitch -= look.y;
      p.pitch = Math.max(-1.553, Math.min(1.553, p.pitch));
    } else {
      Input.consumeLook();
    }

    // 物理
    if (!paused) {
      p.update(dt, Input);
    }

    // カメラ
    p.eye(_eye);
    const bob = p.onGround ? Math.sin(p.bobPhase * 2) * 0.035 * Math.min(1, Math.hypot(p.vel.x, p.vel.z) / 4) : 0;
    Game.camera.position.set(_eye.x, _eye.y + bob, _eye.z);
    Game.camera.rotation.y = p.yaw;
    Game.camera.rotation.x = p.pitch;

    // 操作
    if (!paused && !p.dead) {
      updateMining(dt);
      if (Input.consumeUse()) { tryUse(); Game.placeTimer = 0.28; }
      else if (Input.useHeld) {
        Game.placeTimer -= dt;
        if (Game.placeTimer <= 0) { tryUse(); Game.placeTimer = 0.28; }
      }
    } else {
      Input.consumeUse();
      Game.breakBox.visible = false;
    }

    // 照準ハイライト
    if (!p.dead) {
      p.eye(_eye); p.lookDir(_dir);
      const hit = w.raycast(_eye, _dir, 5);
      if (hit) {
        Game.highlight.visible = true;
        Game.highlight.position.set(hit.x + 0.5, hit.y + 0.5, hit.z + 0.5);
      } else Game.highlight.visible = false;
    } else Game.highlight.visible = false;

    // ワールド / エンティティ
    w.update(p.pos.x, p.pos.z, Input.touchMode ? 1 : 2);
    // v0.8: 村人など生成待ちのモブを、チャンク生成後に実際にスポーンさせる
    // v0.10.4 B1: ダンジョンの番人 (sp.y 指定あり) は「地表の高さ」ではなく
    // 指定されたYにスポーンさせる。旧実装は全モブを地表 (getHeight+1) に
    // スポーンさせていたため、ダンジョンのゾンビが遥か頭上の地表に現れていた。
    if (w.pendingSpawns && w.pendingSpawns.length) {
      const remain = [];
      for (const sp of w.pendingSpawns) {
        if (Game.entities.mobs.length > 60) { remain.push(sp); continue; }
        if (w.isLoaded(Math.floor(sp.x), Math.floor(sp.z))) {
          const sy = (sp.y !== undefined) ? sp.y : w.getHeight(Math.floor(sp.x), Math.floor(sp.z)) + 1;
          Game.entities.spawnMob(sp.type, sp.x, sy, sp.z);
        } else remain.push(sp);
      }
      w.pendingSpawns = remain;
    }
    if (w.crops) w.crops.update(dt);
    if (w.tickFluids) w.tickFluids(dt);   // v0.4 流体シミュレーション
    Game.entities.update(dt, p, Game.camera, Game.isNight, Game.daylight || 0);
    updateParticles(dt);
    updatePortal(dt);    // v0.13.1/v0.13.2: ポータル転移 (ネザー・エンド)
    updateDragon(dt);    // v0.13.2: ドラゴン出現・ボスバー・報酬
    updateWeather(dt);   // v0.13: 天候 (降水・雷・炎の燃え尽き)
    updateSky(dt);
    updateTorchLights(dt);
    animateHand(dt);

    // v0.13.2: エンドの虚無落下 (島の下に落ちたら継続ダメージ)
    if (!paused && !p.dead && Game.dimension === 'end' && p.pos.y < -6 && p.gameMode === 'survival') {
      Game._voidAcc = (Game._voidAcc || 0) + dt;
      if (Game._voidAcc >= 0.5) {
        Game._voidAcc = 0;
        p.damage(4, '虚無に落ちた', true);
      }
    }

    // かまど
    for (const [, f] of w.furnaces) f.tick(dt);
    UI.updateFurnaceUI();

    // v0.13.3: オンライン同期 (リモートのブロック変更を適用)
    if (Net.mode !== 'offline' && Net._remoteEdits && Net._remoteEdits.length) {
      for (const e of Net._remoteEdits) {
        w.setBlock(e.x, e.y, e.z, e.id);
        w.markDirty(e.x >> 4, e.z >> 4);
      }
      Net._remoteEdits.length = 0;
    }

    // 足音
    if (p.onGround && !paused) {
      const spd = Math.hypot(p.vel.x, p.vel.z);
      Game.stepDist = (Game.stepDist || 0) + spd * dt;
      if (Game.stepDist > 2.2) { Game.stepDist = 0; Sound.step(); }
    }

    // HUD
    updateHandItem();
    UI.updateStats();
    if (Game.debug) updateDebug();

    // オートセーブ
    Game.saveTimer += dt;
    if (Game.saveTimer > 30) { Game.saveTimer = 0; saveGame(true); }

    Game.renderer.render(Game.scene, Game.camera);
  }

  // v0.12.2: バイオームの日本語表示名
  const BIOME_JA = {
    plains: '平原', forest: '森', birch_forest: '白樺の森', bamboo_forest: '竹林',
    desert: '砂漠', savanna: 'サバンナ', jungle: 'ジャングル', snow: '雪原', taiga: 'タイガ',
    mountains: '山岳', high_mountains: '高山', volcanic: '火山地帯', swamp: '沼地',
    cherry: '桜', flower_field: '花畑', ocean: '海', warm_ocean: '暖かい海',
    // v0.13: 新バイオーム
    mesa: 'メサ', mushroom_island: 'きのこ島', icebergs: '氷山'
  };
  function updateDebug() {
    const p = Game.player;
    const el = $('debug-panel');
    const biome = Game.world.displayBiomeAt ? Game.world.displayBiomeAt(Math.floor(p.pos.x), Math.floor(p.pos.z)) : '?';
    el.textContent =
      `バージョン: ${(global.GameVersion && GameVersion.VERSION.string) || 'v0.1'}\n` +
      `FPS: ${Game.fps.toFixed(0)}\n` +
      `XYZ: ${p.pos.x.toFixed(1)} / ${p.pos.y.toFixed(1)} / ${p.pos.z.toFixed(1)}\n` +
      `バイオーム: ${BIOME_JA[biome] || biome}\n` +
      `チャンク: ${Math.floor(p.pos.x / 16)}, ${Math.floor(p.pos.z / 16)} (読込 ${Game.world.chunks.size})\n` +
      `モブ: ${Game.entities.mobs.length} / ドロップ: ${Game.entities.items.length}\n` +
      `時刻: ${(Game.time * 24 + 6) % 24 | 0}時 / 明るさ ${(Game.daylight || 0).toFixed(2)}\n` +
      `接地: ${p.onGround} 水中: ${p.inWater}`;
  }

  /* ==========================================================
     セーブ / ロード
     ========================================================== */
  function saveGame(silent) {
    if (!Game.world) return;
    try {
      // v0.13.1/v0.13.2: 次元ごとのデータをまとめて保存 (オーバーワールド + ネザー + エンド)
      const curSnap = {
        edits: Game.world.serializeEdits(),
        furnaces: Game.world.serializeFurnaces(),
        chests: Game.world.serializeChests(),
        crops: Game.world.crops ? Game.world.crops.serialize() : {},
        doors: Game.world.serializeDoors ? Game.world.serializeDoors() : []
      };
      const cache = Game.dimCache || {};
      const dims = {
        overworld: Game.dimension === 'overworld' ? curSnap : (cache.overworld || null),
        nether: Game.dimension === 'nether' ? curSnap : (cache.nether || Game._netherSave || null),
        end: Game.dimension === 'end' ? curSnap : (cache.end || Game._endSave || null)
      };
      const ow = dims.overworld || curSnap;
      const data = {
        seed: Game.world.seed,
        time: Game.time,
        dimension: Game.dimension,
        // 後方互換: トップレベルは常にオーバーワールドの内容
        edits: ow.edits, furnaces: ow.furnaces, chests: ow.chests, crops: ow.crops, doors: ow.doors,
        dims,
        player: Game.player.serialize(),
        savedAt: Date.now()
      };
      localStorage.setItem(SAVE_KEY, JSON.stringify(data));
      if (!silent) UI.toast('セーブしました');
    } catch (e) {
      console.warn('save failed', e);
      if (!silent) UI.toast('セーブに失敗しました', true);
    }
  }

  function loadSave() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }

  /* ==========================================================
     UI コールバック
     ========================================================== */
  function openInventory(useTable) {
    UI.openInventory(useTable);
    exitPointerLock();
  }

  function exitPointerLock() {
    if (document.pointerLockElement) document.exitPointerLock();
  }

  function toggleInventory() {
    if (UI.openScreen) { UI.closeScreens(); return; }
    // 目の前が作業台なら3x3
    const p = Game.player;
    p.eye(_eye); p.lookDir(_dir);
    const hit = Game.world.raycast(_eye, _dir, 4);
    openInventory(hit && hit.id === ID.crafting_table);
  }

  function togglePause() {
    if (UI.openScreen) UI.closeScreens();
    else { UI.openPause(); exitPointerLock(); }
  }

  function dropHeld() {
    const p = Game.player;
    const s = p.inventory.held();
    if (!s) return;
    p.eye(_eye); p.lookDir(_dir);
    Game.entities.dropItem(_eye.x + _dir.x, _eye.y, _eye.z + _dir.z, s.id, 1);
    p.inventory.decrement(p.inventory.selected, 1);
    UI.refreshHotbar();
    updateHandItem();
  }

  /* ==========================================================
     v0.13.3: オンライン (OmniP2P) 連携
     ========================================================== */
  function NetBroadcastEdit(x, y, z, id) {
    if (Net.mode === 'offline') return;
    Net.broadcastEdit({ x, y, z, id });
  }

  // ホスト側: クライアントの編集をワールドに適用 (権威はホスト)
  global.NetHostApplyEdit = function (msg) {
    if (!Game.world || !msg || !msg.data) return;
    const d = msg.data;
    Game.world.setBlock(d.x, d.y, d.z, d.id);
    Game.world.markDirty(d.x >> 4, d.z >> 4);
  };

  // クライアント側: リモート編集をループで適用するためのキュー
  global.NetClientApplyEdit = function (data) {
    if (!data) return;
    Net._remoteEdits = Net._remoteEdits || [];
    Net._remoteEdits.push(data);
  };

  // クライアント側: ホストからスナップショットを受信したらワールドを再構築
  global.NetClientReceiveSnapshot = function (snap) {
    if (!snap || !snap.seed) return;
    // 現在のゲームをホストのワールドで置き換える
    startGame(null, snap, snap.player && snap.player.gameMode || 'survival', { skipNet: true });
  };

  // ホーム画面のオンラインワールド一覧を描画
  function renderOnlineWorlds(worlds) {
    const sec = $('online-worlds-section');
    const list = $('online-worlds-list');
    if (!sec || !list) return;
    list.innerHTML = '';
    if (!worlds || !worlds.length) {
      sec.classList.add('hidden');
      return;
    }
    sec.classList.remove('hidden');
    for (const w of worlds.slice(0, 8)) {
      const btn = document.createElement('button');
      btn.className = 'online-world-item';
      btn.innerHTML =
        '<span class="ow-name">🌍 ' + (w.name || '無名のワールド') + '</span>' +
        '<span class="ow-players">👤 ' + (w.players || 1) + '</span>' +
        '<span class="ow-join">参加 →</span>';
      btn.addEventListener('click', () => joinOnlineWorld(w));
      list.appendChild(btn);
    }
  }

  async function joinOnlineWorld(w) {
    UI.toast('🌐 ' + (w.name || 'ワールド') + ' に接続中…');
    const r = await Net.joinWorld(w.roomId);
    if (!r.ok) { UI.toast('接続に失敗: ' + (r.error || '不明なエラー'), true); return; }
    // スナップショット受信 (NetClientReceiveSnapshot) で startGame が呼ばれる
    UI.toast('ワールドデータを受信中…');
  }

  global.onNetWorldListChanged = function (worlds) {
    renderOnlineWorlds(worlds);
  };

  // 設定画面の「ワールドを公開」トグル
  async function setWorldShared(shared) {
    const status = $('share-status');
    if (shared) {
      if (!Game.world) { UI.toast('ゲーム中のみ公開できます', true); return false; }
      if (status) status.textContent = '公開準備中…';
      const r = await Net.hostWorld('ワールド ' + Game.world.seed, () => {
        // 新規参加者用のスナップショット (セーブ形式と同じ)
        const curSnap = {
          edits: Game.world.serializeEdits(),
          furnaces: Game.world.serializeFurnaces(),
          chests: Game.world.serializeChests(),
          crops: Game.world.crops ? Game.world.crops.serialize() : {},
          doors: Game.world.serializeDoors ? Game.world.serializeDoors() : []
        };
        return {
          seed: Game.world.seed, time: Game.time, dimension: Game.dimension,
          edits: curSnap.edits, furnaces: curSnap.furnaces, chests: curSnap.chests,
          crops: curSnap.crops, doors: curSnap.doors,
          dims: { overworld: curSnap, nether: null, end: null },
          player: Game.player.serialize(), savedAt: Date.now()
        };
      });
      if (r.ok) {
        if (status) status.textContent = '🌐 公開中 (ルーム: ' + r.roomId + ')';
        UI.toast('ワールドを公開しました。ホーム画面から誰でも参加できます');
        return true;
      } else {
        if (status) status.textContent = '';
        UI.toast('公開に失敗: ' + (r.error || '不明なエラー'), true);
        return false;
      }
    } else {
      Net.leave();
      if (status) status.textContent = '';
      UI.toast('ワールドの公開を停止しました');
      return true;
    }
  }

  global.onItemPickup = function (id, count) {
    const def = Blocks.itemDef(id);
    Sound.pop();
    UI.toast(`${def ? def.label : id} +${count}`);
    UI.refreshHotbar();
    updateHandItem();
  };

  global.onPlayerHurt = function () {
    Sound.hurt();
    const el = $('hurt-overlay') || createHurtOverlay();
    el.style.transition = 'none';
    el.style.opacity = '0.45';
    requestAnimationFrame(() => {
      el.style.transition = 'opacity .5s';
      el.style.opacity = '0';
    });
  };

  function createHurtOverlay() {
    const el = document.createElement('div');
    el.id = 'hurt-overlay';
    el.style.cssText = 'position:absolute;inset:0;background:radial-gradient(circle,rgba(160,0,0,0) 30%,rgba(160,0,0,.9) 100%);pointer-events:none;opacity:0;z-index:15;';
    $('game-root').appendChild(el);
    return el;
  }

  global.onPlayerDeath = function (reason) {
    $('death-reason').textContent = reason ? `死因: ${reason}` : '';
    UI.closeScreens();
    $('death-screen').classList.remove('hidden');
    UI.openScreen = 'death';
    exitPointerLock();
  };

  /* v0.13.2: エンダードラゴン撃破 — ボスバーを消し、勝利の演出 */
  global.onDragonDefeated = function () {
    if (UI.setBossBar) UI.setBossBar(null);
    if (Sound.roar) Sound.roar();
    Sound.thunder && Sound.thunder(0.5);
    UI.toast('🐉 エンダードラゴンを倒した！ 帰還ポータルが開いた');
  };

  /* ==========================================================
     設定・メニュー
     ========================================================== */
  Game.settings = {
    renderDistance: 3,
    sensitivity: 1,
    touchControls: undefined,
    textureSize: 16,  // v0.11.2: テクスチャ解像度 (8 / 16 / 32)
    debugInfo: false  // v0.12.2: デバッグ情報 (F3 パネル) の表示
  };

  // v0.12.2: デバッグ情報表示の適用 (設定トグルと F3 を同期)
  function applyDebugInfo() {
    Game.debug = !!Game.settings.debugInfo;
    const el = $('debug-panel');
    if (el) el.classList.toggle('hidden', !Game.debug);
  }

  // v0.11.2: テクスチャ解像度の適用
  function applyTextureSize(ts) {
    if (![8, 16, 32].includes(ts)) ts = 16;
    Game.settings.textureSize = ts;
    if (global.Textures && Textures.getTS() !== ts) Textures.setResolution(ts);
    // ワールドが存在すればマテリアルのテクスチャを張り替え
    if (Game.world) {
      const tex = Textures.makeThreeTexture();
      const old = Game.world.solidMaterial.map;
      Game.world.solidMaterial.map = tex;
      Game.world.waterMaterial.map = tex;
      Game.world.solidMaterial.needsUpdate = true;
      Game.world.waterMaterial.needsUpdate = true;
      if (old) old.dispose();
      if (Game.entities) Game.entities.atlas = tex;
      handItemId = undefined;   // 手持ちアイテムを新テクスチャで作り直す
      updateHandItem();
    }
    // 手持ちスタックの DOM アイコンも --atlas が変わるので UI を再描画
    // (ゲーム開始前は UI.game が未設定なので refreshAll は呼ばない)
    if (global.UI && UI.game && UI.refreshAll) UI.refreshAll();
  }

  function loadSettings() {
    try {
      const s = JSON.parse(localStorage.getItem('craftworld3d_settings') || '{}');
      Object.assign(Game.settings, s);
    } catch (e) { /* noop */ }
    // モバイル端末なら常にタッチUIを表示
    if (Input.touchMode || Game.settings.touchControls === undefined) {
      Game.settings.touchControls = Input.touchMode;
    }
  }

  function saveSettings() {
    localStorage.setItem('craftworld3d_settings', JSON.stringify(Game.settings));
  }

  // v0.11.1: ゲームモード定義 (今後のモード追加はこの配列に1件足すだけ)
  const GAME_MODES = [
    { id: 'survival', name: 'サバイバル', icon: '⚔️', desc: '資源を集めて生き延びる。体力・満腹度あり。' },
    { id: 'creative', name: 'クリエイティブ', icon: '🧱', desc: '無限のブロックで自由に建築。飛行可能。' },
    { id: 'spectator', name: 'スペクテイター', icon: '👁️', desc: '世界を自由に観察。すり抜け・無敵。' }
  ];
  let selectedMode = 'survival';

  function buildModeCards() {
    const wrap = $('mode-cards');
    if (!wrap) return;
    wrap.innerHTML = '';
    for (const m of GAME_MODES) {
      const card = document.createElement('button');
      card.className = 'mode-card' + (selectedMode === m.id ? ' selected' : '');
      card.dataset.mode = m.id;
      card.setAttribute('role', 'option');
      card.innerHTML = '<span class="mode-icon">' + m.icon + '</span>' +
        '<span class="mode-name">' + m.name + '</span>' +
        '<span class="mode-desc">' + m.desc + '</span>';
      card.addEventListener('click', () => {
        selectedMode = m.id;
        wrap.querySelectorAll('.mode-card').forEach(c => c.classList.toggle('selected', c.dataset.mode === m.id));
      });
      wrap.appendChild(card);
    }
  }

  function setupMenu() {
    const hasSave = !!loadSave();
    $('btn-continue').style.display = hasSave ? '' : 'none';
    buildModeCards();

    $('btn-newgame').addEventListener('click', () => {
      const seed = $('seed-input').value.trim();
      localStorage.removeItem(SAVE_KEY);
      startGame(seed, null, selectedMode);
    });
    $('btn-continue').addEventListener('click', () => {
      const save = loadSave();
      startGame(null, save);
    });
    $('btn-resume').addEventListener('click', () => UI.closeScreens());
    $('btn-save').addEventListener('click', () => saveGame(false));
    $('btn-newworld').addEventListener('click', () => {
      if (!confirm('現在のワールドを削除して新しく始めますか?')) return;
      localStorage.removeItem(SAVE_KEY);
      location.reload();
    });
    $('btn-respawn').addEventListener('click', () => {
      $('death-screen').classList.add('hidden');
      UI.openScreen = null;
      // v0.13.2: エンド (またはネザー) で死んだ場合はオーバーワールドへ帰還してリスポーン
      if (Game.dimension !== 'overworld') {
        Game.dimension = 'overworld';   // switchDimension の from===to ガードを回避
        switchDimension('overworld', Game.player.pos);
        Game.player.respawn();   // 体力回復 (座標は転移先で上書きされる)
        UI.refreshAll();
        return;
      }
      Game.player.respawn();
      UI.refreshAll();
    });
    $('btn-open-menu').addEventListener('click', () => togglePause());

    const rd = $('set-renderdist');
    rd.value = Game.settings.renderDistance;
    $('rd-value').textContent = rd.value;
    rd.addEventListener('input', () => {
      Game.settings.renderDistance = +rd.value;
      $('rd-value').textContent = rd.value;
      if (Game.world) Game.world.renderDistance = +rd.value;
      saveSettings();
    });

    const sens = $('set-sensitivity');
    sens.value = Game.settings.sensitivity;
    $('sens-value').textContent = (+sens.value).toFixed(1);
    sens.addEventListener('input', () => {
      Game.settings.sensitivity = +sens.value;
      Input.sensitivity = +sens.value;
      $('sens-value').textContent = (+sens.value).toFixed(1);
      saveSettings();
    });

    // v0.11.2: テクスチャ解像度の設定
    const tsel = $('set-texsize');
    if (tsel) {
      tsel.value = String(Game.settings.textureSize || 16);
      tsel.addEventListener('change', () => {
        applyTextureSize(+tsel.value);
        saveSettings();
      });
    }

    const tc = $('set-touch');
    tc.checked = Game.settings.touchControls;
    if (Input.touchMode) {
      // モバイルではタッチUIは常時表示 (OFFにできない)
      tc.checked = true;
      tc.disabled = true;
      tc.closest('label').title = 'モバイル端末では常に表示されます';
      Game.settings.touchControls = true;
    }
    tc.addEventListener('change', () => {
      Game.settings.touchControls = tc.checked;
      $('touch-controls').classList.toggle('hidden', !tc.checked);
      Input.touchMode = tc.checked;
      saveSettings();
    });

    // v0.12.2: デバッグ情報表示の設定
    const db = $('set-debuginfo');
    if (db) {
      db.checked = !!Game.settings.debugInfo;
      db.addEventListener('change', () => {
        Game.settings.debugInfo = db.checked;
        applyDebugInfo();
        saveSettings();
      });
    }
    applyDebugInfo();   // 起動時に設定を反映

    // v0.13.3: ワールド公開 (オンライン) 設定
    const share = $('set-share');
    if (share) {
      share.checked = false;
      share.addEventListener('change', async () => {
        const ok = await setWorldShared(share.checked);
        if (!ok) share.checked = false;
      });
    }

    // v0.13.3: オンラインワールド一覧の初期化 (ホーム画面)
    if (global.Net && Net.init) {
      Net.init().then((ok) => {
        if (!ok) console.warn('[Net] OmniP2P 初期化に失敗しました (オフラインのまま)');
      });
    }
  }

  /* ==========================================================
     起動
     ========================================================== */
  function boot() {
    // Discord Activity として埋め込まれた場合は SDK の準備を待ってから起動。
    // 通常ブラウザでは即 resolve され既存動作は変わらない。
    const sdkReady = (global.DiscordSDK && DiscordSDK.init) ? DiscordSDK.init() : Promise.resolve(false);
    sdkReady.then(() => {
      if (global.DiscordSDK && DiscordSDK.isActivity) {
        // Activity 内ではポインタロックが使えない環境があるため事前にドラッグ視点を許可
        // (実際にロックが失敗した時点でもフォールバックする二重の安全網)
        Input.dragLookMode = false;
        DiscordSDK.setActivity('ワールドを探索中', 'クラフトワールド 3D をプレイ中');
      }
      startApp();
    });
  }

  function startApp() {
    Input.init($('game-canvas'));
    loadSettings();
    // v0.11.2: 起動時に保存済みの解像度を適用 (World 生成より前)
    applyTextureSize(Game.settings.textureSize || 16);
    Input.sensitivity = Game.settings.sensitivity;
    initThree();
    setupMenu();
    // バージョン表示を同期 (index.html 内の静的表示と一致させる)
    const v = (global.GameVersion && GameVersion.VERSION.string) || 'v0.1';
    const vd = $('version-display'); if (vd) vd.textContent = v;
    document.querySelectorAll('.start-version, .pause-version').forEach(el => { el.textContent = el.classList.contains('pause-version') ? 'バージョン ' + v : v; });

    Input.onToggleInventory = () => { if (Game.running) toggleInventory(); };
    Input.onPause = () => { if (Game.running) togglePause(); };
    Input.onDrop = () => { if (Game.running && !UI.openScreen) dropHeld(); };
    Input.onDebug = () => {
      // v0.12.2: F3 も設定と同期 (トグルで設定を反転し永続化)
      Game.settings.debugInfo = !Game.settings.debugInfo;
      applyDebugInfo();
      saveSettings();
      const cb = $('set-debuginfo');
      if (cb) cb.checked = Game.settings.debugInfo;
    };
    Input.onSelect = (index, delta) => {
      if (!Game.running || UI.openScreen) return;
      const inv = Game.player.inventory;
      if (index !== null && index !== undefined) inv.selected = index;
      else inv.selected = (inv.selected + delta + 9) % 9;
      UI.refreshHotbar();
      UI.showItemName();
      updateHandItem();
    };

    window.addEventListener('beforeunload', () => { if (Game.running) saveGame(true); });
    document.addEventListener('visibilitychange', () => { if (document.hidden && Game.running) saveGame(true); });
  }

  boot();
})(window);
