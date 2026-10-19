/* LE CAHIER PAPIER RATTRAPÉ, ÉPROUVÉ — `node scripts/verifie-le-cahier-rattrape.mjs`.

   19 octobre 2026. Maquette NKQMiMMY… validée (« Tout me va »), chantier
   « cahier » des huit : « Carnet › "Rattraper un cahier" : vous photographiez
   une page, Claude lit chaque ligne (date de la page ; par ligne : cliente,
   rituel, argent, moyen, avance/reste) et la compare à ce que le Trône sait
   déjà. Ce qui y est déjà ne se double pas ; le reste s'inscrit d'un geste,
   avec les avances et les restes dus. Tout part dans "Années passées", daté
   du jour de la page. Aucun message ne part. Une page de 2026 d'avant
   octobre s'inscrit à sa date, sans toucher les caisses du mois. » Cliente
   inconnue : « créer sa fiche, la rattacher à une fiche existante (un
   surnom, une faute), ou l'inscrire "de passage". »

   Les attentes sont écrites À LA MAIN d'après cette décision, jamais
   déduites du code. AUCUN ENVOI se prouve contre les VRAIS juges des envois
   (le reçu, la relance, le point d'après séance, la confirmation et l'avis),
   pas contre une copie. Jamais la vraie fonction ia-maison. Données
   d'exemple : aucune cliente réelle, aucun vrai numéro. */
import { readFileSync } from 'node:fs';
import {
  LIGNES_MAX_PAR_PAGE, MOYENS_DU_CAHIER, SCHEMA_DE_LA_PAGE, SEGMENT_DE_LA_FICHE_NEUVE,
  caisseDuRattrapage, consigneDuCahier, decisionParDefaut, ficheAvecLeSurnom, inscriptionDeLaPage,
  lectureDeLaPage, rapproche, rituelDuCatalogue,
  type DecisionDeLigne, type FicheConnue, type RendezVousConnu,
} from '../src/shared/ia-cahier-pur';
import { defautDeLaDemande, jetonsAccordes, peutDemander } from '../src/shared/ia-maison-pur';
import { sansCoordonnees } from '../src/shared/ia-anonymise-pur';
import { caisseDesAnneesPassees } from '../src/shared/caisses-des-caissiers-pur';
import { ARCHIVE, PIECES_D_OCTOBRE } from '../src/shared/bascule-des-caisses-pur';
import { SEGMENT_PROSPECT } from '../src/shared/demandes';
import { recuAEnvoyer } from '../src/shared/recu-whatsapp';
import { departDesRelances } from '../src/shared/relances-pur';
import { pointsDEtape } from '../src/shared/entre-deux-pur';
import { estAConfirmer, estampilleLaPose, poseApresSonHeure } from '../src/shared/agenda';
import type { Cashbox } from '../src/shared/finance';

let ko = 0;
const dit = (nom: string, attendu: unknown, obtenu: unknown) => {
  const a = JSON.stringify(attendu); const o = JSON.stringify(obtenu);
  if (a === o) console.log(`OK    ${nom}`);
  else { ko++; console.log(`ECHEC ${nom}\n       obtenu  ${o}\n       attendu ${a}`); }
};
const lis = (f: string) => readFileSync(f, 'utf8').split(String.fromCharCode(13)).join('');
/* « image/* » (le champ de la photo) ouvrirait un faux commentaire qui
   mangerait l'écran jusqu'au suivant : on le neutralise d'abord. */
const sansCommentaires = (t: string) => t.replace(/(["'])image\/\*\1/g, '$1image/tout$1')
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const compte = (t: string, motif: RegExp) => (t.match(new RegExp(motif.source, motif.flags.includes('g') ? motif.flags : `${motif.flags}g`)) ?? []).length;

const AUJOURDHUI = '2026-10-19';
const MAINTENANT = '2026-10-19T09:00:00.000Z';

/* ── 1. LA CONSIGNE ET LA DEMANDE ─────────────────────────────────────── */
{
  const c = consigneDuCahier({ aujourdhui: AUJOURDHUI });
  dit('la consigne veut la date AVEC L’ANNÉE, bornée par aujourd’hui', [true, true], [/AVEC L’ANNÉE/.test(c), c.includes(AUJOURDHUI)]);
  dit('elle connaît les mots du cahier : « retwist », « départ micro », « momo », « esp. »', [true, true, true, true],
    ['« retwist »', '« départ micro »', '« momo »', '« esp. »'].map((m) => c.includes(m)));
  dit('elle ne connaît AUCUNE cliente : pas une liste de prénoms en exemple', false, /\((?:[A-ZÀ-Ý][a-zà-ÿèéêíïɔɛ]+,\s*){2,}/u.test(c));
  dit('elle est la même quelles que soient les fiches : elle ne prend que le jour', 1, consigneDuCahier.length);
  dit('elle interdit de recopier un numéro de téléphone', true, /NUMÉRO DE TÉLÉPHONE[^\n]*JAMAIS/.test(c));
  dit('elle ne porte elle-même aucun numéro, aucun « salon », aucun nom du catalogue', [true, false, false],
    [sansCoordonnees(c) === c, /salon/i.test(c), /™|sinsin|vèkpè|vekpe/i.test(c)]);
  dit('elle dit qu’un chiffre illisible vaut 0 avec la note « illisible »', true, /illisible vaut 0[^\n]*« illisible »/.test(c));
  const s = SCHEMA_DE_LA_PAGE as { required: string[]; properties: { lignes: { maxItems: number; items: { required: string[]; properties: { moyen: { enum: string[] }; montant: { type: string; minimum: number } } } } } };
  dit('le schéma : la date et les lignes, soixante au plus', [['date', 'lignes'], 60], [s.required, s.properties.lignes.maxItems]);
  dit('une ligne : prénom, rituel, montant entier ≥ 0, moyen', [['prenom', 'rituel', 'montant', 'moyen'], 'integer', 0],
    [s.properties.lignes.items.required, s.properties.lignes.items.properties.montant.type, s.properties.lignes.items.properties.montant.minimum]);
  const moyens = ['especes', 'momo', 'carte', 'virement', 'cheque', 'inconnu'];
  dit('le moyen, une liste fermée de six', [moyens, moyens], [s.properties.lignes.items.properties.moyen.enum, [...MOYENS_DU_CAHIER]]);
  dit('la demande du Trône est recevable par la porte commune (cahier, image)', null, defautDeLaDemande({
    chantier: 'cahier', usage: 'image', systeme: c,
    messages: [{ role: 'user', content: 'Voici la page du cahier.' }],
    images: [{ base64: 'A'.repeat(400), mime: 'image/jpeg' }], schema: SCHEMA_DE_LA_PAGE, maxTokens: 3500,
  }));
  dit('... et les 3 500 jetons demandés lui sont accordés', 3500, jetonsAccordes(3500));
  /* Sa décision du 19 octobre : la direction, la Clientèle, les Finances. */
  const cas: [string | undefined, Record<string, boolean>][] = [
    ['souverain', {}], ['gerant', {}], ['maitre', {}], ['maitre', { 'dept-clientele': true }], ['maitre', { 'dept-finances': true }],
    ['maitre', { 'dept-atelier': true }], ['maitre', { 'dept-vente-caisse': true }], [undefined, { 'dept-clientele': true }],
  ];
  dit('qui rattrape un cahier : la direction, la Clientèle, les Finances', [true, true, false, true, true, false, false, false],
    cas.map(([r, a]) => peutDemander(r, 'cahier', a)));
}

/* ── 2. LA LECTURE, REVALIDÉE ─────────────────────────────────────────── */
{
  dit('ce qui n’est pas une page n’est rien', [null, null, null, null, null],
    [lectureDeLaPage(null, AUJOURDHUI), lectureDeLaPage('page', AUJOURDHUI), lectureDeLaPage([], AUJOURDHUI),
      lectureDeLaPage({ date: '2025-03-14', lignes: 'x' }, AUJOURDHUI), lectureDeLaPage({ date: '2025-03-14' }, AUJOURDHUI)]);
  const l = (o: Record<string, unknown>) => ({ prenom: 'Ayaba', rituel: 'retwist', montant: 10000, moyen: 'especes', ...o });
  const abime = lectureDeLaPage({ date: '2025-03-14', lignes: [l({ montant: -5 }), l({ montant: 12.5 }), l({ montant: 'abc' }), l({ montant: 1e9 }), l({ montant: '15 000' }), l({ montant: null })] }, AUJOURDHUI);
  dit('un montant abîmé fait tomber la ligne (négatif, décimal, lettres, milliard, vide) ; « 15 000 » se lit 15000',
    [[15000], 5], [abime?.lignes.map((x) => x.montant), abime?.defauts.filter((d) => /montant abîmé/.test(d)).length]);
  const dates = ['2026-10-20', '2025-02-30', '14/03/2025', '1999-12-31', '', '2026-10-19', '2025-03-14'].map((d) => lectureDeLaPage({ date: d, lignes: [] }, AUJOURDHUI));
  dit('la date : future, impossible, pas ISO, d’avant ce siècle, absente → à demander ; aujourd’hui et le passé passent',
    [null, null, null, null, null, '2026-10-19', '2025-03-14'], dates.map((p) => p?.date ?? null));
  dit('... et l’écran dit pourquoi : « date future refusée »', true, !!dates[0]?.defauts.includes('date future refusée (2026-10-20)'));
  const moy = lectureDeLaPage({ date: '2025-03-14', lignes: [l({ moyen: 'bitcoin' }), l({ moyen: 'MOMO' }), l({ moyen: undefined }), l({ moyen: 'cheque' })] }, AUJOURDHUI);
  dit('le moyen hors liste devient « inconnu » et se dit ; la casse ne compte pas', [['inconnu', 'momo', 'inconnu', 'cheque'], 1],
    [moy?.lignes.map((x) => x.moyen), moy?.defauts.filter((d) => /bitcoin/.test(d)).length]);
  const tot = lectureDeLaPage({ date: '2025-03-14', lignes: [l({ montant: 15000, total: 25000 }), l({ montant: 15000, total: 10000 }), l({ montant: 15000, total: 15000 }), l({ total: 'zz' }), l({ avance: true })] }, AUJOURDHUI);
  dit('avance et reste : un total au-dessus du reçu est gardé (avance) ; en dessous, ignoré ; abîmé, la ligne tombe',
    [[25000, null, null, null], [true, false, false, true]],
    [tot?.lignes.map((x) => x.total ?? null), tot?.lignes.map((x) => x.avance)]);
  const noms = lectureDeLaPage({ date: '2025-03-14', lignes: [l({ prenom: '' }), l({ prenom: '90 00 00 01' }), l({ prenom: 'Ayaba', nom: 'Hounsa 90000001', note: 'rappeler au 90 00 00 01', mention: 'Mme' }), l({ prenom: 'x'.repeat(200) })] }, AUJOURDHUI);
  dit('sans prénom, ou un numéro pris pour un prénom : la ligne tombe', 2, noms?.defauts.filter((d) => /sans prénom/.test(d)).length);
  dit('un numéro recopié malgré la consigne ne reste nulle part', ['Hounsa', 'rappeler au [numéro]', 'Mme'],
    [noms?.lignes[0]?.nom, noms?.lignes[0]?.note, noms?.lignes[0]?.mention]);
  dit('un prénom trop long est borné à 80 signes', 80, noms?.lignes[1]?.prenom.length);
  const trop = lectureDeLaPage({ date: '2025-03-14', lignes: Array.from({ length: 61 }, () => l({})) }, AUJOURDHUI);
  dit('soixante lignes au plus, et le reste se dit', [60, LIGNES_MAX_PAR_PAGE, true], [trop?.lignes.length, 60, !!trop?.defauts.some((d) => /au-delà de 60/.test(d))]);
  const ill = lectureDeLaPage({ date: '2025-03-14', lignes: [l({ montant: 0, note: 'chiffre illisible' }), l({ montant: 0, note: 'offert' })] }, AUJOURDHUI);
  dit('l’argent illisible se marque (et l’offert non)', [true, false], ill?.lignes.map((x) => !!x.illisible));
}

/* ── 3. LE RAPPROCHEMENT ──────────────────────────────────────────────── */
const FICHES: FicheConnue[] = [
  { id: 'f-awa', name: 'Awa Dossou' },
  { id: 'f-cla', name: 'Clarisse Adjovi' },
  { id: 'f-ste', name: 'Stéphanie Hounkpè', aussiDit: ['Steph'] },
  { id: 'f-sen', name: 'Sèna Agossou' },
  { id: 'f-mi1', name: 'Mireille Akpo' },
  { id: 'f-mi2', name: 'Mireille Zinsou' },
  { id: 'f-old', name: 'Rosine Tossa', archived: true },
  { id: 'f-dah', name: 'Dah Bernadette' },
  { id: 'f-afi', name: 'Afi' },
  { id: 'f-pel', name: 'Pélagie Gbèdo' },
];
const RDVS: RendezVousConnu[] = [
  { id: 'r1', clientId: 'f-awa', date: '2025-03-14', status: 'honoré', payments: [{ amountXof: 15000, date: '2025-03-14' }] },
  { id: 'r2', clientId: 'f-sen', date: '2025-03-13', status: 'honoré', priceXof: 20000, paidXof: 20000 },
  { id: 'r3', clientId: 'f-cla', date: '2025-03-14', status: 'annulé', priceXof: 10000 },
  { id: 'r4', clientId: 'f-ste', date: '2025-03-17', status: 'honoré', payments: [{ amountXof: 10000 }] },
];
const SERVICES = [
  { id: 's-sinsin', name: 'SÍNSIN™ Essentiel' },
  { id: 's-vekpe', name: 'VÈKPÈ™ Naissance des locks' },
  { id: 's-wewe', name: 'WÈWÈ™ Purification' },
];
const ligne = (prenom: string, montant: number, o: Record<string, unknown> = {}) => ({ prenom, rituel: 'retwist', montant, moyen: 'especes', ...o });
const BRUT = {
  date: '2025-03-14',
  lignes: [
    ligne('Awa', 15000, { nom: 'D.' }),                                  // L1  initiale, déjà (r1)
    ligne('Sena', 20000, { nom: 'Agossou', moyen: 'momo' }),             // L2  sans accent, déjà la veille (r2)
    ligne('Steph', 10000),                                               // L3  surnom retenu
    ligne('Clarise', 10000, { rituel: 'départ micro', moyen: 'momo' }), // L4  une lettre, son rituel annulé ne compte pas
    ligne('Clarise', 12000, { nom: 'Houngbo', rituel: 'shampoing' }),    // L5  une lettre, mais un autre nom : inconnue
    ligne('Mireille', 8000),                                             // L6  deux fiches répondent
    ligne('Koffi', 5000, { rituel: 'tresses africaines' }),              // L7  personne
    ligne('Awa', 25000, { nom: 'D.', moyen: 'inconnu' }),                // L8  même jour, autre argent : voisin
    ligne('Steph', 10000),                                               // L9  recopiée plus haut
    ligne('Bernadette', 15000, { nom: 'D.', total: 25000, rituel: 'départ micro', moyen: 'carte' }), // L10 nom d'abord, avance
    ligne('Afi', 7000, { nom: 'Kpodo', moyen: 'cheque' }),               // L11 la fiche n'a qu'un prénom
    ligne('Rosine', 9000, { nom: 'Tossa' }),                             // L12 fiche rangée : inconnue
    ligne('Sèna', 0, { rituel: 'soin', note: 'offert' }),                // L13 offert, reconnu au jour : déjà
    ligne('Tantine', 9000, { moyen: 'virement' }),                       // L14 un surnom qu'on rattachera
    ligne('Clarise', 4000, { nom: 'Houngbo', rituel: 'shampoing' }),     // L15 la même inconnue, encore
    ligne('Pélagie', 0, { note: 'illisible' }),                          // L16 argent illisible
  ],
};
const PAGE = lectureDeLaPage(BRUT, AUJOURDHUI)!;
const LIGNES = rapproche(PAGE, FICHES, RDVS, SERVICES);
{
  dit('chaque ligne, son état (déjà / à inscrire / inconnue)', [
    'deja', 'deja', 'a-inscrire', 'a-inscrire', 'inconnue', 'inconnue', 'inconnue', 'a-inscrire',
    'a-inscrire', 'a-inscrire', 'a-inscrire', 'inconnue', 'deja', 'inconnue', 'inconnue', 'a-inscrire',
  ], LIGNES.map((l) => l.etat));
  dit('... sa cliente', ['f-awa', 'f-sen', 'f-ste', 'f-cla', null, null, null, 'f-awa', 'f-ste', 'f-dah', 'f-afi', null, 'f-sen', null, null, 'f-pel'],
    LIGNES.map((l) => l.cliente?.id ?? null));
  dit('... et comment elle a été reconnue (l’initiale, l’accent, le surnom, une lettre, le prénom)',
    ['initiale', 'exact', 'surnom', 'proche', null, null, null, 'initiale', 'surnom', 'initiale', 'prenom', null, 'prenom', null, null, 'prenom'],
    LIGNES.map((l) => l.comment ?? null));
  dit('deux fiches répondent : aucune n’est choisie, les deux sont proposées', [['f-mi1', 'f-mi2'], null], [LIGNES[5].candidats.map((c) => c.id), LIGNES[5].cliente ?? null]);
  dit('le rendez-vous déjà au Trône : le même jour, la veille, et l’offert au seul jour', ['r1', 'r2', 'r2'], [LIGNES[0].deja?.id, LIGNES[1].deja?.id, LIGNES[12].deja?.id]);
  dit('le même jour pour un autre argent : un voisin montré, rien de décidé', ['a-inscrire', 'r1'], [LIGNES[7].etat, LIGNES[7].voisin?.id]);
  dit('trois jours plus tard ne compte pas « le même »', [undefined, undefined], [LIGNES[2].deja?.id, LIGNES[2].voisin?.id]);
  dit('la ligne recopiée plus haut se repère, et se décoche', [true, 'ecarter'], [LIGNES[8].doublonDansLaPage, decisionParDefaut(LIGNES[8]).geste]);
  dit('ce qui s’inscrit d’office : la fiche reconnue ; l’inconnue, le déjà-là et l’illisible attendent',
    ['ecarter', 'ecarter', 'fiche', 'fiche', 'ecarter', 'ecarter', 'ecarter', 'fiche', 'ecarter', 'fiche', 'fiche', 'ecarter', 'ecarter', 'ecarter', 'ecarter', 'ecarter'],
    LIGNES.map((l) => decisionParDefaut(l).geste));
  dit('le rituel du catalogue : « retwist », « départ micro », « shampoing » ; un libellé inconnu reste libre',
    ['s-sinsin', 's-vekpe', 's-wewe', null], ['retwist', 'départ micro', 'shampoing', 'tresses africaines'].map((r) => rituelDuCatalogue(r, SERVICES)?.id ?? null));
  dit('... sans catalogue, rien ne se propose', null, rituelDuCatalogue('retwist', []) ?? null);
  dit('sans date de page, rien n’est « déjà là »', 0, rapproche({ date: null, lignes: PAGE.lignes }, FICHES, RDVS, SERVICES).filter((l) => l.etat === 'deja').length);
  dit('la fiche retient un autre nom, jamais un morceau du sien', [['Steph'], undefined, undefined, ['Tantine Awa'], ['Steph']],
    [ficheAvecLeSurnom({ name: 'Stéphanie Hounkpè' }, 'Steph').aussiDit, ficheAvecLeSurnom({ name: 'Awa Dossou' }, 'Awa').aussiDit,
      ficheAvecLeSurnom({ name: 'Awa Dossou' }, 'Awa D.').aussiDit, ficheAvecLeSurnom({ name: 'Awa Dossou' }, 'Tantine Awa').aussiDit,
      ficheAvecLeSurnom({ name: 'Stéphanie Hounkpè', aussiDit: ['Steph'] }, 'steph').aussiDit]);
  const apres = rapproche({ date: '2025-03-20', lignes: [PAGE.lignes[13]] }, FICHES.map((f) => (f.id === 'f-cla' ? ficheAvecLeSurnom(f as FicheConnue & { aussiDit?: string[] }, 'Tantine') : f)), [], SERVICES);
  dit('... et la page suivante la reconnaît seule', ['f-cla', 'surnom'], [apres[0].cliente?.id, apres[0].comment]);
}

/* ── 4. LA CAISSE DU RATTRAPAGE ───────────────────────────────────────── */
const boite = (name: string, o: Partial<Cashbox> = {}): Cashbox => ({ id: `cb-${name}`, branchId: 'b1', name, sub: '', glyph: '◈', openingXof: 0, ...o });
const DU_MOIS = [boite('Terrasse · Tiroir espèces', { role: 'terrasse' }), boite('Caisse de Gérard', { role: 'terrasse', caissierId: 'st-g' }), boite('La Banque', { role: 'banque' }), boite('Caisse du mois', { role: 'mois' })];
{
  const c = (datePage: string, boxes: Cashbox[], aujourdhui = AUJOURDHUI) => caisseDuRattrapage({ datePage, aujourdhui, boxes, branchId: 'b1' });
  const a25 = c('2025-03-14', DU_MOIS);
  dit('une page de 2025 : « Années passées », née au besoin, qui garde son histoire', [true, 'Années passées', 'cb-annees-passees-b1', true],
    [a25.ok, a25.ok && a25.caisse, a25.ok && a25.aCreer?.id, a25.ok && a25.aCreer?.histoire]);
  const a23 = c('2023-06-01', [...DU_MOIS, caisseDesAnneesPassees('b1')]);
  dit('une page de 2023 aussi, et la caisse ouverte ne renaît pas', ['Années passées', undefined], [a23.ok && a23.caisse, a23.ok ? a23.aCreer : 'refus']);
  const rangee = c('2024-01-10', [...DU_MOIS, { ...caisseDesAnneesPassees('b1'), id: 'cb-ap-ancienne', archiveeLe: '2026-10-17' }]);
  dit('rangée, elle revient par son identifiant au lieu de naître en double', ['cb-ap-ancienne', undefined], [rangee.ok && rangee.aCreer?.id, rangee.ok && rangee.aCreer?.archiveeLe]);
  const sep = c('2026-09-12', [...DU_MOIS, boite(ARCHIVE, { role: 'archive' })]);
  dit('une page de septembre 2026 : l’archive d’avant la bascule', [true, 'Caisse principale · jusqu’au 30 sept. 2026'], [sep.ok, sep.ok && sep.caisse]);
  const sepAnc = c('2026-09-12', [...DU_MOIS, boite('Caisse de Brice (ancienne)', { caissierId: 'st-b', jusquAu: '2026-09-30' }), boite('Caisse principale', { jusquAu: '2026-09-30' })]);
  dit('... sans archive : une caisse d’avant la bascule, jamais celle d’un caissier', 'Caisse principale', sepAnc.ok && sepAnc.caisse);
  const sepRien = c('2026-09-12', DU_MOIS);
  dit('... sans rien d’ancien : l’archive naît, jusqu’au 30 septembre 2026', ['Caisse principale · jusqu’au 30 sept. 2026', 'archive', '2026-09-30'],
    [sepRien.ok && sepRien.caisse, sepRien.ok && sepRien.aCreer?.role, sepRien.ok && sepRien.aCreer?.jusquAu]);
  dit('jamais une caisse du mois, jamais celle d’un caissier', [false, false, false, false], [a25, a23, sep, sepRien].map((r) => r.ok && (
    PIECES_D_OCTOBRE.includes(r.caisse) || ['Terrasse · Tiroir espèces', 'Caisse de Gérard', 'La Banque', 'Caisse du mois'].includes(r.caisse))));
  const refus = ['2026-10-01', '2026-10-05', '2026-10-20', ''].map((d) => c(d, DU_MOIS).ok);
  dit('octobre 2026, l’avenir, et sans date : refusés', [false, false, false, false], refus);
  dit('la borne est fixe : en janvier 2027, une page de décembre 2026 se refuse encore', false, c('2026-12-30', DU_MOIS, '2027-01-06').ok);
  const plusTard = c('2026-09-12', DU_MOIS, '2027-01-06');
  dit('... et septembre 2026 est alors une année passée', 'Années passées', plusTard.ok && plusTard.caisse);
}

/* ── 5. L'INSCRIPTION ─────────────────────────────────────────────────── */
let n = 0;
const nouvelId = () => `n${++n}`;
const DECISIONS: Record<string, DecisionDeLigne> = {
  l5: { geste: 'nouvelle' },
  l6: { geste: 'fiche', clienteId: 'f-mi2' },
  l7: { geste: 'passage' },
  l14: { geste: 'fiche', clienteId: 'f-cla' },
  l15: { geste: 'nouvelle' },
  l16: { geste: 'fiche', clienteId: 'f-pel', montant: 6000 },
};
const PROJET = inscriptionDeLaPage({
  datePage: '2025-03-14', aujourdhui: AUJOURDHUI, branchId: 'b1', boxes: DU_MOIS, lignes: LIGNES, decisions: DECISIONS,
  fiches: FICHES, services: SERVICES, persona: 'ps-initie', marque: 'serie:cahier-test', nouvelId,
});
if (!PROJET.ok) { ko++; console.log(`ECHEC l’inscription d’une page de 2025 est refusée : ${PROJET.refus}`); }
const RDV = PROJET.ok ? PROJET.rendezVous : [];
{
  const p = PROJET.ok ? PROJET : null;
  dit('onze rituels s’inscrivent ; trois déjà au Trône ne se doublent pas ; deux restent écartés', [11, 3, 2], [RDV.length, p?.dejaLa, p?.ecartees]);
  dit('ce qui s’inscrit : les lignes 3, 4, 5, 6, 7, 8, 10, 11, 14, 15, 16 (leurs prénoms)',
    ['Stéphanie Hounkpè', 'Clarisse Adjovi', 'Clarise Houngbo', 'Mireille Zinsou', 'Koffi', 'Awa Dossou', 'Dah Bernadette', 'Afi', 'Clarisse Adjovi', 'Clarise Houngbo', 'Pélagie Gbèdo'],
    RDV.map((a) => a.clientName));
  dit('tout est daté du jour de la page, honoré, à 10 h, la Maison pour maître', [true, true, true, true],
    [RDV.every((a) => a.date === '2025-03-14'), RDV.every((a) => a.status === 'honoré'), RDV.every((a) => a.time === '10:00'), RDV.every((a) => a.master === 'Maison')]);
  const versements = RDV.flatMap((a) => a.payments ?? []);
  dit('chaque versement : le jour de la page, « Années passées », la marque de la page', [11, true, true, true],
    [versements.length, versements.every((v) => v.date === '2025-03-14'), versements.every((v) => v.cashbox === 'Années passées'), versements.every((v) => v.note === 'serie:cahier-test')]);
  dit('la caisse des années passées s’ouvre une fois', [['cb-annees-passees-b1'], 'Années passées'], [p?.caissesACreer.map((b) => b.id), p?.caisse]);
  dit('l’argent reçu et le reste dû', [111000, 10000], [p?.totalRecu, p?.totalReste]);
  const bern = RDV.find((a) => a.clientId === 'f-dah');
  dit('l’avance : le prix lu (25 000), le reçu (15 000), le reste visible', [25000, 15000, 1], [bern?.priceXof, bern?.paidXof, bern?.payments?.length]);
  dit('le moyen du Trône pour chaque moyen lu (MoMo, carte, chèque, virement ; non lu = espèces, et la note le dit)',
    ['MTN MoMo', 'Carte', 'Chèque', 'Virement bancaire', 'Espèces', true],
    [RDV[1].payments?.[0]?.method, RDV[6].payments?.[0]?.method, RDV[7].payments?.[0]?.method, RDV[8].payments?.[0]?.method, RDV[5].payments?.[0]?.method,
      /moyen non lu/.test(RDV[5].note ?? '')]);
  dit('le rituel du catalogue quand le libellé l’appelle ; sinon le libellé lu reste, au prix lu', [['s-sinsin'], undefined, [], 'tresses africaines', 5000],
    [RDV[0].serviceIds, RDV[0].forfait, RDV[4].serviceIds, RDV[4].forfait?.nom, RDV[4].forfait?.totalXof]);
  dit('de passage : sans fiche, le nom lu sur le rendez-vous', ['', 'Koffi'], [RDV[4].clientId, RDV[4].clientName]);
  const fiches = p?.fiches ?? [];
  dit('« créer sa fiche » deux fois pour la même inconnue n’en ouvre qu’une, segment Prospect, cliente depuis le jour de la page',
    [1, 'Clarise Houngbo', ['Prospect'], '2025-03-14', '', true],
    [fiches.length, fiches[0]?.name, fiches[0]?.segments, fiches[0]?.since, fiches[0]?.phone, RDV[2].clientId === fiches[0]?.id && RDV[9].clientId === fiches[0]?.id]);
  dit('le segment de la fiche neuve est celui des demandes du site', ['Prospect', 'Prospect'], [SEGMENT_DE_LA_FICHE_NEUVE, SEGMENT_PROSPECT]);
  dit('rattachée à la main : la fiche retient le nom du cahier, pas son propre prénom', [{ clienteId: 'f-cla', dit: 'Tantine' }], p?.surnoms);
  dit('l’argent illisible, tapé à la main, s’inscrit au montant tapé', [6000, 6000], [RDV[10].paidXof, RDV[10].payments?.[0]?.amountXof]);
  dit('aucun rituel ne mange un abonnement (pas de fin de paquet)', true, RDV.every((a) => !a.coveredBySub));
  const zero = inscriptionDeLaPage({
    datePage: '2025-03-14', aujourdhui: AUJOURDHUI, branchId: 'b1', boxes: DU_MOIS, lignes: LIGNES,
    decisions: { l13: { geste: 'fiche', clienteId: 'f-sen' }, l16: { geste: 'fiche', clienteId: 'f-pel' } },
    fiches: FICHES, services: SERVICES, persona: 'ps', marque: 'serie:z', nouvelId,
  });
  dit('une ligne déjà au Trône ne s’inscrit jamais, même cochée ; un rituel à zéro ne porte aucun versement', [true, 0],
    [zero.ok && !zero.rendezVous.some((a) => a.clientId === 'f-sen'), zero.ok ? (zero.rendezVous.find((a) => a.clientId === 'f-pel')?.payments ?? ['?']).length : -1]);
  const refuse = (datePage: string, aujourdhui = AUJOURDHUI) => inscriptionDeLaPage({
    datePage, aujourdhui, branchId: 'b1', boxes: DU_MOIS, lignes: LIGNES, decisions: DECISIONS, fiches: FICHES, services: SERVICES, persona: 'ps', marque: 'serie:r', nouvelId,
  }).ok;
  dit('rien ne s’inscrit pour une page d’octobre 2026, de demain, sans date', [false, false, false], [refuse('2026-10-05'), refuse('2026-10-20'), refuse('')]);
  const sep = inscriptionDeLaPage({
    datePage: '2026-09-12', aujourdhui: AUJOURDHUI, branchId: 'b1', boxes: [...DU_MOIS, boite(ARCHIVE, { role: 'archive' })], lignes: LIGNES, decisions: DECISIONS,
    fiches: FICHES, services: SERVICES, persona: 'ps', marque: 'serie:s', nouvelId,
  });
  dit('une page de septembre 2026 s’inscrit à sa date, dans l’archive, sans toucher les caisses du mois', [true, true, true],
    [sep.ok && sep.rendezVous.every((a) => a.date === '2026-09-12'),
      sep.ok && sep.rendezVous.flatMap((a) => a.payments ?? []).every((v) => v.cashbox === ARCHIVE && v.date === '2026-09-12'),
      sep.ok && sep.caissesACreer.length === 0]);
}

/* ── 6. AUCUN MESSAGE NE PART, devant les vrais juges ─────────────────── */
{
  const poses = RDV.map((a) => estampilleLaPose({ ...a, creeLe: MAINTENANT }));
  const now = Date.parse(MAINTENANT);
  dit('aucun reçu : l’argent n’est pas d’aujourd’hui, le rituel est passé', false,
    poses.some((a) => (a.payments ?? []).some((v) => recuAEnvoyer({ jourDuPaiement: v.date, jourDuRituel: a.date, aujourdhui: AUJOURDHUI }))));
  dit('aucune confirmation, aucune demande d’avis : posé après son heure, et honoré', [true, false],
    [poses.every((a) => poseApresSonHeure(a)), poses.some((a) => estAConfirmer(a, now))]);
  const reglages = { actives: true, depuis: '2026-10-18', rattrapage: { valideLe: '2026-10-19', ids: ['autre-piece'] } };
  dit('aucune relance : la pièce naît datée du rituel, écrite des mois après, avant le lancement', true,
    poses.every((a) => departDesRelances({ id: `inv-${a.id}`, date: a.date, creeeLe: MAINTENANT }, reglages, (i) => i.slice(0, 10)) === null));
  const points = pointsDEtape(poses.map((a) => ({ id: a.id, date: a.date, status: a.status, clientId: a.clientId })), AUJOURDHUI);
  dit('aucun point d’après séance : il tomberait le 21 mars 2025, pas aujourd’hui', [false, '2025-03-21'],
    [points.some((p) => p.date === AUJOURDHUI), points.find((p) => p.type === 'apres')?.date]);
  /* LA PREUVE QUE LA BORNE FIXE SERT : une page du 30 décembre 2026,
     inscrite le 6 janvier 2027, ferait partir le point ce jour-là. */
  const fictif = pointsDEtape([{ id: 'x', date: '2026-12-30', status: 'honoré', clientId: 'f-awa' }], '2027-01-06');
  dit('sans la borne, décembre 2026 rattrapé le 6 janvier 2027 réveillerait le point (la borne le refuse)', [true, false],
    [fictif.some((p) => p.type === 'apres' && p.date === '2027-01-06'),
      inscriptionDeLaPage({ datePage: '2026-12-30', aujourdhui: '2027-01-06', branchId: 'b1', boxes: DU_MOIS, lignes: LIGNES, decisions: DECISIONS, fiches: FICHES, services: SERVICES, persona: 'ps', marque: 'serie:y', nouvelId }).ok]);
  dit('tout ce qui s’inscrit est d’avant le 1er octobre 2026 (le merci de la marraine veut une venue d’après le 9)', true, poses.every((a) => a.date < '2026-10-01'));
}

/* ── 7. L'ÉCRAN : LE BOUTON GARDÉ, RIEN SANS « INSCRIRE » ────────────── */
{
  const carnet = sansCommentaires(lis('src/apps/trone/routes/clients/Carnet.tsx'));
  dit('le Carnet monte l’écran du cahier', true, /import \{ RattraperUnCahier \} from '\.\/RattraperUnCahier'/.test(carnet));
  dit('le bouton se montre si la fonction est posée ET si son département le permet', true,
    /const saitIaMaison = useSaitIaMaison\(\);[\s\S]*?const peutRattraperUnCahier = saitIaMaison === true && peutDemander\(moiCarnet\?\.role, 'cahier', mesDomainesCarnet\);/.test(carnet));
  dit('... « Rattraper un cahier » sous cette garde, à côté de « Saisir en série »', true,
    /Saisir en série<\/Button>\s*\{peutRattraperUnCahier && \(\s*<Button[^>]*onClick=\{\(\) => setCahierOuvert\(true\)\}>Rattraper un cahier<\/Button>\s*\)\}/.test(carnet));
  dit('... et l’écran ne s’ouvre que sous la même garde', true, /\{cahierOuvert && peutRattraperUnCahier && <RattraperUnCahier /.test(carnet));
  dit('aucune rubrique de plus dans la barre : pas de route pour le cahier', false, /rattraper|cahier/i.test(lis('src/apps/trone/routes/index.tsx').replace(/\/\*[\s\S]*?\*\//g, '')));

  const ecran = sansCommentaires(lis('src/apps/trone/routes/clients/RattraperUnCahier.tsx'));
  const debut = ecran.indexOf('const inscrire = () => {');
  const fin = ecran.indexOf('const etatDit', debut);
  const corps = debut >= 0 && fin > debut ? ecran.slice(debut, fin) : '';
  const ecritures = [/appointmentsStore\.set\(/, /clientsStore\.set\(/, /cashboxesStore\.set\(/, /invoicesStore/, /emettreLaPieceDuRituelRegle\(/];
  dit('tout ce qui écrit vit dans « inscrire », et nulle part ailleurs', [[1, 2, 1, 0, 1], [1, 2, 1, 0, 1]],
    [ecritures.map((m) => compte(corps, m)), ecritures.map((m) => compte(ecran, m))]);
  dit('« inscrire » ne part que du bouton « Inscrire N lignes »', [1, 1, 1, 0],
    [compte(ecran, /onClick=\{inscrire\}>\s*Inscrire \{retenues\.length\}/), compte(ecran, /\{inscrire\}/), compte(ecran, /const inscrire = /), compte(ecran, /\binscrire\(/)]);
  dit('... que Claude n’a pas : il lit, l’écran garde sa lecture en mémoire', [0, 0], [compte(ecran.slice(ecran.indexOf('const lirePage'), debut), /Store\.set\(/), compte(ecran.slice(ecran.indexOf('const lirePage'), debut), /inscri/)]);
  dit('aucun envoi depuis cet écran : ni reçu, ni facture envoyée, ni WhatsApp, ni avis, ni relance', false,
    /envoi-de-la-piece|recu-whatsapp|facture-whatsapp|shared\/whatsapp'|useEnvoiDeLaPiece|envoieLe|envoieSur|functions\.invoke|avis-google|relance|demandeLePaiement/.test(ecran));
  const appel = ecran.slice(ecran.indexOf('demandeAClaude<'), ecran.indexOf('});', ecran.indexOf('demandeAClaude<')));
  dit('la demande : chantier « cahier », une image, sa consigne, son schéma', [true, true, true, true],
    [/chantier: 'cahier'/.test(appel), /usage: 'image'/.test(appel), /systeme: consigneDuCahier\(/.test(appel), /schema: SCHEMA_DE_LA_PAGE/.test(appel)]);
  dit('... la photo seule part : aucune fiche, aucun nom, aucun numéro', false, /fichesDIci|tousLesClients|rdvDIci|\.name|phone|clientName/.test(appel));
  dit('la sortie de Claude passe au tamis avant tout usage', [1, 1], [compte(ecran, /\br\.data\b/), compte(ecran, /lectureDeLaPage\(r\.data, aujourdhui\)/)]);
  dit('les cases lues se disent « à vérifier », teintées cuivre', [true, true], [/à vérifier/.test(ecran), /background: 'var\(--copper-50/.test(ecran)]);
  dit('un bouton inscrit, un autre écarte la page', [true, true], [/Inscrire \{retenues\.length\}/.test(ecran), />Écarter la page</.test(ecran)]);
  dit('les trois gestes d’une inconnue : créer sa fiche, rattacher, de passage', [true, true, true],
    [/>Créer sa fiche</.test(ecran), />Rattacher à une fiche</.test(ecran), />De passage</.test(ecran)]);
  const pur = sansCommentaires(lis('src/shared/ia-cahier-pur.ts'));
  dit('aucun tiret cadratin ni « salon » dans ce qui s’affiche', [false, false, false, false], [/—/.test(ecran), /—/.test(pur), /salon/i.test(ecran), /salon/i.test(pur)]);
  dit('le module pur n’écrit rien et n’appelle personne', false, /Store\b|supabase|fetch\(|demandeAClaude|localStorage/.test(pur));
  const partage = lis('src/apps/trone/routes/clients/_shared.tsx');
  dit('sans prestation du catalogue, le Carnet et la pièce lisent le libellé du cahier', true,
    /export const apptLabel = [\s\S]{0,400}?\.join\(' \+ '\) \|\| a\.forfait\?\.nom\?\.trim\(\) \|\| '—';/.test(partage));
  dit('la fiche porte ses autres noms', true, /aussiDit\?: string\[\];/.test(lis('src/shared/clients.ts')));
}

console.log(ko === 0 ? '\nTOUT VA BIEN' : `\n${ko} ÉCHEC(S)`);
if (ko) process.exitCode = 1;
