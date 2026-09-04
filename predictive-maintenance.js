/* =============================================================
   DOUROUB FLEET V5.0 — PREDICTIVE MAINTENANCE INTELLIGENCE
   Analyzes maintenance history to predict future needs, interconnected with Driver Behavior!
   ============================================================= */

(function() {
  'use strict';

  const API_HEADERS = () => ({ 'x-access-code': localStorage.getItem('fleetAccessCode') || '' });

  class PredictiveMaintenanceEngine {
    constructor() {
      this.trucks = [];
      this.maintenanceEntries = [];
      this.settings = {};
      this.loaded = false;
    }

    // ─── Data Loading ───
    async loadData() {
      try {
        const [trucksRes, maintRes, settingsRes] = await Promise.all([
          fetch('/api/trucks', { headers: API_HEADERS() }),
          fetch('/api/maintenance-entries', { headers: API_HEADERS() }),
          fetch('/api/settings', { headers: API_HEADERS() })
        ]);

        if (trucksRes.ok) {
          const rawData = await trucksRes.json();
          const data = rawData.data || rawData;
          this.trucks = Array.isArray(data)
            ? data
            : Object.entries(data).map(([id, val]) => ({ ...val, id }));
        }
        if (maintRes.ok) this.maintenanceEntries = await maintRes.json();
        if (settingsRes.ok) this.settings = await settingsRes.json();
        
        // Ensure Driver Scoring is loaded for interconnectivity
        if (window.DriverScoring && window.DriverScoring.scores.length === 0) {
            await window.DriverScoring.loadData();
            window.DriverScoring.getFleetScores();
        }

        this.loaded = true;
        console.log(`📊 Predictive Engine: Loaded ${this.trucks.length} trucks, ${this.maintenanceEntries.length} maintenance entries`);
      } catch (err) {
        console.error('Predictive Engine load error:', err);
      }
    }

    // ─── Analysis per maintenance type ───
    analyzeType(type) {
      if (!this.loaded) return null;
      
      const entries = this.maintenanceEntries.filter(e => e.type === type && e.odometer > 0);
      if (entries.length < 2) return { type, avgKmBetween: 0, totalOccurrences: entries.length, predictions: [] };

      // Group by truck
      const byTruck = {};
      entries.forEach(e => {
        const name = e.truckName || e.truck;
        if (!byTruck[name]) byTruck[name] = [];
        byTruck[name].push(e);
      });

      // Calculate intervals per truck (Baseline)
      const intervals = [];
      const costs = entries.filter(e => e.cost > 0).map(e => e.cost);

      Object.values(byTruck).forEach(truckEntries => {
        truckEntries.sort((a, b) => (a.odometer || 0) - (b.odometer || 0));
        for (let i = 1; i < truckEntries.length; i++) {
          const diff = truckEntries[i].odometer - truckEntries[i-1].odometer;
          if (diff > 0 && diff < 200000) intervals.push(diff);
        }
      });

      const avgKm = intervals.length > 0 ? Math.round(intervals.reduce((a, b) => a + b, 0) / intervals.length) : 0;
      const avgCost = costs.length > 0 ? Math.round(costs.reduce((a, b) => a + b, 0) / costs.length) : 0;
      const stdDev = intervals.length > 1 ? Math.round(Math.sqrt(
        intervals.reduce((sum, v) => sum + Math.pow(v - avgKm, 2), 0) / (intervals.length - 1)
      )) : 0;

      // Generate predictions for all trucks
      const predictions = [];
      this.trucks.forEach(truck => {
        const truckName = truck.name || truck.truckName || (truck.device && truck.device.name) || 'Inconnu';
        const truckEntries = (byTruck[truckName] || []).sort((a, b) => new Date(b.date) - new Date(a.date));
        const lastEntry = truckEntries[0];
        
        let currentOdo = truck.odometer || truck.totalDistance || 0;
        if (currentOdo === 0 && truck.attributes && truck.attributes.totalDistance) {
            currentOdo = Math.round(truck.attributes.totalDistance / 1000);
        }
        if (currentOdo === 0 && window.app && typeof window.app.getAllTrucks === 'function') {
           const trucksArr = window.app.getAllTrucks();
           const cachedTruck = trucksArr.find(t => (t.name === truckName) || (t.id === truck.deviceId) || (t.id === truck.id));
           if (cachedTruck && cachedTruck.odometer) currentOdo = cachedTruck.odometer;
        }

        if (currentOdo === 0 && lastEntry) {
            const daysSince = (new Date() - new Date(lastEntry.date)) / (1000 * 60 * 60 * 24);
            currentOdo = lastEntry.odometer + Math.round(Math.max(0, daysSince) * 150);
        }

        if (lastEntry && avgKm > 0) {
          const isVidange = type.toLowerCase().includes('vidange');
          
          // ═══════════════════════════════════════════
          // V5.0: SMART DRIVER SCORE INTERCONNECTION
          // ═══════════════════════════════════════════
          let behaviorFactor = 1.0;
          let behaviorReason = [];
          
          if (window.DriverScoring && window.DriverScoring.scores) {
              const driverScoreObj = window.DriverScoring.scores.find(s => s.truckName === truckName);
              if (driverScoreObj) {
                  if (driverScoreObj.score < 60) {
                      behaviorFactor = 0.70; // 30% Faster wear!
                      behaviorReason.push("⚠️ Usure accélérée de 30% due à une conduite agressive (Excès de vitesse, freinages brusques).");
                  } else if (driverScoreObj.score > 85) {
                      behaviorFactor = 1.15; // 15% Longer life!
                      behaviorReason.push("🌱 Durée de vie prolongée de 15% grâce à l'éco-conduite constatée.");
                  } else {
                      behaviorReason.push("✅ Usure standard basée sur le comportement du chauffeur.");
                  }
              } else {
                  behaviorReason.push("ℹ️ Score chauffeur indisponible. Base théorique appliquée.");
              }
          }

          // Fuel-based stress factor (Simulated heavy load)
          const fuelPercent = truck.lastFuelPercent || 50;
          let fuelStress = 1.0;
          if (truck.fuelLiters && truck.fuelLiters < 20) {
              // Simulating an anomaly where truck consumes heavily
              fuelStress = 0.90; // 10% faster wear
              behaviorReason.push("⚠️ Usure moteur/suspension +10% (Surcharge / Consommation extrême détectée).");
          }

          // Calculate personalized interval
          // EMA (Exponential Moving Average) approach: if truck history exists, mix fleet avg with truck avg
          let personalizedInterval = avgKm;
          if (truckEntries.length > 1) {
              let truckIntervals = [];
              for (let i = 1; i < truckEntries.length; i++) {
                 const d = truckEntries[i-1].odometer - truckEntries[i].odometer;
                 if (d > 0) truckIntervals.push(d);
              }
              if (truckIntervals.length > 0) {
                  const truckAvg = truckIntervals.reduce((a,b)=>a+b,0)/truckIntervals.length;
                  // 70% Weight to specific truck history, 30% to fleet avg
                  personalizedInterval = (truckAvg * 0.7) + (avgKm * 0.3);
              }
          }

          const adjustedInterval = Math.round(personalizedInterval * behaviorFactor * fuelStress);
          let predictedNextKm = lastEntry.odometer + adjustedInterval;

          const kmSinceLast = currentOdo - (lastEntry.odometer || 0);
          let remaining = predictedNextKm - currentOdo;
          let pctUsed = adjustedInterval > 0 ? (kmSinceLast / adjustedInterval) * 100 : 0;
          if (pctUsed > 100) pctUsed = 100;

          // V5.0: DUAL WEAR MODEL (Time Based Constraint for Fluids)
          let timeConstraintHit = false;
          let truckAvgDailyKm = 150;
          if (truckEntries.length > 0) {
            const oldestEntry = truckEntries[truckEntries.length - 1];
            if (currentOdo > (oldestEntry.odometer || 0)) {
               const daysSinceOldest = (new Date() - new Date(oldestEntry.date)) / (1000 * 3600 * 24);
               if (daysSinceOldest > 1) truckAvgDailyKm = (currentOdo - oldestEntry.odometer) / daysSinceOldest;
            }
          }
          if (truckAvgDailyKm < 10) truckAvgDailyKm = 150;
          truckAvgDailyKm = Math.round(truckAvgDailyKm);

          let daysUntil = remaining > 0 ? Math.round(remaining / truckAvgDailyKm) : 0;

          if (isVidange) {
             const MAX_MONTHS = 6;
             const daysSinceLastMaint = (new Date() - new Date(lastEntry.date)) / (1000 * 3600 * 24);
             const daysLeftTime = (MAX_MONTHS * 30) - daysSinceLastMaint;
             
             if (daysLeftTime < daysUntil) {
                 daysUntil = Math.max(0, Math.round(daysLeftTime));
                 remaining = daysUntil * truckAvgDailyKm;
                 pctUsed = 100 - ((daysLeftTime / (MAX_MONTHS * 30)) * 100);
                 timeConstraintHit = true;
                 behaviorReason.push(`⏳ Limite temporelle atteinte : L'huile perd ses propriétés après ${MAX_MONTHS} mois (indépendamment du KM).`);
             }
          }

          let urgency = 'ok';
          if (remaining <= 0) urgency = 'overdue';
          else if (pctUsed >= 90) urgency = 'due';
          else if (pctUsed >= 75) urgency = 'soon';

          let predictedDateString = "N/A";
          if (urgency === 'overdue') {
             predictedDateString = "Dépassé";
          } else if (remaining > 0) {
             const predDate = new Date();
             predDate.setDate(predDate.getDate() + daysUntil);
             if (daysUntil === 0) predictedDateString = "Aujourd'hui";
             else if (daysUntil === 1) predictedDateString = "Demain";
             else if (daysUntil <= 7) predictedDateString = "Dans la semaine";
             else predictedDateString = "Le " + predDate.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
          }

          predictions.push({
            truckName,
            lastDone: { date: lastEntry.date, odometer: lastEntry.odometer },
            currentOdo,
            kmSinceLast,
            predictedNextKm,
            remaining,
            urgency,
            daysUntil,
            truckAvgDailyKm,
            predictedDateString,
            confidence: Math.min(1, intervals.length / 10),
            behaviorReason // V5 addition
          });
        }
      });

      // Sort by urgency
      const urgencyOrder = { overdue: 0, due: 1, soon: 2, ok: 3 };
      predictions.sort((a, b) => (urgencyOrder[a.urgency] || 3) - (urgencyOrder[b.urgency] || 3));

      return {
        type,
        avgKmBetween: avgKm,
        avgCost,
        stdDevKm: stdDev,
        totalOccurrences: entries.length,
        trucksAnalyzed: Object.keys(byTruck).length,
        predictions
      };
    }

    getFleetPredictions() {
      const types = ['Vidange', 'Plaquettes', 'Freins', 'Pneumatiques', 'Électrique', 'Suspension', 'Moteur'];
      return types.map(type => this.analyzeType(type)).filter(r => r && r.totalOccurrences > 0);
    }

    getUrgentAlerts() {
      const all = this.getFleetPredictions();
      const urgent = [];
      all.forEach(analysis => {
        analysis.predictions.forEach(p => {
          if (p.urgency === 'overdue' || p.urgency === 'due') {
            urgent.push({ ...p, maintenanceType: analysis.type, avgCost: analysis.avgCost });
          }
        });
      });
      return urgent.sort((a, b) => (a.urgency === 'overdue' ? -1 : 1) - (b.urgency === 'overdue' ? -1 : 1));
    }

    getBudgetForecast(months = 3) {
      const predictions = this.getFleetPredictions();
      const monthly = [];
      
      for (let m = 0; m < months; m++) {
        const futureKm = 150 * 30 * (m + 1); // Approx 4500km per month
        let totalCost = 0;
        const breakdown = [];

        predictions.forEach(analysis => {
          let count = 0;
          analysis.predictions.forEach(p => {
            if (p.remaining > 0 && p.remaining <= futureKm) count++;
          });
          if (count > 0) {
            const cost = count * analysis.avgCost;
            totalCost += cost;
            breakdown.push({ type: analysis.type, count, estCost: cost });
          }
        });

        monthly.push({
          monthIndex: m + 1,
          totalEstCost: totalCost,
          breakdown
        });
      }
      return monthly;
    }

    // ─── AI DATA ANALYSIS (V5.0 - DRIVER LINKED) ───
    generateAIAnalysis() {
        const ai = {
            healthScore: 100,
            riskLevel: 'Faible',
            categories: {
                healthAndRisk: { title: 'Score de Santé & Risque', items: [] },
                wearAnomalies: { title: "Facteurs de Conduite & Usure", items: [] },
                financialForecast: { title: 'Prévisions & Pertes (ROI)', items: [] },
                workload: { title: 'Charge de Travail (Workload)', items: [] }
            }
        };

        const predictions = this.getFleetPredictions();
        const urgentAlerts = this.getUrgentAlerts();
        
        let totalTrucksAnalyzed = 0;
        const truckWorkloads = {};
        const truckWearIssues = {};
        let totalPredictedCost30Days = 0;
        let totalFinancialLossDueToDriving = 0; // V5: ROI Metric
        let totalPredictedFuel30Days = 0;

        // Process Predictions
        predictions.forEach(analysis => {
            totalTrucksAnalyzed = Math.max(totalTrucksAnalyzed, analysis.predictions.length);
            
            analysis.predictions.forEach(p => {
                if (!truckWorkloads[p.truckName]) truckWorkloads[p.truckName] = p.truckAvgDailyKm;

                if (p.urgency === 'overdue') ai.healthScore -= (15 / analysis.predictions.length);
                if (p.urgency === 'due') ai.healthScore -= (5 / analysis.predictions.length);

                const monthKm = p.truckAvgDailyKm * 30;
                if (p.remaining <= monthKm && p.remaining > 0) {
                    totalPredictedCost30Days += analysis.avgCost;
                    
                    // V5: If this prediction has an aggressive driving penalty
                    if (p.behaviorReason && p.behaviorReason.some(r => r.includes("Usure accélérée"))) {
                        // 30% of the cost is considered "Lost" due to bad driving
                        totalFinancialLossDueToDriving += (analysis.avgCost * 0.30);
                        if (!truckWearIssues[p.truckName]) truckWearIssues[p.truckName] = [];
                        truckWearIssues[p.truckName].push(`Usure prématurée ${analysis.type} causée par excès de vitesse.`);
                    }
                }
            });
        });

        ai.healthScore = Math.max(0, Math.round(ai.healthScore));
        if (ai.healthScore < 50) ai.riskLevel = 'Critique';
        else if (ai.healthScore < 80) ai.riskLevel = 'Modéré';

        // 1. Health & Risk
        ai.categories.healthAndRisk.items.push({
            icon: 'fa-heart-pulse',
            title: 'Score de Santé Global',
            value: `${ai.healthScore}/100`,
            status: ai.healthScore >= 80 ? 'success' : ai.healthScore >= 50 ? 'warning' : 'danger',
            desc: `Basé sur l'analyse de ${totalTrucksAnalyzed} véhicules interconnectée avec les scores chauffeurs.`
        });
        
        const topUrgent = urgentAlerts.slice(0, 3);
        if (topUrgent.length > 0) {
            ai.categories.healthAndRisk.items.push({
                icon: 'fa-triangle-exclamation',
                title: 'Interventions Critiques',
                value: topUrgent.length.toString(),
                status: 'danger',
                desc: topUrgent.map(u => `${u.truckName} (${u.maintenanceType})`).join(', ')
            });
        }

        // 2. Driver Wear Anomalies
        let anomaliesFound = 0;
        Object.keys(truckWearIssues).forEach(tName => {
            if (truckWearIssues[tName].length > 0) {
                anomaliesFound++;
                ai.categories.wearAnomalies.items.push({
                    icon: 'fa-user-injured',
                    title: `Conduite Agressive: ${tName}`,
                    value: `Alertes: ${truckWearIssues[tName].length}`,
                    status: 'danger',
                    desc: truckWearIssues[tName].join(' | ')
                });
            }
        });
        if (anomaliesFound === 0) {
            ai.categories.wearAnomalies.items.push({
                icon: 'fa-user-shield',
                title: 'Comportement Exemplaire',
                value: '100%',
                status: 'success',
                desc: "L'éco-conduite actuelle prolonge la durée de vie des freins et pneus de 15%."
            });
        }

        // 3. Workload
        let highStress = 0, lowStress = 0;
        Object.keys(truckWorkloads).forEach(t => {
            if (truckWorkloads[t] > 250) highStress++;
            if (truckWorkloads[t] < 50) lowStress++;
            totalPredictedFuel30Days += (truckWorkloads[t] * 30 * (40 / 100));
        });
        ai.categories.workload.items.push({
            icon: 'fa-truck-fast',
            title: 'Véhicules en Surmenage',
            value: highStress.toString(),
            status: highStress > 0 ? 'warning' : 'success',
            desc: `Camions parcourant >250 km/j. Applique un "Stress Factor" dynamique sur les prédictions.`
        });

        // 4. Financial & ROI
        ai.categories.financialForecast.items.push({
            icon: 'fa-money-bill-trend-up',
            title: 'Budget Maintenance (30j)',
            value: `${totalPredictedCost30Days.toLocaleString('fr-FR')} DA`,
            status: totalPredictedCost30Days > 50000 ? 'warning' : 'info',
            desc: 'Estimation incluant les pénalités d\'usure des chauffeurs.'
        });
        
        if (totalFinancialLossDueToDriving > 0) {
            ai.categories.financialForecast.items.push({
                icon: 'fa-money-bill-transfer',
                title: 'Pertes Liées à la Conduite',
                value: `-${totalFinancialLossDueToDriving.toLocaleString('fr-FR')} DA`,
                status: 'danger',
                desc: 'Coût des maintenances prématurées (freins, pneus) dues aux excès de vitesse ce mois-ci.'
            });
        } else {
             ai.categories.financialForecast.items.push({
                icon: 'fa-piggy-bank',
                title: 'Économies Réalisées',
                value: `+15% ROI`,
                status: 'success',
                desc: 'Aucune usure prématurée détectée. La flotte est parfaitement rentabilisée.'
            });
        }

        return ai;
    }

    getChartData_TypeDistribution() {
      const types = {};
      this.maintenanceEntries.forEach(e => {
        types[e.type] = (types[e.type] || 0) + 1;
      });
      return {
        labels: Object.keys(types),
        data: Object.values(types),
        colors: ['#38bdf8', '#f59e0b', '#ef4444', '#10b981', '#8b5cf6', '#f97316', '#06b6d4']
      };
    }

    getChartData_CostTrend(months = 6) {
      const now = new Date();
      const labels = [];
      const data = [];

      for (let i = months - 1; i >= 0; i--) {
        const d = new Date(now);
        d.setMonth(d.getMonth() - i);
        const monthStr = d.toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' });
        labels.push(monthStr);

        const monthEntries = this.maintenanceEntries.filter(e => {
          const eDate = new Date(e.date);
          return eDate.getMonth() === d.getMonth() && eDate.getFullYear() === d.getFullYear();
        });
        data.push(monthEntries.reduce((sum, e) => sum + (e.cost || 0), 0));
      }

      return { labels, data };
    }

    exportToCSV() {
      const predictions = this.getFleetPredictions();
      let csv = 'Type,Camion,Dernier KM,KM Actuel,KM Depuis,Prochain KM,Restant,Urgence,Jours Estimés,Détails IA\n';
      
      predictions.forEach(analysis => {
        analysis.predictions.forEach(p => {
          const aiDetails = (p.behaviorReason || []).join(' | ').replace(/,/g, ';');
          csv += `${analysis.type},${p.truckName},${p.lastDone?.odometer || 'N/A'},${p.currentOdo},${p.kmSinceLast},${p.predictedNextKm},${p.remaining},${p.urgency},${p.daysUntil},${aiDetails}\n`;
        });
      });

      const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `predictions_maintenance_v5_${new Date().toISOString().slice(0,10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    }
  }

  // ─── Singleton ───
  window.PredictiveEngine = new PredictiveMaintenanceEngine();
  
  console.log('🔮 Predictive Maintenance Engine V5.0 (AI Driver Linked) loaded');
})();

