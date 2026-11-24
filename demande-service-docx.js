/**
 * demande-service-docx.js — Exact 1-page .docx generator for "DEMANDE DE SERVICE"
 *
 * Strictly preserves templates/demande_service_template.docx (header, logos, borders, signature box)
 * while applying:
 *   - Clean Times New Roman (majorBidi) 12pt bold font + Left-to-Right alignment in DESIGNATION
 *   - Closest scheduled Vidange pack km computed from the truck's General/Fleet Rule (getTruckConfig)
 *   - Fleet business rule: in vidange period -> Vidange; outside vidange period -> Plaquettes de Frein
 *     (unless manually set to Maintenance Générale or another specific single prestation)
 *   - Strictly ONE single prestation per DA and strictly ONE single A4 page.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const JSZip = require('jszip');

const TEMPLATE_PATH = path.join(__dirname, 'templates', 'demande_service_template.docx');

function xmlEsc(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatKmSpaces(km) {
  const n = Math.round(Number(km) || 0);
  if (n <= 0) return '……';
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

function closestVidangePackKm(odometerKm, cfg) {
  const odo = Math.round(Number(odometerKm) || 0);
  const startRaw = cfg && cfg.vidangeStartKm !== undefined && cfg.vidangeStartKm !== null ? parseInt(cfg.vidangeStartKm, 10) : 5000;
  const rotRaw = cfg && cfg.vidangeRotationKm !== undefined && cfg.vidangeRotationKm !== null ? parseInt(cfg.vidangeRotationKm, 10) : 25000;
  const startKm = Number.isFinite(startRaw) && startRaw >= 0 ? startRaw : 5000;
  const rotKm = Number.isFinite(rotRaw) && rotRaw >= 0 ? rotRaw : 25000;

  if (rotKm > 0) {
    if (odo <= 0) return startKm > 0 ? startKm : rotKm;
    if (odo <= startKm) return startKm > 0 ? startKm : rotKm;
    const k = Math.max(0, Math.round((odo - startKm) / rotKm));
    const pack = startKm + k * rotKm;
    return pack > 0 ? pack : rotKm;
  }

  if (cfg && cfg.vidangeMilestones) {
    const list = (Array.isArray(cfg.vidangeMilestones) ? cfg.vidangeMilestones : String(cfg.vidangeMilestones).split(','))
      .map((x) => parseInt(String(x).trim(), 10))
      .filter((n) => Number.isFinite(n) && n > 0);
    if (list.length && odo > 0) {
      return list.reduce((best, m) => Math.abs(m - odo) < Math.abs(best - odo) ? m : best, list[0]);
    }
    if (list.length) return list[0];
  }
  return odo > 0 ? Math.round(odo / 5000) * 5000 : 25000;
}

function formatDateDDMMYYYY(d) {
  const dt = d ? new Date(d) : new Date();
  const valid = !isNaN(dt.getTime()) ? dt : new Date();
  const dd = String(valid.getDate()).padStart(2, '0');
  const mm = String(valid.getMonth() + 1).padStart(2, '0');
  const yyyy = String(valid.getFullYear());
  return { formatted: `${dd}/${mm}/${yyyy}`, fileTag: `${dd}-${mm}-${yyyy}`, year: yyyy };
}

function formatTractorLabel(truckName, chassisNumber) {
  const raw = String(truckName || '').trim().toUpperCase().replace(/\s+/g, ' ');
  if (!raw) return 'TRACTEUR MAN';
  if (/^TRACTEUR\b/.test(raw)) return raw;
  if (/\b(HOWO|MAN|RENAULT|VOLVO|SCANIA|MERCEDES|ACTROS|IVECO|SHACMAN|DAF|SINOTRUK)\b/.test(raw)) {
    return `TRACTEUR ${raw}`;
  }
  const ch = String(chassisNumber || '').trim().toUpperCase();
  if (ch.startsWith('LZZ')) return `TRACTEUR HOWO ${raw}`;
  return `TRACTEUR MAN ${raw}`;
}

function resolveEffectiveType(src, truckCfg, calculateVidangeStatus, skipUntilKm) {
  const raw = String(src.type || '').trim();
  if (/vidange/i.test(raw)) return 'Vidange';
  if (/plaquette|frein/i.test(raw)) return 'Plaquettes de Frein';
  // Apply fleet rule to unverified legacy auto-detected "Maintenance Générale":
  // if in vidange period -> Vidange; otherwise (95% of visits) -> Plaquettes de Frein
  if (src.isAuto && !src.verified && (!raw || /^maintenance(\s*g[eé]n[eé]rale)?$/i.test(raw))) {
    if (calculateVidangeStatus && Number(src.odometer) > 0) {
      try {
        const vs = calculateVidangeStatus(Number(src.odometer), truckCfg, skipUntilKm || null);
        if (vs && vs.alert) return 'Vidange';
      } catch (_) { /* ignore */ }
    }
    return 'Plaquettes de Frein';
  }
  return raw || 'Plaquettes de Frein';
}

function buildDesignationTitle(effectiveType, odometerKm, truckName, chassisNumber, truckCfg, customDesignation) {
  if (customDesignation && String(customDesignation).trim()) {
    return String(customDesignation).trim().toUpperCase();
  }
  const tractor = formatTractorLabel(truckName, chassisNumber);
  const t = String(effectiveType || 'Vidange').trim();
  if (/vidange/i.test(t)) {
    const packKm = closestVidangePackKm(odometerKm, truckCfg);
    return `VIDANGE PERIODIQUE ${formatKmSpaces(packKm)} KM POUR ${tractor}`;
  }
  if (/plaquette|frein/i.test(t)) {
    return `F/P PLAQUETTE DU FREIN POUR ${tractor}`;
  }
  if (/^maintenance(\s*g[eé]n[eé]rale)?$/i.test(t)) {
    return `MAINTENANCE GENERALE POUR ${tractor}`;
  }
  if (/pneu/i.test(t)) return `F/P PNEUMATIQUES POUR ${tractor}`;
  if (/filtre/i.test(t)) return `F/P FILTRES POUR ${tractor}`;
  if (/batterie/i.test(t)) return `F/P BATTERIE POUR ${tractor}`;
  const cleanUpper = t.replace(/^remplacement\s+(de\s+|des\s+|du\s+)?/i, '').trim().toUpperCase();
  if (/^F\/P\b/.test(cleanUpper)) return `${cleanUpper} POUR ${tractor}`;
  return `F/P ${cleanUpper} POUR ${tractor}`;
}

function estimateVisualLines(text) {
  const len = String(text || '').length;
  return len <= 0 ? 1 : Math.max(1, Math.ceil(len / 44));
}

function safeFilePart(s) {
  return String(s || '').trim().replace(/[^a-zA-Z0-9_-]+/g, '_').replace(/^_+|_+$/g, '') || 'CAMION';
}

function buildFileName(effectiveType, truckName, deviceId, dateObj) {
  const t = String(effectiveType || 'Vidange');
  const kind = /vidange/i.test(t) ? 'VIDANGE' : (/plaquette|frein/i.test(t) ? 'PLAQUETTE' : safeFilePart(t.toUpperCase()).slice(0, 14));
  const truck = safeFilePart(truckName || deviceId || 'TRACTEUR');
  return `DA_${kind}_${truck}_${dateObj.fileTag}.docx`;
}

async function generateDocxBuffer(data) {
  if (!fs.existsSync(TEMPLATE_PATH)) {
    throw new Error('Modèle introuvable : templates/demande_service_template.docx');
  }
  const templateBuf = fs.readFileSync(TEMPLATE_PATH);
  const zip = await JSZip.loadAsync(templateBuf);
  const docFile = zip.file('word/document.xml');
  if (!docFile) throw new Error('word/document.xml manquant dans le modèle');

  let xml = await docFile.async('string');

  const dInfo = formatDateDDMMYYYY(data.date);
  const refPrefix = (data.refNum && String(data.refNum).trim()) ? String(data.refNum).trim() : '……';
  const immVal = (data.immatriculation && String(data.immatriculation).trim()) ? String(data.immatriculation).trim().toUpperCase() : '…………………';
  const chasVal = (data.chassisNumber && String(data.chassisNumber).trim()) ? String(data.chassisNumber).trim().toUpperCase() : '…………………';
  const effectiveType = data.effectiveType || data.type || 'Vidange';
  const desigTitle = buildDesignationTitle(effectiveType, data.odometer, data.truckName, chasVal, data.truckConfig, data.customDesignation);

  const immLine = `IMMATRICLUE\u00A0: ${immVal}`;
  const chasLine = `NUMERO DE CHASIS\u00A0: ${chasVal}`;

  // 1) Replace Réf + Date paragraph (paraId="0CB93506")
  const refSpaces = '                                                                                                                 ';
  const refParaXml =
    `<w:p w14:paraId="0CB93506" w14:textId="77777777" w:rsidR="0082395F" w:rsidRDefault="00674800" w:rsidP="009A4BD4">` +
    `<w:pPr><w:jc w:val="center"/><w:rPr><w:rFonts w:asciiTheme="majorBidi" w:hAnsiTheme="majorBidi" w:cstheme="majorBidi"/><w:b/><w:bCs/><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr></w:pPr>` +
    `<w:r><w:rPr><w:rFonts w:asciiTheme="majorBidi" w:hAnsiTheme="majorBidi" w:cstheme="majorBidi"/><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr><w:t xml:space="preserve">Réf\u00A0:  ${xmlEsc(refPrefix)}/DG/${xmlEsc(dInfo.year)}${refSpaces}</w:t></w:r>` +
    `<w:r w:rsidR="00DE2EE0" w:rsidRPr="00EB0F05"><w:rPr><w:rFonts w:asciiTheme="majorBidi" w:hAnsiTheme="majorBidi" w:cstheme="majorBidi"/><w:b/><w:bCs/><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr><w:t xml:space="preserve">Le : ${xmlEsc(dInfo.formatted)}</w:t></w:r>` +
    `</w:p>`;
  xml = xml.replace(/<w:p [^>]*w14:paraId="0CB93506"[\s\S]*?<\/w:p>/, () => refParaXml);

  // 2) Set DESIGNATION body cell vertical alignment to top (left-to-right reading, not centered in middle)
  xml = xml.replace(
    /<w:tc><w:tcPr><w:tcW w:w="6379" w:type="dxa"\s*\/><w:vAlign w:val="center"\s*\/><\/w:tcPr>/,
    '<w:tc><w:tcPr><w:tcW w:w="6379" w:type="dxa"/><w:vAlign w:val="top"/></w:tcPr>'
  );

  // 3) Replace Designation paragraphs: crisp Times New Roman 12pt Bold, Left-to-Right (jc="left", bidi="0", left indent 140 dxa)
  const rPrXml =
    `<w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman" w:asciiTheme="majorBidi" w:hAnsiTheme="majorBidi" w:cstheme="majorBidi"/>` +
    `<w:b/><w:bCs/><w:color w:val="000000"/><w:sz w:val="24"/><w:szCs w:val="24"/>`;
  const makeDesigPara = (paraId, text, spaceBefore) =>
    `<w:p w14:paraId="${paraId}" w14:textId="77777777">` +
    `<w:pPr><w:bidi w:val="0"/><w:spacing w:before="${spaceBefore || 20}" w:after="20"/><w:ind w:left="140"/><w:jc w:val="left"/><w:rPr>${rPrXml}</w:rPr></w:pPr>` +
    `<w:r><w:rPr>${rPrXml}</w:rPr><w:t xml:space="preserve">${xmlEsc(text)}</w:t></w:r></w:p>`;

  xml = xml.replace(/<w:p [^>]*w14:paraId="63C0384E"[\s\S]*?<\/w:p>/, () => makeDesigPara('63C0384E', desigTitle, 140));
  xml = xml.replace(/<w:p [^>]*w14:paraId="21219AF0"[\s\S]*?<\/w:p>/, () =>
    `<w:p w14:paraId="21219AF0" w14:textId="2141A62E"><w:pPr><w:spacing w:before="20" w:after="20"/><w:jc w:val="left"/><w:rPr><w:sz w:val="20"/></w:rPr></w:pPr></w:p>`
  );
  xml = xml.replace(/<w:p [^>]*w14:paraId="6E910701"[\s\S]*?<\/w:p>/, () => makeDesigPara('6E910701', immLine, 20));
  xml = xml.replace(/<w:p [^>]*w14:paraId="5359DD64"[\s\S]*?<\/w:p>/, () => makeDesigPara('5359DD64', chasLine, 20));

  // 4) Strict 1-page guarantee: keep exact spacer budget so the whole form + signatures fit on 1 page
  const usedVisualLines = estimateVisualLines(desigTitle) + estimateVisualLines(immLine) + estimateVisualLines(chasLine);
  const spacersToDrop = Math.min(10, Math.max(2, (usedVisualLines - 3) + 2));
  const emptySpacerIds = ['14EE0C2D', '57EB955E', '29C8DBC9', '3BD36DF2', '0065876C', '090DD0FD', '07CE68E3', '26223997', '5094B34A', '15F0BABE'];
  for (let i = 0; i < spacersToDrop && i < emptySpacerIds.length; i++) {
    xml = xml.replace(new RegExp(`<w:p [^>]*w14:paraId="${emptySpacerIds[i]}"[\\s\\S]*?<\\/w:p>`), '');
  }

  // Shrink trailing body paragraph after signature table so it never pushes onto Page 2
  xml = xml.replace(
    /<w:p [^>]*w14:paraId="68BDDE16"[\s\S]*?<\/w:p>/,
    '<w:p w14:paraId="68BDDE16" w14:textId="77777777"><w:pPr><w:spacing w:before="0" w:after="0" w:line="20" w:lineRule="exact"/><w:rPr><w:sz w:val="2"/><w:szCs w:val="2"/></w:rPr></w:pPr></w:p>'
  );

  zip.file('word/document.xml', xml);
  const buffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 6 } });
  return {
    buffer,
    filename: buildFileName(effectiveType, data.truckName, data.deviceId, dInfo),
    designation: desigTitle,
    effectiveType,
    dateFormatted: dInfo.formatted
  };
}

async function resolveEntryData(item, deps) {
  const { Maintenance, Truck, getTruckConfig, calculateVidangeStatus, getSettings } = deps;
  let doc = null;
  if (item && (item.id || item._id) && Maintenance) {
    try { doc = await Maintenance.findById(item.id || item._id).lean(); } catch (_) { /* ignore */ }
  }
  const src = Object.assign({}, doc || {}, item || {});
  if (doc) {
    if (item.type === undefined) src.type = doc.type;
    if (item.odometer === undefined) src.odometer = doc.odometer;
    if (item.date === undefined) src.date = doc.date;
    if (item.truckName === undefined) src.truckName = doc.truckName;
    if (item.deviceId === undefined) src.deviceId = doc.deviceId;
    if (item.isAuto === undefined) src.isAuto = doc.isAuto;
    if (item.verified === undefined) src.verified = doc.verified;
  }

  let dbTruck = null;
  if (Truck && (src.deviceId || src.truckName)) {
    try {
      dbTruck = await Truck.findOne({
        $or: [
          ...(src.deviceId ? [{ deviceId: String(src.deviceId) }] : []),
          ...(src.truckName ? [{ truckName: String(src.truckName), immatriculation: { $nin: [null, ''] } }] : [])
        ]
      }).lean();
      if (!dbTruck && src.truckName) dbTruck = await Truck.findOne({ truckName: String(src.truckName) }).lean();
    } catch (_) { /* optional */ }
  }

  const deviceId = String(src.deviceId || (dbTruck && dbTruck.deviceId) || '');
  const truckConfig = getTruckConfig ? getTruckConfig(deviceId) : {};
  const settings = getSettings ? (getSettings() || {}) : {};
  const ovr = (settings.vidangeOverrides || {})[deviceId];

  // Live / fallback odometer if entry had 0
  let odo = Number(src.odometer) || 0;
  if (odo <= 0 && dbTruck) {
    odo = Number(dbTruck.odometer) || (dbTruck.params && dbTruck.params.io192 ? Math.round(parseInt(dbTruck.params.io192, 10) / 1000) : 0) || 0;
  }
  if (odo <= 0 && ovr && Number(ovr.lastVidangeKm) > 0) odo = Number(ovr.lastVidangeKm);

  const effectiveType = resolveEffectiveType(
    Object.assign({}, src, { odometer: odo }),
    truckConfig,
    calculateVidangeStatus,
    null
  );

  return {
    deviceId,
    truckName: src.truckName || (dbTruck && dbTruck.truckName) || '',
    type: src.type || effectiveType,
    effectiveType,
    odometer: odo,
    date: src.date || new Date(),
    immatriculation: src.immatriculation || (dbTruck && dbTruck.immatriculation) || '',
    chassisNumber: src.chassisNumber || (dbTruck && dbTruck.chassisNumber) || '',
    truckConfig,
    refNum: src.refNum || '',
    customDesignation: src.customDesignation || ''
  };
}

function registerRoutes(app, deps) {
  const { checkAccess } = deps;

  app.get('/api/maintenance/:id/demande-service.docx', checkAccess, async (req, res) => {
    try {
      const data = await resolveEntryData({ id: req.params.id, refNum: req.query.ref || '' }, deps);
      if (!data.truckName && !data.deviceId) return res.status(404).json({ error: 'Intervention introuvable' });
      const { buffer, filename } = await generateDocxBuffer(data);
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(buffer);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.post('/api/maintenance/demande-service.docx', checkAccess, async (req, res) => {
    try {
      const data = await resolveEntryData(req.body || {}, deps);
      const { buffer, filename } = await generateDocxBuffer(data);
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(buffer);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.post('/api/maintenance/demande-service-bulk', checkAccess, async (req, res) => {
    try {
      const body = req.body || {};
      const ids = Array.isArray(body.ids) ? body.ids.filter(Boolean) : [];
      const items = Array.isArray(body.items) && body.items.length ? body.items : ids.map((id) => ({ id }));
      if (!items.length) return res.status(400).json({ error: 'Aucune intervention sélectionnée' });

      const usedNames = {};
      const files = [];
      for (const it of items) {
        const data = await resolveEntryData(it, deps);
        const gen = await generateDocxBuffer(data);
        let fname = gen.filename;
        if (usedNames[fname]) {
          usedNames[fname]++;
          fname = fname.replace(/\.docx$/i, `_${usedNames[fname]}.docx`);
        } else {
          usedNames[fname] = 1;
        }
        files.push({ filename: fname, buffer: gen.buffer });
      }

      if (body.format === 'files') {
        return res.json({
          success: true,
          files: files.map((f) => ({ filename: f.filename, base64: f.buffer.toString('base64') }))
        });
      }

      const bundle = new JSZip();
      files.forEach((f) => bundle.file(f.filename, f.buffer));
      const zipBuf = await bundle.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
      const zipName = `Demandes_Service_${new Date().toISOString().slice(0, 10)}.zip`;
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', `attachment; filename="${zipName}"`);
      res.send(zipBuf);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });
}

module.exports = { generateDocxBuffer, closestVidangePackKm, buildDesignationTitle, formatTractorLabel, registerRoutes };
