/* ═══════════════════════════════════════════════════════════════════════
 * MAINTENANCE HUB v2 — Vidange-first rework of the "Maintenance" tab.
 *
 *  Built from how the fleet really uses the DB: ~97 % of entries are AUTO-detected
 *  by the GPS maintenance zones, only a handful are typed by hand, and most auto
 *  "Maintenance Générale" rows are just visits that were never qualified.
 *
 *  Views
 *   1. Flotte     — vidange status of every truck (click a truck → its file)
 *   2. À valider  — auto-detections + open orders waiting for a human decision
 *   3. Camion     — per-truck file: KPIs, interval chart, full timeline (vidange + other)
 *   4. Journal    — everything, with filters
 *
 *  Backend: /api/maintenance (+close, +:id/cancel, +:id/reopen, +:id/classify, +delete)
 * ═══════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var S = {
    view: 'todo',            // todo | pending | truck | history
    logs: [], loadedAt: 0, loading: false, error: '',
    todoFilter: 'all',       // all | urgent | soon | ok | nohist
    search: '',
    truck: '',               // deviceId of the open truck file
    tFilter: 'all',          // truck timeline: all | vidange | other
    pAll: false,             // pending: also show auto entries older than 30 days
    hType: '', hStatus: '', hFrom: '', hTo: '',
    sel: {},                 // selected maintenance IDs for bulk .docx download
    dlBusy: false
  };
  var TTL = 20000;
  var OTHER_TYPES = ['Plaquettes de Frein', 'Maintenance Générale', 'Pneumatiques', 'Filtres', 'Batterie'];

  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function num(n) { return Number(n || 0).toLocaleString('fr-FR'); }
  function toast(m, t) { if (window.showToast) window.showToast(m, t || 'info'); else console.log(m); }
  function base() { return (window.FLEET_CONFIG && FLEET_CONFIG.API && FLEET_CONFIG.API.baseUrl) || ''; }
  function code() {
    return localStorage.getItem('fleetAccessCode') || (window.ui && ui.currentCode) ||
      (window.FLEET_CONFIG && FLEET_CONFIG.accessCode) || '';
  }
  async function api(path, method, body) {
    var h = { 'Content-Type': 'application/json' };
    var c = code(); if (c) h['x-access-code'] = c;
    var r = await fetch(base() + path, { method: method || 'GET', headers: h, body: body ? JSON.stringify(body) : undefined });
    var j = null; try { j = await r.json(); } catch (e) { /* no body */ }
    if (!r.ok) throw new Error((j && j.error) || ('HTTP ' + r.status));
    return j;
  }
  function idOf(x) { return x.id || x._id; }
  function stOf(x) {
    var s = String(x.status || 'en_cours').toLowerCase();
    if (s === 'termine' || s === 'terminé' || s === 'done' || s === 'completed') return 'termine';
    if (s === 'annule' || s === 'annulé' || s === 'cancelled') return 'annule';
    return 'en_cours';
  }
  function isVid(x) { return /vidange/i.test(x.type || ''); }
  function dateOf(x) { return new Date(x.date || x.createdAt || 0); }
  function fmtD(d) { d = new Date(d); return isNaN(d) ? '—' : d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' }); }
  function age(x) {
    var end = stOf(x) === 'en_cours' ? new Date() : new Date(x.exitDate || x.date);
    var ms = end - dateOf(x); if (!(ms > 0)) return '0h';
    var d = Math.floor(ms / 86400000), h = Math.floor((ms % 86400000) / 3600000);
    return d > 0 ? d + 'j ' + h + 'h' : h + 'h';
  }
  function ageDays(x) { return (new Date() - dateOf(x)) / 86400000; }
  function trucks() { try { return (window.app && app.getAllTrucks()) || []; } catch (e) { return []; } }
  function truckById(id) { return trucks().find(function (k) { return String(k.id) === String(id); }); }
  function truckCfg(devId) {
    if (typeof window.getTruckConfig === 'function' && devId) return window.getTruckConfig(String(devId));
    return (window.FLEET_CONFIG && FLEET_CONFIG.DEFAULT_TRUCK_CONFIG) || {};
  }
  function rotKm(devId) {
    var cfg = truckCfg(devId);
    return Number(cfg.vidangeRotationKm) || 25000;
  }
  function closestPackKm(km, devId) {
    var odo = Math.round(Number(km) || 0), cfg = truckCfg(devId);
    var start = cfg.vidangeStartKm != null ? parseInt(cfg.vidangeStartKm, 10) : 5000;
    var rot = cfg.vidangeRotationKm != null ? parseInt(cfg.vidangeRotationKm, 10) : 25000;
    if (!Number.isFinite(start) || start < 0) start = 5000;
    if (!Number.isFinite(rot) || rot <= 0) rot = 25000;
    if (odo <= 0 || odo <= start) return start > 0 ? start : rot;
    return start + Math.max(0, Math.round((odo - start) / rot)) * rot;
  }
  function effType(x) {
    var raw = String((x && x.type) || '').trim();
    if (/vidange/i.test(raw)) return 'Vidange';
    if (/plaquette|frein/i.test(raw)) return 'Plaquettes de Frein';
    if (x && x.isAuto && !x.verified && (!raw || /^maintenance(\s*g[eé]n[eé]rale)?$/i.test(raw))) return 'Plaquettes de Frein';
    return raw || 'Plaquettes de Frein';
  }
  function root() { return $('vidangeSectionContainer'); }

  // ───────────────────────── CSS ─────────────────────────
  function css() {
    var old = $('mhCss'); if (old) old.remove();
    var st = document.createElement('style'); st.id = 'mhCss';
    st.textContent = [
      '#vidangeSection .controls-section>h2{display:none}',
      '#vidangeSection .controls-section{background:transparent;border:none;box-shadow:none;padding:0}',
      '.mh{--c-bg:var(--bg-elevated,#1a2332);--c-b:var(--border,#334155);--c-t:var(--text-primary,#e2e8f0);--c-m:var(--text-muted,#94a3b8)}',
      '.mh-kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin-bottom:14px}',
      '.mh-kpi{background:var(--c-bg);border:1px solid var(--c-b);border-radius:14px;padding:12px 14px;cursor:pointer;transition:.15s;position:relative;overflow:hidden}',
      '.mh-kpi:before{content:"";position:absolute;left:0;top:0;bottom:0;width:4px;background:var(--k,#64748b)}',
      '.mh-kpi:hover{transform:translateY(-2px)}',
      '.mh-kpi b{display:block;font-size:24px;font-weight:800;line-height:1.1;color:var(--k,#64748b)}',
      '.mh-kpi span{font-size:10px;text-transform:uppercase;letter-spacing:.5px;color:var(--c-m);font-weight:700}',
      '.mh-tabs{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:14px;border-bottom:1px solid var(--c-b);padding-bottom:10px;align-items:center}',
      '.mh-tab{padding:8px 16px;border-radius:999px;border:1.5px solid var(--c-b);background:transparent;color:var(--text-secondary,#94a3b8);font-weight:700;font-size:12px;cursor:pointer;font-family:inherit}',
      '.mh-tab.on{background:#f59e0b;border-color:#f59e0b;color:#111}',
      '.mh-tab i{margin-right:6px}',
      '.mh-tab em{font-style:normal;background:rgba(0,0,0,.28);color:#fff;border-radius:9px;padding:0 7px;margin-left:6px;font-size:10px}',
      '.mh-tab em.hot{background:#ef4444}',
      '.mh-bar{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:12px}',
      '.mh input,.mh select,.mh textarea{padding:7px 10px;border-radius:8px;border:1px solid var(--c-b);background:var(--bg-surface,#0f172a);color:var(--c-t);font-size:12px;font-family:inherit}',
      '.mh-pill{padding:5px 12px;border-radius:999px;border:1.5px solid var(--c-b);background:transparent;color:var(--text-secondary,#94a3b8);font-size:11px;font-weight:700;cursor:pointer;font-family:inherit}',
      '.mh-pill.on{background:#0284c7;border-color:#0284c7;color:#fff}',
      '.mh-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(310px,1fr));gap:14px}',
      '.mh-card{background:var(--c-bg);border:1px solid var(--c-b);border-left:4px solid var(--mhc,#64748b);border-radius:14px;padding:14px;display:flex;flex-direction:column;gap:8px}',
      '.mh-card h4{margin:0;font-size:15px;font-weight:800;color:var(--c-t)}',
      '.mh-link{cursor:pointer;text-decoration:underline dotted}.mh-link:hover{color:#f59e0b}',
      '.mh-row{display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap}',
      '.mh-sub{font-size:11px;color:var(--c-m)}',
      '.mh-badge{font-size:10px;font-weight:800;padding:2px 9px;border-radius:999px;color:#fff;background:var(--mhc,#64748b);white-space:nowrap}',
      '.mh-tag{font-size:10px;font-weight:700;padding:1px 7px;border-radius:6px;background:rgba(148,163,184,.18);color:var(--c-m);white-space:nowrap}',
      '.mh-bar2{height:7px;border-radius:5px;background:rgba(148,163,184,.25);overflow:hidden}',
      '.mh-bar2>div{height:100%;background:var(--mhc,#64748b);border-radius:5px}',
      '.mh-acts{display:flex;gap:6px;flex-wrap:wrap;margin-top:4px;align-items:center}',
      '.mh-btn{padding:6px 12px;border-radius:8px;border:1px solid var(--c-b);background:var(--bg-surface,#0f172a);color:var(--c-t);font-size:11px;font-weight:700;cursor:pointer;font-family:inherit}',
      '.mh-btn:hover{filter:brightness(1.2)}',
      '.mh-btn.ok{background:#16a34a;border-color:#16a34a;color:#fff}',
      '.mh-btn.warn{background:#f59e0b;border-color:#f59e0b;color:#111}',
      '.mh-btn.bad{color:#f87171;border-color:rgba(248,113,113,.5)}',
      '.mh-btn.grow{flex:1}',
      '.mh-btn[disabled]{opacity:.5;cursor:wait}',
      '.mh-empty{text-align:center;padding:44px 16px;color:var(--c-m);grid-column:1/-1}',
      '.mh-empty i{font-size:34px;opacity:.4;display:block;margin-bottom:10px}',
      '.mh-tl{display:flex;flex-direction:column;gap:10px}',
      '.mh-item{display:grid;grid-template-columns:auto 1fr auto;gap:12px;align-items:center;background:var(--c-bg);border:1px solid var(--c-b);border-left:4px solid var(--mhc,#64748b);border-radius:12px;padding:12px 14px}',
      '.mh-ic{width:38px;height:38px;border-radius:10px;display:flex;align-items:center;justify-content:center;background:rgba(148,163,184,.15);color:var(--mhc,#64748b)}',
      '.mh-panel{background:var(--c-bg);border:1px solid var(--c-b);border-radius:14px;padding:14px;margin-bottom:14px}',
      '.mh-panel h5{margin:0 0 10px;font-size:12px;text-transform:uppercase;letter-spacing:.6px;color:var(--c-m)}',
      '.mh-insight{display:flex;gap:10px;align-items:flex-start;padding:10px 12px;border-radius:10px;background:rgba(14,165,233,.1);border:1px solid rgba(14,165,233,.3);font-size:12px;margin-bottom:14px}',
      '.mh-insight.warn{background:rgba(245,158,11,.1);border-color:rgba(245,158,11,.35)}',
      '.mh-insight.bad{background:rgba(239,68,68,.1);border-color:rgba(239,68,68,.35)}',
      '.mh-insight.good{background:rgba(34,197,94,.1);border-color:rgba(34,197,94,.35)}',
      '@media(max-width:720px){.mh-item{grid-template-columns:auto 1fr}.mh-item .mh-acts{grid-column:1/-1}}',
      '.mh-ov{position:fixed;inset:0;background:rgba(0,0,0,.65);z-index:10050;display:flex;align-items:center;justify-content:center;padding:16px}',
      '.mh-dlg{background:var(--bg-elevated,#1a2332);color:var(--c-t,#e2e8f0);border:1px solid var(--border,#334155);border-radius:16px;width:100%;max-width:470px;padding:20px;max-height:92vh;overflow:auto}',
      '.mh-dlg h3{margin:0 0 4px;font-size:17px}',
      '.mh-dlg label{display:block;font-size:11px;font-weight:700;color:var(--text-muted,#94a3b8);margin:10px 0 4px}',
      '.mh-dlg input,.mh-dlg select,.mh-dlg textarea{width:100%;box-sizing:border-box;padding:7px 10px;border-radius:8px;border:1px solid var(--border,#334155);background:var(--bg-surface,#0f172a);color:var(--text-primary,#e2e8f0);font-size:12px;font-family:inherit}',
      '.mh-types{display:flex;gap:6px;flex-wrap:wrap;margin-top:4px}',
      '.mh-note{font-size:11px;padding:8px 10px;border-radius:8px;background:rgba(245,158,11,.12);color:#fbbf24;margin-top:10px}'
    ].join('\n');
    document.head.appendChild(st);
  }

  // ───────────────────────── DATA ─────────────────────────
  async function load(force) {
    if (S.loading) return;
    if (!force && S.loadedAt && Date.now() - S.loadedAt < TTL) return;
    S.loading = true;
    try {
      var j = await api('/api/maintenance?limit=2000');
      S.logs = Array.isArray(j) ? j : (j.data || []);
      if (window.ui) window.ui.allMaintenanceLogs = S.logs;
      S.loadedAt = Date.now(); S.error = '';
    } catch (e) { S.error = e.message; }
    S.loading = false;
    render();
  }

  async function syncAfterChange() {
    var u = window.ui;
    try { if (u && u.loadSettingsFromCloud) await u.loadSettingsFromCloud(); } catch (e) { /* ignore */ }
    try { if (window.app && app.forceRecalculateVidanges) app.forceRecalculateVidanges(); } catch (e) { /* ignore */ }
    try { if (u && u.loadActiveMaintenanceOrders) await u.loadActiveMaintenanceOrders(); } catch (e) { /* ignore */ }
    try { if (u && u.renderStats) u.renderStats(); } catch (e) { /* ignore */ }
    S.loadedAt = 0; S.loading = false;
    await load(true);
  }

  function isPending(x) {
    var s = stOf(x);
    if (s === 'annule') return false;
    if (s === 'en_cours') return true;
    if (x.isAuto && !x.verified) return S.pAll || ageDays(x) <= 30;
    return false;
  }

  // Per-truck vidange statistics derived from real entries (+ current rotation anchor)
  function truckStats(devId) {
    var ents = S.logs.filter(function (x) {
      return String(x.deviceId) === String(devId) && isVid(x) && stOf(x) !== 'annule' && Number(x.odometer) > 0;
    }).sort(function (a, b) { return dateOf(a) - dateOf(b); });
    var pts = ents.map(function (x) { return { km: Number(x.odometer), date: dateOf(x), cost: Number(x.cost) || 0, id: idOf(x) }; });
    var ovr = (window.FLEET_CONFIG && (FLEET_CONFIG.vidangeOverrides || FLEET_CONFIG.VIDANGE_OVERRIDES) || {})[String(devId)];
    if (ovr && Number(ovr.lastVidangeKm) > 0) {
      var km = Number(ovr.lastVidangeKm);
      var near = pts.some(function (p) { return Math.abs(p.km - km) <= 50; });
      if (!near) pts.push({ km: km, date: new Date(ovr.confirmedAt || Date.now()), cost: 0, synthetic: true });
      pts.sort(function (a, b) { return a.date - b.date; });
    }
    var intervals = [], dupes = 0;
    for (var i = 1; i < pts.length; i++) {
      var dk = pts[i].km - pts[i - 1].km;
      var dd = Math.max(1, Math.round((pts[i].date - pts[i - 1].date) / 86400000));
      if (dk < 1000) { dupes++; continue; }       // same service logged twice
      intervals.push({ km: dk, days: dd, from: pts[i - 1], to: pts[i] });
    }
    var sum = function (arr, k) { return arr.reduce(function (s, v) { return s + v[k]; }, 0); };
    var last = pts.length ? pts[pts.length - 1] : null;
    return {
      points: pts, intervals: intervals, dupes: dupes, count: ents.length,
      avgKm: intervals.length ? Math.round(sum(intervals, 'km') / intervals.length) : 0,
      avgDays: intervals.length ? Math.round(sum(intervals, 'days') / intervals.length) : 0,
      lastKm: last ? last.km : 0, lastDate: last ? last.date : null,
      cost: ents.reduce(function (s, x) { return s + (Number(x.cost) || 0); }, 0)
    };
  }

  function counts() {
    var c = { pending: 0, active: 0, urgent: 0, soon: 0, nohist: 0 };
    S.logs.forEach(function (x) { if (isPending(x)) c.pending++; if (stOf(x) === 'en_cours') c.active++; });
    trucks().forEach(function (k) {
      if (!k.vidange) return;
      var v = k.vidange, kmU = Number(v.kmUntilNext);
      if (v.alert) c.urgent++; else if (kmU < (Number(v.alertKm) || 500) + 3000) c.soon++;
      if (!v.lastKm) c.nohist++;
    });
    return c;
  }

  // ───────────────────────── RENDER SHELL ─────────────────────────
  function render() {
    var el = root(); if (!el) return;
    css();
    var c = counts();
    var kp = function (v, l, color, view, extra) {
      return '<div class="mh-kpi" style="--k:' + color + '" onclick="MaintenanceHub.go(\'' + view + '\'' + (extra ? ',\'' + extra + '\'' : '') + ')"><b>' + v + '</b><span>' + l + '</span></div>';
    };
    var tab = function (v, ic, l, n, hot) {
      return '<button class="mh-tab' + (S.view === v ? ' on' : '') + '" onclick="MaintenanceHub.go(\'' + v + '\')"><i class="fa-solid ' + ic + '"></i>' + l +
        (n ? '<em' + (hot ? ' class="hot"' : '') + '>' + n + '</em>' : '') + '</button>';
    };
    var h = '<div class="mh"><div class="mh-kpis">' +
      kp(c.urgent, 'Vidanges urgentes', '#ef4444', 'todo', 'urgent') +
      kp(c.soon, 'Bientôt dues', '#f59e0b', 'todo', 'soon') +
      kp(c.pending, 'À valider', c.pending ? '#0ea5e9' : '#22c55e', 'pending') +
      kp(c.nohist, 'Sans vidange enregistrée', c.nohist ? '#a78bfa' : '#22c55e', 'todo', 'nohist') +
      '</div><div class="mh-tabs">' +
      tab('todo', 'fa-oil-can', 'Flotte') +
      tab('pending', 'fa-inbox', 'À valider', c.pending, c.pending > 0) +
      tab('truck', 'fa-truck', 'Fiche camion') +
      tab('history', 'fa-clock-rotate-left', 'Journal') +
      '<span style="flex:1"></span>' +
      '<button class="mh-btn" onclick="ui.openVidangeScanModal()" title="Rechercher les passages en atelier dans l\'historique GPS"><i class="fa-solid fa-satellite-dish"></i> Scan GPS</button>' +
      '<button class="mh-btn warn" onclick="MaintenanceHub.newVidange()"><i class="fa-solid fa-plus"></i> Nouvelle intervention</button>' +
      '<button class="mh-btn" onclick="MaintenanceHub.refresh()" title="Actualiser"><i class="fa-solid fa-rotate' + (S.loading ? ' fa-spin' : '') + '"></i></button>' +
      '</div>';
    if (S.error) h += '<div class="mh-insight bad">Erreur de chargement : ' + esc(S.error) + '</div>';
    if (S.view === 'todo') h += viewTodo();
    else if (S.view === 'pending') h += viewPending();
    else if (S.view === 'truck') h += viewTruck();
    else h += viewHistory();
    h += '</div>';
    var focus = document.activeElement && document.activeElement.id;
    var pos = focus && document.activeElement.selectionStart;
    el.innerHTML = h;
    if (focus && $(focus) && /^mh/.test(focus)) { $(focus).focus(); try { $(focus).setSelectionRange(pos, pos); } catch (e) { /* not text */ } }
  }

  function activeVidangeFor(devId) {
    return S.logs.find(function (x) { return stOf(x) === 'en_cours' && isVid(x) && String(x.deviceId) === String(devId); });
  }
  function cls(t) {
    var v = t.vidange, k = Number(v.kmUntilNext);
    if (v.alert) return 'urgent';
    if (k < (Number(v.alertKm) || 500) + 3000) return 'soon';
    return 'ok';
  }

  // ───────────────────────── VIEW 1 : FLOTTE ─────────────────────────
  function viewTodo() {
    var list = trucks().filter(function (t) { return t.vidange; });
    var q = S.search.toLowerCase();
    if (q) list = list.filter(function (t) { return String(t.name || '').toLowerCase().indexOf(q) >= 0; });
    var all = list.length;
    if (S.todoFilter === 'nohist') list = list.filter(function (t) { return !t.vidange.lastKm; });
    else if (S.todoFilter !== 'all') list = list.filter(function (t) { return cls(t) === S.todoFilter; });
    list.sort(function (a, b) { return Number(a.vidange.kmUntilNext) - Number(b.vidange.kmUntilNext); });
    var pill = function (v, l) { return '<button class="mh-pill' + (S.todoFilter === v ? ' on' : '') + '" onclick="MaintenanceHub.setTodo(\'' + v + '\')">' + l + '</button>'; };
    var h = '<div class="mh-bar">' + pill('all', 'Tous (' + all + ')') + pill('urgent', '🔴 Urgent') + pill('soon', '🟡 Bientôt') + pill('ok', '✅ OK') + pill('nohist', '❔ Sans historique') +
      '<span style="flex:1"></span><input id="mhSearch" placeholder="Rechercher un camion…" value="' + esc(S.search) + '" oninput="MaintenanceHub.setSearch(this.value)"></div>';
    if (!list.length) return h + '<div class="mh-grid"><div class="mh-empty"><i class="fa-solid fa-circle-check"></i>Aucun camion dans cette catégorie</div></div>';
    h += '<div class="mh-grid">' + list.map(function (t) {
      var v = t.vidange, k = Number(v.kmUntilNext), c = cls(t);
      var color = c === 'urgent' ? '#ef4444' : c === 'soon' ? '#f59e0b' : '#22c55e';
      var label = c === 'urgent' ? (k < 0 ? 'EN RETARD' : 'URGENT') : c === 'soon' ? 'BIENTÔT' : 'OK';
      var rk = Number(v.rotKm) || rotKm();
      var pct = Math.max(0, Math.min(100, Math.round((1 - k / rk) * 100)));
      var act = activeVidangeFor(t.id);
      var st = truckStats(t.id);
      var btn = act
        ? '<button class="mh-btn ok grow" onclick="MaintenanceHub.closeDlg(\'' + esc(idOf(act)) + '\')"><i class="fa-solid fa-check"></i> Terminer la vidange en cours</button>'
        : (c !== 'ok' ? '<button class="mh-btn warn grow" onclick="MaintenanceHub.newVidange(\'' + esc(t.id) + '\')"><i class="fa-solid fa-oil-can"></i> Déclarer la vidange</button>' : '');
      return '<div class="mh-card" style="--mhc:' + color + '">' +
        '<div class="mh-row"><h4><span class="mh-link" onclick="MaintenanceHub.openTruck(\'' + esc(t.id) + '\')" title="Ouvrir la fiche">' + esc(t.name) + '</span></h4><span class="mh-badge">' + (act ? 'EN COURS' : label) + '</span></div>' +
        '<div class="mh-bar2"><div style="width:' + pct + '%"></div></div>' +
        '<div class="mh-row"><span class="mh-sub">' + (k < 0 ? '<b style="color:' + color + '">Retard ' + num(Math.abs(k)) + ' km</b>' : 'Reste <b>' + num(k) + ' km</b>') + '</span>' +
        '<span class="mh-sub">Prochaine : <b>' + esc(v.nextKm) + ' km</b></span></div>' +
        '<div class="mh-row"><span class="mh-sub">Actuel : ' + num(t.odometer) + ' km</span>' +
        '<span class="mh-sub">Dernière : ' + (v.lastKm ? num(v.lastKm) + ' km' : '<i>non enregistrée</i>') + '</span></div>' +
        '<div class="mh-row"><span class="mh-sub">' + st.count + ' vidange(s) enregistrée(s)' + (st.avgKm ? ' · moy. ' + num(st.avgKm) + ' km' : '') + '</span>' +
        '<span class="mh-link mh-sub" onclick="MaintenanceHub.openTruck(\'' + esc(t.id) + '\')">Fiche →</span></div>' +
        (btn ? '<div class="mh-acts">' + btn + '</div>' : '') + '</div>';
    }).join('') + '</div>';
    return h;
  }

  // ───────────────────────── VIEW 2 : À VALIDER ─────────────────────────
  function selIds() { return Object.keys(S.sel).filter(function (k) { return S.sel[k]; }); }
  function selBarHtml(visList) {
    var ids = selIds(), visIds = (visList || []).filter(function (x) { return stOf(x) !== 'annule'; }).map(function (x) { return String(idOf(x)); });
    var allOn = visIds.length > 0 && visIds.every(function (k) { return !!S.sel[k]; });
    var bar = visIds.length ? '<label class="mh-sub" style="display:inline-flex;align-items:center;gap:6px;cursor:pointer;font-weight:700"><input type="checkbox" ' + (allOn ? 'checked' : '') + ' onchange="MaintenanceHub.selAll(' + JSON.stringify(visIds).replace(/"/g, '\'') + ',this.checked)"> Tout cocher (' + visIds.length + ')</label>' : '';
    if (!ids.length) return bar;
    return bar + '<div style="display:inline-flex;align-items:center;gap:6px;flex-wrap:wrap;background:rgba(14,165,233,.14);border:1px solid rgba(14,165,233,.4);padding:5px 10px;border-radius:10px">' +
      '<b style="font-size:12px;color:#38bdf8">' + ids.length + ' sélectionnée(s)</b>' +
      '<button class="mh-btn warn" ' + (S.dlBusy ? 'disabled' : '') + ' onclick="MaintenanceHub.downloadBulk(\'files\')"><i class="fa-solid fa-file-word"></i> Télécharger ' + ids.length + ' DA (.docx)</button>' +
      (ids.length > 1 ? '<button class="mh-btn" ' + (S.dlBusy ? 'disabled' : '') + ' onclick="MaintenanceHub.downloadBulk(\'zip\')"><i class="fa-solid fa-file-zipper"></i> Pack ZIP</button>' : '') +
      '<button class="mh-btn bad" onclick="MaintenanceHub.clearSel()" title="Effacer la sélection">✕</button></div>';
  }

  function viewPending() {
    var list = S.logs.filter(isPending).sort(function (a, b) { return dateOf(b) - dateOf(a); });
    var hidden = S.pAll ? 0 : S.logs.filter(function (x) { return stOf(x) !== 'annule' && x.isAuto && !x.verified && stOf(x) !== 'en_cours' && ageDays(x) > 30; }).length;
    var h = '<div class="mh-insight"><i class="fa-solid fa-circle-info" style="margin-top:2px"></i><div>' +
      '<b>Détections automatiques &amp; Demandes de Service (.docx).</b> Validez une vidange, rectifiez en <b>Plaquettes de Frein</b> (le document s\'adapte immédiatement), ou cochez plusieurs camions pour télécharger toutes les DA Word d\'un coup.</div></div>';
    h += '<div class="mh-bar"><span class="mh-sub">' + list.length + ' à traiter</span> ' + selBarHtml(list) + '<span style="flex:1"></span>' +
      '<label class="mh-sub" style="cursor:pointer"><input type="checkbox" ' + (S.pAll ? 'checked' : '') + ' onchange="MaintenanceHub.togglePAll(this.checked)"> Inclure > 30 jours' + (hidden ? ' (' + hidden + ' masquées)' : '') + '</label></div>';
    if (!list.length) return h + '<div class="mh-grid"><div class="mh-empty"><i class="fa-solid fa-inbox"></i>Rien à valider — tout est à jour 🎉</div></div>';
    h += '<div class="mh-grid">' + list.map(function (x) {
      var rawId = String(idOf(x)), id = esc(rawId), open = stOf(x) === 'en_cours';
      var eType = effType(x), vid = /vidange/i.test(eType), noKm = !(Number(x.odometer) > 0);
      var color = vid ? '#f59e0b' : '#0ea5e9';
      var t = truckById(x.deviceId);
      var packTag = vid && !noKm ? ' · Pack ' + num(closestPackKm(x.odometer, x.deviceId)) + ' km' : '';
      var acts = '';
      if (x.isAuto && !x.verified) {
        acts += (!vid || !noKm)
          ? '<button class="mh-btn ok grow" onclick="MaintenanceHub.quickValidate(\'' + id + '\')"><i class="fa-solid fa-check"></i> Valider</button>'
          : '<button class="mh-btn warn grow" onclick="MaintenanceHub.qualify(\'' + id + '\',\'Vidange\')"><i class="fa-solid fa-check"></i> Saisir km &amp; Valider</button>';
        acts += '<button class="mh-btn" style="border-color:#38bdf8;color:#38bdf8" onclick="MaintenanceHub.downloadDa(\'' + id + '\')" title="Télécharger Demande de Service .docx"><i class="fa-solid fa-file-word"></i> DA .docx</button>' +
          '<button class="mh-btn" onclick="MaintenanceHub.qualify(\'' + id + '\')" title="Changer la prestation"><i class="fa-solid fa-pen"></i></button>' +
          '<button class="mh-btn bad" onclick="MaintenanceHub.cancel(\'' + id + '\')" title="Faux positif"><i class="fa-solid fa-ban"></i></button>';
      } else {
        acts += '<button class="mh-btn ok grow" onclick="MaintenanceHub.closeDlg(\'' + id + '\')"><i class="fa-solid fa-check"></i> Terminer</button>' +
          '<button class="mh-btn" style="border-color:#38bdf8;color:#38bdf8" onclick="MaintenanceHub.downloadDa(\'' + id + '\')" title="Télécharger Demande de Service .docx"><i class="fa-solid fa-file-word"></i> DA .docx</button>' +
          '<button class="mh-btn" onclick="MaintenanceHub.qualify(\'' + id + '\')" title="Changer la prestation"><i class="fa-solid fa-pen"></i></button>' +
          '<button class="mh-btn bad" onclick="MaintenanceHub.cancel(\'' + id + '\')"><i class="fa-solid fa-ban"></i></button>';
      }
      return '<div class="mh-card" style="--mhc:' + color + '">' +
        '<div class="mh-row"><h4 style="display:flex;align-items:center;gap:8px"><input type="checkbox" style="width:16px;height:16px;accent-color:#0ea5e9;cursor:pointer" ' + (S.sel[rawId] ? 'checked' : '') + ' onchange="MaintenanceHub.toggleSel(\'' + id + '\',this.checked)"><span class="mh-link" onclick="MaintenanceHub.openTruck(\'' + esc(x.deviceId) + '\')">' + esc(x.truckName || x.deviceId) + '</span></h4>' +
        '<span class="mh-badge">' + (open && !x.isAuto ? 'EN COURS' : (x.isAuto ? 'AUTO' : 'À VALIDER')) + '</span></div>' +
        '<div class="mh-row"><span><i class="fa-solid ' + (vid ? 'fa-oil-can' : 'fa-wrench') + '" style="color:' + color + '"></i> <b>' + esc(eType) + '</b><span class="mh-sub">' + esc(packTag) + '</span></span>' +
        '<span class="mh-sub">' + fmtD(x.date) + (open ? ' · ' + age(x) : '') + '</span></div>' +
        '<div class="mh-sub">' + (x.location ? '<i class="fa-solid fa-location-dot"></i> ' + esc(x.location) + ' · ' : '') +
        (noKm ? '<b style="color:#f87171">km manquant</b>' : num(x.odometer) + ' km') +
        (t ? ' · actuel ' + num(t.odometer) + ' km' : '') + '</div>' +
        (x.note ? '<div class="mh-sub" style="font-style:italic">« ' + esc(String(x.note).split('\n')[0].slice(0, 120)) + ' »</div>' : '') +
        '<div class="mh-acts">' + acts + '</div></div>';
    }).join('') + '</div>';
    return h;
  }

  // ───────────────────────── VIEW 3 : FICHE CAMION ─────────────────────────
  function chartSvg(st, devId) {
    var iv = st.intervals.slice(-12);
    if (!iv.length) return '<div class="mh-sub" style="padding:16px 0">Pas encore assez de vidanges enregistrées pour tracer des intervalles (il en faut au moins 2).</div>';
    var target = rotKm(devId), W = 560, H = 150, pad = 26;
    var max = Math.max(target * 1.25, Math.max.apply(null, iv.map(function (i) { return i.km; })) * 1.1);
    var bw = Math.min(46, (W - pad * 2) / iv.length - 8);
    var y = function (v) { return H - pad - (v / max) * (H - pad * 1.6); };
    var bars = iv.map(function (i, n) {
      var x = pad + n * ((W - pad * 2) / iv.length) + 4;
      var ratio = i.km / target;
      var col = ratio > 1.1 ? '#ef4444' : ratio < 0.6 ? '#a78bfa' : '#22c55e';
      return '<rect x="' + x + '" y="' + y(i.km) + '" width="' + bw + '" height="' + (H - pad - y(i.km)) + '" rx="4" fill="' + col + '"><title>' + fmtD(i.to.date) + ' · ' + num(i.km) + ' km en ' + i.days + ' j</title></rect>' +
        '<text x="' + (x + bw / 2) + '" y="' + (y(i.km) - 4) + '" font-size="9" text-anchor="middle" fill="#94a3b8">' + Math.round(i.km / 1000) + 'k</text>' +
        '<text x="' + (x + bw / 2) + '" y="' + (H - 10) + '" font-size="8" text-anchor="middle" fill="#64748b">' + fmtD(i.to.date).slice(0, 5) + '</text>';
    }).join('');
    return '<svg viewBox="0 0 ' + W + ' ' + H + '" style="width:100%;max-height:190px">' +
      '<line x1="' + pad + '" x2="' + (W - pad) + '" y1="' + y(target) + '" y2="' + y(target) + '" stroke="#f59e0b" stroke-dasharray="5 4"/>' +
      '<text x="' + (W - pad) + '" y="' + (y(target) - 4) + '" font-size="9" text-anchor="end" fill="#f59e0b">cible ' + num(target) + ' km</text>' + bars + '</svg>';
  }

  function viewTruck() {
    var all = trucks().filter(function (t) { return t.vidange; }).sort(function (a, b) { return String(a.name).localeCompare(String(b.name), 'fr', { numeric: true }); });
    var sel = '<div class="mh-bar"><select id="mhTruckSel" onchange="MaintenanceHub.openTruck(this.value)" style="min-width:240px"><option value="">— Choisir un camion —</option>' +
      all.map(function (t) { return '<option value="' + esc(t.id) + '"' + (String(t.id) === String(S.truck) ? ' selected' : '') + '>' + esc(t.name) + '</option>'; }).join('') + '</select></div>';
    var t = S.truck && truckById(S.truck);
    if (!t) return sel + '<div class="mh-grid"><div class="mh-empty"><i class="fa-solid fa-truck"></i>Choisissez un camion (ou cliquez sur son nom dans la flotte) pour voir tout son historique de vidange.</div></div>';
    var v = t.vidange || {}, k = Number(v.kmUntilNext), c = cls(t), st = truckStats(t.id), rk = Number(v.rotKm) || rotKm(t.id);
    var color = c === 'urgent' ? '#ef4444' : c === 'soon' ? '#f59e0b' : '#22c55e';
    var db = (window.ui && ui.truckDbCache || []).find(function (d) { return String(d.deviceId) === String(t.id); }) || {};
    var kpi = function (val, lbl, col) { return '<div class="mh-kpi" style="--k:' + (col || '#64748b') + ';cursor:default"><b style="font-size:19px">' + val + '</b><span>' + lbl + '</span></div>'; };
    var since = st.lastKm ? Math.max(0, Number(t.odometer) - st.lastKm) : 0;
    var h = sel + '<div class="mh-panel" style="border-left:4px solid ' + color + '"><div class="mh-row"><div><div style="font-size:20px;font-weight:800">' + esc(t.name) + '</div>' +
      '<div class="mh-sub">' + (db.immatriculation ? esc(db.immatriculation) + ' · ' : '') + (db.chassisNumber ? 'Châssis ' + esc(db.chassisNumber) + ' · ' : '') + (db.driverName ? esc(db.driverName) : '') + '</div></div>' +
      '<div class="mh-acts"><button class="mh-btn warn" onclick="MaintenanceHub.newVidange(\'' + esc(t.id) + '\',\'Vidange\')"><i class="fa-solid fa-oil-can"></i> + Vidange</button>' +
      '<button class="mh-btn" onclick="MaintenanceHub.newVidange(\'' + esc(t.id) + '\',\'Plaquettes de Frein\')"><i class="fa-solid fa-plus"></i> + Plaquettes</button>' +
      '<button class="mh-btn" onclick="MaintenanceHub.pdf()"><i class="fa-solid fa-file-pdf"></i> PDF</button></div></div>' +
      '<div class="mh-bar2" style="margin:12px 0 4px;--mhc:' + color + '"><div style="width:' + Math.max(0, Math.min(100, Math.round((1 - k / rk) * 100))) + '%"></div></div>' +
      '<div class="mh-row"><span class="mh-sub">' + (k < 0 ? '<b style="color:' + color + '">En retard de ' + num(Math.abs(k)) + ' km</b>' : 'Reste ' + num(k) + ' km avant la prochaine') + '</span>' +
      '<span class="mh-sub">Prochaine : ' + esc(v.nextKm) + ' km</span></div></div>';
    h += '<div class="mh-kpis">' + kpi(num(t.odometer) + ' km', 'Compteur actuel', '#0ea5e9') +
      kpi(st.lastKm ? num(st.lastKm) + ' km' : '—', 'Dernière vidange' + (st.lastDate ? ' · ' + fmtD(st.lastDate) : ''), '#22c55e') +
      kpi(st.lastKm ? num(since) + ' km' : '—', 'Parcourus depuis', since > rk ? '#ef4444' : '#64748b') +
      kpi(st.avgKm ? num(st.avgKm) + ' km' : '—', 'Intervalle moyen' + (st.avgDays ? ' · ' + st.avgDays + ' j' : ''), '#a78bfa') +
      kpi(st.count, 'Vidanges enregistrées', '#f59e0b') +
      kpi(st.cost ? num(st.cost) + ' DA' : '—', 'Coût cumulé', '#64748b') + '</div>';
    h += insight(t, st, k, rk);
    h += '<div class="mh-panel"><h5>Intervalles entre vidanges (km)</h5>' + chartSvg(st, t.id) + '</div>';
    h += truckTimeline(t.id, st);
    return h;
  }

  function insight(t, st, k, rk) {
    var m = [], type = 'good';
    if (!st.lastKm) { m.push('Aucune vidange enregistrée pour ce camion : le calcul s\'appuie sur l\'échéance théorique. Déclarez la dernière vidange connue pour fiabiliser le suivi.'); type = 'warn'; }
    if (k < 0) { m.push('Vidange en retard de <b>' + num(Math.abs(k)) + ' km</b>.'); type = 'bad'; }
    if (st.avgKm && st.avgKm > rk * 1.1) { m.push('Intervalle moyen <b>' + num(st.avgKm) + ' km</b> au-dessus de la cible (' + num(rk) + ' km) : ce camion dépasse souvent l\'échéance.'); if (type !== 'bad') type = 'warn'; }
    else if (st.avgKm && st.avgKm < rk * 0.6) { m.push('Intervalle moyen <b>' + num(st.avgKm) + ' km</b> très court : vidanges trop fréquentes ou doublons.'); if (type === 'good') type = 'warn'; }
    else if (st.avgKm) m.push('Rythme conforme : intervalle moyen <b>' + num(st.avgKm) + ' km</b> pour une cible de ' + num(rk) + ' km.');
    if (st.dupes) m.push(st.dupes + ' doublon(s) probable(s) (deux vidanges à moins de 1 000 km) ignoré(s) dans les moyennes.');
    if (!m.length) return '';
    return '<div class="mh-insight ' + type + '"><i class="fa-solid fa-lightbulb" style="margin-top:2px"></i><div>' + m.join('<br>') + '</div></div>';
  }

  // one timeline row, shared by truck file and journal
  function rowHtml(x, showTruck, deltaKm) {
    var eType = effType(x);
    var s = stOf(x), rawId = String(idOf(x)), id = esc(rawId), vid = /vidange/i.test(eType);
    var color = s === 'annule' ? '#64748b' : s === 'en_cours' ? '#0ea5e9' : (vid ? '#f59e0b' : '#22c55e');
    var lbl = s === 'termine' ? 'Terminé' : s === 'annule' ? 'Annulé' : 'En cours';
    var acts = '';
    if (s !== 'annule') {
      acts += '<button class="mh-btn" style="border-color:#38bdf8;color:#38bdf8" onclick="MaintenanceHub.downloadDa(\'' + id + '\')" title="Télécharger Demande de Service (.docx)"><i class="fa-solid fa-file-word"></i> DA .docx</button>';
      acts += '<button class="mh-btn" onclick="MaintenanceHub.qualify(\'' + id + '\')" title="Changer la prestation"><i class="fa-solid fa-pen"></i> Rectifier</button>';
    }
    if (s === 'en_cours') acts += '<button class="mh-btn ok" onclick="MaintenanceHub.closeDlg(\'' + id + '\')"><i class="fa-solid fa-check"></i> Terminer</button><button class="mh-btn bad" onclick="MaintenanceHub.cancel(\'' + id + '\')"><i class="fa-solid fa-ban"></i></button>';
    else if (s === 'annule') acts += '<button class="mh-btn" onclick="MaintenanceHub.reopen(\'' + id + '\')"><i class="fa-solid fa-rotate-left"></i> Rouvrir</button>';
    acts += '<button class="mh-btn bad" onclick="ui.deleteMaintenanceEntry(\'' + id + '\')" title="Supprimer"><i class="fa-solid fa-trash"></i></button>';
    var sub = [];
    sub.push(fmtD(x.date) + (s === 'termine' && x.exitDate ? ' → ' + fmtD(x.exitDate) : ''));
    sub.push(age(x));
    if (Number(x.odometer) > 0) sub.push('<b>' + num(x.odometer) + ' km</b>' + (vid ? ' (Pack ' + num(closestPackKm(x.odometer, x.deviceId)) + ' km)' : ''));
    else if (vid) sub.push('<b style="color:#f87171">km manquant</b>');
    if (deltaKm > 0) sub.push('+' + num(deltaKm) + ' km depuis la précédente');
    if (x.location) sub.push(esc(x.location));
    if (x.technician) sub.push(esc(x.technician));
    if (x.cost) sub.push('<b>' + num(x.cost) + ' DA</b>');
    var chk = s !== 'annule' ? '<input type="checkbox" style="width:16px;height:16px;accent-color:#0ea5e9;cursor:pointer;margin-right:4px" ' + (S.sel[rawId] ? 'checked' : '') + ' onchange="MaintenanceHub.toggleSel(\'' + id + '\',this.checked)">' : '';
    return '<div class="mh-item" style="--mhc:' + color + '"><div style="display:flex;align-items:center;gap:6px">' + chk + '<div class="mh-ic"><i class="fa-solid ' + (vid ? 'fa-oil-can' : 'fa-wrench') + '"></i></div></div>' +
      '<div><div class="mh-row" style="justify-content:flex-start;gap:8px">' +
      (showTruck ? '<b class="mh-link" onclick="MaintenanceHub.openTruck(\'' + esc(x.deviceId) + '\')">' + esc(x.truckName || '—') + '</b>' : '') +
      '<b>' + esc(eType) + '</b><span class="mh-badge" style="--mhc:' + color + '">' + lbl + '</span>' +
      (x.isAuto ? '<span class="mh-tag">AUTO' + (x.verified ? ' ✓' : '') + '</span>' : '<span class="mh-tag">manuel</span>') + '</div>' +
      '<div class="mh-sub">' + sub.join(' · ') + '</div></div><div class="mh-acts">' + acts + '</div></div>';
  }

  function truckTimeline(devId, st) {
    var f = S.tFilter;
    var list = S.logs.filter(function (x) { return String(x.deviceId) === String(devId); })
      .filter(function (x) { return f === 'all' || (f === 'vidange' ? isVid(x) : !isVid(x)); })
      .sort(function (a, b) { return dateOf(b) - dateOf(a); });
    var prevKm = {};
    st.points.forEach(function (p, i) { if (p.id) prevKm[p.id] = i > 0 ? p.km - st.points[i - 1].km : 0; });
    var pill = function (v, l) { return '<button class="mh-pill' + (f === v ? ' on' : '') + '" onclick="MaintenanceHub.setT(\'' + v + '\')">' + l + '</button>'; };
    var h = '<div class="mh-bar">' + pill('all', 'Tout (' + S.logs.filter(function (x) { return String(x.deviceId) === String(devId); }).length + ')') + pill('vidange', '🛢 Vidanges') + pill('other', '🔧 Autres (plaquettes…)') + ' ' + selBarHtml(list) + '</div>';
    if (!list.length) return h + '<div class="mh-tl"><div class="mh-empty"><i class="fa-solid fa-folder-open"></i>Aucun enregistrement pour ce camion</div></div>';
    return h + '<div class="mh-tl">' + list.map(function (x) { return rowHtml(x, false, prevKm[idOf(x)] || 0); }).join('') + '</div>';
  }

  // ───────────────────────── VIEW 4 : JOURNAL ─────────────────────────
  function viewHistory() {
    var types = {}; S.logs.forEach(function (x) { if (x.type) types[x.type] = 1; });
    var q = S.search.toLowerCase();
    var list = S.logs.filter(function (x) {
      if (S.hType === '__vid' && !isVid(x)) return false;
      if (S.hType === '__other' && isVid(x)) return false;
      if (S.hType && S.hType.indexOf('__') !== 0 && x.type !== S.hType) return false;
      if (S.hStatus === 'pending' ? !isPending(x) : (S.hStatus && stOf(x) !== S.hStatus)) return false;
      if (S.hFrom && dateOf(x) < new Date(S.hFrom)) return false;
      if (S.hTo && dateOf(x) > new Date(S.hTo + 'T23:59:59')) return false;
      if (q && (String(x.truckName || '') + ' ' + (x.technician || '') + ' ' + (x.location || '')).toLowerCase().indexOf(q) < 0) return false;
      return true;
    }).sort(function (a, b) { return dateOf(b) - dateOf(a); });
    var opt = function (v, l, cur) { return '<option value="' + esc(v) + '"' + (cur === v ? ' selected' : '') + '>' + esc(l) + '</option>'; };
    var visSlice = list.slice(0, 300);
    var h = '<div class="mh-bar">' +
      '<input id="mhSearch" placeholder="Camion, technicien, lieu…" value="' + esc(S.search) + '" oninput="MaintenanceHub.setSearch(this.value)">' +
      '<select onchange="MaintenanceHub.setH(\'hType\',this.value)">' + opt('', 'Tous types', S.hType) + opt('__vid', '🛢 Toutes les vidanges', S.hType) + opt('__other', '🔧 Hors vidange', S.hType) +
      Object.keys(types).sort().map(function (t) { return opt(t, t, S.hType); }).join('') + '</select>' +
      '<select onchange="MaintenanceHub.setH(\'hStatus\',this.value)">' + opt('', 'Tous statuts', S.hStatus) + opt('pending', '📥 À valider', S.hStatus) + opt('en_cours', '⚙️ En cours', S.hStatus) + opt('termine', '✅ Terminé', S.hStatus) + opt('annule', '🚫 Annulé / ignoré', S.hStatus) + '</select>' +
      '<input type="date" value="' + esc(S.hFrom) + '" onchange="MaintenanceHub.setH(\'hFrom\',this.value)">' +
      '<input type="date" value="' + esc(S.hTo) + '" onchange="MaintenanceHub.setH(\'hTo\',this.value)">' +
      '<span class="mh-sub">' + list.length + ' résultat(s) · ' + num(list.reduce(function (s, x) { return s + (Number(x.cost) || 0); }, 0)) + ' DA</span>' +
      '<span style="flex:1"></span><button class="mh-btn" onclick="ui.exportMaintenanceXLSX()"><i class="fa-solid fa-file-excel"></i> Excel</button></div>' +
      (visSlice.length ? '<div class="mh-bar">' + selBarHtml(visSlice) + '</div>' : '');
    if (!list.length) return h + '<div class="mh-tl"><div class="mh-empty"><i class="fa-solid fa-folder-open"></i>Aucun enregistrement</div></div>';
    return h + '<div class="mh-tl">' + visSlice.map(function (x) { return rowHtml(x, true, 0); }).join('') +
      (list.length > 300 ? '<div class="mh-sub" style="text-align:center">300 premiers résultats — affinez les filtres</div>' : '') + '</div>';
  }

  // ───────────────────────── DIALOGS & ACTIONS ─────────────────────────
  function find(id) { return S.logs.find(function (x) { return String(idOf(x)) === String(id); }); }
  function dlg(html) {
    closeOv();
    var ov = document.createElement('div'); ov.className = 'mh-ov'; ov.id = 'mhOv';
    ov.onclick = function (e) { if (e.target === ov) closeOv(); };
    ov.innerHTML = '<div class="mh-dlg">' + html + '</div>';
    document.body.appendChild(ov);
    return ov;
  }
  function closeOv() { var o = $('mhOv'); if (o) o.remove(); }
  function ask(msg, title, icon, btn) {
    return window.ui_showConfirm ? ui_showConfirm(msg, title, icon, btn) : Promise.resolve(confirm(msg));
  }
  function anchorKm(devId) {
    var o = (window.FLEET_CONFIG && (FLEET_CONFIG.vidangeOverrides || FLEET_CONFIG.VIDANGE_OVERRIDES) || {})[String(devId)];
    return o ? Number(o.lastVidangeKm) || 0 : 0;
  }
  function typeOptions(cur) {
    var all = ['Vidange'].concat(OTHER_TYPES);
    if (cur && all.indexOf(cur) < 0 && !/vidange/i.test(cur) && cur !== 'Maintenance Générale') all.push(cur);
    var curN = /vidange/i.test(cur || '') ? 'Vidange' : cur;
    return all.map(function (t) { return '<option' + (t === curN ? ' selected' : '') + '>' + esc(t) + '</option>'; }).join('');
  }

  // Manual intervention (1 single prestation: Vidange, Plaquettes de Frein, Maintenance Générale, etc.)
  function newVidange(devId, presetType) {
    var list = trucks().filter(function (t) { return t.vidange; }).sort(function (a, b) { return String(a.name).localeCompare(String(b.name), 'fr', { numeric: true }); });
    var cur = devId || S.truck || '';
    var t0 = cur && truckById(cur);
    var pType = presetType || 'Vidange';
    dlg('<h3><i class="fa-solid fa-screwdriver-wrench" style="color:#f59e0b"></i> Nouvelle intervention</h3>' +
      '<div class="mh-sub">Une seule prestation par demande (si un camion fait Vidange + Plaquettes, créez une entrée séparée pour Plaquettes).</div>' +
      '<label>Camion</label><select id="mhNvT" onchange="MaintenanceHub.nvPick(this.value)"><option value="">— Choisir —</option>' +
      list.map(function (t) { return '<option value="' + esc(t.id) + '"' + (String(t.id) === String(cur) ? ' selected' : '') + '>' + esc(t.name) + '</option>'; }).join('') + '</select>' +
      '<label>Prestation</label><select id="mhNvType" onchange="MaintenanceHub.nvUpdPrev()">' + typeOptions(pType) + '</select>' +
      '<label>Kilométrage</label><input id="mhNvKm" type="number" min="0" value="' + (t0 ? esc(Math.round(Number(t0.odometer) || 0) || '') : '') + '" oninput="MaintenanceHub.nvUpdPrev()">' +
      '<label>Date de la prestation</label><input id="mhNvD" type="date" value="' + new Date().toISOString().slice(0, 10) + '">' +
      '<label>Lieu / Garage</label><input id="mhNvL" type="text" placeholder="Maghreb Truck Company SPA, SOFRAMIMEX…">' +
      '<label>Coût (DA) — optionnel</label><input id="mhNvC" type="number" min="0">' +
      '<label>Note — optionnel</label><textarea id="mhNvN" rows="2"></textarea>' +
      '<div class="mh-note"><div style="font-weight:800;margin-bottom:3px"><i class="fa-solid fa-file-word"></i> Désignation DA (.docx) :</div><div id="mhNvPrev" style="font-family:monospace;color:#fff">' + esc(previewDesigText(cur, t0 ? t0.name : '', pType, t0 ? t0.odometer : 0)) + '</div></div>' +
      '<div class="mh-acts" style="margin-top:16px;justify-content:flex-end"><button class="mh-btn" onclick="MaintenanceHub.closeOv()">Fermer</button>' +
      '<button class="mh-btn warn" onclick="MaintenanceHub.doNewVidange(true)"><i class="fa-solid fa-file-word"></i> Enregistrer &amp; DA .docx</button>' +
      '<button class="mh-btn ok" id="mhGo" onclick="MaintenanceHub.doNewVidange(false)"><i class="fa-solid fa-check"></i> Enregistrer</button></div>');
  }
  function nvUpdPrev() {
    var id = $('mhNvT') && $('mhNvT').value, t = id && truckById(id), p = $('mhNvPrev');
    if (p) p.textContent = previewDesigText(id, t ? t.name : '', $('mhNvType') && $('mhNvType').value, $('mhNvKm') && $('mhNvKm').value);
  }
  function nvPick(id) { var t = truckById(id); if (t && $('mhNvKm')) $('mhNvKm').value = Math.round(Number(t.odometer) || 0) || ''; nvUpdPrev(); }

  async function doNewVidange(andDocx) {
    var id = $('mhNvT').value, km = Math.round(Number($('mhNvKm').value) || 0), t = truckById(id);
    var type = ($('mhNvType') && $('mhNvType').value) || 'Vidange';
    if (!t) { toast('Choisissez un camion', 'warning'); return; }
    if (/vidange/i.test(type) && km <= 0) { toast('Saisissez le kilométrage pour la vidange', 'warning'); return; }
    var cur = anchorKm(id);
    if (/vidange/i.test(type) && cur && km < cur && !(await ask('La dernière vidange connue est à ' + num(cur) + ' km, supérieure à ' + num(km) + ' km. Enregistrer quand même ?', 'Kilométrage inférieur', '⚠️', 'Enregistrer'))) return;
    var btn = $('mhGo'); if (btn) btn.disabled = true;
    var d = new Date(($('mhNvD').value || new Date().toISOString().slice(0, 10)) + 'T12:00:00');
    try {
      var r = await api('/api/maintenance/add', 'POST', {
        truckName: t.name, deviceId: String(t.id), type: type, odometer: km, date: d.toISOString(), exitDate: d.toISOString(),
        status: 'termine', isAuto: false, verified: true, location: $('mhNvL').value.trim(),
        cost: Number($('mhNvC').value) || 0, note: $('mhNvN').value.trim()
      });
      if (r && r.vidangeOverrides && window.FLEET_CONFIG) { FLEET_CONFIG.VIDANGE_OVERRIDES = r.vidangeOverrides; FLEET_CONFIG.vidangeOverrides = r.vidangeOverrides; }
      closeOv(); toast('✅ ' + type + ' enregistrée pour ' + t.name, 'success'); await syncAfterChange();
      if (andDocx && r && r.id) await downloadDa(String(r.id));
    } catch (e) { toast('Erreur : ' + e.message, 'error'); if (btn) btn.disabled = false; }
  }

  function previewDesigText(devId, truckName, type, km) {
    var tr = String(truckName || '').trim().toUpperCase() || 'T000';
    if (!/\b(HOWO|MAN|RENAULT|VOLVO|SCANIA|MERCEDES|IVECO|SHACMAN|DAF)\b/.test(tr)) tr = 'MAN ' + tr;
    if (/vidange/i.test(type || '')) {
      var pack = closestPackKm(km, devId);
      return 'VIDANGE PERIODIQUE ' + String(pack).replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' KM POUR TRACTEUR ' + tr;
    }
    if (/plaquette|frein/i.test(type || '')) return 'F/P PLAQUETTE DU FREIN POUR TRACTEUR ' + tr;
    if (/^maintenance(\s*g[eé]n[eé]rale)?$/i.test(type || '')) return 'MAINTENANCE GENERALE POUR TRACTEUR ' + tr;
    return 'F/P ' + String(type || 'MAINTENANCE').toUpperCase() + ' POUR TRACTEUR ' + tr;
  }

  function updateQualifyPreview(devId, truckName) {
    var p = $('mhDesigPrev');
    if (!p) return;
    p.textContent = previewDesigText(devId, truckName, $('mhType') && $('mhType').value, $('mhKm') && $('mhKm').value);
  }

  // Qualify / rectify any entry (1 single prestation)
  function qualify(id, preset) {
    var x = find(id); if (!x) return;
    var t = truckById(x.deviceId);
    var type = preset || effType(x);
    var km = Number(x.odometer) > 0 ? Number(x.odometer) : (t && ageDays(x) < 3 ? Math.round(Number(t.odometer) || 0) : '');
    var dtVal = dateOf(x) && !isNaN(dateOf(x)) ? dateOf(x).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10);
    var tName = x.truckName || (t && t.name) || '', dId = String(x.deviceId || '');
    dlg('<h3><i class="fa-solid fa-pen" style="color:#f59e0b"></i> Modifier la prestation</h3>' +
      '<div class="mh-sub">' + esc(tName) + ' · entrée le ' + fmtD(x.date) + (x.location ? ' · ' + esc(x.location) : '') + '</div>' +
      '<label>Prestation (une seule par DA)</label><select id="mhType" onchange="MaintenanceHub.updPrev(\'' + esc(dId) + '\',\'' + esc(tName) + '\')">' + typeOptions(type) + '</select>' +
      '<label>Date de la prestation (en haut de la DA)</label><input id="mhDate" type="date" value="' + esc(dtVal) + '">' +
      '<label>Kilométrage du camion</label><input id="mhKm" type="number" min="0" value="' + esc(km) + '" oninput="MaintenanceHub.updPrev(\'' + esc(dId) + '\',\'' + esc(tName) + '\')">' +
      '<label>Coût (DA) — optionnel</label><input id="mhCost" type="number" min="0" value="' + esc(x.cost || '') + '">' +
      '<label>Technicien / Garage — optionnel</label><input id="mhTech" type="text" value="' + esc(x.technician || '') + '">' +
      '<label>Note — optionnel</label><textarea id="mhNote" rows="2">' + esc(x.note || '') + '</textarea>' +
      '<div class="mh-note"><div style="font-weight:800;margin-bottom:3px"><i class="fa-solid fa-file-word"></i> Désignation DA (.docx) :</div><div id="mhDesigPrev" style="font-family:monospace;color:#fff">' + esc(previewDesigText(dId, tName, type, km)) + '</div></div>' +
      '<div class="mh-acts" style="margin-top:16px;justify-content:space-between"><button class="mh-btn bad" onclick="MaintenanceHub.closeOv();MaintenanceHub.cancel(\'' + esc(id) + '\')"><i class="fa-solid fa-ban"></i> Ignorer</button>' +
      '<span style="display:flex;gap:6px;flex-wrap:wrap"><button class="mh-btn" onclick="MaintenanceHub.closeOv()">Fermer</button>' +
      '<button class="mh-btn warn" onclick="MaintenanceHub.doQualify(\'' + esc(id) + '\',true)"><i class="fa-solid fa-file-word"></i> Enregistrer &amp; DA .docx</button>' +
      '<button class="mh-btn ok" id="mhGo" onclick="MaintenanceHub.doQualify(\'' + esc(id) + '\',false)"><i class="fa-solid fa-check"></i> Enregistrer</button></span></div>');
  }

  async function doQualify(id, andDocx) {
    var x = find(id); if (!x) return;
    var type = $('mhType').value, km = Math.round(Number($('mhKm').value) || 0);
    if (/vidange/i.test(type) && km <= 0) { toast('Kilométrage requis pour une vidange', 'warning'); return; }
    var btn = $('mhGo'); if (btn) btn.disabled = true;
    var body = { type: type, odometer: km, technician: $('mhTech').value.trim(), note: $('mhNote').value.trim(), by: localStorage.getItem('fleetUserName') || '' };
    if ($('mhDate') && $('mhDate').value) body.date = new Date($('mhDate').value + 'T12:00:00').toISOString();
    if ($('mhCost').value !== '') body.cost = Number($('mhCost').value);
    if (stOf(x) === 'en_cours' && x.exitDate) body.status = 'termine';
    var ok = await sendClassify(id, body, btn);
    if (ok && andDocx) await downloadDa(id);
  }

  async function quickValidate(id) {
    var x = find(id); if (!x) return;
    var body = { type: effType(x), odometer: Number(x.odometer), by: localStorage.getItem('fleetUserName') || '' };
    if (stOf(x) === 'en_cours' && x.exitDate) body.status = 'termine';
    await sendClassify(id, body, null);
  }

  async function sendClassify(id, body, btn) {
    try {
      var r = await api('/api/maintenance/' + encodeURIComponent(id) + '/classify', 'PATCH', body);
      if (r && r.vidangeOverrides && window.FLEET_CONFIG) { FLEET_CONFIG.VIDANGE_OVERRIDES = r.vidangeOverrides; FLEET_CONFIG.vidangeOverrides = r.vidangeOverrides; }
      closeOv();
      toast(r && r.vidangeAcknowledged ? '✅ Enregistré — vidange prise en compte' : '✅ Intervention mise à jour', 'success');
      await syncAfterChange();
      return true;
    } catch (e) { toast('Erreur : ' + e.message, 'error'); if (btn) btn.disabled = false; return false; }
  }

  function triggerBlob(blob, filename) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
  }

  async function downloadDa(id) {
    try {
      var h = {}; var c = code(); if (c) h['x-access-code'] = c;
      var r = await fetch(base() + '/api/maintenance/' + encodeURIComponent(id) + '/demande-service.docx', { headers: h });
      if (!r.ok) { var ej = await r.json().catch(function () { return {}; }); throw new Error(ej.error || ('HTTP ' + r.status)); }
      var cd = r.headers.get('Content-Disposition') || '';
      var m = cd.match(/filename="?([^"]+)"?/i);
      var fname = (m && m[1]) || ('Demande_Service_' + id + '.docx');
      var blob = await r.blob();
      triggerBlob(blob, fname);
      toast('📄 ' + fname + ' téléchargé', 'success');
    } catch (e) { toast('Erreur téléchargement DA : ' + e.message, 'error'); }
  }

  async function downloadBulk(mode) {
    var ids = selIds();
    if (!ids.length) { toast('Cochez au moins une intervention', 'warning'); return; }
    S.dlBusy = true; render();
    try {
      var h = { 'Content-Type': 'application/json' }; var c = code(); if (c) h['x-access-code'] = c;
      if (mode === 'files') {
        var j = await api('/api/maintenance/demande-service-bulk', 'POST', { ids: ids, format: 'files' });
        var files = (j && j.files) || [];
        for (var i = 0; i < files.length; i++) {
          var bin = atob(files[i].base64);
          var arr = new Uint8Array(bin.length);
          for (var k = 0; k < bin.length; k++) arr[k] = bin.charCodeAt(k);
          triggerBlob(new Blob([arr], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }), files[i].filename);
          await new Promise(function (res) { setTimeout(res, 220); });
        }
        toast('📄 ' + files.length + ' fichier(s) .docx téléchargé(s)', 'success');
      } else {
        var r = await fetch(base() + '/api/maintenance/demande-service-bulk', { method: 'POST', headers: h, body: JSON.stringify({ ids: ids, format: 'zip' }) });
        if (!r.ok) throw new Error('HTTP ' + r.status);
        var blob = await r.blob();
        triggerBlob(blob, 'Demandes_Service_' + new Date().toISOString().slice(0, 10) + '.zip');
        toast('📦 Pack ZIP (' + ids.length + ' DA .docx) téléchargé', 'success');
      }
    } catch (e) { toast('Erreur génération DA : ' + e.message, 'error'); }
    S.dlBusy = false; render();
  }

  async function closeDlg(id) {
    var x = find(id);
    if (!x) { await load(true); x = find(id); }
    if (!x) { toast('Ordre introuvable, actualisez la liste', 'warning'); return; }
    var t = truckById(x.deviceId);
    var km = Number(x.odometer) || (t && Math.round(Number(t.odometer))) || '';
    dlg('<h3><i class="fa-solid fa-circle-check" style="color:#22c55e"></i> Terminer l\'intervention</h3>' +
      '<div class="mh-sub">' + esc(x.truckName || '') + ' · ' + esc(x.type || '') + ' · commencée le ' + fmtD(x.date) + '</div>' +
      '<label>Kilométrage à la clôture</label><input id="mhKm" type="number" min="0" value="' + esc(km) + '">' +
      '<label>Date de fin</label><input id="mhEnd" type="date" value="' + new Date().toISOString().slice(0, 10) + '">' +
      '<label>Coût total (DA)</label><input id="mhCost" type="number" min="0" value="' + esc(x.cost || '') + '">' +
      '<label>Technicien / Garage</label><input id="mhTech" type="text" value="' + esc(x.technician || '') + '">' +
      '<label>Note de clôture</label><textarea id="mhNote" rows="3">' + esc(x.note || '') + '</textarea>' +
      (isVid(x) ? '<div class="mh-note"><i class="fa-solid fa-oil-can"></i> Vidange : le compteur sera remis à zéro au kilométrage saisi.</div>' : '') +
      '<div class="mh-acts" style="margin-top:16px;justify-content:flex-end"><button class="mh-btn" onclick="MaintenanceHub.closeOv()">Fermer</button>' +
      '<button class="mh-btn ok" id="mhGo" onclick="MaintenanceHub.doClose(\'' + esc(id) + '\')"><i class="fa-solid fa-check"></i> Confirmer</button></div>');
  }

  async function doClose(id) {
    var btn = $('mhGo'); if (btn) btn.disabled = true;
    var body = { id: id, _id: id };
    var km = $('mhKm').value, cost = $('mhCost').value;
    if (km !== '') body.odometer = Number(km);
    if (cost !== '') body.cost = Number(cost);
    body.technician = $('mhTech').value.trim();
    body.note = $('mhNote').value.trim();
    var end = $('mhEnd').value;
    if (end) body.exitDate = new Date(end + 'T12:00:00').toISOString();
    var x = find(id);
    if (x && isVid(x) && !(Number(km) > 0)) {
      toast('Saisissez le kilométrage pour remettre la vidange à zéro', 'warning');
      if (btn) btn.disabled = false; return;
    }
    try {
      var r = await api('/api/maintenance/close', 'POST', body);
      if (r && r.vidangeOverrides && window.FLEET_CONFIG) { FLEET_CONFIG.VIDANGE_OVERRIDES = r.vidangeOverrides; FLEET_CONFIG.vidangeOverrides = r.vidangeOverrides; }
      closeOv();
      toast(r && r.vidangeAcknowledged ? '✅ Terminé — vidange remise à zéro' : '✅ Intervention terminée', 'success');
      await syncAfterChange();
    } catch (e) { toast('Erreur : ' + e.message, 'error'); if (btn) btn.disabled = false; }
  }

  async function cancel(id) {
    var x = find(id);
    var vid = x && isVid(x);
    var ok = await ask((x && x.isAuto ? 'Ignorer cette détection automatique' : 'Annuler cette intervention') + (x ? ' (' + (x.truckName || '') + ')' : '') + ' ?' +
      (vid ? '\n\nSi c\'était la dernière vidange du camion, le compteur reviendra à la vidange précédente.' : ''), 'Confirmer', '🚫', 'Oui');
    if (!ok) return;
    try {
      var r = await api('/api/maintenance/' + encodeURIComponent(id) + '/cancel', 'PATCH');
      if (r && r.vidangeOverrides && window.FLEET_CONFIG) { FLEET_CONFIG.VIDANGE_OVERRIDES = r.vidangeOverrides; FLEET_CONFIG.vidangeOverrides = r.vidangeOverrides; }
      toast('Entrée ignorée', 'success'); await syncAfterChange();
    } catch (e) { toast('Erreur : ' + e.message, 'error'); }
  }

  async function reopen(id) {
    var x = find(id);
    var ok = await ask('Rouvrir cette entrée' + (x ? ' (' + (x.truckName || '') + ')' : '') + ' ? Elle repassera « En cours ».', 'Rouvrir', '↩️', 'Rouvrir');
    if (!ok) return;
    try { await api('/api/maintenance/' + encodeURIComponent(id) + '/reopen', 'PATCH'); toast('Entrée rouverte', 'success'); S.view = 'pending'; await syncAfterChange(); }
    catch (e) { toast('Erreur : ' + e.message, 'error'); }
  }

  function pdf() {
    var logs = S.logs.filter(function (x) { return String(x.deviceId) === String(S.truck) && stOf(x) !== 'annule'; });
    if (window.FleetPDF && FleetPDF.generateMaintenanceHistoryReport) FleetPDF.generateMaintenanceHistoryReport(logs);
    else toast('Module PDF non chargé', 'error');
  }

  // ───────────────────────── PUBLIC API ─────────────────────────
  window.MaintenanceHub = {
    go: function (v, extra) {
      S.view = v; S.search = '';
      if (v === 'todo') S.todoFilter = extra || 'all';
      render(); load(false);
    },
    openTruck: function (id) { if (!id) { S.truck = ''; render(); return; } S.truck = String(id); S.view = 'truck'; S.tFilter = 'all'; render(); load(false); window.scrollTo({ top: 0, behavior: 'smooth' }); },
    setTodo: function (f) { S.todoFilter = f; render(); },
    setSearch: function (v) { S.search = v; render(); },
    setH: function (k, v) { S[k] = v; render(); },
    setT: function (v) { S.tFilter = v; render(); },
    togglePAll: function (on) { S.pAll = !!on; render(); },
    refresh: function () { load(true); },
    newVidange: newVidange, nvPick: nvPick, nvUpdPrev: nvUpdPrev, doNewVidange: doNewVidange,
    qualify: qualify, doQualify: doQualify, quickValidate: quickValidate, updPrev: updateQualifyPreview,
    downloadDa: downloadDa, downloadBulk: downloadBulk,
    toggleSel: function (id, on) { if (on) S.sel[String(id)] = 1; else delete S.sel[String(id)]; render(); },
    selAll: function (ids, on) { (ids || []).forEach(function (k) { if (on) S.sel[String(k)] = 1; else delete S.sel[String(k)]; }); render(); },
    clearSel: function () { S.sel = {}; render(); },
    closeDlg: closeDlg, doClose: doClose, closeOv: closeOv, cancel: cancel, reopen: reopen, pdf: pdf,
    onRender: function () { render(); load(false); }
  };

  // Take over the legacy renderer (ui.js calls renderVidangeSection from many places)
  function patch() {
    if (!window.ui || typeof window.ui.renderVidangeSection !== 'function') return false;
    var u = window.ui;
    u.renderVidangeSection = function () { window.MaintenanceHub.onRender(); };
    u.quickAddVidange = function (id) { window.MaintenanceHub.newVidange(String(id)); };
    var f = u.fetchAndRenderMaintenance;
    if (typeof f === 'function' && !f.__mh) {
      u.fetchAndRenderMaintenance = function () {
        S.loadedAt = 0;
        load(true).then(function () { u.allMaintenanceLogs = S.logs; });
        return f.apply(u, arguments);
      };
      u.fetchAndRenderMaintenance.__mh = true;
    }
    css();
    return true;
  }
  var tries = 0;
  (function wait() { if (!patch() && tries++ < 100) setTimeout(wait, 200); })();
})();
