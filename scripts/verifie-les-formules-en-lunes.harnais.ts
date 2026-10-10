/* LES SEPT FORMULES EN LUNES, ÉPROUVÉES — 10 octobre 2026 (la genèse des prix, lot 2).

   La RÈGLE, pas le cas du jour :
   - chaque prix se recompose depuis la carte (la venue nommée au calibre),
     à chaque calibre ; la dernière visite d'un Carnet est offerte, l'Année
     offre la quatrième et la huitième ; jamais plus de 25 %, jamais 0 F,
     jamais sans contenu ;
   - le Foyer : −15 % pour la deuxième et la troisième tête, sans dépasser 25 % ;
   - une porte (Premières Lunes, Carnet de Quatre) ne se prend qu'une fois ;
   - le soin de la lune tourne ; une lune non réglée met en pause, jamais de dette ;
   - 2 fois dès 100 000 F, 3 fois dès 200 000 F ;
   - un rendez-vous lié à un contrat mensuel ne compte que dans sa lune.
   Les attendus sont écrits à la main (la maquette validée du 10 octobre).
   `node scripts/verifie-les-formules-en-lunes.mjs` ; `--prouve` remet chaque
   faute une à une et exige que le banc crie. */
import { readFileSync } from 'node:fs';
import {
  CALIBRES, FORMULES_EN_LUNES, IDS_DES_FORMULES_EN_LUNES, VENUE_ESSENTIEL_COURT, VENUE_SIGNATURE_COURT,
  dejaPriseParLaTete, enPause, leFoyerJoue, masquesDesFormules, poseLesFormulesEnLunes, prixDuFoyer, rangDansLeFoyer, soinDeLaLune,
} from '../src/shared/formules-en-lunes-pur';
import { decoupesPour, peutEtreEchelonne } from '../src/shared/echeancier';
import { coversSub, inclusVendus, prixDeLaFormule, type Plan, type Subscriber } from '../src/shared/abonnements';
import { MODEL_BANDS_SEED } from '../src/shared/pricing';
import type { Appointment } from '../src/shared/agenda';

let ko = 0;
const ascii = (s: string) => s.replace(/[^\x20-\x7e]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);
const dit = (nom: string, attendu: unknown, obtenu: unknown) => {
  const ok = JSON.stringify(attendu) === JSON.stringify(obtenu);
  if (!ok) { ko++; process.exitCode = 1; }
  console.log(ascii(`${ok ? 'OK   ' : 'ECHEC'} ${nom} -> ${JSON.stringify(obtenu)}`));
  if (!ok) console.log(ascii(`       attendu ${JSON.stringify(attendu)}`));
};
const F = (id: string) => FORMULES_EN_LUNES.find((f) => f.id === id)!;
const P = (id: string) => F(id) as unknown as Plan;

/* ── 1. Les prix de la maquette, tête Medium courte (écrits à la main) ── */
dit('Medium court : Premieres Lunes, Quatre, Quatre Sig, Six, Six Sig, Annee, Annee Sig, Chaque Lune, KLOKLO',
  [84000, 84000, 99000, 140000, 165000, 168000, 198000, 37500, 12000],
  ['pl-lune-premieres', 'pl-lune-quatre', 'pl-lune-quatre-sig', 'pl-lune-six', 'pl-lune-six-sig', 'pl-lune-annee', 'pl-lune-annee-sig', 'pl-lune-gbeji', 'pl-lune-kloklo']
    .map((id) => prixDeLaFormule(P(id), 'mensuel', { bandId: 'cal-medium', longueur: 'court' }, MODEL_BANDS_SEED).montantXof));
dit('par le moteur : Galaxy long, Carnet de l Annee (6 x 72 000)', 432000,
  prixDeLaFormule(P('pl-lune-annee'), 'mensuel', { bandId: 'cal-galaxy', longueur: 'long' }, MODEL_BANDS_SEED).montantXof);
dit('par le moteur : Micro mi-long, GBEJI Chaque Lune', 52500,
  prixDeLaFormule(P('pl-lune-gbeji'), 'mensuel', { bandId: 'cal-micro', longueur: 'mi-long' }, MODEL_BANDS_SEED).montantXof);

/* ── 2. LA RÈGLE : chaque Carnet recompose la carte, à chaque calibre ── */
const CARNETS: [string, readonly number[], number, number][] = [
  // id, venue court, visites, offertes
  ['pl-lune-premieres', VENUE_ESSENTIEL_COURT, 4, 1], ['pl-lune-quatre', VENUE_ESSENTIEL_COURT, 4, 1], ['pl-lune-quatre-sig', VENUE_SIGNATURE_COURT, 4, 1],
  ['pl-lune-six', VENUE_ESSENTIEL_COURT, 6, 1], ['pl-lune-six-sig', VENUE_SIGNATURE_COURT, 6, 1],
  ['pl-lune-annee', VENUE_ESSENTIEL_COURT, 8, 2], ['pl-lune-annee-sig', VENUE_SIGNATURE_COURT, 8, 2],
];
const fautes: string[] = [];
for (const [id, venue, n, off] of CARNETS) {
  const f = F(id);
  CALIBRES.forEach((c, i) => {
    if (f.prixParCalibre?.[c] !== venue[i] * (n - off)) fautes.push(`${id} ${c}`);
  });
  if (f.supplementLongueur?.['mi-long'] !== 2000 * (n - off) || f.supplementLongueur?.long !== 4000 * (n - off)) fautes.push(`${id} longueur`);
  if ((f.included[0]?.qty ?? 0) !== n) fautes.push(`${id} contenu`);
  const av = off / n;
  if (!(av > 0 && av <= 0.25)) fautes.push(`${id} avantage ${av}`);
}
dit('chaque Carnet = la carte de la tete moins les visites offertes, a chaque calibre', [], fautes);
/* GBÈJÍ™ · Chaque Lune : la venue et le soin de la lune à −25 %, lissés, au pas inférieur. */
const SOINS_COURT = (20000 + 6000 + 15000) / 3;
const pas = (n: number) => { const p = n < 20000 ? 1000 : n <= 100000 ? 2500 : 5000; return Math.floor(n / p) * p; };
dit('Chaque Lune : la venue + le soin de la lune a -25 %, au pas inferieur, a chaque calibre',
  CALIBRES.map((_, i) => pas(VENUE_ESSENTIEL_COURT[i] + 0.75 * SOINS_COURT)),
  CALIBRES.map((c) => F('pl-lune-gbeji').prixParCalibre?.[c]));
dit('aucune formule a 0 F ni sans contenu, avantage affiche <= 25 %', [],
  FORMULES_EN_LUNES.filter((f) => !(f.priceXof > 0) || f.included.length === 0 || f.discountPct > 25).map((f) => f.id));
dit('les deux portes ont une cle, et elles seules', ['pl-lune-premieres', 'pl-lune-quatre', 'pl-lune-quatre-sig'],
  FORMULES_EN_LUNES.filter((f) => f.uneFoisParTete).map((f) => f.id));
const MOTS = /—|salon|Kolétan|Essentielle|Abonnement :|DÀNDÀN™ offert/i;
dit('aucun mot interdit, jamais un DANDAN offert', [],
  FORMULES_EN_LUNES.filter((f) => MOTS.test([f.name, f.line, f.tag, ...f.perks].join(' '))).map((f) => f.id));

/* ── 3. Le Foyer ── */
dit('Foyer : Carnet de Six Medium (16,7 % -> 25 %)', 126000, prixDuFoyer(140000, 168000));
dit('Foyer : Carnet de Quatre deja a 25 %, rien de plus', 84000, prixDuFoyer(84000, 112000));
dit('Foyer : GBEJI Chaque Lune Medium (valeur 41 667)', 31500, prixDuFoyer(37500, 28000 + SOINS_COURT));
dit('Foyer : KLOKLO Chaque Lune (12 000 sur 14 000)', 10500, prixDuFoyer(12000, 14000));
dit('Foyer : une formule sans avantage prend 15 %', 85000, prixDuFoyer(100000, 100000));
dit('Foyer : jamais plus de 25 % au total', [], [[140000, 168000], [37500, 41667], [12000, 14000], [100000, 100000], [99000, 132000]]
  .filter(([p, v]) => prixDuFoyer(p, v) / v < 0.75 - 1e-9).map(String));
dit('Foyer : rang 1, 2, 3, 4', [false, true, true, false], [1, 2, 3, 4].map(leFoyerJoue));
dit('Foyer : le rang compte les AUTRES tetes', [1, 2, 3], [0, 1, 2].map(rangDansLeFoyer));

/* ── 4. Une fois par tête ── */
const plans = FORMULES_EN_LUNES.map((f) => ({ id: f.id, uneFoisParTete: f.uneFoisParTete }));
dit('une porte deja passee (meme finie) se ferme', 'ab-1',
  dejaPriseParLaTete(F('pl-lune-quatre'), [{ id: 'ab-1', planId: 'pl-lune-quatre-sig', sinceIso: '2026-01-05' }], plans)?.id);
dit('une autre porte ne ferme pas celle-ci', undefined,
  dejaPriseParLaTete(F('pl-lune-quatre'), [{ id: 'ab-2', planId: 'pl-lune-premieres' }], plans));
dit('une formule sans porte se reprend', undefined,
  dejaPriseParLaTete(F('pl-lune-six'), [{ id: 'ab-3', planId: 'pl-lune-six' }], plans));

/* ── 5. Le soin de la lune, la pause ── */
const lune = F('pl-lune-gbeji');
dit('le soin de la lune tourne : J, J+30, J+60, J+90, avant', ['sv-plt-10-m', 'sv-plt-30-c', 'sv-plt-20-c', 'sv-plt-10-m', 'sv-plt-10-m'],
  ['2026-10-10', '2026-11-09', '2026-12-09', '2027-01-08', '2026-10-01'].map((d) => soinDeLaLune(lune, '2026-10-10', d)));
dit('pas de soin de la lune sur un Carnet', undefined, soinDeLaLune(F('pl-lune-six'), '2026-10-10', '2026-11-20'));
dit('une lune non reglee met en pause, un paquet jamais', [true, false, false], [
  enPause({ mode: 'cycle' }, { nextIso: '2026-11-09' }, '2026-11-09'),
  enPause({ mode: 'pack' }, { nextIso: '2026-11-09' }, '2026-12-01'),
  enPause({ mode: 'cycle' }, { nextIso: '2026-11-09' }, '2026-11-08'),
]);
const subLune = { id: 'ab-l', clientId: 'c1', planId: 'pl-lune-gbeji', sinceIso: '2026-10-10', nextIso: '2026-12-09', cycle: 'mensuel' } as unknown as Subscriber;
dit('le contenu vendu porte le soin de la lune du jour dit', ['sv-venue-gbeji-ess', 'sv-plt-30-c'],
  inclusVendus(subLune, P('pl-lune-gbeji'), '2026-11-15').map((i) => i.serviceId));

/* ── 6. Le rendez-vous lié ne compte que dans sa lune ── */
const rdv = (date: string, subId?: string) => ({ id: `r-${date}`, clientId: 'c1', date, status: 'honoré', coveredBySub: true, serviceIds: ['sv-venue-gbeji-ess'], ...(subId ? { subId } : {}) }) as unknown as Appointment;
dit('cycle : lie, lune passee -> ne compte pas ; lie, lune en cours -> compte ; non lie, lune en cours -> compte', [false, true, true], [
  coversSub(rdv('2026-10-20', 'ab-l'), subLune, P('pl-lune-gbeji')),
  coversSub(rdv('2026-11-20', 'ab-l'), subLune, P('pl-lune-gbeji')),
  coversSub(rdv('2026-11-21'), subLune, P('pl-lune-gbeji')),
]);
const subPack = { id: 'ab-p', clientId: 'c1', planId: 'pl-lune-six', sinceIso: '2026-10-10', startIso: '2026-10-10', expiresIso: '2027-07-07', nextIso: '2027-07-07' } as unknown as Subscriber;
dit('paquet : lie, dans sa vie -> compte ; lie a un autre contrat -> non', [true, false], [
  coversSub(rdv('2026-12-20', 'ab-p'), subPack, P('pl-lune-six')),
  coversSub(rdv('2026-12-20', 'ab-x'), subPack, P('pl-lune-six')),
]);

/* ── 7. Le paiement en plusieurs fois ── */
dit('decoupes : 99 999, 100 000, 199 999, 200 000', [[], [2], [2], [2, 3]], [99999, 100000, 199999, 200000].map(decoupesPour));
dit('des 100 000 F (et non au-dela)', [false, true], [peutEtreEchelonne(99999), peutEtreEchelonne(100000)]);

/* ── 8. La naissance et les masques ── */
const avant = [{ id: 'pl-mkt-eclosion' }, { id: 'pl-lune-six', name: 'retouchée à la main' }];
const nees = poseLesFormulesEnLunes(avant);
dit('naissent les manquantes seulement, la retouchee reste', [IDS_DES_FORMULES_EN_LUNES.length - 1, 'retouchée à la main'],
  [nees?.nees.length, (nees?.plans.find((p) => p.id === 'pl-lune-six') as { name?: string })?.name]);
dit('rejouee : rien', null, poseLesFormulesEnLunes(nees?.plans ?? []));
const m1 = masquesDesFormules({ hiddenPlans: ['pl-x'] }, 'maintenant');
dit('maintenant : masquees de Ma Couronne, le reste garde', ['pl-x', ...IDS_DES_FORMULES_EN_LUNES], m1?.hiddenPlans);
dit('maintenant rejoue : rien', null, masquesDesFormules(m1 ?? {}, 'maintenant'));
dit('janvier : montrees', ['pl-x'], masquesDesFormules(m1 ?? {}, 'janvier')?.hiddenPlans);

/* ── 9. Les écrans et le déclencheur (commentaires effacés) ── */
const sansCom = (f: string) => readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
dit('le Trone lance les formules au demarrage', true, /^migreLesFormulesEnLunes\(\);$/m.test(sansCom('src/apps/trone/main.tsx')));
const runner = sansCom('src/shared/formules-en-lunes.ts');
dit('le declencheur : session, carte du lot 1, vitrine relue, masques AVANT les formules', [true, true, true], [
  /getSession\(\)\)\.data\.session\) return;/.test(runner),
  /if \(!formulesChargees\(\) \|\| !carteDuLot1\(\)\) return;[^\n]*\n\s*if \(!\(await masquee\(\)\)\) return;[^\n]*\n\s*posees\(\);\s*marque\(\);/.test(runner),
  /from\('documents'\)\.select\('data'\)\.eq\('key', 'mnd_vitrine_config'\)/.test(runner),
]);
const abo = sansCom('src/apps/trone/routes/equipe/Abonnements.tsx');
dit('comptoir : la porte refusee, le Foyer en prix convenu, les decoupes de la regle', [true, true, true, false], [
  /const dejaPrise = dejaPriseParLaTete\(plan, subs\.filter\(\(s\) => s\.clientId === client\.id\), plans\);\s*if \(dejaPrise\) \{/.test(abo),
  /return prixConvenuSaisi\(\) \?\? foyerDeLaVente\(\)\?\.prixXof/.test(abo),
  (abo.match(/decoupesPour\(total\)\.map\(/g) ?? []).length === 2,
  /DECOUPES\.map\(/.test(abo),
]);
const rdvModal = sansCom('src/apps/trone/routes/clients/_shared.tsx');
dit('fiche du RDV : la pause empeche de couvrir, le soin suit la date du RDV', [true, true], [
  /const canCover = !pauseDeLaLune && coverageRows\.length > 0/.test(rdvModal),
  /inclusVendus\(membership, membershipPlan, date\)\.some/.test(rdvModal),
]);
dit('le juge est pur : aucun import', false, /^\s*import\s/m.test(sansCom('src/shared/formules-en-lunes-pur.ts')));

console.log(ko === 0 ? '\nLes formules en lunes tiennent.' : `\n${ko} epreuve(s) en echec.`);
