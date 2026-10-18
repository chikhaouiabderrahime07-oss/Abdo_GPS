/**
 * 🔒 GATEKEEPER INTERCEPTOR (CORS-Safe — Fixed for Mapbox)
 * Automatically injects the Access Code into every API request.
 * CRITICAL: Only injects into same-origin requests, NEVER into external APIs
 * (Mapbox, Geoapify, etc.) to prevent CORS preflight failures.
 */
const originalFetch = window.fetch;

window.fetch = async function(url, options) {
    // 1. Normalize URL to string (Mapbox sends Request Objects, not always strings)
    let urlString = url;
    if (typeof url !== 'string' && url && url.url) {
        urlString = url.url;
    }

    // Rewrite relative /api/ and /admin/ paths when page is opened via file:// protocol
    const isFileProto = typeof window !== 'undefined' && window.location && window.location.protocol === 'file:';
    const baseUrl = (typeof FLEET_CONFIG !== 'undefined' && FLEET_CONFIG?.API?.baseUrl) ? FLEET_CONFIG.API.baseUrl : 'http://localhost:3000';
    if (isFileProto && typeof urlString === 'string' && (urlString.startsWith('/api/') || urlString.startsWith('/admin/'))) {
        urlString = `${baseUrl}${urlString}`;
        if (typeof url === 'string') {
            url = urlString;
        }
    }

    // 2. Retrieve Access Code with full fallback chain
    const code = localStorage.getItem('fleetAccessCode') || (window.ui && window.ui.currentCode) || (typeof FLEET_CONFIG !== 'undefined' ? FLEET_CONFIG.accessCode : '');

    // 3. CORS-SAFE: Inject header ONLY for OUR OWN server API
    //    Rules:
    //    - Relative paths starting with /api/ or /admin/ → always ours ✅
    //    - Absolute URLs containing /api/ or /admin/ → ours if not external third-party ✅
    //    - https://api.mapbox.com/, https://api.geoapify.com/, webgps.dz → NEVER inject ❌
    const isExternal = typeof urlString === 'string' && (
        urlString.includes('mapbox.com') ||
        urlString.includes('geoapify.com') ||
        urlString.includes('webgps.dz')
    );

    const isOwnApiRequest = !isExternal && urlString && typeof urlString === 'string' && (
        urlString.startsWith('/api/') ||
        urlString.startsWith('/admin/') ||
        urlString.includes('/api/') ||
        urlString.includes('/admin/') ||
        (typeof FLEET_CONFIG !== 'undefined' && FLEET_CONFIG?.API?.baseUrl && urlString.startsWith(FLEET_CONFIG.API.baseUrl)) ||
        (typeof window !== 'undefined' && window.location && window.location.origin && urlString.startsWith(window.location.origin)) ||
        urlString.startsWith('http://localhost') ||
        urlString.startsWith('http://127.0.0.1')
    );

    if (isOwnApiRequest && code) {
        if (!options) options = {};
        if (typeof Headers !== 'undefined' && options.headers instanceof Headers) {
            if (!options.headers.has('x-access-code')) options.headers.set('x-access-code', code);
        } else if (Array.isArray(options.headers)) {
            const hasCode = options.headers.some(h => Array.isArray(h) && String(h[0]||'').toLowerCase() === 'x-access-code');
            if (!hasCode) options.headers.push(['x-access-code', code]);
        } else {
            if (!options.headers) options.headers = {};
            if (!options.headers['x-access-code']) options.headers['x-access-code'] = code;
        }
    }

    // 4. Perform Request
    try {
        const response = await originalFetch(url, options);

        // 5. CHECK FOR REJECTION (401/403) — only from OUR server
        // Exclude naftal-specific auth endpoints from main session revocation
        const isNaftalAuthRoute = typeof url === 'string' && url.includes('/api/naftal/auth');
        if ((response.status === 401 || response.status === 403) && isOwnApiRequest && !isNaftalAuthRoute) {
            console.warn("⛔ Access Revoked or Invalid Code");
            localStorage.removeItem('fleetAccessCode');
            // If we are not already on the lock screen
            if (document.getElementById('loginOverlay') && document.getElementById('loginOverlay').style.display === 'none') {
                location.reload();
            }
        }
        return response;
    } catch (e) {
        throw e;
    }
};


// ═══════════════════════════════════════════════════════════════
// CUSTOM DIALOG SYSTEM — replaces browser alert/confirm/prompt
// ═══════════════════════════════════════════════════════════════
(function() {
  const _nativeAlert   = typeof window !== 'undefined' && window.alert   ? window.alert.bind(window)   : null;
  const _nativeConfirm = typeof window !== 'undefined' && window.confirm ? window.confirm.bind(window) : null;
  const _nativePrompt  = typeof window !== 'undefined' && window.prompt  ? window.prompt.bind(window)  : null;

  function _rmDlg() { document.getElementById('_dlgOv')?.remove(); }
  function _base(inner) {
    const ov = document.createElement('div');
    ov.id = '_dlgOv';
    ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.65);z-index:999999;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(5px);';
    ov.innerHTML = `<style>@keyframes _dlgIn{from{opacity:0;transform:scale(.93) translateY(-10px)}to{opacity:1;transform:none}}</style>${inner}`;
    document.body.appendChild(ov); return ov;
  }
  function _card(ico,title,body,footer) {
    return `<div style="background:#1a2332;border:1px solid rgba(255,255,255,0.12);border-radius:14px;padding:26px 26px 20px;max-width:430px;width:90%;box-shadow:0 24px 64px rgba(0,0,0,0.55);animation:_dlgIn 0.17s ease;">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px;"><span style="font-size:20px;">${ico}</span><span style="font-size:14px;font-weight:700;color:#f1f5f9;">${title}</span></div>
      <div style="color:#94a3b8;font-size:13px;line-height:1.65;margin-bottom:18px;">${body}</div>
      <div style="display:flex;justify-content:flex-end;gap:8px;">${footer}</div>
    </div>`;
  }
  function _btn(id,label,primary,danger) {
    const bg = danger ? '#ef4444' : primary ? '#38bdf8' : 'rgba(255,255,255,0.07)';
    const col = (primary||danger) ? '#0f172a' : '#94a3b8';
    return `<button id="${id}" style="padding:8px 20px;border-radius:8px;border:1px solid ${primary||danger?'transparent':'rgba(255,255,255,0.12)'};background:${bg};color:${col};font-weight:700;font-size:13px;cursor:pointer;transition:opacity 0.1s;" onmouseenter="this.style.opacity='.85'" onmouseleave="this.style.opacity='1'">${label}</button>`;
  }
  window.ui_showAlert = (msg, title, ico) => new Promise(res => {
    const ov = _base(_card(ico||'ℹ️', title||'Information', msg, _btn('_ok','OK',true,false)));
    const done = () => { _rmDlg(); res(); };
    ov.querySelector('#_ok').onclick = done;
    const kh = e => { if(e.key==='Enter'||e.key==='Escape'){document.removeEventListener('keydown',kh);done();} };
    document.addEventListener('keydown',kh);
  });
  window.ui_showConfirm = (msg, title, ico, dangerBtn) => new Promise(res => {
    const ov = _base(_card(ico||'❓', title||'Confirmation', msg, _btn('_no','Annuler',false,false)+_btn('_yes',dangerBtn||'Confirmer',!dangerBtn,!!dangerBtn)));
    ov.querySelector('#_yes').onclick = () => { _rmDlg(); res(true); };
    ov.querySelector('#_no').onclick  = () => { _rmDlg(); res(false); };
    const kh = e => {
      if(e.key==='Enter'){document.removeEventListener('keydown',kh);_rmDlg();res(true);}
      if(e.key==='Escape'){document.removeEventListener('keydown',kh);_rmDlg();res(false);}
    };
    document.addEventListener('keydown',kh);
  });
  window.ui_showPrompt = (msg, def, title) => new Promise(res => {
    const ov = _base(_card('✏️', title||'Saisie',
      `${msg}<br><input id="_inp" value="${(def||'').replace(/"/g,'&quot;')}" style="width:100%;margin-top:10px;padding:9px 12px;border-radius:8px;border:1px solid rgba(255,255,255,0.15);background:#111827;color:#f1f5f9;font-size:13px;outline:none;box-sizing:border-box;">`,
      _btn('_no','Annuler',false,false)+_btn('_yes','OK',true,false)
    ));
    const inp = ov.querySelector('#_inp'); setTimeout(()=>inp.focus(),40);
    const ok = () => { const v=inp.value; _rmDlg(); res(v); };
    const no = () => { _rmDlg(); res(null); };
    ov.querySelector('#_yes').onclick = ok;
    ov.querySelector('#_no').onclick  = no;
    const kh = e => {
      if(e.key==='Enter'){document.removeEventListener('keydown',kh);ok();}
      if(e.key==='Escape'){document.removeEventListener('keydown',kh);no();}
    };
    document.addEventListener('keydown',kh);
  });
  // Preserve native synchronous window.confirm so that synchronous callers are never broken
  window.confirm = m => {
    if (_nativeConfirm) {
      try { return _nativeConfirm(m); } catch (_) {}
    }
    return true;
  };
  window.alert = m => {
    if (typeof window.showToast === 'function') {
      window.showToast(String(m||''), 'info');
      return;
    }
    if (_nativeAlert) {
      try { return _nativeAlert(m); } catch (_) {}
    }
    return ui_showAlert(String(m||''));
  };
  window.prompt = (m, d) => {
    if (_nativePrompt) {
      try { return _nativePrompt(m, d); } catch (_) {}
    }
    return d || null;
  };
})();

// Global Network Resilience Listeners (F32)
window.addEventListener('online', function() {
  if (typeof window.showToast === 'function') {
    window.showToast('🟢 Connexion réseau rétablie', 'success');
  }
});
window.addEventListener('offline', function() {
  if (typeof window.showToast === 'function') {
    window.showToast('🔴 Connexion réseau perdue — mode hors-ligne actif', 'warning');
  }
});

/**
 * Fleet Tracker UI Controller - Cloud/Firebase Edition
 * FEATURES: 
 * - Rule-Based Fleet Management (NEW)
 * - Full Maintenance History (Vidange/Plaquettes)
 * - Multi-API Key Management for Geoapify
 * - Cloud Settings Sync
 * - Custom Location Types
 * - WILAYA FILTER & SEARCH
 * - 3D INTERACTIVE MAP INTEGRATION
 * - FULL BACKUP & RESTORE
 * - SHOW ALL TRUCKS + GPS CUT INDICATOR
 * - NEW: DÉCOUCHAGE REPORTING (Overnight Stay)
 */

class UIController {
  constructor() {
    this.wilayaExpandState = {};
    this.currentFilter = 'all'; 
    this.fuelAccordionState = true; 
    this.vidangeAccordionState = true;
    this.fuelFilterState = 'all'; 
    this.vidangeFilterState = 'all';
    this.vidangeSortDesc = false;
    this.vidangeSortField = 'km'; // 'km' or 'name'
    this.zoneGroupingMode = 'city'; 
    this.searchQuery = '';

    // \u2705 Settings sync timestamp (used to refresh vidange overrides periodically)
    this.lastSettingsSync = 0;
    this.settingsSyncIntervalMs = 5 * 60 * 1000; // 5 minutes
    
    // REPORT STATES
    this.currentReportView = 'fuel'; // 'fuel' or 'decouchage'
    
    // WILAYA FILTER STATE
    this.wilayaSearchQuery = '';
    
    // REFUEL HISTORY STATE
    this.allRefuelLogs = [];
    this.refuelCurrentPage = 1;
    this.refuelItemsPerPage = 10;
    this.refuelSortOrder = 'date_desc';

    // DECOUCHAGE HISTORY STATE
    this.allDecouchageLogs = [];
    this.decouchageCurrentPage = 1;
    this.decouchageItemsPerPage = 10;
    
    // MAINTENANCE HISTORY STATE
    this.allMaintenanceLogs = [];
    this.editingMaintenanceId = null; 
    this.maintCurrentPage = 1;
    this.maintItemsPerPage = 10;

    // CUSTOM LOCATION & RULE EDIT STATE
    this.editingLocationIndex = null; 
    this.editingRuleId = null;

    // NAFTAL REPORT STATE
    this.naftalReportLogs = [];
    this.naftalPricePerLiter = 31; // DA/L default

    // NAFTAL MANAGEMENT SYSTEM STATE
    this.naftalTransportAuth = false;
    this.naftalGestionnaireAuth = false;
    this.naftalSelectedTrucks = new Set();
    this.naftalDeclarationDraft = [];
    this.naftalCurrentView = 'transport'; // 'transport', 'gestionnaire', 'suivi'
    this.naftalSortField = 'name';
    this.naftalSortDir = 'asc';
    this.naftalFilterStatus = 'all';
    this.naftalSearchQuery = '';

    // ITINERARY ENGINE STATE
    this.itineraryResults = [];
    this.itineraryMapLayerIds = [];

    setTimeout(() => {
      this.initElements();
      this.injectCustomStyles(); 
      
      // ---------------------------------------------------------
      // AUTO-DETECT LIVE SERVER (RENDER) vs LOCALHOST
      // ---------------------------------------------------------
      const _origin = window.location.origin;
      const _isFile = window.location.protocol === 'file:' || !_origin || _origin === 'null';
      const _isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

      if (!_isFile && !_isLocalhost) {
          // Live server (Render, Vercel, etc.)
          FLEET_CONFIG.API.baseUrl = _origin;
          console.log(`🌍 Live Environment Detected. Switching API to: ${FLEET_CONFIG.API.baseUrl}`);
      } else if (_isFile) {
          // 🔧 FIX: file:// protocol — window.location.origin returns 'null'
          // Keep whatever is in config.js (user must set it there for local file use)
          console.warn(`📂 File Protocol Detected. Using config.js baseUrl: ${FLEET_CONFIG.API.baseUrl}`);
          console.warn('💡 Tip: Open via http://localhost instead of file:// for full functionality.');
      } else {
          // Localhost dev server
          FLEET_CONFIG.API.baseUrl = 'http://localhost:3000';
          console.log('💻 Localhost Detected. Switching API to: http://localhost:3000');
      }
      
      // Load Settings from Server (Firebase) on startup
      this.loadSettingsFromCloud();
      
      this.attachEventListeners();
      
      // Initialize Settings Accordions
      this.initSettingsAccordions();
      
      // Set Date Inputs to Today by default
      const today = new Date().toISOString().split('T')[0];
      if(this.refuelDateStart) this.refuelDateStart.value = today;
      if(this.refuelDateEnd) this.refuelDateEnd.value = today;
      if(this.maintDateStart) this.maintDateStart.value = today;
      if(this.maintDateEnd) this.maintDateEnd.value = today;
      
      console.log('\u2705 UI Controller Ready (Rule-Based System)');
      window.ui = this;

      if (FLEET_CONFIG.AUTO_START) {
        this.autoStartTracking();
      }
      // NEW: Decouchage Defaults
      if(this.decouchageDateStart) this.decouchageDateStart.value = '';
      if(this.decouchageDateEnd) this.decouchageDateEnd.value = '';
      // Safe initial fetch
      this.loadTruckDbCache().then(() => {
        this.fetchAndRenderRefuels();
        this.fetchAndRenderMaintenance();
        this.loadVehicleReferences();
      });
    }, 100);
  }

toggleDecouchageSubTab(view) {
      // 1. Reset Buttons (Remove old styles)
      this.btnSubDecouchageRecap.className = 'tab-button';
      this.btnSubDecouchageRecap.style.background = '';
      this.btnSubDecouchageRecap.style.color = '';
      this.btnSubDecouchageRecap.style.border = '';
      
      this.btnSubDecouchageDetail.className = 'tab-button';
      this.btnSubDecouchageDetail.style.background = '';
      this.btnSubDecouchageDetail.style.color = '';
      this.btnSubDecouchageDetail.style.border = '';
      
      // 2. Hide Views
      this.decouchageRecapView.style.display = 'none';
      this.decouchageDetailView.style.display = 'none';
      
      // 3. Activate Selected (APPLY STRONG GREEN STYLES)
      if (view === 'recap') {
          this.decouchageRecapView.style.display = 'block';
          this.btnSubDecouchageRecap.classList.add('active');
          
          // --- FORCE GREEN HERE ---
          this.btnSubDecouchageRecap.style.background = '#166534'; // Strong Green
          this.btnSubDecouchageRecap.style.color = '#ffffff';      // White Text
          this.btnSubDecouchageRecap.style.border = '1px solid #14532d';
          
          // Toggle Exports
          if(this.btnExportRecap) this.btnExportRecap.style.display = 'inline-flex';
          if(this.exportDecouchageBtn) this.exportDecouchageBtn.style.display = 'none';
      } else {
          this.decouchageDetailView.style.display = 'block';
          this.btnSubDecouchageDetail.classList.add('active');
          
          // --- FORCE GREEN HERE ---
          this.btnSubDecouchageDetail.style.background = '#166534'; // Strong Green
          this.btnSubDecouchageDetail.style.color = '#ffffff';      // White Text
          this.btnSubDecouchageDetail.style.border = '1px solid #14532d';
          
          // Toggle Exports
          if(this.btnExportRecap) this.btnExportRecap.style.display = 'none';
          if(this.exportDecouchageBtn) this.exportDecouchageBtn.style.display = 'inline-flex';
      }
  }

  injectCustomStyles() {
    const style = document.createElement('style');
    style.innerHTML = `
      .fuel-card-overlay-btn { 
          display: none; width: 100%; margin-top: 10px; background: var(--teal); color: white; 
          border: none; padding: 8px; border-radius: 4px; cursor: pointer; font-weight: bold; text-align: center;
      }
      .fuel-card-container:hover .fuel-card-overlay-btn { display: block; animation: fadeIn 0.3s;}
      .fuel-card-overlay-btn:hover { background: var(--teal-dark); }

      /* \u2705 Quick Vidange Button */
      .btn-vidange-done {
          background: #166534;
          color: #ffffff;
          border: none;
          padding: 8px 10px;
          border-radius: 6px;
          cursor: pointer;
          font-weight: 700;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
      }
      .btn-vidange-done:hover { background: #14532d; }
      .pagination-controls { display: flex; justify-content: center; align-items: center; gap: 15px; margin-top: 15px; padding: 10px; }
      .pagination-btn { background: var(--bg-elevated,#fff); border: 1px solid var(--border,#ddd); padding: 5px 12px; border-radius: 4px; cursor: pointer; color: var(--text-secondary,#555); }
      .pagination-btn:hover { background: var(--bg-surface,#f0f0f0); }
      .pagination-btn:disabled { opacity: 0.5; cursor: not-allowed; }
      .pagination-info { font-size: 12px; color: var(--text-muted,#666); }
      .api-keys-box { background: var(--bg-elevated,#f4f6f8); border: 1px solid var(--border,#c7d2dd); border-radius: 6px; padding: 10px; margin-top:10px; }
      .api-keys-box textarea { width: 100%; border: 1px solid var(--border,#ddd); border-radius: 4px; padding: 8px; font-family: monospace; font-size: 12px; background: var(--bg-surface,#fff); color: var(--text-primary,#1e293b); }
      /* Decouchage Badges */
      .zone-maintenance-badge { background: rgba(22,163,74,0.1); border: 1px solid rgba(22,163,74,0.3); color: #15803d; font-size: 11px; font-weight: bold; padding: 6px 10px; border-radius: 4px; margin-top: 6px; display: flex; align-items: center; gap: 6px; }
      .zone-vidange-badge { background: rgba(194,65,12,0.1); border: 1px solid rgba(194,65,12,0.3); color: #c2410c; font-size: 11px; font-weight: bold; padding: 6px 10px; border-radius: 4px; margin-top: 6px; display: flex; align-items: center; gap: 6px; }
      @keyframes zoneIn { from { opacity: 0; transform: translateY(-3px); } to { opacity: 1; transform: translateY(0); } }
    `;
    document.head.appendChild(style);
  }

initElements() {
    this.serverUrlInput = document.getElementById('serverUrl');
    this.pollIntervalInput = document.getElementById('pollInterval');
    this.globalSearchInput = document.getElementById('globalSearchInput'); 
    this.startBtn = document.getElementById('startBtn');
    this.stopBtn = document.getElementById('stopBtn');
    
    this.statsContainer = document.getElementById('statsContainer');
    this.trucksContainer = document.getElementById('trucksContainer');
    this.activeFilterDisplay = document.getElementById('activeFilterDisplay');
    this.filterName = document.getElementById('filterName');
    
    this.wilayaContainer = document.getElementById('wilayaContainer');
    this.fuelSectionContainer = document.getElementById('fuelSectionContainer');
    this.vidangeSectionContainer = document.getElementById('vidangeSectionContainer'); 
    this.refuelHistoryContainer = document.getElementById('refuelHistoryContainer');

    // Refuel Filters Inputs
    this.refuelDateStart = document.getElementById('refuelDateStart');
    this.refuelDateEnd = document.getElementById('refuelDateEnd');
    this.refuelTruckSearch = document.getElementById('refuelTruckSearch');
    this.refuelLocationSearch = document.getElementById('refuelLocationSearch');
    this.refuelSortSelect = document.getElementById('refuelSortSelect');
    this.applyRefuelFiltersBtn = document.getElementById('applyRefuelFiltersBtn');
    this.refuelRescanBtn = document.getElementById('refuelRescanBtn');
    this.refuelCleanRescanBtn = document.getElementById('refuelCleanRescanBtn');
    this.exportRefuelsBtn = document.getElementById('exportRefuelsBtn');
    
    // ---------------------------------------------------------
    // DECOUCHAGE FILTERS INPUTS (MODIFIED)
    // ---------------------------------------------------------
    this.decouchageHistoryContainer = document.getElementById('decouchageHistoryContainer');
    this.decouchageStatsGrid = document.getElementById('decouchageStatsGrid');
    this.decouchageRecapContainer = document.getElementById('decouchageRecapContainer'); // New Recap Table Container

    // NEW DATE RANGE INPUTS (Replaces Period Select)
    this.decouchageDateStart = document.getElementById('decouchageDateStart');
    this.decouchageDateEnd = document.getElementById('decouchageDateEnd');
    
    this.decouchageStatusSelect = document.getElementById('decouchageStatusSelect');
    this.decouchageTruckSearch = document.getElementById('decouchageTruckSearch');
    this.applyDecouchageFiltersBtn = document.getElementById('applyDecouchageFiltersBtn');
    
    // EXPORT BUTTONS
    this.exportDecouchageBtn = document.getElementById('exportDecouchageBtn'); // Detailed Export
    this.btnExportRecap = document.getElementById('btnExportRecap');           // Recap Export

    // VIEW CONTAINERS & SUB-TABS (NEW)
    this.decouchageRecapView = document.getElementById('decouchageRecapView');
    this.decouchageDetailView = document.getElementById('decouchageDetailView');
    this.btnSubDecouchageRecap = document.getElementById('btnSubDecouchageRecap');
    this.btnSubDecouchageDetail = document.getElementById('btnSubDecouchageDetail');
    
    // ---------------------------------------------------------

    // Report Toggle Buttons (Main Tabs)
    this.btnReportFuel = document.getElementById('btnReportFuel');
    this.btnReportDecouchage = document.getElementById('btnReportDecouchage');
    this.reportFuelSection = document.getElementById('reportFuelSection');
    this.reportDecouchageSection = document.getElementById('reportDecouchageSection');

    // MAINTENANCE ELEMENTS
    this.maintenanceListContainer = document.getElementById('maintenanceListContainer');
    this.maintDateStart = document.getElementById('maintDateStart');
    this.maintDateEnd = document.getElementById('maintDateEnd');
    this.maintTypeFilter = document.getElementById('maintTypeFilter');
    this.maintTruckSearch = document.getElementById('maintTruckSearch');
    this.applyMaintFiltersBtn = document.getElementById('applyMaintFiltersBtn');
    this.exportMaintBtn = document.getElementById('exportMaintBtn');
    this.maintenanceModal = document.getElementById('maintenanceModal');
    this.modalMaintSubmitBtn = document.getElementById('modalMaintSubmitBtn'); 
    this.modalMaintTitle = document.querySelector('#maintenanceModal h3 span') || document.querySelector('#maintenanceModal h3');

    // \u2705 NEW: Maintenance Follow-up elements
    this.maintTruckSearchInput = document.getElementById('maintTruckSearchInput');
    this.maintTruckSearchResults = document.getElementById('maintTruckSearchResults');
    this.maintTruckInfoPanel = document.getElementById('maintTruckInfoPanel');
    this.activeOrdersDashboard = document.getElementById('activeOrdersDashboard');
    this.activeOrderCount = document.getElementById('activeOrderCount');
    this.truckMetaEditor = document.getElementById('truckMetaEditor');
    this.selectedMaintTruckId = null;
    this.truckDbCache = []; // Stores {deviceId, truckName, chassisNumber, immatriculation, carteNaftal}
    this.activeMaintenanceOrders = [];

    // Wire up maintenance search
    if (this.maintTruckSearchInput) {
        this.maintTruckSearchInput.addEventListener('input', (e) => this.handleMaintTruckSearch(e.target.value));
        this.maintTruckSearchInput.addEventListener('focus', (e) => { if (e.target.value.length >= 1) this.handleMaintTruckSearch(e.target.value); });
        document.addEventListener('click', (e) => {
            if (!e.target.closest('#maintTruckSearchBox')) {
                if (this.maintTruckSearchResults) this.maintTruckSearchResults.classList.remove('show');
            }
        });
    }

    // GLOBAL Settings
    this.defaultFuelCapacity = document.getElementById('defaultFuelCapacity');
    this.defaultFuelConsumption = document.getElementById('defaultFuelConsumption');
    this.defaultFuelPrice = document.getElementById('defaultFuelPrice');
    this.defaultNaftalPrice = document.getElementById('defaultNaftalPrice');
    this.defaultSecurityMargin = document.getElementById('defaultSecurityMargin');
    this.defaultFuelThreshold = document.getElementById('defaultFuelThreshold');
    this.defaultCriticalLevel = document.getElementById('defaultCriticalLevel');
    this.defaultVidangeMilestones = document.getElementById('defaultVidangeMilestones');
    this.defaultVidangeAlert = document.getElementById('defaultVidangeAlert');
    this.defaultCalibration = document.getElementById('defaultCalibration');
    this.naftalDashboardPanel = document.getElementById('naftalDashboardPanel');
    
    this.saveConnectionBtn = document.getElementById('saveConnectionBtn');
    this.geoapifyApiKeysInput = document.getElementById('geoapifyApiKeys');

    // CUSTOM LOCATIONS
    this.customLocName = document.getElementById('customLocName');
    this.customLocWilaya = document.getElementById('customLocWilaya');
    this.customLocLat = document.getElementById('customLocLat');
    this.customLocLng = document.getElementById('customLocLng');
    this.customLocRadius = document.getElementById('customLocRadius'); 
    this.customLocType = document.getElementById('customLocType');
    this.customLocClient = document.getElementById('customLocClient');
    this.customLocFinalClient = document.getElementById('customLocFinalClient');
    this.addCustomLocBtn = document.getElementById('addCustomLocBtn');
    

    // RULE SYSTEM
    this.rulesListContainer = document.getElementById('rulesListContainer');
    if (!FLEET_CONFIG.IMMOBIL_RULES) FLEET_CONFIG.IMMOBIL_RULES = [];
    this.ruleEditorModal = document.getElementById('ruleEditorModal');
    this.ruleEditorContent = document.getElementById('ruleEditorContent');

    this.errorContainer = document.getElementById('errorContainer');
    this.loadingContainer = document.getElementById('loadingContainer');
    
    this.btnGroupWilaya = document.getElementById('btnGroupWilaya');
    this.btnGroupCity = document.getElementById('btnGroupCity');
    
    // NAFTAL System init
    if (document.getElementById('naftalSystemContainer')) {
      this.renderNaftalSystem();
    }
    
    this.restoreFileInput = document.getElementById('restoreFile');
	// AUTO-SET DATES TO "YESTERDAY" (Because today's night hasn't happened yet)
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    
    const yStr = yesterday.toISOString().split('T')[0];

    if(this.decouchageDateStart) this.decouchageDateStart.value = yStr;
    if(this.decouchageDateEnd) this.decouchageDateEnd.value = yStr;
  }
  // --- SETTINGS ACCORDION LOGIC ---
  initSettingsAccordions() {
      const headers = document.querySelectorAll('.settings-header');
      headers.forEach(header => {
          header.addEventListener('click', () => {
              const content = header.nextElementSibling;
              const isOpen = content.classList.contains('open');
              
              document.querySelectorAll('.settings-content').forEach(c => c.classList.remove('open'));
              document.querySelectorAll('.settings-header').forEach(h => h.classList.remove('active'));

              if (!isOpen) {
                  content.classList.add('open');
                  header.classList.add('active');
              }
          });
      });
      // Open Rules by default if available, else Custom Locations
      if(headers[3]) headers[3].click(); 
      else if(headers[0]) headers[0].click();
  }

  // --- CLOUD SYNC FUNCTIONS ---
  async loadSettingsFromCloud() {
      try {
          const res = await fetch(`${FLEET_CONFIG.API.baseUrl}/api/settings`, {
            headers: { 'x-access-code': localStorage.getItem('fleetAccessCode') || this.currentCode || '' }
          });
          if (!res.ok) throw new Error('Failed to fetch settings');
          const data = await res.json();
          
          if (data.defaultConfig) FLEET_CONFIG.DEFAULT_TRUCK_CONFIG = data.defaultConfig;
          
          // MAP CLOUD RULES TO LOCAL CONFIG
          if (data.fleetRules) FLEET_CONFIG.FLEET_RULES = data.fleetRules;
          else FLEET_CONFIG.FLEET_RULES = []; // Init empty if new

          if (data.customLocations) FLEET_CONFIG.CUSTOM_LOCATIONS = data.customLocations;
          if (data.pollInterval) FLEET_CONFIG.UI.pollInterval = data.pollInterval;
          if (data.apiKeys) FLEET_CONFIG.GEOAPIFY_API_KEYS = data.apiKeys;
          if (data.immobilRules) FLEET_CONFIG.IMMOBIL_RULES = data.immobilRules;
          if (data.clients) FLEET_CONFIG.CLIENTS = data.clients;
          if (data.maintenanceRules) FLEET_CONFIG.MAINTENANCE_RULES = data.maintenanceRules;

          if (data.vidangeOverrides || data.VIDANGE_OVERRIDES) {
            const ovr = data.vidangeOverrides || data.VIDANGE_OVERRIDES;
            FLEET_CONFIG.VIDANGE_OVERRIDES = ovr;
            FLEET_CONFIG.vidangeOverrides = ovr;
          } else if (!FLEET_CONFIG.VIDANGE_OVERRIDES) {
            FLEET_CONFIG.VIDANGE_OVERRIDES = {};
            FLEET_CONFIG.vidangeOverrides = {};
          } else {
            FLEET_CONFIG.vidangeOverrides = FLEET_CONFIG.VIDANGE_OVERRIDES;
          }

          // Speed limit + Naftal budget from cloud
          if (data.speedLimit) FLEET_CONFIG.SPEED_LIMIT = data.speedLimit;
          if (data.naftalBudget) FLEET_CONFIG.NAFTAL_BUDGET = data.naftalBudget;
          if (data.naftalManagement) FLEET_CONFIG.NAFTAL_MANAGEMENT = data.naftalManagement;

          this.lastSettingsSync = Date.now();
          // --- AUTO-MIGRATE LEGACY CLIENTS ---
          let _migrated = false;
          if (!FLEET_CONFIG.CLIENTS) FLEET_CONFIG.CLIENTS = [];
          if (FLEET_CONFIG.CUSTOM_LOCATIONS && FLEET_CONFIG.CUSTOM_LOCATIONS.length > 0) {
            FLEET_CONFIG.CUSTOM_LOCATIONS.forEach(loc => {
              if (loc.type === 'client' || loc.type === 'subclient') {
                const exists = FLEET_CONFIG.CLIENTS.find(c => c.id === loc.clientId || c.name.toLowerCase() === loc.name.toLowerCase());
                if (!exists) {
                  const newClient = {
                    id: 'cl_' + Date.now() + Math.floor(Math.random()*1000),
                    name: loc.name,
                    color: loc.color || '#3b82f6',
                    icon: 'fa-user-tie',
                    iconEmoji: '',
                    logoText: loc.name.substring(0, 2).toUpperCase(),
                    industry: '', phone: '', email: '', address: '', notes: 'Migré depuis les anciennes zones',
                    finalClients: []
                  };
                  FLEET_CONFIG.CLIENTS.push(newClient);
                  loc.clientId = newClient.id; // link the legacy zone to the new client
                  _migrated = true;
                }
              }
            });
          }
          if (_migrated) {
            console.log('🔄 Auto-migrated legacy clients to new structure.');
            this.saveSettingsToCloud();
          }
          // -----------------------------------

          
          console.log("☁️ Settings synced from Cloud");
          this.loadGlobalSettingsToUI();
          setTimeout(() => this.renderSettingsSC(), 200);
          
          this.loadClients();
          this.renderRulesList(); // RENDER RULES
          this.renderImmobilRules();
          if ((FLEET_CONFIG.IMMOBIL_RULES || []).filter(r => r.enabled).length > 0) this.startImmobilPoller();
          
          // Update Service with Loaded Keys
          if(geocodeService && FLEET_CONFIG.GEOAPIFY_API_KEYS) {
              geocodeService.updateKeys(FLEET_CONFIG.GEOAPIFY_API_KEYS);
          }

      } catch (e) {
          console.error("Using defaults (Cloud load failed):", e);
      }
  }

  async saveSettingsToCloud() {
      const payload = {
          defaultConfig: FLEET_CONFIG.DEFAULT_TRUCK_CONFIG,
          fleetRules: FLEET_CONFIG.FLEET_RULES,
          customLocations: FLEET_CONFIG.CUSTOM_LOCATIONS,
          pollInterval: FLEET_CONFIG.UI.pollInterval,
          maintenanceRules: FLEET_CONFIG.MAINTENANCE_RULES,
          apiKeys: FLEET_CONFIG.GEOAPIFY_API_KEYS,
          speedLimit: FLEET_CONFIG.SPEED_LIMIT || 90,
          naftalBudget: FLEET_CONFIG.NAFTAL_BUDGET || 0,
          immobilRules: FLEET_CONFIG.IMMOBIL_RULES,
          clients: FLEET_CONFIG.CLIENTS,
          naftalManagement: FLEET_CONFIG.NAFTAL_MANAGEMENT
      };
      
      try {
          await fetch(`${FLEET_CONFIG.API.baseUrl}/api/settings`, {
              method: 'POST',
              headers: {'Content-Type': 'application/json'},
              body: JSON.stringify(payload)
          });
          console.log("☁️ Settings saved to Cloud");
      } catch (e) {
          console.error("Erreur de sauvegarde Cloud: " + e.message);
      }
  }

  // ═══════════════════════════════════════════════════════════════
  //  SETTINGS — SITES & CLIENTS INLINE MANAGEMENT
  // ═══════════════════════════════════════════════════════════════

  renderSettingsSC() {
    const locs = FLEET_CONFIG.CUSTOM_LOCATIONS || [];
    const clients = FLEET_CONFIG.CLIENTS || [];

    // Update badge
    const badge = document.getElementById('scSettingsBadge');
    if (badge) badge.textContent = `${locs.length} sites · ${clients.length} clients`;

    // Update tab badges
    const bSites = document.getElementById('scBadge_sites');
    const bClients = document.getElementById('scBadge_clients');
    const bFC = document.getElementById('scBadge_fc');
    if (bSites) bSites.textContent = locs.length;
    if (bClients) bClients.textContent = clients.length;
    if (bFC) bFC.textContent = clients.reduce((s, c) => s + ((c.finalClients || []).length), 0);

    // Render sites list
    this._scRenderSites('');
    // Render clients grid
    this._scRenderClients('');
    // Populate FC parent dropdown
    this._scPopulateFCParent();
  }

  _scSwitchTab(tab) {
    ['sites', 'clients', 'fc'].forEach(t => {
      const pane = document.getElementById('scPane_' + t);
      const btn  = document.getElementById('scTab_' + t);
      if (pane) pane.style.display = t === tab ? '' : 'none';
      if (btn) {
        btn.style.borderBottomColor = t === tab ? '#6366f1' : 'transparent';
        btn.style.color = t === tab ? '#818cf8' : 'var(--text-muted, #888)';
      }
    });
    if (tab === 'fc') this._scRenderFCPane();
    if (tab === 'clients') this._scRenderClients('');
    if (tab === 'sites') this._scRenderSites('');
  }

  _scRenderSites(filter) {
    const container = document.getElementById('scSitesList');
    if (!container) return;
    const locs = FLEET_CONFIG.CUSTOM_LOCATIONS || [];
    const clients = FLEET_CONFIG.CLIENTS || [];
    const q = (filter || '').toLowerCase();
    const filtered = q ? locs.filter(l => (l.name||'').toLowerCase().includes(q) || (l.wilaya||'').toLowerCase().includes(q)) : locs;

    if (!filtered.length) {
      container.innerHTML = `<div style="text-align:center;padding:32px 16px;color:var(--text-muted,#888);font-size:13px;"> <div style="font-size:32px;margin-bottom:8px;">📍</div>Aucun site trouvé.<br> <button onclick="ui.openZoneClientModal(null)" style="margin-top:12px;background:linear-gradient(135deg,#3b82f6,#6366f1);color:white;border:none;border-radius:9px;padding:8px 16px;font-weight:700;font-size:12px;cursor:pointer;">+ Créer le premier site</button> </div>`;
      return;
    }

    const typeIcons = { depot:'fa-warehouse', livraison:'fa-box', client:'fa-building', chantier:'fa-hard-hat', carburant:'fa-gas-pump', other:'fa-map-marker-alt' };
    const typeColors = { depot:'#f59e0b', livraison:'#3b82f6', client:'#8b5cf6', chantier:'#f97316', carburant:'#22c55e', other:'#64748b' };

    container.innerHTML = filtered.map((loc, rawIdx) => {
      const idx = locs.indexOf(loc);
      const color = loc.color || typeColors[loc.type] || '#6366f1';
      const icon = loc.icon || typeIcons[loc.type] || 'fa-map-marker-alt';
      const client = clients.find(c => c.id === loc.clientId);
      const fc = client && (client.finalClients||[]).find(f => f.id === loc.finalClientId);
      return `<div style="display:flex;align-items:center;gap:10px;padding:10px 12px;background:var(--bg-surface,rgba(0,0,0,0.15));border:1px solid var(--border,rgba(255,255,255,0.07));border-radius:11px;transition:border-color 0.2s;" onmouseover="this.style.borderColor='${color}40'" onmouseout="this.style.borderColor='var(--border,rgba(255,255,255,0.07))'">
        <div style="width:38px;height:38px;background:${color}22;border:2px solid ${color}55;border-radius:10px;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
          <i class="fa-solid ${icon}" style="color:${color};font-size:15px;"></i>
        </div>
        <div style="flex:1;min-width:0;">
          <div style="font-weight:700;font-size:13px;color:var(--text-primary,#e2e8f0);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${loc.name}</div>
          <div style="font-size:10px;color:var(--text-muted,#888);margin-top:2px;display:flex;gap:6px;flex-wrap:wrap;">
            <span>📍 ${loc.wilaya||'Algérie'}</span>
            <span>📏 ${loc.radius||500}m</span>
            ${client ? `<span style="color:${client.color||'#818cf8'};">👔 ${client.name}${fc?' → '+fc.name:''}</span>` : ''}
          </div>
        </div>
        <div style="display:flex;gap:4px;flex-shrink:0;">
          <button onclick="ui.openZoneClientModal(${idx})" style="background:rgba(99,102,241,0.12);border:1px solid rgba(99,102,241,0.25);color:#818cf8;border-radius:7px;width:30px;height:30px;cursor:pointer;font-size:12px;" title="Modifier"><i class="fa-solid fa-pen"></i></button>
          <button onclick="if(window.AlgeriaMap){const m=window.AlgeriaMap;m.map&&m.map.flyTo({center:[${loc.lng},${loc.lat}],zoom:15,pitch:0});}" style="background:rgba(56,189,248,0.1);border:1px solid rgba(56,189,248,0.25);color:#38bdf8;border-radius:7px;width:30px;height:30px;cursor:pointer;font-size:12px;" title="Voir sur carte"><i class="fa-solid fa-eye"></i></button>
          <button onclick="if(confirm('Supprimer ${loc.name.replace(/'/g,"\\'")} ?')){FLEET_CONFIG.CUSTOM_LOCATIONS.splice(${idx},1);ui.saveSettingsToCloud();if(window.AlgeriaMap)AlgeriaMap.renderCustomLocations();ui.renderSettingsSC();}" style="background:rgba(239,68,68,0.08);border:1px solid rgba(239,68,68,0.2);color:#f87171;border-radius:7px;width:30px;height:30px;cursor:pointer;font-size:12px;" title="Supprimer"><i class="fa-solid fa-trash"></i></button>
        </div>
      </div>`;
    }).join('');
  }

  _scFilterSites(q) { this._scRenderSites(q); }

  _scRenderClients(filter) {
    const container = document.getElementById('scClientsList');
    if (!container) return;
    const clients = FLEET_CONFIG.CLIENTS || [];
    const q = (filter || '').toLowerCase();
    const filtered = q ? clients.filter(c => (c.name||'').toLowerCase().includes(q) || (c.industry||'').toLowerCase().includes(q)) : clients;

    if (!filtered.length) {
      container.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:32px 16px;color:var(--text-muted,#888);font-size:13px;"> <div style="font-size:32px;margin-bottom:8px;">👔</div>Aucun client.<br> <button onclick="ui.openClientEditorModal(null)" style="margin-top:12px;background:linear-gradient(135deg,#8b5cf6,#6366f1);color:white;border:none;border-radius:9px;padding:8px 16px;font-weight:700;font-size:12px;cursor:pointer;">+ Créer le premier client</button> </div>`;
      return;
    }

    container.innerHTML = filtered.map(c => {
      const idx = clients.indexOf(c);
      const color = c.color || '#6366f1';
      const icon = c.icon || 'fa-building';
      const fcCount = (c.finalClients||[]).length;
      const siteCount = (FLEET_CONFIG.CUSTOM_LOCATIONS||[]).filter(l => l.clientId === c.id).length;
      return `<div style="background:var(--bg-surface,rgba(0,0,0,0.15));border:1px solid ${color}30;border-radius:13px;padding:14px;position:relative;transition:border-color 0.2s;" onmouseover="this.style.borderColor='${color}60'" onmouseout="this.style.borderColor='${color}30'">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;">
          <div style="width:42px;height:42px;background:${color}22;border:2px solid ${color}55;border-radius:12px;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
            <i class="fa-solid ${icon}" style="color:${color};font-size:18px;"></i>
          </div>
          <div style="flex:1;min-width:0;">
            <div style="font-weight:800;font-size:14px;color:${color};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${c.emoji||''} ${c.name}</div>
            ${c.industry ? `<div style="font-size:10px;color:var(--text-muted,#888);margin-top:1px;">${c.industry}</div>` : ''}
          </div>
        </div>
        <div style="display:flex;gap:6px;margin-bottom:10px;flex-wrap:wrap;">
          <span style="background:${color}18;color:${color};padding:2px 8px;border-radius:8px;font-size:10px;font-weight:700;">🤝 ${fcCount} client${fcCount!==1?'s':''} finaux</span>
          <span style="background:rgba(56,189,248,0.1);color:#38bdf8;padding:2px 8px;border-radius:8px;font-size:10px;font-weight:700;">🏢 ${siteCount} site${siteCount!==1?'s':''}</span>
        </div>
        ${c.phone||c.email ? `<div style="font-size:10px;color:var(--text-muted,#888);margin-bottom:8px;">${c.phone?'📞 '+c.phone:''}${c.phone&&c.email?' · ':''}${c.email?'✉️ '+c.email:''}</div>` : ''}
        <div style="display:flex;gap:5px;">
          <button onclick="ui.openClientEditorModal(${idx})" style="flex:1;background:rgba(99,102,241,0.12);border:1px solid rgba(99,102,241,0.25);color:#818cf8;border-radius:8px;padding:7px;cursor:pointer;font-size:11px;font-weight:600;"><i class="fa-solid fa-pen"></i> Modifier</button>
          <button onclick="ui._scSwitchTab('fc');document.getElementById('scFCParentSel')&&(document.getElementById('scFCParentSel').value='${c.id}')&&ui._scRenderFCPane()" style="flex:1;background:rgba(34,197,94,0.1);border:1px solid rgba(34,197,94,0.25);color:#22c55e;border-radius:8px;padding:7px;cursor:pointer;font-size:11px;font-weight:600;"><i class="fa-solid fa-users"></i> Clients finaux</button>
          <button onclick="if(confirm('Supprimer ${c.name.replace(/'/g,"\\'")} et tous ses sites/clients finaux ?')){FLEET_CONFIG.CLIENTS.splice(${idx},1);ui.saveSettingsToCloud();if(window.AlgeriaMap)AlgeriaMap.renderCustomLocations();ui.renderSettingsSC();}" style="background:rgba(239,68,68,0.08);border:1px solid rgba(239,68,68,0.2);color:#f87171;border-radius:8px;padding:7px 10px;cursor:pointer;font-size:11px;" title="Supprimer"><i class="fa-solid fa-trash"></i></button>
        </div>
      </div>`;
    }).join('');
  }

  _scFilterClients(q) { this._scRenderClients(q); }

  _scPopulateFCParent() {
    const sel = document.getElementById('scFCParentSel');
    if (!sel) return;
    const clients = FLEET_CONFIG.CLIENTS || [];
    sel.innerHTML = clients.length
      ? clients.map(c => `<option value="${c.id}">${c.emoji||''} ${c.name}</option>`).join('')
      : '<option value="">— Aucun client —</option>';
  }

  _scRenderFCPane() {
    const sel = document.getElementById('scFCParentSel');
    const container = document.getElementById('scFCList');
    if (!container || !sel) return;
    const clientId = sel.value;
    const clients = FLEET_CONFIG.CLIENTS || [];
    const client = clients.find(c => c.id === clientId);
    const fcs = client ? (client.finalClients || []) : [];

    if (!client) {
      container.innerHTML = `<div style="grid-column:1/-1;text-align:center;color:var(--text-muted,#888);padding:24px;font-size:13px;">Sélectionnez un client parent.</div>`;
      return;
    }

    if (!fcs.length) {
      container.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:28px 16px;color:var(--text-muted,#888);font-size:13px;">
        <div style="font-size:28px;margin-bottom:8px;">🤝</div>Aucun client final pour ${client.name}.</div>`;
      return;
    }

    const color = client.color || '#6366f1';
    container.innerHTML = fcs.map((fc, fcIdx) => {
      return `<div style="background:var(--bg-surface,rgba(0,0,0,0.15));border:1px solid ${color}25;border-radius:11px;padding:12px;transition:border-color 0.2s;" onmouseover="this.style.borderColor='${color}55'" onmouseout="this.style.borderColor='${color}25'">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
          <div style="width:34px;height:34px;background:${color}18;border:2px solid ${color}40;border-radius:9px;display:flex;align-items:center;justify-content:center;font-size:14px;">${fc.emoji||'🤝'}</div>
          <div>
            <div style="font-weight:700;font-size:13px;color:var(--text-primary,#e2e8f0);">${fc.name}</div>
            <div style="font-size:10px;color:${color};">sous ${client.name}</div>
          </div>
        </div>
        ${fc.phone||fc.email ? `<div style="font-size:10px;color:var(--text-muted,#888);margin-bottom:8px;">${fc.phone?'📞 '+fc.phone:''}${fc.phone&&fc.email?' · ':''}${fc.email?'✉️ '+fc.email:''}</div>` : ''}
        <div style="display:flex;gap:5px;">
          <button onclick="ui._scEditFC('${clientId}',${fcIdx})" style="flex:1;background:rgba(99,102,241,0.12);border:1px solid rgba(99,102,241,0.25);color:#818cf8;border-radius:7px;padding:6px;cursor:pointer;font-size:11px;font-weight:600;"><i class="fa-solid fa-pen"></i></button>
          <button onclick="if(confirm('Supprimer ${fc.name.replace(/'/g,"\\'")} ?')){const ci=FLEET_CONFIG.CLIENTS.findIndex(x=>x.id==='${clientId}');if(ci>-1){FLEET_CONFIG.CLIENTS[ci].finalClients.splice(${fcIdx},1);ui.saveSettingsToCloud();ui._scRenderFCPane();ui.renderSettingsSC();}}" style="background:rgba(239,68,68,0.08);border:1px solid rgba(239,68,68,0.2);color:#f87171;border-radius:7px;padding:6px 10px;cursor:pointer;font-size:11px;"><i class="fa-solid fa-trash"></i></button>
        </div>
      </div>`;
    }).join('');
  }

  _scAddFinalClientInline() {
    const sel = document.getElementById('scFCParentSel');
    const clientId = sel ? sel.value : null;
    const clients = FLEET_CONFIG.CLIENTS || [];
    const ci = clients.findIndex(c => c.id === clientId);
    if (ci < 0) { if (window.showToast) showToast('Sélectionnez un client parent', 'warning'); return; }

    const name = prompt('Nom du client final :');
    if (!name || !name.trim()) return;
    const emoji = prompt('Emoji (optionnel) :', '🤝') || '🤝';
    const phone = prompt('Téléphone (optionnel) :', '') || '';
    const email = prompt('Email (optionnel) :', '') || '';

    if (!FLEET_CONFIG.CLIENTS[ci].finalClients) FLEET_CONFIG.CLIENTS[ci].finalClients = [];
    FLEET_CONFIG.CLIENTS[ci].finalClients.push({
      id: 'fc_' + Date.now(),
      name: name.trim(),
      emoji, phone, email
    });
    this.saveSettingsToCloud();
    this._scRenderFCPane();
    this.renderSettingsSC();
    if (window.showToast) showToast('Client final ajouté ✅', 'success');
  }

  _scEditFC(clientId, fcIdx) {
    const ci = (FLEET_CONFIG.CLIENTS||[]).findIndex(c => c.id === clientId);
    if (ci < 0) return;
    const fc = FLEET_CONFIG.CLIENTS[ci].finalClients[fcIdx];
    const name = prompt('Nom du client final :', fc.name);
    if (!name || !name.trim()) return;
    fc.name = name.trim();
    fc.emoji = prompt('Emoji :', fc.emoji||'🤝') || fc.emoji;
    fc.phone = prompt('Téléphone :', fc.phone||'') || '';
    fc.email = prompt('Email :', fc.email||'') || '';
    this.saveSettingsToCloud();
    this._scRenderFCPane();
    if (window.showToast) showToast('Client final modifié ✅', 'success');
  }

  _scMapPick() {
    // Close settings panel, navigate to map, then start map picker
    const settingsPanel = document.getElementById('settingsPanel') || document.querySelector('.settings-panel') || document.querySelector('[id*="settings"]');
    // Hide settings sidebar if visible
    const sidebar = document.querySelector('.side-panel.active, .settings-sidebar, #settingsSidebar');
    if (sidebar) sidebar.classList.remove('active');
    // Switch to map view
    if (window.app && app.switchTab) app.switchTab('map');
    else if (document.getElementById('mapView')) {
      document.querySelectorAll('.tab-content').forEach(el => el.style.display = 'none');
      const mv = document.getElementById('mapView'); if (mv) mv.style.display = '';
    }
    // Start map picker after a brief delay to ensure map is visible
    setTimeout(() => {
      if (window.ui && ui._startZoneMapPicker) {
        ui._startZoneMapPicker({ fromSettings: true });
      }
    }, 300);
  }

  loadGlobalSettingsToUI() {
    this.defaultFuelCapacity.value = FLEET_CONFIG.DEFAULT_TRUCK_CONFIG.fuelTankCapacity;
    this.defaultFuelConsumption.value = FLEET_CONFIG.DEFAULT_TRUCK_CONFIG.fuelConsumption;
    this.defaultFuelPrice.value = FLEET_CONFIG.DEFAULT_TRUCK_CONFIG.fuelPricePerLiter;
    if (this.defaultNaftalPrice) {
        this.naftalPricePerLiter = FLEET_CONFIG.DEFAULT_TRUCK_CONFIG.naftalPricePerLiter || 31;
        this.defaultNaftalPrice.value = this.naftalPricePerLiter;
    }
    this.defaultSecurityMargin.value = FLEET_CONFIG.DEFAULT_TRUCK_CONFIG.fuelSecurityMargin;
    this.defaultFuelThreshold.value = FLEET_CONFIG.DEFAULT_TRUCK_CONFIG.fuelAlertThreshold;
    this.defaultCriticalLevel.value = FLEET_CONFIG.DEFAULT_TRUCK_CONFIG.criticalFuelLevel;
    if (this.defaultVidangeStart) this.defaultVidangeStart.value = FLEET_CONFIG.DEFAULT_TRUCK_CONFIG.vidangeStartKm || 5000;
    if (this.defaultVidangeRot) this.defaultVidangeRot.value = FLEET_CONFIG.DEFAULT_TRUCK_CONFIG.vidangeRotationKm || 25000;
    this.defaultVidangeAlert.value = FLEET_CONFIG.DEFAULT_TRUCK_CONFIG.vidangeAlertKm || 500;

    if (FLEET_CONFIG.DEFAULT_TRUCK_CONFIG.calibration && Array.isArray(FLEET_CONFIG.DEFAULT_TRUCK_CONFIG.calibration)) {
      const text = FLEET_CONFIG.DEFAULT_TRUCK_CONFIG.calibration.map(item => `${item.x}=${item.y}`).join('\n');
      this.defaultCalibration.value = text;
    }

    if(this.geoapifyApiKeysInput && FLEET_CONFIG.GEOAPIFY_API_KEYS) {
        this.geoapifyApiKeysInput.value = FLEET_CONFIG.GEOAPIFY_API_KEYS.join('\n');
    }
  }

  attachEventListeners() {
    this.startBtn.addEventListener('click', () => this.startTracking());
    this.stopBtn.addEventListener('click', () => this.stopTracking());
    
    if(document.getElementById('saveDefaultsBtn')) document.getElementById('saveDefaultsBtn').addEventListener('click', () => this.saveDefaultsAndRefresh());
    if(this.addCustomLocBtn) this.addCustomLocBtn.addEventListener('click', () => this.addCustomLocation());
    if(document.getElementById('addClientBtn')) document.getElementById('addClientBtn').addEventListener('click', () => this.addClient());
    if(this.saveConnectionBtn) this.saveConnectionBtn.addEventListener('click', () => this.saveConnectionSettings());



    if(document.getElementById('exportCSVBtn')) document.getElementById('exportCSVBtn').addEventListener('click', () => this.exportCSV());
    if(document.getElementById('exportJSONBtn')) document.getElementById('exportJSONBtn').addEventListener('click', () => this.exportJSON());
    if(document.getElementById('clearHistoryBtn')) document.getElementById('clearHistoryBtn').addEventListener('click', () => this.clearHistory());
    
    if (this.globalSearchInput) { this.globalSearchInput.addEventListener('input', (e) => {
        this.searchQuery = e.target.value.toLowerCase().trim();
        const count = document.getElementById('searchResultCount');
        if (count) {
          if (this.searchQuery && app && typeof app.getAllTrucks === 'function') {
            const trucks = app.getAllTrucks() || [];
            const matched = this.filterBySearch(trucks).length;
            count.style.display = 'inline-block';
            count.textContent = matched;
          } else {
            count.style.display = 'none';
          }
        }
        const activeTab = document.querySelector('.tab-content.active');
        if (activeTab && activeTab.id === 'dashboard') {
          this.updateDashboard();
        } else {
          this._showSearchPopover();
        }
    });
    }
    if (this.globalSearchInput) { this.globalSearchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && this.searchQuery) {
          this.switchTab('dashboard');
          this.updateDashboard();
          const pop = document.getElementById('searchPopover');
          if (pop) pop.remove();
        } else if (e.key === 'Escape') {
          this.globalSearchInput.value = '';
          this.searchQuery = '';
          this.updateDashboard();
          const pop = document.getElementById('searchPopover');
          if (pop) pop.remove();
          this.globalSearchInput.blur();
          const count = document.getElementById('searchResultCount');
          if (count) count.style.display = 'none';
        }
    }); }

    document.addEventListener('click', (e) => {
      if (!e.target.closest('#globalSearchOverlay') && !e.target.closest('#searchPopover')) {
        const pop = document.getElementById('searchPopover');
        if (pop) pop.remove();
      }
    });
    
    // REFUEL EVENTS
    if (this.applyRefuelFiltersBtn) {
        this.applyRefuelFiltersBtn.addEventListener('click', () => {
            this.refuelCurrentPage = 1; 
            this.fetchAndRenderRefuels();
        });
    }
    if (this.exportRefuelsBtn) {
        this.exportRefuelsBtn.addEventListener('click', () => this.exportRefuelsCSV());
    }
    if (this.refuelRescanBtn) {
        this.refuelRescanBtn.addEventListener('click', () => this.rebuildRefuelHistory(false));
    }
    if (this.refuelCleanRescanBtn) {
        this.refuelCleanRescanBtn.addEventListener('click', () => this.rebuildRefuelHistory(true));
    }
    if (this.refuelSortSelect) {
        this.refuelSortSelect.addEventListener('change', (e) => {
            this.refuelSortOrder = e.target.value;
            this.renderFilteredRefuels();
        });
    }

    // DECOUCHAGE EVENTS (NEW)
    if (this.applyDecouchageFiltersBtn) {
        this.applyDecouchageFiltersBtn.addEventListener('click', () => this.fetchAndRenderDecouchages());
    }
    if (this.exportDecouchageBtn) {
        this.exportDecouchageBtn.addEventListener('click', () => this.exportDecouchageCSV());
    }

    // MAINTENANCE EVENTS
    if (this.applyMaintFiltersBtn) {
        this.applyMaintFiltersBtn.addEventListener('click', () => {
            this.maintCurrentPage = 1;
            this.renderMaintenanceList();
        });
    }
    if (this.exportMaintBtn) {
        this.exportMaintBtn.addEventListener('click', () => this.exportMaintenanceCSV());
    }
  }

  // =========================================================
  // 🚀 REPORT TOGGLE LOGIC
  // =========================================================
  toggleReportView(type) {
      this.currentReportView = type;
      const fuelBtn = this.btnReportFuel;
      const decBtn = this.btnReportDecouchage;
      const naftalBtn = document.getElementById('btnReportNaftal');
      const fuelSec = this.reportFuelSection;
      const decSec = this.reportDecouchageSection;
      const naftalSec = document.getElementById('reportNaftalSection');

      [fuelBtn, decBtn, naftalBtn].forEach(b => b && b.classList.remove('active'));
      [fuelSec, decSec, naftalSec].forEach(s => s && (s.style.display = 'none'));

      if (type === 'fuel') {
          fuelBtn && fuelBtn.classList.add('active');
          fuelSec && (fuelSec.style.display = 'block');
          this.fetchAndRenderRefuels();
      } else if (type === 'naftal') {
          naftalBtn && naftalBtn.classList.add('active');
          naftalSec && (naftalSec.style.display = 'block');
          // Auto-set dates to current month if empty
          const ns = document.getElementById('naftalReportStart');
          const ne = document.getElementById('naftalReportEnd');
          if (ns && !ns.value) {
              const now = new Date();
              ns.value = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-01`;
              ne.value = new Date().toISOString().split('T')[0];
          }
      } else {
          decBtn && decBtn.classList.add('active');
          decSec && (decSec.style.display = 'block');
          this.fetchAndRenderDecouchages();
      }
  }

  // =========================================================
  // 🌙 DÉCOUCHAGE LOGIC (NEW)
  // =========================================================
  async fetchAndRenderDecouchages() {
      if(!this.decouchageHistoryContainer) return;
      this.decouchageHistoryContainer.innerHTML = '<div style="color:#666; text-align:center; padding:20px;"><i class="fa-solid fa-sync fa-spin"></i> Chargement découchages...</div>';
      try {
          const startNight = (this.decouchageDateStart && this.decouchageDateStart.value) || new Date().toISOString().split('T')[0];
          const endNight   = (this.decouchageDateEnd   && this.decouchageDateEnd.value)   || startNight;
          const truckFilter = ((this.decouchageTruckSearch && this.decouchageTruckSearch.value) || '').toLowerCase().trim();

          // Use server-stored decouchage records (reliable, no GPS history needed)
          let url = `${FLEET_CONFIG.API.baseUrl}/api/decouchages?limit=2000`;
          if (startNight) url += `&startDate=${encodeURIComponent(startNight)}`;
          if (endNight) url += `&endDate=${encodeURIComponent(endNight)}`;
          if (truckFilter) url += `&truck=${encodeURIComponent(truckFilter)}`;
          const r   = await fetch(url, { headers: { 'x-access-code': localStorage.getItem('fleetAccessCode') || '' } });
          if (!r.ok) throw new Error('API decouchages: ' + r.status);
          const raw = await r.json();
          const data = Array.isArray(raw) ? raw : (raw.result || raw.data || []);

          // Filter by date range and truck name
          const filtered = data.filter(d => {
              const dateOk = (!startNight || d.date >= startNight) && (!endNight || d.date <= endNight);
              const truckOk = !truckFilter || (d.truckName || '').toLowerCase().includes(truckFilter);
              return dateOk && truckOk;
          });

          this.allDecouchageLogs = filtered;
          this.renderDecouchageList();
      } catch(e) {
          console.error('fetchAndRenderDecouchages error:', e);
          this.decouchageHistoryContainer.innerHTML = `<div style="color:#e11d48; text-align:center; padding:20px;"><i class="fa-solid fa-triangle-exclamation"></i> Erreur: ${e.message}</div>`;
      }
  }

// Helper to resolve location name (Custom > Cache > Fetch)
  resolveDecouchageLocation(lat, lng, elementId = null) {
      if (!lat || !lng) return "Position Inconnue";

      // 1. Check Custom Locations (Instant)
      if (FLEET_CONFIG.CUSTOM_LOCATIONS) {
          for (const loc of FLEET_CONFIG.CUSTOM_LOCATIONS) {
              // Simple distance check (approx)
              const R = 6371e3;
              const φ1 = lat * Math.PI/180, φ2 = loc.lat * Math.PI/180;
              const Δφ = (loc.lat-lat) * Math.PI/180, Δλ = (loc.lng-lng) * Math.PI/180;
              const a = Math.sin(Δφ/2)*Math.sin(Δφ/2) + Math.cos(φ1)*Math.cos(φ2)*Math.sin(Δλ/2)*Math.sin(Δλ/2);
              const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
              const dist = R * c;
              
              if (dist <= (loc.radius || 500)) return loc.name; // Found Custom Site
          }
      }

      // 2. Check Cache (Instant)
      if (typeof geocodeService !== 'undefined') {
          const cached = geocodeService.checkCacheInstant(lat, lng);
          if (cached) return cached.formatted || `${cached.city}, ${cached.wilaya}`;
          
          // 3. Not found? Trigger fetch if we have an element to update
          if (elementId) {
              geocodeService.reverseGeocode(lat, lng).then(data => {
                  const el = document.getElementById(elementId);
                  if (el) el.innerHTML = `<strong><i class="fa-solid fa-map-pin"></i> ${data.formatted || data.city}</strong>`;
              });
              return "Recherche..."; 
          }
      }

      return `${lat.toFixed(4)}, ${lng.toFixed(4)}`; // Fallback for CSV if waiting
  }
  
  // --- HELPER: JUMP TO MAP ---
  viewOnMap(lat, lng, truckId) {
    // Step 1: Switch to map tab + ensure map canvas mode
    const mapNavBtn = document.querySelector('[data-tab="byWilaya"]');
    if (mapNavBtn) mapNavBtn.click(); else this.switchTab('byWilaya');
    if (this.zoneGroupingMode !== 'map') this.setZoneGrouping('map');

    const hasCoords = lat && lng && lat !== 0 && lng !== 0;

    const attemptFly = (attempt) => {
      const am = window.AlgeriaMap;
      if (!am || !am.map) {
        if (attempt < 15) setTimeout(() => attemptFly(attempt + 1), 500);
        return;
      }
      try { am.map.resize(); } catch(e) {}
      const canvas = am.map.getCanvas();
      if (!canvas || canvas.width === 0) {
        if (attempt < 15) setTimeout(() => attemptFly(attempt + 1), 500);
        return;
      }

      // Select and isolate truck (this handles focus mode)
      if (truckId && am.selectTruckById) {
        am.selectTruckById(truckId);
      }

      // Then fly to actual position
      if (hasCoords) {
        am.map.flyTo({ center: [lng, lat], zoom: 16, essential: true, duration: 1800 });
      } else if (truckId && am.truckDataCache) {
        // Try to find truck in cache to get coordinates
        const t = am.truckDataCache.find(t => t.id === truckId || String(t.deviceId) === String(truckId));
        if (t && t.coordinates) {
          am.map.flyTo({ center: [t.coordinates.lng, t.coordinates.lat], zoom: 16, essential: true, duration: 1800 });
        }
      }
    };
    setTimeout(() => attemptFly(0), 600);
  }
  
renderDecouchageList() {
    const logs = this.allDecouchageLogs || [];
    const startStr = this.decouchageDateStart.value;
    const endStr = this.decouchageDateEnd.value;
    const truckFilter = this.decouchageTruckSearch.value.toLowerCase().trim();
    
    // DIRECT LOGIC: User selects "18", we show "18".
    let filtered = logs.filter(log => {
        if (truckFilter && !log.truckName.toLowerCase().includes(truckFilter)) return false;
        if (startStr && log.date < startStr) return false;
        if (endStr && log.date > endStr) return false;
        return true;
    });

    // Sort: Newest First
    filtered.sort((a, b) => new Date(b.date) - new Date(a.date));

    // Summary
    const summaryMap = new Map();
    if (typeof app !== 'undefined' && app.trucks) {
        app.getAllTrucks().forEach(t => summaryMap.set(t.name, { name: t.name, total: 0 }));
    }
    filtered.forEach(log => {
        if (!summaryMap.has(log.truckName)) summaryMap.set(log.truckName, { name: log.truckName, total: 0 });
        summaryMap.get(log.truckName).total++;
    });
    const summaryArray = Array.from(summaryMap.values()).sort((a, b) => b.total - a.total);
    this.currentDecouchageSummary = summaryArray;

    // Render Table
    let tableHtml = `<div style="max-height: 350px; overflow-y: auto; border: 1px solid var(--border); border-radius: 8px;"><table style="width:100%; border-collapse:collapse; font-size:13px; background:var(--bg-surface);"><thead style="position: sticky; top: 0; background: var(--bg-elevated); z-index: 1;"><tr style="color:var(--text-primary); text-align:left; border-bottom:2px solid var(--border);"><th style="padding:12px 15px;">Camion</th><th style="padding:12px; text-align:center;">Nuits Dehors</th></tr></thead><tbody>`;
    summaryArray.forEach((item, index) => {
        const bg = index % 2 === 0 ? 'var(--bg-surface)' : 'var(--bg-elevated)';
        const countStyle = item.total > 0 ? 'color:#dc2626; font-weight:bold; background:rgba(239,68,68,0.1); padding:2px 8px; border-radius:4px;' : 'color:var(--text-muted, #94a3b8);';
        tableHtml += `<tr style="background:${bg}; border-bottom:1px solid var(--border);"><td style="padding:10px 15px; font-weight:600; color:var(--text-primary);">${item.name}</td><td style="padding:10px; text-align:center;"><span style="${countStyle}">${item.total}</span></td></tr>`;
    });
    tableHtml += '</tbody></table></div>';
    if(this.decouchageRecapContainer) this.decouchageRecapContainer.innerHTML = tableHtml;

    // Render List
    const totalPages = Math.ceil(filtered.length / this.decouchageItemsPerPage);
    if (this.decouchageCurrentPage > totalPages) this.decouchageCurrentPage = totalPages || 1;
    const startIndex = (this.decouchageCurrentPage - 1) * this.decouchageItemsPerPage;
    const paginatedItems = filtered.slice(startIndex, startIndex + this.decouchageItemsPerPage);

    let html = '<div style="display:grid; gap:10px;">';
    paginatedItems.forEach(log => {
        const distKm = (log.distanceFromSite / 1000).toFixed(1);
        const resolvedName = log.locationName || `${log.locationAtMidnight?.lat?.toFixed(4) || '?'}, ${log.locationAtMidnight?.lng?.toFixed(4) || '?'}`;
        const detectedTime = log.detectedAt ? new Date(log.detectedAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '00:00';
        const dateStr = new Date(log.date).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
        html += `<div style="background:var(--bg-surface); border:1px solid var(--border); border-left: 5px solid var(--danger); padding:15px; border-radius:8px; display:flex; justify-content:space-between; align-items:center;"><div style="flex:1;"><div style="font-weight:bold; color:var(--text-primary);">${log.truckName}</div><div style="font-size:12px; color:var(--text-muted);">Nuit du <strong>${dateStr}</strong> · Détecté à ${detectedTime}</div></div><div style="flex:2; text-align:center;"><div onclick="ui.viewOnMap(${log.locationAtMidnight?.lat || 0}, ${log.locationAtMidnight?.lng || 0})" style="font-size:12px; color:var(--info); background:var(--info-glow); padding:6px 12px; border-radius:6px; cursor:pointer; transition:all 0.2s;"><i class="fa-solid fa-map-pin"></i> ${resolvedName} <i class="fa-solid fa-arrow-up-right-from-square" style="font-size:10px; opacity:0.6; margin-left:4px;"></i></div><div style="font-size:11px; color:var(--text-muted);">à ${distKm} km du site</div></div><div style="flex:0.5; text-align:right;"><span style="background:var(--danger-subtle); color:var(--danger); padding:4px 10px; border-radius:20px; font-size:11px; font-weight:700; border:1px solid var(--danger-glow);">🌙 Hors Site</span></div></div>`;
    });
    this.decouchageHistoryContainer.innerHTML = html + '</div>';
}
  // =========================================================================
  // 1. NATIVE FORMATTED EXCEL REFUEL EXPORT (F2)
  // =========================================================================
  exportRefuelsXLSX() {
    if (!this.allRefuelLogs || this.allRefuelLogs.length === 0) {
      if (typeof showToast === 'function') showToast('Aucun remplissage à exporter.', 'warning');
      else alert('Rien à exporter.');
      return;
    }

    const startDate = this.refuelDateStart?.value ? new Date(this.refuelDateStart.value) : null;
    const endDate = this.refuelDateEnd?.value ? new Date(this.refuelDateEnd.value) : null;
    if (endDate) endDate.setHours(23, 59, 59, 999);
    const truckSearch = (this.refuelTruckSearch?.value || '').toLowerCase().trim();
    const locationSearch = (this.refuelLocationSearch?.value || '').toLowerCase().trim();
    const locationType = this.refuelLocationTypeFilter?.value || 'all';

    const minRefuelExport = Math.max(60, parseInt((FLEET_CONFIG.REFUEL_RULES || {}).minRefuelLiters || 60));

    const processedLogs = this.allRefuelLogs.map(log => {
      const truckConfig = getTruckConfig(log.deviceId);
      const capacity = truckConfig.fuelTankCapacity || 600;

      let realAdded = Math.round(log.addedLiters || 0);
      let realTotal = Math.round(log.newLevel || 0);
      let realOld = 0;
      if (log.oldLevel && log.oldLevel > 0) {
        realOld = Math.round(log.oldLevel);
      } else if (realTotal > 0 && realAdded > 0) {
        realOld = realTotal - realAdded;
      }

      let exportLoc = log.locationName || 'Inconnu';
      let wilaya = 'Inconnue';
      const safeLat = parseFloat(log.lat || 0), safeLng = parseFloat(log.lng || 0);
      let isExternal = true;

      if (safeLat && safeLng && FLEET_CONFIG.CUSTOM_LOCATIONS) {
        for (const loc of FLEET_CONFIG.CUSTOM_LOCATIONS) {
          if (Math.round(this.getDistKm(safeLat, safeLng, loc.lat, loc.lng) * 1000) <= (loc.radius || 500)) {
            isExternal = false;
            exportLoc = loc.name;
            wilaya = loc.wilaya || 'Interne';
            break;
          }
        }
      }

      if (isExternal) {
        const cached = geocodeService.checkCacheInstant(safeLat, safeLng);
        if (cached) {
          exportLoc = (cached.formatted || cached.city || 'Lieu').replace(/,/g, ' ');
          wilaya = (cached.wilaya || 'Inconnue').replace(/,/g, ' ');
        } else if (safeLat && safeLng) {
          exportLoc = `${safeLat.toFixed(4)}, ${safeLng.toFixed(4)}`;
        }
      }

      return {
        ...log,
        lat: safeLat,
        lng: safeLng,
        realAdded,
        realTotal,
        realOld,
        capacity,
        isExternal,
        exportLoc,
        wilaya
      };
    }).filter(log => {
      const d = new Date(log.timestamp);
      if (Number(log.realAdded) < minRefuelExport) return false;
      if (startDate && d < startDate) return false;
      if (endDate && d > endDate) return false;
      if (truckSearch && !String(log.truckName || '').toLowerCase().includes(truckSearch)) return false;
      if (locationType === 'internal' && log.isExternal) return false;
      if (locationType === 'external' && !log.isExternal) return false;
      if (locationSearch && !String(log.exportLoc || '').toLowerCase().includes(locationSearch)) return false;
      return true;
    });

    if (processedLogs.length === 0) {
      if (typeof showToast === 'function') showToast('Aucun remplissage ne correspond aux filtres actifs.', 'warning');
      else alert('Aucun résultat pour les filtres sélectionnés.');
      return;
    }

    const sitePrice = parseFloat((FLEET_CONFIG.DEFAULT_TRUCK_CONFIG || {}).fuelPricePerLiter) || 29;
    const naftalPrice = this.naftalPricePerLiter || 31;

    const data = processedLogs.map(log => {
      const d = new Date(log.timestamp);
      const refuelType = log.isExternal ? 'Station Externe (Naftal)' : 'Site Interne';
      const price = log.isExternal ? naftalPrice : sitePrice;
      const cost = Math.round((log.realAdded || 0) * price);
      const dbEntry = (this.truckDbCache || []).find(x => String(x.deviceId) === String(log.deviceId));
      const cardNum = (dbEntry && dbEntry.carteNaftal) ? dbEntry.carteNaftal : '';

      return {
        date: d.toLocaleDateString('fr-FR'),
        time: d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        truckName: log.truckName || '',
        cardNumber: cardNum,
        refuelType: refuelType,
        oldLevel: log.realOld,
        addedLiters: log.realAdded,
        newLevel: log.realTotal,
        capacity: log.capacity,
        location: log.exportLoc,
        wilaya: log.wilaya,
        costDzd: cost
      };
    });

    const columns = [
      { header: 'Date', key: 'date', type: 'string' },
      { header: 'Heure', key: 'time', type: 'string' },
      { header: 'Camion', key: 'truckName', type: 'string' },
      { header: 'Carte Naftal', key: 'cardNumber', type: 'string' },
      { header: 'Type de Plein', key: 'refuelType', type: 'string' },
      { header: 'Niveau Avant (L)', key: 'oldLevel', type: 'number', format: '#,##0' },
      { header: 'Ajout (L)', key: 'addedLiters', type: 'number', format: '#,##0' },
      { header: 'Niveau Après (L)', key: 'newLevel', type: 'number', format: '#,##0' },
      { header: 'Capacité (L)', key: 'capacity', type: 'number', format: '#,##0' },
      { header: 'Lieu / Station', key: 'location', type: 'string' },
      { header: 'Wilaya', key: 'wilaya', type: 'string' },
      { header: 'Coût Estimé', key: 'costDzd', type: 'currency', format: '#,##0 "DZD"' }
    ];

    const filename = `rapport_remplissage_${new Date().toISOString().slice(0, 10)}.xlsx`;
    const sheetName = 'Remplissages';
    const title = 'RAPPORT DES PLEINS & REMPLISSAGES CARBURANT';

    if (window.ExcelExportEngine && typeof window.ExcelExportEngine.exportTableToXlsx === 'function') {
      window.ExcelExportEngine.exportTableToXlsx({
        filename,
        sheetName,
        title,
        columns,
        data,
        metadata: {
          exportedAt: new Date().toISOString(),
          totalRecords: data.length,
          activeFilters: {
            dateStart: this.refuelDateStart?.value || 'Tous',
            dateEnd: this.refuelDateEnd?.value || 'Tous',
            truckSearch: this.refuelTruckSearch?.value || 'Tous',
            minVolume: minRefuelExport
          }
        }
      });
      if (typeof showToast === 'function') showToast(`Export Excel réussi (${data.length} pleins).`, 'success');
    } else {
      let csv = "Date,Heure,Camion,Carte Naftal,Type,Avant (L),Ajout (L),Après (L),Capacité (L),Lieu,Wilaya,Coût Estimé (DA)\n";
      data.forEach(r => {
        csv += `"${r.date}","${r.time}","${r.truckName}","${r.cardNumber}","${r.refuelType}",${r.oldLevel},${r.addedLiters},${r.newLevel},${r.capacity},"${r.location}","${r.wilaya}",${r.costDzd}\n`;
      });
      this._downloadCSV(csv, filename.replace('.xlsx', '.csv'));
    }
  }

  exportRefuelsCSV() {
    this.exportRefuelsXLSX();
  }

  // =========================================================================
  // 2. NATIVE FORMATTED EXCEL DECOUCHAGE EXPORT (F4)
  // =========================================================================
  exportDecouchageXLSX() {
    if (!this.allDecouchageLogs || this.allDecouchageLogs.length === 0) {
      if (typeof showToast === 'function') showToast('Aucune donnée de découchage disponible.', 'warning');
      else alert('Aucune donnée.');
      return;
    }

    const startStr = this.decouchageDateStart?.value || '';
    const endStr = this.decouchageDateEnd?.value || '';
    const truckFilter = (this.decouchageTruckSearch?.value || '').toLowerCase().trim();

    const filtered = this.allDecouchageLogs.filter(log => {
      if (truckFilter && !String(log.truckName || '').toLowerCase().includes(truckFilter)) return false;
      if (startStr && log.date < startStr) return false;
      if (endStr && log.date > endStr) return false;
      return true;
    });

    if (filtered.length === 0) {
      if (typeof showToast === 'function') showToast('Aucun découchage pour les dates/camions sélectionnés.', 'warning');
      else alert('Rien à exporter pour les filtres sélectionnés.');
      return;
    }

    const data = filtered.map(log => {
      const detectedTime = log.detectedAt
        ? new Date(log.detectedAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
        : '00:00';
      const locName = (log.locationName || `${log.locationAtMidnight?.lat?.toFixed(4) || '?'}, ${log.locationAtMidnight?.lng?.toFixed(4) || '?'}`);
      const distKm = log.distanceFromSite ? Number((log.distanceFromSite / 1000).toFixed(1)) : 0;
      const lat = log.locationAtMidnight?.lat ? Number(log.locationAtMidnight.lat.toFixed(5)) : '';
      const lng = log.locationAtMidnight?.lng ? Number(log.locationAtMidnight.lng.toFixed(5)) : '';

      return {
        date: log.date || '',
        detectedTime: detectedTime,
        truckName: log.truckName || '',
        location: locName,
        distanceKm: distKm,
        lat: lat,
        lng: lng,
        status: 'Hors Site'
      };
    });

    const columns = [
      { header: 'Date (Nuit du)', key: 'date', type: 'string' },
      { header: 'Heure Détection', key: 'detectedTime', type: 'string' },
      { header: 'Camion', key: 'truckName', type: 'string' },
      { header: 'Lieu Constaté', key: 'location', type: 'string' },
      { header: 'Distance du Site (km)', key: 'distanceKm', type: 'number', format: '#,##0.0' },
      { header: 'Latitude', key: 'lat', type: 'number', format: '0.00000' },
      { header: 'Longitude', key: 'lng', type: 'number', format: '0.00000' },
      { header: 'Statut', key: 'status', type: 'string' }
    ];

    const filename = `decouchage_detail_${startStr || 'debut'}_${endStr || 'fin'}.xlsx`;
    const sheetName = 'Découchage Détail';
    const title = 'AUDIT DE DÉCOUCHAGE — DÉTAIL DES NUITS HORS SITE';

    if (window.ExcelExportEngine && typeof window.ExcelExportEngine.exportTableToXlsx === 'function') {
      window.ExcelExportEngine.exportTableToXlsx({
        filename,
        sheetName,
        title,
        columns,
        data,
        metadata: {
          exportedAt: new Date().toISOString(),
          totalRecords: data.length,
          activeFilters: { dateStart: startStr, dateEnd: endStr, truckSearch: truckFilter }
        }
      });
      if (typeof showToast === 'function') showToast(`Export Excel réussi (${data.length} découchages).`, 'success');
    } else {
      let csv = "Date (Nuit du),Heure Détection,Camion,Lieu,Distance du Site (km),Latitude,Longitude,Statut\n";
      data.forEach(r => {
        csv += `"${r.date}","${r.detectedTime}","${r.truckName}","${r.location.replace(/"/g, '""')}",${r.distanceKm},${r.lat},${r.lng},"${r.status}"\n`;
      });
      this._downloadCSV(csv, filename.replace('.xlsx', '.csv'));
    }
  }

  exportDecouchageCSV() {
    this.exportDecouchageXLSX();
  }

  exportDecouchageRecapXLSX() {
    let summary = this.currentDecouchageSummary;
    if (!summary || summary.length === 0) {
      const logs = this.allDecouchageLogs || [];
      const startStr = this.decouchageDateStart?.value || '';
      const endStr = this.decouchageDateEnd?.value || '';
      const truckFilter = (this.decouchageTruckSearch?.value || '').toLowerCase().trim();

      const filtered = logs.filter(log => {
        if (truckFilter && !String(log.truckName || '').toLowerCase().includes(truckFilter)) return false;
        if (startStr && log.date < startStr) return false;
        if (endStr && log.date > endStr) return false;
        return true;
      });

      const summaryMap = new Map();
      if (typeof app !== 'undefined' && app.trucks) {
        app.getAllTrucks().forEach(t => summaryMap.set(t.name, { name: t.name, total: 0 }));
      }
      filtered.forEach(log => {
        if (!summaryMap.has(log.truckName)) summaryMap.set(log.truckName, { name: log.truckName, total: 0 });
        summaryMap.get(log.truckName).total++;
      });
      summary = Array.from(summaryMap.values()).sort((a, b) => b.total - a.total);
      this.currentDecouchageSummary = summary;
    }

    if (!summary || summary.length === 0) {
      if (typeof showToast === 'function') showToast('Pas de résumé disponible à exporter.', 'warning');
      else alert('Pas de résumé disponible.');
      return;
    }

    const data = summary.map(item => ({
      truckName: item.name,
      totalNights: item.total || 0,
      status: item.total > 0 ? 'Découchage Constaté' : 'Aucun découchage'
    }));

    const columns = [
      { header: 'Camion', key: 'truckName', type: 'string' },
      { header: 'Total Nuits Dehors', key: 'totalNights', type: 'number', format: '#,##0' },
      { header: 'Diagnostic', key: 'status', type: 'string' }
    ];

    const filename = `decouchage_recap_${new Date().toISOString().slice(0, 10)}.xlsx`;
    const sheetName = 'Découchage Récap';
    const title = 'AUDIT DE DÉCOUCHAGE — SYNTHÈSE PAR CAMION';

    if (window.ExcelExportEngine && typeof window.ExcelExportEngine.exportTableToXlsx === 'function') {
      window.ExcelExportEngine.exportTableToXlsx({
        filename,
        sheetName,
        title,
        columns,
        data,
        metadata: {
          exportedAt: new Date().toISOString(),
          totalTrucks: data.length
        }
      });
      if (typeof showToast === 'function') showToast(`Export Excel récapitulatif réussi (${data.length} camions).`, 'success');
    } else {
      let csv = "Camion,Total Nuits,Diagnostic\n";
      data.forEach(r => {
        csv += `"${r.truckName}",${r.totalNights},"${r.status}"\n`;
      });
      this._downloadCSV(csv, filename.replace('.xlsx', '.csv'));
    }
  }

  exportDecouchageRecapCSV() {
    this.exportDecouchageRecapXLSX();
  }

  // 4. HELPER FOR DOWNLOADS
  _downloadCSV(csv, filename) {
      const blob = new Blob(["\uFEFF" + csv], { type: 'text/csv;charset=utf-8;' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      window.URL.revokeObjectURL(url);
  }
  
  changeDecouchagePage(direction) {
      this.decouchageCurrentPage += direction;
      this.renderDecouchageList();
  }
  
  // =========================================================
  // 🚀 RULE BASED SYSTEM LOGIC
  // =========================================================

  renderRulesList() {
      this.rulesListContainer.innerHTML = '';
      
      if (!FLEET_CONFIG.FLEET_RULES || FLEET_CONFIG.FLEET_RULES.length === 0) {
          this.rulesListContainer.innerHTML = '<div style="color:#666; font-style:italic; padding:20px;">Aucune règle définie. Tous les camions utilisent la configuration globale.</div>';
          return;
      }

      FLEET_CONFIG.FLEET_RULES.forEach((rule, index) => {
          const card = document.createElement('div');
          card.className = 'rule-card';
          
          // Generate Truck Chips
          let trucksHtml = '';
          if (rule.truckIds && rule.truckIds.length > 0) {
              trucksHtml = rule.truckIds.map(truckId => {
                 // Try to find truck name
                 const t = app.trucks.get(truckId.toString());
                 const name = t ? t.name : `ID: ${truckId}`;
                 return `<span class="truck-tag">${name} <span class="truck-tag-remove" onclick="ui.removeTruckFromRule(${index}, '${truckId}')">×</span></span>`;
              }).join('');
          } else {
              trucksHtml = '<span style="font-size:11px; color:#999;">Aucun camion assigné</span>';
          }

          // Available Trucks for Dropdown (Filter out trucks already in THIS rule or ANY rule)
          const allAssignedTruckIds = new Set();
          FLEET_CONFIG.FLEET_RULES.forEach(r => {
              if(r.truckIds) r.truckIds.forEach(id => allAssignedTruckIds.add(id.toString()));
          });
          
          const availableTrucks = app.getAllTrucks().filter(t => !allAssignedTruckIds.has(t.id.toString()));
          
          let dropdownOptions = '<option value="">+ Ajouter Camion</option>';
          availableTrucks.forEach(t => {
              dropdownOptions += `<option value="${t.id}">${t.name}</option>`;
          });

          card.innerHTML = `
              <div class="rule-header">
                  <div class="rule-title">${rule.name}</div>
                  <div class="rule-stats">${rule.truckIds ? rule.truckIds.length : 0} Camions</div>
              </div>
              
              <div style="margin-bottom:10px; font-size:12px; color:#555; display:grid; grid-template-columns:1fr 1fr; gap:5px;">
                  <div><i class="fa-solid fa-gas-pump"></i> ${Math.round(getConfiguredFuelEffectiveCapacity(rule.config) || rule.config.fuelTankCapacity || 0)}L</div>
                  <div><i class="fa-solid fa-fire"></i> ${rule.config.fuelConsumption} L/100</div>
                  <div><i class="fa-solid fa-bell"></i> Alerte ${rule.config.fuelAlertThreshold}%</div>
                  <div>${rule.config.calibration && rule.config.calibration.length > 0 ? '<i class="fa-solid fa-check-circle" style="color:green"></i> Calibré' : '<span style="color:#999">Non Calibré</span>'}</div>
                  <div style="grid-column:1 / -1;"><i class="fa-solid fa-microchip"></i> IO Gasoil: ${getConfiguredFuelSensorLabel(rule.config)}</div>
                  ${getConfiguredFuelSensorCapacitiesLabel(rule.config) ? `<div style="grid-column:1 / -1;"><i class="fa-solid fa-tank-water"></i> Capacités IO: ${getConfiguredFuelSensorCapacitiesLabel(rule.config)}</div>` : ''}
              </div>

              <div class="rule-trucks-list">
                  ${trucksHtml}
              </div>

              <div class="rule-footer">
                   <select onchange="ui.addTruckToRule(${index}, this.value)" style="border:1px solid #ddd; border-radius:4px; font-size:11px; width:120px;">
                      ${dropdownOptions}
                   </select>
                   <button class="btn-secondary btn-xs" onclick="ui.openRuleEditor(${index})"><i class="fa-solid fa-pen"></i> Modifier</button>
                   <button class="btn-secondary btn-xs" style="color:#d32f2f; border-color:#d32f2f; background:rgba(211,47,47,0.08);" onclick="ui.deleteRule(${index})"><i class="fa-solid fa-trash"></i></button>
              </div>
          `;
          this.rulesListContainer.appendChild(card);
      });
  }

  openRuleEditor(index = null) {
      this.editingRuleId = index; // Store index (or null for new)
      if (!this.ruleEditorModal) { this.ruleEditorModal = document.getElementById('ruleEditorModal'); this.ruleEditorContent = document.getElementById('ruleEditorContent'); }
      if (!this.ruleEditorModal) { console.error('ruleEditorModal not found'); return; }
      this.ruleEditorModal.style.display = 'flex';
      
      let data = {
          name: '',
          config: { ...FLEET_CONFIG.DEFAULT_TRUCK_CONFIG }
      };

      if (index !== null && FLEET_CONFIG.FLEET_RULES[index]) {
          data = FLEET_CONFIG.FLEET_RULES[index];
          // Ensure config exists
          if (!data.config) data.config = { ...FLEET_CONFIG.DEFAULT_TRUCK_CONFIG };
      }

      // Format Calibration for Textarea
      let calibText = '';
      if(data.config.calibration && Array.isArray(data.config.calibration)) {
          calibText = data.config.calibration.map(c => `${c.x}=${c.y}`).join('\n');
      }
      const fuelCapacityText = data.config.fuelSensorCapacitiesInput || getConfiguredFuelSensorCapacitiesLabel(data.config);

      // Generate Form HTML
      this.ruleEditorContent.innerHTML = `
          <div style="display:grid; grid-template-columns: 1fr 1fr; gap:15px;">
              <div class="form-group" style="grid-column: 1 / -1;">
                  <label>Nom du Groupe / Règle</label>
                  <input type="text" id="ruleName" value="${data.name}" placeholder="Ex: Camions du Sud">
              </div>

              <div class="form-group"><label>Capacité Réservoir (L)</label><input type="number" id="ruleTank" value="${data.config.fuelTankCapacity}"></div>
              <div class="form-group"><label>Consommation (L/100)</label><input type="number" id="ruleConso" value="${data.config.fuelConsumption}"></div>
              
              <div class="form-group"><label>Seuil Alerte (%)</label><input type="number" id="ruleThreshold" value="${data.config.fuelAlertThreshold}"></div>
              <div class="form-group"><label>Niveau Critique (%)</label><input type="number" id="ruleCritical" value="${data.config.criticalFuelLevel}"></div>

              <div class="form-group" style="grid-column: 1 / -1;">
                  <label>IO Gasoil (ex: io87 ou io67+io82)</label>
                  <input type="text" id="ruleFuelSensor" value="${data.config.fuelSensorInput || getConfiguredFuelSensorLabel(data.config)}" placeholder="io87 ou io67+io82">
              </div>

              <div class="form-group" style="grid-column: 1 / -1;">
                  <label>Capacité par IO (ex: io67=400, io82=300)</label>
                  <input type="text" id="ruleFuelSensorCaps" value="${fuelCapacityText}" placeholder="io67=400, io82=300">
                  <div style="font-size:12px; color:var(--text-muted, #64748b); margin-top:6px;">Chaque IO peut avoir sa propre capacité. Le système additionne ensuite les réservoirs.</div>
              </div>

              <div class="form-group"><label>1ere Vidange (km)</label><input type="number" id="ruleVidangeStart" value="${data.config.vidangeStartKm || 5000}"></div>
              <div class="form-group"><label>Rotation (km)</label><input type="number" id="ruleVidangeRot" value="${data.config.vidangeRotationKm || 25000}"></div>
              <div class="form-group"><label>Alerte avant (km)</label><input type="number" id="ruleVidangeAlert" value="${data.config.vidangeAlertKm || 500}"></div>

              <div class="calibration-box" style="grid-column: 1 / -1;">
                  <label>Calibration Spécifique (X=Y)</label>
                  <textarea id="ruleCalibration" rows="5" placeholder="0=0\n10=50...">${calibText}</textarea>
              </div>
          </div>
          <div style="margin-top:20px; text-align:right;">
              <button class="btn-primary" onclick="ui.saveRule()"><i class="fa-solid fa-save"></i> Enregistrer la Règle</button>
          </div>
      `;
  }

  closeRuleEditor() {
      this.ruleEditorModal.style.display = 'none';
      this.editingRuleId = null;
  }

  saveRule() {
      const name = document.getElementById('ruleName').value.trim();
      if (!name) { alert("Le nom de la règle est obligatoire."); return; }

      // Parse Config
      const fuelSensorInput = (document.getElementById('ruleFuelSensor').value || '').trim();
      const fuelSensorCapacitiesInput = (document.getElementById('ruleFuelSensorCaps').value || '').trim();
      const fuelSensorCapacityMap = parseFuelSensorCapacityMap(fuelSensorCapacitiesInput);
      const config = {
          fuelTankCapacity: parseInt(document.getElementById('ruleTank').value) || 600,
          fuelConsumption: parseFloat(document.getElementById('ruleConso').value) || 35,
          fuelAlertThreshold: parseInt(document.getElementById('ruleThreshold').value) || 30,
          criticalFuelLevel: parseInt(document.getElementById('ruleCritical').value) || 15,
          vidangeStartKm: parseInt(document.getElementById('ruleVidangeStart')?.value) || FLEET_CONFIG.DEFAULT_TRUCK_CONFIG.vidangeStartKm || 5000,
          vidangeRotationKm: parseInt(document.getElementById('ruleVidangeRot')?.value) || FLEET_CONFIG.DEFAULT_TRUCK_CONFIG.vidangeRotationKm || 25000,
          vidangeAlertKm: parseInt(document.getElementById('ruleVidangeAlert')?.value) || FLEET_CONFIG.DEFAULT_TRUCK_CONFIG.vidangeAlertKm || 500,
          fuelPricePerLiter: FLEET_CONFIG.DEFAULT_TRUCK_CONFIG.fuelPricePerLiter,
          fuelSecurityMargin: FLEET_CONFIG.DEFAULT_TRUCK_CONFIG.fuelSecurityMargin,
          fuelSensorInput: fuelSensorInput || getConfiguredFuelSensorLabel(FLEET_CONFIG.DEFAULT_TRUCK_CONFIG),
          fuelSensorKeys: normalizeFuelSensorKeys(fuelSensorInput || getConfiguredFuelSensorLabel(FLEET_CONFIG.DEFAULT_TRUCK_CONFIG)),
          fuelSensorCapacitiesInput: fuelSensorCapacitiesInput,
          fuelSensorCapacityMap: fuelSensorCapacityMap,
          calibration: this.parseCalibrationText(document.getElementById('ruleCalibration').value)
      };

      if (this.editingRuleId !== null) {
          // UPDATE EXISTING
          FLEET_CONFIG.FLEET_RULES[this.editingRuleId].name = name;
          FLEET_CONFIG.FLEET_RULES[this.editingRuleId].config = config;
      } else {
          // CREATE NEW
          FLEET_CONFIG.FLEET_RULES.push({
              id: 'rule_' + Date.now(),
              name: name,
              truckIds: [],
              config: config
          });
      }

      this.saveSettingsToCloud();
      this.closeRuleEditor();
      this.renderRulesList();
      alert("\u2705 Règle enregistrée !");
      this.updateDashboard(); // Refresh dash to apply new physics
  }

  deleteRule(index) {
      if(!confirm("Supprimer cette règle ? Les camions retourneront aux paramètres par défaut.")) return;
      FLEET_CONFIG.FLEET_RULES.splice(index, 1);
      this.saveSettingsToCloud();
      this.renderRulesList();
      this.updateDashboard();
  }

  addTruckToRule(ruleIndex, truckId) {
      if (!truckId) return;
      
      // Ensure truck is not in any other rule (Double check safety)
      FLEET_CONFIG.FLEET_RULES.forEach(r => {
          if (r.truckIds) {
              r.truckIds = r.truckIds.filter(id => id.toString() !== truckId.toString());
          }
      });

      // Add to target rule
      if (!FLEET_CONFIG.FLEET_RULES[ruleIndex].truckIds) FLEET_CONFIG.FLEET_RULES[ruleIndex].truckIds = [];
      FLEET_CONFIG.FLEET_RULES[ruleIndex].truckIds.push(truckId);

      this.saveSettingsToCloud();
      this.renderRulesList();
      this.updateDashboard(); // Re-calc with new settings
  }

  removeTruckFromRule(ruleIndex, truckId) {
      if(confirm("Retirer ce camion de la règle ? Il utilisera les paramètres globaux.")) {
          FLEET_CONFIG.FLEET_RULES[ruleIndex].truckIds = FLEET_CONFIG.FLEET_RULES[ruleIndex].truckIds.filter(id => id.toString() !== truckId.toString());
          this.saveSettingsToCloud();
          this.renderRulesList();
          this.updateDashboard();
      }
  }

  // --- STANDARD HELPERS ---

  parseCalibrationText(text) {
    const trimmed = text.trim();
    if (!trimmed) return [];
    const lines = trimmed.split(/[\n,]/);
    const calibrationData = lines.map(line => {
       const parts = line.split(/[=:]/);
       if(parts.length < 2) return null;
       const x = parseFloat(parts[0].trim());
       const y = parseFloat(parts[1].trim());
       return (isNaN(x) || isNaN(y)) ? null : { x, y };
    }).filter(item => item !== null);
    
    if (calibrationData.length > 0) {
      calibrationData.sort((a, b) => a.x - b.x);
      return calibrationData;
    }
    return [];
  }

  saveDefaultsAndRefresh() {
    FLEET_CONFIG.DEFAULT_TRUCK_CONFIG.fuelTankCapacity = parseInt(this.defaultFuelCapacity.value);
    FLEET_CONFIG.DEFAULT_TRUCK_CONFIG.fuelConsumption = parseFloat(this.defaultFuelConsumption.value);
    FLEET_CONFIG.DEFAULT_TRUCK_CONFIG.fuelPricePerLiter = parseFloat(this.defaultFuelPrice.value);
    if (this.defaultNaftalPrice) {
        const naftalVal = parseFloat(this.defaultNaftalPrice.value) || 31;
        FLEET_CONFIG.DEFAULT_TRUCK_CONFIG.naftalPricePerLiter = naftalVal;
        this.naftalPricePerLiter = naftalVal;
    }
    FLEET_CONFIG.DEFAULT_TRUCK_CONFIG.fuelSecurityMargin = parseInt(this.defaultSecurityMargin.value);
    FLEET_CONFIG.DEFAULT_TRUCK_CONFIG.fuelAlertThreshold = parseInt(this.defaultFuelThreshold.value);
    FLEET_CONFIG.DEFAULT_TRUCK_CONFIG.criticalFuelLevel = parseInt(this.defaultCriticalLevel.value);
    FLEET_CONFIG.DEFAULT_TRUCK_CONFIG.vidangeStartKm = parseInt(this.defaultVidangeStart?.value) || 5000;
    FLEET_CONFIG.DEFAULT_TRUCK_CONFIG.vidangeRotationKm = parseInt(this.defaultVidangeRot?.value) || 25000;
    FLEET_CONFIG.DEFAULT_TRUCK_CONFIG.vidangeAlertKm = parseInt(this.defaultVidangeAlert.value);
    FLEET_CONFIG.DEFAULT_TRUCK_CONFIG.calibration = this.parseCalibrationText(this.defaultCalibration.value);

    // SAVE KEYS
    if(this.geoapifyApiKeysInput) {
        const raw = this.geoapifyApiKeysInput.value;
        const keys = raw.split(/[\n,]+/).map(k => k.trim()).filter(k => k.length > 0);
        FLEET_CONFIG.GEOAPIFY_API_KEYS = keys;
        if(geocodeService) geocodeService.updateKeys(keys);
    }

    // Save naftal budget to cloud
    const budgetInput = document.getElementById('naftalBudgetInput');
    if (budgetInput) {
      FLEET_CONFIG.NAFTAL_BUDGET = parseInt(budgetInput.value) || 0;
    }

    // Save NAFTAL Management settings (tolerance only - passwords are server-side)
    if (!FLEET_CONFIG.NAFTAL_MANAGEMENT) FLEET_CONFIG.NAFTAL_MANAGEMENT = {};
    const toleranceEl = document.getElementById('naftalRefillTolerance');
    if (toleranceEl) FLEET_CONFIG.NAFTAL_MANAGEMENT.refillTolerancePercent = parseInt(toleranceEl.value) || 5;

    this.saveSettingsToCloud();
    alert('\u2705 Configuration Globale sauvegardée !');
    this.updateDashboard();
  }

  saveConnectionSettings() {
    const newServerUrl = this.serverUrlInput.value.trim();
    const rawKeys = this.geoapifyApiKeysInput ? this.geoapifyApiKeysInput.value : '';
    const keysArray = rawKeys.split(/[\n,]+/).map(k => k.trim()).filter(k => k.length > 0);

    FLEET_CONFIG.API.baseUrl = newServerUrl;
    FLEET_CONFIG.GEOAPIFY_API_KEYS = keysArray;
    
    localStorage.setItem('fleetServerUrl', newServerUrl);

    if(geocodeService) geocodeService.updateKeys(keysArray);

    this.saveSettingsToCloud();
    alert('\u2705 Paramètres de connexion enregistrés !');
    if (app && app.isRunning) this.startTracking();
  }

  switchTab(tabName) {
    document.querySelectorAll('.tab-button').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    const btn = document.querySelector(`[data-tab="${tabName}"]`);
    if (btn) btn.classList.add('active');
    const content = document.getElementById(tabName);
    if (content) content.classList.add('active');

    if (tabName === 'disponibiliteSection') {
      this.renderDisponibiliteSection();
    }
    if (tabName === 'byWilaya') {
        // Always open in map mode
        this.setZoneGrouping('map');
        setTimeout(() => {
            if(window.AlgeriaMap && window.AlgeriaMap.map) {
                window.AlgeriaMap.map.resize();
                window.AlgeriaMap.updateMarkers(app.getAllTrucks());
            }
        }, 120);
    }
    if (tabName === 'fuelSection') this.renderFuelSection();
    if (tabName === 'vidangeSection') this.renderVidangeSection(); 
    if (tabName === 'maintenanceFollowup') this.refreshMaintenanceFollowup();
    if (tabName === 'maintenanceHistory') this.fetchAndRenderMaintenance(); 
    if (tabName === 'routing') { this.loadTruckDbCache().then(() => this.renderNaftalSystem()); }
    if (tabName === 'alertsSection') this.refreshAlerts();
    if (tabName === 'settings') { 
        this.loadAutoBackups();
        this.renderRulesList();
        if (typeof this.detectPotentialZones === 'function') this.detectPotentialZones();
        // Load truck metadata in settings
        this.loadTruckDbCache().then(() => this.populateSettingsTruckSelect());
        // Restore Naftal budget input from cloud config
        const budgetEl = document.getElementById('naftalBudgetInput');
        if (budgetEl && FLEET_CONFIG.NAFTAL_BUDGET) {
          budgetEl.value = FLEET_CONFIG.NAFTAL_BUDGET;
        }
        // Restore NAFTAL management settings
        const nm = FLEET_CONFIG.NAFTAL_MANAGEMENT || {};
        const tolEl = document.getElementById('naftalRefillTolerance');
        if (tolEl && nm.refillTolerancePercent) tolEl.value = nm.refillTolerancePercent;
    }
    if (tabName === 'reports') { 
        this.toggleReportView('fuel'); 
    }
    if (tabName === 'transportReport' && window.transportReportSection && typeof window.transportReportSection.onTabOpen === 'function') {
        window.transportReportSection.onTabOpen();
    }
  }

  async autoStartTracking() {
    if(this.serverUrlInput) this.serverUrlInput.value = FLEET_CONFIG.API.baseUrl;

    let savedInterval = localStorage.getItem('fleetPollInterval');
    let intervalMs = FLEET_CONFIG.DEFAULT_POLL_INTERVAL || 180000; 
    
    if (savedInterval) {
        let val = parseInt(savedInterval);
        if (val < 1000) intervalMs = val * 1000;
        else intervalMs = val;
    }
    
    this.pollIntervalInput.value = Math.floor(intervalMs / 1000);
    FLEET_CONFIG.UI.pollInterval = intervalMs;

    this.startBtn.disabled = true;
    this.stopBtn.disabled = false;
    
    await this.fetchAndUpdateTrucks();
    if (app.pollInterval) clearInterval(app.pollInterval);
    app.pollInterval = setInterval(() => this.fetchAndUpdateTrucks(), FLEET_CONFIG.UI.pollInterval);
  }

  async startTracking() {
    FLEET_CONFIG.API.baseUrl = this.serverUrlInput.value;
    let inputSeconds = parseInt(this.pollIntervalInput.value);
    
    if (isNaN(inputSeconds) || inputSeconds < 5) inputSeconds = 5;

    FLEET_CONFIG.UI.pollInterval = inputSeconds * 1000;
    localStorage.setItem('fleetServerUrl', FLEET_CONFIG.API.baseUrl);
    localStorage.setItem('fleetPollInterval', inputSeconds.toString());
    
    this.startBtn.disabled = true;
    this.stopBtn.disabled = false;
    
    if (app.pollInterval) clearInterval(app.pollInterval);
    await this.fetchAndUpdateTrucks();
    app.pollInterval = setInterval(() => this.fetchAndUpdateTrucks(), FLEET_CONFIG.UI.pollInterval);
  }

  stopTracking() {
    if (app && app.pollInterval) {
      clearInterval(app.pollInterval);
      app.pollInterval = null;
    }
    this.startBtn.disabled = false;
    this.stopBtn.disabled = true;
  }

  async fetchAndUpdateTrucks() {
    try {
      if (this.loadingContainer.innerHTML !== '') {
          this.loadingContainer.innerHTML = '<div style="text-align: center; padding: 20px; color: #666;"><i class="fa-solid fa-sync fa-spin"></i> Mise à jour...</div>';
      }
      this.errorContainer.innerHTML = '';

      // \u2705 Periodic settings refresh (keeps vidange overrides + rules synced without manual reload)
      const now = Date.now();
      if (!this.lastSettingsSync || (now - this.lastSettingsSync) > this.settingsSyncIntervalMs) {
        await this.loadSettingsFromCloud();
      }
      
      const response = await fetch(`${FLEET_CONFIG.API.baseUrl}${FLEET_CONFIG.API.trucksEndpoint}`);
      if (!response.ok) throw new Error(`Erreur: ${response.status}`);

      const text = await response.text();
      let data;
      try { data = JSON.parse(text); } catch(e) { throw new Error('Veuillez redémarrer votre serveur (node server.js) pour activer cette nouveauté !'); }
      this.loadingContainer.innerHTML = '';
      
      await app.processTruckData(data);
      app.recordHistory();
      this.updateDashboard();

      // \u2705 Smart Tracker: runs every poll cycle in background (1h/500m cluster detection)
      // This keeps _stopTracker timestamps fresh so Zone Management shows accurate data
      try { if (typeof this.detectPotentialZones === 'function') this.detectPotentialZones(); } catch(e) {}

    } catch (error) {
      this.loadingContainer.innerHTML = '';
      console.error(error);
      this.showError(`❌ Erreur connexion: ${error.message}`);
    }
  }

  _showSearchPopover() {
    const old = document.getElementById('searchPopover');
    if (old) old.remove();
    if (!this.searchQuery) return;
    if (!app || typeof app.getAllTrucks !== 'function') return;
    const results = this.filterBySearch(app.getAllTrucks() || []).slice(0, 8);
    if (results.length === 0) return;
    const overlay = document.getElementById('globalSearchOverlay');
    if (!overlay) return;
    const rect = overlay.getBoundingClientRect();
    const pop = document.createElement('div');
    pop.id = 'searchPopover';
    pop.style.cssText = `position:fixed; top:${rect.bottom + 6}px; right:20px; z-index:9999; background:var(--bg-elevated, #1e293b); border:1px solid rgba(56,189,248,0.3); border-radius:12px; padding:8px; min-width:300px; box-shadow:0 12px 40px rgba(0,0,0,0.4); backdrop-filter:blur(10px);`;
    const header = `<div style="font-size:10px; color:var(--text-muted, #64748b); font-weight:700; padding:4px 8px; text-transform:uppercase; letter-spacing:1px;">${results.length} camion${results.length > 1 ? 's' : ''} trouvé${results.length > 1 ? 's' : ''} — Enter: Dashboard | Esc: Fermer</div>`;
    const rows = results.map(t => {
      const db = (this.truckDbCache || []).find(d => d.deviceId === t.id) || {};
      const speedBadge = t.speed >= 1
        ? `<span style="background:#dcfce7; color:#166534; font-size:9px; padding:2px 6px; border-radius:10px; font-weight:700;">⚡ ${t.speed}km/h</span>`
        : `<span style="background:var(--bg-elevated,#f1f5f9); color:var(--text-muted, #64748b); font-size:9px; padding:2px 6px; border-radius:10px;">STOP</span>`;
      const lat = t.coordinates?.lat || t.position?.lat || t.lat || 0;
      const lng = t.coordinates?.lng || t.position?.lng || t.lng || 0;
      return `<div style="padding:8px 10px; border-radius:8px; cursor:pointer; display:flex; justify-content:space-between; align-items:center; gap:8px; transition:background 0.15s;" onmouseover="this.style.background='rgba(56,189,248,0.1)'" onmouseout="this.style.background='transparent'">
        <div onclick="ui.switchTab('dashboard'); ui.updateDashboard();" style="flex:1;">
          <div style="font-weight:700; color:#f8fafc; font-size:13px;">${t.name}</div>
          <div style="font-size:10px; color:var(--text-muted, #94a3b8);">${t.location?.city || ''} ${db.carteNaftal ? '<span style=color:#c4b5fd;font-family:monospace;>' + db.carteNaftal + '</span>' : ''}</div>
        </div>
        <div style="display:flex; gap:6px; align-items:center;">
          ${speedBadge}
          ${lat ? `<button onclick="event.stopPropagation(); ui.viewOnMap(${lat}, ${lng}); document.getElementById('searchPopover')?.remove();" style="background:rgba(56,189,248,0.15);border:1px solid rgba(56,189,248,0.3);color:#38bdf8;border-radius:6px;padding:3px 6px;font-size:9px;cursor:pointer;font-weight:700;">\ud83d\udccd</button>` : ''}
        </div>
      </div>`;
    }).join('');
    pop.innerHTML = header + rows;
    document.body.appendChild(pop);
  }

  updateDashboard() {

    requestAnimationFrame(() => {
        const _activeEl = document.querySelector('.tab-content.active'); if(!_activeEl) return; const activeTab = _activeEl.id;
        
        if (activeTab === 'dashboard') { 
            this.renderStats(); 
            this.renderTrucks(); 
        } 
        else if (activeTab === 'byWilaya') { 
            if (this.zoneGroupingMode === 'map') {
                if (window.AlgeriaMap && app) {
                    window.AlgeriaMap.updateMarkers(app.getAllTrucks());
                }
            } else {
                this.renderWilayaView(); 
            }
        } 
        else if (activeTab === 'fuelSection') { this.renderFuelSection(); } 
        else if (activeTab === 'vidangeSection') { this.renderVidangeSection(); }
    });
  }

  filterBySearch(trucks) {
    if (!this.searchQuery) return trucks;
    const q = this.searchQuery;
    return trucks.filter(t => {
      if (t.name.toLowerCase().includes(q)) return true;
      const db = (this.truckDbCache || []).find(d => d.deviceId === t.id);
      if (!db) return false;
      if (db.immatriculation && db.immatriculation.toLowerCase().includes(q)) return true;
      if (db.chassisNumber && db.chassisNumber.toLowerCase().includes(q)) return true;
      if (db.carteNaftal && db.carteNaftal.toLowerCase().includes(q)) return true;
      return false;
    });
  }

  renderStats() {
    const stats = app.getFleetStats();
    const allTrucks = app.getAllTrucks();
    const movingCount = allTrucks.filter(t => t.speed >= 1).length;
    const stoppedCount = allTrucks.filter(t => t.speed < 1).length;
    const gpsCutCount = allTrucks.filter(t => t.isGpsCut).length;

    // Document counts from loaded refs
    const refs = this._vehicleRefs || [];
    const now = new Date();
    const expiredDocs = refs.filter(r => new Date(r.expiryDate) < now).length;
    const soonDocs = refs.filter(r => {
      const d = new Date(r.expiryDate); const days = Math.ceil((d - now) / 86400000);
      return days >= 0 && days <= (r.reminderDays || 30);
    }).length;
    const docAlert = expiredDocs > 0 ? expiredDocs : soonDocs;
    const docColor = expiredDocs > 0 ? '#ef4444' : soonDocs > 0 ? '#f97316' : '#8b5cf6';
    const docGrad = expiredDocs > 0 ? 'linear-gradient(135deg,#ef4444,#dc2626)' : soonDocs > 0 ? 'linear-gradient(135deg,#f97316,#ea580c)' : 'linear-gradient(135deg,#8b5cf6,#7c3aed)';

    const createCard = (label, value, grad, filterType, icon, badge) => {
      const isActive = this.currentFilter === filterType;
      const safeLabel = label.replace(/'/g, "\\'");
      // Extract the accent color from the gradient for the left bar
      const accentColors = {
        'all': '#3b82f6', 'moving': '#10b981', 'stopped': '#57534e',
        'gps_cut': '#64748b', 'critical': '#ef4444', 'vidange': '#f59e0b'
      };
      const ac = accentColors[filterType] || '#3b82f6';
      return `
        <div class="stat-card ${isActive ? 'active-filter' : ''}"
             data-type="${filterType}"
             onclick="ui.setFilter('${filterType}', '${safeLabel}')"
             style="background:var(--bg-surface); cursor:pointer; border-radius:12px;
                    border:1px solid ${isActive ? ac : 'var(--border)'};
                    box-shadow: ${isActive ? '0 0 0 2px ' + ac + '25' : '0 1px 3px rgba(0,0,0,0.06)'};
                    transition: all .2s ease; position:relative; overflow:hidden;"
             onmouseenter="this.style.transform='translateY(-2px)'; this.style.boxShadow='0 4px 12px rgba(0,0,0,0.1)'; this.style.borderColor='${ac}'"
             onmouseleave="this.style.transform=''; this.style.boxShadow='${isActive ? '0 0 0 2px ' + ac + '25' : '0 1px 3px rgba(0,0,0,0.06)'}'; this.style.borderColor='${isActive ? ac : 'var(--border)'}'"> 
          <div style="position:absolute;top:0;left:0;width:4px;height:100%;background:${ac};border-radius:4px 0 0 4px;"></div>
          <div style="display:flex;align-items:center;gap:12px;padding:4px 4px 4px 10px;">
            <div style="width:40px;height:40px;border-radius:10px;background:${ac}14;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
              <span style="color:${ac};font-size:16px;">${icon}</span>
            </div>
            <div style="flex:1;min-width:0;">
              <div style="font-size:10px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;">${label}</div>
              <div style="font-size:28px;font-weight:900;color:var(--text-primary);line-height:1.1;letter-spacing:-0.5px;margin-top:2px;">${value}</div>
            </div>
          </div>
          ${isActive ? '<div style="position:absolute;bottom:0;left:0;right:0;height:2px;background:' + ac + ';"></div>' : ''}
        </div>
      `;
    };

    // Documents card — special: opens panel instead of filter
    const docCardHtml = `
      <div class="stat-card ${this.currentFilter === 'docs' ? 'active-filter' : ''}"
           data-type="docs"
           onclick="ui.toggleDocPanel()"
           style="background:var(--bg-surface); cursor:pointer; border-radius:12px;
                  border:1px solid ${this.currentFilter === 'docs' ? docColor : 'var(--border)'};
                  box-shadow: ${this.currentFilter === 'docs' ? '0 0 0 2px ' + docColor + '25' : '0 1px 3px rgba(0,0,0,0.06)'};
                  transition: all .2s ease; position:relative; overflow:hidden;"
           onmouseenter="this.style.transform='translateY(-2px)'; this.style.boxShadow='0 4px 12px rgba(0,0,0,0.1)'; this.style.borderColor='${docColor}'"
           onmouseleave="this.style.transform=''; this.style.boxShadow='${this.currentFilter === 'docs' ? '0 0 0 2px ' + docColor + '25' : '0 1px 3px rgba(0,0,0,0.06)'}'; this.style.borderColor='${this.currentFilter === 'docs' ? docColor : 'var(--border)'}'"> 
        <div style="position:absolute;top:0;left:0;width:4px;height:100%;background:${docColor};border-radius:4px 0 0 4px;"></div>
        <div style="display:flex;align-items:center;gap:12px;padding:4px 4px 4px 10px;">
          <div style="width:40px;height:40px;border-radius:10px;background:${docColor}14;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
            <span style="color:${docColor};font-size:16px;"><i class="fa-solid fa-file-shield"></i></span>
          </div>
          <div style="flex:1;min-width:0;">
            <div style="font-size:10px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;">Documents</div>
            <div style="font-size:28px;font-weight:900;color:var(--text-primary);line-height:1.1;letter-spacing:-0.5px;margin-top:2px;">${refs.length}</div>
            <div style="font-size:9px;color:var(--text-muted);margin-top:2px;font-weight:600;">
              ${expiredDocs > 0 ? `<span style="color:#ef4444;">⛔ ${expiredDocs} expiré${expiredDocs>1?'s':''}</span> ` : ''}
              ${soonDocs > 0 ? `<span style="color:#f97316;">⚠️ ${soonDocs} bientôt</span>` : ''}
              ${expiredDocs === 0 && soonDocs === 0 ? '<span style="color:#10b981;">✅ Tout valide</span>' : ''}
            </div>
          </div>
        </div>
        ${this.currentFilter === 'docs' ? '<div style="position:absolute;bottom:0;left:0;right:0;height:2px;background:' + docColor + ';"></div>' : ''}
      </div>
    `;

    this.statsContainer.innerHTML = `
      ${createCard('Tous', stats.totalTrucks, 'linear-gradient(135deg,#1e3a8a,#3b82f6)', 'all', '<i class="fa-solid fa-list"></i>', '✓ ACTIF')}
      ${createCard('En Route', movingCount, 'linear-gradient(135deg,#064e3b,#10b981)', 'moving', '<i class="fa-solid fa-truck-fast"></i>', '')}
      ${createCard('À l\'arrêt', stoppedCount, 'linear-gradient(135deg,#1c1917,#57534e)', 'stopped', '<i class="fa-solid fa-circle-stop"></i>', '')}
      ${createCard('Coupure GPS', gpsCutCount, 'linear-gradient(135deg,var(--bg-elevated, #1e293b),var(--text-muted, #64748b))', 'gps_cut', '<i class="fa-solid fa-satellite-dish"></i>', '')}
      ${createCard('Carburant Critique', stats.criticalCount, 'linear-gradient(135deg,#7c2d12,#ef4444)', 'critical', '<i class="fa-solid fa-gas-pump"></i>', '')}
      ${createCard('Vidange', stats.vidangeCount, 'linear-gradient(135deg,#78350f,#f59e0b)', 'vidange', '<i class="fa-solid fa-wrench"></i>', '')}
      ${docCardHtml}
    `;

    // Render doc panel if it was open
    if (this._docPanelOpen) this.renderDocPanel();
  }

  toggleDocPanel() {
    this._docPanelOpen = !this._docPanelOpen;
    const old = document.getElementById('docExpiryPanel');
    if (old) old.remove();
    if (this._docPanelOpen) {
      this.currentFilter = 'docs';
      if (this.activeFilterDisplay) this.activeFilterDisplay.style.display = 'flex';
      if (this.filterName) this.filterName.textContent = 'Documents';
      this.renderDocPanel();
      this.renderTrucks();
      this.renderStats();
    } else {
      this.currentFilter = 'all';
      if (this.activeFilterDisplay) this.activeFilterDisplay.style.display = 'none';
      this._docStatusFilter = 'all';
      this._docTypeFilter = 'all';
      this.renderTrucks();
      this.renderStats();
    }
  }

  renderDocPanel() {
    const existing = document.getElementById('docExpiryPanel');
    if (existing) existing.remove();

    const refs = this._vehicleRefs || [];
    const now = new Date();
    const activeDocType = this._docTypeFilter || 'all';
    const activeStatus = this._docStatusFilter || 'all';

    // Collect unique doc types
    const types = [...new Set(refs.map(r => r.refName))].sort();

    const enriched = refs.map(r => {
      const exp = new Date(r.expiryDate);
      const days = Math.ceil((exp - now) / 86400000);
      let status;
      if (days < 0) status = 'expired';
      else if (days <= (r.reminderDays || 30)) status = 'soon';
      else status = 'valid';
      return { ...r, days, status, exp };
    }).sort((a, b) => a.days - b.days);

    let filtered = enriched;
    if (activeDocType !== 'all') filtered = filtered.filter(r => r.refName === activeDocType);
    if (activeStatus !== 'all') filtered = filtered.filter(r => r.status === activeStatus);

    const statusColors = { expired: '#ef4444', soon: '#f97316', valid: '#22c55e' };
    const statusLabels = { expired: '⛔ Expiré', soon: '\u26a0\ufe0f Bientôt', valid: '\u2705 Valide' };

    const panel = document.createElement('div');
    panel.id = 'docExpiryPanel';
    panel.style.cssText = `
      margin: 0 0 12px 0; background: var(--bg-surface); border: 1px solid var(--border-color);
      border-radius: 14px; padding: 16px; animation: fadeIn .2s ease;
    `;
    panel.innerHTML = `
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;">
        <i class="fa-solid fa-file-shield" style="color:#8b5cf6;font-size:18px;"></i>
        <span style="font-weight:800;font-size:14px;">Documents Véhicules</span>
        <span style="font-size:11px;color:var(--text-muted);margin-left:4px;">${refs.length} documents • ${enriched.filter(r=>r.status==='expired').length} expirés • ${enriched.filter(r=>r.status==='soon').length} bientôt</span>
        <button onclick="ui.toggleDocPanel()" style="margin-left:auto;background:none;border:none;cursor:pointer;color:var(--text-muted);font-size:16px;"><i class="fa-solid fa-xmark"></i></button>
      </div>

      <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px;">
        <span style="font-size:10px;color:var(--text-muted);align-self:center;font-weight:600;">STATUT:</span>
        ${['all','expired','soon','valid'].map(s => `
          <button onclick="ui._docStatusFilter='${s}'; ui.renderDocPanel(); ui.renderTrucks();"
            style="font-size:10px;padding:4px 12px;border-radius:20px;border:2px solid ${s==='all'?'#6366f1':s==='expired'?'#ef4444':s==='soon'?'#f97316':'#22c55e'};
                   background:${activeStatus===s?(s==='all'?'#6366f1':s==='expired'?'#ef4444':s==='soon'?'#f97316':'#22c55e'):'transparent'};
                   color:${activeStatus===s?'white':(s==='all'?'#6366f1':s==='expired'?'#ef4444':s==='soon'?'#f97316':'#22c55e')};
                   cursor:pointer;font-weight:700;transition:.15s;">
            ${s==='all'?'Tous':statusLabels[s]}
          </button>`).join('')}
      </div>

      <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px;">
        <span style="font-size:10px;color:var(--text-muted);align-self:center;font-weight:600;">TYPE:</span>
        <button onclick="ui._docTypeFilter='all'; ui.renderDocPanel(); ui.renderTrucks();"
          style="font-size:10px;padding:4px 12px;border-radius:20px;border:2px solid #8b5cf6;
                 background:${activeDocType==='all'?'#8b5cf6':'transparent'};
                 color:${activeDocType==='all'?'white':'#8b5cf6'};cursor:pointer;font-weight:700;transition:.15s;">
          Tous types
        </button>
        ${types.map(t => `
          <button onclick="ui._docTypeFilter='${t.replace(/'/g,"\\'")}'; ui.renderDocPanel(); ui.renderTrucks();"
            style="font-size:10px;padding:4px 12px;border-radius:20px;border:2px solid #8b5cf6;
                   background:${activeDocType===t?'#8b5cf6':'transparent'};
                   color:${activeDocType===t?'white':'#8b5cf6'};cursor:pointer;font-weight:700;transition:.15s;">
            ${t}
          </button>`).join('')}
      </div>

      <div style="max-height:280px;overflow-y:auto;border-radius:8px;border:1px solid var(--border-color);">
        ${filtered.length === 0 ? `<div style="text-align:center;padding:30px;color:var(--text-muted);">Aucun document dans cette catégorie</div>` :
          `<table style="width:100%;border-collapse:collapse;font-size:12px;">
            <thead>
              <tr style="background:var(--bg-header,#f8fafc);position:sticky;top:0;z-index:1;">
                <th style="padding:8px 12px;text-align:left;font-size:10px;text-transform:uppercase;color:var(--text-muted);font-weight:700;">Camion</th>
                <th style="padding:8px 12px;text-align:left;font-size:10px;text-transform:uppercase;color:var(--text-muted);font-weight:700;">Type</th>
                <th style="padding:8px 12px;text-align:left;font-size:10px;text-transform:uppercase;color:var(--text-muted);font-weight:700;">N° Réf</th>
                <th style="padding:8px 12px;text-align:left;font-size:10px;text-transform:uppercase;color:var(--text-muted);font-weight:700;">Expiration</th>
                <th style="padding:8px 12px;text-align:left;font-size:10px;text-transform:uppercase;color:var(--text-muted);font-weight:700;">Statut</th>
                <th style="padding:8px 12px;text-align:center;font-size:10px;text-transform:uppercase;color:var(--text-muted);font-weight:700;">Actions</th>
              </tr>
            </thead>
            <tbody>
              ${filtered.map((r, i) => `
                <tr style="background:${i%2===0?'transparent':'rgba(0,0,0,0.02)'}; border-top:1px solid var(--border-color);">
                  <td style="padding:8px 12px;font-weight:700;">${r.truckName || '—'}</td>
                  <td style="padding:8px 12px;color:var(--text-muted);">${r.refName}</td>
                  <td style="padding:8px 12px;font-size:10px;color:var(--text-muted);">${r.refNumber || '—'}</td>
                  <td style="padding:8px 12px;font-size:11px;">${r.exp.toLocaleDateString('fr-FR')}</td>
                  <td style="padding:8px 12px;">
                    <span style="background:${statusColors[r.status]}20;color:${statusColors[r.status]};border:1px solid ${statusColors[r.status]}40;
                                 padding:2px 10px;border-radius:20px;font-size:10px;font-weight:700;">
                      ${r.days < 0 ? `⛔ +${Math.abs(r.days)}j` : r.days === 0 ? "\u26a0\ufe0f Aujourd'hui" : r.status==='soon' ? `\u26a0\ufe0f ${r.days}j` : `\u2705 ${r.days}j`}
                    </span>
                  </td>
                  <td style="padding:8px 12px; text-align:center; white-space:nowrap;">
                    <button onclick="ui.openRefModal('${r.deviceId}', '${r._id || r.id}')" title="Modifier ce document"
                      style="background:rgba(56,189,248,0.12); border:1px solid rgba(56,189,248,0.3); color:#0284c7; border-radius:6px; width:28px; height:28px; cursor:pointer; font-size:11px; margin-right:4px; display:inline-flex; align-items:center; justify-content:center;">
                      <i class="fa-solid fa-pen"></i>
                    </button>
                    <button onclick="ui.deleteReference('${r._id || r.id}')" title="Supprimer ce document"
                      style="background:rgba(239,68,68,0.12); border:1px solid rgba(239,68,68,0.3); color:#ef4444; border-radius:6px; width:28px; height:28px; cursor:pointer; font-size:11px; display:inline-flex; align-items:center; justify-content:center;">
                      <i class="fa-solid fa-trash"></i>
                    </button>
                  </td>
                </tr>`).join('')}
            </tbody>
          </table>`
        }
      </div>
    `;

    // Insert after stats container
    this.statsContainer.parentNode.insertBefore(panel, this.statsContainer.nextSibling);
  }

  renderTrucks() {
    let trucks = app.getAllTrucks();

    // ── Lag prevention: skip full DOM rebuild if data unchanged ──
    const fingerprint = trucks.map(t => `${t.id}:${t.speed}:${t.fuelLiters}:${t.odometer}:${t.coordinates?.lat?.toFixed(3)}:${t.isGpsCut}`).join('|') + '|f:' + (this.currentFilter||'all') + '|s:' + (this.searchQuery||'') + '|sf:' + (this._dashSortField||'name') + '|sd:' + (this._dashSortDir||'asc');
    if (this._lastRenderFingerprint === fingerprint && this.trucksContainer.children.length > 0) return;
    this._lastRenderFingerprint = fingerprint;

    this.trucksContainer.innerHTML = '';
    
    // Ensure Naftal/DB cache is loaded for tags on cards
    if (!this.truckDbCache || this.truckDbCache.length === 0) {
      this.loadTruckDbCache().then(() => this.renderTrucks());
      this.trucksContainer.innerHTML = '<div style="grid-column:1/-1; text-align:center; padding:30px; color:#888;"><i class="fa-solid fa-sync fa-spin"></i> Chargement base véhicules...</div>';
      return;
    }
    trucks = this.filterBySearch(trucks);

    if (this.currentFilter === 'critical') trucks = trucks.filter(t => t.isCriticalFuel);
    else if (this.currentFilter === 'low_fuel') trucks = trucks.filter(t => t.isLowFuel);
    else if (this.currentFilter === 'vidange') trucks = trucks.filter(t => t.vidange?.alert);
    else if (this.currentFilter === 'moving') trucks = trucks.filter(t => t.speed >= 1);
    else if (this.currentFilter === 'stopped') trucks = trucks.filter(t => t.speed < 1);
    else if (this.currentFilter === 'gps_cut') trucks = trucks.filter(t => t.isGpsCut);
    else if (this.currentFilter === 'docs') {
      const now = new Date();
      const activeStatus = this._docStatusFilter || 'all';
      const activeType = this._docTypeFilter || 'all';
      const refs = this._vehicleRefs || [];
      trucks = trucks.filter(truck => {
        const truckRefs = refs.filter(r => String(r.deviceId) === String(truck.id));
        return truckRefs.some(r => {
          const exp = new Date(r.expiryDate);
          const days = Math.ceil((exp - now) / 86400000);
          let st = days < 0 ? 'expired' : days <= (r.reminderDays || 30) ? 'soon' : 'valid';
          return (activeStatus === 'all' || st === activeStatus) && (activeType === 'all' || r.refName === activeType);
        });
      });
    }


    // ── Dashboard sort ─────────────────────────────────────────────
    const _dsf = this._dashSortField || localStorage.getItem('dash_sort_field') || 'name';
    const _dsd = this._dashSortDir   || localStorage.getItem('dash_sort_dir')   || 'asc';
    if (!this._dashSortField) { this._dashSortField = _dsf; this._dashSortDir = _dsd; }
    trucks = [...trucks].sort((a, b) => {
      let va, vb;
      if (_dsf === 'fuel')   { va = a.fuelPercentage||0;   vb = b.fuelPercentage||0; }
      else if (_dsf === 'speed')  { va = a.speed||0;             vb = b.speed||0; }
      else if (_dsf === 'odo')    { va = a.odometer||0;          vb = b.odometer||0; }
      else                        { va = (a.name||'').toLowerCase(); vb = (b.name||'').toLowerCase(); }
      return _dsd === 'asc' ? (va < vb ? -1 : va > vb ? 1 : 0) : (va > vb ? -1 : va < vb ? 1 : 0);
    });

    // ── Inject sort bar (once) ──────────────────────────────────────
    let _sortBar = document.getElementById('dashSortBar');
    if (!_sortBar) {
      _sortBar = document.createElement('div');
      _sortBar.id = 'dashSortBar';
      _sortBar.style.cssText = 'grid-column:1/-1;display:flex;flex-wrap:wrap;gap:6px;align-items:center;padding:8px 0;margin-bottom:2px;';
      this.trucksContainer.parentNode.insertBefore(_sortBar, this.trucksContainer);
    }
    const _darrow = f => f === _dsf ? (_dsd === 'asc' ? ' ↑' : ' ↓') : ' ⇅';
    const _dbs = (f,active) => `padding:5px 12px;border:1.5px solid ${active?'#0284c7':'var(--border,#e2e8f0)'};border-radius:20px;font-size:11px;font-weight:700;cursor:pointer;background:${active?'#0284c7':'var(--bg-elevated,#fff)'};color:${active?'#fff':'var(--text-muted,#64748b)'};transition:all 0.2s;`;
    _sortBar.innerHTML = `<span style="font-size:11px;color:var(--text-muted,#94a3b8);font-weight:700;">TRIER :</span> <button style="${_dbs('name',_dsf==='name')}" onclick="ui.setDashSort('name')">Nom${_darrow('name')}</button> <button style="${_dbs('fuel',_dsf==='fuel')}" onclick="ui.setDashSort('fuel')">&#9981; Carburant${_darrow('fuel')}</button> <button style="${_dbs('speed',_dsf==='speed')}" onclick="ui.setDashSort('speed')">&#128640; Vitesse${_darrow('speed')}</button> <button style="${_dbs('odo',_dsf==='odo')}" onclick="ui.setDashSort('odo')">&#128205; KM${_darrow('odo')}</button>`;

    if (trucks.length === 0) {
      this.trucksContainer.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 40px; color: #888; background:#111827; border-radius: 8px; color:var(--text-muted, #94a3b8);">Aucun camion ne correspond aux critères.</div>';
      return;
    }

    const _cardFragment = document.createDocumentFragment();
    trucks.forEach(truck => {
      // --- LOGIC FOR GPS CUT ---
      let isMoving = truck.speed >= 1;
      let statusHtml = '';
      let headerClass = '';
      let fuelClass = 'good';
      const speedLimit = this.getSpeedLimit();
      const isSpeeding = truck.speed > speedLimit;

      if (truck.isGpsCut) {
          statusHtml = `<span class="status-badge gps-cut"><i class="fa-solid fa-satellite-dish"></i> COUPURE GPS</span>`;
          headerClass = 'gps-cut-bg';
          fuelClass = 'critical'; // Or grey, but keeping critical to highlight issue
      } else {
          statusHtml = isMoving 
            ? `<span class="status-badge moving ${isSpeeding ? 'overspeed-blink' : ''}" ${isSpeeding ? 'style="background:var(--danger); color:white; box-shadow: 0 0 8px var(--danger);"' : ''}><i class="fa-solid fa-bolt"></i> EN ROUTE (${truck.speed} km/h)</span>`
            : `<span class="status-badge stopped"><i class="fa-solid fa-pause"></i> STOP</span>`;
          
          headerClass = isMoving ? 'moving-bg' : 'stopped-bg';
          
          if (truck.isCriticalFuel) fuelClass = 'critical';
          else if (truck.isLowFuel) fuelClass = 'warning';
      }
      
      // --- VIDANGE DISPLAY (handle overdue nicely) ---
      const vidangeKmUntil = Number(truck?.vidange?.kmUntilNext ?? 0);
      const isVidangeOverdue = truck?.vidange?.alert && vidangeKmUntil < 0;
      const vidangeTitle = isVidangeOverdue ? 'VIDANGE EN RETARD' : 'VIDANGE REQUISE';
      const vidangeColor = isVidangeOverdue ? 'var(--danger)' : 'var(--warning)';
      const vidangeBg = isVidangeOverdue ? 'rgba(239,68,68,0.1)' : 'rgba(234,179,8,0.1)';
      const vidangeRemainingText = isVidangeOverdue
        ? `En retard de ${Math.abs(vidangeKmUntil).toLocaleString()} km`
        : `${vidangeKmUntil.toLocaleString()} km restants`;
        
      // Determine card accent color matching the stat cards palette
      let cardAccentColor, cardAccentGrad;
      if (truck.isGpsCut) {
        cardAccentColor = 'var(--text-muted, #64748b)'; cardAccentGrad = 'linear-gradient(135deg,var(--text-muted, #64748b),#475569)';
      } else if (truck.isCriticalFuel) {
        cardAccentColor = '#f97316'; cardAccentGrad = 'linear-gradient(135deg,#f97316,#ea580c)';
      } else if (truck.vidange?.alert) {
        cardAccentColor = '#eab308'; cardAccentGrad = 'linear-gradient(135deg,#eab308,#ca8a04)';
      } else if (isSpeeding) {
        cardAccentColor = '#ef4444'; cardAccentGrad = 'linear-gradient(135deg,#ef4444,#dc2626)';
      } else if (truck.speed >= 1) {
        cardAccentColor = '#10b981'; cardAccentGrad = 'linear-gradient(135deg,#10b981,#059669)';
      } else {
        cardAccentColor = '#78716c'; cardAccentGrad = 'linear-gradient(135deg,#292524,#57534e)';
      }

      const nowTime = new Date();
      const hasExpiringRef = (this._vehicleRefs || []).some(ref => {
          if (String(ref.deviceId) !== String(truck.id)) return false;
          const expiry = new Date(ref.expiryDate);
          const daysLeft = Math.ceil((expiry - nowTime) / (1000 * 60 * 60 * 24));
          return daysLeft <= (ref.reminderDays || 30) && daysLeft >= 0;
      });

      const config = getTruckConfig(truck.id);
      const ruleLabel = config._ruleName ? `<div style="font-size:9px; background:var(--teal); color:white; padding:2px 4px; border-radius:2px; display:inline-block; margin-top:2px;">${config._ruleName}</div>` : '';

      const card = document.createElement('div');
      card.className = `card-premium ${isSpeeding ? 'speeding' : ''} ${truck.speed >= 1 ? 'moving' : 'stopped'} ${hasExpiringRef ? 'doc-expiring' : ''}`;
      card.style.cssText = `
        border: 1px solid var(--border);
        border-radius: 14px;
        overflow: hidden;
        box-shadow: 0 1px 3px rgba(0,0,0,0.06);
        transition: all .2s ease;
        background: var(--bg-surface);
      `;
      card.onmouseenter = () => {
        card.style.transform = 'translateY(-2px)';
        card.style.boxShadow = `0 4px 12px rgba(0,0,0,0.1)`;
        card.style.borderColor = `${cardAccentColor}`;
      };
      card.onmouseleave = () => {
        card.style.transform = '';
        card.style.boxShadow = '0 1px 3px rgba(0,0,0,0.06)';
        card.style.borderColor = 'var(--border)';
      };
      const lat = truck.coordinates?.lat || 0;
      const lng = truck.coordinates?.lng || 0;
      const mapsUrl = `https://www.google.com/maps?q=${lat},${lng}&t=k&z=17`;

      card.innerHTML = `
        <!-- ▸ Accent bar -->
        <div style="height:4px; background:${cardAccentGrad};"></div>

        <!-- ▸ Header -->
        <div class="tcm-link" style="padding:12px 14px 0; display:flex; justify-content:space-between; align-items:flex-start; cursor:pointer;" title="Voir sur Google Maps satellite">
          <div style="display:flex; align-items:center; gap:10px; min-width:0; flex:1;">
            <div style="width:36px; height:36px; border-radius:10px; background:${cardAccentGrad}; display:flex; align-items:center; justify-content:center; flex-shrink:0; box-shadow:0 3px 10px ${cardAccentColor}40;">
              ${truck.speed >= 1 ? '<i class="fa-solid fa-truck-fast" style="color:#fff; font-size:14px;"></i>' : '<i class="fa-solid fa-truck" style="color:#fff; font-size:13px;"></i>'}
            </div>
            <div style="min-width:0; flex:1;">
              <div style="font-size:15px; font-weight:900; color:var(--text-primary); letter-spacing:-0.3px;">${truck.name}</div>
              ${ruleLabel}
            </div>
          </div>
          <div style="display:flex; align-items:center; gap:5px; flex-shrink:0;">
            ${(() => {
              const db = (ui.truckDbCache || []).find(d => d.deviceId === truck.id);
              const isMoving = truck.speed >= 1;
              const sit = isMoving ? 'mission' : (db?.situation || 'disponible');
              const sitLabel = isMoving ? 'En Mission' : (sit === 'maintenance' ? 'Maintenance' : (sit === 'panne' ? 'En Panne' : (sit === 'repos' ? 'Découchage' : 'Disponible')));
              const sitColor = isMoving ? '#10b981' : (sit === 'maintenance' ? '#f59e0b' : (sit === 'panne' ? '#ef4444' : (sit === 'repos' ? '#a78bfa' : '#0284c7')));
              return `<span style="background:${sitColor}18; color:${sitColor}; border:1px solid ${sitColor}30; padding:2px 8px; border-radius:8px; font-size:9px; font-weight:800; text-transform:uppercase;">${sitLabel}</span>`;
            })()}
            <span style="background:${truck.speed >= 1 ? 'rgba(16,185,129,0.12)' : 'var(--bg-elevated)'}; color:${truck.speed >= 1 ? '#10b981' : 'var(--text-muted)'}; padding:3px 8px; border-radius:8px; font-size:11px; font-weight:800; font-family:monospace; border:1px solid ${truck.speed >= 1 ? 'rgba(16,185,129,0.2)' : 'rgba(255,255,255,0.14)'};">
              ${isSpeeding ? '<i class="fa-solid fa-triangle-exclamation" style="color:#ef4444;margin-right:2px;"></i>' : ''}${truck.speed} <span style="font-size:8px;">km/h</span>
            </span>
          </div>
        </div>

        <!-- ▸ Meta tags -->
        <div style="padding:8px 14px 0;">
          <div style="display:flex; gap:4px; flex-wrap:wrap; align-items:center;">
            ${(() => { 
              const db = (ui.truckDbCache || []).find(d => d.deviceId === truck.id); 
              if (!db) return ''; 
              let tags = ''; 
              if (db.carteNaftal) tags += `<span class="truck-meta-tag naftal"><i class="fa-solid fa-credit-card"></i> ${db.carteNaftal}</span> `; 
              if (db.immatriculation) tags += `<span class="truck-meta-tag imm"><i class="fa-solid fa-id-badge"></i> ${db.immatriculation}</span> `; 
              if (db.driverName) tags += `<span class="truck-meta-tag driver" title="Chauffeur: ${db.driverName}"><i class="fa-solid fa-user"></i> ${db.driverName}</span> `;
              if (db.trailer) tags += `<span class="truck-meta-tag trailer" title="Remorque: ${db.trailer}"><i class="fa-solid fa-trailer"></i> ${db.trailer}</span> `;
              return tags; 
            })()}
            ${this.renderReferenceBadges ? this.renderReferenceBadges(truck.id) : ''}
            ${hasExpiringRef ? `<span class="truck-meta-tag" style="background:#f97316;color:white;"><i class="fa-solid fa-triangle-exclamation"></i> Doc Expire</span>` : ''}
          </div>
        </div>

        <!-- ▸ Metrics strip -->
        <div style="padding:10px 14px; display:flex; gap:6px;">
          <div style="flex:1; text-align:center; background:var(--bg-elevated); border-radius:8px; padding:8px 4px; border:1.2px solid rgba(255,255,255,0.15);">
            <div style="font-size:7px; text-transform:uppercase; font-weight:800; color:var(--text-muted); letter-spacing:0.3px;">ODOMÈTRE</div>
            <div style="font-size:16px; font-weight:900; color:var(--text-primary); font-family:monospace; line-height:1.3;">${truck.odometer.toLocaleString()}</div>
            <div style="font-size:7px; color:var(--text-muted);">km</div>
          </div>
          <div style="flex:1; text-align:center; background:var(--bg-elevated); border-radius:8px; padding:8px 4px; border:1.2px solid rgba(255,255,255,0.15);">
            <div style="font-size:7px; text-transform:uppercase; font-weight:800; color:var(--text-muted); letter-spacing:0.3px;">CARBURANT</div>
            <div style="font-size:16px; font-weight:900; color:${truck.isCriticalFuel ? '#ef4444' : 'var(--text-primary)'}; font-family:monospace; line-height:1.3;">${truck.fuelLiters}<span style="font-size:9px;">L</span></div>
            <div style="height:3px; background:var(--bg-surface); border-radius:2px; margin-top:2px; overflow:hidden;"><div style="height:100%; width:${truck.fuelPercentage}%; background:${truck.isCriticalFuel ? '#ef4444' : truck.isLowFuel ? '#f59e0b' : '#10b981'}; border-radius:2px;"></div></div>
          </div>
          <div style="flex:1.2; text-align:center; background:var(--bg-elevated); border-radius:8px; padding:8px 4px; border:1.2px solid rgba(255,255,255,0.15);">
            <div style="font-size:7px; text-transform:uppercase; font-weight:800; color:var(--text-muted); letter-spacing:0.3px;">POSITION</div>
            <div style="font-size:11px; font-weight:700; color:${truck.location.isCustom ? cardAccentColor : 'var(--text-primary)'}; margin-top:3px; line-height:1.2; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${truck.location.city}</div>
            <div style="font-size:8px; color:var(--text-muted);">${truck.location.wilaya}</div>
          </div>
        </div>

        ${truck.vidange.alert ? `
          <div style="margin:0 14px 10px; padding:10px; background:${vidangeBg}; border:1px solid ${vidangeColor}30; border-radius:10px; font-size:12px;">
            <strong style="color:${vidangeColor};"><i class="fa-solid fa-wrench"></i> ${vidangeTitle}</strong>
            <div style="margin-top:4px; color:var(--text-secondary);">Prévue à ${truck.vidange.nextKm}km (${vidangeRemainingText})</div>
            <button class="btn-primary tcv-btn" data-tid="${truck.id}" style="margin-top:8px; width:100%; background:${vidangeColor}; box-shadow:0 4px 12px ${vidangeColor}40; border:none;">
              <i class="fa-solid fa-circle-check"></i> Déclarer Vidange
            </button>
          </div>
        ` : ''}
        
        ${truck.isVidangeCandidate ? `
          <div style="margin:0 14px 10px; padding:8px 12px; background:var(--info-subtle); border-radius:8px; border:1px solid var(--info)40; font-size:11px; color:var(--info); font-weight:600; display:flex; align-items:center; gap:6px;">
            <i class="fa-solid fa-wrench"></i> VIDANGE EN COURS (${truck.zoneTimeMinutes}min)
          </div>
        ` : truck.inMaintenanceZone ? `
          <div style="margin:0 14px 10px; padding:8px 12px; background:var(--primary-subtle); border-radius:8px; border:1px solid var(--primary)40; font-size:11px; color:var(--primary); font-weight:600; display:flex; align-items:center; gap:6px;">
            <i class="fa-solid fa-screwdriver-wrench"></i> ZONE MAINTENANCE (${truck.zoneTimeMinutes}min)
          </div>
        ` : ''}

        <!-- ▸ Action bar -->
        <div style="display:flex; gap:5px; padding:0 14px 12px;">
          <button class="tc-suivre" data-lat="${truck.coordinates?.lat||0}" data-lng="${truck.coordinates?.lng||0}" data-tid="${truck.id}"
            style="flex:1; background:${cardAccentGrad}; color:white; font-size:10px; padding:7px; border:none; border-radius:8px; cursor:pointer; font-weight:700; box-shadow:0 2px 8px ${cardAccentColor}30;">
            <i class="fa-solid fa-map-location-dot"></i> Suivre
          </button>
          <button class="tc-docs" data-tid="${truck.id}"
            style="flex:1; background:linear-gradient(135deg,#38bdf8,#0284c7); color:white; font-size:10px; padding:7px; border:none; border-radius:8px; cursor:pointer; font-weight:700; box-shadow:0 2px 8px rgba(56,189,248,0.2);">
            <i class="fa-solid fa-file-contract"></i> Docs
          </button>
          <button class="tc-maint" data-tid="${truck.id}"
            style="flex:1; background:var(--bg-elevated); color:var(--text-secondary); font-size:10px; padding:7px; border:1px solid var(--border); border-radius:8px; cursor:pointer; font-weight:700;">
            <i class="fa-solid fa-wrench"></i> Maint.
          </button>
        </div>
      `;

      // ── Bind card event handlers (no inline onclick in innerHTML) ──
      const _tml = card.querySelector('.tcm-link');
      if (_tml) { (function(u,el){ el.onclick = function(e){ e.stopPropagation(); window.open(u,'_blank'); }; })(mapsUrl, _tml); }
      const _tvb = card.querySelector('.tcv-btn');
      if (_tvb) { (function(el){ el.onclick = function(){ ui.quickAddVidange(el.dataset.tid); }; })(_tvb); }
      const _tsv = card.querySelector('.tc-suivre');
      if (_tsv) { (function(el){ el.onclick = function(e){ e.stopPropagation(); window.ui.viewOnMap(parseFloat(el.dataset.lat), parseFloat(el.dataset.lng), el.dataset.tid); }; })(_tsv); }
      const _tdc = card.querySelector('.tc-docs');
      if (_tdc) { (function(el){ el.onclick = function(e){ e.stopPropagation(); window.ui.openRefModal(el.dataset.tid); }; })(_tdc); }
      const _tmt = card.querySelector('.tc-maint');
      if (_tmt) { (function(el){ el.onclick = function(e){ e.stopPropagation(); window.ui.openMaintenanceModal(el.dataset.tid); }; })(_tmt); }

      _cardFragment.appendChild(card);
    });
    this.trucksContainer.appendChild(_cardFragment);
  }




  setFilter(filterType, label) {
    this.currentFilter = filterType;
    this.activeFilterDisplay.style.display = 'flex';
    this.filterName.textContent = label;
    this.renderTrucks(); 
    this.renderStats(); 
  }

  clearFilter() {
    this.currentFilter = 'all';
    this.activeFilterDisplay.style.display = 'none';
    this.renderTrucks();
    this.renderStats();
  }
  
  // --- ZONES & MAP LOGIC ---
  setZoneGrouping(mode) {
    this.zoneGroupingMode = mode;
    if(this.btnGroupWilaya) this.btnGroupWilaya.classList.remove('active');
    if(this.btnGroupCity) this.btnGroupCity.classList.remove('active');
    
    const mapBtn = document.getElementById('btnGroupMap');
    const listContainer = document.getElementById('wilayaContainer');

    // Reset styles
    if(mapBtn) {
        mapBtn.style.backgroundColor = '';
        mapBtn.style.color = 'var(--teal)'; 
    }

    if (mode === 'map') {
        if(mapBtn) {
             mapBtn.style.backgroundColor = 'var(--teal)';
             mapBtn.style.color = 'white';
        }
        const gpsLayout = document.getElementById('gpsMapLayout');
        if(gpsLayout) gpsLayout.style.display = 'flex';
        if(listContainer) listContainer.style.display = 'none';
        
        // CRITICAL: Wait for browser layout, then init or reinit the map
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            const container = document.getElementById('map-container');
            const containerW = container ? container.offsetWidth : 0;
            const containerH = container ? container.offsetHeight : 0;
            
            // Check if existing map has a broken (0×0) canvas
            let needsReinit = false;
            if (window.AlgeriaMap && window.AlgeriaMap.map) {
                const canvas = window.AlgeriaMap.map.getCanvas();
                if (!canvas || canvas.width === 0 || canvas.height === 0) {
                    console.warn('🗺️ Map canvas is 0×0, destroying and reinitializing...');
                    try { window.AlgeriaMap.map.remove(); } catch(e) {}
                    window.AlgeriaMap.map = null;
                    window.AlgeriaMap.markers = {};
                    needsReinit = true;
                }
            }
            
            if (!window.AlgeriaMap.map || needsReinit) {
                console.log('🗺️ Initializing map... container:', containerW, 'x', containerH);
                window.AlgeriaMap.init();
                [500, 1000, 2000].forEach(ms => {
                    setTimeout(() => {
                        if(window.AlgeriaMap && window.AlgeriaMap.map) {
                            window.AlgeriaMap.map.resize();
                            if(app) window.AlgeriaMap.updateMarkers(app.getAllTrucks());
                        }
                    }, ms);
                });
            } else {
                window.AlgeriaMap.map.resize();
                if(app) window.AlgeriaMap.updateMarkers(app.getAllTrucks());
                setTimeout(() => { if(window.AlgeriaMap && window.AlgeriaMap.map) window.AlgeriaMap.map.resize(); }, 300);
            }
          });
        });
        
    } else {
        const gpsLayout = document.getElementById('gpsMapLayout');
        if(gpsLayout) gpsLayout.style.display = 'none';
        if(listContainer) listContainer.style.display = 'block';

        if (mode === 'wilaya' && this.btnGroupWilaya) this.btnGroupWilaya.classList.add('active');
        else if (this.btnGroupCity) this.btnGroupCity.classList.add('active');
        
        this.renderWilayaView();
    }
  }
  
  filterWilayaList() {
      const searchBox = document.getElementById('wilayaSearchBox');
      this.wilayaSearchQuery = searchBox ? searchBox.value.toLowerCase().trim() : '';
      // Only re-render the list, NOT the whole view (preserves search box focus)
      var listEl = document.getElementById('wilayaListContainer') || document.getElementById('wilayaList');
      if (listEl) {
        this._renderWilayaList(listEl);
      } else {
        this.renderWilayaView();
      }
  }

  setFuelFilter(state) {
    this.fuelFilterState = state;
    this.renderFuelSection();
  }

  setVidangeFilter(state) {
    // Toggle: if clicking active filter, reset to 'all'
    if (this.vidangeFilterState === state) {
      this.vidangeFilterState = 'all';
    } else {
      this.vidangeFilterState = state;
    }
    this.renderVidangeSection();
  }

  toggleVidangeSort(field) {
    if (this.vidangeSortField === field) {
      this.vidangeSortDesc = !this.vidangeSortDesc;
    } else {
      this.vidangeSortField = field;
      this.vidangeSortDesc = false;
    }
    this.renderVidangeSection();
  }

  // --- RESTORED: FUEL & VIDANGE SECTION RENDERERS ---
  
  renderFuelSection() {
    this.fuelSectionContainer.innerHTML = '';
    let trucks = app.getAllTrucks().sort((a, b) => a.fuelPercentage - b.fuelPercentage);
    trucks = this.filterBySearch(trucks);
    
    if (this.fuelFilterState === 'critical') trucks = trucks.filter(t => t.isCriticalFuel);
    else if (this.fuelFilterState === 'warning') trucks = trucks.filter(t => t.isLowFuel && !t.isCriticalFuel);
    else if (this.fuelFilterState === 'normal') trucks = trucks.filter(t => !t.isLowFuel && !t.isCriticalFuel);

    const controls = document.createElement('div');
    controls.className = 'sub-filters';
    controls.innerHTML = `<button class="filter-pill ${this.fuelFilterState === 'all' ? 'active' : ''}" onclick="ui.setFuelFilter('all')">Tout</button> <button class="filter-pill critical ${this.fuelFilterState === 'critical' ? 'active' : ''}" onclick="ui.setFuelFilter('critical')">Critique</button> <button class="filter-pill warning ${this.fuelFilterState === 'warning' ? 'active' : ''}" onclick="ui.setFuelFilter('warning')">Bas</button> <button class="filter-pill normal ${this.fuelFilterState === 'normal' ? 'active' : ''}" onclick="ui.setFuelFilter('normal')">Normal</button>`;
    this.fuelSectionContainer.appendChild(controls);

    const header = document.createElement('div');
    header.className = 'accordion-header';
    header.innerHTML = `
      <div>
        <h3 style="margin:0;"><i class="fa-solid fa-gas-pump"></i> État du Carburant</h3>
        <span style="font-size: 12px; color: #666;">${trucks.length} Camions affichés</span>
      </div>
      <div style="font-size: 20px;">${this.fuelAccordionState ? '<i class="fa-solid fa-chevron-down"></i>' : '<i class="fa-solid fa-chevron-right"></i>'}</div>
    `;
    header.onclick = () => {
      this.fuelAccordionState = !this.fuelAccordionState;
      this.renderFuelSection(); 
    };
    this.fuelSectionContainer.appendChild(header);

    const content = document.createElement('div');
    content.className = `accordion-content ${this.fuelAccordionState ? 'show' : ''}`;
    
    if (trucks.length === 0) {
      content.innerHTML = '<div style="text-align:center; color:#999; padding:20px;">Aucun camion dans cette catégorie.</div>';
    } else {
      content.innerHTML = `<div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 15px;">
        ${trucks.map(t => {
          const color = t.isCriticalFuel ? 'var(--danger)' : t.isLowFuel ? 'var(--warning)' : 'var(--success)';
          const bgGlow = t.isCriticalFuel ? 'var(--danger-glow)' : t.isLowFuel ? 'var(--warning-glow)' : 'var(--bg-surface)';
          const blinkClass = t.isCriticalFuel ? 'critical-fuel-blink' : t.isLowFuel ? 'low-fuel-blink' : '';
          const locText = `${t.location.city}, ${t.location.wilaya}`;
          
          return `
          <div class="card-premium ${blinkClass}" style="background: ${bgGlow}; border-left: 4px solid ${color};">
            <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom: 12px;">
              <div>
                <strong style="font-size: 1.1rem; color: var(--text-primary);">${t.name}</strong>
                ${(() => { const db = (ui.truckDbCache || []).find(d => d.deviceId === t.id); return db && db.carteNaftal ? `<div style="margin-top:4px;"><span class="truck-meta-tag naftal" style="font-size:10px;"><i class="fa-solid fa-credit-card"></i> ${db.carteNaftal}</span></div>` : ''; })()}
              </div>
              <div style="text-align:right;">
                <strong style="color:${color}; font-size: 1.3rem; font-weight: 800; text-shadow: 0 2px 4px rgba(0,0,0,0.05);">${t.fuelLiters} <span style="font-size:0.8rem; opacity:0.8;">L</span></strong>
                <div style="font-size: 11px; color: var(--text-muted); font-weight: 600;">${t.fuelPercentage}%</div>
              </div>
            </div>
            
            <div style="background: var(--bg-elevated); height: 10px; border-radius: 6px; overflow: hidden; margin-bottom: 12px; box-shadow: inset 0 1px 3px rgba(0,0,0,0.1);">
              <div style="background: linear-gradient(90deg, ${color}, ${color}dd); width: ${t.fuelPercentage}%; height: 100%; box-shadow: 0 0 10px ${color}80; transition: width 1s ease-in-out;"></div>
            </div>
            
            <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
              <span style="background: var(--bg-surface); padding: 4px 8px; border-radius: var(--radius-md); font-size: 11px; color: var(--text-secondary); border: 1px solid var(--border-light);"><i class="fa-solid fa-tank-water" style="color:var(--text-muted)"></i> Capacité: <strong>${t.fuelTankCapacity}L</strong></span>
              <span style="background: var(--bg-surface); padding: 4px 8px; border-radius: var(--radius-md); font-size: 11px; color: var(--text-secondary); border: 1px solid var(--border-light);"><i class="fa-solid fa-road" style="color:var(--text-muted)"></i> Autonomie: <strong>~${t.rangeKm} km</strong></span>
            </div>

            <div style="font-size: 11px; color: var(--text-muted); padding-top: 8px; border-top: 1px solid var(--border-light); display:flex; align-items:center; gap:6px;">
               <i class="fa-solid fa-location-dot" style="color:${color}"></i> ${locText}
            </div>

            <button class="fuel-card-overlay-btn" onclick="ui.goToPlanning('${t.id}')">
                <i class="fa-solid fa-calculator"></i> Calculer Remplissage
            </button>
          </div>`;
        }).join('')}
      </div>`;
    }
    this.fuelSectionContainer.appendChild(content);
  }

  renderVidangeSection() {
    this.vidangeSectionContainer.innerHTML = '';
    let trucks = app.getAllTrucks().sort((a, b) => {
      if (this.vidangeSortField === 'name') {
        const cmp = (a.name || '').localeCompare(b.name || '', 'fr');
        return this.vidangeSortDesc ? -cmp : cmp;
      }
      return this.vidangeSortDesc ? (b.vidange.kmUntilNext - a.vidange.kmUntilNext) : (a.vidange.kmUntilNext - b.vidange.kmUntilNext);
    });
    trucks = this.filterBySearch(trucks);

    if (this.vidangeFilterState === 'urgent') trucks = trucks.filter(t => t.vidange.alert);
    else if (this.vidangeFilterState === 'warning') trucks = trucks.filter(t => !t.vidange.alert && t.vidange.kmUntilNext < (t.vidange.alertKm + 3000));
    else if (this.vidangeFilterState === 'ok') trucks = trucks.filter(t => !t.vidange.alert && t.vidange.kmUntilNext >= (t.vidange.alertKm + 3000));

    const controls = document.createElement('div');
    controls.className = 'sub-filters';
    controls.innerHTML = `<div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;">
      <div style="display:flex;gap:6px;flex-wrap:wrap;">
        <button class="filter-pill ${this.vidangeFilterState === 'all' ? 'active' : ''}" onclick="ui.setVidangeFilter('all')" title="Tous les camions">Tout</button>
        <button class="filter-pill critical ${this.vidangeFilterState === 'urgent' ? 'active' : ''}" onclick="ui.setVidangeFilter('urgent')" title="Cliquer pour filtrer ou désactiver">🔴 Urgent</button>
        <button class="filter-pill warning ${this.vidangeFilterState === 'warning' ? 'active' : ''}" onclick="ui.setVidangeFilter('warning')" title="Cliquer pour filtrer ou désactiver">🟡 Bientôt</button>
        <button class="filter-pill normal ${this.vidangeFilterState === 'ok' ? 'active' : ''}" onclick="ui.setVidangeFilter('ok')" title="Cliquer pour filtrer ou désactiver">✅ OK</button>
      </div>
      <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;">
        <span style="font-size:11px;color:var(--text-muted,#94a3b8);font-weight:600;"><i class="fa-solid fa-arrow-down-up-across-line"></i> Trier:</span>
        <button class="filter-pill ${this.vidangeSortField === 'km' ? 'active' : ''}" onclick="ui.toggleVidangeSort('km')" style="font-size:11px;padding:4px 10px;" title="Cliquer pour inverser le tri">
          <i class="fa-solid ${this.vidangeSortField === 'km' && this.vidangeSortDesc ? 'fa-arrow-down-wide-short' : 'fa-arrow-up-short-wide'}"></i> ${this.vidangeSortField === 'km' ? (this.vidangeSortDesc ? 'OK d’abord' : 'Urgent d’abord') : 'Urgence'}
        </button>
        <button class="filter-pill ${this.vidangeSortField === 'name' ? 'active' : ''}" onclick="ui.toggleVidangeSort('name')" style="font-size:11px;padding:4px 10px;" title="Cliquer pour inverser le tri alphabétique">
          <i class="fa-solid ${this.vidangeSortField === 'name' && this.vidangeSortDesc ? 'fa-arrow-up-z-a' : 'fa-arrow-down-a-z'}"></i> ${this.vidangeSortField === 'name' ? (this.vidangeSortDesc ? 'Nom (Z→A)' : 'Nom (A→Z)') : 'Nom'}
        </button>
      </div>
    </div>`;
    this.vidangeSectionContainer.appendChild(controls);

    const header = document.createElement('div');
    header.className = 'accordion-header';
    header.style.borderLeftColor = 'var(--orange)';
    header.innerHTML = `
      <div>
        <h3 style="margin:0;"><i class="fa-solid fa-oil-can" style="color:var(--orange,#f59e0b);"></i> État des Vidanges <span style="font-size:12px;font-weight:700;color:var(--text-muted,#94a3b8);margin-left:8px;">(Temps Réel)</span></h3>
        <span style="font-size: 12px; color: var(--text-muted,#666);">${trucks.length} Camions affichés — Données GPS en direct</span>
      </div>
    `;
    this.vidangeSectionContainer.appendChild(header);

    const content = document.createElement('div');
    content.className = 'accordion-content show';
    
    if (trucks.length === 0) {
      content.innerHTML = '<div style="text-align:center; color:#999; padding:20px;">Aucun camion dans cette catégorie.</div>';
    } else {
      content.innerHTML = `<div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 15px;">
        ${trucks.map(t => {
          const isAlert = t.vidange.alert;
          const isWarning = !isAlert && t.vidange.kmUntilNext < (t.vidange.alertKm + 3000);
	          const kmUntil = Number(t?.vidange?.kmUntilNext ?? 0);
	          const isOverdue = kmUntil < 0;
	          const remainingLabel = isOverdue ? 'Retard' : 'Reste';
	          const remainingValue = isOverdue ? Math.abs(kmUntil) : kmUntil;
          
          let color = '#2a9d8f'; 
          let statusText = 'OK';
          
          if (isAlert) { color = '#e63946'; statusText = 'URGENT'; }
          else if (isWarning) { color = '#f4a261'; statusText = 'BIENTÔT'; }

          const bg = isAlert ? 'var(--bg-danger,#fff5f5)' : 'var(--bg-card,white)';
          
          return `
          <div style="background: ${bg}; padding: 15px; border-radius: 12px; border: 1px solid ${isAlert ? color+'33' : 'var(--border,#ddd)'}; border-left: 4px solid ${color}; box-shadow: 0 2px 8px rgba(0,0,0,0.08); transition: transform 0.15s, box-shadow 0.15s;" onmouseover="this.style.transform='translateY(-2px)';this.style.boxShadow='0 6px 20px rgba(0,0,0,0.12)'" onmouseout="this.style.transform='';this.style.boxShadow='0 2px 8px rgba(0,0,0,0.08)'">
            <div style="display:flex; justify-content:space-between; margin-bottom: 8px;">
              <div>
                <strong>${t.name}</strong>
                <div style="display:flex; gap:4px; margin-top:3px; flex-wrap:wrap;">
                  ${(() => { const db = (ui.truckDbCache || []).find(d => d.deviceId === t.id); const tags = []; if (db && db.immatriculation) tags.push(`<span class="truck-meta-tag imm"><i class="fa-solid fa-id-badge"></i> ${db.immatriculation}</span>`); if (db && db.chassisNumber) tags.push(`<span class="truck-meta-tag chassis"><i class="fa-solid fa-hashtag"></i> ${db.chassisNumber}</span>`); return tags.join(''); })()}
                </div>
              </div>
              <span style="background:${color}; color:white; padding: 2px 8px; border-radius: 4px; font-size: 10px; font-weight: bold; height:fit-content;">${statusText}</span>
            </div>
            
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; font-size: 12px;">
              <div>
                <div style="color:var(--text-muted,#888);">Prochaine</div>
                <strong style="color: ${color}; font-size: 14px;">${t.vidange.nextKm} km</strong>
              </div>
              <div>
	                <div style="color:var(--text-muted,#888);">${remainingLabel}</div>
	                <strong style="color: ${isOverdue ? color : '#333'}; font-size: 14px;">${remainingValue.toLocaleString()} km</strong>
              </div>
            </div>
            
            <div style="margin-top: 8px; padding-top: 8px; border-top: 1px solid var(--border,#eee); font-size: 11px; color: var(--text-muted,#666); display: flex; justify-content: space-between;">
               <span>Actuel: ${t.odometer} km</span>
               <span>Dernière: ${t.vidange.lastKm ? t.vidange.lastKm + ' km' : '<span style="color:#e63946">Non enregistrée (Virtuelle)</span>'}</span>
            </div>

            ${(isAlert || isWarning) ? `
              <button class="btn-vidange-done" style="margin-top:10px; width:100%;" onclick="ui.quickAddVidange('${t.id}')">
                <i class="fa-solid fa-circle-check"></i> Déclarer Vidange
              </button>
            ` : ''}
          </div>`;
        }).join('')}
      </div>`;
    }
    this.vidangeSectionContainer.appendChild(content);
  }

  // \u2705 QUICK ACTION: declare a Vidange from an alert (opens Maintenance modal prefilled)
  quickAddVidange(deviceId) {
    // Smart check: if truck already has recent vidange at current km
    const trucks = window.app ? window.app.getAllTrucks() : [];
    const truck = trucks.find(t => String(t.id || t.deviceId) === String(deviceId));
    if (truck && this._lastVidangeMap) {
      const lastKm = this._lastVidangeMap[String(deviceId)];
      const currentKm = truck.odometer || 0;
      const settings = (typeof FLEET_CONFIG !== 'undefined' && FLEET_CONFIG.SYSTEM_SETTINGS) ? FLEET_CONFIG.SYSTEM_SETTINGS : {};
      const rotKm = settings.vidangeRotationKm || 25000;
      if (lastKm && (currentKm - lastKm) < rotKm * 0.95) {
        const nextKm = lastKm + rotKm;
        if (!confirm(`Ce camion a déjà une vidange enregistrée à ${lastKm.toLocaleString('fr-DZ')} km.\nProchaine vidange prévue à ${nextKm.toLocaleString('fr-DZ')} km (dans ${(nextKm - currentKm).toLocaleString('fr-DZ')} km).\n\nCréer quand même un nouvel ordre?`)) return;
      }
    }

    // Use openNewMaintenanceOrder which properly populates the truck dropdown
    this._pendingVidangeDeviceId = String(deviceId);
    this.openNewMaintenanceOrder(String(deviceId));
  }

  // --- WILAYA VIEW ---
  renderWilayaView() {
    this.wilayaContainer.innerHTML = '';
    const searchContainer = document.createElement('div');
    searchContainer.innerHTML = `
      <input type="text" id="wilayaSearchBox" class="wilaya-search-box" 
             placeholder="🔍 Filtrer par nom de Wilaya ou Zone..." 
             value="${this.wilayaSearchQuery || ''}"
             onkeyup="ui.filterWilayaList()">
    `;
    this.wilayaContainer.appendChild(searchContainer);

    let grouped;
    if (this.zoneGroupingMode === 'city') grouped = app.getTrucksByCity(); 
    else grouped = app.getTrucksByWilaya(); 
    
    const customZones = {};
    const standardZones = {};

    Object.keys(grouped).forEach(key => {
        const trucks = grouped[key];
        if(!trucks || trucks.length === 0) return;
        const isCustomGroup = trucks.some(t => t.location && t.location.isCustom);
        if(this.wilayaSearchQuery && !key.toLowerCase().includes(this.wilayaSearchQuery)) return;

        if(isCustomGroup) customZones[key] = trucks;
        else standardZones[key] = trucks;
    });

    const renderSection = (title, groups, isCustom) => {
        if (Object.keys(groups).length === 0) return;
        
        const titleDiv = document.createElement('div');
        titleDiv.className = 'wilaya-section-title';
        titleDiv.innerHTML = title;
        this.wilayaContainer.appendChild(titleDiv);

        Object.keys(groups).sort().forEach(groupName => {
            let trucks = groups[groupName];
            trucks = this.filterBySearch(trucks);
            
            if (this.currentFilter === 'critical') trucks = trucks.filter(t => t.isCriticalFuel);
            else if (this.currentFilter === 'low_fuel') trucks = trucks.filter(t => t.isLowFuel);
            else if (this.currentFilter === 'vidange') trucks = trucks.filter(t => t.vidange?.alert);
            else if (this.currentFilter === 'moving') trucks = trucks.filter(t => t.speed >= 1);
            else if (this.currentFilter === 'stopped') trucks = trucks.filter(t => t.speed < 1);
            else if (this.currentFilter === 'gps_cut') trucks = trucks.filter(t => t.isGpsCut);

            if (trucks.length === 0) return; 

            let displayLabel = groupName;
            if (this.zoneGroupingMode === 'city' && trucks.length > 0) {
                 const wilaya = trucks[0].location.wilaya || 'Algérie';
                 if(wilaya !== 'Inconnu' && !displayLabel.includes(wilaya)) {
                     displayLabel = `${groupName} <span style="font-weight:600; font-size:11px; color:var(--text-muted); text-transform:uppercase; margin-left:6px;">— ${wilaya}</span>`;
                 }
            }

            const div = document.createElement('div');
            div.style.cssText = `
                background: var(--bg-elevated);
                border: 1px solid var(--border-light);
                border-radius: var(--radius-lg);
                padding: 12px 16px;
                margin-bottom: 8px;
                cursor: pointer;
                display: flex;
                justify-content: space-between;
                align-items: center;
                transition: var(--transition);
                border-left: 4px solid ${isCustom ? 'var(--success)' : 'var(--primary)'};
            `;
            div.onmouseover = () => div.style.background = 'var(--bg-hover)';
            div.onmouseout = () => div.style.background = 'var(--bg-elevated)';

            div.innerHTML = `
                  <div style="display:flex; align-items:center; gap: 12px;">
                    <div style="width:32px;height:32px;border-radius:8px;background:${isCustom ? 'var(--success-subtle)' : 'var(--primary-subtle)'};display:flex;align-items:center;justify-content:center;">
                        <i class="${this.zoneGroupingMode === 'city' ? 'fa-solid fa-location-dot' : 'fa-solid fa-map-pin'}" style="color:${isCustom ? 'var(--success)' : 'var(--primary)'}; font-size:14px;"></i>
                    </div>
                    <strong style="color:var(--text-primary); font-size:14px;">${displayLabel}</strong> 
                  </div>
                  <span style="background:var(--bg-surface); padding:4px 12px; border-radius:var(--radius-full); border:1px solid var(--border); font-size:12px; font-weight:var(--weight-black); color:var(--text-primary);">${trucks.length}</span>
            `;
              
            div.onclick = () => {
                const grid = div.nextElementSibling;
                const isHidden = grid.style.display === 'none';
                grid.style.display = isHidden ? 'grid' : 'none';
                // Persist state so poll refresh doesn't collapse open zones
                this.wilayaExpandState[groupName] = !isHidden;
            };

            const grid = document.createElement('div');
            grid.className = 'trucks-grid';
            // Restore saved state; custom zones default to OPEN; others to closed
            const savedState = this.wilayaExpandState[groupName];
            const defaultOpen = isCustom || !!this.searchQuery;
            const isOpen = savedState !== undefined ? savedState : defaultOpen;
            grid.style.display = isOpen ? 'grid' : 'none'; 
            grid.style.gap = '12px';
            grid.style.padding = '8px 4px 20px 4px';
            grid.style.gridTemplateColumns = 'repeat(auto-fill, minmax(280px, 1fr))';
              
            trucks.forEach(t => {
                 let isMoving = t.speed >= 1;
                 let statusHtml = isMoving 
                    ? `<span style="background:var(--success-subtle); color:var(--success); border:1px solid rgba(16,185,129,0.2); padding:3px 8px; border-radius:4px; font-size:10px; font-weight:800; display:flex; align-items:center; gap:4px;"><i class="fa-solid fa-play"></i> EN ROUTE</span>` 
                    : `<span style="background:var(--danger-subtle); color:var(--danger); border:1px solid rgba(239,68,68,0.2); padding:3px 8px; border-radius:4px; font-size:10px; font-weight:800; display:flex; align-items:center; gap:4px;"><i class="fa-solid fa-stop"></i> À L'ARRÊT</span>`;
                 
                 // Handle GPS CUT in Wilaya View too
                 if (t.isGpsCut) {
                     statusHtml = `<span style="background:var(--warning-subtle); color:var(--warning); border:1px solid rgba(245,158,11,0.2); padding:3px 8px; border-radius:4px; font-size:10px; font-weight:800; display:flex; align-items:center; gap:4px;"><i class="fa-solid fa-satellite-dish"></i> COUPURE GPS</span>`;
                 }

                 const card = document.createElement('div');
                 card.style.cssText = `
                    background: var(--bg-surface);
                    border: 1px solid var(--border-strong);
                    border-radius: var(--radius-lg);
                    padding: 16px;
                    transition: var(--transition);
                    cursor: pointer;
                 `;
                 card.onmouseover = () => card.style.borderColor = 'var(--primary)';
                 card.onmouseout = () => card.style.borderColor = 'var(--border-strong)';
                 card.onclick = () => { if(window.AlgeriaMap) window.AlgeriaMap.selectTruckById(t.id); };

                 const fuelColor = t.isCriticalFuel ? 'var(--danger)' : t.isLowFuel ? 'var(--warning)' : 'var(--success)';

                 card.innerHTML = `
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 12px;">
                        <div style="display:flex; align-items:center; gap:8px;">
                            <i class="fa-solid fa-truck" style="color:var(--text-secondary); font-size:14px;"></i>
                            <strong style="color:var(--text-primary); font-size:14px;">${t.name}</strong>
                        </div>
                        ${statusHtml}
                    </div>
                    <div style="display:flex; justify-content:space-between; align-items:center; background:var(--bg-elevated); padding:8px 12px; border-radius:6px; margin-bottom:10px;">
                        <span style="color:var(--text-muted); font-size:12px; font-weight:600;"><i class="fa-solid fa-gas-pump" style="margin-right:4px;"></i> Carburant</span>
                        <strong style="color: ${fuelColor}; font-size:14px;">${t.fuelLiters} L</strong>
                    </div>
                    <div style="font-size:11px; color:var(--text-muted); border-top:1px dashed var(--border); padding-top:8px; display:flex; align-items:center; gap:6px;">
                        <i class="fa-solid fa-location-crosshairs"></i> ${t.location.city || t.location.wilaya || 'Algérie'}
                    </div>
                 `;
                 grid.appendChild(card);
            });
              
            this.wilayaContainer.appendChild(div);
            this.wilayaContainer.appendChild(grid);
        });
    };

    renderSection("🏢 Zones Personnalisées & Sites", customZones, true);
    renderSection("🇩🇿 Wilayas (Algérie)", standardZones, false);

    if (this.wilayaContainer.children.length === 1) { 
         const emptyMsg = document.createElement('div');
         emptyMsg.style.cssText = "text-align:center; padding: 20px; color:#888;";
         emptyMsg.innerHTML = "Aucune zone trouvée pour cette recherche.";
         this.wilayaContainer.appendChild(emptyMsg);
    }
  }
  
  populateRouteTruckList() {
    this.routeTruck.innerHTML = '<option value="">-- Choisir un camion --</option>';
    app.getAllTrucks().forEach(t => {
      this.routeTruck.innerHTML += `<option value="${t.id}">${t.name} (${t.fuelLiters} L)</option>`;
    });
  }
  
  populateTruckList() {
    this.truckSelect.innerHTML = '<option value="">-- Choisir un camion --</option>';
    app.getAllTrucks().forEach(t => {
      this.truckSelect.innerHTML += `<option value="${t.id}">${t.name}</option>`;
    });
  }

  // --- REFUEL LOGIC ---
  async fetchAndRenderRefuels() {
    if(!this.refuelHistoryContainer) return;
    this.refuelHistoryContainer.innerHTML = '<div style="color:#666; text-align:center; padding:20px;"><i class="fa-solid fa-sync fa-spin"></i> Chargement...</div>';
    
    try {
        const params = new URLSearchParams();
        if (this.refuelDateStart && this.refuelDateStart.value) params.set('start', `${this.refuelDateStart.value} 00:00:00`);
        if (this.refuelDateEnd && this.refuelDateEnd.value) params.set('end', `${this.refuelDateEnd.value} 23:59:59`);
        params.set('limit', '20000');
        const url = `${FLEET_CONFIG.API.baseUrl}/api/refuels${params.toString() ? '?' + params.toString() : ''}`;
        const response = await fetch(url, { headers: { 'x-access-code': localStorage.getItem('fleetAccessCode') || this.currentCode || '' } });
        if (!response.ok) {
            console.warn(`Refuels API returned ${response.status}. Displaying empty state.`);
            this.refuelHistoryContainer.innerHTML = `<div style="color:#666; padding:20px; text-align:center;">Pas de données (Serveur en veille). Réessayez plus tard.</div>`;
            return;
        }
        
        this.allRefuelLogs = await response.json(); 
        this.renderFilteredRefuels();
    } catch (e) {
        console.warn("Refuel fetch connection error:", e);
        this.refuelHistoryContainer.innerHTML = `<div style="color:#888; text-align:center; padding:20px;">Connexion impossible pour l'instant.</div>`;
    }
  }

  async parseJsonResponseSafe(response) {
      const raw = await response.text();
      let json = null;
      try { json = raw ? JSON.parse(raw) : {}; } catch (e) {}
      if (!response.ok) {
          const message = (json && (json.error || json.message)) || raw || `Erreur ${response.status}`;
          throw new Error(message);
      }
      return json || {};
  }

  async resolveRefuelRescanTargets() {
      let trucks = [];

      // 1. Try window.app.getAllTrucks() first (instant, live)
      if (window.app && typeof window.app.getAllTrucks === 'function') {
          try {
              const live = window.app.getAllTrucks();
              if (Array.isArray(live) && live.length) {
                  trucks = live.map((truck) => ({
                      deviceId: String(truck.id || truck.deviceId),
                      name: String(truck.name || truck.truckName || truck.id)
                  }));
              }
          } catch (_) {}
      }

      // 2. Fallback to /api/trucks
      if (!trucks.length) {
          try {
              const res = await fetch(`${FLEET_CONFIG.API.baseUrl}/api/trucks`, {
                  headers: { 'x-access-code': localStorage.getItem('fleetAccessCode') || this.currentCode || '' }
              });
              const data = await this.parseJsonResponseSafe(res);
              if (Array.isArray(data)) {
                  trucks = data.map(t => ({
                      deviceId: String(t.id || t.deviceId),
                      name: String(t.name || t.truckName || t.id || t.deviceId)
                  }));
              } else if (data && typeof data === 'object') {
                  trucks = Object.entries(data).map(([key, val]) => ({
                      deviceId: String(val?.id || val?.deviceId || key),
                      name: String(val?.name || val?.truckName || key)
                  }));
              }
          } catch (error) {
              console.warn('Could not fetch /api/trucks:', error.message);
          }
      }

      // 3. Fallback to truckDbCache
      if (!trucks.length && Array.isArray(this.truckDbCache) && this.truckDbCache.length) {
          trucks = this.truckDbCache.map(t => ({
              deviceId: String(t.deviceId),
              name: String(t.truckName || t.name || t.deviceId)
          }));
      }

      // 4. Fallback to dispo items
      if (!trucks.length && this._dispoData?.items) {
          trucks = this._dispoData.items.map(t => ({
              deviceId: String(t.deviceId),
              name: String(t.truckName || t.deviceId)
          }));
      }

      // Filter out invalid deviceIds
      trucks = trucks.filter(t => t.deviceId && t.deviceId !== 'undefined' && t.deviceId !== 'null');

      const search = (this.refuelTruckSearch && this.refuelTruckSearch.value || '').toLowerCase().trim();
      if (!search) return trucks;

      const filtered = trucks.filter((truck) => (truck.name || '').toLowerCase().includes(search) || (truck.deviceId || '').toLowerCase().includes(search));
      if (filtered.length) return filtered;

      throw new Error(`Aucun camion ne correspond à "${search}" pour le re-scan.`);
  }

  async rebuildRefuelHistory(purgeExistingAuto = false) {
      const start = this.refuelDateStart && this.refuelDateStart.value;
      const end = this.refuelDateEnd && this.refuelDateEnd.value;
      if (!start || !end) {
          alert('Choisissez la période dans Historique des Remplissages avant de lancer le re-scan.');
          return;
      }

      const targets = await this.resolveRefuelRescanTargets();
      if (!targets.length) {
          alert('Aucun camion disponible pour le re-scan.');
          return;
      }

      const truckLabel = targets.length === 1 ? targets[0].name : `${targets.length} camion(s)`;
      const message = purgeExistingAuto
          ? `Supprimer les remplissages auto puis relancer une analyse complète sur ${truckLabel} pour ${start} → ${end} ?`
          : `Relancer une analyse complète des remplissages sur ${truckLabel} pour ${start} → ${end} ?`;
      if (!window.confirm(message)) return;

      const button = purgeExistingAuto ? this.refuelCleanRescanBtn : this.refuelRescanBtn;
      const otherButton = purgeExistingAuto ? this.refuelRescanBtn : this.refuelCleanRescanBtn;
      const original = button ? button.innerHTML : '';
      try {
          if (button) {
              button.disabled = true;
              button.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Analyse...';
          }
          if (otherButton) otherButton.disabled = true;
          const res = await fetch(`${FLEET_CONFIG.API.baseUrl}/api/refuels/rebuild-bulk`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'x-access-code': localStorage.getItem('fleetAccessCode') || this.currentCode || '' },
              body: JSON.stringify({
                  start: `${start} 00:00:00`,
                  end: `${end} 23:59:59`,
                  deviceIds: targets.map((truck) => String(truck.deviceId)),
                  purgeExistingAuto: purgeExistingAuto === true,
                  persist: true
              })
          });
          const json = await this.parseJsonResponseSafe(res);
          const summary = json.summary || {};
          const failedCount = Array.isArray(summary.failed) ? summary.failed.length : 0;
          alert(
              `\u2705 Re-scan terminé.\n` +
              `Camions traités: ${summary.successCount || 0}/${summary.targetCount || targets.length}\n` +
              `Créés: ${summary.createdCount || 0}\n` +
              `Mis à jour: ${summary.updatedCount || 0}\n` +
              `Ignorés: ${summary.skippedCount || 0}\n` +
              `Auto supprimés: ${summary.deletedCount || 0}\n` +
              `Doublons supprimés: ${summary.duplicateDeletedCount || 0}` +
              (failedCount ? `\nÉchecs: ${failedCount}` : '')
          );
          this.refuelCurrentPage = 1;
          await this.fetchAndRenderRefuels();
      } catch (error) {
          console.error('Refuel rebuild failed:', error);
          alert(`❌ ${error.message || 'Erreur re-scan carburant.'}`);
      } finally {
          if (button) {
              button.disabled = false;
              button.innerHTML = original;
          }
          if (otherButton) otherButton.disabled = false;
      }
  }

renderFilteredRefuels() {
    if (!this.allRefuelLogs || this.allRefuelLogs.length === 0) {
        this.refuelHistoryContainer.innerHTML = '<div style="text-align:center; padding:40px; color:var(--text-muted);"><i class="fa-solid fa-gas-pump" style="font-size:32px; display:block; margin-bottom:12px; opacity:0.3;"></i>Aucun remplissage détecté pour cette période.</div>';
        return;
    }

    // 1. Get Filter Values
    const startDate = this.refuelDateStart.value ? new Date(this.refuelDateStart.value) : null;
    const endDate = this.refuelDateEnd.value ? new Date(this.refuelDateEnd.value) : null;
    if(endDate) endDate.setHours(23, 59, 59, 999);
    
    const truckSearch = this.refuelTruckSearch.value.toLowerCase().trim();
    const locationSearch = this.refuelLocationSearch ? this.refuelLocationSearch.value.toLowerCase().trim() : '';
    const locationType = this.refuelLocationTypeFilter ? this.refuelLocationTypeFilter.value : 'all';
    const sourceFilter = document.getElementById('refuelSourceFilter')?.value || 'all';

    // Auto source lists
    const autoSources = ['live-bot','live-replay','live-verified','gps-history-rebuild','gps-history-verified','gps-history-nightly','gps-history-reconciled'];
    const rescanSources = ['gps-history-rebuild','gps-history-reconciled','gps-history-nightly'];

    // 2. Process and Normalize Data
    let processedLogs = this.allRefuelLogs.map(log => {
        const truckConfig = getTruckConfig(log.deviceId);
        const capacity = truckConfig.fuelTankCapacity || 600; 
        
        const rawLat = log.lat || (log.params && log.params.lat);
        const rawLng = log.lng || (log.params && log.params.lng);
        const safeLat = rawLat ? parseFloat(rawLat) : 0;
        const safeLng = rawLng ? parseFloat(rawLng) : 0;

        const logId = `refuel-loc-${log._id || Math.random().toString(36).substr(2, 9)}`;
        let locationName = "Recherche...";
        let isInternal = false;
        
        if (safeLat !== 0 && safeLng !== 0 && FLEET_CONFIG.CUSTOM_LOCATIONS) {
            for (const loc of FLEET_CONFIG.CUSTOM_LOCATIONS) {
                const dist = geocodeService.getDistanceMeters(safeLat, safeLng, loc.lat, loc.lng);
                if (dist <= (loc.radius || 500)) {
                    isInternal = true;
                    locationName = loc.name;
                    break;
                }
            }
        }

        if (!isInternal && safeLat !== 0) {
            const cached = geocodeService.checkCacheInstant(safeLat, safeLng);
            if (cached) {
                locationName = `${cached.city}, ${cached.wilaya}`;
            } else {
                locationName = `<span id="${logId}-text">${safeLat.toFixed(3)}, ${safeLng.toFixed(3)}</span>`;
                geocodeService.reverseGeocode(safeLat, safeLng).then(res => {
                    const el = document.getElementById(`${logId}-text`);
                    if (el) el.innerText = `${res.city}, ${res.wilaya}`;
                });
            }
        } else if (safeLat === 0) {
            locationName = "Position Inconnue";
        }

        // Resolve driver from truckDbCache
        const truckDb = (this.truckDbCache || []).find(d => d.deviceId === String(log.deviceId));
        const driverName = truckDb?.driverName || '';
        const driverPhone = truckDb?.driverPhone || '';
        const carteNaftal = truckDb?.carteNaftal || '';

        return {
            ...log,
            lat: safeLat, lng: safeLng,
            domId: logId,
            realAdded: Math.round(log.addedLiters || 0),
            realTotal: Math.round(log.newLevel || 0),
            realOld: Math.round(log.oldLevel > 0 ? log.oldLevel : ((log.newLevel || 0) - (log.addedLiters || 0))),
            truckCapacity: capacity, 
            locationDisplay: locationName,
            isInternal: isInternal,
            driverName, driverPhone, carteNaftal
        };
    });

    // 3. Apply Filters
    processedLogs = processedLogs.filter(log => {
        const logDate = new Date(log.timestamp);
        const minRefuelDisplay = Math.max(60, parseInt((FLEET_CONFIG.REFUEL_RULES || {}).minRefuelLiters || 60));
        if (Number(log.realAdded) < minRefuelDisplay) return false;
        if (startDate && logDate < startDate) return false;
        if (endDate && logDate > endDate) return false;
        if (truckSearch && !log.truckName.toLowerCase().includes(truckSearch)) return false;
        if (locationType === 'internal' && !log.isInternal) return false;
        if (locationType === 'external' && log.isInternal) return false;
        if (locationSearch && !String(log.locationDisplay || '').toLowerCase().includes(locationSearch)) return false;
        // Source filter
        if (sourceFilter !== 'all') {
            const src = log.source || '';
            if (sourceFilter === 'auto' && !autoSources.includes(src)) return false;
            if (sourceFilter === 'manual' && src !== 'manual') return false;
            if (sourceFilter === 'naftal' && src !== 'naftal-declaration') return false;
            if (sourceFilter === 'rescan' && !rescanSources.includes(src)) return false;
        }
        return true;
    });

    // 4. Sort
    if (this.refuelSortOrder === 'qtydesc' || this.refuelSortOrder === 'qty_desc') {
        processedLogs.sort((a, b) => (Number(b.realAdded) || 0) - (Number(a.realAdded) || 0));
    } else {
        processedLogs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    }

    // 5. Stats
    const totalRefuels = processedLogs.length;
    const totalVolume = processedLogs.reduce((s, l) => s + (Number(l.realAdded) || 0), 0);
    const internalCount = processedLogs.filter(l => l.isInternal).length;
    const externalCount = totalRefuels - internalCount;
    const intPrice = (FLEET_CONFIG.DEFAULT_TRUCK_CONFIG && FLEET_CONFIG.DEFAULT_TRUCK_CONFIG.fuelPricePerLiter) || 29;
    const extPrice = (this.naftalPricePerLiter || 31);
    const totalCost = processedLogs.reduce((s, l) => s + Math.round((Number(l.realAdded) || 0) * (l.isInternal ? intPrice : extPrice)), 0);
    const avgPerRefuel = totalRefuels > 0 ? Math.round(totalVolume / totalRefuels) : 0;

    // 6. Pagination
    const totalItems = processedLogs.length;
    const totalPages = Math.ceil(totalItems / this.refuelItemsPerPage);
    const startIndex = (this.refuelCurrentPage - 1) * this.refuelItemsPerPage;
    const paginatedLogs = processedLogs.slice(startIndex, startIndex + this.refuelItemsPerPage);

    // Source badge helper
    const srcBadge = (src) => {
        const s = src || '';
        if (s === 'manual') return '<span class="rfv2-source-badge" style="background:rgba(59,130,246,0.12);color:#3b82f6;">📋 Manuel</span>';
        if (s === 'naftal-declaration') return '<span class="rfv2-source-badge" style="background:rgba(245,158,11,0.12);color:#f59e0b;">⛽ Naftal</span>';
        if (s.includes('nightly')) return '<span class="rfv2-source-badge" style="background:rgba(139,92,246,0.12);color:#a78bfa;">🌙 Nuit</span>';
        if (s.includes('reconciled') || s.includes('rebuild')) return '<span class="rfv2-source-badge" style="background:rgba(16,185,129,0.12);color:#10b981;">🔄 Re-scan</span>';
        return '<span class="rfv2-source-badge" style="background:rgba(100,116,139,0.12);color:#94a3b8;">🤖 Auto</span>';
    };
    const confDot = (meta) => {
        const c = (meta && meta.confidence) || 0;
        const pct = Math.round(c * 100);
        const col = pct >= 90 ? '#10b981' : pct >= 70 ? '#f59e0b' : '#ef4444';
        return pct > 0 ? `<span style="display:inline-flex;align-items:center;gap:3px;font-size:9px;color:${col};font-weight:700;"><span style="width:6px;height:6px;border-radius:50%;background:${col};display:inline-block;"></span>${pct}%</span>` : '';
    };

    // 7. Build HTML
    let html = `
    <div style="display:grid; grid-template-columns:repeat(auto-fit,minmax(140px,1fr)); gap:10px; margin-bottom:16px;">
        <div class="rfv2-stat"><div class="val" style="color:#10b981;">${totalRefuels}</div><div class="lbl">⛽ Remplissages</div></div>
        <div class="rfv2-stat"><div class="val" style="color:#3b82f6;">${totalVolume.toLocaleString()} <span style="font-size:12px;">L</span></div><div class="lbl">💧 Volume Total</div></div>
        <div class="rfv2-stat"><div class="val" style="color:#f59e0b;">${(totalCost/1000).toFixed(0)}K <span style="font-size:12px;">DA</span></div><div class="lbl">💰 Coût Estimé</div></div>
        <div class="rfv2-stat"><div class="val" style="color:#22c55e;">${internalCount}</div><div class="lbl">🏭 Sur Site</div></div>
        <div class="rfv2-stat"><div class="val" style="color:#fb923c;">${externalCount}</div><div class="lbl">⛽ Station</div></div>
        <div class="rfv2-stat"><div class="val" style="color:#a78bfa;">${avgPerRefuel} <span style="font-size:12px;">L</span></div><div class="lbl">📊 Moy / Plein</div></div>
    </div>`;

    html += '<div style="display:grid; grid-template-columns:repeat(auto-fill,minmax(420px,1fr)); gap:12px;">';
    paginatedLogs.forEach((log, idx) => {
        const dateObj = new Date(log.timestamp);
        const dateDisplay = dateObj.toLocaleDateString('fr-FR', { weekday:'short', day:'numeric', month:'short', year:'numeric' });
        const timeDisplay = dateObj.toLocaleTimeString('fr-FR', { hour:'2-digit', minute:'2-digit' });
        const accentColor = log.isInternal ? '#22c55e' : '#f59e0b';
        const fillPercent = log.truckCapacity > 0 ? Math.min(100, Math.round((log.realTotal / log.truckCapacity) * 100)) : 0;
        const oldPercent = log.truckCapacity > 0 ? Math.min(100, Math.round(((log.realOld || 0) / log.truckCapacity) * 100)) : 0;
        const barColor = fillPercent < 15 ? '#dc2626' : fillPercent < 30 ? '#f59e0b' : '#22c55e';
        const costEst = Math.round((log.realAdded || 0) * (log.isInternal ? intPrice : extPrice));
        const delay = Math.min(idx * 40, 400);

        html += `
        <div class="rfv2-card" style="background:var(--bg-surface); border:1px solid var(--border); box-shadow:0 2px 8px rgba(0,0,0,0.08); animation-delay:${delay}ms;">
            <div style="height:4px; background:linear-gradient(90deg,${accentColor},${accentColor}88);"></div>
            <div style="padding:14px 16px 0;">
                <!-- Header -->
                <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:10px;">
                    <div style="flex:1; min-width:0;">
                        <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
                            <span style="font-weight:900; font-size:15px; color:var(--text-primary);">${log.truckName}</span>
                            ${srcBadge(log.source)}
                            ${confDot(log.meta)}
                        </div>
                        <div style="display:flex; align-items:center; gap:10px; margin-top:4px; flex-wrap:wrap;">
                            ${log.driverName ? `<span style="font-size:11px; color:var(--text-secondary);"><i class="fa-solid fa-user" style="color:var(--primary); font-size:9px; margin-right:2px;"></i>${log.driverName}</span>` : ''}
                            ${log.driverPhone ? `<a href="tel:${log.driverPhone}" style="font-size:10px; color:#38bdf8; text-decoration:none;"><i class="fa-solid fa-phone" style="font-size:8px;"></i> ${log.driverPhone}</a>` : ''}
                        </div>
                        <div style="font-size:11px; color:var(--text-muted); margin-top:3px;">
                            <i class="fa-regular fa-calendar" style="margin-right:2px;"></i>${dateDisplay} &nbsp; <i class="fa-regular fa-clock"></i> ${timeDisplay}
                        </div>
                    </div>
                    <div style="text-align:right; flex-shrink:0; margin-left:10px;">
                        <div style="font-size:26px; font-weight:900; color:${log.isInternal ? '#16a34a' : 'var(--text-primary)'}; line-height:1;">+${log.realAdded}<span style="font-size:13px;"> L</span></div>
                        <div style="font-size:10px; color:var(--text-muted); margin-top:2px;">≈ ${costEst.toLocaleString()} DA</div>
                    </div>
                </div>
                <!-- Fuel Bar -->
                <div style="margin-bottom:12px;">
                    <div style="display:flex; justify-content:space-between; font-size:10px; color:var(--text-muted); margin-bottom:4px;">
                        <span>${(log.realOld > 0) ? 'Avant: ' + log.realOld + ' L (' + oldPercent + '%)' : ''}</span>
                        <span style="font-weight:700; color:var(--text-primary);">Après: ${log.realTotal} L (${fillPercent}%)</span>
                    </div>
                    <div style="background:var(--bg-elevated); border-radius:6px; height:10px; overflow:hidden; position:relative;">
                        <div style="position:absolute; left:0; top:0; height:100%; width:${oldPercent}%; background:rgba(148,163,184,0.25); border-radius:6px;"></div>
                        <div class="rfv2-fuel-bar-fill" style="position:absolute; left:0; top:0; height:100%; width:${fillPercent}%; background:linear-gradient(90deg,${barColor}cc,${barColor}); border-radius:6px;"></div>
                    </div>
                    <div style="font-size:9px; color:var(--text-muted); text-align:right; margin-top:2px;">Capacité: ${log.truckCapacity} L</div>
                </div>
                <!-- Location + Actions -->
                <div style="display:flex; justify-content:space-between; align-items:center; padding-bottom:12px; border-top:1px solid var(--border); padding-top:10px;">
                    <div style="display:flex; align-items:center; gap:8px; flex:1; min-width:0;">
                        ${log.isInternal
                            ? '<span style="background:rgba(22,163,74,0.12); color:#4ade80; padding:3px 10px; border-radius:20px; font-size:10px; font-weight:700; white-space:nowrap;"><i class="fa-solid fa-building"></i> SITE</span>'
                            : '<span style="background:rgba(194,65,12,0.12); color:#fb923c; padding:3px 10px; border-radius:20px; font-size:10px; font-weight:700; white-space:nowrap;"><i class="fa-solid fa-gas-pump"></i> STATION</span>'}
                        <span style="font-size:11px; color:var(--text-secondary); font-weight:600; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" id="${log.domId}-text">${log.locationDisplay}</span>
                    </div>
                    <div style="display:flex; gap:5px; flex-shrink:0;">
                        ${(log.lat && log.lng && log.lat !== 0) ? `
                        <a href="https://www.google.com/maps?q=${log.lat},${log.lng}" target="_blank" style="font-size:10px; color:#2563eb; text-decoration:none; background:rgba(37,99,235,0.08); padding:4px 8px; border-radius:6px; font-weight:600;">
                            <i class="fa-solid fa-map-location-dot"></i> Maps
                        </a>
                        <button onclick="ui.viewOnMap(${log.lat}, ${log.lng})" style="font-size:10px; color:#0284c7; background:rgba(2,132,199,0.08); padding:4px 8px; border-radius:6px; font-weight:600; border:none; cursor:pointer;">
                            <i class="fa-solid fa-crosshairs"></i> Carte
                        </button>` : ''}
                    </div>
                </div>
                ${log.carteNaftal ? `<div style="padding-bottom:10px;"><span style="background:rgba(56,189,248,0.08); color:#38bdf8; padding:2px 10px; border-radius:8px; font-size:9px; font-weight:700; font-family:monospace; border:1px solid rgba(56,189,248,0.15);"><i class="fa-solid fa-credit-card" style="font-size:8px; margin-right:3px;"></i>Carte N° ${log.carteNaftal}</span></div>` : ''}
            </div>
        </div>`;
    });
    html += '</div>';

    // 8. Pagination
    if (totalPages > 1) {
        let pagHtml = '<div style="display:flex; justify-content:center; align-items:center; gap:6px; margin-top:16px; flex-wrap:wrap;">';
        pagHtml += `<button class="btn-secondary" onclick="ui.changeRefuelPage(-1)" style="padding:6px 12px; font-size:11px;" ${this.refuelCurrentPage === 1 ? 'disabled' : ''}><i class="fa-solid fa-chevron-left"></i></button>`;
        const maxBtns = 7;
        let startP = Math.max(1, this.refuelCurrentPage - Math.floor(maxBtns / 2));
        let endP = Math.min(totalPages, startP + maxBtns - 1);
        if (endP - startP < maxBtns - 1) startP = Math.max(1, endP - maxBtns + 1);
        for (let p = startP; p <= endP; p++) {
            const isActive = p === this.refuelCurrentPage;
            pagHtml += `<button onclick="ui.refuelCurrentPage=${p};ui.renderFilteredRefuels();" style="padding:6px 10px; font-size:11px; font-weight:${isActive?'900':'600'}; border-radius:8px; border:1px solid ${isActive?'var(--primary)':'var(--border)'}; background:${isActive?'var(--primary)':'var(--bg-surface)'}; color:${isActive?'#fff':'var(--text-secondary)'}; cursor:pointer;">${p}</button>`;
        }
        pagHtml += `<button class="btn-secondary" onclick="ui.changeRefuelPage(1)" style="padding:6px 12px; font-size:11px;" ${this.refuelCurrentPage === totalPages ? 'disabled' : ''}><i class="fa-solid fa-chevron-right"></i></button>`;
        pagHtml += `<span style="font-size:10px; color:var(--text-muted); margin-left:8px;">${totalItems} résultats</span>`;
        pagHtml += '</div>';
        html += pagHtml;
    }
    
    this.refuelHistoryContainer.innerHTML = html;
}

// Ensure you have this helper function in your UIController class too
changeRefuelPage(dir) {
    this.refuelCurrentPage += dir;
    this.renderFilteredRefuels();
}

exportRefuelCSV() {
    const logs = this.allRefuelLogs;
    if (!logs || logs.length === 0) { alert('Aucun remplissage à exporter. Chargez d\'abord les données.'); return; }
    const naftalPrice = this.naftalPricePerLiter || 31;
    const sitePrice = FLEET_CONFIG.DEFAULT_TRUCK_CONFIG.fuelPricePerLiter || 29;
    let csv = 'Date,Camion,Carte Naftal,Type,Litres Ajoutés,Niveau Avant (L),Niveau Après (L),Coût (DA),Lieu,Lat,Lng\n';
    logs.forEach(log => {
        const db = (this.truckDbCache || []).find(d => d.deviceId === String(log.deviceId));
        const card = (db && db.carteNaftal) ? db.carteNaftal : '';
        const type = log.isInternal ? 'Site Interne' : 'Station Externe (Naftal)';
        const price = log.isInternal ? sitePrice : naftalPrice;
        const cost = Math.round((log.addedLiters || 0) * price);
        const loc = log.locationRaw || (log.lat && log.lng ? `${log.lat},${log.lng}` : 'Inconnu');
        csv += `"${new Date(log.timestamp).toLocaleString('fr-FR')}","${log.truckName}","${card}","${type}",${Math.round(log.addedLiters||0)},${Math.round(log.oldLevel||0)},${Math.round(log.newLevel||0)},${cost},"${loc}",${log.lat||''},${log.lng||''}\n`;
    });
    this._downloadCSV(csv, `REMPLISSAGES_NAFTAL_${new Date().toISOString().slice(0,10)}.csv`);
}

// ═══════════════════════════════════════════════════════════════════════════
//  NAFTAL FUEL CARD MANAGEMENT SYSTEM — UI Module
// ═══════════════════════════════════════════════════════════════════════════

  // --- Main Entry Point (called when #routing tab is shown) ---

  injectNaftalStyles() {
    if (document.getElementById('naftalV5CSS')) return;
    const s = document.createElement('style');
    s.id = 'naftalV5CSS';
    s.textContent = `
/* ── NAFTAL V5 LIGHT THEME ─────────────────────────────── */
.nv5-wrap { background:var(--bg-base, #0d1526); border-radius:12px; overflow:hidden; font-family:inherit; }
.nv5-tabs { display:flex; gap:2px; padding:0 16px; background:var(--bg-surface); border-bottom:1.5px solid var(--border); }
.nv5-tab { padding:13px 18px; border:none; background:transparent; cursor:pointer; font-size:13px; font-weight:600; color:var(--text-muted); border-bottom:3px solid transparent; margin-bottom:-1.5px; transition:all 0.15s; white-space:nowrap; }
.nv5-tab.active { color:#0284c7; border-bottom-color:#0284c7; }
.nv5-tab:hover:not(.active) { color:var(--text-primary); background:var(--bg-elevated); }
.nv5-body { padding:16px; min-height:340px; }
.nv5-subtabs { display:flex; gap:6px; margin-bottom:16px; }
.nv5-stab { padding:7px 16px; border-radius:20px; border:1.5px solid var(--border); background:var(--bg-surface); cursor:pointer; font-size:12px; font-weight:600; color:var(--text-muted); transition:all 0.15s; }
.nv5-stab.active { background:#0284c7; color:#fff; border-color:#0284c7; }
/* Cards */
.nv5-card { background:var(--bg-surface); border:1.5px solid var(--border); border-radius:12px; box-shadow:0 2px 8px rgba(0,0,0,0.1); overflow:hidden; margin-bottom:14px; }
.nv5-card-head { padding:12px 16px; border-bottom:1px solid var(--border); display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:8px; }
.nv5-card-body { padding:14px 16px; }
/* Truck grid */
.nv5-truck-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(185px,1fr)); gap:12px; }
.nv5-truck-card { background:var(--bg-surface); border:1.5px solid var(--border); border-radius:12px; cursor:pointer; overflow:hidden; transition:all 0.18s; box-shadow:0 1px 5px rgba(0,0,0,0.1); }
.nv5-truck-card:hover { border-color:#7dd3fc; transform:translateY(-2px); box-shadow:0 6px 20px rgba(0,0,0,0.15); }
.nv5-truck-card.sel { border-color:#0284c7 !important; background:rgba(2,132,199,0.08); box-shadow:0 0 0 2px rgba(2,132,199,0.25),0 4px 16px rgba(2,132,199,0.1); }
.nv5-truck-card.pend { border-color:#f59e0b !important; background:rgba(245,158,11,0.06); }
.nv5-tc-accent { height:4px; width:100%; }
.nv5-tc-body { padding:12px 13px 11px; }
.nv5-fuel-track { height:7px; background:var(--bg-elevated); border-radius:4px; overflow:hidden; flex:1; }
.nv5-fuel-fill { height:100%; border-radius:4px; transition:width 0.4s; }
/* Destination panel */
.nv5-dest-panel { background:var(--bg-surface); border:1.5px solid var(--border); border-radius:14px; padding:18px; box-shadow:0 4px 20px rgba(0,0,0,0.12); }
.nv5-dest-row { background:var(--bg-elevated); border:1.5px solid var(--border); border-radius:10px; margin-bottom:12px; overflow:hidden; }
.nv5-dest-head { padding:12px 14px; border-bottom:1px solid var(--border); display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:6px; }
.nv5-dest-body { padding:12px 14px; }
.nv5-route-step { display:flex; align-items:center; gap:8px; margin-bottom:8px; }
.nv5-route-dot { width:28px; height:28px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:11px; font-weight:700; flex-shrink:0; }
.nv5-inp { width:100%; padding:9px 12px; border:1.5px solid var(--border); border-radius:8px; font-size:12px; outline:none; transition:border-color 0.15s; box-sizing:border-box; background:var(--bg-surface); color:var(--text-primary); }
.nv5-inp:focus { border-color:#38bdf8; }
.nv5-autocomplete { position:absolute; z-index:9999; background:var(--bg-surface); border:1.5px solid var(--border); border-radius:8px; box-shadow:0 8px 24px rgba(0,0,0,0.2); max-height:180px; overflow-y:auto; min-width:260px; }
.nv5-ac-item { padding:9px 12px; cursor:pointer; font-size:12px; color:var(--text-primary); border-bottom:1px solid var(--border); transition:background 0.1s; }
.nv5-ac-item:hover { background:var(--bg-hover); }
.nv5-ac-item:last-child { border-bottom:none; }
/* KPI strip */
.nv5-kpi { display:grid; grid-template-columns:repeat(auto-fit,minmax(120px,1fr)); gap:10px; margin-bottom:16px; }
.nv5-kpi-card { border-radius:12px; padding:14px 16px; text-align:center; border:1px solid; }
/* Table */
.nv5-table { width:100%; border-collapse:collapse; font-size:12px; }
.nv5-table th { padding:9px 10px; text-align:left; color:var(--text-muted); font-weight:700; border-bottom:2px solid var(--border); white-space:nowrap; }
.nv5-table td { padding:10px 12px; border-bottom:1px solid var(--border); color:var(--text-primary); vertical-align:middle; }
.nv5-table tbody tr:last-child td { border-bottom:none; }
.nv5-table tbody tr:hover td { background:var(--bg-hover) !important; }
.nv5-table tr:hover td { background:var(--bg-hover); }
/* Status badges */
.nv5-badge { display:inline-flex; align-items:center; gap:4px; padding:3px 10px; border-radius:20px; font-size:10px; font-weight:700; }
/* Filter bar */
.nv5-filters { display:flex; flex-wrap:wrap; gap:8px; margin-bottom:14px; align-items:center; padding:12px 14px; background:var(--bg-surface); border-radius:10px; border:1px solid var(--border); }
.nv5-sel { padding:7px 10px; border:1.5px solid var(--border); border-radius:8px; font-size:12px; background:var(--bg-surface); color:var(--text-primary); outline:none; }
/* Timeline */
.nv5-timeline { position:relative; padding-left:24px; }
.nv5-timeline::before { content:''; position:absolute; left:8px; top:0; bottom:0; width:2px; background:var(--border); }
.nv5-tl-item { position:relative; margin-bottom:12px; }
.nv5-tl-dot { position:absolute; left:-24px; width:16px; height:16px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:8px; color:#fff; }
/* Analyse */
.nv5-chart-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(300px,1fr)); gap:16px; }
.nv5-chart-card { background:var(--bg-surface); border:1px solid var(--border); border-radius:12px; padding:16px; box-shadow:0 1px 4px rgba(0,0,0,0.1); }
/* Misc */
.nv5-btn { padding:8px 18px; border-radius:8px; border:none; cursor:pointer; font-size:12px; font-weight:700; transition:all 0.15s; }
.nv5-btn-primary { background:#0284c7; color:#fff; }
.nv5-btn-primary:hover { background:#0369a1; }
.nv5-btn-danger { background:#ef4444; color:#fff; }
.nv5-btn-success { background:#16a34a; color:#fff; }
.nv5-btn-ghost { background:var(--bg-elevated); color:var(--text-secondary); border:1px solid var(--border); }
.nv5-btn-ghost:hover { background:var(--bg-hover); }
.nv5-mod-banner { background:rgba(245,158,11,0.1); border:1.5px solid #f59e0b; border-radius:10px; padding:12px 14px; margin-bottom:10px; }
    `;
    document.head.appendChild(s);
  }


  naftalCheckAuth(section) {
    // localStorage with 7-day expiry
    var _checkStored = function(key) {
      try {
        var raw = localStorage.getItem(key);
        if (!raw) return false;
        var obj = JSON.parse(raw);
        if (obj && obj.ok && obj.expires && obj.expires > Date.now()) return true;
        localStorage.removeItem(key); // expired
      } catch(e) {}
      return false;
    };
    if (section === 'transport') {
      if (!this.naftalTransportAuth) this.naftalTransportAuth = _checkStored('nv5_auth_transport');
      return !!this.naftalTransportAuth;
    }
    if (section === 'gestionnaire') {
      if (!this.naftalGestionnaireAuth) this.naftalGestionnaireAuth = _checkStored('nv5_auth_gestionnaire');
      return !!this.naftalGestionnaireAuth;
    }
    return false;
  }

  naftalLogout(section) {
    if (section === 'transport' || !section) {
      this.naftalTransportAuth = false;
      localStorage.removeItem('nv5_auth_transport');
      sessionStorage.removeItem('nv5_auth_transport');
    }
    if (section === 'gestionnaire' || !section) {
      this.naftalGestionnaireAuth = false;
      localStorage.removeItem('nv5_auth_gestionnaire');
      sessionStorage.removeItem('nv5_auth_gestionnaire');
    }
    this.naftalSwitchView(this.naftalCurrentView || 'transport');
  }

  naftalRenderAuthGate(section) {
    var icons = { transport: 'fa-truck-ramp-box', gestionnaire: 'fa-user-tie' };
    var titles = { transport: 'Transport', gestionnaire: 'Gestionnaire Gasoil' };
    var colors = { transport: '#16a34a', gestionnaire: '#7c3aed' };
    var col = colors[section] || '#0284c7';
    return (
      '<div style="max-width:340px;margin:60px auto;text-align:center;">' +
        '<div style="width:64px;height:64px;border-radius:50%;background:' + col + '1a;margin:0 auto 18px;display:flex;align-items:center;justify-content:center;">' +
          '<i class="fa-solid ' + icons[section] + '" style="color:' + col + ';font-size:26px;"></i></div>' +
        '<h3 style="margin:0 0 6px;color:var(--text-primary,#1e293b);font-size:18px;">Accès ' + titles[section] + '</h3>' +
        '<p style="color:var(--text-muted,#64748b);font-size:13px;margin-bottom:20px;">Entrez votre mot de passe pour continuer</p>' +
        '<input id="naftalPwdInp" type="password" placeholder="Mot de passe..."' +
          ' style="width:100%;padding:11px 14px;border:1.5px solid var(--border,#e2e8f0);border-radius:10px;font-size:14px;outline:none;margin-bottom:12px;box-sizing:border-box;background:var(--bg-elevated,#f0f4f8);color:var(--text-primary,#1e293b);"' +
          ' onfocus="this.style.borderColor=\'#0284c7\';this.style.boxShadow=\'0 0 0 3px rgba(2,132,199,0.15)\'"' +
          ' onblur="this.style.borderColor=\'var(--border,#e2e8f0)\';this.style.boxShadow=\'none\'"' +
          ' onkeydown="if(event.key===\'Enter\')ui.naftalVerifyPassword(\'' + section + '\')"' +
          ' autofocus>' +
        '<button onclick="ui.naftalVerifyPassword(\'' + section + '\')" style="width:100%;padding:12px;background:' + col + ';color:#fff;border:none;border-radius:10px;font-size:14px;font-weight:700;cursor:pointer;">' +
          '<i class="fa-solid fa-lock-open"></i> Accéder</button>' +
        '<div id="naftalPwdErr" style="color:#ef4444;font-size:12px;margin-top:10px;"></div>' +
      '</div>'
    );
  }

  async naftalVerifyPassword(section) {
    var inp = document.getElementById('naftalPwdInp');
    var pwd = inp ? inp.value.trim() : '';
    if (!pwd) { var e=document.getElementById('naftalPwdErr'); if(e) e.textContent='Entrez votre mot de passe.'; return; }
    var errEl = document.getElementById('naftalPwdErr');
    var btn = document.querySelector('#nv5Body button[onclick*="naftalVerifyPassword"]');
    if (btn) { btn.disabled = true; btn.textContent = 'Vérification...'; }
    try {
      var r = await fetch('/api/naftal/auth', {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ section, password: pwd })
      });
      var d = await r.json();
      if (r.ok && d.success) {
        var _authExpiry = Date.now() + 7 * 24 * 60 * 60 * 1000; // 7 days
        if (section === 'transport') {
          this.naftalTransportAuth = true;
          localStorage.setItem('nv5_auth_transport', JSON.stringify({ok:true,expires:_authExpiry}));
        } else if (section === 'gestionnaire') {
          this.naftalGestionnaireAuth = true;
          localStorage.setItem('nv5_auth_gestionnaire', JSON.stringify({ok:true,expires:_authExpiry}));
        }
        this.naftalSwitchView(this.naftalCurrentView || 'transport');
      } else {
        if (errEl) errEl.textContent = d.error || 'Mot de passe incorrect';
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-lock-open"></i> Accéder'; }
        if (inp) { inp.select(); inp.focus(); }
      }
    } catch(e) {
      if (errEl) errEl.textContent = 'Erreur serveur: ' + e.message;
      if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-lock-open"></i> Accéder'; }
    }
  }


  renderNaftalSystem() {
    this.injectNaftalStyles();
    if (!this._geoCache) this._geoCache = {};
    var c = document.getElementById('naftalSystemContainer');
    if (!c) return;
    c.innerHTML =
      '<div class="nv5-wrap">' +
        '<div class="nv5-tabs">' +
          '<button class="nv5-tab" id="nvtab_transport" onclick="ui.naftalSwitchView(\'transport\')">' +
            '<i class="fa-solid fa-truck-ramp-box"></i> Transport</button>' +
          '<button class="nv5-tab" id="nvtab_gestionnaire" onclick="ui.naftalSwitchView(\'gestionnaire\')">' +
            '<i class="fa-solid fa-user-tie"></i> Gestionnaire</button>' +
          '<button class="nv5-tab" id="nvtab_historique" onclick="ui.naftalSwitchView(\'historique\')">' +
            '<i class="fa-solid fa-clock-rotate-left"></i> Historique</button>' +
          '<button class="nv5-tab" id="nvtab_analyse" onclick="ui.naftalSwitchView(\'analyse\')">' +
            '<i class="fa-solid fa-chart-pie"></i> Analyse</button>' +
        '</div>' +
        '<div id="nv5Body" class="nv5-body"></div>' +
      '</div>';
    this.naftalCurrentView = this.naftalCurrentView || 'transport';
    this.naftalSwitchView(this.naftalCurrentView);
  }

  naftalSwitchView(view) {
    this._naftalStopLiveRefresh();
    this.naftalCurrentView = view;
    ['transport','gestionnaire','historique','analyse'].forEach(function(v) {
      var t = document.getElementById('nvtab_' + v);
      if (t) t.classList.toggle('active', v === view);
    });
    var body = document.getElementById('nv5Body');
    if (!body) return;
    if (view === 'transport') this.renderNaftalTransport(body);
    else if (view === 'gestionnaire') this.renderNaftalGestionnaire(body);
    else if (view === 'historique') this.renderNaftalHistorique(body);
    else if (view === 'analyse') this.renderNaftalAnalyse(body);
  }


  _naftalGetTruckLocation(t) {
    if (!t) return 'Position inconnue';
    var skipZones = ['Zone inconnue','Unknown','undefined','En route','In transit','Moving','En mouvement','null',''];
    if (t.zone && skipZones.indexOf(t.zone) === -1) return t.zone;
    if (t.address && t.address.length > 3) return t.address;
    var co = t.coordinates; var lat = co&&co.lat; var lng = co&&co.lng;
    if (!lat||!lng||(lat===0&&lng===0)) return 'Position inconnue';
    var locs = (typeof FLEET_CONFIG!=='undefined'&&FLEET_CONFIG.CUSTOM_LOCATIONS)||[];
    var best = null; var bestDist = Infinity;
    for (var i=0;i<locs.length;i++) {
      var l=locs[i]; if (!l.lat||!l.lng) continue;
      var dLat=(l.lat-lat)*Math.PI/180, dLng=(l.lng-lng)*Math.PI/180;
      var a=Math.sin(dLat/2)*Math.sin(dLat/2)+Math.cos(lat*Math.PI/180)*Math.cos(l.lat*Math.PI/180)*Math.sin(dLng/2)*Math.sin(dLng/2);
      var dist=6371*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));
      var radius=(l.radius||5000)/1000;
      if (dist<=radius && dist<bestDist) { best=l.name; bestDist=dist; }
    }
    if (best) return best;
    return lat.toFixed(2)+'\u00b0N '+Math.abs(lng).toFixed(2)+'\u00b0'+(lng>=0?'E':'W');
  }

  async _naftalAsyncGeocode(tid, lat, lng) {
    if (!lat||!lng) return;
    var cacheKey = lat.toFixed(3)+'_'+lng.toFixed(3);
    if (!this._geoCache) this._geoCache = {};
    if (this._geoCache[cacheKey]) {
      ['nloc_','ndep_'].forEach(function(pfx){
        var el=document.getElementById(pfx+tid); if(el)el.textContent=this._geoCache[cacheKey];
      }.bind(this));
      return;
    }
    try {
      var keys=(typeof FLEET_CONFIG!=='undefined'&&FLEET_CONFIG.GEOAPIFY_API_KEYS)||[];
      var key=keys[0]; if(!key)return;
      var r=await fetch('https://api.geoapify.com/v1/geocode/reverse?lat='+lat+'&lon='+lng+'&lang=fr&apiKey='+key);
      if(!r.ok)return;
      var d=await r.json();
      var props=d.features&&d.features[0]&&d.features[0].properties;
      if(!props)return;
      var label=(props.city||props.county||props.state||'');
      var district=props.district||props.suburb||'';
      if(district&&label) label=district+', '+label;
      else if(district) label=district;
      if(!label) label=props.formatted||'';
      if(!label) return;
      this._geoCache[cacheKey]=label;
      ['nloc_','ndep_'].forEach(function(pfx){
        var el=document.getElementById(pfx+tid); if(el)el.textContent=label;
      });
      if(this.naftalDeclarationDraft){
        this.naftalDeclarationDraft.forEach(function(dr){
          if(String(dr.deviceId)===String(tid)&&(dr.currentLocation||'').includes('\u00b0'))dr.currentLocation=label;
        });
      }
    } catch(_){}
  }

  async _naftalCalcRoute(draft) {
    if (!draft) return null;
    var waypoints = [];
    if (draft.currentLat && draft.currentLng) waypoints.push(draft.currentLat+','+draft.currentLng);
    (draft.extraStops||[]).forEach(function(s){if(s.lat&&s.lng)waypoints.push(s.lat+','+s.lng);});
    if (draft.destinationLat && draft.destinationLng) waypoints.push(draft.destinationLat+','+draft.destinationLng);
    if (waypoints.length < 2) return null;
    try {
      var keys=(typeof FLEET_CONFIG!=='undefined'&&FLEET_CONFIG.GEOAPIFY_API_KEYS)||[];
      var key=keys[0]; if(!key)return null;
      var url='https://api.geoapify.com/v1/routing?waypoints='+waypoints.join('|')+'&mode=drive&apiKey='+key;
      var r=await fetch(url);
      if(!r.ok)return null;
      var d=await r.json();
      var feat=d.features&&d.features[0]&&d.features[0].properties;
      if(!feat)return null;
      var oneWayKm = Math.round((feat.distance||0)/1000);
      var oneWayMin = Math.round((feat.time||0)/60);
      // Round-trip: double the distance and time
      var factor = draft.isRoundTrip ? 2 : 1;
      return { distKm: oneWayKm * factor, timeMin: oneWayMin * factor };
    } catch(_){return null;}
  }

  _naftalFormatStatus(status) {
    var map = {
      draft: ['#64748b','#f8fafc','Brouillon'],
      transport_validated: ['#f59e0b','#fffbeb','Att. gestionnaire'],
      gestionnaire_validated: ['#16a34a','#f0fdf4','Approuvé'],
      in_progress: ['#0284c7','#e0f2fe','En cours'],
      completed: ['#6d28d9','#f5f3ff','Terminé'],
      cancelled: ['#dc2626','#fef2f2','Annulé']
    };
    var m = map[status] || ['#64748b','#f8fafc', status];
    return '<span class="nv5-badge" style="color:'+m[0]+';background:'+m[1]+';border:1px solid '+m[0]+'33;">'+m[2]+'</span>';
  }

  _naftalFormatDate(d) {
    if (!d) return '';
    return new Date(d).toLocaleString('fr-DZ', {day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'});
  }

  _naftalStopLiveRefresh() {
    if (this._naftalLiveTimer) { clearInterval(this._naftalLiveTimer); this._naftalLiveTimer = null; }
  }


  // ── TRANSPORT ─────────────────────────────────────────────────────────────

  renderNaftalTransport(body) {
    if (!body) return;
    if (!this.naftalCheckAuth('transport')) {
      // Try silent auto-auth first (works when no password configured)
      fetch('/api/naftal/auth', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({section:'transport',password:''})})
        .then(function(r){return r.json();})
        .then((d) => {
          if (d.success) {
            this.naftalTransportAuth = true;
            sessionStorage.setItem('nv5_auth_transport','1');
            this.renderNaftalTransport(body);
          } else {
            body.innerHTML = this.naftalRenderAuthGate('transport');
          }
        })
        .catch(() => { body.innerHTML = this.naftalRenderAuthGate('transport'); });
      return;
    }
    if (!this.naftalSelectedTrucks) this.naftalSelectedTrucks = new Set();
    if (!this.naftalDeclarationDraft) this.naftalDeclarationDraft = [];
    this._naftalTransportTab(this.naftalTransportTab || 'select');
  }

  _naftalTransportTab(tab) {
    this.naftalTransportTab = tab;
    var body = document.getElementById('nv5Body');
    if (!body) return;
    var html =
      '<div class="nv5-subtabs">' +
        '<button onclick="ui._naftalTransportTab(\'select\')" style="padding:8px 18px;border-radius:20px;border:none;cursor:pointer;font-size:12px;font-weight:700;transition:all 0.15s;background:'+(tab==='select'?'#16a34a':'#f0fdf4')+';color:'+(tab==='select'?'#fff':'#16a34a')+';box-shadow:'+(tab==='select'?'0 2px 8px rgba(22,163,74,0.3)':'none')+'">' +
          '<i class="fa-solid fa-plus"></i> Nouvelle Demande</button>' +
        '<button onclick="ui._naftalTransportTab(\'myrequests\')" style="padding:8px 18px;border-radius:20px;border:none;cursor:pointer;font-size:12px;font-weight:700;transition:all 0.15s;background:'+(tab==='myrequests'?'#0284c7':'#f0f9ff')+';color:'+(tab==='myrequests'?'#fff':'#0284c7')+';box-shadow:'+(tab==='myrequests'?'0 2px 8px rgba(2,132,199,0.3)':'none')+'">' +
          '<i class="fa-solid fa-list-check"></i> Mes Demandes</button>' +
      '</div>' +
      '<div id="nv5TransportContent"></div>';
    body.innerHTML = html;
    var content = document.getElementById('nv5TransportContent');
    if (tab === 'select') this._naftalRenderSelectView(content);
    else this._naftalRenderMyRequests(content);
  }

  async _naftalRenderSelectView(content) {
    if (!content) content = document.getElementById('nv5TransportContent');
    if (!content) return;
    // Pre-fetch active declarations to show truck state in grid
    try {
      var ar = await fetch('/api/naftal/declarations?status=transport_validated,gestionnaire_validated,in_progress&limit=500');
      if (ar.ok) {
        var activeList = await ar.json();
        var activeMap = {};
        activeList.forEach(function(d) {
          (d.trucks||[]).forEach(function(t) {
            activeMap[String(t.deviceId)] = { declarationId: d.declarationId, status: d.status };
          });
        });
        this._naftalActiveDecls = activeMap;
      }
    } catch(_) { this._naftalActiveDecls = {}; }
    var allT2 = (typeof app !== 'undefined' ? app.getAllTrucks() : []) || [];
    content.innerHTML =
      '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;margin-bottom:10px;">' +
        '<div>' +
          '<h3 style="margin:0 0 3px;color:#0284c7;font-size:15px;"><i class="fa-solid fa-truck-ramp-box"></i> Sélectionner Camion(s)</h3>' +
          '<div style="font-size:11px;color:var(--text-muted,#64748b);">' + allT2.length + ' camion(s) dans la flotte</div>' +
        '</div>' +
        '<input id="nv5SearchInp" type="text" placeholder="🔍 Camion, carte, immat..." value="'+(this.naftalSearchQuery||'')+'" ' +
          'oninput="ui.naftalSearchQuery=this.value;clearTimeout(ui._srchT);ui._srchT=setTimeout(function(){var g=document.getElementById(\'nv5Grid\');if(g)ui._naftalRenderTruckGrid(g);},180);" ' +
          'style="padding:9px 14px;border:1.5px solid var(--border,#e2e8f0);border-radius:20px;font-size:12px;width:220px;outline:none;background:var(--bg-elevated,#fff);color:var(--text-primary,#1e293b);" ' +
          'onfocus="this.style.borderColor=\'#38bdf8\'" onblur="this.style.borderColor=\'var(--border,#e2e8f0)\'">' +
      '</div>' +
      // Sort bar
      '<div style="display:flex;gap:6px;margin-bottom:10px;flex-wrap:wrap;align-items:center;">' +
        '<span style="font-size:11px;color:var(--text-muted,#64748b);font-weight:600;">Trier&nbsp;:</span>' +
        '<button id="nvsort_name" onclick="ui.naftalSortField=\'name\';ui.naftalSortDir=(ui.naftalSortDir===\'asc\'?\'desc\':\'asc\');var g=document.getElementById(\'nv5Grid\');if(g)ui._naftalRenderTruckGrid(g);" ' +
          'style="padding:4px 10px;border:1.5px solid var(--border,#e2e8f0);border-radius:20px;font-size:11px;font-weight:600;background:var(--bg-elevated,#fff);color:var(--text-secondary,#374151);cursor:pointer;">' +
          '<i class="fa-solid fa-font"></i> Nom</button>' +
        '<button id="nvsort_fuel" onclick="ui.naftalSortField=\'fuel\';ui.naftalSortDir=(ui.naftalSortField!==\'fuel\'?\'asc\':(ui.naftalSortDir===\'asc\'?\'desc\':\'asc\'));var g=document.getElementById(\'nv5Grid\');if(g)ui._naftalRenderTruckGrid(g);" ' +
          'style="padding:4px 10px;border:1.5px solid var(--border,#e2e8f0);border-radius:20px;font-size:11px;font-weight:600;background:var(--bg-elevated,#fff);color:var(--text-secondary,#374151);cursor:pointer;">' +
          '<i class="fa-solid fa-percent"></i> Carburant %</button>' +
        '<button id="nvsort_liters" onclick="ui.naftalSortField=\'liters\';ui.naftalSortDir=(ui.naftalSortField!==\'liters\'?\'asc\':(ui.naftalSortDir===\'asc\'?\'desc\':\'asc\'));var g=document.getElementById(\'nv5Grid\');if(g)ui._naftalRenderTruckGrid(g);" ' +
          'style="padding:4px 10px;border:1.5px solid var(--border,#e2e8f0);border-radius:20px;font-size:11px;font-weight:600;background:var(--bg-elevated,#fff);color:var(--text-secondary,#374151);cursor:pointer;">' +
          '<i class="fa-solid fa-gas-pump"></i> Litres</button>' +
      '</div>' +
      '<div id="nv5SelBar"></div>' +
      '<div id="nv5Grid" class="nv5-truck-grid" style="margin-bottom:14px;"></div>' +
      '<div id="nv5DestPanel"></div>';

    this._naftalRenderTruckGrid(document.getElementById('nv5Grid'));
    this._naftalUpdateSelectionBar();
    if (this.naftalSelectedTrucks.size > 0 && this.naftalDeclarationDraft.length > 0) {
      this.naftalOpenDestinationModal();
    }
  }

  _naftalRenderTruckGrid(gridEl) {
    if (!gridEl) return;
    var allT = (typeof app!=='undefined'?app.getAllTrucks():[]) || [];
    var db = this.truckDbCache || [];
    var q = (this.naftalSearchQuery||'').toLowerCase();
    // Show ALL trucks — even those without carteNaftal (they show with ⚠️ badge)
    var naftalTrucks = allT.filter(function(t) {
      if (!q) return true;
      var d = db.find(function(x){return String(x.deviceId)===String(t.id||t.deviceId);}) || {};
      return (t.name||'').toLowerCase().includes(q)||(d.carteNaftal||'').toLowerCase().includes(q)||(d.immatriculation||'').toLowerCase().includes(q);
    });
    // Apply sort
    var sortF = this.naftalSortField || 'name';
    var sortD = this.naftalSortDir || 'asc';
    naftalTrucks.sort(function(a, b) {
      var da = db.find(function(x){return String(x.deviceId)===String(a.id||a.deviceId);})||{};
      var db2 = db.find(function(x){return String(x.deviceId)===String(b.id||b.deviceId);})||{};
      if (sortF==='fuel')  return sortD==='asc' ? (a.fuelPercentage||0)-(b.fuelPercentage||0) : (b.fuelPercentage||0)-(a.fuelPercentage||0);
      if (sortF==='liters') return sortD==='asc' ? (a.fuelLiters||0)-(b.fuelLiters||0) : (b.fuelLiters||0)-(a.fuelLiters||0);
      // default: name
      var na = (a.name||'').toLowerCase(), nb = (b.name||'').toLowerCase();
      return sortD==='asc' ? na.localeCompare(nb) : nb.localeCompare(na);
    });
    if (!naftalTrucks.length) {
      gridEl.innerHTML = '<div style="text-align:center;padding:30px;color:#64748b;"><i class="fa-solid fa-truck" style="font-size:28px;opacity:0.3;"></i><br><br>Aucun camion trouvé</div>';
      return;
    }
    var sel = this.naftalSelectedTrucks;
    var draft = this.naftalDeclarationDraft;
    var activeDecls = this._naftalActiveDecls || {};
    var html = '';
    naftalTrucks.forEach(function(t) {
      var tid = String(t.id||t.deviceId);
      var db2 = (this.truckDbCache||[]).find(function(x){return String(x.deviceId)===tid;}) || {};
      var fp = Math.round(t.fuelPercentage||0);
      var fl = Math.round(t.fuelLiters||0);
      var fc = fp<=5?'#ef4444':fp<=20?'#f59e0b':'#16a34a';
      var isSel = sel.has(tid);
      var isPend = !isSel && draft.some(function(d){return String(d.deviceId)===tid;});
      var activeDecl = !isSel && !isPend ? activeDecls[tid] : null;
      var isActiveInDB = !!activeDecl;
      var loc = this._naftalGetTruckLocation(t);
      var accentColor = isSel?'#0284c7':fc;
      var cardClass = 'nv5-truck-card'+(isSel?' sel':isPend?' pend':isActiveInDB?' pend':'');

      html += '<div class="'+cardClass+'" onclick="ui._naftalToggleTruck(\''+tid+'\')">' +
        '<div class="nv5-tc-accent" style="background:'+accentColor+';"></div>' +
        '<div class="nv5-tc-body">' +
          '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:7px;">' +
            '<span style="font-weight:800;font-size:14px;color:#1e293b;">'+(t.name||tid)+'</span>';
      if (isSel) {
        html += '<span style="width:22px;height:22px;border-radius:50%;background:#0284c7;display:flex;align-items:center;justify-content:center;flex-shrink:0;box-shadow:0 2px 6px rgba(2,132,199,0.4);">' +
                '<i class="fa-solid fa-check" style="color:#fff;font-size:10px;"></i></span>';
      } else if (isPend) {
        html += '<span style="background:#f59e0b;color:#fff;border-radius:5px;padding:2px 7px;font-size:9px;font-weight:700;"><i class="fa-solid fa-hourglass-half"></i> En préparation</span>';
      } else if (isActiveInDB) {
        var aStatus = activeDecl.status;
        var aLabel = aStatus==='transport_validated'?'Att. gestionnaire':aStatus==='gestionnaire_validated'?'Approuvé ✓':'En cours ⟳';
        var aBg = aStatus==='transport_validated'?'#f59e0b':aStatus==='gestionnaire_validated'?'#16a34a':'#0284c7';
        html += '<span style="background:'+aBg+';color:#fff;border-radius:5px;padding:2px 7px;font-size:9px;font-weight:700;">'+aLabel+'</span>';
      }
      html += '</div>';

      var hasCard = !!(db2.carteNaftal);
      var cardBg = hasCard ? '#e0f2fe' : '#fef3c7';
      var cardBorder = hasCard ? '#7dd3fc' : '#fcd34d';
      var cardColor = hasCard ? '#0369a1' : '#92400e';
      var cardText = hasCard ? db2.carteNaftal : '⚠️ Sans Carte';
      html += '<div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:7px;">' +
        '<span style="display:inline-flex;align-items:center;gap:3px;background:'+cardBg+';border:1px solid '+cardBorder+';border-radius:20px;padding:2px 8px;">' +
          '<i class="fa-solid fa-credit-card" style="color:'+cardColor+';font-size:8px;"></i>' +
          '<span style="font-size:10px;color:'+cardColor+';font-weight:700;font-family:monospace;">'+cardText+'</span></span>';
      if (db2.immatriculation) {
        html += '<span style="font-size:9px;color:var(--text-muted,#64748b);background:var(--bg-elevated,#f1f5f9);padding:2px 7px;border-radius:20px;border:1px solid var(--border,#e2e8f0);">'+(db2.immatriculation)+'</span>';
      }
      html += '</div>';

      html += '<div style="font-size:10px;color:#64748b;margin-bottom:8px;display:flex;align-items:center;gap:4px;">' +
        '<i class="fa-solid fa-location-dot" style="color:'+accentColor+';font-size:9px;flex-shrink:0;"></i>' +
        '<span id="nloc_'+tid+'" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">'+loc+'</span></div>';

      // Trigger geocode for all trucks (cached)
      if (t.coordinates && t.coordinates.lat && t.coordinates.lat !== 0) {
        setTimeout(function(id2,la2,lo2){ui._naftalAsyncGeocode(id2,la2,lo2);},50,tid,t.coordinates.lat,t.coordinates.lng);
      }

      html += '<div style="display:flex;align-items:center;gap:6px;">' +
        '<div class="nv5-fuel-track"><div class="nv5-fuel-fill" style="width:'+fp+'%;background:'+fc+';"></div></div>' +
        '<span style="font-size:12px;font-weight:900;color:'+fc+';min-width:32px;text-align:right;">'+fp+'%</span>' +
        '<span style="font-size:9px;color:#94a3b8;">'+fl+'L</span></div>';

      html += '</div></div>';
    }.bind(this));
    gridEl.innerHTML = html;
  }

  async _naftalToggleTruck(deviceId) {
    deviceId = String(deviceId);
    var allT = (typeof app!=='undefined'?app.getAllTrucks():[]) || [];
    var t = allT.find(function(x){return String(x.id||x.deviceId)===deviceId;});
    if (!t) return;
    var db = (this.truckDbCache||[]).find(function(x){return String(x.deviceId)===deviceId;}) || {};

    // Check if truck has a pending/active declaration
    try {
      var chk = await fetch('/api/naftal/declarations?deviceId='+deviceId+'&status=transport_validated,gestionnaire_validated,in_progress&limit=1');
      if (chk.ok) {
        var chkD = await chk.json();
        if (chkD.length > 0 && !this.naftalSelectedTrucks.has(deviceId)) {
          var existDecl = chkD[0];
          var truckEntry = (existDecl.trucks||[]).find(function(t){return String(t.deviceId)===deviceId;}) || {};

          // ── REMOVED: truck was withdrawn from this declaration ────────────
          if (truckEntry.isRemoved) {
            var removedTruckName = truckEntry.truckName || deviceId;
            var removedAt = truckEntry.removedAt ? new Date(truckEntry.removedAt).toLocaleDateString('fr-DZ') : '';
            var removeReason = truckEntry.removeReason || '';
            var wantRestore = await ui_showConfirm(
              '🚫 ' + removedTruckName + ' a été retiré de la déclaration ' + existDecl.declarationId + '\n' +
              (removedAt ? 'Date de retrait : ' + removedAt + '\n' : '') +
              (removeReason ? 'Motif : ' + removeReason + '\n' : '') +
              '\nVoulez-vous demander sa RESTAURATION au gestionnaire ?\n' +
              'Le camion sera réintégré dans la déclaration si le gestionnaire accepte.',
              'Camion retiré', '🚫', '🔄 Demander restauration'
            );
            if (wantRestore) {
              await this._naftalRequestTruckRestore(existDecl.declarationId, deviceId, removedTruckName);
            } else {
              this._naftalTransportTab('myrequests');
            }
            return;
          }

          // ── EN COURS: gestionnaire already validated & refill started ──────
          if (existDecl.status === 'in_progress') {
            var truckName = truckEntry.truckName || deviceId;
            var allTrucks = existDecl.trucks||[];
            var otherCount = allTrucks.length - 1;
            var refillInfo = truckEntry.refillStatus === 'in_progress' ? 'Ravitaillement en cours...' :
                             truckEntry.refillStatus === 'completed'   ? '✅ Ravitaillement terminé' :
                             truckEntry.refillStatus === 'flagged'     ? '🚩 Anomalie détectée' : 'En attente';
            var wantDelete = await ui_showConfirm(
              '🔄 ' + truckName + ' est EN COURS DE RAVITAILLEMENT\n' +
              existDecl.declarationId + ' (' + allTrucks.length + ' camion(s) total)\n' +
              refillInfo + '\n\n' +
              'Voulez-vous demander le RETRAIT de ce camion uniquement ?\n' +
              (otherCount > 0 ? 'Les ' + otherCount + ' autre(s) camion(s) resteront dans la déclaration.' : 'Ce camion est le seul — la déclaration sera annulée.'),
              'Retrait camion', '🔄', '📩 Demander retrait de ' + truckName
            );
            if (wantDelete) {
              await this._naftalRequestTruckRemoval(existDecl.declarationId, deviceId, truckName);
            } else {
              this._naftalTransportTab('myrequests');
            }
            return;
          }

          // ── TRANSPORT/GEST VALIDATED: show clear bottom sheet ────────
          var statusLabels = {
            transport_validated: '⏳ En attente gestionnaire',
            gestionnaire_validated: '✅ Approuvé — en attente ravitaillement'
          };
          var declStatus = statusLabels[existDecl.status] || existDecl.status;
          var truckName2 = truckEntry.truckName || deviceId;
          var forced = await new Promise(function(resolve) {
            var oid = 'nv5bs_' + Date.now();
            var sheet = document.createElement('div');
            sheet.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,0.5);display:flex;align-items:flex-end;justify-content:center;';
            sheet.innerHTML = '<div style="background:var(--bg-surface,#fff);border-radius:20px 20px 0 0;padding:24px 20px;width:100%;max-width:520px;box-shadow:0 -8px 40px rgba(0,0,0,0.2);">'
              + '<div style="width:36px;height:4px;background:var(--border,#e2e8f0);border-radius:2px;margin:0 auto 16px;"></div>'
              + '<div style="display:flex;align-items:center;gap:10px;margin-bottom:14px;">'
              +   '<div style="width:40px;height:40px;border-radius:50%;background:rgba(234,179,8,0.15);display:flex;align-items:center;justify-content:center;flex-shrink:0;"><i class="fa-solid fa-triangle-exclamation" style="color:#d97706;font-size:18px;"></i></div>'
              +   '<div><div style="font-weight:800;font-size:15px;color:var(--text-primary,#1e293b);">'+truckName2+' est déjà en demande</div>'
              +       '<div style="font-size:12px;color:var(--text-muted,#64748b);margin-top:2px;">'+existDecl.declarationId+' · '+declStatus+'</div></div>'
              + '</div>'
              + '<button id="'+oid+'_view" style="width:100%;padding:13px;background:#0284c7;color:#fff;border:none;border-radius:12px;font-size:14px;font-weight:700;cursor:pointer;margin-bottom:8px;">'
              +   '<i class="fa-solid fa-list-check"></i> Voir dans Mes Demandes</button>'
              + '<button id="'+oid+'_force" style="width:100%;padding:13px;background:var(--bg-elevated,#fff);color:#dc2626;border:2px solid #fca5a5;border-radius:12px;font-size:13px;font-weight:700;cursor:pointer;margin-bottom:8px;">'
              +   '<i class="fa-solid fa-bolt"></i> Forcer nouvelle demande quand même</button>'
              + '<button id="'+oid+'_cancel" style="width:100%;padding:11px;background:var(--bg-elevated,#f8fafc);color:var(--text-muted,#64748b);border:1.5px solid var(--border,#e2e8f0);border-radius:12px;font-size:13px;font-weight:600;cursor:pointer;">'
              +   'Annuler</button>'
              + '</div>';
            document.body.appendChild(sheet);
            var cleanup = function(result) { try{sheet.remove();}catch(e){} resolve(result); };
            document.getElementById(oid+'_view').onclick = function()  { cleanup('view'); };
            document.getElementById(oid+'_force').onclick = function() { cleanup('force'); };
            document.getElementById(oid+'_cancel').onclick = function(){ cleanup('cancel'); };
            sheet.onclick = function(e){ if(e.target===sheet) cleanup('cancel'); };
          });
          if (forced === 'view') { this._naftalTransportTab('myrequests'); return; }
          if (forced !== 'force') return; // cancelled
        }
      }
    } catch(_) {}

    if (this.naftalSelectedTrucks.has(deviceId)) {
      this.naftalSelectedTrucks.delete(deviceId);
      this.naftalDeclarationDraft = (this.naftalDeclarationDraft||[]).filter(function(d){return String(d.deviceId)!==deviceId;});
    } else {
      this.naftalSelectedTrucks.add(deviceId);
      var loc = this._naftalGetTruckLocation(t);
      var co = t.coordinates||{};
      this.naftalDeclarationDraft = this.naftalDeclarationDraft||[];
      if (!this.naftalDeclarationDraft.find(function(d){return String(d.deviceId)===deviceId;})) {
        this.naftalDeclarationDraft.push({
          deviceId: deviceId,
          truckName: t.name || deviceId,
          carteNaftal: db.carteNaftal || '',
          immatriculation: db.immatriculation || '',
          driverName: db.driverName || '',
          driverPhone: db.driverPhone || '',
          trailer: db.trailer || '',
          currentLocation: loc,
          currentLat: co.lat,
          currentLng: co.lng,
          currentFuelLiters: Math.round(t.fuelLiters||0),
          currentFuelPercent: Math.round(t.fuelPercentage||0),
          destination: '',
          destinationLat: null,
          destinationLng: null,
          estimatedDistanceKm: 0,
          estimatedFuelNeeded: 0,
          estimatedCostDA: 0,
          extraStops: []
        });
        // Show scroll-down hint toast (only once per session)
        if (!this._naftalScrollHintShown) {
          this._naftalScrollHintShown = true;
          var toast = document.createElement('div');
          toast.style.cssText = 'position:fixed;bottom:80px;left:50%;transform:translateX(-50%);background:#1e293b;color:#fff;padding:12px 22px;border-radius:12px;font-size:13px;font-weight:600;z-index:99999;display:flex;align-items:center;gap:10px;box-shadow:0 4px 20px rgba(0,0,0,0.3);pointer-events:none;';
          toast.innerHTML = '<i class="fa-solid fa-circle-arrow-down" style="font-size:16px;color:#22c55e;"></i>&nbsp;Faites défiler vers le bas pour remplir la destination et estimer le montant';
          document.body.appendChild(toast);
          setTimeout(function(){ toast.style.transition='opacity 0.5s'; toast.style.opacity='0'; setTimeout(function(){toast.remove();},600); }, 4000);
        }
      }
    }
    var g = document.getElementById('nv5Grid');
    if (g) this._naftalRenderTruckGrid(g);
    this._naftalUpdateSelectionBar();
    if (this.naftalSelectedTrucks.size > 0) this.naftalOpenDestinationModal();
    else { var p = document.getElementById('nv5DestPanel'); if(p)p.innerHTML=''; }
  }

  _naftalRemoveDraftTruck(deviceId) {
    // Remove a truck from the declaration draft before submission
    this.naftalSelectedTrucks.delete(String(deviceId));
    this.naftalDeclarationDraft = (this.naftalDeclarationDraft||[]).filter(function(d){return String(d.deviceId)!==String(deviceId);});
    // Re-render grid + destination panel
    var g = document.getElementById('nv5Grid');
    if (g) this._naftalRenderTruckGrid(g);
    this._naftalUpdateSelectionBar();
    this.naftalOpenDestinationModal();
    // Show feedback toast
    var toast = document.createElement('div');
    toast.style.cssText = 'position:fixed;bottom:80px;left:50%;transform:translateX(-50%);background:#16a34a;color:#fff;padding:11px 20px;border-radius:12px;font-size:13px;font-weight:600;z-index:99999;box-shadow:0 4px 20px rgba(0,0,0,0.2);pointer-events:none;';
    toast.innerHTML = '<i class="fa-solid fa-check"></i>&nbsp;Camion retiré de la sélection';
    document.body.appendChild(toast);
    setTimeout(function(){ toast.style.transition='opacity 0.5s'; toast.style.opacity='0'; setTimeout(function(){toast.remove();},500); }, 2000);
  }

  _naftalUpdateSelectionBar() {
    var bar = document.getElementById('nv5SelBar');
    if (!bar) return;
    var count = this.naftalSelectedTrucks ? this.naftalSelectedTrucks.size : 0;
    if (!count) { bar.innerHTML = ''; return; }
    bar.innerHTML =
      '<div style="background:#0284c7;color:#fff;border-radius:10px;padding:10px 16px;margin-bottom:12px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;">' +
        '<span style="font-weight:700;"><i class="fa-solid fa-check-circle"></i> '+count+' camion(s) sélectionné(s)</span>' +
        '<button onclick="ui._naftalClearSelection()" style="background:rgba(255,255,255,0.2);border:none;color:#fff;padding:5px 12px;border-radius:6px;cursor:pointer;font-size:11px;">✕ Effacer</button>' +
      '</div>';
  }

  _naftalClearSelection() {
    this.naftalSelectedTrucks = new Set();
    this.naftalDeclarationDraft = [];
    var g = document.getElementById('nv5Grid');
    if (g) this._naftalRenderTruckGrid(g);
    this._naftalUpdateSelectionBar();
    var p = document.getElementById('nv5DestPanel');
    if (p) p.innerHTML = '';
  }

  // ── DESTINATION PANEL ─────────────────────────────────────────────────────

  naftalOpenDestinationModal() {
    var panel = document.getElementById('nv5DestPanel');
    if (!panel) return;
    var draft = this.naftalDeclarationDraft || [];
    if (!draft.length) { panel.innerHTML=''; return; }
    var self = this;
    var naftalPrice = (typeof FLEET_CONFIG!=='undefined'&&FLEET_CONFIG.NAFTAL_MANAGEMENT&&FLEET_CONFIG.NAFTAL_MANAGEMENT.defaultNaftalPrice)||31;

    var html = '<div class="nv5-dest-panel"><h3 style="margin:0 0 14px;color:#0284c7;font-size:14px;"><i class="fa-solid fa-route"></i> Destinations & Estimation</h3>';

    draft.forEach(function(e) {
      var fp = e.currentFuelPercent||0;
      var fl = e.currentFuelLiters||0;
      var fc = fp<=5?'#ef4444':fp<=20?'#f59e0b':'#16a34a';
      var totalDA = 0; var totalL = 0; var totalKm = 0;
      if (e.estimatedCostDA) totalDA = e.estimatedCostDA;
      if (e.estimatedFuelNeeded) totalL = e.estimatedFuelNeeded;
      if (e.estimatedDistanceKm) totalKm = e.estimatedDistanceKm;

      html += '<div class="nv5-dest-row" id="drow_'+e.deviceId+'">' +
        '<div class="nv5-dest-head">' +
          '<div style="display:flex;align-items:center;gap:10px;">' +
            '<div style="width:36px;height:36px;border-radius:8px;background:'+fc+'22;display:flex;align-items:center;justify-content:center;">' +
              '<i class="fa-solid fa-truck" style="color:'+fc+';font-size:14px;"></i></div>' +
            '<div>' +
              '<div style="font-weight:800;color:var(--text-primary,#1e293b);font-size:13px;">'+(e.truckName||e.deviceId)+'</div>' +
              '<div style="display:flex;gap:5px;margin-top:3px;flex-wrap:wrap;align-items:center;">' +
                '<span style="font-size:10px;background:#e0f2fe;color:#0369a1;padding:1px 7px;border-radius:20px;font-weight:700;">'+(e.carteNaftal||'N/A')+'</span>' +
                (e.immatriculation?'<span style="font-size:10px;background:var(--bg-elevated,#f1f5f9);color:var(--text-muted,#64748b);padding:1px 7px;border-radius:20px;">'+e.immatriculation+'</span>':'') +
                (e.driverName?'<span style="font-size:10px;background:#ecfdf5;color:#059669;padding:1px 7px;border-radius:20px;font-weight:600;"><i class="fa-solid fa-user"></i> '+e.driverName+'</span>':'') +
                (e.trailer?'<span style="font-size:10px;background:#f5f3ff;color:#7c3aed;padding:1px 7px;border-radius:20px;font-weight:600;"><i class="fa-solid fa-trailer"></i> '+e.trailer+'</span>':'') +
              '</div>' +
            '</div>' +
          '</div>' +
          '<div style="display:flex;flex-direction:column;align-items:flex-end;gap:6px;">' +
            '<button onclick="ui._naftalRemoveDraftTruck(\''+e.deviceId+'\')" title="Retirer ce camion de la déclaration" style="background:#fee2e2;border:1.5px solid #fca5a5;color:#dc2626;padding:4px 10px;border-radius:8px;cursor:pointer;font-size:11px;font-weight:700;display:flex;align-items:center;gap:4px;"><i class="fa-solid fa-xmark"></i> Retirer</button>' +
            '<div style="text-align:right;">' +
              '<span style="font-size:18px;font-weight:900;color:'+fc+';">'+fp+'%</span>' +
              '<div style="font-size:10px;color:#64748b;">'+fl+'L</div>' +
            '</div>' +
          '</div>' +
        '</div>' +
        '<div style="padding:0 14px 6px;background:var(--bg-elevated,#f8fafc);">' +
          '<div style="font-size:11px;color:#64748b;margin:8px 0 6px;display:flex;align-items:center;gap:5px;">' +
            '<i class="fa-solid fa-location-dot" style="color:'+fc+';font-size:10px;"></i>' +
            '<span id="ndep_'+e.deviceId+'">'+(e.currentLocation||'Inconnue')+'</span>' +
          '</div>';

      // Route steps
      html += '<div id="route_'+e.deviceId+'">';
      // Départ (fixed)
      html += '<div class="nv5-route-step">' +
        '<div class="nv5-route-dot" style="background:#22c55e;color:#fff;font-size:8px;"><i class="fa-solid fa-flag"></i></div>' +
        '<span style="font-size:11px;color:#64748b;flex:1;">Départ: <span id="ndep_lbl_'+e.deviceId+'">'+(e.currentLocation||'Position actuelle')+'</span></span>' +
      '</div>';

      // Extra stops
      var stops = e.extraStops || [];
      stops.forEach(function(stop, sidx) {
        html += '<div class="nv5-route-step" id="stop_row_'+e.deviceId+'_'+sidx+'">' +
          '<div class="nv5-route-dot" style="background:#f59e0b;color:#fff;">'+(sidx+1)+'</div>' +
          '<div style="flex:1;position:relative;">' +
            '<input type="text" class="nv5-inp" id="stop_inp_'+e.deviceId+'_'+sidx+'" value="'+(stop.name||'')+'" placeholder="Étape '+(sidx+1)+'..." ' +
              'oninput="ui.naftalUpdateStop(\''+e.deviceId+'\','+sidx+',this.value)" ' +
              'onfocus="ui._naftalDestInput(\''+e.deviceId+'\',\'stop\','+sidx+')" ' +
              'style="padding-right:30px;">' +
            '<div id="nac_'+e.deviceId+'_stop'+sidx+'" style="position:absolute;left:0;right:0;top:36px;z-index:9999;"></div>' +
          '</div>' +
          '<button onclick="ui.naftalRemoveStop(\''+e.deviceId+'\','+sidx+')" style="background:#fee2e2;border:none;color:#ef4444;padding:5px 8px;border-radius:6px;cursor:pointer;margin-left:6px;font-size:11px;flex-shrink:0;">✕</button>' +
        '</div>';
      });

      // Main destination
      html += '<div class="nv5-route-step">' +
        '<div class="nv5-route-dot" style="background:#0284c7;color:#fff;font-size:8px;"><i class="fa-solid fa-flag-checkered"></i></div>' +
        '<div style="flex:1;position:relative;">' +
          '<input type="text" class="nv5-inp" id="dest_inp_'+e.deviceId+'" value="'+(e.destination||'')+'" placeholder="Destination principale..." ' +
            'oninput="clearTimeout(ui._destT_'+e.deviceId.replace(/[^a-z0-9]/gi,'')+');ui._destT_'+e.deviceId.replace(/[^a-z0-9]/gi,'')+'=setTimeout(function(){ui.naftalSearchDestination(\''+e.deviceId+'\',document.getElementById(\'dest_inp_'+e.deviceId+'\').value);},300);">' +
          '<div id="nac_'+e.deviceId+'_main" style="position:absolute;left:0;right:0;top:36px;z-index:9999;"></div>' +
        '</div>' +
      '</div>';

      html += '</div>';// route

      // + Étape button
      html += '<button onclick="ui.naftalAddStop(\''+e.deviceId+'\')" style="margin:0 0 10px 48px;background:#f0f9ff;border:1.5px dashed #7dd3fc;color:#0284c7;padding:5px 14px;border-radius:8px;cursor:pointer;font-size:11px;font-weight:600;">' +
        '<i class="fa-solid fa-plus"></i> + Étape</button>';

      // Aller-Retour toggle
      html += '<label style="display:flex;align-items:center;gap:8px;margin:0 0 10px 48px;cursor:pointer;user-select:none;">' +
        '<input type="checkbox" id="rt_'+e.deviceId+'" '+(e.isRoundTrip?'checked':'')+
          ' onchange="ui.naftalSetRoundTrip(\''+e.deviceId+'\',this.checked)" ' +
          'style="width:16px;height:16px;accent-color:#0284c7;cursor:pointer;">' +
        '<span style="font-size:12px;color:#374151;font-weight:600;"><i class="fa-solid fa-arrows-left-right" style="color:#0284c7;margin-right:4px;"></i>Aller-Retour <span style="font-size:10px;color:#94a3b8;">(distance × 2)</span></span>' +
        '</label>';

      // Estimate strip
      var rtBadge0 = e.isRoundTrip ? '<span style="background:#fef3c7;color:#92400e;border-radius:4px;padding:1px 5px;font-size:9px;font-weight:700;margin-right:4px;">↩ A/R</span>' : '';
      html += '<div id="nest_'+e.deviceId+'" style="background:#fff;border:1px solid #e2e8f0;border-radius:8px;padding:8px 12px;margin:0 0 10px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">' +
        rtBadge0+
        '<span style="color:#64748b;font-size:11px;"><i class="fa-solid fa-route" style="color:#0284c7;"></i> '+
          (totalKm?totalKm+' km':'-- km')+'</span>' +
        '<span style="color:#64748b;font-size:11px;"><i class="fa-solid fa-gas-pump" style="color:#f59e0b;"></i> '+
          (totalL?Math.round(totalL)+' L':'-- L')+'</span>' +
        '<span style="color:#0284c7;font-size:13px;font-weight:800;">'+
          (totalDA?Math.round(totalDA).toLocaleString('fr-DZ')+' DA':'-- DA')+'</span>' +
      '</div>';

      html += '</div></div>'; // route-body + dest-row

      // Trigger geocode for departure
      if (e.currentLat && e.currentLng) {
        setTimeout(function(id2,la2,lo2){ui._naftalAsyncGeocode(id2,la2,lo2);},50,e.deviceId,e.currentLat,e.currentLng);
      }
    });

    var totalAllDA = draft.reduce(function(s,e){return s+(e.estimatedCostDA||0);},0);
    html +=
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-top:14px;padding-top:12px;border-top:1.5px solid #e2e8f0;">' +
        '<span style="color:#64748b;font-size:12px;"><i class="fa-solid fa-sigma"></i> Total estimé — '+draft.length+' camion(s): <strong style="color:#0284c7;">'+Math.round(totalAllDA).toLocaleString('fr-DZ')+' DA</strong></span>' +
        '<button onclick="ui.naftalValidateTransport()" class="nv5-btn nv5-btn-primary" style="padding:11px 28px;">' +
          '<i class="fa-solid fa-paper-plane"></i> Soumettre la Déclaration ('+draft.length+' camion(s))</button>' +
      '</div></div>';

    panel.innerHTML = html;
  }

  naftalAddStop(tid) {
    var draft = (this.naftalDeclarationDraft||[]).find(function(d){return String(d.deviceId)===String(tid);});
    if (!draft) return;
    if (!draft.extraStops) draft.extraStops = [];
    draft.extraStops.push({name:'',lat:null,lng:null});
    this.naftalOpenDestinationModal();
  }

  naftalRemoveStop(tid, idx) {
    var draft = (this.naftalDeclarationDraft||[]).find(function(d){return String(d.deviceId)===String(tid);});
    if (!draft||!draft.extraStops) return;
    draft.extraStops.splice(idx,1);
    this.naftalOpenDestinationModal();
  }

  naftalUpdateStop(tid, idx, val) {
    var draft = (this.naftalDeclarationDraft||[]).find(function(d){return String(d.deviceId)===String(tid);});
    if (!draft||!draft.extraStops||!draft.extraStops[idx]) return;
    draft.extraStops[idx].name = val;
  }

  async naftalSearchDestination(tid, query, target) {
    // target: 'main' or 'stopN'
    var acId = 'nac_'+tid+'_'+(target||'main');
    var acEl = document.getElementById(acId);
    if (!acEl) return;
    if (!query||query.length<2) { acEl.innerHTML=''; return; }
    try {
      var keys=(typeof FLEET_CONFIG!=='undefined'&&FLEET_CONFIG.GEOAPIFY_API_KEYS)||[];
      var key=keys[0]; if(!key){acEl.innerHTML='';return;}
      var r=await fetch('https://api.geoapify.com/v1/geocode/autocomplete?text='+encodeURIComponent(query)+'&lang=fr&country=dz&limit=5&apiKey='+key);
      if(!r.ok){acEl.innerHTML='';return;}
      var d=await r.json();
      var feats=d.features||[];
      if(!feats.length){acEl.innerHTML='';return;}
      var html='<div class="nv5-autocomplete">';
      feats.forEach(function(f,i){
        var p=f.properties||{};
        var label=p.formatted||p.name||'';
        var lat=p.lat; var lng=p.lon;
        html+='<div class="nv5-ac-item" onclick="ui.naftalSelectDestination(\''+tid+'\',{name:\''+label.replace(/'/g,"\\'").replace(/"/g,'\\"')+'\',lat:'+lat+',lng:'+lng+',target:\''+(target||'main')+'\'})">'+label+'</div>';
      });
      html+='</div>';
      acEl.innerHTML=html;
    } catch(_){acEl.innerHTML='';}
  }

  _naftalDestInput(tid, type, idx) {
    // Focus handler for stop inputs
    var target = type==='stop'?'stop'+idx:'main';
    var inpId = type==='stop'?'stop_inp_'+tid+'_'+idx:'dest_inp_'+tid;
    var inp = document.getElementById(inpId);
    if (!inp) return;
    inp.addEventListener('input', function() {
      clearTimeout(ui._acT);
      ui._acT = setTimeout(function(){ui.naftalSearchDestination(tid, inp.value, target);},300);
    });
  }


  async naftalSetRoundTrip(tid, checked) {
    var draft = (this.naftalDeclarationDraft||[]).find(function(d){return String(d.deviceId)===String(tid);});
    if (!draft) return;
    draft.isRoundTrip = !!checked;
    // Recalculate if destination already set
    if (draft.destination && draft.destinationLat) {
      var price=(typeof FLEET_CONFIG!=='undefined'&&FLEET_CONFIG.NAFTAL_MANAGEMENT&&FLEET_CONFIG.NAFTAL_MANAGEMENT.defaultNaftalPrice)||31;
      var cons=45;
      var routeResult = await this._naftalCalcRoute(draft);
      if (routeResult) {
        draft.estimatedDistanceKm = routeResult.distKm;
        draft.estimatedFuelNeeded = Math.round((routeResult.distKm*cons/100)*10)/10;
        draft.estimatedCostDA = Math.round(draft.estimatedFuelNeeded*price);
      } else if (draft.estimatedDistanceKm) {
        // Simple double/halve toggle without API
        draft.estimatedDistanceKm = checked ? draft.estimatedDistanceKm * 2 : Math.round(draft.estimatedDistanceKm / 2);
        draft.estimatedFuelNeeded = Math.round(draft.estimatedDistanceKm*cons/100*10)/10;
        draft.estimatedCostDA = Math.round(draft.estimatedFuelNeeded*price);
      }
      // Update estimate strip
      var estEl = document.getElementById('nest_'+tid);
      if (estEl && draft.estimatedDistanceKm) {
        var rtBadge = draft.isRoundTrip ? '<span style="background:#fef3c7;color:#92400e;border-radius:4px;padding:1px 5px;font-size:9px;font-weight:700;">↩ A/R</span> ' : '';
        estEl.innerHTML = rtBadge +
          '<span style="color:#64748b;font-size:11px;"><i class="fa-solid fa-route" style="color:#0284c7;"></i> '+draft.estimatedDistanceKm+' km</span>'+
          '<span style="color:#64748b;font-size:11px;"><i class="fa-solid fa-gas-pump" style="color:#f59e0b;"></i> '+Math.round(draft.estimatedFuelNeeded)+' L</span>'+
          '<span style="color:#0284c7;font-size:13px;font-weight:800;">'+Math.round(draft.estimatedCostDA).toLocaleString('fr-DZ')+' DA</span>';
      }
      this.naftalOpenDestinationModal();
    }
  }

  async naftalSelectDestination(tid, data) {
    var draft = (this.naftalDeclarationDraft||[]).find(function(d){return String(d.deviceId)===String(tid);});
    if (!draft) return;
    var acId = 'nac_'+tid+'_'+(data.target||'main');
    var acEl = document.getElementById(acId);
    if (acEl) acEl.innerHTML='';

    if (!data.target||data.target==='main') {
      draft.destination = data.name;
      draft.destinationLat = data.lat;
      draft.destinationLng = data.lng;
      var inp = document.getElementById('dest_inp_'+tid);
      if (inp) inp.value = data.name;
    } else if (data.target.startsWith('stop')) {
      var sidx = parseInt(data.target.replace('stop',''));
      if (!draft.extraStops) draft.extraStops=[];
      if (draft.extraStops[sidx]) {
        draft.extraStops[sidx].name=data.name;
        draft.extraStops[sidx].lat=data.lat;
        draft.extraStops[sidx].lng=data.lng;
      }
      var stopInp = document.getElementById('stop_inp_'+tid+'_'+sidx);
      if (stopInp) stopInp.value=data.name;
    }

    // Calc route via Geoapify
    var routeResult = await this._naftalCalcRoute(draft);
    var price=(typeof FLEET_CONFIG!=='undefined'&&FLEET_CONFIG.NAFTAL_MANAGEMENT&&FLEET_CONFIG.NAFTAL_MANAGEMENT.defaultNaftalPrice)||31;
    var cons=45; // L/100km default
    if (routeResult) {
      draft.estimatedDistanceKm = routeResult.distKm;
      draft.estimatedFuelNeeded = Math.round((routeResult.distKm*cons/100)*10)/10;
      draft.estimatedCostDA = Math.round(draft.estimatedFuelNeeded*price);
    } else if (draft.destination && draft.currentLat && draft.destinationLat) {
      // Fallback: haversine with road factor
      var roadFactor = (typeof FLEET_CONFIG!=='undefined'&&FLEET_CONFIG.NAFTAL_MANAGEMENT&&FLEET_CONFIG.NAFTAL_MANAGEMENT.roadDistanceFactor)||1.25;
      var dLat=(draft.destinationLat-draft.currentLat)*Math.PI/180;
      var dLng=(draft.destinationLng-draft.currentLng)*Math.PI/180;
      var a=Math.sin(dLat/2)**2+Math.cos(draft.currentLat*Math.PI/180)*Math.cos(draft.destinationLat*Math.PI/180)*Math.sin(dLng/2)**2;
      var km=Math.round(6371*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a))*roadFactor);
      // Round-trip: double
      if (draft.isRoundTrip) km = km * 2;
      draft.estimatedDistanceKm=km;
      draft.estimatedFuelNeeded=Math.round(km*cons/100*10)/10;
      draft.estimatedCostDA=Math.round(draft.estimatedFuelNeeded*price);
    }

    // Update estimate strip
    var estEl=document.getElementById('nest_'+tid);
    if (estEl&&draft.estimatedDistanceKm) {
      var rtBadge = draft.isRoundTrip ? '<span style="background:#fef3c7;color:#92400e;border-radius:4px;padding:1px 5px;font-size:9px;font-weight:700;">↩ A/R</span> ' : '';
      estEl.innerHTML=
        rtBadge+
        '<span style="color:#64748b;font-size:11px;"><i class="fa-solid fa-route" style="color:#0284c7;"></i> '+draft.estimatedDistanceKm+' km</span>'+
        '<span style="color:#64748b;font-size:11px;"><i class="fa-solid fa-gas-pump" style="color:#f59e0b;"></i> '+Math.round(draft.estimatedFuelNeeded)+' L</span>'+
        '<span style="color:#0284c7;font-size:13px;font-weight:800;">'+Math.round(draft.estimatedCostDA).toLocaleString('fr-DZ')+' DA</span>';
    }
    // Update total
    this.naftalOpenDestinationModal();
  }

  async naftalValidateTransport() {
    var draft = this.naftalDeclarationDraft || [];
    if (!draft.length) { await ui_showAlert('Aucun camion sélectionné.','Erreur','⚠️'); return; }
    var allHaveDest = draft.every(function(e){return e.destination&&e.destination.trim();});
    if (!allHaveDest) { await ui_showAlert('Veuillez définir une destination pour chaque camion.','Destination manquante','📍'); return; }
    var totalDA = draft.reduce(function(s,e){return s+(e.estimatedCostDA||0);},0);
    var ok = await ui_showConfirm(
      'Soumettre '+draft.length+' camion(s) pour ravitaillement?\nTotal estimé: '+Math.round(totalDA).toLocaleString('fr-DZ')+' DA',
      'Confirmer la Déclaration','🚛','Soumettre'
    );
    if (!ok) return;
    try {
      var r = await fetch('/api/naftal/declarations', {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({
          trucks: draft.map(function(e){
            return {
              deviceId: e.deviceId,
              truckName: e.truckName,
              carteNaftal: e.carteNaftal,
              immatriculation: e.immatriculation,
              driverName: e.driverName || '',
              driverPhone: e.driverPhone || '',
              trailer: e.trailer || '',
              currentLocation: e.currentLocation,
              currentLat: e.currentLat,
              currentLng: e.currentLng,
              currentFuelLiters: e.currentFuelLiters,
              currentFuelPercent: e.currentFuelPercent,
              destination: e.destination,
              destinationLat: e.destinationLat,
              destinationLng: e.destinationLng,
              estimatedDistanceKm: e.estimatedDistanceKm,
              estimatedFuelNeeded: e.estimatedFuelNeeded,
              estimatedCostDA: e.estimatedCostDA,
              extraStops: e.extraStops||[],
              notes: e.notes||''
            };
          }),
          totalDistanceKm: draft.reduce(function(s,e){return s+(e.estimatedDistanceKm||0);},0)
        })
      });
      if (!r.ok) { var err=await r.json(); await ui_showAlert(err.error||'Erreur serveur','Erreur','❌'); return; }
      await ui_showAlert('Déclaration soumise avec succès! Le gestionnaire va valider les montants.','Déclaration Envoyée','✅');
      this.naftalSelectedTrucks = new Set();
      this.naftalDeclarationDraft = [];
      this._naftalTransportTab('myrequests');
    } catch(e) {
      await ui_showAlert('Erreur: '+e.message,'Erreur','❌');
    }
  }

  // ── TRANSPORT: MES DEMANDES ────────────────────────────────────────────────

  async _naftalRenderMyRequests(content) {
    if (!content) content = document.getElementById('nv5TransportContent');
    if (!content) return;
    content.innerHTML = '<div style="text-align:center;padding:30px;color:#64748b;">Chargement...</div>';
    try {
      var r = await fetch('/api/naftal/declarations?limit=100');
      if (!r.ok) throw new Error('HTTP '+r.status);
      var decls = await r.json();
      this._naftalRenderMyRequestsList(content, decls);
    } catch(e) {
      content.innerHTML = '<div style="color:#ef4444;padding:20px;">Erreur: '+e.message+'</div>';
    }
  }

  _naftalRenderMyRequestsList(content, decls) {
    var filters = this._naftalMyReqFilters || {};
    var self = this;
    var html =
      '<div class="nv5-filters">' +
        '<select class="nv5-sel" id="mrf_status" onchange="ui._naftalMyReqFilters={status:this.value};ui._naftalFilterMyReq()">' +
          '<option value="">Tous les statuts</option>' +
          '<option value="transport_validated">Att. gestionnaire</option>' +
          '<option value="gestionnaire_validated">Approuvés</option>' +
          '<option value="in_progress">En cours</option>' +
          '<option value="completed">Terminés</option>' +
          '<option value="cancelled">Annulés</option>' +
        '</select>' +
        '<input type="text" class="nv5-sel" id="mrf_truck" placeholder="Camion..." style="width:120px;">' +
        '<button onclick="ui._naftalFilterMyReq()" class="nv5-btn nv5-btn-primary" style="padding:7px 14px;">Filtrer</button>' +
        '<button onclick="ui._naftalRenderMyRequests()" class="nv5-btn nv5-btn-ghost" style="padding:7px 14px;"><i class="fa-solid fa-rotate"></i></button>' +
      '</div>' +
      '<div id="mrl_list"></div>';
    content.innerHTML = html;
    this._naftalMyDeclData = decls;
    this._naftalRenderMyDeclList(decls);
  }

  _naftalFilterMyReq() {
    var statusEl = document.getElementById('mrf_status');
    var truckEl = document.getElementById('mrf_truck');
    var status = statusEl ? statusEl.value : '';
    var truck = truckEl ? truckEl.value.toLowerCase() : '';
    var decls = this._naftalMyDeclData || [];
    var filtered = decls.filter(function(d) {
      if (status && d.status !== status) return false;
      if (truck && !(d.trucks||[]).some(function(t){return (t.truckName||'').toLowerCase().includes(truck);})) return false;
      return true;
    });
    this._naftalRenderMyDeclList(filtered);
  }

  _naftalRenderMyDeclList(decls) {
    var list = document.getElementById('mrl_list');
    if (!list) return;
    if (!decls.length) {
      list.innerHTML = '<div style="text-align:center;padding:40px;color:#64748b;"><i class="fa-solid fa-inbox" style="font-size:32px;opacity:0.3;"></i><br><br>Aucune déclaration</div>';
      return;
    }
    var self = this;
    var html = '';
    decls.forEach(function(d) {
      var accentColor = d.status==='transport_validated'?'#f59e0b':d.status==='gestionnaire_validated'?'#16a34a':d.status==='in_progress'?'#0284c7':d.status==='completed'?'#6d28d9':'#dc2626';
      var totalDA = (d.trucks||[]).reduce(function(s,t){return s+(t.approvedAmountDA||t.estimatedCostDA||0);},0);
      var hasPendingMod = d.modificationRequest && d.modificationRequest.status === 'pending';
      var modType = hasPendingMod ? (d.modificationRequest.reqType||'') : '';
      var modLabels = {delete:'Annulation déclaration',remove_truck:'Retrait camion',restore_truck:'Restauration camion',modify_route:'Modification itinéraire'};

      html += '<div class="nv5-card" style="border-left:4px solid '+accentColor+';margin-bottom:12px;">' +
        '<div class="nv5-card-head">' +
          '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">' +
            '<span style="background:#dbeafe;color:#1d4ed8;padding:2px 8px;border-radius:4px;font-size:10px;font-weight:700;font-family:monospace;">'+(d.declarationId||'')+'</span>' +
            '<span style="color:#64748b;font-size:11px;">'+(self._naftalFormatDate(d.createdAt))+'</span>' +
            self._naftalFormatStatus(d.status) +
            (hasPendingMod ? '<span style="background:#fef3c7;color:#92400e;font-size:10px;font-weight:700;padding:2px 8px;border-radius:20px;border:1px solid #fcd34d;">⏳ '+(modLabels[modType]||'Demande modif.')+'</span>' : '') +
            (d.isSignaled ? '<span style="background:#fee2e2;color:#ef4444;font-size:10px;font-weight:700;padding:2px 8px;border-radius:20px;"><i class=\"fa-solid fa-flag\"></i> Signalé</span>' : '') +
          '</div>' +
          '<div style="display:flex;gap:8px;align-items:center;">' +
            '<span style="color:#64748b;font-size:11px;"><i class=\"fa-solid fa-truck\" style=\"margin-right:3px;\"></i>'+(d.trucks||[]).filter(function(t){return !t.isRemoved;}).length+' camion(s)</span>' +
            (totalDA ? '<span style="color:#0284c7;font-weight:800;font-size:13px;">'+Math.round(totalDA).toLocaleString('fr-DZ')+' DA</span>' : '') +
          '</div>' +
        '</div>' +
        '<div class="nv5-card-body" style="padding:8px 14px;">';

      (d.trucks||[]).forEach(function(t, ti) {
        var fp = t.currentFuelPercent||0;
        var fc = fp<=5?'#ef4444':fp<=20?'#f59e0b':'#16a34a';
        var da = t.approvedAmountDA||t.estimatedCostDA||0;
        var stops = (t.extraStops||[]).filter(function(s){return s.name;});
        var itin = stops.map(function(s){return s.name;}).join(' → ');
        if (t.destination) itin = (itin ? itin+' → ' : '') + t.destination;
        var truckCount = (d.trucks||[]).length;

        var refBadge = '';
        if (t.isRemoved) {
          refBadge = '<span style="background:#f3f4f6;color:#9ca3af;font-size:10px;padding:1px 7px;border-radius:20px;font-weight:700;">🚫 Retiré</span>';
        } else if (t.refillStatus==='completed') {
          refBadge = '<span style="background:#dcfce7;color:#16a34a;font-size:10px;padding:1px 7px;border-radius:20px;font-weight:700;">✓ Ravitaillé</span>';
        } else if (t.refillStatus==='flagged') {
          refBadge = '<span style="background:#fee2e2;color:#ef4444;font-size:10px;padding:1px 7px;border-radius:20px;font-weight:700;">⚑ Anomalie</span>';
        } else if (t.refillStatus==='in_progress') {
          refBadge = '<span style="background:#dbeafe;color:#2563eb;font-size:10px;padding:1px 7px;border-radius:20px;font-weight:700;">⟳ En cours</span>';
        }

        html += '<div style="border:1.5px solid #e2e8f0;border-left:3px solid '+fc+';border-radius:8px;padding:9px 12px;margin-bottom:'+(ti<truckCount-1?'8':'2')+'px;background:'+(t.isRemoved?'#fafafa':'#fff')+';'+(t.isRemoved?'opacity:0.55;':'')+';">' +
          '<div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:6px;">' +
            '<div style="display:flex;align-items:center;gap:8px;">' +
              '<i class=\"fa-solid fa-truck\" style=\"color:'+fc+';font-size:13px;\"></i>' +
              '<div>' +
                '<span style="font-weight:700;color:'+(t.isRemoved?'#94a3b8':'#1e293b')+';font-size:12px;'+(t.isRemoved?'text-decoration:line-through;':'')+'">'+( t.truckName||t.deviceId||'—')+'</span>' +
                (t.carteNaftal ? '<span style="font-size:10px;color:#0369a1;font-family:monospace;font-weight:700;margin-left:6px;">'+t.carteNaftal+'</span>' : '') +
              '</div>' +
              refBadge +
            '</div>' +
            '<div style="display:flex;align-items:center;gap:10px;">' +
              '<span style="font-weight:700;color:'+fc+';font-size:12px;">'+fp+'% · '+(t.currentFuelLiters||0)+'L</span>' +
              (da ? '<span style="font-weight:700;color:#0284c7;font-size:12px;border-left:1px solid #e2e8f0;padding-left:10px;">'+Math.round(da).toLocaleString('fr-DZ')+' DA</span>' : '') +
            '</div>' +
          '</div>' +
          (itin ? '<div style="margin-top:6px;padding-top:5px;border-top:1px dashed #f1f5f9;font-size:11px;color:#64748b;display:flex;align-items:flex-start;gap:5px;">' +
            '<i class=\"fa-solid fa-route\" style=\"color:#0284c7;font-size:10px;margin-top:1px;flex-shrink:0;\"></i>' +
            '<span>'+(t.currentLocation?'<span style=\"color:#94a3b8;\">'+t.currentLocation+'</span> → ':'')+itin+'</span>' +
          '</div>' : '') +
          (t.estimatedDistanceKm ? '<div style="font-size:10px;color:#94a3b8;margin-top:3px;padding-left:17px;">'+t.estimatedDistanceKm+' km · '+Math.round(t.estimatedFuelNeeded||0)+' L estimés</div>' : '') +
        '</div>';
      });

      html += '</div>';  // card-body
      html += '<div style="padding:8px 14px 12px;display:flex;gap:8px;flex-wrap:wrap;align-items:center;">';
      if (d.status === 'transport_validated') {
        html += '<button onclick="ui.naftalDeleteDeclaration(\''+d.declarationId+'\',false)" class="nv5-btn" style="background:#fee2e2;color:#dc2626;border:1.5px solid #fca5a5;font-size:11px;padding:6px 12px;">' +
          '<i class=\"fa-solid fa-trash\"></i> Annuler la demande</button>';
      } else if (['gestionnaire_validated','in_progress','completed'].includes(d.status) && !hasPendingMod) {
        html += '<button onclick="ui._naftalHandleModification(\''+d.declarationId+'\',\''+d.status+'\')" class="nv5-btn nv5-btn-ghost" style="font-size:11px;padding:6px 14px;">' +
          '<i class=\"fa-solid fa-pen-to-square\"></i> Modifier / Annuler</button>';
      }
      if (hasPendingMod) {
        html += '<span style="font-size:11px;color:#92400e;"><i class=\"fa-solid fa-clock\"></i> En attente de réponse du gestionnaire…</span>';
      }
      html += '</div></div>';
    });
    list.innerHTML = html;
  }

  async _naftalHandleModification(declId, status) {
    // Build a proper interactive options modal (ui_showAlert escapes HTML — can't use it here)
    var opts = [
      { id:'delete',          icon:'🗑️', label:'Annuler la déclaration',          desc:'Elle sera marquée annulée et apparaîtra dans l\'historique.', color:'#ef4444' },
      { id:'modify_route',    icon:'🗺️', label:"Modifier l'itinéraire",           desc:'Le gestionnaire sera notifié pour approbation.',             color:'#0284c7' },
      { id:'increase_amount', icon:'💰', label:'Demander + de montant',             desc:'Envoyer une demande d\'augmentation au gestionnaire.',       color:'#16a34a' },
      { id:'other',           icon:'📝', label:'Autre demande',                     desc:'Message libre au gestionnaire.',                              color:'#6d28d9' }
    ];
    return new Promise(function(resolve) {
      var oid = 'nv5mod_' + Date.now();
      var overlay = document.createElement('div');
      overlay.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;padding:16px;';
      var inner = '<div style="background:#fff;border-radius:16px;padding:24px;max-width:440px;width:100%;box-shadow:0 20px 60px rgba(0,0,0,0.25);">' +
        '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;">' +
          '<h3 style="margin:0;color:#1e293b;font-size:16px;font-weight:800;">⚙️ Que souhaitez-vous faire?</h3>' +
          '<button id="'+oid+'_x" style="background:none;border:none;font-size:20px;cursor:pointer;color:#94a3b8;line-height:1;">×</button>' +
        '</div>';
      opts.forEach(function(opt) {
        inner += '<div id="'+oid+'_'+opt.id+'" style="display:flex;align-items:flex-start;gap:12px;padding:12px 14px;border:1.5px solid #e2e8f0;border-radius:10px;margin-bottom:8px;cursor:pointer;background:#fff;transition:border-color 0.15s;">' +
          '<span style="font-size:22px;flex-shrink:0;">'+opt.icon+'</span>' +
          '<div><div style="font-weight:700;color:#1e293b;font-size:13px;">'+opt.label+'</div>' +
          '<div style="font-size:11px;color:#64748b;margin-top:2px;">'+opt.desc+'</div></div>' +
        '</div>';
      });
      inner += '</div>';
      overlay.innerHTML = inner;
      document.body.appendChild(overlay);
      var cleanup = function() { try { overlay.remove(); } catch(e){} resolve(); };
      document.getElementById(oid+'_x').onclick = cleanup;
      overlay.onclick = function(e) { if (e.target === overlay) cleanup(); };
      opts.forEach(function(opt) {
        var el = document.getElementById(oid+'_'+opt.id);
        if (!el) return;
        el.onmouseenter = function() { el.style.borderColor = opt.color; el.style.background = '#f8fafc'; };
        el.onmouseleave = function() { el.style.borderColor = '#e2e8f0'; el.style.background = '#fff'; };
        el.onclick = function() {
          overlay.remove();
          resolve();
          ui._naftalPickModOpt(declId, opt.id);
        };
      });
    });
  }

  async _naftalPickModOpt(declId, optType) {
    // All modification types require a mandatory observation from transport
    var promptLabels = {
      delete: 'Expliquez pourquoi vous souhaitez annuler (obligatoire):',
      modify_route: "Expliquez le changement d'itin\u00e9raire souhait\u00e9 (obligatoire):",
      increase_amount: 'Montant souhaité et justification (obligatoire):',
      other: 'Votre message au gestionnaire (obligatoire):'
    };
    var detail = await ui_showPrompt(promptLabels[optType] || 'Observation (obligatoire):', '', 'Observation Transport');
    if (!detail || !detail.trim()) {
      await ui_showAlert('Une observation est obligatoire pour toute demande de modification.', 'Observation requise', '⚠️');
      return;
    }
    try {
      var r = await fetch('/api/naftal/declarations/'+declId+'/modification-request', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ reqType: optType, detail: detail.trim() })
      });
      if (!r.ok) { var e=await r.json(); await ui_showAlert(e.error||'Erreur','Erreur','❌'); return; }
      var typeLabels = {delete:'annulation',modify_route:"modification d'itinéraire",increase_amount:'augmentation de montant',other:'demande'};
      await ui_showAlert(
        '\u2705 Demande de '+(typeLabels[optType]||'modification')+' envoy\u00e9e au gestionnaire.\n\nVotre observation: "'+detail.trim()+'"',
        'Demande Envoy\u00e9e','\u2705'
      );
      this._naftalRenderMyRequests();
    } catch(e){await ui_showAlert('Erreur: '+e.message,'Erreur','❌');}
  }

  async _naftalRequestDeletion(declId) {
    var obs = await ui_showPrompt(
      'Expliquez pourquoi vous souhaitez annuler cette demande EN COURS.\nLe gestionnaire devra approuver cette annulation.',
      '',
      '📩 Demande d\'annulation au gestionnaire'
    );
    if (obs === null) return; // user cancelled prompt
    if (!obs || !obs.trim()) {
      await ui_showAlert('Une observation est obligatoire pour demander l\'annulation.', 'Observation requise', '⚠️');
      return;
    }
    try {
      var r = await fetch('/api/naftal/declarations/' + declId + '/modification-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reqType: 'delete', detail: obs.trim() })
      });
      var d = await r.json();
      if (r.ok && (d.ok || d.success)) {
        await ui_showAlert(
          '✅ Demande d\'annulation envoyée au gestionnaire.\nVous serez informé de sa décision dans Mes Demandes.',
          'Demande envoyée', '📩'
        );
        this._naftalTransportTab('myrequests');
      } else {
        await ui_showAlert(d.error || 'Erreur lors de l\'envoi.', 'Erreur', '❌');
      }
    } catch(e) {
      await ui_showAlert('Erreur réseau: ' + e.message, 'Erreur', '❌');
    }
  }

  async _naftalRequestTruckRemoval(declId, deviceId, truckName) {
    var obs = await ui_showPrompt(
      'Expliquez pourquoi vous souhaitez retirer ' + truckName + ' de la déclaration.\n' +
      'Les autres camions resteront dans la déclaration.\nLe gestionnaire devra approuver ce retrait.',
      '',
      '📩 Demande de retrait — ' + truckName
    );
    if (obs === null) return;
    if (!obs || !obs.trim()) {
      await ui_showAlert('Une observation est obligatoire.', 'Observation requise', '⚠️');
      return;
    }
    try {
      var r = await fetch('/api/naftal/declarations/' + declId + '/modification-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reqType: 'remove_truck', deviceId: deviceId, truckName: truckName, detail: obs.trim() })
      });
      var d = await r.json();
      if (r.ok && (d.ok || d.success)) {
        await ui_showAlert(
          '✅ Demande de retrait de ' + truckName + ' envoyée au gestionnaire.\nLes autres camions ne sont pas affectés.',
          'Demande envoyée', '📩'
        );
        this._naftalTransportTab('myrequests');
      } else {
        await ui_showAlert(d.error || 'Erreur lors de l\'envoi.', 'Erreur', '❌');
      }
    } catch(e) {
      await ui_showAlert('Erreur réseau: ' + e.message, 'Erreur', '❌');
    }
  }

  async _naftalRequestTruckRestore(declId, deviceId, truckName) {
    var obs = await ui_showPrompt(
      'Expliquez pourquoi vous souhaitez restaurer ' + truckName + ' dans la déclaration.\n' +
      'Le gestionnaire devra approuver cette restauration.',
      '',
      '🔄 Demande de restauration — ' + truckName
    );
    if (obs === null) return;
    if (!obs || !obs.trim()) {
      await ui_showAlert('Une observation est obligatoire.', 'Observation requise', '⚠️');
      return;
    }
    try {
      var r = await fetch('/api/naftal/declarations/' + declId + '/modification-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reqType: 'restore_truck', deviceId: deviceId, truckName: truckName, detail: obs.trim() })
      });
      var d = await r.json();
      if (r.ok && (d.ok || d.success)) {
        await ui_showAlert(
          '✅ Demande de restauration de ' + truckName + ' envoyée au gestionnaire.\nVous serez informé de sa décision dans Mes Demandes.',
          'Demande envoyée', '🔄'
        );
        this._naftalTransportTab('myrequests');
      } else {
        await ui_showAlert(d.error || 'Erreur lors de l\'envoi.', 'Erreur', '❌');
      }
    } catch(e) {
      await ui_showAlert('Erreur réseau: ' + e.message, 'Erreur', '❌');
    }
  }

  async naftalDeleteDeclaration(declId, requireConfirm) {
    if (requireConfirm !== false) {
      var ok = await ui_showConfirm('Annuler cette déclaration?','Confirmation','🗑️','Annuler');
      if (!ok) return;
    }
    try {
      var r = await fetch('/api/naftal/declarations/'+declId,{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({reason:'Annulé par transport'})});
      if (!r.ok) {var e=await r.json();await ui_showAlert(e.error||'Erreur','Erreur','❌');return;}
      this._naftalRenderMyRequests();
    } catch(e){await ui_showAlert('Erreur: '+e.message);}
  }

  async naftalReopenDeclaration(declId) {
    try {
      var r = await fetch('/api/naftal/declarations/'+declId+'/reopen',{method:'PATCH'});
      if (!r.ok) throw new Error('Erreur');
      await ui_showAlert('Déclaration ré-ouverte.','OK','✅');
    } catch(e){await ui_showAlert('Erreur: '+e.message);}
  }

  // ── GESTIONNAIRE ──────────────────────────────────────────────────────────

  renderNaftalGestionnaire(body) {
    if (!body) return;
    if (!this.naftalCheckAuth('gestionnaire')) {
      fetch('/api/naftal/auth', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({section:'gestionnaire',password:''})})
        .then(function(r){return r.json();})
        .then((d) => {
          if (d.success) {
            this.naftalGestionnaireAuth = true;
            sessionStorage.setItem('nv5_auth_gestionnaire','1');
            this.renderNaftalGestionnaire(body);
          } else {
            body.innerHTML = this.naftalRenderAuthGate('gestionnaire');
          }
        })
        .catch(() => { body.innerHTML = this.naftalRenderAuthGate('gestionnaire'); });
      return;
    }
    this._naftalGestTab(this.naftalGestTab || 'pending');
  }

  _naftalGestTab(tab) {
    this.naftalGestTab = tab;
    this._naftalStopLiveRefresh();
    var body = document.getElementById('nv5Body');
    if (!body) return;
    body.innerHTML =
      '<div class="nv5-subtabs">' +
        '<button onclick="ui._naftalGestTab(\'pending\')" style="padding:8px 18px;border-radius:20px;border:none;cursor:pointer;font-size:12px;font-weight:700;transition:all 0.15s;background:'+(tab==='pending'?'#d97706':'#fffbeb')+';color:'+(tab==='pending'?'#fff':'#d97706')+';box-shadow:'+(tab==='pending'?'0 2px 8px rgba(217,119,6,0.3)':'none')+'">' +
          '<i class="fa-solid fa-hourglass-half"></i> En attente</button>' +
        '<button onclick="ui._naftalGestTab(\'history\')" style="padding:8px 18px;border-radius:20px;border:none;cursor:pointer;font-size:12px;font-weight:700;transition:all 0.15s;background:'+(tab==='history'?'#7c3aed':'#fdf4ff')+';color:'+(tab==='history'?'#fff':'#7c3aed')+';box-shadow:'+(tab==='history'?'0 2px 8px rgba(124,58,237,0.3)':'none')+'">' +
          '<i class="fa-solid fa-table-list"></i> Historique complet</button>' +
      '</div>' +
      '<div id="nv5GestContent"></div>';
    var content = document.getElementById('nv5GestContent');
    if (tab === 'pending') this._naftalGestRenderPending(content);
    else this._naftalGestRenderHistory(content);
  }

  async _naftalGestRenderPending(content) {
    if (!content) content = document.getElementById('nv5GestContent');
    if (!content) return;
    content.innerHTML = '<div style="text-align:center;padding:30px;color:#64748b;">Chargement...</div>';
    try {
      var r = await fetch('/api/naftal/declarations?status=transport_validated&limit=100');
      var pending = r.ok ? await r.json() : [];
      var rA = await fetch('/api/naftal/declarations?status=gestionnaire_validated&limit=200');
      var approved = rA.ok ? await rA.json() : [];
      // Also fetch active declarations (in_progress) that have pending mod requests
      var rM = await fetch('/api/naftal/declarations?status=in_progress,gestionnaire_validated&modReqStatus=pending&limit=100');
      var withModReq = rM.ok ? await rM.json() : [];
      // Merge withModReq into pending (avoid duplicates)
      var pendingIds = new Set(pending.map(function(d){return d.declarationId;}));
      withModReq.forEach(function(d){
        if (!pendingIds.has(d.declarationId)) {
          pending.push(d);
          pendingIds.add(d.declarationId);
        }
      });
      var today = new Date(); today.setHours(0,0,0,0);
      var todayApp = approved.filter(function(d){return new Date(d.validatedByGestionnaire||d.createdAt)>=today;});
      var wkAgo = new Date(Date.now()-7*24*3600*1000);
      var wkDA = approved.filter(function(d){return new Date(d.createdAt)>=wkAgo;}).reduce(function(s,d){
        return s+(d.trucks||[]).reduce(function(ss,t){return ss+(t.approvedAmountDA||0);},0);
      },0);
      var signaled = pending.filter(function(d){return d.isSignaled;}).length;
      var pendingModCount = pending.filter(function(d){return d.modificationRequest && d.modificationRequest.status==='pending';}).length;

      var html =
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;flex-wrap:wrap;gap:8px;">' +
          '<h3 style="margin:0;color:#1e293b;font-size:15px;"><i class="fa-solid fa-user-tie" style="color:#8b5cf6;"></i> Gestionnaire Gasoil</h3>' +
          '<button onclick="ui._naftalGestRenderPending()" class="nv5-btn nv5-btn-ghost" style="padding:7px 14px;font-size:11px;"><i class="fa-solid fa-rotate"></i> Actualiser</button>' +
        '</div>' +
        '<div class="nv5-kpi">' +
          '<div class="nv5-kpi-card" style="background:linear-gradient(135deg,#fffbeb,#fef3c7);border-color:#fcd34d;">' +
            '<div style="font-size:28px;font-weight:900;color:#d97706;">'+pending.length+'</div>' +
            '<div style="font-size:11px;color:#92400e;font-weight:600;margin-top:3px;">En attente</div></div>' +
          '<div class="nv5-kpi-card" style="background:linear-gradient(135deg,#f0fdf4,#dcfce7);border-color:#86efac;">' +
            '<div style="font-size:28px;font-weight:900;color:#16a34a;">'+todayApp.length+'</div>' +
            '<div style="font-size:11px;color:#166534;font-weight:600;margin-top:3px;">Approuvés auj.</div></div>' +
          '<div class="nv5-kpi-card" style="background:linear-gradient(135deg,#f0f9ff,#e0f2fe);border-color:#7dd3fc;">' +
            '<div style="font-size:18px;font-weight:900;color:#0284c7;">'+wkDA.toLocaleString('fr-DZ')+'</div>' +
            '<div style="font-size:11px;color:#075985;font-weight:600;margin-top:3px;">DA cette sem.</div></div>' +
          '<div class="nv5-kpi-card" style="background:linear-gradient(135deg,#fff1f2,#ffe4e6);border-color:#fca5a5;">' +
            '<div style="font-size:28px;font-weight:900;color:#dc2626;">'+signaled+'</div>' +
            '<div style="font-size:11px;color:#991b1b;font-weight:600;margin-top:3px;">Signalés</div></div>' +
          (pendingModCount ? '<div class="nv5-kpi-card" style="background:linear-gradient(135deg,#fff7ed,#ffedd5);border-color:#fdba74;"><div style="font-size:28px;font-weight:900;color:#ea580c;">'+pendingModCount+'</div><div style="font-size:11px;color:#c2410c;font-weight:600;margin-top:3px;">Demandes modif.</div></div>' : '') +
        '</div>';

      if (!pending.length) {
        html += '<div style="text-align:center;padding:40px;color:#64748b;">' +
          '<i class="fa-solid fa-circle-check" style="font-size:36px;color:#10b981;opacity:0.5;"></i><br><br>' +
          'Aucune déclaration en attente</div>';
      } else {
        // Sort: declarations with pending mod requests first
        pending.sort(function(a,b){
          var aHas = (a.modificationRequest&&a.modificationRequest.status==='pending')?0:1;
          var bHas = (b.modificationRequest&&b.modificationRequest.status==='pending')?0:1;
          return aHas - bHas;
        });
        pending.forEach(function(d) {
          html += this._naftalRenderGestCard(d);
        }.bind(this));
      }

      html += '<div id="nv5LiveTs" style="text-align:right;font-size:10px;color:#94a3b8;margin-top:8px;">' +
        '<i class="fa-solid fa-circle-dot" style="color:#22c55e;"></i> Données en temps réel — MàJ: '+new Date().toLocaleTimeString('fr-DZ')+'</div>';

      content.innerHTML = html;
      this._naftalStartLiveRefresh();
    } catch(e) {
      content.innerHTML = '<div style="color:#ef4444;padding:20px;">Erreur: '+e.message+'</div>';
    }
  }

  _naftalRenderGestCard(d) {
    var self = this;
    var hasMod = d.modificationRequest && d.modificationRequest.status === 'pending';
    var minFP = 100;
    (d.trucks||[]).forEach(function(t){if((t.currentFuelPercent||0)<minFP)minFP=t.currentFuelPercent||0;});
    var accentColor = minFP<=5?'#ef4444':minFP<=20?'#f59e0b':'#8b5cf6';
    var totalApproved = (d.trucks||[]).reduce(function(s,t){return s+(t.approvedAmountDA||t.estimatedCostDA||0);},0);

    var html = '<div class="nv5-card" style="border-left:4px solid '+accentColor+';">' +
      '<div class="nv5-card-head">' +
        '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">' +
          '<span style="background:#dbeafe;color:#1d4ed8;padding:2px 8px;border-radius:4px;font-size:10px;font-weight:700;font-family:monospace;">'+(d.declarationId||'')+'</span>' +
          '<span style="color:#64748b;font-size:11px;">'+(this._naftalFormatDate(d.createdAt))+'</span>' +
        '</div>' +
        '<div style="display:flex;align-items:center;gap:8px;">' +
          '<span style="font-size:12px;color:#64748b;">'+(d.trucks||[]).length+' camion(s)</span>' +
          '<span style="font-size:12px;font-weight:700;color:'+accentColor+';">~'+Math.round(totalApproved).toLocaleString('fr-DZ')+' DA</span>' +
          '<button onclick="ui.naftalToggleSignal(\''+d.declarationId+'\')" title="Signaler" ' +
            'style="background:'+(d.isSignaled?'#ef4444':'#f1f5f9')+';color:'+(d.isSignaled?'#fff':'#64748b')+';border:none;border-radius:6px;padding:5px 9px;cursor:pointer;font-size:11px;">' +
            '<i class="fa-solid fa-flag"></i></button>' +
        '</div>' +
      '</div>' +
      '<div class="nv5-card-body">';

    // Modification request banner
    if (hasMod) {
      var modReq = d.modificationRequest || {};
      var reqLabels2 = {delete:'🗑️ Annulation déclaration',remove_truck:'🚫 Retrait camion',restore_truck:'🔄 Restauration camion',modify_route:'🗺️ Modification itinéraire',increase_amount:'💰 Augmentation montant',other:'📝 Autre demande'};
      var reqLabel2 = reqLabels2[modReq.reqType] || modReq.reqType || 'Demande de modification';
      var modAt = modReq.requestedAt ? new Date(modReq.requestedAt).toLocaleString('fr-DZ') : '';
      // Show refill status of all trucks in this declaration
      var truckStatuses = (d.trucks||[]).map(function(t){
        var rs = t.refillStatus||'waiting';
        var rsIcon = rs==='completed'?'<span style="color:#16a34a;">✓ Ravitaillé</span>':rs==='flagged'?'<span style="color:#ef4444;">⚑ Flagged</span>':rs==='in_progress'?'<span style="color:#0284c7;">⟳ En cours</span>':'<span style="color:#94a3b8;">En attente</span>';
        return '<span style="font-weight:700;">'+(t.truckName||t.deviceId)+'</span> '+rsIcon;
      }).join(' &nbsp;·&nbsp; ');
      html += '<div class="nv5-mod-banner">' +
        '<div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:6px;margin-bottom:8px;">' +
          '<div>' +
            '<div style="font-weight:800;color:#92400e;font-size:13px;"><i class="fa-solid fa-triangle-exclamation"></i> '+reqLabel2+'</div>' +
            (modAt?'<div style="font-size:10px;color:#a16207;margin-top:2px;">'+modAt+'</div>':'') +
          '</div>' +
          '<div style="font-size:11px;color:#78350f;">'+truckStatuses+'</div>' +
        '</div>' +
        (modReq.detail?'<div style="background:#fff7ed;border-radius:6px;padding:8px 10px;margin-bottom:8px;font-size:12px;color:#78350f;border-left:3px solid #f59e0b;">💬 <em>"'+(modReq.detail||'')+'"</em></div>':'') +
        '<div style="display:flex;gap:8px;">' +
          '<button onclick="ui.naftalRespondModRequest(\''+d.declarationId+'\',\'accepted\')" class="nv5-btn nv5-btn-success" style="padding:7px 16px;font-size:11px;"><i class="fa-solid fa-check"></i> Accepter</button>' +
          '<button onclick="ui.naftalRespondModRequest(\''+d.declarationId+'\',\'rejected\')" class="nv5-btn nv5-btn-danger" style="padding:7px 16px;font-size:11px;"><i class="fa-solid fa-times"></i> Refuser</button>' +
        '</div></div>';
    }

    // Per-truck rows with live data
    html += '<div style="overflow-x:auto;"><table class="nv5-table"><thead><tr>' +
      '<th>Camion</th><th>Carte</th><th>Position départ</th><th>Itinéraire</th><th>Fuel (live)</th><th>Montant approuvé (DA)</th></tr></thead><tbody>';

    (d.trucks||[]).forEach(function(t, ti) {
      // Get LIVE truck data (current moment, not stored at declaration time)
      var allLiveTrucks = (typeof app!=='undefined'?app.getAllTrucks():[]) || [];
      var liveTruck = allLiveTrucks.find(function(lt){return String(lt.id||lt.deviceId)===String(t.deviceId);});
      var fp = liveTruck ? Math.round(liveTruck.fuelPercentage||0) : (t.currentFuelPercent||0);
      var fl = liveTruck ? Math.round(liveTruck.fuelLiters||0) : (t.currentFuelLiters||0);
      var fc = fp<=5?'#ef4444':fp<=20?'#f59e0b':'#16a34a';
      var inputId = 'ga_'+d.declarationId+'_'+ti;
      var litersId = 'gl_'+d.declarationId+'_'+ti;
      var currVal = t.approvedAmountDA || Math.round(t.estimatedCostDA||0);
      var price = (typeof FLEET_CONFIG!=='undefined'&&FLEET_CONFIG.NAFTAL_MANAGEMENT&&FLEET_CONFIG.NAFTAL_MANAGEMENT.defaultNaftalPrice)||31;
      var liters = currVal ? Math.round(currVal/price*10)/10 : 0;
      // LIVE position: use real-time GPS location, not stored at declaration creation
      var liveLoc = liveTruck ? ui._naftalGetTruckLocation(liveTruck) : (t.currentLocation||'—');
      var liveLat = liveTruck && liveTruck.coordinates ? liveTruck.coordinates.lat : t.currentLat;
      var liveLng = liveTruck && liveTruck.coordinates ? liveTruck.coordinates.lng : t.currentLng;

      // Build itinerary string
      var stops = t.extraStops || [];
      var itin = stops.map(function(s,i){return (i+1)+'. '+(s.name||'');}).join(' → ');
      if (t.destination) itin = (itin?itin+' → ':'')+t.destination;

      // Skip removed trucks or show them greyed out
      var rowStyle = t.isRemoved
        ? 'cursor:default;opacity:0.45;background:#f8fafc;'
        : 'cursor:default;';
      html += '<tr id="gtr_'+d.declarationId+'_'+ti+'" style="'+rowStyle+'">' +
        '<td><div style="font-weight:700;color:#1e293b;'+(t.isRemoved?'text-decoration:line-through;color:#94a3b8;':'')+'">'+(t.truckName||'')+'</div>' +
          (t.isRemoved ? '<div style="font-size:9px;color:#ef4444;font-weight:700;">🚫 Retiré'+(t.removedAt?' le '+new Date(t.removedAt).toLocaleDateString('fr-DZ'):'')+' </div>' : '') +
          '<div style="font-size:9px;color:#94a3b8;">'+(t.immatriculation||'')+'</div></td>' +
        '<td style="color:#0369a1;font-weight:700;font-size:11px;">'+(t.carteNaftal||'—')+'</td>' +
        '<td style="font-size:11px;color:#64748b;max-width:130px;">' +
          '<span id="gpos_'+d.declarationId+'_'+ti+'">'+liveLoc+'</span>' +
          (liveLat?'<div id="gpos_geo_'+d.declarationId+'_'+ti+'" style="display:none;"></div>':'') +
        '</td>' +
        '<td style="font-size:11px;color:#475569;max-width:160px;">'+(itin||t.destination||'—')+'</td>' +
        '<td>' +
          '<div style="display:flex;align-items:center;gap:6px;">' +
            '<div class="nv5-fuel-track" style="width:60px;"><div class="nv5-fuel-fill" id="gfuel_'+d.declarationId+'_'+ti+'" style="width:'+fp+'%;background:'+fc+';"></div></div>' +
            '<span id="gfp_'+d.declarationId+'_'+ti+'" style="font-weight:700;color:'+fc+';font-size:12px;">'+fp+'%</span>' +
          '</div>' +
          '<div id="gfl_'+d.declarationId+'_'+ti+'" style="font-size:10px;color:#94a3b8;margin-top:2px;">'+fl+'L</div>' +
        '</td>' +
        '<td style="min-width:170px;">' +
          '<div style="background:#f0f9ff;border:1.5px solid #7dd3fc;border-radius:10px;padding:8px 10px;">' +
            '<div style="font-size:9px;color:#0369a1;font-weight:700;margin-bottom:4px;text-transform:uppercase;letter-spacing:0.5px;">Montant (DA)</div>' +
            '<div style="display:flex;align-items:center;gap:5px;">' +
              '<button onclick="var i=document.getElementById(\''+inputId+'\');i.value=Math.max(0,parseInt(i.value||0)-500);ui._naftalUpdateGestTotal(\''+d.declarationId+'\')" ' +
                'style="background:#fff;border:1.5px solid #7dd3fc;border-radius:7px;width:30px;height:30px;cursor:pointer;font-weight:900;font-size:14px;color:#0284c7;flex-shrink:0;">−</button>' +
              '<input id="'+inputId+'" type="number" value="'+currVal+'" min="0" step="500" ' +
                'oninput="ui._naftalUpdateGestTotal(\''+d.declarationId+'\')" ' +
                'style="flex:1;min-width:0;text-align:center;border:1.5px solid #7dd3fc;border-radius:7px;padding:6px 4px;font-size:14px;font-weight:900;color:#0284c7;background:#fff;">' +
              '<button onclick="var i=document.getElementById(\''+inputId+'\');i.value=parseInt(i.value||0)+500;ui._naftalUpdateGestTotal(\''+d.declarationId+'\')" ' +
                'style="background:#0284c7;border:none;border-radius:7px;width:30px;height:30px;cursor:pointer;font-weight:900;font-size:14px;color:#fff;flex-shrink:0;">+</button>' +
            '</div>' +
            '<div id="'+litersId+'" style="font-size:10px;color:#0369a1;font-weight:600;margin-top:5px;text-align:center;">≈ '+liters+' L</div>' +
          '</div>' +
        '</td>' +
      '</tr>';

      // Trigger geocode for LIVE departure location
      if (liveLat && liveLng) {
        var gposId = 'gpos_'+d.declarationId+'_'+ti;
        (function(gid, la, lo) {
          setTimeout(function() {
            var el = document.getElementById(gid);
            if (!el) return;
            // Always try to geocode for better name
            ui._naftalAsyncGeocode(gid+'_LIVE', la, lo);
            setTimeout(function(){
              var label = ui._geoCache && ui._geoCache[la.toFixed(3)+'_'+lo.toFixed(3)];
              if (label && el) el.textContent = label;
            }, 2500);
          }, 100);
        })(gposId, liveLat, liveLng);
      }
    });

    html += '</tbody></table></div>';

    // Total + actions
    var allEstimated = (d.trucks||[]).reduce(function(s,t){return s+(t.approvedAmountDA||Math.round(t.estimatedCostDA||0));},0);
    html +=
      '<div style="display:flex;align-items:center;justify-content:space-between;margin-top:12px;padding-top:10px;border-top:1px solid #f1f5f9;flex-wrap:wrap;gap:8px;">' +
        '<div style="font-size:13px;color:#64748b;">Total: <strong id="gtotal_'+d.declarationId+'" style="color:#0284c7;">'+Math.round(allEstimated).toLocaleString('fr-DZ')+' DA</strong></div>' +
        '<div style="display:flex;gap:8px;">' +
          '<button onclick="ui.naftalRefuseDeclaration(\''+d.declarationId+'\')" class="nv5-btn" style="background:#fee2e2;color:#dc2626;padding:8px 18px;">' +
            '<i class="fa-solid fa-ban"></i> Refuser</button>' +
          '<button onclick="ui.naftalValidateGestionnaire(\''+d.declarationId+'\')" class="nv5-btn nv5-btn-success" style="padding:8px 24px;">' +
            '<i class="fa-solid fa-check"></i> Approuver</button>' +
        '</div>' +
      '</div></div></div>';

    return html;
  }

  _naftalUpdateGestTotal(declId) {
    var totalEl = document.getElementById('gtotal_'+declId);
    if (!totalEl) return;
    var price=(typeof FLEET_CONFIG!=='undefined'&&FLEET_CONFIG.NAFTAL_MANAGEMENT&&FLEET_CONFIG.NAFTAL_MANAGEMENT.defaultNaftalPrice)||31;
    var total = 0; var i = 0;
    while (true) {
      var inp = document.getElementById('ga_'+declId+'_'+i);
      var lEl = document.getElementById('gl_'+declId+'_'+i);
      if (!inp) break;
      var v = parseInt(inp.value)||0;
      total += v;
      if (lEl) lEl.textContent = '\u2248 '+Math.round(v/price*10)/10+' L';
      i++;
    }
    totalEl.textContent = Math.round(total).toLocaleString('fr-DZ')+' DA';
  }

  _naftalStartLiveRefresh() {
    this._naftalStopLiveRefresh();
    var self = this;
    this._naftalLiveTimer = setInterval(function() { self._naftalUpdateLiveData(); }, 30000);
  }

  _naftalUpdateLiveData() {
    var allT = (typeof app!=='undefined'?app.getAllTrucks():[]) || [];
    var ts = document.getElementById('nv5LiveTs');
    if (ts) ts.innerHTML = '<i class="fa-solid fa-circle-dot" style="color:#22c55e;"></i> Données en temps réel — MàJ: '+new Date().toLocaleTimeString('fr-DZ');
    // Update all gfuel_ and gfp_ elements
    allT.forEach(function(t) {
      var tid = String(t.id||t.deviceId);
      var fp = Math.round(t.fuelPercentage||0);
      var fl = Math.round(t.fuelLiters||0);
      var fc = fp<=5?'#ef4444':fp<=20?'#f59e0b':'#16a34a';
      // Try all possible row indices
      for (var i=0; i<10; i++) {
        // We can't easily match by truck id in the gestionnaire table without more info
        // So we'll just update if we find nloc_ elements for this truck
        var locEl = document.getElementById('nloc_'+tid);
        if (locEl) break; // card still exists
      }
    });
  }

  async naftalValidateGestionnaire(declId) {
    var amounts = [];
    var i = 0;
    while (true) {
      var inp = document.getElementById('ga_'+declId+'_'+i);
      if (!inp) break;
      var val = parseInt(inp.value)||0;
      var price=(typeof FLEET_CONFIG!=='undefined'&&FLEET_CONFIG.NAFTAL_MANAGEMENT&&FLEET_CONFIG.NAFTAL_MANAGEMENT.defaultNaftalPrice)||31;
      amounts.push({ deviceId: 'idx_'+i, approvedAmountDA: val, approvedLiters: Math.round(val/price*10)/10, inputIdx: i });
      i++;
    }
    if (!amounts.length) return;
    // Get actual truck deviceIds from the declaration
    try {
      var dr = await fetch('/api/naftal/declarations?limit=1');
      // Actually fetch the specific declaration
      var allD = await (await fetch('/api/naftal/declarations?limit=500')).json();
      var decl = allD.find(function(d){return d.declarationId===declId;});
      if (!decl) { await ui_showAlert('Déclaration non trouvée','Erreur','❌'); return; }
      var total = amounts.reduce(function(s,a){return s+a.approvedAmountDA;},0);
      var ok = await ui_showConfirm(
        'Approuver la déclaration '+declId+' pour un total de '+Math.round(total).toLocaleString('fr-DZ')+' DA?',
        'Confirmer Approbation','✅','Approuver'
      );
      if (!ok) return;
      var mappedAmounts = decl.trucks.map(function(t, idx) {
        var inp = document.getElementById('ga_'+declId+'_'+idx);
        var price2=(typeof FLEET_CONFIG!=='undefined'&&FLEET_CONFIG.NAFTAL_MANAGEMENT&&FLEET_CONFIG.NAFTAL_MANAGEMENT.defaultNaftalPrice)||31;
        var da = inp ? (parseInt(inp.value)||0) : 0;
        return { deviceId: t.deviceId, approvedAmountDA: da, approvedLiters: Math.round(da/price2*10)/10 };
      });
      var r = await fetch('/api/naftal/declarations/'+declId+'/validate-gestionnaire', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({amounts: mappedAmounts})
      });
      if (!r.ok) { var e=await r.json(); await ui_showAlert(e.error||'Erreur','Erreur','❌'); return; }
      await ui_showAlert('Déclaration approuvée avec succès! Les camions peuvent maintenant se ravitailler.','Approuvé','✅');
      this._naftalGestRenderPending();
    } catch(e) { await ui_showAlert('Erreur: '+e.message,'Erreur','❌'); }
  }

  async naftalRefuseDeclaration(declId) {
    var reason = await ui_showPrompt('Raison du refus:','','Refuser la déclaration');
    if (!reason) return;
    try {
      var r = await fetch('/api/naftal/declarations/'+declId, {
        method:'DELETE', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({reason:'Refusé par gestionnaire: '+reason})
      });
      if (!r.ok) throw new Error('Erreur');
      await ui_showAlert('Déclaration refusée.','Refusé','⊘');
      this._naftalGestRenderPending();
    } catch(e) { await ui_showAlert('Erreur: '+e.message); }
  }

  async naftalToggleSignal(declId) {
    try {
      var r = await fetch('/api/naftal/declarations/'+declId+'/signal', {method:'PATCH'});
      var d = await r.json();
      this._naftalGestRenderPending();
    } catch(e) {}
  }

  async naftalRespondModRequest(declId, action) {
    var note = '';
    if (action === 'accepted') {
      note = await ui_showPrompt('Note / observation (optionnel):','','Accepter la demande');
    } else {
      note = await ui_showPrompt('Raison du refus:','','Refuser la demande');
      if (!note) return;
    }
    try {
      var r = await fetch('/api/naftal/declarations/'+declId+'/modification-response', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({action: action, note: note||''})
      });
      if (!r.ok) throw new Error('Erreur');
      await ui_showAlert(action==='accepted'?'Demande acceptée.':'Demande refusée.','OK','✅');
      this._naftalGestRenderPending();
    } catch(e) { await ui_showAlert('Erreur: '+e.message); }
  }

  // ── GESTIONNAIRE: HISTORIQUE COMPLET ──────────────────────────────────────

  async _naftalGestRenderHistory(content) {
    if (!content) content = document.getElementById('nv5GestContent');
    if (!content) return;
    var self = this;
    var filterHtml =
      '<div class="nv5-filters">' +
        '<select class="nv5-sel" id="ghf_status" onchange="ui._naftalLoadGestHistory()">' +
          '<option value="">Tous statuts</option>' +
          '<option value="transport_validated">Att. gestionnaire</option>' +
          '<option value="gestionnaire_validated">Approuvés</option>' +
          '<option value="in_progress">En cours</option>' +
          '<option value="completed">Terminés</option>' +
          '<option value="cancelled">Annulés</option>' +
        '</select>' +
        '<select class="nv5-sel" id="ghf_signal" onchange="ui._naftalLoadGestHistory()">' +
          '<option value="">Tous</option>' +
          '<option value="true">Signalés</option>' +
          '<option value="false">Non signalés</option>' +
        '</select>' +
        '<select class="nv5-sel" id="ghf_refill" onchange="ui._naftalLoadGestHistory()">' +
          '<option value="">Refill: Tous</option>' +
          '<option value="waiting">En attente</option>' +
          '<option value="completed">OK</option>' +
          '<option value="flagged">Signalé</option>' +
        '</select>' +
        '<input type="text" class="nv5-sel" id="ghf_truck" placeholder="Camion..." style="width:110px;" oninput="clearTimeout(ui._ghT);ui._ghT=setTimeout(function(){ui._naftalLoadGestHistory();},400);">' +
        '<input type="date" class="nv5-sel" id="ghf_from">' +
        '<input type="date" class="nv5-sel" id="ghf_to">' +
        '<button onclick="ui._naftalLoadGestHistory()" class="nv5-btn nv5-btn-primary" style="padding:7px 14px;">Filtrer</button>' +
        '<button onclick="ui.naftalExportCSV()" class="nv5-btn nv5-btn-ghost" style="padding:7px 14px;"><i class="fa-solid fa-file-excel"></i> Excel</button>' +
      '</div>' +
      '<div id="nv5GestHistTable">Chargement...</div>';
    content.innerHTML = filterHtml;
    this._naftalLoadGestHistory();
  }

  async _naftalLoadGestHistory() {
    var el = document.getElementById('nv5GestHistTable');
    if (!el) return;
    el.innerHTML = '<div style="text-align:center;padding:20px;color:#64748b;">Chargement...</div>';
    var status = (document.getElementById('ghf_status')||{}).value||'';
    var signal = (document.getElementById('ghf_signal')||{}).value||'';
    var refill = (document.getElementById('ghf_refill')||{}).value||'';
    var truck = (document.getElementById('ghf_truck')||{}).value||'';
    var from = (document.getElementById('ghf_from')||{}).value||'';
    var to = (document.getElementById('ghf_to')||{}).value||'';
    var qs = new URLSearchParams({limit:'200'});
    if (status) qs.set('status',status);
    if (signal) qs.set('isSignaled',signal);
    if (refill) qs.set('refillStatus',refill);
    var carte = (document.getElementById('hf_carte')||{}).value||'';
    if (truck) qs.set('truckName',truck);
    if (carte) qs.set('carteNaftal',carte);
    if (from) qs.set('from',from);
    if (to) qs.set('to',to);
    try {
      var r = await fetch('/api/naftal/declarations?'+qs.toString());
      var decls = r.ok ? await r.json() : [];
      this._naftalRenderGestHistTable(el, decls);
    } catch(e) { el.innerHTML='<div style="color:#ef4444;padding:20px;">Erreur: '+e.message+'</div>'; }
  }

  _naftalRenderGestHistTable(el, decls) {
    if (!decls.length) {
      el.innerHTML='<div style="text-align:center;padding:40px;color:#64748b;"><i class="fa-solid fa-inbox" style="font-size:32px;opacity:0.3;"></i><br><br>Aucune déclaration trouvée</div>';
      return;
    }
    var gTblId = 'nv5GestTbl_'+Date.now();
    var thStyle = 'padding:10px 12px;border-bottom:2px solid #cbd5e1;cursor:pointer;user-select:none;white-space:nowrap;font-size:11px;font-weight:700;color:#374151;background:#f1f5f9;text-transform:uppercase;letter-spacing:0.03em;';
    var mkTh = function(label, col, align) {
      return '<th data-sortcol="'+col+'" onclick="ui._naftalSortTable(\''+gTblId+'\','+col+')" style="'+thStyle+(align?'text-align:'+align+';':'')+'">'
        +label+'<span style="color:#94a3b8;font-size:9px;margin-left:3px;">⇅</span></th>';
    };
    var html = '<div style="overflow-x:auto;"><table id="'+gTblId+'" class="nv5-table"><thead><tr>'
      +mkTh('Date / ID',0)+mkTh('Statut',1)+mkTh('Camion',2)
      +mkTh('Carte',3)+mkTh('Pos. départ',4)+mkTh('Destination',5)
      +mkTh('DA App.',6,'right')+mkTh('DA Réel',7,'right')
      +mkTh('Refill',8,'center')+'<th style="'+thStyle+'">📍 Lieu</th>'
      +'<th style="'+thStyle+'">Actions</th>'
      +'</tr></thead><tbody>';
    var rowN = 0;
    var prevDeclId = null;
    decls.forEach(function(d) {
      var hasMod = d.modificationRequest && d.modificationRequest.status==='pending';
      var trucks = d.trucks||[];
      var isFirstDecl = d.declarationId !== prevDeclId;
      prevDeclId = d.declarationId;
      trucks.forEach(function(t, ti) {
        rowN++;
        var da = t.approvedAmountDA||0;
        var daReal = t.actualRefillCostDA||0;
        var stops = (t.extraStops||[]).filter(function(s){return s.name;});
        var fullRoute = stops.map(function(s){return s.name;}).join(' → ');
        if (t.destination) fullRoute = (fullRoute?fullRoute+' → ':'')+t.destination;

        var refillBadge = t.refillStatus==='completed'
          ? '<span style="background:#dcfce7;color:#15803d;font-size:10px;padding:2px 7px;border-radius:12px;font-weight:700;white-space:nowrap;">✓ Ravitaillé</span>'
          : t.refillStatus==='flagged'
          ? '<span style="background:#fee2e2;color:#dc2626;font-size:10px;padding:2px 7px;border-radius:12px;font-weight:700;white-space:nowrap;">⚑ Flagged</span>'
          : t.refillStatus==='in_progress'
          ? '<span style="background:#dbeafe;color:#1d4ed8;font-size:10px;padding:2px 7px;border-radius:12px;font-weight:700;white-space:nowrap;">⟳ En cours</span>'
          : '<span style="color:#94a3b8;font-size:12px;">—</span>';

        // Location cell
        var sn = t.refillStationName||''; var slat=t.refillStationLat; var slng=t.refillStationLng;
        var isInt=t.isRefillInternal; var dt=t.refillDetectedAt;
        var dtStr=dt?new Date(dt).toLocaleString('fr-DZ',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}):'';
        var locCell;
        if(slat&&slng){
          var gmUrl='https://www.google.com/maps?q='+slat+','+slng;
          var locLabel=sn&&sn!=='Station Externe'?sn:(slat.toFixed(4)+', '+slng.toFixed(4));
          locCell='<a href="'+gmUrl+'" target="_blank" rel="noopener" data-lat="'+slat+'" data-lng="'+slng
            +'" style="color:#0284c7;text-decoration:none;font-size:11px;display:flex;align-items:center;gap:4px;white-space:nowrap;">'
            +'<i class="fa-solid fa-location-dot" style="color:'+(isInt?'#d97706':'#ef4444')+';font-size:12px;"></i>'
            +'<span class="nv5-geo-label" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:130px;">'+locLabel+'</span>'
            +'</a>'
            +(isInt?'<span style="background:#fef3c7;color:#d97706;font-size:9px;padding:1px 5px;border-radius:8px;font-weight:700;margin-left:2px;">⚠ Interne</span>':'')
            +(dtStr?'<div style="font-size:9px;color:#94a3b8;margin-top:1px;">'+dtStr+'</div>':'');
        } else {
          locCell='<span style="color:#cbd5e1;font-size:12px;">—</span>';
        }

        var declInfo = ti===0
          ? '<div style="font-size:10px;color:#475569;font-weight:600;">'+this._naftalFormatDate(d.createdAt)+'</div>'
            +'<span style="background:#dbeafe;color:#1d4ed8;padding:1px 7px;border-radius:4px;font-size:10px;font-weight:800;font-family:monospace;">'+d.declarationId+'</span>'
            +(hasMod?'<div style="margin-top:3px;"><span style="background:#fef3c7;color:#92400e;border-radius:4px;padding:1px 5px;font-size:9px;font-weight:700;">⏳ Modif.</span></div>':'')
          : '<div style="font-size:9px;color:#94a3b8;padding-left:8px;border-left:2px solid #e2e8f0;">↳ suite</div>';

        // Stronger visual group separator: top border when first truck of a new declaration
        var rowTopBorder = (ti===0 && rowN>1) ? 'border-top:2px solid #94a3b8;' : '';
        var removed = t.isRemoved;
        var rowBg = removed ? '#fafafa' : (ti%2===0 ? '#ffffff' : '#f8fafc');

        html += '<tr style="background:'+rowBg+';border-bottom:1px solid #e2e8f0;'+rowTopBorder+(removed?'opacity:0.5;':'')+'">'+
          '<td style="padding:9px 12px;vertical-align:top;min-width:130px;">'+declInfo+'</td>'+
          '<td style="padding:9px 12px;vertical-align:top;white-space:nowrap;">'+(ti===0?this._naftalFormatStatus(d.status):'')+'</td>'+
          '<td style="padding:9px 12px;font-weight:700;color:'+(removed?'#94a3b8':'#111827')+';white-space:nowrap;'+(removed?'text-decoration:line-through;':'')+'">'+
            (t.truckName||'—')+'<div style="font-size:9px;color:#6b7280;font-weight:400;">'+(t.immatriculation||'')+'</div></td>'+
          '<td style="padding:9px 12px;color:#0369a1;font-weight:700;font-family:monospace;font-size:12px;">'+(t.carteNaftal||'—')+'</td>'+
          '<td style="padding:9px 12px;font-size:11px;color:#374151;max-width:110px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">'+(t.currentLocation||'—')+'</td>'+
          '<td style="padding:9px 12px;font-size:11px;color:#374151;max-width:180px;">'+(fullRoute||'—')+'</td>'+
          '<td style="padding:9px 12px;text-align:right;font-weight:700;color:#0369a1;white-space:nowrap;font-size:12px;">'+(da?Math.round(da).toLocaleString('fr-DZ')+' DA':'—')+'</td>'+
          '<td style="padding:9px 12px;text-align:right;white-space:nowrap;font-size:12px;"><div style="font-weight:700;color:'+(daReal>da&&da>0?'#dc2626':'#15803d')+';">'+(daReal?Math.round(daReal).toLocaleString('fr-DZ')+' DA':'—')+'</div>'
            +(daReal&&da>0?'<div style="font-size:9px;color:'+(daReal>da?'#dc2626':'#15803d')+';">'+(daReal>da?'+':'')+Math.round((daReal-da)/da*100)+'%</div>':'')+'</td>'+
          '<td style="padding:9px 12px;text-align:center;">'+refillBadge+'</td>'+
          '<td style="padding:9px 12px;min-width:130px;">'+locCell+'</td>'+
          '<td style="padding:9px 12px;white-space:nowrap;">'+
            (ti===0?'<button onclick="ui.naftalToggleSignal(\''+d.declarationId+'\',this)" style="background:'+(d.isSignaled?'#fee2e2':'#f1f5f9')+';border:1.5px solid '+(d.isSignaled?'#fca5a5':'#d1d5db')+';color:'+(d.isSignaled?'#dc2626':'#6b7280')+';padding:4px 9px;border-radius:6px;cursor:pointer;font-size:11px;font-weight:600;" title="Signaler/Désignaler"><i class="fa-solid fa-flag"></i></button>':'')+
            (d.status==='cancelled'&&ti===0?'<button onclick="ui.naftalReopenDeclaration(\''+d.declarationId+'\',this)" style="background:#eff6ff;border:1.5px solid #93c5fd;color:#1d4ed8;padding:4px 9px;border-radius:6px;cursor:pointer;font-size:11px;font-weight:600;margin-left:4px;">Rouvrir</button>':'')
          +'</td>'+
        '</tr>';
      }.bind(this));
    }.bind(this));
    html += '</tbody></table></div>';
    html += '<div style="font-size:11px;color:#475569;margin-top:10px;text-align:right;font-weight:600;">'+rowN+' camion(s) dans '+decls.length+' déclaration(s)</div>';
    el.innerHTML = html;
    setTimeout(function(){if(window.ui)ui._naftalGeocodeTableLocations(el);}, 200);
  }

  // ── HISTORIQUE TAB (global) ────────────────────────────────────────────────

  async renderNaftalHistorique(body) {
    if (!body) return;
    var self = this;
    var filterHtml =
      '<h3 style="margin:0 0 14px;color:#1e293b;font-size:15px;"><i class="fa-solid fa-clock-rotate-left" style="color:#6d28d9;"></i> Historique Global</h3>' +
      '<div class="nv5-filters" style="gap:8px;flex-wrap:wrap;">' +
        '<select class="nv5-sel" id="hf_status" onchange="ui._naftalLoadHistorique()">' +
          '<option value="transport_validated,gestionnaire_validated,in_progress,completed">Actives + Terminées</option>' +
          '<option value="">Tous statuts</option>' +
          '<option value="transport_validated">Att. gestionnaire</option>' +
          '<option value="gestionnaire_validated">Approuvées</option>' +
          '<option value="in_progress">En cours</option>' +
          '<option value="completed">Terminées</option>' +
          '<option value="cancelled">Annulées</option>' +
        '</select>' +
        '<label style="display:flex;align-items:center;gap:5px;cursor:pointer;font-size:12px;color:#475569;background:#fef3c7;padding:5px 10px;border-radius:20px;border:1.5px solid #f59e0b;">' +
          '<input type="checkbox" id="hf_show_cancelled" onchange="ui._naftalLoadHistorique()" style="accent-color:#f59e0b;"> 🗑️ Annulées' +
        '</label>' +
        '<label style="display:flex;align-items:center;gap:5px;cursor:pointer;font-size:12px;color:#475569;background:#ede9fe;padding:5px 10px;border-radius:20px;border:1.5px solid #7c3aed;">' +
          '<input type="checkbox" id="hf_show_modif" onchange="ui._naftalLoadHistorique()" style="accent-color:#7c3aed;"> 🔄 Avec demande modif.' +
        '</label>' +
        '<label style="display:flex;align-items:center;gap:5px;cursor:pointer;font-size:12px;color:#475569;background:#fee2e2;padding:5px 10px;border-radius:20px;border:1.5px solid #ef4444;">' +
          '<input type="checkbox" id="hf_show_flagged" onchange="ui._naftalLoadHistorique()" style="accent-color:#ef4444;"> 🚩 Signalées' +
        '</label>' +
        '<input type="text" class="nv5-sel" id="hf_truck" placeholder="🔍 Camion..." style="width:120px;" oninput="clearTimeout(ui._hT2);ui._hT2=setTimeout(function(){ui._naftalLoadHistorique();},400);">' +
        '<input type="date" class="nv5-sel" id="hf_from" onchange="ui._naftalLoadHistorique()" title="Depuis" style="width:140px;">  ' +
        '<input type="date" class="nv5-sel" id="hf_to" onchange="ui._naftalLoadHistorique()" title="Jusqu\'au" style="width:140px;">  ' +
        '<input type="text" class="nv5-sel" id="hf_carte" placeholder="💳 Carte Naftal..." style="width:130px;" oninput="clearTimeout(ui._hT3);ui._hT3=setTimeout(function(){ui._naftalLoadHistorique();},400);">  ' +
        '<button onclick="ui._naftalLoadHistorique()" class="nv5-btn nv5-btn-primary" style="padding:7px 14px;"><i class="fa-solid fa-filter"></i> Filtrer</button>' +
        '<button onclick="ui._naftalHistReset()" class="nv5-btn nv5-btn-ghost" style="padding:7px 12px;font-size:11px;">✕ Reset</button>' +
        '<button onclick="ui.naftalExportCSV()" class="nv5-btn nv5-btn-ghost" style="padding:7px 14px;"><i class="fa-solid fa-file-excel"></i> Excel</button>' +
      '</div>' +
      '<div id="nv5HistContent">Chargement...</div>';
    body.innerHTML = filterHtml;
    // Default date range: yesterday → today
    var _today = new Date(); var _yest = new Date(_today);
    _yest.setDate(_yest.getDate() - 1);
    var _fmt = function(d){return d.toISOString().slice(0,10);};
    var _fromEl = document.getElementById('hf_from'); var _toEl = document.getElementById('hf_to');
    if (_fromEl && !_fromEl.value) _fromEl.value = _fmt(_yest);
    if (_toEl && !_toEl.value) _toEl.value = _fmt(_today);
    this._naftalLoadHistorique();
  }

  _naftalHistReset() {
    var s = document.getElementById('hf_status');
    if (s) s.value = 'transport_validated,gestionnaire_validated,in_progress,completed';
    ['hf_show_cancelled','hf_show_modif','hf_show_flagged','hf_truck','hf_carte'].forEach(function(id){
      var e = document.getElementById(id);
      if (e) { if (e.type==='checkbox') e.checked=false; else e.value=''; }
    });
    // Restore yesterday → today defaults
    var today = new Date(); var yest = new Date(today);
    yest.setDate(yest.getDate()-1);
    var fmt = function(d){return d.toISOString().slice(0,10);};
    var f = document.getElementById('hf_from'); var t = document.getElementById('hf_to');
    if (f) f.value = fmt(yest);
    if (t) t.value = fmt(today);
    this._naftalLoadHistorique();
  }

    async _naftalLoadHistorique() {
    var el = document.getElementById('nv5HistContent');
    if (!el) return;
    el.innerHTML='<div style="text-align:center;padding:20px;color:#64748b;">Chargement...</div>';
    var status = (document.getElementById('hf_status')||{}).value||'transport_validated,gestionnaire_validated,in_progress,completed';
    var showCancelled = (document.getElementById('hf_show_cancelled')||{}).checked;
    var showModif = (document.getElementById('hf_show_modif')||{}).checked;
    var showFlagged = (document.getElementById('hf_show_flagged')||{}).checked;
    var truck = (document.getElementById('hf_truck')||{}).value||'';
    var from = (document.getElementById('hf_from')||{}).value||'';
    var to = (document.getElementById('hf_to')||{}).value||'';
    var qs = new URLSearchParams({limit:'500'});
    var statusList = status ? status.split(',') : ['transport_validated','gestionnaire_validated','in_progress','completed'];
    if (showCancelled && !statusList.includes('cancelled')) statusList.push('cancelled');
    if (showFlagged && !statusList.includes('cancelled')) statusList.push('cancelled'); // flagged trucks can be in cancelled decls
    qs.set('status', statusList.join(','));
    if (showModif) qs.set('modReqStatus','pending,approved,refused');
    if (showFlagged) qs.set('isSignaled','true');
    if (truck) qs.set('truckName',truck);
    if (from) qs.set('from',from);
    if (to) qs.set('to',to);
    try {
      var r = await fetch('/api/naftal/declarations?'+qs.toString());
      var decls = r.ok ? await r.json() : [];
      this._naftalRenderHistTable(el, decls);
    } catch(e){el.innerHTML='<div style="color:#ef4444;padding:20px;">Erreur: '+e.message+'</div>';}
  }

  _naftalRenderHistTable(el, decls) {
    if (!decls.length) {
      el.innerHTML = '<div style="text-align:center;padding:50px 20px;color:#94a3b8;">' +
        '<i class="fa-solid fa-inbox" style="font-size:36px;opacity:0.35;display:block;margin-bottom:12px;"></i>' +
        '<div style="font-size:14px;font-weight:600;">Aucune donnée trouvée</div>' +
        '<div style="font-size:12px;margin-top:4px;">Essayez d\'élargir la période ou les filtres</div>' +
        '</div>';
      return;
    }

    var statusMeta = {
      completed:              { bg:'#f0fdf4', border:'#86efac', color:'#16a34a', icon:'fa-circle-check',  label:'Terminé' },
      gestionnaire_validated: { bg:'#eff6ff', border:'#93c5fd', color:'#2563eb', icon:'fa-check-double',  label:'Approuvé' },
      transport_validated:    { bg:'#fffbeb', border:'#fcd34d', color:'#d97706', icon:'fa-clock',         label:'En attente gest.' },
      in_progress:            { bg:'#f0f9ff', border:'#7dd3fc', color:'#0284c7', icon:'fa-spinner',       label:'En cours' },
      cancelled:              { bg:'#fafafa', border:'#e2e8f0', color:'#94a3b8', icon:'fa-ban',           label:'Annulé' },
      flagged:                { bg:'#fff1f2', border:'#fca5a5', color:'#ef4444', icon:'fa-triangle-exclamation', label:'Anomalie' }
    };

    var html = '<div style="display:flex;flex-direction:column;gap:14px;">';

    decls.forEach(function(d) {
      var sm = statusMeta[d.status] || statusMeta['in_progress'];
      var trucks = (d.trucks||[]);
      var totalDA = trucks.reduce(function(s,t){return s+(t.approvedAmountDA||0);},0);
      var totalReal = trucks.reduce(function(s,t){return s+(t.actualRefillCostDA||0);},0);
      var totalLiters = trucks.reduce(function(s,t){return s+(t.actualRefillLiters||t.approvedLiters||0);},0);
      var hasFlag = trucks.some(function(t){return t.isFlagged||t.refillStatus==='flagged';});
      var hasRemoved = trucks.some(function(t){return t.isRemoved;});
      var activeTrucks = trucks.filter(function(t){return !t.isRemoved;});

      // ── Declaration card ──────────────────────────────────────────────────
      html += '<div style="background:#fff;border:1.5px solid '+sm.border+';border-radius:14px;overflow:hidden;box-shadow:0 1px 6px rgba(0,0,0,0.05);">';

      // Card header
      html += '<div style="background:'+sm.bg+';padding:12px 16px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;border-bottom:1.5px solid '+sm.border+';">' +
        '<div style="display:flex;align-items:center;gap:10px;">' +
          '<div style="width:34px;height:34px;border-radius:8px;background:'+sm.color+'22;display:flex;align-items:center;justify-content:center;">' +
            '<i class="fa-solid '+sm.icon+'" style="color:'+sm.color+';font-size:14px;"></i>' +
          '</div>' +
          '<div>' +
            '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">' +
              '<span style="font-weight:900;color:#1e293b;font-family:monospace;font-size:13px;">'+(d.declarationId||'—')+'</span>' +
              '<span style="background:'+sm.color+';color:#fff;font-size:10px;font-weight:700;padding:2px 9px;border-radius:20px;">'+(hasFlag?'⚑ ':'')+sm.label+'</span>' +
              (d.isSignaled ? '<span style="background:#fee2e2;color:#ef4444;font-size:10px;font-weight:700;padding:2px 9px;border-radius:20px;"><i class="fa-solid fa-flag"></i> Signalé</span>' : '') +
              (hasRemoved ? '<span style="background:#f3f4f6;color:#6b7280;font-size:10px;font-weight:700;padding:2px 9px;border-radius:20px;">🚫 Retrait partiel</span>' : '') +
            '</div>' +
            '<div style="font-size:11px;color:#64748b;margin-top:2px;">' +
              '<i class="fa-regular fa-calendar" style="margin-right:4px;"></i>'+this._naftalFormatDate(d.createdAt) +
              '&nbsp;·&nbsp;<i class="fa-solid fa-truck" style="margin-right:3px;"></i>'+activeTrucks.length+' camion'+(activeTrucks.length>1?'s':'') +
            '</div>' +
          '</div>' +
        '</div>' +
        '<div style="display:flex;align-items:center;gap:16px;text-align:right;">' +
          (totalDA ? '<div><div style="font-size:15px;font-weight:900;color:#0284c7;">'+Math.round(totalDA).toLocaleString('fr-DZ')+' DA</div><div style="font-size:10px;color:#64748b;">DA Approuvé</div></div>' : '') +
          (totalReal ? '<div><div style="font-size:15px;font-weight:900;color:'+(totalReal>totalDA&&totalDA>0?'#ef4444':'#16a34a')+';">'+Math.round(totalReal).toLocaleString('fr-DZ')+' DA</div><div style="font-size:10px;color:#64748b;">DA Réel</div></div>' : '') +
          (totalLiters ? '<div><div style="font-size:15px;font-weight:900;color:#8b5cf6;">'+Math.round(totalLiters)+' L</div><div style="font-size:10px;color:#64748b;">Litres</div></div>' : '') +
        '</div>' +
      '</div>';

      // Truck rows
      html += '<div style="overflow-x:auto;"><table style="width:100%;border-collapse:collapse;">' +
        '<thead><tr style="background:#f8fafc;">' +
          '<th style="padding:8px 14px;text-align:left;font-size:10px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;border-bottom:1px solid #e2e8f0;white-space:nowrap;">Camion</th>' +
          '<th style="padding:8px 14px;text-align:left;font-size:10px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;border-bottom:1px solid #e2e8f0;white-space:nowrap;">Carte</th>' +
          '<th style="padding:8px 14px;text-align:left;font-size:10px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;border-bottom:1px solid #e2e8f0;white-space:nowrap;">Itinéraire</th>' +
          '<th style="padding:8px 14px;text-align:right;font-size:10px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;border-bottom:1px solid #e2e8f0;white-space:nowrap;">DA Approuvé</th>' +
          '<th style="padding:8px 14px;text-align:right;font-size:10px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;border-bottom:1px solid #e2e8f0;white-space:nowrap;">DA Réel</th>' +
          '<th style="padding:8px 14px;text-align:center;font-size:10px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;border-bottom:1px solid #e2e8f0;white-space:nowrap;">Refill</th>' +
          '<th style="padding:8px 14px;text-align:left;font-size:10px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;border-bottom:1px solid #e2e8f0;white-space:nowrap;">📍 Lieu</th>' +
        '</tr></thead><tbody>';

      trucks.forEach(function(t, ti) {
        var stops = (t.extraStops||[]).filter(function(s){return s.name;});
        var itin = stops.map(function(s){return s.name;}).join(' → ');
        if (t.destination) itin = (itin ? itin + ' → ' : '') + t.destination;
        var da = t.approvedAmountDA || 0;
        var daReal = t.actualRefillCostDA || 0;
        var deviation = da > 0 && daReal > 0 ? Math.round((daReal - da) / da * 100) : null;

        var refillBadge;
        if (t.isRemoved) {
          refillBadge = '<span style="background:#f3f4f6;color:#9ca3af;font-size:10px;padding:2px 7px;border-radius:20px;font-weight:700;">🚫 Retiré</span>';
        } else if (t.refillStatus === 'completed') {
          refillBadge = '<span style="background:#dcfce7;color:#16a34a;font-size:10px;padding:2px 7px;border-radius:20px;font-weight:700;">✓ Fait</span>';
        } else if (t.refillStatus === 'flagged') {
          refillBadge = '<span style="background:#fee2e2;color:#ef4444;font-size:10px;padding:2px 7px;border-radius:20px;font-weight:700;">⚑ Flagged</span>';
        } else if (t.refillStatus === 'in_progress') {
          refillBadge = '<span style="background:#dbeafe;color:#2563eb;font-size:10px;padding:2px 7px;border-radius:20px;font-weight:700;">⟳ En cours</span>';
        } else {
          refillBadge = '<span style="color:#94a3b8;font-size:12px;">—</span>';
        }

        var rowBg = t.isRemoved ? '#fafafa' : (ti % 2 === 0 ? '#fff' : '#f8fafc');
        var textOp = t.isRemoved ? 'opacity:0.5;' : '';

        // Location cell
        var sn = t.refillStationName || '';
        var slat = t.refillStationLat, slng = t.refillStationLng;
        var isInt = t.isRefillInternal;
        var dt = t.refillDetectedAt;
        var dtStr = dt ? new Date(dt).toLocaleString('fr-DZ',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}) : '';
        var locCell;
        if (slat && slng) {
          var gmUrl = 'https://www.google.com/maps?q='+slat+','+slng;
          var locLabel = sn && sn !== 'Station Externe' ? sn : (slat.toFixed(4)+', '+slng.toFixed(4));
          locCell = '<a href="'+gmUrl+'" target="_blank" rel="noopener" data-lat="'+slat+'" data-lng="'+slng+'"' +
            ' title="GPS: '+slat.toFixed(6)+', '+slng.toFixed(6)+(dtStr?' — '+dtStr:'')+'"' +
            ' style="color:#0284c7;text-decoration:none;font-size:11px;display:flex;align-items:center;gap:4px;">' +
            '<i class="fa-solid fa-location-dot" style="color:'+(isInt?'#d97706':'#ef4444')+';font-size:12px;flex-shrink:0;"></i>' +
            '<span class="nv5-geo-label" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:140px;">'+locLabel+'</span></a>' +
            (isInt ? '<span style="background:#fef3c7;color:#d97706;font-size:9px;padding:1px 5px;border-radius:8px;font-weight:700;">⚠️ Int.</span>' : '') +
            (dtStr ? '<div style="font-size:9px;color:#94a3b8;margin-top:1px;">'+dtStr+'</div>' : '');
        } else {
          locCell = '<span style="color:#cbd5e1;font-size:12px;">—</span>';
        }

        html += '<tr style="background:'+rowBg+';border-bottom:1px solid #f1f5f9;'+textOp+'">' +
          '<td style="padding:9px 14px;white-space:nowrap;">' +
            '<div style="font-weight:700;color:'+(t.isRemoved?'#94a3b8':'#1e293b')+';font-size:12px;'+(t.isRemoved?'text-decoration:line-through;':'')+'">'+(t.truckName||t.deviceId||'—')+'</div>' +
            (t.immatriculation ? '<div style="font-size:9px;color:#94a3b8;">'+t.immatriculation+'</div>' : '') +
          '</td>' +
          '<td style="padding:9px 14px;font-weight:700;color:#0369a1;font-family:monospace;font-size:11px;white-space:nowrap;">'+(t.carteNaftal||'—')+'</td>' +
          '<td style="padding:9px 14px;font-size:11px;color:#475569;max-width:200px;">'+(itin||'<span style="color:#cbd5e1;">—</span>')+'</td>' +
          '<td style="padding:9px 14px;text-align:right;font-weight:700;color:#0284c7;white-space:nowrap;">'+(da?Math.round(da).toLocaleString('fr-DZ')+' DA':'<span style="color:#cbd5e1;">—</span>')+'</td>' +
          '<td style="padding:9px 14px;text-align:right;white-space:nowrap;">' +
            (daReal ? '<div style="font-weight:700;color:'+(daReal>da&&da>0?'#ef4444':'#16a34a')+';">'+Math.round(daReal).toLocaleString('fr-DZ')+' DA</div>' : '<span style="color:#cbd5e1;">—</span>') +
            (deviation !== null ? '<div style="font-size:9px;color:'+(deviation>0?'#ef4444':'#16a34a')+';font-weight:700;">'+(deviation>0?'+':'')+deviation+'%</div>' : '') +
          '</td>' +
          '<td style="padding:9px 14px;text-align:center;">'+refillBadge+'</td>' +
          '<td style="padding:9px 14px;">'+locCell+'</td>' +
        '</tr>';
      }.bind(this));

      html += '</tbody></table></div>';

      // Modification log (collapsed, if any)
      if (d.modificationLog && d.modificationLog.length) {
        html += '<div style="padding:8px 16px;background:#fffbeb;border-top:1px solid #fde68a;font-size:10px;color:#92400e;display:flex;align-items:flex-start;gap:6px;">' +
          '<i class="fa-solid fa-clock-rotate-left" style="margin-top:1px;flex-shrink:0;"></i>' +
          '<div>' + d.modificationLog.slice(-3).map(function(l){
            return '<span style="font-weight:700;">['+l.by+']</span> '+l.detail;
          }).join('&nbsp;·&nbsp;') + '</div>' +
        '</div>';
      }

      html += '</div>'; // end card
    }.bind(this));

    html += '</div>'; // end list
    html += '<div style="font-size:11px;color:#94a3b8;margin-top:12px;text-align:right;padding:0 4px;">' +
      decls.reduce(function(s,d){return s+(d.trucks||[]).length;},0)+' camion(s) dans '+decls.length+' déclaration(s)</div>';

    el.innerHTML = html;
    setTimeout(function(){if(window.ui)ui._naftalGeocodeTableLocations(el);}, 150);
  }

    // ── ANALYSE TAB ────────────────────────────────────────────────────────────

  async renderNaftalAnalyse(body) {
    if (!body) return;
    body.innerHTML =
      '<h3 style="margin:0 0 14px;color:#1e293b;font-size:15px;"><i class="fa-solid fa-chart-pie" style="color:#0284c7;"></i> Analyse & Statistiques</h3>' +
      '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:4px;">' +
        '<button onclick="ui._naftalLoadAnalytics(\'7d\')" class="nv5-btn nv5-btn-ghost" id="anp_7d" style="padding:6px 14px;">7j</button>' +
        '<button onclick="ui._naftalLoadAnalytics(\'30d\')" class="nv5-btn nv5-btn-primary" id="anp_30d" style="padding:6px 14px;">30j</button>' +
        '<button onclick="ui._naftalLoadAnalytics(\'3m\')" class="nv5-btn nv5-btn-ghost" id="anp_3m" style="padding:6px 14px;">3 mois</button>' +
        '<button onclick="ui._naftalLoadAnalytics(\'12m\')" class="nv5-btn nv5-btn-ghost" id="anp_12m" style="padding:6px 14px;">12 mois</button>' +
      '</div>' +
      '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:14px;padding:8px 0;border-bottom:1px solid #e2e8f0;">' +
        '<button onclick="ui._naftalAnalyseSubTab(\'charts\')" id="asub_charts" style="padding:7px 16px;border-radius:20px;border:none;cursor:pointer;font-size:12px;font-weight:700;background:#0284c7;color:#fff;">📊 Graphiques</button>' +
        '<button onclick="ui._naftalAnalyseSubTab(\'trucks\')" id="asub_trucks" style="padding:7px 16px;border-radius:20px;border:none;cursor:pointer;font-size:12px;font-weight:700;background:#f1f5f9;color:#64748b;">🚛 Par Camion</button>' +
        '<button onclick="ui._naftalAnalyseSubTab(\'cards\')" id="asub_cards" style="padding:7px 16px;border-radius:20px;border:none;cursor:pointer;font-size:12px;font-weight:700;background:#f1f5f9;color:#64748b;">💳 Par Carte</button>' +
      '</div>' +
      '<div id="nv5AnalyseContent"><div style="text-align:center;padding:30px;color:#64748b;">Chargement...</div></div>';
    this._naftalCurrentAnalysePeriod = '30d';
    this._naftalCurrentAnalyseTab = 'charts';
    this._naftalLoadAnalytics('30d');
  }

  _naftalAnalyseSubTab(tab) {
    this._naftalCurrentAnalyseTab = tab;
    ['charts','trucks','cards'].forEach(function(t) {
      var btn = document.getElementById('asub_'+t);
      if (btn) {
        btn.style.background = t===tab?'#0284c7':'#f1f5f9';
        btn.style.color = t===tab?'#fff':'#64748b';
      }
    });
    this._naftalLoadAnalytics(this._naftalCurrentAnalysePeriod||'30d');
  }

  async _naftalLoadAnalytics(period) {
    this._naftalCurrentAnalysePeriod = period;
    ['7d','30d','3m','12m'].forEach(function(p) {
      var btn = document.getElementById('anp_'+p);
      if (btn) { btn.className = 'nv5-btn '+(p===period?'nv5-btn-primary':'nv5-btn-ghost'); btn.style.padding='6px 14px'; }
    });
    var el = document.getElementById('nv5AnalyseContent');
    if (!el) return;
    el.innerHTML = '<div style="text-align:center;padding:30px;color:#64748b;"><i class="fa-solid fa-spinner fa-spin"></i> Chargement...</div>';
    var tab = this._naftalCurrentAnalyseTab || 'charts';
    try {
      var r = await fetch('/api/naftal/analytics?period='+period);
      var data = r.ok ? await r.json() : {};
      if (tab === 'charts') this._naftalRenderAnalytics(el, data, period);
      else if (tab === 'trucks') this._naftalRenderTruckStatsTable(el, data, period);
      else if (tab === 'cards') this._naftalRenderCardStatsTable(el, data, period);
    } catch(e){el.innerHTML='<div style="color:#ef4444;padding:20px;">Erreur: '+e.message+'</div>';}
  }

  _naftalRenderAnalytics(el, data, period) {
    var totalApp = data.totalDAApproved||0;
    var totalReal = data.totalDAActual||0;
    var savings = totalApp - totalReal;
    var conformRate = totalApp>0?Math.round((1-Math.abs(savings)/totalApp)*100):0;
    var self = this;

    var kpiHtml =
      '<div class="nv5-kpi" style="margin-bottom:16px;">' +
        '<div class="nv5-kpi-card" style="background:linear-gradient(135deg,#f0f9ff,#e0f2fe);border-color:#7dd3fc;">' +
          '<div style="font-size:18px;font-weight:900;color:#0284c7;">'+(Math.round(totalApp/1000))+'k DA</div>' +
          '<div style="font-size:11px;color:#075985;font-weight:600;margin-top:2px;">DA Approuvé</div></div>' +
        '<div class="nv5-kpi-card" style="background:linear-gradient(135deg,#f0fdf4,#dcfce7);border-color:#86efac;">' +
          '<div style="font-size:18px;font-weight:900;color:#16a34a;">'+(Math.round(totalReal/1000))+'k DA</div>' +
          '<div style="font-size:11px;color:#166534;font-weight:600;margin-top:2px;">DA Réel</div></div>' +
        '<div class="nv5-kpi-card" style="background:linear-gradient(135deg,'+(savings>=0?'#f0fdf4,#dcfce7':'#fff1f2,#ffe4e6')+');border-color:'+(savings>=0?'#86efac':'#fca5a5')+'">' +
          '<div style="font-size:18px;font-weight:900;color:'+(savings>=0?'#16a34a':'#dc2626')+';">'+(savings>=0?'+':'')+Math.round(savings/1000)+'k DA</div>' +
          '<div style="font-size:11px;color:'+(savings>=0?'#166534':'#991b1b')+';font-weight:600;margin-top:2px;">'+(savings>=0?'Économies':'Dépassement')+'</div></div>' +
        '<div class="nv5-kpi-card" style="background:linear-gradient(135deg,#fdf4ff,#f3e8ff);border-color:#d8b4fe;">' +
          '<div style="font-size:18px;font-weight:900;color:#7c3aed;">'+conformRate+'%</div>' +
          '<div style="font-size:11px;color:#5b21b6;font-weight:600;margin-top:2px;">Conformité</div></div>' +
        '<div class="nv5-kpi-card" style="background:linear-gradient(135deg,#fffbeb,#fef3c7);border-color:#fcd34d;">' +
          '<div style="font-size:18px;font-weight:900;color:#d97706;">'+(data.totalDecls||0)+'</div>' +
          '<div style="font-size:11px;color:#92400e;font-weight:600;margin-top:2px;">Déclarations</div></div>' +
        '<div class="nv5-kpi-card" style="background:linear-gradient(135deg,#fff1f2,#ffe4e6);border-color:#fca5a5;">' +
          '<div style="font-size:18px;font-weight:900;color:#dc2626;">'+(data.flaggedCount||0)+'</div>' +
          '<div style="font-size:11px;color:#991b1b;font-weight:600;margin-top:2px;">Flagged</div></div>' +
      '</div>';

    var chartsHtml =
      '<div class="nv5-chart-grid">' +
        '<div class="nv5-chart-card" style="grid-column:1/-1;">' +
          '<h4 style="margin:0 0 12px;color:#1e293b;">Déclarations & DA par jour</h4>' +
          '<canvas id="ch_daily" height="80"></canvas></div>' +
        '<div class="nv5-chart-card">' +
          '<h4 style="margin:0 0 12px;color:#1e293b;">Répartition par statut</h4>' +
          '<canvas id="ch_status" height="160"></canvas></div>' +
        '<div class="nv5-chart-card">' +
          '<h4 style="margin:0 0 12px;color:#1e293b;">DA Approuvé vs Réel</h4>' +
          '<canvas id="ch_dacomp" height="160"></canvas></div>' +
        '<div class="nv5-chart-card">' +
          '<h4 style="margin:0 0 12px;color:#1e293b;">Top 10 Camions (DA)</h4>' +
          '<canvas id="ch_trucks" height="200"></canvas></div>' +
        '<div class="nv5-chart-card">' +
          '<h4 style="margin:0 0 12px;color:#1e293b;">Top 10 Destinations</h4>' +
          '<canvas id="ch_dests" height="200"></canvas></div>' +
      '</div>';

    el.innerHTML = kpiHtml + chartsHtml;

    // Load Chart.js then render
    var self2 = this;
    if (typeof Chart !== 'undefined') {
      self2._naftalRenderCharts(data);
    } else {
      var s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js';
      s.onload = function() { self2._naftalRenderCharts(data); };
      document.head.appendChild(s);
    }
  }


  _naftalRenderTruckStatsTable(el, data, period) {
    var self = this;
    var days = period==='7d'?7:period==='3m'?90:period==='12m'?365:30;
    var fromDate = new Date(Date.now() - days*864e5).toISOString().slice(0,10);
    el.innerHTML = '<div style="text-align:center;padding:20px;color:#64748b;"><i class="fa-solid fa-spinner fa-spin"></i> Chargement...</div>';
    fetch('/api/naftal/declarations?from='+fromDate+'&limit=2000')
    .then(function(r){return r.json();})
    .then(function(decls) {
      // Aggregate per truck
      var tMap = {};
      decls.forEach(function(d) {
        (d.trucks||[]).forEach(function(t) {
          var key = t.truckName||t.deviceId||'?';
          if (!tMap[key]) tMap[key] = {
            name:key, immat:t.immatriculation||'', cartes:new Set(), decls:0,
            daApp:0, daReal:0, litresApp:0, litresReal:0, flagged:0,
            lastStation:'', lastLat:null, lastLng:null, lastRefillAt:null
          };
          var tr = tMap[key];
          if (t.carteNaftal) tr.cartes.add(t.carteNaftal);
          tr.decls++;
          tr.daApp += t.approvedAmountDA||0;
          tr.daReal += t.actualRefillCostDA||0;
          tr.litresApp += t.approvedLiters||0;
          tr.litresReal += t.actualRefillLiters||0;
          if (t.refillStatus==='flagged'||t.isFlagged) tr.flagged++;
          if (t.refillDetectedAt && (!tr.lastRefillAt || new Date(t.refillDetectedAt)>new Date(tr.lastRefillAt))) {
            tr.lastRefillAt = t.refillDetectedAt;
            tr.lastStation = t.refillStationName||'';
            tr.lastLat = t.refillStationLat||null;
            tr.lastLng = t.refillStationLng||null;
          }
        });
      });
      var trucks = Object.values(tMap).sort(function(a,b){return b.daApp-a.daApp;});
      var grandDA = trucks.reduce(function(s,t){return s+t.daApp;},0);
      var tblId = 'trkTbl_'+Date.now();

      // Filter input
      var filterBar = '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:10px;">' +
        '<input id="trkFilter" type="text" placeholder="🔍 Filtrer camion / immat / carte..." style="padding:7px 12px;border:1.5px solid #e2e8f0;border-radius:8px;font-size:12px;flex:1;min-width:180px;" oninput="ui._naftalFilterStatsTable(\''+tblId+'\',this.value)">' +
        '<button onclick="ui._naftalExportRows(ui._naftalGetTableRows(\''+tblId+'\'), \'NAFTAL_Camions_'+period+'\')" style="padding:7px 14px;background:#16a34a;color:#fff;border:none;border-radius:8px;font-size:12px;font-weight:700;cursor:pointer;"><i class="fa-solid fa-file-excel"></i> Exporter Excel</button>' +
        '</div>';

      var th = 'style="padding:10px 12px;border-bottom:2px solid #e2e8f0;cursor:pointer;user-select:none;white-space:nowrap;background:#f8fafc;"';
      var mkTh = function(l,i,al){return '<th '+th+' onclick="ui._naftalSortTable(\''+tblId+'\','+i+')" '+(al?'style="'+th.slice(7,-1)+';text-align:'+al+';"':'')+'>' +l+'<span style="color:#94a3b8;font-size:9px;"> ⇅</span></th>';};
      var html = '<h4 style="margin:0 0 10px;color:#1e293b;font-size:14px;">🚛 Consommation par Camion — Période: '+period+'</h4>' +
        filterBar +
        '<div style="overflow-x:auto;"><table id="'+tblId+'" class="nv5-table" style="width:100%;border-collapse:collapse;">' +
        '<thead><tr>' +
          mkTh('Camion',0) + mkTh('Immat.',1) + mkTh('Carte(s)',2) +
          mkTh('Décl.',3,'right') + mkTh('DA Approuvé',4,'right') +
          mkTh('DA Réel',5,'right') + mkTh('Δ DA',6,'right') +
          mkTh('L Approuvés',7,'right') + mkTh('L Réels',8,'right') +
          mkTh('% Total',9,'center') + mkTh('Anomalies',10,'center') +
          mkTh('Dernier Lieu Ravitaillement',11) +
        '</tr></thead><tbody>';

      trucks.forEach(function(t,i) {
        var share = grandDA>0?Math.round(t.daApp/grandDA*100):0;
        var delta = t.daReal - t.daApp;
        var deltaCol = delta>0?'#ef4444':delta<0?'#16a34a':'#64748b';
        var cartes = Array.from(t.cartes).join(', ') || '—';
        // Location link
        var locCell;
        if (t.lastLat && t.lastLng) {
          var gmUrl = 'https://www.google.com/maps?q='+t.lastLat+','+t.lastLng;
          var locLabel = (t.lastStation && t.lastStation !== 'Station Externe') ? t.lastStation : (t.lastLat.toFixed(4)+', '+t.lastLng.toFixed(4));
          locCell = '<a href="'+gmUrl+'" target="_blank" rel="noopener" data-lat="'+t.lastLat+'" data-lng="'+t.lastLng+'" title="GPS: '+t.lastLat.toFixed(6)+', '+t.lastLng.toFixed(6)+'" style="color:#0284c7;text-decoration:none;font-size:11px;display:flex;align-items:center;gap:4px;"><i class="fa-solid fa-location-dot" style="color:#ef4444;font-size:12px;"></i><span class="nv5-geo-label">'+locLabel+'</span></a>';
          if (t.lastRefillAt) locCell += '<div style="font-size:9px;color:#94a3b8;">'+new Date(t.lastRefillAt).toLocaleString('fr-DZ',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})+'</div>';
        } else { locCell = '<span style="color:#94a3b8;">\u2014</span>'; }

        html += '<tr style="background:'+(i%2===0?'#fff':'#f8fafc')+';border-bottom:1px solid #e2e8f0;">' +
          '<td style="padding:9px 12px;font-weight:700;color:#1e293b;white-space:nowrap;">'+t.name+'</td>' +
          '<td style="padding:9px 12px;font-size:11px;color:#64748b;">'+t.immat+'</td>' +
          '<td style="padding:9px 12px;font-size:11px;color:#0369a1;font-family:monospace;">'+cartes+'</td>' +
          '<td style="padding:9px 12px;text-align:right;color:#475569;">'+t.decls+'</td>' +
          '<td style="padding:9px 12px;text-align:right;font-weight:700;color:#0284c7;white-space:nowrap;">'+Math.round(t.daApp).toLocaleString('fr-DZ')+' DA</td>' +
          '<td style="padding:9px 12px;text-align:right;font-weight:700;color:#1e293b;white-space:nowrap;">'+(t.daReal?Math.round(t.daReal).toLocaleString('fr-DZ')+' DA':'—')+'</td>' +
          '<td style="padding:9px 12px;text-align:right;font-weight:700;white-space:nowrap;color:'+deltaCol+';">'+(t.daReal?(delta>0?'+':'')+Math.round(delta).toLocaleString('fr-DZ')+' DA':'—')+'</td>' +
          '<td style="padding:9px 12px;text-align:right;color:#64748b;white-space:nowrap;">'+(t.litresApp?Math.round(t.litresApp)+' L':'—')+'</td>' +
          '<td style="padding:9px 12px;text-align:right;color:#64748b;white-space:nowrap;">'+(t.litresReal?Math.round(t.litresReal)+' L':'—')+'</td>' +
          '<td style="padding:9px 12px;text-align:center;"><div style="display:flex;align-items:center;gap:5px;"><div style="width:40px;background:#e2e8f0;border-radius:4px;height:7px;overflow:hidden;"><div style="height:100%;background:#0284c7;width:'+share+'%;border-radius:4px;"></div></div><span style="font-size:11px;font-weight:700;color:#0284c7;min-width:28px;">'+share+'%</span></div></td>' +
          '<td style="padding:9px 12px;text-align:center;">'+(t.flagged?'<span style="background:#fee2e2;color:#ef4444;font-weight:700;border-radius:20px;padding:2px 8px;font-size:10px;">⚑ '+t.flagged+'</span>':'<span style="color:#94a3b8;">—</span>')+'</td>' +
          '<td style="padding:9px 12px;">'+locCell+'</td>' +
        '</tr>';
      });
      html += '</tbody></table></div>';

      var totDA = trucks.reduce(function(s,t){return s+t.daApp;},0);
      var totReal = trucks.reduce(function(s,t){return s+t.daReal;},0);
      html += '<div style="margin-top:14px;padding:12px 16px;background:#f0f9ff;border-radius:10px;border:1px solid #7dd3fc;display:flex;gap:20px;flex-wrap:wrap;">' +
        '<div><div style="font-size:20px;font-weight:900;color:#0284c7;">'+trucks.length+'</div><div style="font-size:11px;color:#0369a1;">Camions actifs</div></div>' +
        '<div><div style="font-size:20px;font-weight:900;color:#0284c7;">'+Math.round(totDA/1000)+'k DA</div><div style="font-size:11px;color:#0369a1;">DA total approuvé</div></div>' +
        '<div><div style="font-size:20px;font-weight:900;color:#16a34a;">'+Math.round(totReal/1000)+'k DA</div><div style="font-size:11px;color:#0369a1;">DA réel consommé</div></div>' +
        '<div><div style="font-size:20px;font-weight:900;color:#0284c7;">'+decls.length+'</div><div style="font-size:11px;color:#0369a1;">Déclarations total</div></div>' +
        '</div>';
      el.innerHTML = html;
      setTimeout(function(){if(window.ui)ui._naftalGeocodeTableLocations(el);},150);
    }).catch(function(e){el.innerHTML='<div style="color:#ef4444;padding:20px;">Erreur: '+e.message+'</div>';});
  }

    _naftalRenderCardStatsTable(el, data, period) {
    var days = period==='7d'?7:period==='3m'?90:period==='12m'?365:30;
    var fromDate = new Date(Date.now() - days*864e5).toISOString().slice(0,10);
    el.innerHTML = '<div style="text-align:center;padding:20px;color:#64748b;"><i class="fa-solid fa-spinner fa-spin"></i> Chargement...</div>';
    fetch('/api/naftal/declarations?from='+fromDate+'&limit=2000')
    .then(function(r){return r.json();})
    .then(function(decls) {
      var cardMap = {};
      decls.forEach(function(d) {
        (d.trucks||[]).forEach(function(t) {
          var carte = t.carteNaftal||'—';
          if (!cardMap[carte]) cardMap[carte] = {
            carte:carte, trucks:{}, decls:0,
            daApp:0, daReal:0, litresApp:0, litresReal:0, flagged:0,
            lastStation:'', lastLat:null, lastLng:null, lastRefillAt:null
          };
          var c = cardMap[carte];
          c.trucks[t.truckName||t.deviceId||'?'] = true;
          c.decls++;
          c.daApp += t.approvedAmountDA||0;
          c.daReal += t.actualRefillCostDA||0;
          c.litresApp += t.approvedLiters||0;
          c.litresReal += t.actualRefillLiters||0;
          if (t.refillStatus==='flagged'||t.isFlagged) c.flagged++;
          if (t.refillDetectedAt && (!c.lastRefillAt || new Date(t.refillDetectedAt)>new Date(c.lastRefillAt))) {
            c.lastRefillAt = t.refillDetectedAt;
            c.lastStation = t.refillStationName||'';
            c.lastLat = t.refillStationLat||null;
            c.lastLng = t.refillStationLng||null;
          }
        });
      });
      var cards = Object.values(cardMap).sort(function(a,b){return b.daApp-a.daApp;});
      if (!cards.length) { el.innerHTML='<div style="text-align:center;padding:30px;color:#64748b;">Aucune donnée de carte pour cette période</div>'; return; }
      var grandDA = cards.reduce(function(s,c){return s+c.daApp;},0);
      var tblId = 'cardTbl_'+Date.now();

      var filterBar = '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:10px;">' +
        '<input id="cardFilter" type="text" placeholder="🔍 Filtrer par carte / camion..." style="padding:7px 12px;border:1.5px solid #e2e8f0;border-radius:8px;font-size:12px;flex:1;min-width:180px;" oninput="ui._naftalFilterStatsTable(\''+tblId+'\',this.value)">' +
        '<button onclick="ui._naftalExportRows(ui._naftalGetTableRows(\''+tblId+'\'), \'NAFTAL_Cartes_'+period+'\')" style="padding:7px 14px;background:#16a34a;color:#fff;border:none;border-radius:8px;font-size:12px;font-weight:700;cursor:pointer;"><i class="fa-solid fa-file-excel"></i> Exporter Excel</button>' +
        '</div>';

      var th = 'style="padding:10px 12px;border-bottom:2px solid #e2e8f0;cursor:pointer;user-select:none;white-space:nowrap;background:#f8fafc;"';
      var mkTh = function(l,i,al){return '<th '+th+' onclick="ui._naftalSortTable(\''+tblId+'\','+i+')" '+(al?'style="'+th.slice(7,-1)+';text-align:'+al+';"':'')+'>' +l+'<span style="color:#94a3b8;font-size:9px;"> ⇅</span></th>';};
      var html = '<h4 style="margin:0 0 10px;color:#1e293b;font-size:14px;">💳 Suivi par Carte Naftal — Période: '+period+'</h4>' +
        '<p style="font-size:11px;color:#64748b;margin:0 0 10px;">Le suivi DA/L est consolidé sur la carte, indépendamment du camion.</p>' +
        filterBar +
        '<div style="overflow-x:auto;"><table id="'+tblId+'" class="nv5-table" style="width:100%;border-collapse:collapse;">' +
        '<thead><tr>' +
          mkTh('Carte Naftal',0) + mkTh('Camion(s)',1) +
          mkTh('Décl.',2,'right') + mkTh('DA Approuvé',3,'right') +
          mkTh('DA Réel',4,'right') + mkTh('Δ DA',5,'right') +
          mkTh('L Approuvés',6,'right') + mkTh('L Réels',7,'right') +
          mkTh('% Total',8,'center') + mkTh('Anomalies',9,'center') +
          mkTh('Dernier Lieu Ravitaillement',10) +
        '</tr></thead><tbody>';

      cards.forEach(function(c,i) {
        var share = grandDA>0?Math.round(c.daApp/grandDA*100):0;
        var delta = c.daReal - c.daApp;
        var deltaCol = delta>0?'#ef4444':delta<0?'#16a34a':'#64748b';
        var truckNames = Object.keys(c.trucks).join(', ');
        var multiTruck = Object.keys(c.trucks).length > 1;
        var locCell;
        if (c.lastLat && c.lastLng) {
          var gmUrl = 'https://www.google.com/maps?q='+c.lastLat+','+c.lastLng;
          var locLabel = (c.lastStation && c.lastStation !== 'Station Externe') ? c.lastStation : (c.lastLat.toFixed(4)+', '+c.lastLng.toFixed(4));
          locCell = '<a href="'+gmUrl+'" target="_blank" rel="noopener" data-lat="'+c.lastLat+'" data-lng="'+c.lastLng+'" title="GPS: '+c.lastLat.toFixed(6)+', '+c.lastLng.toFixed(6)+'" style="color:#0284c7;text-decoration:none;font-size:11px;display:flex;align-items:center;gap:4px;"><i class="fa-solid fa-location-dot" style="color:#ef4444;font-size:12px;"></i><span class="nv5-geo-label">'+locLabel+'</span></a>';
          if (c.lastRefillAt) locCell += '<div style="font-size:9px;color:#94a3b8;">'+new Date(c.lastRefillAt).toLocaleString('fr-DZ',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})+'</div>';
        } else { locCell = '<span style="color:#94a3b8;">\u2014</span>'; }

        html += '<tr style="background:'+(i%2===0?'#fff':'#f8fafc')+';border-bottom:1px solid #e2e8f0;">' +
          '<td style="padding:9px 12px;font-weight:900;color:#0369a1;font-family:monospace;font-size:13px;">'+c.carte+(multiTruck?'<div style="font-size:9px;color:#f59e0b;font-family:inherit;font-weight:700;">⚡ Multi-camions</div>':'')+'</td>' +
          '<td style="padding:9px 12px;font-size:11px;color:#475569;">'+truckNames+'</td>' +
          '<td style="padding:9px 12px;text-align:right;color:#475569;">'+c.decls+'</td>' +
          '<td style="padding:9px 12px;text-align:right;font-weight:700;color:#0284c7;white-space:nowrap;">'+Math.round(c.daApp).toLocaleString('fr-DZ')+' DA</td>' +
          '<td style="padding:9px 12px;text-align:right;font-weight:700;color:#1e293b;white-space:nowrap;">'+(c.daReal?Math.round(c.daReal).toLocaleString('fr-DZ')+' DA':'—')+'</td>' +
          '<td style="padding:9px 12px;text-align:right;font-weight:700;white-space:nowrap;color:'+deltaCol+';">'+(c.daReal?(delta>0?'+':'')+Math.round(delta).toLocaleString('fr-DZ')+' DA':'—')+'</td>' +
          '<td style="padding:9px 12px;text-align:right;color:#64748b;white-space:nowrap;">'+(c.litresApp?Math.round(c.litresApp)+' L':'—')+'</td>' +
          '<td style="padding:9px 12px;text-align:right;color:#64748b;white-space:nowrap;">'+(c.litresReal?Math.round(c.litresReal)+' L':'—')+'</td>' +
          '<td style="padding:9px 12px;text-align:center;"><div style="display:flex;align-items:center;gap:5px;"><div style="width:40px;background:#e2e8f0;border-radius:4px;height:7px;overflow:hidden;"><div style="height:100%;background:#0369a1;width:'+share+'%;border-radius:4px;"></div></div><span style="font-size:11px;font-weight:700;color:#0369a1;min-width:28px;">'+share+'%</span></div></td>' +
          '<td style="padding:9px 12px;text-align:center;">'+(c.flagged?'<span style="background:#fee2e2;color:#ef4444;font-weight:700;border-radius:20px;padding:2px 8px;font-size:10px;">⚑ '+c.flagged+'</span>':'<span style="color:#94a3b8;">—</span>')+'</td>' +
          '<td style="padding:9px 12px;">'+locCell+'</td>' +
        '</tr>';
      });
      html += '</tbody></table></div>';
      var totDA = cards.reduce(function(s,c){return s+c.daApp;},0);
      var totReal = cards.reduce(function(s,c){return s+c.daReal;},0);
      html += '<div style="margin-top:14px;padding:12px 16px;background:#eff6ff;border-radius:10px;border:1px solid #bfdbfe;display:flex;gap:20px;flex-wrap:wrap;">' +
        '<div><div style="font-size:20px;font-weight:900;color:#0369a1;">'+cards.length+'</div><div style="font-size:11px;color:#1d4ed8;">Cartes actives</div></div>' +
        '<div><div style="font-size:20px;font-weight:900;color:#0369a1;">'+Math.round(totDA/1000)+'k DA</div><div style="font-size:11px;color:#1d4ed8;">DA total approuvé</div></div>' +
        '<div><div style="font-size:20px;font-weight:900;color:#16a34a;">'+Math.round(totReal/1000)+'k DA</div><div style="font-size:11px;color:#1d4ed8;">DA réel consommé</div></div>' +
        '<div><div style="font-size:20px;font-weight:900;color:#0369a1;">'+cards.filter(function(c){return Object.keys(c.trucks).length>1;}).length+'</div><div style="font-size:11px;color:#1d4ed8;">Cartes multi-camions</div></div>' +
        '</div>';
      el.innerHTML = html;
      setTimeout(function(){if(window.ui)ui._naftalGeocodeTableLocations(el);},150);
    }).catch(function(e){el.innerHTML='<div style="color:#ef4444;padding:20px;">Erreur: '+e.message+'</div>';});
  }

    async _naftalGeocodeTableLocations(container) {
    // Reverse-geocode all [data-lat][data-lng] links in the container via Geoapify
    var links = (container||document).querySelectorAll('a[data-lat][data-lng]');
    if (!links.length) return;
    var keys = (typeof FLEET_CONFIG!=='undefined' && FLEET_CONFIG.GEOAPIFY_API_KEYS) || [];
    var apiKey = keys[0] || null;
    if (!apiKey) return; // no key, keep raw coords
    var cache = this._geoCache || (this._geoCache = {});
    var delay = 0;
    links.forEach((link) => {
      var lat = parseFloat(link.dataset.lat);
      var lng = parseFloat(link.dataset.lng);
      if (!lat || !lng) return;
      var ckey = lat.toFixed(3)+'_'+lng.toFixed(3);
      var span = link.querySelector('.nv5-geo-label');
      if (!span) return;
      if (cache[ckey]) { span.textContent = cache[ckey]; return; }
      // Throttle: 200ms per request
      delay += 220;
      setTimeout(() => {
        fetch('https://api.geoapify.com/v1/geocode/reverse?lat='+lat+'&lon='+lng+'&lang=fr&apiKey='+apiKey)
          .then(r => r.json())
          .then(d => {
            var props = d.features && d.features[0] && d.features[0].properties;
            if (!props) return;
            var city = props.city || props.county || props.state || '';
            var street = props.street || props.name || '';
            var label = street ? (street+(city?', '+city:'')) : (city || props.formatted || '');
            if (!label) label = props.formatted || '';
            if (label) {
              cache[ckey] = label;
              span.textContent = label;
              link.title = 'GPS: '+lat.toFixed(6)+', '+lng.toFixed(6)+' — '+label;
            }
          })
          .catch(() => {}); // keep raw coords on error
      }, delay);
    });
  }

  _naftalFilterStatsTable(tblId, query) {
    var tbl = document.getElementById(tblId);
    if (!tbl) return;
    var q = query.toLowerCase();
    Array.from(tbl.querySelectorAll('tbody tr')).forEach(function(row) {
      var text = row.textContent.toLowerCase();
      row.style.display = q && !text.includes(q) ? 'none' : '';
    });
  }

  _naftalGetTableRows(tblId) {
    var tbl = document.getElementById(tblId);
    if (!tbl) return [];
    return Array.from(tbl.querySelectorAll('tr')).map(function(r) {
      return Array.from(r.querySelectorAll('th,td')).map(function(c) {
        // Get text content, fall back to title attr for links
        var a = c.querySelector('a');
        return a ? (a.title||a.textContent||'').trim() : c.textContent.trim();
      });
    }).filter(function(r){return r.some(function(c){return c;});});
  }

    _naftalRenderCharts(data) {
    if (typeof Chart === 'undefined') return;
    Chart.defaults.font.family = 'inherit';
    Chart.defaults.font.size = 11;

    // 1. Daily bar chart
    var dailyData = data.byDay || [];
    var labels = dailyData.map(function(d){return d.date.slice(5);});
    var daCounts = dailyData.map(function(d){return d.count||0;});
    var daApproved = dailyData.map(function(d){return Math.round((d.DAapproved||0)/1000);});
    var c1 = document.getElementById('ch_daily');
    if (c1 && !c1._chart) {
      c1._chart = new Chart(c1.getContext('2d'), {
        data: { labels: labels, datasets: [
          {type:'bar', label:'Nb Déclarations', data:daCounts, backgroundColor:'rgba(2,132,199,0.35)', borderColor:'#0284c7', borderWidth:1.5, yAxisID:'y', order:2},
          {type:'line', label:'DA Approuvé (milliers)', data:daApproved, borderColor:'#16a34a', backgroundColor:'rgba(22,163,74,0.08)', tension:0.4, pointRadius:3, pointHoverRadius:5, yAxisID:'y2', order:1}
        ]},
        options: {
          responsive:true, interaction:{mode:'index', intersect:false},
          plugins:{ legend:{ display:true, position:'top', labels:{usePointStyle:true, padding:16, font:{size:11}} },
            tooltip:{ callbacks:{ label:function(ctx){ return ctx.dataset.label+': '+(ctx.datasetIndex===0?ctx.raw:ctx.raw+'k DA'); } } } },
          scales:{y:{beginAtZero:true,position:'left',title:{display:true,text:'Déclarations',color:'#0284c7'},grid:{color:'#f1f5f9'}},y2:{beginAtZero:true,position:'right',title:{display:true,text:'DA (milliers)',color:'#16a34a'},grid:{drawOnChartArea:false}}}
        }
      });
    }

    // 2. Status donut
    var statusMap = {'transport_validated':'Att. gest.','gestionnaire_validated':'Approuvés','in_progress':'En cours','completed':'Terminés','cancelled':'Annulés'};
    var statusColors = ['#f59e0b','#16a34a','#0284c7','#6d28d9','#dc2626'];
    var byStatus = data.byStatus || {};
    var statusLabels = Object.keys(byStatus).map(function(k){return statusMap[k]||k;});
    var statusVals = Object.values(byStatus);
    var c2 = document.getElementById('ch_status');
    if (c2 && statusLabels.length && !c2._chart) {
      c2._chart = new Chart(c2.getContext('2d'), {
        type:'doughnut',
        data:{labels:statusLabels,datasets:[{data:statusVals,backgroundColor:statusColors.slice(0,statusVals.length),borderWidth:2,borderColor:'#fff'}]},
        options:{responsive:true,maintainAspectRatio:true,plugins:{legend:{position:'bottom',labels:{boxWidth:14,padding:12,font:{size:11},generateLabels:function(chart){var ds=chart.data.datasets[0]||{};var vals=ds.data||[];var bgColors=ds.backgroundColor||[];return (chart.data.labels||[]).map(function(lbl,i){return{text:(lbl||'?')+' ('+( vals[i]!==undefined?vals[i]:0)+')',fillStyle:bgColors[i]||'#ccc',strokeStyle:'#fff',lineWidth:1,index:i,datasetIndex:0,hidden:false};});}}},tooltip:{callbacks:{label:function(ctx){var tot=(ctx.dataset.data||[]).reduce(function(a,b){return a+(b||0);},0);return (ctx.label||'?')+': '+(ctx.raw||0)+' d\u00e9claration(s) ('+Math.round((ctx.raw||0)/(tot||1)*100)+'%)';}}}}}
      });
    }

    // 3. DA comparison line
    var daComp = data.byDay || [];
    var c3 = document.getElementById('ch_dacomp');
    if (c3 && !c3._chart) {
      c3._chart = new Chart(c3.getContext('2d'), {
        type:'line',
        data:{labels:daComp.map(function(d){return d.date.slice(5);}),
          datasets:[
            {label:'DA Approuvé',data:daComp.map(function(d){return Math.round((d.DAapproved||0)/1000);}),borderColor:'#0284c7',tension:0.4,pointRadius:2,fill:false},
            {label:'DA Réel',data:daComp.map(function(d){return Math.round((d.DAactual||0)/1000);}),borderColor:'#16a34a',tension:0.4,pointRadius:2,fill:false}
          ]
        },
        options:{responsive:true,interaction:{mode:'index',intersect:false},scales:{y:{beginAtZero:true,title:{display:true,text:'DA (milliers DA)',color:'#1e293b'},grid:{color:'#f1f5f9'}}},plugins:{legend:{display:true,position:'top',labels:{usePointStyle:true,padding:14,font:{size:11}}},tooltip:{callbacks:{label:function(ctx){return ctx.dataset.label+': '+ctx.raw+'k DA';}}}}}
      });
    }

    // 4. Top trucks bar
    var topT = data.topTrucks || [];
    var c4 = document.getElementById('ch_trucks');
    if (c4 && topT.length && !c4._chart) {
      c4._chart = new Chart(c4.getContext('2d'), {
        type:'bar',
        data:{labels:topT.map(function(t){return t.name;}),
          datasets:[{label:'DA total',data:topT.map(function(t){return Math.round((t.totalDA||0)/1000);}),backgroundColor:'rgba(139,92,246,0.7)',borderColor:'#6d28d9',borderWidth:1.5}]},
        options:{indexAxis:'y',responsive:true,scales:{x:{beginAtZero:true,title:{display:true,text:'DA Total (milliers)',color:'#6d28d9'},grid:{color:'#f5f3ff'}}},plugins:{legend:{display:true,position:'top',labels:{usePointStyle:true,font:{size:11}}},tooltip:{callbacks:{label:function(ctx){return 'DA total: '+Math.round(ctx.raw)+'k DA';}}}}}
      });
    }

    // 5. Top destinations
    var topD = data.topDest || [];
    var c5 = document.getElementById('ch_dests');
    if (c5 && topD.length && !c5._chart) {
      c5._chart = new Chart(c5.getContext('2d'), {
        type:'bar',
        data:{labels:topD.map(function(d){return d.name;}),
          datasets:[{label:'Déclarations',data:topD.map(function(d){return d.count;}),backgroundColor:'rgba(245,158,11,0.7)',borderColor:'#f59e0b',borderWidth:1.5}]},
        options:{indexAxis:'y',responsive:true,scales:{x:{beginAtZero:true,title:{display:true,text:'Nombre de déclarations'},grid:{color:'#fff7ed'}}},plugins:{legend:{display:true,position:'top',labels:{usePointStyle:true,font:{size:11}}},tooltip:{callbacks:{label:function(ctx){return 'Déclarations: '+ctx.raw;}}}}}
      });
    }
  }

  // ── EXPORT ─────────────────────────────────────────────────────────────────

  async naftalExportCSV(queryStr) {
    var fname = 'NAFTAL_Export_'+new Date().toISOString().slice(0,10);
    var self = this;
    var params = new URLSearchParams(queryStr||'');
    params.set('limit','5000');
    [['status','ghf_status'],['status','hf_status'],['isSignaled','ghf_signal'],['isSignaled','hf_signal'],
     ['truckName','ghf_truck'],['truckName','hf_truck'],['from','ghf_from'],['from','hf_from'],
     ['to','ghf_to'],['to','hf_to']].forEach(function(p){
      var el=document.getElementById(p[1]);
      if(el&&el.value&&!params.has(p[0]))params.set(p[0],el.value);
    });
    try {
      var r = await fetch('/api/naftal/declarations?'+params.toString());
      if (!r.ok) throw new Error('HTTP '+r.status);
      var decls = await r.json();
      if (!decls.length) { await ui_showAlert('Aucune d\u00e9claration \u00e0 exporter.','Export','📋'); return; }
      var headers = ['Date','D\u00e9claration ID','Statut','Camion','Immatriculation','Carte Naftal',
        'Position D\u00e9part','It\u00e9raire Complet','DA Approuv\u00e9','DA R\u00e9el','Statut Refill','Signal\u00e9'];
      var rows = [headers];
      var sMap = {transport_validated:'Att. gestionnaire',gestionnaire_validated:'Approuv\u00e9',
        in_progress:'En cours',completed:'Termin\u00e9',cancelled:'Annul\u00e9'};
      var rMap = {waiting:'En attente',in_progress:'En cours',completed:'Compl\u00e9t\u00e9',flagged:'Anomalie'};
      decls.forEach(function(d) {
        (d.trucks||[]).forEach(function(t) {
          var stops=(t.extraStops||[]).filter(function(s){return s.name;});
          var itin=stops.map(function(s){return s.name;}).join(' > ');
          if(t.destination)itin=(itin?itin+' > ':'')+t.destination;
          rows.push([
            new Date(d.createdAt).toLocaleString('fr-DZ'),
            d.declarationId||'', sMap[d.status]||d.status,
            t.truckName||t.deviceId||'', t.immatriculation||'', t.carteNaftal||'',
            t.currentLocation||'', itin,
            t.approvedAmountDA||0, t.actualRefillCostDA||0,
            rMap[t.refillStatus]||'', d.isSignaled?'Oui':'Non'
          ]);
        });
      });
      self._naftalExportRows(rows, fname);
    } catch(e) { await ui_showAlert('Erreur export: '+e.message,'Erreur','❌'); }
  }

  _naftalExportRows(rows, fname) {
    var self = this;
    var doExport = function() {
      try {
        var wb = XLSX.utils.book_new();
        var ws = XLSX.utils.aoa_to_sheet(rows);
        var colW = (rows[0]||[]).map(function(h,ci){
          var mx = String(h||'').length;
          rows.forEach(function(r){if(r[ci]!==undefined)mx=Math.max(mx,String(r[ci]).length);});
          return {wch:Math.min(Math.max(mx+2,10),45)};
        });
        ws['!cols'] = colW;
        ws['!freeze'] = {xSplit:0,ySplit:1};
        XLSX.utils.book_append_sheet(wb, ws, 'NAFTAL');
        XLSX.writeFile(wb, fname+'.xlsx');
      } catch(e2){console.error('XLSX:',e2);}
    };
    if (typeof XLSX !== 'undefined') { doExport(); return; }
    var s = document.createElement('script');
    s.src = 'https://cdn.sheetjs.com/xlsx-latest/package/dist/xlsx.full.min.js';
    s.onload = doExport;
    s.onerror = function() {
      var csv=rows.map(function(r){return r.map(function(c){return '"'+String(c||'').replace(/"/g,'""')+'"';}).join(';');}).join('\r\n');
      var blob=new Blob(['\uFEFF'+csv],{type:'text/csv;charset=utf-8;'});
      var a=document.createElement('a');a.href=URL.createObjectURL(blob);
      a.download=fname+'.csv';document.body.appendChild(a);a.click();
      setTimeout(function(){document.body.removeChild(a);},500);
    };
    document.head.appendChild(s);
  }

  _naftalDownloadExcel(csvText, fname) {
    var self = this;
    if (typeof XLSX !== 'undefined') { self._xlsxFromCSV(csvText, fname); return; }
    var s = document.createElement('script');
    s.src = 'https://cdn.sheetjs.com/xlsx-latest/package/dist/xlsx.full.min.js';
    s.onload = function() { self._xlsxFromCSV(csvText, fname); };
    s.onerror = function() {
      var blob=new Blob(['\uFEFF'+csvText],{type:'text/csv;charset=utf-8;'});
      var a=document.createElement('a');a.href=URL.createObjectURL(blob);
      a.download=fname+'.csv';document.body.appendChild(a);a.click();
      setTimeout(function(){document.body.removeChild(a);},500);
    };
    document.head.appendChild(s);
  }

  _xlsxFromCSV(csvText, fname) {
    try {
      var wb=XLSX.read(csvText,{type:'string',FS:';'});
      var ws=wb.Sheets[wb.SheetNames[0]];
      var ref=XLSX.utils.decode_range(ws['!ref']||'A1');
      var colWidths=[];
      for(var c=ref.s.c;c<=ref.e.c;c++){
        var max=8;
        for(var row=ref.s.r;row<=ref.e.r;row++){
          var cell=ws[XLSX.utils.encode_cell({r:row,c:c})];
          if(cell&&cell.v)max=Math.max(max,String(cell.v).length);
        }
        colWidths.push({wch:Math.min(max+2,40)});
      }
      ws['!cols']=colWidths;
      XLSX.writeFile(wb,fname+'.xlsx');
    } catch(e){console.error('XLSX error:',e);}
  }

  _naftalDownloadExcelFromRows(rows, fname) {
    this._naftalExportRows(rows, fname);
  }



  goToPlanning(truckId) {
    this.switchTab('routing');
    this.naftalSelectedTrucks.add(truckId);
    this.renderNaftalSystem();
  }

  openZoneManagementModal(activeTab) {
    document.getElementById('zoneManagementModal')?.remove();
    
    // ── DATA ──
    let locs = FLEET_CONFIG.CUSTOM_LOCATIONS || [];
    let clients = FLEET_CONFIG.CLIENTS || [];
    const allT = (typeof app !== 'undefined' && app.trucks) ? [...app.trucks.values()] : [];
    const R = 6371000;
    function inZone(zone, t) {
      const c = t && t.coordinates; if(!c||!zone.lat||!zone.lng) return false;
      const dLa=(c.lat-zone.lat)*Math.PI/180, dLo=(c.lng-zone.lng)*Math.PI/180;
      const a=Math.sin(dLa/2)**2+Math.cos(zone.lat*Math.PI/180)*Math.cos(c.lat*Math.PI/180)*Math.sin(dLo/2)**2;
      return R*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a))<=(zone.radius||500);
    }

    // ── Auto-migrate old CLIENTS into CUSTOM_LOCATIONS ──
    let needsSave = false;
    clients.forEach(cl => {
      let cSite = locs.find(l => l.type === 'client' && (l.clientId === cl.id || l.name === cl.name));
      if (!cSite) {
        cSite = { id: 'zone_' + Date.now() + '_' + Math.floor(Math.random()*9999), name: cl.name, type: 'client', clientId: cl.id, color: cl.color || '#3b82f6', lat: 0, lng: 0, radius: 100 };
        locs.push(cSite);
        needsSave = true;
      } else if (!cSite.clientId) { cSite.clientId = cl.id; needsSave = true; }
      (cl.finalClients || []).forEach(fc => {
        let fcSite = locs.find(l => l.type === 'final_client' && (l.finalClientId === fc.id || (l.clientId === cl.id && l.name === fc.name)));
        if (!fcSite) {
          locs.push({ id: 'zone_fc_' + Date.now() + '_' + Math.floor(Math.random()*9999), name: fc.name, type: 'final_client', clientId: cl.id, finalClientId: fc.id, color: cl.color || '#3b82f6', lat: fc.lat || 0, lng: fc.lng || 0, radius: fc.radius || 500 });
          needsSave = true;
        }
      });
    });
    if (needsSave) { FLEET_CONFIG.CUSTOM_LOCATIONS = locs; if(typeof this.saveSettingsToCloud === 'function') this.saveSettingsToCloud(); }

    // ── TYPE CONFIG ──
    const TC = {
      douroub:     {icon:'fa-star',     color:'#f59e0b', label:'Si\u00e8ge / HQ'},
      client:      {icon:'fa-building', color:'#3b82f6', label:'Client'},
      final_client:{icon:'fa-user-tie', color:'#8b5cf6', label:'Client Final'},
      maintenance: {icon:'fa-wrench',   color:'#f97316', label:'Maintenance'},
      station:     {icon:'fa-gas-pump', color:'#eab308', label:'Station/Repos'},
      other:       {icon:'fa-map-pin',  color:'#6b7280', label:'Autre'}
    };
    const fldS = 'width:100%;background:var(--bg-elevated,var(--bg-elevated, #1e293b));border:1px solid var(--border,var(--border, rgba(255,255,255,0.1)));border-radius:8px;padding:10px 12px;color:var(--text-primary,var(--text-primary, #e2e8f0));font-size:13px;box-sizing:border-box;outline:none;';
    const lblS = 'font-size:10px;font-weight:800;color:var(--text-muted,#888);text-transform:uppercase;display:block;margin-bottom:5px;';

    // ── HELPER: site card ──
    const siteCard = (loc, i) => {
      const tc = TC[loc.type]||TC.other;
      // Color priority: zone.color → client.color → type fallback
      let col = loc.color || tc.color;
      if (!loc.color && loc.clientId) {
        const _cl = clients.find(c => c.id === loc.clientId);
        if (_cl && _cl.color) col = _cl.color;
        if (loc.finalClientId && _cl && _cl.finalClients) {
          const _fc = _cl.finalClients.find(f => f.id === loc.finalClientId);
          if (_fc && _fc.color) col = _fc.color;
        }
      }
      const here = allT.filter(t=>inZone(loc,t)).length;
      const hasGPS = loc.lat && loc.lng && loc.lat !== 0 && loc.lng !== 0;
      const coordTxt = hasGPS ? Number(loc.lat).toFixed(4)+', '+Number(loc.lng).toFixed(4) : '<span style="color:#f87171;">\u26a0\ufe0f GPS manquant</span>';
      const flyJs = hasGPS ? "ui._goToZoneMap("+loc.lat+","+loc.lng+",'"+loc.name.replace(/'/g,"\\'")+"',"+(loc.radius||0)+")" : "";
      return '<div class="zm-site-card" data-search="'+loc.name.toLowerCase()+' '+tc.label.toLowerCase()+' '+(loc.wilaya||'').toLowerCase()+'" style="display:flex;align-items:center;gap:10px;padding:10px 12px;background:var(--bg-elevated,rgba(255,255,255,0.02));border:1px solid var(--border,rgba(255,255,255,0.07));border-left:3px solid '+col+';border-radius:10px;margin-bottom:6px;transition:all 0.15s;" onmouseover="this.style.background=\'var(--border, rgba(255,255,255,0.05))\';this.style.boxShadow=\'0 2px 12px rgba(0,0,0,0.2)\'" onmouseout="this.style.background=\'var(--bg-elevated,rgba(255,255,255,0.02))\';this.style.boxShadow=\'none\'">' +
        '<div style="width:32px;height:32px;border-radius:8px;background:'+col+';display:flex;align-items:center;justify-content:center;flex-shrink:0;box-shadow:0 2px 8px '+col+'66;">' + (loc.iconEmoji ? '<span style="font-size:16px;">'+loc.iconEmoji+'</span>' : '<i class="fa-solid '+(loc.icon||tc.icon)+'" style="color:#ffffff;font-size:14px;"></i>') + '</div>' +
        '<div style="flex:1;min-width:0;">' +
          '<div style="font-weight:700;font-size:12px;color:var(--text-primary,var(--text-primary, #e2e8f0));white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">'+loc.name+'</div>' +
          '<div style="font-size:10px;color:var(--text-muted,#888);margin-top:2px;display:flex;gap:6px;flex-wrap:wrap;align-items:center;">' +
            '<span style="background:'+col+'15;color:'+col+';padding:1px 6px;border-radius:6px;font-weight:700;font-size:9px;">'+tc.label+'</span>' +
            (loc.wilaya?'<span>'+loc.wilaya+'</span>':'') +
            '<span style="font-family:monospace;font-size:9px;opacity:0.6;">'+coordTxt+'</span>' +
          '</div>' +
        '</div>' +
        (here?'<span style="background:rgba(34,197,94,0.12);color:#22c55e;padding:2px 7px;border-radius:8px;font-size:10px;font-weight:700;flex-shrink:0;"><i class="fa-solid fa-truck" style="font-size:8px;margin-right:3px;"></i>'+here+'</span>':'') +
        '<div style="display:flex;gap:4px;flex-shrink:0;">' +
          (flyJs?'<button onclick="'+flyJs+'" title="Carte" style="background:rgba(56,189,248,0.08);border:1px solid rgba(56,189,248,0.2);color:#38bdf8;border-radius:6px;width:26px;height:26px;cursor:pointer;font-size:10px;"><i class="fa-solid fa-crosshairs"></i></button>':'') +
          '<button onclick="ui.openZoneClientModal('+i+')" title="Modifier" style="background:rgba(99,102,241,0.08);border:1px solid rgba(99,102,241,0.2);color:#818cf8;border-radius:6px;width:26px;height:26px;cursor:pointer;font-size:10px;"><i class="fa-solid fa-pen"></i></button>' +
          '<button onclick="if(confirm(\'Supprimer ce site ?\')){{FLEET_CONFIG.CUSTOM_LOCATIONS.splice('+i+',1);ui.saveSettingsToCloud();ui.openZoneManagementModal(\'sites\');}}" title="Supprimer" style="background:rgba(239,68,68,0.06);border:1px solid rgba(239,68,68,0.15);color:#f87171;border-radius:6px;width:26px;height:26px;cursor:pointer;font-size:10px;"><i class="fa-solid fa-trash"></i></button>' +
        '</div>' +
      '</div>';
    };

        // ── BUILD TREE VIEW (NEW HIERARCHICAL STRUCTURE) ──
    let treeHtml = '';

    // Search bar & Header Buttons
    treeHtml += '<div style="position:sticky;top:0;background:var(--bg-surface,#1e293b);z-index:10;padding-bottom:15px;display:flex;flex-direction:column;gap:12px;">' +
      '<div style="display:flex;gap:10px;">' +
        '<button onclick="ui.openClientEditorModal(null)" style="flex:1;background:linear-gradient(135deg,#4f46e5,#3730a3);color:white;border:none;border-radius:12px;padding:12px;font-weight:900;font-size:14px;cursor:pointer;box-shadow:0 4px 14px rgba(79,70,229,0.4);display:flex;align-items:center;justify-content:center;gap:8px;"><i class="fa-solid fa-building" style="font-size:18px;"></i>NOUVEAU CLIENT</button>' +
        '<button onclick="ui.openZoneClientModal(null)" style="flex:1;background:linear-gradient(135deg,#2563eb,#1d4ed8);color:white;border:none;border-radius:12px;padding:12px;font-weight:900;font-size:14px;cursor:pointer;box-shadow:0 4px 14px rgba(37,99,235,0.4);display:flex;align-items:center;justify-content:center;gap:8px;"><i class="fa-solid fa-location-dot" style="font-size:18px;"></i>NOUVEAU SITE</button>' +
      '</div>' +
      '<input type="text" placeholder="\uD83D\uDD0D Rechercher un site ou un client..." oninput="const v=this.value.toLowerCase();document.querySelectorAll(\'.zm-site-card,.zm-tree-group,.zm-client-card,.zm-fc-card\').forEach(el=>{const s=el.getAttribute(\'data-search\')||\'\';el.style.display=!v||s.includes(v)?\'\' :\'none\'});" style="width:100%;background:var(--bg-elevated,rgba(255,255,255,0.04));border:1px solid var(--border,rgba(255,255,255,0.08));border-radius:10px;padding:12px 14px;color:var(--text-primary,white);font-size:14px;outline:none;box-sizing:border-box;">' +
    '</div>';

    if (!locs.length && !clients.length) {
      treeHtml += '<div style="text-align:center;padding:50px;color:var(--text-muted,#888);"><div style="font-size:38px;margin-bottom:12px;">📍</div><div style="font-weight:700;font-size:15px;color:var(--text-primary,var(--text-primary, #e2e8f0));">Aucun site ni client</div><div style="margin-top:8px;font-size:12px;">Utilisez les boutons en haut pour commencer.</div></div>';
    } else {
      
      const orphanedLocs = [...locs]; // Track unplaced locations

      // Render Clients & Their Hierarchy
      clients.forEach((client, clientIdx) => {
        const clientCol = client.color || '#3b82f6';
        
        // Find sites belonging to this client directly
        const directSites = locs.filter(l => l.clientId === client.id && !l.finalClientId);
        directSites.forEach(s => {
          const idx = orphanedLocs.indexOf(s);
          if (idx !== -1) orphanedLocs.splice(idx, 1);
        });

        // Client Header Card
        treeHtml += '<div class="zm-tree-group" data-search="'+client.name.toLowerCase()+' client" style="margin-bottom:14px;background:var(--bg-elevated,rgba(255,255,255,0.02));border:1px solid var(--border,var(--border, rgba(255,255,255,0.05)));border-radius:12px;overflow:hidden;box-shadow:0 4px 15px rgba(0,0,0,0.05);transition:box-shadow 0.2s;" onmouseover="this.style.boxShadow=\'0 6px 20px rgba(0,0,0,0.1)\'" onmouseout="this.style.boxShadow=\'0 4px 15px rgba(0,0,0,0.05)\'">';
        
        treeHtml += '<div class="zm-client-card" style="display:flex;align-items:center;gap:12px;padding:12px 14px;border-bottom:1px solid var(--border,rgba(255,255,255,0.05));background:linear-gradient(90deg, '+clientCol+'20 0%, transparent 100%); border-left:4px solid '+clientCol+';">' +
          '<div style="width:36px;height:36px;border-radius:10px;background:'+clientCol+';display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px '+clientCol+'60;flex-shrink:0;">' +
            (client.iconEmoji ? '<span style="font-size:18px;">'+client.iconEmoji+'</span>' : '<i class="fa-solid '+(client.icon||'fa-building')+'" style="color:white;font-size:16px;"></i>') +
          '</div>' +
          '<div style="flex:1;min-width:0;">' +
            '<div style="font-weight:800;font-size:14px;color:var(--text-primary,var(--text-primary, #e2e8f0));white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">'+client.name+'</div>' +
            '<div style="font-size:10px;font-weight:600;color:var(--text-muted,#888);margin-top:2px;">'+(client.industry||'Client')+' &bull; '+(client.finalClients?.length||0)+' Sous-clients &bull; '+directSites.length+' Sites</div>' +
          '</div>' +
          '<div style="display:flex;gap:4px;flex-shrink:0;">' +
            '<button onclick="ui.openClientEditorModal('+clientIdx+')" style="background:var(--bg-elevated,var(--border, rgba(255,255,255,0.05)));border:1px solid var(--border,var(--border, rgba(255,255,255,0.1)));color:var(--text-muted,var(--text-muted, #94a3b8));border-radius:8px;width:30px;height:30px;cursor:pointer;transition:all 0.2s;display:flex;align-items:center;justify-content:center;" onmouseover="this.style.color=\'white\';this.style.background=\''+clientCol+'\';this.style.borderColor=\''+clientCol+'\'" onmouseout="this.style.color=\'var(--text-muted, #94a3b8)\';this.style.background=\'var(--bg-elevated,rgba(255,255,255,0.05))\';this.style.borderColor=\'var(--border, rgba(255,255,255,0.1))\'"><i class="fa-solid fa-pencil"></i></button>' +
            '<button onclick="if(confirm(\'Supprimer ce client ?\')) { ui._deleteClientEditor('+clientIdx+'); }" style="background:var(--bg-elevated,var(--border, rgba(255,255,255,0.05)));border:1px solid var(--border,var(--border, rgba(255,255,255,0.1)));color:var(--text-muted,var(--text-muted, #94a3b8));border-radius:8px;width:30px;height:30px;cursor:pointer;transition:all 0.2s;display:flex;align-items:center;justify-content:center;" onmouseover="this.style.color=\'white\';this.style.background=\'#ef4444\';this.style.borderColor=\'#ef4444\'" onmouseout="this.style.color=\'var(--text-muted, #94a3b8)\';this.style.background=\'var(--bg-elevated,rgba(255,255,255,0.05))\';this.style.borderColor=\'var(--border, rgba(255,255,255,0.1))\'"><i class="fa-solid fa-trash"></i></button>' +
          '</div>' +
        '</div>';

        // Direct Sites
        if (directSites.length) {
          treeHtml += '<div style="padding:10px;display:flex;flex-direction:column;gap:6px;">';
          directSites.forEach(s => { treeHtml += siteCard(s, locs.indexOf(s)); });
          treeHtml += '</div>';
        }

        // Final Clients
        if (client.finalClients && client.finalClients.length) {
          treeHtml += '<div style="padding:0 10px 10px 10px;display:flex;flex-direction:column;gap:8px;">';
          client.finalClients.forEach((fc, fcIdx) => {
            const fcCol = fc.color || clientCol;
            const fcSites = locs.filter(l => l.clientId === client.id && l.finalClientId === fc.id);
            fcSites.forEach(s => {
              const idx = orphanedLocs.indexOf(s);
              if (idx !== -1) orphanedLocs.splice(idx, 1);
            });

            treeHtml += '<div class="zm-fc-card" data-search="'+fc.name.toLowerCase()+'" style="border:1px solid var(--border,var(--bg-elevated, rgba(255,255,255,0.04)));border-radius:10px;background:var(--bg-surface,rgba(0,0,0,0.1));padding:10px;margin-left:14px;border-left:2px solid '+fcCol+'60;">' +
              '<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">' +
                '<i class="fa-solid fa-diagram-project" style="color:'+fcCol+';font-size:12px;"></i>' +
                '<div style="flex:1;font-weight:700;font-size:12px;color:var(--text-primary,var(--text-primary, #e2e8f0));">'+fc.name+'</div>' +
                '<div style="font-size:10px;color:var(--text-muted,#888);">'+fcSites.length+' Sites</div>' +
              '</div>';
              
            if (fcSites.length) {
              treeHtml += '<div style="display:flex;flex-direction:column;gap:6px;margin-left:8px;">';
              fcSites.forEach(s => { treeHtml += siteCard(s, locs.indexOf(s)); });
              treeHtml += '</div>';
            } else {
               treeHtml += '<div style="margin-left:8px;font-size:10px;color:var(--text-muted,var(--text-muted, #64748b));font-style:italic;">Aucun site rattaché</div>';
            }
            treeHtml += '</div>';
          });
          treeHtml += '</div>';
        }

        treeHtml += '</div>'; // End Client Group
      });

      // Render remaining orphaned sites
      if (orphanedLocs.length) {
        const renderSection = (title, icon, color, sites, type) => {
          if (!sites.length) return '';
          let s = '<div class="zm-tree-group" data-search="'+type+'" style="margin-bottom:14px;">' +
            '<div style="font-size:10px;font-weight:800;color:'+color+';text-transform:uppercase;margin-bottom:6px;padding-bottom:4px;border-bottom:1px solid '+color+'20;display:flex;align-items:center;gap:6px;">' +
              '<i class="fa-solid '+icon+'" style="font-size:11px;"></i>' + title + ' ('+sites.length+')' +
            '</div>';
          sites.forEach(loc => { s += siteCard(loc, locs.indexOf(loc)); });
          s += '</div>';
          return s;
        };

        const hqSites = orphanedLocs.filter(l => l.type === 'douroub');
        const maintenanceSites = orphanedLocs.filter(l => l.type === 'maintenance');
        const stationSites = orphanedLocs.filter(l => l.type === 'station');
        const legacyClientSites = orphanedLocs.filter(l => l.type === 'client');
        const legacyFCSites = orphanedLocs.filter(l => l.type === 'final_client');
        const otherSites = orphanedLocs.filter(l => l.type === 'other');
        
        treeHtml += renderSection('Siège / HQ', 'fa-star', '#f59e0b', hqSites, 'douroub siège hq');
        treeHtml += renderSection('Maintenance', 'fa-wrench', '#f97316', maintenanceSites, 'maintenance');
        treeHtml += renderSection('Stations / Repos', 'fa-gas-pump', '#eab308', stationSites, 'station repos');
        treeHtml += renderSection('Clients Isolés', 'fa-user-tie', '#3b82f6', legacyClientSites, 'client');
        treeHtml += renderSection('Sous-Clients Isolés', 'fa-diagram-project', '#8b5cf6', legacyFCSites, 'final_client');
        treeHtml += renderSection('Autres', 'fa-map-pin', '#6b7280', otherSites, 'autre divers');
      }
    }

    // ── DETECTION TAB ──
    const today = new Date().toISOString().slice(0,10);
    const weekAgo = new Date(Date.now()-7*86400000).toISOString().slice(0,10);
    const detHtml = `<div style="display:flex;gap:8px;margin-bottom:14px;flex-wrap:wrap;align-items:flex-end;">
       <div><label style="${lblS}">Date d\u00e9but</label><input type="date" id="zmScanStart" value="${weekAgo}" style="${fldS}"></div>
       <div><label style="${lblS}">Date fin</label><input type="date" id="zmScanEnd" value="${today}" style="${fldS}"></div>
       <button id="zmScanBtn" onclick="ui._zmRunGPSScan()" style="background:linear-gradient(135deg,#a78bfa,#8b5cf6);color:white;border:none;border-radius:8px;padding:9px 16px;font-weight:700;cursor:pointer;display:inline-flex;align-items:center;gap:6px;font-size:12px;"><i class="fa-solid fa-satellite-dish"></i>Scanner GPS</button>
       <button onclick="ui._zmDetectFromLive()" style="background:rgba(56,189,248,0.1);color:#38bdf8;border:1px solid rgba(56,189,248,0.25);border-radius:8px;padding:9px 16px;font-weight:700;cursor:pointer;display:inline-flex;align-items:center;gap:6px;font-size:12px;"><i class="fa-solid fa-radar"></i>D\u00e9tecter Live</button>
       <label style="display:flex;align-items:center;gap:6px;font-size:11px;color:var(--text-muted,#888);cursor:pointer;padding:6px 10px;background:var(--bg-elevated, rgba(255,255,255,0.04));border:1px solid var(--border, rgba(255,255,255,0.08));border-radius:7px;" title="Ignorer les positions d\u00e9j\u00e0 dans un site existant"><input type="checkbox" id="zmScanSkipExisting" checked style="accent-color:#a78bfa;"> Ignorer sites existants</label>
     </div>
     <div style="background:rgba(167,139,250,0.06);border:1px solid rgba(167,139,250,0.15);border-radius:9px;padding:11px 14px;margin-bottom:14px;font-size:12px;color:var(--text-muted,#888);"><i class="fa-solid fa-circle-info" style="color:#a78bfa;margin-right:6px;"></i>Sites d\u00e9tect\u00e9s \u2192 <b style="color:#22c55e;">pr\u00e9remplissent</b> le formulaire &quot;Nouveau Site&quot;. Le bouton <b style="color:#38bdf8;">Carte</b> zoome sur <b>votre carte</b>.</div>
     <div id="zmScanResults"><div style="text-align:center;padding:30px;color:var(--text-muted,#888);"><i class="fa-solid fa-satellite-dish" style="font-size:26px;display:block;margin-bottom:8px;color:#a78bfa;opacity:0.5;"></i>Lancez un scan pour voir les r\u00e9sultats</div></div>`;

    // ── TABS ──
    const tabBtn = (id, icon, label, badge, active) =>
      `<button class="zmTab2${active?' active':''}" onclick="ui._zmSwitchTab(this,'${id}')" style="background:none;border:none;padding:11px 15px;${active?'color:#38bdf8;border-bottom:2px solid #38bdf8;':'color:var(--text-muted,#888);border-bottom:2px solid transparent;'}font-weight:700;font-size:12px;cursor:pointer;margin-bottom:-1px;white-space:nowrap;"${active?'':' onmouseover="this.style.color=\'var(--text-primary,var(--text-primary, #e2e8f0))\'" onmouseout="if(!this.classList.contains(\'active\'))this.style.color=\'var(--text-muted,#888)\'"'}><i class="fa-solid ${icon}" style="margin-right:5px;"></i>${label}${badge!==null?`<span style="background:rgba(255,255,255,0.07);padding:1px 6px;border-radius:8px;font-size:10px;margin-left:5px;">${badge}</span>`:''}</button>`;

    // ── MODAL ──
    const modal = document.createElement('div');
    modal.id = 'zoneManagementModal';
    modal.style.cssText = 'position:fixed;inset:0;z-index:99999;background:var(--bg-overlay, rgba(0,0,0,0.75));display:flex;align-items:center;justify-content:center;backdrop-filter:blur(14px);padding:16px;';
    const totalFC = clients.reduce((s,c)=>s+(c.finalClients||[]).length,0);
    modal.innerHTML = `<div style="background:var(--bg-surface,var(--bg-elevated, #1e293b));border:1px solid var(--border,var(--border, rgba(255,255,255,0.1)));border-radius:20px;width:1020px;max-width:96vw;height:88vh;max-height:860px;box-shadow:0 30px 80px rgba(0,0,0,0.5);display:flex;flex-direction:column;overflow:hidden;">
      <div style="padding:16px 22px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid var(--border,var(--border, rgba(255,255,255,0.08)));flex-shrink:0;background:var(--bg-elevated,rgba(0,0,0,0.12));">
        <div style="display:flex;align-items:center;gap:12px;">
          <div style="width:42px;height:42px;background:linear-gradient(135deg,#3b82f6,#6366f1);border-radius:12px;display:flex;align-items:center;justify-content:center;font-size:20px;box-shadow:0 4px 12px rgba(59,130,246,0.35);">\ud83d\uddfa\ufe0f</div>
          <div><div style="font-weight:800;font-size:17px;color:var(--text-primary,var(--text-primary, #e2e8f0));">Sites & Clients</div>
          <div style="font-size:11px;color:var(--text-muted,#888);margin-top:2px;">${locs.length} sites \u00b7 ${clients.length} clients \u00b7 ${totalFC} clients finaux</div></div>
        </div>
        <button onclick="document.getElementById('zoneManagementModal').remove()" style="width:34px;height:34px;border:none;background:var(--bg-elevated,var(--border));border-radius:9px;color:var(--text-muted,#888);font-size:16px;cursor:pointer;display:flex;align-items:center;justify-content:center;" onmouseover="this.style.background='rgba(239,68,68,0.15)';this.style.color='#f87171'" onmouseout="this.style.background='var(--bg-elevated,var(--border))';this.style.color='var(--text-muted,#888)'">&times;</button>
      </div>
      <div style="display:flex;padding:0 22px;border-bottom:1px solid var(--border,rgba(255,255,255,0.07));background:var(--bg-elevated,rgba(0,0,0,0.08));flex-shrink:0;overflow-x:auto;">
        ${tabBtn('zmPane_sites','fa-sitemap','Arborescence',locs.length,true)}
        
        ${tabBtn('zmPane_detector','fa-satellite-dish','D\u00e9tection',null,false)}
      </div>
      <div style="flex:1;overflow:hidden;display:flex;flex-direction:column;">
        <div id="zmPane_sites" style="flex:1;overflow-y:auto;padding:16px 20px;">${treeHtml}</div>
        
        <div id="zmPane_detector" style="display:none;flex:1;overflow-y:auto;padding:18px 22px;">${detHtml}</div>
      </div>
    </div>`;
    document.body.appendChild(modal);
    modal.addEventListener('click', e => { if(e.target===modal) modal.remove(); });
    if (activeTab) {
      const mp = {sites:'zmPane_sites',add:'zmPane_add',detector:'zmPane_detector'};
      const pid = mp[activeTab];
      if (pid) setTimeout(() => { const b = modal.querySelector(`.zmTab2[onclick*="${pid}"]`); if(b) b.click(); }, 20);
    }
  }

  _zmSelectClient(idx, el) {
    this._zmCurrentClientIdx = idx;
    const c = (FLEET_CONFIG.CLIENTS||[])[idx]; if (!c) return;
    document.querySelectorAll('.zmClientCard').forEach(card => { card.classList.remove('zmSel'); card.style.background=''; card.style.border='1px solid transparent'; });
    if (el) { el.classList.add('zmSel'); el.style.background='rgba(59,130,246,0.1)'; el.style.border='1px solid rgba(59,130,246,0.3)'; }
    const prompt = document.getElementById('zmSelectPrompt'); const content = document.getElementById('zmFinalContent');
    if (prompt) prompt.style.display='none';
    if (content) { content.style.display='flex'; content.style.flexDirection='column'; }
    const dot = document.getElementById('zmSelDot'); const name = document.getElementById('zmSelName');
    if (dot) dot.style.background = c.color||'#3b82f6';
    if (name) name.textContent = c.name;
    this._zmRenderFinalClients(idx);
  }

  _zmRenderFinalClients(clientIdx) {
    const c = (FLEET_CONFIG.CLIENTS||[])[clientIdx];
    const list = document.getElementById('zmFinalList'); if (!list||!c) return;
    const fcs = c.finalClients || [];
    if (!fcs.length) { list.innerHTML = `<div style="text-align:center;padding:20px;color:var(--text-muted,#888);font-size:12px;"><i class="fa-solid fa-users" style="display:block;font-size:20px;margin-bottom:8px;opacity:0.3;"></i>Aucun client final.<br>Ajoutez-en un.</div>`; return; }
    list.innerHTML = fcs.map((fc,j) =>
      `<div style="display:flex;align-items:center;gap:8px;padding:9px 10px;background:var(--bg-elevated,rgba(255,255,255,0.03));border:1px solid var(--border,rgba(255,255,255,0.07));border-radius:8px;">
        <i class="fa-solid fa-user-tie" style="color:#8b5cf6;font-size:13px;"></i>
        <span style="flex:1;font-weight:600;font-size:13px;color:var(--text-primary,var(--text-primary, #e2e8f0));">${fc.name}</span>
        <button onclick="if(confirm('Supprimer ?')){FLEET_CONFIG.CLIENTS[${clientIdx}].finalClients.splice(${j},1);ui.saveSettingsToCloud();ui._zmRenderFinalClients(${clientIdx});}" style="background:rgba(239,68,68,0.08);border:1px solid rgba(239,68,68,0.2);color:#f87171;border-radius:6px;width:26px;height:26px;cursor:pointer;font-size:10px;"><i class="fa-solid fa-trash"></i></button>
      </div>`).join('');
  }

  _addFinalClient() {
    const idx = this._zmCurrentClientIdx;
    if (idx === undefined) return alert('Choisissez un client.');
    const name = document.getElementById('zm_newFCName')?.value.trim();
    if (!name) return alert('Nom requis.');
    const clients = FLEET_CONFIG.CLIENTS || []; if (!clients[idx]) return;
    if (!clients[idx].finalClients) clients[idx].finalClients = [];
    if (clients[idx].finalClients.some(f => f.name.toLowerCase() === name.toLowerCase())) return alert('Existe d\u00e9j\u00e0.');
    clients[idx].finalClients.push({ id: 'fc_' + Date.now(), name });
    this.saveSettingsToCloud();
    if (window.showToast) showToast('Client final cr\u00e9\u00e9', 'success');
    document.getElementById('zm_newFCName').value = '';
    this._zmRenderFinalClients(idx);
  }

  _zmRenameClient() {
    const idx = this._zmCurrentClientIdx; const clients = FLEET_CONFIG.CLIENTS||[];
    if (idx===undefined||!clients[idx]) return;
    const n = prompt('Nouveau nom:', clients[idx].name); if(!n||!n.trim()) return;
    clients[idx].name = n.trim(); this.saveSettingsToCloud();
    this.openZoneManagementModal('clients');
  }

  _zmDeleteClient() {
    const idx = this._zmCurrentClientIdx; const clients = FLEET_CONFIG.CLIENTS||[];
    if (idx===undefined||!clients[idx]) return;
    if (!confirm('Supprimer ' + clients[idx].name + ' ?')) return;
    const id = clients[idx].id; clients.splice(idx, 1);
    (FLEET_CONFIG.CUSTOM_LOCATIONS||[]).forEach(z => { if(z.clientId===id){z.clientId=null;z.finalClientId=null;} });
    this._zmCurrentClientIdx = undefined; this.saveSettingsToCloud();
    this.openZoneManagementModal('clients');
  }

  _zmOnClientChange() {
    const cid = document.getElementById('zm_client')?.value;
    const sel = document.getElementById('zm_finalclient'); if(!sel) return;
    if (!cid) { sel.innerHTML = '<option value="">Choisissez un client en premier</option>'; return; }
    const c = (FLEET_CONFIG.CLIENTS||[]).find(x => x.id === cid);
    const fcs = (c && c.finalClients) || [];
    sel.innerHTML = '<option value="">Aucun client final</option>' + fcs.map(fc => `<option value="${fc.id}">${fc.name}</option>`).join('');
    // Sync color from client to zm_color
    if (c && c.color) { const col = document.getElementById('zm_color'); if(col) col.value = c.color; }
  }

  async _zmRunGPSScan() {
    const start = document.getElementById('zmScanStart')?.value;
    const end   = document.getElementById('zmScanEnd')?.value;
    if (!start||!end) { if(window.showToast) showToast('P\u00e9riode requise','warning'); return; }
    const btn = document.getElementById('zmScanBtn');
    const res = document.getElementById('zmScanResults');
    if (btn) { btn.disabled=true; btn.innerHTML='<i class="fa-solid fa-spinner fa-spin"></i> Scan...'; }
    if (res) res.innerHTML = '<div style="text-align:center;padding:28px;color:var(--text-muted,#888);"><i class="fa-solid fa-spinner fa-spin" style="font-size:22px;color:#a78bfa;display:block;margin-bottom:10px;"></i>Analyse en cours...</div>';
    try {
      const urlEvts = `${FLEET_CONFIG.API.baseUrl}/api/zone-events?limit=5000&start=${new Date(start).toISOString()}&end=${new Date(end+'T23:59:59').toISOString()}`;
      const urlDecs = `${FLEET_CONFIG.API.baseUrl}/api/decouchages?limit=5000`; // decouchages are great for finding unknown stops!
      
      const [rEvts, rDecs] = await Promise.all([
        fetch(urlEvts, { headers: { 'x-access-code': localStorage.getItem('fleetAccessCode') || '' } }),
        fetch(urlDecs, { headers: { 'x-access-code': localStorage.getItem('fleetAccessCode') || '' } })
      ]);
      
      const jsonEvts = await rEvts.json();
      const jsonDecs = await rDecs.json();
      
      const evsRaw = Array.isArray(jsonEvts) ? jsonEvts : (jsonEvts.data || []);
      const decsRaw = Array.isArray(jsonDecs) ? jsonDecs : (jsonDecs.data || []);
      
      // Normalize decouchages to look like events
      const normDecs = decsRaw.map(d => ({
        truckName: d.truckName,
        entryLat: d.locationAtMidnight?.lat,
        entryLng: d.locationAtMidnight?.lng,
        zoneName: 'Arr\u00eat (Decouchage)'
      })).filter(d => d.entryLat && d.entryLng);
      
      const evs = [...evsRaw, ...normDecs];
      const clusters = []; const used = new Set(); const R = 6371000;
      for (const ev of evs) {
        if (!ev.entryLat || !ev.entryLng) continue;
        const key = ev.entryLat.toFixed(3) + ',' + ev.entryLng.toFixed(3);
        if (used.has(key)) continue;
        const grp = evs.filter(e2 => {
          if (!e2.entryLat || !e2.entryLng) return false;
          const dL = (e2.entryLat - ev.entryLat) * Math.PI / 180, dN = (e2.entryLng - ev.entryLng) * Math.PI / 180;
          const a = Math.sin(dL/2)**2 + Math.cos(ev.entryLat*Math.PI/180) * Math.cos(e2.entryLat*Math.PI/180) * Math.sin(dN/2)**2;
          return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)) < 300;
        });
        if (grp.length < 2) continue;
        const aLat = grp.reduce((s, e) => s + e.entryLat, 0) / grp.length;
        const aLng = grp.reduce((s, e) => s + e.entryLng, 0) / grp.length;
        clusters.push({ lat: aLat, lng: aLng, count: grp.length, trucks: [...new Set(grp.map(e => e.truckName))] });
        grp.forEach(e => used.add(e.entryLat.toFixed(3) + ',' + e.entryLng.toFixed(3)));
      }
      // Filter out clusters near existing sites (checkbox: checked = skip existing)
      const skipExisting = document.getElementById('zmScanSkipExisting')?.checked !== false;
      const smartClusters = skipExisting ? clusters.filter(cl => !this._zmIsNearKnownSite(cl.lat, cl.lng)) : clusters;
      if (!smartClusters.length) {
        if (res) res.innerHTML = '<div style="text-align:center;padding:28px;color:var(--text-muted,#888);">' + (clusters.length ? 'Tous les ' + clusters.length + ' clusters sont proches de sites existants.<br>D\u00e9cochez \"Ignorer sites existants\" pour tous les voir.' : 'Aucun cluster d\u00e9tect\u00e9.') + '</div>';
        return;
      }
      const apiKey = (FLEET_CONFIG.GEOAPIFY_API_KEYS || [])[0] || '';
      const geo = await Promise.all(smartClusters.map(async cl => {
        if (!apiKey) return { ...cl, address: cl.lat.toFixed(5) + ', ' + cl.lng.toFixed(5) };
        try {
          const gr = await fetch(`https://api.geoapify.com/v1/geocode/reverse?lat=${cl.lat}&lon=${cl.lng}&apiKey=${apiKey}`);
          const gj = await gr.json(); const p = gj.features?.[0]?.properties || {};
          return { ...cl, address: [p.name || p.street, p.city || p.county, p.state].filter(Boolean).join(', ') || cl.lat.toFixed(5) + ', ' + cl.lng.toFixed(5) };
        } catch (e) { return { ...cl, address: cl.lat.toFixed(5) + ', ' + cl.lng.toFixed(5) }; }
      }));
      if (res) res.innerHTML = geo.map(cl => {
        const safeAddr = cl.address.replace(/'/g, "\\'");
        return `<div style="background:var(--bg-elevated,rgba(255,255,255,0.03));border:1px solid var(--border,var(--border, rgba(255,255,255,0.08)));border-radius:10px;padding:13px 14px;display:flex;align-items:center;gap:10px;margin-bottom:8px;">
          <div style="flex:1;min-width:0;"><div style="font-weight:700;font-size:13px;color:var(--text-primary,var(--text-primary, #e2e8f0));margin-bottom:3px;">${cl.address}</div>
          <div style="font-size:11px;color:var(--text-muted,#888);">${cl.lat.toFixed(5)}, ${cl.lng.toFixed(5)} &middot; ${cl.count} arr&ecirc;ts &middot; ${cl.trucks.slice(0,3).join(', ')}</div></div>
          <button onclick="if(window.AlgeriaMap&&AlgeriaMap.map){AlgeriaMap.map.flyTo({center:[${cl.lng},${cl.lat}],zoom:16,essential:true});}" style="background:rgba(56,189,248,0.1);border:1px solid rgba(56,189,248,0.3);color:#38bdf8;border-radius:7px;padding:5px 9px;font-size:11px;cursor:pointer;font-weight:700;margin-right:5px;"><i class="fa-solid fa-crosshairs"></i> Carte</button>
          <button onclick="ui._zmConvertClusterToSite(${cl.lat},${cl.lng},'${safeAddr}')" style="background:linear-gradient(135deg,#3b82f6,#6366f1);color:white;border:none;border-radius:7px;padding:5px 9px;font-size:11px;cursor:pointer;font-weight:700;"><i class="fa-solid fa-plus"></i> Cr&eacute;er Site</button>
        </div>`;
      }).join('');
    } catch (e) {
      if (res) res.innerHTML = `<div style="padding:20px;color:var(--text-muted,#888);text-align:center;">Erreur: ${e.message}</div>`;
    } finally {
      if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-satellite-dish"></i> Scanner GPS'; }
    }
  }

  _zmDetectFromLive() {
    const allT = (typeof app !== 'undefined' && app.trucks) ? [...app.trucks.values()] : (window.AlgeriaMap && window.AlgeriaMap.trucks ? [...window.AlgeriaMap.trucks.values()] : []);
    const locs = FLEET_CONFIG.CUSTOM_LOCATIONS || []; const R = 6371000;
    const res = document.getElementById('zmScanResults');
    if (!allT.length) {
      if (res) res.innerHTML = '<div style="text-align:center;padding:24px;color:var(--warning,#f59e0b);"><i class="fa-solid fa-triangle-exclamation" style="display:block;font-size:22px;margin-bottom:8px;"></i>Donn\u00e9es live non charg\u00e9es encore. Attendez quelques secondes et r\u00e9essayez.</div>';
      return;
    }
    function inK(t) {
      if (!t.coordinates) return false;
      return locs.some(z => {
        if (!z.lat || !z.lng) return false;
        const dL = (t.coordinates.lat - z.lat) * Math.PI / 180, dN = (t.coordinates.lng - z.lng) * Math.PI / 180;
        const a = Math.sin(dL/2)**2 + Math.cos(z.lat*Math.PI/180) * Math.cos(t.coordinates.lat*Math.PI/180) * Math.sin(dN/2)**2;
        return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)) <= (z.radius || 500);
      });
    }
    const stopped = allT.filter(t => t.coordinates && (t.speed || 0) < 2 && !inK(t));
    if (!stopped.length) { if (res) res.innerHTML = '<div style="text-align:center;padding:24px;color:var(--text-muted,#888);">Tous les camions sont dans des zones connues.</div>'; return; }
    if (res) res.innerHTML = stopped.map(t => {
      return `<div style="background:var(--bg-elevated,rgba(255,255,255,0.03));border:1px solid rgba(234,179,8,0.25);border-radius:10px;padding:13px 14px;display:flex;align-items:center;gap:10px;margin-bottom:8px;">
        <div style="flex:1;"><div style="font-weight:700;font-size:13px;color:var(--text-primary,var(--text-primary, #e2e8f0));">${t.name}</div>
        <div style="font-size:11px;color:var(--text-muted,#888);">${t.coordinates.lat.toFixed(5)}, ${t.coordinates.lng.toFixed(5)} &middot; Arr&ecirc;t&eacute; hors zone</div></div>
        <button onclick="if(window.AlgeriaMap&&AlgeriaMap.map){AlgeriaMap.map.flyTo({center:[${t.coordinates.lng},${t.coordinates.lat}],zoom:16,essential:true});}" style="background:rgba(56,189,248,0.1);border:1px solid rgba(56,189,248,0.3);color:#38bdf8;border-radius:7px;padding:5px 9px;font-size:11px;cursor:pointer;font-weight:700;margin-right:5px;"><i class="fa-solid fa-crosshairs"></i> Carte</button>
        <button onclick="ui._zmConvertClusterToSite(${t.coordinates.lat},${t.coordinates.lng},'${t.name}')" style="background:linear-gradient(135deg,#3b82f6,#6366f1);color:white;border:none;border-radius:7px;padding:5px 9px;font-size:11px;cursor:pointer;font-weight:700;"><i class="fa-solid fa-plus"></i> Cr&eacute;er Site</button>
      </div>`;
    }).join('');
  }

  _zmConvertClusterToSite(lat, lng, label) {
    this.openZoneManagementModal('add');
    setTimeout(() => {
      const n = document.getElementById('zm_name'), la = document.getElementById('zm_lat'), lo = document.getElementById('zm_lng');
      if (n && !n.value) n.value = label || '';
      if (la) la.value = typeof lat === 'number' ? lat.toFixed(6) : lat;
      if (lo) lo.value = typeof lng === 'number' ? lng.toFixed(6) : lng;
    }, 80);
  }



  // Show/hide Client + Final Client fields based on site type
  _zmUpdateTypeVisibility() {
    const type = document.getElementById('zm_type')?.value;
    const clientRow = document.getElementById('zm_clientRow');
    if (type === 'final_client') {
      if (clientRow) clientRow.style.display = '';
      // Sync color from selected client
      const cid = document.getElementById('zm_client')?.value;
      if (cid) {
        const cl = (FLEET_CONFIG.CLIENTS||[]).find(x=>x.id===cid);
        if (cl && cl.color) { const col = document.getElementById('zm_color'); if(col) col.value = cl.color; }
      }
    } else {
      if (clientRow) clientRow.style.display = 'none';
    }
  }

  // Check if a lat/lng is within 200m of any existing site
  _zmIsNearKnownSite(lat, lng) {
    const locs = FLEET_CONFIG.CUSTOM_LOCATIONS || [];
    const R = 6371000;
    return locs.some(z => {
      if (!z.lat || !z.lng) return false;
      const dLat = (lat - z.lat) * Math.PI / 180;
      const dLng = (lng - z.lng) * Math.PI / 180;
      const a = Math.sin(dLat/2)**2 + Math.cos(z.lat*Math.PI/180)*Math.cos(lat*Math.PI/180)*Math.sin(dLng/2)**2;
      const dist = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
      // Use the site's actual radius — any overlap means it's a known site
      return dist < (z.radius || 500) + 1500;
    });
  }

    _zmSwitchTabById(paneId) {
    const modal = document.getElementById('zoneManagementModal');
    if (!modal) return;
    const btn = modal.querySelector('.zmTab2[onclick*="' + paneId + '"]');
    if (btn) btn.click();
  }

  _zmSwitchTab(btn, paneId) {
    const modal = document.getElementById('zoneManagementModal');
    if (!modal) return;
    modal.querySelectorAll('.zmTab2').forEach(b => { b.classList.remove('active'); b.style.color='var(--text-muted, #64748b)'; b.style.borderBottom='2px solid transparent'; });
    btn.classList.add('active'); btn.style.color='#38bdf8'; btn.style.borderBottom='2px solid #38bdf8';
    modal.querySelectorAll('[id^="zmPane_"]').forEach(p => p.style.display='none');
    const pane = document.getElementById(paneId);
    if (pane) { pane.style.display='flex'; pane.style.flexDirection='column'; }
  }

  openZoneClientModal(index) {
    const locs = FLEET_CONFIG.CUSTOM_LOCATIONS || [];
    const isNew = (index === null || index === undefined || index === 'null');
    const loc = isNew ? { name: '', type: 'other', lat: '', lng: '', radius: 100, color: '#3b82f6', icon: '' } : locs[index];
    if (!loc) return;
    const clients = FLEET_CONFIG.CLIENTS || [];
    const TC = {
      douroub:'Si\u00e8ge / HQ', client:'Client', final_client:'Client Final',
      maintenance:'Maintenance', station:'Station/Repos', other:'Autre'
    };
    const typeOpts = Object.entries(TC).map(([v,l]) => `<option value="${v}"${loc.type===v?' selected':''}>${l}</option>`).join('');
    const clientOpts = `<option value="">— Aucun —</option>` + clients.map(c=>`<option value="${c.id}"${loc.clientId===c.id?' selected':''}>${c.name}</option>`).join('');
    
    // For final_client, build the final client select from the parent
    const parentClient = loc.clientId ? clients.find(c=>c.id===loc.clientId) : null;
    const fcOpts = parentClient ? 
      `<option value="">— Aucun —</option>` + (parentClient.finalClients||[]).map(fc=>`<option value="${fc.id}"${loc.finalClientId===fc.id?' selected':''}>${fc.name}</option>`).join('') :
      '<option value="">Choisir un client d\'abord</option>';

    const fld = 'width:100%;background:var(--bg-elevated, #1e293b);border:1px solid var(--border, rgba(255,255,255,0.1));border-radius:8px;padding:11px 13px;color:var(--text-primary, #e2e8f0);font-size:13px;box-sizing:border-box;outline:none;';
    const lbl = 'font-size:10px;font-weight:800;color:var(--text-muted, #64748b);text-transform:uppercase;display:block;margin-bottom:5px;';
    const hasGPS = loc.lat && loc.lng && loc.lat !== 0 && loc.lng !== 0;

    const overlay = document.createElement('div');
    overlay.id = 'zmEditOverlay';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:100000;background:var(--bg-overlay, rgba(0,0,0,0.75));display:flex;align-items:center;justify-content:center;backdrop-filter:blur(8px);padding:16px;';
    overlay.innerHTML = `<div style="background:var(--bg-surface, #0f172a);border:1px solid rgba(255,255,255,0.12);border-radius:18px;width:600px;max-width:95vw;max-height:90vh;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 25px 60px rgba(0,0,0,0.6);">
      <div style="padding:20px 24px;border-bottom:1px solid rgba(255,255,255,0.07);display:flex;align-items:center;justify-content:space-between;flex-shrink:0;">
        <div style="display:flex;align-items:center;gap:10px;">
          <div style="width:36px;height:36px;background:linear-gradient(135deg,#6366f1,#3b82f6);border-radius:10px;display:flex;align-items:center;justify-content:center;"><i class="fa-solid fa-pen-to-square" style="color:white;font-size:15px;"></i></div>
          <div>
            <div style="font-weight:800;font-size:15px;color:var(--text-primary, #e2e8f0);">Modifier — ${loc.name}</div>
            <div style="font-size:10px;color:var(--text-muted, #64748b);margin-top:2px;">${hasGPS ? Number(loc.lat).toFixed(5)+', '+Number(loc.lng).toFixed(5) : '\u26a0\ufe0f Position GPS manquante'}</div>
          </div>
        </div>
        <button onclick="document.getElementById('zmEditOverlay').remove()" style="background:var(--border);border:none;border-radius:8px;width:32px;height:32px;color:var(--text-muted, #64748b);font-size:16px;cursor:pointer;">\u2715</button>
      </div>
      <div style="flex:1;overflow-y:auto;padding:20px;scrollbar-width:thin;">

        <!-- SECTION: Identite -->
        <div style="font-size:10px;font-weight:800;color:var(--text-muted, #64748b);text-transform:uppercase;letter-spacing:.08em;margin-bottom:10px;">📝 Identité</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:18px;">
          <div><label style="${lbl}">Nom *</label><input id="zme_name" value="${loc.name.replace(/"/g,'&quot;')}" placeholder="Ex: SGEM GUEDILA" style="${fld}"></div>
          <div><label style="${lbl}">Wilaya</label><input id="zme_wilaya" value="${(loc.wilaya||'').replace(/"/g,'&quot;')}" placeholder="Ex: Ghardaïa" style="${fld}"></div>
          <div style="grid-column:1/-1"><label style="${lbl}">Description / Notes</label><textarea id="zme_desc" rows="2" placeholder="Informations complémentaires…" style="${fld}resize:none;">${loc.description||''}</textarea></div>
        </div>

        <!-- SECTION: Localisation -->
        <div style="font-size:10px;font-weight:800;color:var(--text-muted, #64748b);text-transform:uppercase;letter-spacing:.08em;margin-bottom:10px;">📍 Localisation</div>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:8px;">
          <div><label style="${lbl}">Latitude</label><input id="zme_lat" type="number" step="any" value="${loc.lat||''}" style="${fld}"></div>
          <div><label style="${lbl}">Longitude</label><input id="zme_lng" type="number" step="any" value="${loc.lng||''}" style="${fld}"></div>
          <div><label style="${lbl}">Rayon (m)</label>
            <div style="display:flex;align-items:center;gap:8px;">
              <input id="zme_radius" type="number" value="${loc.radius||500}" min="50" max="50000" style="${fld}flex:1;" oninput="document.getElementById('zme_radius_lbl').textContent=this.value+'m'">
              <span id="zme_radius_lbl" style="font-size:11px;color:#38bdf8;font-weight:700;white-space:nowrap;">${loc.radius||500}m</span>
            </div>
          </div>
        </div>
        <div style="margin-bottom:18px;">
          <button onclick="ui._startZoneMapPicker({editIndex:${index}})" style="background:rgba(56,189,248,0.08);color:#38bdf8;border:1px solid rgba(56,189,248,0.25);border-radius:8px;padding:9px 16px;font-weight:700;cursor:pointer;display:inline-flex;align-items:center;gap:7px;font-size:12px;width:100%;justify-content:center;"><i class="fa-solid fa-crosshairs"></i> Repositionner sur la carte</button>
        </div>

        <!-- SECTION: Apparence -->
        <div style="font-size:10px;font-weight:800;color:var(--text-muted, #64748b);text-transform:uppercase;letter-spacing:.08em;margin-bottom:10px;">🎨 Apparence</div>
        <div style="display:grid;grid-template-columns:auto auto 1fr;gap:14px;align-items:start;margin-bottom:10px;">
          <div>
            <label style="${lbl}">Couleur zone</label>
            <div style="display:flex;align-items:center;gap:6px;margin-bottom:5px;">
              <input id="zme_color_custom" type="checkbox" ${loc.color?'checked':''} onchange="document.getElementById('zme_color').disabled=!this.checked;" style="accent-color:#3b82f6;">
              <span style="font-size:11px;color:var(--text-primary);">Personnalisée</span>
            </div>
            <input id="zme_color" type="color" value="${loc.color||'#3b82f6'}" ${loc.color?'':'disabled'} style="width:54px;height:42px;border:2px solid rgba(255,255,255,0.15);border-radius:8px;cursor:pointer;padding:2px;background:var(--bg-elevated, #1e293b);display:block;margin-bottom:5px;">
            <div style="display:flex;gap:3px;flex-wrap:wrap;width:54px;">${['#3b82f6','#22c55e','#f59e0b','#ef4444','#8b5cf6','#06b6d4','#ec4899','#f97316','#14b8a6','#6b7280','var(--text-primary, #e2e8f0)','var(--bg-elevated, #1e293b)'].map(c=>`<span onclick="if(!document.getElementById('zme_color_custom').checked){document.getElementById('zme_color_custom').checked=true;document.getElementById('zme_color').disabled=false;};document.getElementById('zme_color').value='${c}'" style="width:15px;height:15px;border-radius:3px;background:${c};cursor:pointer;border:1px solid rgba(255,255,255,0.2);display:inline-block;" title="${c}"></span>`).join('')}</div>
          </div>
          <div>
            <label style="${lbl}">Bordure</label>
            <input id="zme_color_stroke" type="color" value="${loc.strokeColor||loc.color||'#3b82f6'}" style="width:54px;height:42px;border:2px solid rgba(255,255,255,0.15);border-radius:8px;cursor:pointer;padding:2px;background:var(--bg-elevated, #1e293b);">
          </div>
          <div>
            <label style="${lbl}">Opacité remplissage</label>
            <div style="display:flex;align-items:center;gap:8px;margin-top:6px;">
              <input id="zme_opacity" type="range" min="0" max="0.6" step="0.05" value="${loc.opacity!==undefined?loc.opacity:0.15}" style="flex:1;" oninput="document.getElementById('zme_opacity_lbl').textContent=Math.round(this.value*100)+'%'">
              <span id="zme_opacity_lbl" style="font-size:11px;color:#38bdf8;font-weight:700;width:34px;">${Math.round(((loc.opacity!==undefined?loc.opacity:0.15))*100)}%</span>
            </div>
          </div>
        </div>

        <!-- Icon picker -->
        <div style="margin-bottom:18px;">
          <label style="${lbl}">Icône FontAwesome</label>
          <div id="zme_icon_grid" style="display:flex;flex-wrap:wrap;gap:5px;max-height:120px;overflow-y:auto;padding:8px;background:rgba(0,0,0,0.2);border-radius:8px;border:1px solid var(--border, rgba(255,255,255,0.08));">
            ${['fa-building','fa-warehouse','fa-industry','fa-oil-well','fa-tower-observation','fa-landmark','fa-store','fa-hotel','fa-truck','fa-boxes-stacked','fa-pallet','fa-route','fa-map-pin','fa-location-dot','fa-crosshairs','fa-gas-pump','fa-charging-station','fa-bolt','fa-fire-flame-curved','fa-droplet','fa-oil-can','fa-user-tie','fa-users','fa-helmet-safety','fa-handshake','fa-wrench','fa-screwdriver-wrench','fa-gear','fa-toolbox','fa-hammer','fa-star','fa-circle-check','fa-triangle-exclamation','fa-shield-halved','fa-flag'].map(ic=>{const sel=(loc.icon||'fa-building')===ic;return `<button type="button" onclick="ui._zmeSelectIcon(this,'${ic}')" data-icon="${ic}" title="${ic}" style="width:32px;height:32px;border-radius:6px;border:${sel?'2px solid #3b82f6':'1px solid var(--border, rgba(255,255,255,0.1))'};background:${sel?'rgba(59,130,246,0.2)':'var(--bg-elevated, rgba(255,255,255,0.04))'};color:${sel?'#60a5fa':'var(--text-muted, #94a3b8)'};cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:13px;"><i class="fa-solid ${ic}"></i></button>`;}).join('')}
          </div>
          <input type="hidden" id="zme_icon" value="${loc.icon||'fa-building'}">
          <div style="margin-top:7px;display:flex;align-items:center;gap:8px;">
            <label style="${lbl};margin:0;white-space:nowrap;">Ou emoji:</label>
            <input id="zme_emoji" value="${loc.iconEmoji||''}" placeholder="🏭" maxlength="4" style="${fld}width:60px;text-align:center;font-size:18px;">
            <span style="font-size:10px;color:var(--text-muted, #64748b);">(remplace l'icône FA)</span>
          </div>
        </div>

        <!-- SECTION: Type & Client -->
        <div style="font-size:10px;font-weight:800;color:var(--text-muted, #64748b);text-transform:uppercase;letter-spacing:.08em;margin-bottom:10px;">🏢 Type & Client</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:18px;">
          <div><label style="${lbl}">Type de zone</label><select id="zme_type" style="${fld}">${typeOpts}</select></div>
          <div><label style="${lbl}">Client lié</label><select id="zme_client" onchange="ui._zmeClientChanged()" style="${fld}">${clientOpts}</select></div>
          <div id="zme_fcWrap" style="${parentClient?'':'display:none;'}grid-column:1/-1;"><label style="${lbl}">Client Final lié</label><select id="zme_finalclient" style="${fld}">${fcOpts}</select></div>
        </div>

        <!-- SECTION: Comportement -->
        <div style="font-size:10px;font-weight:800;color:var(--text-muted, #64748b);text-transform:uppercase;letter-spacing:.08em;margin-bottom:10px;">⚙️ Comportement</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:10px;">
          <div><label style="${lbl}">Vitesse limite km/h (0=aucune)</label><input id="zme_speedlimit" type="number" min="0" max="200" value="${loc.speedLimitKmh||0}" style="${fld}"></div>
          <div><label style="${lbl}">Durée min. visite (min)</label><input id="zme_mindwell" type="number" min="0" max="480" value="${loc.minDwellMinutes||0}" style="${fld}"></div>
        </div>
        <div style="display:flex;gap:18px;margin-bottom:18px;">
          <label style="display:flex;align-items:center;gap:7px;cursor:pointer;font-size:13px;color:var(--text-primary, #e2e8f0);"><input type="checkbox" id="zme_alertentry" ${loc.alertOnEntry?'checked':''} style="width:15px;height:15px;accent-color:#3b82f6;"> 🔔 Alerte entrée</label>
          <label style="display:flex;align-items:center;gap:7px;cursor:pointer;font-size:13px;color:var(--text-primary, #e2e8f0);"><input type="checkbox" id="zme_alertexit" ${loc.alertOnExit?'checked':''} style="width:15px;height:15px;accent-color:#3b82f6;"> 🔔 Alerte sortie</label>
        </div>

        <!-- SECTION: Tags -->
        <div>
          <label style="${lbl}">Tags (séparés par virgule)</label>
          <input id="zme_tags" value="${(loc.tags||[]).join(', ')}" placeholder="Ex: prioritaire, nord, livraison" style="${fld}">
        </div>

      </div>

      <div style="padding:16px 24px;border-top:1px solid rgba(255,255,255,0.07);display:flex;gap:10px;flex-shrink:0;">
        <button onclick="document.getElementById('zmEditOverlay').remove()" style="flex:1;background:var(--border, rgba(255,255,255,0.05));border:1px solid var(--border, rgba(255,255,255,0.1));color:var(--text-muted, #94a3b8);border-radius:9px;padding:12px;font-weight:700;cursor:pointer;">Annuler</button>
        <button onclick="ui._saveEditedSite(${index})" style="flex:2;background:linear-gradient(135deg,#3b82f6,#6366f1);color:white;border:none;border-radius:9px;padding:12px;font-weight:800;cursor:pointer;box-shadow:0 4px 15px rgba(59,130,246,0.3);"><i class="fa-solid fa-check" style="margin-right:8px;"></i>Enregistrer</button>
      </div>
    </div>`;
    document.body.appendChild(overlay);
    overlay.addEventListener('click', e => { if(e.target===overlay) overlay.remove(); });
  }

  _zmeSelectIcon(btn, icon) {
    document.getElementById('zme_icon').value = icon;
    document.querySelectorAll('#zme_icon_grid button').forEach(b => {
      const sel = b.dataset.icon === icon;
      b.style.border = sel ? '2px solid #3b82f6' : '1px solid var(--border, rgba(255,255,255,0.1))';
      b.style.background = sel ? 'rgba(59,130,246,0.2)' : 'var(--bg-elevated, rgba(255,255,255,0.04))';
      b.style.color = sel ? '#60a5fa' : 'var(--text-muted, #94a3b8)';
    });
  }

  _zmeTypeChanged() {
    // All types can now have client link — kept for back-compat
  }

  _zmeClientChanged() {
    const cid = document.getElementById('zme_client')?.value;
    const fw = document.getElementById('zme_fcWrap');
    const sel = document.getElementById('zme_finalclient');
    if (!cid) { if(fw) fw.style.display = 'none'; return; }
    const c = (FLEET_CONFIG.CLIENTS||[]).find(x => x.id === cid);
    if (!c) { if(fw) fw.style.display = 'none'; return; }
    if (fw) fw.style.display = '';
    if (sel) sel.innerHTML = '<option value="">— Aucun —</option>' + (c.finalClients||[]).map(fc => `<option value="${fc.id}">${fc.name}</option>`).join('');
    // Sync color visually but uncheck custom color so it inherits
    const col = document.getElementById('zme_color');
    const chk = document.getElementById('zme_color_custom');
    if (col && c.color) col.value = c.color;
    if (chk) { chk.checked = false; if(col) col.disabled = true; }
  }

  _saveEditedSite(index) {
    const locs = FLEET_CONFIG.CUSTOM_LOCATIONS || [];
    const isNew = (index === null || index === undefined || index === 'null');
    const locToEdit = isNew ? { id: 'zone_' + Date.now() + '_' + Math.floor(Math.random()*9999) } : locs[index];
    if (!locToEdit) return;
    
    const name   = document.getElementById('zme_name')?.value.trim();
    const wilaya = document.getElementById('zme_wilaya')?.value.trim();
    const lat    = parseFloat(document.getElementById('zme_lat')?.value);
    const lng    = parseFloat(document.getElementById('zme_lng')?.value);
    const radius = parseInt(document.getElementById('zme_radius')?.value) || 500;
    const type   = document.getElementById('zme_type')?.value || 'other';
    const clientId = document.getElementById('zme_client')?.value || null;
    if (!name) return alert('\u26a0\ufe0f Le nom est requis.');
    
    // Check if custom color is enabled. If not, color is null to allow client/type inheritance
    const isCustomColor = document.getElementById('zme_color_custom')?.checked || false;
    const color         = isCustomColor ? (document.getElementById('zme_color')?.value || '#3b82f6') : null;
    const strokeColor   = document.getElementById('zme_color_stroke')?.value || color || '#3b82f6';
    const opacity       = parseFloat(document.getElementById('zme_opacity')?.value ?? 0.15);
    const icon          = document.getElementById('zme_icon')?.value || 'fa-building';
    const iconEmoji     = (document.getElementById('zme_emoji')?.value || '').trim();
    const description   = (document.getElementById('zme_desc')?.value || '').trim();
    const speedLimitKmh = parseInt(document.getElementById('zme_speedlimit')?.value) || 0;
    const minDwellMin   = parseInt(document.getElementById('zme_mindwell')?.value) || 0;
    const alertOnEntry  = document.getElementById('zme_alertentry')?.checked || false;
    const alertOnExit   = document.getElementById('zme_alertexit')?.checked || false;
    const tagsRaw       = document.getElementById('zme_tags')?.value || '';
    const tags          = tagsRaw.split(',').map(t=>t.trim()).filter(Boolean);
    const finalClientId = document.getElementById('zme_finalclient')?.value || null;
    
    Object.assign(locToEdit, {
      name, wilaya,
      lat: isNaN(lat) ? locToEdit.lat : lat,
      lng: isNaN(lng) ? locToEdit.lng : lng,
      radius, type, color, strokeColor, opacity,
      icon, iconEmoji, description,
      speedLimitKmh, minDwellMinutes: minDwellMin,
      alertOnEntry, alertOnExit, tags,
      clientId: clientId||null, finalClientId: finalClientId||null
    });
    
    if (isNew) locs.push(locToEdit);
    
    this.saveSettingsToCloud();
    if (window.AlgeriaMap) { window.AlgeriaMap.renderCustomLocations(); if(window.AlgeriaMap.refreshPanelZones) window.AlgeriaMap.refreshPanelZones(); }
    if (window.showToast) showToast(`\u2705 Site "${name}" ${isNew ? 'créé' : 'mis à jour'}`, 'success');
    document.getElementById('zmEditOverlay')?.remove();
    this.openZoneManagementModal('sites');
  }

  _addCompany() {
    const name  = document.getElementById('zm_new_company_name')?.value.trim();
    const color = document.getElementById('zm_new_company_color')?.value || '#3b82f6';
    if (!name) return alert('\u26a0\ufe0f Nom de société requis.');
    if (!FLEET_CONFIG.CLIENTS) FLEET_CONFIG.CLIENTS = [];
    if (FLEET_CONFIG.CLIENTS.some(c => c.name.toLowerCase() === name.toLowerCase()))
      return alert(`\u26a0\ufe0f La société "${name}" existe déjà.`);
    FLEET_CONFIG.CLIENTS.push({ id: 'co_' + Date.now(), name, color });
    this.saveSettingsToCloud();
    if (window.showToast) showToast(`\u2705 Société "${name}" créée`, 'success');
    this.openZoneManagementModal('societes');
  }


  _saveNewZoneFromModal() {
    const name   = document.getElementById('zm_name')?.value.trim();
    const wilaya = document.getElementById('zm_wilaya')?.value.trim();
    const lat    = parseFloat(document.getElementById('zm_lat')?.value);
    const lng    = parseFloat(document.getElementById('zm_lng')?.value);
    const radius = parseInt(document.getElementById('zm_radius')?.value) || 500;
    const type   = document.getElementById('zm_type')?.value || 'other';
    const clientId      = document.getElementById('zm_client')?.value || null;
    const finalClientId = null; // Final client link is managed in edit modal
    const color         = document.getElementById('zm_color')?.value || '#3b82f6';

    // Validate: final_client type requires a client
    if (type === 'final_client' && !clientId) return alert('Un site Client Final doit avoir un Client parent.');
    // final_client type just needs a parent client
    if (!name)          return alert('\u26a0\ufe0f Le nom de la zone est requis.');
    // Auto-create logical Client if type is client
    if (type === 'client') {
      if (!FLEET_CONFIG.CLIENTS) FLEET_CONFIG.CLIENTS = [];
      let existingClient = FLEET_CONFIG.CLIENTS.find(c => c.name.toLowerCase() === name.toLowerCase());
      if (!existingClient) {
          FLEET_CONFIG.CLIENTS.push({ id: 'cl_' + Date.now(), name: name, color: color, finalClients: [] });
      }
    }
    if (!wilaya)        return alert('\u26a0\ufe0f La wilaya est requise.');
    if (isNaN(lat) || isNaN(lng)) return alert('\u26a0\ufe0f Latitude et longitude valides requises.');

    if (!FLEET_CONFIG.CUSTOM_LOCATIONS) FLEET_CONFIG.CUSTOM_LOCATIONS = [];
    const existing = FLEET_CONFIG.CUSTOM_LOCATIONS.findIndex(z => z.name.toLowerCase() === name.toLowerCase());
    if (existing >= 0) {
      if (!confirm(`Une zone "${name}" existe déjà. Voulez-vous la remplacer?`)) return;
      FLEET_CONFIG.CUSTOM_LOCATIONS.splice(existing, 1);
    }

    const newZone = {
      id: 'zone_' + Date.now(),
      name, wilaya, lat, lng, radius, type,
      color: color || '#3b82f6',
      strokeColor: color || '#3b82f6',
      opacity: 0.15,
      icon: 'fa-building',
      iconEmoji: '',
      description: '',
      speedLimitKmh: 0,
      minDwellMinutes: 0,
      alertOnEntry: false,
      alertOnExit: false,
      tags: [],
      clientId: clientId || null,
      finalClientId: finalClientId || null,
      createdAt: new Date().toISOString()
    };

    FLEET_CONFIG.CUSTOM_LOCATIONS.push(newZone);
    this.saveSettingsToCloud();

    // Refresh the map and ZMC if open
    if (window.AlgeriaMap) { window.AlgeriaMap.renderCustomLocations(); if(window.AlgeriaMap.refreshPanelZones) window.AlgeriaMap.refreshPanelZones(); }

    if (window.showToast) showToast(`\u2705 Zone "${name}" créée avec succès!`, 'success');
    
    // Go back to zones list tab
    this.openZoneManagementModal();
    setTimeout(() => { const t = document.querySelectorAll('.zmTab2'); if(t[0]) t[0].click(); }, 80);
  }


  openReportModal(imei = null, name = null) {
    if (!imei) {
      const trucks = (window.app && typeof window.app.getAllTrucks === 'function') ? window.app.getAllTrucks() : [];
      if (trucks.length > 0) {
        imei = trucks[0].id;
        name = trucks[0].name;
      }
    }
    return this.openHistoryModal(imei, name);
  }

  _addForfaitRow() {
    const codeInput = document.getElementById('forfaitCode');
    if (codeInput) {
      codeInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
      codeInput.focus();
    }
  }

  openClientModal() {
    const modal = document.getElementById('clientModal');
    if (modal) {
      modal.style.display = 'flex';
      this.loadClients();
    }
  }

  closeClientModal() {
    const modal = document.getElementById('clientModal');
    if (modal) modal.style.display = 'none';
  }

  cmSelectClient(index) {
    this._cmSelectedClientIndex = index;
    const clients = FLEET_CONFIG.CLIENTS || [];
    const client = clients[index];
    if (!client) return;

    document.querySelectorAll('.cm-client-item').forEach((el, i) => {
      el.style.background = (i === index) ? 'rgba(59,130,246,0.18)' : '';
    });

    const noSelection = document.getElementById('cm_noSelection');
    const finalPanel = document.getElementById('cm_finalPanel');
    if (noSelection) noSelection.style.display = 'none';
    if (finalPanel) finalPanel.style.display = 'flex';

    const dot = document.getElementById('cm_selectedClientDot');
    if (dot) dot.style.background = client.color || '#3b82f6';

    const nameEl = document.getElementById('cm_selectedClientName');
    if (nameEl) nameEl.textContent = client.name || 'Client';

    const countEl = document.getElementById('cm_selectedClientFcCount');
    const fcList = client.finalClients || [];
    if (countEl) countEl.textContent = `${fcList.length} client(s) final(s)`;

    this._renderFinalClientsList(client);
  }

  _renderFinalClientsList(client) {
    const container = document.getElementById('cm_finalClientsList');
    if (!container) return;
    const list = client.finalClients || [];
    if (list.length === 0) {
      container.innerHTML = '<div style="text-align:center;color:var(--text-muted,#888);padding:30px;font-size:12px;">Aucun client final pour ce client.</div>';
      return;
    }
    container.innerHTML = list.map((fc, i) => {
      const fcId = fc.id || fc._id || String(i);
      const fcName = fc.name || String(fc);
      return `<div style="display:flex;align-items:center;justify-content:space-between;padding:8px 12px;background:rgba(255,255,255,0.04);border:1px solid var(--border,rgba(255,255,255,0.08));border-radius:8px;">
        <span style="font-size:13px;color:var(--text,#fff);font-weight:600;"><i class="fa-solid fa-user-tag" style="color:#60a5fa;margin-right:8px;font-size:11px;"></i>${fcName}</span>
        <button onclick="ui.cmDeleteFinalClient('${fcId}')" style="background:rgba(239,68,68,0.15);border:1px solid rgba(239,68,68,0.3);color:#f87171;border-radius:6px;padding:4px 8px;cursor:pointer;font-size:11px;"><i class="fa-solid fa-trash"></i></button>
      </div>`;
    }).join('');
  }

  async cmAddClient() {
    const nameInput = document.getElementById('cm_newClientName');
    const colorInput = document.getElementById('cm_newClientColor');
    const name = nameInput?.value?.trim();
    const color = colorInput?.value || '#3b82f6';
    if (!name) return alert('Veuillez saisir un nom pour le client.');

    try {
      const res = await fetch(`${FLEET_CONFIG.API.baseUrl}/api/clients`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, color })
      });
      if (res.ok) {
        const data = await res.json();
        if (!FLEET_CONFIG.CLIENTS) FLEET_CONFIG.CLIENTS = [];
        const newClient = data.client || { id: String(Date.now()), name, color, finalClients: [] };
        FLEET_CONFIG.CLIENTS.push(newClient);
        if (typeof this.saveSettingsToCloud === 'function') await this.saveSettingsToCloud();
        if (nameInput) nameInput.value = '';
        this.loadClients();
        this.cmSelectClient(FLEET_CONFIG.CLIENTS.length - 1);
        if (window.showToast) showToast(`✅ Client "${name}" créé!`, 'success');
      } else {
        const err = await res.json().catch(() => ({}));
        alert('Erreur: ' + (err.error || res.statusText));
      }
    } catch(e) {
      if (!FLEET_CONFIG.CLIENTS) FLEET_CONFIG.CLIENTS = [];
      const newClient = { id: String(Date.now()), name, color, finalClients: [] };
      FLEET_CONFIG.CLIENTS.push(newClient);
      if (typeof this.saveSettingsToCloud === 'function') await this.saveSettingsToCloud();
      if (nameInput) nameInput.value = '';
      this.loadClients();
      this.cmSelectClient(FLEET_CONFIG.CLIENTS.length - 1);
      if (window.showToast) showToast(`✅ Client "${name}" créé!`, 'success');
    }
  }

  async cmStartEditClient() {
    const clients = FLEET_CONFIG.CLIENTS || [];
    const idx = this._cmSelectedClientIndex ?? -1;
    const client = clients[idx];
    if (!client) return;

    const newName = prompt('Nouveau nom du client:', client.name);
    if (!newName || !newName.trim()) return;

    const clientId = client.id || client._id;
    try {
      await fetch(`${FLEET_CONFIG.API.baseUrl}/api/clients/${clientId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName.trim(), color: client.color })
      });
    } catch(e) {}

    client.name = newName.trim();
    if (typeof this.saveSettingsToCloud === 'function') await this.saveSettingsToCloud();
    this.loadClients();
    this.cmSelectClient(idx);
    if (window.showToast) showToast('✅ Client mis à jour', 'success');
  }

  async cmDeleteClient() {
    const clients = FLEET_CONFIG.CLIENTS || [];
    const idx = this._cmSelectedClientIndex ?? -1;
    const client = clients[idx];
    if (!client) return;

    if (!confirm(`Supprimer le client "${client.name}" et tous ses clients finaux ?`)) return;

    const clientId = client.id || client._id;
    try {
      await fetch(`${FLEET_CONFIG.API.baseUrl}/api/clients/${clientId}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' }
      });
    } catch(e) {}

    FLEET_CONFIG.CLIENTS.splice(idx, 1);
    if (typeof this.saveSettingsToCloud === 'function') await this.saveSettingsToCloud();
    this.loadClients();
    const finalPanel = document.getElementById('cm_finalPanel');
    const noSelection = document.getElementById('cm_noSelection');
    if (finalPanel) finalPanel.style.display = 'none';
    if (noSelection) noSelection.style.display = 'flex';
    this._cmSelectedClientIndex = null;
    if (window.showToast) showToast('Client supprimé', 'success');
  }

  async cmAddFinalClient() {
    const clients = FLEET_CONFIG.CLIENTS || [];
    const idx = this._cmSelectedClientIndex ?? -1;
    const client = clients[idx];
    if (!client) return alert('Sélectionnez d\'abord un client.');

    const input = document.getElementById('cm_newFcName');
    const name = input?.value?.trim();
    if (!name) return alert('Nom du client final requis.');

    const clientId = client.id || client._id;
    try {
      const res = await fetch(`${FLEET_CONFIG.API.baseUrl}/api/clients/${clientId}/final-clients`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name })
      });
      if (res.ok) {
        const data = await res.json();
        if (!client.finalClients) client.finalClients = [];
        client.finalClients.push(data.finalClient || { id: String(Date.now()), name });
      } else {
        if (!client.finalClients) client.finalClients = [];
        client.finalClients.push({ id: String(Date.now()), name });
      }
    } catch(e) {
      if (!client.finalClients) client.finalClients = [];
      client.finalClients.push({ id: String(Date.now()), name });
    }

    if (typeof this.saveSettingsToCloud === 'function') await this.saveSettingsToCloud();
    if (input) input.value = '';
    this.cmSelectClient(idx);
    this.loadClients();
    if (window.showToast) showToast(`✅ Client final "${name}" ajouté!`, 'success');
  }

  async cmDeleteFinalClient(fcId) {
    const clients = FLEET_CONFIG.CLIENTS || [];
    const idx = this._cmSelectedClientIndex ?? -1;
    const client = clients[idx];
    if (!client) return;

    if (!confirm('Supprimer ce client final ?')) return;

    const clientId = client.id || client._id;
    try {
      await fetch(`${FLEET_CONFIG.API.baseUrl}/api/clients/${clientId}/final-clients/${fcId}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' }
      });
    } catch(e) {}

    client.finalClients = (client.finalClients || []).filter(fc => (fc.id || fc._id) !== fcId && fc.name !== fcId);
    if (typeof this.saveSettingsToCloud === 'function') await this.saveSettingsToCloud();
    this.cmSelectClient(idx);
    this.loadClients();
    if (window.showToast) showToast('Client final supprimé', 'success');
  }

  // ── FIX: was called but never defined ──────────────────────
  // Renders the cm_clientsList panel in the existing Client Management modal (index.html)
  loadClients() {
    const list = document.getElementById('cm_clientsList');
    if (!list) return; // modal not open yet, that's fine
    const clients = FLEET_CONFIG.CLIENTS || [];
    if (!clients.length) {
      list.innerHTML = '<div style="text-align:center;color:#888;padding:20px;font-size:12px;">Aucun client configuré.<br>Créez-en un ci-dessus.</div>';
      return;
    }
    list.innerHTML = clients.map((c, i) => {
      const fcCount = (c.finalClients || []).length;
      return `<div class="cm-client-item" onclick="ui.cmSelectClient(${i})" style="padding:10px 12px;border-radius:8px;cursor:pointer;display:flex;align-items:center;gap:10px;transition:background 0.15s;" onmouseover="this.style.background='rgba(59,130,246,0.08)'" onmouseout="this.style.background=''">
        <span style="width:12px;height:12px;border-radius:50%;background:${c.color||'#3b82f6'};flex-shrink:0;"></span>
        <div style="flex:1;min-width:0;">
          <div style="font-weight:700;font-size:13px;color:var(--text-primary,var(--text-primary, #e2e8f0));white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${c.name}</div>
          <div style="font-size:10px;color:#888;">${fcCount} client(s) final(s)</div>
        </div>
        <i class="fa-solid fa-chevron-right" style="color:#555;font-size:10px;"></i>
      </div>`;
    }).join('');
  }

  // ── FIX: was called but never defined ──────────────────────
  // Fetches maintenance history from API and populates the maintenance history tab
  async fetchAndRenderMaintenance() {
    // ✅ FIX: correct container ID is 'maintenanceListContainer' not 'maintenanceHistoryContainer'
    const container = document.getElementById('maintenanceListContainer');
    if (!container) return;

    container.innerHTML = `<div style="padding:30px;text-align:center;color:var(--text-muted);"><i class="fa-solid fa-spinner fa-spin" style="font-size:24px;"></i><p>Chargement de l'historique...</p></div>`;

    try {
      const r = await fetch(`${FLEET_CONFIG.API.baseUrl}/api/maintenance?limit=1000`, {
        headers: { 'x-access-code': localStorage.getItem('fleetAccessCode') || '' }
      });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const json = await r.json();
      const logs = Array.isArray(json) ? json : (json.data || []);
      this.allMaintenanceLogs = logs;

      // KPI stats
      const totalCost = logs.reduce((s, l) => s + (l.cost || 0), 0);
      const urgentCount = logs.filter(l => l.priority === 'urgent').length;
      const thisMonthKey = new Date().toISOString().slice(0, 7);
      const thisMonth = logs.filter(l => new Date(l.date || l.createdAt).toISOString().slice(0, 7) === thisMonthKey).length;
      const types = [...new Set(logs.map(l => l.type).filter(Boolean))].sort();
      const trucks = [...new Set(logs.map(l => l.truckName).filter(Boolean))].sort();

      // Populate existing HTML filter dropdowns
      const typeSelect = document.getElementById('maintTypeFilter');
      if (typeSelect) {
        const extra = types.filter(t => !['Vidange','Plaquettes','Maintenance'].includes(t));
        extra.forEach(t => { if (![...typeSelect.options].find(o => o.value === t)) { const o = document.createElement('option'); o.value = t; o.textContent = t; typeSelect.appendChild(o); } });
      }

      // Build full layout: KPI bar + table
      container.innerHTML = `
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px;margin-bottom:20px;">
          <div class="maint-kpi-card" style="background:var(--bg-elevated);border:1px solid var(--border);border-radius:var(--radius-lg);padding:14px 16px;display:flex;align-items:center;gap:12px;box-shadow:var(--shadow-sm);">
            <div style="width:40px;height:40px;border-radius:var(--radius-md);background:var(--primary-subtle);display:flex;align-items:center;justify-content:center;flex-shrink:0;">
              <i class="fa-solid fa-clipboard-list" style="color:var(--primary);font-size:16px;"></i>
            </div>
            <div>
              <div style="font-size:24px;font-weight:800;color:var(--text-primary);line-height:1;">${logs.length}</div>
              <div style="font-size:10px;color:var(--text-muted);font-weight:600;margin-top:3px;text-transform:uppercase;letter-spacing:0.5px;">Total</div>
            </div>
          </div>
          <div class="maint-kpi-card" style="background:var(--bg-elevated);border:1px solid var(--border);border-radius:var(--radius-lg);padding:14px 16px;display:flex;align-items:center;gap:12px;box-shadow:var(--shadow-sm);">
            <div style="width:40px;height:40px;border-radius:var(--radius-md);background:var(--success-subtle);display:flex;align-items:center;justify-content:center;flex-shrink:0;">
              <i class="fa-solid fa-calendar-check" style="color:var(--success);font-size:16px;"></i>
            </div>
            <div>
              <div style="font-size:24px;font-weight:800;color:var(--text-primary);line-height:1;">${thisMonth}</div>
              <div style="font-size:10px;color:var(--text-muted);font-weight:600;margin-top:3px;text-transform:uppercase;letter-spacing:0.5px;">Ce mois</div>
            </div>
          </div>
          <div class="maint-kpi-card" style="background:var(--bg-elevated);border:1px solid var(--border);border-radius:var(--radius-lg);padding:14px 16px;display:flex;align-items:center;gap:12px;box-shadow:var(--shadow-sm);">
            <div style="width:40px;height:40px;border-radius:var(--radius-md);background:var(--danger-subtle);display:flex;align-items:center;justify-content:center;flex-shrink:0;">
              <i class="fa-solid fa-triangle-exclamation" style="color:var(--danger);font-size:16px;"></i>
            </div>
            <div>
              <div style="font-size:24px;font-weight:800;color:var(--text-primary);line-height:1;">${urgentCount}</div>
              <div style="font-size:10px;color:var(--text-muted);font-weight:600;margin-top:3px;text-transform:uppercase;letter-spacing:0.5px;">Urgentes</div>
            </div>
          </div>
          <div class="maint-kpi-card" style="background:var(--bg-elevated);border:1px solid var(--border);border-radius:var(--radius-lg);padding:14px 16px;display:flex;align-items:center;gap:12px;box-shadow:var(--shadow-sm);">
            <div style="width:40px;height:40px;border-radius:var(--radius-md);background:rgba(139,92,246,0.1);display:flex;align-items:center;justify-content:center;flex-shrink:0;">
              <i class="fa-solid fa-coins" style="color:#8b5cf6;font-size:16px;"></i>
            </div>
            <div style="min-width:0;">
              <div style="font-size:18px;font-weight:800;color:var(--text-primary);line-height:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${totalCost.toLocaleString('fr-FR')}&thinsp;DA</div>
              <div style="font-size:10px;color:var(--text-muted);font-weight:600;margin-top:3px;text-transform:uppercase;letter-spacing:0.5px;">Coût total</div>
            </div>
          </div>
        </div>
        <div style="background:var(--bg-elevated);border:1px solid var(--border);border-radius:var(--radius-xl);overflow:hidden;box-shadow:var(--shadow-sm);">
          <table style="width:100%;border-collapse:collapse;font-size:12px;font-family:var(--font-sans,inherit);">
            <thead>
              <tr style="background:var(--bg-surface);border-bottom:1px solid var(--border-strong);">
                <th style="padding:10px 14px;text-align:left;color:var(--text-muted);font-weight:700;font-size:10px;text-transform:uppercase;letter-spacing:0.6px;white-space:nowrap;">Date</th>
                <th style="padding:10px 14px;text-align:left;color:var(--text-muted);font-weight:700;font-size:10px;text-transform:uppercase;letter-spacing:0.6px;">Camion</th>
                <th style="padding:10px 14px;text-align:left;color:var(--text-muted);font-weight:700;font-size:10px;text-transform:uppercase;letter-spacing:0.6px;">Type</th>
                <th style="padding:10px 14px;text-align:left;color:var(--text-muted);font-weight:700;font-size:10px;text-transform:uppercase;letter-spacing:0.6px;">Compteur</th>
                <th style="padding:10px 14px;text-align:left;color:var(--text-muted);font-weight:700;font-size:10px;text-transform:uppercase;letter-spacing:0.6px;">Lieu</th>
                <th style="padding:10px 14px;text-align:left;color:var(--text-muted);font-weight:700;font-size:10px;text-transform:uppercase;letter-spacing:0.6px;max-width:200px;">Note / Technicien</th>
                <th style="padding:10px 14px;text-align:left;color:var(--text-muted);font-weight:700;font-size:10px;text-transform:uppercase;letter-spacing:0.6px;">Priorité</th>
                <th style="padding:10px 14px;text-align:left;color:var(--text-muted);font-weight:700;font-size:10px;text-transform:uppercase;letter-spacing:0.6px;">Coût</th>
                <th style="padding:10px 14px;text-align:left;color:var(--text-muted);font-weight:700;font-size:10px;text-transform:uppercase;letter-spacing:0.6px;">Statut</th>
                <th style="padding:10px 14px;text-align:center;color:var(--text-muted);font-weight:700;font-size:10px;text-transform:uppercase;letter-spacing:0.6px;">Actions</th>
              </tr>
            </thead>
            <tbody id="maintenanceHistoryList">${this._renderMaintenanceRows(logs)}</tbody>
          </table>
        </div>`;

      // Wire up existing HTML filter controls
      const applyBtn = document.getElementById('applyMaintFiltersBtn');
      if (applyBtn) applyBtn.onclick = () => this.applyMaintenanceHistoryFilters();
      const exportBtn = document.getElementById('exportMaintBtn');
      if (exportBtn) exportBtn.onclick = () => this.exportMaintenanceCSV();
      const truckSearch = document.getElementById('maintTruckSearch');
      if (truckSearch) truckSearch.oninput = () => this.applyMaintenanceHistoryFilters();
      const typeF = document.getElementById('maintTypeFilter');
      if (typeF) typeF.onchange = () => this.applyMaintenanceHistoryFilters();
      const dateS = document.getElementById('maintDateStart');
      if (dateS) dateS.onchange = () => this.applyMaintenanceHistoryFilters();
      const dateE = document.getElementById('maintDateEnd');
      if (dateE) dateE.onchange = () => this.applyMaintenanceHistoryFilters();

      // Apply initial filters so the default 'today' dates are respected immediately
      this.applyMaintenanceHistoryFilters();


    } catch(e) {
      console.warn('fetchAndRenderMaintenance failed:', e.message);
      if (container) container.innerHTML = `<div style="padding:30px;color:var(--danger,#ef4444);text-align:center;"><i class="fa-solid fa-triangle-exclamation" style="font-size:28px;display:block;margin-bottom:8px;"></i><strong>Impossible de charger l'historique maintenance</strong><br><span style="font-size:11px;color:var(--text-muted);">${e.message}</span><br><button class="btn-secondary" style="margin-top:12px;" onclick="ui.fetchAndRenderMaintenance()"><i class="fa-solid fa-rotate"></i> Réessayer</button></div>`;
    }
  }

  _updateFinalClientSelect(clientId, targetSelectId) {
    const sel = document.getElementById(targetSelectId);
    if(!sel) return;
    if(!clientId) {
       sel.innerHTML = '<option value="">— Sélectionnez d\'abord un client —</option>';
       return;
    }
    const c = (FLEET_CONFIG.CLIENTS||[]).find(x => x.id === clientId);
    if(!c || !c.finalClients || c.finalClients.length === 0) {
       sel.innerHTML = '<option value="">— Aucun client final —</option>';
       return;
    }
    sel.innerHTML = '<option value="">— Aucun —</option>' + c.finalClients.map(fc => `<option value="${fc.id}">${fc.name}</option>`).join('');
  }

  _addNewClientFromModal2() {
    const name = document.getElementById('zm_new_client_name')?.value.trim();
    const color = document.getElementById('zm_new_client_color')?.value || '#3b82f6';
    if (!name) return alert('Nom de client requis.');
    
    if (!FLEET_CONFIG.CLIENTS) FLEET_CONFIG.CLIENTS = [];
    FLEET_CONFIG.CLIENTS.push({ id: 'client_' + Date.now(), name, color, finalClients: [] });
    this.saveSettingsToCloud();
    this.openZoneManagementModal();
    setTimeout(() => {
        const tabs = document.querySelectorAll('.zmTab');
        if (tabs.length > 2) tabs[2].click();
    }, 50);
    if(window.showToast) showToast(`\u2705 Client "${name}" créé !`, 'success');
  }

  _acceptSuggestion(lat, lng, wilaya, name) {
    document.querySelectorAll('.zmTab')[1].click(); // Go to ADD ZONE tab
    setTimeout(() => {
      const nameInp = document.getElementById('zm_name');
      const wilInp = document.getElementById('zm_wilaya');
      const latInp = document.getElementById('zm_lat');
      const lngInp = document.getElementById('zm_lng');
      if(nameInp) nameInp.value = name;
      if(wilInp) wilInp.value = wilaya;
      if(latInp) latInp.value = lat;
      if(lngInp) lngInp.value = lng;
    }, 100);
  }

  async detectPotentialZones() {
    if (!window.app || !app.trucks) return;
    if (!this._stopTracker) this._stopTracker = new Map();
    
    const now = Date.now();
    const trucks = Array.from(app.trucks.values());
    const validStoppedTrucks = [];
    
    trucks.forEach(t => {
      if (t.speed <= 2 && t.coordinates) {
        let tracker = this._stopTracker.get(t.id);
        if (!tracker) {
          tracker = { coords: t.coordinates, since: now, truck: t };
          this._stopTracker.set(t.id, tracker);
        } else {
          const R = 6371; 
          const dLat = (t.coordinates.lat - tracker.coords.lat) * Math.PI / 180;
          const dLng = (t.coordinates.lng - tracker.coords.lng) * Math.PI / 180;
          const a = Math.sin(dLat/2) * Math.sin(dLat/2) + Math.cos(tracker.coords.lat * Math.PI / 180) * Math.cos(t.coordinates.lat * Math.PI / 180) * Math.sin(dLng/2) * Math.sin(dLng/2);
          const d = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
          if (d > 0.5) {
             tracker.coords = t.coordinates;
             tracker.since = now;
          }
        }
        
        // 1 hour = 3600000 ms
        if (now - tracker.since >= 3600000) {
          validStoppedTrucks.push(t);
        }
      } else {
        this._stopTracker.delete(t.id);
      }
    });

    const clusters = [];
    
    // Simple clustering logic
    validStoppedTrucks.forEach(t => {
      const lat = t.coordinates.lat;
      const lng = t.coordinates.lng;
      let found = false;
      for (let c of clusters) {
        const R = 6371; 
        const dLat = (lat - c.lat) * Math.PI / 180;
        const dLng = (lng - c.lng) * Math.PI / 180;
        const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
          Math.cos(c.lat * Math.PI / 180) * Math.cos(lat * Math.PI / 180) *
          Math.sin(dLng/2) * Math.sin(dLng/2);
        const d = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        if (d <= 0.5) { // 500 meters
          c.trucks.push(t);
          c.lat = c.trucks.reduce((s, tr) => s + tr.coordinates.lat, 0) / c.trucks.length;
          c.lng = c.trucks.reduce((s, tr) => s + tr.coordinates.lng, 0) / c.trucks.length;
          found = true;
          break;
        }
      }
      if (!found) clusters.push({ lat, lng, trucks: [t] });
    });
    
    // Filter clusters with >= 2 trucks
    const potential = clusters.filter(c => c.trucks.length >= 2);
    
    // Filter out existing zones
    const existingZones = FLEET_CONFIG.CUSTOM_LOCATIONS || [];
    const newSuggestions = potential.filter(c => {
      return !existingZones.some(z => {
        const R = 6371; 
        const dLat = (c.lat - z.lat) * Math.PI / 180;
        const dLng = (c.lng - z.lng) * Math.PI / 180;
        const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
          Math.cos(z.lat * Math.PI / 180) * Math.cos(c.lat * Math.PI / 180) *
          Math.sin(dLng/2) * Math.sin(dLng/2);
        const d = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        return d <= ((z.radius || 500) / 1000) + 0.1;
      });
    });
    
    // Update UI if modal is open
    const section = document.getElementById('suggestedZonesSection');
    const list = document.getElementById('suggestedZonesList');
    const badge = document.getElementById('suggestedZonesBadge');
    
    if (section && list && badge) {
      if (newSuggestions.length > 0) {
        section.style.display = 'block';
        badge.style.display = 'flex';
        badge.innerText = newSuggestions.length;
        
        // Reverse geocode the suggestions using Geoapify
        const htmls = await Promise.all(newSuggestions.map(async (s, i) => {
          let address = "Lieu Inconnu";
          let wilaya = "Algérie";
          try {
            const res = await fetch("https://api.geoapify.com/v1/geocode/reverse?lat=" + s.lat + "&lon=" + s.lng + "&apiKey=44c4cd0de9754f738f6bdfde5fb8f448");
            if (res.ok) {
              const data = await res.json();
              if (data.features && data.features.length > 0) {
                const props = data.features[0].properties;
                address = props.formatted || (props.city + ', ' + props.state);
                wilaya = props.state || props.county || "Algérie";
              }
            }
          } catch(e) {}
          
          const trucksListHtml = s.trucks.map(t => {
            const tr = this._stopTracker.get(t.id);
            const hours = tr ? Math.floor((now - tr.since) / 3600000) : 1;
            const mins = tr ? Math.floor(((now - tr.since) % 3600000) / 60000) : 0;
            return "↳ " + t.name + " (" + hours + "h " + mins + "m)";
          }).join("<br>");

          return `<div style="background:linear-gradient(to right, rgba(245,158,11,0.05), rgba(245,158,11,0.1));border:1px solid rgba(245,158,11,0.3);border-radius:10px;padding:12px;display:flex;flex-direction:column;gap:8px;">
            <div style="display:flex;justify-content:space-between;align-items:start;">
              <div>
                <div style="font-size:12px;font-weight:800;color:var(--warning);">\ud83d\udccd ${address.substring(0, 30)}...</div>
                <div style="font-size:10px;color:var(--text-muted);margin-top:2px;">${s.lat.toFixed(4)}, ${s.lng.toFixed(4)}</div>
              </div>
              <span style="background:var(--warning);color:black;padding:2px 6px;border-radius:10px;font-size:9px;font-weight:800;">${s.trucks.length} CAMIONS ICI</span>
            </div>
            <div style="font-size:10px;color:var(--text-secondary);font-family:monospace;">${trucksListHtml}</div>
            <button onclick="ui._acceptSuggestion(${s.lat}, ${s.lng}, '${wilaya.replace(/'/g, "\\'")}', '${address.replace(/'/g, "\\'").substring(0,25)}')" style="background:var(--warning);color:black;border:none;border-radius:6px;padding:6px;font-size:11px;font-weight:800;cursor:pointer;margin-top:4px;"><i class="fa-solid fa-plus"></i> Créer la Zone</button>
          </div>`;
        }));
        list.innerHTML = htmls.join('');
      } else {
        section.style.display = 'none';
        list.innerHTML = '';
      }
    }
  }

  _zoneGoToMap(e, deviceId, truckName) {
    if (e && e.stopPropagation) e.stopPropagation();

    // Close any open zone report modal
    const modal = document.getElementById('zoneReportModal');
    if (modal) modal.remove();
    if (this._zoneCountdownTimer) { clearInterval(this._zoneCountdownTimer); this._zoneCountdownTimer = null; }

    // Helper: find truck from any available cache
    const findTruck = () => {
      let t = null;
      if (window.app && app.trucks) {
        if (deviceId) {
          t = app.trucks.get(String(deviceId));
          if (!t) { for (const [, v] of app.trucks) { if (String(v.deviceId) === String(deviceId) || v.id === String(deviceId)) { t = v; break; } } }
        }
        if (!t && truckName) { for (const [, v] of app.trucks) { if (v.name === truckName || v.name?.toLowerCase() === truckName?.toLowerCase()) { t = v; break; } } }
      }
      // Fallback to AlgeriaMap truckDataCache
      if (!t && window.AlgeriaMap?.truckDataCache?.length) {
        const cache = window.AlgeriaMap.truckDataCache;
        if (deviceId) t = cache.find(v => String(v.id) === String(deviceId) || String(v.deviceId) === String(deviceId));
        if (!t && truckName) t = cache.find(v => v.name === truckName);
      }
      return t;
    };

    // STEP 1: Switch to map tab
    const mapNavBtn = document.querySelector('[data-tab="byWilaya"]');
    if (mapNavBtn) mapNavBtn.click();
    else this.switchTab('byWilaya');
    if (this.zoneGroupingMode !== 'map') this.setZoneGrouping('map');

    // STEP 2: Scroll to top so map is visible
    window.scrollTo({ top: 0, behavior: 'smooth' });

    // STEP 3: Retry until truck & GPS coords are available (up to 8s for fresh-page-load)
    const MAX_ATTEMPTS = 20;
    const RETRY_MS = 400;
    const histCoords = this._historyFocusCoords;
    this._historyFocusCoords = null;

    const attemptFly = (attempt) => {
      const truck = findTruck();
      const am = window.AlgeriaMap;

      if (!am || !am.map) {
        if (attempt < MAX_ATTEMPTS) setTimeout(() => attemptFly(attempt + 1), RETRY_MS);
        return;
      }
      try { am.map.resize(); } catch(err) {}
      const canvas = am.map.getCanvas();
      if (!canvas || canvas.width === 0) {
        if (attempt < MAX_ATTEMPTS) setTimeout(() => attemptFly(attempt + 1), RETRY_MS);
        return;
      }

      // If truck not found yet, keep retrying (page may still be loading data)
      if (!truck && !histCoords) {
        if (attempt < MAX_ATTEMPTS) setTimeout(() => attemptFly(attempt + 1), RETRY_MS);
        else if (window.showToast) showToast('⚠️ Camion introuvable sur la carte.', 'warning');
        return;
      }

      const targetLat = histCoords ? histCoords.lat : (truck?.coordinates?.lat || truck?.lat || null);
      const targetLng = histCoords ? histCoords.lng : (truck?.coordinates?.lng || truck?.lng || null);
      const truckId = truck?.id || deviceId;

      if (!targetLat || !targetLng) {
        // No GPS but truck found — isolate it anyway
        if (truckId && am.selectTruckById) am.selectTruckById(truckId);
        return;
      }

      // Fly then isolate
      am.map.flyTo({ center: [targetLng, targetLat], zoom: 16, essential: true, duration: 2000 });
      setTimeout(() => {
        if (am.selectTruckById) am.selectTruckById(truckId);
      }, 1300);
    };

    // Give switchTab 600ms to initialize the map before first attempt
    setTimeout(() => attemptFly(0), 600);
  }

async loadZoneHistory() {
  const container = document.getElementById('zoneHistoryTable');
  const statsBar = document.getElementById('zrStatsBar');
  if (!container) return;
  container.innerHTML = '<div class="zr-empty">⏳ Chargement...</div>';

  const zone        = document.getElementById('zrFilterZone')?.value || '';
  const truck       = document.getElementById('zrFilterTruck')?.value || '';
  const start       = document.getElementById('zrFilterStart')?.value || '';
  const end         = document.getElementById('zrFilterEnd')?.value || '';
  const exitStart   = document.getElementById('zrFilterExitStart')?.value || '';
  const exitEnd     = document.getElementById('zrFilterExitEnd')?.value || '';
  const minDuration = document.getElementById('zrFilterMinDur')?.value || '';
  const maxDuration = document.getElementById('zrFilterMaxDur')?.value || '';
  const verifiedOnly = document.getElementById('zrFilterVerified')?.checked;

  let url = `${FLEET_CONFIG.API.baseUrl}/api/zone-events?limit=2000`;
  if (zone)        url += `&zone=${encodeURIComponent(zone)}`;
  if (truck)       url += `&truck=${encodeURIComponent(truck)}`;
  if (start)       url += `&entryStart=${new Date(start).toISOString()}`;
  if (end)         url += `&entryEnd=${new Date(end + 'T23:59:59').toISOString()}`;
  if (exitStart)   url += `&exitStart=${new Date(exitStart).toISOString()}`;
  if (exitEnd)     url += `&exitEnd=${new Date(exitEnd + 'T23:59:59').toISOString()}`;
  if (minDuration) url += `&minDuration=${minDuration}`;
  if (maxDuration) url += `&maxDuration=${maxDuration}`;
  if (verifiedOnly) url += `&verified=true`;

  try {
    const res  = await fetch(url, { headers: { 'x-access-code': this.currentCode } });
    const raw  = await res.json();
    const data = Array.isArray(raw) ? raw : (raw && raw.data ? raw.data : []);
    this._zoneData = data;

    if (!data.length) {
      container.innerHTML = '<div class="zr-empty">Aucun événement trouvé</div>';
      if (statsBar) statsBar.style.display = 'none';
      return;
    }

    // Stats bar
    const closed   = data.filter(e => e.status === 'closed');
    const verified = data.filter(e => e.source === 'vérifié' || e.entryConfirmed);
    const avgDur   = closed.length ? Math.round(closed.reduce((s,e) => s + (e.durationMinutes||0), 0) / closed.length) : 0;
    if (statsBar) {
      statsBar.style.display = 'grid';
      statsBar.innerHTML = [
        { val: data.length,                                 label: 'Visites',    color: '#818cf8' },
        { val: new Set(data.map(e=>e.truckName)).size,      label: 'Camions',    color: '#38bdf8' },
        { val: new Set(data.map(e=>e.zoneName)).size,       label: 'Zones',      color: '#fb923c' },
        { val: avgDur + ' min',                             label: 'Durée Moy.', color: '#4ade80' },
        { val: `${verified.length}/${data.length}`,         label: 'Vérifiés',   color: '#4ade80' }
      ].map(s => `<div class="zr-stat"><div class="zr-stat-val" style="color:${s.color};">${s.val}</div><div class="zr-stat-label">${s.label}</div></div>`).join('');
    }

    // Table
    container.innerHTML = `<table class="zr-table">
      <thead><tr>
        <th>Date Entrée</th><th>Camion</th><th>Zone</th>
        <th>Heure Entrée</th><th>Date/Heure Sortie</th>
        <th>Durée</th><th>Statut</th><th>Source</th><th>Voir</th>
      </tr></thead>
      <tbody>${data.map(e => {
        const entryDt = new Date(e.entryTime);
        const exitDt  = e.exitTime ? new Date(e.exitTime) : null;
        const durH = Math.floor((e.durationMinutes||0)/60);
        const durM = (e.durationMinutes||0)%60;
        const dur  = e.durationMinutes != null ? (durH > 0 ? `${durH}h ${durM}m` : `${durM}m`) : '—';
        const statusBadge = e.status === 'open'
          ? `<span class="zr-op-status arrived">En cours</span>`
          : `<span class="zr-op-status completed">Terminé</span>`;
        const isVerif = e.source === 'vérifié' || e.entryConfirmed;
        const srcBadge = isVerif
          ? `<span style="background:rgba(74,222,128,0.15);border:1px solid rgba(74,222,128,0.4);color:#4ade80;border-radius:6px;padding:2px 7px;font-size:10px;font-weight:700;">✅ Vérifié</span>`
          : `<span style="background:rgba(251,146,60,0.15);border:1px solid rgba(251,146,60,0.3);color:#fb923c;border-radius:6px;padding:2px 7px;font-size:10px;font-weight:700;">⏳ En attente</span>`;
        return `<tr style="cursor:pointer;" onclick="ui._zoneHistoryRowClick('${e.deviceId||''}','${e.truckName}',${e.entryLat||'null'},${e.entryLng||'null'},'${e.entryTime}','${e.exitTime||''}')" title="Voir sur la carte">
          <td>${entryDt.toLocaleDateString('fr-FR')}</td>
          <td style="font-weight:600;color:#38bdf8;">${e.truckName}</td>
          <td style="color:#818cf8;">${e.zoneName}</td>
          <td>${entryDt.toLocaleTimeString('fr-FR')}</td>
          <td>${exitDt ? exitDt.toLocaleDateString('fr-FR')+' '+exitDt.toLocaleTimeString('fr-FR') : '—'}</td>
          <td class="zr-dur">${dur}</td>
          <td>${statusBadge}</td>
          <td>${srcBadge}</td>
          <td><button onclick="event.stopPropagation();ui._zoneHistoryRowClick('${e.deviceId||''}','${e.truckName}',${e.entryLat||'null'},${e.entryLng||'null'},'${e.entryTime}','${e.exitTime||''}')" style="background:rgba(56,189,248,0.1);border:1px solid rgba(56,189,248,0.3);color:#38bdf8;border-radius:6px;padding:3px 8px;cursor:pointer;font-size:10px;font-weight:700;"><i class="fa-solid fa-crosshairs" style="margin-right:3px;"></i>Voir</button></td>
        </tr>`;
      }).join('')}</tbody>
    </table>`;
  } catch (e) {
    container.innerHTML = `<div class="zr-empty" style="color:var(--color-error);">Erreur: ${e.message}</div>`;
  }
}

exportZoneCSV() {
  const data = this._zoneData || [];
  if (!data.length) { alert('Aucune donnée à exporter.'); return; }
  let csv = '\uFEFFDate,Camion,Zone,Type Zone,Entrée,Sortie,Durée (min),Durée (h),Statut,Source\n';
  data.forEach(e => {
    csv += `"${e.entryTime?.slice(0,10)}","${e.truckName}","${e.zoneName}","${e.zoneType}","${e.entryTime}","${e.exitTime||''}","${e.durationMinutes||''}","${e.durationHours||''}","${e.status}","${e.source}"\n`;
  });
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
  a.download = `RAPPORT_ZONE_${new Date().toISOString().slice(0,10)}.csv`; a.click();
}

async runZoneHistoryScan() {
  const btn = document.getElementById('btnZoneScan');
  const status = document.getElementById('zoneScanStatus');
  const start = document.getElementById('zoneScanStart')?.value;
  const end = document.getElementById('zoneScanEnd')?.value;
  if (!start || !end) { alert('Sélectionnez une période'); return; }
  if (btn) { btn.disabled = true; btn.innerHTML = '⏳ Scan...'; }
  if (status) status.textContent = 'Scan en cours...';
  try {
    const res = await fetch(`${FLEET_CONFIG.API.baseUrl}/api/zone-events/scan-history`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-access-code': this.currentCode },
      body: JSON.stringify({ start: new Date(start).toISOString(), end: new Date(end).toISOString() })
    });
    const d = await res.json();
    if (status) status.textContent = `\u2705 ${d.summary?.created || 0} événements`;
    if (typeof showToast !== 'undefined') showToast(`\u2705 ${d.summary?.created || 0} événements zone créés`, 'success');
    this.loadZoneHistory();
  } catch (e) {
    if (status) status.textContent = `❌ ${e.message}`;
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-radar"></i> Scanner'; }
  }
}


  getDistKm(lat1, lon1, lat2, lon2) {
    const R = 6371; 
    const dLat = (lat2-lat1) * Math.PI/180;
    const dLon = (lon2-lon1) * Math.PI/180;
    const a = Math.sin(dLat/2)*Math.sin(dLat/2) + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180) * Math.sin(dLon/2)*Math.sin(dLon/2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
} 
  


  normalizeHistoryMessages(rawHistory) {
      return (rawHistory || []).map(p => {
          if (Array.isArray(p)) {
              const params = (p[6] && typeof p[6] === 'object')
                  ? p[6]
                  : ((p[7] && typeof p[7] === 'object') ? p[7] : ((p[8] && typeof p[8] === 'object') ? p[8] : {}));
              const rawT = typeof p[0] === 'string' ? p[0].replace(' ', 'T') : p[0];
              const tMs = new Date(rawT).getTime();
              return {
                  time: tMs,
                  dateObj: new Date(rawT),
                  lat: parseFloat(p[1]),
                  lng: parseFloat(p[2]),
                  speed: parseFloat((p[5] !== undefined ? p[5] : p[3]) || 0) || 0,
                  params: params
              };
          }
          const timeValue = p.time || p.timestamp || p.t;
          const rawT = typeof timeValue === 'string' ? timeValue.replace(' ', 'T') : timeValue;
          const tMs = new Date(rawT).getTime();
          return {
              time: tMs,
              dateObj: new Date(rawT),
              lat: parseFloat(p.lat),
              lng: parseFloat(p.lng),
              speed: parseFloat(p.speed || 0) || 0,
              params: p.params || {}
          };
      }).filter(p => Number.isFinite(p.time) && Number.isFinite(p.lat) && Number.isFinite(p.lng) && p.lat !== 0 && p.lng !== 0)
        .sort((a, b) => a.time - b.time);
  }

  getDecouchageSafeZones() {
      return (FLEET_CONFIG.CUSTOM_LOCATIONS || []).filter(loc => loc.type === 'douroub' || loc.type === 'depot');
  }

  getClosestDecouchageSafeZone(lat, lng) {
      const safeZones = this.getDecouchageSafeZones();
      if (!safeZones.length) return { isSafe: false, distanceKm: null, zone: null };

      let closestZone = null;
      let closestDistanceKm = Infinity;

      for (const zone of safeZones) {
          const distKm = this.getDistKm(lat, lng, zone.lat, zone.lng);
          if (distKm < closestDistanceKm) {
              closestDistanceKm = distKm;
              closestZone = zone;
          }
          if (distKm <= (zone.radius ? zone.radius / 1000 : 0.5)) {
              return { isSafe: true, distanceKm: distKm, zone };
          }
      }

      return { isSafe: false, distanceKm: closestDistanceKm, zone: closestZone };
  }

  async buildExactDecouchageEventsFromPoints(points, truck) {
      const events = [];
      const processedNights = new Set();

      for (const p of points) {
          const hour = p.dateObj.getHours();
          if (hour < 0 || hour >= 5) continue;

          const nightOfDate = new Date(p.dateObj);
          nightOfDate.setDate(nightOfDate.getDate() - 1);
          const nightStr = nightOfDate.toISOString().split('T')[0];

          if (processedNights.has(nightStr)) continue;
          processedNights.add(nightStr);

          const safeInfo = this.getClosestDecouchageSafeZone(p.lat, p.lng);
          if (safeInfo.isSafe) continue;

          const address = await geocodeService.reverseGeocode(p.lat, p.lng);
          events.push({
              date: nightStr,
              detectedAt: p.dateObj.toISOString(),
              snapshotTime: p.dateObj.toISOString(),
              deviceId: truck.id,
              truckName: truck.name,
              locationAtMidnight: { lat: p.lat, lng: p.lng },
              locationName: address,
              distanceFromSite: safeInfo.distanceKm !== null ? Math.round(safeInfo.distanceKm * 1000) : 0,
              isClosed: true,
              durationStr: 'Nuit dehors',
              startTime: p.dateObj.toISOString(),
              detectedAtMs: p.time,
              nightKey: `${truck.id}_${nightStr}`
          });
      }

      return events;
  }

  async fetchHistoryMessagesForTruck(truckId, startDate, endDate) {
      const response = await fetch(`${FLEET_CONFIG.API.baseUrl}/api/history?imei=${truckId}&start=${startDate}&end=${endDate}`);
      if (!response.ok) throw new Error(`History API ${response.status}`);
      const json = await response.json();
      if (Array.isArray(json)) return json;
      if (json && Array.isArray(json.messages)) return json.messages;
      return [];
  }

  async generateExactDecouchageDataset(selectedIds, startDate, endDate, onProgress = null) {
      const logs = [];

      for (let index = 0; index < selectedIds.length; index++) {
          const truckId = selectedIds[index];
          const truck = (typeof app !== 'undefined' && app.trucks && app.trucks.get(truckId))
              ? app.trucks.get(truckId)
              : { id: truckId, name: truckId };

          if (onProgress) onProgress({ done: index + 1, total: selectedIds.length, truckName: truck.name });

          try {
              const rawHistory = await this.fetchHistoryMessagesForTruck(truckId, startDate, endDate);
              const points = this.normalizeHistoryMessages(rawHistory);
              const truckLogs = await this.buildExactDecouchageEventsFromPoints(points, truck);
              logs.push(...truckLogs);
          } catch (e) {
              console.warn(`Decouchage exact skipped for ${truck.name}:`, e);
          }
      }

      logs.sort((a, b) => new Date(b.detectedAt) - new Date(a.detectedAt));
      return logs;
  }

  getNightWindowFetchRange(startNightStr, endNightStr) {
      const start = new Date(`${startNightStr}T00:00:00`);
      start.setDate(start.getDate() + 1);
      start.setHours(0, 0, 0, 0);

      const end = new Date(`${endNightStr}T00:00:00`);
      end.setDate(end.getDate() + 1);
      end.setHours(5, 59, 59, 999);

      const pad = (n) => String(n).padStart(2, '0');
      const toApi = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
      return { start: toApi(start), end: toApi(end) };
  }
// 🧮 ANALYZER V6: STRICT NIGHT (00-05h) + CUTOFF DÉCOUCHAGE
// 🧮 ANALYZER V7: TIMEZONE FIX + CUTOFF LOGIC
  analyzeTruckPrecise(rawPoints, truck) {
      // 1. Safety Check
      if (!rawPoints || !Array.isArray(rawPoints) || rawPoints.length < 5) {
          return { distance: 0, consumption: 0, avgConso: 0, refillCount: 0, refillVolume: 0, stopDuration: "0h", drivingDuration: "0h", nightDuration: "0h", maxSpeed: 0, decouchageCount: 0 };
      }

      // 2. CLEAN & SORT
      let points = rawPoints.map(p => {
          if (Array.isArray(p)) {
              return {
                  time: new Date(p[0]).getTime(),
                  // 🚨 FIX: Use raw string split for Date to avoid Timezone shifting
                  // "2025-12-01 00:30" -> "2025-12-01" (Stays on same day)
                  dateStr: p[0].split(' ')[0], 
                  lat: parseFloat(p[1]),
                  lng: parseFloat(p[2]),
                  speed: parseInt(p[5]),
                  params: p[6] || {}
              };
          }
          return p; 
      }).filter(p => p.params && p.params.io192 && parseInt(p.params.io192) > 1000);

      points.sort((a, b) => a.time - b.time);
      if (points.length < 2) return { distance: 0, consumption: 0, avgConso: 0, refillCount: 0, refillVolume: 0, stopDuration: "0h", drivingDuration: "0h", nightDuration: "0h", maxSpeed: 0, decouchageCount: 0 };

      // 3. SETUP VARIABLES
      const startOdo = parseInt(points[0].params.io192);
      const endOdo = parseInt(points[points.length - 1].params.io192);
      const totalDist = (endOdo > startOdo) ? (endOdo - startOdo) / 1000 : 0;

	      const truckConfig = getTruckConfig(truck.id);
	      const effectiveTankCap = getConfiguredFuelEffectiveCapacity(truckConfig) || truckConfig.fuelTankCapacity || 600;
	      const fuelSeries = points.map((pt) => ({
	          time: pt.time,
	          liters: calculateFuelMetricsFromParams(pt.params || {}, truckConfig).liters,
	          speed: pt.speed,
	          ign: parseInt((pt.params || {}).io1 ?? (pt.params || {}).acc ?? 0, 10) || 0,
	          lat: pt.lat,
	          lng: pt.lng
	      }));
	      const refillEvents = (typeof detectRefillEventsFromSeries === 'function')
	          ? detectRefillEventsFromSeries(fuelSeries, {
	              minRefuelLiters: Math.max(60, parseFloat((FLEET_CONFIG.REFUEL_RULES || {}).minRefuelLiters || 60) || 60),
	              maxRealisticRefillLiters: Math.max(600, Math.round(effectiveTankCap + 50)),
	              dedupeMinutes: 5,
	              dedupeLitersTolerance: 10,
	              baselineDropToleranceLiters: 15,
	              stopSpeedThreshold: 4
	          })
	          : [];

	      let refillCount = refillEvents.length, refillVolume = refillEvents.reduce((sum, evt) => sum + (evt.addedLiters || 0), 0);
	      const smoothedFuel = (typeof smoothFuelSeriesPoints === 'function')
	          ? smoothFuelSeriesPoints(fuelSeries, 5, effectiveTankCap + 50)
	          : fuelSeries;
	      const fuelStart = smoothedFuel.length > 0
	          ? (smoothedFuel[0].litersSmooth ?? smoothedFuel[0].liters ?? 0)
	          : (fuelSeries[0]?.liters || 0);
	      const fuelEnd = smoothedFuel.length > 0
	          ? (smoothedFuel[smoothedFuel.length - 1].litersSmooth ?? smoothedFuel[smoothedFuel.length - 1].liters ?? 0)
	          : (fuelSeries[fuelSeries.length - 1]?.liters || 0);
	      const consumedLiters = (fuelStart > 0 || fuelEnd > 0)
	          ? Math.max(0, Math.round((fuelStart + refillVolume - fuelEnd) * 10) / 10)
	          : 0;

	      let movingMs = 0, nightMs = 0, stopMs = 0, maxSpeed = 0;

      // 4. DÉCOUCHAGE SETUP (Site Douroub)
      const SITE_LAT = 34.8331;
      const SITE_LNG = 5.6996;
      const SITE_RADIUS_KM = 0.5; // 500m
      const nightDecisions = {}; 

      // Distance Helper
      const getDistKm = (lat1, lon1, lat2, lon2) => {
          const R = 6371; 
          const dLat = (lat2-lat1) * Math.PI/180;
          const dLon = (lon2-lon1) * Math.PI/180;
          const a = Math.sin(dLat/2)*Math.sin(dLat/2) + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180) * Math.sin(dLon/2)*Math.sin(dLon/2);
          return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
      };

      for (let i = 1; i < points.length; i++) {
          const p = points[i];
          const prev = points[i-1];
          const timeDiff = p.time - prev.time;
          const hour = new Date(p.time).getHours();

	          // A. FUEL: Consumption calculated via harmonized mass-balance formulation (F21)

          // B. OPS
          if (p.speed > maxSpeed) maxSpeed = p.speed;
          if (p.speed > 5) { 
              movingMs += timeDiff; 
              if (hour >= 0 && hour < 5) nightMs += timeDiff; 
          } else {
              stopMs += timeDiff;
          }

          // C. DÉCOUCHAGE (Strict 00:00 - 05:00 Check)
          if (hour >= 0 && hour < 5) {
              // Only check ONCE per night (The first point we see)
              if (nightDecisions[p.dateStr] === undefined) {
                  const dist = getDistKm(p.lat, p.lng, SITE_LAT, SITE_LNG);
                  if (dist <= SITE_RADIUS_KM) {
                      nightDecisions[p.dateStr] = 'SAFE'; // Inside at start -> Sleeping Home
                  } else {
                      nightDecisions[p.dateStr] = 'DECOUCHAGE'; // Outside at start -> Decouchage
                  }
              }
          }
      }

      let decouchageCount = 0;
      Object.values(nightDecisions).forEach(status => {
          if (status === 'DECOUCHAGE') decouchageCount++;
      });

      const toHours = (ms) => (ms / (1000 * 60 * 60)).toFixed(1) + "h";

      return {
          distance: totalDist.toFixed(1),
          consumption: consumedLiters.toFixed(1),
          avgConso: totalDist > 5 ? ((consumedLiters / totalDist) * 100).toFixed(1) : 0,
          refillCount: refillCount,
          refillVolume: refillVolume.toFixed(1),
          stopDuration: toHours(stopMs),
          drivingDuration: toHours(movingMs),
          nightDuration: toHours(nightMs),
          maxSpeed: maxSpeed + " km/h",
          decouchageCount: decouchageCount 
      };
  }
  
  // 🧮 SMART ANALYZER (Handles your API's Array Format ["time", "lat", "lng"...])
  analyzeTruckMonth(rawPoints, truck) {
      if (!rawPoints || !Array.isArray(rawPoints) || rawPoints.length < 5) {
          return { distance: 0, consumption: 0, refillCount: 0, refillVolume: 0, stopCount: 0, note: "Pas assez de données" };
      }

      // --- 1. NORMALIZE DATA (The Fix for "Empty" Reports) ---
      // Converts ["2025...", "36.1", "5.2"...] to { lat:36.1, lng:5.2 }
      const points = rawPoints.map(p => {
          if (Array.isArray(p)) {
              return {
                  time: p[0],
                  lat: parseFloat(p[1]),
                  lng: parseFloat(p[2]),
                  speed: parseInt(p[5]),
                  params: p[6] // The sensors are here
              };
          }
          return p; // Already an object? Keep it.
      });

      // --- 2. SENSOR CONFIG ---
      const truckConfig = getTruckConfig(truck.id);
      
      let totalDist = 0;
      let stopCount = 0;
      const effectiveTankCap = getConfiguredFuelEffectiveCapacity(truckConfig) || truckConfig.fuelTankCapacity || 600;
      const fuelSeries = points.map((pt) => ({
          time: new Date(pt.time).getTime() || 0,
          liters: calculateFuelMetricsFromParams(pt.params || {}, truckConfig).liters,
          speed: pt.speed,
          ign: parseInt((pt.params || {}).io1 ?? (pt.params || {}).acc ?? 0, 10) || 0,
          lat: pt.lat,
          lng: pt.lng
      }));
      const refillEvents = (typeof detectRefillEventsFromSeries === 'function')
          ? detectRefillEventsFromSeries(fuelSeries, {
              minRefuelLiters: Math.max(60, parseFloat((FLEET_CONFIG.REFUEL_RULES || {}).minRefuelLiters || 60) || 60),
              maxRealisticRefillLiters: Math.max(600, Math.round(effectiveTankCap + 50)),
              dedupeMinutes: 5,
              dedupeLitersTolerance: 10,
              baselineDropToleranceLiters: 15,
              stopSpeedThreshold: 4
          })
          : [];
      let refillCount = refillEvents.length;
      let refillVolume = refillEvents.reduce((sum, evt) => sum + (evt.addedLiters || 0), 0);
      let lastLat = null, lastLng = null;
      
      points.forEach(p => {
          // A. Distance
          if (p.lat && p.lng && p.lat !== 0) {
              if (lastLat) {
                  const R = 6371; 
                  const dLat = (p.lat - lastLat) * Math.PI / 180;
                  const dLng = (p.lng - lastLng) * Math.PI / 180;
                  const a = Math.sin(dLat/2)*Math.sin(dLat/2) + Math.cos(lastLat*Math.PI/180)*Math.cos(p.lat*Math.PI/180) * Math.sin(dLng/2)*Math.sin(dLng/2);
                  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
                  totalDist += R * c;
              }
              lastLat = p.lat;
              lastLng = p.lng;
          }

          // B. Stops
          if (p.speed === 0) stopCount++;
      });

      return {
          distance: totalDist.toFixed(1),
          consumption: (totalDist * (getTruckConfig(truck.id).fuelConsumption || 35) / 100).toFixed(1),
          refillCount: refillCount,
          refillVolume: refillVolume.toFixed(1),
          stopCount: (stopCount / 60).toFixed(1) + "h", 
          note: "OK"
      };
  }

// --- UPDATED HISTORY MODAL (DATE + TIME) ---
  openHistoryModal(imei, name, prefillDate, startISO, endISO) {
    // ── Step 1: check if metadata already stored by BroadcastChannel handler ──
    let _existingMeta = null;
    try { _existingMeta = JSON.parse(localStorage.getItem('fleet_gps_verify_meta') || 'null'); } catch(_) {}
    const _metaIsForThisTruck = _existingMeta && _existingMeta.imei === String(imei) && Date.now()-(_existingMeta.ts||0) < 30000;

    // ── Step 2: resolve time window ──
    const resolvedStart = startISO || (_metaIsForThisTruck ? _existingMeta.startISO : null);
    const resolvedEnd   = endISO   || (_metaIsForThisTruck ? _existingMeta.endISO   : null);

    // If an exact window is explicitly given (e.g. automated zone-event check), load directly
    if (resolvedStart && resolvedEnd) {
      const fmtLocal = (iso) => {
        const d = new Date(iso);
        const offsetMs = d.getTimezoneOffset() * 60000;
        const local = new Date(d.getTime() - offsetMs);
        return local.toISOString().slice(0, 16).replace('T', ' ') + ':00';
      };
      const start = fmtLocal(resolvedStart);
      const end   = fmtLocal(resolvedEnd);
      window._histRecapMeta = {
        truckName: name || (_existingMeta && _existingMeta.truckName) || String(imei),
        imei:      String(imei),
        zoneName:  _existingMeta ? (_existingMeta.zoneName || '') : '',
        exitTime:  _existingMeta ? (_existingMeta.exitTime || null) : null,
        startISO:  resolvedStart,
        endISO:    resolvedEnd || null
      };
      this.loadVisualHistory(imei, start, end);
      return;
    }

    // ── Step 3: Standard user flow -> Show Interactive Date/Time Modal ──
    const existingModal = document.getElementById('historyModal');
    if (existingModal) existingModal.remove();

    const truckDisplayName = name || (window.app?.trucks?.get ? window.app.trucks.get(imei)?.name : window.app?.trucks?.[imei]?.name) || String(imei);
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const toLocalDT = (d) => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    
    let defaultStart, defaultEnd;
    if (prefillDate) {
      const p = new Date(prefillDate);
      defaultStart = `${p.getFullYear()}-${pad(p.getMonth()+1)}-${pad(p.getDate())}T00:00`;
      defaultEnd = `${p.getFullYear()}-${pad(p.getMonth()+1)}-${pad(p.getDate())}T23:59`;
    } else {
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
      defaultStart = toLocalDT(todayStart);
      defaultEnd = toLocalDT(now);
    }

    const modal = document.createElement('div');
    modal.id = 'historyModal';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(6,10,20,0.8);backdrop-filter:blur(8px);z-index:999999;display:flex;align-items:center;justify-content:center;padding:16px;animation:fadeIn 0.2s ease;';

    modal.innerHTML = `
      <div style="background:#0f172a;border:1px solid rgba(56,189,248,0.3);border-radius:20px;width:100%;max-width:500px;box-shadow:0 25px 60px rgba(0,0,0,0.7), 0 0 35px rgba(56,189,248,0.2);color:#f8fafc;font-family:system-ui,-apple-system,sans-serif;overflow:hidden;">
        
        <!-- Header -->
        <div style="padding:18px 24px;border-bottom:1px solid rgba(255,255,255,0.08);display:flex;align-items:center;justify-content:space-between;background:linear-gradient(135deg,rgba(30,41,59,0.7),rgba(15,23,42,0.9));">
          <div style="display:flex;align-items:center;gap:12px;">
            <div style="width:40px;height:40px;border-radius:11px;background:linear-gradient(135deg,#2563eb,#38bdf8);display:flex;align-items:center;justify-content:center;box-shadow:0 4px 14px rgba(37,99,235,0.4);">
              <i class="fa-solid fa-clock-rotate-left" style="color:#ffffff;font-size:17px;"></i>
            </div>
            <div>
              <div style="font-size:16px;font-weight:800;letter-spacing:0.3px;">Scanner l'Historique GPS</div>
              <div style="font-size:12px;color:#94a3b8;margin-top:2px;">
                Camion: <span style="color:#38bdf8;font-weight:800;">${truckDisplayName}</span> (ID: ${imei})
              </div>
            </div>
          </div>
          <button type="button" onclick="document.getElementById('historyModal')?.remove()" style="background:var(--border);border:1px solid rgba(255,255,255,0.1);color:#94a3b8;width:34px;height:34px;border-radius:9px;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all 0.15s;" onmouseenter="this.style.background='rgba(239,68,68,0.2)';this.style.color='#f87171'" onmouseleave="this.style.background='var(--border)';this.style.color='#94a3b8'">
            <i class="fa-solid fa-xmark"></i>
          </button>
        </div>

        <!-- Body -->
        <div style="padding:22px 24px;">
          <!-- Quick Presets -->
          <div style="margin-bottom:18px;">
            <div style="font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.8px;margin-bottom:8px;">Périodes Rapides</div>
            <div style="display:flex;flex-wrap:wrap;gap:6px;">
              <button type="button" class="hist-preset-btn" onclick="ui._setHistPreset('today')" style="background:rgba(56,189,248,0.12);border:1px solid rgba(56,189,248,0.3);color:#38bdf8;font-size:11px;font-weight:700;padding:6px 12px;border-radius:8px;cursor:pointer;">Aujourd'hui</button>
              <button type="button" class="hist-preset-btn" onclick="ui._setHistPreset('yesterday')" style="background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);color:#cbd5e1;font-size:11px;font-weight:600;padding:6px 12px;border-radius:8px;cursor:pointer;">Hier</button>
              <button type="button" class="hist-preset-btn" onclick="ui._setHistPreset('last24h')" style="background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);color:#cbd5e1;font-size:11px;font-weight:600;padding:6px 12px;border-radius:8px;cursor:pointer;">Dernières 24h</button>
              <button type="button" class="hist-preset-btn" onclick="ui._setHistPreset('last48h')" style="background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);color:#cbd5e1;font-size:11px;font-weight:600;padding:6px 12px;border-radius:8px;cursor:pointer;">Dernières 48h</button>
              <button type="button" class="hist-preset-btn" onclick="ui._setHistPreset('last7d')" style="background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);color:#cbd5e1;font-size:11px;font-weight:600;padding:6px 12px;border-radius:8px;cursor:pointer;">7 Derniers Jours</button>
            </div>
          </div>

          <!-- Date/Time Inputs -->
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:22px;">
            <div>
              <label style="display:block;font-size:12px;font-weight:700;color:#94a3b8;margin-bottom:6px;">
                <i class="fa-regular fa-calendar-plus" style="color:#4ade80;margin-right:4px;"></i> Date & Heure Début
              </label>
              <input type="datetime-local" id="histStart" value="${defaultStart}" style="width:100%;box-sizing:border-box;background:#1e293b;border:1px solid rgba(255,255,255,0.15);color:#ffffff;border-radius:9px;padding:10px 12px;font-size:13px;outline:none;" onfocus="this.style.borderColor='#38bdf8'" onblur="this.style.borderColor='rgba(255,255,255,0.15)'">
            </div>
            <div>
              <label style="display:block;font-size:12px;font-weight:700;color:#94a3b8;margin-bottom:6px;">
                <i class="fa-regular fa-calendar-check" style="color:#f87171;margin-right:4px;"></i> Date & Heure Fin
              </label>
              <input type="datetime-local" id="histEnd" value="${defaultEnd}" style="width:100%;box-sizing:border-box;background:#1e293b;border:1px solid rgba(255,255,255,0.15);color:#ffffff;border-radius:9px;padding:10px 12px;font-size:13px;outline:none;" onfocus="this.style.borderColor='#38bdf8'" onblur="this.style.borderColor='rgba(255,255,255,0.15)'">
            </div>
          </div>

          <!-- Action Buttons -->
          <div style="display:flex;gap:10px;">
            <button type="button" onclick="document.getElementById('historyModal')?.remove()" style="flex:1;background:var(--border);border:1px solid rgba(255,255,255,0.12);color:#94a3b8;padding:12px;border-radius:10px;font-weight:700;font-size:13px;cursor:pointer;">
              Annuler
            </button>
            <button type="button" onclick="ui.submitHistory('${imei}', '${truckDisplayName.replace(/'/g, "\\'")}')" style="flex:2;background:linear-gradient(135deg,#0284c7,#2563eb);border:none;color:#ffffff;padding:12px;border-radius:10px;font-weight:800;font-size:13px;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;box-shadow:0 4px 16px rgba(37,99,235,0.4);">
              <i class="fa-solid fa-satellite-dish"></i> Lancer le Scan GPS
            </button>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(modal);
  }

  _setHistPreset(preset) {
    const startEl = document.getElementById('histStart');
    const endEl = document.getElementById('histEnd');
    if (!startEl || !endEl) return;
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const toLocalISO = (d) => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;

    if (preset === 'today') {
      const s = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
      startEl.value = toLocalISO(s);
      endEl.value = toLocalISO(now);
    } else if (preset === 'yesterday') {
      const yStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 0, 0, 0);
      const yEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 23, 59, 59);
      startEl.value = toLocalISO(yStart);
      endEl.value = toLocalISO(yEnd);
    } else if (preset === 'last24h') {
      const s = new Date(now.getTime() - 24 * 3600 * 1000);
      startEl.value = toLocalISO(s);
      endEl.value = toLocalISO(now);
    } else if (preset === 'last48h') {
      const s = new Date(now.getTime() - 48 * 3600 * 1000);
      startEl.value = toLocalISO(s);
      endEl.value = toLocalISO(now);
    } else if (preset === 'last7d') {
      const s = new Date(now.getTime() - 7 * 24 * 3600 * 1000);
      startEl.value = toLocalISO(s);
      endEl.value = toLocalISO(now);
    }

    document.querySelectorAll('.hist-preset-btn').forEach(b => {
      b.style.background = 'rgba(255,255,255,0.05)';
      b.style.borderColor = 'rgba(255,255,255,0.1)';
      b.style.color = '#cbd5e1';
    });
    if (typeof event !== 'undefined' && event && event.target) {
      event.target.style.background = 'rgba(56,189,248,0.15)';
      event.target.style.borderColor = 'rgba(56,189,248,0.35)';
      event.target.style.color = '#38bdf8';
    }
  }

  // --- SUBMIT ACTION ---
  submitHistory(imei, name) {
      const startInp = document.getElementById('histStart');
      const endInp = document.getElementById('histEnd');
      if (!startInp || !endInp) return;
      const startVal = startInp.value;
      const endVal = endInp.value;
      
      if (!startVal || !endVal) { alert("Veuillez remplir les dates de début et de fin."); return; }
      
      const fmt = (iso) => {
        let s = iso.replace('T', ' ');
        if (s.length === 16) s += ':00';
        return s;
      };

      const start = fmt(startVal);
      const end = fmt(endVal);
      const truckName = name || (window.app?.trucks?.get ? window.app.trucks.get(imei)?.name : window.app?.trucks?.[imei]?.name) || String(imei);
      window._histRecapMeta = {
        truckName: truckName,
        imei:      String(imei),
        zoneName:  '',
        exitTime:  null,
        startISO:  new Date(startVal).toISOString(),
        endISO:    new Date(endVal).toISOString()
      };
      
      document.getElementById('historyModal')?.remove();
      this.loadVisualHistory(imei, start, end);
  }

// --- UPDATED LOADING LOGIC (Stats + Date + Counters) ---
  async loadVisualHistory(imei, start, end) {
      // 1. Force Switch to Map Tab
      if(this.zoneGroupingMode !== 'map') {
          this.setZoneGrouping('map');
          const mapTabBtn = document.querySelector('[data-tab="byWilaya"]');
          if(mapTabBtn) mapTabBtn.click();
          // Force Mapbox to recognize its new size after tab switch
          if(window.AlgeriaMap && window.AlgeriaMap.map) {
             setTimeout(() => window.AlgeriaMap.map.resize(), 150);
             setTimeout(() => window.AlgeriaMap.map.resize(), 400);
          }
      }
      
      const btn = document.getElementById('btnGroupMap');
      const originalText = btn ? btn.innerHTML : 'Carte';
      if(btn) btn.innerHTML = '<i class="fa-solid fa-satellite-dish fa-spin"></i> Chargement...';

      try {
          // 2. Fetch History Data
          const safeImei = encodeURIComponent(imei || '');
          const safeStartQ = encodeURIComponent(start || '');
          const safeEndQ = encodeURIComponent(end || '');
          const res = await fetch(`${FLEET_CONFIG.API.baseUrl}/api/history?imei=${safeImei}&start=${safeStartQ}&end=${safeEndQ}`);
          const json = await res.json();
          let rawPoints = json.messages || json;

          if(!rawPoints || !Array.isArray(rawPoints) || rawPoints.length < 5) {
              if(btn) btn.innerHTML = originalText;
              // Show friendly toast instead of alert
              const _errToast = document.createElement('div');
              _errToast.style.cssText = 'position:fixed;top:20px;left:50%;transform:translateX(-50%);z-index:99999;background:var(--bg-elevated, #1e293b);color:#f8fafc;padding:12px 20px;border-radius:10px;border:1px solid rgba(248,113,113,0.4);font-family:Inter,sans-serif;font-size:13px;font-weight:600;box-shadow:0 4px 20px rgba(0,0,0,0.4);display:flex;align-items:center;gap:8px;';
              _errToast.innerHTML = '<i class="fa-solid fa-triangle-exclamation" style="color:#f87171;"></i> Aucun historique GPS trouvé pour cette période.';
              document.body.appendChild(_errToast);
              setTimeout(() => _errToast.remove(), 4000);
              const targetTruckName = window._histRecapMeta?.truckName || (window.app?.trucks?.get ? window.app.trucks.get(imei)?.name : window.app?.trucks?.[imei]?.name) || imei;
              setTimeout(() => { this.openHistoryModal(imei, targetTruckName); }, 400);
              return;
          }

          // 3. Normalize & Sort Data
          let points = rawPoints.map(p => {
              if (Array.isArray(p)) {
                  const tRaw = String(p[0] || '').replace(' ', 'T');
                  const tMs = new Date(tRaw).getTime();
                  const spd = parseFloat(p[5] !== undefined ? p[5] : (p[3] || 0)) || 0;
                  return { 
                      time: isNaN(tMs) ? Date.now() : tMs,
                      lat: parseFloat(p[1]), 
                      lng: parseFloat(p[2]), 
                      speed: Math.round(spd), 
                      params: p[6] || {} 
                  };
              }
              return p;
          }).sort((a,b) => (a.time || 0) - (b.time || 0));

          // 3.5 Exact Window Filtering (Trim the extra pre-point returned by GPS API)
          try {
              // 'start' is passed as "YYYY-MM-DD HH:MM:SS". Replace space with 'T' for cross-browser safety (Firefox)
              const safeStartStr = typeof start === 'string' ? start.replace(' ', 'T') : start;
              let exactStartMs = new Date(safeStartStr).getTime();
              
              if (!isNaN(exactStartMs)) {
                  // Add a small 1-minute buffer to ensure we don't trim the first valid entry point
                  points = points.filter(p => p.time >= (exactStartMs - 60000));
                  console.log(`⏱️ GPS path strictly trimmed to >= ${new Date(exactStartMs).toLocaleString()}`);
              }
          } catch(e) {
              console.error("GPS window filter error", e);
          }

          // Downsample very large datasets (>4000 pts) to prevent browser OOM
          if (points.length > 4000) {
            const step = Math.ceil(points.length / 4000);
            points = points.filter((_, i) => i % step === 0 || i === points.length - 1);
            console.log(`⚡ Downsampled to ${points.length} pts (step=${step})`);
          }

          // ─────────────────────────────────────────────────────────
          // GPS NOISE FILTER — 3 Passes
          // Fixes: trajectory drift / trucks shown miles outside zone
          // ─────────────────────────────────────────────────────────
          const _gpsDistM = (a, b) => {
            const R = 6371000, dLat = (b.lat - a.lat) * Math.PI/180, dLng = (b.lng - a.lng) * Math.PI/180;
            const x = Math.sin(dLat/2)**2 + Math.cos(a.lat*Math.PI/180)*Math.cos(b.lat*Math.PI/180)*Math.sin(dLng/2)**2;
            return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1-x));
          };

          // Pass 1: Remove invalid, zero, or out-of-Algeria bounding box coordinates
          // Algeria bbox: lat [18.9, 37.2], lng [-8.7, 12.0]
          points = points.filter(p =>
            p.lat && p.lng &&
            Number.isFinite(p.lat) && Number.isFinite(p.lng) &&
            p.lat !== 0 && p.lng !== 0 &&
            p.lat >= 18.9 && p.lat <= 37.2 &&
            p.lng >= -8.7 && p.lng <= 12.0
          );

          // Pass 2: Remove GPS teleport outliers
          // If the implied speed between two consecutive points exceeds 250 km/h,
          // the point is a satellite glitch and must be removed.
          const MAX_SPEED_MS = 250 / 3.6; // 250 km/h in m/s
          const filtered2 = [];
          for (let i = 0; i < points.length; i++) {
            if (filtered2.length === 0) { filtered2.push(points[i]); continue; }
            const prev = filtered2[filtered2.length - 1];
            const distM = _gpsDistM(prev, points[i]);
            const dtS   = Math.max((points[i].time - prev.time) / 1000, 1);
            const impliedSpeedMs = distM / dtS;
            if (impliedSpeedMs <= MAX_SPEED_MS) {
              filtered2.push(points[i]);
            } else {
              // Suspected glitch — check if NEXT point is sane relative to prev
              // If next returns close to prev, skip this point (it was a spike)
              const next = points[i + 1];
              if (next) {
                const distToNext = _gpsDistM(prev, next);
                const dtToNext = Math.max((next.time - prev.time) / 1000, 1);
                if ((distToNext / dtToNext) <= MAX_SPEED_MS) {
                  // This point was a spike — skip it
                  console.debug(`[GPS Filter] Teleport skip @ i=${i}: ${impliedSpeedMs.toFixed(0)}m/s implied`);
                  continue;
                }
              }
              filtered2.push(points[i]); // Keep if can't confirm spike
            }
          }
          points = filtered2;

          // Pass 3: Stationary jitter smoother
          // When a truck is stopped (speed=0), GPS oscillates within ~50-200m.
          // Collapse runs of stopped points into their centroid to prevent jagged
          // lines radiating away from the actual parking spot.
          const MAX_JITTER_M = 80; // collapse oscillations within 80m of stop origin
          const smoothed = [];
          let jitterBuf = [];
          const _flushJitter = () => {
            if (!jitterBuf.length) return;
            if (jitterBuf.length === 1) { smoothed.push(jitterBuf[0]); jitterBuf = []; return; }
            // Average the cluster
            const avgLat = jitterBuf.reduce((s, p) => s + p.lat, 0) / jitterBuf.length;
            const avgLng = jitterBuf.reduce((s, p) => s + p.lng, 0) / jitterBuf.length;
            smoothed.push({ ...jitterBuf[0], lat: avgLat, lng: avgLng });
            // Keep last as anchor for next segment
            smoothed.push({ ...jitterBuf[jitterBuf.length - 1], lat: avgLat, lng: avgLng });
            jitterBuf = [];
          };
          for (let i = 0; i < points.length; i++) {
            const p = points[i];
            if ((p.speed || 0) < 2) {
              if (!jitterBuf.length) { jitterBuf.push(p); }
              else {
                const anchor = jitterBuf[0];
                if (_gpsDistM(anchor, p) <= MAX_JITTER_M) {
                  jitterBuf.push(p);
                } else {
                  _flushJitter();
                  jitterBuf.push(p);
                }
              }
            } else {
              _flushJitter();
              smoothed.push(p);
            }
          }
          _flushJitter();
          const beforeSmooth = points.length;
          points = smoothed;
          console.log(`🛰️ GPS Filter: ${beforeSmooth} → ${points.length} pts (noise removed)`);
          // ─────────────────────────────────────────────────────────

          const coords = [];
          const stops = [];
          const truckConfig = getTruckConfig(imei);
          const effectiveTankCap = getConfiguredFuelEffectiveCapacity(truckConfig) || truckConfig.fuelTankCapacity || 600;
          const fuelSeries = points.map((pt) => ({
              time: pt.time,
              liters: calculateFuelMetricsFromParams(pt.params || {}, truckConfig).liters,
              speed: pt.speed,
              ign: parseInt((pt.params || {}).io1 ?? (pt.params || {}).acc ?? 0, 10) || 0,
              lat: pt.lat,
              lng: pt.lng
          }));
          const historyRefills = (typeof detectRefillEventsFromSeries === 'function')
              ? detectRefillEventsFromSeries(fuelSeries, {
                  minRefuelLiters: Math.max(60, parseFloat((FLEET_CONFIG.REFUEL_RULES || {}).minRefuelLiters || 60) || 60),
                  maxRealisticRefillLiters: Math.max(600, Math.round(effectiveTankCap + 50)),
                  dedupeMinutes: 35,
                  dedupeDistanceMeters: 400,
                  stopSpeedThreshold: 4
              })
              : [];
          const refills = historyRefills.map((evt) => ({
              lat: evt.lat,
              lng: evt.lng,
              volume: String(evt.addedLiters || 0),
              oldLevel: evt.oldLevel,
              newLevel: evt.newLevel,
              durationMin: evt.durationMin || Math.max(1, Math.round(((evt.endTimeMs || evt.time) - (evt.startTimeMs || evt.time)) / 60000)),
              confidence: evt.confidence,
              time: evt.time
          }));
          
          // STATS ACCUMULATORS
          let totalDist = 0;
          let totalFuelAdded = historyRefills.reduce((sum, evt) => sum + (evt.addedLiters || 0), 0);
          let lastLat = null;

          // STOP LOGIC
          let isStopped = false;
          let stopStartTime = 0;
          let stopStartCoord = null;

          points.forEach((p) => {
              // A. Route & Distance
              if (p.lat && p.lng && p.lat !== 0) {
                  coords.push([p.lng, p.lat]);
                  
                  // Calculate Distance
                  if (lastLat) {
                      const R = 6371; 
                      const dLat = (p.lat - lastLat.lat) * Math.PI / 180;
                      const dLng = (p.lng - lastLat.lng) * Math.PI / 180;
                      const a = Math.sin(dLat/2)*Math.sin(dLat/2) + Math.cos(lastLat.lat*Math.PI/180)*Math.cos(p.lat*Math.PI/180) * Math.sin(dLng/2)*Math.sin(dLng/2);
                      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
                      totalDist += R * c;
                  }
                  lastLat = { lat: p.lat, lng: p.lng };
              }

              // B. Stops
              if (p.speed < 1) {
                  if (!isStopped) {
                      isStopped = true;
                      stopStartTime = p.time;
                      stopStartCoord = { lat: p.lat, lng: p.lng };
                  }
              } else {
                  if (isStopped) {
                      const durationMs = p.time - stopStartTime;
                      if (durationMs > 300000) { // > 5 mins
                          const hours = Math.floor(durationMs / 3600000);
                          const minutes = Math.floor((durationMs % 3600000) / 60000);
                          const durationStr = (hours > 0 ? `${hours}h ` : '') + `${minutes}min`;
                          
                          stops.push({
                              lat: stopStartCoord.lat,
                              lng: stopStartCoord.lng,
                              startTime: stopStartTime,
                              endTime: p.time, // <--- CAPTURE END TIME
                              durationStr: durationStr
                          });
                      }
                      isStopped = false;
                  }
              }
          });

          const exactDecouchages = await this.buildExactDecouchageEventsFromPoints(
              this.normalizeHistoryMessages(rawPoints),
              {
                  id: imei,
                  name: (typeof app !== 'undefined' && app.trucks && app.trucks.get(imei))
                      ? app.trucks.get(imei).name
                      : imei
              }
          );

          const filteredStops = stops.filter(stop => !exactDecouchages.some(dec => {
              const decTime = dec.detectedAtMs || new Date(dec.detectedAt || dec.startTime || 0).getTime();
              return Number.isFinite(decTime) && decTime >= stop.startTime && decTime <= stop.endTime;
          }));

          // Wait for map to be ready before drawing (map may still be initializing)
          const _waitForMap = async () => {
            let _retries = 0;
            while ((!window.AlgeriaMap || !window.AlgeriaMap.drawRoute || !window.AlgeriaMap.map) && _retries < 30) {
              await new Promise(r => setTimeout(r, 500));
              _retries++;
            }
          };
          await _waitForMap();

          if(window.AlgeriaMap && window.AlgeriaMap.drawRoute && window.AlgeriaMap.map) {
              window.AlgeriaMap.drawRoute(points, coords);
              window.AlgeriaMap.addRefillMarkers(refills);
              window.AlgeriaMap.addStopMarkers(filteredStops);
              exactDecouchages.forEach(dec => window.AlgeriaMap.addDecouchageMarker(dec));
              
              // Pass the correct structure to the map engine
              window.AlgeriaMap.updateStats({
                  distance: totalDist.toFixed(1),
                  fuel: totalFuelAdded.toFixed(0),
                  stopCount: filteredStops.length,
                  decouchageCount: exactDecouchages.length
              });

              const toast = document.createElement('div');
              toast.className = 'map-toast-msg';
              toast.innerHTML = `\u2705 Chargé: ${points.length} points | ${totalDist.toFixed(1)} km | 🌙 ${exactDecouchages.length}`;
              document.getElementById('map-wrapper').appendChild(toast);
              setTimeout(()=>toast.remove(), 3000);

// ══════════════════════════════════════════════════════
              // HISTORY PANEL V3 — Glassmorphism Bottom Bar
              // Source of truth: zone event metadata (startISO/endISO/exitTime)
              // ══════════════════════════════════════════════════════
              (() => {
                // ── 1. Metadata ───────────────────────────────────────────
                let _meta = window._histRecapMeta || null;
                if (!_meta) { try { _meta = JSON.parse(localStorage.getItem('fleet_gps_verify_meta') || 'null'); } catch(_) {} }
                const _tName    = (_meta && _meta.truckName) || (typeof app !== 'undefined' && app.trucks && app.trucks.get(imei) ? app.trucks.get(imei).name : imei);
                const _zoneName = (_meta && _meta.zoneName) || '';

                // ── 2. Truth: zone event times (not GPS pings) ────────────────
                const _rawExit   = _meta && (_meta.exitTime || _meta.endISO);
                const _exitValid = (_rawExit && _rawExit !== 'null' && _rawExit !== '') || (end && end !== 'null' && end !== '');
                const _entryDate = (_meta && _meta.startISO) ? new Date(_meta.startISO) : (start ? new Date(start.replace(' ', 'T')) : (points[0] ? new Date(points[0].time) : null));
                const _exitDate  = _exitValid ? new Date(_rawExit || end.replace(' ', 'T')) : null;
                const _lastGpsMs = points.length ? points[points.length - 1].time : 0;
                const _isLive    = !_exitValid && _lastGpsMs > 0 && (Date.now() - _lastGpsMs) < 90 * 60 * 1000;
                const _isTermine = !!_exitValid;

                // ── 3. Stats ─────────────────────────────────────────────────
                const _durMs  = (_entryDate && _exitDate) ? (_exitDate - _entryDate) : (_entryDate && _isLive ? Date.now() - _entryDate.getTime() : 0);
                const _dH     = Math.floor(_durMs / 3600000);
                const _dM     = Math.floor((_durMs % 3600000) / 60000);
                const _durStr = _durMs > 0 ? (_dH > 0 ? `${_dH}h ${_dM}m` : `${_dM} min`) : '—';
                const _maxSpd = points.reduce((mx, p) => Math.max(mx, p.speed || 0), 0);
                const _fmt    = (d) => d ? d.toLocaleTimeString('fr-FR', {hour:'2-digit', minute:'2-digit'}) : '—';
                const _fmtDate= (d) => d ? d.toLocaleDateString('fr-FR', {day:'2-digit', month:'short'}) : '—';

                // ── 4. Styles (injected once) ───────────────────────────────
                if (!document.getElementById('histSidebarStyles')) {
                  const _sty = document.createElement('style');
                  _sty.id = 'histSidebarStyles';
                  _sty.textContent = `
                    #histSidebar {
                      position:absolute; bottom:14px; left:50%;
                      transform:translateX(-50%);
                      width:min(350px,90vw);
                      background:rgba(6,11,24,0.94);
                      border:1px solid rgba(255,255,255,0.1);
                      border-radius:16px; overflow:hidden;
                      z-index:9999; font-family:'Inter',sans-serif;
                      box-shadow:0 -2px 60px rgba(0,0,0,0.6),0 0 0 1px rgba(99,102,241,0.12);
                      backdrop-filter:blur(32px) saturate(200%);
                      color:#f1f5f9;
                      animation:hsUp 0.36s cubic-bezier(0.16,1,0.3,1);
                      pointer-events:all;
                    }
                    @keyframes hsUp { from{opacity:0;transform:translateX(-50%) translateY(20px)} to{opacity:1;transform:translateX(-50%) translateY(0)} }
                    #histSidebar .hs-header {
                      background:linear-gradient(135deg,rgba(99,102,241,.22),rgba(139,92,246,.12));
                      border-bottom:1px solid rgba(255,255,255,.07);
                      padding:10px 14px;
                      display:flex;align-items:center;justify-content:space-between;
                    }
                    #histSidebar .hs-body { padding:10px 14px 12px; }
                    #histSidebar .hs-times { display:grid;grid-template-columns:1fr 28px 1fr;gap:8px;align-items:center;margin-bottom:12px; }
                    #histSidebar .hs-tc { border-radius:13px;padding:11px 12px;text-align:center; }
                    #histSidebar .hs-tc-lbl { font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;margin-bottom:4px; }
                    #histSidebar .hs-tc-val { font-size:22px;font-weight:800;line-height:1; }
                    #histSidebar .hs-tc-sub { font-size:9px;margin-top:3px;opacity:.55; }
                    #histSidebar .hs-stats { display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-bottom:12px; }
                    #histSidebar .hs-sc { background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.07);border-radius:12px;padding:9px 5px;text-align:center; }
                    #histSidebar .hs-sv { font-size:15px;font-weight:800;line-height:1.1; }
                    #histSidebar .hs-sl { font-size:9px;font-weight:600;text-transform:uppercase;letter-spacing:.05em;color:#334155;margin-top:3px; }
                    #histSidebar .hs-footer { display:flex;gap:8px;align-items:stretch; }
                    #histSidebar .hs-btn { flex:1;background:linear-gradient(135deg,#6366f1,#8b5cf6);border:none;color:white;border-radius:12px;padding:11px;font-size:12px;font-weight:700;cursor:pointer;font-family:inherit;display:flex;align-items:center;justify-content:center;gap:6px;transition:opacity .2s;box-shadow:0 4px 16px rgba(99,102,241,.4); }
                    #histSidebar .hs-btn:hover { opacity:.85; }
                    #histSidebar .hs-cd { background:rgba(56,189,248,.08);border:1px solid rgba(56,189,248,.18);border-radius:12px;padding:9px 16px;text-align:center;flex-shrink:0;min-width:100px; }
                    #histSidebar .hs-cd-val { font-size:15px;font-weight:800;color:#38bdf8;font-variant-numeric:tabular-nums;letter-spacing:.03em; }
                    #histSidebar .hs-cd-lbl { font-size:8px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#1e3a5f;margin-top:2px; }
                    @keyframes livepulse { 0%,100%{opacity:1} 50%{opacity:.3} }
                    
                    /* Light Mode Overrides */
                    body.light-mode #histSidebar {
                      background:rgba(255,255,255,0.94);
                      color:#0f172a;
                      border:1px solid rgba(0,0,0,0.1);
                      box-shadow:0 -2px 60px rgba(0,0,0,0.15),0 0 0 1px rgba(99,102,241,0.08);
                    }
                    body.light-mode #histSidebar .hs-header {
                      background:linear-gradient(135deg,rgba(99,102,241,.1),rgba(139,92,246,.05));
                      border-bottom:1px solid rgba(0,0,0,.05);
                    }
                    body.light-mode #histSidebar .hs-sc {
                      background:rgba(0,0,0,.03);
                      border:1px solid rgba(0,0,0,.05);
                    }
                    body.light-mode #histSidebar .hs-sl { color:#64748b; }
                    body.light-mode #histSidebar .hs-tc-sub { color:#64748b; opacity:1; }
                    body.light-mode .timeline-control-panel {
                      background:rgba(255,255,255,0.95) !important;
                      border:1px solid rgba(0,0,0,0.1) !important;
                      color:#1e293b !important;
                    }
                    body.light-mode .timeline-control-panel button {
                      color:#3b82f6 !important;
                    }
                    body.light-mode .timeline-control-panel button:hover {
                      background:rgba(59,130,246,0.1) !important;
                    }
                  `;
                  document.head.appendChild(_sty);
                }

                // ── 5. Status badge ────────────────────────────────────────────
                const _badge = _isTermine
                  ? '<span style="background:rgba(52,211,153,.15);border:1px solid rgba(52,211,153,.3);color:#34d399;border-radius:999px;padding:2px 9px;font-size:9px;font-weight:700;"><i class=\"fa-solid fa-circle-check\" style=\"font-size:8px;margin-right:3px;\"></i>Terminé</span>'
                  : _isLive
                    ? '<span style="background:rgba(251,146,60,.15);border:1px solid rgba(251,146,60,.3);color:#fb923c;border-radius:999px;padding:2px 9px;font-size:9px;font-weight:700;"><span style=\"width:6px;height:6px;background:#fb923c;border-radius:50%;display:inline-block;animation:livepulse 1.4s infinite;margin-right:4px;vertical-align:middle;\"></span>En cours</span>'
                    : '<span style="background:rgba(100,116,139,.12);border:1px solid rgba(100,116,139,.25);color:#64748b;border-radius:999px;padding:2px 9px;font-size:9px;font-weight:700;">Historique</span>';

                // ── 6. Render ───────────────────────────────────────────────────
                document.getElementById('histSidebar')?.remove();
                const _panel = document.createElement('div');
                _panel.id = 'histSidebar';
                _panel.innerHTML = `
                  <div class="hs-header" id="hsHeaderDraggable" style="cursor: grab;">
                    <div style="display:flex;align-items:center;gap:10px;">
                      <div style="width:38px;height:38px;background:linear-gradient(135deg,#6366f1,#8b5cf6);border-radius:11px;display:flex;align-items:center;justify-content:center;flex-shrink:0;box-shadow:0 4px 12px rgba(99,102,241,.4);">
                        <i class="fa-solid fa-route" style="color:white;font-size:14px;"></i>
                      </div>
                      <div>
                        <div style="font-size:16px;font-weight:800;color:#f8fafc;letter-spacing:-.01em;">${_tName}</div>
                        <div style="display:flex;align-items:center;gap:7px;margin-top:4px;">
                          ${_zoneName ? '<span style="font-size:10px;color:#818cf8;font-weight:600;">📍 ' + _zoneName + '</span>' : ''}
                          ${_badge}
                        </div>
                      </div>
                    </div>
                    <button onclick="document.getElementById('histSidebar')?.remove();" style="background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.09);color:#475569;width:30px;height:30px;border-radius:9px;cursor:pointer;font-size:14px;font-family:inherit;display:flex;align-items:center;justify-content:center;">✕</button>
                  </div>
                  <div class="hs-body">
                    <div class="hs-times">
                      <div class="hs-tc" style="background:rgba(74,222,128,.07);border:1px solid rgba(74,222,128,.18);">
                        <div class="hs-tc-lbl" style="color:#4ade80;">▶ Entrée</div>
                        <div class="hs-tc-val" style="color:#4ade80;">${_fmt(_entryDate)}</div>
                        <div class="hs-tc-sub">${_fmtDate(_entryDate)}</div>
                      </div>
                      <div style="text-align:center;color:#1e293b;font-size:20px;font-weight:700;">→</div>
                      <div class="hs-tc" style="background:${_isTermine?'rgba(248,113,113,.07)':'rgba(251,146,60,.07)'};border:1px solid ${_isTermine?'rgba(248,113,113,.18)':'rgba(251,146,60,.18)'};">
                        <div class="hs-tc-lbl" style="color:${_isTermine?'#f87171':'#fb923c'};">⏹ Sortie</div>
                        ${_isTermine
                          ? '<div class="hs-tc-val" style="color:#f87171;">' + _fmt(_exitDate) + '</div><div class="hs-tc-sub">' + _fmtDate(_exitDate) + '</div>'
                          : _isLive
                            ? '<div style="font-size:12px;font-weight:700;color:#fb923c;margin-top:5px;">📍 Encore là</div><div class="hs-tc-sub">En cours</div>'
                            : '<div class="hs-tc-val" style="color:#334155;">—</div><div class="hs-tc-sub">Inconnu</div>'
                        }
                      </div>
                    </div>
                    <div class="hs-stats">
                      <div class="hs-sc"><div class="hs-sv" style="color:#38bdf8;">${_durStr}</div><div class="hs-sl">Durée</div></div>
                      <div class="hs-sc"><div class="hs-sv" style="color:#a78bfa;">${totalDist.toFixed(0)}<span style="font-size:10px;font-weight:400"> km</span></div><div class="hs-sl">Distance</div></div>
                      <div class="hs-sc"><div class="hs-sv" style="color:#f59e0b;">${filteredStops.length}</div><div class="hs-sl">Arrêts</div></div>
                      <div class="hs-sc"><div class="hs-sv" style="color:#34d399;">${_maxSpd}<span style="font-size:10px;font-weight:400"> km/h</span></div><div class="hs-sl">Vit.Max</div></div>
                    </div>
                    ${exactDecouchages.length > 0 ? '<div style="background:rgba(239,68,68,.09);border:1px solid rgba(239,68,68,.2);border-radius:10px;padding:6px 12px;font-size:11px;color:#f87171;font-weight:700;margin-bottom:10px;">🌙 ' + exactDecouchages.length + ' découchage' + (exactDecouchages.length>1?'s':'') + ' détecté' + (exactDecouchages.length>1?'s':'') + '</div>' : ''}
                    <div class="hs-footer" style="flex-direction:column;gap:8px;">
                      <button class="hs-btn" style="background:linear-gradient(135deg,#0284c7,#2563eb);color:#fff;border:none;box-shadow:0 3px 12px rgba(37,99,235,0.35);width:100%;padding:10px;font-weight:800;cursor:pointer;" onclick="window.ui.openHistoryModal('${imei}', '${(_truckObj?.name || truckName || imei).replace(/'/g, "\\\'")}');">
                        <i class="fa-solid fa-calendar-days"></i> Changer la période / Nouveau Scan
                      </button>
                      <div style="display:flex;align-items:center;justify-content:space-between;width:100%;gap:8px;">
                        <button class="hs-btn" style="flex:1;" onclick="if(window.AlgeriaMap)window.AlgeriaMap.clearHistory();document.getElementById('histSidebar')?.remove();document.getElementById('histSidebarStyles')?.remove();">
                          <i class="fa-solid fa-xmark"></i> Fermer &amp; Restaurer
                        </button>
                        <div class="hs-cd">
                          <div class="hs-cd-val" id="hsFixerCd">--:--</div>
                          <div class="hs-cd-lbl">🔧 Prochain Fix</div>
                        </div>
                      </div>
                    </div>
                    <div style="text-align:center;margin-top:8px;font-size:9px;color:#1e293b;">🛰️ ${points.length} points GPS analysés</div>
                  </div>
                `;

                const _mw = document.getElementById('map-wrapper');
                if (_mw) { _mw.style.position = 'relative'; _mw.appendChild(_panel); }

                // Make sidebar draggable
                const hsHeader = _panel.querySelector('#hsHeaderDraggable');
                if (hsHeader) {
                    let isDragging = false, startX, startY, initialLeft, initialTop;
                    hsHeader.addEventListener('mousedown', (e) => {
                        isDragging = true;
                        startX = e.clientX; startY = e.clientY;
                        const rect = _panel.getBoundingClientRect();
                        const mwRect = _mw.getBoundingClientRect();
                        // Disable the transform to allow precise positioning
                        _panel.style.transform = 'none';
                        _panel.style.bottom = 'auto';
                        _panel.style.left = (rect.left - mwRect.left) + 'px';
                        _panel.style.top = (rect.top - mwRect.top) + 'px';
                        initialLeft = rect.left - mwRect.left;
                        initialTop = rect.top - mwRect.top;
                        hsHeader.style.cursor = 'grabbing';
                        e.preventDefault();
                    });
                    document.addEventListener('mousemove', (e) => {
                        if (!isDragging) return;
                        const dx = e.clientX - startX;
                        const dy = e.clientY - startY;
                        _panel.style.left = (initialLeft + dx) + 'px';
                        _panel.style.top = (initialTop + dy) + 'px';
                    });
                    document.addEventListener('mouseup', () => {
                        isDragging = false;
                        hsHeader.style.cursor = 'grab';
                    });
                }

                // ── 7. Live countdown ────────────────────────────────────────────
                (() => {
                  const _el = document.getElementById('hsFixerCd');
                  if (!_el) return;
                  let _nextMs = null;
                  const _tick = () => {
                    const el = document.getElementById('hsFixerCd');
                    if (!el) return;
                    if (!_nextMs) { el.textContent = '--:--'; return; }
                    const rem = _nextMs - Date.now();
                    if (rem <= 0) { 
                        el.textContent = '🔄 Fix...'; 
                        if (rem < -15000) {
                            const ms = Date.now(), t30 = 30 * 60000;
                            _nextMs = Math.ceil(ms / t30) * t30;
                            if (_nextMs === ms) _nextMs += t30;
                        }
                        return; 
                    }
                    const m = Math.floor(rem / 60000);
                    const s = Math.floor((rem % 60000) / 1000);
                    el.textContent = String(m).padStart(2,'0') + ':' + String(s).padStart(2,'0');
                  };
                  const _base = typeof FLEET_CONFIG !== 'undefined' ? FLEET_CONFIG.API.baseUrl : '';
                  fetch(_base + '/api/fixer-status')
                    .then(r => r.json())
                    .then(d => {
                      if (d.nextRunAt) { _nextMs = d.nextRunAt; } else {
                        const ms = Date.now(), t30 = 30 * 60000;
                        _nextMs = Math.ceil(ms / t30) * t30;
                        if (_nextMs === ms) _nextMs += t30;
                      }
                      _tick();
                      const _iv = setInterval(() => {
                        if (!document.getElementById('histSidebar')) { clearInterval(_iv); return; }
                        _tick();
                      }, 1000);
                    })
                    .catch(() => { if (_el) _el.textContent = '30:00'; });
                })();
              })();
          }

      } catch (e) {
          console.error("History Error:", e);
          // Show friendly toast instead of blocking alert
          const _errToast = document.createElement('div');
          _errToast.style.cssText = 'position:fixed;top:20px;left:50%;transform:translateX(-50%);z-index:99999;background:var(--bg-elevated, #1e293b);color:#f8fafc;padding:12px 24px;border-radius:10px;border:1px solid rgba(248,113,113,0.4);font-family:Inter,sans-serif;font-size:13px;font-weight:600;box-shadow:0 4px 20px rgba(0,0,0,0.4);display:flex;align-items:center;gap:8px;';
          _errToast.innerHTML = '<i class="fa-solid fa-triangle-exclamation" style="color:#f87171;"></i> Erreur analyse: ' + (e.message || 'Vérifiez la période sélectionnée.');
          document.body.appendChild(_errToast);
          setTimeout(() => _errToast.remove(), 5000);
      } finally {
          if(btn) btn.innerHTML = originalText;
      }
  }
  
  // =========================================================================
  // 4. NATIVE MULTI-SHEET EXCEL SUPER REPORT (F5)
  // =========================================================================
  async generateSuperReportXLSX() {
    if (!app || !app.trucks) {
      if (typeof showToast === 'function') showToast('Données de flotte non prêtes.', 'warning');
      return;
    }

    const btn = document.querySelector('button[onclick="ui.generateSuperReportCSV()"]') ||
                document.querySelector('button[onclick="ui.generateSuperReportXLSX()"]');
    const originalText = btn ? btn.innerHTML : '';
    if (btn) btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Génération Excel...';

    try {
      if (!this.allDecouchageLogs || this.allDecouchageLogs.length === 0) {
        try {
          const res = await fetch(`${FLEET_CONFIG.API.baseUrl}/api/decouchages?limit=1000`);
          if (res.ok) this.allDecouchageLogs = await res.json();
        } catch (e) { console.warn('Super report: Decouchage fetch error', e); }
      }

      if (!this.allMaintenanceLogs || this.allMaintenanceLogs.length === 0) {
        try {
          const res = await fetch(`${FLEET_CONFIG.API.baseUrl}/api/maintenance`);
          if (res.ok) this.allMaintenanceLogs = await res.json();
        } catch (e) { console.warn('Super report: Maintenance fetch error', e); }
      }

      const trucks = app.getAllTrucks();
      const fleetData = trucks.map(t => {
        const status = t.isGpsCut ? 'Coupure GPS' : (t.speed > 0 ? 'En route' : 'À l\'arrêt');
        const gpsQuality = t.isGpsCut ? 'OFFLINE' : 'ONLINE';
        const loc = t.location ? (t.location.formatted || `${t.location.city || ''}, ${t.location.wilaya || ''}`) : 'Inconnu';
        const vidangeRestant = (t.vidange && t.vidange.kmUntilNext !== undefined && t.vidange.kmUntilNext !== 999999)
          ? t.vidange.kmUntilNext
          : 'N/A';

        return {
          truckName: t.name || '',
          status: status,
          fuelLiters: t.fuelLiters || t.fuelLevel || 0,
          fuelPercentage: t.fuelPercentage || 0,
          fuelCapacity: t.fuelTankCapacity || 600,
          odometer: t.odometer || 0,
          vidangeRemaining: vidangeRestant,
          vidangeStatus: t.vidange?.status || 'OK',
          location: loc,
          gpsQuality: gpsQuality,
          lastUpdate: t.timestamp ? new Date(t.timestamp).toLocaleString('fr-FR') : new Date().toLocaleString('fr-FR')
        };
      });

      const fleetColumns = [
        { header: 'Camion', key: 'truckName', type: 'string' },
        { header: 'Statut', key: 'status', type: 'string' },
        { header: 'Carburant (L)', key: 'fuelLiters', type: 'number', format: '#,##0' },
        { header: 'Carburant (%)', key: 'fuelPercentage', type: 'number', format: '0' },
        { header: 'Capacité (L)', key: 'fuelCapacity', type: 'number', format: '#,##0' },
        { header: 'Odomètre (km)', key: 'odometer', type: 'number', format: '#,##0' },
        { header: 'Vidange Dans (km)', key: 'vidangeRemaining', type: 'string' },
        { header: 'Statut Vidange', key: 'vidangeStatus', type: 'string' },
        { header: 'Lieu Actuel', key: 'location', type: 'string' },
        { header: 'Signal GPS', key: 'gpsQuality', type: 'string' },
        { header: 'Dernière MàJ', key: 'lastUpdate', type: 'string' }
      ];

      const refuels = (this.allRefuelLogs || []).slice(0, 300);
      const refuelData = refuels.map(log => {
        const d = new Date(log.timestamp);
        let locName = log.locationRaw || (log.lat && log.lng ? `${log.lat},${log.lng}` : 'Inconnu');
        const cached = geocodeService.checkCacheInstant(log.lat, log.lng);
        if (cached) locName = `${cached.city || ''}, ${cached.wilaya || ''}`;
        return {
          date: d.toLocaleDateString('fr-FR'),
          time: d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
          truckName: log.truckName || '',
          addedLiters: Math.round(log.addedLiters || 0),
          newLevel: Math.round(log.newLevel || 0),
          location: locName
        };
      });

      const refuelColumns = [
        { header: 'Date', key: 'date', type: 'string' },
        { header: 'Heure', key: 'time', type: 'string' },
        { header: 'Camion', key: 'truckName', type: 'string' },
        { header: 'Ajout (L)', key: 'addedLiters', type: 'number', format: '#,##0' },
        { header: 'Nouveau Niveau (L)', key: 'newLevel', type: 'number', format: '#,##0' },
        { header: 'Lieu', key: 'location', type: 'string' }
      ];

      const maintenance = (this.allMaintenanceLogs || []).slice(0, 300);
      const maintData = maintenance.map(m => {
        const d = new Date(m.date || m.createdAt || Date.now());
        return {
          date: d.toLocaleDateString('fr-FR'),
          truckName: m.truckName || '',
          type: m.type || 'Maintenance Générale',
          priority: (m.priority || 'NORMAL').toUpperCase(),
          odometer: Number(m.odometer) || 0,
          location: m.location || '—',
          costDzd: Number(m.cost) || 0,
          status: m.exitDate ? 'Terminé' : (m.status || 'En cours')
        };
      });

      const maintColumns = [
        { header: 'Date', key: 'date', type: 'string' },
        { header: 'Camion', key: 'truckName', type: 'string' },
        { header: 'Type', key: 'type', type: 'string' },
        { header: 'Priorité', key: 'priority', type: 'string' },
        { header: 'Compteur (km)', key: 'odometer', type: 'number', format: '#,##0' },
        { header: 'Lieu', key: 'location', type: 'string' },
        { header: 'Coût', key: 'costDzd', type: 'currency', format: '#,##0 "DZD"' },
        { header: 'Statut', key: 'status', type: 'string' }
      ];

      const decouchage = (this.allDecouchageLogs || []).slice(0, 300);
      const decouchageData = decouchage.map(log => ({
        date: log.date || '',
        detectedAt: log.detectedAt ? new Date(log.detectedAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '00:00',
        truckName: log.truckName || '',
        location: log.locationName || 'Position Constatée',
        distanceKm: log.distanceFromSite ? Number((log.distanceFromSite / 1000).toFixed(1)) : 0
      }));

      const decouchageColumns = [
        { header: 'Date (Nuit du)', key: 'date', type: 'string' },
        { header: 'Heure Détection', key: 'detectedAt', type: 'string' },
        { header: 'Camion', key: 'truckName', type: 'string' },
        { header: 'Lieu Constaté', key: 'location', type: 'string' },
        { header: 'Distance Site (km)', key: 'distanceKm', type: 'number', format: '#,##0.0' }
      ];

      const filename = `SUPER_RAPPORT_${new Date().toISOString().slice(0, 10)}.xlsx`;

      const sheets = [
        { sheetName: 'Flotte Actuelle', title: 'ÉTAT DE LA FLOTTE EN TEMPS RÉEL', columns: fleetColumns, data: fleetData },
        { sheetName: 'Remplissages Récents', title: 'HISTORIQUE DES REMPLISSAGES', columns: refuelColumns, data: refuelData },
        { sheetName: 'Maintenance', title: 'SUIVI DES OPÉRATIONS DE MAINTENANCE', columns: maintColumns, data: maintData },
        { sheetName: 'Découchage', title: 'AUDIT RÉCENT DES DÉCOUCHAGES', columns: decouchageColumns, data: decouchageData }
      ];

      if (window.ExcelExportEngine && typeof window.ExcelExportEngine.exportMultiSheetXlsx === 'function') {
        window.ExcelExportEngine.exportMultiSheetXlsx({
          filename,
          sheets,
          metadata: {
            title: 'RAPPORT GLOBAL DE FLOTTE',
            exportedAt: new Date().toISOString(),
            totalTrucks: fleetData.length
          }
        });
        if (typeof showToast === 'function') showToast('Super Rapport Excel téléchargé avec succès !', 'success');
      } else if (window.ExcelExportEngine && typeof window.ExcelExportEngine.exportTableToXlsx === 'function') {
        window.ExcelExportEngine.exportTableToXlsx({
          filename,
          sheetName: 'Flotte Actuelle',
          title: 'RAPPORT GLOBAL DE FLOTTE — DOUROUB EL DJAZAIR',
          columns: fleetColumns,
          data: fleetData
        });
        if (typeof showToast === 'function') showToast('Super Rapport Excel (Flotte) téléchargé.', 'success');
      } else {
        const now = new Date().toLocaleString();
        let csv = `RAPPORT GLOBAL DE FLOTTE - ${now}\n\n`;
        csv += "ETAT ACTUEL DES CAMIONS\n";
        csv += "Camion,Statut,Carburant (L),Carburant (%),Capacité,Vidange Dans (km),Odomètre,Lieu Actuel,GPS Status\n";
        fleetData.forEach(t => {
          csv += `"${t.truckName}","${t.status}",${t.fuelLiters},${t.fuelPercentage}%,${t.fuelCapacity},${t.vidangeRemaining},${t.odometer},"${t.location}","${t.gpsQuality}"\n`;
        });
        this._downloadCSV(csv, filename.replace('.xlsx', '.csv'));
      }
    } catch (err) {
      console.error('generateSuperReportXLSX error:', err);
      if (typeof showToast === 'function') showToast(`Erreur export: ${err.message}`, 'error');
      else alert(`Erreur lors de la génération du rapport: ${err.message}`);
    } finally {
      if (btn) btn.innerHTML = originalText;
    }
  }

  generateSuperReportCSV() {
    return this.generateSuperReportXLSX();
  }


  // NEW: Download FULL Backup from SERVER
  downloadServerBackup() {
      const backupUrl = `${FLEET_CONFIG.API.baseUrl}/api/backup/download`;
      window.open(backupUrl, '_blank');
  }

  // NEW: Restore Backup to Server
  async restoreBackup() {
      if(!this.restoreFileInput || !this.restoreFileInput.files[0]) {
          alert('\u26a0\ufe0f Sélectionnez un fichier JSON de sauvegarde.');
          return;
      }
      
      const file = this.restoreFileInput.files[0];
      if (!confirm(`\u26a0\ufe0f ATTENTION : Cela va remplacer/mettre à jour votre base de données avec le fichier "${file.name}". Continuer ?`)) {
          return;
      }

      const reader = new FileReader();
      
      reader.onload = async (e) => {
          try {
              const jsonData = JSON.parse(e.target.result);
              
              const btn = document.getElementById('btnRestore');
              const originalText = btn.innerHTML;
              btn.disabled = true;
              btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Restauration...';

              const res = await fetch(`${FLEET_CONFIG.API.baseUrl}/api/backup/restore`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(jsonData)
              });

              const result = await res.json();
              
              if(res.ok) {
                  alert("\u2705 Restauration réussie ! La page va s'actualiser.");
                  location.reload();
              } else {
                  alert("❌ Erreur: " + result.error);
              }
              
              btn.disabled = false;
              btn.innerHTML = originalText;

          } catch (err) {
              alert("❌ Erreur fichier JSON invalide.");
              console.error(err);
          }
      };
      
      reader.readAsText(file);
  }
  
  clearHistory() {
      if(confirm("Effacer tout l'historique ?")) {
          app.trackingHistory = [];
          alert("Historique effacé.");
      }
  }

  showError(msg) { 
      this.errorContainer.innerHTML = `<div style="background:#fee;color:var(--red);padding:10px;border-radius:4px;"><i class="fa-solid fa-circle-exclamation"></i> ${msg}</div>`; 
  }

  // ============================================================
  // \u2705 ALERTS SYSTEM (Overspeed + Route Deviation)
  // ============================================================

  openSpeedRescanModal() {
    const modal = document.getElementById('modalSpeedRescan');
    if (!modal) return;
    
    // Populate trucks
    const select = document.getElementById('rescanSpeedTruck');
    if (select) {
      select.innerHTML = '<option value="ALL">Tous les camions</option>';
      const trucks = app.getAllTrucks();
      trucks.forEach(t => {
        const opt = document.createElement('option');
        opt.value = t.id;
        opt.text = t.name;
        select.appendChild(opt);
      });
    }

    // Default dates (last 24 hours)
    const end = new Date();
    const start = new Date(end.getTime() - 24 * 60 * 60 * 1000);
    const startInput = document.getElementById('rescanSpeedStart');
    const endInput = document.getElementById('rescanSpeedEnd');
    if (startInput) startInput.value = start.toISOString().slice(0, 16);
    if (endInput) endInput.value = end.toISOString().slice(0, 16);

    modal.style.display = 'flex';
  }

  closeSpeedRescanModal() {
    const modal = document.getElementById('modalSpeedRescan');
    if (modal) modal.style.display = 'none';
  }

  async triggerSpeedRescan() {
    const truckSelect = document.getElementById('rescanSpeedTruck');
    const startInput = document.getElementById('rescanSpeedStart');
    const endInput = document.getElementById('rescanSpeedEnd');
    
    if (!startInput.value || !endInput.value) {
      alert("Veuillez sélectionner les dates de début et de fin.");
      return;
    }

    const payload = {
      start: new Date(startInput.value).toISOString(),
      end: new Date(endInput.value).toISOString()
    };

    if (truckSelect.value !== 'ALL') {
      payload.deviceIds = [truckSelect.value];
    }

    const btn = document.getElementById('rescanSpeedBtn');
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Scan en cours...';
    }

    try {
      const response = await fetch(FLEET_CONFIG.API.baseUrl + '/api/speeding/rescan', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-access-code': this.currentCode
        },
        body: JSON.stringify(payload)
      });
      const text = await response.text();
      let data;
      try { data = JSON.parse(text); } catch(e) { throw new Error('Veuillez redémarrer votre serveur (node server.js) pour activer cette nouveauté !'); }
      if (data.success) {
        alert(data.message);
        this.closeSpeedRescanModal();
        if (this.loadSpeedHistory) this.loadSpeedHistory();
      } else {
        alert("Erreur: " + (data.error || "Inconnue"));
      }
    } catch (e) {
      alert("Erreur de connexion: " + e.message);
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = '<i class="fa-solid fa-play"></i> Démarrer le Scan';
      }
    }
  }

  async loadTimeline() {
    const feed = document.getElementById("alertTimelineFeed");
    if (!feed) return;
    feed.innerHTML = "<div style='padding:20px; text-align:center; color:var(--text-muted);'><i class='fa-solid fa-spinner fa-spin'></i> Chargement de la timeline...</div>";
    try {
      const res = await fetch(FLEET_CONFIG.API.baseUrl + "/api/alerts/timeline", { headers: { "x-access-code": this.currentCode } });
      const text = await res.text();
      let data;
      try { data = JSON.parse(text); } catch(e) { throw new Error("Erreur serveur (Assurez-vous que node server.js est bien redémarré)"); }
      if (!data.success) throw new Error(data.error || "Erreur de chargement");
      this.fullTimelineData = data.timeline || [];
      this.filterTimeline();
    } catch (e) {
      feed.innerHTML = "<div style='color:var(--danger); padding:10px; text-align:center;'>" + e.message + "</div>";
    }
  }

  async clearAlertTimeline() {
    if (!confirm("Voulez-vous vraiment supprimer tout l'historique de la timeline ?")) return;
    try {
      const response = await fetch(FLEET_CONFIG.API.baseUrl + "/api/alerts/timeline", {
        method: "DELETE",
        headers: { "x-access-code": this.currentCode }
      });
      const text = await response.text();
      let data;
      try { data = JSON.parse(text); } catch(e) { throw new Error('Veuillez redémarrer votre serveur (node server.js) pour activer cette nouveauté !'); }
      if (!data.success) throw new Error(data.error || "Erreur lors de la suppression");
      
      this.fullTimelineData = [];
      this.filterTimeline();
      
      if(window.pushNotification) {
         window.pushNotification("info", { title: "Succès", body: "L'historique a été vidé avec succès." });
      } else {
         alert("Historique vidé !");
      }
    } catch(e) {
      alert("Erreur: " + e.message);
    }
  }
  // Note: duplicate generateSuperReportCSV removed; consolidated into generateSuperReportXLSX


  async downloadServerBackup() {
      try {
          const btn = document.getElementById('exportJSONBtn');
          if(btn) btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Chargement...';
          
          const res = await fetch(`${FLEET_CONFIG.API.baseUrl}/api/backup/download`, {
              headers: { 'x-access-code': localStorage.getItem('fleetAccessCode') }
          });
          if (!res.ok) throw new Error('Access Denied');
          const blob = await res.blob();
          const url = window.URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.style.display = 'none';
          a.href = url;
          a.download = `Backup_Complet_${new Date().toISOString().slice(0,10)}.json`;
          document.body.appendChild(a);
          a.click();
          window.URL.revokeObjectURL(url);
          
          if(btn) btn.innerHTML = '<i class="fa-solid fa-database"></i> Backup Complet (JSON)';
      } catch (err) {
          alert("Erreur de téléchargement du backup: " + err.message);
      }
  }

  // NEW: Restore Backup to Server
  async restoreBackup() {
      if(!this.restoreFileInput || !this.restoreFileInput.files[0]) {
          alert('\u26a0\ufe0f Sélectionnez un fichier JSON de sauvegarde.');
          return;
      }
      
      const file = this.restoreFileInput.files[0];
      if (!confirm(`\u26a0\ufe0f ATTENTION : Cela va remplacer/mettre à jour votre base de données avec le fichier "${file.name}". Continuer ?`)) {
          return;
      }

      const reader = new FileReader();
      
      reader.onload = async (e) => {
          try {
              const jsonData = JSON.parse(e.target.result);
              
              const btn = document.getElementById('btnRestore');
              const originalText = btn.innerHTML;
              btn.disabled = true;
              btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Restauration...';

              const res = await fetch(`${FLEET_CONFIG.API.baseUrl}/api/backup/restore`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(jsonData)
              });

              const result = await res.json();
              
              if(res.ok) {
                  alert("\u2705 Restauration réussie ! La page va s'actualiser.");
                  location.reload();
              } else {
                  alert("❌ Erreur: " + result.error);
              }
              
              btn.disabled = false;
              btn.innerHTML = originalText;

          } catch (err) {
              alert("❌ Erreur fichier JSON invalide.");
              console.error(err);
          }
      };
      
      reader.readAsText(file);
  }

  // NEW: Load Auto Backups List
  async loadAutoBackups() {
      const select = document.getElementById('autoBackupSelect');
      if (select) select.innerHTML = '<option value="">Chargement des sauvegardes...</option>';
      try {
          const code = localStorage.getItem('fleetAccessCode') || this.currentCode || '12345';
          const res = await fetch(`${FLEET_CONFIG.API.baseUrl}/api/backups/list`, {
              headers: { 'x-access-code': code }
          });
          if (!select) return;
          if (!res.ok) {
              const errData = await res.json().catch(() => ({}));
              select.innerHTML = `<option value="">Erreur (${res.status}): ${errData.error || 'Accès refusé'}</option>`;
              return;
          }
          const files = await res.json();
          if (!Array.isArray(files) || files.length === 0) {
              select.innerHTML = '<option value="">Aucune sauvegarde automatique (30j)</option>';
              return;
          }
          select.innerHTML = files.map(f => `<option value="${f}">${f}</option>`).join('');
      } catch (err) {
          console.error('Error loading backups:', err);
          if (select) select.innerHTML = '<option value="">Erreur de connexion au serveur</option>';
      }
  }

  // NEW: Trigger Selective Restore
  async triggerSelectiveRestore() {
      const select = document.getElementById('autoBackupSelect');
      const filename = select ? select.value : '';
      if (!filename) {
          alert('Veuillez sélectionner une sauvegarde.');
          return;
      }

      const modules = [];
      if (document.getElementById('rbSettings')?.checked) modules.push('settings');
      if (document.getElementById('rbTrucks')?.checked) modules.push('truck_states');
      if (document.getElementById('rbRefuels')?.checked) modules.push('refuels');
      if (document.getElementById('rbMaint')?.checked) modules.push('maintenance');
      if (document.getElementById('rbHist')?.checked) modules.push('history');
      if (document.getElementById('rbTrans')?.checked) modules.push('transportReports');

      if (modules.length === 0) {
          alert('Veuillez cocher au moins un module à restaurer.');
          return;
      }

      if (!confirm(`⚠️ ATTENTION : Vous allez restaurer les modules suivants depuis ${filename} :\n- ${modules.join('\n- ')}\n\nContinuer ?`)) {
          return;
      }

      try {
          const res = await fetch(`${FLEET_CONFIG.API.baseUrl}/api/backups/restore-selective`, {
              method: 'POST',
              headers: { 
                'Content-Type': 'application/json',
                'x-access-code': localStorage.getItem('fleetAccessCode')
              },
              body: JSON.stringify({ filename, modules })
          });
          
          const result = await res.json();
          if (res.ok) {
              alert("✅ Restauration sélective réussie ! La page va s'actualiser.");
              location.reload();
          } else {
              alert('❌ Erreur: ' + (result.error || 'Erreur inconnue'));
          }
      } catch (err) {
          alert('❌ Erreur de connexion');
          console.error(err);
      }
  }
  
  clearHistory() {
      if(confirm("Effacer tout l'historique ?")) {
          app.trackingHistory = [];
          alert("Historique effacé.");
      }
  }

  showError(msg) { 
      this.errorContainer.innerHTML = `<div style="background:#fee;color:var(--red);padding:10px;border-radius:4px;"><i class="fa-solid fa-circle-exclamation"></i> ${msg}</div>`; 
  }

  // ============================================================
  // \u2705 ALERTS SYSTEM (Overspeed + Route Deviation)
  // ============================================================

  openSpeedRescanModal() {
    const modal = document.getElementById('modalSpeedRescan');
    if (!modal) return;
    
    // Populate trucks
    const select = document.getElementById('rescanSpeedTruck');
    if (select) {
      select.innerHTML = '<option value="ALL">Tous les camions</option>';
      const trucks = app.getAllTrucks();
      trucks.forEach(t => {
        const opt = document.createElement('option');
        opt.value = t.id;
        opt.text = t.name;
        select.appendChild(opt);
      });
    }

    // Default dates (last 24 hours)
    const end = new Date();
    const start = new Date(end.getTime() - 24 * 60 * 60 * 1000);
    const startInput = document.getElementById('rescanSpeedStart');
    const endInput = document.getElementById('rescanSpeedEnd');
    if (startInput) startInput.value = start.toISOString().slice(0, 16);
    if (endInput) endInput.value = end.toISOString().slice(0, 16);

    modal.style.display = 'flex';
  }

  closeSpeedRescanModal() {
    const modal = document.getElementById('modalSpeedRescan');
    if (modal) modal.style.display = 'none';
  }

  async triggerSpeedRescan() {
    const truckSelect = document.getElementById('rescanSpeedTruck');
    const startInput = document.getElementById('rescanSpeedStart');
    const endInput = document.getElementById('rescanSpeedEnd');
    
    if (!startInput.value || !endInput.value) {
      alert("Veuillez sélectionner les dates de début et de fin.");
      return;
    }

    const payload = {
      start: new Date(startInput.value).toISOString(),
      end: new Date(endInput.value).toISOString()
    };

    if (truckSelect.value !== 'ALL') {
      payload.deviceIds = [truckSelect.value];
    }

    const btn = document.getElementById('rescanSpeedBtn');
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Scan en cours...';
    }

    try {
      const response = await fetch(FLEET_CONFIG.API.baseUrl + '/api/speeding/rescan', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-access-code': this.currentCode
        },
        body: JSON.stringify(payload)
      });
      const text = await response.text();
      let data;
      try { data = JSON.parse(text); } catch(e) { throw new Error('Veuillez redémarrer votre serveur (node server.js) pour activer cette nouveauté !'); }
      if (data.success) {
        alert(data.message);
        this.closeSpeedRescanModal();
        if (this.loadSpeedHistory) this.loadSpeedHistory();
      } else {
        alert("Erreur: " + (data.error || "Inconnue"));
      }
    } catch (e) {
      alert("Erreur de connexion: " + e.message);
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = '<i class="fa-solid fa-play"></i> Démarrer le Scan';
      }
    }
  }

  async loadTimeline() {
    const feed = document.getElementById("alertTimelineFeed");
    if (!feed) return;
    feed.innerHTML = "<div style='padding:20px; text-align:center; color:var(--text-muted);'><i class='fa-solid fa-spinner fa-spin'></i> Chargement de la timeline...</div>";
    try {
      const res = await fetch(FLEET_CONFIG.API.baseUrl + "/api/alerts/timeline", { headers: { "x-access-code": this.currentCode } });
      const text = await res.text();
      let data;
      try { data = JSON.parse(text); } catch(e) { throw new Error("Erreur serveur (Assurez-vous que node server.js est bien redémarré)"); }
      if (!data.success) throw new Error(data.error || "Erreur de chargement");
      this.fullTimelineData = data.timeline || [];
      this.filterTimeline();
    } catch (e) {
      feed.innerHTML = "<div style='color:var(--danger); padding:10px; text-align:center;'>" + e.message + "</div>";
    }
  }

  async clearAlertTimeline() {
    if (!confirm("Voulez-vous vraiment supprimer tout l'historique de la timeline ?")) return;
    try {
      const response = await fetch(FLEET_CONFIG.API.baseUrl + "/api/alerts/timeline", {
        method: "DELETE",
        headers: { "x-access-code": this.currentCode }
      });
      const text = await response.text();
      let data;
      try { data = JSON.parse(text); } catch(e) { throw new Error('Veuillez redémarrer votre serveur (node server.js) pour activer cette nouveauté !'); }
      if (!data.success) throw new Error(data.error || "Erreur lors de la suppression");
      
      this.fullTimelineData = [];
      this.filterTimeline();
      
      if(window.pushNotification) {
         window.pushNotification("info", { title: "Succès", body: "L'historique a été vidé avec succès." });
      } else {
         alert("Historique vidé !");
      }
    } catch(e) {
      alert("Erreur: " + e.message);
    }
  }

  filterTimeline() {
    const feed = document.getElementById('alertTimelineFeed');
    const typeFilter = document.getElementById('tlFilterType')?.value || 'all';
    const sevFilter = document.getElementById('tlFilterSeverity')?.value || 'all';
    const dateFilter = document.getElementById('tlDateFilter')?.value;

    const btnZone = document.getElementById('btnOpenWatchedLocations');
    if (btnZone) {
       btnZone.style.display = typeFilter === 'geofence' ? 'inline-block' : 'none';
    }

    if (!feed || !this.fullTimelineData) return;

    let alerts = this.fullTimelineData;
    
    if (typeFilter !== 'all') alerts = alerts.filter(a => a.type === typeFilter);
    if (sevFilter !== 'all') alerts = alerts.filter(a => a.severity === sevFilter);
    if (dateFilter) {
      alerts = alerts.filter(a => {
         const aDate = new Date(a.timestamp).toISOString().split('T')[0];
         return aDate === dateFilter;
      });
    }
    
    const total = alerts.length;
    const critical = alerts.filter(a => a.severity === 'critical').length;
    const warning = alerts.filter(a => a.severity === 'warning').length;
    const info = alerts.filter(a => a.severity === 'info').length;
    
    if (document.getElementById('tlStatTotal')) document.getElementById('tlStatTotal').textContent = total;
    if (document.getElementById('tlStatCritical')) document.getElementById('tlStatCritical').textContent = critical;
    if (document.getElementById('tlStatWarning')) document.getElementById('tlStatWarning').textContent = warning;
    if (document.getElementById('tlStatInfo')) document.getElementById('tlStatInfo').textContent = info;

    if (alerts.length === 0) {
      feed.innerHTML = '<div style="text-align:center; padding:40px; color:var(--text-muted);"><i class="fa-solid fa-timeline" style="font-size:40px; display:block; margin-bottom:12px; opacity:0.3;"></i>Aucune alerte pour ces filtres</div>';
      return;
    }
    
    feed.innerHTML = alerts.map(function(a) {
      var severityColor = a.severity === 'critical' ? 'danger' : (a.severity === 'warning' ? 'warning' : 'info');
      var dateStr = new Date(a.timestamp).toLocaleString();
      return '<div style="padding:12px; background:var(--bg-elevated); border-left:4px solid var(--' + severityColor + '); border-radius:8px; margin-bottom:8px;">'
        + '<div style="font-weight:bold; color:var(--text-primary); font-size:13px;">' + a.title + '</div>'
        + '<div style="color:var(--text-secondary); font-size:12px; margin-top:4px;">' + a.message + '</div>'
        + '<div style="color:var(--text-muted); font-size:10px; margin-top:6px;"><i class="fa-regular fa-clock"></i> ' + dateStr + '</div>'
        + '</div>';
    }).join('');
  }

  toggleAlertSound() {
    let muted = localStorage.getItem('fleet_notif_muted') === 'true';
    muted = !muted;
    localStorage.setItem('fleet_notif_muted', muted ? 'true' : 'false');
    const btn = document.getElementById('alertSoundToggle');
    if (btn) {
       btn.innerHTML = muted ? '<i class="fa-solid fa-volume-xmark"></i>' : '<i class="fa-solid fa-volume-high"></i>';
       btn.style.color = muted ? 'var(--text-muted)' : 'var(--primary)';
    }
  }

  toggleAlertSubTab(tab) {
    const speedBtn = document.getElementById('btnAlertSpeed');
    const routeBtn = document.getElementById('btnAlertRoute');
    const itinBtn = document.getElementById('btnAlertItinerary');
    const tlBtn = document.getElementById('btnAlertTimeline');
    const speedSec = document.getElementById('alertSpeedSection');
    const routeSec = document.getElementById('alertRouteSection');
    const itinSec = document.getElementById('alertItinerarySection');
    const tlSec = document.getElementById('alertTimelineSection');

    // Hide ALL sections and deactivate ALL buttons first
    [speedBtn, routeBtn, itinBtn, tlBtn].forEach(b => b && b.classList.remove('active'));
    [speedSec, routeSec, itinSec, tlSec].forEach(s => s && (s.style.display = 'none'));

    if (tab === 'timeline') {
      if(tlBtn) tlBtn.classList.add('active');
      if(tlSec) tlSec.style.display = 'block';
      this.loadTimeline();
    } else if (tab === 'speed') {
      speedBtn && speedBtn.classList.add('active');
      speedSec && (speedSec.style.display = 'block');
      this.renderOverspeedAlerts();
      this.loadSpeedHistory();
    } else if (tab === 'route') {
      routeBtn && routeBtn.classList.add('active');
      routeSec && (routeSec.style.display = 'block');
    } else if (tab === 'itinerary') {
      itinBtn && itinBtn.classList.add('active');
      itinSec && (itinSec.style.display = 'block');
      // Set default dates (current month) if not set
      const ds = document.getElementById('itineraryDateStart');
      const de = document.getElementById('itineraryDateEnd');
      if (ds && !ds.value) {
          const now = new Date();
          ds.value = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-01`;
          de.value = now.toISOString().split('T')[0];
      }
      // Auto-load itinerary DB
      const container = document.getElementById('itineraryResultsContainer');
      if (container && container.querySelector('[style*="opacity:0.3"]')) {
        this.loadItineraryFromDB(parseInt(document.getElementById('itineraryMinTrucks')?.value) || 4);
      }
      // Populate zone dropdowns for manual creation
      this.populateManualItinDropdowns();
    }
  }

  getSpeedLimit() {
    return FLEET_CONFIG.SPEED_LIMIT || parseInt(localStorage.getItem('fleetSpeedLimit')) || 90;
  }

  saveSpeedLimit() {
    const val = parseInt(document.getElementById('alertSpeedLimit')?.value) || 90;
    FLEET_CONFIG.SPEED_LIMIT = val;
    localStorage.setItem('fleetSpeedLimit', val); // fallback
    this.saveSettingsToCloud();
    alert(`\u2705 Limite de vitesse sauvegardée: ${val} km/h`);
    this.refreshAlerts();
  }

  refreshAlerts() {
    // Load speed limit
    const limitInput = document.getElementById('alertSpeedLimit');
    if (limitInput) limitInput.value = this.getSpeedLimit();

    this.renderOverspeedAlerts();
    this.renderRouteDeviationAlerts();
    if (typeof this.loadSpeedHistory === 'function') {
      this.loadSpeedHistory();
    }
  }

  setSpeedHistoryView(view) {
    this.speedHistoryView = view;
    document.getElementById('speedViewCardsBtn').style.background = view === 'cards' ? 'var(--bg-elevated)' : 'none';
    document.getElementById('speedViewTableBtn').style.background = view === 'table' ? 'var(--bg-elevated)' : 'none';
    document.getElementById('speedViewCardsBtn').style.color = view === 'cards' ? 'var(--text-primary)' : 'var(--text-muted)';
    document.getElementById('speedViewTableBtn').style.color = view === 'table' ? 'var(--text-primary)' : 'var(--text-muted)';
    
    const container = document.getElementById('overspeedHistoryContainer');
    if (container) {
      container.style.display = view === 'cards' ? 'grid' : 'block';
    }
    this.loadSpeedHistory();
  }

  renderOverspeedAlerts() {
    const container = document.getElementById('overspeedAlertsContainer');
    if (!container) return;
    const speedLimit = this.getSpeedLimit();
    const trucks = app.getAllTrucks();
    const violators = trucks.filter(t => t.speed > speedLimit).sort((a, b) => b.speed - a.speed);

    if (violators.length === 0) {
      container.innerHTML = `
        <div style="grid-column:1/-1; text-align:center; padding:30px; color:var(--success);">
          <i class="fa-solid fa-shield-check" style="font-size:40px; display:block; margin-bottom:10px;"></i>
          <div style="font-size:14px; font-weight:700;">\u2705 Aucun excès de vitesse détecté</div>
          <div style="font-size:12px; color:var(--text-muted); margin-top:4px;">Tous les ${trucks.length} camions respectent la limite de ${speedLimit} km/h</div>
        </div>`;
      return;
    }

    if (!this.notifiedSpeedAlerts) this.notifiedSpeedAlerts = new Set();
    const currentViolators = new Set();

    let html = '';
    violators.forEach(t => {
      currentViolators.add(t.id);
      if (!this.notifiedSpeedAlerts.has(t.id)) {
         if (window.pushNotification) {
           window.pushNotification('speeding', {
             title: '🚨 Excès de Vitesse',
             body: `${t.name} roule à ${Math.round(t.speed)} km/h (Limite: ${speedLimit})`,
             severity: 'critical'
           });
         }
         this.notifiedSpeedAlerts.add(t.id);
      }
      const excess = t.speed - speedLimit;
      const severity = excess > 30 ? 'critical' : excess > 15 ? 'warning' : 'minor';
      const borderColor = severity === 'critical' ? 'var(--danger)' : severity === 'warning' ? 'var(--warning)' : '#fb923c';
      const badge = severity === 'critical' 
        ? '<span class="maint-status-badge badge-urgent">🚨 CRITIQUE</span>'
        : severity === 'warning' 
        ? '<span class="maint-status-badge badge-en-cours">\u26a0\ufe0f EXCESSIF</span>'
        : '<span class="maint-status-badge" style="background:var(--warning-subtle); color:#c2410c;">📢 LÉGER</span>';
      
      const locText = t.location?.city ? `${t.location.city}, ${t.location.wilaya || ''}` : 'Inconnue';

      html += `
        <div style="background:var(--bg-elevated); border:1px solid var(--border); border-left:5px solid ${borderColor}; border-radius:10px; padding:14px; ${severity === 'critical' ? 'animation: urgentFlash 1.5s ease-in-out infinite;' : ''}">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
            <div style="font-size:16px; font-weight:800; color:var(--text-primary);">${t.name}</div>
            ${badge}
          </div>
          <div style="display:grid; grid-template-columns:1fr 1fr; gap:6px; font-size:12px; color:var(--text-secondary);">
            <div><i class="fa-solid fa-gauge-high" style="color:${borderColor}; width:16px;"></i> <strong style="font-size:18px; color:${borderColor};">${t.speed} km/h</strong></div>
            <div><i class="fa-solid fa-exclamation-triangle" style="color:${borderColor}; width:16px;"></i> +${excess} km/h au dessus</div>
            <div><i class="fa-solid fa-location-dot" style="color:var(--text-muted); width:16px;"></i> ${locText}</div>
            <div><i class="fa-solid fa-road" style="color:var(--text-muted); width:16px;"></i> ${t.odometer.toLocaleString()} km</div>
          </div>
          <div style="margin-top:8px;">
            <button class="btn-secondary" onclick="ui.viewOnMap(${t.coordinates?.lat || 0}, ${t.coordinates?.lng || 0}, '${t.id}')" style="font-size:11px; padding:4px 10px;">
              <i class="fa-solid fa-map-location-dot"></i> Voir sur carte
            </button>
          </div>
        </div>`;
    });

    container.innerHTML = `
      <div style="grid-column:1/-1; background:var(--danger-subtle); border:1px solid var(--border); border-radius:8px; padding:8px 14px; margin-bottom:4px;">
        <span style="font-weight:800; color:var(--danger); font-size:14px;">🚨 ${violators.length} camion(s) en excès de vitesse</span>
        <span style="font-size:11px; color:var(--text-secondary); margin-left:8px;">Limite: ${speedLimit} km/h</span>
      </div>
      ${html}`;
      
    // Clean up old tracked alerts
    for (let id of this.notifiedSpeedAlerts) {
       if (!currentViolators.has(id)) this.notifiedSpeedAlerts.delete(id);
    }
  }

  async loadSpeedHistory() {
    const container = document.getElementById('overspeedHistoryContainer');
    const kpiTotal = document.getElementById('speedKpiTotal');
    const kpiMax = document.getElementById('speedKpiMax');
    if (!container) return;
    
    const dateFilter = document.getElementById('speedHistoryDateFilter');
    if (dateFilter && !dateFilter.value) {
        dateFilter.value = new Date().toISOString().split('T')[0];
    }
    
    try {
      container.innerHTML = '<div style="grid-column:1/-1; text-align:center; padding:20px; color:var(--text-muted);"><i class="fa-solid fa-spinner fa-spin"></i> Chargement...</div>';
      
      const response = await fetch(FLEET_CONFIG.API.baseUrl + '/api/alerts/timeline', { headers: { 'x-access-code': this.currentCode }});
      const text = await response.text();
      let data;
      try { data = JSON.parse(text); } catch(e) { throw new Error('Veuillez redémarrer votre serveur (node server.js) pour activer cette nouveauté !'); }
      
      if (!data.success) throw new Error(data.error || 'Erreur API');
      
      let speedAlerts = (data.timeline || []).filter(function(a) { return a.type === 'speeding'; });
      
      if (dateFilter && dateFilter.value) {
          const filterDate = dateFilter.value;
          speedAlerts = speedAlerts.filter(a => {
              const aDate = new Date(a.timestamp).toISOString().split('T')[0];
              return aDate === filterDate;
          });
      }
      
      if (kpiTotal) kpiTotal.textContent = speedAlerts.length;
      
      if (speedAlerts.length === 0) {
        if (kpiMax) kpiMax.innerHTML = '0 <span style="font-size:12px;">km/h</span>';
        container.innerHTML = '<div style="grid-column:1/-1; text-align:center; padding:30px; color:var(--text-muted);"><i class="fa-solid fa-database" style="font-size:36px; display:block; margin-bottom:10px; opacity:0.3;"></i><div style="font-size:13px;">Aucun historique pour cette date.</div></div>';
        return;
      }

      var maxSpeed = 0;
      var html = '';
      
      if (this.speedHistoryView === 'table') {
          html = `<table style="width:100%; border-collapse:collapse; font-size:12px; background:var(--bg-surface); border-radius:8px; overflow:hidden;">
          <thead><tr style="background:var(--bg-elevated); color:var(--text-primary); text-align:left;">
              <th style="padding:10px;">Camion</th><th style="padding:10px;">Date & Heure</th><th style="padding:10px;">Vitesse</th><th style="padding:10px;">Limite</th><th style="padding:10px;">Durée</th>
          </tr></thead><tbody>`;
          speedAlerts.forEach(function(a) {
              var v = a.data || {};
              if (v.speed > maxSpeed) maxSpeed = v.speed;
              var dateStr = new Date(a.timestamp).toLocaleString('fr-FR', {day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit'});
              var truckName = v.truckName || 'Camion';
              var speed = v.speed || '?';
              var limit = v.limit || '?';
              var dur = v.durationMinutes || '?';
              html += `<tr style="border-bottom:1px solid var(--border);">
                  <td style="padding:10px; font-weight:700; color:var(--text-primary);">${truckName}</td>
                  <td style="padding:10px; color:var(--text-muted);">${dateStr}</td>
                  <td style="padding:10px; color:var(--danger); font-weight:700;">${speed} km/h</td>
                  <td style="padding:10px; color:var(--text-muted);">${limit} km/h</td>
                  <td style="padding:10px; color:var(--text-muted);">${dur} min</td>
              </tr>`;
          });
          html += `</tbody></table>`;
      } else {
          speedAlerts.forEach(function(a) {
            var v = a.data || {};
            if (v.speed > maxSpeed) maxSpeed = v.speed;
            
            var severity = a.severity;
            var borderColor = severity === 'critical' ? 'var(--danger)' : 'var(--warning)';
            var bg = severity === 'critical' ? 'var(--danger-subtle)' : 'var(--warning-subtle)';
            var badge = severity === 'critical' 
              ? '<span class="maint-status-badge badge-urgent">\ud83d\udea8 CRITIQUE</span>'
              : '<span class="maint-status-badge badge-en-cours">\u26a0\ufe0f EXCESSIF</span>';
            
            var dateStr = new Date(a.timestamp).toLocaleString('fr-FR', {day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit'});
            var truckName = v.truckName || 'Camion';
            var speed = v.speed || '?';
            var limit = v.limit || '?';
            var dur = v.durationMinutes || '?';
            var locCity = (v.location && v.location.city) ? v.location.city : '';
            
            html += '<div style="background:var(--bg-elevated); border:1px solid var(--border); border-left:5px solid ' + borderColor + '; border-radius:10px; padding:14px; position:relative; overflow:hidden;">'
              + '<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">'
              + '<div style="font-size:15px; font-weight:800; color:var(--text-primary);">' + truckName + '</div>'
              + badge
              + '</div>'
              + '<div style="display:flex; gap:16px; margin-bottom:12px;">'
              + '<div style="background:' + bg + '; padding:10px; border-radius:8px; border:1px solid ' + borderColor + '; flex:1; text-align:center;">'
              + '<div style="font-size:11px; color:var(--text-muted); text-transform:uppercase;">Vitesse</div>'
              + '<div style="font-size:20px; font-weight:900; color:' + borderColor + ';">' + speed + ' <span style="font-size:12px;">km/h</span></div>'
              + '</div>'
              + '<div style="background:var(--bg-surface); padding:10px; border-radius:8px; border:1px solid var(--border); flex:1; text-align:center;">'
              + '<div style="font-size:11px; color:var(--text-muted); text-transform:uppercase;">Limite</div>'
              + '<div style="font-size:20px; font-weight:900; color:var(--text-secondary);">' + limit + ' <span style="font-size:12px;">km/h</span></div>'
              + '</div>'
              + '</div>'
              + '<div style="font-size:12px; color:var(--text-secondary); display:flex; flex-direction:column; gap:4px;">'
              + '<div><i class="fa-regular fa-clock" style="color:var(--text-muted); width:16px;"></i> ' + dateStr + ' (Dur\u00e9e: ' + dur + ' min)</div>'
              + (locCity ? '<div><i class="fa-solid fa-location-dot" style="color:var(--text-muted); width:16px;"></i> ' + locCity + '</div>' : '')
              + '</div>'
              + '</div>';
          });
      }
      if (kpiMax) kpiMax.innerHTML = Math.round(maxSpeed) + ' <span style="font-size:12px;">km/h</span>';
      
      container.innerHTML = html;
    } catch (e) {
      container.innerHTML = '<div style="grid-column:1/-1; color:var(--danger); padding:10px; text-align:center;">' + e.message + '</div>';
    }
  }

  openWatchedLocationsMenu() {
    let modal = document.getElementById('watchedLocationsModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'watchedLocationsModal';
        modal.style.cssText = 'position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.5); z-index:999999; display:flex; justify-content:center; align-items:center;';
        document.body.appendChild(modal);
    if(typeof this.detectPotentialZones==='function') this.detectPotentialZones();
    }
    
    let locs = FLEET_CONFIG.CUSTOM_LOCATIONS || [];
    let watchedLocs = JSON.parse(localStorage.getItem('fleet_locations') || '[]');
    let watchedNames = new Set(watchedLocs.map(l => l.name));
    
    let html = `<div style="background:var(--bg-base); padding:20px; border-radius:12px; width:400px; max-width:90%; border:1px solid var(--border); box-shadow:var(--shadow-xl);">
        <h3 style="margin-top:0; color:var(--text-primary);"><i class="fa-solid fa-map-location-dot"></i> Zones Surveillées</h3>
        <p style="font-size:12px; color:var(--text-muted); margin-bottom:15px;">Sélectionnez les zones pour lesquelles vous souhaitez recevoir une notification sonore lors de l'arrivée d'un camion.</p>
        <div style="max-height:300px; overflow-y:auto; display:flex; flex-direction:column; gap:8px;">`;
        
    locs.forEach(loc => {
        const isW = watchedNames.has(loc.name);
        html += `<label style="display:flex; align-items:center; gap:10px; padding:10px; background:var(--bg-surface); border:1px solid var(--border); border-radius:8px; cursor:pointer;">
            <input type="checkbox" ${isW ? 'checked' : ''} onchange="if(this.checked) ui.addWatchedLocation('${loc.name.replace(/'/g, "\\'")}'); else ui.removeWatchedLocation('${loc.name.replace(/'/g, "\\'")}');">
            <span style="font-size:13px; font-weight:600; color:var(--text-primary);">${loc.name}</span>
        </label>`;
    });
    
    if(locs.length === 0) {
        html += `<div style="text-align:center; padding:20px; color:var(--text-muted); font-size:12px;">Aucune zone personnalisée définie. Créez-en une dans la carte.</div>`;
    }
    
    html += `</div>
        <div style="text-align:right; margin-top:20px;">
            <button onclick="document.getElementById('watchedLocationsModal').style.display='none'" class="btn-primary" style="padding:8px 16px; background:var(--primary); color:white; border:none; border-radius:6px; cursor:pointer;">Fermer</button>
        </div>
    </div>`;
    modal.innerHTML = html;
    modal.style.display = 'flex';
  }

  addWatchedLocation(name) {
    let watched = JSON.parse(localStorage.getItem('fleet_locations') || '[]');
    if (!watched.find(l => l.name === name)) {
        watched.push({ name: name });
        localStorage.setItem('fleet_locations', JSON.stringify(watched));
    }
  }

  removeWatchedLocation(name) {
    let watched = JSON.parse(localStorage.getItem('fleet_locations') || '[]');
    watched = watched.filter(l => l.name !== name);
    localStorage.setItem('fleet_locations', JSON.stringify(watched));
  }

  renderRouteDeviationAlerts() {
    const container = document.getElementById('routeDeviationContainer');
    if (!container) return;

    const trucks = app.getAllTrucks();
    const customLocs = FLEET_CONFIG.CUSTOM_LOCATIONS || [];

    if (customLocs.length === 0) {
      container.innerHTML = `
        <div style="grid-column:1/-1; text-align:center; padding:30px; color:var(--text-muted, #94a3b8);">
          <i class="fa-solid fa-circle-info" style="font-size:36px; display:block; margin-bottom:10px; opacity:0.4;"></i>
          <div style="font-size:13px; font-weight:600;">Aucune zone personnalisée configurée</div>
          <div style="font-size:12px; margin-top:4px;">Ajoutez des zones dans Paramètres → Zones Personnalisées pour activer la détection de déviation</div>
        </div>`;
      return;
    }

    // Find trucks that are moving (speed > 5) but NOT near any known zone
    const maxDistanceKm = 15; // Alert if >15km from any known zone
    const deviants = [];

    trucks.forEach(t => {
      if (t.speed < 5) return; // Only check moving trucks
      const lat = t.position?.lat || t.lat;
      const lng = t.position?.lng || t.lng;
      if (!lat || !lng) return;

      let nearestZone = null;
      let nearestDist = Infinity;

      customLocs.forEach(loc => {
        if (!loc.lat || !loc.lng) return;
        const dist = this.haversineKm(lat, lng, parseFloat(loc.lat), parseFloat(loc.lng));
        if (dist < nearestDist) {
          nearestDist = dist;
          nearestZone = loc;
        }
      });

      if (nearestDist > maxDistanceKm) {
        deviants.push({ truck: t, nearestZone, nearestDist: Math.round(nearestDist * 10) / 10 });
      }
    });

    if (deviants.length === 0) {
      container.innerHTML = `
        <div style="grid-column:1/-1; text-align:center; padding:30px; color:#22c55e;">
          <i class="fa-solid fa-route" style="font-size:40px; display:block; margin-bottom:10px;"></i>
          <div style="font-size:14px; font-weight:700;">\u2705 Tous les camions en mouvement sont dans les zones habituelles</div>
          <div style="font-size:12px; color:var(--text-muted, #64748b); margin-top:4px;">${customLocs.length} zones surveillées • Seuil: ${maxDistanceKm} km</div>
        </div>`;
      return;
    }

    let html = `
      <div style="grid-column:1/-1; background:#f5f3ff; border:1px solid #ddd6fe; border-radius:8px; padding:8px 14px; margin-bottom:4px;">
        <span style="font-weight:800; color:#7c3aed; font-size:14px;">🔀 ${deviants.length} camion(s) hors zones habituelles</span>
        <span style="font-size:11px; color:#6d28d9; margin-left:8px;">Seuil: ${maxDistanceKm} km</span>
      </div>`;

    deviants.forEach(({ truck, nearestZone, nearestDist }) => {
      const locText = truck.location?.city ? `${truck.location.city}, ${truck.location.wilaya || ''}` : 'Position inconnue';
      html += `
        <div style="background:#faf5ff; border:1px solid #ddd6fe; border-left:5px solid #7c3aed; border-radius:10px; padding:14px;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
            <div style="font-size:16px; font-weight:800; color:var(--bg-surface, #0f172a);">${truck.name}</div>
            <span class="maint-status-badge" style="background:#f5f3ff; color:#7c3aed; border:1px solid #ddd6fe;">🔀 DÉVIATION</span>
          </div>
          <div style="display:grid; grid-template-columns:1fr 1fr; gap:6px; font-size:12px;">
            <div><i class="fa-solid fa-location-dot" style="color:#7c3aed; width:16px;"></i> ${locText}</div>
            <div><i class="fa-solid fa-gauge-high" style="color:var(--text-muted, #64748b); width:16px;"></i> ${truck.speed} km/h</div>
            <div><i class="fa-solid fa-arrows-left-right" style="color:#dc2626; width:16px;"></i> <strong style="color:#dc2626;">${nearestDist} km</strong> de la zone la plus proche</div>
            <div><i class="fa-solid fa-map-pin" style="color:var(--text-muted, #64748b); width:16px;"></i> Zone: ${nearestZone?.name || 'N/A'}</div>
          </div>
          <div style="margin-top:8px;">
            <button class="btn-secondary" onclick="ui.viewOnMap(${truck.coordinates?.lat || 0}, ${truck.coordinates?.lng || 0}, '${truck.id}')" style="font-size:11px; padding:4px 10px;">
              <i class="fa-solid fa-map-location-dot"></i> Localiser
            </button>
          </div>
        </div>`;
    });

    container.innerHTML = html;
  }

  haversineKm(lat1, lng1, lat2, lng2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng/2) * Math.sin(dLng/2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  exportAlertsXLSX() {
    const trucks = (app && typeof app.getAllTrucks === 'function') ? app.getAllTrucks() : [];
    const speedLimit = this.getSpeedLimit ? this.getSpeedLimit() : 80;
    const violators = trucks.filter(t => (t.speed || 0) > speedLimit);

    if (violators.length === 0) {
      if (typeof showToast === 'function') showToast('Aucune infraction d\'excès de vitesse.', 'info');
      else alert('Aucune alerte à exporter.');
      return;
    }

    const data = violators.map(t => {
      const loc = t.location?.city ? `${t.location.city} ${t.location.wilaya || ''}` : (t.location?.formatted || 'Inconnue');
      const excess = (t.speed || 0) - speedLimit;
      return {
        truckName: t.name || '',
        speed: t.speed || 0,
        limit: speedLimit,
        excess: excess,
        location: loc,
        odometer: t.odometer || 0,
        timestamp: t.timestamp ? new Date(t.timestamp).toLocaleString('fr-FR') : new Date().toLocaleString('fr-FR')
      };
    });

    const columns = [
      { header: 'Camion', key: 'truckName', type: 'string' },
      { header: 'Vitesse (km/h)', key: 'speed', type: 'number', format: '#,##0' },
      { header: 'Limite (km/h)', key: 'limit', type: 'number', format: '#,##0' },
      { header: 'Excès (+km/h)', key: 'excess', type: 'number', format: '+#,##0' },
      { header: 'Position', key: 'location', type: 'string' },
      { header: 'Odomètre (km)', key: 'odometer', type: 'number', format: '#,##0' },
      { header: 'Horodatage', key: 'timestamp', type: 'string' }
    ];

    const filename = `alertes_vitesse_${new Date().toISOString().slice(0, 10)}.xlsx`;
    const sheetName = 'Excès de Vitesse';
    const title = 'ALERTES EXCÈS DE VITESSE EN TEMPS RÉEL';

    if (window.ExcelExportEngine && typeof window.ExcelExportEngine.exportTableToXlsx === 'function') {
      window.ExcelExportEngine.exportTableToXlsx({
        filename,
        sheetName,
        title,
        columns,
        data,
        metadata: { exportedAt: new Date().toISOString(), totalAlerts: data.length, speedLimit }
      });
      if (typeof showToast === 'function') showToast(`Export alertes réussi (${data.length} alertes).`, 'success');
    } else {
      let csv = "Camion,Vitesse (km/h),Limite (km/h),Excès (+km/h),Position,Odomètre,Horodatage\n";
      data.forEach(r => {
        csv += `"${r.truckName}",${r.speed},${r.limit},+${r.excess},"${r.location}",${r.odometer},"${r.timestamp}"\n`;
      });
      this._downloadCSV(csv, filename.replace('.xlsx', '.csv'));
    }
  }

  exportAlertsCSV() {
    this.exportAlertsXLSX();
  }

  // ============================================================
  // \u2705 SETTINGS: Truck Metadata Editor
  // ============================================================

  async populateSettingsTruckSelect() {
    const select = document.getElementById('settingsTruckSelect');
    if (!select) return;
    select.innerHTML = '<option value="">-- Choisir --</option>';
    const trucks = app.getAllTrucks();
    trucks.forEach(t => {
      const db = this.truckDbCache.find(d => d.deviceId === t.id) || {};
      const label = db.immatriculation ? `${t.name} (${db.immatriculation})` : t.name;
      select.innerHTML += `<option value="${t.id}">${label}</option>`;
    });
    this.renderSettingsTruckMetaList();
  }

  loadTruckMetaInSettings() {
    const select = document.getElementById('settingsTruckSelect');
    const deviceId = select?.value;
    if (!deviceId) return;
    const db = this.truckDbCache.find(d => d.deviceId === deviceId) || {};
    document.getElementById('settingsChassisNumber').value = db.chassisNumber || '';
    document.getElementById('settingsImmatriculation').value = db.immatriculation || '';
    document.getElementById('settingsCarteNaftal').value = db.carteNaftal || '';
    if (document.getElementById('settingsTrailer')) document.getElementById('settingsTrailer').value = db.trailer || '';
    if (document.getElementById('settingsDriverName')) document.getElementById('settingsDriverName').value = db.driverName || '';
    if (document.getElementById('settingsDriverPhone')) document.getElementById('settingsDriverPhone').value = db.driverPhone || '';
  }

  async saveTruckMetaFromSettings() {
    const select = document.getElementById('settingsTruckSelect');
    const deviceId = select?.value;
    if (!deviceId) { alert('Sélectionnez un camion.'); return; }
    const payload = {
      deviceId,
      chassisNumber: document.getElementById('settingsChassisNumber').value.trim(),
      immatriculation: document.getElementById('settingsImmatriculation').value.trim(),
      carteNaftal: document.getElementById('settingsCarteNaftal').value.trim(),
      trailer: document.getElementById('settingsTrailer') ? document.getElementById('settingsTrailer').value.trim() : '',
      driverName: document.getElementById('settingsDriverName') ? document.getElementById('settingsDriverName').value.trim() : '',
      driverPhone: document.getElementById('settingsDriverPhone') ? document.getElementById('settingsDriverPhone').value.trim() : ''
    };
    try {
      const res = await fetch(`${FLEET_CONFIG.API.baseUrl}/api/trucks/update-info`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        alert('\u2705 Fiche véhicule enregistrée !');
        await this.loadTruckDbCache();
        this.renderSettingsTruckMetaList();
      } else { alert('Erreur serveur.'); }
    } catch (e) { alert('Erreur connexion.'); }
  }

  renderSettingsTruckMetaList() {
    const container = document.getElementById('settingsTruckMetaList');
    if (!container) return;
    const entries = this.truckDbCache.filter(d => d.chassisNumber || d.immatriculation || d.carteNaftal || d.trailer || d.driverName);
    if (entries.length === 0) {
      container.innerHTML = '<div style="text-align:center; color:var(--text-muted, #94a3b8); padding:16px; font-size:12px;">Aucune fiche véhicule renseignée. Sélectionnez un camion et remplissez les champs.</div>';
      return;
    }
    let html = `<table style="width:100%;border-collapse:collapse;font-size:12px;border-radius:8px;overflow:hidden;border:1px solid var(--border);">`;
    html += `<thead><tr style="background:var(--bg-elevated);border-bottom:2px solid var(--border);">
      <th style="padding:10px 12px;text-align:left;color:var(--text-secondary);font-weight:700;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;">Camion</th>
      <th style="padding:10px 12px;text-align:center;color:var(--text-secondary);font-weight:700;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;">Immatriculation</th>
      <th style="padding:10px 12px;text-align:center;color:var(--text-secondary);font-weight:700;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;">Châssis</th>
      <th style="padding:10px 12px;text-align:center;color:var(--text-secondary);font-weight:700;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;">Carte Naftal</th>
      <th style="padding:10px 12px;text-align:center;color:var(--text-secondary);font-weight:700;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;">Remorque</th>
      <th style="padding:10px 12px;text-align:center;color:var(--text-secondary);font-weight:700;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;">Chauffeur</th>
    </tr></thead><tbody>`;
    entries.forEach((d, i) => {
      const bg = i % 2 === 0 ? 'var(--bg-surface)' : 'var(--bg-elevated)';
      html += `<tr style="background:${bg};border-bottom:1px solid var(--border);transition:background 0.15s;" onmouseover="this.style.background='var(--bg-card-hover,rgba(56,189,248,0.05))'" onmouseout="this.style.background='${bg}'">
        <td style="padding:10px 12px;font-weight:700;color:var(--text-primary);">${d.truckName || d.deviceId}</td>
        <td style="padding:10px 12px;text-align:center;">${d.immatriculation ? `<span class="truck-meta-tag imm">${d.immatriculation}</span>` : '<em style="color:var(--text-dim);">—</em>'}</td>
        <td style="padding:10px 12px;text-align:center;">${d.chassisNumber ? `<span class="truck-meta-tag chassis">${d.chassisNumber}</span>` : '<em style="color:var(--text-dim);">—</em>'}</td>
        <td style="padding:10px 12px;text-align:center;">${d.carteNaftal ? `<span class="truck-meta-tag naftal">${d.carteNaftal}</span>` : '<em style="color:var(--text-dim);">—</em>'}</td>
        <td style="padding:10px 12px;text-align:center;">${d.trailer ? `<span class="truck-meta-tag trailer">${d.trailer}</span>` : '<em style="color:var(--text-dim);">—</em>'}</td>
        <td style="padding:10px 12px;text-align:center;">${d.driverName ? `<span class="truck-meta-tag driver">${d.driverName}</span> ${d.driverPhone ? `<br><small style="color:var(--text-muted);">${d.driverPhone}</small>` : ''}` : '<em style="color:var(--text-dim);">—</em>'}</td>
      </tr>`;
    });
    html += '</tbody></table>';
    container.innerHTML = html;
  }

  // ============================================================
  // \u2705 NAFTAL DASHBOARD PANEL
  // ============================================================
  renderNaftalDashboardPanel() {
    const panel = this.naftalDashboardPanel;
    if (!panel) return;
    const trucks = app.getAllTrucks();
    const naftalTrucks = trucks.map(t => {
      const db = (this.truckDbCache || []).find(d => d.deviceId === t.id);
      return db && db.carteNaftal ? { truck: t, db } : null;
    }).filter(Boolean);

    if (naftalTrucks.length === 0) { panel.innerHTML = ''; return; }

    // Find last external refuel per truck from cached logs
    const getLastExtRefuel = (truckId) => {
      if (!this.allRefuelLogs) return null;
      const logs = this.allRefuelLogs.filter(l => {
        if (String(l.deviceId) !== String(truckId)) return false;
        const safeLat = parseFloat(l.lat || (l.params && l.params.lat) || 0);
        const safeLng = parseFloat(l.lng || (l.params && l.params.lng) || 0);
        if (!safeLat || !safeLng) return false;
        for (const loc of (FLEET_CONFIG.CUSTOM_LOCATIONS || [])) {
        if (Math.round(this.getDistKm(safeLat, safeLng, loc.lat, loc.lng) * 1000) <= (loc.radius || 500)) return false;
        }
        return true;
      });
      if (!logs.length) return null;
      logs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
      return logs[0];
    };

    // Calculate this month's total external consumption
    const nowMonthStr = new Date().toISOString().slice(0, 7);
    let monthlyTotalL = 0;
    const monthStart = new Date(nowMonthStr + '-01');
    naftalTrucks.forEach(({ truck }) => {
      if (!this.allRefuelLogs) return;
      this.allRefuelLogs.forEach(l => {
        if (String(l.deviceId) !== String(truck.id)) return;
        if (new Date(l.timestamp) < monthStart) return;
        const safeLat = parseFloat(l.lat || 0), safeLng = parseFloat(l.lng || 0);
        if (!safeLat || !safeLng) return;
        for (const loc of (FLEET_CONFIG.CUSTOM_LOCATIONS || [])) {
          if (Math.round(this.getDistKm(safeLat, safeLng, loc.lat, loc.lng) * 1000) <= (loc.radius || 500)) return;
        }
        monthlyTotalL += Math.round(l.addedLiters || 0);
      });
    });
    const monthlyDA = Math.round(monthlyTotalL * (this.naftalPricePerLiter || 31));
    const naftalBudget = FLEET_CONFIG.NAFTAL_BUDGET || 0;
    const budgetPct = naftalBudget > 0 ? Math.min(100, Math.round((monthlyDA / naftalBudget) * 100)) : 0;

    const chips = naftalTrucks.map(({ truck, db }) => {
      const last = getLastExtRefuel(truck.id);
      const lastText = last
        ? `⛽ ${Math.round(last.addedLiters || 0)}L · ${new Date(last.timestamp).toLocaleDateString('fr-FR')}`
        : 'Aucun ravitaillement externe';
      const statusDot = truck.speed >= 1 ? '#22c55e' : 'var(--text-muted, #94a3b8)';
      return `
        <div class="naftal-card-chip" onclick="ui.toggleReportView('naftal'); ui.switchTab('reports');" title="Rapport Naftal de ${truck.name}">
          <div style="position:relative;">
            <i class="fa-solid fa-credit-card" style="color:#c4b5fd; font-size:18px;"></i>
            <span style="position:absolute; top:-2px; right:-2px; width:7px; height:7px; background:${statusDot}; border-radius:50%; border:1px solid rgba(255,255,255,0.5);"></span>
          </div>
          <div>
            <div class="truck-name" style="font-size:11px; font-weight:700;">${truck.name}</div>
            <div style="font-size:13px; font-weight:900; color:#fff; letter-spacing:2px; font-family:monospace;">N° ${db.carteNaftal}</div>
            <div class="last-refuel" style="font-size:10px; color:#c4b5fd;">${lastText}</div>
          </div>
        </div>`;
    }).join('');

    const budgetBar = naftalBudget > 0 ? `
      <div style="margin-top:10px; background:rgba(0,0,0,0.2); border-radius:8px; padding:8px 12px;">
        <div style="display:flex; justify-content:space-between; font-size:10px; color:#ddd6fe; margin-bottom:4px;">
          <span>💰 Budget Mensuel Naftal</span>
          <span>${monthlyDA.toLocaleString()} / ${naftalBudget.toLocaleString()} DA (${budgetPct}%)</span>
        </div>
        <div style="background:rgba(255,255,255,0.15); border-radius:4px; height:6px;">
          <div style="background:${budgetPct > 85 ? '#ef4444' : budgetPct > 60 ? '#f59e0b' : '#22c55e'}; width:${budgetPct}%; height:100%; border-radius:4px; transition:width 0.5s;"></div>
        </div>
      </div>` : '';

    panel.innerHTML = `
      <div class="naftal-dashboard-panel">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
          <div>
            <div style="color:#e9d5ff; font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:1.5px;">
              <i class="fa-solid fa-credit-card"></i>&nbsp; Cartes Naftal — Suivi Consommation
            </div>
            <div style="color:#fff; font-size:20px; font-weight:900; margin-top:2px;">
              ${naftalTrucks.length} carte${naftalTrucks.length > 1 ? 's' : ''} &nbsp;·&nbsp; <span style="color:#ddd6fe;">${this.naftalPricePerLiter || 31} DA/L</span>
              ${monthlyTotalL > 0 ? `&nbsp;·&nbsp; <span style="color:#4ade80; font-size:15px;">↗ ${monthlyTotalL.toLocaleString()}L ce mois</span>` : ''}
            </div>
          </div>
          <div style="display:flex; gap:6px; flex-direction:column; align-items:flex-end;">
            <button class="btn-secondary" onclick="ui.toggleReportView('naftal'); ui.switchTab('reports');" style="background:rgba(255,255,255,0.15); border-color:rgba(255,255,255,0.2); color:#fff; font-size:11px;">
              <i class="fa-solid fa-chart-pie"></i> Rapport Excel
            </button>
            ${monthlyDA > 0 ? `<div style="font-size:11px; color:#fef3c7; font-weight:700;">💸 ${monthlyDA.toLocaleString()} DA ce mois</div>` : ''}
          </div>
        </div>
        <div style="display:flex; flex-wrap:wrap; gap:6px;">${chips}</div>
        ${budgetBar}
      </div>`;
  }

  // ============================================================
  // \u2705 NAFTAL PER-CARD REPORT
  // ============================================================
  async generateNaftalCardReport() {
    const container = document.getElementById('naftalReportContainer');
    const exportBtn = document.getElementById('exportNaftalBtn');
    if (!container) return;
    container.innerHTML = '<div style="text-align:center; padding:20px; color:#7e22ce;"><i class="fa-solid fa-spinner fa-spin"></i> Chargement...</div>';

    try {
      // 1. Fetch refuels if not loaded
      if (!this.allRefuelLogs || this.allRefuelLogs.length === 0) {
        const params = new URLSearchParams();
        const ns = document.getElementById('naftalReportStart');
        const ne = document.getElementById('naftalReportEnd');
        if (ns && ns.value) params.set('start', `${ns.value} 00:00:00`);
        if (ne && ne.value) params.set('end', `${ne.value} 23:59:59`);
        params.set('limit', '20000');
        const res = await fetch(`${FLEET_CONFIG.API.baseUrl}/api/refuels?${params.toString()}`);
        if (res.ok) this.allRefuelLogs = await res.json();
      }

      const startVal = document.getElementById('naftalReportStart')?.value;
      const endVal = document.getElementById('naftalReportEnd')?.value;
      const cardSearch = (document.getElementById('naftalCardSearch')?.value || '').toLowerCase().trim();
      const startDate = startVal ? new Date(startVal) : null;
      const endDate = endVal ? new Date(endVal) : null;
      if (endDate) endDate.setHours(23, 59, 59, 999);

      const naftalPrice = this.naftalPricePerLiter || 31;

      // 2. Identify external refuels
      const externalLogs = (this.allRefuelLogs || []).filter(log => {
        const d = new Date(log.timestamp);
        if (startDate && d < startDate) return false;
        if (endDate && d > endDate) return false;
        const safeLat = parseFloat(log.lat || (log.params && log.params.lat) || 0);
        const safeLng = parseFloat(log.lng || (log.params && log.params.lng) || 0);
        if (!safeLat || !safeLng) return false;
        for (const loc of (FLEET_CONFIG.CUSTOM_LOCATIONS || [])) {
        if (Math.round(this.getDistKm(safeLat, safeLng, loc.lat, loc.lng) * 1000) <= (loc.radius || 500)) return false;
        }
        return true;
      });

      // 3. Group by Naftal card
      const byCard = {};
      externalLogs.forEach(log => {
        const db = (this.truckDbCache || []).find(d => d.deviceId === String(log.deviceId));
        const cardNum = (db && db.carteNaftal) ? db.carteNaftal : '__no_card__';
        const truckName = log.truckName || (db && db.truckName) || log.deviceId;
        if (!byCard[cardNum]) byCard[cardNum] = { cardNum, truckName, events: [] };
        byCard[cardNum].events.push({
          date: log.timestamp,
          liters: Math.round(log.addedLiters || 0),
          truckName
        });
      });

      const cardFilter = Object.values(byCard).filter(c => {
        if (c.cardNum === '__no_card__' && cardSearch && !'sans carte'.includes(cardSearch)) return false;
        if (cardSearch && !c.cardNum.toLowerCase().includes(cardSearch) && !c.truckName.toLowerCase().includes(cardSearch)) return false;
        return true;
      }).sort((a, b) => {
        const totalA = a.events.reduce((s, e) => s + e.liters, 0);
        const totalB = b.events.reduce((s, e) => s + e.liters, 0);
        return totalB - totalA;
      });

      this.naftalReportLogs = cardFilter;

      if (cardFilter.length === 0) {
        container.innerHTML = '<div style="text-align:center; padding:30px; color:var(--text-muted, #94a3b8);"><i class="fa-solid fa-credit-card" style="font-size:36px; opacity:0.3; display:block; margin-bottom:10px;"></i>Aucun remplissage externe trouvé pour cette période.</div>';
        if (exportBtn) exportBtn.style.display = 'none';
        return;
      }

      // 4. Summary stats
      const grandTotal = cardFilter.reduce((s, c) => s + c.events.reduce((ss, e) => ss + e.liters, 0), 0);
      const grandDA = Math.round(grandTotal * naftalPrice);
      const grandEvents = cardFilter.reduce((s, c) => s + c.events.length, 0);

      let html = `
        <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(130px, 1fr)); gap:10px; margin-bottom:16px;">
          <div style="background:#fdf4ff; border:1px solid #e9d5ff; border-radius:8px; padding:12px; text-align:center;">
            <div style="font-size:24px; font-weight:900; color:#7e22ce;">${cardFilter.length}</div>
            <div style="font-size:11px; color:#9333ea; font-weight:600;">Cartes</div>
          </div>
          <div style="background:#fdf4ff; border:1px solid #e9d5ff; border-radius:8px; padding:12px; text-align:center;">
            <div style="font-size:24px; font-weight:900; color:#7e22ce;">${grandEvents}</div>
            <div style="font-size:11px; color:#9333ea; font-weight:600;">Remplissages</div>
          </div>
          <div style="background:#fdf4ff; border:1px solid #e9d5ff; border-radius:8px; padding:12px; text-align:center;">
            <div style="font-size:24px; font-weight:900; color:#7e22ce;">${grandTotal.toLocaleString()} L</div>
            <div style="font-size:11px; color:#9333ea; font-weight:600;">Volume Total</div>
          </div>
          <div style="background:#581c87; border-radius:8px; padding:12px; text-align:center;">
            <div style="font-size:24px; font-weight:900; color:#fff;">${grandDA.toLocaleString()} DA</div>
            <div style="font-size:11px; color:#ddd6fe; font-weight:600;">Coût Total (${naftalPrice} DA/L)</div>
          </div>
        </div>
        <div style="display:grid; gap:10px;">`;

      cardFilter.forEach(card => {
        const totalL = card.events.reduce((s, e) => s + e.liters, 0);
        const totalDA = Math.round(totalL * naftalPrice);
        const isNoCard = card.cardNum === '__no_card__';
        const evRows = card.events.map(e => `
          <tr style="font-size:11px; border-bottom:1px solid #f3e8ff;">
            <td style="padding:5px 8px; color:#6b21a8;">${new Date(e.date).toLocaleDateString('fr-FR', {day:'2-digit', month:'short', year:'numeric'})}</td>
            <td style="padding:5px 8px; color:#333;">${e.truckName}</td>
            <td style="padding:5px 8px; font-weight:700; color:#7e22ce; text-align:right;">${e.liters} L</td>
            <td style="padding:5px 8px; color:#9333ea; text-align:right;">${Math.round(e.liters * naftalPrice).toLocaleString()} DA</td>
          </tr>`).join('');

        html += `
          <div style="background:#1a2332; border:1px solid rgba(139,92,246,0.3); border-left:5px solid ${isNoCard ? '#f59e0b' : '#7e22ce'}; border-radius:10px; overflow:hidden;">
            <div style="display:flex; justify-content:space-between; align-items:center; padding:14px 16px; background:#fdf4ff; cursor:pointer;" onclick="this.nextElementSibling.style.display=this.nextElementSibling.style.display==='none'?'block':'none'">
              <div>
                <div style="font-size:15px; font-weight:900; color:${isNoCard ? '#b45309' : '#581c87'};">
                  <i class="fa-solid fa-credit-card"></i>&nbsp; ${isNoCard ? '\u26a0\ufe0f Sans Carte Naftal' : `N° ${card.cardNum}`}
                </div>
                <div style="font-size:11px; color:#9333ea; margin-top:2px;">${card.truckName} · ${card.events.length} remplissage${card.events.length > 1 ? 's' : ''}</div>
              </div>
              <div style="text-align:right;">
                <div style="font-size:20px; font-weight:900; color:#7e22ce;">${totalL.toLocaleString()} L</div>
                <div style="font-size:13px; color:#9333ea; font-weight:700;">${totalDA.toLocaleString()} DA</div>
              </div>
            </div>
            <div style="display:none;">
              <table style="width:100%; border-collapse:collapse;">
                <thead><tr style="background:#f5f0ff; font-size:10px; color:#7c3aed; font-weight:700;">
                  <th style="padding:6px 8px; text-align:left;">Date</th>
                  <th style="padding:6px 8px; text-align:left;">Camion</th>
                  <th style="padding:6px 8px; text-align:right;">Litres</th>
                  <th style="padding:6px 8px; text-align:right;">Coût</th>
                </tr></thead>
                <tbody>${evRows}</tbody>
              </table>
            </div>
          </div>`;
      });

      html += '</div>';
      container.innerHTML = html;
      if (exportBtn) exportBtn.style.display = 'inline-flex';

    } catch (e) {
      console.error('Naftal report error:', e);
      container.innerHTML = `<div style="color:#dc2626; padding:16px;">Erreur: ${e.message}</div>`;
    }
  }

  exportNaftalReportXLSX() {
    const naftalPrice = this.naftalPricePerLiter || 31;
    if (!this.naftalReportLogs || this.naftalReportLogs.length === 0) {
      if (typeof showToast === 'function') showToast('Générez d\'abord le rapport Naftal.', 'warning');
      else alert('Générez d\'abord le rapport.');
      return;
    }

    const data = [];
    this.naftalReportLogs.forEach(card => {
      let cumL = 0, cumDA = 0;
      const cardLabel = card.cardNum === '__no_card__' ? 'Sans Carte Naftal' : `N° ${card.cardNum}`;
      card.events.forEach(e => {
        cumL += Number(e.liters || 0);
        const cost = Math.round(Number(e.liters || 0) * naftalPrice);
        cumDA += cost;
        const dt = new Date(e.date);
        data.push({
          cardLabel: cardLabel,
          truckName: e.truckName || '',
          date: dt.toLocaleDateString('fr-FR'),
          time: dt.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
          liters: Number(e.liters || 0),
          costDzd: cost,
          cumLiters: cumL,
          cumDzd: cumDA
        });
      });
    });

    const columns = [
      { header: 'Carte Naftal', key: 'cardLabel', type: 'string' },
      { header: 'Camion', key: 'truckName', type: 'string' },
      { header: 'Date', key: 'date', type: 'string' },
      { header: 'Heure', key: 'time', type: 'string' },
      { header: 'Volume (L)', key: 'liters', type: 'number', format: '#,##0' },
      { header: 'Coût', key: 'costDzd', type: 'currency', format: '#,##0 "DZD"' },
      { header: 'Cumul Volume (L)', key: 'cumLiters', type: 'number', format: '#,##0' },
      { header: 'Cumul Coût', key: 'cumDzd', type: 'currency', format: '#,##0 "DZD"' }
    ];

    const filename = `RAPPORT_NAFTAL_${new Date().toISOString().slice(0, 10)}.xlsx`;
    const sheetName = 'Cartes Naftal';
    const title = 'RAPPORT DE GESTION DES CARTES CARBURANT NAFTAL';

    if (window.ExcelExportEngine && typeof window.ExcelExportEngine.exportTableToXlsx === 'function') {
      window.ExcelExportEngine.exportTableToXlsx({
        filename,
        sheetName,
        title,
        columns,
        data,
        metadata: { exportedAt: new Date().toISOString(), naftalPrice, totalEntries: data.length }
      });
      if (typeof showToast === 'function') showToast(`Export Naftal Excel réussi (${data.length} transactions).`, 'success');
    } else {
      let csv = 'RAPPORT NAFTAL — Cartes Naftal Enregistrées\n';
      csv += `Généré le: ${new Date().toLocaleString('fr-FR')}\nPrix Naftal: ${naftalPrice} DA/L\n\n`;
      csv += 'Carte Naftal,Camion,Date,Heure,Litres,Coût (DA),Cumul Litres,Cumul DA\n';
      data.forEach(r => {
        csv += `"${r.cardLabel}","${r.truckName}","${r.date}","${r.time}",${r.liters},${r.costDzd},${r.cumLiters},${r.cumDzd}\n`;
      });
      this._downloadCSV(csv, filename.replace('.xlsx', '.csv'));
    }
  }

  exportNaftalReportCSV() {
    this.exportNaftalReportXLSX();
  }

  // ============================================================
  // \u2705 ITINERARY ENGINE
  // ============================================================

  // Detect stops ≥ minStopMinutes from GPS points
  _detectStops(points, minStopMinutes = 60) {
    const stops = [];
    let stoppedSince = null;
    let stopLat = 0, stopLng = 0;
    const STOP_SPEED = 4;
    for (let i = 0; i < points.length; i++) {
      const p = points[i];
      if (p.speed < STOP_SPEED) {
        if (!stoppedSince) { stoppedSince = p.time; stopLat = p.lat; stopLng = p.lng; }
      } else {
        if (stoppedSince) {
          const durMin = (p.time - stoppedSince) / 60000;
          if (durMin >= minStopMinutes) stops.push({ lat: stopLat, lng: stopLng, durationMin: Math.round(durMin), time: stoppedSince });
          stoppedSince = null;
        }
      }
    }
    return stops;
  }

  // Cluster stops within 100m into one waypoint
  _clusterStops(stops, toleranceMeters = 100) {
    const clusters = [];
    stops.forEach(s => {
      let found = false;
      for (const c of clusters) {
        const dist = Math.round(this.getDistKm(s.lat, s.lng, c.lat, c.lng) * 1000);
        if (dist <= toleranceMeters) { c.count++; found = true; break; }
      }
      if (!found) clusters.push({ lat: s.lat, lng: s.lng, count: 1, time: s.time });
    });
    return clusters;
  }

  // Build route key from Origin and Destination only (rounded to 2 decimals for ~1km grouping)
  _routeKey(stops) {
    if (stops.length < 2) return null;
    const start = stops[0];
    const end = stops[stops.length - 1];
    return `${start.lat.toFixed(2)},${start.lng.toFixed(2)}|${end.lat.toFixed(2)},${end.lng.toFixed(2)}`;
  }

  async analyzeItineraries() {
    const btn = document.getElementById('btnAnalyzeItinerary');
    const container = document.getElementById('itineraryResultsContainer');
    if (!container) return;

    const startVal = document.getElementById('itineraryDateStart')?.value;
    const endVal = document.getElementById('itineraryDateEnd')?.value;
    if (!startVal || !endVal) { alert('Veuillez sélectionner une période.'); return; }

    const minTrucks = parseInt(document.getElementById('itineraryMinTrucks')?.value) || 4;
    const startStr = `${startVal} 00:00:00`;
    const endStr = `${endVal} 23:59:59`;
    // Determine all month keys in the range (for multi-month periods)
    const monthKeys = [];
    const d = new Date(startVal);
    const dEnd = new Date(endVal);
    while (d <= dEnd) {
      const mk = d.toISOString().slice(0, 7);
      if (!monthKeys.includes(mk)) monthKeys.push(mk);
      d.setMonth(d.getMonth() + 1);
    }
    const primaryMonthKey = startVal.slice(0, 7);

    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Analyse...'; }
    container.innerHTML = '<div style="text-align:center; padding:30px; color:#1d4ed8;"><i class="fa-solid fa-spinner fa-spin" style="font-size:32px;"></i><div style="margin-top:12px; font-weight:700;">Analyse GPS en cours — accumulation cumulative dans MongoDB...</div><div style="font-size:11px; color:var(--text-muted, #64748b); margin-top:6px;">Chaque analyse ajoute des données sans effacer les précédentes</div></div>';

    const trucks = app.getAllTrucks();
    const segmentsToSave = [];
    let processed = 0;
    let totalStopsFound = 0;

    for (const truck of trucks) {
      processed++;
      if (btn) btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> ${processed}/${trucks.length} — <strong>${truck.name}</strong>`;
      try {
        const res = await fetch(`${FLEET_CONFIG.API.baseUrl}/api/history?imei=${truck.id}&start=${startStr}&end=${endStr}`);
        if (!res.ok) continue;
        const json = await res.json();
        const raw = Array.isArray(json) ? json : (json.messages || []);
        const points = this.normalizeHistoryMessages(raw);
        if (points.length < 5) continue;

        // Detect stops >= 60 min
        const stops = this._detectStops(points, 60);
        if (stops.length < 2) continue;
        totalStopsFound += stops.length;

        // Cluster stops within 100m tolerance
        const clusters = this._clusterStops(stops, 100);
        if (clusters.length < 2) continue;

        const key = this._routeKey(clusters);
        if (!key) continue;

        // Use the month key matching the first stop's timestamp
        const stopMonthKey = stops[0] && stops[0].time
          ? new Date(stops[0].time).toISOString().slice(0, 7)
          : primaryMonthKey;

        segmentsToSave.push({
          key,
          waypoints: clusters,
          truckId: truck.id,
          truckName: truck.name,
          monthKey: stopMonthKey
        });
      } catch (e) { console.warn(`Skip ${truck.name}:`, e.message); }
    }

    if (btn) btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Sauvegarde (${segmentsToSave.length} routes)...`;

    // Persist to MongoDB cumulatively
    if (segmentsToSave.length > 0) {
      try {
        const saveRes = await fetch(`${FLEET_CONFIG.API.baseUrl}/api/itinerary/upsert-batch`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ segments: segmentsToSave })
        });
        const saveData = await saveRes.json();
        console.log(`\u2705 Itinerary: ${saveData.updated} routes updated in MongoDB`);
      } catch (e) { console.warn('Itinerary save failed:', e); }
    }

    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-magnifying-glass-chart"></i> Analyser la Flotte'; }

    // Show summary toast
    const toast = document.createElement('div');
    toast.style.cssText = 'position:fixed; top:80px; right:20px; z-index:99999; background:var(--bg-surface, #0f172a); color:#fff; padding:12px 20px; border-radius:10px; font-size:13px; font-weight:700; box-shadow:0 8px 24px rgba(0,0,0,0.3); border-left:4px solid #22c55e; animation:slideDown 0.3s ease;';
    toast.innerHTML = `\u2705 Analyse terminée — ${segmentsToSave.length} routes enregistrées · ${totalStopsFound} arrêts détectés`;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 4000);

    // Load and render full DB
    await this.loadItineraryFromDB(minTrucks);
  }

  async loadItineraryFromDB(minTrucks = 4) {
    const container = document.getElementById('itineraryResultsContainer');
    if (!container) return;
    container.innerHTML = '<div style="text-align:center; padding:20px; color:#1d4ed8;"><i class="fa-solid fa-spinner fa-spin"></i> Chargement depuis MongoDB...</div>';
    try {
      const res = await fetch(`${FLEET_CONFIG.API.baseUrl}/api/itinerary/all`);
      if (!res.ok) throw new Error('Erreur serveur');
      const allDocs = await res.json();
      // Enrich: compute current month count
      const nowMonth = new Date().toISOString().slice(0, 7);
      const enriched = allDocs.map(doc => {
        const monthly = doc.monthly || {};
        const monthKeys = Object.keys(monthly);
        // Find best month (highest count)
        let bestMonth = null, bestCount = 0;
        monthKeys.forEach(mk => {
          const cnt = (monthly[mk] && monthly[mk].count) || 0;
          if (cnt > bestCount) { bestCount = cnt; bestMonth = mk; }
        });
        const currentMonthData = monthly[nowMonth] || { trucks: [], count: 0 };
        return {
          ...doc,
          currentMonthCount: currentMonthData.count || 0,
          currentMonthTrucks: currentMonthData.trucks || [],
          bestMonth,
          bestCount,
          allMonths: monthKeys
        };
      }).sort((a, b) => {
        if (a.isManual && !b.isManual) return -1;
        if (!a.isManual && b.isManual) return 1;
        const aQual = a.currentMonthCount >= minTrucks ? 1 : 0;
        const bQual = b.currentMonthCount >= minTrucks ? 1 : 0;
        if (aQual !== bQual) return bQual - aQual;
        return b.bestCount - a.bestCount;
      });

      this._dbItineraries = enriched;
      this._renderItineraryDB(enriched, minTrucks);

      // Auto-geocode unnamed routes in background (max 5 at a time to avoid rate limits)
      const unnamed = enriched.filter(d =>
        !d.nameStart || d.nameStart.match(/^-?\d+\.\d+/) ||
        !d.nameEnd || d.nameEnd.match(/^-?\d+\.\d+/)
      ).slice(0, 5);

      if (unnamed.length > 0) {
        (async () => {
          let resolved = 0;
          for (const doc of unnamed) {
            try {
              const first = doc.waypoints[0];
              const last = doc.waypoints[doc.waypoints.length - 1];
              const [nameA, nameB] = await Promise.all([
                geocodeService.reverseGeocode(first.lat, first.lng),
                geocodeService.reverseGeocode(last.lat, last.lng)
              ]);
              const cleanA = nameA.replace(/^[🏢\ud83d\udccd]\s*/, '').split(',')[0].trim();
              const cleanB = nameB.replace(/^[🏢\ud83d\udccd]\s*/, '').split(',')[0].trim();
              await fetch(`${FLEET_CONFIG.API.baseUrl}/api/itinerary/set-names`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ key: doc.key, nameStart: cleanA, nameEnd: cleanB })
              });
              resolved++;
            } catch(e) {}
          }
          if (resolved > 0) {
            await this.loadItineraryFromDB(minTrucks);
          }
        })();
      }
    } catch (e) {
      container.innerHTML = `<div style="color:#dc2626; padding:16px;">Erreur chargement: ${e.message}</div>`;
    }
  }

  _renderItineraryDB(docs, minTrucks) {
    const container = document.getElementById('itineraryResultsContainer');
    if (!container) return;

    if (docs.length === 0) {
      container.innerHTML = `
        <div style="text-align:center; padding:40px; color:var(--text-muted, #94a3b8);">
          <i class="fa-solid fa-route" style="font-size:40px; display:block; margin-bottom:12px; opacity:0.3;"></i>
          <div style="font-size:14px; font-weight:700;">Aucun itinéraire en base</div>
          <div style="font-size:12px; margin-top:6px;">Sélectionnez une période puis cliquez "Analyser la Flotte".</div>
        </div>`;
      return;
    }

    // Split: manual vs qualified (≥ minTrucks) vs pending
    const manual = docs.filter(d => d.isManual || (d.key && d.key.startsWith('manual_')));
    const nonManual = docs.filter(d => !d.isManual && (!d.key || !d.key.startsWith('manual_')));
    const qualified = nonManual.filter(d => (d.currentMonthCount || 0) >= minTrucks || (d.bestCount || 0) >= minTrucks);
    const pending = nonManual.filter(d => (d.currentMonthCount || 0) < minTrucks && (d.bestCount || 0) < minTrucks);

    let html = `
      <div style="display:grid; grid-template-columns:repeat(auto-fit,minmax(130px,1fr)); gap:10px; margin-bottom:16px;">
        <div style="background:#eff6ff; border:1px solid #bfdbfe; border-radius:10px; padding:12px; text-align:center;">
          <div style="font-size:26px; font-weight:900; color:#1d4ed8;">${docs.length}</div>
          <div style="font-size:10px; color:#3b82f6; font-weight:700; text-transform:uppercase;">Routes en base</div>
        </div>
        <div style="background:#e0e7ff; border:1px solid #c7d2fe; border-radius:10px; padding:12px; text-align:center;">
          <div style="font-size:26px; font-weight:900; color:#3730a3;">${manual.length}</div>
          <div style="font-size:10px; color:#4f46e5; font-weight:700; text-transform:uppercase;">⭐ Officielles</div>
        </div>
        <div style="background:#f0fdf4; border:1px solid #bbf7d0; border-radius:10px; padding:12px; text-align:center;">
          <div style="font-size:26px; font-weight:900; color:#166534;">${qualified.length}</div>
          <div style="font-size:10px; color:#15803d; font-weight:700; text-transform:uppercase;">\u2705 Validées</div>
        </div>
        <div style="background:#fff7ed; border:1px solid #fed7aa; border-radius:10px; padding:12px; text-align:center;">
          <div style="font-size:26px; font-weight:900; color:#c2410c;">${pending.length}</div>
          <div style="font-size:10px; color:#ea580c; font-weight:700; text-transform:uppercase;">⏳ En cours (< ${minTrucks})</div>
        </div>
      </div>`;

    if (manual.length > 0) {
      html += `<div style="font-size:11px; font-weight:800; color:#4f46e5; text-transform:uppercase; letter-spacing:1px; margin-bottom:8px; display:flex; align-items:center; gap:6px;">
        <i class="fa-solid fa-star"></i> Routes Officielles (Manuelles)
      </div>
      <div style="display:grid; gap:10px; margin-bottom:16px;">`;
      manual.forEach((doc) => {
        const idx = docs.indexOf(doc);
        const nameA = doc.nameStart || `${(doc.waypoints[0]||{}).lat?.toFixed(2)},${(doc.waypoints[0]||{}).lng?.toFixed(2)}`;
        const nameB = doc.nameEnd || `${(doc.waypoints[doc.waypoints.length-1]||{}).lat?.toFixed(2)},${(doc.waypoints[doc.waypoints.length-1]||{}).lng?.toFixed(2)}`;
        
        html += `<div style="background:#1a2332; border:1.5px solid rgba(99,102,241,0.3); border-left:5px solid #4f46e5; border-radius:12px; padding:16px; box-shadow:0 2px 8px rgba(79,70,229,0.08);">
          <div style="display:flex; justify-content:space-between; align-items:start; margin-bottom:10px;">
            <div style="flex:1;">
              <div style="font-size:15px; font-weight:900; color:var(--bg-surface, #0f172a); margin-bottom:3px;">
                <i class="fa-solid fa-route" style="color:#4f46e5;"></i>
                ${nameA} <span style="color:#4f46e5; font-weight:700;">→</span> ${nameB}
              </div>
              <div style="font-size:10px; color:var(--text-muted, #64748b);">
                ${doc.waypoints.length} waypoints de précision
              </div>
            </div>
            <div style="display:flex; flex-direction:column; align-items:flex-end; gap:4px;">
              <span style="background:#e0e7ff; color:#3730a3; padding:4px 12px; border-radius:20px; font-size:10px; font-weight:800;">⭐ OFFICIELLE</span>
            </div>
          </div>
          <div style="display:flex; gap:8px; flex-wrap:wrap; align-items:center; margin-top:8px;">
            <button onclick="ui.showItineraryOnMap(${idx})" class="btn-primary" style="background:#4f46e5; border:none; font-size:11px; padding:6px 14px;">
              <i class="fa-solid fa-map-location-dot"></i> Voir Route
            </button>
            <button onclick="ui.manualRenameItinerary(${idx})" class="btn-secondary" style="font-size:11px; padding:6px 12px; border-color:#7c3aed; color:#7c3aed;">
              <i class="fa-solid fa-pen"></i> Renommer
            </button>
            <button onclick="ui.deleteItinerary(${idx})" class="btn-secondary" style="font-size:11px; padding:6px 10px; border-color:#fecaca; color:#dc2626;">
              <i class="fa-solid fa-trash"></i>
            </button>
          </div>
        </div>`;
      });
      html += `</div>`;
    }

    if (qualified.length === 0) {
      html += `<div style="background:#fff7ed; border:1px solid #fed7aa; border-radius:10px; padding:16px; text-align:center; margin-bottom:12px;">
        <i class="fa-solid fa-clock" style="color:#f59e0b; font-size:24px; margin-bottom:8px; display:block;"></i>
        <div style="font-weight:700; color:#92400e;">Aucun itinéraire automatique validé ce mois</div>
        <div style="font-size:11px; color:#b45309; margin-top:4px;">Les itinéraires s'accumulent avec chaque analyse (seuil: ${minTrucks} camions).</div>
      </div>`;
    } else {
      html += `<div style="font-size:11px; font-weight:800; color:#166534; text-transform:uppercase; letter-spacing:1px; margin-bottom:8px; display:flex; align-items:center; gap:6px;">
        <i class="fa-solid fa-robot"></i> Itinéraires Automatiques (${qualified.length})
        <span style="font-size:9px; background:#dcfce7; color:#166534; padding:2px 8px; border-radius:10px;">≥ ${minTrucks} camions</span>
      </div>
      <div style="display:grid; gap:10px; margin-bottom:16px;">`;

      qualified.forEach((doc, i) => {
        const idx = docs.indexOf(doc);
        const nameA = doc.nameStart || `${(doc.waypoints[0]||{}).lat?.toFixed(2)},${(doc.waypoints[0]||{}).lng?.toFixed(2)}`;
        const nameB = doc.nameEnd || `${(doc.waypoints[doc.waypoints.length-1]||{}).lat?.toFixed(2)},${(doc.waypoints[doc.waypoints.length-1]||{}).lng?.toFixed(2)}`;
        const trucks = doc.allTrucks || [];
        const bestMonthStr = doc.bestMonth ? `Meilleur mois: ${doc.bestMonth} (${doc.bestCount} trucks)` : '';

        html += `<div style="background:#1a2332; border:1.5px solid rgba(16,185,129,0.3); border-left:5px solid #16a34a; border-radius:12px; padding:16px; box-shadow:0 2px 8px rgba(22,163,74,0.08);">
          <div style="display:flex; justify-content:space-between; align-items:start; margin-bottom:10px;">
            <div style="flex:1;">
              <div style="font-size:15px; font-weight:900; color:var(--bg-surface, #0f172a); margin-bottom:3px;">
                <i class="fa-solid fa-route" style="color:#16a34a;"></i>
                ${nameA} <span style="color:#16a34a; font-weight:700;">→</span> ${nameB}
              </div>
              <div style="font-size:10px; color:var(--text-muted, #64748b);">
                ${doc.waypoints.length} waypoints · ${doc.totalObservations||0} observations · ${bestMonthStr}
              </div>
            </div>
            <div style="display:flex; flex-direction:column; align-items:flex-end; gap:4px;">
              <span style="background:#dcfce7; color:#166534; padding:4px 12px; border-radius:20px; font-size:10px; font-weight:800;">\u2705 VALIDÉ</span>
              <span style="font-size:10px; color:#475569;">🚛 ${trucks.length} camion${trucks.length>1?'s':''} uniques</span>
            </div>
          </div>
          <div style="display:flex; gap:8px; flex-wrap:wrap; align-items:center; margin-top:8px;">
            <button onclick="ui.showItineraryOnMap(${idx})" class="btn-primary" style="background:#1d4ed8; border:none; font-size:11px; padding:6px 14px;">
              <i class="fa-solid fa-map-location-dot"></i> Voir Route Réelle
            </button>
            <button onclick="ui.manualRenameItinerary(${idx})" class="btn-secondary" style="font-size:11px; padding:6px 12px; border-color:#7c3aed; color:#7c3aed;">
              <i class="fa-solid fa-pen"></i> Renommer
            </button>
            <button onclick="ui.resolveItineraryNames(${idx})" class="btn-secondary" style="font-size:11px; padding:6px 12px;">
              <i class="fa-solid fa-wand-magic-sparkles"></i> Auto-nommer
            </button>
            <button onclick="ui.deleteItinerary(${idx})" class="btn-secondary" style="font-size:11px; padding:6px 10px; border-color:#fecaca; color:#dc2626;">
              <i class="fa-solid fa-trash"></i>
            </button>
            <span style="margin-left:auto; font-size:10px; color:var(--text-muted, #94a3b8);">
              <i class="fa-solid fa-shield-check" style="color:#16a34a;"></i> Surveillance déviation: ±700m actif
            </span>
          </div>
        </div>`;
      });
      html += '</div>';
    }

    // Pending section (collapsed by default)
    if (pending.length > 0) {
      html += `<details style="margin-top:8px;">
        <summary style="font-size:11px; font-weight:700; color:#b45309; cursor:pointer; padding:8px 12px; background:#fff7ed; border:1px solid #fed7aa; border-radius:8px; list-style:none; display:flex; align-items:center; gap:6px;">
          <i class="fa-solid fa-clock"></i> ${pending.length} itinéraire${pending.length>1?'s':''} en cours d'accumulation (< ${minTrucks} passages)
          <span style="font-size:9px; opacity:0.7; margin-left:auto;">Cliquer pour voir</span>
        </summary>
        <div style="display:grid; gap:8px; margin-top:8px; padding:4px;">`;

      pending.forEach((doc) => {
        const idx = docs.indexOf(doc);
        const nameA = doc.nameStart || `${(doc.waypoints[0]||{}).lat?.toFixed(2)}°`;
        const nameB = doc.nameEnd || `${(doc.waypoints[doc.waypoints.length-1]||{}).lat?.toFixed(2)}°`;
        const cnt = doc.currentMonthCount || 0;
        const pct = Math.min(100, Math.round((cnt / minTrucks) * 100));
        html += `<div style="background:#fffbeb; border:1px solid #fde68a; border-radius:8px; padding:12px;">
          <div style="font-size:12px; font-weight:700; color:#92400e; margin-bottom:6px;">
            ${nameA} → ${nameB}
            <span style="font-size:10px; background:#fef3c7; color:#b45309; padding:2px 8px; border-radius:10px; margin-left:6px;">${cnt}/${minTrucks} trucks</span>
          </div>
          <div style="background:#fde68a; border-radius:4px; height:5px; margin-bottom:8px;">
            <div style="background:#f59e0b; width:${pct}%; height:100%; border-radius:4px;"></div>
          </div>
          <div style="display:flex; gap:6px;">
            <button onclick="ui.showItineraryOnMap(${idx})" class="btn-secondary" style="font-size:10px; padding:4px 10px; border-color:#fbbf24; color:#92400e;">
              <i class="fa-solid fa-eye"></i> Aperçu carte
            </button>
            <button onclick="ui.deleteItinerary(${idx})" class="btn-secondary" style="font-size:10px; padding:4px 8px; border-color:#fecaca; color:#dc2626;">
              <i class="fa-solid fa-trash"></i>
            </button>
          </div>
        </div>`;
      });
      html += '</div></details>';
    }

    container.innerHTML = html;
    this._resolvedItineraries = docs;
  }


  async resolveItineraryNames(idx) {
    const doc = (this._dbItineraries || [])[idx];
    if (!doc) return;
    const first = doc.waypoints[0];
    const last = doc.waypoints[doc.waypoints.length - 1];
    const [nameA, nameB] = await Promise.all([
      geocodeService.reverseGeocode(first.lat, first.lng),
      geocodeService.reverseGeocode(last.lat, last.lng)
    ]);
    await fetch(`${FLEET_CONFIG.API.baseUrl}/api/itinerary/set-names`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: doc.key, nameStart: nameA.replace('🏢 ',''), nameEnd: nameB.replace('🏢 ','') })
    });
    await this.loadItineraryFromDB(parseInt(document.getElementById('itineraryMinTrucks')?.value)||4);
  }

  // \u2705 Manual rename itinerary
  async manualRenameItinerary(idx) {
    const doc = (this._dbItineraries || [])[idx];
    if (!doc) return;
    const currentStart = doc.nameStart || '';
    const currentEnd = doc.nameEnd || '';
    const newStart = prompt(`Nom du point de DÉPART:\n(actuel: ${currentStart || 'non défini'})`, currentStart);
    if (newStart === null) return;
    const newEnd = prompt(`Nom du point d'ARRIVÉE:\n(actuel: ${currentEnd || 'non défini'})`, currentEnd);
    if (newEnd === null) return;
    try {
      await fetch(`${FLEET_CONFIG.API.baseUrl}/api/itinerary/set-names`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: doc.key, nameStart: newStart.trim(), nameEnd: newEnd.trim() })
      });
      await this.loadItineraryFromDB(parseInt(document.getElementById('itineraryMinTrucks')?.value)||4);
    } catch (e) { alert('Erreur: ' + e.message); }
  }

  // \u2705 Delete single itinerary
  async deleteItinerary(idx) {
    const doc = (this._dbItineraries || [])[idx];
    if (!doc) return;
    const nameA = doc.nameStart || doc.waypoints[0]?.lat?.toFixed(2);
    const nameB = doc.nameEnd || doc.waypoints[doc.waypoints.length-1]?.lat?.toFixed(2);
    if (!confirm(`Supprimer l'itinéraire "${nameA} → ${nameB}" ?`)) return;
    try {
      await fetch(`${FLEET_CONFIG.API.baseUrl}/api/itinerary/delete-one`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: doc.key })
      });
      await this.loadItineraryFromDB(parseInt(document.getElementById('itineraryMinTrucks')?.value)||4);
    } catch (e) { alert('Erreur: ' + e.message); }
  }

  // \u2705 Auto-fill truck info in maintenance modal from DB cache
  _autoFillTruckInfoInModal(deviceId) {
    if (!deviceId) return;
    const db = (this.truckDbCache || []).find(d => String(d.deviceId) === String(deviceId));
    const truck = app.getAllTrucks().find(t => t.id === deviceId);

    // Build the info card
    let infoEl = document.getElementById('modalMaintTruckInfo');
    if (!infoEl) {
      infoEl = document.createElement('div');
      infoEl.id = 'modalMaintTruckInfo';
      // Insert after the first maint-form-grid (truck + type row)
      const firstGrid = document.querySelector('#maintenanceModal .maint-form-grid');
      if (firstGrid) firstGrid.parentNode.insertBefore(infoEl, firstGrid.nextSibling);
    }

    if (!db && !truck) { infoEl.innerHTML = ''; return; }

    const imm = db?.immatriculation || '';
    const chassis = db?.chassisNumber || '';
    const naftal = db?.carteNaftal || '';
    const speed = truck ? `${truck.speed} km/h` : '—';
    const fuel = truck ? `${truck.fuelLiters}L (${truck.fuelPercentage}%)` : '—';
    const loc = truck?.location?.city ? `${truck.location.city}, ${truck.location.wilaya || ''}` : '—';
    const odo = truck ? truck.odometer.toLocaleString() + ' km' : (db ? '—' : '—');
    const vidangeInfo = truck?.vidange?.alert ? `<span style="color:#dc2626; font-weight:700;"><i class="fa-solid fa-wrench"></i> VIDANGE REQUISE (${truck.vidange.kmUntilNext?.toLocaleString()} km restants)</span>` : '';

    const immInput = document.getElementById('modalMaintImm');
    if (immInput) immInput.value = imm;
    const lastMaint = (this.allMaintenanceLogs || []).filter(m => m.truckName === (truck?.name || db?.truckName)).sort((a,b) => new Date(b.date) - new Date(a.date))[0];
    const lastMaintText = lastMaint ? `${lastMaint.type} — ${new Date(lastMaint.date).toLocaleDateString('fr-FR')} à ${lastMaint.odometer?.toLocaleString() || '?'}km` : 'Aucune';

    infoEl.innerHTML = `
      <div style="background:linear-gradient(135deg,#fffbeb,#fef3c7); border:1px solid #fde68a; border-radius:10px; padding:12px 14px; margin:8px 0; animation:slideDown 0.3s ease;">
        <div style="font-size:10px; color:#92400e; font-weight:700; text-transform:uppercase; letter-spacing:1px; margin-bottom:8px;">
          <i class="fa-solid fa-id-card"></i> Fiche Véhicule — Remplissage Auto
        </div>
        <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:6px; font-size:11px;">
          <div style="background:#1a1000; padding:6px 8px; border-radius:6px; border:1px solid #fde68a;">
            <div style="color:#92400e; font-weight:600; font-size:9px;">IMMATRICULATION</div>
            <div style="font-weight:800; color:var(--bg-surface, #0f172a);">${imm || '<em style="color:#ccc;">—</em>'}</div>
          </div>
          <div style="background:#1a1000; padding:6px 8px; border-radius:6px; border:1px solid #fde68a;">
            <div style="color:#92400e; font-weight:600; font-size:9px;">N° CHÂSSIS</div>
            <div style="font-weight:800; color:var(--bg-surface, #0f172a); font-family:monospace; font-size:10px;">${chassis || '<em style="color:#ccc;">—</em>'}</div>
          </div>
          <div style="background:${naftal ? 'linear-gradient(135deg,#581c87,#7e22ce)' : 'white'}; padding:6px 8px; border-radius:6px; border:1px solid ${naftal ? '#7e22ce' : '#fde68a'};">
            <div style="color:${naftal ? '#ddd6fe' : '#92400e'}; font-weight:600; font-size:9px;">CARTE NAFTAL</div>
            <div style="font-weight:900; color:${naftal ? '#fff' : '#ccc'}; letter-spacing:1px;">${naftal || '—'}</div>
          </div>
        </div>
        <div style="display:grid; grid-template-columns:1fr 1fr 1fr 1fr; gap:6px; font-size:11px; margin-top:6px;">
          <div style="background:#1a2332; padding:5px 8px; border-radius:6px; border:1px solid var(--border, rgba(255,255,255,0.1));">
            <div style="color:var(--text-muted, #64748b); font-size:9px;">COMPTEUR</div>
            <div style="font-weight:700;">${odo}</div>
          </div>
          <div style="background:#1a2332; padding:5px 8px; border-radius:6px; border:1px solid var(--border, rgba(255,255,255,0.1));">
            <div style="color:var(--text-muted, #64748b); font-size:9px;">CARBURANT</div>
            <div style="font-weight:700;">${fuel}</div>
          </div>
          <div style="background:#1a2332; padding:5px 8px; border-radius:6px; border:1px solid var(--border, rgba(255,255,255,0.1));">
            <div style="color:var(--text-muted, #64748b); font-size:9px;">POSITION</div>
            <div style="font-weight:600; font-size:10px;">${loc}</div>
          </div>
          <div style="background:#1a2332; padding:5px 8px; border-radius:6px; border:1px solid var(--border, rgba(255,255,255,0.1));">
            <div style="color:var(--text-muted, #64748b); font-size:9px;">VITESSE</div>
            <div style="font-weight:700;">${speed}</div>
          </div>
        </div>
        ${vidangeInfo ? `<div style="margin-top:6px; font-size:11px;">${vidangeInfo}</div>` : ''}
        <div style="margin-top:6px; font-size:10px; color:var(--text-muted, #64748b); border-top:1px solid #fde68a; padding-top:5px;">
          <i class="fa-solid fa-clock-rotate-left"></i> Dernière maintenance: <strong>${lastMaintText}</strong>
        </div>
      </div>`;
  }

  async clearItineraryDB() {
    if (!confirm('\u26a0\ufe0f Supprimer TOUS les itinéraires enregistrés en MongoDB ?')) return;
    await fetch(`${FLEET_CONFIG.API.baseUrl}/api/itinerary/clear`, { method: 'DELETE' });
    this._dbItineraries = [];
    this._resolvedItineraries = [];
    await this.loadItineraryFromDB();
  }

  // ────────────────────────────────────────────────────────
  // ROUTE BUILDER — Geocoding + Mapbox Directions (99%+ accuracy)
  // ────────────────────────────────────────────────────────

  async _itinGeoSearch(query, dropdownId, coordId) {
    const dropdown = document.getElementById(dropdownId);
    if (!dropdown) return;
    
    // Clear old coordinate so we don't reuse it if user types a new name without selecting!
    const coordInput = document.getElementById(coordId);
    if (coordInput) coordInput.value = '';

    if (!query || query.length < 2) { dropdown.style.display = 'none'; return; }

    // First check custom locations for quick match
    const locs = FLEET_CONFIG?.CUSTOM_LOCATIONS || [];
    const customMatches = locs.filter(l =>
      (l.name && l.name.toLowerCase().includes(query.toLowerCase())) ||
      (l.wilaya && l.wilaya.toLowerCase().includes(query.toLowerCase()))
    ).slice(0, 4);

    // Also geocode with Mapbox
    const token = (typeof FLEET_CONFIG !== 'undefined' && FLEET_CONFIG.MAPBOX_TOKEN) ? FLEET_CONFIG.MAPBOX_TOKEN : (typeof mapboxgl !== 'undefined' ? mapboxgl.accessToken : '');
    let geoResults = [];
    try {
      const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?country=DZ&language=fr&limit=6&access_token=${token}`;
      const r = await fetch(url);
      const json = await r.json();
      geoResults = (json.features || []).map(f => ({
        name: f.place_name,
        coords: f.center,
        type: 'geo'
      }));
    } catch (e) {
      console.warn("Geocoding failed:", e);
    }

    const customItems = customMatches.map(l => ({
      name: `\ud83d\udccd ${l.name} (${l.wilaya || ''})`,
      coords: [l.lng, l.lat],
      type: 'custom'
    }));

    const all = [...customItems, ...geoResults];
    if (all.length === 0) { dropdown.style.display = 'none'; return; }

    dropdown.innerHTML = all.map((item, i) => `<div onclick="ui._itinSelectPlace(${JSON.stringify(item.coords).replace(/"/g,"'")}, '${item.name.replace(/'/g,"\\'")}', '${dropdownId}', '${coordId}')" style="padding:10px 14px;cursor:pointer;border-bottom:1px solid #f1f5f9;font-size:12px;font-weight:600;display:flex;align-items:center;gap:8px;transition:background 0.15s;" onmouseover="this.style.background='#fdf4ff'" onmouseout="this.style.background='#fff'"><i class="fa-solid ${item.type==='custom' ? 'fa-map-pin' : 'fa-location-dot'}" style="color:#7e22ce;font-size:12px;width:14px;"></i><span>${item.name}</span></div>`).join('');
    dropdown.style.display = 'block';
  }

  _itinSelectPlace(coords, name, dropdownId, coordId) {
    const dropdown = document.getElementById(dropdownId);
    const coordInput = document.getElementById(coordId);
    // Fill the text input
    const inputId = dropdownId === 'itinOriginDropdown' ? 'itinOriginInput' : 'itinDestInput';
    const textInput = document.getElementById(inputId);
    if (textInput) textInput.value = name.replace(/^\ud83d\udccd /, '');
    if (coordInput) coordInput.value = JSON.stringify(coords);
    if (dropdown) dropdown.style.display = 'none';

    // Auto-suggest route name
    const originInput = document.getElementById('itinOriginInput');
    const destInput = document.getElementById('itinDestInput');
    const nameInput = document.getElementById('manualItinName');
    if (nameInput && originInput && destInput && originInput.value && destInput.value) {
      const o = originInput.value.split(',')[0].trim();
      const d = destInput.value.split(',')[0].trim();
      if (!nameInput.value) nameInput.value = `${o} → ${d}`;
    }
  }

  _addWaypointRow() {
    const container = document.getElementById('itinWaypointsContainer');
    if (!container) return;
    const idx = Date.now();
    const row = document.createElement('div');
    row.id = `wpRow_${idx}`;
    row.style.cssText = 'display:grid; grid-template-columns:1fr auto; gap:8px; align-items:center; position:relative;';
    row.innerHTML = `
      <div style="position:relative;">
        <input type="text" placeholder="Via: Batna, Sétif..." autocomplete="off"
          id="wpInput_${idx}"
          style="width:100%; padding:8px 12px; border:1.5px solid #e9d5ff; border-radius:8px; font-size:12px; font-weight:600; box-sizing:border-box;"
          oninput="ui._itinGeoSearch(this.value,'wpDrop_${idx}','wpCoord_${idx}')">
        <div id="wpDrop_${idx}" style="display:none; position:absolute; top:100%; left:0; right:0; background:#fff; border:1px solid #e9d5ff; border-radius:8px; box-shadow:0 8px 25px rgba(0,0,0,0.15); z-index:500; max-height:150px; overflow-y:auto;"></div>
        <input type="hidden" id="wpCoord_${idx}">
      </div>
      <button onclick="document.getElementById('wpRow_${idx}').remove()" style="background:#fef2f2; color:#dc2626; border:1px solid #fecaca; border-radius:6px; padding:7px 10px; cursor:pointer; font-size:12px;">✕</button>`;
    container.appendChild(row);
  }

  async previewItineraryRoute() {
    const originCoord = document.getElementById('itinOriginCoord')?.value;
    const destCoord = document.getElementById('itinDestCoord')?.value;

    if (!originCoord || !destCoord) {
      document.getElementById('manualItinStatus').style.display = 'block';
      document.getElementById('manualItinStatus').innerHTML = '\u26a0\ufe0f Saisissez et sélectionnez un départ ET une arrivée dans les listes déroulantes.';
      return;
    }

    const origin = JSON.parse(originCoord);
    const dest = JSON.parse(destCoord);

    // Collect waypoints
    const waypointCoords = [];
    document.querySelectorAll('[id^="wpCoord_"]').forEach(el => {
      if (el.value) {
        try { waypointCoords.push(JSON.parse(el.value)); } catch(e) {}
      }
    });

    const allPoints = [origin, ...waypointCoords, dest];
    const statusEl = document.getElementById('manualItinStatus');
    const previewBtn = document.getElementById('btnPreviewRoute');

    // UI: loading state
    statusEl.style.display = 'block';
    statusEl.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Calcul de la route sur les routes réelles...';
    previewBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Calcul...';
    previewBtn.disabled = true;

    // Switch to map tab
    this.switchTab('byWilaya');
    const mapDiv = document.getElementById('map-wrapper');
    if (mapDiv) mapDiv.style.display = 'block';
    const backBtn = document.getElementById('btnBackToItin');
    if (backBtn) backBtn.style.display = 'flex';
    await new Promise(r => setTimeout(r, 600));
    if (window.AlgeriaMap?.map) window.AlgeriaMap.map.resize();

    try {
      const token = mapboxgl.accessToken;
      // Build waypoints string: origin;wp1;wp2;...;dest
      const coordStr = allPoints.map(c => `${c[0]},${c[1]}`).join(';');
      const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${coordStr}?geometries=geojson&overview=full&steps=false&access_token=${token}`;
      const res = await fetch(url);
      const json = await res.json();

      if (!json.routes || json.routes.length === 0) {
        statusEl.innerHTML = '❌ Aucune route trouvée. Vérifiez les coordonnées.';
        previewBtn.innerHTML = '<i class="fa-solid fa-road"></i> Prévisualiser Route';
        previewBtn.disabled = false;
        return;
      }

      const route = json.routes[0];
      this._previewedRouteCoords = route.geometry.coordinates;
      this._previewedRouteDist = route.distance;
      this._previewedRouteDuration = route.duration;
      this._previewedRouteWaypoints = allPoints;

      // Draw on map
      this._renderPreviewedRoute(window.AlgeriaMap.map);

      // Fit map to route
      const coords = route.geometry.coordinates;
      const lngs = coords.map(c => c[0]);
      const lats = coords.map(c => c[1]);
      window.AlgeriaMap.map.fitBounds(
        [[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]],
        { padding: 60, duration: 1200 }
      );

      // Show stats
      const distKm = (route.distance / 1000).toFixed(1);
      const durMin = Math.round(route.duration / 60);
      const durText = durMin >= 60 ? `${Math.floor(durMin/60)}h${durMin%60 > 0 ? durMin%60+'min' : ''}` : `${durMin} min`;

      document.getElementById('itinPreviewDist').textContent = distKm + ' km';
      document.getElementById('itinPreviewTime').textContent = durText;
      document.getElementById('itinPreviewPts').textContent = coords.length.toLocaleString();
      document.getElementById('itinPreviewInfo').style.display = 'block';

      statusEl.innerHTML = `\u2705 Route tracée — ${distKm} km en ${durText} (${coords.length.toLocaleString()} points de précision)`;
      previewBtn.innerHTML = '<i class="fa-solid fa-rotate"></i> Re-calculer';
      previewBtn.disabled = false;
      document.getElementById('btnSaveManualItin').style.display = 'inline-flex';
      document.getElementById('btnCancelDraw').style.display = 'inline-flex';

      // Scroll back to alerts/itinerary section
      setTimeout(() => document.getElementById('alertsSection')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 1400);

    } catch (e) {
      statusEl.innerHTML = '❌ Erreur: ' + e.message;
      previewBtn.innerHTML = '<i class="fa-solid fa-road"></i> Prévisualiser Route';
      previewBtn.disabled = false;
    }
  }

  _renderPreviewedRoute(map) {
    const layerIds = ['_preview_glow', '_preview_line', '_preview_markers'];
    const sourceIds = ['_preview_route', '_preview_waypoints'];
    layerIds.forEach(id => { try { if (map.getLayer(id)) map.removeLayer(id); } catch(e) {} });
    sourceIds.forEach(id => { try { if (map.getSource(id)) map.removeSource(id); } catch(e) {} });

    const coords = this._previewedRouteCoords || [];
    if (coords.length < 2) return;

    map.addSource('_preview_route', {
      type: 'geojson',
      data: { type: 'Feature', geometry: { type: 'LineString', coordinates: coords } }
    });
    map.addLayer({ id: '_preview_glow', type: 'line', source: '_preview_route', paint: { 'line-color': '#7e22ce', 'line-width': 16, 'line-opacity': 0.12, 'line-blur': 4 } });
    map.addLayer({ id: '_preview_line', type: 'line', source: '_preview_route', paint: { 'line-color': '#7e22ce', 'line-width': 6 } });

    const wps = this._previewedRouteWaypoints || [];
    if (wps.length > 0) {
      const features = wps.map((c, i) => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: c },
        properties: { label: i === 0 ? 'A' : i === wps.length - 1 ? 'B' : String(i), isEnd: i === 0 || i === wps.length - 1 }
      }));
      map.addSource('_preview_waypoints', { type: 'geojson', data: { type: 'FeatureCollection', features } });
      map.addLayer({
        id: '_preview_markers', type: 'circle', source: '_preview_waypoints',
        paint: {
          'circle-radius': ['case', ['get', 'isEnd'], 12, 8],
          'circle-color': ['case', ['==', ['get', 'label'], 'A'], '#22c55e', ['==', ['get', 'label'], 'B'], '#dc2626', '#7e22ce'],
          'circle-stroke-width': 3, 'circle-stroke-color': '#fff'
        }
      });
    }
  }

  cancelDrawingItinerary() {
    if (window.AlgeriaMap?.map) {
      const map = window.AlgeriaMap.map;
      if (this._mapDrawClickHandler) map.off('click', this._mapDrawClickHandler);
      map.getCanvas().style.cursor = '';
      ['_drawPreview','_drawPreview_line','_drawPreview_pts','_drawPreview_pts_circles','_drawPreview_pts_labels',
       '_drawSnapped','_drawSnapped_glow','_drawSnapped_line','_drawSnapped_pts','_drawSnapped_pts_circles','_drawSnapped_pts_labels',
       '_preview_glow','_preview_line','_preview_markers','_preview_route','_preview_waypoints'].forEach(id => {
        try { if (map.getLayer(id)) map.removeLayer(id); if (map.getSource(id)) map.removeSource(id); } catch(e) {}
      });
    }
    const tb = document.getElementById('_drawToolbar');
    if (tb) tb.remove();
    this._manualDrawPoints = [];
    this._manualDrawWaypoints = [];
    this._snappedRouteCoords = [];
    this._snappedRouteDist = 0;
    this._previewedRouteCoords = null;
    this._previewedRouteDist = 0;
    this._previewedRouteWaypoints = null;

    const save = document.getElementById('btnSaveManualItin');
    const cancel = document.getElementById('btnCancelDraw');
    const preview = document.getElementById('btnPreviewRoute');
    if (save) save.style.display = 'none';
    if (cancel) cancel.style.display = 'none';
    if (preview) { preview.innerHTML = '<i class="fa-solid fa-road"></i> Prévisualiser Route'; preview.disabled = false; }

    const s = document.getElementById('manualItinStatus');
    if (s) s.style.display = 'none';
    const info = document.getElementById('itinPreviewInfo');
    if (info) info.style.display = 'none';
  }

  async saveManualItinerary() {
    const coords = this._previewedRouteCoords;
    if (!coords || coords.length < 2) {
      alert('Prévisualisez d\'abord la route avant d\'enregistrer.');
      return;
    }

    const originInput = document.getElementById('itinOriginInput')?.value || 'Départ';
    const destInput = document.getElementById('itinDestInput')?.value || 'Arrivée';
    const nameStart = originInput.split(',')[0].trim();
    const nameEnd = destInput.split(',')[0].trim();
    const routeName = document.getElementById('manualItinName')?.value || `${nameStart} → ${nameEnd}`;
    const waypoints = coords.map(c => ({ lat: c[1], lng: c[0] }));
    const wps = this._previewedRouteWaypoints || [];
    const keyParts = wps.map(w => `${w[1].toFixed(3)}_${w[0].toFixed(3)}`).join('|');
    const key = 'manual_' + keyParts.slice(0, 60);
    const monthKey = new Date().toISOString().slice(0, 7);
    const distKm = ((this._previewedRouteDist || 0) / 1000).toFixed(1);

    try {
      await fetch(`${FLEET_CONFIG.API.baseUrl}/api/itinerary/upsert-batch`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ segments: [{ key, waypoints, truckId: 'manual', truckName: 'Route Manuelle', monthKey, isManual: true }] })
      });
      await fetch(`${FLEET_CONFIG.API.baseUrl}/api/itinerary/set-names`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, nameStart, nameEnd })
      });
      if (window.showToast) {
        showToast(`\u2705 Itinéraire "${routeName}" enregistré — ${distKm} km, ${waypoints.length.toLocaleString()} points de précision`, 'success', 5000);
      } else {
        alert(`\u2705 Itinéraire "${routeName}" enregistré!\n📏 ${distKm} km\n\ud83d\udccd ${waypoints.length.toLocaleString()} points de précision routière`);
      }
      this.cancelDrawingItinerary();
      this.toggleAlertSubTab('itinerary');
      this._switchItinTab('routes');
      await this.loadItineraryFromDB();
    } catch (e) { alert('Erreur: ' + e.message); }
  }

  async showItineraryOnMap(idx) {
    const r = (this._resolvedItineraries || [])[idx];
    if (!r) return;
    const nameA = r.nameStart || 'Départ';
    const nameB = r.nameEnd || 'Arrivée';

    // Show loading toast
    if (window.showToast) showToast(`⏳ Chargement route réelle — ${nameA} → ${nameB}...`, 'info', 3000);

    this.switchTab('byWilaya');
    const mapDiv = document.getElementById('map-wrapper');
    if (mapDiv) mapDiv.style.display = 'block';
    const backBtn = document.getElementById('btnBackToItin');
    if (backBtn) backBtn.style.display = 'flex';

    await new Promise(resolve => setTimeout(resolve, 700));
    if (!window.AlgeriaMap || !window.AlgeriaMap.map) return;
    const map = window.AlgeriaMap.map;
    map.resize();

    // Clear old layers
    this.clearItineraryMap();

    // Get key waypoints (origin → main stops → destination)
    const wps = r.waypoints || [];
    if (wps.length < 2) { if (window.showToast) showToast('❌ Pas assez de waypoints', 'error'); return; }

    // Sample intelligently: origin, key stops, destination (max 25 for Directions API)
    const maxWps = 23;
    let sampledWps;
    if (wps.length <= maxWps + 2) {
      sampledWps = wps;
    } else {
      const step = Math.floor(wps.length / maxWps);
      sampledWps = [wps[0]];
      for (let i = step; i < wps.length - step; i += step) sampledWps.push(wps[i]);
      sampledWps.push(wps[wps.length - 1]);
    }

    try {
      const token = mapboxgl.accessToken;
      const coordStr = sampledWps.map(w => `${w.lng},${w.lat}`).join(';');
      const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${coordStr}?geometries=geojson&overview=full&steps=false&access_token=${token}`;
      const res = await fetch(url);
      const json = await res.json();

      if (!json.routes || json.routes.length === 0) {
        if (window.showToast) showToast('❌ Route introuvable via Mapbox Directions', 'error');
        return;
      }

      const route = json.routes[0];
      const coords = route.geometry.coordinates;
      const distKm = (route.distance / 1000).toFixed(1);
      const durMin = Math.round(route.duration / 60);
      const durText = durMin >= 60 ? `${Math.floor(durMin/60)}h${durMin%60>0?durMin%60+'min':''}` : `${durMin}min`;

      const prefix = `itin_show_${Date.now()}`;

      // Main route source
      map.addSource(prefix, {
        type: 'geojson',
        data: { type: 'Feature', geometry: { type: 'LineString', coordinates: coords } }
      });

      // Corridor (100m tolerance highlight)
      map.addLayer({ id: prefix + '_corridor', type: 'line', source: prefix,
        paint: { 'line-color': '#1d4ed8', 'line-width': 24, 'line-opacity': 0.07, 'line-blur': 6 }
      });
      // Glow
      map.addLayer({ id: prefix + '_glow', type: 'line', source: prefix,
        paint: { 'line-color': '#60a5fa', 'line-width': 10, 'line-opacity': 0.3 }
      });
      // Main line — solid, real road
      map.addLayer({ id: prefix + '_main', type: 'line', source: prefix,
        paint: { 'line-color': '#1d4ed8', 'line-width': 4 }
      });

      this.itineraryMapLayerIds.push(prefix, prefix + '_corridor', prefix + '_glow', prefix + '_main');

      // Key stop markers (origin, intermediate stops, destination)
      const stopFeatures = sampledWps.map((w, i) => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [w.lng, w.lat] },
        properties: {
          label: i === 0 ? nameA : i === sampledWps.length - 1 ? nameB : `Arrêt ${i}`,
          isEnd: i === 0 || i === sampledWps.length - 1,
          isStart: i === 0,
          isLast: i === sampledWps.length - 1
        }
      }));

      const stopSrc = prefix + '_stops';
      map.addSource(stopSrc, { type: 'geojson', data: { type: 'FeatureCollection', features: stopFeatures } });
      map.addLayer({
        id: stopSrc + '_circles', type: 'circle', source: stopSrc,
        paint: {
          'circle-radius': ['case', ['get', 'isEnd'], 12, 6],
          'circle-color': ['case', ['get', 'isStart'], '#22c55e', ['get', 'isLast'], '#dc2626', '#3b82f6'],
          'circle-stroke-width': ['case', ['get', 'isEnd'], 3, 2],
          'circle-stroke-color': '#fff'
        }
      });
      map.addLayer({
        id: stopSrc + '_labels', type: 'symbol', source: stopSrc,
        filter: ['get', 'isEnd'],
        layout: {
          'text-field': ['get', 'label'], 'text-size': 12,
          'text-offset': [0, 1.8], 'text-anchor': 'top',
          'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold']
        },
        paint: { 'text-color': 'var(--bg-elevated, #1e293b)', 'text-halo-color': '#fff', 'text-halo-width': 2 }
      });
      this.itineraryMapLayerIds.push(stopSrc, stopSrc + '_circles', stopSrc + '_labels');

      // Fit to route bounds
      const lngs = coords.map(c => c[0]);
      const lats = coords.map(c => c[1]);
      map.fitBounds([[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]], { padding: 80, duration: 1400 });

      if (window.showToast) showToast(`\u2705 ${nameA} → ${nameB} | 📏 ${distKm} km | ⏱ ${durText} | 🚛 ${(r.allTrucks||[]).length} camions`, 'success', 6000);

      // Mark as active deviation monitoring route
      this._activeDeviationItinerary = { key: r.key, coords, nameA, nameB, distKm, toleranceM: 700 };

    } catch (e) {
      if (window.showToast) showToast('❌ Erreur Mapbox Directions: ' + e.message, 'error');
      console.error('showItineraryOnMap error:', e);
    }
  }



  clearItineraryMap() {
    if (!window.AlgeriaMap || !window.AlgeriaMap.map) return;
    const map = window.AlgeriaMap.map;
    const ids = this.itineraryMapLayerIds || [];
    // MUST remove layers first, then sources (Mapbox requirement)
    ids.forEach(id => { try { if (map.getLayer(id)) map.removeLayer(id); } catch(e) {} });
    ids.forEach(id => { try { if (map.getSource(id)) map.removeSource(id); } catch(e) {} });
    this.itineraryMapLayerIds = [];
  }

  // ─── MANUAL ITINERARY CREATION ─────────────────────────────────────

  populateManualItinDropdowns() {
    const startSel = document.getElementById('manualItinStart');
    const endSel = document.getElementById('manualItinEnd');
    if (!startSel || !endSel) return;
    const locs = FLEET_CONFIG.CUSTOM_LOCATIONS || [];
    const buildOpts = (el) => {
      el.innerHTML = '<option value="">— Sélectionner une zone —</option>';
      locs.forEach((loc, i) => {
        const icon = loc.type === 'client' ? '🏢' : loc.type === 'maintenance' ? '🔧' : loc.type === 'site' ? '🏭' : '\ud83d\udccd';
        el.innerHTML += `<option value="${i}">${icon} ${loc.name} (${loc.lat.toFixed(3)}, ${loc.lng.toFixed(3)})</option>`;
      });
      // Add "Point personnalisé" option
      el.innerHTML += '<option value="__custom__">📌 Point personnalisé (cliquer sur la carte)</option>';
    };
    buildOpts(startSel);
    buildOpts(endSel);
  }


  // ─── ROAD-SNAPPED ITINERARY (Mapbox Directions API) ─────────
  async _fetchRoadSegment(from, to) {
    const token = mapboxgl.accessToken;
    const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${from[0]},${from[1]};${to[0]},${to[1]}?geometries=geojson&overview=full&access_token=${token}`;
    try {
      const res = await fetch(url);
      const json = await res.json();
      if (json.routes && json.routes[0]) {
        return { coords: json.routes[0].geometry.coordinates, distance: json.routes[0].distance, duration: json.routes[0].duration };
      }
    } catch (e) { console.warn('Road snap failed:', e); }
    return null;
  }

  async _rebuildSnappedRoute() {
    if (!this._manualDrawWaypoints || this._manualDrawWaypoints.length < 2) {
      this._snappedRouteCoords = [];
      this._snappedRouteDist = 0;
      return;
    }
    const allCoords = [];
    let totalDist = 0;
    const tb = document.getElementById('_drawToolbarStatus');
    if (tb) tb.innerHTML = '<i class="fa-solid fa-spinner fa-spin" style="color:#a78bfa;"></i> Calcul route...';
    for (let i = 0; i < this._manualDrawWaypoints.length - 1; i++) {
      const seg = await this._fetchRoadSegment(this._manualDrawWaypoints[i], this._manualDrawWaypoints[i + 1]);
      if (seg) {
        if (allCoords.length > 0) allCoords.pop();
        allCoords.push(...seg.coords);
        totalDist += seg.distance;
      } else {
        allCoords.push(this._manualDrawWaypoints[i], this._manualDrawWaypoints[i + 1]);
      }
    }
    this._snappedRouteCoords = allCoords;
    this._snappedRouteDist = totalDist;
    this._renderSnappedRoute(window.AlgeriaMap.map);
    this._updateDrawStatus();
  }

  _renderSnappedRoute(map) {
    ['_drawSnapped', '_drawSnapped_glow', '_drawSnapped_line', '_drawSnapped_pts', '_drawSnapped_pts_circles', '_drawSnapped_pts_labels'].forEach(id => {
      try { if (map.getLayer(id)) map.removeLayer(id); if (map.getSource(id)) map.removeSource(id); } catch(e) {}
    });
    if (this._snappedRouteCoords && this._snappedRouteCoords.length >= 2) {
      map.addSource('_drawSnapped', { type: 'geojson', data: { type: 'Feature', geometry: { type: 'LineString', coordinates: this._snappedRouteCoords } } });
      map.addLayer({ id: '_drawSnapped_glow', type: 'line', source: '_drawSnapped', paint: { 'line-color': '#7e22ce', 'line-width': 12, 'line-opacity': 0.15, 'line-blur': 3 } });
      map.addLayer({ id: '_drawSnapped_line', type: 'line', source: '_drawSnapped', paint: { 'line-color': '#7e22ce', 'line-width': 5 } });
    }
    const wps = this._manualDrawWaypoints || [];
    if (wps.length > 0) {
      const features = wps.map((c, i) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: c }, properties: { idx: i, label: i === 0 ? 'A' : i === wps.length - 1 ? 'B' : String(i) } }));
      map.addSource('_drawSnapped_pts', { type: 'geojson', data: { type: 'FeatureCollection', features } });
      map.addLayer({ id: '_drawSnapped_pts_circles', type: 'circle', source: '_drawSnapped_pts', paint: { 'circle-radius': 10, 'circle-color': ['case', ['==', ['get', 'label'], 'A'], '#22c55e', ['==', ['get', 'label'], 'B'], '#dc2626', '#7e22ce'], 'circle-stroke-width': 3, 'circle-stroke-color': '#fff' } });
      map.addLayer({ id: '_drawSnapped_pts_labels', type: 'symbol', source: '_drawSnapped_pts', layout: { 'text-field': ['get', 'label'], 'text-size': 11, 'text-allow-overlap': true, 'text-font': ['Open Sans Bold'] }, paint: { 'text-color': '#fff' } });
    }
  }

  startDrawingItinerary() {
    // Legacy stub — new UI uses previewItineraryRoute() directly
    this.previewItineraryRoute();
  }

  _updateDrawStatus() {
    const wps = this._manualDrawWaypoints || [];
    const roadDist = (this._snappedRouteDist || 0) / 1000;
    const d = roadDist > 0 ? ` — ${roadDist.toFixed(1)} km (route réelle)` : '';
    const s = document.getElementById('manualItinStatus');
    if (s) { s.style.display = 'block'; s.innerHTML = `<i class="fa-solid fa-road" style="color:#a78bfa;"></i> <strong>Route Réelle</strong> — ${wps.length} waypoint(s)${d}. Cliquez sur la carte pour tracer.`; }
    const tb = document.getElementById('_drawToolbarStatus');
    if (tb) tb.innerHTML = `<i class="fa-solid fa-road" style="color:#a78bfa;"></i> ${wps.length} pts${d}`;
  }

  undoLastDrawPoint() {
    if (!this._manualDrawWaypoints || this._manualDrawWaypoints.length === 0) return;
    this._manualDrawWaypoints.pop();
    this._manualDrawPoints = [...this._manualDrawWaypoints];
    this._rebuildSnappedRoute();
  }

  _renderDrawnRoute(map) {
    ['_drawPreview', '_drawPreview_line', '_drawPreview_pts', '_drawPreview_pts_circles', '_drawPreview_pts_labels'].forEach(id => {
      try { if (map.getLayer(id)) map.removeLayer(id); if (map.getSource(id)) map.removeSource(id); } catch(e) {}
    });
    if (this._manualDrawPoints.length < 1) return;
    if (this._manualDrawPoints.length >= 2) {
      map.addSource('_drawPreview', { type: 'geojson', data: { type: 'Feature', geometry: { type: 'LineString', coordinates: this._manualDrawPoints } } });
      map.addLayer({ id: '_drawPreview_line', type: 'line', source: '_drawPreview', paint: { 'line-color': '#7e22ce', 'line-width': 5, 'line-dasharray': [3, 2] } });
    }
    const features = this._manualDrawPoints.map((c, i) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: c }, properties: { idx: i, label: String(i+1) } }));
    map.addSource('_drawPreview_pts', { type: 'geojson', data: { type: 'FeatureCollection', features } });
    map.addLayer({ id: '_drawPreview_pts_circles', type: 'circle', source: '_drawPreview_pts', paint: { 'circle-radius': 9, 'circle-color': '#7e22ce', 'circle-stroke-width': 3, 'circle-stroke-color': '#fff' } });
    map.addLayer({ id: '_drawPreview_pts_labels', type: 'symbol', source: '_drawPreview_pts', layout: { 'text-field': ['get', 'label'], 'text-size': 10, 'text-allow-overlap': true }, paint: { 'text-color': '#fff' } });
  }

  // Old cancelDrawingItinerary — now handled by the new version above
  _legacyCancelDrawing() {
    // no-op — kept for safety
  }

  // Old saveManualItinerary — now handled by the new version above
  _legacySaveManualItinerary() {
    // no-op — kept for safety
  }

  // ─── ENHANCED MAINTENANCE HISTORY FILTERS ──────────────────────────

  renderMaintenanceHistoryFilters() {
    const container = document.getElementById('maintenanceHistoryContainer');
    if (!container) return;
    
    const logs = this.allMaintenanceLogs || [];
    // Unique types and trucks
    const types = [...new Set(logs.map(l => l.type))].sort();
    const trucks = [...new Set(logs.map(l => l.truckName))].sort();

    const typeOpts = types.map(t => `<option value="${t}">${t}</option>`).join('');
    const truckOpts = trucks.map(t => `<option value="${t}">${t}</option>`).join('');
    
    // Statistics
    const totalCost = logs.reduce((s, l) => s + (l.cost || 0), 0);
    const avgCost = logs.length > 0 ? Math.round(totalCost / logs.length) : 0;
    const urgentCount = logs.filter(l => l.priority === 'urgent').length;
    const thisMonth = logs.filter(l => new Date(l.date).toISOString().slice(0,7) === new Date().toISOString().slice(0,7)).length;

    return `
      <div style="background:#fffbeb; border:1px solid #fde68a; border-radius:10px; padding:12px; margin-bottom:14px;">
        <div style="display:grid; grid-template-columns:repeat(auto-fit,minmax(120px,1fr)); gap:8px; margin-bottom:10px;">
          <div style="background:#1a2332; padding:8px; border-radius:8px; text-align:center; border:1px solid #fde68a;">
            <div style="font-size:20px; font-weight:900; color:#92400e;">${logs.length}</div>
            <div style="font-size:9px; color:#b45309; font-weight:700;">TOTAL</div>
          </div>
          <div style="background:#1a2332; padding:8px; border-radius:8px; text-align:center; border:1px solid #fde68a;">
            <div style="font-size:20px; font-weight:900; color:#16a34a;">${thisMonth}</div>
            <div style="font-size:9px; color:#15803d; font-weight:700;">CE MOIS</div>
          </div>
          <div style="background:#1a2332; padding:8px; border-radius:8px; text-align:center; border:1px solid #fde68a;">
            <div style="font-size:20px; font-weight:900; color:#dc2626;">${urgentCount}</div>
            <div style="font-size:9px; color:#ef4444; font-weight:700;">URGENTES</div>
          </div>
          <div style="background:#1a2332; padding:8px; border-radius:8px; text-align:center; border:1px solid #fde68a;">
            <div style="font-size:20px; font-weight:900; color:#7e22ce;">${totalCost.toLocaleString()} DA</div>
            <div style="font-size:9px; color:#9333ea; font-weight:700;">COÛT TOTAL</div>
          </div>
        </div>
        <div style="display:flex; gap:8px; flex-wrap:wrap; align-items:flex-end;">
          <div style="display:flex; flex-direction:column; gap:3px;">
            <label style="font-size:10px; font-weight:700; color:#92400e;">Camion</label>
            <select id="maintHistoryTruckFilter" onchange="ui.applyMaintenanceHistoryFilters()" style="padding:6px; border:1px solid #fde68a; border-radius:6px; font-size:11px;">
              <option value="">Tous</option>${truckOpts}
            </select>
          </div>
          <div style="display:flex; flex-direction:column; gap:3px;">
            <label style="font-size:10px; font-weight:700; color:#92400e;">Type</label>
            <select id="maintHistoryTypeFilter" onchange="ui.applyMaintenanceHistoryFilters()" style="padding:6px; border:1px solid #fde68a; border-radius:6px; font-size:11px;">
              <option value="">Tous</option>${typeOpts}
            </select>
          </div>
          <div style="display:flex; flex-direction:column; gap:3px;">
            <label style="font-size:10px; font-weight:700; color:#92400e;">Du</label>
            <input type="date" id="maintHistoryDateStart" onchange="ui.applyMaintenanceHistoryFilters()" style="padding:6px; border:1px solid #fde68a; border-radius:6px; font-size:11px;">
          </div>
          <div style="display:flex; flex-direction:column; gap:3px;">
            <label style="font-size:10px; font-weight:700; color:#92400e;">Au</label>
            <input type="date" id="maintHistoryDateEnd" onchange="ui.applyMaintenanceHistoryFilters()" style="padding:6px; border:1px solid #fde68a; border-radius:6px; font-size:11px;">
          </div>
          <div style="display:flex; flex-direction:column; gap:3px;">
            <label style="font-size:10px; font-weight:700; color:#92400e;">Priorité</label>
            <select id="maintHistoryPrioFilter" onchange="ui.applyMaintenanceHistoryFilters()" style="padding:6px; border:1px solid #fde68a; border-radius:6px; font-size:11px;">
              <option value="">Toutes</option>
              <option value="urgent">🔴 Urgent</option>
              <option value="normal">🟢 Normal</option>
              <option value="bas">⚪ Bas</option>
            </select>
          </div>
          <button class="btn-secondary" onclick="ui.exportMaintenanceCSV()" style="font-size:10px; padding:6px 12px; border-color:#fde68a; color:#92400e;">
            <i class="fa-solid fa-file-excel"></i> Export Excel
          </button>
        </div>
      </div>`;
  }

  // Helper to retrieve maintenance logs strictly honoring active UI filter inputs
  getFilteredMaintenanceLogs() {
    const truckF    = (document.getElementById('maintTruckSearch')?.value || '').toLowerCase().trim();
    const typeF     = document.getElementById('maintTypeFilter')?.value || '';
    const prioF     = document.getElementById('maintHistoryPrioFilter')?.value || '';
    const dateStart = document.getElementById('maintDateStart')?.value ||
                      document.getElementById('maintHistoryDateStart')?.value || '';
    const dateEnd   = document.getElementById('maintDateEnd')?.value ||
                      document.getElementById('maintHistoryDateEnd')?.value || '';

    let filtered = [...(this.allMaintenanceLogs || [])];
    if (truckF) filtered = filtered.filter(l => (l.truckName || '').toLowerCase().includes(truckF));
    if (typeF && typeF !== 'all') filtered = filtered.filter(l => l.type === typeF);
    if (prioF) filtered = filtered.filter(l => (l.priority || '').toLowerCase() === prioF.toLowerCase());
    if (dateStart) filtered = filtered.filter(l => new Date(l.date || l.createdAt) >= new Date(dateStart));
    if (dateEnd) filtered = filtered.filter(l => new Date(l.date || l.createdAt) <= new Date(dateEnd + 'T23:59:59'));
    return filtered;
  }

  applyMaintenanceHistoryFilters() {
    const filtered = this.getFilteredMaintenanceLogs();
    const listEl = document.getElementById('maintenanceHistoryList');
    if (!listEl) return;
    listEl.innerHTML = this._renderMaintenanceRows(filtered);
  }

  // =========================================================================
  // 3. NATIVE FORMATTED EXCEL MAINTENANCE EXPORT (F3 - FILTER BUG RESOLVED)
  // =========================================================================
  exportMaintenanceXLSX() {
    if (!this.allMaintenanceLogs || this.allMaintenanceLogs.length === 0) {
      if (typeof showToast === 'function') showToast('Aucun enregistrement de maintenance disponible.', 'warning');
      else alert('Rien à exporter.');
      return;
    }

    const filtered = this.getFilteredMaintenanceLogs();
    if (filtered.length === 0) {
      if (typeof showToast === 'function') showToast('Aucun enregistrement ne correspond aux filtres de maintenance.', 'warning');
      else alert('Rien à exporter pour les filtres sélectionnés.');
      return;
    }

    const data = filtered.map(item => {
      const d = new Date(item.date || item.createdAt || Date.now());
      const dateStr = d.toLocaleDateString('fr-FR');
      const timeStr = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
      const prio = (item.priority || 'normal').toUpperCase();
      const status = item.status || 'done';
      const statusLabel = (status === 'done' || status === 'completed' || status === 'termine' || status === 'terminé')
        ? 'Terminé'
        : (status === 'cancelled' || status === 'annule' || status === 'annulé')
          ? 'Annulé'
          : 'En cours';

      return {
        date: dateStr,
        time: timeStr,
        truckName: item.truckName || '—',
        type: item.type || 'Maintenance Générale',
        priority: prio,
        odometer: Number(item.odometer) || 0,
        location: item.location || '—',
        description: item.description || item.note || '—',
        technician: item.technician || '—',
        costDzd: Number(item.cost) || 0,
        status: statusLabel,
        isAuto: item.isAuto ? 'Oui' : 'Non'
      };
    });

    const columns = [
      { header: 'Date', key: 'date', type: 'string' },
      { header: 'Heure', key: 'time', type: 'string' },
      { header: 'Camion', key: 'truckName', type: 'string' },
      { header: 'Type d\'Intervention', key: 'type', type: 'string' },
      { header: 'Priorité', key: 'priority', type: 'string' },
      { header: 'Compteur (km)', key: 'odometer', type: 'number', format: '#,##0' },
      { header: 'Lieu / Garage', key: 'location', type: 'string' },
      { header: 'Description / Note', key: 'description', type: 'string' },
      { header: 'Technicien / Intervenant', key: 'technician', type: 'string' },
      { header: 'Coût', key: 'costDzd', type: 'currency', format: '#,##0 "DZD"' },
      { header: 'Statut', key: 'status', type: 'string' },
      { header: 'Auto', key: 'isAuto', type: 'string' }
    ];

    const filename = `maintenance_export_${new Date().toISOString().slice(0, 10)}.xlsx`;
    const sheetName = 'Maintenance';
    const title = 'HISTORIQUE DES OPÉRATIONS DE MAINTENANCE & VIDANGES';

    if (window.ExcelExportEngine && typeof window.ExcelExportEngine.exportTableToXlsx === 'function') {
      window.ExcelExportEngine.exportTableToXlsx({
        filename,
        sheetName,
        title,
        columns,
        data,
        metadata: {
          exportedAt: new Date().toISOString(),
          totalRecords: data.length,
          activeFilters: {
            truck: document.getElementById('maintTruckSearch')?.value || 'Tous',
            type: document.getElementById('maintTypeFilter')?.value || 'Tous',
            dateStart: document.getElementById('maintDateStart')?.value || document.getElementById('maintHistoryDateStart')?.value || 'Tous',
            dateEnd: document.getElementById('maintDateEnd')?.value || document.getElementById('maintHistoryDateEnd')?.value || 'Tous'
          }
        }
      });
      if (typeof showToast === 'function') showToast(`Export Excel réussi (${data.length} opérations).`, 'success');
    } else {
      let csv = "Date,Heure,Camion,Type,Priorité,Compteur (km),Lieu,Note,Technicien,Coût (DA),Statut,Auto\n";
      data.forEach(r => {
        csv += `"${r.date}","${r.time}","${r.truckName}","${r.type}","${r.priority}",${r.odometer},"${r.location}","${r.description.replace(/"/g, '""')}","${r.technician}",${r.costDzd},"${r.status}","${r.isAuto}"\n`;
      });
      this._downloadCSV(csv, filename.replace('.xlsx', '.csv'));
    }
  }

  exportMaintenanceCSV() {
    this.exportMaintenanceXLSX();
  }

  // ============================================================
  // \u2705 MAINTENANCE FOLLOW-UP SYSTEM (NEW)
  // ============================================================

  async loadTruckDbCache() {
    try {
      const res = await fetch(`${FLEET_CONFIG.API.baseUrl}/api/trucks/db`, { headers: { 'x-access-code': this.currentCode } });
      if (res.ok) this.truckDbCache = await res.json();
    } catch (e) { console.warn('Failed to load truck DB cache:', e.message); }
  }

  async refreshMaintenanceFollowup() {
    await this.loadTruckDbCache();
    await this.loadActiveMaintenanceOrders();
    // Load recent completed vidanges to power smart "already done" logic
    try {
      const rv = await fetch(`${FLEET_CONFIG.API.baseUrl}/api/maintenance-entries?status=termine&limit=1000`);
      if (rv.ok) {
        const entries = await rv.json();
        // Build map: deviceId -> lastVidangeKm
        this._lastVidangeMap = {};
        (entries.items || entries).forEach(e => {
          const did = String(e.deviceId || e.truckId || '');
          if (!did) return;
          const km = Number(e.odometer || e.odometerKm || 0);
          if (!this._lastVidangeMap[did] || km > this._lastVidangeMap[did]) {
            this._lastVidangeMap[did] = km;
          }
        });
      }
    } catch(_) { this._lastVidangeMap = this._lastVidangeMap || {}; }
    this.renderActiveOrdersDashboard();
  }

  // Keep old name as alias for backward compat
  runVidangeRescan() { this.openVidangeScanModal(); }

  openVidangeScanModal() {
    // Remove existing modal if any
    const existing = document.getElementById('vidangeScanModal');
    if (existing) existing.remove();

    // Compute default date range: last 30 days
    const now = new Date();
    const toStr = now.toISOString().slice(0,10);
    const from30 = new Date(now - 30*24*3600*1000);
    const fromStr = from30.toISOString().slice(0,10);

    const modal = document.createElement('div');
    modal.id = 'vidangeScanModal';
    modal.style.cssText = 'position:fixed;inset:0;z-index:77777;background:rgba(15,23,42,0.65);backdrop-filter:blur(4px);display:flex;align-items:flex-start;justify-content:center;padding-top:60px;overflow-y:auto;';
    modal.innerHTML = `
      <div style="background:var(--bg-card,#fff);border-radius:18px;box-shadow:0 32px 100px rgba(0,0,0,0.35);width:100%;max-width:760px;border:1.5px solid var(--border,#e2e8f0);margin-bottom:40px;">

        <!-- Header -->
        <div style="display:flex;align-items:center;gap:12px;padding:20px 24px;border-bottom:1px solid var(--border,#e2e8f0);">
          <div style="width:42px;height:42px;border-radius:12px;background:linear-gradient(135deg,#0284c7,#4f46e5);display:flex;align-items:center;justify-content:center;flex-shrink:0;">
            <i class="fa-solid fa-magnifying-glass-chart" style="color:#fff;font-size:18px;"></i>
          </div>
          <div>
            <div style="font-size:16px;font-weight:900;color:var(--text-primary,#1e293b);">Scanner GPS — Vidange Complète</div>
            <div style="font-size:12px;color:var(--text-muted,#94a3b8);">Analyse complète de la flotte avec recalcul des prochaines échéances</div>
          </div>
          <button onclick="document.getElementById('vidangeScanModal').remove()" style="margin-left:auto;background:none;border:none;font-size:20px;color:var(--text-muted,#94a3b8);cursor:pointer;padding:4px 8px;border-radius:8px;" onmouseover="this.style.background='#fee2e2';this.style.color='#ef4444'" onmouseout="this.style.background='none';this.style.color=''">✕</button>
        </div>

        <!-- Config Zone -->
        <div style="padding:20px 24px;" id="vidangeScanConfig">

          <!-- Period -->
          <div style="margin-bottom:18px;">
            <div style="font-size:12px;font-weight:700;color:var(--text-secondary,#374151);text-transform:uppercase;letter-spacing:1px;margin-bottom:8px;"><i class="fa-solid fa-calendar-days" style="color:#0284c7;margin-right:6px;"></i>Période d'analyse</div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
              <div>
                <label style="font-size:11px;color:#94a3b8;font-weight:600;">Du</label>
                <input type="date" id="vscanFrom" value="${fromStr}" style="width:100%;padding:10px;border:1.5px solid #e2e8f0;border-radius:10px;font-size:13px;color:#1e293b;background:var(--bg-elevated,#f8fafc);box-sizing:border-box;margin-top:4px;">
              </div>
              <div>
                <label style="font-size:11px;color:#94a3b8;font-weight:600;">Au</label>
                <input type="date" id="vscanTo" value="${toStr}" style="width:100%;padding:10px;border:1.5px solid #e2e8f0;border-radius:10px;font-size:13px;color:#1e293b;background:var(--bg-elevated,#f8fafc);box-sizing:border-box;margin-top:4px;">
              </div>
            </div>
            <div style="display:flex;gap:6px;margin-top:8px;">
              ${['7j','30j','90j','1an'].map((l,i) => {
                const days = [7,30,90,365][i];
                return `<button onclick="var d=new Date(Date.now()-${days}*86400000);document.getElementById('vscanFrom').value=d.toISOString().slice(0,10);" style="padding:4px 10px;border:1.5px solid #e2e8f0;border-radius:16px;font-size:11px;font-weight:700;background:#fff;color:#64748b;cursor:pointer;" onmouseover="this.style.borderColor='#0284c7';this.style.color='#0284c7'" onmouseout="this.style.borderColor='#e2e8f0';this.style.color='#64748b'">Derniers ${l}</button>`;
              }).join('')}
            </div>
          </div>

          <!-- Options -->
          <div style="margin-bottom:18px;background:var(--bg-elevated,#f8fafc);border:1px solid #e2e8f0;border-radius:12px;padding:14px;">
            <div style="font-size:12px;font-weight:700;color:#374151;text-transform:uppercase;letter-spacing:1px;margin-bottom:10px;"><i class="fa-solid fa-sliders" style="color:#7c3aed;margin-right:6px;"></i>Options de scan</div>
            <label style="display:flex;align-items:center;gap:10px;cursor:pointer;margin-bottom:8px;">
              <input type="checkbox" id="vscanAutoCreate" checked style="width:16px;height:16px;accent-color:#0284c7;">
              <span style="font-size:13px;color:var(--text,#374151);font-weight:600;">✅ Mettre à jour les compteurs vidange depuis le GPS <span style="font-size:10px;color:var(--text-muted,#94a3b8);display:block;margin-top:2px;">Recalcule automatiquement les prochaines dates de vidange pour chaque camion</span></span>
            </label>
            <label style="display:flex;align-items:center;gap:10px;cursor:pointer;margin-bottom:8px;">
              <input type="checkbox" id="vscanShowAll" style="width:16px;height:16px;accent-color:#0284c7;">
              <span style="font-size:13px;color:var(--text,#374151);font-weight:600;">⚠️ Montrer seulement les camions en retard ou bientôt <span style="font-size:10px;color:var(--text-muted,#94a3b8);display:block;margin-top:2px;">Cache les camions qui sont OK, garde seulement ceux qui ont besoin d'une vidange</span></span>
            </label>
            <label style="display:flex;align-items:center;gap:10px;cursor:pointer;">
              <input type="checkbox" id="vscanIncludeNoOdo" style="width:16px;height:16px;accent-color:#0284c7;">
              <span style="font-size:13px;color:var(--text,#374151);font-weight:600;">📡 Inclure camions sans compteur km <span style="font-size:10px;color:var(--text-muted,#94a3b8);display:block;margin-top:2px;">Certains camions n'ont pas de GPS qui envoie les km, cocher pour les voir quand même</span></span>
            </label>
          </div>

          <!-- Truck filter -->
          <div style="margin-bottom:20px;">
            <div style="font-size:12px;font-weight:700;color:#374151;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px;"><i class="fa-solid fa-truck" style="color:#f59e0b;margin-right:6px;"></i>Camions à analyser</div>
            <div style="display:flex;gap:8px;">
              <button onclick="document.getElementById('vscanTruckFilter').value='all';this.style.background='#0284c7';this.style.color='#fff';document.querySelectorAll('.vscan-truck-btn').forEach(b=>b!==this&&(b.style.background='#fff',b.style.color='#64748b'))" class="vscan-truck-btn" style="padding:7px 16px;border:1.5px solid #e2e8f0;border-radius:20px;font-size:12px;font-weight:700;background:#0284c7;color:#fff;cursor:pointer;">🚛 Toute la flotte</button>
              <button onclick="document.getElementById('vscanTruckFilter').value='alert';this.style.background='#0284c7';this.style.color='#fff';document.querySelectorAll('.vscan-truck-btn').forEach(b=>b!==this&&(b.style.background='#fff',b.style.color='#64748b'))" class="vscan-truck-btn" style="padding:7px 16px;border:1.5px solid #e2e8f0;border-radius:20px;font-size:12px;font-weight:700;background:#fff;color:#64748b;cursor:pointer;">⚠️ En alerte seulement</button>
            </div>
            <input type="hidden" id="vscanTruckFilter" value="all">
          </div>

          <!-- Action button -->
          <button id="vscanRunBtn" onclick="ui._executeVidangeScan()" style="width:100%;padding:14px;background:linear-gradient(135deg,#0284c7,#4f46e5);color:#fff;border:none;border-radius:12px;font-size:14px;font-weight:800;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:10px;box-shadow:0 6px 20px rgba(2,132,199,0.3);">
            <i class="fa-solid fa-satellite-dish"></i> Lancer le Scan GPS Complet
          </button>
        </div>

        <!-- Progress Zone (hidden initially) -->
        <div id="vidangeScanProgress" style="display:none;padding:20px 24px;">
          <div style="text-align:center;margin-bottom:16px;">
            <div style="font-size:14px;font-weight:700;color:#374151;" id="vscanProgressLabel">Scan en cours...</div>
            <div style="font-size:12px;color:#94a3b8;margin-top:4px;" id="vscanProgressSub">Connexion au serveur GPS...</div>
          </div>
          <div style="background:#f1f5f9;border-radius:20px;height:12px;overflow:hidden;margin-bottom:12px;">
            <div id="vscanProgressBar" style="height:100%;width:0%;background:linear-gradient(90deg,#0284c7,#7c3aed);border-radius:20px;transition:width 0.4s ease;"></div>
          </div>
          <div id="vscanProgressStats" style="display:flex;justify-content:center;gap:20px;font-size:12px;color:#64748b;"></div>
        </div>

        <!-- Results Zone (hidden initially) -->
        <div id="vidangeScanResults" style="display:none;padding:0 24px 24px;">
          <div id="vscanResultsSummary" style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:16px;padding:14px;background:#f8fafc;border-radius:12px;"></div>

          <!-- Search/Filter bar for results -->
          <div style="display:flex;gap:8px;align-items:center;margin-bottom:12px;flex-wrap:wrap;">
            <input type="text" id="vscanResultSearch" placeholder="🔍 Filtrer par camion..." oninput="ui._filterVidangeScanResults(this.value)" style="flex:1;min-width:160px;padding:8px 14px;border:1.5px solid #e2e8f0;border-radius:20px;font-size:12px;outline:none;">
            <div style="display:flex;gap:4px;" id="vscanStatusBtns">
              <button onclick="ui._filterVidangeScanByStatus('all',this)" class="vscan-status-btn" style="padding:6px 12px;border:1.5px solid #0284c7;border-radius:16px;font-size:11px;font-weight:700;background:#0284c7;color:#fff;cursor:pointer;">Tous</button>
              <button onclick="ui._filterVidangeScanByStatus('overdue',this)" class="vscan-status-btn" style="padding:6px 12px;border:1.5px solid #ef4444;border-radius:16px;font-size:11px;font-weight:700;background:#fff;color:#ef4444;cursor:pointer;">🔴 En retard</button>
              <button onclick="ui._filterVidangeScanByStatus('alert',this)" class="vscan-status-btn" style="padding:6px 12px;border:1.5px solid #f59e0b;border-radius:16px;font-size:11px;font-weight:700;background:#fff;color:#f59e0b;cursor:pointer;">🟡 Alerte</button>
              <button onclick="ui._filterVidangeScanByStatus('ok',this)" class="vscan-status-btn" style="padding:6px 12px;border:1.5px solid #16a34a;border-radius:16px;font-size:11px;font-weight:700;background:#fff;color:#16a34a;cursor:pointer;">✅ OK</button>
            </div>
            <button onclick="ui._sortVidangeScanResults()" id="vscanSortBtn" style="padding:6px 12px;border:1.5px solid #e2e8f0;border-radius:16px;font-size:11px;font-weight:700;background:#fff;color:#64748b;cursor:pointer;">Trier ⇅</button>
          </div>

          <!-- Table -->
          <div id="vscanTable" style="border:1.5px solid #e2e8f0;border-radius:12px;overflow:hidden;overflow-x:auto;">
            <table style="width:100%;border-collapse:collapse;font-size:13px;min-width:600px;">
              <thead>
                <tr style="background:#f8fafc;">
                  <th style="padding:10px 12px;text-align:left;color:#64748b;font-weight:700;">Camion</th>
                  <th style="padding:10px 12px;text-align:left;color:#64748b;font-weight:700;">Zone Maintenance</th>
                  <th style="padding:10px 12px;text-align:left;color:#64748b;font-weight:700;">Date & Durée</th>
                  <th style="padding:10px 12px;text-align:left;color:#64748b;font-weight:700;">Type Détecté</th>
                  <th style="padding:10px 12px;text-align:left;color:#64748b;font-weight:700;">Compteur Km</th>
                  <th style="padding:10px 12px;text-align:left;color:#64748b;font-weight:700;">Statut</th>
                  <th style="padding:10px 12px;text-align:center;color:#64748b;font-weight:700;">Action</th>
                </tr>
              </thead>
              <tbody id="vscanTableBody"></tbody>
            </table>
          </div>
        </div>

      </div>`;

    document.body.appendChild(modal);
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
    // Store scan data for filtering/sorting
    this._vscanData = [];
    this._vscanSortField = 'status';
    this._vscanSortDir = 'asc';
    this._vscanStatusFilter = 'all';
  }

  async _executeVidangeScan() {
    const btn = document.getElementById('vscanRunBtn');
    const configEl = document.getElementById('vidangeScanConfig');
    const progressEl = document.getElementById('vidangeScanProgress');
    const resultsEl = document.getElementById('vidangeScanResults');

    if (btn) btn.disabled = true;

    // Show progress
    if (configEl) configEl.style.display = 'none';
    if (progressEl) progressEl.style.display = 'block';

    const setProgress = (pct, label, sub) => {
      const bar = document.getElementById('vscanProgressBar');
      const lbl = document.getElementById('vscanProgressLabel');
      const slbl = document.getElementById('vscanProgressSub');
      if (bar) bar.style.width = pct + '%';
      if (lbl) lbl.textContent = label;
      if (slbl) slbl.textContent = sub;
    };

    try {
      setProgress(15, 'Connexion au serveur...', 'Recherche des zones de maintenance...');
      await new Promise(r => setTimeout(r, 250));

      const from = document.getElementById('vscanFrom')?.value || '';
      const to   = document.getElementById('vscanTo')?.value   || '';
      const filter = document.getElementById('vscanTruckFilter')?.value || 'all';
      const autoCreate = document.getElementById('vscanAutoCreate')?.checked || false;

      setProgress(40, 'Analyse des passages en zone maintenance...', 'Détection des entrées/sorties GPS des camions...');
      await new Promise(r => setTimeout(r, 300));

      const code = localStorage.getItem('fleetAccessCode') || this.currentCode || '12345';
      const r = await fetch(`${FLEET_CONFIG.API.baseUrl}/api/maintenance/rescan-vidange`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-access-code': code },
        body: JSON.stringify({ from, to, filter, autoCreate })
      });

      setProgress(75, 'Application des règles d’entretien...', 'Corrélation avec l’historique des vidanges et réparations...');
      await new Promise(r => setTimeout(r, 250));

      if (!r.ok) throw new Error('HTTP ' + r.status);
      const data = await r.json();
      let results = data.results || [];

      // Filter "unrecorded only" if checked
      const showAttentionOnly = document.getElementById('vscanShowAll')?.checked;
      if (showAttentionOnly) {
        results = results.filter(x => !x.isRecorded || x.detectedType === 'Vidange');
      }

      setProgress(100, 'Analyse terminée !', `${results.length} passage(s) en atelier analysé(s).`);
      await new Promise(r => setTimeout(r, 300));

      this._vscanData = results;

      const vidanges = results.filter(x => x.detectedType === 'Vidange');
      const maintGen = results.filter(x => x.detectedType === 'Maintenance Générale');
      const unrec    = results.filter(x => !x.isRecorded);
      const recorded = results.filter(x => x.isRecorded);

      const statsEl = document.getElementById('vscanProgressStats');
      if (statsEl) statsEl.innerHTML = `
        <span style="color:#ef4444;font-weight:700;"><i class="fa-solid fa-oil-can"></i> ${vidanges.length} Vidange(s)</span>
        <span style="color:#0284c7;font-weight:700;"><i class="fa-solid fa-wrench"></i> ${maintGen.length} Maintenance Générale</span>
        <span style="color:#f59e0b;font-weight:700;"><i class="fa-solid fa-triangle-exclamation"></i> ${unrec.length} À Enregistrer</span>
        <span style="color:#16a34a;font-weight:700;"><i class="fa-solid fa-check-circle"></i> ${recorded.length} Enregistré(s)</span>`;

      // Show results
      if (progressEl) progressEl.style.paddingBottom = '0';
      if (resultsEl) resultsEl.style.display = 'block';

      const summaryEl = document.getElementById('vscanResultsSummary');
      if (summaryEl) summaryEl.innerHTML = `
        <div style="flex:1;min-width:110px;background:#fee2e2;border-radius:10px;padding:10px 14px;text-align:center;">
          <div style="font-size:24px;font-weight:900;color:#ef4444;">${vidanges.length}</div>
          <div style="font-size:11px;font-weight:700;color:#dc2626;">🛢️ VIDANGES</div>
        </div>
        <div style="flex:1;min-width:110px;background:#e0f2fe;border-radius:10px;padding:10px 14px;text-align:center;">
          <div style="font-size:24px;font-weight:900;color:#0284c7;">${maintGen.length}</div>
          <div style="font-size:11px;font-weight:700;color:#0369a1;">🔧 MAINT. GÉNÉRALE</div>
        </div>
        <div style="flex:1;min-width:110px;background:#fef3c7;border-radius:10px;padding:10px 14px;text-align:center;">
          <div style="font-size:24px;font-weight:900;color:#d97706;">${unrec.length}</div>
          <div style="font-size:11px;font-weight:700;color:#b45309;">⚠️ NON ENREGISTRÉ</div>
        </div>
        <div style="flex:1;min-width:110px;background:#dcfce7;border-radius:10px;padding:10px 14px;text-align:center;">
          <div style="font-size:24px;font-weight:900;color:#16a34a;">${recorded.length}</div>
          <div style="font-size:11px;font-weight:700;color:#15803d;">✅ DÉJÀ VALIDÉ</div>
        </div>`;

      this._renderVidangeScanTable(results);

    } catch(e) {
      setProgress(0, 'Erreur', e.message);
      if (progressEl) progressEl.innerHTML += `<div style="background:#fee2e2;border-radius:10px;padding:12px;text-align:center;color:#ef4444;font-size:13px;margin-top:12px;"><i class="fa-solid fa-exclamation-circle"></i> Erreur: ${e.message}<br><button onclick="document.getElementById('vidangeScanModal').remove()" style="margin-top:8px;padding:6px 16px;background:#ef4444;color:#fff;border:none;border-radius:8px;cursor:pointer;">Fermer</button></div>`;
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  _renderVidangeScanTable(data) {
    const tbody = document.getElementById('vscanTableBody');
    if (!tbody) return;
    if (!data.length) {
      tbody.innerHTML = '<tr><td colspan="7" style="padding:24px;text-align:center;color:#94a3b8;">Aucun passage en zone de maintenance détecté pour cette période.</td></tr>';
      return;
    }
    tbody.innerHTML = data.map(x => {
      const isVidange = x.detectedType === 'Vidange';
      const typeColor = isVidange ? '#ea580c' : '#0284c7';
      const typeBg = isVidange ? '#ffedd5' : '#e0f2fe';
      const typeBadge = `<span style="background:${typeBg};color:${typeColor};border-radius:8px;padding:3px 10px;font-size:11px;font-weight:800;display:inline-flex;align-items:center;gap:4px;">${isVidange ? '🛢️ Vidange' : '🔧 Maint. Générale'}</span>`;

      const dateStr = x.entryTime ? new Date(x.entryTime).toLocaleDateString('fr-DZ', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' }) : 'N/D';
      const durStr = x.durationMinutes ? `${Math.floor(x.durationMinutes/60)}h ${x.durationMinutes%60}m` : 'En cours';

      const statusBadge = x.isRecorded 
        ? `<span style="background:#dcfce7;color:#16a34a;border-radius:8px;padding:3px 8px;font-size:11px;font-weight:700;"><i class="fa-solid fa-check"></i> Enregistré</span>`
        : `<span style="background:#fef3c7;color:#d97706;border-radius:8px;padding:3px 8px;font-size:11px;font-weight:700;"><i class="fa-solid fa-triangle-exclamation"></i> Détecté</span>`;

      const km = x.odometerKm ? x.odometerKm.toLocaleString('fr-DZ') + ' km' : '<span style="color:#94a3b8;">N/D</span>';

      const actionBtn = x.isRecorded
        ? `<span style="font-size:11px;color:#16a34a;font-weight:700;"><i class="fa-solid fa-circle-check"></i> Historique OK</span>`
        : `<button onclick="ui.quickRegisterMaint('${x.deviceId}','${x.truckName}','${x.detectedType}','${(x.zoneName||'').replace(/'/g,"\'")}',${x.entryTime},${x.odometerKm})" style="padding:5px 12px;background:linear-gradient(135deg,#16a34a,#059669);color:#fff;border:none;border-radius:8px;font-size:11px;font-weight:700;cursor:pointer;white-space:nowrap;display:inline-flex;align-items:center;gap:4px;"><i class="fa-solid fa-plus"></i> Enregistrer</button>`;

      return `<tr style="border-bottom:1px solid #f1f5f9;" data-truck="${(x.truckName||'').toLowerCase()}" data-type="${isVidange ? 'vidange' : 'maint'}" data-status="${x.isRecorded ? 'recorded' : 'unrecorded'}">
        <td style="padding:10px 12px;font-weight:700;color:#1e293b;">${x.truckName}</td>
        <td style="padding:10px 12px;color:#475569;font-size:12px;font-weight:600;"><i class="fa-solid fa-location-dot" style="color:#6366f1;margin-right:4px;"></i>${x.zoneName || 'Atelier'}</td>
        <td style="padding:10px 12px;color:#64748b;font-size:12px;">${dateStr}<br><span style="font-size:10px;color:#94a3b8;"><i class="fa-regular fa-clock"></i> Durée: ${durStr}</span></td>
        <td style="padding:10px 12px;">${typeBadge}</td>
        <td style="padding:10px 12px;color:#334155;font-size:12px;font-weight:600;">${km}</td>
        <td style="padding:10px 12px;">${statusBadge}</td>
        <td style="padding:10px 12px;text-align:center;">${actionBtn}</td>
      </tr>`;
    }).join('');
  }

  async quickRegisterMaint(deviceId, truckName, type, location, timestamp, odometer) {
    if (!confirm(`Enregistrer ce passage comme "${type}" pour ${truckName} (${location}) ?`)) return;
    try {
      const code = localStorage.getItem('fleetAccessCode') || this.currentCode || '12345';
      const res = await fetch(`${FLEET_CONFIG.API.baseUrl}/api/maintenance/add`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-access-code': code },
        body: JSON.stringify({
          truckName,
          deviceId,
          type,
          location,
          odometer: parseInt(odometer, 10) || 0,
          date: new Date(timestamp),
          status: 'termine',
          isAuto: true,
          note: `Enregistré via Scan GPS (${location})`
        })
      });
      if (!res.ok) throw new Error('Erreur HTTP ' + res.status);
      if (typeof window.showToast === 'function') window.showToast(`✅ ${type} enregistrée pour ${truckName} !`, 'success');
      // Re-run scan to update UI
      this._executeVidangeScan();
      if (typeof this.fetchAndRenderMaintenance === 'function') this.fetchAndRenderMaintenance();
    } catch(err) {
      alert('Erreur lors de l’enregistrement: ' + err.message);
    }
  }

  _sortVidangeScanResults(field) {
    if (!field) field = this._vscanSortField || 'status';
    if (field === this._vscanSortField) {
      this._vscanSortDir = this._vscanSortDir === 'asc' ? 'desc' : 'asc';
    } else {
      this._vscanSortField = field;
      this._vscanSortDir = 'asc';
    }
    const sorted = [...this._vscanData].sort((a, b) => {
      let va, vb;
      if (field === 'name')      { va=(a.truckName||'').toLowerCase();  vb=(b.truckName||'').toLowerCase(); }
      else if (field === 'km')   { va=a.odometerKm||0;                  vb=b.odometerKm||0; }
      else if (field === 'next') { va=a.nextVidangeKm||0;               vb=b.nextVidangeKm||0; }
      else if (field === 'remaining'){ va=a.kmUntilNext||0;             vb=b.kmUntilNext||0; }
      else { // status
        const rank = { overdue:0, alert:1, ok:2 };
        va = rank[a.isOverdue?'overdue':a.isAlert?'alert':'ok']??2;
        vb = rank[b.isOverdue?'overdue':b.isAlert?'alert':'ok']??2;
      }
      return this._vscanSortDir === 'asc' ? (va<vb?-1:va>vb?1:0) : (va>vb?-1:va<vb?1:0);
    });
    this._renderVidangeScanTable(sorted);
    const sortBtn = document.getElementById('vscanSortBtn');
    if (sortBtn) sortBtn.textContent = `Trier ${this._vscanSortDir==='asc'?'↑':'↓'}`;
  }



  async loadActiveMaintenanceOrders() {
    try {
      const res = await fetch(`${FLEET_CONFIG.API.baseUrl}/api/maintenance/active`);
      if (res.ok) {
        this.activeMaintenanceOrders = await res.json();
        if (this.activeOrderCount) this.activeOrderCount.textContent = this.activeMaintenanceOrders.length;
      }
    } catch (e) { console.warn('Failed to load active orders:', e.message); }
  }

  handleMaintTruckSearch(query) {
    const q = (query || '').trim().toLowerCase();
    if (q.length < 1) { this.maintTruckSearchResults.classList.remove('show'); return; }

    // Search from GPS trucks + DB metadata
    const gpsTrucks = app.getAllTrucks();
    const results = gpsTrucks.filter(t => {
      const nameMatch = t.name.toLowerCase().includes(q);
      const dbEntry = this.truckDbCache.find(d => d.deviceId === t.id);
      const immMatch = dbEntry && dbEntry.immatriculation && dbEntry.immatriculation.toLowerCase().includes(q);
      const chassisMatch = dbEntry && dbEntry.chassisNumber && dbEntry.chassisNumber.toLowerCase().includes(q);
      const naftalMatch = dbEntry && dbEntry.carteNaftal && dbEntry.carteNaftal.toLowerCase().includes(q);
      return nameMatch || immMatch || chassisMatch || naftalMatch;
    }).slice(0, 10);

    if (results.length === 0) {
      this.maintTruckSearchResults.innerHTML = '<div style="padding:12px; color:var(--text-muted, #94a3b8); text-align:center; font-size:12px;">Aucun résultat</div>';
      this.maintTruckSearchResults.classList.add('show');
      return;
    }

    let html = '';
    results.forEach(t => {
      const db = this.truckDbCache.find(d => d.deviceId === t.id) || {};
      const tags = [];
      if (db.immatriculation) tags.push(`<span class="truck-meta-tag imm"><i class="fa-solid fa-id-badge"></i> ${db.immatriculation}</span>`);
      if (db.chassisNumber) tags.push(`<span class="truck-meta-tag chassis"><i class="fa-solid fa-hashtag"></i> ${db.chassisNumber}</span>`);
      html += `
        <div class="maint-search-item" onclick="ui.selectMaintTruck('${t.id}')">
          <div>
            <div style="font-weight:700; color:var(--bg-surface, #0f172a);">${t.name}</div>
            <div style="display:flex; gap:4px; margin-top:3px; flex-wrap:wrap;">${tags.join('')}</div>
          </div>
          <div style="text-align:right;">
            <div style="font-size:11px; color:var(--text-muted, #64748b);">${t.odometer.toLocaleString()} km</div>
            <div style="font-size:10px; color:${t.speed > 0 ? '#16a34a' : 'var(--text-muted, #94a3b8)'};">${t.speed > 0 ? '🟢 En route' : '🔴 Arrêt'}</div>
          </div>
        </div>`;
    });
    this.maintTruckSearchResults.innerHTML = html;
    this.maintTruckSearchResults.classList.add('show');
  }

  selectMaintTruck(truckId) {
    this.selectedMaintTruckId = truckId;
    this.maintTruckSearchResults.classList.remove('show');
    const truck = app.trucks.get(truckId);
    if (!truck) return;
    this.maintTruckSearchInput.value = truck.name;
    this.renderTruckInfoPanel(truckId);
    this.showTruckMetaEditor(truckId);
  }

  renderTruckInfoPanel(truckId) {
    const truck = app.trucks.get(truckId);
    if (!truck || !this.maintTruckInfoPanel) return;
    const db = this.truckDbCache.find(d => String(d.deviceId) === String(truckId)) || {};

    const _mtpBtn = this.maintTruckInfoPanel.querySelector('.mtp-open-btn');
        if (_mtpBtn) { _mtpBtn.onclick = (function(el){ return function(){ ui.openNewMaintenanceOrder(el.dataset.truckId); }; })(_mtpBtn); }
        this.maintTruckInfoPanel.style.display = 'block';
    this.maintTruckInfoPanel.innerHTML = `
      <div class="truck-info-panel">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
          <h3 style="margin:0; color:#f59e0b;"><i class="fa-solid fa-truck"></i> ${truck.name}</h3>
          <div style="display:flex; gap:6px;">
            <button class="btn-primary" class="mtp-open-btn" data-truck-id="${truckId}" style="background:#f59e0b; border:none; font-size:12px; padding:6px 12px;">
              <i class="fa-solid fa-plus"></i> Créer Ordre
            </button>
          </div>
        </div>
        <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap:8px;">
          <div class="truck-info-row"><span class="truck-info-label"><i class="fa-solid fa-road"></i> Compteur</span><span class="truck-info-value">${truck.odometer.toLocaleString()} km</span></div>
          <div class="truck-info-row"><span class="truck-info-label"><i class="fa-solid fa-gas-pump"></i> Carburant</span><span class="truck-info-value">${truck.fuelLiters} L (${truck.fuelPercentage}%)</span></div>
          <div class="truck-info-row"><span class="truck-info-label"><i class="fa-solid fa-location-dot"></i> Position</span><span class="truck-info-value">${truck.location.city || 'Inconnue'}</span></div>
          <div class="truck-info-row"><span class="truck-info-label"><i class="fa-solid fa-hashtag"></i> Châssis</span><span class="truck-info-value">${db.chassisNumber || '<em style="color:var(--text-muted, #94a3b8);">Non renseigné</em>'}</span></div>
          <div class="truck-info-row"><span class="truck-info-label"><i class="fa-solid fa-id-badge"></i> Immatriculation</span><span class="truck-info-value">${db.immatriculation || '<em style="color:var(--text-muted, #94a3b8);">Non renseigné</em>'}</span></div>
          <div class="truck-info-row"><span class="truck-info-label"><i class="fa-solid fa-credit-card"></i> Carte Naftal</span><span class="truck-info-value">${db.carteNaftal || '<em style="color:var(--text-muted, #94a3b8);">Non renseigné</em>'}</span></div>
          <div class="truck-info-row"><span class="truck-info-label"><i class="fa-solid fa-trailer"></i> Remorque</span><span class="truck-info-value">${db.trailer ? `<span class="truck-meta-tag trailer">${db.trailer}</span>` : '<em style="color:var(--text-muted, #94a3b8);">Non assignée</em>'}</span></div>
          <div class="truck-info-row"><span class="truck-info-label"><i class="fa-solid fa-user"></i> Chauffeur</span><span class="truck-info-value">${db.driverName ? `<span class="truck-meta-tag driver">${db.driverName}</span> ${db.driverPhone ? '· ' + db.driverPhone : ''}` : '<em style="color:var(--text-muted, #94a3b8);">Non assigné</em>'}</span></div>
          <div class="truck-info-row"><span class="truck-info-label"><i class="fa-solid fa-oil-can"></i> Vidange</span><span class="truck-info-value" style="color:${truck.vidange.alert ? '#ef4444' : '#22c55e'};">${truck.vidange.alert ? '\u26a0\ufe0f ' + truck.vidange.kmUntilNext + ' km' : '\u2705 OK (' + truck.vidange.kmUntilNext + ' km)'}</span></div>
          <div class="truck-info-row"><span class="truck-info-label"><i class="fa-solid fa-signal"></i> Vitesse</span><span class="truck-info-value">${truck.speed} km/h</span></div>
        </div>
      </div>`;
  }

  showTruckMetaEditor(truckId) {
    if (!this.truckMetaEditor) return;
    const db = this.truckDbCache.find(d => d.deviceId === truckId) || {};
    this.truckMetaEditor.style.display = 'block';
    document.getElementById('editChassisNumber').value = db.chassisNumber || '';
    document.getElementById('editImmatriculation').value = db.immatriculation || '';
    document.getElementById('editCarteNaftal').value = db.carteNaftal || '';
    if (document.getElementById('editTrailer')) document.getElementById('editTrailer').value = db.trailer || '';
    if (document.getElementById('editDriverName')) document.getElementById('editDriverName').value = db.driverName || '';
    if (document.getElementById('editDriverPhone')) document.getElementById('editDriverPhone').value = db.driverPhone || '';
  }

  async saveTruckMetadata() {
    if (!this.selectedMaintTruckId) { alert('Sélectionnez d\'abord un camion.'); return; }
    const truck = app.trucks.get(this.selectedMaintTruckId);
    const payload = {
      deviceId: this.selectedMaintTruckId,
      truckName: truck ? truck.name : this.maintTruckSearchInput?.value || '',
      chassisNumber: document.getElementById('editChassisNumber').value.trim(),
      immatriculation: document.getElementById('editImmatriculation').value.trim(),
      carteNaftal: document.getElementById('editCarteNaftal').value.trim(),
      trailer: document.getElementById('editTrailer') ? document.getElementById('editTrailer').value.trim() : '',
      driverName: document.getElementById('editDriverName') ? document.getElementById('editDriverName').value.trim() : '',
      driverPhone: document.getElementById('editDriverPhone') ? document.getElementById('editDriverPhone').value.trim() : ''
    };
    try {
      const res = await fetch(`${FLEET_CONFIG.API.baseUrl}/api/trucks/update-info`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        alert('\u2705 Fiche véhicule sauvegardée !');
        await this.loadTruckDbCache();
        this.renderTruckInfoPanel(this.selectedMaintTruckId);
      } else { alert('Erreur serveur.'); }
    } catch (e) { alert('Erreur connexion.'); }
  }


  // ── Maintenance sort/filter helpers ─────────────────────────
  sortMaintTable(field) {
    if (this._maintSortField === field) {
      this._maintSortDir = this._maintSortDir === 'asc' ? 'desc' : 'asc';
    } else {
      this._maintSortField = field;
      this._maintSortDir = 'asc';
    }
    this.renderActiveOrdersDashboard();
  }



  handleHeaderSearch(q) {
    const dd = document.getElementById('headerSearchDropdown');
    const count = document.getElementById('headerSearchCount');
    const clearBtn = document.getElementById('headerSearchClear');
    q = (q || '').trim().toLowerCase();

    if (!q) {
      if (dd) dd.style.display = 'none';
      if (count) count.style.display = 'none';
      if (clearBtn) clearBtn.style.display = 'none';
      // Also clear dashboard filter
      this.searchQuery = '';
      this.updateDashboard();
      return;
    }

    if (clearBtn) clearBtn.style.display = 'inline';

    const trucks = (window.app && typeof window.app.getAllTrucks === 'function') ? window.app.getAllTrucks() : [];
    const dbCache = this.truckDbCache || [];
    const results = trucks.filter(t => {
      const db = dbCache.find(d => String(d.deviceId) === String(t.id || t.deviceId)) || {};
      return (t.name||'').toLowerCase().indexOf(q) !== -1
          || (db.immatriculation||'').toLowerCase().indexOf(q) !== -1
          || (db.carteNaftal||'').toLowerCase().indexOf(q) !== -1
          || (db.chassisNumber||'').toLowerCase().indexOf(q) !== -1;
    }).slice(0, 10);

    if (count) {
      count.style.display = results.length ? 'inline' : 'none';
      count.textContent = results.length;
    }

    // Also filter the main dashboard
    this.searchQuery = q;
    if (document.querySelector('.tab-content.active')?.id === 'dashboard') {
      this.renderTrucks();
    }

    if (!dd) return;
    if (!results.length) {
      dd.style.display = 'block';
      dd.innerHTML = '<div style="padding:16px;text-align:center;color:#94a3b8;font-size:12px;">Aucun résultat pour "' + q + '"</div>';
      return;
    }

    dd.style.display = 'block';
    dd.innerHTML = '';
    results.forEach(t => {
      const db = dbCache.find(d => String(d.deviceId) === String(t.id || t.deviceId)) || {};
      const fp = Math.round(t.fuelPercentage || 0);
      const fc = fp <= 10 ? '#ef4444' : fp <= 25 ? '#f59e0b' : '#16a34a';
      const row = document.createElement('div');
      row.style.cssText = 'padding:10px 14px;cursor:pointer;display:flex;align-items:center;gap:12px;border-bottom:1px solid #f1f5f9;';
      row.innerHTML =
        '<div style="width:32px;height:32px;border-radius:8px;background:' + fc + '20;display:flex;align-items:center;justify-content:center;flex-shrink:0;">' +
        '<i class="fa-solid fa-truck" style="color:' + fc + ';font-size:12px;"></i></div>' +
        '<div style="flex:1;min-width:0;">' +
          '<div style="font-weight:700;color:var(--text-primary,#1e293b);font-size:13px;">' + t.name + '</div>' +
          '<div style="font-size:11px;color:#94a3b8;">' + (db.immatriculation||'') + (db.carteNaftal?' · '+db.carteNaftal:'') + '</div>' +
        '</div>' +
        '<span style="font-size:13px;font-weight:900;color:' + fc + ';">' + fp + '%</span>';
      const lat = (t.coordinates && t.coordinates.lat) ? t.coordinates.lat : 0;
      const lng = (t.coordinates && t.coordinates.lng) ? t.coordinates.lng : 0;
      row.onmouseover = function() { this.style.background='var(--bg-elevated,#f8fafc)'; };
      row.onmouseout  = function() { this.style.background=''; };
      row.onclick = (function(la,lo,nm){ return function(){
        document.getElementById('headerSearchInput').blur();
        document.getElementById('headerSearchDropdown').style.display='none';
        if(window.ui && window.ui.viewOnMap) window.ui.viewOnMap(la,lo);
      }; })(lat, lng, t.name);
      dd.appendChild(row);
    });
  }

  setDashSort(field) {
    if (this._dashSortField === field) {
      this._dashSortDir = this._dashSortDir === 'asc' ? 'desc' : 'asc';
    } else {
      this._dashSortField = field;
      this._dashSortDir = 'asc';
    }
    localStorage.setItem('dash_sort_field', this._dashSortField);
    localStorage.setItem('dash_sort_dir',   this._dashSortDir);
    this.renderTrucks();
  }

  setMaintFilter(status) {
    this._maintStatusFilter = status;
    this.renderActiveOrdersDashboard();
  }

  renderActiveOrdersDashboard() {
    // ── Sort/filter state ─────────────────────────────────
    if (!this._maintSortField) this._maintSortField = 'status';
    if (!this._maintSortDir)   this._maintSortDir   = 'asc';
    if (!this._maintStatusFilter) this._maintStatusFilter = 'all';

    if (!this.activeOrdersDashboard) return;
    if (!this.activeMaintenanceOrders.length) {
      this.activeOrdersDashboard.innerHTML = `
        <div style="grid-column: 1/-1; text-align:center; padding:40px; color:var(--text-muted, #94a3b8);">
          <i class="fa-solid fa-clipboard-check" style="font-size:40px; margin-bottom:12px; display:block; opacity:0.4;"></i>
          <div style="font-size:14px; font-weight:600;">Aucun ordre de maintenance actif</div>
          <div style="font-size:12px; margin-top:4px;">Les ordres apparaîtront ici automatiquement lorsqu'un camion entre en zone de maintenance</div>
        </div>`;
      return;
    }

    let html = '';
    this.activeMaintenanceOrders.forEach(order => {
      const priorityClass = order.priority === 'urgent' ? 'urgent' : (order.status === 'termine' ? 'completed' : 'active-order');
      const statusBadge = order.status === 'termine'
        ? '<span class="maint-status-badge badge-termine"><i class="fa-solid fa-check-circle"></i> Terminé</span>'
        : (order.priority === 'urgent'
          ? '<span class="maint-status-badge badge-urgent"><i class="fa-solid fa-exclamation-triangle"></i> Urgent</span>'
          : '<span class="maint-status-badge badge-en-cours"><i class="fa-solid fa-spinner fa-spin"></i> En cours</span>');

      const now = new Date();
      const start = new Date(order.date);
      const diffMs = now - start;
      const days = Math.floor(diffMs / 86400000);
      const hours = Math.floor((diffMs % 86400000) / 3600000);
      const durationText = days > 0 ? `${days}j ${hours}h` : `${hours}h`;

      const db = this.truckDbCache.find(d => d.deviceId === order.deviceId) || {};
      const metaTags = [];
      if (db.immatriculation) metaTags.push(`<span class="truck-meta-tag imm">${db.immatriculation}</span>`);
      if (db.chassisNumber) metaTags.push(`<span class="truck-meta-tag chassis">${db.chassisNumber}</span>`);

      html += `
        <div class="maint-card ${priorityClass}">
          <div style="display:flex; justify-content:space-between; align-items:start; margin-bottom:8px;">
            <div>
              <div style="font-size:16px; font-weight:800; color:var(--bg-surface, #0f172a);">${order.truckName}</div>
              <div style="display:flex; gap:4px; margin-top:3px; flex-wrap:wrap;">${metaTags.join('')}</div>
            </div>
            ${statusBadge}
          </div>
          <div style="display:grid; grid-template-columns:1fr 1fr; gap:6px; font-size:12px; margin-top:10px;">
            <div><i class="fa-solid fa-wrench" style="color:#f59e0b; width:16px;"></i> <strong>${order.type}</strong></div>
            <div><i class="fa-solid fa-clock" style="color:var(--text-muted, #64748b); width:16px;"></i> ${durationText}</div>
            <div><i class="fa-solid fa-map-pin" style="color:#ef4444; width:16px;"></i> ${order.location || 'N/A'}</div>
            <div><i class="fa-solid fa-road" style="color:#3b82f6; width:16px;"></i> ${(order.odometer || 0).toLocaleString()} km</div>
            ${order.technician ? `<div><i class="fa-solid fa-user-gear" style="color:#7e22ce; width:16px;"></i> ${order.technician}</div>` : ''}
            ${order.cost ? `<div><i class="fa-solid fa-coins" style="color:#f59e0b; width:16px;"></i> ${order.cost.toLocaleString()} DA</div>` : ''}
          </div>
          ${order.note ? `<div style="font-size:11px; color:var(--text-muted, #64748b); margin-top:8px; font-style:italic; padding:6px; background:#f8fafc; border-radius:4px;">"${order.note}"</div>` : ''}
          <div style="display:flex; gap:6px; margin-top:10px; justify-content:flex-end;">
            <button onclick="ui.cancelMaintenanceOrder('${order.id || order._id}')" class="btn-secondary" style="font-size:11px; padding:4px 10px; border-color:#fecaca; color:#dc2626;">
              <i class="fa-solid fa-ban"></i> Annuler
            </button>
            <button onclick="ui.editMaintenance('${order.id || order._id}')" class="btn-secondary" style="font-size:11px; padding:4px 10px;">
              <i class="fa-solid fa-pen"></i> Modifier
            </button>
            <button onclick="ui.closeMaintenanceOrderUI('${order.id || order._id}')" class="btn-primary" style="font-size:11px; padding:4px 10px; background:#22c55e; border:none;">
              <i class="fa-solid fa-check"></i> Terminer
            </button>
          </div>
        </div>`;
    });

    // ── Apply sort ─────────────────────────────────────────────
    const sf = this._maintSortField || 'status';
    const sd = this._maintSortDir   || 'asc';
    const orders = [...this.activeMaintenanceOrders];
    orders.sort((a, b) => {
      let va, vb;
      if (sf === 'truck')    { va = (a.truckName||'').toLowerCase(); vb = (b.truckName||'').toLowerCase(); }
      else if (sf === 'date'){ va = new Date(a.date||0).getTime(); vb = new Date(b.date||0).getTime(); }
      else if (sf === 'type'){ va = (a.type||'').toLowerCase(); vb = (b.type||'').toLowerCase(); }
      else { // status
        const rank = { 'urgent':0, 'en_cours':1, 'active':1, 'termine':2 };
        va = rank[a.priority==='urgent'?'urgent':(a.status||'active')] ?? 1;
        vb = rank[b.priority==='urgent'?'urgent':(b.status||'active')] ?? 1;
      }
      return sd === 'asc' ? (va < vb ? -1 : va > vb ? 1 : 0) : (va > vb ? -1 : va < vb ? 1 : 0);
    });

    // ── Apply status filter ─────────────────────────────────────
    const sf2 = this._maintStatusFilter || 'all';
    const filtered = sf2 === 'all' ? orders
      : sf2 === 'urgent'  ? orders.filter(o => o.priority === 'urgent')
      : sf2 === 'en_cours'? orders.filter(o => o.status !== 'termine')
      : sf2 === 'termine' ? orders.filter(o => o.status === 'termine')
      : orders;

    // ── Sort bar + filter bar ───────────────────────────────────
    const arrow = (f) => f === sf ? (sd === 'asc' ? ' ↑' : ' ↓') : ' ⇅';
    const btnStyle = (active) => `padding:5px 12px;border:1.5px solid ${active?'#0284c7':'#e2e8f0'};border-radius:20px;font-size:11px;font-weight:700;background:${active?'#eff6ff':'#fff'};color:${active?'#0284c7':'#64748b'};cursor:pointer;`;
    const filterBtnStyle = (v) => `padding:4px 10px;border-radius:16px;font-size:11px;font-weight:700;border:1.5px solid ${sf2===v?'#0284c7':'#e2e8f0'};background:${sf2===v?'#0284c7':'#fff'};color:${sf2===v?'#fff':'#64748b'};cursor:pointer;margin-right:4px;`;

    const controlBar = `<div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-bottom:12px;padding:10px 0;border-bottom:1px solid #f1f5f9;">
      <span style="font-size:11px;color:#64748b;font-weight:600;">Trier:</span>
      <button style="${btnStyle(sf==='status')}"  onclick="ui.sortMaintTable('status')">Statut${arrow('status')}</button>
      <button style="${btnStyle(sf==='truck')}"   onclick="ui.sortMaintTable('truck')">Camion${arrow('truck')}</button>
      <button style="${btnStyle(sf==='date')}"    onclick="ui.sortMaintTable('date')">Date${arrow('date')}</button>
      <button style="${btnStyle(sf==='type')}"    onclick="ui.sortMaintTable('type')">Type${arrow('type')}</button>
      <span style="flex:1;"></span>
      <span style="font-size:11px;color:#64748b;font-weight:600;">Filtre:</span>
      <button style="${filterBtnStyle('all')}"     onclick="ui.setMaintFilter('all')">Tous (${orders.length})</button>
      <button style="${filterBtnStyle('urgent')}"  onclick="ui.setMaintFilter('urgent')" >🔴 Urgents</button>
      <button style="${filterBtnStyle('en_cours')}" onclick="ui.setMaintFilter('en_cours')">⚙️ En cours</button>
      <button style="${filterBtnStyle('termine')}" onclick="ui.setMaintFilter('termine')">✅ Terminés</button>
    </div>`;

    // ── Build filtered HTML ─────────────────────────────────────
    let filteredHtml = '';
    filtered.forEach(order => {
      const priorityClass = order.priority === 'urgent' ? 'urgent' : (order.status === 'termine' ? 'completed' : 'active-order');
      const statusBadge = order.status === 'termine'
        ? '<span class="maint-status-badge badge-termine"><i class="fa-solid fa-check-circle"></i> Terminé</span>'
        : (order.priority === 'urgent'
          ? '<span class="maint-status-badge badge-urgent"><i class="fa-solid fa-exclamation-triangle"></i> Urgent</span>'
          : '<span class="maint-status-badge badge-en-cours"><i class="fa-solid fa-spinner fa-spin"></i> En cours</span>');
      const now = new Date();
      const start = new Date(order.date);
      const diffMs = now - start;
      const days = Math.floor(diffMs / 86400000);
      const hours = Math.floor((diffMs % 86400000) / 3600000);
      const durationText = days > 0 ? `${days}j ${hours}h` : `${hours}h`;
      const db2 = this.truckDbCache.find(d => d.deviceId === order.deviceId) || {};
      const metaTags2 = [];
      if (db2.immatriculation) metaTags2.push(`<span class="truck-meta-tag imm">${db2.immatriculation}</span>`);
      if (db2.chassisNumber) metaTags2.push(`<span class="truck-meta-tag chassis">${db2.chassisNumber}</span>`);
      filteredHtml += `<div class="maint-card ${priorityClass}" style="position:relative;">
        ${statusBadge}
        <div style="font-weight:800;font-size:14px;color:var(--text-primary);margin-bottom:4px;">${order.truckName||order.deviceId}</div>
        <div style="font-size:11px;color:#64748b;margin-bottom:6px;">${metaTags2.join('')}</div>
        <div style="font-size:12px;color:#374151;margin-bottom:4px;"><i class="fa-solid fa-wrench" style="color:#f59e0b;margin-right:4px;"></i>${order.type||'Maintenance'}</div>
        <div style="font-size:11px;color:#94a3b8;"><i class="fa-solid fa-clock"></i> ${durationText} · ${start.toLocaleDateString('fr-DZ')}</div>
        <div style="display:flex;gap:6px;margin-top:10px;">
          ${order.status !== 'termine' ? `<button class="btn-primary" style="flex:1;font-size:11px;padding:6px;background:#16a34a;border:none;" onclick="ui.closeMaintenanceOrderUI('${order.id || order._id}')"><i class="fa-solid fa-check"></i> Terminer</button>` : ''}
          <button class="btn-secondary" style="flex:1;font-size:11px;padding:6px;" onclick="ui.openNewMaintenanceOrder('${order.deviceId}')"><i class="fa-solid fa-plus"></i> Nouvel Ordre</button>
          <button style="padding:6px 10px;border:1.5px solid #fee2e2;border-radius:8px;background:#fff;color:#ef4444;font-size:11px;cursor:pointer;" onclick="ui.cancelMaintenanceOrder('${order.id || order._id}')"><i class="fa-solid fa-times"></i></button>
        </div>
      </div>`;
    });

    if (!filteredHtml) filteredHtml = `<div style="grid-column:1/-1;text-align:center;padding:30px;color:#94a3b8;font-size:13px;"><i class="fa-solid fa-filter" style="font-size:24px;opacity:0.3;display:block;margin-bottom:8px;"></i>Aucun ordre pour ce filtre.</div>`;

    this.activeOrdersDashboard.innerHTML = controlBar + filteredHtml;
  }

  async closeMaintenanceOrderUI(id) {
    if (!id || id === 'undefined' || id === 'null') {
      alert('Identifiant d\'ordre de maintenance invalide.');
      return;
    }
    const confirmed = typeof ui_showConfirm === 'function'
      ? await ui_showConfirm('Marquer cet ordre comme TERMINÉ ?', 'Clôturer la maintenance', '✅')
      : confirm('Marquer cet ordre comme TERMINÉ ?');
    if (!confirmed) return;
    try {
      const code = localStorage.getItem('fleetAccessCode') || this.currentCode || (typeof FLEET_CONFIG !== 'undefined' && FLEET_CONFIG.accessCode) || '';
      const headers = { 'Content-Type': 'application/json' };
      if (code) headers['x-access-code'] = code;
      const res = await fetch(`${FLEET_CONFIG.API.baseUrl}/api/maintenance/close`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ id, _id: id })
      });
      if (res.ok) {
        const resData = await res.json().catch(() => ({}));
        if (window.showToast) {
          showToast('Ordre clôturé avec succès ✅', 'success');
        } else {
          alert('✅ Ordre clôturé !');
        }
        if (resData && resData.vidangeOverrides) {
          FLEET_CONFIG.VIDANGE_OVERRIDES = resData.vidangeOverrides;
          FLEET_CONFIG.vidangeOverrides = resData.vidangeOverrides;
        } else if (typeof this.loadSettingsFromCloud === 'function') {
          await this.loadSettingsFromCloud();
        }
        if (typeof this.refreshMaintenanceFollowup === 'function') this.refreshMaintenanceFollowup();
        if (typeof this.fetchAndRenderMaintenance === 'function') this.fetchAndRenderMaintenance();
        const appInstance = (typeof app !== 'undefined' && app) || window.app;
        if (appInstance && typeof appInstance.forceRecalculateVidanges === 'function') {
          appInstance.forceRecalculateVidanges();
        } else if (typeof forceRecalculateVidanges === 'function') {
          forceRecalculateVidanges();
        }
        if (typeof this.renderTrucks === 'function') this.renderTrucks();
        if (typeof this.renderStats === 'function') this.renderStats();
        if (typeof this.renderVidangeSection === 'function') this.renderVidangeSection();
      } else {
        let errText = 'Erreur serveur.';
        try {
          const errData = await res.json();
          if (errData && errData.error) errText = errData.error;
        } catch (_) {}
        alert(errText);
      }
    } catch (e) { alert('Erreur connexion: ' + e.message); }
  }

  async cancelMaintenanceOrder(id) {
    if (!id || id === 'undefined' || id === 'null') {
      alert('Identifiant d\'ordre de maintenance invalide.');
      return;
    }
    const confirmed = typeof ui_showConfirm === 'function'
      ? await ui_showConfirm('⚠️ ANNULER cet ordre de maintenance ?\n\nCette action est irréversible. L\'ordre sera marqué comme annulé.', 'Annuler maintenance', '⚠️', 'Annuler l\'ordre')
      : confirm('⚠️ ANNULER cet ordre de maintenance ?\n\nCette action est irréversible. L\'ordre sera marqué comme annulé.');
    if (!confirmed) return;
    try {
      const code = localStorage.getItem('fleetAccessCode') || this.currentCode || (typeof FLEET_CONFIG !== 'undefined' && FLEET_CONFIG.accessCode) || '';
      const headers = { 'Content-Type': 'application/json' };
      if (code) headers['x-access-code'] = code;
      const res = await fetch(`${FLEET_CONFIG.API.baseUrl}/api/maintenance/${encodeURIComponent(id)}/cancel`, {
        method: 'PATCH',
        headers
      });
      if (res.ok) {
        if (window.showToast) {
          showToast('Ordre annulé avec succès ✅', 'success');
        } else {
          alert('✅ Ordre annulé avec succès.');
        }
        if (typeof this.refreshMaintenanceFollowup === 'function') this.refreshMaintenanceFollowup();
        if (typeof this.fetchAndRenderMaintenance === 'function') this.fetchAndRenderMaintenance();
      } else {
        let errText = 'Erreur serveur.';
        try {
          const errData = await res.json();
          if (errData && errData.error) errText = errData.error;
        } catch (_) {}
        alert(errText);
      }
    } catch (e) { alert('Erreur connexion: ' + e.message); }
  }

  async loadMaintenanceArticles() {
    try {
      const res = await fetch(`${FLEET_CONFIG.API.baseUrl}/api/maintenance-articles`);
      if (res.ok) { this._maintenanceArticles = await res.json(); }
    } catch (e) { console.warn('Failed to load articles:', e.message); this._maintenanceArticles = []; }
    return this._maintenanceArticles || [];
  }

  async seedDefaultArticles() {
    try {
      const res = await fetch(`${FLEET_CONFIG.API.baseUrl}/api/maintenance-articles/seed-defaults`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }
      });
      if (res.ok) {
        alert('\u2705 Articles par défaut créés ! (Vidange, Freins, Pneus, Filtres, Batterie, Embrayage, Clim, Suspension, Divers)');
        await this.loadMaintenanceArticles();
      }
    } catch (e) { alert('Erreur: ' + e.message); }
  }

  _populateArticleDropdown() {
    const articles = this._maintenanceArticles || [];
    const typeSelect = document.getElementById('modalMaintType');
    if (!typeSelect || articles.length === 0) return;
    typeSelect.innerHTML = '<option value="">— Sélectionner un article —</option>';
    const categories = {};
    articles.forEach(art => {
      if (!categories[art.category]) categories[art.category] = [];
      categories[art.category].push(art);
    });
    Object.keys(categories).forEach(cat => {
      const group = document.createElement('optgroup');
      group.label = cat;
      categories[cat].forEach(art => {
        const opt = document.createElement('option');
        opt.value = art.name;
        opt.dataset.articleCode = art.code;
        opt.dataset.articleId = art.id;
        opt.textContent = `${art.code} — ${art.name} (${(art.defaultPrice || 0).toLocaleString()} DA)`;
        group.appendChild(opt);
      });
      typeSelect.appendChild(group);
    });
    typeSelect.addEventListener('change', () => this._onArticleSelected(typeSelect.value));
  }

  _onArticleSelected(articleName) {
    const articles = this._maintenanceArticles || [];
    const art = articles.find(a => a.name === articleName);
    if (!art) return;
    const costInput = document.getElementById('modalMaintCost');
    const descInput = document.getElementById('modalMaintDescription');
    const noteInput = document.getElementById('modalMaintNote');
    if (costInput) costInput.value = art.defaultPrice || '';
    if (descInput) descInput.value = art.description || '';
    if (noteInput && art.components && art.components.length > 0) {
      const partsText = art.components.map(c => `• ${c.name} x${c.quantity} (${(c.unitCost || 0).toLocaleString()} DA)`).join('\n');
      noteInput.value = `Pièces:\n${partsText}\n\nMain d'œuvre: ${(art.laborCost || 0).toLocaleString()} DA\nDurée estimée: ${art.estimatedDuration || 'N/A'}`;
    }
  }

  async openMaintenanceSettingsModal() {
    document.getElementById('maintenanceSettingsModal').style.display = 'flex';
    this._switchSettingsTab('catalogue');
    await this.loadMaintenanceArticles();
    this._renderArticlesCatalog();
    this._loadForfaits();
  }

  _switchItinTab(tab) {
    ['create', 'routes', 'analyze'].forEach(t => {
      const panel = document.getElementById(`itab_${t}_panel`);
      const btn = document.getElementById(`itab_${t}`);
      if (panel) panel.style.display = t === tab ? 'block' : 'none';
      if (btn) {
        if (t === tab) {
          btn.style.background = 'linear-gradient(135deg,#7e22ce,#9333ea)';
          btn.style.color = '#fff';
          btn.style.fontWeight = '800';
        } else {
          btn.style.background = '#f8fafc';
          btn.style.color = '#475569';
          btn.style.fontWeight = '700';
        }
      }
    });
    // Auto-load routes tab
    if (tab === 'routes') {
      const minTrucks = parseInt(document.getElementById('itineraryMinTrucks')?.value) || 4;
      this.loadItineraryFromDB(minTrucks);
    }
  }

  _switchSettingsTab(tab) {
    ['catalogue', 'forfaits', 'intervalles'].forEach(t => {
      const panel = document.getElementById(`stab_${t}_panel`);
      const btn = document.getElementById(`stab_${t}`);
      if (panel) panel.style.display = t === tab ? 'block' : 'none';
      if (btn) {
        btn.style.background = t === tab ? '#7e22ce' : '#f3e8ff';
        btn.style.color = t === tab ? '#fff' : '#7e22ce';
      }
    });
  }

  _loadForfaits() {
    const articles = this._maintenanceArticles || [];
    const forfaits = articles.filter(a => a.category === 'Forfait' || a.category === 'Forfait Vidange');
    const container = document.getElementById('forfaitsContainer');
    if (!container) return;
    if (forfaits.length === 0) {
      container.innerHTML = `<div style="text-align:center;padding:30px;color:var(--text-muted, #94a3b8);font-size:13px;">
        <i class="fa-solid fa-oil-can" style="font-size:32px;display:block;margin-bottom:10px;opacity:0.3;"></i>
        Aucun forfait défini. Utilisez les boutons ci-dessus pour en ajouter.</div>`;
      return;
    }
    let html = '<div style="display:grid;gap:10px;">';
    forfaits.forEach((f, i) => {
      html += `<div style="background:#1a2332;border:1px solid rgba(245,158,11,0.3);border-left:4px solid #f59e0b;border-radius:10px;padding:14px;display:flex;justify-content:space-between;align-items:center;">
        <div>
          <div style="font-weight:800;color:#92400e;font-size:13px;">${f.name} <span style="font-size:10px;font-weight:600;background:#fef3c7;color:#b45309;padding:2px 8px;border-radius:10px;margin-left:6px;">${f.code}</span></div>
          <div style="font-size:11px;color:#78716c;margin-top:4px;">${f.description || ''}</div>
          <div style="font-size:11px;color:#b45309;margin-top:3px;font-weight:700;">💰 ${(f.defaultPrice||0).toLocaleString()} DA · ⏱ ${f.estimatedDuration||'N/A'} · 🔧 MO: ${(f.laborCost||0).toLocaleString()} DA</div>
        </div>
        <button onclick="ui.deleteArticle('${f.id}')" style="background:#fef2f2;color:#dc2626;border:1px solid #fecaca;border-radius:6px;padding:5px 10px;font-size:11px;cursor:pointer;"><i class="fa-solid fa-trash"></i></button>
      </div>`;
    });
    html += '</div>';
    container.innerHTML = html;
  }

  async _quickAddForfait(name, code, components, price, labor, duration) {
    const article = {
      code, name,
      category: 'Forfait Vidange',
      description: components,
      defaultPrice: parseInt(price),
      laborCost: labor,
      estimatedDuration: duration,
      components: components.split('+').map(c => ({ name: c.trim(), quantity: 1, unitCost: 0 }))
    };
    try {
      const res = await fetch(`${FLEET_CONFIG.API.baseUrl}/api/maintenance-articles`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-access-code': FLEET_CONFIG.accessCode },
        body: JSON.stringify(article)
      });
      if (res.ok) {
        if (window.showToast) showToast(`\u2705 Forfait "${name}" ajouté au catalogue`, 'success');
        await this.loadMaintenanceArticles();
        this._loadForfaits();
        this._populateArticleDropdown();
      }
    } catch(e) { if (window.showToast) showToast('❌ Erreur: ' + e.message, 'error'); }
  }

  async _saveForfait() {
    const code = document.getElementById('forfaitCode')?.value?.trim();
    const name = document.getElementById('forfaitName')?.value?.trim();
    const price = parseInt(document.getElementById('forfaitPrice')?.value) || 0;
    const labor = parseInt(document.getElementById('forfaitLabor')?.value) || 0;
    const duration = document.getElementById('forfaitDuration')?.value?.trim();
    const componentsRaw = document.getElementById('forfaitComponents')?.value?.trim();
    if (!code || !name) { if (window.showToast) showToast('\u26a0\ufe0f Code et Nom requis', 'warning'); return; }
    const components = componentsRaw
      ? componentsRaw.split(',').map(c => ({ name: c.trim(), quantity: 1, unitCost: 0 }))
      : [];
    await this._quickAddForfait(name, code, componentsRaw || name, String(price), labor, duration || 'N/A');
  }

  _saveIntervalles() {
    const intervalles = {
      vidange: { km: parseInt(document.getElementById('intVidangeKm')?.value)||10000, mois: parseInt(document.getElementById('intVidangeMois')?.value)||6 },
      freins:  { km: parseInt(document.getElementById('intFreinsKm')?.value)||30000, mois: parseInt(document.getElementById('intFreinsMois')?.value)||12 },
      pneus:   { km: parseInt(document.getElementById('intPneusKm')?.value)||80000, mois: parseInt(document.getElementById('intPneusMois')?.value)||6 },
      filtreAir: { km: parseInt(document.getElementById('intFiltreAirKm')?.value)||20000 },
      filtreGasoil: { km: parseInt(document.getElementById('intFiltreGasoilKm')?.value)||15000 }
    };
    localStorage.setItem('fleet_maintenance_intervalles', JSON.stringify(intervalles));
    if (window.showToast) showToast('\u2705 Intervalles d\'entretien sauvegardés', 'success');
  }

  _renderArticlesCatalog() {
    const container = document.getElementById('articlesCatalogContainer');
    if (!container) return;
    const articles = this._maintenanceArticles || [];
    if (articles.length === 0) {
      container.innerHTML = `<div style="text-align:center;padding:40px;color:var(--text-muted);">
        <i class="fa-solid fa-box-open" style="font-size:40px;display:block;margin-bottom:12px;opacity:0.35;"></i>
        <div style="font-weight:600;color:var(--text-primary);font-size:14px;">Aucun article configuré</div>
        <div style="font-size:12px;margin-top:4px;">Cliquez "Créer Articles Par Défaut" pour commencer.</div>
      </div>`;
      return;
    }
    let html = `<div style="background:var(--bg-elevated);border:1px solid var(--border);border-radius:var(--radius-xl);overflow:hidden;box-shadow:var(--shadow-sm);">
      <table style="width:100%;border-collapse:collapse;font-size:12px;font-family:var(--font-sans,inherit);">
        <thead>
          <tr style="background:var(--bg-surface);border-bottom:1px solid var(--border-strong);">
            <th style="padding:10px 14px;text-align:left;color:var(--text-muted);font-weight:700;font-size:10px;text-transform:uppercase;letter-spacing:0.5px;">Code</th>
            <th style="padding:10px 14px;text-align:left;color:var(--text-muted);font-weight:700;font-size:10px;text-transform:uppercase;letter-spacing:0.5px;">Nom</th>
            <th style="padding:10px 14px;text-align:center;color:var(--text-muted);font-weight:700;font-size:10px;text-transform:uppercase;letter-spacing:0.5px;">Catégorie</th>
            <th style="padding:10px 14px;text-align:center;color:var(--text-muted);font-weight:700;font-size:10px;text-transform:uppercase;letter-spacing:0.5px;">Prix (DA)</th>
            <th style="padding:10px 14px;text-align:center;color:var(--text-muted);font-weight:700;font-size:10px;text-transform:uppercase;letter-spacing:0.5px;">Pièces</th>
            <th style="padding:10px 14px;text-align:center;color:var(--text-muted);font-weight:700;font-size:10px;text-transform:uppercase;letter-spacing:0.5px;">Actions</th>
          </tr>
        </thead>
        <tbody>`;
    articles.forEach((art, i) => {
      const rowBg = i % 2 === 0 ? '' : 'background:rgba(255,255,255,0.02);';
      const partsCount = (art.components || []).length;
      html += `<tr style="border-bottom:1px solid var(--border);${rowBg}" onmouseover="this.style.background='var(--bg-surface)'" onmouseout="this.style.background=''">
        <td style="padding:10px 14px;font-weight:700;font-family:var(--font-mono,monospace);color:#a78bfa;">${art.code}</td>
        <td style="padding:10px 14px;font-weight:600;color:var(--text-primary);">${art.name}</td>
        <td style="padding:10px 14px;text-align:center;">
          <span style="background:rgba(139,92,246,0.12);color:#a78bfa;padding:2px 10px;border-radius:var(--radius-full);font-size:10px;font-weight:700;">${art.category}</span>
        </td>
        <td style="padding:10px 14px;text-align:center;font-weight:700;color:var(--success);">${(art.defaultPrice || 0).toLocaleString('fr-FR')} DA</td>
        <td style="padding:10px 14px;text-align:center;color:var(--text-muted);">${partsCount} pièce${partsCount > 1 ? 's' : ''}</td>
        <td style="padding:10px 14px;text-align:center;">
          <button onclick="ui.deleteArticle('${art.id}')" style="background:var(--danger-subtle);color:var(--danger);border:1px solid var(--danger-glow);border-radius:var(--radius-md);padding:4px 10px;font-size:11px;cursor:pointer;font-weight:600;font-family:inherit;">
            <i class="fa-solid fa-trash"></i>
          </button>
        </td>
      </tr>`;
    });
    html += '</tbody></table></div>';
    container.innerHTML = html;
  }

  async deleteArticle(id) {
    if (!confirm('Supprimer cet article ?')) return;
    try {
      await fetch(`${FLEET_CONFIG.API.baseUrl}/api/maintenance-articles/${id}`, { method: 'DELETE' });
      await this.loadMaintenanceArticles();
      this._renderArticlesCatalog();
    } catch (e) { alert('Erreur: ' + e.message); }
  }

  async saveArticleFromSettings() {
    const code = document.getElementById('artCode')?.value?.trim();
    const name = document.getElementById('artName')?.value?.trim();
    if (!code || !name) { alert('Code et Nom sont obligatoires.'); return; }
    const payload = {
      code, name,
      category: document.getElementById('artCategory')?.value?.trim() || 'general',
      description: document.getElementById('artDescription')?.value?.trim() || '',
      defaultPrice: parseFloat(document.getElementById('artPrice')?.value) || 0,
      laborCost: parseFloat(document.getElementById('artLabor')?.value) || 0,
      estimatedDuration: document.getElementById('artDuration')?.value?.trim() || ''
    };
    try {
      const res = await fetch(`${FLEET_CONFIG.API.baseUrl}/api/maintenance-articles`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        alert('\u2705 Article enregistré !');
        ['artCode','artName','artCategory','artDescription','artPrice','artLabor','artDuration'].forEach(id => {
          const el = document.getElementById(id); if (el) el.value = '';
        });
        await this.loadMaintenanceArticles();
        this._renderArticlesCatalog();
      } else { alert('Erreur serveur.'); }
    } catch (e) { alert('Erreur: ' + e.message); }
  }

  async openNewMaintenanceOrder(truckId = null) {
    // ── 1. Populate truck dropdown ────────────────────────────────
    const truckSelect = document.getElementById('modalMaintTruck');
    if (truckSelect) {
      truckSelect.innerHTML = '<option value="">— Choisir un camion —</option>';
      try {
        // Merge DB trucks + live GPS trucks (deduplicated by name)
        let dbTrucks = [];
        const r = await fetch(`${FLEET_CONFIG.API.baseUrl}/api/trucks/db`, {
          headers: { 'x-access-code': localStorage.getItem('fleetAccessCode') || '' }
        });
        if (r.ok) {
          const raw = await r.json();
          dbTrucks = Array.isArray(raw) ? raw : Object.values(raw);
        }
        const liveTrucks = (window.app && typeof window.app.getAllTrucks === 'function')
          ? window.app.getAllTrucks() : [];
        // Merge: name -> {name, deviceId, odo}
        const truckMap = new Map();
        dbTrucks.forEach(t => {
          const name = t.truckName || t.name || t.deviceId;
          truckMap.set(name, { name, deviceId: t.deviceId || '', odo: t.odometer || t.lastOdometer || 0 });
        });
        liveTrucks.forEach(t => {
          const name = t.name || t.deviceId;
          if (!truckMap.has(name)) {
            truckMap.set(name, { name, deviceId: String(t.id || t.deviceId || ''), odo: t.odometer || 0 });
          } else {
            const ex = truckMap.get(name);
            if (!ex.odo && (t.odometer || 0) > 0) ex.odo = t.odometer;
          }
        });
        const mergedList = Array.from(truckMap.values()).sort((a, b) => a.name.localeCompare(b.name, 'fr'));
        mergedList.forEach(t => {
          const opt = document.createElement('option');
          opt.value       = t.name;
          opt.textContent = t.name;
          opt.dataset.id  = t.deviceId;
          opt.dataset.odo = t.odo;
          truckSelect.appendChild(opt);
        });
        // ── Truck pre-select handled after modal opens (see below) ──
      } catch(e) {
        // Last resort: live GPS only
        const liveTrucks = (window.app && typeof window.app.getAllTrucks === 'function')
          ? window.app.getAllTrucks() : [];
        liveTrucks.sort((a,b)=>(a.name||'').localeCompare(b.name||'')).forEach(t => {
          const opt = document.createElement('option');
          opt.value       = t.name;
          opt.textContent = t.name;
          opt.dataset.id  = String(t.id || t.deviceId || '');
          opt.dataset.odo = t.odometer || 0;
          truckSelect.appendChild(opt);
        });
      }
      // Auto-fill odometer when truck changes
      truckSelect.onchange = () => {
        const sel = truckSelect.options[truckSelect.selectedIndex];
        const odoEl = document.getElementById('modalMaintOdo');
        if (odoEl && sel && sel.dataset.odo) odoEl.value = sel.dataset.odo;
        if (typeof this._onMaintTruckChange === 'function') this._onMaintTruckChange(sel);
      };
    }

    // ── 2. Populate location dropdown ─────────────────────────────
    const locSelect = document.getElementById('modalMaintLocation');
    if (locSelect) {
      locSelect.innerHTML = '<option value="Atelier Douroub">🏭 Atelier Douroub</option>';
      const locs = FLEET_CONFIG.CUSTOM_LOCATIONS || [];
      locs.filter(l => l.type === 'maintenance').forEach(l => {
        locSelect.innerHTML += `<option value="${l.name}">🔧 ${l.name}</option>`;
      });
      locSelect.innerHTML += '<option value="Entrée Manuelle">📍 Entrée Manuelle</option>';
    }

    // ── 3. Default date/time to now ───────────────────────────────
    const dateEl = document.getElementById('modalMaintDate');
    if (dateEl && !dateEl.value) {
      const now = new Date();
      now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
      dateEl.value = now.toISOString().slice(0, 16);
    }

    // ── 4. Load articles & open modal ────────────────────────────
    this.loadMaintenanceArticles().then(() => this._populateArticleDropdown());
    this.openMaintenanceModal(null);

    // ── 5. Pre-select truck AFTER modal is fully open ──────────────
    if (truckId) {
      // Use two rAF + setTimeout to ensure modal DOM is fully rendered
      requestAnimationFrame(() => setTimeout(() => {
        const ts = document.getElementById('modalMaintTruck');
        if (!ts) return;
        const preOpt = Array.from(ts.options).find(o =>
          String(o.dataset.id) === String(truckId)
          || o.value === truckId
          || (typeof truckId === 'string' && o.value.toLowerCase() === truckId.toLowerCase())
        );
        if (preOpt) {
          ts.value = preOpt.value;
          const odoEl = document.getElementById('modalMaintOdo');
          if (odoEl && preOpt.dataset.odo) odoEl.value = preOpt.dataset.odo;
          ts.dispatchEvent(new Event('change'));
        }
        // If this was called from quickAddVidange, also set type
        if (this._pendingVidangeDeviceId) {
          const typeEl = document.getElementById('modalMaintType');
          if (typeEl) typeEl.value = 'Vidange';
          this._pendingVidangeDeviceId = null;
        }
      }, 120));
    }
  }

  


  // ============================================================
  // 🔧 MAINTENANCE WIZARD — Step Navigation
  // ============================================================
  
  setMaintWizardStep(step) {
    // Update steps
    document.querySelectorAll('.maint-wizard-step').forEach(el => el.classList.remove('active'));
    const stepEl = document.getElementById('maintStep' + step);
    if (stepEl) stepEl.classList.add('active');
    
    // Update nav buttons
    document.querySelectorAll('.maint-wizard-nav button').forEach((btn, i) => {
      btn.classList.remove('active', 'completed');
      if (i + 1 === step) btn.classList.add('active');
      else if (i + 1 < step) btn.classList.add('completed');
    });
    
    // On step 2: load parts for selected type
    if (step === 2) {
      const type = document.getElementById('modalMaintType')?.value;
      if (type && (!this._wizardParts || this._wizardParts.length === 0)) {
        this._loadCatalogParts();
      }
    }
    
    // On step 3: build summary
    if (step === 3) this._renderMaintSummary();
    
    this._currentWizardStep = step;
  }

  // ============================================================
  // 🔧 MAINTENANCE WIZARD — Type Change → Auto-load Parts
  // ============================================================

  _onMaintTypeChange() {
    this._wizardParts = []; // Reset parts when type changes
    this._loadCatalogParts();
  }

  _onMaintSchemeChange() {
    const sel = document.getElementById('modalMaintScheme');
    if (!sel) return;
    const name = sel.value;
    // Toggle active class on scheme SVGs within the maintenance modal
    const modal = document.getElementById('maintenanceModal');
    if (modal) {
      modal.querySelectorAll('.scheme').forEach(el => el.classList.remove('active'));
      const target = modal.querySelector('#scheme_' + name);
      if (target) target.classList.add('active');
    }
    // Also try window.setScheme for ordre_reparation context
    if (typeof window.setScheme === 'function') {
      window.setScheme(name);
    }
  }

  // Map maintenance type to article catalog codes
  _getArticleCodesForType(type) {
    const map = {
      'Vidange': ['VID-001'],
      'Vidange Complète': ['VID-001'],
      'Plaquettes': ['FRN-001'],
      'Freins': ['FRN-001'],
      'Pneumatiques': ['PNU-001'],
      'Filtres': ['FLT-001'],
      'Batterie': ['BAT-001'],
      'Embrayage': ['EMB-001'],
      'Climatisation': ['CRG-001'],
      'Suspension': ['SUS-001'],
      'Moteur': ['DIV-001'],
      'Électrique': ['DIV-001'],
      'Diagnostic': ['DIV-001'],
      'Autre': ['DIV-001']
    };
    return map[type] || ['DIV-001'];
  }

  // ============================================================
  // 🔧 PARTS PICKER — Load from Catalog
  // ============================================================

  async _loadCatalogParts() {
    const type = document.getElementById('modalMaintType')?.value || '';
    const codes = this._getArticleCodesForType(type);
    
    try {
      const res = await fetch(`${FLEET_CONFIG.API.baseUrl}/api/maintenance-articles`);
      if (!res.ok) throw new Error('Failed to load articles');
      const articles = await res.json();
      
      // Find matching articles
      let matched = articles.filter(a => codes.includes(a.code));
      if (matched.length === 0) matched = articles.filter(a => a.code === 'DIV-001');
      
      // Flatten: each article's components become individual part rows
      this._wizardParts = [];
      matched.forEach(art => {
        if (art.components && art.components.length > 0) {
          art.components.forEach(comp => {
            this._wizardParts.push({
              id: 'cat_' + Math.random().toString(36).substr(2, 6),
              name: comp.name,
              category: art.category || art.name,
              quantity: comp.quantity || 1,
              unitCost: comp.unitCost || 0,
              checked: true,
              isCustom: false,
              articleCode: art.code
            });
          });
        } else {
          this._wizardParts.push({
            id: 'cat_' + Math.random().toString(36).substr(2, 6),
            name: art.name,
            category: art.category || 'Général',
            quantity: 1,
            unitCost: art.defaultPrice || 0,
            checked: true,
            isCustom: false,
            articleCode: art.code
          });
        }
      });
      
      // Set labor cost from first matched article
      if (matched.length > 0 && matched[0].laborCost) {
        const laborEl = document.getElementById('modalMaintLabor');
        if (laborEl && (!laborEl.value || laborEl.value === '0')) {
          laborEl.value = matched[0].laborCost;
        }
      }
    } catch (e) {
      console.warn('Failed to load catalog parts:', e.message);
      this._wizardParts = [];
    }
    
    this._renderPartsChecklist();
  }

  // ============================================================
  // 🔧 PARTS PICKER — Render Checklist
  // ============================================================

  _renderPartsChecklist() {
    const body = document.getElementById('partsPickerBody');
    if (!body) return;
    
    if (!this._wizardParts || this._wizardParts.length === 0) {
      body.innerHTML = '<div style="text-align:center; padding:25px; color:var(--text-muted); font-size:12px;"><i class="fa-solid fa-box-open" style="font-size:24px; display:block; margin-bottom:6px; opacity:0.3;"></i>Aucune pièce. Ajoutez des pièces personnalisées ci-dessous.</div>';
      this._updatePartsTotal();
      return;
    }
    
    let html = '';
    this._wizardParts.forEach((part, i) => {
      const total = (part.quantity * part.unitCost);
      const checkedClass = part.checked ? 'checked' : 'unchecked';
      const nameField = part.isCustom
        ? '<input type="text" value="' + (part.name || '').replace(/"/g, '&quot;') + '" onchange="ui._updatePartField(' + i + ", 'name', this.value)\" placeholder=\"Nom pièce...\" style=\"width:90%;font-weight:700;\">"
        : part.name;
      html += '<div class="part-row ' + checkedClass + '" data-index="' + i + '">'
        + '<input type="checkbox" ' + (part.checked ? 'checked' : '') + ' onchange="ui._togglePart(' + i + ')">'
        + '<div><div class="part-name">' + nameField + '</div><div class="part-cat">' + part.category + '</div></div>'
        + '<input type="number" value="' + part.quantity + '" min="1" onchange="ui._updatePartField(' + i + ", 'quantity', parseInt(this.value)||1)\" " + (!part.checked ? 'disabled' : '') + '>'
        + '<input type="number" value="' + part.unitCost + '" min="0" onchange="ui._updatePartField(' + i + ", 'unitCost', parseFloat(this.value)||0)\" " + (!part.checked ? 'disabled' : '') + '>'
        + '<div style="text-align:center; font-weight:800; color:' + (part.checked ? 'var(--success)' : 'var(--text-muted)') + '; font-size:12px;">' + (part.checked ? total.toLocaleString() : '—') + '</div>'
        + '<button class="btn-remove" onclick="ui._removePartRow(' + i + ')" title="Supprimer"><i class="fa-solid fa-trash"></i></button>'
        + '</div>';
    });
    
    body.innerHTML = html;
    this._updatePartsTotal();
  }

  _togglePart(index) {
    if (!this._wizardParts || !this._wizardParts[index]) return;
    this._wizardParts[index].checked = !this._wizardParts[index].checked;
    this._renderPartsChecklist();
  }

  _updatePartField(index, field, value) {
    if (!this._wizardParts || !this._wizardParts[index]) return;
    this._wizardParts[index][field] = value;
    this._renderPartsChecklist();
  }

  _addCustomPartRow() {
    if (!this._wizardParts) this._wizardParts = [];
    this._wizardParts.push({
      id: 'custom_' + Math.random().toString(36).substr(2, 6),
      name: '',
      category: 'Personnalisé',
      quantity: 1,
      unitCost: 0,
      checked: true,
      isCustom: true
    });
    this._renderPartsChecklist();
    const body = document.getElementById('partsPickerBody');
    if (body) body.scrollTop = body.scrollHeight;
  }

  _removePartRow(index) {
    if (!this._wizardParts) return;
    this._wizardParts.splice(index, 1);
    this._renderPartsChecklist();
  }

  _updatePartsTotal() {
    const checkedParts = (this._wizardParts || []).filter(p => p.checked);
    const total = checkedParts.reduce((sum, p) => sum + (p.quantity * p.unitCost), 0);
    
    const totalEl = document.getElementById('partsTotalValue');
    const countEl = document.getElementById('partsItemCount');
    if (totalEl) totalEl.textContent = total.toLocaleString() + ' DA';
    if (countEl) countEl.textContent = checkedParts.length + ' article' + (checkedParts.length > 1 ? 's' : '') + ' sélectionné' + (checkedParts.length > 1 ? 's' : '');
    
    // Update the hidden cost field
    const laborEl = document.getElementById('modalMaintLabor');
    const labor = parseFloat(laborEl?.value) || 0;
    const costEl = document.getElementById('modalMaintCost');
    if (costEl) costEl.value = total + labor;
  }

  // ============================================================
  // 🔧 MAINTENANCE WIZARD — Summary (Step 3)
  // ============================================================

  _renderMaintSummary() {
    const card = document.getElementById('maintSummaryCard');
    if (!card) return;
    
    const truckSelect = document.getElementById('modalMaintTruck');
    const truckName = truckSelect?.options[truckSelect.selectedIndex]?.text || '—';
    const type = document.getElementById('modalMaintType')?.value || '—';
    const date = document.getElementById('modalMaintDate')?.value || '—';
    const odo = document.getElementById('modalMaintOdo')?.value || '—';
    const location = document.getElementById('modalMaintLocation')?.value || '—';
    const priority = document.getElementById('modalMaintPriority')?.value || 'normal';
    const tech = document.getElementById('modalMaintTechnician')?.value || '—';
    const desc = document.getElementById('modalMaintDescription')?.value || '—';
    const imm = document.getElementById('modalMaintImm')?.value || '—';
    const labor = parseFloat(document.getElementById('modalMaintLabor')?.value) || 0;
    
    const checkedParts = (this._wizardParts || []).filter(p => p.checked);
    const partsTotal = checkedParts.reduce((sum, p) => sum + (p.quantity * p.unitCost), 0);
    const grandTotal = partsTotal + labor;
    
    const priorityLabels = { urgent: '🔴 Urgent', normal: '🟢 Normal', bas: '⚪ Bas' };
    
    let partsHtml = '';
    if (checkedParts.length > 0) {
      const rows = checkedParts.map(p => '<tr><td style="padding:5px 8px;border-bottom:1px solid var(--border-light);font-weight:600;">' + p.name + '</td><td style="padding:5px 8px;text-align:center;border-bottom:1px solid var(--border-light);">' + p.quantity + '</td><td style="padding:5px 8px;text-align:right;border-bottom:1px solid var(--border-light);">' + p.unitCost.toLocaleString() + '</td><td style="padding:5px 8px;text-align:right;border-bottom:1px solid var(--border-light);font-weight:700;color:var(--success);">' + (p.quantity * p.unitCost).toLocaleString() + '</td></tr>').join('');
      partsHtml = '<div style="margin-top:12px;"><div style="font-weight:700;font-size:12px;color:var(--text-primary);margin-bottom:8px;"><i class="fa-solid fa-boxes-stacked" style="color:var(--warning);margin-right:4px;"></i> Pièces sélectionnées</div><table style="width:100%;font-size:11px;border-collapse:collapse;"><tr style="background:var(--bg-elevated);color:var(--text-muted);font-weight:700;"><td style="padding:6px 8px;border-bottom:1px solid var(--border);">Pièce</td><td style="padding:6px 8px;text-align:center;border-bottom:1px solid var(--border);">Qté</td><td style="padding:6px 8px;text-align:right;border-bottom:1px solid var(--border);">P.U</td><td style="padding:6px 8px;text-align:right;border-bottom:1px solid var(--border);">Total</td></tr>' + rows + '</table></div>';
    }
    
    card.innerHTML = '<div class="maint-summary-row"><span class="label">Camion</span><span class="value">' + truckName + '</span></div>'
      + '<div class="maint-summary-row"><span class="label">Immatriculation</span><span class="value">' + imm + '</span></div>'
      + '<div class="maint-summary-row"><span class="label">Schéma</span><span class="value">' + (document.getElementById('modalMaintScheme')?.options[document.getElementById('modalMaintScheme')?.selectedIndex]?.text || '—') + '</span></div>'
      + '<div class="maint-summary-row"><span class="label">Type</span><span class="value" style="color:var(--warning);font-weight:800;">' + type + '</span></div>'
      + '<div class="maint-summary-row"><span class="label">Date</span><span class="value">' + (date !== '—' ? new Date(date).toLocaleString('fr-FR') : '—') + '</span></div>'
      + '<div class="maint-summary-row"><span class="label">Compteur</span><span class="value">' + (odo && odo !== '—' ? parseInt(odo).toLocaleString() + ' km' : '—') + '</span></div>'
      + '<div class="maint-summary-row"><span class="label">Lieu</span><span class="value">' + location + '</span></div>'
      + '<div class="maint-summary-row"><span class="label">Priorité</span><span class="value">' + (priorityLabels[priority] || priority) + '</span></div>'
      + '<div class="maint-summary-row"><span class="label">Technicien</span><span class="value">' + tech + '</span></div>'
      + (desc !== '—' ? '<div class="maint-summary-row"><span class="label">Observations</span><span class="value" style="max-width:60%;text-align:right;">' + desc + '</span></div>' : '')
      + partsHtml
      + '<div class="maint-summary-total"><div><div>Main d\'œuvre</div><div style="font-size:11px;color:var(--text-muted);font-weight:500;">' + labor.toLocaleString() + ' DA</div></div><div><div style="font-size:11px;color:var(--text-muted);font-weight:500;text-align:right;">Total Pièces: ' + partsTotal.toLocaleString() + ' DA</div><div class="value" style="color:var(--warning);font-size:22px;">' + grandTotal.toLocaleString() + ' DA</div></div></div>';
  }

  // ============================================================
  // 🔧 VEHICLE REFERENCES SYSTEM
  // ============================================================

  async loadVehicleReferences() {
    try {
      const res = await fetch(`${FLEET_CONFIG.API.baseUrl}/api/vehicle-references`);
      if (res.ok) this._vehicleRefs = await res.json();
      else this._vehicleRefs = [];
    } catch (e) {
      console.warn('Failed to load vehicle references:', e.message);
      this._vehicleRefs = [];
    }
    this.loadDocExpiryWidget();
  }

  loadDocExpiryWidget() {
    this.filterDocs('all');
  }

  filterDocs(filter) {
    const list = document.getElementById('docExpiryList');
    const countEl = document.getElementById('docExpiryCount');
    if (!list) return;
    const refs = this._vehicleRefs || [];
    if (!refs.length) { list.innerHTML = '<div style="text-align:center;padding:15px;color:var(--text-muted);">Aucun document enregistré</div>'; return; }
    const now = new Date();
    const enriched = refs.map(r => {
      const exp = new Date(r.expiryDate);
      const days = Math.ceil((exp - now) / 86400000);
      let status, color, icon;
      if (days < 0) { status = 'expired'; color = '#f87171'; icon = '🔴'; }
      else if (days <= (r.reminderDays || 30)) { status = 'soon'; color = '#fb923c'; icon = '🟠'; }
      else { status = 'valid'; color = '#4ade80'; icon = '🟢'; }
      return { ...r, days, status, color, icon, expDate: exp };
    }).sort((a,b) => a.days - b.days);

    const filtered = filter === 'all' ? enriched : enriched.filter(r => r.status === filter);
    const expiredCount = enriched.filter(r => r.status === 'expired').length;
    const soonCount = enriched.filter(r => r.status === 'soon').length;
    if (countEl) countEl.textContent = `${enriched.length} docs • ${expiredCount} expiré${expiredCount>1?'s':''} • ${soonCount} bientôt`;

    if (!filtered.length) { list.innerHTML = '<div style="text-align:center;padding:15px;color:var(--text-muted);">Aucun document dans cette catégorie</div>'; return; }

    list.innerHTML = filtered.map(r => {
      const label = r.days < 0 ? `Expiré il y a ${Math.abs(r.days)}j` : r.days === 0 ? "Expire aujourd'hui" : `${r.days}j restants`;
      return `<div style="display:flex;align-items:center;gap:8px;padding:6px 8px;border-bottom:1px solid var(--border);border-radius:4px;">
        <span style="font-size:12px;">${r.icon}</span>
        <span style="font-weight:700;min-width:80px;">${r.truckName || '—'}</span>
        <span style="color:var(--text-muted);flex:1;">${r.refName}</span>
        <span style="font-size:10px;color:var(--text-muted);">${r.refNumber || ''}</span>
        <span style="font-weight:600;color:${r.color};font-size:10px;min-width:90px;text-align:right;">${label}</span>
        <span style="font-size:9px;color:var(--text-muted);">${r.expDate.toLocaleDateString('fr-FR')}</span>
      </div>`;
    }).join('');
  }

  getRefsForTruck(deviceId) {
    return (this._vehicleRefs || []).filter(r => r.deviceId === deviceId);
  }

  renderReferenceBadges(deviceId) {
    const refs = this.getRefsForTruck(deviceId);
    if (refs.length === 0) return '';
    
    const now = new Date();
    const badges = refs.map(ref => {
      const expiry = new Date(ref.expiryDate);
      const daysLeft = Math.ceil((expiry - now) / (1000 * 60 * 60 * 24));
      let cls, icon, label;
      if (daysLeft < 0) { cls = 'ref-expired'; icon = '⛔'; label = 'EXPIRÉ'; }
      else if (daysLeft <= 30) { cls = 'ref-danger'; icon = '🔴'; label = daysLeft + 'j'; }
      else if (daysLeft <= 60) { cls = 'ref-warn'; icon = '🟠'; label = daysLeft + 'j'; }
      else { cls = 'ref-ok'; icon = '🟢'; label = daysLeft + 'j'; }
      const shortName = ref.refName.length > 12 ? ref.refName.substring(0, 10) + '…' : ref.refName;
      return '<span class="ref-badge ' + cls + '" title="' + ref.refName + ' — expire le ' + expiry.toLocaleDateString('fr-FR') + '"><span class="ref-icon">' + icon + '</span> ' + shortName + ' ' + label + '</span>';
    });
    
    const maxShow = 3;
    let html = badges.slice(0, maxShow).join('');
    if (badges.length > maxShow) {
      html += '<span class="ref-badge-more" onclick="event.stopPropagation(); ui.openRefModal(\'' + deviceId + '\')" title="Voir tous les documents">+' + (badges.length - maxShow) + '</span>';
    }
    return '<div class="ref-badges">' + html + '</div>';
  }

  checkExpiringReferences() {
    const now = new Date();
    const expiring = (this._vehicleRefs || []).filter(ref => {
      const expiry = new Date(ref.expiryDate);
      const daysLeft = Math.ceil((expiry - now) / (1000 * 60 * 60 * 24));
      return daysLeft <= (ref.reminderDays || 30) && daysLeft >= 0;
    });
    if (expiring.length > 0 && window.FleetNotifications) {
      expiring.forEach(ref => {
        const expiry = new Date(ref.expiryDate);
        const daysLeft = Math.ceil((expiry - now) / (1000 * 60 * 60 * 24));
        if (window.pushNotification) {
          window.pushNotification('doc_expiring', {
            title: '📋 ' + ref.refName + ' expire bientôt',
            body: (ref.truckName || 'Véhicule') + ' — ' + ref.refName + ' (' + (ref.refNumber || 'N/A') + ') expire dans ' + daysLeft + ' jour' + (daysLeft > 1 ? 's' : '') + ' (' + expiry.toLocaleDateString('fr-FR') + ')',
            severity: 'warning'
          });
        }
      });
    }
    return expiring;
  }

  openRefModal(deviceId, refIdToEdit) {
    this._refModalDeviceId = deviceId;
    this.cancelEditReference();
    const truck = app.getAllTrucks().find(t => String(t.id) === String(deviceId));
    const db = (this.truckDbCache || []).find(d => String(d.deviceId) === String(deviceId));
    const name = truck?.name || db?.truckName || deviceId;
    const truckNameEl = document.getElementById('refModalTruckName');
    if (truckNameEl) {
      truckNameEl.innerHTML = '<i class="fa-solid fa-truck" style="margin-right:6px; color:var(--primary);"></i> ' + name;
    }
    const titleEl = document.getElementById('refModalTitle');
    if (titleEl) {
      titleEl.textContent = 'Documents — ' + name;
    }
    this._renderRefList(deviceId);
    const modalEl = document.getElementById('vehicleRefModal');
    if (modalEl) modalEl.classList.add('show');
    if (refIdToEdit) {
      setTimeout(() => this.editReference(refIdToEdit), 60);
    }
  }

  closeRefModal() {
    const modalEl = document.getElementById('vehicleRefModal');
    if (modalEl) modalEl.classList.remove('show');
    this._refModalDeviceId = null;
    this.cancelEditReference();
  }

  _renderRefList(deviceId) {
    const refs = this.getRefsForTruck(deviceId);
    const listEl = document.getElementById('refList');
    if (!listEl) return;
    if (refs.length === 0) {
      listEl.innerHTML = '<div style="text-align:center; padding:20px; color:var(--text-muted); font-size:12px;"><i class="fa-solid fa-file-circle-plus" style="font-size:24px; display:block; margin-bottom:6px; opacity:0.3;"></i>Aucun document enregistré pour ce véhicule.</div>';
      return;
    }
    const now = new Date();
    let html = '';
    refs.forEach(ref => {
      const refId = String(ref._id || ref.id || '');
      const expiry = new Date(ref.expiryDate);
      const daysLeft = Math.ceil((expiry - now) / (1000 * 60 * 60 * 24));
      let countdownCls, countdownText;
      if (daysLeft < 0) { countdownCls = 'expired'; countdownText = 'EXPIRÉ (' + Math.abs(daysLeft) + 'j)'; }
      else if (daysLeft <= 30) { countdownCls = 'danger'; countdownText = daysLeft + ' jours'; }
      else if (daysLeft <= 60) { countdownCls = 'warn'; countdownText = daysLeft + ' jours'; }
      else { countdownCls = 'ok'; countdownText = daysLeft + ' jours'; }
      const issueDate = ref.issueDate ? new Date(ref.issueDate).toLocaleDateString('fr-FR') : '—';
      const expiryDate = !isNaN(expiry) ? expiry.toLocaleDateString('fr-FR') : '—';
      html += '<div class="ref-list-item">'
            + '<div class="ref-info">'
            +   '<div class="ref-name">' + (ref.refName || 'Document') + '</div>'
            +   '<div class="ref-details">N°: ' + (ref.refNumber || '—') + ' &nbsp;|&nbsp; Obtenu: ' + issueDate + ' &nbsp;|&nbsp; Expire: ' + expiryDate + (ref.notes ? ' &nbsp;|&nbsp; ' + ref.notes : '') + '</div>'
            + '</div>'
            + '<span class="ref-countdown ' + countdownCls + '">' + countdownText + '</span>'
            + '<div class="ref-actions">'
            +   '<button class="btn-edit" onclick="ui.editReference(\'' + refId + '\')" title="Modifier ce document"><i class="fa-solid fa-pen"></i></button>'
            +   '<button class="btn-del" onclick="ui.deleteReference(\'' + refId + '\')" title="Supprimer ce document"><i class="fa-solid fa-trash"></i></button>'
            + '</div>'
            + '</div>';
    });
    listEl.innerHTML = html;
  }

  editReference(id) {
    const refs = this._vehicleRefs || [];
    const ref = refs.find(r => String(r._id || r.id) === String(id));
    if (!ref) {
      if (window.showToast) showToast('Document introuvable', 'warning');
      return;
    }
    this._editingRefId = id;

    const typeEl = document.getElementById('refType');
    if (typeEl && ref.refName) typeEl.value = ref.refName;
    const numEl = document.getElementById('refNumber');
    if (numEl) numEl.value = ref.refNumber || '';
    const issueEl = document.getElementById('refIssueDate');
    if (issueEl && ref.issueDate) {
      try { issueEl.value = new Date(ref.issueDate).toISOString().split('T')[0]; } catch(e){}
    }
    const expEl = document.getElementById('refExpiryDate');
    if (expEl && ref.expiryDate) {
      try { expEl.value = new Date(ref.expiryDate).toISOString().split('T')[0]; } catch(e){}
    }
    const notesEl = document.getElementById('refNotes');
    if (notesEl) notesEl.value = ref.notes || '';

    // Update form header
    const titleEl = document.getElementById('refFormTitle');
    if (titleEl) {
      titleEl.innerHTML = '<i class="fa-solid fa-pen-to-square" style="color:var(--primary);"></i> Modifier : <b style="margin-left:4px;color:var(--text-primary);">' + (ref.refName || '') + '</b>';
    }
    // Update button text & style
    const saveBtn = document.getElementById('refSaveBtn');
    const saveBtnText = document.getElementById('refSaveBtnText');
    const saveBtnIcon = document.getElementById('refSaveBtnIcon');
    if (saveBtn) {
      saveBtn.style.background = 'linear-gradient(135deg, #0284c7, #0369a1)';
    }
    if (saveBtnText) saveBtnText.textContent = 'Mettre à jour le Document';
    if (saveBtnIcon) saveBtnIcon.className = 'fa-solid fa-arrows-rotate';

    // Show cancel button and delete button
    const cancelBtn = document.getElementById('refCancelEditBtn');
    if (cancelBtn) cancelBtn.style.display = 'inline-flex';
    const deleteBtn = document.getElementById('refDeleteEditBtn');
    if (deleteBtn) deleteBtn.style.display = 'inline-flex';

    // Highlight form container
    const formContainer = document.getElementById('refFormContainer');
    if (formContainer) {
      formContainer.style.border = '2px solid var(--primary)';
      formContainer.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }

  cancelEditReference() {
    this._editingRefId = null;
    const numEl = document.getElementById('refNumber');
    if (numEl) numEl.value = '';
    const notesEl = document.getElementById('refNotes');
    if (notesEl) notesEl.value = '';
    const today = new Date().toISOString().split('T')[0];
    const issueEl = document.getElementById('refIssueDate');
    if (issueEl) issueEl.value = today;
    const nextYear = new Date();
    nextYear.setFullYear(nextYear.getFullYear() + 1);
    const expEl = document.getElementById('refExpiryDate');
    if (expEl) expEl.value = nextYear.toISOString().split('T')[0];

    const titleEl = document.getElementById('refFormTitle');
    if (titleEl) {
      titleEl.innerHTML = '<i class="fa-solid fa-plus-circle" style="color:var(--success);"></i> Ajouter un Document';
    }
    const saveBtn = document.getElementById('refSaveBtn');
    const saveBtnText = document.getElementById('refSaveBtnText');
    const saveBtnIcon = document.getElementById('refSaveBtnIcon');
    if (saveBtn) {
      saveBtn.style.background = 'linear-gradient(135deg, var(--success), #059669)';
    }
    if (saveBtnText) saveBtnText.textContent = 'Enregistrer le Document';
    if (saveBtnIcon) saveBtnIcon.className = 'fa-solid fa-check-circle';

    const cancelBtn = document.getElementById('refCancelEditBtn');
    if (cancelBtn) cancelBtn.style.display = 'none';
    const deleteBtn = document.getElementById('refDeleteEditBtn');
    if (deleteBtn) deleteBtn.style.display = 'none';

    const formContainer = document.getElementById('refFormContainer');
    if (formContainer) formContainer.style.border = '1px dashed var(--border)';
  }

  async saveReference() {
    const deviceId = this._refModalDeviceId;
    if (!deviceId) { alert('Aucun véhicule sélectionné.'); return; }
    const truck = app.getAllTrucks().find(t => String(t.id) === String(deviceId));
    const db = (this.truckDbCache || []).find(d => String(d.deviceId) === String(deviceId));
    const truckName = truck?.name || db?.truckName || deviceId;
    const refName = document.getElementById('refType')?.value;
    const refNumber = document.getElementById('refNumber')?.value || '';
    const issueDate = document.getElementById('refIssueDate')?.value;
    const expiryDate = document.getElementById('refExpiryDate')?.value;
    const notes = document.getElementById('refNotes')?.value || '';
    const alertThreshold = parseInt(document.getElementById('refAlertThreshold')?.value, 10) || 30;
    if (!refName || !expiryDate) { alert("Type et date d'expiration sont requis."); return; }

    const code = localStorage.getItem('fleetAccessCode') || this.currentCode || '';
    const headers = { 'Content-Type': 'application/json', 'x-access-code': code };

    const saveBtn = document.getElementById('refSaveBtn');
    const origBtnHtml = saveBtn ? saveBtn.innerHTML : '';
    if (saveBtn) {
      saveBtn.disabled = true;
      saveBtn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Enregistrement...';
    }

    try {
      let res;
      if (this._editingRefId) {
        // --- UPDATE EXISTING REFERENCE ---
        const payload = {
          id: this._editingRefId,
          deviceId,
          truckName,
          refName,
          refNumber,
          issueDate: issueDate || new Date(),
          expiryDate,
          notes,
          reminderDays: alertThreshold
        };
        try {
          res = await fetch(`${FLEET_CONFIG.API.baseUrl}/api/vehicle-references/${this._editingRefId}`, {
            method: 'PUT',
            headers,
            body: JSON.stringify(payload)
          });
        } catch(err) { res = null; }

        if (!res || !res.ok) {
          res = await fetch(`${FLEET_CONFIG.API.baseUrl}/api/vehicle-references/update`, {
            method: 'POST',
            headers,
            body: JSON.stringify(payload)
          });
        }
      } else {
        // --- CREATE NEW REFERENCE ---
        res = await fetch(`${FLEET_CONFIG.API.baseUrl}/api/vehicle-references`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ deviceId, truckName, refName, refNumber, issueDate: issueDate || new Date(), expiryDate, notes, reminderDays: alertThreshold })
        });
      }

      if (res && res.ok) {
        const wasEditing = !!this._editingRefId;
        this.cancelEditReference();
        await this.loadVehicleReferences();
        if (this._refModalDeviceId) this._renderRefList(this._refModalDeviceId);
        this.renderTrucks();
        this.renderStats();
        if (this._docPanelOpen) this.renderDocPanel();
        const msg = wasEditing ? '✅ Document mis à jour avec succès !' : '✅ Document enregistré !';
        if (window.showToast) showToast(msg, 'success');
        else alert(msg);
      } else {
        const errData = res ? await res.json().catch(() => ({})) : {};
        alert('Erreur serveur: ' + (errData.error || ('HTTP ' + (res ? res.status : 'Connexion'))));
      }
    } catch (e) {
      alert('Erreur connexion: ' + e.message);
    } finally {
      if (saveBtn) {
        saveBtn.disabled = false;
        saveBtn.innerHTML = origBtnHtml;
      }
    }
  }

  deleteReference(id) {
    if (!id) return;
    const ref = (this._vehicleRefs || []).find(r => String(r._id || r.id) === String(id));
    const refName = ref?.refName || 'ce document';
    const refNumber = ref?.refNumber ? ` (N° ${ref.refNumber})` : '';
    const truckName = ref?.truckName ? ` pour <b>${ref.truckName}</b>` : '';

    this._pendingDeleteRefId = id;

    const modal = document.getElementById('modalConfirmDeleteDoc');
    const textEl = document.getElementById('confirmDeleteDocText');
    const btn = document.getElementById('btnConfirmDeleteDoc');

    if (textEl) {
      textEl.innerHTML = `Êtes-vous sûr de vouloir supprimer le document <b style="color:var(--text-primary);">${refName}</b>${refNumber}${truckName} ?<br><span style="font-size:11px;color:#ef4444;font-weight:600;display:inline-block;margin-top:4px;">⚠️ Cette action est irréversible.</span>`;
    }
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<i class="fa-solid fa-trash"></i> Oui, Supprimer';
    }

    if (modal) {
      modal.style.display = 'flex';
    } else {
      // Direct fallback
      if (confirm(`Êtes-vous sûr de vouloir supprimer ${refName} ?`)) {
        this.executeDeleteReference(id);
      }
    }
  }

  closeConfirmDeleteDoc() {
    const modal = document.getElementById('modalConfirmDeleteDoc');
    if (modal) modal.style.display = 'none';
    this._pendingDeleteRefId = null;
  }

  async confirmExecuteDeleteDoc() {
    const id = this._pendingDeleteRefId;
    if (!id) {
      this.closeConfirmDeleteDoc();
      return;
    }
    const btn = document.getElementById('btnConfirmDeleteDoc');
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Suppression...';
    }
    await this.executeDeleteReference(id);
    this.closeConfirmDeleteDoc();
  }

  async executeDeleteReference(id) {
    if (!id) return;
    const ref = (this._vehicleRefs || []).find(r => String(r._id || r.id) === String(id));
    const deviceId = ref?.deviceId || this._refModalDeviceId || '';
    const refName = ref?.refName || '';

    // Immediately remove from local memory for instant zero-lag UI response
    const previousRefs = this._vehicleRefs ? [...this._vehicleRefs] : [];
    if (this._vehicleRefs) {
      this._vehicleRefs = this._vehicleRefs.filter(r => String(r._id || r.id) !== String(id));
    }
    if (this._editingRefId === id) {
      this.cancelEditReference();
    }
    if (this._refModalDeviceId) this._renderRefList(this._refModalDeviceId);
    this.renderTrucks();
    this.renderStats();
    if (this._docPanelOpen) this.renderDocPanel();

    const code = localStorage.getItem('fleetAccessCode') || this.currentCode || '';
    const headers = { 'Content-Type': 'application/json', 'x-access-code': code };
    const payload = JSON.stringify({ id, deviceId, refName });

    try {
      let res;
      // 1. Primary: POST /api/vehicle-references/delete (always supported through proxies & firewalls)
      try {
        res = await fetch(`${FLEET_CONFIG.API.baseUrl}/api/vehicle-references/delete`, {
          method: 'POST',
          headers,
          body: payload
        });
      } catch(err) { res = null; }

      // 2. Fallback: DELETE /api/vehicle-references/:id
      if (!res || !res.ok) {
        try {
          res = await fetch(`${FLEET_CONFIG.API.baseUrl}/api/vehicle-references/${encodeURIComponent(id)}`, {
            method: 'DELETE',
            headers
          });
        } catch(err) { res = null; }
      }

      // 3. Fallback: POST /api/vehicle-references/:id/delete
      if (!res || !res.ok) {
        res = await fetch(`${FLEET_CONFIG.API.baseUrl}/api/vehicle-references/${encodeURIComponent(id)}/delete`, {
          method: 'POST',
          headers,
          body: payload
        });
      }

      if (res && res.ok) {
        await this.loadVehicleReferences();
        if (this._refModalDeviceId) this._renderRefList(this._refModalDeviceId);
        this.renderTrucks();
        this.renderStats();
        if (this._docPanelOpen) this.renderDocPanel();
        if (window.showToast) showToast('🗑️ Document supprimé avec succès', 'success');
        else alert('🗑️ Document supprimé avec succès');
      } else {
        // Rollback memory if server failed
        this._vehicleRefs = previousRefs;
        if (this._refModalDeviceId) this._renderRefList(this._refModalDeviceId);
        this.renderTrucks();
        this.renderStats();
        if (this._docPanelOpen) this.renderDocPanel();
        const errData = res ? await res.json().catch(() => ({})) : {};
        const msg = errData.error || ('HTTP ' + (res ? res.status : 'Connexion'));
        if (window.showToast) showToast('Erreur suppression: ' + msg, 'error');
        else alert('Erreur suppression: ' + msg);
      }
    } catch (e) {
      this._vehicleRefs = previousRefs;
      if (this._refModalDeviceId) this._renderRefList(this._refModalDeviceId);
      this.renderTrucks();
      this.renderStats();
      if (this._docPanelOpen) this.renderDocPanel();
      if (window.showToast) showToast('Erreur: ' + e.message, 'error');
      else alert('Erreur: ' + e.message);
    }
  }


  // ─── IMMOBILISATION ALERT SYSTEM ──────────────────────────────────
  // Rules: FLEET_CONFIG.IMMOBIL_RULES = [{id, zoneName, minMinutes, enabled}]

  openImmobilRuleEditor(editIdx) {
    const locs = FLEET_CONFIG.CUSTOM_LOCATIONS || [];
    const rules = FLEET_CONFIG.IMMOBIL_RULES || [];
    const existing = (editIdx !== undefined) ? rules[editIdx] : null;
    document.getElementById('immobilEditorModal')?.remove();

    const zoneOpts = locs.map(z =>
      `<option value="${z.name}"${existing && existing.zoneName === z.name ? ' selected' : ''}>${z.name}</option>`
    ).join('');

    const fld = 'width:100%;background:var(--bg-elevated,var(--bg-elevated, #1e293b));border:1px solid var(--border,var(--border, rgba(255,255,255,0.1)));border-radius:8px;padding:10px 12px;color:var(--text-primary,var(--text-primary, #e2e8f0));font-size:13px;box-sizing:border-box;outline:none;';
    const lbl = 'font-size:11px;font-weight:800;color:var(--text-muted,var(--text-muted, #64748b));text-transform:uppercase;display:block;margin-bottom:5px;';

    const m = document.createElement('div');
    m.id = 'immobilEditorModal';
    m.style.cssText = 'position:fixed;inset:0;z-index:999999;background:rgba(0,0,0,0.65);display:flex;align-items:center;justify-content:center;backdrop-filter:blur(10px);';
    m.innerHTML = `<div style="background:var(--bg-surface,var(--bg-elevated, #1e293b));border:1px solid var(--border,var(--border, rgba(255,255,255,0.1)));border-radius:16px;width:430px;max-width:94vw;padding:24px;box-shadow:0 24px 64px rgba(0,0,0,0.5);">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:20px;">
        <div style="width:38px;height:38px;background:rgba(249,115,22,0.15);border-radius:10px;display:flex;align-items:center;justify-content:center;color:#f97316;font-size:17px;"><i class="fa-solid fa-parking"></i></div>
        <div style="flex:1;">
          <div style="font-weight:800;font-size:15px;color:var(--text-primary,var(--text-primary, #e2e8f0));">${existing ? 'Modifier' : 'Nouvelle'} Alerte Immobilisation</div>
          <div style="font-size:11px;color:var(--text-muted,var(--text-muted, #64748b));margin-top:2px;">Notification si un camion reste trop longtemps dans une zone</div>
        </div>
        <button onclick="document.getElementById('immobilEditorModal').remove()" style="background:none;border:none;color:var(--text-muted,var(--text-muted, #64748b));font-size:18px;cursor:pointer;">&#x2715;</button>
      </div>
      <div style="display:flex;flex-direction:column;gap:13px;">
        <div>
          <label style="${lbl}">Zone a surveiller *</label>
          <select id="immobil_zone" style="${fld}">
            <option value="">-- Choisir une zone --</option>${zoneOpts}
          </select>
        </div>
        <div>
          <label style="${lbl}">Duree minimum avant alerte (minutes) *</label>
          <input id="immobil_min" type="number" min="5" max="1440" value="${existing ? existing.minMinutes : 30}" style="${fld}">
          <div style="font-size:10px;color:var(--text-muted,var(--text-muted, #64748b));margin-top:4px;"><i class="fa-solid fa-circle-info" style="margin-right:3px;"></i> Ex: 30 = alerte si un camion est dans la zone depuis plus de 30 min</div>
        </div>
        <div style="display:flex;align-items:center;gap:8px;">
          <input type="checkbox" id="immobil_enabled" ${!existing || existing.enabled ? 'checked' : ''} style="width:16px;height:16px;cursor:pointer;accent-color:#f97316;">
          <label for="immobil_enabled" style="font-size:13px;color:var(--text-primary,var(--text-primary, #e2e8f0));cursor:pointer;font-weight:600;">Regle active</label>
        </div>
      </div>
      <div style="display:flex;gap:8px;margin-top:20px;">
        <button onclick="document.getElementById('immobilEditorModal').remove()" style="flex:1;background:var(--bg-elevated,var(--border, rgba(255,255,255,0.05)));border:1px solid var(--border,var(--border, rgba(255,255,255,0.1)));color:var(--text-secondary,var(--text-muted, #94a3b8));border-radius:9px;padding:11px;font-size:13px;font-weight:700;cursor:pointer;">Annuler</button>
        <button onclick="ui._saveImmobilRule(${editIdx !== undefined ? editIdx : 'undefined'})" style="flex:2;background:linear-gradient(135deg,#f97316,#ea580c);color:white;border:none;border-radius:9px;padding:11px;font-size:13px;font-weight:800;cursor:pointer;box-shadow:0 4px 14px rgba(249,115,22,0.3);"><i class="fa-solid fa-check" style="margin-right:6px;"></i>Enregistrer</button>
      </div>
    </div>`;
    document.body.appendChild(m);
    m.addEventListener('click', e => { if (e.target === m) m.remove(); });
  }

  _saveImmobilRule(editIdx) {
    const zoneName   = document.getElementById('immobil_zone')?.value;
    const minMinutes = parseInt(document.getElementById('immobil_min')?.value) || 30;
    const enabled    = document.getElementById('immobil_enabled')?.checked !== false;
    if (!zoneName) return alert('Veuillez choisir une zone.');
    if (!FLEET_CONFIG.IMMOBIL_RULES) FLEET_CONFIG.IMMOBIL_RULES = [];
    const rule = { id: 'ir_' + Date.now(), zoneName, minMinutes, enabled };
    if (editIdx !== undefined && FLEET_CONFIG.IMMOBIL_RULES[editIdx]) {
      FLEET_CONFIG.IMMOBIL_RULES[editIdx] = { ...FLEET_CONFIG.IMMOBIL_RULES[editIdx], ...rule };
    } else {
      FLEET_CONFIG.IMMOBIL_RULES.push(rule);
    }
    this.saveSettingsToCloud();
    this.renderImmobilRules();
    document.getElementById('immobilEditorModal')?.remove();
    if (window.showToast) showToast('Regle immobilisation sauvegardee', 'success');
    this.startImmobilPoller();
  }

  renderImmobilRules() {
    const list = document.getElementById('immobilRulesList');
    if (!list) return;
    const rules = FLEET_CONFIG.IMMOBIL_RULES || [];
    if (!rules.length) {
      list.innerHTML = '<div style="font-size:11px;color:var(--text-muted,var(--text-muted, #64748b));text-align:center;padding:8px 0;">Aucune regle definie.</div>';
      return;
    }
    list.innerHTML = rules.map((r, i) =>
      `<div style="background:var(--bg-elevated,var(--bg-elevated, rgba(255,255,255,0.04)));border:1px solid var(--border,var(--border, rgba(255,255,255,0.08)));border-radius:8px;padding:9px 12px;display:flex;align-items:center;gap:8px;font-size:12px;opacity:${r.enabled ? 1 : 0.5};">
        <i class="fa-solid fa-parking" style="color:#f97316;flex-shrink:0;font-size:14px;"></i>
        <div style="flex:1;min-width:0;">
          <div style="font-weight:700;color:var(--text-primary,var(--text-primary, #e2e8f0));overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${r.zoneName}</div>
          <div style="font-size:10px;color:var(--text-muted,var(--text-muted, #64748b));">Alerte apres <b style="color:#f97316;">${r.minMinutes} min</b>${r.enabled ? '' : ' <em>(desactivee)</em>'}</div>
        </div>
        <button onclick="ui.openImmobilRuleEditor(${i})" title="Modifier" style="background:rgba(56,189,248,0.08);border:1px solid rgba(56,189,248,0.2);color:#38bdf8;border-radius:6px;width:26px;height:26px;cursor:pointer;font-size:10px;flex-shrink:0;"><i class="fa-solid fa-pen"></i></button>
        <button onclick="FLEET_CONFIG.IMMOBIL_RULES.splice(${i},1);ui.saveSettingsToCloud();ui.renderImmobilRules();" title="Supprimer" style="background:rgba(239,68,68,0.08);border:1px solid rgba(239,68,68,0.2);color:#f87171;border-radius:6px;width:26px;height:26px;cursor:pointer;font-size:10px;flex-shrink:0;"><i class="fa-solid fa-trash"></i></button>
      </div>`
    ).join('');
  }

  startImmobilPoller() {
    if (this._immobilPollerInterval) clearInterval(this._immobilPollerInterval);
    if (!this._immobilFiredCache) this._immobilFiredCache = new Map();
    const INTERVAL_MS = 5 * 60 * 1000;
    const REFIRE_COOLDOWN = 60 * 60 * 1000; // 1 hour between same alerts

    const check = async () => {
      const rules = (FLEET_CONFIG.IMMOBIL_RULES || []).filter(r => r.enabled);
      if (!rules.length) return;
      
      try {
        const res = await fetch(FLEET_CONFIG.API.baseUrl + '/api/zone-events/active', { headers: { 'x-access-code': this.currentCode || localStorage.getItem('fleetAccessCode') || '' }});
        if (!res.ok) return;
        const data = await res.json();
        const activeEvents = data.activeEvents || [];
        if (!activeEvents.length) return;
        
        rules.forEach(rule => {
          // Find all trucks currently occupying this rule's zone
          const trucksInZone = activeEvents.filter(e => e.zoneName === rule.zoneName);
          
          trucksInZone.forEach(evt => {
            if (!evt.entryTime) return;
            const entryMs = new Date(evt.entryTime).getTime();
            const dwellMs = Date.now() - entryMs;
            const dwellMin = dwellMs / 60000;
            
            if (dwellMin < rule.minMinutes) return;

            // Rate-limit per truck+zone pair
            const cacheKey = String(evt.deviceId || evt.truckName) + '||' + rule.zoneName;
            const lastFire = this._immobilFiredCache.get(cacheKey) || 0;
            if (Date.now() - lastFire < REFIRE_COOLDOWN) return;
            this._immobilFiredCache.set(cacheKey, Date.now());

            const h = Math.floor(dwellMin / 60);
            const m = Math.round(dwellMin % 60);
            const durStr = h > 0 ? `${h}h${String(m).padStart(2,'0')}min` : `${Math.round(dwellMin)} min`;
            const severity = dwellMin > rule.minMinutes * 3 ? 'critical' : 'warning';

            if (window.pushNotification) {
              window.pushNotification('immobilisation', {
                title: `\u23f1\ufe0f Immobilisation: ${evt.truckName}`,
                body: `${evt.truckName} est immobile dans "${rule.zoneName}" depuis ${durStr}`,
                severity,
                truckName: evt.truckName,
                deviceId: evt.deviceId,
                meta: { zone: rule.zoneName, dwell: durStr }
              });
            }
            // Toast handled by pushNotification
          });
        });
      } catch(e) { console.error('ImmobilPoller Error:', e.message); }
    };

    check();
    this._immobilPollerInterval = setInterval(check, INTERVAL_MS);
  }

  // ─── CLIENT EDITOR POPUP ─────────────────────────────────────────────────
  openClientEditorModal(clientIdx) {
    document.getElementById('clientEditorModal')?.remove();
    if (!FLEET_CONFIG.CLIENTS) FLEET_CONFIG.CLIENTS = [];
    const isNew = (clientIdx === undefined || clientIdx === null);
    const client = isNew
      ? { id: 'co_' + Date.now(), name: '', color: '#3b82f6', finalClients: [] }
      : JSON.parse(JSON.stringify(FLEET_CONFIG.CLIENTS[clientIdx]));
    if (!client.finalClients) client.finalClients = [];
    const fld = 'width:100%;background:var(--bg-elevated,var(--bg-elevated, #1e293b));border:1px solid var(--border,var(--border, rgba(255,255,255,0.1)));border-radius:8px;padding:10px 12px;color:var(--text-primary,var(--text-primary, #e2e8f0));font-size:13px;box-sizing:border-box;outline:none;';
    const lbl = 'font-size:10px;font-weight:800;color:var(--text-muted,var(--text-muted, #64748b));text-transform:uppercase;display:block;margin-bottom:5px;';

    const renderFCList = () => {
      const el = document.getElementById('ceFCList'); if (!el) return;
      if (!client.finalClients.length) {
        el.innerHTML = '<div style="text-align:center;padding:20px;color:var(--text-muted,var(--text-muted, #64748b));font-size:12px;"><i class="fa-solid fa-users" style="display:block;font-size:22px;margin-bottom:8px;opacity:0.3;"></i>Aucun client final. Cliquez + pour en ajouter.</div>';
        return;
      }
      el.innerHTML = client.finalClients.map((fc, j) => {
        const dot = fc.color || client.color || '#3b82f6';
        return '<div style="display:flex;align-items:center;gap:8px;padding:9px 11px;background:var(--bg-elevated,var(--bg-elevated, rgba(255,255,255,0.04)));border:1px solid var(--border,var(--border, rgba(255,255,255,0.08)));border-radius:8px;margin-bottom:5px;">' +
          '<span class="ceColorDot" style="width:10px;height:10px;border-radius:50%;background:' + dot + ';flex-shrink:0;"></span>' +
          '<div style="flex:1;min-width:0;"><div style="font-weight:700;font-size:12px;color:var(--text-primary,var(--text-primary, #e2e8f0));white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + fc.name + '</div>' +
          (fc.lat ? '<div style="font-size:10px;color:var(--text-muted,var(--text-muted, #64748b));">' + fc.lat.toFixed(5) + ', ' + fc.lng.toFixed(5) + '</div>' : '') + '</div>' +
          '<button onclick="ui._cePickFCLocation(' + j + ')" title="Pointer sur carte" style="background:rgba(56,189,248,0.08);border:1px solid rgba(56,189,248,0.2);color:#38bdf8;border-radius:6px;width:26px;height:26px;cursor:pointer;font-size:11px;flex-shrink:0;"><i class="fa-solid fa-crosshairs"></i></button>' +
          '<button onclick="ui._ceRemoveFC(' + j + ')" style="background:rgba(239,68,68,0.08);border:1px solid rgba(239,68,68,0.2);color:#f87171;border-radius:6px;width:26px;height:26px;cursor:pointer;font-size:11px;flex-shrink:0;"><i class="fa-solid fa-trash"></i></button></div>';
      }).join('');
    };

    const m = document.createElement('div');
    m.id = 'clientEditorModal';
    m.style.cssText = 'position:fixed;inset:0;z-index:999999;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;backdrop-filter:blur(12px);padding:16px;';
    const idxStr = String(isNew ? 'null' : clientIdx);
    m.innerHTML = '<div style="background:var(--bg-surface,var(--bg-elevated, #1e293b));border:1px solid var(--border,var(--border, rgba(255,255,255,0.1)));border-radius:18px;width:560px;max-width:95vw;max-height:88vh;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 30px 80px rgba(0,0,0,0.5);">' +
      '<div style="padding:18px 20px;border-bottom:1px solid var(--border,var(--border, rgba(255,255,255,0.08)));display:flex;align-items:center;gap:10px;flex-shrink:0;background:var(--bg-elevated,rgba(0,0,0,0.1));">' +
        '<div style="width:38px;height:38px;background:linear-gradient(135deg,#3b82f6,#6366f1);border-radius:10px;display:flex;align-items:center;justify-content:center;"><i class="fa-solid fa-building" style="color:white;font-size:17px;"></i></div>' +
        '<div style="flex:1;"><div style="font-weight:800;font-size:15px;color:var(--text-primary,var(--text-primary, #e2e8f0));">' + (isNew ? 'Nouveau Client' : 'Modifier Client') + '</div>' +
        '<div style="font-size:11px;color:var(--text-muted,var(--text-muted, #64748b));margin-top:2px;">La couleur s\'applique au client et ses clients finaux</div></div>' +
        '<button onclick="document.getElementById(\'clientEditorModal\').remove()" style="background:none;border:none;color:var(--text-muted,var(--text-muted, #64748b));font-size:18px;cursor:pointer;">\u00d7</button>' +
      '</div>' +
      '<div style="flex:1;overflow-y:auto;padding:18px 20px;">' +
        '<div style="display:grid;grid-template-columns:1fr auto;gap:10px;margin-bottom:16px;align-items:end;">' +
          '<div><label style="' + lbl + '">Nom du Client *</label><input id="ce_name" value="' + client.name.replace(/"/g, '&quot;') + '" placeholder="Ex: Sonatrach" style="' + fld + '"></div>' +
          '<div><label style="' + lbl + '">Couleur</label><div style="display:flex;align-items:center;gap:8px;">' +
            '<input id="ce_color" type="color" value="' + (client.color || '#3b82f6') + '" oninput="document.querySelectorAll(\'.ceColorDot\').forEach(d=>d.style.background=this.value)" style="width:42px;height:42px;border:1px solid var(--border,var(--border, rgba(255,255,255,0.1)));border-radius:9px;cursor:pointer;padding:3px;background:var(--bg-elevated,var(--bg-elevated, #1e293b));">' +
            '<span class="ceColorDot" style="width:14px;height:14px;border-radius:50%;background:' + (client.color || '#3b82f6') + ';"></span></div></div>' +
        '</div>' +
        '<div style="border-top:1px solid rgba(255,255,255,0.07);margin:12px 0 8px;"></div>' +
        '<div style="font-size:10px;font-weight:800;color:var(--text-muted, #64748b);text-transform:uppercase;letter-spacing:.08em;margin-bottom:10px;">Icone & Identite</div>' +
        '<div style="display:grid;grid-template-columns:auto 1fr 1fr;gap:10px;margin-bottom:12px;align-items:end;">' +
          '<div><label style="' + lbl + '">Icone</label>' +
          '<div id="ce_icon_grid" style="display:flex;flex-wrap:wrap;gap:4px;padding:6px;background:rgba(0,0,0,0.2);border-radius:7px;border:1px solid var(--border, rgba(255,255,255,0.08));width:112px;">' +
          '<button class="ce-icn-btn" data-icon="fa-user-tie" title="fa-user-tie" style="width:26px;height:26px;border-radius:5px;border:1px solid var(--border, rgba(255,255,255,0.1));background:var(--bg-elevated, rgba(255,255,255,0.04));color:var(--text-muted, #94a3b8);cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:12px;"><i class="fa-solid fa-user-tie"></i></button>' +
          '<button class="ce-icn-btn" data-icon="fa-building" title="fa-building" style="width:26px;height:26px;border-radius:5px;border:1px solid var(--border, rgba(255,255,255,0.1));background:var(--bg-elevated, rgba(255,255,255,0.04));color:var(--text-muted, #94a3b8);cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:12px;"><i class="fa-solid fa-building"></i></button>' +
          '<button class="ce-icn-btn" data-icon="fa-industry" title="fa-industry" style="width:26px;height:26px;border-radius:5px;border:1px solid var(--border, rgba(255,255,255,0.1));background:var(--bg-elevated, rgba(255,255,255,0.04));color:var(--text-muted, #94a3b8);cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:12px;"><i class="fa-solid fa-industry"></i></button>' +
          '<button class="ce-icn-btn" data-icon="fa-truck" title="fa-truck" style="width:26px;height:26px;border-radius:5px;border:1px solid var(--border, rgba(255,255,255,0.1));background:var(--bg-elevated, rgba(255,255,255,0.04));color:var(--text-muted, #94a3b8);cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:12px;"><i class="fa-solid fa-truck"></i></button>' +
          '<button class="ce-icn-btn" data-icon="fa-handshake" title="fa-handshake" style="width:26px;height:26px;border-radius:5px;border:1px solid var(--border, rgba(255,255,255,0.1));background:var(--bg-elevated, rgba(255,255,255,0.04));color:var(--text-muted, #94a3b8);cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:12px;"><i class="fa-solid fa-handshake"></i></button>' +
          '<button class="ce-icn-btn" data-icon="fa-oil-well" title="fa-oil-well" style="width:26px;height:26px;border-radius:5px;border:1px solid var(--border, rgba(255,255,255,0.1));background:var(--bg-elevated, rgba(255,255,255,0.04));color:var(--text-muted, #94a3b8);cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:12px;"><i class="fa-solid fa-oil-well"></i></button>' +
          '<button class="ce-icn-btn" data-icon="fa-gas-pump" title="fa-gas-pump" style="width:26px;height:26px;border-radius:5px;border:1px solid var(--border, rgba(255,255,255,0.1));background:var(--bg-elevated, rgba(255,255,255,0.04));color:var(--text-muted, #94a3b8);cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:12px;"><i class="fa-solid fa-gas-pump"></i></button>' +
          '<button class="ce-icn-btn" data-icon="fa-warehouse" title="fa-warehouse" style="width:26px;height:26px;border-radius:5px;border:1px solid var(--border, rgba(255,255,255,0.1));background:var(--bg-elevated, rgba(255,255,255,0.04));color:var(--text-muted, #94a3b8);cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:12px;"><i class="fa-solid fa-warehouse"></i></button>' +
          '<button class="ce-icn-btn" data-icon="fa-star" title="fa-star" style="width:26px;height:26px;border-radius:5px;border:1px solid var(--border, rgba(255,255,255,0.1));background:var(--bg-elevated, rgba(255,255,255,0.04));color:var(--text-muted, #94a3b8);cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:12px;"><i class="fa-solid fa-star"></i></button>' +
          '<button class="ce-icn-btn" data-icon="fa-bolt" title="fa-bolt" style="width:26px;height:26px;border-radius:5px;border:1px solid var(--border, rgba(255,255,255,0.1));background:var(--bg-elevated, rgba(255,255,255,0.04));color:var(--text-muted, #94a3b8);cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:12px;"><i class="fa-solid fa-bolt"></i></button>' +
          '<button class="ce-icn-btn" data-icon="fa-boxes-stacked" title="fa-boxes-stacked" style="width:26px;height:26px;border-radius:5px;border:1px solid var(--border, rgba(255,255,255,0.1));background:var(--bg-elevated, rgba(255,255,255,0.04));color:var(--text-muted, #94a3b8);cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:12px;"><i class="fa-solid fa-boxes-stacked"></i></button>' +
          '<button class="ce-icn-btn" data-icon="fa-gear" title="fa-gear" style="width:26px;height:26px;border-radius:5px;border:1px solid var(--border, rgba(255,255,255,0.1));background:var(--bg-elevated, rgba(255,255,255,0.04));color:var(--text-muted, #94a3b8);cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:12px;"><i class="fa-solid fa-gear"></i></button>' +
          '<input type="hidden" id="ce_icon_val" value="' + (client.icon||'fa-user-tie') + '">' +
          '</div></div>' +
          '<div style="width:60px;"><label style="' + lbl + '">Emoji</label><input id="ce_emoji" value="' + (client.iconEmoji||'') + '" maxlength="4" style="' + fld + 'text-align:center;font-size:18px;"></div>' +
          '<div style="width:70px;"><label style="' + lbl + '">Sigle 2L</label><input id="ce_logo" value="' + (client.logoText||'') + '" maxlength="2" style="' + fld + 'text-align:center;font-size:18px;font-weight:800;text-transform:uppercase;"></div>' +
        '</div>' +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px;">' +
          '<div><label style="' + lbl + '">Secteur</label><input id="ce_industry" value="' + (client.industry||'') + '" placeholder="Batiment, petrole..." style="' + fld + '"></div>' +
          '<div><label style="' + lbl + '">Telephone</label><input id="ce_phone" value="' + (client.phone||'') + '" placeholder="+213..." style="' + fld + '"></div>' +
          '<div><label style="' + lbl + '">Email</label><input id="ce_email" value="' + (client.email||'') + '" placeholder="contact@..." style="' + fld + '"></div>' +
          '<div><label style="' + lbl + '">Adresse</label><input id="ce_address" value="' + (client.address||'') + '" placeholder="Wilaya, ville..." style="' + fld + '"></div>' +
        '</div>' +
        '<div style="margin-bottom:10px;"><label style="' + lbl + '">Notes</label><textarea id="ce_notes" rows="2" style="' + fld + 'resize:none;">' + (client.notes||'') + '</textarea></div>' +
        '<div style="border-top:1px solid rgba(255,255,255,0.07);margin:10px 0;"></div>' +
        '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">' +
          '<div style="font-size:11px;font-weight:800;color:var(--text-muted,var(--text-muted, #64748b));text-transform:uppercase;">Clients Finaux</div>' +
          '<button onclick="ui._ceAddFC()" style="background:linear-gradient(135deg,#8b5cf6,#6366f1);color:white;border:none;border-radius:7px;padding:5px 12px;font-size:12px;font-weight:700;cursor:pointer;display:inline-flex;align-items:center;gap:5px;"><i class="fa-solid fa-plus"></i> Ajouter</button>' +
        '</div>' +
        '<div id="ceFCList" style="max-height:260px;overflow-y:auto;"></div>' +
      '</div>' +
      '<div style="padding:14px 20px;border-top:1px solid var(--border,var(--border, rgba(255,255,255,0.08)));display:flex;gap:8px;flex-shrink:0;background:var(--bg-surface,rgba(0,0,0,0.2));">' +
        (!isNew ? '<button onclick="ui._deleteClientEditor(' + idxStr + ')" style="background:rgba(239,68,68,0.1);color:#f87171;border:1px solid rgba(239,68,68,0.25);border-radius:9px;padding:11px;font-weight:700;cursor:pointer;font-size:13px;flex-shrink:0;width:44px;display:flex;align-items:center;justify-content:center;transition:all 0.2s;" onmouseover="this.style.background=\'#ef4444\';this.style.color=\'white\'" onmouseout="this.style.background=\'rgba(239,68,68,0.1)\';this.style.color=\'#f87171\'" title="Supprimer ce client"><i class="fa-solid fa-trash"></i></button>' : '') +
        '<button onclick="document.getElementById(\'clientEditorModal\').remove()" style="flex:1;background:var(--bg-elevated,var(--border, rgba(255,255,255,0.05)));border:1px solid var(--border,var(--border, rgba(255,255,255,0.1)));color:var(--text-secondary,var(--text-muted, #94a3b8));border-radius:9px;padding:11px;font-weight:700;cursor:pointer;font-size:13px;transition:background 0.2s;" onmouseover="this.style.background=\'rgba(255,255,255,0.1)\'" onmouseout="this.style.background=\'var(--bg-elevated,rgba(255,255,255,0.05))\'">Annuler</button>' +
        '<button onclick="ui._saveClientEditor(' + idxStr + ')" style="flex:2;background:linear-gradient(135deg,#3b82f6,#6366f1);color:white;border:none;border-radius:9px;padding:11px;font-weight:800;cursor:pointer;font-size:13px;box-shadow:0 4px 14px rgba(59,130,246,0.3);transition:transform 0.1s;" onmousedown="this.style.transform=\'scale(0.98)\'" onmouseup="this.style.transform=\'scale(1)\'"><i class="fa-solid fa-check" style="margin-right:6px;"></i>Enregistrer</button>' +
      '</div></div>';
    document.body.appendChild(m);
    m.addEventListener('click', e => { if (e.target === m) m.remove(); });
    // Icon grid click delegation (avoids inline onclick quoting issues)
    const _ceGrid = m.querySelector('#ce_icon_grid');
    if (_ceGrid) _ceGrid.addEventListener('click', e => {
      const btn = e.target.closest('.ce-icn-btn');
      if (btn) this._cePick(btn, btn.dataset.icon);
    });
    this._ceClient = client;
    this._ceClientIdx = isNew ? null : clientIdx;
    this._ceRenderFCList = renderFCList;
    renderFCList();
  }

  _addCompany() { this.openClientEditorModal(null); }

  _cePick(btn, icon) {
    if (!icon && btn && btn.dataset) icon = btn.dataset.icon;
    if (!icon) return;
    const modal = document.getElementById('clientEditorModal');
    const inp = modal ? modal.querySelector('#ce_icon_val') : document.getElementById('ce_icon_val');
    if (inp) inp.value = icon;
    const grid = modal ? modal.querySelector('#ce_icon_grid') : document.getElementById('ce_icon_grid');
    if (grid) grid.querySelectorAll('.ce-icn-btn').forEach(b => {
      const s = b.dataset.icon === icon;
      b.style.border = s ? '2px solid #3b82f6' : '1px solid var(--border, rgba(255,255,255,0.1))';
      b.style.background = s ? 'rgba(59,130,246,0.2)' : 'var(--bg-elevated, rgba(255,255,255,0.04))';
      b.style.color = s ? '#60a5fa' : 'var(--text-muted, #94a3b8)';
    });
  }

  _deleteClientEditor(idx) {
    if(idx === null || idx === undefined) return;
    const clients = FLEET_CONFIG.CLIENTS || [];
    if(!clients[idx]) return;
    if(!confirm('Êtes-vous sûr de vouloir supprimer définitivement le client : ' + clients[idx].name + ' ?\n\nAttention : Tous ses sous-clients seront également supprimés. Les sites associés perdront leur affiliation.')) return;
    
    const id = clients[idx].id;
    clients.splice(idx, 1);
    
    // Detach from custom locations
    if (FLEET_CONFIG.CUSTOM_LOCATIONS) {
        FLEET_CONFIG.CUSTOM_LOCATIONS.forEach(z => { 
            if(z.clientId === id){ z.clientId = null; z.finalClientId = null; } 
        });
    }
    
    this.saveSettingsToCloud();
    if (window.AlgeriaMap) window.AlgeriaMap.renderCustomLocations();
    document.getElementById('clientEditorModal')?.remove();
    this.openZoneManagementModal('clients');
    if (window.showToast) showToast('Client supprimé avec succès', 'success');
  }

  _ceAddFC() {
    const name = prompt('Nom du client final :');
    if (!name || !name.trim()) return;
    this._ceClient.finalClients.push({ id: 'fc_' + Date.now(), name: name.trim(), color: this._ceClient.color || '#3b82f6', lat: null, lng: null });
    if (this._ceRenderFCList) this._ceRenderFCList();
  }

  _ceRemoveFC(j) {
    if (!confirm('Supprimer ce client final ?')) return;
    this._ceClient.finalClients.splice(j, 1);
    if (this._ceRenderFCList) this._ceRenderFCList();
  }

  _cePickFCLocation(j) {
    this._mapPickerOpts = { forFC: true, fcIdx: j };
    document.getElementById('clientEditorModal') && (document.getElementById('clientEditorModal').style.display = 'none');
    document.getElementById('zmEditOverlay') && (document.getElementById('zmEditOverlay').style.display = 'none');
    this._startZoneMapPicker({ forFC: true, fcIdx: j });
  }

  _saveClientEditor(idx) {
    const name      = document.getElementById('ce_name')?.value?.trim();
    const color     = document.getElementById('ce_color')?.value || '#3b82f6';
    const icon      = document.getElementById('ce_icon_val')?.value || 'fa-user-tie';
    const iconEmoji = (document.getElementById('ce_emoji')?.value || '').trim();
    const logoText  = (document.getElementById('ce_logo')?.value || '').trim().substring(0,2).toUpperCase();
    const industry  = (document.getElementById('ce_industry')?.value || '').trim();
    const phone     = (document.getElementById('ce_phone')?.value || '').trim();
    const email     = (document.getElementById('ce_email')?.value || '').trim();
    const address   = (document.getElementById('ce_address')?.value || '').trim();
    const notes     = (document.getElementById('ce_notes')?.value || '').trim();
    if (!name) return alert('Nom requis.');
    if (!FLEET_CONFIG.CLIENTS) FLEET_CONFIG.CLIENTS = [];
    const fcs = (this._ceClient.finalClients || []).map(fc => ({ ...fc }));
    const saved = { ...this._ceClient, name, color, icon, iconEmoji, logoText, industry, phone, email, address, notes, finalClients: fcs };
    if (idx === null || idx === undefined || idx === 'null') {
      FLEET_CONFIG.CLIENTS.push(saved);
    } else {
      FLEET_CONFIG.CLIENTS[parseInt(idx)] = saved;
    }
    this.saveSettingsToCloud();
    if (window.AlgeriaMap) window.AlgeriaMap.renderCustomLocations();
    if (window.showToast) showToast('Client sauvegard\u00e9', 'success');
    document.getElementById('clientEditorModal')?.remove();
    if (document.getElementById('zoneManagementModal')) this.openZoneManagementModal('clients');
  }

  // ─── HISTORY → MAP ISOLATION + RICH POPUP ────────────────────────────────
  _focusHistoryEvent(evt) {
    if (!evt) return;
    if (typeof this.switchTab === 'function') this.switchTab('byWilaya');
    // Store history coords so _zoneGoToMap can fly there even without live GPS
    if (evt.entryLat && evt.entryLng) {
      this._historyFocusCoords = { lat: evt.entryLat, lng: evt.entryLng };
    }
    setTimeout(() => {
      if (typeof this._zoneGoToMap === 'function') this._zoneGoToMap(null, evt.deviceId, evt.truckName);
      setTimeout(() => this._showHistoryPopup(evt), 900);
    }, 300);
  }

  _showHistoryPopup(evt) {
    if (window._currentHistoryPopup) window._currentHistoryPopup.remove();
    document.getElementById('historyVisitPopup')?.remove();
    const entry = evt.entryTime ? new Date(evt.entryTime) : null;
    const exit  = evt.exitTime  ? new Date(evt.exitTime)  : null;
    const dur   = evt.durationMinutes != null ? (Math.floor(evt.durationMinutes/60) + 'h ' + (evt.durationMinutes%60) + 'min') : '\u2014';
    const immob = evt.recapImmobilisationMin ? (Math.floor(evt.recapImmobilisationMin/60) + 'h ' + (evt.recapImmobilisationMin%60) + 'min') : null;
    const ft = d => d ? d.toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'}) : '\u2014';
    const fd = d => d ? d.toLocaleDateString('fr-FR') : '\u2014';

    const html =
      '<div style="width:280px;background:var(--bg-surface,var(--bg-elevated, #1e293b));border-radius:12px;overflow:hidden;box-shadow:0 10px 30px rgba(0,0,0,0.5);">' +
      '<div style="background:linear-gradient(135deg,rgba(56,189,248,0.12),rgba(99,102,241,0.08));padding:10px 14px;border-bottom:1px solid rgba(56,189,248,0.2);display:flex;align-items:center;gap:10px;">' +
        '<div style="width:30px;height:30px;background:linear-gradient(135deg,#38bdf8,#6366f1);border-radius:8px;display:flex;align-items:center;justify-content:center;flex-shrink:0;"><i class="fa-solid fa-clock-rotate-left" style="color:white;font-size:13px;"></i></div>' +
        '<div style="flex:1;min-width:0;"><div style="font-weight:800;font-size:12px;color:var(--text-primary,var(--text-primary, #e2e8f0));white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + (evt.truckName||'\u2014') + '</div>' +
        '<div style="font-size:10px;color:#38bdf8;font-weight:600;">' + (evt.zoneName||'\u2014') + '</div></div>' +
      '</div>' +
      '<div style="padding:10px 14px;">' +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:8px;">' +
          '<div style="background:var(--bg-elevated,var(--bg-elevated, rgba(255,255,255,0.04)));border-radius:7px;padding:7px;">' +
            '<div style="font-size:9px;color:var(--text-muted,var(--text-muted, #64748b));font-weight:700;text-transform:uppercase;">Entr\u00e9e</div>' +
            '<div style="font-size:12px;font-weight:800;color:var(--text-primary,var(--text-primary, #e2e8f0));">' + ft(entry) + '</div>' +
          '</div>' +
          '<div style="background:var(--bg-elevated,var(--bg-elevated, rgba(255,255,255,0.04)));border-radius:7px;padding:7px;">' +
            '<div style="font-size:9px;color:var(--text-muted,var(--text-muted, #64748b));font-weight:700;text-transform:uppercase;">Sortie</div>' +
            (exit ? '<div style="font-size:12px;font-weight:800;color:var(--text-primary,var(--text-primary, #e2e8f0));">' + ft(exit) + '</div>'
                  : '<div style="font-size:12px;font-weight:700;color:#22c55e;">En zone</div>') +
          '</div>' +
        '</div>' +
        '<div style="display:flex;gap:6px;margin-bottom:8px;">' +
          '<div style="flex:1;background:rgba(34,197,94,0.08);border:1px solid rgba(34,197,94,0.2);border-radius:7px;padding:6px;text-align:center;">' +
            '<div style="font-size:9px;color:#22c55e;font-weight:700;text-transform:uppercase;">Dur\u00e9e</div>' +
            '<div style="font-size:12px;font-weight:800;color:#22c55e;">' + dur + '</div>' +
          '</div>' +
          (immob ? '<div style="flex:1;background:rgba(245,158,11,0.08);border:1px solid rgba(245,158,11,0.2);border-radius:7px;padding:6px;text-align:center;"><div style="font-size:9px;color:#f59e0b;font-weight:700;text-transform:uppercase;">Immobil.</div><div style="font-size:12px;font-weight:800;color:#f59e0b;">' + immob + '</div></div>' : '') +
        '</div>' +
        (evt.clientName ? '<div style="font-size:10px;color:var(--text-muted,var(--text-muted, #64748b));padding:4px 6px;background:var(--bg-elevated,rgba(255,255,255,0.03));border-radius:5px;"><i class="fa-solid fa-building" style="margin-right:4px;color:#6366f1;"></i>' + evt.clientName + (evt.finalClientName ? ' \u2192 ' + evt.finalClientName : '') + '</div>' : '') +
      '</div></div>';

    if (window.AlgeriaMap && AlgeriaMap.map && evt.entryLat && evt.entryLng) {
      window._currentHistoryPopup = new mapboxgl.Popup({ closeButton: true, className: 'history-map-popup', maxWidth: '300px' })
        .setLngLat([evt.entryLng, evt.entryLat])
        .setHTML(html)
        .addTo(window.AlgeriaMap.map);
    }
  }

  // ─── MAP CIRCLE PICKER ────────────────────────────────────────────────────
  _goToZoneMap(lat, lng, name, radius) {
    document.getElementById('zoneManagementModal') && (document.getElementById('zoneManagementModal').style.display = 'none');
    document.getElementById('clientEditorModal') && (document.getElementById('clientEditorModal').style.display = 'none');
    document.getElementById('zmEditOverlay') && (document.getElementById('zmEditOverlay').style.display = 'none');
    document.getElementById('zmEditOverlay') && (document.getElementById('zmEditOverlay').style.display = 'none');
    if (typeof this.switchTab === 'function') this.switchTab('byWilaya');
    setTimeout(() => {
      if (window.AlgeriaMap && window.AlgeriaMap.map) {
         window.AlgeriaMap.map.resize();
         window.AlgeriaMap.map.flyTo({ center: [lng, lat], zoom: 16, essential: true, duration: 1500 });
         if (name) {
             const html = '<div style="background:var(--bg-elevated);color:var(--text-primary);padding:5px 8px;border-radius:6px;font-size:11px;border:1px solid rgba(56,189,248,0.3);"><b>'+name+'</b></div>';
             new mapboxgl.Popup({ closeButton: true, closeOnClick: true, offset: 15 })
               .setLngLat([lng, lat])
               .setHTML(html)
               .addTo(window.AlgeriaMap.map);
         } else {
             new mapboxgl.Marker({ color: '#38bdf8' }).setLngLat([lng, lat]).addTo(window.AlgeriaMap.map);
         }
      }
    }, 400);
  }

  _startZoneMapPicker(opts) {
    opts = opts || {};
    document.getElementById('zoneManagementModal') && (document.getElementById('zoneManagementModal').style.display = 'none');
    document.getElementById('clientEditorModal') && (document.getElementById('clientEditorModal').style.display = 'none');
    document.getElementById('zmEditOverlay') && (document.getElementById('zmEditOverlay').style.display = 'none');
    document.getElementById('mapPickerBanner')?.remove();
    const banner = document.createElement('div');
    banner.id = 'mapPickerBanner';
    banner.style.cssText = 'position:fixed;top:20px;left:50%;transform:translateX(-50%);z-index:999998;background:rgba(10,15,30,0.92);backdrop-filter:blur(12px);border:1px solid rgba(56,189,248,0.5);border-radius:14px;padding:13px 22px;color:#38bdf8;font-size:13px;font-weight:700;display:flex;align-items:center;gap:12px;box-shadow:0 8px 30px rgba(0,0,0,0.5);pointer-events:auto;';
    banner.innerHTML = '<i class="fa-solid fa-crosshairs" style="font-size:18px;"></i><span id="mapPickerMsg">1er clic : d\u00e9finissez le <b>centre</b> du site</span><button onclick="ui._cancelMapPicker()" style="background:rgba(239,68,68,0.2);border:1px solid rgba(239,68,68,0.4);color:#f87171;border-radius:8px;padding:5px 11px;cursor:pointer;font-size:12px;font-weight:700;margin-left:10px;">\u00d7 Annuler</button>';
    document.body.appendChild(banner);
    if (typeof this.switchTab === 'function') this.switchTab('byWilaya');
    this._mapPickerMode = 'center';
    this._mapPickerOpts = opts;
    this._mapPickerCenter = null;
    const tryBind = () => {
      const m = (window.AlgeriaMap && window.AlgeriaMap.map) || (window.app && app.map);
      if (!m) { setTimeout(tryBind, 400); return; }
      m.getCanvas().style.cursor = 'crosshair';
      const onClick = (ev) => {
        if (this._mapPickerMode === 'center') {
          this._mapPickerCenter = ev.lngLat;
          this._drawPickerCircle(m, ev.lngLat.lat, ev.lngLat.lng, 500);
          this._mapPickerMode = 'radius';
          const msg = document.getElementById('mapPickerMsg');
          if (msg) msg.innerHTML = '2\u00e8me clic : fixez le <b>rayon</b> du cercle';
          this._mapPickerMoveH = (me) => {
            if (!this._mapPickerCenter) return;
            const R=6371000, c=this._mapPickerCenter;
            const dLat=(me.lngLat.lat-c.lat)*Math.PI/180, dLng=(me.lngLat.lng-c.lng)*Math.PI/180;
            const a=Math.sin(dLat/2)**2+Math.cos(c.lat*Math.PI/180)*Math.cos(me.lngLat.lat*Math.PI/180)*Math.sin(dLng/2)**2;
            this._drawPickerCircle(m, c.lat, c.lng, Math.max(Math.round(R*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a))),30));
          };
          m.on('mousemove', this._mapPickerMoveH);
        } else if (this._mapPickerMode === 'radius') {
          const R=6371000, c=this._mapPickerCenter;
          const dLat=(ev.lngLat.lat-c.lat)*Math.PI/180, dLng=(ev.lngLat.lng-c.lng)*Math.PI/180;
          const a=Math.sin(dLat/2)**2+Math.cos(c.lat*Math.PI/180)*Math.cos(ev.lngLat.lat*Math.PI/180)*Math.sin(dLng/2)**2;
          const radius=Math.max(Math.round(R*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a))),30);
          m.off('click', onClick);
          if (this._mapPickerMoveH) { m.off('mousemove', this._mapPickerMoveH); this._mapPickerMoveH=null; }
          m.getCanvas().style.cursor='';
          this._mapPickerMode='confirm';
          document.getElementById('mapPickerBanner')?.remove();
          this._showPickerConfirm(c.lat, c.lng, radius);
        }
      };
      this._mapPickerClickH = onClick;
      m.on('click', onClick);
    };
    tryBind();
  }

  _drawPickerCircle(m, lat, lng, radiusM) {
    const pts=64, R=6371000, coords=[];
    for(let i=0;i<=pts;i++){
      const ang=(i/pts)*2*Math.PI;
      const dLat=(radiusM/R)*(180/Math.PI), dLng=(radiusM/R)*(180/Math.PI)/Math.cos(lat*Math.PI/180);
      coords.push([lng+dLng*Math.sin(ang), lat+dLat*Math.cos(ang)]);
    }
    const geo={type:'FeatureCollection',features:[{type:'Feature',geometry:{type:'Polygon',coordinates:[coords]}}]};
    try {
      if(m.getSource('_picker_circle')){m.getSource('_picker_circle').setData(geo);}
      else{
        m.addSource('_picker_circle',{type:'geojson',data:geo});
        m.addLayer({id:'_picker_circle_fill',type:'fill',source:'_picker_circle',paint:{'fill-color':'#38bdf8','fill-opacity':0.12}});
        m.addLayer({id:'_picker_circle_line',type:'line',source:'_picker_circle',paint:{'line-color':'#38bdf8','line-width':2,'line-dasharray':[4,2]}});
      }
    } catch(e){}
    this._lastPickerRadius=radiusM;
  }

  _showPickerConfirm(lat, lng, radius) {
    document.getElementById('mapPickerConfirm')?.remove();
    const d=document.createElement('div');
    d.id='mapPickerConfirm';
    d.style.cssText='position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);z-index:999999;background:var(--bg-surface,var(--bg-elevated, #1e293b));border:1px solid rgba(56,189,248,0.4);border-radius:16px;padding:24px;width:330px;max-width:92vw;box-shadow:0 20px 60px rgba(0,0,0,0.6);';
    d.innerHTML='<div style="text-align:center;margin-bottom:18px;"><div style="width:52px;height:52px;background:rgba(56,189,248,0.15);border-radius:14px;display:flex;align-items:center;justify-content:center;margin:0 auto 10px;font-size:24px;color:#38bdf8;"><i class="fa-solid fa-circle-check"></i></div>' +
      '<div style="font-weight:800;font-size:16px;color:var(--text-primary,var(--text-primary, #e2e8f0));margin-bottom:6px;">Confirmer la position ?</div>' +
      '<div style="font-size:12px;color:var(--text-muted,var(--text-muted, #64748b));"><span style="color:#38bdf8;font-weight:700;">'+lat.toFixed(6)+'</span>, <span style="color:#38bdf8;font-weight:700;">'+lng.toFixed(6)+'</span><br>Rayon : <span style="color:#22c55e;font-weight:700;">'+radius+' m</span></div></div>' +
      '<div style="display:flex;gap:8px;"><button onclick="ui._cancelMapPicker(true)" style="flex:1;background:var(--bg-elevated,var(--border));border:1px solid var(--border,var(--border, rgba(255,255,255,0.1)));color:var(--text-secondary,var(--text-muted, #94a3b8));border-radius:9px;padding:11px;font-weight:700;cursor:pointer;font-size:13px;">&#8634; R&eacute;init.</button>' +
      '<button onclick="ui._confirmMapPick('+lat+','+lng+','+radius+')" style="flex:2;background:linear-gradient(135deg,#38bdf8,#0ea5e9);color:white;border:none;border-radius:9px;padding:11px;font-weight:800;cursor:pointer;font-size:14px;box-shadow:0 4px 14px rgba(56,189,248,0.3);"><i class="fa-solid fa-check" style="margin-right:6px;"></i>Confirmer</button></div>';
    document.body.appendChild(d);
  }

  _confirmMapPick(lat, lng, radius) {
    document.getElementById('mapPickerConfirm')?.remove();
    const m=(window.AlgeriaMap&&window.AlgeriaMap.map)||(window.app&&app.map);
    if(m){try{m.removeLayer('_picker_circle_fill');m.removeLayer('_picker_circle_line');m.removeSource('_picker_circle');}catch(e){}}
    const opts=this._mapPickerOpts||{};
    if(opts.forFC && this._ceClient && this._ceClient.finalClients[opts.fcIdx]!==undefined){
      this._ceClient.finalClients[opts.fcIdx].lat=lat;
      this._ceClient.finalClients[opts.fcIdx].lng=lng;
      const ce=document.getElementById('clientEditorModal');
      if(ce){ce.style.display='';}else{this.openClientEditorModal(this._ceClientIdx);}
      if(this._ceRenderFCList)this._ceRenderFCList();
    } else if (opts.editIndex !== undefined) {
      // Called from the EDIT modal (openZoneClientModal)
      const locs = FLEET_CONFIG.CUSTOM_LOCATIONS || [];
      if (locs[opts.editIndex]) {
        locs[opts.editIndex].lat = lat;
        locs[opts.editIndex].lng = lng;
        locs[opts.editIndex].radius = radius;
      }
      const eo = document.getElementById('zmEditOverlay');
      if (eo) {
        eo.style.display = '';
        // Update the fields in the edit modal
        const latEl = document.getElementById('zme_lat');
        const lngEl = document.getElementById('zme_lng');
        const rEl = document.getElementById('zme_radius');
        if (latEl) latEl.value = lat.toFixed(6);
        if (lngEl) lngEl.value = lng.toFixed(6);
        if (rEl) rEl.value = radius;
        if (window.showToast) showToast('✅ Position mise à jour sur la carte', 'success');
      } else {
        this.openZoneClientModal(opts.editIndex);
      }
      // Also restore parent modal
      const zm = document.getElementById('zoneManagementModal');
      if (zm) zm.style.display = '';
    } else {
      const latEl=document.getElementById('zm_lat'),lngEl=document.getElementById('zm_lng'),rEl=document.getElementById('zm_radius');
      if(latEl)latEl.value=lat.toFixed(6); if(lngEl)lngEl.value=lng.toFixed(6); if(rEl)rEl.value=radius;
      const zm=document.getElementById('zoneManagementModal');
      if(zm){zm.style.display='';}else{this.openZoneManagementModal('add');}
    }
    // Restore zmEditOverlay if it was hidden for map picking
    const _eo2 = document.getElementById('zmEditOverlay'); if (_eo2) _eo2.style.display = '';
    // Always refresh map after any map pick confirm
    if (window.AlgeriaMap) window.AlgeriaMap.renderCustomLocations();
  }

  _zoneHistoryRowClick(deviceId, truckName, lat, lng, entryTime, exitTime) {
    // Switch to map
    const mapNavBtn = document.querySelector('[data-tab="byWilaya"]');
    if (mapNavBtn) mapNavBtn.click(); else this.switchTab('byWilaya');
    if (this.zoneGroupingMode !== 'map') this.setZoneGrouping('map');

    if (entryTime && entryTime !== 'undefined' && entryTime !== 'null') {
      // Find IMEI from deviceId
      const am = window.AlgeriaMap;
      let imei = deviceId;
      if (am && am.truckDataCache) {
        const found = am.truckDataCache.find(t => String(t.deviceId) === String(deviceId) || String(t.id) === String(deviceId) || t.name === truckName);
        if (found && found.id) imei = found.id;
      }
      
      const start = entryTime.replace('T', ' ').substring(0, 19);
      const end = exitTime && exitTime !== 'undefined' && exitTime !== 'null' ? exitTime.replace('T', ' ').substring(0, 19) : new Date().toISOString().replace('T', ' ').substring(0, 19);
      
      this.loadVisualHistory(imei, start, end);
    } else {
      // Legacy behavior: just fly to position
      const am = window.AlgeriaMap;
      const doFly = (attempt) => {
        if (!am || !am.map) { if(attempt < 15) setTimeout(() => doFly(attempt+1), 400); return; }
        const canvas = am.map.getCanvas();
        if (!canvas || canvas.width === 0) { if(attempt < 15) setTimeout(() => doFly(attempt+1), 400); return; }
        try { am.map.resize(); } catch(e) {}

        if (am.selectTruckById) {
          let found = am.truckDataCache?.find(t => String(t.deviceId) === String(deviceId) || t.id === String(deviceId));
          if (!found) found = am.truckDataCache?.find(t => t.name === truckName);
          if (found) am.selectTruckById(found.id);
        }

        if (lat && lng) {
          am.map.flyTo({ center: [lng, lat], zoom: 16, essential: true, duration: 1800 });
          if (window._historyMarker) { window._historyMarker.remove(); }
          window._historyMarker = new mapboxgl.Marker({ color: '#8b5cf6' })
            .setLngLat([lng, lat])
            .setPopup(new mapboxgl.Popup({ offset: 25 }).setHTML('<div style="color:var(--bg-surface, #0f172a);font-weight:700;font-size:12px;">📍 ' + truckName + '<br><span style=\"color:#6b7280;font-size:10px;\">Arrêt historique</span></div>'))
            .addTo(am.map);
          setTimeout(() => { if (window._historyMarker) { window._historyMarker.getPopup().addTo(am.map); } }, 1000);
        }
      };
      setTimeout(() => doFly(0), 500);
    }
  }

  _cancelMapPicker(reopen) {
    document.getElementById('mapPickerBanner')?.remove();
    document.getElementById('mapPickerConfirm')?.remove();
    const m=(window.AlgeriaMap&&window.AlgeriaMap.map)||(window.app&&app.map);
    if(m){
      if(this._mapPickerClickH){m.off('click',this._mapPickerClickH);this._mapPickerClickH=null;}
      if(this._mapPickerMoveH){m.off('mousemove',this._mapPickerMoveH);this._mapPickerMoveH=null;}
      m.getCanvas().style.cursor='';
      try{m.removeLayer('_picker_circle_fill');m.removeLayer('_picker_circle_line');m.removeSource('_picker_circle');}catch(e){}
    }
    this._mapPickerMode=null;
    document.getElementById('zoneManagementModal') && (document.getElementById('zoneManagementModal').style.display='');
    document.getElementById('clientEditorModal') && (document.getElementById('clientEditorModal').style.display='');
    document.getElementById('zmEditOverlay') && (document.getElementById('zmEditOverlay').style.display='');
    if(reopen===true)setTimeout(()=>this._startZoneMapPicker(this._mapPickerOpts||{}),100);
  }


  // ══════════════════════════════════════════════════════════════
  // 🔧 MAINTENANCE MODAL — open/close
  // ══════════════════════════════════════════════════════════════
  openMaintenanceModal(entryData = null) {
    const modal = document.getElementById('maintenanceModal');
    if (!modal) { console.warn('maintenanceModal not found in DOM'); return; }

    const entryId = entryData ? (entryData._id || entryData.id) : null;

    if (entryData && entryId) {
      // ── EDIT mode: populate trucks first, then fill fields ──────
      this._editingMaintenanceId = entryId;
      const t = document.getElementById('modalMaintTitle');
      if (t) t.textContent = 'Modifier l\'Ordre de Réparation';

      // Populate truck dropdown, then fill all fields
      this.openNewMaintenanceOrder(null).then(() => {
        const truckSel = document.getElementById('modalMaintTruck');
        if (truckSel && entryData.truckName) {
          // Try exact value match first
          const opt = Array.from(truckSel.options).find(o =>
            o.value === entryData.truckName || (o.dataset.id && String(o.dataset.id) === String(entryData.deviceId))
          );
          if (opt) { truckSel.value = opt.value; }
          else {
            // Add a temporary option if not found
            const tmp = document.createElement('option');
            tmp.value = entryData.truckName; tmp.textContent = entryData.truckName;
            truckSel.appendChild(tmp); truckSel.value = entryData.truckName;
          }
        }
        const fill = {
          modalMaintType:        entryData.type,
          modalMaintLocation:    entryData.location,
          modalMaintNote:        entryData.note,
          modalMaintDescription: entryData.description || entryData.note,
          modalMaintOdo:         entryData.odometer,
          modalMaintTechnician:  entryData.technician,
          modalMaintLabor:       entryData.cost,
          modalMaintPriority:    entryData.priority,
        };
        for (const [id, val] of Object.entries(fill)) {
          const el = document.getElementById(id);
          if (el && val != null) el.value = val;
        }
        if (entryData.date) {
          const dateEl = document.getElementById('modalMaintDate');
          if (dateEl) {
            const d = new Date(entryData.date);
            d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
            dateEl.value = d.toISOString().slice(0, 16);
          }
        }
        if (entryData.tires) {
          let tList = Array.isArray(entryData.tires) ? entryData.tires : [];
          if (!tList.length && typeof entryData.tires === 'string') {
            try { tList = JSON.parse(entryData.tires); } catch(_) { tList = entryData.tires.split(',').map(s=>s.trim()).filter(Boolean); }
          }
          if (Array.isArray(tList)) {
            document.querySelectorAll('.mark').forEach(m => { m.classList.remove('on'); m.style.display = 'none'; });
            tList.forEach(tId => {
              const el = document.getElementById(tId);
              if (el) { el.classList.add('on'); el.style.display = 'block'; }
            });
          }
        }
      });
    } else {
      // Reset all tire marks
      document.querySelectorAll('.mark').forEach(m => { m.classList.remove('on'); m.style.display = 'none'; });
      // ── NEW mode: openNewMaintenanceOrder handles everything ─────
      this._editingMaintenanceId = null;
      const t = document.getElementById('modalMaintTitle');
      if (t) t.textContent = 'Ordre de Réparation';
      if (typeof this.setMaintWizardStep === 'function') this.setMaintWizardStep(1);
      modal.style.display = 'flex';
    }
  }

  closeMaintenanceModal() {
    const modal = document.getElementById('maintenanceModal');
    if (modal) modal.style.display = 'none';
    this._editingMaintenanceId = null;
  }

  // ── Maintenance list helpers ────────────────────────────────
  renderMaintenanceList() {
    if (typeof this.applyMaintenanceHistoryFilters === 'function') {
      this.applyMaintenanceHistoryFilters();
    } else if (typeof this.fetchAndRenderMaintenance === 'function') {
      this.fetchAndRenderMaintenance();
    }
  }

  _renderMaintenanceRows(logs) {
    if (!logs || logs.length === 0) {
      return `<tr><td colspan="10" style="text-align:center;padding:48px 20px;">
        <i class="fa-solid fa-wrench" style="font-size:36px;color:var(--text-muted);opacity:0.35;display:block;margin-bottom:12px;"></i>
        <div style="font-weight:600;color:var(--text-primary);font-size:14px;">Aucun enregistrement trouvé</div>
        <div style="font-size:12px;color:var(--text-muted);margin-top:4px;">Ajoutez une entrée ou modifiez les filtres</div>
      </td></tr>`;
    }
    // Type → accent color (uses theme palette)
    const typeStyle = {
      'Vidange':              { bg: 'var(--warning-subtle)',  color: 'var(--warning)',  icon: 'fa-oil-can' },
      'Plaquettes':           { bg: 'rgba(139,92,246,.1)',   color: '#a78bfa',         icon: 'fa-car-brake-drum' },
      'Maintenance Générale': { bg: 'var(--primary-subtle)', color: 'var(--primary)',  icon: 'fa-wrench' },
      'Maintenance':          { bg: 'var(--primary-subtle)', color: 'var(--primary)',  icon: 'fa-wrench' },
    };
    const prioStyle = {
      urgent: { color: 'var(--danger)',   bg: 'var(--danger-subtle)',   dot: '#ef4444', label: 'Urgent' },
      normal: { color: 'var(--primary)',  bg: 'var(--primary-subtle)',  dot: '#38bdf8', label: 'Normal' },
      bas:    { color: 'var(--text-muted)', bg: 'var(--bg-surface)',    dot: '#64748b', label: 'Bas' },
      low:    { color: 'var(--text-muted)', bg: 'var(--bg-surface)',    dot: '#64748b', label: 'Bas' },
    };
    return logs.map((item, idx) => {
      const d       = new Date(item.date || item.createdAt);
      const dateStr = d.toLocaleDateString('fr-FR', { day:'2-digit', month:'2-digit', year:'2-digit' });
      const timeStr = d.toLocaleTimeString('fr-FR', { hour:'2-digit', minute:'2-digit' });
      const prio    = item.priority || 'normal';
      const ps      = prioStyle[prio] || prioStyle.normal;
      const ts      = typeStyle[item.type] || { bg: 'var(--bg-surface)', color: 'var(--text-muted)', icon: 'fa-screwdriver-wrench' };
      const cost    = item.cost ? Number(item.cost).toLocaleString('fr-FR') + '\u202fDA' : '—';
      const status  = item.status || 'done';
      const isAuto  = item.isAuto;
      const noteText = item.description || item.note || '—';
      const techText = item.technician
        ? `<div style="font-size:10px;color:var(--text-muted);margin-top:2px;"><i class="fa-solid fa-user-gear" style="margin-right:3px;"></i>${item.technician}</div>` : '';

      const statusBadge = status === 'done' || status === 'completed' || status === 'termine' || status === 'terminé'
        ? `<span class="badge-termine" style="font-size:10px;padding:2px 8px;border-radius:var(--radius-full);"><i class="fa-solid fa-check" style="margin-right:3px;"></i>Terminé</span>`
        : status === 'cancelled' || status === 'annule' || status === 'annulé'
          ? `<span class="badge-annule" style="font-size:10px;padding:2px 8px;border-radius:var(--radius-full);"><i class="fa-solid fa-ban" style="margin-right:3px;"></i>Annulé</span>`
          : `<span class="badge-en-cours" style="font-size:10px;padding:2px 8px;border-radius:var(--radius-full);"><i class="fa-solid fa-spinner fa-spin" style="margin-right:3px;"></i>En cours</span>`;

      const autoBadge = isAuto
        ? `<span style="font-size:9px;background:var(--primary-subtle);color:var(--primary);padding:1px 5px;border-radius:var(--radius-full);margin-left:4px;font-weight:600;">AUTO</span>` : '';

      const rowHover = `onmouseover="this.style.background='var(--bg-surface)'" onmouseout="this.style.background=''" `;
      return `<tr style="border-bottom:1px solid var(--border);cursor:default;transition:background 0.15s;" ${rowHover}>
        <td style="padding:10px 14px;">
          <div style="font-weight:600;color:var(--text-primary);font-size:12px;">${dateStr}</div>
          <div style="font-size:10px;color:var(--text-muted);margin-top:1px;">${timeStr}</div>
        </td>
        <td style="padding:10px 14px;">
          <span style="font-weight:700;color:var(--primary);font-size:13px;">${item.truckName || '—'}</span>${autoBadge}
        </td>
        <td style="padding:10px 14px;">
          <span style="background:${ts.bg};color:${ts.color};padding:3px 10px;border-radius:var(--radius-full);font-size:11px;font-weight:700;white-space:nowrap;display:inline-flex;align-items:center;gap:5px;">
            <i class="fa-solid ${ts.icon}" style="font-size:10px;"></i>${item.type || '—'}
          </span>
        </td>
        <td style="padding:10px 14px;font-family:var(--font-mono,monospace);font-size:12px;color:var(--text-primary);">
          ${item.odometer ? '<span style="font-weight:600;">' + Number(item.odometer).toLocaleString('fr-FR') + '</span> <span style="font-size:10px;color:var(--text-muted);">km</span>' : '—'}
        </td>
        <td style="padding:10px 14px;font-size:12px;color:var(--text-primary);">${item.location || '—'}</td>
        <td style="padding:10px 14px;max-width:200px;">
          <div style="font-size:12px;color:var(--text-primary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${(item.description || item.note || '').replace(/"/g, '&quot;')}">${noteText}</div>
          ${techText}
        </td>
        <td style="padding:10px 14px;">
          <span style="background:${ps.bg};color:${ps.color};padding:3px 10px;border-radius:var(--radius-full);font-size:11px;font-weight:700;display:inline-flex;align-items:center;gap:5px;">
            <span style="width:6px;height:6px;border-radius:50%;background:${ps.dot};display:inline-block;"></span>${ps.label}
          </span>
        </td>
        <td style="padding:10px 14px;font-weight:700;color:var(--success);font-size:13px;white-space:nowrap;">${cost}</td>
        <td style="padding:10px 14px;">${statusBadge}</td>
        <td style="padding:10px 14px;text-align:center;white-space:nowrap;">
          <button onclick="ui.openEditMaintenanceModal('${(item._id || item.id)}')" class="btn-secondary" title="Modifier" style="padding:4px 10px;font-size:11px;border-radius:var(--radius-md);margin-right:4px;">
            <i class="fa-solid fa-pen-to-square"></i>
          </button>
          <button onclick="window.ui.deleteMaintenanceEntry('${(item._id || item.id)}')" title="Supprimer" style="padding:4px 10px;font-size:11px;border-radius:var(--radius-md);background:var(--danger-subtle);border:1px solid var(--danger-glow);color:var(--danger);cursor:pointer;font-family:inherit;">
            <i class="fa-solid fa-trash"></i>
          </button>
        </td>
      </tr>`;
    }).join('');
  }

  async loadMaintenanceArticles() {
    if (this._maintenanceArticlesLoaded && this._maintenanceArticles && this._maintenanceArticles.length > 0) {
      return this._maintenanceArticles;
    }
    try {
      const r = await fetch(`${FLEET_CONFIG.API.baseUrl}/api/maintenance-articles`, {
        headers: { 'x-access-code': localStorage.getItem('fleetAccessCode') || '' }
      });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const json = await r.json();
      this._maintenanceArticles = Array.isArray(json) ? json : (json.data || []);
      this._maintenanceArticlesLoaded = true;
      return this._maintenanceArticles;
    } catch(e) {
      console.warn('loadMaintenanceArticles:', e.message);
      this._maintenanceArticles = this._maintenanceArticles || [];
      return this._maintenanceArticles;
    }
  }

  // ── Edit / Delete maintenance entry from history table OR active orders ───────
  // Alias for active order cards that call ui.editMaintenance(id)
  editMaintenance(id) { return this.openEditMaintenanceModal(id); }

  async openEditMaintenanceModal(id) {
    if (!id) return;
    try {
      // Search in active orders first (for 'en cours' operations)
      let entry = (this.activeMaintenanceOrders || []).find(l => String(l._id || l.id) === String(id));
      // Then search in cached history logs
      if (!entry) entry = (this.allMaintenanceLogs || []).find(l => String(l._id || l.id) === String(id));
      // Fall back to a fresh fetch from API
      if (!entry) {
        const r = await fetch(`${FLEET_CONFIG.API.baseUrl}/api/maintenance?limit=1000`, {
          headers: { 'x-access-code': localStorage.getItem('fleetAccessCode') || '' }
        });
        const json = await r.json();
        const logs = Array.isArray(json) ? json : (json.data || []);
        entry = logs.find(l => String(l._id || l.id) === String(id));
      }
      if (!entry) return alert('Entrée introuvable.');
      this.openMaintenanceModal(entry);
    } catch(e) { alert('Erreur: ' + e.message); }
  }

  // ── Save maintenance record (add or update) ───────────────────
  async saveManualMaintenance() {
    try {
      const truckSelect = document.getElementById('modalMaintTruck');
      const sel = truckSelect ? truckSelect.options[truckSelect.selectedIndex] : null;
      const truckName = sel ? sel.value : '';
      const deviceId = sel ? (sel.dataset.id || '') : '';
      if (!truckName) return alert('Veuillez sélectionner un camion.');

      const type = document.getElementById('modalMaintType')?.value || 'Autre';
      const dateVal = document.getElementById('modalMaintDate')?.value;
      const date = dateVal ? new Date(dateVal).toISOString() : new Date().toISOString();
      const odometer = parseInt(document.getElementById('modalMaintOdo')?.value || '0', 10);
      const location = document.getElementById('modalMaintLocation')?.value || '';
      const priority = document.getElementById('modalMaintPriority')?.value || 'normal';
      const technician = document.getElementById('modalMaintTechnician')?.value || '';
      const cost = parseFloat(document.getElementById('modalMaintLabor')?.value || '0');
      const description = document.getElementById('modalMaintDescription')?.value || '';
      const note = document.getElementById('modalMaintNote')?.value || description;
      const immatriculation = document.getElementById('modalMaintImm')?.value || '';
      const chassisNumber = document.getElementById('modalMaintChassis')?.value || '';

      // Collect parts from wizard step 2
      const parts = [];
      document.querySelectorAll('.maint-part-row').forEach(row => {
        const chk = row.querySelector('input[type="checkbox"]');
        if (chk && chk.checked) {
          parts.push({
            name: row.dataset.name || chk.dataset.name || '',
            qty: parseInt(row.querySelector('.part-qty')?.value || '1', 10),
            price: parseFloat(row.querySelector('.part-price')?.value || '0')
          });
        }
      });

      // Collect tire marks
      const tires = [];
      document.querySelectorAll('.mark').forEach(m => {
        if (m.classList.contains('on') || (m.style.display && m.style.display === 'block')) {
          if (m.id) tires.push(m.id);
        }
      });

      const body = {
        truckName, deviceId, type, date, odometer, location,
        priority, technician, cost, description, note,
        immatriculation, chassisNumber, parts, tires,
        status: 'en_cours'
      };

      const isEdit = !!this._editingMaintenanceId;
      const url = isEdit
        ? `${FLEET_CONFIG.API.baseUrl}/api/maintenance/update`
        : `${FLEET_CONFIG.API.baseUrl}/api/maintenance/add`;

      if (isEdit) body.id = this._editingMaintenanceId;

      const r = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-access-code': localStorage.getItem('fleetAccessCode') || '' },
        body: JSON.stringify(body)
      });

      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${r.status}`);
      }

      const resData = await r.json().catch(() => ({}));

      if (window.showToast) showToast(isEdit ? 'Ordre modifié ✅' : 'Ordre enregistré ✅', 'success');
      this.closeMaintenanceModal();
      await this.refreshMaintenanceFollowup();
      if (typeof this.fetchAndRenderMaintenance === 'function') await this.fetchAndRenderMaintenance();

      // ✅ Update vidange overrides and live refresh UI
      if (resData && resData.vidangeOverrides) {
        FLEET_CONFIG.VIDANGE_OVERRIDES = resData.vidangeOverrides;
        FLEET_CONFIG.vidangeOverrides = resData.vidangeOverrides;
      } else if (typeof this.loadSettingsFromCloud === 'function') {
        await this.loadSettingsFromCloud();
      }

      const isVidangeType = type && (type.toLowerCase().includes('vidange'));
      if (isVidangeType && deviceId && odometer > 0) {
        if (!FLEET_CONFIG.VIDANGE_OVERRIDES) FLEET_CONFIG.VIDANGE_OVERRIDES = {};
        if (!FLEET_CONFIG.vidangeOverrides) FLEET_CONFIG.vidangeOverrides = FLEET_CONFIG.VIDANGE_OVERRIDES;
        FLEET_CONFIG.VIDANGE_OVERRIDES[String(deviceId)] = {
          lastVidangeKm: odometer,
          odometerAtConfirm: odometer,
          confirmedAt: new Date().toISOString(),
          truckName: truckName || ''
        };
        FLEET_CONFIG.vidangeOverrides[String(deviceId)] = FLEET_CONFIG.VIDANGE_OVERRIDES[String(deviceId)];
      }

      const appInstance = (typeof app !== 'undefined' && app) || window.app;
      if (appInstance && typeof appInstance.forceRecalculateVidanges === 'function') {
        appInstance.forceRecalculateVidanges();
      }
      this.renderTrucks();
      this.renderStats();
      if (typeof this.renderVidangeSection === 'function') {
        this.renderVidangeSection();
      }
      return resData;
    } catch(e) {
      alert('Erreur sauvegarde: ' + e.message);
      console.error('[saveManualMaintenance]', e);
    }
  }

  // ── Generate Ordre de Réparation (save + open PDF) ─────────────
  async generateOrdreReparation() {
    // 1. Snapshot all 16 parameters before closing modal or resetting state
    const truckSelect = document.getElementById('modalMaintTruck');
    const sel = truckSelect ? truckSelect.options[truckSelect.selectedIndex] : null;
    const truckName = sel ? sel.value : (document.getElementById('modalMaintTruck')?.value || '');
    const deviceId = sel ? (sel.dataset.id || '') : (this._pendingVidangeDeviceId || '');

    const appInstance = (typeof app !== 'undefined' && app) || window.app;
    const trucks = (appInstance && typeof appInstance.getAllTrucks === 'function') ? appInstance.getAllTrucks() : [];
    const truck = trucks.find(t => String(t.id || t.deviceId) === String(deviceId) || String(t.name).toLowerCase() === String(truckName).toLowerCase());
    const dbTruck = (Array.isArray(this.truckDbCache) ? this.truckDbCache : []).find(d => String(d.deviceId) === String(deviceId) || String(d.name).toLowerCase() === String(truckName).toLowerCase()) || {};

    const type = document.getElementById('modalMaintType')?.value || 'Vidange';
    const dateVal = document.getElementById('modalMaintDate')?.value;
    const date = dateVal ? new Date(dateVal).toISOString() : new Date().toISOString();
    const odo = document.getElementById('modalMaintOdo')?.value || (truck ? truck.odometer : '') || (sel ? (sel.dataset.odo || '') : '');
    const location = document.getElementById('modalMaintLocation')?.value || '';
    const priority = document.getElementById('modalMaintPriority')?.value || 'normal';
    const tech = document.getElementById('modalMaintTechnician')?.value || '';
    const cost = document.getElementById('modalMaintLabor')?.value || document.getElementById('modalMaintCost')?.value || '0';
    const desc = document.getElementById('modalMaintDescription')?.value || '';
    const imm = document.getElementById('modalMaintImm')?.value || dbTruck.immatriculation || (truck && truck.immatriculation) || '';
    const chassis = document.getElementById('modalMaintChassis')?.value || dbTruck.chassisNumber || (truck && truck.chassisNumber) || '';
    const scheme = document.getElementById('modalMaintScheme')?.value || 'vehicule';
    const forfaitName = document.getElementById('modalMaintForfait')?.value || '';

    // Collect parts from wizard table
    const parts = [];
    document.querySelectorAll('.maint-part-row').forEach(row => {
      const chk = row.querySelector('input[type="checkbox"]');
      if (chk && chk.checked) {
        parts.push({
          name: row.dataset.name || chk.dataset.name || '',
          qty: parseInt(row.querySelector('.part-qty')?.value || '1', 10),
          cost: parseFloat(row.querySelector('.part-price')?.value || '0')
        });
      }
    });

    // Collect marked tires
    const tires = [];
    document.querySelectorAll('.mark').forEach(m => {
      if (m.classList.contains('on') || (m.style.display && m.style.display === 'block')) {
        if (m.id) tires.push(m.id);
      }
    });

    // 2. Save the maintenance record first
    await this.saveManualMaintenance();

    // 3. Open the repair order generator with all 16 parameters + driver/trailer
    try {
      if (truckName && typeof window.open === 'function') {
        const tDb = (this.truckDbCache || []).find(d => String(d.truckName || '').toLowerCase() === String(truckName).toLowerCase() || String(d.deviceId) === String(this.selectedMaintTruckId)) || {};
        const queryParams = new URLSearchParams({
          truck: truckName,
          imm: String(imm),
          odo: String(odo),
          tech: String(tech),
          date: String(date),
          chassis: String(chassis),
          type: String(type),
          desc: String(desc),
          location: String(location),
          priority: String(priority),
          cost: String(cost),
          scheme: String(scheme),
          tires: tires.join(','),
          parts: JSON.stringify(parts),
          status: 'en_cours'
        });
        if (tDb.driverName) queryParams.set('driver', tDb.driverName);
        if (tDb.driverPhone) queryParams.set('driverPhone', tDb.driverPhone);
        if (tDb.trailer) queryParams.set('trailer', tDb.trailer);
        if (forfaitName) queryParams.set('forfaitName', forfaitName);
        const url = `ordre_reparation_v21.html?${queryParams.toString()}`;
        window.open(url, '_blank');
      }
    } catch(e) { console.warn('PDF generation:', e.message); }
  }

  async deleteMaintenanceEntry(id) {
    if (!id) return;
    const confirmed = typeof ui_showConfirm === 'function'
      ? await ui_showConfirm('Supprimer cet enregistrement de maintenance ? Cette action est irréversible.', 'Supprimer maintenance', '🗑️', 'Supprimer')
      : confirm('Supprimer cet enregistrement de maintenance ? Cette action est irréversible.');
    if (!confirmed) return;
    try {
      const r = await fetch(`${FLEET_CONFIG.API.baseUrl}/api/maintenance/delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-access-code': localStorage.getItem('fleetAccessCode') || '' },
        body: JSON.stringify({ id })
      });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      if (window.showToast) showToast('Enregistrement supprimé', 'success');
      await this.fetchAndRenderMaintenance();
      
      // ✅ Force a full sync of settings (to get the updated vidangeOverrides) and refresh dashboard
      if (typeof this.loadSettingsFromCloud === 'function') {
        await this.loadSettingsFromCloud();
      }
      const appInstance = (typeof app !== 'undefined' && app) || window.app;
      if (appInstance && typeof appInstance.forceRecalculateVidanges === 'function') {
        appInstance.forceRecalculateVidanges();
      }
      this.renderTrucks();
      this.renderStats();
      if (typeof this.renderVidangeSection === 'function') {
        this.renderVidangeSection();
      }
    } catch(e) { alert('Erreur suppression: ' + e.message); }
  }

  // ── Dedicated Vidange Acknowledge Helper (F12 / F13) ───────────
  async acknowledgeVidange(deviceId, truckName, odometerKm, technician = '', note = '') {
    try {
      const code = localStorage.getItem('fleetAccessCode') || this.currentCode || '12345';
      const res = await fetch(`${FLEET_CONFIG.API.baseUrl}/api/vidange/acknowledge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-access-code': code },
        body: JSON.stringify({
          deviceId: String(deviceId),
          truckName: truckName || '',
          odometer: parseInt(odometerKm, 10) || 0,
          technician: technician || '',
          note: note || 'Acknowledge via UI'
        })
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const resData = await res.json().catch(() => ({}));
      if (resData && resData.vidangeOverrides) {
        FLEET_CONFIG.VIDANGE_OVERRIDES = resData.vidangeOverrides;
        FLEET_CONFIG.vidangeOverrides = resData.vidangeOverrides;
      } else if (typeof this.loadSettingsFromCloud === 'function') {
        await this.loadSettingsFromCloud();
      }
      const appInstance = (typeof app !== 'undefined' && app) || window.app;
      if (appInstance && typeof appInstance.forceRecalculateVidanges === 'function') {
        appInstance.forceRecalculateVidanges();
      }
      this.renderTrucks();
      this.renderStats();
      if (typeof this.renderVidangeSection === 'function') {
        this.renderVidangeSection();
      }
      if (typeof window.showToast === 'function') {
        window.showToast(`✅ Vidange acquittée pour ${truckName || deviceId} (${odometerKm} km)`, 'success');
      }
      return resData;
    } catch(err) {
      console.error('[acknowledgeVidange]', err);
      alert('Erreur acquittement vidange: ' + err.message);
    }
  }

  // ── Utility methods (button event stubs) ────────────────────
  addCustomLocation() {
    if (typeof this.openZoneManagementModal === 'function') {
      this.openZoneManagementModal();
    } else {
      if (window.showToast) showToast('Ouvrez la carte → Zones pour ajouter un emplacement', 'info');
    }
  }

  addClient() {
    if (typeof this.openClientEditorModal === 'function') {
      this.openClientEditorModal(null);
    } else if (typeof this.openZoneManagementModal === 'function') {
      this.openZoneManagementModal();
      setTimeout(() => { const tabs = document.querySelectorAll('.zmTab'); if (tabs[2]) tabs[2].click(); }, 120);
    }
  }

  // =========================================================================
  // 5. NATIVE FORMATTED EXCEL FLEET STATUS EXPORT (F5)
  // =========================================================================
  exportFleetXLSX() {
    const trucks = (app && typeof app.getAllTrucks === 'function') ? app.getAllTrucks() : [];
    if (!trucks.length) {
      if (typeof showToast === 'function') showToast('Aucune donnée camion disponible.', 'warning');
      else alert('Aucune donnée camion disponible.');
      return;
    }

    const data = trucks.map(t => {
      const status = t.isGpsCut ? 'Coupure GPS' : (t.speed > 0 ? 'En route' : 'À l\'arrêt');
      const gpsQuality = t.isGpsCut ? 'OFFLINE' : 'ONLINE';
      const loc = t.location ? (t.location.formatted || `${t.location.city || ''}, ${t.location.wilaya || ''}`) : 'Inconnu';
      const vidangeKm = (t.vidange && t.vidange.kmUntilNext !== undefined && t.vidange.kmUntilNext !== 999999)
        ? t.vidange.kmUntilNext
        : 'N/A';
      const vidangeStatus = t.vidange?.status || 'OK';

      return {
        truckName: t.name || '',
        deviceId: String(t.id || ''),
        status: status,
        speed: t.speed || 0,
        fuelLiters: t.fuelLiters || t.fuelLevel || 0,
        fuelPercentage: t.fuelPercentage || 0,
        fuelCapacity: t.fuelTankCapacity || 600,
        rangeKm: t.rangeKm || 0,
        odometer: t.odometer || 0,
        vidangeRemaining: vidangeKm,
        vidangeStatus: vidangeStatus,
        location: loc,
        lat: t.coordinates?.lat || t.lat || 0,
        lng: t.coordinates?.lng || t.lng || 0,
        gpsSignal: gpsQuality,
        lastUpdate: t.timestamp ? new Date(t.timestamp).toLocaleString('fr-FR') : new Date().toLocaleString('fr-FR')
      };
    });

    const columns = [
      { header: 'Camion', key: 'truckName', type: 'string' },
      { header: 'IMEI / ID', key: 'deviceId', type: 'string' },
      { header: 'Statut', key: 'status', type: 'string' },
      { header: 'Vitesse (km/h)', key: 'speed', type: 'number', format: '#,##0' },
      { header: 'Carburant (L)', key: 'fuelLiters', type: 'number', format: '#,##0' },
      { header: 'Carburant (%)', key: 'fuelPercentage', type: 'number', format: '0' },
      { header: 'Capacité (L)', key: 'fuelCapacity', type: 'number', format: '#,##0' },
      { header: 'Autonomie (km)', key: 'rangeKm', type: 'number', format: '#,##0' },
      { header: 'Odomètre (km)', key: 'odometer', type: 'number', format: '#,##0' },
      { header: 'Vidange Dans (km)', key: 'vidangeRemaining', type: 'string' },
      { header: 'Statut Vidange', key: 'vidangeStatus', type: 'string' },
      { header: 'Lieu Actuel', key: 'location', type: 'string' },
      { header: 'Latitude', key: 'lat', type: 'number', format: '0.0000' },
      { header: 'Longitude', key: 'lng', type: 'number', format: '0.0000' },
      { header: 'Signal GPS', key: 'gpsSignal', type: 'string' },
      { header: 'Dernière MàJ', key: 'lastUpdate', type: 'string' }
    ];

    const filename = `flotte_${new Date().toISOString().slice(0, 10)}.xlsx`;
    const sheetName = 'Statut Flotte';
    const title = 'ÉTAT GÉNÉRAL DU PARC DE VÉHICULES EN TEMPS RÉEL';

    if (window.ExcelExportEngine && typeof window.ExcelExportEngine.exportTableToXlsx === 'function') {
      window.ExcelExportEngine.exportTableToXlsx({
        filename,
        sheetName,
        title,
        columns,
        data,
        metadata: {
          exportedAt: new Date().toISOString(),
          totalTrucks: data.length
        }
      });
      if (typeof showToast === 'function') showToast(`Export Excel flotte réussi (${data.length} camions).`, 'success');
    } else {
      let csv = 'Camion,IMEI,Statut,Vitesse (km/h),Carburant (L),Carburant (%),Capacité (L),Odomètre,Lieu,Signal GPS,Mise à jour\n';
      data.forEach(r => {
        csv += `"${r.truckName}","${r.deviceId}","${r.status}",${r.speed},${r.fuelLiters},${r.fuelPercentage},${r.fuelCapacity},${r.odometer},"${r.location.replace(/"/g, '""')}","${r.gpsSignal}","${r.lastUpdate}"\n`;
      });
      this._downloadCSV(csv, filename.replace('.xlsx', '.csv'));
    }
  }

  exportCSV() {
    this.exportFleetXLSX();
  }

  exportJSON() {
    const trucks = (app && typeof app.getAllTrucks === 'function') ? app.getAllTrucks() : [];
    if (!trucks.length) { alert('Aucune donnée camion disponible.'); return; }
    const blob = new Blob([JSON.stringify(trucks, null, 2)], {type:'application/json'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href=url;
    a.download = `fleet_${new Date().toISOString().slice(0,10)}.json`;
    a.click(); URL.revokeObjectURL(url);
  }




_naftalSortTable(tblId, colIdx) {
    var tbl = document.getElementById(tblId);
    if (!tbl) return;
    var tbody = tbl.querySelector('tbody');
    if (!tbody) return;

    // Toggle direction
    var key = tblId + '_' + colIdx;
    if (!this._nv5SortState) this._nv5SortState = {};
    var dir = this._nv5SortState[key] === 'asc' ? 'desc' : 'asc';
    this._nv5SortState[key] = dir;

    // Update header arrows
    tbl.querySelectorAll('th[data-sortcol]').forEach(function(th) {
      var span = th.querySelector('span');
      if (span) span.textContent = ' ⇅';
      th.style.background = '';
    });
    var activeTh = tbl.querySelector('th[data-sortcol="' + colIdx + '"]');
    if (activeTh) {
      var sp = activeTh.querySelector('span');
      if (sp) sp.textContent = dir === 'asc' ? ' ↑' : ' ↓';
      activeTh.style.background = '#e0f2fe';
    }

    // Sort rows
    var rows = Array.from(tbody.querySelectorAll('tr'));
    rows.sort(function(a, b) {
      var tdA = a.querySelectorAll('td')[colIdx];
      var tdB = b.querySelectorAll('td')[colIdx];
      var va = tdA ? (tdA.textContent || tdA.innerText || '').trim() : '';
      var vb = tdB ? (tdB.textContent || tdB.innerText || '').trim() : '';
      // Try numeric comparison
      var na = parseFloat(va.replace(/[^0-9.-]/g, ''));
      var nb = parseFloat(vb.replace(/[^0-9.-]/g, ''));
      if (!isNaN(na) && !isNaN(nb)) {
        return dir === 'asc' ? na - nb : nb - na;
      }
      // Date comparison
      var da = new Date(va), db2 = new Date(vb);
      if (!isNaN(da) && !isNaN(db2)) {
        return dir === 'asc' ? da - db2 : db2 - da;
      }
      // String comparison
      return dir === 'asc' ? va.localeCompare(vb, 'fr') : vb.localeCompare(va, 'fr');
    });
    rows.forEach(function(r) { tbody.appendChild(r); });
  }

  // =============================================================
  // 🚖 SUIVI DISPONIBILITÉ & CHAUFFEURS / REMORQUES MANAGEMENT
  // =============================================================

  async renderDisponibiliteSection() {
    this._dispoSituationFilter = this._dispoSituationFilter || 'all';
    this._dispoViewMode = this._dispoViewMode || 'table';
    this._dispoSearchQuery = this._dispoSearchQuery || '';
    
    // Auto-refresh interval if not set
    if (!this._dispoPollInterval) {
      this._dispoPollInterval = setInterval(() => {
        const section = document.getElementById('disponibiliteSection');
        if (section && section.classList.contains('active')) {
          this.fetchDisponibiliteData(false);
        }
      }, 10000);
    }

    await this.fetchDisponibiliteData(true);
  }

  async fetchDisponibiliteData(renderLoading = true) {
    const container = document.getElementById('dispoTableContainer');
    if (renderLoading && container && (!this._dispoData || !this._dispoData.items)) {
      container.innerHTML = '<div style="text-align:center; padding:40px; color:var(--text-muted);"><i class="fa-solid fa-sync fa-spin"></i> Chargement disponibilité...</div>';
    }

    try {
      const res = await fetch(`${FLEET_CONFIG.API.baseUrl}/api/fleet/availability`, {
        headers: { 'x-access-code': this.currentCode }
      });
      if (res.ok) {
        this._dispoData = await res.json();
        this.updateDispoKPIs();
        this.populateDispoWilayas();
        this.renderDispoContent();
        // Check for auto-detected missions and show prompts
        this._checkAutoMissionNotifications().catch(() => {});
      }
    } catch (err) {
      console.warn('Erreur chargement suivi disponibilité:', err.message);
    }
  }

  updateDispoKPIs() {
    const c = this._dispoData?.counts || {};
    const elTotal = document.getElementById('dispoKpiTotal');
    const elMission = document.getElementById('dispoKpiMission');
    const elDispo = document.getElementById('dispoKpiDispo');
    const elSansChauffeur = document.getElementById('dispoKpiSansChauffeur');
    const elChargement = document.getElementById('dispoKpiChargement');
    const elMaint = document.getElementById('dispoKpiMaint');
    const elPanne = document.getElementById('dispoKpiPanne');
    const elRepos = document.getElementById('dispoKpiRepos');
    const elRecup = document.getElementById('dispoKpiRecup');
    const elConge = document.getElementById('dispoKpiConge');

    if (elTotal) elTotal.textContent = c.total || 0;
    if (elMission) elMission.textContent = c.mission || 0;
    if (elDispo) elDispo.textContent = c.disponible || 0;
    if (elSansChauffeur) elSansChauffeur.textContent = c.sans_chauffeur || 0;
    if (elChargement) elChargement.textContent = c.chargement || 0;
    if (elMaint) elMaint.textContent = c.maintenance || 0;
    if (elPanne) elPanne.textContent = c.panne || 0;
    if (elRepos) elRepos.textContent = c.repos || 0;
    if (elRecup) elRecup.textContent = c.recup || 0;
    if (elConge) elConge.textContent = c.conge || 0;
  }

  populateDispoWilayas() {
    const select = document.getElementById('dispoWilayaFilter');
    if (!select) return;
    const cur = select.value;
    const wilayas = new Set();
    (this._dispoData?.items || []).forEach(item => {
      if (item.locationCity && item.locationCity !== 'En route') wilayas.add(item.locationCity);
    });
    const sorted = Array.from(wilayas).sort();
    let html = '<option value="all">Toutes Wilayas</option>';
    sorted.forEach(w => {
      html += `<option value="${w}" ${w === cur ? 'selected' : ''}>${w}</option>`;
    });
    select.innerHTML = html;
  }

  handleDispoFilter() {
    const input = document.getElementById('dispoSearchInput');
    this._dispoSearchQuery = (input ? input.value : '').trim().toLowerCase();
    this.renderDispoContent();
  }

  setDispoSituationFilter(sit) {
    this._dispoSituationFilter = sit;
    document.querySelectorAll('#dispoFilterPills .btn-filter-pill').forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-sit') === sit);
    });
    this.renderDispoContent();
  }

  toggleDispoViewMode() {
    this._dispoViewMode = this._dispoViewMode === 'table' ? 'cards' : 'table';
    const btn = document.getElementById('dispoViewModeBtn');
    if (btn) btn.innerHTML = this._dispoViewMode === 'table' ? '<i class="fa-solid fa-table"></i>' : '<i class="fa-solid fa-grip"></i>';
    this.renderDispoContent();
  }

  setDispoSort(col) {
    if (this._dispoSortCol === col) {
      this._dispoSortDir = this._dispoSortDir === 'asc' ? 'desc' : 'asc';
    } else {
      this._dispoSortCol = col;
      this._dispoSortDir = ['speed', 'fuel', 'odometer', 'lastUpdate'].includes(col) ? 'desc' : 'asc';
    }
    this.renderDispoContent();
  }

  getFilteredDispoItems() {
    let list = this._dispoData?.items || [];
    if (this._dispoSituationFilter && this._dispoSituationFilter !== 'all') {
      list = list.filter(item => item.situation === this._dispoSituationFilter);
    }
    const wilaya = document.getElementById('dispoWilayaFilter')?.value || 'all';
    if (wilaya !== 'all') {
      list = list.filter(item => (item.locationCity || '').includes(wilaya));
    }
    if (this._dispoSearchQuery) {
      list = list.filter(item => {
        const tName = (item.truckName || '').toLowerCase();
        const tImm = (item.immatriculation || '').toLowerCase();
        const dName = (item.driver?.name || '').toLowerCase();
        const dPhone = (item.driver?.phone || '').toLowerCase();
        const trImm = (item.trailer?.immatriculation || '').toLowerCase();
        const loc = (item.locationCity || '').toLowerCase();
        const mOrig = (item.activeMission?.origin || '').toLowerCase();
        const mDest = (item.activeMission?.destination || '').toLowerCase();
        const mCargo = (item.activeMission?.cargo || '').toLowerCase();
        return tName.includes(this._dispoSearchQuery) || tImm.includes(this._dispoSearchQuery) ||
               dName.includes(this._dispoSearchQuery) || dPhone.includes(this._dispoSearchQuery) ||
               trImm.includes(this._dispoSearchQuery) || loc.includes(this._dispoSearchQuery) ||
               mOrig.includes(this._dispoSearchQuery) || mDest.includes(this._dispoSearchQuery) ||
               mCargo.includes(this._dispoSearchQuery);
      });
    }

    /* ── Column Sorting (Ascending / Descending) ── */
    const sortCol = this._dispoSortCol || 'truckName';
    const sortDir = this._dispoSortDir === 'desc' ? -1 : 1;
    list = [...list].sort((a, b) => {
      if (sortCol === 'truckName') {
        const nA = (a.truckName || '').toLowerCase();
        const nB = (b.truckName || '').toLowerCase();
        return sortDir * nA.localeCompare(nB, 'fr', { numeric: true });
      }
      if (sortCol === 'driver') {
        const dA = (a.driver?.name || '').toLowerCase();
        const dB = (b.driver?.name || '').toLowerCase();
        if (!dA && dB) return 1;
        if (dA && !dB) return -1;
        return sortDir * dA.localeCompare(dB, 'fr');
      }
      if (sortCol === 'trailer') {
        const tA = (a.trailer?.immatriculation || '').toLowerCase();
        const tB = (b.trailer?.immatriculation || '').toLowerCase();
        if (!tA && tB) return 1;
        if (tA && !tB) return -1;
        return sortDir * tA.localeCompare(tB, 'fr', { numeric: true });
      }
      if (sortCol === 'situation') {
        const sA = (a.situationLabel || a.situation || '').toLowerCase();
        const sB = (b.situationLabel || b.situation || '').toLowerCase();
        return sortDir * sA.localeCompare(sB, 'fr');
      }
      if (sortCol === 'location') {
        const lA = (a.locationCity || '').toLowerCase();
        const lB = (b.locationCity || '').toLowerCase();
        return sortDir * lA.localeCompare(lB, 'fr');
      }
      if (sortCol === 'speed') {
        const spA = Number(a.speed || 0);
        const spB = Number(b.speed || 0);
        return sortDir * (spA - spB);
      }
      if (sortCol === 'fuel') {
        const fA = Number(a.fuelPercent || a.fuelLiters || 0);
        const fB = Number(b.fuelPercent || b.fuelLiters || 0);
        return sortDir * (fA - fB);
      }
      if (sortCol === 'odometer') {
        const oA = Number(a.odometer || 0);
        const oB = Number(b.odometer || 0);
        return sortDir * (oA - oB);
      }
      return 0;
    });

    return list;
  }

  renderDispoContent() {
    const container = document.getElementById('dispoTableContainer');
    if (!container) return;
    const items = this.getFilteredDispoItems();

    if (items.length === 0) {
      container.innerHTML = `
        <div style="text-align:center; padding:50px 20px; background:var(--bg-surface); border:1px solid var(--border); border-radius:14px; color:var(--text-muted);">
          <i class="fa-solid fa-truck-ramp-box" style="font-size:36px; opacity:0.3; margin-bottom:12px; display:block;"></i>
          <div style="font-size:14px; font-weight:700; color:var(--text-secondary);">Aucun véhicule correspondant aux filtres</div>
          <div style="font-size:12px; margin-top:4px;">Modifiez votre recherche ou réinitialisez les filtres.</div>
        </div>`;
      return;
    }

    if (this._dispoViewMode === 'table') {
      this.renderDispoTable(items, container);
    } else {
      this.renderDispoCards(items, container);
    }
  }

  renderDispoTable(items, container) {
    const sortCol = this._dispoSortCol || 'truckName';
    const sortDir = this._dispoSortDir || 'asc';
    const getSortIcon = (col) => {
      if (sortCol === col) {
        return sortDir === 'asc' 
          ? `<i class="fa-solid fa-arrow-up-short-wide" style="color:#38bdf8; font-size:11px; margin-left:6px;"></i>` 
          : `<i class="fa-solid fa-arrow-down-wide-short" style="color:#38bdf8; font-size:11px; margin-left:6px;"></i>`;
      }
      return `<i class="fa-solid fa-sort" style="color:var(--text-muted); opacity:0.35; font-size:10px; margin-left:6px;"></i>`;
    };
    const getThClass = (col) => sortCol === col ? 'sortable active-sort' : 'sortable';

    let html = `
      <div style="background:var(--bg-surface); border:1px solid var(--border); border-radius:12px; overflow:hidden; box-shadow:0 1px 3px rgba(0,0,0,0.06);">
        <table class="dispo-table" style="width:100%; border-collapse:collapse; font-size:12px;">
          <thead>
            <tr style="background:var(--bg-elevated); border-bottom:2px solid var(--primary);">
              <th class="${getThClass('truckName')}" onclick="ui.setDispoSort('truckName')" title="Trier par camion" style="padding:14px 16px; text-align:left; color:${sortCol==='truckName'?'#38bdf8':'var(--text-muted)'}; font-size:11px; text-transform:uppercase; letter-spacing:0.6px; cursor:pointer;">
                Camion ${getSortIcon('truckName')}
              </th>
              <th class="${getThClass('driver')}" onclick="ui.setDispoSort('driver')" title="Trier par chauffeur" style="padding:14px 16px; text-align:left; color:${sortCol==='driver'?'#38bdf8':'var(--text-muted)'}; font-size:11px; text-transform:uppercase; letter-spacing:0.6px; cursor:pointer;">
                Chauffeur ${getSortIcon('driver')}
              </th>
              <th class="${getThClass('trailer')}" onclick="ui.setDispoSort('trailer')" title="Trier par remorque" style="padding:14px 16px; text-align:left; color:${sortCol==='trailer'?'#38bdf8':'var(--text-muted)'}; font-size:11px; text-transform:uppercase; letter-spacing:0.6px; cursor:pointer;">
                Remorque ${getSortIcon('trailer')}
              </th>
              <th class="${getThClass('situation')}" onclick="ui.setDispoSort('situation')" title="Trier par situation opérationnelle" style="padding:14px 16px; text-align:left; color:${sortCol==='situation'?'#38bdf8':'var(--text-muted)'}; font-size:11px; text-transform:uppercase; letter-spacing:0.6px; cursor:pointer;">
                Situation & Trajet ${getSortIcon('situation')}
              </th>
              <th class="${getThClass('location')}" onclick="ui.setDispoSort('location')" title="Trier par ville / wilaya" style="padding:14px 16px; text-align:left; color:${sortCol==='location'?'#38bdf8':'var(--text-muted)'}; font-size:11px; text-transform:uppercase; letter-spacing:0.6px; cursor:pointer;">
                Localisation Live ${getSortIcon('location')}
              </th>
              <th class="${getThClass('speed')}" onclick="ui.setDispoSort('speed')" title="Trier par vitesse / télématique" style="padding:14px 16px; text-align:left; color:${sortCol==='speed'?'#38bdf8':'var(--text-muted)'}; font-size:11px; text-transform:uppercase; letter-spacing:0.6px; cursor:pointer;">
                Télématique ${getSortIcon('speed')}
              </th>
              <th style="padding:14px 16px; text-align:center; color:var(--text-muted); font-size:11px; text-transform:uppercase; letter-spacing:0.6px;">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>`;

    items.forEach((item, rIdx) => {
      const mapsUrl = `https://www.google.com/maps?q=${item.lat || 0},${item.lng || 0}&t=k&z=17`;
      const mission = item.activeMission;
      const isEven = rIdx % 2 === 1;
      const rowBg = isEven ? 'rgba(56,189,248,0.03)' : 'transparent';
      html += `
        <tr style="background:${rowBg}; border-bottom:1px solid var(--border); transition:background 0.15s ease;" onmouseover="this.style.background='rgba(56,189,248,0.06)'" onmouseout="this.style.background='${rowBg}'">
          <td style="padding:12px 16px; border-right:1px solid var(--border);">
            <strong style="color:var(--text-primary); font-size:13px; font-weight:800;">${item.truckName}</strong>
            <div style="display:flex; gap:4px; margin-top:4px; flex-wrap:wrap;">
              ${item.immatriculation ? `<span class="truck-meta-tag imm">${item.immatriculation}</span>` : ''}
              ${item.carteNaftal ? `<span class="truck-meta-tag naftal"><i class="fa-solid fa-credit-card"></i> ${item.carteNaftal}</span>` : ''}
            </div>
          </td>
          <td style="padding:12px 16px; border-right:1px solid var(--border);">
            ${item.driver ? `
              <div style="font-weight:700; color:var(--primary); font-size:13px; cursor:pointer;" onclick="ui.openDriverSituationModal('${item.driver.id}', '${item.driver.name.replace(/'/g, "\\'")}', '${item.driver.situation}')">
                <i class="fa-solid fa-user" style="margin-right:3px;"></i> ${item.driver.name}
              </div>
              <div style="display:flex; align-items:center; gap:6px; margin-top:2px; flex-wrap:wrap;">
                ${item.driver.phone ? `
                  <a href="tel:${item.driver.phone}" style="color:#38bdf8; font-size:11px; text-decoration:none; display:inline-flex; align-items:center; gap:4px;" title="Appeler">
                    <i class="fa-solid fa-phone" style="font-size:9px; color:#10b981;"></i> ${item.driver.phone}
                  </a>
                ` : '<span style="color:var(--text-muted); font-size:11px;">Sans tél</span>'}
                ${item.driver.licenseCategory ? `<span style="background:rgba(245,158,11,0.1); color:#f59e0b; padding:0 5px; border-radius:5px; font-size:8px; font-weight:800; font-family:monospace; border:1px solid rgba(245,158,11,0.2);">🪪 ${item.driver.licenseCategory}</span>` : ''}
              </div>
            ` : '<button class="btn-secondary" onclick="ui.openAssignFleetModal(\''+item.deviceId+'\')" style="padding:3px 8px; font-size:11px;"><i class="fa-solid fa-plus"></i> Assigner</button>'}
          </td>
          <td style="padding:12px 16px; border-right:1px solid var(--border);">
            ${item.trailer ? `
              <div><span class="truck-meta-tag trailer"><i class="fa-solid fa-trailer"></i> ${item.trailer.immatriculation}</span></div>
              <div style="font-size:11px; color:var(--text-muted); margin-top:2px;">${item.trailer.type || 'Plateau'}</div>
            ` : '<span style="color:var(--text-muted); font-size:11px;">—</span>'}
          </td>
          <td style="padding:12px 16px; border-right:1px solid var(--border);">
            <span class="situation-badge ${item.situationBadge}">
              ${item.isMoving ? '<span class="pulse-dot" style="width:6px; height:6px; background:#10b981; border-radius:50%; display:inline-block; animation:pulse 2s infinite;"></span>' : ''}
              ${item.situationLabel}
            </span>
            ${mission ? `
              <div style="display:flex; align-items:center; gap:4px; margin-top:4px; flex-wrap:wrap;">
                ${(mission.missionId || mission.historyId || '').startsWith('AUTO-') ? '<span style="background:rgba(139,92,246,0.1); color:#a78bfa; padding:1px 5px; border-radius:5px; font-size:8px; font-weight:800;">🤖 Auto</span>' : ''}
                ${mission.clientName ? `<span style="background:rgba(16,185,129,0.08); color:#10b981; padding:1px 6px; border-radius:5px; font-size:8px; font-weight:700;">🏢 ${mission.clientName}</span>` : ''}
                ${mission.finalClientName ? `<span style="background:rgba(139,92,246,0.08); color:#a78bfa; padding:1px 6px; border-radius:5px; font-size:8px; font-weight:700;">🤝 ${mission.finalClientName}</span>` : ''}
              </div>
              <div style="font-weight:700; color:var(--primary); font-size:11px; margin-top:3px;">
                <i class="fa-solid fa-location-arrow"></i> ${mission.origin} → ${mission.destination}
              </div>
              <div style="font-size:10px; color:var(--text-muted); margin-top:1px;">
                ${mission.cargo || 'Fret'} ${mission.orderRef ? `· ${mission.orderRef}` : ''}${mission.estimatedDistanceKm ? ' · 📏 ' + mission.estimatedDistanceKm + ' km' : ''}
              </div>
            ` : ''}
          </td>
          <td style="padding:12px 16px; border-right:1px solid var(--border);">
            <div style="display:flex; align-items:center; gap:6px;">
              <i class="fa-solid fa-location-dot" style="color:var(--primary);"></i>
              <span style="font-weight:600; color:var(--text-primary);">${item.locationCity || 'En route'}</span>
            </div>
          </td>
          <td style="padding:12px 16px; border-right:1px solid var(--border);">
            <div style="font-weight:700; color:${item.speed >= 1 ? '#10b981' : 'var(--text-muted)'}; font-family:var(--font-mono);">
              ${item.speed} km/h
            </div>
            <div style="font-size:11px; color:var(--text-muted); margin-top:2px;">
              ${item.fuelLiters ? `${item.fuelLiters}L (${item.fuelPercent}%)` : ''}
              ${item.odometer ? ` · ${item.odometer.toLocaleString()} km` : ''}
            </div>
          </td>
          <td style="padding:12px 16px; text-align:center;">
            <div style="display:flex; justify-content:center; gap:5px; flex-wrap:wrap;">
              ${mission ? `
                <button class="btn-secondary" onclick="ui.completeFleetMission('${mission.historyId}', '${item.truckName.replace(/'/g, "\\'")}')" title="Terminer et clôturer la mission" style="padding:5px 8px; font-size:11px; color:#10b981; border-color:rgba(16,185,129,0.3);">
                  <i class="fa-solid fa-flag-checkered"></i>
                </button>
                ${mission.routeGeometry ? `
                  <button class="btn-secondary" onclick="ui.showMissionRoute('${mission.historyId}')" title="Voir itinéraire prévu" style="padding:5px 8px; font-size:11px; color:#3b82f6; border-color:rgba(59,130,246,0.3);">
                    <i class="fa-solid fa-map"></i>
                  </button>
                ` : ''}
              ` : `
                <button class="btn-secondary" onclick="ui.openNewMissionModal('${item.deviceId}')" title="Affecter / Lancer une mission" style="padding:5px 8px; font-size:11px; color:#38bdf8; border-color:rgba(56,189,248,0.3);">
                  <i class="fa-solid fa-route"></i>
                </button>
              `}
              <button class="btn-secondary" onclick="ui.openStatusModal('truck', '${item.deviceId}')" title="Signaler statut / panne" style="padding:5px 8px; font-size:11px; color:#ef4444; border-color:rgba(239,68,68,0.3);">
                <i class="fa-solid fa-triangle-exclamation"></i>
              </button>
              <button class="btn-secondary" onclick="ui.openAssignFleetModal('${item.deviceId}')" title="Modifier assignation" style="padding:5px 8px; font-size:11px;">
                <i class="fa-solid fa-pen-to-square"></i>
              </button>
              <a href="${mapsUrl}" target="_blank" class="btn-secondary" title="Voir satellite Google Maps" style="padding:5px 8px; font-size:11px; text-decoration:none;">
                <i class="fa-solid fa-map-location-dot"></i>
              </a>
            </div>
          </td>
        </tr>`;
    });

    html += `</tbody></table></div>`;
    container.innerHTML = html;
  }

  renderDispoCards(items, container) {
    let html = `<div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(320px, 1fr)); gap:14px;">`;
    items.forEach((item, idx) => {
      const mapsUrl = `https://www.google.com/maps?q=${item.lat || 0},${item.lng || 0}&t=k&z=17`;
      const mission = item.activeMission;
      const isMoving = item.speed >= 1;
      const tn = (item.truckName||'').replace(/'/g, "\\'");

      /* ── accent color based on state ── */
      let ac = '#3b82f6', ag = 'linear-gradient(135deg,#1d4ed8,#60a5fa)';
      if (item.isGpsCut) { ac = '#ef4444'; ag = 'linear-gradient(135deg,#991b1b,#f87171)'; }
      else if (isMoving) { ac = '#10b981'; ag = 'linear-gradient(135deg,#059669,#6ee7b7)'; }
      else if (item.situation === 'maintenance') { ac = '#f59e0b'; ag = 'linear-gradient(135deg,#d97706,#fcd34d)'; }
      else if (item.situation === 'panne') { ac = '#ef4444'; ag = 'linear-gradient(135deg,#dc2626,#fca5a5)'; }
      else if (item.situation === 'repos') { ac = '#8b5cf6'; ag = 'linear-gradient(135deg,#7c3aed,#c4b5fd)'; }

      /* ── fuel gauge ── */
      const fp = item.fuelPercent || 0;
      const fc = fp <= 15 ? '#ef4444' : fp <= 30 ? '#f59e0b' : '#10b981';
      const odoKm = (item.odometer||0).toLocaleString();
      const fuelL = item.fuelLiters||0;

      /* ── situation badge ── */
      const sitLabel = item.situationLabel || 'Inconnu';
      const sitBadge = item.situationBadge || '';

      /* ── driver situation ── */
      let drvSitDot = '#6b7280', drvSitText = '';
      if (item.driver) {
        const ds = item.driver.situation || item.situation || '';
        if (ds === 'en_mission' || mission) { drvSitDot = '#10b981'; drvSitText = 'En mission'; }
        else if (ds === 'disponible') { drvSitDot = '#3b82f6'; drvSitText = 'Disponible'; }
        else if (ds === 'repos') { drvSitDot = '#8b5cf6'; drvSitText = 'Repos'; }
        else if (ds === 'conge') { drvSitDot = '#f59e0b'; drvSitText = 'Congé'; }
        else if (ds === 'malade') { drvSitDot = '#ef4444'; drvSitText = 'Malade'; }
        else { drvSitText = ds || ''; }
      }

      /* ── GPS freshness ── */
      let gpsAgoText = '';
      const gpsTs = item.lastUpdate || item.timestamp;
      if (gpsTs) {
        const diffMs = Date.now() - new Date(gpsTs).getTime();
        const diffMin = Math.floor(diffMs / 60000);
        if (diffMin < 1) gpsAgoText = "à l'instant";
        else if (diffMin < 60) gpsAgoText = 'il y a ' + diffMin + ' min';
        else if (diffMin < 1440) gpsAgoText = 'il y a ' + Math.floor(diffMin/60) + 'h' + String(diffMin%60).padStart(2,'0');
        else gpsAgoText = 'il y a ' + Math.floor(diffMin/1440) + 'j';
      }

      html += `
        <div class="ftc-card" style="
          position:relative; background:var(--bg-surface); border-radius:12px; overflow:hidden;
          border:1px solid var(--border); transition:all 0.2s ease;
          box-shadow:0 1px 3px rgba(0,0,0,0.06);
          animation: cardSlideIn 0.3s ease both;
          animation-delay: ${idx * 30}ms;
        " onmouseover="this.style.transform='translateY(-2px)';this.style.boxShadow='0 4px 12px rgba(0,0,0,0.1)';this.style.borderColor='${ac}'" onmouseout="this.style.transform='';this.style.boxShadow='0 1px 3px rgba(0,0,0,0.06)';this.style.borderColor='var(--border)'">

          <!-- ▸ Top Accent Bar -->
          <div style="height:4px; background:${ag};"></div>

          <!-- ▸ Header Row -->
          <div style="padding:12px 14px 0; display:flex; justify-content:space-between; align-items:flex-start;">
            <div style="display:flex; align-items:center; gap:10px; min-width:0; flex:1;">
              <div style="
                width:38px; height:38px; border-radius:10px; background:${ag};
                display:flex; align-items:center; justify-content:center; flex-shrink:0;
                box-shadow:0 4px 12px ${ac}40;
              ">
                ${isMoving
                  ? '<i class="fa-solid fa-truck-fast" style="color:#fff; font-size:15px;"></i>'
                  : '<i class="fa-solid fa-truck" style="color:#fff; font-size:14px;"></i>'}
              </div>
              <div style="min-width:0; flex:1;">
                <div style="font-size:15px; font-weight:900; color:var(--text-primary); letter-spacing:-0.3px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${item.truckName}</div>
                <div style="font-size:10px; color:var(--text-muted); font-family:monospace; margin-top:1px;">${item.immatriculation || '\u2014'}</div>
              </div>
            </div>
            <div style="display:flex; align-items:center; gap:5px; flex-shrink:0;">
              <span class="situation-badge ${sitBadge}" style="font-size:10px;">${sitLabel}</span>
              <span style="
                background:${isMoving ? 'rgba(16,185,129,0.12)' : 'var(--bg-elevated)'};
                color:${isMoving ? '#10b981' : 'var(--text-muted)'};
                padding:3px 8px; border-radius:8px; font-size:11px; font-weight:800;
                font-family:monospace; border:1px solid ${isMoving ? 'rgba(16,185,129,0.2)' : 'rgba(255,255,255,0.15)'};
              ">${item.speed} <span style="font-size:8px;">km/h</span></span>
            </div>
          </div>

          <!-- ▸ Driver + Trailer Row -->
          <div style="padding:10px 14px; display:flex; gap:8px;">
            <div style="flex:1; background:var(--bg-elevated); border-radius:10px; padding:8px 10px; border:1.2px solid rgba(255,255,255,0.16); min-width:0;">
              <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:3px;">
                <div style="font-size:8px; text-transform:uppercase; font-weight:800; color:var(--text-muted); letter-spacing:0.5px;"><i class="fa-solid fa-user" style="margin-right:3px;"></i>CHAUFFEUR</div>
                ${item.driver && drvSitText ? `<span style="display:inline-flex; align-items:center; gap:3px; font-size:7px; font-weight:700; color:${drvSitDot}; background:${drvSitDot}12; padding:1px 6px; border-radius:6px; border:1px solid ${drvSitDot}25;"><span style="width:5px;height:5px;border-radius:50%;background:${drvSitDot};display:inline-block;"></span>${drvSitText}</span>` : ''}
              </div>
              ${item.driver
                ? `<div style="font-weight:700; color:var(--primary); font-size:12px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; cursor:pointer;" onclick="ui.openDriverSituationModal('${item.driver.id}', '${(item.driver.name||'').replace(/'/g, "\\\\'")}', '${item.driver.situation}')">${item.driver.name}</div><div style="display:flex; align-items:center; gap:6px; margin-top:2px; flex-wrap:wrap;">${item.driver.phone ? `<a href="tel:${item.driver.phone}" style="color:var(--text-secondary); font-size:10px; text-decoration:none; display:inline-flex; align-items:center; gap:2px;"><i class="fa-solid fa-phone" style="font-size:7px; color:#10b981;"></i>${item.driver.phone}</a>` : ''}${item.driver.licenseCategory ? `<span style="background:rgba(245,158,11,0.1); color:#f59e0b; padding:0 5px; border-radius:5px; font-size:8px; font-weight:800; font-family:monospace; border:1px solid rgba(245,158,11,0.2);">🪪 ${item.driver.licenseCategory}</span>` : ''}</div>`
                : `<button class="btn-secondary" onclick="ui.openAssignFleetModal('${item.deviceId}')" style="padding:2px 6px; font-size:9px; width:100%;"><i class="fa-solid fa-plus"></i> Assigner</button>`}
            </div>
            <div style="flex:1; background:var(--bg-elevated); border-radius:10px; padding:8px 10px; border:1.2px solid rgba(255,255,255,0.16); min-width:0;">
              <div style="font-size:8px; text-transform:uppercase; font-weight:800; color:var(--text-muted); letter-spacing:0.5px; margin-bottom:3px;"><i class="fa-solid fa-trailer" style="margin-right:3px;"></i>REMORQUE</div>
              ${item.trailer
                ? `<div style="font-weight:700; color:#a78bfa; font-size:12px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${item.trailer.immatriculation}</div><div style="font-size:10px; color:var(--text-muted); margin-top:1px;">${item.trailer.type || 'Plateau'}</div>`
                : `<div style="font-size:11px; color:var(--text-muted); font-style:italic;">—</div>`}
            </div>
          </div>

          <!-- ▸ Metrics Strip -->
          <div style="padding:0 14px; display:flex; gap:6px; margin-bottom:10px;">
            <!-- Odomètre -->
            <div style="flex:1; text-align:center; background:var(--bg-elevated); border-radius:8px; padding:6px 4px; border:1.2px solid rgba(255,255,255,0.16);">
              <div style="font-size:7px; text-transform:uppercase; font-weight:800; color:var(--text-muted); letter-spacing:0.3px;">ODOMÈTRE</div>
              <div style="font-size:15px; font-weight:900; color:var(--text-primary); font-family:monospace; line-height:1.3;">${odoKm}</div>
              <div style="font-size:7px; color:var(--text-muted);">km</div>
            </div>
            <!-- Carburant -->
            <div style="flex:1; text-align:center; background:var(--bg-elevated); border-radius:8px; padding:6px 4px; border:1.2px solid rgba(255,255,255,0.16);">
              <div style="font-size:7px; text-transform:uppercase; font-weight:800; color:var(--text-muted); letter-spacing:0.3px;">CARBURANT</div>
              <div style="font-size:15px; font-weight:900; color:${fc}; font-family:monospace; line-height:1.3;">${fuelL}<span style="font-size:9px;">L</span></div>
              <div style="height:3px; background:var(--bg-surface); border-radius:2px; margin-top:2px; overflow:hidden;"><div style="height:100%; width:${fp}%; background:${fc}; border-radius:2px; transition:width 0.3s;"></div></div>
            </div>
            <!-- Position -->
            <div style="flex:1.2; text-align:center; background:var(--bg-elevated); border-radius:8px; padding:6px 4px; border:1.2px solid rgba(255,255,255,0.16);">
              <div style="font-size:7px; text-transform:uppercase; font-weight:800; color:var(--text-muted); letter-spacing:0.3px;">POSITION</div>
              <div style="font-size:11px; font-weight:700; color:var(--text-primary); margin-top:3px; line-height:1.2; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${item.locationCity || 'En route'}</div>
              <a href="${mapsUrl}" target="_blank" style="font-size:8px; color:${ac}; text-decoration:none;"><i class="fa-solid fa-map-pin"></i> Maps</a>
            </div>
          </div>

          ${item.carteNaftal ? `
          <div style="padding:0 14px 8px; display:flex; align-items:center; gap:6px;">
            <span style="background:rgba(56,189,248,0.08); color:#38bdf8; padding:2px 8px; border-radius:8px; font-size:9px; font-weight:700; font-family:monospace; border:1px solid rgba(56,189,248,0.15);"><i class="fa-solid fa-credit-card" style="font-size:7px; margin-right:3px;"></i>${item.carteNaftal}</span>
          </div>` : ''}

          ${gpsAgoText ? `
          <div style="padding:0 14px 8px; display:flex; align-items:center; gap:5px;">
            <i class="fa-solid fa-satellite-dish" style="font-size:8px; color:${(() => { const gm = Math.floor((Date.now() - new Date(gpsTs).getTime()) / 60000); return gm < 5 ? '#10b981' : gm < 30 ? '#f59e0b' : '#ef4444'; })()};"></i>
            <span style="font-size:9px; font-weight:600; color:var(--text-muted);">GPS: <span style="color:${(() => { const gm = Math.floor((Date.now() - new Date(gpsTs).getTime()) / 60000); return gm < 5 ? '#10b981' : gm < 30 ? '#f59e0b' : '#ef4444'; })()};">${gpsAgoText}</span></span>
          </div>` : ''}

          <!-- ▸ Mission Panel (if active) -->
          ${mission ? `
          <div style="margin:0 14px 10px; background:rgba(16,185,129,0.06); padding:10px 12px; border-radius:10px; border:1px solid rgba(16,185,129,0.15);">
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <div style="flex:1; min-width:0;">
                <div style="display:flex; align-items:center; gap:5px; flex-wrap:wrap;">
                  <span style="font-size:8px; text-transform:uppercase; font-weight:800; color:var(--text-muted);"><i class="fa-solid fa-route" style="margin-right:2px;"></i>Mission</span>
                  ${(mission.missionId || mission.historyId || '').startsWith('AUTO-') ? '<span style="background:rgba(139,92,246,0.12); color:#a78bfa; padding:1px 5px; border-radius:6px; font-size:7px; font-weight:800;">🤖 Auto</span>' : ''}
                  ${mission.clientName ? `<span style="background:rgba(16,185,129,0.1); color:#10b981; padding:1px 5px; border-radius:6px; font-size:7px; font-weight:700;">🏢 ${mission.clientName}</span>` : ''}
                  ${mission.finalClientName ? `<span style="background:rgba(139,92,246,0.1); color:#a78bfa; padding:1px 5px; border-radius:6px; font-size:7px; font-weight:700;">🤝 ${mission.finalClientName}</span>` : ''}
                </div>
                <div style="font-weight:800; color:#10b981; font-size:12px; margin-top:2px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${mission.origin} → ${mission.destination}</div>
                <div style="font-size:9px; color:var(--text-secondary); margin-top:1px;">${mission.cargo || 'Fret'} ${mission.orderRef ? '· BL: ' + mission.orderRef : ''}${mission.estimatedDistanceKm ? ' · 📏 ' + mission.estimatedDistanceKm + ' km' : ''}</div>
              </div>
              <div style="display:flex; flex-direction:column; gap:4px; margin-left:6px;">
                <button class="btn-secondary" onclick="ui.completeFleetMission('${mission.historyId}', '${tn}')" style="padding:5px 10px; font-size:10px; color:#10b981; border-color:rgba(16,185,129,0.3); white-space:nowrap;">
                  <i class="fa-solid fa-flag-checkered"></i> Fin
                </button>
                ${mission.routeGeometry ? `<button class="btn-secondary" onclick="ui.showMissionRoute('${mission.historyId}')" style="padding:4px 8px; font-size:9px; color:#3b82f6; border-color:rgba(59,130,246,0.3); white-space:nowrap;"><i class="fa-solid fa-map"></i> Route</button>` : ''}
              </div>
            </div>
          </div>` : ''}

          <!-- ▸ Action Bar -->
          <div style="padding:0 14px 12px; display:flex; gap:5px;">
            ${!mission ? `<button class="btn-secondary" onclick="ui.openNewMissionModal('${item.deviceId}')" style="flex:1; justify-content:center; padding:7px; font-size:10px; color:#38bdf8; border-color:rgba(56,189,248,0.25); font-weight:700; border-radius:8px;"><i class="fa-solid fa-route"></i> Mission</button>` : ''}
            <button class="btn-secondary" onclick="ui.openAssignFleetModal('${item.deviceId}')" style="flex:1; justify-content:center; padding:7px; font-size:10px; font-weight:700; border-radius:8px;"><i class="fa-solid fa-pen-to-square"></i> Modifier</button>
            <button class="btn-secondary" onclick="ui.openStatusModal('truck', '${item.deviceId}')" style="padding:7px 10px; font-size:10px; color:#ef4444; border-color:rgba(239,68,68,0.25); border-radius:8px;" title="Signaler"><i class="fa-solid fa-triangle-exclamation"></i></button>
          </div>
        </div>`;
    });
    html += `</div>`;
    container.innerHTML = html;
  }



    // ── MODALS: DRIVER CRUD ───────────────────────────────────────
  async openAddDriverModal(driverId = null) {
    const modal = document.getElementById('modalAddDriver');
    if (!modal) return;
    document.getElementById('driverModalId').value = driverId || '';
    document.getElementById('driverModalName').value = '';
    document.getElementById('driverModalPhone').value = '';
    document.getElementById('driverModalLicense').value = '';
    document.getElementById('driverModalCategory').value = 'EC';
    document.getElementById('driverModalExpiry').value = '';
    document.getElementById('driverModalSituation').value = 'disponible';
    document.getElementById('driverModalNotes').value = '';

    const titleEl = document.getElementById('modalAddDriverTitle');
    if (titleEl) titleEl.innerHTML = driverId ? '<i class="fa-solid fa-user-pen"></i> Modifier Chauffeur' : '<i class="fa-solid fa-user-plus"></i> Nouveau Chauffeur';

    if (driverId) {
      try {
        const res = await fetch(`${FLEET_CONFIG.API.baseUrl}/api/drivers/${driverId}`, { headers: { 'x-access-code': this.currentCode } });
        if (res.ok) {
          const d = await res.json();
          document.getElementById('driverModalName').value = d.name || '';
          document.getElementById('driverModalPhone').value = d.phone || '';
          document.getElementById('driverModalLicense').value = d.licenseNumber || '';
          document.getElementById('driverModalCategory').value = d.licenseCategory || 'EC';
          document.getElementById('driverModalExpiry').value = d.licenseExpiry || '';
          document.getElementById('driverModalSituation').value = d.situation || 'disponible';
          document.getElementById('driverModalNotes').value = d.notes || '';
        }
      } catch(_) {}
    }
    modal.style.display = 'flex';
  }

  closeAddDriverModal() {
    const modal = document.getElementById('modalAddDriver');
    if (modal) modal.style.display = 'none';
  }

  async saveDriverFromModal() {
    const id = document.getElementById('driverModalId')?.value;
    const name = document.getElementById('driverModalName')?.value.trim();
    if (!name) { alert('Le nom du chauffeur est requis.'); return; }

    const payload = {
      name,
      phone: document.getElementById('driverModalPhone')?.value.trim(),
      licenseNumber: document.getElementById('driverModalLicense')?.value.trim(),
      licenseCategory: document.getElementById('driverModalCategory')?.value,
      licenseExpiry: document.getElementById('driverModalExpiry')?.value,
      situation: document.getElementById('driverModalSituation')?.value,
      notes: document.getElementById('driverModalNotes')?.value.trim()
    };

    try {
      const url = id ? `${FLEET_CONFIG.API.baseUrl}/api/drivers/${id}` : `${FLEET_CONFIG.API.baseUrl}/api/drivers`;
      const method = id ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', 'x-access-code': this.currentCode },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        this.closeAddDriverModal();
        if (typeof showToast === 'function') showToast('Chauffeur enregistré avec succès !', 'success');
        await this.fetchDisponibiliteData(false);
        if (typeof loadDriverDb === 'function') loadDriverDb();
      } else {
        alert('Erreur lors de l\'enregistrement du chauffeur.');
      }
    } catch (e) {
      alert('Erreur réseau.');
    }
  }

  // ── MODALS: TRAILER CRUD ──────────────────────────────────────
  openAddTrailerModal() {
    const modal = document.getElementById('modalAddTrailer');
    if (!modal) return;
    document.getElementById('trailerModalId').value = '';
    document.getElementById('trailerModalImm').value = '';
    document.getElementById('trailerModalType').value = 'Plateau';
    document.getElementById('trailerModalBrand').value = '';
    document.getElementById('trailerModalCapacity').value = '';
    document.getElementById('trailerModalNotes').value = '';
    modal.style.display = 'flex';
  }

  closeAddTrailerModal() {
    const modal = document.getElementById('modalAddTrailer');
    if (modal) modal.style.display = 'none';
  }

  async saveTrailerFromModal() {
    const imm = document.getElementById('trailerModalImm')?.value.trim();
    if (!imm) { alert('L\'immatriculation de la remorque est requise.'); return; }

    const payload = {
      immatriculation: imm,
      type: document.getElementById('trailerModalType')?.value,
      brand: document.getElementById('trailerModalBrand')?.value.trim(),
      capacity: document.getElementById('trailerModalCapacity')?.value.trim(),
      notes: document.getElementById('trailerModalNotes')?.value.trim()
    };

    try {
      const res = await fetch(`${FLEET_CONFIG.API.baseUrl}/api/trailers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-access-code': this.currentCode },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        this.closeAddTrailerModal();
        if (typeof showToast === 'function') showToast('Remorque enregistrée avec succès !', 'success');
        await this.fetchDisponibiliteData(false);
        if (typeof loadTrailerDb === 'function') loadTrailerDb();
      } else {
        alert('Erreur lors de l\'enregistrement de la remorque.');
      }
    } catch (e) {
      alert('Erreur réseau.');
    }
  }

  // ── MODALS: FLEET ATOMIC ASSIGNMENT ───────────────────────────
  async openAssignFleetModal(truckDeviceId = null) {
    const modal = document.getElementById('modalAssignFleet');
    if (!modal) return;

    // Populate truck select
    const truckSelect = document.getElementById('assignModalTruck');
    if (truckSelect) {
      truckSelect.innerHTML = '<option value="">-- Choisir un camion tracteur --</option>';
      const trucks = app.getAllTrucks();
      trucks.forEach(t => {
        const db = this.truckDbCache.find(d => d.deviceId === t.id) || {};
        const label = `${t.name} (${db.immatriculation || t.id})`;
        const selected = (truckDeviceId && t.id === truckDeviceId) ? 'selected' : '';
        truckSelect.innerHTML += `<option value="${t.id}" ${selected}>${label}</option>`;
      });
    }

    // Populate driver select from registered drivers
    const driverSelect = document.getElementById('assignModalDriverSelect');
    if (driverSelect) {
      driverSelect.innerHTML = '<option value="">-- Choisir dans la base ou saisir manuellement --</option>';
      try {
        const res = await fetch(`${FLEET_CONFIG.API.baseUrl}/api/drivers`, { headers: { 'x-access-code': this.currentCode } });
        if (res.ok) {
          const list = await res.json();
          this._cachedDriversList = list;
          list.forEach(d => {
            driverSelect.innerHTML += `<option value="${d.driverId || d._id}" data-name="${d.name}" data-phone="${d.phone || ''}">${d.name} (${d.phone || 'Sans tél'})</option>`;
          });
        }
      } catch(_) {}
    }

    // Populate trailer select from registered trailers
    const trailerSelect = document.getElementById('assignModalTrailerSelect');
    if (trailerSelect) {
      trailerSelect.innerHTML = '<option value="">-- Choisir dans la base ou saisir manuellement --</option>';
      try {
        const res = await fetch(`${FLEET_CONFIG.API.baseUrl}/api/trailers`, { headers: { 'x-access-code': this.currentCode } });
        if (res.ok) {
          const list = await res.json();
          this._cachedTrailersList = list;
          list.forEach(tr => {
            trailerSelect.innerHTML += `<option value="${tr.immatriculation}" data-type="${tr.type || 'Plateau'}">${tr.immatriculation} (${tr.type || 'Plateau'})</option>`;
          });
        }
      } catch(_) {}
    }

    modal.style.display = 'flex';
    this.onAssignTruckChanged();
  }

  closeAssignFleetModal() {
    const modal = document.getElementById('modalAssignFleet');
    if (modal) modal.style.display = 'none';
  }

  onAssignTruckChanged() {
    const truckSelect = document.getElementById('assignModalTruck');
    const did = truckSelect?.value;
    if (!did) return;

    const db = (this.truckDbCache || []).find(d => d.deviceId === did) || {};
    document.getElementById('assignModalDriverName').value = db.driverName || '';
    document.getElementById('assignModalDriverPhone').value = db.driverPhone || '';
    document.getElementById('assignModalTrailerImm').value = db.trailer || '';
    if (document.getElementById('assignModalTrailerType') && db.trailerType) {
      document.getElementById('assignModalTrailerType').value = db.trailerType;
    }
  }

  onAssignDriverSelectChanged() {
    const sel = document.getElementById('assignModalDriverSelect');
    const opt = sel?.options[sel.selectedIndex];
    if (!opt || !opt.value) return;
    document.getElementById('assignModalDriverName').value = opt.getAttribute('data-name') || '';
    document.getElementById('assignModalDriverPhone').value = opt.getAttribute('data-phone') || '';
  }

  onAssignTrailerSelectChanged() {
    const sel = document.getElementById('assignModalTrailerSelect');
    const opt = sel?.options[sel.selectedIndex];
    if (!opt || !opt.value) return;
    document.getElementById('assignModalTrailerImm').value = opt.value;
    const type = opt.getAttribute('data-type');
    if (type && document.getElementById('assignModalTrailerType')) {
      document.getElementById('assignModalTrailerType').value = type;
    }
  }

  async saveAssignFleetModal() {
    const truckSelect = document.getElementById('assignModalTruck');
    const deviceId = truckSelect?.value;
    if (!deviceId) { alert('Veuillez sélectionner un camion tracteur.'); return; }

    const truck = app.trucks.get(deviceId);
    const driverSelect = document.getElementById('assignModalDriverSelect');
    const driverId = driverSelect?.value || '';
    const driverName = document.getElementById('assignModalDriverName')?.value.trim();
    const driverPhone = document.getElementById('assignModalDriverPhone')?.value.trim();
    const trailerImm = document.getElementById('assignModalTrailerImm')?.value.trim();
    const trailerType = document.getElementById('assignModalTrailerType')?.value;

    const payload = {
      deviceId,
      truckName: truck ? truck.name : '',
      driverId: driverId || undefined,
      driverName,
      driverPhone,
      trailerImmatriculation: trailerImm,
      trailerType
    };

    try {
      const res = await fetch(`${FLEET_CONFIG.API.baseUrl}/api/fleet/assign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-access-code': this.currentCode },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        this.closeAssignFleetModal();
        if (typeof showToast === 'function') showToast('Assignation enregistrée avec succès !', 'success');
        await this.loadTruckDbCache();
        await this.fetchDisponibiliteData(false);
        this.renderTrucks();

        // 🚀 Mission prompt: ask if this assignment change is a mission start
        const isMission = confirm(
          `✅ Assignation enregistrée pour ${payload.truckName || deviceId}.\n\n` +
          `🚚 Souhaitez-vous lancer une mission pour ce camion ?\n` +
          `(Destination, trajet et suivi automatique)`
        );
        if (isMission) {
          await this.openNewMissionModal(deviceId);
        }
      } else {
        alert('Erreur serveur lors de l\'assignation.');
      }
    } catch (e) {
      alert('Erreur réseau.');
    }
  }

  async unassignCurrentTruckFleet() {
    const truckSelect = document.getElementById('assignModalTruck');
    const deviceId = truckSelect?.value;
    if (!deviceId) { alert('Sélectionnez un camion.'); return; }
    if (!confirm('Détacher le chauffeur et la remorque de ce camion ?')) return;

    try {
      const res = await fetch(`${FLEET_CONFIG.API.baseUrl}/api/fleet/unassign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-access-code': this.currentCode },
        body: JSON.stringify({ deviceId, unassignDriver: true, unassignTrailer: true })
      });
      if (res.ok) {
        this.closeAssignFleetModal();
        if (typeof showToast === 'function') showToast('Véhicule détaché avec succès !', 'success');
        await this.loadTruckDbCache();
        await this.fetchDisponibiliteData(false);
        this.renderTrucks();
      }
    } catch (e) {
      alert('Erreur réseau.');
    }
  }

  // ── MODAL: DRIVER SITUATION CHANGER ───────────────────────────
  openDriverSituationModal(driverId, driverName, currentSit) {
    const modal = document.getElementById('modalDriverSituation');
    if (!modal) return;
    document.getElementById('sitModalDriverId').value = driverId;
    document.getElementById('sitModalDriverName').textContent = driverName || 'Chauffeur';
    if (document.getElementById('sitModalSelect') && currentSit) {
      document.getElementById('sitModalSelect').value = currentSit;
    }
    document.getElementById('sitModalNotes').value = '';
    modal.style.display = 'flex';
  }

  closeDriverSituationModal() {
    const modal = document.getElementById('modalDriverSituation');
    if (modal) modal.style.display = 'none';
  }

  async saveDriverSituationFromModal() {
    const id = document.getElementById('sitModalDriverId')?.value;
    const situation = document.getElementById('sitModalSelect')?.value;
    const notes = document.getElementById('sitModalNotes')?.value.trim();
    if (!id || !situation) return;

    try {
      const res = await fetch(`${FLEET_CONFIG.API.baseUrl}/api/drivers/${id}/situation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-access-code': this.currentCode },
        body: JSON.stringify({ situation, notes })
      });
      if (res.ok) {
        this.closeDriverSituationModal();
        if (typeof showToast === 'function') showToast('Situation mise à jour !', 'success');
        await this.fetchDisponibiliteData(false);
      } else {
        alert('Erreur mise à jour situation.');
      }
    } catch (e) {
      alert('Erreur réseau.');
    }
  }

  // ── NATIVE EXCEL EXPORT (.XLSX) ──────────────────────────────
  async exportDisponibiliteExcel() {
    const items = this.getFilteredDispoItems();
    if (!items.length) {
      alert('Aucune donnée à exporter.');
      return;
    }
    if (window.ExcelExportEngine && typeof window.ExcelExportEngine.exportTableToXlsx === 'function') {
      const headers = [
        'Camion',
        'Immatriculation',
        'Carte Naftal',
        'Chauffeur',
        'Tél Chauffeur',
        'Remorque Attelée',
        'Type Remorque',
        'Situation',
        'Trajet en cours',
        'Fret / Marchandise',
        'N° BL / Ordre',
        'Localisation',
        'Vitesse (km/h)',
        'Odomètre (km)',
        'Carburant (L)'
      ];
      const rows = items.map(i => [
        i.truckName || i.deviceId,
        i.immatriculation || '',
        i.carteNaftal || '',
        i.driver ? i.driver.name : 'Non assigné',
        i.driver ? (i.driver.phone || '') : '',
        i.trailer ? i.trailer.immatriculation : '',
        i.trailer ? (i.trailer.type || '') : '',
        i.situationLabel || i.situation,
        i.activeMission ? `${i.activeMission.origin} → ${i.activeMission.destination}` : '',
        i.activeMission ? (i.activeMission.cargo || '') : '',
        i.activeMission ? (i.activeMission.orderRef || '') : '',
        i.locationCity || '',
        i.speed || 0,
        i.odometer || 0,
        i.fuelLiters || 0
      ]);
      await window.ExcelExportEngine.exportTableToXlsx({
        filename: `Suivi_Transport_${new Date().toISOString().slice(0, 10)}.xlsx`,
        sheetName: 'Suivi Transport Flotte',
        title: 'DOULOUB EL DJAZAIR — SUIVI TRANSPORT FLOTTE & CHAUFFEURS',
        subtitle: `Rapport généré le ${new Date().toLocaleString('fr-FR')} | Filtre: ${this._dispoSituationFilter || 'Tous'}`,
        headers,
        rows
      });
    } else {
      alert('Moteur Excel en cours de chargement...');
    }
  }

  // ═════════════════════════════════════════════════════════════
  // 🚀 MISSION DISPATCH & DESTINATION FOLLOW-UP CONTROLLER
  // ═════════════════════════════════════════════════════════════

  async openNewMissionModal(truckDeviceId = null) {
    const modal = document.getElementById('modalDispatchMission');
    if (!modal) return;

    // Populate trucks
    const truckSelect = document.getElementById('dispatchTruckSelect');
    if (truckSelect) {
      truckSelect.innerHTML = '<option value="">-- Choisir un camion --</option>';
      const items = this._dispoData?.items || [];
      items.forEach(t => {
        const isSel = (truckDeviceId && String(t.deviceId) === String(truckDeviceId)) ? 'selected' : '';
        truckSelect.innerHTML += `<option value="${t.deviceId}" ${isSel}>${t.truckName} (${t.immatriculation || 'Sans plaque'})</option>`;
      });
    }

    // Populate drivers
    const driverSelect = document.getElementById('dispatchDriverSelect');
    if (driverSelect) {
      driverSelect.innerHTML = '<option value="">-- Choisir un chauffeur --</option>';
      try {
        const res = await fetch(`${FLEET_CONFIG.API.baseUrl}/api/drivers`, { headers: { 'x-access-code': this.currentCode } });
        if (res.ok) {
          const list = await res.json();
          this._cachedDriversList = list;
          list.forEach(d => {
            driverSelect.innerHTML += `<option value="${d.driverId || d._id}">${d.name} (${d.phone || 'Sans tél'})</option>`;
          });
        }
      } catch (_) {}
    }

    // Populate trailers
    const trailerSelect = document.getElementById('dispatchTrailerSelect');
    if (trailerSelect) {
      trailerSelect.innerHTML = '<option value="">-- Aucune / Remorque par défaut --</option>';
      try {
        const res = await fetch(`${FLEET_CONFIG.API.baseUrl}/api/trailers`, { headers: { 'x-access-code': this.currentCode } });
        if (res.ok) {
          const list = await res.json();
          this._cachedTrailersList = list;
          list.forEach(tr => {
            trailerSelect.innerHTML += `<option value="${tr.immatriculation}">${tr.immatriculation} (${tr.type || 'Plateau'})</option>`;
          });
        }
      } catch (_) {}
    }

    // Populate Client dropdown from FLEET_CONFIG.CLIENTS
    const clientSelect = document.getElementById('dispatchClientSelect');
    if (clientSelect) {
      clientSelect.innerHTML = '<option value="">-- Optionnel --</option>';
      (FLEET_CONFIG.CLIENTS || []).forEach(c => {
        clientSelect.innerHTML += `<option value="${c.id}">${c.icon || '🏢'} ${c.name}</option>`;
      });
    }

    // Reset FC row
    const fcRow = document.getElementById('dispatchFCRow');
    const fcSelect = document.getElementById('dispatchFCSelect');
    if (fcRow) fcRow.style.display = 'none';
    if (fcSelect) fcSelect.innerHTML = '<option value="">-- Tous --</option>';

    // Reset input fields
    const elOrig = document.getElementById('dispatchOrigin');
    const elDest = document.getElementById('dispatchDest');
    const elCargo = document.getElementById('dispatchCargo');
    const elRef = document.getElementById('dispatchOrderRef');
    const elNotes = document.getElementById('dispatchNotes');
    if (elOrig) elOrig.value = '';
    if (elDest) elDest.value = '';
    if (elCargo) elCargo.value = '';
    if (elRef) elRef.value = '';
    if (elNotes) elNotes.value = '';

    // Reset hidden coordinate fields
    ['dispatchOriginLat','dispatchOriginLng','dispatchDestLat','dispatchDestLng'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });

    // Reset route estimate strip
    const estStrip = document.getElementById('dispatchRouteEstimate');
    if (estStrip) estStrip.style.display = 'none';
    ['dispEstKm','dispEstFuel','dispEstCost'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.textContent = '—';
    });
    this._dispatchRouteGeometry = null;
    this._dispatchEstimateData = null;

    // Clear any previous autocomplete dropdowns
    ['dispatchOriginResults','dispatchDestResults'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.innerHTML = '';
    });

    // Attach Geoapify unified autocomplete to Origin and Destination
    this._dispatchAttachAutocomplete('dispatchOrigin', 'dispatchOriginResults', 'dispatchOriginLat', 'dispatchOriginLng', 'origin');
    this._dispatchAttachAutocomplete('dispatchDest', 'dispatchDestResults', 'dispatchDestLat', 'dispatchDestLng', 'dest');

    // Close dropdowns when clicking outside
    if (this._dispatchCloseDropdowns) document.removeEventListener('click', this._dispatchCloseDropdowns);
    this._dispatchCloseDropdowns = (e) => {
      ['dispatchOriginResults','dispatchDestResults'].forEach(id => {
        const dd = document.getElementById(id);
        if (dd && !dd.contains(e.target) && e.target.id !== id.replace('Results','')) dd.innerHTML = '';
      });
    };
    document.addEventListener('click', this._dispatchCloseDropdowns);

    if (truckDeviceId) {
      this.onDispatchTruckChange(truckDeviceId);
    }

    modal.style.display = 'flex';
  }

  closeNewMissionModal() {
    const modal = document.getElementById('modalDispatchMission');
    if (modal) modal.style.display = 'none';
    // Remove click listener
    if (this._dispatchCloseDropdowns) {
      document.removeEventListener('click', this._dispatchCloseDropdowns);
      this._dispatchCloseDropdowns = null;
    }
  }

  showMissionRoute(historyId) {
    // Find mission in current dispo data
    const items = this._dispoData?.items || [];
    let mission = null;
    let truckName = '';
    for (const item of items) {
      if (item.activeMission && (item.activeMission.historyId === historyId || item.activeMission.missionId === historyId)) {
        mission = item.activeMission;
        truckName = item.truckName || '';
        break;
      }
    }
    if (!mission || !mission.routeGeometry) {
      if (typeof showToast === 'function') showToast('Aucune route planifiée disponible pour cette mission.', 'warning');
      return;
    }
    // Switch to map tab if available
    const mapTab = document.querySelector('[data-tab="map"]') || document.querySelector('[onclick*="showMapTab"]');
    if (mapTab) mapTab.click();
    // Draw route on map
    if (typeof algeriaMap !== 'undefined' && algeriaMap.drawPlannedRoute) {
      algeriaMap.drawPlannedRoute(mission.routeGeometry, mission.origin, mission.destination, truckName);
    }
  }

  onDispatchTruckChange(truckDeviceId) {
    if (!truckDeviceId) return;
    const item = (this._dispoData?.items || []).find(t => String(t.deviceId) === String(truckDeviceId));
    if (!item) return;

    if (item.driver && item.driver.id) {
      const dSel = document.getElementById('dispatchDriverSelect');
      if (dSel) dSel.value = item.driver.id;
    }
    if (item.trailer && item.trailer.immatriculation) {
      const trSel = document.getElementById('dispatchTrailerSelect');
      if (trSel) trSel.value = item.trailer.immatriculation;
    }
  }

  async saveNewMissionFromModal() {
    const truckDeviceId = document.getElementById('dispatchTruckSelect')?.value;
    const driverId = document.getElementById('dispatchDriverSelect')?.value;
    const trailerPlate = document.getElementById('dispatchTrailerSelect')?.value;
    const origin = document.getElementById('dispatchOrigin')?.value.trim();
    const destination = document.getElementById('dispatchDest')?.value.trim();
    const cargo = document.getElementById('dispatchCargo')?.value.trim();
    const orderRef = document.getElementById('dispatchOrderRef')?.value.trim();
    const notes = document.getElementById('dispatchNotes')?.value.trim();

    // New enhanced fields
    const clientId = document.getElementById('dispatchClientSelect')?.value || '';
    const fcId = document.getElementById('dispatchFCSelect')?.value || '';
    const originLat = document.getElementById('dispatchOriginLat')?.value || '';
    const originLng = document.getElementById('dispatchOriginLng')?.value || '';
    const destLat = document.getElementById('dispatchDestLat')?.value || '';
    const destLng = document.getElementById('dispatchDestLng')?.value || '';

    if (!truckDeviceId && !driverId) {
      alert('Veuillez sélectionner au moins un camion ou un chauffeur.');
      return;
    }
    if (!origin || !destination) {
      alert('Veuillez renseigner le lieu de départ (Origine) et la destination.');
      return;
    }

    // Resolve client & FC names from config
    let clientName = '';
    let finalClientName = '';
    if (clientId) {
      const client = (FLEET_CONFIG.CLIENTS || []).find(c => c.id === clientId);
      if (client) {
        clientName = client.name;
        if (fcId) {
          const fc = (client.finalClients || []).find(f => f.id === fcId);
          if (fc) finalClientName = fc.name;
        }
      }
    }

    const payload = {
      truckDeviceId,
      driverId,
      trailerPlate,
      origin,
      destination,
      cargo,
      orderRef,
      notes,
      // Enhanced mission fields
      originCoords: originLat && originLng ? { lat: parseFloat(originLat), lng: parseFloat(originLng) } : undefined,
      destCoords: destLat && destLng ? { lat: parseFloat(destLat), lng: parseFloat(destLng) } : undefined,
      clientId: clientId || undefined,
      clientName: clientName || undefined,
      finalClientId: fcId || undefined,
      finalClientName: finalClientName || undefined,
      estimatedDistanceKm: this._dispatchEstimateData?.distKm || undefined,
      estimatedFuelL: this._dispatchEstimateData?.fuelL || undefined,
      estimatedCostDA: this._dispatchEstimateData?.costDA || undefined,
      routeGeometry: this._dispatchRouteGeometry || undefined
    };

    try {
      const res = await fetch(`${FLEET_CONFIG.API.baseUrl}/api/fleet/missions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-access-code': this.currentCode },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        this.closeNewMissionModal();
        if (typeof showToast === 'function') showToast('✅ Mission lancée avec succès !', 'success');
        await this.fetchDisponibiliteData(false);
      } else {
        const err = await res.json().catch(() => ({}));
        alert('Erreur: ' + (err.error || 'Impossible de lancer la mission.'));
      }
    } catch (e) {
      alert('Erreur réseau: ' + e.message);
    }
  }

  async completeFleetMission(historyId, truckName = '') {
    const promptMsg = truckName ? `Confirmer l'arrivée et la clôture de la mission pour ${truckName} ?` : "Confirmer l'arrivée et la clôture de la mission ?";
    if (!confirm(promptMsg)) return;

    try {
      const res = await fetch(`${FLEET_CONFIG.API.baseUrl}/api/fleet/missions/${encodeURIComponent(historyId)}/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-access-code': this.currentCode },
        body: JSON.stringify({})
      });
      if (res.ok) {
        if (typeof showToast === 'function') showToast('Mission clôturée avec succès ! Véhicule et chauffeur libérés.', 'success');
        await this.fetchDisponibiliteData(false);
      } else {
        const err = await res.json().catch(() => ({}));
        alert('Erreur: ' + (err.error || 'Impossible de clôturer la mission.'));
      }
    } catch (e) {
      alert('Erreur réseau: ' + e.message);
    }
  }

  // ═════════════════════════════════════════════════════════════
  // 🎯 DESTINATION AUTOCOMPLETE & AUTO-MISSION DETECTION UI
  // ═════════════════════════════════════════════════════════════

  async _loadDestinationSuggestions(destInput, origInput) {
    if (!destInput) return;
    try {
      const res = await fetch(`${FLEET_CONFIG.API.baseUrl}/api/fleet/saved-routes`, {
        headers: { 'x-access-code': this.currentCode }
      });
      if (!res.ok) return;
      const data = await res.json();
      this._savedRoutesData = data;

      // Create datalist for destination autocomplete
      let datalist = document.getElementById('_destSuggestionsList');
      if (!datalist) {
        datalist = document.createElement('datalist');
        datalist.id = '_destSuggestionsList';
        document.body.appendChild(datalist);
      }
      datalist.innerHTML = '';

      // Add saved routes (most used first)
      (data.savedRoutes || []).forEach(r => {
        const opt = document.createElement('option');
        opt.value = r.destination;
        opt.label = `⭐ ${r.destination} (${r.usageCount || 1}x)`;
        datalist.appendChild(opt);
      });

      // Add client zones
      (data.clientDestinations || []).forEach(c => {
        const opt = document.createElement('option');
        opt.value = c.name;
        opt.label = `🏢 ${c.name}`;
        datalist.appendChild(opt);
      });

      // Add logistics hubs
      (data.hubDestinations || []).slice(0, 20).forEach(h => {
        const opt = document.createElement('option');
        opt.value = h.name;
        opt.label = `📍 ${h.name}`;
        datalist.appendChild(opt);
      });

      destInput.setAttribute('list', '_destSuggestionsList');

      // Also add datalist for origin
      if (origInput) {
        let origDatalist = document.getElementById('_origSuggestionsList');
        if (!origDatalist) {
          origDatalist = document.createElement('datalist');
          origDatalist.id = '_origSuggestionsList';
          document.body.appendChild(origDatalist);
        }
        origDatalist.innerHTML = '';
        // Origins from saved routes
        const origins = new Set();
        (data.savedRoutes || []).forEach(r => origins.add(r.origin));
        origins.forEach(o => {
          const opt = document.createElement('option');
          opt.value = o;
          origDatalist.appendChild(opt);
        });
        // Add DED bases
        (data.clientDestinations || []).filter(c => c.name.toLowerCase().includes('base') || c.name.toLowerCase().includes('ded')).forEach(c => {
          const opt = document.createElement('option');
          opt.value = c.name;
          origDatalist.appendChild(opt);
        });
        origInput.setAttribute('list', '_origSuggestionsList');
      }

      // Auto-fill destination from saved route when origin + truck are known
      if (destInput && origInput) {
        origInput.addEventListener('change', () => {
          const originVal = origInput.value.trim().toLowerCase();
          if (!originVal) return;
          const matchRoute = (data.savedRoutes || []).find(r => r.origin.toLowerCase() === originVal);
          if (matchRoute && !destInput.value) {
            destInput.value = matchRoute.destination;
          }
        });
      }
    } catch (e) {
      console.warn('[AutoComplete] Failed to load destinations:', e.message);
    }
  }

  // ═════════════════════════════════════════════════════════════════
  // 🔍 DISPATCH MISSION: GEOAPIFY UNIFIED AUTOCOMPLETE
  // ═════════════════════════════════════════════════════════════════

  _dispatchAttachAutocomplete(inputId, resultsId, latHiddenId, lngHiddenId, role) {
    const inputEl = document.getElementById(inputId);
    if (!inputEl) return;
    // Remove old listeners by cloning
    const newInput = inputEl.cloneNode(true);
    inputEl.parentNode.replaceChild(newInput, inputEl);
    let debounceTimer = null;
    newInput.addEventListener('input', () => {
      clearTimeout(debounceTimer);
      const q = newInput.value.trim();
      if (q.length < 2) {
        const dd = document.getElementById(resultsId);
        if (dd) dd.innerHTML = '';
        return;
      }
      debounceTimer = setTimeout(() => this._dispatchDoSearch(q, resultsId, latHiddenId, lngHiddenId, inputId, role), 300);
    });
  }

  async _dispatchDoSearch(query, resultsId, latHiddenId, lngHiddenId, inputId, role) {
    const dd = document.getElementById(resultsId);
    if (!dd) return;
    const q = query.toLowerCase();
    let items = [];

    // 1) Search CUSTOM_LOCATIONS (zones)
    (FLEET_CONFIG.CUSTOM_LOCATIONS || []).forEach(loc => {
      if (loc.name && loc.name.toLowerCase().includes(q)) {
        items.push({
          type: 'zone', icon: '📍', iconBg: 'rgba(59,130,246,0.12)',
          main: loc.name, sub: loc.wilaya || loc.type || 'Zone',
          lat: loc.lat, lng: loc.lng,
          clientId: loc.clientId || '', finalClientId: loc.finalClientId || ''
        });
      }
    });

    // 2) Search CLIENTS (by name)
    (FLEET_CONFIG.CLIENTS || []).forEach(client => {
      if (client.name && client.name.toLowerCase().includes(q)) {
        const zone = (FLEET_CONFIG.CUSTOM_LOCATIONS || []).find(z => z.clientId === client.id);
        items.push({
          type: 'client', icon: client.icon || '🏢', iconBg: 'rgba(16,185,129,0.12)',
          main: client.name, sub: 'Client',
          lat: zone ? zone.lat : '', lng: zone ? zone.lng : '',
          clientId: client.id, finalClientId: ''
        });
      }
      // 3) Search finalClients (sub-clients)
      (client.finalClients || []).forEach(fc => {
        if (fc.name && fc.name.toLowerCase().includes(q)) {
          const zone = (FLEET_CONFIG.CUSTOM_LOCATIONS || []).find(z => z.finalClientId === fc.id || (z.clientId === client.id && z.name.toLowerCase().includes(fc.name.toLowerCase())));
          items.push({
            type: 'fc', icon: '🤝', iconBg: 'rgba(139,92,246,0.12)',
            main: fc.name, sub: `Sous-client de ${client.name}`,
            lat: zone ? zone.lat : '', lng: zone ? zone.lng : '',
            clientId: client.id, finalClientId: fc.id
          });
        }
      });
    });

    // Limit local results
    items = items.slice(0, 5);

    // 4) Geoapify API search (addresses)
    try {
      const keys = FLEET_CONFIG.GEOAPIFY_API_KEYS || [];
      const key = keys[0];
      if (key && query.length >= 3) {
        const url = `https://api.geoapify.com/v1/geocode/autocomplete?text=${encodeURIComponent(query)}&lang=fr&filter=countrycode:dz&limit=5&apiKey=${key}`;
        const res = await fetch(url);
        if (res.ok) {
          const data = await res.json();
          (data.features || []).forEach(f => {
            const p = f.properties || {};
            items.push({
              type: 'address', icon: '🌍', iconBg: 'rgba(245,158,11,0.12)',
              main: p.formatted || p.name || '', sub: p.state || p.country || 'Adresse',
              lat: p.lat, lng: p.lon,
              clientId: '', finalClientId: ''
            });
          });
        }
      }
    } catch (_) {}

    if (!items.length) {
      dd.innerHTML = '<div style="padding:12px;text-align:center;color:var(--text-muted);font-size:11px;"><i class="fa-solid fa-search"></i> Aucun résultat</div>';
      return;
    }

    // Render dropdown
    dd.innerHTML = items.map((item, idx) => `
      <div class="geo-item" data-idx="${idx}" style="display:flex;align-items:center;gap:10px;">
        <div class="geo-icon" style="background:${item.iconBg};font-size:14px;">${item.icon}</div>
        <div class="geo-text">
          <div class="geo-main">${item.main}</div>
          <div class="geo-sub">${item.sub}</div>
        </div>
      </div>
    `).join('');

    // Attach click handlers
    dd.querySelectorAll('.geo-item').forEach((el) => {
      el.addEventListener('click', () => {
        const idx = parseInt(el.dataset.idx);
        const item = items[idx];
        if (!item) return;
        // Fill input text
        const inp = document.getElementById(inputId);
        if (inp) inp.value = item.main;
        // Fill hidden coords
        const latEl = document.getElementById(latHiddenId);
        const lngEl = document.getElementById(lngHiddenId);
        if (latEl) latEl.value = item.lat || '';
        if (lngEl) lngEl.value = item.lng || '';
        // Auto-fill client/FC selects if match
        if (item.clientId) {
          const cs = document.getElementById('dispatchClientSelect');
          if (cs) { cs.value = item.clientId; this._onDispatchClientChange(item.clientId); }
        }
        if (item.finalClientId) {
          setTimeout(() => {
            const fs = document.getElementById('dispatchFCSelect');
            if (fs) fs.value = item.finalClientId;
          }, 50);
        }
        // Clear dropdown
        dd.innerHTML = '';
        // Try to calculate route if both origin and dest have coords
        this._dispatchTryCalcRoute();
      });
    });
  }

  _onDispatchClientChange(clientId) {
    const fcRow = document.getElementById('dispatchFCRow');
    const fcSelect = document.getElementById('dispatchFCSelect');
    if (!fcRow || !fcSelect) return;
    if (!clientId) {
      fcRow.style.display = 'none';
      fcSelect.innerHTML = '<option value="">-- Tous --</option>';
      return;
    }
    const client = (FLEET_CONFIG.CLIENTS || []).find(c => c.id === clientId);
    if (!client || !client.finalClients || !client.finalClients.length) {
      fcRow.style.display = 'none';
      fcSelect.innerHTML = '<option value="">-- Tous --</option>';
      return;
    }
    fcRow.style.display = 'block';
    fcSelect.innerHTML = '<option value="">-- Tous --</option>';
    client.finalClients.forEach(fc => {
      fcSelect.innerHTML += `<option value="${fc.id}">${fc.name}</option>`;
    });
  }

  _onDispatchFCChange(fcId) {
    if (!fcId) return;
    // Try to find a matching zone for this FC and auto-fill destination
    const zone = (FLEET_CONFIG.CUSTOM_LOCATIONS || []).find(z => z.finalClientId === fcId);
    if (zone && zone.lat && zone.lng) {
      const destInput = document.getElementById('dispatchDest');
      const latEl = document.getElementById('dispatchDestLat');
      const lngEl = document.getElementById('dispatchDestLng');
      if (destInput && !destInput.value) {
        destInput.value = zone.name;
        if (latEl) latEl.value = zone.lat;
        if (lngEl) lngEl.value = zone.lng;
        this._dispatchTryCalcRoute();
      }
    }
  }

  async _dispatchTryCalcRoute() {
    const oLat = document.getElementById('dispatchOriginLat')?.value;
    const oLng = document.getElementById('dispatchOriginLng')?.value;
    const dLat = document.getElementById('dispatchDestLat')?.value;
    const dLng = document.getElementById('dispatchDestLng')?.value;
    if (!oLat || !oLng || !dLat || !dLng) return;

    const estStrip = document.getElementById('dispatchRouteEstimate');
    const srcEl = document.getElementById('dispEstSource');
    if (estStrip) estStrip.style.display = 'flex';
    if (srcEl) srcEl.textContent = 'Calcul en cours...';

    try {
      const keys = FLEET_CONFIG.GEOAPIFY_API_KEYS || [];
      const key = keys[0];
      if (!key) { if (srcEl) srcEl.textContent = 'Clé API manquante'; return; }
      const url = `https://api.geoapify.com/v1/routing?waypoints=${oLat},${oLng}|${dLat},${dLng}&mode=drive&apiKey=${key}`;
      const res = await fetch(url);
      if (!res.ok) { if (srcEl) srcEl.textContent = 'Erreur calcul'; return; }
      const data = await res.json();
      const feat = data.features && data.features[0];
      if (!feat || !feat.properties) { if (srcEl) srcEl.textContent = 'Pas de route'; return; }
      const props = feat.properties;
      const distKm = Math.round((props.distance || 0) / 1000);
      const timeMin = Math.round((props.time || 0) / 60);
      const fuelRate = 45; // L/100km average for trucks
      const fuelPrice = (FLEET_CONFIG.NAFTAL_MANAGEMENT && FLEET_CONFIG.NAFTAL_MANAGEMENT.defaultNaftalPrice) || 31;
      const fuelL = Math.round(distKm * fuelRate / 100);
      const costDA = Math.round(fuelL * fuelPrice);

      // Update UI
      const kmEl = document.getElementById('dispEstKm');
      const fuelEl = document.getElementById('dispEstFuel');
      const costEl = document.getElementById('dispEstCost');
      if (kmEl) kmEl.textContent = distKm.toLocaleString('fr-DZ');
      if (fuelEl) fuelEl.textContent = fuelL.toLocaleString('fr-DZ');
      if (costEl) costEl.textContent = costDA.toLocaleString('fr-DZ');
      if (srcEl) srcEl.textContent = `~${Math.floor(timeMin/60)}h${String(timeMin%60).padStart(2,'0')} de trajet`;

      // Store for payload
      this._dispatchEstimateData = { distKm, fuelL, costDA };
      this._dispatchRouteGeometry = feat.geometry || null;
    } catch (e) {
      if (srcEl) srcEl.textContent = 'Erreur: ' + e.message;
    }
  }

  /**
   * Show auto-mission prompt when an auto-detected mission is created.
   * Called periodically from fetchDisponibiliteData.
   */
  loadTransportReport() {
    // Redirect the transport report rendering to the sub-panel container
    const srcContainer = document.getElementById('transportReportApp');
    const destContainer = document.getElementById('transportReportAppInDispo');
    if (srcContainer && destContainer) {
      // Move content from old location to new
      destContainer.innerHTML = srcContainer.innerHTML;
      srcContainer.innerHTML = '';
    }
    // If we have a render function, call it targeting the new container
    if (typeof renderTransportReport === 'function') {
      renderTransportReport('transportReportAppInDispo');
    } else if (typeof loadTransportReportData === 'function') {
      loadTransportReportData();
    }
  }

    async _checkAutoMissionNotifications() {
    try {
      const res = await fetch(`${FLEET_CONFIG.API.baseUrl}/api/fleet/auto-missions/state`, {
        headers: { 'x-access-code': this.currentCode }
      });
      if (!res.ok) return;
      const data = await res.json();
      if (!data.states) return;

      // Track which notifications we already showed
      if (!this._autoMissionNotified) this._autoMissionNotified = new Set();

      for (const [deviceId, state] of Object.entries(data.states)) {
        if ((state.phase === 'at_destination' || state.phase === 'en_mission') && state.isAuto && state.missionId) {
          if (this._autoMissionNotified.has(state.missionId)) continue;
          this._autoMissionNotified.add(state.missionId);

          // Show notification toast with confirm/reject actions
          const truckItem = (this._dispoData?.items || []).find(t => String(t.deviceId) === deviceId);
          const truckLabel = truckItem?.truckName || deviceId;
          const dest = state.clientName ? `${state.clientName}${state.finalClientName ? ' (' + state.finalClientName + ')' : ''}` : state.zoneName;

          this._showAutoMissionPrompt(deviceId, state.missionId, truckLabel, dest);
        }
      }
    } catch (_) {}
  }

  _showAutoMissionPrompt(deviceId, missionId, truckLabel, dest) {
    // Create a floating notification for auto-mission confirmation
    const existing = document.getElementById(`auto-mission-${missionId}`);
    if (existing) return;

    const notif = document.createElement('div');
    notif.id = `auto-mission-${missionId}`;
    notif.style.cssText = `
      position: fixed; bottom: 80px; right: 20px; z-index: 99999;
      background: var(--bg-elevated, #1e293b); border: 2px solid var(--primary, #10b981);
      border-radius: 16px; padding: 16px 20px; min-width: 320px; max-width: 400px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.4); animation: slideInRight 0.3s ease;
      font-family: inherit; color: var(--text-primary, #e2e8f0);
    `;
    notif.innerHTML = `
      <div style="display:flex; align-items:center; gap:10px; margin-bottom:10px;">
        <span style="font-size:24px;">🚀</span>
        <div>
          <div style="font-weight:700; font-size:14px;">Mission Auto-Détectée</div>
          <div style="font-size:12px; opacity:0.7;">${truckLabel}</div>
        </div>
      </div>
      <div style="font-size:13px; margin-bottom:12px; padding:8px 10px; background:rgba(16,185,129,0.1); border-radius:8px; border-left:3px solid var(--primary, #10b981);">
        📍 Destination: <strong>${dest}</strong>
      </div>
      <div style="font-size:12px; opacity:0.7; margin-bottom:12px;">
        Le camion a été détecté près d'une zone client. Cette mission est-elle correcte ?
      </div>
      <div style="display:flex; gap:8px;">
        <button onclick="ui._confirmAutoMission('${deviceId}', '${missionId}', true, this.parentElement.parentElement)" style="
          flex:1; padding:8px; border:none; border-radius:8px; cursor:pointer;
          background:linear-gradient(135deg, #10b981, #059669); color:white; font-weight:600; font-size:12px;
        ">✅ Confirmer</button>
        <button onclick="ui._confirmAutoMission('${deviceId}', '${missionId}', false, this.parentElement.parentElement)" style="
          flex:1; padding:8px; border:none; border-radius:8px; cursor:pointer;
          background:rgba(239,68,68,0.2); color:#ef4444; font-weight:600; font-size:12px; border:1px solid rgba(239,68,68,0.3);
        ">❌ Rejeter</button>
        <button onclick="this.parentElement.parentElement.remove()" style="
          padding:8px 12px; border:none; border-radius:8px; cursor:pointer;
          background:rgba(100,116,139,0.2); color:var(--text-secondary, #94a3b8); font-size:12px;
        ">✕</button>
      </div>
    `;
    document.body.appendChild(notif);

    // Auto-dismiss after 60 seconds
    setTimeout(() => { if (notif.parentElement) notif.remove(); }, 60000);
  }

  async _confirmAutoMission(deviceId, missionId, confirmed, notifEl) {
    try {
      const res = await fetch(`${FLEET_CONFIG.API.baseUrl}/api/fleet/auto-missions/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-access-code': this.currentCode },
        body: JSON.stringify({ deviceId, missionId, confirmed })
      });
      if (res.ok) {
        const action = confirmed ? 'confirmée' : 'rejetée';
        if (typeof showToast === 'function') showToast(`Mission ${action} avec succès !`, confirmed ? 'success' : 'info');
        if (notifEl) notifEl.remove();
        await this.fetchDisponibiliteData(false);
      }
    } catch (e) {
      console.error('[AutoMission] Confirm error:', e.message);
    }
  }

  // ═════════════════════════════════════════════════════════════
  // ⚠️ STATUS / PANNE / MAINTENANCE MODAL CONTROLLER
  // ═════════════════════════════════════════════════════════════

  async openStatusModal(type = 'truck', targetId = null) {
    const modal = document.getElementById('modalReportStatus');
    if (!modal) return;
    const typeSelect = document.getElementById('modalStatusType');
    if (typeSelect) typeSelect.value = type;

    await this.onModalStatusTypeChange(type, targetId);
    modal.style.display = 'flex';
  }

  closeStatusModal() {
    const modal = document.getElementById('modalReportStatus');
    if (modal) modal.style.display = 'none';
  }

  async onModalStatusTypeChange(type, preselectId = null) {
    const targetLabel = document.getElementById('modalStatusTargetLabel');
    const targetSelect = document.getElementById('modalStatusTargetSelect');
    const valSelect = document.getElementById('modalStatusValueSelect');
    if (!targetSelect || !valSelect) return;

    if (type === 'truck') {
      if (targetLabel) targetLabel.textContent = 'Sélectionner Camion *';
      const items = this._dispoData?.items || [];
      targetSelect.innerHTML = '<option value="">-- Choisir un camion --</option>' +
        items.map(t => `<option value="${t.deviceId}" ${(preselectId && String(t.deviceId) === String(preselectId)) ? 'selected' : ''}>${t.truckName} [${t.immatriculation || 'Sans plaque'}]</option>`).join('');

      valSelect.innerHTML = `
        <option value="panne">🔴 En Panne / Immobilisé (Hors service)</option>
        <option value="maintenance">🟠 En Maintenance (Atelier / Garage)</option>
        <option value="chargement">🟡 En Chargement / Déchargement (À quai)</option>
        <option value="attente_ordre">🟠 En Attente d'Ordre / Fret</option>
        <option value="reserve">⚪ Véhicule de Réserve</option>
        <option value="disponible">🟢 Disponible au Parc</option>
      `;
    } else if (type === 'driver') {
      if (targetLabel) targetLabel.textContent = 'Sélectionner Chauffeur *';
      if (!this._cachedDriversList) {
        try {
          const res = await fetch(`${FLEET_CONFIG.API.baseUrl}/api/drivers`, { headers: { 'x-access-code': this.currentCode } });
          if (res.ok) this._cachedDriversList = await res.json();
        } catch (_) {}
      }
      targetSelect.innerHTML = '<option value="">-- Choisir un chauffeur --</option>' +
        (this._cachedDriversList || []).map(d => `<option value="${d.driverId || d._id}" ${(preselectId && String(d.driverId || d._id) === String(preselectId)) ? 'selected' : ''}>${d.name} (${d.phone || 'Sans tél'})</option>`).join('');

      valSelect.innerHTML = `
        <option value="recup">🔷 En Récupération (Repos compensateur)</option>
        <option value="repos">🟣 En Repos / Découchage</option>
        <option value="conge">⚪ En Congé Annuel</option>
        <option value="maladie">🟠 Arrêt Maladie</option>
        <option value="formation">🟣 En Formation / Visite Médicale</option>
        <option value="disponible">🟢 Disponible / Prêt</option>
        <option value="suspendu">🔴 Suspendu / Administratif</option>
      `;
    } else if (type === 'trailer') {
      if (targetLabel) targetLabel.textContent = 'Sélectionner Remorque *';
      if (!this._cachedTrailersList) {
        try {
          const res = await fetch(`${FLEET_CONFIG.API.baseUrl}/api/trailers`, { headers: { 'x-access-code': this.currentCode } });
          if (res.ok) this._cachedTrailersList = await res.json();
        } catch (_) {}
      }
      targetSelect.innerHTML = '<option value="">-- Choisir une remorque --</option>' +
        (this._cachedTrailersList || []).map(tr => `<option value="${tr.trailerId || tr.immatriculation}" ${(preselectId && (String(tr.trailerId) === String(preselectId) || tr.immatriculation === preselectId)) ? 'selected' : ''}>${tr.immatriculation} (${tr.type || 'Plateau'})</option>`).join('');

      valSelect.innerHTML = `
        <option value="panne">🔴 En Panne (Pneu / Freins / Béquilles)</option>
        <option value="maintenance">🟠 En Maintenance (Contrôle technique)</option>
        <option value="chargement">🟡 À Quai / En Chargement</option>
        <option value="disponible">🟢 Dételée au Parc (Disponible)</option>
        <option value="reserve">⚪ En Réserve</option>
      `;
    }
  }

  async saveStatusFromModal() {
    const type = document.getElementById('modalStatusType')?.value;
    const targetId = document.getElementById('modalStatusTargetSelect')?.value;
    const situation = document.getElementById('modalStatusValueSelect')?.value;
    const notes = document.getElementById('modalStatusNotes')?.value.trim();

    if (!targetId) {
      alert('Veuillez sélectionner une entité.');
      return;
    }

    let url = '';
    let body = {};

    if (type === 'truck') {
      url = `${FLEET_CONFIG.API.baseUrl}/api/fleet/status/truck`;
      body = { deviceId: targetId, situation, notes };
    } else if (type === 'driver') {
      url = `${FLEET_CONFIG.API.baseUrl}/api/drivers/${encodeURIComponent(targetId)}/situation`;
      body = { situation, notes };
    } else if (type === 'trailer') {
      url = `${FLEET_CONFIG.API.baseUrl}/api/fleet/status/trailer`;
      body = { trailerId: targetId, status: situation, notes };
    }

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-access-code': this.currentCode },
        body: JSON.stringify(body)
      });
      if (res.ok) {
        this.closeStatusModal();
        if (typeof showToast === 'function') showToast('Statut mis à jour avec succès !', 'success');
        await this.fetchDisponibiliteData(false);
      } else {
        const err = await res.json().catch(() => ({}));
        alert('Erreur: ' + (err.error || 'Échec de mise à jour du statut.'));
      }
    } catch (e) {
      alert('Erreur réseau: ' + e.message);
    }
  }

  // ═════════════════════════════════════════════════════════════
  // 📜 FLEET ROTATION & ASSIGNMENT HISTORY TIMELINE CONTROLLER
  // ═════════════════════════════════════════════════════════════

  async openFleetHistoryModal(filter = {}) {
    const modal = document.getElementById('modalFleetHistory');
    if (!modal) return;
    modal.style.display = 'flex';
    this._modalHistTab = filter.tab || 'all';
    await this.setModalHistoryTab(this._modalHistTab);
  }

  closeFleetHistoryModal() {
    const modal = document.getElementById('modalFleetHistory');
    if (modal) modal.style.display = 'none';
  }

  async setModalHistoryTab(tab) {
    this._modalHistTab = tab;
    ['all', 'driver', 'truck', 'trailer'].forEach(t => {
      const btn = document.getElementById('modalHistTab' + t.charAt(0).toUpperCase() + t.slice(1));
      if (btn) btn.classList.toggle('active', t === tab);
    });

    const wrap = document.getElementById('modalHistEntitySelectWrap');
    if (tab === 'all') {
      if (wrap) wrap.style.display = 'none';
      await this.loadModalHistoryData();
    } else {
      if (wrap) wrap.style.display = 'block';
      await this.populateModalHistEntities(tab);
    }
  }

  async populateModalHistEntities(tab) {
    const select = document.getElementById('modalHistEntitySelect');
    if (!select) return;

    if (tab === 'driver') {
      if (!this._cachedDriversList) {
        try {
          const res = await fetch(`${FLEET_CONFIG.API.baseUrl}/api/drivers`, { headers: { 'x-access-code': this.currentCode } });
          if (res.ok) this._cachedDriversList = await res.json();
        } catch (_) {}
      }
      select.innerHTML = '<option value="">-- Tous les chauffeurs (ou sélectionner un chauffeur) --</option>' +
        (this._cachedDriversList || []).map(d => `<option value="${d.driverId || d._id}">${d.name} (${d.phone || 'Sans tél'})</option>`).join('');
    } else if (tab === 'truck') {
      const items = this._dispoData?.items || [];
      select.innerHTML = '<option value="">-- Tous les camions (ou sélectionner un camion) --</option>' +
        items.map(t => `<option value="${t.deviceId}">${t.truckName} [${t.immatriculation || 'Sans plaque'}]</option>`).join('');
    } else if (tab === 'trailer') {
      if (!this._cachedTrailersList) {
        try {
          const res = await fetch(`${FLEET_CONFIG.API.baseUrl}/api/trailers`, { headers: { 'x-access-code': this.currentCode } });
          if (res.ok) this._cachedTrailersList = await res.json();
        } catch (_) {}
      }
      select.innerHTML = '<option value="">-- Toutes les remorques (ou sélectionner une remorque) --</option>' +
        (this._cachedTrailersList || []).map(tr => `<option value="${tr.immatriculation || tr.trailerId}">${tr.immatriculation} (${tr.type || 'Plateau'})</option>`).join('');
    }

    await this.loadModalHistoryData();
  }

  async onModalHistEntityChange(val) {
    if (!val) {
      await this.loadModalHistoryData();
      return;
    }
    const filter = {};
    if (this._modalHistTab === 'driver') filter.driverId = val;
    else if (this._modalHistTab === 'truck') filter.truckDeviceId = val;
    else if (this._modalHistTab === 'trailer') filter.trailerPlate = val;
    await this.loadModalHistoryData(filter);
  }

  async loadModalHistoryData(filter = {}) {
    const container = document.getElementById('modalFleetHistoryTimeline');
    if (container) {
      container.innerHTML = '<div style="text-align:center; padding:30px; color:var(--text-muted);"><i class="fa-solid fa-sync fa-spin"></i> Chargement de l\'historique...</div>';
    }

    let url = `${FLEET_CONFIG.API.baseUrl}/api/fleet/history?limit=300`;
    if (filter.driverId) url += `&driverId=${encodeURIComponent(filter.driverId)}`;
    if (filter.truckDeviceId) url += `&truckDeviceId=${encodeURIComponent(filter.truckDeviceId)}`;
    if (filter.trailerPlate) url += `&trailerPlate=${encodeURIComponent(filter.trailerPlate)}`;

    try {
      const res = await fetch(url, { headers: { 'x-access-code': this.currentCode } });
      if (res.ok) {
        const json = await res.json();
        this._fleetHistoryList = json.items || [];
        this.renderModalHistoryList();
      } else {
        if (container) container.innerHTML = '<div style="text-align:center; padding:30px; color:var(--text-muted);">Erreur de chargement.</div>';
      }
    } catch (e) {
      if (container) container.innerHTML = '<div style="text-align:center; padding:30px; color:var(--text-muted);">Erreur réseau.</div>';
    }
  }

  renderModalHistoryList() {
    const container = document.getElementById('modalFleetHistoryTimeline');
    if (!container) return;
    const q = (document.getElementById('modalHistSearchInput')?.value || '').toLowerCase().trim();

    let entries = this._fleetHistoryList || [];
    if (q) {
      entries = entries.filter(e => {
        return (e.driverName || '').toLowerCase().includes(q) ||
               (e.truckName || '').toLowerCase().includes(q) ||
               (e.trailerPlate || '').toLowerCase().includes(q) ||
               (e.origin || '').toLowerCase().includes(q) ||
               (e.destination || '').toLowerCase().includes(q) ||
               (e.notes || '').toLowerCase().includes(q) ||
               (e.eventType || '').toLowerCase().includes(q);
      });
    }

    if (!entries.length) {
      container.innerHTML = '<div style="text-align:center; padding:30px; color:var(--text-muted);">Aucun enregistrement d\'historique trouvé.</div>';
      return;
    }

    let html = '';
    entries.forEach(e => {
      const dateStr = new Date(e.timestamp || e.startDate).toLocaleString('fr-FR');
      let icon = 'fa-arrow-right-arrow-left';
      let color = '#38bdf8';
      let label = 'Affectation';

      if (e.eventType === 'mission_start') {
        icon = 'fa-route';
        color = '#10b981';
        label = 'Départ Mission';
      } else if (e.eventType === 'mission_complete') {
        icon = 'fa-flag-checkered';
        color = '#0284c7';
        label = 'Fin Mission';
      } else if (e.eventType === 'unassign') {
        icon = 'fa-link-slash';
        color = '#94a3b8';
        label = 'Détachement';
      } else if (e.eventType === 'status_change') {
        icon = 'fa-triangle-exclamation';
        color = '#f59e0b';
        label = 'Changement Statut';
      }

      html += `
        <div style="background:var(--bg-surface); border:1px solid var(--border); border-left:4px solid ${color}; padding:12px 16px; border-radius:10px; display:flex; justify-content:space-between; align-items:flex-start; gap:12px;">
          <div>
            <div style="display:flex; align-items:center; gap:8px; margin-bottom:4px;">
              <span style="background:${color}22; color:${color}; padding:2px 8px; border-radius:12px; font-weight:800; font-size:10px;">
                <i class="fa-solid ${icon}"></i> ${label}
              </span>
              <span style="font-size:11px; color:var(--text-muted); font-family:var(--font-mono);">${dateStr}</span>
            </div>
            <div style="font-weight:700; font-size:13px; color:var(--text-primary); margin-top:4px;">
              ${e.driverName ? `<span style="color:#34d399;"><i class="fa-solid fa-user"></i> ${e.driverName}</span>` : ''}
              ${e.truckName ? ` sur <span style="color:#38bdf8;"><i class="fa-solid fa-truck"></i> ${e.truckName}</span>` : ''}
              ${e.trailerPlate ? ` avec remorque <span style="color:#c084fc;"><i class="fa-solid fa-trailer"></i> ${e.trailerPlate}</span>` : ''}
            </div>
            ${e.origin && e.destination ? `
              <div style="font-size:11px; color:var(--primary); margin-top:4px;">
                <i class="fa-solid fa-location-arrow"></i> Itinéraire: <b>${e.origin}</b> → <b>${e.destination}</b>
                ${e.cargo ? ` (${e.cargo})` : ''}
                ${e.orderRef ? ` · BL: ${e.orderRef}` : ''}
              </div>
            ` : ''}
            ${e.notes ? `<div style="font-size:11px; color:var(--text-secondary); margin-top:4px; font-style:italic;">"${e.notes}"</div>` : ''}
          </div>
          <div style="text-align:right; font-size:11px; color:var(--text-muted);">
            <span class="situation-badge ${e.status === 'en_cours' ? 'badge-mission' : 'badge-disponible'}" style="font-size:10px; padding:2px 8px;">
              ${e.status === 'en_cours' ? 'En cours' : 'Archivé'}
            </span>
          </div>
        </div>`;
    });

    container.innerHTML = html;
  }

  async exportFleetHistoryExcel() {
    const entries = this._fleetHistoryList || [];
    if (!entries.length) {
      alert('Aucune donnée d\'historique à exporter.');
      return;
    }
    if (window.ExcelExportEngine && typeof window.ExcelExportEngine.exportTableToXlsx === 'function') {
      const headers = [
        'Date/Heure',
        'Type d\'événement',
        'Statut',
        'Camion',
        'Immatriculation',
        'Chauffeur',
        'Tél Chauffeur',
        'Remorque',
        'Origine',
        'Destination',
        'Marchandise / Fret',
        'N° BL / Ordre',
        'Odomètre Début',
        'Odomètre Fin',
        'Notes'
      ];
      const rows = entries.map(e => [
        new Date(e.timestamp || e.startDate).toLocaleString('fr-FR'),
        e.eventType || '',
        e.status || '',
        e.truckName || e.truckDeviceId || '',
        e.truckPlate || '',
        e.driverName || '',
        e.driverPhone || '',
        e.trailerPlate || '',
        e.origin || '',
        e.destination || '',
        e.cargo || '',
        e.orderRef || '',
        e.startOdometer || 0,
        e.endOdometer || 0,
        e.notes || ''
      ]);
      await window.ExcelExportEngine.exportTableToXlsx({
        filename: `Historique_Rotations_Flotte_${new Date().toISOString().slice(0, 10)}.xlsx`,
        sheetName: 'Historique Rotations',
        title: 'DOULOUB EL DJAZAIR — HISTORIQUE DES ROTATIONS ET TRAJETS',
        subtitle: `Généré le ${new Date().toLocaleString('fr-FR')} | Filtre: ${this._modalHistTab || 'Tous'}`,
        headers,
        rows
      });
    } else {
      alert('Moteur Excel en cours de chargement...');
    }
  }
}

let ui;
setTimeout(() => {
  if (typeof app !== 'undefined') {
    ui = new UIController();
  }
}, 100);

// Global scheme functions for Maintenance Wizard
window.toggleMark = function(id) { 
  const el = document.getElementById(id); 
  if(el) el.classList.toggle('on'); 
};
window.setScheme = function(name) {
  document.querySelectorAll('.scheme').forEach(el=>el.classList.remove('active'));
  document.querySelectorAll('.schemeBtns button').forEach(el=>el.classList.remove('active'));
  const scheme = document.getElementById('scheme_'+name);
  const btn = document.getElementById('btn_'+name);
  if(scheme) scheme.classList.add('active');
  if(btn) btn.classList.add('active');
};

// ── NAFTAL GLOBAL DIALOG HELPERS ────────────────────────────────────────────
// Used throughout the NAFTAL v5 module as await ui_showAlert(msg, title, icon)

function ui_showAlert(msg, title, icon) {
  return new Promise(function(resolve) {
    var id = 'nv5dlg_' + Date.now();
    var esc = function(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); };
    var overlay = document.createElement('div');
    overlay.id = id;
    overlay.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,0.45);display:flex;align-items:center;justify-content:center;';
    overlay.innerHTML =
      '<div style="background:#fff;border-radius:16px;padding:28px 32px;max-width:420px;width:90%;box-shadow:0 20px 60px rgba(0,0,0,0.25);text-align:center;">' +
        '<div style="font-size:32px;margin-bottom:12px;">'+(icon||'ℹ️')+'</div>' +
        (title ? '<h3 style="margin:0 0 8px;color:#1e293b;font-size:17px;">'+esc(title)+'</h3>' : '') +
        '<p style="margin:0 0 20px;color:#475569;font-size:14px;white-space:pre-wrap;">'+esc(msg)+'</p>' +
        '<button id="'+id+'_ok" style="background:#0284c7;color:#fff;border:none;border-radius:10px;padding:10px 28px;font-size:14px;font-weight:700;cursor:pointer;">OK</button>' +
      '</div>';
    document.body.appendChild(overlay);
    document.getElementById(id+'_ok').onclick = function() {
      overlay.remove();
      resolve(true);
    };
    overlay.onclick = function(e) { if (e.target === overlay) { overlay.remove(); resolve(true); } };
  });
}

function ui_showConfirm(msg, title, icon, dangerLabel) {
  return new Promise(function(resolve) {
    var id = 'nv5dlg_' + Date.now();
    var esc = function(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); };
    var overlay = document.createElement('div');
    overlay.id = id;
    overlay.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,0.45);display:flex;align-items:center;justify-content:center;';
    overlay.innerHTML =
      '<div style="background:#fff;border-radius:16px;padding:28px 32px;max-width:420px;width:90%;box-shadow:0 20px 60px rgba(0,0,0,0.25);text-align:center;">' +
        '<div style="font-size:32px;margin-bottom:12px;">'+(icon||'❓')+'</div>' +
        (title ? '<h3 style="margin:0 0 8px;color:#1e293b;font-size:17px;">'+esc(title)+'</h3>' : '') +
        '<p style="margin:0 0 20px;color:#475569;font-size:14px;white-space:pre-wrap;">'+esc(msg)+'</p>' +
        '<div style="display:flex;gap:10px;justify-content:center;">' +
          '<button id="'+id+'_cancel" style="background:#f1f5f9;color:#475569;border:none;border-radius:10px;padding:10px 22px;font-size:14px;font-weight:700;cursor:pointer;">Annuler</button>' +
          '<button id="'+id+'_ok" style="background:#ef4444;color:#fff;border:none;border-radius:10px;padding:10px 22px;font-size:14px;font-weight:700;cursor:pointer;">'+(dangerLabel||'Confirmer')+'</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(overlay);
    document.getElementById(id+'_ok').onclick = function() { overlay.remove(); resolve(true); };
    document.getElementById(id+'_cancel').onclick = function() { overlay.remove(); resolve(false); };
    overlay.onclick = function(e) { if (e.target === overlay) { overlay.remove(); resolve(false); } };
  });
}

function ui_showPrompt(msg, defaultVal, title) {
  return new Promise(function(resolve) {
    var id = 'nv5dlg_' + Date.now();
    var esc = function(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); };
    var overlay = document.createElement('div');
    overlay.id = id;
    overlay.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,0.45);display:flex;align-items:center;justify-content:center;';
    overlay.innerHTML =
      '<div style="background:#fff;border-radius:16px;padding:28px 32px;max-width:420px;width:90%;box-shadow:0 20px 60px rgba(0,0,0,0.25);">' +
        (title ? '<h3 style="margin:0 0 12px;color:#1e293b;font-size:17px;">'+esc(title)+'</h3>' : '') +
        '<p style="margin:0 0 12px;color:#475569;font-size:14px;">'+esc(msg)+'</p>' +
        '<textarea id="'+id+'_inp" rows="4" style="width:100%;padding:10px 12px;border:1.5px solid #e2e8f0;border-radius:10px;font-size:13px;resize:vertical;outline:none;box-sizing:border-box;font-family:inherit;">'+esc(defaultVal||'')+'</textarea>' +
        '<div style="display:flex;gap:10px;justify-content:flex-end;margin-top:14px;">' +
          '<button id="'+id+'_cancel" style="background:#f1f5f9;color:#475569;border:none;border-radius:10px;padding:9px 20px;font-size:13px;font-weight:700;cursor:pointer;">Annuler</button>' +
          '<button id="'+id+'_ok" style="background:#0284c7;color:#fff;border:none;border-radius:10px;padding:9px 20px;font-size:13px;font-weight:700;cursor:pointer;">Valider</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(overlay);
    var inp = document.getElementById(id+'_inp');
    inp.focus();
    inp.selectionStart = inp.selectionEnd = inp.value.length;
    document.getElementById(id+'_ok').onclick = function() { var v=inp.value; overlay.remove(); resolve(v); };
    document.getElementById(id+'_cancel').onclick = function() { overlay.remove(); resolve(null); };
    inp.addEventListener('keydown', function(e) {
      if (e.key === 'Enter' && e.ctrlKey) { var v=inp.value; overlay.remove(); resolve(v); }
      if (e.key === 'Escape') { overlay.remove(); resolve(null); }
    });
    overlay.onclick = function(e) { if (e.target === overlay) { overlay.remove(); resolve(null); } };
  });
}
// ────────────────────────────────────────────────────────────────────────────

