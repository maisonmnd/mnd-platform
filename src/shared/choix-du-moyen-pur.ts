/* ══ LE CHOIX DU MOYEN · 12 novembre 2026 ═══════════════════════════════
   Maquette « Le choix du moyen » (claude.ai DnRyTv95VLvgXosuEBzDF4,
   public/maquette-le-choix-du-moyen.html), « construis » de Yéman le
   12 novembre 2026. Aucun choix n'était coché au sélecteur : ce sont les six
   propositions de la maquette.

   · UNE SEULE TUILE « Mobile money » : le Trône choisit le moyen, la
     caissière peut changer d'un toucher (« Autre moyen ») ;
   · LA BASCULE SEULE : un prestataire qui ne répond pas est passé, et la
     fenêtre le dit en une ligne ;
   · l'affiche Chap Chap de KkiaPay est RETIRÉE (Tap & Go et « Payer par
     MTN » la remplacent, et se confirment seuls) ;
   · MTN MoMoPay en SECOURS : proposé seulement quand l'API MTN et FedaPay ne
     répondent pas ; il reste à portée de main pour un argent déjà reçu ;
   · à distance, rien à rebrancher ; l'argent des comptes : la paie du 5
     d'abord, le surplus à la banque le lundi (lots suivants).

   L'ORDRE, AU COMPTOIR. Les frais de MTN restent à la Maison (sa décision
   du 12 novembre) : « Payer par MTN » est le moins cher pour elle, et MTN
   confirme seul. Ensuite FedaPay (Moov, Celtiis, et MTN quand l'API MTN est
   fermée), puis Tap & Go (FedaPay, sans internet), puis MoMoPay, à pointer
   le soir. La carte : le QR de FedaPay, puis le terminal de la banque.

   Tout se décide ici, sans magasin ni React : `scripts/verifie-le-choix-du-moyen`
   le rejoue. L'écran (`clients/actions.tsx`) et la lecture de la santé
   (`clients/sante-des-moyens.ts`) ne font qu'appliquer. */
import { estUnNumeroMtn, msisdnDe } from './collecte-mtn-pur';

/** La tuile que la caissière touche. */
export type Voie = 'mobile' | 'carte';
/** Les moyens du comptoir, tels que la règle les range. */
export type Rail = 'mtn' | 'fedapay' | 'tapgo' | 'momopay' | 'carteFedapay' | 'terminal';
/** Les prestataires que le Trône relit. */
export type Prestataire = 'mtn' | 'fedapay';

export type FicheDuRail = {
  nom: string;
  sous: string;
  voie: Voie;
  /** Le prestataire confirme lui-même : rien à pointer le soir. */
  seConfirmeSeul: boolean;
  prestataire?: Prestataire;
  /** Ce que la cliente paie en plus, dit en clair. */
  frais: string;
  /** Un moyen de secours : jamais proposé tant qu'un autre répond. */
  secours?: boolean;
};

export const RAILS: Record<Rail, FicheDuRail> = {
  mtn: { nom: 'Payer par MTN', sous: 'la demande part sur son téléphone', voie: 'mobile', seConfirmeSeul: true, prestataire: 'mtn', frais: 'sans frais pour elle' },
  fedapay: { nom: 'FedaPay', sous: 'la demande part sur son téléphone', voie: 'mobile', seConfirmeSeul: true, prestataire: 'fedapay', frais: 'frais FedaPay ajoutés pour elle' },
  tapgo: { nom: 'Tap & Go', sous: 'elle compose le code, tous réseaux, sans internet', voie: 'mobile', seConfirmeSeul: true, prestataire: 'fedapay', frais: 'frais Tap & Go ajoutés pour elle' },
  momopay: { nom: 'MTN MoMoPay', sous: 'code 909099', voie: 'mobile', seConfirmeSeul: false, frais: 'frais dans le code MoMo', secours: true },
  carteFedapay: { nom: 'Carte, par FedaPay', sous: 'un QR à l’écran, elle paie sur son téléphone', voie: 'carte', seConfirmeSeul: true, prestataire: 'fedapay', frais: 'frais de la carte ajoutés pour elle' },
  terminal: { nom: 'Terminal de la banque', sous: 'la carte tendue au terminal', voie: 'carte', seConfirmeSeul: false, frais: 'commission de la banque', secours: true },
};

/** Au-delà, la demande MTN ne se propose pas (le plafond que `collecte-mtn` refuse). */
export const PLAFOND_MTN_XOF = 2_000_000;

/** L'ordre de la règle, voie par voie. Un numéro qui n'est pas chez MTN
    (Moov, Celtiis) passe d'abord par FedaPay. */
export function ordreDuComptoir(voie: Voie, telephone?: string | null): Rail[] {
  if (voie === 'carte') return ['carteFedapay', 'terminal'];
  const m = msisdnDe(telephone ?? '');
  if (m && !estUnNumeroMtn(m)) return ['fedapay', 'tapgo', 'momopay'];
  return ['mtn', 'fedapay', 'tapgo', 'momopay'];
}

/** CE QUE LE TRÔNE SAIT D'UN PRESTATAIRE.
    `ouvert` : branché et allumé (un moyen fermé n'est pas en panne, il
    n'est simplement pas proposé) ; `repond` : sa fonction répond, et aucune
    demande n'a échoué depuis moins de dix minutes. */
export type EtatDuPrestataire = { ouvert: boolean; repond: boolean; pourquoi?: string; depuis?: string };
export type SanteDesMoyens = Record<Prestataire, EtatDuPrestataire>;

/** Une panne vue sur une vraie demande se retient dix minutes, à moins
    qu'une demande ne repasse avant. */
export const PANNE_RETENUE_MS = 10 * 60_000;
/** Le Trône relit les prestataires toutes les minutes, fenêtre ouverte. */
export const RELECTURE_DE_LA_SANTE_MS = 60_000;

const NOM_DU_PRESTATAIRE: Record<Prestataire, string> = { mtn: 'MTN', fedapay: 'FedaPay' };
/** Le poste n'a pas de réseau : ce n'est la panne d'aucun prestataire. */
export const HORS_LIGNE = 'le Trône est hors ligne';

/** « 14 h 02 », heure de Cotonou (UTC+1, sans heure d'été). */
export function heureDite(ms: number): string {
  const d = new Date(ms + 60 * 60_000);
  const h = d.getUTCHours();
  const mn = d.getUTCMinutes();
  return `${h} h ${String(mn).padStart(2, '0')}`;
}

/** Ce que la fonction du prestataire a répondu à sa dernière lecture
    (`null` : elle n'a pas répondu). Pour MTN : `pret` (les clés et le
    relais), `ouvert` (l'interrupteur de la direction) ; pour FedaPay :
    `pret` (la clé posée). */
export type LectureDuPrestataire = { pret: boolean; ouvert?: boolean; le: number } | null;
/** Une demande qui a échoué faute de réponse (pas un refus de la cliente). */
export type EchecDuPrestataire = { depuis: number; le: number } | null;

/** L'ÉTAT D'UN PRESTATAIRE, de ce que le Trône a lu et vu. */
export function etatDuPrestataire(p: Prestataire, o: {
  enLigne: boolean;
  /** FedaPay seulement : allumé dans Paramètres. */
  allume?: boolean;
  lecture?: LectureDuPrestataire;
  echec?: EchecDuPrestataire;
  maintenantMs: number;
}): EtatDuPrestataire {
  const nom = NOM_DU_PRESTATAIRE[p];
  if (!o.enLigne) return { ouvert: true, repond: false, pourquoi: HORS_LIGNE };
  if (p === 'fedapay' && o.allume === false) return { ouvert: false, repond: true, pourquoi: 'FedaPay n’est pas allumé (Paramètres › FedaPay)' };
  if (o.lecture === null) return { ouvert: true, repond: false, pourquoi: `${nom} ne répond pas` };
  if (o.lecture && !o.lecture.pret) {
    return { ouvert: false, repond: true, pourquoi: p === 'mtn' ? 'MTN n’est pas encore branché' : 'la clé FedaPay n’est pas posée' };
  }
  if (p === 'mtn' && o.lecture && o.lecture.ouvert === false) {
    return { ouvert: false, repond: true, pourquoi: 'le règlement par MTN n’est pas encore ouvert (Finances › MTN MoMo)' };
  }
  const e = o.echec;
  if (e && o.maintenantMs - e.le < PANNE_RETENUE_MS) {
    return { ouvert: true, repond: false, pourquoi: `${nom} ne répond pas depuis ${heureDite(e.depuis)}`, depuis: heureDite(e.depuis) };
  }
  return { ouvert: true, repond: true };
}

/** UNE PANNE DE PLUS : la première fixe « depuis », les suivantes la prolongent. */
export function echecSuivant(avant: EchecDuPrestataire | undefined, maintenantMs: number): EchecDuPrestataire {
  if (avant && maintenantMs - avant.le < PANNE_RETENUE_MS) return { depuis: avant.depuis, le: maintenantMs };
  return { depuis: maintenantMs, le: maintenantMs };
}

export type ContexteDuChoix = {
  voie: Voie;
  /** Le numéro de sa fiche (ou celui qu'on vient de taper). */
  telephone?: string | null;
  /** Ce que cette part règle. */
  montantXof: number;
  sante: SanteDesMoyens;
  /** Tap & Go ouvert dans Paramètres, et le serveur le sait. */
  tapGoOuvert: boolean;
  /** Une autre part passe déjà par FedaPay : une seule demande FedaPay par encaissement. */
  fedapayPris?: boolean;
  /** Plusieurs parts : MTN règle tout le reste de la pièce en une fois. */
  plusieursParts?: boolean;
  /** Un moyen en devise : ni MTN ni FedaPay. */
  enDevise?: boolean;
  /** Le moyen que la caissière a touché elle-même. */
  aLaMain?: Rail;
};

export type LigneDuChoix = { rail: Rail; hors?: string };
export type LeChoix = {
  /** Le moyen proposé (ou celui qu'elle a choisi) ; `null` : aucun ne répond. */
  rail: Rail | null;
  ordre: LigneDuChoix[];
  /** Pourquoi ce moyen, en une phrase. */
  pourquoi: string;
  /** La panne à dire au-dessus des tuiles, s'il y en a une. */
  panne?: string;
  aLaMain: boolean;
};

/** POURQUOI UN MOYEN N'EST PAS PROPOSÉ ; '' : il l'est. */
export function horsDuRail(r: Rail, c: ContexteDuChoix): string {
  const fiche = RAILS[r];
  if (r === 'mtn') {
    if (c.enDevise) return 'MTN ne prend que des francs';
    if (c.plusieursParts) return 'MTN règle tout le reste en une seule fois';
    if (c.montantXof > PLAFOND_MTN_XOF) return 'au-delà de 2 000 000 F';
  }
  if (fiche.prestataire === 'fedapay') {
    if (c.enDevise) return 'FedaPay ne prend que des francs';
    if (c.fedapayPris) return 'une autre part passe déjà par FedaPay';
    if (r === 'tapgo' && !c.tapGoOuvert) return 'Tap & Go n’est pas ouvert';
  }
  if (r === 'momopay' && c.enDevise) return 'MoMoPay ne prend que des francs';
  if (fiche.prestataire) {
    const s = c.sante[fiche.prestataire];
    if (!s.ouvert || !s.repond) return s.pourquoi ?? `${NOM_DU_PRESTATAIRE[fiche.prestataire]} ne répond pas`;
  }
  return '';
}

const RAISON_DU_PREMIER: Record<Rail, (c: ContexteDuChoix) => string> = {
  mtn: (c) => (msisdnDe(c.telephone ?? '')
    ? 'Son numéro est chez MTN : sans frais pour elle, et MTN confirme seul.'
    : 'Pas de numéro sur sa fiche : tapez-le. Par MTN, sans frais pour elle, et MTN confirme seul.'),
  fedapay: () => 'Son numéro n’est pas chez MTN : FedaPay lui envoie la demande (Moov ou Celtiis) et confirme seul.',
  tapgo: () => 'Elle compose le code sur son téléphone, n’importe quel réseau ; le Trône reconnaît son paiement au montant.',
  momopay: () => 'MoMoPay, à pointer le soir sur le relevé.',
  carteFedapay: () => 'Un QR à l’écran : elle paie par carte sur son téléphone, et FedaPay confirme seul.',
  terminal: () => 'Le terminal de la banque, à pointer sur le relevé.',
};

/** LE CHOIX : l'ordre de la voie, chaque moyen jugé, le premier qui
    répond proposé, sauf si la caissière en a touché un autre qui répond. */
export function leChoixDuMoyen(c: ContexteDuChoix): LeChoix {
  const ordre: LigneDuChoix[] = ordreDuComptoir(c.voie, c.telephone).map((rail) => {
    const hors = horsDuRail(rail, c);
    return hors ? { rail, hors } : { rail };
  });
  const libres = ordre.filter((l) => !l.hors);
  /* MoMoPay ne prend que MTN : il reste à portée de main (elle peut payer
     depuis un autre téléphone), mais ne se propose pas pour un numéro Moov
     ou Celtiis. */
  const m = msisdnDe(c.telephone ?? '');
  const horsMtn = !!m && !estUnNumeroMtn(m);
  const premier = libres.find((l) => !(l.rail === 'momopay' && horsMtn))?.rail ?? null;
  const pris = c.aLaMain && libres.some((l) => l.rail === c.aLaMain) ? c.aLaMain : null;
  const rail = pris ?? premier;

  /* La panne se dit seulement pour un prestataire de cette voie qui ne
     répond pas (un moyen fermé n'est pas une panne). */
  const prestataires = [...new Set(ordre.map((l) => RAILS[l.rail].prestataire).filter((p): p is Prestataire => !!p))];
  const enPanne = prestataires.filter((p) => c.sante[p].ouvert && !c.sante[p].repond);
  const raisons = [...new Set(enPanne.map((p) => c.sante[p].pourquoi ?? `${NOM_DU_PRESTATAIRE[p]} ne répond pas`))];
  const panne = !raisons.length
    ? undefined
    : raisons.includes(HORS_LIGNE)
      ? 'Le Trône est hors ligne : les demandes MTN et FedaPay attendent le retour du réseau.'
      : `${raisons.map((r) => r.replace(/^./, (x) => x.toUpperCase())).join('. ')}. ${enPanne.length > 1
        ? 'Le Trône les relit chaque minute et les reprend dès qu’ils répondent.'
        : 'Le Trône le relit chaque minute et le reprend dès qu’il répond.'}`;

  let pourquoi: string;
  if (!rail) {
    pourquoi = c.voie === 'carte'
      ? 'Aucun moyen de carte ne répond : encaissez autrement.'
      : horsMtn && libres.some((l) => l.rail === 'momopay')
        ? 'FedaPay ne répond pas, et son numéro n’est pas chez MTN : encaissez autrement (MoMoPay seulement si elle paie depuis un numéro MTN).'
        : 'Aucun moyen ne répond pour ce cas : encaissez en espèces, ou par un autre moyen.';
  } else if (pris && pris !== premier) {
    pourquoi = `Choisi à la main. Le Trône proposait ${premier ? RAILS[premier].nom : 'un autre moyen'}.`;
  } else if (ordre[0] && rail === ordre[0].rail) {
    pourquoi = RAISON_DU_PREMIER[rail](c);
  } else {
    const tete = ordre[0];
    /* « À pointer le soir » se dit déjà à côté du moyen : pas ici une seconde fois. */
    pourquoi = `${RAILS[tete.rail].nom} n’est pas proposé : ${tete.hors}. ${RAILS[rail].nom} prend sa place.`;
  }
  return { rail, ordre, pourquoi, ...(panne ? { panne } : {}), aLaMain: !!pris && pris !== premier };
}

/** LES AUTRES MOYENS qu'on peut toucher sous la proposition : ceux qui
    répondent, sauf celui qui est pris. */
export const autresMoyens = (ch: LeChoix): Rail[] => ch.ordre.filter((l) => !l.hors && l.rail !== ch.rail).map((l) => l.rail);

/** LA PANNE VUE SUR UNE VRAIE DEMANDE. Un refus de la cliente (code
    secret, solde) n'en est pas une ; un serveur muet ou en erreur, si. */
export function estUnePanne(o: { status?: number; horsLigne?: boolean; code?: string }): boolean {
  if (o.horsLigne) return false;
  if (o.code && ['indisponible', 'SANS_SERVEUR'].includes(o.code)) return true;
  return typeof o.status === 'number' && (o.status === 0 || o.status >= 500);
}
