/* ═══════════════════════════════════════════════════════════════════════
 * EMAIL ALERTS UI v3 — Per-Recipient Event Subscriptions
 * Sender credentials are burned server-side (zero credentials in UI/DB).
 * Each added email chooses independently which alerts it receives.
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
    deliveryReady: true,
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
    if ($('eaUiCss')) return;
    var st = document.createElement('style');
    st.id = 'eaUiCss';
    st.textContent = [
      '.ea-card{border:1px solid rgba(245,158,11,.35);border-radius:14px;margin-bottom:14px;overflow:hidden;background:var(--bg-elevated,#1a2332)}',
      '.ea-head{cursor:pointer;display:flex;justify-content:space-between;align-items:center;padding:14px 18px;background:linear-gradient(90deg,rgba(245,158,11,.12) 0%,transparent 100%);gap:10px;flex-wrap:wrap}',
      '.ea-body{padding:16px 18px;border-top:1px solid var(--border,#334155);display:flex;flex-direction:column;gap:14px}',
      '.ea-sec{background:var(--bg-surface,#0f172a);border:1px solid var(--border,#334155);border-radius:12px;padding:14px}',
      '.ea-sec h4{margin:0 0 10px;font-size:12px;text-transform:uppercase;letter-spacing:.7px;color:#f59e0b;display:flex;align-items:center;gap:7px}',
      '.ea-rec{background:var(--bg-elevated,#1a2332);border:1px solid var(--border,#334155);border-left:4px solid #0ea5e9;border-radius:11px;padding:11px 13px;display:flex;flex-direction:column;gap:8px}',
      '.ea-rec.off{opacity:.55;border-left-color:#64748b}',
      '.ea-pills{display:flex;flex-wrap:wrap;gap:6px}',
      '.ea-pill{padding:5px 10px;border-radius:999px;border:1px solid var(--border,#334155);background:var(--bg-surface,#0f172a);color:var(--text-muted,#94a3b8);font-size:11px;font-weight:700;cursor:pointer;font-family:inherit;transition:.12s}',
      '.ea-pill.on{background:rgba(245,158,11,.18);border-color:#f59e0b;color:#fbbf24}',
      '.ea-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:10px}',
      '.ea-f label{display:block;font-size:11px;font-weight:700;color:var(--text-muted,#94a3b8);margin-bottom:4px}',
      '.ea-f input{width:100%;box-sizing:border-box;padding:8px 10px;border-radius:8px;border:1px solid var(--border,#334155);background:var(--bg-elevated,#1a2332);color:var(--text-primary,#e2e8f0);font-size:12px;font-family:inherit}',
      '.ea-btn{padding:7px 13px;border-radius:9px;border:1px solid var(--border,#334155);background:var(--bg-elevated,#1a2332);color:var(--text-primary,#e2e8f0);font-size:11px;font-weight:700;cursor:pointer;font-family:inherit;display:inline-flex;align-items:center;gap:6px}',
      '.ea-btn.pri{background:linear-gradient(135deg,#f59e0b,#d97706);border:none;color:#111;font-size:12px;padding:8px 16px}',
      '.ea-btn.ok{background:linear-gradient(135deg,#0ea5e9,#2563eb);border:none;color:#fff}',
      '.ea-btn.bad{border-color:rgba(248,113,113,.4);color:#f87171}',
      '.ea-btn[disabled]{opacity:.55;cursor:wait}',
      '.ea-sub{font-size:11px;color:var(--text-muted,#94a3b8);line-height:1.45}'
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
      S.deliveryReady = !!(res && res.deliveryReady);
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
    var invalid = [];
    tokens.forEach(function (em) {
      if (!EMAIL_RX.test(em)) invalid.push(em);
      else if (!S.cfg.recipients.some(function (r) { return r.email === em; })) {
        S.cfg.recipients.push(newRecObj(em, tokens.length === 1 ? label : ''));
      }
    });
    if (invalid.length) toast('Adresse(s) invalide(s) : ' + invalid.join(', '), 'warning');
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
      S.deliveryReady = !!(res && res.deliveryReady);
      if (!silent) toast('✅ Configuration Email enregistrée', 'success');
    } catch (e) { toast('Erreur sauvegarde : ' + e.message, 'error'); }
    S.saving = false; render();
  }

  async function sendTest(overrideType, singleEmail) {
    await save(true);
    var targets = singleEmail
      ? [singleEmail]
      : S.cfg.recipients.filter(function (r) { return r.enabled; }).map(function (r) { return r.email; });
    if (!targets.length) {
      toast('Ajoutez (et activez) au moins une adresse email destinataire.', 'warning');
      return;
    }
    var evType = overrideType || S.testType;
    S.testing = true; render();
    try {
      var res = await api('/api/email-alerts/test', 'POST', { eventType: evType, to: targets });
      if (res && res.log) S.log = res.log;
      toast(evType === 'hello'
        ? '✉️ "Hello test" envoyé à ' + targets.join(', ')
        : '📨 Simulation envoyée à ' + targets.join(', ') + ' (' + (res.truck || '') + ')', 'success');
    } catch (e) {
      toast('❌ Échec de l\'envoi : ' + e.message, 'error');
      await load();
    }
    S.testing = false; render();
  }

  function renderRecipientCard(r, idx, otherSites) {
    var ev = r.events || {};
    var pills = EVENT_DEFS.map(function (d) {
      var on = !!ev[d.key];
      return '<button type="button" class="ea-pill' + (on ? ' on' : '') + '" onclick="EmailAlertsUI.toggleRecEvent(' + idx + ',\'' + d.key + '\')">' +
        (on ? '✓ ' : '') + d.icon + ' ' + esc(d.label) + '</button>';
    }).join('');
    var siteChecks = otherSites.length ? '<div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center"><span class="ea-sub">Sites précis :</span>' +
      otherSites.map(function (z) {
        var ck = (r.customZoneNames || []).indexOf(z.name) >= 0;
        return '<label class="ea-sub" style="display:inline-flex;align-items:center;gap:4px;cursor:pointer"><input type="checkbox"' + (ck ? ' checked' : '') +
          ' onchange="EmailAlertsUI.toggleRecZone(' + idx + ',\'' + esc(z.name).replace(/'/g, "\\'") + '\',this.checked)"> ' + esc(z.name) + '</label>';
      }).join('') + '</div>' : '';
    return '<div class="ea-rec' + (r.enabled ? '' : ' off') + '">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap">' +
        '<label style="display:inline-flex;align-items:center;gap:8px;cursor:pointer;font-size:13px;font-weight:800;color:var(--text-primary,#e2e8f0)">' +
          '<input type="checkbox" style="width:15px;height:15px;accent-color:#22c55e"' + (r.enabled ? ' checked' : '') + ' onchange="EmailAlertsUI.toggleRecEnabled(' + idx + ',this.checked)">' +
          '<i class="fa-solid fa-envelope" style="color:#38bdf8"></i> ' + esc(r.email) +
          (r.label ? ' <span class="ea-sub" style="font-weight:600">(' + esc(r.label) + ')</span>' : '') +
        '</label>' +
        '<div style="display:flex;gap:5px;flex-wrap:wrap">' +
          '<button type="button" class="ea-btn ok" title="Envoyer Hello test uniquement à cette adresse" onclick="EmailAlertsUI.sendTest(\'hello\',\'' + esc(r.email) + '\')"><i class="fa-solid fa-paper-plane"></i> Hello test</button>' +
          '<button type="button" class="ea-btn" onclick="EmailAlertsUI.setAllRec(' + idx + ',true)">Tout</button>' +
          '<button type="button" class="ea-btn" onclick="EmailAlertsUI.setAllRec(' + idx + ',false)">Rien</button>' +
          '<button type="button" class="ea-btn bad" title="Supprimer" onclick="EmailAlertsUI.removeRecipient(' + idx + ')"><i class="fa-solid fa-trash"></i></button>' +
        '</div>' +
      '</div>' +
      '<div class="ea-pills">' + pills + '</div>' + siteChecks +
    '</div>';
  }

  function render() {
    var mount = $('emailAlertsSettingsMount');
    if (!mount) return;
    injectCss();
    var c = S.cfg;
    var activeCount = c.recipients.filter(function (r) { return r.enabled; }).length;
    var statusPill = !c.enabled
      ? '<span style="background:rgba(148,163,184,.18);color:#94a3b8;padding:3px 10px;border-radius:999px;font-size:11px;font-weight:700;">⚪ Désactivé</span>'
      : (activeCount > 0
          ? '<span style="background:rgba(34,197,94,.16);color:#4ade80;padding:3px 10px;border-radius:999px;font-size:11px;font-weight:700;">🟢 Actif · ' + activeCount + ' destinataire(s)</span>'
          : '<span style="background:rgba(245,158,11,.18);color:#fbbf24;padding:3px 10px;border-radius:999px;font-size:11px;font-weight:700;">⚠️ Ajoutez au moins 1 email</span>');

    var maintSites = S.zones.filter(function (z) { return z.type === 'maintenance'; });
    var otherSites = S.zones.filter(function (z) { return z.type !== 'maintenance'; });

    var recsHtml = c.recipients.length
      ? '<div style="display:flex;flex-direction:column;gap:9px;margin-top:12px">' +
          c.recipients.map(function (r, idx) { return renderRecipientCard(r, idx, otherSites); }).join('') +
        '</div>'
      : '<div class="ea-sub" style="margin-top:12px;padding:14px;text-align:center;border:1px dashed var(--border,#334155);border-radius:10px">Aucune adresse email configurée. Ajoutez une adresse ci-dessus puis choisissez les alertes qu\'elle doit recevoir.</div>';

    var logHtml = S.log.length ? '<div style="margin-top:8px;max-height:120px;overflow:auto;display:flex;flex-direction:column;gap:4px">' +
      S.log.slice(0, 8).map(function (l) {
        var dt = new Date(l.at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
        var toStr = Array.isArray(l.to) ? ' → ' + l.to.join(', ') : '';
        return '<div class="ea-sub">' + (l.ok ? '✅' : '❌') + ' <b>' + esc(dt) + '</b> — ' + esc(l.subject || '') + esc(toStr) +
          (l.error ? ' <span style="color:#f87171">(' + esc(l.error) + ')</span>' : '') + '</div>';
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
        '<div class="ea-sec"><h4><i class="fa-solid fa-users-gear"></i> 1. Destinataires &amp; Choix des Alertes par Email</h4>' +
          '<div class="ea-sub" style="margin-bottom:8px">Chaque adresse choisit indépendamment les notifications qu\'elle reçoit. Sites maintenance détectés : ' +
            (maintSites.length ? maintSites.map(function (z) { return '<b style="color:#fbbf24">' + esc(z.name) + '</b>'; }).join(' · ') : '<i>aucun site maintenance défini</i>') +
          '</div>' +
          '<div style="display:flex;gap:8px;flex-wrap:wrap">' +
            '<input id="eaRecInput" placeholder="Adresse email (ex: atelier@douroub.dz)" style="flex:2;min-width:200px;padding:8px 12px;border-radius:8px;border:1px solid var(--border,#334155);background:var(--bg-elevated,#1a2332);color:var(--text-primary,#e2e8f0);font-size:12px" onkeydown="if(event.key===\'Enter\'){event.preventDefault();EmailAlertsUI.addRec();}">' +
            '<input id="eaRecLabel" placeholder="Nom / Rôle optionnel (ex: Chef Atelier)" style="flex:1;min-width:150px;padding:8px 12px;border-radius:8px;border:1px solid var(--border,#334155);background:var(--bg-elevated,#1a2332);color:var(--text-primary,#e2e8f0);font-size:12px" onkeydown="if(event.key===\'Enter\'){event.preventDefault();EmailAlertsUI.addRec();}">' +
            '<button type="button" class="ea-btn ok" onclick="EmailAlertsUI.addRec()"><i class="fa-solid fa-plus"></i> Ajouter</button>' +
          '</div>' +
          recsHtml +
        '</div>' +
        '<div class="ea-sec"><h4><i class="fa-solid fa-sliders"></i> 2. Seuils &amp; Anti-spam</h4>' +
          '<div class="ea-grid">' +
            '<div class="ea-f"><label>Limite vitesse Email (0 = limite générale)</label><input id="eaSpdLim" type="number" min="0" value="' + esc(c.speedLimitOverride) + '"></div>' +
            '<div class="ea-f"><label>Durée min. excès vitesse (minutes)</label><input id="eaSpdMin" type="number" min="1" value="' + esc(c.speedMinMinutes) + '"></div>' +
            '<div class="ea-f"><label>Délai anti-spam entre 2 mêmes alertes (min)</label><input id="eaCool" type="number" min="0" value="' + esc(c.cooldownMinutes) + '"></div>' +
          '</div>' +
        '</div>' +
        '<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap">' +
          '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">' +
            '<button type="button" class="ea-btn ok"' + (S.testing ? ' disabled' : '') + ' onclick="EmailAlertsUI.sendTest(\'hello\')"><i class="fa-solid fa-paper-plane"></i> ' + (S.testing ? 'Envoi…' : 'Tester ("Hello test")') + '</button>' +
            '<select onchange="EmailAlertsUI.setTestType(this.value)" style="padding:7px 10px;border-radius:8px;border:1px solid var(--border,#334155);background:var(--bg-surface,#0f172a);color:var(--text-primary,#e2e8f0);font-size:11px">' +
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
