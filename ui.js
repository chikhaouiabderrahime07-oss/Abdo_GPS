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
      this.fetchAndRenderRefuels();
      this.fetchAndRenderMaintenance(); 
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
    this.modalMaintSubmitBtn = document.querySelector('#maintenanceModal .btn-primary'); 
    this.modalMaintTitle = document.querySelector('#maintenanceModal h3');

    // GLOBAL Settings
    this.defaultFuelCapacity = document.getElementById('defaultFuelCapacity');
    this.defaultFuelConsumption = document.getElementById('defaultFuelConsumption');
    this.defaultFuelPrice = document.getElementById('defaultFuelPrice');
    this.defaultSecurityMargin = document.getElementById('defaultSecurityMargin');
    this.defaultFuelThreshold = document.getElementById('defaultFuelThreshold');
    this.defaultCriticalLevel = document.getElementById('defaultCriticalLevel');
    this.defaultVidangeMilestones = document.getElementById('defaultVidangeMilestones');
    this.defaultVidangeAlert = document.getElementById('defaultVidangeAlert');
    this.defaultCalibration = document.getElementById('defaultCalibration');
    
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

          // ✅ NEW: vidange overrides (silence alert after confirmed vidange)
          if (data.vidangeOverrides) FLEET_CONFIG.VIDANGE_OVERRIDES = data.vidangeOverrides;
          else if (!FLEET_CONFIG.VIDANGE_OVERRIDES) FLEET_CONFIG.VIDANGE_OVERRIDES = {};

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
          fleetRules: FLEET_CONFIG.FLEET_RULES, // SAVE RULES ARRAY
          customLocations: FLEET_CONFIG.CUSTOM_LOCATIONS,
          pollInterval: FLEET_CONFIG.UI.pollInterval,
          maintenanceRules: FLEET_CONFIG.MAINTENANCE_RULES,
          apiKeys: FLEET_CONFIG.GEOAPIFY_API_KEYS
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
        this.updateDashboard(); 
    });
    
    // REFUEL EVENTS
    if (this.applyRefuelFiltersBtn) {
        this.applyRefuelFiltersBtn.addEventListener('click', () => {
            this.refuelCurrentPage = 1; 
            this.renderFilteredRefuels();
        });
    }
    if (this.exportRefuelsBtn) {
        this.exportRefuelsBtn.addEventListener('click', () => this.exportRefuelsCSV());
    }
    if (this.refuelSortSelect) {
        this.refuelSortSelect.addEventListener('change', (e) => {
            this.refuelSortOrder = e.target.value;
            this.renderFilteredRefuels();
        });
    }

    // DECOUCHAGE EVENTS (NEW)
    if (this.applyDecouchageFiltersBtn) {
        this.applyDecouchageFiltersBtn.addEventListener('click', () => this.renderDecouchageList());
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
      if (type === 'fuel') {
          this.btnReportFuel.classList.add('active');
          this.btnReportDecouchage.classList.remove('active');
          this.reportFuelSection.style.display = 'block';
          this.reportDecouchageSection.style.display = 'none';
          this.fetchAndRenderRefuels();
      } else {
          this.btnReportFuel.classList.remove('active');
          this.btnReportDecouchage.classList.add('active');
          this.reportFuelSection.style.display = 'none';
          this.reportDecouchageSection.style.display = 'block';
          this.fetchAndRenderDecouchages();
      }
  }

  // =========================================================
  // 🌙 DÉCOUCHAGE LOGIC (NEW)
  // =========================================================
  async fetchAndRenderDecouchages() {
      if(!this.decouchageHistoryContainer) return;
      this.decouchageHistoryContainer.innerHTML = '<div style="color:#666; text-align:center; padding:20px;"><i class="fa-solid fa-sync fa-spin"></i> Chargement des découchages...</div>';

      try {
          const response = await fetch(`${FLEET_CONFIG.API.baseUrl}/api/decouchages`);
          if (!response.ok) throw new Error("API Error");
          
          this.allDecouchageLogs = await response.json();
          this.renderDecouchageList();
      } catch (e) {
          console.warn("Decouchage fetch error:", e);
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
        // 🔧 FIX: use server-provided locationName directly (no geo-lookup needed)
        const resolvedName = log.locationName || `${log.locationAtMidnight?.lat?.toFixed(4) || '?'}, ${log.locationAtMidnight?.lng?.toFixed(4) || '?'}`;
        const detectedTime = log.detectedAt ? new Date(log.detectedAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '00:00';
        const dateStr = new Date(log.date).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
        html += `<div style="background:white; border:1px solid #e2e8f0; border-left: 5px solid #dc2626; padding:15px; border-radius:8px; display:flex; justify-content:space-between; align-items:center;"><div style="flex:1;"><div style="font-weight:bold; color:#1e293b;">${log.truckName}</div><div style="font-size:12px; color:#64748b;">Nuit du <strong>${dateStr}</strong> · Détecté à ${detectedTime}</div></div><div style="flex:2; text-align:center;"><div onclick="ui.viewOnMap(${log.locationAtMidnight?.lat || 0}, ${log.locationAtMidnight?.lng || 0})" style="font-size:12px; color:#1e40af; background:#eff6ff; padding:6px 12px; border-radius:6px; cursor:pointer; transition:all 0.2s;" onmouseover="this.style.background='#dbeafe'" onmouseout="this.style.background='#eff6ff'"><i class="fa-solid fa-map-pin"></i> ${resolvedName} <i class="fa-solid fa-arrow-up-right-from-square" style="font-size:10px; opacity:0.6; margin-left:4px;"></i></div><div style="font-size:11px; color:#64748b;">à ${distKm} km du site</div></div><div style="flex:0.5; text-align:right;"><span style="background:#fff7ed; color:#c2410c; padding:4px 10px; border-radius:20px; font-size:11px; font-weight:700; border:1px solid #fed7aa;">🌙 Hors Site</span></div></div>`;
    });
    this.decouchageHistoryContainer.innerHTML = html + '</div>';
}
  // 1. FIXED REFUEL EXPORT
  exportRefuelsCSV() {
    if (!this.allRefuelLogs || this.allRefuelLogs.length === 0) { alert("Rien à exporter."); return; }
    let csv = "Date,Heure,Camion,Avant (L),Ajout (L),Après (L),Capacité (L),Lieu,Wilaya\n";
    
    const startDate = this.refuelDateStart.value ? new Date(this.refuelDateStart.value) : null;
    const endDate = this.refuelDateEnd.value ? new Date(this.refuelDateEnd.value) : null;
    if(endDate) endDate.setHours(23, 59, 59, 999);
    const truckSearch = this.refuelTruckSearch.value.toLowerCase().trim();

    const minRefuelExport = parseInt((FLEET_CONFIG.REFUEL_RULES || {}).minRefuelLiters || 50);
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

    processedLogs.forEach(log => {
        const d = new Date(log.timestamp);
        // Robust Location Resolve
        let exportLoc = log.locationName || "Inconnu";
        let wilaya = "Inconnue";
        
        const cached = geocodeService.checkCacheInstant(log.lat, log.lng);
        if (cached) {
            exportLoc = (cached.formatted || cached.city || "Lieu").replace(/,/g, " ");
            wilaya = (cached.wilaya || "Inconnue").replace(/,/g, " ");
        } else if (log.lat && log.lng) {
            exportLoc = `${parseFloat(log.lat).toFixed(4)} ${parseFloat(log.lng).toFixed(4)}`;
        }
        
        csv += `"${d.toLocaleDateString()}","${d.toLocaleTimeString()}","${log.truckName}",${log.realOld || ''},${log.realAdded},${log.realTotal},${log.capacity},"${exportLoc}","${wilaya}"\n`;
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
                  <div><i class="fa-solid fa-gas-pump"></i> ${rule.config.fuelTankCapacity}L</div>
                  <div><i class="fa-solid fa-fire"></i> ${rule.config.fuelConsumption} L/100</div>
                  <div><i class="fa-solid fa-bell"></i> Alerte ${rule.config.fuelAlertThreshold}%</div>
                  <div>${rule.config.calibration && rule.config.calibration.length > 0 ? '<i class="fa-solid fa-check-circle" style="color:green"></i> Calibré' : '<span style="color:#999">Non Calibré</span>'}</div>
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
      const config = {
          fuelTankCapacity: parseInt(document.getElementById('ruleTank').value) || 600,
          fuelConsumption: parseFloat(document.getElementById('ruleConso').value) || 35,
          fuelAlertThreshold: parseInt(document.getElementById('ruleThreshold').value) || 30,
          criticalFuelLevel: parseInt(document.getElementById('ruleCritical').value) || 15,
          vidangeMilestones: document.getElementById('ruleVidange').value.trim(),
          fuelPricePerLiter: FLEET_CONFIG.DEFAULT_TRUCK_CONFIG.fuelPricePerLiter, // Inherit Global Price
          fuelSecurityMargin: FLEET_CONFIG.DEFAULT_TRUCK_CONFIG.fuelSecurityMargin, // Inherit Global Margin
          vidangeAlertKm: FLEET_CONFIG.DEFAULT_TRUCK_CONFIG.vidangeAlertKm, // Inherit Global Alert
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
    if (tabName === 'maintenanceHistory') this.fetchAndRenderMaintenance(); 
    if (tabName === 'routing') this.populateRouteTruckList();
    if (tabName === 'settings') { 
        this.renderCustomLocationsList(); 
        this.renderRulesList(); 
    }
    if (tabName === 'reports') { 
        this.toggleReportView('fuel'); 
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

      const data = await response.json();
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
    return trucks.filter(t => t.name.toLowerCase().includes(this.searchQuery));
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
             style="border-bottom: 3px solid ${color}">
          <div class="stat-icon" style="color: ${color}">${icon}</div>
          <div class="stat-value">${value}</div>
          <div class="stat-label">${label}</div>
        </div>
      `;
    };

    this.statsContainer.innerHTML = `
      ${createCard('Tous', stats.totalTrucks, 'var(--teal)', 'all', '<i class="fa-solid fa-list"></i>')}
      ${createCard('En Route', movingCount, 'var(--green)', 'moving', '<i class="fa-solid fa-truck-fast"></i>')}
      ${createCard('À l\'arrêt', stoppedCount, '#999', 'stopped', '<i class="fa-solid fa-ban"></i>')}
      ${createCard('Coupure GPS', gpsCutCount, '#333', 'gps_cut', '<i class="fa-solid fa-satellite-dish"></i>')} ${createCard('Critique', stats.criticalCount, 'var(--red)', 'critical', '<i class="fa-solid fa-exclamation-triangle"></i>')}
      ${createCard('Vidange', stats.vidangeCount, 'var(--orange)', 'vidange', '<i class="fa-solid fa-wrench"></i>')}
    `;
  }

  renderTrucks() {
    this.trucksContainer.innerHTML = '';
    let trucks = app.getAllTrucks();
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

      if (truck.isGpsCut) {
          statusHtml = `<span class="status-badge gps-cut"><i class="fa-solid fa-satellite-dish"></i> COUPURE GPS</span>`;
          headerClass = 'gps-cut-bg';
          fuelClass = 'critical'; // Or grey, but keeping critical to highlight issue
      } else {
          statusHtml = isMoving 
            ? `<span class="status-badge moving"><i class="fa-solid fa-bolt"></i> EN ROUTE (${truck.speed} km/h)</span>`
            : `<span class="status-badge stopped"><i class="fa-solid fa-pause"></i> STOP</span>`;
          
          headerClass = isMoving ? 'moving-bg' : 'stopped-bg';
          
          if (truck.isCriticalFuel) fuelClass = 'critical';
          else if (truck.isLowFuel) fuelClass = 'warning';
      }
      
      const config = getTruckConfig(truck.id);
      const ruleLabel = config._ruleName ? `<div style="font-size:9px; background:var(--teal); color:white; padding:2px 4px; border-radius:2px; display:inline-block; margin-top:2px;">${config._ruleName}</div>` : '';

      // --- VIDANGE DISPLAY (handle overdue nicely) ---
      const vidangeKmUntil = Number(truck?.vidange?.kmUntilNext ?? 0);
      const isVidangeOverdue = truck?.vidange?.alert && vidangeKmUntil < 0;
      const vidangeTitle = isVidangeOverdue ? 'VIDANGE EN RETARD' : 'VIDANGE REQUISE';
      const vidangeColor = isVidangeOverdue ? 'var(--red)' : 'var(--orange)';
      const vidangeBg = isVidangeOverdue ? '#fff5f5' : '#fff3e0';
      const vidangeRemainingText = isVidangeOverdue
        ? `En retard de ${Math.abs(vidangeKmUntil).toLocaleString()} km`
        : `${vidangeKmUntil.toLocaleString()} km restants`;

      const card = document.createElement('div');
      card.className = 'truck-card';
      card.innerHTML = `
        <div class="truck-header ${headerClass}">
          <div>
            <h4 style="margin: 0; color: #333;">${truck.name}</h4>
            ${ruleLabel}
            <div style="font-size: 11px; color: #888; margin-top: 2px;">
              <i class="fa-regular fa-clock"></i> ${new Date(truck.timestamp).toLocaleTimeString()}
            </div>
          </div>
          <div>${statusHtml}</div>
        </div>

        <div class="truck-body">
          <div style="display: flex; justify-content: space-between; font-size: 13px; margin-bottom: 5px;">
            <span><i class="fa-solid fa-gas-pump"></i> Niveau</span>
            <strong style="color: ${truck.isCriticalFuel ? 'var(--red)' : '#333'}">${truck.fuelLiters} L</strong>
          </div>
          
          <div class="progress-bar">
            <div class="progress-fill ${fuelClass}" style="width: ${Math.min(truck.fuelPercentage, 100)}%;"></div>
          </div>
          <div style="display:flex; justify-content:space-between; font-size: 11px; margin-top: 4px; color: #666;">
            <span>${truck.fuelPercentage}% plein</span>
            ${truck.hasCalibration ? '<span style="color: var(--teal);"><i class="fa-solid fa-ruler-combined"></i> Calibré</span>' : ''}
          </div>

          <div class="info-grid">
            <div class="info-item">
              <div class="info-label">Odomètre</div>
              <div class="info-value">${truck.odometer.toLocaleString()} <small>km</small></div>
            </div>
            <div class="info-item">
              <div class="info-label">Autonomie Est.</div>
              <div class="info-value">${truck.rangeKm} <small>km</small></div>
            </div>
          </div>

          <div class="location-box">
              <i class="fa-solid fa-map-marker-alt" style="${truck.location.isCustom ? 'color: #166534;' : ''}"></i>
              <div>
                <div style="font-weight: 600; color: ${truck.location.isCustom ? '#166534' : '#333'};">${truck.location.city}</div>
                <div>${truck.location.wilaya}</div>
              </div>
          </div>

          ${truck.vidange.alert ? `
            <div style="margin-top: 12px; padding: 10px; background: ${vidangeBg}; border-left: 3px solid ${vidangeColor}; border-radius: 4px; font-size: 12px;">
              <strong style="color: ${vidangeColor};"><i class="fa-solid fa-wrench"></i> ${vidangeTitle}</strong>
              <div style="margin-top: 2px;">Prévue à ${truck.vidange.nextKm}km (${vidangeRemainingText})</div>
              <button class="btn-vidange-done" style="margin-top:8px; width:100%;" onclick="ui.quickAddVidange('${truck.id}')">
                <i class="fa-solid fa-circle-check"></i> Déclarer Vidange
              </button>
            </div>
          ` : ''}
          ${truck.isVidangeCandidate ? `
            <div class="zone-vidange-badge" style="animation:zoneIn 0.4s ease">
              <i class="fa-solid fa-wrench"></i> VIDANGE EN COURS — ${truck.maintenanceZoneName || 'Zone Maintenance'} · ${truck.zoneTimeMinutes}min
            </div>
          ` : truck.inMaintenanceZone ? `
            <div class="zone-maintenance-badge" style="animation:zoneIn 0.4s ease">
              <i class="fa-solid fa-screwdriver-wrench"></i> EN ZONE MAINTENANCE — ${truck.maintenanceZoneName || ''} · ${truck.zoneTimeMinutes}min
            </div>
          ` : ''}
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
          const color = t.isCriticalFuel ? 'var(--red)' : t.isLowFuel ? 'var(--orange)' : 'var(--green)';
          const locText = `${t.location.city}, ${t.location.wilaya}`;
          
          return `
          <div class="fuel-card-container" style="background: white; padding: 15px; border-radius: 8px; border-left: 4px solid ${color}; box-shadow: 0 1px 3px rgba(0,0,0,0.1); position:relative;">
            <div style="display:flex; justify-content:space-between; margin-bottom: 5px;">
              <strong>${t.name}</strong>
              <div style="text-align:right;">
                <strong style="color:${color}; font-size: 1.2rem;">${t.fuelLiters} L</strong>
                <div style="font-size: 11px; color: #888;">${t.fuelPercentage}%</div>
              </div>
            </div>
            
            <div style="background: #eee; height: 8px; border-radius: 4px; overflow: hidden; margin-bottom: 8px;">
              <div style="background: ${color}; width: ${t.fuelPercentage}%; height: 100%;"></div>
            </div>
            
            <div style="font-size: 12px; color: #666; display: flex; justify-content: space-between; margin-bottom: 5px;">
              <span><i class="fa-solid fa-tank-water"></i> Cap: ${t.fuelTankCapacity}L</span>
              <span><i class="fa-solid fa-road"></i> ~${t.rangeKm} km</span>
            </div>

            <div style="font-size: 11px; color: #555; border-top: 1px solid #eee; padding-top: 5px;">
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
              <strong>${t.name}</strong>
              <span style="background:${color}; color:white; padding: 2px 8px; border-radius: 4px; font-size: 10px; font-weight: bold;">${statusText}</span>
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
        const response = await fetch(`${FLEET_CONFIG.API.baseUrl}/api/refuels`);
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
        const minRefuelDisplay = parseInt((FLEET_CONFIG.REFUEL_RULES || {}).minRefuelLiters || 50);
        if (Number(log.realAdded) < minRefuelDisplay) return false;
        if (startDate && logDate < startDate) return false;
        if (endDate && logDate > endDate) return false;
        if (truckSearch && !log.truckName.toLowerCase().includes(truckSearch)) return false;
        // Search inside location name even if it's currently "Recherche..."
        if (locationSearch && !log.locationDisplay.toLowerCase().includes(locationSearch)) return false;
        return true;
    });

    // 4. Sort based on user selection
    if (this.refuelSortOrder === 'qtydesc') {
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
            ? `<span style="background:#dcfce7; color:#166534; padding:3px 10px; border-radius:20px; font-size:10px; font-weight:bold; display:inline-flex; align-items:center; gap:4px;"><i class="fa-solid fa-building"></i> SITE INTERNE</span>`
            : `<span style="background:#fff7ed; color:#c2410c; padding:3px 10px; border-radius:20px; font-size:10px; font-weight:bold; display:inline-flex; align-items:center; gap:4px;"><i class="fa-solid fa-gas-pump"></i> STATION</span>`;

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
                </div>
                <div style="text-align:right;">
                    <div style="font-size:24px; font-weight:900; color:${log.isInternal ? '#15803d' : '#0f172a'}; line-height:1;">+${log.realAdded} L</div>
                    <div style="font-size:10px; color:#94a3b8; margin-top:2px;">≈ ${Math.round(log.realAdded * (FLEET_CONFIG.DEFAULT_TRUCK_CONFIG.fuelPricePerLiter || 29))} DA</div>
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
              this.selectedRouteDestination = { 
                city: cityName, 
                lat: f.geometry.coordinates[1], 
                lng: f.geometry.coordinates[0],
                wilaya: p.state || context 
              };
              // Update Input Field
              this.routeDestSearch.value = `${cityName}, ${this.selectedRouteDestination.wilaya}`;
              this.routeAutocompleteDropdown.style.display = 'none';
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
  calculateRoute() {
    const truckId = this.routeTruck.value;
    const destination = this.selectedRouteDestination;

    if (!truckId || !destination) {
      alert('⚠️ Sélectionnez un camion et une destination.');
      return;
    }

    const truck = app.trucks.get(truckId);
    // Use TRUCK SPECIFIC CONFIG for calculation
    const config = getTruckConfig(truckId);
    
    const pricePerLiter = config.fuelPricePerLiter || 29; 
    const marginLiters = config.fuelSecurityMargin || 100; 
    const consumption = config.fuelConsumption || 35;

    const distance = calculateDistance(truck.coordinates.lat, truck.coordinates.lng, destination.lat, destination.lng);
    const roadDistance = Math.round(distance * 1.25);
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
      <div class="route-result" style="background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); border-top: 5px solid ${statusColor}; margin-top: 20px;">
        <h3 style="margin: 0 0 15px 0; color: var(--teal-dark);">Trajet: ${truck.name} <i class="fa-solid fa-arrow-right"></i> ${destination.city}</h3>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 20px;">
          <div><div style="font-size: 12px; color: #888;">DISTANCE (Est.)</div><div style="font-size: 18px; font-weight: bold;">${roadDistance} km</div></div>
          <div><div style="font-size: 12px; color: #888;">CONSO (${consumption}L/100)</div><div style="font-size: 18px; font-weight: bold;">${fuelNeededForTrip} L</div></div>
        </div>
        <div style="background: #f4f6f9; padding: 15px; border-radius: 8px;">
          <h4 style="margin: 0 0 10px 0; color: ${statusColor};">${statusText}</h4>
          ${litersToBuy > 0 ? `
            <p>Ajouter pour sécuriser le trajet (+marge ${marginLiters}L):</p>
            <div style="font-size: 24px; font-weight: bold; color: ${statusColor};">${litersToBuy} Litres</div>
            <div style="margin-top: 10px; padding-top: 10px; border-top: 1px solid #ddd;">
              <div style="font-size: 12px; color: #666;">COÛT ESTIMÉ</div>
              <div style="font-size: 28px; font-weight: 800; color: var(--teal-dark);">${cost.toLocaleString()} DA</div>
            </div>
          ` : `<p style="color: green;">Réserve à l'arrivée: ${remainingAfterTrip}L (Marge OK).</p>`}
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

      let html = '<div style="display:grid; gap:10px;">';
      
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
              <div style="display:flex; gap:15px; align-items:center;">
                  <div style="background:${color}20; color:${color}; width:40px; height:40px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:18px;">
                      <i class="fa-solid ${icon}"></i>
                  </div>
                  <div>
                      <div style="font-weight:bold; color:#333; font-size:15px;">
                          ${item.type} <span style="font-weight:normal; color:#666;">- ${item.truckName}</span>
                          ${isAuto}
                      </div>
                      <div style="font-size:12px; color:#666; margin-top:3px;">
                          <i class="fa-solid fa-arrow-right-to-bracket"></i> Entrée: ${new Date(item.date).toLocaleString()}
                      </div>
                      ${statusHtml}
                      <div style="font-size:12px; color:#666; margin-top:3px;">
                          <i class="fa-solid fa-road"></i> ${item.odometer.toLocaleString()} km
                          ${item.location ? ` |  <i class="fa-solid fa-map-pin"></i> ${item.location}` : ''}
                      </div>
                      ${item.note ? `<div style="font-size:12px; color:#444; margin-top:4px; font-style:italic;">"${item.note}"</div>` : ''}
                  </div>
              </div>
              <div style="display:flex; gap: 5px;">
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

  openMaintenanceModal(editData = null) {
      this.maintenanceModal.style.display = 'flex';
      const select = document.getElementById('modalMaintTruck');
      select.innerHTML = '';
      
      app.getAllTrucks().forEach(t => {
          const opt = document.createElement('option');
          opt.value = t.name;
          opt.dataset.id = t.id;
          opt.dataset.odo = t.odometer;
          opt.text = t.name;
          select.appendChild(opt);
      });

      if (editData) {
        this.editingMaintenanceId = editData.id;
this.editingIsAuto = editData.isAuto; // <--- Capture Auto Status
        this.modalMaintTitle.innerText = 'Modifier Maintenance';
        this.modalMaintSubmitBtn.innerHTML = '<i class="fa-solid fa-save"></i> Mettre à jour';
        
        select.value = editData.truckName;
        document.getElementById('modalMaintType').value = editData.type;
        
        const d = new Date(editData.date);
        d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
        document.getElementById('modalMaintDate').value = d.toISOString().slice(0,16);
        document.getElementById('modalMaintOdo').value = editData.odometer;
        document.getElementById('modalMaintNote').value = editData.note || '';

      } else {
        this.editingMaintenanceId = null;
        this.modalMaintTitle.innerText = 'Ajouter Maintenance Manuelle';
        this.modalMaintSubmitBtn.innerHTML = 'Enregistrer';
        
        if(select.options.length > 0) {
            document.getElementById('modalMaintOdo').value = select.options[0].dataset.odo;
        }
        const now = new Date();
        now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
        document.getElementById('modalMaintDate').value = now.toISOString().slice(0,16);
        document.getElementById('modalMaintNote').value = '';
      }
      
      select.onchange = () => {
         if (!this.editingMaintenanceId) {
             const opt = select.options[select.selectedIndex];
             document.getElementById('modalMaintOdo').value = opt.dataset.odo;
         }
      };
  }

  closeMaintenanceModal() {
      this.maintenanceModal.style.display = 'none';
      this.editingMaintenanceId = null;
  }

  async saveManualMaintenance() {
      const select = document.getElementById('modalMaintTruck');
      const truckName = select.value;
      const deviceId = select.options[select.selectedIndex].dataset.id;
      const type = document.getElementById('modalMaintType').value;
      const dateVal = document.getElementById('modalMaintDate').value;
      const odo = parseInt(document.getElementById('modalMaintOdo').value);
      const note = document.getElementById('modalMaintNote').value;

      if(!truckName || !dateVal || isNaN(odo)) {
          alert("Veuillez remplir correctement les champs.");
          return;
      }

// NEW LOGIC: Keep "Auto" status if we are editing an existing auto-entry
let isAutoState = false;
if (this.editingMaintenanceId) {
    isAutoState = this.editingIsAuto; 
}

const eventData = {
    truckName,
    deviceId,
    type: type,
    // If it was auto, keep the original location name (don't rename to 'Manual')
    location: (isAutoState && this.editingOriginalLocation) ? this.editingOriginalLocation : 'Entrée Manuelle',
    odometer: odo,
    date: new Date(dateVal).toISOString(),
    note: note,
    isAuto: isAutoState // <--- Uses the captured status
};

      let url = '/api/maintenance/add';
      if (this.editingMaintenanceId) {
         url = '/api/maintenance/update';
         eventData.id = this.editingMaintenanceId;
      }

      try {
          const res = await fetch(`${FLEET_CONFIG.API.baseUrl}${url}`, {
              method: 'POST',
              headers: {'Content-Type': 'application/json'},
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

// 2. DETAILED DECOUCHAGE (Fixed: Parallel Speed + Distance Calculation)
async generateDetailedDecouchageReport(selectedIds, startDate, endDate) {
    const btn = document.querySelector('button[onclick="ui.openReportModal()"]');
    const originalText = btn ? btn.innerHTML : 'Rapport';
    if (btn) btn.innerHTML = `<i class="fa-solid fa-moon fa-spin"></i> Analyse Nuits...`;

    let csv = "Date (Nuit du),Heure Detection,Camion,Statut,Lieu Exact,Coordonnées\n";
    let eventsFound = 0;
    
    // Process one by one to avoid memory overload
    for (const id of selectedIds) {
        const truck = app.trucks.get(id);
        if (!truck) continue; 

        try {
            const res = await fetch(`${FLEET_CONFIG.API.baseUrl}/api/history?imei=${truck.id}&start=${startDate}&end=${endDate}`);
            if (!res.ok) continue; 
            const json = await res.json();
            
            // Parse points
            let points = (Array.isArray(json) ? json : json.messages || []).map(p => ({
                time: new Date(p[0]).getTime(),
                lat: parseFloat(p[1]),
                lng: parseFloat(p[2]),
                dateObj: new Date(p[0])
            }));

            // Set of processed nights to avoid duplicates per night
            const processedNights = new Set(); 

            for (const p of points) {
                const hour = p.dateObj.getHours();

                // STRICT DEFINITION: Decouchage is between 00:00 and 05:00
                if (hour >= 0 && hour < 5) {
                    
                    // Logic: 3 AM on Jan 25th belongs to the night of Jan 24th
                    const nightOfDate = new Date(p.dateObj);
                    nightOfDate.setDate(nightOfDate.getDate() - 1);
                    const nightStr = nightOfDate.toISOString().split('T')[0];

                    // If we haven't flagged this night yet
                    if (!processedNights.has(nightStr)) {
                        
                        // Check Safe Zone (Douroub Site)
                        let isSafe = false;
                        if (FLEET_CONFIG.CUSTOM_LOCATIONS) {
                            for (const loc of FLEET_CONFIG.CUSTOM_LOCATIONS) {
                                // Check both 'douroub' (Official) and 'client' (Delivery) sites if needed
                                // Assuming 'douroub' is the only safe haven for night
                                if (loc.type === 'douroub' || loc.type === 'depot') {
                                    const dist = this.getDistKm(p.lat, p.lng, loc.lat, loc.lng);
                                    // 500m radius
                                    if (dist <= (loc.radius ? loc.radius/1000 : 0.5)) { 
                                        isSafe = true; break; 
                                    }
                                }
                            }
                        }

                        if (!isSafe) {
                            processedNights.add(nightStr); // Mark night as "Caught"
                            // Async resolve address for report
                            const address = await this.resolveLocationNameAsync(p.lat, p.lng);
                            const timeStr = p.dateObj.toLocaleTimeString();
                            
                            csv += `"${nightStr}","${timeStr}","${truck.name}","DECOUCHEMENT","${address}","${p.lat},${p.lng}"\n`;
                            eventsFound++;
                        } else {
                            // If found inside safe zone, mark night as Safe (processed) so we don't check again
                            processedNights.add(nightStr);
                        }
                    }
                }
            }
        } catch (e) { console.error(e); }
    }

    if (btn) btn.innerHTML = originalText;
    if (eventsFound === 0) alert("Aucun découchage trouvé (Tous les camions étaient sur site).");
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
        const tankCap = getTruckConfig(truck.id).fuelTankCapacity || 600;

        try {
            const res = await fetch(`${FLEET_CONFIG.API.baseUrl}/api/history?imei=${truck.id}&start=${startDate}&end=${endDate}`);
            if (!res.ok) continue;

            const json = await res.json();
            let rawPoints = [];
            if (Array.isArray(json)) rawPoints = json;
            else if (json && Array.isArray(json.messages)) rawPoints = json.messages;

            // Sort by time
            let points = rawPoints.map(p => ({
                time: new Date(p[0]).getTime(),
                lat: parseFloat(p[1]),
                lng: parseFloat(p[2]),
                speed: parseInt(p[5]),
                liters: p[6] && p[6].io87 ? Math.round((parseFloat(p[6].io87) / 100) * tankCap) : 0
            })).sort((a,b) => a.time - b.time);

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

	      const tankCap = getTruckConfig(truck.id).fuelTankCapacity || 600;

	      // ✅ FUEL LOGIC (MUST MATCH MAPBOX HISTORY)
	      // - Only consider valid (>0) fuel readings
	      // - Detect refills only when the level jumps by > 50L
	      // - Ignore minor refills of 50L or below
	      let refillCount = 0, refillVolume = 0, consumedLiters = 0;
	      let lastLiters = null;

	      // Initialize baseline with the first valid value (prevents false huge refills when io87 starts at 0)
	      if (points[0].params && points[0].params.io87 && parseInt(points[0].params.io87) > 0) {
	          lastLiters = (parseFloat(points[0].params.io87) / 100) * tankCap;
	      }

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

	          // A. FUEL (Same logic as Mapbox history: simple & effective)
	          if (p.params && p.params.io87 && parseInt(p.params.io87) > 0) {
	              const currentLiters = (parseFloat(p.params.io87) / 100) * tankCap;

	              if (lastLiters !== null) {
	                  const diff = currentLiters - lastLiters;

	                  // ✅ Refuel detected only if > 50L
	                  if (diff > 50) {
	                      refillCount++;
	                      refillVolume += diff;
	                  }
	                  // ✅ Consumption tracking (ignore extreme drops that are usually sensor glitches)
	                  else if (diff < 0 && Math.abs(diff) < 80) {
	                      consumedLiters += Math.abs(diff);
	                  }
	              }

	              // Always move the baseline forward when we have a valid reading
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
      const FUEL_KEY = 'io87'; // Fuel Level
      
      let totalDist = 0;
      let refillCount = 0;
      let refillVolume = 0;
      let stopCount = 0;
      let lastLat = null, lastLng = null, lastFuel = null;
      
      const tankCap = getTruckConfig(truck.id).fuelTankCapacity || 600;

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

          // B. Refills
          let currentFuel = 0;
          if (p.params) {
              let rawVal = 0;
              // Handle params if it's nested or flat
              const params = p.params; 
              if (params[FUEL_KEY]) rawVal = parseFloat(params[FUEL_KEY]);
              
              // Calculate Liters
              currentFuel = Math.round((rawVal / 100) * tankCap);
          }

	          // Detect Refills (same logic as Mapbox): ignore 50L and below
	          if (lastFuel !== null && currentFuel > (lastFuel + 50)) {
              refillCount++;
              refillVolume += (currentFuel - lastFuel);
          }
          if (currentFuel > 0) lastFuel = currentFuel;

          // C. Stops
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
          const refills = [];
          const stops = [];
          
          let lastFuel = null;
          const tankCap = getTruckConfig(imei).fuelTankCapacity || 600;

          // STATS ACCUMULATORS
          let totalDist = 0;
          let totalFuelAdded = 0;
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

              // B. Refills
              let currentFuel = 0;
              if (p.params && p.params.io87) {
                  currentFuel = Math.round((parseFloat(p.params.io87) / 100) * tankCap);
              }

              if (lastFuel !== null && currentFuel > (lastFuel + 50)) { 
                  const added = currentFuel - lastFuel;
                  totalFuelAdded += added; 
                  refills.push({ 
                      lat: p.lat, lng: p.lng, 
                      volume: added.toFixed(0), 
                      time: p.time 
                  });
              }
              if (currentFuel > 0) lastFuel = currentFuel;

              // C. Stops
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

// Inside ui.js -> loadVisualHistory
if(window.AlgeriaMap && window.AlgeriaMap.drawRoute) {
    window.AlgeriaMap.drawRoute(points, coords);
    window.AlgeriaMap.addRefillMarkers(refills);
    window.AlgeriaMap.addStopMarkers(stops);
    
    // Pass the correct structure to the map engine
    window.AlgeriaMap.updateStats({
        distance: totalDist.toFixed(1),
        fuel: totalFuelAdded.toFixed(0),
        stopCount: stops.length
    });

              const toast = document.createElement('div');
              toast.className = 'map-toast-msg';
              toast.innerHTML = `✅ Chargé: ${points.length} points | ${totalDist.toFixed(1)} km`;
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
}

let ui;
setTimeout(() => {
  if (typeof app !== 'undefined') {
    ui = new UIController();
  }
}, 100);