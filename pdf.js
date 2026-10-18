/* ============================================================
   PDF.JS — PROFESSIONAL DOCUMENT GENERATOR v15.0
   Exact match: BC_DG_BC_006_2026-7.pdf reference
   + Arabic font support (Amiri TTF auto-loaded from CDN)
   ============================================================ */
(function (global) {
  'use strict';

  if (!global.jspdf || !global.jspdf.jsPDF) {
    console.error('PDFGen: jsPDF not loaded.');
    return;
  }
  const { jsPDF } = global.jspdf;

  /* ── Arabic font cache (loaded once from CDN) ────────────── */
  let _arFontB64  = null;   /* base64 string of TTF data    */
  let _arFontLoad = null;   /* promise for in-flight fetch  */
  const AR_FONT_URL = 'https://fonts.gstatic.com/s/amiri/v27/J7aRnpd8CGxBHqUpvrIw74NL.ttf';
  const AR_FONT_NAME = 'Amiri';
  const AR_RE = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;

  /* ── Colours ────────────────────────────────────────────── */
  const C = {
    PRIMARY:      [0,  96, 120],
    PRIMARY_DARK: [0,  74,  92],
    WHITE:        [255,255,255],
    BLACK:        [0,   0,   0],
    LIGHT:        [217,239,243],
    RED:          [220, 38,  38],
    GRAY_TXT:     [100,116,139],
    LINE:         [203,213,225],
    BG_INFO:      [248,250,252],
    TEXT:         [15,  23,  42],
    BORDER:       [203,213,225],
  };

  /* ── Page geometry ──────────────────────────────────────── */
  const PW = 210, PH = 297;
  const ML = 8,  MR = 8;
  const CW = PW - ML - MR;  /* 194 mm */
  const MT = 8;

  const PDFGen = {

    _notify(msg, type) {
      if (typeof Utils !== 'undefined' && Utils.notify) Utils.notify(msg, type||'info');
      else alert(msg);
    },

    /* ── Pass text raw — with emoji & unprintable symbol stripping ── */
    _t(v) {
      if (v === null || v === undefined) return '';
      let s = String(v);
      // Strip control chars
      s = s.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
      // Strip emojis & high surrogate symbols that cause PDF character corruption (e.g. Ø=ÝÑÞ)
      // Replace narrow and non-breaking spaces with standard space to avoid PDF font slashes
      s = s.replace(/[\u202f\u00a0]/g, ' ');
      // Clean multiple spaces and trim
      return s.replace(/\s+/g, ' ').trim();
    },

    /* ── Arabic detection ──────────────────────────────────── */
    _hasAr(text) { return AR_RE.test(String(text||'')); },

    /* ── Load Amiri Arabic font (once, cached) ────────────── */
    async _ensureArabicFont() {
      if (_arFontB64) return true;
      if (_arFontLoad) return _arFontLoad;
      _arFontLoad = (async () => {
        try {
          const resp = await fetch(AR_FONT_URL);
          if (!resp.ok) throw new Error(resp.status);
          const buf  = await resp.arrayBuffer();
          const bytes = new Uint8Array(buf);
          let bin = '';
          /* chunk the btoa to avoid call-stack overflow on large arrays */
          const CHUNK = 8192;
          for (let i = 0; i < bytes.length; i += CHUNK) {
            bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
          }
          _arFontB64 = btoa(bin);
          console.log('PDFGen: Amiri Arabic font loaded (' + Math.round(buf.byteLength/1024) + ' KB)');
          return true;
        } catch(e) {
          console.warn('PDFGen: could not load Arabic font:', e);
          _arFontB64 = null;
          return false;
        }
      })();
      return _arFontLoad;
    },

    /* Register the cached font on a jsPDF doc instance */
    _registerAr(doc) {
      if (!_arFontB64) return false;
      try {
        doc.addFileToVFS('Amiri-Regular.ttf', _arFontB64);
        doc.addFont('Amiri-Regular.ttf', AR_FONT_NAME, 'normal');
        return true;
      } catch(e) { return false; }
    },

    /* Smart text — auto-switches to Amiri for Arabic content */
    _text(doc, text, x, y, opts) {
      const s = this._t(text);
      if (this._hasAr(s) && _arFontB64) {
        const prev = doc.getFont();
        doc.setFont(AR_FONT_NAME, 'normal');
        doc.text(s, x, y, opts);
        doc.setFont(prev.fontName, prev.fontStyle);
      } else {
        doc.text(s, x, y, opts);
      }
    },

    /* ── Date ───────────────────────────────────────────────  */
    _fmtDate(d) {
      if (!d) return '';
      const dt = new Date(d);
      if (isNaN(dt)) return String(d);
      return `${String(dt.getDate()).padStart(2,'0')}/${String(dt.getMonth()+1).padStart(2,'0')}/${dt.getFullYear()}`;
    },
    _fmtDateTime(d) {
      if (!d) return '';
      const dt = new Date(d);
      if (isNaN(dt)) return String(d);
      return `${this._fmtDate(d)} ${String(dt.getHours()).padStart(2,'0')}:${String(dt.getMinutes()).padStart(2,'0')}`;
    },

    /* ── Numbers ────────────────────────────────────────────  */
    _numFmt(n, dec) {
      const num = Number(n)||0;
      const fixed = num.toFixed(dec!==undefined?dec:2);
      const parts = fixed.split('.');
      parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
      return dec===0 ? parts[0] : parts[0]+','+parts[1];
    },
    _fmtMoney(v) { return this._numFmt(v,2)+' DA'; },
    _fmtNum(v)   { return this._numFmt(v,0); },

    /* ── Settings ───────────────────────────────────────────  */
    _settings() {
      return (typeof DB!=='undefined'&&DB.getSettings)?DB.getSettings():{};
    },

    /* ── Theme colour from settings ─────────────────────────  */
    _applyTheme(s) {
      s = s||this._settings();
      const hex = String(s.themeColor||'').trim();
      const h = hex.startsWith('#')?hex:'#'+hex;
      if (!/^#[0-9a-fA-F]{6}$/.test(h)) return;
      const r=parseInt(h.slice(1,3),16),g=parseInt(h.slice(3,5),16),b=parseInt(h.slice(5,7),16);
      const cl=n=>Math.max(0,Math.min(255,Math.round(n)));
      const mx=(a,t,p)=>cl(a*(1-p)+t*p);
      C.PRIMARY      = [r,g,b];
      C.PRIMARY_DARK = [mx(r,0,.25),mx(g,0,.25),mx(b,0,.25)];
      C.LIGHT        = [mx(r,255,.85),mx(g,255,.85),mx(b,255,.85)];
    },

    /* ── New compressed doc (with Arabic font if available) ── */
    _newDoc() {
      this._applyTheme();
      const doc = new jsPDF({orientation:'portrait',unit:'mm',format:'a4',compress:true,putOnlyUsedFonts:true});
      this._registerAr(doc);
      return doc;
    },
    _save(doc, fn) { doc.save(fn); const isAR = typeof T !== 'undefined' && T.isRTL(); this._notify(isAR ? 'تم إنشاء ملف PDF بنجاح' : 'PDF généré','success'); },

    /* ── Drawing ────────────────────────────────────────────  */
    _fill(doc,rgb)   { doc.setFillColor(rgb[0],rgb[1],rgb[2]); },
    _stroke(doc,rgb) { doc.setDrawColor(rgb[0],rgb[1],rgb[2]); },
    _tc(doc,rgb)     { doc.setTextColor(rgb[0],rgb[1],rgb[2]); },
    _rect(doc,x,y,w,h,fill,stroke) {
      if(fill)  { this._fill(doc,fill);   doc.rect(x,y,w,h,'F'); }
      if(stroke){ this._stroke(doc,stroke);doc.rect(x,y,w,h,'S'); }
    },
    _hline(doc,y,lw,color) {
      doc.setLineWidth(lw||0.3);
      this._stroke(doc,color||C.LINE);
      doc.line(ML,y,ML+CW,y);
      doc.setLineWidth(0.2);
    },

    /* ══════════════════════════════════════════════════════════
       CROSS-HATCH MESH — anti-tamper pattern in blank area
       Exactly as in the reference BC PDF
    ══════════════════════════════════════════════════════════ */
    _drawMesh(doc, x, top, w, bottom) {
      const pad = 2;
      const left  = x+pad, right = x+w-pad;
      const t = top+pad,   b = bottom-pad;
      if (right<=left||b<=t) return;

      /* subtle fill */
      doc.setFillColor(250,250,250);
      doc.rect(left,t,right-left,b-t,'F');

      const spacing = 0.6;
      doc.setDrawColor(160,160,160);
      doc.setLineWidth(0.12);

      /* Family 1: slope -1 (x - y = c) */
      const cMin = left-b, cMax = right-t;
      for(let c=cMin;c<=cMax;c+=spacing){
        const pts=[];
        const yL=left-c;   if(yL>=t&&yL<=b) pts.push([left,yL]);
        const yR=right-c;  if(yR>=t&&yR<=b) pts.push([right,yR]);
        const xT=c+t;      if(xT>=left&&xT<=right) pts.push([xT,t]);
        const xB=c+b;      if(xB>=left&&xB<=right) pts.push([xB,b]);
        if(pts.length>=2) doc.line(pts[0][0],pts[0][1],pts[1][0],pts[1][1]);
      }

      /* Family 2: slope +1 (x + y = c) */
      const cMin2=left+t, cMax2=right+b;
      for(let c=cMin2;c<=cMax2;c+=spacing){
        const pts=[];
        const yL=c-left;   if(yL>=t&&yL<=b) pts.push([left,yL]);
        const yR=c-right;  if(yR>=t&&yR<=b) pts.push([right,yR]);
        const xT=c-t;      if(xT>=left&&xT<=right) pts.push([xT,t]);
        const xB=c-b;      if(xB>=left&&xB<=right) pts.push([xB,b]);
        if(pts.length>=2) doc.line(pts[0][0],pts[0][1],pts[1][0],pts[1][1]);
      }
      doc.setLineWidth(0.2);
    },

    /* ══════════════════════════════════════════════════════════
       COMPANY HEADER (exact reference style)
    ══════════════════════════════════════════════════════════ */
    _drawCompanyHeader(doc, s, startY) {
      let y = startY||MT;
      const SLOT_W=40, SLOT_H=20;

      const drawLogo = (src, sx) => {
        if (!src || typeof src !== 'string') return;
        const cleanSrc = src.trim();
        try {
          let ar = 1;
          let fmt = 'JPEG';
          if (cleanSrc.startsWith('data:image/png')) fmt = 'PNG';
          else if (cleanSrc.startsWith('data:image/gif')) fmt = 'GIF';
          else if (cleanSrc.startsWith('data:image/webp')) fmt = 'WEBP';
          try {
            if (doc.getImageProperties) {
              const props = doc.getImageProperties(cleanSrc);
              if (props && props.width && props.height) ar = props.width / props.height;
              if (props && props.fileType) fmt = props.fileType;
            }
          } catch (_) {}
          let w = SLOT_W, h = w / ar;
          if (h > SLOT_H) { h = SLOT_H; w = h * ar; }
          if (w > SLOT_W) { w = SLOT_W; h = w / ar; }
          doc.addImage(cleanSrc, fmt, sx + Math.max(0, (SLOT_W - w) / 2), y + Math.max(0, (SLOT_H - h) / 2), w, h);
        } catch(e) {}
      };
      drawLogo(s.logoLeft || s.leftLogo || s.evLogoLeft, ML);
      drawLogo(s.logoRight || s.rightLogo || s.evLogoRight, PW - MR - SLOT_W);

      /* Company name — may be Arabic */
      const cName = this._t(s.companyName||'/');
      if (this._hasAr(cName) && _arFontB64) doc.setFont(AR_FONT_NAME,'normal');
      else doc.setFont('helvetica','bold');
      doc.setFontSize(12);
      this._tc(doc,C.PRIMARY);
      doc.text(cName, PW/2, y+5.2, {align:'center'});
      const isAR = typeof T !== 'undefined' && T.isRTL();

      /* Activity type — shown right below company name */
      const compActivity = s.activityType || s.evActivityType || '';
      if (compActivity) {
        doc.setFontSize(8);
        this._tc(doc, [100, 116, 139]);
        const actLabel = isAR ? ('النشاط : ' + compActivity) : ('Activité : ' + compActivity);
        const actT = this._t(actLabel);
        if (this._hasAr(actT) && _arFontB64) doc.setFont(AR_FONT_NAME, 'normal');
        else doc.setFont('helvetica', 'bold');
        doc.text(actT, PW / 2, y + 9.2, { align: 'center' });
      }

      doc.setFontSize(7.3);
      this._tc(doc,C.BLACK);
      const infoLines = [
        s.capital||'',
        [s.nif&&`NIF : ${s.nif}`, s.rc&&`RC : ${s.rc}`].filter(Boolean).join('  '),
        [s.nis&&`NIS : ${s.nis}`, s.ai&&`AI : ${s.ai}`].filter(Boolean).join('  '),
        [s.address&&this._t(s.address), s.phone&&`Tel : ${s.phone}`].filter(Boolean).join('  '),
        s.email?`E-mail : ${s.email}`:'',
      ].filter(Boolean);

      let ly = y + (compActivity ? 12.5 : 9);
      infoLines.forEach(line => {
        const lt = this._t(line);
        if (this._hasAr(lt) && _arFontB64) doc.setFont(AR_FONT_NAME,'normal');
        else doc.setFont('helvetica','normal');
        const parts = doc.splitTextToSize(lt, CW);
        parts.forEach(p=>{ doc.text(p,PW/2,ly,{align:'center'}); ly+=3; });
      });
      doc.setFont('helvetica','normal');
      ly = Math.max(ly, y+SLOT_H+2);
      this._hline(doc,ly+0.8,0.4);
      return ly+3;
    },

    /* ══════════════════════════════════════════════════════════
       TITLE BANNER — reference style (no ref# in banner,
       ref is shown in info strip like the reference)
    ══════════════════════════════════════════════════════════ */
    _drawBanner(doc, text, y) {
      const h=8;
      this._rect(doc,ML,y,CW,h,C.PRIMARY);
      doc.setFont('helvetica','bold');
      doc.setFontSize(13);
      this._tc(doc,C.WHITE);
      doc.text(text,PW/2,y+5.6,{align:'center'});
      return y+h+3;
    },

    /* ══════════════════════════════════════════════════════════
       INFO STRIP — key:value pairs on one light-bg line
    ══════════════════════════════════════════════════════════ */
    _drawInfoStrip(doc, items, y) {
      const h=6;
      this._rect(doc,ML,y,CW,h,C.BG_INFO,C.LINE);
      doc.setFont('helvetica','normal');
      doc.setFontSize(7.5);
      this._tc(doc,C.BLACK);
      const cw=CW/items.length;
      items.forEach((it,i)=>{
        const x=ML+i*cw+2;
        this._text(doc, `${this._t(it.label)} : ${this._t(String(it.value||'/'))}`, x, y+4.2);
      });
      return y+h+1;
    },

    /* ══════════════════════════════════════════════════════════
       ENTITY INFO BOX (reference style: title centered on LIGHT bg)
    ══════════════════════════════════════════════════════════ */
    _drawEntityBox(doc, title, lines, x, y, w, h) {
      this._rect(doc,x,y,w,h,C.BG_INFO,C.LINE);
      this._rect(doc,x,y,w,6.5,C.LIGHT,C.LINE);
      doc.setFont('helvetica','bold');
      doc.setFontSize(8.5);
      this._tc(doc,C.PRIMARY_DARK);
      doc.text(title,x+w/2,y+4.5,{align:'center'});
      doc.setFontSize(8);
      this._tc(doc,C.BLACK);
      let cy=y+11;
      lines.filter(l=>l!==null&&l!==undefined&&String(l).trim()).forEach(ln=>{
        const txt = String(ln);
        /* Switch to Amiri for Arabic, back to helvetica for Latin */
        if (this._hasAr(txt) && _arFontB64) {
          doc.setFont(AR_FONT_NAME,'normal');
        } else {
          doc.setFont('helvetica','normal');
        }
        const parts=doc.splitTextToSize(txt, w-6);
        parts.slice(0,6).forEach(p=>{doc.text(p,x+3,cy);cy+=3.8;});
      });
      doc.setFont('helvetica','normal');
    },

    /* ══════════════════════════════════════════════════════════
       SIGNATURE BLOCK — reference style (plain boxes)
    ══════════════════════════════════════════════════════════ */
    _drawSigBlock(doc, cols, y, blockH) {
      blockH=blockH||40;
      const cw=CW/cols.length;
      cols.forEach((col,i)=>{
        const x=ML+i*cw;
        this._rect(doc,x,y,cw,blockH,null,C.LINE);
        doc.setFont('helvetica','bold');
        doc.setFontSize(9);
        this._tc(doc,C.BLACK);
        doc.text(col.label,x+cw/2,y+6,{align:'center'});
        if(col.sub){
          if(this._hasAr(col.sub)&&_arFontB64) doc.setFont(AR_FONT_NAME,'normal');
          else doc.setFont('helvetica','italic');
          doc.setFontSize(7.5);
          this._tc(doc,C.GRAY_TXT);
          this._text(doc,col.sub,x+cw/2,y+11,{align:'center'});
        }
        if(col.value){
          if(this._hasAr(col.value)&&_arFontB64) doc.setFont(AR_FONT_NAME,'normal');
          else doc.setFont('helvetica','normal');
          doc.setFontSize(8);
          this._tc(doc,C.BLACK);
          this._text(doc,col.value,x+cw/2,y+16,{align:'center'});
        }
        /* dotted signature line */
        this._fill(doc,C.GRAY_TXT);
        const dotY=y+blockH-10;
        let lx=x+5;
        while(lx<x+cw-5){doc.circle(lx,dotY,0.35,'F');lx+=2.2;}
      });
      return y+blockH+4;
    },

    /* ══════════════════════════════════════════════════════════
       PAGE FOOTER
    ══════════════════════════════════════════════════════════ */
    _drawFooter(doc, pg, total, hidePageNum = false) {
      const isAR = typeof T !== 'undefined' && T.isRTL();
      doc.setFont('helvetica','normal');
      doc.setFontSize(8);
      this._tc(doc,C.GRAY_TXT);
      if (!hidePageNum) {
        doc.text(isAR ? `صفحة ${pg} من ${total}` : `Page ${pg} sur ${total}`,PW/2,PH-6,{align:'center'});
      }
      doc.text(isAR ? `تاريخ الإصدار : ${this._fmtDateTime(new Date().toISOString())}` : `Genere le : ${this._fmtDateTime(new Date().toISOString())}`,ML,PH-6);
    },

    _amountWords(n) {
      if(typeof Utils!=='undefined'&&Utils.numberToWordsFR)
        return Utils.numberToWordsFR(Math.floor(Number(n)||0));
      return '';
    },

    /* ══════════════════════════════════════════════════════════
       BUILD TABLE with MESH — shared by BR and BL
       cols = [{label,width,halign}]
       bodyRows = array of string arrays
       totalsData = {totalHT, timbre, totalTTC, extraFees?}
       Returns finalY
    ══════════════════════════════════════════════════════════ */
    _buildTable(doc, startY, cols, bodyRows, totalsData) {
      /* Column widths must sum to CW */
      const colStyles = {};
      cols.forEach((c,i)=>{
        colStyles[i]={halign:c.halign||'center', cellWidth:c.width};
        if(i===1) colStyles[i].cellPadding={top:2.5,right:2,bottom:2,left:2};
      });

      /* Build totals rows to append in body */
      /* Each total row: [colSpan:N-2 mesh cell, label cell, value cell] */
      const NC = cols.length;          /* number of columns, typically 6 */
      const SPAN = NC-2;               /* span for blank mesh area */

      const mkTotRow = (label, value, isTTC) => {
        const spanCell = {
          content: '', colSpan: SPAN, _meshBlock: true,
          styles: { fillColor: C.WHITE, cellPadding: 0, lineWidth: 0.15, lineColor: C.LINE }
        };
        const lblCell = {
          content: label,
          styles: {
            halign:'center', fontStyle:'bold',
            fillColor: isTTC ? C.PRIMARY : C.LIGHT,
            textColor: isTTC ? C.WHITE   : C.BLACK,
            cellPadding:2, fontSize:9,
          }
        };
        const valCell = {
          content: value,
          styles: {
            halign:'center', fontStyle:'bold',
            fillColor: isTTC ? C.PRIMARY : [255,255,255],
            textColor: isTTC ? C.WHITE   : C.BLACK,
            cellPadding:2, fontSize:9,
          }
        };
        return [spanCell, lblCell, valCell];
      };

      const isAR = typeof T !== 'undefined' && T.isRTL();
      const totRows = [];
      if (totalsData.extraFees) totRows.push(mkTotRow(isAR ? 'مصاريف إضافية' : 'Frais suppl.',   this._fmtMoney(totalsData.extraFees), false));
      totRows.push(mkTotRow(isAR ? 'المجموع خ.ر' : 'Total HT',   this._fmtMoney(totalsData.totalHT||0),  false));
      if (totalsData.tvaAmount) totRows.push(mkTotRow(isAR ? `الضرائب (ر.ق.م ${totalsData.tvaRate||19}%)` : `Taxes (TVA ${totalsData.tvaRate||19}%)`, this._fmtMoney(totalsData.tvaAmount||0), false));
      if (totalsData.timbre) {
        const tRateLabel = totalsData.timbreRate ? ` (${totalsData.timbreRate}%)` : '';
        totRows.push(mkTotRow(isAR ? `الطابع الجبائي${tRateLabel}` : `Timbre Fiscal${tRateLabel}`, this._fmtMoney(totalsData.timbre||0), false));
      }
      totRows.push(mkTotRow(isAR ? 'المجموع ك.ر' : 'TOTAL TTC',  this._fmtMoney(totalsData.totalTTC||0), true));

      /* Tag first/last for mesh drawing */
      if (totRows.length) {
        totRows[0][0]._meshStart = true;
        totRows[totRows.length-1][0]._meshEnd = true;
      }

      /* Mesh tracking */
      const mesh = {x:null, w:null, top:null, bottom:null, drawn:false};

      const finalY = this._autoTable(doc, {
        startY, margin:{left:ML,right:MR}, tableWidth:CW, theme:'grid',
        head: [cols.map(c=>c.label)],
        body: [...bodyRows, ...totRows],
        headStyles: {
          fillColor:C.PRIMARY, textColor:C.WHITE, fontStyle:'bold',
          halign:'center', valign:'middle', fontSize:8, cellPadding:2, lineWidth:0,
        },
        bodyStyles: { fontSize:7.6, cellPadding:1.6, valign:'middle', lineColor:C.LINE, lineWidth:0.15 },
        alternateRowStyles: { fillColor:[245,249,251] },
        columnStyles: colStyles,
        didDrawCell: (data) => {
          if (data.section!=='body') return;
          if (data.column.index!==0) return;
          const raw = data.cell&&data.cell.raw ? data.cell.raw : null;
          if (!raw||!raw._meshBlock) return;
          if (mesh.drawn) return;
          if (mesh.x===null) {
            mesh.x=data.cell.x; mesh.w=data.cell.width;
            mesh.top=data.cell.y; mesh.bottom=data.cell.y+data.cell.height;
          } else {
            mesh.top    = Math.min(mesh.top,    data.cell.y);
            mesh.bottom = Math.max(mesh.bottom, data.cell.y+data.cell.height);
          }
          if (raw._meshEnd&&!mesh.drawn&&mesh.x!==null) {
            this._drawMesh(doc, mesh.x, mesh.top, mesh.w, mesh.bottom);
            mesh.drawn=true;
          }
        }
      });
      return finalY;
    },

    /* Wrapper for autoTable — ensures Amiri font for Arabic cells */
    _autoTable(doc, opts) {
      if (typeof doc.autoTable!=='function') throw new Error('autoTable not loaded');
      if (_arFontB64) {
        const origParse = opts.didParseCell;
        opts.didParseCell = (data) => {
          if (origParse) origParse(data);
          const txt = (data.cell && data.cell.text) ? (Array.isArray(data.cell.text) ? data.cell.text.join(' ') : String(data.cell.text)) : '';
          if (AR_RE.test(txt)) {
            data.cell.styles.font = AR_FONT_NAME;
          }
        };
      }
      doc.autoTable(opts);
      return doc.lastAutoTable.finalY;
    },

    /* ══════════════════════════════════════════════════════════
       ROUTER (async — waits for Arabic font before generating)
    ══════════════════════════════════════════════════════════ */
    async exportBR(id)       { try{ await this._ensureArabicFont(); this._exportBR(id);       }catch(e){console.error(e);this._notify('Erreur BR: '+e.message,'error');} },
    async exportBonChargement(id) { try{ await this._ensureArabicFont(); this._exportBonChargement(id); }catch(e){console.error(e);this._notify('Erreur Bon de Chargement: '+e.message,'error');} },
    async exportBLRoute(id)       { try{ await this._ensureArabicFont(); this._exportBL(id, true); }catch(e){console.error(e);this._notify('Erreur BL Route: '+e.message,'error');} },
    async exportTempoBL(id)       { try{ await this._ensureArabicFont(); this._exportTempoBL(id); }catch(e){console.error(e);this._notify('Erreur Tempo BL: '+e.message,'error');} },
    async exportBL(id)            { try{ await this._ensureArabicFont(); this._exportBL(id); }catch(e){console.error(e);this._notify('Erreur BL: '+e.message,'error');} },
    async exportBonRetour(id)     { try{ await this._ensureArabicFont(); this._exportBonRetour(id); }catch(e){console.error(e);this._notify('Erreur Bon de Retour: '+e.message,'error');} },
    async exportDecharge(id) { try{ await this._ensureArabicFont(); this._exportDecharge(id); }catch(e){console.error(e);this._notify('Erreur Decharge: '+e.message,'error');} },
    async exportBankDecharge(id) { try{ await this._ensureArabicFont(); this._exportBankDecharge(id); }catch(e){console.error(e);this._notify('Erreur Bank Decharge: '+e.message,'error');} },
    async exportSupplierPayDecharge(id) { try{ await this._ensureArabicFont(); this._exportSupplierPayDecharge(id); }catch(e){console.error(e);this._notify('Erreur Pay Decharge: '+e.message,'error');} },



    /* ══════════════════════════════════════════════════════════
       BR — BON DE RÉCEPTION
    ══════════════════════════════════════════════════════════ */
    _exportBR(id) {
      const br  = DB.getById('brs', id);
      if(!br) { this._notify('BR introuvable','error'); return; }
      const sup = DB.getById('suppliers', br.supplierId)||{};
      const s   = this._settings();
      const doc = this._newDoc();

      const isAR = typeof T !== 'undefined' && T.isRTL();
      /* ── Header / Banner / Strip ── */
      let y = this._drawCompanyHeader(doc, s, MT);
      y = this._drawBanner(doc, isAR ? 'وصل الاستلام' : 'BON DE RÉCEPTION', y);
      y = this._drawInfoStrip(doc, [
        {label:isAR ? 'التاريخ' : 'Date',       value:this._fmtDate(br.date)},
        {label:isAR ? 'المرجع' : 'Référence',  value:this._t(br.ref||'/')},
        {label:isAR ? 'السنة' : 'Année',      value:br.year||new Date().getFullYear()},
      ], y);
      y += 4;

      /* ── Entity cards ── */
      const gap=4, cw2=(CW-gap)/2, boxH=42;
      const supLines = [
        this._t(sup.name||'/'),
        ...(sup.activityType ? [isAR ? ('النشاط : ' + sup.activityType) : ('Activité : ' + sup.activityType)] : []),
        `NIF : ${sup.nif||'-'}`,
        `NIS : ${sup.nis||'-'}`,
        `RC  : ${sup.rc||'-'}`,
        `${isAR ? 'العنوان' : 'Adresse'} : ${this._t(sup.address||'-')}`,
        `${isAR ? 'الهاتف' : 'Tel'} : ${sup.phone||'-'}`,
      ];
      this._drawEntityBox(doc, isAR ? 'المورد' : 'Fournisseur', supLines, ML, y, cw2, boxH);
      this._drawEntityBox(doc, isAR ? 'الاستلام / المراقبة' : 'Réception / Contrôle',[
        `${isAR ? 'استلم من طرف' : 'Réceptionné par'} : ${this._t(br.receivedBy||'......................')}`,
        `${isAR ? 'فحص من طرف' : 'Contrôlé par   '} : ${this._t(br.controlledBy||'......................')}`,
        '',
        `${isAR ? 'تاريخ الاستلام' : 'Date réception '} : ${this._fmtDate(br.date)}`,
      ], ML+cw2+gap, y, cw2, boxH);
      y += boxH+4;

      /* ── 6-column table with mesh ── */
      const COLS = [
        {label:isAR ? 'الرقم' : 'N°',                                            width:12, halign:'center'},
        {label:isAR ? 'بيان التوريدات / الخدمات' : 'DÉSIGNATION DES FOURNITURES / SERVICES',        width:75, halign:'left'},
        {label:isAR ? 'الوحدة' : 'UNITÉ',                                         width:15, halign:'center'},
        {label:isAR ? 'الكمية' : 'QTÉ',                                           width:18, halign:'center'},
        {label:isAR ? 'سعر الوحدة خ.ر' : 'P.U. HT',                                       width:34, halign:'center'},
        {label:isAR ? 'المجموع خ.ر' : 'TOTAL HT',                                      width:40, halign:'center'},
      ];

      const bodyRows6 = (br.lines||[]).map((l,i)=>{
        const qty=Number(l.qty)||0, pu=Number(l.price)||0, disc=Number(l.disc)||0;
        const tot=Math.round(qty*pu*(1-disc/100)*100)/100;
        return [
          String(i+1).padStart(2,'0'),
          this._t(l.designation||''),
          this._t(l.unit||'U'),
          this._fmtNum(qty),
          this._fmtMoney(pu)+(disc?` (-${disc}%)`:''),
          this._fmtMoney(tot),
        ];
      });
      if(!bodyRows6.length) bodyRows6.push(['01','','U','','',this._fmtMoney(0)]);

      const tEndY = this._buildTable(doc, y, COLS, bodyRows6, {
        totalHT:  br.totalHT||0,
        tvaAmount:br.tvaAmount||0,
        tvaRate:  br.tvaRate||0,
        timbre:   br.timbreAmount||0,
        totalTTC: br.totalTTC||0,
        extraFees:br.extraFees||0,
      });
      y = tEndY + 4;

      /* ── Amount in words ── */
      const wd = this._amountWords(br.totalTTC);
      if(wd){
        doc.setFont('helvetica','italic'); doc.setFontSize(8); this._tc(doc,C.GRAY_TXT);
        const wl=doc.splitTextToSize(`Arretee a : ${wd} dinars algeriens`, CW);
        doc.text(wl,ML,y); y+=wl.length*4+3;
      }

      /* ── Attestation ── */
      y+=3;
      doc.setFont('helvetica','bold'); doc.setFontSize(8.5); this._tc(doc,C.BLACK);
      const att = isAR ? 'نشهد بأن التوريدات المستلمة مطابقة للطلبية نوعياً وكمياً.' : 'Nous attestons que les fournitures receptionnees sont conformes a la commande qualitativement et quantitativement.';
      const attL=doc.splitTextToSize(att, CW);
      this._text(doc, attL, ML, y); y+=attL.length*4.5+4;

      if(br.notes){
        doc.setFont('helvetica','normal'); doc.setFontSize(8); this._tc(doc,C.GRAY_TXT);
        const nl=doc.splitTextToSize(`${isAR ? 'ملاحظات' : 'Observations'} : ${this._t(br.notes)}`, CW);
        this._text(doc, nl, ML, y); y+=nl.length*4+3;
      }

      /* ── 3 Signature blocks ── */
      this._drawSigBlock(doc,[
        {label:isAR ? 'المورد' : 'Le Fournisseur',   sub:this._t(sup.name||'')},
        {label:isAR ? 'استلم من طرف' : 'Réceptionné par',  value:this._t(br.receivedBy||''),  sub:isAR ? 'التوقيع والختم' : 'Signature & Cachet'},
        {label:isAR ? 'فحص من طرف' : 'Contrôlé par',     value:this._t(br.controlledBy||''), sub:isAR ? 'التوقيع والختم' : 'Signature & Cachet'},
      ], Math.max(y, PH-62), 44);

      this._drawFooter(doc,1,1);
      this._save(doc,`BR_${this._t(br.ref||'BROUILLON').replace(/\//g,'_')}.pdf`);
    },

    exportEtatVente(data) {
      this._ensureArabicFont().then(() => this._exportEtatVente(data)).catch(e => {
        console.error(e);
        this._notify('Erreur: ' + e.message, 'error');
      });
    },

    _exportEtatVente(data) {
      const { 
        ref, createdByName, createdAt, items, totalHT, tvaAmt, tvaRate, timbreAmt, 
        totalTTC, period, blList = [], returnList = [], 
        grossTotalTTC = 0, returnsTotalTTC = 0, netTotalTTC = null 
      } = data;
      // Safety: settings may be undefined if called from old code path
      const settings = data.settings || (typeof DB !== 'undefined' ? DB.getSettings() : {}) || {};

      const finalNetTTC = netTotalTTC !== null && netTotalTTC !== undefined ? netTotalTTC : totalTTC;
      const effectiveGross = grossTotalTTC || totalTTC;
      const effectiveReturns = returnsTotalTTC || 0;

      const s = {
        companyName: settings.evCompanyName || settings.companyName || '',
        activityType: settings.evActivityType || settings.activityType || '',
        address: settings.evAddress || settings.address,
        phone: settings.evPhone || settings.phone,
        fax: settings.evFax,
        email: settings.evEmail || settings.email,
        nif: settings.evNif || settings.nif,
        rc: settings.evRc || settings.rc,
        nis: settings.evNis || settings.nis,
        ai: settings.evAi || settings.ai,
        capital: settings.evCapital,
        logoLeft: settings.evLogoLeft,
        logoRight: settings.evLogoRight
      };
      
      const doc = this._newDoc();
      
      const isAR = typeof T !== 'undefined' && T.isRTL();
      let y = this._drawCompanyHeader(doc, s, MT);
      y = this._drawBanner(doc, isAR ? 'كشف المبيعات والإيداع البنكي' : 'ÉTAT DE VENTE & VERSEMENT BANCAIRE', y);
      
      const infoItems = [];
      if (ref) infoItems.push({ label: isAR ? 'مرجع الكشف' : 'Réf État', value: this._t(ref) });
      infoItems.push({ label: isAR ? 'الفترة' : 'Période', value: this._t(period) });
      infoItems.push({ label: isAR ? 'حُرر في' : 'Édité le', value: this._fmtDate(createdAt ? new Date(createdAt) : new Date()) });
      if (createdByName) infoItems.push({ label: isAR ? 'أُعد من طرف' : 'Établi par', value: this._t(createdByName) });
      if (data.bankName) infoItems.push({ label: isAR ? 'البنك' : 'Banque', value: this._t(data.bankName) });

      y = this._drawInfoStrip(doc, infoItems, y);
      y += 6;

      // ── Sub-header: Articles & Produits vendus ──
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      this._tc(doc, C.PRIMARY);
      this._text(doc, isAR ? '1. ملخص المواد المباعة (المبيعات التراكمية)' : 'I. RÉCAPITULATIF DES ARTICLES VENDUS (VENTES CUMULÉES)', ML, y);
      y += 4;
      
      const COLS = [
        {label:isAR ? 'الرقم' : 'N°', width:12, halign:'center'},
        {label:isAR ? 'البيان' : 'DÉSIGNATION', width:75, halign:'left'},
        {label:isAR ? 'الوحدة' : 'UNITÉ', width:15, halign:'center'},
        {label:isAR ? 'الكمية' : 'QTÉ', width:18, halign:'center'},
        {label:isAR ? 'سعر الوحدة خ.ر' : 'P.U HT', width:34, halign:'center'},
        {label:isAR ? 'المجموع خ.ر' : 'TOTAL HT', width:40, halign:'center'},
      ];
      
      const bodyRows = (items || []).map((l, i) => {
        return [
          String(i+1).padStart(2,'0'),
          this._t(l.designation||''),
          this._t(l.unit||'U'),
          this._fmtNum(l.qty),
          this._fmtMoney(l.unitPrice),
          this._fmtMoney((l.qty || 0) * (l.unitPrice || 0)),
        ];
      });
      if(!bodyRows.length) bodyRows.push(['01','Aucune ligne','U','0',this._fmtMoney(0),this._fmtMoney(0)]);
      
      // Fiscal TTC = HT + TVA + Timbre (calculated on HT + TVA sum)
      const ht = Number(totalHT) || 0;
      const effectiveTva = (Number(tvaAmt) > 0) ? Number(tvaAmt) : Math.round(ht * (Number(tvaRate) || 19) / 100 * 100) / 100;
      // Use passed timbreAmt from core.js when available (respects any caps/rules); fallback to 1% on (HT+TVA)
      const effectiveTimbreAmt = (Number(timbreAmt) > 0) ? Number(timbreAmt) : Math.round((ht + effectiveTva) * 0.01 * 100) / 100;
      const effectiveTimbreRate = 1; // Strictly 1% fixed for État de Vente on (HT + TVA)
      // Use passed totalTTC from core.js when available; fallback to recalculation
      const fiscalTTC = (Number(totalTTC) > 0) ? Number(totalTTC) : Math.round((ht + effectiveTva + effectiveTimbreAmt) * 100) / 100;

      let tEndY = this._buildTable(doc, y, COLS, bodyRows, {
        totalHT: ht,
        tvaAmount: effectiveTva,
        tvaRate: tvaRate || 19,
        timbre: effectiveTimbreAmt,
        timbreRate: 1, // Displays "Timbre Fiscal (1%)"
        totalTTC: fiscalTTC
      });
      
      y = tEndY + 8;

      // ── Grand Récapitulatif Final Box (PAGE 1 — printable summary) ──
      if (y + 40 > PH - 35) { doc.addPage(); y = MT + 8; }

      const boxW = 100;
      const boxX = ML + CW - boxW;
      const boxH = effectiveReturns > 0 ? 20 : 13;

      this._fill(doc, [248, 250, 252]);
      this._stroke(doc, C.LINE);
      doc.rect(boxX, y, boxW, boxH, 'FD');

      let curY = y;
      if (effectiveReturns > 0) {
        curY += 5.5;
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        this._tc(doc, C.GRAY_TXT);
        doc.text(isAR ? 'خصم المرتجعات :' : 'Déduction Retours (BR) :', boxX + 4, curY);
        doc.setFont('helvetica', 'bold');
        this._tc(doc, [220, 38, 38]);
        doc.text('- ' + this._fmtMoney(effectiveReturns), boxX + boxW - 4, curY, { align: 'right' });
        curY += 6.5;
      } else {
        curY += 4.5;
      }

      this._fill(doc, C.PRIMARY);
      doc.rect(boxX, curY - 3.5, boxW, 9, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      this._tc(doc, C.WHITE);
      doc.text(isAR ? 'الصافي النهائي (إيداع 1% طابع) :' : 'NET FINAL (VERSEMENT 1% TIMBRE) :', boxX + 4, curY + 2.5);
      doc.text(this._fmtMoney(finalNetTTC), boxX + boxW - 4, curY + 2.5, { align: 'right' });

      y += boxH + 6;

      const wd = this._amountWords(finalNetTTC);
      if (wd) {
        doc.setFont('helvetica', 'italic');
        doc.setFontSize(8);
        this._tc(doc, C.GRAY_TXT);
        const wl = doc.splitTextToSize(isAR ? `حُددت هذه الوثيقة بالمبلغ الصافي : ${wd} دينار جزائري.` : `Arrêtée la présente à la somme nette de : ${wd} dinars algériens.`, CW);
        doc.text(wl, ML, y);
        y += wl.length * 4 + 4;
      }

      // Signature on page 1: Only "Le Directeur" (no Caissier block as requested)
      if (y + 36 > PH - 15) { doc.addPage(); y = MT + 10; }

      const sigH = 34;
      const sigW = 85;
      const sigX = ML + CW - sigW; // Right-aligned
      const sigY = Math.max(y + 3, PH - 48);

      this._rect(doc, sigX, sigY, sigW, sigH, null, C.LINE);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      this._tc(doc, C.BLACK);
      this._text(doc, isAR ? 'المدير' : 'LE DIRECTEUR', sigX + sigW / 2, sigY + 6, { align: 'center' });

      if (s.companyName) {
        if (this._hasAr(s.companyName) && _arFontB64) doc.setFont(AR_FONT_NAME, 'normal');
        else doc.setFont('helvetica', 'italic');
        doc.setFontSize(7.5);
        this._tc(doc, C.GRAY_TXT);
        this._text(doc, this._t(s.companyName), sigX + sigW / 2, sigY + 11, { align: 'center' });
      }

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      this._tc(doc, C.GRAY_TXT);
      this._text(doc, isAR ? 'الختم والتأشيرة' : 'Cachet & Visa', sigX + sigW / 2, sigY + 16, { align: 'center' });

      /* dotted signature line */
      this._fill(doc, C.GRAY_TXT);
      const dotY = sigY + sigH - 8;
      let lx = sigX + 6;
      while (lx < sigX + sigW - 6) { doc.circle(lx, dotY, 0.35, 'F'); lx += 2.2; }

      // ══════════════════════════════════════════════════════════
      // PAGE 2+ : Détails des Bons de Livraison et Retours
      // ══════════════════════════════════════════════════════════

      // ── Sub-header: Table 1 - Bons de Livraison inclus ──
      if (blList && blList.length > 0) {
        doc.addPage();
        y = MT + 8;

        // Mini header for detail pages
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(11);
        this._tc(doc, C.PRIMARY);
        this._text(doc, isAR ? `ملحق تفصيلي لكشف المبيعات — مرجع: ${ref || ''}` : `ANNEXE DÉTAILLÉE ÉTAT DE VENTE — Réf: ${ref || ''}`, ML, y);
        y += 8;

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        this._tc(doc, C.PRIMARY);
        this._text(doc, isAR ? `1. تفاصيل وصولات الشحن المتضمنة (خ.ر / ضرائب / طابع / ك.ر) — ${blList.length} سند:` : `I. DÉTAIL DES BONS DE CHARGEMENT INCLUS (HT / TVA / TIMBRE / TTC) — ${blList.length} BCH :`, ML, y);
        y += 4;

        const blCols = [
          { label: isAR ? 'الرقم' : 'N°', width: 10, halign: 'center' },
          { label: isAR ? 'مرجع سند الشحن' : 'RÉFÉRENCE BCH', width: 34, halign: 'center' },
          { label: isAR ? 'التاريخ' : 'DATE', width: 22, halign: 'center' },
          { label: isAR ? 'الزبون / المستلم' : 'CLIENT / DESTINATAIRE', width: 48, halign: isAR ? 'right' : 'left' },
          { label: isAR ? 'المجموع خ.ر' : 'MONTANT HT', width: 22, halign: 'right' },
          { label: isAR ? 'الرسم 19%' : 'TVA 19%', width: 18, halign: 'right' },
          { label: isAR ? 'الطابع' : 'TIMBRE', width: 16, halign: 'right' },
          { label: isAR ? 'المجموع ك.ر' : 'MONTANT TTC', width: 24, halign: 'right' }
        ];

        let sumBchHT = 0, sumBchTVA = 0, sumBchTimbre = 0, sumBchTTC = 0;
        const blRows = blList.map((b, i) => {
          const fullB = (typeof DB !== 'undefined' && b.id) ? (DB.getById('bls', b.id) || b) : b;
          const isRet = b.status === 'returned' || fullB.status === 'returned' || b.isReturned || fullB.isReturned;
          const bHT = Number(b.totalHT ?? fullB.totalHT ?? 0);
          const bTVA = Number(b.tvaAmount ?? b.tva ?? fullB.tvaAmount ?? fullB.tva ?? 0);
          const bTimbre = Number(b.timbreAmount ?? b.timbre ?? fullB.timbreAmount ?? fullB.timbre ?? 0);
          const bTTC = Number(b.totalTTC ?? fullB.totalTTC ?? Math.round((bHT + bTVA + bTimbre) * 100) / 100) || 0;

          if (isRet) {
            sumBchHT -= bHT;
            sumBchTVA -= bTVA;
            sumBchTimbre -= bTimbre;
            sumBchTTC -= bTTC;
          } else {
            sumBchHT += bHT;
            sumBchTVA += bTVA;
            sumBchTimbre += bTimbre;
            sumBchTTC += bTTC;
          }

          const refText = this._t(b.ref || fullB.ref || '—') + (isRet ? (isAR ? ' (مرتجع)' : ' (RETOURNÉ)') : '');
          const cliText = this._t(b.clientName || fullB.clientName || (isAR ? 'زبون عادي' : 'Client Comptoir'));

          return [
            String(i+1).padStart(2, '0'),
            { content: refText, styles: isRet ? { textColor: [220, 38, 38], fontStyle: 'bold' } : {} },
            this._fmtDate(b.date || fullB.date),
            cliText,
            this._fmtMoney(bHT),
            this._fmtMoney(bTVA),
            this._fmtMoney(bTimbre),
            { content: (isRet ? '(-)' : '+') + this._fmtMoney(bTTC), styles: isRet ? { textColor: [220, 38, 38], fontStyle: 'bold' } : { textColor: [16, 185, 129] } }
          ];
        });

        sumBchHT = Math.round(sumBchHT * 100) / 100;
        sumBchTVA = Math.round(sumBchTVA * 100) / 100;
        sumBchTimbre = Math.round(sumBchTimbre * 100) / 100;
        sumBchTTC = Math.round(sumBchTTC * 100) / 100;

        if (!blList.length && sumBchTTC === 0) sumBchTTC = effectiveGross;

        const bchSign = sumBchTTC >= 0 ? '+' : '-';
        const bchColor = sumBchTTC >= 0 ? [16, 185, 129] : [220, 38, 38];

        // Total row for BCHs with HT, TVA, Timbre and TTC
        blRows.push([
          { content: isAR ? 'المجموع التراكمي الصافي لسندات الشحن' : 'TOTAL CUMULÉ DES BONS DE CHARGEMENT', colSpan: 4, styles: { halign: isAR ? 'left' : 'right', fontStyle: 'bold', fillColor: [240, 244, 248], textColor: C.BLACK } },
          { content: (sumBchHT < 0 ? '-' : '') + this._fmtMoney(Math.abs(sumBchHT)), styles: { halign: 'right', fontStyle: 'bold', fillColor: [240, 244, 248], textColor: C.BLACK } },
          { content: (sumBchTVA < 0 ? '-' : '') + this._fmtMoney(Math.abs(sumBchTVA)), styles: { halign: 'right', fontStyle: 'bold', fillColor: [240, 244, 248], textColor: [217, 119, 6] } },
          { content: (sumBchTimbre < 0 ? '-' : '') + this._fmtMoney(Math.abs(sumBchTimbre)), styles: { halign: 'right', fontStyle: 'bold', fillColor: [240, 244, 248], textColor: [124, 58, 237] } },
          { content: bchSign + this._fmtMoney(Math.abs(sumBchTTC)), styles: { halign: 'right', fontStyle: 'bold', textColor: bchColor, fillColor: [240, 244, 248] } }
        ]);

        const blColStyles = {};
        blCols.forEach((c, i) => { blColStyles[i] = { halign: c.halign, cellWidth: c.width }; });

        this._autoTable(doc, {
          startY: y,
          margin: { left: ML, right: MR },
          tableWidth: CW,
          theme: 'grid',
          head: [blCols.map(c => c.label)],
          body: blRows,
          headStyles: { fillColor: [59, 130, 246], textColor: C.WHITE, fontStyle: 'bold', fontSize: 7.8, cellPadding: 2, halign: 'center' },
          bodyStyles: { fontSize: 7.4, cellPadding: 1.6, valign: 'middle', lineColor: C.LINE, lineWidth: 0.15 },
          alternateRowStyles: { fillColor: [249, 250, 252] },
          columnStyles: blColStyles
        });

        y = doc.lastAutoTable.finalY + 8;
      }

      // ── Sub-header: Table 2 - Retours Marchandise déduits ──
      if (returnList && returnList.length > 0) {
        if (y + 35 > PH - 25) { doc.addPage(); y = MT + 8; }

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        this._tc(doc, [220, 38, 38]);
        this._text(doc, isAR ? `2. مرتجعات البضائع المخصومة (عدد سندات الإرجاع: ${returnList.length})` : `II. RETOURS MARCHANDISE DÉDUITS (BONS DE RETOUR : ${returnList.length} BR)`, ML, y);
        y += 4;

        const retCols = [
          {label:isAR ? 'الرقم' : 'N°', width:10, halign:'center'},
          {label:isAR ? 'سند الإرجاع' : 'BON DE RETOUR', width:34, halign:'center'},
          {label:isAR ? 'المرجع الأصلي' : 'BL ORIGINE', width:30, halign:'center'},
          {label:isAR ? 'التاريخ' : 'DATE', width:22, halign:'center'},
          {label:isAR ? 'الزبون والسبب' : 'CLIENT & MOTIF', width:58, halign: isAR ? 'right' : 'left'},
          {label:isAR ? 'الخصم ك.ر' : 'DÉDUCTION TTC', width:40, halign:'right'}
        ];

        const retRows = returnList.map((r, i) => [
          String(i+1).padStart(2, '0'),
          this._t(r.ref || '—'),
          this._t(r.blRef || '—'),
          this._fmtDate(r.date),
          this._t((r.clientName ? r.clientName + (r.motif ? ' - ' + r.motif : '') : (r.motif || (isAR ? 'إرجاع' : 'Retour')))),
          '- ' + this._fmtMoney(r.totalTTC || 0)
        ]);

        // Total row for Returns
        retRows.push([
          { content: isAR ? 'إجمالي مردودات البضائع المخصومة' : 'TOTAL RETOURS MARCHANDISE DÉDUITS', colSpan: 5, styles: { halign: 'right', fontStyle: 'bold', fillColor: [254, 242, 242], textColor: [220, 38, 38] } },
          { content: '- ' + this._fmtMoney(effectiveReturns), styles: { halign: 'right', fontStyle: 'bold', textColor: [220, 38, 38], fillColor: [254, 242, 242] } }
        ]);

        const retColStyles = {};
        retCols.forEach((c, i) => { retColStyles[i] = { halign: c.halign, cellWidth: c.width }; });

        this._autoTable(doc, {
          startY: y,
          margin: { left: ML, right: MR },
          tableWidth: CW,
          theme: 'grid',
          head: [retCols.map(c => c.label)],
          body: retRows,
          headStyles: { fillColor: [220, 38, 38], textColor: C.WHITE, fontStyle: 'bold', fontSize: 7.8, cellPadding: 2, halign: 'center' },
          bodyStyles: { fontSize: 7.4, cellPadding: 1.6, valign: 'middle', lineColor: C.LINE, lineWidth: 0.15 },
          alternateRowStyles: { fillColor: [255, 245, 245] },
          columnStyles: retColStyles
        });

        y = doc.lastAutoTable.finalY + 8;
      }

      // Multi-page pagination: hidePageNum = true so "Page 1 sur 2" is never printed on État de Vente (avoids bank confusion)
      const totalPages = doc.internal.getNumberOfPages();
      for (let p = 1; p <= totalPages; p++) {
        doc.setPage(p);
        this._drawFooter(doc, p, totalPages, true);
      }

      this._save(doc, `Etat_de_Vente_${(ref || period).replace(/[^a-zA-Z0-9-]/g, '_')}.pdf`);
    },

    /* ══════════════════════════════════════════════════════════
       BON DE CHARGEMENT — 2 VOLETS EN 1 SEULE PAGE A4
       Volet 1 (Chauffeur / Transporteur) + Découpe + Volet 2 (Usine / Chargement)
       Entête État de Vente + Logos + N° BCH + N° BL lié + N° BR lié + Clé Anti-Fraude
    ══════════════════════════════════════════════════════════ */
    _exportBonChargement(id) {
      let bc = DB.getById('bls', id);
      if (!bc) {
        const allBLs = DB.getAll('bls');
        bc = allBLs.find(b => String(b.id) === String(id)) || allBLs[allBLs.length - 1];
      }
      if (!bc) { this._notify('Bon de chargement introuvable', 'error'); return; }

      const isAR = typeof T !== 'undefined' && T.isRTL();
      const sup = bc.supplierId ? (DB.getById('suppliers', bc.supplierId) || {}) : (bc.brId ? (DB.getById('suppliers', (DB.getById('brs', bc.brId)||{}).supplierId) || {}) : {});
      const cli = bc.clientId ? (DB.getById('clients', bc.clientId) || {}) : {};
      const br = bc.linkedBrId ? DB.getById('brs', bc.linkedBrId) : (bc.brId ? DB.getById('brs', bc.brId) : null);

      const rawSettings = this._settings();
      const s = {
        ...rawSettings,
        companyName: rawSettings.evCompanyName || rawSettings.companyName || 'SOCIÉTÉ',
        activityType: rawSettings.evActivityType || rawSettings.activityType || '',
        address: rawSettings.evAddress || rawSettings.address || '',
        phone: rawSettings.evPhone || rawSettings.phone || '',
        email: rawSettings.evEmail || rawSettings.email || '',
        nif: rawSettings.evNif || rawSettings.nif || '',
        rc: rawSettings.evRc || rawSettings.rc || '',
        nis: rawSettings.evNis || rawSettings.nis || '',
        ai: rawSettings.evAi || rawSettings.ai || '',
        capital: rawSettings.evCapital || rawSettings.capital || '',
        logoLeft: rawSettings.logoLeft || rawSettings.evLogoLeft || rawSettings.leftLogo || '',
        logoRight: rawSettings.logoRight || rawSettings.evLogoRight || rawSettings.rightLogo || (sup && sup.logo ? sup.logo : '')
      };

      const doc = this._newDoc();
      const lines = bc.lines || [];
      const totalHT = Number(bc.totalHT) || 0;
      const timbre = Number(bc.timbreAmount) || 0;
      const tvaAmount = Number(bc.tvaAmount) || 0;
      const totalTTC = Number(bc.totalTTC) || (totalHT + tvaAmount + timbre);

      // Cross references
      const bchRef = this._t(bc.ref || `BCH-${String(bc.id).padStart(4,'0')}`);
      const blRef = bc.blRef ? this._t(bc.blRef) : (bc.partNum ? `BL-${String(bc.id).padStart(4,'0')}-P${String(bc.partNum).padStart(2,'0')}` : `BL-${String(bc.id).padStart(4,'0')}`);
      const brRef = br ? this._t(br.ref) : (bc.linkedBrId ? `BR-${bc.linkedBrId}` : 'En attente usine');

      // Cryptographic verification engine linking top and bottom halves against counterfeit
      const rawId = Number(bc.id || 1);
      const rawTTC = Math.round(Number(totalTTC || 0) * 100);
      const dateSeed = (bc.date || '').replace(/[^0-9]/g, '').slice(-4) || '2026';

      // 1. Primary pairing security hash:
      const secHash = Math.abs((rawId * 31337 + rawTTC * 17) % 899999 + 100000);
      const secCode = `SEC-${secHash}-${bchRef.replace(/[^a-zA-Z0-9]/g, '').slice(-6)}`;

      // 2. Secret cross-check checksum (2-character hex):
      const sumDigits = String(secHash).split('').reduce((acc, d) => acc + Number(d), 0);
      const chkVal = (sumDigits * 37 + rawId * 13 + (rawTTC % 997)) % 256;
      const chkHex = chkVal.toString(16).toUpperCase().padStart(2, '0');

      // 3. Hidden Top Cryptographic Authenticity Key (discreet watermark on top):
      const authScramble = Math.abs((secHash ^ 0x5A5A) * 7 + Number(dateSeed)) % 0xFFFFF;
      const authKey = `${authScramble.toString(16).toUpperCase().padStart(5, '0')}-${chkHex}`;

      const drawSingleVolet = (startY, voletNum, voletTitle, voletSub, badgeColor) => {
        let y = startY;

        // ── 0. Hidden Top Micro-Security Watermark (Discrete / Anti-Duplicate) ──
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(4.5);
        this._tc(doc, [148, 163, 184]);
        const hiddenTopText = isAR
          ? `كود الأمان الرقمي : #${authKey} • النسخة ${voletNum}/2 الأصلية • مصفوفة التحقق : ${secCode} • وثيقة غير قابلة للتكرار`
          : `AUTHENTICITÉ DIGITALE : #${authKey} • VOLET ${voletNum}/2 ORIGINAL • MATRICE SÉCURISÉE : ${secCode} • NON DUPLICABLE`;
        doc.text(hiddenTopText, ML + CW - 2, y + 2.4, { align: 'right' });
        doc.text(isAR ? 'وثيقة رسمية مؤمنة' : 'ORIGINAL SÉCURISÉ', ML + 2, y + 2.4);

        // 1. Company Header with Logos (Compact 12mm)
        y += 2.2;
        const SLOT_W = 24, SLOT_H = 12;
        const drawLogo = (src, sx) => {
          if (!src || typeof src !== 'string') return;
          const cleanSrc = src.trim();
          try {
            let ar = 1;
            let fmt = 'JPEG';
            if (cleanSrc.startsWith('data:image/png')) fmt = 'PNG';
            else if (cleanSrc.startsWith('data:image/gif')) fmt = 'GIF';
            else if (cleanSrc.startsWith('data:image/webp')) fmt = 'WEBP';
            try {
              if (doc.getImageProperties) {
                const props = doc.getImageProperties(cleanSrc);
                if (props && props.width && props.height) ar = props.width / props.height;
                if (props && props.fileType) fmt = props.fileType;
              }
            } catch (_) {}
            let w = SLOT_W, h = w / ar;
            if (h > SLOT_H) { h = SLOT_H; w = h * ar; }
            if (w > SLOT_W) { w = SLOT_W; h = w / ar; }
            doc.addImage(cleanSrc, fmt, sx + Math.max(0, (SLOT_W - w) / 2), y + Math.max(0, (SLOT_H - h) / 2), w, h);
          } catch(e) {}
        };
        drawLogo(s.logoLeft, ML);
        drawLogo(s.logoRight, PW - MR - SLOT_W);

        const cName = this._t(s.companyName || '/');
        if (this._hasAr(cName) && _arFontB64) doc.setFont(AR_FONT_NAME, 'normal');
        else doc.setFont('helvetica', 'bold');
        doc.setFontSize(9.5);
        this._tc(doc, C.PRIMARY || [13, 148, 136]);
        doc.text(cName.toUpperCase(), PW / 2, y + 4.5, { align: 'center' });

        const bchCompAct = s.activityType || s.evActivityType || '';
        if (bchCompAct) {
          doc.setFontSize(6.5);
          this._tc(doc, [100, 116, 139]);
          const actLabel = isAR ? ('النشاط : ' + bchCompAct) : ('Activité : ' + bchCompAct);
          const actT = this._t(actLabel);
          if (this._hasAr(actT) && _arFontB64) doc.setFont(AR_FONT_NAME, 'normal');
          else doc.setFont('helvetica', 'bold');
          doc.text(actT, PW / 2, y + 7.5, { align: 'center' });
        }

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(6.5);
        this._tc(doc, [71, 85, 105]);
        const bchLegY = bchCompAct ? (y + 10.5) : (y + 8);
        const leg1 = [s.nif && `NIF : ${s.nif}`, s.rc && `RC : ${s.rc}`, s.nis && `NIS : ${s.nis}`, s.ai && `AI : ${s.ai}`].filter(Boolean).join('  |  ');
        if (leg1) doc.text(leg1, PW / 2, bchLegY, { align: 'center' });
        const leg2 = [s.address && `Adresse : ${this._t(s.address)}`, s.phone && `Tél : ${s.phone}`].filter(Boolean).join('  |  ');
        if (leg2) doc.text(leg2, PW / 2, bchLegY + 3.2, { align: 'center' });
        y += bchCompAct ? 16 : 13.5;

        // 2. Banner with Title & Volet Badge (7mm)
        doc.setFillColor(241, 245, 249);
        doc.roundedRect(ML, y, CW, 7, 1.2, 1.2, 'F');
        doc.setDrawColor(203, 213, 225);
        doc.setLineWidth(0.3);
        doc.roundedRect(ML, y, CW, 7, 1.2, 1.2, 'S');

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        this._tc(doc, [15, 23, 42]);
        this._text(doc, isAR ? 'وصل الشحن' : 'BON DE CHARGEMENT', ML + 4, y + 4.8);

        // Volet badge on the right
        doc.setFillColor(...badgeColor);
        doc.roundedRect(ML + CW - 78, y + 1, 76, 5, 1, 1, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(6.5);
        this._tc(doc, [255, 255, 255]);
        this._text(doc, isAR ? `النسخة ${voletNum} : ${voletTitle}` : `VOLET ${voletNum} : ${voletTitle}`, ML + CW - 40, y + 4.3, { align: 'center' });
        y += 8;

        // 3. Info Strip: N° BCH, Date, N° BL lié, N° BR lié, Chauffeur, Immat (8mm)
        this._rect(doc, ML, y, CW, 7.5, [248, 250, 252], [226, 232, 240]);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7);
        this._tc(doc, [15, 23, 42]);
        const colW = CW / 6;
        this._text(doc, isAR ? 'رقم وصل الشحن :' : 'N° BCH :', ML + 2, y + 3.2);
        doc.setFont('helvetica', 'normal');
        doc.text(bchRef, ML + 2, y + 6.2);

        doc.setFont('helvetica', 'bold');
        this._text(doc, isAR ? 'التاريخ :' : 'Date :', ML + colW + 2, y + 3.2);
        doc.setFont('helvetica', 'normal');
        doc.text(this._fmtDate(bc.date), ML + colW + 2, y + 6.2);

        doc.setFont('helvetica', 'bold');
        this._text(doc, isAR ? 'وصل التسليم المرتبط :' : 'BL Lié :', ML + colW*2 + 2, y + 3.2);
        doc.setFont('helvetica', 'normal');
        doc.text(blRef, ML + colW*2 + 2, y + 6.2);

        doc.setFont('helvetica', 'bold');
        this._text(doc, isAR ? 'وصل الاستلام المرتبط :' : 'BR Lié :', ML + colW*3 + 2, y + 3.2);
        doc.setFont('helvetica', 'normal');
        doc.text(brRef, ML + colW*3 + 2, y + 6.2);

        doc.setFont('helvetica', 'bold');
        this._text(doc, isAR ? 'السائق :' : 'Chauffeur :', ML + colW*4 + 2, y + 3.2);
        doc.setFont('helvetica', 'normal');
        this._text(doc, this._t((bc.driverName || '/').slice(0, 18)), ML + colW*4 + 2, y + 6.2);

        doc.setFont('helvetica', 'bold');
        this._text(doc, isAR ? 'رقم اللوحة :' : 'Immat :', ML + colW*5 + 2, y + 3.2);
        doc.setFont('helvetica', 'normal');
        doc.text(this._t(bc.truckIMM || '/'), ML + colW*5 + 2, y + 6.2);
        y += 9;

        // 4. Entity boxes (Usine Origine & Client Destinataire) — 22mm
        const gap = 3, cw2 = (CW - gap) / 2, boxH = 22;
        // Left: Usine
        const supName = this._t(sup.name || bc.supplierName || 'Usine non spécifiée');
        this._rect(doc, ML, y, cw2, boxH, [255, 255, 255], [226, 232, 240]);
        doc.setFillColor(241, 245, 249);
        doc.rect(ML, y, cw2, 4, 'F');
        doc.setFont('helvetica', 'bold'); doc.setFontSize(6.5); this._tc(doc, [51, 65, 85]);
        this._text(doc, isAR ? 'مصدر الشحن (المصنع)' : 'ORIGINE DU CHARGEMENT (USINE)', ML + 2, y + 3);
        doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); this._tc(doc, [15, 23, 42]);
        this._text(doc, supName.slice(0, 38), ML + 2, y + 7.5);
        const bchSupActivity = sup.activityType || s.activityType || s.evActivityType || '';
        if (bchSupActivity) {
          doc.setFont('helvetica', 'bold'); doc.setFontSize(5.8); this._tc(doc, [100, 116, 139]);
          this._text(doc, (isAR ? 'النشاط : ' : 'Activité : ') + bchSupActivity, ML + 2, y + 10.2);
        }
        doc.setFont('helvetica', 'normal'); doc.setFontSize(6.2); this._tc(doc, [71, 85, 105]);
        this._text(doc, `RC : ${sup.rc || s.rc || '-'}  |  NIF : ${sup.nif || s.nif || '-'}`, ML + 2, y + (bchSupActivity ? 13 : 11.2));
        this._text(doc, `${isAR ? 'العنوان' : 'Adresse'} : ${this._t(sup.address || s.address || '-').slice(0, 42)}`, ML + 2, y + (bchSupActivity ? 16 : 14.8));
        this._text(doc, `${isAR ? 'الهاتف' : 'Tél'} : ${sup.phone || s.phone || bc.driverPhone || '-'}`, ML + 2, y + (bchSupActivity ? 19 : 18.4));

        // Right: Client
        const cliName = this._t(cli.name || bc.clientName || (isAR ? 'الزبون المستلم' : 'Client Destinataire'));
        const destAddr = this._t(bc.destinationAddress || cli.address || '-');
        this._rect(doc, ML + cw2 + gap, y, cw2, boxH, [255, 255, 255], [226, 232, 240]);
        doc.setFillColor(241, 245, 249);
        doc.rect(ML + cw2 + gap, y, cw2, 4, 'F');
        doc.setFont('helvetica', 'bold'); doc.setFontSize(6.5); this._tc(doc, [51, 65, 85]);
        this._text(doc, isAR ? 'الزبون / المستلم' : 'CLIENT / DESTINATAIRE', ML + cw2 + gap + 2, y + 3);
        doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); this._tc(doc, [15, 23, 42]);
        this._text(doc, cliName.slice(0, 38), ML + cw2 + gap + 2, y + 7.5);
        const bchCliActivity = cli.activityType || '';
        if (bchCliActivity) {
          doc.setFont('helvetica', 'bold'); doc.setFontSize(5.8); this._tc(doc, [100, 116, 139]);
          this._text(doc, (isAR ? 'النشاط : ' : 'Activité : ') + bchCliActivity, ML + cw2 + gap + 2, y + 10.2);
        }
        doc.setFont('helvetica', 'normal'); doc.setFontSize(6.2); this._tc(doc, [71, 85, 105]);
        this._text(doc, `RC : ${cli.rc || '-'}  |  NIF : ${cli.nif || '-'}`, ML + cw2 + gap + 2, y + (bchCliActivity ? 13 : 11.2));
        this._text(doc, `${isAR ? 'الوجهة' : 'Destination'} : ${destAddr.slice(0, 40)}`, ML + cw2 + gap + 2, y + (bchCliActivity ? 16 : 14.8));
        this._text(doc, `${isAR ? 'الهاتف' : 'Tél'} : ${cli.phone || '-'}${cli.nis ? '  |  NIS : ' + cli.nis : ''}`, ML + cw2 + gap + 2, y + (bchCliActivity ? 19 : 18.4));
        y += boxH + 2;

        // 5. Items Table (6 cols: N°, DÉSIGNATION, UNITÉ, QTÉ, P.U. HT, TOTAL HT)
        const colDef = [
          { label: isAR ? 'الرقم' : 'N°', w: 10, align: 'center' },
          { label: isAR ? 'بيان التوريدات' : 'DÉSIGNATION DES FOURNITURES', w: 82, align: 'left' },
          { label: isAR ? 'الوحدة' : 'UNITÉ', w: 14, align: 'center' },
          { label: isAR ? 'الكمية' : 'QTÉ', w: 20, align: 'center' },
          { label: isAR ? 'سعر الوحدة خ.ر' : 'P.U. HT', w: 32, align: 'right' },
          { label: isAR ? 'المجموع خ.ر' : 'TOTAL HT', w: 36, align: 'right' }
        ];

        // Table Header
        this._rect(doc, ML, y, CW, 5, C.PRIMARY || [13, 148, 136], C.PRIMARY || [13, 148, 136]);
        doc.setFont('helvetica', 'bold'); doc.setFontSize(6.5); this._tc(doc, [255, 255, 255]);
        let cx = ML;
        colDef.forEach(c => {
          if (c.align === 'center') doc.text(c.label, cx + c.w / 2, y + 3.6, { align: 'center' });
          else if (c.align === 'right') doc.text(c.label, cx + c.w - 2, y + 3.6, { align: 'right' });
          else doc.text(c.label, cx + 2, y + 3.6);
          cx += c.w;
        });
        y += 5;

        // Table Rows (max 4 displayed cleanly in volet)
        const maxRows = 4;
        const visibleLines = lines.slice(0, maxRows);
        const rowH = 4.8;
        visibleLines.forEach((l, i) => {
          const qty = Number(l.qtyDelivered || l.qty || 0);
          const pu = Number(l.price || 0);
          const disc = Number(l.disc || 0);
          const tot = Math.round(qty * pu * (1 - disc / 100) * 100) / 100;

          const rowBg = i % 2 === 0 ? [255, 255, 255] : [248, 250, 252];
          this._rect(doc, ML, y, CW, rowH, rowBg, [226, 232, 240]);

          doc.setFont('helvetica', 'normal'); doc.setFontSize(6.5); this._tc(doc, [30, 41, 59]);
          let rx = ML;
          // N°
          doc.text(String(i + 1).padStart(2, '0'), rx + 5, y + 3.4, { align: 'center' });
          rx += 10;
          // Désignation
          doc.text(this._t(l.designation || 'Article').slice(0, 46), rx + 2, y + 3.4);
          rx += 82;
          // Unité
          doc.text(this._t(l.unit || 'U'), rx + 7, y + 3.4, { align: 'center' });
          rx += 14;
          // Qté (Clean space formatting!)
          doc.setFont('helvetica', 'bold');
          doc.text(this._fmtNum(qty), rx + 10, y + 3.4, { align: 'center' });
          rx += 20;
          // P.U. HT
          doc.setFont('helvetica', 'normal');
          doc.text(this._fmtMoney(pu) + (disc ? ` (-${disc}%)` : ''), rx + 30, y + 3.4, { align: 'right' });
          rx += 32;
          // Total HT
          doc.setFont('helvetica', 'bold');
          doc.text(this._fmtMoney(tot), rx + 34, y + 3.4, { align: 'right' });
          y += rowH;
        });

        if (!visibleLines.length) {
          this._rect(doc, ML, y, CW, rowH, [255, 255, 255], [226, 232, 240]);
          doc.setFont('helvetica', 'normal'); doc.setFontSize(6.5); this._tc(doc, [148, 163, 184]);
          doc.text('01', ML + 5, y + 3.4, { align: 'center' });
          doc.text('Marchandise diverse', ML + 12, y + 3.4);
          doc.text('U', ML + 99, y + 3.4, { align: 'center' });
          doc.text('0', ML + 116, y + 3.4, { align: 'center' });
          doc.text('0,00 DA', ML + 146, y + 3.4, { align: 'right' });
          doc.text('0,00 DA', ML + 188, y + 3.4, { align: 'right' });
          y += rowH;
        }

        // Totals Summary Bar (6mm)
        this._rect(doc, ML, y, CW, 5.5, [241, 245, 249], [203, 213, 225]);
        doc.setFont('helvetica', 'bold'); doc.setFontSize(7); this._tc(doc, [15, 23, 42]);
        this._text(doc, `${isAR ? 'المجموع خ.ر' : 'TOTAL HT'} : ${this._fmtMoney(totalHT)}`, ML + 4, y + 3.8);
        if (tvaAmount > 0) {
          this._text(doc, `${isAR ? 'الرسم 19%' : 'TVA 19%'} : ${this._fmtMoney(tvaAmount)}`, ML + 58, y + 3.8);
          if (timbre > 0) this._text(doc, `${isAR ? 'الطابع' : 'TIMBRE'} : ${this._fmtMoney(timbre)}`, ML + 112, y + 3.8);
        } else {
          if (timbre > 0) this._text(doc, `${isAR ? 'الطابع' : 'TIMBRE'} : ${this._fmtMoney(timbre)}`, ML + 75, y + 3.8);
        }
        doc.setFontSize(7.5); this._tc(doc, C.PRIMARY || [13, 148, 136]);
        this._text(doc, `${isAR ? 'المجموع ك.ر' : 'TOTAL TTC'} : ${this._fmtMoney(totalTTC)}`, ML + CW - 4, y + 3.8, { align: 'right' });
        y += 6.8;

        // 6. Anti-Counterfeit Verification Strip linking both volets (4.5mm)
        this._rect(doc, ML, y, CW, 4.2, [254, 243, 199], [251, 191, 36]);
        doc.setFont('helvetica', 'bold'); doc.setFontSize(5.5); this._tc(doc, [146, 64, 14]);
        this._text(doc, isAR
          ? `حماية ضد التزوير | رمز : ${secCode} | تدقيق : #${chkHex} | النسخة ${voletNum}/${voletNum === 1 ? '2' : '1'} مطابقة ومؤمنة`
          : `SÉCURITÉ ANTI-FRAUDE | CODE : ${secCode} | CONTRÔLE : #${chkHex} | VOLET ${voletNum}/${voletNum === 1 ? '2' : '1'} APPARIÉ`,
          ML + CW / 2, y + 3, { align: 'center' });
        y += 5.2;

        // 7. Signature Blocks (3 boxes: Émetteur Caisse, Chauffeur, Usine) — 13mm
        const sigW = (CW - 4) / 3, sigH = 12.5;
        // Sig 1: Caisse
        this._rect(doc, ML, y, sigW, sigH, [255, 255, 255], [203, 213, 225]);
        doc.setFont('helvetica', 'bold'); doc.setFontSize(6); this._tc(doc, [51, 65, 85]);
        this._text(doc, isAR ? 'تأشيرة / أمين الصندوق' : 'VISA / CAISSIER ÉMETTEUR', ML + 2, y + 3);
        doc.setFont('helvetica', 'normal'); doc.setFontSize(5); this._tc(doc, [148, 163, 184]);
        this._text(doc, isAR ? 'التاريخ وختم الصندوق' : 'Date & Cachet Caisse', ML + 2, y + sigH - 1.5);

        // Sig 2: Chauffeur
        this._rect(doc, ML + sigW + 2, y, sigW, sigH, [255, 255, 255], [203, 213, 225]);
        doc.setFont('helvetica', 'bold'); doc.setFontSize(6); this._tc(doc, [51, 65, 85]);
        this._text(doc, isAR ? 'السائق / الناقل' : 'LE CHAUFFEUR / TRANSPORTEUR', ML + sigW + 4, y + 3);
        doc.setFont('helvetica', 'italic'); doc.setFontSize(5); this._tc(doc, [148, 163, 184]);
        this._text(doc, isAR ? '« استلمت البضائع بحالة جيدة »' : '« Reçu marchandises en bon état »', ML + sigW + 4, y + sigH - 1.5);

        // Sig 3: Usine
        this._rect(doc, ML + (sigW + 2) * 2, y, sigW, sigH, [255, 255, 255], [203, 213, 225]);
        doc.setFont('helvetica', 'bold'); doc.setFontSize(6); this._tc(doc, [51, 65, 85]);
        this._text(doc, isAR ? 'تأكيد المصنع / الشحن' : 'VALIDATION USINE / CHARGEMENT', ML + (sigW + 2) * 2 + 2, y + 3);
        doc.setFont('helvetica', 'normal'); doc.setFontSize(5); this._tc(doc, [148, 163, 184]);
        this._text(doc, isAR ? 'ختم المصنع والموافقة على الشحن' : 'Cachet Usine & Bon à charger', ML + (sigW + 2) * 2 + 2, y + sigH - 1.5);
      };

      // ── DRAW VOLET 1 (Top Half: Chauffeur / Transporteur) ──
      drawSingleVolet(5, 1, 'CHAUFFEUR / TRANSPORTEUR', '(À remettre au chauffeur pour circulation)', [13, 148, 136]);

      // ── CUT / PERFORATION LINE (prominent for A4 cut) ──
      const cutY = 147;
      doc.setDrawColor(120, 130, 150);
      doc.setLineWidth(0.4);
      doc.setLineDash([3, 2], 0);
      doc.line(ML, cutY - 1.5, ML + CW, cutY - 1.5);
      doc.line(ML, cutY + 1.5, ML + CW, cutY + 1.5);
      doc.setLineDash([]);
      doc.setLineWidth(0.2);

      doc.setFillColor(255, 255, 255);
      doc.rect(ML + (CW - 110)/2, cutY - 3, 110, 6, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.5);
      this._tc(doc, [80, 90, 110]);
      doc.text('--- DECOUPER ICI --- LIGNE DE SEPARATION DES DEUX VOLETS --- DECOUPER ICI ---', ML + CW/2, cutY + 1, { align: 'center' });

      // ── DRAW VOLET 2 (Bottom Half: Usine / Fournisseur Chargement) ──
      drawSingleVolet(152, 2, 'USINE / FOURNISSEUR (CHARGEMENT & SOUCHE)', '(À conserver par l\'usine après validation)', [30, 41, 59]);

      // Strictly enforce 1 single page!
      while (doc.getNumberOfPages() > 1) {
        doc.deletePage(doc.getNumberOfPages());
      }
      
      this._save(doc, `BON_CHARGEMENT_${bchRef.replace(/\//g, '_')}.pdf`);
    },

    /* ══════════════════════════════════════════════════════════
       BL — BON DE LIVRAISON — 2 VOLETS EN 1 SEULE PAGE A4
       Volet 1 (Client / Réception) + Découpe + Volet 2 (Souche / Archives)
       Cross-références : N° BL + N° BCH lié + N° BR lié + Clé Anti-Fraude
    ══════════════════════════════════════════════════════════ */
    _exportBL(id, isRoadOnly = false) {
      let bl = DB.getById('bls', id);
      if (!bl) {
        const allBLs = DB.getAll('bls');
        bl = allBLs.find(b => String(b.id) === String(id)) || allBLs[allBLs.length - 1];
      }
      if(!bl) { this._notify('BL introuvable','error'); return; }
      const isAR = typeof T !== 'undefined' && T.isRTL();
      const br  = bl.brId ? DB.getById('brs',bl.brId) : (bl.linkedBrId ? DB.getById('brs', bl.linkedBrId) : null);
      const sup = br ? (DB.getById('suppliers',br.supplierId)||{}) : (bl.supplierId ? (DB.getById('suppliers', bl.supplierId)||{}) : {});
      const cli = bl.clientId ? DB.getById('clients',bl.clientId)||{} : {};
      const rawSettings = this._settings();
      const s = {
        ...rawSettings,
        companyName: rawSettings.companyName || rawSettings.evCompanyName || 'SOCIÉTÉ',
        activityType: rawSettings.activityType || rawSettings.evActivityType || '',
        address: rawSettings.address || rawSettings.evAddress || '',
        phone: rawSettings.phone || rawSettings.evPhone || '',
        email: rawSettings.email || rawSettings.evEmail || '',
        nif: rawSettings.nif || rawSettings.evNif || '',
        rc: rawSettings.rc || rawSettings.evRc || '',
        nis: rawSettings.nis || rawSettings.evNis || '',
        ai: rawSettings.ai || rawSettings.evAi || '',
        capital: rawSettings.capital || rawSettings.evCapital || '',
        logoLeft: rawSettings.logoLeft || rawSettings.leftLogo || rawSettings.evLogoLeft || '',
        logoRight: rawSettings.logoRight || rawSettings.rightLogo || rawSettings.evLogoRight || (sup && sup.logo ? sup.logo : '')
      };
      const doc = this._newDoc();

      const lines    = bl.lines||(br?br.lines||[]:[]);
      const totalHT  = bl.totalHT ||(br?br.totalHT:0)||0;
      const timbre   = bl.timbreAmount||(br?br.timbreAmount:0)||0;
      const totalTTC = bl.totalTTC||(br?br.totalTTC:0)||0;

      // References — BCH ref for traceability
      const bchRef = this._t(bl.ref || `BCH/${String(bl.id).padStart(4,'0')}`);
      const brRef = br ? this._t(br.ref) : (bl.linkedBrId ? `BR/${bl.linkedBrId}` : (bl.brId ? `BR/${bl.brId}` : '/'));

      // Cryptographic verification engine linking BL and BCH
      const rawId = Number(bl.id || 1);
      const rawTTC = Math.round(Number(totalTTC || 0) * 100);
      const dateSeed = (bl.date || '').replace(/[^0-9]/g, '').slice(-4) || '2026';
      const secHash = Math.abs((rawId * 31337 + rawTTC * 17) % 899999 + 100000);
      const secCode = `SEC-${secHash}-${bchRef.replace(/[^a-zA-Z0-9]/g, '').slice(-6)}`;
      const sumDigits = String(secHash).split('').reduce((acc, d) => acc + Number(d), 0);
      const chkVal = (sumDigits * 37 + rawId * 13 + (rawTTC % 997)) % 256;
      const chkHex = chkVal.toString(16).toUpperCase().padStart(2, '0');
      const authScramble = Math.abs((secHash ^ 0x5A5A) * 7 + Number(dateSeed)) % 0xFFFFF;
      const authKey = `${authScramble.toString(16).toUpperCase().padStart(5, '0')}-${chkHex}`;

      let y = MT;

      // ── 0. Hidden Top Micro-Security Watermark (Discrete / Anti-Duplicate) ──
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(4.5);
      this._tc(doc, [148, 163, 184]);
      doc.text(isAR
        ? `كود الأمان الرقمي : #${authKey} • النسخة الأصلية • مصفوفة التحقق : ${secCode} • وثيقة غير قابلة للتكرار`
        : `AUTHENTICITÉ DIGITALE : #${authKey} • DOCUMENT ORIGINAL FACTURE • MATRICE : ${secCode} • NON DUPLICABLE`,
        ML + CW - 2, MT - 2.5, { align: 'right' });
      doc.text(isAR ? 'وثيقة رسمية مؤمنة' : 'ORIGINAL SÉCURISÉ', ML, MT - 2.5);

      // ── 1. Company Header with Logos ──
      const SLOT_W = 28, SLOT_H = 16;
      const drawLogo = (src, sx) => {
        if (!src || typeof src !== 'string') return;
        const cleanSrc = src.trim();
        try {
          let ar = 1;
          let fmt = 'JPEG';
          if (cleanSrc.startsWith('data:image/png')) fmt = 'PNG';
          else if (cleanSrc.startsWith('data:image/gif')) fmt = 'GIF';
          else if (cleanSrc.startsWith('data:image/webp')) fmt = 'WEBP';
          try {
            if (doc.getImageProperties) {
              const props = doc.getImageProperties(cleanSrc);
              if (props && props.width && props.height) ar = props.width / props.height;
              if (props && props.fileType) fmt = props.fileType;
            }
          } catch (_) {}
          let w = SLOT_W, h = w / ar;
          if (h > SLOT_H) { h = SLOT_H; w = h * ar; }
          if (w > SLOT_W) { w = SLOT_W; h = w / ar; }
          doc.addImage(cleanSrc, fmt, sx + Math.max(0, (SLOT_W - w) / 2), y + Math.max(0, (SLOT_H - h) / 2), w, h);
        } catch(e) {}
      };
      drawLogo(s.logoLeft, ML);
      drawLogo(s.logoRight, PW - MR - SLOT_W);

      const cName = this._t(s.companyName || '/');
      if (this._hasAr(cName) && _arFontB64) doc.setFont(AR_FONT_NAME, 'normal');
      else doc.setFont('helvetica', 'bold');
      doc.setFontSize(12);
      this._tc(doc, C.PRIMARY);
      doc.text(cName.toUpperCase(), PW / 2, y + 6, { align: 'center' });

      const compAct = s.activityType || s.evActivityType || '';
      if (compAct) {
        doc.setFontSize(8);
        this._tc(doc, [100, 116, 139]);
        const actLabel = isAR ? ('النشاط : ' + compAct) : ('Activité : ' + compAct);
        const actT = this._t(actLabel);
        if (this._hasAr(actT) && _arFontB64) doc.setFont(AR_FONT_NAME, 'normal');
        else doc.setFont('helvetica', 'bold');
        doc.text(actT, PW / 2, y + 9.8, { align: 'center' });
      }

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      this._tc(doc, [71, 85, 105]);
      const legY = compAct ? (y + 13.5) : (y + 10.5);
      const leg1 = [s.nif && `NIF : ${s.nif}`, s.rc && `RC : ${s.rc}`, s.nis && `NIS : ${s.nis}`, s.ai && `AI : ${s.ai}`].filter(Boolean).join('  |  ');
      if (leg1) doc.text(leg1, PW / 2, legY, { align: 'center' });
      const leg2 = [s.address && `Adresse : ${this._t(s.address)}`, s.phone && `Tel : ${s.phone}`].filter(Boolean).join('  |  ');
      if (leg2) doc.text(leg2, PW / 2, legY + 4, { align: 'center' });
      y += compAct ? 22 : 18;

      // ── 2. Title Banner ──
      doc.setFillColor(...C.PRIMARY);
      doc.roundedRect(ML, y, CW, 10, 1.5, 1.5, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(13);
      this._tc(doc, C.WHITE);
      this._text(doc, isAR ? 'وصل تسليم - فاتورة' : 'BON DE LIVRAISON - FACTURE', PW / 2, y + 7, { align: 'center' });
      y += 12;

      // ── 3. Info Strip (N° BCH, Date, BR Ref, Chauffeur, Immat) ──
      this._rect(doc, ML, y, CW, 10, [248, 250, 252], [226, 232, 240]);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      this._tc(doc, [15, 23, 42]);
      const iColW = CW / 5;
      this._text(doc, isAR ? 'رقم وصل الشحن :' : 'N BCH :', ML + 2, y + 4);
      doc.setFont('helvetica', 'normal');
      doc.text(bchRef, ML + 2, y + 8);

      doc.setFont('helvetica', 'bold');
      this._text(doc, isAR ? 'التاريخ :' : 'Date :', ML + iColW + 2, y + 4);
      doc.setFont('helvetica', 'normal');
      doc.text(this._fmtDate(bl.date), ML + iColW + 2, y + 8);

      doc.setFont('helvetica', 'bold');
      this._text(doc, isAR ? 'مرجع و.ا :' : 'BR Ref :', ML + iColW*2 + 2, y + 4);
      doc.setFont('helvetica', 'normal');
      doc.text(brRef, ML + iColW*2 + 2, y + 8);

      doc.setFont('helvetica', 'bold');
      this._text(doc, isAR ? 'السائق :' : 'Chauffeur :', ML + iColW*3 + 2, y + 4);
      doc.setFont('helvetica', 'normal');
      this._text(doc, this._t((bl.driverName || '/').slice(0, 20)), ML + iColW*3 + 2, y + 8);

      doc.setFont('helvetica', 'bold');
      this._text(doc, isAR ? 'رقم اللوحة :' : 'Immat :', ML + iColW*4 + 2, y + 4);
      doc.setFont('helvetica', 'normal');
      this._text(doc, this._t(bl.truckIMM || '/'), ML + iColW*4 + 2, y + 8);
      y += 12;

      // ── 4. Entity boxes (Fournisseur & Client) ──
      const gap = 4, cw2 = (CW - gap) / 2, boxH = 26;
      // Left: Fournisseur
      const supName = this._t(s.companyName || sup.name || 'Fournisseur');
      this._rect(doc, ML, y, cw2, boxH, [255, 255, 255], [226, 232, 240]);
      doc.setFillColor(241, 245, 249);
      doc.rect(ML, y, cw2, 5, 'F');
      doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); this._tc(doc, [51, 65, 85]);
      this._text(doc, isAR ? 'المورد / المرسل' : 'FOURNISSEUR / EXPEDITEUR', ML + 3, y + 3.5);
      doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); this._tc(doc, [15, 23, 42]);
      this._text(doc, supName.slice(0, 40), ML + 3, y + 9.5);
      const supActivity = sup.activityType || s.activityType || s.evActivityType || '';
      if (supActivity) {
        doc.setFont('helvetica', 'bold'); doc.setFontSize(6.8); this._tc(doc, [100, 116, 139]);
        this._text(doc, (isAR ? 'النشاط : ' : 'Activité : ') + supActivity, ML + 3, y + 13);
      }
      doc.setFont('helvetica', 'normal'); doc.setFontSize(7); this._tc(doc, [71, 85, 105]);
      this._text(doc, `RC : ${s.rc || sup.rc || '-'}  |  NIF : ${s.nif || sup.nif || '-'}`, ML + 3, y + (supActivity ? 16.5 : 13.8));
      this._text(doc, `${isAR ? 'العنوان' : 'Adresse'} : ${this._t(s.address || sup.address || '-').slice(0, 42)}`, ML + 3, y + (supActivity ? 19.8 : 17.6));
      this._text(doc, `${isAR ? 'الهاتف' : 'Tél'} : ${s.phone || sup.phone || '-'}${s.nis ? '  |  NIS : ' + s.nis : ''}`, ML + 3, y + (supActivity ? 23.2 : 21.4));

      // Right: Client
      const cliName = this._t(cli.name || bl.clientName || (isAR ? 'الزبون المستلم' : 'Client Destinataire'));
      const wilayaDest = bl.destinationAddress || bl.wilaya || cli.address || '-';
      this._rect(doc, ML + cw2 + gap, y, cw2, boxH, [255, 255, 255], [226, 232, 240]);
      doc.setFillColor(241, 245, 249);
      doc.rect(ML + cw2 + gap, y, cw2, 5, 'F');
      doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); this._tc(doc, [51, 65, 85]);
      this._text(doc, isAR ? 'الزبون / المستلم' : 'CLIENT / DESTINATAIRE', ML + cw2 + gap + 3, y + 3.5);
      doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); this._tc(doc, [15, 23, 42]);
      this._text(doc, cliName.slice(0, 40), ML + cw2 + gap + 3, y + 9.5);
      const cliActivity = cli.activityType || '';
      if (cliActivity) {
        doc.setFont('helvetica', 'bold'); doc.setFontSize(6.8); this._tc(doc, [100, 116, 139]);
        this._text(doc, (isAR ? 'النشاط : ' : 'Activité : ') + cliActivity, ML + cw2 + gap + 3, y + 13);
      }
      doc.setFont('helvetica', 'normal'); doc.setFontSize(7); this._tc(doc, [71, 85, 105]);
      this._text(doc, `RC : ${cli.rc || '-'}  |  NIF : ${cli.nif || '-'}`, ML + cw2 + gap + 3, y + (cliActivity ? 16.5 : 13.8));
      this._text(doc, `${isAR ? 'العنوان' : 'Adresse'} : ${this._t(wilayaDest).slice(0, 42)}`, ML + cw2 + gap + 3, y + (cliActivity ? 19.8 : 17.6));
      this._text(doc, `${isAR ? 'الهاتف' : 'Tél'} : ${cli.phone || '-'}${cli.nis ? '  |  NIS : ' + cli.nis : ''}`, ML + cw2 + gap + 3, y + (cliActivity ? 23.2 : 21.4));
      y += boxH + 3;

      // ── 5. Items Table ──
      const colDef = [
        { label: isAR ? 'الرقم' : 'N°', w: 10, align: 'center' },
        { label: isAR ? 'بيان التوريدات / البضائع' : 'DESIGNATION DES FOURNITURES / MARCHANDISES', w: 82, align: 'left' },
        { label: isAR ? 'الوحدة' : 'UNITE', w: 14, align: 'center' },
        { label: isAR ? 'الكمية' : 'QTE', w: 20, align: 'center' },
        { label: isAR ? 'سعر الوحدة خ.ر' : 'P.U. HT', w: 32, align: 'right' },
        { label: isAR ? 'المجموع خ.ر' : 'TOTAL HT', w: 36, align: 'right' }
      ];

      // Table Header
      this._rect(doc, ML, y, CW, 6, C.PRIMARY, C.PRIMARY);
      doc.setFont('helvetica', 'bold'); doc.setFontSize(7); this._tc(doc, C.WHITE);
      let cx = ML;
      colDef.forEach(c => {
        if (c.align === 'center') doc.text(c.label, cx + c.w / 2, y + 4, { align: 'center' });
        else if (c.align === 'right') doc.text(c.label, cx + c.w - 2, y + 4, { align: 'right' });
        else doc.text(c.label, cx + 2, y + 4);
        cx += c.w;
      });
      y += 6;

      // Table Rows (up to 12 rows for full page)
      const maxRows = 12;
      const visibleLines = lines.slice(0, maxRows);
      const rowH = 6;
      visibleLines.forEach((l, i) => {
        const qty = Number(l.qtyDelivered || l.qty || 0);
        const pu = Number(l.price || 0);
        const disc = Number(l.disc || 0);
        const tot = Math.round(qty * pu * (1 - disc / 100) * 100) / 100;

        const rowBg = i % 2 === 0 ? [255, 255, 255] : [248, 250, 252];
        this._rect(doc, ML, y, CW, rowH, rowBg, [226, 232, 240]);

        doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); this._tc(doc, [30, 41, 59]);
        let rx = ML;
        doc.text(String(i + 1).padStart(2, '0'), rx + 5, y + 4, { align: 'center' });
        rx += 10;
        doc.text(this._t(l.designation || 'Marchandise').slice(0, 50), rx + 2, y + 4);
        rx += 82;
        doc.text(this._t(l.unit || 'U'), rx + 7, y + 4, { align: 'center' });
        rx += 14;
        doc.setFont('helvetica', 'bold');
        doc.text(this._fmtNum(qty), rx + 10, y + 4, { align: 'center' });
        rx += 20;
        doc.setFont('helvetica', 'normal');
        doc.text(this._fmtMoney(pu) + (disc ? ` (-${disc}%)` : ''), rx + 30, y + 4, { align: 'right' });
        rx += 32;
        doc.setFont('helvetica', 'bold');
        doc.text(this._fmtMoney(tot), rx + 34, y + 4, { align: 'right' });
        y += rowH;
      });

      if (!visibleLines.length) {
        this._rect(doc, ML, y, CW, rowH, [255, 255, 255], [226, 232, 240]);
        doc.setFont('helvetica', 'italic'); doc.setFontSize(7); this._tc(doc, [148, 163, 184]);
        doc.text('Aucune ligne', ML + 12, y + 4);
        y += rowH;
      }

      // ── 6. Totals Bar ──
      this._rect(doc, ML, y, CW, 8, [241, 245, 249], [203, 213, 225]);
      doc.setFont('helvetica', 'bold'); doc.setFontSize(8); this._tc(doc, [15, 23, 42]);
      this._text(doc, `${isAR ? 'المجموع خ.ر' : 'TOTAL HT'} : ${this._fmtMoney(totalHT)}`, ML + 5, y + 5.5);
      const blTva = Number(bl.tvaAmount) || (br ? Number(br.tvaAmount) : 0) || 0;
      if (blTva > 0) {
        this._text(doc, `${isAR ? 'الرسم 19%' : 'TVA 19%'} : ${this._fmtMoney(blTva)}`, ML + 62, y + 5.5);
        if (timbre > 0) this._text(doc, `${isAR ? 'الطابع' : 'TIMBRE'} : ${this._fmtMoney(timbre)}`, ML + 116, y + 5.5);
      } else {
        if (timbre > 0) this._text(doc, `${isAR ? 'الطابع' : 'TIMBRE'} : ${this._fmtMoney(timbre)}`, ML + 80, y + 5.5);
      }
      doc.setFontSize(9); this._tc(doc, C.PRIMARY);
      this._text(doc, `${isAR ? 'المجموع ك.ر' : 'TOTAL TTC'} : ${this._fmtMoney(totalTTC)}`, ML + CW - 5, y + 5.5, { align: 'right' });
      y += 10;

      // ── 7. Traceability Note ──
      this._rect(doc, ML, y, CW, 6, [254, 243, 199], [251, 191, 36]);
      doc.setFont('helvetica', 'bold'); doc.setFontSize(6.2); this._tc(doc, [146, 64, 14]);
      doc.text(isAR
        ? `وثيقة تسليم - فاتورة | مرجع سند الشحن : ${bchRef} | وصل الاستلام : ${brRef} | تدقيق أمني : #${chkHex} (${secCode})`
        : `DOCUMENT DE LIVRAISON - FACTURE | REF BCH : ${bchRef} | BR : ${brRef} | CONTRÔLE SÉCURITÉ : #${chkHex} (${secCode})`,
        ML + CW / 2, y + 4, { align: 'center' });
      y += 8;

      // ── 8. Company Cachet — Single box, company only ──
      const sigW = 70, sigH = 30;
      const sigY = Math.max(y + 4, PH - 50);
      const sigX = ML + CW - sigW; // Right-aligned
      this._rect(doc, sigX, sigY, sigW, sigH, [255, 255, 255], [203, 213, 225]);
      doc.setFont('helvetica', 'bold'); doc.setFontSize(8); this._tc(doc, [15, 23, 42]);
      doc.text((s.companyName || '').slice(0, 35), sigX + sigW / 2, sigY + 6, { align: 'center' });
      doc.setFont('helvetica', 'normal'); doc.setFontSize(6.5); this._tc(doc, [107, 114, 128]);
      doc.text(isAR ? 'الختم والتوقيع' : 'Cachet et Signature', sigX + sigW / 2, sigY + sigH - 2, { align: 'center' });

      this._save(doc, `BL_FACTURE_${bchRef.replace(/[\/\\]/g,'_')}.pdf`);
    },

    /* ══════════════════════════════════════════════════════════
       BL TEMPO — BON DE LIVRAISON (Délègue directement vers le format 2 volets)
    ══════════════════════════════════════════════════════════ */
    _exportTempoBL(id) {
      return this._exportBL(id, false);
    },

    /* ══════════════════════════════════════════════════════════
       BON DE RETOUR
    ══════════════════════════════════════════════════════════ */
    _exportBonRetour(id) {
      let br = DB.getById('bon_retours', id);
      if (!br) {
        br = DB.getAll('bon_retours').find(r => String(r.blId) === String(id) || String(r.bcId) === String(id));
      }
      const isAR = typeof T !== 'undefined' && T.isRTL();
      if (!br) { this._notify(isAR ? 'وصل الإرجاع غير موجود' : 'Bon de Retour introuvable','error'); return; }

      const targetBL = (br.blId || br.bcId) ? DB.getById('bls', br.blId || br.bcId) : null;
      const cli = br.clientId ? (DB.getById('clients', br.clientId) || {}) : (targetBL && targetBL.clientId ? (DB.getById('clients', targetBL.clientId) || {}) : {});
      
      const rawSettings = this._settings();
      const s = {
        ...rawSettings,
        companyName: rawSettings.companyName || rawSettings.evCompanyName || 'SOCIÉTÉ',
        activityType: rawSettings.activityType || rawSettings.evActivityType || '',
        address: rawSettings.address || rawSettings.evAddress || '',
        phone: rawSettings.phone || rawSettings.evPhone || '',
        email: rawSettings.email || rawSettings.evEmail || '',
        nif: rawSettings.nif || rawSettings.evNif || '',
        rc: rawSettings.rc || rawSettings.evRc || '',
        nis: rawSettings.nis || rawSettings.evNis || '',
        ai: rawSettings.ai || rawSettings.evAi || '',
        capital: rawSettings.capital || rawSettings.evCapital || '',
        logoLeft: rawSettings.logoLeft || rawSettings.leftLogo || rawSettings.evLogoLeft || '',
        logoRight: rawSettings.logoRight || rawSettings.rightLogo || rawSettings.evLogoRight || ''
      };
      const doc = this._newDoc();

      const lines    = br.items || br.lines || [];
      const totalHT  = Number(br.totalHT || 0);
      const totalTTC = Number(br.totalTTC || 0);

      const brRef = this._t(br.ref);
      const blRef = this._t(br.blRef || '/');

      let y = MT;

      // ── 1. Company Header with Logos ──
      const SLOT_W = 28, SLOT_H = 16;
      const drawLogo = (src, sx) => {
        if (!src || typeof src !== 'string') return;
        const cleanSrc = src.trim();
        try {
          let ar = 1;
          let fmt = 'JPEG';
          if (cleanSrc.startsWith('data:image/png')) fmt = 'PNG';
          else if (cleanSrc.startsWith('data:image/gif')) fmt = 'GIF';
          else if (cleanSrc.startsWith('data:image/webp')) fmt = 'WEBP';
          try {
            if (doc.getImageProperties) {
              const props = doc.getImageProperties(cleanSrc);
              if (props && props.width && props.height) ar = props.width / props.height;
              if (props && props.fileType) fmt = props.fileType;
            }
          } catch (_) {}
          let w = SLOT_W, h = w / ar;
          if (h > SLOT_H) { h = SLOT_H; w = h * ar; }
          if (w > SLOT_W) { w = SLOT_W; h = w / ar; }
          doc.addImage(cleanSrc, fmt, sx + Math.max(0, (SLOT_W - w) / 2), y + Math.max(0, (SLOT_H - h) / 2), w, h);
        } catch(e) {}
      };
      drawLogo(s.logoLeft, ML);
      drawLogo(s.logoRight, PW - MR - SLOT_W);

      const cName = this._t(s.companyName || '/');
      if (this._hasAr(cName) && _arFontB64) doc.setFont(AR_FONT_NAME, 'normal');
      else doc.setFont('helvetica', 'bold');
      doc.setFontSize(12);
      this._tc(doc, [239, 68, 68]); // Red theme for Bon de Retour
      doc.text(cName.toUpperCase(), PW / 2, y + 6, { align: 'center' });

      const retCompAct = s.activityType || s.evActivityType || '';
      if (retCompAct) {
        doc.setFontSize(8);
        this._tc(doc, [100, 116, 139]);
        const actLabel = isAR ? ('النشاط : ' + retCompAct) : ('Activité : ' + retCompAct);
        const actT = this._t(actLabel);
        if (this._hasAr(actT) && _arFontB64) doc.setFont(AR_FONT_NAME, 'normal');
        else doc.setFont('helvetica', 'bold');
        doc.text(actT, PW / 2, y + 9.8, { align: 'center' });
      }

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      this._tc(doc, [71, 85, 105]);
      const retLegY = retCompAct ? (y + 13.5) : (y + 10.5);
      const leg1 = [s.nif && `NIF : ${s.nif}`, s.rc && `RC : ${s.rc}`, s.nis && `NIS : ${s.nis}`, s.ai && `AI : ${s.ai}`].filter(Boolean).join('  |  ');
      if (leg1) doc.text(leg1, PW / 2, retLegY, { align: 'center' });
      const leg2 = [s.address && `Adresse : ${this._t(s.address)}`, s.phone && `Tel : ${s.phone}`].filter(Boolean).join('  |  ');
      if (leg2) doc.text(leg2, PW / 2, retLegY + 4, { align: 'center' });
      y += retCompAct ? 22 : 18;

      // ── 2. Title Banner ──
      doc.setFillColor(239, 68, 68); // Red
      doc.roundedRect(ML, y, CW, 10, 1.5, 1.5, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(13);
      this._tc(doc, C.WHITE);
      this._text(doc, isAR ? 'وصل الإرجاع' : 'BON DE RETOUR', PW / 2, y + 7, { align: 'center' });
      y += 12;

      // ── 3. Info Strip ──
      const bchRef = this._t(br.blRef || br.ref || '/');
      const targetBR = (targetBL && (targetBL.brId || targetBL.linkedBrId)) ? DB.getById('brs', targetBL.brId || targetBL.linkedBrId) : (br.brId ? DB.getById('brs', br.brId) : null);
      const brOriginRef = targetBR ? this._t(targetBR.ref) : (blRef !== '/' ? blRef : '/');
      const returnDate = br.returnedAt ? this._fmtDate(br.returnedAt) : this._fmtDate(br.date);
      
      this._rect(doc, ML, y, CW, 14, [254, 242, 242], [252, 165, 165]); // Light red
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.5);
      this._tc(doc, [15, 23, 42]);
      const iColW = CW / 4;
      
      this._text(doc, isAR ? 'رقم وصل الإرجاع :' : 'N° BON RETOUR :', ML + 2, y + 4);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8);
      doc.text(brRef, ML + 2, y + 9);

      doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5);
      this._text(doc, isAR ? 'تاريخ الإرجاع :' : 'DATE RETOUR :', ML + iColW + 2, y + 4);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8);
      doc.text(returnDate, ML + iColW + 2, y + 9);

      doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5);
      this._text(doc, isAR ? 'مرجع وصل الشحن :' : 'RÉF BCH :', ML + iColW*2 + 2, y + 4);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8);
      doc.text(bchRef, ML + iColW*2 + 2, y + 9);

      doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5);
      this._text(doc, isAR ? 'مرجع وصل الاستلام :' : 'RÉF BR :', ML + iColW*3 + 2, y + 4);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8);
      doc.text(brOriginRef, ML + iColW*3 + 2, y + 9);
      y += 16;

      // Reason block
      if (br.reason || br.returnReason) {
        this._rect(doc, ML, y, CW, 10, [255, 255, 255], [252, 165, 165]);
        doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); this._tc(doc, [239, 68, 68]);
        doc.text('MOTIF DU RETOUR :', ML + 3, y + 4);
        doc.setFont('helvetica', 'normal'); this._tc(doc, [15, 23, 42]);
        doc.text(this._t(br.reason || br.returnReason || '/'), ML + 3, y + 8);
        y += 12;
      }

      // ── 4. Entity boxes ──
      const gap = 4, cw2 = (CW - gap) / 2, boxH = 26;
      // Left: Entreprise
      const supName = this._t(s.companyName || 'Entreprise');
      this._rect(doc, ML, y, cw2, boxH, [255, 255, 255], [252, 165, 165]);
      doc.setFillColor(254, 242, 242);
      doc.rect(ML, y, cw2, 5, 'F');
      doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); this._tc(doc, [153, 27, 27]);
      doc.text('RECEPTEUR (ENTREPRISE)', ML + 3, y + 3.5);
      doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); this._tc(doc, [15, 23, 42]);
      doc.text(supName.slice(0, 40), ML + 3, y + 9.5);
      const retSupAct = s.activityType || s.evActivityType || '';
      if (retSupAct) {
        doc.setFont('helvetica', 'bold'); doc.setFontSize(6.8); this._tc(doc, [153, 27, 27]);
        this._text(doc, (isAR ? 'النشاط : ' : 'Activité : ') + retSupAct, ML + 3, y + 13);
      }
      doc.setFont('helvetica', 'normal'); doc.setFontSize(7); this._tc(doc, [71, 85, 105]);
      this._text(doc, `Tel : ${s.phone || '-'}  |  RC : ${s.rc || '-'}`, ML + 3, y + (retSupAct ? 16.5 : 14));
      this._text(doc, `Adresse : ${this._t(s.address || '-').slice(0, 45)}`, ML + 3, y + (retSupAct ? 20 : 18));

      // Right: Client
      const cliName = this._t(cli.name || br.clientName || 'Client');
      this._rect(doc, ML + cw2 + gap, y, cw2, boxH, [255, 255, 255], [252, 165, 165]);
      doc.setFillColor(254, 242, 242);
      doc.rect(ML + cw2 + gap, y, cw2, 5, 'F');
      doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); this._tc(doc, [153, 27, 27]);
      doc.text('CLIENT / EXPEDITEUR DU RETOUR', ML + cw2 + gap + 3, y + 3.5);
      doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); this._tc(doc, [15, 23, 42]);
      doc.text(cliName.slice(0, 40), ML + cw2 + gap + 3, y + 9.5);
      const retCliAct = cli.activityType || '';
      if (retCliAct) {
        doc.setFont('helvetica', 'bold'); doc.setFontSize(6.8); this._tc(doc, [153, 27, 27]);
        this._text(doc, (isAR ? 'النشاط : ' : 'Activité : ') + retCliAct, ML + cw2 + gap + 3, y + 13);
      }
      doc.setFont('helvetica', 'normal'); doc.setFontSize(7); this._tc(doc, [71, 85, 105]);
      this._text(doc, `NIF : ${cli.nif || '-'}  |  Tel : ${cli.phone || '-'}`, ML + cw2 + gap + 3, y + (retCliAct ? 16.5 : 14));
      this._text(doc, `Adresse : ${this._t(cli.address || '-').slice(0, 42)}`, ML + cw2 + gap + 3, y + (retCliAct ? 20 : 18));
      y += boxH + 3;

      // ── 5. Items Table ──
      const colDef = [
        { label: 'N', w: 10, align: 'center' },
        { label: 'DESIGNATION DES MARCHANDISES RETOURNEES', w: 82, align: 'left' },
        { label: 'UNITE', w: 14, align: 'center' },
        { label: 'QTE RET.', w: 20, align: 'center' },
        { label: 'P.U. HT', w: 32, align: 'right' },
        { label: 'TOTAL HT', w: 36, align: 'right' }
      ];

      this._rect(doc, ML, y, CW, 6, [239, 68, 68], [239, 68, 68]);
      doc.setFont('helvetica', 'bold'); doc.setFontSize(7); this._tc(doc, C.WHITE);
      let cx = ML;
      colDef.forEach(c => {
        if (c.align === 'center') doc.text(c.label, cx + c.w / 2, y + 4, { align: 'center' });
        else if (c.align === 'right') doc.text(c.label, cx + c.w - 2, y + 4, { align: 'right' });
        else doc.text(c.label, cx + 2, y + 4);
        cx += c.w;
      });
      y += 6;

      const maxRows = 12;
      const visibleLines = lines.slice(0, maxRows);
      const rowH = 6;
      visibleLines.forEach((l, i) => {
        const qty = Number(l.qtyDelivered || l.qty || 0);
        const pu = Number(l.price || 0);
        const disc = Number(l.disc || 0);
        const tot = Math.round(qty * pu * (1 - disc / 100) * 100) / 100;

        const rowBg = i % 2 === 0 ? [255, 255, 255] : [254, 242, 242];
        this._rect(doc, ML, y, CW, rowH, rowBg, [252, 165, 165]);

        doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); this._tc(doc, [30, 41, 59]);
        let rx = ML;
        doc.text(String(i + 1).padStart(2, '0'), rx + 5, y + 4, { align: 'center' });
        rx += 10;
        doc.text(this._t(l.designation || 'Marchandise').slice(0, 50), rx + 2, y + 4);
        rx += 82;
        doc.text(this._t(l.unit || 'U'), rx + 7, y + 4, { align: 'center' });
        rx += 14;
        doc.setFont('helvetica', 'bold');
        doc.text(this._fmtNum(qty), rx + 10, y + 4, { align: 'center' });
        rx += 20;
        doc.setFont('helvetica', 'normal');
        doc.text(this._fmtMoney(pu) + (disc ? ` (-${disc}%)` : ''), rx + 30, y + 4, { align: 'right' });
        rx += 32;
        doc.setFont('helvetica', 'bold');
        doc.text(this._fmtMoney(tot), rx + 34, y + 4, { align: 'right' });
        y += rowH;
      });

      if (!visibleLines.length) {
        this._rect(doc, ML, y, CW, rowH, [255, 255, 255], [252, 165, 165]);
        doc.setFont('helvetica', 'italic'); doc.setFontSize(7); this._tc(doc, [148, 163, 184]);
        doc.text('Aucune ligne', ML + 12, y + 4);
        y += rowH;
      }

      // ── 6. Totals Bar ──
      this._rect(doc, ML, y, CW, 8, [254, 242, 242], [252, 165, 165]);
      doc.setFont('helvetica', 'bold'); doc.setFontSize(8); this._tc(doc, [15, 23, 42]);
      doc.text(`TOTAL HT : ${this._fmtMoney(totalHT)}`, ML + 5, y + 5.5);
      doc.setFontSize(9); this._tc(doc, [239, 68, 68]);
      doc.text(`TOTAL TTC : ${this._fmtMoney(totalTTC)}`, ML + CW - 5, y + 5.5, { align: 'right' });
      y += 10;

      // ── 7. Signature Blocks ──
      const sigW2 = (CW - 6) / 3, sigH = 28;
      const sigY = Math.max(y + 4, PH - 50);
      
      // Sig 1: Client
      this._rect(doc, ML, sigY, sigW2, sigH, [255, 255, 255], [252, 165, 165]);
      doc.setFont('helvetica', 'bold'); doc.setFontSize(7); this._tc(doc, [153, 27, 27]);
      doc.text('LE CLIENT / EXPEDITEUR', ML + 3, sigY + 4);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(6); this._tc(doc, [148, 163, 184]);
      doc.text('Cachet et Signature', ML + 3, sigY + sigH - 2);

      // Sig 2: Chauffeur
      this._rect(doc, ML + sigW2 + 3, sigY, sigW2, sigH, [255, 255, 255], [252, 165, 165]);
      doc.setFont('helvetica', 'bold'); doc.setFontSize(7); this._tc(doc, [153, 27, 27]);
      doc.text('LE CHAUFFEUR / TRANSPORTEUR', ML + sigW2 + 6, sigY + 4);
      doc.setFont('helvetica', 'italic'); doc.setFontSize(6); this._tc(doc, [148, 163, 184]);
      doc.text('Pris en charge pour retour', ML + sigW2 + 6, sigY + sigH - 2);

      // Sig 3: Recepteur
      this._rect(doc, ML + (sigW2 + 3) * 2, sigY, sigW2, sigH, [255, 255, 255], [252, 165, 165]);
      doc.setFont('helvetica', 'bold'); doc.setFontSize(7); this._tc(doc, [153, 27, 27]);
      doc.text('LE RECEPTEUR (ENTREPRISE)', ML + (sigW2 + 3) * 2 + 3, sigY + 4);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(6); this._tc(doc, [148, 163, 184]);
      doc.text('Date, Signature et Cachet', ML + (sigW2 + 3) * 2 + 3, sigY + sigH - 2);

      this._save(doc, `BR_${brRef.replace(/[\/\\]/g,'_')}.pdf`);
    },

    /* ══════════════════════════════════════════════════════════
       DÉCHARGE CAISSE — 2 sig blocks only
    ══════════════════════════════════════════════════════════ */
    _exportDecharge(id) {
      const isAR = typeof T !== 'undefined' && T.isRTL();
      const tx = DB.getById('caisse_admin',id)
              || DB.getById('caisse_transactions',id)
              || DB.getById('transactions',id);
      if(!tx){ this._notify(isAR ? 'العملية غير موجودة' : 'Transaction introuvable','error'); return; }

      const s   = this._settings();
      const doc = this._newDoc();
      const isDeposit = tx.type==='deposit';
      const title     = isDeposit ? (isAR ? 'وصل إيداع نقدي' : 'BON DE VERSEMENT') : (isAR ? 'وصل سحب نقدي' : 'BON DE RETRAIT');
      const userName  = this._t(tx.userName||tx.createdByName||'/');
      const montant   = Number(tx.amount)||0;
      const ref       = this._t(tx.ref||`TX-${tx.id||'?'}`);

      let y = this._drawCompanyHeader(doc,s,MT);
      y = this._drawBanner(doc,title,y);
      y = this._drawInfoStrip(doc,[
        {label:isAR ? 'التاريخ / الوقت' : 'Date/Heure', value:this._fmtDateTime(tx.date||tx.createdAt)},
        {label:isAR ? 'رقم المرجع' : 'N° Réf',     value:ref},
        {label:isAR ? 'النوع' : 'Type',       value:isDeposit ? (isAR ? 'إيداع' : 'Versement') : (isAR ? 'سحب' : 'Retrait')},
      ],y);
      y+=6;

      /* Detail card */
      const cardH=54;
      this._rect(doc,ML,y,CW,cardH,C.BG_INFO,C.LINE);
      this._rect(doc,ML,y,CW,8,C.LIGHT,C.LINE);
      doc.setFont('helvetica','bold'); doc.setFontSize(9); this._tc(doc,C.PRIMARY_DARK);
      this._text(doc, isAR ? 'تفاصيل العملية' : "DÉTAILS DE L'OPÉRATION", ML+4, y+5.5);

      let cy=y+14;
      const rowF=(lbl,val,bold)=>{
        doc.setFont('helvetica','bold'); doc.setFontSize(8.5); this._tc(doc,C.GRAY_TXT);
        this._text(doc, lbl, ML+4, cy);
        doc.setFont('helvetica',bold?'bold':'normal');
        doc.setFontSize(bold?11:8.5);
        this._tc(doc,bold?C.PRIMARY:C.BLACK);
        const cleanVal = this._t(String(val||'/'));
        const maxValW = CW - 66; // 194 - 66 = 128mm available width
        const lines = doc.splitTextToSize(cleanVal, maxValW);
        if (lines && lines.length > 1) {
          lines.forEach((line, li) => {
            this._text(doc, line, ML+62, cy + (li * 4.2));
          });
          cy += (lines.length - 1) * 4.2;
        } else {
          this._text(doc, cleanVal, ML+62, cy);
        }
        cy+=6.5;
      };
      rowF(isAR ? 'العون / المنفذ :' : 'Opérateur :',    userName);
      rowF(isAR ? 'التاريخ / الوقت :' : 'Date / Heure :', this._fmtDateTime(tx.date||tx.createdAt));
      rowF(isAR ? 'الصندوق :' : 'Caisse :',       this._t(tx.accountName || (isAR ? 'الصندوق الرئيسي' : 'Caisse Principale')));
      rowF(isAR ? 'الوجهة :' : 'Destination :',  this._t(tx.destination||'/'));
      rowF(isAR ? 'السبب :' : 'Motif :',        this._t(tx.note||tx.description||'/'));
      cy+=2;
      rowF(isAR ? 'المبلغ :' : 'MONTANT :',      this._fmtMoney(montant), true);
      const actualCardH = Math.max(cardH, (cy - y) + 4);
      y+=actualCardH+6;

      /* Amount in words */
      const wd=this._amountWords(montant);
      if(wd){
        doc.setFont('helvetica','italic'); doc.setFontSize(9); this._tc(doc,C.BLACK);
        const wl=doc.splitTextToSize(isAR ? `أوقفت عند مبلغ قدره : ${wd} دينار جزائري` : `Arretee a la somme de : ${wd} dinars algeriens`,CW);
        this._text(doc, wl, ML, y); y+=wl.length*4.5+4;
      }

      /* 2 Sig blocks: Responsable Caisse + DG */
      this._drawSigBlock(doc,[
        {label:isAR ? 'مسؤول الصندوق' : 'Le Responsable Caisse', sub:isAR ? 'التوقيع والختم' : 'Signature & Cachet'},
        {label:isAR ? 'المدير العام' : 'Le Directeur Général',  sub:isAR ? 'التوقيع والختم' : 'Signature & Cachet'},
      ], Math.max(y+4,PH-62), 44);

      this._drawFooter(doc,1,1);
      this._save(doc,`DECHARGE_${ref.replace(/\//g,'_')}.pdf`);
    },


    /* ══════════════════════════════════════════════════════════
       BANK TRANSACTION DÉCHARGE
    ══════════════════════════════════════════════════════════ */
    _exportBankDecharge(txId) {
      const isAR = typeof T !== 'undefined' && T.isRTL();
      const tx = DB.getById('bank_transactions', txId);
      if (!tx) { this._notify(isAR ? 'المعاملة البنكية غير موجودة' : 'Transaction bancaire introuvable','error'); return; }
      const settings = DB.getSettings();
      const bank = (settings.banks||[]).find(b=>b.id===tx.bankId);
      const s    = this._settings();
      const doc  = this._newDoc();

      const subtypeTitles = {
        transfer_from_caisse: isAR ? 'وصل تحويل من الصندوق إلى البنك' : 'BON DE VIREMENT CAISSE → BANQUE',
        external_deposit:     isAR ? 'وصل إيداع خارجي' : 'BON DE DÉPÔT EXTERNE',
        supplier_payment:     isAR ? 'وصل دفع للمورد (بنك)' : 'BON DE PAIEMENT FOURNISSEUR (BANQUE)',
        correction:           isAR ? 'وصل تصحيح بنكي' : 'BON DE CORRECTION BANCAIRE',
      };
      const title = subtypeTitles[tx.subtype] || (tx.type==='deposit' ? (isAR ? 'وصل إيداع بنكي' : 'BON DE DÉPÔT BANCAIRE') : (isAR ? 'وصل سحب بنكي' : 'BON DE SORTIE BANCAIRE'));
      const ref   = this._t(tx.ref || `BANK-${tx.id}`);
      const montant = Number(tx.amount)||0;
      const isD   = tx.type==='deposit';

      let y = this._drawCompanyHeader(doc,s,MT);
      y = this._drawBanner(doc,title,y);
      y = this._drawInfoStrip(doc,[
        {label:isAR ? 'المرجع' : 'Réf', value:ref},
        {label:isAR ? 'التاريخ' : 'Date', value:this._fmtDateTime(tx.date||tx.createdAt)},
        {label:isAR ? 'الحساب' : 'Compte', value:this._t(bank?.name||'?') + (bank?.bankName?' — '+this._t(bank.bankName):'')},
      ],y);
      y+=6;

      const cardH=58;
      this._rect(doc,ML,y,CW,cardH,C.BG_INFO,C.LINE);
      this._rect(doc,ML,y,CW,8,C.LIGHT,C.LINE);
      doc.setFont('helvetica','bold'); doc.setFontSize(9); this._tc(doc,C.PRIMARY_DARK);
      this._text(doc, isAR ? 'تفاصيل العملية' : "DÉTAILS DE L'OPÉRATION", ML+4, y+5.5);

      let cy=y+14;
      const rowF=(lbl,val,bold)=>{
        doc.setFont('helvetica','bold'); doc.setFontSize(8.5); this._tc(doc,C.GRAY_TXT);
        this._text(doc, lbl, ML+4, cy);
        doc.setFont('helvetica',bold?'bold':'normal');
        doc.setFontSize(bold?11:8.5);
        this._tc(doc,bold?C.PRIMARY:C.BLACK);
        const cleanVal = this._t(String(val||'/'));
        const maxValW = CW - 66; // 194 - 66 = 128mm available width
        const lines = doc.splitTextToSize(cleanVal, maxValW);
        if (lines && lines.length > 1) {
          lines.forEach((line, li) => {
            this._text(doc, line, ML+62, cy + (li * 4.2));
          });
          cy += (lines.length - 1) * 4.2;
        } else {
          this._text(doc, cleanVal, ML+62, cy);
        }
        cy+=6.5;
      };
      rowF(isAR ? 'نوع العملية :' : 'Type opération :',  title);
      rowF(isAR ? 'الحساب البنكي :' : 'Compte bancaire :',  this._t(bank?.name||'?') + (bank?.accountNum?' ('+this._t(bank.accountNum)+')':''));
      rowF(isAR ? 'الاتجاه :' : 'Direction :',        isD ? (isAR ? 'إيداع (+)' : 'Entrée (+)') : (isAR ? 'سحب (-)' : 'Sortie (-)'));
      if (tx.supplierId) { const sup=DB.getById('suppliers',tx.supplierId); rowF(isAR ? 'المورد :' : 'Fournisseur :',this._t(sup?.name||'?')); }
      rowF(isAR ? 'ملاحظة :' : 'Note :',             this._t(tx.note||'/'));
      cy+=2;
      rowF(isAR ? 'المبلغ :' : 'MONTANT :',          (isD?'+ ':'- ')+this._fmtMoney(montant), true);
      const actualCardH = Math.max(cardH, (cy - y) + 4);
      y+=actualCardH+6;

      const wd=this._amountWords(montant);
      if(wd){
        doc.setFont('helvetica','italic'); doc.setFontSize(9); this._tc(doc,C.BLACK);
        const wl=doc.splitTextToSize(isAR ? `أوقفت عند مبلغ قدره : ${wd} دينار جزائري` : 'Arrêtée à la somme de : '+wd+' dinars algériens',CW);
        this._text(doc, wl, ML, y); y+=wl.length*4.5+4;
      }

      this._drawSigBlock(doc,[
        {label:isAR ? 'مسؤول البنك' : 'Le Responsable Banque', sub:isAR ? 'التوقيع والختم' : 'Signature & Cachet'},
        {label:isAR ? 'المدير العام' : 'Le Directeur Général',  sub:isAR ? 'التوقيع والختم' : 'Signature & Cachet'},
      ], Math.max(y+4,PH-62), 44);

      this._drawFooter(doc,1,1);
      this._save(doc,`DECHARGE_BANK_${ref.replace(/\//g,'_')}.pdf`);
    },

    /* ══════════════════════════════════════════════════════════
       SUPPLIER PAYMENT DÉCHARGE
    ══════════════════════════════════════════════════════════ */
    _exportSupplierPayDecharge(payId) {
      const isAR = typeof T !== 'undefined' && T.isRTL();
      const pay = DB.getById('supplier_payments', payId);
      if (!pay) { this._notify(isAR ? 'عملية الدفع غير موجودة' : 'Paiement introuvable','error'); return; }
      const settings = DB.getSettings();
      const sup  = DB.getById('suppliers', pay.supplierId)||{name:'?'};
      const bank = pay.bankId ? (settings.banks||[]).find(b=>b.id===pay.bankId) : null;
      const s    = this._settings();
      const doc  = this._newDoc();

      const ref     = this._t(pay.ref || `PAY-${pay.id}`);
      const montant = Number(pay.amount)||0;
      const title   = isAR ? 'وصل دفع للمورد' : 'BON DE PAIEMENT FOURNISSEUR';
      const source  = pay.source==='caisse' ? (isAR ? 'الصندوق (نقداً)' : 'Caisse (espèces)') : (bank ? `${bank.name} (${bank.bankName||''})` : (isAR ? 'البنك' : 'Banque'));

      let y = this._drawCompanyHeader(doc,s,MT);
      y = this._drawBanner(doc,title,y);
      y = this._drawInfoStrip(doc,[
        {label:isAR ? 'المرجع' : 'Réf',          value:ref},
        {label:isAR ? 'التاريخ' : 'Date',         value:this._fmtDateTime(pay.date||pay.createdAt)},
        {label:isAR ? 'المورد' : 'Fournisseur',  value:this._t(sup.name)},
      ],y);
      y+=6;

      const cardH=60;
      this._rect(doc,ML,y,CW,cardH,C.BG_INFO,C.LINE);
      this._rect(doc,ML,y,CW,8,C.LIGHT,C.LINE);
      doc.setFont('helvetica','bold'); doc.setFontSize(9); this._tc(doc,C.PRIMARY_DARK);
      this._text(doc, isAR ? 'تفاصيل الدفع' : 'DÉTAILS DU PAIEMENT', ML+4, y+5.5);

      let cy=y+14;
      const rowF=(lbl,val,bold)=>{
        doc.setFont('helvetica','bold'); doc.setFontSize(8.5); this._tc(doc,C.GRAY_TXT);
        this._text(doc, lbl, ML+4, cy);
        doc.setFont('helvetica',bold?'bold':'normal');
        doc.setFontSize(bold?11:8.5);
        this._tc(doc,bold?C.PRIMARY:C.BLACK);
        this._text(doc, this._t(String(val||'/')), ML+62, cy);
        cy+=6.5;
      };
      rowF(isAR ? 'المورد :' : 'Fournisseur :',   this._t(sup.name));
      if (sup.nif)  rowF('NIF :',  this._t(sup.nif));
      rowF(isAR ? 'المصدر :' : 'Source :',        source);
      rowF(isAR ? 'ملاحظة / مرجع :' : 'Note / Réf :',   this._t(pay.note||'/'));
      rowF(isAR ? 'العون / المنفذ :' : 'Opérateur :',    this._t(pay.byName||'/'));
      cy+=2;
      rowF(isAR ? 'المبلغ المدفوع :' : 'MONTANT PAYÉ :', this._fmtMoney(montant), true);
      y+=cardH+6;

      // Running balance
      const totalBR   = DB.getAll('brs').filter(b=>b.supplierId===pay.supplierId).reduce((s,b)=>s+(b.totalTTC||0),0);
      const allPays   = DB.getAll('supplier_payments').filter(p=>p.supplierId===pay.supplierId);
      const totalPaid = allPays.reduce((s,p)=>s+(p.amount||0),0);
      const remaining = Math.max(0, totalBR - totalPaid);

      doc.setFont('helvetica','normal'); doc.setFontSize(8.5); this._tc(doc,C.GRAY_TXT);
      this._text(doc, isAR ? `إجمالي المشتريات (و.ا): ${this._fmtMoney(totalBR)} | إجمالي المدفوع: ${this._fmtMoney(totalPaid)} | المتبقي: ${this._fmtMoney(remaining)}` : `Total achats (BR): ${this._fmtMoney(totalBR)} | Total payé: ${this._fmtMoney(totalPaid)} | Reste: ${this._fmtMoney(remaining)}`, ML, y);
      y+=7;

      const wd=this._amountWords(montant);
      if(wd){
        doc.setFont('helvetica','italic'); doc.setFontSize(9); this._tc(doc,C.BLACK);
        const wl=doc.splitTextToSize(isAR ? `أوقفت عند مبلغ قدره : ${wd} دينار جزائري` : 'Arrêtée à la somme de : '+wd+' dinars algériens',CW);
        this._text(doc, wl, ML, y); y+=wl.length*4.5+4;
      }

      this._drawSigBlock(doc,[
        {label:isAR ? 'المورد' : 'Le Fournisseur',        sub:isAR ? 'التوقيع والختم (للإبراء والمخالصة)' : 'Signature & Cachet (Pour acquit)'},
        {label:isAR ? 'المدير العام' : 'Le Directeur Général',  sub:isAR ? 'التوقيع والختم' : 'Signature & Cachet'},
      ], Math.max(y+4,PH-62), 44);

      this._drawFooter(doc,1,1);
      this._save(doc,`DECHARGE_PAY_${Utils.escHTML(sup.name||'').replace(/\s/g,'_')}_${ref.replace(/\//g,'_')}.pdf`);
    },

    /* ══════════════════════════════════════════════════════════
       FICHE DE PAIE — Simple Payroll Slip
    ══════════════════════════════════════════════════════════ */
    async exportFicheDePayeSimple(data) { try{ await this._ensureArabicFont(); this._exportFicheDePayeSimple(data); }catch(e){console.error(e);this._notify('Erreur Fiche de Paie: '+e.message,'error');} },

    _exportFicheDePayeSimple(data) {
      if (!data) { this._notify('Donnees manquantes','error'); return; }
      const s   = this._settings();
      const doc = this._newDoc();

      /* -- Company header -- */
      let y = this._drawCompanyHeader(doc, s, MT);

      /* -- Banner -- */
      const isAR = typeof T !== 'undefined' && T.isRTL();
      y = this._drawBanner(doc, isAR ? `كشف الراتب - ${(data.monthLabel || '').toUpperCase()}` : `FICHE DE PAIE - ${(data.monthLabel || '').toUpperCase()}`, y);
      y += 4;

      /* -- Employee Info Strip -- */
      this._rect(doc, ML, y, CW, 34, C.LIGHT, C.BORDER);
      doc.setFont('helvetica','bold'); doc.setFontSize(9); this._tc(doc, C.TEXT);
      const col1 = ML+4, col2 = ML+100;
      this._text(doc, isAR ? 'الموظف :' : 'Employe :', col1, y+6);
      this._text(doc, isAR ? 'القسم :' : 'Departement :', col1, y+12);
      this._text(doc, isAR ? 'المنصب :' : 'Poste :', col1, y+18);
      this._text(doc, isAR ? 'الفترة :' : 'Periode :', col2, y+6);
      this._text(doc, isAR ? 'أيام العمل :' : 'Jours Ouvrables :', col2, y+12);
      this._text(doc, isAR ? 'الأيام المشتغلة :' : 'Jours Travailles :', col2, y+18);
      doc.setFont('helvetica','normal');
      doc.text(String(data.employeeName || '-'), col1+26, y+6);
      doc.text(String(data.department || '-'), col1+30, y+12);
      doc.text(String(data.jobTitle || '-'), col1+16, y+18);
      doc.text(String(data.monthLabel || '-'), col2+20, y+6);
      doc.text(String(data.totalDays || '-'), col2+36, y+12);
      doc.text(String(data.workedDays || '-'), col2+36, y+18);

      // Attendance breakdown row
      if (data.daysAbsent !== undefined || data.daysMission !== undefined || data.daysLeave !== undefined) {
        doc.setFont('helvetica','bold'); doc.setFontSize(8); this._tc(doc, C.TEXT);
        this._text(doc, isAR ? 'تفاصيل الحضور :' : 'Detail Presence :', col1, y+26);
        doc.setFont('helvetica','normal'); doc.setFontSize(8);
        const parts = [];
        if (data.workedDays) parts.push(isAR ? `حاضر: ${data.workedDays}ي` : `Present: ${data.workedDays}j`);
        if (data.daysAbsent > 0) parts.push(isAR ? `غائب: ${data.daysAbsent}ي` : `Absent: ${data.daysAbsent}j`);
        if (data.daysMission > 0) parts.push(isAR ? `مهمة: ${data.daysMission}ي` : `Mission: ${data.daysMission}j`);
        if (data.daysLeave > 0) parts.push(isAR ? `عطلة: ${data.daysLeave}ي` : `Conge: ${data.daysLeave}j`);
        if (data.daysLate > 0) parts.push(isAR ? `تأخر: ${data.daysLate}ي` : `Retard: ${data.daysLate}j`);
        this._tc(doc, [71, 85, 105]);
        this._text(doc, parts.join('  |  ') || '-', col1+36, y+26);
        doc.setFont('helvetica','bold'); doc.setFontSize(8); this._tc(doc, [71, 85, 105]);
        this._text(doc, isAR ? 'مجموع الساعات :' : 'Heures Totales :', col2, y+26);
        doc.setFont('helvetica','normal');
        this._text(doc, String(data.totalHours || '-') + (isAR ? ' س' : 'h'), col2+32, y+26);
        y += 38;
      } else {
        y += 22;
      }

      /* -- Salary Breakdown Table -- */
      const rows = [
        { label: isAR ? 'الراتب الأساسي' : 'Salaire de Base', amount: data.baseSalary || 0 },
        { label: isAR ? 'التناسب مع أيام العمل' : 'Prorata Jours Travailles', amount: data.prorata || 0 },
      ];
      if ((data.overtime || 0) > 0) rows.push({ label: isAR ? 'الساعات الإضافية' : 'Heures Supplementaires', amount: data.overtime });
      if ((data.bonuses || 0) > 0) rows.push({ label: isAR ? 'العلاوات والتعويضات' : 'Primes et Indemnites', amount: data.bonuses });
      rows.push({ label: isAR ? 'المجموع الخام' : 'Total Brut', amount: data.grossTotal || 0, bold: true });

      // Only add deductions that are > 0
      if (data.deductions && data.deductions.length) {
        data.deductions.forEach(d => {
          if (d.amount > 0) {
            rows.push({ label: (isAR ? 'اقتطاع : ' : 'Retenue : ') + d.label, amount: d.amount, isDeduction: true });
          }
        });
      }
      const totalDed = data.totalDeductions || 0;
      if (totalDed > 0) {
        rows.push({ label: isAR ? 'مجموع الاقتطاعات' : 'Total Retenues', amount: totalDed, bold: true, isDeduction: true });
      }
      rows.push({ label: isAR ? 'الصافي للدفع' : 'NET A PAYER', amount: data.netPay || 0, bold: true, isNet: true });

      // Table header
      this._rect(doc, ML, y, CW, 8, C.PRIMARY, C.PRIMARY);
      doc.setFont('helvetica','bold'); doc.setFontSize(9); this._tc(doc, C.WHITE);
      this._text(doc, isAR ? 'البيان' : 'Designation', ML+4, y+6);
      this._text(doc, isAR ? 'المبلغ (د.ج)' : 'Montant (DA)', PW-MR-4, y+6, {align:'right'});
      y += 8;

      // Table rows
      rows.forEach((row, i) => {
        const bgColor = row.isNet ? [13,148,136] : (i%2===0 ? [255,255,255] : C.LIGHT);
        const textColor = row.isNet ? [255,255,255] : (row.isDeduction ? [220,38,38] : C.TEXT);
        const rowH = row.isNet ? 10 : 7;
        this._rect(doc, ML, y, CW, rowH, bgColor, C.BORDER);
        doc.setFont('helvetica', row.bold ? 'bold' : 'normal');
        doc.setFontSize(row.isNet ? 11 : 9);
        this._tc(doc, textColor);
        this._text(doc, row.label, ML+4, y + (rowH === 10 ? 7 : 5));
        const amtStr = this._fmtMoney(Math.abs(row.isDeduction ? row.amount : row.amount));
        const prefix = row.isDeduction && row.amount > 0 ? '- ' : '';
        doc.text(prefix + amtStr, PW-MR-4, y + (rowH === 10 ? 7 : 5), {align:'right'});
        y += rowH;
      });

      y += 8;

      /* -- Footer Note -- */
      this._rect(doc, ML, y, CW, 12, [255,251,235], [251,191,36]);
      doc.setFont('helvetica','italic'); doc.setFontSize(8); this._tc(doc,[146,64,14]);
      this._text(doc, (isAR ? 'أوقف كشف الراتب هذا عند مبلغ قدره : ' : 'Arretee la presente fiche de paie a la somme de : ') + this._fmtMoney(data.netPay || 0), ML+4, y+5);
      this._text(doc, isAR ? 'سُلم هذا الكشف للإدلاء به واستعماله في حدود ما يسمح به القانون.' : 'Cette fiche est delivree pour servir et valoir ce que de droit.', ML+4, y+10);
      y += 16;

      /* -- Signatures -- */
      this._drawSigBlock(doc, [
        {label:isAR ? 'الموظف' : "L'Employe",  sub:isAR ? 'التوقيع' : 'Signature'},
        {label:isAR ? 'مسؤول الموارد البشرية' : 'Le Responsable RH',  sub:isAR ? 'التوقيع والختم' : 'Signature et Cachet'},
        {label:isAR ? 'المدير' : 'Le Directeur',  sub:isAR ? 'التوقيع والختم' : 'Signature et Cachet'},
      ], Math.max(y+4,PH-62), 44);

      this._drawFooter(doc,1,1);
      this._save(doc,`FICHE_PAIE_${(data.employeeName||'').replace(/\s/g,'_')}_${(data.monthLabel||'').replace(/[\s\/]/g,'_')}.pdf`);
    },

  }; /* end PDFGen */


  global.PDFGen = PDFGen;

})(window);

