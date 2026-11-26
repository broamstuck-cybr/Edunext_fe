// ==UserScript==
// @name         EDUNEXT BAS — Admin Console
// @name:vi      EDUNEXT BAS — Bảng quản trị
// @namespace    https://github.com/EDUNEXT-cybr/Edunext_fe/edunext-bas-admin
// @version      1.0.0
// @description  Bảng quản trị riêng cho EDUNEXT BAS: xem Gmail đang chạy script, nhắn chat chung, phủ màn hình hoặc khoá script từ xa.
// @description:vi  Theo dõi Gmail đang dùng script, nhắn tin vào chat chung, phủ kín màn hình người dùng hoặc khoá script. Kết nối cùng relay với script người dùng.
// @author       EDUNEXT_BAS
// @copyright    2026, EDUNEXT_BAS (https://github.com/EDUNEXT-cybr/Edunext_fe)
// @license      Proprietary - EDUNEXT_BAS
// @updateURL    https://raw.githubusercontent.com/EDUNEXT-cybr/Edunext_fe/main/EDUNEXT_BAS_ADMIN.user.js
// @downloadURL  https://raw.githubusercontent.com/EDUNEXT-cybr/Edunext_fe/main/EDUNEXT_BAS_ADMIN.user.js
// @homepageURL  https://github.com/EDUNEXT-cybr/Edunext_fe
// @supportURL   https://discord.gg/GMDCnxxJwX
// @icon         data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' rx='16' fill='%23090910'/%3E%3Cpath d='M32 12l15 5.6v11.6C47 38.4 40.8 45.5 32 48.6 23.2 45.5 17 38.4 17 29.2V17.6z' fill='none' stroke='%23c084fc' stroke-width='4'/%3E%3Ccircle cx='32' cy='30' r='3.2' fill='%2338bdf8'/%3E%3C/svg%3E
// @match        https://fsc-edunext.fpt.edu.vn/*
// @match        https://edunext.fpt.edu.vn/*
// @match        https://*.edunext.fpt.edu.vn/*
// @run-at       document-start
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// @grant        GM_xmlhttpRequest
// @grant        unsafeWindow
// @connect      *
// @noframes
// ==/UserScript==
/* Build: 2026-11-26T06:45:44.572Z · 4 tệp · BAS Admin */
/* ======================== 00_core.js ======================== */
/* ============================================================================
 * EDUNEXT BAS ADMIN — bảng quản trị độc lập
 * Nói chuyện với cùng relay với script người dùng. Không đọc/giải bài, không
 * đụng DOM của EduNext; chỉ giữ một nút nổi + một bảng bento.
 * ========================================================================== */
(function () {
  'use strict';

  const HOST = location.hostname;
  const IS_EDUNEXT = /edunext\.fpt\.edu\.vn$/i.test(HOST);
  const IS_TOP = (() => { try { return window.top === window.self; } catch (_) { return false; } })();
  if (!IS_EDUNEXT || !IS_TOP) return;
  try {
    const W = (typeof unsafeWindow !== 'undefined' && unsafeWindow) || window;
    if (W.__BAS_ADMIN__ || window.__BAS_ADMIN__) return;
  } catch (_) { /* môi trường lạ */ }

  const ADM = Object.freeze({
    NAME: 'EDUNEXT BAS Admin',
    VERSION: '1.0.0',
    DISCORD: 'https://discord.gg/GMDCnxxJwX',
    REPO_RAW: 'https://raw.githubusercontent.com/EDUNEXT-cybr/Edunext_fe/main',
    TTL_MS: 90 * 1000
  });

  const NS = 'BAS_ADMIN_';
  const now = () => Date.now();
  const esc = (s) => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  const cut = (s, n) => { const t = String(s == null ? '' : s); return t.length > n ? t.slice(0, n) + '…' : t; };

  /* ------------------------------- LƯU TRỮ ------------------------------- */
  function load(k, d) {
    try {
      let v;
      if (typeof GM_getValue === 'function') v = GM_getValue(NS + k, null);
      else v = localStorage.getItem(NS + k);
      if (v == null || v === '') return d;
      if (typeof v === 'string') {
        try { return JSON.parse(v); } catch (_) { return v; }
      }
      return v;
    } catch (_) { return d; }
  }

  function save(k, v) {
    try {
      if (typeof GM_setValue === 'function') GM_setValue(NS + k, v);
      else localStorage.setItem(NS + k, JSON.stringify(v));
    } catch (_) { /* storage khoá */ }
  }

  /* -------------------------------- HTTP -------------------------------- */
  function http(method, url, body, ms) {
    const limit = ms || 12000;
    return new Promise((resolve, reject) => {
      if (typeof GM_xmlhttpRequest === 'function') {
        GM_xmlhttpRequest({
          method: method,
          url: url,
          headers: body ? { 'Content-Type': 'application/json' } : {},
          data: body ? JSON.stringify(body) : undefined,
          timeout: limit,
          onload: (r) => {
            let d = {};
            try { d = JSON.parse(r.responseText || '{}'); } catch (_) { d = {}; }
            resolve({ ok: r.status >= 200 && r.status < 300, status: r.status, data: d });
          },
          onerror: () => reject(new Error('Không gọi được relay')),
          ontimeout: () => reject(new Error('Relay không trả lời'))
        });
        return;
      }
      const ctl = typeof AbortController === 'function' ? new AbortController() : null;
      const t = setTimeout(() => { if (ctl) ctl.abort(); }, limit);
      fetch(url, {
        method: method,
        headers: body ? { 'Content-Type': 'application/json' } : {},
        body: body ? JSON.stringify(body) : undefined,
        signal: ctl ? ctl.signal : undefined
      }).then(async (r) => {
        clearTimeout(t);
        let d = {};
        try { d = JSON.parse(await r.text()); } catch (_) { d = {}; }
        resolve({ ok: r.ok, status: r.status, data: d });
      }).catch((e) => { clearTimeout(t); reject(new Error('Không gọi được relay: ' + e.message)); });
    });
  }

  /* ------------------------------- TRẠNG THÁI ------------------------------- */
  const S = {
    url: String(load('url', '') || '').trim().replace(/\/+$/, ''),
    key: String(load('key', '') || ''),
    online: false,
    err: '',
    devices: [],
    bannedIps: [],
    version: null,
    at: 0,
    q: '',
    sel: '',              /* id thiết bị đang chọn */
    mode: 'chat',         /* chat | screen */
    chat: [],
    chatCursor: 0,
    busy: false,
    msg: ''
  };

  const emit = (() => {
    let t = 0;
    return () => {
      if (t) return;
      t = setTimeout(() => { t = 0; try { AdminUI.render(); } catch (_) {} }, 60);
    };
  })();

  async function call(method, p, body, ms) {
    if (!S.url) throw new Error('Chưa có địa chỉ relay');
    const r = await http(method, S.url + p, body, ms);
    const d = r.data || {};
    if (!r.ok && !d.error) throw new Error('Relay HTTP ' + r.status);
    return d;
  }

  function token() { return S.key; }

  async function login(key, url) {
    if (url) { S.url = String(url).trim().replace(/\/+$/, ''); save('url', S.url); }
    const k = String(key || S.key || '').trim();
    if (!k) return { ok: false, error: 'Nhập khoá quản trị' };
    if (!S.url) return { ok: false, error: 'Nhập địa chỉ relay' };
    try {
      const d = await call('POST', '/api/admin/login', { key: k }, 9000);
      if (!d.ok) return { ok: false, error: d.error || 'Sai khoá' };
      S.key = k;
      save('key', k);
      S.online = true;
      S.err = '';
      await refresh();
      return { ok: true };
    } catch (e) {
      S.online = false;
      S.err = cut(e.message, 90);
      emit();
      return { ok: false, error: S.err };
    }
  }

  async function refresh() {
    if (!token()) return { ok: false, error: 'Chưa đăng nhập' };
    try {
      const d = await call('GET', '/api/admin/devices?token=' + encodeURIComponent(token()), null, 10000);
      if (!d.ok) { S.online = false; return { ok: false, error: d.error || 'Sai khoá' }; }
      S.online = true;
      S.err = '';
      S.devices = d.devices || [];
      S.bannedIps = d.bannedIps || [];
      S.version = d.version || null;
      S.at = now();
      emit();
      return { ok: true };
    } catch (e) {
      S.online = false;
      S.err = cut(e.message, 90);
      emit();
      return { ok: false, error: S.err };
    }
  }

  async function readChat() {
    if (!token()) return;
    try {
      const d = await call('GET', '/api/admin/chat?token=' + encodeURIComponent(token()) + '&since=' + S.chatCursor, null, 9000);
      if (!d.ok) return;
      const seen = {};
      S.chat.forEach((m) => { seen[m.id] = 1; });
      (d.msgs || []).forEach((m) => { if (!seen[m.id]) S.chat.push(m); });
      if (S.chat.length > 200) S.chat.splice(0, S.chat.length - 200);
      if (d.cursor) S.chatCursor = Math.max(S.chatCursor, d.cursor);
      emit();
    } catch (_) { /* chat lỗi không chặn bảng thiết bị */ }
  }

  async function action(act, payload) {
    if (!token()) return { ok: false, error: 'Chưa đăng nhập' };
    try {
      const d = await call('POST', '/api/admin/action', Object.assign({ token: token(), action: act }, payload || {}), 12000);
      if (!d.ok) return { ok: false, error: d.error || 'Thất bại' };
      refresh();
      return { ok: true, data: d };
    } catch (e) {
      return { ok: false, error: cut(e.message, 80) };
    }
  }

  async function send(text, to, mode) {
    if (!token()) return { ok: false, error: 'Chưa đăng nhập' };
    const body = String(text || '').trim();
    if (!body) return { ok: false, error: 'Nội dung rỗng' };
    /* UI dùng 'screen'; relay dùng 'overlay' — đổi đúng một chỗ. */
    const wire = mode === 'screen' || mode === 'overlay' ? 'overlay' : 'chat';
    try {
      let d;
      if (to) {
        d = await call('POST', '/api/admin/say', { token: token(), text: body, to: to, mode: wire }, 12000);
      } else if (wire === 'overlay') {
        d = await call('POST', '/api/admin/broadcast', { token: token(), text: body, mode: 'overlay' }, 15000);
      } else {
        d = await call('POST', '/api/admin/say', { token: token(), text: body }, 12000);
      }
      if (!d.ok) return { ok: false, error: d.error || 'Không gửi được' };
      if (d.sent != null) return { ok: true, sent: d.sent };
      readChat();
      return { ok: true, sent: 1 };
    } catch (e) {
      return { ok: false, error: cut(e.message, 80) };
    }
  }

  /* Tự dò relay nếu chưa cấu hình: cùng tệp relay.json với script người dùng. */
  async function discover() {
    if (S.url) return S.url;
    try {
      const r = await http('GET', ADM.REPO_RAW + '/relay.json?t=' + Math.floor(now() / 600000), null, 8000);
      const u = r.ok && r.data ? String(r.data.url || r.data.relay || '').trim() : '';
      if (!u) return '';
      S.url = u.replace(/\/+$/, '');
      save('url', S.url);
      emit();
      return S.url;
    } catch (_) { return ''; }
  }

/* ======================== 10_css.js ======================== */
  const ADMIN_CSS = String.raw`
  :host {
    position: fixed;
    inset: 0;
    z-index: 2147483001;
    pointer-events: none;
    --ink: #F1F5F9;
    --soft: #CBD5E1;
    --muted: #94A3B8;
    --line: rgba(255, 255, 255, .10);
    --line-2: rgba(255, 255, 255, .18);
    --vi: #C084FC;
    --acc: #38BDF8;
    --ok: #10B981;
    --warn: #F59E0B;
    --err: #EF4444;
    --sans: 'Montserrat', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    --mono: 'JetBrains Mono', ui-monospace, Menlo, monospace;
    --spring: cubic-bezier(.16, 1, .3, 1);
    font-synthesis: none;
    -webkit-font-smoothing: antialiased;
    color-scheme: dark;
  }
  *, *::before, *::after { box-sizing: border-box; }
  button, input, select { font-family: var(--sans); }
  button:focus-visible, input:focus-visible, select:focus-visible, [role="button"]:focus-visible {
    outline: 2px solid var(--vi); outline-offset: 2px;
  }

  /* ---------------- Nút nổi ---------------- */
  .adm-launch {
    position: fixed; right: 14px; bottom: 14px;
    display: flex; align-items: center; gap: 6px;
    height: 46px; padding: 0 13px;
    border-radius: 23px; pointer-events: auto; cursor: pointer;
    background: linear-gradient(180deg, rgba(32, 24, 46, .96), rgba(12, 10, 18, .97));
    border: 1px solid rgba(192, 132, 252, .42);
    box-shadow: 0 18px 40px -20px rgba(0, 0, 0, .9), inset 0 1px 0 rgba(255, 255, 255, .14);
    color: var(--ink); user-select: none;
    transition: transform .22s var(--spring), border-color .2s, background .2s;
  }
  .adm-launch:hover { transform: translateY(-1px); border-color: rgba(192, 132, 252, .7); }
  .adm-launch:active { transform: translateY(0) scale(.98); }
  .adm-launch svg { width: 18px; height: 18px; color: var(--vi); }
  .adm-launch b {
    font-family: var(--mono); font-size: 10px; font-weight: 700;
    color: var(--acc); min-width: 10px;
  }
  :host([data-open="1"]) .adm-launch { opacity: 0; pointer-events: none; }

  /* ---------------- Bảng ---------------- */
  .adm-panel {
    position: fixed; right: 12px; bottom: 12px;
    width: min(600px, calc(100vw - 24px));
    max-height: min(760px, calc(100vh - 24px));
    display: flex; flex-direction: column;
    overflow: hidden; pointer-events: auto;
    border-radius: 22px;
    background: linear-gradient(168deg, rgba(26, 22, 36, .97), rgba(9, 8, 13, .985));
    border: 1px solid rgba(255, 255, 255, .12);
    box-shadow: 0 40px 100px -40px rgba(0, 0, 0, .95), inset 0 1px 0 rgba(255, 255, 255, .10);
    transform: translateY(14px) scale(.985); opacity: 0; visibility: hidden;
    transition: transform .4s var(--spring), opacity .28s var(--spring), visibility .28s;
  }
  :host([data-open="1"]) .adm-panel { transform: none; opacity: 1; visibility: visible; }

  header {
    display: flex; align-items: center; gap: 8px;
    padding: 13px 14px 11px;
    border-bottom: 1px solid var(--line);
  }
  .brand {
    font-family: 'Great Vibes', var(--sans); font-size: 20px; line-height: 1;
    background: linear-gradient(110deg, #C084FC, #38BDF8 60%, #fff);
    -webkit-background-clip: text; background-clip: text;
    -webkit-text-fill-color: transparent; color: transparent;
  }
  .tag {
    font-family: var(--mono); font-size: 8px; letter-spacing: .14em;
    padding: 3px 6px; border-radius: 5px;
    background: rgba(192, 132, 252, .16); border: 1px solid rgba(192, 132, 252, .35);
    color: #E9D5FF;
  }
  .status { display: flex; align-items: center; gap: 5px; margin-left: auto; font-size: 9.5px; color: var(--muted); font-family: var(--mono); }
  .dot { width: 6px; height: 6px; border-radius: 50%; background: var(--muted); }
  .dot.on { background: var(--ok); box-shadow: 0 0 0 3px rgba(16, 185, 129, .14); }
  .dot.err { background: var(--err); }
  .x {
    display: grid; place-items: center; width: 28px; height: 28px;
    background: transparent; border: 1px solid transparent; border-radius: 8px;
    color: var(--muted); cursor: pointer;
  }
  .x:hover { color: var(--ink); border-color: var(--line-2); background: rgba(255, 255, 255, .06); }
  .x svg { width: 14px; height: 14px; }

  .bento {
    display: grid; grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 7px; padding: 11px; overflow: auto;
    scrollbar-width: thin;
  }
  .bento > * { min-width: 0; }

  .kpi {
    display: flex; flex-direction: column; gap: 2px;
    padding: 9px 10px; border-radius: 11px;
    background: rgba(255, 255, 255, .035); border: 1px solid var(--line);
  }
  .kpi b { font-family: var(--mono); font-size: 16px; font-weight: 700; color: var(--ink); }
  .kpi span { font-size: 7.5px; font-weight: 700; letter-spacing: .5px; text-transform: uppercase; color: var(--muted); }
  .kpi:nth-child(1) b { color: var(--ok); }
  .kpi:nth-child(3) b { color: var(--err); }
  .kpi:nth-child(4) b { color: var(--acc); font-size: 11px; }

  .card {
    display: flex; flex-direction: column; gap: 7px;
    padding: 10px; border-radius: 12px;
    background: rgba(255, 255, 255, .035); border: 1px solid var(--line);
  }
  .login, .list, .send, .chat { grid-column: span 4; }
  .login[hidden] { display: none; }

  .row { display: flex; align-items: center; gap: 6px; }
  input, select {
    flex: 1 1 auto; min-width: 0; height: 32px; padding: 0 9px;
    border-radius: 9px; border: 1px solid var(--line);
    background: rgba(255, 255, 255, .045); color: var(--ink);
    font-size: 11px; outline: none;
  }
  input::placeholder { color: rgba(255, 255, 255, .32); }
  input:focus, select:focus { border-color: rgba(192, 132, 252, .55); background: rgba(192, 132, 252, .07); }
  select option { background: #14111C; color: var(--ink); }
  .url { flex: 1 1 auto; font-family: var(--mono); font-size: 10px; }

  button {
    display: inline-flex; align-items: center; justify-content: center; gap: 5px;
    height: 32px; padding: 0 11px; flex: 0 0 auto;
    border-radius: 9px; border: 1px solid var(--line);
    background: rgba(255, 255, 255, .055); color: var(--ink);
    font-size: 9.5px; font-weight: 800; letter-spacing: .4px; text-transform: uppercase;
    cursor: pointer; transition: background .16s, border-color .16s, transform .14s var(--spring);
  }
  button:hover { background: rgba(255, 255, 255, .11); border-color: var(--line-2); }
  button:active { transform: scale(.98); }
  button.go { background: rgba(192, 132, 252, .9); border-color: rgba(216, 180, 254, .8); color: #160B22; }
  button.go:hover { background: #D8B4FE; }
  button.mini { width: 32px; padding: 0; }
  button.mini svg { width: 14px; height: 14px; }

  .seg { display: flex; gap: 5px; }
  .seg button { flex: 1 1 0; height: 28px; font-size: 8.5px; }
  .seg button.on { background: rgba(56, 189, 248, .18); border-color: rgba(56, 189, 248, .45); color: #E0F5FF; }

  .lhead, .chead { display: flex; align-items: center; gap: 7px; }
  .lhead b, .chead b { font-size: 10px; font-weight: 800; letter-spacing: .6px; text-transform: uppercase; color: var(--soft); flex: 0 0 auto; }
  .lhead input { flex: 1 1 auto; height: 26px; font-size: 10px; }
  .chead span { margin-left: auto; font-family: var(--mono); font-size: 8.5px; color: var(--muted); }

  .devs { display: flex; flex-direction: column; gap: 5px; max-height: 230px; overflow: auto; scrollbar-width: thin; }
  .dev {
    display: grid; grid-template-columns: 8px minmax(0, 1fr) auto;
    gap: 8px; align-items: center;
    padding: 7px 8px; border-radius: 10px;
    background: rgba(255, 255, 255, .03); border: 1px solid var(--line);
  }
  .dev.blocked { border-color: rgba(239, 68, 68, .35); background: rgba(239, 68, 68, .07); }
  .dev .dot { margin-top: 0; }
  .dev .m { min-width: 0; }
  .dev b { display: block; font-size: 10.5px; font-weight: 700; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .dev small { display: block; font-family: var(--mono); font-size: 8.5px; color: var(--muted); margin-top: 2px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .dev .acts { display: flex; gap: 3px; }
  .dev .acts button { width: 27px; height: 27px; padding: 0; }
  .dev .acts svg { width: 13px; height: 13px; }
  .dev .acts button.lock { color: #FFC9CF; border-color: rgba(239, 68, 68, .3); background: rgba(239, 68, 68, .1); }
  .dev .acts button.open { color: #B8F5D8; border-color: rgba(16, 185, 129, .3); background: rgba(16, 185, 129, .1); }

  .empty { padding: 14px 6px; font-size: 10.5px; line-height: 1.6; color: var(--muted); text-align: center; }

  .feed {
    height: 108px; overflow: auto; scrollbar-width: thin;
    display: flex; flex-direction: column; gap: 5px;
    padding: 7px; border-radius: 9px;
    background: rgba(0, 0, 0, .3); border: 1px solid var(--line);
  }
  .m { font-size: 10.5px; line-height: 1.45; color: var(--ink); }
  .m small { display: block; font-family: var(--mono); font-size: 8px; color: var(--muted); }
  .m.adm { color: #E9D5FF; }

  .note {
    margin: 0; padding: 8px 13px 11px;
    font-size: 8.5px; line-height: 1.5; color: var(--muted);
    border-top: 1px solid var(--line);
  }

  @media (max-width: 560px) {
    .adm-panel { right: 0; bottom: 0; width: 100vw; max-height: 88vh; border-radius: 18px 18px 0 0; }
    .bento { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .login, .list, .send, .chat { grid-column: span 2; }
    .kpi:nth-child(n+3) { display: flex; }
  }

  @media (prefers-reduced-motion: reduce) {
    * { transition-duration: .001ms !important; animation-duration: .001ms !important; }
  }
  `;

/* ======================== 20_ui.js ======================== */
  /* ------------------------------------------------------------------ */
  /* 2. GIAO DIỆN ADMIN — bento, icon tự vẽ, nội dung ngắn               */
  /* ------------------------------------------------------------------ */
  const AdminUI = (() => {
    const SVG = 'viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"';
    const ICO = {
      shield: '<svg ' + SVG + '><path d="M12 3.2l7 2.6v5.4c0 4.2-2.9 7.5-7 8.8-4.1-1.3-7-4.6-7-8.8V5.8z"/><path d="M12 9.1v3.2"/><circle cx="12" cy="15.6" r=".9" fill="currentColor" stroke="none"/></svg>',
      x: '<svg ' + SVG + '><path d="M7.2 7.2l9.6 9.6"/><path d="M16.8 7.2l-9.6 9.6"/></svg>',
      chat: '<svg ' + SVG + '><path d="M20.2 12c0 3.3-3.5 6-7.9 6-.9 0-1.7-.1-2.5-.3l-3.3 1.5.7-2.7c-1.2-1-1.9-2.3-1.9-4 0-3.3 3.5-6 7.9-6s7 2.7 7 6z"/></svg>',
      screen: '<svg ' + SVG + '><rect x="3" y="4.4" width="18" height="12.4" rx="2.6"/><path d="M9 20.2h6"/><path d="M12 16.8v3.4"/></svg>',
      lock: '<svg ' + SVG + '><rect x="5.4" y="10.4" width="13.2" height="9.4" rx="2.4"/><path d="M8.4 10.4V8.2a3.6 3.6 0 0 1 7.2 0v2.2"/><path d="M12 14.2v2"/></svg>',
      unlock: '<svg ' + SVG + '><rect x="5.4" y="10.4" width="13.2" height="9.4" rx="2.4"/><path d="M8.4 10.4V8.2a3.6 3.6 0 0 1 6.9-1.3"/><path d="M12 14.2v2"/></svg>',
      refresh: '<svg ' + SVG + '><path d="M19.4 9.3A7.8 7.8 0 1 0 20 14.5"/><path d="M20.2 4.7v4.7h-4.7"/></svg>'
    };

    let host = null, sh = null, refs = {};
    let mounted = false, open = false, tick = 0, chatTick = 0;

    function $(s) { return sh ? sh.querySelector(s) : null; }
    function el(tag, cls, txt) {
      const n = document.createElement(tag);
      if (cls) n.className = cls;
      if (txt != null) n.textContent = String(txt);
      return n;
    }

    function ago(ms) {
      const s = Math.max(0, Math.round((now() - (ms || 0)) / 1000));
      if (!ms) return '—';
      if (s < 60) return s + 's';
      if (s < 3600) return Math.round(s / 60) + 'm';
      if (s < 86400) return Math.round(s / 3600) + 'h';
      return Math.round(s / 86400) + 'd';
    }

    function timeOf(ms) {
      try {
        const d = new Date(ms || now());
        return ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2);
      } catch (_) { return ''; }
    }

    function markup() {
      return '' +
      '<div class="adm-launch" data-ref="launch" role="button" tabindex="0" aria-label="Mở bảng quản trị BAS">' +
        ICO.shield + '<b data-ref="launchN">0</b>' +
      '</div>' +
      '<aside class="adm-panel" data-ref="panel" aria-label="Bảng quản trị BAS">' +
        '<header>' +
          '<span class="brand">EDUNEXT</span><span class="tag">ADMIN</span>' +
          '<span class="status"><i class="dot" data-ref="dot"></i><span data-ref="stat">chưa nối</span></span>' +
          '<button class="x" data-ref="close" title="Đóng (Esc)" aria-label="Đóng">' + ICO.x + '</button>' +
        '</header>' +
        '<div class="bento">' +
          '<section class="kpi"><b data-ref="kOnline">0</b><span>đang chạy</span></section>' +
          '<section class="kpi"><b data-ref="kTotal">0</b><span>tổng máy</span></section>' +
          '<section class="kpi"><b data-ref="kLock">0</b><span>bị khoá</span></section>' +
          '<section class="kpi"><b data-ref="kVer">—</b><span>bản mới</span></section>' +

          '<section class="card login" data-ref="login">' +
            '<div class="row"><input data-ref="key" type="password" placeholder="Khoá quản trị" autocomplete="off" spellcheck="false">' +
            '<button class="go" data-b="login">Vào</button></div>' +
            '<input class="url" data-ref="url" placeholder="https://relay.example.com" spellcheck="false">' +
          '</section>' +

          '<section class="card list">' +
            '<div class="lhead"><b>Gmail đang dùng</b><input data-ref="q" placeholder="Lọc…" spellcheck="false"></div>' +
            '<div class="devs" data-ref="devs"></div>' +
          '</section>' +

          '<section class="card send">' +
            '<div class="row"><select data-ref="target"></select>' +
            '<button class="mini" data-b="refresh" title="Làm mới" aria-label="Làm mới">' + ICO.refresh + '</button></div>' +
            '<div class="seg"><button data-mode="chat">Chat</button><button data-mode="screen">Phủ màn hình</button></div>' +
            '<div class="row"><input data-ref="msg" maxlength="800" placeholder="Nội dung ngắn…" autocomplete="off">' +
            '<button class="go" data-b="send">Gửi</button></div>' +
          '</section>' +

          '<section class="card chat">' +
            '<div class="chead"><b>Chat chung</b><span data-ref="chatAt"></span></div>' +
            '<div class="feed" data-ref="feed"></div>' +
          '</section>' +
        '</div>' +
        '<p class="note">Tự chịu trách nhiệm khi khoá hoặc phủ màn hình · chỉ dùng cho mục đích học tập.</p>' +
      '</aside>';
    }

    function mount() {
      if (mounted) return true;
      if (!document.body && !document.documentElement) return false;
      host = document.createElement('div');
      host.id = 'bas-admin-host';
      sh = host.attachShadow({ mode: 'open' });
      const st = document.createElement('style');
      st.textContent = ADMIN_CSS;
      sh.appendChild(st);
      const wrap = document.createElement('div');
      wrap.innerHTML = markup();
      while (wrap.firstChild) sh.appendChild(wrap.firstChild);
      (document.body || document.documentElement).appendChild(host);
      refs = {};
      sh.querySelectorAll('[data-ref]').forEach((n) => { refs[n.dataset.ref] = n; });
      bind();
      mounted = true;
      render();
      start();
      return true;
    }

    function setOpen(v) {
      open = !!v;
      if (!host) return;
      host.dataset.open = open ? '1' : '0';
      if (open) {
        if (refs.key) refs.key.value = refs.key.value || S.key;
        if (refs.url) refs.url.value = refs.url.value || S.url;
        refresh();
        readChat();
      }
    }

    function bind() {
      const toggle = () => setOpen(!open);
      refs.launch.addEventListener('click', toggle);
      refs.launch.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } });
      refs.close.addEventListener('click', () => setOpen(false));
      refs.panel.addEventListener('click', (e) => {
        const b = e.target && e.target.closest ? e.target.closest('[data-b],[data-mode]') : null;
        if (!b) return;
        if (b.dataset.mode) {
          S.mode = b.dataset.mode;
          render();
          return;
        }
        const act = b.dataset.b;
        if (act === 'login') doLogin();
        else if (act === 'send') doSend();
        else if (act === 'refresh') { refresh(); readChat(); }
      });
      refs.panel.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && e.target && e.target === refs.msg) { e.preventDefault(); doSend(); }
        if (e.key === 'Enter' && e.target && e.target === refs.key) { e.preventDefault(); doLogin(); }
      });
      refs.q.addEventListener('input', () => { S.q = String(refs.q.value || ''); render(); });
      refs.target.addEventListener('change', () => { S.sel = refs.target.value || ''; });
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && open) setOpen(false);
      }, true);
    }

    async function doLogin() {
      const key = refs.key ? String(refs.key.value || '') : '';
      const url = refs.url ? String(refs.url.value || '') : '';
      refs.stat.textContent = 'đang vào…';
      const r = await login(key, url);
      refs.stat.textContent = r.ok ? 'đã nối' : (r.error || 'lỗi');
      render();
    }

    async function doSend() {
      if (!refs.msg) return;
      const text = String(refs.msg.value || '').trim();
      if (!text) return;
      const to = S.sel || '';
      refs.msg.value = '';
      const r = await send(text, to, S.mode);
      if (r.ok) {
        refs.stat.textContent = to ? 'đã gửi · ' + (S.mode === 'screen' ? 'phủ màn hình' : 'chat') : 'đã gửi · ' + (S.mode === 'screen' ? 'tất cả' : 'chat chung');
      } else {
        refs.stat.textContent = r.error || 'không gửi được';
      }
      render();
    }

    async function devLock(d) {
      const r = await action(d.blocked ? 'unblock' : 'block', { id: d.id });
      if (!r.ok && refs.stat) refs.stat.textContent = r.error || 'lỗi';
      else if (refs.stat) refs.stat.textContent = d.blocked ? 'đã mở khoá' : 'đã khoá';
      render();
    }

    function pickTarget(d, mode) {
      S.sel = d.id;
      S.mode = mode;
      if (refs.msg) refs.msg.focus();
      render();
    }

    /* ------------------------------ RENDER ------------------------------ */
    function render() {
      if (!mounted) return;
      const list = S.devices || [];
      const online = list.filter((d) => d.online).length;
      const locked = list.filter((d) => d.blocked).length;

      if (refs.launchN) refs.launchN.textContent = String(online);
      if (refs.dot) refs.dot.className = 'dot' + (S.online ? ' on' : (S.err ? ' err' : ''));
      if (refs.stat) {
        refs.stat.textContent = S.err ? cut(S.err, 26) : (S.online ? (online + '/' + list.length + ' máy') : 'chưa nối');
        refs.stat.title = S.err || '';
      }
      refs.kOnline.textContent = String(online);
      refs.kTotal.textContent = String(list.length);
      refs.kLock.textContent = String(locked);
      refs.kVer.textContent = (S.version && S.version.latest) ? S.version.latest : '—';

      refs.login.hidden = !!S.key && S.online;
      if (refs.key && !refs.key.value) refs.key.value = S.key;
      if (refs.url && !refs.url.value) refs.url.value = S.url;

      /* Mục tiêu gửi: tất cả + từng máy. */
      const want = S.sel;
      refs.target.textContent = '';
      const all = el('option', null, 'Tất cả · chat chung');
      all.value = '';
      refs.target.appendChild(all);
      list.forEach((d) => {
        const o = el('option', null, (d.email || d.id) + (d.blocked ? ' · khoá' : (d.online ? '' : ' · offline')));
        o.value = d.id;
        refs.target.appendChild(o);
      });
      refs.target.value = list.some((d) => d.id === want) ? want : '';
      if (!refs.target.value) S.sel = '';

      sh.querySelectorAll('[data-mode]').forEach((b) => b.classList.toggle('on', b.dataset.mode === S.mode));

      renderDevices(list);

      /* Feed chat chung. */
      const feed = refs.feed;
      const near = feed.scrollTop + feed.clientHeight >= feed.scrollHeight - 20;
      feed.textContent = '';
      if (!S.chat.length) {
        feed.appendChild(el('div', 'empty', S.key ? 'Chưa có tin nào trong chat chung.' : 'Đăng nhập để đọc chat chung.'));
      }
      S.chat.slice(-60).forEach((m) => {
        const n = el('div', 'm' + (m.from === 'admin' ? ' adm' : ''), m.text);
        n.appendChild(el('small', null, timeOf(m.at) + ' · ' + (m.from === 'admin' ? 'quản trị' : (m.email || 'thiết bị'))));
        feed.appendChild(n);
      });
      if (near) feed.scrollTop = feed.scrollHeight;
      if (refs.chatAt) refs.chatAt.textContent = S.chat.length ? 'mới nhất ' + ago((S.chat[S.chat.length - 1] || {}).at) + ' trước' : '';
    }

    function renderDevices(list) {
      const box = refs.devs;
      if (!box) return;
      const q = (S.q || '').toLowerCase().trim();
      const rows = q ? list.filter((d) => String(d.email || '').toLowerCase().indexOf(q) >= 0 || String(d.id).indexOf(q) >= 0) : list;
      box.textContent = '';

      if (!list.length) {
        box.appendChild(el('div', 'empty', S.online
          ? 'Chưa có máy nào gọi relay. Mở một tab EduNext có cài script người dùng.'
          : 'Chưa nối relay. Nhập khoá quản trị và địa chỉ relay ở trên.'));
        return;
      }
      if (!rows.length) {
        box.appendChild(el('div', 'empty', 'Không có Gmail khớp "' + cut(q, 24) + '".'));
        return;
      }

      rows.forEach((d) => {
        const r = el('div', 'dev' + (d.blocked ? ' blocked' : ''));
        r.appendChild(el('i', 'dot' + (d.blocked ? ' err' : (d.online ? ' on' : ''))));
        const m = el('div', 'm');
        m.appendChild(el('b', null, d.email || d.id));
        m.appendChild(el('small', null,
          'v' + (d.version || '?') + ' · ' + (d.online ? 'đang chạy' : ago(d.lastSeen) + ' trước') +
          (d.course ? ' · ' + d.course : '') + (d.lesson ? ' · bài ' + d.lesson : '') +
          (d.warns ? ' · ' + d.warns + ' cảnh cáo' : '')));
        r.appendChild(m);

        const acts = el('div', 'acts');
        const chat = el('button', 'mini', '');
        chat.dataset.a = 'chat';
        chat.title = 'Nhắn riêng (chat)';
        chat.setAttribute('aria-label', 'Nhắn riêng ' + (d.email || d.id));
        chat.innerHTML = ICO.chat;
        chat.addEventListener('click', () => pickTarget(d, 'chat'));

        const screen = el('button', 'mini', '');
        screen.dataset.a = 'screen';
        screen.title = 'Phủ màn hình';
        screen.setAttribute('aria-label', 'Phủ màn hình ' + (d.email || d.id));
        screen.innerHTML = ICO.screen;
        screen.addEventListener('click', () => pickTarget(d, 'screen'));

        const lockBtn = el('button', 'mini ' + (d.blocked ? 'open' : 'lock'), '');
        lockBtn.dataset.a = 'lock';
        lockBtn.title = d.blocked ? 'Mở khoá' : 'Khoá script';
        lockBtn.setAttribute('aria-label', (d.blocked ? 'Mở khoá ' : 'Khoá ') + (d.email || d.id));
        lockBtn.innerHTML = d.blocked ? ICO.unlock : ICO.lock;
        lockBtn.addEventListener('click', () => devLock(d));

        acts.append(chat, screen, lockBtn);
        r.appendChild(acts);
        box.appendChild(r);
      });
    }

    function start() {
      if (tick) clearInterval(tick);
      if (chatTick) clearInterval(chatTick);
      tick = setInterval(() => { if (S.key) refresh(); }, 6000);
      chatTick = setInterval(() => { if (S.key && (open || S.chat.length)) readChat(); }, 5000);
      if (S.key) { login(S.key, S.url); }
      else discover().then((u) => { if (u && S.key) login(S.key, u); else render(); });
    }

    return { mount, render, open: () => setOpen(true), close: () => setOpen(false) };
  })();

  /* Gắn sau khi trang có body; nếu chưa có thì chờ. */
  function bootAdmin() {
    if (AdminUI.mount()) return;
    const t = setInterval(() => {
      if (AdminUI.mount()) clearInterval(t);
    }, 400);
    setTimeout(() => clearInterval(t), 30000);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bootAdmin, { once: true });
  else bootAdmin();

  try {
    const W = (typeof unsafeWindow !== 'undefined' && unsafeWindow) || window;
    W.__BAS_ADMIN__ = { version: ADM.VERSION, state: S, refresh, login, send, action, readChat, ui: AdminUI };
  } catch (_) { /* không gắn được lên window */ }
})();
