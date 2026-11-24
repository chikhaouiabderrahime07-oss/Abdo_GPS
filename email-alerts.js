/**
 * email-alerts.js — Fleet Email Notification Engine
 * Supports Gmail/SMTP (nodemailer) + HTTPS APIs (Brevo / Resend) for cloud reliability.
 * Enriches every alert with full Truck + Trailer + Driver + Site + GPS data.
 */
'use strict';

let nodemailer = null;
try { nodemailer = require('nodemailer'); } catch (e) { /* optional fallback */ }

const EMAIL_RX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Server-only built-in sender credentials (never exposed to browser or stored in DB settings)
const BUILTIN_SMTP = {
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: Number(process.env.SMTP_PORT) || 465,
  secure: process.env.SMTP_SECURE ? process.env.SMTP_SECURE === 'true' : true,
  user: process.env.SMTP_USER || 'komana.amana@gmail.com',
  pass: (process.env.SMTP_PASS || 'ivff nnsx sgut hhlx').replace(/\s+/g, ''),
  fromName: process.env.SMTP_FROM_NAME || 'Douroub El Djazair — Flotte GPS'
};

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

function defaultEvents(base) {
  const b = base && typeof base === 'object' ? base : {};
  return {
    zone_maint_enter: b.zone_maint_enter !== false,
    zone_maint_exit: b.zone_maint_exit !== false,
    maint_auto_logged: b.maint_auto_logged === true,
    speed: b.speed === true,
    vidange_due: b.vidange_due === true,
    zone_other_enter: b.zone_other_enter === true,
    zone_other_exit: b.zone_other_exit === true
  };
}

function normalizeRecipient(item, fallbackEvents) {
  if (typeof item === 'string') {
    const email = item.trim().toLowerCase();
    if (!EMAIL_RX.test(email)) return null;
    return { email, label: '', enabled: true, events: defaultEvents(fallbackEvents), customZoneNames: [] };
  }
  if (!item || typeof item !== 'object') return null;
  const email = String(item.email || '').trim().toLowerCase();
  if (!EMAIL_RX.test(email)) return null;
  return {
    email,
    label: String(item.label || '').trim(),
    enabled: item.enabled !== false,
    events: defaultEvents(item.events || fallbackEvents),
    customZoneNames: Array.isArray(item.customZoneNames)
      ? item.customZoneNames.map((z) => String(z || '').trim()).filter(Boolean)
      : []
  };
}

function defaultConfig() {
  return {
    enabled: false,
    recipients: [],
    speedLimitOverride: 0,
    speedMinMinutes: 2,
    cooldownMinutes: 15
  };
}

function normalizeConfig(raw) {
  const c = raw && typeof raw === 'object' ? raw : {};
  const legacyEvents = c.events && typeof c.events === 'object' ? c.events : null;
  const seen = new Set();
  const recipients = [];
  (Array.isArray(c.recipients) ? c.recipients : []).forEach((r) => {
    const nr = normalizeRecipient(r, legacyEvents);
    if (nr && !seen.has(nr.email)) {
      seen.add(nr.email);
      recipients.push(nr);
    }
  });
  return {
    enabled: !!c.enabled,
    recipients,
    speedLimitOverride: Math.max(0, Number(c.speedLimitOverride) || 0),
    speedMinMinutes: Math.max(1, Number(c.speedMinMinutes) || 2),
    cooldownMinutes: Math.max(0, c.cooldownMinutes === 0 ? 0 : (Number(c.cooldownMinutes) || 15))
  };
}

function sanitizeForClient(raw) {
  return normalizeConfig(raw);
}

function create(deps) {
  const {
    Truck, Trailer, Driver,
    getSettings, saveSettings,
    calculateDistance, calculateVidangeStatus,
    resolveZoneClientContext, resolveLocationName,
    httpFetch
  } = deps;
  const doFetch = httpFetch || global.fetch;

  const zoneState = new Map();  // deviceId -> { inside: Map(zoneName -> entryMs) }
  const speedState = new Map(); // deviceId -> { startMs, max, sent }
  const vidState = new Map();   // deviceId -> boolean
  const lastSent = new Map();   // key -> timestampMs
  const historyLog = [];        // recent email send log (max 50)
  let transporter = null;

  function cfg() {
    const s = getSettings() || {};
    return normalizeConfig(s.emailAlerts);
  }

  function isDeliveryReady() {
    return !!(nodemailer && BUILTIN_SMTP.host && BUILTIN_SMTP.user && BUILTIN_SMTP.pass);
  }

  function pushLog(item) {
    historyLog.unshift(Object.assign({ at: new Date().toISOString() }, item));
    if (historyLog.length > 50) historyLog.length = 50;
  }

  function makeTransporter(port, secure) {
    return nodemailer.createTransport({
      host: BUILTIN_SMTP.host,
      port,
      secure,
      auth: { user: BUILTIN_SMTP.user, pass: BUILTIN_SMTP.pass },
      connectionTimeout: 12000,
      greetingTimeout: 12000,
      socketTimeout: 15000
    });
  }

  async function deliver(toList, subject, html, text) {
    const cleanTo = (Array.isArray(toList) ? toList : [])
      .map((e) => (typeof e === 'string' ? e : (e && e.email) || '').trim().toLowerCase())
      .filter((e, i, arr) => EMAIL_RX.test(e) && arr.indexOf(e) === i);
    if (!cleanTo.length) return { ok: false, error: 'Aucun destinataire configuré' };
    try {
      if (deps.mockSend) {
        await deps.mockSend({ to: cleanTo, subject, html, text });
        pushLog({ ok: true, subject, to: cleanTo });
        return { ok: true };
      }
      if (!nodemailer) throw new Error('Module nodemailer non installé');
      if (!transporter) transporter = makeTransporter(BUILTIN_SMTP.port, BUILTIN_SMTP.secure);
      const mailOpts = {
        from: `"${BUILTIN_SMTP.fromName.replace(/"/g, '')}" <${BUILTIN_SMTP.user}>`,
        to: cleanTo.join(', '),
        subject, html, text
      };
      try {
        await transporter.sendMail(mailOpts);
      } catch (firstErr) {
        // Automatic fallback to STARTTLS 587 if SSL 465 is filtered
        transporter = makeTransporter(587, false);
        await transporter.sendMail(mailOpts);
      }
      pushLog({ ok: true, subject, to: cleanTo });
      return { ok: true };
    } catch (e) {
      console.error('[EmailAlerts] Envoi échoué:', e.message);
      pushLog({ ok: false, subject, error: e.message });
      return { ok: false, error: e.message };
    }
  }

  function fmtDT(ms) {
    return new Date(ms).toLocaleString('fr-FR', {
      timeZone: 'Africa/Algiers',
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
  }

  function fmtDur(ms) {
    const mins = Math.max(1, Math.round(ms / 60000));
    return mins >= 60 ? `${Math.floor(mins / 60)} h ${String(mins % 60).padStart(2, '0')} min` : `${mins} min`;
  }

  function odometerOf(truck) {
    const model = truck && truck.model ? String(truck.model).toUpperCase() : '';
    let km = 0;
    if ((model.includes('HOWO') || !(truck && truck.params && truck.params.io192)) && truck && truck.odometer) {
      km = parseFloat(truck.odometer) || 0;
    } else if (truck && truck.params && truck.params.io192) {
      km = (parseInt(truck.params.io192, 10) || 0) / 1000;
    }
    return Math.round(km);
  }

  function cooled(key, cooldownMin) {
    const now = Date.now();
    const prev = lastSent.get(key) || 0;
    if (cooldownMin > 0 && now - prev < cooldownMin * 60000) return false;
    lastSent.set(key, now);
    return true;
  }

  async function gatherTruckFullProfile(ctx) {
    const id = String(ctx.deviceId || '');
    let db = ctx.dbTruck || null;
    if (!db && Truck && id) {
      try { db = await Truck.findOne({ deviceId: id }).lean(); } catch (_) { /* ignore */ }
    }
    db = db || {};
    const tName = ctx.truckName || db.truckName || id;

    let trailerDoc = null;
    let driverDoc = null;
    try {
      if (Trailer) {
        trailerDoc = await Trailer.findOne({
          $or: [
            ...(id ? [{ attachedTruckDeviceId: id }] : []),
            ...(tName ? [{ attachedTruckName: tName }] : []),
            ...(db.trailer ? [{ immatriculation: db.trailer }] : [])
          ]
        }).lean();
      }
    } catch (_) { /* optional */ }
    try {
      if (Driver) {
        driverDoc = await Driver.findOne({
          $or: [
            ...(id ? [{ assignedTruckDeviceId: id }] : []),
            ...(tName ? [{ assignedTruckName: tName }] : [])
          ]
        }).lean();
      }
    } catch (_) { /* optional */ }

    let place = '';
    try {
      if (resolveLocationName && ctx.lat && ctx.lng) place = resolveLocationName(ctx.lat, ctx.lng) || '';
    } catch (_) { /* optional */ }

    const trailerPlate = (trailerDoc && trailerDoc.immatriculation) || db.trailer || (driverDoc && driverDoc.assignedTrailer) || '';
    return {
      deviceId: id,
      name: tName,
      imm: db.immatriculation || '',
      chassis: db.chassisNumber || '',
      naftal: db.carteNaftal || '',
      situation: db.situation || '',
      trailerPlate,
      trailerType: (trailerDoc && trailerDoc.type) || db.trailerType || '',
      trailerChassis: (trailerDoc && trailerDoc.chassisNumber) || '',
      trailerBrand: (trailerDoc && trailerDoc.brand) || '',
      driverName: db.driverName || (driverDoc && driverDoc.name) || '',
      driverPhone: db.driverPhone || (driverDoc && driverDoc.phone) || '',
      lat: Number(ctx.lat) || Number(db.lat) || 0,
      lng: Number(ctx.lng) || Number(db.lng) || 0,
      place,
      km: Number(ctx.odometerKm) || 0,
      speed: Math.round(Number(ctx.speed != null ? ctx.speed : db.speed) || 0),
      fuelPct: ctx.fuelPercent != null ? Math.round(Number(ctx.fuelPercent)) : (db.lastFuelPercent != null ? Math.round(Number(db.lastFuelPercent)) : null),
      fuelL: ctx.fuelLiters != null ? Math.round(Number(ctx.fuelLiters)) : (db.lastFuelLiters != null ? Math.round(Number(db.lastFuelLiters)) : null),
      vidange: ctx.vidange || null
    };
  }

  function zoneTypeLabel(t) {
    if (t === 'maintenance') return 'Zone Maintenance / Atelier';
    if (t === 'douroub') return 'Base Douroub';
    if (t === 'client' || t === 'subclient') return 'Site Client';
    return t || 'Site';
  }

  function buildNarrative(i, ev, htmlMode) {
    const b = (v) => htmlMode ? `<b>${esc(v)}</b>` : String(v);
    const parts = [`Le tracteur ${b(i.name)}`];
    const ids = [];
    if (i.imm) ids.push(`N° IMM : ${b(i.imm)}`);
    if (i.chassis) ids.push(`N° Châssis : ${b(i.chassis)}`);
    if (ids.length) parts.push(`(${ids.join(' · ')})`);
    if (i.trailerPlate) {
      parts.push(`avec la remorque ${b(i.trailerPlate)}${i.trailerType ? ` (${htmlMode ? esc(i.trailerType) : i.trailerType})` : ''}`);
    } else {
      parts.push('(sans remorque attelée)');
    }
    if (i.driverName) parts.push(`conduit par ${b(i.driverName)}`);
    const who = parts.join(' ');

    if (ev.type === 'zone_enter') {
      return `${who} est ${b('arrivé')} au site « ${b(ev.zoneName)} »${ev.zoneType ? ` (${htmlMode ? esc(zoneTypeLabel(ev.zoneType)) : zoneTypeLabel(ev.zoneType)})` : ''} le ${fmtDT(ev.at)}.`;
    }
    if (ev.type === 'zone_exit') {
      return `${who} a ${b('quitté')} le site « ${b(ev.zoneName)} » le ${fmtDT(ev.at)}${ev.stayMs ? ` après ${b(fmtDur(ev.stayMs))} sur place` : ''}.`;
    }
    if (ev.type === 'maint_auto_logged') {
      return `${who} a dépassé le seuil de présence au site « ${b(ev.zoneName)} » : intervention ${b(ev.maintType || 'Maintenance')} enregistrée automatiquement le ${fmtDT(ev.at)}.`;
    }
    if (ev.type === 'speed') {
      return `${who} est en ${b('excès de vitesse')} à ${b(Math.round(ev.maxSpeed) + ' km/h')} (limite autorisée : ${ev.limit} km/h · durée : ${fmtDur(ev.durMs)}) le ${fmtDT(ev.at)}.`;
    }
    if (ev.type === 'vidange_due') {
      const v = ev.vidange || i.vidange;
      const det = v ? (v.kmUntilNext < 0 ? `retard de ${Math.abs(v.kmUntilNext).toLocaleString('fr-FR')} km` : `reste ${Number(v.kmUntilNext).toLocaleString('fr-FR')} km`) : '';
      return `${who} a atteint son ${b('échéance de vidange')}${det ? ` (${b(det)})` : ''}.`;
    }
    return who + '.';
  }

  function buildSubject(i, ev) {
    const tag = i.imm ? `${i.name} (${i.imm})` : i.name;
    if (ev.type === 'zone_enter') return `📍 Arrivée Site${ev.zoneType === 'maintenance' ? ' Maintenance' : ''} — ${tag} → ${ev.zoneName}`;
    if (ev.type === 'zone_exit') return `🚪 Sortie Site${ev.zoneType === 'maintenance' ? ' Maintenance' : ''} — ${tag} ← ${ev.zoneName}${ev.stayMs ? ' (' + fmtDur(ev.stayMs) + ')' : ''}`;
    if (ev.type === 'maint_auto_logged') return `🔧 ${ev.maintType || 'Maintenance'} Auto-détectée — ${tag} @ ${ev.zoneName}`;
    if (ev.type === 'speed') return `🚨 Excès de Vitesse — ${tag} (${Math.round(ev.maxSpeed)} km/h > ${ev.limit} km/h)`;
    if (ev.type === 'vidange_due') return `🛢️ Échéance Vidange — ${tag}`;
    return `🔔 Alerte Flotte — ${tag}`;
  }

  function trRow(label, val) {
    if (val === '' || val == null) return '';
    return `<tr>
      <td style="padding:7px 12px;color:#64748b;font-size:13px;border-bottom:1px solid #e2e8f0;width:40%;white-space:nowrap;">${esc(label)}</td>
      <td style="padding:7px 12px;color:#0f172a;font-size:13px;font-weight:600;border-bottom:1px solid #e2e8f0;">${val}</td>
    </tr>`;
  }

  function secBlock(title, accent, rows) {
    const body = rows.filter(Boolean).join('');
    if (!body) return '';
    return `<div style="margin-top:16px;">
      <div style="font-size:11px;letter-spacing:.8px;text-transform:uppercase;color:${accent};font-weight:800;margin-bottom:6px;">${esc(title)}</div>
      <table style="width:100%;border-collapse:collapse;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;">${body}</table>
    </div>`;
  }

  function buildEmailContent(i, ev) {
    const settings = getSettings() || {};
    const zone = ev.zoneName ? (settings.customLocations || []).find((z) => z.name === ev.zoneName) : null;
    let clientCtx = null;
    try { if (ev.zoneName && resolveZoneClientContext) clientCtx = resolveZoneClientContext(ev.zoneName); } catch (_) { /* optional */ }

    const accent = ev.type === 'speed' ? '#dc2626'
      : ev.type === 'vidange_due' ? '#ea580c'
      : ev.type === 'zone_exit' ? '#0284c7'
      : '#d97706';

    const mapUrl = (i.lat && i.lng) ? `https://www.google.com/maps?q=${i.lat},${i.lng}` : '';
    const v = ev.vidange || i.vidange;
    const vidStr = (v && v.nextKm && v.nextKm !== 'NA')
      ? `${Number(v.nextKm).toLocaleString('fr-FR')} km (${v.kmUntilNext < 0 ? 'retard ' + Math.abs(v.kmUntilNext).toLocaleString('fr-FR') + ' km' : 'reste ' + Number(v.kmUntilNext).toLocaleString('fr-FR') + ' km'})`
      : '';

    const html = `<div style="font-family:'Segoe UI',Arial,sans-serif;max-width:650px;margin:0 auto;background:#ffffff;border:1px solid #cbd5e1;border-radius:14px;overflow:hidden;">
      <div style="background:#0f172a;color:#ffffff;padding:18px 22px;border-bottom:4px solid ${accent};">
        <div style="font-size:11px;letter-spacing:1.2px;color:#f59e0b;font-weight:800;">DOUROUB EL DJAZAIR · SYSTÈME DE GESTION DE FLOTTE</div>
        <div style="font-size:18px;font-weight:800;margin-top:5px;">${esc(buildSubject(i, ev))}</div>
      </div>
      <div style="padding:20px 22px;">
        <div style="background:#fffbeb;border-left:4px solid ${accent};padding:12px 14px;border-radius:6px;font-size:14px;line-height:1.6;color:#0f172a;">
          ${buildNarrative(i, ev, true)}
        </div>
        ${secBlock('🚛 Identification du Tracteur', '#0f172a', [
          trRow('Code Tracteur', esc(i.name)),
          trRow('N° Immatriculation', esc(i.imm || 'Non renseigné')),
          trRow('N° Châssis (VIN)', esc(i.chassis || 'Non renseigné')),
          trRow('Carte Naftal', esc(i.naftal)),
          trRow('Compteur Kilométrique', i.km ? `${i.km.toLocaleString('fr-FR')} km` : 'Non disponible')
        ])}
        ${secBlock('🔗 Remorque & Chauffeur', '#0284c7', [
          trRow('Remorque Attelée', esc(i.trailerPlate || 'Aucune remorque attelée')),
          trRow('Type / Marque Remorque', esc([i.trailerType, i.trailerBrand].filter(Boolean).join(' · '))),
          trRow('Châssis Remorque', esc(i.trailerChassis)),
          trRow('Chauffeur Assigné', esc(i.driverName || 'Non renseigné')),
          trRow('Téléphone Chauffeur', esc(i.driverPhone))
        ])}
        ${ev.zoneName ? secBlock('📍 Détails du Site', '#d97706', [
          trRow('Nom du Site', `<b>${esc(ev.zoneName)}</b>`),
          trRow('Catégorie', esc(zoneTypeLabel((zone && zone.type) || ev.zoneType))),
          trRow('Wilaya', esc(zone && zone.wilaya)),
          trRow('Client', esc(clientCtx && clientCtx.clientName)),
          trRow('Client Final', esc(clientCtx && clientCtx.finalClientName)),
          trRow('Heure d\'arrivée', ev.entryAt ? fmtDT(ev.entryAt) : (ev.type === 'zone_enter' ? fmtDT(ev.at) : '')),
          trRow('Heure de sortie', ev.type === 'zone_exit' ? fmtDT(ev.at) : ''),
          trRow('Durée sur site', ev.stayMs ? `<b>${esc(fmtDur(ev.stayMs))}</b>` : '')
        ]) : ''}
        ${ev.type === 'speed' ? secBlock('🚨 Détails Excès de Vitesse', '#dc2626', [
          trRow('Vitesse Maximale Enregistrée', `<b style="color:#dc2626;">${Math.round(ev.maxSpeed)} km/h</b>`),
          trRow('Limite Autorisée', `${ev.limit} km/h`),
          trRow('Durée du Dépassement', fmtDur(ev.durMs))
        ]) : ''}
        ${secBlock('📡 État Télématique GPS', '#16a34a', [
          trRow('Vitesse Actuelle', `${i.speed} km/h`),
          trRow('Niveau Carburant', i.fuelPct != null ? `${i.fuelPct} %${i.fuelL != null ? ' (' + i.fuelL + ' L)' : ''}` : ''),
          trRow('Échéance Vidange', esc(vidStr)),
          trRow('Localisation', esc(i.place) || (i.lat && i.lng ? `${i.lat.toFixed(5)}, ${i.lng.toFixed(5)}` : '')),
          mapUrl ? trRow('Carte GPS', `<a href="${mapUrl}" style="color:#0284c7;font-weight:700;text-decoration:none;">📍 Ouvrir la position exacte sur Google Maps ↗</a>`) : ''
        ])}
        <div style="margin-top:20px;padding-top:12px;border-top:1px solid #e2e8f0;font-size:11px;color:#94a3b8;">
          Notification automatique envoyée par Douroub Flotte GPS · Gérez les destinataires et alertes dans <b>Configuration → Alertes Email</b>.
        </div>
      </div>
    </div>`;

    const textLines = [
      buildSubject(i, ev),
      '------------------------------------------------------------',
      buildNarrative(i, ev, false),
      '',
      `Tracteur: ${i.name} | IMM: ${i.imm || 'N/R'} | Châssis: ${i.chassis || 'N/R'}${i.naftal ? ' | Carte Naftal: ' + i.naftal : ''}`,
      `Remorque: ${i.trailerPlate || 'Aucune'}${i.trailerType ? ' (' + i.trailerType + ')' : ''}${i.trailerChassis ? ' | Châssis Remorque: ' + i.trailerChassis : ''}`,
      `Chauffeur: ${i.driverName || 'N/R'}${i.driverPhone ? ' (' + i.driverPhone + ')' : ''}`,
      `Compteur: ${i.km ? i.km.toLocaleString('fr-FR') + ' km' : 'N/D'} | Vitesse: ${i.speed} km/h${i.fuelPct != null ? ' | Carburant: ' + i.fuelPct + '%' : ''}`,
      vidStr ? `Vidange: ${vidStr}` : '',
      mapUrl ? `Google Maps: ${mapUrl}` : ''
    ].filter(Boolean);

    return { subject: buildSubject(i, ev), html, text: textLines.join('\n') };
  }

  function recipientsForEvent(c, evType, zone) {
    const isMaint = zone && zone.type === 'maintenance';
    const zName = zone && zone.name ? zone.name : '';
    return c.recipients
      .filter((r) => {
        if (!r || !r.enabled) return false;
        const ev = r.events || {};
        const pickedZone = zName && Array.isArray(r.customZoneNames) && r.customZoneNames.includes(zName);
        if (evType === 'zone_enter') {
          if (pickedZone) return true;
          return isMaint ? !!ev.zone_maint_enter : !!ev.zone_other_enter;
        }
        if (evType === 'zone_exit') {
          if (pickedZone) return true;
          return isMaint ? !!ev.zone_maint_exit : !!ev.zone_other_exit;
        }
        if (evType === 'maint_auto_logged') return !!ev.maint_auto_logged;
        if (evType === 'speed') return !!ev.speed;
        if (evType === 'vidange_due') return !!ev.vidange_due;
        return false;
      })
      .map((r) => r.email);
  }

  async function fire(ev, ctx, toEmails) {
    if (!toEmails || !toEmails.length) return;
    try {
      const profile = await gatherTruckFullProfile(ctx);
      const { subject, html, text } = buildEmailContent(profile, ev);
      await deliver(toEmails, subject, html, text);
    } catch (e) {
      console.error('[EmailAlerts] fire error:', e.message);
      pushLog({ ok: false, subject: ev.type, error: e.message });
    }
  }

  function notifyMaintAutoLogged(info) {
    try {
      const c = cfg();
      if (!c.enabled) return;
      const targets = recipientsForEvent(c, 'maint_auto_logged', { name: info.zoneName, type: 'maintenance' });
      if (!targets.length) return;
      const key = `maint_auto|${info.deviceId}|${info.zoneName}`;
      if (!cooled(key, Math.max(60, c.cooldownMinutes))) return;
      fire({ type: 'maint_auto_logged', at: Date.now(), zoneName: info.zoneName, zoneType: 'maintenance', maintType: info.maintType }, info, targets);
    } catch (e) { console.warn('[EmailAlerts] notifyMaintAutoLogged:', e.message); }
  }

  function onTick(ctx) {
    try {
      const c = cfg();
      const id = String(ctx.deviceId || '');
      if (!id) return;
      const now = Date.now();
      const lat = Number(ctx.lat), lng = Number(ctx.lng);
      ctx.odometerKm = odometerOf(ctx.truck || {});

      // Seed & check vidange transition
      const ovr = ((getSettings() || {}).vidangeOverrides || {})[id];
      const skip = ovr ? (ovr.lastVidangeKm || ovr.odometerAtConfirm || ovr.skipUntilKm || null) : null;
      let vid = null;
      try { if (calculateVidangeStatus) vid = calculateVidangeStatus(ctx.odometerKm, ctx.config, skip); } catch (_) { /* ignore */ }
      ctx.vidange = vid;
      const prevVidAlert = vidState.get(id);
      if (vid) vidState.set(id, !!vid.alert);
      if (c.enabled && vid && vid.alert && prevVidAlert === false) {
        const vidTargets = recipientsForEvent(c, 'vidange_due', null);
        if (vidTargets.length && cooled(`vid|${id}`, 24 * 60)) {
          fire({ type: 'vidange_due', at: now, vidange: vid }, ctx, vidTargets);
        }
      }

      // Seed & check zone entry / exit
      if (Number.isFinite(lat) && Number.isFinite(lng) && (lat !== 0 || lng !== 0)) {
        let st = zoneState.get(id);
        const isFirstObservation = !st;
        if (!st) { st = { inside: new Map() }; zoneState.set(id, st); }
        const zones = (getSettings() && getSettings().customLocations) || [];
        for (const z of zones) {
          const zl = parseFloat(z.lat), zg = parseFloat(z.lng), r = Number(z.radius) || 500;
          if (!Number.isFinite(zl) || !Number.isFinite(zg)) continue;
          const dist = calculateDistance(lat, lng, zl, zg);
          const wasInside = st.inside.has(z.name);
          if (!wasInside && dist <= r) {
            const seededEntry = (isFirstObservation && ctx.dbTruck && ctx.dbTruck.zone === z.name && ctx.dbTruck.entryTime)
              ? Number(ctx.dbTruck.entryTime) : now;
            st.inside.set(z.name, seededEntry);
            if (!isFirstObservation && c.enabled) {
              const inTargets = recipientsForEvent(c, 'zone_enter', z);
              if (inTargets.length && cooled(`in|${id}|${z.name}`, c.cooldownMinutes)) {
                fire({ type: 'zone_enter', at: now, entryAt: now, zoneName: z.name, zoneType: z.type || '' }, ctx, inTargets);
              }
            }
          } else if (wasInside && dist > r * 1.15) {
            const entryAt = st.inside.get(z.name);
            st.inside.delete(z.name);
            if (c.enabled) {
              const outTargets = recipientsForEvent(c, 'zone_exit', z);
              if (outTargets.length && cooled(`out|${id}|${z.name}`, c.cooldownMinutes)) {
                fire({ type: 'zone_exit', at: now, entryAt, stayMs: Math.max(60000, now - entryAt), zoneName: z.name, zoneType: z.type || '' }, ctx, outTargets);
              }
            }
          }
        }
      }

      // Speeding check
      if (!c.enabled) return;
      const limit = c.speedLimitOverride > 0 ? c.speedLimitOverride : (Number(ctx.speedLimit) || 80);
      const sp = Number(ctx.speed) || 0;
      const ss = speedState.get(id);
      if (sp > limit) {
        if (!ss) speedState.set(id, { startMs: now, max: sp, sent: false });
        else {
          if (sp > ss.max) ss.max = sp;
          if (!ss.sent && (now - ss.startMs) >= c.speedMinMinutes * 60000) {
            ss.sent = true;
            const spdTargets = recipientsForEvent(c, 'speed', null);
            if (spdTargets.length && cooled(`speed|${id}`, c.cooldownMinutes)) {
              fire({ type: 'speed', at: now, maxSpeed: ss.max, limit, durMs: now - ss.startMs }, ctx, spdTargets);
            }
          }
        }
      } else if (ss) speedState.delete(id);
    } catch (e) { console.error('[EmailAlerts] onTick error:', e.message); }
  }

  function registerRoutes(app, checkAccess) {
    app.get('/api/email-alerts/config', checkAccess, (req, res) => {
      const s = getSettings() || {};
      const zones = (s.customLocations || []).map((z) => ({
        name: z.name,
        type: z.type || 'other',
        wilaya: z.wilaya || '',
        radius: z.radius || 500
      }));
      res.json({
        config: sanitizeForClient(s.emailAlerts),
        deliveryReady: isDeliveryReady(),
        zones,
        log: historyLog
      });
    });

    app.post('/api/email-alerts/config', checkAccess, async (req, res) => {
      try {
        const s = getSettings();
        const next = normalizeConfig(req.body || {});
        s.emailAlerts = next;
        if (saveSettings) await saveSettings();
        res.json({
          success: true,
          config: sanitizeForClient(s.emailAlerts),
          deliveryReady: isDeliveryReady()
        });
      } catch (e) { res.status(500).json({ error: e.message }); }
    });

    app.post('/api/email-alerts/test', checkAccess, async (req, res) => {
      try {
        const body = req.body || {};
        const c = cfg();
        const rawTo = Array.isArray(body.to) && body.to.length
          ? body.to
          : c.recipients.filter((r) => r.enabled).map((r) => r.email);
        const to = rawTo
          .map((r) => String(typeof r === 'string' ? r : (r && r.email) || '').trim().toLowerCase())
          .filter((r, i, arr) => EMAIL_RX.test(r) && arr.indexOf(r) === i);
        if (!to.length) return res.status(400).json({ error: 'Ajoutez au moins une adresse email destinataire active.' });

        if (!body.eventType || body.eventType === 'hello') {
          const result = await deliver(
            to,
            'Hello test',
            '<div style="font-family:\'Segoe UI\',Arial,sans-serif;padding:18px;font-size:15px;color:#0f172a;">Hello test</div>',
            'Hello test'
          );
          if (!result.ok) return res.status(500).json({ error: result.error || 'Échec de l\'envoi' });
          return res.json({ success: true, to, truck: 'Hello test', subject: 'Hello test', log: historyLog });
        }

        let sampleTruck = null;
        if (Truck) {
          if (body.deviceId) sampleTruck = await Truck.findOne({ deviceId: String(body.deviceId) }).lean();
          if (!sampleTruck) sampleTruck = await Truck.findOne({ immatriculation: { $nin: [null, ''] }, deviceId: { $ne: 'undefined' } }).lean();
          if (!sampleTruck) sampleTruck = await Truck.findOne({ deviceId: { $ne: 'undefined' } }).lean();
        }
        const db = sampleTruck || { deviceId: 'TEST-01', truckName: 'T012', immatriculation: '000120-525-07', chassisNumber: 'WMA06KZZ2SP312488', trailer: '000045-825-07', driverName: 'Chauffeur Test', lat: 34.85, lng: 5.73, speed: 0 };
        const zones = (getSettings() && getSettings().customLocations) || [];
        const maintZone = zones.find((z) => z.type === 'maintenance') || zones[0] || { name: 'Maghreb Truck Company SPA', type: 'maintenance' };
        const ctx = {
          deviceId: db.deviceId, truckName: db.truckName, dbTruck: db, truck: db,
          lat: db.lat || maintZone.lat || 34.85, lng: db.lng || maintZone.lng || 5.73,
          speed: db.speed || 0, fuelPercent: db.lastFuelPercent, fuelLiters: db.lastFuelLiters,
          odometerKm: odometerOf(db) || 124500
        };
        const evType = ['zone_enter', 'zone_exit', 'speed', 'vidange_due'].includes(body.eventType) ? body.eventType : 'zone_enter';
        const now = Date.now();
        const ev = evType === 'zone_exit'
          ? { type: 'zone_exit', at: now, entryAt: now - 8100000, stayMs: 8100000, zoneName: maintZone.name, zoneType: maintZone.type || 'maintenance' }
          : evType === 'speed'
            ? { type: 'speed', at: now, maxSpeed: 104, limit: c.speedLimitOverride || 80, durMs: 240000 }
            : evType === 'vidange_due'
              ? { type: 'vidange_due', at: now, vidange: { nextKm: 125000, kmUntilNext: -450 } }
              : { type: 'zone_enter', at: now, entryAt: now, zoneName: maintZone.name, zoneType: maintZone.type || 'maintenance' };

        const profile = await gatherTruckFullProfile(ctx);
        const { subject, html, text } = buildEmailContent(profile, ev);
        const result = await deliver(to, '[TEST] ' + subject, html, text);
        if (!result.ok) return res.status(500).json({ error: result.error || 'Échec de l\'envoi' });
        res.json({ success: true, to, truck: profile.name, subject: '[TEST] ' + subject, log: historyLog });
      } catch (e) { res.status(500).json({ error: e.message }); }
    });
  }

  return { onTick, notifyMaintAutoLogged, registerRoutes, sanitizeForClient, buildEmailContent, gatherTruckFullProfile };
}

module.exports = { create, sanitizeForClient, defaultConfig, normalizeConfig };
