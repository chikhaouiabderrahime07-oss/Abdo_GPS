/* ═══════════════════════════════════════════════════════════════════════
 * EMAIL ALERTS UI v4 — Per-Recipient Event Subscriptions + Site Clarity
 * Supports Dark & Light themes, explicit Maintenance/Client site visibility,
 * live feedback banner, and HTTPS Port-443 Gmail bridge for Render Free.
 * ═══════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var EMAIL_RX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  var APPS_SCRIPT_CODE =
    'function doPost(e){\n' +
    '  var d = JSON.parse(e.postData.contents);\n' +
    '  MailApp.sendEmail({ to: d.to, subject: d.subject, htmlBody: d.html, body: d.text, name: d.fromName || "Douroub Flotte GPS" });\n' +
    '  return ContentService.createTextOutput("OK");\n' +
    '}';

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
    showRelay: false,
    loading: false,
    saving: false,
    testing: false,
    banner: null, // { kind: 'ok'|'err'|'warn', msg: '' }
    zones: [],
    log: [],
    testType: 'zone_enter',
    cfg: {
      enabled: false,
      recipients: [],
      relayUrl: '',
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
      '.ea-card{--ea-bg:var(--bg-surface,#111827);--ea-card:var(--bg-elevated,#1a2332);--ea-bd:var(--border,rgba(255,255,255,.14));--ea-tx:var(--text-primary,#f1f5f9);--ea-mu:var(--text-secondary,#94a3b8);border:1px solid rgba(245,158,11,.35);border-radius:14px;margin-bottom:14px;overflow:hidden;background:var(--ea-card);color:var(--ea-tx)}',
      ':root[data-theme="light"] .ea-card{--ea-bg:#f8fafc;--ea-card:#ffffff;--ea-bd:#e2e8f0;--ea-tx:#0f172a;--ea-mu:#475569;box-shadow:0 2px 10px rgba(15,23,42,.06)}',
      '.ea-head{cursor:pointer;display:flex;justify-content:space-between;align-items:center;padding:14px 18px;background:linear-gradient(90deg,rgba(245,158,11,.12) 0%,transparent 100%);gap:10px;flex-wrap:wrap}',
      '.ea-body{padding:16px 18px;border-top:1px solid var(--ea-bd);display:flex;flex-direction:column;gap:14px}',
      '.ea-sec{background:var(--ea-bg);border:1px solid var(--ea-bd);border-radius:12px;padding:14px}',
      '.ea-sec h4{margin:0 0 8px;font-size:12px;text-transform:uppercase;letter-spacing:.7px;color:#d97706;display:flex;align-items:center;gap:7px}',
      '.ea-rec{background:var(--ea-card);border:1px solid var(--ea-bd);border-left:4px solid #0284c7;border-radius:11px;padding:12px 14px;display:flex;flex-direction:column;gap:9px}',
      '.ea-rec.off{opacity:.55;border-left-color:#64748b}',
      '.ea-pills{display:flex;flex-wrap:wrap;gap:6px}',
      '.ea-pill{padding:5px 11px;border-radius:999px;border:1px solid var(--ea-bd);background:var(--ea-bg);color:var(--ea-mu);font-size:11px;font-weight:700;cursor:pointer;font-family:inherit;transition:.12s}',
      '.ea-pill.on{background:rgba(245,158,11,.18);border-color:#f59e0b;color:#d97706}',
      ':root:not([data-theme="light"]) .ea-pill.on{color:#fbbf24}',
      '.ea-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:10px}',
      '.ea-f label{display:block;font-size:11px;font-weight:700;color:var(--ea-mu);margin-bottom:4px}',
      '.ea-f input{width:100%;box-sizing:border-box;padding:8px 10px;border-radius:8px;border:1px solid var(--ea-bd);background:var(--ea-card);color:var(--ea-tx);font-size:12px;font-family:inherit}',
      '.ea-btn{padding:7px 13px;border-radius:9px;border:1px solid var(--ea-bd);background:var(--ea-card);color:var(--ea-tx);font-size:11px;font-weight:700;cursor:pointer;font-family:inherit;display:inline-flex;align-items:center;gap:6px}',
      '.ea-btn.pri{background:linear-gradient(135deg,#f59e0b,#d97706);border:none;color:#111;font-size:12px;padding:8px 16px}',
      '.ea-btn.ok{background:linear-gradient(135deg,#0284c7,#2563eb);border:none;color:#fff}',
      '.ea-btn.bad{border-color:rgba(239,68,68,.4);color:#ef4444}',
      '.ea-btn[disabled]{opacity:.55;cursor:wait}',
      '.ea-sub{font-size:11px;color:var(--ea-mu);line-height:1.5}',
      '.ea-ban{padding:10px 14px;border-radius:10px;font-size:12px;font-weight:600;display:flex;align-items:flex-start;gap:8px}',
      '.ea-ban.ok{background:rgba(16,185,129,.14);border:1px solid rgba(16,185,129,.4);color:#10b981}',
      ':root[data-theme="light"] .ea-ban.ok{color:#047857}',
      '.ea-ban.err{background:rgba(239,68,68,.12);border:1px solid rgba(239,68,68,.4);color:#ef4444}',
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
      if (S.log.some(function (l) { return l.smtpBlocked; }) && !S.cfg.relayUrl) S.showRelay = true;
    } catch (e) { console.warn('[EmailAlertsUI] load error:', e.message); }
    S.loading = false; render();
  }

  function syncDomInputs() {
    var c = S.cfg;
    if ($('eaSpdLim')) c.speedLimitOverride = Math.max(0, Number($('eaSpdLim').value) || 0);
    if ($('eaSpdMin')) c.speedMinMinutes = Math.max(1, Number($('eaSpdMin').value) || 2);
    if ($('eaCool')) c.cooldownMinutes = Math.max(0, Number($('eaCool').value) >= 0 ? Number($('eaCool').value) : 15);
    if ($('eaRelayUrl')) c.relayUrl = $('eaRelayUrl').value.trim();
  }

  function addRecipientsFromInput() {
    syncDomInputs();
    var inp = $('eaRecInput'), lblInp = $('eaRecLabel');
    if (!inp) return;
    var label = lblInp ? lblInp.value.trim() : '';
    var tokens = (inp.value || '').split(/[,;\s]+/).map(function (x) { return x.trim().toLowerCase(); }).filter(Boolean);
    if (!tokens.length) return;
    var invalid = [];
    tokens.forEach(function (em) {
      if (!EMAIL_RX.test(em)) invalid.push(em);
      else if (!S.cfg.recipients.some(function (r) { return r.email === em; })) {
        S.cfg.recipients.push(newRecObj(em, tokens.length === 1 ? label : ''));
      }
    });
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
      if (/465\/587|Render|timeout/i.test(e.message || '')) S.showRelay = true;
      S.banner = { kind: 'err', msg: e.message };
      toast('❌ ' + e.message, 'error');
      await load();
    }
    S.testing = false; render();
  }

  function copyScript() {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(APPS_SCRIPT_CODE);
      S.banner = { kind: 'ok', msg: 'Code Google Apps Script copié ! Collez-le sur script.google.com (connecté à komana.amana@gmail.com) → Déployer → Application Web (Accès : Tout le monde).' };
      render();
    }
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
                return '<label style="display:inline-flex;align-items:center;gap:4px;margin-right:8px;cursor:pointer"><input type="checkbox"' + (ck ? ' checked' : '') + ' onchange="EmailAlertsUI.toggleRecZone(' + idx + ',\'' + esc(z.name).replace(/'/g, "\\'") + '\',this.checked)"> ' + esc(z.name) + '</label>';
              }).join('')) +
        '</div>'
      : '';

    var otherHtml = otherSites.length
      ? '<div class="ea-sub">📍 <b>Autres Sites (Clients / Base) :</b> ' +
          (otherAutoIncluded
            ? '<span style="color:#10b981;font-weight:700">✓ Tous inclus automatiquement (' + otherSites.map(function (z) { return esc(z.name); }).join(', ') + ')</span>'
            : otherSites.map(function (z) {
                var ck = (r.customZoneNames || []).indexOf(z.name) >= 0;
                return '<label style="display:inline-flex;align-items:center;gap:4px;margin-right:8px;cursor:pointer"><input type="checkbox"' + (ck ? ' checked' : '') + ' onchange="EmailAlertsUI.toggleRecZone(' + idx + ',\'' + esc(z.name).replace(/'/g, "\\'") + '\',this.checked)"> ' + esc(z.name) + '</label>';
              }).join('')) +
        '</div>'
      : '';

    return '<div class="ea-rec' + (r.enabled ? '' : ' off') + '">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap">' +
        '<label style="display:inline-flex;align-items:center;gap:8px;cursor:pointer;font-size:13px;font-weight:800">' +
          '<input type="checkbox" style="width:15px;height:15px;accent-color:#10b981"' + (r.enabled ? ' checked' : '') + ' onchange="EmailAlertsUI.toggleRecEnabled(' + idx + ',this.checked)">' +
          '<i class="fa-solid fa-envelope" style="color:#0284c7"></i> ' + esc(r.email) +
          (r.label ? ' <span class="ea-sub" style="font-weight:600">(' + esc(r.label) + ')</span>' : '') +
        '</label>' +
        '<div style="display:flex;gap:5px;flex-wrap:wrap">' +
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

    var relayHtml = (S.showRelay || c.relayUrl)
      ? '<div class="ea-sec" style="border-color:rgba(2,132,199,.45)"><h4><i class="fa-solid fa-cloud-bolt"></i> Pont HTTPS Gmail (Port 443 — Requis sur Render Gratuit)</h4>' +
          '<div class="ea-sub" style="margin-bottom:8px">Render Gratuit bloque les ports SMTP 465/587. Pour envoyer depuis <b>komana.amana@gmail.com</b> via HTTPS (port 443, jamais bloqué) en 30 secondes :<br>' +
          '1) Ouvrez <a href="https://script.google.com/home/start" target="_blank" style="color:#0284c7;font-weight:700">script.google.com ↗</a> sur le compte Gmail → <b>Nouveau projet</b> → cliquez <button type="button" class="ea-btn" style="padding:2px 8px" onclick="EmailAlertsUI.copyScript()"><i class="fa-solid fa-copy"></i> Copier le code (6 lignes)</button> et collez-le.<br>' +
          '2) Cliquez <b>Déployer → Nouveau déploiement → Application Web</b> (Exécuter en tant que : <i>Moi</i>, Accès : <i>Tout le monde</i>) → collez l\'URL <code>https://script.google.com/macros/s/.../exec</code> ci-dessous :</div>' +
          '<div class="ea-f"><input id="eaRelayUrl" value="' + esc(c.relayUrl || '') + '" placeholder="https://script.google.com/macros/s/.../exec"></div>' +
        '</div>'
      : '<div style="text-align:right"><button type="button" class="ea-btn" style="font-size:10px;padding:4px 9px" onclick="EmailAlertsUI.toggleRelay()"><i class="fa-solid fa-cloud-bolt"></i> Option Pont HTTPS Render (Port 443)</button></div>';

    var bannerHtml = S.banner
      ? '<div class="ea-ban ' + S.banner.kind + '"><i class="fa-solid ' + (S.banner.kind === 'ok' ? 'fa-circle-check' : 'fa-triangle-exclamation') + '" style="margin-top:2px"></i><div>' + esc(S.banner.msg) + '</div></div>'
      : '';

    var logHtml = S.log.length ? '<div style="margin-top:4px;max-height:110px;overflow:auto;display:flex;flex-direction:column;gap:3px">' +
      S.log.slice(0, 6).map(function (l) {
        var dt = new Date(l.at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
        var toStr = Array.isArray(l.to) ? ' → ' + l.to.join(', ') : '';
        return '<div class="ea-sub">' + (l.ok ? '✅' : '❌') + ' <b>' + esc(dt) + '</b> — ' + esc(l.subject || '') + esc(toStr) +
          (l.error ? ' <span style="color:#ef4444">(' + esc(l.error) + ')</span>' : '') + '</div>';
      }).join('') + '</div>' : '';

    mount.innerHTML = '<div class="ea-card">' +
      '<div class="ea-head" onclick="EmailAlertsUI.toggleOpen()">' +
        '<span style="display:flex;align-items:center;gap:10px;font-weight:800;font-size:14px">' +
          '<span style="width:32px;height:32px;background:linear-gradient(135deg,#f59e0b,#ea580c);border-radius:9px;display:flex;align-items:center;justify-content:center;color:#fff"><i class="fa-solid fa-envelope-circle-check"></i></span>' +
          'Alertes &amp; Notifications par Email ' + statusPill +
        '</span>' +
        '<div style="display:flex;align-items:center;gap:10px" onclick="event.stopPropagation()">' +
          '<label style="display:flex;align-items:center;gap:6px;font-size:12px;font-weight:700;cursor:pointer">' +
            '<input type="checkbox" style="width:16px;height:16px;accent-color:#10b981"' + (c.enabled ? ' checked' : '') + ' onchange="EmailAlertsUI.setEnabled(this.checked)"> Activer' +
          '</label>' +
          '<button class="ea-btn" onclick="EmailAlertsUI.toggleOpen()"><i class="fa-solid fa-chevron-' + (S.open ? 'up' : 'down') + '"></i></button>' +
        '</div>' +
      '</div>' +
      (S.open ? '<div class="ea-body">' +
        '<div class="ea-sec"><h4><i class="fa-solid fa-users-gear"></i> 1. Destinataires &amp; Choix des Alertes par Email</h4>' +
          '<div style="display:flex;gap:8px;flex-wrap:wrap">' +
            '<input id="eaRecInput" placeholder="Adresse email (ex: atelier@douroub.dz)" style="flex:2;min-width:200px;padding:8px 12px;border-radius:8px;border:1px solid var(--ea-bd);background:var(--ea-card);color:var(--ea-tx);font-size:12px" onkeydown="if(event.key===\'Enter\'){event.preventDefault();EmailAlertsUI.addRec();}">' +
            '<input id="eaRecLabel" placeholder="Nom / Rôle optionnel (ex: Chef Atelier)" style="flex:1;min-width:150px;padding:8px 12px;border-radius:8px;border:1px solid var(--ea-bd);background:var(--ea-card);color:var(--ea-tx);font-size:12px" onkeydown="if(event.key===\'Enter\'){event.preventDefault();EmailAlertsUI.addRec();}">' +
            '<button type="button" class="ea-btn ok" onclick="EmailAlertsUI.addRec()"><i class="fa-solid fa-plus"></i> Ajouter</button>' +
          '</div>' + recsHtml +
        '</div>' +
        '<div class="ea-sec"><h4><i class="fa-solid fa-sliders"></i> 2. Seuils &amp; Anti-spam</h4>' +
          '<div class="ea-grid">' +
            '<div class="ea-f"><label>Limite vitesse Email (0 = limite générale)</label><input id="eaSpdLim" type="number" min="0" value="' + esc(c.speedLimitOverride) + '"></div>' +
            '<div class="ea-f"><label>Durée min. excès vitesse (minutes)</label><input id="eaSpdMin" type="number" min="1" value="' + esc(c.speedMinMinutes) + '"></div>' +
            '<div class="ea-f"><label>Délai anti-spam entre 2 mêmes alertes (min)</label><input id="eaCool" type="number" min="0" value="' + esc(c.cooldownMinutes) + '"></div>' +
          '</div>' +
        '</div>' +
        relayHtml + bannerHtml +
        '<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap">' +
          '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">' +
            '<button type="button" class="ea-btn ok"' + (S.testing ? ' disabled' : '') + ' onclick="EmailAlertsUI.sendTest(\'hello\')"><i class="fa-solid fa-paper-plane"></i> ' + (S.testing ? 'Envoi en cours…' : 'Tester ("Hello test")') + '</button>' +
            '<select onchange="EmailAlertsUI.setTestType(this.value)" style="padding:7px 10px;border-radius:8px;border:1px solid var(--ea-bd);background:var(--ea-card);color:var(--ea-tx);font-size:11px">' +
              '<option value="zone_enter"' + (S.testType === 'zone_enter' ? ' selected' : '') + '>Simulation : Arrivée Atelier</option>' +
              '<option value="zone_exit"' + (S.testType === 'zone_exit' ? ' selected' : '') + '>Simulation : Sortie Atelier</option>' +
              '<option value="speed"' + (S.testType === 'speed' ? ' selected' : '') + '>Simulation : Excès vitesse</option>' +
              '<option value="vidange_due"' + (S.testType === 'vidange_due' ? ' selected' : '') + '>Simulation : Échéance vidange</option>' +
            '</select>' +
            '<button type="button" class="ea-btn"' + (S.testing ? ' disabled' : '') + ' onclick="EmailAlertsUI.sendTest()"><i class="fa-solid fa-truck-fast"></i> Tester alerte camion</button>' +
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
    copyScript: copyScript,
    toggleRelay: function () { syncDomInputs(); S.showRelay = !S.showRelay; render(); },
    addRec: addRecipientsFromInput,
    removeRecipient: removeRecipient,
    toggleRecEnabled: toggleRecEnabled,
    toggleRecEvent: toggleRecEvent,
    setAllRec: setAllRecEvents,
    toggleRecZone: toggleRecZone,
    toggleOpen: function () { syncDomInputs(); S.open = !S.open; render(); },
    setEnabled: function (on) { syncDomInputs(); S.cfg.enabled = !!on; render(); },
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
