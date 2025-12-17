/**
 * SMART GEOCODING SERVICE
 * FEATURES:
 * 1. Persistent Caching (LocalStorage) - Instantly loads known addresses on refresh.
 * 2. Proximity Check - Returns cached address if truck moved < 100m.
 * 3. Request Queuing - Limits concurrent API calls to prevent freezing.
 * 4. Key Rotation - Rotates keys to avoid limits.
 */

class GeocodeService {
  constructor(apiKey, additionalKeys = []) {
    // 1. Setup Keys
    this.apiKeys = [];
    if (apiKey) this.apiKeys.push(apiKey);
    if (additionalKeys && Array.isArray(additionalKeys)) {
        additionalKeys.forEach(k => {
            const clean = k.trim();
            if(clean && !this.apiKeys.includes(clean)) this.apiKeys.push(clean);
        });
    }
    this.currentKeyIndex = 0;

    // 2. Setup Queue
    this.requestQueue = [];
    this.activeRequests = 0;
    this.MAX_CONCURRENT = 5; // Keep 5 to avoid browser blocking
    this.REQUEST_DELAY = 50; 

    // 3. Load Persistent Cache
    this.cache = new Map();
    this.loadCache();
    
    // Auto-save cache every 30 seconds
    setInterval(() => this.saveCache(), 30000); 

    console.log(`✅ Smart Geocoder Active: ${this.cache.size} cached locations loaded.`);
  }

  updateKeys(newKeys) {
      this.apiKeys = newKeys.filter(k => k && k.trim().length > 0);
      this.currentKeyIndex = 0;
  }

  getRotatedKey() {
      if (this.apiKeys.length === 0) return null;
      const key = this.apiKeys[this.currentKeyIndex];
      this.currentKeyIndex = (this.currentKeyIndex + 1) % this.apiKeys.length;
      return key;
  }

  loadCache() {
      try {
          const saved = localStorage.getItem('fleet_geo_cache');
          if (saved) {
              const parsed = JSON.parse(saved);
              parsed.forEach(item => this.cache.set(item.key, item.val));
              if (this.cache.size > 2000) this.cache.clear(); 
          }
      } catch (e) { console.warn("Cache load failed", e); }
  }

  saveCache() {
      try {
          const data = Array.from(this.cache.entries()).map(([key, val]) => ({key, val}));
          localStorage.setItem('fleet_geo_cache', JSON.stringify(data));
      } catch (e) { /* Ignore quota errors */ }
  }

  getDistanceMeters(lat1, lon1, lat2, lon2) {
    const R = 6371e3; 
    const φ1 = lat1 * Math.PI/180;
    const φ2 = lat2 * Math.PI/180;
    const Δφ = (lat2-lat1) * Math.PI/180;
    const Δλ = (lon2-lon1) * Math.PI/180;
    const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ/2) * Math.sin(Δλ/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  }

  // --- NEW: SYNCHRONOUS INSTANT CHECK ---
  // Returns data immediately if found, or null if API needed
  checkCacheInstant(lat, lng) {
    // 1. Custom Locations (Fastest)
    const custom = this.checkCustomLocations(lat, lng);
    if (custom) return custom;

    // 2. Exact Cache Match
    const exactKey = `${lat.toFixed(4)},${lng.toFixed(4)}`;
    if (this.cache.has(exactKey)) return this.cache.get(exactKey);

    // 3. Proximity Check (Sync Loop)
    // Only check if we have cache to avoid empty loop overhead
    if (this.cache.size > 0) {
        for (const [key, val] of this.cache.entries()) {
            // key format "lat,lng"
            const parts = key.split(',');
            const cLat = parseFloat(parts[0]);
            const cLng = parseFloat(parts[1]);
            const dist = this.getDistanceMeters(lat, lng, cLat, cLng);
            if (dist < 100) return val; // Found nearby!
        }
    }
    return null;
  }

  // Async Method for Background Queue
  async reverseGeocode(lat, lng) {
    // We double check cache here just in case, but usually called after checkCacheInstant fails
    const instant = this.checkCacheInstant(lat, lng);
    if (instant) return instant;

    return this.enqueueRequest(lat, lng, `${lat.toFixed(4)},${lng.toFixed(4)}`);
  }

  checkCustomLocations(lat, lng) {
    if (!FLEET_CONFIG.CUSTOM_LOCATIONS) return null;
    for (const loc of FLEET_CONFIG.CUSTOM_LOCATIONS) {
      const dist = this.getDistanceMeters(lat, lng, loc.lat, loc.lng);
      const radius = loc.radius || 500;
      if (dist <= radius) {
        return {
          city: loc.name,
          wilaya: loc.wilaya || 'Zone Perso',
          country: 'Algérie',
          formatted: `📍 ${loc.name} (${Math.round(dist)}m)`,
          isCustom: true
        };
      }
    }
    return null;
  }

  enqueueRequest(lat, lng, cacheKey) {
      return new Promise((resolve) => {
          this.requestQueue.push({ lat, lng, cacheKey, resolve });
          this.processQueue();
      });
  }

  async processQueue() {
      if (this.activeRequests >= this.MAX_CONCURRENT || this.requestQueue.length === 0) return;

      this.activeRequests++;
      const req = this.requestQueue.shift(); 

      try {
          const result = await this.fetchFromApi(req.lat, req.lng);
          this.cache.set(req.cacheKey, result);
          req.resolve(result);
      } catch (e) {
          req.resolve({ city: '...', wilaya: '...', formatted: 'Erreur Connexion' });
      } finally {
          this.activeRequests--;
          setTimeout(() => this.processQueue(), this.REQUEST_DELAY);
      }
  }

  async fetchFromApi(lat, lng) {
      const apiKey = this.getRotatedKey();
      if (!apiKey) return { city: 'No Key', wilaya: 'Erreur', formatted: 'Missing Key' };

      try {
          const url = `https://api.geoapify.com/v1/geocode/reverse?lat=${lat}&lon=${lng}&apiKey=${apiKey}`;
          const res = await fetch(url);
          if (!res.ok) throw new Error(res.status);
          const data = await res.json();

          const result = {
            city: 'Zone Inconnue',
            wilaya: 'Inconnue',
            country: 'Algérie',
            formatted: 'Adresse introuvable',
            isCustom: false
          };

          if (data.features && data.features.length > 0) {
            const p = data.features[0].properties;
            result.city = p.city || p.town || p.municipality || p.name || 'Zone Rurale';
            result.wilaya = p.state || p.province || 'Algérie';
            result.formatted = p.formatted || `${result.city}, ${result.wilaya}`;
          }
          return result;

      } catch (error) {
          console.warn("API Error:", error);
          throw error;
      }
  }
}

const geocodeService = new GeocodeService(
    FLEET_CONFIG.GEOAPIFY_API_KEY, 
    FLEET_CONFIG.GEOAPIFY_API_KEYS
);