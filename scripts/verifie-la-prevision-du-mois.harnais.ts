/* LA PRÉVISION DU MOIS, ÉPROUVÉE — `node scripts/verifie-la-prevision-du-mois.mjs`.

   24 octobre 2026 : « Build an AI driven predictive forecasting » (Yéman),
   maquette VJ5PJEGUPDbYKUgEdMUNbS, « construis ». Choix au sélecteur : le
   Trône calcule, Claude explique. La règle (shared/prevision-du-mois-pur.ts)
   et sa place au tableau de bord (texte). Tout est inventé. Sortie ASCII. */
import {
  avecLaFourchette, calculDeLaPrevision, ceQuiFaitLaPrevision, cumulDuMois, ecartDecompose, fourchetteMesuree, leviersDuMois, objectifDuMois,
  prevoisLeMois, type EntreesDeLaPrevision,
} from '../src/shared/prevision-du-mois-pur';
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
dit('les rendez-vous : seulement ce mois, a venir, qui doivent encore ; comptes au taux d honneur', { nombre: 2, duXof: 300000, taux: 0.94, comptesXof: 282000, peuDHistoire: false, basXof: 252000, hautXof: 297000 }, p.rdv);
dit('les reprises : ce mois, avec une valeur ; comptees a la justesse de la Cadence', { nombre: 1, valeurXof: 100000, taux: 0.5, comptesXof: 50000, basXof: 25000, hautXof: 75000 }, p.reprises);
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

/* LE CALCUL MONTRÉ (« des démonstrations de calculs, avec des totaux
   prévisionnels », 24 octobre 2026) : chaque ligne et ses totaux. */
const calc = calculDeLaPrevision(p);
dit('le calcul : une ligne par part, base x taux = compte, sa fourchette', [
  ['encaisse', encaisse, null, encaisse, encaisse, encaisse],
  ['rdv', 300000, 0.94, 282000, 252000, 297000],
  ['reprises', 100000, 0.5, 50000, 25000, 75000],
  ['creances', 140000, null, 140000, 100000, 200000],
], calc.lignes.map((l) => [l.cle, l.baseXof, l.taux, l.compteXof, l.basXof, l.hautXof]));
dit('les totaux du calcul sont ceux de la prevision, et les lignes les refont (au millier pres par ligne)', [true, true, true],
  [calc.total.compteXof === p.centraleXof && calc.total.basXof === p.basXof && calc.total.hautXof === p.hautXof,
    Math.abs(calc.lignes.reduce((s, l) => s + l.compteXof, 0) - p.centraleXof) <= 1000 * calc.lignes.length,
    Math.abs(calc.lignes.reduce((s, l) => s + l.basXof, 0) - p.basXof) <= 1000 * calc.lignes.length]);
const lignes = ceQuiFaitLaPrevision(p, fmt, 'le 31');
dit('ce qui fait la prevision se lit en clair, part par part', ['encaisse', 'rdv', 'reprises', 'creances'], lignes.map((l) => l.cle));
dit('la ligne des rendez-vous dit le nombre, le du, le taux et ce qui est compte', true,
  lignes[1].dit === '2 rendez-vous posés d’ici le 31 doivent encore 300 000 F, comptés à 94 % (vos venues honorées des douze derniers mois) : 282 000 F.');
dit('les parts expliquees refont la prevision centrale', p.centraleXof, Math.round(lignes.reduce((s, l) => s + l.xof, 0) / 1000) * 1000);

/* ── 27 octobre 2026 : la prévision qui décide ──────────────────────── */
const pq = prevoisLeMois(base);
dit('la fourchette garde ses regles sous trois mois juges, et dit combien il y en a', [{ mode: 'regles', moisJuges: 2 }, { mode: 'regles', moisJuges: 1 }],
  [fourchetteMesuree([{ mois: '2026-09', resteprevuXof: 400000, resteRealiseXof: 380000 }, { mois: '2026-08', resteprevuXof: 300000, resteRealiseXof: 330000 }]),
    fourchetteMesuree([{ mois: '2026-09', resteprevuXof: 400000, resteRealiseXof: 380000 }, { mois: '2026-08', resteprevuXof: 0, resteRealiseXof: 50000 }])]);
const f3 = fourchetteMesuree([
  { mois: '2026-09', resteprevuXof: 400000, resteRealiseXof: 320000 },
  { mois: '2026-08', resteprevuXof: 500000, resteRealiseXof: 600000 },
  { mois: '2026-07', resteprevuXof: 200000, resteRealiseXof: 190000 },
]);
dit('mesuree des trois mois : le plus faible et le plus fort rapport constates', { mode: 'mesuree', moisJuges: 3, ratioBas: 0.8, ratioHaut: 1.2 }, f3);
const f12 = fourchetteMesuree(Array.from({ length: 12 }, (_, i) => ({ mois: `2025-${String(i + 1).padStart(2, '0')}`, resteprevuXof: 100, resteRealiseXof: 50 + i * 10 })));
dit('au-dela de dix mois, le 10e et le 90e centile (un mois hors norme ne fait pas la fourchette)', [0.6, 1.5], f12.mode === 'mesuree' ? [f12.ratioBas, f12.ratioHaut] : null);
const pm = avecLaFourchette(pq, f3);
const reste = pq.centraleXof - pq.encaisseXof;
dit('la fourchette mesuree : l entre ne bouge pas, le reste prevu se multiplie par les deux rapports', [pq.centraleXof, Math.round((pq.encaisseXof + reste * 0.8) / 1000) * 1000, Math.round((pq.encaisseXof + reste * 1.2) / 1000) * 1000],
  [pm.centraleXof, pm.basXof, pm.hautXof]);
dit('... et en mode regles, la prevision reste telle quelle', true, avecLaFourchette(pq, { mode: 'regles', moisJuges: 1 }) === pq);
const capture = { ...pq, rdv: { ...pq.rdv, basXof: 173000, hautXof: 192000 }, reprises: { ...pq.reprises, basXof: 128000, hautXof: 383000 }, creances: { ...pq.creances, basXof: 0, hautXof: 334000 }, basXof: 1878000, hautXof: 2488000 };
dit('d ou vient l ecart (la capture du 27 octobre 2026) : creances 55 %, reprises 42 %, RDV 3 %, du plus lourd au plus leger', [610000, ['creances', 'reprises', 'rdv'], [55, 42, 3]],
  (() => { const e = ecartDecompose(capture); return [e.totalXof, e.parts.map((x) => x.cle), e.parts.map((x) => x.pct)]; })());
const cu = cumulDuMois(pq, '2026-10-24');
const dernier = cu[cu.length - 1];
dit('le cumul : l entre jusqu a hier, puis le prevu jusqu au 31, qui rejoint la prevision ; la fourchette finit sur bas et haut', [23, true, pq.basXof, pq.hautXof],
  [cu.filter((c) => c.entreXof !== null).length, Math.abs((dernier.prevuXof ?? 0) - pq.centraleXof) <= 1000, dernier.basXof, dernier.hautXof]);
dit('... le cumul entre ne fait que monter', true, cu.filter((c) => c.entreXof !== null).every((c, i, l) => i === 0 || (c.entreXof ?? 0) >= (l[i - 1].entreXof ?? 0)));
const lv = leviersDuMois(pq, { placesLibres: 9, rdvAGarder: 2 });
dit('les leviers : ranges par ce qu ils rapportent, reprises = valeur moins compte ; un levier sans objet tombe', [['creances', 'reprises', 'garder', 'places'], pq.reprises.valeurXof - pq.reprises.comptesXof, 3],
  [lv.map((x) => x.cle), lv.find((x) => x.cle === 'reprises')?.gainXof, leviersDuMois(pq, { placesLibres: 0, rdvAGarder: 2 }).length]);
dit('l objectif du mois : le sien, sinon le dernier fixe avant ; jamais un mois a venir ; 0 = pas d objectif', [2400000, 2000000, null, null, null],
  [objectifDuMois({ '2026-09': 2000000, '2026-10': 2400000 }, '2026-10'), objectifDuMois({ '2026-09': 2000000, '2026-11': 9 }, '2026-10'),
    objectifDuMois({ '2026-11': 9 }, '2026-10'), objectifDuMois({ '2026-09': 2000000, '2026-10': 0 }, '2026-10'), objectifDuMois(undefined, '2026-10')]);

/* ── Au tableau de bord (texte) ───────────────────────────────────── */
const tableau = sansCommentaires('src/apps/trone/routes/pilotage/Dashboard.tsx');
const bloc = sansCommentaires('src/apps/trone/routes/pilotage/PrevisionDuMois.tsx');
/* 27 OCTOBRE 2026, au sélecteur : « le mois, puis les leviers ». La
   prévision passe en tête, ses quatre chiffres la suivent, puis les lignes
   repliées (Aujourd'hui, À traiter, Le détail du mois). */
dit('la prevision ouvre le tableau de bord, avant ses quatre chiffres et les lignes repliees, calculee une fois', true,
  /<nav className="trd-nav"[\s\S]*<PrevisionDuMois donnees=\{prevDuMois\} \/>[\s\S]*\{kpis\.map[\s\S]*<GroupeDeReplis id="aujourdhui"[\s\S]*<GroupeDeReplis id="a-traiter"[\s\S]*<GroupeDeReplis id="le-detail-du-mois"/.test(tableau)
  && tableau.includes('const prevDuMois = usePrevisionDuMois();'));
dit('un seul panneau ouvert par groupe ; « Voir » sur les impayes echus ouvre leur ligne', [true, true],
  [sansCommentaires('src/apps/trone/routes/pilotage/Replis.tsx').includes('const ouvert = g ? g.ouvert === cle : seul;'),
    tableau.includes("go: () => { setOuvertATraiter('impayes');")]);
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
dit('la carte pose la fourchette mesuree, chaque jour est un bouton qui ouvre son detail, les gestes menent au calendrier du jour', [true, true, true, true],
  [bloc.includes('const prevision = avecLaFourchette(brute, fourchette);'), /<button key=\{j\.iso\} type="button" className=\{`trd-mois__jour/.test(bloc) && bloc.includes('onClick={() => choisirJour(j.iso)}'),
    bloc.includes("navigate(`/calendrier?jour=${d.iso}`)"), sansCommentaires('src/apps/trone/routes/clients/Calendrier.tsx').includes("const [anchor, setAnchor] = useState(jourDemande ?? today);")]);
dit('pas de tiret cadratin dans ce que le bloc et la regle disent', [false, false],
  [bloc.includes('—'), sansCommentaires('src/shared/prevision-du-mois-pur.ts').includes('—')]);

console.log(`\n${n - ko}/${n} verifications`);
