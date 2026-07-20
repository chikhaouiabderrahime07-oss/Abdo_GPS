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
    const soundType = localStorage.getItem('fleet_notif_sound') || 'beep';
    if (soundType === 'none') return;
    
    const time = ctx.currentTime;
    
    // Helper to play a tone
    const playTone = (freq, type, vol, startOffset, dur) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = type;
        osc.frequency.setValueAtTime(freq, time + startOffset);
        
        gain.gain.setValueAtTime(0, time + startOffset);
        gain.gain.linearRampToValueAtTime(vol, time + startOffset + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, time + startOffset + dur);
        
        osc.start(time + startOffset);
        osc.stop(time + startOffset + dur + 0.1);
    };

    if (soundType === 'beep') {
        const configs = {
          info:     { freq: 880, dur: 0.15, type: 'sine', vol: 0.05 },
          warning:  { freq: 660, dur: 0.25, type: 'sine', vol: 0.08 },
          critical: { freq: 440, dur: 0.4,  type: 'sine', vol: 0.1 },
        };
        const c = configs[severity] || configs.info;
        playTone(c.freq, c.type, c.vol, 0, c.dur);
    } 
    else if (soundType === 'chime') {
        // Double sweet tone
        const baseFreq = severity === 'critical' ? 400 : (severity === 'warning' ? 600 : 900);
        playTone(baseFreq, 'sine', 0.05, 0, 0.2);
        playTone(baseFreq * 1.25, 'sine', 0.04, 0.15, 0.3);
    }
    else if (soundType === 'pulse') {
        // Alert pulse
        const baseFreq = severity === 'critical' ? 300 : (severity === 'warning' ? 450 : 600);
        playTone(baseFreq, 'square', 0.03, 0, 0.1);
        playTone(baseFreq, 'square', 0.03, 0.15, 0.1);
        if (severity === 'critical') playTone(baseFreq, 'square', 0.03, 0.3, 0.2);
    }
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
    let status = { popup: true };
    if (originalPush) {
        status = originalPush(type, data) || status;
    }
    
    // If the preference is history_only or disabled, skip popup & sound
    if (!status.popup) return;
    
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
    
    // Ensure the toast looks sophisticated and disappears smoothly when clicked
    toast.style.cssText = `background:var(--bg-elevated); border-left:4px solid ${bgColor}; padding:15px; border-radius:8px; box-shadow:0 10px 25px rgba(0,0,0,0.5); width:320px; animation: slideInRight 0.3s ease-out forwards; cursor:pointer; transition: all 0.3s ease;`;
    toast.innerHTML = `<div style="font-weight:bold; color:var(--text-primary); font-size:14px;">${data.title}</div><div style="font-size:12px; color:var(--text-secondary); margin-top:5px;">${data.body}</div>`;
    
    toast.onclick = () => { 
        toast.style.transform = "translateX(100%)"; 
        toast.style.opacity = "0"; 
        setTimeout(() => toast.remove(), 300); 
    };
    
    toastContainer.appendChild(toast);
    
    // Auto remove after 5 seconds
    setTimeout(() => { 
        if(toast.parentElement) {
            toast.style.transform = "translateX(100%)"; 
            toast.style.opacity = "0"; 
            setTimeout(() => { if(toast.parentElement) toast.remove(); }, 300); 
        }
    }, 5000);

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

