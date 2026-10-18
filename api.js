/**
 * API.js — Client-side bridge between the app and the MongoDB backend
 * Replaces the localStorage DB class when running in hosted mode.
 * 
 * This file is loaded BEFORE core.js.
 * It sets window._API_MODE = true when a backend is detected,
 * and patches the DB object to use fetch() instead of localStorage.
 */

const API = (() => {
  const BASE = '/api';
  let _token = localStorage.getItem('_erp_token') || null;
  let _user  = null;

  // ── Token helpers ───────────────────────────────────────────────
  function setToken(token) {
    _token = token;
    localStorage.setItem('_erp_token', token);
  }
  function clearToken() {
    _token = null;
    localStorage.removeItem('_erp_token');
  }
  function getUser() { return _user; }

  // ── Wake / Cold-Start Indicator ──────────────────────────────────
  function setWakeBanner(visible, msg) {
    let el = document.getElementById('erp-cloud-wake-banner');
    if (!visible) {
      if (el) el.remove();
      return;
    }
    if (!el) {
      el = document.createElement('div');
      el.id = 'erp-cloud-wake-banner';
      el.style.cssText = 'position:fixed;top:12px;left:50%;transform:translateX(-50%);background:#0f172a;color:#f8fafc;padding:7px 18px;border-radius:24px;font-size:12px;font-weight:600;box-shadow:0 4px 16px rgba(0,0,0,0.3);z-index:999999;display:flex;align-items:center;gap:10px;border:1px solid #3b82f6;transition:all 0.3s';
      document.body.appendChild(el);
    }
    const isAR = typeof T !== 'undefined' && T.isRTL();
    el.innerHTML = `<i class="fas fa-spinner fa-spin" style="color:#60a5fa"></i> <span>${msg || (isAR ? 'جاري الاتصال بالخادم السحابي...' : 'Connexion au serveur cloud en cours...')}</span>`;
  }

  // ── Fetch wrapper ───────────────────────────────────────────────
  async function req(method, path, body, retries = 2) {
    // Don't even try if we have no token (prevents pointless 401s)
    if (!_token && path !== '/auth/login') {
      if (!req._skipped) req._skipped = {};
      if (!req._skipped[path]) {
        console.debug(`[API] No token — skipping ${method} ${path}`);
        req._skipped[path] = true;
      }
      return null;
    }

    const opts = {
      method,
      headers: {
        'Content-Type': 'application/json',
        ..._token ? { Authorization: `Bearer ${_token}` } : {},
      },
    };
    if (body !== undefined) opts.body = JSON.stringify(body);

    const wakeTimer = setTimeout(() => setWakeBanner(true), 2500);

    try {
      const res = await fetch(BASE + path, opts);
      clearTimeout(wakeTimer);
      setWakeBanner(false);
      
      // Token expired — clear it and signal the app gracefully (NO location.reload!)
      if (res.status === 401) {
        clearToken();
        window.dispatchEvent(new CustomEvent('erp:session-expired'));
        return null;
      }

      // Cold start / gateway starting up (Render free tier spin-up)
      if ((res.status === 502 || res.status === 503 || res.status === 504) && retries > 0) {
        setWakeBanner(true);
        await new Promise(r => setTimeout(r, 2000));
        return req(method, path, body, retries - 1);
      }

      const data = await res.json().catch(() => ({}));

      // Concurrent session detected — forced logout (if enabled)
      if (res.status === 403 && (data.code === 'SESSION_TERMINATED' || data.error === 'SESSION_TERMINATED')) {
        clearToken();
        window.dispatchEvent(new CustomEvent('erp:session-terminated', { detail: data.message }));
        return null;
      }

      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      return data;
    } catch (e) {
      clearTimeout(wakeTimer);
      // Auto-retry once on network/fetch errors during spin-up
      if (retries > 0 && (e.name === 'TypeError' || e.message?.includes('fetch'))) {
        setWakeBanner(true);
        await new Promise(r => setTimeout(r, 2000));
        return req(method, path, body, retries - 1);
      }
      setWakeBanner(false);
      console.error(`[API] ${method} ${path}`, e.message);
      throw e;
    }
  }

  // ── Auth ────────────────────────────────────────────────────────
  async function syncCloudToLocal() {
    // Rely on lazy loading for most collections. Only load essentials here.
    const ESSENTIAL = ['users', 'sessions', 'notifications', 'settings'];
    
    if (typeof window.DB !== 'undefined' && window.DB.ensureLoaded) {
      await window.DB.ensureLoaded(ESSENTIAL);
      return;
    }

    const safeSet = (key, val) => {
      try { localStorage.setItem(key, val); }
      catch(e) { console.warn('[Sync] Quota exceeded for', key, '- skipping'); }
    };

    const results = await Promise.allSettled([
      getAll('users').then(data => ({ col: 'users', data })),
      getAll('sessions').then(data => ({ col: 'sessions', data })),
      getAll('notifications').then(data => ({ col: 'notifications', data })),
      getSettings().then(data => ({ col: '_settings', data })),
      getTimbreSlabs().then(data => ({ col: '_timbre_slabs', data }))
    ]);

    for (const result of results) {
      if (result.status !== 'fulfilled' || !result.value) continue;
      const { col, data } = result.value;
      if (col === '_settings') {
        if (data && Object.keys(data).length) safeSet('settings', JSON.stringify(data));
      } else if (col === '_timbre_slabs') {
        if (Array.isArray(data)) safeSet('timbre_slabs_data', JSON.stringify(data));
      } else if (data && Array.isArray(data)) {
        safeSet(col, JSON.stringify(data));
      }
    }
  }


  async function login(username, password) {
    const data = await req('POST', '/auth/login', { username, password });
    if (data?.token) {
      setToken(data.token);
      _user = data.user;
    }
    return data;
  }

  async function logout() {
    try { await req('POST', '/auth/logout'); } catch (_) { /* best effort */ }
    clearToken();
    _user = null;
  }

  function isLoggedIn() { return !!_token; }

  // Decode JWT to get user without a server call
  function decodeToken(token) {
    try {
      const payload = token.split('.')[1];
      return JSON.parse(atob(payload));
    } catch { return null; }
  }

  function initFromToken() {
    if (_token) {
      const decoded = decodeToken(_token);
      if (decoded && decoded.exp * 1000 > Date.now()) {
        _user = { id: decoded.id, name: decoded.name, username: decoded.username, role: decoded.role, supplierId: decoded.supplierId || null };
        return true;
      } else {
        clearToken();
        return false;
      }
    }
    return false;
  }

  // ── Data CRUD ───────────────────────────────────────────────────
  async function get(path) { return req('GET', path); }
  async function getAll(col, qs='') {
    const res = await req('GET', `/data/${col}${qs}`);
    if (res === null || res === undefined) return null; // Never return empty array on failure!
    return Array.isArray(res) ? res : [];
  }
  async function getById(col,id) { return req('GET',    `/data/${col}/${id}`); }
  async function insert(col,doc) { return req('POST',   `/data/${col}`, doc); }
  async function update(col,id,patch) { return req('PATCH', `/data/${col}/${id}`, patch); }
  async function remove(col,id)  { return req('DELETE', `/data/${col}/${id}`); }
  async function bulkSync(col, items) { return req('PUT', `/data/${col}/bulk`, items); }
  async function getSettings() {
    const res = await req('GET', '/data/settings/main');
    if (res === null || res === undefined) return null;
    return res;
  }
  async function saveSettings(patch){ return req('PATCH',  '/data/settings/main', patch); }
  async function getTimbreSlabs() {
    const res = await req('GET', '/data/timbre-slabs');
    if (res === null || res === undefined) return null;
    return Array.isArray(res) ? res : [];
  }
  async function saveTimbreSlabs(slabs){ return req('PUT', '/data/timbre-slabs', slabs); }

  // ── Backup ──────────────────────────────────────────────────────
  async function listBackups()      { return req('GET',    '/backup'); }
  async function createBackup(lbl)  { return req('POST',   '/backup', { label: lbl }); }
  async function restoreBackup(id)  { return req('POST',   `/backup/${id}/restore`); }
  async function deleteBackup(id)   { return req('DELETE', `/backup/${id}`); }
  async function closeDayBackup()   { return req('POST',   '/backup/close-day'); }

  // ── Health check & Keep-Alive ─────────────────────────────────────
  async function ping() {
    try {
      const r = await fetch('/api/health', { signal: AbortSignal.timeout(4000) });
      return r.ok;
    } catch { return false; }
  }

  // Prevent Render free tier from going to sleep during active work
  setInterval(() => {
    if (_token) {
      fetch('/api/health', { signal: AbortSignal.timeout(5000) }).catch(() => {});
    }
  }, 4 * 60 * 1000); // every 4 minutes

  return {
    syncCloudToLocal, login, logout, isLoggedIn, getUser, initFromToken,
    get, getAll, getById, insert, update, remove, bulkSync,
    getSettings, saveSettings, getTimbreSlabs, saveTimbreSlabs,
    listBackups, createBackup, restoreBackup, deleteBackup, closeDayBackup,
    ping,
    _req: req, // exposed for admin utility calls
  };
})();

window.API = API;
