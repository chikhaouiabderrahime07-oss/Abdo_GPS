/**
 * Fleet Tracker Application - V39 (CONTEXT AWARE)
 * - "Parked Protection": Stopped trucks NEVER trigger Red Alerts (Fixes Vacation Mode).
 * - "Moving Strictness": Only Moving trucks (>5km/h) trigger Cut Alerts.
 * - Timezone: Standard Browser Handling (No manual offset).
 */

class FleetTrackerApp {
  constructor() {
    this.trucks = new Map();
    this.isRunning = false;
    this.pollInterval = null;
    this.trackingHistory = [];
    this.maintenanceState = new Map();
    this.alerts = { critical: [], warning: [], vidange: [], info: [] };
    this.destination = FLEET_CONFIG.DEFAULT_DESTINATION;
  }

  // --- CORE PROCESSOR ---
  async processTruckData(data) {
    this.alerts = { critical: [], warning: [], vidange: [], info: [] };
    const newTrucksMap = new Map();

    const truckPromises = Object.entries(data).map(async ([deviceId, truck]) => {
      
      const config = getTruckConfig(deviceId);
      const displayName = config.alias ? config.alias : truck.name;

      // -----------------------------------------------------------
      // 1. INTELLIGENT LOGIC V39
      // -----------------------------------------------------------
      let rawTime = parseInt(truck.last_gps || truck.timestamp);
      
      // Safety: If time is missing/corrupt, use NOW (prevents crashes)
      // But we DO NOT flag this as a cut anymore to avoid false positives on old devices.
      if (!rawTime || isNaN(rawTime)) { 
          rawTime = Date.now(); 
      }
      if (rawTime < 10000000000) rawTime *= 1000;

      const now = Date.now();
      const timeSinceLastSignal = now - rawTime;
      const minutesSilence = timeSinceLastSignal / 60000;
      const lastSpeed = parseInt(truck.speed) || 0;

      // --- THE CONTEXT CHECK ---
      let isGpsCut = false;

      // CASE A: TRUCK WAS MOVING
      if (lastSpeed > 5) {
          // If moving, we are STRICT.
          // 1. Silent for > 10 mins? -> CUT.
          // 2. GPS says "Invalid"? -> CUT.
          if (minutesSilence > 10 || truck.loc_valid === '0') {
              isGpsCut = true;
          }
      } 
      // CASE B: TRUCK WAS STOPPED (The Vacation Fix)
      else {
          // If stopped, we are RELAXED.
          // We IGNORE silence. We IGNORE loc_valid=0.
          // It stays "Online" (Green) or "Parked".
          isGpsCut = false; 
      }

      // Universal Fail: If packet has NO data at all
      if (!truck.params) isGpsCut = true;

      // -----------------------------------------------------------
      // 2. DISPLAY TIME
      // -----------------------------------------------------------
      let displayDateISO;
      try {
          displayDateISO = new Date(rawTime).toISOString();
      } catch (e) {
          displayDateISO = new Date().toISOString();
      }

      // -----------------------------------------------------------
      // 3. FUEL & SENSORS
      // -----------------------------------------------------------
      const sensorValue = truck.params ? (parseFloat(truck.params.io87) || 0) : 0;
      let fuelLiters = 0;
      let fuelPercentage = 0;
      let hasCalibration = false;

      if (config.calibration && config.calibration.length > 1) {
        fuelLiters = this.calculateFuelFromSensor(sensorValue, config.calibration);
        fuelPercentage = Math.round((fuelLiters / config.fuelTankCapacity) * 100);
        hasCalibration = true;
      } else {
        fuelPercentage = parseInt(sensorValue);
        fuelLiters = Math.round((fuelPercentage / 100) * config.fuelTankCapacity);
      }

      let rangeKm = 0;
      if (config.fuelConsumption > 0) {
        rangeKm = Math.round((fuelLiters / config.fuelConsumption) * 100);
      }

      // -----------------------------------------------------------
      // 4. MAINTENANCE
      // -----------------------------------------------------------
      const odometerMeters = truck.params ? (parseInt(truck.params.io192) || 0) : 0;
      const odometerKm = Math.round(odometerMeters / 1000);
      
      const vidangeStatus = calculateVidangeStatus(odometerKm, config);
      vidangeStatus.alertKm = config.vidangeAlertKm || 5000;

      if (vidangeStatus.kmUntilNext === undefined) vidangeStatus.kmUntilNext = 999999;
      if (vidangeStatus.nextKm === undefined) vidangeStatus.nextKm = 'N/A';
      
      const nextVidangeKm = vidangeStatus.nextKm;
      const kmUntilVidange = vidangeStatus.kmUntilNext;
      const vidangeAlert = vidangeStatus.alert;

      this.checkMaintenanceLogic(deviceId, displayName, parseFloat(truck.lat), parseFloat(truck.lng), odometerKm, nextVidangeKm, kmUntilVidange);

      // -----------------------------------------------------------
      // 5. ALERTS & STATUS
      // -----------------------------------------------------------
      let alertLevel = 'info';
      
      if (isGpsCut) {
          alertLevel = 'gps-cut'; // Red/Grey
      } else {
          // Normal logic for online trucks
          if (fuelPercentage <= config.criticalFuelLevel) {
            alertLevel = 'critical';
            this.alerts.critical.push({ deviceId, truck: displayName, type: 'fuel', message: `Critique: ${fuelPercentage}%`, timestamp: new Date().toISOString() });
          } else if (fuelPercentage <= config.fuelAlertThreshold) {
            alertLevel = 'warning';
            this.alerts.warning.push({ deviceId, truck: displayName, type: 'fuel', message: `Bas: ${fuelPercentage}%`, timestamp: new Date().toISOString() });
          }

          if (vidangeAlert) {
             this.alerts.vidange.push({ deviceId, truck: displayName, type: 'vidange', message: `Vidange: ${kmUntilVidange}km`, timestamp: new Date().toISOString() });
          }
      }

      // -----------------------------------------------------------
      // 6. GEOCODING
      // -----------------------------------------------------------
      let location = { city: 'Chargement...', wilaya: '...', formatted: '...', isCustom: false };
      let lastGeocodedCoords = null;
      const lat = parseFloat(truck.lat);
      const lng = parseFloat(truck.lng);
      let shouldGeocode = (lat !== 0 || lng !== 0);

      if (this.trucks.has(deviceId)) {
          const prev = this.trucks.get(deviceId);
          location = prev.location;
          lastGeocodedCoords = prev.lastGeocodedCoords;

          if (lastGeocodedCoords) {
              const distMeters = geocodeService.getDistanceMeters(lat, lng, lastGeocodedCoords.lat, lastGeocodedCoords.lng);
              const distKm = distMeters / 1000;
              const threshold = FLEET_CONFIG.UI.geocodeDistanceThresholdKm || 2; 
              if (distKm < threshold && location.city !== 'Chargement...') shouldGeocode = false;
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

      // -----------------------------------------------------------
      // 7. RETURN
      // -----------------------------------------------------------
      return {
        id: deviceId,
        name: displayName,
        fuelPercentage,
        fuelLiters,
        fuelTankCapacity: config.fuelTankCapacity,
        fuelConsumption: config.fuelConsumption,
        rangeKm: rangeKm, 
        isCriticalFuel: fuelPercentage <= config.criticalFuelLevel,
        isLowFuel: fuelPercentage <= config.fuelAlertThreshold,
        hasCalibration,
        coordinates: { lat, lng, altitude: parseInt(truck.altitude) },
        location, 
        lastGeocodedCoords,
        speed: parseInt(truck.speed) || 0,
        angle: parseInt(truck.angle) || 0,
        odometer: odometerKm,
        vidange: vidangeStatus,
        timestamp: displayDateISO, 
        alertLevel,
        isGpsCut: isGpsCut,
        route: { canReach: true }
      };
    });

    const processedTrucks = await Promise.all(truckPromises);
    processedTrucks.forEach(t => { if (t) newTrucksMap.set(t.id, t); });
    this.trucks = newTrucksMap;
  }

  calculateFuelFromSensor(sensorValue, calibrationTable) {
    if (!calibrationTable || calibrationTable.length < 2) return 0;
    if (sensorValue <= calibrationTable[0].x) return calibrationTable[0].y;
    if (sensorValue >= calibrationTable[calibrationTable.length - 1].x) return calibrationTable[calibrationTable.length - 1].y;

    for (let i = 0; i < calibrationTable.length - 1; i++) {
      const p1 = calibrationTable[i];
      const p2 = calibrationTable[i+1];
      if (sensorValue >= p1.x && sensorValue <= p2.x) {
        const slope = (p2.y - p1.y) / (p2.x - p1.x);
        return Math.round(p1.y + slope * (sensorValue - p1.x));
      }
    }
    return 0;
  }

  checkMaintenanceLogic(deviceId, truckName, lat, lng, currentOdo, nextVidangeKm, kmUntilVidange) {
    return;
  }

  async triggerMaintenanceEvent(data) {
     try {
        const res = await fetch(`${FLEET_CONFIG.API.baseUrl}/api/maintenance/add`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data)
        });
        if(res.ok && window.ui && window.ui.fetchAndRenderMaintenance) window.ui.fetchAndRenderMaintenance();
     } catch(e) { console.error("Auto-Maint Error:", e); }
  }

  getAllTrucks() { return Array.from(this.trucks.values()); }
  getFleetStats() { 
      const trucks = this.getAllTrucks();
      return { 
          totalTrucks: trucks.length, 
          criticalCount: trucks.filter(t=>t.isCriticalFuel).length, 
          vidangeCount: trucks.filter(t=>t.vidange.alert).length,
          gpsCutCount: trucks.filter(t=>t.isGpsCut).length 
      };
  }
  
  getTrucksByWilaya() { 
      const g = {}; 
      this.getAllTrucks().forEach(t=>{ const w = t.location.wilaya || 'Inconnu'; if(!g[w]) g[w]=[]; g[w].push(t); });
      return g;
  }
  getTrucksByCity() {
      const g = {};
      this.getAllTrucks().forEach(t=>{ const c = t.location.city || 'Inconnu'; if(!g[c]) g[c]=[]; g[c].push(t); });
      return g;
  }
  
  recordHistory() { this.trackingHistory.push({ timestamp: new Date().toISOString(), trucks: this.getAllTrucks() }); }
  
  exportCSV() { return "Date,Camion,Fuel\n" + this.getAllTrucks().map(t=>`${new Date().toISOString()},${t.name},${t.fuelLiters}`).join("\n"); }
  exportJSON() { return JSON.stringify(this.getAllTrucks()); }
}

const app = new FleetTrackerApp();