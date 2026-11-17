/* ══ LA CLÉ D'UNE PORTE, COMPARÉE SANS RIEN LAISSER FUIR · 17 novembre 2026 ══
   Dix fonctions du serveur ne s'ouvrent qu'à une clé : celles que le cron
   réveille (les rappels, les relances, le facteur, la sauvegarde de nuit),
   l'automate WhatsApp, et la poignée de main de Meta. Chacune comparait sa
   clé avec `===` et, au refus, rendait les LONGUEURS des deux clés dans sa
   réponse, à qui que ce soit. Une seule, la sauvegarde de nuit, avait été
   durcie à la main : les neuf autres gardaient l'ancienne porte (revue de
   code du 17 novembre 2026).

   UNE SEULE PORTE, RECOPIÉE : ce bloc, entre ses repères ⟨cle-du-cron⟩, est
   recopié tel quel dans chaque fonction par `scripts/terminer-copie-serveur.mjs`
   (une fonction Edge n'importe rien de `src/`). `scripts/verifie-la-cle-du-cron.mjs`
   le prouve : les copies sont l'original, aucune porte ne compare plus avec
   `===`, aucune réponse ne porte plus de longueur.

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
