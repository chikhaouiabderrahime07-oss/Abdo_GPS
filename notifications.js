/* =============================================================
   DOUROUB FLEET V4.0 — NOTIFICATION SYSTEM
   Per-user notification preferences + history (localStorage)
   ============================================================= */

// Note: Core notification functions (pushNotification, toggleNotificationPanel, etc.)
// are already embedded inline in index.html for immediate availability.
// This file extends with advanced features.

(function() {
  'use strict';

  // ─── Notification Sound System (Web Audio API) ───
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  let audioCtx = null;

  function getAudioCtx() {
    if (!audioCtx) {
      try { audioCtx = new AudioCtx(); } catch(e) { console.warn('Web Audio not supported'); }
    }
    return audioCtx;
  }

  function playNotifSound(severity) {
    const ctx = getAudioCtx();
    if (!ctx) return;
    const muted = localStorage.getItem('fleet_notif_muted') === 'true';
    if (muted) return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    const configs = {
      info:     { freq: 880, dur: 0.15, type: 'sine', vol: 0.05 },
      warning:  { freq: 660, dur: 0.25,  type: 'sine', vol: 0.08 },
      critical: { freq: 440, dur: 0.4, type: 'sine', vol: 0.1 },
    };
    const c = configs[severity] || configs.info;
    osc.type = c.type;
    osc.frequency.setValueAtTime(c.freq, ctx.currentTime);
    
    // Softer attack and release
    gain.gain.setValueAtTime(0, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(c.vol, ctx.currentTime + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + c.dur);
    
    osc.start();
    osc.stop(ctx.currentTime + c.dur + 0.1);
  }

  // ─── Browser Notification API ───
  async function requestNotifPermission() {
    if ('Notification' in window && Notification.permission === 'default') {
      try { await Notification.requestPermission(); } catch(e) {}
    }
  }

  function showBrowserNotif(title, body, icon) {
    if ('Notification' in window && Notification.permission === 'granted') {
      try {
        new Notification(title, {
          body: body || '',
          icon: icon || '',
          badge: '',
          tag: 'fleet-notif-' + Date.now(),
          silent: true
        });
      } catch(e) {}
    }
  }

  // ─── Enhanced pushNotification ───
  const originalPush = window.pushNotification;
  window.pushNotification = function(type, data) {
    // Call the original inline handler
    if (originalPush) originalPush(type, data);
    
    // Play sound
    playNotifSound(data.severity || 'info');
    
    
    // Show in-app Toast Recap
    let toastContainer = document.getElementById("fleetToastContainer");
    if (!toastContainer) {
      toastContainer = document.createElement("div");
      toastContainer.id = "fleetToastContainer";
      toastContainer.style.cssText = "position:fixed; bottom:20px; right:20px; z-index:9999999; display:flex; flex-direction:column; gap:10px;";
      document.body.appendChild(toastContainer);
    }
    const toast = document.createElement("div");
    const bgColor = data.severity === "critical" ? "var(--danger)" : (data.severity === "warning" ? "var(--warning)" : "var(--primary)");
    toast.style.cssText = `background:var(--bg-elevated); border-left:4px solid ${bgColor}; padding:15px; border-radius:8px; box-shadow:0 10px 25px rgba(0,0,0,0.5); width:320px; animation: slideInRight 0.3s ease-out forwards; cursor:pointer;`;
    toast.innerHTML = `<div style="font-weight:bold; color:var(--text-primary); font-size:14px;">${data.title}</div><div style="font-size:12px; color:var(--text-secondary); margin-top:5px;">${data.body}</div>`;
    toast.onclick = () => { toast.style.opacity = "0"; setTimeout(() => toast.remove(), 300); };
    toastContainer.appendChild(toast);
    setTimeout(() => { toast.style.opacity = "0"; setTimeout(() => toast.remove(), 300); }, 5000);

    // Browser notification
    showBrowserNotif(data.title, data.body);
  };

  // ─── Request permission on first interaction ───
  document.addEventListener('click', function _reqPerm() {
    requestNotifPermission();
    document.removeEventListener('click', _reqPerm);
  }, { once: true });

  // ─── Export utilities ───
  window.FleetNotifications = {
    playSound: playNotifSound,
    requestPermission: requestNotifPermission,
    toggleMute: function(muted) {
      localStorage.setItem('fleet_notif_muted', muted ? 'true' : 'false');
    },
    isMuted: function() {
      return localStorage.getItem('fleet_notif_muted') === 'true';
    }
  };

  console.log('🔔 Fleet Notification System V4.0 loaded');
})();

