# Implementation Plan: Speed Tracking & Alert Refinements

## Goal Description
1. Fix OR Generation: Pre-select vehicle schema from the Maintenance Modal, lock SVG interaction in generated OR, and restore the "Forfait" text display without the dropdown.
2. Background Speed Tracking: Implement a robust backend system to track truck speeding events independently of the frontend UI.
3. Rescan Tool: Provide an endpoint and UI tool to retrospectively rescan historical GPS logs for speeding infractions over a given period.

## Proposed Changes

### Frontend OR Generator Updates
#### [MODIFY] index.html
- Add a new <select id="modalMaintScheme"> inside the Maintenance Wizard (Step 1) to choose the vehicle schema (Véhicule, Tracteur 4x2, etc.).

#### [MODIFY] ui.js
- In generateOrdreReparation(), read modalMaintScheme and append &scheme=... to the URL.

#### [MODIFY] ordre_reparation_v21.html
- Restore if (urlP.get('forfaitName')) parts.push('Forfait: ' + decodeURIComponent(urlP.get('forfaitName')));.
- Add pointer-events: none; to .tire and .mark when generated via URL so SVGs are no longer clickable.
- If urlP.get('scheme') is present, call setScheme(urlP.get('scheme')).

### Backend Background Speeding Tracker
#### [NEW] server/models/SpeedViolation.js (or similar logic inside server.js)
- Schema to store: deviceId, 	imestamp, speed, limit, location.
- During the unFleetBot cron job or GPS ingest, compare real-time speed against the truck's speed limit. If exceeded, log a violation to MongoDB.

#### [MODIFY] server.js
- Add POST /api/speeding/rescan: A bulk rescan endpoint that accepts a date range and list of deviceIds. It will fetch historical GPS points, calculate speeds, and populate the speeding database.
- Add GET /api/speeding/history: Endpoint to fetch historical speeding violations for the UI.

## User Review Required
> [!IMPORTANT]
> The backend speed tracking requires storing new historical data. I will implement a SpeedViolation collection in your MongoDB to keep track of every over-speed event so you can view it later.
> For the rescan feature, do you want a new dedicated UI tab to run the rescan and view the speeding history, or should I integrate it into the existing History Player / Driver Scoring tabs?
