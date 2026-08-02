/* ==========================================================
   player.js — プレイヤーの物理 / サバイバルステータス
   ========================================================== */
(function (global) {
  'use strict';
  const B = Blocks;
  const ID = Blocks.BLOCK_ID;

  const HW = 0.3;         // 半横幅
  const PH = 1.8;         // 身長
  const EYE = 1.62;
  const GRAVITY = 28;
  const JUMP_V = 8.4;
  const WALK = 4.3;
  const SPRINT = 5.9;
  const SNEAK = 1.4;
  const SWIM = 3.0;
  const EPS = 1e-3;

  class Player {
    constructor(world) {
      this.world = world;
      this.pos = new THREE.Vector3(0.5, 50, 0.5);
      this.vel = new THREE.Vector3();
      this.yaw = 0;
      this.pitch = 0;
      this.onGround = false;
      this.inWater = false;
      this.headInWater = false;
      this.onFire = 0;   // v0.4 燃焼残り秒数 (溶岩・火)
      this.sneaking = false;
      this.sprinting = false;
      this.autoJump = true;

      this.health = 20;
      this.maxHealth = 20;
      this.hunger = 20;
      this.saturation = 5;
      this.exhaustion = 0;
      this.air = 20;
      this.dead = false;
      this.gameMode = 'survival';   // v0.8: 'survival' | 'creative' | 'spectator'
      this.flying = false;

      this.fallStart = null;
      this.regenTimer = 0;
      this.starveTimer = 0;
      this.airTimer = 0;
      this.hurtCooldown = 0;
      this.attackCooldown = 0;
      this.bobPhase = 0;

      this.inventory = new InventorySystem.Inventory(36);
      this.spawn = this.pos.clone();
    }

    eye(out) {
      const v = out || new THREE.Vector3();
      return v.set(this.pos.x, this.pos.y + (this.sneaking ? EYE - 0.15 : EYE), this.pos.z);
    }

    lookDir(out) {
      const v = out || new THREE.Vector3();
      const cp = Math.cos(this.pitch);
      return v.set(-Math.sin(this.yaw) * cp, Math.sin(this.pitch), -Math.cos(this.yaw) * cp).normalize();
    }

    heldItem() { return this.inventory.held(); }

    solidAt(x, y, z) {
      const id = this.world.getBlock(Math.floor(x), Math.floor(y), Math.floor(z));
      return B.isSolid(id);
    }

    blockAtFeet() {
      return this.world.getBlock(Math.floor(this.pos.x), Math.floor(this.pos.y + 0.1), Math.floor(this.pos.z));
    }

    /* ---------- 物理 ---------- */
    update(dt, input) {
      if (this.dead) return;
      const w = this.world;
      if (!w.isLoaded(Math.floor(this.pos.x), Math.floor(this.pos.z))) return; // 未生成なら停止

      // 水判定
      const feet = w.getBlock(Math.floor(this.pos.x), Math.floor(this.pos.y + 0.2), Math.floor(this.pos.z));
      const head = w.getBlock(Math.floor(this.pos.x), Math.floor(this.pos.y + EYE), Math.floor(this.pos.z));
      this.inWater = feet === ID.water;
      this.headInWater = head === ID.water;

      // 梯子判定 (v0.2): 足元・腰・頭のどれかが梯子なら登れる
      const bx = Math.floor(this.pos.x), bz = Math.floor(this.pos.z);
      this.onLadder = ID.ladder && (
        w.getBlock(bx, Math.floor(this.pos.y), bz) === ID.ladder ||
        feet === ID.ladder ||
        w.getBlock(bx, Math.floor(this.pos.y + 1), bz) === ID.ladder ||
        head === ID.ladder);

      // v0.3: マグマブロックの上に立つとダメージ
      this.onMagma = ID.magma && (
        w.getBlock(bx, Math.floor(this.pos.y - 0.15), bz) === ID.magma ||
        w.getBlock(bx, Math.floor(this.pos.y), bz) === ID.magma);
      if (this.onMagma) this.damage(1, 'マグマブロック');

      // v0.4: 溶岩ダメージ & 水での消火
      const inLava = ID.lava && (feet === ID.lava || head === ID.lava);
      if (inLava) {
        this.onFire = 2.0;   // 燃える (秒)
        this.damage(4, '溶岩');
      }
      if (this.onFire > 0) {
        this.onFire -= dt;
        if (this.inWater) this.onFire = 0;   // 水で消火
        if (this.onFire > 0 && Math.floor(this.onFire * 2) !== Math.floor((this.onFire + dt) * 2)) {
          this.damage(1, '火');
        }
      }

      const isCreative = this.gameMode === 'creative';
      const isSpectator = this.gameMode === 'spectator';
      // v0.8: クリエイティブのダブルジャンプで飛行トグル (空中でジャンプキーを離して再押し)
      if (isCreative && !input.jump) this._djumpArmed = true;
      if (isCreative && input.jump && this._djumpArmed && !this.onGround && !this.flying &&
          this.vel.y < 1 && this._djumpUsed !== true) {
        this.flying = true;
        this._djumpUsed = true;
      }
      if (this.onGround) { this._djumpUsed = false; this._djumpArmed = false; }
      // v0.8: スペクテイター / クリエイティブ飛行
      this.flying = isSpectator || (isCreative && this.flying);

      this.sneaking = !!input.sneak && (this.onGround || this.flying);
      const wantSprint = !!input.sprint && !this.sneaking && (isCreative || isSpectator || this.hunger > 6);

      // 進行方向 (moveF: 前進+1 / moveR: 右+1)
      const mf = input.moveF || 0, mr = input.moveR || 0;
      const len = Math.hypot(mf, mr);
      let ax = 0, az = 0;
      if (len > 0.01) {
        const scale = 1 / Math.max(1, len);
        const f = mf * scale, r = mr * scale;
        const sinY = Math.sin(this.yaw), cosY = Math.cos(this.yaw);
        ax = -sinY * f + cosY * r;
        az = -cosY * f - sinY * r;
        this.sprinting = wantSprint && len > 0.7;
      } else {
        this.sprinting = false;
      }

      let speed = this.sneaking ? SNEAK : (this.sprinting ? SPRINT : WALK);
      if (this.inWater) speed = SWIM;
      if (this.flying) speed = this.sprinting ? 16 : 10.5;
      const target = { x: ax * speed, z: az * speed };
      const accel = this.flying ? 9 : (this.onGround ? 14 : (this.inWater ? 6 : 4));
      this.vel.x += (target.x - this.vel.x) * Math.min(1, accel * dt);
      this.vel.z += (target.z - this.vel.z) * Math.min(1, accel * dt);

      // ジャンプ / 泳ぎ / 梯子 / 飛行
      if (this.flying) {
        // v0.8: 飛行 — Spaceで上昇、Shiftで下降。重力なし・衝突はスペクテイターのみ無効
        const FLY_V = 9;
        this.vel.y += ((input.jump ? FLY_V : 0) - (input.sneak ? FLY_V : 0) - this.vel.y) * Math.min(1, 9 * dt);
        this.fallStart = null;
        if (isSpectator) {
          // すり抜け: スウィープ衝突を行わず直接位置を更新
          this.pos.x += this.vel.x * dt;
          this.pos.y += this.vel.y * dt;
          this.pos.z += this.vel.z * dt;
          if (this.pos.y < 1) this.pos.y = 1;
          if (this.pos.y > World.WH + 30) this.pos.y = World.WH + 30;
          this.onGround = false;
          this.bobPhase += Math.hypot(this.vel.x, this.vel.z) * dt * 2;
          return;   // 以降のスウィープ物理・ステータス処理をスキップ
        }
      } else if (this.inWater) {
        this.vel.y += (input.jump ? 14 : 0) * dt;
        this.vel.y -= GRAVITY * 0.28 * dt;
        this.vel.y = Math.max(-4, Math.min(4.5, this.vel.y));
        this.fallStart = null;
      } else if (this.onLadder) {
        // 梯子: 上昇/下降を自由に。水平速度は抑制して剥がれ落ちを防ぐ
        this.vel.x *= 0.6; this.vel.z *= 0.6;
        const CLIMB = 2.4;
        if (input.jump) this.vel.y = CLIMB;
        else if (input.sneak) this.vel.y = 0;             // その場でホールド
        else if (this.vel.y < -2.2) this.vel.y = -2.2;    // 降下速度を制限
        else this.vel.y -= GRAVITY * 0.15 * dt;           // 緩やかに下がる
        this.fallStart = null;
        if (this.onGround && !input.jump) this.onLadder = false;
      } else {
        if (input.jump && this.onGround) {
          this.vel.y = JUMP_V;
          this.onGround = false;
          this.addExhaustion(this.sprinting ? 0.2 : 0.05);
        }
        this.vel.y -= GRAVITY * dt;
        if (this.vel.y < -60) this.vel.y = -60;
      }

      // 移動 (ボクセルスウィープで衝突解決)
      const prevY = this.pos.y;
      const wasGround = this.onGround;
      // v0.12.3: フレーム毎の THREE.Vector3 生成を避けプレーンオブジェクトを再利用 (GC 削減)
      const move = this._moveTmp || (this._moveTmp = { x: 0, y: 0, z: 0 });
      move.x = this.vel.x * dt; move.y = this.vel.y * dt; move.z = this.vel.z * dt;
      // 接地中に歩いて崖から降りるとき用に、下向きへ少しだけ張り付き判定を追加
      if (wasGround && move.y <= 0 && !this.inWater) move.y = Math.min(move.y, -0.05);
      const steps = Math.max(1, Math.ceil(Math.max(Math.abs(move.x), Math.abs(move.y), Math.abs(move.z)) / 0.15));
      let hitX = false, hitZ = false;
      const sc = { x: this.pos.x, y: this.pos.y, z: this.pos.z };
      for (let s = 0; s < steps; s++) {
        const r = SweepCollision.sweepMove(w, sc, HW, PH,
          { x: move.x / steps, y: move.y / steps, z: move.z / steps });
        if (r.hitX) { this.vel.x = 0; hitX = true; }
        if (r.hitZ) { this.vel.z = 0; hitZ = true; }
        if (r.hitY) {
          if (move.y > 0) this.vel.y = 0;
          else { this.vel.y = 0; this.onGround = true; }
          if (r.hitBlock === ID.cactus) this.damage(0.5, 'サボテン', true);
        }
      }
      this.pos.set(sc.x, sc.y, sc.z);
      // 接地判定 (速度が下向きで足元にブロック)
      if (!this.onGround || this.vel.y < 0) {
        this.onGround = this.vel.y <= 0 && this.hasSupport();
      }

      // 落下距離と着地ダメージ
      if (!this.onGround && this.vel.y < 0 && this.fallStart === null) this.fallStart = prevY;
      if (this.onGround) {
        if (this.fallStart !== null) {
          const dist = this.fallStart - this.pos.y;
          if (dist > 3.2 && !this.inWater) this.damage(Math.floor(dist - 3), '落下');
          this.fallStart = null;
        }
      } else if (this.vel.y > 0) this.fallStart = null;
      // v0.8: 飛行中に着地したら飛行解除
      if (this.flying && this.onGround) this.flying = false;

      // オートジャンプ (段差1ブロックのみ。2ブロック以上には絶対に乗らない)
      // v0.12.1: 瞬間ワープではなく、段差の高さまで滑らかに持ち上げる。
      // 旧実装は sweepMove で即座に 1.06 上へワープしていたため、段差を
      // 上がるたびに視点が「ガクッ」と跳ねて見えた。段差の上面へ短時間で
      // 補間して上がることで、なめらかなステップ上昇になる。
      if (this.autoJump && this.onGround && (hitX || hitZ) && len > 0.1 && !this.inWater) {
        const fx = this.pos.x + ax * 0.5, fz = this.pos.z + az * 0.5;
        const bx = Math.floor(fx), bz = Math.floor(fz);
        const by = Math.floor(this.pos.y);
        const bl = w.getBlock(bx, by, bz);
        const up1 = w.getBlock(bx, by + 1, bz);
        const up2 = w.getBlock(bx, by + 2, bz);
        // 正面1段目のみが固体 → 上へ滑らかに持ち上げる (跳ねない)
        if (B.isSolid(bl) && !B.isSolid(up1) && !B.isSolid(up2)) {
          const sc2 = { x: this.pos.x, y: this.pos.y, z: this.pos.z };
          SweepCollision.sweepMove(w, sc2, HW, PH, { x: 0, y: 1.06, z: 0 });
          if (sc2.y > this.pos.y + 0.9) {
            // 実際に昇れる高さ (段差の上面) へ滑らかに補間
            const targetY = sc2.y;
            const ny = this.pos.y + (targetY - this.pos.y) * Math.min(1, 16 * dt) + 5.5 * dt;
            this.pos.y = Math.min(ny, targetY);
            this.vel.y = 0;
          }
        }
      }

      // スニーク時の落下防止
      if (this.sneaking && this.onGround) this.preventFall();

      // 歩行による空腹
      const moved = Math.hypot(this.vel.x, this.vel.z) * dt;
      if (this.onGround && moved > 0) this.addExhaustion(moved * (this.sprinting ? 0.1 : 0.01));

      this.updateStats(dt);
      this.bobPhase += moved * 3;
    }

    /** 足元の支えがあるか */
    hasSupport() {
      const p = this.pos;
      const belowY = Math.floor(p.y - 0.06);
      for (let x = Math.floor(p.x - HW); x <= Math.floor(p.x + HW); x++) {
        for (let z = Math.floor(p.z - HW); z <= Math.floor(p.z + HW); z++) {
          if (B.isSolid(this.world.getBlock(x, belowY, z))) return true;
        }
      }
      return false;
    }

    /** スニーク中は足場から落ちない */
    preventFall() {
      const p = this.pos;
      const below = Math.floor(p.y - 0.1);
      const supported = (x, z) => {
        for (let bx = Math.floor(x - HW); bx <= Math.floor(x + HW); bx++)
          for (let bz = Math.floor(z - HW); bz <= Math.floor(z + HW); bz++)
            if (B.isSolid(this.world.getBlock(bx, below, bz))) return true;
        return false;
      };
      if (supported(p.x, p.z)) { this._safe = { x: p.x, z: p.z }; return; }
      if (this._safe) {
        if (supported(this._safe.x, p.z)) { p.x = this._safe.x; this.vel.x = 0; }
        else if (supported(p.x, this._safe.z)) { p.z = this._safe.z; this.vel.z = 0; }
        else { p.x = this._safe.x; p.z = this._safe.z; this.vel.x = this.vel.z = 0; }
      }
    }

    /* ---------- ステータス ---------- */
    addExhaustion(v) {
      this.exhaustion += v;
      while (this.exhaustion >= 4) {
        this.exhaustion -= 4;
        if (this.saturation > 0) this.saturation = Math.max(0, this.saturation - 1);
        else this.hunger = Math.max(0, this.hunger - 1);
      }
    }

    updateStats(dt) {
      if (this.hurtCooldown > 0) this.hurtCooldown -= dt;
      if (this.attackCooldown > 0) this.attackCooldown -= dt;
      if (this.gameMode === 'creative' || this.gameMode === 'spectator') {
        // v0.8: 空腹・酸素の消耗なし
        this.hunger = 20; this.saturation = 5; this.air = 20;
        this.regenTimer = 0; this.starveTimer = 0; this.airTimer = 0;
        return;
      }

      // 自然回復
      if (this.hunger >= 18 && this.health < this.maxHealth) {
        this.regenTimer += dt;
        if (this.regenTimer >= 4) {
          this.regenTimer = 0;
          this.health = Math.min(this.maxHealth, this.health + 1);
          this.addExhaustion(1.5);
        }
      } else this.regenTimer = 0;

      // 餓死
      if (this.hunger <= 0) {
        this.starveTimer += dt;
        if (this.starveTimer >= 4) { this.starveTimer = 0; this.damage(1, '空腹'); }
      } else this.starveTimer = 0;

      // 酸素
      if (this.headInWater) {
        this.airTimer += dt;
        if (this.airTimer >= 1) {
          this.airTimer = 0;
          this.air--;
          if (this.air < 0) { this.air = 0; this.damage(2, '溺水'); }
        }
      } else {
        this.airTimer = 0;
        if (this.air < 20) this.air = Math.min(20, this.air + dt * 8);
      }
    }

    damage(amount, reason, ignoreCooldown) {
      if (this.dead) return;
      if (this.gameMode === 'creative' || this.gameMode === 'spectator') return;   // v0.8: 無敵
      if (!ignoreCooldown && this.hurtCooldown > 0) return;
      this.health -= amount;
      if (!ignoreCooldown) this.hurtCooldown = 0.5;
      if (typeof global.onPlayerHurt === 'function') global.onPlayerHurt(amount, reason);
      if (this.health <= 0) {
        this.health = 0;
        this.dead = true;
        if (typeof global.onPlayerDeath === 'function') global.onPlayerDeath(reason);
      }
    }

    eat(slotIndex) {
      const s = this.inventory.get(slotIndex);
      if (!s) return false;
      const def = Blocks.itemDef(s.id);
      if (!def || def.type !== 'food') return false;
      if (this.hunger >= 20 && def.food.heal === 0) return false;
      this.hunger = Math.min(20, this.hunger + def.food.hunger);
      this.saturation = Math.min(this.hunger, this.saturation + def.food.hunger * 0.6);
      if (def.food.heal) this.health = Math.min(this.maxHealth, this.health + def.food.heal);
      this.inventory.decrement(slotIndex, 1);
      return true;
    }

    respawn() {
      this.dead = false;
      this.health = this.maxHealth;
      this.hunger = 20;
      this.saturation = 5;
      this.air = 20;
      this.vel.set(0, 0, 0);
      this.pos.copy(this.spawn);
      this.fallStart = null;
    }

    serialize() {
      return {
        pos: [this.pos.x, this.pos.y, this.pos.z],
        spawn: [this.spawn.x, this.spawn.y, this.spawn.z],
        yaw: this.yaw, pitch: this.pitch,
        health: this.health, hunger: this.hunger, saturation: this.saturation, air: this.air,
        inv: this.inventory.serialize(), selected: this.inventory.selected,
        gameMode: this.gameMode, flying: this.flying
      };
    }

    load(d) {
      if (!d) return;
      if (d.pos) this.pos.set(d.pos[0], d.pos[1], d.pos[2]);
      if (d.spawn) this.spawn.set(d.spawn[0], d.spawn[1], d.spawn[2]);
      this.yaw = d.yaw || 0; this.pitch = d.pitch || 0;
      this.health = d.health !== undefined ? d.health : 20;
      this.hunger = d.hunger !== undefined ? d.hunger : 20;
      this.saturation = d.saturation || 0;
      this.air = d.air !== undefined ? d.air : 20;
      this.inventory.load(d.inv);
      this.inventory.selected = d.selected || 0;
      if (d.gameMode) this.gameMode = d.gameMode;
      this.flying = !!d.flying;
    }
  }

  Player.HW = HW; Player.PH = PH; Player.EYE = EYE;
  global.Player = Player;
})(window);
