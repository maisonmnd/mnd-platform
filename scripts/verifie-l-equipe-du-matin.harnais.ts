/* L'EQUIPE DU MATIN, EPROUVEE — 21 novembre 2026.
   `node scripts/verifie-l-equipe-du-matin.mjs` ; `--prouve` remet chaque
   panne et chacune doit faire crier une epreuve.

   « Chaque jour a 6 h, les rendez-vous du jour a l'equipe ; sans rendez-vous,
   aucun message. Les jours sans rendez-vous avant 11 h, 9 h ou 10 h, mais
   seulement quand je donne la permission » (Yeman).

     A. LES REGLAGES et L'HEURE DE COTONOU ;
     B. LA JOURNEE : les rendez-vous qui comptent, la ligne, la liste ;
     C. LES MODELES : variables sans saut de ligne, textes, boutons, devise ;
     D. LE PLAN DU MATIN : qui recoit la journee, quand la question part ;
     E. LA REPONSE : une fois, avant la limite, rien avant 11 h ; le mur ;
     F. LA LETTRE : le facteur, la salle, le webhook, la fonction, la
        migration, la page.

   Sortie en ASCII (la console Windows est en cp1252). */
import { readFileSync } from 'node:fs';
import {
  HEURES_PLUS_TARD, LIMITE_PAR_DEFAUT, LISTE_AU_PLUS, MOTIF_DU_MUR, TYPE_DE_L_EQUIPE_DU_MATIN,
  avecLaProposition, chargeDuBoutonDeLEquipe, composantsDeLAccord, confirmationDuChoix, estLHeureDuPassage, estOuverte,
  etatDuMatin, idDuMur, instantDeCotonou, jourDeCotonou, jourDitDuMatin, jugeLaReponse, laPropositionDe, ligneDuRendezVous,
  lisLeBoutonDeLEquipe, listeDuJour, murDeLArrivee, nomCourtDuMatin, nomsDits, nouvelleProposition, numeroDuMatin, ouvertCeJour, ouvertureDuMatin,
  planDuMatin, premierAvant, reglagesDuMatin, rendezVousDuJour, rienAvant, texteDeLAccord, texteDeLArrivee, texteDuPlanning,
  variableDuModele, variablesDeLAccord, variablesDeLArrivee, variablesDuPlanning,
  type MembreDuMatin, type PropositionDuMatin, type RdvDuMatin,
} from '../src/shared/equipe-du-matin-pur';
import { traverseLesHeuresCalmes } from '../src/shared/salle-des-envois';

const ascii = (s: string): string => s.replace(/[«»]/g, '"').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\x20-\x7e]/g, '?');
let ko = 0;
let vus = 0;
const dit = (nom: string, attendu: unknown, obtenu: unknown): void => {
  const ok = JSON.stringify(attendu) === JSON.stringify(obtenu);
  vus += 1;
  if (!ok) ko += 1;
  console.log(`${ok ? 'OK   ' : 'ECHEC'} ${ascii(nom)}${ok ? '' : ` -> ${ascii(String(JSON.stringify(obtenu)))}`}`);
  if (!ok) console.log(`       attendu ${ascii(String(JSON.stringify(attendu)))}`);
};
/* Le fichier LU (et non importe) : sa copie en panne quand le lanceur la donne. */
const lis = (rel: string): string => {
  const p = process.env.EQUIPE_PANNE_FICHIER === rel && process.env.EQUIPE_PANNE_COPIE ? process.env.EQUIPE_PANNE_COPIE : rel;
  return readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
};

/* La devise, lue dans son unique source (identite.ts tire la couche de donnees : on ne l'importe pas). */
const DEVISE_COMPLETE = (/export const DEVISE_COMPLETE = '([^']+)';/.exec(lis('src/shared/identite.ts')) ?? [])[1] ?? '';

/* ── A. LES REGLAGES ET L'HEURE ─────────────────────────────────────── */
dit('A1 sans reglage : eteint, personne, la limite de 7 h 30', { actif: false, destinataires: [], decideur: '', limite: '07:30' }, reglagesDuMatin(undefined));
dit('A2 la limite par defaut est 7 h 30', '07:30', LIMITE_PAR_DEFAUT);
dit('A3 les reglages lus : doublon retire, appel nettoye, limite hors bornes ramenee',
  { actif: true, destinataires: [{ staffId: 'st-g', appel: 'Gerard' }, { staffId: 'st-n' }], decideur: 'st-y', limite: '07:30' },
  reglagesDuMatin({ actif: true, destinataires: [{ staffId: 'st-g', appel: '  Gerard ' }, { staffId: 'st-n' }, { staffId: 'st-g' }, { appel: 'x' }], decideur: 'st-y', limite: '11:00' }));
dit('A4 une limite valable est gardee', '08:15', reglagesDuMatin({ limite: '08:15' }).limite);
dit('A5 actif seulement s il est dit vrai', false, reglagesDuMatin({ actif: 'oui' }).actif);
/* 05:00 UTC = 6 h a Cotonou. */
const a6h = Date.UTC(2026, 10, 22, 5, 0);
dit('A6 05:00 UTC est le 22 a Cotonou', '2026-11-22', jourDeCotonou(a6h));
dit('A7 23:30 UTC le 21 est deja le 22 a Cotonou', '2026-11-22', jourDeCotonou(Date.UTC(2026, 10, 21, 23, 30)));
dit('A8 le passage : 6 h oui, 5 h 30 non, 8 h non', [true, false, false],
  [estLHeureDuPassage(a6h), estLHeureDuPassage(Date.UTC(2026, 10, 22, 4, 30)), estLHeureDuPassage(Date.UTC(2026, 10, 22, 7, 0))]);
dit('A9 7 h 30 a Cotonou, en UTC', Date.UTC(2026, 10, 22, 6, 30), instantDeCotonou('2026-11-22', '07:30'));
dit('A10 la date dite avec l annee', ['dimanche 22 novembre 2026', 'mardi 1er decembre 2026'],
  [jourDitDuMatin('2026-11-22'), ascii(jourDitDuMatin('2026-12-01'))]);

/* ── B. LA JOURNEE ──────────────────────────────────────────────────── */
const J = '2026-11-23'; // un lundi
const B_ = 'br-maison';
const rdv = (id: string, time: string, status = 'confirmé', extra: Partial<RdvDuMatin> = {}): RdvDuMatin & { id: string } =>
  ({ id, branchId: B_, date: J, time, status, clientId: `c-${id}`, serviceIds: [], master: 'Team', ...extra });
const duJour = rendezVousDuJour([
  rdv('r3', '14:00'), rdv('r1', '09:00'), rdv('rx', '08:30', 'annulé'), rdv('ry', '10:00', 'confirmé', { branchId: 'autre' }),
  rdv('rz', '10:00', 'confirmé', { date: '2026-11-24' }), rdv('r2', '11:00', 'en attente'),
], J, B_);
dit('B1 les rendez-vous qui comptent, dans l ordre (ni annule, ni autre branche, ni autre jour)', ['r1', 'r2', 'r3'], duJour.map((r) => r.id));
dit('B2 rien avant 11 h : non avec 9 h', false, rienAvant(duJour));
dit('B3 rien avant 11 h : oui quand le premier est a 11 h', true, rienAvant(duJour.filter((r) => r.id !== 'r1')));
dit('B4 une heure illisible compte comme avant', false, rienAvant([rdv('q', 'bientot')]));
dit('B5 le premier avant 11 h', 'r1', premierAvant(duJour)?.id);
dit('B6 une journee vide : rien avant 11 h', true, rienAvant([]));
dit('B7 le nom court : prenom et initiale', ['Awa B.', 'Marie-Anne K.', 'Awa', 'Jo T.'],
  [nomCourtDuMatin('Awa Bossou'), nomCourtDuMatin('Marie-Anne Kpossou', 'Marie-Anne'), nomCourtDuMatin('Awa'), nomCourtDuMatin('Josiane Tossou', 'Jo')]);
dit('B8 la ligne : l heure, la cliente, les prestations ; Team ne se dit pas',
  '8 h 30 Awa B., Reprise et Coiffure', ligneDuRendezVous({ minute: 510, qui: 'Awa B.', prestations: ['Reprise', 'Coiffure'], maitre: 'Team' }));
dit('B9 la ligne : une autre main se dit', '11 h Kossi A., Lavage, Expert', ligneDuRendezVous({ minute: 660, qui: 'Kossi A.', prestations: ['Lavage'], maitre: 'Expert' }));
dit('B10 la liste courte, au point median', '9 h A. · 11 h B.', listeDuJour(['9 h A.', '11 h B.']));
const longues = Array.from({ length: 30 }, (_, i) => `${8 + (i % 10)} h Cliente numero ${i + 1}., Reprise et Coiffure longue`);
const liste = listeDuJour(longues);
dit('B11 la liste longue tient dans la variable, et dit le reste au Trone', [true, true], [liste.length <= LISTE_AU_PLUS, /· et \d+ autres au Trône$/.test(liste)]);

/* ── C. LES MODELES ─────────────────────────────────────────────────── */
const vP = variablesDuPlanning({ appel: 'Gérard', nombre: 3, jour: J, liste: 'a\nb\tc     d' });
dit('C1 les variables du planning, sans saut de ligne ni grands blancs', ['Gérard', '3 rendez-vous', 'lundi 23 novembre 2026', 'a b c d'], vP);
dit('C2 le texte du planning, signe de la devise',
  `Bonjour Gérard, votre planning à la Maison : 3 rendez-vous aujourd’hui, lundi 23 novembre 2026. Horaires : a b c d. Belle journée à vous.\n${DEVISE_COMPLETE}`,
  texteDuPlanning(vP, DEVISE_COMPLETE));
const vA = variablesDeLAccord({ appel: 'Yéman', jour: J, noms: ['Gérard', 'Nassim', 'Aimé'] });
dit('C3 la question a la direction', `Bonjour Yéman, aucun rendez-vous avant 11 h aujourd’hui, lundi 23 novembre 2026. Pour Gérard, Nassim et Aimé, l’arrivée peut passer à 9 h ou à 10 h au lieu de 8 h. Que choisissez-vous ?\n${DEVISE_COMPLETE}`,
  texteDeLAccord(vA, DEVISE_COMPLETE));
const comp = composantsDeLAccord(vA, J) as { type: string; sub_type?: string; index?: string; parameters: { payload?: string }[] }[];
dit('C4 deux reponses rapides, « A 9 h » puis « A 10 h », chacune son jour et son heure',
  [['button', 'quick_reply', '0', 'EQUIPE_TARD:2026-11-23:9'], ['button', 'quick_reply', '1', 'EQUIPE_TARD:2026-11-23:10']],
  comp.slice(1).map((c) => [c.type, c.sub_type, c.index, c.parameters[0]?.payload]));
dit('C5 le bouton se relit, et 11 h ne se lit pas', [{ jour: J, heure: 9 }, { jour: J, heure: 10 }, null, null],
  [lisLeBoutonDeLEquipe(chargeDuBoutonDeLEquipe(J, 9)), lisLeBoutonDeLEquipe(chargeDuBoutonDeLEquipe(J, 10)), lisLeBoutonDeLEquipe('EQUIPE_TARD:2026-11-23:11'), lisLeBoutonDeLEquipe('PAIE_RECU:x')]);
dit('C6 les heures proposees : 9 h et 10 h', [9, 10], [...HEURES_PLUS_TARD]);
const vR = variablesDeLArrivee({ appel: 'Nassim', jour: J, heure: 10 });
dit('C7 le message d arrivee', `Bonjour Nassim, aucun rendez-vous avant 11 h aujourd’hui, lundi 23 novembre 2026. Vous pouvez venir à 10 h au lieu de 8 h. Belle journée à vous.\n${DEVISE_COMPLETE}`,
  texteDeLArrivee(vR, DEVISE_COMPLETE));
dit('C8 une variable ne porte jamais de saut de ligne', 'a b', variableDuModele('a\r\n\nb'));
dit('C9 les noms dits', ['l’équipe', 'Gérard', 'Gérard et Nassim', 'Gérard, Nassim et Aimé'], [nomsDits([]), nomsDits(['Gérard']), nomsDits(['Gérard', 'Nassim']), nomsDits(['Gérard', 'Nassim', 'Aimé'])]);
dit('C10 ce que la direction lit apres son toucher', 'C’est noté : Gérard, Nassim et Aimé viennent à 10 h. Personne ne peut réserver avant 10 h 30 ce matin.',
  confirmationDuChoix(10, ['Gérard', 'Nassim', 'Aimé']));
dit('C11 le numero : la forme que Meta attend', ['2290151000011', '2290151000011', '2290151000011', ''],
  [numeroDuMatin('+229 01 51 00 00 11'), numeroDuMatin('0151000011'), numeroDuMatin('51000011'), numeroDuMatin('')]);

/* ── D. LE PLAN DU MATIN ────────────────────────────────────────────── */
const HEURES = ['dim', 'lun', 'mar', 'mer', 'jeu', 'ven', 'sam'].map((key) => ({ key, open: '08h00', close: '19h00', closed: key === 'dim' }));
const equipe: MembreDuMatin[] = [
  { id: 'st-g', name: 'Gerard Tolofon', phone: '+229 01 51 00 00 11', branchId: B_ },
  { id: 'st-n', name: 'Nassim Maliki', phone: '+229 01 51 00 00 12', branchId: B_ },
  { id: 'st-a', name: 'Emakponse Aime Houndagba', phone: '+229 01 51 00 00 13', branchId: B_ },
  { id: 'st-y', name: 'Yeman Boya', phone: '0151000014', branchId: B_ },
];
const reglages = reglagesDuMatin({
  actif: true, decideur: 'st-y',
  destinataires: [{ staffId: 'st-g', appel: 'Gérard' }, { staffId: 'st-n', appel: 'Nassim' }, { staffId: 'st-a', appel: 'Aimé' }],
});
const plan = (o: { rdvs?: RdvDuMatin[]; jour?: string; hours?: unknown; exceptions?: unknown; planning?: unknown; equipe?: MembreDuMatin[]; reglages?: ReturnType<typeof reglagesDuMatin> }) =>
  planDuMatin({ jour: o.jour ?? J, reglages: o.reglages ?? reglages, equipe: o.equipe ?? equipe, rdvs: o.rdvs ?? [], hours: o.hours ?? HEURES, exceptions: o.exceptions ?? [], planning: o.planning ?? {} });
const resume = (p: ReturnType<typeof plan>) => p.map((b) => ({ planning: b.planning.map((q) => q.appel), accord: b.accord ? { a: b.accord.decideur.appel, pour: b.accord.destinataires.map((d) => d.appel) } : null, sautes: b.sautes }));
dit('D1 eteint : rien', [], plan({ reglages: reglagesDuMatin({ ...reglages, actif: false }) }));
dit('D2 un rendez-vous a 9 h : la journee aux trois, pas de question',
  [{ planning: ['Gérard', 'Nassim', 'Aimé'], accord: null, sautes: {} }], resume(plan({ rdvs: [rdv('r1', '09:00')] })));
dit('D3 le premier a 11 h : la journee aux trois, et la question a la direction',
  [{ planning: ['Gérard', 'Nassim', 'Aimé'], accord: { a: 'Yeman', pour: ['Gérard', 'Nassim', 'Aimé'] }, sautes: {} }], resume(plan({ rdvs: [rdv('r1', '11:00')] })));
dit('D4 aucun rendez-vous : pas de journee, la question part quand meme',
  [{ planning: [], accord: { a: 'Yeman', pour: ['Gérard', 'Nassim', 'Aimé'] }, sautes: {} }], resume(plan({})));
dit('D5 un rendez-vous annule a 9 h ne compte pas : la question part',
  true, !!plan({ rdvs: [rdv('r1', '09:00', 'annulé'), rdv('r2', '15:00')] })[0].accord);
dit('D6 la Maison fermee ce jour-la (dimanche) : rien', [{ planning: [], accord: null, sautes: { ferme: 1 } }], resume(plan({ jour: '2026-11-22', rdvs: [rdv('r1', '09:00', 'confirmé', { date: '2026-11-22' })] })));
dit('D7 une fermeture exceptionnelle : rien', [{ planning: [], accord: null, sautes: { ferme: 1 } }],
  resume(plan({ rdvs: [rdv('r1', '09:00')], exceptions: [{ date: J, closed: true }] })));
dit('D8 une fermeture d une seule personne ne ferme pas la Maison', ['Gérard', 'Nassim', 'Aimé'],
  plan({ rdvs: [rdv('r1', '09:00')], exceptions: [{ date: J, closed: true, staffId: 'st-g' }] })[0].planning.map((q) => q.appel));
dit('D9 au repos ce jour-la : il ne recoit rien', [{ planning: ['Gérard', 'Aimé'], accord: null, sautes: { 'au-repos': 1 } }],
  resume(plan({ rdvs: [rdv('r1', '09:00')], planning: { modele: { 'st-n': ['repos', 'fauteuil', 'fauteuil', 'fauteuil', 'fauteuil', 'fauteuil', 'repos'] } } })));
dit('D10 sans numero complet : il ne recoit rien', ['Gérard', 'Aimé'],
  plan({ rdvs: [rdv('r1', '09:00')], equipe: equipe.map((m) => (m.id === 'st-n' ? { ...m, phone: '123' } : m)) })[0].planning.map((q) => q.appel));
dit('D11 partie de la Maison : elle ne recoit rien', { 'partie': 1 },
  plan({ rdvs: [rdv('r1', '09:00')], equipe: equipe.map((m) => (m.id === 'st-a' ? { ...m, archiveeLe: '2026-11-01' } : m)) })[0].sautes);
dit('D12 sans decideur : pas de question, et il le dit', [null, { 'sans-decideur': 1 }],
  [plan({ reglages: reglagesDuMatin({ ...reglages, decideur: '' }) })[0].accord, plan({ reglages: reglagesDuMatin({ ...reglages, decideur: '' }) })[0].sautes]);
dit('D13 l appel par defaut : le premier mot du nom', 'Gerard',
  plan({ rdvs: [rdv('r1', '09:00')], reglages: reglagesDuMatin({ ...reglages, destinataires: [{ staffId: 'st-g' }] }) })[0].planning[0]?.appel);
dit('D14 la Maison ouverte un lundi, fermee un dimanche', [true, false], [ouvertCeJour(HEURES, [], J), ouvertCeJour(HEURES, [], '2026-11-22')]);
dit('D15 sans semaine connue : fermee', false, ouvertCeJour([], [], J));
/* Le samedi ouvre a 9 h : la journee part, la question non (« 9 h au lieu de 8 h » n'y a pas de sens). */
const SAMEDI = '2026-11-28';
const HEURES_DU_SAMEDI = HEURES.map((h) => (h.key === 'sam' ? { ...h, open: '09h00' } : h));
dit('D16 un samedi qui ouvre a 9 h, rien avant 11 h : la journee, pas de question',
  [{ planning: ['Gérard', 'Nassim', 'Aimé'], accord: null, sautes: { 'ouvre-apres-8-h': 1 } }],
  resume(plan({ jour: SAMEDI, hours: HEURES_DU_SAMEDI, rdvs: [rdv('s1', '14:00', 'confirmé', { date: SAMEDI })] })));
dit('D17 une exception qui ouvre a 10 h ce jour-la : pas de question non plus', null,
  plan({ exceptions: [{ date: J, open: '10h00' }] })[0].accord);
dit('D18 l ouverture du jour, en minutes', [480, 540, null], [ouvertureDuMatin(HEURES, [], J), ouvertureDuMatin(HEURES_DU_SAMEDI, [], SAMEDI), ouvertureDuMatin(HEURES, [], '2026-11-22')]);

/* ── E. LA REPONSE ──────────────────────────────────────────────────── */
const decideur = { staffId: 'st-y', appel: 'Yeman', numero: '2290151000014' };
const pour = plan({})[0].accord!.destinataires;
const p0 = nouvelleProposition({ jour: J, branchId: B_, maintenantMs: Date.UTC(2026, 10, 23, 5, 0), limite: '07:30', destinataires: pour, decideur });
const a7h = Date.UTC(2026, 10, 23, 6, 0); // 7 h a Cotonou
dit('E1 la proposition porte sa limite, 7 h 30 a Cotonou', new Date(Date.UTC(2026, 10, 23, 6, 30)).toISOString(), p0.limite);
dit('E2 ouverte a 7 h, fermee a 7 h 31', [true, false], [estOuverte(p0, a7h), estOuverte(p0, Date.UTC(2026, 10, 23, 6, 31))]);
dit('E3 10 h a 7 h, rien avant 11 h : oui', { ok: true, heure: 10 }, jugeLaReponse({ proposition: p0, heure: 10, maintenantMs: a7h, rdvsDuJour: [rdv('r', '11:00')] }));
dit('E4 apres 7 h 30 : trop tard, l equipe vient a 8 h', 'trop-tard', (jugeLaReponse({ proposition: p0, heure: 9, maintenantMs: Date.UTC(2026, 10, 23, 6, 45), rdvsDuJour: [] }) as { code?: string }).code);
dit('E5 deja choisie : rien ne change', 'deja', (jugeLaReponse({ proposition: { ...p0, etat: 'choisie', heure: 9 }, heure: 10, maintenantMs: a7h, rdvsDuJour: [] }) as { code?: string }).code);
dit('E6 un rendez-vous arrive a 9 h 30 depuis 6 h : non', 'un-rendez-vous', (jugeLaReponse({ proposition: p0, heure: 10, maintenantMs: a7h, rdvsDuJour: [rdv('n', '09:30')] }) as { code?: string }).code);
dit('E7 11 h ne se choisit pas', 'heure', (jugeLaReponse({ proposition: p0, heure: 11, maintenantMs: a7h, rdvsDuJour: [] }) as { code?: string }).code);
dit('E8 rien de propose : non', 'aucune', (jugeLaReponse({ proposition: null, heure: 9, maintenantMs: a7h, rdvsDuJour: [] }) as { code?: string }).code);
dit('E9 le mur : de 8 h a la demi-heure qui suit l arrivee', [{ debut: '08h00', fin: '09h30' }, { debut: '08h00', fin: '10h30' }], [murDeLArrivee(9), murDeLArrivee(10)]);
dit('E10 le mot du mur, lisible par une cliente', 'Ouverture plus tard', MOTIF_DU_MUR);
dit('E11 un mur par jour et par branche', 'equipe-tard-2026-11-23-br-maison', idDuMur(J, B_));
const e1 = avecLaProposition(etatDuMatin({ propositions: [] }), p0);
dit('E12 l etat garde la proposition du jour, une seule par branche', [1, 'proposee'],
  [avecLaProposition(e1, { ...p0, etat: 'choisie', heure: 9 }).propositions.length, laPropositionDe(e1, J, B_)?.etat]);
dit('E13 un etat mal ecrit se lit vide', { propositions: [] }, etatDuMatin({ propositions: [{ jour: J }] }));
const quinze = Array.from({ length: 16 }, (_, i): PropositionDuMatin => ({ ...p0, jour: `2026-11-${String(i + 1).padStart(2, '0')}` }));
dit('E14 quatorze matins gardes, les plus recents', ['2026-11-16', '2026-11-03'],
  ((e) => [e.propositions[0].jour, e.propositions[e.propositions.length - 1].jour])(quinze.reduce((e, x) => avecLaProposition(e, x), etatDuMatin({}))));

/* ── F. LA LETTRE ───────────────────────────────────────────────────── */
const SALLE_TYPE = TYPE_DE_L_EQUIPE_DU_MATIN;
dit('F1 la salle laisse l equipe du matin traverser les heures calmes, pas un rappel',
  [true, false, true], [traverseLesHeuresCalmes({ type: SALLE_TYPE }), traverseLesHeuresCalmes({ type: 'rappel-j1' }), traverseLesHeuresCalmes({ type: 'programme' })]);
const FACTEUR = lis('supabase/functions/envois-partent/index.ts');
dit('F2 le facteur aussi', [true, true],
  [FACTEUR.includes("export const TYPE_DE_L_EQUIPE_DU_MATIN = 'equipe-du-matin';"),
    FACTEUR.includes('(!calme || l.data.parLaMain === true || l.data.type === TYPE_PROGRAMME || l.data.type === TYPE_DE_L_EQUIPE_DU_MATIN))')]);
const WEB = lis('supabase/functions/whatsapp-webhook/index.ts');
dit('F3 le webhook : l automate ne lit pas le bouton, la sonnerie non plus', [true, true],
  [WEB.includes('        if (lisLeBoutonDeLEquipe(e.bouton?.id)) continue;\n'), WEB.includes('&& !lisLeBoutonDeLEquipe(e.bouton?.id))\n')]);
dit('F4 le webhook rend le bouton a la fonction, avec le numero qui a touche', true,
  /functions\/v1\/equipe-du-matin`[\s\S]{0,400}body: JSON\.stringify\(\{ geste: 'repondre', jour: b\.jour, heure: b\.heure, numero: e\.numero \}\)/.test(WEB));
const FN = lis('supabase/functions/equipe-du-matin/index.ts');
dit('F5 la fonction signe de la devise de la Maison', true, FN.includes(`const DEVISE = '${DEVISE_COMPLETE}';`));
dit('F6 la fonction lit ses trois modeles par leurs secrets', [true, true, true],
  ['WA_TEMPLATE_PLANNING_DU_JOUR', 'WA_TEMPLATE_EQUIPE_PLUS_TARD', 'WA_TEMPLATE_VENIR_PLUS_TARD'].map((s) => FN.includes(`Deno.env.get('${s}')`)));
const iMur = FN.indexOf("sb.from('blocages').upsert(");
const iArrivee = FN.indexOf("genre: 'arrivee', staffId: d.staffId");
dit('F7 la reponse pose le mur AVANT de prevenir l equipe', true, iMur > 0 && iArrivee > iMur);
dit('F8 le Trone ne repond que pour la direction', true, FN.includes("if (errDirection || estDirection !== true) return json({ erreur: 'Réservé à la direction.' }, 403);"));
dit('F9 par WhatsApp, seul le numero questionne repond', true, FN.includes('x.numeroDuDecideur.slice(-8) === numeroDuMatin(o.numero).slice(-8)'));
dit('F10 le choix se prend sur l etat du moment (une seule reponse gagne)', true,
  /changeLEtat\(sb, \(e\) => \{\n\s+const cur = laPropositionDe\(e, jour, p\.branchId\);\n\s+return cur && cur\.etat === 'proposee' \? avecLaProposition\(e, choisie\) : null;/.test(FN));
const SQL = lis('supabase/migrations/0243_l_equipe_du_matin.sql');
dit('F11 la migration : le reveil a 05:00 UTC, 6 h a Cotonou', true, SQL.includes("select cron.schedule('equipe-du-matin', '0 5 * * *',"));
dit('F12 la migration : le document du matin, que la fonction seule ecrit', [true, true, true],
  ['as restrictive for insert to anon, authenticated\n  with check (key <> \'mnd_equipe_du_matin\');',
    'as restrictive for update to anon, authenticated\n  using (key <> \'mnd_equipe_du_matin\')',
    'as restrictive for delete to anon, authenticated\n  using (key <> \'mnd_equipe_du_matin\');'].map((s) => SQL.includes(s)));
const PAGE = lis('src/apps/trone/routes/clients/Gerard.tsx');
dit('F13 la page : la question en tete de « A faire maintenant », deux boutons', [true, true, true],
  [PAGE.includes('<strong>L’équipe plus tard ?</strong>'), PAGE.includes('{HEURES_PLUS_TARD.map((h) => ('), PAGE.includes('void repondsLeMatin(h);')]);
dit('F14 la page : la question seulement pour la direction, tant qu elle est ouverte', true,
  PAGE.includes('const questionDuMatin = direction && estOuverte(propositionDuMatin, maintenantMatin) ? propositionDuMatin : null;'));
dit('F15 les Reglages : qui recoit, qui repond, la limite', [true, true, true],
  [PAGE.includes('<h3>L’équipe le matin</h3>'), PAGE.includes('« À 9 h » ou « À 10 h » : la question va à'), PAGE.includes('<span>Sans réponse à</span>')]);
const PUR = lis('src/shared/equipe-du-matin-pur.ts');
dit('F16 pas de tiret cadratin dans les regles ni la fonction', [false, false], [PUR.includes('—'), FN.split('/* ⟨arret-d-avance⟩ */')[0].includes('—')]);

console.log(`\n${vus} epreuves, ${ko} en echec.`);
if (ko > 0) process.exitCode = 1;
else console.log('L equipe du matin tient.');
