import { prenomEtInitiale, pourClaude, type Personne } from './ia-anonymise-pur';
import { appelDe } from './civilite';
import { prixDuCatalogue, prixDitWa } from './automate-wa';
import { porteDe } from './qualification';
import { prochainesPlaces } from './reservation-express';
import type { PriceMode } from './catalogue-pur';

/* ══ LA RÉPONSE WHATSAPP PROPOSÉE — 19 octobre 2026 ══════════════════════
   Chantier 4 des huit (maquette NKQMiMMY… validée, « Tout me va ») :
   « Dans Conversations : "Proposer une réponse". Claude lit le fil, sa fiche
   (civilité, prochain rendez-vous, reste dû), l'agenda et le catalogue, et
   écrit dans la voix de la Maison. Vous relisez, changez un mot, envoyez.
   Rien ne part seul : l'automate de réservation reste comme il est. »

   SES CHOIX :
     · le prix du catalogue, comme le site : « à partir de » pour les
       créations (choix du 14 octobre 2026, lot 1 du Conseil Locks) ; on
       réutilise `prixDuCatalogue` et `prixDitWa` de l'automate, et la porte
       de `qualification` (création, réparation, devis = consultation
       d'abord) : une seule règle des prix dans la Maison, pas une seconde ;
     · chez Claude, prénom et initiale, la civilité dite comme on l'appelle
       (« Madame Clarisse », `appelDe`), JAMAIS un numéro ; le fil se borne
       aux douze derniers messages, leurs mots passés par `pourClaude` (une
       photo, un vocal se disent par leur nature) ; seuls les fils des
       clientes s'ouvrent à Claude, jamais l'équipe ni un fil marqué privé ;
     · ce qu'elle doit se dit à Claude, qui n'en parle que si elle en parle
       (« ne pas faire voir mon retard aux clients », 18 octobre 2026) ;
     · l'agenda : les places se disent dans l'ordre du site (`prochainesPlaces`,
       deux par jour d'abord) quand on les a ; sans agenda, Claude n'en promet
       aucune et renvoie à la réservation en ligne. Le Trône ne calcule pas
       les places libres lui-même (c'est le serveur qui les juge pour le site
       et pour l'automate) : l'écran passe donc sans agenda pour l'instant ;
     · ce que Claude rend est une PROPOSITION qui remplit la zone de saisie ;
       « Envoyer » reste le bouton existant ; « Une autre » redemande.

   LA VOIX DU 27 OCTOBRE 2026 (Yéman : « un ton beaucoup plus premium qui
   ressemble à la Maison MND. La création des locks et la réparation ont
   besoin d'une consultation avant le devis, comme sur le site. Pour les
   soins, coiffures, reprises et autres, le catalogue s'ouvre pour accéder
   aux prix. Demander à la cliente son nombre de locks approximatif avant de
   faire une quotation ») :
     · une création ou une réparation ne porte PLUS AUCUN prix, pas même
       « à partir de » : la consultation d'abord, le devis par écrit après,
       comme le dit le site (« Pourquoi certains prix sont-ils sur devis ? ») ;
     · le reste se dit au prix de la carte, PAR PALIER DE LOCKS comme la
       réservation du site, et le lien du catalogue en ligne l'accompagne ;
     · son nombre de locks (compté à la Maison, ou annoncé par elle) entre au
       contexte ; inconnu, Claude le lui demande avant tout prix ;
     · la consigne et le contexte restent purs et exportés : l'assistant
       WhatsApp qui répond seul (le-trone-35) parle de la même voix. Les prix
       par palier y entrent déjà calculés (`prixParPalier`, `prixPourElle`).

   CE MODULE EST PUR : ni écran, ni réseau, ni magasin. Le composant
   `ReponseProposee` (routes/clients) compose la demande avec lui, et le banc
   `verifie-la-reponse-proposee` l'éprouve seul. */

/** Douze messages au plus : la question du jour, pas l'histoire entière. */
export const FIL_MAX = 12;
/** Un message du fil ne part pas entier s'il est une lettre. */
export const SIGNES_MAX_PAR_MESSAGE = 600;
/** Soixante-dix mots au plus : une réponse WhatsApp, pas une page ; la voix
    soignée et le lien du catalogue demandent un peu plus que soixante. */
export const MOTS_MAX = 70;
/** Et jamais au-delà de 600 signes, même en une seule phrase. */
export const SIGNES_MAX = 600;
/** LES LIENS DE LA MAISON (27 octobre 2026), tels que le site les ouvre :
    le catalogue des prestations directes avec leurs prix par palier de
    locks, et la consultation de chaque porte. */
export const LIENS_DE_LA_MAISON = {
  catalogue: 'https://maisonmnd.com/reserver/?besoin=entretien',
  creation: 'https://maisonmnd.com/reserver/?besoin=creation',
  reparation: 'https://maisonmnd.com/reserver/?besoin=reparation',
} as const;
/** Le catalogue se borne : au-delà, Claude a assez de repères. */
export const LIGNES_DE_CATALOGUE_MAX = 40;
/** Les places dites, comme sur le site : six. */
export const PLACES_DITES = 6;

export type MessageDuFilPourClaude = { sens: 'entrant' | 'sortant'; texte: string; type?: string; etat?: string };
export type FichePourClaude = { name?: string | null; civilite?: 'madame' | 'mademoiselle' | 'monsieur'; auMasculin?: boolean } | null | undefined;
export type RdvPourClaude = { date: string; time?: string; gestes?: readonly string[] };
export type JourDePlaces = { iso: string; heures: readonly { heure: string }[] };
export type PrestationPourClaude = {
  id: string; name: string; categoryId: string;
  priceXof?: number; hidePrice?: boolean; priceMode?: PriceMode; archived?: boolean; consultationAvant?: boolean; code?: string;
  /** Le prix de la carte à chaque palier de locks, déjà calculé par l'appelant
      (le Trône avec `pricing`, le serveur avec `prix-calibre`). */
  prixParPalier?: readonly PrixDuPalier[];
  /** Son prix à elle, quand son nombre de locks est connu. */
  prixPourElle?: number;
};
export type PrixDuPalier = { palier: string; prixXof: number };

/** LES PALIERS DE LOCKS, comme la réservation du site les nomme (« jusqu’à
    80 locks », « 81 à 150 locks », « plus de 550 locks ») et le nombre qui
    représente chacun (son plafond ; cent de plus pour le dernier). */
export function paliersDeLocks(bandes: readonly { id: string; maxLocks?: number | null }[]): { id: string; palier: string; locks: number }[] {
  const tri = [...bandes].sort((a, b) => (a.maxLocks ?? Infinity) - (b.maxLocks ?? Infinity));
  return tri.map((b, i) => {
    const avant = i > 0 ? tri[i - 1].maxLocks ?? 0 : 0;
    const max = b.maxLocks ?? null;
    const palier = max == null ? `plus de ${avant} locks` : avant === 0 ? `jusqu’à ${max} locks` : `${avant + 1} à ${max} locks`;
    return { id: b.id, palier, locks: max ?? avant + 100 };
  });
}

export type ContexteDeLaReponse = {
  fil: readonly MessageDuFilPourClaude[];
  fiche?: FichePourClaude;
  /** Le nom que WhatsApp annonce, pour une tête sans fiche. */
  nomProfil?: string;
  prochainRdv?: RdvPourClaude | null;
  derniereVenue?: RdvPourClaude | null;
  /** Ce qui lui reste à régler, en francs ; absent = on ne sait pas. */
  resteDu?: number;
  /** Les jours et leurs heures libres ; absent = l'agenda n'a pas été consulté. */
  places?: readonly JourDePlaces[];
  /** Les lignes du catalogue, déjà écrites par `lignesDuCataloguePourClaude`. */
  catalogue: readonly string[];
  /** SON NOMBRE DE LOCKS : compté à la Maison, ou annoncé par elle ; absent = inconnu. */
  locks?: { compte?: number | null; declare?: number | null };
  /** AAAA-MM-JJ, le jour de la Maison. */
  aujourdhui: string;
  /** La proposition qu'on vient d'écarter (« Une autre ») : la suivante diffère. */
  dejaProposee?: string;
};

/* ── LES DATES, TOUJOURS AVEC L'ANNÉE ──────────────────────────────────── */
const FORMAT_DU_JOUR = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

/** « mercredi 21 octobre 2026 à 14:00 » : l'année toujours (trois demandes). */
export function dateDitePourClaude(iso: string, heure?: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return '';
  const jour = FORMAT_DU_JOUR.format(new Date(`${iso}T12:00:00Z`));
  const h = String(heure ?? '').trim();
  return h ? `${jour} à ${h}` : jour;
}

/** Le jour local, AAAA-MM-JJ. */
export const isoDuJourLocal = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/* ── LA FICHE, LUE POUR LE CONTEXTE ─────────────────────────────────────── */
type RdvLisible = { date: string; time?: string; status: string; clientId?: string; serviceIds?: readonly string[] };

/** Son prochain rendez-vous : confirmé ou en attente, d'aujourd'hui ou plus
    tard, le plus proche d'abord. */
export function prochainRdvDe(appts: readonly RdvLisible[], clientId: string, aujourdhui: string, nomDe: (id: string) => string = () => ''): RdvPourClaude | null {
  const a = appts
    .filter((x) => x.clientId === clientId && (x.status === 'confirmé' || x.status === 'en attente') && x.date >= aujourdhui)
    .sort((x, y) => (`${x.date} ${x.time ?? ''}` < `${y.date} ${y.time ?? ''}` ? -1 : 1))[0];
  return a ? { date: a.date, time: a.time, gestes: (a.serviceIds ?? []).map(nomDe).filter(Boolean) } : null;
}

/** Sa dernière venue honorée, la plus récente d'abord. */
export function derniereVenueDe(appts: readonly RdvLisible[], clientId: string, aujourdhui: string, nomDe: (id: string) => string = () => ''): RdvPourClaude | null {
  const a = appts
    .filter((x) => x.clientId === clientId && x.status === 'honoré' && x.date <= aujourdhui)
    .sort((x, y) => (x.date > y.date ? -1 : 1))[0];
  return a ? { date: a.date, gestes: (a.serviceIds ?? []).map(nomDe).filter(Boolean) } : null;
}

/* ── LE CATALOGUE, AUX PRIX DU JOUR ────────────────────────────────────── */
/** UNE CRÉATION, UNE RÉPARATION, UN DEVIS, UNE « CONSULTATION AVANT » (la
    porte de `qualification`) : AUCUN PRIX, la consultation d'abord et le
    devis par écrit après (27 octobre 2026, comme le site ; avant ce jour
    on disait « à partir de »).

    LE RESTE AU PRIX DE LA CARTE, comme la réservation du site :
      · son prix à elle quand son nombre de locks est connu (`prixPourElle`) ;
      · sinon, s'il change d'un palier de locks à l'autre, chaque palier
        (« SÍNSIN™ Essentiel, selon le nombre de locks : jusqu’à 80 locks,
        35 000 F ; 81 à 150 locks, 40 000 F ») ;
      · sinon le prix seul, « à partir de » s'il est variable (le Catalogue
        promet « montant fixé au fauteuil »).
    Masquée, archivée : rien. Les prix de base sont ceux de `prixDuCatalogue`,
    les mêmes que l'automate envoie. */
export function lignesDuCataloguePourClaude(
  services: readonly PrestationPourClaude[],
  categories: readonly { id: string; parentId?: string }[],
): string[] {
  const prix = prixDuCatalogue(services.map((s) => ({ id: s.id, data: s as unknown as Record<string, unknown> })));
  const cats = [...categories];
  const out: string[] = [];
  for (const s of services) {
    if (s.archived === true || s.hidePrice === true || !s.name?.trim()) continue;
    const nom = s.name.trim();
    if (porteDe(s, cats) === 'consultation') {
      out.push(`${nom} : consultation d’abord, devis remis par écrit après la consultation (aucun prix avant)`);
    } else {
      const p = prix[s.id];
      const paliers = (s.prixParPalier ?? []).filter((x) => x.prixXof > 0 && x.palier.trim());
      const distincts = new Set(paliers.map((x) => x.prixXof));
      if ((s.prixPourElle ?? 0) > 0) out.push(`${nom} : ${prixDitWa(s.prixPourElle!)} pour elle, d’après son nombre de locks`);
      else if (distincts.size > 1) out.push(`${nom}, selon le nombre de locks : ${paliers.map((x) => `${x.palier}, ${prixDitWa(x.prixXof)}`).join(' ; ')}`);
      else if (paliers.length > 0) out.push(`${nom} : ${s.priceMode === 'variable' ? 'à partir de ' : ''}${prixDitWa(paliers[0].prixXof)}`);
      else if (p > 0) out.push(`${nom} : ${s.priceMode === 'variable' ? 'à partir de ' : ''}${prixDitWa(p)}`);
      else continue;
    }
    if (out.length >= LIGNES_DE_CATALOGUE_MAX) break;
  }
  return out;
}

/* ── LA ZONE DE SAISIE, ENTRE CLAUDE ET LA MAIN ─────────────────────────
   Reprise du 19 octobre 2026. La proposition REMPLIT la zone où l'on écrit :
     · « proposee » tant que la zone porte mot pour mot ce que Claude a
       écrit : elle se teinte cuivre, « à vérifier » ;
     · « retouchee » dès qu'un mot a changé : c'est désormais la sienne ;
     · « a-la-main » quand elle a écrit seule, « vide » sinon.
   Une proposition ne remplace JAMAIS en silence ce que la main a écrit ou
   retouché : on le lui demande d'abord. */
export type EtatDeLaZone = 'vide' | 'proposee' | 'retouchee' | 'a-la-main';
export function etatDeLaZone(texte: string | null | undefined, derniere: string | null | undefined): EtatDeLaZone {
  const t = String(texte ?? '').trim();
  if (!t) return 'vide';
  const d = String(derniere ?? '').trim();
  if (!d) return 'a-la-main';
  return t === d ? 'proposee' : 'retouchee';
}
export const zoneAProteger = (texte: string | null | undefined, derniere: string | null | undefined): boolean => {
  const e = etatDeLaZone(texte, derniere);
  return e === 'retouchee' || e === 'a-la-main';
};

/* ── QUELS FILS CLAUDE PEUT LIRE ───────────────────────────────────────
   Reprise du 19 octobre 2026 : le chantier est celui des réponses aux
   CLIENTES (département Clientèle). Le tiroir de l'équipe et celui des
   prestataires portent la paie, les congés, les prêts : rien de cela ne part
   chez Claude. Un fil qu'elle a marqué privé non plus : le drapeau ferme
   l'écran, il ferme aussi la porte vers Claude. */
export const filOuvertAClaude = (f: { tiroir?: string; prive?: boolean } | null | undefined): boolean =>
  !!f && (f.tiroir ?? 'clientes') === 'clientes' && f.prive !== true;

/* ── LE CONTEXTE, ANONYMISÉ ────────────────────────────────────────────── */
/** Le prénom d'abord, comme le Trône l'écrit. SAUF « DOSSOU Clarisse » (reprise
    du 19 octobre 2026) : un premier mot tout en capitales suivi d'un mot qui
    ne l'est pas est le nom de famille, à la façon des papiers. Le lire comme
    un prénom l'enverrait chez Claude en entier (« DOSSOU C. »). */
const enCapitales = (m: string): boolean => /^\p{Lu}[\p{Lu}'’-]+$/u.test(m);
const personneDuNom = (nom: string | null | undefined): Personne => {
  const mots = String(nom ?? '').trim().split(/\s+/).filter(Boolean);
  if (mots.length >= 2 && enCapitales(mots[0]) && !enCapitales(mots[1])) {
    return { prenom: mots.slice(1).join(' '), nom: mots[0] };
  }
  return { prenom: mots[0] ?? '', nom: mots.slice(1).join(' ') };
};

/** LES FORMES À MASQUER pour une personne connue : son nom complet dans les
    deux ordres (`nomsEnInitiales`), et SON NOM DE FAMILLE SEUL (reprise du
    19 octobre 2026) : au Bénin on écrit volontiers « Madame Dossou », et
    « prénom et initiale seulement » (11 octobre) n'y laisse pas passer le
    nom. Trois lettres au moins, pour ne pas masquer un « Da » au hasard. */
const formesAMasquer = (p: Personne): Personne[] => {
  const nom = (p.nom ?? '').trim();
  return nom.replace(/[^\p{L}]/gu, '').length >= 3 ? [p, { nom }] : [p];
};

const coupe = (t: string, n: number): string => {
  const s = String(t ?? '').replace(/\s+/g, ' ').trim();
  return s.length <= n ? s : `${s.slice(0, n - 1).trimEnd()}…`;
};

/** Ce qui n'est pas un mot se dit par sa nature, entre crochets : Claude ne
    voit ni la photo ni le vocal, mais il sait qu'« et pour ça ? » parle
    d'une photo. Les noms sont ceux que le Trône affiche (webhook). */
const NATURE_DU_MESSAGE: Record<string, string> = {
  image: 'une photo', video: 'une vidéo', audio: 'un message vocal', document: 'un document',
  sticker: 'un autocollant', location: 'sa position', contacts: 'une fiche de contact',
};
/** Les messages qui portent des mots : le texte, le bouton d'un modèle ou
    d'une liste (son libellé), le modèle parti seul (son texte rendu). */
const TYPES_DE_MOTS = new Set(['text', 'button', 'interactive', 'template']);

/** Les derniers messages du fil, douze au plus, les plus récents. Les mots se
    lisent (passés par `pourClaude`) ; une photo, un vocal se disent par leur
    nature, leur légende à la suite ; une réaction, un type inconnu, un vide
    ne se lisent pas ; un message de la Maison « non remis » non plus : elle
    ne l'a jamais reçu. `qui` nomme la cliente (« Elle », ou « Lui » quand la
    fiche dit Monsieur). */
export function filPourClaude(fil: readonly MessageDuFilPourClaude[], personnes: readonly Personne[], qui = 'Elle'): string[] {
  const masques = personnes.flatMap(formesAMasquer);
  const lignes: string[] = [];
  for (const m of fil) {
    if (m.sens === 'sortant' && m.etat === 'non-remis') continue;
    const texte = String(m.texte ?? '').trim();
    const nature = m.type ? NATURE_DU_MESSAGE[m.type] : undefined;
    let dit = '';
    if (!m.type || TYPES_DE_MOTS.has(m.type)) dit = texte;
    else if (nature) dit = texte && texte !== nature ? `[${nature}] ${texte}` : `[${nature}]`;
    if (!dit) continue;
    lignes.push(`${m.sens === 'entrant' ? qui : 'La Maison'} : ${pourClaude(coupe(dit, SIGNES_MAX_PAR_MESSAGE), masques)}`);
  }
  return lignes.slice(-FIL_MAX);
}

/** CE QUE CLAUDE REÇOIT. Jamais un nom entier, jamais un numéro : la cliente
    se dit « Clarisse D. », on dit comment la Maison l'appelle, et le texte
    entier repasse par `pourClaude` à la fin, au cas où. */
export function contextePourClaude(o: ContexteDeLaReponse): string {
  const nomDeLaFiche = o.fiche?.name?.trim() ?? '';
  const profil = o.nomProfil && !/\d/.test(o.nomProfil) ? o.nomProfil.trim() : '';
  const personnes: Personne[] = [nomDeLaFiche, profil].filter(Boolean).map(personneDuNom);
  const masques = personnes.flatMap(formesAMasquer);
  const sienne = personneDuNom(nomDeLaFiche || profil);
  const elle = nomDeLaFiche || profil ? prenomEtInitiale(sienne) : '';
  /* L'appel de la Maison (`appelDe`), sur le nom remis dans l'ordre : le
     prénom d'abord, pour qu'une fiche « DOSSOU Clarisse » se dise « Madame
     Clarisse » et non par son nom de famille. */
  const nomRemis = [sienne.prenom, sienne.nom].filter(Boolean).join(' ');
  const appel = o.fiche
    ? appelDe({ ...o.fiche, name: nomDeLaFiche ? nomRemis : o.fiche.name }, profil ? nomRemis : null)
    : appelDe(null, profil ? nomRemis : null);

  const lignes: string[] = [];
  lignes.push('CONTEXTE, pour écrire la réponse de la Maison.');
  lignes.push(`La cliente : ${elle || 'sans fiche'}. On l’appelle : ${appel}.`);
  if (o.fiche && !o.fiche.civilite) lignes.push('Sa civilité n’est pas notée sur sa fiche.');
  lignes.push(`Aujourd’hui : ${dateDitePourClaude(o.aujourdhui)}.`);
  if (o.fiche) {
    const rdv = o.prochainRdv;
    lignes.push(rdv
      ? `Son prochain rendez-vous : ${dateDitePourClaude(rdv.date, rdv.time)}${rdv.gestes?.length ? ` (${rdv.gestes.join(', ')})` : ''}.`
      : 'Aucun rendez-vous à venir.');
    const venue = o.derniereVenue;
    if (venue) lignes.push(`Sa dernière venue : ${dateDitePourClaude(venue.date)}${venue.gestes?.length ? ` (${venue.gestes.join(', ')})` : ''}.`);
    /* LE RESTE DÛ NE S'ANNONCE PAS DE LUI-MÊME (reprise du 19 octobre 2026) :
       « ne pas faire voir mon retard aux clients » (18 octobre). Il se dit
       si elle en parle ; une relance glissée dans une réponse sur un tout
       autre sujet trahirait une saisie en retard, ou viserait une cliente
       qui a payé ce jour-là. */
    if (typeof o.resteDu === 'number' && Number.isFinite(o.resteDu) && o.resteDu >= 0) {
      lignes.push(o.resteDu > 0
        ? `Reste dû sur son compte : ${prixDitWa(o.resteDu)}. N’en parle QUE si son message porte sur ce qu’elle doit ou sur un règlement ; ne cite aucun numéro de pièce.`
        : 'Rien à régler : son compte est soldé.');
    }
  } else {
    lignes.push('Elle n’a pas de fiche à la Maison : ni rendez-vous connu, ni compte.');
  }

  /* Une place se propose à partir de demain, comme le site : celle du jour
     même, ou d'un jour passé, ne part jamais chez Claude. */
  if (o.places) {
    const dites = prochainesPlaces(o.places.filter((j) => /^\d{4}-\d{2}-\d{2}$/.test(j.iso) && j.iso > o.aujourdhui), PLACES_DITES);
    lignes.push(dites.length
      ? `Prochaines places libres (les seules que tu peux proposer) : ${dites.map((p) => dateDitePourClaude(p.iso, p.place.heure)).join(' ; ')}.`
      : 'Agenda consulté : aucune place libre prochainement. Ne promets rien ; dis que la Maison la rappelle pour une date.');
  } else {
    lignes.push('Agenda : non consulté. Ne promets aucune place : invite à réserver sur maisonmnd.com/reserver/ ou dis que la Maison confirme l’heure.');
  }

  /* SON NOMBRE DE LOCKS (27 octobre 2026) : le prix d'un soin en dépend,
     comme sur la réservation du site. Inconnu, Claude le lui demande. */
  const compte = o.locks?.compte && o.locks.compte > 0 ? Math.round(o.locks.compte) : 0;
  const declare = o.locks?.declare && o.locks.declare > 0 ? Math.round(o.locks.declare) : 0;
  lignes.push(compte
    ? `Son nombre de locks, compté à la Maison : environ ${compte}.`
    : declare
      ? `Son nombre de locks, annoncé par elle : environ ${declare} (pas encore compté à la Maison).`
      : 'Son nombre de locks : inconnu. Avant tout prix qui en dépend, demande-le-lui, approximativement.');

  lignes.push(o.catalogue.length
    ? `Catalogue (les seuls prix que tu peux donner, tels quels) :\n${o.catalogue.slice(0, LIGNES_DE_CATALOGUE_MAX).map((l) => `- ${l}`).join('\n')}`
    : 'Catalogue : aucun prix disponible. Ne donne aucun montant ; dis que l’équipe précise.');
  lignes.push(`Liens de la Maison, à donner tels quels, un seul par message : le catalogue en ligne, où elle voit les prix et réserve un soin, un entretien, une reprise ou une coiffure : ${LIENS_DE_LA_MAISON.catalogue} ; la consultation de création : ${LIENS_DE_LA_MAISON.creation} ; la consultation de réparation : ${LIENS_DE_LA_MAISON.reparation}.`);

  const lui = o.fiche?.civilite === 'monsieur' || o.fiche?.auMasculin === true;
  const tours = filPourClaude(o.fil, personnes, lui ? 'Lui' : 'Elle');
  lignes.push(tours.length
    ? `Le fil (les ${Math.min(FIL_MAX, tours.length)} derniers messages, le plus récent en bas) :\n${tours.join('\n')}`
    : 'Le fil : aucun message écrit encore.');

  lignes.push('Écris maintenant la réponse de la Maison à son dernier message.');
  if (o.dejaProposee?.trim()) lignes.push(`Une proposition a déjà été écartée, écris-en une autre, différente : « ${coupe(o.dejaProposee, SIGNES_MAX)} ».`);

  return pourClaude(lignes.join('\n'), masques);
}

/* ── LA CONSIGNE : LA VOIX DE LA MAISON ────────────────────────────────── */
export function consigneDeLaReponse(): string {
  return [
    'Tu écris, au nom de la Maison MND, maison de soin et de création de locks à Cotonou, la réponse WhatsApp à une cliente.',
    'Une personne de l’équipe la relira, la corrigera et décidera seule de l’envoyer : tu PROPOSES, tu n’envoies rien.',
    '',
    'La voix de la Maison MND est celle d’une maison d’exception : élégante, posée, attentionnée. Jamais familière, jamais commerciale, jamais pressante.',
    'Des phrases complètes et soignées, un français choisi : la Maison accueille, prend soin, parle de « votre couronne » et de « vos locks », d’un « rituel » plutôt que d’une prestation.',
    'Le vouvoiement, toujours. On dit « la Maison », JAMAIS « salon ». Ni « coucou », ni « ok », ni abréviation, ni point d’exclamation répété.',
    `Pas d’émoji, pas de tiret long, pas de liste, pas de titre. ${MOTS_MAX} mots au plus, en français (ou dans la langue de la cliente).`,
    'Le ton, par exemple : « Avec plaisir, Madame Clarisse. Pour vous indiquer le juste prix de votre entretien, pourriez-vous nous dire combien de locks vous portez, approximativement ? »',
    '',
    'Ce que tu sais d’elle est dans le contexte : comment on l’appelle (reprends cet appel tel quel, n’invente ni nom ni civilité),',
    'son prochain rendez-vous, ce qui lui reste à régler, son nombre de locks s’il est connu, les places libres si l’agenda a été consulté, les prix du catalogue et les liens de la Maison.',
    '',
    'Les prix, comme sur maisonmnd.com :',
    '- Une création de locks ou une réparation commence TOUJOURS par une consultation. N’en donne AUCUN prix, ni « à partir de », ni estimation : la Maison remet son devis par écrit après la consultation. Propose de réserver la consultation, avec son lien.',
    '- Les soins, les entretiens, les reprises, les coiffures et le reste se réservent au prix de la carte : ceux du catalogue du contexte, écrits tels quels. Tu peux donner le lien du catalogue en ligne, où elle retrouve les prix et réserve.',
    '- Avant tout prix qui dépend du nombre de locks, il te faut son nombre de locks. S’il n’est ni dans le contexte ni dans le fil, demande-lui d’abord, avec délicatesse, combien de locks elle porte approximativement, sans citer de montant. Une fois le nombre connu, donne le prix du palier qui lui correspond.',
    '- Aucun autre montant, aucune estimation, aucune remise que le contexte ne donne pas.',
    '',
    'Pour inscrire un rendez-vous, si elle n’a pas de fiche ou si sa civilité n’est pas notée : demande d’abord « Pour inscrire votre rendez-vous, comment devons-nous vous appeler ? », puis « Madame ou Monsieur ? ». Jamais une civilité supposée, jamais un simple prénom à sa place.',
    '',
    'Règles absolues :',
    '- Les places : ne promets JAMAIS une place, une heure ni un jour qui ne figure pas dans l’agenda du contexte. Sans agenda, invite à réserver sur maisonmnd.com/reserver/ ou dis que la Maison lui confirme l’heure.',
    '- Le cuir chevelu et les cheveux : aucun diagnostic ni avis à distance (démangeaison, plaque, chute, douleur). Invite à passer à la Maison ou à prendre une consultation.',
    '- Ne cite JAMAIS un numéro de facture, de reçu ou de devis, ni aucun numéro de téléphone.',
    '- Ce qu’elle doit : n’en parle jamais de toi-même. Seulement si son dernier message porte sur un règlement ou sur ce qu’elle doit ; aucune relance.',
    '- Une photo, un vocal se disent dans le fil entre crochets (« [une photo] ») : tu ne les vois pas et ne les entends pas. Ne décris rien, ne juge rien ; propose de regarder ensemble à la Maison.',
    '- N’invente rien : ce que le contexte ne dit pas, tu ne le sais pas ; propose alors que l’équipe précise.',
    '- Ne signe pas, n’ajoute ni devise ni longue formule finale : la personne qui envoie s’en charge.',
    '- Réponds à son dernier message, dans la suite du fil : si la Maison a déjà salué dans les derniers échanges, ne salue pas une seconde fois.',
    '',
    'Réponds uniquement par l’objet demandé : { "reponse": "le texte du message" }.',
  ].join('\n');
}

/** La forme attendue : un seul champ, le message. */
export const SCHEMA_DE_LA_REPONSE: Record<string, unknown> = {
  type: 'object',
  properties: { reponse: { type: 'string', description: `Le message WhatsApp proposé, ${MOTS_MAX} mots au plus, sans émoji.` } },
  required: ['reponse'],
  additionalProperties: false,
};

/* ── LA LECTURE : CE QUE CLAUDE A ÉCRIT, AVANT QU'ON LE RELISE ─────────── */
/** Un numéro : huit chiffres ou plus, espaces, points ou tirets permis entre
    les groupes (un téléphone, un numéro de pièce « MND-2026-0042 »). Une
    date ISO n'en est pas un. Un prix de la Maison (« 135 000 F ») a six
    chiffres et passe. */
const NUMERO = /\d(?:[\s.\-]?\d){7,}/g;
const DATE_ISO = /^\d{4}-\d{2}-\d{2}$/;
/** Et une pièce, même courte (reprise du 19 octobre 2026) : les séries de la
    Maison (« MND-2026-0042 », « MND-D-… », « F-… », « CMD-… », les anciennes
    « MND-V-… ») et un « n° 42 ». WhatsApp ferait d'un numéro un lien
    téléphone, et un numéro de pièce ne va jamais dans un message. */
const PIECE = /(^|[^\p{L}])(?:MND(?:-[A-Z])?|CMD|F)-\d|\bn[°º]\s*\d/iu;
const porteUnNumero = (t: string): boolean =>
  PIECE.test(t) || [...t.matchAll(NUMERO)].some((m) => !DATE_ISO.test(m[0].trim()));
/** Les émojis tombent, mais pas les signes des marques : « SÍNSIN™ », « ® »
    et « © » sont rangés parmi les pictogrammes par Unicode (reprise du
    19 octobre 2026, la proposition perdait le ™ des noms du catalogue). */
const EMOJI = /(?![\u00A9\u00AE\u2122])[\p{Extended_Pictographic}\u{FE0F}\u{200D}\u{20E3}]/gu;

export const motsDe = (t: string): number => String(t ?? '').trim().split(/\s+/).filter(Boolean).length;

/** Coupe aux phrases : on garde les premières qui tiennent dans la longueur ;
    si la première seule déborde, elle se coupe au mot, avec des points. Sans
    lookbehind : les vieux Safari le refusent à la lecture du module entier. */
function coupeAuxPhrases(t: string): string {
  if (motsDe(t) <= MOTS_MAX && t.length <= SIGNES_MAX) return t;
  const phrases = (t.match(/[^.!?…]+[.!?…]*/g) ?? [t]).map((p) => p.trim()).filter(Boolean);
  let garde = '';
  for (const p of phrases) {
    const essai = garde ? `${garde} ${p}` : p;
    if (motsDe(essai) > MOTS_MAX || essai.length > SIGNES_MAX) break;
    garde = essai;
  }
  if (garde) return garde;
  const mots = t.split(/\s+/);
  let court = '';
  for (const m of mots) {
    const essai = court ? `${court} ${m}` : m;
    if (motsDe(essai) > MOTS_MAX || essai.length > SIGNES_MAX - 1) break;
    court = essai;
  }
  return `${court.replace(/[\s,;:]+$/, '')}…`;
}

/** Vide, un numéro, le mot banni : `null`, rien n'est proposé. Le tiret long
    devient une virgule, les émojis et le gras tombent, le trop long se coupe.
    Accepte l'objet `{ reponse }` du schéma, ou un texte nu. */
export function lectureDeLaReponse(brut: unknown): string | null {
  const champ = brut && typeof brut === 'object' ? (brut as { reponse?: unknown }).reponse : brut;
  if (typeof champ !== 'string') return null;
  let t = champ
    .replace(/\r\n?/g, '\n')
    .replace(/\s*[—–]\s*/g, ', ')
    .replace(/\*\*/g, '')
    .replace(EMOJI, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .replace(/\n{2,}/g, '\n')
    .trim();
  if (!t) return null;
  if (porteUnNumero(t)) return null;
  if (/(^|[^\p{L}])salons?(?=$|[^\p{L}])/iu.test(t)) return null;
  t = coupeAuxPhrases(t.replace(/\n/g, ' '));
  return t || null;
}
