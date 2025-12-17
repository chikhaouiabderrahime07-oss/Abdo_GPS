/**
 * Fleet Tracker Configuration - FULL & ROBUST
 * - Default Poll: 3 Minutes
 * - Maintenance Rules: 60 mins duration
 * - Security: Multi-Key Support
 */

const FLEET_CONFIG = {
  // Primary Key (Fallback)
  GEOAPIFY_API_KEY: 'b6fb88dee9494c9bab15b4f8e6bfbd58',
  
  // Multiple Keys for Rotation (Managed via UI)
  GEOAPIFY_API_KEYS: [],

  // Language Support
  LANGUAGE: 'fr',
  
  // Auto-start settings
  AUTO_START: true,
  
  // 3 MINUTES DEFAULT (180 seconds * 1000)
  DEFAULT_POLL_INTERVAL: 180000, 
  
  // Default Server URL (Update if needed)
  DEFAULT_SERVER_URL: 'https://fleet-tracker-backend.onrender.com', 
  
  // Location Types (Used for Maintenance Logic)
  LOCATION_TYPES: {
    CLIENT: { id: 'client', label: 'Client / Livraison', color: '#1976d2', icon: 'fa-user-tie' },
    MAINTENANCE: { id: 'maintenance', label: 'Maintenance / Garage', color: '#d32f2f', icon: 'fa-wrench' }, // IMPORTANT: Only this type triggers auto-maintenance
    DOUROUB: { id: 'douroub', label: 'Site Douroub', color: '#166534', icon: 'fa-building' },
    OTHER: { id: 'other', label: 'Autre', color: '#666666', icon: 'fa-map-marker-alt' }
  },

  // Maintenance Trigger Rules
  MAINTENANCE_RULES: {
    minDurationMinutes: 60, // Must stay 60 mins to count
    vidangeKmTolerance: 3000 // Trigger "Vidange" if within 3000km of due date
  },

  // Default Truck Params
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

  // Per-Truck Overrides
  TRUCK_OVERRIDES: {},
  
  // Custom Locations
  CUSTOM_LOCATIONS: [],

  UI: {
    enableGeocoding: true,
    geocodeDistanceThresholdKm: 2, // 2KM OPTIMIZATION RULE
    pollInterval: 180000 
  },

  API: {
    baseUrl: 'https://fleet-tracker-backend.onrender.com',
    trucksEndpoint: '/api/trucks',
    settingsEndpoint: '/api/settings'
  },

  LANGUAGES: {
    fr: {
      criticalFuelMessage: "⚠️ ALERTE CRITIQUE: {truck} à {percentage}% carburant!",
      warningFuelMessage: "⚠️ Attention: {truck} niveau bas ({percentage}%)",
      vidangeAlertMessage: "🔧 MAINTENANCE REQUISE: {truck} (Reste {km}km avant {next}km)",
      errorGeocoding: "Erreur de géocodage",
      locationUnknown: "Lieu inconnu"
    }
  }
};

// --- GLOBAL HELPERS (Required for App Logic) ---

function getTruckConfig(deviceId) {
  const globalDefault = FLEET_CONFIG.DEFAULT_TRUCK_CONFIG;
  const specific = FLEET_CONFIG.TRUCK_OVERRIDES[deviceId] || {};
  return { ...globalDefault, ...specific };
}

function calculateVidangeStatus(currentOdometer, config) {
  if (!config.vidangeMilestones) return { alert: false };
  
  let milestones = [];
  if (typeof config.vidangeMilestones === 'string') {
      milestones = config.vidangeMilestones.split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n)).sort((a,b)=>a-b);
  } else {
      milestones = config.vidangeMilestones;
  }
  
  // Find next milestone
  const nextMilestone = milestones.find(m => m > currentOdometer);
  if (!nextMilestone) return { alert: false, nextKm: 'N/A', kmUntilNext: 0 };

  const kmUntilNext = nextMilestone - currentOdometer;
  const isAlert = kmUntilNext <= config.vidangeAlertKm;

  return {
      alert: isAlert,
      nextKm: nextMilestone,
      kmUntilNext: kmUntilNext
  };
}

function calculateFuelNeeded(distanceKm, consumptionPer100) {
  return Math.round((distanceKm / 100) * consumptionPer100);
}

function calculateRouteWithSecurityMargin(currentFuel, margin, needed) {
  const available = currentFuel - margin;
  return {
    canReach: available >= needed,
    missing: available >= needed ? 0 : (needed - available),
    availableAfterMargin: available
  };
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