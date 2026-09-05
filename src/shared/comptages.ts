import type { FilMessage } from './fil';
import { totalDuComptage, comptageEnClair, comptageComplet } from './fil';
import type { Client } from './clients';

/* ══ LA SÉRIE DES COMPTAGES D'UNE TÊTE — 5 septembre 2026 ═══════════

   « Je peux avoir quelque part de formel où je peux tracker le comptage des
   locks ? Parfois ça change. Le client double ses locks, en perd… » puis
   « inclure le comptage de manière indépendante au fil. Parfois je compte juste
   le total » (Yéman).

   DEUX GESTES, UNE SEULE SUITE. Le Fil compte quart par quart — c'est ainsi
   qu'on recompte le quadrant qui cloche sans refaire la tête — et la fiche
   prend le total, pour les jours où c'est tout ce qu'on a. Les ranger en deux
   listes ferait deux vérités pour un seul chiffre ; on les lit ensemble, chacune
   disant d'où elle vient.

   LE NOMBRE SEUL NE RACONTE RIEN. « 427 » ne dit ni la pousse ni la perte ;
   « +247 depuis février » dit un dédoublement, « −47 » dit une casse qu'il faut
   regarder. C'est l'écart qu'on lit. */

export type ComptageLu = {
  /** Le jour du comptage. Vide pour le chiffre hérité, qui n'en a pas. */
  iso: string;
  locks: number;
  /** La mèche témoin, quand elle a été mesurée. C'est elle qui trace la pousse. */
  longueurCm?: number;
  /** Écart au comptage précédent — `null` sur le premier, il ne suit rien. */
  ecart: number | null;
  /** Les quarts, quand ils ont été comptés — « devant 26 · 24 ». */
  enClair?: string;
  auteurNom: string;
  /** Faux quand un quadrant manque au Fil. Un total saisi au comptoir est
      complet par nature : il ne prétend pas être détaillé. */
  complet: boolean;
  origine: 'fil' | 'fiche' | 'herite';
};

export function serieDesComptages(
  fil: readonly FilMessage[],
  branchId: string,
  client: Pick<Client, 'id' | 'comptages' | 'lockCount'>,
): ComptageLu[] {
  const parJour = new Map<string, ComptageLu>();

  /* ── LE FIL, quart par quart ────────────────────────────────────
     UN SEUL COMPTAGE PAR JOUR : le fil laisse compléter un quadrant après
     l'autre (`fusionnerComptages`), et l'on garde donc le message le plus
     RÉCENT de chaque journée. Sans cela, une tête comptée en quatre fois
     montrerait quatre lignes dont trois incomplètes, et des écarts qui n'ont
     jamais eu lieu. */
  const dernierDuJour = new Map<string, FilMessage>();
  for (const m of fil) {
    if (m.branchId !== branchId || !m.comptage) continue;
    if (!(m.piece?.kind === 'cliente' && m.piece.id === client.id)) continue;
    const jour = m.at.slice(0, 10);
    const vu = dernierDuJour.get(jour);
    if (!vu || m.at > vu.at) dernierDuJour.set(jour, m);
  }
  for (const [jour, m] of dernierDuJour) {
    const total = totalDuComptage(m.comptage);
    if (total <= 0) continue;
    parJour.set(jour, {
      iso: jour, locks: total, ecart: null,
      enClair: comptageEnClair(m.comptage), auteurNom: m.auteurNom,
      complet: comptageComplet(m.comptage), origine: 'fil',
    });
  }

  /* ── LE COMPTOIR, le total seul ─────────────────────────────────
     IL L'EMPORTE SUR LE MÊME JOUR. La fiche est l'endroit où l'on se reprend :
     y retaper un nombre est le geste d'une correction, et une correction qui ne
     corrige rien vaut moins que pas de correction du tout. */
  for (const c of client.comptages ?? []) {
    const locks = Math.round(c.locks);
    if (!c.iso || !Number.isFinite(locks) || locks <= 0) continue;
    parJour.set(c.iso, {
      iso: c.iso, locks, ecart: null,
      ...(c.longueurCm && c.longueurCm > 0 ? { longueurCm: c.longueurCm } : {}),
      ...(c.note ? { enClair: c.note } : {}),
      auteurNom: c.par ?? 'La maison', complet: true, origine: 'fiche',
    });
  }

  /* ── LE CHIFFRE HÉRITÉ ──────────────────────────────────────────
     Une fiche peut porter un nombre de locks posé à la main, bien avant ce
     suivi. Dire « jamais comptée » pendant que l'en-tête annonce « Nano · 427
     locks » serait se contredire sur le même écran. Il n'entre QUE si rien
     d'autre n'existe : sinon il ferait doublon avec le dernier, qui l'a
     justement écrit. */
  if (parJour.size === 0) {
    const h = client.lockCount ?? 0;
    if (h > 0) {
      return [{ iso: '', locks: h, ecart: null, auteurNom: 'La maison', complet: true, origine: 'herite' }];
    }
    return [];
  }

  /* Du plus ANCIEN au plus récent le temps de mesurer les écarts : un écart se
     mesure contre ce qui précède, jamais contre ce qui suit. */
  const jours = [...parJour.values()].sort((a, b) => a.iso.localeCompare(b.iso));
  return jours
    .map((c, i) => ({ ...c, ecart: i === 0 ? null : c.locks - jours[i - 1].locks }))
    .reverse();
}
