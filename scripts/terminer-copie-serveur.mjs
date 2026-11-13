/* LES COPIES DE « TERMINER ET RÉGLER » DANS LES FONCTIONS EDGE — 6 novembre 2026.
   Une fonction Edge se colle seule et n'importe rien de `src/` : elle porte
   une COPIE des règles, entre ses repères « ⟨nom⟩ ». Ce script réécrit
   chaque copie depuis son original ; le banc des douze lunes (R8) et le banc
   verifie-terminer-et-regler les comparent, caractère pour caractère.

     node scripts/terminer-copie-serveur.mjs            réécrit les copies
     node scripts/terminer-copie-serveur.mjs --verifie  dit seulement si elles sont à jour */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const racine = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUR = 'src/shared/terminer-et-regler-pur.ts';
const FONCTION = 'supabase/functions/terminer-et-regler/index.ts';
const REGLER = 'supabase/functions/regler-la-seance/index.ts';

/** Chaque bloc, son original, et les fonctions qui le portent. Régler avant
    et après (7 novembre 2026) : ⟨reste-du-rdv⟩ (sorti de ⟨terminer-et-regler⟩)
    et ⟨regler-avant-apres⟩ vont dans les deux fonctions. */
export const COPIES = [
  { bloc: 'lien-du-rdv', source: 'src/shared/lien-du-rdv-pur.ts', cibles: [FONCTION] },
  { bloc: 'honneur-au-reglement', source: PUR, cibles: [REGLER, FONCTION] },
  { bloc: 'reste-du-rdv', source: PUR, cibles: [REGLER, FONCTION] },
  { bloc: 'terminer-et-regler', source: PUR, cibles: [FONCTION] },
  { bloc: 'regler-avant-apres', source: PUR, cibles: [REGLER, FONCTION] },
  { bloc: 'j-ai-termine', source: PUR, cibles: ['supabase/functions/whatsapp-automate/index.ts'] },
  /* Le billet réglé porte sa facture (7 novembre 2026). */
  { bloc: 'billet-regle', source: 'src/shared/billet-regle-pur.ts', cibles: [FONCTION] },
  /* Déplacer depuis le site (7 novembre 2026) : la règle des 24 heures, jugée par demande-submit. */
  { bloc: 'deplacer-du-site', source: 'src/shared/deplacer-du-site-pur.ts', cibles: ['supabase/functions/demande-submit/index.ts'] },
  /* Ce qui va partir (5 novembre 2026, repris le 8) : la clé d'un message, l'arrêt
     d'avance, la pause d'un modèle et la veille d'Opale, dans le facteur et
     chaque fonction qui dépose. « Contrôler chaque message qui part, à qui, et
     pouvoir arrêter le message au besoin » (Yéman). */
  { bloc: 'arret-d-avance', source: 'src/shared/arret-d-avance-pur.ts', cibles: [
    'supabase/functions/envois-partent/index.ts', 'supabase/functions/rappels-j1/index.ts', 'supabase/functions/confirmation-rdv/index.ts',
    'supabase/functions/avis-google/index.ts', 'supabase/functions/relances-factures/index.ts', 'supabase/functions/rappels-d-echeance/index.ts',
    'supabase/functions/fete-de-couronne/index.ts',
  ] },
  /* Les messages de l'abonnée (8 novembre 2026, lot 4 de l'abonnement refait) :
     la veille avec l'attention dans rappels-j1, les boutons de la prochaine
     séance dans whatsapp-webhook, le rendez-vous suivant relu au « Oui » et
     au départ (whatsapp-webhook, envois-partent). */
  { bloc: 'veille-attention', source: 'src/shared/messages-de-l-abonnee-pur.ts', cibles: ['supabase/functions/rappels-j1/index.ts'] },
  { bloc: 'prochaine-seance', source: 'src/shared/messages-de-l-abonnee-pur.ts', cibles: ['supabase/functions/whatsapp-webhook/index.ts'] },
  { bloc: 'deja-un-suivant', source: 'src/shared/messages-de-l-abonnee-pur.ts', cibles: ['supabase/functions/whatsapp-webhook/index.ts', 'supabase/functions/envois-partent/index.ts'] },
  /* Les envois programmés (13 novembre 2026) : la porte d'Opale porte le
     modèle d'ouverture, et le facteur la règle des envois programmés (la
     voie, la fenêtre, la fois suivante, la consigne à Opale). */
  { bloc: 'porte-des-modeles', source: 'src/shared/porte-des-modeles-pur.ts', cibles: ['supabase/functions/envois-partent/index.ts'] },
  { bloc: 'envois-programmes', source: 'src/shared/envois-programmes-pur.ts', cibles: ['supabase/functions/envois-partent/index.ts'] },
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
  return ecarts;
}

/* Lancé pour lui-même seulement : regroupé par esbuild dans un banc, ce
   module porte l'adresse du paquet, pas la sienne. */
if (process.argv[1] && path.basename(process.argv[1]) === 'terminer-copie-serveur.mjs') {
  if (process.argv.includes('--verifie')) {
    const ecarts = ecartsDesCopies();
    console.log(ecarts.length ? ecarts.join('\n') : 'Les copies sont a jour.');
    process.exit(ecarts.length ? 1 : 0);
  }
  for (const c of COPIES) {
    const original = entre(lf(readFileSync(path.join(racine, c.source), 'utf8')), c.bloc);
    if (original === null) throw new Error(`${c.source} : l'original de ⟨${c.bloc}⟩ est introuvable`);
    for (const cible of c.cibles) {
      const chemin = path.join(racine, cible);
      const brut = readFileSync(chemin, 'utf8');
      const crlf = brut.includes('\r\n');
      const texte = lf(brut);
      const i = texte.indexOf(ouvre(c.bloc));
      const k = texte.indexOf(ferme(c.bloc), i);
      if (i < 0 || k < 0) throw new Error(`${cible} : les repères de ⟨${c.bloc}⟩ manquent (posez « /* ⟨${c.bloc}⟩ */ » puis « /* ⟨/${c.bloc}⟩ */ » sur deux lignes)`);
      const neuf = `${texte.slice(0, i + ouvre(c.bloc).length)}${original}${texte.slice(k)}`;
      if (neuf !== texte) writeFileSync(chemin, crlf ? neuf.replace(/\n/g, '\r\n') : neuf);
      console.log(`${cible} : ⟨${c.bloc}⟩ ${neuf === texte ? 'deja a jour' : 'reecrit'}`);
    }
  }
}
