/* LES PROJETS, ÉPROUVÉS — `node scripts/verifie-les-projets.mjs`.

   24 octobre 2026 : « Ajouter la Gestion des projets : planification,
   affectation des ressources, et suivi des tâches » (Yéman), maquette
   VJ5PJEGUPDbYKUgEdMUNbS, « construis » le même soir. Choix au sélecteur :
   sous Direction, ouverts par les souverains, la charge en NOMBRE de tâches,
   la Liste d'abord. La règle (shared/projets-pur.ts) et l'écran (texte).
   Tout est inventé. Sortie ASCII : la console de Windows. */
import {
  avancementDe, colonneDe, dateCourte, etatDuJalon, etatDuProjet, fenetreDu, filtreLesProjets, lundiDe,
  memeMain, moisDeLaFenetre, positionDans, prochaineEtape, projetIncomplet, propositionDeConfier,
  seancesParSemaine, sectionDeMaTache, tachesParSemaine, type Projet, type TacheDuProjet,
} from '../src/shared/projets-pur';
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

const AUJ = '2026-10-24'; // un samedi
const t = (o: Partial<TacheDuProjet>): TacheDuProjet => ({ id: 'x', texte: 'Une tache', projetId: 'prj-1', close: false, ...o });
const projet = (o: Partial<Projet> = {}): Projet => ({
  id: 'prj-1', branchId: 'b1', nom: 'Ouverture de la Boutique', departement: 'Vente & Caisse',
  piloteMail: 'yeman@maison.test', piloteNom: 'Yeman', debut: '2026-10-19', fin: '2026-11-15',
  jalons: [{ id: 'j1', nom: 'Articles poses', date: '2026-10-31' }, { id: 'j2', nom: 'Ouverture', date: '2026-11-15' }],
  statut: 'actif', creeAt: '2026-10-19T09:00', creePar: 'Yeman', ...o,
});

/* ── Les dates ──────────────────────────────────────────────────────── */
dit('le lundi d un samedi, d un lundi, d un dimanche', ['2026-10-19', '2026-10-26', '2026-10-26'],
  [lundiDe('2026-10-24'), lundiDe('2026-10-26'), lundiDe('2026-11-01')]);
dit('une date dit toujours son annee, et le premier du mois', ['31 oct. 2026', '1er nov. 2026', '4 janv. 2027'],
  [dateCourte('2026-10-31'), dateCourte('2026-11-01'), dateCourte('2027-01-04')]);

/* ── L avancement et l etat ─────────────────────────────────────────── */
dit('avancement : faites sur total, en pourcents', { faites: 4, total: 9, pct: 44 },
  avancementDe([...Array(4)].map(() => t({ close: true })).concat([...Array(5)].map(() => t({})))));
dit('un projet sans tache : zero, sans division par zero', { faites: 0, total: 0, pct: 0 }, avancementDe([]));
dit('en attente : il attend votre oui, quoi que disent ses taches', 'oui',
  etatDuProjet(projet({ statut: 'attente' }), [t({ echeance: '2026-10-01' })], AUJ));
dit('clos reste clos', 'clos', etatDuProjet(projet({ statut: 'clos' }), [], AUJ));
dit('une tache ouverte passee : en retard', 'retard', etatDuProjet(projet(), [t({ echeance: '2026-10-23' })], AUJ));
dit('une tache passee mais faite : a l heure', 'heure', etatDuProjet(projet(), [t({ echeance: '2026-10-23', close: true })], AUJ));
dit('un jalon passe qui garde une tache ouverte : en retard', 'retard',
  etatDuProjet(projet({ jalons: [{ id: 'j0', nom: 'Devis', date: '2026-10-21' }] }), [t({ jalonId: 'j0' })], AUJ));
dit('la fin passee avec du travail ouvert : en retard', 'retard', etatDuProjet(projet({ fin: '2026-10-20', jalons: [] }), [t({})], AUJ));
dit('rien de passe : a l heure', 'heure', etatDuProjet(projet(), [t({ echeance: '2026-10-30' }), t({})], AUJ));
dit('un jalon est atteint quand toutes ses taches sont faites, et qu il en a', [true, false, false],
  [etatDuJalon({ id: 'j1', nom: 'a', date: '2026-10-31' }, [t({ jalonId: 'j1', close: true })]).atteint,
    etatDuJalon({ id: 'j1', nom: 'a', date: '2026-10-31' }, [t({ jalonId: 'j1', close: true }), t({ jalonId: 'j1' })]).atteint,
    etatDuJalon({ id: 'j9', nom: 'vide', date: '2026-10-31' }, []).atteint]);
dit('la prochaine etape : la plus pressee des ouvertes, les sans-date apres (meme vides)', 'b',
  prochaineEtape([t({ id: 'c0', echeance: '' }), t({ id: 'a', echeance: '2026-11-04' }), t({ id: 'b', echeance: '2026-10-28' }), t({ id: 'c' }), t({ id: 'd', echeance: '2026-10-20', close: true })])?.id);

/* ── Le tableau : des colonnes qui se calculent, sans etat coche ───── */
dit('les colonnes se lisent dans l echeance, sept jours des aujourd hui (samedi 24 octobre 2026)', ['retard', 'semaine', 'semaine', 'semaine', 'plus-tard', 'sans-date', 'fait'],
  [t({ echeance: '2026-10-23' }), t({ echeance: '2026-10-24' }), t({ echeance: '2026-10-26' }), t({ echeance: '2026-10-30' }), t({ echeance: '2026-10-31' }), t({}), t({ close: true, echeance: '2026-10-01' })]
    .map((x) => colonneDe(x, AUJ)));

/* ── Mes taches, au telephone ──────────────────────────────────────── */
dit('mes taches : le retard et aujourd hui ensemble en tete, puis sept jours, plus tard, sans date', ['maintenant', 'maintenant', 'semaine', 'semaine', 'plus-tard', 'sans-date', 'sans-date'],
  ['2026-10-20', '2026-10-24', '2026-10-25', '2026-10-30', '2026-10-31', undefined, ''].map((e) => sectionDeMaTache(e, AUJ)));

/* ── L equipe : des nombres de taches, jamais des heures ──────────── */
/* Quatre fenetres de sept jours ; ici elles partent d un lundi, l ecran les fait partir d aujourd hui. */
const LUNDIS = ['2026-10-19', '2026-10-26', '2026-11-02', '2026-11-09'];
const M = [{ mail: 'aimer@maison.test', nom: 'Aimer' }, { mail: 'nassim@maison.test', nom: 'Nassim' }];
const charge = tachesParSemaine([
  t({ id: '1', demandePour: 'Aimer@maison.test', echeance: '2026-10-10' }), // en retard : pese sur cette semaine
  t({ id: '2', demandePour: 'aimer@maison.test', echeance: '2026-10-28' }),
  t({ id: '3', demandePour: 'aimer@maison.test', echeance: '2026-10-29' }),
  t({ id: '4', demandePour: 'aimer@maison.test', echeance: '2026-10-30' }),
  t({ id: '5', demandePour: 'aimer@maison.test', echeance: '2026-10-31' }),
  t({ id: '6', demandePour: 'aimer@maison.test', echeance: '2026-10-27', close: true }), // faite : ne pese plus
  t({ id: '7', demandePour: 'aimer@maison.test' }), // sans date : a part
  t({ id: '8', demandePour: 'nassim@maison.test', echeance: '2026-10-27' }),
], M, LUNDIS);
dit('les taches ouvertes par semaine ; le retard pese sur la premiere ; les faites ne pesent plus',
  [{ mail: 'aimer@maison.test', nom: 'Aimer', parSemaine: [1, 4, 0, 0], sansDate: 1 }, { mail: 'nassim@maison.test', nom: 'Nassim', parSemaine: [0, 1, 0, 0], sansDate: 0 }],
  charge);
dit('les seances se rapprochent par le prenom, sans accents ni casse ; les annulees ne comptent pas', [2, 1, 0, 0],
  seancesParSemaine([
    { date: '2026-10-21', status: 'confirmé', master: 'Gérard' },
    { date: '2026-10-22', status: 'honoré', master: 'gerard' },
    { date: '2026-10-23', status: 'annulé', master: 'Gérard' },
    { date: '2026-10-27', status: 'confirmé', master: 'Gerard D.' },
    { date: '2026-10-27', status: 'confirmé', master: 'Aimer' },
  ], 'Gérard Dossou', LUNDIS));
dit('memeMain ne rapproche pas un nom vide', false, memeMain('', ''));
dit('l ecart de trois : le Trone propose de confier la plus lointaine des taches de la plus chargee', { semaine: '2026-10-26', tacheId: '5', de: 'Aimer', a: 'Nassim', avant: [4, 1] },
  (() => { const p = propositionDeConfier(charge, [
    t({ id: '1', demandePour: 'aimer@maison.test', echeance: '2026-10-10' }),
    t({ id: '2', demandePour: 'aimer@maison.test', echeance: '2026-10-28' }),
    t({ id: '3', demandePour: 'aimer@maison.test', echeance: '2026-10-29' }),
    t({ id: '4', demandePour: 'aimer@maison.test', echeance: '2026-10-30' }),
    t({ id: '5', demandePour: 'aimer@maison.test', echeance: '2026-10-31' }),
  ], LUNDIS); return p && { semaine: p.semaine, tacheId: p.tacheId, de: p.de.nom, a: p.a.nom, avant: p.avant }; })());
dit('un ecart de deux : le Trone ne propose rien', null,
  propositionDeConfier([{ mail: 'a', nom: 'A', parSemaine: [3, 0, 0, 0] }, { mail: 'b', nom: 'B', parSemaine: [1, 0, 0, 0] }],
    [t({ id: 'z', demandePour: 'a', echeance: '2026-10-24' })], LUNDIS));
dit('une demande hors projet ne se propose jamais', null,
  propositionDeConfier([{ mail: 'a', nom: 'A', parSemaine: [4, 0, 0, 0] }, { mail: 'b', nom: 'B', parSemaine: [0, 0, 0, 0] }],
    [t({ id: 'z', projetId: undefined, demandePour: 'a', echeance: '2026-10-24' })], LUNDIS));

/* ── Le calendrier ─────────────────────────────────────────────────── */
const F = fenetreDu([projet(), projet({ debut: '2026-12-01', fin: '2027-01-25' })], AUJ);
dit('la fenetre va du lundi du premier debut au dimanche de la derniere fin', { debut: '2026-10-19', fin: '2027-01-31' }, F);
dit('les positions sont bornees de 0 a 100', [0, 100, true], [positionDans(F, '2026-01-01'), positionDans(F, '2028-01-01'), positionDans(F, AUJ) > 0 && positionDans(F, AUJ) < 10]);
dit('les mois de la fenetre ; janvier dit son annee', ['oct.', 'nov.', 'déc.', 'janv. 2027'], moisDeLaFenetre(F).map((m) => m.nom));

/* ── Les filtres et la fenetre d un projet ─────────────────────────── */
const P = [projet({ id: 'a' }), projet({ id: 'b', piloteMail: 'brice@maison.test', statut: 'attente' }), projet({ id: 'c', statut: 'clos' })];
dit('tous : les clos sortent ; les miens : par le pilote ; a regarder : ce qui n est pas a l heure', [['a', 'b'], ['a'], ['b']],
  [filtreLesProjets(P, 'tous', 'yeman@maison.test', () => 'heure').map((p) => p.id),
    filtreLesProjets(P, 'miens', 'YEMAN@maison.test', () => 'heure').map((p) => p.id),
    filtreLesProjets(P, 'attention', 'x', (p) => (p.statut === 'attente' ? 'oui' : 'heure')).map((p) => p.id)]);
dit('un projet se tient : nom, pilote, dates dans l ordre, jalons nommes', ['Donnez un nom au projet.', 'Choisissez le pilote.', 'La fin vient avant le début.', 'Chaque jalon a un nom et une date.', null],
  [projetIncomplet({ nom: ' ', piloteMail: 'a', debut: '2026-10-01', fin: '2026-10-02', jalons: [] }),
    projetIncomplet({ nom: 'A', piloteMail: '', debut: '2026-10-01', fin: '2026-10-02', jalons: [] }),
    projetIncomplet({ nom: 'A', piloteMail: 'a', debut: '2026-10-05', fin: '2026-10-02', jalons: [] }),
    projetIncomplet({ nom: 'A', piloteMail: 'a', debut: '2026-10-01', fin: '2026-10-02', jalons: [{ id: 'j', nom: '', date: '2026-10-02' }] }),
    projetIncomplet({ nom: 'A', piloteMail: 'a', debut: '2026-10-01', fin: '2026-10-02', jalons: [{ id: 'j', nom: 'J', date: '2026-10-02' }] })]);

/* ── L ecran, la barre et le Tableau (texte) ───────────────────────── */
const ecran = sansCommentaires('src/apps/trone/routes/pilotage/Projets.tsx');
const index = readFileSync('src/apps/trone/routes/index.tsx', 'utf8');
const pur = sansCommentaires('src/shared/projets-pur.ts');
const store = sansCommentaires('src/shared/projets.ts');
const tableau = sansCommentaires('src/apps/trone/routes/equipe/Tableau.tsx');
dit('Les projets sont ranges sous Direction', true, /group: 'Direction'[\s\S]{0,2500}path: '\/projets'/.test(index));
dit('l ecran est nomme parmi les ecrans nes apres les departements', true, /ECRANS_NES_APRES_LES_DEPARTEMENTS[^\n]*'\/projets'/.test(index));
dit('une tache est une demande du Fil : posee par nouveauMessage, dans le fil de la Maison, avec son projet', true,
  /filStore\.set\(\(prev\) => \[\.\.\.prev, nouveauMessage\(\{[^}]*canal: CANAL_MAISON[^}]*projetId: p\.id/.test(ecran));
dit('le projet ne garde aucune tache : son type n a pas de liste de taches', false, /export type Projet = \{[^}]*taches/.test(pur));
dit('le magasin des projets est un document partage, mnd_projets', true, store.includes("bindDocument(projetsStore, 'mnd_projets')"));
dit('seuls les souverains ouvrent un projet', true, /estSouverain \? <Button variant="copper" onClick=\{\(\) => setEdition\('nouveau'\)\}>Nouveau projet/.test(ecran));
dit('confier : par le pilote ou la direction, et la trace reste sur la carte', true,
  /if \(!peutConduire\(projets\.find/.test(ecran) && /mouvements: \[\.\.\.\(x\.mouvements \?\? \[\]\), \{ parNom: monNom, deNom, aNom: vers\.nom/.test(ecran));
dit('la Liste s ouvre en premier', true, ecran.includes("useState<Vue>('liste')"));
dit('la charge se compte sans heures', [false, false], [/\d+ h\b/.test(ecran), /libre \$\{|\blibre \d/.test(ecran)]);
dit('le Trone remarque, il ne decide pas : le geste attend le clic', true, /onClick=\{\(\) => confier\(proposition\.tacheId, proposition\.a\)\}/.test(ecran));
dit('pas de tiret cadratin dans ce que l ecran dit', false, ecran.includes('—'));
dit('la carte du Tableau dit son projet', true, tableau.includes('className="trt__projet">Projet · {projets.find((p) => p.id === m.projetId)!.nom}'));

console.log(`\n${n - ko}/${n} verifications`);
