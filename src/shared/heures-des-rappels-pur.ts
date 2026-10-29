/* ══ LES HEURES DES RAPPELS — 29 octobre 2026 ══════════════════════════════
   « Redonne-moi là où je dois aller pour régler les paramètres des relances
   de rendez-vous » (Yéman). Il n'y en avait pas : le rappel de la veille
   partait aux heures écrites dans les jobs du serveur, 18 h et 21 h. Et le
   passage de 21 h n'envoyait plus rien depuis le 10 octobre 2026 : il tombe
   dans les heures calmes (20 h à 8 h), le rappel aurait attendu le matin même
   du rendez-vous. Un rendez-vous pris après 18 h pour le lendemain n'avait
   donc aucun rappel.

   Maquette « Heures des rappels » validée (« construis »), sur les
   propositions : un premier envoi et un second passage réglables, tous deux
   avant 20 h ; pas de rappel le jour même ; la même heure toute la semaine ;
   la Direction seule règle.

   LES HEURES VIVENT DANS LES RÉGLAGES DE LA MAISON (`mnd_auto_config`, à côté
   des heures calmes) : `rappelPremier` et `rappelSecond` (0 = aucun second
   passage). La fonction `rappels-j1` se réveille chaque heure et ne fait son
   passage qu'aux heures choisies. Un rappel déjà parti ne repart jamais : le
   journal des envois le verrouille, quelle que soit l'heure.

   Le bloc entre les deux repères est recopié À L'IDENTIQUE (sans `export`)
   dans `supabase/functions/rappels-j1/index.ts`, qui ne peut rien importer ;
   `scripts/verifie-les-heures-des-rappels.mjs` y veille. */

/* ══ COPIE DANS rappels-j1 : DÉBUT ══ */
/** Les heures du rappel de la veille, à l'heure du salon. `second` : null
    quand il n'y a pas de second passage. */
export type HeuresDesRappels = { premier: number; second: number | null };
/** Sans réglage : 18 h comme avant, et le second passage à 19 h, avant les
    heures calmes, au lieu de 21 h qui n'envoyait rien. */
export const HEURES_DES_RAPPELS_PAR_DEFAUT: HeuresDesRappels = { premier: 18, second: 19 };
/** De 9 h à 19 h : à 20 h commencent les heures calmes, rien ne part. */
export const PREMIERE_HEURE_DES_RAPPELS = 9;
export const DERNIERE_HEURE_DES_RAPPELS = 19;

/** Les heures lues dans `mnd_auto_config`. Une valeur absente prend le
    défaut ; une valeur hors de 9 h à 19 h aussi, pour le premier envoi ; un
    second passage à 0, hors bornes, ou pas après le premier, n'existe pas. */
export function heuresDesRappels(cfg: { rappelPremier?: unknown; rappelSecond?: unknown } | null | undefined): HeuresDesRappels {
  const heure = (v: unknown): number | null => {
    if (typeof v !== 'number' && typeof v !== 'string') return null;
    const x = Number(v);
    return v !== '' && Number.isInteger(x) && x >= PREMIERE_HEURE_DES_RAPPELS && x <= DERNIERE_HEURE_DES_RAPPELS ? x : null;
  };
  const premier = heure(cfg?.rappelPremier) ?? HEURES_DES_RAPPELS_PAR_DEFAUT.premier;
  const brut = cfg?.rappelSecond;
  const second = brut === undefined || brut === null ? HEURES_DES_RAPPELS_PAR_DEFAUT.second : heure(brut);
  return { premier, second: second !== null && second > premier ? second : null };
}

/** Le passage de cette heure du salon : le premier, le second, ou aucun. */
export function passageDeLHeure(heure: number, h: HeuresDesRappels): 'premier' | 'second' | null {
  if (heure === h.premier) return 'premier';
  if (h.second !== null && heure === h.second) return 'second';
  return null;
}
/* ══ COPIE DANS rappels-j1 : FIN ══ */

/** « 18 h et 19 h », « 18 h ». */
export const heuresDites = (h: HeuresDesRappels): string =>
  `${h.premier} h${h.second !== null ? ` et ${h.second} h` : ''}`;

/** La ligne du Marketing : « La veille du rendez-vous, 18 h et 19 h ». */
export const quandDuRappelDeLaVeille = (h: HeuresDesRappels): string =>
  `La veille du rendez-vous, ${heuresDites(h)}`;

/** Les heures que l'écran propose pour le premier envoi. */
export const heuresDuPremierEnvoi = (): number[] => {
  const t: number[] = [];
  for (let x = PREMIERE_HEURE_DES_RAPPELS; x <= DERNIERE_HEURE_DES_RAPPELS; x++) t.push(x);
  return t;
};

/** Les heures que l'écran propose pour le second passage : après le premier,
    jusqu'à 19 h. Vide quand le premier envoi est à 19 h. */
export const heuresDuSecondPassage = (premier: number): number[] =>
  heuresDuPremierEnvoi().filter((x) => x > premier);

/** « 18 h 10 » : l'heure où le rappel quitte la salle d'attente. */
export const heureDeDepartDite = (heure: number, salleMin: number): string => {
  const total = heure * 60 + Math.max(0, Math.round(salleMin));
  const h = Math.floor(total / 60) % 24;
  const m = total % 60;
  return m === 0 ? `${h} h` : `${h} h ${String(m).padStart(2, '0')}`;
};

/** Ce que reçoit la cliente, en deux phrases, pour l'écran de réglage. */
export function ceQueRecoitLaCliente(h: HeuresDesRappels, salleMin: number): { veille: string; tardif: string } {
  const veille = `Une cliente qui a rendez-vous demain reçoit son rappel aujourd’hui vers ${heureDeDepartDite(h.premier, salleMin)}.`;
  const tardif = h.second !== null
    ? `Un rendez-vous posé après ${h.premier} h pour le lendemain reçoit le sien au second passage, vers ${heureDeDepartDite(h.second, salleMin)}.`
    : `Un rendez-vous posé après ${h.premier} h pour le lendemain n’a pas de rappel : il n’y a pas de second passage.`;
  return { veille, tardif };
}
