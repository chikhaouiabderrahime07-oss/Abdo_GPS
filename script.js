const ui_js_path = 'c:\\Users\\ABDOU\\Desktop\\Telegram\\before ma\\ui.js';
const fs = require('fs');

let content = fs.readFileSync(ui_js_path, 'utf8');

// The new unified openZoneManagementModal
const newModalCode = `
  openZoneManagementModal() {
    const existing = document.getElementById('zoneManagementModal');
    if (existing) existing.remove();
    const existing2 = document.getElementById('clientManagementModal');
    if (existing2) existing2.remove();
    
    const locs = FLEET_CONFIG.CUSTOM_LOCATIONS || [];
    const clients = FLEET_CONFIG.CLIENTS || [];
    const typeInfo = {
      douroub:     { icon:'fa-building', color:'#22c55e', label:'🏭 Site Douroub' },
      client:      { icon:'fa-user-tie', color:'#3b82f6', label:'💼 Client' },
      subclient:   { icon:'fa-users',    color:'#22d3ee', label:'📦 Sous-Client' },
      maintenance: { icon:'fa-wrench',   color:'#f97316', label:'🔧 Maintenance' },
      station:     { icon:'fa-gas-pump', color:'#eab308', label:'⛽ Station' },
      other:       { icon:'fa-map-pin',  color:'#6b7280', label:'📍 Autre' }
    };
    
    // ZONES ROWS
    const zoneRows = locs.map((loc, i) => {
      const ti = typeInfo[loc.type] || typeInfo.other;
      const clientName = loc.clientId && clients.length ? (clients.find(c=>c.id===loc.clientId)||{}).name||'' : '';
      return \`<tr style="border-bottom:1px solid var(--border);transition:background 0.15s;" onmouseover="this.style.background='rgba(56,189,248,0.04)'" onmouseout="this.style.background=''">
        <td style="padding:10px 12px;"><span style="display:inline-flex;align-items:center;gap:6px;"><i class="fa-solid \${ti.icon}" style="color:\${ti.color};width:14px;"></i><span style="font-weight:700;color:var(--text-primary);">\${loc.name}</span></span></td>
        <td style="padding:10px 8px;"><span style="background:\${ti.color}22;color:\${ti.color};padding:3px 10px;border-radius:20px;font-size:10px;font-weight:700;">\${ti.label}</span></td>
        <td style="padding:10px 8px;color:var(--text-secondary);font-size:12px;">\${loc.wilaya||'—'}</td>
        <td style="padding:10px 8px;color:var(--text-secondary);font-size:12px;">\${loc.radius||500}m</td>
        <td style="padding:10px 8px;color:var(--text-secondary);font-size:12px;">\${clientName||'—'}</td>
        <td style="padding:10px 8px;text-align:right;">
          <button onclick="ui.openZoneClientModal(\${i})" style="background:rgba(56,189,248,0.1);border:1px solid rgba(56,189,248,0.2);color:#38bdf8;border-radius:6px;padding:4px 10px;font-size:11px;cursor:pointer;margin-right:4px;" title="Modifier">✏️</button>
          <button onclick="if(confirm('Supprimer \${loc.name.replace(/'/g,\\"\\\\'\\")} ?')){FLEET_CONFIG.CUSTOM_LOCATIONS.splice(\${i},1);ui.saveSettingsToCloud();document.getElementById('zoneManagementModal').remove();ui.openZoneManagementModal();}" style="background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.2);color:#ef4444;border-radius:6px;padding:4px 10px;font-size:11px;cursor:pointer;" title="Supprimer">🗑️</button>
        </td>
      </tr>\`;
    }).join('');
    
    // CLIENTS ROWS
    const clientRows = clients.map((c, i) => {
      const finalClientsList = (c.finalClients||[]).map((fc, j) => {
        return \`<div style="display:flex;justify-content:space-between;align-items:center;padding:6px;background:rgba(255,255,255,0.05);border-radius:6px;margin-bottom:4px;margin-left:20px;border-left:2px solid \${c.color};">
          <span style="font-size:12px;color:var(--text-secondary);">↳ \${fc.name}</span>
          <div>
             <button onclick="const n=prompt('Modifier client final?', '\${fc.name.replace(/'/g,\\"\\\\'\\")}'); if(n) { FLEET_CONFIG.CLIENTS[\${i}].finalClients[\${j}].name=n; ui.saveSettingsToCloud(); ui.openZoneManagementModal(); setTimeout(()=>document.querySelectorAll('.zmTab')[2].click(), 50); }" style="background:none;border:none;color:#38bdf8;cursor:pointer;"><i class="fa-solid fa-pen"></i></button>
             <button onclick="if(confirm('Supprimer client final?')) { FLEET_CONFIG.CLIENTS[\${i}].finalClients.splice(\${j},1); ui.saveSettingsToCloud(); ui.openZoneManagementModal(); setTimeout(()=>document.querySelectorAll('.zmTab')[2].click(), 50); }" style="background:none;border:none;color:#ef4444;cursor:pointer;"><i class="fa-solid fa-trash"></i></button>
          </div>
        </div>\`;
      }).join('');
      
      return \`<div style="background:var(--bg-elevated);border:1px solid var(--border);border-radius:10px;padding:12px;margin-bottom:10px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
          <div style="display:flex;align-items:center;gap:10px;">
            <span style="background:\${c.color}22;border:1px solid \${c.color}55;color:\${c.color};width:32px;height:32px;display:flex;align-items:center;justify-content:center;border-radius:8px;font-size:14px;"><i class="fa-solid fa-user-tie"></i></span>
            <div>
              <div style="font-weight:800;font-size:14px;color:var(--text-primary);">\${c.name}</div>
              <div style="font-size:11px;color:var(--text-muted);">\${(c.finalClients||[]).length} clients finaux</div>
            </div>
          </div>
          <div style="display:flex;gap:6px;">
            <button onclick="const n=prompt('Nouveau nom final pour \${c.name.replace(/'/g,\\"\\\\'\\")}?'); if(n) { if(!FLEET_CONFIG.CLIENTS[\${i}].finalClients) FLEET_CONFIG.CLIENTS[\${i}].finalClients=[]; FLEET_CONFIG.CLIENTS[\${i}].finalClients.push({id:'fc_'+Date.now(), name:n}); ui.saveSettingsToCloud(); ui.openZoneManagementModal(); setTimeout(()=>document.querySelectorAll('.zmTab')[2].click(), 50); }" style="background:rgba(34,197,94,0.1);color:#22c55e;border:1px solid rgba(34,197,94,0.3);border-radius:6px;padding:4px 10px;font-size:11px;font-weight:700;cursor:pointer;">+ Client Final</button>
            <button onclick="const n=prompt('Modifier client?', '\${c.name.replace(/'/g,\\"\\\\'\\")}'); if(n) { FLEET_CONFIG.CLIENTS[\${i}].name=n; ui.saveSettingsToCloud(); ui.openZoneManagementModal(); setTimeout(()=>document.querySelectorAll('.zmTab')[2].click(), 50); }" style="background:rgba(56,189,248,0.1);color:#38bdf8;border:none;border-radius:6px;width:28px;height:28px;cursor:pointer;"><i class="fa-solid fa-pen"></i></button>
            <button onclick="if(confirm('Supprimer \${c.name.replace(/'/g,\\"\\\\'\\")} et tous ses clients finaux?')) { FLEET_CONFIG.CLIENTS.splice(\${i},1); ui.saveSettingsToCloud(); ui.openZoneManagementModal(); setTimeout(()=>document.querySelectorAll('.zmTab')[2].click(), 50); }" style="background:rgba(239,68,68,0.1);color:#ef4444;border:none;border-radius:6px;width:28px;height:28px;cursor:pointer;"><i class="fa-solid fa-trash"></i></button>
          </div>
        </div>
        \${finalClientsList}
      </div>\`;
    }).join('');
    
    const typeOpts = Object.entries(typeInfo).map(([v,t]) => \`<option value="\${v}">\${t.label}</option>\`).join('');
    const clientOpts = \`<option value="">— Aucun —</option>\` + clients.map(c=>\`<option value="\${c.id}">\${c.name}</option>\`).join('');
    
    // Stats
    const totalDouroub = locs.filter(l=>l.type==='douroub').length;
    const totalClients = locs.filter(l=>l.type==='client'||l.type==='subclient').length;
    const totalMaintenance = locs.filter(l=>l.type==='maintenance').length;
    
    const modal = document.createElement('div');
    modal.id = 'zoneManagementModal';
    modal.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,0.85);display:flex;align-items:center;justify-content:center;backdrop-filter:blur(8px);';
    modal.innerHTML = \`
    <div style="background:var(--bg-surface);border:1px solid var(--border);border-radius:16px;width:900px;max-width:95vw;height:85vh;max-height:800px;box-shadow:0 20px 60px rgba(0,0,0,0.5);display:flex;flex-direction:column;overflow:hidden;">
      <!-- Header -->
      <div style="background:linear-gradient(135deg,#0f172a,#1e293b);padding:20px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid var(--border);">
        <div style="display:flex;align-items:center;gap:16px;">
          <div style="width:48px;height:48px;background:linear-gradient(135deg,#3b82f6,#0ea5e9);border-radius:14px;display:flex;align-items:center;justify-content:center;font-size:24px;color:white;box-shadow:0 4px 15px rgba(59,130,246,0.4);">🗺️</div>
          <div>
            <div style="font-weight:800;font-size:20px;color:white;letter-spacing:0.5px;">Gestion des Zones & Clients</div>
            <div style="font-size:12px;color:rgba(255,255,255,0.6);margin-top:2px;">\${locs.length} zones · \${clients.length} clients configurés</div>
          </div>
        </div>
        <button onclick="document.getElementById('zoneManagementModal').remove()" style="background:rgba(255,255,255,0.1);border:1px solid rgba(255,255,255,0.2);color:white;border-radius:8px;width:36px;height:36px;display:flex;align-items:center;justify-content:center;cursor:pointer;transition:0.2s;"><i class="fa-solid fa-xmark"></i></button>
      </div>
      
      <!-- Stats Summary -->
      <div style="background:var(--bg-deep);padding:14px 20px;display:flex;gap:12px;border-bottom:1px solid var(--border);overflow-x:auto;">
        <div style="display:flex;align-items:center;gap:6px;padding:6px 12px;background:rgba(34,197,94,0.1);border:1px solid rgba(34,197,94,0.3);border-radius:8px;">
          <i class="fa-solid fa-building" style="color:#22c55e;"></i> <span style="font-weight:800;color:#22c55e;font-size:14px;">\${totalDouroub}</span> <span style="font-size:10px;color:var(--text-muted);">Site Douroub</span>
        </div>
        <div style="display:flex;align-items:center;gap:6px;padding:6px 12px;background:rgba(59,130,246,0.1);border:1px solid rgba(59,130,246,0.3);border-radius:8px;">
          <i class="fa-solid fa-user-tie" style="color:#3b82f6;"></i> <span style="font-weight:800;color:#3b82f6;font-size:14px;">\${totalClients}</span> <span style="font-size:10px;color:var(--text-muted);">Client</span>
        </div>
        <div style="display:flex;align-items:center;gap:6px;padding:6px 12px;background:rgba(249,115,22,0.1);border:1px solid rgba(249,115,22,0.3);border-radius:8px;">
          <i class="fa-solid fa-wrench" style="color:#f97316;"></i> <span style="font-weight:800;color:#f97316;font-size:14px;">\${totalMaintenance}</span> <span style="font-size:10px;color:var(--text-muted);">Maintenance</span>
        </div>
      </div>
      
      <!-- Tabs -->
      <div style="display:flex;border-bottom:1px solid var(--border);background:var(--bg-deep);">
        <button class="zmTab active" onclick="document.querySelectorAll('.zmTab').forEach(b=>b.classList.remove('active'));this.classList.add('active');document.querySelectorAll('.zmPane').forEach(p=>p.style.display='none');document.getElementById('zmZonesList').style.display='block';" style="padding:14px 24px;background:none;border:none;font-size:14px;font-weight:800;color:var(--text-primary);cursor:pointer;border-bottom:2px solid #0ea5e9;">📍 Zones Géographiques</button>
        <button class="zmTab" onclick="document.querySelectorAll('.zmTab').forEach(b=>b.classList.remove('active'));this.classList.add('active');document.querySelectorAll('.zmPane').forEach(p=>p.style.display='none');document.getElementById('zmAddZone').style.display='block';this.style.borderBottom='2px solid #22c55e';" style="padding:14px 24px;background:none;border:none;font-size:14px;font-weight:800;color:var(--text-secondary);cursor:pointer;border-bottom:2px solid transparent;">➕ Nouvelle Zone</button>
        <button class="zmTab" onclick="document.querySelectorAll('.zmTab').forEach(b=>b.classList.remove('active'));this.classList.add('active');document.querySelectorAll('.zmPane').forEach(p=>p.style.display='none');document.getElementById('zmClients').style.display='block';this.style.borderBottom='2px solid #a78bfa';" style="padding:14px 24px;background:none;border:none;font-size:14px;font-weight:800;color:var(--text-secondary);cursor:pointer;border-bottom:2px solid transparent;">👤 Annuaire Clients</button>
      </div>
      
      <!-- Content -->
      <div style="flex:1;overflow-y:auto;padding:0;">
        <!-- ZONES LIST -->
        <div id="zmZonesList" class="zmPane" style="display:block;">
          <div id="suggestedZonesSection" style="margin:16px;display:none;">
             <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
                <span style="font-size:11px;font-weight:800;color:var(--warning);text-transform:uppercase;letter-spacing:1px;">🔍 Détection Automatique (Smart Tracker)</span>
                <span id="suggestedZonesBadge" style="display:flex;background:var(--warning);color:black;font-size:10px;font-weight:800;width:18px;height:18px;border-radius:50%;align-items:center;justify-content:center;">0</span>
             </div>
             <div id="suggestedZonesList" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:12px;"></div>
          </div>
          \${locs.length === 0 ? '<div style="text-align:center;padding:40px;color:var(--text-muted);font-size:14px;">Aucune zone. Allez dans "Nouvelle Zone".</div>' : \`
          <table style="width:100%;border-collapse:collapse;font-size:13px;">
            <thead><tr style="background:var(--bg-elevated);border-bottom:1px solid var(--border);">
              <th style="padding:12px;text-align:left;color:var(--text-muted);font-size:11px;text-transform:uppercase;font-weight:800;">Zone</th>
              <th style="padding:12px 8px;text-align:left;color:var(--text-muted);font-size:11px;text-transform:uppercase;font-weight:800;">Type</th>
              <th style="padding:12px 8px;text-align:left;color:var(--text-muted);font-size:11px;text-transform:uppercase;font-weight:800;">Wilaya</th>
              <th style="padding:12px 8px;text-align:left;color:var(--text-muted);font-size:11px;text-transform:uppercase;font-weight:800;">Rayon</th>
              <th style="padding:12px 8px;text-align:left;color:var(--text-muted);font-size:11px;text-transform:uppercase;font-weight:800;">Client Lié</th>
              <th style="padding:12px 8px;text-align:right;color:var(--text-muted);font-size:11px;text-transform:uppercase;font-weight:800;">Actions</th>
            </tr></thead>
            <tbody>\${zoneRows}</tbody>
          </table>\`}
        </div>
        
        <!-- ADD ZONE FORM -->
        <div id="zmAddZone" class="zmPane" style="display:none;padding:24px;">
          <div style="font-weight:800;font-size:18px;color:var(--text-primary);margin-bottom:20px;">➕ Créer une Nouvelle Zone Géographique</div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
            <div><label style="font-size:11px;color:var(--text-muted);font-weight:800;display:block;margin-bottom:6px;">NOM DE LA ZONE *</label>
              <input id="zm_name" placeholder="Ex: Dépot Guedila Zeralda" style="width:100%;background:var(--bg-elevated);border:1px solid var(--border);border-radius:8px;padding:12px 14px;color:var(--text-primary);font-size:14px;box-sizing:border-box;"></div>
            <div><label style="font-size:11px;color:var(--text-muted);font-weight:800;display:block;margin-bottom:6px;">WILAYA *</label>
              <input id="zm_wilaya" placeholder="Ex: Alger" style="width:100%;background:var(--bg-elevated);border:1px solid var(--border);border-radius:8px;padding:12px 14px;color:var(--text-primary);font-size:14px;box-sizing:border-box;"></div>
            <div style="grid-column:1/-1;display:flex;gap:12px;align-items:flex-end;">
              <div style="flex:1;"><label style="font-size:11px;color:var(--text-muted);font-weight:800;display:block;margin-bottom:6px;">LATITUDE *</label>
                <input id="zm_lat" type="number" step="any" placeholder="36.7538" style="width:100%;background:var(--bg-elevated);border:1px solid var(--border);border-radius:8px;padding:12px 14px;color:var(--text-primary);font-size:14px;box-sizing:border-box;"></div>
              <div style="flex:1;"><label style="font-size:11px;color:var(--text-muted);font-weight:800;display:block;margin-bottom:6px;">LONGITUDE *</label>
                <input id="zm_lng" type="number" step="any" placeholder="3.0588" style="width:100%;background:var(--bg-elevated);border:1px solid var(--border);border-radius:8px;padding:12px 14px;color:var(--text-primary);font-size:14px;box-sizing:border-box;"></div>
              <button onclick="ui._startZoneMapPicker()" style="background:rgba(56,189,248,0.1);color:#38bdf8;border:1px solid rgba(56,189,248,0.3);border-radius:8px;padding:12px 16px;font-weight:800;cursor:pointer;display:flex;align-items:center;gap:8px;height:43px;"><i class="fa-solid fa-crosshairs"></i> Pointer sur la carte</button>
            </div>
            <div><label style="font-size:11px;color:var(--text-muted);font-weight:800;display:block;margin-bottom:6px;">RAYON (mètres)</label>
              <input id="zm_radius" type="number" value="500" style="width:100%;background:var(--bg-elevated);border:1px solid var(--border);border-radius:8px;padding:12px 14px;color:var(--text-primary);font-size:14px;box-sizing:border-box;"></div>
            <div><label style="font-size:11px;color:var(--text-muted);font-weight:800;display:block;margin-bottom:6px;">TYPE DE ZONE</label>
              <select id="zm_type" style="width:100%;background:var(--bg-elevated);border:1px solid var(--border);border-radius:8px;padding:12px 14px;color:var(--text-primary);font-size:14px;">\${typeOpts}</select></div>
            <div style="grid-column:1/-1;border-top:1px solid var(--border);margin-top:10px;padding-top:16px;">
              <div style="font-size:12px;font-weight:800;color:var(--text-primary);margin-bottom:12px;"><i class="fa-solid fa-link"></i> Lier à un Client (Optionnel)</div>
              <div style="display:flex;gap:12px;">
                <div style="flex:1;">
                  <label style="font-size:11px;color:var(--text-muted);font-weight:800;display:block;margin-bottom:6px;">CLIENT</label>
                  <select id="zm_client" onchange="ui._updateFinalClientSelect(this.value, 'zm_final_client')" style="width:100%;background:var(--bg-elevated);border:1px solid var(--border);border-radius:8px;padding:12px 14px;color:var(--text-primary);font-size:14px;">\${clientOpts}</select>
                </div>
                <div style="flex:1;">
                  <label style="font-size:11px;color:var(--text-muted);font-weight:800;display:block;margin-bottom:6px;">CLIENT FINAL</label>
                  <select id="zm_final_client" style="width:100%;background:var(--bg-elevated);border:1px solid var(--border);border-radius:8px;padding:12px 14px;color:var(--text-primary);font-size:14px;"><option value="">— Sélectionnez d\\'abord un client —</option></select>
                </div>
              </div>
            </div>
          </div>
          <div style="margin-top:24px;display:flex;gap:12px;">
            <button onclick="ui._saveNewZoneFromModal()" style="flex:1;background:linear-gradient(135deg,#22c55e,#16a34a);color:white;border:none;border-radius:10px;padding:16px;font-size:16px;font-weight:800;cursor:pointer;box-shadow:0 4px 15px rgba(34,197,94,0.3);"><i class="fa-solid fa-check"></i> Créer la Zone</button>
          </div>
        </div>

        <!-- CLIENTS DIRECTORY -->
        <div id="zmClients" class="zmPane" style="display:none;padding:24px;">
            <div style="background:var(--bg-elevated);border:1px solid var(--border);border-radius:10px;padding:16px;margin-bottom:24px;display:flex;gap:12px;align-items:end;box-shadow:0 4px 10px rgba(0,0,0,0.2);">
                <div style="flex:1;"><label style="font-size:11px;font-weight:800;color:var(--text-muted);display:block;margin-bottom:6px;">NOUVEAU CLIENT (Groupe/Société)</label><input id="zm_new_client_name" placeholder="Ex: Groupe Guedila" style="width:100%;background:var(--bg-deep);border:1px solid var(--border);border-radius:8px;padding:12px 14px;color:var(--text-primary);font-size:14px;box-sizing:border-box;"></div>
                <div><label style="font-size:11px;font-weight:800;color:var(--text-muted);display:block;margin-bottom:6px;">COULEUR</label><input id="zm_new_client_color" type="color" value="#3b82f6" style="width:48px;height:43px;background:none;border:none;cursor:pointer;padding:0;"></div>
                <button onclick="ui._addNewClientFromModal2()" style="background:linear-gradient(135deg,#0ea5e9,#6366f1);color:white;border:none;border-radius:8px;padding:12px 24px;font-size:14px;font-weight:800;cursor:pointer;height:43px;box-shadow:0 4px 10px rgba(14,165,233,0.3);"><i class="fa-solid fa-plus"></i> Créer le Client</button>
            </div>

            <div style="font-weight:800;font-size:18px;color:var(--text-primary);margin-bottom:16px;">📋 Annuaire des Clients</div>
            \${clientRows || '<div style="color:var(--text-muted);font-size:13px;text-align:center;padding:20px;">Aucun client configuré.</div>'}
        </div>
        
        </div>\`;
    
    document.body.appendChild(modal);
    if(typeof this.detectPotentialZones==='function') this.detectPotentialZones();
    modal.addEventListener('click', e => { if(e.target===modal) modal.remove(); });
  }

  _updateFinalClientSelect(clientId, targetSelectId) {
    const sel = document.getElementById(targetSelectId);
    if(!sel) return;
    if(!clientId) {
       sel.innerHTML = '<option value="">— Sélectionnez d\\'abord un client —</option>';
       return;
    }
    const c = (FLEET_CONFIG.CLIENTS||[]).find(x => x.id === clientId);
    if(!c || !c.finalClients || c.finalClients.length === 0) {
       sel.innerHTML = '<option value="">— Aucun client final —</option>';
       return;
    }
    sel.innerHTML = '<option value="">— Aucun —</option>' + c.finalClients.map(fc => \`<option value="\${fc.id}">\${fc.name}</option>\`).join('');
  }
`;

// Find everything from openClientManagementModal() to _acceptSuggestion(
let regex = /openClientManagementModal\(\) \{[\s\S]*?\n\s*_addNewClientFromModal2\(\) \{[\s\S]*?\n\s*openZoneManagementModal\(\) \{[\s\S]*?\n\s*_acceptSuggestion/m;

// Replace it!
if (regex.test(content)) {
  content = content.replace(regex, newModalCode + "\n\n  _acceptSuggestion");
  fs.writeFileSync(ui_js_path, content, 'utf8');
  console.log("Successfully replaced modals.");
} else {
  // If we can't find openClientManagementModal, it means we probably deleted it already.
  // We'll just replace openZoneManagementModal().
  let fallbackRegex = /openZoneManagementModal\(\) \{[\s\S]*?\n\s*_acceptSuggestion/m;
  if (fallbackRegex.test(content)) {
    content = content.replace(fallbackRegex, newModalCode + "\n\n  _acceptSuggestion");
    fs.writeFileSync(ui_js_path, content, 'utf8');
    console.log("Successfully replaced openZoneManagementModal via fallback.");
  } else {
    console.error("COULD NOT FIND REGEX!");
    process.exit(1);
  }
}
