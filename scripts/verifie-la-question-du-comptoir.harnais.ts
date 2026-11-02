/* LA QUESTION DU COMPTOIR, ÉPROUVÉE — `node scripts/verifie-la-question-du-comptoir.mjs`.

   « Comment nous avez-vous connus ? » (2 novembre 2026, le socle de la Maison
   intelligente) : une réponse fermée, d'un toucher, à chaque nouvelle fiche.
   La règle (src/shared/connue-par-pur.ts), le champ de la fiche
   (src/shared/clients.ts) et l'écran qui la pose (routes/clients/Customers.tsx).
   Fiches inventées. Sortie ASCII : la console de Windows. */
import {
  CANAUX_DE_CONNAISSANCE, CONNUE_PAR_DIT, RESEAUX, QUESTION_DU_COMPTOIR, estConnuePar, nouvellesParCanal,
} from '../src/shared/connue-par-pur';
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
};

/* 1. La liste fermée et ses mots. */
dit('R1 dix reponses fermees', 10, CANAUX_DE_CONNAISSANCE.length);
dit('R2 chaque reponse a son mot', true, CANAUX_DE_CONNAISSANCE.every((k) => typeof CONNUE_PAR_DIT[k] === 'string' && CONNUE_PAR_DIT[k].length > 0));
dit('R3 les reseaux sont les quatre de la Maison', ['instagram', 'facebook', 'tiktok', 'linkedin'], [...RESEAUX]);
dit('R4 la question est celle du plan', 'Comment nous avez-vous connus ?', QUESTION_DU_COMPTOIR);
dit('R5 un texte libre n est pas une reponse', false, estConnuePar('ma cousine Awa'));
dit('R6 une reponse connue l est', true, estConnuePar('instagram'));
dit('R7 rien n est pas une reponse', false, estConnuePar(undefined));
/* Civilité jamais supposée : aucun mot ne dit « elle » ou « il ». */
dit('R8 aucun mot ne suppose la civilite', [], CANAUX_DE_CONNAISSANCE.filter((k) => /\b(elle|il|une proche|un proche)\b/i.test(CONNUE_PAR_DIT[k])));

/* 2. Le compte du mois. */
const fiches = [
  { since: '2026-11-02', connuePar: 'instagram' },
  { since: '2026-11-03', connuePar: 'instagram' },
  { since: '2026-11-04', connuePar: 'tiktok' },
  { since: '2026-11-05', connuePar: 'bouche-a-oreille' },
  { since: '2026-11-06' },
  { since: '2026-11-07', connuePar: 'n importe quoi' },
  { since: '2026-11-08', connuePar: 'facebook', archived: true },
  { since: '2026-11-09', connuePar: 'marraine', segments: ['Enfant'] },
  { since: '2026-10-31', connuePar: 'instagram' },
];
const c = nouvellesParCanal(fiches, '2026-11');
dit('R9 instagram compte deux fois', 2, c.instagram);
dit('R10 les reseaux comptent ensemble', 3, c.reseaux);
dit('R11 sans reponse ou reponse inconnue : non dit', 2, c['non-dit']);
dit('R12 une fiche archivee ne compte pas', 0, c.facebook);
dit('R13 une fiche d enfant ne compte pas', 0, c.marraine);
dit('R14 le mois d avant ne compte pas', 6, c.total);
dit('R15 un mois vide', 0, nouvellesParCanal(fiches, '2026-12').total);

/* 3. La fiche et l'écran. */
const clients = readFileSync('src/shared/clients.ts', 'utf8');
dit('R16 la fiche porte connuePar et connueParLe', true, /connuePar\?: ConnuePar;/.test(clients) && /connueParLe\?: string;/.test(clients));
dit('R17 la provenance de naissance reste a part', true, /source\?: 'site' \| 'consultation' \| 'maison' \| 'whatsapp';/.test(clients));
const ecran = readFileSync('src/apps/trone/routes/clients/Customers.tsx', 'utf8');
const intake = ecran.slice(ecran.indexOf('function IntakeModal'), ecran.indexOf('function IntakeModal') + 12000);
dit('R18 la nouvelle fiche pose la question', true, intake.includes('<Field label={QUESTION_DU_COMPTOIR}>'));
dit('R19 la nouvelle fiche ne part pas sans reponse', true, /if \(!connuePar\) \{ setError\(/.test(intake));
dit('R20 la reponse et son jour sont ecrits', true, /connuePar,\s*\n\s*connueParLe: todayISO\(\),/.test(intake));
dit('R21 la fiche la change d un toucher', true, /onClick=\{\(\) => patch\(\{ connuePar: k, connueParLe: todayISO\(\) \}\)\}/.test(ecran));
dit('R22 le message d erreur ne suppose pas la civilite', false, /comment elle nous a connus/i.test(intake));

console.log(`\n${n - ko}/${n} epreuves tenues${ko ? ` ; ${ko} en echec` : ''}.`);
