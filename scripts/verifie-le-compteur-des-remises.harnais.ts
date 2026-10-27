/* LE COMPTEUR DES REMISES, ÉPROUVÉ · 26 octobre 2026.
   `node scripts/verifie-le-compteur-des-remises.mjs` (et `--prouve`).

   Des codes nominatifs, des offres publiques, des lignes d'envois, des pièces
   et des rendez-vous fabriqués dont on connaît la réponse : qui est parti, qui
   a servi, qui a fait revenir, ce que ça a retiré et rapporté, le verdict.
   Les clientes sont des identifiants et des initiales. */
import { readFileSync } from 'node:fs';
import {
  AUTEUR_ASSISTANT, SORTE_DITE, codeDuLibelle, codesOrphelins, compteParCode, estUnCodeDeLAssistant, prefixeDe, sorteDuCode, verdictDuCode,
  type EnvoiDuCompteur, type LigneDuCompteur, type OffreLue, type PieceLue, type RdvLu, type UsageDUnCode,
} from '../src/shared/compteur-des-remises-pur';
import type { CodePromo } from '../src/shared/promos';

let ko = 0;
const dit = (nom: string, attendu: unknown, obtenu: unknown) => {
  const a = JSON.stringify(attendu); const o = JSON.stringify(obtenu);
  if (a === o) console.log(`OK    ${nom}`);
  else { ko++; console.log(`ECHEC ${nom}\n       obtenu  ${o}\n       attendu ${a}`); }
};
const sansCommentaires = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const A = '2026-10-26';
const MAINTENANT = `${A}T12:00:00Z`;

/* ── 1. Les mots : sortes, préfixes, libellés ── */
dit('le préfixe d’un code nominatif : avant le tiret, normalisé', ['CREUX15', 'ANNIV10', 'MAMAN', 'ROSE15'],
  ['CREUX15-A7K', 'anniv10-xyz', 'MAMAN', 'ROSE15'].map(prefixeDe));
dit('la sorte d’un code de l’Assistant se lit dans le mot ; la direction tient sur une seule ligne', [
  ['nom:CREUX15', 'creux', 'CREUX15', 'jour creux'], ['nom:ANNIV10', 'anniversaire', 'ANNIV10', 'anniversaire'],
  ['nom:FLASH22', 'flash', 'FLASH22', 'offre flash'], ['nom:a-son-nom', 'a-son-nom', 'Remise à son nom', 'direction'], ['nom:a-son-nom', 'a-son-nom', 'Remise à son nom', 'direction']],
  [{ code: 'CREUX15-A7K', parQui: AUTEUR_ASSISTANT }, { code: 'ANNIV10-XYZ', parQui: AUTEUR_ASSISTANT }, { code: 'FLASH22-ABC', parQui: AUTEUR_ASSISTANT },
    { code: 'MAMAN-EEE', parQui: 'Y. B.' }, { code: 'CREUX15-ZZZ' }].map((c) => { const s = sorteDuCode(c); return [s.cle, s.sorte, s.libelle, s.quoi]; }));
dit('les sortes se disent sans le mot banni ni tiret cadratin', true, Object.values(SORTE_DITE).every((s) => !/salon/i.test(s) && !s.includes(String.fromCharCode(0x2014))));

/* ── 1 bis. La signature du fabricant (relecture du 27 octobre 2026) : le juge
   reconnaît le `parQui` que `codeDeLaSituation` écrit vraiment, et l'ancien. ── */
const lectureSansCommentaires = sansCommentaires(readFileSync('src/shared/assistant-lecture-pur.ts', 'utf8'));
const parQuiFabrique = /parQui: '([^']+)'/.exec(lectureSansCommentaires)?.[1] ?? '';
dit('le parQui que le fabricant écrit (assistant-lecture-pur) est reconnu par le juge ; l’ancienne signature « Gérard » aussi ; une main humaine, non', [AUTEUR_ASSISTANT, true, true, false, false],
  [parQuiFabrique, estUnCodeDeLAssistant(parQuiFabrique), estUnCodeDeLAssistant('Gérard'), estUnCodeDeLAssistant('Y. B.'), estUnCodeDeLAssistant(undefined)]);
dit('... et un code fabriqué aujourd’hui se range par préfixe, jamais en « direction » ; un code d’avant le 26 octobre 2026 aussi', ['creux', 'anniversaire', 'creux'],
  [sorteDuCode({ code: 'CREUX15-A7K', parQui: parQuiFabrique }).sorte, sorteDuCode({ code: 'ANNIV10-XYZ', parQui: parQuiFabrique }).sorte, sorteDuCode({ code: 'CREUX15-OLD', parQui: 'Gérard' }).sorte]);
dit('le code d’une pièce, aux trois graphies de la Caisse ; « Remise famille » et un mot libre ne nomment rien', ['ROSE15', 'ROSE15', 'ROSE15', 'MAMAN', null, null, null, 'CREUX15-AAA'],
  ['ROSE15 · 15 % hors gamme, arrondi au millier', 'Offre Octobre Rose · ROSE15', 'Promotion ROSE15', 'Promotion MAMAN', 'Remise famille', 'Remise manuelle', undefined, 'CREUX15-AAA · 15 % hors gamme'].map(codeDuLibelle));

/* ── 2. Le verdict ── */
dit('utile : un sur dix sert et chaque franc remisé en rapporte trois', { etat: 'utile', dit: 'utile' }, verdictDuCode({ envoyes: 23, utilises: 9, venues: 9, remiseXof: 48000, caXof: 297000 }));
dit('sous vingt envois, il ne juge pas : il dit où en est la mesure', { etat: 'a-mesurer', dit: 'à mesurer · 11 sur 20' }, verdictDuCode({ envoyes: 11, utilises: 2, venues: 2, remiseXof: 7000, caXof: 70000 }));
dit('... et jamais de chiffre à zéro envoi', 'à mesurer · 0 sur 20', verdictDuCode({ envoyes: 0, utilises: 0, venues: 0, remiseXof: 0, caXof: 0 }).dit);
dit('à regarder : un sur vingt sert, même si le rendement tient', 'a-regarder', verdictDuCode({ envoyes: 20, utilises: 1, venues: 1, remiseXof: 10000, caXof: 60000 }).etat);
dit('à regarder : le taux tient, le rendement est entre un et trois', 'a-regarder', verdictDuCode({ envoyes: 25, utilises: 5, venues: 3, remiseXof: 10000, caXof: 25000 }).etat);
dit('à éteindre : aucune venue, ou moins d’un franc rendu par franc remisé', ['a-eteindre', 'a-eteindre'],
  [verdictDuCode({ envoyes: 25, utilises: 5, venues: 0, remiseXof: 10000, caXof: 0 }).etat, verdictDuCode({ envoyes: 25, utilises: 5, venues: 3, remiseXof: 30000, caXof: 20000 }).etat]);
dit('rien remisé mais encaissé : le rendement n’a pas de nombre et tient', 'utile', verdictDuCode({ envoyes: 30, utilises: 4, venues: 4, remiseXof: 0, caXof: 80000 }).etat);
dit('un code public dit ses usages, au singulier comme au pluriel', [{ etat: 'public', dit: '7 usages' }, '1 usage', '0 usage'],
  [verdictDuCode({ envoyes: 'public', utilises: 7, venues: 7, remiseXof: 35000, caXof: 231000 }), verdictDuCode({ envoyes: 'public', utilises: 1, venues: 1, remiseXof: 0, caXof: 0 }).dit,
    verdictDuCode({ envoyes: 'public', utilises: 0, venues: 0, remiseXof: 0, caXof: 0 }).dit]);

/* ── 3. Le compte, sur une Maison fabriquée ── */
const code = (o: Partial<CodePromo> & Pick<CodePromo, 'id' | 'code' | 'clientId' | 'creeLe' | 'expireLe'>): CodePromo => ({ branchId: 'b', parQui: AUTEUR_ASSISTANT, remisePct: 15, ...o });
const codes: CodePromo[] = [
  code({ id: 'k1', code: 'CREUX15-AAA', clientId: 'c1', creeLe: '2026-10-05T09:00:00Z', expireLe: '2026-10-08T22:59:00Z', utiliseLe: '2026-10-08T10:00:00Z', utilisePar: 'x@maisonmnd.com', surPiece: 'MND-0501', remiseReelleXof: 6000 }),
  code({ id: 'k2', code: 'CREUX15-BBB', clientId: 'c2', creeLe: '2026-10-06T09:00:00Z', expireLe: '2026-10-09T22:59:00Z' }),
  code({ id: 'k3', code: 'CREUX15-CCC', clientId: 'c3', creeLe: '2026-10-25T09:00:00Z', expireLe: '2026-10-29T22:59:00Z' }),
  code({ id: 'k4', code: 'ANNIV10-DDD', clientId: 'c4', creeLe: '2026-10-10T09:00:00Z', expireLe: '2026-11-09T09:00:00Z', remisePct: 10, utiliseLe: '2026-10-20T23:30:00Z', utilisePar: 'y@maisonmnd.com', surPiece: 'MND-0510', remiseReelleXof: 2500 }),
  code({ id: 'k5', code: 'MAMAN-EEE', clientId: 'c5', creeLe: '2026-10-12T09:00:00Z', expireLe: '2026-10-14T09:00:00Z', parQui: 'Y. B.', remisePct: undefined, remiseXof: 3000, utiliseLe: '2026-10-13T11:00:00Z', utilisePar: 'y@maisonmnd.com', surPiece: 'MND-0512', remiseReelleXof: 3000 }),
  code({ id: 'k6', code: 'ECLAT15-FFF', clientId: 'c6', creeLe: '2026-10-20T09:00:00Z', expireLe: '2026-10-22T09:00:00Z', parQui: 'G. K.' }),
];
const envoi = (o: Partial<EnvoiDuCompteur> & Pick<EnvoiDuCompteur, 'id' | 'clientId' | 'statut'>): EnvoiDuCompteur => ({ type: 'gerard', canal: 'push', quand: '2026-10-05T09:10:00Z', genre: 'creux', ...o });
const envois: EnvoiDuCompteur[] = [
  envoi({ id: 'e1', clientId: 'c1', statut: 'envoyé', etat: 'lu', codePromo: 'CREUX15-AAA' }),
  envoi({ id: 'e2', clientId: 'c2', statut: 'à-la-main', canal: 'wa-main', codePromo: 'creux15-bbb' }),
  envoi({ id: 'e3', clientId: 'c3', statut: 'en-attente', quand: '2026-10-25T09:00:00Z', codePromo: 'CREUX15-CCC' }),
  envoi({ id: 'e4', clientId: 'c4', statut: 'envoyé', etat: 'remis', genre: 'anniversaire', codePromo: 'ANNIV10-DDD' }),
  envoi({ id: 'e5', clientId: 'c1', statut: 'écarté', codePromo: 'CREUX15-AAA' }),
  envoi({ id: 'e6', clientId: 'c4', statut: 'envoyé', etat: 'non-remis', codePromo: 'ANNIV10-DDD' }),
  envoi({ id: 'e7', clientId: 'c9', statut: 'envoyé', etat: 'lu', genre: 'envie' }),
];
const rdv = (o: Partial<RdvLu> & Pick<RdvLu, 'id' | 'clientId' | 'date'>): RdvLu => ({ status: 'honoré', ...o });
const paye = (xof: number) => [{ id: 'v', amountXof: xof, date: A, method: 'cash' }] as unknown as RdvLu['payments'];
const rdvs: RdvLu[] = [
  rdv({ id: 'r1', clientId: 'c1', creeLe: '2026-10-07T10:00:00Z', date: '2026-10-08', payments: paye(40000) }),
  rdv({ id: 'r2', clientId: 'c1', creeLe: '2026-10-15T10:00:00Z', date: '2026-10-16', payments: paye(30000) }),
  rdv({ id: 'r3', clientId: 'c2', date: '2026-10-08', payments: paye(20000) }),
  rdv({ id: 'r4', clientId: 'c4', creeLe: '2026-10-20T09:00:00Z', date: '2026-10-22', paidXof: 25000 }),
  rdv({ id: 'r5', clientId: 'c4', creeLe: '2026-10-11T09:00:00Z', date: '2026-10-12', status: 'annulé', paidXof: 25000 }),
  rdv({ id: 'r6', clientId: 'c5', creeLe: '2026-10-13T09:00:00Z', date: '2026-10-14', payments: paye(20000) }),
  rdv({ id: 'r7', clientId: 'c7', creeLe: '2026-10-09T08:00:00Z', date: '2026-10-10', codeOffre: 'ROSE15', payments: paye(68000) }),
  rdv({ id: 'r8', clientId: 'c8', creeLe: '2026-10-14T08:00:00Z', date: '2026-10-15', codeOffre: 'rose 15', payments: paye(30000) }),
  rdv({ id: 'r9', clientId: 'c9', creeLe: '2026-10-24T08:00:00Z', date: '2026-10-30', codeOffre: 'ROSE15', status: 'confirmé' }),
  rdv({ id: 'r-fam', clientId: 'c10', creeLe: '2026-10-17T08:00:00Z', date: '2026-10-18', codeOffre: 'ROSE15', payments: paye(50000) }),
  rdv({ id: 'r12', clientId: 'c12', creeLe: '2026-10-20T08:00:00Z', date: '2026-10-21', payments: paye(17000) }),
];
const piece = (o: Partial<PieceLue> & Pick<PieceLue, 'id' | 'number' | 'date' | 'clientId'>): PieceLue => ({ kind: 'facture', status: 'payée', ...o });
const versement = (xof: number) => [{ id: 'w', amountXof: xof, date: A, method: 'cash' }] as unknown as PieceLue['payments'];
const pieces: PieceLue[] = [
  piece({ id: 'p1', number: 'MND-0412', date: '2026-10-10', clientId: 'c7', apptId: 'r7', discountLabel: 'Offre Octobre Rose · ROSE15', globalDiscountXof: 12000, payments: versement(68000) }),
  piece({ id: 'p2', number: 'MND-0420', date: '2026-10-18', clientId: 'c10', apptId: 'r-fam', discountLabel: 'Remise famille', globalDiscountXof: 6000 }),
  piece({ id: 'p3', number: 'MND-0430', date: '2026-10-20', clientId: 'c11', discountLabel: 'ROSE15 · 15 % hors gamme, arrondi au millier', globalDiscountXof: 9000, payments: versement(51000) }),
  piece({ id: 'p4', number: 'MND-0431', date: '2026-10-21', clientId: 'c12', apptId: 'r12', discountLabel: 'Promotion ROSE15', globalDiscountXof: 3000 }),
  piece({ id: 'p5', number: 'DEV-0001', date: '2026-10-22', clientId: 'c13', discountLabel: 'ROSE15 · 15 % hors gamme', globalDiscountXof: 7000, kind: 'devis', status: 'envoyée' }),
  piece({ id: 'p6', number: 'MND-0432', date: '2026-10-22', clientId: 'c13', discountLabel: 'ROSE15 · 15 % hors gamme', globalDiscountXof: 7000, status: 'brouillon' }),
  piece({ id: 'p7', number: 'MND-0433', date: '2026-10-23', clientId: 'c14', discountLabel: 'Remise manuelle', globalDiscountXof: 2000 }),
  piece({ id: 'p8', number: 'MND-0440', date: '2026-10-24', clientId: 'c15', discountLabel: 'NOEL-2026 · 10 % hors gamme', globalDiscountXof: 4000, payments: versement(36000) }),
  piece({ id: 'p9', number: 'MND-0501', date: '2026-10-08', clientId: 'c1', apptId: 'r1', discountLabel: 'CREUX15-AAA · 15 % hors gamme', globalDiscountXof: 6000 }),
];
const offres: OffreLue[] = [
  { id: 'o1', title: 'Octobre Rose', code: 'ROSE15', discountPct: 15, du: '2026-10-01', au: '2026-10-31', active: true },
  { id: 'o2', title: 'Noël', code: 'NOEL-2026', discountPct: 10, du: '2026-11-15', au: '2026-12-15', active: true },
  { id: 'o3', title: 'La consultation déduite', active: true, vitrine: true },
  { id: 'o4', title: 'Le diagnostic offert', code: 'DIAG', active: true, vitrine: true },
];
const demandes = [{ apptId: 'r8', codeApplique: 'ROSE15' }, { apptId: 'r-fam', codeApplique: 'ROSE15' }, { code: 'ROSE15' }];
const remiseDuRdvXof = (id: string): number => ({ r8: 4500, r9: 5000, 'r-fam': 12000 } as Record<string, number>)[id] ?? 0;

const compte = compteParCode({ codes, offres, envois, pieces, rdvs, demandes, remiseDuRdvXof, maintenant: MAINTENANT });
const ligne = (cle: string): LigneDuCompteur | undefined => compte.lignes.find((l) => l.cle === cle);
const chiffres = (l: LigneDuCompteur | undefined) => l && [l.libelle, l.quoi, l.envoyes, l.utilises, l.taux, l.venuesGagnees, l.remiseReelleXof, l.caEncaisseXof, l.rendement, l.verdict.dit];
const usage = (u: UsageDUnCode) => [u.jour, u.code, u.clientId ?? null, u.piece ?? null, u.rdvId ?? null, u.remiseXof, u.source];

dit('les lignes : les nominatifs d’abord, du plus fabriqué au moins, puis les offres qui ont un code', ['nom:CREUX15', 'nom:a-son-nom', 'nom:ANNIV10', 'offre:o1', 'offre:o2', 'offre:o4'], compte.lignes.map((l) => l.cle));
dit('CREUX15 : deux lignes parties (la minuscule compte, l’écartée et celle en salle non), un code servi, une venue gagnée, 6 000 F pour 40 000 F',
  ['CREUX15', 'jour creux', 2, 1, 0.5, 1, 6000, 40000, 40000 / 6000, 'à mesurer · 2 sur 20'], chiffres(ligne('nom:CREUX15')));
dit('... ses codes : trois fabriqués, un vivant, un périmé sans servir, une fenêtre encore ouverte', { fabriques: 3, vivants: 1, perimes: 1, enCours: 1 }, ligne('nom:CREUX15')?.codes);
dit('... son usage : le jour, la pièce, la cliente, les francs, la Caisse', [['2026-10-08', 'CREUX15-AAA', 'c1', 'MND-0501', null, 6000, 'caisse']], ligne('nom:CREUX15')?.usages.map(usage));
dit('... la deuxième venue de la même cliente dans la fenêtre est sa cadence, pas une venue gagnée ; un rendez-vous sans date de prise ne compte pas', 1, ligne('nom:CREUX15')?.venuesGagnees);
dit('ANNIV10 : un « non remis » n’est pas parti ; la venue posée dix jours après ; l’usage se date à Cotonou (23 h 30 UTC = le lendemain)',
  [['ANNIV10', 'anniversaire', 1, 1, 1, 1, 2500, 25000, 10, 'à mesurer · 1 sur 20'], ['2026-10-21', 'ANNIV10-DDD', 'c4', 'MND-0510', null, 2500, 'caisse'], { fabriques: 1, vivants: 0, perimes: 0, enCours: 0 }],
  [chiffres(ligne('nom:ANNIV10')), ligne('nom:ANNIV10')?.usages.map(usage)[0], ligne('nom:ANNIV10')?.codes]);
dit('Remise à son nom : un code de la direction compte pour un message, quel que soit son mot ; l’annulé ne fait pas venir',
  [['Remise à son nom', 'direction', 2, 1, 0.5, 1, 3000, 20000, 20000 / 3000, 'à mesurer · 2 sur 20'], { fabriques: 2, vivants: 0, perimes: 1, enCours: 1 }],
  [chiffres(ligne('nom:a-son-nom')), ligne('nom:a-son-nom')?.codes]);
dit('le total des nominatifs : 5 envoyés, 3 servis, 3 venues, 11 500 F pour 85 000 F, deux codes morts sur six',
  { lignes: 3, envoyes: 5, utilises: 3, taux: 0.6, venuesGagnees: 3, remiseReelleXof: 11500, caEncaisseXof: 85000, rendement: 85000 / 11500, fabriques: 6, perimes: 2 }, compte.total);

/* L'offre ROSE15 : trois graphies, une pièce et un rendez-vous pour une même
   venue, une pièce « Remise famille » sur un rendez-vous réservé avec le code,
   un rendez-vous à venir, un devis, un brouillon, un mot libre. */
const rose = ligne('offre:o1');
dit('ROSE15 : six usages, un par venue ; la pièce et le rendez-vous de la même venue ne font qu’un', 6, rose?.utilises);
dit('... ses usages, du plus récent au plus ancien : le jour, la pièce, la remise, d’où ça vient', [
  ['2026-10-30', 'ROSE15', 'c9', null, 'r9', 5000, 'couronne'],
  ['2026-10-21', 'ROSE15', 'c12', 'MND-0431', 'r12', 3000, 'caisse'],
  ['2026-10-20', 'ROSE15', 'c11', 'MND-0430', null, 9000, 'caisse'],
  ['2026-10-18', 'ROSE15', 'c10', 'MND-0420', 'r-fam', 12000, 'site'],
  ['2026-10-15', 'ROSE15', 'c8', null, 'r8', 4500, 'site'],
  ['2026-10-10', 'ROSE15', 'c7', 'MND-0412', 'r7', 12000, 'caisse'],
], rose?.usages.map(usage));
dit('... la pièce « Remise famille » donne son numéro, jamais sa remise : celle du code vit sur le rendez-vous (12 000 F, pas 6 000 F)', 12000, rose?.usages.find((u) => u.rdvId === 'r-fam')?.remiseXof);
dit('... cinq venues (le rendez-vous à venir n’en est pas une ; la cliente de passage compte ses versements), 45 500 F remisés pour 216 000 F, public',
  ['ROSE15', 'offre de saison', 'public', 6, null, 5, 45500, 216000, 216000 / 45500, '6 usages'], chiffres(rose));
dit('... le titre de l’offre voyage avec la ligne, et un code public n’a pas de compte de codes', ['Octobre Rose', 'saison', undefined], [rose?.titre, rose?.sorte, rose?.codes]);
dit('NOEL-2026 : le code d’une offre se compare par codeNormalise, le tiret reste ; une pièce sans rendez-vous compte ses versements',
  ['NOEL-2026', 'offre de saison', 'public', 1, null, 1, 4000, 36000, 9, '1 usage'], chiffres(ligne('offre:o2')));
dit('une offre sans code n’a pas de ligne ; une offre de parcours sans usage dit « 0 usage »', [undefined, ['DIAG', 'offre de parcours', 'public', 0, null, 0, 0, 0, null, '0 usage']],
  [ligne('offre:o3'), chiffres(ligne('offre:o4'))]);
dit('les publics, à part du total : trois lignes, sept usages, six venues', { lignes: 3, usages: 7, venuesGagnees: 6, remiseReelleXof: 49500, caEncaisseXof: 252000 }, compte.publics);

/* ── 4. Les orphelins ── */
dit('un code orphelin : fabriqué par l’Assistant, et sa ligne attend encore en salle ; ceux de la direction ne sont pas jugés', ['CREUX15-CCC'], codesOrphelins(codes, envois).map((c) => c.code));
dit('... sans aucune ligne partie, tous les codes de l’Assistant sont orphelins', ['CREUX15-AAA', 'CREUX15-BBB', 'CREUX15-CCC', 'ANNIV10-DDD'], codesOrphelins(codes, []).map((c) => c.code));

/* ── 5. La lettre du pur ── */
const pur = readFileSync('src/shared/compteur-des-remises-pur.ts', 'utf8');
const purSansCommentaires = sansCommentaires(pur);
dit('le pur : deux juges, chacun à sa famille (normaliseLeCode pour les nominatifs, codeNormalise pour les offres)', [true, true, false],
  [/normaliseLeCode\(c\.code\)/.test(purSansCommentaires), /codeNormalise\(offre\.code\)/.test(purSansCommentaires), /normaliseLeCode\(offre\.code\)|codeNormalise\(c\.code\)/.test(purSansCommentaires)]);
dit('... une ligne encore en salle n’est jamais partie ; le seuil des vingt envois est celui des prévisions', [true, true],
  [/if \(attendEncore\(e\)\) continue;/.test(purSansCommentaires), /ENVOIS_POUR_MESURER/.test(purSansCommentaires)]);
dit('pas de tiret cadratin, pas le mot banni, jamais un jour coupé d’une date', [false, false, false],
  [pur.includes(String.fromCharCode(0x2014)), /salon/i.test(pur), /slice\(0, 10\)/.test(pur)]);

console.log(ko === 0 ? '\nLe compteur des remises tient.' : `\n${ko} ECHEC(S)`);
if (ko) process.exitCode = 1;
