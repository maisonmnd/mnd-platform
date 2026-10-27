/* ══ LE NUMÉRO AU FORMAT DE META, PUR — 27 octobre 2026 ══════════════════
   Sorti de `conversations.ts` (qui tire la synchronisation) pour la fonction
   serveur de l'Assistant Maison ; `conversations.ts` le réexporte. */

/** Le numéro réduit à ses chiffres, au format que Meta emploie (sans « + »).

    LE RAPPROCHEMENT SE JOUE ICI. Une fiche porte « +229 0197000088 », Meta
    renvoie « 2290197000088 », et si les deux ne se réduisent pas au même
    chiffre, les messages d'une cliente tombent dans « inconnu » à côté de sa
    propre fiche. Même règle que `numeroIntl` des fonctions Edge. */
export const numeroWa = (brut: string | undefined): string => {
  const d = (brut ?? '').replace(/\D/g, '');
  if (!d) return '';
  if (d.startsWith('00229')) return d.slice(2);
  if (d.startsWith('229')) return d;
  if (d.length === 10 && d.startsWith('01')) return `229${d}`;
  if (d.length === 8) return `22901${d}`;
  return d;
};
