/* ==========================================================================
 * discord-sdk.js — Discord Activity (Embedded App) 対応
 * - Discord Activity iframe内では Embedded App SDK を読み込み初期化する
 * - ゲームはシングルプレイのため、SDK の役割は以下の4点:
 *   (1) Discord のクライアント準備 (ready) 完了を待ってゲームを開始
 *   (2) チャンネルに合わせた Rich Presence (setActivity) 表示
 *   (3) localStorage を「クライアント×チャンネル」単位で名前空間化
 *   (4) Activity 環境ではポインタロック API が制限されるため、
 *       失敗時にドラッグ視点へフォールバックするフラグを提供
 * - 通常ブラウザ（Discord外）では無効化され、既存動作は一切変わらない
 * ========================================================================== */
(function () {
  'use strict';

  const DISCORD_SCRIPT_URL = 'https://cdn.jsdelivr.net/npm/@discord/embedded-app-sdk@1.3.0/output/index.iife.js';

  const DiscordSDK = {
    enabled: false,          // Activity iframe 内で初期化に成功したら true
    isActivity: false,       // Activity らしい環境 (検出のみ。失敗してもゲームは動く)
    ready: false,
    channelId: null,
    user: null,
    client: null,
    _activityName: null,
    _activityDetails: null,

    /* --- Activity 環境らしいかの軽量判定 (失敗時のフォールバック用) --- */
    detect() {
      try {
        if (window.self === window.top) return false;
      } catch (e) { /* クロスオリジンで例外 → iframe内の可能性 */ }
      const host = location.hostname;
      const qs = new URLSearchParams(location.search);
      return host.endsWith('discordsays.com') || qs.has('frame_id') || qs.has('instance_id');
    },

    /* --- 初期化。通常ブラウザでは即 resolve(false) --- */
    init() {
      this.isActivity = this.detect();
      if (!this.isActivity) return Promise.resolve(false);

      return new Promise((resolve) => {
        const script = document.createElement('script');
        script.src = DISCORD_SCRIPT_URL;
        script.onload = () => {
          try {
            // グローバル名はSDKビルドにより異なることがあるため総当り
            const g = window;
            const DiscordSDKCtor = (g.DiscordSDK && g.DiscordSDK.DiscordSDK) || g.DiscordSDK;
            const clientId = (typeof APP_CONFIG !== 'undefined' && APP_CONFIG.DISCORD_CLIENT_ID) || '';
            if (!DiscordSDKCtor || !clientId) {
              // CLIENT_ID 未設定でも Activity 内ではポインタロック対策だけ有効化する
              console.warn('[DiscordSDK] CLIENT_ID 未設定またはSDK未取得。最小モードで継続します');
              this.ready = true;
              resolve(true);
              return;
            }
            this.client = new DiscordSDKCtor(clientId);
            // ready は commands 不要のため authorize なしで待つ
            const readyPromise = this.client.ready ? this.client.ready() : Promise.resolve();
            Promise.race([readyPromise, new Promise(r => setTimeout(r, 4000))])
              .then(() => {
                try {
                  this.channelId = (this.client.channelId !== undefined && this.client.channelId !== null)
                    ? this.client.channelId : null;
                  this.enabled = true;
                  this.ready = true;
                  this._applyStorageNamespace();
                  this.setActivity('ワールドを探索中', 'クラフトワールド 3D をプレイ中');
                } catch (e) { console.warn('[DiscordSDK] ready後処理失敗', e); }
                resolve(true);
              })
              .catch((e) => { console.warn('[DiscordSDK] ready失敗', e); resolve(true); });
          } catch (e) {
            console.warn('[DiscordSDK] 初期化エラー', e);
            resolve(true);
          }
        };
        script.onerror = () => {
          console.warn('[DiscordSDK] SDKスクリプトの読み込みに失敗。最小モードで継続します');
          resolve(true);
        };
        document.head.appendChild(script);
      });
    },

    /* --- localStorage をクライアント×チャンネルで名前空間化 --- */
    _applyStorageNamespace() {
      if (!this.channelId) return;
      const ns = 'cw3d_dc_' + this.channelId;
      try {
        const proto = Object.getPrototypeOf(localStorage);
        const origGet = Storage.prototype.getItem.bind(localStorage);
        const origSet = Storage.prototype.setItem.bind(localStorage);
        const origDel = Storage.prototype.removeItem.bind(localStorage);
        // ゲームが使うキーを透過的にプレフィックス
        const wrap = (k) => (typeof k === 'string' && k.startsWith('craftworld3d')) ? ns + ':' + k : k;
        Storage.prototype.getItem = function (k) { return origGet(wrap(k)); };
        Storage.prototype.setItem = function (k, v) { return origSet(wrap(k), v); };
        Storage.prototype.removeItem = function (k) { return origDel(wrap(k)); };
      } catch (e) { console.warn('[DiscordSDK] ストレージ名前空間化に失敗', e); }
    },

    /* --- Rich Presence 更新 (ゲーム進行に応じて呼ぶ) --- */
    setActivity(details, state) {
      if (!this.enabled || !this.client || !this.client.commands) return;
      if (details === this._activityName && state === this._activityDetails) return;
      this._activityName = details; this._activityDetails = state;
      try {
        this.client.commands.setActivity({
          activity: {
            type: 0, // Playing
            details: details || 'クラフトワールド 3D',
            state: state || '',
            timestamps: { start: Math.floor(Date.now() / 1000) },
            assets: { large_image: 'craftworld3d', large_text: 'クラフトワールド 3D' },
          },
        }).catch(() => { /* presence失敗は無視 */ });
      } catch (e) { /* noop */ }
    },
  };

  window.DiscordSDK = DiscordSDK;
})();
