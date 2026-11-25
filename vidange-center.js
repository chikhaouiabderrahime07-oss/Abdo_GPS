/* ═══════════════════════════════════════════════════════════════════════
 * VIDANGE CENTER v1 — Dedicated Real-Time Fleet Vidange & Planning Hub
 * Strictly applies Calibration Globale + Règles de Flotte per truck,
 * anchored on each truck's individual last recorded vidange (km & date).
 * ═══════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var S = {
    logs: [],
    dbTrucks: [],
    loadedAt: 0,
    loading: false,
    filter: 'all',      // all | overdue | alert | upcoming | ok | nohist
    ruleFilter: 'all',  // all | __global__ | <ruleName>
    sort: 'urgent',     // urgent | odo | recent | name
    viewMode: 'cards',  // cards | table
    search: '',
    showQueue: true
  };
  var TTL = 20000;

  function fc() { return (typeof FLEET_CONFIG !== 'undefined' && FLEET_CONFIG) || window.FLEET_CONFIG || {}; }
  function appRef() { return (typeof app !== 'undefined' && app) || window.app || null; }
  function uiRef() { return (typeof ui !== 'undefined' && ui) || window.ui || null; }
  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function num(n) { return Number(n || 0).toLocaleString('fr-FR'); }
  function fmtD(d) {
    if (!d) return '—';
    var x = new Date(d);
    return isNaN(x) ? '—' : x.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }
  function daysSince(d) {
    if (!d) return null;
    var x = new Date(d);
    if (isNaN(x)) return null;
    return Math.max(0, Math.floor((Date.now() - x.getTime()) / 86400000));
  }
  function toast(m, t) { if (window.showToast) window.showToast(m, t || 'info'); }
  function base() { var c = fc(); return (c.API && c.API.baseUrl) || ''; }
  function code() {
    var u = uiRef(), c = fc();
    return localStorage.getItem('fleetAccessCode') || (u && u.currentCode) || c.accessCode || 'Douroub_2025_Admin_Secure';
  }
  async function api(path, method, body) {
    var h = { 'Content-Type': 'application/json' };
    var c = code(); if (c) h['x-access-code'] = c;
    var r = await fetch(base() + path, { method: method || 'GET', headers: h, body: body ? JSON.stringify(body) : undefined });
    var j = null; try { j = await r.json(); } catch (_) {}
    if (!r.ok) throw new Error((j && j.error) || ('HTTP ' + r.status));
    return j;
  }

  function dbOdo(d) {
    var m = d && d.model ? String(d.model).toUpperCase() : '';
    if ((m.indexOf('HOWO') >= 0 || !(d && d.params && d.params.io192)) && d && d.odometer) return Math.round(parseFloat(d.odometer) || 0);
    if (d && d.params && d.params.io192) return Math.round((parseInt(d.params.io192, 10) || 0) / 1000);
    return Math.round(parseFloat(d && d.odometer) || 0);
  }

  function trucks() {
    var a = appRef();
    var live = (a && typeof a.getAllTrucks === 'function') ? a.getAllTrucks() : [];
    if (live && live.length > 0) return live;
    var u = uiRef();
    var cache = (u && Array.isArray(u.truckDbCache) && u.truckDbCache.length) ? u.truckDbCache : S.dbTrucks;
    var seen = {};
    return (cache || []).filter(function (d) {
      var id = String((d && d.deviceId) || '');
      if (!id || id === 'undefined' || id === 'null' || seen[id]) return false;
      seen[id] = true;
      return true;
    }).map(function (d) {
      var rCfg = resolveTruckRule(d.deviceId);
      return { id: String(d.deviceId), name: rCfg.alias || d.truckName || String(d.deviceId), odometer: dbOdo(d), vidange: {} };
    });
  }
  function truckById(id) { return trucks().find(function (t) { return String(t.id) === String(id); }); }
  function truckMeta(devId, name) {
    var u = uiRef();
    var cache = (u && Array.isArray(u.truckDbCache) && u.truckDbCache.length) ? u.truckDbCache : S.dbTrucks;
    return cache.find(function (d) { return devId && String(d.deviceId) === String(devId); }) ||
      cache.find(function (d) { return name && String(d.truckName) === String(name) && d.immatriculation; }) || {};
  }

  function resolveTruckRule(devId) {
    var root = fc(), g = root.DEFAULT_TRUCK_CONFIG || {};
    var fn = (typeof getTruckConfig === 'function' && getTruckConfig) || window.getTruckConfig;
    var cfg = (fn && devId) ? fn(String(devId)) : g;
    var pInt = function (v, def) { var n = parseInt(v, 10); return (Number.isFinite(n) && n >= 0) ? n : def; };
    return {
      startKm: pInt(cfg.vidangeStartKm !== undefined ? cfg.vidangeStartKm : g.vidangeStartKm, 5000),
      rotKm: Math.max(1000, pInt(cfg.vidangeRotationKm !== undefined ? cfg.vidangeRotationKm : g.vidangeRotationKm, 25000)),
      alertKm: pInt(cfg.vidangeAlertKm !== undefined ? cfg.vidangeAlertKm : g.vidangeAlertKm, 500),
      ruleName: cfg.ruleName || '',
      alias: cfg.alias || '',
      isCustom: !!cfg.ruleName
    };
  }

  function isCancelled(x) { return /^annul|cancel/i.test(String((x && x.status) || '')); }
  function isVidangeEntry(x) { return x && !isCancelled(x) && /vidange/i.test(String(x.type || '')); }

  function resolveLastVidange(devId) {
    var id = String(devId || '');
    var hist = S.logs.filter(function (x) {
      return String(x.deviceId) === id && isVidangeEntry(x) && Number(x.odometer) > 0;
    }).sort(function (a, b) {
      return (Number(b.odometer) - Number(a.odometer)) || (new Date(b.date || 0) - new Date(a.date || 0));
    });

    var root = fc();
    var ovrMap = root.VIDANGE_OVERRIDES || root.vidangeOverrides || {};
    var ovr = ovrMap[id] || null;
    var ovrKm = ovr ? Math.round(Number(ovr.lastVidangeKm || ovr.odometerAtConfirm || ovr.skipUntilKm) || 0) : 0;
    var topLog = hist[0] || null;
    var logKm = topLog ? Math.round(Number(topLog.odometer) || 0) : 0;

    if (logKm >= ovrKm && logKm > 0) {
      return { lastKm: logKm, lastDate: topLog.date || topLog.createdAt || null, lastLoc: topLog.location || '', count: hist.length, hist: hist };
    }
    if (ovrKm > 0) {
      return { lastKm: ovrKm, lastDate: ovr.confirmedAt || (topLog && topLog.date) || null, lastLoc: (topLog && topLog.location) || '', count: Math.max(1, hist.length), hist: hist };
    }
    return { lastKm: 0, lastDate: null, lastLoc: '', count: hist.length, hist: hist };
  }

  function closestPackKm(km, rule) {
    var odo = Math.round(Number(km) || 0);
    if (odo <= 0 || odo <= rule.startKm) return rule.startKm > 0 ? rule.startKm : rule.rotKm;
    return rule.startKm + Math.max(0, Math.round((odo - rule.startKm) / rule.rotKm)) * rule.rotKm;
  }

  function computeTruckEntry(t) {
    var odo = Math.round(Number(t.odometer) || 0);
    var rule = resolveTruckRule(t.id);
    var lv = resolveLastVidange(t.id);
    var calcFn = (typeof calculateVidangeStatus === 'function' && calculateVidangeStatus) || window.calculateVidangeStatus;
    var calc = calcFn
      ? calcFn(odo, { vidangeStartKm: rule.startKm, vidangeRotationKm: rule.rotKm, vidangeAlertKm: rule.alertKm }, lv.lastKm || null)
      : null;

    var nextKm = (calc && Number.isFinite(Number(calc.nextKm)))
      ? Number(calc.nextKm)
      : (lv.lastKm > 0 ? lv.lastKm + rule.rotKm : (odo <= rule.startKm ? rule.startKm : rule.startKm + Math.floor((odo - rule.startKm) / rule.rotKm) * rule.rotKm));

    var kmRem = nextKm - odo;
    var baseKm = lv.lastKm > 0 ? lv.lastKm : Math.max(0, nextKm - rule.rotKm);
    var kmDriven = Math.max(0, odo - baseKm);
    var pct = Math.max(0, Math.min(100, Math.round((kmDriven / Math.max(1, rule.rotKm)) * 100)));
    var upcomingSpan = Math.max(rule.alertKm * 3, Math.round(rule.rotKm * 0.15), 2500);

    var tier = 'ok';
    if (kmRem < 0) tier = 'overdue';
    else if (kmRem <= rule.alertKm) tier = 'alert';
    else if (kmRem <= upcomingSpan) tier = 'upcoming';

    if (calc) t.vidange = calc;
    var meta = truckMeta(t.id, t.name);
    return {
      id: String(t.id), name: t.name || String(t.id), odo: odo,
      imm: meta.immatriculation || '', chassis: meta.chassisNumber || '', driver: meta.driverName || '',
      rule: rule, lastKm: lv.lastKm, lastDate: lv.lastDate, lastLoc: lv.lastLoc,
      vidCount: lv.count, hist: lv.hist,
      nextKm: nextKm, kmRem: kmRem, kmDriven: kmDriven, pct: pct, tier: tier
    };
  }

  function injectCss() {
    if ($('vcCss')) return;
    var st = document.createElement('style');
    st.id = 'vcCss';
    st.textContent = [
      '.vc{--bg:#131c2e;--surf:#0c1322;--head:#19253b;--bd:rgba(255,255,255,.11);--tx:#f1f5f9;--mu:#94a3b8;color:var(--tx);padding:4px 0 24px}',
      ':root[data-theme="light"] .vc{--bg:#ffffff;--surf:#f8fafc;--head:#f1f5f9;--bd:#e2e8f0;--tx:#0f172a;--mu:#475569}',
      '.vc-hero{background:var(--bg);border:1px solid var(--bd);border-radius:16px;padding:18px 20px;margin-bottom:14px;display:flex;justify-content:space-between;align-items:center;gap:14px;flex-wrap:wrap;box-shadow:0 2px 10px rgba(0,0,0,.05)}',
      '.vc-calbar{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:6px}',
      '.vc-chip{font-size:11px;font-weight:700;padding:4px 10px;border-radius:999px;background:var(--head);border:1px solid var(--bd);color:var(--mu);display:inline-flex;align-items:center;gap:5px}',
      '.vc-kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(165px,1fr));gap:10px;margin-bottom:14px}',
      '.vc-kpi{background:var(--bg);border:1px solid var(--bd);border-left:4px solid var(--kc,#64748b);border-radius:14px;padding:13px 16px;cursor:pointer;transition:.15s;box-shadow:0 1px 4px rgba(0,0,0,.05)}',
      '.vc-kpi:hover,.vc-kpi.on{transform:translateY(-2px);border-color:var(--kc,#64748b)}',
      '.vc-kpi b{display:block;font-size:24px;font-weight:800;color:var(--kc,#64748b);line-height:1.15}',
      '.vc-kpi span{font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--mu)}',
      '.vc-qbox{background:var(--bg);border:1px solid rgba(245,158,11,.35);border-radius:15px;padding:14px 16px;margin-bottom:14px}',
      '.vc-qstrip{display:flex;gap:10px;overflow-x:auto;padding-bottom:4px}',
      '.vc-qitem{min-width:235px;max-width:265px;flex-shrink:0;background:var(--surf);border:1px solid var(--bd);border-left:4px solid var(--qc);border-radius:12px;padding:11px 13px;display:flex;flex-direction:column;gap:6px}',
      '.vc-fbar{background:var(--bg);border:1px solid var(--bd);border-radius:14px;padding:12px 14px;margin-bottom:14px;display:flex;gap:8px;flex-wrap:wrap;align-items:center}',
      '.vc input,.vc select{width:auto!important;padding:8px 11px;border-radius:9px;border:1px solid var(--bd);background:var(--surf);color:var(--tx);font-size:12px;font-family:inherit;outline:none}',
      '.vc-pill{padding:6px 12px;border-radius:999px;border:1px solid var(--bd);background:var(--surf);color:var(--mu);font-size:11.5px;font-weight:700;cursor:pointer;font-family:inherit;transition:.12s}',
      '.vc-pill.on{background:#f59e0b;border-color:#f59e0b;color:#111}',
      '.vc-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(325px,1fr));gap:14px}',
      '.vc-card{background:var(--bg);border:1px solid var(--bd);border-top:3px solid var(--cc,#16a34a);border-radius:15px;padding:15px;display:flex;flex-direction:column;gap:11px;box-shadow:0 2px 8px rgba(0,0,0,.05);transition:.15s}',
      '.vc-card:hover{transform:translateY(-2px);box-shadow:0 8px 22px rgba(0,0,0,.1)}',
      '.vc-prog{height:8px;border-radius:999px;background:rgba(148,163,184,.22);overflow:hidden;position:relative}',
      '.vc-prog>div{height:100%;background:var(--cc,#16a34a);border-radius:999px;transition:width .25s}',
      '.vc-cells{display:grid;grid-template-columns:1fr 1fr;gap:8px}',
      '.vc-cell{background:var(--surf);border:1px solid var(--bd);border-radius:10px;padding:8px 10px}',
      '.vc-cell small{display:block;font-size:10px;font-weight:700;text-transform:uppercase;color:var(--mu);margin-bottom:2px}',
      '.vc-cell b{font-size:13px;font-weight:800}',
      '.vc-btn{padding:7px 12px;border-radius:9px;border:1px solid var(--bd);background:var(--surf);color:var(--tx);font-size:11.5px;font-weight:700;cursor:pointer;font-family:inherit;display:inline-flex;align-items:center;gap:6px;white-space:nowrap;transition:.12s}',
      '.vc-btn:hover{border-color:#f59e0b}',
      '.vc-btn.pri{background:linear-gradient(135deg,#f59e0b,#ea580c);border:none;color:#fff;box-shadow:0 2px 8px rgba(245,158,11,.3)}',
      '.vc-btn.ok{background:#16a34a;border-color:#16a34a;color:#fff}',
      '.vc-btn.da{background:#0284c7;border-color:#0284c7;color:#fff}',
      '.vc-btn.grow{flex:1;justify-content:center}',
      '.vc-tbl{width:100%;border-collapse:collapse;font-size:12px;background:var(--bg)}',
      '.vc-tbl th{background:var(--head);color:var(--mu);font-size:10px;font-weight:800;text-transform:uppercase;padding:11px 12px;text-align:left;border-bottom:1px solid var(--bd)}',
      '.vc-tbl td{padding:11px 12px;border-bottom:1px solid var(--bd);vertical-align:middle}',
      '.vc-ov{position:fixed;inset:0;background:rgba(15,23,42,.68);backdrop-filter:blur(3px);z-index:10060;display:flex;align-items:center;justify-content:center;padding:16px}',
      '.vc-dlg{background:var(--bg-elevated,#1a2332);color:var(--text-primary,#f1f5f9);border:1px solid rgba(148,163,184,.25);border-radius:16px;width:100%;max-width:540px;padding:20px;max-height:90vh;overflow:auto;box-shadow:0 20px 50px rgba(0,0,0,.4)}',
      ':root[data-theme="light"] .vc-dlg{background:#ffffff;color:#0f172a;border-color:#cbd5e1}',
      '.vc-dlg label{display:block;font-size:11px;font-weight:700;color:#64748b;margin:10px 0 4px}',
      '.vc-dlg input,.vc-dlg select{width:100%!important;box-sizing:border-box;padding:8px 11px;border-radius:9px;border:1px solid rgba(148,163,184,.35);background:var(--bg-surface,#0f172a);color:inherit;font-size:12px}',
      ':root[data-theme="light"] .vc-dlg input,:root[data-theme="light"] .vc-dlg select{background:#f8fafc;color:#0f172a;border-color:#cbd5e1}'
    ].join('\n');
    document.head.appendChild(st);
  }

  async function load(force) {
    if (S.loading) return;
    if (!force && S.loadedAt && Date.now() - S.loadedAt < TTL) { render(); return; }
    S.loading = true;
    render();
    try {
      var u = uiRef();
      if (u && !u.lastSettingsSync && typeof u.loadSettingsFromCloud === 'function') {
        try { await u.loadSettingsFromCloud(); } catch (_) {}
      }
      if (u && (!u.truckDbCache || !u.truckDbCache.length) && typeof u.loadTruckDbCache === 'function') {
        await u.loadTruckDbCache();
      }
      if ((!u || !u.truckDbCache || !u.truckDbCache.length) && !S.dbTrucks.length) {
        try { var dbt = await api('/api/trucks/db'); if (Array.isArray(dbt)) S.dbTrucks = dbt; } catch (_) {}
      }
      var j = await api('/api/maintenance?limit=2000');
      S.logs = Array.isArray(j) ? j : (j.data || []);
      if (u) u.allMaintenanceLogs = S.logs;
      S.loadedAt = Date.now();
    } catch (e) { console.warn('[VidangeCenter] load error:', e.message); }
    S.loading = false;
    render();
  }

  async function syncAll() {
    var u = uiRef(), a = appRef();
    try { if (u && u.loadSettingsFromCloud) await u.loadSettingsFromCloud(); } catch (_) {}
    try { if (a && a.forceRecalculateVidanges) a.forceRecalculateVidanges(); } catch (_) {}
    try { if (window.MaintenanceHub && MaintenanceHub.refresh) MaintenanceHub.refresh(); } catch (_) {}
    try { if (u && u.renderStats) u.renderStats(); } catch (_) {}
    S.loadedAt = 0; S.loading = false;
    await load(true);
  }

  function allEntries() {
    return trucks().map(computeTruckEntry);
  }

  function filteredList(all) {
    var q = (S.search || '').trim().toLowerCase();
    var list = all.filter(function (e) {
      if (S.filter === 'overdue' && e.tier !== 'overdue') return false;
      if (S.filter === 'alert' && e.tier !== 'alert') return false;
      if (S.filter === 'upcoming' && e.tier !== 'upcoming') return false;
      if (S.filter === 'ok' && e.tier !== 'ok') return false;
      if (S.filter === 'nohist' && e.lastKm > 0) return false;

      if (S.ruleFilter === '__global__' && e.rule.isCustom) return false;
      if (S.ruleFilter !== 'all' && S.ruleFilter !== '__global__' && e.rule.ruleName !== S.ruleFilter) return false;

      if (q) {
        var hay = [e.name, e.imm, e.chassis, e.driver, e.rule.ruleName || 'global'].join(' ').toLowerCase();
        if (hay.indexOf(q) < 0) return false;
      }
      return true;
    });

    list.sort(function (a, b) {
      if (S.sort === 'name') return String(a.name).localeCompare(String(b.name), 'fr', { numeric: true });
      if (S.sort === 'odo') return b.odo - a.odo;
      if (S.sort === 'recent') return (new Date(b.lastDate || 0) - new Date(a.lastDate || 0)) || (b.lastKm - a.lastKm);
      return a.kmRem - b.kmRem;
    });
    return list;
  }

  function tierMeta(tier) {
    if (tier === 'overdue') return { col: '#ef4444', bg: 'rgba(239,68,68,.15)', lbl: 'EN RETARD', ic: 'fa-triangle-exclamation' };
    if (tier === 'alert') return { col: '#f97316', bg: 'rgba(249,115,22,.16)', lbl: 'ALERTE CALIBRATION', ic: 'fa-bell' };
    if (tier === 'upcoming') return { col: '#eab308', bg: 'rgba(234,179,8,.16)', lbl: 'PROCHAINE', ic: 'fa-clock' };
    return { col: '#16a34a', bg: 'rgba(22,163,74,.14)', lbl: 'CONFORME', ic: 'fa-circle-check' };
  }

  function renderQueueHtml(all) {
    var due = all.filter(function (e) { return e.tier !== 'ok'; }).sort(function (a, b) { return a.kmRem - b.kmRem; });
    if (!due.length) return '';
    return '<div class="vc-qbox">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:' + (S.showQueue ? '10px' : '0') + '">' +
        '<span style="font-size:12.5px;font-weight:800;display:flex;align-items:center;gap:8px"><i class="fa-solid fa-bolt" style="color:#f59e0b"></i> File Prioritaire — Vidanges Urgentes &amp; Prochaines (' + due.length + ')</span>' +
        '<button type="button" class="vc-btn" style="padding:4px 10px;font-size:11px" onclick="VidangeCenter.toggleQueue()">' + (S.showQueue ? 'Masquer' : 'Afficher') + '</button>' +
      '</div>' +
      (S.showQueue ? '<div class="vc-qstrip">' + due.slice(0, 14).map(function (e) {
        var tm = tierMeta(e.tier);
        var remTxt = e.kmRem < 0 ? ('Retard ' + num(Math.abs(e.kmRem)) + ' km') : ('Reste ' + num(e.kmRem) + ' km');
        return '<div class="vc-qitem" style="--qc:' + tm.col + '">' +
          '<div style="display:flex;justify-content:space-between;align-items:center;gap:6px">' +
            '<b style="font-size:13.5px">' + esc(e.name) + '</b>' +
            '<span style="font-size:9.5px;font-weight:800;padding:2px 7px;border-radius:999px;background:' + tm.bg + ';color:' + tm.col + '">' + tm.lbl + '</span>' +
          '</div>' +
          '<div style="font-size:12px;font-weight:800;color:' + tm.col + '">' + remTxt + ' <span style="font-weight:600;color:var(--mu)">→ ' + num(e.nextKm) + ' km</span></div>' +
          '<div style="font-size:10.5px;color:var(--mu)">Actuel : ' + num(e.odo) + ' km · ' + (e.lastKm ? 'Dernière : ' + num(e.lastKm) + ' km' : 'Sans historique') + '</div>' +
          '<button type="button" class="vc-btn pri" style="margin-top:2px;justify-content:center;padding:5px 10px" onclick="VidangeCenter.openCreate(\'' + esc(e.id) + '\')"><i class="fa-solid fa-oil-can"></i> Déclarer Vidange</button>' +
        '</div>';
      }).join('') + '</div>' : '') +
    '</div>';
  }

  function renderCards(list) {
    if (!list.length) {
      return '<div style="background:var(--bg);border:1px solid var(--bd);border-radius:15px;padding:42px 18px;text-align:center;color:var(--mu)"><i class="fa-solid fa-oil-can" style="font-size:32px;opacity:.35;display:block;margin-bottom:10px"></i>Aucun camion ne correspond aux filtres sélectionnés.</div>';
    }
    return '<div class="vc-grid">' + list.map(function (e) {
      var tm = tierMeta(e.tier);
      var ds = daysSince(e.lastDate);
      var remStr = e.kmRem < 0 ? ('Retard ' + num(Math.abs(e.kmRem)) + ' km') : ('Reste ' + num(e.kmRem) + ' km');
      var ruleTag = (e.rule.isCustom ? '⚙️ ' + esc(e.rule.ruleName) : '🌐 Global') + ' · Rot. ' + num(e.rule.rotKm) + ' / Alerte ' + num(e.rule.alertKm) + ' km';
      var lastSub = e.lastKm > 0
        ? (fmtD(e.lastDate) + (ds !== null ? ' · il y a ' + ds + ' j' : ''))
        : 'Basé sur 1ère vidange (' + num(e.rule.startKm) + ' km)';

      return '<div class="vc-card" style="--cc:' + tm.col + '">' +
        '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px">' +
          '<div>' +
            '<div style="font-size:16px;font-weight:800;display:flex;align-items:center;gap:7px;flex-wrap:wrap">' +
              '<span>' + esc(e.name) + '</span>' +
              (e.imm ? '<span class="vc-chip" style="padding:2px 8px;font-size:10px">' + esc(e.imm) + '</span>' : '') +
            '</div>' +
            '<div style="font-size:10.5px;color:var(--mu);margin-top:3px">' +
              (e.chassis ? '<span style="font-family:monospace">' + esc(e.chassis) + '</span> · ' : '') +
              '<span>' + ruleTag + '</span>' +
            '</div>' +
          '</div>' +
          '<span style="background:' + tm.bg + ';color:' + tm.col + ';font-size:10px;font-weight:800;padding:4px 9px;border-radius:999px;white-space:nowrap"><i class="fa-solid ' + tm.ic + '"></i> ' + tm.lbl + '</span>' +
        '</div>' +
        '<div>' +
          '<div style="display:flex;justify-content:space-between;font-size:11px;color:var(--mu);margin-bottom:5px">' +
            '<span>Parcourus : <b style="color:var(--tx)">' + num(e.kmDriven) + ' km</b> / ' + num(e.rule.rotKm) + ' km</span>' +
            '<b style="color:' + tm.col + '">' + e.pct + '%</b>' +
          '</div>' +
          '<div class="vc-prog"><div style="width:' + e.pct + '%"></div></div>' +
        '</div>' +
        '<div class="vc-cells">' +
          '<div class="vc-cell"><small>Compteur Actuel</small><b>' + num(e.odo) + ' km</b></div>' +
          '<div class="vc-cell"><small>Prochaine Échéance</small><b style="color:' + tm.col + '">' + num(e.nextKm) + ' km</b></div>' +
          '<div class="vc-cell"><small>Dernière Vidange</small><b>' + (e.lastKm ? num(e.lastKm) + ' km' : '<span style="color:#ef4444;font-size:11.5px">Non enregistrée</span>') + '</b><div style="font-size:10px;color:var(--mu);margin-top:2px">' + esc(lastSub) + '</div></div>' +
          '<div class="vc-cell"><small>Écart (Seuil ' + num(e.rule.alertKm) + ' km)</small><b style="color:' + tm.col + '">' + remStr + '</b><div style="font-size:10px;color:var(--mu);margin-top:2px">Alerte dès ' + num(Math.max(0, e.nextKm - e.rule.alertKm)) + ' km</div></div>' +
        '</div>' +
        '<div style="display:flex;gap:7px;margin-top:2px">' +
          '<button type="button" class="vc-btn ' + (e.tier === 'ok' ? '' : 'pri ') + 'grow" onclick="VidangeCenter.openCreate(\'' + esc(e.id) + '\')"><i class="fa-solid fa-oil-can"></i> Déclarer Vidange</button>' +
          '<button type="button" class="vc-btn" onclick="VidangeCenter.openHistory(\'' + esc(e.id) + '\')" title="Historique des vidanges de ce camion"><i class="fa-solid fa-clock-rotate-left"></i> Historique (' + e.vidCount + ')</button>' +
        '</div>' +
      '</div>';
    }).join('') + '</div>';
  }

  function renderTable(list) {
    if (!list.length) return renderCards(list);
    return '<div style="border:1px solid var(--bd);border-radius:15px;overflow-x:auto"><table class="vc-tbl"><thead><tr>' +
      '<th>Tracteur (IMM &amp; Châssis)</th><th>Règle Calibration</th><th>Actuel</th><th>Dernière Vidange</th><th>Parcourus</th><th>Prochaine</th><th>Reste / Retard</th><th>Statut</th><th style="text-align:right">Actions</th>' +
      '</tr></thead><tbody>' + list.map(function (e) {
        var tm = tierMeta(e.tier);
        var remStr = e.kmRem < 0 ? ('Retard ' + num(Math.abs(e.kmRem)) + ' km') : ('Reste ' + num(e.kmRem) + ' km');
        return '<tr>' +
          '<td><b>' + esc(e.name) + '</b><div style="font-size:10.5px;color:var(--mu)">' + esc(e.imm || '—') + (e.chassis ? ' · ' + esc(e.chassis) : '') + '</div></td>' +
          '<td><span class="vc-chip">' + (e.rule.isCustom ? '⚙️ ' + esc(e.rule.ruleName) : '🌐 Global') + '</span><div style="font-size:10px;color:var(--mu);margin-top:2px">Rot. ' + num(e.rule.rotKm) + ' · Alerte ' + num(e.rule.alertKm) + ' km</div></td>' +
          '<td style="font-weight:700;font-family:monospace">' + num(e.odo) + ' km</td>' +
          '<td>' + (e.lastKm ? '<b>' + num(e.lastKm) + ' km</b><div style="font-size:10.5px;color:var(--mu)">' + fmtD(e.lastDate) + '</div>' : '<span style="color:#ef4444;font-size:11px">Non enregistrée</span>') + '</td>' +
          '<td>' + num(e.kmDriven) + ' km <span style="color:var(--mu)">(' + e.pct + '%)</span></td>' +
          '<td style="font-weight:800;color:' + tm.col + '">' + num(e.nextKm) + ' km</td>' +
          '<td style="font-weight:800;color:' + tm.col + '">' + remStr + '</td>' +
          '<td><span style="background:' + tm.bg + ';color:' + tm.col + ';padding:3px 9px;border-radius:999px;font-size:10px;font-weight:800">' + tm.lbl + '</span></td>' +
          '<td style="text-align:right;white-space:nowrap"><button type="button" class="vc-btn pri" style="padding:5px 10px" onclick="VidangeCenter.openCreate(\'' + esc(e.id) + '\')"><i class="fa-solid fa-plus"></i> Vidange</button> ' +
            '<button type="button" class="vc-btn" style="padding:5px 10px" onclick="VidangeCenter.openHistory(\'' + esc(e.id) + '\')"><i class="fa-solid fa-clock-rotate-left"></i> (' + e.vidCount + ')</button></td>' +
        '</tr>';
      }).join('') + '</tbody></table></div>';
  }

  function refreshBody() {
    var wrap = $('vcBodyWrap');
    if (!wrap) return;
    var list = filteredList(allEntries());
    wrap.innerHTML = S.viewMode === 'table' ? renderTable(list) : renderCards(list);
    var cnt = $('vcCountLbl');
    if (cnt) cnt.innerHTML = '<b>' + list.length + '</b> camion(s) affiché(s)';
  }

  function render() {
    var mount = $('vidangePageRoot');
    if (!mount) return;
    injectCss();
    var all = allEntries();
    var list = filteredList(all);
    var rootCfg = fc();
    var gCfg = rootCfg.DEFAULT_TRUCK_CONFIG || {};
    var gStart = Number(gCfg.vidangeStartKm ?? 5000), gRot = Number(gCfg.vidangeRotationKm ?? 25000), gAlert = Number(gCfg.vidangeAlertKm ?? 500);
    var rules = rootCfg.FLEET_RULES || [];

    var cOver = 0, cAlert = 0, cUp = 0, cOk = 0, cNoHist = 0;
    all.forEach(function (e) {
      if (e.tier === 'overdue') cOver++;
      else if (e.tier === 'alert') cAlert++;
      else if (e.tier === 'upcoming') cUp++;
      else cOk++;
      if (!e.lastKm) cNoHist++;
    });

    var kpi = function (val, lbl, col, fKey) {
      return '<div class="vc-kpi' + (S.filter === fKey ? ' on' : '') + '" style="--kc:' + col + '" onclick="VidangeCenter.setFilter(\'' + fKey + '\')"><b>' + val + '</b><span>' + lbl + '</span></div>';
    };
    var pill = function (fKey, lbl) {
      return '<button type="button" class="vc-pill' + (S.filter === fKey ? ' on' : '') + '" onclick="VidangeCenter.setFilter(\'' + fKey + '\')">' + lbl + '</button>';
    };

    mount.innerHTML = '<div class="vc">' +
      '<div class="vc-hero">' +
        '<div>' +
          '<div style="font-size:20px;font-weight:800;display:flex;align-items:center;gap:10px">' +
            '<span style="width:38px;height:38px;border-radius:11px;background:linear-gradient(135deg,#f59e0b,#ea580c);color:#fff;display:inline-flex;align-items:center;justify-content:center;box-shadow:0 4px 12px rgba(245,158,11,.35)"><i class="fa-solid fa-oil-can"></i></span>' +
            'Suivi &amp; Planification des Vidanges' +
          '</div>' +
          '<div class="vc-calbar">' +
            '<span class="vc-chip"><i class="fa-solid fa-sliders" style="color:#f59e0b"></i> Calibration Globale : 1ère <b>' + num(gStart) + ' km</b> · Rotation <b>' + num(gRot) + ' km</b> · Alerte <b>' + num(gAlert) + ' km</b> avant</span>' +
            rules.map(function (r) {
              var rc = r.config || {};
              return '<span class="vc-chip"><i class="fa-solid fa-layer-group" style="color:#38bdf8"></i> Règle <b>' + esc(r.name) + '</b> (' + ((r.truckIds || []).length) + ') : Rot. ' + num(rc.vidangeRotationKm || gRot) + ' / Alerte ' + num(rc.vidangeAlertKm ?? gAlert) + ' km</span>';
            }).join('') +
            '<button type="button" class="vc-btn" style="padding:4px 10px;font-size:11px" onclick="switchTab(\'settings\')"><i class="fa-solid fa-gear"></i> Modifier Calibration</button>' +
          '</div>' +
        '</div>' +
        '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">' +
          '<button type="button" class="vc-btn pri" onclick="VidangeCenter.openCreate()"><i class="fa-solid fa-plus"></i> Nouvelle Vidange (Historique)</button>' +
          '<button type="button" class="vc-btn" onclick="if(window.ui&&ui.openVidangeScanModal)ui.openVidangeScanModal()"><i class="fa-solid fa-satellite-dish"></i> Scan GPS</button>' +
          '<button type="button" class="vc-btn" onclick="VidangeCenter.exportCsv()"><i class="fa-solid fa-file-csv"></i> CSV</button>' +
          '<button type="button" class="vc-btn" onclick="VidangeCenter.refresh()" title="Actualiser"><i class="fa-solid fa-rotate' + (S.loading ? ' fa-spin' : '') + '"></i></button>' +
        '</div>' +
      '</div>' +
      '<div class="vc-kpis">' +
        kpi(cOver, 'En Retard (Urgent)', '#ef4444', 'overdue') +
        kpi(cAlert, 'En Alerte (Seuil Calibration)', '#f97316', 'alert') +
        kpi(cUp, 'Prochaines à Prévoir', '#eab308', 'upcoming') +
        kpi(cOk, 'Conformes (OK)', '#16a34a', 'ok') +
        kpi(all.length, 'Total Flotte Suivie', '#0284c7', 'all') +
      '</div>' +
      renderQueueHtml(all) +
      '<div class="vc-fbar">' +
        pill('all', 'Tous (' + all.length + ')') +
        pill('overdue', '🔴 En Retard (' + cOver + ')') +
        pill('alert', '🟠 Alerte Seuil (' + cAlert + ')') +
        pill('upcoming', '🟡 Prochaines (' + cUp + ')') +
        pill('ok', '🟢 Conformes (' + cOk + ')') +
        pill('nohist', '❔ Sans historique (' + cNoHist + ')') +
        '<span style="flex:1"></span>' +
        '<input id="vcSearch" type="text" placeholder="🔍 Camion, IMM, châssis, chauffeur…" value="' + esc(S.search) + '" oninput="VidangeCenter.setSearch(this.value)" style="min-width:210px">' +
        '<select onchange="VidangeCenter.setRuleFilter(this.value)">' +
          '<option value="all"' + (S.ruleFilter === 'all' ? ' selected' : '') + '>Toutes les règles</option>' +
          '<option value="__global__"' + (S.ruleFilter === '__global__' ? ' selected' : '') + '>🌐 Calibration Globale</option>' +
          rules.map(function (r) { return '<option value="' + esc(r.name) + '"' + (S.ruleFilter === r.name ? ' selected' : '') + '>⚙️ Règle : ' + esc(r.name) + '</option>'; }).join('') +
        '</select>' +
        '<select onchange="VidangeCenter.setSort(this.value)">' +
          '<option value="urgent"' + (S.sort === 'urgent' ? ' selected' : '') + '>Tri : Plus urgentes d\'abord</option>' +
          '<option value="odo"' + (S.sort === 'odo' ? ' selected' : '') + '>Tri : Compteur km ↓</option>' +
          '<option value="recent"' + (S.sort === 'recent' ? ' selected' : '') + '>Tri : Dernière vidange récente</option>' +
          '<option value="name"' + (S.sort === 'name' ? ' selected' : '') + '>Tri : Nom camion (A→Z)</option>' +
        '</select>' +
        '<button type="button" class="vc-btn" onclick="VidangeCenter.toggleView()"><i class="fa-solid ' + (S.viewMode === 'cards' ? 'fa-table-list' : 'fa-grip') + '"></i> ' + (S.viewMode === 'cards' ? 'Tableau' : 'Cartes') + '</button>' +
        '<span id="vcCountLbl" style="font-size:11.5px;color:var(--mu)"><b>' + list.length + '</b> camion(s) affiché(s)</span>' +
      '</div>' +
      '<div id="vcBodyWrap">' + (S.viewMode === 'table' ? renderTable(list) : renderCards(list)) + '</div>' +
    '</div>';
  }

  // ───────────────────────── MANUAL VIDANGE IN HISTORY & MODALS ─────────────────────────
  function closeDlg() { var ov = $('vcOv'); if (ov) ov.remove(); }
  function openModal(html) {
    closeDlg();
    var ov = document.createElement('div');
    ov.id = 'vcOv'; ov.className = 'vc-ov';
    ov.onclick = function (e) { if (e.target === ov) closeDlg(); };
    ov.innerHTML = '<div class="vc-dlg">' + html + '</div>';
    document.body.appendChild(ov);
  }

  function buildCreatePreviewHtml(devId, kmVal) {
    var rule = resolveTruckRule(devId);
    var km = Math.round(Number(kmVal) || 0);
    var nextKm = km > 0 ? (km + rule.rotKm) : rule.startKm;
    var alertAt = Math.max(0, nextKm - rule.alertKm);
    var pack = closestPackKm(km, rule);
    return '<div style="margin-top:12px;padding:11px 13px;border-radius:10px;background:rgba(245,158,11,.1);border:1px solid rgba(245,158,11,.35);font-size:12px;line-height:1.55">' +
      '<div><b>Règle appliquée :</b> ' + (rule.isCustom ? '⚙️ ' + esc(rule.ruleName) : '🌐 Calibration Globale') + ' (Rotation <b>' + num(rule.rotKm) + ' km</b> · Seuil alerte <b>' + num(rule.alertKm) + ' km</b>)</div>' +
      '<div><b>Pack DA associé :</b> Pack ' + num(pack) + ' km · <b>Prochaine vidange calculée :</b> <span style="color:#16a34a;font-weight:800">' + num(nextKm) + ' km</span> (alerte dès ' + num(alertAt) + ' km)</div>' +
    '</div>';
  }

  function openCreate(devId) {
    var list = trucks().sort(function (a, b) { return String(a.name).localeCompare(String(b.name), 'fr', { numeric: true }); });
    var t = devId ? truckById(devId) : (list[0] || null);
    var km = t ? Math.round(Number(t.odometer) || 0) : 0;
    var today = new Date().toISOString().slice(0, 10);
    var locs = (fc().CUSTOM_LOCATIONS || []).filter(function (l) { return l.type === 'maintenance'; });

    openModal(
      '<h3 style="margin:0 0 4px;font-size:17px"><i class="fa-solid fa-oil-can" style="color:#f59e0b"></i> Enregistrer une Vidange dans l\'Historique</h3>' +
      '<div style="font-size:11.5px;color:#64748b;margin-bottom:8px">Met à jour l\'historique et recalcule automatiquement la prochaine échéance de ce camion.</div>' +
      '<label>Camion / Tracteur</label>' +
      '<select id="vcCrTruck" onchange="VidangeCenter.onPickCreateTruck(this.value)">' +
        list.map(function (k) {
          return '<option value="' + esc(k.id) + '"' + (t && String(k.id) === String(t.id) ? ' selected' : '') + '>' + esc(k.name) + ' — actuel ' + num(k.odometer) + ' km</option>';
        }).join('') +
      '</select>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">' +
        '<div><label>Date de la vidange</label><input id="vcCrDate" type="date" value="' + today + '"></div>' +
        '<div><label>Compteur à la vidange (km)</label><input id="vcCrKm" type="number" min="1" value="' + km + '" oninput="VidangeCenter.updCreatePreview()"></div>' +
      '</div>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">' +
        '<div><label>Atelier / Site</label><input id="vcCrLoc" type="text" list="vcMaintSitesDl" placeholder="Ex: Atelier MAN / Biskra">' +
          '<datalist id="vcMaintSitesDl">' + locs.map(function (l) { return '<option value="' + esc(l.name) + '">'; }).join('') + '</datalist></div>' +
        '<div><label>Coût (DA, optionnel)</label><input id="vcCrCost" type="number" min="0" placeholder="0"></div>' +
      '</div>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">' +
        '<div><label>Technicien / Intervenant</label><input id="vcCrTech" type="text" placeholder="Optionnel"></div>' +
        '<div><label>Huile / Filtres / Note</label><input id="vcCrNote" type="text" placeholder="Ex: 15W40 + filtres complets"></div>' +
      '</div>' +
      '<div id="vcCrPrev">' + (t ? buildCreatePreviewHtml(t.id, km) : '') + '</div>' +
      '<div style="display:flex;justify-content:flex-end;gap:8px;flex-wrap:wrap;margin-top:16px">' +
        '<button type="button" class="vc-btn" onclick="VidangeCenter.closeDlg()">Annuler</button>' +
        '<button type="button" class="vc-btn ok" onclick="VidangeCenter.submitCreate(false)"><i class="fa-solid fa-check"></i> Enregistrer</button>' +
        '<button type="button" class="vc-btn da" onclick="VidangeCenter.submitCreate(true)"><i class="fa-solid fa-file-word"></i> Enregistrer &amp; DA .docx</button>' +
      '</div>'
    );
  }

  function onPickCreateTruck(devId) {
    var t = truckById(devId);
    if (t && $('vcCrKm')) $('vcCrKm').value = Math.round(Number(t.odometer) || 0);
    updCreatePreview();
  }
  function updCreatePreview() {
    var devId = ($('vcCrTruck') && $('vcCrTruck').value) || '';
    var km = Number($('vcCrKm') && $('vcCrKm').value) || 0;
    var p = $('vcCrPrev');
    if (p && devId) p.innerHTML = buildCreatePreviewHtml(devId, km);
  }

  async function submitCreate(andDownloadDa) {
    var devId = ($('vcCrTruck') && $('vcCrTruck').value) || '';
    var km = Math.round(Number($('vcCrKm') && $('vcCrKm').value) || 0);
    var dt = ($('vcCrDate') && $('vcCrDate').value) || new Date().toISOString().slice(0, 10);
    var loc = (($('vcCrLoc') && $('vcCrLoc').value) || '').trim() || 'Atelier';
    var cost = Number($('vcCrCost') && $('vcCrCost').value) || 0;
    var tech = (($('vcCrTech') && $('vcCrTech').value) || '').trim();
    var note = (($('vcCrNote') && $('vcCrNote').value) || '').trim();
    var t = truckById(devId);
    if (!t) { toast('Veuillez sélectionner un camion.', 'warning'); return; }
    if (km <= 0) { toast('Veuillez saisir un kilométrage valide (> 0 km).', 'warning'); return; }
    var meta = truckMeta(t.id, t.name);
    try {
      var res = await api('/api/maintenance/add', 'POST', {
        deviceId: String(t.id), truckName: t.name, type: 'Vidange', odometer: km,
        date: new Date(dt + 'T12:00:00').toISOString(), exitDate: new Date(dt + 'T13:00:00').toISOString(),
        location: loc, cost: cost, technician: tech, note: note,
        immatriculation: meta.immatriculation || '', chassisNumber: meta.chassisNumber || '',
        status: 'termine', isAuto: false, verified: true
      });
      closeDlg();
      toast('✅ Vidange enregistrée pour ' + t.name + ' (' + num(km) + ' km).', 'success');
      await syncAll();
      if (andDownloadDa && res && res.id && window.MaintenanceHub && MaintenanceHub.downloadDa) {
        await MaintenanceHub.downloadDa(String(res.id));
      }
    } catch (e) { toast('Erreur : ' + e.message, 'error'); }
  }

  function openHistory(devId) {
    var t = truckById(devId);
    if (!t) return;
    var e = computeTruckEntry(t);
    var tm = tierMeta(e.tier);
    var asc = e.hist.slice().sort(function (a, b) { return Number(a.odometer) - Number(b.odometer); });
    var deltaMap = {};
    asc.forEach(function (x, i) {
      var k = String(x.id || x._id || '');
      if (k && i > 0) deltaMap[k] = Math.max(0, Number(x.odometer) - Number(asc[i - 1].odometer));
    });

    var rowsHtml = e.hist.length
      ? '<div style="border:1px solid rgba(148,163,184,.28);border-radius:11px;overflow:hidden;margin-top:10px"><table class="vc-tbl"><thead><tr>' +
          '<th>Date</th><th>Compteur</th><th>Intervalle</th><th>Site / Note</th><th style="text-align:right">Actions</th>' +
        '</tr></thead><tbody>' + e.hist.map(function (x) {
          var xid = String(x.id || x._id || '');
          var dl = deltaMap[xid] || 0;
          return '<tr>' +
            '<td style="white-space:nowrap;font-weight:700">' + fmtD(x.date) + '</td>' +
            '<td style="font-family:monospace;font-weight:800">' + num(x.odometer) + ' km</td>' +
            '<td>' + (dl > 0 ? '<span class="vc-chip">+' + num(dl) + ' km</span>' : '—') + '</td>' +
            '<td style="font-size:11px">' + esc(x.location || '—') + (x.note ? '<div style="color:#64748b">' + esc(x.note) + '</div>' : '') + '</td>' +
            '<td style="text-align:right;white-space:nowrap">' +
              (xid ? '<button type="button" class="vc-btn da" style="padding:4px 8px;font-size:10.5px" onclick="if(window.MaintenanceHub)MaintenanceHub.downloadDa(\'' + esc(xid) + '\')" title="Télécharger DA .docx"><i class="fa-solid fa-file-word"></i> DA</button> ' : '') +
              (xid ? '<button type="button" class="vc-btn" style="padding:4px 8px;font-size:10.5px;color:#ef4444" onclick="VidangeCenter.delHist(\'' + esc(xid) + '\',\'' + esc(e.id) + '\')"><i class="fa-solid fa-trash"></i></button>' : '') +
            '</td></tr>';
        }).join('') + '</tbody></table></div>'
      : '<div style="padding:26px 12px;text-align:center;color:#64748b;border:1px dashed rgba(148,163,184,.35);border-radius:11px;margin-top:10px">Aucune vidange enregistrée dans l\'historique pour ce camion.</div>';

    openModal(
      '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;flex-wrap:wrap">' +
        '<div><h3 style="margin:0;font-size:18px"><i class="fa-solid fa-truck" style="color:#f59e0b"></i> Historique Vidanges — ' + esc(e.name) + '</h3>' +
          '<div style="font-size:11.5px;color:#64748b;margin-top:3px">' + (e.imm ? 'IMM : <b>' + esc(e.imm) + '</b> · ' : '') + (e.rule.isCustom ? 'Règle : <b>' + esc(e.rule.ruleName) + '</b>' : 'Calibration Globale') + ' (Rot. ' + num(e.rule.rotKm) + ' km · Alerte ' + num(e.rule.alertKm) + ' km)</div></div>' +
        '<span style="background:' + tm.bg + ';color:' + tm.col + ';font-size:10.5px;font-weight:800;padding:4px 10px;border-radius:999px">' + tm.lbl + '</span>' +
      '</div>' +
      '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:12px">' +
        '<div class="vc-cell"><small>Compteur Actuel</small><b>' + num(e.odo) + ' km</b></div>' +
        '<div class="vc-cell"><small>Dernière Vidange</small><b>' + (e.lastKm ? num(e.lastKm) + ' km' : '—') + '</b></div>' +
        '<div class="vc-cell"><small>Prochaine Échéance</small><b style="color:' + tm.col + '">' + num(e.nextKm) + ' km</b></div>' +
      '</div>' +
      rowsHtml +
      '<div style="display:flex;justify-content:space-between;gap:8px;margin-top:14px;flex-wrap:wrap">' +
        '<button type="button" class="vc-btn pri" onclick="VidangeCenter.openCreate(\'' + esc(e.id) + '\')"><i class="fa-solid fa-plus"></i> Ajouter une Vidange</button>' +
        '<button type="button" class="vc-btn" onclick="VidangeCenter.closeDlg()">Fermer</button>' +
      '</div>'
    );
  }

  async function delHist(entryId, devId) {
    if (!window.confirm('Supprimer cette vidange de l\'historique ?')) return;
    try {
      await api('/api/maintenance/delete', 'POST', { id: entryId });
      toast('Entrée supprimée.', 'info');
      await syncAll();
      openHistory(devId);
    } catch (e) { toast('Erreur : ' + e.message, 'error'); }
  }

  function exportCsv() {
    var list = filteredList(allEntries());
    if (!list.length) { toast('Aucune donnée à exporter.', 'warning'); return; }
    var sep = ';';
    var rows = [['Tracteur', 'Immatriculation', 'Chassis', 'Regle', 'Rotation KM', 'Seuil Alerte KM', 'Compteur Actuel KM', 'Derniere Vidange KM', 'Date Derniere Vidange', 'Parcourus KM', 'Prochaine Vidange KM', 'Ecart KM', 'Statut'].join(sep)];
    list.forEach(function (e) {
      var cells = [e.name, e.imm, e.chassis, e.rule.ruleName || 'Calibration Globale', e.rule.rotKm, e.rule.alertKm, e.odo, e.lastKm || '', e.lastDate ? fmtD(e.lastDate) : '', e.kmDriven, e.nextKm, e.kmRem, tierMeta(e.tier).lbl];
      rows.push(cells.map(function (v) { return '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"'; }).join(sep));
    });
    var blob = new Blob(['\uFEFF' + rows.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    var url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = 'Etat_Vidanges_' + new Date().toISOString().slice(0, 10) + '.csv';
    document.body.appendChild(a); a.click();
    setTimeout(function () { a.remove(); URL.revokeObjectURL(url); }, 1200);
  }

  function onTrucksUpdated() {
    var sec = $('vidangePageSection');
    if (!sec || !sec.classList.contains('active')) return;
    if (document.activeElement && document.activeElement.id === 'vcSearch') refreshBody();
    else render();
  }

  window.VidangeCenter = {
    mount: function () { render(); load(false); },
    refresh: function () { S.loadedAt = 0; load(true); },
    refreshLive: function () { onTrucksUpdated(); },
    onTrucksUpdated: onTrucksUpdated,
    setFilter: function (f) { S.filter = f; render(); },
    setRuleFilter: function (r) { S.ruleFilter = r; refreshBody(); },
    setSort: function (s) { S.sort = s; refreshBody(); },
    setSearch: function (q) { S.search = q || ''; refreshBody(); },
    toggleView: function () { S.viewMode = S.viewMode === 'cards' ? 'table' : 'cards'; render(); },
    toggleQueue: function () { S.showQueue = !S.showQueue; render(); },
    openCreate: openCreate, onPickCreateTruck: onPickCreateTruck, updCreatePreview: updCreatePreview, submitCreate: submitCreate,
    openHistory: openHistory, delHist: delHist, closeDlg: closeDlg, exportCsv: exportCsv
  };

  function hookUi() {
    var u = uiRef();
    if (!u || typeof u.switchTab !== 'function') return false;
    if (!u.switchTab.__vcHooked) {
      var orig = u.switchTab;
      u.switchTab = function (tabName) {
        var r = orig.apply(this, arguments);
        if (tabName === 'vidangePageSection') window.VidangeCenter.mount();
        return r;
      };
      u.switchTab.__vcHooked = true;
    }
    var sec = $('vidangePageSection');
    if (sec && sec.classList.contains('active')) window.VidangeCenter.mount();
    return true;
  }

  if (!hookUi()) {
    var iv = setInterval(function () { if (hookUi()) clearInterval(iv); }, 150);
    setTimeout(function () { clearInterval(iv); }, 15000);
  }
})();
