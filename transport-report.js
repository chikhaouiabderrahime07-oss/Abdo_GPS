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
          .transport-form-grid { grid-template-columns: repeat(2, minmax(180px, 1fr)); }
          .transport-filter-grid { grid-template-columns: repeat(3, minmax(120px, 1fr)); }
        }
        @media (max-width: 900px) {
          .transport-card-header,
          .transport-card-body { padding:10px 12px; }
          .transport-form-grid,
          .transport-filter-grid { grid-template-columns: 1fr; }
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
              <div class="transport-badge"><i class="fa-solid fa-layer-group"></i> Vue compacte • 20 / page</div>
            </div>
            <div class="transport-card-body">
              <div class="transport-form-grid">
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
                <div class="form-group">
                  <label>Observation</label>
                  <input type="text" id="transportNoteInput" placeholder="Ex: Livraison Alger - Biskra">
                </div>
              </div>

              <div class="transport-action-row">
                <button class="btn-primary transport-btn-accent" id="transportCalcBtn"><i class="fa-solid fa-calculator"></i> Calculer</button>
                <button class="btn-primary transport-btn-info" id="transportSaveBtn"><i class="fa-solid fa-floppy-disk"></i> Ajouter</button>
                <button class="btn-secondary" id="transportReloadBtn"><i class="fa-solid fa-rotate"></i> Actualiser</button>
                <button class="btn-secondary" id="transportExportBtn"><i class="fa-solid fa-file-csv"></i> Export filtré</button>
                <button class="btn-secondary" id="transportRebuildBtn"><i class="fa-solid fa-arrows-rotate"></i> Re-scan GPS</button>
                <button class="btn-secondary transport-btn-warning" id="transportCleanRebuildBtn"><i class="fa-solid fa-broom"></i> Nettoyer auto + re-scan</button>
              </div>

              <div id="transportPreview" class="transport-preview-empty">Choisissez un camion, une période, puis cliquez sur <strong>Calculer</strong> pour préparer la ligne avant ajout.</div>
            </div>
          </div>

          <div class="transport-card">
            <div class="transport-card-header">
              <div>
                <h3 class="transport-title"><i class="fa-solid fa-table-list"></i> Feuille enregistrée</h3>
              </div>
              <div class="transport-filter-chip"><i class="fa-solid fa-file-csv"></i> Export = tout le filtré</div>
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
                  </select>
                </div>
              </div>

              <div class="transport-toolbar">
                <button class="btn-secondary" id="transportApplyFiltersBtn"><i class="fa-solid fa-filter"></i> Appliquer</button>
                <button class="btn-secondary" id="transportClearFiltersBtn"><i class="fa-solid fa-rotate-left"></i> Réinitialiser</button>
              </div>

              <div class="transport-results-meta">
                <div id="transportResultsMeta">Chargement de la feuille...</div>
                <div class="transport-table-note">Tableau prioritaire • lecture compacte</div>
              </div>

              <div class="transport-table-wrap">
                <table class="transport-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Camion / trajet</th>
                      <th>DH départ</th>
                      <th>DH fin</th>
                      <th>KM totale</th>
                      <th>Carb. départ</th>
                      <th>Carb. fin</th>
                      <th>Pleins</th>
                      <th>Conso gasoil</th>
                      <th>Source KM</th>
                      <th>Observation</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody id="transportRowsBody">
                    <tr><td colspan="12" class="transport-empty-row"><i class="fa-solid fa-circle-notch fa-spin"></i> Chargement...</td></tr>
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
      this.resultsMeta = document.getElementById('transportResultsMeta');
      this.prevPageBtn = document.getElementById('transportPrevPageBtn');
      this.nextPageBtn = document.getElementById('transportNextPageBtn');
      this.pageNumbersEl = document.getElementById('transportPageNumbers');
      this.pageMetaEl = document.getElementById('transportPageMeta');
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
        });
      }
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

    htmlEscape(value) {
      return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
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
      this.rowsBody.innerHTML = '<tr><td colspan="12" class="transport-empty-row"><i class="fa-solid fa-circle-notch fa-spin"></i> Chargement...</td></tr>';
      try {
        const res = await fetch(this.api('/api/transport-report/rows'));
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Erreur chargement feuille');
        this.rows = Array.isArray(json) ? json : [];
        this.applyFilters(false);
        this.queueLocationHydration(false);
      } catch (error) {
        this.rowsBody.innerHTML = `<tr><td colspan="12" class="transport-empty-row" style="color:#b91c1c;">${this.escapeHtml(error.message || 'Erreur chargement feuille')}</td></tr>`;
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

      return this.rows.filter((row) => {
        const rowStart = new Date(row.requestedStartAt || row.startAt || row.createdAt || Date.now());
        const rowEnd = new Date(row.requestedEndAt || row.endAt || row.createdAt || Date.now());
        const haystack = [
          row.truckName,
          row.startLocation,
          row.endLocation,
          row.note,
          Array.isArray(row.warnings) ? row.warnings.join(' ') : ''
        ].join(' ').toLowerCase();

        if (text && !haystack.includes(text)) return false;
        if (truck !== 'all' && String(row.truckName || '') !== truck) return false;
        if (source !== 'all' && String(row.distanceSource || '') !== source) return false;
        if (warningMode === 'warning' && !(Array.isArray(row.warnings) && row.warnings.length)) return false;
        if (warningMode === 'clean' && Array.isArray(row.warnings) && row.warnings.length) return false;
        if (startDate && rowEnd < startDate) return false;
        if (endDate && rowStart > endDate) return false;
        return true;
      }).sort((a, b) => new Date(b.requestedStartAt || b.startAt || b.createdAt || 0) - new Date(a.requestedStartAt || a.startAt || a.createdAt || 0));
    }

    applyFilters(resetPage = true) {
      this.filteredRows = this.getFilteredRows();
      if (resetPage) this.currentPage = 1;
      const totalPages = Math.max(1, Math.ceil(this.filteredRows.length / this.perPage));
      if (this.currentPage > totalPages) this.currentPage = totalPages;
      this.renderSummary();
      this.renderRows();
      this.renderPagination();
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
        this.rowsBody.innerHTML = '<tr><td colspan="12" class="transport-empty-row">Aucune ligne ne correspond aux filtres.</td></tr>';
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
        return `
          <tr>
            <td><div class="transport-row-title">${rowNumberStart + index + 1}</div></td>
            <td>
              <div class="transport-row-title">${this.escapeHtml(row.truckName || '-')}</div>
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
            <td>
              <div>${this.escapeHtml(row.note || '-')}</div>
              ${warningBlock}
            </td>
            <td>
              <div class="transport-actions">
                <button class="transport-small-btn danger" data-row-action="delete" data-row-id="${this.escapeHtml(row.id || row._id || '')}"><i class="fa-solid fa-trash"></i> Supprimer</button>
              </div>
            </td>
          </tr>
        `;
      }).join('');
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
      this.queueLocationHydration(false);
      if (this.rowsBody) this.rowsBody.closest('.transport-table-wrap').scrollTop = 0;
    }

    async deleteRow(id) {
      if (!id) return;
      if (!window.confirm('Supprimer cette ligne du rapport transport ?')) return;
      try {
        const res = await fetch(this.api('/api/transport-report/delete'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id })
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Suppression impossible');
        this.showToast('Ligne supprimée', 'success');
        await this.loadRows();
      } catch (error) {
        this.showToast(error.message || 'Erreur suppression', 'error');
      }
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
      try {
        if (!this.trucks.length) await this.loadTrucks();
        const startInput = document.getElementById('refuelDateStart');
        const endInput = document.getElementById('refuelDateEnd');
        const searchInput = document.getElementById('refuelTruckSearch');
        const rawTruck = searchInput ? searchInput.value.trim().toLowerCase() : '';
        if (!startInput || !endInput || !startInput.value || !endInput.value) throw new Error('Choisissez la période dans le rapport carburant avant le re-scan.');

        const start = `${startInput.value} 00:00:00`;
        const end = `${endInput.value} 23:59:59`;
        const matchedTruck = rawTruck
          ? (this.trucks.find((item) => item.name.toLowerCase() === rawTruck)
            || this.trucks.find((item) => item.name.toLowerCase().startsWith(rawTruck))
            || this.trucks.find((item) => item.name.toLowerCase().includes(rawTruck)))
          : null;

        const targets = matchedTruck ? [matchedTruck] : this.trucks.slice();
        if (!targets.length) throw new Error('Aucun camion disponible pour le re-scan.');

        if (matchedTruck) {
          if (purgeExistingAuto && !window.confirm(`Supprimer les pleins auto existants de ${matchedTruck.name} sur la période, puis recalculer proprement ?`)) return;
        } else {
          const message = purgeExistingAuto
            ? `Supprimer les pleins auto existants puis recalculer tous les camions sur ${startInput.value} → ${endInput.value} ?`
            : `Relancer un re-scan strict sur tous les camions pour ${startInput.value} → ${endInput.value} ?`;
          if (!window.confirm(message)) return;
        }

        let totalCreated = 0;
        let totalDeleted = 0;
        let totalDetected = 0;
        let successCount = 0;
        const failed = [];

        for (const truck of targets) {
          try {
            const res = await fetch(this.api('/api/refuels/rebuild'), {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                deviceId: truck.id,
                truckName: truck.name,
                start,
                end,
                persist: true,
                purgeExistingAuto: !!purgeExistingAuto
              })
            });
            const json = await res.json();
            if (!res.ok) throw new Error(json.error || 'Erreur re-scan GPS');
            totalCreated += Number(json.createdCount || 0);
            totalDeleted += Number(json.deletedCount || 0);
            totalDetected += Number(json.detected || 0);
            successCount += 1;
          } catch (error) {
            failed.push(`${truck.name}: ${error.message || 'échec'}`);
          }
        }

        const prefix = matchedTruck ? `Re-scan ${matchedTruck.name}` : `Re-scan flotte (${successCount}/${targets.length})`;
        const deletedText = purgeExistingAuto ? ` • supprimés: ${totalDeleted}` : '';
        this.showToast(`${prefix}: retenus ${totalDetected} • créés ${totalCreated}${deletedText}`, failed.length ? 'info' : 'success');
        if (failed.length) {
          this.showToast(`Échecs: ${failed.slice(0, 3).join(' | ')}${failed.length > 3 ? ' ...' : ''}`, 'error');
        }
        if (typeof window.ui !== 'undefined' && window.ui && typeof window.ui.fetchAndRenderRefuels === 'function') {
          window.ui.fetchAndRenderRefuels();
        }
      } catch (error) {
        this.showToast(error.message || 'Erreur re-scan GPS', 'error');
      }
    }

    cleanupFromReportFilters() {
      return this.rebuildFromReportFilters(true);
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

        const headers = [
          'Camion',
          'DH départ',
          'DH fin',
          'KM totale',
          'Carburant départ',
          'Carburant fin',
          'Pleins détectés',
          'Litres ajoutés',
          'Consommation gasoil',
          'Source KM',
          'Observation',
          'Lieu départ',
          'Lieu fin'
        ];

        const toNumber = (value, digits = 2) => {
          const num = Number(value);
          return Number.isFinite(num) ? Number(num.toFixed(digits)) : 0;
        };

        const toInteger = (value) => {
          const num = Number(value);
          return Number.isFinite(num) ? Math.round(num) : 0;
        };

        const formatExportDate = (value) => {
          if (!value) return '';
          const date = new Date(value);
          if (Number.isNaN(date.getTime())) return String(value);
          const pad = (n) => String(n).padStart(2, '0');
          return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
        };

        const sanitizeText = (value) => String(value ?? '')
          .replace(/\r\n/g, '\n')
          .replace(/\r/g, '\n')
          .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, ' ')
          .trim();

        const escapeXml = (value) => sanitizeText(value)
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&apos;');

        const rows = exportRows.map((row) => ([
          { type: 'String', value: row.truckName || '' },
          { type: 'String', value: formatExportDate(row.requestedStartAt || row.startAt) },
          { type: 'String', value: formatExportDate(row.requestedEndAt || row.endAt) },
          { type: 'Number', value: toNumber(row.kmTotal) },
          { type: 'Number', value: toNumber(row.fuelStart) },
          { type: 'Number', value: toNumber(row.fuelEnd) },
          { type: 'Number', value: toInteger(row.refillCount || 0) },
          { type: 'Number', value: toNumber(row.fuelAddedDuringTrip) },
          { type: 'Number', value: toNumber(row.fuelConsumedTotal) },
          { type: 'String', value: row.distanceSource === 'odometer' ? 'Odomètre' : 'Trace GPS' },
          { type: 'String', value: row.note || '' },
          { type: 'String', value: this.getDisplayLocation(row.startLocation || '') },
          { type: 'String', value: this.getDisplayLocation(row.endLocation || '') }
        ]));

        const columnWidths = [
          90, 125, 125, 70, 95, 95, 95, 90, 105, 85, 120, 180, 220
        ];

        const xmlRows = [
          `<Row ss:StyleID="header">${headers.map((header) => `<Cell><Data ss:Type="String">${escapeXml(header)}</Data></Cell>`).join('')}</Row>`,
          ...rows.map((cells) => `<Row>${cells.map((cell) => `<Cell><Data ss:Type="${cell.type}">${cell.type === 'Number' ? cell.value : escapeXml(cell.value)}</Data></Cell>`).join('')}</Row>`)
        ].join('');

        const workbookXml = `<?xml version="1.0" encoding="UTF-8"?>
` +
          `<?mso-application progid="Excel.Sheet"?>
` +
          `<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" ` +
          `xmlns:o="urn:schemas-microsoft-com:office:office" ` +
          `xmlns:x="urn:schemas-microsoft-com:office:excel" ` +
          `xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet" ` +
          `xmlns:html="http://www.w3.org/TR/REC-html40">` +
          `<Styles>` +
          `<Style ss:ID="Default" ss:Name="Normal">` +
          `<Alignment ss:Vertical="Center"/>` +
          `<Borders/>` +
          `<Font ss:FontName="Calibri" ss:Size="11"/>` +
          `<Interior/>` +
          `<NumberFormat/>` +
          `<Protection/>` +
          `</Style>` +
          `<Style ss:ID="header">` +
          `<Font ss:Bold="1"/>` +
          `<Interior ss:Color="#DCE6F1" ss:Pattern="Solid"/>` +
          `<Borders>` +
          `<Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1"/>` +
          `<Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1"/>` +
          `<Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1"/>` +
          `<Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1"/>` +
          `</Borders>` +
          `</Style>` +
          `</Styles>` +
          `<Worksheet ss:Name="Rapport Transport">` +
          `<Table>` +
          columnWidths.map((width) => `<Column ss:AutoFitWidth="0" ss:Width="${width}"/>`).join('') +
          xmlRows +
          `</Table>` +
          `<WorksheetOptions xmlns="urn:schemas-microsoft-com:office:excel">` +
          `<FreezePanes/><FrozenNoSplit/><SplitHorizontal>1</SplitHorizontal><TopRowBottomPane>1</TopRowBottomPane>` +
          `<ProtectObjects>False</ProtectObjects><ProtectScenarios>False</ProtectScenarios>` +
          `</WorksheetOptions>` +
          `</Worksheet>` +
          `</Workbook>`;

        const blob = new Blob([workbookXml], { type: 'application/vnd.ms-excel;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `rapport-transport-filtre-${new Date().toISOString().slice(0, 10)}.xls`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
        this.showToast('Export Excel généré pour tout le résultat filtré', 'success');
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
