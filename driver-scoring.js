/* =============================================================
   DOUROUB FLEET V5.0 — DRIVER BEHAVIOR SCORING (AI ENHANCED)
   Evaluates driver performance based on multiple metrics
   ============================================================= */
(function() {
  'use strict';

  const API_HEADERS = () => ({ 'x-access-code': localStorage.getItem('fleetAccessCode') || '' });

  class DriverScoringEngine {
    constructor() {
      this.trucks = [];
      this.refuels = [];
      this.scores = [];
    }

    async loadData() {
      try {
        const [trucksRes, refuelsRes] = await Promise.all([
          fetch('/api/trucks', { headers: API_HEADERS() }),
          fetch('/api/refuels?limit=5000', { headers: API_HEADERS() })
        ]);
        if (trucksRes.ok) {
          const rawData = await trucksRes.json();
          const data = rawData.data || rawData;
          this.trucks = Array.isArray(data) ? data : Object.entries(data).map(([id, val]) => ({ ...val, id }));
        }
        if (refuelsRes.ok) this.refuels = await refuelsRes.json();
        console.log(`🏆 Driver Scoring: ${this.trucks.length} trucks loaded`);
      } catch(e) { console.error('Driver Scoring load error:', e); }
    }

    // ─── Calculate Score for a Single Truck ───
    calculateScore(truck) {
      const name = truck.truckName || truck.name || 'Unknown';
      const speed = truck.speed || 0;
      const fuelPercent = truck.lastFuelPercent || 0;
      const attributes = truck.attributes || {};
      const ignition = attributes.ignition === true;
      
      const reasons = { speed: [], fuel: [], activity: [], night: [], maintenance: [] };

      // 1. SPEED BEHAVIOR (30%)
      let speedScore = 100;
      if (speed > 100) { speedScore = 20; reasons.speed.push("Vitesse critique (>100 km/h) détectée (-80 pts). Risque d'accident mortel."); }
      else if (speed > 90) { speedScore = 40; reasons.speed.push("Excès de vitesse majeur (>90 km/h) (-60 pts)."); }
      else if (speed > 80) { speedScore = 65; reasons.speed.push("Vitesse élevée (>80 km/h) (-35 pts)."); }
      else if (speed > 0) { reasons.speed.push("Vitesse réglementaire respectée. Conduite sûre."); }
      else { reasons.speed.push("Véhicule à l'arrêt, pas d'infraction de vitesse en cours."); }

      // 2. FUEL EFFICIENCY (25%)
      let fuelScore = 100;
      if (fuelPercent < 10) { fuelScore -= 60; reasons.fuel.push("Niveau de carburant critique (<10%). Risque immédiat de panne sèche et d'aspiration de résidus !"); }
      else if (fuelPercent < 20) { fuelScore -= 30; reasons.fuel.push("Niveau carburant bas (<20%). Remplissage recommandé."); }
      else { reasons.fuel.push("Niveau de carburant sécurisant et bien géré."); }
      
      const myRefuels = this.refuels.filter(r => r.truckName === name || r.truck === truck.id);
      if (myRefuels.length > 5) {
         fuelScore -= 10;
         reasons.fuel.push("Remplissages inhabituellement fréquents détectés. Possible anomalie de consommation ou siphonage.");
      } else {
         reasons.fuel.push("Fréquence de remplissage cohérente avec l'utilisation.");
      }
      fuelScore = Math.max(0, fuelScore);

      // 3. ACTIVITY PATTERN (20%)
      let activityScore = 100;
      if (truck.isGpsCut) {
         activityScore -= 60;
         reasons.activity.push("Coupure brutale du GPS détectée ! Sabotage suspecté (-60 pts).");
      }
      if (speed === 0 && ignition) {
         activityScore -= 30;
         reasons.activity.push("Moteur tournant à l'arrêt de façon prolongée. Gaspillage de carburant et usure prématurée du moteur.");
      } else if (speed === 0 && !ignition) {
         reasons.activity.push("Véhicule stationné proprement avec moteur éteint (Éco-geste).");
      } else if (speed > 0) {
         reasons.activity.push("Véhicule en mouvement normal.");
      }
      activityScore = Math.max(0, activityScore);

      // 4. NIGHT DRIVING & FATIGUE (15%)
      let nightScore = 100;
      const hour = new Date().getHours();
      if (speed > 0 && (hour >= 23 || hour < 5)) {
         nightScore -= 50;
         reasons.night.push(`Conduite de nuit détectée à ${hour}h. Le risque de fatigue et de somnolence est multiplié par 4.`);
      } else {
         reasons.night.push("Conduite diurne respectée. Rythme circadien préservé.");
      }

      // 5. MAINTENANCE COMPLIANCE (10%)
      let maintScore = 100;
      reasons.maintenance.push("Aucune dégradation mécanique critique liée à la conduite immédiate détectée.");

      const total = Math.round(
        speedScore * 0.30 +
        fuelScore * 0.25 +
        activityScore * 0.20 +
        nightScore * 0.15 +
        maintScore * 0.10
      );

      let grade = 'F';
      if (total >= 90) grade = 'A';
      else if (total >= 75) grade = 'B';
      else if (total >= 60) grade = 'C';
      else if (total >= 45) grade = 'D';

      const gradeColors = { A: '#10b981', B: '#38bdf8', C: '#f59e0b', D: '#f97316', F: '#ef4444' };

      return {
        truckName: name,
        score: total,
        grade,
        gradeColor: gradeColors[grade],
        breakdown: { speed: speedScore, fuel: fuelScore, activity: activityScore, maintenance: maintScore, night: nightScore },
        reasons
      };
    }

    getFleetScores() {
      this.scores = this.trucks.map(t => this.calculateScore(t));
      this.scores.sort((a, b) => b.score - a.score);
      return this.scores;
    }

    getRadarChartData(truckScore) {
      return {
        labels: ['Vitesse', 'Carburant', 'Activité', 'Maintenance', 'Nuit'],
        datasets: [{
          label: truckScore.truckName,
          data: [
            truckScore.breakdown.speed,
            truckScore.breakdown.fuel,
            truckScore.breakdown.activity,
            truckScore.breakdown.maintenance,
            truckScore.breakdown.night
          ],
          backgroundColor: 'rgba(56,189,248,0.15)',
          borderColor: '#38bdf8',
          pointBackgroundColor: '#38bdf8',
          pointBorderColor: '#fff',
          pointRadius: 4
        }]
      };
    }

    renderScoreCard(score) {
      const ringPct = score.score / 100 * 283;
      
      const tooltipHtml = `
        <div class="score-tooltip">
            <h4 style="margin:0 0 10px 0; color:var(--text-primary); border-bottom:1px solid var(--border); padding-bottom:6px;">🧠 Analyse Détaillée de l'IA</h4>
            <div style="font-size:11px; margin-bottom:6px;"><strong style="color:#38bdf8;">🚗 Vitesse (${score.breakdown.speed}/100):</strong><br/> • ${score.reasons.speed.join('<br/> • ')}</div>
            <div style="font-size:11px; margin-bottom:6px;"><strong style="color:#38bdf8;">⛽ Carburant (${score.breakdown.fuel}/100):</strong><br/> • ${score.reasons.fuel.join('<br/> • ')}</div>
            <div style="font-size:11px; margin-bottom:6px;"><strong style="color:#38bdf8;">📊 Activité (${score.breakdown.activity}/100):</strong><br/> • ${score.reasons.activity.join('<br/> • ')}</div>
            <div style="font-size:11px; margin-bottom:6px;"><strong style="color:#38bdf8;">🌙 Nuit (${score.breakdown.night}/100):</strong><br/> • ${score.reasons.night.join('<br/> • ')}</div>
            <div style="font-size:11px; margin-top:8px; color:var(--text-muted); font-style:italic;"><i class="fa-solid fa-circle-info"></i> L'Intelligence Artificielle adapte l'usure prédictive selon ce score.</div>
        </div>
      `;

      return `
        <div class="score-card-wrapper" style="position:relative;">
          <div class="driver-score-card" style="background:var(--bg-surface,#0a0f1c); border:1px solid var(--border,#1e293b); border-radius:16px; padding:20px; display:flex; align-items:center; gap:16px; transition:all 0.2s; cursor:pointer;" onmouseenter="this.style.borderColor='${score.gradeColor}'" onmouseleave="this.style.borderColor='var(--border,#1e293b)'" onclick="window.DriverScoring.showRadarModal('${score.truckName.replace(/'/g, "\\'")}')">
            <div style="position:relative; width:60px; height:60px; flex-shrink:0;">
              <svg width="60" height="60" style="transform:rotate(-90deg);">
                <circle cx="30" cy="30" r="25" fill="none" stroke="rgba(148,163,184,0.1)" stroke-width="5"/>
                <circle cx="30" cy="30" r="25" fill="none" stroke="${score.gradeColor}" stroke-width="5" stroke-dasharray="${ringPct} 283" stroke-linecap="round" style="transition:stroke-dasharray 0.5s;"/>
              </svg>
              <div style="position:absolute; inset:0; display:flex; align-items:center; justify-content:center; font-size:18px; font-weight:900; color:${score.gradeColor};">${score.grade}</div>
            </div>
            <div style="flex:1; min-width:0;">
              <div style="font-size:14px; font-weight:700; color:var(--text-primary,#e2e8f0); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${score.truckName}</div>
              <div style="font-size:11px; color:var(--text-muted,#64748b); margin-top:2px;">${score.score}/100 points</div>
              <div style="display:flex; gap:4px; margin-top:6px;">
                ${Object.entries(score.breakdown).map(([k, v]) => {
                  const icons = { speed: '🚗', fuel: '⛽', activity: '📊', maintenance: '🔧', night: '🌙' };
                  const bg = v >= 80 ? 'rgba(16,185,129,0.15)' : v >= 60 ? 'rgba(245,158,11,0.15)' : 'rgba(239,68,68,0.15)';
                  const color = v >= 80 ? '#10b981' : v >= 60 ? '#f59e0b' : '#ef4444';
                  return `<span style="background:${bg}; color:${color}; padding:1px 5px; border-radius:4px; font-size:9px; font-weight:700;">${icons[k]}${v}</span>`;
                }).join('')}
              </div>
            </div>
            <div style="display:flex; align-items:center; gap:4px; color:var(--primary,#38bdf8); font-size:10px; font-weight:600; opacity:0.6;">
              <i class="fa-solid fa-chart-radar" style="font-size:14px;"></i>
              <span>Détails</span>
            </div>
          </div>
          ${tooltipHtml}
        </div>`;
    }

    showRadarModal(truckName) {
      const score = this.scores.find(s => s.truckName === truckName);
      if (!score) return;

      const existing = document.getElementById('radarChartModal');
      if (existing) existing.remove();

      const modal = document.createElement('div');
      modal.id = 'radarChartModal';
      modal.className = 'modal-overlay';
      modal.style.cssText = 'display:flex; position:fixed; inset:0; z-index:99998; background:rgba(0,0,0,0.6); backdrop-filter:blur(8px); align-items:center; justify-content:center;';
      modal.onclick = (e) => { if (e.target === modal) modal.remove(); };

      modal.innerHTML = `
        <div style="background:rgba(10,15,28,0.95); backdrop-filter:blur(24px); border-radius:20px; border:1px solid rgba(56,189,248,0.12); padding:24px; width:440px; max-width:92vw; box-shadow:0 24px 64px rgba(0,0,0,0.6);">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px;">
            <div>
              <div style="font-size:16px; font-weight:800; color:#e2e8f0;">${score.truckName}</div>
              <div style="font-size:12px; color:#64748b; margin-top:2px;">Score Global: <span style="color:${score.gradeColor}; font-weight:800;">${score.score}/100 (${score.grade})</span></div>
            </div>
            <button onclick="document.getElementById('radarChartModal').remove()" style="width:30px; height:30px; border-radius:8px; border:1px solid rgba(239,68,68,0.2); background:rgba(239,68,68,0.08); color:#f87171; cursor:pointer; display:flex; align-items:center; justify-content:center;">
              <i class="fa-solid fa-xmark"></i>
            </button>
          </div>
          <div style="background:rgba(30,41,59,0.4); border-radius:12px; padding:16px;">
            <canvas id="radarChartCanvas" width="380" height="300"></canvas>
          </div>
          <div style="display:grid; grid-template-columns:repeat(5,1fr); gap:8px; margin-top:16px;">
            ${Object.entries(score.breakdown).map(([k, v]) => {
              const labels = { speed: 'Vitesse', fuel: 'Carburant', activity: 'Activité', maintenance: 'Maint.', night: 'Nuit' };
              const icons = { speed: '🚗', fuel: '⛽', activity: '📊', maintenance: '🔧', night: '🌙' };
              const color = v >= 80 ? '#10b981' : v >= 60 ? '#f59e0b' : '#ef4444';
              return `<div style="text-align:center; padding:8px; background:rgba(30,41,59,0.5); border-radius:8px;">
                <div style="font-size:16px;">${icons[k]}</div>
                <div style="font-size:18px; font-weight:900; color:${color}; margin:4px 0;">${v}</div>
                <div style="font-size:9px; color:#64748b; text-transform:uppercase; letter-spacing:0.5px;">${labels[k]}</div>
              </div>`;
            }).join('')}
          </div>
        </div>
      `;

      document.body.appendChild(modal);

      setTimeout(() => {
        const ctx = document.getElementById('radarChartCanvas');
        if (ctx && window.Chart) {
          new Chart(ctx, {
            type: 'radar',
            data: this.getRadarChartData(score),
            options: {
              responsive: true,
              maintainAspectRatio: false,
              scales: {
                r: {
                  beginAtZero: true, max: 100, ticks: { display: false },
                  grid: { color: 'rgba(148,163,184,0.1)' },
                  pointLabels: { color: '#94a3b8', font: { size: 11, weight: 600 } }
                }
              },
              plugins: { legend: { display: false } }
            }
          });
        }
      }, 100);
    }

    renderDashboard(containerId) {
      const container = document.getElementById(containerId);
      if (!container) return;
      
      const scores = this.getFleetScores();
      const avgScore = scores.length > 0 ? Math.round(scores.reduce((s, t) => s + t.score, 0) / scores.length) : 0;
      const topPerformer = scores[0];
      const needsAttention = scores.filter(s => s.score < 60);

      // Injecting dynamic CSS for tooltips
      const styleId = "driver-scoring-styles";
      if (!document.getElementById(styleId)) {
         const style = document.createElement('style');
         style.id = styleId;
         style.innerHTML = `
            .score-card-wrapper .score-tooltip {
               visibility: hidden;
               opacity: 0;
               position: absolute;
               top: -10px;
               left: 105%;
               background: rgba(10, 15, 28, 0.98);
               border: 1px solid var(--border-strong);
               backdrop-filter: blur(16px);
               box-shadow: 0 10px 40px rgba(0,0,0,0.8);
               color: #fff;
               border-radius: 12px;
               padding: 16px;
               width: 340px;
               z-index: 100;
               transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
               transform: translateX(-10px);
               pointer-events: none;
            }
            .score-card-wrapper:hover .score-tooltip {
               visibility: visible;
               opacity: 1;
               transform: translateX(0);
            }
            .score-tooltip ul {
               margin: 0; padding-left: 0; list-style-type: none;
            }
         `;
         document.head.appendChild(style);
      }

      container.innerHTML = `
        <div style="display:grid; grid-template-columns:repeat(3,1fr); gap:12px; margin-bottom:20px;">
          <div style="background:var(--bg-elevated); border:1px solid var(--border); border-radius:var(--radius-lg); padding:16px; text-align:center;">
            <div style="font-size:10px; color:var(--text-muted); text-transform:uppercase; letter-spacing:1px;">Score Moyen Flotte</div>
            <div style="font-size:32px; font-weight:900; color:${avgScore >= 75 ? '#10b981' : avgScore >= 60 ? '#f59e0b' : '#ef4444'}; margin-top:4px;">${avgScore}</div>
          </div>
          <div style="background:var(--bg-elevated); border:1px solid var(--border); border-radius:var(--radius-lg); padding:16px; text-align:center;">
            <div style="font-size:10px; color:var(--text-muted); text-transform:uppercase; letter-spacing:1px;">Meilleur Chauffeur</div>
            <div style="font-size:16px; font-weight:700; color:var(--success); margin-top:4px;">🏆 ${topPerformer ? topPerformer.truckName : '—'}</div>
          </div>
          <div style="background:var(--bg-elevated); border:1px solid var(--border); border-radius:var(--radius-lg); padding:16px; text-align:center;">
            <div style="font-size:10px; color:var(--text-muted); text-transform:uppercase; letter-spacing:1px;">Besoin d'Attention</div>
            <div style="font-size:32px; font-weight:900; color:var(--danger); margin-top:4px;">${needsAttention.length}</div>
          </div>
        </div>
        <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(320px,1fr)); gap:12px;">
          ${scores.map(s => this.renderScoreCard(s)).join('')}
        </div>
      `;
    }
  }

  window.DriverScoring = new DriverScoringEngine();
  console.log('🏆 Driver Scoring Engine V5.0 loaded');
})();
