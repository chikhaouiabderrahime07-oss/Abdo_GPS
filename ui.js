/**
 * 🔒 GATEKEEPER INTERCEPTOR (Fixed for Mapbox)
 * Automatically injects the Access Code into every API request.
 * Handles both String URLs and Request Objects to prevent Mapbox crashes.
 */
const originalFetch = window.fetch;

window.fetch = async function(url, options) {
    // 1. Handle URL input (Mapbox sends Objects, not always strings)
    let urlString = url;
    if (typeof url !== 'string' && url.url) {
        urlString = url.url;
    }

    // 2. Retrieve Code
    const code = localStorage.getItem('fleetAccessCode');
    
    // 3. Inject Header ONLY for our API (Safe check)
    if (urlString && typeof urlString === 'string' && urlString.includes('/api/')) {
        if (!options) options = {};
        if (!options.headers) options.headers = {};
        if (code) options.headers['x-access-code'] = code;
    }

    // 4. Perform Request
    try {
        const response = await originalFetch(url, options);

        // 5. CHECK FOR REJECTION (401/403)
        // Only react if the rejection comes from OUR server, not external APIs
        if ((response.status === 401 || response.status === 403) && urlString && urlString.includes('/api/')) {
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

    // ✅ Settings sync timestamp (used to refresh vidange overrides periodically)
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
      
      console.log('✅ UI Controller Ready (Rule-Based System)');
      window.ui = this;

      if (FLEET_CONFIG.AUTO_START) {
        this.autoStartTracking();
      }
      // NEW: Decouchage Defaults
      if(this.decouchageDateStart) this.decouchageDateStart.value = today;
      if(this.decouchageDateEnd) this.decouchageDateEnd.value = today;
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

      /* ✅ Quick Vidange Button */
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

    // ✅ NEW: Maintenance Follow-up elements
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
    this.addCustomLocBtn = document.getElementById('addCustomLocBtn');
    this.customLocationsList = document.getElementById('customLocationsList');

    // RULE SYSTEM
    this.rulesListContainer = document.getElementById('rulesListContainer');
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
          const res = await fetch(`${FLEET_CONFIG.API.baseUrl}/api/settings`);
          if (!res.ok) throw new Error('Failed to fetch settings');
          const data = await res.json();
          
          if (data.defaultConfig) FLEET_CONFIG.DEFAULT_TRUCK_CONFIG = data.defaultConfig;
          
          // MAP CLOUD RULES TO LOCAL CONFIG
          if (data.fleetRules) FLEET_CONFIG.FLEET_RULES = data.fleetRules;
          else FLEET_CONFIG.FLEET_RULES = []; // Init empty if new

          if (data.customLocations) FLEET_CONFIG.CUSTOM_LOCATIONS = data.customLocations;
          if (data.pollInterval) FLEET_CONFIG.UI.pollInterval = data.pollInterval;
          if (data.apiKeys) FLEET_CONFIG.GEOAPIFY_API_KEYS = data.apiKeys;
          if (data.maintenanceRules) FLEET_CONFIG.MAINTENANCE_RULES = data.maintenanceRules;

          if (data.vidangeOverrides) FLEET_CONFIG.VIDANGE_OVERRIDES = data.vidangeOverrides;
          else if (!FLEET_CONFIG.VIDANGE_OVERRIDES) FLEET_CONFIG.VIDANGE_OVERRIDES = {};

          // Speed limit + Naftal budget from cloud
          if (data.speedLimit) FLEET_CONFIG.SPEED_LIMIT = data.speedLimit;
          if (data.naftalBudget) FLEET_CONFIG.NAFTAL_BUDGET = data.naftalBudget;

          this.lastSettingsSync = Date.now();
          
          console.log("☁️ Settings synced from Cloud");
          this.loadGlobalSettingsToUI();
          this.renderCustomLocationsList();
          this.renderRulesList(); // RENDER RULES
          
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
          naftalBudget: FLEET_CONFIG.NAFTAL_BUDGET || 0
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
    this.defaultVidangeMilestones.value = FLEET_CONFIG.DEFAULT_TRUCK_CONFIG.vidangeMilestones;
    this.defaultVidangeAlert.value = FLEET_CONFIG.DEFAULT_TRUCK_CONFIG.vidangeAlertKm;

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
      this.decouchageHistoryContainer.innerHTML = '<div style="color:#666; text-align:center; padding:20px;"><i class="fa-solid fa-sync fa-spin"></i> Analyse précise des découchages...</div>';

      try {
          const trucks = (typeof app !== 'undefined' && typeof app.getAllTrucks === 'function') ? app.getAllTrucks() : [];
          if (!trucks.length) throw new Error('Trucks unavailable');

          const startNight = this.decouchageDateStart.value || new Date().toISOString().split('T')[0];
          const endNight = this.decouchageDateEnd.value || startNight;
          const truckFilter = (this.decouchageTruckSearch.value || '').toLowerCase().trim();

          const selectedTrucks = trucks.filter(t => !truckFilter || t.name.toLowerCase().includes(truckFilter));
          if (selectedTrucks.length === 0) {
              this.allDecouchageLogs = [];
              this.renderDecouchageList();
              return;
          }

          const fetchRange = this.getNightWindowFetchRange(startNight, endNight);
          this.allDecouchageLogs = await this.generateExactDecouchageDataset(
              selectedTrucks.map(t => t.id),
              fetchRange.start,
              fetchRange.end,
              ({ done, total, truckName }) => {
                  this.decouchageHistoryContainer.innerHTML = `<div style="color:#666; text-align:center; padding:20px;"><i class="fa-solid fa-moon fa-spin"></i> Analyse précise ${done}/${total}<br><span style="font-size:12px; color:#94a3b8;">${truckName}</span></div>`;
              }
          );
          this.renderDecouchageList();
      } catch (e) {
          console.warn('Decouchage exact fetch error:', e);
          this.decouchageHistoryContainer.innerHTML = `<div style="color:#888; text-align:center; padding:20px;">Connexion impossible.</div>`;
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
  viewOnMap(lat, lng) {
      if (!lat || !lng) {
          if (window.showToast) showToast('Position GPS indisponible pour ce véhicule.', 'warning');
          return;
      }
      // 1. Force Switch to Map Tab (using your 'byWilaya' ID for the map view)
      this.switchTab('byWilaya'); 

      // 2. Wait 300ms for the map to un-hide and render
      setTimeout(() => {
          if (window.AlgeriaMap && window.AlgeriaMap.map) {
              window.AlgeriaMap.map.resize(); // Fixes grey map bug
              window.AlgeriaMap.map.flyTo({
                  center: [lng, lat],
                  zoom: 16,
                  essential: true
              });
              
              // Optional: Add a temporary red marker to show the spot
              new mapboxgl.Marker({ color: 'red' })
                  .setLngLat([lng, lat])
                  .addTo(window.AlgeriaMap.map);
          } else {
              alert("⚠️ La carte n'est pas encore prête. Veuillez patienter.");
          }
      }, 300);
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
    let tableHtml = `<div style="max-height: 350px; overflow-y: auto; border: 1px solid #e2e8f0; border-radius: 8px;"><table style="width:100%; border-collapse:collapse; font-size:13px; background:white;"><thead style="position: sticky; top: 0; background: #f1f5f9; z-index: 1;"><tr style="color:#475569; text-align:left; border-bottom:2px solid #e2e8f0;"><th style="padding:12px 15px;">Camion</th><th style="padding:12px; text-align:center;">Nuits Dehors</th></tr></thead><tbody>`;
    summaryArray.forEach((item, index) => {
        const bg = index % 2 === 0 ? '#ffffff' : '#f8fafc';
        const countStyle = item.total > 0 ? 'color:#dc2626; font-weight:bold; background:#fef2f2; padding:2px 8px; border-radius:4px;' : 'color:#94a3b8;';
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
        html += `<div style="background:white; border:1px solid #e2e8f0; border-left: 5px solid #dc2626; padding:15px; border-radius:8px; display:flex; justify-content:space-between; align-items:center;"><div style="flex:1;"><div style="font-weight:bold; color:#1e293b;">${log.truckName}</div><div style="font-size:12px; color:#64748b;">Nuit du <strong>${dateStr}</strong> · Détecté à ${detectedTime}</div></div><div style="flex:2; text-align:center;"><div onclick="ui.viewOnMap(${log.locationAtMidnight?.lat || 0}, ${log.locationAtMidnight?.lng || 0})" style="font-size:12px; color:#1e40af; background:#eff6ff; padding:6px 12px; border-radius:6px; cursor:pointer; transition:all 0.2s;" onmouseover="this.style.background='#dbeafe'" onmouseout="this.style.background='#eff6ff'"><i class="fa-solid fa-map-pin"></i> ${resolvedName} <i class="fa-solid fa-arrow-up-right-from-square" style="font-size:10px; opacity:0.6; margin-left:4px;"></i></div><div style="font-size:11px; color:#64748b;">à ${distKm} km du site</div></div><div style="flex:0.5; text-align:right;"><span style="background:#fff7ed; color:#c2410c; padding:4px 10px; border-radius:20px; font-size:11px; font-weight:700; border:1px solid #fed7aa;">🌙 Hors Site</span></div></div>`;
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
                  <div style="font-size:12px; color:#64748b; margin-top:6px;">Chaque IO peut avoir sa propre capacité. Le système additionne ensuite les réservoirs.</div>
              </div>

              <div class="form-group" style="grid-column: 1 / -1;">
                  <label>Jalons Vidange (km) - Séparés par virgule</label>
                  <input type="text" id="ruleVidange" value="${data.config.vidangeMilestones || ''}">
              </div>

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
          vidangeMilestones: document.getElementById('ruleVidange').value.trim(),
          fuelPricePerLiter: FLEET_CONFIG.DEFAULT_TRUCK_CONFIG.fuelPricePerLiter, // Inherit Global Price
          fuelSecurityMargin: FLEET_CONFIG.DEFAULT_TRUCK_CONFIG.fuelSecurityMargin, // Inherit Global Margin
          vidangeAlertKm: FLEET_CONFIG.DEFAULT_TRUCK_CONFIG.vidangeAlertKm, // Inherit Global Alert
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
      alert("✅ Règle enregistrée !");
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
    FLEET_CONFIG.DEFAULT_TRUCK_CONFIG.vidangeMilestones = this.defaultVidangeMilestones.value;
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
    alert('✅ Configuration Globale sauvegardée !');
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
    alert('✅ Paramètres de connexion enregistrés !');
    if (app && app.isRunning) this.startTracking();
  }

  switchTab(tabName) {
    document.querySelectorAll('.tab-button').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    const btn = document.querySelector(`[data-tab="${tabName}"]`);
    if (btn) btn.classList.add('active');
    document.getElementById(tabName).classList.add('active');

if (tabName === 'byWilaya') {
        // Force Map Mode by default when clicking this tab
        if(this.zoneGroupingMode !== 'map') {
            this.setZoneGrouping('map'); 
        }
        
        // Refresh Map
        setTimeout(() => {
            if(window.AlgeriaMap && window.AlgeriaMap.map) {
                window.AlgeriaMap.map.resize();
                window.AlgeriaMap.updateMarkers(app.getAllTrucks());
            }
        }, 100);
    }
    if (tabName === 'fuelSection') this.renderFuelSection();
    if (tabName === 'vidangeSection') this.renderVidangeSection(); 
    if (tabName === 'maintenanceFollowup') this.refreshMaintenanceFollowup();
    if (tabName === 'maintenanceHistory') this.fetchAndRenderMaintenance(); 
    if (tabName === 'routing') this.populateRouteTruckList();
    if (tabName === 'alertsSection') this.refreshAlerts();
    if (tabName === 'settings') { 
        this.renderCustomLocationsList(); 
        this.renderRulesList();
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

      // ✅ Periodic settings refresh (keeps vidange overrides + rules synced without manual reload)
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
    pop.style.cssText = `position:fixed; top:${rect.bottom + 6}px; right:20px; z-index:9999; background:#1e293b; border:1px solid rgba(56,189,248,0.3); border-radius:12px; padding:8px; min-width:300px; box-shadow:0 12px 40px rgba(0,0,0,0.4); backdrop-filter:blur(10px);`;
    const header = `<div style="font-size:10px; color:#64748b; font-weight:700; padding:4px 8px; text-transform:uppercase; letter-spacing:1px;">${results.length} camion${results.length > 1 ? 's' : ''} trouvé${results.length > 1 ? 's' : ''} — Enter: Dashboard | Esc: Fermer</div>`;
    const rows = results.map(t => {
      const db = (this.truckDbCache || []).find(d => d.deviceId === t.id) || {};
      const speedBadge = t.speed >= 1
        ? `<span style="background:#dcfce7; color:#166534; font-size:9px; padding:2px 6px; border-radius:10px; font-weight:700;">⚡ ${t.speed}km/h</span>`
        : `<span style="background:#f1f5f9; color:#64748b; font-size:9px; padding:2px 6px; border-radius:10px;">STOP</span>`;
      const lat = t.position?.lat || t.lat || 0;
      const lng = t.position?.lng || t.lng || 0;
      return `<div style="padding:8px 10px; border-radius:8px; cursor:pointer; display:flex; justify-content:space-between; align-items:center; gap:8px; transition:background 0.15s;" onmouseover="this.style.background='rgba(56,189,248,0.1)'" onmouseout="this.style.background='transparent'">
        <div onclick="ui.switchTab('dashboard'); ui.updateDashboard();" style="flex:1;">
          <div style="font-weight:700; color:#f8fafc; font-size:13px;">${t.name}</div>
          <div style="font-size:10px; color:#94a3b8;">${t.location?.city || ''} ${db.carteNaftal ? '<span style=color:#c4b5fd;font-family:monospace;>' + db.carteNaftal + '</span>' : ''}</div>
        </div>
        <div style="display:flex; gap:6px; align-items:center;">
          ${speedBadge}
          ${lat ? `<button onclick="event.stopPropagation(); ui.viewOnMap(${lat}, ${lng}); document.getElementById('searchPopover')?.remove();" style="background:rgba(56,189,248,0.15);border:1px solid rgba(56,189,248,0.3);color:#38bdf8;border-radius:6px;padding:3px 6px;font-size:9px;cursor:pointer;font-weight:700;">📍</button>` : ''}
        </div>
      </div>`;
    }).join('');
    pop.innerHTML = header + rows;
    document.body.appendChild(pop);
  }

  updateDashboard() {

    requestAnimationFrame(() => {
        const activeTab = document.querySelector('.tab-content.active').id;
        
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
    const gpsCutCount = allTrucks.filter(t => t.isGpsCut).length; // Count GPS Cut

    const createCard = (label, value, color, filterType, icon) => {
      const isActive = this.currentFilter === filterType;
      const safeLabel = label.replace(/'/g, "\\'"); 
      return `
        <div class="stat-card ${isActive ? 'active-filter' : ''}" 
             data-type="${filterType}"
             onclick="ui.setFilter('${filterType}', '${safeLabel}')"
             style="border-bottom: 3px solid ${color}; background: linear-gradient(145deg, var(--bg-surface), color-mix(in srgb, ${color} 12%, var(--bg-surface))); cursor: pointer;">
          <div class="stat-icon" style="color: ${color}; background: color-mix(in srgb, ${color} 15%, transparent);">${icon}</div>
          <div class="stat-content">
            <div class="stat-label" style="font-weight: 700; color: ${color};">${label}</div>
            <div class="stat-value" style="color: var(--text-main);">${value}</div>
          </div>
        </div>
      `;
    };

    this.statsContainer.innerHTML = `
      ${createCard('Tous', stats.totalTrucks, '#3b82f6', 'all', '<i class="fa-solid fa-list"></i>')}
      ${createCard('En Route', movingCount, '#10b981', 'moving', '<i class="fa-solid fa-truck-fast"></i>')}
      ${createCard('À l\'arrêt', stoppedCount, '#ef4444', 'stopped', '<i class="fa-solid fa-ban"></i>')}
      ${createCard('Coupure GPS', gpsCutCount, '#475569', 'gps_cut', '<i class="fa-solid fa-satellite-dish"></i>')}
      ${createCard('Carburant Critique', stats.criticalCount, '#f97316', 'critical', '<i class="fa-solid fa-gas-pump"></i>')}
      ${createCard('Vidange', stats.vidangeCount, '#eab308', 'vidange', '<i class="fa-solid fa-wrench"></i>')}
    `;
    // Naftal panel removed from dashboard — available in Reports > Naftal section
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
    else if (this.currentFilter === 'vidange') trucks = trucks.filter(t => t.vidange.alert);
    else if (this.currentFilter === 'moving') trucks = trucks.filter(t => t.speed >= 1);
    else if (this.currentFilter === 'stopped') trucks = trucks.filter(t => t.speed < 1);
    else if (this.currentFilter === 'gps_cut') trucks = trucks.filter(t => t.isGpsCut); // NEW FILTER LOGIC

    if (trucks.length === 0) {
      this.trucksContainer.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 40px; color: #888; background: white; border-radius: 8px;">Aucun camion ne correspond aux critères.</div>';
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
        
      let cardStateClass = '';
      let borderLeftColor = truck.speed >= 1 ? 'var(--success)' : 'var(--text-muted)';
      if (truck.isCriticalFuel) {
          cardStateClass = 'critical-alert';
          borderLeftColor = 'var(--danger)';
      } else if (isSpeeding) {
          cardStateClass = 'critical-alert';
          borderLeftColor = 'var(--warning)';
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
      card.className = `card-premium ${isSpeeding ? 'speeding' : ''} ${truck.speed >= 1 ? 'moving' : 'stopped'} ${cardStateClass} ${hasExpiringRef ? 'doc-expiring' : ''}`;
      card.style.borderLeft = `4px solid ${borderLeftColor}`;
      card.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom: 12px;">
          <div>
            <h4 style="margin: 0; color: var(--text-primary); font-size: 1.15rem; display:flex; align-items:center; gap:6px;">
              ${truck.name} 
              ${truck.speed >= 1 ? '<span class="status-indicator moving"></span>' : '<span class="status-indicator stopped"></span>'}
            </h4>
            <div style="display:flex; gap:4px; margin-top:6px; flex-wrap:wrap; align-items:center;">
              ${(() => { const db = (ui.truckDbCache || []).find(d => d.deviceId === truck.id); if (!db) return ''; let tags = ''; if (db.carteNaftal) tags += `<span class="truck-meta-tag naftal"><i class="fa-solid fa-credit-card"></i> ${db.carteNaftal}</span> `; if (db.immatriculation) tags += `<span class="truck-meta-tag imm"><i class="fa-solid fa-id-badge"></i> ${db.immatriculation}</span> `; return tags; })()}
              ${this.renderReferenceBadges ? this.renderReferenceBadges(truck.id) : ''}
              ${hasExpiringRef ? `<span class="truck-meta-tag" style="background:var(--warning);color:#000;"><i class="fa-solid fa-triangle-exclamation"></i> Doc Expire</span>` : ''}
            </div>
            <div style="font-size: 11px; color: var(--text-muted); margin-top: 6px;">
              <i class="fa-regular fa-clock"></i> Dernière sync: ${new Date(truck.timestamp).toLocaleTimeString()}
            </div>
          </div>
          <div style="text-align:right;">
             <span class="${isSpeeding ? 'speed-badge-over' : ''}" style="background:${isSpeeding ? 'var(--danger)' : truck.speed >= 1 ? 'var(--success-subtle)' : 'var(--bg-elevated)'}; color:${isSpeeding ? '#fff' : truck.speed >= 1 ? 'var(--success)' : 'var(--text-secondary)'}; padding: 4px 10px; border-radius: 6px; font-size: 10px; font-weight: 800; letter-spacing: 0.5px; border: 1px solid ${isSpeeding ? 'var(--danger)' : truck.speed >= 1 ? 'var(--border-success)' : 'var(--border-light)'}; display:inline-flex; align-items:center; gap:4px; white-space:nowrap;">
               ${isSpeeding ? '<i class="fa-solid fa-triangle-exclamation"></i>' : ''} ${truck.speed} km/h
             </span>
             ${ruleLabel ? `<div style="margin-top:6px;">${ruleLabel}</div>` : ''}
          </div>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; background: var(--bg-elevated); padding: 12px; border-radius: var(--radius-lg); border: 1px solid var(--border-light); margin-bottom: 12px;">
          <div style="text-align: center;">
            <div style="color:var(--text-muted); font-size: 10px; text-transform: uppercase; font-weight: 600;">Odomètre</div>
            <strong style="color: var(--primary); font-size: 1.2rem;">${truck.odometer.toLocaleString()} <span style="font-size:10px; opacity:0.8">km</span></strong>
          </div>
          <div style="text-align: center; border-left: 1px solid var(--border-light);">
            <div style="color:var(--text-muted); font-size: 10px; text-transform: uppercase; font-weight: 600;">Carburant</div>
            <strong style="color: ${truck.isCriticalFuel ? 'var(--danger)' : 'var(--text-primary)'}; font-size: 1.2rem;">${truck.fuelLiters} <span style="font-size:10px; opacity:0.8">L</span></strong>
            <div style="font-size: 10px; color: var(--text-muted);">${truck.fuelPercentage}% plein</div>
          </div>
        </div>

        <div style="font-size: 11px; color: var(--text-secondary); display:flex; align-items:center; gap:8px; margin-bottom:12px;">
            <i class="fa-solid fa-map-marker-alt" style="${truck.location.isCustom ? 'color: var(--success);' : ''}"></i>
            <div>
              <strong style="color: ${truck.location.isCustom ? 'var(--success)' : 'var(--text-primary)'};">${truck.location.city}</strong>, ${truck.location.wilaya}
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
        
        <div style="display:flex; gap:8px; border-top:1px solid var(--border-light); padding-top:12px;">
          <button onclick="event.stopPropagation(); window.ui.viewOnMap(${truck.coordinates?.lat||0}, ${truck.coordinates?.lng||0})"
            class="btn-primary" style="flex:1; background:var(--primary); font-size:11px; padding:8px; border:none; box-shadow:0 2px 8px var(--primary-glow);">
            <i class="fa-solid fa-map-location-dot"></i> Suivre
          </button>
          <button onclick="event.stopPropagation(); window.ui.openRefModal('${truck.id}')"
            class="btn-primary" style="flex:1; background:var(--info); font-size:11px; padding:8px; border:none; box-shadow:0 2px 8px rgba(56,189,248,0.4);">
            <i class="fa-solid fa-file-contract"></i> Docs
          </button>
          <button onclick="event.stopPropagation(); window.ui.openMaintenanceModal('${truck.id}')"
            class="btn-secondary" style="flex:1; font-size:11px; padding:8px; border:1px solid var(--border-strong);">
            <i class="fa-solid fa-wrench"></i> Maint.
          </button>
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
    this.btnGroupWilaya.classList.remove('active');
    this.btnGroupCity.classList.remove('active');
    
    const mapBtn = document.getElementById('btnGroupMap');
    const mapWrapper = document.getElementById('map-wrapper');
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
        if(mapWrapper) mapWrapper.style.display = 'block';
        if(listContainer) listContainer.style.display = 'none';
        
        if (window.AlgeriaMap && !window.AlgeriaMap.map) window.AlgeriaMap.init();
        if (window.AlgeriaMap && app) window.AlgeriaMap.updateMarkers(app.getAllTrucks());
        
    } else {
        if(mapWrapper) mapWrapper.style.display = 'none';
        if(listContainer) listContainer.style.display = 'block';

        if (mode === 'wilaya') this.btnGroupWilaya.classList.add('active');
        else this.btnGroupCity.classList.add('active');
        
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
            
            <div style="margin-top: 8px; padding-top: 8px; border-top: 1px solid #eee; font-size: 11px; color: #666;">
               Actuel: ${t.odometer} km
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

  // ✅ QUICK ACTION: declare a Vidange from an alert (opens Maintenance modal prefilled)
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
            if (trucks.length === 0) return; 

            let displayLabel = groupName;
            if (this.zoneGroupingMode === 'city' && trucks.length > 0) {
                 const wilaya = trucks[0].location.wilaya || 'Algérie';
                 if(wilaya !== 'Inconnu' && !displayLabel.includes(wilaya)) {
                     displayLabel = `${groupName} <span style="font-weight:normal; font-size:0.9em; color:#666;">- ${wilaya}</span>`;
                 }
            }
            if(isCustom) displayLabel += `<span class="custom-zone-badge">ZONE DÉFINIE</span>`;

            const div = document.createElement('div');
            div.className = 'accordion-header';
            div.style.borderLeft = isCustom ? '4px solid #166534' : '4px solid #ddd';
            div.innerHTML = `
                  <div style="display:flex; align-items:center; gap: 10px;">
                    <i class="${this.zoneGroupingMode === 'city' ? 'fa-solid fa-location-dot' : 'fa-solid fa-map-pin'}" style="color:${isCustom ? '#166534' : 'var(--teal)'};"></i>
                    <strong>${displayLabel}</strong> 
                  </div>
                  <span style="background: #eee; padding: 2px 10px; border-radius: 10px; font-size: 12px; font-weight: bold;">${trucks.length}</span>
            `;
              
            div.onclick = () => {
                const grid = div.nextElementSibling;
                const isHidden = grid.style.display === 'none';
                grid.style.display = isHidden ? 'grid' : 'none';
            };

            const grid = document.createElement('div');
            grid.className = 'trucks-grid';
            grid.style.display = this.searchQuery ? 'grid' : 'none'; 
            grid.style.marginTop = '10px';
            grid.style.marginBottom = '20px';
            grid.style.gridTemplateColumns = 'repeat(auto-fill, minmax(250px, 1fr))';
              
            trucks.forEach(t => {
                 let isMoving = t.speed >= 1;
                 let statusHtml = isMoving 
                    ? `<span class="status-badge moving">EN ROUTE</span>` 
                    : `<span class="status-badge stopped">À L'ARRÊT</span>`;
                 
                 // Handle GPS CUT in Wilaya View too
                 if (t.isGpsCut) {
                     statusHtml = `<span class="status-badge gps-cut">COUPURE GPS</span>`;
                 }

                 const card = document.createElement('div');
                 card.className = 'truck-card';
                 card.style.padding = '15px';
                 const fuelColor = t.isCriticalFuel ? 'var(--red)' : t.isLowFuel ? 'var(--orange)' : 'var(--green)';

                 card.innerHTML = `
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 8px;">
                        <strong>${t.name}</strong>
                        ${statusHtml}
                    </div>
                    <div style="display:flex; justify-content:space-between; align-items:center; font-size: 13px;">
                        <span style="color: #666;"><i class="fa-solid fa-gas-pump"></i> Carburant:</span>
                        <strong style="color: ${fuelColor};">${t.fuelLiters} L</strong>
                    </div>
                    <div style="margin-top: 8px; font-size: 11px; color: #888; border-top: 1px solid #eee; padding-top: 5px;">
                        ${t.location.city}
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
              `✅ Re-scan terminé.\n` +
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
        <div style="background:#f0fdf4; border:1px solid #bbf7d0; border-radius:8px; padding:12px; text-align:center;">
            <div style="font-size:22px; font-weight:900; color:#166534;">${totalRefuels}</div>
            <div style="font-size:11px; color:#15803d; font-weight:600;">Remplissages</div>
        </div>
        <div style="background:#eff6ff; border:1px solid #bfdbfe; border-radius:8px; padding:12px; text-align:center;">
            <div style="font-size:22px; font-weight:900; color:#1e40af;">${totalVolume.toLocaleString()} L</div>
            <div style="font-size:11px; color:#2563eb; font-weight:600;">Volume Total</div>
        </div>
        <div style="background:#f0fdf4; border:1px solid #bbf7d0; border-radius:8px; padding:12px; text-align:center;">
            <div style="font-size:22px; font-weight:900; color:#166534;">${internalCount}</div>
            <div style="font-size:11px; color:#15803d; font-weight:600;">Sur Site</div>
        </div>
        <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:12px; text-align:center;">
            <div style="font-size:22px; font-weight:900; color:#64748b;">${externalCount}</div>
            <div style="font-size:11px; color:#94a3b8; font-weight:600;">Externe</div>
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
        <div style="background:white; border:1px solid #e2e8f0; border-left: 5px solid ${log.isInternal ? '#22c55e' : '#f59e0b'}; padding:15px; border-radius:10px; box-shadow:0 1px 4px rgba(0,0,0,0.06);">
            <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:10px;">
                <div>
                    <div style="font-weight:800; font-size:15px; color:#1e293b;">${log.truckName}</div>
                    <div style="font-size:11px; color:#94a3b8; margin-top:2px;">
                        <i class="fa-regular fa-calendar"></i> ${dateDisplay} &nbsp; <i class="fa-regular fa-clock"></i> ${timeDisplay}
                    </div>
                    ${(() => { const db = (this.truckDbCache||[]).find(d=>d.deviceId===String(log.deviceId)); return db&&db.carteNaftal ? `<span class="truck-meta-tag naftal" style="margin-top:4px; display:inline-block; font-size:10px; padding:2px 10px;"><i class="fa-solid fa-credit-card"></i> N° ${db.carteNaftal}</span>` : ''; })()}
                </div>
                <div style="text-align:right;">
                    <div style="font-size:24px; font-weight:900; color:${log.isInternal ? '#15803d' : '#0f172a'}; line-height:1;">+${log.realAdded} L</div>
                    <div style="font-size:10px; color:#94a3b8; margin-top:2px;">≈ ${Math.round(log.realAdded * (log.isInternal ? (FLEET_CONFIG.DEFAULT_TRUCK_CONFIG.fuelPricePerLiter || 29) : (ui.naftalPricePerLiter || 31)))} DA${log.isInternal ? '' : ' <span style="color:#f59e0b; font-size:9px;">(Naftal)</span>'}</div>
                </div>
            </div>

            <!-- Fuel level bar: before → after -->
            <div style="margin-bottom:10px;">
                <div style="display:flex; justify-content:space-between; font-size:10px; color:#94a3b8; margin-bottom:3px;">
                    <span>${(log.realOld && log.realOld > 0) ? ('↓ Avant: ' + log.realOld + ' L (' + oldPercent + '%)') : ''}</span>
                    <span>Après: ${log.realTotal} L (${fillPercent}%)</span>
                </div>
                <div style="background:#f1f5f9; border-radius:4px; height:8px; overflow:hidden; position:relative;">
                    <div style="position:absolute; left:0; top:0; height:100%; width:${oldPercent}%; background:#cbd5e1; border-radius:4px;"></div>
                    <div style="position:absolute; left:0; top:0; height:100%; width:${fillPercent}%; background:${barColor}; border-radius:4px; transition:width 0.3s;"></div>
                </div>
                <div style="font-size:10px; color:#64748b; text-align:right; margin-top:2px;">Capacité: ${log.truckCapacity} L</div>
            </div>

            <!-- Location -->
            <div style="display:flex; justify-content:space-between; align-items:center;">
                <div style="display:flex; align-items:center; gap:8px;">
                    ${locBadge}
                    <span style="font-size:12px; color:#334155; font-weight:600;" id="${log.domId}-text">${log.locationDisplay}</span>
                </div>
                ${(log.lat && log.lng && log.lat !== 0) ? `
                <div style="display:flex; gap:6px;">
                    <a href="https://www.google.com/maps?q=${log.lat},${log.lng}" target="_blank" style="font-size:10px; color:#2563eb; text-decoration:none; background:#eff6ff; padding:4px 8px; border-radius:4px; font-weight:600;">
                        <i class="fa-solid fa-map-location-dot"></i> Maps
                    </a>
                    <button onclick="ui.viewOnMap(${log.lat}, ${log.lng})" style="font-size:10px; color:#0284c7; background:#e0f2fe; padding:4px 8px; border-radius:4px; font-weight:600; border:none; cursor:pointer;">
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
                    <span style="color:#1e293b; font-size:13px;">
                        <i class="fa-solid fa-map-pin" style="color: var(--teal); margin-right: 8px;"></i> 
                        <strong>${cityName}</strong>
                    </span>
                    <span style="font-size:10px; color:#64748b; background:#e2e8f0; padding:2px 6px; border-radius:4px; font-weight:bold;">
                        ${context}
                    </span>
                </div>
                <div style="font-size:10px; color:#94a3b8; margin-left:22px; margin-top:2px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
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
      alert('⚠️ Sélectionnez un camion et au moins une destination.');
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
    let statusText = '✅ SUFFISANT';
    let cost = 0;

    if (shortfall > 0) {
      litersToBuy = shortfall;
      statusColor = 'orange'; 
      statusText = `⚠️ FAIRE L'APPOINT`;
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
          ${litersToBuy > 0 ? `
            <p>Ajouter pour sécuriser le trajet (+marge ${marginLiters}L):</p>
            <div style="font-size: 24px; font-weight: bold; color: ${statusColor};">${litersToBuy} Litres</div>
            <div style="margin-top: 10px; padding-top: 10px; border-top: 1px solid var(--border-light);">
              <div style="font-size: 12px; color: var(--text-muted);">COÛT ESTIMÉ</div>
              <div style="font-size: 28px; font-weight: 800; color: var(--teal);">${cost.toLocaleString()} DA</div>
            </div>
          ` : `<p style="color: var(--success);">Réserve à l'arrivée: ${remainingAfterTrip}L (Marge OK).</p>`}
        </div>
      </div>
    `;
  }
  
  goToPlanning(truckId) {
      this.switchTab('routing');
      this.routeTruck.value = truckId;
      this.routeTruck.focus();
      this.routeTruck.style.borderColor = 'var(--teal)';
      setTimeout(() => { this.routeTruck.style.borderColor = '#ddd'; }, 1000);
  }

  // --- CUSTOM LOCATIONS CRUD ---
  addCustomLocation() {
    const name = this.customLocName.value.trim();
    const wilaya = this.customLocWilaya.value.trim();
    const lat = parseFloat(this.customLocLat.value);
    const lng = parseFloat(this.customLocLng.value);
    let radius = parseInt(this.customLocRadius.value);
    const type = this.customLocType ? this.customLocType.value : 'other';

    if (!name || !wilaya || isNaN(lat) || isNaN(lng)) {
      alert('⚠️ Veuillez remplir tous les champs obligatoires.');
      return;
    }
    if (isNaN(radius) || radius < 10) radius = 500;
    
    const newLoc = { name, wilaya, lat, lng, radius, type }; 
    
    if (!FLEET_CONFIG.CUSTOM_LOCATIONS) FLEET_CONFIG.CUSTOM_LOCATIONS = [];
    
    if (this.editingLocationIndex !== null) {
        FLEET_CONFIG.CUSTOM_LOCATIONS[this.editingLocationIndex] = newLoc;
        alert(`✅ Lieu "${name}" mis à jour !`);
        this.editingLocationIndex = null;
        this.addCustomLocBtn.innerHTML = '<i class="fa-solid fa-plus"></i>';
        this.addCustomLocBtn.style.background = '#166534';
    } else {
        FLEET_CONFIG.CUSTOM_LOCATIONS.push(newLoc);
        alert(`✅ Lieu "${name}" ajouté !`);
    }
    
    this.saveSettingsToCloud();
    this.renderCustomLocationsList();
    this.customLocName.value = '';
    this.customLocLat.value = '';
    this.customLocLng.value = '';
  }

  editCustomLocation(index) {
      if (!FLEET_CONFIG.CUSTOM_LOCATIONS || !FLEET_CONFIG.CUSTOM_LOCATIONS[index]) return;
      const loc = FLEET_CONFIG.CUSTOM_LOCATIONS[index];
      
      this.customLocName.value = loc.name;
      this.customLocWilaya.value = loc.wilaya;
      this.customLocLat.value = loc.lat;
      this.customLocLng.value = loc.lng;
      this.customLocRadius.value = loc.radius || 500;
      if(this.customLocType) this.customLocType.value = loc.type || 'other';

      this.addCustomLocBtn.innerHTML = '<i class="fa-solid fa-save"></i>';
      this.addCustomLocBtn.style.background = '#e65100'; 
      this.editingLocationIndex = index;
      
      const accordion = document.querySelector('.settings-header i.fa-map-location-dot');
      if(accordion) {
          const header = accordion.closest('.settings-header');
          const content = header.nextElementSibling;
          if(!content.classList.contains('open')) header.click();
      }
  }

  deleteCustomLocation(index) {
    if(confirm('Supprimer ce lieu ?')) {
      FLEET_CONFIG.CUSTOM_LOCATIONS.splice(index, 1);
      this.saveSettingsToCloud();
      this.renderCustomLocationsList();
      
      if(this.editingLocationIndex === index) {
         this.editingLocationIndex = null;
         this.addCustomLocBtn.innerHTML = '<i class="fa-solid fa-plus"></i>';
         this.addCustomLocBtn.style.background = '#166534';
      }
    }
  }

  renderCustomLocationsList() {
    this.customLocationsList.innerHTML = '';
    if (!FLEET_CONFIG.CUSTOM_LOCATIONS || FLEET_CONFIG.CUSTOM_LOCATIONS.length === 0) {
      this.customLocationsList.innerHTML = '<div style="color:#888; font-size:12px; grid-column:1/-1;">Aucun lieu personnalisé.</div>';
      return;
    }
    FLEET_CONFIG.CUSTOM_LOCATIONS.forEach((loc, index) => {
      const typeConfig = (FLEET_CONFIG.LOCATION_TYPES || []).find(t => t.id === loc.type) || { color: '666666', icon: 'fa-map-pin', label: 'Autre' };
      
      const div = document.createElement('div');
      div.style.cssText = `background: #f8f9fa; padding: 10px; border-radius: 6px; border: 1px solid #ddd; border-left: 4px solid ${typeConfig.color || '#666'}; position: relative;`;
      div.innerHTML = `
        <div style="position:absolute; top:5px; right:5px; display:flex; gap:5px;">
             <button onclick="ui.editCustomLocation(${index})" style="background:none; border:none; color: var(--teal); cursor:pointer;"><i class="fa-solid fa-pen"></i></button>
             <button onclick="ui.deleteCustomLocation(${index})" style="background:none; border:none; color: #d32f2f; cursor:pointer;"><i class="fa-solid fa-trash"></i></button>
        </div>
        <div style="font-weight:bold; color: #333; margin-right:40px;">${loc.name}</div>
        <div style="font-size:10px; color:${typeConfig.color || '#666'}; font-weight:bold; margin-bottom:4px;">
           <i class="fa-solid ${typeConfig.icon || 'fa-map-pin'}"></i> ${typeConfig.label || 'Autre'}
        </div>
        <div style="font-size:11px; color:#555;">${loc.wilaya}</div>
        <div style="font-size:10px; color:#888;">${loc.lat.toFixed(4)}, ${loc.lng.toFixed(4)}</div>
      `;
      this.customLocationsList.appendChild(div);
    });
  }

  // --- MAINTENANCE & EXPORTS ---
  async fetchAndRenderMaintenance() {
      if(!this.maintenanceListContainer) return;
      this.maintenanceListContainer.innerHTML = '<div style="color:#666; text-align:center; padding:20px;"><i class="fa-solid fa-sync fa-spin"></i> Chargement Maintenance...</div>';
      
      try {
          const response = await fetch(`${FLEET_CONFIG.API.baseUrl}/api/maintenance`);
          if (!response.ok) throw new Error("Erreur Serveur");
          this.allMaintenanceLogs = await response.json();
          this.renderMaintenanceList();
      } catch (e) {
          this.maintenanceListContainer.innerHTML = '<div style="color:#888; text-align:center; padding:10px;">Maintenance indisponible (Serveur en veille).</div>';
          console.error("Maintenance fetch failed:", e);
      }
  }

  renderMaintenanceList() {
      if(!this.allMaintenanceLogs || this.allMaintenanceLogs.length === 0) {
          this.maintenanceListContainer.innerHTML = '<div style="text-align:center; padding:20px; color:#888;">Aucun historique de maintenance.</div>';
          return;
      }

      const start = this.maintDateStart.value ? new Date(this.maintDateStart.value) : null;
      const end = this.maintDateEnd.value ? new Date(this.maintDateEnd.value) : null;
      if(end) end.setHours(23, 59, 59, 999);
      
      const typeFilter = this.maintTypeFilter.value;
      const truckFilter = this.maintTruckSearch.value.toLowerCase().trim();

const filtered = this.allMaintenanceLogs.filter(item => {
          const d = new Date(item.date);
          
          // FIX: Always show Active (En cours) items, regardless of date filter
	      const isActive = item.isAuto && !item.exitDate;
          
          if (!isActive) {
              if(start && d < start) return false;
              if(end && d > end) return false;
          }

          if(typeFilter !== 'all' && item.type !== typeFilter) return false;
          if(truckFilter && !item.truckName.toLowerCase().includes(truckFilter)) return false;
          return true;
      });

      if(filtered.length === 0) {
          this.maintenanceListContainer.innerHTML = '<div style="text-align:center; padding:20px; color:#888;">Aucun résultat pour cette date/filtre.</div>';
          return;
      }

      // Sort: Active First, then Newest
	      filtered.sort((a,b) => {
	          const aActive = a.isAuto && !a.exitDate;
	          const bActive = b.isAuto && !b.exitDate;
          if(aActive && !bActive) return -1; // Active comes first
          if(!aActive && bActive) return 1;  // Inactive goes down
          return new Date(b.date) - new Date(a.date);
      });

      const totalItems = filtered.length;
      const totalPages = Math.ceil(totalItems / this.maintItemsPerPage);
      
      if (this.maintCurrentPage > totalPages) this.maintCurrentPage = totalPages || 1;
      if (this.maintCurrentPage < 1) this.maintCurrentPage = 1;

      const startIndex = (this.maintCurrentPage - 1) * this.maintItemsPerPage;
      const paginatedItems = filtered.slice(startIndex, startIndex + this.maintItemsPerPage);

      // Statistics bar
      const totalCost = this.allMaintenanceLogs.reduce((s, l) => s + (l.cost || 0), 0);
      const urgentCount = this.allMaintenanceLogs.filter(l => l.priority === 'urgent').length;
      const activeCount = this.allMaintenanceLogs.filter(l => l.isAuto && !l.exitDate).length;
      const thisMonthKey = new Date().toISOString().slice(0, 7);
      const thisMonthCount = this.allMaintenanceLogs.filter(l => new Date(l.date).toISOString().slice(0,7) === thisMonthKey).length;

      let html = `
      <div style="display:grid; grid-template-columns:repeat(auto-fit,minmax(110px,1fr)); gap:8px; margin-bottom:12px;">
        <div style="background:#fffbeb; border:1px solid #fde68a; border-radius:8px; padding:8px; text-align:center;">
          <div style="font-size:18px; font-weight:900; color:#92400e;">${totalItems}</div>
          <div style="font-size:9px; color:#b45309; font-weight:700;">FILTRÉES</div>
        </div>
        <div style="background:#f0fdf4; border:1px solid #bbf7d0; border-radius:8px; padding:8px; text-align:center;">
          <div style="font-size:18px; font-weight:900; color:#16a34a;">${thisMonthCount}</div>
          <div style="font-size:9px; color:#15803d; font-weight:700;">CE MOIS</div>
        </div>
        <div style="background:#fef2f2; border:1px solid #fecaca; border-radius:8px; padding:8px; text-align:center;">
          <div style="font-size:18px; font-weight:900; color:#dc2626;">${urgentCount}</div>
          <div style="font-size:9px; color:#ef4444; font-weight:700;">URGENTES</div>
        </div>
        <div style="background:#eff6ff; border:1px solid #bfdbfe; border-radius:8px; padding:8px; text-align:center;">
          <div style="font-size:18px; font-weight:900; color:#1d4ed8;">${activeCount}</div>
          <div style="font-size:9px; color:#2563eb; font-weight:700;">EN COURS</div>
        </div>
        <div style="background:#fdf4ff; border:1px solid #e9d5ff; border-radius:8px; padding:8px; text-align:center;">
          <div style="font-size:16px; font-weight:900; color:#7e22ce;">${totalCost.toLocaleString()} DA</div>
          <div style="font-size:9px; color:#9333ea; font-weight:700;">COÛT TOTAL</div>
        </div>
      </div>
      <div style="display:flex; justify-content:flex-end; margin-bottom:8px;">
        <button class="btn-secondary" onclick="ui.exportMaintenanceCSV()" style="font-size:10px; padding:5px 12px; border-color:#fde68a; color:#92400e;">
          <i class="fa-solid fa-file-excel"></i> Export Excel
        </button>
      </div>`;

      html += '<div style="display:grid; gap:10px;">';
      
      paginatedItems.forEach(item => {
          let icon = 'fa-wrench';
          let color = '#d32f2f'; 
          
          if(item.type === 'Vidange') { icon = 'fa-oil-can'; color = '#f57c00'; } 
          if(item.type === 'Plaquettes') { icon = 'fa-circle-stop'; color = '#c2185b'; }

          const isAuto = item.isAuto ? '<span style="background:#e3f2fd; color:#1565c0; padding:2px 6px; border-radius:4px; font-size:10px; margin-left:5px;"><i class="fa-solid fa-robot"></i> AUTO</span>' : '';
          
          // Determine status text (Active or Done)
          let statusHtml = '';
          if(item.isAuto) {
if (item.exitDate) {
                  const exitTime = new Date(item.exitDate).toLocaleString('fr-FR');
                  // Calculate Duration for closed logs
                  const diffMs = new Date(item.exitDate) - new Date(item.date);
                  const durationHrs = (diffMs / (1000 * 60 * 60)).toFixed(1);
                  statusHtml = `<div style="font-size:11px; color:#2e7d32; margin-top:3px;"><i class="fa-solid fa-check-circle"></i> Sortie: ${exitTime} (Durée: ${durationHrs}h)</div>`;
              } else {
                  // Calculate Live Duration for open logs
                  const now = new Date();
                  const start = new Date(item.date);
                  const diffMs = now - start;
                  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
                  const hours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
                  
                  let durationText = "";
                  if (days > 0) durationText = `${days}j ${hours}h`;
                  else durationText = `${hours}h`;

                  statusHtml = `<div style="font-size:11px; color:#e65100; margin-top:3px; font-weight:bold; animation: pulse-gray 2s infinite;">
                      <i class="fa-solid fa-spinner fa-spin"></i> En cours (Depuis: ${durationText})
                  </div>`;
              }
          }

          html += `
          <div style="background:white; border-left:4px solid ${color}; padding:15px; border-radius:8px; box-shadow:0 1px 3px rgba(0,0,0,0.1); display:flex; justify-content:space-between; align-items:center;">
              <div style="display:flex; gap:15px; align-items:center; flex:1;">
                  <div style="background:${color}20; color:${color}; width:40px; height:40px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:18px; flex-shrink:0;">
                      <i class="fa-solid ${icon}"></i>
                  </div>
                  <div style="flex:1;">
                      <div style="font-weight:bold; color:#333; font-size:15px;">
                          ${item.type} <span style="font-weight:normal; color:#666;">- ${item.truckName}</span>
                          ${isAuto}
                          ${item.priority === 'urgent' ? '<span class="maint-status-badge badge-urgent" style="margin-left:5px;">URGENT</span>' : ''}
                      </div>
                      <div style="font-size:12px; color:#666; margin-top:3px;">
                          <i class="fa-solid fa-arrow-right-to-bracket"></i> Entrée: ${new Date(item.date).toLocaleString()}
                      </div>
                      ${statusHtml}
                      <div style="font-size:12px; color:#666; margin-top:3px;">
                          <i class="fa-solid fa-road"></i> ${item.odometer.toLocaleString()} km
                          ${item.location ? ` |  <i class="fa-solid fa-map-pin"></i> ${item.location}` : ''}
                          ${item.technician ? ` | <i class="fa-solid fa-user-gear"></i> ${item.technician}` : ''}
                          ${item.cost ? ` | <i class="fa-solid fa-coins"></i> ${item.cost.toLocaleString()} DA` : ''}
                      </div>
                      ${item.description ? `<div style="font-size:11px; color:#555; margin-top:3px;"><i class="fa-solid fa-file-lines"></i> ${item.description}</div>` : ''}
                      ${item.note ? `<div style="font-size:12px; color:#444; margin-top:4px; font-style:italic;">"${item.note}"</div>` : ''}
                      <div style="display:flex; gap:4px; margin-top:4px; flex-wrap:wrap;">
                          ${item.chassisNumber ? `<span class="truck-meta-tag chassis"><i class="fa-solid fa-hashtag"></i> ${item.chassisNumber}</span>` : ''}
                          ${item.immatriculation ? `<span class="truck-meta-tag imm"><i class="fa-solid fa-id-badge"></i> ${item.immatriculation}</span>` : ''}
                      </div>
                  </div>
              </div>
              <div style="display:flex; gap: 5px; flex-shrink:0;">
                <button onclick="ui.viewOrdreReparation('${item.id}')" style="background:none; border:none; color:#f59e0b; cursor:pointer; font-size:14px; padding:5px;" title="Voir Ordre de Réparation">
                  <i class="fa-solid fa-file-pdf"></i>
                </button>
                <button onclick="ui.editMaintenance('${item.id}')" style="background:none; border:none; color:var(--teal); cursor:pointer; font-size:14px; padding:5px;" title="Modifier">
                  <i class="fa-solid fa-pen"></i>
                </button>
                <button onclick="ui.deleteMaintenance('${item.id}')" style="background:none; border:none; color:#e57373; cursor:pointer; font-size:14px; padding:5px;" title="Supprimer">
                  <i class="fa-solid fa-trash"></i>
                </button>
              </div>
          </div>
          `;
      });
      html += '</div>';

      if (totalPages > 1) {
          html += `
          <div class="pagination-controls">
              <button class="pagination-btn" onclick="ui.changeMaintPage(-1)" ${this.maintCurrentPage === 1 ? 'disabled' : ''}>« Préc.</button>
              <span class="pagination-info">Page ${this.maintCurrentPage} / ${totalPages} (${totalItems} entrées)</span>
              <button class="pagination-btn" onclick="ui.changeMaintPage(1)" ${this.maintCurrentPage === totalPages ? 'disabled' : ''}>Suiv. »</button>
          </div>
          `;
      }

      this.maintenanceListContainer.innerHTML = html;
  }

  changeMaintPage(direction) {
      this.maintCurrentPage += direction;
      this.renderMaintenanceList();
  }

  async deleteMaintenance(id) {
      if(!confirm("Supprimer cette entrée ?")) return;
      try {
          const res = await fetch(`${FLEET_CONFIG.API.baseUrl}/api/maintenance/delete`, {
              method: 'POST',
              headers: {'Content-Type': 'application/json'},
              body: JSON.stringify({ id })
          });
          if(res.ok) this.fetchAndRenderMaintenance(); 
          else alert("Erreur suppression.");
      } catch(e) { alert("Erreur connexion."); }
  }

  editMaintenance(id) {
    const log = this.allMaintenanceLogs.find(l => l.id === id);
    if(!log) return;
    this.openMaintenanceModal(log);
  }

  // ✅ Auto-fill form from selected Forfait
  _onForfaitSelectChange() {
      const select = document.getElementById('modalMaintForfait');
      if (!select) return;
      const code = select.value;
      if (!code) {
          // Reset if "Aucun forfait" is selected
          document.getElementById('modalMaintCost').value = '';
          document.getElementById('modalMaintDescription').value = '';
          return;
      }
      const forfait = (this.maintenanceArticles || []).find(a => a.code === code);
      if (forfait) {
          document.getElementById('modalMaintCost').value = forfait.defaultPrice || '';
          document.getElementById('modalMaintDescription').value = forfait.description || '';
          
          // Auto-select type if category is vidange
          if (forfait.category === 'Forfait Vidange') {
              document.getElementById('modalMaintType').value = 'Vidange';
          }
      }
  }

  openMaintenanceModal(editData = null) {
      this.maintenanceModal.style.display = 'flex';
      
      // Always reset wizard to step 1
      if (typeof this.setMaintWizardStep === 'function') {
        this.setMaintWizardStep(1);
      }

      if (!editData) {
          if(document.getElementById('modalMaintDate')) document.getElementById('modalMaintDate').value = new Date().toISOString().slice(0,16);
          if(document.getElementById('modalMaintType')) document.getElementById('modalMaintType').value = 'Preventive';
          if(document.getElementById('modalMaintOdo')) document.getElementById('modalMaintOdo').value = '';
          if(document.getElementById('modalMaintTechnician')) document.getElementById('modalMaintTechnician').value = '';
          if(document.getElementById('modalMaintDescription')) document.getElementById('modalMaintDescription').value = '';
          if(document.getElementById('modalMaintPriority')) document.getElementById('modalMaintPriority').value = 'Moyenne';
          if(document.getElementById('modalMaintScheme')) document.getElementById('modalMaintScheme').value = 'vehicule';
          this._wizardParts = [];
          if(this._renderPartsChecklist) this._renderPartsChecklist();
      }
      
      let preselectTruckId = null;
      if (typeof editData === 'string') {
          preselectTruckId = editData;
          editData = null; // Adding a new entry for this truck
      }

      const select = document.getElementById('modalMaintTruck');
      select.innerHTML = '';
      
      // ✅ GPS trucks
      const gpsTrucks = app.getAllTrucks();
      const addedIds = new Set();
      gpsTrucks.forEach(t => {
          const opt = document.createElement('option');
          opt.value = t.name;
          opt.dataset.id = t.id;
          opt.dataset.odo = t.odometer;
          opt.text = t.name;
          select.appendChild(opt);
          addedIds.add(t.id);
      });

      // ✅ NEW: Also add manual/non-GPS trucks from DB cache
      (this.truckDbCache || []).forEach(db => {
          if (!addedIds.has(db.deviceId)) {
              const opt = document.createElement('option');
              opt.value = db.truckName;
              opt.dataset.id = db.deviceId;
              opt.dataset.odo = '0';
              opt.text = `➕ ${db.truckName} (hors GPS)`;
              opt.style.color = '#f59e0b';
              select.appendChild(opt);
              addedIds.add(db.deviceId);
          }
      });

      // ✅ NEW: Option to add a completely new vehicle
      const addNewOpt = document.createElement('option');
      addNewOpt.value = '__ADD_NEW__';
      addNewOpt.text = '➕ Ajouter un véhicule hors GPS...';
      addNewOpt.style.color = '#16a34a';
      addNewOpt.style.fontWeight = 'bold';
      select.appendChild(addNewOpt);

      // ✅ Populate location dropdown from customLocations
      const locSelect = document.getElementById('modalMaintLocation');
      if (locSelect) {
        locSelect.innerHTML = '<option value="Atelier Douroub">🏭 Atelier Douroub</option>';
        const locs = FLEET_CONFIG.CUSTOM_LOCATIONS || [];
        locs.filter(l => l.type === 'maintenance').forEach(l => {
          locSelect.innerHTML += `<option value="${l.name}">🔧 ${l.name}</option>`;
        });
        locSelect.innerHTML += '<option value="Entrée Manuelle">📍 Entrée Manuelle</option>';
      }

      // ✅ Populate forfait dropdown
      const forfaitSelect = document.getElementById('modalMaintForfait');
      const forfaitContainer = document.getElementById('forfaitSelectContainer');
      if (forfaitSelect && forfaitContainer) {
          forfaitSelect.innerHTML = '<option value="">-- Aucun forfait (saisie manuelle) --</option>';
          const forfaits = (this.maintenanceArticles || []).filter(a => a.category === 'Forfait' || a.category === 'Forfait Vidange');
          if (forfaits.length > 0) {
              forfaitContainer.style.display = 'grid';
              forfaits.forEach(f => {
                  const opt = document.createElement('option');
                  opt.value = f.code;
                  opt.text = `${f.code} - ${f.name} (${f.defaultPrice} DA)`;
                  forfaitSelect.appendChild(opt);
              });
          } else {
              forfaitContainer.style.display = 'none';
          }
      }

      if (editData) {
        this.editingMaintenanceId = editData.id;
        this.editingIsAuto = editData.isAuto;
        this.editingOriginalLocation = editData.location;
        this.editingStatus = editData.status || 'en_cours';
        this.modalMaintTitle.innerText = 'Modifier Maintenance';
        this.modalMaintSubmitBtn.innerHTML = '<i class="fa-solid fa-save"></i> Mettre à jour';
        
        select.value = editData.truckName;
        document.getElementById('modalMaintType').value = editData.type;
        
        const d = new Date(editData.date);
        d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
        document.getElementById('modalMaintDate').value = d.toISOString().slice(0,16);
        document.getElementById('modalMaintOdo').value = editData.odometer;
        document.getElementById('modalMaintNote').value = editData.note || '';
        
        // ✅ NEW: Fill enhanced fields when editing
        if (locSelect && editData.location) locSelect.value = editData.location;
        const prioSelect = document.getElementById('modalMaintPriority');
        if (prioSelect) prioSelect.value = editData.priority || 'normal';
        const descField = document.getElementById('modalMaintDescription');
        if (descField) descField.value = editData.description || '';
        const techField = document.getElementById('modalMaintTechnician');
        if (techField) techField.value = editData.technician || '';
        const costField = document.getElementById('modalMaintCost');
        if (costField) costField.value = editData.cost || '';

        // ✅ NEW: Restore scheme and tire marks
        const schemeField = document.getElementById('modalMaintScheme');
        if (schemeField && editData.scheme) {
            schemeField.value = editData.scheme;
            if (typeof window.setScheme === 'function') window.setScheme(editData.scheme);
        }
        if (editData.tires) {
            const tires = editData.tires.split(',');
            tires.forEach(t => {
                const el = document.getElementById(t);
                if (el) el.classList.add('on');
            });
        }

      } else {
        this.editingMaintenanceId = null;
        this.editingOriginalLocation = null;
        this.modalMaintTitle.innerText = 'Ajouter Maintenance Manuelle';
        this.modalMaintSubmitBtn.innerHTML = '<i class="fa-solid fa-save"></i> Enregistrer';
        
        if (preselectTruckId) {
            const opt = Array.from(select.options).find(o => o.dataset.id === preselectTruckId);
            if (opt) {
                select.value = opt.value;
                document.getElementById('modalMaintOdo').value = opt.dataset.odo || '0';
            }
        } else if(select.options.length > 0) {
            document.getElementById('modalMaintOdo').value = select.options[0].dataset.odo;
        }
        const now = new Date();
        now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
        document.getElementById('modalMaintDate').value = now.toISOString().slice(0,16);
        document.getElementById('modalMaintNote').value = '';
        // ✅ NEW: Reset enhanced fields
        const prioSelect = document.getElementById('modalMaintPriority');
        if (prioSelect) prioSelect.value = 'normal';
        const descField = document.getElementById('modalMaintDescription');
        if (descField) descField.value = '';
        const techField = document.getElementById('modalMaintTechnician');
        if (techField) techField.value = '';
        const costField = document.getElementById('modalMaintCost');
        if (costField) costField.value = '';
      }
      
      select.onchange = () => {
         if (select.value === '__ADD_NEW__') {
             this.addManualTruckPrompt(select);
             return;
         }
         if (!this.editingMaintenanceId) {
             const opt = select.options[select.selectedIndex];
             document.getElementById('modalMaintOdo').value = opt.dataset.odo;
             this._autoFillTruckInfoInModal(opt.dataset.id);
         }
      };
      // Auto-fill on initial load too (when not editing)
      if (!editData && select.options.length > 0) {
        const initialId = select.options[select.selectedIndex]?.dataset?.id;
        if (initialId) this._autoFillTruckInfoInModal(initialId);
      }
  }

  // ✅ NEW: Prompt user to add a manual (non-GPS) truck
  async addManualTruckPrompt(selectEl) {
    const name = prompt('Nom du véhicule (ex: GRUE-01, CITERNE-03) :');
    if (!name || !name.trim()) { selectEl.selectedIndex = 0; return; }
    const chassis = prompt('N° Châssis (optionnel) :') || '';
    const imm = prompt('Immatriculation (optionnel) :') || '';
    const naftal = prompt('Carte Naftal (optionnel) :') || '';
    try {
      const res = await fetch(`${FLEET_CONFIG.API.baseUrl}/api/trucks/manual`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ truckName: name.trim(), chassisNumber: chassis, immatriculation: imm, carteNaftal: naftal })
      });
      if (res.ok) {
        const data = await res.json();
        alert(`✅ Véhicule "${name.trim()}" ajouté ! Il sera disponible dans toutes les sections.`);
        await this.loadTruckDbCache();
        // Re-add to the current dropdown
        const opt = document.createElement('option');
        opt.value = name.trim();
        opt.dataset.id = data.truck?.deviceId || ('manual_' + name.trim().toLowerCase().replace(/\s+/g, '_'));
        opt.dataset.odo = '0';
        opt.text = `➕ ${name.trim()} (hors GPS)`;
        // Insert before the last option (Add new)
        selectEl.insertBefore(opt, selectEl.lastChild);
        selectEl.value = name.trim();
      } else { alert('Erreur serveur.'); selectEl.selectedIndex = 0; }
    } catch (e) { alert('Erreur connexion.'); selectEl.selectedIndex = 0; }
  }

  closeMaintenanceModal() {
      this.maintenanceModal.style.display = 'none';
      this.editingMaintenanceId = null;
      this.editingIsAuto = false;
      this.editingStatus = null;
      this.editingOriginalLocation = null;
      this._wizardParts = [];
      // Reset all form fields
      var fields = ['modalMaintOdo','modalMaintTechnician','modalMaintDescription','modalMaintNote','modalMaintCost','modalMaintImm'];
      fields.forEach(function(id) { var el = document.getElementById(id); if(el) el.value = ''; });
      var forfaitSel = document.getElementById('modalMaintForfait');
      if (forfaitSel) forfaitSel.selectedIndex = 0;
      var truckSel = document.getElementById('modalMaintTruck');
      if (truckSel) truckSel.selectedIndex = 0;
      var schemeSel = document.getElementById('modalMaintScheme');
      if (schemeSel) schemeSel.value = 'vehicule';
      // Reset tire marks
      document.querySelectorAll('#maintenanceModal .mark').forEach(el => el.classList.remove('on'));
      // Reset scheme visual
      if (typeof window.setScheme === 'function') window.setScheme('vehicule');
  }

  async saveManualMaintenance() {
      const select = document.getElementById('modalMaintTruck');
      const truckName = select.value;
      const deviceId = select.options[select.selectedIndex].dataset.id;
      const type = document.getElementById('modalMaintType').value;
      const dateVal = document.getElementById('modalMaintDate').value;
      // Auto-fill odometer from GPS if user left it empty
      let odo = parseInt(document.getElementById('modalMaintOdo').value);
      if (isNaN(odo)) {
          const gpsTruck = app.getAllTrucks().find(function(t) { return t.id === deviceId; });
          odo = gpsTruck ? (gpsTruck.odometer || 0) : 0;
          document.getElementById('modalMaintOdo').value = odo;
      }
      const note = document.getElementById('modalMaintNote').value;

      if(!truckName || !dateVal) {
          alert("Veuillez sélectionner un camion et une date.");
          return;
      }

// NEW LOGIC: Keep "Auto" status if we are editing an existing auto-entry
let isAutoState = false;
if (this.editingMaintenanceId) {
    isAutoState = this.editingIsAuto; 
}

// ✅ NEW: Capture enhanced fields
const locationSelect = document.getElementById('modalMaintLocation');
const locationVal = locationSelect ? locationSelect.value : 'Entrée Manuelle';
const priority = document.getElementById('modalMaintPriority')?.value || 'normal';
const description = document.getElementById('modalMaintDescription')?.value || '';
const technician = document.getElementById('modalMaintTechnician')?.value || '';
const cost = parseFloat(document.getElementById('modalMaintCost')?.value) || undefined;
const forfaitName = document.getElementById('modalMaintForfait')?.value || '';
const scheme = document.getElementById('modalMaintScheme')?.value || 'vehicule';
const marks = Array.from(document.querySelectorAll('#maintenanceModal .mark.on')).map(el => el.id).join(',');
const checkedParts = (this._wizardParts || []).filter(p => p.checked);

// Get truck metadata from DB cache
const db = this.truckDbCache.find(d => String(d.deviceId) === String(deviceId)) || {};

const eventData = {
    truckName,
    deviceId,
    type: type,
    location: (isAutoState && this.editingOriginalLocation) ? this.editingOriginalLocation : locationVal,
    odometer: odo,
    date: new Date(dateVal).toISOString(),
    note: note,
    isAuto: isAutoState,
    status: this.editingMaintenanceId ? (this.editingStatus || 'en_cours') : 'en_cours',
    priority,
    description: description + (forfaitName ? '\nPack choisi: ' + forfaitName : ''),
    technician,
    cost,
    forfaitName,
    scheme,
    tires: marks,
    parts: checkedParts,
    chassisNumber: db.chassisNumber || '',
    immatriculation: document.getElementById('modalMaintImm')?.value || db.immatriculation || ''
};

      let url = '/api/maintenance/add';
      if (this.editingMaintenanceId) {
         url = '/api/maintenance/update';
         eventData.id = this.editingMaintenanceId;
      }

      try {
          const res = await fetch(`${FLEET_CONFIG.API.baseUrl}${url}`, {
              method: 'POST',
              headers: {'Content-Type': 'application/json', 'x-access-code': this.currentCode},
              body: JSON.stringify(eventData)
          });
          if(res.ok) {
              alert(this.editingMaintenanceId ? "✅ Mis à jour !" : "✅ Enregistré !");
              this.closeMaintenanceModal();
              this.fetchAndRenderMaintenance();

              // ✅ If it was a Vidange, refresh settings (override) + trucks so the Vidange alert disappears
              if (eventData.type === 'Vidange') {
                  try {
                      await this.loadSettingsFromCloud();
                      await this.fetchAndUpdateTrucks();
                  } catch (e) {
                      console.warn('Refresh after Vidange failed:', e.message);
                  }
              }
          } else {
              alert("Erreur serveur.");
          }
      } catch(e) {
          alert("Erreur connexion.");
      }
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
  // ✅ MAINTENANCE FOLLOW-UP SYSTEM (NEW)
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
      this.maintTruckSearchResults.innerHTML = '<div style="padding:12px; color:#94a3b8; text-align:center; font-size:12px;">Aucun résultat</div>';
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
            <div style="font-weight:700; color:#0f172a;">${t.name}</div>
            <div style="display:flex; gap:4px; margin-top:3px; flex-wrap:wrap;">${tags.join('')}</div>
          </div>
          <div style="text-align:right;">
            <div style="font-size:11px; color:#64748b;">${t.odometer.toLocaleString()} km</div>
            <div style="font-size:10px; color:${t.speed > 0 ? '#16a34a' : '#94a3b8'};">${t.speed > 0 ? '🟢 En route' : '🔴 Arrêt'}</div>
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
          <div class="truck-info-row"><span class="truck-info-label"><i class="fa-solid fa-hashtag"></i> Châssis</span><span class="truck-info-value">${db.chassisNumber || '<em style="color:#94a3b8;">Non renseigné</em>'}</span></div>
          <div class="truck-info-row"><span class="truck-info-label"><i class="fa-solid fa-id-badge"></i> Immatriculation</span><span class="truck-info-value">${db.immatriculation || '<em style="color:#94a3b8;">Non renseigné</em>'}</span></div>
          <div class="truck-info-row"><span class="truck-info-label"><i class="fa-solid fa-credit-card"></i> Carte Naftal</span><span class="truck-info-value">${db.carteNaftal || '<em style="color:#94a3b8;">Non renseigné</em>'}</span></div>
          <div class="truck-info-row"><span class="truck-info-label"><i class="fa-solid fa-oil-can"></i> Vidange</span><span class="truck-info-value" style="color:${truck.vidange.alert ? '#ef4444' : '#22c55e'};">${truck.vidange.alert ? '⚠️ ' + truck.vidange.kmUntilNext + ' km' : '✅ OK (' + truck.vidange.kmUntilNext + ' km)'}</span></div>
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
        alert('✅ Fiche véhicule sauvegardée !');
        await this.loadTruckDbCache();
        this.renderTruckInfoPanel(this.selectedMaintTruckId);
      } else { alert('Erreur serveur.'); }
    } catch (e) { alert('Erreur connexion.'); }
  }

  renderActiveOrdersDashboard() {
    if (!this.activeOrdersDashboard) return;
    
    // Add header without toggle buttons
    let headerHtml = `
      <div style="grid-column: 1/-1; display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
        <div style="font-weight:700; color:var(--text-primary);"><i class="fa-solid fa-truck-medical"></i> Véhicules en Maintenance</div>
      </div>
    `;

    if (!this.activeMaintenanceOrders.length) {
      this.activeOrdersDashboard.innerHTML = headerHtml + `
        <div style="grid-column: 1/-1; text-align:center; padding:40px; color:#94a3b8;">
          <i class="fa-solid fa-clipboard-check" style="font-size:40px; margin-bottom:12px; display:block; opacity:0.4;"></i>
          <div style="font-size:14px; font-weight:600;">Aucun ordre de maintenance actif</div>
          <div style="font-size:12px; margin-top:4px;">Les ordres apparaîtront ici automatiquement lorsqu'un camion entre en zone de maintenance</div>
        </div>`;
      this.activeOrdersDashboard.style.display = 'grid';
      this.activeOrdersDashboard.style.gridTemplateColumns = '1fr';
      return;
    }

    let html = headerHtml;
    
    // Adjust container style
    this.activeOrdersDashboard.style.display = 'grid';
    this.activeOrdersDashboard.style.gridTemplateColumns = 'repeat(auto-fill, minmax(320px, 1fr))';
    this.activeOrdersDashboard.style.gap = '16px';

    this.activeMaintenanceOrders.forEach(order => {
      const priorityClass = order.priority === 'urgent' ? 'urgent' : (order.status === 'termine' ? 'completed' : 'active-order');
      const statusBadge = order.status === 'termine'
        ? '<span class="maint-status-badge badge-termine"><i class="fa-solid fa-check-circle"></i> Terminé</span>'
        : (order.priority === 'urgent'
          ? '<span class="maint-status-badge badge-urgent"><i class="fa-solid fa-exclamation-triangle"></i> Urgent</span>'
          : '<span class="maint-status-badge badge-en-cours"><i class="fa-solid fa-spinner fa-spin"></i> En cours</span>');

      const start = new Date(order.date);
      const formattedDate = start.toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
      const diffMs = new Date() - start;
      const days = Math.floor(diffMs / 86400000);
      const hours = Math.floor((diffMs % 86400000) / 3600000);
      const durationText = days > 0 ? `${days}j ${hours}h` : `${hours}h`;

      const db = this.truckDbCache.find(d => d.deviceId === order.deviceId) || {};
      const metaTags = [];
      if (db.immatriculation) metaTags.push(`<span class="truck-meta-tag imm">${db.immatriculation}</span>`);
      if (db.chassisNumber) metaTags.push(`<span class="truck-meta-tag chassis">${db.chassisNumber}</span>`);

      if (viewMode === 'list') {
         html += `
         <div class="maint-card ${priorityClass}" style="display:flex; justify-content:space-between; align-items:center; padding:12px 16px;">
           <div style="flex:1;">
             <div style="display:flex; align-items:center; gap:12px;">
               <div style="font-size:15px; font-weight:800; color:#0f172a; min-width:120px;">${order.truckName}</div>
               <div style="display:flex; gap:4px; flex-wrap:wrap;">${metaTags.join('')}</div>
               ${statusBadge}
             </div>
             <div style="display:flex; gap:15px; font-size:12px; margin-top:8px; color:var(--text-secondary);">
               <div><i class="fa-solid fa-wrench" style="color:#f59e0b;"></i> <strong>${order.type}</strong></div>
               <div><i class="fa-solid fa-calendar" style="color:#3b82f6;"></i> ${formattedDate}</div>
               <div><i class="fa-solid fa-clock" style="color:#64748b;"></i> ${durationText}</div>
               <div><i class="fa-solid fa-map-pin" style="color:#ef4444;"></i> ${order.location || 'N/A'}</div>
             </div>
           </div>
           <div style="display:flex; gap:6px;">
             <button onclick="ui.cancelMaintenanceOrder('${order.id}')" class="btn-secondary" style="font-size:11px; padding:6px 10px; border-color:#fecaca; color:#dc2626;"><i class="fa-solid fa-ban"></i></button>
             <button onclick="ui.editMaintenance('${order.id}')" class="btn-secondary" style="font-size:11px; padding:6px 10px;"><i class="fa-solid fa-pen"></i></button>
             <button onclick="ui.closeMaintenanceOrderUI('${order.id}')" class="btn-primary" style="font-size:11px; padding:6px 10px; background:#22c55e; border:none;"><i class="fa-solid fa-check"></i> Terminer</button>
           </div>
         </div>`;
      } else {
         html += `
        <div class="maint-card ${priorityClass}">
          <div style="display:flex; justify-content:space-between; align-items:start; margin-bottom:8px;">
            <div>
              <div style="font-size:16px; font-weight:800; color:#0f172a;">${order.truckName}</div>
              <div style="display:flex; gap:4px; margin-top:3px; flex-wrap:wrap;">${metaTags.join('')}</div>
            </div>
            ${statusBadge}
          </div>
          <div style="display:grid; grid-template-columns:1fr 1fr; gap:6px; font-size:12px; margin-top:10px;">
            <div><i class="fa-solid fa-wrench" style="color:#f59e0b; width:16px;"></i> <strong>${order.type}</strong></div>
            <div><i class="fa-solid fa-calendar" style="color:#3b82f6; width:16px;"></i> ${formattedDate}</div>
            <div><i class="fa-solid fa-clock" style="color:#64748b; width:16px;"></i> ${durationText}</div>
            <div><i class="fa-solid fa-map-pin" style="color:#ef4444; width:16px;"></i> ${order.location || 'N/A'}</div>
            <div><i class="fa-solid fa-road" style="color:#3b82f6; width:16px;"></i> ${(order.odometer || 0).toLocaleString()} km</div>
            ${order.technician ? `<div><i class="fa-solid fa-user-gear" style="color:#7e22ce; width:16px;"></i> ${order.technician}</div>` : ''}
            ${order.cost ? `<div><i class="fa-solid fa-coins" style="color:#f59e0b; width:16px;"></i> ${order.cost.toLocaleString()} DA</div>` : ''}
          </div>
          ${order.note ? `<div style="font-size:11px; color:#64748b; margin-top:8px; font-style:italic; padding:6px; background:#f8fafc; border-radius:4px;">"${order.note}"</div>` : ''}
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
      }
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
        alert('✅ Ordre clôturé !');
        this.refreshMaintenanceFollowup();
        this.fetchAndRenderMaintenance();
      } else { alert('Erreur serveur.'); }
    } catch (e) { alert('Erreur connexion.'); }
  }

  async cancelMaintenanceOrder(id) {
    if (!confirm('⚠️ ANNULER cet ordre de maintenance ?\n\nCette action est irréversible. L\'ordre sera marqué comme annulé.')) return;
    try {
      const res = await fetch(`${FLEET_CONFIG.API.baseUrl}/api/maintenance/${id}/cancel`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }
      });
      if (res.ok) {
        alert('✅ Ordre annulé avec succès.');
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
        alert('✅ Articles par défaut créés ! (Vidange, Freins, Pneus, Filtres, Batterie, Embrayage, Clim, Suspension, Divers)');
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
      container.innerHTML = `<div style="text-align:center;padding:30px;color:#94a3b8;font-size:13px;">
        <i class="fa-solid fa-oil-can" style="font-size:32px;display:block;margin-bottom:10px;opacity:0.3;"></i>
        Aucun forfait défini. Utilisez les boutons ci-dessus pour en ajouter.</div>`;
      return;
    }
    let html = '<div style="display:grid;gap:10px;">';
    forfaits.forEach((f, i) => {
      html += `<div style="background:white;border:1px solid #fed7aa;border-left:4px solid #f59e0b;border-radius:10px;padding:14px;display:flex;justify-content:space-between;align-items:center;">
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
        if (window.showToast) showToast(`✅ Forfait "${name}" ajouté au catalogue`, 'success');
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
    if (!code || !name) { if (window.showToast) showToast('⚠️ Code et Nom requis', 'warning'); return; }
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
    if (window.showToast) showToast('✅ Intervalles d\'entretien sauvegardés', 'success');
  }

  _renderArticlesCatalog() {
    const container = document.getElementById('articlesCatalogContainer');
    if (!container) return;
    const articles = this._maintenanceArticles || [];
    if (articles.length === 0) {
      container.innerHTML = '<div style="text-align:center;padding:30px;color:#94a3b8;"><i class="fa-solid fa-box-open" style="font-size:36px;display:block;margin-bottom:10px;opacity:0.4;"></i><div style="font-size:13px;">Aucun article configuré. Cliquez "Créer Articles Par Défaut" pour commencer.</div></div>';
      return;
    }
    let html = '<table style="width:100%;border-collapse:collapse;font-size:12px;"><thead><tr style="background:#f8fafc;border-bottom:2px solid #e2e8f0;color:#475569;"><th style="padding:8px;text-align:left;">Code</th><th style="padding:8px;text-align:left;">Nom</th><th style="padding:8px;">Catégorie</th><th style="padding:8px;">Prix (DA)</th><th style="padding:8px;">Pièces</th><th style="padding:8px;">Actions</th></tr></thead><tbody>';
    articles.forEach((art, i) => {
      const bg = i % 2 === 0 ? '#fff' : '#fdf4ff';
      const partsCount = (art.components || []).length;
      html += `<tr style="background:${bg};border-bottom:1px solid #f1f5f9;">
        <td style="padding:8px;font-weight:700;font-family:monospace;color:#7e22ce;">${art.code}</td>
        <td style="padding:8px;font-weight:700;">${art.name}</td>
        <td style="padding:8px;text-align:center;"><span style="background:#f5f3ff;color:#7e22ce;padding:2px 8px;border-radius:10px;font-size:10px;font-weight:600;">${art.category}</span></td>
        <td style="padding:8px;text-align:center;font-weight:700;color:#059669;">${(art.defaultPrice || 0).toLocaleString()}</td>
        <td style="padding:8px;text-align:center;">${partsCount} pièce${partsCount > 1 ? 's' : ''}</td>
        <td style="padding:8px;text-align:center;"><button onclick="ui.deleteArticle('${art.id}')" style="background:#fef2f2;color:#dc2626;border:1px solid #fecaca;border-radius:6px;padding:3px 8px;font-size:10px;cursor:pointer;font-weight:600;"><i class="fa-solid fa-trash"></i></button></td>
      </tr>`;
    });
    html += '</tbody></table>';
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
        alert('✅ Article enregistré !');
        ['artCode','artName','artCategory','artDescription','artPrice','artLabor','artDuration'].forEach(id => {
          const el = document.getElementById(id); if (el) el.value = '';
        });
        await this.loadMaintenanceArticles();
        this._renderArticlesCatalog();
      } else { alert('Erreur serveur.'); }
    } catch (e) { alert('Erreur: ' + e.message); }
  }

  openNewMaintenanceOrder(truckId = null) {
    // Populate the location dropdown from customLocations
    const locSelect = document.getElementById('modalMaintLocation');
    if (locSelect) {
      locSelect.innerHTML = '<option value="Atelier Douroub">🏭 Atelier Douroub</option>';
      const locs = FLEET_CONFIG.CUSTOM_LOCATIONS || [];
      locs.filter(l => l.type === 'maintenance').forEach(l => {
        locSelect.innerHTML += `<option value="${l.name}">🔧 ${l.name}</option>`;
      });
      locSelect.innerHTML += '<option value="Entrée Manuelle">📍 Entrée Manuelle</option>';
    }

    // Load articles catalog and populate dropdown
    this.loadMaintenanceArticles().then(() => this._populateArticleDropdown());

    this.openMaintenanceModal(null);

    // Pre-select truck if provided
    if (truckId) {
      const select = document.getElementById('modalMaintTruck');
      if (select) {
        for (let i = 0; i < select.options.length; i++) {
          if (select.options[i].dataset.id === truckId) {
            select.selectedIndex = i;
            document.getElementById('modalMaintOdo').value = select.options[i].dataset.odo;
            break;
          }
        }
      }
    }
  }

  async generateOrdreReparation() {
    const select = document.getElementById('modalMaintTruck');
    const truckName = select && select.options[select.selectedIndex] ? select.options[select.selectedIndex].text : (select ? select.value : '');
    const truckId = select && select.options[select.selectedIndex] ? select.options[select.selectedIndex].dataset.id : '';
    const db = this.truckDbCache.find(d => d.deviceId === truckId) || {};
    const truck = app.getAllTrucks().find(t => t.id === truckId);
    
    // Gather checked parts from wizard
    const checkedParts = (this._wizardParts || []).filter(p => p.checked);
    let partsStr = '';
    if (checkedParts.length > 0) {
        partsStr = encodeURIComponent(JSON.stringify(checkedParts));
    }

    // Read scheme from the dropdown we added
    const schemeSelect = document.getElementById('modalMaintScheme');
    const scheme = schemeSelect ? schemeSelect.value : 'vehicule';

    // Get forfait name from the dropdown
    const forfaitSelect = document.getElementById('modalMaintForfait');
    let forfaitName = '';
    if (forfaitSelect && forfaitSelect.value) {
        forfaitName = forfaitSelect.options[forfaitSelect.selectedIndex]?.text || '';
    }

    // Gather tire marks
    const marks = Array.from(document.querySelectorAll('#maintenanceModal .mark.on')).map(el => el.id).join(',');

    const typeVal = document.getElementById('modalMaintType')?.value || 'Preventive';
    const dateVal = document.getElementById('modalMaintDate')?.value || new Date().toISOString().slice(0, 16);
    let odoVal = parseInt(document.getElementById('modalMaintOdo')?.value);
    if (isNaN(odoVal)) odoVal = truck ? (truck.odometer || 0) : 0;
    const descVal = document.getElementById('modalMaintDescription')?.value || '';
    const techVal = document.getElementById('modalMaintTechnician')?.value || '';
    const costVal = parseFloat(document.getElementById('modalMaintCost')?.value) || 0;
    const prioVal = document.getElementById('modalMaintPriority')?.value || 'normal';
    const laborVal = document.getElementById('modalMaintLabor')?.value || '0';
    const locationVal = document.getElementById('modalMaintLocation')?.value || '';

    try {
      const isEdit = !!this.editingMaintenanceId;
      const url = isEdit ? '/api/maintenance/update' : '/api/maintenance/add';
      const payload = {
        truckName: truckName,
        deviceId: truckId,
        type: typeVal,
        location: locationVal,
        odometer: odoVal,
        date: new Date(dateVal).toISOString(),
        note: 'Ordre de Réparation généré' + (forfaitName ? ' — Pack: ' + forfaitName : ''),
        isAuto: false,
        priority: prioVal,
        status: isEdit ? (this.editingStatus || 'en_cours') : 'en_cours',
        description: descVal + (forfaitName ? '\nPack choisi: ' + forfaitName : ''),
        technician: techVal,
        cost: costVal,
        parts: checkedParts,
        scheme: scheme,
        tires: marks,
        forfaitName: forfaitName,
        chassisNumber: db.chassisNumber || '',
        immatriculation: document.getElementById('modalMaintImm')?.value || db.immatriculation || ''
      };
      if (isEdit) payload.id = this.editingMaintenanceId;

      await fetch(FLEET_CONFIG.API.baseUrl + url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-access-code': this.currentCode },
        body: JSON.stringify(payload)
      });
      console.log('✅ Maintenance entry auto-saved with OR generation');
    } catch (e) {
      console.warn('Could not auto-save maintenance entry:', e.message);
    }

    const params = new URLSearchParams({
      truck: truckName,
      chassis: db.chassisNumber || '',
      imm: document.getElementById('modalMaintImm')?.value || db.immatriculation || '',
      type: typeVal,
      date: dateVal,
      odo: String(odoVal),
      tech: techVal,
      desc: descVal + (forfaitName ? '\nPack choisi: ' + forfaitName : ''),
      priority: prioVal,
      status: this.editingMaintenanceId ? (this.editingStatus || 'en_cours') : 'en_cours',
      cost: String(costVal),
      labor: laborVal,
      location: truck?.location?.city ? (truck.location.city + ', ' + (truck.location.wilaya || '')) : '',
      parts: partsStr,
      scheme: scheme,
      tires: marks,
      forfaitName: forfaitName
    });
    window.open('ordre_reparation_v21.html?v=' + Date.now() + '&' + params.toString(), '_blank');

    // Close the modal and fully reset for next use
    this.closeMaintenanceModal();
    // Refresh maintenance list
    this.fetchAndRenderMaintenance();
  }

  // ✅ NEW: Open Ordre de Réparation pre-filled from a maintenance history entry
  viewOrdreReparation(id) {
    const item = (this.allMaintenanceLogs || []).find(l => l.id === id);
    if (!item) { alert('Entrée introuvable.'); return; }
    const db = this.truckDbCache.find(d => d.deviceId === item.deviceId) || {};
    let scheme = item.scheme;
    if (!scheme) {
      scheme = 'vehicule';
      const activeScheme = document.querySelector('#maintenanceModal .scheme.active');
      if (activeScheme) {
        scheme = activeScheme.id.replace('scheme_', '');
      }
    }

    const params = new URLSearchParams({
      truck: item.truckName || '',
      chassis: item.chassisNumber || db.chassisNumber || '',
      imm: item.immatriculation || db.immatriculation || '',
      type: item.type || '',
      date: item.date ? new Date(item.date).toISOString().slice(0, 16) : '',
      odo: item.odometer || '',
      tech: item.technician || '',
      desc: item.description || item.note || '',
      location: item.location || '',
      priority: item.priority || '',
      status: item.status || 'en_cours',
      cost: item.cost || '',
      scheme: scheme,
      tires: item.tires || '',
      forfaitName: item.forfaitName || '',
      parts: (item.parts && item.parts.length > 0) ? encodeURIComponent(JSON.stringify(item.parts)) : ''
    });
    window.open(`ordre_reparation_v21.html?v=${Date.now()}&${params.toString()}`, '_blank');
  }

  // ============================================================
  // END MAINTENANCE FOLLOW-UP SYSTEM
  // ============================================================

  exportCSV() {
     const csv = app.exportCSV();
     if(!csv) return;
     const blob = new Blob(["\uFEFF" + csv], { type: 'text/csv;charset=utf-8;' });
     const url = window.URL.createObjectURL(blob);
     const a = document.createElement('a');
     a.href = url;
     a.download = `rapport_flotte_${new Date().toISOString().slice(0,10)}.csv`;
     a.click();
  }
  
  exportJSON() {
     const json = app.exportJSON();
     const blob = new Blob([json], { type: 'application/json' });
     const url = window.URL.createObjectURL(blob);
     const a = document.createElement('a');
     a.href = url;
     a.download = `backup_flotte_${new Date().toISOString().slice(0,10)}.json`;
     a.click();
  }
// =========================================================
  // 📊 RAPPORT MENSUEL SÉLECTIF (THE MISSING PIECE)
  // =========================================================

// =========================================================
  // 📊 RAPPORT: BIG WINDOW & EXACT TIME
  // =========================================================

// REPLACE openReportModal in ui.js

openReportModal() {
    if (document.getElementById('reportModal')) document.getElementById('reportModal').remove();

    const div = document.createElement('div');
    div.id = 'reportModal';
    div.className = 'modal-overlay';
    div.style.display = 'flex';
    
    const now = new Date();
    const yest = new Date(now); yest.setDate(yest.getDate() - 1);
    const toInput = (d) => d.toISOString().slice(0,16);

    div.innerHTML = `
        <div class="modal-box" style="width: 700px; max-width:95vw; background:white; padding:20px; border-radius:8px; box-shadow:0 10px 25px rgba(0,0,0,0.3);">
            <h2 style="margin-top:0; color:var(--teal);"><i class="fa-solid fa-file-invoice"></i> Centre de Rapports</h2>
            
            <div style="background:#f0f9ff; padding:15px; border-radius:6px; margin:15px 0; border:1px solid #bae6fd;">
                <label style="font-weight:bold; color:#0369a1; display:block; margin-bottom:5px;">TYPE DE RAPPORT</label>
                <select id="reportTypeSelector" style="width:100%; padding:10px; border:1px solid #0ea5e9; border-radius:4px; font-weight:bold; color:#0c4a6e;">
                    <option value="global">📊 Audit Global (Standard)</option>
                    <option value="decouchage">🌙 Détail Découchages (Lieu Exact)</option>
                    <option value="refill">⛽ Détail Carburant (Remplissages)</option>
                </select>
            </div>

            <div style="background:#f8f9fa; padding:15px; border-radius:6px; margin:15px 0;">
                <div style="display:grid; grid-template-columns:1fr 1fr; gap:15px;">
                    <div><label>Début</label><input type="datetime-local" id="reportStart" style="width:100%; padding:8px;" value="${toInput(yest)}"></div>
                    <div><label>Fin</label><input type="datetime-local" id="reportEnd" style="width:100%; padding:8px;" value="${toInput(now)}"></div>
                </div>
            </div>

            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:5px;">
                <span style="font-size:12px; font-weight:bold; color:#555;">Sélectionnez les camions :</span>
                <div style="display:flex; gap:5px;">
                    <button class="btn-secondary" style="font-size:11px; padding:4px 8px; cursor:pointer;" onclick="ui.toggleSelectReport(true)">
                        <i class="fa-solid fa-check-double"></i> Tout
                    </button>
                    <button class="btn-secondary" style="font-size:11px; padding:4px 8px; cursor:pointer;" onclick="ui.toggleSelectReport(false)">
                        <i class="fa-solid fa-square"></i> Rien
                    </button>
                </div>
            </div>

            <div style="height:250px; overflow-y:auto; border:1px solid #eee; padding:10px; margin-bottom:15px; background:#fafafa; border-radius:4px;">
                <div id="reportTruckList"></div>
            </div>

            <div style="text-align:right; gap:10px; display:flex; justify-content:flex-end;">
                <button class="btn-secondary" onclick="document.getElementById('reportModal').remove()">Annuler</button>
                <button class="btn-primary" onclick="ui.startBulkReport()">Générer Rapport</button>
            </div>
        </div>
    `;
    document.body.appendChild(div);

    const list = document.getElementById('reportTruckList');
    app.getAllTrucks().sort((a,b)=>a.name.localeCompare(b.name)).forEach(t => {
        const d = document.createElement('div');
        d.style.padding = "4px 0";
        d.innerHTML = `<label style="display:flex; align-items:center; cursor:pointer; font-size:13px;">
                          <input type="checkbox" class="report-check" value="${t.id}" style="margin-right:8px;"> 
                          ${t.name}
                       </label>`;
        list.appendChild(d);
    });
}  
  toggleSelectReport(state) {
      document.querySelectorAll('.report-check').forEach(c => c.checked = state);
  }

// REPLACE startBulkReport in ui.js

async startBulkReport() {
    const reportType = document.getElementById('reportTypeSelector').value;
    const startInput = document.getElementById('reportStart').value;
    const endInput = document.getElementById('reportEnd').value;
    
    if (!startInput || !endInput) { alert("Dates invalides."); return; }
    
    const startDate = startInput.replace('T', ' ') + ':00';
    const endDate = endInput.replace('T', ' ') + ':59';

    const selectedIds = Array.from(document.querySelectorAll('.report-check:checked')).map(c => c.value);
    if (selectedIds.length === 0) { alert("Sélectionnez au moins un camion."); return; }

    document.getElementById('reportModal').style.display = 'none';

    // ROUTER: Choose the right report
    if (reportType === 'decouchage') {
        this.generateDetailedDecouchageReport(selectedIds, startDate, endDate);
    } else if (reportType === 'refill') {
        this.generateDetailedRefillReport(selectedIds, startDate, endDate);
    } else {
        // Default Global Audit
        this.generateGlobalAudit(selectedIds, startDate, endDate);
    }
}  
 
// === NEW REPORT GENERATORS ===
// REPLACE THESE 3 FUNCTIONS IN ui.js TO FIX ALL CRASHES

// 1. GLOBAL AUDIT (Fixed: skips server errors)
async generateGlobalAudit(selectedIds, startDate, endDate) {
    const btn = document.querySelector('button[onclick="ui.openReportModal()"]');
    const originalText = btn ? btn.innerHTML : 'Rapport';
    if(btn) btn.innerHTML = `<i class="fa-solid fa-circle-notch fa-spin"></i> Audit Global...`;

    let csv = "Camion,Début,Fin,Distance (km),Conso (L),Conso/100,Remplissages,Ajouté (L),Temps Conduite,Conduite Nuit (00h-05h),Arrêts,Vitesse Max,Découchages (Nuits Dehors)\n";
    let count = 0;

    for (const id of selectedIds) {
        const truck = app.trucks.get(id);
        if(!truck) continue;
        count++;
        if(btn) btn.innerHTML = `<i class="fa-solid fa-circle-notch fa-spin"></i> Audit ${count}/${selectedIds.length}`;

        try {
            const res = await fetch(`${FLEET_CONFIG.API.baseUrl}/api/history?imei=${truck.id}&start=${startDate}&end=${endDate}`);
            
            // 🛑 STOP: If server errors (500), skip this truck
            if (!res.ok) {
                console.warn(`⚠️ Serveur Erreur ${res.status} pour ${truck.name}`);
                csv += `"${truck.name}","${startDate}","${endDate}",0,0,0,0,0,"Erreur Serveur","0","0",0,0\n`;
                continue; 
            }

            const json = await res.json();
            
            // Safety: Ensure we pass an Array
            let safeData = [];
            if (Array.isArray(json)) safeData = json;
            else if (json && Array.isArray(json.messages)) safeData = json.messages;

            const stats = this.analyzeTruckPrecise(safeData, truck);
            
            csv += `"${truck.name}","${startDate}","${endDate}",${stats.distance},${stats.consumption},${stats.avgConso},${stats.refillCount},${stats.refillVolume},"${stats.drivingDuration}","${stats.nightDuration}","${stats.stopDuration}","${stats.maxSpeed}",${stats.decouchageCount}\n`;
        } catch (e) {
            console.error(e);
            csv += `"${truck.name}","${startDate}","${endDate}",0,0,0,0,0,"Erreur Données","0","0",0,0\n`;
        }
    }

    if(btn) btn.innerHTML = originalText;
    this._downloadCSV(csv, `AUDIT_GLOBAL_${new Date().toISOString().slice(0,10)}.csv`);
}

// 2. DETAILED DECOUCHAGE (Unified with exact-location logic)
async generateDetailedDecouchageReport(selectedIds, startDate, endDate) {
    const btn = document.querySelector('button[onclick="ui.openReportModal()"]');
    const originalText = btn ? btn.innerHTML : 'Rapport';
    if (btn) btn.innerHTML = `<i class="fa-solid fa-moon fa-spin"></i> Analyse Nuits...`;

    let csv = "Date (Nuit du),Heure Detection,Camion,Statut,Lieu Exact,Coordonnées\n";
    const logs = await this.generateExactDecouchageDataset(selectedIds, startDate, endDate, ({ done, total, truckName }) => {
        if (btn) btn.innerHTML = `<i class="fa-solid fa-moon fa-spin"></i> Analyse ${done}/${total}<br><span style="font-size:11px;">${truckName}</span>`;
    });

    logs.forEach(log => {
        const detectedAt = new Date(log.detectedAt);
        const timeStr = detectedAt.toLocaleTimeString('fr-FR');
        const lat = log.locationAtMidnight?.lat ?? '';
        const lng = log.locationAtMidnight?.lng ?? '';
        csv += `"${log.date}","${timeStr}","${log.truckName}","DECOUCHAGE","${log.locationName || ''}","${lat},${lng}"\n`;
    });

    if (btn) btn.innerHTML = originalText;
    if (logs.length === 0) alert("Aucun découchage trouvé (Tous les camions étaient sur site).");
    else this._downloadCSV(csv, `RAPPORT_NUITS_${new Date().toISOString().slice(0,10)}.csv`);
}

// 3. DETAILED REFILL REPORT (STRONG AUDIT LOGIC)
async generateDetailedRefillReport(selectedIds, startDate, endDate) {
    const btn = document.querySelector('button[onclick="ui.openReportModal()"]');
    if(btn) btn.innerHTML = `<i class="fa-solid fa-calculator fa-spin"></i> Audit en cours...`;

    let csv = "Date,Heure,Camion,Volume Réel (L),Min (L),Max (L),Durée (min),Lieu,GoogleMaps\n";
    let eventsFound = 0;

    for (const id of selectedIds) {
        const truck = app.trucks.get(id);
        if(!truck) continue;
        const truckConfig = getTruckConfig(truck.id);

        try {
            const res = await fetch(`${FLEET_CONFIG.API.baseUrl}/api/history?imei=${truck.id}&start=${startDate}&end=${endDate}`);
            if (!res.ok) continue;

            const json = await res.json();
            let rawPoints = [];
            if (Array.isArray(json)) rawPoints = json;
            else if (json && Array.isArray(json.messages)) rawPoints = json.messages;

            // Sort by time
            let points = rawPoints.map(p => {
                const params = (p[6] && typeof p[6] === 'object') ? p[6] : ((p[7] && typeof p[7] === 'object') ? p[7] : {});
                return {
                    time: new Date(p[0]).getTime(),
                    lat: parseFloat(p[1]),
                    lng: parseFloat(p[2]),
                    speed: parseInt(p[5]),
                    liters: calculateFuelMetricsFromParams(params, truckConfig).liters
                };
            }).sort((a,b) => a.time - b.time);

            if (points.length === 0) continue;

            // --- THE AUDIT LOOP ---
            let isStopped = false;
            let minFuel = 9999;
            let maxFuel = -1;
            let stopStartTime = 0;
            let stopLat = 0, stopLng = 0;

            for (const p of points) {
                // We use Speed < 4 to treat it as a STOP (ignoring engine status)
                if (p.speed < 4) {
                    if (!isStopped) {
                        // Start of Window
                        isStopped = true;
                        minFuel = p.liters;
                        maxFuel = p.liters;
                        stopStartTime = p.time;
                        stopLat = p.lat;
                        stopLng = p.lng;
                    } else {
                        // Expand Window (Monitor All Time)
                        if (p.liters < minFuel) minFuel = p.liters;
                        if (p.liters > maxFuel) maxFuel = p.liters;
                    }
                } else {
                    // End of Window (Truck Moving)
                    if (isStopped) {
                        const durationMins = Math.round((p.time - stopStartTime) / 60000);
                        const realDiff = maxFuel - minFuel; // The Magic Calculation

	                        // Filter: ignore minor refills of 50L or below
	                        if (realDiff > 50) {
                            eventsFound++;
                            const address = await this.resolveLocationNameAsync(stopLat, stopLng);
                            const dateStr = new Date(stopStartTime).toLocaleDateString();
                            const timeStr = new Date(stopStartTime).toLocaleTimeString();
                            
                            csv += `"${dateStr}","${timeStr}","${truck.name}",${realDiff},${minFuel},${maxFuel},${durationMins},"${address}","${stopLat},${stopLng}"\n`;
                        }
                        
                        isStopped = false;
                    }
                }
            }

        } catch (e) { console.error("Report Error:", e); }
    }

    if(btn) btn.innerHTML = 'Rapport';
    if(eventsFound === 0) alert("Aucun remplissage > 50L détecté.");
    else this._downloadCSV(csv, `AUDIT_CARBURANT_${new Date().toISOString().slice(0,10)}.csv`);
}


// 4. HELPER: Async Location Resolver (Custom -> Cache -> API)
async resolveLocationNameAsync(lat, lng) {
    if(!lat || !lng) return "Inconnu";

    // A. Check Custom Sites (Instant)
    if (FLEET_CONFIG.CUSTOM_LOCATIONS) {
        for (const loc of FLEET_CONFIG.CUSTOM_LOCATIONS) {
            const dist = this.getDistKm(lat, lng, loc.lat, loc.lng);
            if (dist <= (loc.radius ? loc.radius/1000 : 0.5)) return `🏢 ${loc.name}`;
        }
    }

    // B. Check Cache (Instant)
    if (typeof geocodeService !== 'undefined') {
        const cached = geocodeService.checkCacheInstant(lat, lng);
        if (cached) return `${cached.city}, ${cached.wilaya}`;
    }

    // C. Live Fetch (Slow but Exact)
    try {
        const res = await geocodeService.reverseGeocode(lat, lng);
        return `${res.formatted || res.city}`;
    } catch (e) {
        return `${lat.toFixed(4)}, ${lng.toFixed(4)}`; // Fallback
    }
}

// 5. HELPER: Distance
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

          const address = await this.resolveLocationNameAsync(p.lat, p.lng);
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
  openHistoryModal(imei, name) {
      if (document.getElementById('historyModal')) document.getElementById('historyModal').remove();

      // Defaults: Today 00:00 to Today 23:59
      const now = new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0);
      const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59);
      
      // Helper to format for input type="datetime-local" (YYYY-MM-DDTHH:MM)
      const toInput = (d) => {
          const pad = (n) => n.toString().padStart(2, '0');
          return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
      };

      const div = document.createElement('div');
      div.id = 'historyModal';
      div.className = 'modal-overlay';
      div.style.display = 'flex';
      
      div.innerHTML = `
          <div class="modal-box" style="width: 400px; max-width:90vw; background:white; padding:20px; border-radius:12px; box-shadow:0 10px 30px rgba(0,0,0,0.4);">
              <h3 style="margin-top:0; color:var(--teal); text-align:center;">
                  <i class="fa-solid fa-clock-rotate-left"></i> Machine à Remonter le Temps
              </h3>
              <p style="text-align:center; color:#666; font-size:14px; margin-bottom:20px;">
                  Camion: <strong>${name}</strong>
              </p>
              
              <div style="background:#f8f9fa; padding:15px; border-radius:8px; border:1px solid #eee;">
                  <div style="margin-bottom:15px;">
                      <label style="font-size:12px; font-weight:bold; color:#555;">Début (Date & Heure)</label>
                      <input type="datetime-local" id="histStart" style="width:100%; padding:10px; border:1px solid #ddd; border-radius:6px; margin-top:5px;" value="${toInput(todayStart)}">
                  </div>
                  <div>
                      <label style="font-size:12px; font-weight:bold; color:#555;">Fin (Date & Heure)</label>
                      <input type="datetime-local" id="histEnd" style="width:100%; padding:10px; border:1px solid #ddd; border-radius:6px; margin-top:5px;" value="${toInput(todayEnd)}">
                  </div>
              </div>

              <div style="text-align:center; margin-top:20px; display:flex; gap:10px; justify-content:center;">
                  <button class="btn-secondary" onclick="document.getElementById('historyModal').remove()">Annuler</button>
                  <button class="btn-primary" onclick="ui.submitHistory('${imei}')" style="background:var(--teal); border:none; padding:10px 20px;">
                      <i class="fa-solid fa-play"></i> Lancer Lecture
                  </button>
              </div>
          </div>
      `;
      document.body.appendChild(div);
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
              alert("⚠️ Aucun historique trouvé pour cette période.");
              if(btn) btn.innerHTML = originalText;
              return;
          }

          // 3. Normalize & Sort Data
          const points = rawPoints.map(p => {
              if (Array.isArray(p)) {
                  return { 
                      time: new Date(p[0]).getTime(), // Convert to Timestamp Number
                      lat: parseFloat(p[1]), 
                      lng: parseFloat(p[2]), 
                      speed: parseInt(p[5]), 
                      params: p[6] || {} 
                  };
              }
              return p;
          }).sort((a,b) => a.time - b.time);

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

          if(window.AlgeriaMap && window.AlgeriaMap.drawRoute) {
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
              toast.innerHTML = `✅ Chargé: ${points.length} points | ${totalDist.toFixed(1)} km | 🌙 ${exactDecouchages.length}`;
              document.getElementById('map-wrapper').appendChild(toast);
              setTimeout(()=>toast.remove(), 3000);
          }

      } catch (e) {
          console.error("History Error:", e);
          alert("Erreur lors de l'analyse visuelle.");
      } finally {
          if(btn) btn.innerHTML = originalText;
      }
  }
  
  // --- SUPER EXPORT FUNCTION ---
  async generateSuperReportCSV() {
      if(!app || !app.trucks) return;

      // ⚠️ AUTO-FETCH: Download Decouchage data if it's not loaded yet
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
          alert('⚠️ Sélectionnez un fichier JSON de sauvegarde.');
          return;
      }
      
      const file = this.restoreFileInput.files[0];
      if (!confirm(`⚠️ ATTENTION : Cela va remplacer/mettre à jour votre base de données avec le fichier "${file.name}". Continuer ?`)) {
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
                  alert("✅ Restauration réussie ! La page va s'actualiser.");
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
  // ✅ ALERTS SYSTEM (Overspeed + Route Deviation)
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

      // ⚠️ AUTO-FETCH: Download Decouchage data if it's not loaded yet
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
          alert('⚠️ Sélectionnez un fichier JSON de sauvegarde.');
          return;
      }
      
      const file = this.restoreFileInput.files[0];
      if (!confirm(`⚠️ ATTENTION : Cela va remplacer/mettre à jour votre base de données avec le fichier "${file.name}". Continuer ?`)) {
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
                  alert("✅ Restauration réussie ! La page va s'actualiser.");
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
  // ✅ ALERTS SYSTEM (Overspeed + Route Deviation)
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
    alert(`✅ Limite de vitesse sauvegardée: ${val} km/h`);
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
          <div style="font-size:14px; font-weight:700;">✅ Aucun excès de vitesse détecté</div>
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
        ? '<span class="maint-status-badge badge-en-cours">⚠️ EXCESSIF</span>'
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
            <button class="btn-secondary" onclick="ui.viewOnMap(${t.coordinates?.lat || 0}, ${t.coordinates?.lng || 0})" style="font-size:11px; padding:4px 10px;">
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
        <div style="grid-column:1/-1; text-align:center; padding:30px; color:#94a3b8;">
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
          <div style="font-size:14px; font-weight:700;">✅ Tous les camions en mouvement sont dans les zones habituelles</div>
          <div style="font-size:12px; color:#64748b; margin-top:4px;">${customLocs.length} zones surveillées • Seuil: ${maxDistanceKm} km</div>
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
            <div style="font-size:16px; font-weight:800; color:#0f172a;">${truck.name}</div>
            <span class="maint-status-badge" style="background:#f5f3ff; color:#7c3aed; border:1px solid #ddd6fe;">🔀 DÉVIATION</span>
          </div>
          <div style="display:grid; grid-template-columns:1fr 1fr; gap:6px; font-size:12px;">
            <div><i class="fa-solid fa-location-dot" style="color:#7c3aed; width:16px;"></i> ${locText}</div>
            <div><i class="fa-solid fa-gauge-high" style="color:#64748b; width:16px;"></i> ${truck.speed} km/h</div>
            <div><i class="fa-solid fa-arrows-left-right" style="color:#dc2626; width:16px;"></i> <strong style="color:#dc2626;">${nearestDist} km</strong> de la zone la plus proche</div>
            <div><i class="fa-solid fa-map-pin" style="color:#64748b; width:16px;"></i> Zone: ${nearestZone?.name || 'N/A'}</div>
          </div>
          <div style="margin-top:8px;">
            <button class="btn-secondary" onclick="ui.viewOnMap(${truck.coordinates?.lat || 0}, ${truck.coordinates?.lng || 0})" style="font-size:11px; padding:4px 10px;">
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
  // ✅ SETTINGS: Truck Metadata Editor
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
        alert('✅ Fiche véhicule enregistrée !');
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
      container.innerHTML = '<div style="text-align:center; color:#94a3b8; padding:16px; font-size:12px;">Aucune fiche véhicule renseignée. Sélectionnez un camion et remplissez les champs.</div>';
      return;
    }
    let html = '<table style="width:100%; border-collapse:collapse; font-size:12px; background:white; border-radius:8px; overflow:hidden;">';
    html += '<thead><tr style="background:#f8fafc; color:#475569; border-bottom:2px solid #e2e8f0;"><th style="padding:8px; text-align:left;">Camion</th><th style="padding:8px;">Immatriculation</th><th style="padding:8px;">Châssis</th><th style="padding:8px;">Carte Naftal</th></tr></thead><tbody>';
    entries.forEach((d, i) => {
      const bg = i % 2 === 0 ? '#fff' : '#f8fafc';
      html += `<tr style="background:${bg}; border-bottom:1px solid #f1f5f9;">
        <td style="padding:8px; font-weight:700;">${d.truckName || d.deviceId}</td>
        <td style="padding:8px; text-align:center;">${d.immatriculation ? `<span class="truck-meta-tag imm">${d.immatriculation}</span>` : '<em style="color:#ccc;">—</em>'}</td>
        <td style="padding:8px; text-align:center;">${d.chassisNumber ? `<span class="truck-meta-tag chassis">${d.chassisNumber}</span>` : '<em style="color:#ccc;">—</em>'}</td>
        <td style="padding:8px; text-align:center;">${d.carteNaftal ? `<span class="truck-meta-tag naftal">${d.carteNaftal}</span>` : '<em style="color:#ccc;">—</em>'}</td>
      </tr>`;
    });
    html += '</tbody></table>';
    container.innerHTML = html;
  }

  // ============================================================
  // ✅ NAFTAL DASHBOARD PANEL
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
      const statusDot = truck.speed >= 1 ? '#22c55e' : '#94a3b8';
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
  // ✅ NAFTAL PER-CARD REPORT
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
        container.innerHTML = '<div style="text-align:center; padding:30px; color:#94a3b8;"><i class="fa-solid fa-credit-card" style="font-size:36px; opacity:0.3; display:block; margin-bottom:10px;"></i>Aucun remplissage externe trouvé pour cette période.</div>';
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
          <div style="background:white; border:1px solid #e9d5ff; border-left:5px solid ${isNoCard ? '#f59e0b' : '#7e22ce'}; border-radius:10px; overflow:hidden;">
            <div style="display:flex; justify-content:space-between; align-items:center; padding:14px 16px; background:#fdf4ff; cursor:pointer;" onclick="this.nextElementSibling.style.display=this.nextElementSibling.style.display==='none'?'block':'none'">
              <div>
                <div style="font-size:15px; font-weight:900; color:${isNoCard ? '#b45309' : '#581c87'};">
                  <i class="fa-solid fa-credit-card"></i>&nbsp; ${isNoCard ? '⚠️ Sans Carte Naftal' : `N° ${card.cardNum}`}
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
  // ✅ ITINERARY ENGINE
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
    container.innerHTML = '<div style="text-align:center; padding:30px; color:#1d4ed8;"><i class="fa-solid fa-spinner fa-spin" style="font-size:32px;"></i><div style="margin-top:12px; font-weight:700;">Analyse GPS en cours — accumulation cumulative dans MongoDB...</div><div style="font-size:11px; color:#64748b; margin-top:6px;">Chaque analyse ajoute des données sans effacer les précédentes</div></div>';

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
        console.log(`✅ Itinerary: ${saveData.updated} routes updated in MongoDB`);
      } catch (e) { console.warn('Itinerary save failed:', e); }
    }

    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-magnifying-glass-chart"></i> Analyser la Flotte'; }

    // Show summary toast
    const toast = document.createElement('div');
    toast.style.cssText = 'position:fixed; top:80px; right:20px; z-index:99999; background:#0f172a; color:#fff; padding:12px 20px; border-radius:10px; font-size:13px; font-weight:700; box-shadow:0 8px 24px rgba(0,0,0,0.3); border-left:4px solid #22c55e; animation:slideDown 0.3s ease;';
    toast.innerHTML = `✅ Analyse terminée — ${segmentsToSave.length} routes enregistrées · ${totalStopsFound} arrêts détectés`;
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
                this.resolveLocationNameAsync(first.lat, first.lng),
                this.resolveLocationNameAsync(last.lat, last.lng)
              ]);
              const cleanA = nameA.replace(/^[🏢📍]\s*/, '').split(',')[0].trim();
              const cleanB = nameB.replace(/^[🏢📍]\s*/, '').split(',')[0].trim();
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
        <div style="text-align:center; padding:40px; color:#94a3b8;">
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
          <div style="font-size:10px; color:#15803d; font-weight:700; text-transform:uppercase;">✅ Validées</div>
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
        
        html += `<div style="background:white; border:1.5px solid #c7d2fe; border-left:5px solid #4f46e5; border-radius:12px; padding:16px; box-shadow:0 2px 8px rgba(79,70,229,0.08);">
          <div style="display:flex; justify-content:space-between; align-items:start; margin-bottom:10px;">
            <div style="flex:1;">
              <div style="font-size:15px; font-weight:900; color:#0f172a; margin-bottom:3px;">
                <i class="fa-solid fa-route" style="color:#4f46e5;"></i>
                ${nameA} <span style="color:#4f46e5; font-weight:700;">→</span> ${nameB}
              </div>
              <div style="font-size:10px; color:#64748b;">
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

        html += `<div style="background:white; border:1.5px solid #bbf7d0; border-left:5px solid #16a34a; border-radius:12px; padding:16px; box-shadow:0 2px 8px rgba(22,163,74,0.08);">
          <div style="display:flex; justify-content:space-between; align-items:start; margin-bottom:10px;">
            <div style="flex:1;">
              <div style="font-size:15px; font-weight:900; color:#0f172a; margin-bottom:3px;">
                <i class="fa-solid fa-route" style="color:#16a34a;"></i>
                ${nameA} <span style="color:#16a34a; font-weight:700;">→</span> ${nameB}
              </div>
              <div style="font-size:10px; color:#64748b;">
                ${doc.waypoints.length} waypoints · ${doc.totalObservations||0} observations · ${bestMonthStr}
              </div>
            </div>
            <div style="display:flex; flex-direction:column; align-items:flex-end; gap:4px;">
              <span style="background:#dcfce7; color:#166534; padding:4px 12px; border-radius:20px; font-size:10px; font-weight:800;">✅ VALIDÉ</span>
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
            <span style="margin-left:auto; font-size:10px; color:#94a3b8;">
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
      this.resolveLocationNameAsync(first.lat, first.lng),
      this.resolveLocationNameAsync(last.lat, last.lng)
    ]);
    await fetch(`${FLEET_CONFIG.API.baseUrl}/api/itinerary/set-names`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: doc.key, nameStart: nameA.replace('🏢 ',''), nameEnd: nameB.replace('🏢 ','') })
    });
    await this.loadItineraryFromDB(parseInt(document.getElementById('itineraryMinTrucks')?.value)||4);
  }

  // ✅ Manual rename itinerary
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

  // ✅ Delete single itinerary
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

  // ✅ Auto-fill truck info in maintenance modal from DB cache
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
          <div style="background:white; padding:6px 8px; border-radius:6px; border:1px solid #fde68a;">
            <div style="color:#92400e; font-weight:600; font-size:9px;">IMMATRICULATION</div>
            <div style="font-weight:800; color:#0f172a;">${imm || '<em style="color:#ccc;">—</em>'}</div>
          </div>
          <div style="background:white; padding:6px 8px; border-radius:6px; border:1px solid #fde68a;">
            <div style="color:#92400e; font-weight:600; font-size:9px;">N° CHÂSSIS</div>
            <div style="font-weight:800; color:#0f172a; font-family:monospace; font-size:10px;">${chassis || '<em style="color:#ccc;">—</em>'}</div>
          </div>
          <div style="background:${naftal ? 'linear-gradient(135deg,#581c87,#7e22ce)' : 'white'}; padding:6px 8px; border-radius:6px; border:1px solid ${naftal ? '#7e22ce' : '#fde68a'};">
            <div style="color:${naftal ? '#ddd6fe' : '#92400e'}; font-weight:600; font-size:9px;">CARTE NAFTAL</div>
            <div style="font-weight:900; color:${naftal ? '#fff' : '#ccc'}; letter-spacing:1px;">${naftal || '—'}</div>
          </div>
        </div>
        <div style="display:grid; grid-template-columns:1fr 1fr 1fr 1fr; gap:6px; font-size:11px; margin-top:6px;">
          <div style="background:white; padding:5px 8px; border-radius:6px; border:1px solid #e5e7eb;">
            <div style="color:#64748b; font-size:9px;">COMPTEUR</div>
            <div style="font-weight:700;">${odo}</div>
          </div>
          <div style="background:white; padding:5px 8px; border-radius:6px; border:1px solid #e5e7eb;">
            <div style="color:#64748b; font-size:9px;">CARBURANT</div>
            <div style="font-weight:700;">${fuel}</div>
          </div>
          <div style="background:white; padding:5px 8px; border-radius:6px; border:1px solid #e5e7eb;">
            <div style="color:#64748b; font-size:9px;">POSITION</div>
            <div style="font-weight:600; font-size:10px;">${loc}</div>
          </div>
          <div style="background:white; padding:5px 8px; border-radius:6px; border:1px solid #e5e7eb;">
            <div style="color:#64748b; font-size:9px;">VITESSE</div>
            <div style="font-weight:700;">${speed}</div>
          </div>
        </div>
        ${vidangeInfo ? `<div style="margin-top:6px; font-size:11px;">${vidangeInfo}</div>` : ''}
        <div style="margin-top:6px; font-size:10px; color:#64748b; border-top:1px solid #fde68a; padding-top:5px;">
          <i class="fa-solid fa-clock-rotate-left"></i> Dernière maintenance: <strong>${lastMaintText}</strong>
        </div>
      </div>`;
  }

  async clearItineraryDB() {
    if (!confirm('⚠️ Supprimer TOUS les itinéraires enregistrés en MongoDB ?')) return;
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
      name: `📍 ${l.name} (${l.wilaya || ''})`,
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
    if (textInput) textInput.value = name.replace(/^📍 /, '');
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
      document.getElementById('manualItinStatus').innerHTML = '⚠️ Saisissez et sélectionnez un départ ET une arrivée dans les listes déroulantes.';
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

      statusEl.innerHTML = `✅ Route tracée — ${distKm} km en ${durText} (${coords.length.toLocaleString()} points de précision)`;
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
        showToast(`✅ Itinéraire "${routeName}" enregistré — ${distKm} km, ${waypoints.length.toLocaleString()} points de précision`, 'success', 5000);
      } else {
        alert(`✅ Itinéraire "${routeName}" enregistré!\n📏 ${distKm} km\n📍 ${waypoints.length.toLocaleString()} points de précision routière`);
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
        paint: { 'text-color': '#1e293b', 'text-halo-color': '#fff', 'text-halo-width': 2 }
      });
      this.itineraryMapLayerIds.push(stopSrc, stopSrc + '_circles', stopSrc + '_labels');

      // Fit to route bounds
      const lngs = coords.map(c => c[0]);
      const lats = coords.map(c => c[1]);
      map.fitBounds([[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]], { padding: 80, duration: 1400 });

      if (window.showToast) showToast(`✅ ${nameA} → ${nameB} | 📏 ${distKm} km | ⏱ ${durText} | 🚛 ${(r.allTrucks||[]).length} camions`, 'success', 6000);

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
        const icon = loc.type === 'client' ? '🏢' : loc.type === 'maintenance' ? '🔧' : loc.type === 'site' ? '🏭' : '📍';
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
          <div style="background:white; padding:8px; border-radius:8px; text-align:center; border:1px solid #fde68a;">
            <div style="font-size:20px; font-weight:900; color:#92400e;">${logs.length}</div>
            <div style="font-size:9px; color:#b45309; font-weight:700;">TOTAL</div>
          </div>
          <div style="background:white; padding:8px; border-radius:8px; text-align:center; border:1px solid #fde68a;">
            <div style="font-size:20px; font-weight:900; color:#16a34a;">${thisMonth}</div>
            <div style="font-size:9px; color:#15803d; font-weight:700;">CE MOIS</div>
          </div>
          <div style="background:white; padding:8px; border-radius:8px; text-align:center; border:1px solid #fde68a;">
            <div style="font-size:20px; font-weight:900; color:#dc2626;">${urgentCount}</div>
            <div style="font-size:9px; color:#ef4444; font-weight:700;">URGENTES</div>
          </div>
          <div style="background:white; padding:8px; border-radius:8px; text-align:center; border:1px solid #fde68a;">
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
    const truckF = document.getElementById('maintHistoryTruckFilter')?.value || '';
    const typeF = document.getElementById('maintHistoryTypeFilter')?.value || '';
    const dateStart = document.getElementById('maintHistoryDateStart')?.value || '';
    const dateEnd = document.getElementById('maintHistoryDateEnd')?.value || '';
    const prioF = document.getElementById('maintHistoryPrioFilter')?.value || '';
    
    let filtered = [...(this.allMaintenanceLogs || [])];
    if (truckF) filtered = filtered.filter(l => l.truckName === truckF);
    if (typeF) filtered = filtered.filter(l => l.type === typeF);
    if (prioF) filtered = filtered.filter(l => l.priority === prioF);
    if (dateStart) filtered = filtered.filter(l => new Date(l.date) >= new Date(dateStart));
    if (dateEnd) filtered = filtered.filter(l => new Date(l.date) <= new Date(dateEnd + 'T23:59:59'));

    // Re-render just the list portion
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
  // ✅ MAINTENANCE FOLLOW-UP SYSTEM (NEW)
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
      this.maintTruckSearchResults.innerHTML = '<div style="padding:12px; color:#94a3b8; text-align:center; font-size:12px;">Aucun résultat</div>';
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
            <div style="font-weight:700; color:#0f172a;">${t.name}</div>
            <div style="display:flex; gap:4px; margin-top:3px; flex-wrap:wrap;">${tags.join('')}</div>
          </div>
          <div style="text-align:right;">
            <div style="font-size:11px; color:#64748b;">${t.odometer.toLocaleString()} km</div>
            <div style="font-size:10px; color:${t.speed > 0 ? '#16a34a' : '#94a3b8'};">${t.speed > 0 ? '🟢 En route' : '🔴 Arrêt'}</div>
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
          <div class="truck-info-row"><span class="truck-info-label"><i class="fa-solid fa-hashtag"></i> Châssis</span><span class="truck-info-value">${db.chassisNumber || '<em style="color:#94a3b8;">Non renseigné</em>'}</span></div>
          <div class="truck-info-row"><span class="truck-info-label"><i class="fa-solid fa-id-badge"></i> Immatriculation</span><span class="truck-info-value">${db.immatriculation || '<em style="color:#94a3b8;">Non renseigné</em>'}</span></div>
          <div class="truck-info-row"><span class="truck-info-label"><i class="fa-solid fa-credit-card"></i> Carte Naftal</span><span class="truck-info-value">${db.carteNaftal || '<em style="color:#94a3b8;">Non renseigné</em>'}</span></div>
          <div class="truck-info-row"><span class="truck-info-label"><i class="fa-solid fa-oil-can"></i> Vidange</span><span class="truck-info-value" style="color:${truck.vidange.alert ? '#ef4444' : '#22c55e'};">${truck.vidange.alert ? '⚠️ ' + truck.vidange.kmUntilNext + ' km' : '✅ OK (' + truck.vidange.kmUntilNext + ' km)'}</span></div>
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
        alert('✅ Fiche véhicule sauvegardée !');
        await this.loadTruckDbCache();
        this.renderTruckInfoPanel(this.selectedMaintTruckId);
      } else { alert('Erreur serveur.'); }
    } catch (e) { alert('Erreur connexion.'); }
  }

  renderActiveOrdersDashboard() {
    if (!this.activeOrdersDashboard) return;
    if (!this.activeMaintenanceOrders.length) {
      this.activeOrdersDashboard.innerHTML = `
        <div style="grid-column: 1/-1; text-align:center; padding:40px; color:#94a3b8;">
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
              <div style="font-size:16px; font-weight:800; color:#0f172a;">${order.truckName}</div>
              <div style="display:flex; gap:4px; margin-top:3px; flex-wrap:wrap;">${metaTags.join('')}</div>
            </div>
            ${statusBadge}
          </div>
          <div style="display:grid; grid-template-columns:1fr 1fr; gap:6px; font-size:12px; margin-top:10px;">
            <div><i class="fa-solid fa-wrench" style="color:#f59e0b; width:16px;"></i> <strong>${order.type}</strong></div>
            <div><i class="fa-solid fa-clock" style="color:#64748b; width:16px;"></i> ${durationText}</div>
            <div><i class="fa-solid fa-map-pin" style="color:#ef4444; width:16px;"></i> ${order.location || 'N/A'}</div>
            <div><i class="fa-solid fa-road" style="color:#3b82f6; width:16px;"></i> ${(order.odometer || 0).toLocaleString()} km</div>
            ${order.technician ? `<div><i class="fa-solid fa-user-gear" style="color:#7e22ce; width:16px;"></i> ${order.technician}</div>` : ''}
            ${order.cost ? `<div><i class="fa-solid fa-coins" style="color:#f59e0b; width:16px;"></i> ${order.cost.toLocaleString()} DA</div>` : ''}
          </div>
          ${order.note ? `<div style="font-size:11px; color:#64748b; margin-top:8px; font-style:italic; padding:6px; background:#f8fafc; border-radius:4px;">"${order.note}"</div>` : ''}
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
        alert('✅ Ordre clôturé !');
        this.refreshMaintenanceFollowup();
        this.fetchAndRenderMaintenance();
      } else { alert('Erreur serveur.'); }
    } catch (e) { alert('Erreur connexion.'); }
  }

  async cancelMaintenanceOrder(id) {
    if (!confirm('⚠️ ANNULER cet ordre de maintenance ?\n\nCette action est irréversible. L\'ordre sera marqué comme annulé.')) return;
    try {
      const res = await fetch(`${FLEET_CONFIG.API.baseUrl}/api/maintenance/${id}/cancel`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }
      });
      if (res.ok) {
        alert('✅ Ordre annulé avec succès.');
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
        alert('✅ Articles par défaut créés ! (Vidange, Freins, Pneus, Filtres, Batterie, Embrayage, Clim, Suspension, Divers)');
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
      container.innerHTML = `<div style="text-align:center;padding:30px;color:#94a3b8;font-size:13px;">
        <i class="fa-solid fa-oil-can" style="font-size:32px;display:block;margin-bottom:10px;opacity:0.3;"></i>
        Aucun forfait défini. Utilisez les boutons ci-dessus pour en ajouter.</div>`;
      return;
    }
    let html = '<div style="display:grid;gap:10px;">';
    forfaits.forEach((f, i) => {
      html += `<div style="background:white;border:1px solid #fed7aa;border-left:4px solid #f59e0b;border-radius:10px;padding:14px;display:flex;justify-content:space-between;align-items:center;">
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
        if (window.showToast) showToast(`✅ Forfait "${name}" ajouté au catalogue`, 'success');
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
    if (!code || !name) { if (window.showToast) showToast('⚠️ Code et Nom requis', 'warning'); return; }
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
    if (window.showToast) showToast('✅ Intervalles d\'entretien sauvegardés', 'success');
  }

  _renderArticlesCatalog() {
    const container = document.getElementById('articlesCatalogContainer');
    if (!container) return;
    const articles = this._maintenanceArticles || [];
    if (articles.length === 0) {
      container.innerHTML = '<div style="text-align:center;padding:30px;color:#94a3b8;"><i class="fa-solid fa-box-open" style="font-size:36px;display:block;margin-bottom:10px;opacity:0.4;"></i><div style="font-size:13px;">Aucun article configuré. Cliquez "Créer Articles Par Défaut" pour commencer.</div></div>';
      return;
    }
    let html = '<table style="width:100%;border-collapse:collapse;font-size:12px;"><thead><tr style="background:#f8fafc;border-bottom:2px solid #e2e8f0;color:#475569;"><th style="padding:8px;text-align:left;">Code</th><th style="padding:8px;text-align:left;">Nom</th><th style="padding:8px;">Catégorie</th><th style="padding:8px;">Prix (DA)</th><th style="padding:8px;">Pièces</th><th style="padding:8px;">Actions</th></tr></thead><tbody>';
    articles.forEach((art, i) => {
      const bg = i % 2 === 0 ? '#fff' : '#fdf4ff';
      const partsCount = (art.components || []).length;
      html += `<tr style="background:${bg};border-bottom:1px solid #f1f5f9;">
        <td style="padding:8px;font-weight:700;font-family:monospace;color:#7e22ce;">${art.code}</td>
        <td style="padding:8px;font-weight:700;">${art.name}</td>
        <td style="padding:8px;text-align:center;"><span style="background:#f5f3ff;color:#7e22ce;padding:2px 8px;border-radius:10px;font-size:10px;font-weight:600;">${art.category}</span></td>
        <td style="padding:8px;text-align:center;font-weight:700;color:#059669;">${(art.defaultPrice || 0).toLocaleString()}</td>
        <td style="padding:8px;text-align:center;">${partsCount} pièce${partsCount > 1 ? 's' : ''}</td>
        <td style="padding:8px;text-align:center;"><button onclick="ui.deleteArticle('${art.id}')" style="background:#fef2f2;color:#dc2626;border:1px solid #fecaca;border-radius:6px;padding:3px 8px;font-size:10px;cursor:pointer;font-weight:600;"><i class="fa-solid fa-trash"></i></button></td>
      </tr>`;
    });
    html += '</tbody></table>';
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
        alert('✅ Article enregistré !');
        ['artCode','artName','artCategory','artDescription','artPrice','artLabor','artDuration'].forEach(id => {
          const el = document.getElementById(id); if (el) el.value = '';
        });
        await this.loadMaintenanceArticles();
        this._renderArticlesCatalog();
      } else { alert('Erreur serveur.'); }
    } catch (e) { alert('Erreur: ' + e.message); }
  }

  openNewMaintenanceOrder(truckId = null) {
    // Populate the location dropdown from customLocations
    const locSelect = document.getElementById('modalMaintLocation');
    if (locSelect) {
      locSelect.innerHTML = '<option value="Atelier Douroub">🏭 Atelier Douroub</option>';
      const locs = FLEET_CONFIG.CUSTOM_LOCATIONS || [];
      locs.filter(l => l.type === 'maintenance').forEach(l => {
        locSelect.innerHTML += `<option value="${l.name}">🔧 ${l.name}</option>`;
      });
      locSelect.innerHTML += '<option value="Entrée Manuelle">📍 Entrée Manuelle</option>';
    }

    // Load articles catalog and populate dropdown
    this.loadMaintenanceArticles().then(() => this._populateArticleDropdown());

    this.openMaintenanceModal(null);

    // Pre-select truck if provided
    if (truckId) {
      const select = document.getElementById('modalMaintTruck');
      if (select) {
        for (let i = 0; i < select.options.length; i++) {
          if (select.options[i].dataset.id === truckId) {
            select.selectedIndex = i;
            document.getElementById('modalMaintOdo').value = select.options[i].dataset.odo;
            break;
          }
        }
      }
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
        if (window.showToast) showToast('✅ Document enregistré !', 'success');
        else alert('✅ Document enregistré !');
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









