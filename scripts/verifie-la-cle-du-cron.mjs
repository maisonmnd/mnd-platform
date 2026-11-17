/* LA CLÉ D'UNE PORTE, ÉPROUVÉE — `node scripts/verifie-la-cle-du-cron.mjs`.

   17 novembre 2026 (revue de code). Dix fonctions du serveur ne s'ouvrent qu'à
   une clé. Ce banc prouve trois choses :
     A. la règle (src/shared/cle-du-cron-pur.ts) : la comparaison dit vrai et
        faux comme `===`, une clé vide ne vaut jamais, et le refus n'écrit au
        journal que des longueurs ;
     B. les dix fonctions portent le bloc, caractère pour caractère, s'en
        servent à leur porte, et ne rendent plus aucune longueur ;
     C. plus aucune d'elles ne compare sa clé avec `===`.
   Aucun framework de test : un échec sort en code 1. Sortie ASCII. */
import { transform } from 'esbuild';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { COPIES, ecartsDesCopies, entre } from './terminer-copie-serveur.mjs';

const racine = path.resolve(import.meta.dirname, '..');
const lf = (s) => s.replace(/\r\n/g, '\n');
const lis = (f) => lf(readFileSync(path.join(racine, f), 'utf8'));
let n = 0;
const ascii = (v) => (JSON.stringify(v) ?? 'undefined').replace(/[^\x20-\x7e]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);
const dit = (nom, attendu, obtenu) => {
  n += 1;
  const ok = JSON.stringify(attendu) === JSON.stringify(obtenu);
  if (!ok) process.exitCode = 1;
  console.log(`${ok ? 'OK   ' : 'ECHEC'} ${nom}${ok ? '' : ` -> ${ascii(obtenu)}`}`);
  if (!ok) console.log(`       attendu ${ascii(attendu)}`);
};

/* ── A. LA RÈGLE ─────────────────────────────────────────────────────── */
const PUR = 'src/shared/cle-du-cron-pur.ts';
const dossier = mkdtempSync(path.join(tmpdir(), 'verifie-la-cle-du-cron-'));
try {
  const { code } = await transform(lis(PUR), { loader: 'ts', format: 'esm' });
  writeFileSync(path.join(dossier, 'pur.mjs'), code);
  const { memeCle, noteLeRefus } = await import(pathToFileURL(path.join(dossier, 'pur.mjs')).href);

  const CLE = 'sb_secret_Exemple-de-cle_0123456789abcdefgh';
  dit('la meme cle ouvre', true, memeCle(CLE, CLE));
  dit('une cle differente, plus courte, plus longue, ou d un seul signe : refusee', [false, false, false, false],
    [memeCle('sb_secret_Autre-cle-de-la-meme-longueur_0123456', CLE), memeCle(CLE.slice(0, -1), CLE), memeCle(`${CLE}x`, CLE), memeCle(`${CLE.slice(0, -1)}H`, CLE)]);
  dit('une cle vide ne vaut jamais, meme contre une cle vide (secret pas pose)', [false, false, false], [memeCle('', CLE), memeCle(CLE, ''), memeCle('', '')]);
  dit('les accents et les signes hors ASCII se comparent en octets', [true, false], [memeCle('clé-é', 'clé-é'), memeCle('clé-é', 'cle-e')]);
  /* Elle dit exactement ce que `===` disait, sur mille paires tirees au sort. */
  let ecarts = 0;
  let graine = 20261117;
  const hasard = () => { graine = (graine * 1103515245 + 12345) % 2147483648; return graine / 2147483648; };
  const mot = () => Array.from({ length: 1 + Math.floor(hasard() * 6) }, () => 'ab'[Math.floor(hasard() * 2)]).join('');
  for (let i = 0; i < 1000; i += 1) { const a = mot(); const b = mot(); if (memeCle(a, b) !== (a === b)) ecarts += 1; }
  dit('mille paires au hasard : le meme verdict que ===', 0, ecarts);

  const ecrits = [];
  const garde = console.error;
  console.error = (...a) => { ecrits.push(a); };
  try { noteLeRefus('une-fonction', CLE, 'eyJ-mauvaise'); } finally { console.error = garde; }
  const journal = JSON.stringify(ecrits);
  dit('le refus s ecrit au journal : la porte et les deux longueurs', [1, true, { attendueLg: CLE.length, recueLg: 12 }],
    [ecrits.length, String(ecrits[0]?.[0]).startsWith('une-fonction'), ecrits[0]?.[1]]);
  dit('... jamais une valeur', [false, false], [journal.includes(CLE), journal.includes('eyJ-mauvaise')]);
} finally {
  rmSync(dossier, { recursive: true, force: true });
}

/* ── B. LES DIX FONCTIONS ────────────────────────────────────────────── */
const copie = COPIES.find((c) => c.bloc === 'cle-du-cron');
const cibles = copie?.cibles ?? [];
dit('dix fonctions portent le bloc', 10, cibles.length);
dit('chaque copie est l original, caractere pour caractere', [], ecartsDesCopies(racine).filter((e) => e.includes('cle-du-cron')));
const original = entre(lis(PUR), 'cle-du-cron') ?? '';
dit('le bloc n importe ni n exporte rien (il vit dans une fonction Edge)', [false, false], [/^\s*import\s/m.test(original), /^\s*export\s/m.test(original)]);

const sansLeBloc = (f) => {
  const t = lis(f);
  const bloc = entre(t, 'cle-du-cron') ?? '';
  return bloc ? t.replace(bloc, '') : t;
};
const nomDe = (f) => f.split('/').at(-2);
dit('chaque porte compare par memeCle et note son refus a son nom', [],
  cibles.filter((f) => { const t = sansLeBloc(f); return !t.includes('memeCle(') || !t.includes(`noteLeRefus('${nomDe(f)}',`); }));
dit('aucune reponse ne porte plus de longueur de cle', [], cibles.filter((f) => /attendueLg|recueLg/.test(sansLeBloc(f))));
dit('une seule definition de memeCle par fonction', [], cibles.filter((f) => lis(f).split('const memeCle =').length - 1 !== 1));

/* ── C. PLUS DE `===` SUR UNE CLÉ ────────────────────────────────────── */
dit('aucune des dix ne compare plus sa cle avec === ou !==', [],
  cibles.filter((f) => /(cleRecue|recue|recu)\s*[!=]==\s*(service|attendu)\b|(service|attendu)\s*[!=]==\s*(cleRecue|recue|recu)\b/.test(sansLeBloc(f))));
dit('le refus du cron reste un 401 qui dit seulement « reserve »', [],
  cibles.filter((f) => !['whatsapp-webhook'].includes(nomDe(f)) && !/erreur: 'réservé au (cron|webhook)' \}(\), \{ status: 401 \}|, 401)/.test(sansLeBloc(f))));
dit('la poignee de main de Meta refuse en 403, sans longueur', true,
  /JSON\.stringify\(\{ erreur: 'jeton refusé' \}\), \{ status: 403 \}/.test(sansLeBloc('supabase/functions/whatsapp-webhook/index.ts')));

console.log(`\n${n} verifications.`);
console.log(process.exitCode ? 'ECHEC : une porte laisse encore fuir quelque chose.' : 'TOUT VA BIEN : les dix portes comparent sans rien laisser fuir.');
