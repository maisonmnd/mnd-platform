/* LA PRÉVISION DU MOIS, ÉPROUVÉE — `node scripts/verifie-la-prevision-du-mois.mjs`.

   24 octobre 2026 : « Build an AI driven predictive forecasting » (Yéman),
   maquette VJ5PJEGUPDbYKUgEdMUNbS, « construis ». Choix au sélecteur : le
   Trône calcule, Claude explique. La règle (shared/prevision-du-mois-pur.ts)
   et sa place au tableau de bord (texte). Tout est inventé. Sortie ASCII. */
import { ceQuiFaitLaPrevision, prevoisLeMois, type EntreesDeLaPrevision } from '../src/shared/prevision-du-mois-pur';
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
const fmt = (x: number) => `${String(Math.round(x)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} F`;

const jours = Array.from({ length: 24 }, (_, i) => ({ iso: `2026-10-${String(i + 1).padStart(2, '0')}`, xof: i === 23 ? 120000 : i < 23 ? 115652 : 0 }));
const base: EntreesDeLaPrevision = {
  aujourdhui: '2026-10-24',
  dernierJour: '2026-10-31',
  encaisseParJour: jours,
  rdvs: [
    { date: '2026-10-24', duXof: 100000 },
    { date: '2026-10-28', duXof: 200000 },
    { date: '2026-11-02', duXof: 999 }, // le mois prochain : ne compte pas
    { date: '2026-10-20', duXof: 5 }, // passé : ne compte pas
    { date: '2026-10-29', duXof: 0 }, // soldé : ne compte pas
  ],
  honneur: { honores: 94, annules: 6 },
  reprises: [{ iso: '2026-10-29', valeurXof: 100000 }, { iso: '2026-10-30', valeurXof: 0 }, { iso: '2026-11-05', valeurXof: 80000 }],
  justesse: 0.5,
  creancesPassees: [100000, 200000, 140000],
  versementsAVenirXof: 0,
};
const encaisse = jours.reduce((s, j) => s + j.xof, 0);
const p = prevoisLeMois(base);

dit('l entre du mois est la somme des jours', encaisse, p.encaisseXof);
dit('les rendez-vous : seulement ce mois, a venir, qui doivent encore ; comptes au taux d honneur', { nombre: 2, duXof: 300000, taux: 0.94, comptesXof: 282000, peuDHistoire: false }, p.rdv);
dit('les reprises : ce mois, avec une valeur ; comptees a la justesse de la Cadence', { nombre: 1, valeurXof: 100000, taux: 0.5, comptesXof: 50000 }, p.reprises);
dit('les creances : la mediane, la plus faible et la plus forte des mois passes', { medianeXof: 140000, basXof: 100000, hautXof: 200000, mois: 3 }, p.creances);
dit('la prevision centrale : entre + rdv x honneur + reprises x justesse + creances, au millier', Math.round((encaisse + 282000 + 50000 + 140000) / 1000) * 1000, p.centraleXof);
dit('la fourchette : honneur -10 / +5 points, reprises x0,5 / x1,5, creances au plus faible / au plus fort',
  [Math.round((encaisse + 300000 * 0.84 + 25000 + 100000) / 1000) * 1000, Math.round((encaisse + 300000 * 0.99 + 75000 + 200000) / 1000) * 1000],
  [p.basXof, p.hautXof]);
dit('le bas sous la centrale, la centrale sous le haut', true, p.basXof <= p.centraleXof && p.centraleXof <= p.hautXof);
dit('un jour par jour du mois, de 1 a 31', [31, '2026-10-01', '2026-10-31'], [p.jours.length, p.jours[0].iso, p.jours[30].iso]);
dit('aujourd hui porte l entre ET l attendu de ses rendez-vous', { iso: '2026-10-24', encaisseXof: 120000, prevuXof: 94000 }, p.jours[23]);
dit('l attendu dessine ne compte pas les creances (on ne sait pas quel jour)', 282000 + 50000, p.jours.reduce((s, j) => s + j.prevuXof, 0));
dit('sous dix rendez-vous passes, 90 % par defaut, et on le dit', [0.9, true], (() => { const q = prevoisLeMois({ ...base, honneur: { honores: 3, annules: 1 } }); return [q.rdv.taux, q.rdv.peuDHistoire]; })());
dit('sans justesse mesurable, une reprise compte pour 40 %', 0.4, prevoisLeMois({ ...base, justesse: null }).reprises.taux);
dit('sans historique de creances : zero, et la phrase le dit', [0, true],
  (() => { const q = prevoisLeMois({ ...base, creancesPassees: [] }); return [q.creances.medianeXof, ceQuiFaitLaPrevision(q, fmt, 'le 31').find((l) => l.cle === 'creances')!.dit.startsWith('Pas encore d')]; })());
dit('des versements deja inscrits plus tard ce mois s ajoutent tels quels, et ont leur ligne', [p.centraleXof + 30000, true],
  (() => { const q = prevoisLeMois({ ...base, versementsAVenirXof: 30000 }); return [q.centraleXof, ceQuiFaitLaPrevision(q, fmt, 'le 31').some((l) => l.cle === 'versements')]; })());

const lignes = ceQuiFaitLaPrevision(p, fmt, 'le 31');
dit('ce qui fait la prevision se lit en clair, part par part', ['encaisse', 'rdv', 'reprises', 'creances'], lignes.map((l) => l.cle));
dit('la ligne des rendez-vous dit le nombre, le du, le taux et ce qui est compte', true,
  lignes[1].dit === '2 rendez-vous posés d’ici le 31 doivent encore 300 000 F, comptés à 94 % (vos venues honorées des douze derniers mois) : 282 000 F.');
dit('les parts expliquees refont la prevision centrale', p.centraleXof, Math.round(lignes.reduce((s, l) => s + l.xof, 0) / 1000) * 1000);

/* ── Au tableau de bord (texte) ───────────────────────────────────── */
const tableau = sansCommentaires('src/apps/trone/routes/pilotage/Dashboard.tsx');
const bloc = sansCommentaires('src/apps/trone/routes/pilotage/PrevisionDuMois.tsx');
dit('la prevision vit au tableau de bord, sous les chiffres du mois, calculee une fois', true, /\{kpis\.map[\s\S]*<PrevisionDuMois donnees=\{prevDuMois\} \/>/.test(tableau) && tableau.includes('const prevDuMois = usePrevisionDuMois();'));
dit('l entre se lit avec la regle des Revenus du mois', true, bloc.includes('revenuDuMois(args, mk, { cut: d })'));
/* LE TRÔNE CALCULE, CLAUDE EXPLIQUE (24 octobre 2026) : le calcul de la
   prévision ne touche ni un serveur ni un modèle ; l'assistant ne parle que
   sur un clic (« Demander pourquoi »), après le calcul, et ne le refait pas. */
const calcul = bloc.slice(bloc.indexOf('export function usePrevisionDuMois'), bloc.indexOf('const explicationsDuJour'));
dit('le Trone calcule : le calcul ne part vers aucun serveur ni modele', [true, false, false, false],
  [calcul.length > 500, calcul.includes('fetch('), calcul.includes('functions.invoke'), calcul.includes('demandeAClaude')]);
dit('Claude n explique que sur un clic, apres le calcul', true,
  bloc.split('demandeAClaude(').length === 2 && /const expliquer = async \(\) => \{[^}]*demandeAClaude\(demandeDExplication/.test(bloc) && bloc.includes('onClick={() => { void expliquer(); }}'));
dit('les reprises viennent du juge de la Cadence, sa justesse aussi', true, bloc.includes('predictNextVisit(siens, [c], c.id, today)') && bloc.includes('tauxDeRealisation(venues)'));
dit('pas de tiret cadratin dans ce que le bloc et la regle disent', [false, false],
  [bloc.includes('—'), sansCommentaires('src/shared/prevision-du-mois-pur.ts').includes('—')]);

console.log(`\n${n - ko}/${n} verifications`);
