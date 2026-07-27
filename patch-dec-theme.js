const fs = require('fs');
let s = fs.readFileSync('c:/Users/ABDOU/Desktop/Telegram/before ma/ui.js', 'utf8');

const t1 = `<div style="max-height: 350px; overflow-y: auto; border: 1px solid var(--text-primary, #e2e8f0); border-radius: 8px;"><table style="width:100%; border-collapse:collapse; font-size:13px; background:#1a2332;"><thead style="position: sticky; top: 0; background: #f1f5f9; z-index: 1;"><tr style="color:#475569; text-align:left; border-bottom:2px solid var(--text-primary, #e2e8f0);"><th style="padding:12px 15px;">Camion</th><th style="padding:12px; text-align:center;">Nuits Dehors</th></tr></thead><tbody>`;
const r1 = `<div style="max-height: 350px; overflow-y: auto; border: 1px solid var(--border); border-radius: 8px;"><table style="width:100%; border-collapse:collapse; font-size:13px; background:var(--bg-surface);"><thead style="position: sticky; top: 0; background: var(--bg-elevated); z-index: 1;"><tr style="color:var(--text-primary); text-align:left; border-bottom:2px solid var(--border);"><th style="padding:12px 15px;">Camion</th><th style="padding:12px; text-align:center;">Nuits Dehors</th></tr></thead><tbody>`;

const t2 = `html += \`<div style="background:#1a2332; border:1px solid var(--border, rgba(255,255,255,0.08)); border-left: 5px solid #dc2626; padding:15px; border-radius:8px; display:flex; justify-content:space-between; align-items:center;"><div style="flex:1;"><div style="font-weight:bold; color:var(--bg-elevated, #1e293b);">\${log.truckName}</div><div style="font-size:12px; color:var(--text-muted, #64748b);">Nuit du <strong>\${dateStr}</strong> · Détecté à \${detectedTime}</div></div><div style="flex:2; text-align:center;"><div onclick="ui.viewOnMap(\${log.locationAtMidnight?.lat || 0}, \${log.locationAtMidnight?.lng || 0})" style="font-size:12px; color:#1e40af; background:#eff6ff; padding:6px 12px; border-radius:6px; cursor:pointer; transition:all 0.2s;" onmouseover="this.style.background='#dbeafe'" onmouseout="this.style.background='#eff6ff'"><i class="fa-solid fa-map-pin"></i> \${resolvedName} <i class="fa-solid fa-arrow-up-right-from-square" style="font-size:10px; opacity:0.6; margin-left:4px;"></i></div><div style="font-size:11px; color:var(--text-muted, #64748b);">à \${distKm} km du site</div></div><div style="flex:0.5; text-align:right;"><span style="background:#fff7ed; color:#c2410c; padding:4px 10px; border-radius:20px; font-size:11px; font-weight:700; border:1px solid #fed7aa;">🌙 Hors Site</span></div></div>\`;`;
const r2 = `html += \`<div style="background:var(--bg-surface); border:1px solid var(--border); border-left: 5px solid var(--danger); padding:15px; border-radius:8px; display:flex; justify-content:space-between; align-items:center;"><div style="flex:1;"><div style="font-weight:bold; color:var(--text-primary);">\${log.truckName}</div><div style="font-size:12px; color:var(--text-muted);">Nuit du <strong>\${dateStr}</strong> · Détecté à \${detectedTime}</div></div><div style="flex:2; text-align:center;"><div onclick="ui.viewOnMap(\${log.locationAtMidnight?.lat || 0}, \${log.locationAtMidnight?.lng || 0})" style="font-size:12px; color:var(--info); background:var(--info-glow); padding:6px 12px; border-radius:6px; cursor:pointer; transition:all 0.2s;"><i class="fa-solid fa-map-pin"></i> \${resolvedName} <i class="fa-solid fa-arrow-up-right-from-square" style="font-size:10px; opacity:0.6; margin-left:4px;"></i></div><div style="font-size:11px; color:var(--text-muted);">à \${distKm} km du site</div></div><div style="flex:0.5; text-align:right;"><span style="background:var(--danger-subtle); color:var(--danger); padding:4px 10px; border-radius:20px; font-size:11px; font-weight:700; border:1px solid var(--danger-glow);">🌙 Hors Site</span></div></div>\`;`;

let changed = false;
if (s.includes(t1)) { s = s.replace(t1, r1); changed = true; } else { console.log('t1 not found'); }
if (s.includes(t2)) { s = s.replace(t2, r2); changed = true; } else { console.log('t2 not found'); }

// Remove the default date filter so it shows ALL by default instead of hiding them all
const t3 = `if(this.decouchageDateStart) this.decouchageDateStart.value = today;`;
const r3 = `if(this.decouchageDateStart) this.decouchageDateStart.value = '';`;
if (s.includes(t3)) { s = s.replace(t3, r3); changed = true; }

const t4 = `if(this.decouchageDateEnd) this.decouchageDateEnd.value = today;`;
const r4 = `if(this.decouchageDateEnd) this.decouchageDateEnd.value = '';`;
if (s.includes(t4)) { s = s.replace(t4, r4); changed = true; }

if (changed) {
    fs.writeFileSync('c:/Users/ABDOU/Desktop/Telegram/before ma/ui.js', s);
    console.log('Fixed ui.js theme logic');
    let idx = fs.readFileSync('c:/Users/ABDOU/Desktop/Telegram/before ma/index.html', 'utf8');
    idx = idx.replace(/ui\.js(\?v=[0-9]+)?/g, 'ui.js?v=' + Date.now());
    fs.writeFileSync('c:/Users/ABDOU/Desktop/Telegram/before ma/index.html', idx);
    console.log('Bumped index.html');
}
