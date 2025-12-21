/**
 * ALGERIA MAP MODULE - TIME MACHINE PRO EDITION
 * Features: 
 * - Live Tracking
 * - Visual History Player (Smart Speed Control)
 * - Decouchage Detection (Overnight outside Zones)
 * - Interactive Dashboard (Filters & Stats)
 * - Focus Mode & High Z-Index Overlays
 */

const AlgeriaMap = {
    map: null,
    markers: {},        // Live Truck Markers
    customMarkers: [],  // Static Locations
    
    // History Layer Groups
    historyLayers: {
        stops: [],
        refills: [],
        decouchages: [],
        start: null
    },
    
    // Animation State
    animationReq: null,
    isPlaying: false,
    speedMultiplier: 10, // Default
    historyPoints: [],
    currentPointIndex: 0,
    animationTick: 0,    // For smooth sub-frame interpolation
    ghostMarker: null,   // The moving truck

    // Data Cache for Stats
    stats: { distance: 0, fuel: 0, stopCount: 0, decouchageCount: 0 },
    
    // Data Cache
    selectedTruck: null,
    truckDataCache: [],
    currentFilter: 'all',
    
    // States
    is3D: false,
    isFollowMode: false,
    currentRoutes: [], 

    // --- INITIALIZATION ---
    init: function() {
        if (!mapboxgl.supported()) { console.error('WebGL missing'); return; }
        
        if (typeof FLEET_CONFIG === 'undefined' || !FLEET_CONFIG.MAPBOX_TOKEN) {
            console.error("FLEET_CONFIG missing"); return;
        }

        mapboxgl.accessToken = FLEET_CONFIG.MAPBOX_TOKEN;

        if (mapboxgl.getRTLTextPluginStatus() === 'unavailable') {
            mapboxgl.setRTLTextPlugin('https://api.mapbox.com/mapbox-gl-js/plugins/mapbox-gl-rtl-text/v0.2.3/mapbox-gl-rtl-text.js', null, true);
        }

        this.map = new mapboxgl.Map({
            container: 'map-container',
            style: 'mapbox://styles/mapbox/streets-v12',
            center: [3.0, 34.0],
            zoom: 5,
            projection: 'globe'
        });

        this.map.addControl(new mapboxgl.NavigationControl(), 'top-right');

        this.map.on('load', () => {
            console.log("✅ Map Engine Ready (Time Machine Pro)");
            this.addTerrainSource();
            this.renderCustomLocations();
            this.setupSearchListeners();
            if(this.truckDataCache.length > 0) this.updateMarkers(this.truckDataCache);
        });

        this.map.on('click', (e) => {
            if (this.map.getSource('history-route')) return; 
            const features = this.map.queryRenderedFeatures(e.point, { layers: ['route-alt', 'route-main'] });
            if (features.length > 0) return; 

            if (this.selectedTruck) {
                this.calculateRoute(
                    this.getCoordinates(this.selectedTruck), 
                    [e.lngLat.lng, e.lngLat.lat], 
                    "Point Carte"
                );
            }
        });
        
        this.map.on('click', 'route-alt', (e) => {
            const index = e.features[0].properties.index;
            this.selectRoute(index);
        });
        this.map.on('mouseenter', 'route-alt', () => { this.map.getCanvas().style.cursor = 'pointer'; });
        this.map.on('mouseleave', 'route-alt', () => { this.map.getCanvas().style.cursor = ''; });
    },
// HELPER: Finds the address when you hover a marker
fetchAddress: function(lat, lng, targetElement) {
    if (targetElement.getAttribute('data-loaded') === 'true') return; // Don't fetch twice
    
    targetElement.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Recherche adresse...';
    
    const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?types=address,poi&limit=1&language=fr&access_token=${mapboxgl.accessToken}`;

    fetch(url)
        .then(res => res.json())
        .then(data => {
            if (data.features && data.features.length > 0) {
                targetElement.innerHTML = `📍 ${data.features[0].place_name_fr || data.features[0].place_name}`;
                targetElement.setAttribute('data-loaded', 'true');
            } else {
                targetElement.innerHTML = '📍 Adresse inconnue (Zone rurale)';
            }
        })
        .catch(err => {
            targetElement.innerHTML = '⚠️ Erreur adresse';
        });
},
    // =========================================================
    // 🎬 VISUAL HISTORY ENGINE (TIME MACHINE)
    // =========================================================

    // 1. Draw Route & Setup
    drawRoute: function(points, coords) {
        this.clearHistory(); 
        this.clearPlanningRoute(); 
        this.hideAllLiveTrucks(); 

        if (!coords || coords.length < 2) return;

        this.historyPoints = points;
        this.calculatePathStats(coords); // Calculate Distance/Fuel immediately

        // Source
        this.map.addSource('history-route', {
            'type': 'geojson',
            'data': {
                'type': 'Feature',
                'properties': {},
                'geometry': { 'type': 'LineString', 'coordinates': coords }
            }
        });

        // Line Layer
        this.map.addLayer({
            'id': 'history-route-line',
            'type': 'line',
            'source': 'history-route',
            'layout': { 'line-join': 'round', 'line-cap': 'round' },
            'paint': { 'line-color': '#e11d48', 'line-width': 5, 'line-opacity': 0.8 }
        });

        // Add Start Flag (Req #1)
        const startEl = document.createElement('div');
        startEl.innerHTML = '<i class="fa-solid fa-flag-checkered"></i>';
        startEl.style.cssText = "color:#16a34a; font-size:24px; filter: drop-shadow(0 2px 2px rgba(0,0,0,0.5)); z-index:5;";
        this.historyLayers.start = new mapboxgl.Marker(startEl).setLngLat(coords[0]).addTo(this.map);

        // Arrows
        this.map.addLayer({
            'id': 'history-route-arrows',
            'type': 'symbol',
            'source': 'history-route',
            'layout': {
                'symbol-placement': 'line', 'text-field': '▶', 
                'text-size': 18, 'symbol-spacing': 80, 'text-keep-upright': false
            },
            'paint': { 'text-color': '#881337' }
        });

        // Zoom to fit
        const bounds = new mapboxgl.LngLatBounds();
        coords.forEach(c => bounds.extend(c));
        this.map.fitBounds(bounds, { padding: 50 });
        
        this.renderPlayerControls();
    },

    // 2. Render Player UI (Dashboard + Controls)
    renderPlayerControls: function() {
        const wrapper = document.getElementById('map-wrapper');
        const player = document.createElement('div');
        player.id = 'historyPlayer';
        
        // --- HTML STRUCTURE ---
        player.innerHTML = `
            <div class="player-controls-row">
                <button id="btnPlay" class="player-btn" onclick="AlgeriaMap.togglePlay()">
                    <i class="fa-solid fa-play"></i>
                </button>
                
                <input type="range" id="timeSlider" min="0" max="${this.historyPoints.length - 1}" value="0" class="player-slider">
                
                <div class="speed-control">
                    <span style="font-size:10px; color:#666; font-weight:bold;">VITESSE</span>
                    <select id="speedSelect" onchange="AlgeriaMap.setSpeed(this.value)" class="player-select">
                        <option value="1">1x (Lent)</option>
                        <option value="5">5x</option>
                        <option value="10" selected>10x</option>
                        <option value="20">20x</option>
                        <option value="50">50x 🚀</option>
                    </select>
                </div>
                
                <button class="player-btn close-btn" onclick="AlgeriaMap.clearHistory()">
                    <i class="fa-solid fa-xmark"></i>
                </button>
            </div>

            <div class="player-stats-row">
                <div class="stats-group">
                    <div class="stat-item">
                        <i class="fa-solid fa-road"></i> <span id="statKm">${this.stats.distance} km</span>
                    </div>
                    <div class="stat-item">
                        <i class="fa-solid fa-gas-pump"></i> <span id="statFuel">${this.stats.fuel} L</span>
                    </div>
                    <div class="stat-item">
                        <i class="fa-solid fa-clock"></i> <span id="playerTime">--:--</span>
                    </div>
                </div>

                <div class="filter-group">
                    <button class="filter-btn active" onclick="AlgeriaMap.toggleLayer('stops', this)" title="Afficher/Masquer Arrêts">
                        <i class="fa-solid fa-parking"></i> <span id="cntStops">0</span>
                    </button>
                    <button class="filter-btn active" onclick="AlgeriaMap.toggleLayer('refills', this)" title="Afficher/Masquer Pleins">
                        <i class="fa-solid fa-gas-pump"></i> <span id="cntRefills">0</span>
                    </button>
                    <button class="filter-btn active" onclick="AlgeriaMap.toggleLayer('decouchages', this)" title="Afficher/Masquer Découchages">
                        <i class="fa-solid fa-moon"></i> <span id="cntDecouch">0</span>
                    </button>
                </div>
            </div>
        `;

        // --- STYLES ---
        const style = document.createElement('style');
        style.id = 'playerStyles';
        style.innerHTML = `
            #historyPlayer {
                position: absolute; bottom: 20px; left: 50%; transform: translateX(-50%);
                width: 95%; max-width: 650px; background: rgba(255,255,255,0.95);
                border-radius: 16px; box-shadow: 0 8px 30px rgba(0,0,0,0.3);
                z-index: 20; backdrop-filter: blur(8px); border: 1px solid #e0e0e0;
                display: flex; flex-direction: column; padding: 12px; gap: 10px;
            }
            .player-controls-row { display: flex; align-items: center; gap: 10px; border-bottom:1px solid #eee; padding-bottom:8px; }
            .player-stats-row { display: flex; justify-content: space-between; align-items: center; font-size:12px; }
            
            .player-btn {
                width: 38px; height: 38px; border-radius: 50%; border: none;
                background: var(--teal); color: white; cursor: pointer; display: flex;
                align-items: center; justify-content: center; font-size: 14px; transition: 0.2s;
            }
            .player-btn:hover { transform: scale(1.1); }
            .player-btn.close-btn { background: #ef4444; margin-left: auto; }

            .player-slider { flex: 1; accent-color: var(--teal); cursor: pointer; height: 6px; }
            
            .speed-control { display: flex; flex-direction: column; gap: 2px; }
            .player-select { padding: 4px; border-radius: 6px; border: 1px solid #ccc; font-size: 11px; font-weight: bold; }

            .stats-group { display: flex; gap: 12px; color: #333; font-weight: 600; font-family: monospace; font-size: 13px; }
            .stat-item i { color: var(--teal); margin-right: 4px; }
            
            .filter-group { display: flex; gap: 6px; }
            .filter-btn {
                border: 1px solid #ccc; background: #f5f5f5; border-radius: 6px;
                padding: 4px 8px; cursor: pointer; font-size: 11px; display: flex; align-items: center; gap: 4px;
                opacity: 0.6; transition: 0.2s;
            }
            .filter-btn.active { opacity: 1; background: #e0f2fe; border-color: #0ea5e9; color: #0284c7; font-weight: bold; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
            .filter-btn:hover { background: #e0f2fe; }
        `;
        wrapper.appendChild(style);
        wrapper.appendChild(player);

        // Slider Listener
        document.getElementById('timeSlider').addEventListener('input', (e) => {
            this.stopAnimation();
            this.moveGhostTo(parseInt(e.target.value));
        });
    },

    // 3. Animation Logic (Improved Speed)
    togglePlay: function() {
        if(this.isPlaying) this.stopAnimation();
        else this.playAnimation();
    },

    setSpeed: function(val) {
        this.speedMultiplier = parseInt(val);
    },

    playAnimation: function() {
        if(this.currentPointIndex >= this.historyPoints.length - 1) {
            this.currentPointIndex = 0; 
            this.animationTick = 0;
        }
        this.isPlaying = true;
        
        const btn = document.getElementById('btnPlay');
        if(btn) btn.innerHTML = '<i class="fa-solid fa-pause"></i>';
        
        this.lastFrameTime = performance.now();
        this.animateFrame();
    },

    stopAnimation: function() {
        this.isPlaying = false;
        if(this.animationReq) cancelAnimationFrame(this.animationReq);
        const btn = document.getElementById('btnPlay');
        if (btn) btn.innerHTML = '<i class="fa-solid fa-play"></i>';
    },

    animateFrame: function(time) {
        if(!this.isPlaying) return;

        // Smart Speed Logic (Req #2)
        // We use a float index for smooth interpolation or frame skipping
        let increment = 0;
        
        if (this.speedMultiplier === 1) increment = 0.2; // Move 1 point every 5 frames (Slow)
        else if (this.speedMultiplier === 5) increment = 0.5; // Move 1 point every 2 frames
        else if (this.speedMultiplier === 10) increment = 1;  // Normal
        else if (this.speedMultiplier === 20) increment = 2; 
        else if (this.speedMultiplier === 50) increment = 5; // Fast

        this.animationTick += increment;

        if (this.animationTick >= 1) {
            const step = Math.floor(this.animationTick);
            this.currentPointIndex += step;
            this.animationTick -= step; // Keep remainder

            if (this.currentPointIndex >= this.historyPoints.length) {
                this.currentPointIndex = this.historyPoints.length - 1;
                this.stopAnimation();
            }

            this.moveGhostTo(this.currentPointIndex);
            
            const slider = document.getElementById('timeSlider');
            if(slider) slider.value = this.currentPointIndex;
        }

        this.animationReq = requestAnimationFrame((t) => this.animateFrame(t));
    },

    moveGhostTo: function(index) {
        this.currentPointIndex = index;
        const p = this.historyPoints[index];
        if(!p) return;

        // Req #1: High Z-Index for Ghost
        if(!this.ghostMarker) {
            const el = document.createElement('div');
            el.innerHTML = '<i class="fa-solid fa-truck-fast"></i>';
            el.style.cssText = "color:#1e40af; font-size:28px; filter: drop-shadow(0 4px 8px rgba(0,0,0,0.4)); z-index: 9999;"; // High Z
            this.ghostMarker = new mapboxgl.Marker(el).setLngLat([p.lng, p.lat]).addTo(this.map);
        } else {
            this.ghostMarker.setLngLat([p.lng, p.lat]);
        }

        // Update Time Display
        const date = new Date(p.time);
        const timeEl = document.getElementById('playerTime');
        if(timeEl) timeEl.innerText = date.toLocaleTimeString().substring(0,5) + ' ' + date.toLocaleDateString();
    },
// --- FIXED: Renamed to match index.html + Update Counts ---
filterMap: function(type, btnElement) {
    this.currentFilter = type;
    
    // Update button UI
    if(btnElement) {
        document.querySelectorAll('.map-filter-btn').forEach(b => b.classList.remove('active'));
        btnElement.classList.add('active');
    }

    this.updateMarkers(this.truckDataCache);
},
addRefillMarkers: function(refills) {
    if (!this.map) return;
    refills.forEach(refill => {
        // 1. Create Icon (Green Pump)
        const el = document.createElement('div');
        el.className = 'history-marker-refill';
        el.innerHTML = '<i class="fa-solid fa-gas-pump"></i>';
        el.style.cssText = "background:#166534; color:white; width:30px; height:30px; border-radius:50%; display:flex; align-items:center; justify-content:center; border:2px solid white; box-shadow:0 0 10px rgba(0,0,0,0.3); cursor:pointer; z-index:10; font-size:14px;";

        // 2. Format Time
        const timeStr = new Date(refill.time).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
        const dateStr = new Date(refill.time).toLocaleDateString('fr-FR');

        // 3. Create Popup Content
        const popupDiv = document.createElement('div');
        popupDiv.style.textAlign = "center";
        popupDiv.innerHTML = `
            <strong style="color:#166534; font-size:12px;">⛽ PLEIN CARBURANT</strong><br>
            <div style="font-size:18px; font-weight:900; margin:4px 0;">+${refill.volume} L</div>
            <div style="font-size:11px; color:#555; margin-bottom:5px;">📅 ${dateStr} à ${timeStr}</div>
            <div class="address-box" style="font-size:10px; color:#555; background:#f0fdf4; padding:4px; border-radius:4px; min-width:150px;">
                📍 Survoler pour l'adresse
            </div>
        `;

        const popup = new mapboxgl.Popup({ offset: 25, closeButton: false }).setDOMContent(popupDiv);

        // 4. Add Hover Logic
        el.addEventListener('mouseenter', () => {
            popup.addTo(this.map);
            const addrBox = popupDiv.querySelector('.address-box');
            this.fetchAddress(refill.lat, refill.lng, addrBox);
        });
        el.addEventListener('mouseleave', () => popup.remove());

        const marker = new mapboxgl.Marker({ element: el }).setLngLat([refill.lng, refill.lat]).setPopup(popup).addTo(this.map);
        this.historyLayers.refills.push(marker);
    });
    this.updateFilterCounts();
},
	
// Update the UI stats in the History Player
    updateStats: function(data) {
        this.stats.distance = data.distance;
        this.stats.fuel = data.fuel;
        
        if(document.getElementById('statKm')) document.getElementById('statKm').innerText = data.distance + ' km';
        if(document.getElementById('statFuel')) document.getElementById('statFuel').innerText = data.fuel + ' L';
        if(document.getElementById('cntStops')) document.getElementById('cntStops').innerText = data.stopCount;
    },
	
addStopMarkers: function(stops) {
    if (!this.map) return;

    stops.forEach(stop => {
        // 1. Check for Decouchage
        if (this.isDecouchage(stop)) {
            this.addDecouchageMarker(stop);
        } else {
            // 2. NORMAL STOP: Small Red "P"
            const el = document.createElement('div');
            el.className = 'history-marker-stop';
            el.innerHTML = 'P';
            el.style.cssText = "background-color: #d32f2f; color: white; width: 24px; height: 24px; border-radius: 4px; display: flex; align-items: center; justify-content: center; border: 1px solid white; font-weight:bold; font-size: 13px; box-shadow: 0 2px 4px rgba(0,0,0,0.3); cursor: pointer; z-index: 5;";

            // 3. Format Time
            const startStr = new Date(stop.startTime).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
            const endStr = new Date(stop.endTime).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

            // 4. Create Popup Content
            const popupDiv = document.createElement('div');
            popupDiv.style.textAlign = "center";
            popupDiv.innerHTML = `
                <strong style="color:#d32f2f; font-size:13px;">✋ ARRÊT</strong><br>
                <div style="font-size:14px; font-weight:800; margin:3px 0; color:#1e293b;">${stop.durationStr}</div>
                <div style="font-size:11px; color:#555; margin-bottom:5px;">🕒 ${startStr} ➝ ${endStr}</div>
                <div class="address-box" style="font-size:10px; color:#555; background:#fff1f2; padding:4px; border-radius:4px; min-width:150px;">
                    📍 Survoler pour l'adresse
                </div>
            `;

            const popup = new mapboxgl.Popup({ offset: 25, closeButton: false }).setDOMContent(popupDiv);

            // 5. Add Hover Logic
            el.addEventListener('mouseenter', () => {
                popup.addTo(this.map);
                const addrBox = popupDiv.querySelector('.address-box');
                this.fetchAddress(stop.lat, stop.lng, addrBox);
            });
            el.addEventListener('mouseleave', () => popup.remove());

            const marker = new mapboxgl.Marker({ element: el }).setLngLat([stop.lng, stop.lat]).setPopup(popup).addTo(this.map);
            this.historyLayers.stops.push(marker);
        }
    });
    this.updateFilterCounts();
},
    // Req #3: Decouchage Logic
    isDecouchage: function(s) {
        // 1. Time Check: Does it cross midnight?
        const start = new Date(s.startTime);
        // We approximate end time based on duration (durationStr parsing is complex, let's assume we pass durationMs if available or parse)
        // Better: Check if start is between 22:00 and 04:00 or simple midnight check
        // User rule: "after the 00 00"
        
        // Simple heuristic: If stop started yesterday and it's a new day now?
        // Or if stop starts very late (e.g. 23:00) and lasts > 4 hours
        // Let's assume ui.js calculated duration correctly.
        
        // STRICT CHECK: Does it cover 00:00:00?
        // Since we don't have endTime explicitly in simple object, let's check start hour
        const hour = start.getHours();
        const isNightStop = (hour >= 20 || hour <= 4); 
        
        // Duration Check (> 4 hours) - We parse "3h 15min" roughly
        let durationHours = 0;
        if(s.durationStr.includes('h')) durationHours = parseInt(s.durationStr.split('h')[0]);
        
        if (isNightStop && durationHours >= 4) {
            // 2. Zone Check (Geofence)
            return !this.isInsideSafeZone(s.lat, s.lng);
        }
        return false;
    },

    isInsideSafeZone: function(lat, lng) {
        if (!FLEET_CONFIG.CUSTOM_LOCATIONS) return false;
        // Check distance to any custom location (Threshold 1km)
        for (const loc of FLEET_CONFIG.CUSTOM_LOCATIONS) {
            const dist = this.getDistanceFromLatLonInKm(lat, lng, loc.lat, loc.lng);
            if (dist < 1.0) return true; // It is inside a zone (safe)
        }
        return false;
    },

addDecouchageMarker: function(s) {
    // 1. Create the Marker Icon (Purple Moon)
    const el = document.createElement('div');
    el.innerHTML = '<i class="fa-solid fa-moon"></i>';
    el.style.cssText = `background-color: #4f46e5; color: white; width: 32px; height: 32px;
        border-radius: 50%; display: flex; align-items: center; justify-content: center;
        border: 2px solid white; box-shadow: 0 0 10px #4f46e5; font-size: 16px; z-index: 15; cursor: pointer;`;

    // 2. Format Time
    const startTime = new Date(s.startTime).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    const fullDate = new Date(s.startTime).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });

    // 3. Create Popup Content (With Address Placeholder)
    const popupDiv = document.createElement('div');
    popupDiv.style.textAlign = "center";
    popupDiv.innerHTML = `
        <strong style="color:#4f46e5; font-size:13px;">💤 DÉCOUCHAGE</strong><br>
        <div style="font-size:11px; font-weight:bold; margin:4px 0;">${fullDate} à ${startTime}</div>
        <div style="font-weight:800; font-size:14px; margin-bottom:4px;">⏱️ ${s.durationStr}</div>
        <div class="address-box" style="font-size:10px; color:#555; background:#f3f4f6; padding:4px; border-radius:4px; margin-top:4px; min-width:150px;">
            📍 Survoler pour l'adresse
        </div>
    `;

    const popup = new mapboxgl.Popup({ offset: 25, closeButton: false }).setDOMContent(popupDiv);

    // 4. Add "Hover" Event to Fetch Address
    el.addEventListener('mouseenter', () => {
        popup.addTo(this.map);
        const addrBox = popupDiv.querySelector('.address-box');
        this.fetchAddress(s.lat, s.lng, addrBox); // Call the helper
    });
    el.addEventListener('mouseleave', () => popup.remove());

    const m = new mapboxgl.Marker(el).setLngLat([s.lng, s.lat]).setPopup(popup).addTo(this.map);
    this.historyLayers.decouchages.push(m);
},

    // 5. Cleanup & Utils
    clearHistory: function() {
        this.stopAnimation();
        this.currentPointIndex = 0;
        this.historyPoints = [];
        this.stats = { distance: 0, fuel: 0, stopCount: 0, decouchageCount: 0 };

        if (this.map.getLayer('history-route-arrows')) this.map.removeLayer('history-route-arrows');
        if (this.map.getLayer('history-route-line')) this.map.removeLayer('history-route-line');
        if (this.map.getSource('history-route')) this.map.removeSource('history-route');
        
        // Clear Arrays
        ['stops', 'refills', 'decouchages'].forEach(k => {
            this.historyLayers[k].forEach(m => m.remove());
            this.historyLayers[k] = [];
        });
        if(this.historyLayers.start) { this.historyLayers.start.remove(); this.historyLayers.start = null; }
        
        if(this.ghostMarker) { this.ghostMarker.remove(); this.ghostMarker = null; }

        const player = document.getElementById('historyPlayer');
        if(player) player.remove();
        const styles = document.getElementById('playerStyles');
        if(styles) styles.remove();
        
        this.showAllLiveTrucks();
        this.map.flyTo({zoom: 5});
    },

    // Calculation Helpers
    calculatePathStats: function(coords) {
        let dist = 0;
        for(let i=1; i<coords.length; i++) {
            dist += this.getDistanceFromLatLonInKm(coords[i-1][1], coords[i-1][0], coords[i][1], coords[i][0]);
        }
        this.stats.distance = dist.toFixed(1);
        
        // Est. Fuel (Use Config if available, else 35L/100)
        let consumption = 35;
        if(this.selectedTruck && getTruckConfig) {
            const conf = getTruckConfig(this.selectedTruck.deviceId || this.selectedTruck.id);
            if(conf.fuelConsumption) consumption = parseFloat(conf.fuelConsumption);
        }
        this.stats.fuel = Math.round((dist/100)*consumption);
    },

    updateFilterCounts: function() {
        if(document.getElementById('cntStops')) document.getElementById('cntStops').innerText = this.historyLayers.stops.length;
        if(document.getElementById('cntRefills')) document.getElementById('cntRefills').innerText = this.historyLayers.refills.length;
        if(document.getElementById('cntDecouch')) document.getElementById('cntDecouch').innerText = this.historyLayers.decouchages.length;
    },

    toggleLayer: function(type, btn) {
        const isHidden = btn.classList.contains('active'); // Current state
        if (isHidden) {
            // Hide
            this.historyLayers[type].forEach(m => m.getElement().style.display = 'none');
            btn.classList.remove('active');
            btn.style.opacity = '0.5';
        } else {
            // Show
            this.historyLayers[type].forEach(m => m.getElement().style.display = 'flex');
            btn.classList.add('active');
            btn.style.opacity = '1';
        }
    },

    getDistanceFromLatLonInKm: function(lat1, lon1, lat2, lon2) {
        const R = 6371; 
        const dLat = this.deg2rad(lat2-lat1);
        const dLon = this.deg2rad(lon2-lon1); 
        const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(this.deg2rad(lat1)) * Math.cos(this.deg2rad(lat2)) * Math.sin(dLon/2) * Math.sin(dLon/2); 
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)); 
        return R * c;
    },
    deg2rad: function(deg) { return deg * (Math.PI/180); },
    
    // Focus Mode Helpers
    hideAllLiveTrucks: function() { Object.values(this.markers).forEach(m => m.getElement().style.display = 'none'); },
    showAllLiveTrucks: function() { Object.values(this.markers).forEach(m => m.getElement().style.display = 'block'); },

    // --- STANDARD ROUTING (Unchanged) ---
    clearPlanningRoute: function() {
        if(this.map.getSource('route-source')) {
            ['route-casing', 'route-main', 'route-alt'].forEach(l => { if(this.map.getLayer(l)) this.map.removeLayer(l); });
            this.map.removeSource('route-source');
        }
        const panel = document.getElementById('route-info-panel');
        if(panel) panel.style.display = 'none';
    },

    calculateRoute: async function(start, end, destName) {
        if(!start || !end) return;
        this.clearHistory(); 
        this.lastRouteDestination = { coords: end, name: destName };
        this.showToast("🛣️ Calcul de l'itinéraire...");
        const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${start[0]},${start[1]};${end[0]},${end[1]}?steps=true&alternatives=true&geometries=geojson&overview=full&access_token=${mapboxgl.accessToken}`;

        try {
            const res = await fetch(url);
            const json = await res.json();
            if (!json.routes || json.routes.length === 0) { alert("Route introuvable."); return; }
            this.currentRoutes = json.routes; 
            this.clearPlanningRoute();
            this.map.addSource('route-source', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });

            this.map.addLayer({
                id: 'route-alt', type: 'line', source: 'route-source',
                filter: ['==', 'type', 'alt'],
                layout: { 'line-join': 'round', 'line-cap': 'round' },
                paint: { 'line-color': '#999999', 'line-width': 8, 'line-opacity': 0.6 }
            });

            this.map.addLayer({
                id: 'route-casing', type: 'line', source: 'route-source',
                filter: ['==', 'type', 'main'],
                layout: { 'line-join': 'round', 'line-cap': 'round' },
                paint: { 'line-color': '#ffffff', 'line-width': 10 }
            });

            this.map.addLayer({
                id: 'route-main', type: 'line', source: 'route-source',
                filter: ['==', 'type', 'main'],
                layout: { 'line-join': 'round', 'line-cap': 'round' },
                paint: { 'line-color': '#0084a7', 'line-width': 6 }
            });

            this.selectRoute(0);
            const bounds = new mapboxgl.LngLatBounds();
            json.routes[0].geometry.coordinates.forEach(c => bounds.extend(c));
            this.map.fitBounds(bounds, { padding: 80 });
        } catch (error) { console.error('Route Error', error); }
    },

    selectRoute: function(index) {
        this.selectedRouteIndex = index;
        const featureCollection = { type: 'FeatureCollection', features: [] };
        this.currentRoutes.forEach((route, idx) => {
            const isMain = (idx === index);
            featureCollection.features.push({
                type: 'Feature',
                properties: { type: isMain ? 'main' : 'alt', index: idx },
                geometry: route.geometry
            });
        });
        this.map.getSource('route-source').setData(featureCollection);
        const r = this.currentRoutes[index];
        this.showRouteStats(r.distance, r.duration, this.lastRouteDestination.name, this.currentRoutes.length - 1);
        if(this.currentRoutes.length > 1) this.showToast(`🔀 Route ${index + 1} sélectionnée`);
    },

    showRouteStats: function(m, s, name, altCount) {
        const km = (m / 1000).toFixed(1);
        const h = Math.floor(s / 3600);
        const min = Math.floor((s % 3600) / 60);
        let consumption = 35;
        if (this.selectedTruck) {
            if (typeof getTruckConfig === 'function') {
                const config = getTruckConfig(this.selectedTruck.deviceId || this.selectedTruck.id);
                if (config.fuelConsumption) consumption = parseFloat(config.fuelConsumption);
            }
        }
        const fuel = Math.round((km / 100) * consumption);
        const panel = document.getElementById('route-info-panel');
        if(panel) {
            panel.style.display = 'flex';
            panel.innerHTML = `
                <div style="margin-right:15px; border-right:1px solid #ddd; padding-right:15px;">
                    <div style="font-weight:bold; color:#0084a7; font-size:14px;">${name}</div>
                    ${altCount > 0 ? `<div style="font-size:10px; color:#666; margin-top:2px;">👆 ${altCount} routes alternatives</div>` : ''}
                </div>
                <div class="route-stat"><strong>${km}</strong><span>km</span></div>
                <div class="route-stat"><strong>${h}h ${min}</strong><span>Temps</span></div>
                <div class="route-stat"><strong style="color:#d32f2f">${fuel} L</strong><span>Est. (${consumption}L/100)</span></div>
            `;
        }
    },

updateMarkers: function(trucks) {
    this.truckDataCache = trucks;
    this.populateTruckList();

    // Live Counts
    const total = trucks.length;
    const moving = trucks.filter(t => t.speed >= 1 && !t.isGpsCut).length;
    const stopped = trucks.filter(t => t.speed < 1 || t.isGpsCut).length;

    if (document.getElementById('mapCountAll')) document.getElementById('mapCountAll').innerText = `(${total})`;
    if (document.getElementById('mapCountMoving')) document.getElementById('mapCountMoving').innerText = `(${moving})`;
    if (document.getElementById('mapCountStopped')) document.getElementById('mapCountStopped').innerText = `(${stopped})`;

    if (!this.map || !this.map.style || !this.map.style.stylesheet) return;
    if (this.isPlaying || this.historyPoints.length > 0) return;

    if (this.selectedTruck && this.isFollowMode) {
        const fresh = trucks.find(t => t.id === this.selectedTruck.id);
        if (fresh) this.map.easeTo({
            center: this.getCoordinates(fresh),
            duration: 1000
        });
    }

    trucks.forEach(truck => {
        const id = truck.deviceId || truck.id;
        const coords = this.getCoordinates(truck);
        if (!coords) return;

        // --- NEW FOCUS LOGIC ---
        // If a truck is selected, SKIP rendering/showing others
        if (this.selectedTruck && this.selectedTruck.id !== id) {
            if (this.markers[id]) this.markers[id].getElement().style.display = 'none';
            return;
        }
        // -----------------------

        if (!this.checkFilter(truck)) {
            if (this.markers[id]) this.markers[id].getElement().style.display = 'none';
            return;
        }

        const isMoving = truck.speed > 0;
        const isSelected = this.selectedTruck && (this.selectedTruck.id === id);
        let markerClass = isMoving ? 'moving' : 'stopped';
        if (truck.isGpsCut) markerClass = 'stopped';

        const popup = new mapboxgl.Popup({
                offset: 25,
                closeButton: false,
                className: 'hover-popup',
                maxWidth: '300px'
            })
            .setHTML(this.getPopupHTML(truck));

        if (this.markers[id]) {
            const m = this.markers[id];
            m.setLngLat(coords);
            m.setPopup(popup);
            m.getElement().style.display = 'block'; // Make sure visible
            const icon = m.getElement().querySelector('.marker-icon');
            icon.className = `marker-icon ${markerClass} ${isSelected ? 'selected' : ''}`;
            if (truck.isGpsCut) {
                icon.style.borderColor = '#333';
                icon.style.backgroundColor = '#ddd';
            } else {
                icon.style.borderColor = '';
                icon.style.backgroundColor = '';
            }
            this.attachMarkerListeners(m.getElement(), popup, truck);
        } else {
            const el = document.createElement('div');
            el.className = 'truck-marker';
            el.innerHTML = `<div class="marker-icon ${markerClass}"><i class="fas fa-truck"></i></div>`;
            if (truck.isGpsCut) {
                el.querySelector('.marker-icon').style.borderColor = '#333';
                el.querySelector('.marker-icon').style.backgroundColor = '#ddd';
            }
            this.attachMarkerListeners(el, popup, truck);
            this.markers[id] = new mapboxgl.Marker(el).setLngLat(coords).setPopup(popup).addTo(this.map);
        }
    });
},
    attachMarkerListeners: function(el, popup, truck) {
        el.onclick = (e) => { e.stopPropagation(); this.selectTruck(truck); popup.addTo(this.map); };
        let timer;
        const keepOpen = () => clearTimeout(timer);
        const closeDelay = () => { timer = setTimeout(() => popup.remove(), 500); };
        el.onmouseenter = () => { keepOpen(); popup.addTo(this.map); const p = popup.getElement(); if(p) { p.onmouseenter=keepOpen; p.onmouseleave=closeDelay; } };
        el.onmouseleave = closeDelay;
    },

    getPopupHTML: function(truck) {
        let statusColor = truck.speed > 0 ? '#2e7d32' : '#d32f2f';
        let statusText = truck.speed > 0 ? 'En Route' : 'Arrêt';
        if(truck.isGpsCut) { statusColor = '#333'; statusText = '⚠️ COUPURE GPS'; }
        const fuelColor = truck.isCriticalFuel ? '#d32f2f' : (truck.isLowFuel ? '#f57c00' : '#2e7d32');
        return `
            <div class="popup-header-box" style="background:${statusColor}">
                <span>${truck.name}</span>
                <span style="font-size:10px; background:rgba(0,0,0,0.2); padding:2px 6px; border-radius:10px;">${statusText}</span>
            </div>
            <div class="popup-body-box">
                <div class="popup-stat-row">
                    <span><span class="popup-stat-icon"><i class="fa-solid fa-map-pin"></i></span> Lieu</span>
                    <span class="popup-stat-value" style="font-weight:400; font-size:11px;">
                        ${truck.location.city || ''} <span style="color:#d97706; font-weight:bold;">(${truck.location.wilaya || 'Algérie'})</span>
                    </span>
                </div>
                <div class="popup-stat-row">
                    <span><span class="popup-stat-icon"><i class="fa-solid fa-gas-pump"></i></span> Carburant</span>
                    <span class="popup-stat-value" style="color:${fuelColor}">${truck.fuelLiters}L (${truck.fuelPercentage}%)</span>
                </div>
                 <div class="popup-stat-row">
                    <span><span class="popup-stat-icon"><i class="fa-solid fa-location-arrow"></i></span> Vitesse</span>
                    <span class="popup-stat-value">${truck.speed} km/h</span>
                </div>
                <div style="display:flex; gap:5px; margin-top:8px;">
                    <button class="popup-action-btn" style="flex:1;" onclick="AlgeriaMap.selectTruckById('${truck.id}')"><i class="fa-solid fa-crosshairs"></i> Suivre</button>
<button class="popup-action-btn" style="flex:1; background:#4f46e5; border-color:#3730a3; color: white;" onclick="window.ui.openHistoryModal('${truck.id}', '${truck.name}')"><i class="fa-solid fa-clock-rotate-left"></i> Historique</button>
                </div>
            </div>`;
    },

    setupSearchListeners: function() {
        const input = document.getElementById('mapDestSearch');
        const resultsBox = document.getElementById('mapSearchResults');
        if(!input || !resultsBox) return;
        input.addEventListener('focus', () => { if(input.value.length === 0) this.showCustomSiteSuggestions(); });
        input.addEventListener('input', (e) => {
            clearTimeout(this.searchDebounce);
            const query = e.target.value.toLowerCase().trim();
            if(query.length === 0) { this.showCustomSiteSuggestions(); return; }
            if(query.length < 3) return;
            this.searchDebounce = setTimeout(() => this.performSmartSearch(query), 800);
        });
        document.addEventListener('click', (e) => { if (!input.contains(e.target) && !resultsBox.contains(e.target)) { resultsBox.style.display = 'none'; } });
    },
    showCustomSiteSuggestions: function() {
        const resultsBox = document.getElementById('mapSearchResults');
        if(!FLEET_CONFIG.CUSTOM_LOCATIONS) return;
        let html = '<div style="padding:8px; font-size:11px; color:#888; font-weight:bold; background:#f9f9f9;">VOS SITES</div>';
        FLEET_CONFIG.CUSTOM_LOCATIONS.forEach(loc => {
            let icon = 'fa-building'; if(loc.type === 'client') icon = 'fa-user-tie'; if(loc.type === 'maintenance') icon = 'fa-wrench';
            html += `<div class="search-result-item result-type-custom" onclick='AlgeriaMap.selectSearchResult(${JSON.stringify(loc)}, "custom")'><div class="result-icon custom"><i class="fa-solid ${icon}"></i></div><div><strong>${loc.name}</strong><br><span>${loc.wilaya || 'Algérie'}</span></div></div>`;
        });
        resultsBox.innerHTML = html; resultsBox.style.display = 'block';
    },
    performSmartSearch: async function(query) {
        const resultsBox = document.getElementById('mapSearchResults');
        resultsBox.innerHTML = '<div style="padding:10px; text-align:center;"><i class="fa-solid fa-spinner fa-spin"></i> Recherche...</div>';
        resultsBox.style.display = 'block';
        let html = '';
        const matchedSites = FLEET_CONFIG.CUSTOM_LOCATIONS.filter(l => l.name.toLowerCase().includes(query));
        if (matchedSites.length > 0) {
            html += '<div style="padding:5px 10px; font-size:10px; font-weight:bold; background:#e8f5e9; color:#2e7d32;">SITES INTERNES</div>';
            matchedSites.forEach(loc => { html += `<div class="search-result-item result-type-custom" onclick='AlgeriaMap.selectSearchResult(${JSON.stringify(loc)}, "custom")'><div class="result-icon custom"><i class="fa-solid fa-star"></i></div><div><strong>${loc.name}</strong></div></div>`; });
        }
        try {
            const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query + ' Algeria')}&limit=5`);
            const apiResults = await res.json();
            if (apiResults.length > 0) {
                html += '<div style="padding:5px 10px; font-size:10px; font-weight:bold; background:#e0f7fa; color:#0084a7;">RÉSULTATS</div>';
                apiResults.forEach(item => {
                    const loc = { lat: parseFloat(item.lat), lng: parseFloat(item.lon), name: item.display_name.split(',')[0] };
                    html += `<div class="search-result-item result-type-api" onclick='AlgeriaMap.selectSearchResult(${JSON.stringify(loc)}, "api")'><div class="result-icon api"><i class="fa-solid fa-earth-africa"></i></div><div><strong>${loc.name}</strong><br><span>${item.display_name}</span></div></div>`;
                });
            }
        } catch(e) {}
        resultsBox.innerHTML = html || '<div style="padding:10px; text-align:center;">Aucun résultat.</div>';
    },
    selectSearchResult: function(loc, type) {
        document.getElementById('mapSearchResults').style.display = 'none';
        document.getElementById('mapDestSearch').value = loc.name;
        if (this.selectedTruck) this.calculateRoute(this.getCoordinates(this.selectedTruck), [loc.lng, loc.lat], loc.name);
        else { this.map.flyTo({ center: [loc.lng, loc.lat], zoom: 14 }); this.showToast(`📍 <b>${loc.name}</b> affiché. Sélectionnez un camion pour y aller.`); }
    },
    renderCustomLocations: function() {
        this.customMarkers.forEach(m => m.remove());
        if(!FLEET_CONFIG.CUSTOM_LOCATIONS) return;
        FLEET_CONFIG.CUSTOM_LOCATIONS.forEach(loc => {
            let typeClass = 'type-other'; let icon = 'fa-map-pin';
            if(loc.type === 'client') { typeClass='type-client'; icon='fa-user-tie'; }
            if(loc.type === 'maintenance') { typeClass='type-maintenance'; icon='fa-wrench'; }
            if(loc.type === 'douroub') { typeClass='type-douroub'; icon='fa-building'; }
            const el = document.createElement('div');
            el.className = `custom-loc-marker ${typeClass}`;
            el.innerHTML = `<div class="custom-loc-label">${loc.name}</div><div class="custom-loc-icon"><i class="fa-solid ${icon}"></i></div>`;
            el.addEventListener('click', (e) => { e.stopPropagation(); if(this.selectedTruck) this.calculateRoute(this.getCoordinates(this.selectedTruck), [loc.lng, loc.lat], loc.name); });
            const m = new mapboxgl.Marker({element: el, anchor:'bottom'}).setLngLat([loc.lng, loc.lat]).addTo(this.map);
            this.customMarkers.push(m);
        });
    },
selectTruck: function(truck) {
    this.selectedTruck = truck;

    // 1. HIDE ALL OTHER TRUCKS (Focus Mode)
    Object.keys(this.markers).forEach(id => {
        const marker = this.markers[id];
        if (id === truck.id) {
            marker.getElement().style.display = 'block'; // Ensure selected is visible
            marker.getElement().querySelector('.marker-icon').classList.add('selected');
        } else {
            marker.getElement().style.display = 'none'; // Hide everyone else
        }
    });

    document.getElementById('mapTruckSelect').value = truck.id;
    if (!this.isFollowMode) this.map.flyTo({
        center: this.getCoordinates(truck),
        zoom: 14
    });
    this.showToast(`🚛 ${truck.name} sélectionné (Focus Mode)`);
},

deselectTruck: function() {
    this.selectedTruck = null;
    this.currentRoutes = [];
    this.isFollowMode = false;
    document.getElementById('btnFollow').classList.remove('active');
    document.getElementById('mapTruckSelect').value = "";

    // 1. SHOW ALL TRUCKS AGAIN
    Object.values(this.markers).forEach(m => {
        m.getElement().style.display = 'block';
        m.getElement().querySelector('.marker-icon').classList.remove('selected');
    });

    this.clearPlanningRoute();
    this.clearHistory();
},

    selectTruckById: function(id) { if(!id) this.deselectTruck(); else this.selectTruck(this.truckDataCache.find(t=>t.id===id)); },
    getCoordinates: function(t) { return t.coordinates ? [t.coordinates.lng, t.coordinates.lat] : [t.lng, t.lat]; },
    populateTruckList: function() {
        const sel = document.getElementById('mapTruckSelect');
        if(!sel || sel.options.length>1) return;
        [...this.truckDataCache].sort((a,b)=>a.name.localeCompare(b.name)).forEach(t=>{ const o = document.createElement('option'); o.value=t.id; o.innerText=`${t.name}`; sel.appendChild(o); });
    },
    checkFilter: function(t) { 
        if(this.currentFilter==='all') return true; 
        if(this.currentFilter==='moving') return t.speed>0; 
        if(this.currentFilter==='stopped') return t.speed===0;
        if(this.currentFilter==='gps_cut') return t.isGpsCut;
        return true; 
    },
    filter: function(t) { this.currentFilter=t; this.updateMarkers(this.truckDataCache); },
    addTerrainSource: function() { if(!this.map.getSource('mapbox-dem')) this.map.addSource('mapbox-dem', {'type':'raster-dem', 'url':'mapbox://mapbox.mapbox-terrain-dem-v1', 'tileSize':512, 'maxzoom':14}); this.map.setFog({}); },
    toggleMode: function(mode) { this.is3D=(mode==='3d'); this.map.flyTo({pitch:this.is3D?60:0, zoom:6}); if(this.is3D) this.map.setTerrain({'source':'mapbox-dem','exaggeration':1.5}); else this.map.setTerrain(null); },
    setStyle: function(s) { const d=this.truckDataCache; this.map.setStyle('mapbox://styles/mapbox/'+s); this.map.once('style.load',()=>{this.addTerrainSource();this.renderCustomLocations();this.updateMarkers(d);}); },
    toggleFollowMode: function() { if(!this.selectedTruck){this.showToast("Sélectionnez un camion");return;} this.isFollowMode=!this.isFollowMode; document.getElementById('btnFollow').classList.toggle('active'); if(this.isFollowMode) this.map.flyTo({center:this.getCoordinates(this.selectedTruck), zoom:17, pitch:60}); },
    toggleBuildings: function() { this.isBuildingsOn=!this.isBuildingsOn; document.getElementById('btnBuild').classList.toggle('active'); if(this.isBuildingsOn) { if(!this.map.getLayer('3d-buildings')) this.map.addLayer({'id':'3d-buildings','source':'composite','source-layer':'building','filter':['==','extrude','true'],'type':'fill-extrusion','minzoom':13,'paint':{'fill-extrusion-color':'#aaa','fill-extrusion-height':['get','height'],'fill-extrusion-base':['get','min_height'],'fill-extrusion-opacity':0.6}}); this.map.flyTo({pitch:45}); } else { if(this.map.getLayer('3d-buildings')) this.map.removeLayer('3d-buildings'); } },
    toggleFullscreen: function() { document.getElementById('map-wrapper').classList.toggle('fullscreen'); this.map.resize(); },
    showToast: function(h) { const t=document.createElement('div'); t.className='map-toast-msg'; t.innerHTML=h; document.getElementById('map-wrapper').appendChild(t); setTimeout(()=>{t.style.opacity=0;setTimeout(()=>t.remove(),500)},4000); }
};

window.AlgeriaMap = AlgeriaMap;