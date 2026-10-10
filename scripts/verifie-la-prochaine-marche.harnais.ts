/* VOTRE PROCHAINE MARCHE, ÉPROUVÉE — 11 octobre 2026 (la genèse des prix, lot 5).

   La RÈGLE (synthèse 2.4, maquette validée le 10 octobre 2026) : dans Ma
   Couronne, une seule carte, la première marche qui s'applique, dans l'ordre
   du tableau des déclencheurs ; une formule déjà prise une fois ne se
   repropose pas ; une tête Signature voit la variante Signature ; la carte se
   tait avant le 1er janvier 2027 ; ce qui part à la Maison reste en français.
   Attendus écrits à la main. `node scripts/verifie-la-prochaine-marche.mjs` ;
   `--prouve` remet chaque faute une à une et exige que le banc crie. */
import { readFileSync } from 'node:fs';
import { prochaineMarche } from '../src/shared/prochaine-marche-pur';

let ko = 0;
const ascii = (s: string) => s.replace(/[^\x20-\x7e]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);
const dit = (nom: string, attendu: unknown, obtenu: unknown) => {
  const ok = JSON.stringify(attendu) === JSON.stringify(obtenu);
  if (!ok) { ko++; process.exitCode = 1; }
  console.log(ascii(`${ok ? 'OK   ' : 'ECHEC'} ${nom} -> ${JSON.stringify(obtenu)}`));
  if (!ok) console.log(ascii(`       attendu ${JSON.stringify(attendu)}`));
};

const JOUR = '2027-01-20';
const TOUTES = new Set(['pl-lune-premieres', 'pl-lune-quatre', 'pl-lune-quatre-sig', 'pl-lune-six', 'pl-lune-six-sig', 'pl-lune-annee', 'pl-lune-annee-sig']);
const creation = (id: string) => id.startsWith('sv-atl-i-');
const v = (date: string, ids: string[], extra: Record<string, unknown> = {}) => ({ date, status: 'honoré', serviceIds: ids, ...extra });
const M = (visites: ReturnType<typeof v>[], o: Partial<Parameters<typeof prochaineMarche>[0]> = {}) =>
  prochaineMarche({ jour: JOUR, visites, estCreation: creation, dejaPrises: new Set(), enVente: TOUTES, ...o });

/* ① la création */
dit('une creation il y a 10 jours : Les Premieres Lunes', { cle: 'premieres-lunes', planId: 'pl-lune-premieres' }, M([v('2027-01-10', ['sv-atl-i-med'])]));
dit('… il y a 40 jours : non (et une seule visite : rien)', null, M([v('2026-12-11', ['sv-atl-i-med'])]));
dit('… deja prises : la marche suivante ne s invente pas', null, M([v('2027-01-10', ['sv-atl-i-med'])], { dejaPrises: new Set(['pl-lune-premieres']) }));
dit('… pas en vente : rien', null, M([v('2027-01-10', ['sv-atl-i-med'])], { enVente: new Set(['pl-lune-six']) }));
/* ② la couleur */
dit('une Couleur il y a 7 jours : la Cure de Lumiere', { cle: 'cure-lumiere', serviceId: 'sv-yekpe-cure-lumiere' }, M([v('2027-01-13', ['sv-atl-iii-cou-c'])]));
dit('… l ancienne Couleur compte aussi', 'cure-lumiere', M([v('2027-01-13', ['sv-atl-iii-cou-l'])])?.cle);
const creeeJadis = v('2025-05-01', ['sv-atl-i-med']);
dit('… la Cure deja honoree : non', null, M([creeeJadis, v('2027-01-13', ['sv-atl-iii-cou-c']), v('2027-01-15', ['sv-yekpe-cure-lumiere'])]));
dit('… il y a 20 jours : non', null, M([creeeJadis, v('2026-12-31', ['sv-atl-iii-cou-c'])]));
dit('… coloree sans creation a la Maison : sa couronne est nee ailleurs', 'carnet-quatre', M([v('2026-12-31', ['sv-atl-iii-cou-c'])])?.cle);
/* ③ la formule en cours */
const venues = [v('2026-09-01', ['sv-atl-ii-e']), v('2026-10-15', ['sv-atl-ii-e']), v('2026-12-01', ['sv-atl-ii-e'])];
dit('un Carnet de Six a deux venues de sa fin : le Carnet de l Annee', { cle: 'rythme-au-dessus', planId: 'pl-lune-annee' },
  M(venues, { formule: { planId: 'pl-lune-six', restantes: 2 } }));
dit('… la variante Signature suit', 'pl-lune-annee-sig', (M(venues, { formule: { planId: 'pl-lune-six-sig', restantes: 1 } }) as { planId?: string })?.planId);
dit('… encore cinq venues : rien', null, M(venues, { formule: { planId: 'pl-lune-six', restantes: 5 } }));
dit('… une formule sans compte (Chaque Lune) : rien', null, M(venues, { formule: { planId: 'pl-lune-gbeji' } }));
dit('… Les Premieres Lunes et le Carnet de Quatre menent au Carnet de Six', ['pl-lune-six', 'pl-lune-six'], [
  (M(venues, { formule: { planId: 'pl-lune-premieres', restantes: 2 } }) as { planId?: string })?.planId,
  (M(venues, { formule: { planId: 'pl-lune-quatre', restantes: 0 } }) as { planId?: string })?.planId,
]);
/* ④ le premier anniversaire */
dit('la couronne a un an dans 5 jours : le Carnet de l Annee', { cle: 'carnet-annee', planId: 'pl-lune-annee' },
  M([v('2026-12-01', ['sv-atl-i-med'])], { crownSince: '2026-01-25' }));
dit('… trente jours apres : encore ; trente et un : non', ['carnet-annee', null], [
  M([v('2026-12-01', ['sv-atl-i-med'])], { crownSince: '2025-12-21' })?.cle ?? null,
  M([v('2026-12-01', ['sv-atl-i-med'])], { crownSince: '2025-12-20' })?.cle ?? null,
]);
/* ⑤ la couronne nee ailleurs */
dit('un KOKO Accueil, aucune creation a la Maison : le Carnet de Quatre', { cle: 'carnet-quatre', planId: 'pl-lune-quatre' }, M([v('2026-11-03', ['sv-koko-sui'])]));
dit('… des visites d entretien sans creation : aussi', 'carnet-quatre', M([v('2026-11-03', ['sv-atl-ii-e'])])?.cle);
dit('… un KOKO Origine seul n est pas une couronne nee ailleurs', 'creation', M([v('2027-01-05', ['sv-koko-ori'])])?.cle);
dit('… le Carnet de Quatre deja pris : le Carnet de Six si trois visites', { cle: 'carnet-six', planId: 'pl-lune-six' },
  M(venues, { dejaPrises: new Set(['pl-lune-quatre']) }));
/* ⑥ trois visites */
const creeeIci = [v('2026-03-01', ['sv-atl-i-med']), ...venues];
dit('nee a la Maison, trois visites dans l annee : le Carnet de Six', { cle: 'carnet-six', planId: 'pl-lune-six' }, M(creeeIci));
dit('… sa derniere venue Signature : la variante Signature', 'pl-lune-six-sig',
  (M([...creeeIci, v('2027-01-02', ['sv-atl-ii-l'])]) as { planId?: string })?.planId);
dit('… la Signature pas en vente : le Carnet de Six', 'pl-lune-six',
  (M([...creeeIci, v('2027-01-02', ['sv-atl-ii-l'])], { enVente: new Set(['pl-lune-six']) }) as { planId?: string })?.planId);
dit('… deux visites dans l annee seulement : rien', null, M([v('2025-06-01', ['sv-atl-i-med']), v('2026-10-15', ['sv-atl-ii-e']), v('2026-12-01', ['sv-atl-ii-e'])]));
dit('… une seance de suite ne compte pas', null, M([v('2025-06-01', ['sv-atl-i-med']), v('2026-10-15', ['sv-atl-ii-e']), v('2026-12-01', ['sv-atl-ii-e']), v('2026-12-02', ['sv-atl-ii-e'], { seriesIndex: 2 })]));
/* ⑦ le Regard */
dit('un KOKO Origine il y a 15 jours, rien de cree : votre creation', { cle: 'creation' }, M([v('2027-01-05', ['sv-koko-ori'])]));
dit('… une creation deja reservee : rien', null, M([v('2027-01-05', ['sv-koko-ori'])], { creationAVenir: true }));
dit('… il y a 31 jours : rien', null, M([v('2026-12-20', ['sv-koko-ori'])]));
dit('un rendez-vous a venir ne compte pas comme une visite', null,
  M([v('2026-05-01', ['sv-atl-i-med']), v('2027-02-01', ['sv-atl-ii-e']), v('2027-03-01', ['sv-atl-ii-e']), v('2027-04-01', ['sv-atl-ii-e'])]));
dit('une visite non honoree ne compte pas', null, M([v('2027-01-10', ['sv-atl-i-med'], { status: 'confirmé' })]));

/* ── Les ecrans (commentaires effaces) ── */
const sansCom = (f: string) => readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '');
const carte = sansCom('src/apps/couronne/ProchaineMarche.tsx');
dit('la carte se tait avant janvier, sauf a l essai', true, /if \(!client \|\| \(!apercu && phaseDeLaGrille\(jour\) !== 'janvier'\)\) return null;/.test(carte));
dit('ce qui part a la Maison reste en francais', [true, false], [
  /encodeURIComponent\(`Bonjour, je voudrais parler de « \$\{sujetFr\} »\.`\)/.test(carte), /wa\.me[^\n]*\bt\(/.test(carte),
]);
dit('en vente pour elle : visibles et ouvertes ; la Cure lue au catalogue visible', [true, true], [
  /formulesPourElle\(visibles, aUnFoyer\)/.test(carte) && /formulesVisiblesPour\(\{ cfg, masques: client\.vitrineMasques, plans \}\)/.test(carte),
  /servicesVisibles\.some\(\(s\) => s\.id === CURE_DE_LUMIERE\)/.test(carte),
]);
dit('le prix pour sa tete, par le calcul de Ma formule', true, /prixDeLaFormule\(plan, 'mensuel', maTete, calibresAbo\)/.test(carte));
dit('l accueil la montre, l app lui donne l onglet formule', [true, true], [
  /<ProchaineMarche appts=\{clientAppts\} onOpenBooking=\{onOpenBooking\} goFormule=\{goFormule\} \/>/.test(sansCom('src/apps/couronne/Tabs.tsx')),
  /goFormule=\{visibleTabs\.some\(\(t\) => t\.id === 'formule'\) \? \(\) => setTab\('formule'\) : undefined\}/.test(sansCom('src/apps/couronne/App.tsx')),
]);
dit('le juge est pur', false, /^\s*import\s/m.test(sansCom('src/shared/prochaine-marche-pur.ts')));

console.log(ko === 0 ? '\nLa prochaine marche tient.' : `\n${ko} epreuve(s) en echec.`);
