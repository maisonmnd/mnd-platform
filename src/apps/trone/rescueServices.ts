import { servicesStore, removedServiceIds, type Service } from '../../shared/catalog';
import { HOUSE_BLANK } from '../../shared/store';
import { houseSettingsStore } from './routes/equipe/data';
import { REWRITE_DESCRIPTIONS, FILL_DESCRIPTIONS, DESC_REV } from './routes/vente/serviceDescriptions';

/* SAUVETAGE du 23 juillet 2026 — des prestations ont été supprimées du Catalogue
   (et la suppression s'est synchronisée : 81 → 53 sur le serveur). Les RENDEZ-VOUS,
   eux, n'ont jamais été touchés : ils référencent les prestations par identifiant,
   et sans la prestation ils perdaient leur libellé et leur prix d'affichage.

   Ce fichier porte la PHOTOGRAPHIE COMPLÈTE du catalogue relevée le 21 juillet
   (id, catégorie, nom, prix, mode) : `ensureRescuedServices()` RE-CRÉE toute
   prestation manquante, à l'identique — sans jamais toucher celles qui existent
   (les renommages/reprix faits depuis sont conservés). Les champs non couverts
   par la photographie (durée, maître, palier) repartent sur des valeurs sûres,
   à ajuster au Catalogue. UNE seule fois (marqueur synchronisé, posé après
   hydratation) : les suppressions VOLONTAIRES futures resteront supprimées. */

type Snap = { id: string; cat: string; name: string; price: number; mode?: 'variable' | 'devis' };

const SNAPSHOT_2026_07_21: Snap[] = [
  { id: 'sv-sinsin', cat: 'cat-gbeji', name: 'SÍNSIN™ Essentiel', price: 15000 },
  { id: 'sv-rituel-mpdkjmvq', cat: 'cat-gbeji', name: 'SÍNSIN™ Élaboré', price: 25000 },
  { id: 'sv-rituel-mpdqjycc', cat: 'cat-gbeji', name: 'SÍNSIN™ Ancrage', price: 15000 },
  { id: 'sv-locks-fines', cat: 'vekpe', name: 'VÈKPÈ™ Signature (Max 250 Locks)', price: 275000 },
  { id: 'sv-resserrage', cat: 'sinsin', name: 'Resserrage racines', price: 25000 },
  { id: 'sv-entretien-complet', cat: 'sinsin', name: 'Entretien complet', price: 40000 },
  { id: 'sv-coiffure-event', cat: 'gbeza', name: 'Shampoing doux MND', price: 8000 },
  { id: 'sv-yekpe-couleur', cat: 'cat-yekpe', name: 'YÈKPÈ™ Couleur', price: 20000 },
  { id: 'sv-microlocks', cat: 'vekpe', name: 'VÈKPÈ™ Essentiel (Max 150 Locks)', price: 135000 },
  { id: 'fff106cwgo', cat: 'vekpe', name: 'Diagnostic & Consultation (Perfectionnement Locks)', price: 10000 },
  { id: 'sv-rituel-mp1lproe', cat: 'cat-gbeji', name: 'GBÈZÀ™ Essentiel', price: 8000 },
  { id: 'sv-rituel-mpf69yj3', cat: 'cat-gbeji', name: 'GBÈZÀ™ Signature', price: 10000 },
  { id: 'sv-rituel-mpdgup11', cat: 'cat-gbeji', name: 'GBÈZÀ™ Prestige', price: 17000 },
  { id: 'sv-reprise-locks', cat: 'agbo', name: 'Reprise de locks abîmées', price: 55000 },
  { id: 'sv-yekpe-lumiere', cat: 'cat-yekpe', name: 'YÈKPÈ™ Lumière', price: 25000 },
  { id: 'svc-vekpe-microlocks', cat: 'vekpe', name: 'Création Microlocks sur mesure', price: 0, mode: 'devis' },
  { id: 'sv-sos-restauration', cat: 'agbo', name: 'SOS restauration couronne', price: 90000 },
  { id: 'sv-rituel-mpdgwgqc', cat: 'cat-gbeji', name: 'GBÈZÀ™ Suprême', price: 22000 },
  { id: 'sv-bain-vapeur', cat: 'finfin', name: 'VÍVÍVÓ™ Le Soin Assouplissant', price: 20000 },
  { id: 'sv-dandan', cat: 'cat-gbeji', name: 'DÀNDÀN™ Le Soin Hydratant', price: 20000 },
  { id: 'sv-wewe', cat: 'cat-gbeji', name: 'WÈWÈ™ Le Soin Détox', price: 20000 },
  { id: 'sv-vivivo', cat: 'cat-gbeji', name: 'VÍVÍVÓ™ Le Soin Croissance', price: 12000 },
  { id: 'sv-locks-moyennes', cat: 'vekpe', name: 'VÈKPÈ™ Prestige (Max 350 Locks)', price: 385000 },
  { id: 'zebpkpg6ar', cat: 'finfin', name: 'WÈWÈ™ Le Soin Détox', price: 20000 },
  { id: 'svc-doto-creation', cat: 'doto', name: 'Consultation Création, Première couronne', price: 15000 },
  { id: 'svc-doto-conseil', cat: 'doto', name: 'Consultation Conseil & Diagnostic', price: 5000 },
  { id: 'sv-rituel-mr6p76kx', cat: 'cat-xyz-mp0sa7wk', name: 'FÍFÀ™ Dòdò - Twists mèches naturelles', price: 20000 },
  { id: 'sv-rituel-mr3szmso', cat: 'cat-vekpe', name: 'Diagnostic Repair Locks', price: 10000 },
  { id: 'svc-doto-reparation', cat: 'doto', name: 'Consultation Locks Repair', price: 10000 },
  { id: 'hldnt5bhtq', cat: 'vekpe', name: 'Diagnostic & Consultation (Conception Locks)', price: 15000 },
  { id: '47noorddot', cat: 'dodo', name: 'Perfectodil 5%', price: 25000 },
  { id: 'svc-vekpe-traditionnelles', cat: 'vekpe', name: 'Création Locks Traditionnelles', price: 50000, mode: 'variable' },
  { id: 'svc-vekpe-crochet', cat: 'vekpe', name: 'Création Locks Instantanées (au crochet)', price: 60000, mode: 'variable' },
  { id: 'sv-rituel-mqkoqjub', cat: 'cat-xyz-mp0sa7wk', name: 'GBÀTA™ Métis', price: 10000 },
  { id: 'sv-rituel-mqkoruz9', cat: 'cat-xyz-mp0sa7wk', name: 'GBÀTA™ Ivoire', price: 10000 },
  { id: 'sv-vekpe-essentiel', cat: 'cat-vekpe', name: 'VÈKPÈ™ Courts', price: 80000 },
  { id: 'sv-rituel-mpxrsfv3', cat: 'cat-gbeji', name: 'SÍNSIN™ Essentiel', price: 60000, mode: 'devis' },
  { id: 'sv-rituel-quatre-temps', cat: 'finfin', name: 'DÀNDÀN™ Le Soin Hydratant', price: 22000 },
  { id: 'sv-rituel-mq6zu12s', cat: 'cat-gbeji', name: 'SÍNSIN™ Réveil Frontal + Modèle Sur-mesure', price: 15000 },
  { id: 'sv-rituel-mq6wbusw', cat: 'cat-gbeji', name: 'SÍNSIN™ Réveil Frontal', price: 4000 },
  { id: 'p7yz5g079a', cat: 'gbeza', name: 'Shampoing Prestige', price: 17000 },
  { id: 'svc-vekpe-fauxlocks', cat: 'vekpe', name: 'Pose Faux Locks (protection temporaire)', price: 35000 },
  { id: 'sv-rituel-mq3ln93q', cat: 'cat-yekpe', name: 'YÈKPÈ™ Décoloration', price: 15000 },
  { id: 'sv-rituel-mpje8apm', cat: 'cat-xyz-mp0sa7wk', name: 'NÙTÓ™ Complet', price: 7000 },
  { id: 'sv-yekpe-sublimation', cat: 'cat-yekpe', name: 'YÈKPÈ™ Sublimation', price: 75000 },
  { id: 'sv-rituel-mpbpz23b', cat: 'cat-yekpe', name: 'YÈKPÈ™ Coloration', price: 10000 },
  { id: 'sv-rituel-mp2ln2i4', cat: 'cat-vekpe', name: 'Diagnostic', price: 15000 },
  { id: 'sv-rituel-mpskliuh', cat: 'cat-xyz-mp0sa7wk', name: 'DÀNDÀN™ Longueur Actifs', price: 8000 },
  { id: 'mx8npm3zn9', cat: 'vekpe', name: 'VÈKPÈ™ Supreme (Locks sur mesure)', price: 0, mode: 'devis' },
  { id: 'sv-style-conseil', cat: 'gbeza', name: 'Le Shampoing Signature', price: 10000 },
  { id: 'sv-gbigbi-profond', cat: 'cat-finfin', name: 'FÍNFÍN™ Reconstruit', price: 40000 },
  { id: 'sv-alala', cat: 'cat-finfin', name: 'FÍNFÍN™ Résurrection', price: 110000 },
  { id: 'sv-rituel-mp2qnjwa', cat: 'cat-finfin', name: 'ÀLÀLÀ™ Sublimation', price: 15000 },
  { id: 'sv-rituel-mpdjh1fz', cat: 'cat-finfin', name: 'NÙMÉ™ Conseil', price: 10000 },
  { id: 'sv-rituel-mq6vpu7d', cat: 'cat-yekpe', name: 'YÈKPÈ™ Ébène', price: 5000 },
  { id: 'sv-rituel-mpdj61e5', cat: 'cat-xyz-mp0sa7wk', name: 'FÍFÀ™ Lèlè - Coiffure', price: 2000 },
  { id: 'sv-rituel-mq70pqmk', cat: 'cat-xyz-mp0sa7wk', name: 'VÈVÉ™ Éclat', price: 4000 },
  { id: 'sv-gbigbi-essentiel', cat: 'cat-finfin', name: 'FÍNFÍN™ Éveil', price: 15000 },
  { id: '2eu81u7qnv', cat: 'gbeza', name: 'Shampoing Supreme', price: 22000 },
  { id: 'sv-rituel-mpdjcyh0', cat: 'cat-xyz-mp0sa7wk', name: 'FÍFÀ™ Xòxò - Twists', price: 5000 },
  { id: 'sv-rituel-mpdj8t99', cat: 'cat-xyz-mp0sa7wk', name: 'FÍFÀ™ Gàn - Coiffure élaborée', price: 20000 },
  { id: 'sv-rituel-mpdjbdm5', cat: 'cat-xyz-mp0sa7wk', name: 'FÍFÀ™ Dòdò - Coiffure Sur-Mesure', price: 10000 },
  { id: 'sv-rituel-mpdji3sm', cat: 'cat-xyz-mp0sa7wk', name: 'NÙMÉ™ Temps+', price: 8000 },
  { id: 'sv-rituel-mpdjn3qx', cat: 'cat-xyz-mp0sa7wk', name: 'NÙMÉ™ Délai', price: 5000 },
  { id: 'sv-rituel-mpje726f', cat: 'cat-xyz-mp0sa7wk', name: 'NÙTÓ™ Mains', price: 2000 },
  { id: 'sv-rituel-mpje7ji7', cat: 'cat-xyz-mp0sa7wk', name: 'NÙTÓ™ Pieds', price: 6000 },
  { id: 'sv-rituel-mpskkhyn', cat: 'cat-xyz-mp0sa7wk', name: 'GBÈZÀ™ Longueur Lavage', price: 5000 },
  { id: 'sv-rituel-mpdikoo2', cat: 'cat-xyz-mp0sa7wk', name: 'ZÀMÈ™ Produits client', price: 5000 },
  { id: 'sv-rituel-mq70mpw7', cat: 'cat-xyz-mp0sa7wk', name: 'VÈVÉ™ Hydra', price: 2500 },
  { id: 'sv-rituel-mpmeio39', cat: 'cat-vekpe', name: 'VÈKPÈ™ Mi-Long', price: 50000 },
  { id: 'sv-rituel-mpmeljvy', cat: 'cat-vekpe', name: 'VÈKPÈ™ Long', price: 100000 },
  { id: 'sv-rituel-mpl3brcs', cat: 'cat-vekpe', name: 'VÈKPÈ™ Réveil', price: 15000 },
  { id: 'sv-rituel-mpl2rty1', cat: 'cat-vekpe', name: 'VÈKPÈ™ Métamorphose', price: 120000 },
  { id: 'sv-vekpe-signature', cat: 'cat-les-creation-des-loc-mpmehwwx', name: 'VÈKPÈ™ Essentiel', price: 275000 },
  { id: 'sv-rituel-mpmej91v', cat: 'cat-les-creation-des-loc-mpmehwwx', name: 'VÈKPÈ™ Signature', price: 110000 },
  { id: 'sv-vekpe-prestige', cat: 'cat-les-creation-des-loc-mpmehwwx', name: 'VÈKPÈ™ Prestige', price: 385000 },
  { id: 'sv-rituel-mp1ldfj2', cat: 'cat-les-creation-des-loc-mpmehwwx', name: 'VÈKPÈ™ Suprême', price: 360000 },
  { id: 'sv-rituel-mp78jdyc', cat: 'cat-les-creation-des-loc-mpmehwwx', name: 'VÈKPÈ™ Distinction', price: 420000 },
  { id: 'sv-rituel-mpjcxbef', cat: 'cat-les-creation-des-loc-mpmehwwx', name: 'VÈKPÈ™ d’Exception', price: 630000 },
  { id: 'sv-rituel-mpks9wbd', cat: 'cat-les-creation-des-loc-mpmehwwx', name: 'VÈKPÈ™ Couture', price: 825000 },
  { id: 'sv-rituel-mpkcygev', cat: 'cat-les-creation-des-loc-mpmehwwx', name: 'VÈKPÈ™ Souveraine', price: 1120000 },
];

/** UNE FOIS : re-crée toute prestation de la photographie absente du catalogue.
    N'écrase JAMAIS une prestation existante (renommages/reprix conservés).
    Retourne le nombre restauré (pour le mot au personnel). */
export function ensureRescuedServices(): number {
  if (HOUSE_BLANK) return 0; // Maison à blanc — pas de restauration de catalogue
  if (houseSettingsStore.get()['services_rescue_2026_07_23']) return 0;
  const list = servicesStore.get();
  if (list.length === 0) return 0; // pas encore hydraté — on repassera
  const have = new Set(list.map((s) => s.id));
  const removed = removedServiceIds(); // suppression volontaire = jamais re-créée
  const missing = SNAPSHOT_2026_07_21.filter((s) => !have.has(s.id) && !removed.has(s.id));
  if (missing.length > 0) {
    /* Durée/maître/palier ne sont pas dans la photographie : valeurs sûres, à
       ajuster au Catalogue. Le maître reprend celui le plus courant du catalogue
       restant, pour que la réservation Couronne garde un officiant valide. */
    const fallbackMaster = list.find((s) => s.master)?.master ?? '';
    const maxOrder = list.reduce((m, s) => Math.max(m, s.order), 0);
    const restored: Service[] = missing.map((m, i) => ({
      id: m.id,
      categoryId: m.cat,
      name: m.name,
      palier: 'Fondation',
      priceXof: m.price,
      hidePrice: m.mode === 'devis',
      priceMode: m.mode ?? 'fixe',
      sessions: 1,
      master: fallbackMaster,
      durationMin: 60,
      order: maxOrder + 1 + i,
      description: REWRITE_DESCRIPTIONS[m.id] ?? FILL_DESCRIPTIONS[m.id] ?? undefined,
      descRev: DESC_REV,
    }));
    servicesStore.set((prev) => [...prev, ...restored]);
  }
  houseSettingsStore.set((prev) => ({ ...prev, services_rescue_2026_07_23: true }));
  return missing.length;
}
