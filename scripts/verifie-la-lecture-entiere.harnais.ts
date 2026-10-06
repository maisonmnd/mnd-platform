/* LA LECTURE ENTIERE D'UNE TABLE, EPROUVEE — `node scripts/verifie-la-lecture-entiere.mjs`.

   Supabase ne rend jamais plus de mille lignes par requete. Le jour ou la
   table des rendez-vous a passe mille lignes (30 septembre 2026), la
   synchronisation du Trone s'est mise a lire une TRANCHE en la prenant pour
   la table : des rendez-vous disparaissaient, revenaient, repartaient, et
   tout l'ecran se recalculait en boucle.

   Ce harnais porte la REGLE, pas le cas du jour : une lecture de table rend
   TOUTES les lignes, quelle que soit la taille, ou rend une erreur. Et la
   synchronisation ne lit plus jamais une table autrement. */
import { readFileSync } from 'node:fs';
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

console.log(ko === 0 ? '\nLa lecture entiere tient.' : `\n${ko} controle(s) en echec.`);
process.exit(ko === 0 ? 0 : 1);
