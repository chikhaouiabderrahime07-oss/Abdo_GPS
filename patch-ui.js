const fs = require('fs');

let s = fs.readFileSync('c:/Users/ABDOU/Desktop/Telegram/before ma/ui.js', 'utf8');

// Fix 1: change ui.deleteMaintenanceEntry to window.ui.deleteMaintenanceEntry
s = s.replace(/onclick="ui\.deleteMaintenanceEntry/g, 'onclick="window.ui.deleteMaintenanceEntry');

// Fix 2: add syncSettings and renderVidangeSection to deleteMaintenanceEntry
const searchStr = `
  async deleteMaintenanceEntry(id) {
    if (!id) return;
    if (!confirm('Supprimer cet enregistrement de maintenance ? Cette action est irréversible.')) return;
    try {
      const r = await fetch(\`\${FLEET_CONFIG.API.baseUrl}/api/maintenance/delete\`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-access-code': localStorage.getItem('fleetAccessCode') || '' },
        body: JSON.stringify({ id })
      });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      if (window.showToast) showToast('Enregistrement supprimé', 'success');
      await this.fetchAndRenderMaintenance();`;

const replacement = `
  async deleteMaintenanceEntry(id) {
    if (!id) return;
    if (!confirm('Supprimer cet enregistrement de maintenance ? Cette action est irréversible.')) return;
    try {
      const r = await fetch(\`\${FLEET_CONFIG.API.baseUrl}/api/maintenance/delete\`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-access-code': localStorage.getItem('fleetAccessCode') || '' },
        body: JSON.stringify({ id })
      });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      if (window.showToast) showToast('Enregistrement supprimé', 'success');
      await this.fetchAndRenderMaintenance();
      
      // ✅ Force a full sync of settings (to get the updated vidangeOverrides) and refresh dashboard
      if (typeof this.syncSettings === 'function') {
         await this.syncSettings();
      }
      if (typeof this.renderVidangeSection === 'function') {
         this.renderVidangeSection();
      }`;

if (s.includes(searchStr)) {
   s = s.replace(searchStr, replacement);
   fs.writeFileSync('c:/Users/ABDOU/Desktop/Telegram/before ma/ui.js', s);
   console.log('Fixed ui.js successfully');
} else {
   console.log('Could not find search block in ui.js');
}

// Bump index.html version again for good measure
let idx = fs.readFileSync('c:/Users/ABDOU/Desktop/Telegram/before ma/index.html', 'utf8');
idx = idx.replace(/ui\.js(\?v=[0-9]+)?/g, 'ui.js?v=' + Date.now());
fs.writeFileSync('c:/Users/ABDOU/Desktop/Telegram/before ma/index.html', idx);
console.log('Bumped index.html');
