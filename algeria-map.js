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
            style: 'mapbox://styles/mapbox/satellite-streets-v12',
            center: [3.0, 34.0],
            zoom: 5
            // Note: globe projection removed — caused fog.js errors with markers
        });

        // Permanent fix for fog.js 'this.properties is undefined' error
        // Patch _queryFogOpacity to always return 0 (no fog opacity on markers)
        const _origFlyTo = this.map.flyTo.bind(this.map);
        Object.defineProperty(this.map, '_queryFogOpacity', {
            value: function() { return 0; },
            writable: true, configurable: true
        });

        this.map.addControl(new mapboxgl.NavigationControl(), 'top-right');

        this.map.on('load', () => {
            console.log("✅ Map Engine Ready (Time Machine Pro)");
            // Disable fog layer completely
            try { if (typeof this.map.setFog === 'function') this.map.setFog(null); } catch(e) {}
            this.addTerrainSource();
            this.renderCustomLocations();
            this.setupSearchListeners();
            if(this.truckDataCache.length > 0) this.updateMarkers(this.truckDataCache);
        });

        this.map.on('click', (e) => {
            if (this.map.getSource('history-route')) return; 
            let features = []; try { features = this.map.queryRenderedFeatures(e.point, { layers: ['route-alt', 'route-main'] }); } catch(e) {}
            if (features.length > 0) return; 

            if (this.selectedTruck) {
                this.calculateRoute(
                    this.getCoordinates(this.selectedTruck), 
                    [e.lngLat.lng, e.lngLat.lat], 
                    "Point Carte"
                );
            }
        });
        

        // Right-click context menu for creating zones
        this.map.on('contextmenu', (e) => {
            if (window.ui && window.ui._mapPickerMode) return;
            document.getElementById('mapContextMenu')?.remove();
            const lat = e.lngLat.lat;
            const lng = e.lngLat.lng;
            const menu = document.createElement('div');
            menu.id = 'mapContextMenu';
            menu.style.cssText = 'position:fixed;z-index:99999;background:var(--bg-surface, #0f172a);border:1px solid rgba(56,189,248,0.3);border-radius:12px;padding:6px;box-shadow:0 12px 40px rgba(0,0,0,0.6);backdrop-filter:blur(12px);min-width:200px;';
            menu.style.left = e.originalEvent.clientX + 'px';
            menu.style.top = e.originalEvent.clientY + 'px';
            const latF = lat.toFixed(6);
            const lngF = lng.toFixed(6);
            menu.innerHTML = '<div style="padding:6px 10px;font-size:10px;color:var(--text-muted, #64748b);font-weight:700;text-transform:uppercase;letter-spacing:0.05em;">Position: ' + lat.toFixed(5) + ', ' + lng.toFixed(5) + '</div>' +
                '<button onclick="document.getElementById(\'mapContextMenu\').remove();if(window.ui){ui.openZoneClientModal(null);setTimeout(()=>{const la=document.getElementById(\'zme_lat\');const lo=document.getElementById(\'zme_lng\');if(la)la.value=\'' + latF + '\';if(lo)lo.value=\'' + lngF + '\';},100);}" style="display:flex;align-items:center;gap:8px;width:100%;background:none;border:none;color:var(--text-primary, #e2e8f0);padding:10px 12px;border-radius:8px;cursor:pointer;font-size:13px;font-weight:600;text-align:left;" onmouseover="this.style.background=\'rgba(56,189,248,0.1)\'" onmouseout="this.style.background=\'none\'"><i class="fa-solid fa-location-dot" style="color:#38bdf8;font-size:15px;width:18px;"></i> Cr\u00e9er un site ici</button>' +
                '<button onclick="document.getElementById(\'mapContextMenu\').remove();if(window.ui)ui._startZoneMapPicker({})" style="display:flex;align-items:center;gap:8px;width:100%;background:none;border:none;color:var(--text-primary, #e2e8f0);padding:10px 12px;border-radius:8px;cursor:pointer;font-size:13px;font-weight:600;text-align:left;" onmouseover="this.style.background=\'rgba(34,197,94,0.1)\'" onmouseout="this.style.background=\'none\'"><i class="fa-solid fa-draw-polygon" style="color:#22c55e;font-size:15px;width:18px;"></i> Dessiner un rayon</button>';
            document.body.appendChild(menu);
            const closeMenu = (ev) => { if (!menu.contains(ev.target)) { menu.remove(); document.removeEventListener('click', closeMenu); } };
            setTimeout(() => document.addEventListener('click', closeMenu), 50);
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
        // ── STYLE GUARD: Mapbox style can take 30+ seconds to load.
        // If drawRoute is called before the style is ready, defer and retry.
        if (!this.map || !this.map.isStyleLoaded()) {
            console.warn('[AlgeriaMap] Style not ready — deferring drawRoute...');
            const _self = this;
            this.map.once('style.load', function() {
                console.log('[AlgeriaMap] Style loaded — executing deferred drawRoute.');
                _self.drawRoute(points, coords);
            });
            return;
        }

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

        // Zoom to fit (with delay for tab switch transition)
        const bounds = new mapboxgl.LngLatBounds();
        coords.forEach(c => bounds.extend(c));
        setTimeout(() => {
            if (this.map) {
                this.map.resize();
                this.map.fitBounds(bounds, { padding: 50, duration: 800 });
            }
        }, 150);
        
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
                background: #3b82f6; color: white; cursor: pointer; display: flex;
                align-items: center; justify-content: center; font-size: 14px; transition: 0.2s;
            }
            .player-btn:hover { transform: scale(1.1); }
            .player-btn.close-btn { background: #ef4444; margin-left: auto; }

            .player-slider { flex: 1; accent-color: #3b82f6; cursor: pointer; height: 6px; }
            
            .speed-control { display: flex; flex-direction: column; gap: 2px; }
            .player-select { padding: 4px; border-radius: 6px; border: 1px solid #ccc; font-size: 11px; font-weight: bold; }

            .stats-group { display: flex; gap: 12px; color: #333; font-weight: 600; font-family: monospace; font-size: 13px; }
            .stat-item i { color: #3b82f6; margin-right: 4px; }
            
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
        const el = document.createElement('div');
        el.className = 'history-marker-stop';
        el.innerHTML = 'P';
        el.style.cssText = "background-color: #d32f2f; color: white; width: 24px; height: 24px; border-radius: 4px; display: flex; align-items: center; justify-content: center; border: 1px solid white; font-weight:bold; font-size: 13px; box-shadow: 0 2px 4px rgba(0,0,0,0.3); cursor: pointer; z-index: 5;";

        const startStr = new Date(stop.startTime).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
        const endStr = new Date(stop.endTime).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

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

        el.addEventListener('mouseenter', () => {
            popup.addTo(this.map);
            const addrBox = popupDiv.querySelector('.address-box');
            this.fetchAddress(stop.lat, stop.lng, addrBox);
        });
        el.addEventListener('mouseleave', () => popup.remove());

        const marker = new mapboxgl.Marker({ element: el }).setLngLat([stop.lng, stop.lat]).setPopup(popup).addTo(this.map);
        this.historyLayers.stops.push(marker);
    });
    this.updateFilterCounts();
},
    // Req #3: Decouchage Logic
// REPLACEMENT FOR algeria-map.js

    // Corrected: Strict check for 00:00 - 05:00
    isDecouchage: function(s) {
        // 1. Get Stop Times
        const start = new Date(s.startTime);
        const end = new Date(s.endTime);

        // 2. Check if the stop overlaps with the critical window (00:00 to 05:00)
        // We convert everything to "minutes from midnight" to be precise
        const startMin = start.getHours() * 60 + start.getMinutes();
        const endMin = end.getHours() * 60 + end.getMinutes();
        
        // If the stop spans across days, endMin needs to account for that (add 24h)
        const durationMin = (end - start) / 60000;
        
        // Critical Window: 00:00 (0 min) to 05:00 (300 min)
        // A stop is a "Decouchage Risk" if it exists during these hours
        let overlapsMorning = false;

        // Case A: Starts in the window (e.g. 01:00)
        if (startMin >= 0 && startMin < 300) overlapsMorning = true;
        
        // Case B: Ends in the window (e.g. 04:30)
        if (endMin > 0 && endMin <= 300) overlapsMorning = true;
        
        // Case C: Spans over the window (e.g. 23:00 to 06:00)
        // (Start is late night OR previous day) AND (Duration covers the gap)
        if ((start.getHours() >= 20 || start.getHours() <= 5) && durationMin > 240) {
             overlapsMorning = true;
        }

        if (overlapsMorning) {
            // 3. Strict Zone Check (Must be outside DOUROUB sites)
            const isSafe = this.isInsideSafeZone(s.lat, s.lng);
            return !isSafe; // If NOT safe, it is a decouchage
        }
        return false;
    },

    // Corrected: Checks ONLY for 'douroub' type sites
    isInsideSafeZone: function(lat, lng) {
        if (!FLEET_CONFIG.CUSTOM_LOCATIONS) return false;
        
        // Filter: We only care about type 'douroub'
        const safeSites = FLEET_CONFIG.CUSTOM_LOCATIONS.filter(l => l.type === 'douroub');
        
        for (const loc of safeSites) {
            const dist = this.getDistanceFromLatLonInKm(lat, lng, loc.lat, loc.lng);
            const radiusKm = (loc.radius ? loc.radius / 1000 : 0.5); // Default 500m (0.5km) if not set
            if (dist <= radiusKm) return true; // Safe inside Douroub site
        }
        return false;
    },
addDecouchageMarker: function(s) {
    const markerLat = (s.lat !== undefined && s.lat !== null) ? s.lat : (s.locationAtMidnight ? s.locationAtMidnight.lat : null);
    const markerLng = (s.lng !== undefined && s.lng !== null) ? s.lng : (s.locationAtMidnight ? s.locationAtMidnight.lng : null);
    if (markerLat === null || markerLng === null) return;

    const el = document.createElement('div');
    el.innerHTML = '<i class="fa-solid fa-moon"></i>';
    el.style.cssText = `background-color: #4f46e5; color: white; width: 32px; height: 32px;
        border-radius: 50%; display: flex; align-items: center; justify-content: center;
        border: 2px solid white; box-shadow: 0 0 10px #4f46e5; font-size: 16px; z-index: 15; cursor: pointer;`;

    const startTime = new Date(s.startTime || s.detectedAt || Date.now()).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    const fullDate = new Date(s.startTime || s.detectedAt || Date.now()).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
    const distanceHtml = s.distanceFromSite ? `<div style="font-size:10px; color:#64748b; margin-top:4px;">à ${(s.distanceFromSite / 1000).toFixed(1)} km du site</div>` : '';
    const initialLocation = s.locationName ? `📍 ${s.locationName}` : '📍 Recherche...';

    const popupDiv = document.createElement('div');
    popupDiv.style.textAlign = "center";
    popupDiv.innerHTML = `
        <strong style="color:#4f46e5; font-size:13px;">💤 DÉCOUCHAGE</strong><br>
        <div style="font-size:11px; font-weight:bold; margin:4px 0;">${fullDate} à ${startTime}</div>
        <div style="font-weight:800; font-size:14px; margin-bottom:4px;">⏱️ ${s.durationStr || 'Nuit dehors'}</div>
        <div class="address-box" style="font-size:10px; color:#555; background:#f3f4f6; padding:4px; border-radius:4px; margin-top:4px; min-width:150px;">${initialLocation}</div>
        ${distanceHtml}
    `;

    const popup = new mapboxgl.Popup({ offset: 25, closeButton: false }).setDOMContent(popupDiv);

    el.addEventListener('mouseenter', async () => {
        popup.addTo(this.map);
        const addrBox = popupDiv.querySelector('.address-box');
        if (!s.locationName && window.ui && typeof window.ui.resolveLocationNameAsync === 'function') {
            addrBox.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Recherche...';
            try {
                const resolved = await window.ui.resolveLocationNameAsync(markerLat, markerLng);
                addrBox.innerHTML = `📍 ${resolved}`;
            } catch (e) {
                addrBox.innerHTML = `📍 ${markerLat.toFixed(4)}, ${markerLng.toFixed(4)}`;
            }
        }
    });
    el.addEventListener('mouseleave', () => popup.remove());

    const m = new mapboxgl.Marker(el).setLngLat([markerLng, markerLat]).setPopup(popup).addTo(this.map);
    this.historyLayers.decouchages.push(m);
},

    // 5. Cleanup & Utils
    clearHistory: function() {
        this.stopAnimation();
        this.currentPointIndex = 0;
        this.historyPoints = [];
        this.stats = { distance: 0, fuel: 0, stopCount: 0, decouchageCount: 0 };

        // Guard: only touch map sources/layers if style is fully loaded
        if (this.map && this.map.isStyleLoaded()) {
            try { if (this.map.getLayer('history-route-arrows')) this.map.removeLayer('history-route-arrows'); } catch(e) {}
            try { if (this.map.getLayer('history-route-line')) this.map.removeLayer('history-route-line'); } catch(e) {}
            try { if (this.map.getSource('history-route')) this.map.removeSource('history-route'); } catch(e) {}
        }
        
        // Clear Arrays (markers are DOM elements, safe to remove regardless)
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
        if (this.map) this.map.flyTo({zoom: 5});
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
        if(this.map && this.map.isStyleLoaded() && this.map.getSource('route-source')) {
            try { ['route-casing', 'route-main', 'route-alt'].forEach(l => { if(this.map.getLayer(l)) this.map.removeLayer(l); }); } catch(e) {}
            try { this.map.removeSource('route-source'); } catch(e) {}
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
            if (!this.map.isStyleLoaded()) {
                console.warn('[AlgeriaMap] calculateRoute: style not ready, deferring...');
                this.map.once('style.load', () => this.calculateRoute(start, end, destName));
                return;
            }
            try {
                this.map.addSource('route-source', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
                this.map.addLayer({ id: 'route-alt', type: 'line', source: 'route-source', filter: ['==', 'type', 'alt'], layout: { 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': '#999999', 'line-width': 8, 'line-opacity': 0.6 } });
                this.map.addLayer({ id: 'route-casing', type: 'line', source: 'route-source', filter: ['==', 'type', 'main'], layout: { 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': '#ffffff', 'line-width': 10 } });
                this.map.addLayer({ id: 'route-main', type: 'line', source: 'route-source', filter: ['==', 'type', 'main'], layout: { 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': '#0084a7', 'line-width': 6 } });
            } catch(e) { console.error('[AlgeriaMap] calculateRoute addSource/addLayer error:', e); return; }

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
    
    // Filter trucks for panel based on active map filters
    const filteredTrucks = trucks.filter(t => this.checkFilter(t));
    this.updatePanelTruckList(filteredTrucks);

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
              if (this.trucksVisible === false) el.style.display = 'none';
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
        
        // Get truck metadata (card, immatriculation)
        const db = (window.ui && ui.truckDbCache || []).find(d => d.deviceId === truck.id) || {};
        const metaHtml = (db.carteNaftal || db.immatriculation) ? `<div style="display:flex;gap:4px;flex-wrap:wrap;margin-bottom:8px;">
            ${db.immatriculation ? `<span style="background:#e0f2fe;color:#0284c7;padding:2px 8px;border-radius:10px;font-size:9px;font-weight:700;">🚛 ${db.immatriculation}</span>` : ''}
            ${db.carteNaftal ? `<span style="background:#fef3c7;color:#b45309;padding:2px 8px;border-radius:10px;font-size:9px;font-weight:700;">⛽ Carte ${db.carteNaftal}</span>` : ''}
        </div>` : '';
        
        // Check which zone this truck is in
        const coords = this.getCoordinates(truck);
        let zoneHtml = '';
        if (coords && FLEET_CONFIG.CUSTOM_LOCATIONS) {
            for (const loc of FLEET_CONFIG.CUSTOM_LOCATIONS) {
                const dist = this._getDistMeters(coords[1], coords[0], loc.lat, loc.lng);
                if (dist <= (loc.radius || 500)) {
                    zoneHtml = `<div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:6px;padding:6px 10px;margin-bottom:8px;display:flex;align-items:center;gap:6px;">
                        <i class="fa-solid fa-location-dot" style="color:#22c55e;"></i>
                        <div><div style="font-size:10px;color:#166534;font-weight:700;">DANS LA ZONE</div><div style="font-size:12px;color:#15803d;font-weight:600;">${loc.name}</div></div>
                    </div>`;
                    break;
                }
            }
        }
        
        // Check active operations for this truck
        let opHtml = '';
        if (window.ui && ui._zoneOperations) {
            const activeOps = (ui._zoneOperations || []).filter(op => op.deviceId === truck.id && ['pending','active'].includes(op.status));
            if (activeOps.length > 0) {
                const op = activeOps[0];
                opHtml = `<div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:6px;padding:6px 10px;margin-bottom:8px;">
                    <div style="font-size:10px;color:#1d4ed8;font-weight:700;">📋 OPÉRATION EN COURS</div>
                    <div style="font-size:12px;color:#1e40af;font-weight:600;">${op.operationName}</div>
                    <div style="font-size:10px;color:#3b82f6;">Statut: ${op.status}</div>
                </div>`;
            }
        }
        
        return `
            <div style="font-family:'Segoe UI',system-ui,sans-serif;min-width:240px;">
              <div style="background:${statusColor}; padding:10px 14px; display:flex; justify-content:space-between; align-items:center;">
                <div style="display:flex; align-items:center; gap:8px;">
                  <div style="width:32px; height:32px; border-radius:8px; background:rgba(255,255,255,0.2); display:flex; align-items:center; justify-content:center;">
                    <i class="fa-solid fa-truck" style="color:white; font-size:14px;"></i>
                  </div>
                  <div>
                    <div style="font-weight:800; font-size:14px; color:white; letter-spacing:0.5px;">${truck.name}</div>
                    <div style="font-size:10px; color:rgba(255,255,255,0.8); font-weight:500;">${truck.location.city || ''}, ${truck.location.wilaya || 'Algérie'}</div>
                  </div>
                </div>
                <span style="font-size:9px; background:rgba(255,255,255,0.25); padding:3px 8px; border-radius:10px; color:white; font-weight:700; text-transform:uppercase; letter-spacing:0.5px;">${statusText}</span>
              </div>
              <div style="padding:12px 14px; background:white;">
                ${metaHtml}
                ${zoneHtml}
                ${opHtml}
                <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-bottom:10px;">
                  <div style="background:#f8fafc; border-radius:8px; padding:8px 10px; text-align:center; border:1px solid #e2e8f0;">
                    <div style="font-size:9px; text-transform:uppercase; color:#94a3b8; font-weight:700; letter-spacing:0.5px;">Vitesse</div>
                    <div style="font-size:18px; font-weight:800; color:${truck.speed > 0 ? '#0284c7' : '#94a3b8'};">${truck.speed}<span style="font-size:10px; font-weight:500;"> km/h</span></div>
                  </div>
                  <div style="background:#f8fafc; border-radius:8px; padding:8px 10px; text-align:center; border:1px solid #e2e8f0;">
                    <div style="font-size:9px; text-transform:uppercase; color:#94a3b8; font-weight:700; letter-spacing:0.5px;">Carburant</div>
                    <div style="font-size:18px; font-weight:800; color:${fuelColor};">${truck.fuelPercentage}<span style="font-size:10px; font-weight:500;">%</span></div>
                  </div>
                </div>
                <div style="background:#f8fafc; border-radius:6px; padding:6px 10px; margin-bottom:10px; border:1px solid #e2e8f0;">
                  <div style="display:flex; justify-content:space-between; align-items:center;">
                    <span style="font-size:10px; color:#64748b;"><i class="fa-solid fa-gas-pump" style="width:14px;"></i> Niveau</span>
                    <span style="font-size:11px; font-weight:700; color:${fuelColor};">${truck.fuelLiters}L</span>
                  </div>
                  <div style="margin-top:4px; height:4px; background:#e2e8f0; border-radius:2px; overflow:hidden;">
                    <div style="height:100%; width:${Math.min(truck.fuelPercentage, 100)}%; background:${fuelColor}; border-radius:2px; transition:width 0.3s;"></div>
                  </div>
                </div>
                <div style="display:flex; gap:6px;">
                  <button class="popup-action-btn" style="flex:1; background:#f0f9ff; color:#0284c7; border:1px solid #bae6fd; font-weight:700; border-radius:6px; padding:7px; font-size:11px; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:4px;" onclick="AlgeriaMap.selectTruckById('${truck.id}')"><i class="fa-solid fa-crosshairs"></i> Suivre</button>
                  <button class="popup-action-btn" style="flex:1; background:#4f46e5; color:white; border:none; font-weight:700; border-radius:6px; padding:7px; font-size:11px; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:4px;" onclick="window.ui.openHistoryModal('${truck.id}', '${(truck.name||'').replace(/'/g, "\\'")}')"><i class="fa-solid fa-clock-rotate-left"></i> Historique</button>
                </div>
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
        // Clean up old markers
        this.customMarkers.forEach(m => m.remove());
        this.customMarkers = [];
        
        // Clean up old circle layers
        if (this.map && this.map.isStyleLoaded()) {
            try { if (this.map.getLayer('zone-circles-fill')) this.map.removeLayer('zone-circles-fill'); } catch(e) {}
            try { if (this.map.getLayer('zone-circles-line')) this.map.removeLayer('zone-circles-line'); } catch(e) {}
            try { if (this.map.getLayer('zone-labels')) this.map.removeLayer('zone-labels'); } catch(e) {}
            try { if (this.map.getSource('zone-circles')) this.map.removeSource('zone-circles'); } catch(e) {}
        }
        
        if(!FLEET_CONFIG.CUSTOM_LOCATIONS || !FLEET_CONFIG.CUSTOM_LOCATIONS.length) return;
        
        const typeColors = {
            client:      '#3b82f6',
            subclient:   '#22d3ee',
            maintenance: '#f97316',
            station:     '#eab308',
            douroub:     '#22c55e',
            other:       '#6b7280'
        };
        const typeIcons = {
            client:      'fa-user-tie',
            subclient:   'fa-users',
            maintenance: 'fa-wrench',
            station:     'fa-gas-pump',
            douroub:     'fa-building',
            other:       'fa-map-pin'
        };
        const typeLabels = {
            client:      '💼 Client / Livraison',
            subclient:   '📦 Sous-Client',
            maintenance: '🔧 Maintenance / Garage',
            station:     '⛽ Station Carburant',
            douroub:     '🏭 Site Douroub',
            other:       '📍 Autre'
        };

        // Build GeoJSON circle features
        const features = [];
        
        FLEET_CONFIG.CUSTOM_LOCATIONS.forEach((loc, idx) => {
            const locType = loc.type || 'other';
            const typeClass = 'type-' + locType;
            const icon = typeIcons[locType] || 'fa-map-pin';
            const color = typeColors[locType] || '#6b7280';
            
            // Color priority: 1) zone.color  2) finalClient.color  3) client.color  4) type fallback
            let circleColor = loc.color || color;
            let resolvedFAIcon = loc.icon || icon;

            // If zone has NO custom color, check client hierarchy
            if (!loc.color && loc.clientId && FLEET_CONFIG.CLIENTS) {
                const _cl = FLEET_CONFIG.CLIENTS.find(c => c.id === loc.clientId);
                if (_cl && _cl.color) circleColor = _cl.color;
                if (_cl && _cl.icon && !loc.icon) resolvedFAIcon = _cl.icon;
                // Final client color overrides client color
                if (loc.finalClientId && _cl && _cl.finalClients) {
                    const _fc = _cl.finalClients.find(f => f.id === loc.finalClientId);
                    if (_fc && _fc.color) circleColor = _fc.color;
                    if (_fc && _fc.icon) resolvedFAIcon = _fc.icon;
                }
            }
            
            // Get client/finalClient names for label
            let clientLabel = '';
            let clientName = '';
            let finalClientName = '';
            if (loc.clientId && FLEET_CONFIG.CLIENTS) {
                const client = FLEET_CONFIG.CLIENTS.find(c => c.id === loc.clientId);
                if (client) {
                    clientName = client.name;
                    clientLabel = ` <span style="opacity:0.7;font-size:8px;">• ${client.name}</span>`;
                    if (loc.finalClientId && client.finalClients) {
                        const fc = client.finalClients.find(f => f.id === loc.finalClientId);
                        if (fc) finalClientName = fc.name;
                    }
                }
            }
            
            // Create professional marker with custom color + icon
            const el = document.createElement('div');
            el.className = `custom-loc-marker ${typeClass}`;
            const _iconHtml = loc.iconEmoji
              ? `<span style="font-size:15px;line-height:1;">${loc.iconEmoji}</span>`
              : `<i class="fa-solid ${resolvedFAIcon}"></i>`;
            el.innerHTML = `<div class="custom-loc-label" style="border-color:${circleColor}55;">${loc.name}${clientLabel}</div><div class="custom-loc-icon" style="background:${circleColor};border:2px solid ${circleColor}cc;">${_iconHtml}</div>`;
            
            // Count trucks currently in this zone
            const trucksHere = (this.truckDataCache||[]).filter(t => {
                const c = this.getCoordinates(t);
                if (!c) return false;
                return this._getDistMeters(c[1], c[0], loc.lat, loc.lng) <= (loc.radius || 500);
            });
            let truckListHtml = '';
            if (trucksHere.length > 0) {
                const pills = trucksHere.map(t => {
                    const color = t.speed > 0 ? '#22c55e' : '#f59e0b';
                    return `<span style="display:inline-flex;align-items:center;gap:4px;background:var(--bg-deep);border:1px solid var(--border);color:var(--text-primary);padding:2px 6px;border-radius:12px;font-size:9px;font-weight:700;"><span style="color:${color};font-size:8px;">●</span>${t.name}</span>`;
                }).join('');
                
                truckListHtml = `<div style="margin-top:8px;padding-top:8px;border-top:1px solid var(--border);">
                    <div style="font-size:10px;color:var(--text-muted);font-weight:700;margin-bottom:6px;display:flex;justify-content:space-between;">
                        <span>🚛 ${trucksHere.length} CAMION${trucksHere.length>1?'S':''} ICI</span>
                        <span style="color:var(--primary);">${trucksHere.filter(t=>t.speed>0).length} en route</span>
                    </div>
                    <div style="display:flex;flex-wrap:wrap;gap:4px;max-height:150px;overflow-y:auto;padding-right:4px;">
                        ${pills}
                    </div>
                   </div>`;
            }
            
            // Zone popup with edit/delete actions
            const zoneIdx = idx;
            const popupHtml = `<div style="padding:12px 14px;font-family:system-ui,sans-serif;min-width:200px;">
                <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;"><div style="font-weight:800;font-size:14px;color:${circleColor};flex:1;margin-right:8px;">${loc.name}</div><div style="display:flex;gap:4px;flex-shrink:0;"><button onclick="if(window.ui)ui.openZoneClientModal(${zoneIdx})" style="background:rgba(99,102,241,0.12);border:1px solid rgba(99,102,241,0.25);color:#818cf8;border-radius:6px;width:26px;height:26px;cursor:pointer;font-size:11px;display:flex;align-items:center;justify-content:center;" title="Modifier"><i class="fa-solid fa-pen"></i></button><button onclick="if(confirm('Supprimer ?')){FLEET_CONFIG.CUSTOM_LOCATIONS.splice(${zoneIdx},1);if(window.ui)ui.saveSettingsToCloud();if(window.AlgeriaMap)AlgeriaMap.renderCustomLocations();}" style="background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.2);color:#f87171;border-radius:6px;width:26px;height:26px;cursor:pointer;font-size:11px;display:flex;align-items:center;justify-content:center;" title="Supprimer"><i class="fa-solid fa-trash"></i></button></div></div>
                <div style="font-size:11px;color:var(--text-muted);margin-bottom:4px;display:flex;align-items:center;gap:5px;"><i class="fa-solid ${resolvedFAIcon}" style="color:${circleColor};width:14px;"></i>${typeLabels[locType] || 'Autre'}</div>
                <div style="font-size:11px;color:var(--text-muted);margin-bottom:3px;">📍 ${loc.wilaya || 'Algérie'}</div>
                <div style="font-size:11px;color:var(--text-muted);">📏 Rayon: ${loc.radius || 500}m</div>
                ${clientName ? `<div style="font-size:11px;padding:4px 8px;margin-top:5px;background:rgba(59,130,246,0.1);border-radius:5px;color:#3b82f6;font-weight:600;"><i class="fa-solid fa-user-tie"></i> ${clientName}${finalClientName ? ' → '+finalClientName : ''}</div>` : ''}
                ${truckListHtml}
            </div>`;
            const popup = new mapboxgl.Popup({ offset: 30, closeButton: true, maxWidth: '280px', className: 'zone-popup-theme' }).setHTML(popupHtml);
            
            popup.on('open', () => {
                trucksHere.forEach(t => {
                    const id = t.id || t.deviceId;
                    if (this.markers && this.markers[id] && this.markers[id].getElement()) {
                        this.markers[id].getElement().style.display = 'none';
                    }
                });
            });
            
            popup.on('close', () => {
                trucksHere.forEach(t => {
                    const id = t.id || t.deviceId;
                    if (this.markers && this.markers[id] && this.markers[id].getElement()) {
                        this.markers[id].getElement().style.display = '';
                    }
                });
            });
            
            el.addEventListener('click', (e) => { 
                e.stopPropagation(); 
                popup.setLngLat([loc.lng, loc.lat]).addTo(this.map);
                if(this.selectedTruck) this.calculateRoute(this.getCoordinates(this.selectedTruck), [loc.lng, loc.lat], loc.name); 
            });
            const m = new mapboxgl.Marker({element: el, anchor:'bottom'}).setLngLat([loc.lng, loc.lat]).addTo(this.map);
            this.customMarkers.push(m);
            
            // Build circle polygon for the radius
            const radiusKm = (loc.radius || 500) / 1000;
            const circleCoords = this._generateCircleCoords(loc.lng, loc.lat, radiusKm, 64);
            features.push({
                type: 'Feature',
                properties: { 
                    name: loc.name,
                    color: circleColor,
                    strokeColor: loc.strokeColor || circleColor,
                    opacity: (loc.opacity !== undefined && loc.opacity !== null) ? Number(loc.opacity) : 0.15,
                    type: loc.type || 'other',
                    idx: idx
                },
                geometry: { type: 'Polygon', coordinates: [circleCoords] }
            });
        });
        
        // Add GeoJSON source with all circles (style-safe)

        console.log('[AlgeriaMap] renderCustomLocations features:', JSON.stringify(features[0]));
        try {
            if (this.map.getSource('zone-circles')) {
                this.map.getSource('zone-circles').setData({ type: 'FeatureCollection', features: features });
            } else {
                this.map.addSource('zone-circles', {
                    type: 'geojson',
                    data: { type: 'FeatureCollection', features: features }
                });

                // Fill layer (translucent)
                this.map.addLayer({ id: 'zone-circles-fill', type: 'fill', source: 'zone-circles', paint: { 'fill-color': ['get', 'color'], 'fill-opacity': ['get', 'opacity'] } });

                // Outline layer
                this.map.addLayer({ id: 'zone-circles-line', type: 'line', source: 'zone-circles', paint: { 'line-color': ['get', 'strokeColor'], 'line-width': 2.5, 'line-opacity': 0.85, 'line-dasharray': [4, 2] } });

                // Zone click → show history in left panel
                this.map.on('click', 'zone-circles-fill', (e) => {
                    if (!e.features || !e.features[0]) return;
                    const props = e.features[0].properties;
                    this.showZoneHistoryPanel(props.name);
                });
                this.map.on('mouseenter', 'zone-circles-fill', () => { this.map.getCanvas().style.cursor = 'pointer'; });
                this.map.on('mouseleave', 'zone-circles-fill', () => { this.map.getCanvas().style.cursor = ''; });
            }
        } catch(e) { console.error('[AlgeriaMap] renderCustomLocations zone-circles error:', e); }
    },

    
    // Helper: generate circle coordinates around a point
    _generateCircleCoords: function(lng, lat, radiusKm, steps) {
        const coords = [];
        const numLat = parseFloat(lat);
        const numLng = parseFloat(lng);
        for (let i = 0; i < steps; i++) {
            const angle = (i / steps) * 2 * Math.PI;
            const dx = radiusKm * Math.cos(angle);
            const dy = radiusKm * Math.sin(angle);
            const newLat = numLat + (dy / 110.574);
            const newLng = numLng + (dx / (111.320 * Math.cos(numLat * Math.PI / 180)));
            coords.push([newLng, newLat]);
        }
        coords.push(coords[0]); // Explicitly close the ring for GeoJSON
        return coords;
    },

    _getDistMeters: function(lat1, lng1, lat2, lng2) {
        const R = 6371000;
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLng = (lng2 - lng1) * Math.PI / 180;
        const a = Math.sin(dLat/2) * Math.sin(dLat/2) + Math.cos(lat1*Math.PI/180) * Math.cos(lat2*Math.PI/180) * Math.sin(dLng/2) * Math.sin(dLng/2);
        return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
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

    const mts = document.getElementById('mapTruckSelect'); if(mts) mts.value = truck.id;
    if (!this.isFollowMode) this.map.flyTo({
        center: this.getCoordinates(truck),
        zoom: 14
    });
    this.showToast(`🚛 ${truck.name} sélectionné (Focus Mode)`);
    if (this.operationMode) this.drawOperationRoute(truck);
},

deselectTruck: function() {
    this.selectedTruck = null;
    this.currentRoutes = [];
    this.isFollowMode = false;
    const btnFol = document.getElementById('btnFollow'); if(btnFol) btnFol.classList.remove('active');
    document.getElementById('mapTruckSelect').value = "";

    // 1. SHOW ALL TRUCKS AGAIN
    Object.values(this.markers).forEach(m => {
        m.getElement().style.display = 'block';
        m.getElement().querySelector('.marker-icon').classList.remove('selected');
    });

    this.clearPlanningRoute();
    this.clearHistory();
},

    selectTruckById: function(id) {
      if (!id) { this.deselectTruck(); return; }
      const sid = String(id);
      // Match by truck.id first, then by truck.deviceId (IMEI)
      const t = this.truckDataCache.find(t => String(t.id) === sid || String(t.deviceId) === sid);
      if (t) {
        this.selectTruck(t);
        const m = this.markers[t.id];
        if (m) { const p = m.getPopup(); if (p && !p.isOpen()) m.togglePopup(); }
      }
    },
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
    toggleFullscreen: function() { 
        const elem = document.getElementById('map-wrapper');
        if (!document.fullscreenElement) {
            if (elem.requestFullscreen) { elem.requestFullscreen(); }
            else if (elem.webkitRequestFullscreen) { elem.webkitRequestFullscreen(); }
            else if (elem.msRequestFullscreen) { elem.msRequestFullscreen(); }
        } else {
            if (document.exitFullscreen) { document.exitFullscreen(); }
            else if (document.webkitExitFullscreen) { document.webkitExitFullscreen(); }
            else if (document.msExitFullscreen) { document.msExitFullscreen(); }
        }
        setTimeout(() => this.map.resize(), 200);
    },    showToast: function(h) { const t=document.createElement('div'); t.className='map-toast-msg'; t.innerHTML=h; document.getElementById('map-wrapper').appendChild(t); setTimeout(()=>{t.style.opacity=0;setTimeout(()=>t.remove(),500)},4000); },

    toggleZoneCircles: function(btn) {
        this.zonesVisible = this.zonesVisible === false ? true : false;
        const isOn = this.zonesVisible !== false;
        ['zone-circles-fill','zone-circles-line'].forEach(id => {
            if (this.map.getLayer(id)) this.map.setLayoutProperty(id, 'visibility', isOn ? 'visible' : 'none');
        });
        this.customMarkers.forEach(m => { if (m.getElement) m.getElement().style.display = isOn ? '' : 'none'; });
        if (btn) { btn.classList.toggle('active', isOn); btn.title = isOn ? 'Masquer Zones' : 'Afficher Zones'; }
        this.showToast(isOn ? '🟢 Zones affichées' : '🔴 Zones masquées');
    },

    // Toggle truck markers visibility
    toggleTruckMarkers: function(btn) {
        this.trucksVisible = this.trucksVisible === false ? true : (this.trucksVisible === undefined ? false : !this.trucksVisible);
        const isOn = this.trucksVisible !== false;
        if (this.markers) {
            Object.values(this.markers).forEach(m => {
                if (m && m.getElement) m.getElement().style.display = isOn ? '' : 'none';
            });
        }
        if (btn) {
            btn.classList.toggle('active', isOn);
            btn.style.color = isOn ? '#22c55e' : '';
            btn.title = isOn ? 'Masquer Camions' : 'Afficher Camions';
        }
        this.showToast(isOn ? '🟢 Camions affichés' : '🔴 Camions masqués');
    },

    toggleOperationMode: function(btn) {
        this.operationMode = !this.operationMode;
        if (btn) btn.classList.toggle('active', this.operationMode);
        if (this.operationMode) {
            this.showToast('🛣️ Mode Opération ON — Sélectionnez un camion pour voir sa trajectoire prévue');
        } else {
            // Remove operation route if shown
            if (this.map && this.map.isStyleLoaded()) {
                try { ['op-route-line','op-route-stops'].forEach(id => { if (this.map.getLayer(id)) this.map.removeLayer(id); }); } catch(e) {}
                try { if (this.map.getSource('op-route')) this.map.removeSource('op-route'); } catch(e) {}
            }
            const panel = document.getElementById('opRoutePanel');
            if (panel) panel.remove();
            this.showToast('Mode Opération désactivé');
        }
    },

    drawOperationRoute: async function(truck) {
        if (!this.operationMode || !truck) return;
        // Clean old op route
        if (this.map && this.map.isStyleLoaded()) {
            try { ['op-route-line','op-route-stops'].forEach(id => { if (this.map.getLayer(id)) this.map.removeLayer(id); }); } catch(e) {}
            try { if (this.map.getSource('op-route')) this.map.removeSource('op-route'); } catch(e) {}
        }
        const panel = document.getElementById('opRoutePanel');
        if (panel) panel.remove();

        try {
            const base = typeof FLEET_CONFIG !== 'undefined' && FLEET_CONFIG.API ? FLEET_CONFIG.API.baseUrl : '';
            const res = await fetch(`${base}/api/zone-operations?truck=${encodeURIComponent(truck.name || truck.id)}&status=pending,active`);
            if (!res.ok) return;
            const ops = await res.json();
            if (!ops.length) { this.showToast('Aucune opération en cours pour ce camion'); return; }

            const op = ops[0]; // latest op
            const stops = (op.route || []).filter(s => s.zoneName);
            if (stops.length < 2) return;

            // Build waypoints from zone locations
            const locs = FLEET_CONFIG.CUSTOM_LOCATIONS || [];
            const waypoints = stops.map(s => {
                const loc = locs.find(l => l.name === s.zoneName);
                return loc ? [loc.lng, loc.lat] : null;
            }).filter(Boolean);

            if (waypoints.length < 2) { this.showToast('Zones introuvables sur la carte'); return; }

            // Get route from Mapbox
            const coordStr = waypoints.map(c => c.join(',')).join(';');
            const routeRes = await fetch(`https://api.mapbox.com/directions/v5/mapbox/driving/${coordStr}?geometries=geojson&overview=full&access_token=${mapboxgl.accessToken}`);
            const routeJson = await routeRes.json();

            if (!routeJson.routes || !routeJson.routes[0]) return;
            const geom = routeJson.routes[0].geometry;

            this.map.addSource('op-route', { type: 'geojson', data: { type: 'Feature', geometry: geom, properties: {} } });
            this.map.addLayer({ id: 'op-route-line', type: 'line', source: 'op-route',
                layout: { 'line-join':'round','line-cap':'round' },
                paint: { 'line-color':'#f59e0b','line-width':5,'line-dasharray':[2,1],'line-opacity':0.85 }
            });

            // Add stop markers
            stops.forEach((s, i) => {
                const loc = locs.find(l => l.name === s.zoneName);
                if (!loc) return;
                const statusColors = { pending:'#94a3b8', arrived:'#22c55e', departed:'#3b82f6', late:'#ef4444' };
                const el = document.createElement('div');
                el.style.cssText = `background:${statusColors[s.status]||'#94a3b8'};color:white;width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:12px;border:2px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.4);`;
                el.textContent = i + 1;
                const popup = new mapboxgl.Popup({ offset:20, closeButton:false }).setHTML(
                    `<div style="padding:8px;min-width:160px;">
                        <div style="font-weight:700;font-size:13px;">${s.zoneName}</div>
                        <div style="font-size:11px;color:#888;margin-top:2px;">Stop ${i+1} — ${s.status}</div>
                        ${s.expectedArrival ? `<div style="font-size:11px;color:#555;margin-top:3px;">⏰ Arrivée prévue: ${new Date(s.expectedArrival).toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'})}</div>` : ''}
                    </div>`
                );
                el.addEventListener('mouseenter', () => popup.setLngLat([loc.lng, loc.lat]).addTo(this.map));
                el.addEventListener('mouseleave', () => popup.remove());
                new mapboxgl.Marker({ element: el }).setLngLat([loc.lng, loc.lat]).addTo(this.map);
            });

            // Info panel
            const wrapper = document.getElementById('map-wrapper');
            const infoPanel = document.createElement('div');
            infoPanel.id = 'opRoutePanel';
            infoPanel.style.cssText = 'position:absolute;top:15px;left:50%;transform:translateX(-50%);background:rgba(0,0,0,0.85);color:white;padding:10px 18px;border-radius:20px;font-size:12px;z-index:20;backdrop-filter:blur(8px);border:1px solid rgba(245,158,11,0.4);display:flex;align-items:center;gap:12px;';
            infoPanel.innerHTML = `<span style="color:#f59e0b;font-weight:700;"><i class="fa-solid fa-route"></i> ${op.operationName || 'Opération'}</span>
                <span style="color:#94a3b8;">${stops.length} arrêts · ${(routeJson.routes[0].distance/1000).toFixed(1)} km · ${Math.round(routeJson.routes[0].duration/60)} min</span>
                <button onclick="this.parentElement.remove()" style="background:rgba(239,68,68,0.2);border:none;color:#f87171;border-radius:6px;padding:3px 8px;cursor:pointer;">✕</button>`;
            wrapper.appendChild(infoPanel);

            // Fit map to route
            const bounds = new mapboxgl.LngLatBounds();
            waypoints.forEach(c => bounds.extend(c));
            this.map.fitBounds(bounds, { padding: 80 });
        } catch(e) { console.error('Op route error:', e); }
    },
    // ================================================================
    // LEFT PANEL MANAGEMENT
    // ================================================================
    switchPanelTab: function(tab, btn) {
        document.querySelectorAll('.panel-tab-content').forEach(el => el.style.display = 'none');
        document.querySelectorAll('.map-panel-tab').forEach(b => {
            b.style.color = '#64748b'; b.style.borderBottomColor = 'transparent';
        });
        const panel = document.getElementById('panel' + tab.charAt(0).toUpperCase() + tab.slice(1));
        if (panel) panel.style.display = 'block';
        if (btn) { btn.style.color = '#e2e8f0'; btn.style.borderBottomColor = '#3b82f6'; }
        if (tab === 'activity') this.refreshZoneActivity();
        if (tab === 'zones') this.refreshPanelZones();
    },

    togglePanel: function() {
        const panel = document.getElementById('mapLeftPanel');
        const showBtn = document.getElementById('showPanelBtn');
        if (!panel) return;
        const isHidden = panel.style.width === '0px' || panel.style.display === 'none';
        if (isHidden) { 
            panel.style.width = '290px'; panel.style.display = 'flex'; 
            if(showBtn) showBtn.style.display = 'none';
        }
        else { 
            panel.style.width = '0px'; panel.style.overflow = 'hidden'; 
            if(showBtn) showBtn.style.display = 'block';
        }
    },

    filterPanel: function(query) {
        const q = (query || '').toLowerCase();
        document.querySelectorAll('.panel-truck-item').forEach(item => {
            item.style.display = item.dataset.name && item.dataset.name.toLowerCase().includes(q) ? '' : 'none';
        });
    },

    updatePanelTruckList: function(trucks) {
        const list = document.getElementById('mapTruckList');
        if (!list) return;
        const total = trucks.length;
        const moving = trucks.filter(t => (t.speed || 0) >= 1 && !t.isGpsCut).length;
        const stopped = total - moving;
        const setEl = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
        setEl('panelCountAll', total); setEl('panelCountMoving', moving); setEl('panelCountStopped', stopped);
        setEl('mapCountAll', `(${total})`); setEl('mapCountMoving', `(${moving})`); setEl('mapCountStopped', `(${stopped})`);

        if (!trucks.length) { list.innerHTML = '<div style="text-align:center;color:#475569;font-size:12px;padding:20px;">Aucun camion</div>'; return; }
        list.innerHTML = trucks.map(t => {
            const id = t.deviceId || t.id;
            const isMoving = (t.speed || 0) >= 1 && !t.isGpsCut;
            const statusColor = t.isGpsCut ? '#64748b' : (isMoving ? '#22c55e' : '#f87171');
            const statusIcon = t.isGpsCut ? 'fa-wifi-slash' : (isMoving ? 'fa-truck-fast' : 'fa-truck');
            const zone = t.currentZone || t.zone || '';
            const fuel = t.fuelPercent != null ? t.fuelPercent : (t.fuel_percent != null ? t.fuel_percent : null);
            const fuelBar = fuel != null ? `<div style="height:3px;background:rgba(255,255,255,0.1);border-radius:2px;margin-top:3px;"><div style="width:${Math.min(100,fuel)}%;height:100%;border-radius:2px;background:${fuel>30?'#22c55e':fuel>15?'#f59e0b':'#ef4444'};"></div></div>` : '';
            return `<div class="panel-truck-item" data-id="${id}" data-name="${t.name||id}" onclick="window.AlgeriaMap.selectTruckById('${id}')"
              style="padding:9px 10px;border-radius:8px;cursor:pointer;transition:background 0.15s;margin-bottom:3px;border:1px solid rgba(255,255,255,0.04);display:flex;align-items:center;gap:8px;"
              onmouseenter="this.style.background='rgba(59,130,246,0.1)'" onmouseleave="this.style.background=''">
              <div style="width:30px;height:30px;border-radius:8px;background:${statusColor}22;border:1px solid ${statusColor}44;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
                <i class="fa-solid ${statusIcon}" style="color:${statusColor};font-size:12px;"></i>
              </div>
              <div style="flex:1;min-width:0;">
                <div style="font-size:12px;font-weight:700;color:#e2e8f0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${t.name || id}</div>
                <div style="font-size:10px;color:#64748b;">${isMoving ? (t.speed||0)+' km/h' : 'À l\'arrêt'}${zone ? ' · '+zone : ''}</div>
                ${fuelBar}
              </div>
              <span style="font-size:9px;font-weight:700;color:${statusColor};background:${statusColor}1a;padding:2px 5px;border-radius:4px;flex-shrink:0;">${isMoving?'▶':'■'}</span>
            </div>`;
        }).join('');
    },

    refreshPanelZones: function() {
        const list = document.getElementById('mapZoneList');
        if (!list) return;
        const zones = (typeof FLEET_CONFIG !== 'undefined' && FLEET_CONFIG.CUSTOM_LOCATIONS) ? FLEET_CONFIG.CUSTOM_LOCATIONS : [];
        const clients = (typeof FLEET_CONFIG !== 'undefined' && FLEET_CONFIG.CLIENTS) ? FLEET_CONFIG.CLIENTS : [];
        const typeColors = { client:'#3b82f6', maintenance:'#ef4444', douroub:'#22c55e', other:'#94a3b8' };
        const typeIcons = { client:'fa-user-tie', maintenance:'fa-wrench', douroub:'fa-building', station:'fa-gas-pump', other:'fa-map-pin' };
        if (!zones.length) { list.innerHTML = '<div style="text-align:center;color:#475569;font-size:12px;padding:20px;">Aucune zone. Créez-en une.</div>'; return; }
        list.innerHTML = zones.map((z, i) => {
            const color = typeColors[z.type] || '#94a3b8';
            const icon = typeIcons[z.type] || 'fa-map-pin';
            const client = z.clientId ? clients.find(c => c.id === z.clientId) : null;
            return `<div onclick="window.AlgeriaMap.flyToZone(${z.lat},${z.lng})"
              style="padding:9px 10px;border-radius:8px;cursor:pointer;margin-bottom:3px;border:1px solid rgba(255,255,255,0.04);display:flex;align-items:center;gap:8px;"
              onmouseenter="this.style.background='rgba(255,255,255,0.05)'" onmouseleave="this.style.background=''">
              <div style="width:28px;height:28px;border-radius:50%;background:${color}22;border:2px solid ${color}55;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
                <i class="fa-solid ${icon}" style="color:${color};font-size:11px;"></i>
              </div>
              <div style="flex:1;min-width:0;">
                <div style="font-size:12px;font-weight:600;color:#e2e8f0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${z.name}</div>
                <div style="font-size:10px;color:#475569;">${z.wilaya||''}${client ? ' · '+client.name : ''}</div>
              </div>
              <span style="font-size:9px;color:#475569;">${z.radius||500}m</span>
            </div>`;
        }).join('');
    },

    flyToZone: function(lat, lng) {
        if (!this.map) return;
        this.map.flyTo({ center: [lng, lat], zoom: 15, speed: 1.2 });
    },

        refreshZoneActivity: async function() {
        const actList = document.getElementById('mapActivityList');
        const chips = document.getElementById('zoneActivityChips');

        if (!FLEET_CONFIG.CUSTOM_LOCATIONS || FLEET_CONFIG.CUSTOM_LOCATIONS.length === 0) return;

        try {
            const base = typeof FLEET_CONFIG !== 'undefined' && FLEET_CONFIG.API ? FLEET_CONFIG.API.baseUrl : '';
            const res = await fetch(base + '/api/zone-events/active', {
                headers: { 'x-access-code': localStorage.getItem('fleetAccessCode') || '' }
            });
            if (!res.ok) throw new Error('HTTP ' + res.status);
            const data = await res.json();
            const activeEvents = data.activeEvents || [];

            // Group by zone
            const zoneMap = {};
            activeEvents.forEach(ev => {
                if (!zoneMap[ev.zoneName]) zoneMap[ev.zoneName] = { count: 0, trucks: [], events: [], lastEntry: null };
                zoneMap[ev.zoneName].count++;
                if (!zoneMap[ev.zoneName].trucks.includes(ev.truckName)) zoneMap[ev.zoneName].trucks.push(ev.truckName);
                zoneMap[ev.zoneName].events.push(ev);
                if (!zoneMap[ev.zoneName].lastEntry || new Date(ev.entryTime) > new Date(zoneMap[ev.zoneName].lastEntry)) {
                    zoneMap[ev.zoneName].lastEntry = ev.entryTime;
                }
            });

            const stats = Object.keys(zoneMap).map(z => ({
                zone: z,
                entries: zoneMap[z].count,
                truckCount: zoneMap[z].trucks.length,
                lastEntry: zoneMap[z].lastEntry,
                events: zoneMap[z].events
            })).sort((a,b) => b.entries - a.entries);

            if (actList) {
                let html = '';
                stats.forEach(s => {
                    html += `<div style="padding:8px 10px;border-radius:8px;margin:2px 4px;cursor:pointer;" onclick="window.AlgeriaMap.flyToZoneByName('${s.zone}')" onmouseenter="this.style.background='rgba(255,255,255,0.05)'" onmouseleave="this.style.background=''">
                            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:3px;">
                                <span style="font-size:11px;font-weight:600;color:#e2e8f0;">${s.zone}</span>
                                <span style="font-size:10px;font-weight:700;color:#3b82f6;background:rgba(59,130,246,0.15);padding:2px 7px;border-radius:10px;">${s.entries}</span>
                            </div>
                            <div style="display:flex;gap:10px;font-size:10px;color:#64748b;">
                            </div>
                            <div style="font-size:10px;color:#94a3b8;display:flex;align-items:center;gap:4px;margin-top:2px;">
                                <span style="color:#38bdf8;">${s.truckCount} camions</span>
                            </div>
                    </div>`;
                });
                actList.innerHTML = html || '<div style="text-align:center;color:#475569;font-size:12px;padding:20px;">Aucune activité</div>';
            }

            if (chips) {
                chips.innerHTML = stats.slice(0,8).map(s =>
                    `<span style="display:inline-flex;align-items:center;gap:5px;background:rgba(59,130,246,0.15);border:1px solid rgba(59,130,246,0.25);color:#93c5fd;padding:3px 10px;border-radius:20px;font-size:10px;white-space:nowrap;cursor:pointer;flex-shrink:0;" onclick="window.AlgeriaMap.flyToZoneByName('${s.zone}')">
                        <span style="width:6px;height:6px;border-radius:50%;background:#3b82f6;"></span>${s.zone} <strong style="color:#fff;">${s.entries}</strong>
                    </span>`
                ).join('');
            }

            this._zoneStats = stats;
            this._updateZoneActivityColors(stats);

        } catch(e) {
            if (actList) actList.innerHTML = '<div style="text-align:center;color:#475569;font-size:12px;padding:20px;"><i class="fa-solid fa-triangle-exclamation" style="color:#f59e0b;"></i><br>Données indisponibles</div>';
            if (chips) chips.innerHTML = '<span style="font-size:11px;color:#475569;">Aucune donnée</span>';
        }
    },

    _updateZoneActivityColors: function(stats) {
        if (!this.map || !this.map.getSource('zone-circles')) return;
        const maxEntries = Math.max(...stats.map(s => s.entries), 1);
    },

    flyToZoneByName: function(zoneName) {
        const zones = typeof FLEET_CONFIG !== 'undefined' ? (FLEET_CONFIG.CUSTOM_LOCATIONS || []) : [];
        const zone = zones.find(z => z.name === zoneName);
        if (zone) {
            this.flyToZone(zone.lat, zone.lng);
            this.drawActiveZoneRadius(zone.lat, zone.lng, zone.radius || 500, { name: zoneName, color: zone.color || '#3b82f6' });
        }
    },

    drawActiveZoneRadius: function(lat, lng, radiusMeters, options = {}) {
        if (!this.map || !this.map.isStyleLoaded()) return;
        const layerId = 'active-zone-highlight';
        const sourceId = 'active-zone-highlight-src';

        if (this.map.getLayer(layerId + '-fill')) this.map.removeLayer(layerId + '-fill');
        if (this.map.getLayer(layerId + '-line')) this.map.removeLayer(layerId + '-line');
        if (this.map.getSource(sourceId)) this.map.removeSource(sourceId);

        const radiusKm = radiusMeters / 1000;
        const circleCoords = this._generateCircleCoords(lng, lat, radiusKm, 64);
        const fillColor = options.color || '#3b82f6';

        this.map.addSource(sourceId, {
            type: 'geojson',
            data: { type: 'Feature', geometry: { type: 'Polygon', coordinates: [circleCoords] } }
        });

        this.map.addLayer({
            id: layerId + '-fill',
            type: 'fill',
            source: sourceId,
            paint: { 'fill-color': fillColor, 'fill-opacity': 0.25 }
        });

        this.map.addLayer({
            id: layerId + '-line',
            type: 'line',
            source: sourceId,
            paint: { 'line-color': fillColor, 'line-width': 3, 'line-dasharray': [4, 2], 'line-opacity': 0.9 }
        });
        
        const bounds = new mapboxgl.LngLatBounds();
        circleCoords.forEach(coord => bounds.extend(coord));
        this.map.fitBounds(bounds, { padding: 80, duration: 1500 });
    },

    showZoneActivityDetail: function(zoneName) {
        if (!this._zoneStats) return;
        const stat = this._zoneStats.find(s => s.zone === zoneName);
        if (!stat) return;
        const events = stat.events || [];
        const popupHtml = `<div style="padding:10px;font-family:sans-serif;max-width:260px;">
            <div style="font-weight:700;font-size:13px;color:#3b82f6;margin-bottom:8px;"><i class="fa-solid fa-chart-line"></i> ${zoneName}</div>
            <div style="font-size:11px;color:#666;margin-bottom:8px;">${stat.entries} entrées · ${stat.truckCount} camions (24h)</div>
            <div style="max-height:150px;overflow-y:auto;">
                ${events.slice(0,10).map(ev => {
                    const t = new Date(ev.entryTime).toLocaleString('fr-FR',{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'});
                    return `<div style="padding:4px 0;border-bottom:1px solid #f0f0f0;font-size:10px;display:flex;justify-content:space-between;">
                        <span><i class="fa-solid fa-truck" style="color:#22c55e;"></i> ${ev.truckName}</span>
                        <span style="color:#888;">${t} ${ev.duration?'('+Math.round(ev.duration)+'min)':''}</span>
                    </div>`;
                }).join('')}
            </div>
        </div>`;
        const zones = typeof FLEET_CONFIG !== 'undefined' ? (FLEET_CONFIG.CUSTOM_LOCATIONS || []) : [];
        const zone = zones.find(z => z.name === zoneName);
        if (zone) {
            new mapboxgl.Popup({ closeButton: true, maxWidth: '280px' })
                .setLngLat([zone.lng, zone.lat])
                .setHTML(popupHtml)
                .addTo(this.map);
            this.flyToZone(zone.lat, zone.lng);
        }
    },

    fitBounds: function() {
        if (!this.truckDataCache.length) return;
        const bounds = new mapboxgl.LngLatBounds();
        this.truckDataCache.forEach(t => {
            const c = this.getCoordinates(t);
            if (c) bounds.extend(c);
        });
        if (!bounds.isEmpty()) this.map.fitBounds(bounds, { padding: 60, maxZoom: 14 });
    },

    // ================================================================
    // ZONE HISTORY PANEL — shows in the left panel when clicking a zone
    // ================================================================
    showZoneHistoryPanel: async function(zoneName) {
        // Switch panel to activity tab
        const actTab = document.getElementById('panelTabActivity');
        if (actTab) this.switchPanelTab('activity', actTab);

        const list = document.getElementById('mapActivityList');
        if (list) list.innerHTML = '<div style="padding:20px;text-align:center;color:#475569;"><i class="fa-solid fa-spinner fa-spin" style="font-size:20px;color:#3b82f6;"></i><div style="margin-top:8px;font-size:12px;">Chargement historique...</div></div>';

        try {
            const base = typeof FLEET_CONFIG !== 'undefined' && FLEET_CONFIG.API ? FLEET_CONFIG.API.baseUrl : '';
            const res = await fetch(`${base}/api/zone-events?zone=${encodeURIComponent(zoneName)}&limit=50`);
            if (!res.ok) throw new Error('HTTP ' + res.status);
            const events = await res.json();

            // Get zone info
            const zones = typeof FLEET_CONFIG !== 'undefined' ? (FLEET_CONFIG.CUSTOM_LOCATIONS || []) : [];
            const zone = zones.find(z => z.name === zoneName);
            const color = zone ? ({'client':'#3b82f6','maintenance':'#ef4444','douroub':'#22c55e'}[zone.type] || '#94a3b8') : '#3b82f6';

            const totalEvents = events.length;
            const uniqueTrucks = [...new Set(events.map(e => e.truckName))];
            const avgDuration = events.filter(e => e.durationMinutes).reduce((s,e) => s + e.durationMinutes, 0) / (events.filter(e=>e.durationMinutes).length || 1);

            if (!list) return;
            list.innerHTML = `
              <!-- Zone header -->
              <div style="padding:12px 10px;border-bottom:1px solid rgba(255,255,255,0.06);background:${color}15;margin:-6px -6px 8px -6px;">
                <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
                  <span style="width:10px;height:10px;border-radius:50%;background:${color};flex-shrink:0;"></span>
                  <span style="font-size:13px;font-weight:700;color:#e2e8f0;">${zoneName}</span>
                  <button onclick="window.AlgeriaMap.flyToZoneByName('${zoneName}')" style="margin-left:auto;background:rgba(255,255,255,0.08);border:none;color:#94a3b8;border-radius:5px;padding:3px 7px;cursor:pointer;font-size:10px;" title="Centrer sur la zone"><i class="fa-solid fa-location-crosshairs"></i></button>
                </div>
                <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:4px;">
                  <div style="background:rgba(0,0,0,0.2);border-radius:6px;padding:6px;text-align:center;">
                    <div style="font-size:16px;font-weight:800;color:${color};">${totalEvents}</div>
                    <div style="font-size:9px;color:#64748b;">ENTRÉES</div>
                  </div>
                  <div style="background:rgba(0,0,0,0.2);border-radius:6px;padding:6px;text-align:center;">
                    <div style="font-size:16px;font-weight:800;color:#22c55e;">${uniqueTrucks.length}</div>
                    <div style="font-size:9px;color:#64748b;">CAMIONS</div>
                  </div>
                  <div style="background:rgba(0,0,0,0.2);border-radius:6px;padding:6px;text-align:center;">
                    <div style="font-size:16px;font-weight:800;color:#f59e0b;">${Math.round(avgDuration)}</div>
                    <div style="font-size:9px;color:#64748b;">MOY MIN</div>
                  </div>
                </div>
              </div>
              <!-- Truck chips -->
              <div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:8px;padding:0 2px;">
                ${uniqueTrucks.slice(0,8).map(t => `<span style="background:rgba(59,130,246,0.15);border:1px solid rgba(59,130,246,0.25);color:#93c5fd;padding:2px 8px;border-radius:10px;font-size:10px;cursor:pointer;" onclick="window.AlgeriaMap.selectTruckById('${t}')">${t}</span>`).join('')}
              </div>
              <!-- Event list -->
              <div style="font-size:10px;font-weight:700;color:#475569;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px;padding:0 2px;">Historique Entrées/Sorties</div>
              ${events.length === 0 ? '<div style="text-align:center;color:#475569;padding:16px;font-size:12px;">Aucun événement récent</div>' :
              events.map(ev => {
                const entryTime = new Date(ev.entryTime);
                const exitTime = ev.exitTime ? new Date(ev.exitTime) : null;
                const dur = ev.durationMinutes ? Math.round(ev.durationMinutes) : null;
                const isRecent = Date.now() - entryTime.getTime() < 3600000;
                return `<div style="padding:9px 10px;border-radius:8px;margin-bottom:4px;border:1px solid rgba(255,255,255,${isRecent?'0.08':'0.03'});background:rgba(255,255,255,${isRecent?'0.05':'0.02'});cursor:pointer;" onclick="window.AlgeriaMap.selectTruckById('${ev.truckName || ev.deviceId}')">
                  <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:3px;">
                    <span style="font-size:12px;font-weight:700;color:#e2e8f0;display:flex;align-items:center;gap:5px;">
                      <i class="fa-solid fa-truck" style="color:#22c55e;font-size:10px;"></i>${ev.truckName}
                    </span>
                    ${isRecent ? '<span style="font-size:9px;background:rgba(34,197,94,0.2);color:#22c55e;padding:1px 5px;border-radius:4px;font-weight:700;">RÉCENT</span>' : ''}
                  </div>
                  <div style="font-size:10px;color:#64748b;display:flex;gap:8px;flex-wrap:wrap;">
                    <span><i class="fa-solid fa-arrow-right-to-bracket" style="color:#22c55e;"></i> ${entryTime.toLocaleString('fr-FR',{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'})}</span>
                    ${exitTime ? `<span><i class="fa-solid fa-arrow-right-from-bracket" style="color:#f87171;"></i> ${exitTime.toLocaleString('fr-FR',{hour:'2-digit',minute:'2-digit'})}</span>` : '<span style="color:#f59e0b;"><i class="fa-solid fa-circle-dot fa-beat"></i> En zone</span>'}
                    ${dur ? `<span><i class="fa-solid fa-clock"></i> ${dur}min</span>` : ''}
                  </div>
                </div>`;
              }).join('')}
            `;
        } catch(e) {
            if (list) list.innerHTML = `<div style="text-align:center;color:#475569;padding:20px;font-size:12px;"><i class="fa-solid fa-triangle-exclamation" style="color:#f59e0b;font-size:20px;display:block;margin-bottom:8px;"></i>Erreur: ${e.message}</div>`;
        }
    },

};

window.AlgeriaMap = AlgeriaMap;





