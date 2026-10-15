/* ============================================================================
   FLEET TRACKER PRO (DOUROUB EL DJAZAIR)
   NATIVE FORMATTED EXCEL EXPORT ENGINE (excel-export-engine.js)
   Version: 1.1.0 (Iteration 2 Core Engine Remediation)
   Features: F1 (Core Engine), F2-F8 (Workbook Formatting)
   ============================================================================ */

(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    define([], factory);
  } else if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.ExcelExportEngine = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // Styling Constants (Palette: Brand Deep Teal & Clean Slate)
  const TEAL_HEADER_COLOR = '#0D7F91';
  const ALT_ROW_COLOR = '#F8FAFC';

  const STYLES = {
    brandTeal: 'FF0D7F91',
    brandTealDark: 'FF085865',
    white: 'FFFFFFFF',
    slateHeader: 'FF0F172A',
    slateMuted: 'FF64748B',
    slateBorder: 'FFE2E8F0',
    zebraLight: 'FFF8FAFC',
    zebraWhite: 'FFFFFFFF',
    fontFamily: 'Calibri'
  };

  /**
   * Safe Dynamic Loader for ExcelJS
   * Resolves window.ExcelJS or node require('exceljs'), with CDN fallback
   */
  async function resolveExcelJS() {
    if (typeof window !== 'undefined' && window.ExcelJS) {
      return window.ExcelJS;
    }
    if (typeof global !== 'undefined' && global.ExcelJS) {
      return global.ExcelJS;
    }
    if (typeof require === 'function') {
      try {
        const lib = require('exceljs');
        if (lib) return lib;
      } catch (e) { /* continue to browser dynamic load */ }
    }

    if (typeof document !== 'undefined') {
      return new Promise((resolve, reject) => {
        const primaryCdn = 'https://cdnjs.cloudflare.com/ajax/libs/exceljs/4.4.0/exceljs.min.js';
        const fallbackCdn = 'https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js';

        const s = document.createElement('script');
        s.src = primaryCdn;
        s.onload = () => {
          if (window.ExcelJS) resolve(window.ExcelJS);
          else reject(new Error('ExcelJS not found on window after script load'));
        };
        s.onerror = () => {
          const s2 = document.createElement('script');
          s2.src = fallbackCdn;
          s2.onload = () => {
            if (window.ExcelJS) resolve(window.ExcelJS);
            else reject(new Error('ExcelJS fallback failed'));
          };
          s2.onerror = () => reject(new Error('Failed to load ExcelJS from CDNs'));
          document.head.appendChild(s2);
        };
        document.head.appendChild(s);
      });
    }

    throw new Error('ExcelJS library is unavailable in current runtime');
  }

  /**
   * Format value safely according to column type
   */
  function prepareCellValue(raw, type, transform, row) {
    let val = (transform && typeof transform === 'function') ? transform(raw, row) : raw;
    if (val === null || val === undefined || val === '') return null;

    switch (type) {
      case 'number': {
        if (typeof val === 'number') return Number.isFinite(val) ? val : null;
        const num = parseFloat(String(val).replace(/,/g, '.').replace(/[^\d.-]/g, ''));
        return Number.isFinite(num) ? num : null;
      }
      case 'integer': {
        if (typeof val === 'number') return Number.isFinite(val) ? Math.round(val) : null;
        const intVal = parseInt(String(val).replace(/[^\d-]/g, ''), 10);
        return Number.isFinite(intVal) ? intVal : null;
      }
      case 'currency': {
        if (typeof val === 'number') return Number.isFinite(val) ? val : 0;
        const cur = parseFloat(String(val).replace(/,/g, '.').replace(/[^\d.-]/g, ''));
        return Number.isFinite(cur) ? cur : 0;
      }
      case 'date':
      case 'datetime': {
        if (val instanceof Date) return isNaN(val.getTime()) ? null : val;
        const d = new Date(val);
        return isNaN(d.getTime()) ? String(val) : d;
      }
      case 'percentage': {
        let p = (typeof val === 'number') ? val : parseFloat(String(val).replace(/,/g, '.').replace(/[^\d.-]/g, ''));
        if (Number.isFinite(p)) {
          return Math.abs(p) > 1 ? p / 100 : p;
        }
        return null;
      }
      case 'string':
        return String(val);
      default:
        if (typeof val === 'number') {
          return Number.isFinite(val) ? val : null;
        }
        return String(val);
    }
  }

  /**
   * Determine numFmt pattern based on column configuration
   */
  function resolveNumFmt(col, currencySymbol) {
    if (col.format || col.numFmt) return col.format || col.numFmt;
    switch (col.type) {
      case 'currency':
        return `#,##0.00 "${currencySymbol || 'DZD'}"`;
      case 'number':
        return '#,##0.00';
      case 'integer':
        return '#,##0';
      case 'percentage':
        return '0.0%';
      case 'date':
        return 'dd/mm/yyyy';
      case 'datetime':
        return 'dd/mm/yyyy hh:mm';
      default:
        return undefined;
    }
  }

  /**
   * Apply borders to cell
   */
  function applyBorders(cell, colorArg = STYLES.slateBorder) {
    cell.border = {
      top: { style: 'thin', color: { argb: colorArg } },
      left: { style: 'thin', color: { argb: colorArg } },
      bottom: { style: 'thin', color: { argb: colorArg } },
      right: { style: 'thin', color: { argb: colorArg } }
    };
  }

  /**
   * Build a single styled worksheet
   */
  function buildWorksheet(workbook, { sheetName, title, columns, data, metadata }) {
    let cleanName = String(sheetName || 'Rapport')
      .replace(/[*?:/\\\[\]]/g, '')
      .replace(/^'+|'+$/g, '')
      .trim()
      .slice(0, 31)
      .replace(/^'+|'+$/g, '')
      .trim();

    if (!cleanName || cleanName.toLowerCase() === 'history') {
      cleanName = cleanName ? 'Historique' : 'Rapport';
    }

    let wsName = cleanName;
    let counter = 1;
    const sheetExists = (name) => {
      if (typeof workbook.getWorksheet === 'function' && workbook.getWorksheet(name)) {
        return true;
      }
      const list = workbook.worksheets || workbook._worksheets;
      if (Array.isArray(list)) {
        return list.some(w => w && w.name && w.name.toLowerCase() === name.toLowerCase());
      }
      return false;
    };

    while (sheetExists(wsName)) {
      const suffix = `_${counter++}`;
      wsName = cleanName.slice(0, 31 - suffix.length) + suffix;
    }

    const ws = workbook.addWorksheet(wsName);

    const meta = metadata || {};
    const company = meta.companyName || 'SPA DOUROUB EL DJAZAIR';
    const currency = meta.currencySymbol || 'DZD';
    const isRtl = Boolean(meta.rtl);

    if (isRtl) {
      ws.views = [{ rightToLeft: true }];
    }

    let currentRowIdx = 1;

    // Optional Title Banner Block
    const hasBanner = Boolean(title || meta.title);
    if (hasBanner) {
      const bannerTitle = title || meta.title;
      const titleRow = ws.getRow(currentRowIdx);
      titleRow.height = 28;
      const titleCell = titleRow.getCell(1);
      titleCell.value = `${company} — ${bannerTitle}`;
      titleCell.font = { name: STYLES.fontFamily, size: 14, bold: true, color: { argb: STYLES.brandTeal } };
      titleCell.alignment = { vertical: 'middle', horizontal: 'left' };
      currentRowIdx++;

      // Subtitle / Filters recap
      const subRow = ws.getRow(currentRowIdx);
      subRow.height = 18;
      const subCell = subRow.getCell(1);
      const exportDateStr = (meta.exportedAt ? new Date(meta.exportedAt) : new Date()).toLocaleString('fr-FR');
      let subText = `Généré le: ${exportDateStr}`;
      if (meta.filtersApplied) {
        const filterStr = typeof meta.filtersApplied === 'object'
          ? Object.entries(meta.filtersApplied).map(([k, v]) => `${k}: ${v}`).join(' | ')
          : String(meta.filtersApplied);
        subText += ` | Filtres: ${filterStr}`;
      }
      subCell.value = subText;
      subCell.font = { name: STYLES.fontFamily, size: 9, italic: true, color: { argb: STYLES.slateMuted } };
      subCell.alignment = { vertical: 'middle', horizontal: 'left' };
      currentRowIdx++;

      // Blank spacing row
      ws.getRow(currentRowIdx).height = 8;
      currentRowIdx++;
    }

    const headerRowIdx = currentRowIdx;

    // Header Row Construction
    const headerRow = ws.getRow(headerRowIdx);
    headerRow.height = 26;

    columns.forEach((col, idx) => {
      const cell = headerRow.getCell(idx + 1);
      cell.value = col.header || col.key;
      cell.font = { name: STYLES.fontFamily, size: 11, bold: true, color: { argb: STYLES.white } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: STYLES.brandTeal } };
      cell.alignment = { vertical: 'middle', horizontal: col.alignment?.horizontal || 'center', wrapText: true };
      applyBorders(cell, STYLES.brandTealDark);
    });

    currentRowIdx++;

    // Data Rows Construction
    const rows = Array.isArray(data) ? data : [];
    const colMaxLengths = columns.map(c => (c.header || c.key || '').length);

    rows.forEach((item, rIdx) => {
      const dataRow = ws.getRow(currentRowIdx);
      dataRow.height = 20;
      const isZebraOdd = (rIdx % 2 === 1);
      const bgArgb = isZebraOdd ? STYLES.zebraLight : STYLES.zebraWhite;

      columns.forEach((col, cIdx) => {
        const cell = dataRow.getCell(cIdx + 1);
        const rawVal = item[col.key];
        const colType = col.type || ((col.format || col.numFmt) ? 'number' : undefined);
        const formattedVal = prepareCellValue(rawVal, colType, col.transform, item);

        cell.value = formattedVal;
        cell.font = { name: STYLES.fontFamily, size: 10, color: { argb: STYLES.slateHeader } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgArgb } };
        applyBorders(cell);

        const numFmt = resolveNumFmt(col, currency);
        if (numFmt) cell.numFmt = numFmt;

        // Alignment by type
        let hAlign = 'left';
        if (col.alignment?.horizontal) {
          hAlign = col.alignment.horizontal;
        } else if (colType === 'currency' || colType === 'number' || colType === 'integer' || colType === 'percentage') {
          hAlign = 'right';
        } else if (colType === 'date' || colType === 'datetime') {
          hAlign = 'center';
        }
        cell.alignment = { vertical: 'middle', horizontal: hAlign, wrapText: Boolean(col.alignment?.wrapText) };

        // Column width tracking
        let displayLen = 0;
        if (formattedVal instanceof Date) {
          displayLen = colType === 'datetime' ? 16 : 10;
        } else if (colType === 'currency') {
          displayLen = String(formattedVal ?? '').length + 4; // account for " DZD"
        } else {
          displayLen = String(formattedVal ?? '').length;
        }
        colMaxLengths[cIdx] = Math.max(colMaxLengths[cIdx], displayLen);
      });

      currentRowIdx++;
    });

    // Auto-calculate column widths
    const autoWidth = meta.autoWidth !== false;
    columns.forEach((col, cIdx) => {
      const wsCol = ws.getColumn(cIdx + 1);
      if (col.width) {
        wsCol.width = col.width;
      } else if (autoWidth) {
        const computed = Math.min(60, Math.max(10, colMaxLengths[cIdx] + 4));
        wsCol.width = computed;
      }
    });

    // Auto-filter
    if (columns.length > 0) {
      ws.autoFilter = {
        from: { row: headerRowIdx, column: 1 },
        to: { row: headerRowIdx, column: columns.length }
      };
    }

    // Freeze panes below header & merge with RTL
    const freeze = meta.freezeHeader !== false;
    if (freeze) {
      const view = {
        ...(isRtl ? { rightToLeft: true } : {}),
        state: 'frozen',
        xSplit: 0,
        ySplit: headerRowIdx,
        activeCell: `A${headerRowIdx + 1}`
      };
      ws.views = [view];
    } else if (isRtl) {
      ws.views = [{ rightToLeft: true }];
    }

    return ws;
  }

  /**
   * Browser File Download Trigger
   */
  function triggerDownload(buffer, filename, mimeType) {
    if (typeof window === 'undefined' || !window.document) {
      throw new Error('triggerDownload can only run in a browser environment');
    }
    const blob = new Blob([buffer], { type: mimeType });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    }, 400);
  }

  /**
   * Graceful CSV Fallback (if ExcelJS is completely blocked offline)
   */
  function exportCsvFallback(filename, columns, data) {
    let csv = '\uFEFF' + columns.map(c => `"${String(c.header || c.key).replace(/"/g, '""')}"`).join(',') + '\n';
    (data || []).forEach(row => {
      csv += columns.map(c => {
        let val = (c.transform && typeof c.transform === 'function') ? c.transform(row[c.key], row) : row[c.key];
        if (val === null || val === undefined) val = '';
        if (val instanceof Date) {
          val = (c.type === 'datetime') ? val.toLocaleString('fr-FR') : val.toLocaleDateString('fr-FR');
        }
        return `"${String(val).replace(/"/g, '""')}"`;
      }).join(',') + '\n';
    });
    const cleanName = filename.replace(/\.xlsx$/i, '') + '.csv';
    triggerDownload(csv, cleanName, 'text/csv;charset=utf-8;');
  }

  /**
   * Public API
   */
  const engine = {
    TEAL_HEADER_COLOR,
    ALT_ROW_COLOR,
    STYLES,

    /**
     * Export single table to .xlsx workbook
     */
    async exportTableToXlsx({ filename, sheetName, title, columns, data, metadata }) {
      try {
        const ExcelJS = await resolveExcelJS();
        const workbook = new ExcelJS.Workbook();
        workbook.creator = metadata?.creator || 'Fleet Tracker Pro';
        workbook.created = new Date();

        buildWorksheet(workbook, { sheetName, title, columns, data, metadata });

        const buffer = await workbook.xlsx.writeBuffer();
        const finalName = filename.toLowerCase().endsWith('.xlsx') ? filename : `${filename}.xlsx`;
        triggerDownload(buffer, finalName, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      } catch (err) {
        console.warn('[ExcelExportEngine] Falling back to UTF-8 CSV due to:', err.message);
        exportCsvFallback(filename, columns, data);
      }
    },

    /**
     * Export multi-sheet workbook to .xlsx
     */
    async exportMultiSheetXlsx({ filename, sheets, metadata }) {
      try {
        const ExcelJS = await resolveExcelJS();
        const workbook = new ExcelJS.Workbook();
        workbook.creator = metadata?.creator || 'Fleet Tracker Pro';
        workbook.created = new Date();

        (sheets || []).forEach((sh, idx) => {
          buildWorksheet(workbook, {
            sheetName: sh.sheetName || sh.name || ('Feuille ' + (idx + 1)),
            title: sh.title,
            columns: sh.columns,
            data: sh.data,
            metadata: sh.metadata || metadata
          });
        });

        const buffer = await workbook.xlsx.writeBuffer();
        const finalName = filename.toLowerCase().endsWith('.xlsx') ? filename : `${filename}.xlsx`;
        triggerDownload(buffer, finalName, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      } catch (err) {
        console.warn('[ExcelExportEngine] Multi-sheet fallback to first sheet CSV:', err.message);
        if (sheets && sheets[0]) {
          exportCsvFallback(filename, sheets[0].columns, sheets[0].data);
        }
      }
    },

    /**
     * Headless Buffer Generation (Node.js test harness & headless verification)
     */
    async generateXlsxBuffer({ sheetName, title, columns, data, metadata }) {
      const ExcelJS = await resolveExcelJS();
      const workbook = new ExcelJS.Workbook();
      workbook.creator = metadata?.creator || 'Fleet Tracker Pro';
      workbook.created = new Date();

      buildWorksheet(workbook, { sheetName, title, columns, data, metadata });
      return await workbook.xlsx.writeBuffer();
    },

    /**
     * Headless Multi-Sheet Buffer Generation
     */
    async generateMultiSheetXlsxBuffer({ sheets, metadata }) {
      const ExcelJS = await resolveExcelJS();
      const workbook = new ExcelJS.Workbook();
      workbook.creator = metadata?.creator || 'Fleet Tracker Pro';
      workbook.created = new Date();

      (sheets || []).forEach((sh, idx) => {
        buildWorksheet(workbook, {
          sheetName: sh.sheetName || sh.name || ('Feuille ' + (idx + 1)),
          title: sh.title,
          columns: sh.columns,
          data: sh.data,
          metadata: sh.metadata || metadata
        });
      });

      return await workbook.xlsx.writeBuffer();
    }
  };

  function validateExportContract(options) {
    const VALID_TYPES = ['string', 'number', 'integer', 'date', 'datetime', 'currency', 'percentage'];
    const errors = [];
    if (!options || typeof options !== 'object') {
      return { valid: false, errors: ['Options must be a non-null object'] };
    }
    if (!options.filename || typeof options.filename !== 'string') {
      errors.push('filename is required and must be a string');
    } else if (!options.filename.toLowerCase().endsWith('.xlsx')) {
      errors.push(`filename must end with .xlsx, got: "${options.filename}"`);
    }
    if (options.sheetName !== undefined) {
      if (typeof options.sheetName !== 'string' || options.sheetName.length === 0) {
        errors.push('sheetName must be a non-empty string');
      } else if (options.sheetName.length > 31) {
        errors.push(`sheetName exceeds 31 characters limit: "${options.sheetName}"`);
      } else if (/[:\\/?*\[\]]/.test(options.sheetName)) {
        errors.push(`sheetName contains prohibited Excel characters: "${options.sheetName}"`);
      }
    }
    if (!Array.isArray(options.columns) || options.columns.length === 0) {
      errors.push('columns must be a non-empty array');
    } else {
      options.columns.forEach((col, idx) => {
        if (!col || typeof col !== 'object') {
          errors.push(`column[${idx}] must be an object`);
          return;
        }
        if (!col.header || typeof col.header !== 'string') {
          errors.push(`column[${idx}] missing required string header`);
        }
        if (!col.key || typeof col.key !== 'string') {
          errors.push(`column[${idx}] missing required string key`);
        }
        if (col.type && !VALID_TYPES.includes(col.type)) {
          errors.push(`column[${idx}] has invalid type: "${col.type}". Expected: ${VALID_TYPES.join(', ')}`);
        }
      });
    }
    if (!Array.isArray(options.data)) {
      errors.push('data must be an array');
    }
    return { valid: errors.length === 0, errors };
  }

  function calculateExpectedColumnWidth(column, dataRows = []) {
    let maxLen = (column.header || '').length;
    dataRows.forEach((row) => {
      const val = row[column.key];
      if (val !== undefined && val !== null) {
        let strVal = String(val);
        if (column.type === 'currency') {
          strVal = `${strVal} DZD`;
        }
        if (strVal.length > maxLen) {
          maxLen = strVal.length;
        }
      }
    });
    return Math.min(60, Math.max(10, maxLen + 4));
  }

  // Aliases for seamless interface compatibility
  engine.exportTable = engine.exportTableToXlsx;
  engine.exportWorkbook = engine.exportMultiSheetXlsx;
  engine.exportWorkbookToXlsx = engine.exportMultiSheetXlsx;
  engine.generateWorkbookXlsxBuffer = engine.generateMultiSheetXlsxBuffer;
  engine.buildWorkbook = buildWorksheet;
  engine.buildBuffer = engine.generateXlsxBuffer;
  engine.validateExportContract = validateExportContract;
  engine.computeColumnWidths = calculateExpectedColumnWidth;
  engine.calculateExpectedColumnWidth = calculateExpectedColumnWidth;
  engine.csvFallback = exportCsvFallback;

  return engine;
}));
