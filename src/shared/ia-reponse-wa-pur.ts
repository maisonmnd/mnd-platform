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

   CE MODULE EST PUR : ni écran, ni réseau, ni magasin. Le composant
   `ReponseProposee` (routes/clients) compose la demande avec lui, et le banc
   `verifie-la-reponse-proposee` l'éprouve seul. */

/** Douze messages au plus : la question du jour, pas l'histoire entière. */
export const FIL_MAX = 12;
/** Un message du fil ne part pas entier s'il est une lettre. */
export const SIGNES_MAX_PAR_MESSAGE = 600;
/** Soixante mots au plus : une réponse WhatsApp, pas une page. */
export const MOTS_MAX = 60;
/** Et jamais au-delà de 500 signes, même en une seule phrase. */
export const SIGNES_MAX = 500;
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
};

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
/** « SÍNSIN™ Essentiel : 35 000 F », « VÈKPÈ™ Jumbo : à partir de 135 000 F »
    (une création, une réparation, une prestation « consultation avant » :
    la porte est la consultation, le prix se dit « à partir de », choix du
    14 octobre 2026), « … : sur devis, après consultation ». Masquée,
    archivée : rien. Les prix sont ceux de `prixDuCatalogue`, les mêmes que
    l'automate envoie.

    UN PRIX « VARIABLE » SE DIT AUSSI « À PARTIR DE » (reprise du 19 octobre
    2026) : c'est ce que le Catalogue promet (« affiché "à partir de",
    montant fixé au fauteuil ») et ce que Ma Couronne affiche. L'écrire comme
    un prix fixe ferait dire à Claude un montant que le fauteuil corrigera. */
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
    const p = prix[s.id];
    const aPartirDe = porteDe(s, cats) === 'consultation' || s.priceMode === 'variable';
    if (p > 0) out.push(`${nom} : ${aPartirDe ? 'à partir de ' : ''}${prixDitWa(p)}`);
    else if (s.priceMode === 'devis') out.push(`${nom} : sur devis, après consultation`);
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

  lignes.push(o.catalogue.length
    ? `Catalogue (les seuls prix que tu peux donner, tels quels) :\n${o.catalogue.slice(0, LIGNES_DE_CATALOGUE_MAX).map((l) => `- ${l}`).join('\n')}`
    : 'Catalogue : aucun prix disponible. Ne donne aucun montant ; dis que l’équipe précise.');

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
    'Tu écris, au nom de la Maison MND (maison de soin des locks à Cotonou, Bénin), la réponse WhatsApp à une cliente.',
    'Une personne de l’équipe la relira, la corrigera et décidera seule de l’envoyer : tu PROPOSES, tu n’envoies rien.',
    '',
    'La voix de la Maison : chaleureuse, simple, courte. Le vouvoiement, toujours. On dit « la Maison », JAMAIS « salon ».',
    `Pas d’émoji, pas de tiret long, pas de liste, pas de titre. ${MOTS_MAX} mots au plus, en français (ou dans la langue de la cliente).`,
    '',
    'Ce que tu sais d’elle est dans le contexte : comment on l’appelle (reprends cet appel tel quel, n’invente ni nom ni civilité),',
    'son prochain rendez-vous, ce qui lui reste à régler, les places libres si l’agenda a été consulté, et les prix du catalogue.',
    '',
    'Règles absolues :',
    '- Les prix : uniquement ceux du catalogue donnés dans le contexte, écrits tels quels. Pour une création ou une réparation, le prix se dit toujours « à partir de » (la consultation fixe le prix exact). Aucun autre montant, aucune estimation.',
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
