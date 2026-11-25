/* ═══════════════════════════════════════════════════════════════════════
 * MAINTENANCE HUB v5 — Adaptive Light/Dark Theme + Full Journal Workstation
 *
 *  Views:
 *   1. Flotte       — live vidange status of every truck
 *   2. À valider    — validate / rectify / ignore auto-detections (NO DA download here)
 *   3. Fiche camion — per-truck KPIs, interval chart, diagnosis & timeline
 *   4. Journal      — full operations table (IMM, Châssis, Prestation, Pack km, Site,
 *                     working smart filters, and instant multi-select DA .docx download)
 * ═══════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var S = {
    view: 'todo',            // todo | pending | truck | history
    logs: [], loadedAt: 0, loading: false, error: '',
    todoFilter: 'all',       // all | urgent | soon | ok | nohist
    search: '',
    truck: '',
    tFilter: 'all',
    pAll: false,
    // Journal filters
    jSearch: '',
    jType: '',               // '' | 'Vidange' | 'Plaquettes de Frein' | 'Maintenance Générale' | 'other'
    jSite: '',
    jStatus: 'no_cancel',    // 'ready' | 'no_cancel' | 'pending' | 'annule' | 'all'
    jPeriod: 'all',          // 'all' | 'today' | '7d' | '30d' | 'month' | 'custom'
    jFrom: '',
    jTo: '',
    sel: {},                 // selected validated IDs for multi-DA .docx download
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
  function fc() { return (typeof FLEET_CONFIG !== 'undefined' && FLEET_CONFIG) || window.FLEET_CONFIG || {}; }
  function appRef() { return (typeof app !== 'undefined' && app) || window.app || null; }
  function toast(m, t) { if (window.showToast) window.showToast(m, t || 'info'); else console.log(m); }
  function base() { var c = fc(); return (c.API && c.API.baseUrl) || ''; }
  function code() {
    return localStorage.getItem('fleetAccessCode') || (window.ui && ui.currentCode) || fc().accessCode || 'Douroub_2025_Admin_Secure';
  }
  async function api(path, method, body) {
    var h = { 'Content-Type': 'application/json' };
    var c = code(); if (c) h['x-access-code'] = c;
    var r = await fetch(base() + path, { method: method || 'GET', headers: h, body: body ? JSON.stringify(body) : undefined });
    var j = null; try { j = await r.json(); } catch (_) { /* ignore */ }
    if (!r.ok) throw new Error((j && j.error) || ('HTTP ' + r.status));
    return j;
  }

  function idOf(x) { return String(x.id || x._id || ''); }
  function stOf(x) {
    var s = String(x.status || 'en_cours').toLowerCase();
    if (s === 'termine' || s === 'terminé' || s === 'done' || s === 'completed') return 'termine';
    if (s === 'annule' || s === 'annulé' || s === 'cancelled') return 'annule';
    return 'en_cours';
  }
  function isVid(x) { return /vidange/i.test(effType(x)); }
  function dateOf(x) { return new Date(x.date || x.createdAt || 0); }
  function fmtD(d) { d = new Date(d); return isNaN(d) ? '—' : d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' }); }
  function fmtTime(d) { d = new Date(d); return isNaN(d) ? '' : d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }); }
  function age(x) {
    var end = stOf(x) === 'en_cours' ? new Date() : new Date(x.exitDate || x.date);
    var ms = end - dateOf(x); if (!(ms > 0)) return '—';
    var mins = Math.round(ms / 60000);
    if (mins < 60) return mins + ' min';
    var d = Math.floor(mins / 1440), h = Math.floor((mins % 1440) / 60), m = mins % 60;
    return d > 0 ? (d + 'j ' + h + 'h') : (h + 'h ' + (m ? m + 'm' : ''));
  }
  function ageDays(x) { return (new Date() - dateOf(x)) / 86400000; }
  function trucks() {
    try {
      var a = appRef();
      var live = (a && typeof a.getAllTrucks === 'function') ? a.getAllTrucks() : [];
      if (live && live.length) return live;
      var cache = (window.ui && Array.isArray(ui.truckDbCache)) ? ui.truckDbCache : [];
      var seen = {}, calcFn = (typeof calculateVidangeStatus === 'function' && calculateVidangeStatus) || window.calculateVidangeStatus;
      return cache.filter(function (d) {
        var id = String((d && d.deviceId) || '');
        if (!id || id === 'undefined' || id === 'null' || seen[id]) return false;
        seen[id] = true; return true;
      }).map(function (d) {
        var odo = Math.round(parseFloat(d.odometer) || ((d.params && d.params.io192) ? (parseInt(d.params.io192, 10) || 0) / 1000 : 0) || 0);
        var cfg = truckCfg(d.deviceId);
        var ovr = ((fc().vidangeOverrides || fc().VIDANGE_OVERRIDES || {})[String(d.deviceId)]) || null;
        var vs = calcFn ? calcFn(odo, cfg, ovr && ovr.lastVidangeKm) : { alert: false, kmUntilNext: 25000, nextKm: 25000, alertKm: 500 };
        return { id: String(d.deviceId), name: cfg.alias || d.truckName || String(d.deviceId), odometer: odo, vidange: vs };
      });
    } catch (e) { return []; }
  }
  function truckById(id) { return trucks().find(function (k) { return String(k.id) === String(id); }); }
  function truckDbMeta(devId, tName) {
    var cache = (window.ui && ui.truckDbCache) || [];
    return cache.find(function (d) { return devId && String(d.deviceId) === String(devId); }) ||
      cache.find(function (d) { return tName && String(d.truckName) === String(tName) && d.immatriculation; }) || {};
  }

  function truckCfg(devId) {
    var fn = (typeof getTruckConfig === 'function' && getTruckConfig) || window.getTruckConfig;
    if (fn && devId) return fn(String(devId));
    return fc().DEFAULT_TRUCK_CONFIG || {};
  }
  function rotKm(devId) {
    return Number(truckCfg(devId).vidangeRotationKm) || 25000;
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
  function isPending(x) {
    var s = stOf(x);
    if (s === 'annule') return false;
    if (s === 'en_cours') return true;
    if (x.isAuto && !x.verified) return S.pAll || ageDays(x) <= 30;
    return false;
  }
  function canDownloadDa(x) {
    var s = stOf(x);
    if (s === 'annule') return false;
    if (isPending(x)) return false;
    return true;
  }
  function root() { return $('vidangeSectionContainer'); }

  // ───────────────────────── ADAPTIVE THEME CSS ─────────────────────────
  function css() {
    var old = $('mhCss'); if (old) old.remove();
    var st = document.createElement('style'); st.id = 'mhCss';
    st.textContent = [
      '#vidangeSection .controls-section>h2{display:none}',
      '#vidangeSection .controls-section{background:transparent;border:none;box-shadow:none;padding:0}',
      '.mh{--c-bg:#141d2e;--c-surf:#0d1422;--c-head:#1a253a;--c-b:rgba(255,255,255,.12);--c-t:#f1f5f9;--c-m:#94a3b8;--c-hov:rgba(56,189,248,.06);--c-sel:rgba(14,165,233,.15);color:var(--c-t)}',
      ':root[data-theme="light"] .mh{--c-bg:#ffffff;--c-surf:#f8fafc;--c-head:#f1f5f9;--c-b:#e2e8f0;--c-t:#0f172a;--c-m:#475569;--c-hov:#f8fafc;--c-sel:#e0f2fe}',
      '.mh-kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(155px,1fr));gap:10px;margin-bottom:14px}',
      '.mh-kpi{background:var(--c-bg);border:1px solid var(--c-b);border-radius:13px;padding:12px 15px;cursor:pointer;transition:.15s;position:relative;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.06)}',
      '.mh-kpi:before{content:"";position:absolute;left:0;top:0;bottom:0;width:4px;background:var(--k,#64748b)}',
      '.mh-kpi:hover{transform:translateY(-2px)}',
      '.mh-kpi b{display:block;font-size:23px;font-weight:800;line-height:1.15;color:var(--k,#64748b)}',
      '.mh-kpi span{font-size:10px;text-transform:uppercase;letter-spacing:.5px;color:var(--c-m);font-weight:700}',
      '.mh-tabs{display:flex;gap:7px;flex-wrap:wrap;margin-bottom:14px;border-bottom:1px solid var(--c-b);padding-bottom:11px;align-items:center}',
      '.mh-tab{padding:8px 16px;border-radius:999px;border:1.5px solid var(--c-b);background:var(--c-bg);color:var(--c-m);font-weight:700;font-size:12px;cursor:pointer;font-family:inherit;transition:.15s}',
      '.mh-tab.on{background:#f59e0b;border-color:#f59e0b;color:#111}',
      '.mh-tab i{margin-right:6px}',
      '.mh-tab em{font-style:normal;background:rgba(15,23,42,.22);color:inherit;border-radius:9px;padding:1px 7px;margin-left:6px;font-size:10px;font-weight:800}',
      '.mh-tab em.hot{background:#ef4444;color:#fff}',
      '.mh-bar{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:12px}',
      '.mh input,.mh select,.mh textarea{padding:8px 11px;border-radius:9px;border:1px solid var(--c-b);background:var(--c-bg);color:var(--c-t);font-size:12px;font-family:inherit;outline:none}',
      '.mh input:focus,.mh select:focus{border-color:#0284c7}',
      '.mh-pill{padding:6px 12px;border-radius:999px;border:1px solid var(--c-b);background:var(--c-bg);color:var(--c-m);font-size:11px;font-weight:700;cursor:pointer;font-family:inherit;transition:.12s}',
      '.mh-pill.on{background:#0284c7;border-color:#0284c7;color:#fff}',
      '.mh-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(310px,1fr));gap:14px}',
      '.mh-card{background:var(--c-bg);border:1px solid var(--c-b);border-left:4px solid var(--mhc,#64748b);border-radius:13px;padding:14px;display:flex;flex-direction:column;gap:8px;box-shadow:0 1px 4px rgba(0,0,0,.05)}',
      '.mh-card h4{margin:0;font-size:15px;font-weight:800;color:var(--c-t)}',
      '.mh-link{cursor:pointer;color:#0284c7;font-weight:800;text-decoration:none}.mh-link:hover{text-decoration:underline}',
      ':root:not([data-theme="light"]) .mh-link{color:#38bdf8}'
    ].join('\n');
    document.head.appendChild(st);
  }

  function ensureExtraCss() {
    if ($('mhCss2')) return;
    var st = document.createElement('style'); st.id = 'mhCss2';
    st.textContent = [
      '.mh-row{display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap}',
      '.mh-sub{font-size:11px;color:var(--c-m)}',
      '.mh-badge{font-size:10px;font-weight:800;padding:3px 9px;border-radius:999px;color:#fff;background:var(--mhc,#64748b);white-space:nowrap}',
      '.mh-tag{font-size:10px;font-weight:700;padding:2px 7px;border-radius:6px;background:var(--c-head);color:var(--c-m);white-space:nowrap;border:1px solid var(--c-b)}',
      '.mh-bar2{height:7px;border-radius:5px;background:rgba(148,163,184,.25);overflow:hidden}',
      '.mh-bar2>div{height:100%;background:var(--mhc,#64748b);border-radius:5px}',
      '.mh-acts{display:flex;gap:6px;flex-wrap:wrap;align-items:center}',
      '.mh-btn{padding:6px 11px;border-radius:8px;border:1px solid var(--c-b);background:var(--c-bg);color:var(--c-t);font-size:11px;font-weight:700;cursor:pointer;font-family:inherit;display:inline-flex;align-items:center;gap:5px;white-space:nowrap;transition:.12s}',
      '.mh-btn:hover{border-color:#0284c7}',
      '.mh-btn.ok{background:#16a34a;border-color:#16a34a;color:#fff}',
      '.mh-btn.da{background:#0284c7;border-color:#0284c7;color:#fff}',
      '.mh-btn.warn{background:#f59e0b;border-color:#f59e0b;color:#111}',
      '.mh-btn.bad{color:#ef4444;border-color:rgba(239,68,68,.4)}',
      '.mh-btn.grow{flex:1;justify-content:center}',
      '.mh-btn[disabled]{opacity:.5;cursor:wait}',
      '.mh-empty{text-align:center;padding:44px 16px;color:var(--c-m);grid-column:1/-1}',
      '.mh-empty i{font-size:34px;opacity:.4;display:block;margin-bottom:10px}',
      '.mh-panel{background:var(--c-bg);border:1px solid var(--c-b);border-radius:14px;padding:14px;margin-bottom:14px}',
      '.mh-panel h5{margin:0 0 10px;font-size:12px;text-transform:uppercase;letter-spacing:.6px;color:var(--c-m)}',
      '.mh-insight{display:flex;gap:10px;align-items:flex-start;padding:11px 14px;border-radius:11px;background:rgba(14,165,233,.1);border:1px solid rgba(14,165,233,.3);font-size:12px;margin-bottom:14px;color:var(--c-t)}',
      '.mh-insight.warn{background:rgba(245,158,11,.1);border-color:rgba(245,158,11,.35)}',
      '.mh-insight.bad{background:rgba(239,68,68,.1);border-color:rgba(239,68,68,.35)}',
      '.mh-insight.good{background:rgba(16,185,129,.1);border-color:rgba(16,185,129,.35)}',
      '.mh-fbox{background:var(--c-bg);border:1px solid var(--c-b);border-radius:14px;padding:14px;margin-bottom:12px;display:flex;flex-direction:column;gap:10px;box-shadow:0 1px 4px rgba(0,0,0,.05)}',
      '.mh-bulk{position:sticky;top:8px;z-index:20;display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;padding:10px 16px;border-radius:12px;background:linear-gradient(135deg,#0f172a,#1e293b);border:1.5px solid #0284c7;color:#fff;margin-bottom:12px;box-shadow:0 8px 24px rgba(2,132,199,.25)}',
      '.mh-twrap{background:var(--c-bg);border:1px solid var(--c-b);border-radius:14px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,.05)}',
      '.mh-tbl{width:100%;border-collapse:collapse;font-size:12px}',
      '.mh-tbl th{background:var(--c-head);color:var(--c-m);font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.6px;padding:11px 12px;text-align:left;border-bottom:1px solid var(--c-b);white-space:nowrap}',
      '.mh-tbl td{padding:11px 12px;border-bottom:1px solid var(--c-b);vertical-align:middle;color:var(--c-t)}',
      '.mh-tbl tbody tr:hover{background:var(--c-hov)}',
      '.mh-tbl tbody tr.sel{background:var(--c-sel)}',
      '.mh-chk{width:17px;height:17px;accent-color:#0284c7;cursor:pointer}',
      '.mh-ov{position:fixed;inset:0;background:rgba(15,23,42,.68);backdrop-filter:blur(3px);z-index:10050;display:flex;align-items:center;justify-content:center;padding:16px}',
      '.mh-dlg{background:var(--bg-elevated,#1a2332);color:var(--text-primary,#f1f5f9);border:1px solid var(--border,rgba(255,255,255,.15));border-radius:16px;width:100%;max-width:480px;padding:20px;max-height:92vh;overflow:auto;box-shadow:0 20px 50px rgba(0,0,0,.4)}',
      ':root[data-theme="light"] .mh-dlg{background:#ffffff;color:#0f172a;border-color:#cbd5e1}',
      '.mh-dlg h3{margin:0 0 4px;font-size:17px}',
      '.mh-dlg label{display:block;font-size:11px;font-weight:700;color:var(--text-muted,#64748b);margin:10px 0 4px}',
      '.mh-dlg input,.mh-dlg select,.mh-dlg textarea{width:100%;box-sizing:border-box;padding:8px 10px;border-radius:8px;border:1px solid rgba(148,163,184,.35);background:var(--bg-surface,#0f172a);color:inherit;font-size:12px;font-family:inherit}',
      ':root[data-theme="light"] .mh-dlg input,:root[data-theme="light"] .mh-dlg select,:root[data-theme="light"] .mh-dlg textarea{background:#f8fafc;color:#0f172a;border-color:#cbd5e1}',
      '.mh-note{font-size:11px;padding:10px 12px;border-radius:9px;background:rgba(2,132,199,.1);border:1px solid rgba(2,132,199,.3);margin-top:12px}'
    ].join('\n');
    document.head.appendChild(st);
  }

  // ───────────────────────── DATA ─────────────────────────
  async function load(force) {
    if (S.loading) return;
    if (!force && S.loadedAt && Date.now() - S.loadedAt < TTL) return;
    S.loading = true;
    try {
      if (window.ui && (!ui.truckDbCache || !ui.truckDbCache.length) && ui.loadTruckDbCache) {
        await ui.loadTruckDbCache();
      }
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
    try { if (u && u.loadSettingsFromCloud) await u.loadSettingsFromCloud(); } catch (_) {}
    try { var a = appRef(); if (a && a.forceRecalculateVidanges) a.forceRecalculateVidanges(); } catch (_) {}
    try { if (window.VidangeCenter && VidangeCenter.refresh) VidangeCenter.refresh(); } catch (_) {}
    try { if (u && u.loadActiveMaintenanceOrders) await u.loadActiveMaintenanceOrders(); } catch (_) {}
    try { if (u && u.renderStats) u.renderStats(); } catch (_) {}
    S.loadedAt = 0; S.loading = false;
    await load(true);
  }

  function truckStats(devId) {
    var ents = S.logs.filter(function (x) {
      return String(x.deviceId) === String(devId) && isVid(x) && stOf(x) !== 'annule' && Number(x.odometer) > 0;
    }).sort(function (a, b) { return dateOf(a) - dateOf(b); });
    var pts = ents.map(function (x) { return { km: Number(x.odometer), date: dateOf(x), cost: Number(x.cost) || 0, id: idOf(x) }; });
    var ovr = ((fc().vidangeOverrides || fc().VIDANGE_OVERRIDES || {})[String(devId)]);
    if (ovr && Number(ovr.lastVidangeKm) > 0) {
      var km = Number(ovr.lastVidangeKm);
      if (!pts.some(function (p) { return Math.abs(p.km - km) <= 50; })) {
        pts.push({ km: km, date: new Date(ovr.confirmedAt || Date.now()), cost: 0, synthetic: true });
        pts.sort(function (a, b) { return a.date - b.date; });
      }
    }
    var intervals = [], dupes = 0;
    for (var i = 1; i < pts.length; i++) {
      var dk = pts[i].km - pts[i - 1].km;
      var dd = Math.max(1, Math.round((pts[i].date - pts[i - 1].date) / 86400000));
      if (dk < 1000) { dupes++; continue; }
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
    var c = { pending: 0, readyDa: 0, urgent: 0, soon: 0, nohist: 0 };
    S.logs.forEach(function (x) {
      if (isPending(x)) c.pending++;
      if (canDownloadDa(x)) c.readyDa++;
    });
    trucks().forEach(function (k) {
      if (!k.vidange) return;
      var v = k.vidange, kmU = Number(v.kmUntilNext);
      if (v.alert) c.urgent++; else if (kmU < (Number(v.alertKm) || 500) + 3000) c.soon++;
      if (!v.lastKm) c.nohist++;
    });
    return c;
  }

  function render() {
    var el = root(); if (!el) return;
    css(); ensureExtraCss();
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
      kp(c.pending, 'À valider', c.pending ? '#0284c7' : '#16a34a', 'pending') +
      kp(c.readyDa, 'Journal (prêtes DA)', '#16a34a', 'history') +
      '</div><div class="mh-tabs">' +
      tab('todo', 'fa-oil-can', 'Flotte') +
      tab('pending', 'fa-inbox', 'À valider', c.pending, c.pending > 0) +
      tab('truck', 'fa-truck', 'Fiche camion') +
      tab('history', 'fa-table-list', 'Journal & DA (.docx)', c.readyDa, false) +
      '<span style="flex:1"></span>' +
      '<button class="mh-btn" onclick="ui.openVidangeScanModal()"><i class="fa-solid fa-satellite-dish"></i> Scan GPS</button>' +
      '<button class="mh-btn warn" onclick="MaintenanceHub.newVidange()"><i class="fa-solid fa-plus"></i> Nouvelle intervention</button>' +
      '<button class="mh-btn" onclick="MaintenanceHub.refresh()" title="Actualiser"><i class="fa-solid fa-rotate' + (S.loading ? ' fa-spin' : '') + '"></i></button>' +
      '</div>';
    if (S.error) h += '<div class="mh-insight bad">Erreur de chargement : ' + esc(S.error) + '</div>';
    if (S.view === 'todo') h += viewTodo();
    else if (S.view === 'pending') h += viewPending();
    else if (S.view === 'truck') h += viewTruck();
    else h += viewHistory();
    h += '</div>';
    el.innerHTML = h;
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
      var color = c === 'urgent' ? '#ef4444' : c === 'soon' ? '#f59e0b' : '#16a34a';
      var label = c === 'urgent' ? (k < 0 ? 'EN RETARD' : 'URGENT') : c === 'soon' ? 'BIENTÔT' : 'OK';
      var rk = Number(v.rotKm) || rotKm(t.id);
      var pct = Math.max(0, Math.min(100, Math.round((1 - k / rk) * 100)));
      var act = activeVidangeFor(t.id), st = truckStats(t.id);
      var btn = act
        ? '<button class="mh-btn ok grow" onclick="MaintenanceHub.closeDlg(\'' + esc(idOf(act)) + '\')"><i class="fa-solid fa-check"></i> Terminer vidange en cours</button>'
        : (c !== 'ok' ? '<button class="mh-btn warn grow" onclick="MaintenanceHub.newVidange(\'' + esc(t.id) + '\',\'Vidange\')"><i class="fa-solid fa-oil-can"></i> Déclarer la vidange</button>' : '');
      return '<div class="mh-card" style="--mhc:' + color + '">' +
        '<div class="mh-row"><h4><span class="mh-link" onclick="MaintenanceHub.openTruck(\'' + esc(t.id) + '\')">' + esc(t.name) + '</span></h4><span class="mh-badge">' + (act ? 'EN COURS' : label) + '</span></div>' +
        '<div class="mh-bar2"><div style="width:' + pct + '%"></div></div>' +
        '<div class="mh-row"><span class="mh-sub">' + (k < 0 ? '<b style="color:' + color + '">Retard ' + num(Math.abs(k)) + ' km</b>' : 'Reste <b>' + num(k) + ' km</b>') + '</span>' +
        '<span class="mh-sub">Prochaine : <b>' + esc(v.nextKm) + ' km</b></span></div>' +
        '<div class="mh-row"><span class="mh-sub">Actuel : ' + num(t.odometer) + ' km</span>' +
        '<span class="mh-sub">Dernière : ' + (v.lastKm ? num(v.lastKm) + ' km' : '<i>non enregistrée</i>') + '</span></div>' +
        '<div class="mh-row"><span class="mh-sub">' + st.count + ' vidange(s)' + (st.avgKm ? ' · moy. ' + num(st.avgKm) + ' km' : '') + '</span>' +
        '<span class="mh-link" style="font-size:11px" onclick="MaintenanceHub.openTruck(\'' + esc(t.id) + '\')">Fiche →</span></div>' +
        (btn ? '<div class="mh-acts">' + btn + '</div>' : '') + '</div>';
    }).join('') + '</div>';
    return h;
  }

  // ───────────────────────── VIEW 2 : À VALIDER (NO DA DOWNLOAD HERE) ─────────────────────────
  function viewPending() {
    var list = S.logs.filter(isPending).sort(function (a, b) { return dateOf(b) - dateOf(a); });
    var hidden = S.pAll ? 0 : S.logs.filter(function (x) { return stOf(x) !== 'annule' && x.isAuto && !x.verified && stOf(x) !== 'en_cours' && ageDays(x) > 30; }).length;
    var h = '<div class="mh-insight warn"><i class="fa-solid fa-shield-halved" style="margin-top:2px"></i><div>' +
      '<b>Validation préalable obligatoire.</b> Vérifiez ou rectifiez la prestation ici avant toute édition de document. ' +
      'Une fois validée, la Demande de Service (<b>.docx</b>) se télécharge depuis l\'onglet <b>Journal &amp; DA (.docx)</b>.</div></div>';
    h += '<div class="mh-bar"><span class="mh-sub"><b>' + list.length + '</b> intervention(s) à traiter</span><span style="flex:1"></span>' +
      '<label class="mh-sub" style="cursor:pointer"><input type="checkbox" ' + (S.pAll ? 'checked' : '') + ' onchange="MaintenanceHub.togglePAll(this.checked)"> Inclure &gt; 30 jours' + (hidden ? ' (' + hidden + ')' : '') + '</label></div>';
    if (!list.length) return h + '<div class="mh-grid"><div class="mh-empty"><i class="fa-solid fa-inbox"></i>Aucune intervention en attente — ouvrez <b>Journal &amp; DA (.docx)</b> pour télécharger vos demandes.</div></div>';
    h += '<div class="mh-grid">' + list.map(function (x) {
      var id = esc(idOf(x)), open = stOf(x) === 'en_cours';
      var eType = effType(x), vid = /vidange/i.test(eType), noKm = !(Number(x.odometer) > 0);
      var color = vid ? '#f59e0b' : '#0284c7';
      var t = truckById(x.deviceId), meta = truckDbMeta(x.deviceId, x.truckName);
      var packTag = vid && !noKm ? ' · Pack ' + num(closestPackKm(x.odometer, x.deviceId)) + ' km' : '';
      var acts = '';
      if (x.isAuto && !x.verified) {
        acts += (!vid || !noKm)
          ? '<button class="mh-btn ok grow" onclick="MaintenanceHub.quickValidate(\'' + id + '\')"><i class="fa-solid fa-check"></i> Valider (' + esc(eType) + ')</button>'
          : '<button class="mh-btn warn grow" onclick="MaintenanceHub.qualify(\'' + id + '\',\'Vidange\')"><i class="fa-solid fa-check"></i> Saisir km &amp; Valider</button>';
        acts += '<button class="mh-btn" onclick="MaintenanceHub.qualify(\'' + id + '\')"><i class="fa-solid fa-pen"></i> Rectifier</button>' +
          '<button class="mh-btn bad" onclick="MaintenanceHub.cancel(\'' + id + '\')" title="Ignorer faux positif"><i class="fa-solid fa-ban"></i></button>';
      } else {
        acts += '<button class="mh-btn ok grow" onclick="MaintenanceHub.closeDlg(\'' + id + '\')"><i class="fa-solid fa-check"></i> Terminer</button>' +
          '<button class="mh-btn" onclick="MaintenanceHub.qualify(\'' + id + '\')"><i class="fa-solid fa-pen"></i> Rectifier</button>' +
          '<button class="mh-btn bad" onclick="MaintenanceHub.cancel(\'' + id + '\')"><i class="fa-solid fa-ban"></i></button>';
      }
      return '<div class="mh-card" style="--mhc:' + color + '">' +
        '<div class="mh-row"><h4><span class="mh-link" onclick="MaintenanceHub.openTruck(\'' + esc(x.deviceId) + '\')">' + esc(x.truckName || x.deviceId) + '</span> ' +
        (meta.immatriculation ? '<span class="mh-tag">' + esc(meta.immatriculation) + '</span>' : '') + '</h4>' +
        '<span class="mh-badge">' + (open && !x.isAuto ? 'EN COURS' : 'À VALIDER') + '</span></div>' +
        '<div class="mh-row"><span><i class="fa-solid ' + (vid ? 'fa-oil-can' : 'fa-wrench') + '" style="color:' + color + '"></i> <b>' + esc(eType) + '</b><span class="mh-sub">' + esc(packTag) + '</span></span>' +
        '<span class="mh-sub">' + fmtD(x.date) + (open ? ' · ' + age(x) : '') + '</span></div>' +
        '<div class="mh-sub">' + (x.location ? '<i class="fa-solid fa-location-dot"></i> ' + esc(x.location) + ' · ' : '') +
        (noKm ? '<b style="color:#ef4444">km manquant</b>' : num(x.odometer) + ' km') +
        (t ? ' · actuel ' + num(t.odometer) + ' km' : '') + '</div>' +
        '<div class="mh-acts">' + acts + '</div></div>';
    }).join('') + '</div>';
    return h;
  }

  // ───────────────────────── VIEW 3 : FICHE CAMION ─────────────────────────
  function chartSvg(st, devId) {
    var iv = st.intervals.slice(-12);
    if (!iv.length) return '<div class="mh-sub" style="padding:14px 0">Pas encore assez de vidanges enregistrées pour tracer les intervalles (minimum 2).</div>';
    var target = rotKm(devId), W = 560, H = 150, pad = 26;
    var max = Math.max(target * 1.25, Math.max.apply(null, iv.map(function (i) { return i.km; })) * 1.1);
    var bw = Math.min(46, (W - pad * 2) / iv.length - 8);
    var y = function (v) { return H - pad - (v / max) * (H - pad * 1.6); };
    var bars = iv.map(function (i, n) {
      var x = pad + n * ((W - pad * 2) / iv.length) + 4;
      var ratio = i.km / target;
      var col = ratio > 1.1 ? '#ef4444' : ratio < 0.6 ? '#8b5cf6' : '#16a34a';
      return '<rect x="' + x + '" y="' + y(i.km) + '" width="' + bw + '" height="' + (H - pad - y(i.km)) + '" rx="4" fill="' + col + '"><title>' + fmtD(i.to.date) + ' · ' + num(i.km) + ' km en ' + i.days + ' j</title></rect>' +
        '<text x="' + (x + bw / 2) + '" y="' + (y(i.km) - 4) + '" font-size="9" text-anchor="middle" fill="#64748b">' + Math.round(i.km / 1000) + 'k</text>' +
        '<text x="' + (x + bw / 2) + '" y="' + (H - 10) + '" font-size="8" text-anchor="middle" fill="#64748b">' + fmtD(i.to.date).slice(0, 5) + '</text>';
    }).join('');
    return '<svg viewBox="0 0 ' + W + ' ' + H + '" style="width:100%;max-height:190px">' +
      '<line x1="' + pad + '" x2="' + (W - pad) + '" y1="' + y(target) + '" y2="' + y(target) + '" stroke="#f59e0b" stroke-dasharray="5 4"/>' +
      '<text x="' + (W - pad) + '" y="' + (y(target) - 4) + '" font-size="9" text-anchor="end" fill="#d97706">cible ' + num(target) + ' km</text>' + bars + '</svg>';
  }

  function viewTruck() {
    var all = trucks().filter(function (t) { return t.vidange; }).sort(function (a, b) { return String(a.name).localeCompare(String(b.name), 'fr', { numeric: true }); });
    var sel = '<div class="mh-bar"><select id="mhTruckSel" onchange="MaintenanceHub.openTruck(this.value)" style="min-width:250px"><option value="">— Choisir un camion —</option>' +
      all.map(function (t) { return '<option value="' + esc(t.id) + '"' + (String(t.id) === String(S.truck) ? ' selected' : '') + '>' + esc(t.name) + '</option>'; }).join('') + '</select></div>';
    var t = S.truck && truckById(S.truck);
    if (!t) return sel + '<div class="mh-grid"><div class="mh-empty"><i class="fa-solid fa-truck"></i>Choisissez un camion pour consulter sa fiche complète.</div></div>';
    var v = t.vidange || {}, k = Number(v.kmUntilNext), c = cls(t), st = truckStats(t.id), rk = Number(v.rotKm) || rotKm(t.id);
    var color = c === 'urgent' ? '#ef4444' : c === 'soon' ? '#f59e0b' : '#16a34a';
    var db = truckDbMeta(t.id, t.name);
    var kpi = function (val, lbl, col) { return '<div class="mh-kpi" style="--k:' + (col || '#64748b') + ';cursor:default"><b style="font-size:18px">' + val + '</b><span>' + lbl + '</span></div>'; };
    var since = st.lastKm ? Math.max(0, Number(t.odometer) - st.lastKm) : 0;
    var h = sel + '<div class="mh-panel" style="border-left:4px solid ' + color + '"><div class="mh-row"><div><div style="font-size:19px;font-weight:800">' + esc(t.name) + '</div>' +
      '<div class="mh-sub">' + (db.immatriculation ? 'IMM : <b>' + esc(db.immatriculation) + '</b> · ' : '') + (db.chassisNumber ? 'Châssis : <b>' + esc(db.chassisNumber) + '</b> · ' : '') + (db.driverName ? esc(db.driverName) : '') + '</div></div>' +
      '<div class="mh-acts"><button class="mh-btn warn" onclick="MaintenanceHub.newVidange(\'' + esc(t.id) + '\',\'Vidange\')"><i class="fa-solid fa-oil-can"></i> + Vidange</button>' +
      '<button class="mh-btn" onclick="MaintenanceHub.newVidange(\'' + esc(t.id) + '\',\'Plaquettes de Frein\')"><i class="fa-solid fa-plus"></i> + Plaquettes</button>' +
      '<button class="mh-btn" onclick="MaintenanceHub.openJournalForTruck(\'' + esc(t.name) + '\')"><i class="fa-solid fa-file-word"></i> Voir dans Journal &amp; DA</button>' +
      '<button class="mh-btn" onclick="MaintenanceHub.pdf()"><i class="fa-solid fa-file-pdf"></i> PDF</button></div></div>' +
      '<div class="mh-bar2" style="margin:12px 0 4px;--mhc:' + color + '"><div style="width:' + Math.max(0, Math.min(100, Math.round((1 - k / rk) * 100))) + '%"></div></div>' +
      '<div class="mh-row"><span class="mh-sub">' + (k < 0 ? '<b style="color:' + color + '">En retard de ' + num(Math.abs(k)) + ' km</b>' : 'Reste ' + num(k) + ' km avant la prochaine') + '</span>' +
      '<span class="mh-sub">Prochaine : <b>' + esc(v.nextKm) + ' km</b></span></div></div>';
    h += '<div class="mh-kpis">' + kpi(num(t.odometer) + ' km', 'Compteur actuel', '#0284c7') +
      kpi(st.lastKm ? num(st.lastKm) + ' km' : '—', 'Dernière vidange' + (st.lastDate ? ' · ' + fmtD(st.lastDate) : ''), '#16a34a') +
      kpi(st.lastKm ? num(since) + ' km' : '—', 'Parcourus depuis', since > rk ? '#ef4444' : '#64748b') +
      kpi(st.avgKm ? num(st.avgKm) + ' km' : '—', 'Intervalle moyen' + (st.avgDays ? ' · ' + st.avgDays + ' j' : ''), '#8b5cf6') +
      kpi(st.count, 'Vidanges enregistrées', '#f59e0b') +
      kpi(st.cost ? num(st.cost) + ' DA' : '—', 'Coût cumulé', '#64748b') + '</div>';
    h += insight(st, k, rk);
    h += '<div class="mh-panel"><h5>Intervalles entre vidanges (km)</h5>' + chartSvg(st, t.id) + '</div>';
    h += truckTimelineHtml(t.id, st);
    return h;
  }

  function insight(st, k, rk) {
    var m = [], type = 'good';
    if (!st.lastKm) { m.push('Aucune vidange enregistrée : déclarez la dernière vidange connue pour caler le compteur.'); type = 'warn'; }
    if (k < 0) { m.push('Vidange en retard de <b>' + num(Math.abs(k)) + ' km</b>.'); type = 'bad'; }
    if (st.avgKm && st.avgKm > rk * 1.1) { m.push('Intervalle moyen <b>' + num(st.avgKm) + ' km</b> supérieur à la rotation cible (' + num(rk) + ' km).'); if (type !== 'bad') type = 'warn'; }
    else if (st.avgKm && st.avgKm < rk * 0.6) { m.push('Intervalle moyen <b>' + num(st.avgKm) + ' km</b> court : vérifiez d\'éventuels doublons.'); if (type === 'good') type = 'warn'; }
    else if (st.avgKm) m.push('Rythme conforme : intervalle moyen <b>' + num(st.avgKm) + ' km</b> (cible ' + num(rk) + ' km).');
    if (st.dupes) m.push(st.dupes + ' doublon(s) probable(s) (&lt; 1 000 km) ignoré(s) dans la moyenne.');
    return m.length ? '<div class="mh-insight ' + type + '"><i class="fa-solid fa-lightbulb" style="margin-top:2px"></i><div>' + m.join('<br>') + '</div></div>' : '';
  }

  function truckTimelineHtml(devId, st) {
    var f = S.tFilter;
    var list = S.logs.filter(function (x) { return String(x.deviceId) === String(devId); })
      .filter(function (x) { return f === 'all' || (f === 'vidange' ? isVid(x) : !isVid(x)); })
      .sort(function (a, b) { return dateOf(b) - dateOf(a); });
    var prevKm = {};
    st.points.forEach(function (p, i) { if (p.id) prevKm[p.id] = i > 0 ? p.km - st.points[i - 1].km : 0; });
    var pill = function (v, l) { return '<button class="mh-pill' + (f === v ? ' on' : '') + '" onclick="MaintenanceHub.setT(\'' + v + '\')">' + l + '</button>'; };
    var h = '<div class="mh-bar">' + pill('all', 'Tout (' + S.logs.filter(function (x) { return String(x.deviceId) === String(devId); }).length + ')') + pill('vidange', '🛢 Vidanges') + pill('other', '🛑 Plaquettes & Autres') + '</div>';
    if (!list.length) return h + '<div class="mh-twrap"><div class="mh-empty">Aucun historique pour ce camion</div></div>';
    return h + renderJournalTable(list, false, prevKm);
  }

  // ───────────────────────── VIEW 4 : JOURNAL & DA WORKSTATION ─────────────────────────
  function selIds() {
    return Object.keys(S.sel).filter(function (k) {
      if (!S.sel[k]) return false;
      var x = find(k);
      return !!(x && canDownloadDa(x));
    });
  }

  function filteredJournal() {
    var q = (S.jSearch || '').trim().toLowerCase();
    var now = new Date();
    var pStart = null;
    if (S.jPeriod === 'today') pStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    else if (S.jPeriod === '7d') pStart = new Date(now.getTime() - 7 * 86400000);
    else if (S.jPeriod === '30d') pStart = new Date(now.getTime() - 30 * 86400000);
    else if (S.jPeriod === 'month') pStart = new Date(now.getFullYear(), now.getMonth(), 1);

    return S.logs.filter(function (x) {
      var s = stOf(x), eType = effType(x), pend = isPending(x), ready = canDownloadDa(x);
      // Status filter
      if (S.jStatus === 'ready' && !ready) return false;
      if (S.jStatus === 'no_cancel' && s === 'annule') return false;
      if (S.jStatus === 'pending' && !pend) return false;
      if (S.jStatus === 'annule' && s !== 'annule') return false;

      // Prestation filter (matches effective prestation shown on screen!)
      if (S.jType === 'Vidange' && !/vidange/i.test(eType)) return false;
      if (S.jType === 'Plaquettes de Frein' && !/plaquette|frein/i.test(eType)) return false;
      if (S.jType === 'Maintenance Générale' && !/^maintenance(\s*g[eé]n[eé]rale)?$/i.test(eType)) return false;
      if (S.jType === 'other' && (/vidange|plaquette|frein|^maintenance(\s*g[eé]n[eé]rale)?$/i.test(eType))) return false;

      // Site filter
      if (S.jSite && String(x.location || '') !== S.jSite) return false;

      // Period & custom dates
      var dt = dateOf(x);
      if (pStart && dt < pStart) return false;
      if (S.jFrom && dt < new Date(S.jFrom + 'T00:00:00')) return false;
      if (S.jTo && dt > new Date(S.jTo + 'T23:59:59')) return false;

      // Smart multi-field search (Truck, IMM, Chassis, Prestation, Pack km, Site, Tech, Note)
      if (q) {
        var m = truckDbMeta(x.deviceId, x.truckName);
        var pack = /vidange/i.test(eType) ? String(closestPackKm(x.odometer, x.deviceId)) : '';
        var hay = [
          x.truckName, m.immatriculation, x.immatriculation, m.chassisNumber, x.chassisNumber,
          eType, x.type, pack, x.odometer, x.location, x.technician, x.note
        ].join(' ').toLowerCase();
        if (hay.indexOf(q) < 0) return false;
      }
      return true;
    }).sort(function (a, b) { return dateOf(b) - dateOf(a); });
  }

  function bulkBarInnerHtml() {
    var ids = selIds();
    if (!ids.length) return '';
    return '<div class="mh-bulk">' +
      '<div style="display:flex;align-items:center;gap:10px">' +
        '<span style="background:#0284c7;color:#fff;font-weight:900;padding:3px 10px;border-radius:999px;font-size:12px">' + ids.length + '</span>' +
        '<span style="font-size:13px;font-weight:700">prestation(s) sélectionnée(s) pour Demande de Service (.docx)</span>' +
      '</div>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap">' +
        '<button type="button" class="mh-btn warn"' + (S.dlBusy ? ' disabled' : '') + ' onclick="MaintenanceHub.downloadBulk(\'files\')"><i class="fa-solid fa-file-word"></i> Télécharger ' + ids.length + ' fichier(s) .docx</button>' +
        (ids.length > 1 ? '<button type="button" class="mh-btn da"' + (S.dlBusy ? ' disabled' : '') + ' onclick="MaintenanceHub.downloadBulk(\'zip\')"><i class="fa-solid fa-file-zipper"></i> Télécharger en ZIP (.docx)</button>' : '') +
        '<button type="button" class="mh-btn" style="background:rgba(255,255,255,.1);color:#fff;border-color:rgba(255,255,255,.25)" onclick="MaintenanceHub.clearSel()">✕ Désélectionner</button>' +
      '</div></div>';
  }

  function renderJournalTable(list, showTruckCol, prevKmMap) {
    var slice = list.slice(0, 350);
    var eligibleIds = slice.filter(canDownloadDa).map(idOf);
    var allChecked = eligibleIds.length > 0 && eligibleIds.every(function (k) { return !!S.sel[k]; });

    var rowsHtml = slice.map(function (x) {
      var rawId = idOf(x), id = esc(rawId);
      var s = stOf(x), pend = isPending(x), ready = canDownloadDa(x);
      var eType = effType(x), vid = /vidange/i.test(eType), plaq = /plaquette|frein/i.test(eType);
      var meta = truckDbMeta(x.deviceId, x.truckName);
      var imm = x.immatriculation || meta.immatriculation || '';
      var chas = x.chassisNumber || meta.chassisNumber || '';
      var pack = vid && Number(x.odometer) > 0 ? closestPackKm(x.odometer, x.deviceId) : 0;
      var delta = prevKmMap ? (prevKmMap[rawId] || 0) : 0;

      var typeBg = vid ? 'rgba(245,158,11,.15)' : (plaq ? 'rgba(2,132,199,.14)' : 'rgba(139,92,246,.14)');
      var typeCol = vid ? '#d97706' : (plaq ? '#0284c7' : '#7c3aed');
      var stBadge = s === 'annule'
        ? '<span class="mh-badge" style="--mhc:#64748b">Annulé</span>'
        : pend
          ? '<span class="mh-badge" style="--mhc:#0284c7">À valider</span>'
          : '<span class="mh-badge" style="--mhc:#16a34a">Validé</span>';

      var acts = '';
      if (ready) {
        acts += '<button type="button" class="mh-btn da" onclick="MaintenanceHub.downloadDa(\'' + id + '\')" title="Télécharger Demande de Service (.docx)"><i class="fa-solid fa-file-word"></i> DA .docx</button>';
        acts += '<button type="button" class="mh-btn" onclick="MaintenanceHub.qualify(\'' + id + '\')" title="Rectifier prestation / date / km"><i class="fa-solid fa-pen"></i></button>';
      } else if (pend) {
        acts += '<button type="button" class="mh-btn ok" onclick="MaintenanceHub.quickValidate(\'' + id + '\')" title="Valider d\'abord pour débloquer la DA"><i class="fa-solid fa-check"></i> Valider</button>';
        acts += '<button type="button" class="mh-btn" onclick="MaintenanceHub.qualify(\'' + id + '\')" title="Rectifier"><i class="fa-solid fa-pen"></i></button>';
      } else if (s === 'annule') {
        acts += '<button type="button" class="mh-btn" onclick="MaintenanceHub.reopen(\'' + id + '\')"><i class="fa-solid fa-rotate-left"></i> Rouvrir</button>';
      }
      acts += '<button type="button" class="mh-btn bad" onclick="ui.deleteMaintenanceEntry(\'' + id + '\')" title="Supprimer"><i class="fa-solid fa-trash"></i></button>';

      return '<tr id="mhRow_' + id + '" class="' + (ready && S.sel[rawId] ? 'sel' : '') + '">' +
        (showTruckCol ? '<td style="width:36px;text-align:center">' +
          (ready ? '<input type="checkbox" class="mh-chk mh-rowchk" data-id="' + id + '"' + (S.sel[rawId] ? ' checked' : '') + ' onchange="MaintenanceHub.toggleSel(\'' + id + '\',this.checked)">' : '<span class="mh-sub" title="Validez d\'abord cette ligne">—</span>') +
        '</td>' : '') +
        '<td style="white-space:nowrap"><div style="font-weight:700">' + fmtD(x.date) + ' <span class="mh-sub">' + fmtTime(x.date) + '</span></div>' +
          '<div class="mh-sub">' + (x.exitDate ? '→ ' + fmtD(x.exitDate) + ' · ' : '') + age(x) + '</div></td>' +
        (showTruckCol ? '<td><div><span class="mh-link" style="font-size:13px" onclick="MaintenanceHub.openTruck(\'' + esc(x.deviceId) + '\')">' + esc(x.truckName || '—') + '</span></div>' +
          '<div class="mh-sub">' + (imm ? 'IMM: <b>' + esc(imm) + '</b>' : '<span style="color:#ef4444">IMM non renseignée</span>') +
          (chas ? ' · <span style="font-family:monospace">' + esc(chas) + '</span>' : '') + '</div></td>' : '') +
        '<td><div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">' +
          '<span style="background:' + typeBg + ';color:' + typeCol + ';padding:3px 9px;border-radius:999px;font-weight:800;font-size:11px">' + (vid ? '🛢️ ' : (plaq ? '🛑 ' : '🔧 ')) + esc(eType) + '</span>' +
          (pack ? '<span class="mh-tag">Pack ' + num(pack) + ' km</span>' : '') +
          '<span class="mh-tag">' + (x.isAuto ? 'Auto' : 'Manuel') + '</span></div></td>' +
        '<td style="white-space:nowrap;font-family:var(--font-mono,monospace);font-weight:700">' +
          (Number(x.odometer) > 0 ? num(x.odometer) + ' km' : '<span class="mh-sub">—</span>') +
          (delta > 0 ? '<div class="mh-sub">+' + num(delta) + ' km</div>' : '') + '</td>' +
        '<td><div style="font-weight:600">' + esc(x.location || '—') + '</div>' +
          (x.cost || x.technician ? '<div class="mh-sub">' + (x.technician ? esc(x.technician) + ' ' : '') + (x.cost ? '<b>' + num(x.cost) + ' DA</b>' : '') + '</div>' : '') + '</td>' +
        '<td>' + stBadge + '</td>' +
        '<td style="text-align:right;white-space:nowrap"><div class="mh-acts" style="justify-content:flex-end">' + acts + '</div></td>' +
      '</tr>';
    }).join('');

    return '<div class="mh-twrap" style="overflow-x:auto"><table class="mh-tbl"><thead><tr>' +
      (showTruckCol ? '<th style="width:36px;text-align:center"><input type="checkbox" id="mhMasterChk" class="mh-chk"' + (allChecked ? ' checked' : '') + (eligibleIds.length ? '' : ' disabled') + ' title="Tout sélectionner sur cette liste" onchange="MaintenanceHub.selAllVis(this.checked)"></th>' : '') +
      '<th>Date Prestation</th>' +
      (showTruckCol ? '<th>Tracteur (IMM &amp; Châssis)</th>' : '') +
      '<th>Prestation &amp; Pack DA</th>' +
      '<th>Compteur</th>' +
      '<th>Site / Atelier</th>' +
      '<th>Statut</th>' +
      '<th style="text-align:right">Actions</th>' +
      '</tr></thead><tbody>' + rowsHtml + '</tbody></table>' +
      (list.length > 350 ? '<div class="mh-sub" style="padding:10px;text-align:center">350 premières lignes affichées sur ' + list.length + ' — affinez les filtres pour tout voir.</div>' : '') +
      '</div>';
  }

  function journalSummaryHtml(list) {
    var readyCnt = 0, vidCnt = 0, plaqCnt = 0, totalCost = 0;
    list.forEach(function (x) {
      if (canDownloadDa(x)) readyCnt++;
      var et = effType(x);
      if (/vidange/i.test(et)) vidCnt++;
      else if (/plaquette|frein/i.test(et)) plaqCnt++;
      if (stOf(x) !== 'annule') totalCost += Number(x.cost) || 0;
    });
    return '<b>' + list.length + '</b> ligne(s) · <b style="color:#16a34a">' + readyCnt + '</b> prête(s) DA · ' +
      '🛢️ ' + vidCnt + ' · 🛑 ' + plaqCnt + (totalCost > 0 ? ' · <b>' + num(totalCost) + ' DA</b>' : '');
  }

  function refreshJournalBody() {
    var list = filteredJournal();
    var wrap = $('mhJournalBodyWrap');
    if (wrap) {
      wrap.innerHTML = list.length
        ? renderJournalTable(list, true, null)
        : '<div class="mh-twrap"><div class="mh-empty"><i class="fa-solid fa-filter-circle-xmark"></i>Aucune prestation ne correspond aux filtres actifs.</div></div>';
    }
    var cnt = $('mhJCount');
    if (cnt) cnt.innerHTML = journalSummaryHtml(list);
    var bulk = $('mhBulkMount');
    if (bulk) bulk.innerHTML = bulkBarInnerHtml();
  }

  function viewHistory() {
    var list = filteredJournal();
    var siteMap = {};
    S.logs.forEach(function (x) {
      var loc = String(x.location || '').trim();
      if (loc) siteMap[loc] = (siteMap[loc] || 0) + 1;
    });
    var sites = Object.keys(siteMap).sort(function (a, b) { return a.localeCompare(b, 'fr'); });
    var pp = function (p, lbl) {
      return '<button type="button" class="mh-pill' + (S.jPeriod === p ? ' on' : '') + '" onclick="MaintenanceHub.setJPeriod(\'' + p + '\')">' + lbl + '</button>';
    };

    var h = '<div class="mh-fbox">' +
      '<div style="display:grid;grid-template-columns:minmax(220px,2fr) repeat(auto-fit,minmax(165px,1fr));gap:8px;align-items:center">' +
        '<input id="mhJSearch" type="text" placeholder="🔍 Rechercher camion, N° IMM, N° châssis, pack km, site…" value="' + esc(S.jSearch) + '" oninput="MaintenanceHub.setJSearch(this.value)">' +
        '<select onchange="MaintenanceHub.setJFilter(\'jType\',this.value)">' +
          '<option value=""' + (S.jType === '' ? ' selected' : '') + '>Toutes les prestations</option>' +
          '<option value="Vidange"' + (S.jType === 'Vidange' ? ' selected' : '') + '>🛢️ Vidange périodique</option>' +
          '<option value="Plaquettes de Frein"' + (S.jType === 'Plaquettes de Frein' ? ' selected' : '') + '>🛑 Plaquettes de Frein</option>' +
          '<option value="Maintenance Générale"' + (S.jType === 'Maintenance Générale' ? ' selected' : '') + '>🔧 Maintenance Générale</option>' +
          '<option value="other"' + (S.jType === 'other' ? ' selected' : '') + '>⚙️ Autres prestations</option>' +
        '</select>' +
        '<select onchange="MaintenanceHub.setJFilter(\'jSite\',this.value)">' +
          '<option value="">📍 Tous les sites / ateliers (' + sites.length + ')</option>' +
          sites.map(function (s) { return '<option value="' + esc(s) + '"' + (S.jSite === s ? ' selected' : '') + '>' + esc(s) + ' (' + siteMap[s] + ')</option>'; }).join('') +
        '</select>' +
        '<select onchange="MaintenanceHub.setJFilter(\'jStatus\',this.value)">' +
          '<option value="no_cancel"' + (S.jStatus === 'no_cancel' ? ' selected' : '') + '>📋 Actives (hors annulées)</option>' +
          '<option value="ready"' + (S.jStatus === 'ready' ? ' selected' : '') + '>✅ Validées (prêtes DA .docx)</option>' +
          '<option value="pending"' + (S.jStatus === 'pending' ? ' selected' : '') + '>📥 À valider uniquement</option>' +
          '<option value="annule"' + (S.jStatus === 'annule' ? ' selected' : '') + '>🚫 Annulées</option>' +
          '<option value="all"' + (S.jStatus === 'all' ? ' selected' : '') + '>Tout afficher</option>' +
        '</select>' +
      '</div>' +
      '<div style="display:flex;gap:7px;flex-wrap:wrap;align-items:center">' +
        pp('all', 'Tout') + pp('today', 'Aujourd\'hui') + pp('7d', '7 jours') + pp('30d', '30 jours') + pp('month', 'Ce mois') +
        '<span class="mh-sub" style="margin-left:4px">Du</span>' +
        '<input type="date" value="' + esc(S.jFrom) + '" onchange="MaintenanceHub.setJDate(\'jFrom\',this.value)" style="padding:5px 8px">' +
        '<span class="mh-sub">Au</span>' +
        '<input type="date" value="' + esc(S.jTo) + '" onchange="MaintenanceHub.setJDate(\'jTo\',this.value)" style="padding:5px 8px">' +
        '<button type="button" class="mh-btn" onclick="MaintenanceHub.resetJFilters()"><i class="fa-solid fa-rotate-left"></i> Réinitialiser</button>' +
        '<span style="flex:1"></span>' +
        '<span id="mhJCount" class="mh-sub">' + journalSummaryHtml(list) + '</span>' +
        '<button type="button" class="mh-btn" onclick="MaintenanceHub.exportCsv()"><i class="fa-solid fa-file-csv"></i> Export CSV</button>' +
      '</div>' +
    '</div>' +
    '<div id="mhBulkMount">' + bulkBarInnerHtml() + '</div>' +
    '<div id="mhJournalBodyWrap">' +
      (list.length
        ? renderJournalTable(list, true, null)
        : '<div class="mh-twrap"><div class="mh-empty"><i class="fa-solid fa-filter-circle-xmark"></i>Aucune prestation ne correspond aux filtres actifs.</div></div>') +
    '</div>';
    return h;
  }

  // ───────────────────────── DIALOGS & INTERVENTION ACTIONS ─────────────────────────
  function find(id) {
    return S.logs.find(function (x) { return idOf(x) === String(id); });
  }
  function closeOv() {
    var ov = $('mhOv'); if (ov) ov.remove();
  }
  function dlg(innerHtml) {
    closeOv();
    var ov = document.createElement('div');
    ov.id = 'mhOv'; ov.className = 'mh-ov';
    ov.onclick = function (e) { if (e.target === ov) closeOv(); };
    ov.innerHTML = '<div class="mh-dlg">' + innerHtml + '</div>';
    document.body.appendChild(ov);
  }
  function ask(msg) {
    if (window.ui && typeof ui.showConfirm === 'function') return ui.showConfirm('Confirmation', msg);
    return Promise.resolve(window.confirm(msg));
  }
  function anchorKm(x) {
    var k = Number(x && x.odometer) || 0;
    if (k > 0) return k;
    var t = x && truckById(x.deviceId);
    return (t && Number(t.odometer)) || 0;
  }
  function typeOptions(cur) {
    var list = ['Vidange'].concat(OTHER_TYPES);
    if (cur && list.indexOf(cur) < 0) list.push(cur);
    return list.map(function (tp) {
      return '<option value="' + esc(tp) + '"' + (tp === cur ? ' selected' : '') + '>' + esc(tp) + '</option>';
    }).join('');
  }
  function tractorLabel(name) {
    var raw = String(name || '').trim().toUpperCase();
    var m = raw.match(/\b(T\s*\d{2,4})\b/);
    var codeStr = m ? m[1].replace(/\s+/g, '') : raw;
    if (/HOWO/.test(raw)) return 'TRACTEUR HOWO' + (codeStr && codeStr !== 'HOWO' ? ' ' + codeStr : '');
    if (/^TRACTEUR\b/.test(raw)) return raw;
    return 'TRACTEUR MAN' + (codeStr ? ' ' + codeStr : '');
  }
  function previewDesigHtml(tp, tName, devId, km, imm, chas) {
    var tr = tractorLabel(tName), title = '';
    if (/vidange/i.test(tp)) {
      var pk = closestPackKm(km, devId);
      title = 'VIDANGE PERIODIQUE ' + num(pk) + ' KM POUR ' + tr;
    } else if (/plaquette|frein/i.test(tp)) {
      title = 'F/P PLAQUETTE DU FREIN POUR ' + tr;
    } else if (/^maintenance(\s*g[eé]n[eé]rale)?$/i.test(tp)) {
      title = 'MAINTENANCE GENERALE POUR ' + tr;
    } else {
      title = String(tp || 'MAINTENANCE').toUpperCase() + ' POUR ' + tr;
    }
    return '<div style="font-family:\'Times New Roman\',serif;font-size:12px;font-weight:700;line-height:1.45;text-align:left">' +
      esc(title) + '<br><span style="font-weight:700">IMMATRICULE : ' + esc(imm || '—') + '</span><br>' +
      '<span style="font-weight:700">NUMERO DE CHASSIS : ' + esc(chas || '—') + '</span></div>';
  }

  function newVidange(devId, presetType) {
    var all = trucks().sort(function (a, b) { return String(a.name).localeCompare(String(b.name), 'fr', { numeric: true }); });
    var t = devId ? truckById(devId) : (all[0] || null);
    var defType = presetType || (t && t.vidange && t.vidange.alert ? 'Vidange' : 'Plaquettes de Frein');
    var km = t ? Math.round(Number(t.odometer) || 0) : 0;
    var meta = t ? truckDbMeta(t.id, t.name) : {};
    var today = new Date().toISOString().slice(0, 10);
    dlg(
      '<h3>Nouvelle intervention validée</h3>' +
      '<div class="mh-sub">Sera enregistrée directement dans le Journal (prête pour édition DA .docx).</div>' +
      '<label>Camion / Tracteur</label>' +
      '<select id="mhNvTruck" onchange="MaintenanceHub.nvPick(this.value)">' +
        all.map(function (k) { return '<option value="' + esc(k.id) + '"' + (t && String(k.id) === String(t.id) ? ' selected' : '') + '>' + esc(k.name) + ' (' + num(k.odometer) + ' km)</option>'; }).join('') +
      '</select>' +
      '<label>Prestation</label>' +
      '<select id="mhNvType" onchange="MaintenanceHub.nvUpdPrev()">' + typeOptions(defType) + '</select>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">' +
        '<div><label>Date prestation</label><input id="mhNvDate" type="date" value="' + today + '"></div>' +
        '<div><label>Compteur (km)</label><input id="mhNvKm" type="number" value="' + km + '" oninput="MaintenanceHub.nvUpdPrev()"></div>' +
      '</div>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">' +
        '<div><label>Site / Atelier</label><input id="mhNvLoc" type="text" placeholder="Ex: Atelier MAN Alger"></div>' +
        '<div><label>Coût (DA, optionnel)</label><input id="mhNvCost" type="number" placeholder="0"></div>' +
      '</div>' +
      '<label>Technicien / Note</label><input id="mhNvNote" type="text" placeholder="Optionnel">' +
      '<div class="mh-note"><div style="font-size:10px;font-weight:800;color:#0284c7;margin-bottom:4px">APERÇU DESIGNATION DA (.DOCX)</div>' +
        '<div id="mhNvPrev">' + (t ? previewDesigHtml(defType, t.name, t.id, km, meta.immatriculation, meta.chassisNumber) : '') + '</div></div>' +
      '<div class="mh-acts" style="justify-content:flex-end;margin-top:14px">' +
        '<button type="button" class="mh-btn" onclick="MaintenanceHub.closeOv()">Annuler</button>' +
        '<button type="button" class="mh-btn ok" onclick="MaintenanceHub.doNewVidange()"><i class="fa-solid fa-check"></i> Enregistrer</button>' +
      '</div>'
    );
  }

  function nvPick(devId) {
    var t = truckById(devId);
    if (!t) return;
    var kmEl = $('mhNvKm'), tpEl = $('mhNvType');
    if (kmEl) kmEl.value = Math.round(Number(t.odometer) || 0);
    if (tpEl) tpEl.value = (t.vidange && t.vidange.alert) ? 'Vidange' : 'Plaquettes de Frein';
    nvUpdPrev();
  }
  function nvUpdPrev() {
    var devId = ($('mhNvTruck') && $('mhNvTruck').value) || '';
    var tp = ($('mhNvType') && $('mhNvType').value) || 'Vidange';
    var km = Number($('mhNvKm') && $('mhNvKm').value) || 0;
    var t = truckById(devId), meta = t ? truckDbMeta(t.id, t.name) : {};
    var box = $('mhNvPrev');
    if (box && t) box.innerHTML = previewDesigHtml(tp, t.name, t.id, km, meta.immatriculation, meta.chassisNumber);
  }
  async function doNewVidange() {
    var devId = ($('mhNvTruck') && $('mhNvTruck').value) || '';
    var tp = ($('mhNvType') && $('mhNvType').value) || 'Vidange';
    var km = Math.round(Number($('mhNvKm') && $('mhNvKm').value) || 0);
    var dt = ($('mhNvDate') && $('mhNvDate').value) || new Date().toISOString().slice(0, 10);
    var loc = ($('mhNvLoc') && $('mhNvLoc').value || '').trim();
    var cost = Number($('mhNvCost') && $('mhNvCost').value) || 0;
    var note = ($('mhNvNote') && $('mhNvNote').value || '').trim();
    var t = truckById(devId);
    if (!t) { toast('Veuillez choisir un camion.', 'warning'); return; }
    if (/vidange/i.test(tp) && km <= 0) { toast('Kilométrage requis pour une vidange.', 'warning'); return; }
    var meta = truckDbMeta(t.id, t.name);
    try {
      await api('/api/maintenance/add', 'POST', {
        deviceId: String(t.id), truckName: t.name, type: tp, odometer: km,
        date: new Date(dt + 'T12:00:00').toISOString(), exitDate: new Date(dt + 'T13:00:00').toISOString(),
        location: loc || 'Atelier', cost: cost, note: note,
        immatriculation: meta.immatriculation || '', chassisNumber: meta.chassisNumber || '',
        status: 'termine', isAuto: false, verified: true
      });
      closeOv();
      toast('Intervention enregistrée dans le Journal.', 'success');
      await syncAfterChange();
    } catch (e) { toast('Erreur : ' + e.message, 'error'); }
  }

  function qualify(id, forceType) {
    var x = find(id); if (!x) return;
    var pend = isPending(x);
    var curType = forceType || effType(x);
    var km = anchorKm(x);
    var meta = truckDbMeta(x.deviceId, x.truckName);
    var imm = x.immatriculation || meta.immatriculation || '';
    var chas = x.chassisNumber || meta.chassisNumber || '';
    var dtVal = !isNaN(dateOf(x)) ? dateOf(x).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10);
    dlg(
      '<h3>' + (pend ? 'Valider / Rectifier l\'intervention' : 'Rectifier la prestation (Journal)') + '</h3>' +
      '<div class="mh-sub">Camion : <b>' + esc(x.truckName || x.deviceId) + '</b>' + (x.location ? ' · ' + esc(x.location) : '') + '</div>' +
      '<label>Prestation retenue</label>' +
      '<select id="mhQType" onchange="MaintenanceHub.updQualPrev(\'' + esc(id) + '\')">' + typeOptions(curType) + '</select>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">' +
        '<div><label>Date de prestation</label><input id="mhQDate" type="date" value="' + dtVal + '"></div>' +
        '<div><label>Compteur (km)</label><input id="mhQKm" type="number" value="' + km + '" oninput="MaintenanceHub.updQualPrev(\'' + esc(id) + '\')"></div>' +
      '</div>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">' +
        '<div><label>N° Immatriculation</label><input id="mhQImm" type="text" value="' + esc(imm) + '" oninput="MaintenanceHub.updQualPrev(\'' + esc(id) + '\')"></div>' +
        '<div><label>N° Châssis</label><input id="mhQChas" type="text" value="' + esc(chas) + '" oninput="MaintenanceHub.updQualPrev(\'' + esc(id) + '\')"></div>' +
      '</div>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">' +
        '<div><label>Site / Atelier</label><input id="mhQLoc" type="text" value="' + esc(x.location || '') + '"></div>' +
        '<div><label>Coût (DA)</label><input id="mhQCost" type="number" value="' + (Number(x.cost) || '') + '" placeholder="0"></div>' +
      '</div>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">' +
        '<div><label>Technicien</label><input id="mhQTech" type="text" value="' + esc(x.technician || '') + '"></div>' +
        '<div><label>Note</label><input id="mhQNote" type="text" value="' + esc(x.note || '') + '"></div>' +
      '</div>' +
      '<div class="mh-note"><div style="font-size:10px;font-weight:800;color:#0284c7;margin-bottom:4px">DESIGNATION FUTURE SUR LA DA (.DOCX)</div>' +
        '<div id="mhQPrev">' + previewDesigHtml(curType, x.truckName, x.deviceId, km, imm, chas) + '</div></div>' +
      '<div class="mh-acts" style="justify-content:flex-end;margin-top:14px">' +
        '<button type="button" class="mh-btn" onclick="MaintenanceHub.closeOv()">Annuler</button>' +
        '<button type="button" class="mh-btn ok" onclick="MaintenanceHub.doQualify(\'' + esc(id) + '\',false)"><i class="fa-solid fa-check"></i> ' + (pend ? 'Valider &amp; Envoyer au Journal' : 'Enregistrer la rectification') + '</button>' +
        (!pend ? '<button type="button" class="mh-btn da" onclick="MaintenanceHub.doQualify(\'' + esc(id) + '\',true)"><i class="fa-solid fa-file-word"></i> Enregistrer &amp; DA .docx</button>' : '') +
      '</div>'
    );
  }

  function updQualPrev(id) {
    var x = find(id); if (!x) return;
    var tp = ($('mhQType') && $('mhQType').value) || effType(x);
    var km = Number($('mhQKm') && $('mhQKm').value) || 0;
    var imm = ($('mhQImm') && $('mhQImm').value) || '';
    var chas = ($('mhQChas') && $('mhQChas').value) || '';
    var box = $('mhQPrev');
    if (box) box.innerHTML = previewDesigHtml(tp, x.truckName, x.deviceId, km, imm, chas);
  }

  async function doQualify(id, andDownload) {
    var x = find(id); if (!x) return;
    var wasPend = isPending(x);
    var tp = ($('mhQType') && $('mhQType').value) || effType(x);
    var km = Math.round(Number($('mhQKm') && $('mhQKm').value) || 0);
    var dt = ($('mhQDate') && $('mhQDate').value) || '';
    var imm = ($('mhQImm') && $('mhQImm').value || '').trim();
    var chas = ($('mhQChas') && $('mhQChas').value || '').trim();
    var loc = ($('mhQLoc') && $('mhQLoc').value || '').trim();
    var cost = ($('mhQCost') && $('mhQCost').value) || '';
    var tech = ($('mhQTech') && $('mhQTech').value || '').trim();
    var note = ($('mhQNote') && $('mhQNote').value || '').trim();
    if (/vidange/i.test(tp) && km <= 0) { toast('Kilométrage requis pour une vidange.', 'warning'); return; }
    try {
      await api('/api/maintenance/' + encodeURIComponent(id) + '/classify', 'PATCH', {
        type: tp, odometer: km, date: dt ? new Date(dt + 'T12:00:00').toISOString() : undefined,
        immatriculation: imm, chassisNumber: chas, cost: cost === '' ? undefined : Number(cost),
        technician: tech, note: note, status: 'termine'
      });
      if (loc && loc !== String(x.location || '')) {
        await api('/api/maintenance/update', 'POST', { id: id, location: loc });
      }
      closeOv();
      toast(wasPend ? 'Intervention validée — disponible dans le Journal.' : 'Rectification enregistrée.', 'success');
      await syncAfterChange();
      if (andDownload && !wasPend) await downloadDa(id);
    } catch (e) { toast('Erreur : ' + e.message, 'error'); }
  }

  async function quickValidate(id) {
    var x = find(id); if (!x) return;
    var tp = effType(x), km = anchorKm(x);
    if (/vidange/i.test(tp) && km <= 0) { qualify(id, 'Vidange'); return; }
    try {
      await api('/api/maintenance/' + encodeURIComponent(id) + '/classify', 'PATCH', {
        type: tp, odometer: km, status: 'termine'
      });
      toast('Validée (' + tp + ') — prête pour DA .docx dans le Journal.', 'success');
      await syncAfterChange();
    } catch (e) { toast('Erreur : ' + e.message, 'error'); }
  }

  function closeDlg(id) {
    var x = find(id); if (!x) return;
    var km = anchorKm(x);
    dlg(
      '<h3>Terminer l\'intervention en cours</h3>' +
      '<div class="mh-sub">Camion : <b>' + esc(x.truckName || x.deviceId) + '</b> · ' + esc(effType(x)) + '</div>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">' +
        '<div><label>Compteur sortie (km)</label><input id="mhCKm" type="number" value="' + km + '"></div>' +
        '<div><label>Coût (DA)</label><input id="mhCCost" type="number" value="' + (Number(x.cost) || '') + '" placeholder="0"></div>' +
      '</div>' +
      '<label>Technicien</label><input id="mhCTech" type="text" value="' + esc(x.technician || '') + '">' +
      '<label>Note de clôture</label><input id="mhCNote" type="text" value="' + esc(x.note || '') + '">' +
      '<div class="mh-acts" style="justify-content:flex-end;margin-top:14px">' +
        '<button type="button" class="mh-btn" onclick="MaintenanceHub.closeOv()">Annuler</button>' +
        '<button type="button" class="mh-btn ok" onclick="MaintenanceHub.doClose(\'' + esc(id) + '\')"><i class="fa-solid fa-check"></i> Clôturer</button>' +
      '</div>'
    );
  }
  async function doClose(id) {
    var x = find(id); if (!x) return;
    var km = Math.round(Number($('mhCKm') && $('mhCKm').value) || 0);
    var cost = Number($('mhCCost') && $('mhCCost').value) || 0;
    var tech = ($('mhCTech') && $('mhCTech').value || '').trim();
    var note = ($('mhCNote') && $('mhCNote').value || '').trim();
    try {
      await api('/api/maintenance/' + encodeURIComponent(id) + '/complete', 'PATCH', {
        odometer: km, cost: cost, technician: tech, note: note
      });
      closeOv();
      toast('Intervention clôturée et transférée au Journal.', 'success');
      await syncAfterChange();
    } catch (e) { toast('Erreur : ' + e.message, 'error'); }
  }
  async function cancel(id) {
    if (!(await ask('Ignorer / annuler cette intervention ?'))) return;
    try {
      await api('/api/maintenance/' + encodeURIComponent(id) + '/cancel', 'PATCH', {});
      delete S.sel[id];
      toast('Intervention annulée.', 'info');
      await syncAfterChange();
    } catch (e) { toast('Erreur : ' + e.message, 'error'); }
  }
  async function reopen(id) {
    try {
      await api('/api/maintenance/' + encodeURIComponent(id) + '/reopen', 'PATCH', {});
      toast('Intervention rouverte.', 'info');
      await syncAfterChange();
    } catch (e) { toast('Erreur : ' + e.message, 'error'); }
  }

  // ───────────────────────── DEMANDE DE SERVICE (.DOCX) & EXPORTS ─────────────────────────
  function triggerBlob(blob, filename) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = filename || 'Demande_Service.docx';
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { a.remove(); URL.revokeObjectURL(url); }, 1500);
  }
  function b64ToBlob(b64, mime) {
    var bin = atob(b64), len = bin.length, u8 = new Uint8Array(len);
    for (var i = 0; i < len; i++) u8[i] = bin.charCodeAt(i);
    return new Blob([u8], { type: mime });
  }

  async function downloadDa(id) {
    var x = find(id);
    if (!x || !canDownloadDa(x)) {
      toast('Action bloquée : validez d\'abord cette intervention avant de générer la DA (.docx).', 'warning');
      return;
    }
    try {
      var h = {}; var c = code(); if (c) h['x-access-code'] = c;
      var r = await fetch(base() + '/api/maintenance/' + encodeURIComponent(id) + '/demande-service.docx', { headers: h });
      if (!r.ok) {
        var errJ = null; try { errJ = await r.json(); } catch (_) {}
        throw new Error((errJ && errJ.error) || ('HTTP ' + r.status));
      }
      var cd = r.headers.get('Content-Disposition') || '';
      var m = cd.match(/filename="?([^";]+)"?/i);
      var fname = m ? m[1] : ('DA_' + String(x.truckName || 'Camion').replace(/\s+/g, '_') + '.docx');
      var blob = await r.blob();
      triggerBlob(blob, fname);
      toast('Demande de Service téléchargée : ' + fname, 'success');
    } catch (e) { toast('Erreur DA .docx : ' + e.message, 'error'); }
  }

  async function downloadBulk(mode) {
    var ids = selIds();
    if (!ids.length) { toast('Sélectionnez au moins une prestation validée dans le Journal.', 'warning'); return; }
    if (S.dlBusy) return;
    S.dlBusy = true;
    var bm = $('mhBulkMount'); if (bm) bm.innerHTML = bulkBarInnerHtml();
    try {
      var h = { 'Content-Type': 'application/json' };
      var c = code(); if (c) h['x-access-code'] = c;
      var fmt = mode === 'zip' ? 'zip' : 'files';
      var r = await fetch(base() + '/api/maintenance/demande-service-bulk', {
        method: 'POST', headers: h, body: JSON.stringify({ ids: ids, format: fmt })
      });
      if (!r.ok) {
        var ej = null; try { ej = await r.json(); } catch (_) {}
        throw new Error((ej && ej.error) || ('HTTP ' + r.status));
      }
      if (fmt === 'zip') {
        var blob = await r.blob();
        triggerBlob(blob, 'Demandes_Service_' + new Date().toISOString().slice(0, 10) + '.zip');
        toast(ids.length + ' DA (.docx) téléchargées en archive ZIP.', 'success');
      } else {
        var j = await r.json();
        var files = (j && j.files) || [];
        for (var i = 0; i < files.length; i++) {
          (function (f, idx) {
            setTimeout(function () {
              triggerBlob(b64ToBlob(f.base64, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'), f.filename);
            }, idx * 200);
          })(files[i], i);
        }
        toast(files.length + ' fichier(s) DA (.docx) générés.', 'success');
      }
    } catch (e) { toast('Erreur téléchargement multiple : ' + e.message, 'error'); }
    S.dlBusy = false;
    var bm2 = $('mhBulkMount'); if (bm2) bm2.innerHTML = bulkBarInnerHtml();
  }

  function exportCsv() {
    var list = filteredJournal();
    if (!list.length) { toast('Aucune ligne à exporter.', 'warning'); return; }
    var sep = ';';
    var rows = [['Date', 'Heure', 'Tracteur', 'Immatriculation', 'Numero Chassis', 'Prestation', 'Pack KM', 'Compteur KM', 'Site / Atelier', 'Cout DA', 'Technicien', 'Statut'].join(sep)];
    list.forEach(function (x) {
      var m = truckDbMeta(x.deviceId, x.truckName), et = effType(x);
      var pk = /vidange/i.test(et) && Number(x.odometer) > 0 ? closestPackKm(x.odometer, x.deviceId) : '';
      var st = stOf(x) === 'annule' ? 'Annule' : (isPending(x) ? 'A valider' : 'Valide');
      var cells = [fmtD(x.date), fmtTime(x.date), x.truckName || '', x.immatriculation || m.immatriculation || '', x.chassisNumber || m.chassisNumber || '', et, pk, Number(x.odometer) || '', x.location || '', Number(x.cost) || 0, x.technician || '', st];
      rows.push(cells.map(function (v) { return '"' + String(v).replace(/"/g, '""') + '"'; }).join(sep));
    });
    triggerBlob(new Blob(['\uFEFF' + rows.join('\r\n')], { type: 'text/csv;charset=utf-8' }), 'Journal_Maintenance_' + new Date().toISOString().slice(0, 10) + '.csv');
  }

  function pdf() {
    if (window.FleetPDF && typeof FleetPDF.generateMaintenanceReport === 'function') {
      FleetPDF.generateMaintenanceReport(S.logs, S.truck ? truckById(S.truck) : null);
    } else { window.print(); }
  }

  // ───────────────────────── INSTANT MULTI-SELECT & NAVIGATION ─────────────────────────
  function syncMasterChk() {
    var m = $('mhMasterChk'); if (!m) return;
    var slice = filteredJournal().slice(0, 350).filter(canDownloadDa).map(idOf);
    m.disabled = !slice.length;
    m.checked = slice.length > 0 && slice.every(function (k) { return !!S.sel[k]; });
  }
  function toggleSel(id, on) {
    var x = find(id);
    if (on && x && canDownloadDa(x)) S.sel[id] = true;
    else delete S.sel[id];
    var row = $('mhRow_' + id);
    if (row) row.classList.toggle('sel', !!S.sel[id]);
    syncMasterChk();
    var bm = $('mhBulkMount'); if (bm) bm.innerHTML = bulkBarInnerHtml();
  }
  function selAllVis(on) {
    var slice = filteredJournal().slice(0, 350);
    slice.forEach(function (x) {
      if (!canDownloadDa(x)) return;
      var k = idOf(x);
      if (on) S.sel[k] = true; else delete S.sel[k];
      var row = $('mhRow_' + k);
      if (row) row.classList.toggle('sel', !!on);
    });
    document.querySelectorAll('.mh-rowchk').forEach(function (cb) { cb.checked = !!on; });
    syncMasterChk();
    var bm = $('mhBulkMount'); if (bm) bm.innerHTML = bulkBarInnerHtml();
  }
  function clearSel() {
    S.sel = {};
    document.querySelectorAll('.mh-rowchk').forEach(function (cb) { cb.checked = false; });
    document.querySelectorAll('.mh-tbl tbody tr.sel').forEach(function (tr) { tr.classList.remove('sel'); });
    var m = $('mhMasterChk'); if (m) m.checked = false;
    var bm = $('mhBulkMount'); if (bm) bm.innerHTML = '';
  }

  function setJSearch(v) { S.jSearch = v || ''; refreshJournalBody(); }
  function setJFilter(k, v) { S[k] = v; refreshJournalBody(); }
  function setJDate(k, v) { S[k] = v || ''; S.jPeriod = (S.jFrom || S.jTo) ? 'custom' : 'all'; render(); }
  function setJPeriod(p) { S.jPeriod = p; S.jFrom = ''; S.jTo = ''; render(); }
  function resetJFilters() {
    S.jSearch = ''; S.jType = ''; S.jSite = ''; S.jStatus = 'no_cancel';
    S.jPeriod = 'all'; S.jFrom = ''; S.jTo = '';
    render();
  }
  function openJournalForTruck(name) {
    S.view = 'history'; S.jSearch = name || ''; S.jType = ''; S.jSite = '';
    S.jStatus = 'no_cancel'; S.jPeriod = 'all'; S.jFrom = ''; S.jTo = '';
    render();
  }

  function go(v, extra) {
    S.view = v;
    if (v === 'todo' && extra) S.todoFilter = extra;
    render();
  }
  function setTodo(v) { S.todoFilter = v; render(); }
  function setSearch(v) {
    S.search = v || '';
    render();
    var inp = $('mhSearch');
    if (inp) { inp.focus(); try { inp.setSelectionRange(inp.value.length, inp.value.length); } catch (_) {} }
  }
  function openTruck(id) { S.truck = id || ''; S.view = 'truck'; render(); }
  function setT(v) { S.tFilter = v; render(); }
  function togglePAll(on) { S.pAll = !!on; render(); }
  function refresh() { S.loadedAt = 0; load(true); }
  function mount() { render(); load(false); }

  window.MaintenanceHub = {
    mount: mount, refresh: refresh, go: go, setTodo: setTodo, setSearch: setSearch,
    openTruck: openTruck, setT: setT, togglePAll: togglePAll,
    newVidange: newVidange, nvPick: nvPick, nvUpdPrev: nvUpdPrev, doNewVidange: doNewVidange,
    qualify: qualify, updQualPrev: updQualPrev, doQualify: doQualify, quickValidate: quickValidate,
    closeDlg: closeDlg, doClose: doClose, cancel: cancel, reopen: reopen, closeOv: closeOv,
    downloadDa: downloadDa, downloadBulk: downloadBulk, exportCsv: exportCsv, pdf: pdf,
    toggleSel: toggleSel, selAllVis: selAllVis, clearSel: clearSel,
    setJSearch: setJSearch, setJFilter: setJFilter, setJDate: setJDate,
    setJPeriod: setJPeriod, resetJFilters: resetJFilters, openJournalForTruck: openJournalForTruck
  };

  function patch() {
    if (!window.ui || window.ui.__mhPatchedV5) return false;
    window.ui.__mhPatchedV5 = true;
    window.ui.renderVidangeSection = function () { mount(); };
    window.ui.quickAddVidange = function (devId) { newVidange(devId, 'Vidange'); };
    var origFetch = window.ui.fetchAndRenderMaintenance;
    window.ui.fetchAndRenderMaintenance = async function () {
      if (typeof origFetch === 'function') { try { await origFetch.apply(this, arguments); } catch (_) {} }
      S.loadedAt = 0; await load(true);
    };
    if (root()) mount();
    return true;
  }
  if (!patch()) {
    var iv = setInterval(function () { if (patch()) clearInterval(iv); }, 150);
    setTimeout(function () { clearInterval(iv); }, 15000);
  }
})();
