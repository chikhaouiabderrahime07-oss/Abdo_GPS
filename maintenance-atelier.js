/* ═══════════════════════════════════════════════════════════════════
   Maintenance — Atelier Biskra (bons de réparation)
   UI: sub-tabs, table, "Nouveau bon" modal, status flow.
   Backend: atelier-routes.js (/api/atelier/*)
   ═══════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var STATUS_META = {
    ouvert:           { label: 'Ouvert',            color: '#38bdf8', icon: 'fa-folder-open' },
    en_cours:         { label: 'En cours',          color: '#f59e0b', icon: 'fa-gears' },
    en_attente_piece: { label: 'En attente pièce',  color: '#a78bfa', icon: 'fa-hourglass-half' },
    termine:          { label: 'Terminé',           color: '#10b981', icon: 'fa-circle-check' }
  };
  var STATUS_ORDER = ['ouvert', 'en_cours', 'en_attente_piece', 'termine'];
  var KIND_META = {
    camion:   { label: 'Camion',        icon: 'fa-truck' },
    remorque: { label: 'Remorque',      icon: 'fa-trailer' },
    vehicule: { label: 'Véhicule léger', icon: 'fa-car-side' }
  };
  var DAY = 86400000;

  var S = {
    bons: [],
    filters: { status: 'actifs', kind: 'all', q: '' },
    lateDays: 3,
    cat: { panne: [], piece: [], intervenant: [], intervention: [] },
    vehicle: null,
    editing: null,
    lines: [],
    loaded: false,
    view: 'bons'
  };

  function baseUrl() {
    try { return (typeof FLEET_CONFIG !== 'undefined' && FLEET_CONFIG.API && FLEET_CONFIG.API.baseUrl) || ''; }
    catch (e) { return ''; }
  }

  async function api(path, opts) {
    opts = opts || {};
    var init = { method: opts.method || 'GET', headers: {} };
    if (opts.body !== undefined) {
      init.headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(opts.body);
    }
    var res = await fetch(baseUrl() + path, init);
    var data = null;
    try { data = await res.json(); } catch (e) { data = null; }
    if (!res.ok) throw new Error((data && data.error) || ('Erreur ' + res.status));
    return data;
  }

  function esc(s) {
    return String(s === undefined || s === null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function $(id) { return document.getElementById(id); }
  function toast(msg, type) {
    if (typeof window.showToast === 'function') window.showToast(msg, type || 'info');
    else console.log('[Atelier] ' + msg);
  }
  function fmtDate(d) {
    if (!d) return '—';
    var x = new Date(d);
    if (isNaN(x)) return '—';
    return x.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' }) + ' ' +
      x.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  }
  function toLocalInput(d) {
    var x = d ? new Date(d) : new Date();
    var p = function (n) { return String(n).padStart(2, '0'); };
    return x.getFullYear() + '-' + p(x.getMonth() + 1) + '-' + p(x.getDate()) + 'T' + p(x.getHours()) + ':' + p(x.getMinutes());
  }
  function daysOpen(b) {
    var end = b.closedAt ? new Date(b.closedAt) : new Date();
    return Math.max(0, (end - new Date(b.openedAt)) / DAY);
  }
  function fmtDays(n) { return n < 1 ? Math.round(n * 24) + ' h' : n.toFixed(1).replace('.0', '') + ' j'; }
  function who() { try { return localStorage.getItem('fleetUserName') || ''; } catch (e) { return ''; } }

  function debounce(fn, ms) {
    var t;
    return function () {
      var a = arguments, self = this;
      clearTimeout(t);
      t = setTimeout(function () { fn.apply(self, a); }, ms);
    };
  }

  function injectCss() {
    if ($('atelierCss')) return;
    var st = document.createElement('style');
    st.id = 'atelierCss';
    st.textContent = [
      '.mt-subtabs{display:flex;gap:6px;margin-bottom:16px;padding:4px;background:var(--bg-elevated);border:1px solid var(--border);border-radius:12px;width:fit-content;max-width:100%;flex-wrap:wrap}',
      '.mt-subtab{border:none;background:transparent;color:var(--text-secondary);padding:9px 18px;border-radius:9px;font-weight:700;font-size:13px;cursor:pointer;display:flex;align-items:center;gap:8px}',
      '.mt-subtab:hover{background:var(--bg-hover);color:var(--text-primary)}',
      '.mt-subtab.active{background:var(--warning);color:#0f172a}',
      '.at-head{display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;margin-bottom:14px}',
      '.at-chips{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px}',
      '.at-chip{padding:6px 12px;border-radius:20px;border:1px solid var(--border);background:var(--bg-elevated);color:var(--text-secondary);font-size:12px;font-weight:700;cursor:pointer}',
      '.at-chip.active{background:var(--warning-glow);border-color:var(--warning);color:var(--warning-light)}',
      '.at-chip b{margin-left:6px;color:var(--text-primary)}',
      '.at-toolbar{display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-bottom:14px}',
      '.at-toolbar input,.at-toolbar select{padding:9px 12px;background:var(--bg-elevated);border:1px solid var(--border);border-radius:9px;color:var(--text-primary);font-size:13px}',
      '.at-toolbar input[type=search]{min-width:260px;flex:1}',
      '.at-table{width:100%;border-collapse:collapse;font-size:13px}',
      '.at-table th{text-align:left;padding:10px 12px;color:var(--text-muted);font-size:11px;text-transform:uppercase;letter-spacing:.5px;border-bottom:1px solid var(--border);white-space:nowrap}',
      '.at-table td{padding:11px 12px;border-bottom:1px solid var(--border);vertical-align:middle;color:var(--text-primary)}',
      '.at-table tr:hover td{background:var(--bg-hover)}',
      '.at-table tr.late td:first-child{box-shadow:inset 3px 0 0 var(--danger)}',
      '.at-badge{display:inline-flex;align-items:center;gap:6px;padding:4px 10px;border-radius:20px;font-size:11px;font-weight:800;white-space:nowrap}',
      '.at-sub{color:var(--text-muted);font-size:11px;margin-top:2px}',
      '.at-late{color:var(--danger-light);font-weight:800}',
      '.at-btn{border:1px solid var(--border-strong,var(--border));background:var(--bg-elevated);color:var(--text-primary);padding:6px 10px;border-radius:8px;font-size:12px;font-weight:700;cursor:pointer;white-space:nowrap}',
      '.at-btn:hover{background:var(--bg-hover)}',
      '.at-btn.primary{background:var(--warning);border-color:var(--warning);color:#0f172a}',
      '.at-btn.danger{color:var(--danger-light);border-color:rgba(239,68,68,.35)}',
      '.at-empty{padding:40px;text-align:center;color:var(--text-muted)}'
    ].join('\n');
    document.head.appendChild(st);
  }

  function injectModalCss() {
    if ($('atelierCss2')) return;
    var st = document.createElement('style');
    st.id = 'atelierCss2';
    st.textContent = [
      '.at-ov{position:fixed;inset:0;z-index:9998;background:rgba(0,0,0,.7);backdrop-filter:blur(10px);display:flex;align-items:flex-start;justify-content:center;overflow-y:auto;padding:30px 12px}',
      '.at-modal{background:var(--bg-surface);border:1px solid var(--border-light,var(--border));border-radius:18px;width:100%;max-width:1040px;padding:24px;box-shadow:0 25px 60px rgba(0,0,0,.5)}',
      '.at-mh{display:flex;justify-content:space-between;align-items:center;padding-bottom:14px;margin-bottom:16px;border-bottom:1px solid var(--border)}',
      '.at-mh h3{margin:0;color:var(--warning);font-size:18px;display:flex;align-items:center;gap:10px}',
      '.at-x{width:34px;height:34px;border:none;border-radius:9px;background:var(--bg-elevated);color:var(--text-muted);font-size:17px;cursor:pointer}',
      '.at-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px;margin-bottom:14px}',
      '.at-f{display:flex;flex-direction:column;gap:5px;position:relative}',
      '.at-f label{font-size:11px;font-weight:700;color:var(--text-secondary);text-transform:uppercase;letter-spacing:.4px}',
      '.at-f input,.at-f select,.at-f textarea,.at-ln input,.at-ln select{padding:9px 11px;background:var(--bg-elevated);border:1px solid var(--border);border-radius:9px;color:var(--text-primary);font-size:13px;width:100%;box-sizing:border-box}',
      '.at-f input:focus,.at-f textarea:focus,.at-ln input:focus{outline:none;border-color:var(--warning)}',
      '.at-f.full{grid-column:1/-1}',
      '.at-pick{position:absolute;top:100%;left:0;right:0;z-index:20;background:var(--bg-elevated);border:1px solid var(--border-strong,var(--border));border-radius:10px;max-height:260px;overflow-y:auto;margin-top:4px;box-shadow:0 12px 30px rgba(0,0,0,.45)}',
      '.at-pick div{padding:9px 12px;cursor:pointer;font-size:13px;border-bottom:1px solid var(--border)}',
      '.at-pick div:hover{background:var(--bg-hover)}',
      '.at-vsel{display:flex;align-items:center;gap:10px;padding:10px 12px;background:var(--warning-subtle);border:1px solid rgba(245,158,11,.35);border-radius:10px;font-size:13px}',
      '.at-sec{font-size:12px;font-weight:800;color:var(--text-secondary);text-transform:uppercase;letter-spacing:.5px;margin:18px 0 8px;display:flex;justify-content:space-between;align-items:center}',
      '.at-ln{display:grid;grid-template-columns:1.3fr 1.1fr 1.3fr .9fr 1fr .5fr auto auto;gap:6px;align-items:center;margin-bottom:6px;padding:8px;background:var(--bg-elevated);border-radius:10px}',
      '.at-ln label{font-size:11px;color:var(--text-secondary);display:flex;align-items:center;gap:4px;white-space:nowrap}',
      '.at-ln input[type=checkbox]{width:auto}',
      '.at-lh{display:grid;grid-template-columns:1.3fr 1.1fr 1.3fr .9fr 1fr .5fr auto auto;gap:6px;padding:0 8px;font-size:10px;color:var(--text-muted);text-transform:uppercase;font-weight:700;margin-bottom:4px}',
      '.at-foot{display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin-top:20px;padding-top:14px;border-top:1px solid var(--border)}',
      '.at-hist{display:flex;gap:14px;flex-wrap:wrap;font-size:12px;color:var(--text-secondary);margin-top:6px}',
      '.at-hist span b{color:var(--text-primary)}',
      '@media(max-width:900px){.at-ln,.at-lh{grid-template-columns:1fr 1fr}.at-lh{display:none}}'
    ].join('\n');
    document.head.appendChild(st);
  }

  // ───────────────────────── SUB-TABS ─────────────────────────
  function renderSubTabs() {
    var html = function (active) {
      return '<div class="mt-subtabs">' +
        '<button class="mt-subtab' + (active === 'vidange' ? ' active' : '') + '" onclick="switchTab(\'vidangeSection\')">' +
        '<i class="fa-solid fa-oil-can"></i> Vidange / Garage externe</button>' +
        '<button class="mt-subtab' + (active === 'atelier' ? ' active' : '') + '" onclick="switchTab(\'atelierSection\')">' +
        '<i class="fa-solid fa-screwdriver-wrench"></i> Atelier Biskra</button></div>';
    };
    var a = $('maintSubTabsVidange'); if (a) a.innerHTML = html('vidange');
    var b = $('maintSubTabsAtelier'); if (b) b.innerHTML = html('atelier');
  }

  // ───────────────────────── DATA ─────────────────────────
  async function loadSettings() {
    try {
      var s = await api('/api/atelier/settings');
      if (s && Number(s.lateDays) > 0) S.lateDays = Number(s.lateDays);
    } catch (e) { /* keep default */ }
  }

  async function loadBons() {
    S.bons = await api('/api/atelier/bons?status=all&limit=2000');
    S.loaded = true;
  }

  async function loadCatalog() {
    try {
      var r = await Promise.all([
        api('/api/atelier/catalog?kind=panne&limit=300'),
        api('/api/atelier/catalog?kind=piece&limit=500'),
        api('/api/atelier/catalog?kind=intervenant&limit=300')
      ]);
      S.cat.panne = r[0]; S.cat.piece = r[1]; S.cat.intervenant = r[2];
    } catch (e) { console.warn('[Atelier] catalog load failed:', e.message); }
  }

  async function loadInterventions(panne) {
    try {
      S.cat.intervention = panne
        ? await api('/api/atelier/catalog?kind=intervention&limit=300&parent=' + encodeURIComponent(panne))
        : [];
    } catch (e) { S.cat.intervention = []; }
    var dl = $('atDlInterv');
    if (dl) dl.innerHTML = S.cat.intervention.map(function (i) { return '<option value="' + esc(i.name) + '">'; }).join('');
  }

  function isLate(b) {
    return b.status !== 'termine' && daysOpen(b) > S.lateDays;
  }

  function filtered() {
    var f = S.filters, q = f.q.trim().toLowerCase();
    return S.bons.filter(function (b) {
      if (f.status === 'actifs' && b.status === 'termine') return false;
      if (f.status !== 'actifs' && f.status !== 'all' && b.status !== f.status) return false;
      if (f.kind !== 'all' && (b.vehicle || {}).kind !== f.kind) return false;
      if (!q) return true;
      var hay = [b.ref, (b.vehicle || {}).plate, (b.vehicle || {}).name, b.panneType].concat(
        (b.lines || []).reduce(function (a, l) {
          return a.concat([l.intervention, (l.intervenant || {}).name, (l.piece || {}).designation, (l.piece || {}).sn, (l.piece || {}).ref]);
        }, [])
      ).join(' ').toLowerCase();
      return hay.indexOf(q) !== -1;
    });
  }

  // ───────────────────────── LIST RENDER ─────────────────────────
  function badge(status) {
    var m = STATUS_META[status] || { label: status, color: '#94a3b8', icon: 'fa-circle' };
    return '<span class="at-badge" style="background:' + m.color + '22;color:' + m.color + ';">' +
      '<i class="fa-solid ' + m.icon + '"></i> ' + esc(m.label) + '</span>';
  }

  // ERP sync indicator (closed bons only): pending / synced / failed
  function erpBadge(b) {
    if (!b || b.status !== 'termine') return '';
    var s = (b.erpSync && b.erpSync.status) || 'pending';
    var meta = {
      synced: { c: '#10b981', t: 'ERP ✓', tip: 'Pris en compte par l\'ERP' + (b.erpSync && b.erpSync.erpBtRef ? ' (' + b.erpSync.erpBtRef + ')' : '') },
      failed: { c: '#ef4444', t: 'ERP ✗', tip: 'Échec ERP : ' + ((b.erpSync && b.erpSync.error) || 'erreur') },
      pending: { c: '#94a3b8', t: 'ERP …', tip: 'En attente de prise en compte par l\'ERP' }
    }[s] || { c: '#94a3b8', t: 'ERP …', tip: '' };
    return '<div class="at-sub" style="color:' + meta.c + ';" title="' + esc(meta.tip) + '">' + meta.t + '</div>';
  }

  // ───────────────────────── VIEWS (Bons / KPIs / Paramètres) ─────────────────────────
  function renderViews() {
    var el = $('atViews'); if (!el) return;
    var defs = [['bons', 'Bons de réparation', 'fa-clipboard-list'], ['kpi', 'Tableau de bord', 'fa-chart-line'], ['settings', 'Paramètres', 'fa-sliders']];
    el.innerHTML = defs.map(function (d) {
      return '<button class="at-chip' + (S.view === d[0] ? ' active' : '') + '" onclick="AtelierUI.setView(\'' + d[0] + '\')">' +
        '<i class="fa-solid ' + d[2] + '"></i> ' + d[1] + '</button>';
    }).join('');
    var show = function (id, on) { var n = $(id); if (n) n.style.display = on ? '' : 'none'; };
    show('atViewBons', S.view === 'bons'); show('atViewKpi', S.view === 'kpi'); show('atViewSet', S.view === 'settings');
  }

  function setView(v) {
    S.view = v;
    renderViews();
    if (!window.AtelierPlus) { if (v !== 'bons') toast('Module KPIs non chargé', 'error'); return; }
    if (v === 'kpi') window.AtelierPlus.renderKpis($('atViewKpi'));
    else if (v === 'settings') window.AtelierPlus.renderSettings($('atViewSet'));
    else refresh();
  }

  function showHistory(bonId) {
    var b = S.bons.filter(function (x) { return x._id === bonId; })[0];
    if (!b || !window.AtelierPlus) return;
    var v = b.vehicle || {};
    window.AtelierPlus.openHistory({ plate: v.plate, refId: v.refId, name: v.name });
  }

  function renderShell() {
    var root = $('atelierRoot');
    if (!root) return;
    var f = S.filters;
    root.innerHTML =
      '<div class="at-chips" id="atViews" style="margin-bottom:14px;"></div>' +
      '<div id="atViewKpi" style="display:none;"></div>' +
      '<div id="atViewSet" style="display:none;"></div>' +
      '<div id="atViewBons"><div class="controls-section" style="border-left:3px solid var(--warning);">' +
      '<div class="at-head">' +
      '<h2 style="color:var(--warning);margin:0;"><i class="fa-solid fa-screwdriver-wrench"></i> Atelier Biskra — Bons de réparation</h2>' +
      '<div style="display:flex;gap:8px;">' +
      '<button class="btn-primary" style="background:var(--warning);border:none;" onclick="AtelierUI.openBon()"><i class="fa-solid fa-plus-circle"></i> Nouveau bon</button>' +
      '<button class="btn-secondary" onclick="AtelierUI.exportXlsx()" title="Exporter la liste filtrée en Excel"><i class="fa-solid fa-file-excel"></i> Excel</button>' +
      '<button class="btn-secondary" onclick="AtelierUI.refresh()" title="Actualiser"><i class="fa-solid fa-sync"></i></button>' +
      '</div></div>' +
      '<div class="at-chips" id="atChips"></div>' +
      '<div class="at-toolbar">' +
      '<input type="search" id="atSearch" placeholder="Rechercher : réf, immatriculation, panne, pièce, SN, intervenant…" value="' + esc(f.q) + '">' +
      '<select id="atKind"><option value="all">Tous véhicules</option>' +
      '<option value="camion">Camions</option><option value="remorque">Remorques</option>' +
      '<option value="vehicule">Véhicules légers</option></select>' +
      '</div>' +
      '<div id="atTableWrap"></div></div></div>';
    $('atKind').value = f.kind;
    renderViews();
    $('atSearch').addEventListener('input', debounce(function (e) { S.filters.q = e.target.value; renderList(); }, 200));
    $('atKind').addEventListener('change', function (e) { S.filters.kind = e.target.value; renderList(); });
  }

  function renderChips() {
    var counts = { actifs: 0, all: S.bons.length };
    STATUS_ORDER.forEach(function (s) { counts[s] = 0; });
    S.bons.forEach(function (b) { counts[b.status] = (counts[b.status] || 0) + 1; if (b.status !== 'termine') counts.actifs++; });
    var late = S.bons.filter(isLate).length;
    var defs = [['actifs', 'Actifs']].concat(STATUS_ORDER.map(function (s) { return [s, STATUS_META[s].label]; })).concat([['all', 'Tous']]);
    var h = defs.map(function (d) {
      return '<button class="at-chip' + (S.filters.status === d[0] ? ' active' : '') + '" onclick="AtelierUI.setStatus(\'' + d[0] + '\')">' +
        esc(d[1]) + '<b>' + (counts[d[0]] || 0) + '</b></button>';
    }).join('');
    if (late) h += '<span class="at-chip" style="border-color:rgba(239,68,68,.4);color:var(--danger-light);cursor:default;"><i class="fa-solid fa-triangle-exclamation"></i> ' +
      late + ' en retard (&gt; ' + S.lateDays + ' j)</span>';
    $('atChips').innerHTML = h;
  }

  function actionButtons(b) {
    var id = esc(b._id), btn = function (st, label, cls) {
      return '<button class="at-btn ' + (cls || '') + '" onclick="AtelierUI.changeStatus(\'' + id + '\',\'' + st + '\')">' + label + '</button>';
    };
    var out = '';
    if (b.status === 'ouvert') out += btn('en_cours', '▶ Démarrer', 'primary');
    else if (b.status === 'en_cours') out += btn('en_attente_piece', '⏳ Attente pièce') + ' ' + btn('termine', '✔ Terminer', 'primary');
    else if (b.status === 'en_attente_piece') out += btn('en_cours', '▶ Reprendre') + ' ' + btn('termine', '✔ Terminer', 'primary');
    else out += btn('en_cours', '↺ Rouvrir');
    out += ' <button class="at-btn" title="PDF du bon" onclick="AtelierUI.exportPdf(\'' + id + '\')"><i class="fa-solid fa-file-pdf"></i></button>';
    out += ' <button class="at-btn" title="Modifier" onclick="AtelierUI.openBon(\'' + id + '\')"><i class="fa-solid fa-pen"></i></button>';
    return out;
  }

  function renderList() {
    renderChips();
    var rows = filtered(), wrap = $('atTableWrap');
    if (!wrap) return;
    if (!rows.length) {
      wrap.innerHTML = '<div class="at-empty"><i class="fa-solid fa-clipboard-check" style="font-size:34px;margin-bottom:10px;"></i><br>' +
        (S.bons.length ? 'Aucun bon pour ce filtre.' : 'Aucun bon de réparation. Cliquez sur « Nouveau bon ».') + '</div>';
      return;
    }
    var h = '<div style="overflow-x:auto;"><table class="at-table"><thead><tr>' +
      '<th>Réf</th><th>Véhicule</th><th>Panne</th><th>Interventions</th><th>Intervenants</th><th>Statut</th><th>Ouvert le</th><th>Durée</th><th></th>' +
      '</tr></thead><tbody>';
    rows.forEach(function (b) {
      var v = b.vehicle || {}, k = KIND_META[v.kind] || KIND_META.camion, lines = b.lines || [];
      var interv = lines.map(function (l) { return l.intervention; }).filter(Boolean);
      var names = []; lines.forEach(function (l) {
        var n = l.intervenant && l.intervenant.name;
        if (n && names.indexOf(n) === -1) names.push(n);
      });
      var d = daysOpen(b), late = isLate(b);
      h += '<tr class="' + (late ? 'late' : '') + '">' +
        '<td><b>' + esc(b.ref) + '</b></td>' +
        '<td><i class="fa-solid ' + k.icon + '" style="color:var(--warning);margin-right:6px;"></i><b style="cursor:pointer;text-decoration:underline dotted;" title="Historique du véhicule" onclick="AtelierUI.showHistory(\'' + esc(b._id) + '\')">' + esc(v.plate || v.name) + '</b>' +
        '<div class="at-sub">' + esc(k.label) + (v.name && v.plate ? ' · ' + esc(v.name) : '') + '</div></td>' +
        '<td>' + esc(b.panneType) + (b.description ? '<div class="at-sub" title="' + esc(b.description) + '">' + esc(b.description.slice(0, 50)) + (b.description.length > 50 ? '…' : '') + '</div>' : '') + '</td>' +
        '<td>' + (interv.length ? esc(interv.slice(0, 2).join(', ')) + (interv.length > 2 ? ' <span class="at-sub">+' + (interv.length - 2) + '</span>' : '') : '<span class="at-sub">—</span>') + '</td>' +
        '<td>' + (names.length ? esc(names.join(', ')) : '<span class="at-sub">—</span>') + '</td>' +
        '<td>' + badge(b.status) + erpBadge(b) + '</td>' +
        '<td style="white-space:nowrap;">' + fmtDate(b.openedAt) + '</td>' +
        '<td class="' + (late ? 'at-late' : '') + '" style="white-space:nowrap;">' + (late ? '⚠ ' : '') + fmtDays(d) + '</td>' +
        '<td style="white-space:nowrap;text-align:right;">' + actionButtons(b) + '</td></tr>';
    });
    wrap.innerHTML = h + '</tbody></table></div>';
  }

  // ───────────────────────── STATUS FLOW ─────────────────────────
  function askKm(defaultKm) {
    return new Promise(function (resolve) {
      var ov = document.createElement('div');
      ov.className = 'at-ov'; ov.style.zIndex = '10001'; ov.style.alignItems = 'center';
      ov.innerHTML = '<div class="at-modal" style="max-width:420px;">' +
        '<div class="at-mh"><h3><i class="fa-solid fa-oil-can"></i> Remise à zéro vidange</h3></div>' +
        '<p style="color:var(--text-secondary);font-size:13px;margin-top:0;">Ce bon contient une intervention <b>Vidange</b>. Indiquez le kilométrage du camion à la sortie pour remettre le compteur à zéro.</p>' +
        '<div class="at-f"><label>Km à la sortie</label><input type="number" id="atKmClose" min="0" value="' + (defaultKm || '') + '"></div>' +
        '<div class="at-foot"><button class="at-btn" id="atKmSkip">Terminer sans remise à zéro</button>' +
        '<button class="at-btn primary" id="atKmOk">Valider</button></div></div>';
      document.body.appendChild(ov);
      var done = function (v) { ov.remove(); resolve(v); };
      $('atKmOk').onclick = function () { done(Number($('atKmClose').value) || 0); };
      $('atKmSkip').onclick = function () { done(-1); };
      $('atKmClose').focus();
    });
  }

  async function changeStatus(id, status) {
    var b = S.bons.filter(function (x) { return x._id === id; })[0];
    if (!b) return;
    var body = { status: status, by: who() };
    if (status === 'termine') {
      var hasVid = (b.lines || []).some(function (l) { return l.isVidange; });
      if (hasVid && (b.vehicle || {}).kind === 'camion') {
        var km = await askKm((b.vehicle || {}).kmAtEntry);
        if (km > 0) body.kmAtClose = km;
        else if (km < 0) body.skipVidange = true;
      }
    }
    try {
      var r = await api('/api/atelier/bons/' + id + '/status', { method: 'PATCH', body: body });
      var i = S.bons.findIndex(function (x) { return x._id === id; });
      if (i >= 0) S.bons[i] = r.bon;
      renderList();
      toast('Bon ' + b.ref + ' → ' + STATUS_META[status].label, 'success');
      if (r.vidange) {
        if (r.vidange.applied) toast('✅ Vidange remise à zéro à ' + r.vidange.km + ' km', 'success');
        else if (r.vidange.reason === 'km_missing') toast('⚠️ Vidange non remise à zéro : kilométrage manquant', 'warning');
        else if (r.vidange.reason === 'not_a_gps_truck') toast('ℹ️ Vidange non remise à zéro : véhicule sans GPS', 'info');
        else if (r.vidange.reason === 'skipped') toast('ℹ️ Vidange non remise à zéro (choix utilisateur)', 'info');
        else if (r.vidange.reason === 'error') toast('⚠️ Vidange non remise à zéro : erreur serveur', 'warning');
      }
      checkLate();
    } catch (e) { toast('Erreur : ' + e.message, 'error'); }
  }

  // ───────────────────────── MODAL: BON ─────────────────────────
  function emptyLine() {
    return {
      intervention: '', isVidange: false,
      intervenant: { name: '', type: 'externe' },
      piece: { designation: '', family: '', ref: '', sn: '', qty: 1, source: 'externe' },
      note: ''
    };
  }

  function dlOptions(list) {
    return list.map(function (i) { return '<option value="' + esc(i.name) + '">'; }).join('');
  }

  function lineHtml(l, i) {
    var p = l.piece || {}, it = l.intervenant || {};
    var ev = function (path) { return 'oninput="AtelierUI.setLine(' + i + ',\'' + path + '\',this.value)"'; };
    return '<div class="at-ln" data-i="' + i + '">' +
      '<input list="atDlInterv" placeholder="Intervention" value="' + esc(l.intervention) + '" ' + ev('intervention') +
      ' onchange="AtelierUI.lineChanged(' + i + ',\'intervention\')">' +
      '<div style="display:flex;gap:4px;"><input list="atDlIntervenant" placeholder="Intervenant" value="' + esc(it.name) + '" ' + ev('intervenant.name') +
      ' onchange="AtelierUI.lineChanged(' + i + ',\'intervenant\')">' +
      '<select id="atLTyp' + i + '" style="width:84px;flex:none;" onchange="AtelierUI.setLine(' + i + ',\'intervenant.type\',this.value)">' +
      '<option value="externe"' + (it.type !== 'interne' ? ' selected' : '') + '>Externe</option>' +
      '<option value="interne"' + (it.type === 'interne' ? ' selected' : '') + '>Interne</option></select></div>' +
      '<input list="atDlPiece" placeholder="Pièce (désignation)" value="' + esc(p.designation) + '" ' + ev('piece.designation') +
      ' onchange="AtelierUI.lineChanged(' + i + ',\'piece\')">' +
      '<input id="atLFam' + i + '" placeholder="Famille" value="' + esc(p.family) + '" ' + ev('piece.family') + '>' +
      '<input placeholder="N° série (SN)" value="' + esc(p.sn) + '" ' + ev('piece.sn') + '>' +
      '<input type="number" min="1" title="Quantité" value="' + esc(p.qty || 1) + '" ' + ev('piece.qty') + '>' +
      '<label title="Cette intervention remet la vidange à zéro à la clôture"><input type="checkbox" id="atLVid' + i + '"' + (l.isVidange ? ' checked' : '') +
      ' onchange="AtelierUI.setLine(' + i + ',\'isVidange\',this.checked)"> Vidange</label>' +
      '<button class="at-btn danger" title="Supprimer la ligne" onclick="AtelierUI.removeLine(' + i + ')"><i class="fa-solid fa-trash"></i></button></div>';
  }

  function renderLines() {
    var box = $('atLines');
    if (!box) return;
    box.innerHTML = (S.lines.length
      ? '<div class="at-lh"><span>Intervention</span><span>Intervenant</span><span>Pièce</span><span>Famille</span><span>N° série</span><span>Qté</span><span></span><span></span></div>'
      : '<div class="at-sub" style="padding:8px;">Aucune intervention. Ajoutez une ligne pour saisir intervention, intervenant et pièce.</div>') +
      S.lines.map(lineHtml).join('');
  }

  function setLine(i, path, val) {
    var o = S.lines[i];
    if (!o) return;
    var parts = path.split('.');
    for (var k = 0; k < parts.length - 1; k++) o = o[parts[k]];
    o[parts[parts.length - 1]] = (path === 'piece.qty') ? (Number(val) || 1) : val;
  }

  function lineChanged(i, what) {
    var l = S.lines[i];
    if (!l) return;
    var key = function (s) { return String(s || '').trim().toLowerCase(); };
    if (what === 'intervention') {
      var it = S.cat.intervention.filter(function (c) { return key(c.name) === key(l.intervention); })[0];
      if (it && it.isVidange) { l.isVidange = true; var cb = $('atLVid' + i); if (cb) cb.checked = true; }
    } else if (what === 'piece') {
      var pc = S.cat.piece.filter(function (c) { return key(c.name) === key(l.piece.designation); })[0];
      if (pc && pc.family && !l.piece.family) {
        l.piece.family = pc.family;
        var fi = $('atLFam' + i); if (fi) fi.value = pc.family;
      }
    } else if (what === 'intervenant') {
      var iv = S.cat.intervenant.filter(function (c) { return key(c.name) === key(l.intervenant.name); })[0];
      if (iv) {
        l.intervenant.type = iv.interne ? 'interne' : 'externe';
        var ty = $('atLTyp' + i); if (ty) ty.value = l.intervenant.type;
      }
    }
  }

  function addLine() { S.lines.push(emptyLine()); renderLines(); }
  function removeLine(i) { S.lines.splice(i, 1); renderLines(); }

  function historyHtml(b) {
    if (!b || !(b.statusHistory || []).length) return '';
    return '<div class="at-hist">' + b.statusHistory.map(function (h) {
      var m = STATUS_META[h.status] || { label: h.status };
      return '<span>' + esc(m.label) + ' : <b>' + fmtDate(h.at) + '</b>' + (h.by ? ' (' + esc(h.by) + ')' : '') + '</span>';
    }).join('') + '</div>';
  }

  function closeBon() {
    var ov = $('atBonModal');
    if (ov) ov.remove();
  }

  function openBon(id) {
    injectModalCss();
    closeBon();
    var b = id ? S.bons.filter(function (x) { return x._id === id; })[0] : null;
    S.editing = b || null;
    S.vehicle = b ? Object.assign({}, b.vehicle) : null;
    S.lines = b ? JSON.parse(JSON.stringify(b.lines || [])) : [emptyLine()];
    var v = S.vehicle || {};
    var ov = document.createElement('div');
    ov.id = 'atBonModal'; ov.className = 'at-ov';
    ov.addEventListener('mousedown', function (e) { if (e.target === ov) closeBon(); });
    ov.innerHTML = '<div class="at-modal">' +
      '<div class="at-mh"><h3><i class="fa-solid fa-file-contract"></i> ' + (b ? 'Bon ' + esc(b.ref) : 'Nouveau bon de réparation') + '</h3>' +
      '<div>' + (b ? badge(b.status) + ' ' : '') + '<button class="at-x" onclick="AtelierUI.closeBon()">✕</button></div></div>' +
      '<div class="at-grid">' +
      '<div class="at-f full"><label>Véhicule *</label>' +
      '<div id="atVSel"></div>' +
      '<input id="atVSearch" autocomplete="off" placeholder="Rechercher camion, remorque ou véhicule léger (nom, immatriculation, châssis)…"' + (b ? ' style="display:none"' : '') + '>' +
      '<div class="at-pick" id="atVPick" style="display:none;"></div></div>' +
      '<div class="at-f"><label>Km à l\'entrée</label><input type="number" id="atKm" min="0" value="' + esc(v.kmAtEntry || '') + '" placeholder="Requis pour la remise à zéro vidange"></div>' +
      '<div class="at-f"><label>Remorque attelée</label><input id="atTrailer" value="' + esc(v.attachedTrailer || '') + '"></div>' +
      '<div class="at-f"><label>Date d\'ouverture</label><input type="datetime-local" id="atOpened" value="' + toLocalInput(b && b.openedAt) + '"></div>' +
      '<div class="at-f"><label>Type de panne *</label><input id="atPanne" list="atDlPanne" autocomplete="off" placeholder="Choisir ou saisir une nouvelle panne" value="' + esc(b ? b.panneType : '') + '"></div>' +
      '<div class="at-f full"><label>Description</label><textarea id="atDesc" rows="2" placeholder="Symptômes, remarques…">' + esc(b ? b.description : '') + '</textarea></div></div>' +
      '<div class="at-sec"><span>Interventions &amp; pièces</span><button class="at-btn" onclick="AtelierUI.addLine()"><i class="fa-solid fa-plus"></i> Ajouter une ligne</button></div>' +
      '<div id="atLines"></div>' +
      '<datalist id="atDlPanne">' + dlOptions(S.cat.panne) + '</datalist>' +
      '<datalist id="atDlInterv"></datalist>' +
      '<datalist id="atDlPiece">' + dlOptions(S.cat.piece) + '</datalist>' +
      '<datalist id="atDlIntervenant">' + dlOptions(S.cat.intervenant) + '</datalist>' +
      historyHtml(b) +
      '<div class="at-foot"><div>' + (b ? '<button class="at-btn danger" onclick="AtelierUI.deleteBon(\'' + esc(b._id) + '\')"><i class="fa-solid fa-trash"></i> Supprimer</button>' : '') + '</div>' +
      '<div style="display:flex;gap:8px;">' + (b ? '<button class="at-btn" title="Télécharger le bon en PDF" onclick="AtelierUI.exportPdf(\'' + esc(b._id) + '\')"><i class="fa-solid fa-file-pdf"></i> PDF</button>' : '') +
      '<button class="at-btn" onclick="AtelierUI.closeBon()">Annuler</button>' +
      '<button class="at-btn primary" id="atSaveBtn" onclick="AtelierUI.saveBon()"><i class="fa-solid fa-save"></i> Enregistrer</button></div></div></div>';
    document.body.appendChild(ov);
    renderVehicleSel();
    renderLines();
    loadInterventions(b ? b.panneType : '');
    $('atPanne').addEventListener('change', function (e) { loadInterventions(e.target.value.trim()); });
    var vs = $('atVSearch');
    vs.addEventListener('input', debounce(function () { searchVehicles(vs.value); }, 250));
    vs.addEventListener('focus', function () { searchVehicles(vs.value); });
    document.addEventListener('mousedown', outsidePick);
  }

  function outsidePick(e) {
    var pick = $('atVPick');
    if (!pick) { document.removeEventListener('mousedown', outsidePick); return; }
    if (e.target.id !== 'atVSearch' && !pick.contains(e.target)) pick.style.display = 'none';
  }

  // ───────────────────────── VEHICLE PICKER ─────────────────────────
  var vSeq = 0;
  S.vResults = [];

  function renderVehicleSel() {
    var box = $('atVSel'), search = $('atVSearch');
    if (!box) return;
    var v = S.vehicle;
    if (!v) { box.innerHTML = ''; if (search) search.style.display = ''; return; }
    var k = KIND_META[v.kind] || KIND_META.camion;
    box.innerHTML = '<div class="at-vsel"><i class="fa-solid ' + k.icon + '" style="color:var(--warning);font-size:18px;"></i>' +
      '<div style="flex:1;"><b>' + esc(v.plate || v.name) + '</b><div class="at-sub">' + esc(k.label) + (v.name && v.plate ? ' · ' + esc(v.name) : '') +
      (v.chassis ? ' · Châssis ' + esc(v.chassis) : '') + '</div></div>' +
      (S.editing ? '' : '<button class="at-btn" onclick="AtelierUI.clearVehicle()">Changer</button>') + '</div>';
    if (search) search.style.display = 'none';
  }

  async function searchVehicles(q) {
    var seq = ++vSeq, pick = $('atVPick');
    if (!pick) return;
    q = (q || '').trim();
    try {
      var list = await api('/api/atelier/vehicles?q=' + encodeURIComponent(q));
      if (seq !== vSeq) return;
      S.vResults = list.slice(0, 40);
      var h = S.vResults.map(function (v, i) {
        var k = KIND_META[v.kind] || KIND_META.camion;
        return '<div onclick="AtelierUI.pickVehicle(' + i + ')"><i class="fa-solid ' + k.icon + '" style="color:var(--warning);margin-right:8px;"></i><b>' +
          esc(v.plate || v.name) + '</b> <span class="at-sub">' + esc(k.label) + (v.name && v.plate ? ' · ' + esc(v.name) : '') + '</span></div>';
      }).join('');
      if (q) h += '<div onclick="AtelierUI.createLight()" style="color:var(--warning-light);"><i class="fa-solid fa-plus-circle"></i> Ajouter « ' + esc(q) + ' » comme véhicule léger</div>';
      if (!h) h = '<div class="at-sub">Aucun véhicule. Saisissez une immatriculation pour en créer un.</div>';
      pick.innerHTML = h;
      pick.style.display = 'block';
    } catch (e) { toast('Recherche véhicule : ' + e.message, 'error'); }
  }

  function pickVehicle(i) {
    var v = S.vResults[i];
    if (!v) return;
    S.vehicle = {
      kind: v.kind, refId: v.refId, deviceId: v.deviceId, plate: v.plate, name: v.name,
      chassis: v.chassis, attachedTrailer: v.attachedTrailer || v.attachedTruck || '', kmAtEntry: 0
    };
    var t = $('atTrailer'); if (t && v.kind === 'camion') t.value = v.attachedTrailer || '';
    $('atVPick').style.display = 'none';
    renderVehicleSel();
  }

  async function createLight() {
    var plate = ($('atVSearch').value || '').trim();
    if (!plate) return;
    try {
      var r = await api('/api/atelier/vehicles', { method: 'POST', body: { plate: plate } });
      var d = r.vehicle;
      S.vehicle = { kind: 'vehicule', refId: String(d._id), plate: d.plate, name: d.name || '', chassis: d.chassis || '', attachedTrailer: '', kmAtEntry: 0 };
      $('atVPick').style.display = 'none';
      renderVehicleSel();
      toast('Véhicule léger « ' + d.plate + ' » ajouté', 'success');
    } catch (e) { toast('Erreur : ' + e.message, 'error'); }
  }

  function clearVehicle() { S.vehicle = null; renderVehicleSel(); var s = $('atVSearch'); if (s) { s.value = ''; s.focus(); } }

  // ───────────────────────── SAVE / DELETE ─────────────────────────
  // Remember the Vidange flag of each intervention in the catalogue (per panne type)
  async function syncVidangeFlags(panne) {
    var seen = {};
    for (var i = 0; i < S.lines.length; i++) {
      var l = S.lines[i], name = (l.intervention || '').trim();
      if (!name || seen[name.toLowerCase()]) continue;
      seen[name.toLowerCase()] = true;
      var known = S.cat.intervention.filter(function (c) { return c.name.toLowerCase() === name.toLowerCase(); })[0];
      if ((known && !!known.isVidange !== !!l.isVidange) || (!known && l.isVidange)) {
        await api('/api/atelier/catalog', { method: 'POST', body: { kind: 'intervention', name: name, parent: panne, isVidange: !!l.isVidange } });
      }
    }
  }

  async function saveBon() {
    var panne = ($('atPanne').value || '').trim();
    if (!S.vehicle) return toast('Choisissez un véhicule', 'warning');
    if (!panne) return toast('Le type de panne est requis', 'warning');
    var btn = $('atSaveBtn');
    btn.disabled = true;
    try {
      await syncVidangeFlags(panne);
      var vehicle = Object.assign({}, S.vehicle, {
        kmAtEntry: Number($('atKm').value) || 0,
        attachedTrailer: ($('atTrailer').value || '').trim()
      });
      var body = {
        vehicle: vehicle, panneType: panne, description: $('atDesc').value,
        openedAt: $('atOpened').value ? new Date($('atOpened').value).toISOString() : undefined,
        lines: S.lines, by: who()
      };
      var r = S.editing
        ? await api('/api/atelier/bons/' + S.editing._id, { method: 'PUT', body: body })
        : await api('/api/atelier/bons', { method: 'POST', body: body });
      toast('Bon ' + r.bon.ref + (S.editing ? ' mis à jour' : ' créé'), 'success');
      closeBon();
      await Promise.all([loadBons(), loadCatalog()]);
      renderList();
    } catch (e) {
      toast('Erreur : ' + e.message, 'error');
      btn.disabled = false;
    }
  }

  async function deleteBon(id) {
    var b = S.bons.filter(function (x) { return x._id === id; })[0];
    if (!b || !confirm('Supprimer définitivement le bon ' + b.ref + ' ?')) return;
    try {
      await api('/api/atelier/bons/' + id, { method: 'DELETE' });
      toast('Bon ' + b.ref + ' supprimé', 'success');
      closeBon();
      await loadBons();
      renderList();
      checkLate();
    } catch (e) { toast('Erreur : ' + e.message, 'error'); }
  }

  // ───────────────────────── PUBLIC API ─────────────────────────
  // ───────────────────────── OVERDUE ALERTS ─────────────────────────
  // Polls /api/atelier/alerts: badge on the Maintenance menu button + notification-bell entry.
  var LATE_POLL_MS = 30 * 60 * 1000;
  var lateTimer = null;

  function setMenuBadge(n) {
    var btn = document.querySelector('.tab-button[data-tab="vidangeSection"]');
    if (!btn) return;
    var el = btn.querySelector('.at-menu-badge');
    if (!n) { if (el) el.remove(); return; }
    if (!el) {
      el = document.createElement('span');
      el.className = 'at-menu-badge';
      el.style.cssText = 'background:#ef4444;color:#fff;border-radius:10px;padding:1px 6px;font-size:10px;font-weight:800;margin-left:6px;';
      btn.appendChild(el);
    }
    el.textContent = n;
    el.title = n + ' bon(s) de réparation en retard (Atelier Biskra)';
  }

  async function checkLate() {
    try {
      var r = await api('/api/atelier/alerts');
      if (r && Number(r.lateDays) > 0) S.lateDays = Number(r.lateDays);
      var n = (r && r.count) || 0;
      setMenuBadge(n);
      if (n > 0 && typeof window.pushNotification === 'function') {
        var worst = r.late.slice(0, 3).map(function (x) {
          return x.plate + ' (' + x.ref + ', ' + fmtDays(x.ageDays) + ')';
        }).join(' · ');
        window.pushNotification('atelier_late', {
          title: '🛠️ Atelier Biskra : ' + n + ' bon' + (n > 1 ? 's' : '') + ' en retard',
          body: worst + (n > 3 ? ' …' : '') + ' — au-delà de ' + r.lateDays + ' j',
          severity: 'warning'
        });
      }
    } catch (e) { /* silent: alerts must never disturb the UI */ }
  }

  function startLatePolling() {
    if (lateTimer) return;
    // first check after the notification startup phase (30 s), then every 30 min
    setTimeout(checkLate, 35000);
    lateTimer = setInterval(checkLate, LATE_POLL_MS);
  }

  async function refresh() {
    try {
      await Promise.all([loadBons(), loadSettings(), loadCatalog()]);
      renderList();
      checkLate();
    } catch (e) {
      var w = $('atTableWrap');
      if (w) w.innerHTML = '<div class="at-empty" style="color:var(--danger-light);">Impossible de charger les bons : ' + esc(e.message) + '</div>';
    }
  }

  function init() {
    injectCss();
    renderSubTabs();
    renderShell();
    startLatePolling();
  }

  function onTabOpen() {
    if (!$('atelierRoot') || !$('atSearch')) init();
    renderSubTabs();
    renderViews();
    refresh().then(function () { if (S.view !== 'bons') setView(S.view); });
  }

  window.AtelierUI = {
    init: init, onTabOpen: onTabOpen, refresh: refresh,
    setStatus: function (s) { S.filters.status = s; renderList(); },
    setView: setView, showHistory: showHistory,
    setLateDays: function (n) { if (Number(n) > 0) { S.lateDays = Number(n); if (S.loaded) renderList(); } },
    reloadCatalog: loadCatalog, ensureModalCss: injectModalCss,
    changeStatus: changeStatus,
    openBon: openBon, closeBon: closeBon, saveBon: saveBon, deleteBon: deleteBon,
    addLine: addLine, removeLine: removeLine, setLine: setLine, lineChanged: lineChanged,
    pickVehicle: pickVehicle, createLight: createLight, clearVehicle: clearVehicle,
    renderSubTabs: renderSubTabs,
    getFiltered: filtered,
    getLateDays: function () { return S.lateDays; },
    exportPdf: function (id) { if (window.AtelierExport) window.AtelierExport.pdf(id); else toast('Module PDF non chargé', 'error'); },
    exportXlsx: function () { if (window.AtelierExport) window.AtelierExport.xlsx(); else toast('Module Excel non chargé', 'error'); }
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
