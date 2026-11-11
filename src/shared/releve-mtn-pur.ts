/* ══ LE RELEVÉ DES COMPTES MTN · 12 novembre 2026 ═══════════════════════
   « Consulter le relevé (hier, ce mois, le mois dernier, l'année...) »
   (Yéman, Finances › MTN MoMo). Pour chacun des deux comptes :
   · la collecte : ce que les clientes ont réglé par MTN (et les essais) ;
   · le décaissement : ce que la Maison a envoyé (paie, essais).

   MTN N'A PAS D'API DE RELEVÉ : on ne lit que ce qui est passé par le
   Trône (les registres `collectes_mtn` et `paie_envois_mtn`). Un dépôt fait
   à l'agence, un retrait ou un transfert fait au téléphone n'y figure pas ;
   l'écran le dit. Seul un mouvement CONFIRMÉ par MTN (« reçu ») compte dans
   les totaux ; refusés et en cours se comptent à part, sans montant.

   ICI, RIEN QUE DES CALCULS : ni magasin, ni écran, ni horloge lue en douce
   (l'instant est donné par l'appelant). Le banc `verifie-le-releve-mtn`
   éprouve ce fichier. */

const HEURE_MS = 60 * 60 * 1000;
const JOUR_MS = 24 * HEURE_MS;
const p2 = (n: number) => String(n).padStart(2, '0');
const entier = (n: unknown): number => {
  const v = Math.round(Number(n));
  return Number.isFinite(v) ? v : 0;
};

/* ── 1. LA PÉRIODE ──────────────────────────────────────────────────────
   Cotonou vit en UTC+1 toute l'année : un jour de Cotonou va de 23 h UTC
   la veille à 23 h UTC. */
export type PeriodeDuReleve = 'aujourdhui' | 'hier' | 'sept-jours' | 'ce-mois' | 'mois-dernier' | 'cette-annee' | 'annee-derniere' | 'libre';
export const PERIODES_DU_RELEVE: readonly { cle: PeriodeDuReleve; dit: string }[] = [
  { cle: 'aujourdhui', dit: 'Aujourd’hui' },
  { cle: 'hier', dit: 'Hier' },
  { cle: 'sept-jours', dit: '7 jours' },
  { cle: 'ce-mois', dit: 'Ce mois' },
  { cle: 'mois-dernier', dit: 'Le mois dernier' },
  { cle: 'cette-annee', dit: 'Cette année' },
  { cle: 'annee-derniere', dit: 'L’année dernière' },
  { cle: 'libre', dit: 'Du … au …' },
];

/** AAAA-MM-JJ de Cotonou d'un instant. */
export const jourACotonou = (ms: number): string => {
  const d = new Date(ms + HEURE_MS);
  return `${d.getUTCFullYear()}-${p2(d.getUTCMonth() + 1)}-${p2(d.getUTCDate())}`;
};
const RE_JOUR = /^(\d{4})-(\d{2})-(\d{2})$/;
/** Le début d'un jour de Cotonou, en instant. */
export const debutDuJour = (jour: string): number => {
  const m = RE_JOUR.exec(jour);
  return m ? Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) - HEURE_MS : NaN;
};
const decale = (jour: string, n: number): string => jourACotonou(debutDuJour(jour) + n * JOUR_MS + HEURE_MS);

export type Bornes = { du: string; au: string; depuisMs: number; jusquAMs: number };

/** Les jours (inclus) d'une période, à l'heure de Cotonou. `null` : période
    libre illisible ou à l'envers. */
export function bornesDuReleve(periode: PeriodeDuReleve, maintenantMs: number, libre?: { du?: string; au?: string }): Bornes | null {
  const auj = jourACotonou(maintenantMs);
  const [a, m] = [Number(auj.slice(0, 4)), Number(auj.slice(5, 7))];
  let du: string; let au: string;
  switch (periode) {
    case 'aujourdhui': du = auj; au = auj; break;
    case 'hier': du = decale(auj, -1); au = du; break;
    case 'sept-jours': du = decale(auj, -6); au = auj; break;
    case 'ce-mois': du = `${a}-${p2(m)}-01`; au = auj; break;
    case 'mois-dernier': {
      const [pa, pm] = m === 1 ? [a - 1, 12] : [a, m - 1];
      du = `${pa}-${p2(pm)}-01`;
      au = `${pa}-${p2(pm)}-${p2(new Date(Date.UTC(pa, pm, 0)).getUTCDate())}`;
      break;
    }
    case 'cette-annee': du = `${a}-01-01`; au = auj; break;
    case 'annee-derniere': du = `${a - 1}-01-01`; au = `${a - 1}-12-31`; break;
    case 'libre': {
      if (!RE_JOUR.test(libre?.du ?? '') || !RE_JOUR.test(libre?.au ?? '')) return null;
      du = libre?.du as string; au = libre?.au as string;
      if (du > au) return null;
      break;
    }
    default: return null;
  }
  return { du, au, depuisMs: debutDuJour(du), jusquAMs: debutDuJour(au) + JOUR_MS };
}

const MOIS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
const jourDit = (jour: string): string => {
  const m = RE_JOUR.exec(jour);
  return m ? `${Number(m[3]) === 1 ? '1er' : Number(m[3])} ${MOIS[Number(m[2]) - 1]} ${m[1]}` : jour;
};
/** « 11 nov. 2026 », « du 1er oct. 2026 au 31 oct. 2026 ». */
export const bornesDites = (b: Pick<Bornes, 'du' | 'au'>): string => (b.du === b.au ? jourDit(b.du) : `du ${jourDit(b.du)} au ${jourDit(b.au)}`);

/* ── 2. LES MOUVEMENTS ──────────────────────────────────────────────────── */
export type EtatDuMouvement = 'recu' | 'refuse' | 'en-cours' | 'annule';
export type MouvementMtn = {
  reference: string;
  /** L'instant qui date le mouvement : la réponse de MTN, sinon la demande. */
  quand: string;
  /** Le nom de la personne (décaissement) ou ce qui a été réglé (collecte). */
  qui: string;
  /** Règlement, essai, paie… */
  nature: string;
  montantXof: number;
  fraisXof: number;
  etat: EtatDuMouvement;
  transaction?: string | null;
  msisdn?: string | null;
};

/** Ce que le décaissement lit de `paie_envois_mtn`. */
export type EnvoiPourLeReleve = {
  reference: string; genre: string; nom: string; msisdn?: string | null; montant_xof: number; etat: string;
  programme_le: string; envoye_le?: string | null; repondu_le?: string | null; transaction_mtn?: string | null;
};
/** Ce que la collecte lit de `collectes_mtn`. */
export type CollectePourLeReleve = {
  reference: string; genre: string; origine?: string | null; msisdn?: string | null; montant_xof: number; frais_xof?: number | null;
  etat: string; demande_le: string; repondu_le?: string | null; transaction_mtn?: string | null; demande_par?: string | null;
};

const etatDeLEnvoi = (e: string): EtatDuMouvement => (e === 'recu' ? 'recu' : e === 'refuse' ? 'refuse' : e === 'annule' ? 'annule' : 'en-cours');
const etatDeLaCollecte = (e: string): EtatDuMouvement => (e === 'recu' ? 'recu' : e === 'refuse' ? 'refuse' : 'en-cours');

export function mouvementsDuDecaissement(envois: readonly EnvoiPourLeReleve[]): MouvementMtn[] {
  return envois.filter((e) => e && e.reference).map((e) => ({
    reference: e.reference,
    quand: e.repondu_le ?? e.envoye_le ?? e.programme_le,
    qui: e.nom,
    nature: e.genre === 'essai' ? 'Essai' : 'Paie',
    montantXof: Math.max(0, entier(e.montant_xof)),
    /* Par l'API, MTN ne prend aucun frais sur un envoi (paie par MTN, 5 nov. 2026). */
    fraisXof: 0,
    etat: etatDeLEnvoi(e.etat),
    transaction: e.transaction_mtn ?? null,
    msisdn: e.msisdn ?? null,
  }));
}

/** `frais` : la règle des frais de la collecte (`fraisDeMtn`), passée par
    l'appelant quand le registre n'a pas encore posé `frais_xof`. */
export function mouvementsDeLaCollecte(collectes: readonly CollectePourLeReleve[], frais: (montantXof: number) => number): MouvementMtn[] {
  return collectes.filter((c) => c && c.reference).map((c) => {
    const etat = etatDeLaCollecte(c.etat);
    const montant = Math.max(0, entier(c.montant_xof));
    return {
      reference: c.reference,
      quand: c.repondu_le ?? c.demande_le,
      qui: c.genre === 'essai' ? 'Essai de 100 F' : c.origine === 'comptoir' ? 'Règlement au comptoir' : 'Règlement par le lien',
      nature: c.genre === 'essai' ? 'Essai' : 'Règlement',
      montantXof: montant,
      fraisXof: etat === 'recu' ? (Number.isFinite(Number(c.frais_xof)) && Number(c.frais_xof) > 0 ? entier(c.frais_xof) : Math.max(0, entier(frais(montant)))) : 0,
      etat,
      transaction: c.transaction_mtn ?? null,
      msisdn: c.msisdn ?? null,
    };
  });
}

/* ── 3. LE RELEVÉ ───────────────────────────────────────────────────────── */
export type Releve = {
  lignes: MouvementMtn[];
  /** Les mouvements confirmés par MTN. */
  recus: number;
  totalXof: number;
  fraisXof: number;
  /** Ce qui reste après les frais (collecte) ; égal au total pour le décaissement. */
  netXof: number;
  refuses: number;
  enCours: number;
  /** Par nature (Règlement, Essai, Paie), confirmés seulement. */
  parNature: { nature: string; nombre: number; totalXof: number }[];
};

/** Le relevé d'une période : les mouvements datés dans les bornes, du plus
    récent au plus ancien ; les totaux ne comptent que les « reçus ». */
export function releveDeLaPeriode(mouvements: readonly MouvementMtn[], b: Pick<Bornes, 'depuisMs' | 'jusquAMs'>, avecLesAutres = true): Releve {
  const dedans = mouvements.filter((x) => {
    const ms = Date.parse(x.quand);
    return Number.isFinite(ms) && ms >= b.depuisMs && ms < b.jusquAMs && x.etat !== 'annule';
  });
  const recus = dedans.filter((x) => x.etat === 'recu');
  const parNature = new Map<string, { nature: string; nombre: number; totalXof: number }>();
  for (const x of recus) {
    const n = parNature.get(x.nature) ?? { nature: x.nature, nombre: 0, totalXof: 0 };
    n.nombre += 1; n.totalXof += x.montantXof;
    parNature.set(x.nature, n);
  }
  const totalXof = recus.reduce((s, x) => s + x.montantXof, 0);
  const fraisXof = recus.reduce((s, x) => s + x.fraisXof, 0);
  return {
    lignes: (avecLesAutres ? dedans : recus).slice().sort((p, q) => q.quand.localeCompare(p.quand)),
    recus: recus.length,
    totalXof,
    fraisXof,
    netXof: totalXof - fraisXof,
    refuses: dedans.filter((x) => x.etat === 'refuse').length,
    enCours: dedans.filter((x) => x.etat === 'en-cours').length,
    parNature: [...parNature.values()].sort((p, q) => q.totalXof - p.totalXof),
  };
}

/* ── 4. L'EXPORT ────────────────────────────────────────────────────────
   Un CSV pour le comptable : séparateur « ; », montants entiers, heure de
   Cotonou, numéro masqué (le relevé peut sortir de la Maison). */
const masque = (msisdn?: string | null): string => {
  const c = String(msisdn ?? '').replace(/\D/g, '');
  return c.length >= 2 ? `01 •• •• •• ${c.slice(-2)}` : '';
};
const aCotonouDit = (iso: string): string => {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return '';
  const d = new Date(ms + HEURE_MS);
  return `${d.getUTCFullYear()}-${p2(d.getUTCMonth() + 1)}-${p2(d.getUTCDate())} ${p2(d.getUTCHours())}:${p2(d.getUTCMinutes())}`;
};
const cellule = (v: string | number): string => {
  const s = String(v);
  return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const ETAT_DIT: Record<EtatDuMouvement, string> = { recu: 'Reçu', refuse: 'Refusé par MTN', 'en-cours': 'En cours', annule: 'Annulé' };
export const etatDuMouvementDit = (e: EtatDuMouvement): string => ETAT_DIT[e];

export function releveEnCsv(r: Pick<Releve, 'lignes'>): string {
  const tete = ['Date (Cotonou)', 'Nature', 'Qui', 'Montant (F)', 'Frais (F)', 'État', 'Transaction MTN', 'Référence', 'Numéro'];
  const corps = r.lignes.map((x) => [aCotonouDit(x.quand), x.nature, x.qui, x.montantXof, x.fraisXof, ETAT_DIT[x.etat], x.transaction ?? '', x.reference, masque(x.msisdn)]);
  return [tete, ...corps].map((l) => l.map(cellule).join(';')).join('\r\n');
}

/** Le jour le plus ancien qu'il faut lire au registre pour une période : le
    filtre se fait sur la date de demande, et une réponse arrive au plus tard
    quelques jours après (marge de 7 jours). */
export const lireDepuisIso = (b: Pick<Bornes, 'depuisMs'>): string => new Date(b.depuisMs - 7 * JOUR_MS).toISOString();
