/* =============================================================
   DOUROUB FLEET V4.0 — PDF GENERATOR
   Generates PDF reports for maintenance orders, fleet status, refuels
   Uses jsPDF library (loaded from CDN)
   ============================================================= */
(function() {
  'use strict';

  function getJsPDF() {
    if (window.jspdf && window.jspdf.jsPDF) return window.jspdf.jsPDF;
    if (window.jsPDF) return window.jsPDF;
    return null;
  }

  class FleetPDFGenerator {
    constructor() {
      this.companyName = 'DOUROUB EL DJAZAIR';
      this.companySubtitle = 'Système de Gestion de Flotte V4.0';
    }

    // ─── Header for all PDFs ───
    _addHeader(doc, title) {
      // Company header
      doc.setFillColor(10, 15, 28);
      doc.rect(0, 0, 210, 35, 'F');

      doc.setTextColor(56, 189, 248);
      doc.setFontSize(16);
      doc.setFont(undefined, 'bold');
      doc.text(this.companyName, 15, 15);

      doc.setTextColor(148, 163, 184);
      doc.setFontSize(9);
      doc.setFont(undefined, 'normal');
      doc.text(this.companySubtitle, 15, 22);

      // Title
      doc.setTextColor(226, 232, 240);
      doc.setFontSize(12);
      doc.setFont(undefined, 'bold');
      doc.text(title, 15, 30);

      // Date
      doc.setTextColor(100, 116, 139);
      doc.setFontSize(8);
      doc.text('Généré le ' + new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }), 150, 15);

      doc.setTextColor(0, 0, 0);
      return 42;
    }

    // ─── Generate Maintenance Order PDF ───
    generateMaintenanceOrder(order) {
      const JSPDF = getJsPDF();
      if (!JSPDF) { alert('jsPDF non chargé'); return; }

      const doc = new JSPDF();
      let y = this._addHeader(doc, 'ORDRE DE MAINTENANCE');

      // Order info box
      doc.setDrawColor(56, 189, 248);
      doc.setLineWidth(0.5);
      doc.roundedRect(15, y, 180, 30, 3, 3);
      
      doc.setFontSize(10);
      doc.setFont(undefined, 'bold');
      doc.text('Camion:', 20, y + 8);
      doc.text('Type:', 20, y + 15);
      doc.text('Date:', 20, y + 22);
      doc.text('Statut:', 110, y + 8);
      doc.text('Priorité:', 110, y + 15);
      doc.text('Technicien:', 110, y + 22);

      doc.setFont(undefined, 'normal');
      doc.text(order.truckName || '—', 50, y + 8);
      doc.text(order.type || '—', 50, y + 15);
      doc.text(order.date ? new Date(order.date).toLocaleDateString('fr-FR') : '—', 50, y + 22);
      doc.text(order.status || 'en_cours', 140, y + 8);
      doc.text(order.priority || 'normal', 140, y + 15);
      doc.text(order.technician || '—', 140, y + 22);

      y += 38;

      // Description
      if (order.description) {
        doc.setFontSize(10);
        doc.setFont(undefined, 'bold');
        doc.text('Description:', 15, y);
        y += 6;
        doc.setFont(undefined, 'normal');
        doc.setFontSize(9);
        const lines = doc.splitTextToSize(order.description, 175);
        doc.text(lines, 15, y);
        y += lines.length * 5 + 5;
      }

      // Parts table
      if (order.parts && order.parts.length > 0) {
        doc.setFontSize(10);
        doc.setFont(undefined, 'bold');
        doc.text('Pièces utilisées:', 15, y);
        y += 4;

        doc.autoTable({
          startY: y,
          head: [['Pièce', 'Quantité', 'Coût unitaire', 'Total']],
          body: order.parts.map(p => [
            p.name || '—',
            p.quantity || 1,
            (p.cost || 0).toLocaleString('fr-FR') + ' DA',
            ((p.cost || 0) * (p.quantity || 1)).toLocaleString('fr-FR') + ' DA'
          ]),
          theme: 'grid',
          headStyles: { fillColor: [56, 189, 248], textColor: [255, 255, 255], fontSize: 9 },
          bodyStyles: { fontSize: 9 },
          margin: { left: 15, right: 15 }
        });

        y = doc.lastAutoTable.finalY + 10;
      }

      // Total cost
      if (order.cost) {
        doc.setFillColor(240, 249, 255);
        doc.roundedRect(15, y, 180, 12, 2, 2, 'F');
        doc.setFontSize(11);
        doc.setFont(undefined, 'bold');
        doc.text('Coût Total: ' + order.cost.toLocaleString('fr-FR') + ' DA', 20, y + 8);
        y += 18;
      }

      // GPS Confirmation
      if (order.gpsConfirmed !== undefined) {
        doc.setFontSize(9);
        doc.text('Confirmation GPS: ' + (order.gpsConfirmed ? '✓ Confirmé' : '✗ Non confirmé'), 15, y);
        y += 8;
      }

      // Signature lines
      y = Math.max(y + 10, 230);
      doc.setDrawColor(200, 200, 200);
      doc.line(15, y, 85, y);
      doc.line(120, y, 190, y);
      doc.setFontSize(8);
      doc.text('Signature Responsable', 25, y + 5);
      doc.text('Signature Technicien', 135, y + 5);

      doc.save(`ordre_maintenance_${order.truckName || 'unknown'}_${new Date().toISOString().slice(0,10)}.pdf`);
      window.showToast && window.showToast('📄 PDF généré avec succès', 'success');
    }

    // ─── Generate Maintenance History PDF ───
    generateMaintenanceHistoryReport(logs) {
      const JSPDF = getJsPDF();
      if (!JSPDF) { alert('jsPDF non chargé'); return; }

      const doc = new JSPDF();
      let y = this._addHeader(doc, 'HISTORIQUE DE MAINTENANCE');

      const totalCost = logs.reduce((s, l) => s + (l.cost || 0), 0);
      doc.setFontSize(10);
      doc.text(`Total interventions: ${logs.length}`, 15, y);
      doc.text(`Coût total: ${totalCost.toLocaleString('fr-FR')} DA`, 15, y + 6);
      y += 16;

      doc.autoTable({
        startY: y,
        head: [['Date', 'Camion', 'Type', 'Compteur', 'Lieu', 'Coût']],
        body: logs.map(l => [
          l.date ? new Date(l.date).toLocaleDateString('fr-FR') : '—',
          l.truckName || '—',
          l.type || '—',
          (l.odometer || 0) + ' km',
          l.location || '—',
          (l.cost || 0).toLocaleString('fr-FR') + ' DA'
        ]),
        theme: 'striped',
        headStyles: { fillColor: [56, 189, 248], textColor: [255, 255, 255], fontSize: 8 },
        bodyStyles: { fontSize: 7 },
        margin: { left: 10, right: 10 }
      });

      doc.save(`historique_maintenance_${new Date().toISOString().slice(0,10)}.pdf`);
      window.showToast && window.showToast('📄 Historique maintenance généré', 'success');
    }

    // ─── Generate Fleet Report PDF ───
    generateFleetReport(trucks, predictions) {
      const JSPDF = getJsPDF();
      if (!JSPDF) { alert('jsPDF non chargé'); return; }

      const doc = new JSPDF();
      let y = this._addHeader(doc, 'RAPPORT DE FLOTTE');

      // Summary
      doc.setFontSize(10);
      doc.text(`Nombre de camions: ${trucks.length}`, 15, y);
      doc.text(`Date du rapport: ${new Date().toLocaleDateString('fr-FR')}`, 15, y + 6);
      y += 16;

      // Trucks table
      doc.autoTable({
        startY: y,
        head: [['Camion', 'Vitesse', 'Carburant %', 'Zone', 'Statut']],
        body: trucks.map(t => [
          t.truckName || t.name || '—',
          (t.speed || 0) + ' km/h',
          (t.lastFuelPercent || 0) + '%',
          t.zone || '—',
          t.speed > 0 ? 'En route' : 'Arrêté'
        ]),
        theme: 'striped',
        headStyles: { fillColor: [56, 189, 248], textColor: [255, 255, 255], fontSize: 9 },
        bodyStyles: { fontSize: 8 },
        margin: { left: 15, right: 15 }
      });

      doc.save(`rapport_flotte_${new Date().toISOString().slice(0,10)}.pdf`);
      window.showToast && window.showToast('📄 Rapport flotte généré', 'success');
    }

    // ─── Generate Refuel Report PDF ───
    generateRefuelReport(refuels) {
      const JSPDF = getJsPDF();
      if (!JSPDF) { alert('jsPDF non chargé'); return; }

      const doc = new JSPDF();
      let y = this._addHeader(doc, 'RAPPORT DE CARBURANT');

      const totalLiters = refuels.reduce((s, r) => s + (r.addedLiters || 0), 0);
      doc.setFontSize(10);
      doc.text(`Total remplissages: ${refuels.length}`, 15, y);
      doc.text(`Total litres: ${totalLiters.toLocaleString('fr-FR')} L`, 15, y + 6);
      y += 16;

      doc.autoTable({
        startY: y,
        head: [['Camion', 'Date', 'Litres', 'Ancien', 'Nouveau', 'Source']],
        body: refuels.slice(0, 100).map(r => [
          r.truckName || '—',
          r.timestamp ? new Date(r.timestamp).toLocaleDateString('fr-FR') : '—',
          (r.addedLiters || 0) + ' L',
          (r.oldLevel || 0) + ' L',
          (r.newLevel || 0) + ' L',
          r.source || 'auto'
        ]),
        theme: 'striped',
        headStyles: { fillColor: [16, 185, 129], textColor: [255, 255, 255], fontSize: 8 },
        bodyStyles: { fontSize: 7 },
        margin: { left: 10, right: 10 }
      });

      doc.save(`rapport_carburant_${new Date().toISOString().slice(0,10)}.pdf`);
      window.showToast && window.showToast('📄 Rapport carburant généré', 'success');
    }
  }

  window.FleetPDF = new FleetPDFGenerator();
  console.log('📄 Fleet PDF Generator V4.0 loaded');
})();
