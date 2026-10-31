/* LA MISSION NAÎT DU RITUEL, ÉPROUVÉE — `node scripts/verifie-les-missions-des-prestataires.mjs`.

   « Quand Hermine ou Ziadath travaille, c'est forcément une mission qu'elle a
   prise. Il faut créer la mission et le paiement, qui sont transférés en
   dépenses » (Yéman, 1er novembre 2026). La règle
   (src/shared/missions-prestataires-pur.ts) et les écrans qui la portent.
   Chaque épreuve dit la règle, dans les deux sens. Tout est inventé.
   Sortie ASCII : la console de Windows. */
import {
  missionsNeesDuRituel, missionsARetirerAuDeshonneur, chargeDeLaMission, caisseDeLaMission,
  ditLesMissionsNees, ditLesMissionsRetirees, lignesDuPrestataire, prenomDe, CHARGE_CATEGORY,
  type PrestatairePourMissions, type MissionDuPrestataire,
} from '../src/shared/missions-prestataires-pur';
import { readFileSync } from 'node:fs';

let ko = 0;
let n = 0;
const ascii = (v: unknown): string =>
  (JSON.stringify(v) ?? 'undefined').replace(/[^\x20-\x7e]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);
const dit = (nom: string, attendu: unknown, obtenu: unknown) => {
  n++;
  const ok = JSON.stringify(attendu) === JSON.stringify(obtenu);
  if (!ok) { ko++; process.exitCode = 1; }
  console.log(`${ok ? 'OK   ' : 'ECHEC'} ${nom}${ok ? '' : ` -> ${ascii(obtenu)}`}`);
  if (!ok) console.log(`       attendu ${ascii(attendu)}`);
};
const sansCommentaires = (f: string) => readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\s+/g, ' ');

/* ── Le décor ─────────────────────────────────────────────────────────── */
const NOMS: Record<string, string> = { tresses: 'Tresses Moyennes · Mi-dos', defaire: 'Défaire les tresses', soin: 'Le Souffle' };
const nomDe = (id: string) => NOMS[id];
let compteur = 0;
const idSuivant = () => `ms-${++compteur}`;
const hermine: PrestatairePourMissions = { id: 'pv-h', branchId: 'b1', name: 'Hermine M.', prestations: ['tresses'], grille: { tresses: 12000 }, reglement: 'jour-meme' };
const ziadath: PrestatairePourMissions = { id: 'pv-z', branchId: 'b1', name: 'Ziadath', prestations: ['defaire'], grille: { defaire: 3000 } };
const ailleurs: PrestatairePourMissions = { id: 'pv-a', branchId: 'b2', name: 'Autre maison', prestations: ['tresses'], grille: { tresses: 1 } };
const archivee: PrestatairePourMissions = { id: 'pv-x', branchId: 'b1', name: 'Partie', archived: true, prestations: ['tresses'], grille: { tresses: 1 } };
const sansRien: PrestatairePourMissions = { id: 'pv-s', branchId: 'b1', name: 'Sans fiche' };
const tous = [hermine, ziadath, ailleurs, archivee, sansRien];
const rdv = (serviceIds: string[], id = 'r1', clientName?: string) => ({ id, branchId: 'b1', date: '2026-10-31', serviceIds, clientName });

/* ── La naissance ─────────────────────────────────────────────────────── */
compteur = 0;
const une = missionsNeesDuRituel(rdv(['tresses', 'soin'], 'r1', 'Elikya Do Mar'), tous, [], nomDe, idSuivant);
dit('un rituel de tresses honore donne UNE mission, a Hermine, et a personne d autre', ['pv-h'], une.map((m) => m.mission.providerId));
dit('la mission porte la prestation, le prenom, la date du rituel, une tete, le prix convenu, son rendez-vous, sa naissance',
  { id: 'ms-1', branchId: 'b1', providerId: 'pv-h', label: 'Tresses Moyennes · Mi-dos · Elikya', date: '2026-10-31', qty: 1, amountXof: 12000, rdvId: 'r1', nee: 'rituel' },
  une[0].mission);
dit('Hermine est payee le jour meme, sa fiche le dit', true, une[0].payeeLeJourMeme);
dit('rien ne manque sur sa grille', [], une[0].sansPrix);
dit('sans prenom de cliente, le libelle est la prestation seule', 'Tresses Moyennes · Mi-dos',
  missionsNeesDuRituel(rdv(['tresses']), [hermine], [], nomDe, idSuivant)[0].mission.label);
dit('deux tetes de tresses : deux prestations, le prix double, le nom une seule fois',
  { qty: 2, amountXof: 24000, label: 'Tresses Moyennes · Mi-dos' },
  (() => { const m = missionsNeesDuRituel(rdv(['tresses', 'tresses']), [hermine], [], nomDe, idSuivant)[0].mission; return { qty: m.qty, amountXof: m.amountXof, label: m.label }; })());
dit('tresses et defaire dans le meme rituel : une mission pour chacune', ['pv-h', 'pv-z'],
  missionsNeesDuRituel(rdv(['tresses', 'defaire']), tous, [], nomDe, idSuivant).map((m) => m.mission.providerId));
dit('Ziadath n est pas payee le jour meme (sa fiche ne le dit pas)', false,
  missionsNeesDuRituel(rdv(['defaire']), tous, [], nomDe, idSuivant)[0].payeeLeJourMeme);
dit('un rituel sans prestation de prestataire ne donne rien', [], missionsNeesDuRituel(rdv(['soin']), tous, [], nomDe, idSuivant));
dit('un prestataire d une autre maison ne recoit rien', [], missionsNeesDuRituel(rdv(['tresses']), [ailleurs], [], nomDe, idSuivant));
dit('un prestataire archive ne recoit rien', [], missionsNeesDuRituel(rdv(['tresses']), [archivee], [], nomDe, idSuivant));
dit('une fiche sans prestations cochees ne recoit rien', [], missionsNeesDuRituel(rdv(['tresses']), [sansRien], [], nomDe, idSuivant));

/* ── Une fois par rendez-vous ─────────────────────────────────────────── */
dit('re-honorer le meme rituel ne redonne pas la mission deja nee', [],
  missionsNeesDuRituel(rdv(['tresses'], 'r1'), [hermine], [{ rdvId: 'r1', providerId: 'pv-h' }], nomDe, idSuivant));
dit('la mission deja nee d un AUTRE rituel ne bloque pas celle-ci', ['pv-h'],
  missionsNeesDuRituel(rdv(['tresses'], 'r2'), [hermine], [{ rdvId: 'r1', providerId: 'pv-h' }], nomDe, idSuivant).map((m) => m.mission.providerId));
dit('la mission de Ziadath sur ce rituel ne bloque pas celle d Hermine', ['pv-h'],
  missionsNeesDuRituel(rdv(['tresses'], 'r1'), [hermine], [{ rdvId: 'r1', providerId: 'pv-z' }], nomDe, idSuivant).map((m) => m.mission.providerId));

/* ── Sans prix convenu ────────────────────────────────────────────────── */
const sansPrix: PrestatairePourMissions = { ...hermine, prestations: ['tresses', 'defaire'], grille: { tresses: 12000 } };
const mixte = missionsNeesDuRituel(rdv(['tresses', 'defaire']), [sansPrix], [], nomDe, idSuivant)[0];
dit('une prestation sans prix : le montant ne compte que celles qui en ont', 12000, mixte.mission.amountXof);
dit('et la fiche dit laquelle manque', ['Défaire les tresses'], mixte.sansPrix);
dit('la note de la mission le dit aussi', 'Montant à écrire : Défaire les tresses sans prix convenu sur sa fiche.', mixte.mission.note);
const rien = missionsNeesDuRituel(rdv(['defaire']), [sansPrix], [], nomDe, idSuivant)[0];
dit('aucune prestation chiffree : mission a zero, a ecrire, jamais payee d office', { amountXof: 0, payee: true },
  { amountXof: rien.mission.amountXof, payee: rien.payeeLeJourMeme });
dit('zero est un prix ecrit : pas de manque', { amountXof: 0, sansPrix: [] },
  (() => { const m = missionsNeesDuRituel(rdv(['tresses']), [{ ...hermine, grille: { tresses: 0 } }], [], nomDe, idSuivant)[0]; return { amountXof: m.mission.amountXof, sansPrix: m.sansPrix }; })());
dit('les lignes d un prestataire suivent l ordre du rituel', ['defaire', 'tresses'], lignesDuPrestataire(rdv(['defaire', 'soin', 'tresses']), sansPrix));

/* ── Le des-honneur ───────────────────────────────────────────────────── */
const registre: MissionDuPrestataire[] = [
  { id: 'a', branchId: 'b1', providerId: 'pv-h', label: 'x', date: '2026-10-31', amountXof: 1, nee: 'rituel', rdvId: 'r1' },
  { id: 'b', branchId: 'b1', providerId: 'pv-z', label: 'x', date: '2026-10-31', amountXof: 1, nee: 'rituel', rdvId: 'r1', paidAt: '2026-10-31T10:00:00Z' },
  { id: 'c', branchId: 'b1', providerId: 'pv-h', label: 'x', date: '2026-10-31', amountXof: 1 },
  { id: 'd', branchId: 'b1', providerId: 'pv-h', label: 'x', date: '2026-10-31', amountXof: 1, nee: 'rituel', rdvId: 'r2' },
];
dit('des-honorer retire la mission nee du rituel et encore a payer, elle seule', ['a'], missionsARetirerAuDeshonneur('r1', registre).map((m) => m.id));
dit('la mission payee reste (l argent est sorti), la mission saisie a la main aussi, celle d un autre rituel aussi', ['b', 'c', 'd'],
  registre.filter((m) => !missionsARetirerAuDeshonneur('r1', registre).includes(m)).map((m) => m.id));
dit('un rituel sans mission : rien a retirer', [], missionsARetirerAuDeshonneur('r9', registre));

/* ── La charge et la caisse ───────────────────────────────────────────── */
dit('la charge d une mission : meme identifiant pour la meme mission, libelle d aout 2026, Sous-traitance',
  { id: 'exp-ms-ms-7', branchId: 'b1', label: 'Prestataire · Hermine M., Tresses Moyennes · Mi-dos · Elikya', amountXof: 12000, date: '2026-10-31', cashbox: 'Caisse principale', category: 'Sous-traitance' },
  chargeDeLaMission({ id: 'ms-7', branchId: 'b1', label: 'Tresses Moyennes · Mi-dos · Elikya', amountXof: 12000 }, 'Hermine M.', 'Caisse principale', '2026-10-31'));
dit('la devise du tiroir se garde quand on la donne', { code: 'USD', rate: 600, amount: 20 },
  chargeDeLaMission({ id: 'm', branchId: 'b1', label: 'l', amountXof: 12000 }, 'H', 'Dollars', '2026-10-31', { code: 'USD', rate: 600, amount: 20 }).fx);
dit('la categorie de la charge est celle des prestataires', 'Sous-traitance', CHARGE_CATEGORY);
const caisses = [{ name: 'Caisse du mois' }, { name: 'Caisse principale' }, { name: 'MoMo' }];
dit('l argent sort de la caisse de l encaissement quand elle est a la Maison', 'MoMo', caisseDeLaMission('MoMo', caisses));
dit('une caisse inconnue de la branche ne sert pas : la Caisse du mois d abord', 'Caisse du mois', caisseDeLaMission('Caisse MND Pay', caisses));
dit('sans caisse de l encaissement, la Caisse du mois', 'Caisse du mois', caisseDeLaMission(undefined, caisses));
dit('sans Caisse du mois, la Caisse principale', 'Caisse principale', caisseDeLaMission(undefined, caisses.slice(1)));
dit('sinon la premiere caisse de la branche', 'MoMo', caisseDeLaMission(undefined, [{ name: 'MoMo' }]));
dit('une branche sans caisse : la charge cite Caisse principale', 'Caisse principale', caisseDeLaMission(undefined, []));

/* ── Ce que l ecran dit ───────────────────────────────────────────────── */
dit('rien ne se dit quand rien n est ne', '', ditLesMissionsNees([]));
dit('payee le jour meme : la ligne dit la caisse et les Depenses', 'mission de Hermine payée, 12 000 F de la Caisse principale, en Dépenses.',
  ditLesMissionsNees(une, 'Caisse principale'));
dit('a payer : la ligne le dit', 'mission de Ziadath notée, 3 000 F à payer.',
  ditLesMissionsNees(missionsNeesDuRituel(rdv(['defaire']), [ziadath], [], nomDe, idSuivant)));
dit('sans montant : la ligne dit d ecrire le montant', 'mission de Hermine notée, montant à écrire.', ditLesMissionsNees([rien]));
dit('le retrait se dit au singulier et au pluriel', ['', 'la mission du prestataire née de ce rituel est retirée', 'les 2 missions de prestataires nées de ce rituel sont retirées'],
  [0, 1, 2].map(ditLesMissionsRetirees));
dit('le prenom est le premier mot', ['Elikya', '', 'Hermine'], [prenomDe('Elikya Do Mar'), prenomDe(undefined), prenomDe('  Hermine M.')]);

/* ── Les ecrans qui portent la regle ──────────────────────────────────── */
const actions = sansCommentaires('src/apps/trone/routes/clients/actions.tsx');
dit('l honneur du rituel pose les missions, avec la caisse de l encaissement', true,
  actions.includes('const missions = poseLesMissionsDuRituel(appt, (id) => byId.get(id)?.name, { caisse: opts.caisse });'));
dit('et le dit meme en muet', true, actions.includes('if (missions.dit) toast(missions.dit);'));
dit('le des-honneur retire les missions nees du rituel', true, actions.includes('const missionsRetirees = retireLesMissionsDuRituel(appt.id);'));
dit('et le retrait se dit', true, actions.includes('ditLesMissionsRetirees(r.missionsRetirees),'));
const caisse = sansCommentaires('src/apps/trone/routes/vente/Caisse.tsx');
dit('la Caisse passe sa caisse a l honneur', true, caisse.includes('honoreALEncaissement(apptToSettle, svcById, { caisse: activeCashbox || undefined });'));
const ecran = sansCommentaires('src/apps/trone/routes/equipe/Prestataires.tsx');
dit('l ecran des prestataires lit le magasin partage, il ne le cree plus', { partage: true, local: false },
  { partage: ecran.includes("from '../../../../shared/missions-prestataires'"), local: ecran.includes("createStore<Mission[]>('mnd_prestations'") });
const magasin = sansCommentaires('src/shared/missions-prestataires.ts');
dit('le registre mnd_prestations n est lie qu une fois, dans le module partage', 1,
  (magasin.match(/bindDocument\(missionsStore, 'mnd_prestations'\)/g) ?? []).length + (ecran.match(/bindDocument\(missionsStore/g) ?? []).length);
dit('l ecran paie par la meme charge que l honneur', true, ecran.includes('chargeDeLaMission('));
dit('une mission sans montant ne se paie pas', true, ecran.includes('m.amountXof <= 0'));
const fiche = sansCommentaires('src/shared/prestataires.ts');
dit('la fiche du prestataire porte ses prestations, sa grille et son reglement', true,
  fiche.includes('prestations?: string[];') && fiche.includes('grille?: Record<string, number>;') && fiche.includes('reglement?: ReglementDuPrestataire;'));

console.log(`\n${n - ko}/${n} epreuves : la mission nait du rituel honore.`);
if (ko) console.log(`${ko} ECHEC(S).`);
