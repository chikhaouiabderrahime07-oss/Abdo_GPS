/**
 * GPS AUDITOR V37 - ÉDITION PROFESSIONNELLE
 * - Corrections: Noms dans l'historique, Affichage Live, Langue FR.
 * - Performance: Scan Parallèle Illimité (Mode Rapide).
 */

class GPSAuditor {
    constructor() {
        this.trucks = [];
        this.incidents = [];
        this.parkings = []; 
        this.apiKey = (typeof FLEET_CONFIG !== 'undefined') ? FLEET_CONFIG.GEOAPIFY_API_KEY : '';
        this.apiBase = (typeof FLEET_CONFIG !== 'undefined' && FLEET_CONFIG.API_BASE_URL) ? FLEET_CONFIG.API_BASE_URL.replace(/\/$/, "") : ""; 
        this.isBusy = false;
        
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => this.init());
        else this.init();
    }

    init() {
        const now = new Date();
        const past = new Date();
        past.setDate(past.getDate() - 7);
        
        const elEnd = document.getElementById('endDate');
        const elStart = document.getElementById('startDate');
        if(elEnd && elStart) {
            elEnd.value = now.toISOString().slice(0, 16);
            elStart.value = past.toISOString().slice(0, 16);
        }

        this.loadTrucks();
        document.addEventListener('mousemove', (e) => this.moveTooltip(e));
    }

    // --- TOOLTIP ---
    showTooltip(item) {
        const tip = document.getElementById('forensic-tooltip');
        if(!tip) return;
        tip.innerHTML = `
            <div style="border-bottom:1px solid #334155; margin-bottom:5px; font-weight:bold; color:#3b82f6;">${item.truck}</div>
            <div style="display:flex; justify-content:space-between; color:#94a3b8;"><span>Début:</span> <span style="color:white">${item.startTime}</span></div>
            <div style="display:flex; justify-content:space-between; color:#94a3b8;"><span>Fin:</span> <span style="color:white">${item.endTime}</span></div>
            <div style="display:flex; justify-content:space-between; color:#94a3b8;"><span>Durée:</span> <span style="color:white">${item.dur}h</span></div>
            <div style="display:flex; justify-content:space-between; color:#94a3b8;"><span>Type:</span> <span style="color:${item.reason.includes('COUPURE')?'#ef4444':'#3b82f6'}">${item.reason}</span></div>
        `;
        tip.style.display = 'block';
    }
    moveTooltip(e) {
        const tip = document.getElementById('forensic-tooltip');
        if(tip && tip.style.display === 'block') {
            tip.style.left = (e.clientX - 310) + 'px';
            tip.style.top = (e.clientY + 10) + 'px';
        }
    }
    hideTooltip() { document.getElementById('forensic-tooltip').style.display = 'none'; }

    // --- CONNEXION ---
    async loadTrucks() {
        this.log(`Connexion au serveur...`, "n");
        const code = localStorage.getItem('fleetAccessCode');
        try {
            const res = await fetch(`${this.apiBase}/api/trucks`, { headers: { 'x-access-code': code } });
            if (!res.ok) throw new Error(res.status);
            const raw = await res.json();
            const data = raw.data || raw;
            let list = Array.isArray(data) ? data : Object.entries(data).map(([k, v]) => ({ ...v, id: v.id||v.imei||v.deviceId||k }));
            this.trucks = list.map(t => ({ id: t.id, name: t.name||t.truckName||`ID:${t.id}` })).filter(t => t.id); 
            this.trucks.sort((a,b) => a.name.localeCompare(b.name));
            this.renderList();
            this.log(`Connecté. ${this.trucks.length} Véhicules disponibles.`, "ok");
        } catch (e) { this.log(`Erreur Connexion: ${e.message}`, "err"); }
    }

    renderList() {
        const c = document.getElementById('truckListContainer');
        c.innerHTML = '';
        this.trucks.forEach(t => {
            const div = document.createElement('div');
            div.className = 't-item';
            // Ajout de la classe t-name pour cibler facilement le nom plus tard
            div.innerHTML = `<input type="checkbox" value="${t.id}" class="truck-cb"> <span class="t-name">${t.name}</span>`;
            div.onclick = (e) => { if(e.target.tagName!=='INPUT') div.querySelector('input').click(); this.updateCount(); };
            c.appendChild(div);
        });
    }
    updateCount() { 
        const el = document.getElementById('selCount');
        if(el) el.innerText = document.querySelectorAll('.truck-cb:checked').length;
    }
    toggleAll(v) { document.querySelectorAll('.truck-cb').forEach(c => c.checked = v); this.updateCount(); }
    log(msg, type='n') { 
        const c = document.getElementById('consoleLog'); 
        const d = document.createElement('div'); 
        d.style.color = type==='err'?'#ef4444':(type==='ok'?'#10b981':'#cbd5e1'); 
        d.innerText = `> ${msg}`; 
        c.appendChild(d); 
        c.scrollTop = c.scrollHeight; 
    }

    // --- MOTEUR D'AUDIT (RAPIDE) ---
    async startAudit() {
        const selected = Array.from(document.querySelectorAll('.truck-cb:checked')).map(cb => cb.value);
        if(selected.length === 0) return alert("Sélectionnez au moins un véhicule.");
        
        this.isBusy = true; document.getElementById('btnStart').disabled = true;
        this.incidents = []; this.parkings = [];
        document.getElementById('feedContainer').innerHTML = '';
        document.getElementById('cntCuts').innerText = '0';
        document.getElementById('cntSleep').innerText = '0';
        
        const startRaw = document.getElementById('startDate').value;
        const endRaw = document.getElementById('endDate').value;
        const tolerance = parseInt(document.getElementById('gapTolerance').value) || 15;
        const sensitivity = document.getElementById('sensitivity').value;
        
        let tolMin = tolerance;
        if(sensitivity === 'high') tolMin = 5;
        if(sensitivity === 'paranoid') tolMin = 2;

        let stats = { sleep: 0, cut: 0 };
        const totalDurationMs = (new Date(endRaw) - new Date(startRaw)) * selected.length;
        let completed = 0;

        this.log(`DÉMARRAGE DE L'AUDIT SUR ${selected.length} VÉHICULES...`, "ok");

        // EXÉCUTION PARALLÈLE TOTALE
        const tasks = selected.map(truckId => {
            return this.auditTruck(truckId, startRaw, endRaw, tolMin).then(res => {
                // MISE À JOUR LIVE
                stats.sleep += res.sleepMs;
                stats.cut += res.cutMs;
                
                this.incidents.push(...res.incidents);
                this.parkings.push(...res.parkings);
                
                // RENDER IMMÉDIAT
                this.renderLiveResults(res.incidents, res.parkings);
                this.updateUI(stats, totalDurationMs);
                
                completed++;
                document.getElementById('progressBar').style.width = `${(completed/selected.length)*100}%`;
                this.log(`Terminé: ${res.truckName} (${res.incidents.length} coupures)`);
            });
        });

        await Promise.all(tasks);

        this.isBusy = false; document.getElementById('btnStart').disabled = false; 
        this.log("✅ AUDIT COMPLET TERMINÉ.", "ok");
    }

    renderLiveResults(newIncidents, newParkings) {
        const feed = document.getElementById('feedContainer');
        const makeCard = (item, type) => {
            const div = document.createElement('div');
            div.className = `item ${type}`;
            div.style.borderLeft = type === 'cut' ? '4px solid #ef4444' : '4px solid #3b82f6';
            div.innerHTML = `
                <div class="i-head"><span>${item.startTime}</span> <span>${item.truck}</span></div>
                <div class="i-body">${item.reason} • ${item.dur}h</div>
                <div class="i-loc"><i class="fa-solid fa-spinner fa-spin"></i> Recherche adresse...</div>
            `;
            div.onmouseenter = () => this.showTooltip(item);
            div.onmouseleave = () => this.hideTooltip();
            
            // Check filtre actuel
            const isCutTab = document.querySelector('.pill.active').textContent.includes('COUPURES');
            div.style.display = (type === 'cut' && isCutTab) || (type === 'sleep' && !isCutTab) ? 'block' : 'none';
            
            feed.appendChild(div);
            
            // Résolution Adresse Asynchrone
            if(this.apiKey) {
                fetch(`https://api.geoapify.com/v1/geocode/reverse?lat=${item.lat}&lon=${item.lng}&apiKey=${this.apiKey}`)
                .then(r=>r.json()).then(d => {
                    const addr = d.features?.[0]?.properties?.formatted || "Inconnu";
                    div.querySelector('.i-loc').innerHTML = `<i class="fa-solid fa-location-dot"></i> ${addr}`;
                    item.addr = addr;
                }).catch(() => div.querySelector('.i-loc').innerHTML = "Erreur GPS");
            } else {
                div.querySelector('.i-loc').innerHTML = `${item.lat.toFixed(4)}, ${item.lng.toFixed(4)}`;
            }
        };

        newIncidents.forEach(i => makeCard(i, 'cut'));
        newParkings.forEach(p => makeCard(p, 'sleep'));
        
        document.getElementById('cntCuts').innerText = this.incidents.length;
        document.getElementById('cntSleep').innerText = this.parkings.length;
    }

    updateUI(stats, totalMs) {
        document.getElementById('kpiSleep').innerText = `${(stats.sleep/3600000).toFixed(1)}h`;
        document.getElementById('kpiDowntime').innerText = `${(stats.cut/3600000).toFixed(1)}h`;
        const uptime = Math.max(0, totalMs - stats.cut);
        document.getElementById('kpiUptime').innerText = `${(uptime/3600000).toFixed(1)}h`;
        const score = totalMs > 0 ? (100 - ((stats.cut / totalMs) * 100)) : 100;
        document.getElementById('kpiScore').innerText = `${score.toFixed(2)}%`;
    }

    async auditTruck(id, startStr, endStr, toleranceMin) {
        const start = new Date(startStr).getTime();
        const end = new Date(endStr).getTime();
        
        // 20 Requêtes parallèles par camion pour la vitesse max
        const threads = 20; 
        const chunk = (end - start) / threads;
        let promises = [];
        
        for(let i=0; i<threads; i++) {
            const s = new Date(start + (chunk * i)).toISOString();
            const e = new Date(start + (chunk * (i+1))).toISOString();
            promises.push(this.fetchChunk(id, s, e));
        }

        const results = await Promise.all(promises);
        let points = [].concat(...results);
        points = points.filter((p, i, a) => i===a.findIndex(t=>t.t===p.t)).sort((a,b) => a.t - b.t);

        const truckName = this.trucks.find(t=>t.id==id)?.name || id;

        if(points.length === 0) {
            return { 
                truckName, sleepMs: 0, cutMs: (end-start), 
                incidents: [{ truck: truckName, startTime: new Date(start).toLocaleString(), endTime: new Date(end).toLocaleString(), dur: ((end-start)/3600000).toFixed(1), lat: 0, lng: 0, reason: "BLACKOUT TOTAL", spd: 0 }], 
                parkings: [] 
            };
        }
        return this.analyze(points, toleranceMin, truckName);
    }

    async fetchChunk(id, s, e) {
        try {
            const start = s.slice(0,16).replace('T','%2520')+':00'; const end = e.slice(0,16).replace('T','%2520')+':00';
            const res = await fetch(`${this.apiBase}/api/history?imei=${id}&start=${start}&end=${end}`, { headers: {'x-access-code': localStorage.getItem('fleetAccessCode')} });
            const json = await res.json();
            const raw = (json.messages || (Array.isArray(json) ? json : []));
            return raw.map(p => {
                const tStr = Array.isArray(p) ? p[0] : (p.timestamp || p.t);
                const spd = Array.isArray(p) ? p[3] : (p.speed || 0);
                return { t: new Date(tStr).getTime(), lat: parseFloat(Array.isArray(p)?p[1]:p.lat), lng: parseFloat(Array.isArray(p)?p[2]:p.lng), spd: parseFloat(spd) };
            });
        } catch(e) { return []; }
    }

    analyze(points, toleranceMin, truckName) {
        let sleepMs = 0; let cutMs = 0; let incidents = []; let parkings = [];
        const tolMs = toleranceMin * 60000;

        for(let i=0; i<points.length-1; i++) {
            const p1 = points[i]; const p2 = points[i+1];
            const diff = p2.t - p1.t;
            if(diff <= 0) continue;

            const isGap = diff > tolMs;
            const dist = this.getDist(p1.lat, p1.lng, p2.lat, p2.lng);
            const isStopped = p1.spd < 5; 
            
            const tStart = new Date(p1.t + 3600000).toLocaleString(); // GMT+1 Fix
            const tEnd = new Date(p2.t + 3600000).toLocaleString();
            
            const info = { truck: truckName, startTime: tStart, endTime: tEnd, dur: (diff/3600000).toFixed(1), lat: p1.lat, lng: p1.lng, spd: p1.spd };

            if (!isGap) { if (isStopped) sleepMs += diff; } 
            else {
                if (dist < 1.0) { sleepMs += diff; info.reason = "PARKING (LEGAL)"; parkings.push(info); } 
                else { cutMs += diff; info.reason = `COUPURE MOUVEMENT (${p1.spd} km/h)`; incidents.push(info); }
            }
        }
        return { truckName, sleepMs, cutMs, incidents, parkings };
    }

    // --- CORRECTION BUG NOM BDD ---
    async saveAuditToDB() {
        if(this.incidents.length === 0 && this.parkings.length === 0) return alert("Rien à sauvegarder.");
        
        // CORRECTION: Récupérer le TEXTE du nom, pas juste l'élément input
        const checkedBoxes = document.querySelectorAll('.truck-cb:checked');
        const names = Array.from(checkedBoxes).map(cb => {
            // Remonter au parent et chercher le span avec la classe t-name
            return cb.parentElement.querySelector('.t-name').innerText;
        }).join(', ');

        const payload = {
            truckName: names.length > 50 ? names.substring(0, 47) + "..." : names,
            periodStart: document.getElementById('startDate').value,
            periodEnd: document.getElementById('endDate').value,
            stats: {
                uptime: document.getElementById('kpiUptime').innerText,
                downtime: document.getElementById('kpiDowntime').innerText,
                sleep: document.getElementById('kpiSleep').innerText,
                score: document.getElementById('kpiScore').innerText
            },
            incidents: this.incidents,
            parkings: this.parkings
        };
        try {
            const res = await fetch(`${this.apiBase}/api/audit/save`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-access-code': localStorage.getItem('fleetAccessCode') }, body: JSON.stringify(payload) });
            if(res.ok) { this.log("Rapport Sauvegardé BDD.", "ok"); this.loadHistoryList(); }
        } catch(e) { this.log("Erreur Sauvegarde", "err"); }
    }
    
    // --- GESTION HISTORIQUE & EXPORT ---
    async loadHistoryList() {
        const c = document.getElementById('historyList');
        c.innerHTML = '<div style="padding:10px;text-align:center;color:#64748b">Chargement...</div>';
        try {
            const res = await fetch(`${this.apiBase}/api/audit/list`, { headers: { 'x-access-code': localStorage.getItem('fleetAccessCode') } });
            const list = await res.json();
            c.innerHTML = '';
            list.forEach(r => {
                const div = document.createElement('div');
                div.className = 'history-item';
                div.innerHTML = `
                    <div style="font-weight:bold;color:#f1f5f9;">${r.truckName || 'Sans Nom'}</div>
                    <div style="font-size:10px;color:#94a3b8; display:flex; justify-content:space-between;">
                        <span>${new Date(r.date).toLocaleDateString()}</span>
                        <span style="color:${parseFloat(r.stats.score)>90?'#10b981':'#ef4444'}">${r.stats.score}</span>
                    </div>
                    <i class="fa-solid fa-trash h-del" onclick="event.stopPropagation(); auditor.deleteReport('${r._id}')"></i>
                `;
                div.onclick = () => this.loadReportFromDB(r._id);
                c.appendChild(div);
            });
        } catch(e) { c.innerHTML = 'Erreur liste.'; }
    }

    async loadReportFromDB(id) {
        try {
            const res = await fetch(`${this.apiBase}/api/audit/${id}`, { headers: { 'x-access-code': localStorage.getItem('fleetAccessCode') } });
            const r = await res.json();
            this.incidents = r.incidents || []; this.parkings = r.parkings || [];
            
            document.getElementById('kpiUptime').innerText = r.stats.uptime;
            document.getElementById('kpiDowntime').innerText = r.stats.downtime;
            document.getElementById('kpiSleep').innerText = r.stats.sleep;
            document.getElementById('kpiScore').innerText = r.stats.score;
            
            if(window.switchMainTab) window.switchMainTab('live');
            
            this.renderLiveResults(this.incidents, this.parkings);
            this.log("Rapport Restauré.", "ok");
        } catch(e) { this.log("Erreur Chargement.", "err"); }
    }

    async deleteReport(id) {
        if(!confirm("Supprimer ?")) return;
        await fetch(`${this.apiBase}/api/audit/${id}`, { method: 'DELETE', headers: { 'x-access-code': localStorage.getItem('fleetAccessCode') } });
        this.loadHistoryList();
    }

    filterFeed(type, el) {
        document.querySelectorAll('.pill').forEach(p => {
            p.classList.remove('active');
            p.style.background = '#1e293b'; p.style.color = '#94a3b8';
        });
        if(el) {
            el.classList.add('active');
            el.style.background = type === 'cut' ? '#ef4444' : '#3b82f6';
            el.style.color = 'white';
        }
        const feed = document.getElementById('feedContainer');
        Array.from(feed.children).forEach(div => {
            const isCut = div.className.includes('cut') || div.style.borderLeft.includes('239');
            if (type === 'cut') div.style.display = isCut ? 'block' : 'none';
            else div.style.display = !isCut ? 'block' : 'none';
        });
    }

    exportReport() {
        if (this.incidents.length === 0 && this.parkings.length === 0) return alert("Aucune donnée.");
        let txt = "RAPPORT AUDIT GPS\n=================\n";
        this.incidents.forEach(i => txt += `[COUPURE] ${i.startTime} | ${i.truck} | ${i.reason} | ${i.dur}h\n`);
        this.parkings.forEach(p => txt += `[PARKING] ${p.startTime} | ${p.truck} | ${p.dur}h\n`);
        const url = window.URL.createObjectURL(new Blob([txt], {type:'text/plain'}));
        const a = document.createElement('a'); a.href = url; a.download = 'RAPPORT.txt'; a.click();
    }

    clearAll() {
        if(!confirm("Effacer l'écran ?")) return;
        this.incidents = []; this.parkings = [];
        document.getElementById('feedContainer').innerHTML = '';
        document.getElementById('cntCuts').innerText = '0';
        document.getElementById('cntSleep').innerText = '0';
        document.getElementById('progressBar').style.width = '0%';
        this.log("Écran effacé.", "n");
    }

    getDist(lat1, lon1, lat2, lon2) {
        if(!lat1 || !lon1) return 0;
        const R = 6371; const dLat = (lat2-lat1)*Math.PI/180; const dLon = (lon2-lon1)*Math.PI/180;
        const a = Math.sin(dLat/2)*Math.sin(dLat/2) + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)*Math.sin(dLon/2);
        return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    }
}

const auditor = new GPSAuditor();