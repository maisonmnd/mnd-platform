/* LES COPIES DE « RÉGLER PAR MTN » DANS LA FONCTION collecte-mtn — 11 novembre 2026.
   Une fonction Edge se colle seule et n'importe rien de `src/` : elle porte
   une COPIE des règles, entre ses repères « ⟨nom⟩ ». Ce script réécrit
   chaque copie depuis son original ; le banc verifie-collecte-mtn les
   compare, caractère pour caractère. Même montage que
   terminer-copie-serveur.mjs (dont il ne touche aucune cible).

     node scripts/collecte-copie-serveur.mjs            réécrit les copies
     node scripts/collecte-copie-serveur.mjs --verifie  dit seulement si elles sont à jour */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { declarations } from './regler-copie-serveur.mjs';

const racine = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FONCTION = 'supabase/functions/collecte-mtn/index.ts';

/** Chaque bloc, son original, et la fonction qui le porte. Le lot B
    emprunte l'honneur au règlement (la règle de regler-la-seance) et le
    prénom d'usage : leurs blocs, tels quels. */
export const COPIES = [
  { bloc: 'honneur-au-reglement', source: 'src/shared/terminer-et-regler-pur.ts', cibles: [FONCTION] },
  { bloc: 'prenom-d-usage', source: 'src/shared/civilite.ts', cibles: [FONCTION] },
  { bloc: 'collecte-mtn', source: 'src/shared/collecte-mtn-pur.ts', cibles: [FONCTION] },
];

/* LA PIÈCE ET LE VERSEMENT, déclarations de regler-la-seance-pur.ts (la
   règle de finance.ts que la page « Régler » dit déjà), entre deux bornes,
   dans cet ordre. */
export const REGLER = 'src/shared/regler-la-seance-pur.ts';
export const DEBUT = '// ── DEBUT copie de shared/regler-la-seance-pur.ts (collecte-copie-serveur la réécrit, verifie-collecte-mtn la compare)';
export const FIN = '// ── FIN copie de shared/regler-la-seance-pur.ts';
export const NOMS = [
  'DECALAGE_DE_COTONOU_MS', 'LienDeReglement', 'ReglementEnLigne', 'LigneLue', 'VersementLu', 'PieceLue', 'RdvLu', 'LienDuFoyer',
  'ALPHABET_DU_JETON', 'LONGUEUR_DU_JETON', 'estUnJeton', 'jourDeCotonou', 'heureDeCotonou',
  'n', 'netDeLaLigne', 'totalDeLaPiece', 'regleDeLaPiece', 'resteDeLaPiece', 'laPieceDuRdv', 'rdvRegle',
];

const lf = (s) => s.replace(/\r\n/g, '\n');
const ouvre = (nom) => `/* ⟨${nom}⟩ */\n`;
const ferme = (nom) => `\n/* ⟨/${nom}⟩ */`;

export function copieAttendue(r = racine) {
  const d = declarations(readFileSync(path.join(r, REGLER), 'utf8'));
  const manquent = NOMS.filter((x) => !d.has(x));
  if (manquent.length) throw new Error(`regler-la-seance-pur.ts ne déclare plus : ${manquent.join(', ')}`);
  return NOMS.map((x) => d.get(x)).join('\n\n');
}

export function copieDuServeur(r = racine) {
  const t = lf(readFileSync(path.join(r, FONCTION), 'utf8'));
  const a = t.indexOf(DEBUT); const b = t.indexOf(FIN);
  if (a < 0 || b < a) return null;
  return t.slice(a + DEBUT.length, b).trim();
}

/** Le texte d'un bloc entre ses repères, ou null. */
export function entre(src, nom) {
  const i = src.indexOf(ouvre(nom));
  const k = src.indexOf(ferme(nom), i);
  return i < 0 || k < 0 ? null : src.slice(i + ouvre(nom).length, k);
}

/** Les écarts entre les copies et leurs originaux (une ligne par écart). */
export function ecartsDesCopies(r = racine) {
  const ecarts = [];
  for (const c of COPIES) {
    const original = entre(lf(readFileSync(path.join(r, c.source), 'utf8')), c.bloc);
    if (original === null) { ecarts.push(`${c.source} : l original de ⟨${c.bloc}⟩ est introuvable`); continue; }
    for (const cible of c.cibles) {
      let texte = '';
      try { texte = lf(readFileSync(path.join(r, cible), 'utf8')); } catch { ecarts.push(`${cible} : fichier absent`); continue; }
      const copie = entre(texte, c.bloc);
      if (copie === null) ecarts.push(`${cible} : les reperes de ⟨${c.bloc}⟩ manquent`);
      else if (copie !== original) ecarts.push(`${cible} : ⟨${c.bloc}⟩ differe de ${c.source}`);
    }
  }
  const copie = copieDuServeur(r);
  if (copie === null) ecarts.push(`${FONCTION} : les bornes de la copie de ${REGLER} manquent`);
  else if (copie !== copieAttendue(r)) ecarts.push(`${FONCTION} : la copie de ${REGLER} differe`);
  return ecarts;
}

/* Lancé pour lui-même seulement : regroupé par esbuild dans un banc, ce
   module porte l'adresse du paquet, pas la sienne. */
if (process.argv[1] && path.basename(process.argv[1]) === 'collecte-copie-serveur.mjs') {
  if (process.argv.includes('--verifie')) {
    const ecarts = ecartsDesCopies();
    console.log(ecarts.length ? ecarts.join('\n') : 'Les copies sont a jour.');
    process.exit(ecarts.length ? 1 : 0);
  }
  const ecris = (chemin, avant, neuf) => {
    if (neuf === avant.texte) return false;
    writeFileSync(chemin, avant.crlf ? neuf.replace(/\n/g, '\r\n') : neuf);
    return true;
  };
  for (const c of COPIES) {
    const original = entre(lf(readFileSync(path.join(racine, c.source), 'utf8')), c.bloc);
    if (original === null) throw new Error(`${c.source} : l'original de ⟨${c.bloc}⟩ est introuvable`);
    for (const cible of c.cibles) {
      const chemin = path.join(racine, cible);
      const brut = readFileSync(chemin, 'utf8');
      const avant = { texte: lf(brut), crlf: brut.includes('\r\n') };
      const i = avant.texte.indexOf(ouvre(c.bloc));
      const k = avant.texte.indexOf(ferme(c.bloc), i);
      if (i < 0 || k < 0) throw new Error(`${cible} : les repères de ⟨${c.bloc}⟩ manquent (posez « /* ⟨${c.bloc}⟩ */ » puis « /* ⟨/${c.bloc}⟩ */ » sur deux lignes)`);
      const neuf = `${avant.texte.slice(0, i + ouvre(c.bloc).length)}${original}${avant.texte.slice(k)}`;
      console.log(`${cible} : ⟨${c.bloc}⟩ ${ecris(chemin, avant, neuf) ? 'reecrit' : 'deja a jour'}`);
    }
  }
  const chemin = path.join(racine, FONCTION);
  const brut = readFileSync(chemin, 'utf8');
  const avant = { texte: lf(brut), crlf: brut.includes('\r\n') };
  const a = avant.texte.indexOf(DEBUT); const b = avant.texte.indexOf(FIN);
  if (a < 0 || b < a) throw new Error(`${FONCTION} : les bornes de la copie de ${REGLER} manquent`);
  const neuf = `${avant.texte.slice(0, a + DEBUT.length)}\n${copieAttendue()}\n${avant.texte.slice(b)}`;
  console.log(`${FONCTION} : copie de ${REGLER} ${ecris(chemin, avant, neuf) ? 'reecrite' : 'deja a jour'}`);
}
