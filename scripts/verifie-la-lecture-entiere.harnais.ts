/* LA LECTURE ENTIERE D'UNE TABLE, EPROUVEE — `node scripts/verifie-la-lecture-entiere.mjs`.

   Supabase ne rend jamais plus de mille lignes par requete. Le jour ou la
   table des rendez-vous a passe mille lignes (30 septembre 2026), la
   synchronisation du Trone s'est mise a lire une TRANCHE en la prenant pour
   la table : des rendez-vous disparaissaient, revenaient, repartaient, et
   tout l'ecran se recalculait en boucle.

   Ce harnais porte la REGLE, pas le cas du jour : une lecture de table rend
   TOUTES les lignes, quelle que soit la taille, ou rend une erreur. Et la
   synchronisation ne lit plus jamais une table autrement. */
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { litToutesLesPages, PAGE_DE_LECTURE, type LecteurDePage } from '../src/shared/lecture-entiere';

let ko = 0;
const dit = (nom: string, attendu: unknown, obtenu: unknown) => {
  const ok = JSON.stringify(attendu) === JSON.stringify(obtenu);
  if (!ok) ko++;
  console.log(`${ok ? 'OK   ' : 'ECHEC'} ${nom} -> ${JSON.stringify(obtenu)}`);
  if (!ok) console.log(`       attendu ${JSON.stringify(attendu)}`);
};

/* Un faux serveur qui fait comme le vrai : jamais plus de `plafond` lignes
   par reponse, dans l'ordre des id, apres l'id demande. Il compte ses appels. */
type Ligne = { id: string; data: number };
const table = (n: number): Ligne[] => Array.from({ length: n }, (_, i) => ({ id: `r-${String(i).padStart(6, '0')}`, data: i }));
const serveur = (lignes: Ligne[], plafond = 1000) => {
  const etat = { appels: 0 };
  const lit: LecteurDePage<Ligne> = async (apres, taille) => {
    etat.appels += 1;
    const tri = [...lignes].sort((a, b) => (a.id < b.id ? -1 : 1));
    const suite = apres === null ? tri : tri.filter((l) => l.id > apres);
    return { data: suite.slice(0, Math.min(taille, plafond)), error: null };
  };
  return { lit, etat };
};

/* ── 1. La regle : toutes les lignes, quelle que soit la taille ── */
for (const n of [0, 1, 999, 1000, 1001, 2500]) {
  const s = serveur(table(n));
  const r = await litToutesLesPages(s.lit);
  dit(`une table de ${n} lignes rend ${n} lignes`, n, r.data?.length ?? -1);
  dit(`... toutes differentes`, n, new Set((r.data ?? []).map((l) => l.id)).size);
  dit(`... en ${Math.floor(n / PAGE_DE_LECTURE) + 1} page(s)`, Math.floor(n / PAGE_DE_LECTURE) + 1, s.etat.appels);
}

/* ── 2. La panne d'avant, remise en place : une seule requete rend mille lignes ── */
{
  const s = serveur(table(2500));
  const tranche = await s.lit(null, 1_000_000);
  dit('le serveur plafonne bien a mille, meme si on en demande un million', 1000, tranche.data?.length ?? -1);
}

/* ── 3. Une ligne inseree PENDANT la lecture ne decale rien ── */
{
  const lignes = table(2000);
  let appels = 0;
  const lit: LecteurDePage<Ligne> = async (apres, taille) => {
    appels += 1;
    /* Entre la premiere et la deuxieme page, un autre poste insere une ligne
       qui se range AVANT celles deja lues. Une lecture par numero de rang
       rendrait alors deux fois la ligne 999 ; par « apres tel id », non. */
    if (appels === 2) lignes.push({ id: 'r-000000a', data: -1 });
    const tri = [...lignes].sort((a, b) => (a.id < b.id ? -1 : 1));
    const suite = apres === null ? tri : tri.filter((l) => l.id > apres);
    return { data: suite.slice(0, taille), error: null };
  };
  const r = await litToutesLesPages(lit);
  dit('une insertion en cours de lecture ne double aucune ligne', 2000, new Set((r.data ?? []).map((l) => l.id)).size);
  dit('... et aucune des deux mille lignes de depart ne manque', 2000, (r.data ?? []).filter((l) => l.data >= 0).length);
}

/* ── 4. Une erreur en route rend l'erreur, et AUCUNE ligne ── */
{
  let appels = 0;
  const lit: LecteurDePage<Ligne> = async (apres, taille) => {
    appels += 1;
    if (appels === 2) return { data: null, error: { message: 'reseau coupe' } };
    return { data: table(3000).filter((l) => apres === null || l.id > apres).slice(0, taille), error: null };
  };
  const r = await litToutesLesPages(lit);
  dit('une page en erreur rend l erreur', 'reseau coupe', r.error?.message ?? null);
  dit('... et pas une table a moitie lue', null, r.data);
}

/* ── 5. Un serveur qui rend toujours une page pleine ne nous garde pas pour toujours ── */
{
  let appels = 0;
  const lit: LecteurDePage<Ligne> = async () => { appels += 1; return { data: [{ id: 'x', data: 0 }], error: null }; };
  const r = await litToutesLesPages(lit, 1);
  dit('une table sans fin s arrete sur une erreur', true, !!r.error && r.data === null);
  dit('... apres un nombre borne de pages', true, appels <= 2000);
}

/* ── 6. La synchronisation ne lit plus une table autrement ── */
{
  /* Les commentaires s'effacent avant de scanner : ils racontent la panne. */
  const source = readFileSync('src/shared/sync.ts', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const lectures = source.match(/\.select\('id,data'\)/g) ?? [];
  const paginees = source.match(/\.select\('id,data'\)\s*\.order\('id'/g) ?? [];
  dit('sync.ts : chaque lecture de table est ordonnee par id (donc paginee)', lectures.length, paginees.length);
  dit('... et il n en reste qu une, celle du lecteur de pages', 1, lectures.length);
  dit('... qui passe par litToutesLesPages', true, source.includes('litToutesLesPages'));
}

/* ── 7. Les copies des fonctions Edge (9 octobre 2026) ──
   Une fonction Edge ne lit rien du depot : celle qui doit lire une table
   entiere recopie ce module entre ses reperes ⟨lecture-entiere⟩ (depuis
   `PAGE_DE_LECTURE` jusqu'a la fin du fichier ; c'est la qu'est ne
   `fichesDuNumero` de demande-submit, qui lisait d'un seul trait les fiches
   d'un numero et prenait, au-dela de mille, une cliente connue pour une
   nouvelle). La regle, pour TOUTE fonction qui porte le repere : la copie
   est l'original caractere pour caractere, elle tourne seule (aucun import
   manquant) avec le meme faux serveur, et chaque lecteur de pages qu'elle
   sert lit « apres tel id », dans l'ordre des id, une page a la fois. */
{
  const lf = (s: string) => s.replace(/\r\n/g, '\n');
  const original = lf(readFileSync('src/shared/lecture-entiere.ts', 'utf8'));
  const ori = original.slice(original.indexOf('export const PAGE_DE_LECTURE')).trimEnd();
  const fichiers: string[] = [];
  const marche = (d: string) => {
    for (const n of readdirSync(d)) {
      const p = `${d}/${n}`;
      if (statSync(p).isDirectory()) marche(p);
      else if (/\.(ts|js)$/.test(n)) fichiers.push(p);
    }
  };
  marche('supabase/functions');
  const OUVRE = '/* ⟨lecture-entiere⟩ */\n';
  const FERME = '\n/* ⟨/lecture-entiere⟩ */';
  const copies = fichiers.map((f) => ({ f, src: lf(readFileSync(f, 'utf8')) })).filter((c) => c.src.includes(OUVRE));
  dit('au moins une fonction Edge porte la copie (sinon cette regle ne verrait rien)', true, copies.length >= 1);
  const { transform } = await import(pathToFileURL(path.join(process.cwd(), 'node_modules/esbuild/lib/main.js')).href) as typeof import('esbuild');
  for (const { f, src } of copies) {
    const i = src.indexOf(OUVRE);
    const k = src.indexOf(FERME, i);
    const bloc = k < 0 ? '' : src.slice(i + OUVRE.length, k);
    dit(`${f} : la copie est l original, caractere pour caractere`, true, ori.length > 100 && bloc.trimEnd() === ori);
    const { code } = await transform(bloc, { loader: 'ts', format: 'esm' });
    const banc = mkdtempSync(path.join(os.tmpdir(), 'lecture-entiere-'));
    let copie: { litToutesLesPages: typeof litToutesLesPages };
    try {
      writeFileSync(path.join(banc, 'copie.mjs'), code);
      copie = await import(pathToFileURL(path.join(banc, 'copie.mjs')).href);
    } finally {
      rmSync(banc, { recursive: true, force: true });
    }
    const s = serveur(table(2500));
    const r = await copie.litToutesLesPages(s.lit);
    dit(`... et, executee, elle rend les 2500 lignes en 3 pages`, [2500, 3], [r.data?.length ?? -1, s.etat.appels]);
    let appels = 0;
    const enPanne: LecteurDePage<Ligne> = async (apres, taille) => {
      appels += 1;
      if (appels === 2) return { data: null, error: { message: 'reseau coupe' } };
      return { data: table(3000).filter((l) => apres === null || l.id > apres).slice(0, taille), error: null };
    };
    dit(`... et une erreur en route ne rend aucune ligne`, null, (await copie.litToutesLesPages(enPanne)).data);
    /* Les appels, hors du bloc : chaque lecteur lit apres tel id, dans l'ordre. */
    const dehors = (src.slice(0, i) + src.slice(k)).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    const lecteurs = [...dehors.matchAll(/litToutesLesPages(?:<[^>]*>)?\(/g)].map((m) => dehors.slice(m.index ?? 0, (m.index ?? 0) + 500));
    dit(`${f} : chaque lecteur de pages lit apres tel id, par id croissant, une page a la fois`, [],
      lecteurs.filter((t) => !(/\.gt\('id', apres\)/.test(t) && /\.order\('id', \{ ascending: true \}\)/.test(t) && /\.limit\(taille\)/.test(t))).map((t) => t.slice(0, 80)));
    dit(`... et il y en a au moins un (une copie qui ne sert pas est un oubli)`, true, lecteurs.length >= 1);
  }
}

console.log(ko === 0 ? '\nLa lecture entiere tient.' : `\n${ko} controle(s) en echec.`);
process.exit(ko === 0 ? 0 : 1);
