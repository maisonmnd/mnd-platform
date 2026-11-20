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
   revient à une personne (annuler, la santé, une plainte, l'argent, un
   vocal, et la photo d'une cliente qui a un rendez-vous pris ou une séance
   faite), passe à l'équipe.

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

/* ── NE PERDRE AUCUN RENDEZ-VOUS, 18 novembre 2026 ──────────────────────
   « Aujourd'hui j'ai perdu un RDV… Il faut pouvoir conclure tout seul »
   (Yéman). Le fil du 17 novembre : une nouvelle cliente, de passage, demande
   un shampoing et un resserrage, « de la place aujourd'hui ? », puis les
   tarifs. Opale ne donne aucun prix sans le nombre de locks, ne voit pas la
   photo proposée, passe la main pour elle (« une personne vous répond dans
   un instant »), et personne ne la prend : « ALORS? » à 18 h 45, « Pas
   d'info sur les prix? » à 20 h 58, sans réponse. Au sélecteur : le jour
   même avec une heure d'avance, une relance une fois après trois heures. */
/** La main passée que personne ne prend : passé dix minutes sans un mot de
    l'équipe, Opale reprend la conversation au message suivant. */
export const MAIN_NON_PRISE_MS = 10 * 60_000;
/** Le jour même se propose à partir d'une heure plus tard (sélecteur du 18
    novembre 2026), et se confirme tant qu'il reste une demi-heure. */
export const JOUR_MEME_DELAI_MIN = 60;
export const JOUR_MEME_CONFIRME_MIN = 30;
/** Les photos qu'elle voit : les trois plus récentes du fil, une à une sous
    ce poids (WhatsApp les compresse bien en dessous). */
export const PHOTOS_D_OPALE_AU_PLUS = 3;
export const OCTETS_D_UNE_PHOTO_AU_PLUS = 3_500_000;
/** LA RELANCE : trois heures après sa question restée sans réponse, une
    seule fois, de 8 h à 21 h à Cotonou, et au moins une demi-heure avant
    que la fenêtre de 24 heures de WhatsApp ne se ferme. */
export const RELANCE_APRES_MS = 3 * 3_600_000;
export const RELANCE_DES_MIN = 8 * 60;
export const RELANCE_JUSQU_A_MIN = 21 * 60;
export const FENETRE_WA_MS = 24 * 3_600_000;
export const MARGE_DE_LA_FENETRE_MS = 30 * 60_000;
/** L'adresse de la Maison, quand la branche n'en dit pas (reception-wa-pur). */
export const ADRESSE_D_OPALE = 'Ilot 130-F, Maison 88, Portail Marron, quartier Suru-Léré, Cotonou';
/** Le lieu déjà dit dans ce fil : l'adresse, ou le lien du plan. */
export const LIEU_DEJA_DIT = /ilot 130-f|maisonmnd\.com\/venir/i;
/** Un lien Google Maps, court ou long. */
export const LIEN_DE_CARTE = /maps\.app\.goo\.gl|goo\.gl\/maps|google\.[a-z.]+\/maps|maps\.google\.[a-z.]+/i;
/** CE MOT DONNE LE CHEMIN (19 novembre 2026) : l'adresse d'Opale, le lien
    pour venir, un lien Google Maps, ou l'adresse que la branche porte. Le plan
    part alors avec lui, toujours (Yéman : « this map needs to be attached to
    the message… at all time »), qu'il vienne d'Opale ou de l'équipe. */
export function donneLeChemin(texte: string, adresse = ''): boolean {
  const t = String(texte ?? '');
  if (LIEU_DEJA_DIT.test(t) || LIEN_DE_CARTE.test(t)) return true;
  const plat = (s: string): string => s.toLowerCase().replace(/\s+/g, ' ').trim();
  const a = plat(String(adresse ?? ''));
  return a.length >= 8 && plat(t).includes(a);
}

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
  media: 'un vocal que la Maison n’a pas compris, ou une vidéo que tu ne peux pas voir',
  question: 'une plainte, un remboursement, un règlement, une question d’argent, ou ce que tu ne sais pas',
  demande: 'elle demande à parler à une personne',
  'autre-personne': 'une demande qui ne concerne pas la Maison (une sortie, une adresse ailleurs ; un démarchage se range, il ne passe pas)',
};
/** Le motif d'une main, en mots, pour le contexte d'une reprise. */
export const motifDitDOpale = (m: string): string => (MOTIF_D_OPALE_DIT as Record<string, string>)[m] ?? 'une question pour l’équipe';
export const motifDOpale = (m: unknown): MotifDOpale | null =>
  (MOTIFS_D_OPALE as readonly string[]).includes(String(m)) ? (m as MotifDOpale) : null;
/** Le motif tel que le fil le garde (le Trône le dit sous la conversation). */
export const motifDuFilDOpale = (m: MotifDOpale): MotifDeLaMain => m;

/* ── L'AVIS SUR PHOTO, AVEC UN RENDEZ-VOUS (17 novembre 2026) ───────────
   « Il ne faut pas permettre d'avoir des bilans sans prendre de RDV sinon
   tout le monde nous trichera » : Yéman revient sur son choix du 30 octobre
   2026 (une photo, une personne de la Maison regarde). Une personne ne
   regarde plus que la photo d'une cliente qui a un rendez-vous pris ou une
   séance faite (la règle ⟨rendez-vous-pris⟩, que la fonction applique aux
   fiches du numéro). Aux autres, la main ne passe pas : une ligne, et le
   lien de la consultation, que le code pose lui-même quand le message ne le
   porte pas. Un vocal et une pièce reviennent toujours à une personne : ils
   s'écoutent et se lisent, ils ne se regardent pas.
   18 NOVEMBRE 2026, AVEC « OPALE NE PERD AUCUN RENDEZ-VOUS » : Opale voit
   les photos pour le prix et la place (le nombre de locks, la longueur) ;
   l'avis à distance (l'état de ses locks, un soin) reste fermé sans
   rendez-vous, et le lien ne s'ajoute plus quand elle a proposé sa place. */
/** Le lien de la consultation, sur le site du catalogue en ligne. */
export const lienDeLaConsultation = (catalogue: string): string => {
  try { return new URL('/consultation/', catalogue).href; } catch { return ''; }
};
/** Ses nouveaux messages portent une photo ou une vidéo, sans vocal ni pièce. */
export const photoSeuleDansLeTour = (nouveaux: readonly { type?: string }[]): boolean =>
  nouveaux.some((m) => m.type === 'image' || m.type === 'video') && !nouveaux.some((m) => m.type === 'audio' || m.type === 'document');
/** LA PHOTO SANS RENDEZ-VOUS. `suivie` : elle a un rendez-vous pris ou une séance faite. */
export const photoSansRendezVous = (o: { suivie: boolean; nouveaux: readonly { type?: string }[] }): boolean =>
  !o.suivie && photoSeuleDansLeTour(o.nouveaux);
/** UN VOCAL QUE LA MAISON N'A PAS COMPRIS (18 novembre 2026) : dans ses
    nouveaux messages, un vocal sans transcription comprise (le fon, le
    bruit, un vocal vide, un moteur muet). Choix de Yéman : Opale passe la
    main SANS RIEN DIRE, une personne l'écoute et répond. */
export const vocalIncomprisDansLeTour = (nouveaux: readonly { type?: string; transcription?: string }[]): boolean =>
  nouveaux.some((m) => m.type === 'audio' && !String(m.transcription ?? '').trim());
/** Ses nouveaux messages ne disent rien : une photo seule, sans un mot. */
export const tourSansUnMot = (nouveaux: readonly { texte?: string }[]): boolean =>
  nouveaux.every((m) => !String(m.texte ?? '').trim());
/** Ce que l'outil répond à Opale quand la main ne passe pas pour une photo. */
export const refusDeLAvisSurPhoto = (lien: string): string =>
  `La main ne passe pas pour cette photo : elle n’a ni rendez-vous pris ni séance faite à la Maison. Réponds toi-même : sa photo te sert au prix (estime ses locks, appelle \`prix\`) et à proposer sa place ; aucun avis à distance, la Maison regarde ses locks avec elle, au rendez-vous. Pour une création ou une réparation, le lien de la consultation : ${lien}`;
/** La ligne du lien, que le code pose quand son message ne le porte pas. */
export const ligneDeLaConsultation = (lien: string): string => `Votre consultation se prend ici : ${lien}`;
export function avecLeLienDeLaConsultation(texte: string, lien: string): string {
  const t = String(texte ?? '').trim();
  if (!lien || !t || t.includes(lien)) return t;
  return `${t}\n${ligneDeLaConsultation(lien)}`;
}
/** Le message entier, quand Claude ne répond pas à une photo seule. */
export const motDeLaPhotoSansRendezVous = (lien: string): string =>
  `Bonjour. La Maison regarde vos locks avec vous, au rendez-vous.\n${ligneDeLaConsultation(lien)}`;

/** CE QUI RESTE À L'ÉQUIPE quand Opale reprend une main que personne n'a
    prise (18 novembre 2026) : elle répond à ce qu'elle sait (le prix, les
    places, la photo), mais une annulation, la santé, l'argent ou une
    personne demandée restent à faire, et la conversation reste marquée pour
    l'équipe (la pastille, l'alarme). Les autres motifs (une photo, un prix,
    le jour même, une erreur) se règlent par sa réponse. */
export const MOTIFS_QUI_RESTENT_A_L_EQUIPE: readonly string[] = ['annulation', 'sante', 'question', 'demande', 'autre-personne'];

/** LA MAIN QUE PERSONNE NE PREND : passée depuis dix minutes au moins, et
    aucune personne de l'équipe n'a écrit depuis dans le fil. Une personne qui
    a PRIS la main au Trône (la pause) se juge ailleurs et tient toujours. */
export function laMainNEstPasPrise(o: { mainPasseeLe?: string; fil: readonly { sens: string; qui?: string; quand: string }[]; maintenantMs: number }): boolean {
  const le = Date.parse(String(o.mainPasseeLe ?? ''));
  if (!Number.isFinite(le) || o.maintenantMs - le < MAIN_NON_PRISE_MS) return false;
  return !o.fil.some((m) => m.sens === 'sortant' && m.qui === 'equipe' && Date.parse(m.quand) >= le);
}

/** Minutes depuis minuit à Cotonou (UTC+1, sans heure d'été). */
export const minutesACotonou = (ms: number): number => Math.floor(((((ms + 3_600_000) % 86_400_000) + 86_400_000) % 86_400_000) / 60_000);

/** LA RELANCE EST-ELLE DUE ? Opale mène le fil ; son dernier mot est une
    question restée sans réponse depuis trois heures ; aucune relance depuis
    le dernier message de la cliente ; la fenêtre de WhatsApp est encore
    ouverte pour une demi-heure ; il fait jour à Cotonou. */
export function relanceDue(o: { etape: string; relanceLe?: string; fil: readonly { sens: string; qui?: string; quand: string; texte: string }[]; maintenantMs: number }): { due: true } | { due: false; pourquoi: string } {
  const non = (pourquoi: string) => ({ due: false as const, pourquoi });
  if (o.etape !== 'besoin') return non('Opale ne mène pas ce fil');
  const dernier = o.fil[o.fil.length - 1];
  if (!dernier || dernier.sens !== 'sortant' || dernier.qui !== 'opale') return non('le dernier mot n’est pas le sien');
  if (!dernier.texte.includes('?')) return non('son dernier mot ne lui demande rien');
  if (!(o.maintenantMs - Date.parse(dernier.quand) >= RELANCE_APRES_MS)) return non('trop tôt');
  const siens = o.fil.filter((m) => m.sens === 'entrant');
  const elle = Date.parse(siens[siens.length - 1]?.quand ?? '');
  if (!Number.isFinite(elle)) return non('elle n’a rien écrit dans le fil');
  if (o.maintenantMs - elle > FENETRE_WA_MS - MARGE_DE_LA_FENETRE_MS) return non('la fenêtre de WhatsApp se ferme');
  const deja = Date.parse(String(o.relanceLe ?? ''));
  if (Number.isFinite(deja) && deja >= elle) return non('déjà relancée');
  const min = minutesACotonou(o.maintenantMs);
  if (min < RELANCE_DES_MIN || min >= RELANCE_JUSQU_A_MIN) return non('la nuit');
  return { due: true };
}

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
    'Une fiche marquée « enfant » ne t’écrit jamais : sur son numéro, c’est son parent qui écrit (« Qui t’écrit » dans le contexte). Ne salue jamais l’enfant et ne l’appelle jamais par son prénom : adresse-toi au parent, par l’appel que le contexte lui donne, sinon sans nom ni civilité. Les rendez-vous de l’enfant restent les siens (« le rendez-vous d’Ama ») et se réservent à sa fiche.',
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
    'Les places : appelle `chercher_des_places` avec les gestes, et son jour ou son heure s’ils sont dits ; avec `pour` et `locks` dès que tu les connais, car deux personnes ne se reçoivent à la même heure que si l’une a moins de 150 locks ou vient pour un petit service (une heure au plus), et les places rendues en dépendent. Puis appelle `proposer_les_places` avec TROIS de ces places, les plus proches de son souhait : elles partent en boutons sous ton message, et son toucher vaut son oui. Ton message ne recopie pas les dates : une ou deux phrases qui l’invitent à toucher la place qui lui convient, et à écrire une autre date au besoin. Jamais une place, un jour ni une heure que l’outil n’a pas rendus.',
    'Le jour même se réserve ici, pour une place qui commence au moins une heure plus tard : `chercher_des_places` avec son jour (aujourd’hui) les rend quand il en reste. S’il n’en reste pas, dis-le avec égards et propose les premières places des jours suivants.',
    'Elle écrit un jour et une heure (une place que tu lui as proposée, ou la sienne) : appelle `accommoder`. Elle ne repart jamais sans rendez-vous : l’outil pose sa place, ou propose les plus proches dans l’heure en boutons, ou la pose au-delà des fauteuils, et te dit quoi lui écrire. Ne dis « c’est confirmé » que si l’outil l’a posée. Pour une nouvelle sans fiche, l’outil te dit s’il faut d’abord son prénom et « Madame ou Monsieur ? ».',
    'Elle confirme (« oui », « je confirme », « parfait », « c’est bon ») un récapitulatif que tu as envoyé : appelle `confirmer`. Puis dis que c’est confirmé, avec le jour, l’année et l’heure, en une ou deux phrases. Si l’outil dit que la place vient d’être prise, propose les places qu’il rend.',
    'Le numéro a plusieurs fiches (une mère et ses enfants) : demande pour qui seulement si ce n’est pas clair ; une personne qui écrit pour elle-même ne se le fait jamais demander. Elle n’a pas de fiche : propose quand même la place qu’elle choisit (`proposer_le_rendez_vous`, pour « nouvelle »), et demande dans le même message, en une seule phrase, le prénom à inscrire et « Madame ou Monsieur ? ». Sa réponse qui les donne vaut son oui à cette place : appelle `confirmer` avec son prénom et sa civilité. Jamais une civilité supposée.',
    '',
    'CONCLURE',
    'Chaque message la mène vers un rendez-vous posé. Après un prix, une réponse, une hésitation, termine par une proposition précise : trois places en boutons (`proposer_les_places`), qu’elle touche pour réserver.',
    'Ta boussole : la Maison veut des rendez-vous, et chaque rendez-vous la fait vivre. Ne dis jamais « ce n’est plus possible », « il n’y a plus de place » ni « non » avant que l’outil (`accommoder`, `noter_un_retard`, `chercher_des_places`) ait jugé son heure : lui seul sait quand deux clientes se reçoivent ensemble. Quand son heure ne tient pas, dis ce qui est possible, jamais seulement ce qui ne l’est pas.',
    'Elle hésite ou son agenda n’est pas sûr (« je suis de passage », « je ne sais pas encore », « je vous redis ») : propose de lui garder dès maintenant la place la plus proche de son souhait, en lui disant qu’un simple message suffira pour la déplacer. Ne la laisse jamais repartir avec un lien seulement : le lien du catalogue peut s’ajouter, il ne remplace jamais la place proposée.',
    'Elle ne pourra pas venir à un rendez-vous qu’elle a (une contrainte, un empêchement, elle veut le reprogrammer, en changer le jour ou l’heure ; jamais un simple retard, voir plus bas) : appelle `mettre_a_reprogrammer` avec ce rendez-vous. Sa place est libérée tout de suite, il n’est pas annulé, et trois places partent en boutons sous ton message. Remercie-la de prévenir en une phrase, et invite-la à toucher la place qui lui convient ou à écrire une autre date. Ne recopie pas les dates. Quand elle écrit une date, `accommoder` avec ce rendez-vous (champ « rdv »). Une fois sa nouvelle date posée, dis seulement que son rendez-vous est confirmé pour le nouveau jour et la nouvelle heure : ne dis jamais qu’il a été déplacé.',
    'Elle annule : remercie-la de prévenir, dis que la Maison s’en occupe, et appelle `passer_la_main` (motif « annulation »). Tu n’annules rien toi-même.',
    'Elle demande si un rendez-vous tient (« c’est confirmé pour 15 h ? ») : réponds d’après ses rendez-vous du contexte, avec le jour, l’année et l’heure. S’il n’y figure pas, dis-le simplement et propose de le poser.',
    'Elle sera en retard aujourd’hui à son rendez-vous (« j’aurai 1 h de retard », « je serai là vers 16 h », même si elle dit « un empêchement ») : ce n’est pas un report, sa place ne se libère jamais. Appelle `noter_un_retard` avec ce rendez-vous et son heure d’arrivée (l’heure du rendez-vous plus son retard) : l’outil garde sa place ou la décale, et te dit quoi lui écrire. Ne dis jamais qu’elle a perdu sa place ni que son heure est impossible.',
    'Elle est en route ou arrive, sans retard dit : un mot bref (« Bien noté, nous vous attendons. »).',
    '',
    'LES PRIX, COMME SUR MAISONMND.COM',
    'Une création de locks ou une réparation commence TOUJOURS par une consultation : n’en donne aucun prix, ni « à partir de », ni estimation ; la Maison remet son devis écrit après la consultation. Propose de réserver la consultation.',
    'Les extensions de locks se décident à la consultation (la teinte, le calibre, le nombre) : aucun prix.',
    'Les soins, entretiens, reprises, coiffures : le prix du catalogue, ou celui que l’outil `prix` rend pour elle. Elle demande un prix : donne-le TOUT DE SUITE, dans ce message ; ne la fais jamais attendre un prix.',
    'Un prix qui dépend du nombre de ses locks ou de leur longueur, qu’elle ne t’a pas dits : appelle `prix` sans eux, il rend la grille (par exemple « jusqu’à 250 locks : 20 000 F ; de 251 à 350 locks : 30 000 F »). Donne-la-lui simplement, la tranche la plus courante d’abord, puis demande avec délicatesse combien de locks elle a à peu près et leur longueur (court : jusqu’aux épaules ; mi-long : des épaules aux omoplates ; long : au-delà), ou une photo.',
    'LES PHOTOS : tu vois les photos qu’elle envoie, jointes après le contexte. D’une photo de ses locks, estime toi-même, avec prudence, leur nombre approximatif et leur longueur, appelle `prix` avec ces estimations, et dis le prix comme une estimation que la Maison confirme à son arrivée (« d’après votre photo… »). Une estimation près d’une limite de la grille : donne les deux prix voisins. Ne commente rien d’autre que ses locks. Une photo qui montre une gêne, une plaie, une chute : rien de médical, passe la main (motif « sante »).',
    'LES VOCAUX : la Maison les écoute pour toi. Dans le fil, un vocal porte sa transcription automatique entre guillemets : réponds-y comme à un message écrit, tout de suite, sans dire que tu l’as lu ni écouté. Les noms propres, les jours et les chiffres peuvent y être écorchés : en cas de doute sur un jour, une heure ou un montant, redemande-le simplement.',
    'Une vidéo : tu ne la vois pas. Demande-lui avec égards de l’écrire en quelques mots (pour ses locks, une photo suffit), sans rien deviner de ce qu’elle montre.',
    'Aucun autre montant ni estimation que le contexte ou un outil ne donne pas. Ne parle d’aucune remise, d’aucun code ni d’aucune offre : la Maison MND les applique elle-même, quand ils valent pour elle.',
    'Les liens de la Maison (catalogue en ligne, consultation de création, consultation de réparation) sont dans le contexte : donne-les quand ils la servent.',
    '',
    'LE LIEU',
    'L’adresse se donne une fois, à qui n’est jamais venue, en une phrase. Elle demande l’adresse, le chemin ou la localisation : donne l’adresse et appelle `envoyer_le_plan` (le plan et la Maison sur Google Maps partent juste après ton message). Ne dis jamais que tu ne peux pas envoyer la localisation. À une habituée qui connaît le lieu, ne redonne ni l’adresse ni le plan, sauf si elle le demande.',
    'Les heures d’ouverture se disent seulement si elle les demande, ou quand la suite revient à l’équipe et que la Maison est fermée.',
    '',
    'CE QUI REVIENT À UNE PERSONNE',
    'Appelle `passer_la_main`, puis écris un message bref et chaleureux qui dit qu’une personne de la Maison lui répond ici dès que possible (quand la Maison est fermée : à sa réouverture, que le contexte dit), jamais « dans un instant » : une annulation ; le cuir chevelu, une gêne, une douleur, une chute (aucun diagnostic, aucun produit à distance) ; une plainte, un remboursement, un règlement, une question d’argent ; elle demande une personne ; une demande qui ne concerne pas la Maison ; ou ce que tu ne sais vraiment pas. Dans le même message, réponds à tout ce que tu sais déjà (un prix, des places).',
    'Jamais pour un bonjour, un rendez-vous, un déplacement, un prix, une photo de ses locks, un vocal, le jour même, les heures ou l’adresse : à ceux-là, tu réponds toi-même. Ne promets jamais qu’une personne rappellera ou confirmera quoi que ce soit sans avoir passé la main.',
    '',
    'CELUI QUI VEND À LA MAISON',
    'Quelqu’un ne vient pas pour ses cheveux mais VEND ou PROPOSE quelque chose à la Maison : publicité, marketing, réseaux sociaux, abonnés, affiches, vidéos, sites web, applications, référencement, prêts, placements, un produit, du matériel, une formation, un partenariat, ou une coiffeuse qui cherche du travail. Même poli, même après un bonjour, même s’il relance ou envoie une photo : n’écris RIEN, ne le remercie pas, ne passe pas la main ; appelle seulement `ranger_un_demarchage`. Une cliente qui parle de son propre métier en prenant rendez-vous n’est pas concernée.',
    '',
    'L’AVIS SUR PHOTO',
    'Sa photo te sert au prix et à la place, jamais à un avis : ne dis rien de l’état de ses locks, ne conseille aucun soin à distance. Ne demande une photo que pour estimer leur nombre et leur longueur. La Maison ne regarde une photo, pour un avis, que pour une cliente qui a un rendez-vous pris ou une séance faite : le contexte le dit (« L’avis sur photo »).',
    'Quand le contexte dit qu’elle n’a ni l’un ni l’autre, et qu’elle demande un avis à distance (ses cheveux, ses locks, sa longueur, « qu’en pensez-vous ? ») : ne passe pas la main. Une seule ligne, sans expliquer pourquoi : la Maison regarde ses locks avec elle, au rendez-vous ; puis propose sa place, et, pour une création ou une réparation, le lien de la consultation du contexte. Le reste de son message se traite comme d’habitude.',
    'Une photo dont ses mots disent qu’elle est autre chose (un reçu, un règlement) suit sa propre règle.',
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
    description: 'Les vraies places libres de la Maison pour ces gestes, à partir d’aujourd’hui (le jour même, une heure plus tard au plus tôt). Donne son jour, son moment ou son heure quand elle les a dits : les places rendues les entourent.',
    input_schema: {
      type: 'object',
      properties: {
        gestes: GESTES,
        jour: DATE_ISO,
        moment: { type: 'string', enum: ['matin', 'apres-midi', 'soir'] },
        heure: HEURE,
        rdv: { type: 'string', description: 'Pour un déplacement : l’identifiant du rendez-vous à déplacer (les places de la personne qui la reçoit).' },
        pour: { type: 'string', description: 'L’identifiant de la fiche pour qui l’on cherche, ou « nouvelle » quand elle n’a pas de fiche.' },
        locks: { type: 'integer', minimum: 1, maximum: 3000, description: 'Le nombre de locks qu’elle a dit, ou que tu as estimé sur sa photo : les places en dépendent.' },
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
    name: 'proposer_les_places',
    description: 'Pose sous ton message TROIS places en boutons, prises parmi celles que `chercher_des_places` a rendues : elle en touche une, et c’est réservé, sans autre oui. Pour un rendez-vous à reprogrammer, donne `rdv` ; sinon `pour` (la fiche, ou « nouvelle ») et les gestes. Ne recopie pas les dates dans ton message.',
    input_schema: {
      type: 'object',
      properties: {
        gestes: GESTES,
        rdv: { type: 'string', description: 'Le rendez-vous à reprogrammer, s’il s’agit de lui.' },
        pour: { type: 'string', description: 'L’identifiant de la fiche pour qui l’on réserve, ou « nouvelle » quand elle n’a pas de fiche.' },
        prenom: { type: 'string', description: 'Pour une nouvelle : le prénom qu’elle a donné, s’il est déjà dit.' },
        civilite: { type: 'string', enum: ['madame', 'mademoiselle', 'monsieur'], description: 'Pour une nouvelle : la civilité qu’elle a dite, si elle est déjà dite.' },
        locks: { type: 'integer', minimum: 1, maximum: 3000, description: 'Le nombre de locks qu’elle a dit, ou que tu as estimé sur sa photo.' },
        places: {
          type: 'array', minItems: 1, maxItems: 3,
          items: { type: 'object', properties: { date: DATE_ISO, heure: HEURE }, required: ['date', 'heure'], additionalProperties: false },
          description: 'Trois places, les plus proches de son souhait.',
        },
      },
      required: ['gestes', 'places'],
      additionalProperties: false,
    },
  },
  {
    name: 'mettre_a_reprogrammer',
    description: 'Elle ne pourra pas venir à un rendez-vous qu’elle a : sa place est libérée tout de suite (il n’est pas annulé, il attend sa nouvelle date), et trois places partent en boutons sous ton message. Jamais pour un retard (`noter_un_retard`).',
    input_schema: {
      type: 'object',
      properties: { rdv: { type: 'string', description: 'L’identifiant du rendez-vous, tel que le contexte le donne.' } },
      required: ['rdv'],
      additionalProperties: false,
    },
  },
  {
    name: 'noter_un_retard',
    description: 'Elle sera en retard aujourd’hui à ce rendez-vous : sa place n’est jamais libérée. L’outil la garde (une demi-heure de retard au plus), ou la décale à son heure d’arrivée quand la Maison peut la recevoir, et te dit quoi lui écrire.',
    input_schema: {
      type: 'object',
      properties: {
        rdv: { type: 'string', description: 'L’identifiant du rendez-vous d’aujourd’hui, tel que le contexte le donne.' },
        heure: { ...HEURE, description: 'Son heure d’arrivée, HH:MM : l’heure du rendez-vous plus son retard (15:00 et « 1 h de retard » : 16:00).' },
      },
      required: ['rdv', 'heure'],
      additionalProperties: false,
    },
  },
  {
    name: 'accommoder',
    description: 'Elle a écrit un jour et une heure : la Maison lui trouve toujours de la place (son heure, sinon les plus proches dans l’heure en boutons, sinon au-delà des fauteuils). L’outil pose, ou propose, et te dit quoi lui écrire.',
    input_schema: {
      type: 'object',
      properties: {
        gestes: GESTES,
        date: DATE_ISO,
        heure: HEURE,
        rdv: { type: 'string', description: 'Le rendez-vous à reprogrammer, s’il s’agit de lui.' },
        pour: { type: 'string', description: 'L’identifiant de la fiche pour qui l’on réserve, ou « nouvelle ».' },
        prenom: { type: 'string', description: 'Pour une nouvelle : le prénom qu’elle a donné.' },
        civilite: { type: 'string', enum: ['madame', 'mademoiselle', 'monsieur'], description: 'Pour une nouvelle : la civilité qu’elle a dite.' },
        locks: { type: 'integer', minimum: 1, maximum: 3000, description: 'Le nombre de locks qu’elle a dit, ou que tu as estimé sur sa photo.' },
      },
      required: ['gestes', 'date', 'heure'],
      additionalProperties: false,
    },
  },
  {
    name: 'proposer_le_rendez_vous',
    description: 'Tient une place choisie par elle, ou que tu lui proposes de garder, et rend le récapitulatif à lui écrire. Rien n’est posé : il faudra son oui, puis `confirmer`.',
    input_schema: {
      type: 'object',
      properties: {
        pour: { type: 'string', description: 'L’identifiant de la fiche pour qui l’on réserve, ou « nouvelle » quand elle n’a pas de fiche.' },
        prenom: { type: 'string', description: 'Pour une nouvelle : le prénom qu’elle a donné, s’il est déjà dit.' },
        civilite: { type: 'string', enum: ['madame', 'mademoiselle', 'monsieur'], description: 'Pour une nouvelle : la civilité qu’elle a dite, si elle est déjà dite.' },
        gestes: GESTES,
        date: DATE_ISO,
        heure: HEURE,
        locks: { type: 'integer', minimum: 1, maximum: 3000, description: 'Le nombre de locks qu’elle a dit, ou que tu as estimé sur sa photo, pour le prix du récapitulatif.' },
        longueur: { type: 'string', enum: ['court', 'mi-long', 'long'], description: 'Sa longueur, dite ou estimée sur sa photo.' },
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
    description: 'Elle a dit oui au récapitulatif que tu lui as envoyé : pose le rendez-vous proposé, ou déplace celui qui l’était. Seulement après son oui, jamais dans le tour où tu proposes. Pour une nouvelle, son prénom et sa civilité, tels qu’elle vient de les dire.',
    input_schema: {
      type: 'object',
      properties: {
        prenom: { type: 'string', description: 'Pour une nouvelle : le prénom qu’elle a donné.' },
        civilite: { type: 'string', enum: ['madame', 'mademoiselle', 'monsieur'], description: 'Pour une nouvelle : la civilité qu’elle a dite.' },
      },
      additionalProperties: false,
    },
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
  {
    name: 'ranger_un_demarchage',
    description: 'La personne ne vient pas pour ses cheveux : elle vend ou propose quelque chose à la Maison. Le tri de la Maison relit ses messages et range son numéro (bloqué, ou dans les propositions) : aucun message ne part, personne ne lui répond. S’il ne le range pas, l’outil te le dit.',
    input_schema: {
      type: 'object',
      properties: { pourquoi: { type: 'string', maxLength: 100, description: 'Ce qu’elle vend, en quelques mots, sans nom ni numéro.' } },
      required: ['pourquoi'],
      additionalProperties: false,
    },
  },
] as const;

/* ── LE DÉMARCHAGE QU'OPALE RECONNAÎT (18 novembre 2026) ─────────────────
   Ce que le tri relit : ses trois derniers messages qui disent quelque
   chose (la transcription d'un vocal ; ni une photo seule, ni un vocal non
   compris), sans doublon (le démarcheur recolle la même publicité). */
export function textesPourLeTri(messages: readonly { sens: string; texte: string; type?: string; transcription?: string }[]): string[] {
  const vus: string[] = [];
  for (const m of messages) {
    if (m.sens !== 'entrant') continue;
    const t = String(m.type === 'audio' ? m.transcription ?? '' : m.texte ?? '').trim();
    if (!t || t === 'une photo' || t === 'un message vocal' || t === 'une vidéo') continue;
    const net = t.slice(0, 1200);
    const i = vus.indexOf(net);
    if (i >= 0) vus.splice(i, 1);
    vus.push(net);
  }
  return vus.slice(-3);
}
/** Le verdict du tri qui range le numéro : personne ne lui répond. */
export const verdictRange = (v: string): boolean => v === 'bloque' || v === 'proposition';

/** UN RETARD N'EST PAS UN EMPÊCHEMENT — 20 novembre 2026. « J’ai un
    empêchement, j’aurai 1 h de retard » : Opale libérait sa place de 15 h
    (`mettre_a_reprogrammer`), puis disait 16 h impossible ; la cliente, 30 000 F,
    a pris 18 h. « L’objectif est toujours d’avoir des rendez-vous, pas de leur
    donner un NON » (Yéman). Un retard le jour même garde sa place : une
    demi-heure au plus, rien ne bouge ; davantage, sa place est décalée à son
    heure d’arrivée quand la Maison peut la recevoir (les règles, sinon au-delà
    des fauteuils), et jamais libérée avant d’être tenue. Une arrivée dans
    moins de vingt-cinq minutes (le verrou de la reprise, 0239) : elle est
    attendue, rien ne bouge. */
export const RETARD_SANS_DECALER_MIN = 30;
export const RETARD_AU_PLUS_TOT_MIN = 25;
export type SuiteDuRetard = 'attendue' | 'decaler';
export function suiteDuRetard(o: { rdvMin: number; arriveeMin: number; maintenantMin: number }): SuiteDuRetard {
  if (!Number.isFinite(o.rdvMin) || !Number.isFinite(o.arriveeMin) || !Number.isFinite(o.maintenantMin)) return 'attendue';
  if (o.arriveeMin - o.rdvMin <= RETARD_SANS_DECALER_MIN) return 'attendue';
  if (o.arriveeMin < o.maintenantMin + RETARD_AU_PLUS_TOT_MIN) return 'attendue';
  return 'decaler';
}
/** Ses mots parlent-ils d'un retard (« 1 h de retard », « je serai là vers
    16 h », « j’arrive dans une heure ») ? Le garde de `mettre_a_reprogrammer` :
    un rendez-vous d'aujourd'hui ne se libère pas pour un retard. */
const MOTS_DU_RETARD = /retard|je serai l[aà]|j['’]arrive (dans|vers|à|a)\s|en route/i;
export const parleDUnRetard = (textes: readonly string[]): boolean => textes.some((t) => MOTS_DU_RETARD.test(String(t ?? '')));
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
    (son prénom et sa civilité s'ils sont dits : sinon `confirmer` les
    prendra, 18 novembre 2026) ; des gestes connus ; une date à venir, ou
    aujourd'hui à une heure qui commence au moins une heure plus tard
    (`minutesDuJour` : l'heure de Cotonou ; sans elle, jamais le jour même). */
export function propositionLue(e: EntreeDeLaProposition, o: { fiches: readonly string[]; connus: ReadonlySet<string>; aujourdhui: string; minutesDuJour?: number }): PropositionLue {
  const pour = String(e.pour ?? '').trim();
  const nouvelle = pour === 'nouvelle';
  if (!nouvelle && !o.fiches.includes(pour)) return { ok: false, pourquoi: 'Cette fiche n’est pas l’une des fiches de ce numéro (contexte). Pour une personne sans fiche, « nouvelle ».' };
  const prenom = typeof e.prenom === 'string' ? e.prenom.trim().replace(/\s+/g, ' ').slice(0, 40) : '';
  const civilite = e.civilite === 'madame' || e.civilite === 'mademoiselle' || e.civilite === 'monsieur' ? e.civilite : undefined;
  const g = gestesLus(e.gestes, o.connus);
  if (g.ids.length === 0) return { ok: false, pourquoi: 'Aucun de ces gestes n’est réservable ici : reprends les identifiants du catalogue.' };
  if (!estIso(e.date) || !estHeure(e.heure)) return { ok: false, pourquoi: 'La date (AAAA-MM-JJ) ou l’heure (HH:MM) est illisible.' };
  if (e.date < o.aujourdhui) return { ok: false, pourquoi: 'Cette date est passée : propose les prochaines places.' };
  if (e.date === o.aujourdhui && (o.minutesDuJour === undefined || minutesDe(e.heure) < o.minutesDuJour + JOUR_MEME_DELAI_MIN)) {
    return { ok: false, pourquoi: 'Le jour même, une place commence au moins une heure plus tard : propose une heure plus tardive (chercher_des_places), ou les jours suivants.' };
  }
  return { ok: true, pour: nouvelle ? 'nouvelle' : pour, ...(nouvelle && prenom ? { prenom } : {}), ...(nouvelle && civilite ? { civilite } : {}), gestes: g.ids, date: e.date, heure: e.heure };
}

/** QUI INSCRIRE, AU OUI D'UNE NOUVELLE (18 novembre 2026) : le prénom et la
    civilité de la proposition, sinon ceux qu'elle vient de dire et que
    `confirmer` reçoit. Jamais une civilité supposée : sans les deux, rien ne
    se pose. */
export function quiInscrire(attente: { prenom?: string; civilite?: CiviliteDuFil }, e: { prenom?: unknown; civilite?: unknown }): { ok: true; prenom: string; civilite: CiviliteDuFil } | { ok: false; pourquoi: string } {
  const dit = typeof e.prenom === 'string' ? e.prenom.trim().replace(/\s+/g, ' ').slice(0, 40) : '';
  const prenom = attente.prenom || dit;
  const civilite = attente.civilite ?? (e.civilite === 'madame' || e.civilite === 'mademoiselle' || e.civilite === 'monsieur' ? e.civilite : undefined);
  if (!prenom || !civilite) return { ok: false, pourquoi: 'Pour l’inscrire, il faut le prénom qu’elle a donné et sa civilité (« Madame ou Monsieur ? ») : demande ce qui manque, la place reste tenue.' };
  return { ok: true, prenom, civilite };
}

/* ── CE QUI ATTEND SON OUI ──────────────────────────────────────────────
   Gardé dans le fil (`EtatDuFil.opale`) : `confirmer` ne pose que cela, et
   seulement si la proposition est partie AVANT les messages du tour (elle y
   répond) et qu'elle n'a pas plus de deux heures. */
export type EnAttenteDOpale =
  /* `locks` : ceux qu'elle a dits ou que la photo a fait estimer, écrits sur
     le rendez-vous (`locksAnnonces`) : deux têtes chez Team (18 novembre 2026). */
  | { genre: 'pose'; pour: string; prenom?: string; civilite?: CiviliteDuFil; gestes: string[]; date: string; heure: string; dureeMin: number; proposeLe: string; locks?: number }
  | { genre: 'deplacement'; rdvId: string; updatedAt: string; maitre: string; clientId: string; gestes: string[]; dureeMin: number; avant: { date: string; time: string }; date: string; heure: string; proposeLe: string };

/** LA DERNIÈRE OFFRE EN BOUTONS (19 novembre 2026) : ce qu'il faut pour
    poser une première réservation d'un toucher, sans rien redemander. */
export type OffreDeBoutons = { gestes: string[]; pour: string; prenom?: string; civilite?: CiviliteDuFil; locks?: number; places: string[]; proposeLe: string };
/** Une offre se tient quarante-huit heures. */
export const OFFRE_TENUE_MS = 48 * 3_600_000;

export type EtatDOpale = { enAttente?: EnAttenteDOpale; dernierTourLe?: string; relanceLe?: string; offre?: OffreDeBoutons };

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
  /** Une photo qu'elle a envoyée, jointe à la demande : Opale la voit. */
  photoJointe?: boolean;
  /** UN VOCAL (18 novembre 2026) : sa transcription automatique, quand la
      Maison l'a compris (`ecoute-du-vocal-pur`, écrit par la réception). */
  transcription?: string;
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
  /** Elle porte ce numéro sans y parler (4 novembre 2026) : une enfant, ou
      une fiche qui le nomme « Maman », « Papa ». Ce n'est jamais elle qui écrit. */
  numeroDuParent?: boolean;
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
  /** QUI ÉCRIT SUR UN NUMÉRO D'ENFANT (4 novembre 2026) : le parent qui règle
      leur compte famille (sa fiche, son appel), sinon un parent sans fiche,
      que la fiche des enfants nomme peut-être (« Maman d'A. »). */
  parent?: { ficheId?: string; appel?: string; prenom?: string; nom?: string };
  nomProfil?: string;
  rdvs: readonly RdvDOpale[];
  connaitLeLieu: boolean;
  /** Elle a un rendez-vous pris ou une séance faite (⟨rendez-vous-pris⟩, 17 novembre
      2026) : une personne de la Maison peut regarder sa photo. Absent : non. */
  suivie?: boolean;
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
  /** LA MAIN QUE PERSONNE N'A PRISE (18 novembre 2026) : Opale l'avait
      passée, personne n'a écrit depuis ; elle reprend. */
  reprise?: { passeeLe: string; motif: string; resteALEquipe: boolean };
  /** LA RELANCE (18 novembre 2026) : aucun message neuf ; sa dernière
      question attend depuis plus de trois heures. */
  relance?: boolean;
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
  const photo = m.photoJointe ? '[une photo, jointe après le contexte : tu la vois]' : '[une photo]';
  const brut = String(m.texte ?? '').replace(/\s+/g, ' ').trim().slice(0, 600);
  const vocal = m.transcription ? `[un message vocal ; sa transcription automatique : « ${m.transcription.replace(/\s+/g, ' ').trim().slice(0, 1200)} »]` : '[un message vocal]';
  const t = m.type === 'image' ? (brut && brut !== 'une photo' ? `${photo} ${brut}` : photo)
    : m.type === 'audio' ? (brut && brut !== 'un message vocal' ? `${vocal} ${brut}` : vocal)
    : brut || '[un message sans texte]';
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
      f.numeroDuParent ? 'ce numéro est celui de son parent : ce n’est jamais elle qui écrit' : f.parPhone ? 'ce numéro est le sien' : f.parFamille ? 'rattachée à ce numéro par sa famille' : 'ce numéro est l’un des siens',
      ...(f.mineure || f.numeroDuParent ? ['enfant'] : []),
      ...(f.locks ? [`environ ${f.locks} locks`] : []),
      ...(f.longueur ? [`longueur ${f.longueur}`] : []),
      ...(f.derniereVenue ? [`dernière venue : ${jourDitAvecAnnee(f.derniereVenue.date)} (${f.derniereVenue.gestes.map(c.nomDe).join(' et ')})`] : ['jamais venue']),
    ];
    l.push(`- fiche [${f.id}] : ${traits.join(' ; ')}.`);
  }
  if (c.parent) {
    const p = c.parent;
    const qui = p.appel ? `on l’appelle « ${p.appel} »` : p.prenom ? `son prénom : ${p.prenom}, civilité inconnue`
      : p.nom ? `la fiche des enfants le nomme « ${p.nom} » (ce n’est ni un appel ni une civilité)` : 'ni son nom ni sa civilité ne sont connus';
    l.push(`Qui t’écrit : le parent des enfants, ${p.ficheId ? `fiche [${p.ficheId}]` : 'sans fiche à ce numéro'} ; ${qui}. Ce ne sont jamais les enfants qui écrivent.`);
  }
  if (c.rdvs.length > 0) {
    l.push('Ses rendez-vous à venir :');
    for (const r of c.rdvs) l.push(`- ${rdvDit(r, c.nomDe)}, pour la fiche [${r.pour}]`);
  } else l.push('Aucun rendez-vous à venir.');
  l.push(c.connaitLeLieu ? 'Le lieu : elle connaît déjà la Maison ; ne redonne ni l’adresse ni le plan, sauf si elle les demande.' : `Le lieu : elle n’est jamais venue. L’adresse : ${c.adresse}.`);
  l.push('');
  l.push(c.suivie
    ? 'L’avis sur photo : elle a un rendez-vous pris ou une séance faite à la Maison. Sa photo te sert au prix ; un avis sur l’état de ses locks revient à une personne (passer_la_main, motif « media »).'
    : `L’avis sur photo : elle n’a ni rendez-vous pris ni séance faite à la Maison. Sa photo te sert au prix et à la place, jamais à un avis à distance, et la main ne passe pas pour une photo : la Maison regarde ses locks avec elle, au rendez-vous. Le lien de la consultation, pour une création ou une réparation : ${lienDeLaConsultation(c.liens.catalogue)}`);
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
  if (c.reprise) {
    l.push('');
    l.push(`TU REPRENDS LA CONVERSATION : tu avais passé la main à l’équipe ${quandDitDOpale(c.reprise.passeeLe)}, et personne ne lui a répondu depuis. Excuse l’attente en quelques mots, sans accuser personne, puis réponds toi-même à tout ce qui attend (un prix, des places, sa photo) et propose une place.${c.reprise.resteALEquipe ? ` Ce qui revient à une personne (${c.reprise.motif}) reste à l’équipe : dis seulement que la Maison s’en occupe, sans promettre de délai, et n’appelle pas une seconde fois \`passer_la_main\` pour cela.` : ''}`);
  }
  if (c.relance) {
    l.push('');
    l.push('RELANCE : elle n’a pas répondu depuis plus de trois heures à ta dernière question, et aucun message neuf n’attend. Écris UN message court qui l’aide à conclure : une place lui a été proposée, vérifie qu’elle est encore libre (`chercher_des_places`) et propose de la lui garder (`proposer_le_rendez_vous`) ; sinon, reprends sa demande en une phrase et propose une place précise. Pas de reproche, pas d’insistance, ne dis pas que c’est une relance, ne salue pas une seconde fois dans la journée. Si rien n’appelle de relance (elle a dit non, elle a été servie, elle a dit qu’elle reviendrait vers la Maison plus tard, ou ta question n’attendait rien d’important), appelle `ne_rien_repondre`.');
    return l.join('\n');
  }
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
/** LE SALUT D'UN ENFANT (4 novembre 2026) : « Bonjour Ama », « Merci, Mlle Ama »
    sur le numéro de son parent. C'est le parent qui écrit. */
export const salueLEnfant = (texte: string, prenom: string): boolean => {
  const p = String(prenom ?? '').trim();
  if (p.length < 2) return false;
  const nom = p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?<![\\p{L}])(?:bonjour|bonsoir|bienvenue|merci|avec plaisir|ch[èe]re?|salut)\\s*,?\\s+(?:(?:mme|mlle|m\\.|madame|mademoiselle|monsieur)\\s+)?${nom}(?![\\p{L}])`, 'iu').test(String(texte ?? ''));
};

export function fautesDOpale(texte: string, o: { montantsPermis: ReadonlySet<number>; questionFranche: boolean; enfants?: readonly string[] }): string[] {
  const t = String(texte ?? '').trim();
  const fautes: string[] = [];
  if (!t) fautes.push('un message vide');
  if (t.length > SIGNES_D_OPALE_AU_PLUS) fautes.push(`un message de ${t.length} signes (${SIGNES_D_OPALE_AU_PLUS} au plus)`);
  fautes.push(...texteSain(t, true));
  if (EMOJI.test(t)) fautes.push('un émoji');
  if (!o.questionFranche && FORMULES_D_ASSISTANT.test(t)) fautes.push('une formule d’assistant');
  for (const p of o.enfants ?? []) if (salueLEnfant(t, p)) fautes.push(`le prénom de l’enfant (« ${p} ») dans le salut : c’est son parent qui écrit, adresse-toi au parent`);
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
  | { genre: 'main'; motif: MotifDeLaMain; enAttente?: EnAttenteDOpale | null }
  | { genre: 'rien' };

/** `relance` : ce tour était une relance (envoyée ou tue), elle ne se refait
    pas avant un nouveau message d'elle. Une main déjà passée pour le même
    motif garde son heure : la reprise par Opale ne la remet pas à zéro. */
export function etatApresOpale(
  avant: EtatDuFil, o: { issue: IssueDuTourDOpale; waIds: readonly string[]; dernierEntrantQuand?: string; envois: number; planEnvoye: boolean; maintenantMs: number; relance?: boolean; offre?: OffreDeBoutons | null },
): EtatDuFil & { opale: EtatDOpale } {
  const maintenant = new Date(o.maintenantMs).toISOString();
  const traites = [...(avant.traites ?? []), ...o.waIds.filter((w) => !(avant.traites ?? []).includes(w))].slice(-20);
  const envois = [...(avant.envois ?? []).filter((x) => o.maintenantMs - Date.parse(x) < 86_400_000), ...Array.from({ length: o.envois }, () => maintenant)];
  const ancienne = ((avant as EtatDuFil & { opale?: EtatDOpale }).opale ?? {}) as EtatDOpale;
  const garde = o.issue.genre === 'parle' || o.issue.genre === 'main'
    ? (o.issue.enAttente === null ? undefined : o.issue.enAttente ?? ancienne.enAttente)
    : o.issue.genre === 'rien' ? ancienne.enAttente : undefined;
  const relanceLe = o.relance ? maintenant : ancienne.relanceLe;
  const offreGardee = o.offre === null ? undefined : o.offre ?? ancienne.offre;
  const offre = offreGardee && o.maintenantMs - Date.parse(offreGardee.proposeLe) < OFFRE_TENUE_MS ? offreGardee : undefined;
  const opale: EtatDOpale = { ...(garde ? { enAttente: garde } : {}), dernierTourLe: maintenant, ...(relanceLe ? { relanceLe } : {}), ...(offre ? { offre } : {}) };
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
    const memeMain = avant.etape === 'main' && avant.motifMain === o.issue.motif && !!avant.mainPasseeLe;
    return {
      ...base, ...passe('main'), mainPasseeLe: memeMain ? avant.mainPasseeLe : maintenant, motifMain: o.issue.motif,
      etapeAvantLaMain: 'besoin', versionAvantLaMain: memeMain ? avant.versionAvantLaMain ?? avant.version : avant.version, mainDeLaReception: true,
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
