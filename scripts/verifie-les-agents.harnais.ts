/* LES AGENTS, LES PROCESSUS ET L'ASSISTANT, ÉPROUVÉS — `node scripts/verifie-les-agents.mjs`.

   24 octobre 2026 : « Embedded AI assistant to build processes », « AI
   agents » (Yéman), maquette VJ5PJEGUPDbYKUgEdMUNbS, « Construire le reste ».
   Choix au sélecteur : il propose, vous activez ; chaque envoi garde son oui ;
   encaissements et reprises d'abord ; jusqu'à 120 $. Les règles
   (processus-pur, ia-tableau-pur, ia-maison-pur) et l'écran (texte). Tout est
   inventé. Sortie ASCII : la console de Windows. */
import {
  AUDIENCES_DES_PROCESSUS, MESSAGE_DES_REPRISES, compteRendu, dernierCreneau, derniersContacts, deuxPlaces, idDuPassage,
  listeDuPassage, messageDeLaLigne, nettoieLeProcessus, passageAFaire, passagesGardes, placeDite, prochainCreneau,
  statsDuProcessus, type Passage, type Processus, type TeteDuProcessus,
} from '../src/shared/processus-pur';
import { demandeDExplication, demandeDeProcessus, demandeDeQuestion, explicationLisible } from '../src/shared/ia-tableau-pur';
import { CHANTIERS_IA, PLAFOND_DES_HUIT_USD, defautDeLaDemande, peutDemander, saitLeTableauIntelligent } from '../src/shared/ia-maison-pur';
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
const sansCommentaires = (f: string) => readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\s+/g, ' ');

const SAMEDI = '2026-10-24';
const proc = (o: Partial<Processus> = {}): Processus => ({
  id: 'agent-reprises', branchId: 'b1', nom: 'Les reprises du lundi', actif: true, actifDepuis: '2026-10-01T10:00', jours: [1], heure: '09:00',
  audience: 'reprises', delaiJours: 10, avecPlaces: true, message: MESSAGE_DES_REPRISES, agent: 'reprises', creePar: 'Y.', creeLe: '2026-10-01T10:00', ...o,
});

/* ── 1. QUAND ─────────────────────────────────────────────────────────── */
dit('le dernier creneau du : le lundi d avant, a son heure', '2026-10-19T09:00', dernierCreneau(proc(), SAMEDI, 14 * 60));
dit('le lundi meme, avant 9 h : pas encore (et rien dans les sept jours d avant)', null, dernierCreneau(proc(), '2026-10-26', 8 * 60));
dit('le lundi meme, a 9 h passees : ce lundi', '2026-10-26T09:00', dernierCreneau(proc(), '2026-10-26', 9 * 60 + 5));
dit('le prochain creneau se dit', '2026-10-26T09:00', prochainCreneau(proc(), SAMEDI, 14 * 60));
dit('un passage : allume, du, pas encore fait', '2026-10-19T09:00', passageAFaire(proc(), [], SAMEDI, 14 * 60));
dit('eteint : rien', null, passageAFaire(proc({ actif: false }), [], SAMEDI, 14 * 60));
dit('allume apres le creneau : il ne rattrape pas d avant son allumage', null, passageAFaire(proc({ actifDepuis: '2026-10-22T10:00' }), [], SAMEDI, 14 * 60));
dit('deja fait (meme identifiant) : rien', null, passageAFaire(proc(), [{ id: idDuPassage('b1', 'agent-reprises', '2026-10-19T09:00') }], SAMEDI, 14 * 60));
dit('l identifiant d un passage porte sa branche : deux branches ne se marchent pas dessus', ['b1|agent-reprises@2026-10-19T09:00', true],
  [idDuPassage('b1', 'agent-reprises', '2026-10-19T09:00'), idDuPassage('b1', 'p', 'c') !== idDuPassage('b2', 'p', 'c')]);

/* ── 2. QUI ───────────────────────────────────────────────────────────── */
const t = (o: Partial<TeteDuProcessus>): TeteDuProcessus => ({ clientId: 'x', aVenir: false, venues: ['2026-06-01', '2026-08-01'], retardJours: 0, ...o });
const tetes: TeteDuProcessus[] = [
  t({ clientId: 'a', retardJours: 25 }),
  t({ clientId: 'b', retardJours: 12 }),
  t({ clientId: 'c', retardJours: 9 }), // sous le delai
  t({ clientId: 'd', retardJours: 40, aVenir: true }), // un rendez-vous pose
  t({ clientId: 'e', retardJours: 40, ecartee: true }), // diaspora, passante, locks defaits
  t({ clientId: 'f', retardJours: 30, dernierContact: '2026-10-10' }), // ecrite il y a 14 jours
  t({ clientId: 'g', retardJours: 30, dernierContact: '2026-09-01' }), // ecrite il y a 53 jours
];
dit('les reprises : le retard au moins egal au delai, sans rendez-vous, sans ecartees, pas ecrites dans les 30 jours ; les plus en retard d abord',
  ['g', 'a', 'b'], listeDuPassage(proc(), tetes, SAMEDI).map((l) => l.clientId));
dit('la raison se dit en clair', '25 jours de retard sur sa reprise', listeDuPassage(proc(), tetes, SAMEDI).find((l) => l.clientId === 'a')!.raison);
dit('vingt lignes au plus', 20, listeDuPassage(proc(), Array.from({ length: 30 }, (_, i) => t({ clientId: `z${i}`, retardJours: 15 + i })), SAMEDI).length);
dit('une seule venue, il y a au moins N jours', ['u1'],
  listeDuPassage({ audience: 'une-venue', delaiJours: 60 }, [t({ clientId: 'u1', venues: ['2026-07-01'] }), t({ clientId: 'u2', venues: ['2026-10-01'] }), t({ clientId: 'u3', venues: ['2026-05-01', '2026-06-01'] })], SAMEDI).map((l) => l.clientId));
dit('les dormantes : derniere venue il y a au moins N jours', ['d1'],
  listeDuPassage({ audience: 'dormantes', delaiJours: 90 }, [t({ clientId: 'd1', venues: ['2026-03-01', '2026-06-01'] }), t({ clientId: 'd2', venues: ['2026-09-01'] })], SAMEDI).map((l) => l.clientId));
dit('les anniversaires des 7 jours, meme a cheval sur l annee', ['n2', 'n1'],
  listeDuPassage({ audience: 'anniversaires', delaiJours: 0 }, [t({ clientId: 'n1', anniversaire: '01-02' }), t({ clientId: 'n2', anniversaire: '12-30' }), t({ clientId: 'n3', anniversaire: '01-15' })], '2026-12-29').map((l) => l.clientId).sort().reverse());

/* ── 3. QUOI ──────────────────────────────────────────────────────────── */
dit('une place se dit avec son jour et son annee', ['mardi 27 octobre 2026 à 10 h', 'dimanche 1er novembre 2026 à 14 h 30'],
  [placeDite('2026-10-27', '10:00'), placeDite('2026-11-01', '14:30')]);
dit('deux places, deux jours : la premiere heure de chacun', [{ iso: '2026-10-27', heure: '09:00' }, { iso: '2026-10-29', heure: '10:00' }],
  deuxPlaces([{ iso: '2026-10-25', heures: [] }, { iso: '2026-10-27', heures: ['09:00', '11:00'] }, { iso: '2026-10-29', heures: ['10:00'] }]));
dit('un seul jour libre : le matin et l apres-midi', [{ iso: '2026-10-27', heure: '09:00' }, { iso: '2026-10-27', heure: '14:00' }],
  deuxPlaces([{ iso: '2026-10-27', heures: ['09:00', '10:00', '14:00'] }]));
dit('aucune place : aucune promesse', [], deuxPlaces([{ iso: '2026-10-27', heures: [] }]));
dit('le message avec deux places', 'Bonjour Awa, votre couronne vous attend chez Maison MND. Deux places sont libres pour vous : mardi 27 octobre 2026 à 9 h, ou jeudi 29 octobre 2026 à 10 h. Dites-nous ce qui vous convient.',
  messageDeLaLigne(MESSAGE_DES_REPRISES, { appel: 'Awa', avecPlaces: true, places: [{ iso: '2026-10-27', heure: '09:00' }, { iso: '2026-10-29', heure: '10:00' }] }));
dit('sans place libre : une invitation simple, pas une heure inventee', true,
  messageDeLaLigne(MESSAGE_DES_REPRISES, { appel: 'Madame Naffi', avecPlaces: true, places: [] }).includes('Nous vous trouvons une place dès que vous nous dites le jour qui vous va.'));
dit('sans places demandees : la phrase disparait, sans double espace', 'Bonjour Awa, votre couronne vous attend chez Maison MND. Dites-nous ce qui vous convient.',
  messageDeLaLigne(MESSAGE_DES_REPRISES, { appel: 'Awa', avecPlaces: false, places: [{ iso: '2026-10-27', heure: '09:00' }] }));

/* ── 4. CE QU ILS ONT FAIT ───────────────────────────────────────────── */
const passage = (o: Partial<Passage> = {}): Passage => ({
  id: 'p1', processusId: 'agent-reprises', branchId: 'b1', prevuA: '2026-10-19T09:00', faitLe: '2026-10-19T09:30',
  lignes: [
    { clientId: 'a', raison: '', statut: 'ecrit', le: '2026-10-19T10:00' },
    { clientId: 'b', raison: '', statut: 'pose', le: '2026-10-19T10:05' },
    { clientId: 'c', raison: '', statut: 'ecarte', le: '2026-10-19T10:06' },
    { clientId: 'd', raison: '', statut: 'a-valider' },
  ], ...o,
});
dit('les comptes d un processus', { passages: 1, proposes: 4, ecrits: 1, poses: 1, ecartes: 1, aValider: 1 }, statsDuProcessus([passage()], 'agent-reprises'));
dit('le compte rendu : qui a reserve depuis, parmi les ecrites', { ecrites: 2, reserve: 2, sansReponse: 0 }, compteRendu(passage(), (id) => id === 'a'));
dit('le compte rendu, quand personne n a repondu', { ecrites: 2, reserve: 1, sansReponse: 1 }, compteRendu(passage(), () => false));
dit('deux mois de memoire, pas plus', ['p-recent'], passagesGardes([passage({ id: 'p-vieux', prevuA: '2026-08-01T09:00' }), passage({ id: 'p-recent' })], SAMEDI).map((x) => x.id));
dit('le dernier contact, d apres les lignes ecrites ou posees', [['a', '2026-10-19'], ['b', '2026-10-19']], [...derniersContacts([passage()]).entries()]);

/* ── 5. CE QUE CLAUDE PROPOSE N EST JAMAIS CRU TEL QUEL ──────────────── */
dit('une audience que le Trone ne sait pas calculer : refus, et la liste de ce qu il sait', [false, true],
  (() => { const r = nettoieLeProcessus({ audience: 'toutes-les-clientes' }); return [r.ok, !r.ok && r.raison.includes('les reprises en retard')]; })());
dit('les bornes : jours de la semaine, heure hors des heures calmes, delai de 7 a 365, {appel} garde, pas de tiret cadratin',
  { nom: 'Les relances du vendredi', jours: [5], heure: '09:00', audience: 'une-venue', delaiJours: 365, avecPlaces: false, message: 'Bonjour {appel}, la Maison pense à vous, à bientôt.' },
  (() => { const r = nettoieLeProcessus({ nom: 'Les relances du vendredi', jours: [5, 9, 'x'], heure: '22:00', audience: 'une-venue', delaiJours: 900, message: 'La Maison pense à vous — à bientôt.' }); return r.ok ? r.processus : r; })());
dit('les anniversaires n ont pas de delai ; sans jour, le lundi', [0, [1]], (() => { const r = nettoieLeProcessus({ audience: 'anniversaires', delaiJours: 30 }); return r.ok ? [r.processus.delaiJours, r.processus.jours] : null; })());
dit('la question a eclaircir remonte', 'Le matin ou l apres-midi ?', (() => { const r = nettoieLeProcessus({ audience: 'reprises', aClarifier: 'Le matin ou l apres-midi ?' }); return r.ok ? r.aClarifier : ''; })());

/* ── 6. LA PORTE ET CE QUI PART CHEZ CLAUDE ──────────────────────────── */
dit('trois chantiers de plus a la porte', true, ['prevision', 'question', 'processus'].every((c) => (CHANTIERS_IA as readonly string[]).includes(c)));
dit('la direction seule : un maitre, meme avec la Direction cochee, ne les demande pas', [true, true, false],
  [peutDemander('souverain', 'question', {}), peutDemander('gerant', 'processus', {}), peutDemander('maitre', 'prevision', { 'dept-direction': true })]);
dit('120 $ par mois (jusqu a 120 $ au selecteur), et le Trone ne propose qu a la fonction qui le sait', [120, true, false],
  [PLAFOND_DES_HUIT_USD, saitLeTableauIntelligent('2026-10-24-a'), saitLeTableauIntelligent('2026-10-19-a')]);
const expl = demandeDExplication({ mois: 'octobre 2026', aujourdhui: '24 oct. 2026', centrale: '3 840 000 F', bas: '3 630 000 F', haut: '4 030 000 F', parts: [{ cle: 'rdv', dit: '14 rendez-vous posés…' }], moisPasses: ['septembre 2026 : 3 120 000 F'] });
dit('l explication : recevable par la porte, une phrase et deux gestes chiffres, sans refaire le calcul', [null, 'prevision', 'texte', ['phrase', 'gestes'], true],
  [defautDeLaDemande(expl), expl.chantier, expl.usage, (expl.schema as { required: string[] }).required, expl.systeme.includes('Ne refais pas le calcul') && expl.systeme.includes('des chiffres, pas du texte')]);
const q = demandeDeQuestion('Pourquoi novembre est calme ?', { aujourdhui: '24 oct. 2026', jour: '6 rendez-vous', prevision: ['Fin du mois : 3 840 000 F.'] },
  [{ role: 'user', content: 'a' }, { role: 'assistant', content: 'b' }, { role: 'user', content: 'c' }, { role: 'assistant', content: 'd' }, { role: 'user', content: 'e' }, { role: 'assistant', content: 'f' }]);
dit('la question : recevable, le contexte dans la consigne, quatre tours d avant au plus, la question en dernier', [null, 'question', true, 5, 'Pourquoi novembre est calme ?'],
  [defautDeLaDemande(q), q.chantier, q.systeme.includes('Fin du mois : 3 840 000 F.'), q.messages.length, q.messages[q.messages.length - 1].content]);
dit('les regles de la Maison partent avec chaque demande', true,
  [expl, q].every((d) => d.systeme.includes('jamais « salon »') && d.systeme.includes('Jamais de tiret cadratin') && d.systeme.includes('N’invente AUCUN chiffre')));
const pr = demandeDeProcessus('chaque lundi relance celles qui ont glissé');
dit('le processus : recevable, et Claude ne peut choisir qu une audience du Trone', [null, 'processus', AUDIENCES_DES_PROCESSUS.map((a) => a.cle)],
  [defautDeLaDemande(pr), pr.chantier, ((pr.schema as { properties: { audience: { enum: string[] } } }).properties.audience.enum)]);
dit('une explication de travers ne s affiche pas ; une bonne perd ses tirets et se borne', [null, { phrase: 'Fin du mois haute, grâce aux samedis.', raisons: ['a', 'b', 'c'], gestes: ['x', 'y'] }],
  [explicationLisible({ raisons: [] }), explicationLisible({ phrase: 'Fin du mois haute — grâce aux samedis.', raisons: ['a', 'b', 'c', 'd'], gestes: ['x', 'y', 'z'] })]);

/* ── 7. L ECRAN, LA BARRE, LE TABLEAU DE BORD (texte) ─────────────────── */
const agents = sansCommentaires('src/apps/trone/routes/pilotage/Agents.tsx');
const index = readFileSync('src/apps/trone/routes/index.tsx', 'utf8');
const demander = sansCommentaires('src/apps/trone/routes/pilotage/DemanderALaMaison.tsx');
const avalider = sansCommentaires('src/apps/trone/routes/pilotage/AValiderDesAgents.tsx');
const tableau = sansCommentaires('src/apps/trone/routes/pilotage/Dashboard.tsx');
const fonction = readFileSync('supabase/functions/ia-maison/index.ts', 'utf8');
dit('Les agents : un onglet du Centre de commande, pour les souverains seuls', [true, true, true],
  [/ROUTES_SOUVERAIN = \[[^\]]*'\/agents'/.test(index), /hote: '\/centre-de-commande'[^\n]*path: '\/agents'/.test(index), /ECRANS_NES_APRES_LES_DEPARTEMENTS[^\n]*'\/agents'/.test(index)]);
dit('rien ne part seul : WhatsApp s ouvre avec le message, c est elle qui envoie', [true, false, false],
  [/<a className="mnd-btn mnd-btn--copper mnd-btn--sm" href=\{lien\} target="_blank" rel="noreferrer" onClick=\{\(\) => poseLeStatut\(passage\.id, l\.clientId, 'ecrit', monNom\)\}>Écrire sur WhatsApp<\/a>/.test(agents),
    agents.includes('envoieSurWhatsApp'), agents.includes('functions.invoke')]);
dit('le message passe par la civilite et la devise', true, agents.includes('signeLeMessage(messageDeLaLigne(modele, { appel: appelDe(c ?? null, c?.name)'));
dit('ce que l assistant propose repasse par les briques du Trone avant de s afficher', true, /const n = nettoieLeProcessus\(r\.data as Record<string, unknown>\);[^}]*if \(!n\.ok\)/.test(agents));
dit('le gardien de la marque relit chaque message, un prix bloque', [true, true],
  [(agents.match(/relisLaMarque\([a-z.]*message, \{ campagne: true \}\)/g) ?? []).length === 2, agents.includes('if (bloquant(remarques))')]);
dit('les passages ne se font que pour un souverain', [true, true], [agents.includes('useLancePassagesDus(estSouverain, processus, passages, tetes)'), avalider.includes("if (monProfil?.role !== 'souverain') return null;")]);
dit('au tableau de bord : Demander a la Maison et A valider', [true, true], [tableau.includes('<DemanderALaMaison prevision={prevDuMois} jour={jourPourLAssistant} />'), tableau.includes('<AValiderDesAgents />')]);
dit('chez Claude, jamais le texte d une tache (il pourrait nommer une cliente)', true, demander.includes("texte: '', projetId: m.projetId"));
dit('la fonction se dit 2026-10-24-a et connait les trois chantiers', [true, true],
  [fonction.includes("const VERSION = '2026-10-24-a';"), fonction.includes("'fiche-du-jour', 'lettre', 'prevision', 'question', 'processus'] as const;")]);
dit('pas de tiret cadratin dans ce que les ecrans disent', [false, false, false], [agents.includes('—'), demander.includes('—'), avalider.includes('—')]);

console.log(`\n${n - ko}/${n} verifications`);
