
FIXES APPLIED - DEPLOY THESE 2 FILES
=====================================

1. ui.js
--------
BUG FIXED: 'realOld' was MISSING from the return object in renderFilteredRefuels()
This is why "Avant" always showed "—" — the value was never calculated and passed to the card.
Fix: realOld is now explicitly calculated using log.oldLevel from MongoDB.

2. server.js  
-----------
BUG FIXED: /api/admin/reset-engine-states now accepts URL ?secret= param
Before: Required x-access-code HEADER → blocked when opened in browser URL
After: Works with ?secret=Douroub2025AdminSecure in the URL directly

DEPLOY STEPS:
1. Replace ui.js and server.js on your server
2. Restart the server (pm2 restart app)  
3. Open in browser: https://YOUR-SERVER/api/admin/reset-engine-states?secret=Douroub2025AdminSecure
4. You should see: {"success":true,"message":"✅ All engine states reset!..."}
5. Wait ~30-60 seconds for the bot to run a cycle
6. Check Reports → Remplissages - should now show refills with correct "Avant" values
