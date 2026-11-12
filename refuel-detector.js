'use strict';
/**
 * Refuel Detector v4 — "episode tracker"
 * ---------------------------------------------------------------------------
 * Drop-in engine for server.js: detectRefillsV4(points, options) -> events[]
 *
 * points : [{ time(ms), liters, speed, ign, lat, lng }]
 * events : same shape as the legacy detector
 *          { index, time, startTimeMs, endTimeMs, lat, lng, addedLiters, oldLevel,
 *            newLevel, speed, ign, confidence, durationMin, detectionMode }
 *
 * Principles (why the legacy detector missed refills):
 *  1. A refill is a RISE EPISODE (ramp or single step), not a stop segment. We no
 *     longer require one uninterrupted "speed <= 4" segment: GPS speed noise used to
 *     cut the stop in pieces so the rise was never seen as a whole.
 *  2. Motion is judged by displacement + fraction of moving samples, not by a
 *     single noisy speed value.
 *  3. Sleep gaps (tracker off while the tank is being filled) are first-class.
 *  4. Persistence never discards an event just because the series ends right
 *     after it (live data); it only lowers confidence.
 *  5. Sensor glitches (dip then recovery) and fuel slosh while driving are
 *     rejected explicitly instead of being mistaken for refills.
 *  6. Minimum is applied to the NET rise, default 50 L (below = ignored).
 */

const MIN = 60000;

function num(v, d) {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : d;
}

function median(arr) {
  const a = arr.filter(Number.isFinite).sort((x, y) => x - y);
  if (!a.length) return NaN;
  const m = a.length >> 1;
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}

function haversine(lat1, lon1, lat2, lon2) {
  if (![lat1, lon1, lat2, lon2].every(Number.isFinite)) return 0;
  const R = 6371000, r = Math.PI / 180;
  const dLat = (lat2 - lat1) * r, dLon = (lon2 - lon1) * r;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Clean + sort + despike. Returns points with .L (robust liters). */
function prepare(points, maxLevel) {
  const raw = (Array.isArray(points) ? points : []).map((p, index) => {
    if (!p) return null;
    const time = num(p.time, NaN);
    const liters = num(p.liters !== undefined ? p.liters : (p.fuel !== undefined ? p.fuel : (p.fuelLiters !== undefined ? p.fuelLiters : p.level)), NaN);
    if (!Number.isFinite(time) || !Number.isFinite(liters)) return null;
    if (Number.isFinite(maxLevel) && maxLevel > 0 && liters > maxLevel * 1.35) return null;
    return {
      index, time, liters: Math.max(0, liters),
      speed: num(p.speed, 0), ign: parseInt(p.ign, 10) || 0,
      lat: Number.isFinite(parseFloat(p.lat)) ? parseFloat(p.lat) : null,
      lng: Number.isFinite(parseFloat(p.lng)) ? parseFloat(p.lng) : null
    };
  }).filter(Boolean).sort((a, b) => a.time - b.time);

  // drop exact duplicate timestamps (keep last)
  const pts = [];
  raw.forEach((p) => {
    if (pts.length && pts[pts.length - 1].time === p.time) pts[pts.length - 1] = p; else pts.push(p);
  });

  // Hampel-style despike: median of 5 neighbours (time-bounded); a point is replaced only
  // if it deviates from the local median by more than 'spike' liters AND the neighbours agree.
  const spike = 12;
  for (let i = 0; i < pts.length; i += 1) {
    const nb = [];
    for (let k = Math.max(0, i - 2); k <= Math.min(pts.length - 1, i + 2); k += 1) {
      if (Math.abs(pts[k].time - pts[i].time) <= 6 * MIN) nb.push(pts[k].liters);
    }
    const m = nb.length >= 3 ? median(nb) : pts[i].liters;
    pts[i].L = Math.abs(pts[i].liters - m) > spike ? m : pts[i].liters;
  }
  return pts;
}

/** Resolve engine options with safe defaults. */
function resolveOptions(options) {
  const o = options || {};
  const maxParsed = num(o.maxRealisticRefillLiters, NaN);
  return {
    minLiters: Math.max(1, num(o.minRefuelLiters, 50)),
    maxLiters: Number.isFinite(maxParsed) && maxParsed > 0 ? maxParsed : Number.POSITIVE_INFINITY,
    upStep: num(o.v4UpStep, 4),                       // first up-step that opens an episode (L)
    dipTol: num(o.v4DipTolerance, 6),                 // tolerated dip inside a ramp (L)
    maxGapMs: num(o.v4MaxGapMinutes, 12) * MIN,       // max hole between samples inside a ramp
    plateauMs: num(o.v4PlateauMinutes, 8) * MIN,      // no new peak for this long => ramp finished
    maxRiseMs: num(o.v4MaxRiseMinutes, 120) * MIN,    // a refill never lasts longer than this
    moveSpeed: num(o.v4MoveSpeed, 15),                // km/h above which a sample is "moving"
    maxMovingFrac: num(o.v4MaxMovingFraction, 0.5),
    spreadM: Math.max(150, num(o.maxStationarySpreadMeters, 650)),
    persistMs: num(o.v4PersistMinutes, 20) * MIN,
    persistRatio: num(o.v4PersistRatio, 0.6),
    sleepGapMaxMs: num(o.v4SleepGapMaxHours, 12) * 60 * MIN,
    dipLookbackMs: num(o.v4DipLookbackMinutes, 30) * MIN,
    dedupeMs: Math.max(10 * MIN, num(o.dedupeMinutes, 35) * MIN),
    dedupeDistM: num(o.dedupeDistanceMeters, 400),
    isStation: typeof o.isStation === 'function' ? o.isStation : null
  };
}

/** Max distance (m) of any sample of P[a..b] from the first geolocated sample. */
function spread(P, a, b) {
  let ref = null, max = 0;
  const step = Math.max(1, Math.floor((b - a + 1) / 40));
  for (let k = a; k <= b; k += step) {
    const p = P[k];
    if (!Number.isFinite(p.lat) || !Number.isFinite(p.lng)) continue;
    if (!ref) { ref = p; continue; }
    const d = haversine(ref.lat, ref.lng, p.lat, p.lng);
    if (d > max) max = d;
  }
  return max;
}

function movingFraction(P, a, b, moveSpeed) {
  let mv = 0, n = 0;
  for (let k = a; k <= b; k += 1) { n += 1; if (P[k].speed > moveSpeed) mv += 1; }
  return n ? mv / n : 0;
}

/**
 * What happens AFTER the rise?  Returns { state: 'held'|'tentative'|'lost', median }
 * 'tentative' = series ends before we can judge (live data) -> kept, lower confidence.
 */
function persistence(P, fromIdx, o, base, rise) {
  const t0 = P[fromIdx].time;
  const post = [];
  for (let k = fromIdx + 1; k < P.length; k += 1) {
    if (P[k].time > t0 + o.persistMs) break;
    post.push(P[k].L);
  }
  if (post.length < 2) return { state: 'tentative', median: NaN };
  const med = median(post);
  return { state: med >= base + rise * o.persistRatio ? 'held' : 'lost', median: med };
}

/** True if a fast drop of fuel just before 'base' shows we are only seeing a sensor glitch recovering. */
function isDipRecovery(P, baseIdx, o, base, plateau, rise) {
  const tBase = P[baseIdx].time;
  let prevMax = -Infinity;
  for (let k = baseIdx - 1; k >= 0; k -= 1) {
    if (tBase - P[k].time > o.dipLookbackMs) break;
    if (P[k].L > prevMax) prevMax = P[k].L;
  }
  return prevMax - base >= rise * 0.7 && prevMax >= plateau - rise * 0.25;
}

/** Scan the series for upward RUNS (ramp or single step). */
function findEpisodes(P, o) {
  const out = [];
  const n = P.length;
  let i = 0;
  while (i < n - 1) {
    const dt = P[i + 1].time - P[i].time;
    if (dt > o.maxGapMs || P[i + 1].L - P[i].L < o.upStep) { i += 1; continue; }

    // a slow start may precede the first big step: walk back at most 3 flat/rising samples
    let baseIdx = i;
    for (let b = 0; b < 3 && baseIdx > 0; b += 1) {
      const prev = P[baseIdx - 1];
      if (P[baseIdx].time - prev.time > 3 * MIN || prev.L > P[baseIdx].L || prev.speed > o.moveSpeed) break;
      baseIdx -= 1;
    }
    const baseLevel = P[baseIdx].L;

    let peakIdx = i + 1, peak = P[i + 1].L, j = i + 2;
    while (j < n) {
      if (P[j].time - P[j - 1].time > o.maxGapMs) break;
      if (P[j].time - P[baseIdx].time > o.maxRiseMs) break;
      if (P[j].speed > 25) break; // truck is driving away: the fill is over
      if (P[j].L > peak + 2) { peak = P[j].L; peakIdx = j; }
      else if (P[j].time - P[peakIdx].time > o.plateauMs) break;
      else if (peak - P[j].L > Math.max(o.dipTol, 0.3 * (peak - baseLevel))) break;
      j += 1;
    }
    out.push({ baseIdx, peakIdx });
    i = Math.max(peakIdx, i + 1);
  }
  return out;
}

/** Plateau level reached after the peak (robust to a single high outlier). */
function plateauLevel(P, peakIdx) {
  const vals = [];
  for (let k = Math.max(0, peakIdx - 1); k < P.length && k <= peakIdx + 3; k += 1) {
    if (P[k].time - P[peakIdx].time > 10 * MIN) break;
    vals.push(P[k].L);
  }
  return median(vals);
}

/** Confidence from evidence (0..1). */
function scoreEvent(ev, o) {
  let c = 0.62;
  if (ev.stationary) c += 0.14;
  if (ev.persist === 'held') c += 0.12; else if (ev.persist === 'tentative') c -= 0.1;
  if (ev.ign === 0) c += 0.04;
  if (ev.addedLiters >= 100) c += 0.04;
  if (ev.nearStation) c += 0.1;
  return Math.max(0.3, Math.min(0.99, Math.round(c * 100) / 100));
}

function buildEvent(P, baseIdx, endIdx, base, plateau, mode, o, persist) {
  const a = P[baseIdx], b = P[endIdx];
  const lat = Number.isFinite(b.lat) ? b.lat : a.lat;
  const lng = Number.isFinite(b.lng) ? b.lng : a.lng;
  const sp = spread(P, baseIdx, endIdx);
  const ev = {
    index: b.index, time: b.time, startTimeMs: a.time, endTimeMs: b.time,
    lat, lng,
    addedLiters: Math.round(plateau - base), oldLevel: Math.round(base), newLevel: Math.round(plateau),
    speed: b.speed, ign: b.ign,
    durationMin: Math.max(1, Math.round((b.time - a.time) / MIN)),
    detectionMode: mode, stationary: sp <= o.spreadM,
    persist: persist.state,
    nearStation: !!(o.isStation && Number.isFinite(lat) && Number.isFinite(lng) && o.isStation(lat, lng))
  };
  ev.confidence = scoreEvent(ev, o);
  if (persist.state === 'tentative') ev.tentative = true;
  delete ev.stationary; delete ev.persist; delete ev.nearStation;
  return ev;
}

/** Validate one rise (indexes into P); returns event or null. */
function evaluateRise(P, baseIdx, endIdx, base, plateau, mode, o) {
  const rise = plateau - base;
  if (!(rise >= o.minLiters && rise <= o.maxLiters)) return null;
  if (spread(P, baseIdx, endIdx) > o.spreadM) return null;
  if (movingFraction(P, baseIdx, endIdx, o.moveSpeed) > o.maxMovingFrac) return null;
  if (P[endIdx].speed > 30) return null;
  const per = persistence(P, endIdx, o, base, rise);
  if (per.state === 'lost') return null;
  if (isDipRecovery(P, baseIdx, o, base, plateau, rise)) return null;
  return buildEvent(P, baseIdx, endIdx, base, plateau, mode, o, per);
}

/** Rises hidden inside a sampling hole (tracker asleep while the tank was filled). */
function findGapEvents(P, o) {
  const out = [];
  for (let i = 0; i < P.length - 1; i += 1) {
    const dt = P[i + 1].time - P[i].time;
    if (dt <= o.maxGapMs || dt > o.sleepGapMaxMs) continue;
    if (P[i].speed > 15 || P[i + 1].speed > 15) continue;
    const before = [], after = [];
    for (let k = i; k >= 0 && before.length < 3 && P[i].time - P[k].time <= 10 * MIN; k -= 1) before.push(P[k].L);
    for (let k = i + 1; k < P.length && after.length < 3 && P[k].time - P[i + 1].time <= 10 * MIN; k += 1) after.push(P[k].L);
    const base = median(before), plateau = median(after);
    const ev = evaluateRise(P, i, i + 1, base, plateau, 'sleep-gap', o);
    if (ev) out.push(ev);
  }
  return out;
}

/** Merge events whose windows touch (same pump session, split by noise). */
function mergeEvents(events, o) {
  const sorted = events.filter(Boolean).sort((a, b) => a.time - b.time);
  const merged = [];
  sorted.forEach((cur) => {
    const prev = merged[merged.length - 1];
    if (prev) {
      const close = cur.startTimeMs <= prev.endTimeMs + o.dedupeMs;
      const dist = haversine(prev.lat, prev.lng, cur.lat, cur.lng);
      const near = !(Number.isFinite(prev.lat) && Number.isFinite(cur.lat)) || dist <= o.dedupeDistM * 2;
      if (close && near) {
        const oldLevel = Math.min(prev.oldLevel, cur.oldLevel);
        const newLevel = Math.max(prev.newLevel, cur.newLevel);
        merged[merged.length - 1] = {
          ...prev, ...cur,
          startTimeMs: Math.min(prev.startTimeMs, cur.startTimeMs),
          endTimeMs: Math.max(prev.endTimeMs, cur.endTimeMs),
          time: Math.max(prev.time, cur.time),
          oldLevel, newLevel, addedLiters: Math.round(newLevel - oldLevel),
          confidence: Math.max(prev.confidence, cur.confidence),
          durationMin: Math.max(1, Math.round((Math.max(prev.endTimeMs, cur.endTimeMs) - Math.min(prev.startTimeMs, cur.startTimeMs)) / MIN)),
          detectionMode: prev.detectionMode === cur.detectionMode ? prev.detectionMode : 'consolidated',
          tentative: !!(prev.tentative && cur.tentative)
        };
        if (!merged[merged.length - 1].tentative) delete merged[merged.length - 1].tentative;
        return;
      }
    }
    merged.push(cur);
  });
  return merged;
}

/**
 * Main entry. Same signature/return shape as the legacy detectRefillEventsFromSeries.
 */
function detectRefillsV4(points, options) {
  const o = resolveOptions(options);
  const P = prepare(points, Number.isFinite(o.maxLiters) ? o.maxLiters : null);
  if (P.length < 2) return [];

  const events = [];
  findEpisodes(P, o).forEach((ep) => {
    const base = P[ep.baseIdx].L;
    const plateau = plateauLevel(P, ep.peakIdx);
    const jump = ep.peakIdx - ep.baseIdx <= 2;
    const ev = evaluateRise(P, ep.baseIdx, ep.peakIdx, base, plateau, jump ? 'step-jump' : 'ramp-episode', o);
    if (ev) events.push(ev);
  });
  findGapEvents(P, o).forEach((ev) => events.push(ev));

  return mergeEvents(events, o).filter((ev) => ev.addedLiters >= o.minLiters && ev.addedLiters <= o.maxLiters);
}

module.exports = { detectRefillsV4, resolveOptions };
