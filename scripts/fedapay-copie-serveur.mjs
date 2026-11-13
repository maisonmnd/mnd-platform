/* LES COPIES DE « RÉGLER PAR FEDAPAY » DANS mnd-pay ET mnd-pay-webhook — 12 novembre 2026.
   Le choix du moyen, lot C. Une fonction Edge se colle seule et n'importe rien
   de `src/` : elle porte une COPIE des règles. Ce script réécrit chaque copie
   depuis son original ; le banc verifie-regler-par-fedapay les compare,
   caractère pour caractère. Même montage que collecte-copie-serveur.mjs
   (dont il ne touche aucune cible).

     node scripts/fedapay-copie-serveur.mjs            réécrit les copies
     node scripts/fedapay-copie-serveur.mjs --verifie  dit seulement si elles sont à jour */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { declarations } from './regler-copie-serveur.mjs';

const racine = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const FONCTIONS = ['supabase/functions/mnd-pay/index.ts', 'supabase/functions/mnd-pay-webhook/index.ts'];

/** Les blocs entre repères « ⟨nom⟩ », et leur original. */
export const COPIES = [
  { bloc: 'honneur-au-reglement', source: 'src/shared/terminer-et-regler-pur.ts' },
  { bloc: 'regler-par-fedapay', source: 'src/shared/regler-par-fedapay-pur.ts' },
];

/** Les déclarations recopiées par leur nom, entre deux bornes, dans cet ordre. */
export const DECLARATIONS = [
  {
    source: 'src/shared/regler-la-seance-pur.ts',
    debut: '// ── DEBUT copie de shared/regler-la-seance-pur.ts (fedapay-copie-serveur la réécrit, verifie-regler-par-fedapay la compare)',
    fin: '// ── FIN copie de shared/regler-la-seance-pur.ts',
    noms: ['LienDeReglement', 'ReglementEnLigne', 'LigneLue', 'VersementLu', 'PieceLue', 'RdvLu', 'LienDuFoyer',
      'ALPHABET_DU_JETON', 'LONGUEUR_DU_JETON', 'estUnJeton', 'n', 'netDeLaLigne', 'totalDeLaPiece', 'regleDeLaPiece', 'resteDeLaPiece', 'laPieceDuRdv', 'rdvRegle'],
  },
  {
    source: 'src/shared/mnd-pay-pur.ts',
    debut: '// ── DEBUT copie de shared/mnd-pay-pur.ts (fedapay-copie-serveur la réécrit, verifie-regler-par-fedapay la compare)',
    fin: '// ── FIN copie de shared/mnd-pay-pur.ts',
    noms: ['MoyenMndPay', 'ReglagesMndPay', 'TAUX_MOBILE_DEFAUT', 'TAUX_TAPGO_DEFAUT', 'f', 'tauxDe', 'fraisPour', 'compteDeLaDemande'],
  },
];

const lf = (s) => s.replace(/\r\n/g, '\n');
const ouvre = (nom) => `/* ⟨${nom}⟩ */\n`;
const ferme = (nom) => `\n/* ⟨/${nom}⟩ */`;

/** Le texte d'un bloc entre ses repères, ou null. */
export function entre(src, nom) {
  const i = src.indexOf(ouvre(nom));
  const k = src.indexOf(ferme(nom), i);
  return i < 0 || k < 0 ? null : src.slice(i + ouvre(nom).length, k);
}

export function copieAttendue(d, r = racine) {
  const lues = declarations(readFileSync(path.join(r, d.source), 'utf8'));
  const manquent = d.noms.filter((x) => !lues.has(x));
  if (manquent.length) throw new Error(`${d.source} ne déclare plus : ${manquent.join(', ')}`);
  return d.noms.map((x) => lues.get(x)).join('\n\n');
}

export function copieDuServeur(d, cible, r = racine) {
  const t = lf(readFileSync(path.join(r, cible), 'utf8'));
  const a = t.indexOf(d.debut); const b = t.indexOf(d.fin);
  if (a < 0 || b < a) return null;
  return t.slice(a + d.debut.length, b).trim();
}

/** Les écarts entre les copies et leurs originaux (une ligne par écart). */
export function ecartsDesCopies(r = racine) {
  const ecarts = [];
  for (const cible of FONCTIONS) {
    let texte = '';
    try { texte = lf(readFileSync(path.join(r, cible), 'utf8')); } catch { ecarts.push(`${cible} : fichier absent`); continue; }
    for (const c of COPIES) {
      const original = entre(lf(readFileSync(path.join(r, c.source), 'utf8')), c.bloc);
      if (original === null) { ecarts.push(`${c.source} : l original de ⟨${c.bloc}⟩ est introuvable`); continue; }
      const copie = entre(texte, c.bloc);
      if (copie === null) ecarts.push(`${cible} : les reperes de ⟨${c.bloc}⟩ manquent`);
      else if (copie !== original) ecarts.push(`${cible} : ⟨${c.bloc}⟩ differe de ${c.source}`);
    }
    for (const d of DECLARATIONS) {
      const copie = copieDuServeur(d, cible, r);
      if (copie === null) ecarts.push(`${cible} : les bornes de la copie de ${d.source} manquent`);
      else if (copie !== copieAttendue(d, r)) ecarts.push(`${cible} : la copie de ${d.source} differe`);
    }
  }
  return ecarts;
}

/* Lancé pour lui-même seulement : regroupé par esbuild dans un banc, ce
   module porte l'adresse du paquet, pas la sienne. */
if (process.argv[1] && path.basename(process.argv[1]) === 'fedapay-copie-serveur.mjs') {
  if (process.argv.includes('--verifie')) {
    const ecarts = ecartsDesCopies();
    console.log(ecarts.length ? ecarts.join('\n') : 'Les copies sont a jour.');
    process.exit(ecarts.length ? 1 : 0);
  }
  for (const cible of FONCTIONS) {
    const chemin = path.join(racine, cible);
    const brut = readFileSync(chemin, 'utf8');
    const crlf = brut.includes('\r\n');
    let t = lf(brut);
    for (const c of COPIES) {
      const original = entre(lf(readFileSync(path.join(racine, c.source), 'utf8')), c.bloc);
      if (original === null) throw new Error(`${c.source} : l'original de ⟨${c.bloc}⟩ est introuvable`);
      const i = t.indexOf(ouvre(c.bloc));
      const k = t.indexOf(ferme(c.bloc), i);
      if (i < 0 || k < 0) throw new Error(`${cible} : les repères de ⟨${c.bloc}⟩ manquent`);
      t = `${t.slice(0, i + ouvre(c.bloc).length)}${original}${t.slice(k)}`;
    }
    for (const d of DECLARATIONS) {
      const a = t.indexOf(d.debut); const b = t.indexOf(d.fin);
      if (a < 0 || b < a) throw new Error(`${cible} : les bornes de la copie de ${d.source} manquent`);
      t = `${t.slice(0, a + d.debut.length)}\n${copieAttendue(d)}\n${t.slice(b)}`;
    }
    const neuf = crlf ? t.replace(/\n/g, '\r\n') : t;
    if (neuf !== brut) writeFileSync(chemin, neuf);
    console.log(`${cible} : ${neuf !== brut ? 'copies reecrites' : 'deja a jour'}`);
  }
}
