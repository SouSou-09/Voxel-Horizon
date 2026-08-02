/* ==========================================================
   collision.js — AABBのボクセル・スウィープ衝突
   per-axis反復方式の「壁ワープ」バグを根本的に修正する。
   最も速く衝突するブロックで一度だけ位置をクランプする。
   ========================================================== */
(function (global) {
  'use strict';
  const B = Blocks;
  const EPS = 1e-3;

  function solidBoxAt(world, x, y, z, id) {
    if (!B.isSolid(id)) return null;
    const def = B.get(id);
    if (def.box) {
      return {
        x0: x + def.box.x0, x1: x + def.box.x1,
        y0: y + def.box.y0, y1: y + def.box.y1,
        z0: z + def.box.z0, z1: z + def.box.z1, id
      };
    }
    return { x0: x, x1: x + 1, y0: y, y1: y + 1, z0: z, z1: z + 1, id };
  }

  /**
   * AABB を move だけ移動させ、各軸で衝突解決する。
   * pos: {x,y,z} (min corner), hw: 半幅, h: 高さ
   * 戻り値 { onGround, hitX, hitZ, hitY, hitBlock }
   */
  function sweepMove(world, pos, hw, h, move) {
    const res = { onGround: false, hitX: false, hitZ: false, hitY: false, hitBlock: 0 };

    // 初期位置が既にブロックに埋め込まれている場合は、最も浅い方向へ一度だけ押し出す
    // (ドロップアイテムがブロック破壊直後に埋まってスポーンするケースで
    //  1フレームごとに1ブロックずつワープするのを防ぐ)
    const minX = Math.floor(pos.x - hw), maxX = Math.floor(pos.x + hw);
    const minY = Math.floor(pos.y), maxY = Math.floor(pos.y + h - 1e-4);
    const minZ = Math.floor(pos.z - hw), maxZ = Math.floor(pos.z + hw);
    let embedded = null;
    for (let y = minY; y <= maxY; y++) {
      for (let z = minZ; z <= maxZ; z++) {
        for (let x = minX; x <= maxX; x++) {
          const id = world.getBlock(x, y, z);
          if (!B.isSolid(id)) continue;
          const box = solidBoxAt(world, x, y, z, id);
          if (box.x1 > pos.x - hw && box.x0 < pos.x + hw &&
              box.y1 > pos.y && box.y0 < pos.y + h &&
              box.z1 > pos.z - hw && box.z0 < pos.z + hw) {
            embedded = { box, id };
            break;
          }
        }
        if (embedded) break;
      }
      if (embedded) break;
    }
    if (embedded) {
      // 各軸の押し出し量を計算し、最も小さいものを適用
      const push = [];
      const dx0 = embedded.box.x1 - (pos.x - hw);   // +x方向に出る量
      const dx1 = (pos.x + hw) - embedded.box.x0;   // -x方向に出る量
      const dy0 = embedded.box.y1 - pos.y;          // +y方向に出る量
      const dy1 = (pos.y + h) - embedded.box.y0;    // -y方向に出る量
      const dz0 = embedded.box.z1 - (pos.z - hw);   // +z方向に出る量
      const dz1 = (pos.z + hw) - embedded.box.z0;   // -z方向に出る量
      push.push({ axis: 0, dir: 1, amt: dx0 });
      push.push({ axis: 0, dir: -1, amt: dx1 });
      push.push({ axis: 1, dir: 1, amt: dy0 });
      push.push({ axis: 1, dir: -1, amt: dy1 });
      push.push({ axis: 2, dir: 1, amt: dz0 });
      push.push({ axis: 2, dir: -1, amt: dz1 });
      push.sort((a, b) => a.amt - b.amt);
      const best = push[0];
      if (best.axis === 0) pos.x += best.dir * (best.amt + EPS);
      else if (best.axis === 1) pos.y += best.dir * (best.amt + EPS);
      else pos.z += best.dir * (best.amt + EPS);
      res.hitBlock = embedded.id;
      if (best.axis === 1 && best.dir === 1) res.onGround = true;
    }

    for (let axis = 0; axis < 3; axis++) {
      const d = axis === 0 ? move.x : (axis === 1 ? move.y : move.z);
      if (d === 0) continue;
      if (axis === 0) pos.x += d; else if (axis === 1) pos.y += d; else pos.z += d;

      // その軸で最も速く衝突するブロックを探す
      const minX = Math.floor(pos.x - hw), maxX = Math.floor(pos.x + hw);
      const minY = Math.floor(pos.y), maxY = Math.floor(pos.y + h - 1e-4);
      const minZ = Math.floor(pos.z - hw), maxZ = Math.floor(pos.z + hw);
      let best = null;

      for (let y = minY; y <= maxY; y++) {
        for (let z = minZ; z <= maxZ; z++) {
          for (let x = minX; x <= maxX; x++) {
            const id = world.getBlock(x, y, z);
            if (!B.isSolid(id)) continue;
            const box = solidBoxAt(world, x, y, z, id);
            // この軸でオーバーラップしているか
            const overlap =
              (axis === 0 && box.x1 > pos.x - hw && box.x0 < pos.x + hw &&
                box.y1 > pos.y && box.y0 < pos.y + h &&
                box.z1 > pos.z - hw && box.z0 < pos.z + hw) ||
              (axis === 1 && box.y1 > pos.y && box.y0 < pos.y + h &&
                box.x1 > pos.x - hw && box.x0 < pos.x + hw &&
                box.z1 > pos.z - hw && box.z0 < pos.z + hw) ||
              (axis === 2 && box.z1 > pos.z - hw && box.z0 < pos.z + hw &&
                box.x1 > pos.x - hw && box.x0 < pos.x + hw &&
                box.y1 > pos.y && box.y0 < pos.y + h);
            if (!overlap) continue;

            let fix;
            if (axis === 0) fix = d > 0 ? (box.x0 - hw - EPS - pos.x) : (box.x1 + hw + EPS - pos.x);
            else if (axis === 1) fix = d > 0 ? (box.y0 - h - EPS - pos.y) : (box.y1 + EPS - pos.y);
            else fix = d > 0 ? (box.z0 - hw - EPS - pos.z) : (box.z1 + hw + EPS - pos.z);

            // 実際に移動量を縮める必要があるものだけ
            if ((d > 0 && fix <= 0) || (d < 0 && fix >= 0)) {
              if (!best || Math.abs(fix) < Math.abs(best.fix)) best = { fix, id };
            }
          }
        }
      }

      if (best) {
        if (axis === 0) { pos.x += best.fix; res.hitX = true; }
        else if (axis === 1) {
          pos.y += best.fix;
          res.hitY = true;
          if (d < 0) res.onGround = true;
        }
        else { pos.z += best.fix; res.hitZ = true; }
        res.hitBlock = best.id;
      }
    }
    return res;
  }

  /** 指定位置に AABB が自由に置けるか（押し出されずに存在できるか） */
  function isFree(world, x, y, z, hw, h) {
    const minX = Math.floor(x - hw), maxX = Math.floor(x + hw);
    const minY = Math.floor(y), maxY = Math.floor(y + h - 1e-4);
    const minZ = Math.floor(z - hw), maxZ = Math.floor(z + hw);
    for (let yy = minY; yy <= maxY; yy++)
      for (let zz = minZ; zz <= maxZ; zz++)
        for (let xx = minX; xx <= maxX; xx++) {
          if (B.isSolid(world.getBlock(xx, yy, zz))) return false;
        }
    return true;
  }

  global.SweepCollision = { sweepMove, isFree };
})(window);
