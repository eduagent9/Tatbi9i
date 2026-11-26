export type AppLanguage='ar'|'fr'|'en';
export const translations={
 ar:{home:'الرئيسية',sales:'المبيعات',inventory:'المخزون',distribution:'التوزيع',purchases:'المشتريات',relations:'العلاقات',management:'الإدارة',language:'اللغة',company:'إدارة التوزيع والمبيعات',dashboard:'نظرة عامة',workspace:'مساحة العمل',owner:'المالك',depot_manager:'مسؤول الديبو',order_rep:'مندوب الطلبات',van_sales:'مندوب البيع بالسيارة',delivery_driver:'السائق',logout:'خروج',appName:'تطبيقي'},
 fr:{home:'Accueil',sales:'Ventes',inventory:'Stock',distribution:'Distribution',purchases:'Achats',relations:'Clients et fournisseurs',management:'Gestion',language:'Langue',company:'Gestion de distribution et ventes',dashboard:'Vue générale',workspace:'Espace de travail',owner:'Propriétaire',depot_manager:'Responsable dépôt',order_rep:'Commercial commandes',van_sales:'Vendeur itinérant',delivery_driver:'Chauffeur-livreur',logout:'Déconnexion',appName:'Tatbiqi'},
 en:{home:'Home',sales:'Sales',inventory:'Inventory',distribution:'Distribution',purchases:'Purchases',relations:'Customers & suppliers',management:'Management',language:'Language',company:'Distribution & sales management',dashboard:'Overview',workspace:'Workspace',owner:'Owner',depot_manager:'Depot manager',order_rep:'Order representative',van_sales:'Van sales representative',delivery_driver:'Delivery driver',logout:'Log out',appName:'Tatbiqi'}
} as const;
export type TranslationKey=keyof typeof translations.ar;
export function translate(language:AppLanguage,key:TranslationKey):string{return translations[language][key]??translations.ar[key];}
