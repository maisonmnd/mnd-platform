/* CE QUE CE POSTE GARDE, ET CE QU'IL REÇOIT — 1er octobre 2026.

   « Pourquoi quand je clique dans la barre de navigation du Trône c'est
   lent ? Qu'est-ce qui prend de l'espace ? » (Yéman). Trois fois en deux
   jours la lenteur a été diagnostiquée de loin, sur le code, sans pouvoir
   regarder le poste où elle se produit. Deux choses ne se voient que là :

     · LE POIDS DE LA MÉMOIRE. Chaque magasin garde sa table entière dans la
       mémoire du navigateur, qui n'accorde qu'environ cinq millions de
       caractères à tout le site, Trône et Ma Couronne confondus. Passé ce
       plafond, le navigateur refuse d'écrire.
     · CE QUE LES AUTRES POSTES ENVOIENT. Chaque écriture reçue fait réécrire
       la table et redessiner l'écran. Un poste qui en reçoit des dizaines par
       minute rame, quoi qu'on y fasse.

   Ce module compte les deux, sans rien changer à ce qu'il compte. Le panneau
   « Cet appareil » (Système › Paramètres) les dit. Il est pur : le harnais
   `verifie-la-lecture-du-magasin` l'éprouve sans navigateur. */

/** L'ordre de grandeur de ce qu'un navigateur accorde à un site, en
    caractères. Chrome, Edge et Firefox comptent dix mégaoctets à deux octets
    le caractère ; Safari est plus strict. C'est un repère, pas une promesse. */
export const PLACE_ACCORDEE = 5_000_000;

/** À partir de cette part, on dit que la mémoire arrive au bout. */
export const PART_QUI_INQUIETE = 0.8;

export type PoidsDeCase = {
  /** La clé réelle (« trone::mnd_clients »). */
  cle: string;
  /** Ce qu'elle garde, en mots du comptoir quand on les connaît. */
  nom: string;
  /** La surface qui l'a écrite : le Trône, Ma Couronne, ou le site. */
  surface: string;
  caracteres: number;
};

const NOMS: Record<string, string> = {
  mnd_clients: 'fiches clientes',
  mnd_appointments: 'rendez-vous',
  mnd_invoices: 'factures',
  mnd_catalog_services: 'catalogue',
  mnd_reminders_sent: 'rappels envoyés',
  mnd_expenses: 'dépenses',
  mnd_demandes: 'demandes',
  mnd_fil: 'conversations',
};
const SURFACES: Record<string, string> = { trone: 'Le Trône', couronne: 'Ma Couronne', lokaa: 'LOKAA', consultation: 'La Consultation' };

/** Pèse chaque case, la plus lourde d'abord. À poids égal, l'ordre des clés. */
export function peseLesCases(entrees: Iterable<readonly [string, string]>): { cases: PoidsDeCase[]; total: number } {
  const cases: PoidsDeCase[] = [];
  let total = 0;
  for (const [cle, valeur] of entrees) {
    /* La clé compte aussi : c'est ce que le navigateur facture. */
    const caracteres = cle.length + valeur.length;
    total += caracteres;
    const i = cle.indexOf('::');
    const surface = i > 0 ? cle.slice(0, i) : '';
    const nue = i > 0 ? cle.slice(i + 2) : cle;
    cases.push({ cle, nom: NOMS[nue] ?? nue.replace(/^mnd_/, '').replace(/_/g, ' '), surface: SURFACES[surface] ?? (surface || 'le site'), caracteres });
  }
  cases.sort((a, b) => b.caracteres - a.caracteres || (a.cle < b.cle ? -1 : a.cle > b.cle ? 1 : 0));
  return { cases, total };
}

/** « 2 140 Ko », avec l'espace fine des milliers. Mille vingt-quatre caractères font un kilo. */
export function ditLePoids(caracteres: number): string {
  const ko = Math.round(caracteres / 1024);
  return `${String(ko).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} Ko`;
}

/** Ce que le panneau dit : le total, sa part de la place accordée, et les plus lourdes. */
export function resumeDeLaMemoire(entrees: Iterable<readonly [string, string]>, combien = 4): {
  total: number; part: number; presDuBout: boolean; lourdes: PoidsDeCase[];
} {
  const { cases, total } = peseLesCases(entrees);
  const part = total / PLACE_ACCORDEE;
  return { total, part, presDuBout: part >= PART_QUI_INQUIETE, lourdes: cases.slice(0, combien) };
}

/* ── Ce que les autres postes envoient ─────────────────────────────── */

/** On garde dix minutes de passages, et jamais plus de deux mille : un compteur
    de diagnostic ne doit pas devenir ce qu'il mesure. */
const FENETRE_GARDEE_MS = 10 * 60_000;
const AU_PLUS = 2000;
let recues: { table: string; at: number }[] = [];

/** À appeler quand une écriture d'un AUTRE poste vient d'être appliquée ici. */
export function noteUneEcritureRecue(table: string, maintenant: number = Date.now()): void {
  recues.push({ table, at: maintenant });
  if (recues.length > AU_PLUS || recues[0].at < maintenant - FENETRE_GARDEE_MS) {
    recues = recues.filter((r) => r.at >= maintenant - FENETRE_GARDEE_MS).slice(-AU_PLUS);
  }
}

/** Les écritures reçues depuis `depuisMs`, par table, la plus bavarde d'abord. */
export function ecrituresRecues(depuisMs = 60_000, maintenant: number = Date.now()): { table: string; n: number }[] {
  const parTable = new Map<string, number>();
  for (const r of recues) {
    if (r.at > maintenant - depuisMs && r.at <= maintenant) parTable.set(r.table, (parTable.get(r.table) ?? 0) + 1);
  }
  return [...parTable].map(([table, n]) => ({ table, n })).sort((a, b) => b.n - a.n || (a.table < b.table ? -1 : 1));
}

/** Pour le harnais. */
export function oublieLesEcrituresRecues(): void { recues = []; }
