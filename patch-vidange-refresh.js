const fs = require('fs');

// Patch app.js
let appJs = fs.readFileSync('c:/Users/ABDOU/Desktop/Telegram/before ma/app.js', 'utf8');
const appPatch = `  forceRecalculateVidanges() {
    if (!this.trucks) return;
    this.trucks.forEach(truck => {
      const config = typeof getTruckConfig === 'function' ? getTruckConfig(truck.id) : (FLEET_CONFIG.DEFAULT_TRUCK_CONFIG || {});
      const odometerKm = truck.odometer || 0;
      const ovr = FLEET_CONFIG.vidangeOverrides ? FLEET_CONFIG.vidangeOverrides[truck.id] : null; 
      const skipUntilKm = ovr ? (ovr.lastVidangeKm || ovr.odometerAtConfirm || ovr.skipUntilKm || null) : null;
      const vidangeStatus = typeof calculateVidangeStatus === 'function' ? calculateVidangeStatus(odometerKm, config, skipUntilKm) : truck.vidange;
      vidangeStatus.alertKm = config.vidangeAlertKm || 5000;
      if (vidangeStatus.kmUntilNext === undefined) vidangeStatus.kmUntilNext = 999999;
      if (vidangeStatus.nextKm === undefined) vidangeStatus.nextKm = 'N/A';
      truck.vidange = vidangeStatus;
      
      if (typeof this.checkMaintenanceLogic === 'function') {
        const zoneInfo = this.checkMaintenanceLogic(truck.id, truck.name, parseFloat(truck.lat)||0, parseFloat(truck.lng)||0, odometerKm, vidangeStatus);
        truck.isVidangeCandidate = zoneInfo.inZone && vidangeStatus.alert;
      }
    });
  }

  getTrucksByWilaya() {`;
if (!appJs.includes('forceRecalculateVidanges() {') && appJs.includes('getTrucksByWilaya() {')) {
    appJs = appJs.replace('getTrucksByWilaya() {', appPatch);
    fs.writeFileSync('c:/Users/ABDOU/Desktop/Telegram/before ma/app.js', appJs);
    console.log('Patched app.js');
} else {
    console.log('app.js already patched or target not found');
}

// Patch ui.js (Resync Button)
let uiJs = fs.readFileSync('c:/Users/ABDOU/Desktop/Telegram/before ma/ui.js', 'utf8');

const t1 = `          if (typeof this.syncSettings === 'function') {
            await this.syncSettings();
          }
          if (typeof this.renderVidangeSection === 'function') {
            this.renderVidangeSection();
          }`;
const r1 = `          if (typeof this.syncSettings === 'function') {
            await this.syncSettings();
          }
          if (typeof app !== 'undefined' && typeof app.forceRecalculateVidanges === 'function') {
            app.forceRecalculateVidanges();
          }
          if (typeof this.renderVidangeSection === 'function') {
            this.renderVidangeSection();
          }`;

if (uiJs.includes(t1)) { uiJs = uiJs.replace(t1, r1); console.log('Patched ui.js Resync button'); }

// Patch ui.js (Delete button)
const t2 = `      if (typeof this.syncSettings === 'function') {
         await this.syncSettings();
      }
      if (typeof this.renderVidangeSection === 'function') {
         this.renderVidangeSection();
      }`;
const r2 = `      if (typeof this.syncSettings === 'function') {
         await this.syncSettings();
      }
      if (typeof app !== 'undefined' && typeof app.forceRecalculateVidanges === 'function') {
         app.forceRecalculateVidanges();
      }
      if (typeof this.renderVidangeSection === 'function') {
         this.renderVidangeSection();
      }`;

if (uiJs.includes(t2)) { uiJs = uiJs.replace(t2, r2); console.log('Patched ui.js Delete button'); }

fs.writeFileSync('c:/Users/ABDOU/Desktop/Telegram/before ma/ui.js', uiJs);

let idx = fs.readFileSync('c:/Users/ABDOU/Desktop/Telegram/before ma/index.html', 'utf8');
idx = idx.replace(/app\.js(\?v=[0-9]+)?/g, 'app.js?v=' + Date.now());
idx = idx.replace(/ui\.js(\?v=[0-9]+)?/g, 'ui.js?v=' + Date.now());
fs.writeFileSync('c:/Users/ABDOU/Desktop/Telegram/before ma/index.html', idx);
console.log('Bumped index.html');
