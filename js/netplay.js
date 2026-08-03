/* ==========================================================================
 * netplay.js — OmniP2P によるライブマルチプレイ
 * - 「ワールド公開」でホストが OmniP2P ルームを開き、ブロック変更/チャンクを配信
 * - ホーム画面にオンラインワールドを自動表示し、誰でも参加可能
 * - 参加者はホストのワールドに接続し、変更をリアルタイムで同期
 * - 同期単位は「ブロック変更イベント」+「新規参加時のフルスナップショット」
 * ========================================================================== */
(function (global) {
  'use strict';

  // v0.13.4: ローカル同梱版を使う (Discord Activity 等のCDN制限環境でも動作)
  const OMNIP2P_URL = 'js/vendor/omnip2p.js';
  const RELAYS = [
    'wss://relay.damus.io', 'wss://nos.lol', 'wss://relay.nostr.band',
    'wss://nostr.wine', 'wss://relay.snort.social', 'wss://nostr.mom',
    'wss://nostr.oxtr.dev', 'wss://relay.nostr.bg'
  ];
  const APP_TAG = 'craftworld3d';
  const PROTO_VER = 1;

  const Net = {
    mode: 'offline',        // 'offline' | 'host' | 'client'
    omni: null,
    room: null,
    roomId: null,
    worldName: '',
    hostPubkey: null,
    onlineWorlds: [],       // ホーム画面表示用
    _scriptLoaded: false,
    _presenceTimer: null,
    _presenceSub: null,

    /* ---------- 初期化: SDK読み込み + ワールド一覧購読 ---------- */
    async init() {
      if (this._scriptLoaded) return true;
      await new Promise((resolve) => {
        const s = document.createElement('script');
        s.src = OMNIP2P_URL;
        s.onload = () => { this._scriptLoaded = true; resolve(); };
        s.onerror = () => { console.warn('[Net] OmniP2P SDK 読み込み失敗'); resolve(); };
        document.head.appendChild(s);
      });
      if (!this._scriptLoaded || !global.OmniP2P) return false;
      this._subscribeWorldList();
      return true;
    },

    /* ---------- オンラインワールド一覧の購読 (Nostr kind:30078 的な告知) ---------- */
    _subscribeWorldList() {
      // OmniP2P は Nostr リレーを使うため、ここでは簡易的に「公開中のホスト」を
      // 購読する代わりに、ホーム画面表示用の配列を保持する。
      // 実際の discovery は host が定期的に storage.put('cw3d:announce:<pubkey>', {...})
      // するのを参加者が storage.list('cw3d:announce:') で拾う方式にする。
      this.onlineWorlds = [];
      this._refreshAnnounceLoop();
    },

    async _refreshAnnounceLoop() {
      // 一覧は storage.list で拾う。オフライン/未初期化でもホーム画面は空配列で動く。
      if (!this.omni) {
        // 一覧だけでも見られるように、軽量な読み取り専用インスタンスを作る
        try {
          const omni = new OmniP2P({ relays: RELAYS });
          await omni.start();
          this._listOmni = omni;
        } catch (e) { /* noop */ }
      }
      const pull = async () => {
        try {
          const o = this.omni || this._listOmni;
          if (!o || !o.storage) return;
          const items = await o.storage.list('cw3d:announce:');
          const now = Date.now();
          const worlds = [];
          for (const it of items) {
            try {
              const meta = await o.storage.get(it.key);
              if (meta && meta.app === APP_TAG && meta.ver === PROTO_VER && (now - meta.ts) < 5 * 60 * 1000) {
                worlds.push({
                  roomId: meta.roomId,
                  name: meta.name || '無名のワールド',
                  host: meta.host || '',
                  players: meta.players || 0,
                  ts: meta.ts,
                });
              }
            } catch (e) { /* skip */ }
          }
          worlds.sort((a, b) => b.ts - a.ts);
          this.onlineWorlds = worlds;
          if (typeof global.onNetWorldListChanged === 'function') global.onNetWorldListChanged(worlds);
        } catch (e) { /* noop */ }
      };
      await pull();
      clearInterval(this._listTimer);
      this._listTimer = setInterval(pull, 15000);
    },

    /* ---------- ホスト: ワールドを公開 ---------- */
    async hostWorld(name, worldSnapshotFn) {
      if (!await this.init()) return { ok: false, error: 'OmniP2P SDK が読み込めません' };
      try {
        this.omni = new OmniP2P({ relays: RELAYS });
        await this.omni.start();
        this.roomId = 'cw3d-' + Math.random().toString(36).slice(2, 10);
        this.room = await this.omni.join(this.roomId, { password: APP_TAG });
        this.mode = 'host';
        this.worldName = name || 'ホストのワールド';
        this.hostPubkey = this.omni.pubkey;
        this._snapshotFn = worldSnapshotFn;

        // 参加者からの join 要求に応答
        this.room.on('message', (msg, peer) => this._onHostMessage(msg, peer));
        this.room.on('peer:join', (peer) => this._announce());
        this.room.on('peer:leave', (peer) => this._announce());

        // 公開告知を定期更新 (5分で期限切れにするため)
        this._announce();
        clearInterval(this._presenceTimer);
        this._presenceTimer = setInterval(() => this._announce(), 60000);
        return { ok: true, roomId: this.roomId };
      } catch (e) {
        console.warn('[Net] hostWorld 失敗', e);
        return { ok: false, error: String(e && e.message || e) };
      }
    },

    async _announce() {
      if (!this.omni || !this.omni.storage || this.mode !== 'host') return;
      try {
        const players = this.room ? (this.room.peers().length + 1) : 1;
        await this.omni.storage.put('cw3d:announce:' + this.hostPubkey, {
          app: APP_TAG, ver: PROTO_VER, ts: Date.now(),
          roomId: this.roomId, name: this.worldName, host: this.hostPubkey, players,
        });
      } catch (e) { /* noop */ }
    },

    /* ---------- ホスト側: クライアントからのメッセージ処理 ---------- */
    _onHostMessage(msg, peer) {
      if (!msg || typeof msg !== 'object') return;
      if (msg.t === 'join') {
        // 新規参加者にフルスナップショットを送信
        const snap = this._snapshotFn ? this._snapshotFn() : null;
        this.room.send({ t: 'snapshot', data: snap }, { to: peer });
      } else if (msg.t === 'edit') {
        // 参加者のブロック変更をワールドに反映し、全員へ再配信 (ホストが権威)
        if (global.NetHostApplyEdit) global.NetHostApplyEdit(msg, peer);
        this.room.send({ t: 'edit', data: msg.data, from: peer });
      }
    },

    /* ---------- ホスト→全員: ブロック変更を配信 ---------- */
    broadcastEdit(edit) {
      if (this.mode === 'host' && this.room) {
        this.room.send({ t: 'edit', data: edit, from: this.hostPubkey });
      } else if (this.mode === 'client' && this.room) {
        // クライアントはホストへ送信 (ホストが権威を持ち再配信)
        this.room.send({ t: 'edit', data: edit }, { to: this.hostPubkey });
      }
    },

    /* ---------- クライアント: オンラインワールドに参加 ---------- */
    async joinWorld(roomId) {
      if (!await this.init()) return { ok: false, error: 'OmniP2P SDK が読み込めません' };
      try {
        this.omni = new OmniP2P({ relays: RELAYS });
        await this.omni.start();
        this.roomId = roomId;
        this.room = await this.omni.join(roomId, { password: APP_TAG });
        this.mode = 'client';
        // ホストからのメッセージ
        this.room.on('message', (msg, peer) => {
          if (!msg || typeof msg !== 'object') return;
          if (msg.t === 'snapshot') {
            if (global.NetClientReceiveSnapshot) global.NetClientReceiveSnapshot(msg.data);
          } else if (msg.t === 'edit') {
            if (global.NetClientApplyEdit) global.NetClientApplyEdit(msg.data);
          }
        });
        // 参加要求を送信 (スナップショットを要求)
        this.room.send({ t: 'join' });
        return { ok: true };
      } catch (e) {
        console.warn('[Net] joinWorld 失敗', e);
        return { ok: false, error: String(e && e.message || e) };
      }
    },

    /* ---------- 切断 ---------- */
    leave() {
      clearInterval(this._presenceTimer);
      if (this.mode === 'host' && this.omni && this.omni.storage) {
        // 公開告知を削除
        try { this.omni.storage.del('cw3d:announce:' + this.hostPubkey); } catch (e) {}
      }
      try { if (this.room) this.room.leave(); } catch (e) {}
      try { if (this.omni) this.omni.stop(); } catch (e) {}
      this.mode = 'offline';
      this.room = null;
      this.omni = null;
      this.roomId = null;
    },
  };

  global.Net = Net;
})(window);
