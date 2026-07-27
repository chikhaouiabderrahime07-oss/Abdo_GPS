const fs = require('fs');
let s = fs.readFileSync('c:/Users/ABDOU/Desktop/Telegram/before ma/ui.js', 'utf8');

s = s.replace(/status === 'done' \|\| status === 'completed'/g, "status === 'done' || status === 'completed' || status === 'termine' || status === 'terminé'");
s = s.replace(/status === 'cancelled'/g, "status === 'cancelled' || status === 'annule' || status === 'annulé'");

fs.writeFileSync('c:/Users/ABDOU/Desktop/Telegram/before ma/ui.js', s);
console.log('Fixed ui.js status strings');
