/* « COMMENT NOUS AVEZ-VOUS CONNUS ? » — 2 novembre 2026, le socle de la
   Maison intelligente. La question du comptoir, posée à chaque nouvelle
   fiche, d'un toucher. Elle mesure ce que rapportent les réseaux (Ambre),
   le bouche-à-oreille et les marraines (Perle), le site et Google ; le
   Conseil du matin la lit chaque mois.

   Ce n'est pas `Client.source`, qui dit par où la fiche est NÉE (le site, une
   consultation, le comptoir, WhatsApp) : une cliente venue d'Instagram peut
   naître au comptoir. Ici, ce qu'ELLE répond. Une réponse fermée, jamais un
   texte libre (rien d'un tiers ne s'écrit sur la fiche). Module PUR. */

export const CANAUX_DE_CONNAISSANCE = [
  'instagram', 'facebook', 'tiktok', 'linkedin', 'google', 'site', 'bouche-a-oreille', 'marraine', 'passage', 'ne-sait-plus',
] as const;
export type ConnuePar = typeof CANAUX_DE_CONNAISSANCE[number];

export const QUESTION_DU_COMPTOIR = 'Comment nous avez-vous connus ?';

export const CONNUE_PAR_DIT: Record<ConnuePar, string> = {
  instagram: 'Instagram',
  facebook: 'Facebook',
  tiktok: 'TikTok',
  linkedin: 'LinkedIn',
  google: 'Google',
  site: 'Le site',
  'bouche-a-oreille': 'Le bouche-à-oreille',
  marraine: 'Une marraine',
  passage: 'En passant devant',
  'ne-sait-plus': 'Ne sait plus',
};

/** Les réseaux : ce que le Conseil du matin et Ambre comptent ensemble. */
export const RESEAUX: readonly ConnuePar[] = ['instagram', 'facebook', 'tiktok', 'linkedin'];

export const estConnuePar = (v: unknown): v is ConnuePar =>
  typeof v === 'string' && (CANAUX_DE_CONNAISSANCE as readonly string[]).includes(v);

type FichePourLeCompte = { since?: string | null; connuePar?: string | null; archived?: boolean | null; segments?: readonly string[] | null };

export type CompteDesCanaux = Record<ConnuePar | 'non-dit', number> & { reseaux: number; total: number };

/** Les nouvelles fiches d'un mois (« 2026-11 », par leur `since`), comptées
    par réponse. Les fiches d'enfant (segment « Enfant ») ne comptent pas :
    c'est le parent qui a connu la Maison. Les fiches archivées non plus. */
export function nouvellesParCanal(fiches: readonly FichePourLeCompte[], mois: string): CompteDesCanaux {
  const compte = Object.fromEntries([...CANAUX_DE_CONNAISSANCE, 'non-dit'].map((k) => [k, 0])) as Record<ConnuePar | 'non-dit', number>;
  let total = 0;
  for (const f of fiches) {
    if (f.archived) continue;
    if (!String(f.since ?? '').startsWith(mois)) continue;
    if ((f.segments ?? []).includes('Enfant')) continue;
    const k: ConnuePar | 'non-dit' = estConnuePar(f.connuePar) ? f.connuePar : 'non-dit';
    compte[k] += 1;
    total += 1;
  }
  const reseaux = RESEAUX.reduce((a, k) => a + compte[k], 0);
  return { ...compte, reseaux, total };
}
