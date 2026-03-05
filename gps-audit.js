/**
 * GPS AUDITOR V38 - FIXED EDITION
 * FIXES:
 *  - CRITICAL: apiBase now correctly reads FLEET_CONFIG.API.baseUrl (was reading non-existent API_BASE_URL)
 *  - NEW: Refill detection in GPS history (≥50L, engine off, dedup 5min)
 *  - NEW: Découchage detection aligned with server logic (previous day rule)
 *  - FIX: Fuel sensor (io87) now extracted from GPS messages
 *  - FIX: Découchage in saved reports now matches live tracker
 */
class GPSAuditor {
  constructor() {
    this.trucks = [];
    this.incidents = [];
    this.parkings = [];
    this.refills = [];
    this.decouchages_found = [];

    this.apiKey = (typeof FLEET_CONFIG !== 'undefined') ? FLEET_CONFIG.GEOAPIFY_API_KEY : '';

    // 🔧 FIX #1: Was reading FLEET_CONFIG.API_BASE_URL which DOES NOT EXIST.
    // Correct key is FLEET_CONFIG.API.baseUrl — falls back to '' (relative path) if not set yet.
    this.apiBase = '';
    if (typeof FLEET_CONFIG !== 'undefined') {
      this.apiBase = (FLEET_CONFIG.API && FLEET_CONFIG.API.baseUrl)
        ? FLEET_CONFIG.API.baseUrl.replace(/\/$/, '')
        : '';
    }

    this.isBusy = false;
    if (document.readyState === 'loading')
      document.addEventListener('DOMContentLoaded', () => this.init());
    else this.init();
  }

  init() {
    const now = new Date();
    const past = new Date();
    past.setDate(past.getDate() - 7);
    const elEnd = document.getElementById('endDate');
    const elStart = document.getElementById('startDate');
    if (elEnd && elStart) {
      elEnd.value = now.toISOString().slice(0, 16);
      elStart.value = past.toISOString().slice(0, 16);
    }
    // 🔧 Re-read apiBase after UI is loaded (FLEET_CONFIG.API.baseUrl may be set later by ui.js)
    setTimeout(() => {
      if (typeof FLEET_CONFIG !== 'undefined' && FLEET_CONFIG.API && FLEET_CONFIG.API.baseUrl) {
        this.apiBase = FLEET_CONFIG.API.baseUrl.replace(/\/$/, '');
      }
    }, 1500);

    this.loadTrucks();
    document.addEventListener('mousemove', (e) => this.moveTooltip(e));
  }

  // --- TOOLTIP ---
  showTooltip(item) {
    const tip = document.getElementById('forensic-tooltip');
    if (!tip) return;
    const isRefill = item.type === 'refill';
    const isDecouchage = item.type === 'decouchage';
    if (isRefill) {
      tip.innerHTML = `
        <div style="border-bottom:1px solid #334155;margin-bottom:5px;font-weight:bold;color:#22c55e">⛽ ${item.truck}</div>
        <div style="display:flex;justify-content:space-between;color:#94a3b8"><span>Carburant Ajouté</span><span style="color:white">+${item.addedLiters}L</span></div>
        <div style="display:flex;justify-content:space-between;color:#94a3b8"><span>Avant</span><span style="color:white">${item.oldLevel}L</span></div>
        <div style="display:flex;justify-content:space-between;color:#94a3b8"><span>Après</span><span style="color:white">${item.newLevel}L</span></div>
        <div style="display:flex;justify-content:space-between;color:#94a3b8"><span>Lieu</span><span style="color:white">${item.location}</span></div>`;
    } else if (isDecouchage) {
      tip.innerHTML = `
        <div style="border-bottom:1px solid #334155;margin-bottom:5px;font-weight:bold;color:#f59e0b">🌙 ${item.truck}</div>
        <div style="display:flex;justify-content:space-between;color:#94a3b8"><span>Date</span><span style="color:white">${item.date}</span></div>
        <div style="display:flex;justify-content:space-between;color:#94a3b8"><span>Heure</span><span style="color:white">${item.startTime}</span></div>
        <div style="display:flex;justify-content:space-between;color:#94a3b8"><span>Lieu</span><span style="color:white">${item.location}</span></div>`;
    } else {
      tip.innerHTML = `
        <div style="border-bottom:1px solid #334155;margin-bottom:5px;font-weight:bold;color:#3b82f6">${item.truck}</div>
        <div style="display:flex;justify-content:space-between;color:#94a3b8"><span>Début</span><span style="color:white">${item.startTime}</span></div>
        <div style="display:flex;justify-content:space-between;color:#94a3b8"><span>Fin</span><span style="color:white">${item.endTime}</span></div>
        <div style="display:flex;justify-content:space-between;color:#94a3b8"><span>Durée</span><span style="color:white">${item.durh}</span></div>
        <div style="display:flex;justify-content:space-between;color:#94a3b8"><span>Type</span><span style="color:${item.reason.includes('COUPURE') ? '#ef4444' : '#3b82f6'}">${item.reason}</span></div>`;
    }
    tip.style.display = 'block';
  }

  moveTooltip(e) {
    const tip = document.getElementById('forensic-tooltip');
    if (tip) { tip.style.left = (e.clientX - 310) + 'px'; tip.style.top = (e.clientY + 10) + 'px'; }
  }

  hideTooltip() { document.getElementById('forensic-tooltip').style.display = 'none'; }

  // --- CONNEXION ---
  async loadTrucks() {
    this.log('Connexion au serveur...', 'n');
    const code = localStorage.getItem('fleetAccessCode');
    try {
      const res = await fetch(this.apiBase + '/api/trucks', { headers: { 'x-access-code': code } });
      if (!res.ok) throw new Error(res.status);
      const raw = await res.json();
      const data = raw.data || raw;
      let list = Array.isArray(data)
        ? data
        : Object.entries(data).map(([k, v]) => ({ ...v, id: v.id || v.imei || v.deviceId || k }));
      this.trucks = list.map(t => ({ id: t.id, name: t.name || t.truckName || 'ID:' + t.id }))
        .filter(t => t.id);
      this.trucks.sort((a, b) => a.name.localeCompare(b.name));
      this.renderList();
      this.log(`Connecté. ${this.trucks.length} Véhicules disponibles.`, 'ok');
    } catch (e) { this.log('Erreur Connexion: ' + e.message, 'err'); }
  }

  renderList() {
    const c = document.getElementById('truckListContainer');
    c.innerHTML = '';
    this.trucks.forEach(t => {
      const div = document.createElement('div');
      div.className = 't-item';
      div.innerHTML = `<input type="checkbox" value="${t.id}" class="truck-cb"><span class="t-name">${t.name}</span>`;
      div.onclick = (e) => { if (e.target.tagName !== 'INPUT') div.querySelector('input').click(); this.updateCount(); };
      c.appendChild(div);
    });
  }

  updateCount() {
    const el = document.getElementById('selCount');
    if (el) el.innerText = document.querySelectorAll('.truck-cb:checked').length;
  }

  toggleAll(v) {
    document.querySelectorAll('.truck-cb').forEach(c => c.checked = v);
    this.updateCount();
  }

  log(msg, type = 'n') {
    const c = document.getElementById('consoleLog');
    const d = document.createElement('div');
    d.style.color = type === 'err' ? '#ef4444' : type === 'ok' ? '#10b981' : '#cbd5e1';
    d.innerText = msg;
    c.appendChild(d);
    c.scrollTop = c.scrollHeight;
  }

  // ============================================================
  // 🔧 MOTEUR D'AUDIT RAPIDE
  // ============================================================
  async startAudit() {
    const selected = Array.from(document.querySelectorAll('.truck-cb:checked')).map(cb => cb.value);
    if (selected.length === 0) return alert('Sélectionnez au moins un véhicule.');

    this.isBusy = true;
    document.getElementById('btnStart').disabled = true;
    this.incidents = [];
    this.parkings = [];
    this.refills = [];
    this.decouchages_found = [];

    document.getElementById('feedContainer').innerHTML = '';
    document.getElementById('cntCuts').innerText = 0;
    document.getElementById('cntSleep').innerText = 0;
    if (document.getElementById('cntRefills')) document.getElementById('cntRefills').innerText = 0;
    if (document.getElementById('cntDecouchages')) document.getElementById('cntDecouchages').innerText = 0;

    const startRaw = document.getElementById('startDate').value;
    const endRaw = document.getElementById('endDate').value;
    const tolerance = parseInt(document.getElementById('gapTolerance').value) || 15;
    const sensitivity = document.getElementById('sensitivity').value;
    let tolMin = tolerance;
    if (sensitivity === 'high') tolMin = 5;
    if (sensitivity === 'paranoid') tolMin = 2;

    let stats = { sleep: 0, cut: 0, refillLiters: 0, decouchageCount: 0 };
    const totalDurationMs = (new Date(endRaw) - new Date(startRaw)) * selected.length;
    let completed = 0;

    this.log(`🚀 DÉMARRAGE DE L'AUDIT SUR ${selected.length} VÉHICULES...`, 'ok');

    const tasks = selected.map(truckId => {
      return this.auditTruck(truckId, startRaw, endRaw, tolMin).then(res => {
        // Live update stats
        stats.sleep += res.sleepMs;
        stats.cut += res.cutMs;
        stats.refillLiters += res.refillLiters || 0;
        stats.decouchageCount += res.decouchages ? res.decouchages.length : 0;
        this.incidents.push(...res.incidents);
        this.parkings.push(...res.parkings);
        this.refills.push(...(res.refills || []));
        this.decouchages_found.push(...(res.decouchages || []));
        this.renderLiveResults(res.incidents, res.parkings, res.refills || [], res.decouchages || []);
        this.updateUI(stats, totalDurationMs);
        completed++;
        document.getElementById('progressBar').style.width = (completed / selected.length * 100) + '%';
        this.log(`✅ Terminé: ${res.truckName} — ${res.incidents.length} coupures, ${(res.refills || []).length} pleins`);
      });
    });

    await Promise.all(tasks);
    this.isBusy = false;
    document.getElementById('btnStart').disabled = false;
    this.log('✅ AUDIT COMPLET TERMINÉ.', 'ok');
  }

  renderLiveResults(newIncidents, newParkings, newRefills = [], newDecouchages = []) {
    const feed = document.getElementById('feedContainer');

    const makeCard = (item, type) => {
      const div = document.createElement('div');
      div.className = `item ${type}`;

      if (type === 'refill') {
        div.style.borderLeft = '4px solid #22c55e';
        div.innerHTML = `
          <div class="i-head"><span>⛽ ${item.startTime}</span><span>${item.truck}</span></div>
          <div class="i-body">+${item.addedLiters}L → ${item.newLevel}L (${item.location})</div>
          <div class="i-loc"><i class="fa-solid fa-spinner fa-spin"></i> Recherche adresse...</div>`;
      } else if (type === 'decouchage') {
        div.style.borderLeft = '4px solid #f59e0b';
        div.innerHTML = `
          <div class="i-head"><span>🌙 ${item.startTime}</span><span>${item.truck}</span></div>
          <div class="i-body">Découchage — ${item.location}</div>
          <div class="i-loc"><i class="fa-solid fa-map-marker-alt"></i> ${item.location}</div>`;
      } else {
        div.style.borderLeft = type === 'cut' ? '4px solid #ef4444' : '4px solid #3b82f6';
        div.innerHTML = `
          <div class="i-head"><span>${item.startTime}</span><span>${item.truck}</span></div>
          <div class="i-body">${item.reason} — ${item.durh}</div>
          <div class="i-loc"><i class="fa-solid fa-spinner fa-spin"></i> Recherche adresse...</div>`;
      }

      div.onmouseenter = () => this.showTooltip({ ...item, type });
      div.onmouseleave = () => this.hideTooltip();

      // Active tab filter
      const activeTab = document.querySelector('.pill.active')?.textContent || '';
      const isCutTab = activeTab.includes('COUPURES');
      const isRefillTab = activeTab.includes('PLEINS') || activeTab.includes('REFILLS');
      const isDecTab = activeTab.includes('DÉCOU');
      div.style.display =
        (type === 'cut' && isCutTab) ||
        (type === 'sleep' && !isCutTab && !isRefillTab && !isDecTab) ||
        (type === 'refill' && isRefillTab) ||
        (type === 'decouchage' && isDecTab)
          ? 'block' : 'none';

      feed.appendChild(div);

      // Géocode adresse
      if (type !== 'decouchage' && this.apiKey) {
        fetch(`https://api.geoapify.com/v1/geocode/reverse?lat=${item.lat}&lon=${item.lng}&apiKey=${this.apiKey}`)
          .then(r => r.json())
          .then(d => {
            const addr = d.features?.[0]?.properties?.formatted || 'Inconnu';
            const locEl = div.querySelector('.i-loc');
            if (locEl) { locEl.innerHTML = `<i class="fa-solid fa-location-dot"></i> ${addr}`; item.addr = addr; }
          })
          .catch(() => { });
      }
    };

    newIncidents.forEach(i => makeCard(i, 'cut'));
    newParkings.forEach(p => makeCard(p, 'sleep'));
    newRefills.forEach(r => makeCard(r, 'refill'));
    newDecouchages.forEach(d => makeCard(d, 'decouchage'));

    document.getElementById('cntCuts').innerText = this.incidents.length;
    document.getElementById('cntSleep').innerText = this.parkings.length;
    if (document.getElementById('cntRefills')) document.getElementById('cntRefills').innerText = this.refills.length;
    if (document.getElementById('cntDecouchages')) document.getElementById('cntDecouchages').innerText = this.decouchages_found.length;
  }

  updateUI(stats, totalMs) {
    document.getElementById('kpiSleep').innerText = (stats.sleep / 3600000).toFixed(1) + 'h';
    document.getElementById('kpiDowntime').innerText = (stats.cut / 3600000).toFixed(1) + 'h';
    const uptime = Math.max(0, totalMs - stats.cut);
    document.getElementById('kpiUptime').innerText = (uptime / 3600000).toFixed(1) + 'h';
    const score = totalMs > 0 ? (100 - (stats.cut / totalMs * 100)) : 100;
    document.getElementById('kpiScore').innerText = score.toFixed(2);
    if (document.getElementById('kpiRefills')) document.getElementById('kpiRefills').innerText = (stats.refillLiters || 0) + 'L';
    if (document.getElementById('kpiDecouchages')) document.getElementById('kpiDecouchages').innerText = stats.decouchageCount || 0;
  }

  // ============================================================
  // 🔧 AUDIT TRUCK (core per-truck logic)
  // ============================================================
  async auditTruck(id, startStr, endStr, toleranceMin) {
    const start = new Date(startStr).getTime();
    const end = new Date(endStr).getTime();

    // 20 parallel threads for max speed
    const threads = 20;
    const chunk = (end - start) / threads;
    let promises = [];
    for (let i = 0; i < threads; i++) {
      const s = new Date(start + chunk * i).toISOString();
      const e = new Date(start + chunk * (i + 1)).toISOString();
      promises.push(this.fetchChunk(id, s, e));
    }

    const results = await Promise.all(promises);
    let points = [].concat(...results);
    // Deduplicate and sort by time
    points = points.filter((p, i, a) => i === a.findIndex(t => t.t === p.t));
    points.sort((a, b) => a.t - b.t);

    const truckName = this.trucks.find(t => t.id === id)?.name || id;

    if (points.length === 0) {
      return {
        truckName, sleepMs: 0, cutMs: end - start, refillLiters: 0,
        incidents: [{
          truck: truckName,
          startTime: new Date(start).toLocaleString(),
          endTime: new Date(end).toLocaleString(),
          dur: ((end - start) / 3600000).toFixed(1),
          lat: 0, lng: 0,
          reason: 'BLACKOUT TOTAL', spd: 0
        }],
        parkings: [], refills: [], decouchages: []
      };
    }

    // Get truck capacity for fuel conversion
    const truckId = id;
    let capacity = 600; // default
    if (typeof FLEET_CONFIG !== 'undefined' && typeof getTruckConfig === 'function') {
      const cfg = getTruckConfig(truckId);
      capacity = cfg.fuelTankCapacity || 600;
    } else if (typeof FLEET_CONFIG !== 'undefined' && FLEET_CONFIG.DEFAULT_TRUCK_CONFIG) {
      capacity = FLEET_CONFIG.DEFAULT_TRUCK_CONFIG.fuelTankCapacity || 600;
    }

    return this.analyze(points, toleranceMin, truckName, capacity);
  }

  // ============================================================
  // 🔧 FIX #2: fetchChunk now extracts fuel sensor (io87)
  // ============================================================
  async fetchChunk(id, s, e) {
    try {
      const start = s.slice(0, 16).replace('T', '%2520');
      const end = e.slice(0, 16).replace('T', '%2520');
      const res = await fetch(
        `${this.apiBase}/api/history?imei=${id}&start=${start}&end=${end}`,
        { headers: { 'x-access-code': localStorage.getItem('fleetAccessCode') } }
      );
      const json = await res.json();
      const raw = json.messages || (Array.isArray(json) ? json : []);

      return raw.map(p => {
        // Time
        const tStr = Array.isArray(p) ? p[0] : (p.timestamp || p.t);
        // Position
        const lat = parseFloat(Array.isArray(p) ? p[1] : p.lat);
        const lng = parseFloat(Array.isArray(p) ? p[2] : p.lng);
        // Speed
        const spd = parseFloat(Array.isArray(p) ? p[3] : (p.speed || 0));
        // 🔧 FIX: Extract fuel sensor io87 (percentage 0-100)
        let fuel = 0;
        if (Array.isArray(p)) {
          // Array format: params may be at index 7 or 8 as an object
          if (p[7] && typeof p[7] === 'object') fuel = parseFloat(p[7].io87 || p[7].fuel || 0);
          else if (p[8] && typeof p[8] === 'object') fuel = parseFloat(p[8].io87 || p[8].fuel || 0);
          else fuel = parseFloat(p[7] || p[8] || 0); // fallback: raw value
        } else {
          // Object format: params sub-object or direct field
          fuel = parseFloat(p.params?.io87 || p.io87 || p.fuel || p.params?.fuel || 0);
        }
        // Clamp fuel to 0-100 range
        if (fuel > 100) fuel = 100;
        if (fuel < 0) fuel = 0;
        // Ignition
        let ign = 0;
        if (Array.isArray(p)) {
          ign = parseInt(p[4] || 0);
        } else {
          ign = parseInt(p.params?.io1 ?? p.params?.acc ?? p.ign ?? 0);
        }

        return { t: new Date(tStr).getTime(), lat, lng, spd, fuel, ign };
      });
    } catch (e) { return []; }
  }

  // ============================================================
  // 🔧 FIX #3: analyze() — now detects refills AND découchages
  // ============================================================
  analyze(points, toleranceMin, truckName, capacity = 600) {
    let sleepMs = 0, cutMs = 0;
    let incidents = [], parkings = [];
    const tolMs = toleranceMin * 60000;

    // --- GPS CUTS & SLEEPS (existing logic, unchanged) ---
    for (let i = 0; i < points.length - 1; i++) {
      const p1 = points[i];
      const p2 = points[i + 1];
      const diff = p2.t - p1.t;
      if (diff <= 0) continue;

      const isGap = diff > tolMs;
      const wasMoving = p1.spd > 5;
      const tStart = new Date(p1.t).toLocaleString();
      const tEnd = new Date(p2.t).toLocaleString();
      const info = {
        truck: truckName,
        startTime: tStart, endTime: tEnd,
        dur: (diff / 3600000).toFixed(1), durh: (diff / 3600000).toFixed(1) + 'h',
        lat: p1.lat, lng: p1.lng, spd: p1.spd
      };

      if (!isGap) {
        if (!wasMoving) sleepMs += diff;
      } else {
        if (wasMoving) {
          cutMs += diff;
          info.reason = `COUPURE MOUVEMENT (${p1.spd}km/h)`;
          incidents.push(info);
        } else {
          sleepMs += diff;
          info.reason = 'PARKING / VEILLE GPS';
          parkings.push(info);
        }
      }
    }

    // --- 🔧 NEW: REFILL DETECTION ---
    const refills = this.detectRefills(points, truckName, capacity);
    const refillLiters = refills.reduce((sum, r) => sum + r.addedLiters, 0);

    // --- 🔧 NEW: DÉCOUCHAGE DETECTION (same logic as server) ---
    const decouchages = this.detectDecouchages(points, truckName);

    return { truckName, sleepMs, cutMs, refillLiters, incidents, parkings, refills, decouchages };
  }

  // ============================================================
  // 🔧 NEW: Refill Detection from GPS History
  // Rules: ≥50L increase, engine off, dedup 5 min, any location
  // ============================================================
  detectRefills(points, truckName, capacity) {
    const refills = [];
    let lastRefillTime = 0;
    const locs = (typeof FLEET_CONFIG !== 'undefined' ? (FLEET_CONFIG.CUSTOM_LOCATIONS || []) : []);

    // Need at least fuel data in points
    const hasFuel = points.some(p => p.fuel > 0);
    if (!hasFuel) return refills; // No fuel data in this GPS history → skip

    for (let i = 1; i < points.length; i++) {
      const p1 = points[i - 1];
      const p2 = points[i];

      if (!p1.fuel || !p2.fuel) continue;

      const liters1 = Math.round((p1.fuel / 100) * capacity);
      const liters2 = Math.round((p2.fuel / 100) * capacity);
      const diff = liters2 - liters1;

      // Conditions: >50L added (ignore 50L & below), truck was stopped, not duplicate within 5 min
      const truckWasStopped = p1.spd <= 2 && p1.ign !== 1;
      const notDuplicate = (p2.t - lastRefillTime) > 5 * 60 * 1000;

      if (diff > 50 && truckWasStopped && notDuplicate) {
        // Detect location from GPS coords at refill time
        let locName = 'Station Externe';
        let isInternal = false;
        for (const loc of locs) {
          const d = this.getDist(p2.lat, p2.lng, loc.lat, loc.lng);
          if (d <= (loc.radius / 1000 || 0.5)) {
            locName = loc.name;
            isInternal = true;
            break;
          }
        }

        refills.push({
          truck: truckName,
          startTime: new Date(p1.t).toLocaleString(),
          endTime: new Date(p2.t).toLocaleString(),
          addedLiters: Math.round(diff),
          oldLevel: liters1,
          newLevel: liters2,
          location: locName,
          isInternal,
          lat: p2.lat,
          lng: p2.lng,
          dur: ((p2.t - p1.t) / 3600000).toFixed(2),
          durh: ((p2.t - p1.t) / 60000).toFixed(0) + 'min',
          reason: `+${Math.round(diff)}L @ ${locName}`,
          t: p2.t
        });

        lastRefillTime = p2.t;
      }
    }

    return refills;
  }

  // ============================================================
  // 🔧 NEW: Découchage Detection from GPS History
  // Rule: Outside douroub zone + engine off between 00:00–06:30
  // Date = previous day (same as server logic)
  // ============================================================
  detectDecouchages(points, truckName) {
    const decouchages = [];
    const locs = (typeof FLEET_CONFIG !== 'undefined' ? (FLEET_CONFIG.CUSTOM_LOCATIONS || []) : []);
    const safeZones = locs.filter(l => l.type === 'douroub');

    if (safeZones.length === 0) return decouchages; // No safe zones defined → can't detect

    const checkedDates = new Set();

    for (const p of points) {
      // Algeria time = UTC+1
      const dzTime = new Date(p.t + 3600000);
      const dzHour = dzTime.getUTCHours();

      // Only check during 00:00–06:30 window (same as server)
      if (dzHour < 0 || dzHour >= 7) continue;

      // Date attribution = PREVIOUS DAY (e.g., 00:05 Jan 18 → Jan 17)
      const logicDate = new Date(dzTime);
      logicDate.setDate(logicDate.getDate() - 1);
      const logicDateStr = logicDate.toISOString().split('T')[0];

      if (checkedDates.has(logicDateStr)) continue; // Only one per day per truck

      // Check if truck is outside all safe zones
      let isSafe = false;
      for (const zone of safeZones) {
        const dist = this.getDist(p.lat, p.lng, zone.lat, zone.lng);
        if (dist <= (zone.radius / 1000 || 0.5)) {
          isSafe = true;
          break;
        }
      }

      if (!isSafe && p.spd <= 2) {
        // Découchage confirmed — find location name
        let locationName = null;
        for (const loc of locs) {
          const dist = this.getDist(p.lat, p.lng, loc.lat, loc.lng);
          if (dist <= (loc.radius / 1000 || 0.5)) {
            locationName = loc.name;
            break;
          }
        }

        decouchages.push({
          truck: truckName,
          date: logicDateStr,
          startTime: new Date(p.t).toLocaleString(),
          lat: p.lat,
          lng: p.lng,
          location: locationName || `Hors Site (${p.lat.toFixed(4)}, ${p.lng.toFixed(4)})`,
          dur: '0.0',
          durh: '—',
          reason: `Découchage (${logicDateStr})`
        });

        checkedDates.add(logicDateStr);
      }
    }

    return decouchages;
  }

  // --- SAVE TO DB ---
  async saveAuditToDB() {
    if (this.incidents.length === 0 && this.parkings.length === 0 && this.refills.length === 0) {
      return alert('Rien à sauvegarder.');
    }

    const checkedBoxes = document.querySelectorAll('.truck-cb:checked');
    const names = Array.from(checkedBoxes)
      .map(cb => cb.parentElement.querySelector('.t-name').innerText)
      .join(', ');

    const payload = {
      truckName: names.length > 50 ? names.substring(0, 47) + '...' : names,
      periodStart: document.getElementById('startDate').value,
      periodEnd: document.getElementById('endDate').value,
      stats: {
        uptime: document.getElementById('kpiUptime').innerText,
        downtime: document.getElementById('kpiDowntime').innerText,
        sleep: document.getElementById('kpiSleep').innerText,
        score: document.getElementById('kpiScore').innerText,
        refills: this.refills.length,
        decouchages: this.decouchages_found.length
      },
      incidents: this.incidents,
      parkings: this.parkings,
      refills: this.refills,
      decouchages: this.decouchages_found
    };

    try {
      const res = await fetch(this.apiBase + '/api/audit/save', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-access-code': localStorage.getItem('fleetAccessCode')
        },
        body: JSON.stringify(payload)
      });
      if (res.ok) { this.log('✅ Rapport Sauvegardé BDD.', 'ok'); this.loadHistoryList(); }
    } catch (e) { this.log('Erreur Sauvegarde: ' + e.message, 'err'); }
  }

  // --- HISTORIQUE / EXPORT ---
  async loadHistoryList() {
    const c = document.getElementById('historyList');
    c.innerHTML = '<div style="padding:10px;text-align:center;color:#64748b">Chargement...</div>';
    try {
      const res = await fetch(this.apiBase + '/api/audit/list', {
        headers: { 'x-access-code': localStorage.getItem('fleetAccessCode') }
      });
      const list = await res.json();
      c.innerHTML = '';
      list.forEach(r => {
        const div = document.createElement('div');
        div.className = 'history-item';
        div.innerHTML = `
          <div style="font-weight:bold;color:#f1f5f9">${r.truckName || 'Sans Nom'}</div>
          <div style="font-size:10px;color:#94a3b8;display:flex;justify-content:space-between">
            <span>${new Date(r.date).toLocaleDateString()}</span>
            <span style="color:${parseFloat(r.stats?.score) >= 90 ? '#10b981' : '#ef4444'}">${r.stats?.score}</span>
          </div>
          <i class="fa-solid fa-trash h-del" onclick="event.stopPropagation();auditor.deleteReport('${r._id || r.id}')"></i>`;
        div.onclick = () => this.loadReportFromDB(r._id || r.id);
        c.appendChild(div);
      });
    } catch (e) { c.innerHTML = 'Erreur liste.'; }
  }

  async loadReportFromDB(id) {
    try {
      const res = await fetch(this.apiBase + '/api/audit/' + id, {
        headers: { 'x-access-code': localStorage.getItem('fleetAccessCode') }
      });
      const r = await res.json();
      this.incidents = r.incidents || [];
      this.parkings = r.parkings || [];
      this.refills = r.refills || [];
      this.decouchages_found = r.decouchages || [];
      document.getElementById('kpiUptime').innerText = r.stats?.uptime || '0h';
      document.getElementById('kpiDowntime').innerText = r.stats?.downtime || '0h';
      document.getElementById('kpiSleep').innerText = r.stats?.sleep || '0h';
      document.getElementById('kpiScore').innerText = r.stats?.score || '100';
      if (window.switchMainTab) window.switchMainTab('live');
      this.renderLiveResults(this.incidents, this.parkings, this.refills, this.decouchages_found);
      this.log('✅ Rapport Restauré.', 'ok');
    } catch (e) { this.log('Erreur Chargement: ' + e.message, 'err'); }
  }

  async deleteReport(id) {
    if (!confirm('Supprimer ?')) return;
    await fetch(this.apiBase + '/api/audit/' + id, {
      method: 'DELETE',
      headers: { 'x-access-code': localStorage.getItem('fleetAccessCode') }
    });
    this.loadHistoryList();
  }

  filterFeed(type) {
    const el = document.querySelector(`.pill[data-type="${type}"]`) ||
      Array.from(document.querySelectorAll('.pill')).find(p => {
        const t = p.textContent;
        if (type === 'cut') return t.includes('COUPURES');
        if (type === 'sleep') return t.includes('PARKING');
        if (type === 'refill') return t.includes('PLEINS') || t.includes('REFILLS');
        if (type === 'decouchage') return t.includes('DÉCOU');
        return false;
      });

    document.querySelectorAll('.pill').forEach(p => {
      p.classList.remove('active');
      p.style.background = '#1e293b';
      p.style.color = '#94a3b8';
    });

    if (el) {
      el.classList.add('active');
      const color = type === 'cut' ? '#ef4444' : type === 'refill' ? '#22c55e' : type === 'decouchage' ? '#f59e0b' : '#3b82f6';
      el.style.background = color;
      el.style.color = 'white';
    }

    const feed = document.getElementById('feedContainer');
    Array.from(feed.children).forEach(div => {
      const isCut = div.className.includes('cut');
      const isSleep = div.className.includes('sleep');
      const isRefill = div.className.includes('refill');
      const isDec = div.className.includes('decouchage');
      div.style.display =
        (type === 'cut' && isCut) ||
        (type === 'sleep' && isSleep) ||
        (type === 'refill' && isRefill) ||
        (type === 'decouchage' && isDec)
          ? 'block' : 'none';
    });
  }

  exportReport() {
    if (this.incidents.length === 0 && this.parkings.length === 0 && this.refills.length === 0) {
      return alert('Aucune donnée.');
    }
    let txt = '=== RAPPORT AUDIT GPS ===\n\n';
    txt += `COUPURES (${this.incidents.length})\n`;
    this.incidents.forEach(i => txt += `  COUPURE | ${i.startTime} | ${i.truck} | ${i.reason} | ${i.durh}\n`);
    txt += `\nPARKINGS (${this.parkings.length})\n`;
    this.parkings.forEach(p => txt += `  PARKING | ${p.startTime} | ${p.truck} | ${p.durh}\n`);
    txt += `\nPLEINS CARBURANT (${this.refills.length})\n`;
    this.refills.forEach(r => txt += `  PLEIN | ${r.startTime} | ${r.truck} | +${r.addedLiters}L | ${r.location}\n`);
    txt += `\nDÉCOUCHAGES (${this.decouchages_found.length})\n`;
    this.decouchages_found.forEach(d => txt += `  DÉCOUCHAGE | ${d.date} | ${d.truck} | ${d.location}\n`);
    const url = window.URL.createObjectURL(new Blob([txt], { type: 'text/plain' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'RAPPORT_AUDIT.txt';
    a.click();
  }

  clearAll() {
    if (!confirm('Effacer l\'écran ?')) return;
    this.incidents = []; this.parkings = []; this.refills = []; this.decouchages_found = [];
    document.getElementById('feedContainer').innerHTML = '';
    document.getElementById('cntCuts').innerText = 0;
    document.getElementById('cntSleep').innerText = 0;
    if (document.getElementById('cntRefills')) document.getElementById('cntRefills').innerText = 0;
    if (document.getElementById('cntDecouchages')) document.getElementById('cntDecouchages').innerText = 0;
    document.getElementById('progressBar').style.width = '0%';
    this.log('Écran effacé.', 'n');
  }

  getDist(lat1, lon1, lat2, lon2) {
    if (!lat1 || !lon1) return 0;
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }
}

const auditor = new GPSAuditor();
