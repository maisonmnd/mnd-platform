/* LE DEVIS SE REMET AU RENDEZ-VOUS, EPROUVE — 17 novembre 2026.
   `node scripts/verifie-le-devis-remis.mjs` (et `--prouve`).

   Les mots de Yeman : « Il ne faut pas permettre d'avoir des bilans sans
   prendre de RDV sinon tout le monde nous trichera. » Tranche le meme jour :
   le bilan (lecture, prix, devis) se remet AU rendez-vous, par la Maison :
   visio tenue ou consultation privee faite. Reserver puis annuler ne donne
   rien. Un devis vaut 15 jours. Un devis par consultation, les 15 000 F
   deduits une seule fois. L'acompte compte les remises en francs.

   TOUS LES ATTENDUS SONT ECRITS EN DUR, tires de ces phrases, jamais du code
   eprouve. Le cablage se lit dans les sources, commentaires effaces.
   Les montants et les noms sont des exemples. Sortie ASCII. */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  avecLaDeduction, avecLaValidite, dernierJourValable, estPerime, estRemis, etatDeLaRemise, horsRegle, jourDeLInstant,
  LE_JOUR_DE_LA_REMISE, LIBELLE_DE_LA_CONSULTATION_DEDUITE, lisibleParElle, marqueDeLaRemise, pastilleDeLaRemise,
  peutEtreRemis, pieceDeLaConsultation, porteDeLaRemise, renouvele, rouvreLaPieceDeLaConsultation, seConfirmeTelQuel,
  validiteDite, VALIDITE_DU_DEVIS_JOURS, acompteAEnvoyer, motDuLienDeLAcompte,
  type ContexteDeLaRemise, type DevisLuPourLaRemise,
} from '../src/shared/devis-remis-pur';
import {
  acompteDuDevis, attendElle, gesteDeLaCliente, MOT_DU_DEVIS_PERIME, motPourElle, visiblePourElle, apresLeGeste, type DevisLu,
} from '../src/shared/devis-de-la-cliente-pur';
import { LIBELLE_DE_LA_DEDUCTION } from '../src/shared/mesure-de-la-consultation-pur';
import { deductionDeLaConsultation } from '../src/shared/devis-de-la-consultation-pur';
import { lesGestes, gesteDit, type ContexteDesGestes, type PieceDuGeste } from '../src/shared/gestes-conversation';
import { EN } from '../src/apps/couronne/i18n/en';
import type { OnlineConsultation } from '../src/shared/bridges';

declare const __FAUTE__: { fichier: string; avant: string; apres: string } | null;

let n = 0;
const ascii = (s: string) => s.replace(/[^\x20-\x7e]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);
const dit = (num: number, nom: string, attendu: unknown, obtenu: unknown) => {
  n++;
  const ok = JSON.stringify(attendu) === JSON.stringify(obtenu);
  if (!ok) process.exitCode = 1;
  console.log(ascii(`${ok ? 'OK   ' : 'ECHEC'} #${num} ${nom}${ok ? '' : ` -> ${JSON.stringify(obtenu)?.slice(0, 300)}`}`));
  if (!ok) console.log(ascii(`       attendu ${JSON.stringify(attendu)?.slice(0, 300)}`));
};

const racine = process.cwd();
const sansCommentaires = (s: string) => s.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
const source = (rel: string): string => {
  let s = readFileSync(path.join(racine, rel), 'utf8').replace(/\r\n/g, '\n');
  if (__FAUTE__ && __FAUTE__.fichier === rel) s = s.split(__FAUTE__.avant).join(__FAUTE__.apres);
  return sansCommentaires(s);
};
const sql = (rel: string): string => {
  let s = readFileSync(path.join(racine, rel), 'utf8').replace(/\r\n/g, '\n');
  if (__FAUTE__ && __FAUTE__.fichier === rel) s = s.split(__FAUTE__.avant).join(__FAUTE__.apres);
  return s.replace(/--[^\n]*/g, '');
};

/* ── Les exemples ─────────────────────────────────────────────────────── */
const D = (o: Partial<DevisLuPourLaRemise> = {}): DevisLuPourLaRemise => ({ kind: 'devis', status: 'estimé', date: '2026-11-20', clientId: 'c1', ...o });
const CTX = (o: Partial<ContexteDeLaRemise> = {}): ContexteDeLaRemise => ({ consultations: [], visios: [], rdvs: [], telephoneDe: () => undefined, ...o });
const CG = { id: 'cg-1', createdAt: '2026-11-18T09:00:00.000Z', paidXof: 0 };
const CP = { id: 'cg-2', createdAt: '2026-11-18T09:00:00.000Z', paidXof: 15000 };
const dc = D({ consultationId: 'cg-1' });
const dp = D({ consultationId: 'cg-2' });
const ok = (r: ReturnType<typeof peutEtreRemis>) => (r.ok ? r.par : `NON : ${r.raison}`);

/* ══ #1 — LE DEVIS D'UNE CONSULTATION : VISIO TENUE, OU PRIVEE FAITE ══ */
dit(1, 'la visio tenue ouvre le devis', 'visio',
  ok(peutEtreRemis(dc, CTX({ consultations: [CG], visios: [{ consultationId: 'cg-1', statut: 'tenue' }] }))));
dit(1, 'la visio seulement reservee ne l ouvre pas, et la raison dit son heure de Cotonou',
  'NON : La visio n’est pas encore tenue (le 21 nov. à 10:00).',
  ok(peutEtreRemis(dc, CTX({ consultations: [CG], visios: [{ consultationId: 'cg-1', statut: 'réservée', debut: '2026-11-21T09:00:00.000Z' }] }))));
dit(1, 'reserver puis annuler ne donne rien', 'NON : Aucun rendez-vous tenu : ni visio, ni consultation privée.',
  ok(peutEtreRemis(dc, CTX({ consultations: [CG], visios: [{ consultationId: 'cg-1', statut: 'annulée' }] }))));
dit(1, 'une visio manquee ne donne rien', 'NON : Elle a manqué sa visio : le devis attend un rendez-vous tenu.',
  ok(peutEtreRemis(dc, CTX({ consultations: [CG], visios: [{ consultationId: 'cg-1', statut: 'manquée' }] }))));
dit(1, 'la visio d une AUTRE consultation ne compte pas', 'NON : Aucun rendez-vous tenu : ni visio, ni consultation privée.',
  ok(peutEtreRemis(dc, CTX({ consultations: [CG], visios: [{ consultationId: 'cg-9', statut: 'tenue' }] }))));
dit(1, 'la visio se retrouve aussi par l identifiant que porte la consultation', 'visio',
  ok(peutEtreRemis(dc, CTX({ consultations: [{ ...CG, visio: { id: 'vz-abc123', debut: '2026-11-19T09:00:00.000Z' } }], visios: [{ id: 'vz-abc123', consultationId: null, statut: 'tenue' }] }))));
dit(1, 'la consultation privee reglee, pas encore faite : il attend', 'NON : La consultation privée n’est pas encore faite.',
  ok(peutEtreRemis(dp, CTX({ consultations: [CP] }))));
dit(1, 'la privee faite : son rendez-vous du Carnet (rdvId) est honore', 'privee',
  ok(peutEtreRemis(dp, CTX({ consultations: [{ ...CP, rdvId: 'apt-9' }], rdvs: [{ id: 'apt-9', clientId: 'x', status: 'honoré', date: '2026-11-20' }] }))));
dit(1, 'son rendez-vous du Carnet seulement confirme, ou annule : il attend', ['NON : La consultation privée n’est pas encore faite.', 'NON : Son rendez-vous n’a pas encore eu lieu.', 'NON : Aucun rendez-vous tenu : ni visio, ni consultation privée.'], [
  ok(peutEtreRemis(dp, CTX({ consultations: [{ ...CP, rdvId: 'apt-9' }], rdvs: [{ id: 'apt-9', clientId: 'x', status: 'confirmé', date: '2026-11-20' }] }))),
  ok(peutEtreRemis(dc, CTX({ consultations: [{ ...CG, rdvId: 'apt-9' }], rdvs: [{ id: 'apt-9', clientId: 'x', status: 'en attente', date: '2026-11-20' }] }))),
  ok(peutEtreRemis(dc, CTX({ consultations: [{ ...CG, rdvId: 'apt-9' }], rdvs: [{ id: 'apt-9', clientId: 'x', status: 'annulé', date: '2026-11-20' }] }))),
]);
dit(1, 'le rendez-vous du Carnet d une visio (rdvId, sans paiement) honore', 'rendez-vous',
  ok(peutEtreRemis(dc, CTX({ consultations: [{ ...CG, rdvId: 'apt-9' }], rdvs: [{ id: 'apt-9', clientId: 'x', status: 'honoré', date: '2026-11-20' }] }))));
dit(1, 'la privee d avant le Carnet : les locks temoins photographies devant elle', ['privee', 'NON : Aucun rendez-vous tenu : ni visio, ni consultation privée.'], [
  ok(peutEtreRemis(dp, CTX({ consultations: [{ ...CP, temoins: ['cg-2/a.jpg'] }] }))),
  ok(peutEtreRemis(dc, CTX({ consultations: [{ ...CG, temoins: ['cg-1/a.jpg'] }] }))),
]);
dit(1, 'un AUTRE rendez-vous honore de la cliente ne fait ni la visio ni la privee de sa consultation', ['NON : Aucun rendez-vous tenu : ni visio, ni consultation privée.', 'NON : La consultation privée n’est pas encore faite.'], [
  ok(peutEtreRemis(dc, CTX({ consultations: [CG], rdvs: [{ id: 'a', clientId: 'c1', status: 'honoré', date: '2026-11-25' }] }))),
  ok(peutEtreRemis(dp, CTX({ consultations: [CP], rdvs: [{ id: 'a', clientId: 'c1', status: 'honoré', date: '2026-11-25' }] }))),
]);
/* Ce que 1B ecrit sur la consultation (visio-salle, file B) : la regle le lit sans la table des visios. */
const VZ = { id: 'vz-abc123', debut: '2026-11-21T09:00:00.000Z' };
dit(1, 'la visio TENUE ecrite sur la consultation (statut, ou tenueLe) ouvre le devis, sans la table des visios', ['visio', 'visio', 'visio'], [
  ok(peutEtreRemis(dc, CTX({ consultations: [{ ...CG, visio: { ...VZ, tenueLe: '2026-11-21T09:14:00.000Z' } }] }))),
  ok(peutEtreRemis(dc, CTX({ consultations: [{ ...CG, visio: { ...VZ, statut: 'tenue', tenueLe: '2026-11-21T09:14:00.000Z' } }] }))),
  ok(peutEtreRemis(dc, CTX({ consultations: [{ ...CG, visio: { ...VZ, statut: 'tenue' } }] }))),
]);
dit(1, 'reservee, manquee, annulee sur la consultation : il attend, et la raison le dit', [
  'NON : La visio n’est pas encore tenue (le 21 nov. à 10:00).', 'NON : Elle a manqué sa visio : le devis attend un rendez-vous tenu.', 'NON : Aucun rendez-vous tenu : ni visio, ni consultation privée.'], [
  ok(peutEtreRemis(dc, CTX({ consultations: [{ ...CG, visio: { ...VZ, statut: 'réservée' } }] }))),
  ok(peutEtreRemis(dc, CTX({ consultations: [{ ...CG, visio: { ...VZ, statut: 'manquée' } }] }))),
  ok(peutEtreRemis(dc, CTX({ consultations: [{ ...CG, visio: { ...VZ, statut: 'annulée' } }] }))),
]);
dit(1, 'la privee reglee au moment refuse, sans rdvId : pas faite, et la raison le dit', 'NON : La consultation privée n’a pas encore son moment au Carnet : elle n’est pas faite.',
  ok(peutEtreRemis(dp, CTX({ consultations: [{ ...CP, momentRefuse: { jour: '2026-11-25', heure: '10:00', raison: 'pris', le: '2026-11-18T08:00:00.000Z' } }] }))));
dit(1, 'la privee au Carnet (rdv-privee-<id>) : faite quand ce rendez-vous est honore, pas avant', ['privee', 'NON : La consultation privée n’est pas encore faite.'], [
  ok(peutEtreRemis(dp, CTX({ consultations: [{ ...CP, rdvId: 'rdv-privee-cg-2' }], rdvs: [{ id: 'rdv-privee-cg-2', clientId: 'c1', status: 'honoré', date: '2026-11-25' }] }))),
  ok(peutEtreRemis(dp, CTX({ consultations: [{ ...CP, rdvId: 'rdv-privee-cg-2' }], rdvs: [{ id: 'rdv-privee-cg-2', clientId: 'c1', status: 'confirmé', date: '2026-11-25' }] }))),
]);
dit(1, 'une consultation introuvable ne prouve rien', 'NON : Sa consultation est introuvable : rien ne dit que le rendez-vous a eu lieu.',
  ok(peutEtreRemis(dc, CTX({ visios: [{ consultationId: 'cg-1', statut: 'tenue' }] }))));

/* ══ #2 — UN DEVIS FAIT AU TRONE, SANS CONSULTATION ══ */
const d0 = D();
dit(2, 'elle a deja eu un rendez-vous honore a la Maison : il peut etre remis', 'rendez-vous',
  ok(peutEtreRemis(d0, CTX({ rdvs: [{ id: 'a', clientId: 'c1', status: 'honoré', date: '2025-03-02' }] }))));
dit(2, 'la tete soignee (forClientId) compte comme la payeuse', 'rendez-vous',
  ok(peutEtreRemis(D({ clientId: 'maman', forClientId: 'enfant' }), CTX({ rdvs: [{ id: 'a', clientId: 'enfant', status: 'honoré', date: '2026-01-10' }] }))));
dit(2, 'un rendez-vous pris, confirme, annule : il attend', 'NON : Elle n’a pas encore eu de rendez-vous honoré à la Maison.',
  ok(peutEtreRemis(d0, CTX({ rdvs: [{ id: 'a', clientId: 'c1', status: 'confirmé', date: '2026-11-25' }, { id: 'b', clientId: 'c1', status: 'annulé', date: '2026-10-01' }, { id: 'c', clientId: 'c1', status: 'en attente', date: '2026-11-26' }] }))));
dit(2, 'le rendez-vous honore d une AUTRE ne compte pas', 'NON : Elle n’a pas encore eu de rendez-vous honoré à la Maison.',
  ok(peutEtreRemis(d0, CTX({ rdvs: [{ id: 'a', clientId: 'c2', status: 'honoré', date: '2026-01-10' }] }))));
dit(2, 'sans fiche : il attend', 'NON : Sans fiche cliente, rien ne dit qu’elle est venue à la Maison.',
  ok(peutEtreRemis(D({ clientId: '' }), CTX({ rdvs: [{ id: 'a', clientId: '', status: 'honoré', date: '2026-01-10' }] }))));
dit(2, 'une visio tenue sur SON numero (les huit derniers chiffres) compte', ['visio', 'NON : Elle n’a pas encore eu de rendez-vous honoré à la Maison.', 'NON : Elle n’a pas encore eu de rendez-vous honoré à la Maison.'], [
  ok(peutEtreRemis(d0, CTX({ telephoneDe: () => '+229 01 97 00 00 01', visios: [{ telephone: '22997000001', statut: 'tenue' }] }))),
  ok(peutEtreRemis(d0, CTX({ telephoneDe: () => '+229 01 97 00 00 01', visios: [{ telephone: '22997000002', statut: 'tenue' }] }))),
  ok(peutEtreRemis(d0, CTX({ telephoneDe: () => '+229 01 97 00 00 01', visios: [{ telephone: '22997000001', statut: 'réservée' }] }))),
]);

/* ══ #3 — CE QUI SORT DE LA REGLE, ET CE QUI EST DEJA REMIS ══ */
dit(3, 'une facture et une commande de la Boutique sortent de la regle', ['hors-regle', 'hors-regle', true, true, false], [
  ok(peutEtreRemis(D({ kind: 'facture' }), CTX())), ok(peutEtreRemis(D({ boutique: { etat: 'a-preparer' } }), CTX())),
  horsRegle({ kind: 'facture' }), horsRegle({ kind: 'devis', boutique: { origine: 'site' } }), horsRegle({ kind: 'devis' }),
]);
dit(3, 'la marque de la Maison (remisLe) : deja remis, quoi que dise le Carnet', 'deja-remis',
  ok(peutEtreRemis(D({ remisLe: '2026-11-20T10:00:00.000Z', consultationId: 'cg-1' }), CTX())));
dit(3, 'le jour de la regle est le 17 novembre 2026 ; un devis vaut 15 jours', ['2026-11-17', 15], [LE_JOUR_DE_LA_REMISE, VALIDITE_DU_DEVIS_JOURS]);
dit(3, 'd avant la regle : envoye, accepte, confirme, paye restent remis ; estime, a valider, brouillon attendent',
  [true, true, true, true, false, false, false],
  (['envoyée', 'acceptée', 'confirmé', 'payée', 'estimé', 'à valider', 'brouillon'] as const).map((status) => estRemis({ status, date: '2026-11-16' })));
dit(3, 'a partir du 17 novembre, sans marque, rien n est remis ; une date absente ne prouve rien', [false, false, false], [
  estRemis({ status: 'envoyée', date: '2026-11-17' }), estRemis({ status: 'confirmé', date: '2026-12-01' }), estRemis({ status: 'envoyée', date: '' }),
]);
dit(3, 'elle ne lit jamais un brouillon, meme remis ; une commande de la Boutique se lit toujours', [false, true, true, false], [
  lisibleParElle(D({ status: 'brouillon', remisLe: '2026-11-20T10:00:00.000Z' })), lisibleParElle(D({ status: 'estimé', remisLe: '2026-11-20T10:00:00.000Z' })),
  lisibleParElle(D({ status: 'brouillon', boutique: { etat: 'a-preparer' } })), lisibleParElle(D({ status: 'estimé' })),
]);

/* ══ #4 — CE QUE LE TRONE AFFICHE, ET LA MARQUE ══ */
const attend = etatDeLaRemise(dc, CTX({ consultations: [CG] }));
const pret = etatDeLaRemise(dc, CTX({ consultations: [CG], visios: [{ consultationId: 'cg-1', statut: 'tenue' }] }));
const remis = etatDeLaRemise(D({ remisLe: '2026-11-20T10:00:00.000Z', remisPar: 'Awa', remisHorsRegle: 'vue en octobre' }), CTX());
dit(4, 'un devis qui attend se voit comme tel, avec sa raison', { etat: 'attend', raison: 'Aucun rendez-vous tenu : ni visio, ni consultation privée.' }, attend);
dit(4, 'le rendez-vous tenu : a remettre ; remis : qui, quand, et le motif hors regle', [{ etat: 'a-remettre' }, { etat: 'remis', le: '2026-11-20T10:00:00.000Z', par: 'Awa', horsRegle: 'vue en octobre' }, { etat: 'hors-regle' }],
  [pret, remis, etatDeLaRemise(D({ kind: 'facture' }), CTX())]);
dit(4, 'la pastille du registre : « a remettre au rendez-vous », « a remettre », rien une fois remis, rien sur un brouillon',
  ['à remettre au rendez-vous', 'à remettre', null, null],
  [pastilleDeLaRemise(dc, attend), pastilleDeLaRemise(dc, pret), pastilleDeLaRemise(dc, remis), pastilleDeLaRemise(D({ status: 'brouillon' }), attend)]);
dit(4, 'la marque : l instant, qui ; un brouillon part « envoye » ; un second geste garde le premier instant ; le motif de la direction reste',
  [{ remisLe: 'T1', remisPar: 'Awa' }, { remisLe: 'T1', status: 'envoyée' }, { remisLe: 'T0', remisPar: 'Awa' }, { remisLe: 'T1', remisPar: 'Y.', remisHorsRegle: 'vue en octobre' }],
  [marqueDeLaRemise({ status: 'estimé' }, 'T1', 'Awa'), marqueDeLaRemise({ status: 'brouillon' }, 'T1'), marqueDeLaRemise({ status: 'estimé', remisLe: 'T0' }, 'T1', 'Awa'), marqueDeLaRemise({ status: 'estimé' }, 'T1', 'Y.', 'vue en octobre')]);

/* ══ #5 — UN DEVIS VAUT QUINZE JOURS ══ */
const r17 = D({ status: 'envoyée', remisLe: '2026-11-17T09:00:00.000Z' });
dit(5, 'remis le 17 novembre : il vaut jusqu au 2 decembre inclus', ['2026-12-02', false, true], [dernierJourValable(r17), estPerime(r17, '2026-12-02'), estPerime(r17, '2026-12-03')]);
dit(5, 'le jour de la remise est celui de Cotonou : 23 h 30 en temps universel, c est deja le lendemain', ['2026-11-18', '2026-12-03'],
  [jourDeLInstant('2026-11-17T23:30:00.000Z'), dernierJourValable(D({ remisLe: '2026-11-17T23:30:00.000Z' }))]);
dit(5, 'les quinze jours partent de la REMISE, pas de la date du devis', false, estPerime(D({ status: 'estimé', date: '2026-10-01', remisLe: '2026-11-17T09:00:00.000Z' }), '2026-11-30'));
dit(5, 'un devis d avant la marque compte depuis sa date', [true, false], [estPerime(D({ status: 'envoyée', date: '2026-10-20' }), '2026-11-17'), estPerime(D({ status: 'envoyée', date: '2026-11-10' }), '2026-11-17')]);
dit(5, 'accepte, confirme, paye ne periment pas ; un devis pas remis non plus ; ni une commande de la Boutique', [false, false, false, false, false], [
  estPerime({ ...r17, status: 'acceptée' }, '2027-01-01'), estPerime({ ...r17, status: 'confirmé' }, '2027-01-01'), estPerime({ ...r17, status: 'payée' }, '2027-01-01'),
  estPerime(D({ status: 'estimé', date: '2026-11-18' }), '2027-01-01'), estPerime({ ...r17, boutique: { etat: 'prete' } }, '2027-01-01'),
]);
dit(5, 'il se dit valable jusqu a son dernier jour, et le papier le porte sous le mot du maitre', ['Valable jusqu’au 2 décembre 2026', '', { note: 'Merci.\nValable jusqu’au 2 décembre 2026.' }, { note: 'Merci.' }], [
  validiteDite(r17), validiteDite({ ...r17, status: 'confirmé' }), avecLaValidite({ note: 'Merci.' }, r17), avecLaValidite({ note: 'Merci.' }, D({ kind: 'facture' })),
]);
dit(5, 'perime, il ne se confirme plus tel quel ; renouvele (date et remise du jour), il se confirme', [false, true, true], [
  seConfirmeTelQuel(r17, { ...r17, status: 'confirmé' }, '2026-12-10'),
  seConfirmeTelQuel(r17, { ...r17, status: 'confirmé', ...renouvele('2026-12-10', '2026-12-10T08:00:00.000Z') }, '2026-12-10'),
  seConfirmeTelQuel(r17, { ...r17, status: 'confirmé' }, '2026-12-02'),
]);

/* ══ #6 — CE QUE LA CLIENTE VOIT DANS MA COURONNE ══ */
const E = (o: Partial<DevisLu>): DevisLu => ({ kind: 'devis', status: 'estimé', date: '2026-11-20', ...o });
const REMIS = { remisLe: '2026-11-20T10:00:00.000Z' };
dit(6, 'elle ne voit pas un devis que la Maison n a pas remis, quel que soit son etat', [false, false, false, false, false],
  (['estimé', 'à valider', 'envoyée', 'acceptée', 'confirmé'] as const).map((status) => visiblePourElle(E({ status }))));
dit(6, 'remis, elle le voit ; jamais un brouillon ni une piece payee', [true, true, true, true, true, false, false],
  (['estimé', 'à valider', 'envoyée', 'acceptée', 'confirmé', 'brouillon', 'payée'] as const).map((status) => visiblePourElle(E({ status, ...REMIS }))));
dit(6, 'aucun geste sur un devis pas remis ; ses gestes sur un devis remis', [null, null, 'faire-confirmer', 'valider', 'accepter'], [
  gesteDeLaCliente(E({ status: 'estimé' })), gesteDeLaCliente(E({ status: 'envoyée' })),
  gesteDeLaCliente(E({ status: 'estimé', ...REMIS })), gesteDeLaCliente(E({ status: 'à valider', aValiderPar: 'cliente', ...REMIS })), gesteDeLaCliente(E({ status: 'envoyée', ...REMIS })),
]);
dit(6, 'perime : plus de geste, plus rien a ecrire, plus de pastille, et la phrase le dit', [null, null, false, MOT_DU_DEVIS_PERIME, true], [
  gesteDeLaCliente(E({ status: 'envoyée', ...REMIS }), '2026-12-06'), apresLeGeste(E({ status: 'envoyée', ...REMIS }), 'accepter', '2026-12-06'),
  attendElle(E({ status: 'envoyée', ...REMIS }), '2026-12-06'), motPourElle(E({ status: 'envoyée', ...REMIS }), '2026-12-06'),
  attendElle(E({ status: 'envoyée', ...REMIS }), '2026-12-05'),
]);
dit(6, 'chaque phrase neuve de Ma Couronne a son anglais', [], [
  MOT_DU_DEVIS_PERIME, '{rituel}, en attente de votre acompte.', '{rituel}, en attente de la maison.', '{rituel}, acompte reçu, en attente de la maison.', 'Valable jusqu’au {date}',
].filter((p) => !EN[p]));

/* ══ #7 — UN DEVIS PAR CONSULTATION, LES 15 000 F DEDUITS UNE FOIS ══ */
const P = [
  { id: 'd1', date: '2026-11-18', number: 'MND-D-2026-0007', consultationId: 'cg-1' },
  { id: 'd2', date: '2026-11-19', number: 'MND-D-2026-0009', consultationId: 'cg-1' },
  { id: 'd3', date: '2026-11-19', number: 'MND-D-2026-0008', consultationId: 'cg-2' },
  { id: 'd4', date: '2026-11-19', number: 'MND-D-2026-0010' },
];
dit(7, 'la piece deja nee d une consultation se retrouve (la plus recente), jamais celle d une autre, jamais sans consultation',
  ['d2', 'd3', undefined, undefined, 'd1'],
  [pieceDeLaConsultation(P, 'cg-1')?.id, pieceDeLaConsultation(P, 'cg-2')?.id, pieceDeLaConsultation(P, 'cg-3')?.id, pieceDeLaConsultation(P, '')?.id, pieceDeLaConsultation(P, 'cg-1', 'd2')?.id]);
const DED = deductionDeLaConsultation({ paidXof: 15000 } as unknown as OnlineConsultation);
dit(7, 'le nom de la deduction est le meme partout (devis ferme, mesure, remise)', [LIBELLE_DE_LA_DEDUCTION, LIBELLE_DE_LA_DEDUCTION], [LIBELLE_DE_LA_CONSULTATION_DEDUITE, DED?.discountLabel]);
dit(7, 'les 15 000 F se deduisent une fois : poses sur un devis nu, jamais une seconde fois',
  [{ globalDiscountXof: 15000, discountLabel: 'Consultation privée, déduite' }, {}, {}],
  [avecLaDeduction({}, DED), avecLaDeduction({ globalDiscountXof: 15000, discountLabel: 'Consultation privée, déduite' }, DED), avecLaDeduction({ globalDiscountXof: 5000 }, null)]);
dit(7, 'un devis qui porte deja un geste en francs garde son geste, la deduction s y ajoute et se nomme',
  { globalDiscountXof: 20000, discountLabel: 'Consultation privée, déduite · Geste de la Maison' },
  avecLaDeduction({ globalDiscountXof: 5000, discountLabel: 'Geste de la Maison' }, DED));
dit(7, '... et ne se rajoute pas une troisieme fois', {}, avecLaDeduction({ globalDiscountXof: 20000, discountLabel: 'Consultation privée, déduite · Geste de la Maison' }, DED));

/* ══ #8 — L'ACOMPTE JUSTE ══ */
const IDS: Record<string, string> = { 'Creation': 'sv-c', 'Soin': 'sv-s' };
const TAUX: Record<string, number> = { 'sv-c': 0.3, 'sv-s': 0.5 };
const id = (x: string) => IDS[x];
const taux = (x: string) => TAUX[x] ?? 0;
dit(8, 'un devis de 100 000 F dont 15 000 F sont deduits : l acompte de 30 % se compte sur 85 000 F', 25500,
  acompteDuDevis([{ label: 'Creation', unitXof: 100000, qty: 1 }], id, taux, 0, 15000));
dit(8, 'la remise en francs de la ligne compte aussi : 80 000 F moins 10 000 F, a 50 %', 35000,
  acompteDuDevis([{ label: 'Soin', unitXof: 80000, qty: 1, discountXof: 10000 }], id, taux));
dit(8, 'la remise de la piece se repartit au prorata : 60 000 F + 40 000 F, 10 % puis 9 000 F ; seule la ligne reconnue demande', 24300,
  acompteDuDevis([{ label: 'Soin', unitXof: 60000, qty: 1 }, { label: 'Ligne libre', unitXof: 40000, qty: 1 }], id, taux, 10, 9000));
dit(8, 'sans remise en francs, rien ne change (les exemples du lot 4)', [64000, 17280],
  [acompteDuDevis([{ label: 'Creation', unitXof: 80000, qty: 1 }, { label: 'Soin', unitXof: 80000, qty: 1 }, { label: 'Ligne libre', unitXof: 50000, qty: 1 }], id, taux),
    acompteDuDevis([{ label: 'Creation', unitXof: 80000, qty: 1, discountPct: 10 }], id, taux, 20)]);
dit(8, 'une remise qui couvre tout ne demande rien ; un devis vide non plus', [0, 0],
  [acompteDuDevis([{ label: 'Creation', unitXof: 10000, qty: 1 }], id, taux, 0, 15000), acompteDuDevis([], id, taux, 0, 15000)]);

const DC = { kind: 'devis', status: 'confirmé', id: 'd1', apptId: 'apt-1' };
const RDV = (o: Record<string, unknown> = {}) => ({ id: 'apt-1', devisId: 'd1', status: 'en attente', depositXof: 25500, ...o });
dit(8, 'le lien de l acompte porte l acompte DEMANDE du rendez-vous ne du devis confirme', [25500, 25500, 0, 0, 0, 0, 0, 0], [
  acompteAEnvoyer(DC, [RDV()]), acompteAEnvoyer({ ...DC, apptId: undefined }, [RDV()]),
  acompteAEnvoyer(DC, [RDV({ depositConfirmed: true })]), acompteAEnvoyer(DC, [RDV({ status: 'annulé' })]), acompteAEnvoyer(DC, [RDV({ status: 'honoré' })]),
  acompteAEnvoyer({ ...DC, status: 'acceptée' }, [RDV()]), acompteAEnvoyer({ ...DC, boutique: { etat: 'prete' } }, [RDV()]), acompteAEnvoyer(DC, [RDV({ depositXof: 0 })]),
]);
dit(8, 'son message dit l acompte et la page, sans numero de piece', 'Bonjour Mme A., votre devis est confirmé. Pour réserver votre rituel, l’acompte est de 25 500 F. Par Mobile Money, ouvrez cette page : le code à composer s’y affiche, montant compris.\nhttps://exemple/payer',
  motDuLienDeLAcompte('Mme A.', '25 500 F', 'https://exemple/payer'));

/* ══ #9 — LE GESTE « SON DEVIS » DES CONVERSATIONS ══ */
const piece = (o: Partial<PieceDuGeste>): PieceDuGeste => ({ id: 'd1', branchId: 'b1', kind: 'devis', number: 'MND-D-2026-0088', clientId: 'c1', date: '2026-11-18', status: 'estimé', totalXof: 45000, resteXof: 0, ...o } as PieceDuGeste);
const ctxG = (pieces: PieceDuGeste[]): ContexteDesGestes => ({
  branchId: 'b1', maison: 'Maison MND', tete: { id: 'c1', name: 'Akouavi K.' }, fenetreOuverte: true, aujourdhui: '2026-11-19', heure: '14:00',
  enFrancs: (x) => `${x} F`, lienDePaiement: () => null, itineraire: '', pieces, appts: [], bilans: [], photos: 0, codesVivants: [],
} as ContexteDesGestes);
const gFerme = gesteDit(lesGestes(ctxG([piece({ devisFerme: 'À remettre au rendez-vous. La visio n’est pas encore tenue.' })])), 'devis');
const gOuvert = gesteDit(lesGestes(ctxG([piece({})])), 'devis');
dit(9, 'un devis qui attend : le geste s eteint avec la raison, sans message ni piece, et sa pastille le dit',
  ['À remettre au rendez-vous. La visio n’est pas encore tenue.', undefined, undefined, 'à remettre au rendez-vous'],
  [gFerme?.eteint, gFerme?.compose, gFerme?.piece, gFerme?.attend]);
dit(9, 'un devis qui peut partir : le geste compose et joint la piece', [null, true, { quoi: 'devis', invoiceId: 'd1', nom: 'Devis MND-D-2026-0088' }, 'attend un oui'],
  [gOuvert?.eteint, /voici le devis du/.test(gOuvert?.compose ?? ''), gOuvert?.piece, gOuvert?.attend]);

/* ══ #10 — LA PORTE DES FACTURES : CE QUI SORT, CE QUI SE CONFIRME, CE QUI S'ENREGISTRE ══ */
type Pc = DevisLuPourLaRemise & { id: string; number?: string };
const journal: { ecrits: [string, unknown][]; dits: string[] } = { ecrits: [], dits: [] };
const TENUE: ContexteDeLaRemise = CTX({ consultations: [CG], visios: [{ consultationId: 'cg-1', statut: 'tenue' }] });
const porteAvec = (c: ContexteDeLaRemise, jour = '2026-11-21') => {
  journal.ecrits = []; journal.dits = [];
  return porteDeLaRemise<Pc>(c, jour, { ecris: (i, m) => { journal.ecrits.push([i, m]); }, qui: 'Awa', dit: (m) => { journal.dits.push(m); }, maintenant: () => '2026-11-21T08:00:00.000Z' });
};
const pc = (o: Partial<Pc> = {}): Pc => ({ id: 'd1', number: 'MND-D-2026-0007', ...D({ consultationId: 'cg-1' }), ...o });
{
  const p = porteAvec(CTX({ consultations: [CG] }));
  const sorti = p.sortLeDevis(pc());
  dit(10, 'un devis qui attend ne sort pas : rien n est ecrit, la raison est dite',
    [null, [], ['À remettre au rendez-vous. Aucun rendez-vous tenu : ni visio, ni consultation privée.'], 'À remettre au rendez-vous. Aucun rendez-vous tenu : ni visio, ni consultation privée.'],
    [sorti, journal.ecrits, journal.dits, p.fermeAuDevis(pc())]);
}
{
  const p = porteAvec(TENUE);
  const sorti = p.sortLeDevis(pc());
  dit(10, 'le rendez-vous tenu : il sort, marque remis (l instant, qui), et la piece qui part porte la marque',
    [null, [['d1', { remisLe: '2026-11-21T08:00:00.000Z', remisPar: 'Awa' }]], '2026-11-21T08:00:00.000Z', []],
    [p.fermeAuDevis(pc()), journal.ecrits, sorti?.remisLe, journal.dits]);
  const encore = porteAvec(TENUE).sortLeDevis(pc({ remisLe: '2026-11-20T10:00:00.000Z' }));
  dit(10, 'deja remis, il ressort sans seconde marque', ['2026-11-20T10:00:00.000Z', []], [encore?.remisLe, journal.ecrits]);
  const brouillon = porteAvec(TENUE).sortLeDevis(pc({ status: 'brouillon' }));
  dit(10, 'un brouillon qui sort part « envoye »', ['envoyée', 'envoyée'], [brouillon?.status, (journal.ecrits[0]?.[1] as { status?: string })?.status]);
}
{
  const p = porteAvec(CTX());
  const facture = p.sortLeDevis(pc({ kind: 'facture' }));
  const boutique = p.sortLeDevis(pc({ boutique: { etat: 'a-preparer' } }));
  dit(10, 'une facture, une commande de la Boutique : la porte ne les regarde pas, et ne les marque pas',
    [true, true, [], [], null, null, null], [!!facture, !!boutique, journal.ecrits, journal.dits, p.fermeAuDevis(pc({ kind: 'facture' })), p.fermeALaConfirmation(pc({ boutique: {} })), p.fermeALaFacture(pc({ boutique: {} }))]);
}
{
  const p = porteAvec(CTX({ consultations: [CG] }));
  const sorti = p.sortLeDevis(pc(), 'Cliente de longue date');
  dit(10, 'la direction passe outre avec un motif : il sort, et le motif reste ecrit sur le devis',
    [[['d1', { remisLe: '2026-11-21T08:00:00.000Z', remisPar: 'Awa', remisHorsRegle: 'Cliente de longue date' }]], 'Cliente de longue date', []],
    [journal.ecrits, sorti?.remisHorsRegle, journal.dits]);
}
{
  const vieux = pc({ status: 'envoyée', remisLe: '2026-11-01T09:00:00.000Z' });
  const p = porteAvec(TENUE);
  const sorti = p.sortLeDevis(vieux);
  dit(10, 'perime, il ne sort plus et ne se confirme plus tel quel',
    [null, ['Ce devis valait jusqu’au 16 novembre 2026 : renouvelez-le avant de l’envoyer.'], 'Il valait jusqu’au 16 novembre 2026 : renouvelez-le avant de le confirmer.', []],
    [sorti, journal.dits, p.fermeALaConfirmation(vieux), journal.ecrits]);
}
{
  const p = porteAvec(TENUE);
  dit(10, 'confirmer et convertir en facture demandent un devis remis',
    ['Remettez d’abord le devis à la cliente : il se confirme ensuite.', 'Remettez d’abord le devis à la cliente.', null, null],
    [p.fermeALaConfirmation(pc()), p.fermeALaFacture(pc()), p.fermeALaConfirmation(pc({ remisLe: '2026-11-20T10:00:00.000Z' })), p.fermeALaFacture(pc({ remisLe: '2026-11-20T10:00:00.000Z' }))]);
  const autres = [{ id: 'd0', date: '2026-11-19', number: 'MND-D-2026-0005', consultationId: 'cg-1' }];
  const remisValable = pc({ status: 'envoyée', remisLe: '2026-11-20T10:00:00.000Z' });
  const remisPerime = pc({ status: 'envoyée', remisLe: '2026-11-01T09:00:00.000Z' });
  dit(10, 'a l enregistrement : pas de second devis neuf pour une consultation ; modifier le sien passe',
    ['Cette consultation a déjà son devis (MND-D-2026-0005) : modifiez-le plutôt.', null, null, null],
    [p.refuseLEnregistrement(pc(), undefined, autres), p.refuseLEnregistrement(pc({ id: 'd0' }), pc({ id: 'd0' }), autres),
      p.refuseLEnregistrement(pc({ consultationId: undefined }), undefined, autres), p.refuseLEnregistrement(pc({ consultationId: 'cg-7' }), undefined, autres)]);
  dit(10, '« confirme » ne s enregistre que sur un devis remis et encore valable ; un devis deja confirme se reenregistre',
    ['Ce devis n’est pas encore remis à la cliente : remettez-le d’abord, il se confirme ensuite.',
      'Ce devis n’est pas encore remis à la cliente : remettez-le d’abord, il se confirme ensuite.',
      null, 'Ce devis valait jusqu’au 16 novembre 2026 : renouvelez-le avant de le confirmer.', null, null],
    [p.refuseLEnregistrement(pc({ status: 'confirmé' }), pc(), []), p.refuseLEnregistrement(pc({ status: 'confirmé', consultationId: undefined }), undefined, []),
      p.refuseLEnregistrement({ ...remisValable, status: 'confirmé' }, remisValable, []), p.refuseLEnregistrement({ ...remisPerime, status: 'confirmé' }, remisPerime, []),
      p.refuseLEnregistrement({ ...remisPerime, status: 'confirmé', ...renouvele('2026-11-21', '2026-11-21T08:00:00.000Z') }, remisPerime, []),
      p.refuseLEnregistrement(pc({ status: 'confirmé', date: '2026-11-18' }), pc({ status: 'confirmé', date: '2026-11-18' }), [])]);
}
{
  const estime = { kind: 'devis', status: 'estimé', number: 'MND-D-2026-0007', note: 'MOT ESTIME' };
  const O = { deduction: DED, motEstime: 'MOT ESTIME', motFerme: 'MOT FERME' };
  const r1 = rouvreLaPieceDeLaConsultation(estime, { ...O, ferme: false });
  const r2 = rouvreLaPieceDeLaConsultation(estime, { ...O, ferme: true });
  const r3 = rouvreLaPieceDeLaConsultation({ ...estime, note: 'Mot de la Maison', globalDiscountXof: 20000, discountLabel: 'Consultation privée, déduite · Geste de la Maison' }, { ...O, ferme: true });
  const r4 = rouvreLaPieceDeLaConsultation({ ...estime, status: 'confirmé' }, { ...O, ferme: true });
  const r5 = rouvreLaPieceDeLaConsultation({ ...estime, kind: 'facture', number: 'MND-2026-0200' }, { ...O, ferme: true });
  dit(10, 'la piece deja nee se rouvre : telle quelle pour l estime ; demande ferme, l estime DEVIENT le ferme (a valider par elle, 15 000 F deduits, le mot du ferme)',
    [[true, 'estimé', undefined], [true, 'à valider', 'cliente', 15000, 'Consultation privée, déduite', 'MOT FERME']],
    [[r1.enEdition, r1.piece.status, (r1.piece as { globalDiscountXof?: number }).globalDiscountXof],
      [r2.enEdition, r2.piece.status, (r2.piece as { aValiderPar?: string }).aValiderPar, (r2.piece as { globalDiscountXof?: number }).globalDiscountXof, (r2.piece as { discountLabel?: string }).discountLabel, r2.piece.note]]);
  dit(10, '... la deduction ne se pose pas deux fois, un mot ecrit par la Maison reste ; un devis confirme et une facture ne changent pas',
    [[20000, 'Mot de la Maison'], [true, 'confirmé'], [false, 'facture', true]],
    [[r3.piece.globalDiscountXof, r3.piece.note], [r4.enEdition, r4.piece.status], [r5.enEdition, r5.piece.kind, /a déjà sa facture MND-2026-0200/.test(r5.mot)]]);
}

/* ══ #10 (suite) — LES BRANCHEMENTS : LA REGLE EST APPELEE PARTOUT OU UN DEVIS SORT ══ */
const fac = source('src/apps/trone/routes/vente/Factures.tsx');
const rd = source('src/apps/trone/routes/vente/RemiseDuDevis.tsx');
const entre = (s: string, a: string, b: string) => { const i = s.indexOf(a); const k = i < 0 ? -1 : s.indexOf(b, i + a.length); return i >= 0 && k > i ? s.slice(i, k) : ''; };
dit(10, 'les Factures tendent a la porte ce que le Trone lit, l ecriture de la marque et le nom de qui remet', [true, true, true], [
  /return porteDeLaRemise<Invoice>\(useContexteDeLaRemise\(\), todayISO\(\), \{ \.\.\.o, maintenant: \(\) => new Date\(\)\.toISOString\(\) \}\);/.test(rd),
  /const remise = useLaPorteDeLaRemise\(\{\n\s*ecris: \(id, marque\) => setInvoices\(\(prev\) => prev\.map\(\(i\) => \(i\.id === id \? \{ \.\.\.i, \.\.\.marque \} : i\)\)\),\n\s*qui: monNomFil,/.test(fac),
  /dit: \(mot\) => \{ toast\(mot\); setWaHint\(mot\); \},/.test(fac),
]);
dit(10, '« Adresser par WhatsApp », le PDF et l impression passent par la porte, avant de construire le papier', [true, true, true], [
  /const sendWhatsApp = async \(porte: 'trone' \| 'app'\) => \{\n\s*if \(!selected\) return;\n\s*const doc = remise\.sortLeDevis\(selected\);\n\s*if \(!doc\) return;\n\s*await invoicePdf\(avecLaValidite\(buildPdfData\(doc\), doc\)\);/.test(fac),
  /const downloadPdf = async \(\) => \{\n\s*if \(!selected\) return;\n\s*const doc = remise\.sortLeDevis\(selected\);\n\s*if \(!doc\) return;\n\s*await invoicePdf\(avecLaValidite\(buildPdfData\(doc\), doc\)\);/.test(fac),
  /const printDoc = \(\) => \{\n\s*if \(selected && !remise\.sortLeDevis\(selected\)\) return;\n\s*document\.body\.classList\.add\('trv-print-doc'\);/.test(fac),
]);
dit(10, 'les boutons d envoi se ferment avec la raison : WhatsApp, l application, Imprimer, PDF', [true, true, 3], [
  /disabled=\{!!remise\.fermeAuDevis\(selected\)\} title=\{remise\.fermeAuDevis\(selected\) \?\? undefined\} onClick=\{\(\) => void sendWhatsApp\('trone'\)\}/.test(fac),
  /\{versLApp && !remise\.fermeAuDevis\(selected\) && \(/.test(fac),
  (fac.match(/disabled=\{!!remise\.fermeAuDevis\(selected\)\} title=\{remise\.fermeAuDevis\(selected\) \?\? undefined\}/g) ?? []).length,
]);
dit(10, 'confirmer, convertir et enregistrer demandent leur accord a la porte', [true, true, true], [
  /disabled=\{!!remise\.fermeALaConfirmation\(selected\)\} title=\{remise\.fermeALaConfirmation\(selected\) \?\? undefined\} onClick=\{\(\) => patchSelected\(\{ status: 'confirmé' \}\)\}/.test(fac),
  /disabled=\{!!remise\.fermeALaFacture\(selected\)\}\n\s*title=\{remise\.fermeALaFacture\(selected\) \?\? undefined\}/.test(fac),
  /const refusDeLaRemise = remise\.refuseLEnregistrement\(d, editing\.mode === 'edit' \? invoices\.find\(\(i\) => i\.id === d\.id\) : undefined, invoicesStore\.get\(\)\);\n\s*if \(refusDeLaRemise\) \{ toast\(refusDeLaRemise\); return; \}\n\s*if \(editing\.mode === 'new'\) setInvoices/.test(entre(fac, 'const saveDraft = ', 'const deleteDoc = ')),
]);
dit(10, 'le registre, l editeur, le panneau et le document montrent ou en est la remise', [true, true, true, true], [
  /<PastilleDeLaRemise d=\{d\} porte=\{remise\} \/>/.test(fac), /<RemiseDuBrouillon d=\{draft\} porte=\{remise\} \/>/.test(fac),
  /<PanneauDeLaRemise d=\{selected\} porte=\{remise\} estDirection=\{estDirection\} dit=\{setWaHint\} surRenouveler=\{openEdit\} \/>/.test(fac),
  /<ValiditeDuDevis d=\{active\} \/>/.test(fac),
]);
dit(10, '« Remettre le devis » : ferme tant qu il attend (la raison ecrite), ouvert quand le rendez-vous est tenu ; la direction seule passe outre, avec un motif', [true, true, true, true, true, true], [
  /<span style=\{titre\}>À remettre au rendez-vous<\/span>\n\s*<span style=\{texte\}>\{e\.raison\}<\/span>\n\s*<Button variant="ghost" size="sm" disabled title=\{e\.raison\}>Remettre le devis<\/Button>/.test(rd),
  /\{estDirection && \(\n\s*<button className="trv-linkbtn trv-linkbtn--muted" style=\{\{ alignSelf: 'flex-start' \}\} onClick=\{\(\) => void passeOutre\(\)\}>/.test(rd),
  /const passeOutre = async \(\) => \{\n\s*if \(!estDirection\) return;\n\s*const motif = await demandeUnTexte\(/.test(rd),
  /if \(!motif \|\| !motif\.trim\(\)\) return;\n\s*if \(porte\.sortLeDevis\(d, motif\.trim\(\)\)\)/.test(rd),
  /const remet = \(\) => \{\n\s*if \(porte\.sortLeDevis\(d\)\)/.test(rd), /<Button variant="copper" size="sm" onClick=\{remet\}>Remettre le devis<\/Button>/.test(rd),
]);
dit(10, 'la pastille et le mot de l editeur lisent le juge ; perime, le devis se renouvelle (date et remise du jour) dans l editeur', [true, true, true, true], [
  /const mot = estPerime\(d, porte\.aujourdhui\) \? 'périmé' : pastilleDeLaRemise\(d, e\);/.test(rd),
  /\? <>À remettre au rendez-vous\. \{e\.raison\} Le devis se travaille ; il ne sortira qu’ensuite\.<\/>/.test(rd),
  /surRenouveler\(\{ \.\.\.d, \.\.\.renouvele\(porte\.aujourdhui, new Date\(\)\.toISOString\(\)\) \}\);/.test(rd),
  /\{perime && <Button variant="copper" size="sm" onClick=\{renouvelle\}>Renouveler le devis<\/Button>\}/.test(rd),
]);
dit(10, 'un devis neuf prepare pour une consultation qui a deja sa piece lui cede la place, avant que l ecran se peigne', [true, true, true, true, true], [
  /useUnDevisParConsultation\(\{\n\s*neuf: editing\?\.mode === 'new' \? editing\.draft : null,/.test(fac),
  /ouvre: \(piece, enEdition, mot\) => \{ setSelectedId\(piece\.id\); setEditing\(enEdition \? \{ mode: 'edit', draft: piece \} : null\); setWaHint\(mot\); toast\(mot\); \},/.test(fac),
  /useLayoutEffect\(\(\) => \{\n\s*if \(!neuf \|\| neuf\.kind !== 'devis' \|\| !neuf\.consultationId\) return;\n\s*const deja = pieceDeLaConsultation\(invoicesStore\.get\(\), neuf\.consultationId, neuf\.id\);\n\s*if \(!deja\) return;/.test(rd),
  /ferme: neuf\.status === 'à valider' && neuf\.aValiderPar === 'cliente',\n\s*deduction: c \? deductionDeLaConsultation\(c\) : null,/.test(rd),
  /o\.ouvre\(\{ \.\.\.r\.piece, lines: r\.piece\.lines\.map\(\(l\) => \(\{ \.\.\.l \}\)\) \}, r\.enEdition, r\.mot\);/.test(rd),
]);
dit(10, 'le lien de l acompte part du devis confirme, vers sa conversation, par la page Mobile Money au montant de l acompte', [true, true, true, true], [
  /<LienDeLAcompte d=\{selected\} rdvs=\{appointments\} appel=\{appelOf\(selected\)\} telephone=\{clientOf\(selected\)\?\.phone\} \/>/.test(fac),
  /const acompte = acompteAEnvoyer\(d, rdvs\);/.test(rd), /const lien = acompte > 0 \? lienPaiementMomo\(acompte\) : null;/.test(rd),
  /window\.location\.hash = `#\$\{cheminDeLaConversation\(tel, mot\) \?\? '\/conversations'\}`;/.test(rd),
]);
dit(10, 'l acompte du rendez-vous ne d un devis compte la remise en francs de la piece ; il reste DEMANDE, jamais dit « recu »', [true, true, false], [
  /acompteDuDevis\(devis\.lines, \(nom\) => services\.find\(\(s\) => s\.name === nom\)\?\.id, depositRateFor, devis\.globalDiscountPct, devis\.globalDiscountXof \?\? 0\)/.test(fac),
  /\.\.\.\(acompte > 0 \? \{ depositXof: acompte \} : \{\}\)/.test(fac),
  /depositConfirmed: true/.test(entre(fac, 'const convertDevisToAppt = ', 'const {\n')),
]);
const gestes = source('src/apps/trone/routes/clients/_gestes.tsx');
dit(10, 'les Conversations : la recolte pose la raison du juge sur le devis de la cliente ; le composeur marque remis le devis qu il joint', [true, true, true, true], [
  /if \(i\.kind === 'devis' && !horsRegle\(i\) && i\.clientId === fil\?\.clientId\) \{/.test(gestes),
  /const r = peutEtreRemis\(i, contexteDeLaRemise\);\n\s*if \(!r\.ok\) devisFerme = `À remettre au rendez-vous\. \$\{r\.raison\}`;/.test(gestes),
  /if \(g\.eteint\) \{ toast\(g\.eteint\); return; \}/.test(source('src/apps/trone/routes/clients/ComposeurWhatsApp.tsx')),
  /if \(doc\.kind === 'devis'\) remetsLeDevis\(doc\.id\);/.test(source('src/apps/trone/routes/clients/ComposeurWhatsApp.tsx')),
]);
dit(10, 'la marque ne se pose ni sur une commande de la Boutique, ni deux fois', true,
  /i\.id === id && !horsRegle\(i\) && !estRemis\(i\)\n\s*\? \{ \.\.\.i, \.\.\.marqueDeLaRemise\(i, quand, par\) \}/.test(source('src/shared/devis-remis.ts')));
const tabs = source('src/apps/couronne/Tabs.tsx');
dit(10, 'Ma Couronne : la cloche, la pastille et « Mes commandes » ne montrent qu un devis remis', [true, true, true, true, true], [
  /i\.clientId === clientId && i\.kind === 'devis' && visiblePourElle\(i\)/.test(tabs),
  /\(estCommandeBoutique\(i\) \|\| \(i\.kind === 'devis' && lisibleParElle\(i\)\)\) && i\.status !== 'brouillon'/.test(tabs),
  /devis\.filter\(\(x\) => attendElle\(x, todayIso\(\)\)/.test(tabs),
  /const apres = apresLeGeste\(i, g, todayIso\(\)\);/.test(tabs), /const geste = gesteDeLaCliente\(d, todayIso\(\)\);/.test(tabs),
]);
dit(10, 'Ma Couronne ne dit « acompte recu » que reconnu recu par la Maison', [true, 1], [
  /: a\.depositConfirmed && \(a\.depositXof \?\? 0\) > 0\n\s*\? t\('\{rituel\}, acompte reçu, en attente de la maison\.'/.test(tabs),
  (tabs.match(/acompte reçu, en attente de la maison/g) ?? []).length,
]);

/* ══ #11 — LA BASE (0219) : LE TEXTE ══ */
const MIG = sql('supabase/migrations/0219_le_devis_remis_au_rendez_vous.sql');
dit(11, 'le jour de la regle et les quinze jours sont les memes en base et au Trone', [true, true],
  [MIG.includes(`collate "C" < '${LE_JOUR_DE_LA_REMISE}'`), MIG.includes(`> v_base + ${VALIDITE_DU_DEVIS_JOURS};`)]);
dit(11, 'une regle RESTRICTIVE : une cliente ne lit que ce qui lui est lisible ; les regles de 0036 ne sont pas reecrites', [true, false],
  [/create policy devis_remis_seulement on public\.invoices as restrictive for select to authenticated\s+using \(public\.is_staff\(\) or public\.piece_lisible_par_elle\(data\)\);/.test(MIG), /policy own_(sel|ins|upd|del)/.test(MIG)]);
dit(11, 'la garde est posee avant insertion, modification et suppression, avec les droits de qui ecrit ; la Maison passe', [true, true, true],
  [/create trigger garde_de_la_piece_cliente_biud\s+before insert or update or delete on public\.invoices\s+for each row execute function public\.garde_de_la_piece_cliente\(\);/.test(MIG),
    /create or replace function public\.garde_de_la_piece_cliente\(\) returns trigger\s+language plpgsql security invoker set search_path = public/.test(MIG),
    /if public\.ecriture_de_la_maison\(\) then\s+return coalesce\(new, old\);/.test(MIG)]);
dit(11, 'la migration ne modifie aucune ligne et ne touche aucune migration passee', [false, false],
  [/\b(update|delete from|insert into|truncate)\s+public\./i.test(MIG), /\babo_(num|vrai|aujourdhui|maintenant|etat_de_la_seance)\b/.test(MIG)]);

/* ══ #12 — LA BASE (0219), JOUEE DANS PGLITE ══
   La VRAIE migration contre une base simulee : les roles de Supabase,
   `auth.uid()`, les regles `own_*` de 0036, `ecriture_de_la_maison` (0138) et
   la garde d'argent (0174) telles qu'elles sont au depot. La cliente ecrit
   comme sa synchronisation : « inserer, ou modifier si la ligne existe ». */
const brut = (rel: string): string => {
  let s = readFileSync(path.join(racine, rel), 'utf8').replace(/\r\n/g, '\n');
  if (__FAUTE__ && __FAUTE__.fichier === rel) s = s.split(__FAUTE__.avant).join(__FAUTE__.apres);
  return s;
};
const dossierPGlite = process.env.BANC_PGLITE;
type Base = { exec: (s: string) => Promise<unknown>; query: (s: string, p?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>; close: () => Promise<void> };
let PGlite: (new () => Base) | null = null;
if (dossierPGlite) {
  /* Devant le navigateur de carton du banc, PGlite se croit dans un navigateur :
     on le retire ici, les magasins n'en ont plus besoin. */
  delete (globalThis as Record<string, unknown>).window;
  delete (globalThis as Record<string, unknown>).document;
  try { PGlite = (await import(pathToFileURL(path.join(dossierPGlite, 'node_modules/@electric-sql/pglite/dist/index.js')).href)).PGlite ?? null; } catch { PGlite = null; }
}
if (!PGlite) {
  console.log('SAUTE #12 la migration 0219 ne se joue pas ici, PGlite absent (BANC_PGLITE=<dossier qui porte node_modules/@electric-sql/pglite>)');
} else {
  const M0138 = brut('supabase/migrations/0138_le_parcours_de_l_abonnee.sql');
  const M0174 = brut('supabase/migrations/0174_garde_fiche_d_essai.sql');
  const debutDeLaGarde = M0174.indexOf('create or replace function public.garde_argent_cliente()');
  const gardeDArgent = M0174.slice(debutDeLaGarde, M0174.indexOf('end $$;', debutDeLaGarde) + 7);
  const CLIENTE = '11111111-1111-4111-8111-111111111111';
  const AUTRE = '22222222-2222-4222-8222-222222222222';
  const EQUIPE = '33333333-3333-4333-8333-333333333333';
  const base = new PGlite();
  await base.exec(`
    create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
    grant anon, authenticated, service_role to current_user;
    create schema auth;
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create table public.staff (user_id uuid primary key, role text);
    create table public.invoices (id text primary key, branch_id text, data jsonb not null default '{}'::jsonb, updated_at timestamptz default now());
    create function public.is_staff() returns boolean language sql stable security definer set search_path = public as $$ select exists (select 1 from public.staff where user_id = auth.uid()) $$;
    create function public.est_ma_tete(cible text) returns boolean language sql stable security definer set search_path = public as $$ select cible = (auth.uid())::text $$;
    ${M0138.slice(M0138.indexOf('create or replace function public.ecriture_de_la_maison()'), M0138.indexOf('create or replace function public.garde_argent_cliente()'))}
    ${gardeDArgent}
    create trigger garde_argent_cliente_biu before insert or update on public.invoices for each row execute function public.garde_argent_cliente();
    create function public.ecrit_par_le_serveur(p_id text) returns void language sql security definer set search_path = public as $$ update public.invoices set data = data || '{"parLeServeur":true}'::jsonb where id = p_id $$;
    alter table public.invoices enable row level security;
    create policy own_sel on public.invoices for select to authenticated using (public.is_staff() or public.est_ma_tete(data->>'clientId'));
    create policy own_ins on public.invoices for insert to authenticated with check (public.is_staff() or public.est_ma_tete(data->>'clientId'));
    create policy own_upd on public.invoices for update to authenticated using (public.is_staff() or public.est_ma_tete(data->>'clientId')) with check (public.is_staff() or public.est_ma_tete(data->>'clientId'));
    create policy own_del on public.invoices for delete to authenticated using (public.is_staff() or public.est_ma_tete(data->>'clientId'));
    insert into public.staff (user_id, role) values ('${EQUIPE}', 'equipe');
    grant usage on schema public, auth to anon, authenticated, service_role;
    grant all on all tables in schema public to anon, authenticated, service_role;
    grant execute on all functions in schema public to anon, authenticated, service_role;
    grant execute on all functions in schema auth to anon, authenticated, service_role;`);
  const iso = (ms: number) => new Date(ms).toISOString();
  const T = Date.now();
  const JOUR_MS = 86_400_000;
  const LIGNES = [{ id: 'l1', label: 'Creation', qty: 1, unitXof: 100000, discountPct: 0 }];
  const pieceDe = (o: Record<string, unknown>) => ({ branchId: 'b1', kind: 'devis', number: 'MND-D-X', clientId: CLIENTE, date: '2026-11-20', lines: LIGNES, globalDiscountPct: 0, theme: 'Aube', status: 'estimé', ...o });
  const PIECES: Record<string, Record<string, unknown>> = {
    f1: pieceDe({ kind: 'facture', status: 'envoyée' }),
    fP: pieceDe({ kind: 'facture', status: 'payée' }),
    dA: pieceDe({}),
    dR: pieceDe({ remisLe: iso(T) }),
    dR2: pieceDe({ remisLe: iso(T) }),
    dR3: pieceDe({ remisLe: iso(T) }),
    dV: pieceDe({ status: 'à valider', aValiderPar: 'cliente', remisLe: iso(T) }),
    dM: pieceDe({ status: 'à valider', aValiderPar: 'maison', remisLe: iso(T) }),
    dE: pieceDe({ status: 'envoyée', remisLe: iso(T) }),
    dE2: pieceDe({ status: 'envoyée', remisLe: iso(T) }),
    dP: pieceDe({ status: 'envoyée', remisLe: iso(T - 20 * JOUR_MS) }),
    dL: pieceDe({ status: 'acceptée', date: '2026-11-10' }),
    dB: pieceDe({ status: 'envoyée', boutique: { etat: 'a-preparer' } }),
    dBr: pieceDe({ status: 'brouillon', remisLe: iso(T) }),
    dO: pieceDe({ clientId: AUTRE, remisLe: iso(T) }),
  };
  const q = (v: unknown) => `'${JSON.stringify(v).replace(/'/g, "''")}'::jsonb`;
  for (const [id, d] of Object.entries(PIECES)) await base.exec(`insert into public.invoices (id, branch_id, data) values ('${id}', 'b1', ${q({ id, ...d })});`);

  const MIGRATION = brut('supabase/migrations/0219_le_devis_remis_au_rendez_vous.sql');
  const joue = () => base.exec(MIGRATION).then(() => 'jouee', (e: Error) => String(e?.message ?? e).slice(0, 160));
  dit(12, 'la migration 0219 se joue sans erreur, et se rejoue', ['jouee', 'jouee'], [await joue(), await joue()]);

  type Qui = 'cliente' | 'autre' | 'equipe' | 'serveur';
  const entreComme = async (qui: Qui) => {
    const role = qui === 'serveur' ? 'service_role' : 'authenticated';
    const uid = qui === 'cliente' ? CLIENTE : qui === 'autre' ? AUTRE : qui === 'equipe' ? EQUIPE : '';
    await base.exec(`begin; set local role ${role}; select set_config('request.jwt.claim.sub', '${uid}', true), set_config('request.jwt.claims', '{"role":"${role}"}', true);`);
  };
  const comme = async (qui: Qui, s: string): Promise<string> => {
    await entreComme(qui);
    try { await base.exec(s); await base.exec('commit;'); return 'ecrit'; } catch (e) {
      await base.exec('rollback;');
      return /row-level security/.test(String((e as Error)?.message)) ? 'refuse par les droits' : `erreur ${String((e as Error)?.message).slice(0, 90)}`;
    }
  };
  const litComme = async (qui: Qui, s: string): Promise<Record<string, unknown>[]> => {
    await entreComme(qui);
    try { const r = (await base.query(s)).rows; await base.exec('commit;'); return r; } catch (e) {
      await base.exec('rollback;');
      return [{ id: `erreur ${String((e as Error)?.message).slice(0, 90)}`, n: -1 }];
    }
  };
  const piece12 = async (id: string) => (await base.query('select branch_id, data from public.invoices where id = $1', [id])).rows[0] as { branch_id: string; data: Record<string, unknown> } | undefined;
  /* Comme la synchronisation de Ma Couronne : toute la ligne, inseree ou modifiee. */
  const pousse = (qui: Qui, id: string, data: Record<string, unknown>, branche = 'b1') =>
    comme(qui, `insert into public.invoices (id, branch_id, data) values ('${id}', '${branche}', ${q(data)}) on conflict (id) do update set branch_id = excluded.branch_id, data = excluded.data;`);
  const geste = async (qui: Qui, id: string, patch: Record<string, unknown>, retire: string[] = [], branche = 'b1') => {
    const d = { ...(await piece12(id))!.data, ...patch };
    for (const k of retire) delete d[k];
    const verdict = await pousse(qui, id, d, branche);
    const apres = (await piece12(id))!.data;
    return [verdict, apres.status, apres.aValiderPar ?? null];
  };

  /* Ce qu'elle lit. */
  dit(12, 'la cliente ne lit que ses pieces lisibles : pas le devis qui attend, pas le brouillon, pas celui d une autre',
    ['dB', 'dE', 'dE2', 'dL', 'dM', 'dP', 'dR', 'dR2', 'dR3', 'dV', 'f1', 'fP'],
    (await litComme('cliente', 'select id from public.invoices order by id collate "C"')).map((r) => r.id));
  dit(12, 'l equipe lit tout, comme avant', Object.keys(PIECES).length, (await litComme('equipe', 'select count(*)::int as n from public.invoices'))[0].n);

  /* Les jumeaux. */
  const auj = String((await base.query("select ((now() at time zone 'Africa/Porto-Novo')::date)::text as j")).rows[0].j);
  const ECH: DevisLuPourLaRemise[] = [
    D({ kind: 'facture' }), D({ boutique: { etat: 'prete' } }), D({ status: 'brouillon', remisLe: iso(T) }), D({}), D({ remisLe: iso(T) }),
    D({ status: 'envoyée', remisLe: iso(T - 20 * JOUR_MS) }), D({ status: 'envoyée', remisLe: iso(T - 15 * JOUR_MS) }), D({ status: 'envoyée', remisLe: iso(T - 16 * JOUR_MS) }),
    D({ status: 'envoyée', date: '2026-11-16' }), D({ status: 'estimé', date: '2026-11-16' }), D({ status: 'envoyée', date: '2026-11-17' }), D({ status: 'acceptée', remisLe: iso(T - 90 * JOUR_MS) }),
    D({ status: 'envoyée', date: '' }), D({ status: 'confirmé', date: '2026-11-16T10:00:00.000Z' }), D({ status: 'à valider', date: '2026-10-01' }), D({ status: 'payée', date: '2026-10-01' }),
    D({ status: 'envoyée', date: '2026-10-01' }), D({ status: 'brouillon', boutique: { etat: 'a-preparer' } }),
    D({ status: 'envoyée', date: '2026-10-01', remisLe: 'pas une date' }), D({ status: 'envoyée', date: '2026-10-01T08:00:00.000Z' }),
  ];
  const cote: [boolean[], boolean[]] = [[], []];
  for (const e of ECH) {
    const r = (await base.query('select public.piece_lisible_par_elle($1::jsonb) as l, public.devis_perime($1::jsonb) as p', [JSON.stringify(e)])).rows[0];
    cote[0].push(r.l as boolean, r.p as boolean);
    cote[1].push(lisibleParElle(e), estPerime(e, auj));
  }
  dit(12, `les jumeaux de la base disent comme le Trone, piece par piece (${ECH.length} exemples : lisible, perime)`, cote[1], cote[0]);

  /* Ses trois gestes, et eux seuls. */
  dit(12, 'faire confirmer : estime -> a valider par la Maison', ['ecrit', 'à valider', 'maison'], await geste('cliente', 'dR', { status: 'à valider', aValiderPar: 'maison' }));
  dit(12, 'valider : a valider par elle -> acceptee, plus rien a valider', ['ecrit', 'acceptée', null], await geste('cliente', 'dV', { status: 'acceptée' }, ['aValiderPar']));
  dit(12, 'accepter : envoyee -> acceptee', ['ecrit', 'acceptée', null], await geste('cliente', 'dE', { status: 'acceptée' }));
  dit(12, 'elle ne valide pas un devis que la Maison verifie encore', ['ecrit', 'à valider', 'maison'], await geste('cliente', 'dM', { status: 'acceptée' }, ['aValiderPar']));
  dit(12, 'elle ne se confirme pas un devis, ni ne le dit paye', [['ecrit', 'estimé', null], ['ecrit', 'estimé', null]],
    [await geste('cliente', 'dR2', { status: 'confirmé' }), await geste('cliente', 'dR2', { status: 'payée' })]);
  dit(12, 'un devis perime ne s accepte plus', ['ecrit', 'envoyée', null], await geste('cliente', 'dP', { status: 'acceptée' }));
  {
    const v = await geste('cliente', 'dR3', { status: 'à valider', aValiderPar: 'maison', lines: [{ ...LIGNES[0], unitXof: 1 }], globalDiscountXof: 99000, boutique: { etat: 'remise' }, remisHorsRegle: 'moi' }, [], 'b9');
    const d = (await piece12('dR3'))!;
    dit(12, 'son geste ne porte que l etat : les lignes, la remise, la marque de Boutique, la branche restent ceux de la Maison',
      [['ecrit', 'à valider', 'maison'], 100000, false, 'devis', false, false, 'b1'],
      [v, (d.data.lines as { unitXof: number }[])[0].unitXof, 'globalDiscountXof' in d.data, d.data.kind, 'boutique' in d.data, 'remisHorsRegle' in d.data, d.branch_id]);
  }
  {
    const avant = (await piece12('f1'))!.data;
    const v1 = await pousse('cliente', 'f1', { ...avant, lines: [{ ...LIGNES[0], unitXof: 1 }], status: 'payée' }, 'b9');
    const v2 = await comme('cliente', `update public.invoices set data = data || '{"lines":[],"kind":"devis","remisLe":"2026-11-20T10:00:00.000Z"}'::jsonb where id = 'f1';`);
    const d = (await piece12('f1'))!;
    dit(12, 'une facture ne se reecrit pas par elle (ni par sa synchronisation, ni en direct)', ['ecrit', 'ecrit', JSON.stringify(avant), 'b1'], [v1, v2, JSON.stringify(d.data), d.branch_id]);
    await pousse('cliente', 'fP', (await piece12('fP'))!.data);
    dit(12, 'une facture payee repoussee telle quelle par son telephone reste payee', 'payée', (await piece12('fP'))!.data.status);
    const v3 = await comme('cliente', `update public.invoices set data = data || '{"kind":"facture","lines":[]}'::jsonb where id = 'dE2';`);
    const e2 = (await piece12('dE2'))!.data;
    dit(12, 'un devis ne devient pas facture par elle', ['ecrit', 'devis', 1], [v3, e2.kind, (e2.lines as unknown[]).length]);
  }
  {
    const avant = JSON.stringify((await piece12('dA'))!.data);
    const v1 = await pousse('cliente', 'dA', { ...PIECES.dA, id: 'dA', remisLe: iso(T), status: 'acceptée' });
    const v2 = await comme('cliente', `update public.invoices set data = data || '{"remisLe":"2026-11-20T10:00:00.000Z"}'::jsonb where id = 'dA';`);
    dit(12, 'elle ne se remet pas a elle-meme un devis qui attend son rendez-vous', ['refuse par les droits', 'ecrit', avant], [v1, v2, JSON.stringify((await piece12('dA'))!.data)]);
    dit(12, 'ni celui d une autre', ['refuse par les droits', 'estimé'], [await pousse('cliente', 'dO', { ...PIECES.dO, id: 'dO', status: 'acceptée' }), (await piece12('dO'))!.data.status]);
  }
  {
    const v = [await comme('cliente', "delete from public.invoices where id in ('f1', 'dE2', 'dB');"), (await base.query("select count(*)::int as n from public.invoices where id in ('f1', 'dE2', 'dB')")).rows[0].n];
    dit(12, 'elle n efface pas une piece', ['ecrit', 3], v);
  }
  {
    await pousse('cliente', 'fX', pieceDe({ id: 'fX', kind: 'facture', status: 'envoyée', payments: [{ id: 'p', amountXof: 100000 }] }));
    await pousse('cliente', 'dX', pieceDe({ id: 'dX', status: 'confirmé', consultationId: 'cg-9', apptId: 'apt-9', aValiderPar: 'cliente', boutique: { etat: 'remise' }, remisHorsRegle: 'moi', payments: [{ id: 'p', amountXof: 1 }] }));
    const dX = (await piece12('dX'))?.data ?? {};
    dit(12, 'elle ne cree pas de facture ; une demande de devis nait « envoyee », sans lien ni marque de Boutique, remise par elle, et elle la lit',
      [false, 'envoyée', false, false, false, false, false, 'cliente', true, true],
      [!!(await piece12('fX')), dX.status, 'consultationId' in dX, 'apptId' in dX, 'boutique' in dX, 'remisHorsRegle' in dX, 'payments' in dX, dX.remisPar, typeof dX.remisLe === 'string' && dX.remisLe.length > 10,
        (await litComme('cliente', "select id from public.invoices where id = 'dX'")).length === 1]);
  }

  /* La Maison, le serveur, les fonctions du serveur : comme avant. */
  {
    const v1 = await comme('equipe', `update public.invoices set data = data || '{"lines":[],"status":"confirmé","remisLe":"2026-11-21T08:00:00.000Z"}'::jsonb where id = 'dA';`);
    const dA = (await piece12('dA'))!.data;
    const v2 = await comme('equipe', `insert into public.invoices (id, branch_id, data) values ('fE', 'b1', ${q(pieceDe({ id: 'fE', kind: 'facture', status: 'payée' }))}); delete from public.invoices where id = 'dBr';`);
    const v3 = await comme('serveur', `update public.invoices set data = data || '{"status":"payée"}'::jsonb where id = 'f1'; delete from public.invoices where id = 'dM';`);
    const v4 = await comme('cliente', "select public.ecrit_par_le_serveur('dE2');");
    dit(12, 'l equipe, le serveur et une fonction du serveur appelee par la cliente ecrivent comme avant',
      ['ecrit', 'confirmé', 0, 'ecrit', 'payée', false, 'ecrit', 'payée', false, 'ecrit', true],
      [v1, dA.status, (dA.lines as unknown[]).length, v2, (await piece12('fE'))?.data.status, !!(await piece12('dBr')), v3, (await piece12('f1'))!.data.status, !!(await piece12('dM')), v4, (await piece12('dE2'))!.data.parLeServeur]);
    dit(12, 'remis par l equipe, le devis se lit', 1, (await litComme('cliente', "select id from public.invoices where id = 'dA'")).length);
  }
  await base.close();
}

console.log(`\n${n} verifications.`);
if (process.exitCode) console.log('ECHEC : le devis remis au rendez-vous ne tient pas ses promesses.');
else console.log('TOUT VA BIEN : le devis se remet au rendez-vous.');
