const fs = require('fs');
let c = fs.readFileSync('server.js', 'utf8');

c = c.replace(/zone\$1100/g, 'zone.radius || 100');
c = c.replace(/geofence\$1100/g, 'geofenceRadiusMeters || 100');
c = c.replace(/loc\$1100/g, 'loc.radius || 100');
c = c.replace(/zoneConf\$1100/g, 'zoneConf.radius || 100');
c = c.replace(/pz\$1100/g, 'pz.radius || 100');
c = c.replace(/z\$1100/g, 'z.radius || 100');
c = c.replace(/parseFloat\(loc\.radius\)\s*\|\|\s*500/g, 'parseFloat(loc.radius) || 100');
c = c.replace(/parseFloat\(zoneConf\.radius\)\s*\|\|\s*500/g, 'parseFloat(zoneConf.radius) || 100');

fs.writeFileSync('server.js', c);
console.log('Fixed server.js');
