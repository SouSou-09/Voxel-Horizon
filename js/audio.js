/* ==========================================================
   audio.js — WebAudio による効果音 (外部ファイル不要)
   ========================================================== */
(function (global) {
  'use strict';

  const Sound = {
    ctx: null,
    enabled: true,
    master: null,
    noiseBuf: null,

    init() {
      if (this.ctx) return;
      const AC = global.AudioContext || global.webkitAudioContext;
      if (!AC) { this.enabled = false; return; }
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.35;
      this.master.connect(this.ctx.destination);

      // ホワイトノイズ
      const len = this.ctx.sampleRate * 0.5;
      const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      this.noiseBuf = buf;
    },

    resume() {
      if (!this.ctx) this.init();
      if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
    },

    /** 単音 */
    tone(freq, dur, type = 'square', vol = 0.2, slideTo = null) {
      if (!this.enabled) return;
      this.init();
      if (!this.ctx) return;
      const t = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, t);
      if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      osc.connect(g); g.connect(this.master);
      osc.start(t); osc.stop(t + dur + 0.02);
    },

    /** ノイズ (掘削音など) */
    noise(dur, filterFreq = 900, vol = 0.25, q = 1) {
      if (!this.enabled) return;
      this.init();
      if (!this.ctx || !this.noiseBuf) return;
      const t = this.ctx.currentTime;
      const src = this.ctx.createBufferSource();
      src.buffer = this.noiseBuf;
      const flt = this.ctx.createBiquadFilter();
      flt.type = 'bandpass';
      flt.frequency.value = filterFreq;
      flt.Q.value = q;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      src.connect(flt); flt.connect(g); g.connect(this.master);
      src.start(t); src.stop(t + dur + 0.02);
    },

    /* ---- 効果音プリセット ---- */
    dig(material) {
      const f = { stone: 1400, wood: 700, dirt: 380, sand: 2600, glass: 3200 }[material] || 600;
      this.noise(0.08, f, 0.22, 1.4);
    },
    place(material) {
      this.dig(material);
      this.tone(160, 0.06, 'square', 0.1, 110);
    },
    step() { this.noise(0.05, 300 + Math.random() * 200, 0.09, 1); },
    hurt() { this.tone(300, 0.22, 'sawtooth', 0.22, 90); },
    pop() { this.tone(760, 0.07, 'square', 0.12, 1100); },
    craft() { this.tone(520, 0.07, 'square', 0.14); setTimeout(() => this.tone(780, 0.1, 'square', 0.14), 70); },
    eat() { this.noise(0.12, 420, 0.16, 0.8); },
    hit() { this.tone(220, 0.09, 'square', 0.18, 140); this.noise(0.06, 500, 0.12); },
    levelDay() { this.tone(440, 0.15, 'sine', 0.16); setTimeout(() => this.tone(660, 0.25, 'sine', 0.16), 130); },

    /* ===== v0.13: 天候の音 ===== */
    /** 雨の環境音ループを開始 (フィルター済みノイズを持続再生) */
    rainStart() {
      this.rainStop();
      if (!this.enabled) return;
      this.init();
      if (!this.ctx || !this.noiseBuf) return;
      const src = this.ctx.createBufferSource();
      src.buffer = this.noiseBuf;
      src.loop = true;
      const flt = this.ctx.createBiquadFilter();
      flt.type = 'bandpass';
      flt.frequency.value = 1400;
      flt.Q.value = 0.4;
      const g = this.ctx.createGain();
      g.gain.value = 0;   // フェードイン
      g.gain.setTargetAtTime(0.055, this.ctx.currentTime, 1.2);
      src.connect(flt); flt.connect(g); g.connect(this.master);
      src.start();
      this._rainNodes = { src, g };
    },
    /** 雨音を停止 (フェードアウト) */
    rainStop() {
      if (!this._rainNodes) return;
      try {
        this._rainNodes.g.gain.setTargetAtTime(0, this.ctx.currentTime, 0.4);
        const src = this._rainNodes.src;
        setTimeout(() => { try { src.stop(); } catch (e) {} }, 1500);
      } catch (e) {}
      this._rainNodes = null;
    },
    /** 雷鳴 (低いノイズの轟き + 近い雷は鋭い破裂音) */
    thunder(near) {
      if (!this.enabled) return;
      this.noise(near ? 1.6 : 2.8, near ? 320 : 120, near ? 0.55 : 0.35, 0.3);
      if (near) this.noise(0.25, 2600, 0.4, 0.8);   // バリッという破裂
    },
    /* v0.13.1: ポータル転移 (シュワシュワした上昇音) */
    portal() {
      if (!this.enabled) return;
      this.noise(0.7, 900, 0.3, 0.6);
      this.tone(220, 0.5, 'sine', 0.18, 880);
      setTimeout(() => this.tone(440, 0.4, 'sine', 0.14, 1320), 120);
    },
    /* v0.13.2: ドラゴンの咆哮 (低い唸り + 甲高い叫び) */
    roar() {
      if (!this.enabled) return;
      this.noise(0.9, 200, 0.5, 0.5);
      this.tone(110, 0.8, 'sawtooth', 0.22, 65);
      setTimeout(() => this.tone(520, 0.5, 'sawtooth', 0.14, 180), 160);
    }
  };

  // 最初の操作で AudioContext を有効化
  const unlock = () => { Sound.resume(); };
  window.addEventListener('pointerdown', unlock, { once: false });
  window.addEventListener('keydown', unlock, { once: false });

  global.Sound = Sound;
})(window);
