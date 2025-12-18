/**
 * ALGERIA MAP MODULE - FINAL FIXED VERSION
 * Features: Accurate Fuel Calc, Search Fixes, Smart Routing, GPS Cut Indicators
 */

const AlgeriaMap = {
    map: null,
    markers: {},
    customMarkers: [],
    selectedTruck: null,
    truckDataCache: [],
    currentFilter: 'all',
    
    // States
    is3D: false,
    isFollowMode: false,
    isBuildingsOn: false,
    searchDebounce: null,
    currentRoutes: [], 
    selectedRouteIndex: 0,

    // --- INITIALIZATION ---
    init: function() {
        if (!mapboxgl.supported()) { console.error('WebGL missing'); return; }
        mapboxgl.accessToken = FLEET_CONFIG.MAPBOX_TOKEN;

        this.map = new mapboxgl.Map({
            container: 'map-container',
            style: 'mapbox://styles/mapbox/streets-v12',
            center: [3.0, 34.0],
            zoom: 5,
            pitch: 0,
            projection: 'globe'
        });

        this.map.addControl(new mapboxgl.NavigationControl(), 'top-right');

        this.map.on('load', () => {
            console.log("✅ Map Engine Started");
            this.addTerrainSource();
            this.renderCustomLocations();
            this.setupSearchListeners();
            
            if(this.truckDataCache.length > 0) this.updateMarkers(this.truckDataCache);
        });

        // 1. General Map Click (Route to point)
        this.map.on('click', (e) => {
            const features = this.map.queryRenderedFeatures(e.point, { layers: ['route-alt'] });
            if (features.length > 0) return; 

            if (this.selectedTruck) {
                this.calculateRoute(
                    this.getCoordinates(this.selectedTruck), 
                    [e.lngLat.lng, e.lngLat.lat], 
                    "Point Carte"
                );
            }
        });
        
        // 2. Click Alternative Route (Switch Active Route)
        this.map.on('click', 'route-alt', (e) => {
            const index = e.features[0].properties.index;
            this.selectRoute(index);
        });
        
        this.map.on('mouseenter', 'route-alt', () => { this.map.getCanvas().style.cursor = 'pointer'; });
        this.map.on('mouseleave', 'route-alt', () => { this.map.getCanvas().style.cursor = ''; });
    },

    // --- ROUTING ENGINE ---
    calculateRoute: async function(start, end, destName) {
        if(!start || !end) return;
        this.lastRouteDestination = { coords: end, name: destName };
        this.showToast("🛣️ Calcul de l'itinéraire...");

        const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${start[0]},${start[1]};${end[0]},${end[1]}?steps=true&alternatives=true&geometries=geojson&overview=full&access_token=${mapboxgl.accessToken}`;

        try {
            const res = await fetch(url);
            const json = await res.json();

            if (!json.routes || json.routes.length === 0) { alert("Route introuvable."); return; }

            this.currentRoutes = json.routes; 
            
            // Cleanup Old
            if(this.map.getSource('route-source')) {
                ['route-casing', 'route-main', 'route-alt'].forEach(l => { if(this.map.getLayer(l)) this.map.removeLayer(l); });
                this.map.removeSource('route-source');
            }

            this.map.addSource('route-source', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });

            // 1. Alternatives
            this.map.addLayer({
                id: 'route-alt', type: 'line', source: 'route-source',
                filter: ['==', 'type', 'alt'],
                layout: { 'line-join': 'round', 'line-cap': 'round' },
                paint: { 'line-color': '#999999', 'line-width': 8, 'line-opacity': 0.6 }
            });

            // 2. Main Casing
            this.map.addLayer({
                id: 'route-casing', type: 'line', source: 'route-source',
                filter: ['==', 'type', 'main'],
                layout: { 'line-join': 'round', 'line-cap': 'round' },
                paint: { 'line-color': '#ffffff', 'line-width': 10 }
            });

            // 3. Main Route
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

        // Update Stats
        const r = this.currentRoutes[index];
        this.showRouteStats(r.distance, r.duration, this.lastRouteDestination.name, this.currentRoutes.length - 1);
        
        if(this.currentRoutes.length > 1) {
            this.showToast(`🔀 Route ${index + 1} sélectionnée`);
        }
    },

    showRouteStats: function(m, s, name, altCount) {
        const km = (m / 1000).toFixed(1);
        const h = Math.floor(s / 3600);
        const min = Math.floor((s % 3600) / 60);

        // --- FUEL CALCULATION FIX ---
        // 1. Get Selected Truck Config
        let consumption = 35; // Default Fallback
        if (this.selectedTruck) {
            // Check if global helper exists
            if (typeof getTruckConfig === 'function') {
                const config = getTruckConfig(this.selectedTruck.deviceId || this.selectedTruck.id);
                if (config.fuelConsumption) consumption = parseFloat(config.fuelConsumption);
            } else {
                // Fallback to truck object property if helper missing
                if (this.selectedTruck.fuelConsumption) consumption = this.selectedTruck.fuelConsumption;
            }
        }

        // 2. Calculate Fuel
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

    // --- MARKERS & INFO ---
    updateMarkers: function(trucks) {
        this.truckDataCache = trucks;
        this.populateTruckList();
        
        if (!this.map || !this.map.style || !this.map.style.stylesheet) return;

        if (this.selectedTruck) {
            const fresh = trucks.find(t => t.id === this.selectedTruck.id);
            if(fresh) {
                this.selectedTruck = fresh;
                if(this.isFollowMode) this.map.easeTo({ center: this.getCoordinates(fresh), duration: 1000 });
            }
        }

        trucks.forEach(truck => {
            const id = truck.deviceId || truck.id;
            const coords = this.getCoordinates(truck);
            if (!coords) return;

            if (!this.checkFilter(truck)) {
                if(this.markers[id]) this.markers[id].getElement().style.display = 'none';
                return;
            }

            const isMoving = truck.speed > 0;
            const isSelected = this.selectedTruck && (this.selectedTruck.id === id);
            
            // Determine Marker Class
            let markerClass = isMoving ? 'moving' : 'stopped';
            if (truck.isGpsCut) markerClass = 'stopped'; // Grey for cut

            if (this.markers[id]) {
                const m = this.markers[id];
                m.setLngLat(coords);
                m.getElement().style.display = 'block';
                // Apply GPS Cut visual if needed (using 'stopped' style which is grey, or could add specific 'gps-cut' class)
                m.getElement().querySelector('.marker-icon').className = `marker-icon ${markerClass} ${isSelected ? 'selected' : ''}`;
                
                // If GPS Cut, maybe force opacity or border
                if(truck.isGpsCut) {
                    m.getElement().querySelector('.marker-icon').style.borderColor = '#333';
                    m.getElement().querySelector('.marker-icon').style.backgroundColor = '#ddd';
                } else {
                    m.getElement().querySelector('.marker-icon').style.borderColor = ''; // Reset
                    m.getElement().querySelector('.marker-icon').style.backgroundColor = ''; 
                }
                
                if(m.getPopup().isOpen()) m.getPopup().setHTML(this.getPopupHTML(truck));
            } else {
                const el = document.createElement('div');
                el.className = 'truck-marker';
                el.innerHTML = `<div class="marker-icon ${markerClass}"><i class="fas fa-truck"></i></div>`;
                
                if(truck.isGpsCut) {
                    el.querySelector('.marker-icon').style.borderColor = '#333';
                    el.querySelector('.marker-icon').style.backgroundColor = '#ddd';
                }

                el.addEventListener('click', (e) => { e.stopPropagation(); this.selectTruck(truck); });
                
                const popup = new mapboxgl.Popup({offset: 25, closeButton: false, className: 'hover-popup', maxWidth: '300px'})
                    .setHTML(this.getPopupHTML(truck));
                
                el.addEventListener('mouseenter', () => popup.addTo(this.map));
                el.addEventListener('mouseleave', () => popup.remove());

                this.markers[id] = new mapboxgl.Marker(el).setLngLat(coords).setPopup(popup).addTo(this.map);
            }
        });
    },

    getPopupHTML: function(truck) {
        let statusColor = truck.speed > 0 ? '#2e7d32' : '#d32f2f';
        let statusText = truck.speed > 0 ? 'En Route' : 'Arrêt';
        
        if(truck.isGpsCut) {
            statusColor = '#333';
            statusText = '⚠️ COUPURE GPS';
        }

        const fuelColor = truck.isCriticalFuel ? '#d32f2f' : (truck.isLowFuel ? '#f57c00' : '#2e7d32');
        
        return `
            <div class="popup-header-box" style="background:${statusColor}">
                <span>${truck.name}</span>
                <span style="font-size:10px; background:rgba(0,0,0,0.2); padding:2px 6px; border-radius:10px;">${statusText}</span>
            </div>
            <div class="popup-body-box">
                <div class="popup-stat-row">
                    <span><span class="popup-stat-icon"><i class="fa-solid fa-tachometer-alt"></i></span> Vitesse</span>
                    <span class="popup-stat-value">${Math.round(truck.speed)} km/h</span>
                </div>
                <div class="popup-stat-row">
                    <span><span class="popup-stat-icon"><i class="fa-solid fa-gas-pump"></i></span> Carburant</span>
                    <span class="popup-stat-value" style="color:${fuelColor}">${truck.fuelLiters}L (${truck.fuelPercentage}%)</span>
                </div>
                 <div class="popup-stat-row">
                    <span><span class="popup-stat-icon"><i class="fa-solid fa-map-pin"></i></span> Lieu</span>
                    <span class="popup-stat-value" style="font-weight:400; font-size:11px;">${truck.location.formatted || truck.location.city}</span>
                </div>
                ${truck.vidange.alert ? `<div style="background:#fff3e0; color:#e65100; font-size:10px; padding:4px; margin-top:5px; text-align:center; border-radius:4px;"><i class="fa-solid fa-wrench"></i> Vidange Requise</div>` : ''}
                
                <button class="popup-action-btn" onclick="AlgeriaMap.selectTruckById('${truck.id}')">
                    <i class="fa-solid fa-crosshairs"></i> Sélectionner & Router
                </button>
            </div>
        `;
    },

    // --- SEARCH & DROPDOWN LOGIC ---
    setupSearchListeners: function() {
        const input = document.getElementById('mapDestSearch');
        const resultsBox = document.getElementById('mapSearchResults');
        
        if(!input || !resultsBox) return;

        input.addEventListener('focus', () => {
            if(input.value.length === 0) this.showCustomSiteSuggestions();
        });

        input.addEventListener('input', (e) => {
            clearTimeout(this.searchDebounce);
            const query = e.target.value.toLowerCase().trim();
            if(query.length === 0) { this.showCustomSiteSuggestions(); return; }
            if(query.length < 3) return;
            this.searchDebounce = setTimeout(() => this.performSmartSearch(query), 800);
        });

        document.addEventListener('click', (e) => {
            if (!input.contains(e.target) && !resultsBox.contains(e.target)) {
                resultsBox.style.display = 'none';
            }
        });
    },

    showCustomSiteSuggestions: function() {
        const resultsBox = document.getElementById('mapSearchResults');
        if(!FLEET_CONFIG.CUSTOM_LOCATIONS) return;

        let html = '<div style="padding:8px; font-size:11px; color:#888; font-weight:bold; background:#f9f9f9;">VOS SITES</div>';
        FLEET_CONFIG.CUSTOM_LOCATIONS.forEach(loc => {
            let icon = 'fa-building';
            if(loc.type === 'client') icon = 'fa-user-tie';
            if(loc.type === 'maintenance') icon = 'fa-wrench';
            html += `
                <div class="search-result-item result-type-custom" onclick='AlgeriaMap.selectSearchResult(${JSON.stringify(loc)}, "custom")'>
                    <div class="result-icon custom"><i class="fa-solid ${icon}"></i></div>
                    <div><strong>${loc.name}</strong><br><span>${loc.wilaya || 'Algérie'}</span></div>
                </div>
            `;
        });
        resultsBox.innerHTML = html;
        resultsBox.style.display = 'block';
    },

    performSmartSearch: async function(query) {
        const resultsBox = document.getElementById('mapSearchResults');
        resultsBox.innerHTML = '<div style="padding:10px; text-align:center;"><i class="fa-solid fa-spinner fa-spin"></i> Recherche...</div>';
        resultsBox.style.display = 'block';

        let html = '';
        const matchedSites = FLEET_CONFIG.CUSTOM_LOCATIONS.filter(l => l.name.toLowerCase().includes(query));
        
        if (matchedSites.length > 0) {
            html += '<div style="padding:5px 10px; font-size:10px; font-weight:bold; background:#e8f5e9; color:#2e7d32;">SITES INTERNES</div>';
            matchedSites.forEach(loc => {
                html += `<div class="search-result-item result-type-custom" onclick='AlgeriaMap.selectSearchResult(${JSON.stringify(loc)}, "custom")'>
                    <div class="result-icon custom"><i class="fa-solid fa-star"></i></div>
                    <div><strong>${loc.name}</strong></div>
                </div>`;
            });
        }

        try {
            const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query + ' Algeria')}&limit=5`);
            const apiResults = await res.json();
            if (apiResults.length > 0) {
                html += '<div style="padding:5px 10px; font-size:10px; font-weight:bold; background:#e0f7fa; color:#0084a7;">RÉSULTATS</div>';
                apiResults.forEach(item => {
                    const loc = { lat: parseFloat(item.lat), lng: parseFloat(item.lon), name: item.display_name.split(',')[0] };
                    html += `<div class="search-result-item result-type-api" onclick='AlgeriaMap.selectSearchResult(${JSON.stringify(loc)}, "api")'>
                        <div class="result-icon api"><i class="fa-solid fa-earth-africa"></i></div>
                        <div><strong>${loc.name}</strong><br><span>${item.display_name}</span></div>
                    </div>`;
                });
            }
        } catch(e) {}

        resultsBox.innerHTML = html || '<div style="padding:10px; text-align:center;">Aucun résultat.</div>';
    },

    selectSearchResult: function(loc, type) {
        document.getElementById('mapSearchResults').style.display = 'none';
        document.getElementById('mapDestSearch').value = loc.name;
        if (this.selectedTruck) {
            this.calculateRoute(this.getCoordinates(this.selectedTruck), [loc.lng, loc.lat], loc.name);
        } else {
            this.map.flyTo({ center: [loc.lng, loc.lat], zoom: 14 });
            this.showToast(`📍 <b>${loc.name}</b> affiché. Sélectionnez un camion pour y aller.`);
        }
    },

    // --- STANDARD UTILS (Copied from previous valid versions) ---
    renderCustomLocations: function() {
        this.customMarkers.forEach(m => m.remove());
        if(!FLEET_CONFIG.CUSTOM_LOCATIONS) return;
        
        FLEET_CONFIG.CUSTOM_LOCATIONS.forEach(loc => {
            let typeClass = 'type-other';
            let icon = 'fa-map-pin';
            if(loc.type === 'client') { typeClass='type-client'; icon='fa-user-tie'; }
            if(loc.type === 'maintenance') { typeClass='type-maintenance'; icon='fa-wrench'; }
            if(loc.type === 'douroub') { typeClass='type-douroub'; icon='fa-building'; }

            const el = document.createElement('div');
            el.className = `custom-loc-marker ${typeClass}`;
            el.innerHTML = `<div class="custom-loc-label">${loc.name}</div><div class="custom-loc-icon"><i class="fa-solid ${icon}"></i></div>`;
            
            el.addEventListener('click', (e) => { e.stopPropagation(); 
                if(this.selectedTruck) this.calculateRoute(this.getCoordinates(this.selectedTruck), [loc.lng, loc.lat], loc.name);
            });

            const m = new mapboxgl.Marker({element: el, anchor:'bottom'}).setLngLat([loc.lng, loc.lat]).addTo(this.map);
            this.customMarkers.push(m);
        });
    },

    selectTruck: function(truck) {
        this.selectedTruck = truck;
        Object.values(this.markers).forEach(m => m.getElement().querySelector('.marker-icon').classList.remove('selected'));
        if(this.markers[truck.id]) this.markers[truck.id].getElement().querySelector('.marker-icon').classList.add('selected');
        document.getElementById('mapTruckSelect').value = truck.id;
        if(!this.isFollowMode) this.map.flyTo({ center: this.getCoordinates(truck), zoom: 14 });
        this.showToast(`🚛 ${truck.name} prêt. Cliquez pour router.`);
    },

    deselectTruck: function() {
        this.selectedTruck = null;
        this.currentRoutes = [];
        this.isFollowMode = false;
        document.getElementById('btnFollow').classList.remove('active');
        document.getElementById('mapTruckSelect').value = "";
        
        Object.values(this.markers).forEach(m => m.getElement().querySelector('.marker-icon').classList.remove('selected'));
        
        if(this.map.getSource('route-source')) {
            this.map.removeLayer('route-main');
            this.map.removeLayer('route-casing');
            this.map.removeLayer('route-alt');
            this.map.removeSource('route-source');
        }
        document.getElementById('route-info-panel').style.display = 'none';
    },

    selectTruckById: function(id) { if(!id) this.deselectTruck(); else this.selectTruck(this.truckDataCache.find(t=>t.id===id)); },
    getCoordinates: function(t) { return t.coordinates ? [t.coordinates.lng, t.coordinates.lat] : [t.lng, t.lat]; },
    populateTruckList: function() {
        const sel = document.getElementById('mapTruckSelect');
        if(!sel || sel.options.length>1) return;
        [...this.truckDataCache].sort((a,b)=>a.name.localeCompare(b.name)).forEach(t=>{
            const o = document.createElement('option'); o.value=t.id; o.innerText=`${t.name}`; sel.appendChild(o);
        });
    },
    
    // UPDATED FILTER LOGIC FOR GPS CUT
    checkFilter: function(t) { 
        if(this.currentFilter==='all') return true; 
        if(this.currentFilter==='moving') return t.speed>0; 
        if(this.currentFilter==='stopped') return t.speed===0;
        // Map doesn't typically filter by gps_cut via menu, but if needed:
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