/**
 * SEED V2: Enhanced Full Year Exercise — All Algerian Scenarios
 * 
 * SCENARIOS:
 *   1. Normal flow: BCH → BR reserved → Usine validates → Delivered → Paid
 *   2. Supplier rejects BCH (usine refuses to load)
 *   3. BCH accepted then qty changed at weighbridge
 *   4. Partial delivery (driver only takes part of order)
 *   5. Full return (client refuses merchandise, damaged goods)
 *   6. Late payment / disputed amounts
 *   7. BCH with multiple suppliers same day
 *   8. Recurring charges (loyer, internet, téléphone, assurance)
 *   9. Payroll as validated charge per month
 *   10. Bank deposits from Etat de Vente
 *   11. Bank withdrawal fees auto-calculated
 *   12. Attendance: sick days, congé, late arrivals, missions
 *   13. Bon de Retour with full reason tracking
 *   14. Admin-validated Etat de Vente with PDF history
 * 
 * Run: node seed_v2.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Document = require('./models/Document');

const START_YEAR = 2025, START_MONTH = 9; // Oct 2025
const MONTHS = 12;

let bchN=1, brN=1, retN=1, payN=1, txN=1, chargeN=1, evN=1;
let totalDocs = 0;

// ─── Algerian Data ────────────────────────────────────
const W=['Alger','Oran','Constantine','Annaba','Blida','Batna','Tizi Ouzou','Sétif','Béjaïa','Tlemcen','Djelfa','Biskra','Médéa','Mostaganem','M\'sila','Mascara','Ouargla','Ghardaïa','Chlef','Skikda','Bouira','Tiaret','Boumerdès','El Oued','BBA','Aïn Defla','Mila','Jijel','Relizane','Saïda'];
const FN=['Mohamed','Ahmed','Youcef','Karim','Sofiane','Nadir','Hamza','Amine','Bilal','Rachid','Salim','Farid','Nabil','Omar','Khaled','Samir','Djamel','Hichem','Noureddine','Mourad','Riad','Tarek','Walid','Abdelkader','Anis','Fares','Issam','Lotfi','Nassim','Reda','Sami','Yassine','Zakaria','Fouad','Mounir','Ali','Said','Djilali','Bachir','Slim'];
const LN=['Benali','Bouzid','Khelif','Mebarki','Hadjadj','Boumediene','Saadi','Belkacemi','Aït Ahmed','Zidane','Ferhat','Guemri','Tounsi','Hamdani','Berrada','Mokrani','Djebbar','Zeghida','Benmoussa','Amrouche','Touati','Bensalem','Kaci','Madani','Berkani','Larbi','Haddad','Boudaoud','Cherif','Slimani'];
const CP=['SARL','EURL','SPA','EPE','SNC'];
const CN=['El Baraka','Nour','Essalam','El Feth','Ennour','El Amel','Tayeb','El Waha','El Falah','Rizk','Yasmine','El Djazair','Soummam','El Hikma','Titteri','Hasnaoui','Condor','IRIS','Cevital','Haddad Group','Cosider','Naftal','El Kendi','Atlas','Maghreb','Sahel','Rouiba','Tonic','Hamoud','Star'];
const CATS=[
  {p:'Brique',t:['12 trous','08 trous','15 trous','20x20','Pleine','Creuse','Agglos 10','Agglos 15','Agglos 20'],pr:[18,35],u:'U'},
  {p:'Ciment',t:['CPJ 42.5','CPA 52.5','Blanc','Gris 32.5','Résistant'],pr:[850,1500],u:'Sac'},
  {p:'Fer',t:['Rond 8mm','Rond 10mm','Rond 12mm','Rond 14mm','Rond 16mm','Treillis'],pr:[1200,4500],u:'Qx'},
  {p:'Céramique',t:['30x30','40x40','60x60','Murale 25x40','Faïence 20x30'],pr:[350,1200],u:'m²'},
  {p:'Plâtre',t:['Standard','Fin','Décoration','BA13','Carreau'],pr:[280,650],u:'Sac'},
  {p:'Bois',t:['Coffrage','Chevron','Madrier','Contreplaqué','MDF'],pr:[800,3500],u:'ML'},
  {p:'Peinture',t:['Acrylique 25L','Vinylique 25L','Laque 5L','Sous-couche 10L'],pr:[2500,8500],u:'Seau'},
  {p:'Tube',t:['PVC 100','PVC 50','PPR 20','PPR 25','Galvanisé 33'],pr:[120,450],u:'Barre'},
];
const BANKS=[
  {id:6001,name:'Al Baraka',num:'001'+rI(10000,99999)+''+rI(10000,99999),bal:15000000},
  {id:6002,name:'CPA',num:'002'+rI(10000,99999)+''+rI(10000,99999),bal:22000000},
  {id:6003,name:'BNA',num:'003'+rI(10000,99999)+''+rI(10000,99999),bal:8000000},
  {id:6004,name:'BEA',num:'004'+rI(10000,99999)+''+rI(10000,99999),bal:12000000},
  {id:6005,name:'CNEP',num:'005'+rI(10000,99999)+''+rI(10000,99999),bal:5000000},
];
const RETURN_REASONS = [
  'Marchandise endommagée pendant le transport',
  'Qualité non conforme — produit défectueux',
  'Erreur de commande — mauvais produit livré',
  'Client a refusé la marchandise — non conforme au devis',
  'Quantité excédentaire — surplus non commandé',
  'Problème de date de péremption',
  'Casse pendant le déchargement',
  'Litige commercial — prix non accordé',
  'Annulation de commande par le client',
  'Marchandise mouillée / non protégée',
];
const REJECT_REASONS = [
  'Stock insuffisant — usine en arrêt',
  'Camion non conforme aux exigences',
  'Bon de chargement incomplet',
  'Problème de paiement — crédit dépassé',
  'Usine en maintenance',
  'Chauffeur non autorisé',
  'Quota journalier atteint',
];
const CHARGE_TYPES = [
  {label:'Loyer dépôt/bureau',min:50000,max:200000},
  {label:'Facture Sonelgaz (électricité)',min:8000,max:45000},
  {label:'Facture Algérie Télécom (internet+fixe)',min:3000,max:8000},
  {label:'Facture Mobilis/Djezzy/Ooredoo (flotte mobile)',min:5000,max:25000},
  {label:'Assurance véhicules',min:15000,max:80000},
  {label:'Carburant camions',min:30000,max:150000},
  {label:'Entretien & réparations',min:5000,max:50000},
  {label:'Fournitures de bureau',min:2000,max:10000},
  {label:'Frais notaire/comptable',min:10000,max:40000},
  {label:'Taxe foncière/patente',min:5000,max:30000},
  {label:'Nettoyage & gardiennage',min:8000,max:25000},
  {label:'Catering/Restauration employés',min:15000,max:60000},
];

const pk=a=>a[Math.floor(Math.random()*a.length)];
function rI(a,b){return Math.floor(Math.random()*(b-a+1))+a;}
const rF=(a,b)=>Math.round((a+Math.random()*(b-a))*100)/100;
let _idCounter = 0;
const gId=()=>Date.now()*1000 + (++_idCounter);
const p2=n=>String(n).padStart(2,'0');
const lt=(q,p,d)=>Math.round(q*p*(1-d/100)*100)/100;
const ct=ht=>Math.ceil(ht*0.01);
function calcIRG(bi){if(bi<=10000)return 0;if(bi<=30000)return Math.round((bi-10000)*0.20*100)/100;if(bi<=120000)return Math.round((4000+(bi-30000)*0.30)*100)/100;return Math.round((31000+(bi-120000)*0.35)*100)/100;}

// ─── Generators ───────────────────────────────────────
function genSuppliers(n){const r=[];for(let i=1;i<=n;i++){const c=pk(CATS);r.push({id:1000+i,name:`${pk(CP)} ${pk(CN)} ${pk(['Matériaux','Construction','Trading','Distribution','Import','Industries','Production','Commerce','Négoce','Bâtiment'])}`.substring(0,50),address:`Zone Industrielle ${pk(W)}, Lot ${rI(1,200)}`,phone:`0${rI(5,7)}${rI(10,99)} ${rI(10,99)} ${rI(10,99)} ${rI(10,99)}`,nif:`0${rI(10,99)}${rI(100,999)}0${rI(10,99)}${rI(10,99)}${rI(10,99)}`,refAbbrev:['BR','CM','FR','CER','PL','BO','PT','TB'][CATS.indexOf(c)]+p2(i),category:c.p,contactName:`${pk(FN)} ${pk(LN)}`,wilaya:pk(W),createdAt:'2025-09-01T00:00:00.000Z'});}return r;}
function genClients(n){const r=[];for(let i=1;i<=n;i++){r.push({id:2000+i,name:`${pk(CP)} ${pk(CN)} ${pk(['Construction','Bâtiment','Promotion Immobilière','Travaux Publics','Habitat','Génie Civil'])}`,address:`${rI(1,200)} Rue ${pk(FN)} ${pk(LN)}, ${pk(W)}`,phone:`0${rI(5,7)}${rI(10,99)} ${rI(10,99)} ${rI(10,99)} ${rI(10,99)}`,nif:`0${rI(10,99)}${rI(100,999)}0${rI(10,99)}${rI(10,99)}${rI(10,99)}`,wilaya:pk(W),createdAt:'2025-09-01T00:00:00.000Z'});}return r;}
function genDrivers(n){const r=[];for(let i=1;i<=n;i++){const w=rI(1,48);r.push({id:3000+i,name:`${pk(FN)} ${pk(LN)}`,phone:`07${rI(0,9)}${rI(0,9)} ${rI(10,99)} ${rI(10,99)} ${rI(10,99)}`,truckIMM:`${p2(w)}-${rI(100,999)}-${p2(w)}`});}return r;}
function genArticles(){const r=[];let id=4000;CATS.forEach(c=>{c.t.forEach(t=>{r.push({id:id++,designation:`${c.p} ${t}`,unit:c.u,minPrice:c.pr[0],maxPrice:c.pr[1],category:c.p});});});return r;}
function genEmployees(n){const r=[];const dp=['Ventes & Caisse','Approvisionnement & Stock','Logistique & Livraison','Administration & Comptabilité','Direction Générale'];const jt=['Caissier Vendeur','Magasinier','Chauffeur Livreur','Agent Commercial','Comptable','Responsable Stock','Chef de Dépôt','Secrétaire','Agent de Saisie','Responsable RH','Directeur Commercial','Gérant'];for(let i=1;i<=n;i++){const nm=`${pk(FN)} ${pk(LN)}`;r.push({id:5000+i,name:nm,username:nm.toLowerCase().replace(/\s/g,'.').replace(/[^a-z.]/g,''),password:'pass123',role:i<=3?'admin':'user',department:pk(dp),jobTitle:pk(jt),baseSalary:rI(25,80)*1000,tauxHoraire:rI(150,500),congeBalance:30,hireDate:`${2025-rI(0,5)}-${p2(rI(1,12))}-${p2(rI(1,28))}`,phone:`07${rI(0,9)}${rI(0,9)} ${rI(10,99)} ${rI(10,99)} ${rI(10,99)}`,permissions:{canViewBRs:true,canViewBLs:true,canViewCaisse:i<=10,canViewBank:i<=5,canViewSuppliers:true,canViewClients:true,canViewStats:i<=10,canViewCatalogue:true},createdAt:'2025-09-01T00:00:00.000Z'});}return r;}

// ─── Monthly Transaction Generator ───────────────────
async function genMonth(mo, yr, sups, clis, drs, arts, emps, banks) {
  const docs = [];
  const dim = new Date(yr,mo+1,0).getDate();
  const ms = `${yr}-${p2(mo+1)}`;
  const bchCount = rI(200,250);
  let caisseIn=0, caisseOut=0, returnsTTC=0;
  const monthBCHs=[], monthBRs=[], monthRetours=[];

  for(let i=0; i<bchCount; i++){
    const day=rI(1,dim), dt=new Date(yr,mo,day,rI(7,17),rI(0,59));
    const ds=`${yr}-${p2(mo+1)}-${p2(day)}`;
    const sup=pk(sups), cli=pk(clis), dr=pk(drs), cr=pk(emps.filter(e=>e.id<=5010));
    const sa=arts.filter(a=>a.category===sup.category);
    const la=sa.length?sa:arts.slice(0,5);
    const nl=rI(1,Math.min(4,la.length));
    const lines=[], used=new Set();
    for(let j=0;j<nl;j++){let a;do{a=pk(la);}while(used.has(a.id)&&used.size<la.length);used.add(a.id);const q=rI(50,150000),p=rF(a.minPrice,a.maxPrice),d=Math.random()<0.15?rI(1,5):0;lines.push({designation:a.designation,unit:a.unit,qty:q,price:p,purchasePrice:p,disc:d,total:lt(q,p,d),qtyDelivered:q});}
    const tHT=Math.round(lines.reduce((s,l)=>s+l.total,0)*100)/100;
    const noT=Math.random()<0.1, tim=noT?0:ct(tHT), tTTC=Math.round((tHT+tim)*100)/100;
    const bchId=gId()+i, bchRef=`BCH/${String(bchN).padStart(4,'0')}/${yr}/${sup.refAbbrev}`;bchN++;

    // ── SCENARIO SELECTION ──
    const rnd=Math.random();
    let status, validAt=null, ticket='', returnDoc=null, rejectReason=null;
    let qtyModified=false, partialDelivery=false;

    if(rnd<0.03){
      // SCENARIO 2: Supplier REJECTS BCH (3%)
      status='returned'; rejectReason=pk(REJECT_REASONS);
    } else if(rnd<0.06){
      // SCENARIO 4: Partial delivery (3%) — driver takes only part
      status='delivered'; partialDelivery=true;
      validAt=new Date(dt.getTime()+rI(1,5)*3600000).toISOString();
      ticket=`PESEE-${rI(10000,99999)}`;
      lines.forEach(l=>{l.qtyDelivered=Math.round(l.qty*rF(0.5,0.9));l.total=lt(l.qtyDelivered,l.price,l.disc);});
    } else if(rnd<0.08){
      // SCENARIO 3: Qty changed at weighbridge (2%)
      status='delivered'; qtyModified=true;
      validAt=new Date(dt.getTime()+rI(1,5)*3600000).toISOString();
      ticket=`PESEE-${rI(10000,99999)}`;
      lines.forEach(l=>{const diff=rI(-5,5)/100;l.qtyDelivered=Math.max(1,Math.round(l.qty*(1+diff)));l.total=lt(l.qtyDelivered,l.price,l.disc);});
    } else if(rnd<0.12){
      // SCENARIO 5: Full return after delivery (4%)
      status='returned';
      validAt=new Date(dt.getTime()+rI(1,5)*3600000).toISOString();
      ticket=`PESEE-${rI(10000,99999)}`;
    } else if(rnd<0.15){
      // SCENARIO 1b: Still pending at usine (3%)
      status='pending_usine';
    } else if(rnd<0.18){
      // SCENARIO 1c: Validated by usine, not yet delivered (3%)
      status='validated_usine';
      validAt=new Date(dt.getTime()+rI(1,5)*3600000).toISOString();
      ticket=`PESEE-${rI(10000,99999)}`;
    } else {
      // SCENARIO 1a: Normal full delivery (82%)
      status='delivered';
      validAt=new Date(dt.getTime()+rI(1,5)*3600000).toISOString();
      ticket=`PESEE-${rI(10000,99999)}`;
    }

    // Recalc totals after possible qty changes
    const fHT=Math.round(lines.reduce((s,l)=>s+l.total,0)*100)/100;
    const fTim=noT?0:ct(fHT), fTTC=Math.round((fHT+fTim)*100)/100;

    const bch={id:bchId,ref:bchRef,date:ds,supplierId:sup.id,supplierName:sup.name,clientId:cli.id,clientName:cli.name,driverName:dr.name,truckIMM:dr.truckIMM,destinationAddress:cli.address,lines,totalHT:fHT,tvaRate:0,tvaAmount:0,noTimbre:noT,timbreAmount:fTim,totalTTC:fTTC,status,isBonChargement:true,validatedAt:validAt,ticketPesee:ticket,validatedBy:validAt?sup.contactName:null,createdBy:cr.id,createdByName:cr.name,createdAt:dt.toISOString()};
    if(rejectReason)bch.rejectReason=rejectReason;
    if(qtyModified)bch.qtyModifiedAtWeighbridge=true;
    if(partialDelivery)bch.isPartialDelivery=true;

    // BR
    const brId=gId()+i+500000, brRef=`BR/${String(brN).padStart(4,'0')}/${yr}/${sup.refAbbrev}`;brN++;
    let brSt='reserved';
    if(status==='delivered'||status==='validated_usine')brSt='delivered';
    if(status==='returned'&&!rejectReason)brSt='open';
    if(rejectReason)brSt='reserved'; // rejected = never got loaded
    const br={id:brId,ref:brRef,brNum:brN-1,year:yr,supplierId:sup.id,supplierName:sup.name,driverName:dr.name,truckIMM:dr.truckIMM,date:ds,lines:lines.map(l=>({designation:l.designation,unit:l.unit,qty:l.qtyDelivered||l.qty,price:l.price,disc:l.disc,total:l.total})),totalHT:fHT,timbreAmount:fTim,totalTTC:fTTC,status:brSt,isAutoGenerated:true,locked:true,bcId:bchId,bcRef:bchRef,ticketPesee:ticket,validatedAt:validAt,validatedBy:bch.validatedBy,notes:rejectReason?`REJETÉ: ${rejectReason}`:`BR auto pour ${bchRef}`,createdBy:cr.id,createdByName:cr.name,createdAt:dt.toISOString()};
    bch.linkedBrId=brId;bch.linkedBrRef=brRef;
    if(status!=='pending_usine'&&!rejectReason)bch.brId=brId;

    docs.push({col:'bls',data:bch});
    docs.push({col:'brs',data:br});
    monthBCHs.push(bch);monthBRs.push(br);

    // SCENARIO 5: Bon de Retour for returned deliveries
    if(status==='returned'&&!rejectReason){
      const retId=gId()+i+900000;
      const retRef=`RET/${String(retN).padStart(4,'0')}/${yr}`;retN++;
      const retDoc={id:retId,ref:retRef,blId:bchId,bcId:bchId,isBonChargement:true,blRef:bchRef,clientId:cli.id,clientName:cli.name,date:ds,items:lines,totalHT:fHT,totalTVA:0,totalTTC:fTTC,reason:pk(RETURN_REASONS),createdBy:cr.id,createdByName:cr.name,createdAt:dt.toISOString(),status:'validated'};
      docs.push({col:'bon_retours',data:retDoc});
      monthRetours.push(retDoc);
      returnsTTC+=fTTC;
      bch.returnRef=retRef;bch.isReturned=true;bch.returnReason=retDoc.reason;
      totalDocs++;
    }
    if(status==='delivered')caisseIn+=fTTC;
    totalDocs+=2;
  }

  // ── Supplier Payments (40% of suppliers paid) ──
  const paidSups=sups.filter(()=>Math.random()<0.4);
  for(const sup of paidSups){
    const supBRs=monthBRs.filter(b=>b.supplierId===sup.id&&b.status==='delivered');
    if(!supBRs.length)continue;
    const supT=supBRs.reduce((s,b)=>s+(b.totalTTC||0),0);
    const payAmt=Math.round(supT*rF(0.5,1.0)*100)/100;
    if(payAmt<=0)continue;
    const bank=pk(banks),day=rI(15,dim),payDate=`${yr}-${p2(mo+1)}-${p2(day)}`;
    const payRef=`PAY/${String(payN).padStart(5,'0')}`;payN++;
    // Payment
    docs.push({col:'supplier_payments',data:{id:gId(),ref:payRef,supplierId:sup.id,bankId:bank.id,source:'bank',amount:payAmt,note:`Paiement ${sup.name}`,date:payDate,by:emps[0].id,byName:emps[0].name,createdAt:new Date(yr,mo,day).toISOString()}});
    // Bank transaction
    docs.push({col:'bank_transactions',data:{id:gId(),bankId:bank.id,type:'payment',subtype:'supplier_payment',supplierId:sup.id,amount:payAmt,note:`Paiement fournisseur: ${sup.name}`,date:payDate,ref:payRef,by:emps[0].id,byName:emps[0].name,createdAt:new Date(yr,mo,day).toISOString()}});
    // Bank withdrawal fee (200 DA per withdrawal)
    docs.push({col:'bank_transactions',data:{id:gId(),bankId:bank.id,type:'payment',amount:200,date:payDate,note:`FRAIS RETRAIT: ${payRef}`,createdAt:new Date(yr,mo,day).toISOString()}});
    // Charge entry for the fee
    docs.push({col:'bank_charges',data:{id:gId(),type:'auto',category:'Frais bancaires',label:`Frais retrait ${payRef}`,amount:200,date:payDate,bankId:bank.id,createdAt:new Date(yr,mo,day).toISOString()}});
    totalDocs+=4;
  }

  // ── Etat de Vente (detailed, admin-validated) ──
  const evNet=Math.round((caisseIn-returnsTTC)*100)/100;
  if(evNet>0){
    const evBank=pk(banks);
    const evRef=`EV/${String(evN).padStart(3,'0')}/${yr}`;evN++;
    const deliveredBCHs=monthBCHs.filter(b=>b.status==='delivered');
    const evDoc={id:gId(),ref:evRef,dateStart:`${yr}-${p2(mo+1)}-01`,dateEnd:`${yr}-${p2(mo+1)}-${p2(dim)}`,
      userName:emps[0].name,userId:emps[0].id,
      items:deliveredBCHs.slice(0,100).map(b=>({blId:b.id,blRef:b.ref,date:b.date,clientName:b.clientName,totalHT:b.totalHT,totalTTC:b.totalTTC})),
      totalBLs:deliveredBCHs.length,totalBLsTTC:caisseIn,grossTotalTTC:caisseIn,
      totalReturnsTTC:returnsTTC,returnsTotalTTC:returnsTTC,
      netTotalTTC:evNet,totalHT:Math.round(evNet/1.01*100)/100,
      tvaRate:0,tvaAmount:0,timbreRate:0.01,timbreAmount:ct(Math.round(evNet/1.01*100)/100),totalTTC:evNet,
      createdBy:emps[0].id,createdByName:emps[0].name,createdAt:new Date(yr,mo,28).toISOString(),
      bankId:evBank.id,bankDepositId:gId(),
      status:'validated',validatedBy:emps[0].name,validatedAt:new Date(yr,mo,28,14,0).toISOString()
    };
    docs.push({col:'etat_vente_docs',data:evDoc});
    // Bank deposit
    docs.push({col:'bank_transactions',data:{id:gId(),bankId:evBank.id,type:'deposit',subtype:'etat_vente',amount:evNet,note:`Dépôt État de Vente ${evRef} — ${deliveredBCHs.length} BLs`,date:`${yr}-${p2(mo+1)}-28`,ref:`EV-DEP-${evRef.replace(/\//g,'-')}`,etatVenteId:evDoc.id,etatVenteRef:evRef,createdAt:new Date(yr,mo,28).toISOString()}});
    totalDocs+=2;
  }

  // ── Recurring Charges (monthly) ──
  for(const ch of CHARGE_TYPES){
    const amt=rI(Math.round(ch.min/1000),Math.round(ch.max/1000))*1000;
    const day=rI(1,28);
    docs.push({col:'bank_charges',data:{id:gId(),type:'manual',category:ch.label.split(' ')[0],label:ch.label,amount:amt,date:`${yr}-${p2(mo+1)}-${p2(day)}`,note:`${ch.label} — ${p2(mo+1)}/${yr}`,createdBy:emps[0].id,createdByName:emps[0].name,createdAt:new Date(yr,mo,day).toISOString()}});
    totalDocs++;
  }

  // ── Payroll (all employees + charge entry) ──
  let totalPayroll=0;
  for(const emp of emps){
    const jt=30,jw=rI(22,30),ja=jt-jw;
    const sb=emp.baseSalary;
    const pro=Math.round(sb*jw/jt*100)/100;
    const hs=rI(0,20),mHS=Math.round(emp.tauxHoraire*hs*100)/100;
    const pr=Math.random()<0.3?rI(1,10)*1000:0;
    const brut=Math.round((pro+mHS+pr)*100)/100;
    const cnas=Math.round(brut*0.09*100)/100;
    const bi=Math.round((brut-cnas)*100)/100;
    const irg=calcIRG(bi);
    const ret=Math.random()<0.1?rI(1,5)*1000:0;
    const net=Math.round((brut-cnas-irg-ret)*100)/100;
    totalPayroll+=net;
    docs.push({col:'fiches_paie',data:{id:gId(),userId:emp.id,userName:emp.name,jobTitle:emp.jobTitle,department:emp.department,month:mo+1,year:yr,salaireBase:sb,joursTotal:jt,joursTravailles:jw,joursAbsence:ja,tauxHS:emp.tauxHoraire,nbHS:hs,montantHS:mHS,primes:pr,retenues:ret,tauxCNAS:9,salaireBrut:brut,prorata:pro,cotisationCNAS:cnas,irg,netPayer:net,status:'validated',validatedBy:emps[0].name,validatedAt:new Date(yr,mo,27,10,0).toISOString(),createdAt:new Date(yr,mo,27).toISOString()}});
    totalDocs++;
  }
  // Payroll as a validated charge
  docs.push({col:'bank_charges',data:{id:gId(),type:'manual',category:'Salaires',label:`Masse salariale ${p2(mo+1)}/${yr} — ${emps.length} employés`,amount:Math.round(totalPayroll),date:`${yr}-${p2(mo+1)}-27`,note:`Paie validée par admin le 27/${p2(mo+1)}/${yr}. ${emps.length} bulletins générés. Montant net total: ${Math.round(totalPayroll)} DA`,isPayroll:true,status:'validated',validatedBy:emps[0].name,validatedAt:new Date(yr,mo,27,14,0).toISOString(),createdBy:emps[0].id,createdByName:emps[0].name,createdAt:new Date(yr,mo,27).toISOString()}});
  totalDocs++;

  // ── Attendance (sick, congé, late, mission) ──
  for(const emp of emps){
    const nr=rI(0,5);
    for(let r=0;r<nr;r++){
      const d=rI(1,dim);
      const st=pk(['absent_unjustified','absent_justified','conge','late','mission']);
      docs.push({col:'rh_rectifications',data:{id:gId(),userId:emp.id,date:`${yr}-${p2(mo+1)}-${p2(d)}`,status:st,hours:st==='present'?8:st==='late'?rI(2,6):st==='mission'?8:0,motif:pk(['Maladie','Congé familial','RDV médical','Urgence','Formation','Mission terrain','Congé annuel','']),by:emps[0].id,byName:emps[0].name,createdAt:new Date(yr,mo,d).toISOString()}});
      totalDocs++;
    }
  }

  // ── Work Log / Audit Trail entries ──
  for(let w=0;w<rI(5,15);w++){
    docs.push({col:'work_log',data:{id:gId(),action:pk(['login','logout','create_bch','validate_br','payment','return','etat_vente','charge']),userId:pk(emps).id,userName:pk(emps).name,details:`Action du ${p2(rI(1,dim))}/${p2(mo+1)}/${yr}`,createdAt:new Date(yr,mo,rI(1,dim),rI(7,18),rI(0,59)).toISOString()}});
    totalDocs++;
  }

  return docs;
}

// ─── MAIN ─────────────────────────────────────────────
async function main(){
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║  SEED V2: Full Year + All Algerian Scenarios               ║');
  console.log('║  100 Suppliers · 50 Employees · 80 Clients · 12 Months     ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  await mongoose.connect(process.env.MONGODB_URI);
  console.log('✅ MongoDB connected\n');

  console.log('🗑️  Clearing ALL existing data...');
  const del=await Document.deleteMany({});
  console.log(`   Deleted ${del.deletedCount} documents\n`);

  const sups=genSuppliers(100),clis=genClients(80),drs=genDrivers(30),arts=genArticles(),emps=genEmployees(50);

  console.log('💾 Inserting base data...');
  const base=[];
  base.push({col:'settings',data:{id:'settings',companyName:'SARL El-Baraka Trading & Logistics',companyAddress:'Zone Industrielle Rouiba, Lot 42, Alger',companyPhone:'023 85 12 34',companyNIF:'001234567890123',companyRC:'RC 16/00-1234567 B20',companyAI:'AI 16401234567',companyNIS:'NIS 001234567890123',companyCNAS:'CNAS 001234567',evCompanyName:'SARL NourElHouda Distribution',evCompanyAddress:'Centre Commercial El-Harrach, Alger',evCompanyPhone:'021 76 45 89',evCompanyNIF:'009876543210987',evCompanyRC:'RC 16/00-9876543 B20',timbreRate:1,bankFees:{}}});
  sups.forEach(s=>base.push({col:'suppliers',data:s}));
  clis.forEach(c=>base.push({col:'clients',data:c}));
  arts.forEach(a=>base.push({col:'articles',data:a}));
  // Default admin user (always accessible)
  base.push({col:'users',data:{id:1,name:'Administrateur',username:'admin',password:'admin123',role:'admin',active:true,department:'Direction Générale',jobTitle:'Administrateur Système',baseSalary:80000,tauxHoraire:500,congeBalance:30,createdAt:'2025-09-01T00:00:00.000Z'}});
  emps.forEach(e=>base.push({col:'users',data:e}));
  BANKS.forEach(b=>base.push({col:'bank_accounts',data:b}));
  drs.forEach(d=>base.push({col:'drivers',data:d}));
  // Recurring charges templates
  CHARGE_TYPES.forEach((ch,i)=>base.push({col:'recurring_charges',data:{id:gId()+i,label:ch.label,amount:rI(Math.round(ch.min/1000),Math.round(ch.max/1000))*1000,frequency:'monthly',dayOfMonth:rI(1,28),category:ch.label.split(' ')[0],active:true,createdAt:'2025-09-01T00:00:00.000Z'}}));

  await Document.insertMany(base);
  totalDocs+=base.length;
  console.log(`   ✅ ${base.length} base docs (${sups.length} suppliers, ${clis.length} clients, ${emps.length} employees, ${arts.length} articles, ${BANKS.length} banks, ${drs.length} drivers, ${CHARGE_TYPES.length} recurring charges)\n`);

  console.log('📊 Generating monthly transactions...\n');
  const MN=['Oct','Nov','Déc','Janv','Févr','Mars','Avril','Mai','Juin','Juil','Août','Sept'];

  for(let m=0;m<MONTHS;m++){
    const mo=(START_MONTH+m)%12,yr=START_YEAR+Math.floor((START_MONTH+m)/12);
    process.stdout.write(`   ${MN[m]} ${yr}... `);
    const docs=await genMonth(mo,yr,sups,clis,drs,arts,emps,BANKS);
    // Batch insert
    for(let i=0;i<docs.length;i+=500){await Document.insertMany(docs.slice(i,i+500),{ordered:false});}
    const bch=docs.filter(d=>d.col==='bls').length;
    const br=docs.filter(d=>d.col==='brs').length;
    const ret=docs.filter(d=>d.col==='bon_retours').length;
    const pay=docs.filter(d=>d.col==='supplier_payments').length;
    const ch=docs.filter(d=>d.col==='bank_charges').length;
    const ev=docs.filter(d=>d.col==='etat_vente_docs').length;
    const fp=docs.filter(d=>d.col==='fiches_paie').length;
    console.log(`${docs.length} docs (${bch} BCH, ${br} BR, ${ret} retours, ${pay} paym, ${ch} charges, ${ev} EV, ${fp} paie)`);
  }

  const fc=await Document.countDocuments();
  const agg=await Document.aggregate([{$group:{_id:'$col',count:{$sum:1}}},{$sort:{count:-1}}]);

  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║  ✅ SEED V2 COMPLETE                                       ║');
  console.log(`║  Total Documents: ${String(fc).padStart(7)}                                  ║`);
  console.log('╠══════════════════════════════════════════════════════════════╣');
  console.log('║  Companies:                                                ║');
  console.log('║    1. SARL El-Baraka Trading & Logistics (Main)            ║');
  console.log('║    2. SARL NourElHouda Distribution (BL Header)            ║');
  console.log('║  Period: Oct 2025 → Sep 2026                               ║');
  console.log('╠══════════════════════════════════════════════════════════════╣');
  console.log('║  Scenarios Included:                                       ║');
  console.log('║    ✅ Normal delivery flow (82%)                           ║');
  console.log('║    ✅ Supplier rejects BCH (3%)                            ║');
  console.log('║    ✅ Qty changed at weighbridge (2%)                      ║');
  console.log('║    ✅ Partial delivery (3%)                                ║');
  console.log('║    ✅ Full return with bon de retour (4%)                  ║');
  console.log('║    ✅ Pending at usine (3%)                                ║');
  console.log('║    ✅ Validated but not delivered (3%)                     ║');
  console.log('║    ✅ Supplier payments with bank fees                     ║');
  console.log('║    ✅ Etat de Vente monthly (admin validated)              ║');
  console.log('║    ✅ Recurring charges (loyer, electric, tel...)          ║');
  console.log('║    ✅ Payroll as validated charge                          ║');
  console.log('║    ✅ Attendance: sick/conge/late/mission                  ║');
  console.log('║    ✅ Bon de Retour with reasons                           ║');
  console.log('║    ✅ Audit trail / work log                               ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  console.log('📋 Collection Breakdown:');
  agg.forEach(c=>console.log(`   ${c._id}: ${c.count}`));
  console.log('\n✅ Done! Restart server & refresh browser.');

  await mongoose.disconnect();
  process.exit(0);
}

main().catch(e=>{console.error('❌',e);process.exit(1);});
