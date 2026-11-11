/* ═══════════════════════════════════════════════════════════════════
   Maintenance — Atelier Biskra : Phase 5
   PDF « Bon de réparation » (BR-YYYY-####) + export Excel du suivi.
   100 % côté navigateur : jsPDF + autoTable + ExcelJS (déjà chargés
   dans index.html). Aucun coût affiché (décision Q7).
   Expose window.AtelierExport = { pdf(id), xlsx() }.
   ═══════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var STATUS_LABEL = {
    ouvert: 'Ouvert', en_cours: 'En cours', en_attente_piece: 'En attente pièce', termine: 'Terminé'
  };
  var STATUS_RGB = {
    ouvert: [56, 189, 248], en_cours: [245, 158, 11], en_attente_piece: [167, 139, 250], termine: [16, 185, 129]
  };
  var KIND_LABEL = { camion: 'Camion', remorque: 'Remorque', vehicule: 'Véhicule léger' };
  var DAY = 86400000;
  var COMPANY = 'DOUROUB EL DJAZAIR';

  function toast(msg, type) {
    if (typeof window.showToast === 'function') window.showToast(msg, type || 'info');
    else console.log('[AtelierExport] ' + msg);
  }
  function baseUrl() {
    try { return (typeof FLEET_CONFIG !== 'undefined' && FLEET_CONFIG.API && FLEET_CONFIG.API.baseUrl) || ''; }
    catch (e) { return ''; }
  }
  async function fetchBon(id) {
    var res = await fetch(baseUrl() + '/api/atelier/bons/' + encodeURIComponent(id));
    var data = null;
    try { data = await res.json(); } catch (e) { data = null; }
    if (!res.ok) throw new Error((data && data.error) || ('Erreur ' + res.status));
    return data;
  }
  function pad(n) { return String(n).padStart(2, '0'); }
  function fmtDate(d) {
    if (!d) return '-';
    var x = new Date(d);
    if (isNaN(x)) return '-';
    return pad(x.getDate()) + '/' + pad(x.getMonth() + 1) + '/' + x.getFullYear();
  }
  function fmtDateTime(d) {
    if (!d) return '-';
    var x = new Date(d);
    if (isNaN(x)) return '-';
    return fmtDate(x) + ' ' + pad(x.getHours()) + ':' + pad(x.getMinutes());
  }
  function daysOpen(b) {
    var end = b.closedAt ? new Date(b.closedAt) : new Date();
    return Math.max(0, (end - new Date(b.openedAt)) / DAY);
  }
  function fmtDays(n) {
    n = Number(n) || 0;
    return n < 1 ? Math.round(n * 24) + ' h' : n.toFixed(1).replace('.0', '') + ' j';
  }
  function who() { try { return localStorage.getItem('fleetUserName') || ''; } catch (e) { return ''; } }
  function safeName(s) { return String(s || '').replace(/[^A-Za-z0-9._-]+/g, '_'); }

  function getJsPDF() {
    if (window.jspdf && window.jspdf.jsPDF) return window.jspdf.jsPDF;
    if (window.jsPDF) return window.jsPDF;
    return null;
  }

  function download(blob, filename) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { a.remove(); URL.revokeObjectURL(url); }, 1500);
  }

  // ───────────────────────── PDF ─────────────────────────
  function drawHeader(doc, b) {
    var W = doc.internal.pageSize.getWidth();
    doc.setFillColor(15, 23, 42);
    doc.rect(0, 0, W, 30, 'F');
    doc.setFillColor(245, 158, 11);
    doc.rect(0, 30, W, 1.4, 'F');
    doc.setTextColor(245, 158, 11);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(15);
    doc.text(COMPANY, 14, 13);
    doc.setTextColor(203, 213, 225);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
    doc.text('Atelier Biskra - Suivi des réparations', 14, 20);
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(13);
    doc.text('BON DE RÉPARATION', W - 14, 13, { align: 'right' });
    doc.setFontSize(12); doc.setTextColor(245, 158, 11);
    doc.text(String(b.ref || ''), W - 14, 21, { align: 'right' });
  }

  function drawFooters(doc, b) {
    var W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight();
    var total = doc.internal.getNumberOfPages();
    for (var i = 1; i <= total; i++) {
      doc.setPage(i);
      doc.setDrawColor(203, 213, 225); doc.setLineWidth(0.2);
      doc.line(14, H - 12, W - 14, H - 12);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(100, 116, 139);
      doc.text(String(b.ref || '') + '  -  Imprimé le ' + fmtDateTime(new Date()) + (who() ? ' par ' + who() : ''), 14, H - 7);
      doc.text('Page ' + i + ' / ' + total, W - 14, H - 7, { align: 'right' });
    }
  }

  function buildPdf(b) {
    var JsPDF = getJsPDF();
    if (!JsPDF) throw new Error('jsPDF non chargé (vérifiez la connexion internet)');
    var doc = new JsPDF({ unit: 'mm', format: 'a4' });
    if (typeof doc.autoTable !== 'function') throw new Error('Plugin autoTable non chargé');
    var W = doc.internal.pageSize.getWidth();
    var v = b.vehicle || {}, lines = b.lines || [];

    drawHeader(doc, b);

    // Statut + durée
    var rgb = STATUS_RGB[b.status] || [100, 116, 139];
    doc.setFillColor(rgb[0], rgb[1], rgb[2]);
    doc.roundedRect(14, 36, 46, 8, 2, 2, 'F');
    doc.setTextColor(15, 23, 42); doc.setFont('helvetica', 'bold'); doc.setFontSize(10);
    doc.text((STATUS_LABEL[b.status] || b.status || '').toUpperCase(), 37, 41.4, { align: 'center' });
    doc.setTextColor(71, 85, 105); doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
    doc.text((b.closedAt ? 'Durée d\'immobilisation : ' : 'Ouvert depuis : ') + fmtDays(daysOpen(b)), W - 14, 41.4, { align: 'right' });

    // Bloc véhicule / panne
    var info = [
      ['Véhicule', v.name || '-', 'Immatriculation', v.plate || '-'],
      ['Type', KIND_LABEL[v.kind] || '-', 'Châssis', v.chassis || '-'],
      ['Km à l\'entrée', v.kmAtEntry ? Number(v.kmAtEntry).toLocaleString('fr-FR') + ' km' : '-', 'Remorque attelée', v.attachedTrailer || '-'],
      ['Type de panne', b.panneType || '-', 'Date d\'ouverture', fmtDateTime(b.openedAt)],
      ['Créé par', b.createdBy || '-', 'Date de clôture', b.closedAt ? fmtDateTime(b.closedAt) : '-']
    ];
    doc.autoTable({
      startY: 49, body: info, theme: 'grid',
      styles: { font: 'helvetica', fontSize: 9, cellPadding: 2, lineColor: [203, 213, 225], lineWidth: 0.2, textColor: [15, 23, 42] },
      columnStyles: {
        0: { fontStyle: 'bold', fillColor: [241, 245, 249], cellWidth: 32 },
        1: { cellWidth: 56 },
        2: { fontStyle: 'bold', fillColor: [241, 245, 249], cellWidth: 36 },
        3: { cellWidth: 58 }
      },
      margin: { left: 14, right: 14 }
    });
    var y = doc.lastAutoTable.finalY + 6;

    // Description
    if (b.description) {
      doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(180, 83, 9);
      doc.text('Description / symptômes', 14, y);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(30, 41, 59);
      var wrapped = doc.splitTextToSize(String(b.description), W - 28);
      doc.text(wrapped, 14, y + 5);
      y += 5 + wrapped.length * 4.2 + 4;
    }

    // Interventions & pièces
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(180, 83, 9);
    doc.text('Interventions & pièces', 14, y);
    var rows = lines.length ? lines.map(function (l, i) {
      var p = l.piece || {}, it = l.intervenant || {};
      return [
        String(i + 1),
        (l.intervention || '-') + (l.isVidange ? ' (vidange)' : ''),
        it.name ? it.name + (it.type === 'externe' ? ' (ext.)' : ' (int.)') : '-',
        p.designation || '-',
        p.ref || '-',
        p.sn || '-',
        p.designation ? String(p.qty || 1) : '-'
      ];
    }) : [['-', 'Aucune intervention enregistrée', '', '', '', '', '']];
    doc.autoTable({
      startY: y + 2,
      head: [['#', 'Intervention', 'Intervenant', 'Pièce', 'Référence', 'N° série', 'Qté']],
      body: rows, theme: 'striped',
      styles: { font: 'helvetica', fontSize: 8.5, cellPadding: 2, textColor: [15, 23, 42], valign: 'middle' },
      headStyles: { fillColor: [15, 23, 42], textColor: [245, 158, 11], fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      columnStyles: { 0: { cellWidth: 8, halign: 'center' }, 6: { cellWidth: 11, halign: 'center' } },
      margin: { left: 14, right: 14, bottom: 18 }
    });
    y = doc.lastAutoTable.finalY + 6;

    // Historique des statuts
    var hist = b.statusHistory || [];
    if (hist.length) {
      if (y > 235) { doc.addPage(); drawHeader(doc, b); y = 40; }
      doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(180, 83, 9);
      doc.text('Historique', 14, y);
      doc.autoTable({
        startY: y + 2,
        head: [['Statut', 'Date', 'Par']],
        body: hist.map(function (h) { return [STATUS_LABEL[h.status] || h.status || '-', fmtDateTime(h.at), h.by || '-']; }),
        theme: 'grid',
        styles: { font: 'helvetica', fontSize: 8.5, cellPadding: 1.8, lineColor: [226, 232, 240], lineWidth: 0.2, textColor: [15, 23, 42] },
        headStyles: { fillColor: [241, 245, 249], textColor: [51, 65, 85], fontStyle: 'bold' },
        margin: { left: 14, right: 14, bottom: 18 }
      });
      y = doc.lastAutoTable.finalY + 8;
    }

    // Signatures
    var H = doc.internal.pageSize.getHeight();
    if (y > H - 55) { doc.addPage(); drawHeader(doc, b); y = 42; }
    var boxW = (W - 28 - 10) / 3, labels = ['Méthodiste', 'Intervenant', 'Responsable'];
    doc.setDrawColor(148, 163, 184); doc.setLineWidth(0.3);
    labels.forEach(function (lb, i) {
      var x = 14 + i * (boxW + 5);
      doc.rect(x, y, boxW, 28);
      doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(71, 85, 105);
      doc.text(lb, x + 3, y + 5);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(148, 163, 184);
      doc.text('Date, nom et signature', x + 3, y + 25);
    });

    drawFooters(doc, b);
    return doc;
  }

  async function pdf(idOrBon) {
    try {
      var b = (idOrBon && typeof idOrBon === 'object') ? idOrBon : await fetchBon(idOrBon);
      var doc = buildPdf(b);
      doc.save('Bon_' + safeName(b.ref) + '_' + safeName((b.vehicle || {}).plate || (b.vehicle || {}).name) + '.pdf');
      toast('PDF ' + b.ref + ' généré', 'success');
    } catch (e) {
      console.error('[AtelierExport] pdf', e);
      toast('PDF impossible : ' + e.message, 'error');
    }
  }

  // ───────────────────────── EXCEL ─────────────────────────
  function styleSheet(ws, widths) {
    ws.columns.forEach(function (c, i) { c.width = widths[i] || 16; });
    var head = ws.getRow(1);
    head.height = 22;
    head.eachCell(function (cell) {
      cell.font = { bold: true, color: { argb: 'FFF59E0B' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } };
      cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    });
    ws.views = [{ state: 'frozen', ySplit: 1 }];
    if (ws.rowCount > 1) ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: ws.columns.length } };
  }

  async function xlsx() {
    try {
      if (typeof ExcelJS === 'undefined') throw new Error('ExcelJS non chargé (vérifiez la connexion internet)');
      var bons;
      if (window.AtelierUI && typeof window.AtelierUI.getFiltered === 'function') bons = window.AtelierUI.getFiltered();
      if (!bons || !bons.length) {
        var res = await fetch(baseUrl() + '/api/atelier/bons?status=all&limit=5000');
        if (!res.ok) throw new Error('Erreur ' + res.status);
        bons = await res.json();
      }
      if (!bons.length) { toast('Aucun bon à exporter', 'warning'); return; }

      var lateDays = (window.AtelierUI && typeof window.AtelierUI.getLateDays === 'function' && window.AtelierUI.getLateDays()) || 3;
      var wb = new ExcelJS.Workbook();
      wb.creator = COMPANY; wb.created = new Date();

      var ws = wb.addWorksheet('Bons');
      ws.addRow(['Réf', 'Type', 'Véhicule', 'Immatriculation', 'Châssis', 'Km entrée', 'Remorque', 'Panne', 'Description',
        'Interventions', 'Intervenants', 'Pièces', 'Statut', 'Ouvert le', 'Terminé le', 'Durée (jours)', 'En retard', 'Vidange remise à zéro', 'Créé par']);
      bons.forEach(function (b) {
        var v = b.vehicle || {}, lines = b.lines || [];
        var uniq = function (arr) { return arr.filter(function (x, i) { return x && arr.indexOf(x) === i; }); };
        var d = daysOpen(b);
        ws.addRow([
          b.ref, KIND_LABEL[v.kind] || '', v.name || '', v.plate || '', v.chassis || '', v.kmAtEntry || '', v.attachedTrailer || '',
          b.panneType || '', b.description || '',
          uniq(lines.map(function (l) { return l.intervention; })).join(', '),
          uniq(lines.map(function (l) { return (l.intervenant || {}).name; })).join(', '),
          lines.map(function (l) { return (l.piece || {}).designation; }).filter(Boolean).join(', '),
          STATUS_LABEL[b.status] || b.status,
          b.openedAt ? new Date(b.openedAt) : '', b.closedAt ? new Date(b.closedAt) : '',
          Math.round(d * 10) / 10,
          (b.status !== 'termine' && d > lateDays) ? 'Oui' : '',
          b.vidangeReset ? 'Oui' : '', b.createdBy || ''
        ]);
      });
      styleSheet(ws, [15, 14, 22, 16, 20, 11, 16, 22, 34, 30, 24, 30, 16, 17, 17, 12, 10, 12, 14]);
      ws.getColumn(14).numFmt = 'dd/mm/yyyy hh:mm';
      ws.getColumn(15).numFmt = 'dd/mm/yyyy hh:mm';
      ws.getColumn(6).numFmt = '#,##0';

      var wl = wb.addWorksheet('Interventions & pièces');
      wl.addRow(['Réf bon', 'Immatriculation', 'Véhicule', 'Panne', 'Statut', 'Intervention', 'Vidange', 'Intervenant', 'Interne / Externe',
        'Pièce', 'Famille', 'Référence', 'N° série', 'Qté', 'Source', 'Ouvert le']);
      bons.forEach(function (b) {
        var v = b.vehicle || {};
        (b.lines || []).forEach(function (l) {
          var p = l.piece || {}, it = l.intervenant || {};
          wl.addRow([
            b.ref, v.plate || '', v.name || '', b.panneType || '', STATUS_LABEL[b.status] || b.status,
            l.intervention || '', l.isVidange ? 'Oui' : '', it.name || '', it.name ? (it.type === 'externe' ? 'Externe' : 'Interne') : '',
            p.designation || '', p.family || '', p.ref || '', p.sn || '', p.designation ? (p.qty || 1) : '',
            p.designation ? (p.source === 'erp' ? 'ERP' : 'Externe') : '', b.openedAt ? new Date(b.openedAt) : ''
          ]);
        });
      });
      styleSheet(wl, [15, 16, 22, 22, 16, 26, 9, 22, 12, 28, 16, 16, 20, 7, 10, 17]);
      wl.getColumn(16).numFmt = 'dd/mm/yyyy hh:mm';

      var buf = await wb.xlsx.writeBuffer();
      var stamp = new Date();
      var fname = 'Atelier_Biskra_' + stamp.getFullYear() + pad(stamp.getMonth() + 1) + pad(stamp.getDate()) + '.xlsx';
      download(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), fname);
      toast('Excel exporté (' + bons.length + ' bon' + (bons.length > 1 ? 's' : '') + ')', 'success');
    } catch (e) {
      console.error('[AtelierExport] xlsx', e);
      toast('Export Excel impossible : ' + e.message, 'error');
    }
  }

  window.AtelierExport = { pdf: pdf, xlsx: xlsx };
})();
