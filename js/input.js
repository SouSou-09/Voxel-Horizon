/* ==========================================================
   input.js — キーボード / マウス / タッチ操作
   ========================================================== */
(function (global) {
  'use strict';

  const Input = {
    moveF: 0, moveR: 0,
    jump: false, sneak: false, sprint: false,
    attack: false,          // 押しっぱなしで採掘
    useHeld: false,
    usePressed: false,      // 単発 (消費したら false に)
    lookDX: 0, lookDY: 0,
    sensitivity: 1,
    touchMode: false,
    pointerLocked: false,

    // コールバック (main.js が設定)
    onToggleInventory: null,
    onPause: null,
    onDrop: null,
    onSelect: null,
    onDebug: null,

    consumeLook() {
      const d = { x: this.lookDX, y: this.lookDY };
      this.lookDX = 0; this.lookDY = 0;
      return d;
    },
    consumeUse() {
      if (this.usePressed) { this.usePressed = false; return true; }
      return false;
    },
    reset() {
      this.moveF = this.moveR = 0;
      this.jump = this.sneak = this.sprint = false;
      this.attack = false; this.useHeld = false; this.usePressed = false;
      this.lookDX = this.lookDY = 0;
    }
  };

  const keys = {};

  function isTouchDevice() {
    return ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
  }

  function updateKeyMove() {
    Input.moveF = (keys['KeyW'] || keys['ArrowUp'] ? 1 : 0) - (keys['KeyS'] || keys['ArrowDown'] ? 1 : 0);
    Input.moveR = (keys['KeyD'] || keys['ArrowRight'] ? 1 : 0) - (keys['KeyA'] || keys['ArrowLeft'] ? 1 : 0);
    Input.jump = !!keys['Space'];
    Input.sneak = !!(keys['ShiftLeft'] || keys['ShiftRight']);
    Input.sprint = !!(keys['ControlLeft'] || keys['KeyR']);
  }

  Input.init = function (canvas) {
    Input.touchMode = isTouchDevice();

    /* ---------- キーボード ---------- */
    window.addEventListener('keydown', (e) => {
      if (e.repeat) {
        return;
      }
      keys[e.code] = true;
      if (e.code === 'KeyE') { e.preventDefault(); Input.onToggleInventory && Input.onToggleInventory(); }
      else if (e.code === 'Escape') { Input.onPause && Input.onPause(); }
      else if (e.code === 'KeyQ') { Input.onDrop && Input.onDrop(); }
      else if (e.code === 'F3') { e.preventDefault(); Input.onDebug && Input.onDebug(); }
      else if (e.code.startsWith('Digit')) {
        const n = parseInt(e.code.slice(5), 10);
        if (n >= 1 && n <= 9) Input.onSelect && Input.onSelect(n - 1);
      }
      updateKeyMove();
    });

    window.addEventListener('keyup', (e) => {
      keys[e.code] = false;
      updateKeyMove();
    });

    window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; updateKeyMove(); Input.attack = false; });

    /* ---------- マウス ---------- */
    canvas.addEventListener('contextmenu', e => e.preventDefault());

    canvas.addEventListener('pointerdown', (e) => {
      if (Input.touchMode) return;
      if (!Input.pointerLocked) { canvas.requestPointerLock && canvas.requestPointerLock(); return; }
      if (e.button === 0) Input.attack = true;
      if (e.button === 2) { Input.usePressed = true; Input.useHeld = true; }
    });
    window.addEventListener('pointerup', (e) => {
      if (Input.touchMode) return;
      if (e.button === 0) Input.attack = false;
      if (e.button === 2) Input.useHeld = false;
    });

    document.addEventListener('pointerlockchange', () => {
      Input.pointerLocked = document.pointerLockElement === canvas;
      if (!Input.pointerLocked) { Input.attack = false; Input.useHeld = false; }
    });

    document.addEventListener('mousemove', (e) => {
      if (!Input.pointerLocked) return;
      Input.lookDX += e.movementX * 0.0022 * Input.sensitivity;
      Input.lookDY += e.movementY * 0.0022 * Input.sensitivity;
    });

    window.addEventListener('wheel', (e) => {
      if (document.querySelector('.overlay-screen:not(.hidden)')) return;
      const dir = e.deltaY > 0 ? 1 : -1;
      Input.onSelect && Input.onSelect(null, dir);
    }, { passive: true });

    /* ---------- タッチ ---------- */
    setupTouch();
  };

  function setupTouch() {
    const zone = document.getElementById('joystick-zone');
    const base = document.getElementById('joystick-base');
    const knob = document.getElementById('joystick-knob');
    const look = document.getElementById('look-zone');
    let joyId = null, joyCenter = { x: 0, y: 0 };
    const RADIUS = 52;

    zone.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      joyId = e.pointerId;
      const r = base.getBoundingClientRect();
      // タップした位置にスティックを移動
      const zr = zone.getBoundingClientRect();
      const lx = e.clientX - zr.left, ly = e.clientY - zr.top;
      base.style.left = (lx - r.width / 2) + 'px';
      base.style.bottom = (zr.height - ly - r.height / 2) + 'px';
      joyCenter = { x: e.clientX, y: e.clientY };
      zone.setPointerCapture(e.pointerId);
    });

    zone.addEventListener('pointermove', (e) => {
      if (e.pointerId !== joyId) return;
      e.preventDefault();
      let dx = e.clientX - joyCenter.x, dy = e.clientY - joyCenter.y;
      const len = Math.hypot(dx, dy);
      const clamped = Math.min(len, RADIUS);
      const nx = len > 0 ? (dx / len) * clamped : 0;
      const ny = len > 0 ? (dy / len) * clamped : 0;
      knob.style.transform = `translate(${nx}px, ${ny}px)`;
      Input.moveR = nx / RADIUS;
      Input.moveF = -ny / RADIUS;
      if (Math.hypot(Input.moveF, Input.moveR) > 0.92) Input.sprint = true;
    });

    const endJoy = (e) => {
      if (e.pointerId !== joyId) return;
      joyId = null;
      knob.style.transform = '';
      Input.moveF = Input.moveR = 0;
      Input.sprint = false;
    };
    zone.addEventListener('pointerup', endJoy);
    zone.addEventListener('pointercancel', endJoy);

    // 視点ドラッグ (v0.12.2: 長押し = 採掘 / 短いタップ = 設置)
    let lookId = null, lastX = 0, lastY = 0, moved = 0, downTime = 0, pressTimer = null;
    look.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      lookId = e.pointerId; lastX = e.clientX; lastY = e.clientY; moved = 0; downTime = performance.now();
      look.setPointerCapture(e.pointerId);
      // 長押し (420ms) で採掘開始。指を動かさず押し続けたときだけ発動。
      clearTimeout(pressTimer);
      pressTimer = setTimeout(() => {
        if (lookId !== null && moved < 14) Input.attack = true;
      }, 420);
    });
    look.addEventListener('pointermove', (e) => {
      if (e.pointerId !== lookId) return;
      const dx = e.clientX - lastX, dy = e.clientY - lastY;
      lastX = e.clientX; lastY = e.clientY;
      moved += Math.abs(dx) + Math.abs(dy);
      Input.lookDX += dx * 0.005 * Input.sensitivity;
      Input.lookDY += dy * 0.005 * Input.sensitivity;
      // 視点を大きく動かしたら長押し採掘は発動させない
      if (moved >= 14) { clearTimeout(pressTimer); Input.attack = false; }
    });
    const endLook = (e) => {
      if (e.pointerId !== lookId) return;
      lookId = null;
      clearTimeout(pressTimer);
      const wasMining = Input.attack;
      Input.attack = false;
      // 短いタップ = ブロック設置 (採掘中でなければ)
      if (!wasMining && moved < 12 && performance.now() - downTime < 260) {
        Input.usePressed = true;
      }
    };
    look.addEventListener('pointerup', endLook);
    look.addEventListener('pointercancel', endLook);

    // ボタン
    const hold = (id, on, off) => {
      const el = document.getElementById(id);
      el.addEventListener('pointerdown', (e) => { e.preventDefault(); el.classList.add('active'); on(); });
      const end = (e) => { e && e.preventDefault(); el.classList.remove('active'); off && off(); };
      el.addEventListener('pointerup', end);
      el.addEventListener('pointerleave', end);
      el.addEventListener('pointercancel', end);
    };

    hold('tb-jump', () => { Input.jump = true; }, () => { Input.jump = false; });
    hold('tb-attack', () => { Input.attack = true; }, () => { Input.attack = false; });
    hold('tb-place', () => { Input.usePressed = true; Input.useHeld = true; }, () => { Input.useHeld = false; });

    const toggle = (id, get, set) => {
      const el = document.getElementById(id);
      el.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        set(!get());
        el.classList.toggle('active', get());
      });
    };
    toggle('tb-sneak', () => Input.sneak, v => { Input.sneak = v; });
    toggle('tb-sprint', () => Input.sprint, v => { Input.sprint = v; });
    document.getElementById('tb-inv').addEventListener('pointerdown', (e) => {
      e.preventDefault();
      Input.onToggleInventory && Input.onToggleInventory();
    });
  }

  global.Input = Input;
})(window);
