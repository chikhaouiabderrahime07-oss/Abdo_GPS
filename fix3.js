const fs = require('fs');
let c = fs.readFileSync('server.js', 'utf8');

c = c.replace(/parseFloat\(loc\.radius \|\| 100\)/g, 'parseFloat(loc.radius) || 100');
c = c.replace(/parseFloat\(loc\.radius\s*\|\|\s*100\)/g, 'parseFloat(loc.radius) || 100');
c = c.replace(/\(parseFloat\(loc\.radius \|\| 100\)/g, '(parseFloat(loc.radius) || 100)');
c = c.replace(/\(parseFloat\(loc\.radius \|\| 100/g, '(parseFloat(loc.radius) || 100');
c = c.replace(/parseFloat\(zoneConf\.radius \|\| 100\)/g, 'parseFloat(zoneConf.radius) || 100');
c = c.replace(/parseFloat\(zoneConf\.radius \|\| 100/g, 'parseFloat(zoneConf.radius) || 100');

fs.writeFileSync('server.js', c);
console.log('Fixed parseFloats again');
