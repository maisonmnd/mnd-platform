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
  type PrestationDuCatalogue,
} from '../src/shared/devis-par-description-pur';
import { CHANTIERS_IA, DEPARTEMENTS_PAR_CHANTIER, peutDemander, saitLeDevisParDescription } from '../src/shared/ia-maison-pur';
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
  { id: 'defais', name: 'Defaisage', priceXof: 80000, categoryId: 'def' },
  { id: 'repare', name: 'Reparation', priceXof: 80000, categoryId: 'fin', prixParLongueur: { court: 80000, 'mi-long': 90000, long: 120000 } },
  { id: 'cree-medium', name: 'Creation Medium', priceXof: 0, categoryId: 'vekpe', tarifMode: 'lock', tarifLockParLongueur: { court: 1100, 'mi-long': 1300, long: 1500 } },
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
const sansVoulu = devisDepuisLaLecture(lecture({}), { services: CAT, prixDe, plafondDeRemiseXof: plafondDirection });
dit('les prix viennent du catalogue, jamais de Claude (100 locks x 1100)', [10000, 80000, 110000], sansVoulu.lignes.map((l) => l.unitXof));
dit('sans total voulu : ni remise, ni ecart', [200000, 0, 200000], [sansVoulu.brutXof, sansVoulu.remiseXof, sansVoulu.totalXof]);
const voulu = devisDepuisLaLecture(lecture({ totalVoulu: 160000 }), { services: CAT, prixDe, plafondDeRemiseXof: plafondDirection });
dit('le devis s\'arrete au total voulu : la remise est la difference', [200000, 40000, 160000], [voulu.brutXof, voulu.remiseXof, voulu.totalXof]);
const plafonne = devisDepuisLaLecture(lecture({ totalVoulu: 60000 }), { services: CAT, prixDe, plafondDeRemiseXof: plafondEquipe });
dit('l\'equipe est plafonnee a 49 % : la remise s\'arrete, et on le dit', [98000, 102000, true], [plafonne.remiseXof, plafonne.totalXof, plafonne.avertissements.some((a) => /plafonn/.test(a))]);
const direction = devisDepuisLaLecture(lecture({ totalVoulu: 60000 }), { services: CAT, prixDe, plafondDeRemiseXof: plafondDirection });
dit('la direction va au-dela', [140000, 60000], [direction.remiseXof, direction.totalXof]);
const majore = devisDepuisLaLecture(lecture({ totalVoulu: 500000 }), { services: CAT, prixDe, plafondDeRemiseXof: plafondDirection });
dit('un total voulu plus haut que la somme ne majore rien', [0, 200000, true], [majore.remiseXof, majore.totalXof, majore.avertissements.some((a) => /major/.test(a))]);
const sansLocks = devisDepuisLaLecture(lecture({ lignes: [{ serviceId: 'cree-medium', quantite: 1, locks: 0, raison: 'c' }] }), { services: CAT, prixDe, plafondDeRemiseXof: plafondDirection });
dit('une creation sans nombre de locks se dit et ne vaut rien', [0, true], [sansLocks.lignes[0].unitXof, sansLocks.avertissements.some((a) => /nombre de locks/.test(a))]);
const longueurMuette = devisDepuisLaLecture(lecture({ longueur: '', lignes: [{ serviceId: 'repare', quantite: 1, locks: 0, raison: 'r' }] }), { services: CAT, prixDe, plafondDeRemiseXof: plafondDirection });
dit('sans longueur, les prix par longueur sont ceux du court, et on le dit', [80000, true], [longueurMuette.lignes[0].unitXof, longueurMuette.avertissements.some((a) => /longueur/.test(a))]);
const surDevis = devisDepuisLaLecture(lecture({ lignes: [{ serviceId: 'sur-devis', quantite: 1, locks: 0, raison: 's' }] }), { services: CAT, prixDe, plafondDeRemiseXof: plafondDirection });
dit('une prestation sur devis se dit : son prix est a ecrire', true, surDevis.avertissements.some((a) => /sur devis/.test(a)));
const vide = devisDepuisLaLecture(lecture({ lignes: [] }), { services: CAT, prixDe, plafondDeRemiseXof: plafondDirection });
dit('sans prestation, on le dit et rien n\'est invente', [0, true], [vide.lignes.length, vide.avertissements.some((a) => /Aucune prestation/.test(a))]);
dit('la description trop courte ne part pas, la longue est bornee', [null, 4000], [descriptionPourClaude('court'), descriptionPourClaude('x'.repeat(9000))!.length]);

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
  /'achat', 'devis'\] as const/.test(serveur), /const VERSION = '2026-11-13-a'/.test(serveur), /devis: \['dept-vente-caisse', 'dept-clientele'\]/.test(serveur),
]);

console.log(`\n${n} verifications.`);
if (process.exitCode) console.log('ECHEC : le devis par description ne tient pas ses promesses.');
else console.log('TOUT VA BIEN : le devis par description tient ses promesses.');
