/* LES FORMULES FERMÉES À LA VENTE, ÉPROUVÉES — 10 octobre 2026.

   La genèse des prix, correction 4, décidée au sélecteur par Yéman :
   « Fermer aujourd'hui » les six formules vendables à 0 F. Une formule fermée
   ne se propose plus à une nouvelle abonnée (comptoir, Ma Couronne, carte de
   la Maison) ; ses contrats en cours la lisent toujours ; elle se rouvre d'un
   geste, et une formule rouverte ne se referme jamais toute seule.

   Les attendus sont écrits à la main. `node scripts/verifie-les-formules-fermees.mjs`
   (`--prouve` remet chaque faute une à une et exige que le banc crie). */
import { readFileSync } from 'node:fs';
import {
  FORMULES_A_ZERO_DU_10_OCTOBRE, basculeLaVente, choixDeVente, estOuverteALaVente,
  fermeLesFormulesAZero, ouvertesALaVente, premiereOuverte,
} from '../src/shared/formules-fermees-pur';

let ko = 0;
const ascii = (s: string) => s.replace(/[^\x20-\x7e]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);
const dit = (nom: string, attendu: unknown, obtenu: unknown) => {
  const ok = JSON.stringify(attendu) === JSON.stringify(obtenu);
  if (!ok) { ko++; process.exitCode = 1; }
  console.log(ascii(`${ok ? 'OK   ' : 'ECHEC'} ${nom} -> ${JSON.stringify(obtenu)}`));
  if (!ok) console.log(ascii(`       attendu ${JSON.stringify(attendu)}`));
};

type F = { id: string; priceXof: number; prixParCalibre?: Record<string, number>; fermee?: boolean; fermeeLe?: string };
const JOUR = '2026-10-10';
const ids = (l: { id: string }[]) => l.map((p) => p.id);

/* ── 1. Les six, écrits à la main (catalogue vivant relu le 10 octobre) ── */
dit('les six formules a 0 F, et elles seules', [
  '1YGn657fDvaW2IKUt1v4', '8NNx7ntL2qkzlybI3X76', 'DaKUkEMhDbPF5C7DRgtl',
  'UEQdE224xMJBJ1aGwG39', 'eiuyJirEWGr1sjpxg2mi', 'mlaZXBKRR4to793TZ47U',
], [...FORMULES_A_ZERO_DU_10_OCTOBRE].sort());

/* ── 2. Ouverte, fermée ── */
dit('jamais touchee : ouverte', true, estOuverteALaVente({}));
dit('rouverte (false ecrit) : ouverte', true, estOuverteALaVente({ fermee: false }));
dit('fermee : pas ouverte', false, estOuverteALaVente({ fermee: true }));

const A: F = { id: 'a', priceXof: 85000 };
const B: F = { id: 'b', priceXof: 0, fermee: true, fermeeLe: JOUR };
const C: F = { id: 'c', priceXof: 140000, fermee: false };
dit('les ouvertes, dans leur ordre', ['a', 'c'], ids(ouvertesALaVente([A, B, C])));
dit('la premiere ouverte saute la fermee', 'c', premiereOuverte([B, C, A])?.id);
dit('aucune ouverte : rien', undefined, premiereOuverte([B]));

/* ── 3. Le menu de vente ── */
dit('menu : la fermee non choisie ne s y glisse pas', ['a', 'c'], ids(choixDeVente([A, B, C], 'a')));
dit('menu : la fermee deja choisie reste, a sa place', ['a', 'b', 'c'], ids(choixDeVente([A, B, C], 'b')));
dit('menu : rien de choisi', ['a', 'c'], ids(choixDeVente([A, B, C], '')));

/* ── 4. Fermer, rouvrir à la main ── */
dit('fermer ecrit true et le jour', { id: 'a', priceXof: 85000, fermee: true, fermeeLe: JOUR }, basculeLaVente(A, JOUR));
const rouverte = basculeLaVente(B, JOUR);
dit('rouvrir ecrit false (et pas absent)', false, rouverte.fermee);
dit('rouvrir efface le jour', undefined, rouverte.fermeeLe);

/* ── 5. La fermeture d'office ── */
const Z = (id: string, x: Partial<F> = {}): F => ({ id, priceXof: 0, ...x });
const SIX = FORMULES_A_ZERO_DU_10_OCTOBRE;
const catalogue: F[] = [
  Z(SIX[0]), Z(SIX[1]), Z(SIX[2]), Z(SIX[3]), Z(SIX[4]), Z(SIX[5]),
  { id: 'pl-mkt-eclosion', priceXof: 85000 },
  Z('pl-autre-a-zero'),
];
const r = fermeLesFormulesAZero(catalogue, JOUR);
dit('les six ferment, datees', SIX.map((id) => ({ id, fermee: true, le: JOUR })),
  (r?.plans ?? []).filter((p) => p.fermee).map((p) => ({ id: p.id, fermee: p.fermee, le: p.fermeeLe })));
dit('les fermees sont dites', [...SIX], r?.fermees);
dit('une autre formule a 0 F ne se ferme pas d office', undefined, r?.plans.find((p) => p.id === 'pl-autre-a-zero')?.fermee);
dit('une formule vendue ne bouge pas', { id: 'pl-mkt-eclosion', priceXof: 85000 }, r?.plans.find((p) => p.id === 'pl-mkt-eclosion'));
dit('rejouee : rien a faire', null, fermeLesFormulesAZero(r?.plans ?? [], JOUR));
dit('une des six rouverte a la main ne se referme pas', null, fermeLesFormulesAZero([Z(SIX[2], { fermee: false })], JOUR));
dit('une des six qui a recu un prix reste ouverte', null, fermeLesFormulesAZero([Z(SIX[0], { priceXof: 120000 })], JOUR));
dit('une des six qui a recu un prix par calibre reste ouverte', null, fermeLesFormulesAZero([Z(SIX[4], { prixParCalibre: { 'bd-medium': 90000 } })], JOUR));
dit('une case de calibre a 0 ne compte pas pour un prix', [SIX[5]], fermeLesFormulesAZero([Z(SIX[5], { prixParCalibre: { 'bd-medium': 0 } })], JOUR)?.fermees);
dit('catalogue vide : rien', null, fermeLesFormulesAZero([], JOUR));

/* ── 6. Les écrans lisent le même juge (commentaires effacés) ── */
const sansCom = (f: string) => readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\s*\}/g, '{}').replace(/^\s*\/\/.*$/gm, '');
const abo = sansCom('src/shared/abonnements.ts');
dit('Ma Couronne : formulesPourElle retire les fermees avant tout', true,
  new RegExp(String.raw`export const formulesPourElle[\s\S]{0,260}const ouvertes = ouvertesALaVente\(plans\);[\s\S]{0,120}return aUnFoyer \? ouvertes : ouvertes\.filter`).test(abo));
dit('la migration ferme par le juge, depuis le magasin des formules', true,
  new RegExp(String.raw`fermeLesFormulesAZero\(plansStore\.get\(\), isoDuJour\(new Date\(\)\)\)`).test(abo));
const ecran = sansCom('src/apps/trone/routes/equipe/Abonnements.tsx');
dit('comptoir : vente et contrat lisent choixDeVente, defaut premiereOuverte (x4), bouton par basculeLaVente', [true, true, 4, true, false], [
  new RegExp(String.raw`choixDeVente\(plans, subForm\.planId\)\.map\(`).test(ecran),
  new RegExp(String.raw`choixDeVente\(plans, contratEdit\.planId\)\.map\(`).test(ecran),
  (ecran.match(/planId: premiereOuverte\(plans\)\?\.id \?\? ''/g) ?? []).length,
  new RegExp(String.raw`basculeLaVente\(x, isoDuJour\(new Date\(\)\)\)`).test(ecran),
  /planId: plans\[0\]\?\.id/.test(ecran),
]);
const carte = sansCom('src/apps/carte/App.tsx');
dit('carte de la Maison : les fermees ne defilent pas', true,
  /plans=\{gardeSurLaCarte\(ouvertesALaVente\(plans\), reglages\.formulesMasquees\)\}/.test(carte));
const main = sansCom('src/apps/trone/main.tsx');
dit('le Trone lance la fermeture d office au demarrage', true, /^migreLesFormulesAZero\(\);$/m.test(main));
const pur = sansCom('src/shared/formules-fermees-pur.ts');
dit('le juge est pur : aucun import', false, /^\s*import\s/m.test(pur));

console.log(ko === 0 ? '\nLes formules fermees tiennent.' : `\n${ko} epreuve(s) en echec.`);
