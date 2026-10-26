/* LES AVIS GOOGLE RELIÉS AUX FICHES, ÉPROUVÉS — `node scripts/verifie-les-avis-relies.mjs`.

   20 octobre 2026. « Je veux voir un onglet à part pour les avis Google, et
   leurs réponses » et « à partir d'aujourd'hui lier un avis à une fiche »
   (Yéman). Maquette DNVVXdkd… validée (« Tout me va »), réponses au
   sélecteur et sur la maquette :
     - un quatrième onglet de Vitrines, « Les avis Google » ; les réponses
       quittent « Le site public », qui garde le choix des avis du site ;
     - la fiche est PROPOSÉE (demande d'avis partie dans les 30 jours d'avant
       et même prénom, sinon venue dans les 30 jours d'avant), puis confirmée
       d'un toucher ; rien ne se relie seul ; trois propositions au plus ;
     - à partir du 20 octobre 2026 ; avant, rien n'est proposé, la main peut
       relier quand même ;
     - un avis de 1 à 3 étoiles prévient la direction, sans le texte ;
     - Claude ne lit jamais la fiche ; rien ne part sur Google d'ici.

   Les attentes sont ÉCRITES d'après ces décisions, jamais déduites du code.
   Données d'exemple ; aucun appel réseau (le client Supabase vaut null). */
import { readFileSync } from 'node:fs';
import { transformSync } from 'esbuild';
import {
  CLE_DES_LIENS, DEPART_DES_LIENS, JOURS_DE_LA_DEMANDE, JOURS_DE_LA_VENUE, PROPOSITIONS_MAX,
  JOURS_ENTRE_DEUX_DEMANDES, NOTE_A_RECONQUERIR, demandeDAvisPermise, derniereDemandeDAvis, dernierAvisDe, ditLaDemandeDAvis,
  avisDeLaCliente, chercheDesFiches, compteARelier, compteParFiltre, estDepuisLeDepart, etatDuLien, fichesProposees,
  jourACotonou, jourDeLAvis, motsDuNom, passeLeFiltre, pourquoiProposee, prenomCompare,
  type AvisDuReleve, type FiltreDesAvis, type LiensDesAvis,
} from '../src/shared/avis-fiches-pur';
import { delieLAvis, liensDesAvisStore, marqueSansFiche, relieLAvis } from '../src/shared/avis-fiches';
import { idDeLAvis, type BrouillonsDAvis } from '../src/shared/ia-avis-pur';
import { supabase } from '../src/shared/supabase';
import { documentDescendu } from '../src/shared/sync';

if (supabase) throw new Error('le harnais a un client Supabase : il pourrait écrire au serveur');

let ko = 0;
const dit = (nom: string, attendu: unknown, obtenu: unknown) => {
  const a = JSON.stringify(attendu); const o = JSON.stringify(obtenu);
  if (a === o) console.log(`OK    ${nom}`);
  else { ko++; console.log(`ECHEC ${nom}\n       obtenu  ${o}\n       attendu ${a}`); }
};
const lis = (f: string) => readFileSync(f, 'utf8').split(String.fromCharCode(13)).join('');
const sansCommentaires = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '');
function extrais(f: string, nom: string): string {
  const src = lis(f);
  const debut = src.indexOf(`// ── DEBUT ${nom}`);
  const fin = src.indexOf(`// ── FIN ${nom}`);
  if (debut < 0 || fin < debut) throw new Error(`${f} : le bloc ${nom} a disparu`);
  return src.slice(debut, fin);
}

/* ── 1. SA DÉCISION, EN CHIFFRES ─────────────────────────────────────── */
dit('le départ le 20 octobre 2026, 30 jours pour la demande et pour la venue, 3 propositions, le document mnd_avis_fiches',
  ['2026-10-20', 30, 30, 3, 'mnd_avis_fiches'], [DEPART_DES_LIENS, JOURS_DE_LA_DEMANDE, JOURS_DE_LA_VENUE, PROPOSITIONS_MAX, CLE_DES_LIENS]);

/* ── 2. LE JOUR D'UN AVIS ────────────────────────────────────────────── */
const RELEVE = '2026-10-22T06:00:00Z';
dit('le jour donné par Google, à l heure de Cotonou (UTC+1) : 23 h 30 UTC le 20 est le 21', '2026-10-21', jourDeLAvis({ publieLe: '2026-10-20T23:30:00Z', quand: 'il y a 2 jours' }, RELEVE));
dit('sans jour de Google, estimé au relevé : 2 jours, une semaine, 3 heures, hier, un mois ; illisible ou sans relevé : rien',
  ['2026-10-20', '2026-10-15', '2026-10-22', '2026-10-21', '2026-09-22', null, null],
  [jourDeLAvis({ quand: 'il y a 2 jours' }, RELEVE), jourDeLAvis({ quand: 'il y a une semaine' }, RELEVE), jourDeLAvis({ quand: 'il y a 3 heures' }, RELEVE),
    jourDeLAvis({ quand: 'hier' }, RELEVE), jourDeLAvis({ quand: 'il y a un mois' }, RELEVE), jourDeLAvis({ quand: 'récemment' }, RELEVE), jourDeLAvis({ quand: 'il y a 2 jours' }, undefined)]);
dit('à partir du 20 octobre 2026 (heure de Cotonou) : 23 h 59 le 19 non, minuit le 20 oui',
  [false, true], [estDepuisLeDepart({ publieLe: '2026-10-19T22:59:59Z', quand: '' }, RELEVE), estDepuisLeDepart({ publieLe: '2026-10-19T23:00:00Z', quand: '' }, RELEVE)]);
dit('jourACotonou : un instant illisible ne donne rien', null, jourACotonou('pas une date'));

/* ── 3. LES NOMS ─────────────────────────────────────────────────────── */
dit('les mots d un nom, sans accent ni majuscule, lettres du fon gardées', [['senami', 'd'], ['ɖɛkpɛ', 'awa'], ['kevin']],
  [motsDuNom('Sènami D.'), motsDuNom('Ɖɛkpɛ AWA'), motsDuNom('Kévin')]);
dit('le prénom lisible : le premier mot de deux lettres ; une initiale seule n en est pas un', ['mireille', '', 'kevin', ''],
  [prenomCompare('Mireille A.'), prenomCompare('A. Dossou'), prenomCompare('KÉVIN'), prenomCompare('')]);

/* ── 4. LA FICHE PROPOSÉE ────────────────────────────────────────────── */
const CLIENTS = [
  { id: 'c1', name: 'Mireille AGOSSOU', phone: '+229 01 51 00 00 01' },
  { id: 'c2', name: 'Mireille Sossa', phone: '+229 01 51 00 00 02' },
  { id: 'c3', name: 'Kevin Houngbo', phone: '+229 01 51 00 00 03' },
  { id: 'c4', name: 'Kévin Tossou', phone: '+229 01 51 00 00 04' },
  { id: 'c5', name: 'Awa Mireille Dossou', phone: '+229 01 51 00 00 05' },
  { id: 'c6', name: 'Sènami Dah', phone: '+229 01 51 00 00 06' },
];
const ENVOIS = [
  { type: 'avis-google', clientId: 'c1', quand: '2026-10-19T10:00:00Z', statut: 'envoyé' },
  { type: 'avis-google', clientId: 'c3', quand: '2026-10-17T10:00:00Z', statut: 'à-la-main' },
  { type: 'avis-google', clientId: 'c2', quand: '2026-09-01T10:00:00Z', statut: 'envoyé' },
  { type: 'avis-google', clientId: 'c5', quand: '2026-10-18T10:00:00Z', statut: 'échec' },
  { type: 'rappel-j1', clientId: 'c6', quand: '2026-10-19T10:00:00Z', statut: 'envoyé' },
  { type: 'avis-google', clientId: 'c6', quand: '2026-10-25T10:00:00Z', statut: 'envoyé' },
];
const RDVS = [
  { clientId: 'c4', date: '2026-10-12', status: 'honoré' },
  { clientId: 'c2', date: '2026-10-15', status: 'honoré' },
  { clientId: 'c5', date: '2026-10-16', status: 'annulé' },
  { clientId: 'c6', date: '2026-10-18', status: 'confirmé' },
];
const O = { clients: CLIENTS, envois: ENVOIS, rdvs: RDVS };
const ids = (a: Pick<AvisDuReleve, 'auteur' | 'publieLe' | 'quand'>) => fichesProposees(a, RELEVE, O).map((p) => `${p.clientId}:${p.raison}${p.nomAussi ? '+nom' : ''}`);
dit('« Mireille A. » : la demande d abord (c1, l initiale tient), puis la venue (c2) ; pas celle dont la demande a échoué ni le rituel annulé (c5) ; pas une demande trop vieille',
  ['c1:demande+nom', 'c2:venue'], ids({ auteur: 'Mireille A.', publieLe: '2026-10-20T08:00:00Z', quand: '' }));
dit('« Kevin » : la demande passée par la main compte (c3), puis Kévin venu (accent ignoré, c4)',
  ['c3:demande', 'c4:venue'], ids({ auteur: 'Kevin', publieLe: '2026-10-19T12:00:00Z', quand: '' }));
dit('sans prénom lisible, rien ; une demande APRÈS l avis ne compte pas ; un autre envoi ni un rendez-vous non honoré non plus',
  [[], []], [ids({ auteur: 'A. B.', publieLe: '2026-10-20T08:00:00Z', quand: '' }), ids({ auteur: 'Sènami', publieLe: '2026-10-20T08:00:00Z', quand: '' })]);
{
  const awas = [1, 2, 3, 4, 5].map((i) => ({ id: `a${i}`, name: `Awa ${['Dossou', 'Hounkpè', 'Zinsou', 'Adjovi', 'Gbaguidi'][i - 1]}` }));
  const env = awas.map((c, i) => ({ type: 'avis-google', clientId: c.id, quand: `2026-10-1${i}T10:00:00Z`, statut: 'envoyé' }));
  const p = fichesProposees({ auteur: 'Awa', publieLe: '2026-10-20T08:00:00Z', quand: '' }, RELEVE, { clients: awas, envois: env, rdvs: [] });
  dit('cinq Awa avec demande : trois au plus, la plus récente d abord', ['a5', 'a4', 'a3'], p.map((x) => x.clientId));
}
dit('le pourquoi d une proposition, mot pour mot', ['demande d’avis partie le 2026-10-19 · même prénom, même nom', 'venue le 2026-10-15, sans demande d’avis · même prénom'],
  fichesProposees({ auteur: 'Mireille A.', publieLe: '2026-10-20T08:00:00Z', quand: '' }, RELEVE, O).map((p) => pourquoiProposee(p, (j) => j)));

/* ── 5. L'ÉTAT D'UN AVIS, LE FILTRE ET LE RÉSUMÉ ─────────────────────── */
const AVIS: AvisDuReleve[] = [
  { auteur: 'Mireille A.', note: 5, texte: 'Accueil chaleureux.', quand: '', publieLe: '2026-10-20T08:00:00Z' },
  { auteur: 'Kevin', note: 3, texte: 'Good work, long wait.', quand: '', publieLe: '2026-10-21T08:00:00Z' },
  { auteur: 'Sènami D.', note: 5, texte: '', quand: '', publieLe: '2026-10-21T09:00:00Z' },
  { auteur: 'Arielle K.', note: 4, texte: 'Très bon travail.', quand: 'il y a 3 semaines' },
];
const [M, K, S, A] = AVIS;
const LIENS: LiensDesAvis = {
  [idDeLAvis(M)]: { clientId: 'c1', par: 'Y.', le: '2026-10-20T09:00:00Z' },
  [idDeLAvis(S)]: { sansFiche: true, le: '2026-10-21T10:00:00Z' },
};
const BROUILLONS: BrouillonsDAvis = { [idDeLAvis(A)]: { publieeLe: '2026-10-02T10:00:00Z' }, [idDeLAvis(M)]: { reponse: 'Merci Mireille.' } };
dit('reliée, sans fiche, à relier (depuis le 20), ancien (avant : rien de proposé)', ['reliee', 'a-relier', 'sans-fiche', 'ancien'],
  AVIS.map((a) => etatDuLien(a, LIENS[idDeLAvis(a)], RELEVE)));
dit('un seul à relier : Kevin', 1, compteARelier(AVIS, LIENS, RELEVE));
const comptes = compteParFiltre(AVIS, BROUILLONS, LIENS, RELEVE);
dit('les comptes des filtres : 4 avis, 3 sans réponse (un brouillon n est pas une réponse), 1 à relier, 1 répondu', { tous: 4, sans: 3, relier: 1, repondus: 1 }, comptes);
dit('LE RÉSUMÉ ET LA LISTE APPELLENT LE MÊME JUGE : chaque compte égale la longueur de sa liste', true,
  (['tous', 'sans', 'relier', 'repondus'] as FiltreDesAvis[]).every((f) => comptes[f] === AVIS.filter((a) => passeLeFiltre(a, f, BROUILLONS[idDeLAvis(a)], LIENS[idDeLAvis(a)], RELEVE)).length));
{
  const deux: LiensDesAvis = { ...LIENS, [idDeLAvis(K)]: { clientId: 'c1', le: '2026-10-21T10:00:00Z' } };
  dit('les avis de la cliente, le plus récent d abord ; personne pour une fiche vide', [['Kevin', 'Mireille A.'], []],
    [avisDeLaCliente('c1', AVIS, deux, RELEVE).map((a) => a.auteur), avisDeLaCliente('', AVIS, deux, RELEVE)]);
}

/* ── 6. « UNE AUTRE FICHE » ──────────────────────────────────────────── */
dit('chercher : le début des mots du nom, sans accent ; quatre chiffres du numéro ; rien pour une lettre absente ou trois chiffres',
  [['c1'], ['c1'], ['c3', 'c4'], [], []],
  [chercheDesFiches('mir ago', CLIENTS).map((c) => c.id), chercheDesFiches('0001', CLIENTS).map((c) => c.id), chercheDesFiches('ke', CLIENTS).map((c) => c.id),
    chercheDesFiches('x', CLIENTS).map((c) => c.id), chercheDesFiches('001', CLIENTS).map((c) => c.id)]);

/* ── 7. LES GESTES ───────────────────────────────────────────────────── */
{
  dit('sans serveur, le document des liens est « descendu » (rien ne viendra)', true, documentDescendu(CLE_DES_LIENS));
  liensDesAvisStore.set({});
  const id = idDeLAvis(K);
  const r1 = relieLAvis(id, 'c3', 'Y.');
  const apres1 = liensDesAvisStore.get()[id];
  dit('« C est elle » : relié à c3, par Y., daté', ['fait', 'c3', 'Y.', true], [r1, apres1?.clientId, apres1?.par, typeof apres1?.le === 'string']);
  marqueSansFiche(id, '');
  dit('« Aucune fiche » remplace le lien, sans « par » vide', [true, undefined, false], [liensDesAvisStore.get()[id]?.sansFiche, liensDesAvisStore.get()[id]?.clientId, 'par' in (liensDesAvisStore.get()[id] ?? {})]);
  delieLAvis(id);
  dit('« Ce n est pas elle » : le lien tombe, l avis redevient à relier', [false, 'a-relier'], [id in liensDesAvisStore.get(), etatDuLien(K, liensDesAvisStore.get()[id], RELEVE)]);
  const magasin = sansCommentaires(lis('src/shared/avis-fiches.ts'));
  dit('le document synchronisé, et AUCUN geste avant sa descente (il effacerait les liens des autres postes)', [true, true, true],
    [/createStore<LiensDesAvis>\('mnd_avis_fiches', \{\}\)/.test(magasin) && CLE_DES_LIENS === 'mnd_avis_fiches', /bindDocument\(liensDesAvisStore, 'mnd_avis_fiches'\)/.test(magasin),
      magasin.indexOf('if (!documentDescendu(CLE_DES_LIENS)) return \'attente\';') >= 0 && magasin.indexOf('if (!documentDescendu(CLE_DES_LIENS))') < magasin.indexOf('liensDesAvisStore.set(')]);
}

/* ── 8. L'ALERTE DE LA DIRECTION, DANS LA FONCTION ───────────────────── */
/* ── QUAND REDEMANDER UN AVIS (26 octobre 2026) : six mois ; chaque passage jusqu a 3 étoiles ── */
{
  const A = '2026-10-26';
  dit('six mois entre deux demandes, trois étoiles = reconquête', [182, 3], [JOURS_ENTRE_DEUX_DEMANDES, NOTE_A_RECONQUERIR]);
  dit('sa première venue réglée, rien demandé, rien laissé : on demande', { permise: true, pourquoi: 'premiere' }, demandeDAvisPermise({ premiereVenue: true, aujourdhui: A }));
  dit('2 étoiles hier : on redemande à chaque passage', { permise: true, pourquoi: 'reconquete' }, demandeDAvisPermise({ premiereVenue: false, dernierAvis: { jour: '2026-10-25', note: 2 }, aujourdhui: A }));
  dit('5 étoiles il y a 3 mois : trop tôt, redemande dès le 28 janv. 2027', { permise: false, pourquoi: 'trop-tot', des: '2027-01-28' }, demandeDAvisPermise({ premiereVenue: false, dernierAvis: { jour: '2026-07-30', note: 5 }, aujourdhui: A }));
  dit('5 étoiles il y a 7 mois : on redemande (six mois)', { permise: true, pourquoi: 'six-mois' }, demandeDAvisPermise({ premiereVenue: false, dernierAvis: { jour: '2026-03-20', note: 5 }, aujourdhui: A }));
  dit('demande partie il y a 2 mois, sans avis : trop tôt ; le plus récent des deux jours compte', { permise: false, pourquoi: 'trop-tot', des: '2027-02-24' },
    demandeDAvisPermise({ premiereVenue: false, derniereDemande: '2026-08-26', dernierAvis: { jour: '2026-03-20', note: 5 }, aujourdhui: A }));
  dit('une habituée d avant le Trône, rien demandé, rien relié : on demande', { permise: true, pourquoi: 'six-mois' }, demandeDAvisPermise({ premiereVenue: false, aujourdhui: A }));
  dit('la dernière demande partie : la plus récente, envoyée ou à la main, jamais un échec', '2026-10-20', derniereDemandeDAvis('m2', [
    { type: 'avis-google', clientId: 'm2', quand: '2026-10-01T10:00:00.000Z', statut: 'envoyé' },
    { type: 'avis-google', clientId: 'm2', quand: '2026-10-20T10:00:00.000Z', statut: 'à-la-main' },
    { type: 'avis-google', clientId: 'm2', quand: '2026-10-24T10:00:00.000Z', statut: 'échec' },
    { type: 'confirmation', clientId: 'm2', quand: '2026-10-25T10:00:00.000Z', statut: 'envoyé' },
  ]));
  dit('2 étoiles en septembre, puis 5 étoiles le 1er décembre : elle repasse au régime des six mois (dès le 1er juin 2027)', { permise: false, pourquoi: 'trop-tot', des: '2027-06-01' },
    demandeDAvisPermise({ premiereVenue: false, dernierAvis: { jour: '2026-12-01', note: 5 }, aujourdhui: '2026-12-13' }));
  const deuxAvis: LiensDesAvis = { 'a-sept': { clientId: 'c7', le: '2026-09-15T10:00:00.000Z' }, 'a-dec': { clientId: 'c7', le: '2026-12-02T10:00:00.000Z' } };
  const sesDeux = [
    { auteur: 'M. D.', note: 2, texte: 'Quarante minutes d attente', quand: '2026-09-14T10:00:00.000Z', publieLe: '2026-09-14T09:00:00.000Z', cle: 'a-sept' },
    { auteur: 'M. D.', note: 5, texte: 'Cette fois zero attente', quand: '2026-12-01T10:00:00.000Z', publieLe: '2026-12-01T09:00:00.000Z', cle: 'a-dec' },
  ] as AvisDuReleve[];
  dit('... son DERNIER avis fait foi, pas le pire', { jour: '2026-12-01', note: 5 }, dernierAvisDe('c7', sesDeux, deuxAvis, '2026-12-13T06:00:00.000Z'));
  const liens: LiensDesAvis = { 'a-1': { clientId: 'c1', le: '2026-10-21T10:00:00.000Z' } };
  const releve = [{ auteur: 'Awa D.', note: 3, texte: 'Bien mais long', quand: '2026-10-20T10:00:00.000Z', publieLe: '2026-10-20T09:00:00.000Z', cle: 'a-1' }] as AvisDuReleve[];
  dit('son dernier avis relié : le jour et la note', { jour: '2026-10-20', note: 3 }, dernierAvisDe('c1', releve, liens, '2026-10-26T06:00:00.000Z'));
  dit('la fiche le dit en une ligne', ['Trois étoiles ou moins : la Maison lui redemande son avis à chaque passage.', 'Prochaine demande d’avis au plus tôt le 2027-01-28 : une fois tous les six mois.'],
    [ditLaDemandeDAvis({ permise: true, pourquoi: 'reconquete' }, (j) => j), ditLaDemandeDAvis({ permise: false, pourquoi: 'trop-tot', des: '2027-01-28' }, (j) => j)]);
  const vieux = { auteur: 'Mireille Agossou', note: 5, texte: 'Merci', quand: '2026-10-25T10:00:00.000Z', publieLe: '2026-10-25T09:00:00.000Z' } as AvisDuReleve;
  const fiches = [{ id: 'm1', name: 'Mireille AGOSSOU' }, { id: 'm2', name: 'Mireille Dossou' }];
  const unSeulNom = fichesProposees(vieux, '2026-10-26T06:00:00.000Z', { clients: fiches, envois: [], rdvs: [] });
  dit('reconnaître un avis ancien : rien dans les 30 jours, mais une seule fiche porte le nom entier : proposée, raison « nom »', [['m1', 'nom', true]], unSeulNom.map((p) => [p.clientId, p.raison, p.nomAussi]));
  dit('... et son pourquoi le dit', true, pourquoiProposee(unSeulNom[0], (j) => j).startsWith('même prénom, même nom · seule fiche'));
  const deuxNoms = fichesProposees(vieux, '2026-10-26T06:00:00.000Z', { clients: [...fiches, { id: 'm3', name: 'Mireille Agossou Kpadonou' }], envois: [], rdvs: [] });
  dit('... deux fiches qui tiennent : rien n est proposé, on ne devine pas', [], deuxNoms);
  const avecDemande = fichesProposees(vieux, '2026-10-26T06:00:00.000Z', { clients: fiches, envois: [{ type: 'avis-google', clientId: 'm2', quand: '2026-10-20T10:00:00.000Z', statut: 'envoyé' }], rdvs: [] });
  dit('... une demande partie dans les 30 jours passe d abord, le nom entier n ajoute rien', [['m2', 'demande']], avecDemande.map((p) => [p.clientId, p.raison]));
  const envoi = sansCommentaires(lis('supabase/functions/avis-google/index.ts'));
  const pur = sansCommentaires(lis('src/shared/avis-fiches-pur.ts'));
  const corps = (src: string) => { const m = src.match(/function demandeDAvisPermise\([\s\S]*?\n\}/); return m ? m[0].replace(/\s+/g, ' ') : ''; };
  dit('la fonction avis-google (2026-10-26-b) porte la MÊME règle, mot pour mot, lit les liens, le relevé et les demandes parties ; un GET rend la version', [true, true, true, true, true, true], [
    corps(envoi) !== '' && corps(envoi) === corps(pur),
    envoi.includes("'mnd_avis_fiches', 'mnd_avis_google'"), envoi.includes(".eq('data->>type', 'avis-google').in('data->>clientId', ids)"),
    envoi.includes("consigne(p, 'sans-envoi', `trop tôt : une demande d’avis au plus tôt le ${regle.des ?? ''}`)"),
    envoi.includes("const VERSION = '2026-10-26-b';"), /req\.method === 'GET'/.test(envoi),
  ]);
  dit('... et la même clé d avis que le Trône (FNV-1a)', [true, true], [envoi.includes('let h = 0x811c9dc5;'), envoi.includes('h = Math.imul(h, 0x01000193) >>> 0;')]);
  const conv = sansCommentaires(lis('src/apps/trone/routes/clients/Conversations.tsx'));
  dit('le modèle à la main « Demande d avis » suit la règle, et dit pourquoi quand il se cache', [true, true],
    [conv.includes("MODELES.filter((m) => m.nom !== 'avis_google' || demandeDAvis.permise)"), conv.includes('ditLaDemandeDAvis(demandeDAvis, jourAn)')]);
  dit('sa fiche le dit', true, lis('src/apps/trone/routes/clients/SonAvisGoogle.tsx').includes('ditLaDemandeDAvis(regle, jourCourtAn)'));
}

const FONCTION = 'supabase/functions/avis-google-releve/index.ts';
type AvisAlerte = { auteur: string; note: number; texte: string; ref?: string; publieLe?: string };
const alerte = (() => {
  const js = transformSync(extrais(FONCTION, 'alerteDesAvis'), { loader: 'ts' }).code;
  return new Function(`${js}; return { avisQuiAlertent, alerteDeLaDirection, alertesGardees };`)() as {
    avisQuiAlertent: (avant: AvisAlerte[] | null, apres: AvisAlerte[], deja: string[]) => AvisAlerte[];
    alerteDeLaDirection: (n: AvisAlerte[]) => { title: string; body: string; url: string } | null;
    alertesGardees: (deja: string[], n: AvisAlerte[]) => string[];
  };
})();
{
  const vieux: AvisAlerte = { auteur: 'Arielle K.', note: 2, texte: 'Trop d attente.', publieLe: '2026-10-01T10:00:00Z' };
  const bas: AvisAlerte = { auteur: 'Kevin Houngbo', note: 2, texte: 'SECRET-DU-TEXTE une longue attente.', ref: 'places/x/reviews/k', publieLe: '2026-10-21T08:00:00Z' };
  const haut: AvisAlerte = { auteur: 'Mireille A.', note: 5, texte: 'Merci !', ref: 'places/x/reviews/m', publieLe: '2026-10-21T09:00:00Z' };
  const trois: AvisAlerte = { auteur: 'Awa', note: 3, texte: 'Bien, sans plus.', ref: 'places/x/reviews/a', publieLe: '2026-10-21T10:00:00Z' };
  const auteurs = (l: AvisAlerte[]) => l.map((a) => a.auteur);
  dit('le tout premier relevé (pas d « avant ») ne prévient de rien', [], auteurs(alerte.avisQuiAlertent(null, [bas, trois], [])));
  const quatre: AvisAlerte = { auteur: 'Nadège', note: 4, texte: 'Très bien.', ref: 'places/x/reviews/n', publieLe: '2026-10-21T11:00:00Z' };
  dit('nouveaux : 2 et 3 étoiles préviennent, 4 et 5 non, un avis d avant le 20 octobre non', ['Kevin Houngbo', 'Awa'],
    auteurs(alerte.avisQuiAlertent([haut], [vieux, bas, haut, trois, quatre], [])));
  dit('déjà dans le relevé d avant (par sa référence, ou par auteur et texte sans référence), ou déjà signalé : rien', [[], [], []],
    [auteurs(alerte.avisQuiAlertent([bas], [bas], [])), auteurs(alerte.avisQuiAlertent([{ ...bas, ref: undefined }], [bas], [])), auteurs(alerte.avisQuiAlertent([], [bas], ['places/x/reviews/k']))]);
  const un = alerte.alerteDeLaDirection([bas]);
  dit('l alerte d un avis : le prénom et les étoiles, vers l onglet', ['Un avis Google de 2 étoiles', 'Kevin vient de laisser 2 étoiles sur Google. Ouvrez le Trône pour le lire et répondre.', '/trone/#/vitrine?onglet=avis'],
    [un?.title, un?.body, un?.url]);
  dit('JAMAIS LE TEXTE DE L AVIS dans l alerte (un écran verrouillé se lit par-dessus l épaule), ni le nom de famille', [false, false],
    [JSON.stringify(un).includes('SECRET-DU-TEXTE'), JSON.stringify(un).includes('Houngbo')]);
  dit('plusieurs : une seule alerte qui les compte ; aucun : pas d alerte', ['2 avis Google de 1 à 3 étoiles', null],
    [alerte.alerteDeLaDirection([bas, trois])?.title, alerte.alerteDeLaDirection([])]);
  dit('les avis signalés se gardent, les 50 derniers', [50, 'places/x/reviews/k'],
    [alerte.alertesGardees(Array.from({ length: 60 }, (_, i) => `r${i}`), [bas]).length, alerte.alertesGardees(Array.from({ length: 60 }, (_, i) => `r${i}`), [bas]).at(-1)]);
}
{
  const f = sansCommentaires(lis(FONCTION));
  dit('la fonction : version 2026-10-20-b, le jour, la référence et le lien gardés, `texte` intouché', [true, true, true, true, true],
    [/const VERSION = '2026-10-20-b';/.test(f), /publieLe: String\(r\.publishTime\)\.trim\(\)/.test(f), /ref: String\(r\.name\)\.trim\(\)/.test(f),
      /lien: String\(r\.googleMapsUri\)/.test(f), /texte: String\(r\.text\?\.text \?\? r\.originalText\?\.text \?\? ''\)\.trim\(\),/.test(f)]);
  dit('l alerte part par push-notify, mode direction, APRÈS l écriture du relevé, et ne le fait jamais échouer', [true, true, true],
    [/mode: 'direction'/.test(f), f.indexOf("upsert({ key: 'mnd_avis_google', data: doc })") >= 0 && f.indexOf("upsert({ key: 'mnd_avis_google', data: doc })") < f.indexOf('/functions/v1/push-notify'),
      /catch \{ *\}/.test(f) || /catch \{\s*\}/.test(f)]);
  dit('la fonction ne connaît toujours ni Claude ni les fiches', false, /anthropic|ia-maison|claude|mnd_avis_fiches|clientId/i.test(f));
}

/* ── 9. LES ÉCRANS ───────────────────────────────────────────────────── */
{
  const vitrine = sansCommentaires(lis('src/apps/trone/routes/clients/Vitrine.tsx'));
  /* 26 octobre 2026 : les avis ont leur rubrique ; l'onglet des Vitrines y
     mène, et un lien d'avant (?onglet=avis&avis=…) y arrive sur le même avis. */
  dit('Vitrines : l onglet « Les avis Google » mène à la rubrique, les liens d avant aussi', [true, true, true, true],
    [/value: 'comptoir', label: 'La carte du comptoir' \},\s*\{ value: 'avis', label: 'Les avis Google' \}/.test(vitrine),
      /onglet === 'avis' && <Navigate replace to=\{`\/avis-google\$\{params\.get\('avis'\)/.test(vitrine),
      /params\.get\('onglet'\)/.test(vitrine), /versLesAvis=\{\(\) => navigate\('\/avis-google'\)\}/.test(vitrine)]);
  dit('la rubrique est dans la barre, sous Les vitrines', true,
    /path: '\/vitrine', label: 'Les vitrines'[^\n]*\n(?:\s*\/\*[\s\S]*?\*\/\n)?\s*\{ path: '\/avis-google', label: 'Les avis Google'/.test(lis('src/apps/trone/routes/index.tsx')));
  const site = sansCommentaires(lis('src/apps/trone/routes/clients/VitrineSite.tsx'));
  dit('« Le site public » montre les avis du site sans les choisir (25 oct. : le choix est dans l onglet), sans les réponses, avec le chemin vers l onglet', [true, false, false, true],
    [/<AvisDuSite /.test(site), /<ReponseAUnAvis/.test(site), /<EnTeteDesReponses/.test(site), /onClick=\{versLesAvis\}/.test(site)]);
  const onglet = sansCommentaires(lis('src/apps/trone/routes/clients/AvisGoogle.tsx'));
  const ficheDeLAvis = sansCommentaires(lis('src/apps/trone/routes/clients/FicheDeLAvis.tsx'));
  dit('la rubrique : la réponse sous l avis ouvert, les brouillons préparés à l ouverture, la fiche de l avis', [true, true, true],
    [/<ReponseAUnAvis avis=/.test(onglet), /usePrepareLesBrouillons\(recents/.test(onglet), /<FicheDeLAvis a=\{a\} releveLe=\{releveLe\} peutRelier=\{peutRelier\} \/>/.test(onglet)]);
  dit('RIEN NE PART SUR GOOGLE D ICI : ni fetch, ni fonction, ni Supabase ; le lien n est relié qu au toucher', [false, false, true],
    [/fetch\(|functions\.invoke|supabase|XMLHttpRequest|sendBeacon/.test(onglet), /fetch\(|functions\.invoke|supabase|XMLHttpRequest|sendBeacon/.test(ficheDeLAvis),
      /onClick=\{\(\) => ditLeGeste\(relieLAvis\(id, p\.clientId, qui\)\)\}/.test(ficheDeLAvis)]);
  /* 25 octobre 2026 : le pont de Make. La rubrique dit si « Publier sur
     Google » est ouvert ; sinon, le copier-coller. Sans Make, les cinq de Google. */
  dit('la rubrique dit l état de l envoi à Google (par Make, ou copier-coller), et la limite des cinq avis sans Make', [true, true, true],
    [/'par Make, après votre « Oui, publier »'/.test(onglet), /'copier-coller, le pont n’est pas posé'/.test(onglet), /cinq avis que Google juge « les plus pertinents »/.test(onglet)]);
  const fiche = sansCommentaires(lis('src/apps/trone/routes/clients/Customers.tsx'));
  const panneau = sansCommentaires(lis('src/apps/trone/routes/clients/SonAvisGoogle.tsx'));
  dit('la fiche cliente montre son avis Google, et ne relie ni ne délie rien', [true, false],
    [/<SonAvisGoogle client=\{client\} \/>/.test(fiche), /relieLAvis|delieLAvis|marqueSansFiche/.test(panneau)]);
  dit('CLAUDE NE LIT JAMAIS LA FICHE : la réponse aux avis ignore les liens', false,
    /avis-fiches/.test(lis('src/shared/ia-avis.ts') + lis('src/shared/ia-avis-pur.ts')));
  dit('pas de tiret cadratin ni de « salon » dans le texte affiché', [false, false],
    [/—/.test(onglet + panneau + ficheDeLAvis), /\bsalon/i.test(onglet + panneau + ficheDeLAvis)]);
}

console.log(ko === 0 ? '\nTOUT VA BIEN : les avis se relient aux fiches comme promis.' : `\n${ko} ÉCHEC(S)`);
if (ko) process.exitCode = 1;
