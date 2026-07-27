const fs = require('fs');
let s = fs.readFileSync('c:/Users/ABDOU/Desktop/Telegram/before ma/config.js', 'utf8');

const targetStr = `
        } else {
            // No history but truck is past startKm: compute virtual rotation
            // so we don't flag every truck with high odometer as URGENT
            const rotsPassed = Math.floor((odo - startKm) / rotKm);
            nextKm = startKm + (rotsPassed + 1) * rotKm;
        }`;

const newStr = `
        } else {
            // No history but truck is past startKm: compute virtual rotation
            const rotsPassed = Math.floor((odo - startKm) / rotKm);
            const prevKm = startKm + rotsPassed * rotKm;
            // If the truck is overdue for the PREVIOUS virtual rotation by less than half a rotation (e.g. < 12500 km),
            // we assume it missed it and flag it as URGENT (nextKm = prevKm).
            // Otherwise, we assume it was done and we target the next rotation.
            if ((odo - prevKm) <= (rotKm / 2)) {
                nextKm = prevKm;
            } else {
                nextKm = startKm + (rotsPassed + 1) * rotKm;
            }
        }`;

if (s.includes(targetStr)) {
    s = s.replace(targetStr, newStr);
    fs.writeFileSync('c:/Users/ABDOU/Desktop/Telegram/before ma/config.js', s);
    console.log('Fixed config.js virtual rotation logic!');
} else {
    console.log('Target string not found in config.js');
}

// Bump config.js version in index.html
let idx = fs.readFileSync('c:/Users/ABDOU/Desktop/Telegram/before ma/index.html', 'utf8');
idx = idx.replace(/config\.js(\?v=[0-9]+)?/g, 'config.js?v=' + Date.now());
fs.writeFileSync('c:/Users/ABDOU/Desktop/Telegram/before ma/index.html', idx);
console.log('Bumped config.js in index.html');
