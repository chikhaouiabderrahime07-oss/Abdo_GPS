/* ═══════════════════════════════════════════════════════════════════
   Maintenance — Atelier Biskra : Phase 3
   KPIs dashboard, settings screen (late threshold + catalogue),
   vehicle history modal. Extends window.AtelierUI (maintenance-atelier.js)
   Backend: /api/atelier/kpis, /settings, /catalog, /vehicle-history
   ═══════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var STATUS_META = {
    ouvert:           { label: 'Ouvert',           color: '#38bdf8' },
    en_cours:         { label: 'En cours',         color: '#f59e0b' },
    en_attente_piece: { label: 'En attente pièce', color: '#a78bfa' },
    termine:          { label: 'Terminé',          color: '#10b981' }
  };
  var KIND_ICON = { camion: 'fa-truck', remorque: 'fa-trailer', vehicule: 'fa-car-side' };
  var DAY = 86400000;

  var P = { kpi: null, cat: { panne: [], intervention: [], piece: [], intervenant: [] }, setTab: 'panne', openPanne: '' };

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
    else console.log('[Atelier]', msg);
  }
  function fmtDate(d) {
    if (!d) return '—';
    var x = new Date(d);
    if (isNaN(x)) return '—';
    return x.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }
  function fmtDays(n) {
    n = Number(n) || 0;
    return n < 1 ? Math.round(n * 24) + ' h' : n.toFixed(1).replace('.0', '') + ' j';
  }
  // inline-handler safe string (for onclick="...('x')")
  function js(s) { return esc(String(s === undefined || s === null ? '' : s).replace(/\\/g, '\\\\').replace(/'/g, "\\'")); }

  function badge(status) {
    var m = STATUS_META[status] || { label: status, color: '#94a3b8' };
    return '<span class="at-badge" style="background:' + m.color + '22;color:' + m.color + ';">' + esc(m.label) + '</span>';
  }

  function injectCss() {
    if ($('atelierCss3')) return;
    var st = document.createElement('style');
    st.id = 'atelierCss3';
    st.textContent = [
      '.ap-cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;margin-bottom:16px}',
      '.ap-card{background:var(--bg-elevated);border:1px solid var(--border);border-radius:14px;padding:14px 16px}',
      '.ap-card .v{font-size:28px;font-weight:800;color:var(--text-primary);line-height:1.1}',
      '.ap-card .l{font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.5px;font-weight:700;margin-top:4px}',
      '.ap-card.warn .v{color:var(--danger-light)}',
      '.ap-card.ok .v{color:var(--success,#10b981)}',
      '.ap-cols{display:grid;grid-template-columns:repeat(auto-fit,minmax(420px,1fr));gap:14px;margin-bottom:14px}',
      '.ap-box{background:var(--bg-surface);border:1px solid var(--border);border-radius:14px;padding:14px 16px;min-width:0}',
      '.ap-box h4{margin:0 0 10px;font-size:13px;color:var(--text-secondary);text-transform:uppercase;letter-spacing:.5px;display:flex;align-items:center;gap:8px}',
      '.ap-bar{height:8px;border-radius:6px;background:var(--bg-hover);overflow:hidden;min-width:60px}',
      '.ap-bar i{display:block;height:100%;background:var(--warning);border-radius:6px}',
      '.ap-link{cursor:pointer;color:var(--warning-light,#fbbf24);font-weight:800;text-decoration:underline dotted}',
      '.ap-views{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px}',
      '.ap-note{font-size:12px;color:var(--text-muted);margin:6px 0 0}',
      '.ap-row{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:10px}',
      '.ap-row input,.ap-row select{padding:8px 11px;background:var(--bg-elevated);border:1px solid var(--border);border-radius:9px;color:var(--text-primary);font-size:13px}',
      '.ap-tag{display:inline-block;padding:2px 8px;border-radius:12px;font-size:10px;font-weight:800;background:var(--bg-hover);color:var(--text-secondary);margin-left:6px}',
      '.ap-tag.vid{background:rgba(245,158,11,.18);color:var(--warning-light,#fbbf24)}',
      '.ap-sublist{margin:6px 0 10px 18px;padding-left:12px;border-left:2px solid var(--border)}',
      '.ap-it{display:flex;justify-content:space-between;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid var(--border);font-size:13px}',
      '.ap-it .acts{display:flex;gap:6px;flex-shrink:0}',
      '@media(max-width:560px){.ap-cols{grid-template-columns:1fr}}'
    ].join('\n');
    document.head.appendChild(st);
  }

  function table(head, rows, empty) {
    if (!rows.length) return '<div class="at-sub" style="padding:10px 0;">' + esc(empty || 'Aucune donnée.') + '</div>';
    return '<div style="overflow-x:auto;"><table class="at-table"><thead><tr>' +
      head.map(function (h) { return '<th>' + esc(h) + '</th>'; }).join('') +
      '</tr></thead><tbody>' + rows.join('') + '</tbody></table></div>';
  }

  function plateLink(plate, kind) {
    if (!plate || plate === '—') return esc(plate || '—');
    return '<i class="fa-solid ' + (KIND_ICON[kind] || 'fa-truck') + '" style="color:var(--warning);margin-right:6px;"></i>' +
      '<span class="ap-link" onclick="AtelierPlus.openHistory({plate:\'' + js(plate) + '\'})">' + esc(plate) + '</span>';
  }

  function card(v, l, cls) {
    return '<div class="ap-card ' + (cls || '') + '"><div class="v">' + esc(v) + '</div><div class="l">' + esc(l) + '</div></div>';
  }

  function barRow(label, count, max, extra) {
    var pct = max ? Math.max(4, Math.round(count / max * 100)) : 0;
    return '<tr><td>' + label + '</td><td style="width:38%;"><div class="ap-bar"><i style="width:' + pct + '%"></i></div></td>' +
      '<td style="text-align:right;white-space:nowrap;"><b>' + esc(count) + '</b>' + (extra ? ' <span class="at-sub">' + esc(extra) + '</span>' : '') + '</td></tr>';
  }

  // ───────────────────────── KPI DASHBOARD ─────────────────────────
  async function renderKpis(box) {
    if (!box) return;
    injectCss();
    box.innerHTML = '<div class="at-empty"><i class="fa-solid fa-spinner fa-spin"></i> Calcul des indicateurs…</div>';
    var k;
    try { k = P.kpi = await api('/api/atelier/kpis'); }
    catch (e) {
      box.innerHTML = '<div class="at-empty" style="color:var(--danger-light);">Impossible de charger les KPIs : ' + esc(e.message) + '</div>';
      return;
    }
    var c = k.counts || {}, m = k.month || {};
    var h = '<div class="ap-cards">' +
      card(k.vehiclesDown, 'Véhicules immobilisés', k.vehiclesDown ? 'warn' : 'ok') +
      card((k.late || []).length, 'Bons en retard (> ' + k.lateDays + ' j)', (k.late || []).length ? 'warn' : 'ok') +
      card(fmtDays(k.mttrDays), 'Durée moy. de réparation') +
      card(fmtDays(k.waitPartAvgDays), 'Attente pièce moyenne') +
      card(m.total || 0, 'Bons ce mois-ci') +
      card(k.totalBons || 0, 'Bons au total') + '</div>';

    h += '<div class="ap-cols">';
    // status distribution
    var maxS = Math.max(1, c.ouvert || 0, c.en_cours || 0, c.en_attente_piece || 0, c.termine || 0);
    var stRows = Object.keys(STATUS_META).map(function (s) {
      return barRow(badge(s), c[s] || 0, maxS, 'ce mois : ' + (m[s] || 0));
    });
    h += '<div class="ap-box"><h4><i class="fa-solid fa-chart-simple"></i> Bons par statut</h4>' +
      '<table class="at-table"><tbody>' + stRows.join('') + '</tbody></table></div>';

    // down now
    var downRows = (k.downNow || []).map(function (d) {
      var late = d.ageDays > k.lateDays;
      return '<tr><td>' + plateLink(d.plate, d.kind) + '</td><td>' + esc(d.panneType || '—') + '</td><td>' + badge(d.status) + '</td>' +
        '<td class="' + (late ? 'at-late' : '') + '" style="white-space:nowrap;">' + (late ? '⚠ ' : '') + fmtDays(d.ageDays) + '</td></tr>';
    });
    h += '<div class="ap-box"><h4><i class="fa-solid fa-truck-ramp-box"></i> Immobilisés maintenant</h4>' +
      table(['Véhicule', 'Panne', 'Statut', 'Depuis'], downRows, 'Aucun véhicule immobilisé 🎉') + '</div>';

    // days down per vehicle
    var dd = k.daysDownPerVehicle || [], maxD = dd.length ? dd[0].days || 1 : 1;
    var ddRows = dd.map(function (v) {
      return '<tr><td>' + plateLink(v.plate, v.kind) + '</td><td style="width:34%;"><div class="ap-bar"><i style="width:' + Math.max(4, Math.round(v.days / maxD * 100)) + '%"></i></div></td>' +
        '<td style="text-align:right;white-space:nowrap;"><b>' + fmtDays(v.days) + '</b> <span class="at-sub">' + v.bons + ' bon(s)</span></td></tr>';
    });
    h += '<div class="ap-box"><h4><i class="fa-solid fa-calendar-xmark"></i> Jours d\'immobilisation par véhicule</h4>' +
      (ddRows.length ? '<table class="at-table"><tbody>' + ddRows.join('') + '</tbody></table>' : '<div class="at-sub">Aucune donnée.</div>') + '</div>';

    // top pannes
    var tp = k.topPannes || [], maxP = tp.length ? tp[0].count : 1;
    h += '<div class="ap-box"><h4><i class="fa-solid fa-triangle-exclamation"></i> Pannes les plus fréquentes</h4>' +
      (tp.length ? '<table class="at-table"><tbody>' + tp.map(function (p) { return barRow(esc(p.panne), p.count, maxP); }).join('') + '</tbody></table>'
        : '<div class="at-sub">Aucune donnée.</div>') + '</div>';

    // repeat breakdowns
    var rep = (k.repeatBreakdowns || []).map(function (r) {
      return '<tr><td>' + plateLink(r.plate) + '</td><td>' + r.bons + '</td><td class="at-late">' + r.repeats + '</td></tr>';
    });
    h += '<div class="ap-box"><h4><i class="fa-solid fa-rotate-left"></i> Pannes répétées (&lt; 30 j)</h4>' +
      table(['Véhicule', 'Bons', 'Répétitions'], rep, 'Aucune panne répétée.') + '</div>';

    // intervenants
    var iv = (k.intervenants || []).map(function (i) {
      return '<tr><td><b>' + esc(i.name) + '</b><span class="ap-tag">' + (i.type === 'interne' ? 'interne' : 'externe') + '</span></td>' +
        '<td>' + i.bons + '</td><td>' + i.interventions + '</td><td>' + (i.avgResolutionDays === null ? '—' : fmtDays(i.avgResolutionDays)) + '</td></tr>';
    });
    h += '<div class="ap-box"><h4><i class="fa-solid fa-user-gear"></i> Intervenants</h4>' +
      table(['Nom', 'Bons', 'Interv.', 'Résolution moy.'], iv, 'Aucun intervenant renseigné.') + '</div>';

    // top pieces
    var pcs = k.topPieces || [], maxPc = pcs.length ? pcs[0].count : 1;
    h += '<div class="ap-box"><h4><i class="fa-solid fa-gears"></i> Pièces les plus utilisées</h4>' +
      (pcs.length ? '<table class="at-table"><tbody>' + pcs.map(function (p) {
        return barRow(esc(p.designation) + (p.family ? ' <span class="at-sub">' + esc(p.family) + '</span>' : ''), p.count, maxPc);
      }).join('') + '</tbody></table>' : '<div class="at-sub">Aucune pièce enregistrée.</div>') + '</div>';

    h += '</div><p class="ap-note">Cliquez sur une immatriculation pour ouvrir l\'historique du véhicule (pièces et numéros de série inclus).</p>';
    box.innerHTML = h;
  }

  // ───────────────────────── VEHICLE HISTORY ─────────────────────────
  function closeHistory() {
    var o = $('atHistOv'); if (o) o.remove();
    document.removeEventListener('keydown', histKey);
  }
  function histKey(e) { if (e.key === 'Escape') closeHistory(); }

  async function openHistory(v) {
    v = v || {};
    if (!v.plate && !v.refId) return;
    if (window.AtelierUI && window.AtelierUI.ensureModalCss) window.AtelierUI.ensureModalCss();
    injectCss();
    closeHistory();
    var ov = document.createElement('div');
    ov.className = 'at-ov'; ov.id = 'atHistOv';
    ov.addEventListener('mousedown', function (e) { if (e.target === ov) closeHistory(); });
    ov.innerHTML = '<div class="at-modal"><div class="at-mh"><h3><i class="fa-solid fa-clock-rotate-left"></i> Historique — ' +
      esc(v.plate || v.name || '') + '</h3><button class="at-x" onclick="AtelierPlus.closeHistory()">✕</button></div>' +
      '<div id="atHistBody"><div class="at-empty"><i class="fa-solid fa-spinner fa-spin"></i> Chargement…</div></div></div>';
    document.body.appendChild(ov);
    document.addEventListener('keydown', histKey);

    var r;
    try {
      var qs = [];
      if (v.plate) qs.push('plate=' + encodeURIComponent(v.plate));
      if (v.refId) qs.push('refId=' + encodeURIComponent(v.refId));
      r = await api('/api/atelier/vehicle-history?' + qs.join('&'));
    } catch (e) {
      $('atHistBody').innerHTML = '<div class="at-empty" style="color:var(--danger-light);">' + esc(e.message) + '</div>';
      return;
    }
    var bons = r.bons || [], now = Date.now();
    var totalMs = 0, closed = 0;
    bons.forEach(function (b) {
      var end = b.closedAt ? new Date(b.closedAt).getTime() : now;
      totalMs += Math.max(0, end - new Date(b.openedAt).getTime());
      if (b.status === 'termine') closed++;
    });
    var first = bons[0] && bons[0].vehicle ? bons[0].vehicle : {};
    var h = '<div class="at-vsel" style="margin-bottom:14px;"><i class="fa-solid ' + (KIND_ICON[first.kind] || 'fa-truck') + '"></i>' +
      '<div><b>' + esc(first.plate || v.plate || '') + '</b>' + (first.name ? ' · ' + esc(first.name) : '') +
      (first.chassis ? '<div class="at-sub">Châssis : ' + esc(first.chassis) + '</div>' : '') + '</div></div>';
    h += '<div class="ap-cards">' + card(r.total || 0, 'Bons au total') + card(closed, 'Terminés') +
      card(fmtDays(totalMs / DAY), 'Immobilisation cumulée') +
      card(r.repeatBreakdown ? 'Oui' : 'Non', 'Panne répétée (< 30 j)', r.repeatBreakdown ? 'warn' : 'ok') + '</div>';

    var rows = bons.map(function (b) {
      var end = b.closedAt ? new Date(b.closedAt) : new Date();
      var d = Math.max(0, (end - new Date(b.openedAt)) / DAY);
      var iv = (b.lines || []).map(function (l) {
        return esc(l.intervention || '—') + (l.intervenant && l.intervenant.name ? ' <span class="at-sub">(' + esc(l.intervenant.name) + ')</span>' : '');
      }).join('<br>');
      return '<tr><td><span class="ap-link" onclick="AtelierPlus.openBonFromHistory(\'' + js(b._id) + '\')">' + esc(b.ref) + '</span></td>' +
        '<td>' + esc(b.panneType || '—') + '</td><td>' + (iv || '<span class="at-sub">—</span>') + '</td><td>' + badge(b.status) + '</td>' +
        '<td style="white-space:nowrap;">' + fmtDate(b.openedAt) + '</td><td style="white-space:nowrap;">' + fmtDate(b.closedAt) + '</td>' +
        '<td style="white-space:nowrap;">' + fmtDays(d) + '</td></tr>';
    });
    h += '<div class="at-sec"><span>Bons de réparation</span></div>' +
      table(['Réf', 'Panne', 'Interventions', 'Statut', 'Ouvert le', 'Clôturé le', 'Durée'], rows, 'Aucun bon pour ce véhicule.');

    var prow = (r.pieces || []).map(function (p) {
      return '<tr><td>' + esc(p.bonRef) + '</td><td>' + fmtDate(p.date) + '</td><td>' + esc(p.designation || '—') + '</td>' +
        '<td>' + esc(p.family || '') + '</td><td>' + esc(p.ref || '') + '</td><td><b>' + esc(p.sn || '') + '</b></td><td>' + esc(p.qty || 1) + '</td></tr>';
    });
    h += '<div class="at-sec"><span>Pièces posées &amp; numéros de série</span></div>' +
      table(['Bon', 'Date', 'Désignation', 'Famille', 'Réf', 'N° série', 'Qté'], prow, 'Aucune pièce enregistrée.');
    $('atHistBody').innerHTML = h;
  }

  function openBonFromHistory(id) {
    closeHistory();
    if (window.AtelierUI) window.AtelierUI.openBon(id);
  }

  // ───────────────────────── SETTINGS ─────────────────────────
  var CAT_TABS = [
    ['panne', 'Pannes &amp; interventions', 'fa-triangle-exclamation'],
    ['piece', 'Pièces', 'fa-gears'],
    ['intervenant', 'Intervenants', 'fa-user-gear']
  ];
  var CAT_KINDS = ['panne', 'intervention', 'piece', 'intervenant'];

  async function loadCat() {
    var r = await Promise.all(CAT_KINDS.map(function (k) { return api('/api/atelier/catalog?kind=' + k + '&limit=1000'); }));
    CAT_KINDS.forEach(function (k, i) { P.cat[k] = r[i]; });
    if (window.AtelierUI && window.AtelierUI.reloadCatalog) window.AtelierUI.reloadCatalog();
  }

  function findItem(id) {
    for (var i = 0; i < CAT_KINDS.length; i++) {
      var f = P.cat[CAT_KINDS[i]].filter(function (x) { return x._id === id; })[0];
      if (f) return f;
    }
    return null;
  }

  async function renderSettings(box) {
    if (!box) return;
    injectCss();
    box.innerHTML = '<div class="at-empty"><i class="fa-solid fa-spinner fa-spin"></i> Chargement…</div>';
    var late = 3;
    try {
      var s = await api('/api/atelier/settings');
      if (s && Number(s.lateDays) > 0) late = Number(s.lateDays);
      await loadCat();
    } catch (e) {
      box.innerHTML = '<div class="at-empty" style="color:var(--danger-light);">Impossible de charger les paramètres : ' + esc(e.message) + '</div>';
      return;
    }
    var tabs = CAT_TABS.map(function (t) {
      return '<button class="at-chip' + (P.setTab === t[0] ? ' active' : '') + '" onclick="AtelierPlus.setCatTab(\'' + t[0] + '\')">' +
        '<i class="fa-solid ' + t[2] + '"></i> ' + t[1] + '<b>' + P.cat[t[0]].length + '</b></button>';
    }).join('');
    box.innerHTML =
      '<div class="ap-box" style="margin-bottom:14px;"><h4><i class="fa-solid fa-hourglass-end"></i> Alerte de retard</h4>' +
      '<div class="ap-row"><span>Un bon est « en retard » après</span>' +
      '<input type="number" id="apLate" min="1" max="60" step="1" value="' + late + '" style="width:80px;"> <span>jour(s) d\'ouverture</span>' +
      '<button class="at-btn primary" onclick="AtelierPlus.saveLate()"><i class="fa-solid fa-floppy-disk"></i> Enregistrer</button></div></div>' +
      '<div class="ap-box"><h4><i class="fa-solid fa-book"></i> Catalogue (auto-appris à la saisie des bons)</h4>' +
      '<div class="at-chips" id="apCatTabs">' + tabs + '</div>' +
      '<div class="ap-row"><input type="search" id="apCatQ" placeholder="Filtrer…" style="min-width:240px;" oninput="AtelierPlus.filterCat(this.value)">' +
      '<span id="apAddBox"></span></div>' +
      '<div id="apCatList"></div></div>';
    renderCatList();
  }

  async function saveLate() {
    var n = parseInt(($('apLate') || {}).value, 10);
    if (!(n >= 1 && n <= 60)) { toast('Entrez un nombre de jours entre 1 et 60', 'warning'); return; }
    try {
      var r = await api('/api/atelier/settings', { method: 'PUT', body: { lateDays: n } });
      if (window.AtelierUI && window.AtelierUI.setLateDays) window.AtelierUI.setLateDays(r.lateDays);
      toast('Seuil de retard enregistré : ' + r.lateDays + ' j', 'success');
    } catch (e) { toast('Erreur : ' + e.message, 'error'); }
  }

  function setCatTab(t) {
    P.setTab = t; P.q = '';
    renderSettings($('atViewSet'));
  }
  function filterCat(v) { P.q = String(v || '').toLowerCase(); renderCatList(); }

  async function mutate(fn, okMsg) {
    try {
      await fn();
      await loadCat();
      renderCatList(); refreshTabCounts();
      if (okMsg) toast(okMsg, 'success');
    } catch (e) { toast('Erreur : ' + e.message, 'error'); }
  }
  function refreshTabCounts() {
    var el = $('apCatTabs'); if (!el) return;
    el.innerHTML = CAT_TABS.map(function (t) {
      return '<button class="at-chip' + (P.setTab === t[0] ? ' active' : '') + '" onclick="AtelierPlus.setCatTab(\'' + t[0] + '\')">' +
        '<i class="fa-solid ' + t[2] + '"></i> ' + t[1] + '<b>' + P.cat[t[0]].length + '</b></button>';
    }).join('');
  }

  function actBtn(icon, title, fn, id, cls) {
    return '<button class="at-btn ' + (cls || '') + '" title="' + esc(title) + '" onclick="AtelierPlus.' + fn + '(\'' + js(id) + '\')"><i class="fa-solid ' + icon + '"></i></button>';
  }
  function matches(it) {
    if (!P.q) return true;
    return [it.name, it.family, it.phone, it.specialty, it.parent].join(' ').toLowerCase().indexOf(P.q) !== -1;
  }

  function renderAddBox() {
    var el = $('apAddBox'); if (!el) return;
    var inp = function (id, ph, w) { return '<input id="' + id + '" placeholder="' + ph + '" style="width:' + (w || 160) + 'px;">'; };
    var btn = '<button class="at-btn primary" onclick="AtelierPlus.addItem()"><i class="fa-solid fa-plus"></i> Ajouter</button>';
    if (P.setTab === 'panne') el.innerHTML = inp('apN1', 'Nouveau type de panne', 220) + ' ' + btn;
    else if (P.setTab === 'piece') el.innerHTML = inp('apN1', 'Désignation', 220) + ' ' + inp('apN2', 'Famille', 140) + ' ' + btn;
    else el.innerHTML = inp('apN1', 'Nom', 180) + ' ' + inp('apN2', 'Téléphone', 130) + ' ' + inp('apN3', 'Spécialité', 140) +
      ' <select id="apN4"><option value="externe">Externe</option><option value="interne">Interne</option></select> ' + btn;
  }

  function renderCatList() {
    var list = $('apCatList'); if (!list) return;
    renderAddBox();
    var t = P.setTab, h = '';
    if (t === 'panne') {
      var ps = P.cat.panne.filter(function (p) {
        return matches(p) || P.cat.intervention.some(function (i) { return i.parentKey === p.nameKey && matches(i); });
      });
      ps.forEach(function (p) {
        var subs = P.cat.intervention.filter(function (i) { return i.parentKey === p.nameKey; });
        var open = P.openPanne === p._id || !!P.q;
        h += '<div class="ap-it" style="font-weight:700;"><span style="cursor:pointer;" onclick="AtelierPlus.togglePanne(\'' + js(p._id) + '\')">' +
          '<i class="fa-solid fa-chevron-' + (open ? 'down' : 'right') + '" style="width:14px;"></i> ' + esc(p.name) +
          '<span class="ap-tag">' + subs.length + ' interv.</span><span class="ap-tag">' + (p.usageCount || 0) + '×</span></span>' +
          '<span class="acts">' + actBtn('fa-plus', 'Ajouter une intervention', 'addInterv', p._id) +
          actBtn('fa-pen', 'Renommer', 'renameItem', p._id) + actBtn('fa-trash', 'Supprimer', 'delItem', p._id, 'danger') + '</span></div>';
        if (open) {
          h += '<div class="ap-sublist">' + (subs.length ? subs.map(function (i) {
            return '<div class="ap-it"><span>' + esc(i.name) +
              '<span class="ap-tag' + (i.isVidange ? ' vid' : '') + '" style="cursor:pointer;" title="Cliquer pour basculer" onclick="AtelierPlus.toggleVid(\'' + js(i._id) + '\')">' +
              (i.isVidange ? '🛢 Vidange (reset compteur)' : 'normale') + '</span></span><span class="acts">' +
              actBtn('fa-pen', 'Renommer', 'renameItem', i._id) + actBtn('fa-trash', 'Supprimer', 'delItem', i._id, 'danger') + '</span></div>';
          }).join('') : '<div class="at-sub">Aucune intervention pour cette panne.</div>') + '</div>';
        }
      });
      if (!ps.length) h = '<div class="at-sub">Aucun type de panne.</div>';
    } else if (t === 'piece') {
      var pcs = P.cat.piece.filter(matches);
      h = pcs.map(function (p) {
        return '<div class="ap-it"><span><b>' + esc(p.name) + '</b>' + (p.family ? '<span class="ap-tag">' + esc(p.family) + '</span>' : '') +
          '<span class="ap-tag">' + (p.usageCount || 0) + '×</span></span><span class="acts">' +
          actBtn('fa-tag', 'Modifier la famille', 'editFamily', p._id) + actBtn('fa-pen', 'Renommer', 'renameItem', p._id) +
          actBtn('fa-trash', 'Supprimer', 'delItem', p._id, 'danger') + '</span></div>';
      }).join('') || '<div class="at-sub">Aucune pièce.</div>';
    } else {
      var ivs = P.cat.intervenant.filter(matches);
      h = ivs.map(function (p) {
        return '<div class="ap-it"><span><b>' + esc(p.name) + '</b>' +
          '<span class="ap-tag" style="cursor:pointer;" title="Cliquer pour basculer" onclick="AtelierPlus.toggleInterne(\'' + js(p._id) + '\')">' + (p.interne ? 'interne' : 'externe') + '</span>' +
          (p.phone ? '<span class="ap-tag"><i class="fa-solid fa-phone"></i> ' + esc(p.phone) + '</span>' : '') +
          (p.specialty ? '<span class="ap-tag">' + esc(p.specialty) + '</span>' : '') +
          '<span class="ap-tag">' + (p.usageCount || 0) + '×</span></span><span class="acts">' +
          actBtn('fa-address-card', 'Téléphone / spécialité', 'editContact', p._id) + actBtn('fa-pen', 'Renommer', 'renameItem', p._id) +
          actBtn('fa-trash', 'Supprimer', 'delItem', p._id, 'danger') + '</span></div>';
      }).join('') || '<div class="at-sub">Aucun intervenant.</div>';
    }
    list.innerHTML = h;
  }

  function togglePanne(id) { P.openPanne = P.openPanne === id ? '' : id; renderCatList(); }

  function val(id) { var e = $(id); return e ? String(e.value || '').trim() : ''; }

  function addItem() {
    var t = P.setTab, name = val('apN1');
    if (!name) { toast('Le nom est requis', 'warning'); return; }
    var body = { kind: t, name: name };
    if (t === 'piece') body.family = val('apN2');
    if (t === 'intervenant') { body.phone = val('apN2'); body.specialty = val('apN3'); body.interne = val('apN4') === 'interne'; }
    mutate(function () { return api('/api/atelier/catalog', { method: 'POST', body: body }); }, '« ' + name + ' » ajouté');
  }

  function addInterv(panneId) {
    var p = findItem(panneId); if (!p) return;
    var name = prompt('Nouvelle intervention pour « ' + p.name + ' » :');
    if (!name || !name.trim()) return;
    var vid = confirm('Cette intervention est-elle une VIDANGE (remet le compteur de vidange à zéro à la clôture) ?\n\nOK = oui, Annuler = non');
    P.openPanne = p._id;
    mutate(function () {
      return api('/api/atelier/catalog', { method: 'POST', body: { kind: 'intervention', name: name.trim(), parent: p.name, isVidange: vid } });
    }, 'Intervention ajoutée');
  }

  function renameItem(id) {
    var it = findItem(id); if (!it) return;
    var name = prompt('Nouveau nom :', it.name);
    if (!name || !name.trim() || name.trim() === it.name) return;
    mutate(function () { return api('/api/atelier/catalog/' + id, { method: 'PATCH', body: { name: name.trim() } }); }, 'Renommé');
  }

  function delItem(id) {
    var it = findItem(id); if (!it) return;
    var msg = 'Supprimer « ' + it.name + ' » du catalogue ?';
    if (it.kind === 'panne') msg += '\nSes interventions seront supprimées aussi.';
    msg += '\nLes bons existants ne sont pas modifiés.';
    if (!confirm(msg)) return;
    mutate(function () { return api('/api/atelier/catalog/' + id, { method: 'DELETE' }); }, 'Supprimé');
  }

  function toggleVid(id) {
    var it = findItem(id); if (!it) return;
    mutate(function () { return api('/api/atelier/catalog/' + id, { method: 'PATCH', body: { isVidange: !it.isVidange } }); });
  }

  function toggleInterne(id) {
    var it = findItem(id); if (!it) return;
    mutate(function () { return api('/api/atelier/catalog/' + id, { method: 'PATCH', body: { interne: !it.interne } }); });
  }

  function editFamily(id) {
    var it = findItem(id); if (!it) return;
    var f = prompt('Famille de « ' + it.name + ' » :', it.family || '');
    if (f === null) return;
    mutate(function () { return api('/api/atelier/catalog/' + id, { method: 'PATCH', body: { family: f.trim() } }); });
  }

  function editContact(id) {
    var it = findItem(id); if (!it) return;
    var ph = prompt('Téléphone de « ' + it.name + ' » :', it.phone || '');
    if (ph === null) return;
    var sp = prompt('Spécialité :', it.specialty || '');
    if (sp === null) return;
    mutate(function () { return api('/api/atelier/catalog/' + id, { method: 'PATCH', body: { phone: ph.trim(), specialty: sp.trim() } }); });
  }

  window.AtelierPlus = {
    renderKpis: renderKpis, renderSettings: renderSettings,
    openHistory: openHistory, closeHistory: closeHistory, openBonFromHistory: openBonFromHistory,
    saveLate: saveLate, setCatTab: setCatTab, filterCat: filterCat, togglePanne: togglePanne,
    addItem: addItem, addInterv: addInterv, renameItem: renameItem, delItem: delItem,
    toggleVid: toggleVid, toggleInterne: toggleInterne, editFamily: editFamily, editContact: editContact
  };
})();
