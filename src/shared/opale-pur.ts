/* OPALE RÉPOND SUR LE WHATSAPP DE LA MAISON, 4 novembre 2026.

   « L'automate fait beaucoup d'erreurs. J'aimerais que ce soit Opale qui
   gère les conversations du Trône et qu'on remplace l'automate. J'aimerais
   qu'Opale sache quoi répondre et quand les messages Meta doivent être
   déclenchés. Construis. » (Yéman, 4 novembre 2026.) Choix au sélecteur le
   même jour : au serveur, 24 h/24 ; seule pour tout le monde dès la mise en
   ligne ; elle garde la porte des modèles automatiques ; la voix de la
   Maison.

   CE QUE L'AUTOMATE FAISAIT MAL, lu dans les fils d'octobre et de novembre
   2026 : le menu « Comment pouvons-nous prendre soin de votre couronne ? »
   reposé alors que la cliente avait tout dit (le jour, l'heure, les gestes) ;
   « Pour qui est ce rendez-vous ? » à une cliente qui écrit pour elle ; le
   plan envoyé trois fois à une habituée ; une réponse à côté de la question
   (« le rendez-vous est-il confirmé pour 15 h ? ») ; « je suis l'assistant »
   glissé dans un « bien noté ».

   OPALE LIT TOUT LE FIL, puis répond en phrases. Elle ne devine aucune place
   et n'écrit rien au Trône de sa propre main : ses OUTILS le font, ceux que
   la fonction `whatsapp-automate` tient déjà (l'agenda du serveur, le
   verrou `pose_si_libre`, le déplacement chez la même personne). Un rendez-vous
   se pose en deux temps : `proposer_le_rendez_vous` tient la place et rend
   le récapitulatif ; la cliente dit oui ; `confirmer`, au tour suivant, pose
   ce qui a été proposé, rien d'autre. Ce qu'elle ne sait pas, ou ce qui
   revient à une personne (annuler, la santé, une plainte, l'argent, une
   photo ou un vocal), passe à l'équipe.

   Ce module est PUR : il dit la consigne, les outils, le contexte, les juges
   du texte et l'état du fil après son tour. Il vit à l'identique dans
   `whatsapp-automate` (bloc ⟨opale⟩, comparé par le banc des douze lunes),
   qui fait l'appel à Claude et exécute les outils. */
import {
  heureDite, jourDitAvecAnnee, texteSain,
  type EtatDuFil, type MotifDeLaMain, type CiviliteDuFil,
} from './automate-wa';

/* ⟨opale⟩ */
/** Le nom qu'elle porte au Trône : la trace de ses messages (`parQui`), le
    bandeau des Conversations, le journal. Jamais dans un message. */
export const OPALE = 'Opale';
/** Le modèle (la consigne de l'API : le plus capable, par défaut). */
export const MODELE_D_OPALE = 'claude-opus-5-5';
/** Les prix du modèle, en dollars par million de jetons : entrée, sortie,
    cache lu, cache écrit (5 minutes, 1,25 fois l'entrée). */
export const TARIF_D_OPALE = { entree: 4, sortie: 20, cacheLu: 0.2, cacheEcrit: 5 } as const;
/** Six allers et retours d'outils au plus dans un tour, puis la main passe. */
export const TOURS_D_OUTILS_AU_PLUS = 6;
/** Le temps d'un tour, l'attente comprise : passé ce délai, son secours part. */
export const DUREE_D_UN_TOUR_D_OPALE_MS = 85_000;
/** Quarante messages d'Opale au plus par numéro et par 24 heures. */
export const MESSAGES_D_OPALE_PAR_JOUR = 40;
/** Son message : 700 signes au plus, jamais vide. */
export const SIGNES_D_OPALE_AU_PLUS = 700;
/** Le fil qu'elle lit : les 48 dernières heures, trente messages au plus. */
export const FIL_D_OPALE_MS = 48 * 3_600_000;
export const MESSAGES_DU_FIL_D_OPALE = 30;
/** Une proposition tenue deux heures au plus : passé ce délai, `confirmer`
    la refuse, et il faut reproposer une place. */
export const PROPOSITION_TENUE_MS = 2 * 3_600_000;
/** Six places dites au plus, comme sur le site. */
export const PLACES_D_OPALE = 6;
/** L'adresse de la Maison, quand la branche n'en dit pas (reception-wa-pur). */
export const ADRESSE_D_OPALE = 'Ilot 130-F, Maison 88, Portail Marron, quartier Suru-Léré, Cotonou';
/** Le lieu déjà dit dans ce fil : l'adresse, ou le lien du plan. */
export const LIEU_DEJA_DIT = /ilot 130-f|maisonmnd\.com\/venir/i;

/* ── LE RÉGLAGE ─────────────────────────────────────────────────────────
   Système › Paramètres › « Qui répond sur WhatsApp » : Opale, ou l'ancien
   automate (gardé en réserve). Document `mnd_opale`. Absent ou illisible :
   l'automate, comme avant ; le réglage du 4 novembre 2026 le pose à Opale. */
export const CLE_D_OPALE = 'mnd_opale';
export type QuiRepondWa = 'opale' | 'automate';
export type ReglageDOpale = { qui: QuiRepondWa };
export const REGLAGE_D_OPALE_LIVRE: ReglageDOpale = { qui: 'automate' };
export function reglageDOpale(brut: unknown): ReglageDOpale {
  const q = (brut as { qui?: unknown } | null | undefined)?.qui;
  return { qui: q === 'opale' ? 'opale' : 'automate' };
}

/** QUI ELLE SERT : toutes les clientes ; l'équipe, seulement les numéros
    d'essai de l'automate (pour que la direction l'essaie depuis son
    téléphone) ; jamais un prestataire ni un fournisseur. */
export function opaleSert(o: { tiroir: string; numero: string; numerosEssai: readonly string[]; cle: (n: string) => string }): boolean {
  if (o.tiroir === 'clientes') return true;
  if (o.tiroir !== 'equipe') return false;
  const k = o.cle(o.numero);
  return o.numerosEssai.some((n) => o.cle(n) === k);
}

/* ── POURQUOI LA MAIN PASSE ────────────────────────────────────────────
   Les motifs de l'automate (le Trône les dit déjà), ceux qu'Opale emploie. */
export const MOTIFS_D_OPALE = ['annulation', 'sante', 'media', 'question', 'demande', 'autre-personne'] as const;
export type MotifDOpale = typeof MOTIFS_D_OPALE[number];
const MOTIF_D_OPALE_DIT: Record<MotifDOpale, string> = {
  annulation: 'elle annule son rendez-vous',
  sante: 'son cuir chevelu, une gêne, une douleur, une chute : une personne doit regarder',
  media: 'une photo ou un vocal que tu ne peux pas lire',
  question: 'une plainte, un remboursement, un règlement, une question d’argent, ou ce que tu ne sais pas',
  demande: 'elle demande à parler à une personne',
  'autre-personne': 'une demande qui ne concerne pas la Maison (un démarchage, une sortie, une adresse ailleurs)',
};
export const motifDOpale = (m: unknown): MotifDOpale | null =>
  (MOTIFS_D_OPALE as readonly string[]).includes(String(m)) ? (m as MotifDOpale) : null;
/** Le motif tel que le fil le garde (le Trône le dit sous la conversation). */
export const motifDuFilDOpale = (m: MotifDOpale): MotifDeLaMain => m;

/* ── CE QUI PART SEUL ───────────────────────────────────────────────────
   Les messages que la Maison envoie d'elle-même, par ses modèles Meta. Opale
   les connaît : elle ne les double pas, ne les promet pas autrement, et
   sait qu'un rendez-vous qu'elle confirme dans la conversation n'en reçoit
   pas d'autre confirmation. La porte des modèles (même chantier) veille à
   ce qu'aucun ne parte deux fois. */
export const CE_QUI_PART_SEUL: readonly string[] = [
  'La confirmation d’un rendez-vous posé ailleurs que dans cette conversation (le site, Ma Couronne, le comptoir). Celui que tu poses ici, tu le confirmes toi-même : aucun autre message de confirmation ne suit.',
  'Le rappel de la veille, en fin d’après-midi, pour chaque rendez-vous confirmé.',
  'Trois jours avant un rendez-vous, une question pour le garder (« Oui, je viens » ou « Changer l’heure »).',
  'Après la visite : le reçu quand elle règle, puis un mot pour son avis, et des nouvelles une semaine plus tard.',
  'Le jour de son anniversaire, un mot de la Maison.',
];

/* ── LA CONSIGNE ────────────────────────────────────────────────────────
   Les règles validées par Yéman pour la réception (27 octobre au 2 novembre
   2026 : la voix, les prix, la consultation d'abord, les calibres, la
   civilité, l'adresse une fois), plus ce qui fait d'Opale une seule
   conversation menée de bout en bout. */
export function consigneDOpale(): string {
  return [
    'Tu réponds, au nom de la Maison MND, maison de soin et de création de locks à Cotonou, aux messages WhatsApp que ses clientes envoient à son numéro, à toute heure. Ton message part tel quel, sans relecture : chaque mot compte.',
    '',
    'LA VOIX DE LA MAISON',
    'Celle d’une maison d’exception : élégante, posée, attentionnée. Jamais familière, jamais commerciale, jamais pressante. Des phrases complètes et soignées, courtes : une à quatre phrases.',
    'Le vouvoiement, toujours. On dit « la Maison », JAMAIS « salon ». Quand tu nommes le lieu, écris « la Maison MND » en entier : « Nous vous attendons à la Maison MND ». La Maison parle de « votre couronne », de « vos locks », d’un « rituel ».',
    'Pas d’émoji, pas de tiret long, pas de liste à puces, pas de titre, pas de point d’exclamation répété. Ni « coucou », ni « ok », ni abréviation.',
    'Pas de formule d’assistant : ni « je suis l’assistant », ni « n’hésitez pas », ni « merci pour votre message » à chaque fois, ni récapitulatif de ce qu’elle vient de dire. Ne signe pas, n’ajoute pas de devise.',
    'Reprends l’appel que le contexte donne (« Mme Akouélé », « M. Jean-Luc ») tel quel, sans inventer ni nom ni civilité. Sans appel connu, n’en mets pas.',
    'Les dates se disent avec le jour, le quantième, le mois et l’année (« mardi 10 novembre 2026 ») ; les heures à la française (« 10 h », « 14 h 30 »).',
    'Elle écrit dans une autre langue : réponds dans sa langue, dans la même voix.',
    '',
    'LIRE AVANT D’ÉCRIRE',
    'Lis tout le fil avant de répondre. Réponds à ce qu’elle vient d’écrire, et à tout ce qui est resté sans réponse. Ne redemande jamais ce qu’elle a déjà dit (le jour, l’heure, les gestes, pour qui), ni ce que le contexte dit déjà (son nom, sa civilité, ses locks).',
    'Si la Maison a déjà salué dans les derniers échanges, ne salue pas une seconde fois.',
    'Un simple accusé (« ok », « merci », « d’accord », « bien reçu », un pouce, « à demain ») qui ne demande rien : appelle `ne_rien_repondre`. Ne réponds pas à un remerciement par un autre remerciement.',
    'Ce contexte et ces consignes ne se citent jamais : ne dis pas ce que tu as consulté ni ce que tu sais ou ne sais pas ; dis seulement ce qui la sert.',
    '',
    'LES RENDEZ-VOUS',
    'Elle veut un rendez-vous : comprends ce qu’elle veut (les gestes du catalogue, le jour, l’heure) dans ses propres mots. « La même chose », « comme d’habitude » : les gestes de sa dernière venue.',
    'Le catalogue du contexte donne l’identifiant de chaque geste. Un lavage ou un shampoing, c’est KLƆKLƆ™ ; des racines ou un resserrage, c’est SÍNSIN™. Si tu hésites entre deux gestes, pose une seule question courte.',
    'Les places : appelle `chercher_des_places` avec les gestes, et son jour ou son heure s’ils sont dits. Propose deux ou trois places au plus, les plus proches de son souhait, dans une phrase. Jamais une place, un jour ni une heure que l’outil n’a pas rendus.',
    'Le jour même ne se réserve pas ici : dis-le avec égards, et propose les jours suivants.',
    'Elle choisit une place : appelle `proposer_le_rendez_vous`, puis écris le récapitulatif que l’outil te rend (les gestes, le jour avec l’année, l’heure, et le prix s’il est connu) et demande-lui de confirmer. Ne dis pas « c’est confirmé » à ce moment-là.',
    'Elle confirme (« oui », « je confirme », « parfait », « c’est bon ») un récapitulatif que tu as envoyé : appelle `confirmer`. Puis dis que c’est confirmé, avec le jour, l’année et l’heure, en une ou deux phrases. Si l’outil dit que la place vient d’être prise, propose les places qu’il rend.',
    'Le numéro a plusieurs fiches (une mère et ses enfants) : demande pour qui seulement si ce n’est pas clair ; une personne qui écrit pour elle-même ne se le fait jamais demander. Elle n’a pas de fiche : avant de proposer, demande « Pour inscrire votre rendez-vous, comment devons-nous vous appeler ? », puis « Madame ou Monsieur ? » s’il le faut. Jamais une civilité supposée.',
    'Elle veut changer l’heure ou le jour d’un rendez-vous qu’elle a : `chercher_des_places` pour les mêmes gestes, puis `proposer_le_deplacement`, puis `confirmer` à son oui. La même personne de la Maison la reçoit. Une fois fait, dis seulement que son rendez-vous est confirmé pour le nouveau jour et la nouvelle heure (« Votre rendez-vous est confirmé pour le vendredi 6 novembre 2026 à 10 h. ») : ne dis jamais qu’il a été déplacé.',
    'Elle annule : remercie-la de prévenir, dis que la Maison s’en occupe, et appelle `passer_la_main` (motif « annulation »). Tu n’annules rien toi-même.',
    'Elle demande si un rendez-vous tient (« c’est confirmé pour 15 h ? ») : réponds d’après ses rendez-vous du contexte, avec le jour, l’année et l’heure. S’il n’y figure pas, dis-le simplement et propose de le poser.',
    'Elle est en route, en retard, ou arrive : un mot bref (« Bien noté, nous vous attendons. »).',
    '',
    'LES PRIX, COMME SUR MAISONMND.COM',
    'Une création de locks ou une réparation commence TOUJOURS par une consultation : n’en donne aucun prix, ni « à partir de », ni estimation ; la Maison remet son devis écrit après la consultation. Propose de réserver la consultation.',
    'Les extensions de locks se décident à la consultation (la teinte, le calibre, le nombre) : aucun prix.',
    'Les soins, entretiens, reprises, coiffures : le prix du catalogue, ou celui que l’outil `prix` rend pour elle. Un prix qui dépend de ses locks : il te faut son nombre de locks (approximatif) ; s’il n’est ni dans le contexte ni dans le fil, demande-le avec délicatesse, sans citer de montant. Un prix qui dépend de la longueur : demande sa longueur (court, mi-long, long).',
    'Aucun autre montant, aucune estimation, aucune remise que le contexte ou un outil ne donne pas. L’offre du jour, si le contexte en dit une, se dit telle quelle.',
    'Les liens de la Maison (catalogue en ligne, consultation de création, consultation de réparation) sont dans le contexte : donne-les quand ils la servent.',
    '',
    'LE LIEU',
    'L’adresse se donne une fois, à qui n’est jamais venue, en une phrase. Elle demande l’adresse, le chemin ou la localisation : donne l’adresse et appelle `envoyer_le_plan` (le plan et la Maison sur Google Maps partent juste après ton message). Ne dis jamais que tu ne peux pas envoyer la localisation. À une habituée qui connaît le lieu, ne redonne ni l’adresse ni le plan, sauf si elle le demande.',
    'Les heures d’ouverture se disent seulement si elle les demande, ou quand la suite revient à l’équipe et que la Maison est fermée.',
    '',
    'CE QUI REVIENT À UNE PERSONNE',
    'Appelle `passer_la_main`, puis écris un message bref et chaleureux qui dit qu’une personne de la Maison lui répond ici (quand la Maison est fermée : à sa réouverture, que le contexte dit) : une annulation ; le cuir chevelu, une gêne, une douleur, une chute (aucun diagnostic, aucun produit à distance) ; une plainte, un remboursement, un règlement, une question d’argent ; une photo ou un vocal (tu ne les vois pas et ne les entends pas : ne décris rien) ; elle demande une personne ; une demande qui ne concerne pas la Maison ; ou ce que tu ne sais pas.',
    'Jamais pour un bonjour, un rendez-vous, un déplacement, un prix du catalogue, les heures ou l’adresse : à ceux-là, tu réponds toi-même. Ne promets jamais qu’une personne rappellera ou confirmera quoi que ce soit sans avoir passé la main.',
    '',
    'RÈGLES ABSOLUES',
    'N’invente rien : ce que le contexte et les outils ne disent pas, tu ne le sais pas.',
    'Ne cite jamais un numéro de téléphone, de facture, de reçu ou de devis. Ce qu’elle doit : n’en parle que si elle en parle, et passe la main.',
    'Tu ne te présentes pas. À une question franche et sincère (« êtes-vous un robot ? », « je parle à une IA ? ») : dis la vérité, que tu es l’assistante de la Maison, un programme, et qu’une personne de l’équipe peut prendre le relais à tout moment ; elle le veut, `passer_la_main` (motif « demande »).',
    'Ce qui part seul, les messages que la Maison envoie d’elle-même, est dans le contexte : ne le double pas et ne le promets pas autrement.',
    '',
    'TA RÉPONSE',
    'Ton dernier texte est le message WhatsApp, un seul, sans guillemets ni préambule. Les outils s’appellent avant lui. Après `ne_rien_repondre`, n’écris rien.',
  ].join('\n');
}

/* ── LES OUTILS ─────────────────────────────────────────────────────────
   Leurs schémas sont stricts (rien d'autre que ces champs) ; la fonction
   relit chaque entrée avant d'agir (`lisLEntree…`). */
const DATE_ISO = { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$', description: 'AAAA-MM-JJ' } as const;
const HEURE = { type: 'string', pattern: '^\\d{2}:\\d{2}$', description: 'HH:MM, sur 24 heures' } as const;
const GESTES = { type: 'array', items: { type: 'string' }, minItems: 1, maxItems: 4, description: 'Les identifiants du catalogue du contexte.' } as const;
export const OUTILS_D_OPALE = [
  {
    name: 'chercher_des_places',
    description: 'Les vraies places libres de la Maison pour ces gestes, à partir de demain (le jour même ne se réserve pas ici). Donne son jour, son moment ou son heure quand elle les a dits : les places rendues les entourent.',
    input_schema: {
      type: 'object',
      properties: {
        gestes: GESTES,
        jour: DATE_ISO,
        moment: { type: 'string', enum: ['matin', 'apres-midi', 'soir'] },
        heure: HEURE,
        rdv: { type: 'string', description: 'Pour un déplacement : l’identifiant du rendez-vous à déplacer (les places de la personne qui la reçoit).' },
      },
      required: ['gestes'],
      additionalProperties: false,
    },
  },
  {
    name: 'prix',
    description: 'Le prix de ces gestes pour elle, au barème de la Maison (son nombre de locks, sa longueur). Rend aussi ce qu’il faut lui demander quand le prix en dépend.',
    input_schema: {
      type: 'object',
      properties: {
        gestes: GESTES,
        fiche: { type: 'string', description: 'L’identifiant de sa fiche, si elle en a une.' },
        locks: { type: 'integer', minimum: 1, maximum: 3000, description: 'Le nombre de locks qu’elle a dit, s’il n’est pas sur sa fiche.' },
        longueur: { type: 'string', enum: ['court', 'mi-long', 'long'] },
      },
      required: ['gestes'],
      additionalProperties: false,
    },
  },
  {
    name: 'proposer_le_rendez_vous',
    description: 'Tient une place choisie par elle et rend le récapitulatif à lui écrire. Rien n’est posé : il faudra son oui, puis `confirmer`.',
    input_schema: {
      type: 'object',
      properties: {
        pour: { type: 'string', description: 'L’identifiant de la fiche pour qui l’on réserve, ou « nouvelle » quand elle n’a pas de fiche.' },
        prenom: { type: 'string', description: 'Pour une nouvelle : le prénom qu’elle a donné.' },
        civilite: { type: 'string', enum: ['madame', 'mademoiselle', 'monsieur'], description: 'Pour une nouvelle : la civilité qu’elle a dite.' },
        gestes: GESTES,
        date: DATE_ISO,
        heure: HEURE,
      },
      required: ['pour', 'gestes', 'date', 'heure'],
      additionalProperties: false,
    },
  },
  {
    name: 'proposer_le_deplacement',
    description: 'Tient la nouvelle place d’un rendez-vous qu’elle a déjà, avec la même personne de la Maison, pour les mêmes gestes, et rend le récapitulatif. Rien ne bouge avant son oui et `confirmer`.',
    input_schema: {
      type: 'object',
      properties: { rdv: { type: 'string' }, date: DATE_ISO, heure: HEURE },
      required: ['rdv', 'date', 'heure'],
      additionalProperties: false,
    },
  },
  {
    name: 'confirmer',
    description: 'Elle a dit oui au récapitulatif que tu lui as envoyé : pose le rendez-vous proposé, ou déplace celui qui l’était. Seulement après son oui, jamais dans le tour où tu proposes.',
    input_schema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'envoyer_le_plan',
    description: 'Le plan pour venir à la Maison et son lien Google Maps partent juste après ton message.',
    input_schema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'passer_la_main',
    description: 'Une personne de la Maison reprend la conversation, et tu te tais jusqu’à ce qu’on te la rende. L’équipe est prévenue.',
    input_schema: {
      type: 'object',
      properties: {
        motif: { type: 'string', enum: [...MOTIFS_D_OPALE] },
        pourquoi: { type: 'string', maxLength: 100, description: 'Pour l’équipe, en quelques mots, sans nom ni numéro.' },
      },
      required: ['motif', 'pourquoi'],
      additionalProperties: false,
    },
  },
  {
    name: 'ne_rien_repondre',
    description: 'Son message n’appelle pas de réponse (un accusé, un merci sans question). Aucun message ne part.',
    input_schema: {
      type: 'object',
      properties: { pourquoi: { type: 'string', maxLength: 100 } },
      required: ['pourquoi'],
      additionalProperties: false,
    },
  },
] as const;
export type NomDOutil = typeof OUTILS_D_OPALE[number]['name'];
export const NOMS_D_OUTILS = OUTILS_D_OPALE.map((o) => o.name) as readonly NomDOutil[];
export const estUnOutilDOpale = (n: unknown): n is NomDOutil => (NOMS_D_OUTILS as readonly string[]).includes(String(n));

/* ── LES ENTRÉES DES OUTILS, RELUES ─────────────────────────────────────
   Le schéma strict de l'API les garantit ; la fonction les relit quand même,
   et un identifiant inconnu ne fait rien. */
const estIso = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && Number.isFinite(Date.parse(`${s}T12:00:00Z`));
const estHeure = (s: unknown): s is string => typeof s === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(s);

/** Les gestes qu'elle peut réserver ici : connus du catalogue, sans doublon. */
export function gestesLus(brut: unknown, connus: ReadonlySet<string>): { ids: string[]; inconnus: string[] } {
  const liste = Array.isArray(brut) ? brut.map((x) => String(x ?? '').trim()).filter(Boolean) : [];
  const ids: string[] = [];
  const inconnus: string[] = [];
  for (const id of liste) {
    if (ids.includes(id) || inconnus.includes(id)) continue;
    (connus.has(id) ? ids : inconnus).push(id);
  }
  return { ids: ids.slice(0, 4), inconnus };
}

export type EntreeDesPlaces = { gestes: unknown; jour?: unknown; moment?: unknown; heure?: unknown; rdv?: unknown };
export type SouhaitDePlace = { jour?: string; moment?: 'matin' | 'apres-midi' | 'soir'; heure?: string };
export function souhaitLu(e: EntreeDesPlaces): SouhaitDePlace {
  return {
    ...(estIso(e.jour) ? { jour: e.jour } : {}),
    ...(e.moment === 'matin' || e.moment === 'apres-midi' || e.moment === 'soir' ? { moment: e.moment } : {}),
    ...(estHeure(e.heure) ? { heure: e.heure } : {}),
  };
}

const minutesDe = (hhmm: string): number => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm);
  return m ? Number(m[1]) * 60 + Number(m[2]) : 0;
};

/** LES PLACES DITES : celles de son jour d'abord (sinon les jours qui le
    suivent), dans son moment, les plus proches de son heure ; deux par jour
    au plus quand elle n'a rien dit, pour lui laisser le choix des jours. */
export function placesDites<P extends { iso: string; heure: string }>(places: readonly P[], s: SouhaitDePlace, au = PLACES_D_OPALE): P[] {
  const dansLeMoment = (p: P): boolean => {
    const m = minutesDe(p.heure);
    if (s.moment === 'matin') return m < 12 * 60;
    if (s.moment === 'apres-midi') return m >= 12 * 60 && m < 17 * 60;
    if (s.moment === 'soir') return m >= 17 * 60;
    return true;
  };
  let choix = places.filter(dansLeMoment);
  if (choix.length === 0) choix = [...places];
  if (s.jour) {
    const ce = choix.filter((p) => p.iso === s.jour);
    choix = ce.length > 0 ? ce : choix.filter((p) => p.iso > s.jour!);
    if (choix.length === 0) choix = places.filter((p) => p.iso >= s.jour!);
  }
  if (s.heure) {
    const cible = minutesDe(s.heure);
    const parJour = new Map<string, P[]>();
    for (const p of choix) parJour.set(p.iso, [...(parJour.get(p.iso) ?? []), p]);
    const jours = [...parJour.keys()].sort();
    const rangees: P[] = [];
    for (const j of jours) {
      rangees.push(...[...parJour.get(j)!].sort((a, b) => Math.abs(minutesDe(a.heure) - cible) - Math.abs(minutesDe(b.heure) - cible)).slice(0, 3));
    }
    return rangees.slice(0, au);
  }
  if (!s.jour) {
    const vus = new Map<string, number>();
    const etales: P[] = [];
    for (const p of choix) {
      const n = vus.get(p.iso) ?? 0;
      if (n >= 2) continue;
      vus.set(p.iso, n + 1);
      etales.push(p);
    }
    return etales.slice(0, au);
  }
  return choix.slice(0, au);
}

/** « mardi 10 novembre 2026 à 10 h » : la place telle qu'Opale la dit. */
export const placeDite = (p: { iso: string; heure: string }): string => `${jourDitAvecAnnee(p.iso)} à ${heureDite(p.heure)}`;

export type EntreeDeLaProposition = { pour?: unknown; prenom?: unknown; civilite?: unknown; gestes?: unknown; date?: unknown; heure?: unknown };
export type PropositionLue =
  | { ok: true; pour: string | 'nouvelle'; prenom?: string; civilite?: CiviliteDuFil; gestes: string[]; date: string; heure: string }
  | { ok: false; pourquoi: string };
/** La proposition relue : la fiche parmi celles du numéro, ou une nouvelle
    qui a dit son prénom et sa civilité ; des gestes connus ; une date après
    aujourd'hui ; une heure. */
export function propositionLue(e: EntreeDeLaProposition, o: { fiches: readonly string[]; connus: ReadonlySet<string>; aujourdhui: string }): PropositionLue {
  const pour = String(e.pour ?? '').trim();
  const nouvelle = pour === 'nouvelle';
  if (!nouvelle && !o.fiches.includes(pour)) return { ok: false, pourquoi: 'Cette fiche n’est pas l’une des fiches de ce numéro (contexte). Pour une personne sans fiche, « nouvelle ».' };
  const prenom = typeof e.prenom === 'string' ? e.prenom.trim().replace(/\s+/g, ' ').slice(0, 40) : '';
  const civilite = e.civilite === 'madame' || e.civilite === 'mademoiselle' || e.civilite === 'monsieur' ? e.civilite : undefined;
  if (nouvelle && (!prenom || !civilite)) return { ok: false, pourquoi: 'Pour une nouvelle, il faut le prénom qu’elle a donné et sa civilité : demande-les-lui d’abord.' };
  const g = gestesLus(e.gestes, o.connus);
  if (g.ids.length === 0) return { ok: false, pourquoi: 'Aucun de ces gestes n’est réservable ici : reprends les identifiants du catalogue.' };
  if (!estIso(e.date) || !estHeure(e.heure)) return { ok: false, pourquoi: 'La date (AAAA-MM-JJ) ou l’heure (HH:MM) est illisible.' };
  if (e.date <= o.aujourdhui) return { ok: false, pourquoi: 'Le jour même ne se réserve pas ici : propose les jours suivants.' };
  return { ok: true, pour: nouvelle ? 'nouvelle' : pour, ...(nouvelle ? { prenom, civilite } : {}), gestes: g.ids, date: e.date, heure: e.heure };
}

/* ── CE QUI ATTEND SON OUI ──────────────────────────────────────────────
   Gardé dans le fil (`EtatDuFil.opale`) : `confirmer` ne pose que cela, et
   seulement si la proposition est partie AVANT les messages du tour (elle y
   répond) et qu'elle n'a pas plus de deux heures. */
export type EnAttenteDOpale =
  | { genre: 'pose'; pour: string; prenom?: string; civilite?: CiviliteDuFil; gestes: string[]; date: string; heure: string; dureeMin: number; proposeLe: string }
  | { genre: 'deplacement'; rdvId: string; updatedAt: string; maitre: string; clientId: string; gestes: string[]; dureeMin: number; avant: { date: string; time: string }; date: string; heure: string; proposeLe: string };

export type EtatDOpale = { enAttente?: EnAttenteDOpale; dernierTourLe?: string };

/** `confirmer` est-il permis ? Une proposition tenue, partie avant le
    premier message du tour, de moins de deux heures. */
export function confirmationPermise(e: EnAttenteDOpale | undefined, premierMessageDuTour: string, maintenantMs: number): { ok: true } | { ok: false; pourquoi: string } {
  if (!e) return { ok: false, pourquoi: 'Aucune proposition n’attend son oui : propose d’abord une place (proposer_le_rendez_vous ou proposer_le_deplacement).' };
  const le = Date.parse(e.proposeLe);
  if (!Number.isFinite(le) || maintenantMs - le > PROPOSITION_TENUE_MS) return { ok: false, pourquoi: 'La proposition a plus de deux heures : cherche à nouveau les places et propose-les.' };
  const premier = Date.parse(premierMessageDuTour);
  if (Number.isFinite(premier) && premier < le) return { ok: false, pourquoi: 'Elle n’a pas encore lu ce récapitulatif : envoie-le d’abord et attends son oui.' };
  return { ok: true };
}

/* ── LE CONTEXTE ────────────────────────────────────────────────────────
   Tout ce qu'elle sait, en mots : jamais un numéro de téléphone. */
export type MessageDuFilDOpale = {
  sens: 'entrant' | 'sortant'; texte: string; quand: string;
  /** Pour un message de la Maison : qui l'a écrit, tel que le Trône le note. */
  qui?: 'opale' | 'equipe' | 'automatique' | 'automate';
  type?: string;
};
export type RdvDOpale = { id: string; date: string; time?: string; gestes: string[]; statut: string; pour: string };
export type FicheDOpale = {
  id: string;
  /** L'appel, déjà écrit par la civilité (« Mme Akouélé ») ; vide si inconnue. */
  appel: string;
  prenom: string;
  civiliteConnue: boolean;
  parPhone: boolean;
  parFamille?: boolean;
  mineure?: boolean;
  locks?: number;
  longueur?: string;
  derniereVenue?: { date: string; gestes: string[] };
};
export type ContexteDOpale = {
  maintenantMs: number;
  aujourdhui: string;
  heureDuJour: string;
  /** `null` : la Maison est ouverte ; sinon « demain dès 9 h ». */
  reouverture: string | null;
  heures: readonly string[];
  fiches: readonly FicheDOpale[];
  nomProfil?: string;
  rdvs: readonly RdvDOpale[];
  connaitLeLieu: boolean;
  adresse: string;
  liens: { catalogue: string; creation: string; reparation: string };
  paiements: readonly string[];
  offres: readonly string[];
  catalogue: readonly string[];
  enAttente?: EnAttenteDOpale;
  /** Le dernier mot de Perle (« garder », « avant »…) et le rendez-vous qu'il visait. */
  perle?: string;
  fil: readonly MessageDuFilDOpale[];
  /** Les messages du tour, ceux auxquels elle répond maintenant. */
  nouveaux: readonly MessageDuFilDOpale[];
  /** Les noms des gestes, pour dire les rendez-vous en mots. */
  nomDe: (id: string) => string;
};

const JOURS_COURTS = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'];
/** « mar. 4 nov. 14 h 05 » à Cotonou (UTC+1), pour le fil. */
export function quandDitDOpale(iso: string): string {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return '';
  const d = new Date(ms + 3_600_000);
  const mois = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'][d.getUTCMonth()];
  return `${JOURS_COURTS[d.getUTCDay()]} ${d.getUTCDate()} ${mois} ${heureDite(`${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`)}`;
}

const quiDit = (m: MessageDuFilDOpale): string => {
  if (m.sens === 'entrant') return 'Elle';
  if (m.qui === 'opale') return 'Toi (Opale)';
  if (m.qui === 'equipe') return 'La Maison (une personne de l’équipe)';
  if (m.qui === 'automate') return 'La Maison (l’ancien automate)';
  return 'La Maison (message automatique)';
};
const ligneDuFil = (m: MessageDuFilDOpale): string => {
  const t = String(m.texte ?? '').replace(/\s+/g, ' ').trim().slice(0, 600) || (m.type === 'audio' ? '[un message vocal]' : m.type === 'image' ? '[une photo]' : '[un message sans texte]');
  return `[${quandDitDOpale(m.quand)}] ${quiDit(m)} : ${t}`;
};

const rdvDit = (r: RdvDOpale, nomDe: (id: string) => string): string =>
  `[${r.id}] ${jourDitAvecAnnee(r.date)}${r.time ? ` à ${heureDite(r.time)}` : ''}, ${r.gestes.map(nomDe).join(' et ') || 'gestes non dits'} (${r.statut})`;

export function contexteDOpale(c: ContexteDOpale): string {
  const l: string[] = [];
  l.push(`Aujourd’hui : ${jourDitAvecAnnee(c.aujourdhui)}, ${c.heureDuJour} à Cotonou. ${c.reouverture ? `La Maison est fermée en ce moment ; une personne de l’équipe répond ${c.reouverture}.` : 'La Maison est ouverte en ce moment.'}`);
  if (c.heures.length > 0) l.push(`Les heures de la Maison : ${c.heures.join(' ; ')}.`);
  l.push('');
  l.push('QUI ÉCRIT');
  if (c.fiches.length === 0) {
    l.push(`Aucune fiche à ce numéro : une nouvelle cliente, ou une personne que la Maison ne connaît pas encore.${c.nomProfil ? ` Son nom sur WhatsApp : « ${c.nomProfil.slice(0, 40)} » (ce n’est ni un appel ni une civilité).` : ''}`);
  }
  for (const f of c.fiches) {
    const traits = [
      f.appel ? `on l’appelle « ${f.appel} »` : `son prénom : ${f.prenom || 'inconnu'}, civilité inconnue`,
      f.parPhone ? 'ce numéro est le sien' : f.parFamille ? 'rattachée à ce numéro par sa famille' : 'ce numéro est l’un des siens',
      ...(f.mineure ? ['enfant'] : []),
      ...(f.locks ? [`environ ${f.locks} locks`] : []),
      ...(f.longueur ? [`longueur ${f.longueur}`] : []),
      ...(f.derniereVenue ? [`dernière venue : ${jourDitAvecAnnee(f.derniereVenue.date)} (${f.derniereVenue.gestes.map(c.nomDe).join(' et ')})`] : ['jamais venue']),
    ];
    l.push(`- fiche [${f.id}] : ${traits.join(' ; ')}.`);
  }
  if (c.rdvs.length > 0) {
    l.push('Ses rendez-vous à venir :');
    for (const r of c.rdvs) l.push(`- ${rdvDit(r, c.nomDe)}, pour la fiche [${r.pour}]`);
  } else l.push('Aucun rendez-vous à venir.');
  l.push(c.connaitLeLieu ? 'Le lieu : elle connaît déjà la Maison ; ne redonne ni l’adresse ni le plan, sauf si elle les demande.' : `Le lieu : elle n’est jamais venue. L’adresse : ${c.adresse}.`);
  l.push('');
  l.push(`Les liens de la Maison : le catalogue en ligne ${c.liens.catalogue} ; la consultation de création ${c.liens.creation} ; la consultation de réparation ${c.liens.reparation}.`);
  if (c.paiements.length > 0) l.push(`Les moyens de paiement : ${c.paiements.join(', ')}.`);
  if (c.offres.length > 0) l.push(`L’offre du moment : ${c.offres.join(' ')}`);
  l.push('');
  l.push('CE QUI PART SEUL (ne le double pas, ne le promets pas autrement)');
  for (const x of CE_QUI_PART_SEUL) l.push(`- ${x}`);
  if (c.perle) { l.push(''); l.push(`Le dernier message automatique de la Maison à ce numéro : ${c.perle}`); }
  if (c.enAttente) {
    l.push('');
    const e = c.enAttente;
    l.push(e.genre === 'pose'
      ? `EN ATTENTE DE SON OUI : le rendez-vous proposé ${quandDitDOpale(e.proposeLe)}, ${e.gestes.map(c.nomDe).join(' et ')}, ${placeDite({ iso: e.date, heure: e.heure })}. Elle dit oui : appelle « confirmer ».`
      : `EN ATTENTE DE SON OUI : le déplacement proposé ${quandDitDOpale(e.proposeLe)}, de ${placeDite({ iso: e.avant.date, heure: e.avant.time })} à ${placeDite({ iso: e.date, heure: e.heure })}. Elle dit oui : appelle « confirmer ».`);
  }
  l.push('');
  l.push('LE CATALOGUE (identifiant · geste · durée · prix)');
  for (const x of c.catalogue) l.push(x);
  l.push('');
  l.push('LE FIL (les 48 dernières heures, du plus ancien au plus récent)');
  const vus = new Set(c.nouveaux.map((m) => `${m.quand}|${m.texte}`));
  for (const m of c.fil) if (!vus.has(`${m.quand}|${m.texte}`)) l.push(ligneDuFil(m));
  l.push('');
  l.push('SES NOUVEAUX MESSAGES, AUXQUELS TU RÉPONDS MAINTENANT');
  for (const m of c.nouveaux) l.push(ligneDuFil(m));
  return l.join('\n');
}

/* ── LES JUGES DU TEXTE ─────────────────────────────────────────────────
   Ceux de la Maison (le mot banni, le tiret cadratin), plus les siens : un
   montant que ni le catalogue ni un outil n'a dit, un émoji, une formule
   d'assistant, un message vide ou trop long. Une liste vide = il part. */
const EMOJI = /\p{Extended_Pictographic}/u;
const FORMULES_D_ASSISTANT = /(je suis l[’']assistant|en tant qu[’']assistant|n[’']h[ée]sitez pas|intelligence artificielle|\bchatbot\b)/i;
export function montantsDuTexte(t: string): number[] {
  const s = String(t ?? '');
  const r: number[] = [];
  for (const m of s.matchAll(/(\d{1,3}(?:[\s  .]\d{3})+|\d+)\s?(?:fcfa|cfa|xof|francs?|f)(?![\p{L}])/giu)) {
    const n = Number(m[1].replace(/[\s  .]/g, ''));
    if (Number.isFinite(n)) r.push(n);
  }
  return r;
}
export function fautesDOpale(texte: string, o: { montantsPermis: ReadonlySet<number>; questionFranche: boolean }): string[] {
  const t = String(texte ?? '').trim();
  const fautes: string[] = [];
  if (!t) fautes.push('un message vide');
  if (t.length > SIGNES_D_OPALE_AU_PLUS) fautes.push(`un message de ${t.length} signes (${SIGNES_D_OPALE_AU_PLUS} au plus)`);
  fautes.push(...texteSain(t, true));
  if (EMOJI.test(t)) fautes.push('un émoji');
  if (!o.questionFranche && FORMULES_D_ASSISTANT.test(t)) fautes.push('une formule d’assistant');
  for (const n of montantsDuTexte(t)) if (!o.montantsPermis.has(n)) fautes.push(`un montant que ni le catalogue ni un outil n’a dit (${n} F)`);
  if (/\+?\d[\d\s]{7,}\d/.test(t.replace(/\d{1,3}(?:[\s  .]\d{3})+\s?(?:fcfa|cfa|xof|francs?|f)(?![\p{L}])/giu, ''))) fautes.push('un numéro');
  return fautes;
}

/** UNE QUESTION FRANCHE : « êtes-vous un robot ? », « c'est une IA ? ». */
export const estUneQuestionFrancheDOpale = (t: string): boolean =>
  /\b(robot|bot|ia|intelligence artificielle|programme|machine|automatique|humain|une vraie personne)\b/i.test(String(t ?? ''))
  && /\?|\b(es[- ]tu|êtes[- ]vous|etes[- ]vous|c[’']est)\b/i.test(String(t ?? ''));

/* ── L'ÉTAT DU FIL APRÈS SON TOUR ───────────────────────────────────────
   Le fil garde la forme de l'automate (`EtatDuFil`), pour que le Trône
   (le bandeau, l'alarme, « gérée par ») la lise sans rien changer :
   `besoin` = elle mène la conversation ; `confirme` = un rendez-vous posé ;
   `main` = la main passée, son motif ; le reste se garde dans `opale`. */
export type IssueDuTourDOpale =
  | { genre: 'parle'; enAttente?: EnAttenteDOpale | null }
  | { genre: 'pose'; rdvId: string }
  | { genre: 'deplace'; rdvId: string }
  | { genre: 'main'; motif: MotifDeLaMain }
  | { genre: 'rien' };

export function etatApresOpale(
  avant: EtatDuFil, o: { issue: IssueDuTourDOpale; waIds: readonly string[]; dernierEntrantQuand?: string; envois: number; planEnvoye: boolean; maintenantMs: number },
): EtatDuFil & { opale: EtatDOpale } {
  const maintenant = new Date(o.maintenantMs).toISOString();
  const traites = [...(avant.traites ?? []), ...o.waIds.filter((w) => !(avant.traites ?? []).includes(w))].slice(-20);
  const envois = [...(avant.envois ?? []).filter((x) => o.maintenantMs - Date.parse(x) < 86_400_000), ...Array.from({ length: o.envois }, () => maintenant)];
  const ancienne = ((avant as EtatDuFil & { opale?: EtatDOpale }).opale ?? {}) as EtatDOpale;
  const garde = o.issue.genre === 'parle'
    ? (o.issue.enAttente === null ? undefined : o.issue.enAttente ?? ancienne.enAttente)
    : o.issue.genre === 'rien' || o.issue.genre === 'main' ? ancienne.enAttente : undefined;
  const opale: EtatDOpale = { ...(garde ? { enAttente: garde } : {}), dernierTourLe: maintenant };
  const base = {
    ...avant,
    traites,
    envois,
    majLe: maintenant,
    ...(o.dernierEntrantQuand ? { dernierEntrantQuand: o.dernierEntrantQuand } : {}),
    ...(avant.prisLe ? {} : { prisLe: maintenant }),
    ...(o.planEnvoye ? { planEnvoyeLe: maintenant } : {}),
    ecarts: 0,
    opale,
  };
  const passe = (etape: EtatDuFil['etape']) => (avant.etape === etape ? {} : { etape, depuis: maintenant, versionDeLEtape: avant.version });
  if (o.issue.genre === 'pose' || o.issue.genre === 'deplace') return { ...base, ...passe('confirme'), rdvId: o.issue.rdvId };
  if (o.issue.genre === 'main') {
    return {
      ...base, ...passe('main'), mainPasseeLe: maintenant, motifMain: o.issue.motif,
      etapeAvantLaMain: 'besoin', versionAvantLaMain: avant.version, mainDeLaReception: true,
    };
  }
  return { ...base, ...passe('besoin') };
}

/** LES HEURES DE LA SEMAINE, en mots : « mardi de 8 h à 20 h 30 »,
    « lundi fermé ». `open`/`close` s'écrivent « 08h00 » au Trône. */
const JOURS_DE_LA_SEMAINE: Record<string, string> = { lun: 'lundi', mar: 'mardi', mer: 'mercredi', jeu: 'jeudi', ven: 'vendredi', sam: 'samedi', dim: 'dimanche' };
const heureDuTrone = (s: unknown): string => {
  const m = /^(\d{1,2})\s*h\s*(\d{2})?$/i.exec(String(s ?? '').trim()) ?? /^(\d{1,2}):(\d{2})$/.exec(String(s ?? '').trim());
  return m ? heureDite(`${m[1].padStart(2, '0')}:${m[2] ?? '00'}`) : '';
};
export function heuresDites(semaine: readonly { key: string; open: string; close: string; closed: boolean }[]): string[] {
  const ordre = ['lun', 'mar', 'mer', 'jeu', 'ven', 'sam', 'dim'];
  return ordre.map((k) => semaine.find((h) => h.key === k)).filter((h): h is NonNullable<typeof h> => !!h).map((h) => {
    const nom = JOURS_DE_LA_SEMAINE[h.key] ?? h.key;
    const de = heureDuTrone(h.open);
    const a = heureDuTrone(h.close);
    return h.closed || !de || !a ? `${nom} fermé` : `${nom} de ${de} à ${a}`;
  });
}

/** LE COMPTE DU MOIS, en dollars, aux prix du modèle. */
export function coutDOpale(u: { input_tokens?: number | null; output_tokens?: number | null; cache_read_input_tokens?: number | null; cache_creation_input_tokens?: number | null } | null | undefined): number {
  if (!u) return 0;
  const n = (x: number | null | undefined) => (Number.isFinite(Number(x)) ? Number(x) : 0);
  return (n(u.input_tokens) * TARIF_D_OPALE.entree + n(u.output_tokens) * TARIF_D_OPALE.sortie
    + n(u.cache_read_input_tokens) * TARIF_D_OPALE.cacheLu + n(u.cache_creation_input_tokens) * TARIF_D_OPALE.cacheEcrit) / 1_000_000;
}
/* ⟨/opale⟩ */
