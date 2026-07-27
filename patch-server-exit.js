const fs = require('fs');
const lines = fs.readFileSync('c:/Users/ABDOU/Desktop/Telegram/before ma/server.js', 'utf8').split('\n');

const startIndex = 4248; // line 4249 is index 4248
const endIndex = 4269; // line 4270 is index 4269

const newLines = `  // ── OUTSIDE ALL ZONES ────────────────────────────────────────
  } else if (prevZoneName) {

    // Dual-threshold exit logic (No speed guard)
    let prevZoneRadius = 500;
    let prevZoneDist = 999999;
    const pz = allZones.find(z => z.name === prevZoneName);
    if (pz) {
      prevZoneRadius = pz.radius || 500;
      prevZoneDist = calculateDistance(lat, lng, parseFloat(pz.lat), parseFloat(pz.lng));
    }

    const hardExitDist = prevZoneRadius + 200; 
    const isHardExit = (prevZoneDist >= hardExitDist);

    if (isHardExit) {
      // INSTANT EXIT
      console.log(\`✅ [Exit-Hard] \${truckName} is \${prevZoneDist.toFixed(0)}m away (limit: \${hardExitDist}m). Immediate exit from "\${prevZoneName}".\`);
      await logZoneExit(deviceId, truckName, prevZoneName, lat, lng);
      await Truck.findOneAndUpdate({ deviceId }, {
        _zoneEventZone: null, needsHistoryScan: true,
        $unset: { pendingExitTime: 1, pendingExitZone: 1 }
      });
    } else {
      // FUZZ ZONE (between radius and radius+200) -> Wait 3 minutes
      if (!dbTruck.pendingExitTime) {
        console.log(\`⏳ [Exit-Pending] \${truckName} left "\${prevZoneName}" but is only \${prevZoneDist.toFixed(0)}m away. 3-min countdown started...\`);
        await Truck.findOneAndUpdate({ deviceId }, { pendingExitTime: Date.now(), pendingExitZone: prevZoneName });
      } else {
        const minutesOutside = (Date.now() - dbTruck.pendingExitTime) / 60000;
        if (minutesOutside >= 3) {
          console.log(\`✅ [Exit-Confirmed] \${truckName} confirmed out of "\${prevZoneName}" for \${minutesOutside.toFixed(1)} min.\`);
          await logZoneExit(deviceId, truckName, prevZoneName, lat, lng);
          await Truck.findOneAndUpdate({ deviceId }, {
            _zoneEventZone: null, needsHistoryScan: true,
            $unset: { pendingExitTime: 1, pendingExitZone: 1 }
          });
        }
      }
    }
  }
}`.split('\n');

lines.splice(startIndex, (endIndex - startIndex + 1), ...newLines);
fs.writeFileSync('c:/Users/ABDOU/Desktop/Telegram/before ma/server.js', lines.join('\n'));
console.log('Replaced by line indices successfully!');
