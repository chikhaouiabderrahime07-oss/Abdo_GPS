const fs = require('fs');
let html = fs.readFileSync('index.html', 'utf8');
const search = '<i class="fa-solid fa-tire"></i> Pneumatiques</div>';
const idx = html.indexOf(search);
console.log(html.substring(idx, idx + 500));
