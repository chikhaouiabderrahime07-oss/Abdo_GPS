/**
 * Fleet Tracker Configuration
 * Contains API keys, server settings, and vehicle parameters.
 */

const FLEET_CONFIG = {
    // --- MAPBOX CONFIGURATION ---
    MAPBOX_TOKEN: 'pk.eyJ1IjoiZGVzdGVuaXoiLCJhIjoiY21qYWNsZ2RsMDJ1NjNmc2IwdW4xeXdlbCJ9.toA-GeOlzBEuEJHrXsZp-w',

    // --- OTHER KEYS ---
    GEOAPIFY_API_KEY: 'b6fb88dee9494c9bab15b4f8e6bfbd58',
    
    // Multiple Keys for Rotation (Managed via UI)
    GEOAPIFY_API_KEYS: [],
  
    // Language Support
    LANGUAGE: 'fr',
    
    // Auto-start settings
    AUTO_START: true,
    
    // Update Interval: 2 Minutes
    DEFAULT_POLL_INTERVAL: 120000, 
    
    // Default Server URL
    DEFAULT_SERVER_URL: 'https://fleet-tracker-backend.onrender.com', 
    
    // Location Types
    LOCATION_TYPES: {
      CLIENT: { id: 'client', label: 'Client / Livraison', color: '#1976d2', icon: 'fa-user-tie' },
      MAINTENANCE: { id: 'maintenance', label: 'Maintenance / Garage', color: '#d32f2f', icon: 'fa-wrench' },
      DOUROUB: { id: 'douroub', label: 'Site Douroub', color: '#166534', icon: 'fa-building' },
      OTHER: { id: 'other', label: 'Autre', color: '#666666', icon: 'fa-map-marker-alt' }
    },
  
    // Maintenance Trigger Rules
    MAINTENANCE_RULES: {
      minDurationMinutes: 60, // Must stay 60 mins to count
      vidangeKmTolerance: 3000 // Trigger "Vidange" if within 3000km of due date
    },

    // Refuel Detection Rules (Server-side logic uses this too)
    REFUEL_RULES: {
      minRefuelLiters: 50,
      stopSpeedThreshold: 4,
      minStopMinutes: 2,
      requireIgnOff: false,
      dedupeMinutes: 5,
      dedupeLitersTolerance: 10,
      stableAfterIncreaseMinutes: 2
    },

  
    // --- GLOBAL DEFAULT CONFIG ---
    DEFAULT_TRUCK_CONFIG: {
      fuelTankCapacity: 600,
      fuelConsumption: 32, // L/100km
      fuelPricePerLiter: 29, // DA
      fuelSecurityMargin: 100, // Liters reserve
      fuelAlertThreshold: 15, // %
      criticalFuelLevel: 5, // %
      vidangeMilestones: "30000, 60000, 90000",
      vidangeAlertKm: 5000, // Warn 5000km before
      calibration: []
    },
  
    // --- NEW: RULE BASED SYSTEM (Replaces TRUCK_OVERRIDES) ---
    // Structure: [{ id: 'rule_1', name: 'Sahara', truckIds: ['123', '456'], config: { ... } }]
    FLEET_RULES: [],
    
    // Custom Locations
    CUSTOM_LOCATIONS: [],
  
    UI: {
      enableGeocoding: true,
      geocodeDistanceThresholdKm: 2, 
      pollInterval: 120000 
    },
  
    API: {
      baseUrl: 'https://fleet-tracker-backend.onrender.com',
      trucksEndpoint: '/api/trucks',
      settingsEndpoint: '/api/settings'
    }
};
  
// --- GLOBAL HELPERS ---

/**
 * Gets the config for a specific truck.
 * Logic: 
 * 1. Search if truck ID exists in any defined Rule.
 * 2. If yes, merge Global Defaults with Rule Config.
 * 3. If no, return Global Defaults.
 */
function getTruckConfig(deviceId) {
    const globalDefault = FLEET_CONFIG.DEFAULT_TRUCK_CONFIG;
    let specificConfig = {};
    let ruleName = null;

    if (FLEET_CONFIG.FLEET_RULES && Array.isArray(FLEET_CONFIG.FLEET_RULES)) {
        // Find a rule that contains this truck ID
        const matchedRule = FLEET_CONFIG.FLEET_RULES.find(rule => 
            rule.truckIds && rule.truckIds.includes(deviceId.toString())
        );

        if (matchedRule && matchedRule.config) {
            specificConfig = matchedRule.config;
            ruleName = matchedRule.name;
        }
    }

    // Return merged config (Global is base, Specific overrides it)
    return { ...globalDefault, ...specificConfig, _ruleName: ruleName };
}

function calculateVidangeStatus(currentOdometer, config) {
    if (!config.vidangeMilestones) return { alert: false };
    
    let milestones = [];
    // Handle both string "30000, 60000" and array inputs
    if (typeof config.vidangeMilestones === 'string') {
        milestones = config.vidangeMilestones.split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n)).sort((a,b)=>a-b);
    } else if (Array.isArray(config.vidangeMilestones)) {
        milestones = config.vidangeMilestones;
    }
    
    const nextMilestone = milestones.find(m => m > currentOdometer);
    
    // If no more milestones or bad data
    if (!nextMilestone) return { alert: false, nextKm: 'N/A', kmUntilNext: 999999, alertKm: config.vidangeAlertKm };
  
    const kmUntilNext = nextMilestone - currentOdometer;
    const isAlert = kmUntilNext <= (config.vidangeAlertKm || 5000);
  
    return {
        alert: isAlert,
        nextKm: nextMilestone,
        kmUntilNext: kmUntilNext,
        alertKm: config.vidangeAlertKm || 5000
    };
}

function calculateFuelNeeded(distanceKm, consumptionPer100) {
    return Math.round((distanceKm / 100) * consumptionPer100);
}

function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Earth radius km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a =
      Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return Math.round(R * c * 10) / 10;
}