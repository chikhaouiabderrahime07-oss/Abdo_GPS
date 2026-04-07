(function () {
  class TransportReportSection {
    constructor() {
      this.rows = [];
      this.filteredRows = [];
      this.trucks = [];
      this.preview = null;
      this.initialized = false;
      this.stylesInjected = false;
      this.root = null;
      this.currentPage = 1;
      this.perPage = 20;
      this.locationLabelCache = new Map();
      this.locationPromiseCache = new Map();
      this.locationHydrationTimer = null;
      this.importRows = [];
      this.importSummary = null;
      this.importFile = null;
      this.importInFlight = false;
      this.importCancelled = false;
      this.xlsxLoaderPromise = null;
      this.sortKey = 'requestedStartAt';
      this.sortDir = 'desc';
      this.maxImportBatch = 10000;
      this.maxAnalyzeRows = 100000;
      this.editingRow = null;
      this.selectedRowIds = new Set();

      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => this.mount());
      } else {
        this.mount();
      }
    }

    api(path) {
      const base = (typeof FLEET_CONFIG !== 'undefined' && FLEET_CONFIG.API && FLEET_CONFIG.API.baseUrl)
        ? FLEET_CONFIG.API.baseUrl
        : '';
      return `${base}${path}`;
    }

    injectStyles() {
      if (this.stylesInjected) return;
      const style = document.createElement('style');
      style.textContent = `
        #transportReportApp { display:block; }
        .transport-shell { display:grid; gap:12px; }
        .transport-card {
          background:#ffffff;
          border:1px solid #e2e8f0;
          border-radius:14px;
          box-shadow: 0 4px 14px rgba(15, 23, 42, 0.05);
          overflow:hidden;
        }
        .transport-card.dark {
          background:#ffffff;
          color:inherit;
          border-color:#e2e8f0;
        }
        .transport-card-header {
          padding:12px 14px;
          display:flex;
          justify-content:space-between;
          align-items:center;
          gap:10px;
          flex-wrap:wrap;
          border-bottom:1px solid #eef2f7;
        }
        .transport-card-body { padding:12px 14px; }
        .transport-title {
          margin:0;
          font-size:14px;
          font-weight:800;
          color:#0f172a;
          display:flex;
          align-items:center;
          gap:8px;
        }
        .transport-subtitle { display:none; }
        .transport-badge,
        .transport-filter-chip {
          display:inline-flex;
          align-items:center;
          gap:7px;
          padding:6px 10px;
          border-radius:999px;
          font-size:11px;
          font-weight:800;
          white-space:nowrap;
          color:#075985;
          background:#eff6ff;
          border:1px solid #bfdbfe;
        }

        .transport-intake-grid {
          display:grid;
          grid-template-columns: minmax(360px, 1.2fr) minmax(320px, 1fr);
          gap:12px;
          align-items:start;
        }
        .transport-intake-card {
          border:1px solid #e2e8f0;
          border-radius:12px;
          background:#f8fafc;
          padding:12px;
        }
        .transport-intake-card.import-primary {
          border-color:#bfdbfe;
          background:linear-gradient(180deg, #f8fbff 0%, #f8fafc 100%);
        }
        .transport-section-label {
          font-size:10px;
          font-weight:800;
          text-transform:uppercase;
          letter-spacing:0.08em;
          color:#64748b;
          margin-bottom:4px;
        }
        .transport-section-title {
          font-size:13px;
          font-weight:800;
          color:#0f172a;
          display:flex;
          align-items:center;
          gap:8px;
        }
        .transport-section-subtitle {
          font-size:11px;
          color:#64748b;
          margin-top:2px;
        }
        .transport-dropzone {
          margin-top:10px;
          border:1.5px dashed #93c5fd;
          border-radius:12px;
          background:#ffffff;
          padding:12px;
          transition:all 0.2s ease;
        }
        .transport-dropzone.dragover {
          border-color:#0084a7;
          background:#effbfd;
          box-shadow:0 0 0 3px rgba(0, 132, 167, 0.08);
        }
        .transport-file-name {
          margin-top:8px;
          font-size:12px;
          font-weight:700;
          color:#0f172a;
          word-break:break-word;
        }
        .transport-file-hint {
          margin-top:4px;
          font-size:11px;
          color:#64748b;
        }
        .transport-import-actions {
          display:flex;
          gap:8px;
          flex-wrap:wrap;
          align-items:center;
          margin-top:10px;
        }
        .transport-import-filters {
          display:grid;
          grid-template-columns: 1fr 1fr 110px;
          gap:10px;
          align-items:end;
          margin-top:10px;
        }
        .transport-import-summary {
          margin-top:10px;
          border:1px solid #dbeafe;
          border-radius:10px;
          background:#ffffff;
          padding:10px 12px;
        }
        .transport-import-summary.empty {
          color:#64748b;
          border-style:dashed;
          background:#f8fafc;
        }
        .transport-import-meta {
          display:grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap:8px;
          margin-top:10px;
        }
        .transport-import-stat {
          border:1px solid #e2e8f0;
          border-radius:10px;
          background:#f8fafc;
          padding:8px 10px;
        }
        .transport-import-stat .label {
          font-size:10px;
          font-weight:800;
          text-transform:uppercase;
          letter-spacing:0.05em;
          color:#64748b;
          margin-bottom:4px;
        }
        .transport-import-stat .value {
          font-size:15px;
          font-weight:800;
          color:#0f172a;
        }
        .transport-import-list {
          margin-top:10px;
          display:flex;
          flex-wrap:wrap;
          gap:6px;
        }
        .transport-import-chip {
          display:inline-flex;
          align-items:center;
          gap:6px;
          padding:5px 9px;
          border-radius:999px;
          font-size:11px;
          font-weight:700;
          border:1px solid #cbd5e1;
          background:#ffffff;
          color:#0f172a;
        }
        .transport-import-chip.warn {
          background:#fff7ed;
          border-color:#fed7aa;
          color:#9a3412;
        }
        .transport-import-chip.good {
          background:#ecfdf5;
          border-color:#bbf7d0;
          color:#166534;
        }
        .transport-import-chip.info {
          background:#eff6ff;
          border-color:#bfdbfe;
          color:#075985;
        }
        .transport-progress {
          margin-top:10px;
          display:none;
        }
        .transport-progress.active { display:block; }
        .transport-progress-bar {
          height:8px;
          border-radius:999px;
          background:#e2e8f0;
          overflow:hidden;
        }
        .transport-progress-fill {
          height:100%;
          width:0%;
          background:linear-gradient(90deg, #0084a7, #0f766e);
          transition:width 0.2s ease;
        }
        .transport-progress-text {
          margin-top:6px;
          font-size:11px;
          font-weight:700;
          color:#334155;
          display:flex;
          justify-content:space-between;
          gap:10px;
          flex-wrap:wrap;
        }
        .transport-import-log {
          margin-top:10px;
          max-height:140px;
          overflow:auto;
          background:#0f172a;
          color:#e2e8f0;
          border-radius:10px;
          padding:10px 12px;
          font-size:11px;
          font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
          display:none;
          white-space:pre-wrap;
        }
        .transport-import-log.active { display:block; }
        .transport-hidden-input { display:none; }
        .transport-mini-note {
          margin-top:8px;
          font-size:11px;
          color:#64748b;
        }
        .transport-manual-grid {
          display:grid;
          grid-template-columns: 160px 1fr 1fr;
          gap:10px;
          align-items:end;
        }
        .transport-form-grid {
          display:grid;
          grid-template-columns: 160px 190px 190px minmax(220px, 1fr);
          gap:10px;
          align-items:end;
        }
        .transport-filter-grid {
          display:grid;
          grid-template-columns: repeat(6, minmax(120px, 1fr));
          gap:10px;
          align-items:end;
          margin-top:10px;
        }
        .transport-action-row,
        .transport-toolbar {
          display:flex;
          gap:8px;
          flex-wrap:wrap;
          align-items:center;
          margin-top:10px;
        }
        .transport-action-row .btn-primary,
        .transport-action-row .btn-secondary,
        .transport-toolbar .btn-primary,
        .transport-toolbar .btn-secondary {
          min-height:38px;
          border-radius:8px;
          font-size:12px;
          padding:8px 12px;
        }
        .transport-btn-accent {
          background:#0084a7 !important;
          color:#ffffff !important;
          border:none !important;
          box-shadow:none;
        }
        .transport-btn-info {
          background:#0f172a !important;
          color:#ffffff !important;
          border:none !important;
          box-shadow:none;
        }
        .transport-btn-warning {
          background:#fff7ed !important;
          color:#c2410c !important;
          border:1px solid #fdba74 !important;
        }
        .transport-preview-empty,
        .transport-preview-ready {
          margin-top:10px;
          border:1px dashed #cbd5e1;
          border-radius:10px;
          padding:10px 12px;
          background:#f8fafc;
          color:#64748b;
          font-size:12px;
        }
        .transport-preview-ready {
          border-style:solid;
          color:#1e293b;
        }
        .transport-preview-head {
          display:flex;
          justify-content:space-between;
          align-items:flex-start;
          gap:10px;
          flex-wrap:wrap;
        }
        .transport-preview-title {
          font-size:13px;
          font-weight:800;
          color:#0f172a;
          margin-bottom:4px;
        }
        .transport-preview-sub {
          font-size:12px;
          color:#64748b;
        }
        .transport-kpis {
          display:flex;
          flex-wrap:wrap;
          gap:8px;
          margin-top:10px;
        }
        .transport-kpi {
          min-width:118px;
          padding:8px 10px;
          border:1px solid #dbeafe;
          border-radius:10px;
          background:#ffffff;
        }
        .transport-kpi-label,
        .transport-summary-label {
          font-size:10px;
          font-weight:800;
          text-transform:uppercase;
          letter-spacing:0.05em;
          color:#64748b;
          margin-bottom:4px;
        }
        .transport-kpi-value,
        .transport-summary-value {
          font-size:15px;
          font-weight:800;
          color:#0f172a;
          line-height:1.15;
        }
        .transport-summary-grid {
          display:flex;
          flex-wrap:wrap;
          gap:8px;
          margin-bottom:8px;
        }
        .transport-summary-card {
          display:flex;
          align-items:baseline;
          gap:8px;
          padding:8px 10px;
          border-radius:10px;
          border:1px solid #e2e8f0;
          background:#f8fafc;
        }
        .transport-summary-card.accent {
          background:#eefbfd;
          border-color:#bae6fd;
        }
        .transport-inline-list {
          display:flex;
          flex-wrap:wrap;
          gap:6px;
          margin-top:8px;
        }
        .transport-pill {
          display:inline-flex;
          align-items:center;
          gap:6px;
          padding:5px 9px;
          border-radius:999px;
          background:#ffffff;
          border:1px solid #cbd5e1;
          color:#0f172a;
          font-size:11px;
          font-weight:700;
        }
        .transport-pill.soft {
          background:#eff6ff;
          color:#075985;
          border-color:#bfdbfe;
        }
        .transport-pill.good {
          background:#ecfdf5;
          color:#166534;
          border-color:#bbf7d0;
        }
        .transport-pill.warn {
          background:#fff7ed;
          color:#9a3412;
          border-color:#fed7aa;
        }
        .transport-warnings {
          display:flex;
          flex-wrap:wrap;
          gap:6px;
          margin-top:8px;
        }
        .transport-warning {
          display:inline-flex;
          align-items:center;
          gap:7px;
          border-radius:999px;
          border:1px solid #fed7aa;
          background:#fff7ed;
          color:#9a3412;
          padding:6px 10px;
          font-size:11px;
          font-weight:700;
        }
        .transport-results-meta {
          margin-top:10px;
          display:flex;
          justify-content:space-between;
          gap:10px;
          align-items:center;
          flex-wrap:wrap;
          color:#64748b;
          font-size:11px;
          font-weight:700;
        }
        .transport-table-wrap {
          margin-top:10px;
          overflow:auto;
          border:1px solid #e2e8f0;
          border-radius:12px;
          background:#ffffff;
          max-height:calc(100vh - 330px);
        }
        .transport-table {
          width:100%;
          border-collapse:separate;
          border-spacing:0;
          min-width:1180px;
        }
        .transport-table th {
          position:sticky;
          top:0;
          z-index:1;
          background:#f8fafc;
          color:#0f172a;
          text-align:left;
          font-size:10px;
          font-weight:800;
          text-transform:uppercase;
          letter-spacing:0.06em;
          padding:10px 8px;
          border-bottom:1px solid #e2e8f0;
          white-space:nowrap;
        }
        .transport-table td {
          padding:9px 8px;
          border-bottom:1px solid #eef2f7;
          vertical-align:top;
          color:#1e293b;
          font-size:12px;
          background:#ffffff;
        }
        .transport-table tbody tr:nth-child(even) td { background:#fcfdff; }
        .transport-table tbody tr:hover td { background:#f8fbfc; }
        .transport-row-selected td { background:#ecfeff !important; }
        .transport-select-col {
          width:44px;
          text-align:center;
        }
        .transport-checkbox {
          width:16px;
          height:16px;
          accent-color:#0084a7;
          cursor:pointer;
        }
        .transport-bulk-bar {
          display:flex;
          justify-content:space-between;
          align-items:center;
          gap:10px;
          flex-wrap:wrap;
          padding:10px 12px;
          border:1px solid #e2e8f0;
          border-radius:12px;
          background:#f8fafc;
          margin-bottom:10px;
        }
        .transport-bulk-count {
          font-size:12px;
          font-weight:800;
          color:#0f172a;
        }
        .transport-bulk-actions {
          display:flex;
          gap:8px;
          flex-wrap:wrap;
          align-items:center;
        }
        .transport-btn-danger {
          background:#fff1f2;
          color:#be123c;
          border:1px solid #fecdd3;
        }
        .transport-btn-danger:hover {
          background:#ffe4e6;
          color:#9f1239;
          border-color:#fda4af;
        }
        .transport-row-issue td { background:#fff7ed !important; }
        .transport-row-title {
          font-weight:800;
          color:#0f172a;
          font-size:12px;
          line-height:1.35;
        }
        .transport-row-sub {
          font-size:11px;
          color:#64748b;
          line-height:1.4;
          margin-top:2px;
        }
        .transport-row-sub.route {
          display:flex;
          gap:6px;
          align-items:flex-start;
        }
        .transport-source {
          display:inline-flex;
          align-items:center;
          gap:6px;
          padding:5px 8px;
          border-radius:999px;
          font-size:10px;
          font-weight:800;
          white-space:nowrap;
          border:1px solid #dbeafe;
          background:#eff6ff;
          color:#075985;
        }
        .transport-source.odometer {
          border-color:#bbf7d0;
          background:#ecfdf5;
          color:#166534;
        }
        .transport-source.gps-distance {
          border-color:#fde68a;
          background:#fffbeb;
          color:#92400e;
        }
        .transport-actions { display:flex; gap:6px; flex-wrap:wrap; }
        .transport-small-btn {
          display:inline-flex;
          align-items:center;
          gap:6px;
          padding:7px 10px;
          border-radius:8px;
          background:#ffffff;
          border:1px solid #e2e8f0;
          color:#0f172a;
          font-size:11px;
          font-weight:800;
          cursor:pointer;
        }
        .transport-small-btn:hover { background:#f8fafc; }
        .transport-small-btn.danger {
          color:#b91c1c;
          border-color:#fecaca;
          background:#fff5f5;
        }
        .transport-empty-row {
          text-align:center;
          color:#64748b;
          padding:18px 12px !important;
          font-weight:700;
          background:#ffffff !important;
        }
        .transport-pagination {
          margin-top:10px;
          display:flex;
          justify-content:space-between;
          gap:10px;
          align-items:center;
          flex-wrap:wrap;
        }
        .transport-pagination-group {
          display:flex;
          gap:6px;
          align-items:center;
          flex-wrap:wrap;
        }
        .transport-page-btn {
          min-width:34px;
          height:34px;
          padding:0 10px;
          border:none;
          border-radius:8px;
          cursor:pointer;
          font-weight:800;
          background:#f1f5f9;
          color:#334155;
        }
        .transport-page-btn.active {
          background:#0084a7;
          color:#ffffff;
        }
        .transport-page-btn:disabled {
          opacity:0.45;
          cursor:not-allowed;
        }
        .transport-table-note {
          font-size:11px;
          font-weight:700;
          color:#64748b;
        }
        .transport-toast {
          position:fixed;
          right:20px;
          bottom:20px;
          z-index:999999;
          border-radius:12px;
          padding:12px 14px;
          font-size:12px;
          font-weight:800;
          color:#ffffff;
          background:#0f172a;
          box-shadow:0 16px 34px rgba(15, 23, 42, 0.28);
        }
        @media (max-width: 1400px) {
          .transport-intake-grid { grid-template-columns: 1fr; }
          .transport-form-grid { grid-template-columns: repeat(2, minmax(180px, 1fr)); }
          .transport-manual-grid { grid-template-columns: repeat(2, minmax(180px, 1fr)); }
          .transport-filter-grid { grid-template-columns: repeat(3, minmax(120px, 1fr)); }
          .transport-import-filters { grid-template-columns: repeat(3, minmax(120px, 1fr)); }
        }
        @media (max-width: 900px) {
          .transport-card-header,
          .transport-card-body { padding:10px 12px; }
          .transport-form-grid,
          .transport-manual-grid,
          .transport-filter-grid,
          .transport-import-filters,
          .transport-import-meta { grid-template-columns: 1fr; }
          .transport-summary-grid { display:grid; grid-template-columns: repeat(2, minmax(0, 1fr)); }
          .transport-action-row,
          .transport-toolbar { flex-direction:column; align-items:stretch; }
          .transport-table-wrap { max-height:none; }
          .transport-pagination { align-items:stretch; }
          .transport-pagination-group { width:100%; justify-content:center; }
        }
      `;
      document.head.appendChild(style);
      this.stylesInjected = true;
    }

    mount() {
      this.injectStyles();
      this.root = document.getElementById('transportReportApp');
      if (!this.root) return;
      if (!this.initialized) {
        this.root.innerHTML = this.renderLayout();
        this.cacheElements();
        this.bindEvents();
        this.setDefaultDates();
        this.initialized = true;
      }
      this.attachTabHook();
      this.loadTrucks();
      this.loadRows();
    }

    attachTabHook() {
      const btn = document.querySelector('[data-tab="transportReport"]');
      if (btn && !btn.dataset.transportBound) {
        btn.addEventListener('click', () => this.onTabOpen());
        btn.dataset.transportBound = '1';
      }
    }

    onTabOpen() {
      if (!this.initialized) this.mount();
      this.loadTrucks();
      this.loadRows();
      if (!this.fromInput.value || !this.toInput.value) this.setDefaultDates();
    }


    renderLayout() {
      return `
        <div class="transport-shell">
          <div class="transport-card">
            <div class="transport-card-header">
              <div>
                <h3 class="transport-title"><i class="fa-solid fa-table"></i> Rapport transport</h3>
              </div>
              <div class="transport-badge"><i class="fa-solid fa-layer-group"></i> Import Excel principal • manuel conservé • 20 / page</div>
            </div>
            <div class="transport-card-body">
              <div class="transport-intake-grid">
                <div class="transport-intake-card import-primary">
                  <div class="transport-section-label">Mode principal</div>
                  <div class="transport-section-title"><i class="fa-solid fa-file-arrow-up"></i> Import mission Excel</div>
                  <div class="transport-section-subtitle">Le fichier “Suivi de Mission.xlsx” est lu automatiquement. Colonnes clés reconnues: Camions, DH de départ, DH de fin de mission.</div>

                  <div class="transport-dropzone" id="transportImportDropzone">
                    <input type="file" id="transportImportFile" class="transport-hidden-input" accept=".xlsx,.xls,.csv">
                    <div class="transport-import-actions" style="margin-top:0;">
                      <button class="btn-primary transport-btn-accent" id="transportImportPickBtn"><i class="fa-solid fa-folder-open"></i> Choisir Excel</button>
                      <button class="btn-secondary" id="transportImportAnalyzeBtn"><i class="fa-solid fa-magnifying-glass"></i> Analyser</button>
                      <button class="btn-primary transport-btn-info" id="transportImportRunBtn" disabled><i class="fa-solid fa-bolt"></i> Importer absentes</button>
                      <button class="btn-secondary" id="transportImportCancelBtn" disabled><i class="fa-solid fa-stop"></i> Arrêter</button>
                    </div>
                    <div class="transport-file-name" id="transportImportFileName">Aucun fichier sélectionné</div>
                    <div class="transport-file-hint">Vous pouvez cliquer ou glisser-déposer le fichier ici.</div>
                  </div>

                  <div class="transport-import-filters">
                    <div class="form-group">
                      <label>Du (optionnel)</label>
                      <input type="date" id="transportImportStart">
                    </div>
                    <div class="form-group">
                      <label>Au (optionnel)</label>
                      <input type="date" id="transportImportEnd">
                    </div>
                    <div class="form-group">
                      <label>Lot max</label>
                      <input type="number" id="transportImportBatch" min="1" max="10000" step="1" value="1000">
                    </div>
                  </div>

                  <div id="transportImportSummary" class="transport-import-summary empty">
                    Choisissez le fichier mission, lancez <strong>Analyser</strong>, puis <strong>Importer absentes</strong>. Le système reconnaît le camion, lit les dates, ignore les doublons et calcule le reste via GPS.
                  </div>

                  <div class="transport-progress" id="transportImportProgress">
                    <div class="transport-progress-bar"><div class="transport-progress-fill" id="transportImportProgressFill"></div></div>
                    <div class="transport-progress-text">
                      <span id="transportImportProgressText">Import en attente</span>
                      <span id="transportImportProgressCount">0 / 0</span>
                    </div>
                  </div>

                  <div class="transport-import-log" id="transportImportLog"></div>
                </div>

                <div class="transport-intake-card">
                  <div class="transport-section-label">Mode secondaire</div>
                  <div class="transport-section-title"><i class="fa-solid fa-pen"></i> Ajout manuel</div>
                  <div class="transport-section-subtitle">Toujours disponible pour corriger ou ajouter une mission isolée.</div>

                  <div class="transport-form-grid transport-manual-grid" style="margin-top:10px;">
                    <div class="form-group">
                      <label>Camion</label>
                      <select id="transportTruckSelect"><option value="">-- Choisir un camion --</option></select>
                    </div>
                    <div class="form-group">
                      <label>Date / Heure départ</label>
                      <input type="datetime-local" id="transportStartInput">
                    </div>
                    <div class="form-group">
                      <label>Date / Heure fin</label>
                      <input type="datetime-local" id="transportEndInput">
                    </div>
                    <div class="form-group" style="grid-column: 1 / -1;">
                      <label>Observation</label>
                      <input type="text" id="transportNoteInput" placeholder="Ex: Livraison Alger - Biskra">
                    </div>
                  </div>

                  <div class="transport-action-row">
                    <button class="btn-primary transport-btn-accent" id="transportCalcBtn"><i class="fa-solid fa-calculator"></i> Calculer</button>
                    <button class="btn-primary transport-btn-info" id="transportSaveBtn"><i class="fa-solid fa-floppy-disk"></i> Ajouter</button>
                    <button class="btn-secondary" id="transportReloadBtn"><i class="fa-solid fa-rotate"></i> Actualiser</button>
                    <button class="btn-secondary" id="transportExportBtn"><i class="fa-solid fa-file-excel"></i> Export Excel filtré</button>
                    <button class="btn-secondary" id="transportRebuildBtn"><i class="fa-solid fa-arrows-rotate"></i> Re-scan GPS</button>
                    <button class="btn-secondary transport-btn-warning" id="transportCleanRebuildBtn"><i class="fa-solid fa-broom"></i> Nettoyer auto + re-scan</button>
                  </div>
                  <div class="transport-mini-note">Astuce: l’import Excel remplit la feuille automatiquement. Le mode manuel reste pour les exceptions.</div>
                </div>
              </div>

              <div id="transportPreview" class="transport-preview-empty">Choisissez un camion, une période, puis cliquez sur <strong>Calculer</strong> pour préparer la ligne avant ajout.</div>
            </div>
          </div>

          <div class="transport-card">
            <div class="transport-card-header">
              <div>
                <h3 class="transport-title"><i class="fa-solid fa-table-list"></i> Feuille enregistrée</h3>
              </div>
              <div class="transport-filter-chip"><i class="fa-solid fa-file-excel"></i> Export = tout le filtré • nombres sommables</div>
            </div>
            <div class="transport-card-body">
              <div class="transport-summary-grid" id="transportSummaryGrid"></div>

              <div class="transport-filter-grid">
                <div class="form-group">
                  <label>Recherche</label>
                  <input type="text" id="transportFilterText" placeholder="Camion, lieu, observation...">
                </div>
                <div class="form-group">
                  <label>Camion</label>
                  <select id="transportFilterTruck"><option value="all">Tous les camions</option></select>
                </div>
                <div class="form-group">
                  <label>Du</label>
                  <input type="date" id="transportFilterStart">
                </div>
                <div class="form-group">
                  <label>Au</label>
                  <input type="date" id="transportFilterEnd">
                </div>
                <div class="form-group">
                  <label>Source KM</label>
                  <select id="transportFilterSource">
                    <option value="all">Toutes</option>
                    <option value="odometer">Odomètre</option>
                    <option value="gps-distance">Trace GPS</option>
                  </select>
                </div>
                <div class="form-group">
                  <label>État</label>
                  <select id="transportFilterWarning">
                    <option value="all">Toutes</option>
                    <option value="clean">Sans avertissement</option>
                    <option value="warning">Avec avertissement</option>
                    <option value="issue">À revoir / non calculées</option>
                    <option value="ok">Calculées</option>
                  </select>
                </div>
              </div>

              <div class="transport-toolbar">
                <button class="btn-secondary" id="transportApplyFiltersBtn"><i class="fa-solid fa-filter"></i> Appliquer</button>
                <button class="btn-secondary" id="transportClearFiltersBtn"><i class="fa-solid fa-rotate-left"></i> Réinitialiser</button>
                <button class="btn-secondary" id="transportRetryIssuesBtn"><i class="fa-solid fa-wand-magic-sparkles"></i> Rechecker lignes à revoir</button>
              </div>

              <div class="transport-bulk-bar">
                <div class="transport-bulk-count" id="transportSelectedCount">0 ligne(s) sélectionnée(s)</div>
                <div class="transport-bulk-actions">
                  <button class="btn-secondary" id="transportSelectAllFilteredBtn"><i class="fa-solid fa-check-double"></i> Tout sélectionner (filtre)</button>
                  <button class="btn-secondary" id="transportClearSelectionBtn" disabled><i class="fa-solid fa-eraser"></i> Effacer sélection</button>
                  <button class="btn-secondary transport-btn-danger" id="transportDeleteSelectedBtn" disabled><i class="fa-solid fa-trash-can"></i> Supprimer sélection</button>
                </div>
              </div>

              <div class="transport-results-meta">
                <div id="transportResultsMeta">Chargement de la feuille...</div>
                <div class="transport-table-note">Tri asc/desc sur les colonnes • édition possible</div>
              </div>

              <div class="transport-table-wrap">
                <table class="transport-table">
                  <thead>
                    <tr>
                      <th class="transport-select-col"><input type="checkbox" id="transportSelectPageCheckbox" class="transport-checkbox" title="Sélectionner toutes les lignes visibles de la page"></th>
                      <th data-sort="rowNumber">#</th>
                      <th data-sort="truckName">Camion / trajet</th>
                      <th data-sort="requestedStartAt">DH départ</th>
                      <th data-sort="requestedEndAt">DH fin</th>
                      <th data-sort="kmTotal">KM totale</th>
                      <th data-sort="fuelStart">Carb. départ</th>
                      <th data-sort="fuelEnd">Carb. fin</th>
                      <th data-sort="refillCount">Pleins</th>
                      <th data-sort="fuelConsumedTotal">Conso gasoil</th>
                      <th data-sort="distanceSource">Source KM</th>
                      <th data-sort="status">État</th>
                      <th data-sort="note">Observation</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody id="transportRowsBody">
                    <tr><td colspan="14" class="transport-empty-row"><i class="fa-solid fa-circle-notch fa-spin"></i> Chargement...</td></tr>
                  </tbody>
                </table>
              </div>

              <div class="transport-pagination">
                <div class="transport-pagination-group">
                  <button class="transport-page-btn" id="transportPrevPageBtn"><i class="fa-solid fa-chevron-left"></i></button>
                  <div id="transportPageNumbers" class="transport-pagination-group"></div>
                  <button class="transport-page-btn" id="transportNextPageBtn"><i class="fa-solid fa-chevron-right"></i></button>
                </div>
                <div class="transport-table-note" id="transportPageMeta">Page 1</div>
              </div>
            </div>
          </div>
        </div>
        <div class="transport-edit-modal" id="transportEditModal" style="display:none;">
          <div class="transport-edit-dialog">
            <div class="transport-edit-head">
              <strong id="transportEditTitle">Modifier la ligne</strong>
              <button class="transport-small-btn" type="button" id="transportEditCloseBtn"><i class="fa-solid fa-xmark"></i></button>
            </div>
            <div class="transport-edit-grid">
              <div class="form-group"><label>Camion</label><select id="transportEditTruck"></select></div>
              <div class="form-group"><label>DH départ</label><input type="datetime-local" id="transportEditStart"></div>
              <div class="form-group"><label>DH fin</label><input type="datetime-local" id="transportEditEnd"></div>
              <div class="form-group"><label>KM totale</label><input type="number" step="0.01" id="transportEditKm"></div>
              <div class="form-group"><label>Carb. départ</label><input type="number" step="0.01" id="transportEditFuelStart"></div>
              <div class="form-group"><label>Carb. fin</label><input type="number" step="0.01" id="transportEditFuelEnd"></div>
              <div class="form-group"><label>Litres ajoutés</label><input type="number" step="0.01" id="transportEditFuelAdded"></div>
              <div class="form-group"><label>Conso gasoil</label><input type="number" step="0.01" id="transportEditFuelConsumed"></div>
              <div class="form-group"><label>Lieu départ</label><input type="text" id="transportEditStartLocation"></div>
              <div class="form-group"><label>Lieu fin</label><input type="text" id="transportEditEndLocation"></div>
              <div class="form-group"><label>État</label><select id="transportEditStatus"><option value="ok">Calculée</option><option value="issue">À revoir</option></select></div>
              <div class="form-group"><label>Raison / observation système</label><input type="text" id="transportEditIssueReason"></div>
              <div class="form-group" style="grid-column:1 / -1;"><label>Observation</label><textarea id="transportEditNote" rows="3"></textarea></div>
            </div>
            <div class="transport-edit-actions">
              <button class="btn-secondary" id="transportEditCancelBtn">Annuler</button>
              <button class="btn-secondary" id="transportEditRecalcBtn"><i class="fa-solid fa-arrows-rotate"></i> Recalculer GPS</button>
              <button class="btn-primary transport-btn-info" id="transportEditSaveBtn"><i class="fa-solid fa-floppy-disk"></i> Sauver</button>
            </div>
          </div>
        </div>
      `;
    }



    cacheElements() {
      this.truckSelect = document.getElementById('transportTruckSelect');
      this.fromInput = document.getElementById('transportStartInput');
      this.toInput = document.getElementById('transportEndInput');
      this.noteInput = document.getElementById('transportNoteInput');
      this.previewEl = document.getElementById('transportPreview');
      this.rowsBody = document.getElementById('transportRowsBody');
      this.calcBtn = document.getElementById('transportCalcBtn');
      this.saveBtn = document.getElementById('transportSaveBtn');
      this.reloadBtn = document.getElementById('transportReloadBtn');
      this.exportBtn = document.getElementById('transportExportBtn');
      this.rebuildBtn = document.getElementById('transportRebuildBtn');
      this.cleanRebuildBtn = document.getElementById('transportCleanRebuildBtn');
      this.summaryGrid = document.getElementById('transportSummaryGrid');
      this.filterText = document.getElementById('transportFilterText');
      this.filterTruck = document.getElementById('transportFilterTruck');
      this.filterStart = document.getElementById('transportFilterStart');
      this.filterEnd = document.getElementById('transportFilterEnd');
      this.filterSource = document.getElementById('transportFilterSource');
      this.filterWarning = document.getElementById('transportFilterWarning');
      this.applyFiltersBtn = document.getElementById('transportApplyFiltersBtn');
      this.clearFiltersBtn = document.getElementById('transportClearFiltersBtn');
      this.retryIssuesBtn = document.getElementById('transportRetryIssuesBtn');
      this.selectAllFilteredBtn = document.getElementById('transportSelectAllFilteredBtn');
      this.clearSelectionBtn = document.getElementById('transportClearSelectionBtn');
      this.deleteSelectedBtn = document.getElementById('transportDeleteSelectedBtn');
      this.selectedCountEl = document.getElementById('transportSelectedCount');
      this.selectPageCheckbox = document.getElementById('transportSelectPageCheckbox');
      this.resultsMeta = document.getElementById('transportResultsMeta');
      this.prevPageBtn = document.getElementById('transportPrevPageBtn');
      this.nextPageBtn = document.getElementById('transportNextPageBtn');
      this.pageNumbersEl = document.getElementById('transportPageNumbers');
      this.pageMetaEl = document.getElementById('transportPageMeta');
      this.sortHeaders = Array.from(document.querySelectorAll('#transportReportApp [data-sort]'));
      this.editModal = document.getElementById('transportEditModal');
      this.editTitleEl = document.getElementById('transportEditTitle');
      this.editTruck = document.getElementById('transportEditTruck');
      this.editStart = document.getElementById('transportEditStart');
      this.editEnd = document.getElementById('transportEditEnd');
      this.editKm = document.getElementById('transportEditKm');
      this.editFuelStart = document.getElementById('transportEditFuelStart');
      this.editFuelEnd = document.getElementById('transportEditFuelEnd');
      this.editFuelAdded = document.getElementById('transportEditFuelAdded');
      this.editFuelConsumed = document.getElementById('transportEditFuelConsumed');
      this.editStartLocation = document.getElementById('transportEditStartLocation');
      this.editEndLocation = document.getElementById('transportEditEndLocation');
      this.editStatus = document.getElementById('transportEditStatus');
      this.editIssueReason = document.getElementById('transportEditIssueReason');
      this.editNote = document.getElementById('transportEditNote');
      this.editCloseBtn = document.getElementById('transportEditCloseBtn');
      this.editCancelBtn = document.getElementById('transportEditCancelBtn');
      this.editSaveBtn = document.getElementById('transportEditSaveBtn');
      this.editRecalcBtn = document.getElementById('transportEditRecalcBtn');

      this.importDropzone = document.getElementById('transportImportDropzone');
      this.importFileInput = document.getElementById('transportImportFile');
      this.importFileNameEl = document.getElementById('transportImportFileName');
      this.importPickBtn = document.getElementById('transportImportPickBtn');
      this.importAnalyzeBtn = document.getElementById('transportImportAnalyzeBtn');
      this.importRunBtn = document.getElementById('transportImportRunBtn');
      this.importCancelBtn = document.getElementById('transportImportCancelBtn');
      this.importSummaryEl = document.getElementById('transportImportSummary');
      this.importStartFilter = document.getElementById('transportImportStart');
      this.importEndFilter = document.getElementById('transportImportEnd');
      this.importBatchInput = document.getElementById('transportImportBatch');
      this.importProgressWrap = document.getElementById('transportImportProgress');
      this.importProgressFill = document.getElementById('transportImportProgressFill');
      this.importProgressText = document.getElementById('transportImportProgressText');
      this.importProgressCount = document.getElementById('transportImportProgressCount');
      this.importLogEl = document.getElementById('transportImportLog');
    }

    bindEvents() {
      if (this.calcBtn) this.calcBtn.addEventListener('click', () => this.calculate(false));
      if (this.saveBtn) this.saveBtn.addEventListener('click', () => this.calculate(true));
      if (this.reloadBtn) this.reloadBtn.addEventListener('click', () => this.loadRows());
      if (this.exportBtn) this.exportBtn.addEventListener('click', () => this.exportCsv());
      if (this.rebuildBtn) this.rebuildBtn.addEventListener('click', () => this.rebuildRefuels(false));
      if (this.cleanRebuildBtn) this.cleanRebuildBtn.addEventListener('click', () => this.rebuildRefuels(true));
      if (this.applyFiltersBtn) this.applyFiltersBtn.addEventListener('click', () => this.applyFilters(true));
      if (this.clearFiltersBtn) this.clearFiltersBtn.addEventListener('click', () => this.clearFilters());
      if (this.retryIssuesBtn) this.retryIssuesBtn.addEventListener('click', () => this.retryIssueRows());
      if (this.selectAllFilteredBtn) this.selectAllFilteredBtn.addEventListener('click', () => this.toggleSelectAllFiltered());
      if (this.clearSelectionBtn) this.clearSelectionBtn.addEventListener('click', () => this.clearSelection());
      if (this.deleteSelectedBtn) this.deleteSelectedBtn.addEventListener('click', () => this.deleteSelectedRows());
      if (this.selectPageCheckbox) this.selectPageCheckbox.addEventListener('change', (event) => this.toggleSelectCurrentPage(event.target.checked));
      if (this.prevPageBtn) this.prevPageBtn.addEventListener('click', () => this.changePage(this.currentPage - 1));
      if (this.nextPageBtn) this.nextPageBtn.addEventListener('click', () => this.changePage(this.currentPage + 1));

      [this.filterText, this.filterTruck, this.filterStart, this.filterEnd, this.filterSource, this.filterWarning].forEach((el) => {
        if (!el) return;
        const eventName = el.tagName === 'INPUT' ? 'input' : 'change';
        el.addEventListener(eventName, () => this.applyFilters(true));
      });

      if (this.rowsBody) {
        this.rowsBody.addEventListener('click', (event) => {
          const btn = event.target.closest('[data-row-action]');
          if (!btn) return;
          const action = btn.dataset.rowAction;
          const rowId = btn.dataset.rowId;
          if (action === 'delete') this.deleteRow(rowId);
          if (action === 'edit') this.openEditModal(rowId);
          if (action === 'retry') this.retryIssueRows([rowId]);
        });
        this.rowsBody.addEventListener('change', (event) => {
          const checkbox = event.target.closest('[data-row-select]');
          if (!checkbox) return;
          this.toggleRowSelection(checkbox.dataset.rowSelect, checkbox.checked);
        });
      }

      if (Array.isArray(this.sortHeaders)) {
        this.sortHeaders.forEach((header) => {
          header.addEventListener('click', () => this.toggleSort(header.dataset.sort));
        });
      }

      if (this.editCloseBtn) this.editCloseBtn.addEventListener('click', () => this.closeEditModal());
      if (this.editCancelBtn) this.editCancelBtn.addEventListener('click', () => this.closeEditModal());
      if (this.editSaveBtn) this.editSaveBtn.addEventListener('click', () => this.saveEditModal(false));
      if (this.editRecalcBtn) this.editRecalcBtn.addEventListener('click', () => this.saveEditModal(true));

      if (this.importPickBtn && this.importFileInput) {
        this.importPickBtn.addEventListener('click', () => this.importFileInput.click());
      }
      if (this.importFileInput) {
        this.importFileInput.addEventListener('change', (event) => this.handleImportFileChange(event));
      }
      if (this.importAnalyzeBtn) {
        this.importAnalyzeBtn.addEventListener('click', () => this.analyzeImportFile());
      }
      if (this.importRunBtn) {
        this.importRunBtn.addEventListener('click', () => this.importParsedRows());
      }
      if (this.importCancelBtn) {
        this.importCancelBtn.addEventListener('click', () => {
          this.importCancelled = true;
          this.appendImportLog('⏹ Arrêt demandé. Le lot en cours va se terminer puis l’import s’arrêtera.');
        });
      }
      if (this.importDropzone) {
        ['dragenter', 'dragover'].forEach((type) => {
          this.importDropzone.addEventListener(type, (event) => {
            event.preventDefault();
            this.importDropzone.classList.add('dragover');
          });
        });
        ['dragleave', 'dragend', 'drop'].forEach((type) => {
          this.importDropzone.addEventListener(type, () => this.importDropzone.classList.remove('dragover'));
        });
        this.importDropzone.addEventListener('drop', (event) => {
          event.preventDefault();
          const file = event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files[0];
          if (!file) return;
          this.assignImportFile(file);
          this.analyzeImportFile();
        });
      }
    }




    assignImportFile(file) {
      this.importFile = file || null;
      this.importRows = [];
      this.importSummary = null;
      if (this.importFileNameEl) {
        this.importFileNameEl.textContent = this.importFile ? `${this.importFile.name} • ${(this.importFile.size / 1024).toFixed(1)} KB` : 'Aucun fichier sélectionné';
      }
      this.updateImportControls();
      this.renderImportSummary();
      this.resetImportProgress();
    }

    handleImportFileChange(event) {
      const file = event && event.target && event.target.files ? event.target.files[0] : null;
      if (!file) return;
      this.assignImportFile(file);
    }

    updateImportControls() {
      if (this.importAnalyzeBtn) this.importAnalyzeBtn.disabled = !this.importFile || this.importInFlight;
      if (this.importRunBtn) this.importRunBtn.disabled = !this.importSummary || !this.importSummary.readyCount || this.importInFlight;
      if (this.importCancelBtn) this.importCancelBtn.disabled = !this.importInFlight;
      if (this.importPickBtn) this.importPickBtn.disabled = this.importInFlight;
    }

    resetImportProgress() {
      if (this.importProgressWrap) this.importProgressWrap.classList.remove('active');
      if (this.importProgressFill) this.importProgressFill.style.width = '0%';
      if (this.importProgressText) this.importProgressText.textContent = 'Import en attente';
      if (this.importProgressCount) this.importProgressCount.textContent = '0 / 0';
      if (this.importLogEl) {
        this.importLogEl.textContent = '';
        this.importLogEl.classList.remove('active');
      }
    }

    appendImportLog(message) {
      if (!this.importLogEl) return;
      this.importLogEl.classList.add('active');
      const time = new Date().toLocaleTimeString('fr-FR');
      this.importLogEl.textContent += `[${time}] ${message}
`;
      this.importLogEl.scrollTop = this.importLogEl.scrollHeight;
    }

    updateImportProgress(done, total, label) {
      if (!this.importProgressWrap) return;
      this.importProgressWrap.classList.add('active');
      const safeTotal = Math.max(1, Number(total) || 1);
      const safeDone = Math.min(safeTotal, Math.max(0, Number(done) || 0));
      const pct = Math.round((safeDone / safeTotal) * 100);
      if (this.importProgressFill) this.importProgressFill.style.width = `${pct}%`;
      if (this.importProgressText) this.importProgressText.textContent = label || 'Import en cours';
      if (this.importProgressCount) this.importProgressCount.textContent = `${safeDone} / ${safeTotal}`;
    }

    normalizeHeaderKey(value) {
      return String(value || '')
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '');
    }

    normalizeTruckName(value) {
      return String(value || '')
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, '');
    }

    findImportedField(record, aliases) {
      const keys = Object.keys(record || {});
      for (const alias of aliases) {
        if (Object.prototype.hasOwnProperty.call(record, alias) && record[alias] !== null && record[alias] !== '') {
          return record[alias];
        }
        const hit = keys.find((key) => key.includes(alias));
        if (hit && record[hit] !== null && record[hit] !== '') {
          return record[hit];
        }
      }
      return null;
    }

    parseSpreadsheetDate(value) {
      if (value instanceof Date && !Number.isNaN(value.getTime())) return new Date(value.getTime());

      if (typeof value === 'number' && window.XLSX && window.XLSX.SSF && typeof window.XLSX.SSF.parse_date_code === 'function') {
        const parsed = window.XLSX.SSF.parse_date_code(value);
        if (parsed && parsed.y && parsed.m && parsed.d) {
          return new Date(parsed.y, parsed.m - 1, parsed.d, parsed.H || 0, parsed.M || 0, Math.floor(parsed.S || 0));
        }
      }

      const raw = String(value || '').trim();
      if (!raw) return null;
      const text = raw.replace(/ /g, ' ');

      let match = text.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})(?:[ T](\d{1,2})[:h](\d{2})(?::(\d{2}))?)?$/);
      if (match) {
        const [, dd, mm, yyyy, hh = '0', mi = '0', ss = '0'] = match;
        const date = new Date(Number(yyyy), Number(mm) - 1, Number(dd), Number(hh), Number(mi), Number(ss));
        if (!Number.isNaN(date.getTime())) return date;
      }

      match = text.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})(?:[ T](\d{1,2})[:h](\d{2})(?::(\d{2}))?)?$/);
      if (match) {
        const [, yyyy, mm, dd, hh = '0', mi = '0', ss = '0'] = match;
        const date = new Date(Number(yyyy), Number(mm) - 1, Number(dd), Number(hh), Number(mi), Number(ss));
        if (!Number.isNaN(date.getTime())) return date;
      }

      const native = new Date(text);
      return Number.isNaN(native.getTime()) ? null : native;
    }

    formatImportRangeDate(date) {
      if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
      return date.toLocaleDateString('fr-FR');
    }

    toGpsDatetimeFromDate(date) {
      const d = date instanceof Date ? date : new Date(date);
      if (Number.isNaN(d.getTime())) return '';
      const pad = (n) => String(n).padStart(2, '0');
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
    }

    toMinuteKey(date) {
      const d = date instanceof Date ? date : new Date(date);
      if (Number.isNaN(d.getTime())) return '';
      const pad = (n) => String(n).padStart(2, '0');
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
    }

    buildRowFingerprint(truckName, startValue, endValue) {
      const truckKey = this.normalizeTruckName(truckName);
      const startKey = this.toMinuteKey(startValue);
      const endKey = this.toMinuteKey(endValue);
      return `${truckKey}|${startKey}|${endKey}`;
    }

    getExistingFingerprintSet() {
      return new Set((this.rows || []).map((row) => this.buildRowFingerprint(
        row.truckName || '',
        row.requestedStartAt || row.startAt || row.createdAt,
        row.requestedEndAt || row.endAt || row.createdAt
      )));
    }

    matchTruckByImportName(rawName) {
      const wanted = this.normalizeTruckName(rawName);
      if (!wanted) return null;
      return this.trucks.find((truck) => this.normalizeTruckName(truck.name) === wanted)
        || this.trucks.find((truck) => this.normalizeTruckName(truck.name).startsWith(wanted))
        || this.trucks.find((truck) => this.normalizeTruckName(truck.name).includes(wanted))
        || null;
    }

    buildImportNote(candidate) {
      const parts = [];
      if (candidate.pointLoading || candidate.pointUnloading) {
        parts.push([candidate.pointLoading, candidate.pointUnloading].filter(Boolean).join(' → '));
      }
      if (candidate.client) parts.push(candidate.client);
      if (candidate.driver) parts.push(`Chauffeur: ${candidate.driver}`);
      return parts.join(' • ').slice(0, 240);
    }

    async ensureXlsxLibrary() {
      if (window.XLSX) return window.XLSX;
      if (!this.xlsxLoaderPromise) {
        this.xlsxLoaderPromise = new Promise((resolve, reject) => {
          const script = document.createElement('script');
          script.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
          script.async = true;
          script.onload = () => resolve(window.XLSX);
          script.onerror = () => reject(new Error('Impossible de charger le lecteur Excel depuis le CDN.'));
          document.head.appendChild(script);
        });
      }
      return this.xlsxLoaderPromise;
    }

    getImportWindow() {
      const startDate = this.importStartFilter ? this.parseDateValue(this.importStartFilter.value, false) : null;
      const endDate = this.importEndFilter ? this.parseDateValue(this.importEndFilter.value, true) : null;
      return { startDate, endDate };
    }

    rowMatchesImportWindow(row) {
      const { startDate, endDate } = this.getImportWindow();
      if (!startDate && !endDate) return true;
      const rowEnd = row.endDate;
      if (!(rowEnd instanceof Date) || Number.isNaN(rowEnd.getTime())) return false;
      if (startDate && rowEnd < startDate) return false;
      if (endDate && rowEnd > endDate) return false;
      return true;
    }

    summarizeImportRows(rows) {
      const validRows = rows.filter((row) => row.valid);
      const matchedRows = validRows.filter((row) => row.matchedTruck);
      const unmatchedRows = validRows.filter((row) => !row.matchedTruck);
      const duplicatesDb = matchedRows.filter((row) => row.duplicateDb);
      const duplicatesFile = matchedRows.filter((row) => row.duplicateFile);
      const inWindowRows = matchedRows.filter((row) => this.rowMatchesImportWindow(row));
      const readyRows = inWindowRows.filter((row) => !row.duplicateDb && !row.duplicateFile);
      const dates = validRows.map((row) => row.startDate).filter((date) => date instanceof Date && !Number.isNaN(date.getTime())).sort((a, b) => a - b);
      return {
        totalRows: rows.length,
        validCount: validRows.length,
        matchedCount: matchedRows.length,
        unmatchedCount: unmatchedRows.length,
        duplicateDbCount: duplicatesDb.length,
        duplicateFileCount: duplicatesFile.length,
        inWindowCount: inWindowRows.length,
        readyCount: readyRows.length,
        firstDate: dates[0] || null,
        lastDate: dates[dates.length - 1] || null,
        unmatchedNames: Array.from(new Set(unmatchedRows.map((row) => row.truckInput).filter(Boolean))).slice(0, 8),
        sampleRoutes: readyRows.slice(0, 5).map((row) => `${row.matchedTruck ? row.matchedTruck.name : row.truckInput} • ${this.formatDateTime(row.startDate)} → ${this.formatDateTime(row.endDate)}`)
      };
    }

    renderImportSummary() {
      if (!this.importSummaryEl) return;
      if (!this.importSummary) {
        this.importSummaryEl.className = 'transport-import-summary empty';
        this.importSummaryEl.innerHTML = 'Choisissez le fichier mission, lancez <strong>Analyser</strong>, puis <strong>Importer absentes</strong>. Le système reconnaît le camion, lit les dates, ignore les doublons et calcule le reste via GPS.';
        this.updateImportControls();
        return;
      }

      const s = this.importSummary;
      const unmatchedHtml = s.unmatchedNames.length
        ? `<div class="transport-import-list">${s.unmatchedNames.map((name) => `<span class="transport-import-chip warn"><i class="fa-solid fa-triangle-exclamation"></i>${this.escapeHtml(name)}</span>`).join('')}</div>`
        : '';
      const sampleHtml = s.sampleRoutes.length
        ? `<div class="transport-import-list">${s.sampleRoutes.map((item) => `<span class="transport-import-chip info"><i class="fa-solid fa-route"></i>${this.escapeHtml(item)}</span>`).join('')}</div>`
        : '';

      this.importSummaryEl.className = 'transport-import-summary';
      this.importSummaryEl.innerHTML = `
        <div class="transport-preview-head">
          <div>
            <div class="transport-preview-title">Analyse import terminée</div>
            <div class="transport-preview-sub">
              ${s.firstDate ? `${this.escapeHtml(this.formatImportRangeDate(s.firstDate))}` : '-'}
              ${s.lastDate ? ` → ${this.escapeHtml(this.formatImportRangeDate(s.lastDate))}` : ''}
              ${this.importFile ? ` • ${this.escapeHtml(this.importFile.name)}` : ''}
            </div>
          </div>
          <div class="transport-pill good"><i class="fa-solid fa-bolt"></i>${s.readyCount} prête(s) à importer</div>
        </div>

        <div class="transport-import-meta">
          <div class="transport-import-stat"><div class="label">Lignes lues</div><div class="value">${this.formatNumber(s.totalRows, 0)}</div></div>
          <div class="transport-import-stat"><div class="label">Valides</div><div class="value">${this.formatNumber(s.validCount, 0)}</div></div>
          <div class="transport-import-stat"><div class="label">Camions reconnus</div><div class="value">${this.formatNumber(s.matchedCount, 0)}</div></div>
          <div class="transport-import-stat"><div class="label">Dans la fenêtre</div><div class="value">${this.formatNumber(s.inWindowCount, 0)}</div></div>
        </div>

        <div class="transport-import-list">
          <span class="transport-import-chip good"><i class="fa-solid fa-check"></i>À importer: ${this.formatNumber(s.readyCount, 0)}</span>
          <span class="transport-import-chip warn"><i class="fa-solid fa-clone"></i>Doublons BD: ${this.formatNumber(s.duplicateDbCount, 0)}</span>
          <span class="transport-import-chip warn"><i class="fa-solid fa-copy"></i>Doublons fichier: ${this.formatNumber(s.duplicateFileCount, 0)}</span>
          <span class="transport-import-chip ${s.unmatchedCount ? 'warn' : 'good'}"><i class="fa-solid fa-truck"></i>Non reconnus: ${this.formatNumber(s.unmatchedCount, 0)}</span>
        </div>
        ${unmatchedHtml}
        ${sampleHtml}
      `;
      this.updateImportControls();
    }

    async analyzeImportFile() {
      if (!this.importFile) {
        this.showToast('Choisissez d’abord le fichier Excel mission', 'error');
        return;
      }
      try {
        this.updateImportProgress(0, 1, 'Lecture du fichier Excel...');
        const XLSX = await this.ensureXlsxLibrary();
        const buffer = await this.importFile.arrayBuffer();
        const workbook = XLSX.read(buffer, { type: 'array', cellDates: true, raw: true });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        if (!sheet) throw new Error('Aucune feuille lisible dans le fichier.');

        const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: null, blankrows: false });
        if (!Array.isArray(matrix) || matrix.length < 2) throw new Error('Le fichier ne contient pas assez de lignes.');
        if (matrix.length - 1 > this.maxAnalyzeRows) throw new Error(`Le fichier dépasse la limite d'analyse (${this.maxAnalyzeRows.toLocaleString('fr-FR')} lignes). Découpez-le ou importez par périodes.`);

        const headers = (matrix[0] || []).map((value) => this.normalizeHeaderKey(value));
        const existing = this.getExistingFingerprintSet();
        const fileSeen = new Set();
        const rows = [];

        for (let index = 1; index < matrix.length; index += 1) {
          const line = matrix[index] || [];
          if (!line.some((cell) => cell !== null && cell !== '')) continue;

          const record = {};
          headers.forEach((key, colIndex) => {
            if (key) record[key] = line[colIndex];
          });

          const truckInput = String(this.findImportedField(record, ['camions', 'camion']) || '').trim();
          const startDate = this.parseSpreadsheetDate(this.findImportedField(record, ['dhdedepart']));
          const endDate = this.parseSpreadsheetDate(this.findImportedField(record, ['dhdefindemission', 'dhfinmission', 'dhfin']));
          const pointLoading = String(this.findImportedField(record, ['pointdechargement']) || '').trim();
          const pointUnloading = String(this.findImportedField(record, ['pointdedechargement']) || '').trim();
          const client = String(this.findImportedField(record, ['client']) || '').trim();
          const driver = String(this.findImportedField(record, ['chauffeurs', 'chauffeur']) || '').trim();

          const candidate = {
            sourceRow: index + 1,
            sourceFileName: this.importFile ? this.importFile.name : '',
            truckInput,
            startDate,
            endDate,
            pointLoading,
            pointUnloading,
            client,
            driver,
            valid: !!truckInput && !!startDate && !!endDate && endDate > startDate
          };
          candidate.issueReason = !truckInput ? 'Camion manquant' : (!startDate || !endDate ? 'Dates manquantes ou illisibles' : (endDate <= startDate ? 'DH fin avant DH départ' : ''));

          candidate.matchedTruck = candidate.valid ? this.matchTruckByImportName(candidate.truckInput) : null;
          candidate.note = this.buildImportNote(candidate);
          candidate.fingerprint = candidate.valid && candidate.matchedTruck
            ? this.buildRowFingerprint(candidate.matchedTruck.name, candidate.startDate, candidate.endDate)
            : '';
          candidate.duplicateDb = !!(candidate.fingerprint && existing.has(candidate.fingerprint));
          candidate.duplicateFile = !!(candidate.fingerprint && fileSeen.has(candidate.fingerprint));
          candidate.issueCategory = !candidate.valid ? 'invalid-row' : (!candidate.matchedTruck ? 'truck-unmatched' : '');
          if (!candidate.issueReason && !candidate.matchedTruck) candidate.issueReason = 'Camion non reconnu par le GPS';
          if (candidate.fingerprint) fileSeen.add(candidate.fingerprint);

          rows.push(candidate);
        }

        this.importRows = rows;
        this.importSummary = this.summarizeImportRows(rows);
        this.renderImportSummary();
        this.updateImportProgress(1, 1, `Analyse terminée • feuille: ${sheetName}`);
        this.showToast(`Analyse Excel OK • ${this.importSummary.readyCount} ligne(s) prête(s)`, 'success');
      } catch (error) {
        this.importRows = [];
        this.importSummary = null;
        this.renderImportSummary();
        this.updateImportProgress(0, 1, 'Analyse impossible');
        this.showToast(error.message || 'Erreur lecture Excel', 'error');
      }
    }

    async importParsedRows() {
      if (this.importInFlight) return;
      if (!this.importSummary) {
        this.showToast('Analysez d’abord le fichier puis vérifiez les lignes.', 'error');
        return;
      }

      const batchSizeRaw = Number(this.importBatchInput ? this.importBatchInput.value : 1000);
      const batchSize = Math.min(this.maxImportBatch, Number.isFinite(batchSizeRaw) && batchSizeRaw > 0 ? Math.round(batchSizeRaw) : 1000);
      if (this.importBatchInput) this.importBatchInput.value = String(batchSize);
      const inWindowRows = this.importRows.filter((row) => this.rowMatchesImportWindow(row));
      const issueCandidates = inWindowRows.filter((row) => !row.duplicateDb && !row.duplicateFile && (!row.valid || !row.matchedTruck));
      const readyRows = inWindowRows.filter((row) => row.valid && row.matchedTruck && !row.duplicateDb && !row.duplicateFile);
      const targetRows = readyRows.slice(0, batchSize);
      if (!targetRows.length && !issueCandidates.length) {
        this.showToast('Aucune ligne à importer avec les filtres actuels.', 'error');
        return;
      }

      this.importInFlight = true;
      this.importCancelled = false;
      this.updateImportControls();
      this.resetImportProgress();
      this.updateImportProgress(0, Math.max(targetRows.length, 1), 'Import démarré');
      this.appendImportLog(`📥 ${targetRows.length} ligne(s) sélectionnée(s) pour import.`);
      const errors = [];
      let imported = 0;
      let skipped = 0;
      let issueSaved = 0;
      let completed = 0;
      const knownFingerprints = this.getExistingFingerprintSet();

      for (const row of issueCandidates) {
        try {
          await this.persistImportIssueRow(row, row.issueReason || 'Ligne non importable automatiquement');
          issueSaved += 1;
          this.appendImportLog(`⚠ Ligne ${row.sourceRow} mise en revue: ${row.truckInput || '-'} • ${row.issueReason || 'À corriger manuellement'}`);
        } catch (error) {
          this.appendImportLog(`✗ Ligne ${row.sourceRow} non historisée: ${error.message || 'erreur'}`);
        }
      }

      const queue = targetRows.slice();
      const workerCount = Math.min(8, Math.max(1, queue.length));
      const workers = Array.from({ length: workerCount }, () => (async () => {
        while (queue.length && !this.importCancelled) {
          const row = queue.shift();
          if (!row) break;

          const fingerprint = row.fingerprint;
          if (fingerprint && knownFingerprints.has(fingerprint)) {
            skipped += 1;
            completed += 1;
            this.updateImportProgress(completed, targetRows.length, 'Doublon ignoré');
            this.appendImportLog(`↷ Ligne ${row.sourceRow} ignorée: déjà présente (${row.matchedTruck.name}).`);
            continue;
          }

          try {
            const payload = {
              deviceId: row.matchedTruck.id,
              truckName: row.matchedTruck.name,
              start: this.toGpsDatetimeFromDate(row.startDate),
              end: this.toGpsDatetimeFromDate(row.endDate),
              persist: true,
              note: row.note || '',
              sourceFileName: row.sourceFileName || '',
              sourceRow: row.sourceRow,
              sourceType: 'import'
            };

            const res = await fetch(this.api('/api/transport-report/calculate'), {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payload)
            });
            const json = await res.json();
            if (!res.ok) throw new Error(json.error || 'Erreur calcul import');
            imported += 1;
            knownFingerprints.add(fingerprint);
            if (json.savedRow) this.rows.unshift(json.savedRow);
            else if (json.summary) this.rows.unshift(json.summary);
            row.duplicateDb = true;
            completed += 1;
            this.updateImportProgress(completed, targetRows.length, `Import mission ${row.matchedTruck.name}`);
            this.appendImportLog(`✓ Ligne ${row.sourceRow} importée: ${row.matchedTruck.name} • ${this.formatDateTime(row.startDate)} → ${this.formatDateTime(row.endDate)}`);
          } catch (error) {
            const reason = error.message || 'erreur';
            errors.push(`L${row.sourceRow} ${row.truckInput}: ${reason}`);
            completed += 1;
            this.updateImportProgress(completed, targetRows.length, 'Erreur sur une ligne');
            this.appendImportLog(`✗ Ligne ${row.sourceRow} échouée: ${row.truckInput} • ${reason}`);
            try {
              await this.persistImportIssueRow(row, reason);
              issueSaved += 1;
            } catch (persistError) {
              this.appendImportLog(`✗ Ligne ${row.sourceRow} non historisée: ${persistError.message || 'erreur'}`);
            }
          }
        }
      })());

      await Promise.all(workers);

      this.importInFlight = false;
      this.updateImportControls();

      const statusMessage = this.importCancelled
        ? `Import arrêté • ${imported} importée(s), ${errors.length} erreur(s), ${issueSaved} en revue`
        : (errors.length
          ? `Import terminé • ${imported} importée(s), ${errors.length} erreur(s), ${issueSaved} en revue`
          : `Import terminé • ${imported} ligne(s) ajoutée(s), ${issueSaved} en revue`);
      this.showToast(statusMessage, errors.length ? 'info' : 'success');

      if (skipped) this.appendImportLog(`ℹ ${skipped} doublon(s) ignoré(s).`);
      if (errors.length) this.appendImportLog(`⚠ ${errors.length} erreur(s) au total.`);
      if (issueSaved) this.appendImportLog(`🧾 ${issueSaved} ligne(s) enregistrée(s) dans l'historique à revoir.`);
      if (readyRows.length > targetRows.length) this.appendImportLog(`ℹ ${readyRows.length - targetRows.length} ligne(s) restante(s) hors lot actuel.`);

      this.importSummary = this.summarizeImportRows(this.importRows);
      this.renderImportSummary();
      await this.loadRows();
    }

    setDefaultDates() {
      if (!this.fromInput || !this.toInput) return;
      const now = new Date();
      const start = new Date(now.getTime() - (6 * 60 * 60 * 1000));
      this.fromInput.value = this.toDatetimeLocal(start);
      this.toInput.value = this.toDatetimeLocal(now);
    }

    toDatetimeLocal(value) {
      const date = value instanceof Date ? value : new Date(value);
      const pad = (n) => String(n).padStart(2, '0');
      return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
    }

    toGpsDatetime(value) {
      if (!value) return '';
      return `${String(value).replace('T', ' ')}:00`;
    }

    parseDateValue(value, endOfDay) {
      if (!value) return null;
      const text = endOfDay ? `${value}T23:59:59` : `${value}T00:00:00`;
      const date = new Date(text);
      return Number.isNaN(date.getTime()) ? null : date;
    }

    formatDateTime(value) {
      if (!value) return '-';
      const date = value instanceof Date ? value : new Date(value);
      if (Number.isNaN(date.getTime())) return String(value);
      return date.toLocaleString('fr-FR');
    }

    formatNumber(value, digits = 2) {
      const num = Number(value || 0);
      if (!Number.isFinite(num)) return '-';
      return num.toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: digits });
    }

    escapeHtml(value) {
      return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    }

    csvEscape(value) {
      const text = String(value ?? '');
      return `"${text.replace(/"/g, '""')}"`;
    }

    splitDateTime(value) {
      if (!value) return { date: '-', time: '' };
      const date = value instanceof Date ? value : new Date(value);
      if (Number.isNaN(date.getTime())) return { date: String(value), time: '' };
      return {
        date: date.toLocaleDateString('fr-FR'),
        time: date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
      };
    }

    extractCoordsFromLocation(value) {
      const text = String(value || '').trim();
      if (!text) return null;
      const match = text.match(/(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/);
      if (!match) return null;
      const lat = parseFloat(match[1]);
      const lng = parseFloat(match[2]);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
      if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
      return { lat, lng, key: `${lat.toFixed(5)}, ${lng.toFixed(5)}` };
    }

    normalizeGeoLabel(result, fallback) {
      if (!result) return fallback;
      const raw = result.formatted || [
        result.name,
        result.city || result.town || result.municipality,
        result.state || result.province
      ].filter(Boolean).join(', ');
      const text = String(raw || '').trim().replace(/^📍\s*/, '');
      if (!text) return fallback;
      if (/^(missing key|invalid coords|adresse introuvable|erreur connexion)$/i.test(text)) return fallback;
      return text;
    }

    getDisplayLocation(value) {
      const text = String(value || '').trim();
      if (!text) return '-';
      if (this.locationLabelCache.has(text)) return this.locationLabelCache.get(text);
      const coords = this.extractCoordsFromLocation(text);
      if (coords && this.locationLabelCache.has(coords.key)) return this.locationLabelCache.get(coords.key);
      return text;
    }

    async resolveLocationText(value) {
      const text = String(value || '').trim();
      if (!text) return '';
      if (this.locationLabelCache.has(text)) return this.locationLabelCache.get(text);

      const coords = this.extractCoordsFromLocation(text);
      if (!coords) {
        this.locationLabelCache.set(text, text);
        return text;
      }

      if (this.locationPromiseCache.has(coords.key)) {
        const label = await this.locationPromiseCache.get(coords.key);
        this.locationLabelCache.set(text, label);
        return label;
      }

      const task = (async () => {
        const service = (typeof geocodeService !== 'undefined' && geocodeService) ? geocodeService : (window.geocodeService || null);
        if (!service) return text;
        try {
          if (typeof service.checkCacheInstant === 'function') {
            const instant = service.checkCacheInstant(coords.lat, coords.lng);
            const instantLabel = this.normalizeGeoLabel(instant, text);
            if (instant && instantLabel) return instantLabel;
          }
          if (typeof service.reverseGeocode === 'function') {
            const result = await service.reverseGeocode(coords.lat, coords.lng);
            return this.normalizeGeoLabel(result, text);
          }
        } catch (error) {
          // Ignore geocoding failures silently: we keep raw coordinates as fallback.
        }
        return text;
      })();

      this.locationPromiseCache.set(coords.key, task);
      try {
        const label = await task;
        this.locationLabelCache.set(coords.key, label);
        this.locationLabelCache.set(text, label);
        return label;
      } finally {
        this.locationPromiseCache.delete(coords.key);
      }
    }

    async hydrateLocationTargets(values = []) {
      const unique = Array.from(new Set((Array.isArray(values) ? values : []).map((value) => String(value || '').trim()).filter(Boolean)));
      const unresolved = unique.filter((value) => this.extractCoordsFromLocation(value) && this.getDisplayLocation(value) === value);
      if (!unresolved.length) return;
      await Promise.all(unresolved.map((value) => this.resolveLocationText(value)));
    }

    queueLocationHydration(includeAllFiltered = false) {
      clearTimeout(this.locationHydrationTimer);
      this.locationHydrationTimer = setTimeout(async () => {
        const rows = includeAllFiltered ? this.filteredRows : this.getPageRows();
        const values = [];
        if (this.preview) {
          values.push(this.preview.startLocation, this.preview.endLocation);
          if (Array.isArray(this.preview.refills)) {
            this.preview.refills.forEach((refill) => values.push(refill.locationRaw));
          }
        }
        rows.forEach((row) => {
          values.push(row.startLocation, row.endLocation);
        });
        await this.hydrateLocationTargets(values);
        if (this.previewEl) this.renderPreview();
        if (this.rowsBody) this.renderRows();
      }, 20);
    }

    formatTruckList(payload) {
      const data = payload && payload.data ? payload.data : payload;
      if (Array.isArray(data)) {
        return data.map((item, idx) => ({
          id: String(item.id || item.imei || idx),
          name: item.name || item.truckName || item.imei || `Truck ${idx + 1}`
        }));
      }
      if (data && typeof data === 'object') {
        return Object.entries(data).map(([id, item]) => ({
          id: String(item.id || item.imei || id),
          name: item.name || item.truckName || item.imei || id
        }));
      }
      return [];
    }

    updateTruckFilters() {
      if (!this.filterTruck) return;
      const current = this.filterTruck.value;
      this.filterTruck.innerHTML = '<option value="all">Tous les camions</option>' + this.trucks
        .map((truck) => `<option value="${this.escapeHtml(truck.name)}">${this.escapeHtml(truck.name)}</option>`)
        .join('');
      if (current && Array.from(this.filterTruck.options).some((opt) => opt.value === current)) {
        this.filterTruck.value = current;
      }
    }

    async loadTrucks() {
      if (!this.truckSelect) return;
      try {
        const currentFormValue = this.truckSelect.value;
        const currentFilterValue = this.filterTruck ? this.filterTruck.value : 'all';
        const res = await fetch(this.api('/api/trucks'));
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Erreur chargement camions');
        this.trucks = this.formatTruckList(json).sort((a, b) => a.name.localeCompare(b.name, 'fr'));
        this.truckSelect.innerHTML = '<option value="">-- Choisir un camion --</option>' + this.trucks.map((truck) => `\n<option value="${truck.id}" data-name="${this.escapeHtml(truck.name)}">${this.escapeHtml(truck.name)}</option>`).join('');
        if (currentFormValue && this.trucks.some((truck) => truck.id === currentFormValue)) {
          this.truckSelect.value = currentFormValue;
        }
        this.updateTruckFilters();
        if (this.filterTruck && currentFilterValue && Array.from(this.filterTruck.options).some((opt) => opt.value === currentFilterValue)) {
          this.filterTruck.value = currentFilterValue;
        }
      } catch (error) {
        this.showToast(error.message || 'Impossible de charger les camions', 'error');
      }
    }

    getSelectedTruck() {
      if (!this.truckSelect) return null;
      const deviceId = this.truckSelect.value;
      if (!deviceId) return null;
      const option = this.truckSelect.selectedOptions && this.truckSelect.selectedOptions[0];
      const truckName = (option && option.dataset && option.dataset.name) || (option ? option.textContent.trim() : deviceId);
      return { deviceId, truckName };
    }

    getFormPayload() {
      const truck = this.getSelectedTruck();
      if (!truck) throw new Error('Choisissez un camion');
      if (!this.fromInput.value || !this.toInput.value) throw new Error('Choisissez la période complète');
      if (this.toInput.value <= this.fromInput.value) throw new Error('La date de fin doit être après la date de départ');
      return {
        deviceId: truck.deviceId,
        truckName: truck.truckName,
        start: this.toGpsDatetime(this.fromInput.value),
        end: this.toGpsDatetime(this.toInput.value),
        note: this.noteInput ? this.noteInput.value.trim() : ''
      };
    }

    async calculate(persist) {
      const btn = persist ? this.saveBtn : this.calcBtn;
      const originalText = btn ? btn.innerHTML : '';
      try {
        const payload = this.getFormPayload();
        if (btn) {
          btn.disabled = true;
          btn.innerHTML = persist
            ? '<i class="fa-solid fa-circle-notch fa-spin"></i> Enregistrement...'
            : '<i class="fa-solid fa-circle-notch fa-spin"></i> Calcul...';
        }

        const res = await fetch(this.api('/api/transport-report/calculate'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...payload, persist: !!persist })
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Erreur calcul transport');
        this.preview = json.summary || null;
        this.renderPreview();
        this.queueLocationHydration(false);
        if (persist) {
          this.showToast('Ligne ajoutée au rapport transport', 'success');
          await this.loadRows();
        }
      } catch (error) {
        this.showToast(error.message || 'Erreur transport', 'error');
      } finally {
        if (btn) {
          btn.disabled = false;
          btn.innerHTML = originalText;
        }
      }
    }

    renderPreview() {
      if (!this.previewEl) return;
      if (!this.preview) {
        this.previewEl.className = 'transport-preview-empty';
        this.previewEl.innerHTML = 'Choisissez un camion, une période, puis cliquez sur <strong>Calculer</strong> pour préparer la ligne avant ajout.';
        return;
      }

      const summary = this.preview;
      const warnings = Array.isArray(summary.warnings) ? summary.warnings : [];
      const refills = Array.isArray(summary.refills) ? summary.refills : [];
      const averageConfidence = refills.length
        ? Math.round((refills.reduce((sum, refill) => sum + (Number(refill.confidence) || 0), 0) / refills.length) * 100)
        : null;
      const startLabel = this.getDisplayLocation(summary.startLocation);
      const endLabel = this.getDisplayLocation(summary.endLocation);
      const refillHtml = refills.length
        ? `
          <div class="transport-inline-list">
            ${refills.map((refill) => {
              const confidenceText = Number.isFinite(Number(refill.confidence)) ? ` • ${Math.round(Number(refill.confidence) * 100)}%` : '';
              return `<div class="transport-pill ${Number(refill.confidence) >= 0.8 ? 'good' : 'warn'}"><i class="fa-solid fa-gas-pump"></i> ${this.formatDateTime(refill.time)} • +${this.formatNumber(refill.addedLiters)} L${confidenceText} • ${this.escapeHtml(this.getDisplayLocation(refill.locationRaw || '-'))}</div>`;
            }).join('')}
          </div>`
        : '';

      const warningHtml = warnings.length
        ? `<div class="transport-warnings">${warnings.map((warning) => `<div class="transport-warning"><i class="fa-solid fa-triangle-exclamation"></i> <span>${this.escapeHtml(warning)}</span></div>`).join('')}</div>`
        : '';

      this.previewEl.className = 'transport-preview-ready';
      this.previewEl.innerHTML = `
        <div class="transport-preview-head">
          <div>
            <div class="transport-preview-title">${this.escapeHtml(summary.truckName || '-')} • ${this.formatNumber(summary.kmTotal)} km • ${this.formatNumber(summary.fuelConsumedTotal)} L</div>
            <div class="transport-preview-sub">${this.formatDateTime(summary.requestedStartAt)} → ${this.formatDateTime(summary.requestedEndAt)}</div>
          </div>
          <div class="transport-inline-list" style="margin-top:0;">
            <div class="transport-pill soft"><i class="fa-solid fa-circle-info"></i> ${summary.historyPoints || 0} points</div>
            <div class="transport-pill ${summary.distanceSource === 'odometer' ? 'good' : 'warn'}">${summary.distanceSource === 'odometer' ? 'Odomètre' : 'Trace GPS'}</div>
          </div>
        </div>

        <div class="transport-kpis">
          <div class="transport-kpi">
            <div class="transport-kpi-label">Carb. départ</div>
            <div class="transport-kpi-value">${this.formatNumber(summary.fuelStart)} L</div>
          </div>
          <div class="transport-kpi">
            <div class="transport-kpi-label">Carb. fin</div>
            <div class="transport-kpi-value">${this.formatNumber(summary.fuelEnd)} L</div>
          </div>
          <div class="transport-kpi">
            <div class="transport-kpi-label">Pleins</div>
            <div class="transport-kpi-value">${summary.refillCount || 0}</div>
          </div>
          <div class="transport-kpi">
            <div class="transport-kpi-label">Ajouté</div>
            <div class="transport-kpi-value">+${this.formatNumber(summary.fuelAddedDuringTrip)} L</div>
          </div>
          ${averageConfidence !== null ? `<div class="transport-kpi"><div class="transport-kpi-label">Fiabilité</div><div class="transport-kpi-value">${averageConfidence}%</div></div>` : ''}
        </div>

        <div class="transport-inline-list">
          <div class="transport-pill"><i class="fa-solid fa-location-dot"></i> A: ${this.escapeHtml(startLabel || '-')}</div>
          <div class="transport-pill"><i class="fa-solid fa-flag-checkered"></i> B: ${this.escapeHtml(endLabel || '-')}</div>
        </div>

        ${refillHtml}
        ${warningHtml}
      `;
    }

    async loadRows() {
      if (!this.rowsBody) return;
      this.rowsBody.innerHTML = '<tr><td colspan="14" class="transport-empty-row"><i class="fa-solid fa-circle-notch fa-spin"></i> Chargement...</td></tr>';
      try {
        const res = await fetch(this.api('/api/transport-report/rows?limit=20000'));
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Erreur chargement feuille');
        this.rows = Array.isArray(json) ? json : [];
        this.applyFilters(false);
        this.queueLocationHydration(false);
      } catch (error) {
        this.rowsBody.innerHTML = `<tr><td colspan="14" class="transport-empty-row" style="color:#b91c1c;">${this.escapeHtml(error.message || 'Erreur chargement feuille')}</td></tr>`;
        if (this.resultsMeta) this.resultsMeta.textContent = error.message || 'Erreur chargement feuille';
        if (this.summaryGrid) this.summaryGrid.innerHTML = '';
      }
    }

    getFilteredRows() {
      const text = (this.filterText ? this.filterText.value : '').trim().toLowerCase();
      const truck = this.filterTruck ? this.filterTruck.value : 'all';
      const source = this.filterSource ? this.filterSource.value : 'all';
      const warningMode = this.filterWarning ? this.filterWarning.value : 'all';
      const startDate = this.filterStart ? this.parseDateValue(this.filterStart.value, false) : null;
      const endDate = this.filterEnd ? this.parseDateValue(this.filterEnd.value, true) : null;

      const filtered = this.rows.filter((row) => {
        const rowStart = new Date(row.requestedStartAt || row.startAt || row.createdAt || Date.now());
        const rowEnd = new Date(row.requestedEndAt || row.endAt || row.createdAt || Date.now());
        const haystack = [
          row.truckName,
          row.startLocation,
          row.endLocation,
          row.note,
          row.issueReason,
          Array.isArray(row.warnings) ? row.warnings.join(' ') : ''
        ].join(' ').toLowerCase();

        if (text && !haystack.includes(text)) return false;
        if (truck !== 'all' && String(row.truckName || '') !== truck) return false;
        if (source !== 'all' && String(row.distanceSource || '') !== source) return false;
        if (warningMode === 'warning' && !(Array.isArray(row.warnings) && row.warnings.length)) return false;
        if (warningMode === 'clean' && Array.isArray(row.warnings) && row.warnings.length) return false;
        if (warningMode === 'issue' && String(row.status || 'ok') === 'ok') return false;
        if (warningMode === 'ok' && String(row.status || 'ok') !== 'ok') return false;
        if (startDate && rowEnd < startDate) return false;
        if (endDate && rowStart > endDate) return false;
        return true;
      });
      const dir = this.sortDir === 'asc' ? 1 : -1;
      const getValue = (row) => {
        switch (this.sortKey) {
          case 'truckName': return String(row.truckName || row.inputTruckName || '').toLowerCase();
          case 'requestedEndAt': return new Date(row.requestedEndAt || row.endAt || row.createdAt || 0).getTime();
          case 'kmTotal': return Number(row.kmTotal) || 0;
          case 'fuelStart': return Number(row.fuelStart) || 0;
          case 'fuelEnd': return Number(row.fuelEnd) || 0;
          case 'refillCount': return Number(row.refillCount) || 0;
          case 'fuelConsumedTotal': return Number(row.fuelConsumedTotal) || 0;
          case 'distanceSource': return String(row.distanceSource || '').toLowerCase();
          case 'status': return String(row.status || 'ok').toLowerCase();
          case 'note': return String(row.note || row.issueReason || '').toLowerCase();
          case 'rowNumber': return Number(row.sourceRow) || 0;
          case 'requestedStartAt':
          default:
            return new Date(row.requestedStartAt || row.startAt || row.createdAt || 0).getTime();
        }
      };
      return filtered.sort((a, b) => {
        const va = getValue(a);
        const vb = getValue(b);
        if (typeof va === 'string' || typeof vb === 'string') return String(va).localeCompare(String(vb), 'fr') * dir;
        return ((Number(va) || 0) - (Number(vb) || 0)) * dir;
      });
    }


    getRowId(row) {
      return String((row && (row.id || row._id)) || '');
    }

    pruneSelection() {
      const valid = new Set(this.rows.map((row) => this.getRowId(row)).filter(Boolean));
      Array.from(this.selectedRowIds).forEach((id) => {
        if (!valid.has(String(id))) this.selectedRowIds.delete(String(id));
      });
    }

    toggleRowSelection(id, checked) {
      const key = String(id || '');
      if (!key) return;
      if (checked) this.selectedRowIds.add(key);
      else this.selectedRowIds.delete(key);
      this.updateSelectionUi();
      if (this.rowsBody) this.renderRows();
    }

    toggleSelectCurrentPage(checked) {
      this.getPageRows().forEach((row) => {
        const id = this.getRowId(row);
        if (!id) return;
        if (checked) this.selectedRowIds.add(id);
        else this.selectedRowIds.delete(id);
      });
      this.updateSelectionUi();
      if (this.rowsBody) this.renderRows();
    }

    toggleSelectAllFiltered() {
      const selectableIds = this.filteredRows.map((row) => this.getRowId(row)).filter(Boolean);
      if (!selectableIds.length) return;
      const allSelected = selectableIds.every((id) => this.selectedRowIds.has(id));
      selectableIds.forEach((id) => {
        if (allSelected) this.selectedRowIds.delete(id);
        else this.selectedRowIds.add(id);
      });
      this.updateSelectionUi();
      if (this.rowsBody) this.renderRows();
    }

    clearSelection() {
      this.selectedRowIds.clear();
      this.updateSelectionUi();
      if (this.rowsBody) this.renderRows();
    }

    updateSelectionUi() {
      if (this.selectedCountEl) {
        this.selectedCountEl.textContent = `${this.selectedRowIds.size} ligne(s) sélectionnée(s)`;
      }
      const filteredIds = this.filteredRows.map((row) => this.getRowId(row)).filter(Boolean);
      const allFilteredSelected = filteredIds.length && filteredIds.every((id) => this.selectedRowIds.has(id));
      if (this.selectAllFilteredBtn) {
        this.selectAllFilteredBtn.innerHTML = allFilteredSelected
          ? '<i class="fa-solid fa-square-minus"></i> Tout désélectionner (filtre)'
          : '<i class="fa-solid fa-check-double"></i> Tout sélectionner (filtre)';
        this.selectAllFilteredBtn.disabled = !filteredIds.length;
      }
      if (this.clearSelectionBtn) this.clearSelectionBtn.disabled = this.selectedRowIds.size === 0;
      if (this.deleteSelectedBtn) this.deleteSelectedBtn.disabled = this.selectedRowIds.size === 0;

      const pageIds = this.getPageRows().map((row) => this.getRowId(row)).filter(Boolean);
      const selectedOnPage = pageIds.filter((id) => this.selectedRowIds.has(id)).length;
      if (this.selectPageCheckbox) {
        this.selectPageCheckbox.checked = pageIds.length > 0 && selectedOnPage == pageIds.length;
        this.selectPageCheckbox.indeterminate = selectedOnPage > 0 && selectedOnPage < pageIds.length;
        this.selectPageCheckbox.disabled = !pageIds.length;
      }
    }

    async deleteRows(ids, confirmMessage) {
      const normalized = Array.from(new Set((Array.isArray(ids) ? ids : []).map((id) => String(id || '')).filter(Boolean)));
      if (!normalized.length) return;
      if (confirmMessage && !window.confirm(confirmMessage)) return;
      try {
        let deletedCount = 0;
        if (normalized.length === 1) {
          const res = await fetch(this.api('/api/transport-report/delete'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: normalized[0] })
          });
          const json = await res.json();
          if (!res.ok) throw new Error(json.error || 'Suppression impossible');
          deletedCount = Number(json.deletedCount || 1) || 1;
        } else {
          const res = await fetch(this.api('/api/transport-report/delete'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ids: normalized })
          });
          let json = null;
          try { json = await res.json(); } catch (_) { json = null; }
          if (!res.ok) {
            deletedCount = 0;
            for (const id of normalized) {
              const singleRes = await fetch(this.api('/api/transport-report/delete'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id })
              });
              let singleJson = null;
              try { singleJson = await singleRes.json(); } catch (_) { singleJson = null; }
              if (!singleRes.ok) throw new Error((singleJson && singleJson.error) || (json && json.error) || 'Suppression multiple impossible');
              deletedCount += Number((singleJson && singleJson.deletedCount) || 1) || 1;
            }
          } else {
            deletedCount = Number((json && json.deletedCount) || normalized.length) || normalized.length;
          }
        }
        normalized.forEach((id) => this.selectedRowIds.delete(id));
        this.showToast(`${deletedCount} ligne(s) supprimée(s)`, 'success');
        await this.loadRows();
      } catch (error) {
        this.showToast(error.message || 'Erreur suppression', 'error');
      }
    }

    async deleteSelectedRows() {
      const ids = Array.from(this.selectedRowIds);
      if (!ids.length) return;
      await this.deleteRows(ids, `Supprimer ${ids.length} ligne(s) sélectionnée(s) du rapport transport ?`);
    }

    applyFilters(resetPage = true) {
      this.filteredRows = this.getFilteredRows();
      if (resetPage) this.currentPage = 1;
      const totalPages = Math.max(1, Math.ceil(this.filteredRows.length / this.perPage));
      if (this.currentPage > totalPages) this.currentPage = totalPages;
      this.renderSummary();
      this.pruneSelection();
      this.renderRows();
      this.renderPagination();
      this.updateSelectionUi();
      this.queueLocationHydration(false);
    }

    clearFilters() {
      if (this.filterText) this.filterText.value = '';
      if (this.filterTruck) this.filterTruck.value = 'all';
      if (this.filterStart) this.filterStart.value = '';
      if (this.filterEnd) this.filterEnd.value = '';
      if (this.filterSource) this.filterSource.value = 'all';
      if (this.filterWarning) this.filterWarning.value = 'all';
      this.applyFilters(true);
    }

    renderSummary() {
      if (!this.summaryGrid) return;
      const count = this.filteredRows.length;
      const totalKm = this.filteredRows.reduce((sum, row) => sum + (Number(row.kmTotal) || 0), 0);
      const totalFuel = this.filteredRows.reduce((sum, row) => sum + (Number(row.fuelConsumedTotal) || 0), 0);
      const totalRefills = this.filteredRows.reduce((sum, row) => sum + (Number(row.refillCount) || 0), 0);
      const warningCount = this.filteredRows.reduce((sum, row) => sum + ((Array.isArray(row.warnings) && row.warnings.length) ? 1 : 0), 0);

      this.summaryGrid.innerHTML = `
        <div class="transport-summary-card accent">
          <div class="transport-summary-label">Lignes</div>
          <div class="transport-summary-value">${this.formatNumber(count, 0)}</div>
        </div>
        <div class="transport-summary-card">
          <div class="transport-summary-label">KM</div>
          <div class="transport-summary-value">${this.formatNumber(totalKm)}</div>
        </div>
        <div class="transport-summary-card">
          <div class="transport-summary-label">Gasoil</div>
          <div class="transport-summary-value">${this.formatNumber(totalFuel)} L</div>
        </div>
        <div class="transport-summary-card">
          <div class="transport-summary-label">Pleins</div>
          <div class="transport-summary-value">${this.formatNumber(totalRefills, 0)}</div>
        </div>
        <div class="transport-summary-card">
          <div class="transport-summary-label">Alertes</div>
          <div class="transport-summary-value">${this.formatNumber(warningCount, 0)}</div>
        </div>
      `;

      if (this.resultsMeta) {
        const totalPages = Math.max(1, Math.ceil(Math.max(this.filteredRows.length, 1) / this.perPage));
        this.resultsMeta.textContent = `${this.filteredRows.length} ligne(s) après filtre • ${totalPages} page(s)`;
      }
    }

    getPageRows() {
      const start = (this.currentPage - 1) * this.perPage;
      return this.filteredRows.slice(start, start + this.perPage);
    }

    renderRows() {
      if (!this.rowsBody) return;
      const pageRows = this.getPageRows();
      if (!pageRows.length) {
        this.rowsBody.innerHTML = '<tr><td colspan="14" class="transport-empty-row">Aucune ligne ne correspond aux filtres.</td></tr>';
        this.updateSortIndicators();
        return;
      }

      const rowNumberStart = (this.currentPage - 1) * this.perPage;
      this.rowsBody.innerHTML = pageRows.map((row, index) => {
        const sourceClass = row.distanceSource === 'odometer' ? 'odometer' : 'gps-distance';
        const refillLabel = Number(row.refillCount || 0)
          ? `${this.formatNumber(row.refillCount, 0)} / +${this.formatNumber(row.fuelAddedDuringTrip)} L`
          : '0';
        const confidenceList = Array.isArray(row.refills) ? row.refills.map((refill) => Number(refill.confidence)).filter((value) => Number.isFinite(value)) : [];
        const avgConfidence = confidenceList.length ? Math.round((confidenceList.reduce((sum, value) => sum + value, 0) / confidenceList.length) * 100) : null;
        const warningBlock = Array.isArray(row.warnings) && row.warnings.length
          ? `<div class="transport-row-sub" style="margin-top:6px; color:#b45309;">${this.escapeHtml(row.warnings.join(' • '))}</div>`
          : '';
        const startParts = this.splitDateTime(row.requestedStartAt || row.startAt);
        const endParts = this.splitDateTime(row.requestedEndAt || row.endAt);
        const startLabel = this.getDisplayLocation(row.startLocation || '-');
        const endLabel = this.getDisplayLocation(row.endLocation || '-');
        const isIssue = String(row.status || 'ok') !== 'ok';
        const statusLabel = isIssue ? (row.issueReason || 'À revoir') : 'Calculée';
        const rowId = this.getRowId(row);
        const isSelected = rowId ? this.selectedRowIds.has(rowId) : false;
        return `
          <tr class="${isIssue ? 'transport-row-issue' : ''} ${isSelected ? 'transport-row-selected' : ''}">
            <td class="transport-select-col"><input type="checkbox" class="transport-checkbox" data-row-select="${this.escapeHtml(rowId)}" ${isSelected ? 'checked' : ''}></td>
            <td><div class="transport-row-title">${rowNumberStart + index + 1}</div></td>
            <td>
              <div class="transport-row-title">${this.escapeHtml(row.truckName || row.inputTruckName || '-')}</div>
              <div class="transport-row-sub route"><i class="fa-solid fa-location-dot"></i><span>${this.escapeHtml(startLabel || '-')} → ${this.escapeHtml(endLabel || '-')}</span></div>
            </td>
            <td>
              <div class="transport-row-title">${this.escapeHtml(startParts.date)}</div>
              <div class="transport-row-sub">${this.escapeHtml(startParts.time)}</div>
            </td>
            <td>
              <div class="transport-row-title">${this.escapeHtml(endParts.date)}</div>
              <div class="transport-row-sub">${this.escapeHtml(endParts.time)}</div>
            </td>
            <td>
              <div class="transport-row-title">${this.formatNumber(row.kmTotal)}</div>
              <div class="transport-row-sub">GPS: ${this.formatNumber(row.gpsDistanceKm || 0)}</div>
            </td>
            <td>${this.formatNumber(row.fuelStart)} L</td>
            <td>${this.formatNumber(row.fuelEnd)} L</td>
            <td>
              <div class="transport-row-title">${refillLabel}</div>
              <div class="transport-row-sub">${avgConfidence !== null ? `Fiabilité: ${avgConfidence}%` : '—'}</div>
            </td>
            <td>
              <div class="transport-row-title">${this.formatNumber(row.fuelConsumedTotal)} L</div>
              <div class="transport-row-sub">Brut: ${this.formatNumber(row.fuelConsumedRaw)} L</div>
            </td>
            <td><span class="transport-source ${sourceClass}">${row.distanceSource === 'odometer' ? '<i class="fa-solid fa-road"></i> Odomètre' : '<i class="fa-solid fa-location-dot"></i> Trace GPS'}</span></td>
            <td><span class="transport-source ${isIssue ? 'issue' : 'ok'}">${isIssue ? '<i class="fa-solid fa-triangle-exclamation"></i>' : '<i class="fa-solid fa-check"></i>'} ${this.escapeHtml(statusLabel)}</span></td>
            <td>
              <div>${this.escapeHtml(row.note || '-')}</div>
              ${warningBlock}
            </td>
            <td>
              <div class="transport-actions">
                <button class="transport-small-btn" data-row-action="edit" data-row-id="${this.escapeHtml(row.id || row._id || '')}"><i class="fa-solid fa-pen"></i> Modifier</button>
                ${isIssue ? `<button class="transport-small-btn warn" data-row-action="retry" data-row-id="${this.escapeHtml(row.id || row._id || '')}"><i class="fa-solid fa-wand-magic-sparkles"></i> Recheck</button>` : ''}
                <button class="transport-small-btn danger" data-row-action="delete" data-row-id="${this.escapeHtml(row.id || row._id || '')}"><i class="fa-solid fa-trash"></i> Supprimer</button>
              </div>
            </td>
          </tr>
        `;
      }).join('');
      this.updateSortIndicators();
    }

    renderPagination() {
      const totalRows = this.filteredRows.length;
      const totalPages = Math.max(1, Math.ceil(Math.max(totalRows, 1) / this.perPage));
      if (this.prevPageBtn) this.prevPageBtn.disabled = this.currentPage <= 1;
      if (this.nextPageBtn) this.nextPageBtn.disabled = this.currentPage >= totalPages;
      if (this.pageMetaEl) this.pageMetaEl.textContent = `Page ${this.currentPage} / ${totalPages} • ${totalRows} ligne(s)`;
      if (!this.pageNumbersEl) return;

      const pages = [];
      const start = Math.max(1, this.currentPage - 2);
      const end = Math.min(totalPages, this.currentPage + 2);
      for (let page = start; page <= end; page += 1) pages.push(page);

      this.pageNumbersEl.innerHTML = pages.map((page) => `
        <button class="transport-page-btn ${page === this.currentPage ? 'active' : ''}" data-page-number="${page}">${page}</button>
      `).join('');

      this.pageNumbersEl.querySelectorAll('[data-page-number]').forEach((btn) => {
        btn.addEventListener('click', () => this.changePage(Number(btn.dataset.pageNumber)));
      });
    }

    changePage(page) {
      const totalPages = Math.max(1, Math.ceil(Math.max(this.filteredRows.length, 1) / this.perPage));
      const nextPage = Math.min(totalPages, Math.max(1, Number(page) || 1));
      if (nextPage === this.currentPage) return;
      this.currentPage = nextPage;
      this.renderRows();
      this.renderPagination();
      this.updateSelectionUi();
      this.queueLocationHydration(false);
      if (this.rowsBody) this.rowsBody.closest('.transport-table-wrap').scrollTop = 0;
    }

    async deleteRow(id) {
      if (!id) return;
      await this.deleteRows([id], 'Supprimer cette ligne du rapport transport ?');
    }

    async rebuildRefuels(purgeExistingAuto) {
      const btn = purgeExistingAuto ? this.cleanRebuildBtn : this.rebuildBtn;
      const originalText = btn ? btn.innerHTML : '';
      try {
        if (purgeExistingAuto && !window.confirm('Nettoyer les pleins auto déjà enregistrés sur cette période, puis relancer un re-scan strict ?')) return;
        const payload = this.getFormPayload();
        if (btn) {
          btn.disabled = true;
          btn.innerHTML = purgeExistingAuto
            ? '<i class="fa-solid fa-circle-notch fa-spin"></i> Nettoyage...'
            : '<i class="fa-solid fa-circle-notch fa-spin"></i> Analyse GPS...';
        }
        const res = await fetch(this.api('/api/refuels/rebuild'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...payload, persist: true, purgeExistingAuto: !!purgeExistingAuto })
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Erreur re-scan GPS');
        const deletedText = purgeExistingAuto ? ` • supprimés: ${json.deletedCount || 0}` : '';
        this.showToast(`Pleins retenus: ${json.detected || 0} • créés: ${json.createdCount || 0}${deletedText}`, 'success');
        if (typeof window.ui !== 'undefined' && window.ui && typeof window.ui.fetchAndRenderRefuels === 'function') {
          window.ui.fetchAndRenderRefuels();
        }
        if (this.preview) await this.calculate(false);
      } catch (error) {
        this.showToast(error.message || 'Erreur re-scan GPS', 'error');
      } finally {
        if (btn) {
          btn.disabled = false;
          btn.innerHTML = originalText;
        }
      }
    }

    async rebuildFromReportFilters(purgeExistingAuto = false) {
      const startInput = document.getElementById('refuelDateStart');
      const endInput = document.getElementById('refuelDateEnd');
      const searchInput = document.getElementById('refuelTruckSearch');
      const btn = purgeExistingAuto ? document.getElementById('cleanupFuelLogsBtn') : document.getElementById('rebuildFuelLogsBtn');
      const originalText = btn ? btn.innerHTML : '';
      try {
        if (!this.trucks.length) await this.loadTrucks();
        const rawTruck = searchInput ? searchInput.value.trim().toLowerCase() : '';
        if (!startInput || !endInput || !startInput.value || !endInput.value) throw new Error('Choisissez la période dans le rapport carburant avant le re-scan.');
        const start = `${startInput.value} 00:00:00`;
        const end = `${endInput.value} 23:59:59`;
        const matchedTruck = rawTruck
          ? (this.trucks.find((item) => item.name.toLowerCase() === rawTruck)
            || this.trucks.find((item) => item.name.toLowerCase().startsWith(rawTruck))
            || this.trucks.find((item) => item.name.toLowerCase().includes(rawTruck)))
          : null;
        const deviceIds = matchedTruck ? [matchedTruck.id] : [];
        const label = matchedTruck ? matchedTruck.name : 'toute la flotte';
        const message = purgeExistingAuto
          ? `Nettoyer les pleins auto puis relancer une analyse complète pour ${label} sur ${startInput.value} → ${endInput.value} ?`
          : `Relancer une analyse complète pour ${label} sur ${startInput.value} → ${endInput.value} ?`;
        if (!window.confirm(message)) return;

        if (btn) {
          btn.disabled = true;
          btn.innerHTML = purgeExistingAuto ? '<i class="fa-solid fa-circle-notch fa-spin"></i> Nettoyage + analyse...' : '<i class="fa-solid fa-circle-notch fa-spin"></i> Analyse complète...';
        }

        const res = await fetch(this.api('/api/refuels/rebuild-bulk'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ start, end, deviceIds, persist: true, purgeExistingAuto: !!purgeExistingAuto })
        });
        const rawText = await res.text();
        let json = {};
        try {
          json = rawText ? JSON.parse(rawText) : {};
        } catch (parseError) {
          const preview = String(rawText || '').trim().slice(0, 120);
          if (preview.toLowerCase().startsWith('not found') || preview.toLowerCase().includes('cannot post')) {
            throw new Error('Le serveur actif ne possède pas encore la route /api/refuels/rebuild-bulk. Remplace server.js par la version patchée puis redémarre Node.');
          }
          if (preview.startsWith('<!DOCTYPE') || preview.startsWith('<html')) {
            throw new Error("Le serveur a renvoyé une page HTML au lieu de JSON. Vérifie l'URL serveur et redémarre le backend patché.");
          }
          throw new Error(`Réponse serveur non JSON: ${preview || 'vide'}`);
        }
        if (!res.ok) throw new Error(json.error || 'Erreur re-scan GPS');
        const summary = json.summary || {};
        this.showToast(`Re-scan terminé • ${summary.successCount || 0}/${summary.targetCount || 0} camion(s) • retenus ${summary.detected || 0} • créés ${summary.createdCount || 0} • doublons supprimés ${summary.duplicateDeletedCount || 0}`, summary.failed && summary.failed.length ? 'info' : 'success');
        if (summary.failed && summary.failed.length) {
          this.showToast(`Échecs: ${summary.failed.slice(0, 3).map((item) => `${item.truckName}: ${item.error}`).join(' | ')}${summary.failed.length > 3 ? ' ...' : ''}`, 'error');
        }
        if (typeof window.ui !== 'undefined' && window.ui && typeof window.ui.fetchAndRenderRefuels === 'function') {
          await window.ui.fetchAndRenderRefuels();
        }
      } catch (error) {
        this.showToast(error.message || 'Erreur re-scan GPS', 'error');
      } finally {
        if (btn) {
          btn.disabled = false;
          btn.innerHTML = originalText;
        }
      }
    }

    cleanupFromReportFilters() {
      return this.rebuildFromReportFilters(true);
    }


    toggleSort(key) {
      if (!key) return;
      if (this.sortKey === key) this.sortDir = this.sortDir === 'asc' ? 'desc' : 'asc';
      else {
        this.sortKey = key;
        this.sortDir = key === 'requestedStartAt' ? 'desc' : 'asc';
      }
      this.applyFilters(false);
    }

    updateSortIndicators() {
      if (!Array.isArray(this.sortHeaders)) return;
      this.sortHeaders.forEach((header) => {
        const active = header.dataset.sort === this.sortKey;
        header.classList.toggle('sorted-asc', active && this.sortDir === 'asc');
        header.classList.toggle('sorted-desc', active && this.sortDir === 'desc');
      });
    }

    async persistImportIssueRow(row, reason) {
      const payload = {
        truckName: row.matchedTruck ? row.matchedTruck.name : (row.truckInput || ''),
        inputTruckName: row.truckInput || '',
        deviceId: row.matchedTruck ? row.matchedTruck.id : '',
        requestedStartAt: row.startDate,
        requestedEndAt: row.endDate,
        startAt: row.startDate,
        endAt: row.endDate,
        note: row.note || '',
        warnings: [],
        status: 'issue',
        issueReason: reason || row.issueReason || 'Ligne non calculée',
        issueCategory: row.issueCategory || 'import-error',
        issueDetails: {
          pointLoading: row.pointLoading || '',
          pointUnloading: row.pointUnloading || '',
          client: row.client || '',
          driver: row.driver || ''
        },
        sourceType: 'import-exception',
        sourceFileName: row.sourceFileName || (this.importFile ? this.importFile.name : ''),
        sourceRow: row.sourceRow,
        importFingerprint: row.fingerprint || this.buildRowFingerprint(row.truckInput || '', row.startDate, row.endDate)
      };
      const res = await fetch(this.api('/api/transport-report/import-issue'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Sauvegarde historique impossible');
      return json.row;
    }

    async retryIssueRows(ids = null) {
      const targetIds = Array.isArray(ids) && ids.length ? ids : this.filteredRows.filter((row) => String(row.status || 'ok') !== 'ok').map((row) => row.id || row._id).filter(Boolean);
      if (!targetIds.length) {
        this.showToast('Aucune ligne à revoir à rechecker.', 'info');
        return;
      }
      if (!window.confirm(`Relancer le calcul GPS sur ${targetIds.length} ligne(s) à revoir ?`)) return;
      const original = this.retryIssuesBtn ? this.retryIssuesBtn.innerHTML : '';
      try {
        if (this.retryIssuesBtn && (!ids || !ids.length)) {
          this.retryIssuesBtn.disabled = true;
          this.retryIssuesBtn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Recheck...';
        }
        const res = await fetch(this.api('/api/transport-report/retry-issues'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ids: targetIds })
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Recheck impossible');
        const summary = json.summary || {};
        this.showToast(`Recheck terminé • ${summary.successCount || 0} corrigée(s) • ${summary.failedCount || 0} encore à revoir`, summary.failedCount ? 'info' : 'success');
        await this.loadRows();
      } catch (error) {
        this.showToast(error.message || 'Recheck impossible', 'error');
      } finally {
        if (this.retryIssuesBtn && (!ids || !ids.length)) {
          this.retryIssuesBtn.disabled = false;
          this.retryIssuesBtn.innerHTML = original;
        }
      }
    }

    openEditModal(rowId) {
      const row = this.rows.find((item) => String(item.id || item._id) === String(rowId));
      if (!row || !this.editModal) return;
      this.editingRow = row;
      if (this.editTitleEl) this.editTitleEl.textContent = `Modifier ${row.truckName || row.inputTruckName || 'ligne'}`;
      if (this.editTruck) {
        this.editTruck.innerHTML = '<option value="">-- Choisir un camion --</option>' + this.trucks.map((truck) => `<option value="${truck.id}" data-name="${this.escapeHtml(truck.name)}">${this.escapeHtml(truck.name)}</option>`).join('');
        const currentTruck = this.trucks.find((truck) => truck.id === row.deviceId || truck.name === row.truckName || truck.name === row.inputTruckName);
        this.editTruck.value = currentTruck ? currentTruck.id : '';
      }
      if (this.editStart) this.editStart.value = this.toDatetimeLocal(row.requestedStartAt || row.startAt || new Date());
      if (this.editEnd) this.editEnd.value = this.toDatetimeLocal(row.requestedEndAt || row.endAt || new Date());
      if (this.editKm) this.editKm.value = Number(row.kmTotal || 0);
      if (this.editFuelStart) this.editFuelStart.value = Number(row.fuelStart || 0);
      if (this.editFuelEnd) this.editFuelEnd.value = Number(row.fuelEnd || 0);
      if (this.editFuelAdded) this.editFuelAdded.value = Number(row.fuelAddedDuringTrip || 0);
      if (this.editFuelConsumed) this.editFuelConsumed.value = Number(row.fuelConsumedTotal || 0);
      if (this.editStartLocation) this.editStartLocation.value = row.startLocation || '';
      if (this.editEndLocation) this.editEndLocation.value = row.endLocation || '';
      if (this.editStatus) this.editStatus.value = row.status || 'ok';
      if (this.editIssueReason) this.editIssueReason.value = row.issueReason || '';
      if (this.editNote) this.editNote.value = row.note || '';
      this.editModal.style.display = 'flex';
    }

    closeEditModal() {
      if (this.editModal) this.editModal.style.display = 'none';
      this.editingRow = null;
    }

    async saveEditModal(recalculate) {
      if (!this.editingRow) return;
      const truckId = this.editTruck ? this.editTruck.value : '';
      const selected = this.editTruck && this.editTruck.selectedOptions ? this.editTruck.selectedOptions[0] : null;
      const truckName = selected && selected.dataset ? selected.dataset.name : (this.editingRow.truckName || this.editingRow.inputTruckName || '');
      const payload = {
        id: this.editingRow.id || this.editingRow._id,
        action: recalculate ? 'recalculate' : 'manual-save',
        deviceId: truckId || this.editingRow.deviceId || '',
        truckName,
        inputTruckName: truckName || this.editingRow.inputTruckName || this.editingRow.truckName || '',
        start: this.editStart ? this.toGpsDatetime(this.editStart.value) : '',
        end: this.editEnd ? this.toGpsDatetime(this.editEnd.value) : '',
        requestedStartAt: this.editStart ? this.editStart.value : null,
        requestedEndAt: this.editEnd ? this.editEnd.value : null,
        kmTotal: this.editKm ? this.editKm.value : 0,
        fuelStart: this.editFuelStart ? this.editFuelStart.value : 0,
        fuelEnd: this.editFuelEnd ? this.editFuelEnd.value : 0,
        fuelAddedDuringTrip: this.editFuelAdded ? this.editFuelAdded.value : 0,
        fuelConsumedTotal: this.editFuelConsumed ? this.editFuelConsumed.value : 0,
        startLocation: this.editStartLocation ? this.editStartLocation.value.trim() : '',
        endLocation: this.editEndLocation ? this.editEndLocation.value.trim() : '',
        status: this.editStatus ? this.editStatus.value : 'ok',
        issueReason: this.editIssueReason ? this.editIssueReason.value.trim() : '',
        note: this.editNote ? this.editNote.value.trim() : ''
      };
      const btn = recalculate ? this.editRecalcBtn : this.editSaveBtn;
      const original = btn ? btn.innerHTML : '';
      try {
        if (btn) {
          btn.disabled = true;
          btn.innerHTML = recalculate ? '<i class="fa-solid fa-circle-notch fa-spin"></i> Recalcul...' : '<i class="fa-solid fa-circle-notch fa-spin"></i> Sauvegarde...';
        }
        const res = await fetch(this.api('/api/transport-report/update'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Sauvegarde impossible');
        this.showToast(recalculate ? 'Ligne recalculée puis sauvegardée' : 'Ligne sauvegardée', 'success');
        this.closeEditModal();
        await this.loadRows();
      } catch (error) {
        this.showToast(error.message || 'Sauvegarde impossible', 'error');
      } finally {
        if (btn) {
          btn.disabled = false;
          btn.innerHTML = original;
        }
      }
    }

    async exportCsv() {
      const exportRows = Array.isArray(this.filteredRows) ? this.filteredRows : [];
      if (!exportRows.length) {
        this.showToast('Aucune ligne à exporter', 'error');
        return;
      }

      const originalText = this.exportBtn ? this.exportBtn.innerHTML : '';
      try {
        if (this.exportBtn) {
          this.exportBtn.disabled = true;
          this.exportBtn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Export...';
        }

        await this.hydrateLocationTargets(exportRows.flatMap((row) => [row.startLocation, row.endLocation]));

        const columns = [
          { title: 'Camion', width: 90, type: 'String', value: (row) => row.truckName || '' },
          { title: 'DH départ', width: 130, type: 'String', value: (row) => this.formatDateTime(row.requestedStartAt || row.startAt) },
          { title: 'DH fin', width: 130, type: 'String', value: (row) => this.formatDateTime(row.requestedEndAt || row.endAt) },
          { title: 'KM totale', width: 90, type: 'Number', value: (row) => Number(row.kmTotal) || 0 },
          { title: 'Carburant départ', width: 105, type: 'Number', value: (row) => Number(row.fuelStart) || 0 },
          { title: 'Carburant fin', width: 95, type: 'Number', value: (row) => Number(row.fuelEnd) || 0 },
          { title: 'Pleins détectés', width: 85, type: 'Number', value: (row) => Number(row.refillCount) || 0 },
          { title: 'Litres ajoutés', width: 100, type: 'Number', value: (row) => Number(row.fuelAddedDuringTrip) || 0 },
          { title: 'Consommation gasoil', width: 115, type: 'Number', value: (row) => Number(row.fuelConsumedTotal) || 0 },
          { title: 'Source KM', width: 85, type: 'String', value: (row) => row.distanceSource === 'odometer' ? 'Odomètre' : 'Trace GPS' },
          { title: 'Observation', width: 180, type: 'String', value: (row) => row.note || '' },
          { title: 'Lieu départ', width: 220, type: 'String', value: (row) => this.getDisplayLocation(row.startLocation || '') },
          { title: 'Lieu fin', width: 240, type: 'String', value: (row) => this.getDisplayLocation(row.endLocation || '') }
        ];

        const xmlEscape = (value) => String(value ?? '')
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&apos;');

        const headerCells = columns.map((col) => `<Cell ss:StyleID="sHeader"><Data ss:Type="String">${xmlEscape(col.title)}</Data></Cell>`).join('');
        const dataRows = exportRows.map((row) => {
          const cells = columns.map((col) => {
            const rawValue = col.value(row);
            if (col.type === 'Number') {
              const num = Number(rawValue);
              return `<Cell ss:StyleID="sNumber"><Data ss:Type="Number">${Number.isFinite(num) ? num : 0}</Data></Cell>`;
            }
            return `<Cell ss:StyleID="sText"><Data ss:Type="String">${xmlEscape(rawValue)}</Data></Cell>`;
          }).join('');
          return `<Row>${cells}</Row>`;
        }).join('');

        const xml = `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:html="http://www.w3.org/TR/REC-html40">
  <Styles>
    <Style ss:ID="Default" ss:Name="Normal">
      <Alignment ss:Vertical="Center"/>
      <Borders/>
      <Font ss:FontName="Segoe UI" ss:Size="10"/>
      <Interior/>
      <NumberFormat/>
      <Protection/>
    </Style>
    <Style ss:ID="sHeader">
      <Font ss:Bold="1" ss:Color="#0F172A"/>
      <Interior ss:Color="#E2E8F0" ss:Pattern="Solid"/>
      <Borders>
        <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CBD5E1"/>
        <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CBD5E1"/>
        <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CBD5E1"/>
        <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CBD5E1"/>
      </Borders>
    </Style>
    <Style ss:ID="sText">
      <Alignment ss:Vertical="Top" ss:WrapText="1"/>
      <Borders>
        <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
      </Borders>
    </Style>
    <Style ss:ID="sNumber">
      <Alignment ss:Horizontal="Right" ss:Vertical="Center"/>
      <Borders>
        <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
      </Borders>
      <NumberFormat ss:Format="0.00"/>
    </Style>
  </Styles>
  <Worksheet ss:Name="Rapport Transport">
    <Table ss:ExpandedColumnCount="${columns.length}" ss:ExpandedRowCount="${exportRows.length + 1}" x:FullColumns="1" x:FullRows="1">
      ${columns.map((col) => `<Column ss:Width="${col.width}"/>`).join('')}
      <Row ss:Height="22">${headerCells}</Row>
      ${dataRows}
    </Table>
    <WorksheetOptions xmlns="urn:schemas-microsoft-com:office:excel">
      <FreezePanes/>
      <FrozenNoSplit/>
      <SplitHorizontal>1</SplitHorizontal>
      <TopRowBottomPane>1</TopRowBottomPane>
      <ActivePane>2</ActivePane>
      <Panes>
        <Pane><Number>3</Number></Pane>
        <Pane><Number>2</Number></Pane>
      </Panes>
      <ProtectObjects>False</ProtectObjects>
      <ProtectScenarios>False</ProtectScenarios>
    </WorksheetOptions>
  </Worksheet>
</Workbook>`;

        const blob = new Blob([xml], { type: 'application/vnd.ms-excel;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `rapport-transport-filtre-${new Date().toISOString().slice(0, 10)}.xls`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
        this.showToast('Export Excel filtré généré', 'success');
      } finally {
        if (this.exportBtn) {
          this.exportBtn.disabled = false;
          this.exportBtn.innerHTML = originalText;
        }
      }
    }


    showToast(message, type) {
      const toast = document.createElement('div');
      toast.className = 'transport-toast';
      if (type === 'error') toast.style.background = '#7f1d1d';
      if (type === 'success') toast.style.background = '#166534';
      if (type === 'info') toast.style.background = '#075985';
      toast.textContent = message;
      document.body.appendChild(toast);
      setTimeout(() => toast.remove(), 3600);
    }
  }

  window.transportReportSection = new TransportReportSection();
})();
