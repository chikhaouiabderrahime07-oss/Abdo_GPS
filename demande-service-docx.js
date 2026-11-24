/**
 * demande-service-docx.js — Exact 1-page .docx generator for "DEMANDE DE SERVICE"
 *
 * Uses templates/demande_service_template.docx byte-for-byte (preserving header logos,
 * fonts, borders, yellow banners, and signature table) and surgically updates ONLY:
 *   1. Header line: Réf : ……/DG/YYYY  ...  Le : DD/MM/YYYY (date of prestation / entry)
 *   2. Designation cell:
 *        - Vidange:    VIDANGE PERIODIQUE XX XXX KM POUR TRACTEUR MAN T040
 *        - Plaquettes: F/P PLAQUETTE DU FREIN POUR TRACTEUR MAN T040
 *        - Other:      F/P <TYPE> POUR TRACTEUR MAN T040
 *        + IMMATRICLUE : XXXXXXX
 *        + NUMERO DE CHASIS : XXXXX
 *   3. Compensates empty spacer paragraphs inside the cell + shrinks trailing body paragraph
 *      so the document NEVER spills onto a 2nd page.
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
  if (/^(TRACTEUR\b)/.test(raw)) return raw;
  const hasKnownBrand = /\b(HOWO|MAN|RENAULT|VOLVO|SCANIA|MERCEDES|ACTROS|IVECO|SHACMAN|DAF|SINOTRUK)\b/.test(raw);
  if (hasKnownBrand) return `TRACTEUR ${raw}`;
  const ch = String(chassisNumber || '').trim().toUpperCase();
  if (ch.startsWith('LZZ')) return `TRACTEUR HOWO ${raw}`;
  return `TRACTEUR MAN ${raw}`;
}

function buildDesignationTitle(type, odometerKm, truckName, chassisNumber, customDesignation) {
  if (customDesignation && String(customDesignation).trim()) {
    return String(customDesignation).trim().toUpperCase();
  }
  const tractor = formatTractorLabel(truckName, chassisNumber);
  const t = String(type || 'Vidange').trim();
  if (/vidange/i.test(t)) {
    return `VIDANGE PERIODIQUE ${formatKmSpaces(odometerKm)} KM POUR ${tractor}`;
  }
  if (/plaquette|frein/i.test(t)) {
    return `F/P PLAQUETTE DU FREIN POUR ${tractor}`;
  }
  if (/pneu/i.test(t)) {
    return `F/P PNEUMATIQUES POUR ${tractor}`;
  }
  if (/filtre/i.test(t)) {
    return `F/P FILTRES POUR ${tractor}`;
  }
  if (/batterie/i.test(t)) {
    return `F/P BATTERIE POUR ${tractor}`;
  }
  const cleanUpper = t.replace(/^remplacement\s+(de\s+|des\s+|du\s+)?/i, '').trim().toUpperCase();
  if (/^F\/P\b/.test(cleanUpper)) return `${cleanUpper} POUR ${tractor}`;
  return `F/P ${cleanUpper || 'MAINTENANCE'} POUR ${tractor}`;
}

function estimateVisualLines(text) {
  const len = String(text || '').length;
  if (len <= 0) return 1;
  return Math.max(1, Math.ceil(len / 31));
}

function safeFilePart(s) {
  return String(s || '').trim().replace(/[^a-zA-Z0-9_-]+/g, '_').replace(/^_+|_+$/g, '') || 'CAMION';
}

function buildFileName(data, dateObj) {
  const t = String(data.type || 'Vidange');
  const kind = /vidange/i.test(t) ? 'VIDANGE' : (/plaquette|frein/i.test(t) ? 'PLAQUETTE' : safeFilePart(t.toUpperCase()).slice(0, 14));
  const truck = safeFilePart(data.truckName || data.deviceId || 'TRACTEUR');
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
  const desigTitle = buildDesignationTitle(data.type, data.odometer, data.truckName, chasVal, data.customDesignation);

  const immLine = `IMMATRICLUE\u00A0: ${immVal}`;
  const chasLine = `NUMERO DE CHASIS\u00A0: ${chasVal}`;

  // 1) Replace Réf + Date paragraph (paraId="0CB93506") preserving exact fonts, spacing & bold Le :
  const refSpaces = '                                                                                                                 ';
  const refParaXml =
    `<w:p w14:paraId="0CB93506" w14:textId="77777777" w:rsidR="0082395F" w:rsidRDefault="00674800" w:rsidP="009A4BD4">` +
    `<w:pPr><w:jc w:val="center"/><w:rPr><w:rFonts w:asciiTheme="majorBidi" w:hAnsiTheme="majorBidi" w:cstheme="majorBidi"/><w:b/><w:bCs/><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr></w:pPr>` +
    `<w:r><w:rPr><w:rFonts w:asciiTheme="majorBidi" w:hAnsiTheme="majorBidi" w:cstheme="majorBidi"/><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr><w:t xml:space="preserve">Réf\u00A0:  ${xmlEsc(refPrefix)}/DG/${xmlEsc(dInfo.year)}${refSpaces}</w:t></w:r>` +
    `<w:r w:rsidR="00DE2EE0" w:rsidRPr="00EB0F05"><w:rPr><w:rFonts w:asciiTheme="majorBidi" w:hAnsiTheme="majorBidi" w:cstheme="majorBidi"/><w:b/><w:bCs/><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr><w:t xml:space="preserve">Le : ${xmlEsc(dInfo.formatted)}</w:t></w:r>` +
    `</w:p>`;
  xml = xml.replace(/<w:p [^>]*w14:paraId="0CB93506"[\s\S]*?<\/w:p>/, () => refParaXml);

  // 2) Replace Designation line 1 (paraId="63C0384E"), IMM (paraId="6E910701"), Chassis (paraId="5359DD64")
  const makeDesigPara = (paraId, text) =>
    `<w:p w14:paraId="${paraId}" w14:textId="77777777" w:rsidR="00D23C87" w:rsidRPr="00D23C87" w:rsidRDefault="00D23C87">` +
    `<w:pPr><w:spacing w:before="10" w:after="10"/><w:jc w:val="center"/><w:rPr><w:sz w:val="32"/><w:szCs w:val="36"/></w:rPr></w:pPr>` +
    `<w:r w:rsidRPr="00D23C87"><w:rPr><w:sz w:val="32"/><w:szCs w:val="36"/></w:rPr><w:t xml:space="preserve">${xmlEsc(text)}</w:t></w:r></w:p>`;

  xml = xml.replace(/<w:p [^>]*w14:paraId="63C0384E"[\s\S]*?<\/w:p>/, () => makeDesigPara('63C0384E', desigTitle));
  xml = xml.replace(/<w:p [^>]*w14:paraId="6E910701"[\s\S]*?<\/w:p>/, () => makeDesigPara('6E910701', immLine));
  xml = xml.replace(/<w:p [^>]*w14:paraId="5359DD64"[\s\S]*?<\/w:p>/, () => makeDesigPara('5359DD64', chasLine));

  // 3) Strict 1-page guarantee: compensate wrapped lines by trimming empty filler <w:p> inside the cell
  //    (template had 4 visual text lines + 16 blank Enter lines; trimming extra wrapped lines keeps exact same table height)
  const usedVisualLines = estimateVisualLines(desigTitle) + estimateVisualLines(immLine) + estimateVisualLines(chasLine);
  const spacersToDrop = Math.min(12, Math.max(2, (usedVisualLines - 4) * 2 + 2));
  const emptySpacerIds = ['14EE0C2D', '57EB955E', '29C8DBC9', '3BD36DF2', '0065876C', '090DD0FD', '07CE68E3', '26223997', '5094B34A', '15F0BABE', '4FB53004', '2CE4FB3F'];
  for (let i = 0; i < spacersToDrop && i < emptySpacerIds.length; i++) {
    xml = xml.replace(new RegExp(`<w:p [^>]*w14:paraId="${emptySpacerIds[i]}"[\\s\\S]*?<\\/w:p>`), '');
  }

  // Shrink the invisible post-table paragraph required by Word at end of w:body so it never triggers a blank Page 2
  xml = xml.replace(
    /<w:p [^>]*w14:paraId="68BDDE16"[\s\S]*?<\/w:p>/,
    '<w:p w14:paraId="68BDDE16" w14:textId="77777777"><w:pPr><w:spacing w:before="0" w:after="0" w:line="20" w:lineRule="exact"/><w:rPr><w:sz w:val="2"/><w:szCs w:val="2"/></w:rPr></w:pPr></w:p>'
  );

  zip.file('word/document.xml', xml);
  const buffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 6 } });
  return { buffer, filename: buildFileName(data, dInfo), designation: desigTitle, dateFormatted: dInfo.formatted };
}

async function resolveEntryData(item, Maintenance, Truck) {
  let doc = null;
  if (item && (item.id || item._id) && Maintenance) {
    try { doc = await Maintenance.findById(item.id || item._id).lean(); } catch (_) { /* ignore */ }
  }
  const src = Object.assign({}, doc || {}, item || {});
  // Always let DB doc's latest type/odometer/date win unless caller explicitly passed overrides
  if (doc) {
    if (item.type === undefined) src.type = doc.type;
    if (item.odometer === undefined) src.odometer = doc.odometer;
    if (item.date === undefined) src.date = doc.date;
    if (item.truckName === undefined) src.truckName = doc.truckName;
    if (item.deviceId === undefined) src.deviceId = doc.deviceId;
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

  return {
    deviceId: src.deviceId || (dbTruck && dbTruck.deviceId) || '',
    truckName: src.truckName || (dbTruck && dbTruck.truckName) || '',
    type: src.type || 'Vidange',
    odometer: Number(src.odometer) || (dbTruck && Number(dbTruck.odometer)) || 0,
    date: src.date || new Date(),
    immatriculation: src.immatriculation || (dbTruck && dbTruck.immatriculation) || '',
    chassisNumber: src.chassisNumber || (dbTruck && dbTruck.chassisNumber) || '',
    refNum: src.refNum || '',
    customDesignation: src.customDesignation || ''
  };
}

function registerRoutes(app, deps) {
  const { checkAccess, Maintenance, Truck } = deps;

  app.get('/api/maintenance/:id/demande-service.docx', checkAccess, async (req, res) => {
    try {
      const data = await resolveEntryData({ id: req.params.id, refNum: req.query.ref || '' }, Maintenance, Truck);
      if (!data.truckName && !data.deviceId) return res.status(404).json({ error: 'Intervention introuvable' });
      const { buffer, filename } = await generateDocxBuffer(data);
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(buffer);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.post('/api/maintenance/demande-service.docx', checkAccess, async (req, res) => {
    try {
      const data = await resolveEntryData(req.body || {}, Maintenance, Truck);
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
        const data = await resolveEntryData(it, Maintenance, Truck);
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

module.exports = { generateDocxBuffer, buildDesignationTitle, formatTractorLabel, registerRoutes };
