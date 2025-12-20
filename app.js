/**
 * Fleet Tracker Application - FULL VERSION
 * - Parallel Processing (Instant Load)
 * - 2KM Movement Optimization (Strict)
 * - Automatic Maintenance Logic (Garages Only)
 * - Full Calibration Support
 * - FIXED: SHOW ALL TRUCKS (Including GPS Cut)
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

  // --- CORE PROCESSOR (PARALLEL) ---
  async processTruckData(data) {
    this.alerts = { critical: [], warning: [], vidange: [], info: [] };
    const newTrucksMap = new Map();

    // 1. Process ALL trucks simultaneously
    const truckPromises = Object.entries(data).map(async ([deviceId, truck]) => {
      // ⚠️ REMOVED FILTER: Now processing ALL trucks
      
      const config = getTruckConfig(deviceId);
      const displayName = config.alias ? config.alias : truck.name;

// DETECT GPS CUT / INVALID DATA
      // If loc_valid is 0 OR params are missing, we consider it a GPS Cut
      const isGpsCut = (truck.loc_valid === '0' || !truck.params);

      // 🇩🇿 ALGERIA TIMEZONE PATCH (GMT+1)
      // We take the GPS timestamp, convert to MS, and add 1 Hour (3,600,000 ms)
// 🇩🇿 ALGERIA TIMEZONE PATCH (GMT+1) - CRASH PROOF VERSION
// 🇩🇿 TIMEZONE FIX: STANDARD (Browser handles +1)
      let rawTime = parseInt(truck.last_gps || truck.timestamp);
      
      // 🛡️ SAFETY 1: Crash Prevention (If GPS sends junk, use Now)
      if (!rawTime || isNaN(rawTime)) {
          rawTime = Date.now(); 
      }

      // 🛡️ SAFETY 2: Convert Seconds to Milliseconds
      if (rawTime < 10000000000) rawTime *= 1000;
      
      // 🟢 REMOVED THE MANUAL +1 HOUR (Browser will do it)
      const algeriaTimeMs = rawTime; 
      
      let algeriaDateISO;
      try {
          algeriaDateISO = new Date(algeriaTimeMs).toISOString();
      } catch (e) {
          algeriaDateISO = new Date().toISOString();
      }
	  
      // --- FUEL CALCULATION (With Calibration) ---
      // Safety check: truck.params might be null
      const sensorValue = truck.params ? (parseFloat(truck.params.io87) || 0) : 0;
      let fuelLiters = 0;
      let fuelPercentage = 0;
      let hasCalibration = false;

      if (config.calibration && config.calibration.length > 1) {
        // Use full interpolation helper
        fuelLiters = this.calculateFuelFromSensor(sensorValue, config.calibration);
        fuelPercentage = Math.round((fuelLiters / config.fuelTankCapacity) * 100);
        hasCalibration = true;
      } else {
        // Fallback to simple percentage
        fuelPercentage = parseInt(sensorValue);
        fuelLiters = Math.round((fuelPercentage / 100) * config.fuelTankCapacity);
      }

      // --- AUTONOMY (RANGE) CALCULATION ---
      let rangeKm = 0;
      if (config.fuelConsumption > 0) {
        rangeKm = Math.round((fuelLiters / config.fuelConsumption) * 100);
      }

      // --- VIDANGE CALCULATION ---
      // Safety check for odometer
      const odometerMeters = truck.params ? (parseInt(truck.params.io192) || 0) : 0;
      const odometerKm = Math.round(odometerMeters / 1000);
      
      // Use config helper
      const vidangeStatus = calculateVidangeStatus(odometerKm, config);
      
      // Inject alertKm so UI filters can read it
      vidangeStatus.alertKm = config.vidangeAlertKm || 5000;

      // Ensure numeric values for sorting
      if (vidangeStatus.kmUntilNext === undefined) vidangeStatus.kmUntilNext = 999999;
      if (vidangeStatus.nextKm === undefined) vidangeStatus.nextKm = 'N/A';
      
      const nextVidangeKm = vidangeStatus.nextKm;
      const kmUntilVidange = vidangeStatus.kmUntilNext;
      const vidangeAlert = vidangeStatus.alert;

      // --- AUTOMATIC MAINTENANCE LOGIC ---
      this.checkMaintenanceLogic(deviceId, displayName, parseFloat(truck.lat), parseFloat(truck.lng), odometerKm, nextVidangeKm, kmUntilVidange);

      // --- ALERTS ---
      let alertLevel = 'info';
      
      if (isGpsCut) {
          alertLevel = 'gps-cut'; // Special level for UI
      } else {
          if (fuelPercentage <= config.criticalFuelLevel) {
            alertLevel = 'critical';
            this.alerts.critical.push({ deviceId, truck: displayName, type: 'fuel', message: `Critique: ${fuelPercentage}%`, timestamp: new Date().toISOString() });
          } else if (fuelPercentage <= config.fuelAlertThreshold) {
            alertLevel = 'warning';
            this.alerts.warning.push({ deviceId, truck: displayName, type: 'fuel', message: `Bas: ${fuelPercentage}%`, timestamp: new Date().toISOString() });
          }

          if (vidangeAlert) {
             this.alerts.vidange.push({ deviceId, truck: displayName, type: 'vidange', message: `Vidange: ${kmUntilVidange}km restants`, timestamp: new Date().toISOString() });
          }
      }

      // --- LOCATION LOGIC (SMART GEOCODING) ---
      let location = { city: 'Chargement...', wilaya: '...', formatted: '...', isCustom: false };
      let lastGeocodedCoords = null;
      
      const lat = parseFloat(truck.lat);
      const lng = parseFloat(truck.lng);
      
      // If coordinates are 0,0 (invalid), don't try to geocode
      let shouldGeocode = (lat !== 0 || lng !== 0);

      // 1. Reuse previous data if available
      if (this.trucks.has(deviceId)) {
          const prev = this.trucks.get(deviceId);
          location = prev.location;
          lastGeocodedCoords = prev.lastGeocodedCoords;

          // 2. CHECK DISTANCE (2KM RULE)
          if (lastGeocodedCoords) {
              const distMeters = geocodeService.getDistanceMeters(lat, lng, lastGeocodedCoords.lat, lastGeocodedCoords.lng);
              const distKm = distMeters / 1000;
              const threshold = FLEET_CONFIG.UI.geocodeDistanceThresholdKm || 2; 
              
              if (distKm < threshold && location.city !== 'Chargement...') {
                  shouldGeocode = false;
              }
          }
      }

      // 3. EXECUTE GEOCODING (If needed and valid)
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
        timestamp: algeriaDateISO, // 🇩🇿 Uses the corrected Algeria Time
        alertLevel,
        isGpsCut: isGpsCut, // EXPORT FLAG TO UI
        route: { canReach: true }
      };
    });

    const processedTrucks = await Promise.all(truckPromises);
    processedTrucks.forEach(t => { if (t) newTrucksMap.set(t.id, t); });
    this.trucks = newTrucksMap;
  }

  // --- HELPERS (Logic) ---

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
    // ⚠️ DISABLED: Logic moved to server.js (FleetBot) to prevent date resets on page refresh.
    // This function is intentionally empty to stop the browser from creating logs.
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
          gpsCutCount: trucks.filter(t=>t.isGpsCut).length // ADDED THIS STAT
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