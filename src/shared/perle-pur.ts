/* ══ DEMANDER À PERLE — 21 novembre 2026 ═════════════════════════════════
   « J'aimerais créer une intelligence artificielle dans le Trône à qui je
   peux poser toutes les questions, répondre à des messages, me donner des
   infos en temps réel. Inspire-toi de Brain sur Bujeti » (Yéman). Maquette
   7XvdzJ99bioQsv62r5cBrw, « Construis, la direction seule, questions et En
   direct d'abord ».

   PREMIER LOT : PERLE LIT ET RÉPOND. Elle n'envoie rien, ne pose rien, ne
   déplace jamais d'argent (comme BRAIN : aucune action irréversible).

   COMMENT ELLE RÉPOND, EN DEUX TEMPS AU PLUS :
     1. LE PLAN. Elle reçoit la question et les faits « En direct » (calculés
        par le Trône, sans IA). S'ils suffisent, elle répond. Sinon elle
        demande des LECTURES, au plus quatre, parmi un catalogue fermé.
     2. LA RÉPONSE. Le Trône exécute ces lectures sur ses propres données (ce
        que la personne a le droit de voir), les anonymise, et Perle répond
        avec ces seuls faits.

   CE QUI PART CHEZ CLAUDE : des sommes, des dates, des prénoms et initiales
   (`prenomDeLaFiche`), jamais un numéro ni un nom complet (`pourClaude`).
   La porte est `ia-maison`, chantier `question` : la direction seule, et le
   plafond du mois compté par la fonction.

   CE MODULE EST PUR : il compose les demandes et le fil, il ne lit aucun
   magasin et n'envoie rien. Banc : `verifie-demander-a-perle`. */
import type { DemandeIa, MessageIa } from './ia-maison-pur';
import { francsDits, heureEnClair } from './cloture-du-jour-pur';
import { dateDite } from './ia-fiche-du-jour-pur';
import { filOuvertAClaude } from './ia-reponse-wa-pur';

/** La porte : le chantier « question » d'`ia-maison`, ouvert à la direction seule. */
export const CHANTIER_DE_PERLE = 'question' as const;

const ISO_JOUR = /^\d{4}-\d{2}-\d{2}$/;
const ISO_MOIS = /^\d{4}-\d{2}$/;

/* ── LES LECTURES : ce que Perle peut demander au Trône ─────────────────── */

export const NOMS_DES_LECTURES = [
  'journee', 'rendez_vous', 'places_libres', 'cliente', 'impayes', 'mois', 'conversations', 'abonnements', 'prestations', 'depenses',
] as const;
export type NomDeLecture = (typeof NOMS_DES_LECTURES)[number];

/** Une lecture demandée, ses arguments à plat (le schéma reste simple). */
export type LectureDemandee = {
  nom: NomDeLecture;
  jour?: string;
  du?: string;
  au?: string;
  mois?: string;
  cliente?: string;
  terme?: string;
};

/** Le catalogue : ce que chaque lecture rend (dit à Claude), et l'écran du
    Trône d'où elle vient (dit à la direction : « Lu dans… »). */
export const LECTURES: Record<NomDeLecture, { dit: string; ecran: string; nomEcran: string }> = {
  journee: { dit: 'journee(jour) : l’argent entré ce jour-là par moyen de paiement, les pourboires, les dépenses, les rendez-vous du jour par état, ce qui reste à encaisser. Sans « jour » : aujourd’hui.', ecran: '/la-journee', nomEcran: 'La journée' },
  rendez_vous: { dit: 'rendez_vous(du, au) : les rendez-vous entre deux jours (heure, cliente, gestes, maître, état, prix). Sans dates : aujourd’hui. Sept jours au plus.', ecran: '/carnet', nomEcran: 'Le Carnet' },
  places_libres: { dit: 'places_libres(jour) : les heures encore libres ce jour-là pour un rituel d’une heure, ou la fermeture. Sans « jour » : aujourd’hui.', ecran: '/carnet', nomEcran: 'Le Carnet' },
  cliente: { dit: 'cliente(cliente) : la fiche d’une cliente par son nom ou son prénom : ses venues, sa dernière venue, son rythme, son prochain rendez-vous, ce qu’elle doit, sa formule.', ecran: '/customers', nomEcran: 'Les clientes' },
  impayes: { dit: 'impayes() : les factures qui doivent encore de l’argent, par cliente, et leur total.', ecran: '/factures', nomEcran: 'Factures & devis' },
  mois: { dit: 'mois(mois) : pour un mois « AAAA-MM », l’argent entré, par moyen et par nature, les dépenses par catégorie, les rituels honorés, les nouvelles clientes, et le mois d’avant pour comparer. Sans « mois » : le mois en cours.', ecran: '/synthese', nomEcran: 'Synthèse & résultat' },
  conversations: { dit: 'conversations() : les conversations WhatsApp qui attendent une réponse de la Maison, depuis quand, et leur dernier message.', ecran: '/conversations', nomEcran: 'Conversations' },
  abonnements: { dit: 'abonnements() : les formules en cours, par cliente, avec leur fin.', ecran: '/abonnements', nomEcran: 'Abonnements' },
  prestations: { dit: 'prestations(terme) : le catalogue : nom, prix et durée des prestations dont le nom contient « terme ». Sans « terme » : tout le catalogue.', ecran: '/catalogue', nomEcran: 'Catalogue' },
  depenses: { dit: 'depenses(du, au) : les dépenses entre deux jours (libellé, montant, catégorie) et leur total. Sans dates : le mois en cours.', ecran: '/depenses', nomEcran: 'Dépenses' },
};

/** Au plus quatre lectures par question : au-delà, la question est trop large. */
export const LECTURES_MAX = 4;
/** Les signes de faits qu'une réponse emporte, au plus (la porte en accepte 40 000). */
export const SIGNES_DE_FAITS_MAX = 24_000;
/** Les tours d'avant que Perle garde en tête : trois questions et leurs réponses. */
export const TOURS_GARDES = 3;

/* ── LA VOIX DE PERLE ───────────────────────────────────────────────────── */

const REGLES_DE_PERLE = [
  'Tu es Perle, l’assistante de Maison MND dans le Trône, son outil de gestion. Tu réponds à la direction.',
  'Maison MND est une maison de soins des locks à Cotonou. On dit « Maison MND » ou « la Maison », jamais « salon ».',
  'Français simple, phrases courtes. Jamais de tiret cadratin : une virgule à la place. Pas d’emoji. Pas de mise en forme : ni astérisques, ni dièses, ni tableaux. Une liste s’écrit une ligne par élément, chacune commençant par un tiret et une espace.',
  'Les montants en francs CFA, écrits « 185 000 F ». Une date porte toujours son année. Une heure s’écrit « 15 h 13 ».',
  'N’invente AUCUN chiffre ni aucun fait : tu n’utilises que les faits qu’on te donne. S’il en manque un, dis-le en une phrase, et dis dans quel écran du Trône le trouver.',
  'Tu lis et tu réponds, tu ne fais rien : tu n’envoies aucun message, tu ne poses ni ne déplaces aucun rendez-vous, tu ne déplaces jamais d’argent. Si on te demande d’agir, dis que tu ne le fais pas et nomme l’écran du Trône où la direction le fait.',
  'Les clientes sont désignées par leur prénom et une initiale : garde-les exactement ainsi.',
  'Le chiffre ou le fait demandé d’abord, puis ce qui l’explique. Six phrases au plus.',
].join('\n');

const jourDeLaSemaine = (iso: string): string => {
  const d = new Date(`${iso}T12:00:00Z`);
  return Number.isNaN(d.getTime()) ? '' : ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'][d.getUTCDay()];
};

/** « samedi 21 novembre 2026, 15 h 13 à Cotonou » : le moment dit à Perle et à l'écran. */
export const momentDit = (jour: string, minutes: number): string =>
  `${jourDeLaSemaine(jour)} ${dateDite(jour)}, ${heureEnClair(minutes)} à Cotonou`.trim();

/** Les tours d'avant : la question et la réponse, sans les faits (ils ont vieilli). */
export function toursDAvant(fil: readonly MessageIa[]): MessageIa[] {
  const propres = fil.filter((m) => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim());
  const gardes = propres.slice(-TOURS_GARDES * 2).map((m) => ({ role: m.role, content: m.content.trim().slice(0, 1200) }));
  /* La porte veut que le premier message soit celui de la Maison. */
  while (gardes.length && gardes[0].role !== 'user') gardes.shift();
  return gardes;
}

/* ── 1. LE PLAN ─────────────────────────────────────────────────────────── */

export const SCHEMA_DU_PLAN: Record<string, unknown> = {
  type: 'object',
  properties: {
    reponse: { type: 'string', description: 'La réponse à la direction, si les faits en direct suffisent ; sinon une chaîne vide.' },
    lectures: {
      type: 'array',
      maxItems: LECTURES_MAX,
      description: 'Les lectures du Trône qu’il te faut pour répondre ; vide si tu as répondu.',
      items: {
        type: 'object',
        properties: {
          nom: { type: 'string', enum: [...NOMS_DES_LECTURES] },
          jour: { type: 'string', description: 'AAAA-MM-JJ' },
          du: { type: 'string', description: 'AAAA-MM-JJ' },
          au: { type: 'string', description: 'AAAA-MM-JJ' },
          mois: { type: 'string', description: 'AAAA-MM' },
          cliente: { type: 'string', description: 'Le nom ou le prénom, tel que la direction l’a écrit.' },
          terme: { type: 'string' },
        },
        required: ['nom'],
      },
    },
    internet: { type: 'string', description: 'La question à chercher sur internet, reformulée sans aucun nom de personne ni chiffre de la Maison ; sinon une chaîne vide.' },
    message: {
      type: 'object',
      description: 'Seulement si la direction demande d’écrire ou de répondre à une cliente sur WhatsApp ; sinon ne le remplis pas.',
      properties: {
        cliente: { type: 'string', description: 'Le nom de la cliente, tel que la direction l’a écrit ; vide si elle ne nomme personne.' },
        plusAncienne: { type: 'boolean', description: 'true si la direction ne nomme personne et parle de la conversation qui attend.' },
        consigne: { type: 'string', description: 'Ce que la réponse doit dire, dans les mots de la direction ; vide si elle n’a rien précisé.' },
        jour: { type: 'string', description: 'AAAA-MM-JJ, seulement si la direction cite un jour de rendez-vous à proposer.' },
        heure: { type: 'string', description: 'HH:MM, seulement si elle cite une heure de rendez-vous.' },
      },
    },
  },
  required: ['reponse', 'lectures'],
};

/** LE PLAN : la question, le moment, les faits en direct, le catalogue. */
export function demandeDuPlan(o: { question: string; jour: string; minutes: number; enDirect: string; avant?: readonly MessageIa[]; internet?: boolean; messages?: boolean }): DemandeIa {
  const catalogue = NOMS_DES_LECTURES.map((n) => `- ${LECTURES[n].dit}`).join('\n');
  const consignes = [
    o.internet
      ? 'Une question qui porte sur le monde hors de la Maison (un taux, une loi, un impôt, un prix du marché, une actualité, une idée à trouver) ne se lit pas dans le Trône : laisse « reponse » vide et « lectures » vide, et écris dans « internet » la question à chercher, en une phrase, reformulée SANS aucun nom de personne ni chiffre de la Maison. Une question sur la Maison ne va jamais sur internet.'
      : 'Une question qui ne porte pas sur la Maison (le monde, internet, un conseil général) n’a pas de lecture : réponds dans « reponse » que tu ne lis pour l’instant que le Trône.',
  ];
  if (o.messages) consignes.push(REGLE_DES_MESSAGES);
  return {
    chantier: CHANTIER_DE_PERLE,
    usage: 'texte',
    systeme: [
      REGLES_DE_PERLE,
      `Nous sommes le ${momentDit(o.jour, o.minutes)}.`,
      'Voici les FAITS EN DIRECT, calculés par le Trône à l’instant :',
      o.enDirect || '(aucun)',
      'Si ces faits suffisent à répondre, écris la réponse dans « reponse » et laisse « lectures » vide. Sinon laisse « reponse » vide et demande les lectures qu’il te faut, quatre au plus, parmi celles-ci :',
      catalogue,
      ...consignes,
    ].join('\n\n'),
    messages: [...toursDAvant(o.avant ?? []), { role: 'user', content: o.question.trim().slice(0, 1200) }],
    schema: SCHEMA_DU_PLAN,
    maxTokens: 700,
  };
}

const jourValide = (v: unknown): string | undefined => (typeof v === 'string' && ISO_JOUR.test(v.trim()) && !Number.isNaN(Date.parse(`${v.trim()}T12:00:00Z`)) ? v.trim() : undefined);
const texteCourt = (v: unknown, n: number): string | undefined => (typeof v === 'string' && v.trim() ? v.trim().slice(0, n) : undefined);

/** LE PLAN, LU SANS RIEN CROIRE : une réponse, ou des lectures du catalogue,
    quatre au plus, sans doublon, leurs arguments au bon format. Une forme
    qu'on ne reconnaît pas ne rend ni réponse ni lecture. */
export function planLu(data: unknown): { reponse: string; lectures: LectureDemandee[]; internet: string; message: MessageDemande | null } {
  const d = (data && typeof data === 'object' ? data : {}) as { reponse?: unknown; lectures?: unknown; internet?: unknown; message?: unknown };
  /* UNE RÉPONSE À PRÉPARER PASSE DEVANT TOUT : la direction a demandé d'écrire,
     pas de lire. Le Trône lira lui-même le fil et vérifiera la place citée. */
  const message = messageLu(d.message);
  if (message) return { reponse: '', lectures: [], internet: '', message };
  const lectures: LectureDemandee[] = [];
  const vues = new Set<string>();
  for (const brut of Array.isArray(d.lectures) ? d.lectures : []) {
    const l = (brut && typeof brut === 'object' ? brut : {}) as Record<string, unknown>;
    if (!NOMS_DES_LECTURES.includes(l.nom as NomDeLecture)) continue;
    const propre: LectureDemandee = { nom: l.nom as NomDeLecture };
    const jour = jourValide(l.jour); if (jour) propre.jour = jour;
    const du = jourValide(l.du); if (du) propre.du = du;
    const au = jourValide(l.au); if (au) propre.au = au;
    if (typeof l.mois === 'string' && ISO_MOIS.test(l.mois.trim())) propre.mois = l.mois.trim();
    const cliente = texteCourt(l.cliente, 80); if (cliente) propre.cliente = cliente;
    const terme = texteCourt(l.terme, 60); if (terme) propre.terme = terme;
    const cle = JSON.stringify(propre);
    if (vues.has(cle)) continue;
    vues.add(cle);
    lectures.push(propre);
    if (lectures.length >= LECTURES_MAX) break;
  }
  const reponse = typeof d.reponse === 'string' ? d.reponse.trim() : '';
  /* Des lectures demandées : la réponse attend les faits, on n'en garde aucune d'avance.
     Le Trône d'abord : une question qui a ses lectures ne part pas sur internet. */
  if (lectures.length) return { reponse: '', lectures, internet: '', message: null };
  const internet = texteCourt(d.internet, QUESTION_INTERNET_MAX) ?? '';
  return internet ? { reponse: '', lectures: [], internet, message: null } : { reponse, lectures: [], internet: '', message: null };
}

/* ── 1 ter. PRÉPARER UNE RÉPONSE (21 novembre 2026, « le second lot ») ────
   « Réponds à Awa que jeudi 10 h est libre. » Perle n'écrit pas la réponse
   dans son plan : elle dit À QUI et QUOI, et le Trône fait le reste par la
   porte qui existait (le chantier `reponse-wa`, la voix de la Maison, le fil,
   la fiche, le catalogue : `contexte-de-la-reponse`). Le brouillon s'ouvre
   dans la conversation, où « Envoyer » est le seul bouton de départ : la
   fenêtre de 24 heures, la pause d'Opale et la retenue y restent juges.
   RIEN NE PART D'ICI. */

/** Ce que la direction demande d'écrire : à qui, quoi, et la place qu'elle cite. */
export type MessageDemande = { cliente: string; plusAncienne: boolean; consigne: string; jour?: string; heure?: string };
/** La consigne de la direction, au plus (une phrase ou deux, pas le message). */
export const CONSIGNE_MAX = 400;

const REGLE_DES_MESSAGES = [
  'RÉPONDRE À UNE CLIENTE. Si la direction te demande d’écrire ou de répondre à une cliente sur WhatsApp (« réponds à… », « écris à… », « prépare une réponse pour… »), tu n’écris pas le message ici et tu ne refuses pas : préparer un brouillon n’est pas envoyer. Laisse « reponse » vide et « lectures » vide, et remplis « message ».',
  '« cliente » : son nom, tel que la direction l’a écrit. « plusAncienne » : true si elle ne nomme personne et parle de la conversation qui attend. « consigne » : ce que la réponse doit dire, dans les mots de la direction ; vide si elle n’a rien précisé. « jour » (AAAA-MM-JJ, compté depuis la date d’aujourd’hui) et « heure » (HH:MM) : seulement si elle cite une place de rendez-vous à proposer.',
  'Le Trône prépare alors le brouillon, vérifie la place au Carnet, et le montre à la direction : rien ne part sans elle. Une question SUR une conversation (« qu’a écrit… », « qui attend ? ») n’est pas une demande d’écrire : elle se lit.',
].join(' ');

const HEURE = /^([01]?\d|2[0-3])[:hH]([0-5]\d)$/;

/** LE MESSAGE DEMANDÉ, LU SANS RIEN CROIRE. Il n'existe que si la direction
    a nommé quelqu'un ou désigné la conversation qui attend : un objet vide,
    qu'un modèle remplit parfois par politesse, ne détourne pas une question. */
export function messageLu(brut: unknown): MessageDemande | null {
  const m = (brut && typeof brut === 'object' ? brut : null) as Record<string, unknown> | null;
  if (!m) return null;
  const cliente = texteCourt(m.cliente, 80) ?? '';
  const plusAncienne = m.plusAncienne === true && !cliente;
  if (!cliente && !plusAncienne) return null;
  const propre: MessageDemande = { cliente, plusAncienne, consigne: texteCourt(m.consigne, CONSIGNE_MAX) ?? '' };
  const jour = jourValide(m.jour);
  const h = typeof m.heure === 'string' ? HEURE.exec(m.heure.trim()) : null;
  /* Une heure sans son jour ne se vérifie pas : on ne garde la place qu'entière. */
  if (jour && h) { propre.jour = jour; propre.heure = `${h[1].padStart(2, '0')}:${h[2]}`; }
  return propre;
}

/** LA PLACE QUE LA DIRECTION CITE, JUGÉE AU CARNET avant que Claude n'écrive
    (l'heure promise à tort, c'est le rendez-vous d'un autre). Le Trône donne
    la fermeture et les heures libres du jour pour un rituel d'une heure ; le
    verdict se montre à la direction sur le brouillon. Sans place citée : rien. */
export type VerdictDeLaPlace = { etat: 'libre' | 'prise' | 'fermee' | 'passee'; jour: string; heure: string; dit: string };
export function verdictDeLaPlace(o: { jour?: string; heure?: string; aujourdhui: string; maintenantMin: number; ferme: boolean; heuresLibres: readonly string[] }): VerdictDeLaPlace | null {
  if (!o.jour || !o.heure) return null;
  const [h, min] = o.heure.split(':').map(Number);
  const quand = `${jourDeLaSemaine(o.jour)} ${dateDite(o.jour)}, ${heureEnClair(h * 60 + min)}`;
  const base = { jour: o.jour, heure: o.heure };
  if (o.jour < o.aujourdhui || (o.jour === o.aujourdhui && h * 60 + min <= o.maintenantMin)) {
    return { ...base, etat: 'passee', dit: `Attention : ${quand} est déjà passé. Vérifiez la date avant d’envoyer.` };
  }
  if (o.ferme) return { ...base, etat: 'fermee', dit: `Attention : la Maison est fermée le ${jourDeLaSemaine(o.jour)} ${dateDite(o.jour)}. Vérifiez avant d’envoyer.` };
  const libres = new Set(o.heuresLibres.map((x) => x.trim().padStart(5, '0')));
  return libres.has(o.heure)
    ? { ...base, etat: 'libre', dit: `Vérifié au Carnet : ${quand} est libre pour un rituel d’une heure.` }
    : { ...base, etat: 'prise', dit: `Attention : le Carnet ne montre pas ${quand} libre pour un rituel d’une heure. Vérifiez avant d’envoyer.` };
}

/** CE QUE LA DIRECTION VEUT VOIR DIT, ajouté au contexte de la réponse. Elle
    relira et enverra elle-même : ce qu'elle affirme (une place, un prix, une
    décision) peut se dire, même si le reste du contexte ne le montre pas.
    Sans consigne : rien, Claude répond au dernier message comme d'habitude. */
export function consigneDeLaDirection(consigne: string): string {
  const c = String(consigne ?? '').replace(/\s+/g, ' ').trim().slice(0, CONSIGNE_MAX);
  if (!c) return '';
  return [
    '',
    `LA DIRECTION, qui relira ce message et l’enverra elle-même, demande que la réponse dise ceci : « ${c} ».`,
    'Écris-le dans la voix de la Maison, sans rien y ajouter. Ce qu’elle affirme là (une place, une heure, un prix, une décision) est vrai : tu peux le dire à la cliente, même si le reste du contexte ne le montre pas.',
  ].join('\n');
}

/** Un fil, vu de Perle : de quoi le retrouver et juger s'il peut partir chez Claude. */
export type FilVu = { numero: string; clientId?: string; nom: string; sansFiche?: boolean; tiroir?: string; prive?: boolean; dernier: { quand: string } };

export type FilDeLaDemande<F> =
  | { etat: 'trouve'; fil: F }
  | { etat: 'plusieurs'; clientes: string[] }
  | { etat: 'sans-fil'; cliente: string }
  | { etat: 'ferme' }
  | { etat: 'aucune' }
  | { etat: 'rien-n-attend' };

/** À QUI RÉPONDRE. Les fiches reconnues par le Trône (sur le vrai texte de la
    question, et sur le nom rendu par le plan) désignent le fil ; à défaut, un
    fil sans fiche dont le nom de profil porte tous les mots dits. Deux
    clientes possibles : on demande laquelle, on ne choisit pas. Sans nom
    (« la plus ancienne ») : la conversation qui attend depuis le plus
    longtemps. Un fil privé, ou qui n'est pas celui d'une cliente, ne se
    prépare pas : il ne part jamais chez Claude (`filOuvertAClaude`). */
export function filDeLaDemande<F extends FilVu>(o: {
  demande: MessageDemande;
  /** Les fiches reconnues, la plus sûre d'abord ; `etiquette` : prénom et initiale. */
  trouvees: readonly { id: string; etiquette: string }[];
  fils: readonly F[];
  /** Les fils qui attendent une réponse, le plus ancien d'abord. */
  enAttente: readonly F[];
  /** Les fils déjà préparés dans cette conversation avec Perle (« La suivante »). */
  dejaPrepares?: readonly string[];
}): FilDeLaDemande<F> {
  const ouvert = (f: F): boolean => filOuvertAClaude(f);
  const leDernier = (liste: readonly F[]): F => [...liste].sort((a, b) => b.dernier.quand.localeCompare(a.dernier.quand))[0];
  if (!o.demande.cliente) {
    const faits = new Set(o.dejaPrepares ?? []);
    const suivante = o.enAttente.find((f) => ouvert(f) && !faits.has(f.numero));
    return suivante ? { etat: 'trouve', fil: suivante } : { etat: 'rien-n-attend' };
  }
  const avecFil = o.trouvees.map((c) => ({ c, fils: o.fils.filter((f) => f.clientId === c.id) })).filter((x) => x.fils.length);
  if (avecFil.length > 1) return { etat: 'plusieurs', clientes: avecFil.map((x) => x.c.etiquette) };
  if (avecFil.length === 1) {
    const siens = avecFil[0].fils;
    const lisibles = siens.filter(ouvert);
    return lisibles.length ? { etat: 'trouve', fil: leDernier(lisibles) } : { etat: 'ferme' };
  }
  if (o.trouvees.length) return { etat: 'sans-fil', cliente: o.trouvees[0].etiquette };
  /* Aucune fiche : un numéro sans fiche, par le nom que WhatsApp annonce. */
  const dits = motsDe(o.demande.cliente).filter((m) => m.length >= 3);
  const parProfil = dits.length ? o.fils.filter((f) => f.sansFiche === true && dits.every((d) => motsDe(f.nom).includes(d))) : [];
  if (parProfil.length > 1) return { etat: 'plusieurs', clientes: parProfil.map(() => 'un numéro sans fiche') };
  if (parProfil.length === 1) return ouvert(parProfil[0]) ? { etat: 'trouve', fil: parProfil[0] } : { etat: 'ferme' };
  return { etat: 'aucune' };
}

/** Les conversations qu'on peut encore préparer : celles qui attendent, lisibles
    par Claude, pas déjà préparées dans cette conversation avec Perle. */
export const resteAPreparer = <F extends FilVu>(enAttente: readonly F[], dejaPrepares: readonly string[]): F[] =>
  enAttente.filter((f) => filOuvertAClaude(f) && !dejaPrepares.includes(f.numero));

/** SON DERNIER MESSAGE, tel que la carte du brouillon le montre à la direction
    (sur son poste : rien de ceci ne part chez Claude). Une photo, un vocal
    sans légende se disent par leur nature. Aucun message d'elle : vide. */
export function dernierMessageDElle(messages: readonly { sens: string; texte?: string; type?: string; quand: string }[]): { texte: string; quand: string } | null {
  const m = [...messages].reverse().find((x) => x.sens === 'entrant');
  if (!m) return null;
  const NATURE: Record<string, string> = { image: 'une photo', video: 'une vidéo', audio: 'un message vocal', document: 'un document', sticker: 'un autocollant', location: 'sa position' };
  const mots = String(m.texte ?? '').replace(/\s+/g, ' ').trim();
  const texte = mots || (m.type && NATURE[m.type] ? `(${NATURE[m.type]})` : '(un message sans texte)');
  return { texte: texte.length > 320 ? `${texte.slice(0, 319).trimEnd()}…` : texte, quand: m.quand };
}

/** CE QUE PERLE DIT QUAND ELLE NE PRÉPARE RIEN, et l'écran où la direction agit. */
export function refusDuMessage(r: Exclude<FilDeLaDemande<unknown>, { etat: 'trouve' }>, nomDit: string): string {
  const qui = nomDit.trim() || 'cette cliente';
  switch (r.etat) {
    case 'plusieurs': return `Plusieurs conversations répondent à « ${qui} » : ${r.clientes.join(', ')} ; redites-moi son nom en entier, et je prépare la réponse.`;
    case 'sans-fil': return `${r.cliente} n’a aucune conversation WhatsApp avec la Maison : il n’y a pas de message auquel répondre. Sa fiche permet de lui écrire par un modèle.`;
    case 'ferme': return 'Cette conversation est marquée privée, ou n’est pas celle d’une cliente : je ne la lis pas. Elle se répond dans Conversations.';
    case 'rien-n-attend': return 'Aucune conversation n’attend de réponse en ce moment.';
    default: return `Je ne trouve aucune conversation au nom de « ${qui} ». Vérifiez le nom, ou ouvrez Conversations.`;
  }
}

/* ── 1 bis. INTERNET (21 novembre 2026, « oui internet ») ───────────────── */

/** La question cherchée sur internet, au plus (une phrase, pas un dossier). */
export const QUESTION_INTERNET_MAX = 400;

const REGLES_D_INTERNET = [
  'Tu es Perle, l’assistante de Maison MND, une maison de soins des locks à Cotonou, au Bénin. Tu réponds à sa direction.',
  'Tu cherches sur internet, puis tu réponds avec ce que tu y as trouvé. Quand la réponse dépend du pays, cherche d’abord ce qui vaut au Bénin (franc CFA, zone UEMOA).',
  'Français simple, phrases courtes. Jamais de tiret cadratin : une virgule à la place. Pas d’emoji. Pas de mise en forme : ni astérisques, ni dièses, ni tableaux, ni adresse de page dans le texte (le Trône affiche les sources). Une liste s’écrit une ligne par élément, chacune commençant par un tiret et une espace.',
  'Ne présente comme sûr que ce que les sources disent. Si elles se contredisent, si elles datent, ou si tu ne trouves pas, dis-le. Donne la date de l’information quand elle compte (un taux, un prix, une loi).',
  'Nomme le site d’où vient un chiffre ou une règle, dans la phrase.',
  'Pour le droit, l’impôt, la santé : c’est une information, pas un conseil. Termine par une phrase qui invite à le confirmer à la source officielle ou auprès d’un professionnel.',
  'Ne cherche jamais le nom d’une personne privée (une cliente, quelqu’un de l’équipe). Si la question en porte un, réponds sans lui.',
  'La réponse d’abord, puis ce qui l’explique. Huit phrases au plus.',
].join('\n');

/** UN TEXTE QUI PART SUR INTERNET NE PORTE AUCUNE CLIENTE. Chez Claude, une
    cliente se dit « Awa K. » ; sur un moteur de recherche, même cela est de
    trop. Chaque étiquette connue de la Maison (prénom et initiale) devient
    « une cliente », les plus longues d'abord. Un prénom seul, lui, reste :
    c'est un mot de tous les jours. */
export function sansLesClientes(texte: string, etiquettes: readonly string[]): string {
  let t = String(texte ?? '');
  const connues = [...new Set(etiquettes.map((e) => e.trim()).filter((e) => /\s\S+\.$/.test(e)))].sort((a, b) => b.length - a.length);
  for (const e of connues) {
    const motif = e.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    t = t.replace(new RegExp(`(^|[^\\p{L}])${motif}(?=$|[^\\p{L}])`, 'giu'), (_m, avant: string) => `${avant}une cliente`);
  }
  return t;
}

/** LES SOURCES, LUES SANS RIEN CROIRE : des adresses web seulement (jamais
    un `javascript:` qu'un lien ouvrirait), sans doublon, six au plus ; une
    source sans titre porte le nom de son site. */
export function sourcesPropres(brut: unknown): { titre: string; url: string }[] {
  const vues = new Map<string, string>();
  for (const s of Array.isArray(brut) ? brut : []) {
    const url = s && typeof s === 'object' ? (s as { url?: unknown }).url : null;
    if (typeof url !== 'string' || !/^https?:\/\/[^\s<>"']+$/i.test(url) || vues.has(url) || vues.size >= 6) continue;
    const titre = (s as { titre?: unknown }).titre;
    let site = url;
    try { site = new URL(url).hostname.replace(/^www\./, ''); } catch { /* l'adresse reste telle quelle */ }
    vues.set(url, typeof titre === 'string' && titre.trim() && titre.trim() !== url ? titre.trim().slice(0, 140) : site);
  }
  return [...vues].map(([url, titre]) => ({ titre, url }));
}

/** LA RECHERCHE : la question seule, sans rien de la Maison (ni le fil « En
    direct », ni les tours d'avant, où une cliente a pu être nommée). */
export function demandeDInternet(o: { question: string; jour: string; minutes: number }): DemandeIa {
  return {
    chantier: CHANTIER_DE_PERLE,
    usage: 'texte',
    web: true,
    systeme: [REGLES_D_INTERNET, `Nous sommes le ${momentDit(o.jour, o.minutes)}.`].join('\n\n'),
    messages: [{ role: 'user', content: o.question.trim().slice(0, QUESTION_INTERNET_MAX) }],
  };
}

/* ── 2. LA RÉPONSE ──────────────────────────────────────────────────────── */

/** Un fait lu : la lecture qui l'a rendu, son titre et son texte, déjà anonymisé. */
export type FaitLu = { lecture: NomDeLecture; titre: string; texte: string; lien?: string };

/** LES FAITS, BORNÉS : chaque lecture garde sa part ; ce qui dépasse est
    coupé à la ligne, et la coupe se dit (Perle ne conclut pas d'un silence). */
export function faitsEnTexte(faits: readonly FaitLu[], max = SIGNES_DE_FAITS_MAX): string {
  if (!faits.length) return '';
  const part = Math.max(800, Math.floor(max / faits.length));
  return faits.map((f) => {
    let texte = f.texte.trim();
    if (texte.length > part) {
      const coupe = texte.slice(0, part);
      texte = `${coupe.slice(0, Math.max(coupe.lastIndexOf('\n'), 200))}\n(la suite n’est pas montrée : la liste est plus longue)`;
    }
    return `## ${f.titre}\n${texte}`;
  }).join('\n\n');
}

/** LA RÉPONSE : la question et les faits lus, rien d'autre. */
export function demandeDeLaReponse(o: { question: string; jour: string; minutes: number; enDirect: string; faits: readonly FaitLu[]; avant?: readonly MessageIa[] }): DemandeIa {
  return {
    chantier: CHANTIER_DE_PERLE,
    usage: 'texte',
    systeme: [
      REGLES_DE_PERLE,
      `Nous sommes le ${momentDit(o.jour, o.minutes)}.`,
      'Réponds à la question avec les seuls faits ci-dessous, lus dans le Trône à l’instant.',
      `FAITS EN DIRECT :\n${o.enDirect || '(aucun)'}`,
      `FAITS LUS :\n${faitsEnTexte(o.faits) || '(aucun)'}`,
    ].join('\n\n'),
    messages: [...toursDAvant(o.avant ?? []), { role: 'user', content: o.question.trim().slice(0, 1200) }],
    maxTokens: 900,
  };
}

/** CE QUE L'ÉCRAN MONTRE DE LA RÉPONSE : le tiret cadratin devient une
    virgule (règle de la Maison), les marques de mise en forme tombent. */
const CADRATIN = new RegExp(`\\s*${String.fromCharCode(8212)}\\s*`, 'g');
export const reponsePropre = (texte: string): string =>
  String(texte ?? '').replace(CADRATIN, ', ').replace(/\*\*|__|^#{1,6}\s+/gm, '').replace(/(\p{L})'(?=\p{L})/gu, '$1’').replace(/\n{3,}/g, '\n\n').trim();

/** « Lu dans : La journée, Le Carnet » : les écrans des lectures faites, sans doublon. */
export function ecransLus(faits: readonly Pick<FaitLu, 'lecture' | 'lien'>[]): { nom: string; chemin: string }[] {
  const vus = new Map<string, { nom: string; chemin: string }>();
  for (const f of faits) {
    const e = LECTURES[f.lecture];
    const chemin = f.lien ?? e.ecran;
    if (!vus.has(chemin)) vus.set(chemin, { nom: f.lien && f.lecture === 'cliente' ? 'Sa fiche' : e.nomEcran, chemin });
  }
  return [...vus.values()];
}

/* ── LES MONTANTS DITS À PERLE ─────────────────────────────────────────── */

/** UN MONTANT DANS LES FAITS. La porte efface tout ce qui ressemble à un
    numéro de téléphone (huit chiffres ou plus, `sansCoordonnees`) : écrit
    « 12 500 000 F », un montant de dix millions et plus arriverait chez
    Perle en « [numéro] F ». Il se dit donc « 12 millions 500 000 F ». */
export function francsPourPerle(xof: number): string {
  const n = Math.round(Number(xof) || 0);
  if (Math.abs(n) < 10_000_000) return francsDits(n);
  const millions = Math.trunc(Math.abs(n) / 1_000_000);
  const reste = Math.abs(n) % 1_000_000;
  return `${n < 0 ? '−' : ''}${millions} millions${reste ? ` ${francsDits(reste).replace(/\sF$/, '')}` : ''} F`;
}

/* ── LES BORNES DES LECTURES ───────────────────────────────────────────── */

const plusJours = (iso: string, n: number): string => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
export const dernierJourDuMois = (mois: string): string => {
  const [a, m] = mois.split('-').map(Number);
  return new Date(Date.UTC(a, m, 0, 12)).toISOString().slice(0, 10);
};
export const moisDAvant = (mois: string): string => {
  const [a, m] = mois.split('-').map(Number);
  return new Date(Date.UTC(a, m - 2, 1, 12)).toISOString().slice(0, 7);
};

/** LA FENÊTRE D'UNE LECTURE DE RENDEZ-VOUS : du jour demandé (ou aujourd'hui),
    sept jours au plus, dans l'ordre. */
export function fenetreDesRendezVous(l: Pick<LectureDemandee, 'du' | 'au' | 'jour'>, aujourdhui: string): { du: string; au: string } {
  const du = l.du ?? l.jour ?? aujourdhui;
  let au = l.au ?? du;
  if (au < du) au = du;
  const borne = plusJours(du, 6);
  return { du, au: au > borne ? borne : au };
}

/** LA FENÊTRE DES DÉPENSES : les jours demandés, sinon le mois en cours ; 92 jours au plus. */
export function fenetreDesDepenses(l: Pick<LectureDemandee, 'du' | 'au' | 'mois'>, aujourdhui: string): { du: string; au: string } {
  const mois = l.mois ?? aujourdhui.slice(0, 7);
  const du = l.du ?? `${mois}-01`;
  let au = l.au ?? (l.du ? aujourdhui : dernierJourDuMois(mois));
  if (au < du) au = du;
  const borne = plusJours(du, 91);
  return { du, au: au > borne ? borne : au };
}

/* ── RETROUVER UNE CLIENTE PAR LE NOM QU'ON A DIT ──────────────────────── */

const sansAccent = (s: string): string => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLocaleLowerCase('fr');
const motsDe = (s: string): string[] => sansAccent(s).split(/[^a-z0-9]+/).filter(Boolean);

/** LES FICHES QUI RÉPONDENT À UN NOM DIT (« Awa », « Awa K. », « Kossou Awa ») :
    chaque mot du nom dit doit se retrouver dans le nom de la fiche ; une
    initiale (« K. ») vaut le début d'un mot. Les fiches qui portent tous les
    mots en entier passent devant ; trois au plus. Rien de reconnu : aucune. */
export function clientesDuNom<C extends { id: string; name: string }>(nomDit: string, fiches: readonly C[], max = 3): C[] {
  const dits = motsDe(nomDit).filter((m) => !['mme', 'mlle', 'm', 'mr', 'madame', 'monsieur', 'la', 'le', 'de'].includes(m));
  if (!dits.length) return [];
  const notees: { c: C; note: number }[] = [];
  for (const c of fiches) {
    const mots = motsDe(c.name);
    if (!mots.length) continue;
    let note = 0;
    let tous = true;
    for (const d of dits) {
      if (mots.includes(d)) note += 2;
      else if (d.length === 1 ? mots.some((m, i) => i > 0 && m.startsWith(d)) : mots.some((m) => m.startsWith(d) && d.length >= 3)) note += 1;
      else { tous = false; break; }
    }
    if (tous) notees.push({ c, note });
  }
  return notees.sort((a, b) => b.note - a.note || a.c.name.localeCompare(b.c.name, 'fr')).slice(0, max).map((x) => x.c);
}

const PARTICULES = new Set(['de', 'du', 'des', 'la', 'le', 'les', 'da', 'do', 'dos', 'das', 'di', 'del', 'van', 'von', 'der', 'den', 'ben', 'bin', 'el', 'al', 'et', 'ep', 'epse', 'nee']);

/** LES CLIENTES NOMMÉES DANS UN TEXTE LIBRE (la question, telle que la
    direction l'a écrite) : un nom de famille d'au moins quatre lettres s'y
    lit en entier ; le prénom à côté la fait passer devant. Le prénom seul ne
    suffit pas (il part tel quel, et vingt fiches le portent). Trois au plus.
    C'est le Trône qui reconnaît, sur le vrai texte : Claude, lui, ne reçoit
    que « Awa K. », et son écho ne suffirait pas à la retrouver. */
export function clientesDeLaQuestion<C extends { id: string; name: string }>(texte: string, fiches: readonly C[], max = 3): C[] {
  const mots = new Set(motsDe(texte));
  if (!mots.size) return [];
  const notees: { c: C; note: number }[] = [];
  for (const c of fiches) {
    const m = motsDe(c.name);
    if (m.length < 2) continue;
    const noms = m.slice(1).filter((n) => n.length >= 4 && !PARTICULES.has(n));
    const vus = noms.filter((n) => mots.has(n)).length;
    if (!vus) continue;
    notees.push({ c, note: vus * 2 + (mots.has(m[0]) ? 3 : 0) });
  }
  return notees.sort((a, b) => b.note - a.note || a.c.name.localeCompare(b.c.name, 'fr')).slice(0, max).map((x) => x.c);
}

/** À QUI LA DIRECTION VEUT ÉCRIRE. Le plan rend le nom comme Claude l'a lu
    (« Awa K. ») : il désigne parfois plusieurs fiches. La question, sur son
    vrai texte, porte le nom entier : les fiches que les DEUX reconnaissent
    passent seules. À défaut celles du nom dit, à défaut celles de la question
    (jamais les deux listes mêlées : une autre cliente citée dans la consigne
    ne devient pas la destinataire). */
export function clientesDuMessage<C extends { id: string; name: string }>(nomDit: string, question: string, fiches: readonly C[]): C[] {
  if (!nomDit.trim()) return [];
  const parLeNom = clientesDuNom(nomDit, fiches, 6);
  const parLaQuestion = clientesDeLaQuestion(question, fiches, 6);
  const communes = parLeNom.filter((c) => parLaQuestion.some((x) => x.id === c.id));
  return communes.length ? communes : parLeNom.length ? parLeNom : parLaQuestion;
}

/* ── EN DIRECT : le fil que le Trône calcule seul, sans IA ──────────────── */

export type RdvDuJour = { id: string; heureMin: number; dureeMin: number; maitre: string; status: string };

/** AU FAUTEUIL : les rendez-vous du jour commencés et pas finis à l'heure
    qu'il est, encore « confirmé » (honoré ou annulé, il a quitté le fauteuil). */
export function auFauteuil(rdvs: readonly RdvDuJour[], minutes: number): RdvDuJour[] {
  return rdvs
    .filter((r) => r.status === 'confirmé' && r.heureMin <= minutes && minutes < r.heureMin + Math.max(15, r.dureeMin))
    .sort((a, b) => a.heureMin - b.heureMin);
}

/** ENCORE ATTENDUES : les rendez-vous du jour qui n'ont pas commencé. */
export const encoreAttendues = (rdvs: readonly RdvDuJour[], minutes: number): RdvDuJour[] =>
  rdvs.filter((r) => (r.status === 'confirmé' || r.status === 'en attente') && r.heureMin > minutes).sort((a, b) => a.heureMin - b.heureMin);

export type FaitsEnDirect = {
  jour: string;
  minutes: number;
  /** L'argent entré aujourd'hui, pourboires à part. */
  encaisseXof: number;
  pourboiresXof: number;
  aEncaisser: { n: number; xof: number };
  rdvs: readonly RdvDuJour[];
  /** Les conversations qui attendent, et depuis combien de minutes pour la plus ancienne. */
  sansReponse: { n: number; plusAncienneMin: number | null };
  /** La Maison est fermée aujourd'hui. */
  ferme: boolean;
  /** Les heures encore libres aujourd'hui pour une heure de rituel. */
  placesLibres: readonly string[];
  /** Les suggestions à venir sans réponse d'elle. */
  aConfirmer: number;
};

export type LigneEnDirect = { cle: string; titre: string; detail: string; ecran?: string; geste?: string };

/** UNE DURÉE NE SE LIT JAMAIS COMME UNE HEURE (21 novembre 2026, premier essai
    en ligne). Le fil disait « attend depuis 13 h 52 » pour treize heures
    d'attente, et Perle a répondu « depuis 13 h 52 hier ». Une durée porte donc
    ses minutes ou son mot : « 20 min », « 13 h 52 min », « 2 heures ». */
export const dureeEnClair = (min: number): string => {
  const m = Math.max(0, Math.round(min));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  return m % 60 ? `${h} h ${String(m % 60).padStart(2, '0')} min` : `${h} heure${h > 1 ? 's' : ''}`;
};
const heureCourte = (hhmm: string): string => {
  const m = /^(\d{1,2}):(\d{2})/.exec(hhmm);
  return m ? (m[2] === '00' ? `${Number(m[1])} h` : `${Number(m[1])} h ${m[2]}`) : hhmm;
};
const minutesCourtes = (min: number): string => heureCourte(`${Math.floor(min / 60)}:${String(min % 60).padStart(2, '0')}`);

/** LE FIL « EN DIRECT ». Chaque ligne dit un fait et son détail ; une ligne
    sans rien à dire ne s'affiche pas, sauf l'argent du jour, toujours là. */
export function lignesEnDirect(f: FaitsEnDirect): LigneEnDirect[] {
  const lignes: LigneEnDirect[] = [];
  lignes.push({
    cle: 'encaisse', titre: `Encaissé aujourd’hui : ${francsDits(f.encaisseXof)}`,
    detail: f.pourboiresXof > 0 ? `Pourboires à part : ${francsDits(f.pourboiresXof)}` : 'Tout ce qui est entré depuis ce matin',
    ecran: '/la-journee', geste: 'Voir La journée',
  });
  if (f.aEncaisser.n > 0) {
    lignes.push({
      cle: 'a-encaisser', titre: `À encaisser : ${francsDits(f.aEncaisser.xof)}`,
      detail: `${f.aEncaisser.n} rituel${f.aEncaisser.n > 1 ? 's' : ''} commencé${f.aEncaisser.n > 1 ? 's' : ''} ou terminé${f.aEncaisser.n > 1 ? 's' : ''}, sans règlement`,
      ecran: '/caisse', geste: 'Encaisser',
    });
  }
  const fauteuil = auFauteuil(f.rdvs, f.minutes);
  if (fauteuil.length) {
    lignes.push({
      cle: 'fauteuil', titre: `Au fauteuil : ${fauteuil.length}`,
      detail: fauteuil.map((r) => `${r.maitre || 'La Maison'} depuis ${minutesCourtes(r.heureMin)}`).join(' · '),
      ecran: '/carnet', geste: 'Voir au Carnet',
    });
  }
  const attendues = encoreAttendues(f.rdvs, f.minutes);
  if (attendues.length) {
    lignes.push({
      cle: 'attendues', titre: `Encore attendue${attendues.length > 1 ? 's' : ''} aujourd’hui : ${attendues.length}`,
      detail: attendues.slice(0, 4).map((r) => minutesCourtes(r.heureMin)).join(', ') + (attendues.length > 4 ? '…' : ''),
      ecran: '/carnet', geste: 'Voir au Carnet',
    });
  }
  if (f.sansReponse.n > 0) {
    lignes.push({
      cle: 'sans-reponse', titre: `${f.sansReponse.n} conversation${f.sansReponse.n > 1 ? 's' : ''} sans réponse`,
      detail: f.sansReponse.plusAncienneMin !== null ? `La plus ancienne attend depuis ${dureeEnClair(f.sansReponse.plusAncienneMin)}` : 'Elles attendent une réponse de la Maison',
      ecran: '/conversations', geste: 'Répondre',
    });
  }
  if (f.ferme) {
    lignes.push({ cle: 'places', titre: 'La Maison est fermée aujourd’hui', detail: 'Aucune place ne se propose', ecran: '/carnet' });
  } else {
    lignes.push({
      cle: 'places', titre: f.placesLibres.length ? 'Places libres aujourd’hui' : 'Plus de place libre aujourd’hui',
      detail: f.placesLibres.length ? `${f.placesLibres.slice(0, 4).map(heureCourte).join(', ')}${f.placesLibres.length > 4 ? '…' : ''}, pour une heure` : 'Pour un rituel d’une heure',
      ecran: '/carnet', geste: 'Voir au Carnet',
    });
  }
  if (f.aConfirmer > 0) {
    lignes.push({
      cle: 'a-confirmer', titre: `${f.aConfirmer} rendez-vous suggéré${f.aConfirmer > 1 ? 's' : ''} sans réponse`,
      detail: 'Proposés par la Maison, elle n’a pas encore dit oui',
      ecran: '/carnet', geste: 'Voir au Carnet',
    });
  }
  return lignes;
}

/** Le fil, dit à Perle : une ligne par fait. */
export const enDirectEnTexte = (lignes: readonly LigneEnDirect[]): string =>
  lignes.map((l) => `- ${l.titre}${l.detail ? ` (${l.detail})` : ''}`).join('\n');

/* ── LES QUESTIONS PROPOSÉES ───────────────────────────────────────────── */

export const QUESTIONS_PROPOSEES: readonly string[] = [
  'La journée en trois phrases',
  'Qui vient demain ?',
  'Qui doit encore de l’argent ?',
  'Comment va le mois ?',
];
