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
       aux douze derniers messages, textes seulement, passés par `pourClaude` ;
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

export type MessageDuFilPourClaude = { sens: 'entrant' | 'sortant'; texte: string; type?: string };
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
    l'automate envoie. */
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
    const consultationDAbord = porteDe(s, cats) === 'consultation';
    if (p > 0) out.push(`${nom} : ${consultationDAbord ? 'à partir de ' : ''}${prixDitWa(p)}`);
    else if (s.priceMode === 'devis') out.push(`${nom} : sur devis, après consultation`);
    if (out.length >= LIGNES_DE_CATALOGUE_MAX) break;
  }
  return out;
}

/* ── LE CONTEXTE, ANONYMISÉ ────────────────────────────────────────────── */
const personneDuNom = (nom: string | null | undefined): Personne => {
  const mots = String(nom ?? '').trim().split(/\s+/).filter(Boolean);
  return { prenom: mots[0] ?? '', nom: mots.slice(1).join(' ') };
};

const coupe = (t: string, n: number): string => {
  const s = String(t ?? '').replace(/\s+/g, ' ').trim();
  return s.length <= n ? s : `${s.slice(0, n - 1).trimEnd()}…`;
};

/** Les derniers messages qui sont du texte : une photo, un vocal, un vide ne
    se lisent pas. Douze au plus, les plus récents. `qui` nomme la cliente
    dans le fil (« Elle », ou « Lui » quand la fiche dit Monsieur). */
export function filPourClaude(fil: readonly MessageDuFilPourClaude[], personnes: readonly Personne[], qui = 'Elle'): string[] {
  return fil
    .filter((m) => (!m.type || m.type === 'text') && String(m.texte ?? '').trim())
    .slice(-FIL_MAX)
    .map((m) => `${m.sens === 'entrant' ? qui : 'La Maison'} : ${pourClaude(coupe(m.texte, SIGNES_MAX_PAR_MESSAGE), personnes)}`);
}

/** CE QUE CLAUDE REÇOIT. Jamais un nom entier, jamais un numéro : la cliente
    se dit « Clarisse D. », on dit comment la Maison l'appelle, et le texte
    entier repasse par `pourClaude` à la fin, au cas où. */
export function contextePourClaude(o: ContexteDeLaReponse): string {
  const nomDeLaFiche = o.fiche?.name?.trim() ?? '';
  const profil = o.nomProfil && !/\d/.test(o.nomProfil) ? o.nomProfil.trim() : '';
  const personnes: Personne[] = [nomDeLaFiche, profil].filter(Boolean).map(personneDuNom);
  const elle = nomDeLaFiche ? prenomEtInitiale(personneDuNom(nomDeLaFiche)) : profil ? prenomEtInitiale(personneDuNom(profil)) : '';
  const appel = appelDe(o.fiche ?? null, profil || null);

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
    if (typeof o.resteDu === 'number' && Number.isFinite(o.resteDu)) {
      lignes.push(o.resteDu > 0 ? `Reste dû sur ses factures : ${prixDitWa(o.resteDu)} (ne cite aucun numéro de pièce).` : 'Rien à régler : ses factures sont soldées.');
    }
  } else {
    lignes.push('Elle n’a pas de fiche à la Maison : ni rendez-vous connu, ni compte.');
  }

  if (o.places) {
    const dites = prochainesPlaces(o.places, PLACES_DITES);
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

  return pourClaude(lignes.join('\n'), personnes);
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
const porteUnNumero = (t: string): boolean => [...t.matchAll(NUMERO)].some((m) => !DATE_ISO.test(m[0].trim()));

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
    .replace(/[\p{Extended_Pictographic}\u{FE0F}\u{200D}]/gu, '')
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
