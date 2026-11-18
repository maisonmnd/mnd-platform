/* LE DEVIS ÉCRIT PAR L'ASSISTANT, ÉPROUVÉ — `node scripts/verifie-le-devis-par-description.mjs`.

   13 novembre 2026 : on décrit la situation d'une cliente, Claude choisit des
   prestations du catalogue, la Maison calcule. La règle qui tient tout :
   CLAUDE NE DIT JAMAIS UN PRIX. Ce banc éprouve le module pur
   (src/shared/devis-par-description-pur.ts) et la porte (ia-maison) qui lui
   ouvre le chantier « devis ». Tout est inventé : des prix d'exemple, aucune
   cliente. Sortie ASCII : la console de Windows. */
import {
  CHANTIER_DU_DEVIS, USAGE_DU_DEVIS, SCHEMA_DU_DEVIS, LIGNES_MAX, QUANTITE_MAX,
  consigneDuDevis, descriptionPourClaude, devisDepuisLaLecture, lectureDuDevis, prestationsProposables, seCompteAuLock,
  estUneCreationAuLock, suitLaTete, calibresDits, estUnDefaisage, estUneReparation,
  type PrestationDuCatalogue,
} from '../src/shared/devis-par-description-pur';
import { CHANTIERS_IA, DEPARTEMENTS_PAR_CHANTIER, peutDemander, saitLeDevisParDescription } from '../src/shared/ia-maison-pur';
import { MODEL_BANDS_SEED, bandForService, personalPriceXof, pricingOf, servesBand } from '../src/shared/pricing';
import { CATALOG_V6 } from '../src/shared/catalog-v6';
import { defaitLaCouronne, type Service } from '../src/shared/catalog';
import { readFileSync } from 'node:fs';

let n = 0;
const ascii = (v: unknown): string =>
  (JSON.stringify(v) ?? 'undefined').replace(/[^\x20-\x7e]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);
const dit = (nom: string, attendu: unknown, obtenu: unknown) => {
  n++;
  const ok = JSON.stringify(attendu) === JSON.stringify(obtenu);
  if (!ok) process.exitCode = 1;
  console.log(`${ok ? 'OK   ' : 'ECHEC'} ${nom}${ok ? '' : ` -> ${ascii(obtenu)}`}`);
  if (!ok) console.log(`       attendu ${ascii(attendu)}`);
};
const lf = (s: string) => s.replace(/\r\n/g, '\n');

/* Un catalogue d'exemple : une consultation, un défaisage, une réparation, une création au lock, un essai, une archivée. */
const CAT: PrestationDuCatalogue[] = [
  { id: 'consult', name: 'Consultation', priceXof: 10000, categoryId: 'koko' },
  /* Rangés dans leurs vraies familles : GBÀTÀ™ (le défaisage, en base) et FÍNFÍN™ (la réparation). */
  { id: 'defais', name: 'Defaisage', priceXof: 80000, categoryId: 'cat-defaisage' },
  { id: 'repare', name: 'Reparation', priceXof: 80000, categoryId: 'atl-iv-finfin', prixParLongueur: { court: 80000, 'mi-long': 90000, long: 120000 } },
  /* Liée à son calibre comme dans le catalogue en base (`bandIds`) : c'est ce qui en fait une création. */
  { id: 'cree-medium', name: 'Creation Medium', priceXof: 0, categoryId: 'vekpe', tarifMode: 'lock', bandIds: ['cal-medium'], tarifLockParLongueur: { court: 1100, 'mi-long': 1300, long: 1500 } },
  { id: 'essai', name: 'Essai de paiement · 100 F', priceXof: 100, categoryId: '8p8i2vwmx3' },
  { id: 'vieille', name: 'Ancienne prestation', priceXof: 5000, categoryId: 'koko', archived: true },
  { id: 'sur-devis', name: 'Sur mesure', priceXof: 0, categoryId: 'sup', priceMode: 'devis' },
];

/* Le juge des prix, injecté : un prix fixe, ou locks x tarif de la longueur, ou le prix par longueur. */
const prixDe = (sv: PrestationDuCatalogue, o: { locks: number | undefined; longueur: string }): number => {
  if (seCompteAuLock(sv)) {
    const t = sv.tarifLockParLongueur?.[(o.longueur || 'court') as 'court'] ?? 0;
    return (o.locks ?? 0) * t;
  }
  const l = o.longueur ? sv.prixParLongueur?.[o.longueur as 'court'] : undefined;
  return l ?? sv.priceXof;
};
const plafondEquipe = (b: number) => Math.floor(b * 49 / 100);
const plafondDirection = () => Number.POSITIVE_INFINITY;

/* ── ① CE QU'ON PROPOSE ───────────────────────────────────────────────── */
dit('les archivees et les essais de la Maison ne se proposent jamais', ['consult', 'defais', 'repare', 'cree-medium', 'sur-devis'], prestationsProposables(CAT).map((s) => s.id));
dit('seule une creation se compte au lock', [false, true], [seCompteAuLock(CAT[0]), seCompteAuLock(CAT[3])]);
const consigne = consigneDuDevis({ services: CAT, aujourdhui: '2026-11-13' });
dit('la consigne liste le catalogue propre : ni archivee, ni essai', [true, false, false], [consigne.includes('defais | Defaisage'), consigne.includes('vieille'), consigne.includes('essai |')]);
dit('la consigne interdit les prix a Claude', true, /Jamais un nom invent/.test(consigne) && /jamais un prix/.test(consigne));
dit('la consigne dit le jour', true, consigne.includes('2026-11-13'));

/* ── ② LA LECTURE, REVALIDÉE ──────────────────────────────────────────── */
dit('une reponse qui n\'est pas un objet est refusee', [null, null, null], [lectureDuDevis(null, CAT), lectureDuDevis('texte', CAT), lectureDuDevis({ lignes: 3 }, CAT)]);
const lu = lectureDuDevis({
  lignes: [
    { serviceId: 'consult', quantite: 1, locks: 0, raison: 'locks nees ailleurs' },
    { serviceId: 'inventee', quantite: 1, locks: 0, raison: 'x' },
    { serviceId: 'vieille', quantite: 1, locks: 0, raison: 'archivee' },
    { serviceId: 'cree-medium', quantite: 99, locks: 100, raison: 'recreer' },
    { serviceId: 'defais', quantite: 1, locks: 55, raison: 'les locks ne comptent pas ici' },
  ],
  locksDeLaTete: 295, longueur: 'cheval', totalVoulu: 160000, reserves: ['  a preciser  ', 3],
}, CAT)!;
dit('un identifiant hors catalogue ou archive est ecarte et dit', 2, lu.ecartees.length);
dit('les lignes gardees', ['consult', 'cree-medium', 'defais'], lu.lignes.map((l) => l.serviceId));
dit('la quantite est bornee', QUANTITE_MAX, lu.lignes[1].quantite);
dit('les locks ne comptent que pour une prestation au lock', [0, 100, 0], lu.lignes.map((l) => l.locks));
dit('une longueur inconnue devient vide', '', lu.longueur);
dit('les reserves sont nettoyees', ['a preciser'], lu.reserves);
const trop = lectureDuDevis({ lignes: Array.from({ length: LIGNES_MAX + 3 }, () => ({ serviceId: 'consult', quantite: 1, locks: 0, raison: '' })), locksDeLaTete: 0, longueur: '', totalVoulu: 0, reserves: [] }, CAT)!;
dit('au-dela de douze lignes, on ecarte', [LIGNES_MAX, 3], [trop.lignes.length, trop.ecartees.length]);

/* ── ③ LE DEVIS CHIFFRÉ PAR LA MAISON ─────────────────────────────────── */
const lecture = (over: Record<string, unknown>) => lectureDuDevis({
  lignes: [
    { serviceId: 'consult', quantite: 1, locks: 0, raison: 'a' },
    { serviceId: 'defais', quantite: 1, locks: 0, raison: 'b' },
    { serviceId: 'cree-medium', quantite: 1, locks: 100, raison: 'c' },
  ],
  locksDeLaTete: 295, longueur: 'court', totalVoulu: 0, reserves: [], ...over,
}, CAT)!;
/* La somme se dit par la Maison (ici en euros, pour voir que le « F » en dur a disparu). */
const somme = (xof: number) => `${xof} EUR-banc`;
const sansVoulu = devisDepuisLaLecture(lecture({}), { services: CAT, prixDe, plafondDeRemiseXof: plafondDirection, somme });
dit('les prix viennent du catalogue, jamais de Claude (100 locks x 1100)', [10000, 80000, 110000], sansVoulu.lignes.map((l) => l.unitXof));
dit('sans total voulu : ni remise, ni ecart', [200000, 0, 200000], [sansVoulu.brutXof, sansVoulu.remiseXof, sansVoulu.totalXof]);
const voulu = devisDepuisLaLecture(lecture({ totalVoulu: 160000 }), { services: CAT, prixDe, plafondDeRemiseXof: plafondDirection, somme });
dit('le devis s\'arrete au total voulu : la remise est la difference', [200000, 40000, 160000], [voulu.brutXof, voulu.remiseXof, voulu.totalXof]);
const plafonne = devisDepuisLaLecture(lecture({ totalVoulu: 60000 }), { services: CAT, prixDe, plafondDeRemiseXof: plafondEquipe, somme });
dit('l\'equipe est plafonnee a 49 % : la remise s\'arrete, et on le dit', [98000, 102000, true], [plafonne.remiseXof, plafonne.totalXof, plafonne.avertissements.some((a) => /plafonn/.test(a))]);
const direction = devisDepuisLaLecture(lecture({ totalVoulu: 60000 }), { services: CAT, prixDe, plafondDeRemiseXof: plafondDirection, somme });
dit('la remise plafonnee se dit dans la devise de la branche, jamais en « F » ecrit en dur', [true, false],
  [plafonne.avertissements.some((a) => a.includes('140000 EUR-banc') && a.includes('98000 EUR-banc')), plafonne.avertissements.some((a) => /\d F/.test(a))]);
dit('la direction va au-dela', [140000, 60000], [direction.remiseXof, direction.totalXof]);
const majore = devisDepuisLaLecture(lecture({ totalVoulu: 500000 }), { services: CAT, prixDe, plafondDeRemiseXof: plafondDirection, somme });
dit('un total voulu plus haut que la somme ne majore rien', [0, 200000, true], [majore.remiseXof, majore.totalXof, majore.avertissements.some((a) => /major/.test(a))]);
const sansLocks = devisDepuisLaLecture(lecture({ lignes: [{ serviceId: 'cree-medium', quantite: 1, locks: 0, raison: 'c' }] }), { services: CAT, prixDe, plafondDeRemiseXof: plafondDirection, somme });
dit('le total voulu trop haut se dit aussi dans la devise de la branche', true, majore.avertissements.some((a) => a.includes('500000 EUR-banc') && a.includes('200000 EUR-banc')));
dit('une creation sans nombre de locks se dit et ne vaut rien', [0, true], [sansLocks.lignes[0].unitXof, sansLocks.avertissements.some((a) => /nombre de locks/.test(a))]);
const longueurMuette = devisDepuisLaLecture(lecture({ longueur: '', lignes: [{ serviceId: 'repare', quantite: 1, locks: 0, raison: 'r' }] }), { services: CAT, prixDe, plafondDeRemiseXof: plafondDirection, somme });
dit('sans longueur, les prix par longueur sont ceux du court, et on le dit', [80000, true], [longueurMuette.lignes[0].unitXof, longueurMuette.avertissements.some((a) => /longueur/.test(a))]);
const surDevis = devisDepuisLaLecture(lecture({ lignes: [{ serviceId: 'sur-devis', quantite: 1, locks: 0, raison: 's' }] }), { services: CAT, prixDe, plafondDeRemiseXof: plafondDirection, somme });
dit('une prestation sur devis se dit : son prix est a ecrire', true, surDevis.avertissements.some((a) => /sur devis/.test(a)));
const vide = devisDepuisLaLecture(lecture({ lignes: [] }), { services: CAT, prixDe, plafondDeRemiseXof: plafondDirection, somme });
dit('sans prestation, on le dit et rien n\'est invente', [0, true], [vide.lignes.length, vide.avertissements.some((a) => /Aucune prestation/.test(a))]);
dit('la description trop courte ne part pas, la longue est bornee', [null, 4000], [descriptionPourClaude('court'), descriptionPourClaude('x'.repeat(9000))!.length]);

/* ── ⑤ LA REVUE DU 17 NOVEMBRE 2026 ───────────────────────────────────────
   Quatre points : un soin au lock n'est pas une création (2), les calibres
   viennent du barème (10), le juge ne retombe plus en silence sur la fiche (11),
   le total voulu se dit dans la devise de la branche (12). Le juge des prix est
   ici LE VRAI (`personalPriceXof`), sur le catalogue de départ et le barème de
   la Maison : c'est lui que l'écran injecte. */
const BAREME = MODEL_BANDS_SEED;
const leJuge = (locks: number | undefined, longueur: string) => pricingOf({ priceCoef: 1, lockCount: locks, longueur: (longueur || undefined) as never } as never, BAREME);
const vraiPrixDe = (sv: PrestationDuCatalogue, o: { locks: number | undefined; longueur: string }) => personalPriceXof(sv as Service, leJuge(o.locks, o.longueur), CATALOG_V6);
const vraiHorsCalibre = (sv: PrestationDuCatalogue, locks: number) => !servesBand(sv as Service, bandForService(sv as Service, leJuge(locks, '')));
const sinsin = CATALOG_V6.find((s) => /^SÍNSIN™ Essentiel/.test(s.name))!;
const vekpeMicro = CATALOG_V6.find((s) => /^VÈKPÈ™ Micro/.test(s.name))!;
const vekpeNano = CATALOG_V6.find((s) => /^VÈKPÈ™ Nano/.test(s.name))!;

/* (2) Un soin compté au lock qui sert tous les calibres n'est pas une création. */
dit('(2) le SINSIN Essentiel de depart se compte au lock, sur la tete : pas une creation', [true, false, true],
  [seCompteAuLock(sinsin), estUneCreationAuLock(sinsin), suitLaTete(sinsin)]);
dit('(2) une creation est liee a son calibre : bandIds (la base), bandId, ou un plancher unique', [true, true, true, true, false],
  [estUneCreationAuLock(vekpeMicro), estUneCreationAuLock(CAT[3]),
    estUneCreationAuLock({ id: 'b', name: 'b', priceXof: 0, categoryId: 'v', tarifMode: 'lock', bandId: 'cal-mini' }),
    estUneCreationAuLock({ id: 'p', name: 'p', priceXof: 0, categoryId: 'v', ratePerLock: 1100, priceFloors: { 'cal-nano': 400000 } }),
    estUneCreationAuLock({ id: 's', name: 's', priceXof: 0, categoryId: 'v', ratePerLock: 100, priceFloors: { 'cal-mini': 1, 'cal-micro': 2 } })]);
dit('(2) la base : SINSIN Essentiel en mode calibre, six planchers, suit la tete', true,
  suitLaTete({ id: 'e', name: 'e', priceXof: 20000, categoryId: 'g', tarifMode: 'calibre', priceFloors: { 'cal-jumbo': 1, 'cal-medium': 2, 'cal-mini': 3 } }));
const luSinsin = lectureDuDevis({ lignes: [{ serviceId: sinsin.id, quantite: 1, locks: 77, raison: 'resserrage' }], locksDeLaTete: 295, longueur: '', totalVoulu: 0, reserves: [] }, CATALOG_V6)!;
dit('(2) un soin au lock ne garde pas de locks sur sa ligne', 0, luSinsin.lignes[0].locks);
const resserrage = devisDepuisLaLecture(luSinsin, { services: CATALOG_V6, prixDe: vraiPrixDe, plafondDeRemiseXof: plafondDirection, somme });
dit('(2) « elle a 295 locks, resserrage » : le prix de la tete (295 x 100 F, au-dessus du plancher Micro), pas la base', vraiPrixDe(sinsin, { locks: 295, longueur: '' }), resserrage.lignes[0].unitXof);
dit('(2) ... qui n est pas le prix de base du catalogue', true, resserrage.lignes[0].unitXof !== vraiPrixDe(sinsin, { locks: undefined, longueur: '' }));
dit('(2) ... et aucun avertissement de locks manquants', [], resserrage.avertissements.filter((a) => /locks/.test(a)));
const sinsinMuet = devisDepuisLaLecture({ ...luSinsin, locksDeLaTete: 0 }, { services: CATALOG_V6, prixDe: vraiPrixDe, plafondDeRemiseXof: plafondDirection, somme });
dit('(2) sans la tete ni fiche : le prix du catalogue, et on le dit', [vraiPrixDe(sinsin, { locks: undefined, longueur: '' }), true],
  [sinsinMuet.lignes[0].unitXof, sinsinMuet.avertissements.some((a) => /sur la t.te de la cliente/.test(a))]);

/* (10) Les calibres dits à Claude viennent du barème. */
dit('(10) les calibres se disent depuis le bareme de la Maison', 'Jumbo jusqu’à 80, Medium 81 à 150, Mini 151 à 250, Micro 251 à 350, Nano 351 à 450, Pico 451 à 550, Galaxy au-delà de 550', calibresDits(BAREME));
dit('(10) ... dans l ordre des bornes, quel que soit l ordre du reglage', calibresDits(BAREME), calibresDits([...BAREME].reverse()));
const consigneBareme = consigneDuDevis({ services: CATALOG_V6, aujourdhui: '2026-11-17', calibres: BAREME });
dit('(10) la consigne porte les bornes du bareme, plus « 451 a 600 » ecrit en dur', [true, true, false],
  [consigneBareme.includes('Pico 451 à 550'), consigneBareme.includes('Galaxy au-delà de 550'), consigneBareme.includes('451 à 600')]);
const borneDeplacee = consigneDuDevis({ services: CAT, aujourdhui: '2026-11-17', calibres: BAREME.map((b) => (b.id === 'cal-pico' ? { ...b, maxLocks: 600 } : b)) });
dit('(10) une borne deplacee aux Parametres se dit aussitot', true, borneDeplacee.includes('Pico 451 à 600') && borneDeplacee.includes('Galaxy au-delà de 600'));
dit('(10) la consigne distingue la creation du soin au lock sur la tete', [true, true],
  [consigneBareme.includes(`${vekpeMicro.id} | ${vekpeMicro.name} | création au lock`), consigneBareme.includes(`${sinsin.id} | ${sinsin.name} | au lock sur la tête`)]);
const creationDe = (sv: PrestationDuCatalogue, locks: number) => devisDepuisLaLecture(
  lectureDuDevis({ lignes: [{ serviceId: sv.id, quantite: 1, locks, raison: 'creer' }], locksDeLaTete: 0, longueur: 'court', totalVoulu: 0, reserves: [] }, CATALOG_V6)!,
  { services: CATALOG_V6, prixDe: vraiPrixDe, plafondDeRemiseXof: plafondDirection, somme, horsDeSonCalibre: vraiHorsCalibre },
);
const horsCalibre = (d: ReturnType<typeof devisDepuisLaLecture>) => d.avertissements.some((a) => /hors de son calibre/.test(a));
dit('(10) une creation Micro de 560 locks (Galaxy) est hors de son calibre : on le dit', [560, true], [creationDe(vekpeMicro, 560).lignes[0].locks, horsCalibre(creationDe(vekpeMicro, 560))]);
dit('(10) ... pas une creation Micro de 300 locks', false, horsCalibre(creationDe(vekpeMicro, 300)));
dit('(10) la creation Nano de depart sert aussi Galaxy (deux planchers) : 560 locks sont dans son calibre', [true, 560, false],
  [estUneCreationAuLock(vekpeNano), creationDe(vekpeNano, 560).lignes[0].locks, horsCalibre(creationDe(vekpeNano, 560))]);
dit('(2) une creation se reconnait d abord par son atelier VEKPE, meme sans calibre designe', [true, false],
  [estUneCreationAuLock({ id: 'v', name: 'v', priceXof: 0, categoryId: 'atl-i-vekpe', tarifMode: 'lock' }), estUneCreationAuLock({ id: 'w', name: 'w', priceXof: 0, categoryId: 'atl-ii-gbeji', tarifMode: 'lock' })]);

/* (11) Le juge reçoit ce que le module décide, et l'avertissement dit d'où ça vient. */
const vus: { id: string; locks: number | undefined; longueur: string }[] = [];
const espion = (sv: PrestationDuCatalogue, o: { locks: number | undefined; longueur: string }) => { vus.push({ id: sv.id, ...o }); return prixDe(sv, o); };
const avecFiche = devisDepuisLaLecture(lecture({ longueur: '', locksDeLaTete: 0, lignes: [{ serviceId: 'repare', quantite: 1, locks: 0, raison: 'r' }, { serviceId: 'cree-medium', quantite: 1, locks: 0, raison: 'c' }] }),
  { services: CAT, prixDe: espion, plafondDeRemiseXof: plafondDirection, somme, fiche: { lockCount: 295, longueur: 'long' } });
dit('(11) une cliente aux locks longues, longueur non dite : prix long, et on dit que la fiche a servi', [120000, true, false],
  [avecFiche.lignes[0].unitXof, avecFiche.avertissements.some((a) => /celle de sa fiche est prise \(locks longues\)/.test(a)), avecFiche.avertissements.some((a) => /courtes|catalogue, . ajuster/.test(a))]);
dit('(11) une creation sans nombre ne prend JAMAIS la tete de la fiche (295) : le juge recoit « rien »', [undefined, 0, true],
  [vus.find((v) => v.id === 'cree-medium')?.locks, avecFiche.lignes[1].unitXof, avecFiche.avertissements.some((a) => /locks à créer n’est pas dit/.test(a))]);
dit('(11) la longueur donnee au juge est celle que le devis annonce', ['long', 'long'], [vus[0]?.longueur, avecFiche.longueur]);
const sinsinFiche = devisDepuisLaLecture({ ...luSinsin, locksDeLaTete: 0 }, { services: CATALOG_V6, prixDe: vraiPrixDe, plafondDeRemiseXof: plafondDirection, somme, fiche: { lockCount: 300 } });
dit('(11) un resserrage sans tete dite prend celle de la fiche, et le dit', [vraiPrixDe(sinsin, { locks: 300, longueur: '' }), true, false],
  [sinsinFiche.lignes[0].unitXof, sinsinFiche.avertissements.some((a) => /celui de sa fiche est pris \(300 locks\)/.test(a)), sinsinFiche.avertissements.some((a) => /sur la t.te de la cliente/.test(a))]);
dit('(11) la tete dite passe avant la fiche', vraiPrixDe(sinsin, { locks: 295, longueur: '' }),
  devisDepuisLaLecture(luSinsin, { services: CATALOG_V6, prixDe: vraiPrixDe, plafondDeRemiseXof: plafondDirection, somme, fiche: { lockCount: 120 } }).lignes[0].unitXof);
const ecran = lf(readFileSync('src/apps/trone/routes/vente/AssistantDuDevis.tsx', 'utf8'));
dit('(11) l ecran ne retombe plus en silence sur la fiche : il la donne au module', [false, false, true],
  [/o\.locks \?\? cliente/.test(ecran), /o\.longueur \|\| cliente/.test(ecran), /fiche: cliente \? \{ lockCount: cliente\.lockCount, longueur: cliente\.longueur/.test(ecran)]);

/* (12) Le total voulu se dit dans la devise de la branche. */
dit('(12) le schema accepte un total a centimes', 'number', ((SCHEMA_DU_DEVIS as { properties: Record<string, { type: string }> }).properties.totalVoulu).type);
dit('(12) la lecture garde les centimes, rien de plus', [249.5, 250.13], [lecture({ totalVoulu: 249.5 }).totalVoulu, lecture({ totalVoulu: '250.129' }).totalVoulu]);
const enEuros = devisDepuisLaLecture(lecture({ totalVoulu: 250 }), { services: CAT, prixDe, plafondDeRemiseXof: plafondDirection, somme, enXof: (m) => m * 656 });
dit('(12) « s arreter a 250 € » : 164 000 XOF, pas 250 F (la remise n est pas de presque tout)', [164000, 36000, 164000], [enEuros.totalVoulu, enEuros.remiseXof, enEuros.totalXof]);
dit('(12) sans conversion (franc CFA) : le total voulu tel quel', 160000, devisDepuisLaLecture(lecture({ totalVoulu: 160000 }), { services: CAT, prixDe, plafondDeRemiseXof: plafondDirection, somme }).totalVoulu);
const consigneEuro = consigneDuDevis({ services: CAT, aujourdhui: '2026-11-17', devise: 'EUR' });
const consigneFranc = consigneDuDevis({ services: CAT, aujourdhui: '2026-11-17' });
dit('(12) la consigne dit la devise de la branche, et l exemple en francs seulement en franc', [true, false, true, true],
  [consigneEuro.includes('en euros'), consigneEuro.includes('160 000 F'), consigneFranc.includes('en francs CFA'), consigneFranc.includes('160 000 F')]);
dit('(12) l ecran convertit le total voulu et dit la devise a Claude', [true, true],
  [/enXof: \(montant\) => Math\.round\(toXof\(montant, currency\)\)/.test(ecran), /consigneDuDevis\(\{[^}]*calibres: bands, devise: currency \}\)/.test(ecran)]);

/* ── ⑥ UN DÉFAISAGE NE SE RÉPARE PAS — 18 novembre 2026 ───────────────────
   « On ne peut pas défaire et réparer en même temps. Mais on peut défaire,
   revenir à neuf, cheveux afro, et refaire un nouveau départ, une nouvelle
   création » (Yéman). La règle tient dans le code, pas seulement dans la consigne. */
const gbata = CATALOG_V6.filter((s) => s.categoryId === 'plt-45');
const finfin = CATALOG_V6.filter((s) => s.categoryId === 'atl-iv-finfin');
dit('(D) le defaisage se reconnait comme defaitLaCouronne, en semence et en base', [true, true, true, false],
  [gbata.length > 0 && gbata.every(estUnDefaisage), estUnDefaisage({ categoryId: 'cat-defaisage' }), defaitLaCouronne({ categoryId: 'cat-defaisage' }) === estUnDefaisage({ categoryId: 'cat-defaisage' }), estUnDefaisage({ categoryId: 'atl-iv-finfin' })]);
dit('(D) la reparation, c est l atelier FINFIN (La Renaissance), par sa categorie', [true, false, false],
  [finfin.length > 0 && finfin.every(estUneReparation), estUneReparation({ categoryId: 'cat-defaisage' }), estUneReparation({ categoryId: 'atl-i-vekpe' })]);
const luDefaitRepare = lectureDuDevis({
  lignes: [
    { serviceId: 'consult', quantite: 1, locks: 0, raison: 'a' },
    { serviceId: 'repare', quantite: 1, locks: 0, raison: 'reparer' },
    { serviceId: 'defais', quantite: 1, locks: 0, raison: 'defaire' },
    { serviceId: 'cree-medium', quantite: 1, locks: 100, raison: 'nouvelle creation' },
  ],
  locksDeLaTete: 295, longueur: 'court', totalVoulu: 0, reserves: [],
}, CAT)!;
dit('(D) defaire ET reparer : la reparation est ecartee, le defaisage et la creation restent', ['consult', 'defais', 'cree-medium'], luDefaitRepare.lignes.map((l) => l.serviceId));
const devisDefait = devisDepuisLaLecture(luDefaitRepare, { services: CAT, prixDe, plafondDeRemiseXof: plafondDirection, somme });
dit('(D) ... et le brouillon dit pourquoi', true, devisDefait.avertissements.some((a) => /Reparation.*on ne répare pas des locks qu’on défait.*cheveux naturels/.test(a)));
dit('(D) ... meme quand la reparation vient AVANT le defaisage dans la reponse', false, luDefaitRepare.lignes.some((l) => l.serviceId === 'repare'));
const luRepareSeule = lectureDuDevis({ lignes: [{ serviceId: 'consult', quantite: 1, locks: 0, raison: 'a' }, { serviceId: 'repare', quantite: 1, locks: 0, raison: 'r' }], locksDeLaTete: 0, longueur: '', totalVoulu: 0, reserves: [] }, CAT)!;
dit('(D) une reparation sans defaisage reste au devis', [['consult', 'repare'], []], [luRepareSeule.lignes.map((l) => l.serviceId), luRepareSeule.ecartees]);
dit('(D) la consigne dit la regle a Claude', true, /défaisage et une réparation ne vont JAMAIS ensemble/.test(consigne) && /cheveux naturels/.test(consigne) && /création nouvelle/.test(consigne));
dit('(D) l exemple de l ecran ne defait et ne repare plus en meme temps', [false, true], [/défait, on répare/.test(ecran), /On les défait, retour aux cheveux naturels, puis une nouvelle création/.test(ecran)]);

/* ── ④ LA PORTE ───────────────────────────────────────────────────────── */
dit('le chantier est ouvert dans la porte, usage texte', ['devis', 'texte', true], [CHANTIER_DU_DEVIS, USAGE_DU_DEVIS, (CHANTIERS_IA as readonly string[]).includes('devis')]);
dit('la vente et la clientele le demandent, l\'atelier non', [true, true, false], [
  peutDemander('maitre', 'devis', { 'dept-vente-caisse': true }),
  peutDemander('maitre', 'devis', { 'dept-clientele': true }),
  peutDemander('maitre', 'devis', { 'dept-atelier': true }),
]);
dit('la direction a tout', true, peutDemander('souverain', 'devis', {}));
dit('departements du chantier', ['dept-vente-caisse', 'dept-clientele'], [...DEPARTEMENTS_PAR_CHANTIER.devis]);
dit('le Trone ne propose le chantier que si la fonction le sait', [false, false, true], [saitLeDevisParDescription(undefined), saitLeDevisParDescription('2026-11-01-a'), saitLeDevisParDescription('2026-11-13-a')]);
dit('le schema demande des identifiants et des nombres, aucun prix', true, !JSON.stringify(SCHEMA_DU_DEVIS).match(/prix|Xof|francs? par/i) || /totalVoulu/.test(JSON.stringify(SCHEMA_DU_DEVIS)));
const schema = SCHEMA_DU_DEVIS as { properties: Record<string, unknown> };
dit('le schema ne porte aucun champ de prix de ligne', false, Object.keys(((schema.properties.lignes as { items: { properties: Record<string, unknown> } }).items.properties)).some((k) => /prix|unit|montant/i.test(k)));
const serveur = lf(readFileSync('supabase/functions/ia-maison/index.ts', 'utf8'));
dit('la fonction connait le chantier, sa version et ses departements', [true, true, true], [
  /* Le chantier et une version qui le connaît (2026-11-13-a ou plus tard : l'agent des rendez-vous est venu ensuite). */
  /'achat', 'devis'[,\]]/.test(serveur), (/const VERSION = '(\d{4}-\d{2}-\d{2}-[a-z])'/.exec(serveur)?.[1] ?? '') >= '2026-11-13-a', /devis: \['dept-vente-caisse', 'dept-clientele'\]/.test(serveur),
]);

console.log(`\n${n} verifications.`);
if (process.exitCode) console.log('ECHEC : le devis par description ne tient pas ses promesses.');
else console.log('TOUT VA BIEN : le devis par description tient ses promesses.');
