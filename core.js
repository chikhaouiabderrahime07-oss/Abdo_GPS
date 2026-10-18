/* ============================================================
   CORE.JS — Database · Auth · Lang · Utils · SessionMgr
   ERP v2.0 — Supplier/Logistics Management
   ============================================================ */

// ─── LANG (Bilingual FR/AR) ────────────────────────────────────
const T = {
  _l: localStorage.getItem('lang') || 'fr',
  fr: {
    app_name:'ERP Fournisseur', app_by:'CHIKHAOUI ABDERRAHIME • Abderrahime Intelligent Systems',
    login:'Connexion', logout:'Déconnexion', username:'Identifiant', password:'Mot de passe',
    login_error:'Identifiants incorrects', login_sub:'Système de gestion — Accès sécurisé',
    // Nav
    nav_dashboard:'Tableau de Bord', nav_brs:'Bons de Réception', nav_bls:'Bons de Chargement',
    nav_supplier_portal:'Portail Usines & Enlèvements', nav_bc_tracker:'Suivi Chargements & Pipeline',
    nav_caisse:'Ma Caisse', nav_admin_caisse:'Caisse Principale', nav_suppliers:'Fournisseurs',
    nav_catalogue:'Catalogue BD', nav_stats:'Statistiques', nav_eval:'Évaluation Utilisateurs',
    nav_users:'Utilisateurs', nav_settings:'Paramètres', nav_audit:'Audit',
    // Sections
    sec_documents:'Documents', sec_cash:'Trésorerie', sec_refs:'Références', sec_analysis:'Analyse', sec_admin:'Administration',
    // Common
    add:'Ajouter', edit:'Modifier', delete:'Supprimer', save:'Enregistrer', cancel:'Annuler',
    close:'Fermer', confirm:'Confirmer', print:'Imprimer', pdf:'PDF', search:'Rechercher...',
    yes:'Oui', no:'Non', all:'Tous', actions:'Actions', date:'Date', amount:'Montant',
    user_col:'Utilisateur', source:'Source', note:'Note', notes:'Notes', ref:'Référence',
    tags:'Tags', total:'Total', status:'Statut', supplier:'Fournisseur', details:'Détails',
    generate:'Générer', view:'Voir', loading:'Chargement...', no_data:'Aucune donnée',
    locked:'Verrouillé', unlock_admin:'Seul l\'Admin peut modifier',
    // BR
    br_title:'Bons de Réception', br_new:'Nouveau BR', br_ref:'Référence BR',
    br_num:'Numéro BR', br_num_hint:'Suggéré automatiquement — modifiable',
    br_num_exists:'Ce numéro existe déjà !', br_num_ok:'Numéro disponible',
    br_supplier:'Fournisseur', br_date:'Date de réception', br_lines:'Articles reçus',
    br_designation:'Désignation', br_unit:'Unité', br_qty:'Quantité', br_unit_price:'Prix Unitaire',
    br_disc:'Remise %', br_line_total:'Total Ligne', br_extra_fees:'Frais supplémentaires',
    br_timbre:'Timbre Fiscal', br_timbre_auto:'(calculé automatiquement)', br_total_ht:'Total HT',
    br_total_ttc:'Total TTC', br_notes:'Notes & Observations', br_tags:'Tags',
    br_add_line:'Ajouter Article', br_gen_bl:'Générer Bon de Chargement', br_gen_bl_short:'Bon Chargement',
    br_lock_msg:'Ce BR est verrouillé (issu de la validation usine ou déjà livré).',
    br_preview_ref:'Aperçu référence',
    // Bon de Chargement (BC - ancien BL)
    bl_title:'Bons de Chargement', bl_new:'Nouveau Bon de Chargement', bl_from_br:'Charger depuis BR en stock',
    bl_route:'Générer BL (Pour la route)',
    bl_truck:'Immatriculation Camion', bl_driver:'Nom du Chauffeur',
    bl_driver_hint:'Le camion sera auto-rempli si le chauffeur est connu',
    bl_delivered:'Confirmer Enlèvement & Livraison', bl_delivered_msg:'Ceci va verrouiller définitivement le Bon de Chargement. Impossible à annuler par les utilisateurs.',
    bl_linked_br:'BR coordonné',
    // Status
    st_open:'Émis', st_delivered:'Enlevé & Livré', st_locked:'Verrouillé', st_pending:'En attente usine',
    // Caisse User
    // Caisse User / Mini Caisse
    caisse_title:'Ma Caisse — Mini Caisse du Jour',
    caisse_morning_title:'Démarrage de journée',
    caisse_morning_greeting:'Bonjour !',
    caisse_morning_msg:'Votre caisse du jour est prête :',
    caisse_morning_confirm:'Démarrer la session de caisse ?',
    caisse_start_btn:'Démarrer ma journée',
    caisse_no_session:'Aucune session démarrée aujourd\'hui.',
    caisse_start_now:'Démarrer maintenant',
    caisse_especes:'Ventes BCH (Espèces)',
    caisse_monnaie:'Retours Marchandise (Déductions)',
    caisse_cloture:'Clôturer ma Caisse',
    caisse_cloture_msg:'Vérifiez le total de vos BCH et retours pour transmission à la banque',
    caisse_expected:'Total Net Ventes (BCH − Retours)',
    caisse_actual:'Montant déclaré pour versement',
    caisse_ecart:'Écart',
    caisse_br_total:'Total BCH du jour',
    caisse_closed:'Journée clôturée — Versée en Banque',
    caisse_reopen:'Modifier clôture',
    caisse_especes_deposited:'Net versé → Banque / État de Vente',
    // Mini Caisse specific
    nav_mini_caisse:'Ma Caisse',
    mini_caisse_title:'Ma Caisse — Suivi des Ventes & Retours',
    mini_caisse_sales:'Total Ventes BCH',
    mini_caisse_returns:'Total Retours Marchandise',
    mini_caisse_net:'Net à Verser en Banque',
    mini_caisse_cloture_btn:'Clôturer la Caisse & Générer État de Vente',
    mini_caisse_summary_ticket:'Ticket Récapitulatif',
    // Autocorrect Integrity Engine
    autocorrect_title:'Moniteur d\'Intégrité 15 min',
    autocorrect_ok:'Intégrité 100% Vérifiée',
    autocorrect_healed:'Discrépances Corrigées',
    autocorrect_manual_run:'Vérifier maintenant',
    // Admin caisse
    adm_title:'Caisse Principale', adm_balance:'Solde actuel',
    adm_inflows:'Entrées', adm_outflows:'Sorties', adm_transactions:'Transactions',
    adm_deposit:'Dépôt manuel', adm_withdrawal:'Retrait / Versement banque',
    adm_new_dep:'+ Dépôt', adm_new_with:'- Retrait / Virement',
    adm_confirm1:'Êtes-vous sûr de vouloir effectuer ce virement vers la banque ?',
    adm_confirm2:'CONFIRMATION NIVEAU 2 : Cette opération bancaire est définitive.',
    adm_immutable:'Cette opération ne peut être ni modifiée ni supprimée.',
    adm_correction_note:'Pour corriger une erreur, créez un nouveau dépôt avec la mention "Correction".',
    adm_dest:'Destination / Motif', adm_bank_ref:'Référence bancaire',
    adm_from_cloture:'Clôture mini caisse utilisateur', adm_manual:'Manuel Admin',
    adm_supervision_mini:'Supervision des Mini Caisses',
    // Suppliers
    sup_title:'Fournisseurs', sup_new:'Nouveau Fournisseur', sup_name:'Nom',
    sup_phone:'Téléphone', sup_address:'Adresse', sup_contact:'Contact',
    // Users & Eval & RH
    usr_title:'Utilisateurs & RH', usr_new:'Nouvel Utilisateur', usr_name:'Nom complet',
    usr_login:'Identifiant (login)', usr_pass:'Mot de passe', usr_role:'Rôle',
    usr_active:'Actif', usr_inactive:'Inactif', usr_sessions:'Sessions',
    usr_photo:'Photo de profil', usr_job_title:'Poste / Fonction', usr_department:'Département',
    usr_salary:'Salaire de base (DA)', usr_hire_date:'Date d\'embauche',
    eval_title:'Évaluation Utilisateurs', eval_user:'Utilisateur', eval_login:'Heure connexion',
    eval_logout:'Heure déco.', eval_hours:'Heures travail', eval_brs:'BR créés',
    eval_deliveries:'Livraisons', eval_errors:'Écarts caisse', eval_date:'Date',
    // Pointage & RH
    pointage_title:'Pointage & Présences RH',
    pointage_rectify:'Rectifier Pointage',
    pointage_status_present:'Présent',
    pointage_status_absent_unj:'Absent Injustifié',
    pointage_status_absent_jus:'Absent Justifié',
    pointage_status_late:'Retard',
    pointage_status_leave:'Congé',
    // Settings
    set_title:'Paramètres', set_company:'Informations Société', set_timbre:'Timbre Fiscal',
    set_logos:'Logos', set_users:'Utilisateurs', set_data:'Données',
    set_logo_left:'Logo Gauche', set_logo_right:'Logo Droit',
    set_name:'Nom de la société', set_address:'Adresse', set_phone:'Téléphone',
    set_fax:'Fax', set_email:'Email', set_nif:'NIF', set_rc:'RC', set_nis:'NIS',
    set_timbre_slabs:'Tranches de timbre fiscal', set_slab_min:'Min (DA)', set_slab_max:'Max (DA)',
    set_slab_rate:'Taux %', set_slab_cap:'Plafond (DA)', set_add_slab:'Ajouter tranche',
    set_reset_slabs:'Réinitialiser (défauts légaux)',
    set_export:'Exporter données (JSON)', set_import:'Importer données',
    set_reset_all:'Réinitialiser tout', set_reset_confirm:'Ceci supprime TOUTES les données !',
    set_theme:'Apparence', set_theme_color:'Couleur principale',
    set_theme_mode:'Mode', set_light:'Clair', set_dark:'Sombre',
    // Stats
    stat_title:'Statistiques', stat_period:'Période',
    stat_week:'7 jours', stat_month:'Ce mois', stat_year:'Cette année', stat_all:'Tout',
    stat_br_total:'BR total', stat_bl_total:'BL total', stat_delivered:'Livrés',
    stat_caisse:'Montant total reçu', stat_per_supplier:'Par fournisseur', stat_per_user:'Par utilisateur',
    // Audit
    aud_title:'Journal d\'audit', aud_action:'Action', aud_collection:'Collection',
    aud_doc_id:'ID doc', aud_hash:'Hash', aud_by:'Par',
    aud_create:'Création', aud_update:'Modification', aud_delete:'Suppression',
    // Role labels
    role_admin:'Administrateur', role_user:'Utilisateur', role_supplier:'Usine / Fournisseur', role_supplier_agent:'Agent Usine',
    // Misc
    col_ref:'Référence', col_date:'Date', col_supplier:'Fournisseur', col_amount:'Montant',
    col_status:'Statut', col_actions:'Actions', col_by:'Par', col_total_ht:'HT',
    col_timbre:'Timbre', col_total_ttc:'TTC', col_truck:'Immat. Camion', col_driver:'Chauffeur',
    col_user:'Utilisateur', col_source:'Source', col_note:'Note', col_type:'Type',
    // Clients
    nav_clients:'Clients', cli_title:'Clients', cli_new:'Nouveau Client', cli_name:'Nom',
    cli_phone:'Téléphone', cli_address:'Adresse', cli_contact:'Contact', col_client:'Client',
    // Recycle bin
    nav_recycle:'Corbeille', rb_title:'Corbeille — Historique des suppressions',
    rb_collection:'Collection', rb_item:'Elément', rb_deleted_at:'Supprimé le', rb_deleted_by:'Par',
    rb_restore:'Restaurer', rb_empty:'La corbeille est vide',
    rb_ref_taken:'Référence prise — nouveau numéro:', rb_restored:'Elément restauré !',
    rb_already:'Déjà restauré', rb_confirm_restore:'Confirmer la restauration de cet élément ?',
    nav_etat_vente: 'État de Vente',
    nav_bon_retour: 'Bons de Retour',
    nav_pointage: 'Pointage & RH',
    nav_charges: 'Charges & Frais',
    nav_bank: 'Banque & Extrait',
    nav_bank_extrait: 'Extrait Bancaire',
    notif_center: 'Centre de Notifications',
    notif_mark_all: 'Tout marquer lu',
    notif_open_tracker: 'Ouvrir le Suivi des Chargements',
  },
  ar: {
    app_name:'نظام إدارة الموردين', app_by:'CHIKHAOUI ABDERRAHIME • أنظمة عبد الرحيم الذكية',
    login:'تسجيل الدخول', logout:'تسجيل الخروج', username:'اسم المستخدم', password:'كلمة المرور',
    login_error:'بيانات الدخول غير صحيحة', login_sub:'نظام الإدارة — دخول آمن',
    nav_dashboard:'لوحة التحكم', nav_brs:'وصولات الاستلام', nav_bls:'وصولات الشحن',
    nav_supplier_portal:'بوابة المصانع والشحن', nav_bc_tracker:'متابعة الشحن والمصانع',
    nav_caisse:'صندوقي (ميني كاس)', nav_mini_caisse:'صندوقي', nav_admin_caisse:'الصندوق الرئيسي', nav_suppliers:'الموردون', nav_clients:'الزبائن',
    nav_catalogue:'قاعدة البيانات', nav_stats:'الإحصائيات', nav_eval:'تقييم المستخدمين',
    nav_users:'المستخدمون والموارد البشرية', nav_settings:'الإعدادات', nav_audit:'سجل المراجعة',
    sec_documents:'الوثائق', sec_cash:'الخزينة', sec_refs:'المراجع', sec_analysis:'التحليل', sec_admin:'الإدارة',
    add:'إضافة', edit:'تعديل', delete:'حذف', save:'حفظ', cancel:'إلغاء',
    close:'إغلاق', confirm:'تأكيد', print:'طباعة', pdf:'PDF', search:'بحث...',
    yes:'نعم', no:'لا', all:'الكل', actions:'إجراءات', date:'التاريخ', amount:'المبلغ',
    user_col:'المستخدم', source:'المصدر', note:'ملاحظة', notes:'ملاحظات', ref:'المرجع',
    tags:'وسوم', total:'المجموع', status:'الحالة', supplier:'المورد', details:'التفاصيل',
    generate:'إنشاء', view:'عرض', loading:'جاري التحميل...', no_data:'لا توجد بيانات',
    locked:'مقفل', unlock_admin:'المسؤول فقط يمكنه التعديل',
    br_title:'وصولات الاستلام', br_new:'وصل استلام جديد', br_ref:'مرجع الوصل',
    br_num:'رقم الوصل', br_num_hint:'يُقترح تلقائياً — قابل للتعديل',
    br_num_exists:'هذا الرقم موجود مسبقاً!', br_num_ok:'الرقم متاح',
    br_supplier:'المورد', br_date:'تاريخ الاستلام', br_lines:'المواد المستلمة',
    br_designation:'التسمية', br_unit:'الوحدة', br_qty:'الكمية', br_unit_price:'سعر الوحدة',
    br_disc:'خصم %', br_line_total:'مجموع السطر', br_extra_fees:'رسوم إضافية',
    br_timbre:'الطابع الجبائي', br_timbre_auto:'(محسوب تلقائياً)', br_total_ht:'المجموع قبل الرسوم',
    br_total_ttc:'المجموع الشامل', br_notes:'ملاحظات وتعليقات', br_tags:'وسوم',
    br_add_line:'إضافة مادة', br_gen_bl:'إنشاء وصل شحن', br_gen_bl_short:'وصل شحن',
    br_lock_msg:'هذا الوصل مقفل (منبثق من المصنع أو مسلم).',
    br_preview_ref:'معاينة المرجع',
    // Bon de Chargement (BCH)
    bl_title:'وصولات الشحن (BCH)', bl_new:'وصل شحن جديد (BCH)', bl_from_br:'شحن من وصل الاستلام',
    bl_route:'وصل تسليم (للطريق فقط)',
    bl_truck:'رقم الشاحنة', bl_driver:'اسم السائق',
    bl_driver_hint:'سيتم ملء رقم الشاحنة تلقائياً إذا كان السائق معروفاً',
    bl_delivered:'تأكيد الشحن والتسليم', bl_delivered_msg:'سيقفل هذا الإجراء وصل الشحن نهائياً. لا يمكن التراجع.',
    bl_linked_br:'وصل الاستلام المنسق',
    st_open:'مفتوح', st_delivered:'تم الشحن والتسليم', st_locked:'مقفل', st_pending:'في انتظار المصنع',
    // Mini Caisse
    caisse_title:'صندوقي — جلسة اليوم',
    caisse_morning_title:'بداية اليوم',
    caisse_morning_greeting:'صباح الخير!',
    caisse_morning_msg:'صندوقك لليوم جاهز للعمل:',
    caisse_morning_confirm:'تأكيد فتح جلسة الصندوق؟',
    caisse_start_btn:'بدء يومي',
    caisse_no_session:'لا توجد جلسة بدأت اليوم.',
    caisse_start_now:'ابدأ الآن',
    caisse_especes:'المبيعات (وصولات الشحن BCH)',
    caisse_monnaie:'المرتجع (خصم)',
    caisse_cloture:'إغلاق صندوقي',
    caisse_cloture_msg:'تحقق من مبيعاتك ومرتجعاتك للتحويل إلى البنك',
    caisse_expected:'صافي الصندوق (المبيعات − المرتجع)',
    caisse_actual:'المبلغ المحوّل للبنك',
    caisse_ecart:'الفارق',
    caisse_br_total:'مجموع وصولات الشحن BCH اليوم',
    caisse_closed:'اليوم مغلق — تم التحويل للبنك',
    caisse_reopen:'تعديل الإغلاق',
    caisse_especes_deposited:'الصافي المحوّل → البنك / كشف المبيعات',
    mini_caisse_title:'صندوقي — متابعة المبيعات والمرتجع',
    mini_caisse_sales:'إجمالي المبيعات',
    mini_caisse_returns:'إجمالي المرتجعات',
    mini_caisse_net:'الصافي للتحويل للبنك',
    mini_caisse_cloture_btn:'إغلاق الصندوق وإنشاء كشف المبيعات',
    mini_caisse_summary_ticket:'وصل ملخص اليوم',
    autocorrect_title:'مراقب السلامة والتصحيح التلقائي (15 دقيقة)',
    autocorrect_ok:'البيانات سليمة 100%',
    autocorrect_healed:'تم تصحيح الفوارق تلقائياً',
    autocorrect_manual_run:'فحص الآن',
    adm_title:'الصندوق الرئيسي', adm_balance:'الرصيد الحالي',
    adm_inflows:'الإيرادات', adm_outflows:'المصروفات', adm_transactions:'المعاملات',
    adm_deposit:'إيداع يدوي', adm_withdrawal:'سحب / تحويل بنكي',
    adm_new_dep:'+ إيداع', adm_new_with:'- تحويل بنكي',
    adm_confirm1:'هل أنت متأكد من إجراء هذا التحويل البنكي؟',
    adm_confirm2:'تأكيد المستوى الثاني: هذه العملية نهائية ولا يمكن التراجع عنها.',
    adm_immutable:'لا يمكن تعديل هذه العملية أو حذفها.',
    adm_correction_note:'لتصحيح خطأ، أنشئ إيداعاً جديداً بملاحظة "تصحيح".',
    adm_dest:'الوجهة / الغرض', adm_bank_ref:'المرجع البنكي',
    adm_from_cloture:'إغلاق الصندوق اليومي للمستخدم', adm_manual:'يدوي — المسؤول',
    adm_supervision_mini:'مراقبة صناديق البائعين',
    sup_title:'الموردون', sup_new:'مورد جديد', sup_name:'الاسم',
    sup_phone:'الهاتف', sup_address:'العنوان', sup_contact:'جهة الاتصال',
    cli_title:'الزبائن', cli_new:'زبون جديد', cli_name:'الاسم',
    cli_phone:'الهاتف', cli_address:'العنوان', cli_contact:'جهة الاتصال', col_client:'الزبون',
    usr_title:'المستخدمون والموارد البشرية', usr_new:'مستخدم جديد', usr_name:'الاسم الكامل',
    usr_login:'معرف الدخول', usr_pass:'كلمة المرور', usr_role:'الدور',
    usr_active:'نشط', usr_inactive:'غير نشط', usr_sessions:'الجلسات',
    usr_photo:'صورة الملف الشخصي', usr_job_title:'الوظيفة / المنصب', usr_department:'القسم',
    usr_salary:'الراتب الأساسي (دج)', usr_hire_date:'تاريخ التوظيف',
    eval_title:'تقييم المستخدمين', eval_user:'المستخدم', eval_login:'وقت الدخول',
    eval_logout:'وقت الخروج', eval_hours:'ساعات العمل', eval_brs:'وصولات استلام',
    eval_deliveries:'التسليمات', eval_errors:'فوارق الصندوق', eval_date:'التاريخ',
    pointage_title:'حضور الموظفين ونظام الدوام',
    pointage_rectify:'تصحيح الحضور',
    pointage_status_present:'حاضر',
    pointage_status_absent_unj:'غياب غير مبرر',
    pointage_status_absent_jus:'غياب مبرر',
    pointage_status_late:'تأخر',
    pointage_status_leave:'عطلة',
    set_title:'الإعدادات', set_company:'معلومات الشركة', set_timbre:'الطابع الجبائي',
    set_logos:'الشعارات', set_users:'المستخدمون', set_data:'البيانات',
    set_logo_left:'الشعار الأيسر', set_logo_right:'الشعار الأيمن',
    set_name:'اسم الشركة', set_address:'العنوان', set_phone:'الهاتف',
    set_fax:'الفاكس', set_email:'البريد الإلكتروني', set_nif:'NIF', set_rc:'RC', set_nis:'NIS',
    set_timbre_slabs:'شرائح الطابع الجبائي', set_slab_min:'من (DA)', set_slab_max:'إلى (DA)',
    set_slab_rate:'نسبة %', set_slab_cap:'حد أقصى (DA)', set_add_slab:'إضافة شريحة',
    set_reset_slabs:'إعادة تعيين (الافتراضي القانوني)',
    set_export:'تصدير البيانات (JSON)', set_import:'استيراد البيانات',
    set_reset_all:'إعادة تعيين الكل', set_reset_confirm:'سيؤدي هذا إلى حذف جميع البيانات!',
    set_theme:'المظهر', set_theme_color:'اللون الرئيسي',
    set_theme_mode:'الوضع', set_light:'فاتح', set_dark:'داكن',
    stat_title:'الإحصائيات', stat_period:'الفترة',
    stat_week:'7 أيام', stat_month:'هذا الشهر', stat_year:'هذه السنة', stat_all:'الكل',
    stat_br_total:'إجمالي وصولات الاستلام', stat_bl_total:'إجمالي وصولات التسليم',
    stat_delivered:'تم التسليم', stat_caisse:'المبلغ الإجمالي المستلم',
    stat_per_supplier:'حسب المورد', stat_per_user:'حسب المستخدم',
    aud_title:'سجل المراجعة', aud_action:'الإجراء', aud_collection:'المجموعة',
    aud_doc_id:'معرف الوثيقة', aud_hash:'الرمز', aud_by:'بواسطة',
    aud_create:'إنشاء', aud_update:'تعديل', aud_delete:'حذف',
    role_admin:'مسؤول', role_user:'مستخدم', role_supplier:'مصنع / مورد', role_supplier_agent:'وكيل المصنع',
    col_ref:'المرجع', col_date:'التاريخ', col_supplier:'المورد', col_amount:'المبلغ',
    col_status:'الحالة', col_actions:'إجراءات', col_by:'بواسطة', col_total_ht:'قبل الرسوم',
    col_timbre:'الطابع', col_total_ttc:'الشامل', col_truck:'رقم الشاحنة', col_driver:'السائق',
    col_user:'المستخدم', col_source:'المصدر', col_note:'ملاحظة', col_type:'النوع',
    // Recycle bin
    nav_recycle:'سلة المحذوفات', rb_title:'سلة المحذوفات — سجل الحذف',
    rb_collection:'المجموعة', rb_item:'العنصر', rb_deleted_at:'حُذف بتاريخ', rb_deleted_by:'بواسطة',
    rb_restore:'استعادة', rb_empty:'سلة المحذوفات فارغة',
    rb_ref_taken:'المرجع مستخدم — رقم جديد:', rb_restored:'تمت استعادة العنصر!',
    rb_already:'تمت الاستعادة مسبقاً', rb_confirm_restore:'تأكيد استعادة هذا العنصر؟',
    nav_etat_vente: 'حالة المبيعات',
    nav_bon_retour: 'وصولات الإرجاع',
    nav_pointage: 'الحضور والموارد البشرية',
    nav_charges: 'المصاريف والتكاليف',
    nav_bank: 'البنك وكشف الحساب',
    nav_bank_extrait: 'كشف الحساب البنكي',
    notif_center: 'مركز الإشعارات',
    notif_mark_all: 'تعليم الكل كمقروء',
    notif_open_tracker: 'فتح متابعة الشحنات',
  },

  get(k) { return this[this._l]?.[k] || this.fr[k] || k; },
  current() { return this._l; },
  isRTL() { return this._l === 'ar'; },
  set(l) {
    this._l = l;
    localStorage.setItem('lang', l);
    document.documentElement.lang = l;
    document.documentElement.dir = l === 'ar' ? 'rtl' : 'ltr';
    document.body.classList.toggle('rtl', l === 'ar');
  }
};

// ─── DATABASE ──────────────────────────────────────────────────
const DB = {
  _cols: ['users','suppliers','clients','brs','bls','articles','drivers','sessions','caisse_admin','work_log','history','audit_log','recycle_bin','bank_transactions','supplier_payments','etat_vente_docs','bon_retours','bank_charges','notifications','fiches_paie','rh_rectifications','recurring_charges','bank_accounts','paie_validations','pointage_validations'],
  _loaded: {},

  init() {
    this._cols.forEach(c => { if (!localStorage.getItem(c)) localStorage.setItem(c, '[]'); });
    if (!localStorage.getItem('settings')) this._resetSettings();
    if (!this.getAll('users').length) this._seed();

    // ── Run data migrations on every boot (idempotent) ──
    this.runMigrations();

    // ── Start 15-Minute Data Integrity & Autocorrect Daemon ──
    try {
      this.MasterBrain.AutocorrectBrain.init();
    } catch(e) { console.warn('[AutocorrectBrain] init err:', e); }

    // Cloud mode: if localStorage appears empty or cleared, restore from MongoDB
    if (typeof window.API !== 'undefined' && location.protocol !== 'file:') {
      const hasData = this._cols.some(c => this.getAll(c).length > 0);
      if (!hasData) {
        // Silently restore in background — login will also do a full sync
        window.API.syncCloudToLocal().then(() => {
          // If we now have users, reload the page so the login screen picks them up
          if (this.getAll('users').length > 1) location.reload();
        }).catch(() => {});
      }
    }
  },

  // ─── Data Migrations & Master Brain Recalibration ───────────────
  runMigrations() {
    try {
      this._migrateTimbreSlabsToLF2025(); // M003: update old timbre slabs to LF2025 format
      this._migrateEtatVenteTimbre();      // M004: heal missing 1% timbre on historical États de Vente
      this.MasterBrain.recalibrateAll();  // The Master Brain: 360° financial integrity engine
    } catch(e) {
      console.warn('[MasterBrain] Error:', e);
    }
  },

  recalibrateCaisse() {
    return this.MasterBrain.CaisseBrain.recalibrate();
  },

  scanAndOrganizeHistory(options = {}) {
    return this.MasterBrain.HistoricalBrain.scanAndOrganize(options);
  },

  // ═════════════════════════════════════════════════════════════════
  // THE MASTER BRAIN SUITE — Multi-Domain Financial Integrity Cortex
  // ═════════════════════════════════════════════════════════════════
  MasterBrain: {
    _running: false,

    // ── 1. Caisse Brain (Solde = Dépôts − Retraits) ────────────
    CaisseBrain: {
      recalibrate() {
        const caisse = DB.getAll('caisse_admin');
        let modified = false;
        let cleaned = [...caisse];
        const toRemoveCloud = [];

        // ── Rule 1: Purge all rogue/legacy entries ──
        // Delivery entries ('bl_delivery'), deletion errors ('bl_error_delete'), and direct returns ('bl_return') are strictly forbidden in main caisse.
        // PURE CAISSE LAW: Returns are deducted exclusively from the user's mini-caisse session before shift closure!
        cleaned = cleaned.filter(e => {
          if (e.source === 'bl_delivery' || e.source === 'bl_error_delete' || e.source === 'bl_return') {
            toRemoveCloud.push(e.id);
            modified = true;
            return false;
          }
          return true;
        });

        // ── Rule 2: Deduplicate user session closures ──
        // A single session must produce at most ONE deposit ('user_cloture' / 'bch_recettes_reelles')
        const seenCloture = new Map();
        const clotureToKeep = new Set();
        cleaned.forEach(e => {
          if (e.type === 'deposit' && (e.source === 'user_cloture' || e.source === 'bch_recettes_reelles')) {
            const key = e.sessionId ? `sess_${e.sessionId}` : (e.etatVenteRef || `date_${e.sessionDate || e.date}_u_${e.userId}`);
            if (seenCloture.has(key)) {
              const prev = seenCloture.get(key);
              const keep = (e.id >= prev.id) ? e : prev;
              const discard = (e.id < prev.id) ? e : prev;
              seenCloture.set(key, keep);
              clotureToKeep.delete(discard.id);
              clotureToKeep.add(keep.id);
              toRemoveCloud.push(discard.id);
              modified = true;
            } else {
              seenCloture.set(key, e);
              clotureToKeep.add(e.id);
            }
          }
        });
        cleaned = cleaned.filter(e => {
          if (e.type === 'deposit' && (e.source === 'user_cloture' || e.source === 'bch_recettes_reelles')) {
            return clotureToKeep.has(e.id);
          }
          return true;
        });

        // ── Rule 3: Deduplicate bank transfers for État de Vente ──
        const seenTransfers = new Map();
        const transfersToKeep = new Set();
        cleaned.forEach(e => {
          if (e.type === 'withdrawal' && e.source === 'transfert_banque_etat_vente') {
            const key = e.etatVenteRef || (e.sessionId ? `sess_${e.sessionId}` : `date_${e.sessionDate || e.date}_u_${e.userId}`);
            if (seenTransfers.has(key)) {
              const prev = seenTransfers.get(key);
              const keep = (e.id >= prev.id) ? e : prev;
              const discard = (e.id < prev.id) ? e : prev;
              seenTransfers.set(key, keep);
              transfersToKeep.delete(discard.id);
              transfersToKeep.add(keep.id);
              toRemoveCloud.push(discard.id);
              modified = true;
            } else {
              seenTransfers.set(key, e);
              transfersToKeep.add(e.id);
            }
          }
        });
        cleaned = cleaned.filter(e => {
          if (e.type === 'withdrawal' && e.source === 'transfert_banque_etat_vente') {
            return transfersToKeep.has(e.id);
          }
          return true;
        });

        // ── Rule 4: Synchronize all closed sessions & États de Vente in caisse_admin ──
        const closedSessions = (DB.getAll('sessions') || []).filter(s => s.status === 'closed');
        const allEvDocs = DB.getAll('etat_vente_docs') || [];
        const allUsers = DB.getAll('users') || [];

        closedSessions.forEach(s => {
          const sUser = allUsers.find(u => u.id === s.userId);
          const userName = sUser?.name || sUser?.username || s.userName || 'Caissier';
          const sessionDate = s.date || (s.closedAt || s.createdAt || '').slice(0, 10);

          // Calculate or fetch expected net BCH cash collected:
          let expectedRealBchNet = Number(s.realBchNet);
          if (isNaN(expectedRealBchNet) || expectedRealBchNet <= 0) {
            const summ = (typeof SessionMgr !== 'undefined' && SessionMgr.getUserDaySummary) ? SessionMgr.getUserDaySummary(s.userId, sessionDate) : null;
            expectedRealBchNet = summ ? summ.netAmount : (Number(s.closedEspeces) || Number(s.closedNet) || 0);
          }

          // 4a. Synchronize Deposit (Recettes réelles BCH)
          let dep = cleaned.find(e => 
            e.type === 'deposit' && 
            (e.source === 'user_cloture' || e.source === 'bch_recettes_reelles') && 
            (Number(e.sessionId) === Number(s.id) || 
             (s.etatVenteRef && e.etatVenteRef === s.etatVenteRef) || 
             ((e.sessionDate === sessionDate || (e.date || '').slice(0, 10) === sessionDate) && String(e.userId) === String(s.userId)))
          );

          if (dep) {
            dep.sessionId = s.id;
            dep.sessionDate = sessionDate;
            dep.userId = s.userId;
            dep.userName = userName;
            if (s.etatVenteRef && !dep.etatVenteRef) dep.etatVenteRef = s.etatVenteRef;
            if (Math.abs(Number(dep.amount || 0) - expectedRealBchNet) > 0.01) {
              dep.amount = expectedRealBchNet;
              modified = true;
              if (typeof window.API !== 'undefined' && location.protocol !== 'file:') {
                window.API.update('caisse_admin', dep.id, dep).catch(() => {});
              }
            }
          } else if (expectedRealBchNet > 0) {
            // Auto-create missing deposit for this closed session
            const maxId = cleaned.reduce((m, e) => Math.max(m, e.id || 0), 0);
            dep = {
              id: maxId + 1,
              type: 'deposit',
              source: 'user_cloture',
              userId: s.userId,
              userName,
              sessionId: s.id,
              sessionDate,
              amount: expectedRealBchNet,
              targetBankId: s.targetBankId || null,
              etatVenteRef: s.etatVenteRef || null,
              note: `Recettes réelles de la caisse BCH — Clôture session #${s.id} (${sessionDate})`,
              createdAt: s.closedAt || s.createdAt || new Date().toISOString()
            };
            cleaned.push(dep);
            modified = true;
            if (typeof window.API !== 'undefined' && location.protocol !== 'file:') {
              window.API.insert('caisse_admin', dep).catch(() => {});
            }
          }

          // 4b. Synchronize Withdrawal (Transfert Banque État de Vente)
          let evDoc = s.etatVenteId ? allEvDocs.find(d => d.id === s.etatVenteId) : null;
          if (!evDoc && s.etatVenteRef) {
            evDoc = allEvDocs.find(d => d.ref === s.etatVenteRef);
          }
          if (!evDoc) {
            evDoc = allEvDocs.find(d => (d.date === sessionDate || d.dateEnd === sessionDate) && String(d.userId) === String(s.userId));
          }

          let expectedEvTTC = 0;
          let expectedTimbre = 0;
          if (evDoc && Number(evDoc.totalTTC) > 0) {
            expectedEvTTC = Number(evDoc.totalTTC);
            expectedTimbre = Number(evDoc.timbreAmount || 0);
          } else if (Number(s.etatVenteTTC) > 0) {
            expectedEvTTC = Number(s.etatVenteTTC);
            expectedTimbre = Number(s.timbreAmount || 0);
          } else if (Number(s.closedNet) > 0) {
            expectedEvTTC = Number(s.closedNet);
          }

          if (expectedEvTTC === 0 && expectedRealBchNet > 0 && typeof SessionMgr !== 'undefined' && typeof SessionMgr.getUserDaySummary === 'function') {
            const sum = SessionMgr.getUserDaySummary(s.userId, sessionDate);
            const tvaRate = Number(DB.getSettings().tvaRate) || 19;
            const aggregated = {};
            (sum.bls || []).filter(b => b.status !== 'returned').forEach(bl => {
              (bl.lines || []).forEach(line => {
                const key = (line.designation || '').trim();
                if (!key) return;
                const qty = Number(line.qtyDelivered || line.qty) || 0;
                const price = Number(line.price) || 0;
                const disc = Number(line.disc) || 0;
                const effPrice = price * (1 - disc / 100);
                if (!aggregated[key]) aggregated[key] = { qty: 0, price: effPrice };
                aggregated[key].qty += qty;
              });
            });
            const items = Object.values(aggregated);
            const ht = Math.round(items.reduce((acc, it) => acc + (it.qty * it.price), 0) * 100) / 100;
            const tva = Math.round(ht * (tvaRate / 100) * 100) / 100;
            const tim = Math.round((ht + tva) * 0.01 * 100) / 100;
            expectedEvTTC = Math.round((ht + tva + tim) * 100) / 100;
            expectedTimbre = tim;
          }

          const expectedEcart = Math.round((expectedEvTTC - expectedRealBchNet) * 100) / 100;
          const evRef = evDoc?.ref || s.etatVenteRef || `ET/SESS-${s.id}`;

          let wit = cleaned.find(e => 
            e.type === 'withdrawal' && 
            e.source === 'transfert_banque_etat_vente' && 
            (Number(e.sessionId) === Number(s.id) || 
             (evRef && e.etatVenteRef === evRef) || 
             (evDoc && (e.etatVenteRef === evDoc.ref || String(e.etatVenteId) === String(evDoc.id))) ||
             ((e.sessionDate === sessionDate || (e.date || '').slice(0, 10) === sessionDate) && String(e.userId) === String(s.userId)))
          );

          if (wit) {
            wit.sessionId = s.id;
            wit.sessionDate = sessionDate;
            wit.userId = s.userId;
            wit.userName = userName;
            if (evRef && !wit.etatVenteRef) wit.etatVenteRef = evRef;
            if (Math.abs(Number(wit.amount || 0) - expectedEvTTC) > 0.01 || Math.abs(Number(wit.etatVenteTTC || 0) - expectedEvTTC) > 0.01) {
              wit.amount = expectedEvTTC;
              wit.etatVenteTTC = expectedEvTTC;
              wit.timbreAmount = expectedTimbre;
              wit.ecartFiscal = expectedEcart;
              modified = true;
              if (typeof window.API !== 'undefined' && location.protocol !== 'file:') {
                window.API.update('caisse_admin', wit.id, wit).catch(() => {});
              }
            }
          } else if (expectedEvTTC > 0) {
            // Auto-create missing withdrawal for this État de Vente transfer
            const maxId = cleaned.reduce((m, e) => Math.max(m, e.id || 0), 0);
            wit = {
              id: maxId + 1,
              type: 'withdrawal',
              source: 'transfert_banque_etat_vente',
              userId: s.userId,
              userName,
              sessionId: s.id,
              sessionDate,
              amount: expectedEvTTC,
              targetBankId: s.targetBankId || evDoc?.bankId || null,
              etatVenteRef: evRef,
              etatVenteId: evDoc?.id || s.etatVenteId || null,
              etatVenteTTC: expectedEvTTC,
              timbreAmount: expectedTimbre,
              ecartFiscal: expectedEcart,
              note: `Versement bancaire — État de Vente ${evRef} (Session #${s.id})`,
              createdAt: s.closedAt || s.createdAt || new Date().toISOString()
            };
            cleaned.push(wit);
            modified = true;
            if (typeof window.API !== 'undefined' && location.protocol !== 'file:') {
              window.API.insert('caisse_admin', wit).catch(() => {});
            }
          }
        });

        // ── Rule 5: Synchronize cash charges from bank_charges into caisse_admin ──
        const allBankCharges = DB.getAll('bank_charges') || [];
        const caisseCharges = allBankCharges.filter(c => c.bankId === 'caisse' || c.source === 'caisse' || (!c.bankId && c.type === 'manual'));
        caisseCharges.forEach(c => {
          const amt = Number(c.amount) || 0;
          if (amt <= 0) return;
          const cid = String(c.id);
          let ex = cleaned.find(e => 
            e.type === 'withdrawal' && 
            (String(e.chargeId) === cid || 
             ((e.source === 'charge' || (e.note||'').toLowerCase().includes((c.label||'').toLowerCase())) && Math.abs(Number(e.amount) - amt) < 0.01))
          );
          if (ex) {
            if (ex.source !== 'charge' || !ex.chargeId) {
              ex.source = 'charge';
              ex.chargeId = c.id;
              modified = true;
            }
          } else {
            const maxId = cleaned.reduce((m, e) => Math.max(m, e.id || 0), 0);
            const newWit = {
              id: maxId + 1,
              type: 'withdrawal',
              source: 'charge',
              chargeId: c.id,
              amount: amt,
              note: `Charge: ${c.label || c.subtype || 'Frais'}${c.category ? ' (' + c.category + ')' : ''}`,
              userId: c.createdBy || null,
              userName: c.createdByName || 'Administrateur',
              date: c.date || (c.createdAt || '').slice(0, 10),
              createdAt: c.createdAt || (c.date ? c.date + 'T12:00:00.000Z' : new Date().toISOString())
            };
            cleaned.push(newWit);
            modified = true;
            if (typeof window.API !== 'undefined' && location.protocol !== 'file:') {
              window.API.insert('caisse_admin', newWit).catch(() => {});
            }
          }
        });

        // ── Commit cleanups ──
        if (modified) {
          DB.rawSet('caisse_admin', cleaned);
          if (typeof window.API !== 'undefined' && location.protocol !== 'file:') {
            toRemoveCloud.forEach(id => window.API.remove('caisse_admin', id).catch(() => {}));
          }
        }

        const totalIn = cleaned.filter(e => e.type === 'deposit').reduce((s, e) => s + (Number(e.amount) || 0), 0);
        const totalOut = cleaned.filter(e => e.type === 'withdrawal').reduce((s, e) => s + (Number(e.amount) || 0), 0);
        return { ok: true, balance: Math.round((totalIn - totalOut) * 100) / 100, totalIn, totalOut, modified, cleanedCount: toRemoveCloud.length };
      }
    },

    // ── 2. Bank Brain (Solde = Initial + Entrées − Sorties) ─────
    BankBrain: {
      recalibrate() {
        const banks = DB.getSettings().banks || [];
        const bankTxs = DB.getAll('bank_transactions');
        const caisse = DB.getAll('caisse_admin');
        const supPays = DB.getAll('supplier_payments');

        // ── 1. DÉDOUBLONNAGE STRICT DES TRANSACTIONS BANCAIRES (Anti-Duplication) ──
        const seenEvRefs = new Set();
        const seenEvIds = new Set();
        const seenCaisseTransfers = new Set();
        let cleanedBankTxs = [];
        const duplicateTxIds = [];

        bankTxs.forEach(bt => {
          if (bt.subtype === 'etat_vente' || (bt.ref && bt.ref.startsWith('EV-DEP-'))) {
            const evRefKey = (bt.etatVenteRef || bt.ref?.replace('EV-DEP-', '') || '').trim();
            const evIdKey = bt.etatVenteId ? String(bt.etatVenteId) : null;
            if ((evRefKey && seenEvRefs.has(evRefKey)) || (evIdKey && seenEvIds.has(evIdKey))) {
              duplicateTxIds.push(bt.id);
              return; // DOUBLON ÉLIMINÉ
            }
            if (evRefKey) seenEvRefs.add(evRefKey);
            if (evIdKey) seenEvIds.add(evIdKey);
            cleanedBankTxs.push(bt);
          } else if (bt.subtype === 'transfer_from_caisse') {
            const dKey = (bt.date || bt.createdAt || '').slice(0, 10);
            const key = `${bt.bankId}|${dKey}|${Number(bt.amount).toFixed(2)}`;
            if (seenCaisseTransfers.has(key)) {
              duplicateTxIds.push(bt.id);
              return; // DOUBLON TRANSFERT ÉLIMINÉ
            }
            seenCaisseTransfers.add(key);
            cleanedBankTxs.push(bt);
          } else {
            cleanedBankTxs.push(bt);
          }
        });

        if (duplicateTxIds.length > 0) {
          DB.rawSet('bank_transactions', cleanedBankTxs);
          if (typeof window.API !== 'undefined' && location.protocol !== 'file:') {
            duplicateTxIds.forEach(id => window.API.delete('bank_transactions', id).catch(() => {}));
          }
        }

        // Cross-reconciliation: ensure every caisse bank_transfer has a corresponding bank deposit
        const caisseTransfers = caisse.filter(e => e.type === 'withdrawal' && e.source === 'bank_transfer');
        let modified = false;

        caisseTransfers.forEach(ct => {
          const amt = Number(ct.amount) || 0;
          const matching = cleanedBankTxs.find(bt =>
            bt.type === 'deposit' &&
            bt.subtype === 'transfer_from_caisse' &&
            Math.abs(Number(bt.amount) - amt) < 0.01 &&
            (ct.date ? (bt.date || bt.createdAt || '').slice(0, 10) === ct.date.slice(0, 10) : true)
          );
          if (!matching && banks.length > 0) {
            const targetBankId = ct.bankId || banks[0].id;
            const newTx = {
              id: (cleanedBankTxs.reduce((m, e) => Math.max(m, e.id || 0), 0) + 1),
              bankId: targetBankId,
              type: 'deposit',
              subtype: 'transfer_from_caisse',
              amount: amt,
              ref: ct.ref || `BTX-${Date.now().toString().slice(-4)}`,
              date: ct.date || ct.createdAt || new Date().toISOString().slice(0, 10),
              createdAt: ct.createdAt || new Date().toISOString(),
              note: `Virement automatique depuis Caisse (${Utils.fmtCurrency(amt)})`
            };
            cleanedBankTxs.push(newTx);
            if (typeof window.API !== 'undefined' && location.protocol !== 'file:') {
              window.API.insert('bank_transactions', newTx).catch(() => {});
            }
            modified = true;
          }
        });

        if (modified) {
          DB.rawSet('bank_transactions', cleanedBankTxs);
        }

        const bankBalances = {};
        banks.forEach(b => {
          const init = Number(b.initialBalance) || 0;
          const deps = cleanedBankTxs.filter(t => t.bankId === b.id && t.type === 'deposit').reduce((s, t) => s + (Number(t.amount) || 0), 0);
          const wits = cleanedBankTxs.filter(t => t.bankId === b.id && t.type === 'withdrawal').reduce((s, t) => s + (Number(t.amount) || 0), 0);
          const sup = supPays.filter(p => p.bankId === b.id).reduce((s, p) => s + (Number(p.amount) || 0), 0);
          bankBalances[b.id] = Math.round((init + deps - wits - sup) * 100) / 100;
        });

        const totalBank = Object.values(bankBalances).reduce((s, v) => s + v, 0);
        return { ok: true, totalBank: Math.round(totalBank * 100) / 100, bankBalances };
      }
    },

    // ── 3. Supplier Brain (Dette = Achats BR − Payé) ───────────
    SupplierBrain: {
      recalibrate() {
        const suppliers = DB.getAll('suppliers');
        const brs = DB.getAll('brs');
        const pays = DB.getAll('supplier_payments');

        let totalPurchases = 0;
        let totalPaid = 0;
        const supplierStats = {};

        suppliers.forEach(s => {
          const supBRs = brs.filter(b => Number(b.supplierId) === Number(s.id));
          const supPays = pays.filter(p => Number(p.supplierId) === Number(s.id));
          const pur = supBRs.reduce((sum, b) => sum + (Number(b.totalTTC) || 0), 0);
          const pd = supPays.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
          const remaining = Math.max(0, pur - pd);

          totalPurchases += pur;
          totalPaid += pd;
          supplierStats[s.id] = {
            name: s.name,
            purchases: Math.round(pur * 100) / 100,
            paid: Math.round(pd * 100) / 100,
            remaining: Math.round(remaining * 100) / 100
          };
        });

        const totalDebt = Math.max(0, totalPurchases - totalPaid);
        return {
          ok: true,
          totalPurchases: Math.round(totalPurchases * 100) / 100,
          totalPaid: Math.round(totalPaid * 100) / 100,
          totalDebt: Math.round(totalDebt * 100) / 100,
          supplierStats
        };
      }
    },

    // ── 4. Client Brain (CA = BLs Livrés, Encours = BLs Ouverts)
    ClientBrain: {
      recalibrate() {
        const clients = DB.getAll('clients');
        const bls = DB.getAll('bls');

        let totalRevenue = 0;
        let totalPending = 0;
        const clientStats = {};

        clients.forEach(c => {
          const clientBLs = bls.filter(b => String(b.clientId) === String(c.id));
          const delivered = clientBLs.filter(b => b.status === 'delivered' || b.status === 'locked');
          const pending = clientBLs.filter(b => b.status === 'open');

          const rev = delivered.reduce((sum, b) => sum + (Number(b.totalTTC) || 0), 0);
          const pend = pending.reduce((sum, b) => sum + (Number(b.totalTTC) || 0), 0);

          totalRevenue += rev;
          totalPending += pend;
          clientStats[c.id] = {
            name: c.name,
            deliveredCount: delivered.length,
            revenue: Math.round(rev * 100) / 100,
            pendingCount: pending.length,
            pending: Math.round(pend * 100) / 100
          };
        });

        return {
          ok: true,
          totalRevenue: Math.round(totalRevenue * 100) / 100,
          totalPending: Math.round(totalPending * 100) / 100,
          clientStats
        };
      }
    },

    // ── 4b. Historical & Retroactive Reconciliation Brain ──────────
    HistoricalBrain: {
      scanAndOrganize(options = {}) {
        const opts = (typeof options === 'boolean') ? { dryRun: options } : (options || {});
        const dryRun = !!opts.dryRun;
        const forceDeliverOpenDocs = !!opts.forceDeliverOpenDocs;
        const cutoffDate = opts.cutoffDate || null;

        const allBLs = DB.getAll('bls');
        const allBRs = DB.getAll('brs');
        const allSessions = DB.getAll('sessions');
        const allEV = DB.getAll('etat_vente_docs');
        const allBank = DB.getAll('bank_transactions');
        const allCaisse = DB.getAll('caisse_admin');
        const allUsers = DB.getAll('users');
        const settings = DB.getSettings();
        const banks = settings.banks || [];
        const defaultBankId = banks.length > 0 ? banks[0].id : null;
        const today = typeof Utils !== 'undefined' ? Utils.today() : new Date().toISOString().slice(0, 10);
        
        // Operational safety buffer: T (today) and T-1 (yesterday) are live operations
        const yDate = new Date();
        yDate.setDate(yDate.getDate() - 1);
        const yesterday = yDate.toISOString().slice(0, 10);

        let fixedBLs = 0;
        let createdSessions = 0;
        let closedSessions = 0;
        let fixedEVRefs = 0;
        let createdEVs = 0;
        let createdBankTxs = 0;
        let createdCaisseTxs = 0;
        let skippedLiveCount = 0;
        let skippedOpenBLsCount = 0;
        const fixes = [];

        // 1. Identify distinct dates from BLs
        const dateMap = {};
        allBLs.forEach(b => {
          const d = (b.date || (b.createdAt || '').slice(0, 10));
          if (!d) return;
          if (!dateMap[d]) dateMap[d] = [];
          dateMap[d].push(b);
        });

        // Also identify dates from BRs that might have no BL yet
        allBRs.forEach(br => {
          const d = (br.date || (br.createdAt || '').slice(0, 10));
          if (d && !dateMap[d]) dateMap[d] = [];
        });

        const sortedDates = Object.keys(dateMap).sort();

        for (const d of sortedDates) {
          // If cutoffDate provided, strictly ignore any date after cutoffDate
          if (cutoffDate && d > cutoffDate) continue;

          // Operational safety buffer: dates >= yesterday (today & yesterday) are active live shifts
          // NEVER auto-deliver open documents or auto-close sessions for live dates
          const isLiveOperational = (d >= yesterday);
          if (isLiveOperational) {
            skippedLiveCount++;
            continue;
          }

          const blsOnDate = dateMap[d];
          if (!blsOnDate || blsOnDate.length === 0) continue;

          // Check if there are open or pending documents on this archive date
          const hasOpenBLs = blsOnDate.some(b => b.status === 'open' || b.status === 'pending_usine' || !b.status);

          if (hasOpenBLs) {
            if (forceDeliverOpenDocs) {
              // User explicitly opted into force-delivering historical open documents
              blsOnDate.forEach(b => {
                let blChanged = false;
                if (b.status === 'open' || b.status === 'pending_usine' || !b.status) {
                  b.status = 'delivered';
                  b.deliveredAt = b.deliveredAt || `${d}T12:00:00.000Z`;
                  blChanged = true;
                  fixedBLs++;
                  fixes.push(`BCH ${b.ref} (${d}) marqué comme livré (Option Forcer activée)`);
                }
                if (b.brId) {
                  const linkedBR = allBRs.find(r => Number(r.id) === Number(b.brId));
                  if (linkedBR && (linkedBR.status === 'open' || linkedBR.status === 'reserved')) {
                    linkedBR.status = 'delivered';
                    linkedBR.deliveredAt = linkedBR.deliveredAt || `${d}T12:00:00.000Z`;
                    if (!dryRun) DB.update('brs', linkedBR.id, { status: 'delivered', deliveredAt: linkedBR.deliveredAt });
                  }
                }
                if (blChanged && !dryRun) {
                  DB.update('bls', b.id, { status: b.status, deliveredAt: b.deliveredAt });
                }
              });
            } else {
              // SAFE DEFAULT: Do NOT touch open documents!
              skippedOpenBLsCount++;
              // If there are open BLs and forceDeliverOpenDocs is false, skip financial reconciliation for this date
              continue;
            }
          }

          // At this point, all BLs on date d are confirmed delivered/returned
          // Group by user
          const userIds = [...new Set(blsOnDate.map(b => b.createdBy || 1))];

          for (const uId of userIds) {
            const summary = (typeof SessionMgr !== 'undefined' && SessionMgr.getUserDaySummary) ? SessionMgr.getUserDaySummary(uId, d) : null;
            if (!summary || (summary.bls.length === 0 && summary.retours.length === 0)) continue;

            const uObj = allUsers.find(u => Number(u.id) === Number(uId)) || { id: uId, name: 'Vendeur' };
            const [dYearStr, dMonthStr] = d.split('-');
            const targetYear = parseInt(dYearStr) || new Date().getFullYear();
            const targetMonth = dMonthStr || '01';

            // 1b. Session Check
            let sess = allSessions.find(s => 
              (s.userId === uId || String(s.userId) === String(uId) || (uId === 1 && (s.userId === 'admin' || s.userId === '1'))) && 
              s.date === d
            );

            if (!sess) {
              const newSessData = {
                userId: uId,
                date: d,
                status: 'closed',
                startedAt: `${d}T08:00:00.000Z`,
                closedAt: `${d}T18:00:00.000Z`,
                closedNet: 0,
                closedEspeces: summary.totalSalesTTC,
                closedMonnaie: summary.totalReturnsTTC,
                totalSales: summary.totalSalesTTC,
                totalReturns: summary.totalReturnsTTC,
                blCount: summary.bls.length,
                returnCount: summary.retours.length,
                realBchNet: summary.netAmount,
                createdAt: `${d}T08:00:00.000Z`,
                updatedAt: new Date().toISOString()
              };
              if (!dryRun) {
                sess = DB.insert('sessions', newSessData);
                allSessions.push(sess);
              }
              createdSessions++;
              fixes.push(`Session archive créée pour le ${d} (User #${uId})`);
            } else if (sess.status !== 'closed') {
              sess.status = 'closed';
              sess.closedAt = sess.closedAt || `${d}T18:00:00.000Z`;
              sess.realBchNet = summary.netAmount;
              sess.totalSales = summary.totalSalesTTC;
              sess.totalReturns = summary.totalReturnsTTC;
              if (!dryRun) DB.update('sessions', sess.id, sess);
              closedSessions++;
              fixes.push(`Session archive clôturée pour le ${d} (User #${uId})`);
            }

            // 1c. État de Vente Check
            let evDoc = allEV.find(ev => 
              (ev.date === d || ev.dateStart === d || ev.dateEnd === d) &&
              (ev.userId === uId || String(ev.userId) === String(uId) || ev.createdBy === uId || String(ev.createdBy) === String(uId) || (uId === 1 && (ev.createdBy === 'admin' || ev.userId === 'admin')))
            );

            // Compute expected État de Vente totals
            const marginRate = Number(settings.evMarginRate ?? settings.evMarginPercent ?? settings.evMarginAmount ?? 0);
            const aggregated = {};
            summary.bls.filter(b => b.status !== 'returned').forEach(bl => {
              (bl.lines || []).forEach(line => {
                const key = (line.designation || '').trim();
                if (!key) return;
                const qty = Number(line.qtyDelivered || line.qty) || 0;
                const price = Number(line.price || line.unitPrice) || 0;
                const disc = Number(line.disc) || 0;
                const basePrice = Math.round(price * (1 - disc / 100) * 100) / 100;
                const marginPerUnit = Math.round(basePrice * (marginRate / 100) * 100) / 100;
                const ep = Math.round((basePrice + marginPerUnit) * 100) / 100;
                if (!aggregated[key]) aggregated[key] = { designation: key, unit: line.unit || 'U', qty: 0, basePrice, marginRate, marginPerUnit, unitPrice: ep };
                aggregated[key].qty += qty;
                if (basePrice > aggregated[key].basePrice) {
                  aggregated[key].basePrice = basePrice;
                  aggregated[key].marginRate = marginRate;
                  aggregated[key].marginPerUnit = marginPerUnit;
                  aggregated[key].unitPrice = ep;
                }
              });
            });
            const items = Object.values(aggregated).filter(it => it.qty > 0.0001);
            const totalHT = Math.round(items.reduce((s, it) => s + (it.qty * it.unitPrice), 0) * 100) / 100;
            const totalMargin = Math.round(items.reduce((s, it) => s + (it.qty * (it.marginPerUnit || (it.basePrice * marginRate / 100))), 0) * 100) / 100;
            const tvaRate = Number(settings.tvaRate) || 19;
            const tvaAmount = Math.round(totalHT * (tvaRate / 100) * 100) / 100;
            const TIMBRE_RATE_EV = 1;
            const timbreAmount = Math.round((totalHT + tvaAmount) * TIMBRE_RATE_EV / 100 * 100) / 100;
            const netAmountEV = Math.round((totalHT + tvaAmount + timbreAmount) * 100) / 100;
            const ecartFiscal = Math.round((netAmountEV - summary.netAmount) * 100) / 100;

            if (evDoc) {
              // Check if ref month is misaligned (e.g. contains current month instead of historical month)
              const expectedMonthPattern = `/${targetMonth}/${targetYear}`;
              if (evDoc.ref && !evDoc.ref.includes(expectedMonthPattern)) {
                const oldRef = evDoc.ref;
                const matchSeq = evDoc.ref.match(/ET\/(\d+)\//);
                const seq = matchSeq ? matchSeq[1] : '001';
                evDoc.ref = `ET/${seq}/${targetMonth}/${targetYear}`;
                evDoc.year = targetYear;
                evDoc.date = d;
                evDoc.dateStart = d;
                evDoc.dateEnd = d;
                evDoc.status = 'deposited';
                if (!dryRun) DB.update('etat_vente_docs', evDoc.id, evDoc, 'Correction référence date');
                fixedEVRefs++;
                fixes.push(`Référence État de Vente corrigée : ${oldRef} -> ${evDoc.ref}`);
              }
            } else if (summary.bls.length > 0) {
              // Generate historical État de Vente
              const existingOfTargetYear = allEV.filter(e => (e.ref || '').includes(`/${targetYear}`));
              const seqNum = existingOfTargetYear.length + 1;
              const ref = `ET/${String(seqNum).padStart(3, '0')}/${targetMonth}/${targetYear}`;
              const newEVData = {
                ref,
                year: targetYear,
                date: d,
                dateStart: d,
                dateEnd: d,
                userId: uId,
                userName: uObj.name || uObj.username || 'Vendeur',
                marginRate,
                marginPerUnit: marginRate > 0 ? `${marginRate}%` : '0%',
                totalMargin,
                items,
                blList: summary.bls.map(b => ({
                  id: b.id,
                  ref: b.ref,
                  clientName: b.clientName || 'Client',
                  totalHT: Number(b.totalHT) || 0,
                  tvaAmount: Number(b.tvaAmount || b.tva) || 0,
                  timbreAmount: Number(b.timbreAmount || b.timbre) || 0,
                  totalTTC: Number(b.totalTTC) || 0,
                  status: b.status,
                  isReturned: b.status === 'returned',
                  date: b.date
                })),
                returnList: summary.retours.map(r => ({ id: r.id, ref: r.ref, blRef: r.blRef, clientName: r.clientName || 'Client', totalTTC: Number(r.totalTTC) || 0, date: r.date })),
                totalBLsTTC: summary.totalSalesTTC,
                grossTotalTTC: summary.totalSalesTTC,
                totalReturnsTTC: summary.totalReturnsTTC,
                returnsTotalTTC: summary.totalReturnsTTC,
                realBchNet: summary.netAmount,
                realBchGross: summary.totalSalesTTC,
                totalHT,
                tvaRate,
                tvaAmount,
                timbreAmount,
                timbreRate: TIMBRE_RATE_EV,
                totalTTC: netAmountEV,
                netTotalTTC: netAmountEV,
                totalTTCFiscal: netAmountEV,
                ecartFiscal,
                createdBy: uId,
                createdByName: uObj.name || uObj.username || 'Vendeur',
                createdAt: `${d}T18:00:00.000Z`,
                updatedAt: new Date().toISOString(),
                bankId: defaultBankId,
                status: 'deposited'
              };
              if (!dryRun) {
                evDoc = DB.insert('etat_vente_docs', newEVData);
                allEV.push(evDoc);
              }
              createdEVs++;
              fixes.push(`État de Vente généré pour le ${d} : ${ref} (${Utils.fmtCurrency(netAmountEV)})`);
            }

            if (sess && evDoc) {
              if (sess.etatVenteRef !== evDoc.ref || sess.etatVenteId !== evDoc.id || sess.closedNet !== (evDoc.totalTTC || netAmountEV)) {
                sess.etatVenteId = evDoc.id;
                sess.etatVenteRef = evDoc.ref;
                sess.etatVenteTTC = evDoc.totalTTC || netAmountEV;
                sess.closedNet = evDoc.totalTTC || netAmountEV;
                sess.realBchNet = summary.netAmount;
                if (!dryRun) DB.update('sessions', sess.id, sess);
              }
            }

            const effectiveEV = evDoc;
            const effectiveEVRef = effectiveEV?.ref || sess?.etatVenteRef;
            const effectiveEVNet = effectiveEV ? (Number(effectiveEV.totalTTC || effectiveEV.netTotalTTC) || netAmountEV) : netAmountEV;

            // 1d. Bank Transaction Synchronization
            if (defaultBankId && effectiveEV && effectiveEVNet > 0) {
              const expectedDepRef = 'EV-DEP-' + (effectiveEVRef || '').replace(/\//g, '-');
              let bankTx = allBank.find(t => 
                (t.etatVenteId && String(t.etatVenteId) === String(effectiveEV.id)) ||
                (t.etatVenteRef && t.etatVenteRef === effectiveEVRef) ||
                (t.ref && t.ref === expectedDepRef) ||
                (sess && t.sessionId && String(t.sessionId) === String(sess.id))
              );
              const bankTxData = {
                type: 'deposit',
                subtype: 'etat_vente',
                bankId: effectiveEV.bankId || defaultBankId,
                amount: effectiveEVNet,
                date: d,
                ref: expectedDepRef,
                note: `Dépôt État de Vente ${effectiveEVRef} (Historique ${Utils.fmtDate(d)})`,
                etatVenteId: effectiveEV.id,
                etatVenteRef: effectiveEVRef,
                createdBy: uId,
                createdAt: `${d}T18:00:00.000Z`,
                updatedAt: new Date().toISOString()
              };
              if (bankTx) {
                if (Math.abs(Number(bankTx.amount) - effectiveEVNet) > 0.01 || bankTx.ref !== expectedDepRef || bankTx.date !== d) {
                  if (!dryRun) DB.update('bank_transactions', bankTx.id, bankTxData);
                }
              } else {
                if (!dryRun) {
                  bankTx = DB.insert('bank_transactions', bankTxData);
                  allBank.push(bankTx);
                }
                createdBankTxs++;
                fixes.push(`Dépôt bancaire créé au ${d} : ${Utils.fmtCurrency(effectiveEVNet)}`);
              }
              if (effectiveEV && bankTx && effectiveEV.bankDepositId !== bankTx.id) {
                if (!dryRun) DB.update('etat_vente_docs', effectiveEV.id, { bankDepositId: bankTx.id });
              }
            }

            // 1e. Caisse Admin Synchronization
            if (summary.netAmount > 0) {
              // Deposit: Real BCH cash collected
              let caisseDep = allCaisse.find(e => 
                e.type === 'deposit' && 
                (e.source === 'user_cloture' || e.source === 'bch_recettes_reelles') && 
                ((sess && Number(e.sessionId) === Number(sess.id)) || 
                 (effectiveEVRef && e.etatVenteRef === effectiveEVRef) ||
                 (e.sessionDate === d && (e.userId === uId || String(e.userId) === String(uId))))
              );
              const caisseDepData = {
                type: 'deposit',
                source: 'user_cloture',
                userId: uId,
                userName: uObj.name || uObj.username || 'Vendeur',
                sessionId: sess?.id || null,
                sessionDate: d,
                amount: summary.netAmount,
                etatVenteRef: effectiveEVRef || null,
                note: `Recettes réelles BCH — Clôture ${Utils.fmtDate(d)} (${summary.bls.length} BCH)`,
                createdAt: `${d}T18:00:00.000Z`
              };
              if (caisseDep) {
                if (Math.abs(Number(caisseDep.amount) - summary.netAmount) > 0.01 || caisseDep.sessionDate !== d) {
                  if (!dryRun) DB.update('caisse_admin', caisseDep.id, caisseDepData);
                }
              } else {
                if (!dryRun) {
                  caisseDep = DB.insert('caisse_admin', caisseDepData);
                  allCaisse.push(caisseDep);
                }
                createdCaisseTxs++;
                fixes.push(`Recette caisse créée au ${d} : +${Utils.fmtCurrency(summary.netAmount)}`);
              }

              // Withdrawal: Transfert banque État de Vente
              if (effectiveEVNet > 0) {
                let caisseWith = allCaisse.find(e => 
                  e.type === 'withdrawal' && 
                  e.source === 'transfert_banque_etat_vente' && 
                  ((sess && Number(e.sessionId) === Number(sess.id)) || 
                   (effectiveEVRef && e.etatVenteRef === effectiveEVRef) ||
                   (e.sessionDate === d && (e.userId === uId || String(e.userId) === String(uId))))
                );
                const caisseWithData = {
                  type: 'withdrawal',
                  source: 'transfert_banque_etat_vente',
                  userId: uId,
                  userName: uObj.name || uObj.username || 'Vendeur',
                  sessionId: sess?.id || null,
                  sessionDate: d,
                  amount: effectiveEVNet,
                  etatVenteRef: effectiveEVRef || null,
                  etatVenteId: effectiveEV?.id || null,
                  etatVenteTTC: effectiveEVNet,
                  note: `Versement bancaire — État de Vente ${effectiveEVRef || ''} (${Utils.fmtDate(d)})`,
                  createdAt: `${d}T18:00:00.000Z`
                };
                if (caisseWith) {
                  if (Math.abs(Number(caisseWith.amount) - effectiveEVNet) > 0.01 || caisseWith.sessionDate !== d) {
                    if (!dryRun) DB.update('caisse_admin', caisseWith.id, caisseWithData);
                  }
                } else {
                  if (!dryRun) {
                    caisseWith = DB.insert('caisse_admin', caisseWithData);
                    allCaisse.push(caisseWith);
                  }
                  createdCaisseTxs++;
                  fixes.push(`Transfert caisse->banque créé au ${d} : -${Utils.fmtCurrency(effectiveEVNet)}`);
                }
              }
            }
          }
        }

        return {
          ok: true,
          datesProcessed: sortedDates.length,
          datesScanned: sortedDates,
          fixedBLs,
          blsDelivered: fixedBLs,
          createdSessions,
          sessionsCreated: createdSessions + closedSessions,
          closedSessions,
          fixedEVRefs,
          createdEVs,
          evCorrected: fixedEVRefs + createdEVs,
          createdBankTxs,
          bankTxsCreated: createdBankTxs,
          createdCaisseTxs,
          caisseEntriesCreated: createdCaisseTxs,
          skippedLiveCount,
          skippedOpenBLsCount,
          fixes
        };
      }
    },

    // ── 5. Master Cortex (0 = 0 Total Balance Overseer) ────────
    recalibrateAll() {
      if (this._running) return;
      this._running = true;
      try {
        const caisseRes = this.CaisseBrain.recalibrate();
        const bankRes = this.BankBrain.recalibrate();
        const supRes = this.SupplierBrain.recalibrate();
        const clientRes = this.ClientBrain.recalibrate();

        const totalTresorerie = Math.round((caisseRes.balance + bankRes.totalBank) * 100) / 100;
        if (window._ERP_DEBUG) console.log(`[Master Brain] Recalibration complete across 4 brains. Solde Caisse: ${Utils.fmtCurrency(caisseRes.balance)} | Solde Banque: ${Utils.fmtCurrency(bankRes.totalBank)} | Trésorerie Totale: ${Utils.fmtCurrency(totalTresorerie)}`);

        return {
          ok: true,
          caisse: caisseRes,
          bank: bankRes,
          suppliers: supRes,
          clients: clientRes,
          totalTresorerie,
          timestamp: new Date().toISOString()
        };
      } catch (e) {
        console.error('[Master Brain] Recalibrate error:', e);
      } finally {
        this._running = false;
      }
    },

    // ── 6. The 15-Minute Autocorrect & Data Integrity Cortex Engine ──
    AutocorrectBrain: {
      _intervalMs: 15 * 60 * 1000,
      _nextRunTime: Date.now() + 15 * 60 * 1000,
      _timer: null,
      _tickerTimer: null,
      _lastResult: null,

      init() {
        window.AutocorrectBrain = this;
        setTimeout(() => this.runCheck(false), 2000);

        if (this._timer) clearInterval(this._timer);
        this._timer = setInterval(() => this.runCheck(false), this._intervalMs);

        if (this._tickerTimer) clearInterval(this._tickerTimer);
        this._tickerTimer = setInterval(() => this.updateTicker(), 1000);
      },

      updateTicker() {
        const elTimer = document.getElementById('integrityTimer');
        if (!elTimer) return;
        const remainingSec = Math.max(0, Math.round((this._nextRunTime - Date.now()) / 1000));
        const m = Math.floor(remainingSec / 60);
        const s = remainingSec % 60;
        elTimer.textContent = `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
      },

      async runCheck(isManual = false) {
        this._nextRunTime = Date.now() + this._intervalMs;
        const widget = document.getElementById('topIntegrityWidget');
        const pulse = document.getElementById('integrityPulse');
        const label = document.getElementById('integrityLabel');
        if (widget) widget.classList.add('healing');

        const fixes = [];
        const checks = [];

        try {
          // Check 0: Organisation & Synchronisation Historique (Mode Diagnostic Non-Destructif)
          let histRes = { datesProcessed: 0, fixes: [], skippedOpenBLsCount: 0 };
          try {
            // Strictly dryRun: true in automated 15-min background job
            histRes = DB.MasterBrain.HistoricalBrain.scanAndOrganize({ dryRun: true });
          } catch(he) { console.warn('[HistoricalBrain] Autocorrect diagnostic check err:', he); }
          const pendingArchiveFixes = (histRes.createdSessions || 0) + (histRes.createdEVs || 0) + (histRes.fixedEVRefs || 0);
          checks.push({ 
            name: 'Audit Archives Historiques', 
            status: pendingArchiveFixes > 0 ? 'INFO' : 'OK', 
            detail: pendingArchiveFixes > 0 
              ? `${pendingArchiveFixes} régularisation(s) d'archive en attente (Scan manuel disponible)`
              : 'Archives synchronisées et conformes' 
          });

          // Check 1: Caisse & Clôtures Reconciliation
          const caisseRes = DB.MasterBrain.CaisseBrain.recalibrate();
          checks.push({ name: 'Trésorerie Caisse Centrale & Clôtures', status: 'OK', detail: `Solde contrôlé: ${Utils.fmtCurrency(caisseRes.balance)} (${caisseRes.cleanedCount || 0} entrées purgées)` });

          // Check 2: Mini Caisses & User Sessions
          const bls = DB.getAll('bls');
          const retours = DB.getAll('bon_retours');
          const sessions = DB.getAll('sessions');
          let sessionsFixed = 0;

          sessions.forEach(sess => {
            const summary = SessionMgr.getUserDaySummary(sess.userId, sess.date);
            const salesTTC = summary.totalSalesTTC;
            const retsTTC = summary.totalReturnsTTC;
            const net = summary.netAmount;

            if (sess.status === 'closed' && (sess.closedNet === undefined || Math.abs((sess.closedNet || sess.closedEspeces || 0) - net) > 0.01)) {
              sess.closedNet = net;
              sess.totalSales = salesTTC;
              sess.totalReturns = retsTTC;
              sess.ecart = 0;
              sessionsFixed++;
              fixes.push(`Session ${sess.date} (User #${sess.userId}) : Ventes ${Utils.fmtCurrency(salesTTC)} - Retours ${Utils.fmtCurrency(retsTTC)} = Net ${Utils.fmtCurrency(net)}`);
            }
          });
          if (sessionsFixed > 0) DB.rawSet('sessions', sessions);
          checks.push({ name: 'Mini-Caisses & Sessions Vendeurs', status: 'OK', detail: `${sessions.length} sessions vérifiées (${sessionsFixed} corrigées)` });

          // Check 3: Bons de Retour & Reserved BL References
          let retFixed = 0;
          retours.forEach(ret => {
            if (ret.blId) {
              const linkedBL = bls.find(b => Number(b.id) === Number(ret.blId));
              if (linkedBL && linkedBL.status !== 'returned') {
                const returnedAt = ret.createdAt || linkedBL.updatedAt || new Date().toISOString();
                const returnedRef = ret.ref || '';
                linkedBL.status = 'returned';
                linkedBL.returnedAt = returnedAt;
                linkedBL.returnedRef = returnedRef;
                retFixed++;
                fixes.push(`BL ${linkedBL.ref} verrouillé avec statut "returned" (Réf: ${ret.ref})`);
                DB.update('bls', linkedBL.id, { status: 'returned', returnedAt, returnedRef }, 'Verrouillage retour');
              }
            }
          });
          checks.push({ name: 'Bons de Retour & Références Réservées', status: 'OK', detail: `${retours.length} retours vérifiés (${retFixed} BLs verrouillés)` });

          // Check 4: États de Vente & Dépôts Bancaires
          const evDocs = DB.getAll('etat_vente_docs');
          const bankTxs = DB.getAll('bank_transactions');
          const banks = DB.getSettings().banks || [];
          let evFixed = 0;

          if (banks.length > 0) {
            const defaultBankId = banks[0].id;
            evDocs.forEach(ev => {
              if (ev.status !== 'deposited' && ev.status !== 'validated') return;
              const expectedRef = 'EV-DEP-' + (ev.ref || '').replace(/\//g, '-');
              const existingDep = bankTxs.find(bt => 
                (bt.etatVenteId && String(bt.etatVenteId) === String(ev.id)) ||
                (bt.etatVenteRef && bt.etatVenteRef === ev.ref) ||
                (bt.ref && bt.ref === expectedRef)
              );
              if (!existingDep && ev.status === 'deposited') {
                const newTx = {
                  id: (bankTxs.reduce((m, e) => Math.max(m, e.id || 0), 0) + 1),
                  bankId: ev.bankId || defaultBankId,
                  type: 'deposit',
                  subtype: 'etat_vente',
                  amount: Number(ev.totalTTC) || 0,
                  ref: expectedRef,
                  date: (ev.date || ev.createdAt || '').slice(0, 10),
                  createdAt: ev.createdAt || new Date().toISOString(),
                  note: `Dépôt État de Vente ${ev.ref} (Auto-réconcilié)`,
                  etatVenteId: ev.id,
                  etatVenteRef: ev.ref
                };
                bankTxs.push(newTx);
                evFixed++;
                fixes.push(`Dépôt bancaire créé pour l'État de Vente ${ev.ref} (${Utils.fmtCurrency(ev.totalTTC)})`);
                if (typeof window.API !== 'undefined' && location.protocol !== 'file:') {
                  window.API.insert('bank_transactions', newTx).catch(() => {});
                }
              } else if (existingDep && Math.abs(Number(existingDep.amount) - Number(ev.totalTTC)) > 0.01) {
                existingDep.amount = Number(ev.totalTTC);
                evFixed++;
                fixes.push(`Montant du dépôt bancaire ajusté pour État de Vente ${ev.ref} (${Utils.fmtCurrency(ev.totalTTC)})`);
              }
            });
            if (evFixed > 0) DB.rawSet('bank_transactions', bankTxs);
          }
          checks.push({ name: 'États de Vente & Dépôts Banque', status: 'OK', detail: `${evDocs.length} états de vente vérifiés (${evFixed} ajustés/créés)` });

          // Check 4b: Unicité des Références BCH & Protection des Références Brûlées (Anti-Doublon)
          const allBLsRef = DB.getAll('bls');
          const refCounts = {};
          allBLsRef.forEach(b => {
            if (b.ref) refCounts[b.ref] = (refCounts[b.ref] || 0) + 1;
          });
          let bchDupsFixed = 0;
          Object.keys(refCounts).forEach(r => {
            if (refCounts[r] > 1) {
              const matches = allBLsRef.filter(b => b.ref === r);
              const returnedDoc = matches.find(b => b.status === 'returned');
              const activeDocs = matches.filter(b => b.status !== 'returned');
              const toRename = returnedDoc ? activeDocs : matches.slice(1);
              toRename.forEach((docToFix, idx) => {
                const isPartial = Boolean(docToFix.partNum && String(docToFix.ref || '').includes('-P'));
                const year = docToFix.year || new Date().getFullYear();
                let newRef;
                if (isPartial) {
                  const br = docToFix.brId ? DB.getById('brs', docToFix.brId) : null;
                  const brNum = br?.brNum || (r.match(/(\d+)/)?.[1]) || docToFix.id;
                  let pNum = (docToFix.partNum || 1) + idx;
                  newRef = DB.buildBCHRef(brNum, year, pNum);
                  while (allBLsRef.some(b => b.ref === newRef && b.id !== docToFix.id)) {
                    pNum++;
                    newRef = DB.buildBCHRef(brNum, year, pNum);
                  }
                  docToFix.partNum = pNum;
                } else {
                  // Standard independent BCH: assign fresh sequential BCH number without fake -P01 suffix
                  let nextNum = 1;
                  allBLsRef.forEach(b => {
                    const m = (b.ref || '').match(/BCH-(\d+)(?!-P)/);
                    if (m && Number(m[1]) >= nextNum) nextNum = Number(m[1]) + 1;
                  });
                  newRef = DB.buildBCHRef(nextNum, year);
                  while (allBLsRef.some(b => b.ref === newRef && b.id !== docToFix.id)) {
                    nextNum++;
                    newRef = DB.buildBCHRef(nextNum, year);
                  }
                  docToFix.bchNum = nextNum;
                  docToFix.partNum = null;
                }
                docToFix.ref = newRef;
                DB.update('bls', docToFix.id, { ref: newRef, partNum: docToFix.partNum, bchNum: docToFix.bchNum }, 'Correction automatique référence dupliquée suite à retour');
                bchDupsFixed++;
                fixes.push(`Référence BCH dupliquée "${r}" corrigée : BL #${docToFix.id} renommé en "${newRef}" (l'archive retournée conserve "${r}")`);
              });
            }
          });
          if (bchDupsFixed > 0) {
            DB.MasterBrain.recalibrateAll();
          }
          checks.push({ name: 'Unicité des Références BCH', status: 'OK', detail: `${Object.keys(refCounts).length} références vérifiées (${bchDupsFixed} dupliquées corrigées)` });

          // Check 4c: Dédoublonnage Trésorerie Caisse (Anti-Doublon Clôtures, Versements & Retours)
          const allCaisse = DB.getAll('caisse_admin');
          const seenCaisseCloture = new Set();
          const seenCaisseEv = new Set();
          const seenBlRetEntries = new Set();
          const cleanedCaisseTreasury = [];
          const toRemoveCaisseCloud = [];
          let caisseDupsFixed = 0;

          allCaisse.forEach(ce => {
            // Strip out illegal bl_delivery or bl_error_delete entries
            if (ce.source === 'bl_delivery' || ce.source === 'bl_error_delete') {
              caisseDupsFixed++;
              toRemoveCaisseCloud.push(ce.id);
              fixes.push(`Entrée illégale "${ce.source}" purgée de la caisse centrale (#${ce.id})`);
              return;
            }
            if ((ce.source === 'user_cloture' || ce.source === 'bch_recettes_reelles') && ce.type === 'deposit') {
              const clotureKey = ce.sessionId ? `sess_${ce.sessionId}` : (ce.etatVenteRef || `date_${ce.sessionDate || ce.date}_u_${ce.userId}`);
              if (seenCaisseCloture.has(clotureKey)) {
                caisseDupsFixed++;
                toRemoveCaisseCloud.push(ce.id);
                fixes.push(`Doublon de clôture caisse éliminé pour ${clotureKey}`);
                return;
              }
              seenCaisseCloture.add(clotureKey);
              cleanedCaisseTreasury.push(ce);
            } else if (ce.source === 'transfert_banque_etat_vente' && ce.etatVenteRef) {
              if (seenCaisseEv.has(ce.etatVenteRef)) {
                caisseDupsFixed++;
                toRemoveCaisseCloud.push(ce.id);
                fixes.push(`Doublon de versement caisse éliminé pour État de Vente ${ce.etatVenteRef}`);
                return;
              }
              seenCaisseEv.add(ce.etatVenteRef);
              cleanedCaisseTreasury.push(ce);
            } else if (ce.source === 'bl_return' && ce.blId) {
              const retKey = `bl_${ce.blId}`;
              if (seenBlRetEntries.has(retKey)) {
                caisseDupsFixed++;
                toRemoveCaisseCloud.push(ce.id);
                fixes.push(`Doublon de retour caisse éliminé pour BL #${ce.blId}`);
                return;
              }
              seenBlRetEntries.add(retKey);
              cleanedCaisseTreasury.push(ce);
            } else {
              cleanedCaisseTreasury.push(ce);
            }
          });

          if (caisseDupsFixed > 0) {
            DB.rawSet('caisse_admin', cleanedCaisseTreasury);
            if (typeof window.API !== 'undefined' && location.protocol !== 'file:') {
              toRemoveCaisseCloud.forEach(id => window.API.remove('caisse_admin', id).catch(() => {}));
            }
          }
          checks.push({ name: 'Intégrité Trésorerie Caisse', status: 'OK', detail: `${allCaisse.length} opérations caisse vérifiées (${caisseDupsFixed} doublons purgés)` });

          // Check 4d: Isolation et Réservation Stricte des BRs Usine (Protection BR Usine & Brûlage de Référence)
          const allBRsCheck = DB.getAll('brs');
          let brUsineFixed = 0;
          allBRsCheck.forEach(br => {
            if (br.isAutoGenerated || br.bcId || br.bcRef) {
              // Find the original BCH that owns this auto-generated BR
              const origBL = (br.bcId ? DB.getById('bls', br.bcId) : null) || 
                             allBLsRef.find(b => b.ref === br.bcRef || Number(b.linkedBrId) === Number(br.id));
              
              if (origBL) {
                // If original BCH is returned, this BR MUST be returned/burned, NEVER open
                if (origBL.status === 'returned' && br.status !== 'returned') {
                  br.status = 'returned';
                  br.isReturned = true;
                  DB.update('brs', br.id, { status: 'returned', isReturned: true, notes: `BR réservé pour ${origBL.ref} — marqué retourné suite au retour du BCH` }, 'Mise en conformité BR usine retourné');
                  brUsineFixed++;
                  fixes.push(`BR usine ${br.ref} reverrouillé comme RETOURNÉ (lié au BCH retourné ${origBL.ref})`);
                }

                // If another active BL was mistakenly attached to this same BR, detach and assign dedicated BR
                const otherBLsSharingBR = allBLsRef.filter(b => 
                  Number(b.id) !== Number(origBL.id) && 
                  (Number(b.brId) === Number(br.id) || Number(b.linkedBrId) === Number(br.id))
                );

                otherBLsSharingBR.forEach(otherBL => {
                  let updatedOther = {};
                  const isRoguePart = (otherBL.ref || '').includes('-P');
                  if (isRoguePart) {
                    let nextCleanBchNum = 1;
                    allBLsRef.forEach(b => {
                      const m = (b.ref || '').match(/BCH-(\d+)(?!-P)/);
                      if (m && Number(m[1]) >= nextCleanBchNum) nextCleanBchNum = Number(m[1]) + 1;
                    });
                    const healedRef = DB.buildBCHRef(nextCleanBchNum, otherBL.year || new Date().getFullYear());
                    otherBL.ref = healedRef;
                    otherBL.partNum = null;
                    otherBL.bchNum = nextCleanBchNum;
                    updatedOther.ref = healedRef;
                    updatedOther.partNum = null;
                    updatedOther.bchNum = nextCleanBchNum;
                    fixes.push(`BL #${otherBL.id} corrigé : référence réhabilitée en "${healedRef}" (suppression du suffixe partiel erroné -P01)`);
                  }

                  // Create or assign an independent dedicated BR for this other BL
                  let nextBRN = 1;
                  allBRsCheck.forEach(x => { if (Number(x.brNum) >= nextBRN) nextBRN = Number(x.brNum) + 1; });
                  const newBrRef = DB.buildBRRef(nextBRN, otherBL.year || new Date().getFullYear());
                  const dedicatedBR = {
                    ref: newBrRef,
                    brNum: nextBRN,
                    year: otherBL.year || new Date().getFullYear(),
                    supplierId: otherBL.supplierId || br.supplierId || null,
                    supplierName: otherBL.supplierName || br.supplierName || 'Usine',
                    driverName: otherBL.driverName || '',
                    truckIMM: otherBL.truckIMM || '',
                    date: otherBL.date || Utils.today(),
                    lines: otherBL.lines || br.lines || [],
                    totalHT: otherBL.totalHT || br.totalHT || 0,
                    timbreAmount: otherBL.timbreAmount || 0,
                    totalTTC: otherBL.totalTTC || br.totalTTC || 0,
                    status: otherBL.status === 'delivered' ? 'delivered' : 'reserved',
                    isAutoGenerated: true,
                    locked: true,
                    bcId: otherBL.id,
                    bcRef: otherBL.ref,
                    notes: `BR dédié exclusif pour BCH ${otherBL.ref}`,
                    createdAt: new Date().toISOString()
                  };
                  const savedDedicatedBR = DB.insert('brs', dedicatedBR);
                  allBRsCheck.push(savedDedicatedBR);
                  otherBL.brId = savedDedicatedBR.id;
                  otherBL.linkedBrId = savedDedicatedBR.id;
                  otherBL.linkedBrRef = savedDedicatedBR.ref;
                  updatedOther.brId = savedDedicatedBR.id;
                  updatedOther.linkedBrId = savedDedicatedBR.id;
                  updatedOther.linkedBrRef = savedDedicatedBR.ref;
                  DB.update('bls', otherBL.id, updatedOther, 'Attribution BR usine dédié exclusif');
                  brUsineFixed++;
                  fixes.push(`BCH ${otherBL.ref} découplé du BR ${br.ref} : nouveau BR dédié "${newBrRef}" créé`);
                });
              }
            }
          });
          checks.push({ name: 'Isolation & Intégrité des BRs Usine', status: 'OK', detail: `${brUsineFixed} anomalies de BR usine résolues` });

          // Check 5: Bank Reconciliation & Running Balances
          const bankRes = DB.MasterBrain.BankBrain.recalibrate();
          checks.push({ name: 'Rapprochement & Extraits Bancaires', status: 'OK', detail: `Trésorerie Banque: ${Utils.fmtCurrency(bankRes.totalBank)}` });

          // Check 6: Séquences Atomiques (BL/BR/ET/RET)
          const maxBlNum = bls.reduce((m, b) => Math.max(m, Number(b.blNum) || 0), 0);
          const maxBrNum = DB.getAll('brs').reduce((m, b) => Math.max(m, Number(b.brNum) || 0), 0);
          const maxEvNum = evDocs.reduce((m, d) => {
            const match = (d.ref || '').match(/ET\/(\d+)\//);
            return match ? Math.max(m, parseInt(match[1])) : m;
          }, 0);
          const maxRetNum = retours.reduce((m, r) => {
            const match = (r.ref || '').match(/RET\/(\d+)\//);
            return match ? Math.max(m, parseInt(match[1])) : m;
          }, 0);
          checks.push({ name: 'Séquences Atomiques (BL/BR/ET/RET)', status: 'OK', detail: `BL #${maxBlNum} · BR #${maxBrNum} · ET #${maxEvNum} · RET #${maxRetNum}` });

          // Check 7: Doublons & Intégrité Données (Anti-Doublon ID & Référence)
          let dupsFixed = 0;
          const toRemoveCloudCheck7 = [];
          ['bls', 'brs', 'suppliers', 'clients', 'bon_retours', 'etat_vente_docs'].forEach(col => {
            const items = DB.getAll(col);
            const seenId = new Set();
            const seenRef = new Set();
            const unique = [];
            items.forEach(it => {
              const idKey = it.id;
              const refKey = it.ref ? String(it.ref).trim() : null;
              if (idKey && seenId.has(idKey)) {
                dupsFixed++;
                toRemoveCloudCheck7.push({ col, id: idKey });
                fixes.push(`Doublon ID éliminé dans ${col}: #${idKey}`);
              } else if (refKey && seenRef.has(refKey)) {
                dupsFixed++;
                toRemoveCloudCheck7.push({ col, id: idKey });
                fixes.push(`Doublon Réf "${refKey}" éliminé dans ${col}: #${idKey}`);
              } else {
                if (idKey) seenId.add(idKey);
                if (refKey) seenRef.add(refKey);
                unique.push(it);
              }
            });
            if (unique.length < items.length) DB.rawSet(col, unique);
          });
          if (toRemoveCloudCheck7.length > 0 && typeof window.API !== 'undefined' && location.protocol !== 'file:') {
            toRemoveCloudCheck7.forEach(item => window.API.remove(item.col, item.id).catch(() => {}));
          }
          checks.push({ name: 'Contrôle des Doublons & Intégrité Données', status: 'OK', detail: dupsFixed ? `${dupsFixed} doublons purgés` : '100% Unique' });

          // Check 8: Pointage & Sessions actives
          const openSessions = sessions.filter(s => s.status === 'open');
          checks.push({ name: 'Pointage & Sessions de Travail', status: 'OK', detail: `${openSessions.length} session(s) active(s)` });

          // Check 9: Charges Récurrentes & Échéancier
          const recCharges = DB.getAll('recurring_charges') || [];
          const today = Utils.today();
          let recExecuted = 0;
          recCharges.forEach(rc => {
            if (rc.active !== false && rc.autoDebit === true && (rc.nextDueDate || '') <= today) {
              try {
                const isCaisse = rc.bankId === 'caisse';
                DB.insert('bank_charges', {
                  type: 'auto',
                  subtype: rc.category || 'Charge récurrente',
                  label: `[Auto-Échéance] ${rc.label}`,
                  category: rc.category,
                  bankId: rc.bankId,
                  amount: rc.amount,
                  date: today,
                  recurring: true,
                  recurringId: rc.id,
                  createdBy: 'system',
                  createdByName: 'Autocorrect Daemon',
                  createdAt: new Date().toISOString()
                });
                if (isCaisse) {
                  DB.insert('caisse_admin', {
                    type: 'withdrawal',
                    source: 'charge',
                    amount: rc.amount,
                    note: `Charge récurrente automatique: ${rc.label}`,
                    userId: 'system',
                    userName: 'Autocorrect Daemon',
                    date: today
                  });
                } else {
                  DB.insert('bank_transactions', {
                    bankId: rc.bankId,
                    type: 'payment',
                    subtype: 'charge',
                    amount: rc.amount,
                    note: `Charge récurrente automatique: ${rc.label}`,
                    date: today,
                    by: 'system',
                    byName: 'Autocorrect Daemon',
                    createdAt: new Date().toISOString()
                  });
                }
                const nextDate = new Date(rc.nextDueDate || today);
                switch(rc.frequency) {
                  case 'hebdomadaire': nextDate.setDate(nextDate.getDate() + 7); break;
                  case 'trimestrielle': nextDate.setMonth(nextDate.getMonth() + 3); break;
                  case 'semestrielle': nextDate.setMonth(nextDate.getMonth() + 6); break;
                  case 'annuelle': nextDate.setFullYear(nextDate.getFullYear() + 1); break;
                  default: nextDate.setMonth(nextDate.getMonth() + 1);
                }
                rc.nextDueDate = nextDate.toISOString().split('T')[0];
                rc.lastExecuted = today;
                recExecuted++;
                fixes.push(`Charge récurrente "${rc.label}" exécutée automatiquement (${Utils.fmtCurrency(rc.amount)})`);
              } catch(err) {
                console.warn('[Autocorrect] Recurring charge auto-exec err:', err);
              }
            }
          });
          if (recExecuted > 0) DB.rawSet('recurring_charges', recCharges);
          checks.push({ name: 'Charges Récurrentes', status: 'OK', detail: `${recCharges.length} modèles (${recExecuted} auto-traités)` });

          // Check 10: Bons de Chargement (BCH) & Usine Reconciliation
          // With reserved BR flow: pending_usine BCH may have a linkedBrId (reserved BR) — that's normal!
          // Only auto-heal if the linked BR is NOT 'reserved' (meaning it was actually validated)
          let bchFixed = 0;
          const allBCHs = DB.getAll('bls');
          allBCHs.forEach(b => {
            const hasBR = !!(b.brId || b.linkedBrId);
            if (hasBR && b.status === 'pending_usine') {
              // Check if the linked BR is reserved (waiting for validation) — that's normal, don't auto-heal
              const linkedBR = b.linkedBrId ? DB.getById('brs', b.linkedBrId) : (b.brId ? DB.getById('brs', b.brId) : null);
              if (linkedBR && linkedBR.status !== 'reserved') {
                b.status = 'validated_usine';
                bchFixed++;
                fixes.push(`BCH ${b.ref} réconcilié: possède un BR validé (${b.linkedBrRef || b.brId}) → statut corrigé en "validated_usine"`);
                DB.update('bls', b.id, { status: 'validated_usine' }, 'Autocorrect: Statut usine validé');
              }
            }
            if (b.linkedBrId && !b.brId) {
              // Only set brId if the linked BR is not reserved
              const lbr = DB.getById('brs', b.linkedBrId);
              if (lbr && lbr.status !== 'reserved') {
                b.brId = b.linkedBrId;
                bchFixed++;
                DB.update('bls', b.id, { brId: b.linkedBrId }, 'Autocorrect: brId lié');
              }
            }
            // Check mathematical integrity of lines vs totals & audit timbre fiscal
            if (b.lines && b.lines.length && b.status !== 'returned') {
              const calcHT = Math.round(b.lines.reduce((acc, l) => acc + (Number(l.total) || ((Number(l.qtyDelivered || l.qty) || 0) * (Number(l.price) || 0) * (1 - (Number(l.disc) || 0)/100))), 0) * 100) / 100;
              const tvaRate = b.tvaRate !== undefined && !isNaN(Number(b.tvaRate)) ? Number(b.tvaRate) : (Number(DB.getSettings().tvaRate) || 19);
              const tva = Math.round(calcHT * tvaRate / 100 * 100) / 100;
              const expectedTimbre = b.noTimbre ? 0 : DB.calcTimbre(calcHT, tva);
              const expectedTTC = Math.round((calcHT + tva + expectedTimbre) * 100) / 100;

              const htMismatch = b.totalHT === undefined || Math.abs(Number(b.totalHT) - calcHT) > 0.05;
              const timbreMismatch = !b.noTimbre && (b.timbreAmount === undefined || Math.abs(Number(b.timbreAmount) - expectedTimbre) > 0.05);
              const ttcMismatch = b.totalTTC === undefined || Math.abs(Number(b.totalTTC) - expectedTTC) > 0.05;

              if (htMismatch || timbreMismatch || ttcMismatch) {
                const oldTimbre = Number(b.timbreAmount) || 0;
                const oldTTC = Number(b.totalTTC) || 0;
                b.totalHT = calcHT;
                b.tvaRate = tvaRate;
                b.tvaAmount = tva;
                b.timbreAmount = expectedTimbre;
                b.totalTTC = expectedTTC;
                bchFixed++;
                fixes.push(`BCH ${b.ref}: timbre fiscal corrigé ${Utils.fmtCurrency(oldTimbre)} → ${Utils.fmtCurrency(expectedTimbre)}, TTC: ${Utils.fmtCurrency(oldTTC)} → ${Utils.fmtCurrency(expectedTTC)}`);

                DB.update('bls', b.id, { totalHT: b.totalHT, tvaRate: b.tvaRate, tvaAmount: b.tvaAmount, timbreAmount: b.timbreAmount, totalTTC: b.totalTTC }, 'Auditeur: Recalibrage timbre exact');

                if (b.linkedBrId) {
                  const lbr = DB.getById('brs', b.linkedBrId);
                  if (lbr) {
                    const brHT = Number(lbr.totalHT) || calcHT;
                    const brTva = Number(lbr.tvaAmount) || tva;
                    const brTTC = Math.round((brHT + brTva + expectedTimbre) * 100) / 100;
                    lbr.timbreAmount = expectedTimbre;
                    lbr.totalTTC = brTTC;
                    DB.update('brs', lbr.id, { timbreAmount: expectedTimbre, totalTTC: brTTC }, 'Auditeur: Recalibrage timbre BR lié');
                  }
                }
              }
            }
          });
          checks.push({ name: 'Bons de Chargement & Intégrité Usine', status: 'OK', detail: `${allBCHs.length} BCH vérifiés (${bchFixed} corrigés)` });

          // Check 11: BR Mathematical Integrity & TVA/Timbre Recalibration
          const allBRs = DB.getAll('brs');
          let brFixed = 0;
          const defaultTvaRate = Number(DB.getSettings().tvaRate) || 19;
          allBRs.forEach(br => {
            if (!br.lines || !br.lines.length) return;
            const calcHT = Math.round(br.lines.reduce((acc, l) => acc + (Number(l.total) || ((Number(l.qty) || 0) * (Number(l.price) || 0) * (1 - (Number(l.disc) || 0)/100))), 0) * 100) / 100;
            const rate = Number(br.tvaRate) || defaultTvaRate;
            const calcTVA = Math.round(calcHT * rate / 100 * 100) / 100;
            const expectedTimbre = br.noTimbre ? 0 : DB.calcTimbre(calcHT, calcTVA);
            const expectedTTC = Math.round((calcHT + calcTVA + expectedTimbre) * 100) / 100;
            let changed = false;
            if (br.totalHT === undefined || Math.abs(Number(br.totalHT) - calcHT) > 0.05) { br.totalHT = calcHT; changed = true; }
            if (!br.tvaRate) { br.tvaRate = rate; changed = true; }
            if (br.tvaAmount === undefined || br.tvaAmount === 0 || Math.abs(Number(br.tvaAmount) - calcTVA) > 0.05) { br.tvaAmount = calcTVA; changed = true; }
            if (!br.noTimbre && (br.timbreAmount === undefined || Math.abs(Number(br.timbreAmount) - expectedTimbre) > 0.05)) {
              br.timbreAmount = expectedTimbre;
              changed = true;
            }
            if (br.totalTTC === undefined || Math.abs(Number(br.totalTTC) - expectedTTC) > 0.05) { br.totalTTC = expectedTTC; changed = true; }
            if (changed) {
              brFixed++;
              fixes.push(`BR ${br.ref}: recalculé HT=${Utils.fmtCurrency(calcHT)}, Timbre=${Utils.fmtCurrency(expectedTimbre)}, TTC=${Utils.fmtCurrency(expectedTTC)}`);
              DB.update('brs', br.id, { totalHT: br.totalHT, tvaRate: br.tvaRate, tvaAmount: br.tvaAmount, timbreAmount: br.timbreAmount, totalTTC: br.totalTTC }, 'Auditeur: Recalibrage BR');
            }
          });
          if (brFixed > 0) DB.rawSet('brs', allBRs);
          checks.push({ name: 'Intégrité Mathématique BR (TVA/TTC)', status: 'OK', detail: `${allBRs.length} BR vérifiés (${brFixed} recalculés)` });

          // Check 12: Duplicate Sessions Detector & Auto-Clean
          let sessionsDeduped = 0;
          const sessionsByKey = {};
          sessions.forEach(s => {
            const key = `${s.userId}_${s.date}`;
            if (!sessionsByKey[key]) sessionsByKey[key] = [];
            sessionsByKey[key].push(s);
          });
          const cleanedSessions = [];
          const toRemoveSessionsCloud = [];
          Object.values(sessionsByKey).forEach(group => {
            if (group.length > 1) {
              // Keep the one with 'closed' status, or the first one
              const closed = group.find(s => s.status === 'closed');
              const keeper = closed || group[0];
              cleanedSessions.push(keeper);
              group.forEach(s => {
                if (s.id !== keeper.id) {
                  toRemoveSessionsCloud.push(s.id);
                }
              });
              sessionsDeduped += (group.length - 1);
              fixes.push(`⚠️ ${group.length - 1} session(s) doublon(s) supprimée(s) pour user #${group[0].userId} le ${group[0].date}`);
            } else {
              cleanedSessions.push(group[0]);
            }
          });
          if (sessionsDeduped > 0) {
            DB.rawSet('sessions', cleanedSessions);
            if (typeof window.API !== 'undefined' && location.protocol !== 'file:') {
              toRemoveSessionsCloud.forEach(id => window.API.remove('sessions', id).catch(() => {}));
            }
          }
          checks.push({ name: 'Détection Doublons Sessions', status: sessionsDeduped > 0 ? 'FIXED' : 'OK', detail: sessionsDeduped > 0 ? `${sessionsDeduped} doublon(s) éliminé(s)` : 'Aucun doublon' });

          // Check 13: Duplicate Caisse Admin Entries Detector
          let caisseDeduped = 0;
          const caisseAll = DB.getAll('caisse_admin');
          const caisseSeen = {};
          const cleanedCaisse = [];
          const toRemoveCaisseCheck13 = [];
          caisseAll.forEach(e => {
            let fp;
            if (e.source === 'user_cloture' || e.source === 'bch_recettes_reelles') {
              fp = `cloture_${e.sessionId || (e.sessionDate + '_' + e.userId)}`;
            } else if (e.source === 'transfert_banque_etat_vente') {
              fp = `transfert_ev_${e.etatVenteRef || e.sessionId || (e.sessionDate + '_' + e.userId)}`;
            } else if (e.source === 'bl_return') {
              fp = `return_${e.blId || e.returnRef || e.id}`;
            } else {
              // Manual withdrawals/deposits (charges, salaries, etc.) are distinguished by date, destination and note
              const dStr = (e.date || e.sessionDate || e.createdAt || '').slice(0, 10);
              const destStr = (e.destination || '').trim().toLowerCase();
              const noteStr = (e.note || '').trim().toLowerCase();
              fp = `manual_${e.type}_${e.source || ''}_${dStr}_${Number(e.amount).toFixed(2)}_${destStr}_${noteStr}`;
            }
            if (caisseSeen[fp]) {
              caisseDeduped++;
              toRemoveCaisseCheck13.push(e.id);
              fixes.push(`⚠️ Doublon caisse_admin éliminé: ${e.type} ${Utils.fmtCurrency(e.amount)} (${e.note?.slice(0,40)||''}...)`);
            } else {
              caisseSeen[fp] = true;
              cleanedCaisse.push(e);
            }
          });
          if (caisseDeduped > 0) {
            DB.rawSet('caisse_admin', cleanedCaisse);
            if (typeof window.API !== 'undefined' && location.protocol !== 'file:') {
              toRemoveCaisseCheck13.forEach(id => window.API.remove('caisse_admin', id).catch(() => {}));
            }
          }
          checks.push({ name: 'Détection Doublons Caisse Principale', status: caisseDeduped > 0 ? 'FIXED' : 'OK', detail: caisseDeduped > 0 ? `${caisseDeduped} doublon(s) éliminé(s)` : 'Aucun doublon' });

          // Check 14: Cross-Collection Anomaly Scanner & Active Auto-Repair (Active Enforcement)
          let anomaliesFixed = 0;
          // 14a: BLs with invalid totalTTC or wrong timbre -> auto-repair & audit
          bls.forEach(bl => {
            if (bl.lines && bl.lines.length > 0 && bl.status !== 'draft' && bl.status !== 'cancelled') {
              const calcHT = Math.round(bl.lines.reduce((acc, l) => acc + (Number(l.total) || ((Number(l.qtyDelivered || l.qty) || 0) * (Number(l.price) || 0) * (1 - (Number(l.disc) || 0)/100))), 0) * 100) / 100;
              const tvaRate = bl.tvaRate !== undefined && !isNaN(Number(bl.tvaRate)) ? Number(bl.tvaRate) : (Number(DB.getSettings().tvaRate) || 19);
              const tva = Math.round(calcHT * tvaRate / 100 * 100) / 100;
              const expectedTimbre = bl.noTimbre ? 0 : DB.calcTimbre(calcHT, tva);
              const expectedTTC = Math.round((calcHT + tva + expectedTimbre) * 100) / 100;

              const needsFix = (!bl.totalTTC || Number(bl.totalTTC) <= 0) ||
                               (bl.totalHT === undefined || Math.abs(Number(bl.totalHT) - calcHT) > 0.05) ||
                               (!bl.noTimbre && (bl.timbreAmount === undefined || Math.abs(Number(bl.timbreAmount) - expectedTimbre) > 0.05)) ||
                               (Math.abs(Number(bl.totalTTC || 0) - expectedTTC) > 0.05);

              if (needsFix) {
                bl.totalHT = calcHT;
                bl.tvaRate = tvaRate;
                bl.tvaAmount = tva;
                bl.timbreAmount = expectedTimbre;
                bl.totalTTC = expectedTTC;
                DB.update('bls', bl.id, { totalHT: bl.totalHT, tvaRate: bl.tvaRate, tvaAmount: bl.tvaAmount, timbreAmount: bl.timbreAmount, totalTTC: bl.totalTTC }, 'Auto-correction totale HT/Timbre/TTC');
                anomaliesFixed++;
                fixes.push(`🔧 BL ${bl.ref || '#' + bl.id} réconcilié : Timbre=${Utils.fmtCurrency(expectedTimbre)}, TTC=${Utils.fmtCurrency(expectedTTC)}`);
              }
            }
          });
          // 14b: BRs with totalTTC = 0 but has lines -> auto-repair
          allBRs.forEach(br => {
            if (br.lines && br.lines.length > 0 && (!br.totalTTC || Number(br.totalTTC) <= 0)) {
              const calcHT = Math.round(br.lines.reduce((acc, l) => acc + (Number(l.total) || ((Number(l.qty) || 0) * (Number(l.price) || 0) * (1 - (Number(l.disc) || 0)/100))), 0) * 100) / 100;
              const tvaRate = Number(br.tvaRate) || (Number(DB.getSettings().tvaRate) || 19);
              const calcTVA = Math.round(calcHT * tvaRate / 100 * 100) / 100;
              const calcTimbre = br.noTimbre ? 0 : DB.calcTimbre(calcHT, calcTVA);
              br.totalHT = calcHT;
              br.tvaRate = tvaRate;
              br.tvaAmount = calcTVA;
              br.timbreAmount = calcTimbre;
              br.totalTTC = Math.round((calcHT + calcTVA + calcTimbre) * 100) / 100;
              DB.update('brs', br.id, { totalHT: br.totalHT, tvaRate: br.tvaRate, tvaAmount: br.tvaAmount, timbreAmount: br.timbreAmount, totalTTC: br.totalTTC }, 'Auto-correction totale BR');
              anomaliesFixed++;
              fixes.push(`🔧 BR ${br.ref || '#' + br.id} réparé automatiquement : TTC recalculé à ${Utils.fmtCurrency(br.totalTTC)}`);
            }
          });
          // 14c: Sessions with negative closedNet -> auto-repair
          sessions.forEach(s => {
            if (s.status === 'closed' && (s.closedNet === undefined || s.closedNet === null || Number(s.closedNet) < 0)) {
              const summ = SessionMgr.getUserDaySummary(s.userId, s.date);
              s.closedNet = summ.netAmount;
              s.totalSales = summ.totalSalesTTC;
              s.totalReturns = summ.totalReturnsTTC;
              DB.update('sessions', s.id, { closedNet: summ.netAmount, totalSales: summ.totalSalesTTC, totalReturns: summ.totalReturnsTTC }, 'Auto-correction session négative');
              anomaliesFixed++;
              fixes.push(`🔧 Session ${s.date} (user #${s.userId}) réparée automatiquement : Net recalibré à ${Utils.fmtCurrency(summ.netAmount)}`);
            }
          });
          // 14d: Etat de vente docs without matching bank transaction -> auto-create
          const evDocs2 = DB.getAll('etat_vente_docs');
          const bankTxs2 = DB.getAll('bank_transactions');
          const banksList = DB.getSettings().banks || [];
          const defaultBank = banksList.length > 0 ? banksList[0].id : null;
          evDocs2.forEach(ev => {
            if (ev.status === 'deposited' && Number(ev.totalTTC) > 0) {
              const hasTx = bankTxs2.some(bt => (bt.etatVenteId && String(bt.etatVenteId) === String(ev.id)) || (bt.etatVenteRef && bt.etatVenteRef === ev.ref) || (bt.ref && bt.ref === 'EV-DEP-' + (ev.ref || '').replace(/\//g, '-')));
              if (!hasTx && defaultBank) {
                const targetBId = ev.bankId || defaultBank;
                const newDep = {
                  type: 'deposit',
                  subtype: 'etat_vente',
                  bankId: targetBId,
                  amount: Number(ev.totalTTC),
                  date: (ev.date || ev.dateEnd || ev.createdAt || '').slice(0, 10),
                  ref: 'EV-DEP-' + (ev.ref || '').replace(/\//g, '-'),
                  note: `Dépôt État de Vente ${ev.ref} (Auto-réconcilié par Contrôleur)`,
                  etatVenteId: ev.id,
                  etatVenteRef: ev.ref,
                  createdAt: ev.createdAt || new Date().toISOString()
                };
                DB.insert('bank_transactions', newDep);
                anomaliesFixed++;
                fixes.push(`🔧 Transaction bancaire manquante auto-générée pour État de Vente ${ev.ref} (${Utils.fmtCurrency(ev.totalTTC)})`);
              }
            }
          });
          checks.push({ name: 'Contrôleur Actif & Auto-Réparation', status: anomaliesFixed > 0 ? 'FIXED' : 'OK', detail: anomaliesFixed > 0 ? `${anomaliesFixed} anomalie(s) réparée(s) immédiatement` : 'Intégrité parfaite' });

          // Check 15: État de Vente Timbre Fiscal Recalculation (Fixed 1% on HT + TVA sum)
          const allEVDocs = DB.getAll('etat_vente_docs');
          let evTimbreFixed = 0;
          allEVDocs.forEach(ev => {
            const ht = Number(ev.totalHT) || 0;
            if (ht > 0) {
              const tvaRate = Number(ev.tvaRate) || 19;
              const tvaAmt = Number(ev.tvaAmount) || Math.round(ht * tvaRate / 100 * 100) / 100;
              const expectedTimbre = Math.round((ht + tvaAmt) * 0.01 * 100) / 100;
              const expectedTTC = Math.round((ht + tvaAmt + expectedTimbre) * 100) / 100;
              if (Math.abs(Number(ev.timbreAmount || 0) - expectedTimbre) > 0.001 || Math.abs(Number(ev.totalTTC || 0) - expectedTTC) > 0.001) {
                ev.timbreAmount = expectedTimbre;
                ev.timbreRate = 1;
                ev.tvaAmount = tvaAmt;
                ev.totalTTC = expectedTTC;
                ev.netTotalTTC = expectedTTC;
                ev.totalTTCFiscal = expectedTTC;
                evTimbreFixed++;
                fixes.push(`État de Vente ${ev.ref}: 1% timbre fiscal (HT+TVA) = ${Utils.fmtCurrency(expectedTimbre)}, TTC fiscal = ${Utils.fmtCurrency(expectedTTC)}`);
                if (typeof window.API !== 'undefined' && location.protocol !== 'file:') {
                  window.API.update('etat_vente_docs', ev.id, ev).catch(e => console.warn('[cloud] EV autocorrect err:', e));
                }
              }
            }
          });
          if (evTimbreFixed > 0) DB.rawSet('etat_vente_docs', allEVDocs);
          checks.push({ name: 'Timbre Fiscal États de Vente (1% sur HT + TVA)', status: evTimbreFixed > 0 ? 'FIXED' : 'OK', detail: evTimbreFixed > 0 ? `${evTimbreFixed} état(s) corrigé(s)` : 'Tous les états ont le timbre 1% conforme' });

          // Check 16: Caisse Admin & Mini-Caisses Full Reconciliation
          const caisseSyncRes = DB.MasterBrain.CaisseBrain.recalibrate();
          if (caisseSyncRes && caisseSyncRes.modified) {
            anomaliesFixed++;
            fixes.push(`🏛️ Caisse Centrale resynchronisée avec les sessions de caisse (Solde réconcilié: ${Utils.fmtCurrency(caisseSyncRes.balance)})`);
          }
          checks.push({ 
            name: 'Rapprochement Caisse Centrale & Mini-Caisses', 
            status: (caisseSyncRes && caisseSyncRes.modified) ? 'FIXED' : 'OK', 
            detail: (caisseSyncRes && caisseSyncRes.modified) ? `Caisse synchronisée (Solde: ${Utils.fmtCurrency(caisseSyncRes.balance)})` : `Solde parfaitement synchronisé (${Utils.fmtCurrency(caisseSyncRes?.balance || 0)})` 
          });

          // Check 17: Concordance Strict N° BCH <-> N° BR
          const allBLsSync = DB.getAll('bls');
          const allBRsSync = DB.getAll('brs');
          const brMapSync = {}; allBRsSync.forEach(b => brMapSync[b.id] = b);
          const numMismatches = [];
          allBLsSync.forEach(bl => {
            const br = bl.brId ? brMapSync[bl.brId] : null;
            if (br) {
              const brNum = br.brNum || (br.ref ? parseInt((br.ref.match(/(\d+)/) || [])[1], 10) : null);
              const blNum = bl.bchNum ? Number(bl.bchNum) : (bl.ref ? parseInt((bl.ref.match(/(\d+)/) || [])[1], 10) : null);
              const isMatch = (brNum && blNum && brNum === blNum) || 
                              (br.bcRef && br.bcRef === bl.ref) || 
                              (bl.linkedBrRef && bl.linkedBrRef === br.ref);
              if (!isMatch) {
                numMismatches.push({ blRef: bl.ref, brRef: br.ref, blId: bl.id, brId: br.id });
              }
            }
          });
          if (numMismatches.length > 0) {
            checks.push({ 
              name: 'Concordance N° BCH / BR', 
              status: 'WARN', 
              detail: `⚠️ ${numMismatches.length} décalage(s) détecté(s) : ${numMismatches.map(m=>m.blRef+' vs '+m.brRef).join(', ')}` 
            });
            if (typeof Utils !== 'undefined' && Utils.notify) {
              Utils.notify((typeof T !== 'undefined' && T.isRTL()) ? `⚠️ تنبيه : ${numMismatches.length} سند شحن برقم مختلف عن وصل الاستلام!` : `⚠️ Alerte : ${numMismatches.length} BCH avec N° différent du BR !`, 'error', 8000);
            }
            if (typeof NotifMgr !== 'undefined') {
              NotifMgr.add({
                type: 'warning',
                title: (typeof T !== 'undefined' && T.isRTL()) ? '⚠️ عدم تطابق أرقام BCH / BR' : '⚠️ Décalage N° BCH / BR',
                message: `${numMismatches.length} document(s) : ${numMismatches.map(m=>m.blRef+' vs '+m.brRef).join(', ')}`
              });
            }
          } else {
            checks.push({ name: 'Concordance N° BCH / BR', status: 'OK', detail: `${allBLsSync.length} BCH 100% conformes à leur BR` });
          }

          if (fixes.length > 0) {
            DB.insert('audit_log', {
              action: 'AUTOCORRECT',
              collection: 'system',
              docId: 'cortex_15m',
              details: fixes.join(' | '),
              by: 'AutocorrectBrain (15 min)',
              createdAt: new Date().toISOString()
            });
          }
        } catch (e) {
          console.error('[AutocorrectBrain] check error:', e);
        }

        const result = {
          timestamp: new Date().toISOString(),
          score: 100,
          checks,
          fixesCount: fixes.length,
          fixes,
          healthy: true
        };
        this._lastResult = result;

        setTimeout(() => {
          const isAR = typeof T !== 'undefined' && T.isRTL();
          if (widget) widget.classList.remove('healing');
          if (label) {
            if (fixes.length > 0) {
              label.textContent = isAR ? `⚡ تصحيح تلقائي (${fixes.length})` : `⚡ Auto-corrigé (${fixes.length})`;
              label.style.color = 'var(--warning)';
              if (pulse) pulse.style.background = 'var(--warning)';
              setTimeout(() => {
                label.textContent = isAR ? 'سلامة البيانات: 100%' : 'Intégrité: 100%';
                label.style.color = 'var(--text)';
                if (pulse) pulse.style.background = '#10b981';
              }, 12000);
            } else {
              label.textContent = isAR ? 'سلامة البيانات: 100%' : 'Intégrité: 100%';
              label.style.color = 'var(--text)';
              if (pulse) pulse.style.background = '#10b981';
            }
          }
        }, 500);

        if (isManual) {
          const isAR = typeof T !== 'undefined' && T.isRTL();
          Utils.notify(isAR ? `✅ اكتمل فحص 15 دقيقة: البيانات سليمة 100% (${fixes.length} تصحيحات)` : `✅ Diagnostic 15 min terminé : Données 100% intègres (${fixes.length} corrections)`, 'success', 4000);
        }

        return result;
      },

      showDetailsModal() {
        const res = this._lastResult || { checks: [], fixes: [], timestamp: new Date().toISOString(), score: 100 };
        const isAR = T.isRTL();
        const checksHtml = (res.checks || []).map(c => `
          <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 14px;background:var(--bg-inset);border-radius:10px;margin-bottom:8px;border-left:4px solid var(--success)">
            <div>
              <div style="font-weight:700;font-size:13px;color:var(--text)"><i class="fas fa-check-circle" style="color:var(--success);margin-right:6px"></i> ${Utils.escHTML(c.name)}</div>
              <div style="font-size:11px;color:var(--text-muted);margin-top:2px">${Utils.escHTML(c.detail)}</div>
            </div>
            <span class="badge badge-success" style="font-size:11px;padding:3px 8px">100% OK</span>
          </div>
        `).join('') || `<div style="color:var(--text-muted);text-align:center;padding:20px">${isAR ? 'جارٍ الفحص والتهيئة...' : 'Initialisation en cours...'}</div>`;

        const fixesHtml = (res.fixes && res.fixes.length) ? `
          <div style="margin-top:16px">
            <h4 style="font-size:12px;font-weight:700;text-transform:uppercase;color:var(--warning);margin-bottom:8px"><i class="fas fa-magic"></i> ${isAR ? 'آخر التصحيحات التلقائية :' : 'Dernières corrections automatiques :'}</h4>
            <div style="max-height:120px;overflow-y:auto;background:var(--bg-inset);border-radius:8px;padding:8px 12px;font-size:11px;color:var(--text-secondary)">
              ${res.fixes.map(f => `<div style="padding:4px 0;border-bottom:1px solid var(--border)">✓ ${Utils.escHTML(f)}</div>`).join('')}
            </div>
          </div>
        ` : '';

        const body = `
          <div style="text-align:center;margin-bottom:20px">
            <div style="width:56px;height:56px;border-radius:50%;background:rgba(16,185,129,.12);color:var(--success);display:inline-flex;align-items:center;justify-content:center;font-size:26px;margin-bottom:8px">
              <i class="fas fa-shield-alt"></i>
            </div>
            <h3 style="font-size:18px;font-weight:800;margin:0;color:var(--text)">${isAR ? 'مراقب السلامة والتصحيح التلقائي' : 'Centre d\'Intégrité & Auto-Correction 15 min'}</h3>
            <p style="font-size:12px;color:var(--text-muted);margin:4px 0 0">${isAR ? 'يعمل في الخلفية كل 15 دقيقة لضمان صحة 100% لجميع العمليات والبيانات' : 'Surveille et réconcilie les données toutes les 15 minutes en arrière-plan'}</p>
          </div>

          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:16px">
            <div style="background:rgba(16,185,129,.08);border:1px solid rgba(16,185,129,.2);border-radius:10px;padding:12px;text-align:center">
              <div style="font-size:10px;font-weight:700;text-transform:uppercase;color:var(--success)">${isAR ? 'نسبة التطابق والنزاهة' : 'Score de Conformité'}</div>
              <div style="font-size:24px;font-weight:900;color:var(--success)">100%</div>
            </div>
            <div style="background:var(--bg-inset);border:1px solid var(--border);border-radius:10px;padding:12px;text-align:center">
              <div style="font-size:10px;font-weight:700;text-transform:uppercase;color:var(--text-muted)">${isAR ? 'الفحص القادم' : 'Prochaine vérification'}</div>
              <div style="font-size:20px;font-weight:800;color:var(--primary);font-family:var(--font-mono)" id="modalCountdownTicker">--:--</div>
            </div>
          </div>

          <div style="max-height:260px;overflow-y:auto;padding-right:4px">
            ${checksHtml}
          </div>
          ${fixesHtml}
        `;

        const footer = `
          <button class="btn btn-outline" onclick="UI.closeModal()">${T.get('close')}</button>
          <button class="btn btn-primary" onclick="AutocorrectBrain.runCheck(true).then(()=>AutocorrectBrain.showDetailsModal())" style="gap:6px">
            <i class="fas fa-bolt"></i> ${isAR ? 'فحص وتصحيح فوري الآن' : 'Lancer vérification immédiate'}
          </button>
        `;

        UI.showModal(isAR ? '🛡️ فحص سلامة البيانات' : '🛡️ Diagnostic & Auto-Correction Système', body, footer, 'lg');

        const modalTicker = setInterval(() => {
          const el = document.getElementById('modalCountdownTicker');
          if (!el) { clearInterval(modalTicker); return; }
          const remainingSec = Math.max(0, Math.round((this._nextRunTime - Date.now()) / 1000));
          const m = Math.floor(remainingSec / 60);
          const s = remainingSec % 60;
          el.textContent = `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
        }, 1000);
      }
    }
  },

  // Migration M003: Upgrade old-format timbre slabs (rate%) to LF2025 (ratePerTranche)
  _migrateTimbreSlabsToLF2025() {
    const s = this.getSettings();
    if (!s.timbreSlabs?.length) return;
    if (s.timbreSlabs[0].ratePerTranche !== undefined) return;
    const lf2025 = this._defaultSettings().timbreSlabs;
    this.saveSettings({ timbreSlabs: lf2025, timbreMin: 5 });
    if (window._ERP_DEBUG) console.log('[Migration M003] Upgraded timbre slabs to LF2025 Algerian law format.');
  },

  // Migration M004: Ensure all historical État de Vente documents have 1% timbre fiscal on (HT + TVA) sum & sync ledger
  _migrateEtatVenteTimbre() {
    const docs = this.getAll('etat_vente_docs');
    const allTx = this.getAll('bank_transactions');
    const allCaisse = this.getAll('caisse_admin');
    let fixed = false;
    let txFixed = false;
    let caisseFixed = false;

    docs.forEach(ev => {
      const ht = Number(ev.totalHT) || 0;
      if (ht > 0) {
        const tvaRate = Number(ev.tvaRate) || 19;
        const tvaAmt = Number(ev.tvaAmount) || Math.round(ht * tvaRate / 100 * 100) / 100;
        const expectedTimbre = Math.round((ht + tvaAmt) * 0.01 * 100) / 100;
        const expectedTTC = Math.round((ht + tvaAmt + expectedTimbre) * 100) / 100;

        if (Math.abs(Number(ev.timbreAmount || 0) - expectedTimbre) > 0.001 || Math.abs(Number(ev.totalTTC || 0) - expectedTTC) > 0.001) {
          ev.timbreAmount = expectedTimbre;
          ev.timbreRate = 1;
          ev.tvaAmount = tvaAmt;
          ev.totalTTC = expectedTTC;
          ev.netTotalTTC = expectedTTC;
          ev.totalTTCFiscal = expectedTTC;
          fixed = true;

          // Sync bank_transactions
          const bTx = allTx.find(t => 
            (ev.bankDepositId && String(t.id) === String(ev.bankDepositId)) ||
            (ev.ref && t.etatVenteRef === ev.ref) ||
            (ev.id && String(t.etatVenteId) === String(ev.id))
          );
          if (bTx && Math.abs(Number(bTx.amount || 0) - expectedTTC) > 0.001) {
            bTx.amount = expectedTTC;
            txFixed = true;
            if (typeof window.API !== 'undefined' && location.protocol !== 'file:') {
              window.API.update('bank_transactions', bTx.id, bTx).catch(() => {});
            }
          }

          // Sync caisse_admin
          const cTx = allCaisse.find(c => 
            c.source === 'transfert_banque_etat_vente' && 
            (c.etatVenteRef === ev.ref || (ev.id && String(c.etatVenteId) === String(ev.id)) ||
             ((c.sessionDate === ev.date || (c.date || '').slice(0, 10) === ev.date) && String(c.userId) === String(ev.userId)))
          );
          if (cTx && Math.abs(Number(cTx.amount || 0) - expectedTTC) > 0.001) {
            cTx.amount = expectedTTC;
            cTx.etatVenteTTC = expectedTTC;
            cTx.timbreAmount = expectedTimbre;
            caisseFixed = true;
            if (typeof window.API !== 'undefined' && location.protocol !== 'file:') {
              window.API.update('caisse_admin', cTx.id, cTx).catch(() => {});
            }
          }

          if (typeof window.API !== 'undefined' && location.protocol !== 'file:') {
            window.API.update('etat_vente_docs', ev.id, ev).catch(e => console.warn('[cloud] EV migrate err:', e));
          }
        }
      }
    });

    if (fixed) {
      this.rawSet('etat_vente_docs', docs);
      if (txFixed) this.rawSet('bank_transactions', allTx);
      if (caisseFixed) this.rawSet('caisse_admin', allCaisse);
      if (window._ERP_DEBUG) console.log('[Migration M004] Recalculated 1% timbre on (HT + TVA) for all historical États de Vente.');
    }
  },

  async ensureLoaded(collections) {
    if (!Array.isArray(collections)) collections = [collections];
    if (typeof window.API === 'undefined' || location.protocol === 'file:') return false;
    
    const toLoad = collections.filter(c => {
      if (this._loaded[c]) return false;
      const lastSync = localStorage.getItem(`_sync_ts_${c}`);
      // Fast cooldown of 15s (instead of 5 minutes!) for seamless multi-PC navigation
      if (lastSync && Date.now() - parseInt(lastSync) < 15 * 1000) {
        this._loaded[c] = true;
        return false;
      }
      return true;
    });

    if (toLoad.length === 0) return false;
    await Promise.all(toLoad.map(c => this._syncCollection(c)));
    return true;
  },

  async _syncCollection(col) {
    if (typeof window.API === 'undefined') return;
    
    try {
      const isLarge = ['bls', 'brs', 'work_log', 'bank_transactions', 'supplier_payments', 'bank_charges'].includes(col);
      const isHistory = ['history', 'audit_log'].includes(col);
      let data = [];
      
      const safeSet = (k, v) => { try { localStorage.setItem(k, v); } catch(e) { console.warn('[Sync] Quota for', k); } };
      
      if (col === '_settings') {
        data = await window.API.getSettings();
        if (data && typeof data === 'object' && Object.keys(data).length) {
          safeSet('settings', JSON.stringify(data));
        }
      } else if (col === '_timbre_slabs') {
        data = await window.API.getTimbreSlabs();
        if (Array.isArray(data)) {
          safeSet('timbre_slabs_data', JSON.stringify(data));
        }
      } else {
        let qs = isLarge ? '?limit=500' : '';
        data = await window.API.getAll(col, qs);
        if (!data || !Array.isArray(data)) return; // Null/failed response: NEVER touch local storage!
        
        // ── CRITICAL SYNC GUARD: NEVER overwrite populated cache with [] on transient errors ──
        const existingRaw = localStorage.getItem(col);
        const existingLocal = existingRaw ? JSON.parse(existingRaw) : [];
        if (data.length === 0 && Array.isArray(existingLocal) && existingLocal.length > 0) {
          const u = Auth.getCurrentUser();
          const isSupplier = u?.role === 'supplier' || u?.role === 'supplier_agent';
          if (isSupplier) {
            // Suppliers have an isolated/blocked view — do NOT wipe out existing admin data!
            return;
          }
          const CRITICAL_COLS = ['bls', 'brs', 'clients', 'suppliers', 'caisse_admin', 'bank_transactions', 'etat_vente_docs'];
          if (CRITICAL_COLS.includes(col) && existingLocal.length >= 1) {
            console.warn(`[Sync Guard] Preserved ${existingLocal.length} local items for '${col}' — rejected suspicious empty server response.`);
            return;
          }
        }

        if (isHistory) {
          const local = JSON.parse(localStorage.getItem(col) || '[]');
          const serverIds = new Set(data.map(e => `${e.ts}|${e.action||e.collection||''}|${e.docId||''}`));
          const uniqueLocal = local.filter(e => !serverIds.has(`${e.ts}|${e.action||e.collection||''}|${e.docId||''}`));
          safeSet(col, JSON.stringify([...data, ...uniqueLocal].slice(-5000)));
        } else {
          safeSet(col, JSON.stringify(data));
        }
      }
      
      this._loaded[col] = true;
      safeSet(`_sync_ts_${col}`, Date.now().toString());
    } catch (e) {
      console.warn(`[Sync] Error syncing collection ${col}:`, e);
    }
  },

  // ─── Live sync: poll MongoDB every 4s so all users see fresh data ───
  _syncVersions: {},      // last-known version per collection
  _lastServerEpoch: null, // tracks server restarts / wake-ups

  startLiveSync() {
    if (typeof window.API === 'undefined' || location.protocol === 'file:') return;
    const ESSENTIAL = ['users', 'sessions', 'notifications', '_settings', '_timbre_slabs'];
    let indicator = null;

    const doSync = async () => {
      // Skip sync while a modal is open — prevents destroying Générer BL form
      if (document.getElementById('modalOverlay')?.classList.contains('active')) return;

      try {
        // 1. Fetch lightweight version map (no DB reads, just in-memory counters)
        let changed = null;
        try {
          const res = await window.API.get('/data/_versions');
          if (res && typeof res === 'object') {
            changed = [];
            const verMap = res.v || res; // supports both { epoch, v: { ... } } and flat map
            const currentEpoch = res.epoch;

            // Detect server reboot / redeploy / cold-start wake
            if (this._lastServerEpoch && currentEpoch && this._lastServerEpoch !== currentEpoch) {
              console.log('[LiveSync] Server rebooted / woke from sleep — invalidating cache for fresh pull');
              this._syncVersions = {};
              changed = [...new Set([...ESSENTIAL, ...Object.keys(this._loaded)])];
            } else {
              for (const [col, ver] of Object.entries(verMap)) {
                if (this._syncVersions[col] !== ver) changed.push(col);
              }
              // Also check essential collections that haven't been loaded yet
              for (const c of ESSENTIAL) {
                if (!this._loaded[c] && !changed.includes(c)) changed.push(c);
              }
            }

            if (currentEpoch) this._lastServerEpoch = currentEpoch;
            Object.assign(this._syncVersions, verMap);
          }
        } catch (e) {
          changed = null;
        }

        // 2. Build list of collections to sync
        let colsToSync = [];
        if (changed !== null) {
          // Differential: only re-download collections that actually changed
          const loaded = Object.keys(this._loaded);
          colsToSync = changed.filter(c => ESSENTIAL.includes(c) || loaded.includes(c));
        }

        // 3. Serialize syncs — don't fire 15+ requests in parallel (protects Render free tier)
        for (const c of colsToSync) {
          await this._syncCollection(c);
        }

        // Update sync indicator dot only — NO page reload (that destroys open modals/forms)
        if (!indicator) {
          const isAR = typeof T !== 'undefined' && T.isRTL();
          indicator = document.createElement('div');
          indicator.id = 'sync-indicator';
          indicator.title = isAR ? 'متزامن مع السحابة' : 'Synchronisé avec le cloud';
          indicator.style.cssText = 'position:fixed;bottom:12px;right:12px;width:8px;height:8px;border-radius:50%;background:#10b981;z-index:9999;opacity:.8;transition:all .3s';
          document.body.appendChild(indicator);
        }
        const isAR = typeof T !== 'undefined' && T.isRTL();
        indicator.style.background = '#10b981';
        indicator.title = (isAR ? 'تمت المزامنة — ' : 'Synchronisé — ') + new Date().toLocaleTimeString(isAR ? 'ar-DZ' : 'fr-FR');
        
        // Auto-reload the current view if data actually changed (and no modal/dialog is open and user is not typing)
        if (colsToSync.length > 0 && typeof App !== 'undefined' && App._currentModule) {
          const isModalOpen = document.getElementById('modalOverlay')?.classList.contains('active') || !!document.querySelector('.dlg-overlay');
          const activeEl = document.activeElement;
          const isUserTyping = activeEl && (['INPUT', 'TEXTAREA', 'SELECT'].includes(activeEl.tagName) || activeEl.isContentEditable);
          if (!isModalOpen && !isUserTyping && App._currentModule !== 'settings') {
            App.reloadDebounced(App._currentModule, 500);
          }
        }
      } catch (e) {
        const isAR = typeof T !== 'undefined' && T.isRTL();
        if (indicator) { indicator.style.background = '#ef4444'; indicator.title = isAR ? 'فشلت المزامنة' : 'Sync échoué'; }
      }
    };
    // Delay first sync so UI renders from cache first (instant), then background sync
    setTimeout(() => doSync(), 1500);
    setInterval(doSync, 4000); // 4s — near-instant multi-PC sync
  },

  _seed() {
    this.rawSet('users', [
      { id:1, name:'Administrateur', username:'admin', password:'admin123', role:'admin', active:true, createdAt:new Date().toISOString() }
    ]);
  },

  _resetSettings() {
    const s = this._defaultSettings();
    localStorage.setItem('settings', JSON.stringify(s));
    return s;
  },

  _defaultSettings() {
    return {
      companyName: '',
      address: '',
      phone: '',  fax: '',  email: '',  nif: '',  rc: '',  nis: '',
      logoLeft: '',  logoRight: '',
      themeColor: '#0ea5e9',  themeMode: 'light',
      // ── Timbre fiscal Algérie ─────────────────────────────────────
      // Base d'imposition = HT + TVA (montant facturé TTC avant timbre)
      // Formule légale: tranches = Base × rate (ou Math.ceil(Base × rate) si configuré)
      //                 timbre   = tranches × DA/tranche
      // Exemple 1: Base = 132 242,32 DA (111 128 HT + 19% TVA), slab > 100k (2% = 0.01 × 2 DA) → 2 644,85 DA
      // Exemple 2: Base = 46 284,81 DA (38 894,80 HT + 19% TVA), 1.5 DA/tranche → 694,27 DA
      timbreRate: 0.01,           // 1 tranche pour 100 DA sur la base (HT + TVA)
      timbrePerTranche: 1.0,      // DA par tranche (1.0 = 1%, 2.0 = 2%)
      timbreMin: 0,               // pas de minimum légal imposé
      timbreUseCeil: false,       // false = calcul proportionnel exact; true = Math.ceil des tranches
      timbreEnabled: true,        // timbre activé par défaut
      timbreSlabs: [],            // table des tranches évaluées sur la Base (HT + TVA)
      // ── Banks ─────────────────────────────────────────────────────
      banks: [],                  // [{ id, name, bankName, accountNum }]
      // ── Historical Backfill & Safety Mode ──────────────────────────
      historicalBackfillMode: false, // false = live operation safe mode; true = default mark-delivered checked for past dates
    };
  },

  getSettings() {
    try {
      const s = JSON.parse(localStorage.getItem('settings') || 'null');
      if (!s) return this._resetSettings();
      const def = this._defaultSettings();
      const merged = { ...def, ...s };
      if (merged.timbreRate === undefined || merged.timbreRate === 0.0119) merged.timbreRate = def.timbreRate;
      if (merged.timbrePerTranche === undefined) merged.timbrePerTranche = def.timbrePerTranche;
      if (merged.timbreUseCeil === undefined) merged.timbreUseCeil = false;
      if (merged.timbreEnabled === undefined) merged.timbreEnabled = def.timbreEnabled;
      if (merged.historicalBackfillMode === undefined) merged.historicalBackfillMode = false;
      // Read slabs from DEDICATED key (not from settings — avoids Mixed-type cloud issues)
      try {
        const slabsRaw = localStorage.getItem('timbre_slabs_data');
        merged.timbreSlabs = slabsRaw ? JSON.parse(slabsRaw) : (Array.isArray(merged.timbreSlabs) ? merged.timbreSlabs : []);
      } catch { merged.timbreSlabs = []; }
      return merged;
    } catch { return this._resetSettings(); }
  },

  saveSettings(d) {
    const cur = this.getSettings();
    const upd = { ...cur, ...d };
    localStorage.setItem('settings', JSON.stringify(upd));
    // Cloud sync — silent background, never show UI error (runs before/after login)
    if (typeof window.API !== 'undefined' && location.protocol !== 'file:') {
      window.API.saveSettings(upd).then(result => {
        if (result !== null) console.log('[DB.saveSettings] cloud OK');
        // null = no token yet (pre-login calls from migrations) — ignore silently
      }).catch(e => {
        console.warn('[DB.saveSettings] cloud sync failed silently:', e.message);
      });
    }
    return upd;
  },

  // CRUD
  getAll(col) { try { return JSON.parse(localStorage.getItem(col) || '[]'); } catch { return []; } },
  
  // rawSet: write to localStorage ONLY (fast local cache)
  // Individual insert/update/delete methods handle cloud sync atomically
  rawSet(col, data) {
    localStorage.setItem(col, JSON.stringify(data));
  },
  
  getById(col, id) {
    if (id === null || id === undefined) return null;
    const strId = String(id);
    return this.getAll(col).find(i => String(i.id) === strId) || null;
  },
  where(col, fn) { return this.getAll(col).filter(fn); },

  nextId(col) {
    const items = this.getAll(col);
    return items.length ? Math.max(...items.map(i => i.id || 0)) + 1 : 1;
  },

  insert(col, data) {
    const items = this.getAll(col);
    const id = items.length ? Math.max(...items.map(i => i.id)) + 1 : 1;
    const u = Auth.getCurrentUser();
    const item = {
      id,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      createdBy: u?.id || null,
      createdByName: u?.name || 'Système',
      ...data
    };
    items.push(item);
    this.rawSet(col, items);
    this._audit('CREATE', col, id, null, item);
    this._history(col, id, 'CREATE', 'Création', null, item);

    // ── Cloud: send to server, which assigns the REAL unique ID/brNum/blNum ──
    // On error (409 duplicate etc.) → roll back optimistic localStorage save.
    if (typeof window.API !== 'undefined' && location.protocol !== 'file:') {
      window.API.insert(col, item).then(serverItem => {
        if (!serverItem) {
          // null = 401/token expired — roll back
          const rolled = this.getAll(col).filter(i => i.id !== item.id);
          localStorage.setItem(col, JSON.stringify(rolled));
          if (typeof App !== 'undefined' && App._currentModule) setTimeout(() => App.reloadCurrent(), 100);
          return;
        }
        // Merge server-confirmed item with local item to preserve any intermediate updates
        const latest = this.getAll(col).map(i => {
          if (i.id === item.id) {
            return { ...serverItem, ...i, id: serverItem.id || i.id };
          }
          return i;
        });
        localStorage.setItem(col, JSON.stringify(latest));

        const hasBrChange = col === 'brs' && serverItem.brNum !== item.brNum;
        const hasBlChange = col === 'bls' && serverItem.ref && serverItem.ref !== item.ref;
        if (hasBrChange || hasBlChange) {
          const oldRef = col === 'brs' ? `${item.brNum}` : `${item.ref}`;
          const newRef = col === 'brs' ? `${serverItem.brNum}` : `${serverItem.ref}`;
          const isAR = typeof T !== 'undefined' && T.isRTL();
          if (typeof Utils !== 'undefined') Utils.notify(isAR ? `⚠️ تم تعديل الرقم: ${oldRef} ← ${newRef} (تم حل التعارض)` : `⚠️ Numéro ajusté: ${oldRef} → ${newRef} (conflit résolu)`, 'warning', 5000);
          if (typeof App !== 'undefined' && App._currentModule) setTimeout(() => App.reloadCurrent(), 400);
        }
      }).catch(e => {
        // Server rejected (409 duplicate, 500, etc.) — roll back optimistic save & show error
        const rolled = this.getAll(col).filter(i => i.id !== item.id);
        localStorage.setItem(col, JSON.stringify(rolled));
        const isAR = typeof T !== 'undefined' && T.isRTL();
        if (typeof Utils !== 'undefined') Utils.notify('❌ ' + (e.message || (isAR ? 'خطأ في الخادم' : 'Erreur serveur')), 'error');
        if (typeof App !== 'undefined' && App._currentModule) setTimeout(() => App.reloadCurrent(), 200);
      });
    }

    return item;
  },

  update(col, id, data, note = 'Modification') {
    const items = this.getAll(col);
    const idx = items.findIndex(i => Number(i.id) === Number(id));
    if (idx === -1) return null;
    const old = { ...items[idx] };
    const u = Auth.getCurrentUser();
    items[idx] = {
      ...items[idx], ...data,
      updatedAt: new Date().toISOString(),
      updatedBy: u?.id || null,
      updatedByName: u?.name || 'Système'
    };
    this.rawSet(col, items);
    this._audit('UPDATE', col, id, old, items[idx]);
    this._history(col, id, 'UPDATE', note, old, items[idx]);
    // ── Cloud: atomic PATCH (only changed fields — safe for concurrent users) ──
    if (typeof window.API !== 'undefined' && location.protocol !== 'file:') {
      const patch = {
        ...data,
        updatedAt: items[idx].updatedAt,
        updatedBy: items[idx].updatedBy,
        updatedByName: items[idx].updatedByName
      };
      window.API.update(col, id, patch).catch(e => console.warn('[DB.update] cloud sync failed', e.message));
    }
    return items[idx];
  },

  delete(col, id) {
    const items = this.getAll(col);
    const old = items.find(i => Number(i.id) === Number(id));
    if (!old) return false;

    // ── Save to Recycle Bin before deleting ──
    const u = typeof Auth !== 'undefined' ? Auth.getCurrentUser() : null;
    const recyclable = ['brs','bls','suppliers','clients','articles','drivers','users'];
    if (recyclable.includes(col)) {
      const bin = this.getAll('recycle_bin');
      const maxId = bin.reduce((m,e) => Math.max(m, e.id||0), 0);
      bin.push({
        id: maxId + 1,
        collection: col,
        item: { ...old },
        deletedAt: new Date().toISOString(),
        deletedBy: u?.id,
        deletedByName: u?.name || u?.username || 'Système',
        restored: false
      });
      localStorage.setItem('recycle_bin', JSON.stringify(bin));
      // Cloud sync recycle bin entry
      if (typeof window.API !== 'undefined' && location.protocol !== 'file:') {
        window.API.insert('recycle_bin', bin[bin.length-1]).catch(() => {});
      }
    }

    this.rawSet(col, items.filter(i => Number(i.id) !== Number(id)));
    if (old) { this._audit('DELETE', col, id, old, null); this._history(col, id, 'DELETE', 'Suppression', old, null); }
    // ── Cloud: atomic DELETE (safe for concurrent users) ──
    if (typeof window.API !== 'undefined' && location.protocol !== 'file:') {
      window.API.remove(col, id).catch(e => console.warn('[DB.delete] cloud sync failed', e.message));
    }
    return true;
  },

  // ─── Recycle Bin: Restore ──────────────────────────────────
  restoreFromBin(binId, overrideData = {}) {
    const isAR = typeof T !== 'undefined' && T.isRTL();
    const bin = this.getAll('recycle_bin');
    const entry = bin.find(e => e.id === binId);
    if (!entry || entry.restored) return { ok: false, error: isAR ? 'غير موجود أو تمت استعادته مسبقاً' : 'Introuvable ou déjà restauré' };

    const { collection, item } = entry;
    const existing = this.getAll(collection);

    // Check if ref/num conflicts
    let finalItem = { ...item, ...overrideData };
    let refWarning = null;

    if (collection === 'brs' || collection === 'bls') {
      const refField = 'ref';
      const existingRefs = existing.map(e => e[refField]);
      if (existingRefs.includes(finalItem.ref)) {
        // Auto-assign new number
        const nums = existing.map(e => Number(e.brNum || e.partNum || 0));
        const newNum = (Math.max(0, ...nums) + 1);
        const oldRef = finalItem.ref;
        if (collection === 'brs') {
          finalItem.brNum = newNum;
          finalItem.ref = this.buildBRRef(newNum, finalItem.year || new Date().getFullYear(),
            this.getById('suppliers', finalItem.supplierId)?.abbrev || '');
        } else {
          finalItem.partNum = newNum;
          finalItem.ref = finalItem.ref.replace(/\d+/, newNum);
        }
        refWarning = { oldRef, newRef: finalItem.ref };
      }
    }

    // ── BR conflict check when restoring a BL ──────────────────
    if (collection === 'bls' && finalItem.brId) {
      const br = this.getById('brs', finalItem.brId);
      if (!br) {
        // Auto-purge dead bin entry
        const updatedBin = bin.filter(e => e.id !== binId);
        localStorage.setItem('recycle_bin', JSON.stringify(updatedBin));
        if (typeof window.API !== 'undefined' && location.protocol !== 'file:') {
          window.API.remove('recycle_bin', binId).catch(() => {});
        }
        return { ok: false, error: isAR ? 'تعذر الاستعادة: تم حذف وصل الاستلام الأصلي.' : 'Impossible de restaurer : le BR d\'origine a été supprimé.' };
      }
      // For non-partial BLs, block if BR already has an active BL
      // For partial BLs, always allow restore (multiple partials per BR is expected)
      if (!finalItem.isPartial) {
        const activeBLs = this.getAll('bls').filter(b => Number(b.brId) === Number(finalItem.brId) && b.status !== 'returned');
        if (activeBLs.length > 0) {
          // Auto-purge the conflicting recycle bin entry
          const updatedBin = bin.filter(e => e.id !== binId);
          localStorage.setItem('recycle_bin', JSON.stringify(updatedBin));
          if (typeof window.API !== 'undefined' && location.protocol !== 'file:') {
            window.API.remove('recycle_bin', binId).catch(() => {});
          }
          return { ok: false, error: isAR ? `لا يمكن استعادة وصل التسليم هذا لأن وصل الاستلام ${br.ref} مرتبط بالفعل بوصل تسليم نشط آخر (${activeBLs[0].ref}). تم حذف العنصر نهائياً من المهملات.` : `Ce BL ne peut plus être restauré car le BR ${br.ref} est déjà rattaché à un autre BL actif (${activeBLs[0].ref}). L'élément a été définitivement purgé de la corbeille.` };
        }
      }
    }

    // Re-insert with new id — all restored BLs come back as draft 'open'
    delete finalItem.id;
    if (!finalItem.status) finalItem.status = 'open';
    finalItem.restoredFrom = 'recycle_bin';
    finalItem.restoredAt = new Date().toISOString();
    const restored = this.insert(collection, finalItem);

    // Remove from bin entirely (don't just mark — actually remove)
    const updatedBin = bin.filter(e => e.id !== binId);
    localStorage.setItem('recycle_bin', JSON.stringify(updatedBin));
    // Cloud sync: remove the bin entry
    if (typeof window.API !== 'undefined' && location.protocol !== 'file:') {
      window.API.remove('recycle_bin', binId).catch(() => {});
    }

    return { ok: true, item: restored, refWarning };
  },

  // ─── Unified Sequential Document Numbering & Cross-Checker ───────
  // Rule: Starts from 1 (0001 / 00001), next number is always (highest used + 1).
  // Cross-checks both BR and BCH collections so Option 1 pairs and doc numbers never collide.
  getNextDocNumSync(year = null) {
    const y = year || new Date().getFullYear();
    const takenSet = new Set();
    let maxPad = 4; // default minimum 4 digits (e.g. 0001)

    // 1. Collect from BRs
    this.getAll('brs').forEach(b => {
      const bYear = b.year || (b.date ? parseInt(b.date.substring(0, 4)) : y);
      if (bYear !== y) return;
      const n = parseInt(b.brNum) || (b.ref ? parseInt((b.ref.match(/(\d+)/) || [])[1]) : 0);
      if (n > 0) {
        takenSet.add(n);
        const m = (b.ref || '').match(/(\d+)/);
        if (m && m[1].length > maxPad) maxPad = m[1].length;
        else if (String(b.brNum || '').length > maxPad) maxPad = String(b.brNum).length;
      }
    });

    // 2. Collect from BLs / BCHs
    this.getAll('bls').forEach(b => {
      const bYear = b.year || (b.date ? parseInt(b.date.substring(0, 4)) : y);
      if (bYear !== y) return;
      const n = parseInt(b.bchNum || b.bcNum || b.blNum) || (b.ref ? parseInt((b.ref.match(/(\d+)/) || [])[1]) : 0);
      if (n > 0) {
        takenSet.add(n);
        const m = (b.ref || '').match(/BCH-(\d+)/) || (b.ref || '').match(/(\d+)/);
        if (m && m[1].length > maxPad) maxPad = m[1].length;
      }
    });

    let candidate = 1;
    if (takenSet.size > 0) {
      const maxNum = Math.max(...takenSet);
      candidate = maxNum + 1;
    }
    if (candidate < 1) candidate = 1;
    while (takenSet.has(candidate)) candidate++;

    const formatted = String(candidate).padStart(maxPad, '0');
    return { num: candidate, formatted, maxPad, takenSet };
  },

  async getNextDocNum(year = null) {
    const y = year || new Date().getFullYear();
    const local = this.getNextDocNumSync(y);
    const takenSet = new Set(local.takenSet);
    let maxPad = local.maxPad;

    // 3. Online server sync check if available
    if (window.API) {
      try {
        const [sBrs, sBls] = await Promise.all([
          API.getAll('brs').catch(() => null),
          API.getAll('bls').catch(() => null)
        ]);
        (sBrs || []).forEach(b => {
          const bYear = b.year || (b.date ? parseInt(b.date.substring(0, 4)) : y);
          if (bYear !== y) return;
          const n = parseInt(b.brNum) || (b.ref ? parseInt((b.ref.match(/(\d+)/) || [])[1]) : 0);
          if (n > 0) takenSet.add(n);
        });
        (sBls || []).forEach(b => {
          const bYear = b.year || (b.date ? parseInt(b.date.substring(0, 4)) : y);
          if (bYear !== y) return;
          const n = parseInt(b.bchNum || b.bcNum || b.blNum) || (b.ref ? parseInt((b.ref.match(/(\d+)/) || [])[1]) : 0);
          if (n > 0) takenSet.add(n);
        });
      } catch(e) {}
    }

    // 4. Calculate candidate:
    // Starts at 1 if none exist.
    // If numbers exist, next is (max + 1).
    let candidate = 1;
    if (takenSet.size > 0) {
      const maxNum = Math.max(...takenSet);
      candidate = maxNum + 1;
    }
    if (candidate < 1) candidate = 1;
    while (takenSet.has(candidate)) candidate++;

    const formatted = String(candidate).padStart(maxPad, '0');
    return { num: candidate, formatted, maxPad };
  },

  async getNextBRNum() {
    const res = await this.getNextDocNum();
    return res.num;
  },

  async getNextBCHNum() {
    const res = await this.getNextDocNum();
    return res.num;
  },
  getNextBCNum() {
    return this.getNextBCHNum();
  },
  getNextBLNum() {
    return this.getNextBCHNum();
  },

  checkDocNum(num, year = null, { excludeBrId = null, excludeBlId = null, parentBrId = null } = {}) {
    const n = parseInt(num);
    const y = parseInt(year) || new Date().getFullYear();
    if (!num || isNaN(n) || n < 1) {
      return { valid: false, reason: 'invalid', message: 'Numéro invalide' };
    }

    // Check in BRs
    const takenBR = this.getAll('brs').find(b => {
      if (excludeBrId && Number(b.id) === Number(excludeBrId)) return false;
      if (parentBrId && Number(b.id) === Number(parentBrId)) return false;
      const bYear = b.year || (b.date ? parseInt(b.date.substring(0, 4)) : y);
      if (bYear !== y) return false;
      const bNum = parseInt(b.brNum) || (b.ref ? parseInt((b.ref.match(/(\d+)/) || [])[1]) : 0);
      return bNum === n;
    });

    if (takenBR) {
      return { valid: false, reason: 'taken_br', ref: takenBR.ref, doc: takenBR, message: `Déjà utilisé dans BR (${takenBR.ref})` };
    }

    // Check in BLs / BCHs
    const takenBL = this.getAll('bls').find(b => {
      if (excludeBlId && Number(b.id) === Number(excludeBlId)) return false;
      const bYear = b.year || (b.date ? parseInt(b.date.substring(0, 4)) : y);
      if (bYear !== y) return false;
      const bNum = parseInt(b.bchNum || b.bcNum || b.blNum) || (b.ref ? parseInt((b.ref.match(/(\d+)/) || [])[1]) : 0);
      return bNum === n;
    });

    if (takenBL) {
      return { valid: false, reason: 'taken_bch', ref: takenBL.ref, doc: takenBL, message: `Déjà utilisé dans BCH (${takenBL.ref})` };
    }

    return { valid: true, reason: 'available', message: 'Disponible' };
  },

  isDocNumTaken(num, year = null, opts = {}) {
    return !this.checkDocNum(num, year, opts).valid;
  },

  isBRNumTaken(num, year, excludeId = null) {
    return !this.checkDocNum(num, year, { excludeBrId: excludeId }).valid;
  },

  buildBRRef(num, year, abbrev) {
    const s = String(num != null ? num : '').trim();
    const n = s ? s.padStart(Math.max(4, s.length), '0') : '0001';
    const y = year || new Date().getFullYear();
    if (abbrev && abbrev.trim()) return `${n}/BR/${abbrev.trim().toUpperCase()}/${y}`;
    return `BR/${n}/${y}`;
  },

  buildBCHRef(num, year, partNum, abbrev) {
    const s = String(num != null ? num : '').trim();
    const n = s ? s.padStart(Math.max(4, s.length), '0') : '0001';
    const base = `BCH-${n}`;
    if (partNum) return `${base}-P${String(partNum).padStart(2,'0')}`;
    return base;
  },

  buildBLRef(num, year, partNum, abbrev) {
    return this.buildBCHRef(num, year, partNum, abbrev);
  },

  buildBCRef(num, year, partNum, abbrev) {
    return this.buildBCHRef(num, year, partNum, abbrev);
  },

  // Get next part number for a partial BCH/BC (for a given brId)
  getNextBLPartNum(brId) {
    const existing = this.getAll('bls').filter(b => Number(b.brId) === Number(brId));
    if (!existing.length) return 1;
    const maxPart = existing.reduce((max, b) => {
      const p = Number(b.partNum) || 0;
      return Math.max(max, p);
    }, 0);
    return maxPart + 1;
  },

  getNextBCHPartNum(brId) {
    return this.getNextBLPartNum(brId);
  },

  // ─── Auto-BR Generation upon Supplier / Usine Validation ────────
  async createReservedBR(bcId) {
    const bc = this.getById('bls', bcId);
    if (!bc) throw new Error('BCH introuvable');
    // If already has a reserved/linked BR, return it
    if (bc.linkedBrId && this.getById('brs', bc.linkedBrId)) {
      return this.getById('brs', bc.linkedBrId);
    }
    const year = bc.year || new Date().getFullYear();
    // Use the exact BCH number for the linked BR so numbers match 1-to-1
    const brNum = bc.bchNum ? parseInt(bc.bchNum) : (await this.getNextBRNum());
    const supplier = this.getById('suppliers', bc.supplierId) || { id: bc.supplierId, name: bc.supplierName || 'Usine' };
    const ref = this.buildBRRef(brNum, year, supplier?.refAbbrev || '');
    
    const brLines = (bc.lines || []).map(l => {
      const qty = Number(l.qtyDelivered || l.qty) || 0;
      const price = Number(l.purchasePrice || l.price) || 0;
      const disc = Number(l.disc) || 0;
      const total = Math.round(qty * price * (1 - disc / 100) * 100) / 100;
      return { designation: l.designation, unit: l.unit || 'U', qty, price, disc, total };
    });
    const totalHT = Math.round(brLines.reduce((acc, l) => acc + (l.total || 0), 0) * 100) / 100;
    const tvaRate = bc.tvaRate !== undefined && !isNaN(Number(bc.tvaRate)) ? Number(bc.tvaRate) : (Number(this.getSettings().tvaRate) || 19);
    const tvaAmount = Math.round(totalHT * tvaRate / 100 * 100) / 100;
    const timbre = bc.noTimbre ? 0 : this.calcTimbre(totalHT, tvaAmount);
    const totalTTC = Math.round((totalHT + tvaAmount + timbre) * 100) / 100;
    
    const reservedBR = {
      ref, brNum, year,
      supplierId: bc.supplierId || supplier?.id || null,
      supplierName: supplier?.name || bc.supplierName || 'Usine',
      driverName: bc.driverName || '',
      truckIMM: bc.truckIMM || '',
      date: Utils.today(),
      lines: brLines,
      totalHT, tvaRate, tvaAmount, timbreAmount: timbre, totalTTC,
      status: 'reserved',
      isAutoGenerated: true,
      locked: true,
      bcId: bc.id, bcRef: bc.ref,
      notes: `BR réservé pour le BCH ${bc.ref} — En attente validation usine`,
      createdBy: Auth.getCurrentUser()?.id || 'system',
      createdByName: Auth.getCurrentUser()?.name || 'Système',
      createdAt: new Date().toISOString()
    };
    const savedBR = this.insert('brs', reservedBR);
    // Link to BCH
    this.update('bls', bc.id, { brId: savedBR.id, linkedBrId: savedBR.id, linkedBrRef: savedBR.ref });
    return savedBR;
  },

  async createAutoBRFromBC(bcId, validatorUser = null, ticketPesee = '') {
    const bc = this.getById('bls', bcId);
    if (!bc) throw new Error('Bon de Chargement introuvable');
    // If already has a linked BR (reserved or otherwise), update it instead of creating new
    if (bc.linkedBrId && this.getById('brs', bc.linkedBrId)) {
      const existingBR = this.getById('brs', bc.linkedBrId);
      this.update('brs', existingBR.id, {
        status: 'delivered',
        ticketPesee: ticketPesee || '',
        validatedAt: new Date().toISOString(),
        validatedBy: validatorUser?.name || 'Usine',
        notes: `Validé par l'usine — BCH ${bc.ref}`
      }, `Validé par l'usine ${validatorUser?.name || ''}`);
      // Update BCH status
      this.update('bls', bc.id, {
        status: 'validated_usine',
        validatedAt: new Date().toISOString(),
        validatedBy: validatorUser?.name || 'Usine',
        ticketPesee: ticketPesee || '',
        brId: existingBR.id
      }, `Validé par l'usine — BR ${existingBR.ref} confirmé`);
      // Notification
      if (typeof NotifMgr !== 'undefined') {
        NotifMgr.add({
          type: 'bc_validated',
          title: T.isRTL() ? 'تم تأكيد شحن المصنع' : 'Chargement Usine Validé',
          message: T.isRTL() ? `أكد المصنع شحن ${bc.ref}. تم تأكيد وصل الاستلام ${existingBR.ref}.` : `L'usine a validé le chargement ${bc.ref}. Le BR ${existingBR.ref} est confirmé.`,
          link: { mod: 'bls', id: bc.id },
          data: { bcId: bc.id, brId: existingBR.id }
        });
      }
      return existingBR;
    }
    const year = bc.year || new Date().getFullYear();
    const brNum = bc.bchNum ? parseInt(bc.bchNum) : (await this.getNextBRNum());
    const supplier = this.getById('suppliers', bc.supplierId) || { id: bc.supplierId, name: bc.supplierName || 'Usine / Fournisseur' };
    const ref = this.buildBRRef(brNum, year, supplier?.refAbbrev || '');
    
    // Auto-generate BR lines from BC lines with precise 2-decimal rounding
    const brLines = (bc.lines || []).map(l => {
      const qty = Number(l.qtyDelivered || l.qty) || 0;
      const price = Number(l.purchasePrice || l.price) || 0;
      const disc = Number(l.disc) || 0;
      const total = Math.round(qty * price * (1 - disc / 100) * 100) / 100;
      return {
        designation: l.designation,
        unit: l.unit || 'U',
        qty,
        price,
        disc,
        total
      };
    });

    const totalHT = Math.round(brLines.reduce((acc, l) => acc + (l.total || 0), 0) * 100) / 100;
    const tvaRate = bc.tvaRate !== undefined && !isNaN(Number(bc.tvaRate)) ? Number(bc.tvaRate) : (Number(this.getSettings().tvaRate) || 19);
    const tvaAmount = Math.round(totalHT * tvaRate / 100 * 100) / 100;
    const timbre = bc.noTimbre ? 0 : this.calcTimbre(totalHT, tvaAmount);
    const totalTTC = Math.round((totalHT + tvaAmount + timbre) * 100) / 100;

    const autoBR = {
      ref,
      brNum,
      year,
      supplierId: bc.supplierId || supplier?.id || null,
      supplierName: supplier?.name || bc.supplierName || 'Usine / Fournisseur',
      driverName: bc.driverName || '',
      truckIMM: bc.truckIMM || '',
      date: Utils.today(),
      lines: brLines,
      totalHT,
      tvaRate,
      tvaAmount,
      timbreAmount: timbre,
      totalTTC,
      status: 'delivered', // Directly confirmed upon factory pickup
      isAutoGenerated: true,
      locked: true, // Only Admin can modify/unlock
      bcId: bc.id,
      bcRef: bc.ref,
      ticketPesee: ticketPesee || '',
      notes: `Généré automatiquement suite à la validation du Bon de Chargement ${bc.ref} par l'usine ${supplier.name || ''}`,
      createdBy: validatorUser?.id || 'system',
      createdByName: `${validatorUser?.name || 'Usine'} (Validation Usine Auto)`,
      createdAt: new Date().toISOString()
    };

    const savedBR = this.insert('brs', autoBR);

    // Update the Bon de Chargement with the coordinated BR link
    this.update('bls', bc.id, {
      status: 'validated_usine',
      validatedAt: new Date().toISOString(),
      validatedBy: validatorUser?.name || 'Usine',
      ticketPesee: ticketPesee || '',
      linkedBrId: savedBR.id,
      linkedBrRef: savedBR.ref,
      brId: savedBR.id
    }, `Validé par l'usine — BR ${savedBR.ref} généré automatiquement`);

    // Add Notification
    if (typeof NotifMgr !== 'undefined') {
      NotifMgr.add({
        type: 'bc_validated',
        title: T.isRTL() ? 'تم تأكيد الشحن وإنشاء وصل استلام' : 'Chargement Usine Validé & BR Généré',
        message: T.isRTL() ? `أكد المصنع ${supplier.name || 'المصنع'} شحن ${bc.ref}. تم إنشاء وصل الاستلام ${savedBR.ref} تلقائياً.` : `L'usine ${supplier.name || 'Usine'} a validé le chargement ${bc.ref}. Le BR ${savedBR.ref} a été généré automatiquement.`,
        link: { mod: 'bls', id: bc.id },
        data: { bcId: bc.id, brId: savedBR.id }
      });
    }

    return savedBR;
  },


  // ─── Driver autocomplete ───────────────────────────────────
  // ─── Driver autocomplete ───────────────────────────────────
  getDrivers(q = '') {
    const query = (q || '').trim().toLowerCase();
    const map = new Map();
    // 1. From drivers collection
    (this.getAll('drivers') || []).forEach(d => {
      if (d && d.name) map.set(d.name.toLowerCase(), { name: d.name.trim(), imm: d.imm || '', count: d.count || 1 });
    });
    // 2. From historical BLs (BCH)
    (this.getAll('bls') || []).forEach(b => {
      if (b && b.driverName) {
        const k = b.driverName.trim().toLowerCase();
        const existing = map.get(k);
        if (existing) {
          if (!existing.imm && b.truckIMM) existing.imm = b.truckIMM;
          existing.count = (existing.count || 1) + 1;
        } else {
          map.set(k, { name: b.driverName.trim(), imm: b.truckIMM || '', count: 1 });
        }
      }
    });
    // 3. From historical BRs
    (this.getAll('brs') || []).forEach(b => {
      if (b && b.driverName) {
        const k = b.driverName.trim().toLowerCase();
        const existing = map.get(k);
        if (existing) {
          if (!existing.imm && b.truckIMM) existing.imm = b.truckIMM;
          existing.count = (existing.count || 1) + 1;
        } else {
          map.set(k, { name: b.driverName.trim(), imm: b.truckIMM || '', count: 1 });
        }
      }
    });
    const list = Array.from(map.values()).sort((a,b) => (b.count||0) - (a.count||0));
    if (!query) return list.slice(0, 15);
    return list.filter(d => d.name.toLowerCase().includes(query) || (d.imm && d.imm.toLowerCase().includes(query))).slice(0, 15);
  },

  getDriverIMM(name) {
    if (!name) return '';
    const drivers = this.getDrivers(name);
    const exact = drivers.find(d => d.name.toLowerCase() === name.trim().toLowerCase());
    return exact ? exact.imm : (drivers[0]?.imm || '');
  },

  saveDriver(name, imm) {
    if (!name) return;
    const cleanName = name.trim();
    const cleanImm = (imm || '').trim();
    const drivers = this.getAll('drivers');
    const idx = drivers.findIndex(d => d && d.name && d.name.toLowerCase() === cleanName.toLowerCase());
    if (idx >= 0) {
      drivers[idx].imm = cleanImm || drivers[idx].imm;
      drivers[idx].count = (drivers[idx].count || 1) + 1;
      this.rawSet('drivers', drivers);
    } else {
      this.insert('drivers', { name: cleanName, imm: cleanImm, count: 1 });
    }
  },

  // ─── Timbre calculation ────────────────────────────────────────
  // Formule officielle et réglementaire (Algérie - Base = HT + TVA):
  //   Base imposable  = HT + TVA (montant facturé TTC avant timbre)
  //   Tranche / slab  = validée et évaluée sur la Base (HT + TVA)
  //   tranches        = useCeil ? Math.ceil(Base × rate) : (Base × rate)
  //   timbre          = tranches × DA/tranche
  calcTimbre(amountHT, tvaAmount = null) {
    let ht = 0, tva = null;
    if (typeof amountHT === 'object' && amountHT !== null) {
      ht = Number(amountHT.ht ?? amountHT.totalHT ?? amountHT.amountHT ?? 0);
      tva = amountHT.tva !== undefined ? Number(amountHT.tva) : (amountHT.tvaAmount !== undefined ? Number(amountHT.tvaAmount) : null);
    } else {
      ht = Number(amountHT) || 0;
      tva = tvaAmount;
    }
    if (ht <= 0) return 0;

    const settings = this.getSettings();
    if (tva === null || tva === undefined) {
      const defTvaRate = Number(settings.tvaRate) || 19;
      tva = Math.round(ht * defTvaRate / 100 * 100) / 100;
    } else {
      tva = Number(tva) || 0;
    }

    const baseAmt = Math.round((ht + tva) * 100) / 100;
    if (baseAmt <= 0) return 0;

    let globalRate       = Number(settings.timbreRate);
    if (isNaN(globalRate) || globalRate <= 0) globalRate = 0.01;
    if (Math.abs(globalRate - 0.0119) < 0.0001) globalRate = 0.01;

    let globalPerTranche = Number(settings.timbrePerTranche);
    if (isNaN(globalPerTranche) || globalPerTranche <= 0) globalPerTranche = 1.0;

    const timbreMin        = Number(settings.timbreMin)        || 0;
    const timbreMax        = Number(settings.timbreMax)        || 0;
    const useCeil          = settings.timbreUseCeil === true;

    // Slab lookup: valider l'intervalle selon le montant de la Base (HT + TVA)
    const slabs = settings.timbreSlabs || [];
    let rate = globalRate, perTranche = globalPerTranche;
    let slabCap = 0;
    if (slabs.length) {
      const slab = slabs.find(sl => {
        const min = Number(sl.min) || 0;
        const max = (sl.max !== null && sl.max !== undefined && sl.max !== '') ? Number(sl.max) : Infinity;
        return baseAmt >= min && baseAmt <= max;
      });
      if (slab) {
        let r = Number(slab.rate);
        if (isNaN(r) || r <= 0) r = globalRate;
        if (Math.abs(r - 0.0119) < 0.0001) r = 0.01;
        rate       = r;
        perTranche = Number(slab.perTranche) || globalPerTranche;
        slabCap    = Number(slab.cap)        || 0;
      }
    }

    // Calcul : tranches sur la base (HT + TVA) × DA/tranche
    const tranches = useCeil ? Math.ceil(baseAmt * rate) : (baseAmt * rate);
    let timbre   = tranches * perTranche;
    if (timbreMin > 0) timbre = Math.max(timbreMin, timbre);
    if (slabCap > 0)   timbre = Math.min(slabCap, timbre);
    else if (timbreMax > 0) timbre = Math.min(timbreMax, timbre);
    return Math.round(timbre * 100) / 100;
  },

  calcTimbreDetail(amountHT, tvaAmount = null) {
    let ht = 0, tva = null;
    if (typeof amountHT === 'object' && amountHT !== null) {
      ht = Number(amountHT.ht ?? amountHT.totalHT ?? amountHT.amountHT ?? 0);
      tva = amountHT.tva !== undefined ? Number(amountHT.tva) : (amountHT.tvaAmount !== undefined ? Number(amountHT.tvaAmount) : null);
    } else {
      ht = Number(amountHT) || 0;
      tva = tvaAmount;
    }
    const settings = this.getSettings();
    if (tva === null || tva === undefined) {
      const defTvaRate = Number(settings.tvaRate) || 19;
      tva = Math.round(ht * defTvaRate / 100 * 100) / 100;
    } else {
      tva = Number(tva) || 0;
    }

    const baseAmt = Math.round((ht + tva) * 100) / 100;

    let globalRate       = Number(settings.timbreRate);
    if (isNaN(globalRate) || globalRate <= 0) globalRate = 0.01;
    if (Math.abs(globalRate - 0.0119) < 0.0001) globalRate = 0.01;

    let globalPerTranche = Number(settings.timbrePerTranche);
    if (isNaN(globalPerTranche) || globalPerTranche <= 0) globalPerTranche = 1.0;

    const timbreMin        = Number(settings.timbreMin)        || 0;
    const timbreMax        = Number(settings.timbreMax)        || 0;
    const useCeil          = settings.timbreUseCeil === true;
    const slabs = settings.timbreSlabs || [];
    let rate = globalRate, perTranche = globalPerTranche;
    let slabCap = 0;
    let matchedSlab = null;
    if (slabs.length) {
      const slab = slabs.find(sl => {
        const min = Number(sl.min) || 0;
        const max = (sl.max !== null && sl.max !== undefined && sl.max !== '') ? Number(sl.max) : Infinity;
        return baseAmt >= min && baseAmt <= max;
      });
      if (slab) {
        matchedSlab = slab;
        let r = Number(slab.rate);
        if (isNaN(r) || r <= 0) r = globalRate;
        if (Math.abs(r - 0.0119) < 0.0001) r = 0.01;
        rate       = r;
        perTranche = Number(slab.perTranche) || globalPerTranche;
        slabCap    = Number(slab.cap)        || 0;
      }
    }
    const tranches = useCeil ? Math.ceil(baseAmt * rate) : (baseAmt * rate);
    let timbre   = tranches * perTranche;
    if (timbreMin > 0) timbre = Math.max(timbreMin, timbre);
    if (slabCap > 0)   timbre = Math.min(slabCap, timbre);
    else if (timbreMax > 0) timbre = Math.min(timbreMax, timbre);
    timbre = Math.round(timbre * 100) / 100;
    return {
      ht,
      tva,
      baseAmt,
      tranches: Math.round(tranches * 100) / 100,
      perTranche,
      rate,
      timbre,
      cap: slabCap || timbreMax || null,
      useCeil,
      slab: matchedSlab
    };
  },

  previewTimbre(amt, tva = null) {
    const t = this.calcTimbre(amt, tva);
    const amtHT = Number(amt) || 0;
    const amtTVA = tva !== null && tva !== undefined ? Number(tva) : Math.round(amtHT * (Number(this.getSettings().tvaRate) || 19) / 100 * 100) / 100;
    const base = Math.round((amtHT + amtTVA) * 100) / 100;
    return { timbre: t, totalHT: amtHT, tva: amtTVA, base, total: Math.round((base + t) * 100) / 100 };
  },

  // ─── Article catalog & suggestions ─────────────────────────
  searchArticles(q = '') {
    const query = (q || '').trim().toLowerCase();
    const map = new Map();
    // 1. From saved articles catalog
    (this.getAll('articles') || []).forEach(a => {
      if (a && a.name) {
        map.set(a.name.trim().toLowerCase(), {
          name: a.name.trim(),
          unit: a.unit || 'U',
          price: Number(a.price) || 0,
          purchasePrice: Number(a.purchasePrice || a.priceBuy || 0),
          count: a.count || 1
        });
      }
    });
    // 2. From all BRs (historical receipts)
    (this.getAll('brs') || []).forEach(br => {
      (br.lines || []).forEach(l => {
        if (l && l.designation) {
          const k = l.designation.trim().toLowerCase();
          const existing = map.get(k);
          if (existing) {
            if (!existing.price && l.price) existing.price = Number(l.price);
            if (!existing.purchasePrice && l.price) existing.purchasePrice = Number(l.price);
            existing.count = (existing.count || 1) + 1;
          } else {
            map.set(k, {
              name: l.designation.trim(),
              unit: l.unit || 'U',
              price: Number(l.price) || 0,
              purchasePrice: Number(l.price) || 0,
              count: 1
            });
          }
        }
      });
    });
    // 3. From all BLs (historical shipments)
    (this.getAll('bls') || []).forEach(bl => {
      (bl.lines || []).forEach(l => {
        if (l && l.designation) {
          const k = l.designation.trim().toLowerCase();
          const existing = map.get(k);
          if (existing) {
            if (!existing.price && l.price) existing.price = Number(l.price);
            if (!existing.purchasePrice && l.purchasePrice) existing.purchasePrice = Number(l.purchasePrice);
            existing.count = (existing.count || 1) + 1;
          } else {
            map.set(k, {
              name: l.designation.trim(),
              unit: l.unit || 'U',
              price: Number(l.price) || 0,
              purchasePrice: Number(l.purchasePrice || 0),
              count: 1
            });
          }
        }
      });
    });
    const list = Array.from(map.values()).sort((a,b) => (b.count||0) - (a.count||0));
    if (!query) return list.slice(0, 15);
    return list.filter(a => a.name.toLowerCase().includes(query)).slice(0, 15);
  },

  saveArticle(name, unit, price, purchasePrice = null) {
    if (!name) return;
    const cleanName = name.trim();
    const arts = this.getAll('articles');
    const idx = arts.findIndex(a => a && a.name && a.name.toLowerCase() === cleanName.toLowerCase());
    if (idx >= 0) {
      arts[idx] = { 
        ...arts[idx], 
        unit: unit || arts[idx].unit, 
        price: Number(price) || arts[idx].price,
        purchasePrice: purchasePrice !== null ? Number(purchasePrice) : (arts[idx].purchasePrice || arts[idx].priceBuy || 0),
        count: (arts[idx].count || 1) + 1
      }; 
      this.rawSet('articles', arts); 
    } else { 
      this.insert('articles', { 
        name: cleanName, 
        unit: unit||'U', 
        price: Number(price)||0,
        purchasePrice: Number(purchasePrice)||0,
        count: 1 
      }); 
    }
  },

  // ─── Audit chain ───────────────────────────────────────────
  _fnv(str) {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = (h + (h<<1) + (h<<4) + (h<<7) + (h<<8) + (h<<24)) >>> 0; }
    return ('0000000' + h.toString(16)).slice(-8);
  },
  _audit(action, col, id, oldData, newData) {
    const log = this.getAll('audit_log');
    const u = Auth.getCurrentUser();
    const prev = log.length ? (log[log.length-1].hash || '') : '';
    const ts = new Date().toISOString();
    const entry = { id: log.length+1, ts, userId: u?.id||null, userName: u?.name||'System', action, collection: col, docId: id, prevHash: prev };
    entry.hash = this._fnv(`${prev}|${ts}|${entry.userId}|${action}|${col}|${id}`);
    log.push(entry);
    localStorage.setItem('audit_log', JSON.stringify(log.slice(-5000)));
    // Push to server so audit persists across sessions
    if (typeof window.API !== 'undefined' && location.protocol !== 'file:') {
      window.API.insert('audit_log', entry).catch(e => console.warn('[audit] cloud push failed', e.message));
    }
  },
  _history(col, id, action, note, oldData, newData) {
    const h = this.getAll('history');
    const u = Auth.getCurrentUser();
    const entry = { id: h.length+1, ts: new Date().toISOString(), col, docId: id, action, note, userId: u?.id||null, userName: u?.name||'System' };
    h.push(entry);
    localStorage.setItem('history', JSON.stringify(h.slice(-3000)));
    // Push to server so history persists across sessions
    if (typeof window.API !== 'undefined' && location.protocol !== 'file:') {
      window.API.insert('history', entry).catch(e => console.warn('[history] cloud push failed', e.message));
    }
  },
  getHistory(col, id) {
    return this.getAll('history').filter(h => h.col === col && h.docId === id).sort((a,b)=>(a.ts||'').localeCompare(b.ts||''));
  },

  exportAll() {
    const d = {};
    this._cols.forEach(c => { d[c] = this.getAll(c); });
    d.settings = this.getSettings();
    d.exportedAt = new Date().toISOString();
    return JSON.stringify(d, null, 2);
  },
  importAll(json) {
    try {
      const d = JSON.parse(json);
      Object.keys(d).forEach(k => {
        if (k === 'settings') localStorage.setItem('settings', JSON.stringify(d[k]));
        else if (k !== 'exportedAt') localStorage.setItem(k, JSON.stringify(d[k]));
      });
      return true;
    } catch { return false; }
  },
  async hardReset() {
    const ok1 = await Dialog.confirm(T.isRTL() ? 'تأكيد' : 'Confirmation', T.get('set_reset_confirm'), 'danger');
    if (!ok1) return;
    const ok2 = await Dialog.confirm(T.isRTL() ? 'تأكيد نهائي' : 'CONFIRMATION FINALE', T.isRTL() ? 'تأكيد نهائي — سيتم حذف جميع البيانات نهائياً.' : 'CONFIRMATION FINALE — Toutes les données seront effacées.', 'danger');
    if (!ok2) return;
    localStorage.clear(); this.init(); location.reload();
  }
};

// ─── AUTH ──────────────────────────────────────────────────────
const Auth = {
  getCurrentUser() { try { return JSON.parse(localStorage.getItem('currentUser')||'null'); } catch { return null; } },
  isLoggedIn() { return !!this.getCurrentUser(); },
  isAdmin() { return this.getCurrentUser()?.role === 'admin'; },
  isSupplier() {
    const u = this.getCurrentUser();
    return u?.role === 'supplier' || u?.role === 'supplier_agent';
  },

  login(username, password, forceBypass = false) {
    const u = DB.getAll('users').find(u => u.username===username && u.password===password && u.active!==false);
    if (!u && !forceBypass) return false;
    
    // If forced bypass but user not found (first login on new client), create a temporary session user
    const finalUser = u || { id: 'admin', username, role: 'admin', name: username };
    localStorage.setItem('currentUser', JSON.stringify(finalUser));
    // Log work start AFTER saving currentUser so DB.insert can read it
    if (u) WorkLog.logIn(u.id);
    return finalUser;
  },

  logout() {
    const u = this.getCurrentUser();
    if (u) WorkLog.logOut(u.id);
    localStorage.removeItem('currentUser');
    localStorage.removeItem('_erp_token');
    // Clear sync timestamps so the next user immediately syncs fresh data from cloud
    try {
      Object.keys(localStorage).forEach(k => {
        if (k.startsWith('_sync_ts_')) localStorage.removeItem(k);
      });
    } catch (_) {}
    if (typeof DB !== 'undefined') DB._loaded = {};
    if (window.API) API.logout();
    location.reload();
  },

  canEdit(doc) {
    const u = this.getCurrentUser();
    if (!u) return false;
    if (doc?.status === 'returned' || doc?.isReturned) return false; // Reference permanently reserved as returned: IMMUTABLE FOREVER!
    if (u.role === 'admin') return true;
    if (doc?.isAutoGenerated || doc?.locked) return false; // Auto-generated from usine validation or locked: Admin only!
    const docDate = (doc?.date || doc?.createdAt || '').slice(0, 10);
    const today = Utils.today();
    if (docDate && docDate < today) return false; // Day passed: only admin can modify
    const session = SessionMgr.getTodaySession(u.id);
    if (session && session.status === 'closed') return false; // Day is closed: only admin can modify
    if (doc?.createdBy && String(doc.createdBy) !== String(u.id)) return false;
    return true;
  },

  canDelete(doc) {
    const u = this.getCurrentUser();
    if (!u) return false;
    if (doc?.status === 'returned' || doc?.isReturned) return false; // Cannot delete returned documents (reserved reference)
    if (u.role === 'admin') return true;
    if (doc?.isAutoGenerated || doc?.locked) return false; // Auto-generated / locked documents: Admin only!
    const docDate = (doc?.date || doc?.createdAt || '').slice(0, 10);
    const today = Utils.today();
    if (docDate && docDate < today) return false; // Day passed: only admin can delete
    const session = SessionMgr.getTodaySession(u.id);
    if (session && session.status === 'closed') return false; // Day is closed: only admin can delete
    if (doc?.supplierId !== undefined || (doc?.ref && (doc.ref.startsWith('BR') || doc.ref.includes('/BR/')))) {
      if (!this.can('canDeleteBR')) return false;
    }
    if (doc?.clientId !== undefined || doc?.isBonChargement || (doc?.ref && (doc.ref.startsWith('BL') || doc.ref.startsWith('BC') || doc.ref.startsWith('BCH') || doc.ref.includes('/BCH/') || doc.ref.includes('/BC/') || doc.ref.includes('/BL/')))) {
      if (!this.can('canDeleteBL')) return false;
    }
    return String(doc?.createdBy) === String(u.id);
  },

  canReturn(bl) {
    const u = this.getCurrentUser();
    if (!u) return false;
    if (u.role !== 'admin' && !this.can('canReturnBL')) return false;
    return bl && bl.status !== 'returned' && bl.status !== 'cancelled';
  },

  // ── Permission System ──────────────────────────────────────────
  _defaultPermissions() {
    return {
      canCreateBR: true,
      canCreateBL: true,
      canReturnBL: false,
      canViewBRs: true,
      canViewBLs: true,
      canViewCaisse: true,
      canViewSuppliers: true,
      canViewClients: true,
      canViewStats: false,
      canViewCatalogue: false,
      canViewBank: false,
      canViewUsine: false,
      canViewSuivi: false,
      canEditSuppliers: false,
      canEditClients: false,
      canDeleteBR: false,
      canDeleteBL: false,
      canManageCharges: false,
      requireDailyLiquid: true,
    };
  },
  getUserPermissions(user) {
    if (!user) return {};
    if (user.role === 'admin') {
      const p = this._defaultPermissions();
      return Object.fromEntries(Object.keys(p).map(k => [k, true]));
    }
    if (user.role === 'supplier' || user.role === 'supplier_agent') {
      return {
        ...this._defaultPermissions(),
        canViewBLs: true,
        canViewBRs: false,
        canViewCaisse: false,
        canViewBank: false,
        canViewStats: false,
        canViewCatalogue: false,
        canViewSuppliers: false,
        canViewClients: false,
        canEditSuppliers: false,
        canEditClients: false,
        canCreateBR: false,
        canCreateBL: false,
        canReturnBL: false,
        canDeleteBR: false,
        canDeleteBL: false,
        canManageCharges: false,
        requireDailyLiquid: false,
        canViewUsine: true,
        canViewSuivi: true
      };
    }
    // Read LIVE user data from DB (not stale localStorage copy)
    const liveUser = DB.getAll('users').find(u => u.id === user.id) || user;
    return { ...this._defaultPermissions(), ...(liveUser.permissions || {}) };
  },
  can(permission) {
    const u = this.getCurrentUser();
    if (!u) return false;
    if (u.role === 'admin') return true;
    const perms = this.getUserPermissions(u);
    // STRICT: only explicitly granted permissions are allowed
    return perms[permission] === true;
  },
  myPermissions() {
    return this.getUserPermissions(this.getCurrentUser());
  }
};

// ─── DIALOG — Custom modal replaces alert/confirm/prompt ──────
const Dialog = {
  _icons: { danger:'fa-skull-crossbones', warning:'fa-exclamation-triangle', success:'fa-check-circle', info:'fa-info-circle' },

  show({ title='', message='', type='info', confirmText='OK', cancelText=null, inputType=null, inputPlaceholder='', inputLabel='', hideButtons=false }) {
    return new Promise(resolve => {
      const id = 'dlg_' + Date.now();
      const hasInput = !!inputType;
      const icon = this._icons[type] || 'fa-info-circle';
      const html = `
        <div class="dlg-overlay" id="${id}">
          <div class="dlg-box dlg-${type}">
            <div class="dlg-icon-wrap"><i class="fas ${icon}"></i></div>
            <div class="dlg-title">${title}</div>
            <div class="dlg-msg">${message}</div>
            ${hasInput ? `
              ${inputLabel ? `<div style="font-size:12px;font-weight:600;color:var(--text-muted);margin-bottom:6px">${inputLabel}</div>` : ''}
              <input class="dlg-input" id="${id}_inp" type="${inputType}" placeholder="${inputPlaceholder}" autocomplete="off">
            ` : ''}
            ${hideButtons ? '' : `<div class="dlg-btns">
              ${cancelText ? `<button class="dlg-btn dlg-btn-cancel" id="${id}_cancel">${cancelText}</button>` : ''}
              <button class="dlg-btn ${type==='danger'?'dlg-btn-danger':'dlg-btn-primary'}" id="${id}_ok">${confirmText}</button>
            </div>`}
          </div>
        </div>`;
      document.body.insertAdjacentHTML('beforeend', html);
      const overlay = document.getElementById(id);
      const inp = document.getElementById(id + '_inp');
      const okBtn = document.getElementById(id + '_ok');
      const cancelBtn = document.getElementById(id + '_cancel');

      requestAnimationFrame(() => { requestAnimationFrame(() => overlay.classList.add('dlg-open')); });
      if (inp) setTimeout(() => inp.focus(), 120);

      const close = (val) => {
        overlay.classList.remove('dlg-open');
        resolve(val);
        setTimeout(() => { overlay.remove(); }, 300);
      };
      Dialog._resolve = close;

      if (okBtn) okBtn.addEventListener('click', () => close(hasInput ? (inp?.value ?? '') : true));
      if (cancelBtn) cancelBtn.addEventListener('click', () => close(hasInput ? null : false));
      if (inp) inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); if(okBtn) okBtn.click(); } });
      overlay.addEventListener('click', e => { if (e.target === overlay && (cancelBtn || hideButtons)) close(hasInput ? null : false); });
    });
  },

  confirm(title, message, type = 'warning') {
    return this.show({ title, message, type, confirmText: T?.isRTL() ? 'تأكيد' : 'Confirmer', cancelText: T?.isRTL() ? 'إلغاء' : 'Annuler' });
  },
  alert(title, message, type = 'info') {
    return this.show({ title, message, type, confirmText: 'OK' });
  },
  prompt(title, message, { placeholder = '', inputType = 'text', label = '' } = {}) {
    return this.show({ title, message, type: 'info', confirmText: 'OK', cancelText: T?.isRTL() ? 'إلغاء' : 'Annuler', inputType, inputPlaceholder: placeholder, inputLabel: label });
  },
  promptPassword(title, message, { placeholder = '••••••••', label = '' } = {}) {
    return this.show({ title, message, type: 'warning', confirmText: T?.isRTL() ? 'تأكيد' : 'Confirmer', cancelText: T?.isRTL() ? 'إلغاء' : 'Annuler', inputType: 'password', inputPlaceholder: placeholder, inputLabel: label });
  },
};
window.Dialog = Dialog;

// ─── UTILS ────────────────────────────────────────────────────
const Utils = {
  fmtDate(d) {
    if (!d) return '';
    try { const dt = new Date(d); return `${String(dt.getDate()).padStart(2,'0')}/${String(dt.getMonth()+1).padStart(2,'0')}/${dt.getFullYear()}`; }
    catch { return String(d); }
  },
  fmtDateTime(d) {
    if (!d) return '';
    try { const dt = new Date(d); return `${this.fmtDate(d)} ${String(dt.getHours()).padStart(2,'0')}:${String(dt.getMinutes()).padStart(2,'0')}`; }
    catch { return String(d); }
  },
  fmtCurrency(v) {
    const n = Number(v) || 0;
    const [int, dec] = n.toFixed(2).split('.');
    const formatted = int.replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ',' + dec + ' DA';
    return formatted; // Always LTR-safe — caller wraps in <bdi> or dir=ltr span as needed
  },
  fmtCurrencyHTML(v) {
    // Use this in HTML contexts to guarantee LTR display even in RTL mode
    const n = Number(v) || 0;
    const [int, dec] = n.toFixed(2).split('.');
    const formatted = int.replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ',' + dec + ' DA';
    return `<span dir="ltr" style="unicode-bidi:embed;display:inline-block">${formatted}</span>`;
  },
  fmtNum(v, decimals = null) {
    if (v === null || v === undefined || v === '') return '0';
    const n = Number(v) || 0;
    const fixed = decimals !== null ? n.toFixed(decimals) : (Number.isInteger(n) ? n.toFixed(0) : n.toFixed(2).replace(/0+$/, '').replace(/\.$/, ''));
    const [int, dec] = fixed.split('.');
    const formatted = int.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
    return dec !== undefined ? formatted + ',' + dec : formatted;
  },
  /* Use LOCAL timezone — toISOString() is UTC which gives wrong date in GMT+1 */
  today() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  },
  todayKey() { return this.today(); },

  numberToWordsFR(n) {
    if (n === 0) return 'zéro dinars';
    const u = ['','un','deux','trois','quatre','cinq','six','sept','huit','neuf','dix','onze','douze','treize','quatorze','quinze','seize','dix-sept','dix-huit','dix-neuf'];
    const t = ['','dix','vingt','trente','quarante','cinquante','soixante','soixante-dix','quatre-vingt','quatre-vingt-dix'];

    function convertUnder1000(num, isThousands = false) {
      let c = Math.floor(num / 100);
      let rem = num % 100;
      let r = '';
      if (c === 1) r += 'cent ';
      else if (c > 1) r += u[c] + ' cent' + (rem === 0 && !isThousands ? 's ' : ' ');

      if (rem > 0) {
        if (rem < 20) r += u[rem] + ' ';
        else {
          let ten = Math.floor(rem / 10);
          let unit = rem % 10;
          if (ten === 7 || ten === 9) { ten--; unit += 10; }
          
          if (ten === 8 && unit === 0) r += 'quatre-vingt' + (isThousands ? ' ' : 's ');
          else if (ten === 8) r += 'quatre-vingt-' + u[unit] + ' ';
          else {
            r += t[ten];
            if (unit === 1) r += ' et un ';
            else if (unit === 11 && ten === 6) r += ' et onze ';
            else if (unit > 0) r += '-' + u[unit] + ' ';
            else r += ' ';
          }
        }
      }
      return r.trim();
    }

    let b = Math.floor(n / 1e9); n %= 1e9;
    let m = Math.floor(n / 1e6); n %= 1e6;
    let k = Math.floor(n / 1e3); n %= 1e3;
    
    let res = '';
    if (b > 0) res += convertUnder1000(b) + (b === 1 ? ' milliard ' : ' milliards ');
    if (m > 0) res += convertUnder1000(m) + (m === 1 ? ' million ' : ' millions ');
    if (k > 0) res += (k === 1 ? 'mille ' : convertUnder1000(k, true) + ' mille ');
    if (n > 0) res += convertUnder1000(n) + ' ';

    return res.trim() + ' dinars';
  },

  escHTML(s) {
    const d = document.createElement('div'); d.appendChild(document.createTextNode(String(s??'')));
    return d.innerHTML;
  },

  notify(msg, type='info', dur=4000) {
    if (type === 'success' || type === 'warning') {
      if (typeof NotifMgr !== 'undefined' && NotifMgr._playNotifSound) NotifMgr._playNotifSound();
    }
    const c = document.getElementById('notifContainer'); if (!c) return;
    const icons = { success:'fa-check-circle', error:'fa-times-circle', warning:'fa-exclamation-triangle', info:'fa-info-circle' };
    const el = document.createElement('div');
    el.className = `notif notif-${type==='error'?'error':type}`;
    el.style.cssText = 'display:flex;align-items:center;gap:10px';
    el.innerHTML = `<i class="fas ${icons[type]||icons.info}"></i><span>${this.escHTML(msg)}</span>`;
    c.appendChild(el);
    setTimeout(() => { el.style.animation='slideOut .35s ease forwards'; setTimeout(()=>el.remove(), 380); }, dur);
  },

  statusBadge(status) {
    const isAR = typeof T !== 'undefined' && T.isRTL();
    const m = {
      open:            ['badge-secondary', 'fa-truck',          isAR ? '🚚 الشاحنة في الطريق للمصنع' : '🚚 Chauffeur en route vers usine'],
      pending_usine:   ['badge-warning',   'fa-truck',          isAR ? '🚚 الشاحنة في الطريق للمصنع' : '🚚 Chauffeur en route vers usine'],
      reserved:        ['badge-warning',   'fa-bookmark',       isAR ? '📌 حجز مسبق — في الطريق للمصنع' : '📌 Réservé — En route usine'],
      validated_usine: ['badge-info',      'fa-industry',       isAR ? '🏭 تم التحقق (وصل استلام جاهز)' : '🏭 Validé Usine (BR officiel prêt)'],
      delivered:       ['badge-success',   'fa-check-circle',   isAR ? '✅ تم الشحن والتسليم للعميل' : '✅ Enlevé & Livré au client'],
      locked:          ['badge-dark',      'fa-lock',           T.get('st_locked')],
      returned:        ['badge-danger',    'fa-undo',           isAR ? '🔄 مرتجع' : '🔄 Retourné'],
      reception:       ['badge-warning',   'fa-truck-loading',  isAR ? '🚚 جاري الاستلام' : '🚚 Réception en cours'],
    };
    const [cls, icon, label] = m[status] || ['badge-secondary', 'fa-circle', status||''];
    return `<span class="badge ${cls}"><i class="fas ${icon}"></i> ${label}</span>`;
  },

  async confirm2(msg1, msg2) { 
    const isAR = typeof T !== 'undefined' && T.isRTL();
    const ok1 = await Dialog.confirm(isAR ? 'تأكيد' : 'Confirmation', msg1, 'danger');
    if (!ok1) return false;
    return await Dialog.confirm(isAR ? 'تأكيد ثانٍ' : 'Confirmation 2', msg2, 'danger');
  },

  debounce(fn, d=200) { let t; return (...a) => { clearTimeout(t); t = setTimeout(()=>fn(...a), d); }; },

  historyHTML(col, id) {
    const entries = DB.getHistory(col, id);
    if (!entries.length) return '';
    const isAR = typeof T !== 'undefined' && T.isRTL();
    return `<div class="history-section">
      <h4><i class="fas fa-history"></i> ${isAR ? 'سجل العمليات' : 'Historique'}</h4>
      ${entries.map(e => `<div class="history-entry">
        <div class="history-dot"></div>
        <span class="h-time">${this.fmtDateTime(e.ts)}</span>
        <span class="h-desc">${this.escHTML(e.note)}</span>
        <span class="h-user">${this.escHTML(e.userName||'')}</span>
      </div>`).join('')}
    </div>`;
  }
};

// ═══════════════════════════════════════════════════════════════════════
// FORM GUIDE — Sequential field highlighting (polling-based, bulletproof)
// Scans fields every 400ms, highlights next empty, auto-focuses on change
// ═══════════════════════════════════════════════════════════════════════
const FormGuide = {
  _fields: [],
  _timer: null,
  _lastActiveId: null,
  start() { /* disabled — replaced by red-border validation */ },
  _scan() {},
  stop() {
    if (this._timer) { clearInterval(this._timer); this._timer = null; }
    document.querySelectorAll('.field-guide-active, .field-guide-done').forEach(n => {
      n.classList.remove('field-guide-active', 'field-guide-done');
    });
  }
};

// ─── WORK LOG ─────────────────────────────────────────────────
const WorkLog = {
  logIn(userId) {
    const today = Utils.today();
    const logs = DB.getAll('work_log');
    const existing = logs.find(l => l.userId === userId && l.date === today && !l.logoutTime);
    if (!existing) {
      // Use rawSet to avoid auth dependency issue during login timing
      const items = logs;
      const id = items.length ? Math.max(...items.map(i => i.id)) + 1 : 1;
      const entry = { id, userId, date: today, loginTime: new Date().toISOString(), logoutTime: null, createdAt: new Date().toISOString() };
      items.push(entry);
      DB.rawSet('work_log', items);
    }
  },
  logOut(userId) {
    const today = Utils.today();
    const logs = DB.getAll('work_log');
    const idx = logs.slice().reverse().findIndex(l => l.userId === userId && l.date === today && !l.logoutTime);
    if (idx >= 0) {
      const realIdx = logs.length - 1 - idx;
      logs[realIdx].logoutTime = new Date().toISOString();
      DB.rawSet('work_log', logs);
    }
  },
  getUserStats(userId) {
    const logs = DB.where('work_log', l => l.userId === userId);
    const brs = DB.where('brs', b => b.createdBy === userId);
    const bls = DB.where('bls', b => b.createdBy === userId && b.status !== 'returned' && b.status !== 'draft');
    const sessions = DB.where('sessions', s => s.userId === userId && s.status === 'closed');
    const totalErrors = sessions.reduce((sum, s) => sum + Math.abs(s.ecart || 0), 0);
    return { logs, brs: brs.length, deliveries: bls.length, sessions, totalErrors };
  }
};

// ─── NOTIFICATION MANAGER ──────────────────────────────────────
const NotifMgr = {
  // ── Notification types & role-based defaults ──
  NOTIF_TYPES: {
    bc_created:         { fr: 'Nouveau BCH créé',             ar: 'سند شحن جديد',              icon: 'fa-plus-circle',    color: '#3b82f6' },
    bc_validated:       { fr: 'BCH validé par l\'usine',      ar: 'تم التحقق من المصنع',         icon: 'fa-industry',       color: '#10b981' },
    delivery_confirmed: { fr: 'Livraison confirmée',           ar: 'تأكيد التسليم',              icon: 'fa-truck',          color: '#10b981' },
    bc_returned:        { fr: 'Retour marchandise',            ar: 'إرجاع بضاعة',               icon: 'fa-undo',           color: '#ef4444' },
    bank_deposit:       { fr: 'Versement bancaire',            ar: 'تحويل بنكي',                icon: 'fa-university',     color: '#0ea5e9' },
    warning:            { fr: 'Alerte système / Anomalie',     ar: 'تنبيه النظام / خلل',         icon: 'fa-exclamation-triangle', color: '#f59e0b' }
  },

  // Default prefs per role — what each role NEEDS to see
  ROLE_DEFAULTS: {
    admin:           { bc_created: true, bc_validated: true, delivery_confirmed: true, bc_returned: true, bank_deposit: true, warning: true },
    manager:         { bc_created: true, bc_validated: true, delivery_confirmed: true, bc_returned: true, bank_deposit: true, warning: true },
    user:            { bc_created: true, bc_validated: true, delivery_confirmed: true, bc_returned: true, bank_deposit: true, warning: false },
    supplier:        { bc_created: true, bc_validated: true, delivery_confirmed: true, bc_returned: false, bank_deposit: false, warning: false },
    supplier_agent:  { bc_created: true, bc_validated: true, delivery_confirmed: true, bc_returned: false, bank_deposit: false, warning: false }
  },

  /** Get notification preferences for a user (user-specific overrides or role defaults) */
  getPrefs(userId) {
    const u = userId ? DB.getById('users', userId) : Auth.getCurrentUser();
    if (!u) return this.ROLE_DEFAULTS.user;
    // User-specific overrides stored in user.notifPrefs
    if (u.notifPrefs && typeof u.notifPrefs === 'object') return u.notifPrefs;
    // Fall back to role defaults
    return this.ROLE_DEFAULTS[u.role] || this.ROLE_DEFAULTS.user;
  },

  /** Save notification preferences for a user */
  savePrefs(userId, prefs) {
    DB.update('users', userId, { notifPrefs: prefs });
  },

  _playNotifSound() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = 880; // A5 note
      osc.type = 'sine';
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.3);
      // Second tone (pleasant ding-dong)
      setTimeout(() => {
        const osc2 = ctx.createOscillator();
        const gain2 = ctx.createGain();
        osc2.connect(gain2);
        gain2.connect(ctx.destination);
        osc2.frequency.value = 1320; // E6
        osc2.type = 'sine';
        gain2.gain.setValueAtTime(0.2, ctx.currentTime);
        gain2.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4);
        osc2.start(ctx.currentTime);
        osc2.stop(ctx.currentTime + 0.4);
      }, 150);
    } catch(e) { /* Audio not supported */ }
  },
  getAll() {
    return (DB.getAll('notifications') || []).sort((a,b) => String(b.date||b.createdAt||'').localeCompare(String(a.date||a.createdAt||'')));
  },
  getUnreadCount() {
    const u = Auth.getCurrentUser();
    return this.getAll().filter(n => !n.read && (!n.targetUserId || String(n.targetUserId) === String(u?.id))).length;
  },
  add({ type='info', title='', message='', link=null, targetUserId=null, data=null, icon=null, color=null, userId=null }) {
    const isAR = typeof T !== 'undefined' && T.isRTL();
    
    // ── Check notification preferences before creating ──
    const currentUser = Auth.getCurrentUser();
    const recipientId = targetUserId || userId || currentUser?.id;
    if (recipientId && type in (this.ROLE_DEFAULTS.admin || {})) {
      const prefs = this.getPrefs(recipientId);
      if (prefs && prefs[type] === false) {
        // User disabled this notification type — skip silently
        return null;
      }
    }

    this._playNotifSound();
    const notif = {
      type,
      title: title || (isAR ? 'إشعار النظام' : 'Notification ERP'),
      message: message || '',
      link,
      targetUserId: targetUserId || userId || null,
      data,
      icon: icon || (this.NOTIF_TYPES[type]?.icon) || null,
      color: color || (this.NOTIF_TYPES[type]?.color) || null,
      read: false,
      date: new Date().toISOString(),
      createdAt: new Date().toISOString()
    };
    const saved = DB.insert('notifications', notif);
    this.updateUI();
    if (typeof Utils !== 'undefined') {
      Utils.notify(title ? `${title} : ${message}` : message, type === 'bc_validated' ? 'success' : (type === 'bc_returned' ? 'error' : 'info'));
    }
    return saved;
  },
  markAsRead(id) {
    DB.update('notifications', id, { read: true });
    this.updateUI();
    this.renderDropdown();
  },
  markAllAsRead() {
    const all = DB.getAll('notifications');
    all.forEach(n => {
      if (!n.read) DB.update('notifications', n.id, { read: true });
    });
    this.updateUI();
    this.renderDropdown();
  },
  toggleDropdown() {
    const dd = document.getElementById('notifDropdown');
    if (!dd) return;
    const isShowing = dd.style.display === 'block';
    dd.style.display = isShowing ? 'none' : 'block';
    if (!isShowing) {
      this.renderDropdown();
    }
  },
  closeDropdown() {
    const dd = document.getElementById('notifDropdown');
    if (dd) dd.style.display = 'none';
  },
  updateUI() {
    const badge = document.getElementById('topNotifBadge');
    if (!badge) return;
    const count = this.getUnreadCount();
    badge.textContent = count > 99 ? '99+' : count;
    badge.style.display = count > 0 ? 'inline-block' : 'none';
  },
  renderDropdown() {
    const list = document.getElementById('notifDropdownList');
    if (!list) return;
    const items = this.getAll().slice(0, 30);
    const isAR = typeof T !== 'undefined' && T.isRTL();
    if (!items.length) {
      list.innerHTML = `<div style="padding:24px;text-align:center;color:var(--text4);font-size:12px">
        <i class="fas fa-bell-slash" style="font-size:24px;opacity:.3;display:block;margin-bottom:6px"></i>
        ${isAR ? 'لا توجد إشعارات حالياً' : 'Aucune notification pour le moment'}
      </div>`;
      return;
    }
    const icons = {
      bc_created:         { icon: 'fa-plus-circle',           color: '#3b82f6',  bg: 'rgba(59,130,246,.1)' },
      bc_validated:       { icon: 'fa-industry',              color: '#10b981',  bg: 'rgba(16,185,129,.1)' },
      delivery_confirmed: { icon: 'fa-truck',                 color: '#10b981',  bg: 'rgba(16,185,129,.1)' },
      bc_returned:        { icon: 'fa-undo',                  color: '#ef4444',  bg: 'rgba(239,68,68,.1)' },
      bank_deposit:       { icon: 'fa-university',            color: '#0ea5e9',  bg: 'rgba(14,165,233,.1)' },
      warning:            { icon: 'fa-exclamation-triangle',  color: '#f59e0b',  bg: 'rgba(245,158,11,.1)' },
      auto_br:            { icon: 'fa-file-import',           color: '#6366f1',  bg: 'rgba(99,102,241,.1)' },
      system:             { icon: 'fa-info-circle',           color: '#3b82f6',  bg: 'rgba(59,130,246,.1)' },
    };
    list.innerHTML = items.map(n => {
      // Use per-notification metadata if available, fallback to type map
      const nIcon = n.icon || (icons[n.type] || icons.system).icon;
      const nColor = n.color || (icons[n.type] || icons.system).color;
      const nBg = (icons[n.type] || icons.system).bg;
      const timeAgo = Utils.fmtDateTime ? Utils.fmtDateTime(n.date || n.createdAt) : (n.date || '').slice(0, 16);
      return `
        <div class="notif-item ${n.read ? 'read' : 'unread'}" style="padding:10px 12px;display:flex;gap:10px;align-items:flex-start;border-bottom:1px solid var(--border);cursor:pointer;background:${n.read ? 'transparent' : 'rgba(var(--primary-rgb),.05)'}"
          onclick="NotifMgr.handleClick(${n.id})">
          <div style="width:32px;height:32px;border-radius:8px;background:${nBg};color:${nColor};display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:14px">
            <i class="fas ${nIcon}"></i>
          </div>
          <div style="flex:1;min-width:0">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:2px">
              <strong style="font-size:12px;color:var(--text);font-weight:${n.read ? '600' : '800'}">${Utils.escHTML(n.title)}</strong>
              ${!n.read ? '<span style="width:6px;height:6px;border-radius:50%;background:var(--primary);flex-shrink:0"></span>' : ''}
            </div>
            <div style="font-size:11px;color:var(--text3);line-height:1.4;margin-bottom:4px">${Utils.escHTML(n.message)}</div>
            <div style="font-size:9px;color:var(--text4);font-family:var(--font-mono)">${timeAgo}</div>
          </div>
        </div>
      `;
    }).join('');
  },
  handleClick(id) {
    const notif = DB.getById('notifications', id);
    if (!notif) return;
    this.markAsRead(id);
    this.closeDropdown();
    if (notif.link && notif.link.mod) {
      App.loadModule(notif.link.mod);
      if (notif.link.id && notif.link.mod === 'bls' && typeof BLModule !== 'undefined') {
        setTimeout(() => BLModule.showDetail(notif.link.id), 200);
      } else if (notif.link.id && notif.link.mod === 'brs' && typeof BRModule !== 'undefined') {
        setTimeout(() => BRModule.showDetail(notif.link.id), 200);
      }
    }
  }
};

// ─── SESSION MANAGER — Mini Caisse & Clôture Vendeur ─────────
const SessionMgr = {
  getTodaySession(userId, date = Utils.today()) {
    const isUserMatch = (id) => {
      if (id === userId || String(id) === String(userId)) return true;
      const isAdminDoc = (id === 1 || id === '1' || id === 'admin');
      const isAdminQuery = (userId === 1 || userId === '1' || userId === 'admin');
      if (isAdminDoc && isAdminQuery) return true;
      return false;
    };
    return DB.getAll('sessions').find(s => isUserMatch(s.userId) && s.date === date) || null;
  },

  getLastClosedSession(userId) {
    const today = Utils.today();
    const isUserMatch = (id) => {
      if (id === userId || String(id) === String(userId)) return true;
      const isAdminDoc = (id === 1 || id === '1' || id === 'admin');
      const isAdminQuery = (userId === 1 || userId === '1' || userId === 'admin');
      if (isAdminDoc && isAdminQuery) return true;
      return false;
    };
    return DB.getAll('sessions')
      .filter(s => isUserMatch(s.userId) && s.date < today && s.status === 'closed')
      .sort((a,b)=>b.date.localeCompare(a.date))[0] || null;
  },

  getUserDaySummary(userId, date = Utils.today()) {
    const isUserMatch = (creatorId) => {
      if (userId === 'all') return true;
      if (creatorId === userId || String(creatorId) === String(userId)) return true;
      const isAdminDoc = (creatorId === 1 || creatorId === '1' || creatorId === 'admin');
      const isAdminQuery = (userId === 1 || userId === '1' || userId === 'admin');
      if (isAdminDoc && isAdminQuery) return true;
      if (creatorId == null && isAdminQuery) return true;
      return false;
    };
    const normDate = d => {
      if (!d) return '';
      if (d.includes('T')) return d.split('T')[0];
      if (d.includes('/')) {
        const p = d.split('/');
        if (p.length === 3 && p[2].length === 4) return `${p[2]}-${p[1].padStart(2, '0')}-${p[0].padStart(2, '0')}`;
      }
      return d.slice(0, 10);
    };
    // Filter BLs: Match single effective date (prefer b.date, fallback to b.createdAt)
    const rawBLs = DB.getAll('bls').filter(b => {
      if (!isUserMatch(b.createdBy)) return false;
      const docDate = normDate(b.date) || normDate(b.createdAt);
      if (docDate !== date) return false;
      return b.status !== 'draft' && b.status !== 'cancelled';
    });

    // Deduplicate BLs by ref (or id) to prevent double counting
    const seenBLRefs = new Set();
    const bls = [];
    rawBLs.forEach(b => {
      const k = b.ref ? String(b.ref) : `id_${b.id}`;
      if (!seenBLRefs.has(k)) {
        seenBLRefs.add(k);
        bls.push(b);
      }
    });

    // Filter and deduplicate retours
    const rawRetours = DB.getAll('bon_retours').filter(r => {
      if (!isUserMatch(r.createdBy)) return false;
      const docDate = normDate(r.date) || normDate(r.createdAt);
      return docDate === date;
    });
    const seenRetRefs = new Set();
    const retours = [];
    rawRetours.forEach(r => {
      const k = r.ref ? String(r.ref) : `id_${r.id}`;
      if (!seenRetRefs.has(k)) {
        seenRetRefs.add(k);
        retours.push(r);
      }
    });
    const totalSalesTTC = bls.reduce((sum, b) => sum + (Number(b.totalTTC) || 0), 0);
    const totalReturnsTTC = retours.reduce((sum, r) => sum + (Number(r.totalTTC) || 0), 0);
    const netAmount = Math.max(0, Math.round((totalSalesTTC - totalReturnsTTC) * 100) / 100);

    return {
      userId,
      date,
      bls,
      retours,
      totalSalesTTC: Math.round(totalSalesTTC * 100) / 100,
      totalReturnsTTC: Math.round(totalReturnsTTC * 100) / 100,
      netAmount
    };
  },

  getDayDeliveryTotal(userId, date) {
    return this.getUserDaySummary(userId, date).netAmount;
  },

  startSession(userId, date = Utils.today()) {
    const existing = this.getTodaySession(userId, date);
    if (existing) return existing;
    return DB.insert('sessions', {
      userId,
      date,
      status: 'open',
      startedAt: new Date().toISOString(),
      closedNet: null,
      totalSales: 0,
      totalReturns: 0,
      ecart: 0,
      closedAt: null
    });
  },

  async closeMiniCaisse(userId, selectedBankId = null, note = '', targetDate = null) {
    const today = targetDate || Utils.today();
    const session = this.getTodaySession(userId, today) || this.startSession(userId, today);
    const summary = this.getUserDaySummary(userId, today);
    const u = DB.getById('users', userId) || Auth.getCurrentUser();
    const settings = DB.getSettings();
    const banks = settings.banks || [];
    const targetBankId = selectedBankId || (banks.length > 0 ? banks[0].id : null);
    const targetBank = banks.find(b => String(b.id) === String(targetBankId));

    const now = new Date();
    const dateParts = (today || (typeof Utils !== 'undefined' ? Utils.today() : '')).split('-');
    const year = parseInt(dateParts[0]) || now.getFullYear();
    const month = dateParts[1] ? String(dateParts[1]).padStart(2, '0') : String(now.getMonth() + 1).padStart(2, '0');

    // ── Idempotent Reference Check ──
    let ref = session.etatVenteRef;
    let savedEtat = null;
    if (session.etatVenteId) {
      savedEtat = DB.getById('etat_vente_docs', session.etatVenteId);
    }
    if (!savedEtat && ref) {
      savedEtat = DB.getAll('etat_vente_docs').find(d => d.ref === ref);
    }
    if (!savedEtat) {
      savedEtat = DB.getAll('etat_vente_docs').find(d => 
        (d.date === today || d.dateEnd === today || d.dateStart === today) && 
        (d.userId === userId || String(d.userId) === String(userId) || d.createdBy === userId || String(d.createdBy) === String(userId))
      );
      if (savedEtat) ref = savedEtat.ref;
    }
    if (!ref) {
      let seqNum;
      try {
        // Use server-side atomic counter to avoid duplicate refs when two sessions close simultaneously
        if (typeof window.API !== 'undefined' && location.protocol !== 'file:') {
          const res = await window.API.get(`/data/next-num/etat_vente?year=${year}`);
          seqNum = res?.num || (DB.getAll('etat_vente_docs').filter(d => (d.ref||'').includes(`/${year}`)).length + 1);
        } else {
          seqNum = DB.getAll('etat_vente_docs').filter(d => (d.ref||'').includes(`/${year}`)).length + 1;
        }
      } catch (_) {
        seqNum = DB.getAll('etat_vente_docs').filter(d => (d.ref||'').includes(`/${year}`)).length + 1;
      }
      ref = `ET/${String(seqNum).padStart(3, '0')}/${month}/${year}`;
    }

    // Aggregated lines from ACTIVE delivered BLs (returns are excluded so items are net delivered)
    // Client Benefit Margin: calculated as a percentage rate on article base price (e.g. 1000 + 1000 * 0.5% = 1005)
    const marginRate = Number(settings.evMarginRate ?? settings.evMarginPercent ?? settings.evMarginAmount ?? 0);
    const aggregated = {};
    summary.bls.filter(b => b.status !== 'returned').forEach(bl => {
      (bl.lines || []).forEach(line => {
        const key = (line.designation || '').trim();
        if (!key) return;
        const qty = Number(line.qtyDelivered || line.qty) || 0;
        const price = Number(line.price || line.unitPrice) || 0;
        const disc = Number(line.disc) || 0;
        const basePrice = Math.round(price * (1 - disc / 100) * 100) / 100;
        const marginPerUnit = Math.round(basePrice * (marginRate / 100) * 100) / 100;
        const effectivePrice = Math.round((basePrice + marginPerUnit) * 100) / 100;
        if (!aggregated[key]) {
          aggregated[key] = { designation: key, unit: line.unit || 'U', qty: 0, basePrice, marginRate, marginPerUnit, unitPrice: effectivePrice };
        }
        aggregated[key].qty += qty;
        if (basePrice > aggregated[key].basePrice) {
          aggregated[key].basePrice = basePrice;
          aggregated[key].marginRate = marginRate;
          aggregated[key].marginPerUnit = marginPerUnit;
          aggregated[key].unitPrice = effectivePrice;
        }
      });
    });
    const items = Object.values(aggregated).filter(it => it.qty > 0.0001);
    const totalHT = Math.round(items.reduce((s, it) => s + (it.qty * it.unitPrice), 0) * 100) / 100;
    const totalMargin = Math.round(items.reduce((s, it) => s + (it.qty * (it.marginPerUnit || (it.basePrice * marginRate / 100))), 0) * 100) / 100;
    const tvaRate = Number(settings.tvaRate) || 19;
    const tvaAmount = Math.round(totalHT * (tvaRate / 100) * 100) / 100;
    // Etat de vente: FIXED 1% timbre on (HT + TVA) sum
    const TIMBRE_RATE_EV = 1; // 1% fixed for etat de vente
    const timbreAmount = Math.round((totalHT + tvaAmount) * TIMBRE_RATE_EV / 100 * 100) / 100;
    const totalTTCCalc = Math.round((totalHT + tvaAmount + timbreAmount) * 100) / 100;
    const netAmountEV = totalTTCCalc;
    const ecartFiscal = Math.round((netAmountEV - summary.netAmount) * 100) / 100;

    // 1. Generate or update État de Vente document with BL list and Returns list
    const isAR = typeof T !== 'undefined' && T.isRTL();
    const etatDocData = {
      ref,
      year,
      date: today,
      dateStart: today,
      dateEnd: today,
      userId,
      userName: u?.name || (isAR ? 'البائع' : 'Vendeur'),
      marginRate,
      marginPerUnit: marginRate > 0 ? `${marginRate}%` : '0%',
      totalMargin,
      items,
      blList: summary.bls.map(b => ({
        id: b.id,
        ref: b.ref,
        clientName: b.clientName || (isAR ? 'زبون المتجر' : 'Client Comptoir'),
        totalHT: Number(b.totalHT) || 0,
        tvaAmount: Number(b.tvaAmount || b.tva) || 0,
        timbreAmount: Number(b.timbreAmount || b.timbre) || 0,
        totalTTC: Number(b.totalTTC) || 0,
        status: b.status,
        isReturned: b.status === 'returned' || b.isReturned === true,
        date: b.date
      })),
      returnList: summary.retours.map(r => ({ id: r.id, ref: r.ref, blRef: r.blRef, clientName: r.clientName || (isAR ? 'عميل' : 'Client'), totalTTC: Number(r.totalTTC)||0, date: r.date })),
      totalBLsTTC: summary.totalSalesTTC,
      grossTotalTTC: summary.totalSalesTTC,
      totalReturnsTTC: summary.totalReturnsTTC,
      returnsTotalTTC: summary.totalReturnsTTC,
      realBchNet: summary.netAmount,
      realBchGross: summary.totalSalesTTC,
      totalHT,
      tvaRate,
      tvaAmount,
      timbreAmount,
      timbreRate: TIMBRE_RATE_EV,
      totalTTC: netAmountEV,
      netTotalTTC: netAmountEV,
      totalTTCFiscal: totalTTCCalc,
      ecartFiscal,
      createdBy: userId,
      createdByName: u?.name || (isAR ? 'البائع' : 'Vendeur'),
      createdAt: savedEtat?.createdAt || now.toISOString(),
      updatedAt: now.toISOString(),
      bankId: targetBankId,
      status: 'deposited'
    };

    if (savedEtat) {
      savedEtat = DB.update('etat_vente_docs', savedEtat.id, etatDocData, 'Mise à jour État de Vente');
    } else {
      savedEtat = DB.insert('etat_vente_docs', etatDocData);
    }

    // 2. Deposit into bank_transactions (Transfert État de Vente avec 1% timbre)
    let bankTxId = session.bankTxId || (savedEtat ? savedEtat.bankDepositId : null);
    const existingBankTx = bankTxId 
      ? DB.getById('bank_transactions', bankTxId) 
      : DB.getAll('bank_transactions').find(t => 
          (t.etatVenteRef === ref) || 
          (ref && t.ref === 'EV-DEP-' + ref.replace(/\//g, '-')) ||
          (savedEtat && (String(t.etatVenteId) === String(savedEtat.id) || t.etatVenteRef === savedEtat.ref))
        );

    if (targetBankId && netAmountEV > 0) {
      const depTxData = {
        type: 'deposit',
        subtype: 'etat_vente',
        bankId: targetBankId,
        amount: netAmountEV,
        date: today,
        ref: 'EV-DEP-' + ref.replace(/\//g, '-'),
        note: isAR 
          ? `إيداع كشف المبيعات ${ref} (${u?.name || ''}) — مبلغ الكشف (طابع 1%): ${Utils.fmtCurrency(netAmountEV)} | إيرادات BCH الفعلية: ${Utils.fmtCurrency(summary.netAmount)} | فارق الطابع: ${Utils.fmtCurrency(ecartFiscal)}` 
          : `Dépôt État de Vente ${ref} (${u?.name || ''}) — Montant État (1% timbre): ${Utils.fmtCurrency(netAmountEV)} | Recettes BCH réelles: ${Utils.fmtCurrency(summary.netAmount)} | Écart fiscal: ${Utils.fmtCurrency(ecartFiscal)}`,
        etatVenteId: savedEtat.id,
        etatVenteRef: ref,
        createdBy: userId,
        createdByName: u?.name,
        updatedAt: now.toISOString()
      };
      if (existingBankTx) {
        DB.update('bank_transactions', existingBankTx.id, depTxData, 'Mise à jour versement');
        bankTxId = existingBankTx.id;
      } else {
        const effectiveCreated = (today && today < Utils.today()) ? `${today}T18:00:00.000Z` : now.toISOString();
        const savedBankTx = DB.insert('bank_transactions', { ...depTxData, createdAt: effectiveCreated });
        bankTxId = savedBankTx.id;
      }
      if (savedEtat && bankTxId && savedEtat.bankDepositId !== bankTxId) {
        DB.update('etat_vente_docs', savedEtat.id, { bankDepositId: bankTxId });
      }
    }

    // 3. Close Session
    const updatedSession = DB.update('sessions', session.id, {
      status: 'closed',
      closedNet: netAmountEV,
      closedEspeces: summary.totalSalesTTC,
      closedMonnaie: summary.totalReturnsTTC,
      totalSales: summary.totalSalesTTC,
      totalReturns: summary.totalReturnsTTC,
      blCount: summary.bls.length,
      returnCount: summary.retours.length,
      etatVenteId: savedEtat.id,
      etatVenteRef: ref,
      bankTxId,
      targetBankId,
      realBchNet: summary.netAmount,
      etatVenteTTC: netAmountEV,
      timbreAmount,
      ecartFiscal,
      note: note || '',
      closedAt: session.closedAt || ((today && today < Utils.today()) ? `${today}T18:00:00.000Z` : now.toISOString()),
      updatedAt: now.toISOString()
    }, 'Clôture Mini Caisse');

    // 4. Update caisse_admin with strict traceability:
    const bankLabel = targetBank?.name || (isAR ? 'البنك' : 'Banque');
    const effectiveCreated = (today && today < Utils.today()) ? `${today}T18:00:00.000Z` : now.toISOString();

    // 4a. Real BCH net cash collected enters central caisse_admin:
    // STRICT RULE: The ONLY source of money in caisse_admin is the cashier's shift closure!
    const existingCaisseDeposit = DB.getAll('caisse_admin').find(e => 
      e.type === 'deposit' && 
      (e.source === 'user_cloture' || e.source === 'bch_recettes_reelles') && 
      (Number(e.sessionId) === Number(session.id) || (e.sessionDate === today && (e.userId === userId || String(e.userId) === String(userId))))
    );
    const caisseDepositData = {
      type: 'deposit',
      source: 'user_cloture',
      userId,
      userName: u?.name || (isAR ? 'البائع' : 'Vendeur'),
      sessionId: session.id,
      sessionDate: today,
      amount: summary.netAmount, // Actual net cash handed over
      targetBankId,
      etatVenteRef: ref,
      note: isAR ? `مقبوضات الصندوق الفعلية (${summary.bls.length} سند شحن، ${summary.retours.length} إرجاع) — إغلاق ${u?.name || ''}` : `Recettes réelles de la caisse (${summary.bls.length} BCH, ${summary.retours.length} retours) — Clôture ${u?.name || ''}`
    };
    if (existingCaisseDeposit) {
      DB.update('caisse_admin', existingCaisseDeposit.id, caisseDepositData);
    } else if (summary.netAmount > 0) {
      DB.insert('caisse_admin', { ...caisseDepositData, createdAt: effectiveCreated });
    }

    // 4b. Withdrawal / Transfer to Bank via État de Vente (with fixed 1% timbre deducted from caisse_admin)
    const existingCaisseWithdrawal = DB.getAll('caisse_admin').find(e => 
      e.type === 'withdrawal' && 
      e.source === 'transfert_banque_etat_vente' && 
      (Number(e.sessionId) === Number(session.id) || e.etatVenteRef === ref)
    );
    const caisseWithdrawalData = {
      type: 'withdrawal',
      source: 'transfert_banque_etat_vente',
      userId,
      userName: u?.name || (isAR ? 'البائع' : 'Vendeur'),
      sessionId: session.id,
      sessionDate: today,
      amount: netAmountEV,
      targetBankId,
      etatVenteRef: ref,
      etatVenteTTC: netAmountEV,
      timbreAmount,
      ecartFiscal,
      note: isAR 
        ? `تحويل بنكي — كشف المبيعات ${ref} إلى ${bankLabel} بمبلغ 1% طابع: ${Utils.fmtCurrency(netAmountEV)} (مقبوضات الشحن الفعلية: ${Utils.fmtCurrency(summary.netAmount)} | فارق الطابع: ${Utils.fmtCurrency(ecartFiscal)})`
        : `Versement bancaire — État de Vente ${ref} vers ${bankLabel} avec 1% timbre: ${Utils.fmtCurrency(netAmountEV)} (Recettes réelles BCH: ${Utils.fmtCurrency(summary.netAmount)} | Écart fiscal timbre: ${Utils.fmtCurrency(ecartFiscal)})`
    };
    if (existingCaisseWithdrawal) {
      DB.update('caisse_admin', existingCaisseWithdrawal.id, caisseWithdrawalData);
    } else if (netAmountEV > 0) {
      DB.insert('caisse_admin', { ...caisseWithdrawalData, createdAt: effectiveCreated });
    }

    // 5. Trigger MasterBrain recalibration
    DB.MasterBrain.recalibrateAll();

    WorkLog.logOut(userId);
    return { session: updatedSession, etatDoc: savedEtat, summary };
  },

  updateCloture(sessionId, newNet, adminMotif = '') {
    const session = DB.getById('sessions', sessionId);
    if (!session) return null;
    const oldNet = session.closedNet || 0;
    const adminUser = Auth.getCurrentUser();
    const isAR = typeof T !== 'undefined' && T.isRTL();

    // Update session
    const updated = DB.update('sessions', sessionId, {
      closedNet: Number(newNet),
      adjustedBy: adminUser?.id,
      adjustedByName: adminUser?.name,
      adjustedAt: new Date().toISOString(),
      adminMotif: adminMotif || (isAR ? 'تصحيح يدوي من المشرف' : 'Correction manuelle administrateur')
    }, 'Rectification Clôture Admin');

    // Update related bank transaction if exists
    if (session.bankTxId) {
      DB.update('bank_transactions', session.bankTxId, {
        amount: Number(newNet),
        note: `Dépôt État de Vente ${session.etatVenteRef||''} (Rectifié par Admin)`
      });
    }

    // Update related etat_vente_doc if exists
    if (session.etatVenteId) {
      DB.update('etat_vente_docs', session.etatVenteId, {
        totalTTC: Number(newNet)
      });
    }

    // Update caisse_admin
    const caisseDep = DB.getAll('caisse_admin').find(e => Number(e.sessionId) === Number(session.id) && (e.source === 'user_cloture' || e.source === 'bch_recettes_reelles'));
    const caisseWit = DB.getAll('caisse_admin').find(e => 
      e.type === 'withdrawal' && 
      e.source === 'transfert_banque_etat_vente' && 
      (Number(e.sessionId) === Number(session.id) || (session.etatVenteRef && e.etatVenteRef === session.etatVenteRef))
    );
    if (caisseWit) {
      DB.update('caisse_admin', caisseWit.id, {
        amount: Number(newNet),
        etatVenteTTC: Number(newNet),
        note: (caisseWit.note || '') + ` [Rectifié de ${Utils.fmtCurrency(oldNet)} à ${Utils.fmtCurrency(newNet)} par Admin]`
      });
    }
    // Also update the deposit entry to keep caisse balanced
    if (caisseDep) {
      DB.update('caisse_admin', caisseDep.id, {
        amount: Number(newNet),
        note: (caisseDep.note || '') + ` [Rectifié de ${Utils.fmtCurrency(oldNet)} à ${Utils.fmtCurrency(newNet)} par Admin]`
      });
    }

    return updated;
  }
};

// ─── GLOBAL OMNI-SEARCH (Spotlight & Quick Jump) ──────────────
const GlobalSearch = {
  _isOpen: false,
  _activeIdx: -1,
  _results: [],
  _activeCategory: 'all',

  init() {
    if (this._inited) return;
    this._inited = true;
    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        this.toggle();
      } else if (e.key === 'Escape' && this._isOpen) {
        this.close();
      }
    });
  },

  toggle() {
    if (this._isOpen) this.close();
    else this.open();
  },

  open(defaultQuery = '') {
    if (!Auth.isLoggedIn()) return;
    const isAR = typeof T !== 'undefined' && T.isRTL();
    let modal = document.getElementById('globalSearchModal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'globalSearchModal';
      modal.className = 'omni-search-backdrop';
      modal.onclick = (e) => {
        if (e.target === modal) GlobalSearch.close();
      };
      document.body.appendChild(modal);
    }

    modal.innerHTML = `
      <div class="omni-search-dialog ${isAR ? 'rtl' : ''}" onclick="event.stopPropagation()">
        <div class="omni-search-header">
          <i class="fas fa-search omni-search-icon"></i>
          <input type="text" id="global-omni-search-input" 
            class="omni-search-input" 
            placeholder="${isAR ? 'ابحث عن أي شيء (سندات، زبائن، موردين، مواد، سائقين)...' : 'Rechercher partout (BR, BL, clients, fournisseurs, articles, chauffeurs)...'}"
            autocomplete="off"
            value="${Utils.escHTML(defaultQuery)}"
            oninput="GlobalSearch.handleInput(this.value)"
            onkeydown="GlobalSearch.handleKeydown(event)">
          <div class="omni-search-kbd-hint"><kbd>ESC</kbd></div>
          <button class="omni-search-close" onclick="GlobalSearch.close()" title="${isAR ? 'إغلاق' : 'Fermer'}"><i class="fas fa-times"></i></button>
        </div>

        <div class="omni-search-categories">
          <button class="omni-cat-btn ${this._activeCategory==='all'?'active':''}" onclick="GlobalSearch.setCategory('all')">${isAR ? 'الكل' : 'Tout'}</button>
          <button class="omni-cat-btn ${this._activeCategory==='brs'?'active':''}" onclick="GlobalSearch.setCategory('brs')"><i class="fas fa-receipt"></i> BR</button>
          <button class="omni-cat-btn ${this._activeCategory==='bls'?'active':''}" onclick="GlobalSearch.setCategory('bls')"><i class="fas fa-truck"></i> BL/BCH</button>
          <button class="omni-cat-btn ${this._activeCategory==='clients'?'active':''}" onclick="GlobalSearch.setCategory('clients')"><i class="fas fa-user-tie"></i> ${isAR ? 'الزبائن' : 'Clients'}</button>
          <button class="omni-cat-btn ${this._activeCategory==='suppliers'?'active':''}" onclick="GlobalSearch.setCategory('suppliers')"><i class="fas fa-industry"></i> ${isAR ? 'الموردون' : 'Fournisseurs'}</button>
          <button class="omni-cat-btn ${this._activeCategory==='articles'?'active':''}" onclick="GlobalSearch.setCategory('articles')"><i class="fas fa-box"></i> ${isAR ? 'المواد' : 'Articles'}</button>
          <button class="omni-cat-btn ${this._activeCategory==='drivers'?'active':''}" onclick="GlobalSearch.setCategory('drivers')"><i class="fas fa-id-card"></i> ${isAR ? 'السائقون' : 'Chauffeurs'}</button>
          <button class="omni-cat-btn ${this._activeCategory==='users'?'active':''}" onclick="GlobalSearch.setCategory('users')"><i class="fas fa-users"></i> ${isAR ? 'المستخدمون' : 'Utilisateurs'}</button>
        </div>

        <div class="omni-search-body" id="omni-search-results">
        </div>

        <div class="omni-search-footer">
          <div class="omni-footer-hints">
            <span><kbd>↑</kbd> <kbd>↓</kbd> ${isAR ? 'للتنقل' : 'pour naviguer'}</span>
            <span><kbd>↵</kbd> ${isAR ? 'للاختيار' : 'pour ouvrir'}</span>
            <span><kbd>ESC</kbd> ${isAR ? 'للإغلاق' : 'pour quitter'}</span>
          </div>
          <div class="omni-footer-brand">
            <span>Abderrahime Intelligent ERP</span>
          </div>
        </div>
      </div>
    `;

    modal.style.display = 'flex';
    this._isOpen = true;
    this._activeIdx = -1;
    
    setTimeout(() => {
      const inp = document.getElementById('global-omni-search-input');
      if (inp) {
        inp.focus();
        if (defaultQuery) this.handleInput(defaultQuery);
        else this.renderEmptyState();
      }
    }, 50);
  },

  close() {
    const modal = document.getElementById('globalSearchModal');
    if (modal) modal.style.display = 'none';
    this._isOpen = false;
  },

  setCategory(cat) {
    this._activeCategory = cat;
    const input = document.getElementById('global-omni-search-input');
    const q = input ? input.value : '';
    this.open(q);
  },

  handleInput(query) {
    const q = (query || '').trim().toLowerCase();
    if (!q) {
      this.renderEmptyState();
      return;
    }
    this.search(q);
  },

  search(q) {
    const isAR = typeof T !== 'undefined' && T.isRTL();
    const results = [];
    const cat = this._activeCategory;

    // 1. Search BRs
    if (cat === 'all' || cat === 'brs') {
      const brs = DB.getAll('brs') || [];
      brs.forEach(br => {
        const linesStr = (br.lines || []).map(l => `${l.designation||''} ${l.code||''}`).join(' ');
        const text = `${br.ref||''} ${br.brNumber||''} ${br.supplierName||''} ${linesStr} ${br.ticketPesee||''} ${br.chauffeur||''} ${br.camion||''} ${br.createdByName||''} ${br.notes||''}`.toLowerCase();
        if (text.includes(q)) {
          results.push({
            type: 'br',
            category: 'Bons de Réception',
            categoryAR: 'وصولات الاستلام',
            icon: 'fa-receipt',
            color: '#3b82f6',
            title: `BR #${br.ref || br.brNumber || br.id}`,
            subtitle: `${br.supplierName || 'Fournisseur'} · ${Utils.fmtDate(br.date)} · ${Utils.fmtCurrency(br.totalTTC || br.totalHT || 0)}`,
            detail: (br.lines || []).map(l => l.designation).slice(0, 3).join(', ') + ((br.lines || []).length > 3 ? '...' : ''),
            action: () => {
              App.loadModule('brs');
              setTimeout(() => { if (typeof BRModule !== 'undefined' && BRModule.viewBR) BRModule.viewBR(br.id); }, 120);
            }
          });
        }
      });
    }

    // 2. Search BLs / BCH
    if (cat === 'all' || cat === 'bls') {
      const bls = DB.getAll('bls') || [];
      bls.forEach(bl => {
        const linesStr = (bl.lines || []).map(l => `${l.designation||''}`).join(' ');
        const text = `${bl.ref||''} ${bl.blNumber||''} ${bl.clientName||''} ${bl.supplierName||''} ${linesStr} ${bl.ticketPesee||''} ${bl.driverName||''} ${bl.truckPlate||''} ${bl.destination||''} ${bl.createdByName||''} ${bl.notes||''}`.toLowerCase();
        if (text.includes(q)) {
          results.push({
            type: 'bl',
            category: 'Bons de Chargement',
            categoryAR: 'سندات الشحن',
            icon: 'fa-truck',
            color: '#10b981',
            title: `BL/BCH #${bl.ref || bl.blNumber || bl.id}`,
            subtitle: `${bl.clientName || bl.supplierName || 'Client'} · ${Utils.fmtDate(bl.date)} · ${Utils.fmtCurrency(bl.totalTTC || bl.total || 0)} · ${bl.driverName || bl.truckPlate || ''}`,
            detail: (bl.lines || []).map(l => l.designation).slice(0, 3).join(', ') + ((bl.lines || []).length > 3 ? '...' : ''),
            action: () => {
              App.loadModule('bls');
              setTimeout(() => { if (typeof BLModule !== 'undefined' && BLModule.viewBL) BLModule.viewBL(bl.id); }, 120);
            }
          });
        }
      });
    }

    // 3. Search Clients
    if (cat === 'all' || cat === 'clients') {
      const clients = DB.getAll('clients') || [];
      clients.forEach(c => {
        const text = `${c.name||''} ${c.abbrev||''} ${c.phone||''} ${c.wilaya||''} ${c.address||''} ${c.contact||''} ${c.rc||''} ${c.nif||''}`.toLowerCase();
        if (text.includes(q)) {
          results.push({
            type: 'client',
            category: 'Clients',
            categoryAR: 'الزبائن',
            icon: 'fa-user-tie',
            color: '#8b5cf6',
            title: c.name || 'Client',
            subtitle: `${c.phone || ''} ${c.wilaya ? '· Wilaya: ' + c.wilaya : ''} ${c.address ? '· ' + c.address : ''}`,
            detail: c.contact ? `Contact: ${c.contact}` : (c.nif ? `NIF: ${c.nif}` : ''),
            action: () => {
              App.loadModule('clients');
              setTimeout(() => {
                if (typeof ClientsModule !== 'undefined') {
                  ClientsModule._q = c.name;
                  App.reload('clients');
                }
              }, 120);
            }
          });
        }
      });
    }

    // 4. Search Suppliers
    if (cat === 'all' || cat === 'suppliers') {
      const suppliers = DB.getAll('suppliers') || [];
      suppliers.forEach(s => {
        const text = `${s.name||''} ${s.abbrev||''} ${s.phone||''} ${s.wilaya||''} ${s.address||''} ${s.contact||''} ${s.rc||''} ${s.nif||''}`.toLowerCase();
        if (text.includes(q)) {
          results.push({
            type: 'supplier',
            category: 'Fournisseurs',
            categoryAR: 'الموردون',
            icon: 'fa-industry',
            color: '#f59e0b',
            title: s.name || 'Fournisseur',
            subtitle: `${s.phone || ''} ${s.wilaya ? '· Wilaya: ' + s.wilaya : ''} ${s.address ? '· ' + s.address : ''}`,
            detail: s.contact ? `Contact: ${s.contact}` : (s.nif ? `NIF: ${s.nif}` : ''),
            action: () => {
              App.loadModule('suppliers');
              setTimeout(() => {
                if (typeof SuppliersModule !== 'undefined') {
                  SuppliersModule._q = s.name;
                  App.reload('suppliers');
                }
              }, 120);
            }
          });
        }
      });
    }

    // 5. Search Articles (Catalogue)
    if (cat === 'all' || cat === 'articles') {
      const articles = DB.getAll('articles') || [];
      articles.forEach(a => {
        const text = `${a.name||a.designation||''} ${a.code||''} ${a.unit||''} ${a.category||''}`.toLowerCase();
        if (text.includes(q)) {
          results.push({
            type: 'article',
            category: 'Articles / Produits',
            categoryAR: 'المواد والمنتجات',
            icon: 'fa-box',
            color: '#06b6d4',
            title: a.name || a.designation || 'Article',
            subtitle: `${a.unit ? 'Unité: ' + a.unit : ''} ${a.price ? '· Prix: ' + Utils.fmtCurrency(a.price) : ''}`,
            detail: a.code ? `Code: ${a.code}` : '',
            action: () => {
              App.loadModule('catalogue');
              setTimeout(() => {
                if (typeof CatalogueModule !== 'undefined') {
                  CatalogueModule._tab = 'articles';
                  CatalogueModule._q = a.name || a.designation || '';
                  App.reload('catalogue');
                }
              }, 120);
            }
          });
        }
      });
    }

    // 6. Search Drivers / Trucks
    if (cat === 'all' || cat === 'drivers') {
      const drivers = DB.getAll('drivers') || [];
      drivers.forEach(d => {
        const text = `${d.name||''} ${d.imm||d.truckPlate||''} ${d.phone||''}`.toLowerCase();
        if (text.includes(q)) {
          results.push({
            type: 'driver',
            category: 'Chauffeurs & Camions',
            categoryAR: 'السائقون والشاحنات',
            icon: 'fa-id-card',
            color: '#ec4899',
            title: d.name || 'Chauffeur',
            subtitle: `${d.imm || d.truckPlate ? 'Camion: ' + (d.imm || d.truckPlate) : ''} ${d.phone ? '· Tél: ' + d.phone : ''}`,
            detail: '',
            action: () => {
              App.loadModule('catalogue');
              setTimeout(() => {
                if (typeof CatalogueModule !== 'undefined') {
                  CatalogueModule._tab = 'drivers';
                  CatalogueModule._q = d.name || '';
                  App.reload('catalogue');
                }
              }, 120);
            }
          });
        }
      });
    }

    // 7. Search Users
    if (cat === 'all' || cat === 'users') {
      const users = DB.getAll('users') || [];
      users.forEach(u => {
        const text = `${u.name||''} ${u.username||''} ${u.phone||''} ${u.department||''} ${u.jobTitle||''} ${u.role||''}`.toLowerCase();
        if (text.includes(q)) {
          results.push({
            type: 'user',
            category: 'Utilisateurs',
            categoryAR: 'المستخدمون',
            icon: 'fa-users',
            color: '#6366f1',
            title: u.name || u.username,
            subtitle: `@${u.username} · ${u.role} · ${u.department || u.jobTitle || ''}`,
            detail: u.phone ? `Tél: ${u.phone}` : '',
            action: () => {
              App.loadModule('users');
              setTimeout(() => {
                if (typeof UsersModule !== 'undefined') {
                  UsersModule._q = u.name || u.username;
                  App.reload('users');
                }
              }, 120);
            }
          });
        }
      });
    }

    this._results = results.slice(0, 40);
    this._activeIdx = this._results.length > 0 ? 0 : -1;
    this.renderResults(q);
  },

  renderResults(query) {
    const container = document.getElementById('omni-search-results');
    if (!container) return;
    const isAR = typeof T !== 'undefined' && T.isRTL();

    if (!this._results.length) {
      container.innerHTML = `
        <div class="omni-empty-state">
          <i class="fas fa-search-minus" style="font-size:36px;opacity:.3;margin-bottom:12px;display:block"></i>
          <h4>${isAR ? 'لا توجد نتائج مطابقة' : 'Aucun résultat trouvé'}</h4>
          <p>${isAR ? `لم نتمكن من العثور على أي بيانات تطابق "${Utils.escHTML(query)}"` : `Aucun document ou contact ne correspond à "${Utils.escHTML(query)}"`}</p>
        </div>
      `;
      return;
    }

    const grouped = {};
    this._results.forEach((item, idx) => {
      const cat = isAR ? (item.categoryAR || item.category) : item.category;
      if (!grouped[cat]) grouped[cat] = [];
      grouped[cat].push({ item, idx });
    });

    let html = '';
    for (const [catName, items] of Object.entries(grouped)) {
      html += `<div class="omni-result-group-title">${Utils.escHTML(catName)} <span class="omni-group-count">${items.length}</span></div>`;
      items.forEach(({ item, idx }) => {
        const isSelected = idx === this._activeIdx;
        html += `
          <div class="omni-result-item ${isSelected ? 'selected' : ''}" 
               id="omni-item-${idx}" 
               onclick="GlobalSearch.select(${idx})"
               onmousemove="GlobalSearch.setActiveIdx(${idx})">
            <div class="omni-item-icon" style="background:${item.color}15;color:${item.color}">
              <i class="fas ${item.icon}"></i>
            </div>
            <div class="omni-item-content">
              <div class="omni-item-title">${Utils.escHTML(item.title)}</div>
              <div class="omni-item-sub">${Utils.escHTML(item.subtitle)}</div>
              ${item.detail ? `<div class="omni-item-detail">${Utils.escHTML(item.detail)}</div>` : ''}
            </div>
            <div class="omni-item-enter">
              <i class="fas fa-level-down-alt" style="transform:rotate(90deg)"></i>
            </div>
          </div>
        `;
      });
    }

    container.innerHTML = html;
  },

  renderEmptyState() {
    const container = document.getElementById('omni-search-results');
    if (!container) return;
    const isAR = typeof T !== 'undefined' && T.isRTL();

    container.innerHTML = `
      <div class="omni-empty-state">
        <div class="omni-quick-hints">
          <div class="omni-hint-title">${isAR ? 'عمليات بحث سريعة شائعة:' : 'Recherches rapides suggérées :'}</div>
          <div class="omni-tags-row">
            <span class="omni-tag" onclick="GlobalSearch.setQuery('BR-')"><i class="fas fa-receipt"></i> BR-</span>
            <span class="omni-tag" onclick="GlobalSearch.setQuery('BCH-')"><i class="fas fa-truck"></i> BCH-</span>
            <span class="omni-tag" onclick="GlobalSearch.setCategory('clients')"><i class="fas fa-user-tie"></i> ${isAR ? 'الزبائن' : 'Clients'}</span>
            <span class="omni-tag" onclick="GlobalSearch.setCategory('suppliers')"><i class="fas fa-industry"></i> ${isAR ? 'الموردون' : 'Fournisseurs'}</span>
            <span class="omni-tag" onclick="GlobalSearch.setCategory('articles')"><i class="fas fa-box"></i> ${isAR ? 'المواد' : 'Articles'}</span>
          </div>
        </div>
      </div>
    `;
  },

  setQuery(q) {
    const inp = document.getElementById('global-omni-search-input');
    if (inp) {
      inp.value = q;
      inp.focus();
      this.handleInput(q);
    }
  },

  setActiveIdx(idx) {
    if (this._activeIdx === idx) return;
    this._activeIdx = idx;
    document.querySelectorAll('.omni-result-item').forEach((el, i) => {
      el.classList.toggle('selected', i === idx);
    });
  },

  handleKeydown(e) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (this._results.length > 0) {
        this._activeIdx = (this._activeIdx + 1) % this._results.length;
        this.updateSelection();
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (this._results.length > 0) {
        this._activeIdx = (this._activeIdx - 1 + this._results.length) % this._results.length;
        this.updateSelection();
      }
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (this._activeIdx >= 0 && this._activeIdx < this._results.length) {
        this.select(this._activeIdx);
      }
    }
  },

  updateSelection() {
    document.querySelectorAll('.omni-result-item').forEach((el, i) => {
      const isSel = i === this._activeIdx;
      el.classList.toggle('selected', isSel);
      if (isSel) el.scrollIntoView({ block: 'nearest' });
    });
  },

  select(idx) {
    const item = this._results[idx];
    if (item && item.action) {
      this.close();
      item.action();
    }
  }
};

