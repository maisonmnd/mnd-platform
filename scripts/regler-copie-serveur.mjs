/* LA COPIE DES RÈGLES DANS LA FONCTION `regler-la-seance` — 25 octobre 2026.
   Même montage que la Boutique (boutique-copie-serveur.mjs) : une fonction
   Edge se colle seule et n'importe rien de `src/`, elle porte donc une COPIE
   des règles de shared/regler-la-seance-pur.ts. `node scripts/regler-copie-serveur.mjs`
   réécrit la copie entre ses deux bornes, et le banc verifie-regler-la-seance
   compare les deux, mot pour mot. */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

/* Les chemins se donnent par la RACINE du dépôt : regroupé par esbuild dans un
   banc, ce module ne sait plus où il habite (le banc passe process.cwd()). */
const racine = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const source = (r = racine) => path.join(r, 'src', 'shared', 'regler-la-seance-pur.ts');
export const serveur = (r = racine) => path.join(r, 'supabase', 'functions', 'regler-la-seance', 'index.ts');
export const DEBUT = '// ── DEBUT copie de shared/regler-la-seance-pur.ts (verifie-regler-la-seance la compare, mot pour mot)';
export const FIN = '// ── FIN copie de shared/regler-la-seance-pur.ts';

/** Les déclarations que le serveur emporte, dans cet ordre. */
export const NOMS = [
  'ALPHABET_DU_JETON', 'LONGUEUR_DU_JETON', 'PREFIXE_DU_PARAMETRE', 'PREFIXE_DE_LA_REFERENCE', 'PREFIXE_DU_VERSEMENT',
  'CAISSE_EN_LIGNE', 'DECALAGE_DE_COTONOU_MS', 'LienDeReglement', 'ReglementEnLigne', 'LigneLue', 'VersementLu', 'PieceLue',
  'RdvLu', 'jetonDe', 'estUnJeton', 'parametreDuLien', 'jetonDuParametre', 'referenceDuRdv', 'jourDeCotonou', 'heureDeCotonou',
  'n', 'netDeLaLigne', 'totalDeLaPiece', 'regleDeLaPiece', 'resteDeLaPiece', 'laPieceDuRdv', 'EtatDuLien', 'etatDuLien',
  'partageDuPaiement', 'moyenDit', 'versementEnLigne', 'dejaInscrit', 'pieceReglee', 'rdvRegle', 'prenomDe', 'maitreDit',
  'lignesDites', 'pageDuLien',
];

const TETE = /^(?:export )?(?:type|const|function|async function) ([A-Za-z_][\w]*)/;

/** Les déclarations de tête d'un texte : nom → texte exact, du mot-clé à la
    ligne d'avant la déclaration ou le commentaire de tête suivant. */
export function declarations(texte) {
  const lignes = texte.replace(/\r\n/g, '\n').split('\n');
  const out = new Map();
  let nom = null; let corps = [];
  const ferme = () => { if (nom) out.set(nom, corps.join('\n').replace(/\s+$/, '')); nom = null; corps = []; };
  for (const l of lignes) {
    const m = TETE.exec(l);
    if (m) { ferme(); nom = m[1]; corps = [l]; continue; }
    if (/^(\/\*|\/\/|import |Deno\.serve)/.test(l)) { ferme(); continue; }
    if (nom) corps.push(l);
  }
  ferme();
  return out;
}

export function copieAttendue(r = racine) {
  const d = declarations(readFileSync(source(r), 'utf8'));
  const manquent = NOMS.filter((n) => !d.has(n));
  if (manquent.length) throw new Error(`regler-la-seance-pur.ts ne déclare plus : ${manquent.join(', ')}`);
  return NOMS.map((n) => d.get(n)).join('\n\n');
}

export function copieDuServeur(r = racine) {
  const t = readFileSync(serveur(r), 'utf8').replace(/\r\n/g, '\n');
  const a = t.indexOf(DEBUT); const b = t.indexOf(FIN);
  if (a < 0 || b < a) throw new Error('bornes de la copie introuvables dans la fonction regler-la-seance');
  return t.slice(a + DEBUT.length, b).trim();
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const t = readFileSync(serveur(), 'utf8').replace(/\r\n/g, '\n');
  const a = t.indexOf(DEBUT); const b = t.indexOf(FIN);
  if (a < 0 || b < a) throw new Error('bornes introuvables');
  writeFileSync(serveur(), `${t.slice(0, a + DEBUT.length)}\n${copieAttendue()}\n${t.slice(b)}`);
  console.log('copie de regler-la-seance-pur.ts réécrite dans supabase/functions/regler-la-seance/index.ts');
}
