/* ═══════════════════════════════════════════════════════════════════════
 * EMAIL ALERTS UI v5 — Executive Pro Fleet Notification Center
 * Per-recipient event subscriptions, explicit Maintenance & Client sites,
 * adaptive Light/Dark theme, zero exposed credentials.
 * ═══════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var EMAIL_RX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  var EVENT_DEFS = [
    { key: 'zone_maint_enter', icon: '🛠️', label: 'Entrée Atelier / Maintenance' },
    { key: 'zone_maint_exit',  icon: '🚪', label: 'Sortie Atelier / Maintenance' },
    { key: 'maint_auto_logged',icon: '🔧', label: 'Intervention Auto (≥ 60 min)' },
    { key: 'speed',            icon: '🚨', label: 'Excès de Vitesse' },
    { key: 'vidange_due',      icon: '🛢️', label: 'Échéance Vidange' },
    { key: 'zone_other_enter', icon: '📍', label: 'Entrée Client / Base' },
    { key: 'zone_other_exit',  icon: '🏁', label: 'Sortie Client / Base' }
  ];

  var S = {
    open: true,
    loading: false,
    saving: false,
    testing: false,
    banner: null,
    zones: [],
    log: [],
    testType: 'zone_enter',
    cfg: {
      enabled: false,
      recipients: [],
      speedLimitOverride: 0,
      speedMinMinutes: 2,
      cooldownMinutes: 15
    }
  };

  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function toast(m, t) { if (window.showToast) window.showToast(m, t || 'info'); }
  function base() { return (window.FLEET_CONFIG && FLEET_CONFIG.API && FLEET_CONFIG.API.baseUrl) || ''; }
  function code() {
    return localStorage.getItem('fleetAccessCode') || (window.ui && ui.currentCode) ||
      (window.FLEET_CONFIG && FLEET_CONFIG.accessCode) || '';
  }

  async function api(path, method, body) {
    var h = { 'Content-Type': 'application/json' };
    var c = code(); if (c) h['x-access-code'] = c;
    var r = await fetch(base() + path, { method: method || 'GET', headers: h, body: body ? JSON.stringify(body) : undefined });
    var j = null; try { j = await r.json(); } catch (_) { /* ignore */ }
    if (!r.ok) throw new Error((j && j.error) || ('Erreur serveur HTTP ' + r.status));
    return j;
  }

  function newRecObj(email, label) {
    return {
      email: email,
      label: label || '',
      enabled: true,
      events: {
        zone_maint_enter: true,
        zone_maint_exit: true,
        maint_auto_logged: false,
        speed: false,
        vidange_due: false,
        zone_other_enter: false,
        zone_other_exit: false
      },
      customZoneNames: []
    };
  }

  function injectCss() {
    var old = $('eaUiCss'); if (old) old.remove();
    var st = document.createElement('style');
    st.id = 'eaUiCss';
    st.textContent = [
      '.ea-card{--ea-bg:#0f172a;--ea-card:#162032;--ea-bd:rgba(255,255,255,.12);--ea-tx:#f1f5f9;--ea-mu:#94a3b8;border:1px solid var(--ea-bd);border-radius:16px;margin-bottom:16px;overflow:hidden;background:var(--ea-card);color:var(--ea-tx);box-shadow:0 4px 20px rgba(0,0,0,.15)}',
      ':root[data-theme="light"] .ea-card{--ea-bg:#f8fafc;--ea-card:#ffffff;--ea-bd:#e2e8f0;--ea-tx:#0f172a;--ea-mu:#475569;box-shadow:0 2px 12px rgba(15,23,42,.05)}',
      '.ea-card input[type="checkbox"]{width:16px!important;height:16px!important;margin:0;padding:0;flex-shrink:0;cursor:pointer;accent-color:#2563eb}',
      '.ea-head{cursor:pointer;display:flex;justify-content:space-between;align-items:center;padding:15px 20px;background:linear-gradient(90deg,rgba(37,99,235,.08) 0%,transparent 100%);gap:12px;flex-wrap:wrap}',
      '.ea-body{padding:18px 20px;border-top:1px solid var(--ea-bd);display:flex;flex-direction:column;gap:14px}',
      '.ea-sec{background:var(--ea-bg);border:1px solid var(--ea-bd);border-radius:13px;padding:15px}',
      '.ea-sec h4{margin:0 0 10px;font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.8px;color:#2563eb;display:flex;align-items:center;gap:7px}',
      ':root:not([data-theme="light"]) .ea-sec h4{color:#60a5fa}',
      '.ea-rec{background:var(--ea-card);border:1px solid var(--ea-bd);border-left:4px solid #2563eb;border-radius:12px;padding:13px 15px;display:flex;flex-direction:column;gap:10px;transition:.15s}',
      '.ea-rec.off{opacity:.55;border-left-color:#64748b}',
      '.ea-pills{display:flex;flex-wrap:wrap;gap:6px}',
      '.ea-pill{padding:5px 12px;border-radius:999px;border:1px solid var(--ea-bd);background:var(--ea-bg);color:var(--ea-mu);font-size:11px;font-weight:700;cursor:pointer;font-family:inherit;transition:.14s;width:auto!important}',
      '.ea-pill:hover{border-color:#3b82f6}',
      '.ea-pill.on{background:rgba(37,99,235,.14);border-color:#2563eb;color:#1d4ed8}',
      ':root:not([data-theme="light"]) .ea-pill.on{background:rgba(59,130,246,.22);border-color:#60a5fa;color:#93c5fd}',
      '.ea-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:12px}',
      '.ea-f label{display:block;font-size:11px;font-weight:700;color:var(--ea-mu);margin-bottom:5px}',
      '.ea-f input{width:100%!important;box-sizing:border-box;padding:8px 11px;border-radius:9px;border:1px solid var(--ea-bd);background:var(--ea-card);color:var(--ea-tx);font-size:12px;font-family:inherit}',
      '.ea-sel{width:auto!important;min-width:210px;padding:8px 12px;border-radius:9px;border:1px solid var(--ea-bd);background:var(--ea-bg);color:var(--ea-tx);font-size:12px;font-weight:600;font-family:inherit}',
      '.ea-btn{width:auto!important;padding:8px 14px;border-radius:9px;border:1px solid var(--ea-bd);background:var(--ea-card);color:var(--ea-tx);font-size:12px;font-weight:700;cursor:pointer;font-family:inherit;display:inline-flex;align-items:center;gap:6px;white-space:nowrap;transition:.14s}',
      '.ea-btn:hover{border-color:#3b82f6}',
      '.ea-btn.pri{background:linear-gradient(135deg,#2563eb,#4f46e5);border:none;color:#fff;padding:9px 18px;box-shadow:0 2px 8px rgba(37,99,235,.28)}',
      '.ea-btn.ok{background:linear-gradient(135deg,#059669,#10b981);border:none;color:#fff}',
      '.ea-btn.bad{border-color:rgba(239,68,68,.35);color:#ef4444}',
      '.ea-btn[disabled]{opacity:.55;cursor:wait}',
      '.ea-sub{font-size:11.5px;color:var(--ea-mu);line-height:1.5}',
      '.ea-ban{padding:11px 15px;border-radius:11px;font-size:12px;font-weight:600;display:flex;align-items:flex-start;gap:9px}',
      '.ea-ban.ok{background:rgba(16,185,129,.12);border:1px solid rgba(16,185,129,.38);color:#10b981}',
      ':root[data-theme="light"] .ea-ban.ok{color:#047857}',
      '.ea-ban.err{background:rgba(239,68,68,.1);border:1px solid rgba(239,68,68,.38);color:#ef4444}',
      ':root[data-theme="light"] .ea-ban.err{color:#b91c1c}'
    ].join('\n');
    document.head.appendChild(st);
  }

  async function load() {
    if (S.loading) return;
    S.loading = true; render();
    try {
      var res = await api('/api/email-alerts/config', 'GET');
      if (res && res.config) {
        S.cfg = Object.assign(S.cfg, res.config);
        S.cfg.recipients = (res.config.recipients || []).map(function (r) {
          return typeof r === 'string' ? newRecObj(r, '') : r;
        });
      }
      S.zones = (res && res.zones) || [];
      S.log = (res && res.log) || [];
    } catch (e) { console.warn('[EmailAlertsUI] load error:', e.message); }
    S.loading = false; render();
  }

  function syncDomInputs() {
    var c = S.cfg;
    if ($('eaSpdLim')) c.speedLimitOverride = Math.max(0, Number($('eaSpdLim').value) || 0);
    if ($('eaSpdMin')) c.speedMinMinutes = Math.max(1, Number($('eaSpdMin').value) || 2);
    if ($('eaCool')) c.cooldownMinutes = Math.max(0, Number($('eaCool').value) >= 0 ? Number($('eaCool').value) : 15);
  }

  function addRecipientsFromInput() {
    syncDomInputs();
    var inp = $('eaRecInput'), lblInp = $('eaRecLabel');
    if (!inp) return;
    var label = lblInp ? lblInp.value.trim() : '';
    var tokens = (inp.value || '').split(/[,;\s]+/).map(function (x) { return x.trim().toLowerCase(); }).filter(Boolean);
    if (!tokens.length) return;
    var invalid = [], added = 0;
    tokens.forEach(function (em) {
      if (!EMAIL_RX.test(em)) invalid.push(em);
      else if (!S.cfg.recipients.some(function (r) { return r.email === em; })) {
        S.cfg.recipients.push(newRecObj(em, tokens.length === 1 ? label : ''));
        added++;
      }
    });
    if (added > 0) { S.cfg.enabled = true; S.cfg.paused = false; }
    if (invalid.length) S.banner = { kind: 'err', msg: 'Adresse(s) email invalide(s) : ' + invalid.join(', ') };
    inp.value = '';
    if (lblInp) lblInp.value = '';
    render();
  }

  function removeRecipient(idx) { syncDomInputs(); S.cfg.recipients.splice(idx, 1); render(); }
  function toggleRecEnabled(idx, on) { syncDomInputs(); if (S.cfg.recipients[idx]) S.cfg.recipients[idx].enabled = !!on; render(); }
  function toggleRecEvent(idx, key) {
    syncDomInputs();
    var r = S.cfg.recipients[idx];
    if (!r) return;
    r.events = r.events || {};
    r.events[key] = !r.events[key];
    render();
  }
  function setAllRecEvents(idx, on) {
    syncDomInputs();
    var r = S.cfg.recipients[idx];
    if (!r) return;
    r.events = r.events || {};
    EVENT_DEFS.forEach(function (d) { r.events[d.key] = !!on; });
    render();
  }
  function toggleRecZone(idx, zName, on) {
    syncDomInputs();
    var r = S.cfg.recipients[idx];
    if (!r) return;
    var arr = r.customZoneNames || [];
    var pos = arr.indexOf(zName);
    if (on && pos < 0) arr.push(zName);
    if (!on && pos >= 0) arr.splice(pos, 1);
    r.customZoneNames = arr;
    render();
  }

  async function save(silent) {
    syncDomInputs();
    if ($('eaRecInput') && $('eaRecInput').value.trim()) addRecipientsFromInput();
    S.saving = true; render();
    try {
      var res = await api('/api/email-alerts/config', 'POST', S.cfg);
      if (res && res.config) S.cfg = Object.assign(S.cfg, res.config);
      if (!silent) {
        S.banner = { kind: 'ok', msg: 'Configuration Email enregistrée avec succès.' };
        toast('✅ Configuration Email enregistrée', 'success');
      }
    } catch (e) {
      S.banner = { kind: 'err', msg: 'Erreur sauvegarde : ' + e.message };
      toast('Erreur sauvegarde : ' + e.message, 'error');
    }
    S.saving = false; render();
  }

  async function sendTest(overrideType, singleEmail) {
    await save(true);
    var targets = singleEmail
      ? [singleEmail]
      : S.cfg.recipients.filter(function (r) { return r.enabled; }).map(function (r) { return r.email; });
    if (!targets.length) {
      S.banner = { kind: 'err', msg: 'Ajoutez (et gardez cochée) au moins une adresse email destinataire avant de tester.' };
      render();
      return;
    }
    var evType = overrideType || S.testType;
    S.testing = true;
    S.banner = null;
    render();
    try {
      var res = await api('/api/email-alerts/test', 'POST', { eventType: evType, to: targets });
      if (res && res.log) S.log = res.log;
      var msg = evType === 'hello'
        ? '"Hello test" envoyé à ' + targets.join(', ') + ' ! (Vérifiez aussi l\'onglet Spam/Indésirables la 1ère fois.)'
        : 'Simulation (' + (res.truck || '') + ') envoyée à ' + targets.join(', ') + ' !';
      S.banner = { kind: 'ok', msg: msg };
      toast('✅ ' + msg, 'success');
    } catch (e) {
      S.banner = { kind: 'err', msg: e.message };
      toast('❌ ' + e.message, 'error');
      await load();
    }
    S.testing = false; render();
  }

  function renderRecipientCard(r, idx, maintSites, otherSites) {
    var ev = r.events || {};
    var maintAutoIncluded = !!(ev.zone_maint_enter || ev.zone_maint_exit);
    var otherAutoIncluded = !!(ev.zone_other_enter || ev.zone_other_exit);
    var pills = EVENT_DEFS.map(function (d) {
      var on = !!ev[d.key];
      return '<button type="button" class="ea-pill' + (on ? ' on' : '') + '" onclick="EmailAlertsUI.toggleRecEvent(' + idx + ',\'' + d.key + '\')">' +
        (on ? '✓ ' : '') + d.icon + ' ' + esc(d.label) + '</button>';
    }).join('');

    var maintHtml = maintSites.length
      ? '<div class="ea-sub">🛠️ <b>Sites Maintenance :</b> ' +
          (maintAutoIncluded
            ? '<span style="color:#10b981;font-weight:700">✓ Tous inclus automatiquement (' + maintSites.map(function (z) { return esc(z.name); }).join(', ') + ')</span>'
            : maintSites.map(function (z) {
                var ck = (r.customZoneNames || []).indexOf(z.name) >= 0;
                return '<label style="display:inline-flex;align-items:center;gap:5px;margin-right:10px;cursor:pointer"><input type="checkbox"' + (ck ? ' checked' : '') + ' onchange="EmailAlertsUI.toggleRecZone(' + idx + ',\'' + esc(z.name).replace(/'/g, "\\'") + '\',this.checked)"> ' + esc(z.name) + '</label>';
              }).join('')) +
        '</div>'
      : '';

    var otherHtml = otherSites.length
      ? '<div class="ea-sub">📍 <b>Autres Sites (Clients / Base) :</b> ' +
          (otherAutoIncluded
            ? '<span style="color:#10b981;font-weight:700">✓ Tous inclus automatiquement (' + otherSites.map(function (z) { return esc(z.name); }).join(', ') + ')</span>'
            : otherSites.map(function (z) {
                var ck = (r.customZoneNames || []).indexOf(z.name) >= 0;
                return '<label style="display:inline-flex;align-items:center;gap:5px;margin-right:10px;cursor:pointer"><input type="checkbox"' + (ck ? ' checked' : '') + ' onchange="EmailAlertsUI.toggleRecZone(' + idx + ',\'' + esc(z.name).replace(/'/g, "\\'") + '\',this.checked)"> ' + esc(z.name) + '</label>';
              }).join('')) +
        '</div>'
      : '';

    return '<div class="ea-rec' + (r.enabled ? '' : ' off') + '">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap">' +
        '<label style="display:inline-flex;align-items:center;gap:8px;cursor:pointer;font-size:13px;font-weight:800">' +
          '<input type="checkbox"' + (r.enabled ? ' checked' : '') + ' onchange="EmailAlertsUI.toggleRecEnabled(' + idx + ',this.checked)">' +
          '<i class="fa-solid fa-envelope" style="color:#2563eb"></i> ' + esc(r.email) +
          (r.label ? ' <span class="ea-sub" style="font-weight:600">· ' + esc(r.label) + '</span>' : '') +
        '</label>' +
        '<div style="display:flex;gap:6px;flex-wrap:wrap">' +
          '<button type="button" class="ea-btn ok" onclick="EmailAlertsUI.sendTest(\'hello\',\'' + esc(r.email) + '\')"><i class="fa-solid fa-paper-plane"></i> Hello test</button>' +
          '<button type="button" class="ea-btn" onclick="EmailAlertsUI.setAllRec(' + idx + ',true)">Tout</button>' +
          '<button type="button" class="ea-btn" onclick="EmailAlertsUI.setAllRec(' + idx + ',false)">Rien</button>' +
          '<button type="button" class="ea-btn bad" onclick="EmailAlertsUI.removeRecipient(' + idx + ')"><i class="fa-solid fa-trash"></i></button>' +
        '</div>' +
      '</div>' +
      '<div class="ea-pills">' + pills + '</div>' +
      maintHtml + otherHtml +
    '</div>';
  }

  function render() {
    var mount = $('emailAlertsSettingsMount');
    if (!mount) return;
    injectCss();
    var c = S.cfg;
    var activeCount = c.recipients.filter(function (r) { return r.enabled; }).length;
    var statusPill = !c.enabled
      ? '<span style="background:rgba(148,163,184,.2);color:var(--ea-mu);padding:3px 10px;border-radius:999px;font-size:11px;font-weight:700;">⚪ Désactivé</span>'
      : (activeCount > 0
          ? '<span style="background:rgba(16,185,129,.16);color:#10b981;padding:3px 10px;border-radius:999px;font-size:11px;font-weight:700;">🟢 Actif · ' + activeCount + ' destinataire(s)</span>'
          : '<span style="background:rgba(245,158,11,.18);color:#d97706;padding:3px 10px;border-radius:999px;font-size:11px;font-weight:700;">⚠️ Ajoutez au moins 1 email</span>');

    var maintSites = S.zones.filter(function (z) { return z.type === 'maintenance'; });
    var otherSites = S.zones.filter(function (z) { return z.type !== 'maintenance'; });

    var recsHtml = c.recipients.length
      ? '<div style="display:flex;flex-direction:column;gap:9px;margin-top:12px">' +
          c.recipients.map(function (r, idx) { return renderRecipientCard(r, idx, maintSites, otherSites); }).join('') +
        '</div>'
      : '<div class="ea-sub" style="margin-top:12px;padding:14px;text-align:center;border:1px dashed var(--ea-bd);border-radius:10px">Aucune adresse email configurée. Ajoutez une adresse ci-dessus puis choisissez ses alertes.</div>';

    var bannerHtml = S.banner
      ? '<div class="ea-ban ' + S.banner.kind + '"><i class="fa-solid ' + (S.banner.kind === 'ok' ? 'fa-circle-check' : 'fa-triangle-exclamation') + '" style="margin-top:2px"></i><div>' + esc(S.banner.msg) + '</div></div>'
      : '';

    var logHtml = S.log.length ? '<div style="margin-top:4px;padding:10px 12px;background:var(--ea-bg);border:1px solid var(--ea-bd);border-radius:10px;max-height:110px;overflow:auto;display:flex;flex-direction:column;gap:4px">' +
      S.log.slice(0, 6).map(function (l) {
        var dt = new Date(l.at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
        var toStr = Array.isArray(l.to) ? ' → ' + l.to.join(', ') : '';
        return '<div class="ea-sub">' + (l.ok ? '✅' : '❌') + ' <b>' + esc(dt) + '</b> — ' + esc(l.subject || '') + esc(toStr) +
          (l.error ? ' <span style="color:#ef4444">(' + esc(l.error) + ')</span>' : '') + '</div>';
      }).join('') + '</div>' : '';

    mount.innerHTML = '<div class="ea-card">' +
      '<div class="ea-head" onclick="EmailAlertsUI.toggleOpen()">' +
        '<span style="display:flex;align-items:center;gap:11px;font-weight:800;font-size:14.5px">' +
          '<span style="width:34px;height:34px;background:linear-gradient(135deg,#2563eb,#4f46e5);border-radius:10px;display:flex;align-items:center;justify-content:center;color:#fff;box-shadow:0 3px 8px rgba(37,99,235,.3)"><i class="fa-solid fa-envelope-circle-check"></i></span>' +
          'Alertes &amp; Notifications par Email ' + statusPill +
        '</span>' +
        '<div style="display:flex;align-items:center;gap:12px" onclick="event.stopPropagation()">' +
          '<label style="display:inline-flex;align-items:center;gap:7px;font-size:12px;font-weight:700;cursor:pointer">' +
            '<input type="checkbox"' + (c.enabled ? ' checked' : '') + ' onchange="EmailAlertsUI.setEnabled(this.checked)"> Activer' +
          '</label>' +
          '<button type="button" class="ea-btn" style="padding:6px 10px" onclick="EmailAlertsUI.toggleOpen()"><i class="fa-solid fa-chevron-' + (S.open ? 'up' : 'down') + '"></i></button>' +
        '</div>' +
      '</div>' +
      (S.open ? '<div class="ea-body">' +
        '<div class="ea-sec"><h4><i class="fa-solid fa-users-gear"></i> 1. Destinataires &amp; Choix des Alertes</h4>' +
          '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">' +
            '<input id="eaRecInput" type="email" placeholder="Adresse email (ex: atelier@douroub.dz)" style="flex:2;min-width:220px;width:auto!important;padding:9px 12px;border-radius:9px;border:1px solid var(--ea-bd);background:var(--ea-card);color:var(--ea-tx);font-size:12px" onkeydown="if(event.key===\'Enter\'){event.preventDefault();EmailAlertsUI.addRec();}">' +
            '<input id="eaRecLabel" type="text" placeholder="Nom / Rôle (ex: Chef Atelier)" style="flex:1;min-width:160px;width:auto!important;padding:9px 12px;border-radius:9px;border:1px solid var(--ea-bd);background:var(--ea-card);color:var(--ea-tx);font-size:12px" onkeydown="if(event.key===\'Enter\'){event.preventDefault();EmailAlertsUI.addRec();}">' +
            '<button type="button" class="ea-btn pri" onclick="EmailAlertsUI.addRec()"><i class="fa-solid fa-plus"></i> Ajouter</button>' +
          '</div>' + recsHtml +
        '</div>' +
        '<div class="ea-sec"><h4><i class="fa-solid fa-sliders"></i> 2. Paramètres &amp; Anti-Spam</h4>' +
          '<div class="ea-grid">' +
            '<div class="ea-f"><label>Limite vitesse Email (0 = règle générale)</label><input id="eaSpdLim" type="number" min="0" value="' + esc(c.speedLimitOverride) + '"></div>' +
            '<div class="ea-f"><label>Durée min. excès vitesse (minutes)</label><input id="eaSpdMin" type="number" min="1" value="' + esc(c.speedMinMinutes) + '"></div>' +
            '<div class="ea-f"><label>Délai anti-spam entre 2 alertes (minutes)</label><input id="eaCool" type="number" min="0" value="' + esc(c.cooldownMinutes) + '"></div>' +
          '</div>' +
        '</div>' +
        bannerHtml +
        '<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;padding-top:2px">' +
          '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">' +
            '<button type="button" class="ea-btn ok"' + (S.testing ? ' disabled' : '') + ' onclick="EmailAlertsUI.sendTest(\'hello\')"><i class="fa-solid fa-paper-plane"></i> ' + (S.testing ? 'Envoi…' : 'Tester ("Hello test")') + '</button>' +
            '<select class="ea-sel" onchange="EmailAlertsUI.setTestType(this.value)">' +
              '<option value="zone_enter"' + (S.testType === 'zone_enter' ? ' selected' : '') + '>Simulation : Arrivée Atelier</option>' +
              '<option value="zone_exit"' + (S.testType === 'zone_exit' ? ' selected' : '') + '>Simulation : Sortie Atelier</option>' +
              '<option value="speed"' + (S.testType === 'speed' ? ' selected' : '') + '>Simulation : Excès vitesse</option>' +
              '<option value="vidange_due"' + (S.testType === 'vidange_due' ? ' selected' : '') + '>Simulation : Échéance vidange</option>' +
            '</select>' +
            '<button type="button" class="ea-btn"' + (S.testing ? ' disabled' : '') + ' onclick="EmailAlertsUI.sendTest()"><i class="fa-solid fa-truck-fast"></i> Simuler alerte camion</button>' +
          '</div>' +
          '<button type="button" class="ea-btn pri"' + (S.saving ? ' disabled' : '') + ' onclick="EmailAlertsUI.save()"><i class="fa-solid fa-floppy-disk"></i> ' + (S.saving ? 'Enregistrement…' : 'Enregistrer') + '</button>' +
        '</div>' + logHtml +
      '</div>' : '') +
    '</div>';
  }

  window.EmailAlertsUI = {
    load: load,
    save: function () { return save(false); },
    sendTest: sendTest,
    addRec: addRecipientsFromInput,
    removeRecipient: removeRecipient,
    toggleRecEnabled: toggleRecEnabled,
    toggleRecEvent: toggleRecEvent,
    setAllRec: setAllRecEvents,
    toggleRecZone: toggleRecZone,
    toggleOpen: function () { syncDomInputs(); S.open = !S.open; render(); },
    setEnabled: function (on) { syncDomInputs(); S.cfg.enabled = !!on; S.cfg.paused = !on; save(false); },
    setTestType: function (v) { S.testType = v; }
  };

  function hookTab() {
    if (!window.ui || typeof window.ui.switchTab !== 'function') return false;
    if (!window.ui.switchTab.__eaHooked) {
      var orig = window.ui.switchTab;
      window.ui.switchTab = function (tabName) {
        var r = orig.apply(window.ui, arguments);
        if (tabName === 'settings') load();
        return r;
      };
      window.ui.switchTab.__eaHooked = true;
    }
    render();
    setTimeout(load, 600);
    return true;
  }

  var tries = 0;
  (function wait() { if (!hookTab() && tries++ < 80) setTimeout(wait, 200); })();
})();
