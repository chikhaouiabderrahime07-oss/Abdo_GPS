/* =============================================================
   DOUROUB FLEET V5.0 — NOTIFICATION SYSTEM
   One toast at a time / Queue / 2s auto-dismiss / Session dedup
   ============================================================= */

(function () {
  'use strict';

  // Audio System
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  let audioCtx = null;
  function getAudioCtx() { if (!audioCtx) { try { audioCtx = new AudioCtx(); } catch (e) {} } return audioCtx; }

  function playNotifSound(severity) {
    const ctx = getAudioCtx(); if (!ctx) return;
    const soundType = localStorage.getItem('fleet_notif_sound') || 'beep';
    if (soundType === 'none') return;
    const t = ctx.currentTime;
    const tone = (freq, type, vol, s, dur) => {
      const osc = ctx.createOscillator(), g = ctx.createGain();
      osc.connect(g); g.connect(ctx.destination);
      osc.type = type; osc.frequency.setValueAtTime(freq, t + s);
      g.gain.setValueAtTime(0, t + s); g.gain.linearRampToValueAtTime(vol, t + s + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, t + s + dur);
      osc.start(t + s); osc.stop(t + s + dur + 0.1);
    };
    const cfg = { info: [880,'sine',0.05,0.15], warning: [660,'sine',0.08,0.25], critical: [440,'sine',0.1,0.4] }[severity] || [880,'sine',0.05,0.15];
    tone(cfg[0], cfg[1], cfg[2], 0, cfg[3]);
  }

  async function requestNotifPermission() {
    if ('Notification' in window && Notification.permission === 'default') { try { await Notification.requestPermission(); } catch (e) {} }
  }
  function showBrowserNotif(title, body) {
    if ('Notification' in window && Notification.permission === 'granted') {
      try { new Notification(title, { body: body || '', silent: true, tag: 'fleet-' + Date.now() }); } catch (e) {}
    }
  }

  // Session-level deduplication — track shown notification keys
  // Key = type + title hash. Clears on page close (sessionStorage).
  const _sessionSeen = new Set(
    JSON.parse(sessionStorage.getItem('_fleetNotifSeen') || '[]')
  );
  function _seenKey(type, title) {
    return type + '|' + (title || '').substring(0, 60);
  }
  function _markSeen(key) {
    _sessionSeen.add(key);
    try { sessionStorage.setItem('_fleetNotifSeen', JSON.stringify([..._sessionSeen].slice(-150))); } catch(e) {}
  }

  // Toast Queue — one at a time
  let _queue = [], _busy = false, _timer = null;
  const DURATION = 2000; // 2 seconds

  function _anchor() {
    let el = document.getElementById('fleetToastAnchor');
    if (!el) {
      el = document.createElement('div');
      el.id = 'fleetToastAnchor';
      el.style.cssText = 'position:fixed;top:20px;right:20px;z-index:9999998;width:340px;pointer-events:none;';
      document.body.appendChild(el);
    }
    return el;
  }

  function _next() {
    if (_busy || !_queue.length) return;
    _busy = true;
    _show(_queue.shift());
    // Update pending count badge on remaining toasts
    if (_queue.length && document.getElementById('ftPending')) {
      document.getElementById('ftPending').textContent = '+' + _queue.length;
      document.getElementById('ftPending').style.display = '';
    }
  }

  function _show(item) {
    const anchor = _anchor();
    document.getElementById('fleetActiveToast')?.remove();
    const { title, body, severity } = item;
    const pending = _queue.length;
    const col = severity === 'critical' ? '#ef4444' : severity === 'warning' ? '#f59e0b' : '#3b82f6';
    const ico = severity === 'critical' ? 'fa-triangle-exclamation' : severity === 'warning' ? 'fa-circle-exclamation' : 'fa-circle-info';
    const badge = pending > 0
      ? '<span id="ftPending" style="background:rgba(255,255,255,0.1);color:#94a3b8;padding:1px 7px;border-radius:8px;font-size:10px;margin-left:5px;">+' + pending + '</span>'
      : '<span id="ftPending" style="display:none;"></span>';

    const el = document.createElement('div');
    el.id = 'fleetActiveToast';
    el.style.cssText = 'pointer-events:auto;background:var(--bg-elevated,#1e293b);border:1px solid ' + col + '35;border-left:4px solid ' + col + ';border-radius:12px;padding:13px 14px 10px;box-shadow:0 12px 40px rgba(0,0,0,0.55);overflow:hidden;position:relative;animation:_tSI .3s cubic-bezier(.16,1,.3,1);';
    el.innerHTML = '<div style="display:flex;align-items:flex-start;gap:10px;">' +
      '<div style="width:32px;height:32px;background:' + col + '18;border-radius:9px;display:flex;align-items:center;justify-content:center;flex-shrink:0;">' +
        '<i class="fa-solid ' + ico + '" style="color:' + col + ';font-size:14px;"></i></div>' +
      '<div style="flex:1;min-width:0;">' +
        '<div style="font-weight:700;font-size:13px;color:var(--text-primary,#e2e8f0);display:flex;align-items:center;flex-wrap:wrap;gap:3px;">' + title + badge + '</div>' +
        (body ? '<div style="font-size:11px;color:var(--text-muted,#94a3b8);margin-top:3px;line-height:1.4;">' + body + '</div>' : '') +
      '</div>' +
      '<button id="ftClose" style="background:none;border:none;color:#64748b;cursor:pointer;padding:2px 5px;font-size:16px;border-radius:5px;line-height:1;flex-shrink:0;">&#x00D7;</button>' +
    '</div>' +
    '<div id="ftBar" style="position:absolute;bottom:0;left:0;height:3px;background:' + col + ';width:100%;transition:width ' + DURATION + 'ms linear;border-radius:0 0 0 12px;"></div>';

    anchor.appendChild(el);

    // Inject CSS once
    if (!document.getElementById('_ftKF')) {
      const s = document.createElement('style'); s.id = '_ftKF';
      s.textContent = '@keyframes _tSI{from{opacity:0;transform:translateX(100%) scale(0.9)}to{opacity:1;transform:translateX(0) scale(1)}} @keyframes _tSO{from{opacity:1;transform:translateX(0)}to{opacity:0;transform:translateX(110%)}}';
      document.head.appendChild(s);
    }

    // Start progress shrink
    requestAnimationFrame(() => { const b = document.getElementById('ftBar'); if (b) b.style.width = '0%'; });

    const dismiss = () => {
      clearTimeout(_timer);
      el.style.animation = '_tSO .2s ease forwards';
      setTimeout(() => { el.remove(); _busy = false; _next(); }, 200);
    };

    document.getElementById('ftClose').addEventListener('click', dismiss);
    el.addEventListener('click', (e) => { if (e.target.id !== 'ftClose') dismiss(); });
    _timer = setTimeout(dismiss, DURATION);
  }

  // Override pushNotification
  const _orig = window.pushNotification;
  window.pushNotification = function (type, data) {
    // Always save to history
    if (_orig) _orig(type, data);

    // Check pref
    const prefs = JSON.parse(localStorage.getItem('fleet_notif_prefs') || '{}');
    if (prefs[type] === false) return;

    // Session dedup — skip if same type+title already shown this session
    const key = _seenKey(type, data.title);
    if (_sessionSeen.has(key)) return;
    _markSeen(key);

    // Sound
    playNotifSound(data.severity || 'info');

    // Queue toast
    _queue.push({ title: data.title || type, body: data.body || '', severity: data.severity || 'info' });
    _next();

    // Browser push
    showBrowserNotif(data.title, data.body);
  };

  // Permission on first click
  document.addEventListener('click', function _rp() { requestNotifPermission(); document.removeEventListener('click', _rp); }, { once: true });

  window.FleetNotifications = {
    playSound: playNotifSound,
    requestPermission: requestNotifPermission,
    toggleMute: (m) => localStorage.setItem('fleet_notif_muted', m ? 'true' : 'false'),
    isMuted: () => localStorage.getItem('fleet_notif_muted') === 'true',
    clearSession: () => { _sessionSeen.clear(); sessionStorage.removeItem('_fleetNotifSeen'); }
  };

  console.log('🔔 Fleet Notification System V5.0 loaded');
})();
