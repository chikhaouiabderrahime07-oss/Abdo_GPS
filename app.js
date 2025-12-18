/**
 * Fleet Tracker Application - INSTANT LOAD VERSION
 * - Non-blocking Geocoding (Fire & Forget)
 * - Parallel Processing
 * - Automatic Maintenance Logic (Garages Only)
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
    
    // We use a temporary map to store results
    const newTrucksMap = new Map();

    // 1. Process ALL trucks simultaneously
    const truckPromises = Object.entries(data).map(async ([deviceId, truck]) => {
      if (!truck.params || truck.loc_valid === '0') return null;

      const config = getTruckConfig(deviceId);
      const displayName = config.alias ? config.alias : truck.name;

      // --- FUEL ---
      const sensorValue = parseFloat(truck.params.io87) || 0;
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

      // --- VIDANGE ---
      const odometerMeters = parseInt(truck.params.io192) || 0;
      const odometerKm = Math.round(odometerMeters / 1000);
      let milestones = [30000, 60000, 90000];
      if (typeof config.vidangeMilestones === 'string') {
        milestones = config.vidangeMilestones.split(',').map(n => parseInt(n.trim())).filter(n => !isNaN(n)).sort((a,b)=>a-b);
      }
      const nextVidangeKm = milestones.find(m => m > odometerKm);
      let kmUntilVidange = nextVidangeKm !== undefined ? nextVidangeKm - odometerKm : 999999;
      let vidangeAlert = nextVidangeKm !== undefined && kmUntilVidange <= config.vidangeAlertKm;

      // --- MAINTENANCE LOGIC ---
      this.checkMaintenanceLogic(deviceId, displayName, parseFloat(truck.lat), parseFloat(truck.lng), odometerKm, nextVidangeKm, kmUntilVidange);

      // --- ALERTS ---
      let alertLevel = 'info';
      if (fuelPercentage <= config.criticalFuelLevel) {
        alertLevel = 'critical';
        this.alerts.critical.push({ deviceId, truck: displayName, type: 'fuel', message: `Critique: ${fuelPercentage}%`, timestamp: new Date().toISOString() });
      }

      // --- LOCATION (NON-BLOCKING) ---
      // 1. Set Default/Loading State
      let location = { city: 'Chargement...', wilaya: '...', formatted: '...', isCustom: false };
      let lastGeocodedCoords = null;
      
      const lat = parseFloat(truck.lat);
      const lng = parseFloat(truck.lng);

      // 2. Reuse previous data if available (Prevent flickering)
      if (this.trucks.has(deviceId)) {
          const prev = this.trucks.get(deviceId);
          location = prev.location;
          lastGeocodedCoords = prev.lastGeocodedCoords;
      }

      // 3. Try INSTANT Cache Check
      if (FLEET_CONFIG.UI.enableGeocoding) {
          const instantLoc = geocodeService.checkCacheInstant(lat, lng);
          if (instantLoc) {
              location = instantLoc;
              lastGeocodedCoords = { lat, lng };
          } else {
              // 4. BACKGROUND FETCH (Fire & Forget)
              // We do NOT await this. We let it run in background.
              // When it finishes, it updates the live map and UI.
              geocodeService.reverseGeocode(lat, lng).then(newLoc => {
                  const liveTruck = this.trucks.get(deviceId);
                  if (liveTruck) {
                      liveTruck.location = newLoc;
                      liveTruck.lastGeocodedCoords = { lat, lng };
                      // Trigger UI Update if visible
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
        isCriticalFuel: fuelPercentage <= config.criticalFuelLevel,
        isLowFuel: fuelPercentage <= config.fuelAlertThreshold,
        hasCalibration,
        coordinates: { lat, lng, altitude: parseInt(truck.altitude) },
        location, 
        lastGeocodedCoords,
        speed: parseInt(truck.speed) || 0,
        odometer: odometerKm,
        vidange: { nextKm: nextVidangeKm || 'Aucune', kmUntilNext: kmUntilVidange, alert: vidangeAlert, alertKm: config.vidangeAlertKm },
        timestamp: truck.dt_server,
        alertLevel,
        route: { canReach: true } // Simplified for brevity
      };
    });

    // Wait for basic calcs (instant), but NOT for geocoding API
    const processedTrucks = await Promise.all(truckPromises);

    processedTrucks.forEach(t => {
        if (t) newTrucksMap.set(t.id, t);
    });

    this.trucks = newTrucksMap;
  }

  // --- HELPERS (Keep existing logic) ---
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
      if (loc.type !== 'maintenance') continue; // STRICT CHECK
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
          if (kmUntilVidange !== null && kmUntilVidange <= 3000) { type = 'Vidange'; note = `Auto: Proche de ${nextVidangeKm}km`; }
          
          this.triggerMaintenanceEvent({ truckName, deviceId, type, location: zoneName, odometer: currentOdo, date: new Date().toISOString(), note, isAuto: true });
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
     } catch(e) { console.error(e); }
  }

  getAllTrucks() { return Array.from(this.trucks.values()); }
  getFleetStats() { 
      const trucks = this.getAllTrucks();
      return { totalTrucks: trucks.length, criticalCount: trucks.filter(t=>t.isCriticalFuel).length, vidangeCount: trucks.filter(t=>t.vidange.alert).length };
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