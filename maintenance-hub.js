/* ═══════════════════════════════════════════════════════════════════════
 * MAINTENANCE HUB — full rework of the "Vidange / Garage externe" tab.
 * Replaces ui.renderVidangeSection() with 3 views:
 *   1. À faire    — fleet vidange status, one-click "Démarrer"
 *   2. En cours   — open orders with real CLOSE dialog (km, cost, tech, note), cancel, edit
 *   3. Historique — every order, filters + CLOSE / CANCEL / REOPEN / edit / delete
 * Backend used: /api/maintenance (+close, +:id/cancel, +:id/reopen, +delete)
 * ═══════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var S = {
    view: 'todo',          // todo | active | history
    logs: [], loadedAt: 0, loading: false, error: '',
    todoFilter: 'all',     // all | urgent | soon | ok
    search: '',
    hType: '', hStatus: '', hFrom: '', hTo: '',
    busy: {}
  };
  var TTL = 20000;

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

  // ───────────────────────── CSS ─────────────────────────
  function css() {
    if ($('mhCss')) return;
    var st = document.createElement('style'); st.id = 'mhCss';
    st.textContent = [
      '#vidangeSection .controls-section>h2{display:none}',
      '.mh-kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin-bottom:14px}',
      '.mh-kpi{background:var(--bg-elevated,#1a2332);border:1px solid var(--border,#334155);border-radius:12px;padding:12px 14px;cursor:pointer;transition:.15s}',
      '.mh-kpi:hover{transform:translateY(-2px)}',
      '.mh-kpi b{display:block;font-size:24px;font-weight:800;line-height:1.1}',
      '.mh-kpi span{font-size:10px;text-transform:uppercase;letter-spacing:.5px;color:var(--text-muted,#94a3b8);font-weight:700}',
      '.mh-tabs{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:14px;border-bottom:1px solid var(--border,#334155);padding-bottom:10px}',
      '.mh-tab{padding:8px 16px;border-radius:999px;border:1.5px solid var(--border,#334155);background:transparent;color:var(--text-secondary,#94a3b8);font-weight:700;font-size:12px;cursor:pointer;font-family:inherit}',
      '.mh-tab.on{background:#f59e0b;border-color:#f59e0b;color:#111}',
      '.mh-tab i{margin-right:6px}',
      '.mh-tab em{font-style:normal;background:rgba(0,0,0,.25);border-radius:9px;padding:0 7px;margin-left:6px;font-size:10px}',
      '.mh-bar{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:12px}',
      '.mh-bar input,.mh-bar select,.mh-dlg input,.mh-dlg select,.mh-dlg textarea{padding:7px 10px;border-radius:8px;border:1px solid var(--border,#334155);background:var(--bg-surface,#0f172a);color:var(--text-primary,#e2e8f0);font-size:12px;font-family:inherit}',
      '.mh-pill{padding:5px 12px;border-radius:999px;border:1.5px solid var(--border,#334155);background:transparent;color:var(--text-secondary,#94a3b8);font-size:11px;font-weight:700;cursor:pointer;font-family:inherit}',
      '.mh-pill.on{background:#0284c7;border-color:#0284c7;color:#fff}',
      '.mh-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(310px,1fr));gap:14px}',
      '.mh-card{background:var(--bg-elevated,#1a2332);border:1px solid var(--border,#334155);border-left:4px solid var(--mhc,#64748b);border-radius:12px;padding:14px;display:flex;flex-direction:column;gap:8px}',
      '.mh-card h4{margin:0;font-size:15px;font-weight:800;color:var(--text-primary,#e2e8f0)}',
      '.mh-row{display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap}',
      '.mh-sub{font-size:11px;color:var(--text-muted,#94a3b8)}',
      '.mh-badge{font-size:10px;font-weight:800;padding:2px 9px;border-radius:999px;color:#fff;background:var(--mhc,#64748b);white-space:nowrap}',
      '.mh-bar2{height:7px;border-radius:5px;background:rgba(148,163,184,.25);overflow:hidden}',
      '.mh-bar2>div{height:100%;background:var(--mhc,#64748b);border-radius:5px}',
      '.mh-acts{display:flex;gap:6px;flex-wrap:wrap;margin-top:4px}',
      '.mh-btn{padding:6px 12px;border-radius:8px;border:1px solid var(--border,#334155);background:var(--bg-surface,#0f172a);color:var(--text-primary,#e2e8f0);font-size:11px;font-weight:700;cursor:pointer;font-family:inherit}',
      '.mh-btn:hover{filter:brightness(1.2)}',
      '.mh-btn.ok{background:#16a34a;border-color:#16a34a;color:#fff;flex:1}',
      '.mh-btn.warn{background:#f59e0b;border-color:#f59e0b;color:#111}',
      '.mh-btn.bad{color:#f87171;border-color:rgba(248,113,113,.5)}',
      '.mh-btn[disabled]{opacity:.5;cursor:wait}',
      '.mh-empty{text-align:center;padding:44px 16px;color:var(--text-muted,#94a3b8);grid-column:1/-1}',
      '.mh-empty i{font-size:34px;opacity:.4;display:block;margin-bottom:10px}',
      '.mh-tl{display:flex;flex-direction:column;gap:10px}',
      '.mh-item{display:grid;grid-template-columns:auto 1fr auto;gap:12px;align-items:center;background:var(--bg-elevated,#1a2332);border:1px solid var(--border,#334155);border-left:4px solid var(--mhc,#64748b);border-radius:12px;padding:12px 14px}',
      '.mh-ic{width:38px;height:38px;border-radius:10px;display:flex;align-items:center;justify-content:center;background:rgba(148,163,184,.15);color:var(--mhc,#64748b)}',
      '@media(max-width:720px){.mh-item{grid-template-columns:auto 1fr}.mh-item .mh-acts{grid-column:1/-1}}',
      '.mh-ov{position:fixed;inset:0;background:rgba(0,0,0,.65);z-index:10050;display:flex;align-items:center;justify-content:center;padding:16px}',
      '.mh-dlg{background:var(--bg-elevated,#1a2332);color:var(--text-primary,#e2e8f0);border:1px solid var(--border,#334155);border-radius:16px;width:100%;max-width:460px;padding:20px;max-height:92vh;overflow:auto}',
      '.mh-dlg h3{margin:0 0 4px;font-size:17px}',
      '.mh-dlg label{display:block;font-size:11px;font-weight:700;color:var(--text-muted,#94a3b8);margin:10px 0 4px}',
      '.mh-dlg input,.mh-dlg select,.mh-dlg textarea{width:100%;box-sizing:border-box}',
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
      var j = await api('/api/maintenance?limit=1500');
      S.logs = Array.isArray(j) ? j : (j.data || []);
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
    await load(true);
  }

  function counts() {
    var c = { active: 0, late: 0, doneMonth: 0, cost: 0 };
    var mk = new Date().toISOString().slice(0, 7);
    S.logs.forEach(function (x) {
      var s = stOf(x);
      if (s === 'en_cours') { c.active++; if (ageDays(x) > 7) c.late++; }
      if (s === 'termine' && new Date(x.exitDate || x.date).toISOString().slice(0, 7) === mk) { c.doneMonth++; c.cost += Number(x.cost) || 0; }
    });
    var t = trucks(), urgent = 0;
    t.forEach(function (k) { if (k.vidange && k.vidange.alert) urgent++; });
    c.urgent = urgent;
    return c;
  }

  // ───────────────────────── RENDER ─────────────────────────
  function rotKm() {
    var s = (window.FLEET_CONFIG && FLEET_CONFIG.SYSTEM_SETTINGS) || {};
    return Number(s.vidangeRotationKm) || 25000;
  }
  function root() { return $('vidangeSectionContainer'); }

  function render() {
    var el = root(); if (!el) return;
    css();
    var c = counts();
    var kp = function (v, l, color, view) {
      return '<div class="mh-kpi" onclick="MaintenanceHub.go(\'' + view + '\')"><b style="color:' + color + '">' + v + '</b><span>' + l + '</span></div>';
    };
    var tab = function (v, ic, l, n) {
      return '<button class="mh-tab' + (S.view === v ? ' on' : '') + '" onclick="MaintenanceHub.go(\'' + v + '\')"><i class="fa-solid ' + ic + '"></i>' + l +
        (n != null ? '<em>' + n + '</em>' : '') + '</button>';
    };
    var h = '<div class="mh-kpis">' +
      kp(c.urgent, 'Vidanges urgentes', '#ef4444', 'todo') +
      kp(c.active, 'Interventions en cours', '#0ea5e9', 'active') +
      kp(c.late, 'En cours > 7 jours', c.late ? '#f59e0b' : '#22c55e', 'active') +
      kp(c.doneMonth, 'Terminées ce mois', '#22c55e', 'history') +
      kp(num(c.cost) + ' DA', 'Coût du mois', '#a78bfa', 'history') +
      '</div>' +
      '<div class="mh-tabs">' +
      tab('todo', 'fa-oil-can', 'À faire', c.urgent) +
      tab('active', 'fa-spinner', 'En cours', c.active) +
      tab('history', 'fa-clock-rotate-left', 'Historique', S.logs.length) +
      '<span style="flex:1"></span>' +
      '<button class="mh-btn warn" onclick="ui.openNewMaintenanceOrder(null)"><i class="fa-solid fa-plus"></i> Nouvelle intervention</button>' +
      '<button class="mh-btn" onclick="MaintenanceHub.refresh()" title="Actualiser"><i class="fa-solid fa-rotate' + (S.loading ? ' fa-spin' : '') + '"></i></button>' +
      '</div>';
    if (S.error) h += '<div class="mh-note" style="background:rgba(239,68,68,.12);color:#f87171">Erreur de chargement : ' + esc(S.error) + '</div>';
    if (S.view === 'todo') h += viewTodo();
    else if (S.view === 'active') h += viewActive();
    else h += viewHistory();
    // keep focus in search box while re-rendering
    var focus = document.activeElement && document.activeElement.id;
    var pos = focus && document.activeElement.selectionStart;
    el.innerHTML = h;
    if (focus && $(focus)) { $(focus).focus(); try { $(focus).setSelectionRange(pos, pos); } catch (e) { /* not a text input */ } }
  }

  function activeVidangeFor(devId) {
    return S.logs.find(function (x) { return stOf(x) === 'en_cours' && isVid(x) && String(x.deviceId) === String(devId); });
  }

  function viewTodo() {
    var list = trucks().filter(function (t) { return t.vidange; });
    var q = S.search.toLowerCase();
    if (q) list = list.filter(function (t) { return String(t.name || '').toLowerCase().indexOf(q) >= 0; });
    var cls = function (t) {
      var v = t.vidange, k = Number(v.kmUntilNext);
      if (v.alert) return 'urgent';
      if (k < (Number(v.alertKm) || 500) + 3000) return 'soon';
      return 'ok';
    };
    var all = list.length;
    if (S.todoFilter !== 'all') list = list.filter(function (t) { return cls(t) === S.todoFilter; });
    list.sort(function (a, b) { return Number(a.vidange.kmUntilNext) - Number(b.vidange.kmUntilNext); });
    var pill = function (v, l) { return '<button class="mh-pill' + (S.todoFilter === v ? ' on' : '') + '" onclick="MaintenanceHub.setTodo(\'' + v + '\')">' + l + '</button>'; };
    var h = '<div class="mh-bar">' + pill('all', 'Tous (' + all + ')') + pill('urgent', '🔴 Urgent') + pill('soon', '🟡 Bientôt') + pill('ok', '✅ OK') +
      '<span style="flex:1"></span><input id="mhSearch" placeholder="Rechercher un camion…" value="' + esc(S.search) + '" oninput="MaintenanceHub.setSearch(this.value)"></div>';
    if (!list.length) return h + '<div class="mh-grid"><div class="mh-empty"><i class="fa-solid fa-circle-check"></i>Aucun camion dans cette catégorie</div></div>';
    h += '<div class="mh-grid">' + list.map(function (t) {
      var v = t.vidange, k = Number(v.kmUntilNext), c = cls(t);
      var color = c === 'urgent' ? '#ef4444' : c === 'soon' ? '#f59e0b' : '#22c55e';
      var label = c === 'urgent' ? 'URGENT' : c === 'soon' ? 'BIENTÔT' : 'OK';
      var pct = Math.max(0, Math.min(100, Math.round((1 - k / rotKm()) * 100)));
      var act = activeVidangeFor(t.id);
      var btn = act
        ? '<button class="mh-btn ok" onclick="MaintenanceHub.closeDlg(\'' + esc(idOf(act)) + '\')"><i class="fa-solid fa-check"></i> Terminer la vidange en cours</button>'
        : (c !== 'ok' ? '<button class="mh-btn warn" style="flex:1" onclick="ui.quickAddVidange(\'' + esc(t.id) + '\')"><i class="fa-solid fa-play"></i> Démarrer la vidange</button>' : '');
      return '<div class="mh-card" style="--mhc:' + color + '">' +
        '<div class="mh-row"><h4>' + esc(t.name) + '</h4><span class="mh-badge">' + (act ? 'EN COURS' : label) + '</span></div>' +
        '<div class="mh-bar2"><div style="width:' + pct + '%"></div></div>' +
        '<div class="mh-row"><span class="mh-sub">' + (k < 0 ? '<b style="color:' + color + '">Retard ' + num(Math.abs(k)) + ' km</b>' : 'Reste <b>' + num(k) + ' km</b>') + '</span>' +
        '<span class="mh-sub">Prochaine : <b>' + esc(v.nextKm) + ' km</b></span></div>' +
        '<div class="mh-row"><span class="mh-sub">Actuel : ' + num(t.odometer) + ' km</span>' +
        '<span class="mh-sub">Dernière : ' + (v.lastKm ? num(v.lastKm) + ' km' : '<i>non enregistrée</i>') + '</span></div>' +
        (btn ? '<div class="mh-acts">' + btn + '</div>' : '') + '</div>';
    }).join('') + '</div>';
    return h;
  }

  function viewActive() {
    var list = S.logs.filter(function (x) { return stOf(x) === 'en_cours'; })
      .sort(function (a, b) { return dateOf(a) - dateOf(b); });
    if (!list.length) return '<div class="mh-grid"><div class="mh-empty"><i class="fa-solid fa-clipboard-check"></i>Aucune intervention en cours</div></div>';
    return '<div class="mh-grid">' + list.map(function (x) {
      var late = ageDays(x) > 7, urgent = x.priority === 'urgent';
      var color = urgent ? '#ef4444' : late ? '#f59e0b' : '#0ea5e9';
      var id = esc(idOf(x));
      return '<div class="mh-card" style="--mhc:' + color + '">' +
        '<div class="mh-row"><h4>' + esc(x.truckName || x.deviceId) + '</h4><span class="mh-badge">' + (urgent ? 'URGENT' : late ? 'EN RETARD' : 'EN COURS') + '</span></div>' +
        '<div class="mh-row"><span><i class="fa-solid ' + (isVid(x) ? 'fa-oil-can' : 'fa-wrench') + '" style="color:#f59e0b"></i> <b>' + esc(x.type || 'Maintenance') + '</b></span>' +
        '<span class="mh-sub"><i class="fa-solid fa-clock"></i> ' + age(x) + ' · depuis ' + fmtD(x.date) + '</span></div>' +
        '<div class="mh-sub">' + (x.location ? '<i class="fa-solid fa-map-pin"></i> ' + esc(x.location) + ' · ' : '') +
        (x.odometer ? num(x.odometer) + ' km' : '') + (x.technician ? ' · <i class="fa-solid fa-user-gear"></i> ' + esc(x.technician) : '') + '</div>' +
        ((x.description || x.note) ? '<div class="mh-sub" style="font-style:italic">« ' + esc(String(x.description || x.note).slice(0, 140)) + ' »</div>' : '') +
        '<div class="mh-acts"><button class="mh-btn ok" onclick="MaintenanceHub.closeDlg(\'' + id + '\')"><i class="fa-solid fa-check"></i> Terminer</button>' +
        '<button class="mh-btn" onclick="ui.openEditMaintenanceModal(\'' + id + '\')"><i class="fa-solid fa-pen"></i></button>' +
        '<button class="mh-btn bad" onclick="MaintenanceHub.cancel(\'' + id + '\')"><i class="fa-solid fa-ban"></i> Annuler</button></div></div>';
    }).join('') + '</div>';
  }

  function viewHistory() {
    var types = {}; S.logs.forEach(function (x) { if (x.type) types[x.type] = 1; });
    var q = S.search.toLowerCase();
    var list = S.logs.filter(function (x) {
      if (S.hType && x.type !== S.hType) return false;
      if (S.hStatus && stOf(x) !== S.hStatus) return false;
      if (S.hFrom && dateOf(x) < new Date(S.hFrom)) return false;
      if (S.hTo && dateOf(x) > new Date(S.hTo + 'T23:59:59')) return false;
      if (q && (String(x.truckName || '') + ' ' + (x.technician || '') + ' ' + (x.location || '')).toLowerCase().indexOf(q) < 0) return false;
      return true;
    }).sort(function (a, b) { return dateOf(b) - dateOf(a); });
    var opt = function (v, l, cur) { return '<option value="' + esc(v) + '"' + (cur === v ? ' selected' : '') + '>' + esc(l) + '</option>'; };
    var h = '<div class="mh-bar">' +
      '<input id="mhSearch" placeholder="Camion, technicien, lieu…" value="' + esc(S.search) + '" oninput="MaintenanceHub.setSearch(this.value)">' +
      '<select onchange="MaintenanceHub.setH(\'hStatus\',this.value)">' + opt('', 'Tous statuts', S.hStatus) + opt('en_cours', '⚙️ En cours', S.hStatus) + opt('termine', '✅ Terminé', S.hStatus) + opt('annule', '🚫 Annulé', S.hStatus) + '</select>' +
      '<select onchange="MaintenanceHub.setH(\'hType\',this.value)">' + opt('', 'Tous types', S.hType) + Object.keys(types).sort().map(function (t) { return opt(t, t, S.hType); }).join('') + '</select>' +
      '<input type="date" value="' + esc(S.hFrom) + '" onchange="MaintenanceHub.setH(\'hFrom\',this.value)">' +
      '<input type="date" value="' + esc(S.hTo) + '" onchange="MaintenanceHub.setH(\'hTo\',this.value)">' +
      '<span class="mh-sub">' + list.length + ' résultat(s) · ' + num(list.reduce(function (s, x) { return s + (Number(x.cost) || 0); }, 0)) + ' DA</span>' +
      '<span style="flex:1"></span><button class="mh-btn" onclick="ui.exportMaintenanceXLSX()"><i class="fa-solid fa-file-excel"></i> Excel</button></div>';
    if (!list.length) return h + '<div class="mh-tl"><div class="mh-empty"><i class="fa-solid fa-folder-open"></i>Aucun enregistrement</div></div>';
    h += '<div class="mh-tl">' + list.slice(0, 300).map(function (x) {
      var s = stOf(x), id = esc(idOf(x));
      var color = s === 'termine' ? '#22c55e' : s === 'annule' ? '#64748b' : '#0ea5e9';
      var lbl = s === 'termine' ? 'Terminé' : s === 'annule' ? 'Annulé' : 'En cours';
      var acts = '';
      if (s === 'en_cours') acts += '<button class="mh-btn ok" onclick="MaintenanceHub.closeDlg(\'' + id + '\')"><i class="fa-solid fa-check"></i> Terminer</button><button class="mh-btn bad" onclick="MaintenanceHub.cancel(\'' + id + '\')"><i class="fa-solid fa-ban"></i></button>';
      else acts += '<button class="mh-btn" onclick="MaintenanceHub.reopen(\'' + id + '\')" title="Rouvrir"><i class="fa-solid fa-rotate-left"></i> Rouvrir</button>';
      acts += '<button class="mh-btn" onclick="ui.openEditMaintenanceModal(\'' + id + '\')" title="Modifier"><i class="fa-solid fa-pen"></i></button>' +
        '<button class="mh-btn bad" onclick="ui.deleteMaintenanceEntry(\'' + id + '\')" title="Supprimer"><i class="fa-solid fa-trash"></i></button>';
      return '<div class="mh-item" style="--mhc:' + color + '"><div class="mh-ic"><i class="fa-solid ' + (isVid(x) ? 'fa-oil-can' : 'fa-wrench') + '"></i></div>' +
        '<div><div class="mh-row" style="justify-content:flex-start;gap:10px"><b>' + esc(x.truckName || '—') + '</b><span class="mh-badge">' + lbl + '</span>' +
        (x.isAuto ? '<span class="mh-badge" style="background:#6366f1">AUTO</span>' : '') + '</div>' +
        '<div class="mh-sub">' + esc(x.type || '—') + ' · ' + fmtD(x.date) + (s !== 'en_cours' && x.exitDate ? ' → ' + fmtD(x.exitDate) : '') + ' · ' + age(x) +
        (x.odometer ? ' · ' + num(x.odometer) + ' km' : '') + (x.location ? ' · ' + esc(x.location) : '') +
        (x.technician ? ' · ' + esc(x.technician) : '') + (x.cost ? ' · <b>' + num(x.cost) + ' DA</b>' : '') + '</div></div>' +
        '<div class="mh-acts">' + acts + '</div></div>';
    }).join('') + '</div>';
    return h;
  }

  // ───────────────────────── ACTIONS ─────────────────────────
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

  async function closeDlg(id) {
    var x = find(id);
    if (!x) { await load(true); x = find(id); }
    if (!x) { toast('Ordre introuvable, actualisez la liste', 'warning'); return; }
    var t = trucks().find(function (k) { return String(k.id) === String(x.deviceId); });
    var km = Number(x.odometer) || (t && Number(t.odometer)) || '';
    var today = new Date().toISOString().slice(0, 10);
    dlg('<h3><i class="fa-solid fa-circle-check" style="color:#22c55e"></i> Terminer l\'intervention</h3>' +
      '<div class="mh-sub">' + esc(x.truckName || '') + ' · ' + esc(x.type || '') + ' · commencée le ' + fmtD(x.date) + '</div>' +
      '<label>Kilométrage à la clôture</label><input id="mhKm" type="number" min="0" value="' + esc(km) + '">' +
      '<label>Date de fin</label><input id="mhEnd" type="date" value="' + today + '">' +
      '<label>Coût total (DA)</label><input id="mhCost" type="number" min="0" value="' + esc(x.cost || '') + '">' +
      '<label>Technicien / Garage</label><input id="mhTech" type="text" value="' + esc(x.technician || '') + '">' +
      '<label>Note de clôture</label><textarea id="mhNote" rows="3">' + esc(x.note || '') + '</textarea>' +
      (isVid(x) ? '<div class="mh-note"><i class="fa-solid fa-oil-can"></i> Cette intervention est une vidange : le compteur de vidange sera remis à zéro au kilométrage saisi.</div>' : '') +
      '<div class="mh-acts" style="margin-top:16px;justify-content:flex-end">' +
      '<button class="mh-btn" onclick="MaintenanceHub.closeOv()">Fermer</button>' +
      '<button class="mh-btn ok" style="flex:0 0 auto" id="mhGo" onclick="MaintenanceHub.doClose(\'' + esc(id) + '\')"><i class="fa-solid fa-check"></i> Confirmer</button></div>');
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
    var ok = window.ui_showConfirm
      ? await ui_showConfirm('Annuler cette intervention' + (x ? ' (' + (x.truckName || '') + ')' : '') + ' ?', 'Annuler', '🚫', 'Annuler l\'ordre')
      : confirm('Annuler cette intervention ?');
    if (!ok) return;
    try { await api('/api/maintenance/' + encodeURIComponent(id) + '/cancel', 'PATCH'); toast('Intervention annulée', 'success'); await syncAfterChange(); }
    catch (e) { toast('Erreur : ' + e.message, 'error'); }
  }

  async function reopen(id) {
    var x = find(id);
    var ok = window.ui_showConfirm
      ? await ui_showConfirm('Rouvrir cette intervention' + (x ? ' (' + (x.truckName || '') + ')' : '') + ' ? Elle repassera « En cours ».', 'Rouvrir', '↩️', 'Rouvrir')
      : confirm('Rouvrir cette intervention ?');
    if (!ok) return;
    try { await api('/api/maintenance/' + encodeURIComponent(id) + '/reopen', 'PATCH'); toast('Intervention rouverte', 'success'); S.view = 'active'; await syncAfterChange(); }
    catch (e) { toast('Erreur : ' + e.message, 'error'); }
  }

  // ───────────────────────── PUBLIC API ─────────────────────────
  window.MaintenanceHub = {
    go: function (v) { S.view = v; S.search = ''; render(); load(false); },
    setTodo: function (f) { S.todoFilter = f; render(); },
    setSearch: function (v) { S.search = v; render(); },
    setH: function (k, v) { S[k] = v; render(); },
    refresh: function () { load(true); },
    closeDlg: closeDlg, doClose: doClose, closeOv: closeOv, cancel: cancel, reopen: reopen,
    onRender: function () { render(); load(false); }
  };

  // Take over the legacy renderer (ui.js keeps calling renderVidangeSection from many places)
  function patch() {
    if (!window.ui || typeof window.ui.renderVidangeSection !== 'function') return false;
    window.ui.renderVidangeSection = function () { window.MaintenanceHub.onRender(); };
    var u = window.ui;
    // legacy history rows: "refresh" hooks also reload the hub
    var f = u.fetchAndRenderMaintenance;
    if (typeof f === 'function') {
      u.fetchAndRenderMaintenance = function () {
        S.loadedAt = 0;
        var tabOn = document.getElementById('vidangeSection') && document.getElementById('vidangeSection').classList.contains('active');
        if (tabOn) load(true);
        return f.apply(u, arguments);
      };
    }
    css();
    return true;
  }
  var tries = 0;
  (function wait() { if (!patch() && tries++ < 100) setTimeout(wait, 200); })();
})();
