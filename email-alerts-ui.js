/* ═══════════════════════════════════════════════════════════════════════
 * EMAIL ALERTS UI — Configuration Système → Alertes & Notifications Email
 * Manages recipients, event triggers, site filters, SMTP/API credentials,
 * live test emails, and delivery history log.
 * ═══════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var EMAIL_RX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  var S = {
    open: true,
    loading: false,
    saving: false,
    testing: false,
    deliveryReady: false,
    envSmtpConfigured: false,
    zones: [],
    log: [],
    testType: 'zone_enter',
    clearPass: false,
    clearKey: false,
    cfg: {
      enabled: false,
      provider: 'smtp',
      smtp: { host: 'smtp.gmail.com', port: 587, secure: false, user: '', pass: '', fromEmail: '', fromName: 'Douroub El Djazair — Flotte GPS' },
      apiKey: '',
      fromEmail: '',
      fromName: 'Douroub El Djazair — Flotte GPS',
      hasSmtpPass: false,
      hasApiKey: false,
      recipients: [],
      events: {
        zone_maint_enter: true,
        zone_maint_exit: true,
        maint_auto_logged: false,
        zone_other_enter: false,
        zone_other_exit: false,
        speed: false,
        vidange_due: false
      },
      customZoneNames: [],
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
  function toast(m, t) { if (window.showToast) window.showToast(m, t || 'info'); else alert(m); }
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
    if (!r.ok) throw new Error((j && j.error) || ('HTTP ' + r.status));
    return j;
  }

  function injectCss() {
    if ($('eaUiCss')) return;
    var st = document.createElement('style');
    st.id = 'eaUiCss';
    st.textContent = [
      '.ea-card{border:1px solid rgba(245,158,11,.35);border-radius:14px;margin-bottom:14px;overflow:hidden;background:var(--bg-elevated,#1a2332)}',
      '.ea-head{cursor:pointer;display:flex;justify-content:space-between;align-items:center;padding:14px 18px;background:linear-gradient(90deg,rgba(245,158,11,.12) 0%,transparent 100%);gap:10px;flex-wrap:wrap}',
      '.ea-body{padding:16px 18px;border-top:1px solid var(--border,#334155);display:flex;flex-direction:column;gap:16px}',
      '.ea-sec{background:var(--bg-surface,#0f172a);border:1px solid var(--border,#334155);border-radius:12px;padding:14px}',
      '.ea-sec h4{margin:0 0 10px;font-size:12px;text-transform:uppercase;letter-spacing:.7px;color:#f59e0b;display:flex;align-items:center;gap:7px}',
      '.ea-chips{display:flex;flex-wrap:wrap;gap:7px;margin-top:10px}',
      '.ea-chip{display:inline-flex;align-items:center;gap:7px;padding:5px 11px;border-radius:999px;background:rgba(14,165,233,.14);border:1px solid rgba(14,165,233,.35);color:var(--text-primary,#e2e8f0);font-size:12px;font-weight:600}',
      '.ea-chip button{border:none;background:none;color:#f87171;cursor:pointer;font-size:14px;line-height:1;padding:0}',
      '.ea-evgrid{display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:9px}',
      '.ea-ev{display:flex;align-items:flex-start;gap:10px;padding:10px 12px;border-radius:10px;border:1px solid var(--border,#334155);background:var(--bg-elevated,#1a2332);cursor:pointer}',
      '.ea-ev.on{border-color:rgba(245,158,11,.55);background:rgba(245,158,11,.07)}',
      '.ea-ev input{margin-top:3px;accent-color:#f59e0b;width:16px;height:16px}',
      '.ea-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:10px}',
      '.ea-f label{display:block;font-size:11px;font-weight:700;color:var(--text-muted,#94a3b8);margin-bottom:4px}',
      '.ea-f input,.ea-f select{width:100%;box-sizing:border-box;padding:8px 10px;border-radius:8px;border:1px solid var(--border,#334155);background:var(--bg-elevated,#1a2332);color:var(--text-primary,#e2e8f0);font-size:12px;font-family:inherit}',
      '.ea-btn{padding:8px 15px;border-radius:9px;border:1px solid var(--border,#334155);background:var(--bg-elevated,#1a2332);color:var(--text-primary,#e2e8f0);font-size:12px;font-weight:700;cursor:pointer;font-family:inherit;display:inline-flex;align-items:center;gap:6px}',
      '.ea-btn.pri{background:linear-gradient(135deg,#f59e0b,#d97706);border:none;color:#111}',
      '.ea-btn.ok{background:linear-gradient(135deg,#0ea5e9,#2563eb);border:none;color:#fff}',
      '.ea-btn[disabled]{opacity:.55;cursor:wait}',
      '.ea-sub{font-size:11px;color:var(--text-muted,#94a3b8);line-height:1.45}'
    ].join('\n');
    document.head.appendChild(st);
  }

  async function load() {
    if (S.loading) return;
    S.loading = true;
    render();
    try {
      var res = await api('/api/email-alerts/config', 'GET');
      if (res && res.config) S.cfg = Object.assign(S.cfg, res.config);
      S.deliveryReady = !!(res && res.deliveryReady);
      S.envSmtpConfigured = !!(res && res.envSmtpConfigured);
      S.zones = (res && res.zones) || [];
      S.log = (res && res.log) || [];
      S.clearPass = false;
      S.clearKey = false;
    } catch (e) {
      console.warn('[EmailAlertsUI] load error:', e.message);
    }
    S.loading = false;
    render();
  }

  function syncDomInputs() {
    var c = S.cfg;
    if ($('eaProv')) c.provider = $('eaProv').value;
    if ($('eaHost')) c.smtp.host = $('eaHost').value.trim();
    if ($('eaPort')) c.smtp.port = Number($('eaPort').value) || 587;
    if ($('eaUser')) c.smtp.user = $('eaUser').value.trim();
    if ($('eaPass') && $('eaPass').value) { c.smtp.pass = $('eaPass').value; S.clearPass = false; }
    if ($('eaFromName')) { c.smtp.fromName = $('eaFromName').value.trim(); c.fromName = c.smtp.fromName; }
    if ($('eaFromEmail')) { c.fromEmail = $('eaFromEmail').value.trim(); c.smtp.fromEmail = c.fromEmail; }
    if ($('eaApiKey') && $('eaApiKey').value) { c.apiKey = $('eaApiKey').value.trim(); S.clearKey = false; }
    if ($('eaSpdLim')) c.speedLimitOverride = Math.max(0, Number($('eaSpdLim').value) || 0);
    if ($('eaSpdMin')) c.speedMinMinutes = Math.max(1, Number($('eaSpdMin').value) || 2);
    if ($('eaCool')) c.cooldownMinutes = Math.max(0, Number($('eaCool').value) >= 0 ? Number($('eaCool').value) : 15);
  }

  function addRecipientsFromInput() {
    syncDomInputs();
    var inp = $('eaRecInput');
    if (!inp) return;
    var raw = inp.value || '';
    var tokens = raw.split(/[,;\s]+/).map(function (x) { return x.trim().toLowerCase(); }).filter(Boolean);
    if (!tokens.length) return;
    var invalid = [];
    tokens.forEach(function (em) {
      if (!EMAIL_RX.test(em)) invalid.push(em);
      else if (S.cfg.recipients.indexOf(em) < 0) S.cfg.recipients.push(em);
    });
    if (invalid.length) toast('Adresse(s) invalide(s) : ' + invalid.join(', '), 'warning');
    inp.value = '';
    render();
  }

  function removeRecipient(idx) {
    syncDomInputs();
    S.cfg.recipients.splice(idx, 1);
    render();
  }

  function toggleEvent(key, checked) {
    syncDomInputs();
    S.cfg.events[key] = !!checked;
    render();
  }

  function toggleZone(name, checked) {
    syncDomInputs();
    var arr = S.cfg.customZoneNames || [];
    var idx = arr.indexOf(name);
    if (checked && idx < 0) arr.push(name);
    if (!checked && idx >= 0) arr.splice(idx, 1);
    S.cfg.customZoneNames = arr;
    render();
  }

  async function save(silent) {
    syncDomInputs();
    // Also grab any un-added email typed in the input box!
    if ($('eaRecInput') && $('eaRecInput').value.trim()) addRecipientsFromInput();
    S.saving = true;
    render();
    try {
      var payload = JSON.parse(JSON.stringify(S.cfg));
      if (!payload.smtp.pass && S.cfg.hasSmtpPass && !S.clearPass) payload.smtp.pass = '__KEEP__';
      if (!payload.apiKey && S.cfg.hasApiKey && !S.clearKey) payload.apiKey = '__KEEP__';
      payload.clearSmtpPass = S.clearPass;
      payload.clearApiKey = S.clearKey;

      var res = await api('/api/email-alerts/config', 'POST', payload);
      if (res && res.config) S.cfg = Object.assign(S.cfg, res.config);
      S.deliveryReady = !!(res && res.deliveryReady);
      S.clearPass = false;
      S.clearKey = false;
      if (!silent) toast('✅ Configuration des alertes Email enregistrée', 'success');
    } catch (e) {
      toast('Erreur sauvegarde : ' + e.message, 'error');
    }
    S.saving = false;
    render();
  }

  async function sendTest(overrideType) {
    await save(true);
    if (!S.cfg.recipients.length) {
      toast('Ajoutez au moins une adresse email destinataire avant de tester.', 'warning');
      return;
    }
    var evType = overrideType || S.testType;
    S.testing = true;
    render();
    try {
      var res = await api('/api/email-alerts/test', 'POST', { eventType: evType, to: S.cfg.recipients });
      if (res && res.log) S.log = res.log;
      toast(evType === 'hello'
        ? '✉️ "Hello test" envoyé à ' + S.cfg.recipients.join(', ')
        : '📨 Email de test envoyé à ' + S.cfg.recipients.join(', ') + ' (camion : ' + (res.truck || '') + ')', 'success');
    } catch (e) {
      toast('❌ Échec de l\'envoi test : ' + e.message, 'error');
      await load();
    }
    S.testing = false;
    render();
  }

  function presetGmail() {
    syncDomInputs();
    S.cfg.provider = 'smtp';
    S.cfg.smtp.host = 'smtp.gmail.com';
    S.cfg.smtp.port = 587;
    S.cfg.smtp.secure = false;
    render();
  }

  function evBox(key, icon, title, desc) {
    var on = !!S.cfg.events[key];
    return '<label class="ea-ev' + (on ? ' on' : '') + '">' +
      '<input type="checkbox"' + (on ? ' checked' : '') + ' onchange="EmailAlertsUI.toggleEvent(\'' + key + '\',this.checked)">' +
      '<div><div style="font-size:13px;font-weight:700;color:var(--text-primary,#e2e8f0)">' + icon + ' ' + esc(title) + '</div>' +
      '<div class="ea-sub">' + esc(desc) + '</div></div></label>';
  }

  function render() {
    var mount = $('emailAlertsSettingsMount');
    if (!mount) return;
    injectCss();
    var c = S.cfg;
    var statusPill = !c.enabled
      ? '<span style="background:rgba(148,163,184,.18);color:#94a3b8;padding:3px 10px;border-radius:999px;font-size:11px;font-weight:700;">⚪ Désactivé</span>'
      : (S.deliveryReady && c.recipients.length
          ? '<span style="background:rgba(34,197,94,.16);color:#4ade80;padding:3px 10px;border-radius:999px;font-size:11px;font-weight:700;">🟢 Actif · ' + c.recipients.length + ' email(s)</span>'
          : '<span style="background:rgba(245,158,11,.18);color:#fbbf24;padding:3px 10px;border-radius:999px;font-size:11px;font-weight:700;">⚠️ À compléter (destinataire / serveur)</span>');

    var chips = c.recipients.length
      ? c.recipients.map(function (em, i) {
          return '<span class="ea-chip"><i class="fa-solid fa-envelope" style="color:#38bdf8"></i> ' + esc(em) +
            ' <button type="button" title="Retirer" onclick="EmailAlertsUI.removeRecipient(' + i + ')">&times;</button></span>';
        }).join('')
      : '<span class="ea-sub">Aucune adresse email ajoutée pour le moment.</span>';

    var maintSites = S.zones.filter(function (z) { return z.type === 'maintenance'; });
    var otherSites = S.zones.filter(function (z) { return z.type !== 'maintenance'; });

    var provHtml = '';
    if (c.provider === 'smtp') {
      provHtml = '<div class="ea-grid" style="margin-top:10px">' +
        '<div class="ea-f"><label>Serveur SMTP</label><input id="eaHost" value="' + esc(c.smtp.host) + '" placeholder="smtp.gmail.com"></div>' +
        '<div class="ea-f"><label>Port SMTP</label><input id="eaPort" type="number" value="' + esc(c.smtp.port) + '"></div>' +
        '<div class="ea-f"><label>Email expéditeur (compte SMTP)</label><input id="eaUser" value="' + esc(c.smtp.user) + '" placeholder="flotte@gmail.com"></div>' +
        '<div class="ea-f"><label>Mot de passe d\'application ' + (c.hasSmtpPass ? '<span style="color:#4ade80">✓ enregistré</span>' : '') + '</label>' +
          '<input id="eaPass" type="password" value="' + esc(c.smtp.pass) + '" placeholder="' + (c.hasSmtpPass ? '•••••••• (laisser vide pour garder)' : '16 caractères Gmail App Password') + '"></div>' +
        '<div class="ea-f"><label>Nom affiché</label><input id="eaFromName" value="' + esc(c.smtp.fromName || c.fromName) + '"></div>' +
        '</div>' +
        '<div class="ea-sub" style="margin-top:8px">💡 <b>Astuce Gmail :</b> utilisez un <i>Mot de passe d\'application</i> (Compte Google → Sécurité → Validation en 2 étapes → Mots de passe des applications).' +
        (S.envSmtpConfigured ? ' <span style="color:#4ade80">✓ Variables serveur SMTP_* déjà détectées en secours.</span>' : '') + '</div>';
    } else {
      provHtml = '<div class="ea-grid" style="margin-top:10px">' +
        '<div class="ea-f"><label>Clé API ' + esc(c.provider.toUpperCase()) + ' ' + (c.hasApiKey ? '<span style="color:#4ade80">✓ enregistrée</span>' : '') + '</label>' +
          '<input id="eaApiKey" type="password" value="' + esc(c.apiKey) + '" placeholder="' + (c.hasApiKey ? '•••••••• (laisser vide pour garder)' : 'Coller la clé API HTTPS...') + '"></div>' +
        '<div class="ea-f"><label>Email expéditeur vérifié</label><input id="eaFromEmail" value="' + esc(c.fromEmail || c.smtp.user) + '" placeholder="alerte@votredomaine.com"></div>' +
        '<div class="ea-f"><label>Nom affiché</label><input id="eaFromName" value="' + esc(c.fromName) + '"></div></div>' +
        '<div class="ea-sub" style="margin-top:8px">💡 L\'envoi par API HTTPS (port 443) contourne tout blocage de port SMTP sur les hébergeurs cloud (Render, etc.).</div>';
    }

    var logHtml = S.log.length ? '<div style="margin-top:10px;max-height:130px;overflow:auto;display:flex;flex-direction:column;gap:4px">' +
      S.log.slice(0, 8).map(function (l) {
        var dt = new Date(l.at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
        return '<div class="ea-sub" style="display:flex;justify-content:space-between;gap:8px">' +
          '<span>' + (l.ok ? '✅' : '❌') + ' <b>' + esc(dt) + '</b> — ' + esc(l.subject || '') + (l.error ? ' <span style="color:#f87171">(' + esc(l.error) + ')</span>' : '') + '</span>' +
          '<span>' + esc(l.provider || '') + '</span></div>';
      }).join('') + '</div>' : '';

    mount.innerHTML = '<div class="ea-card">' +
      '<div class="ea-head" onclick="EmailAlertsUI.toggleOpen()">' +
        '<span style="display:flex;align-items:center;gap:10px;font-weight:800;font-size:14px">' +
          '<span style="width:32px;height:32px;background:linear-gradient(135deg,#f59e0b,#ea580c);border-radius:9px;display:flex;align-items:center;justify-content:center;color:#fff"><i class="fa-solid fa-envelope-circle-check"></i></span>' +
          'Alertes &amp; Notifications par Email ' + statusPill +
        '</span>' +
        '<div style="display:flex;align-items:center;gap:10px" onclick="event.stopPropagation()">' +
          '<label style="display:flex;align-items:center;gap:6px;font-size:12px;font-weight:700;cursor:pointer">' +
            '<input type="checkbox" style="width:16px;height:16px;accent-color:#22c55e"' + (c.enabled ? ' checked' : '') + ' onchange="EmailAlertsUI.setEnabled(this.checked)"> Activer' +
          '</label>' +
          '<button class="ea-btn" onclick="EmailAlertsUI.toggleOpen()"><i class="fa-solid fa-chevron-' + (S.open ? 'up' : 'down') + '"></i></button>' +
        '</div>' +
      '</div>' +
      (S.open ? '<div class="ea-body">' +
        '<div class="ea-sec"><h4><i class="fa-solid fa-at"></i> 1. Destinataires Email</h4>' +
          '<div style="display:flex;gap:8px;flex-wrap:wrap">' +
            '<input id="eaRecInput" placeholder="Ajouter un ou plusieurs emails (ex: atelier@douroub.dz, direction@...)" style="flex:1;min-width:220px;padding:8px 12px;border-radius:8px;border:1px solid var(--border,#334155);background:var(--bg-elevated,#1a2332);color:var(--text-primary,#e2e8f0);font-size:12px" onkeydown="if(event.key===\'Enter\'){event.preventDefault();EmailAlertsUI.addRec();}">' +
            '<button type="button" class="ea-btn ok" onclick="EmailAlertsUI.addRec()"><i class="fa-solid fa-plus"></i> Ajouter</button>' +
          '</div>' +
          '<div class="ea-chips">' + chips + '</div>' +
        '</div>' +
        '<div class="ea-sec"><h4><i class="fa-solid fa-bell"></i> 2. Que voulez-vous recevoir par Email ?</h4>' +
          '<div class="ea-evgrid">' +
            evBox('zone_maint_enter', '🛠️', 'Arrivée en Zone Maintenance / Atelier', 'Email complet (tracteur, IMM, châssis, remorque, chauffeur) dès l\'entrée au site maintenance') +
            evBox('zone_maint_exit', '🚪', 'Sortie de Zone Maintenance / Atelier', 'Email à la sortie de l\'atelier avec la durée exacte passée sur place') +
            evBox('maint_auto_logged', '🔧', 'Vidange / Maintenance Auto-détectée (≥ 60 min)', 'Email quand le système enregistre automatiquement une intervention') +
            evBox('speed', '🚨', 'Excès de Vitesse', 'Email lorsqu\'un camion dépasse la vitesse limite autorisée') +
            evBox('vidange_due', '🛢️', 'Échéance Vidange Atteinte', 'Email lorsqu\'un camion entre en alerte vidange urgente') +
            evBox('zone_other_enter', '📍', 'Arrivée Autres Sites (Clients / Base)', 'Email à l\'arrivée sur un site client ou base Douroub') +
            evBox('zone_other_exit', '🏁', 'Sortie Autres Sites (Clients / Base)', 'Email au départ d\'un site client ou base Douroub') +
          '</div>' +
          '<div class="ea-sub" style="margin-top:10px"><b>Sites Maintenance actifs automatiquement :</b> ' +
            (maintSites.length ? maintSites.map(function (z) { return '<span style="color:#fbbf24;font-weight:700">' + esc(z.name) + '</span>'; }).join(' · ') : '<i>Aucun site de type "maintenance" défini dans Sites & Clients</i>') +
          '</div>' +
          (otherSites.length ? '<div style="margin-top:8px"><div class="ea-sub" style="margin-bottom:4px"><b>Surveiller aussi des sites spécifiques :</b></div><div style="display:flex;gap:10px;flex-wrap:wrap">' +
            otherSites.map(function (z) {
              var ck = (c.customZoneNames || []).indexOf(z.name) >= 0;
              return '<label class="ea-sub" style="display:inline-flex;align-items:center;gap:5px;cursor:pointer"><input type="checkbox"' + (ck ? ' checked' : '') + ' onchange="EmailAlertsUI.toggleZone(\'' + esc(z.name).replace(/'/g, "\\'") + '\',this.checked)"> ' + esc(z.name) + ' (' + esc(z.type) + ')</label>';
            }).join('') + '</div></div>' : '') +
          '<div class="ea-grid" style="margin-top:12px">' +
            '<div class="ea-f"><label>Limite vitesse Email (0 = limite générale)</label><input id="eaSpdLim" type="number" min="0" value="' + esc(c.speedLimitOverride) + '"></div>' +
            '<div class="ea-f"><label>Durée min. excès vitesse (minutes)</label><input id="eaSpdMin" type="number" min="1" value="' + esc(c.speedMinMinutes) + '"></div>' +
            '<div class="ea-f"><label>Anti-spam entre 2 mêmes alertes (min)</label><input id="eaCool" type="number" min="0" value="' + esc(c.cooldownMinutes) + '"></div>' +
          '</div>' +
        '</div>' +
        '<div class="ea-sec"><h4><i class="fa-solid fa-server"></i> 3. Serveur d\'Envoi (Gmail / SMTP ou API Cloud)</h4>' +
          '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">' +
            '<select id="eaProv" onchange="EmailAlertsUI.changeProv(this.value)" style="padding:8px 12px;border-radius:8px;border:1px solid var(--border,#334155);background:var(--bg-elevated,#1a2332);color:var(--text-primary,#e2e8f0);font-size:12px;font-weight:700">' +
              '<option value="smtp"' + (c.provider === 'smtp' ? ' selected' : '') + '>Gmail / Serveur SMTP</option>' +
              '<option value="brevo"' + (c.provider === 'brevo' ? ' selected' : '') + '>Brevo API (HTTPS — idéal sur Render)</option>' +
              '<option value="resend"' + (c.provider === 'resend' ? ' selected' : '') + '>Resend API (HTTPS)</option>' +
            '</select>' +
            (c.provider === 'smtp' ? '<button type="button" class="ea-btn" onclick="EmailAlertsUI.presetGmail()"><i class="fa-brands fa-google"></i> Pré-remplir Gmail</button>' : '') +
          '</div>' + provHtml +
        '</div>' +
        '<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap">' +
          '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">' +
            '<button type="button" class="ea-btn ok"' + (S.testing ? ' disabled' : '') + ' onclick="EmailAlertsUI.sendTest(\'hello\')"><i class="fa-solid fa-paper-plane"></i> ' + (S.testing ? 'Envoi…' : 'Tester ("Hello test")') + '</button>' +
            '<select onchange="EmailAlertsUI.setTestType(this.value)" style="padding:8px 10px;border-radius:8px;border:1px solid var(--border,#334155);background:var(--bg-surface,#0f172a);color:var(--text-primary,#e2e8f0);font-size:12px">' +
              '<option value="zone_enter"' + (S.testType === 'zone_enter' ? ' selected' : '') + '>Simulation : Arrivée site maintenance</option>' +
              '<option value="zone_exit"' + (S.testType === 'zone_exit' ? ' selected' : '') + '>Simulation : Sortie site maintenance</option>' +
              '<option value="speed"' + (S.testType === 'speed' ? ' selected' : '') + '>Simulation : Excès de vitesse</option>' +
              '<option value="vidange_due"' + (S.testType === 'vidange_due' ? ' selected' : '') + '>Simulation : Échéance vidange</option>' +
            '</select>' +
            '<button type="button" class="ea-btn"' + (S.testing ? ' disabled' : '') + ' onclick="EmailAlertsUI.sendTest()"><i class="fa-solid fa-truck-fast"></i> Tester alerte camion</button>' +
          '</div>' +
          '<button type="button" class="ea-btn pri"' + (S.saving ? ' disabled' : '') + ' onclick="EmailAlertsUI.save()"><i class="fa-solid fa-floppy-disk"></i> ' + (S.saving ? 'Enregistrement…' : 'Enregistrer la configuration Email') + '</button>' +
        '</div>' + logHtml +
      '</div>' : '') +
    '</div>';
  }

  window.EmailAlertsUI = {
    load: load,
    save: function () { return save(false); },
    sendTest: sendTest,
    presetGmail: presetGmail,
    addRec: addRecipientsFromInput,
    removeRecipient: removeRecipient,
    toggleEvent: toggleEvent,
    toggleZone: toggleZone,
    toggleOpen: function () { syncDomInputs(); S.open = !S.open; render(); },
    setEnabled: function (on) { syncDomInputs(); S.cfg.enabled = !!on; render(); },
    changeProv: function (v) { syncDomInputs(); S.cfg.provider = v; render(); },
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
