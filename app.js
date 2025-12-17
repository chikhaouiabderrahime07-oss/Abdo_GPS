/**
 * Fleet Tracker Application - FULL VERSION
 * - Parallel Processing (Instant Load)
 * - 2KM Movement Optimization (Strict)
 * - Automatic Maintenance Logic (Garages Only)
 * - Full Calibration Support
 * - FIXED: Vidange Filters & Autonomy Calculation
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
      if (!truck.params || truck.loc_valid === '0') return null;

      const config = getTruckConfig(deviceId);
      const displayName = config.alias ? config.alias : truck.name;

      // --- FUEL CALCULATION (With Calibration) ---
      const sensorValue = parseFloat(truck.params.io87) || 0;
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

      // --- VIDANGE CALCULATION (FIXED FOR FILTERS) ---
      const odometerMeters = parseInt(truck.params.io192) || 0;
      const odometerKm = Math.round(odometerMeters / 1000);
      
      // Use config helper
      const vidangeStatus = calculateVidangeStatus(odometerKm, config);
      
      // ⚠️ IMPORTANT FIX: Inject alertKm so UI filters can read it
      vidangeStatus.alertKm = config.vidangeAlertKm || 5000;

      // ⚠️ IMPORTANT FIX: Ensure numeric values for sorting
      if (vidangeStatus.kmUntilNext === undefined) vidangeStatus.kmUntilNext = 999999; // Sort to bottom
      if (vidangeStatus.nextKm === undefined) vidangeStatus.nextKm = 'N/A';
      
      const nextVidangeKm = vidangeStatus.nextKm;
      const kmUntilVidange = vidangeStatus.kmUntilNext;
      const vidangeAlert = vidangeStatus.alert;

      // --- AUTOMATIC MAINTENANCE LOGIC ---
      this.checkMaintenanceLogic(deviceId, displayName, parseFloat(truck.lat), parseFloat(truck.lng), odometerKm, nextVidangeKm, kmUntilVidange);

      // --- ALERTS ---
      let alertLevel = 'info';
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

      // --- LOCATION LOGIC (SMART GEOCODING) ---
      let location = { city: 'Chargement...', wilaya: '...', formatted: '...', isCustom: false };
      let lastGeocodedCoords = null;
      
      const lat = parseFloat(truck.lat);
      const lng = parseFloat(truck.lng);
      let shouldGeocode = true;

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

      // 3. EXECUTE GEOCODING (If needed)
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
      }

      return {
        id: deviceId,
        name: displayName,
        fuelPercentage,
        fuelLiters,
        fuelTankCapacity: config.fuelTankCapacity,
        fuelConsumption: config.fuelConsumption,
        rangeKm: rangeKm, // Added Range
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
        timestamp: truck.dt_server,
        alertLevel,
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
    if (!FLEET_CONFIG.CUSTOM_LOCATIONS) return;
    let inMaintenanceZone = false;
    let zoneName = '';

    for (const loc of FLEET_CONFIG.CUSTOM_LOCATIONS) {
      if (loc.type !== 'maintenance') continue; 
      const dist = geocodeService.getDistanceMeters(lat, lng, loc.lat, loc.lng);
      if (dist <= (loc.radius || 500)) {
        inMaintenanceZone = true;
        zoneName = loc.name;
        break;
      }
    }

    if (inMaintenanceZone) {
      const now = Date.now();
      if (!this.maintenanceState.has(deviceId)) {
        this.maintenanceState.set(deviceId, { entryTime: now, locationName: zoneName, hasTriggered: false });
      } else {
        const state = this.maintenanceState.get(deviceId);
        const durationMinutes = (now - state.entryTime) / 60000;
        
        if (durationMinutes >= FLEET_CONFIG.MAINTENANCE_RULES.minDurationMinutes && !state.hasTriggered) {
          let type = 'Plaquettes';
          let note = 'Détecté automatiquement (>60min)';
          const tolerance = FLEET_CONFIG.MAINTENANCE_RULES.vidangeKmTolerance || 3000;
          
          if (kmUntilVidange !== null && kmUntilVidange <= tolerance) { 
              type = 'Vidange'; 
              note = `Auto: Proche de ${nextVidangeKm}km`; 
          }
          
          this.triggerMaintenanceEvent({ 
              truckName, deviceId, type, location: zoneName, 
              odometer: currentOdo, date: new Date().toISOString(), 
              note, isAuto: true 
          });
          
          state.hasTriggered = true;
          this.maintenanceState.set(deviceId, state);
        }
      }
    } else {
      if (this.maintenanceState.has(deviceId)) this.maintenanceState.delete(deviceId);
    }
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
          vidangeCount: trucks.filter(t=>t.vidange.alert).length 
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