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

    // 2. Retrieve Access Code
    const code = localStorage.getItem('fleetAccessCode');

    // 3. CORS-SAFE: Inject header ONLY for OUR OWN server API
    //    Rules:
    //    - Relative paths starting with /api/ → always ours ✅
    //    - Absolute URLs containing /api/ → only if same origin or localhost ✅
    //    - https://api.mapbox.com/, https://api.geoapify.com/ → NEVER inject ❌
    const isOwnApiRequest = urlString && typeof urlString === 'string' && (
        urlString.startsWith('/api/') ||                                            // relative path
        urlString.startsWith('/admin/') ||                                          // relative admin
        (urlString.includes('/api/') && (
            urlString.startsWith(window.location.origin) ||                         // same origin
            urlString.startsWith('http://localhost') ||                             // localhost dev
            urlString.startsWith('http://127.0.0.1')                               // loopback dev
        ))
    );

    if (isOwnApiRequest) {
        if (!options) options = {};
        if (!options.headers) options.headers = {};
        if (code) options.headers['x-access-code'] = code;
    }

    // 4. Perform Request
    try {
        const response = await originalFetch(url, options);

        // 5. CHECK FOR REJECTION (401/403) — only from OUR server
        if ((response.status === 401 || response.status === 403) && isOwnApiRequest) {
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
      .pagination-btn { background: #fff; border: 1px solid #ddd; padding: 5px 12px; border-radius: 4px; cursor: pointer; color: #555; }
      .pagination-btn:hover { background: #f0f0f0; }
      .pagination-btn:disabled { opacity: 0.5; cursor: not-allowed; }
      .pagination-info { font-size: 12px; color: #666; }
      .api-keys-box { background: #f4f6f8; border: 1px solid #c7d2dd; border-radius: 6px; padding: 10px; margin-top:10px; }
      .api-keys-box textarea { width: 100%; border: 1px solid #ddd; border-radius: 4px; padding: 8px; font-family: monospace; font-size: 12px; }
      /* Decouchage Badges */
      .zone-maintenance-badge { background: #f0fdf4; border: 1px solid #bbf7d0; color: #15803d; font-size: 11px; font-weight: bold; padding: 6px 10px; border-radius: 4px; margin-top: 6px; display: flex; align-items: center; gap: 6px; }
      .zone-vidange-badge { background: #fff7ed; border: 1px solid #fed7aa; color: #c2410c; font-size: 11px; font-weight: bold; padding: 6px 10px; border-radius: 4px; margin-top: 6px; display: flex; align-items: center; gap: 6px; }
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
    
    this.routeTruck = document.getElementById('routeTruck');
    this.routeDestSearch = document.getElementById('routeDestSearch');
    this.routeAutocompleteDropdown = document.getElementById('routeAutocompleteDropdown');
    this.calculateRouteBtn = document.getElementById('calculateRouteBtn');
    this.routeResultsContainer = document.getElementById('routeResultsContainer');
    
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

          if (data.vidangeOverrides) FLEET_CONFIG.VIDANGE_OVERRIDES = data.vidangeOverrides;
          else if (!FLEET_CONFIG.VIDANGE_OVERRIDES) FLEET_CONFIG.VIDANGE_OVERRIDES = {};

          // Speed limit + Naftal budget from cloud
          if (data.speedLimit) FLEET_CONFIG.SPEED_LIMIT = data.speedLimit;
          if (data.naftalBudget) FLEET_CONFIG.NAFTAL_BUDGET = data.naftalBudget;

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
          clients: FLEET_CONFIG.CLIENTS
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
      container.innerHTML = `<div style="text-align:center;padding:32px 16px;color:var(--text-muted,#888);font-size:13px;">
        <div style="font-size:32px;margin-bottom:8px;">📍</div>Aucun site trouvé.<br>
        <button onclick="ui.openZoneClientModal(null)" style="margin-top:12px;background:linear-gradient(135deg,#3b82f6,#6366f1);color:white;border:none;border-radius:9px;padding:8px 16px;font-weight:700;font-size:12px;cursor:pointer;">+ Créer le premier site</button>
      </div>`;
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
      container.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:32px 16px;color:var(--text-muted,#888);font-size:13px;">
        <div style="font-size:32px;margin-bottom:8px;">👔</div>Aucun client.<br>
        <button onclick="ui.openClientEditorModal(null)" style="margin-top:12px;background:linear-gradient(135deg,#8b5cf6,#6366f1);color:white;border:none;border-radius:9px;padding:8px 16px;font-weight:700;font-size:12px;cursor:pointer;">+ Créer le premier client</button>
      </div>`;
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

    this.routeDestSearch.addEventListener('input', (e) => this.handleRouteDestinationSearch(e.target.value));
    this.calculateRouteBtn.addEventListener('click', () => this.calculateRoute());

    if(document.getElementById('exportCSVBtn')) document.getElementById('exportCSVBtn').addEventListener('click', () => this.exportCSV());
    if(document.getElementById('exportJSONBtn')) document.getElementById('exportJSONBtn').addEventListener('click', () => this.exportJSON());
    if(document.getElementById('clearHistoryBtn')) document.getElementById('clearHistoryBtn').addEventListener('click', () => this.clearHistory());
    
    this.globalSearchInput.addEventListener('input', (e) => {
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
    this.globalSearchInput.addEventListener('keydown', (e) => {
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
    });
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
          const url = `${FLEET_CONFIG.API.baseUrl}/api/decouchages?limit=2000`;
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
        const bg = index % 2 === 0 ? '#ffffff' : '#f8fafc';
        const countStyle = item.total > 0 ? 'color:#dc2626; font-weight:bold; background:#fef2f2; padding:2px 8px; border-radius:4px;' : 'color:var(--text-muted, #94a3b8);';
        tableHtml += `<tr style="background:${bg}; border-bottom:1px solid #eee;"><td style="padding:10px 15px; font-weight:600; color:#334155;">${item.name}</td><td style="padding:10px; text-align:center;"><span style="${countStyle}">${item.total}</span></td></tr>`;
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
  // 1. FIXED REFUEL EXPORT (with Naftal card column)
  exportRefuelsCSV() {
    if (!this.allRefuelLogs || this.allRefuelLogs.length === 0) { alert("Rien à exporter."); return; }
    let csv = "Date,Heure,Camion,Carte Naftal,Type,Avant (L),Ajout (L),Après (L),Capacité (L),Lieu,Wilaya,Coût Estimé (DA)\n";
    
    const startDate = this.refuelDateStart.value ? new Date(this.refuelDateStart.value) : null;
    const endDate = this.refuelDateEnd.value ? new Date(this.refuelDateEnd.value) : null;
    if(endDate) endDate.setHours(23, 59, 59, 999);
    const truckSearch = this.refuelTruckSearch.value.toLowerCase().trim();

    const minRefuelExport = Math.max(60, parseInt((FLEET_CONFIG.REFUEL_RULES || {}).minRefuelLiters || 60));
    const processedLogs = this.allRefuelLogs.map(log => {
        const truckConfig = getTruckConfig(log.deviceId);
        const capacity = truckConfig.fuelTankCapacity || 600;

        // Same calculation as renderFilteredRefuels
        let realAdded = 0;
        realAdded = Math.round(log.addedLiters || 0);

        let realTotal = Math.round(log.newLevel || 0);

        let realOld = 0;
        if (log.oldLevel && log.oldLevel > 0) {
            realOld = Math.round(log.oldLevel);
        } else if (realTotal > 0 && realAdded > 0) {
            realOld = realTotal - realAdded;
        }

        return { ...log, realAdded, realTotal, realOld, capacity };
    }).filter(log => {
        const d = new Date(log.timestamp);
        if (Number(log.realAdded) < minRefuelExport) return false;
        if (startDate && d < startDate) return false;
        if (endDate && d > endDate) return false;
        if (truckSearch && !log.truckName.toLowerCase().includes(truckSearch)) return false;
        return true;
    });

    const sitePrice = parseFloat((FLEET_CONFIG.DEFAULT_TRUCK_CONFIG || {}).fuelPricePerLiter) || 29;
    const naftalPriceCsv = this.naftalPricePerLiter || 31;
    processedLogs.forEach(log => {
        const d = new Date(log.timestamp);
        let exportLoc = log.locationName || 'Inconnu';
        let wilaya = 'Inconnue';
        const cached = geocodeService.checkCacheInstant(log.lat, log.lng);
        if (cached) {
            exportLoc = (cached.formatted || cached.city || 'Lieu').replace(/,/g, ' ');
            wilaya = (cached.wilaya || 'Inconnue').replace(/,/g, ' ');
        } else if (log.lat && log.lng) {
            exportLoc = `${parseFloat(log.lat).toFixed(4)} ${parseFloat(log.lng).toFixed(4)}`;
        }
        let isExternal = true;
        const safeLat = parseFloat(log.lat || 0), safeLng = parseFloat(log.lng || 0);
        if (safeLat && safeLng) {
            for (const loc of (FLEET_CONFIG.CUSTOM_LOCATIONS || [])) {
                if (Math.round(this.getDistKm(safeLat, safeLng, loc.lat, loc.lng) * 1000) <= (loc.radius || 500)) { isExternal = false; break; }
            }
        }
        const refuelType = isExternal ? 'Station Externe (Naftal)' : 'Site Interne';
        const price = isExternal ? naftalPriceCsv : sitePrice;
        const cost = Math.round((log.realAdded || 0) * price);
        const dbEntry = (this.truckDbCache || []).find(x => String(x.deviceId) === String(log.deviceId));
        const cardNum = (dbEntry && dbEntry.carteNaftal) ? dbEntry.carteNaftal : '';
        csv += `"${d.toLocaleDateString()}","${d.toLocaleTimeString()}","${log.truckName}","${cardNum}","${refuelType}",${log.realOld || ''},${log.realAdded},${log.realTotal},${log.capacity},"${exportLoc}","${wilaya}",${cost}\n`;
    });

    this._downloadCSV(csv, `rapport_remplissage_${new Date().toISOString().slice(0,10)}.csv`);
  }

exportDecouchageCSV() {
    if(!this.allDecouchageLogs || this.allDecouchageLogs.length === 0) { alert("Aucune donnée."); return; }
    
    // DIRECT FILTERING - No Date Shifting
    const startStr = this.decouchageDateStart.value;
    const endStr = this.decouchageDateEnd.value;
    const truckFilter = this.decouchageTruckSearch.value.toLowerCase().trim();

    const filtered = this.allDecouchageLogs.filter(log => {
        if (truckFilter && !log.truckName.toLowerCase().includes(truckFilter)) return false;
        if (startStr && log.date < startStr) return false;
        if (endStr && log.date > endStr) return false;
        return true;
    });

    if(filtered.length === 0) { alert("Rien à exporter."); return; }

    // 🔧 FIX: removed 'Statut' column (no status field in new data model)
    let csv = "Date (Nuit du),Heure D\u00e9tection,Camion,Lieu,Distance du Site (km)\n";
    filtered.forEach(log => {
        const detectedTime = log.detectedAt ? new Date(log.detectedAt).toLocaleTimeString('fr-FR') : '00:00';
        const locName = (log.locationName || `${log.locationAtMidnight?.lat?.toFixed(4) || '?'};${log.locationAtMidnight?.lng?.toFixed(4) || '?'}`).replace(/,/g, ' ');
        const distKm = log.distanceFromSite ? (log.distanceFromSite / 1000).toFixed(1) : '?';
        csv += `"${log.date}","${detectedTime}","${log.truckName}","${locName}","${distKm}"\n`;
    });

    this._downloadCSV(csv, `decouchage_${startStr}_${endStr}.csv`);
}

  // 3. NEW: DECOUCHAGE RECAP EXPORT (The missing function)
  exportDecouchageRecapCSV() {
      if(!this.currentDecouchageSummary || this.currentDecouchageSummary.length === 0) { alert("Pas de résumé disponible."); return; }
      let csv = "Camion,Total Nuits\n"; // 🔧 FIX: removed confirme/nonConfirme (fields no longer exist)
      this.currentDecouchageSummary.forEach(item => {
          csv += `"${item.name}",${item.total}\n`;
      });
      this._downloadCSV(csv, `decouchage_recap_${new Date().toISOString().slice(0,10)}.csv`);
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
                   <button class="btn-secondary btn-xs" style="color:#d32f2f; border-color:#d32f2f; background:#fff5f5;" onclick="ui.deleteRule(${index})"><i class="fa-solid fa-trash"></i></button>
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
    if (tabName === 'routing') this.populateRouteTruckList();
    if (tabName === 'alertsSection') this.refreshAlerts();
    if (tabName === 'settings') { 
         
        this.renderRulesList();
        if (typeof this.detectPotentialZones === 'function') this.detectPotentialZones();
        // Load truck metadata in settings
        this.loadTruckDbCache().then(() => this.populateSettingsTruckSelect());
        // Restore Naftal budget input from cloud config
        const budgetEl = document.getElementById('naftalBudgetInput');
        if (budgetEl && FLEET_CONFIG.NAFTAL_BUDGET) {
          budgetEl.value = FLEET_CONFIG.NAFTAL_BUDGET;
        }
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
    let intervalMs = FLEET_CONFIG.DEFAULT_POLL_INTERVAL || 120000; 
    
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
        : `<span style="background:#f1f5f9; color:var(--text-muted, #64748b); font-size:9px; padding:2px 6px; border-radius:10px;">STOP</span>`;
      const lat = t.position?.lat || t.lat || 0;
      const lng = t.position?.lng || t.lng || 0;
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
      return `
        <div class="stat-card ${isActive ? 'active-filter' : ''}"
             data-type="${filterType}"
             onclick="ui.setFilter('${filterType}', '${safeLabel}')"
             style="background:${grad}; cursor:pointer; border:none; border-radius:14px;
                    box-shadow: 0 4px 15px rgba(0,0,0,0.15); transition: transform .15s, box-shadow .15s;
                    transform: ${isActive ? 'translateY(-3px) scale(1.02)' : 'none'};
                    position:relative; overflow:hidden; color:white;"
             onmouseenter="this.style.transform='translateY(-3px) scale(1.02)'; this.style.boxShadow='0 8px 25px rgba(0,0,0,0.25)'"
             onmouseleave="this.style.transform='${isActive ? 'translateY(-3px) scale(1.02)' : 'none'}'; this.style.boxShadow='0 4px 15px rgba(0,0,0,0.15)'">
          <div style="position:absolute;top:-15px;right:-15px;width:70px;height:70px;border-radius:50%;background:var(--border, rgba(255,255,255,0.08));"></div>
          <div style="position:absolute;bottom:-20px;right:10px;font-size:42px;opacity:0.12;">${icon}</div>
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
            <div class="stat-icon" style="color:rgba(255,255,255,0.95); background:rgba(255,255,255,0.22); border-radius:10px; padding:8px; width:34px; height:34px; display:flex; align-items:center; justify-content:center; font-size:15px; flex-shrink:0;">${icon}</div>
            <div class="stat-label" style="font-weight:700; color:rgba(255,255,255,0.9); font-size:11px; text-transform:uppercase; letter-spacing:0.6px; line-height:1.2;">${label}</div>
          </div>
          <div class="stat-content">
            <div class="stat-value" style="color:white; font-size:36px; font-weight:900; line-height:1; letter-spacing:-1px; text-shadow:0 2px 8px rgba(0,0,0,0.2);">${value}</div>
            ${badge ? `<div style="font-size:10px;color:rgba(255,255,255,0.75);margin-top:4px;font-weight:600;">${badge}</div>` : '<div style="height:14px;"></div>'}
          </div>
          ${isActive ? '<div style="position:absolute;bottom:0;left:0;right:0;height:3px;background:rgba(255,255,255,0.6);border-radius:0 0 14px 14px;"></div>' : ''}
        </div>
      `;
    };

    // Documents card — special: opens panel instead of filter
    const docCardHtml = `
      <div class="stat-card ${this.currentFilter === 'docs' ? 'active-filter' : ''}"
           data-type="docs"
           onclick="ui.toggleDocPanel()"
           style="background:${docGrad}; cursor:pointer; border:none; border-radius:14px;
                  box-shadow: 0 4px 15px rgba(0,0,0,0.15); transition: transform .15s, box-shadow .15s;
                  position:relative; overflow:hidden; color:white;"
           onmouseenter="this.style.transform='translateY(-3px) scale(1.02)'; this.style.boxShadow='0 8px 25px rgba(0,0,0,0.25)'"
           onmouseleave="this.style.transform='none'; this.style.boxShadow='0 4px 15px rgba(0,0,0,0.15)'">
        <div style="position:absolute;top:-15px;right:-15px;width:70px;height:70px;border-radius:50%;background:var(--border, rgba(255,255,255,0.08));"></div>
        <div style="position:absolute;bottom:-20px;right:10px;font-size:42px;opacity:0.12;"><i class="fa-solid fa-file-shield"></i></div>
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
          <div class="stat-icon" style="color:rgba(255,255,255,0.95); background:rgba(255,255,255,0.22); border-radius:10px; padding:8px; width:34px; height:34px; display:flex; align-items:center; justify-content:center; font-size:15px; flex-shrink:0;"><i class="fa-solid fa-file-shield"></i></div>
          <div class="stat-label" style="font-weight:700; color:rgba(255,255,255,0.9); font-size:11px; text-transform:uppercase; letter-spacing:0.6px; line-height:1.2;">Documents</div>
        </div>
        <div class="stat-content">
          <div class="stat-value" style="color:white; font-size:36px; font-weight:900; line-height:1; letter-spacing:-1px; text-shadow:0 2px 8px rgba(0,0,0,0.2);">${refs.length}</div>
          <div style="font-size:10px;color:rgba(255,255,255,0.8);margin-top:4px;font-weight:600;">
            ${expiredDocs > 0 ? `<span style="background:rgba(0,0,0,0.25);border-radius:6px;padding:2px 6px;">⛔ ${expiredDocs} expiré${expiredDocs>1?'s':''}</span> ` : ''}
            ${soonDocs > 0 ? `<span style="background:rgba(0,0,0,0.25);border-radius:6px;padding:2px 6px;">\u26a0\ufe0f ${soonDocs} bientôt</span>` : ''}
            ${expiredDocs === 0 && soonDocs === 0 ? '<span style="background:rgba(0,0,0,0.25);border-radius:6px;padding:2px 6px;">\u2705 Tout valide</span>' : ''}
          </div>
        </div>
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
    this.trucksContainer.innerHTML = '';
    
    let trucks = app.getAllTrucks();
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

    if (trucks.length === 0) {
      this.trucksContainer.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 40px; color: #888; background:#111827; border-radius: 8px; color:var(--text-muted, #94a3b8);">Aucun camion ne correspond aux critères.</div>';
      return;
    }

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
      const vidangeBg = isVidangeOverdue ? '#fff5f5' : '#fff3e0';
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
        border: 1.5px solid ${cardAccentColor}55;
        border-radius: 16px;
        overflow: hidden;
        box-shadow: 0 4px 20px rgba(0,0,0,0.12), 0 1px 4px ${cardAccentColor}22;
        transition: transform .18s ease, box-shadow .18s ease;
        background: var(--bg-surface);
      `;
      card.onmouseenter = () => {
        card.style.transform = 'translateY(-4px)';
        card.style.boxShadow = `0 10px 32px rgba(0,0,0,0.18), 0 2px 8px ${cardAccentColor}44`;
        card.style.borderColor = cardAccentColor;
      };
      card.onmouseleave = () => {
        card.style.transform = '';
        card.style.boxShadow = `0 4px 20px rgba(0,0,0,0.12), 0 1px 4px ${cardAccentColor}22`;
        card.style.borderColor = `${cardAccentColor}55`;
      };
      const lat = truck.coordinates?.lat || 0;
      const lng = truck.coordinates?.lng || 0;
      const mapsUrl = `https://www.google.com/maps?q=${lat},${lng}&t=k&z=17`;

      card.innerHTML = `
        <!-- Colored header bar — clickable → Google Maps satellite -->
        <div style="background:${cardAccentGrad}; padding:10px 14px; display:flex; justify-content:space-between; align-items:center; cursor:pointer; user-select:none;"
             onclick="event.stopPropagation(); window.open('${mapsUrl}','_blank')"
             title="Voir sur Google Maps satellite">
          <div style="display:flex;align-items:center;gap:8px;">
            <span style="font-size:16px;font-weight:900;color:white;letter-spacing:-0.5px;">${truck.name}</span>
            ${truck.speed >= 1 ? '<span style="width:8px;height:8px;border-radius:50%;background:rgba(255,255,255,0.9);display:inline-block;box-shadow:0 0 6px rgba(255,255,255,0.8);"></span>' : '<span style="width:8px;height:8px;border-radius:50%;background:rgba(255,255,255,0.4);display:inline-block;"></span>'}
          </div>
          <div style="display:flex;align-items:center;gap:6px;">
            <span style="background:rgba(0,0,0,0.2); color:white; padding:3px 10px; border-radius:20px; font-size:11px; font-weight:800; white-space:nowrap;">
              ${isSpeeding ? '<i class="fa-solid fa-triangle-exclamation"></i> ' : ''}${truck.speed} km/h
            </span>
            <span style="background:rgba(0,0,0,0.2);color:white;padding:3px 8px;border-radius:20px;font-size:10px;" title="Ouvrir sur Google Maps satellite">
              <i class="fa-solid fa-map-location-dot"></i>
            </span>
          </div>
        </div>
        <!-- Card body -->
        <div style="padding:12px 14px; background:var(--bg-surface);">
          <div style="display:flex; gap:4px; margin-bottom:8px; flex-wrap:wrap; align-items:center;">
            ${(() => { const db = (ui.truckDbCache || []).find(d => d.deviceId === truck.id); if (!db) return ''; let tags = ''; if (db.carteNaftal) tags += `<span class="truck-meta-tag naftal"><i class="fa-solid fa-credit-card"></i> ${db.carteNaftal}</span> `; if (db.immatriculation) tags += `<span class="truck-meta-tag imm"><i class="fa-solid fa-id-badge"></i> ${db.immatriculation}</span> `; return tags; })()}
            ${this.renderReferenceBadges ? this.renderReferenceBadges(truck.id) : ''}
            ${hasExpiringRef ? `<span class="truck-meta-tag" style="background:#f97316;color:white;"><i class="fa-solid fa-triangle-exclamation"></i> Doc Expire</span>` : ''}
          </div>
          <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px; background:var(--bg-elevated); padding:10px; border-radius:10px; border:1px solid var(--border-light); margin-bottom:10px;">
            <div style="text-align:center;">
              <div style="color:var(--text-muted); font-size:9px; text-transform:uppercase; font-weight:700; letter-spacing:0.5px;">Odomètre</div>
              <strong style="color:${cardAccentColor}; font-size:1.15rem; font-weight:800;">${truck.odometer.toLocaleString()} <span style="font-size:9px; opacity:0.7">km</span></strong>
            </div>
            <div style="text-align:center; border-left:1px solid var(--border-light);">
              <div style="color:var(--text-muted); font-size:9px; text-transform:uppercase; font-weight:700; letter-spacing:0.5px;">Carburant</div>
              <strong style="color:${truck.isCriticalFuel ? '#ef4444' : 'var(--text-primary)'}; font-size:1.15rem; font-weight:800;">${truck.fuelLiters} <span style="font-size:9px; opacity:0.7">L</span></strong>
              <div style="font-size:9px; color:var(--text-muted);">${truck.fuelPercentage}% plein</div>
            </div>
          </div>
          <div style="font-size:11px; color:var(--text-secondary); display:flex; align-items:center; gap:6px; margin-bottom:10px;">
            <i class="fa-solid fa-location-dot" style="color:${truck.location.isCustom ? cardAccentColor : 'var(--text-muted)'}"></i>
            <strong style="color:${truck.location.isCustom ? cardAccentColor : 'var(--text-primary)'}; font-size:11px;">${truck.location.city}</strong>
            <span style="color:var(--text-muted);">— ${truck.location.wilaya}</span>
          </div>
        </div>

        ${truck.vidange.alert ? `
          <div style="margin-bottom: 12px; padding: 10px; background: ${vidangeBg}; border: 1px solid ${vidangeColor}40; border-left: 3px solid ${vidangeColor}; border-radius: var(--radius-md); font-size: 12px;">
            <strong style="color: ${vidangeColor};"><i class="fa-solid fa-wrench"></i> ${vidangeTitle}</strong>
            <div style="margin-top: 4px; color:var(--text-secondary);">Prévue à ${truck.vidange.nextKm}km (${vidangeRemainingText})</div>
            <button class="btn-primary" style="margin-top:8px; width:100%; background: ${vidangeColor}; box-shadow: 0 4px 12px ${vidangeColor}40; border:none;" onclick="ui.quickAddVidange('${truck.id}')">
              <i class="fa-solid fa-circle-check"></i> Déclarer Vidange
            </button>
          </div>
        ` : ''}
        
        ${truck.isVidangeCandidate ? `
          <div style="margin-bottom: 12px; padding: 8px 12px; background: var(--info-subtle); border-radius: 6px; border: 1px solid var(--info)40; font-size: 11px; color: var(--info); font-weight: 600; display:flex; align-items:center; gap:6px;">
            <i class="fa-solid fa-wrench"></i> VIDANGE EN COURS (${truck.zoneTimeMinutes}min)
          </div>
        ` : truck.inMaintenanceZone ? `
          <div style="margin-bottom: 12px; padding: 8px 12px; background: var(--primary-subtle); border-radius: 6px; border: 1px solid var(--primary)40; font-size: 11px; color: var(--primary); font-weight: 600; display:flex; align-items:center; gap:6px;">
            <i class="fa-solid fa-screwdriver-wrench"></i> ZONE MAINTENANCE (${truck.zoneTimeMinutes}min)
          </div>
        ` : ''}
        
          <div style="display:flex; gap:6px; border-top:1px solid var(--border-light); padding-top:10px;">
            <button onclick="event.stopPropagation(); window.ui.viewOnMap(${truck.coordinates?.lat||0}, ${truck.coordinates?.lng||0})"
              style="flex:1; background:${cardAccentGrad}; color:white; font-size:11px; padding:8px; border:none; border-radius:8px; cursor:pointer; font-weight:700; box-shadow:0 2px 8px ${cardAccentColor}40;">
              <i class="fa-solid fa-map-location-dot"></i> Suivre
            </button>
            <button onclick="event.stopPropagation(); window.ui.openRefModal('${truck.id}')"
              style="flex:1; background:linear-gradient(135deg,#38bdf8,#0284c7); color:white; font-size:11px; padding:8px; border:none; border-radius:8px; cursor:pointer; font-weight:700; box-shadow:0 2px 8px rgba(56,189,248,0.3);">
              <i class="fa-solid fa-file-contract"></i> Docs
            </button>
            <button onclick="event.stopPropagation(); window.ui.openMaintenanceModal('${truck.id}')"
              style="flex:1; background:var(--bg-elevated); color:var(--text-secondary); font-size:11px; padding:8px; border:1px solid var(--border-light); border-radius:8px; cursor:pointer; font-weight:700;">
              <i class="fa-solid fa-wrench"></i> Maint.
            </button>
          </div>
        </div>
      `;

      this.trucksContainer.appendChild(card);
    });
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
      this.renderWilayaView();
  }

  setFuelFilter(state) {
    this.fuelFilterState = state;
    this.renderFuelSection();
  }

  setVidangeFilter(state) {
    this.vidangeFilterState = state;
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
    controls.innerHTML = `
      <button class="filter-pill ${this.fuelFilterState === 'all' ? 'active' : ''}" onclick="ui.setFuelFilter('all')">Tout</button>
      <button class="filter-pill critical ${this.fuelFilterState === 'critical' ? 'active' : ''}" onclick="ui.setFuelFilter('critical')">Critique</button>
      <button class="filter-pill warning ${this.fuelFilterState === 'warning' ? 'active' : ''}" onclick="ui.setFuelFilter('warning')">Bas</button>
      <button class="filter-pill normal ${this.fuelFilterState === 'normal' ? 'active' : ''}" onclick="ui.setFuelFilter('normal')">Normal</button>
    `;
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
    let trucks = app.getAllTrucks().sort((a, b) => a.vidange.kmUntilNext - b.vidange.kmUntilNext);
    trucks = this.filterBySearch(trucks);

    if (this.vidangeFilterState === 'urgent') trucks = trucks.filter(t => t.vidange.alert);
    else if (this.vidangeFilterState === 'warning') trucks = trucks.filter(t => !t.vidange.alert && t.vidange.kmUntilNext < (t.vidange.alertKm + 3000));
    else if (this.vidangeFilterState === 'ok') trucks = trucks.filter(t => !t.vidange.alert && t.vidange.kmUntilNext >= (t.vidange.alertKm + 3000));

    const controls = document.createElement('div');
    controls.className = 'sub-filters';
    controls.innerHTML = `
      <button class="filter-pill ${this.vidangeFilterState === 'all' ? 'active' : ''}" onclick="ui.setVidangeFilter('all')">Tout</button>
      <button class="filter-pill critical ${this.vidangeFilterState === 'urgent' ? 'active' : ''}" onclick="ui.setVidangeFilter('urgent')">Urgent</button>
      <button class="filter-pill warning ${this.vidangeFilterState === 'warning' ? 'active' : ''}" onclick="ui.setVidangeFilter('warning')">Bientôt</button>
      <button class="filter-pill normal ${this.vidangeFilterState === 'ok' ? 'active' : ''}" onclick="ui.setVidangeFilter('ok')">OK</button>
    `;
    this.vidangeSectionContainer.appendChild(controls);

    // ── Resync Vidange Button ──────────────────────────────────────
    const resyncBtn = document.createElement('button');
    resyncBtn.id = 'vidangeResyncBtn';
    resyncBtn.innerHTML = '<i class="fa-solid fa-rotate"></i> Resynchroniser Historique Vidange';
    resyncBtn.style.cssText = 'margin:8px 0 4px;padding:7px 16px;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;border:none;border-radius:8px;font-size:12px;font-weight:700;cursor:pointer;display:flex;align-items:center;gap:7px;transition:opacity .2s;';
    resyncBtn.onmouseenter = () => resyncBtn.style.opacity = '0.85';
    resyncBtn.onmouseleave = () => resyncBtn.style.opacity = '1';
    resyncBtn.onclick = async () => {
      resyncBtn.disabled = true;
      resyncBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Synchronisation...';
      try {
        const base = (typeof FLEET_CONFIG !== 'undefined' && FLEET_CONFIG.API && FLEET_CONFIG.API.baseUrl) ? FLEET_CONFIG.API.baseUrl : '';
        const code = localStorage.getItem('accessCode') || '';
        const r = await fetch(base + '/api/admin/sync-vidange-overrides', {
          method: 'POST', headers: { 'Content-Type': 'application/json', 'x-access-code': code }
        });
        const d = await r.json();
        if (d.success) {
          resyncBtn.innerHTML = '<i class="fa-solid fa-check"></i> ' + d.synced + ' synchronises, ' + d.skipped + ' deja OK';
          resyncBtn.style.background = 'linear-gradient(135deg,#10b981,#059669)';
          if (typeof ui !== 'undefined' && ui.syncSettings) { await ui.syncSettings(); ui.renderVidangeSection(); }
          setTimeout(() => { resyncBtn.innerHTML = '<i class="fa-solid fa-rotate"></i> Resynchroniser Historique Vidange'; resyncBtn.style.background = 'linear-gradient(135deg,#6366f1,#8b5cf6)'; resyncBtn.disabled = false; }, 4000);
        } else {
          resyncBtn.innerHTML = '<i class="fa-solid fa-xmark"></i> Erreur: ' + (d.error || '?');
          resyncBtn.style.background = '#e63946';
          setTimeout(() => { resyncBtn.innerHTML = '<i class="fa-solid fa-rotate"></i> Resynchroniser Historique Vidange'; resyncBtn.style.background = 'linear-gradient(135deg,#6366f1,#8b5cf6)'; resyncBtn.disabled = false; }, 4000);
        }
      } catch(e) {
        resyncBtn.innerHTML = '<i class="fa-solid fa-xmark"></i> Erreur reseau';
        resyncBtn.style.background = '#e63946';
        setTimeout(() => { resyncBtn.innerHTML = '<i class="fa-solid fa-rotate"></i> Resynchroniser Historique Vidange'; resyncBtn.style.background = 'linear-gradient(135deg,#6366f1,#8b5cf6)'; resyncBtn.disabled = false; }, 4000);
      }
    };
    this.vidangeSectionContainer.appendChild(resyncBtn);

    const header = document.createElement('div');
    header.className = 'accordion-header';
    header.style.borderLeftColor = 'var(--orange)';
    header.innerHTML = `
      <div>
        <h3 style="margin:0;"><i class="fa-solid fa-wrench"></i> État des Vidanges</h3>
        <span style="font-size: 12px; color: #666;">${trucks.length} Camions affichés</span>
      </div>
      <div style="font-size: 20px;">${this.vidangeAccordionState ? '<i class="fa-solid fa-chevron-down"></i>' : '<i class="fa-solid fa-chevron-right"></i>'}</div>
    `;
    header.onclick = () => {
      this.vidangeAccordionState = !this.vidangeAccordionState;
      this.renderVidangeSection();
    };
    this.vidangeSectionContainer.appendChild(header);

    const content = document.createElement('div');
    content.className = `accordion-content ${this.vidangeAccordionState ? 'show' : ''}`;
    
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

          const bg = isAlert ? '#fff5f5' : 'white';
          
          return `
          <div style="background: ${bg}; padding: 15px; border-radius: 8px; border: 1px solid ${isAlert ? color : '#ddd'}; border-left: 4px solid ${color}; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
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
                <div style="color:#888;">Prochaine</div>
                <strong style="color: ${color}; font-size: 14px;">${t.vidange.nextKm} km</strong>
              </div>
              <div>
	                <div style="color:#888;">${remainingLabel}</div>
	                <strong style="color: ${isOverdue ? color : '#333'}; font-size: 14px;">${remainingValue.toLocaleString()} km</strong>
              </div>
            </div>
            
            <div style="margin-top: 8px; padding-top: 8px; border-top: 1px solid #eee; font-size: 11px; color: #666; display: flex; justify-content: space-between;">
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
    try {
      const trucks = app.getAllTrucks();
      const t = trucks.find(x => String(x.id) === String(deviceId));
      if (!t) {
        alert('Camion introuvable');
        return;
      }

      // Move to history + open modal (user request)
      this.switchTab('maintenanceHistory');
      this.fetchAndRenderMaintenance();

      // Open modal after tab content is visible
      setTimeout(() => {
        this.openMaintenanceModal(null);

        // Select the correct truck by deviceId
        const select = document.getElementById('modalMaintTruck');
        if (select) {
          const opt = Array.from(select.options).find(o => o.dataset && String(o.dataset.id) === String(deviceId));
          if (opt) select.value = opt.value;
          // trigger change so default odometer fills correctly
          select.dispatchEvent(new Event('change'));
        }

        const typeEl = document.getElementById('modalMaintType');
        if (typeEl) typeEl.value = 'Vidange';

        const odoEl = document.getElementById('modalMaintOdo');
        if (odoEl) odoEl.value = t.odometer || '';

        const noteEl = document.getElementById('modalMaintNote');
        if (noteEl && !noteEl.value) noteEl.value = 'Vidange confirmée (manuel)';
      }, 80);

    } catch (e) {
      console.error('quickAddVidange error:', e);
      alert('Erreur: impossible d’ouvrir la vidange');
    }
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
        const response = await fetch(url);
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
      try {
          const res = await fetch(`${FLEET_CONFIG.API.baseUrl}/api/trucks`);
          const data = await this.parseJsonResponseSafe(res);
          trucks = Object.entries(data || {}).map(([deviceId, truck]) => ({
              deviceId: String(deviceId),
              name: String((truck && truck.name) || deviceId)
          }));
      } catch (error) {
          if (window.app && typeof window.app.getAllTrucks === 'function') {
              trucks = (window.app.getAllTrucks() || []).map((truck) => ({
                  deviceId: String(truck.id),
                  name: String(truck.name || truck.id)
              }));
          } else {
              throw error;
          }
      }

      const search = (this.refuelTruckSearch && this.refuelTruckSearch.value || '').toLowerCase().trim();
      if (!search) return trucks;

      const filtered = trucks.filter((truck) => truck.name.toLowerCase().includes(search) || truck.deviceId.toLowerCase().includes(search));
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
              headers: { 'Content-Type': 'application/json' },
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
        this.refuelHistoryContainer.innerHTML = '<div style="text-align:center; padding:20px; color:#888;">Aucun remplissage détecté.</div>';
        return;
    }

    // 1. Get Filter Values
    const startDate = this.refuelDateStart.value ? new Date(this.refuelDateStart.value) : null;
    const endDate = this.refuelDateEnd.value ? new Date(this.refuelDateEnd.value) : null;
    if(endDate) endDate.setHours(23, 59, 59, 999);
    
    const truckSearch = this.refuelTruckSearch.value.toLowerCase().trim();
    const locationSearch = this.refuelLocationSearch ? this.refuelLocationSearch.value.toLowerCase().trim() : '';
    const locationType = this.refuelLocationTypeFilter ? this.refuelLocationTypeFilter.value : 'all';

    // 2. Process and Normalize Data
    let processedLogs = this.allRefuelLogs.map(log => {
        const truckConfig = getTruckConfig(log.deviceId);
        const capacity = truckConfig.fuelTankCapacity || 600; 
        
        // --- COORDINATE FIX (MONGODB COMPATIBILITY) ---
        const rawLat = log.lat || (log.params && log.params.lat);
        const rawLng = log.lng || (log.params && log.params.lng);
        const safeLat = rawLat ? parseFloat(rawLat) : 0;
        const safeLng = rawLng ? parseFloat(rawLng) : 0;

        const logId = `refuel-loc-${log._id || Math.random().toString(36).substr(2, 9)}`;
        let locationName = "Recherche...";
        let isInternal = false;
        
        // STEP A: Check Custom Locations (Instant)
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

        // STEP B: Check Geocode Cache or Fetch (Lazy Loading)
        if (!isInternal && safeLat !== 0) {
            const cached = geocodeService.checkCacheInstant(safeLat, safeLng);
            if (cached) {
                locationName = `${cached.city}, ${cached.wilaya}`;
            } else {
                // Not in cache? Start background fetching
                locationName = `<span id="${logId}-text">${safeLat.toFixed(3)}, ${safeLng.toFixed(3)}</span>`;
                geocodeService.reverseGeocode(safeLat, safeLng).then(res => {
                    const el = document.getElementById(`${logId}-text`);
                    if (el) el.innerText = `${res.city}, ${res.wilaya}`;
                });
            }
        } else if (safeLat === 0) {
            locationName = "Position Inconnue";
        }

        return {
            ...log,
            lat: safeLat,
            lng: safeLng,
            domId: logId,
            // V6 FIX: Read directly from MongoDB fields (diffPercent/newPercent DON'T EXIST)
            realAdded: Math.round(log.addedLiters || 0),
            realTotal: Math.round(log.newLevel || 0),
            realOld: Math.round(log.oldLevel > 0 ? log.oldLevel : ((log.newLevel || 0) - (log.addedLiters || 0))),
            truckCapacity: capacity, 
            locationDisplay: locationName,
            isInternal: isInternal
        };
    });

    // 3. Apply Filters
    processedLogs = processedLogs.filter(log => {
        const logDate = new Date(log.timestamp);
        // Safety filter: ignore tiny refills (server already filters >50L)
        const minRefuelDisplay = Math.max(60, parseInt((FLEET_CONFIG.REFUEL_RULES || {}).minRefuelLiters || 60));
        if (Number(log.realAdded) < minRefuelDisplay) return false;
        if (startDate && logDate < startDate) return false;
        if (endDate && logDate > endDate) return false;
        if (truckSearch && !log.truckName.toLowerCase().includes(truckSearch)) return false;
        if (locationType === 'internal' && !log.isInternal) return false;
        if (locationType === 'external' && log.isInternal) return false;
        // Search inside location name even if it's currently "Recherche..."
        if (locationSearch && !String(log.locationDisplay || '').toLowerCase().includes(locationSearch)) return false;
        return true;
    });

    // 4. Sort based on user selection
    if (this.refuelSortOrder === 'qtydesc' || this.refuelSortOrder === 'qty_desc') {
        processedLogs.sort((a, b) => (Number(b.realAdded) || 0) - (Number(a.realAdded) || 0));
    } else {
        // Default: newest first
        processedLogs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    }

    // 5. Pagination
    const totalItems = processedLogs.length;
    const totalPages = Math.ceil(totalItems / this.refuelItemsPerPage);
    const startIndex = (this.refuelCurrentPage - 1) * this.refuelItemsPerPage;
    const paginatedLogs = processedLogs.slice(startIndex, startIndex + this.refuelItemsPerPage);

    // 6. Generate HTML — Enhanced Fuel History Cards
    // Stats summary at top
    const totalRefuels = processedLogs.length;
    const totalVolume = processedLogs.reduce((sum, l) => sum + (Number(l.realAdded) || 0), 0);
    const internalCount = processedLogs.filter(l => l.isInternal).length;
    const externalCount = totalRefuels - internalCount;

    let html = `
    <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap:10px; margin-bottom:15px;">
        <div style="background:rgba(16,185,129,0.1); border:1px solid rgba(16,185,129,0.2); border-radius:8px; padding:12px; text-align:center;">
            <div style="font-size:17px; font-weight:900; color:#10b981;">${totalRefuels}</div>
            <div style="font-size:11px; color:var(--text-muted); font-weight:600;">Remplissages</div>
        </div>
        <div style="background:rgba(59,130,246,0.1); border:1px solid rgba(59,130,246,0.2); border-radius:8px; padding:12px; text-align:center;">
            <div style="font-size:22px; font-weight:900; color:#3b82f6;">${totalVolume.toLocaleString()} L</div>
            <div style="font-size:11px; color:var(--text-muted); font-weight:600;">Volume Total</div>
        </div>
        <div style="background:rgba(34,197,94,0.1); border:1px solid rgba(34,197,94,0.2); border-radius:8px; padding:12px; text-align:center;">
            <div style="font-size:22px; font-weight:900; color:#22c55e;">${internalCount}</div>
            <div style="font-size:11px; color:var(--text-muted); font-weight:600;">Sur Site</div>
        </div>
        <div style="background:var(--bg-elevated); border:1px solid var(--border); border-radius:8px; padding:12px; text-align:center;">
            <div style="font-size:22px; font-weight:900; color:var(--text-secondary);">${externalCount}</div>
            <div style="font-size:11px; color:var(--text-muted); font-weight:600;">Externe</div>
        </div>
    </div>`;

    html += '<div style="display:grid; gap:10px;">';
    for (const log of paginatedLogs) {
        const dateObj = new Date(log.timestamp);
        const dateDisplay = dateObj.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
        const timeDisplay = dateObj.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

        const locBadge = log.isInternal 
            ? `<span style="background:#dcfce7; color:#166534; padding:3px 10px; border-radius:20px; font-size:10px; font-weight:bold; display:inline-flex; align-items:center; gap:4px; white-space:nowrap;"><i class="fa-solid fa-building"></i> SITE INTERNE</span>`
            : `<span style="background:#fff7ed; color:#c2410c; padding:3px 10px; border-radius:20px; font-size:10px; font-weight:bold; display:inline-flex; align-items:center; gap:4px; white-space:nowrap;"><i class="fa-solid fa-gas-pump"></i> STATION</span>`;

        // Fuel bar visualization
        const fillPercent = log.truckCapacity > 0 ? Math.min(100, Math.round((log.realTotal / log.truckCapacity) * 100)) : 0;
        const oldPercent = log.truckCapacity > 0 ? Math.min(100, Math.round(((log.realOld || 0) / log.truckCapacity) * 100)) : 0;
        const barColor = fillPercent < 15 ? '#dc2626' : fillPercent < 30 ? '#f59e0b' : '#22c55e';

        html += `
        <div class="refuel-card" style="background:var(--bg-surface); border:1px solid var(--border); border-left: 5px solid ${log.isInternal ? '#22c55e' : '#f59e0b'}; padding:15px; border-radius:10px; box-shadow:var(--shadow-sm);">
            <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:10px;">
                <div>
                    <div style="font-weight:800; font-size:15px; color:var(--text-primary);">${log.truckName}</div>
                    <div style="font-size:11px; color:var(--text-muted); margin-top:2px;">
                        <i class="fa-regular fa-calendar"></i> ${dateDisplay} &nbsp; <i class="fa-regular fa-clock"></i> ${timeDisplay}
                    </div>
                    ${(() => { const db = (this.truckDbCache||[]).find(d=>d.deviceId===String(log.deviceId)); return db&&db.carteNaftal ? `<span class="truck-meta-tag naftal" style="margin-top:4px; display:inline-block; font-size:10px; padding:2px 10px;"><i class="fa-solid fa-credit-card"></i> N° ${db.carteNaftal}</span>` : ''; })()}
                </div>
                <div style="text-align:right;">
                    <div style="font-size:24px; font-weight:900; color:${log.isInternal ? '#15803d' : 'var(--text-primary)'}; line-height:1;">+${log.realAdded} L</div>
                    <div style="font-size:10px; color:var(--text-muted); margin-top:2px;">≈ ${Math.round(log.realAdded * (log.isInternal ? (FLEET_CONFIG.DEFAULT_TRUCK_CONFIG.fuelPricePerLiter || 29) : (ui.naftalPricePerLiter || 31)))} DA${log.isInternal ? '' : ' <span style="color:#f59e0b; font-size:9px;">(Naftal)</span>'}</div>
                </div>
            </div>

            <!-- Fuel level bar: before → after -->
            <div style="margin-bottom:10px;">
                <div style="display:flex; justify-content:space-between; font-size:10px; color:var(--text-muted); margin-bottom:3px;">
                    <span>${(log.realOld && log.realOld > 0) ? ('↓ Avant: ' + log.realOld + ' L (' + oldPercent + '%)') : ''}</span>
                    <span>Après: ${log.realTotal} L (${fillPercent}%)</span>
                </div>
                <div style="background:var(--bg-elevated); border-radius:4px; height:8px; overflow:hidden; position:relative;">
                    <div style="position:absolute; left:0; top:0; height:100%; width:${oldPercent}%; background:var(--text-dim); border-radius:4px;"></div>
                    <div style="position:absolute; left:0; top:0; height:100%; width:${fillPercent}%; background:${barColor}; border-radius:4px; transition:width 0.3s;"></div>
                </div>
                <div style="font-size:10px; color:var(--text-muted); text-align:right; margin-top:2px;">Capacité: ${log.truckCapacity} L</div>
            </div>

            <!-- Location -->
            <div style="display:flex; justify-content:space-between; align-items:center;">
                <div style="display:flex; align-items:center; gap:8px;">
                    ${locBadge}
                    <span style="font-size:12px; color:var(--text-secondary); font-weight:600;" id="${log.domId}-text">${log.locationDisplay}</span>
                </div>
                ${(log.lat && log.lng && log.lat !== 0) ? `
                <div style="display:flex; gap:6px;">
                    <a href="https://www.google.com/maps?q=${log.lat},${log.lng}" target="_blank" style="font-size:10px; color:#2563eb; text-decoration:none; background:rgba(37,99,235,0.1); padding:4px 8px; border-radius:4px; font-weight:600;">
                        <i class="fa-solid fa-map-location-dot"></i> Maps
                    </a>
                    <button onclick="ui.viewOnMap(${log.lat}, ${log.lng})" style="font-size:10px; color:#0284c7; background:rgba(2,132,199,0.1); padding:4px 8px; border-radius:4px; font-weight:600; border:none; cursor:pointer;">
                        <i class="fa-solid fa-crosshairs"></i> Carte
                    </button>
                </div>` : ''}
            </div>
        </div>`;
    }
    html += '</div>';

    // 7. Render Pagination Controls
    if (totalPages > 1) {
        html += `
        <div class="pagination-controls">
            <button class="pagination-btn" onclick="ui.changeRefuelPage(-1)" ${this.refuelCurrentPage === 1 ? 'disabled' : ''}>«</button>
            <span class="pagination-info">Page ${this.refuelCurrentPage} / ${totalPages}</span>
            <button class="pagination-btn" onclick="ui.changeRefuelPage(1)" ${this.refuelCurrentPage === totalPages ? 'disabled' : ''}>»</button>
        </div>`;
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

// --- PLANNING & ROUTING (FIXED LANGUAGE & CLARITY) ---
  handleRouteDestinationSearch(query) {
    if (query.length < 2) { this.routeAutocompleteDropdown.style.display = 'none'; return; }
    
    let apiKey = FLEET_CONFIG.GEOAPIFY_API_KEY;
    if(FLEET_CONFIG.GEOAPIFY_API_KEYS && FLEET_CONFIG.GEOAPIFY_API_KEYS.length > 0) apiKey = FLEET_CONFIG.GEOAPIFY_API_KEYS[0];

    // ADDED: &lang=fr to force French names
    fetch(`https://api.geoapify.com/v1/geocode/autocomplete?text=${encodeURIComponent(query)}&apiKey=${apiKey}&limit=5&country=dz&lang=fr`)
      .then(res => res.json())
      .then(data => {
        this.routeAutocompleteDropdown.innerHTML = '';
        if (data.features && data.features.length > 0) {
          data.features.forEach(f => {
            const p = f.properties;
            
            // 1. SMART NAME PRIORITY (Avoids "undefined")
            const cityName = p.city || p.town || p.village || p.municipality || p.name || "Lieu";
            
            // 2. CLEAN WILAYA/STATE
            let context = p.state || p.county || 'Algérie';
            
            // Avoid redundancy (e.g., "Alger, Alger")
            if (context.toLowerCase() === cityName.toLowerCase()) context = "Wilaya";

            const div = document.createElement('div');
            div.style.cssText = 'padding: 10px; cursor: pointer; border-bottom: 1px solid #f1f5f9; transition: background 0.2s;';
            div.onmouseover = () => { div.style.background = '#f8fafc'; };
            div.onmouseout = () => { div.style.background = 'white'; };

            // 3. IMPROVED VISUAL LAYOUT
            div.innerHTML = `
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <span style="color:var(--bg-elevated, #1e293b); font-size:13px;">
                        <i class="fa-solid fa-map-pin" style="color: var(--teal); margin-right: 8px;"></i> 
                        <strong>${cityName}</strong>
                    </span>
                    <span style="font-size:10px; color:var(--text-muted, #64748b); background:var(--text-primary, #e2e8f0); padding:2px 6px; border-radius:4px; font-weight:bold;">
                        ${context}
                    </span>
                </div>
                <div style="font-size:10px; color:var(--text-muted, #94a3b8); margin-left:22px; margin-top:2px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
                    ${p.formatted || ''}
                </div>
            `;

            div.onclick = () => {
              if (!this.selectedRouteDestinations) this.selectedRouteDestinations = [];
              this.selectedRouteDestinations.push({ 
                city: cityName, 
                lat: f.geometry.coordinates[1], 
                lng: f.geometry.coordinates[0],
                wilaya: p.state || context 
              });
              // Update Input Field
              this.routeDestSearch.value = '';
              this.routeAutocompleteDropdown.style.display = 'none';
              this.renderRouteDestinations();
            };
            this.routeAutocompleteDropdown.appendChild(div);
          });
          this.routeAutocompleteDropdown.style.display = 'block';
        } else {
            this.routeAutocompleteDropdown.style.display = 'none';
        }
      })
      .catch(e => console.log("Geo search failed", e));
  }

  renderRouteDestinations() {
    const list = document.getElementById('routeDestinationsList');
    if (!list) return;
    if (!this.selectedRouteDestinations) this.selectedRouteDestinations = [];
    
    list.innerHTML = this.selectedRouteDestinations.map((dest, i) => `
      <div style="background: var(--primary-subtle); color: var(--primary); padding: 4px 8px; border-radius: 4px; font-size: 12px; display: flex; align-items: center; gap: 6px; border: 1px solid var(--border-primary);">
        <span>${i + 1}. ${dest.city}</span>
        <i class="fa-solid fa-xmark" style="cursor: pointer; opacity: 0.7;" onclick="ui.removeRouteDestination(${i})"></i>
      </div>
    `).join('');
  }

  removeRouteDestination(index) {
    if (this.selectedRouteDestinations) {
        this.selectedRouteDestinations.splice(index, 1);
        this.renderRouteDestinations();
    }
  }

  calculateRoute() {
    const truckId = this.routeTruck.value;
    const destinations = this.selectedRouteDestinations;

    if (!truckId || !destinations || destinations.length === 0) {
      alert('\u26a0\ufe0f Sélectionnez un camion et au moins une destination.');
      return;
    }

    const truck = app.trucks.get(truckId);
    // Use TRUCK SPECIFIC CONFIG for calculation
    const config = getTruckConfig(truckId);
    
    const pricePerLiter = config.fuelPricePerLiter || 29; 
    const marginLiters = config.fuelSecurityMargin || 100; 
    const consumption = config.fuelConsumption || 35;

    // Loop over destinations
    let totalDistance = 0;
    let currentPoint = { lat: truck.coordinates.lat, lng: truck.coordinates.lng };
    
    destinations.forEach(dest => {
        totalDistance += calculateDistance(currentPoint.lat, currentPoint.lng, dest.lat, dest.lng);
        currentPoint = dest;
    });

    const roadDistance = Math.round(totalDistance * 1.25);
    const fuelNeededForTrip = Math.round((roadDistance / 100) * consumption);
    const remainingAfterTrip = truck.fuelLiters - fuelNeededForTrip;
    const shortfall = marginLiters - remainingAfterTrip;
    
    let litersToBuy = 0;
    let statusColor = 'green';
    let statusText = '\u2705 SUFFISANT';
    let cost = 0;

    if (shortfall > 0) {
      litersToBuy = shortfall;
      statusColor = 'orange'; 
      statusText = `\u26a0\ufe0f FAIRE L'APPOINT`;
      if (remainingAfterTrip < 0) {
        statusColor = 'red';
        statusText = `❌ INSUFFISANT`;
      }
      cost = litersToBuy * pricePerLiter;
    }

    this.routeResultsContainer.innerHTML = `
      <div class="route-result" style="background: var(--bg-surface); padding: 20px; border-radius: 8px; box-shadow: var(--shadow-md); border-top: 5px solid ${statusColor}; margin-top: 20px; border-left: 1px solid var(--border-strong); border-right: 1px solid var(--border-strong); border-bottom: 1px solid var(--border-strong);">
        <h3 style="margin: 0 0 15px 0; color: var(--primary);"><i class="fa-solid fa-route"></i> Itinéraire: ${truck.name} <i class="fa-solid fa-arrow-right"></i> ${destinations.map(d => d.city).join(' <i class="fa-solid fa-arrow-right"></i> ')}</h3>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 20px;">
          <div><div style="font-size: 12px; color: var(--text-muted);">DISTANCE (Est.)</div><div style="font-size: 18px; font-weight: bold;">${roadDistance} km</div></div>
          <div><div style="font-size: 12px; color: var(--text-muted);">CONSO (${consumption}L/100)</div><div style="font-size: 18px; font-weight: bold;">${fuelNeededForTrip} L</div></div>
        </div>
        <div style="background: var(--bg-elevated); padding: 15px; border-radius: 8px;">
          <h4 style="margin: 0 0 10px 0; color: ${statusColor};">${statusText}</h4>
          ${litersToBuy > 0 ? '<div style="font-size:24px;font-weight:bold;color:'+statusColor+';">'+litersToBuy+' Litres</div>' : '<p style="color:var(--success);">Reserve OK: '+remainingAfterTrip+'L</p>'}
        </div>
      </div>
    `;
  }

  goToPlanning(truckId) {
      this.switchTab('routing');
      this.routeTruck.value = truckId;
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
        cSite = { id: 'zone_' + Date.now() + '_' + Math.floor(Math.random()*9999), name: cl.name, type: 'client', clientId: cl.id, color: cl.color || '#3b82f6', lat: 0, lng: 0, radius: 500 };
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
        <button onclick="document.getElementById('zoneManagementModal').remove()" style="width:34px;height:34px;border:none;background:var(--bg-elevated,rgba(255,255,255,0.06));border-radius:9px;color:var(--text-muted,#888);font-size:16px;cursor:pointer;display:flex;align-items:center;justify-content:center;" onmouseover="this.style.background='rgba(239,68,68,0.15)';this.style.color='#f87171'" onmouseout="this.style.background='var(--bg-elevated,rgba(255,255,255,0.06))';this.style.color='var(--text-muted,#888)'">&times;</button>
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
    const loc = isNew ? { name: '', type: 'other', lat: '', lng: '', radius: 500, color: '#3b82f6', icon: '' } : locs[index];
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
        <button onclick="document.getElementById('zmEditOverlay').remove()" style="background:rgba(255,255,255,0.06);border:none;border-radius:8px;width:32px;height:32px;color:var(--text-muted, #64748b);font-size:16px;cursor:pointer;">\u2715</button>
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

  const zone = document.getElementById('zrFilterZone')?.value || '';
  const truck = document.getElementById('zrFilterTruck')?.value || '';
  const start = document.getElementById('zrFilterStart')?.value || '';
  const end = document.getElementById('zrFilterEnd')?.value || '';

  let url = `${FLEET_CONFIG.API.baseUrl}/api/zone-events?limit=2000`;
  if (zone) url += `&zone=${encodeURIComponent(zone)}`;
  if (truck) url += `&truck=${encodeURIComponent(truck)}`;
  if (start) url += `&start=${new Date(start).toISOString()}`;
  if (end) url += `&end=${new Date(end).toISOString()}`;

  try {
    const res = await fetch(url, { headers: { 'x-access-code': this.currentCode } });
    const raw = await res.json();
    const data = Array.isArray(raw) ? raw : (raw && raw.data ? raw.data : []);
    this._zoneData = data;

    if (!data.length) {
      container.innerHTML = '<div class="zr-empty">Aucun événement trouvé</div>';
      if (statsBar) statsBar.style.display = 'none';
      return;
    }

    // Stats
    const closed = data.filter(e => e.status === 'closed');
    const avgDur = closed.length ? Math.round(closed.reduce((s,e) => s + (e.durationMinutes||0), 0) / closed.length) : 0;
    if (statsBar) {
      statsBar.style.display = 'grid';
      statsBar.innerHTML = [
        { val: data.length, label: 'Visites', color: '#818cf8' },
        { val: new Set(data.map(e=>e.truckName)).size, label: 'Camions', color: '#38bdf8' },
        { val: new Set(data.map(e=>e.zoneName)).size, label: 'Zones', color: '#fb923c' },
        { val: avgDur + ' min', label: 'Durée Moy.', color: '#4ade80' }
      ].map(s => `<div class="zr-stat"><div class="zr-stat-val" style="color:${s.color};">${s.val}</div><div class="zr-stat-label">${s.label}</div></div>`).join('');
    }

    // Table
    container.innerHTML = `<table class="zr-table">
      <thead><tr><th>Date</th><th>Camion</th><th>Zone</th><th>Entrée</th><th>Sortie</th><th>Durée</th><th>Statut</th></tr></thead>
      <tbody>${data.map(e => {
        const dt = new Date(e.entryTime);
        const durH = Math.floor((e.durationMinutes||0)/60);
        const durM = (e.durationMinutes||0)%60;
        const dur = e.durationMinutes != null ? (durH > 0 ? `${durH}h ${durM}m` : `${durM}m`) : '—';
        const badge = e.status === 'open'
          ? `<span class="zr-op-status arrived">En cours</span>`
          : `<span class="zr-op-status completed">Terminé</span>`;
        const eJson = JSON.stringify({
          deviceId: e.deviceId, truckName: e.truckName, zoneName: e.zoneName,
          entryLat: e.entryLat, entryLng: e.entryLng, exitLat: e.exitLat, exitLng: e.exitLng,
          entryTime: e.entryTime, exitTime: e.exitTime, durationMinutes: e.durationMinutes,
          recapImmobilisationMin: e.recapImmobilisationMin, clientName: e.clientName, finalClientName: e.finalClientName
        }).replace(/'/g, "\\'");
        return `<tr style="cursor:pointer;" onclick="ui._zoneHistoryRowClick('${e.deviceId || ''}','${e.truckName}',${e.entryLat||'null'},${e.entryLng||'null'},'${e.entryTime}','${e.exitTime||''}')" title="Cliquer pour voir sur la carte">
          <td>${dt.toLocaleDateString('fr-FR')}</td>
          <td style="font-weight:600;color:#38bdf8;">${e.truckName}</td>
          <td style="color:#818cf8;">${e.zoneName}</td>
          <td>${dt.toLocaleTimeString('fr-FR')}</td>
          <td>${e.exitTime ? new Date(e.exitTime).toLocaleTimeString('fr-FR') : '—'}</td>
          <td class="zr-dur">${dur}</td>
          <td>${badge}</td>
          <td><button onclick="event.stopPropagation();ui._zoneHistoryRowClick('${e.deviceId || ''}','${e.truckName}',${e.entryLat||'null'},${e.entryLng||'null'},'${e.entryTime}','${e.exitTime||''}')" style="background:rgba(56,189,248,0.1);border:1px solid rgba(56,189,248,0.3);color:#38bdf8;border-radius:6px;padding:3px 8px;cursor:pointer;font-size:10px;font-weight:700;white-space:nowrap;"><i class="fa-solid fa-crosshairs" style="margin-right:3px;"></i>Voir</button></td>
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
              return {
                  time: new Date(p[0]).getTime(),
                  dateObj: new Date(p[0]),
                  lat: parseFloat(p[1]),
                  lng: parseFloat(p[2]),
                  speed: parseFloat((p[5] !== undefined ? p[5] : p[3]) || 0) || 0,
                  params: params
              };
          }
          const timeValue = p.time || p.timestamp || p.t;
          return {
              time: new Date(timeValue).getTime(),
              dateObj: new Date(timeValue),
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

	      let refillCount = refillEvents.length, refillVolume = refillEvents.reduce((sum, evt) => sum + (evt.addedLiters || 0), 0), consumedLiters = 0;
	      let lastLiters = fuelSeries.find(f => f.liters > 0)?.liters ?? null;

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

	          // A. FUEL (anchor-based logic: accumulates split refills and keeps real second fills)
	          const currentLiters = fuelSeries[i].liters;

	          if (currentLiters > 0) {
	              if (lastLiters !== null) {
	                  const diff = currentLiters - lastLiters;
	                  if (diff < 0 && Math.abs(diff) < 80) {
	                      consumedLiters += Math.abs(diff);
	                  }
	              }

	              lastLiters = currentLiters;
	          }

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

    // ── Step 3: update metadata in localStorage (BC handler may have already set it) ──
    // Use any fresh meta that exists, or create minimal one
    const _existingFresh = _existingMeta && Date.now()-(_existingMeta.ts||0) < 30000;
    if (_existingFresh) {
      // Merge: keep exitTime/zoneName from handler, update times if provided
      try {
        _existingMeta.startISO = resolvedStart || _existingMeta.startISO;
        _existingMeta.endISO   = resolvedEnd   || _existingMeta.endISO;
        localStorage.setItem('fleet_gps_verify_meta', JSON.stringify(_existingMeta));
      } catch(_) {}
    } else {
      try {
        localStorage.setItem('fleet_gps_verify_meta', JSON.stringify({
          truckName: name || String(imei),
          imei:      String(imei),
          zoneName:  '',
          exitTime:  null,
          startISO:  resolvedStart,
          endISO:    resolvedEnd,
          ts:        Date.now()
        }));
      } catch(_) {}
    }

    // ── Step 4: build the time range (never show a modal) ──
    let start, end;
    if (resolvedStart && resolvedEnd) {
      // Exact window from zone event — convert UTC ISO → local time string
      // (API expects local time, ISO strings are UTC — Algeria = UTC+1)
      const fmtLocal = (iso) => {
        const d = new Date(iso);
        const offsetMs = d.getTimezoneOffset() * 60000; // negative for UTC+1
        const local = new Date(d.getTime() - offsetMs);
        return local.toISOString().slice(0, 16).replace('T', ' ') + ':00';
      };
      start = fmtLocal(resolvedStart);
      end   = fmtLocal(resolvedEnd);
    } else {
      // Default: today 00:00 → now
      const pad = (n) => String(n).padStart(2, '0');
      const now  = new Date();
      const base = prefillDate ? new Date(prefillDate) : now;
      start = `${base.getFullYear()}-${pad(base.getMonth()+1)}-${pad(base.getDate())} 00:00:00`;
      end   = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:00`;
      // (meta will be built in step 5 from _storedMeta or defaults)
    }

    // ── Step 5: set in-memory recap metadata then go straight to visual history ──
    // Priority: 1) Already set by window.opener (most fresh, direct injection)
    //           2) From fleet_gps_verify_meta (set by BC handler)
    //           3) Fallback with no exitTime
    const _alreadySet = window._histRecapMeta && window._histRecapMeta.imei === String(imei);
    if (!_alreadySet) {
      const _storedMeta = (() => { try { return JSON.parse(localStorage.getItem('fleet_gps_verify_meta') || 'null'); } catch(_) { return null; } })();
      const _metaFresh = _storedMeta && Date.now()-(_storedMeta.ts||0) < 30000;
      window._histRecapMeta = {
        truckName: name || (_metaFresh && _storedMeta.truckName) || String(imei),
        imei:      String(imei),
        zoneName:  _metaFresh ? (_storedMeta.zoneName || '') : '',
        exitTime:  _metaFresh ? (_storedMeta.exitTime || null) : null,
        startISO:  resolvedStart,
        endISO:    resolvedEnd || null
      };
    }
    this.loadVisualHistory(imei, start, end);
  }

  // --- SUBMIT ACTION ---
  submitHistory(imei) {
      const start = document.getElementById('histStart').value;
      const end = document.getElementById('histEnd').value;
      
      if(!start || !end) { alert("Veuillez remplir les dates."); return; }
      
      // Convert to API format (YYYY-MM-DD HH:mm:ss)
      const fmt = (iso) => iso.replace('T', ' ') + ':00';
      
      this.loadVisualHistory(imei, fmt(start), fmt(end));
      document.getElementById('historyModal').remove();
  }

// --- UPDATED LOADING LOGIC (Stats + Date + Counters) ---
  async loadVisualHistory(imei, start, end) {
      // 1. Force Switch to Map Tab
      if(this.zoneGroupingMode !== 'map') {
          this.setZoneGrouping('map');
          const mapTabBtn = document.querySelector('[data-tab="byWilaya"]');
          if(mapTabBtn) mapTabBtn.click();
      }
      
      const btn = document.getElementById('btnGroupMap');
      const originalText = btn ? btn.innerHTML : 'Carte';
      if(btn) btn.innerHTML = '<i class="fa-solid fa-satellite-dish fa-spin"></i> Chargement...';

      try {
          // 2. Fetch History Data
          const res = await fetch(`${FLEET_CONFIG.API.baseUrl}/api/history?imei=${imei}&start=${start}&end=${end}`);
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
              return;
          }

          // 3. Normalize & Sort Data
          let points = rawPoints.map(p => {
              if (Array.isArray(p)) {
                  return { 
                      time: new Date(p[0]).getTime(),
                      lat: parseFloat(p[1]), 
                      lng: parseFloat(p[2]), 
                      speed: parseInt(p[5]), 
                      params: p[6] || {} 
                  };
              }
              return p;
          }).sort((a,b) => a.time - b.time);

          // 3.5 Exact Window Filtering (Trim the extra pre-point returned by GPS API)
          if (window._histRecapMeta && window._histRecapMeta.startISO) {
              const exactStartMs = new Date(window._histRecapMeta.startISO).getTime();
              // Add a small 1-minute buffer to ensure we don't trim the first valid entry point
              // The runaway lines in the UI were caused by points from 30+ mins earlier
              points = points.filter(p => p.time >= (exactStartMs - 60000));
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
                  dedupeMinutes: 5,
                  dedupeLitersTolerance: 10,
                  baselineDropToleranceLiters: 15,
                  stopSpeedThreshold: 4
              })
              : [];
          const refills = historyRefills.map((evt) => ({
              lat: evt.lat,
              lng: evt.lng,
              volume: String(evt.addedLiters || 0),
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
                const _exitValid = _rawExit && _rawExit !== 'null' && _rawExit !== '';
                const _entryDate = (_meta && _meta.startISO) ? new Date(_meta.startISO) : (points[0] ? new Date(points[0].time) : null);
                const _exitDate  = _exitValid ? new Date(_rawExit) : null;
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
                      width:min(480px,90vw);
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
                  <div class="hs-header">
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
                    <div class="hs-footer">
                      <button class="hs-btn" onclick="if(window.AlgeriaMap)window.AlgeriaMap.clearHistory();document.getElementById('histSidebar')?.remove();document.getElementById('histSidebarStyles')?.remove();">
                        <i class="fa-solid fa-xmark"></i> Fermer &amp; Restaurer la carte
                      </button>
                      <div class="hs-cd">
                        <div class="hs-cd-val" id="hsFixerCd">--:--</div>
                        <div class="hs-cd-lbl">🔧 Prochain Fix</div>
                      </div>
                    </div>
                    <div style="text-align:center;margin-top:8px;font-size:9px;color:#1e293b;">🛰️ ${points.length} points GPS analysés</div>
                  </div>
                `;

                const _mw = document.getElementById('map-wrapper');
                if (_mw) { _mw.style.position = 'relative'; _mw.appendChild(_panel); }

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
                    if (rem <= 0) { el.textContent = '🔄 Fix...'; return; }
                    const m = Math.floor(rem / 60000);
                    const s = Math.floor((rem % 60000) / 1000);
                    el.textContent = String(m).padStart(2,'0') + ':' + String(s).padStart(2,'0');
                  };
                  const _base = typeof FLEET_CONFIG !== 'undefined' ? FLEET_CONFIG.API.baseUrl : '';
                  fetch(_base + '/api/fixer-status')
                    .then(r => r.json())
                    .then(d => {
                      _nextMs = d.nextRunAt || (Date.now() + 30 * 60 * 1000);
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
  
  // --- SUPER EXPORT FUNCTION ---
  async generateSuperReportCSV() {
      if(!app || !app.trucks) return;

      // \u26a0\ufe0f AUTO-FETCH: Download Decouchage data if it's not loaded yet
      if (!this.allDecouchageLogs || this.allDecouchageLogs.length === 0) {
          try {
              // Update button text to show activity
              const btn = document.querySelector('button[onclick="ui.generateSuperReportCSV()"]');
              const originalText = btn ? btn.innerHTML : '';
              if(btn) btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Chargement Données...';
              
              const res = await fetch(`${FLEET_CONFIG.API.baseUrl}/api/decouchages`);
              if (res.ok) this.allDecouchageLogs = await res.json();
              
              // Restore button
              if(btn) btn.innerHTML = originalText;
          } catch(e) { console.warn("Report Fetch Error", e); }
      }
      
      const trucks = app.getAllTrucks();
      const now = new Date().toLocaleString();
      
let csv = `RAPPORT GLOBAL DE FLOTTE - ${now}\n\n`;
      
      // SECTION 1: FLOTTE ACTUELLE
      csv += "ETAT ACTUEL DES CAMIONS\n";      csv += "Camion,Statut,Carburant (L),Carburant (%),Capacité,Vidange Dans (km),Odomètre,Lieu Actuel,GPS Status\n";
      
      trucks.forEach(t => {
          const status = t.isGpsCut ? "COUPURE GPS" : (t.speed > 0 ? "En Route" : "À l'arrêt");
          const vidangeRestant = t.vidange ? t.vidange.kmUntilNext : 'N/A';
          const gpsQuality = t.isGpsCut ? "OFFLINE" : "ONLINE";
          const loc = t.location ? (t.location.formatted || `${t.location.city}, ${t.location.wilaya}`) : "Inconnu";
          
          csv += `"${t.name}","${status}",${t.fuelLiters},${t.fuelPercentage}%,${t.fuelTankCapacity},${vidangeRestant},${t.odometer},"${loc}","${gpsQuality}"\n`;
      });

      // SECTION 2: RÉCAPITULATIF REMPLISSAGES (Using loaded logs)
      if(this.allRefuelLogs && this.allRefuelLogs.length > 0) {
          csv += "\n\nHISTORIQUE REMPLISSAGES (CHARGÉS)\n";
          csv += "Date,Camion,Ajouté (L),Nouveau Niveau,Lieu\n";
          this.allRefuelLogs.slice(0, 100).forEach(log => {
             // Re-resolve location name logic briefly for CSV
             let locName = log.locationRaw || `${log.lat},${log.lng}`;
             const cached = geocodeService.checkCacheInstant(log.lat, log.lng);
             if(cached) locName = `${cached.city}, ${cached.wilaya}`;
             
             csv += `"${new Date(log.timestamp).toLocaleString()}","${log.truckName}",${log.addedLiters},${log.newLevel},"${locName}"\n`;
          });
      }

      // SECTION 3: MAINTENANCE ACTIVE
      if(this.allMaintenanceLogs) {
          csv += "\n\nMAINTENANCE EN COURS\n";
          csv += "Camion,Type,Date Entrée,Lieu\n";
          this.allMaintenanceLogs.filter(m => !m.exitDate).forEach(m => {
              csv += `"${m.truckName}","${m.type}","${new Date(m.date).toLocaleString()}","${m.location}"\n`;
          });
      }

      const blob = new Blob(["\uFEFF" + csv], { type: 'text/csv;charset=utf-8;' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `SUPER_RAPPORT_${new Date().toISOString().slice(0,10)}.csv`;
      a.click();
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
  // --- SUPER EXPORT FUNCTION ---
  async generateSuperReportCSV() {
      if(!app || !app.trucks) return;

      // \u26a0\ufe0f AUTO-FETCH: Download Decouchage data if it's not loaded yet
      if (!this.allDecouchageLogs || this.allDecouchageLogs.length === 0) {
          try {
              // Update button text to show activity
              const btn = document.querySelector('button[onclick="ui.generateSuperReportCSV()"]');
              const originalText = btn ? btn.innerHTML : '';
              if(btn) btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Chargement Données...';
              
              const res = await fetch(`${FLEET_CONFIG.API.baseUrl}/api/decouchages`);
              if (res.ok) this.allDecouchageLogs = await res.json();
              
              // Restore button
              if(btn) btn.innerHTML = originalText;
          } catch(e) { console.warn("Report Fetch Error", e); }
      }
      
      const trucks = app.getAllTrucks();
      const now = new Date().toLocaleString();
      
let csv = `RAPPORT GLOBAL DE FLOTTE - ${now}\n\n`;
      
      // SECTION 1: FLOTTE ACTUELLE
      csv += "ETAT ACTUEL DES CAMIONS\n";      csv += "Camion,Statut,Carburant (L),Carburant (%),Capacité,Vidange Dans (km),Odomètre,Lieu Actuel,GPS Status\n";
      
      trucks.forEach(t => {
          const status = t.isGpsCut ? "COUPURE GPS" : (t.speed > 0 ? "En Route" : "À l'arrêt");
          const vidangeRestant = t.vidange ? t.vidange.kmUntilNext : 'N/A';
          const gpsQuality = t.isGpsCut ? "OFFLINE" : "ONLINE";
          const loc = t.location ? (t.location.formatted || `${t.location.city}, ${t.location.wilaya}`) : "Inconnu";
          
          csv += `"${t.name}","${status}",${t.fuelLiters},${t.fuelPercentage}%,${t.fuelTankCapacity},${vidangeRestant},${t.odometer},"${loc}","${gpsQuality}"\n`;
      });

      // SECTION 2: RÉCAPITULATIF REMPLISSAGES (Using loaded logs)
      if(this.allRefuelLogs && this.allRefuelLogs.length > 0) {
          csv += "\n\nHISTORIQUE REMPLISSAGES (CHARGÉS)\n";
          csv += "Date,Camion,Ajouté (L),Nouveau Niveau,Lieu\n";
          this.allRefuelLogs.slice(0, 100).forEach(log => {
             // Re-resolve location name logic briefly for CSV
             let locName = log.locationRaw || `${log.lat},${log.lng}`;
             const cached = geocodeService.checkCacheInstant(log.lat, log.lng);
             if(cached) locName = `${cached.city}, ${cached.wilaya}`;
             
             csv += `"${new Date(log.timestamp).toLocaleString()}","${log.truckName}",${log.addedLiters},${log.newLevel},"${locName}"\n`;
          });
      }

      // SECTION 3: MAINTENANCE ACTIVE
      if(this.allMaintenanceLogs) {
          csv += "\n\nMAINTENANCE EN COURS\n";
          csv += "Camion,Type,Date Entrée,Lieu\n";
          this.allMaintenanceLogs.filter(m => !m.exitDate).forEach(m => {
              csv += `"${m.truckName}","${m.type}","${new Date(m.date).toLocaleString()}","${m.location}"\n`;
          });
      }

      const blob = new Blob(["\uFEFF" + csv], { type: 'text/csv;charset=utf-8;' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `SUPER_RAPPORT_${new Date().toISOString().slice(0,10)}.csv`;
      a.click();
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

  exportAlertsCSV() {
    const trucks = app.getAllTrucks();
    const speedLimit = this.getSpeedLimit();
    const violators = trucks.filter(t => t.speed > speedLimit);
    
    if (violators.length === 0) { alert('Aucune alerte à exporter.'); return; }

    let csv = "Camion,Vitesse (km/h),Excès (+km/h),Position,Odomètre\n";
    violators.forEach(t => {
      const loc = t.location?.city ? `${t.location.city} ${t.location.wilaya || ''}` : 'Inconnue';
      csv += `"${t.name}",${t.speed},+${t.speed - speedLimit},"${loc}",${t.odometer}\n`;
    });

    const blob = new Blob(["\uFEFF" + csv], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `alertes_vitesse_${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
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
  }

  async saveTruckMetaFromSettings() {
    const select = document.getElementById('settingsTruckSelect');
    const deviceId = select?.value;
    if (!deviceId) { alert('Sélectionnez un camion.'); return; }
    const payload = {
      deviceId,
      chassisNumber: document.getElementById('settingsChassisNumber').value.trim(),
      immatriculation: document.getElementById('settingsImmatriculation').value.trim(),
      carteNaftal: document.getElementById('settingsCarteNaftal').value.trim()
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
    const entries = this.truckDbCache.filter(d => d.chassisNumber || d.immatriculation || d.carteNaftal);
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
    </tr></thead><tbody>`;
    entries.forEach((d, i) => {
      const bg = i % 2 === 0 ? 'var(--bg-surface)' : 'var(--bg-elevated)';
      html += `<tr style="background:${bg};border-bottom:1px solid var(--border);transition:background 0.15s;" onmouseover="this.style.background='var(--bg-card-hover,rgba(56,189,248,0.05))'" onmouseout="this.style.background='${bg}'">
        <td style="padding:10px 12px;font-weight:700;color:var(--text-primary);">${d.truckName || d.deviceId}</td>
        <td style="padding:10px 12px;text-align:center;">${d.immatriculation ? `<span class="truck-meta-tag imm">${d.immatriculation}</span>` : '<em style="color:var(--text-dim);">—</em>'}</td>
        <td style="padding:10px 12px;text-align:center;">${d.chassisNumber ? `<span class="truck-meta-tag chassis">${d.chassisNumber}</span>` : '<em style="color:var(--text-dim);">—</em>'}</td>
        <td style="padding:10px 12px;text-align:center;">${d.carteNaftal ? `<span class="truck-meta-tag naftal">${d.carteNaftal}</span>` : '<em style="color:var(--text-dim);">—</em>'}</td>
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

  exportNaftalReportCSV() {
    const naftalPrice = this.naftalPricePerLiter || 31;
    if (!this.naftalReportLogs || this.naftalReportLogs.length === 0) {
      alert('Générez d\'abord le rapport.');
      return;
    }
    // Header
    let csv = 'RAPPORT NAFTAL — Cartes Naftal Enregistrées\n';
    csv += `Généré le: ${new Date().toLocaleString('fr-FR')}\n`;
    csv += `Prix Naftal: ${naftalPrice} DA/L\n\n`;
    csv += 'Carte Naftal,Camion,Date,Heure,Litres,Coût (DA),Cumul Litres,Cumul DA\n';
    this.naftalReportLogs.forEach(card => {
      let cumL = 0, cumDA = 0;
      const cardLabel = card.cardNum === '__no_card__' ? 'Sans Carte Naftal' : `N° ${card.cardNum}`;
      card.events.forEach(e => {
        cumL += e.liters;
        cumDA += Math.round(e.liters * naftalPrice);
        const dt = new Date(e.date);
        csv += `"${cardLabel}","${e.truckName}","${dt.toLocaleDateString('fr-FR')}","${dt.toLocaleTimeString('fr-FR')}",${e.liters},${Math.round(e.liters * naftalPrice)},${cumL},${cumDA}\n`;
      });
      // Card subtotal row
      const totalL = card.events.reduce((s, e) => s + e.liters, 0);
      const totalDA = Math.round(totalL * naftalPrice);
      csv += `"=== TOTAL ${cardLabel}","${card.truckName}","","",${totalL},${totalDA},"",""\n\n`;
    });
    // Grand total
    const grandL = this.naftalReportLogs.reduce((s, c) => s + c.events.reduce((ss, e) => ss + e.liters, 0), 0);
    const grandDA = Math.round(grandL * naftalPrice);
    csv += `"=== TOTAL GÉNÉRAL","","","",${grandL},${grandDA},"",""\n`;
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `RAPPORT_NAFTAL_${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
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

    dropdown.innerHTML = all.map((item, i) => `
      <div onclick="ui._itinSelectPlace(${JSON.stringify(item.coords).replace(/"/g,"'")}, '${item.name.replace(/'/g,"\\'")}', '${dropdownId}', '${coordId}')"
        style="padding:10px 14px; cursor:pointer; border-bottom:1px solid #f1f5f9; font-size:12px; font-weight:600; display:flex; align-items:center; gap:8px; transition:background 0.15s;"
        onmouseover="this.style.background='#fdf4ff'" onmouseout="this.style.background='#fff'">
        <i class="fa-solid ${item.type==='custom' ? 'fa-map-pin' : 'fa-location-dot'}" style="color:#7e22ce; font-size:12px; width:14px;"></i>
        <span>${item.name}</span>
      </div>`).join('');
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

  applyMaintenanceHistoryFilters() {
    // Reads from BOTH the original HTML filter controls AND the dynamic ones
    const truckF   = (document.getElementById('maintTruckSearch')?.value || '').toLowerCase().trim();
    const typeF    = document.getElementById('maintTypeFilter')?.value || '';
    const prioF    = document.getElementById('maintHistoryPrioFilter')?.value || '';
    const dateStart = document.getElementById('maintDateStart')?.value ||
                      document.getElementById('maintHistoryDateStart')?.value || '';
    const dateEnd   = document.getElementById('maintDateEnd')?.value ||
                      document.getElementById('maintHistoryDateEnd')?.value || '';

    let filtered = [...(this.allMaintenanceLogs || [])];
    if (truckF)    filtered = filtered.filter(l => (l.truckName || '').toLowerCase().includes(truckF));
    if (typeF && typeF !== 'all') filtered = filtered.filter(l => l.type === typeF);
    if (prioF)     filtered = filtered.filter(l => l.priority === prioF);
    if (dateStart) filtered = filtered.filter(l => new Date(l.date || l.createdAt) >= new Date(dateStart));
    if (dateEnd)   filtered = filtered.filter(l => new Date(l.date || l.createdAt) <= new Date(dateEnd + 'T23:59:59'));

    const listEl = document.getElementById('maintenanceHistoryList');
    if (!listEl) return;
    listEl.innerHTML = this._renderMaintenanceRows(filtered);
  }

exportMaintenanceCSV() {
      if(!this.allMaintenanceLogs || this.allMaintenanceLogs.length === 0) { alert("Rien à exporter."); return; }
      
      let csv = "Date,Type,Camion,Compteur (km),Lieu,Note,Auto\n";
      this.allMaintenanceLogs.forEach(item => {
          csv += `"${new Date(item.date).toLocaleString()}","${item.type}","${item.truckName}",${item.odometer},"${item.location}","${item.note || ''}","${item.isAuto ? 'Oui' : 'Non'}"\n`;
      });
      
      const blob = new Blob(["\uFEFF" + csv], { type: 'text/csv;charset=utf-8;' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `maintenance_export_${new Date().toISOString().slice(0,10)}.csv`;
      a.click();
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
    this.renderActiveOrdersDashboard();
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

    this.maintTruckInfoPanel.style.display = 'block';
    this.maintTruckInfoPanel.innerHTML = `
      <div class="truck-info-panel">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
          <h3 style="margin:0; color:#f59e0b;"><i class="fa-solid fa-truck"></i> ${truck.name}</h3>
          <div style="display:flex; gap:6px;">
            <button class="btn-primary" onclick="ui.openNewMaintenanceOrder('${truckId}')" style="background:#f59e0b; border:none; font-size:12px; padding:6px 12px;">
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
  }

  async saveTruckMetadata() {
    if (!this.selectedMaintTruckId) { alert('Sélectionnez d\'abord un camion.'); return; }
    const truck = app.trucks.get(this.selectedMaintTruckId);
    const payload = {
      deviceId: this.selectedMaintTruckId,
      truckName: truck ? truck.name : this.maintTruckSearchInput?.value || '',
      chassisNumber: document.getElementById('editChassisNumber').value.trim(),
      immatriculation: document.getElementById('editImmatriculation').value.trim(),
      carteNaftal: document.getElementById('editCarteNaftal').value.trim()
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

  renderActiveOrdersDashboard() {
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
            <button onclick="ui.cancelMaintenanceOrder('${order.id}')" class="btn-secondary" style="font-size:11px; padding:4px 10px; border-color:#fecaca; color:#dc2626;">
              <i class="fa-solid fa-ban"></i> Annuler
            </button>
            <button onclick="ui.editMaintenance('${order.id}')" class="btn-secondary" style="font-size:11px; padding:4px 10px;">
              <i class="fa-solid fa-pen"></i> Modifier
            </button>
            <button onclick="ui.closeMaintenanceOrderUI('${order.id}')" class="btn-primary" style="font-size:11px; padding:4px 10px; background:#22c55e; border:none;">
              <i class="fa-solid fa-check"></i> Terminer
            </button>
          </div>
        </div>`;
    });
    this.activeOrdersDashboard.innerHTML = html;
  }

  async closeMaintenanceOrderUI(id) {
    if (!confirm('Marquer cet ordre comme TERMINÉ ?')) return;
    try {
      const res = await fetch(`${FLEET_CONFIG.API.baseUrl}/api/maintenance/close`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id })
      });
      if (res.ok) {
        alert('\u2705 Ordre clôturé !');
        this.refreshMaintenanceFollowup();
        this.fetchAndRenderMaintenance();
      } else { alert('Erreur serveur.'); }
    } catch (e) { alert('Erreur connexion.'); }
  }

  async cancelMaintenanceOrder(id) {
    if (!confirm('\u26a0\ufe0f ANNULER cet ordre de maintenance ?\n\nCette action est irréversible. L\'ordre sera marqué comme annulé.')) return;
    try {
      const res = await fetch(`${FLEET_CONFIG.API.baseUrl}/api/maintenance/${id}/cancel`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }
      });
      if (res.ok) {
        alert('\u2705 Ordre annulé avec succès.');
        this.refreshMaintenanceFollowup();
        this.fetchAndRenderMaintenance();
      } else { alert('Erreur serveur.'); }
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
        // Try DB trucks first (full metadata: odometer, deviceId, name)
        const r = await fetch(`${FLEET_CONFIG.API.baseUrl}/api/trucks/db`, {
          headers: { 'x-access-code': localStorage.getItem('fleetAccessCode') || '' }
        });
        if (r.ok) {
          const dbTrucks = await r.json();
          const list = Array.isArray(dbTrucks) ? dbTrucks : Object.values(dbTrucks);
          list.sort((a, b) => (a.truckName || a.name || '').localeCompare(b.truckName || b.name || ''));
          list.forEach(t => {
            const name = t.truckName || t.name || t.deviceId;
            const odo  = t.odometer || t.lastOdometer || 0;
            const did  = t.deviceId || t.id || '';
            const opt  = document.createElement('option');
            opt.value        = name;
            opt.textContent  = name;
            opt.dataset.id   = did;
            opt.dataset.odo  = odo;
            truckSelect.appendChild(opt);
          });
        }
      } catch(e) {
        // Fallback: live GPS trucks already in memory
        const liveTrucks = (window.app && typeof window.app.getAllTrucks === 'function')
          ? window.app.getAllTrucks() : [];
        liveTrucks.forEach(t => {
          const opt = document.createElement('option');
          opt.value       = t.name;
          opt.textContent = t.name;
          opt.dataset.id  = t.id || '';
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

    // ── 5. Pre-select truck if one was provided ───────────────────
    if (truckId && truckSelect) {
      // Wait one tick for options to be rendered
      setTimeout(() => {
        const opt = Array.from(truckSelect.options).find(o =>
          String(o.dataset.id) === String(truckId) || o.value === truckId
        );
        if (opt) {
          truckSelect.value = opt.value;
          const odoEl = document.getElementById('modalMaintOdo');
          if (odoEl && opt.dataset.odo) odoEl.value = opt.dataset.odo;
          truckSelect.dispatchEvent(new Event('change'));
        }
      }, 50);
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

  openRefModal(deviceId) {
    this._refModalDeviceId = deviceId;
    const truck = app.getAllTrucks().find(t => t.id === deviceId);
    const db = (this.truckDbCache || []).find(d => d.deviceId === deviceId);
    const name = truck?.name || db?.truckName || deviceId;
    document.getElementById('refModalTruckName').innerHTML = '<i class="fa-solid fa-truck" style="margin-right:6px; color:var(--primary);"></i> ' + name;
    document.getElementById('refModalTitle').textContent = 'Documents — ' + name;
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('refIssueDate').value = today;
    const nextYear = new Date();
    nextYear.setFullYear(nextYear.getFullYear() + 1);
    document.getElementById('refExpiryDate').value = nextYear.toISOString().split('T')[0];
    this._renderRefList(deviceId);
    document.getElementById('vehicleRefModal').classList.add('show');
  }

  closeRefModal() {
    document.getElementById('vehicleRefModal').classList.remove('show');
    this._refModalDeviceId = null;
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
      const expiry = new Date(ref.expiryDate);
      const daysLeft = Math.ceil((expiry - now) / (1000 * 60 * 60 * 24));
      let countdownCls, countdownText;
      if (daysLeft < 0) { countdownCls = 'expired'; countdownText = 'EXPIRÉ (' + Math.abs(daysLeft) + 'j)'; }
      else if (daysLeft <= 30) { countdownCls = 'danger'; countdownText = daysLeft + ' jours'; }
      else if (daysLeft <= 60) { countdownCls = 'warn'; countdownText = daysLeft + ' jours'; }
      else { countdownCls = 'ok'; countdownText = daysLeft + ' jours'; }
      const issueDate = ref.issueDate ? new Date(ref.issueDate).toLocaleDateString('fr-FR') : '—';
      const expiryDate = expiry.toLocaleDateString('fr-FR');
      html += '<div class="ref-list-item"><div class="ref-info"><div class="ref-name">' + ref.refName + '</div><div class="ref-details">N°: ' + (ref.refNumber || '—') + ' &nbsp;|&nbsp; Obtenu: ' + issueDate + ' &nbsp;|&nbsp; Expire: ' + expiryDate + (ref.notes ? ' &nbsp;|&nbsp; ' + ref.notes : '') + '</div></div><span class="ref-countdown ' + countdownCls + '">' + countdownText + '</span><div class="ref-actions"><button class="btn-del" onclick="ui.deleteReference(\'' + ref._id + '\')" title="Supprimer"><i class="fa-solid fa-trash"></i></button></div></div>';
    });
    listEl.innerHTML = html;
  }

  async saveReference() {
    const deviceId = this._refModalDeviceId;
    if (!deviceId) { alert('Aucun véhicule sélectionné.'); return; }
    const truck = app.getAllTrucks().find(t => t.id === deviceId);
    const db = (this.truckDbCache || []).find(d => d.deviceId === deviceId);
    const truckName = truck?.name || db?.truckName || deviceId;
    const refName = document.getElementById('refType')?.value;
    const refNumber = document.getElementById('refNumber')?.value || '';
    const issueDate = document.getElementById('refIssueDate')?.value;
    const expiryDate = document.getElementById('refExpiryDate')?.value;
    const notes = document.getElementById('refNotes')?.value || '';
    const alertThreshold = parseInt(document.getElementById('refAlertThreshold')?.value, 10) || 30;
    if (!refName || !expiryDate) { alert("Type et date d'expiration sont requis."); return; }
    try {
      const res = await fetch(`${FLEET_CONFIG.API.baseUrl}/api/vehicle-references`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceId, truckName, refName, refNumber, issueDate, expiryDate, notes, reminderDays: alertThreshold })
      });
      if (res.ok) {
        await this.loadVehicleReferences();
        this._renderRefList(deviceId);
        this.renderTrucks();
        document.getElementById('refNumber').value = '';
        document.getElementById('refNotes').value = '';
        if (window.showToast) showToast('\u2705 Document enregistré !', 'success');
        else alert('\u2705 Document enregistré !');
      } else { alert('Erreur serveur.'); }
    } catch (e) { alert('Erreur connexion: ' + e.message); }
  }

  async deleteReference(id) {
    if (!confirm('Supprimer ce document ?')) return;
    try {
      await fetch(`${FLEET_CONFIG.API.baseUrl}/api/vehicle-references/${id}`, { method: 'DELETE' });
      await this.loadVehicleReferences();
      if (this._refModalDeviceId) this._renderRefList(this._refModalDeviceId);
      this.renderTrucks();
    } catch (e) { alert('Erreur: ' + e.message); }
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
      '<div style="display:flex;gap:8px;"><button onclick="ui._cancelMapPicker(true)" style="flex:1;background:var(--bg-elevated,rgba(255,255,255,0.06));border:1px solid var(--border,var(--border, rgba(255,255,255,0.1)));color:var(--text-secondary,var(--text-muted, #94a3b8));border-radius:9px;padding:11px;font-weight:700;cursor:pointer;font-size:13px;">&#8634; R&eacute;init.</button>' +
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

    if (entryData && entryData._id) {
      // ── EDIT mode: populate trucks first, then fill fields ──────
      this._editingMaintenanceId = entryData._id;
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
      });
    } else {
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

  // ── Edit / Delete maintenance entry from history table ───────
  async openEditMaintenanceModal(id) {
    if (!id) return;
    try {
      // Find in cached logs first, fall back to a fresh fetch
      let entry = (this.allMaintenanceLogs || []).find(l => String(l._id || l.id) === String(id));
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

  async deleteMaintenanceEntry(id) {
    if (!id) return;
    if (!confirm('Supprimer cet enregistrement de maintenance ? Cette action est irréversible.')) return;
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
      if (typeof this.syncSettings === 'function') {
         await this.syncSettings();
      }
      if (typeof app !== 'undefined' && typeof app.forceRecalculateVidanges === 'function') {
         app.forceRecalculateVidanges();
      }
      if (typeof this.renderVidangeSection === 'function') {
         this.renderVidangeSection();
      }
    } catch(e) { alert('Erreur suppression: ' + e.message); }
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

  exportCSV() {
    const trucks = (app && typeof app.getAllTrucks === 'function') ? app.getAllTrucks() : [];
    if (!trucks.length) { alert('Aucune donnée camion disponible.'); return; }
    let csv = 'Camion,IMEI,Vitesse (km/h),Carburant (L),Latitude,Longitude,Mise à jour\n';
    trucks.forEach(t => {
      csv += [`"${t.name}"`, `"${t.id}"`, t.speed||0, t.fuelLevel||0, t.lat||0, t.lng||0,
        `"${new Date(t.lastUpdate||Date.now()).toLocaleString('fr-FR')}"`].join(',') + '\n';
    });
    const blob = new Blob(['\uFEFF' + csv], {type:'text/csv;charset=utf-8;'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href=url;
    a.download = `fleet_${new Date().toISOString().slice(0,10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
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


