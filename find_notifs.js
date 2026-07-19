const fs = require('fs');
const lines = fs.readFileSync('index.html', 'utf8').split('\n');

console.log("--- SEARCHING FOR notificationList ---");
for(let i=0; i<lines.length; i++) {
  if (lines[i].includes('notificationList')) {
    console.log('Line ' + i + ': ' + lines[i]);
  }
}

console.log("--- SEARCHING FOR notificationPanel ---");
for(let i=0; i<lines.length; i++) {
  if (lines[i].includes('notificationPanel')) {
    console.log('Line ' + i + ': ' + lines[i]);
  }
}
