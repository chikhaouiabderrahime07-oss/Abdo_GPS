const fs = require('fs');
let s = fs.readFileSync('c:/Users/ABDOU/Desktop/Telegram/before ma/server.js', 'utf8');

const targetStr = 'app.use(express.static(__dirname));';
const newStr = `app.use(express.static(__dirname, {
  setHeaders: (res, path) => {
    if (path.endsWith('.html') || path.endsWith('.js') || path.endsWith('.css')) {
      res.setHeader('Cache-Control', 'no-cache');
    }
  }
}));`;

if (s.includes(targetStr)) {
    s = s.replace(targetStr, newStr);
    fs.writeFileSync('c:/Users/ABDOU/Desktop/Telegram/before ma/server.js', s);
    console.log('Added Cache-Control to server.js');
} else {
    console.log('targetStr not found');
}
