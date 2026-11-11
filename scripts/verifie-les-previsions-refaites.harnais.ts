/* LES PRÉVISIONS REFAITES, ÉPROUVÉES : `node scripts/verifie-les-previsions-refaites.mjs` (et `--prouve`).
   11 novembre 2026 : « L'UI/l'UX des prévisions est médiocre. Refais-moi une
   belle et professionnelle » (Y.), maquette PYPe8AbTyxytSBxZLDiMZ7 validée
   par « construis ». Le banc tient ce que l'affichage promet : l'horizon et
   la vue séparés, les quatre tuiles, la jauge bornée à 100 %, les leviers
   triés par gain, un seul panneau du détail ouvert, `?vue=francs` lu. */
import { readFileSync } from 'node:fs';
import {
  basculeLePanneau, leviersParGain, partsDeLaJauge, remplissage, sousTexteDuJour, tonDuJour, vueDeLAdresse,
  PANNEAU_OUVERT_AU_DEPART, VUES_DES_PREVISIONS,
} from '../src/apps/trone/routes/pilotage/previsions-affichage-pur';
import { HORIZONS_DES_PREVISIONS } from '../src/shared/previsions-pur';

let ko = 0;
const dit = (nom: string, attendu: unknown, obtenu: unknown) => {
  const ok = JSON.stringify(attendu) === JSON.stringify(obtenu);
  if (!ok) ko++;
  console.log(`${ok ? 'OK   ' : 'ECHEC'} ${nom}${ok ? '' : `\n       attendu ${JSON.stringify(attendu)}\n       obtenu  ${JSON.stringify(obtenu)}`}`);
};
const lis = (f: string) => readFileSync(f, 'utf8').replace(/\r\n/g, '\n');
const sansCommentaires = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const arrondi = (x: number) => Math.round(x * 1e6) / 1e6;
const parts = (o: Parameters<typeof partsDeLaJauge>[0]) => { const p = partsDeLaJauge(o); return [p.poses, p.attendus, p.marketing, p.libres].map(arrondi); };

/* ── 1. L'horizon et la vue, séparés ── */
dit('trois vues, dans l ordre de la maquette', ['avenir:À venir', 'passe:12 derniers mois', 'francs:En francs'], VUES_DES_PREVISIONS.map((v) => `${v.cle}:${v.nom}`));
dit('aucune vue n est un horizon', [], VUES_DES_PREVISIONS.filter((v) => (HORIZONS_DES_PREVISIONS as readonly string[]).includes(v.cle)).map((v) => v.cle));
dit('?vue=francs ouvre En francs ; ?vue=passe le passé ; le reste, À venir', ['francs', 'passe', 'avenir', 'avenir', 'avenir'],
  [vueDeLAdresse('francs'), vueDeLAdresse('passe'), vueDeLAdresse(null), vueDeLAdresse('4s'), vueDeLAdresse('FRANCS')]);

/* ── 2. Le remplissage ── */
dit('remplissage : prévus ÷ plafond, puis avec le marketing', [0.5, 0.75], (() => { const r = remplissage(40, 20, 80); return [r.sans, r.avec]; })());
dit('... sans plafond, pas de pourcentage', [null, null], (() => { const r = remplissage(10, 2, 0); return [r.sans, r.avec]; })());

/* ── 3. La jauge, bornée à 100 % ── */
dit('jauge : les parts du plafond, le reste libre', [0.5, 0.25, 0.125, 0.125], parts({ poses: 40, attendus: 20, marketing: 10, plafond: 80 }));
dit('... au-delà du plafond, la somme fait la largeur, jamais plus', [0.5, 0.375, 0.125, 0], parts({ poses: 80, attendus: 60, marketing: 20, plafond: 100 }));
const folles = [
  { poses: 500, attendus: 0, marketing: 0, plafond: 10 }, { poses: 3, attendus: 4, marketing: 9, plafond: 0 },
  { poses: -5, attendus: 2, marketing: 1, plafond: 4 }, { poses: 0, attendus: 0, marketing: 0, plafond: 0 },
];
dit('... aucune part négative, jamais plus de 100 % au total', [true, true, true, true],
  folles.map((o) => { const p = partsDeLaJauge(o); const t = p.poses + p.attendus + p.marketing + p.libres; return [p.poses, p.attendus, p.marketing, p.libres].every((x) => x >= 0) && t <= 1 + 1e-9; }));
dit('... rien à montrer : une jauge vide', [0, 0, 0, 0], parts({ poses: 0, attendus: 0, marketing: 0, plafond: 0 }));

/* ── 4. Les leviers, du plus rentable au moins rentable ── */
const leviers = [
  { cle: 'relance', rdv: 2.1, etat: 'mesure' as const }, { cle: 'reveil', rdv: 6.4, etat: 'mesure' as const },
  { cle: 'parrainage', rdv: 0, etat: 'inclus' as const }, { cle: 'offre', rdv: 0, etat: 'a-mesurer' as const },
];
const offreDAbord = [leviers[3], leviers[2], leviers[0], leviers[1]];
dit('triés par RDV à gagner ; à égalité, le mesuré, l inclus, puis l à mesurer', ['reveil', 'relance', 'parrainage', 'offre'], leviersParGain(offreDAbord).map((l) => l.cle));
dit('... la liste du calcul n est pas touchée', ['offre', 'parrainage', 'relance', 'reveil'], offreDAbord.map((l) => l.cle));

/* ── 5. Un seul panneau du détail ouvert ── */
dit('le premier panneau ouvert au départ', 'prevision', PANNEAU_OUVERT_AU_DEPART);
dit('toucher une autre ligne referme la première ; toucher l ouverte la referme ; d un fermé, elle s ouvre', ['plafond', null, 'marketing'],
  [basculeLePanneau('prevision', 'plafond'), basculeLePanneau('marketing', 'marketing'), basculeLePanneau(null, 'marketing')]);

/* ── 6. Les cases des 14 jours ── */
const jour = (o: Partial<{ ferme: boolean; creux: boolean; poses: number; ordinaire: number; manque: number }>) => ({ ferme: false, creux: false, poses: 0, ordinaire: 0, manque: 0, ...o });
dit('fermée, creuse, pleine, ordinaire', ['ferme', 'creux', 'plein', 'ordinaire', 'ordinaire'],
  [tonDuJour(jour({ ferme: true })), tonDuJour(jour({ creux: true, poses: 1, ordinaire: 4 })), tonDuJour(jour({ poses: 5, ordinaire: 5 })), tonDuJour(jour({ poses: 3, ordinaire: 5 })), tonDuJour(jour({}))]);
dit('dessous : « sur N », le manque en négatif, ou fermé', ['sur 5', '−3', 'fermé'],
  [sousTexteDuJour(jour({ ordinaire: 5 })), sousTexteDuJour(jour({ creux: true, ordinaire: 5, manque: 3 })), sousTexteDuJour(jour({ ferme: true }))]);

/* ── 7. L'écran branche ces règles ── */
const ecran = sansCommentaires(lis('src/apps/trone/routes/pilotage/Previsions.tsx'));
dit('l horizon et la vue, deux états ; le calcul suit l horizon', [true, true, true],
  [ecran.includes("const [horizon, setHorizon] = useState<HorizonDesPrevisions>('4s');"),
    ecran.includes("const [vue, setVue] = useState<VueDesPrevisions>(() => vueDeLAdresse(params.get('vue')));"),
    ecran.includes('usePrevisions(horizon, rdvs)')]);
dit('le segment d horizon à droite du titre, éteint hors de « À venir » ; les onglets de vue à part', [true, true, true, true],
  [/actions=\{\(\s*<div className=\{`trp-prev__seg/.test(ecran), ecran.includes("disabled={vue !== 'avenir'} onClick={() => setHorizon(h)}"),
    ecran.includes('HORIZONS_DES_PREVISIONS.map((h) =>'), ecran.includes('<div className="trp-prev__vues" role="tablist" aria-label="La vue">')]);
dit('les quatre tuiles d À venir', [true, true, true, true],
  ['<small>RDV prévus</small>', '<small>Plafond atteignable</small>', '<small>À gagner</small>', '<small>Remplissage</small>'].map((t) => ecran.includes(t)));
dit('... le remplissage lit la règle, avec le marketing en sous-texte', [true, true],
  [ecran.includes('const taux = remplissage(p.prevision, p.marketing, p.plafond.total);'), ecran.includes('`${pct(taux.avec)} avec le marketing`')]);
dit('la jauge dessine les parts bornées', [true, true, true],
  [ecran.includes('const jauge = partsDeLaJauge({'), ecran.includes('style={{ width: `${jauge.poses * 100}%` }}'), ecran.includes('style={{ width: `${jauge.marketing * 100}%` }}')]);
dit('Ce qui remplit : les leviers triés par gain', [true, true], [ecran.includes('const leviers = leviersParGain(p.leviers);'), ecran.includes('{leviers.map((l) => (')]);
dit('le détail : un seul état pour trois lignes, le premier ouvert, aria-expanded', [true, true, 3, true],
  [ecran.includes('useState<PanneauDuDetail | null>(PANNEAU_OUVERT_AU_DEPART)'), ecran.includes('setOuvert((o) => basculeLePanneau(o, cle))'),
    (ecran.match(/<LigneDuDetail cle="[a-z]+" ouvert=\{ouvert\} onBascule=\{bascule\}/g) ?? []).length, ecran.includes('aria-expanded={est}')]);
dit('une case ouverte mène au calendrier de ce jour', true, ecran.includes('onClick={() => navigate(`/calendrier?jour=${j.iso}`)}'));
dit('En francs reste lu par ?vue=francs', true, ecran.includes("{vue === 'francs' ? <LeMoisEnFrancs /> :"));
dit('pas de tiret cadratin, pas de « salon » dans ce que l écran et ses règles disent', [false, false],
  [/—/.test(ecran) || /—/.test(sansCommentaires(lis('src/apps/trone/routes/pilotage/previsions-affichage-pur.ts'))), /salon/i.test(ecran)]);

console.log(ko === 0 ? '\nLes prévisions refaites : tout tient.' : `\n${ko} controle(s) en echec.`);
process.exitCode = ko === 0 ? 0 : 1;
