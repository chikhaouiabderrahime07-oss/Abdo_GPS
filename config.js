/**
 * Fleet Tracker Configuration - FULLY FRENCH with Security Features
 * Updated: 5 min default interval, multi-key support
 */

const FLEET_CONFIG = {
  // Primary Key (Fallback) - Clé de secours
  GEOAPIFY_API_KEY: 'b6fb88dee9494c9bab15b4f8e6bfbd58',
  
  // NEW: Multiple Keys for Rotation (Managed via UI)
  GEOAPIFY_API_KEYS: [],

  // Language Support - FRENCH ONLY
  LANGUAGE: 'fr',
  
  // Auto-start settings - Poll interval in MILLISECONDS
  AUTO_START: true,
  // CHANGED: Default is now 5 minutes (300,000 ms)
  DEFAULT_POLL_INTERVAL: 300000, 
  DEFAULT_SERVER_URL: 'https://fleet-tracker-backend.onrender.com', // Mettez votre URL Render ici
  
  // NEW: Maintenance & Location Logic
  LOCATION_TYPES: {
    CLIENT: { id: 'client', label: 'Client / Livraison', color: '#1976d2', icon: 'fa-user-tie' },
    MAINTENANCE: { id: 'maintenance', label: 'Maintenance / Garage', color: '#d32f2f', icon: 'fa-wrench' },
    DOUROUB: { id: 'douroub', label: 'Site Douroub', color: '#166534', icon: 'fa-building' },
    OTHER: { id: 'other', label: 'Autre', color: '#666666', icon: 'fa-map-pin' }
  },

  MAINTENANCE_RULES: {
    minDurationMinutes: 60, // Truck must stay 60 mins to be considered maintenance
    vidangeKmTolerance: 3000 // If within 3000km of scheduled vidange, assume Vidange
  },

  DEFAULT_TRUCK_CONFIG: {
    alias: null,
    fuelTankCapacity: 600,          
    fuelConsumption: 35,             
    fuelAlertThreshold: 30,          
    vidangeMilestones: '30000, 60000, 90000, 120000',        
    vidangeAlertKm: 5000,            
    criticalFuelLevel: 15,           
    fuelSecurityMargin: 100,         
    fuelPricePerLiter: 29,
    calibration: null 
  },
  
  TRUCK_OVERRIDES: {},
  
  DEFAULT_DESTINATION: {
    name: 'Warehouse',
    lat: 36.7372,
    lng: 3.0588
  },
  
  API: {
    baseUrl: 'http://localhost:3000', // Sera écrasé par l'UI
    trucksEndpoint: '/api/trucks'
  },
  
  UI: {
    pollInterval: 300000, // 5 minutes default
    enableGeocoding: true,
    // NEW: Optimization - Only request API if truck moved > 2 km
    geocodeDistanceThresholdKm: 2, 
    groupByWilaya: true
  },
  
  // FULL FRENCH TRANSLATIONS
  LANGUAGES: {
    fr: {
      dashboard: '📊 Tableau de bord',
      byWilaya: '🗺️ Par Wilaya',
      fuelSection: '⛽ Section Carburant',
      routePlanning: '🛣️ Planification',
      settings: '⚙️ Paramètres',
      reports: '📋 Rapports',
      canReachMessage: '✅ Peut atteindre la destination',
      cannotReachMessage: '❌ Impossible d\'atteindre la destination',
      withMargin: 'après marge de sécurité',
      criticalFuelMessage: '🚨 CRITIQUE: {truck} n\'a que {percentage}% de carburant!',
      warningFuelMessage: '⚠️ AVERTISSEMENT: {truck} carburant faible ({percentage}%)',
      vidangeAlertMessage: '🔧 VIDANGE: {truck} vidange due dans {km}km (à {next}km)'
    }
  }
};

function getTruckConfig(deviceId) {
  const defaults = FLEET_CONFIG.DEFAULT_TRUCK_CONFIG;
  const overrides = FLEET_CONFIG.TRUCK_OVERRIDES[deviceId] || {};
  return { ...defaults, ...overrides };
}

function updateTruckConfig(deviceId, config) {
  if (!FLEET_CONFIG.TRUCK_OVERRIDES[deviceId]) {
    FLEET_CONFIG.TRUCK_OVERRIDES[deviceId] = {};
  }
  
  FLEET_CONFIG.TRUCK_OVERRIDES[deviceId] = {
    ...FLEET_CONFIG.TRUCK_OVERRIDES[deviceId],
    ...config
  };
  
  localStorage.setItem('fleetTruckOverrides', JSON.stringify(FLEET_CONFIG.TRUCK_OVERRIDES));
}

function saveAllConfigs() {
  localStorage.setItem('fleetDefaultConfig', JSON.stringify(FLEET_CONFIG.DEFAULT_TRUCK_CONFIG));
  localStorage.setItem('fleetTruckOverrides', JSON.stringify(FLEET_CONFIG.TRUCK_OVERRIDES));
  localStorage.setItem('fleetPollInterval', FLEET_CONFIG.UI.pollInterval.toString());
  localStorage.setItem('fleetServerUrl', FLEET_CONFIG.API.baseUrl);
  
  if(FLEET_CONFIG.CUSTOM_LOCATIONS) {
      localStorage.setItem('fleetCustomLocations', JSON.stringify(FLEET_CONFIG.CUSTOM_LOCATIONS));
  }
  
  // Save API Keys locally as backup
  if(FLEET_CONFIG.GEOAPIFY_API_KEYS) {
      localStorage.setItem('fleetApiKeys', JSON.stringify(FLEET_CONFIG.GEOAPIFY_API_KEYS));
  }
  
  console.log('✅ All configs saved locally');
}

function loadPersistedConfigs() {
  const persisted = localStorage.getItem('fleetTruckOverrides');
  if (persisted) {
    try { FLEET_CONFIG.TRUCK_OVERRIDES = JSON.parse(persisted); } catch (e) { console.error(e); }
  }
  
  const constcF = localStorage.getItem('fleetDefaultConfig');
  if (constcF) {
    try { FLEET_CONFIG.DEFAULT_TRUCK_CONFIG = JSON.parse(constcF); } catch (e) { console.error(e); }
  }
  
  const customLocs = localStorage.getItem('fleetCustomLocations');
  if (customLocs) {
    try { FLEET_CONFIG.CUSTOM_LOCATIONS = JSON.parse(customLocs); } catch (e) { console.error(e); }
  }

  const pollInterval = localStorage.getItem('fleetPollInterval');
  if (pollInterval) {
    try { FLEET_CONFIG.UI.pollInterval = parseInt(pollInterval); } catch (e) { console.error(e); }
  }
  
  const serverUrl = localStorage.getItem('fleetServerUrl');
  if (serverUrl) { FLEET_CONFIG.API.baseUrl = serverUrl; }
  
  const apiKeys = localStorage.getItem('fleetApiKeys');
  if (apiKeys) {
    try { FLEET_CONFIG.GEOAPIFY_API_KEYS = JSON.parse(apiKeys); } catch (e) { console.error(e); }
  }
}

function t(key) {
  const lang = FLEET_CONFIG.LANGUAGE;
  return FLEET_CONFIG.LANGUAGES[lang][key] || key;
}

function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return Math.round(R * c * 10) / 10;
}

function calculateFuelNeeded(distanceKm, consumption) {
  return Math.round((distanceKm / 100) * consumption * 10) / 10;
}

function calculateRouteWithSecurityMargin(fuelAvailable, securityMargin, fuelNeeded) {
  const availableAfterMargin = fuelAvailable - securityMargin;
  return {
    canReach: availableAfterMargin >= fuelNeeded,
    fuelAvailableAfterMargin: availableAfterMargin,
    message: availableAfterMargin >= fuelNeeded 
      ? `✅ ${t('canReachMessage')} ${t('withMargin')}`
      : `❌ ${t('cannotReachMessage')}`
  };
}

loadPersistedConfigs();