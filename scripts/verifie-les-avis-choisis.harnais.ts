/* LES AVIS GOOGLE CHOISIS PAR LA MAISON, ÉPROUVÉS — 10 octobre 2026.

   « Les avis Google qui sont sur le site, je veux avoir la possibilité de
   les sélectionner, pas de mettre les derniers sur mon site en permanence »
   (Yéman). Décisions : choisir PARMI LES AVIS DU MOMENT ; rien de coché, le
   site montre ceux de Google. Règle de Google : dire comment les avis sont
   triés et filtrés, ne pas garder leur texte.

   Les attendus sont écrits à la main. `node scripts/verifie-les-avis-choisis.mjs`
   (`--prouve` remet chaque faute une à une et exige que le banc crie). */
import { readFileSync } from 'node:fs';
import {
  avisAMontrer, basculeLeChoix, choixDisparus, cleDeLAvis, deplaceLeChoix, mentionDuTri,
} from '../src/shared/avis-google-pur';

let ko = 0;
const ascii = (s: string) => s.replace(/[^\x20-\x7e]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);
const dit = (nom: string, attendu: unknown, obtenu: unknown) => {
  const ok = JSON.stringify(attendu) === JSON.stringify(obtenu);
  if (!ok) { ko++; process.exitCode = 1; }
  console.log(ascii(`${ok ? 'OK   ' : 'ECHEC'} ${nom} -> ${JSON.stringify(obtenu)}`));
  if (!ok) console.log(ascii(`       attendu ${JSON.stringify(attendu)}`));
};

/* Cinq avis fictifs, dans l'ordre où Google les rend. */
const A = { auteur: 'Afi', note: 5, texte: 'Accueil chaleureux, locks impeccables.' };
const B = { auteur: 'Bola', note: 5, texte: 'Je recommande la Maison.' };
const C = { auteur: 'Chimène', note: 4, texte: 'Très bien, un peu d’attente.' };
const D = { auteur: 'Dodji', note: 5, texte: 'Le meilleur entretien de Cotonou.' };
const E = { auteur: 'Edwige', note: 3, texte: 'Correct.' };
const G = [A, B, C, D, E];
const k = (a: { auteur: string; texte: string }) => cleDeLAvis(a);
const noms = (l: { auteur: string }[]) => l.map((a) => a.auteur);

/* ── 1. La clé ── */
dit('la cle a sa forme', true, /^av-[0-9a-z]+$/.test(k(A)));
dit('la cle ne garde aucun texte de Google', false, k(A).includes('Afi') || k(A).includes('Accueil'));
dit('les espaces et retours a la ligne ne changent pas la cle', k(A), k({ auteur: '  Afi ', texte: 'Accueil   chaleureux,\nlocks impeccables. ' }));
dit('un autre texte, une autre cle', false, k(A) === k({ auteur: 'Afi', texte: 'Accueil chaleureux.' }));
dit('un autre auteur, une autre cle', false, k(A) === k({ auteur: 'Afia', texte: A.texte }));
dit('cinq avis, cinq cles', 5, new Set(G.map(k)).size);

/* ── 2. Ce que le site montre ── */
dit('rien de coche : les avis de Google, dans leur ordre', { noms: ['Afi', 'Bola', 'Chimène', 'Dodji', 'Edwige'], mode: 'google' },
  (({ avis, mode }) => ({ noms: noms(avis), mode }))(avisAMontrer(G, [])));
dit('choix absent (config ancienne) : les avis de Google', 'google', avisAMontrer(G, undefined).mode);
dit('deux coches : eux seuls, dans l ordre de la Maison', { noms: ['Dodji', 'Afi'], mode: 'choix' },
  (({ avis, mode }) => ({ noms: noms(avis), mode }))(avisAMontrer(G, [k(D), k(A)])));
dit('un coche que Google ne renvoie plus est saute', ['Bola'],
  noms(avisAMontrer(G, ['av-disparu', k(B)]).avis));
dit('plus aucun coche renvoye : retour aux avis de Google', { n: 5, mode: 'google' },
  (({ avis, mode }) => ({ n: avis.length, mode }))(avisAMontrer(G, ['av-disparu', 'av-parti'])));
dit('une cle en double ne montre pas deux fois l avis', ['Chimène'], noms(avisAMontrer(G, [k(C), k(C)]).avis));
dit('aucun avis releve, rien de coche : rien', { n: 0, mode: 'google' },
  (({ avis, mode }) => ({ n: avis.length, mode }))(avisAMontrer([], [])));

/* ── 3. La mention exigée par Google ── */
dit('mention du choix', 'Avis choisis par la Maison parmi ceux laissés sur Google.', mentionDuTri('choix'));
dit('mention de Google', 'Les avis les plus pertinents selon Google.', mentionDuTri('google'));

/* ── 4. Cocher, ordonner, nettoyer ── */
dit('cocher range a la fin', [k(B), k(D)], basculeLeChoix([k(B)], k(D)));
dit('decocher retire', [k(D)], basculeLeChoix([k(B), k(D)], k(B)));
dit('monter d une place', [k(D), k(B)], deplaceLeChoix([k(B), k(D)], k(D), -1));
dit('descendre d une place', [k(D), k(B)], deplaceLeChoix([k(B), k(D)], k(B), 1));
dit('le premier ne monte pas', [k(B), k(D)], deplaceLeChoix([k(B), k(D)], k(B), -1));
dit('le dernier ne descend pas', [k(B), k(D)], deplaceLeChoix([k(B), k(D)], k(D), 1));
dit('les coches disparus', ['av-disparu'], choixDisparus([k(A), 'av-disparu'], G));

/* ── 5. Les deux écrans lisent le même juge (commentaires effacés) ── */
const sansCom = (f: string) => readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const site = sansCom('src/apps/revelateur/ilots/Avis.tsx');
dit('site : avisAMontrer sur le choix lu, la liste affichee est la sienne, la mention dite', [true, true, true, false], [
  new RegExp(String.raw`avisAMontrer\(avis\.avis, choisis\)`).test(site),
  new RegExp(String.raw`vue\.avis\.map\(`).test(site),
  new RegExp(String.raw`mentionDuTri\(vue\.mode\)`).test(site),
  new RegExp(String.raw`avis\.avis\.map\(`).test(site),
]);
const maison = sansCom('src/apps/revelateur/maison.ts');
dit('site : le choix se lit dans mnd_vitrine_config (lisible sans compte)', true,
  new RegExp(String.raw`export async function avisChoisis\(\)[\s\S]{0,300}eq\('key', 'mnd_vitrine_config'\)`).test(maison));
const trone = sansCom('src/apps/trone/routes/clients/VitrineSite.tsx');
dit('Trone : le choix s ecrit dans avisChoisis, par les fonctions du juge', [true, true, true, true], [
  new RegExp(String.raw`vitrineConfigStore\.set\(\(c\) => \(\{ \.\.\.c, avisChoisis: liste \}\)\)`).test(trone),
  new RegExp(String.raw`basculeLeChoix\(choisis, cle\)`).test(trone),
  new RegExp(String.raw`deplaceLeChoix\(choisis, cle, -1\)`).test(trone),
  new RegExp(String.raw`<ChoixDesAvis avis=`).test(trone),
]);
const pur = sansCom('src/shared/avis-google-pur.ts');
dit('le juge est pur : aucun import', false, /^\s*import\s/m.test(pur));

console.log(ko === 0 ? '\nLes avis choisis tiennent.' : `\n${ko} epreuve(s) en echec.`);
