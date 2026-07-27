const fs = require('fs');
const file = 'c:/Users/ABDOU/Desktop/Telegram/before ma/server.js';
let content = fs.readFileSync(file, 'utf8');
const search = 'note: `Terminé (Durée: ${dur}h)`';
const replace = 'note: `Terminé (Durée: ${dur}h)`,\n        status: \'termine\'';
if (content.includes(search)) {
  content = content.replace(search, replace);
  fs.writeFileSync(file, content);
  console.log('Replaced successfully');
} else {
  console.log('Search string not found');
}
