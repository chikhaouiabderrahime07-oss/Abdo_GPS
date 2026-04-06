/**
 * Fleet Tracker Application - V40 (LOGIC UNIFIED)
 * FIXES:
 *  - checkMaintenanceLogic: now checks BOTH 'maintenance' AND 'douroub' zones
 *  - REMOVED immediate triggerMaintenanceEvent on entry (server handles duration+logging)
 *  - UI zone state: truck now carries inMaintenanceZone + isVidangeCandidate flags
 *  - Removed dead duplicate checkMaintenanceLogic call
 *  - Added inSafeZone flag (at douroub = home base)
 *  - Consistent distance calculation (no geocodeService dependency in hot path)
 */

class FleetTrackerApp {
  constructor() {
    this.trucks = new Map();
    this.isRunning = false;
    this.pollInterval = null;
    this.trackingHistory = [];
    this.maintenanceState = new Map(); // Tracks per-truck zone state for UI
    this.alerts = { critical: [], warning: [], vidange: [], info: [] };
  }

  // ============================================================
  // CORE PROCESSOR
  // ============================================================
  async processTruckData(data) {
    this.alerts = { critical: [], warning: [], vidange: [], info: [] };
    const newTrucksMap = new Map();

    const truckPromises = Object.entries(data).map(async ([deviceId, truck]) => {
      const config = getTruckConfig(deviceId);
      const displayName = config.alias ? config.alias : truck.name;

      // ----------------------------------------------------------
      // 1. GPS SIGNAL HEALTH CHECK (Context-Aware V39)
      // ----------------------------------------------------------
      let rawTime = parseInt(truck.last_gps || truck.timestamp);
      if (!rawTime || isNaN(rawTime)) rawTime = Date.now();
      if (rawTime < 10000000000) rawTime *= 1000; // Convert seconds → ms

      const now = Date.now();
      const minutesSilence = (now - rawTime) / 60000;
      const lastSpeed = parseInt(truck.speed) || 0;

      let isGpsCut = false;
      if (!truck.params) {
        isGpsCut = true; // No data at all = cut
      } else if (lastSpeed > 5) {
        // Moving truck: strict — silence >10min or invalid GPS = cut
        if (minutesSilence > 10 || truck.loc_valid === '0') isGpsCut = true;
      }
      // Stopped truck: relaxed — ignore silence (vacation/parking mode)

      // ----------------------------------------------------------
      // 2. DISPLAY TIMESTAMP
      // ----------------------------------------------------------
      let displayDateISO;
      try { displayDateISO = new Date(rawTime).toISOString(); }
      catch (e) { displayDateISO = new Date().toISOString(); }

      // ----------------------------------------------------------
      // 3. FUEL & SENSORS
      // ----------------------------------------------------------
      const fuelData = calculateFuelMetricsFromParams(truck.params || {}, config);
      let fuelLiters = fuelData.liters || 0;
      let fuelPercentage = fuelData.percent || 0;
      let hasCalibration = !!fuelData.usedCalibration;

      const rangeKm = config.fuelConsumption > 0
        ? Math.round((fuelLiters / config.fuelConsumption) * 100)
        : 0;

      // ----------------------------------------------------------
      // 4. ODOMETER & VIDANGE
      // ----------------------------------------------------------
      const odometerMeters = truck.params ? (parseInt(truck.params.io192) || 0) : 0;
      const odometerKm = Math.round(odometerMeters / 1000);

            // ✅ If a vidange was confirmed, ignore the serviced milestone for alerts
            const skipUntilKm = FLEET_CONFIG.VIDANGE_OVERRIDES?.[deviceId]?.skipUntilKm;
            const vidangeStatus = calculateVidangeStatus(odometerKm, config, skipUntilKm);
      vidangeStatus.alertKm = config.vidangeAlertKm || 5000;
      if (vidangeStatus.kmUntilNext === undefined) vidangeStatus.kmUntilNext = 999999;
      if (vidangeStatus.nextKm === undefined) vidangeStatus.nextKm = 'N/A';

      // ----------------------------------------------------------
      // 5. MAINTENANCE ZONE CHECK (UI only — server handles logging)
      // ----------------------------------------------------------
      const lat = parseFloat(truck.lat);
      const lng = parseFloat(truck.lng);
      const zoneInfo = this.checkMaintenanceLogic(deviceId, displayName, lat, lng, odometerKm, vidangeStatus);

      // ----------------------------------------------------------
      // 6. ALERTS
      // ----------------------------------------------------------
      let alertLevel = 'info';
      if (isGpsCut) {
        alertLevel = 'gps-cut';
      } else {
        if (fuelPercentage <= config.criticalFuelLevel) {
          alertLevel = 'critical';
          this.alerts.critical.push({ deviceId, truck: displayName, type: 'fuel', message: `Critique: ${fuelPercentage}%`, timestamp: displayDateISO });
        } else if (fuelPercentage <= config.fuelAlertThreshold) {
          alertLevel = 'warning';
          this.alerts.warning.push({ deviceId, truck: displayName, type: 'fuel', message: `Bas: ${fuelPercentage}%`, timestamp: displayDateISO });
        }
	        if (vidangeStatus.alert) {
	          const kmUntil = Number(vidangeStatus.kmUntilNext ?? 0);
	          const msg = (kmUntil < 0)
	            ? `Vidange: retard ${Math.abs(kmUntil)}km`
	            : `Vidange: ${kmUntil}km`;
	          this.alerts.vidange.push({ deviceId, truck: displayName, type: 'vidange', message: msg, timestamp: displayDateISO });
	        }
      }

      // ----------------------------------------------------------
      // 7. GEOCODING (smart cache + distance threshold)
      // ----------------------------------------------------------
      let location = { city: 'Chargement...', wilaya: '...', formatted: '...', isCustom: false };
      let lastGeocodedCoords = null;
      let shouldGeocode = (lat !== 0 || lng !== 0);

      if (this.trucks.has(deviceId)) {
        const prev = this.trucks.get(deviceId);
        location = prev.location;
        lastGeocodedCoords = prev.lastGeocodedCoords;
        if (lastGeocodedCoords) {
          const distKm = this._dist(lat, lng, lastGeocodedCoords.lat, lastGeocodedCoords.lng);
          if (distKm < (FLEET_CONFIG.UI.geocodeDistanceThresholdKm || 2) && location.city !== 'Chargement...') {
            shouldGeocode = false;
          }
        }
      }

      if (FLEET_CONFIG.UI.enableGeocoding && shouldGeocode) {
        const instantLoc = geocodeService.checkCacheInstant(lat, lng);
        if (instantLoc) {
          location = instantLoc;
          lastGeocodedCoords = { lat, lng };
        } else {
          geocodeService.reverseGeocode(lat, lng).then(newLoc => {
            const liveTruck = this.trucks.get(deviceId);
            if (liveTruck) {
              liveTruck.location = newLoc;
              liveTruck.lastGeocodedCoords = { lat, lng };
              if (window.ui && window.ui.updateDashboard) window.ui.updateDashboard();
            }
          });
        }
      } else if (lat === 0 && lng === 0) {
        location = { city: 'Position Inconnue', wilaya: 'Hors Ligne', formatted: '0,0', isCustom: false };
      }

      // ----------------------------------------------------------
      // 8. RETURN ENRICHED TRUCK OBJECT
      // ----------------------------------------------------------
      return {
        id: deviceId,
        name: displayName,
        fuelPercentage,
        fuelLiters,
        fuelTankCapacity: fuelData.effectiveCapacity || getConfiguredFuelEffectiveCapacity(config) || config.fuelTankCapacity,
        fuelConsumption: config.fuelConsumption,
        rangeKm,
        isCriticalFuel: fuelPercentage <= config.criticalFuelLevel,
        isLowFuel: fuelPercentage <= config.fuelAlertThreshold,
        hasCalibration,
        coordinates: { lat, lng, altitude: parseInt(truck.altitude) || 0 },
        location,
        lastGeocodedCoords,
        speed: parseInt(truck.speed) || 0,
        angle: parseInt(truck.angle) || 0,
        odometer: odometerKm,
        vidange: vidangeStatus,
        timestamp: displayDateISO,
        alertLevel,
        isGpsCut,
        // 🔧 NEW: Zone state fields for UI indicators
        inMaintenanceZone: zoneInfo.inZone,
        maintenanceZoneName: zoneInfo.zoneName || null,
        isVidangeCandidate: zoneInfo.inZone && vidangeStatus.alert,
        inSafeZone: zoneInfo.isSafe,
        zoneTimeMinutes: zoneInfo.minutesInZone || 0,
        route: { canReach: true }
      };
    });

    const processedTrucks = await Promise.all(truckPromises);
    processedTrucks.forEach(t => { if (t) newTrucksMap.set(t.id, t); });
    this.trucks = newTrucksMap;
  }

  // ============================================================
  // FUEL CALIBRATION CALCULATOR
  // ============================================================
  calculateFuelFromSensor(sensorValue, calibrationTable) {
    if (!calibrationTable || calibrationTable.length < 2) return 0;
    if (sensorValue <= calibrationTable[0].x) return calibrationTable[0].y;
    if (sensorValue >= calibrationTable[calibrationTable.length - 1].x)
      return calibrationTable[calibrationTable.length - 1].y;
    for (let i = 0; i < calibrationTable.length - 1; i++) {
      const p1 = calibrationTable[i], p2 = calibrationTable[i + 1];
      if (sensorValue >= p1.x && sensorValue <= p2.x) {
        const slope = (p2.y - p1.y) / (p2.x - p1.x);
        return Math.round(p1.y + slope * (sensorValue - p1.x));
      }
    }
    return 0;
  }

  // ============================================================
  // 🔧 FIXED: checkMaintenanceLogic
  //
  // WHAT CHANGED vs old version:
  //  1. Only 'maintenance' zones → vidange/maintenance detection
  //     'douroub' zones → isSafe flag only (used by découchage, NOT maintenance)
  //  2. REMOVED triggerMaintenanceEvent call (server.js handles auto-logging via
  //     runVidangeDetection after duration threshold — calling it here caused duplicates)
  //  3. Returns a rich zoneInfo object used to populate truck UI fields
  //  4. Uses internal _dist() instead of geocodeService (more reliable)
  //  5. Tracks isSafe (truck at home base/douroub) for découchage UI
  // ============================================================
  checkMaintenanceLogic(deviceId, truckName, lat, lng, currentOdo, vidangeStatus) {
    const locs = FLEET_CONFIG.CUSTOM_LOCATIONS || [];

    // ✅ CORRECT: Only 'maintenance' zones trigger maintenance/vidange detection
    // 'douroub' = your own site = safe zone for découchage only, NOT a maintenance location
    const eligibleZones = locs.filter(l => l.type === 'maintenance');
    const safeZones     = locs.filter(l => l.type === 'douroub'); // used only for isSafe flag

    // Default return
    const noZone = { inZone: false, zoneName: null, isSafe: false, minutesInZone: 0 };
    if (eligibleZones.length === 0) {
      this.maintenanceState.set(deviceId, { wasInside: false, entryTime: 0, zoneName: null });
      return noZone;
    }

    // Check if inside any eligible zone
    let insideZone = null;
    for (const zone of eligibleZones) {
      const distMeters = this._dist(lat, lng, zone.lat, zone.lng) * 1000;
      if (distMeters <= (zone.radius || 500)) {
        insideZone = zone;
        break;
      }
    }

    // Check if at safe zone (douroub/home base)
    let isSafe = false;
    for (const zone of safeZones) {
      const distMeters = this._dist(lat, lng, zone.lat, zone.lng) * 1000;
      if (distMeters <= (zone.radius || 500)) { isSafe = true; break; }
    }

    // State management
    if (!this.maintenanceState.has(deviceId)) {
      this.maintenanceState.set(deviceId, { wasInside: false, entryTime: 0, zoneName: null });
    }
    const state = this.maintenanceState.get(deviceId);

    if (insideZone) {
      if (!state.wasInside) {
        // ENTRY — just log to console, DO NOT call API (server handles after duration)
        state.wasInside = true;
        state.entryTime = Date.now();
        state.zoneName = insideZone.name;
        console.log(`📍 ${truckName} → Zone: ${insideZone.name} (${insideZone.type})`);
      }
      const minutesInZone = Math.round((Date.now() - state.entryTime) / 60000);
      return { inZone: true, zoneName: insideZone.name, isSafe, minutesInZone };
    } else {
      if (state.wasInside) {
        // EXIT
        const durationMins = Math.round((Date.now() - state.entryTime) / 60000);
        console.log(`🏁 ${truckName} exited zone: ${state.zoneName} (${durationMins}min)`);
        state.wasInside = false;
        state.entryTime = 0;
        state.zoneName = null;
      }
      return { inZone: false, zoneName: null, isSafe, minutesInZone: 0 };
    }
  }

  // ============================================================
  // INTERNAL HELPERS
  // ============================================================

  // Haversine distance in KM (no external dependency)
  _dist(lat1, lng1, lat2, lng2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  // ============================================================
  // FLEET DATA GETTERS
  // ============================================================
  getAllTrucks() { return Array.from(this.trucks.values()); }

  getFleetStats() {
    const trucks = this.getAllTrucks();
    return {
      totalTrucks: trucks.length,
      criticalCount: trucks.filter(t => t.isCriticalFuel).length,
      vidangeCount: trucks.filter(t => t.vidange.alert).length,
      gpsCutCount: trucks.filter(t => t.isGpsCut).length,
      inMaintenanceCount: trucks.filter(t => t.inMaintenanceZone).length,
      vidangeCandidateCount: trucks.filter(t => t.isVidangeCandidate).length
    };
  }

  getTrucksByWilaya() {
    const g = {};
    this.getAllTrucks().forEach(t => {
      const w = t.location.wilaya || 'Inconnu';
      if (!g[w]) g[w] = [];
      g[w].push(t);
    });
    return g;
  }

  getTrucksByCity() {
    const g = {};
    this.getAllTrucks().forEach(t => {
      const c = t.location.city || 'Inconnu';
      if (!g[c]) g[c] = [];
      g[c].push(t);
    });
    return g;
  }

  recordHistory() {
    this.trackingHistory.push({ timestamp: new Date().toISOString(), trucks: this.getAllTrucks() });
  }

  exportCSV() {
    return "Date,Camion,Fuel,KM\n" +
      this.getAllTrucks().map(t => `${new Date().toISOString()},${t.name},${t.fuelLiters},${t.odometer}`).join("\n");
  }

  exportJSON() { return JSON.stringify(this.getAllTrucks()); }
}

const app = new FleetTrackerApp();
