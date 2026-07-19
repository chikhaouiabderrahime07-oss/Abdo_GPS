const fs = require('fs');
let html = fs.readFileSync('index.html', 'utf8');

const searchMarker = '<i class="fa-solid fa-tire"></i> Pneumatiques</div>';
const sIdx = html.indexOf(searchMarker);

if (sIdx !== -1) {
    const endMarker = '  <!-- ═══════════════════════════════════════════════════════ -->\n  <!-- NOTIFICATION PANEL';
    const eIdx = html.indexOf(endMarker, sIdx);
    
    if (eIdx !== -1) {
        const replacement = `<i class="fa-solid fa-tire"></i> Pneumatiques</div>
            <div class="form-group"><label>Intervalle Kilométrique (km)</label><input type="number" id="intPneuKm" placeholder="50000" value="50000" style="border:1.5px solid var(--border-primary);"></div>
            <div class="form-group"><label>Intervalle Temporel (mois)</label><input type="number" id="intPneuMois" placeholder="18" value="18" style="border:1.5px solid var(--border-primary);"></div>
          </div>
        </div>
      </div>
    </div>
  </div>
`;
        html = html.substring(0, sIdx) + replacement + html.substring(eIdx);
        fs.writeFileSync('index.html', html);
        console.log("✅ Fixed Rogue NotificationList injection!");
    } else {
        console.log("❌ Could not find endMarker");
    }
} else {
    console.log("❌ Could not find searchMarker");
}
