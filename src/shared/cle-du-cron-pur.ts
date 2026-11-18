/* ══ LA CLÉ D'UNE PORTE, COMPARÉE SANS RIEN LAISSER FUIR · 17 novembre 2026 ══
   Dix fonctions du serveur ne s'ouvrent qu'à une clé : celles que le cron
   réveille (les rappels, les relances, le facteur, la sauvegarde de nuit),
   l'automate WhatsApp, et la poignée de main de Meta. Chacune comparait sa
   clé avec `===` et, au refus, rendait les LONGUEURS des deux clés dans sa
   réponse, à qui que ce soit. Une seule, la sauvegarde de nuit, avait été
   durcie à la main : les neuf autres gardaient l'ancienne porte (revue de
   code du 17 novembre 2026).

   PUIS LES AUTRES PORTES (le même jour) : toute fonction qui compare une
   clé reçue à un secret attendu passe désormais par ce bloc, et il les
   atteint par DEUX CHEMINS (noté le 18 novembre 2026) :
   · les fonctions DIRECTES, vingt-deux (la liste `cle-du-cron` de
     `scripts/terminer-copie-serveur.mjs`) : ce bloc, entre ses repères
     ⟨cle-du-cron⟩, y est recopié tel quel par ce script (une fonction Edge
     n'importe rien de `src/`). Une copie ne se retouche jamais à la main ;
   · les quatre fonctions REGROUPÉES (assistant-maison, reception-wa,
     conseil-du-matin, tri-des-messages) : leur source `scripts/serveur/<f>.ts`
     importe ce module, et esbuild l'emporte dans le fichier généré. Elles ne
     portent ni repères ni copie : ne pas leur en poser, ni les inscrire dans
     la liste du script de copie.
   `scripts/verifie-la-cle-du-cron.mjs` le prouve (B les copies, D les
   regroupées) : aucune porte ne compare plus avec `===`, aucune réponse ne
   porte plus de longueur. `verifie-les-douze-lunes` (R8) confronte aussi
   chaque copie à cet original.

   CE QUI NE CHANGE PAS : le contrôle de santé (GET) de chaque fonction dit
   toujours ses secrets en longueurs seules. C'est voulu, et c'est l'outil de
   mise en ligne qui le lit. */

/* ⟨cle-du-cron⟩ */
/** Deux clés sont-elles la même ? À TEMPS CONSTANT : `===` s'arrête au
    premier caractère qui diffère, et ce temps-là se mesure de l'extérieur,
    caractère après caractère. Une clé vide ne vaut jamais : un secret qui
    n'est pas posé n'ouvre rien. */
const memeCle = (a: string, b: string): boolean => {
  const x = new TextEncoder().encode(a);
  const y = new TextEncoder().encode(b);
  let diff = x.length ^ y.length;
  const n = Math.max(x.length, y.length);
  for (let i = 0; i < n; i += 1) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0 && x.length > 0;
};

/** Une clé refusée se dit AU JOURNAL de la fonction, en longueurs seules
    (sb_secret ≈ 40 à 50 signes · legacy eyJ… ≈ 200 et plus · 0 = rien de
    posé de ce côté-là) : elles suffisent à situer la panne. Jamais dans la
    réponse : celui qui frappe sans la clé n'a pas à les lire. */
const noteLeRefus = (porte: string, attendue: string, recue: string): void => {
  console.error(`${porte} : clé refusée`, { attendueLg: attendue.length, recueLg: recue.length });
};
/* ⟨/cle-du-cron⟩ */

export { memeCle, noteLeRefus };
