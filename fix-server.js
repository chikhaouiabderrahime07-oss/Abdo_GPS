const fs = require('fs');
let s = fs.readFileSync('c:/Users/ABDOU/Desktop/Telegram/before ma/server.js', 'utf8');

// 1. Fix itinerary set-names
const searchItin = `    }
    res.json({ ok: true, updated });
  } catch (e) {
    console.error('Itinerary upsert error:', e);
    res.status(500).json({ error: e.message });
  }
});

// PATCH /api/itinerary/set-names — update resolved place names
itinRoute.patch('/set-names', async (req, res) => {
  try {
    const { key, nameStart, nameEnd } = req.body;
    if (!key) return res.status(400).json({ error: 'key required' });
    await ItinerarySegment.updateOne({ key }, { $set: { nameStart, nameEnd } });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
// GET /api/itinerary/all — return all stored itinerary segments`;

if (!s.includes("itinRoute.patch('/set-names',")) {
    s = s.replace(`    }
itinRoute.get('/all', async (req, res) => {`, searchItin + `\nitinRoute.get('/all', async (req, res) => {`);
}

// 2. Fix defaults array
const defaultsArr = `    const defaults = [
      { code: 'VID-001', name: 'Vidange Moteur', category: 'Entretien Préventif', description: 'Vidange huile moteur complète avec remplacement filtre', defaultPrice: 20000, laborCost: 3000, estimatedDuration: '2h', components: [{ name: 'Huile Moteur 15W40 (10L)', quantity: 1, unitCost: 8000 }, { name: 'Filtre à Huile', quantity: 1, unitCost: 2500 }, { name: 'Joint de Bouchon', quantity: 1, unitCost: 500 }, { name: 'Filtre à Gasoil', quantity: 1, unitCost: 3000 }] },
      { code: 'FRN-001', name: 'Remplacement Plaquettes de Frein', category: 'Freinage', description: 'Remplacement plaquettes de frein avant et arrière', defaultPrice: 35000, laborCost: 5000, estimatedDuration: '3h', components: [{ name: 'Plaquettes Avant (jeu)', quantity: 1, unitCost: 12000 }, { name: 'Plaquettes Arrière (jeu)', quantity: 1, unitCost: 10000 }] },
      { code: 'PNU-001', name: 'Remplacement Pneumatiques', category: 'Pneumatiques', description: 'Changement de pneus usés', defaultPrice: 45000, laborCost: 4000, estimatedDuration: '2h', components: [{ name: 'Pneu 315/80 R22.5', quantity: 2, unitCost: 18000 }] },
      { code: 'FLT-001', name: 'Remplacement Filtres', category: 'Entretien Préventif', description: 'Remplacement de tous les filtres', defaultPrice: 15000, laborCost: 2000, estimatedDuration: '1h30', components: [{ name: 'Filtre à Air', quantity: 1, unitCost: 4000 }, { name: 'Filtre à Huile', quantity: 1, unitCost: 2500 }, { name: 'Filtre à Gasoil', quantity: 1, unitCost: 3000 }, { name: 'Filtre Séparateur Eau', quantity: 1, unitCost: 2500 }] },
      { code: 'BAT-001', name: 'Remplacement Batterie', category: 'Électrique', description: 'Remplacement batterie véhicule', defaultPrice: 25000, laborCost: 1000, estimatedDuration: '30min', components: [{ name: 'Batterie 12V 180Ah', quantity: 2, unitCost: 11000 }] },
      { code: 'EMB-001', name: 'Remplacement Embrayage', category: 'Transmission', description: 'Remplacement kit embrayage complet', defaultPrice: 85000, laborCost: 15000, estimatedDuration: '8h', components: [{ name: 'Kit Embrayage Complet', quantity: 1, unitCost: 55000 }, { name: 'Butée Embrayage', quantity: 1, unitCost: 8000 }] },
      { code: 'CRG-001', name: 'Réparation Climatisation', category: 'Confort', description: 'Recharge et réparation système climatisation', defaultPrice: 18000, laborCost: 5000, estimatedDuration: '3h', components: [{ name: 'Gaz Réfrigérant R134a', quantity: 1, unitCost: 6000 }, { name: 'Filtre Déshydrateur', quantity: 1, unitCost: 4000 }] },
      { code: 'SUS-001', name: 'Réparation Suspension', category: 'Suspension', description: 'Remplacement amortisseurs et ressorts', defaultPrice: 55000, laborCost: 8000, estimatedDuration: '5h', components: [{ name: 'Amortisseur Avant', quantity: 2, unitCost: 9000 }, { name: 'Amortisseur Arrière', quantity: 2, unitCost: 8000 }] },
      { code: 'DIV-001', name: 'Réparation Diverse', category: 'Divers', description: 'Travaux de maintenance non catégorisés', defaultPrice: 0, laborCost: 0, estimatedDuration: 'Variable', components: [] }
    ];
    for (const art of defaults) {`;

if (!s.includes("const defaults = [")) {
    s = s.replace(`// POST seed default maintenance articles (one-time setup)
app.post('/api/maintenance-articles/seed-defaults', checkAccess, async (req, res) => {
  try {
    for (const art of defaults) {`, `// POST seed default maintenance articles (one-time setup)
app.post('/api/maintenance-articles/seed-defaults', checkAccess, async (req, res) => {
  try {
${defaultsArr}`);
}

fs.writeFileSync('c:/Users/ABDOU/Desktop/Telegram/before ma/server.js', s);
console.log('Restored deleted code blocks!');
