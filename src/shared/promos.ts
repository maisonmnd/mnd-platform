import { createStore, useStore, uid } from './store';
import { bindCollection } from './sync';

/* ══ LES CODES DE PROMOTION — 14 septembre 2026 ══════════════════════

   « Des promos flash avec des codes de réductions ? » (Yéman).

   ENVOYER « −15 % AVEC LE CODE ÉCLAT15 » EST FACILE. Le faire reconnaître à
   la caisse est le vrai chantier : il faut que le code EXISTE, qu'il
   s'applique AU BON PRIX, qu'il ne serve PAS TROIS FOIS, et que la trace dise
   QUI l'a accepté. Ce fichier est le juge unique de ces quatre questions.

   UN CODE PAR CLIENTE, À USAGE UNIQUE (décision du 14 septembre). Un code
   partagé circule : il part dans un groupe WhatsApp, revient six fois, et la
   Maison ne sait plus combien elle a remisé ni à qui. Celui-ci NOMME sa
   destinataire — il ne vaut rien sur une autre tête — expire seul au bout de
   48 heures, et se ferme à la première pièce qui l'honore.

   TROIS PORTES, UNE SEULE RÈGLE. L'encaissement, le rendez-vous et la
   réservation dans Ma Couronne interrogent tous `pourquoiLeCodeNeVautPas` et
   `remiseDuCode`. Aucune surface ne réécrit la règle : trois copies d'une
   règle d'argent finissent toujours par diverger, et c'est la caisse qui
   paie la divergence.

   LE REFUS DIT POURQUOI. « Code invalide » fait accuser la caisse et la
   cliente s'énerve au comptoir. « Déjà utilisé le 15 septembre », « expiré
   mardi à 14 h », « ce code appartient à une autre cliente » se discutent en
   dix secondes. */

export type CodePromo = {
  id: string;
  branchId: string;
  /** LE CODE TEL QU'IL S'ÉCRIT — « ECLAT15-A7K ». Il se COMPARE toujours par
      `normaliseLeCode` : une cliente qui tape en minuscules, avec ou sans le
      tiret, avec ou sans accent, doit être reconnue. Être strict sur ce
      qu'on écrit, libéral sur ce qu'on accepte. */
  code: string;
  /** LA TÊTE À QUI IL APPARTIENT. Sans elle, ce code n'existe pas : c'est ce
      champ qui fait la différence entre une promo nominative et un bon de
      réduction qui circule. */
  clientId: string;
  /** Le nom au moment de l'envoi — pour que le registre se lise sans
      rejoindre les fiches, et reste lisible si la fiche est archivée. */
  clientNom?: string;

  /* ── L'AVANTAGE : L'UN OU L'AUTRE, JAMAIS LES DEUX ──
     Un code qui porterait « −15 % ET −2 000 F » n'aurait pas de sens unique :
     dans quel ordre ? sur quelle base ? `avantageDuCode` refuserait de
     répondre. La fabrication l'interdit, et la lecture prend le pourcentage
     si les deux traînent sur une ligne ancienne. */
  remisePct?: number;
  remiseXof?: number;

  /** CE QU'IL COUVRE. Absent = tout le rituel. Renseigné = cette prestation
      seule, et la remise ne mord que sur sa part. */
  serviceId?: string;

  /** ISO complet — l'instant, pas le jour. Une promo de 48 heures posée à
      14 h meurt à 14 h, pas à minuit. */
  creeLe: string;
  expireLe: string;
  /** Qui l'a fabriqué, côté Maison. */
  parQui?: string;
  /** Le mot qui accompagne, tel qu'il est parti dans le message. */
  note?: string;

  /* ── CE QUI LE FERME, ÉCRIT UNE SEULE FOIS ──
     La première pièce qui l'honore le consomme. Ces champs ne se réécrivent
     jamais : un code rouvert serait un code à usage multiple qui s'ignore. */
  utiliseLe?: string;
  utilisePar?: string;
  /** La pièce qui l'a honoré — numéro de facture, ou identifiant de rituel. */
  surPiece?: string;
  /** CE QU'IL A RÉELLEMENT REMISÉ, en francs. Sans lui, le registre ne sait
      pas ce que les promos ont coûté : un pourcentage sans sa base ne se
      totalise pas. */
  remiseReelleXof?: number;
};

/** LA DURÉE DE DÉPART — 48 heures (décision du 14 septembre 2026).

    Une promo flash tire sa force de sa fin : « jusqu'à mardi 14 h » fait
    revenir, « quand vous voulez » ne fait rien. Deux jours laissent le temps
    d'un week-end sans laisser le temps d'oublier. */
export const HEURES_DE_LA_PROMO = 48;

/** LE MAXIMUM QU'UN CODE PUISSE REMISER, en pourcentage. Au-delà, ce n'est
    plus une promotion, c'est un cadeau — et un cadeau se décide, il ne se
    tape pas dans un champ à la volée. */
export const REMISE_MAX_PCT = 50;

/* ── L'ALPHABET DU SUFFIXE ────────────────────────────────────────────
   NI ZÉRO NI O, NI UN NI I NI L. Un code se lit sur un écran de téléphone,
   se recopie à la main sur un carnet, et se retape au comptoir : les paires
   ambiguës produisent des refus que personne ne comprend, et c'est la caisse
   qu'on accuse. Vingt-huit signes suffisent largement. */
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

/** LA COMPARAISON EST LIBÉRALE, L'ÉCRITURE EST STRICTE.

    On enlève les accents, on met en capitales, et on jette tout ce qui n'est
    ni lettre ni chiffre. « éclat15-a7k », « ECLAT15 A7K » et « eclat15a7k »
    désignent donc le même code — parce qu'ils le désignent vraiment, et
    qu'un refus pour un tiret serait une insulte au comptoir. */
export const normaliseLeCode = (brut: string | undefined): string =>
  (brut ?? '')
    .normalize('NFD')
    /* L'intervalle des signes combinants (U+0300 à U+036F) : ce que `NFD`
       vient de détacher des lettres accentuées. Le harnais le vérifie sur
       « ÉCLAT », pour qu'un éditeur qui rencoderait le fichier se fasse voir. */
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');

const tireDeLAlphabet = (n: number): string => {
  let s = '';
  for (let i = 0; i < n; i += 1) s += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  return s;
};

/** LE PRÉFIXE, TIRÉ DU MOT DE LA MAISON. « Éclat » et 15 % donnent ECLAT15.
    Les accents tombent ici, pas à la lecture : le code ÉCRIT reste tapable
    sur n'importe quel clavier, et `normaliseLeCode` rattrape le reste. */
export const prefixeDuCode = (mot: string, pct?: number): string => {
  const m = normaliseLeCode(mot).slice(0, 10) || 'PROMO';
  return pct && pct > 0 ? `${m}${Math.round(pct)}` : m;
};

/** L'INSTANT OÙ LA PROMO MEURT, depuis l'instant où elle naît. */
export const expirationDe = (creeLe: string, heures = HEURES_DE_LA_PROMO): string =>
  new Date(Date.parse(creeLe) + heures * 3600_000).toISOString();

export type AFabriquer = {
  branchId: string;
  clientId: string;
  clientNom?: string;
  mot: string;
  remisePct?: number;
  remiseXof?: number;
  serviceId?: string;
  heures?: number;
  parQui?: string;
  note?: string;
  /** L'instant de la fabrication — injecté pour que le harnais soit stable. */
  maintenant?: string;
};

/** CE QUI EMPÊCHE DE FABRIQUER. La fabrication échoue FERMÉE : sans tête,
    sans avantage, ou avec un avantage déraisonnable, aucun code ne naît.
    Un code mal formé se découvrirait au comptoir, devant la cliente. */
export function pourquoiOnNePeutPasFabriquer(a: AFabriquer): string | null {
  if (!a.clientId) return 'Un code appartient à une tête : rattachez d’abord ce fil à une fiche.';
  const pct = Number(a.remisePct ?? 0);
  const xof = Number(a.remiseXof ?? 0);
  if (pct > 0 && xof > 0) return 'Choisissez un pourcentage OU un montant, pas les deux.';
  if (pct <= 0 && xof <= 0) return 'Une promotion sans avantage n’est pas une promotion.';
  if (pct > REMISE_MAX_PCT) return `Au-delà de ${REMISE_MAX_PCT} %, ce n’est plus une promotion : cela se décide, cela ne se tape pas.`;
  if (xof < 0) return 'Un montant de remise ne peut pas être négatif.';
  if ((a.heures ?? HEURES_DE_LA_PROMO) <= 0) return 'Une promotion doit durer au moins une heure.';
  return null;
}

/** FABRIQUE UN CODE. Le suffixe est tiré au sort ; l'appelant lui donne les
    codes DÉJÀ POSÉS pour qu'aucun ne se répète — deux codes identiques sur
    deux têtes rendraient « ce code appartient à une autre cliente »
    incompréhensible. */
export function fabriqueLeCode(a: AFabriquer, deja: readonly CodePromo[] = []): CodePromo {
  const creeLe = a.maintenant ?? new Date().toISOString();
  const pris = new Set(deja.map((c) => normaliseLeCode(c.code)));
  const prefixe = prefixeDuCode(a.mot, a.remisePct);
  let code = `${prefixe}-${tireDeLAlphabet(3)}`;
  /* VINGT ESSAIS, PUIS UN SUFFIXE PLUS LONG. Vingt-neuf mille suffixes de
     trois signes se heurtent rarement, mais « rarement » n'est pas « jamais »
     et une boucle sans sortie est une faute. */
  for (let i = 0; i < 20 && pris.has(normaliseLeCode(code)); i += 1) code = `${prefixe}-${tireDeLAlphabet(3)}`;
  if (pris.has(normaliseLeCode(code))) code = `${prefixe}-${tireDeLAlphabet(5)}`;
  return {
    id: uid(),
    branchId: a.branchId,
    clientId: a.clientId,
    clientNom: a.clientNom,
    code,
    remisePct: a.remisePct && a.remisePct > 0 ? Math.round(a.remisePct) : undefined,
    remiseXof: a.remiseXof && a.remiseXof > 0 ? Math.round(a.remiseXof) : undefined,
    serviceId: a.serviceId,
    creeLe,
    expireLe: expirationDe(creeLe, a.heures ?? HEURES_DE_LA_PROMO),
    parQui: a.parQui,
    note: a.note,
  };
}

/* ══ LA LECTURE — le juge des trois portes ═══════════════════════════ */

/** LE CODE DÉSIGNÉ PAR CE QU'ON A TAPÉ, sans juger encore s'il vaut. */
export const codeDit = (
  tape: string, codes: readonly CodePromo[], branchId?: string,
): CodePromo | undefined => {
  const n = normaliseLeCode(tape);
  if (!n) return undefined;
  return codes.find((c) => normaliseLeCode(c.code) === n && (!branchId || c.branchId === branchId));
};

export const estUtilise = (c: CodePromo): boolean => !!c.utiliseLe;

export const estExpire = (c: CodePromo, maintenant: string): boolean =>
  Date.parse(c.expireLe) <= Date.parse(maintenant);

/** LE JOUR ET L'HEURE, DITS COMME AU COMPTOIR. « mardi 16 septembre à 14 h ».
    Un refus qui donne l'heure se vérifie ; un refus qui dit « expiré » se
    conteste.

    À L'HEURE DU SALON, PAS À CELLE DE L'APPAREIL. Un code expire à Cotonou.
    Un poste réglé sur un autre fuseau — un téléphone en voyage, un navigateur
    mal configuré — annoncerait une autre heure à la cliente, et le refus
    deviendrait indéfendable. Même règle que `momentDuRdv` : UTC+1, sans
    heure d'été, parce que le Bénin n'en a pas. */
export const HEURE_DU_SALON_MS = 3600_000;

export const instantDit = (iso: string): string => {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return 'une date inconnue';
  const d = new Date(t + HEURE_DU_SALON_MS);
  const jours = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
  const mois = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
  const h = d.getUTCHours();
  const m = d.getUTCMinutes();
  const heure = m === 0 ? `${h} h` : `${h} h ${String(m).padStart(2, '0')}`;
  return `${jours[d.getUTCDay()]} ${d.getUTCDate()} ${mois[d.getUTCMonth()]} à ${heure}`;
};

/** POURQUOI CE CODE NE VAUT PAS — la phrase du comptoir, ou `null` s'il vaut.

    L'ORDRE DES REFUS EST VOULU. On dit d'abord qu'il n'existe pas (une faute
    de frappe se corrige), puis qu'il n'est pas à elle (c'est une erreur de
    personne, pas de code), puis qu'il est consommé, et enfin qu'il est
    périmé. Annoncer « expiré » à quelqu'un qui a tapé le code de sa voisine
    l'enverrait chercher au mauvais endroit. */
export function pourquoiLeCodeNeVautPas(o: {
  tape: string;
  codes: readonly CodePromo[];
  clientId?: string;
  branchId?: string;
  maintenant: string;
}): string | null {
  if (!normaliseLeCode(o.tape)) return null; // rien de tapé : rien à refuser
  const c = codeDit(o.tape, o.codes, o.branchId);
  if (!c) return 'Ce code n’existe pas dans la Maison.';
  if (!o.clientId) return 'Nommez la cliente : un code de promotion appartient à une tête.';
  if (c.clientId !== o.clientId) return 'Ce code appartient à une autre cliente.';
  if (estUtilise(c)) return `Ce code a déjà été utilisé ${instantDit(c.utiliseLe as string)}.`;
  if (estExpire(c, o.maintenant)) return `Ce code a expiré ${instantDit(c.expireLe)}.`;
  return null;
}

/** L'AVANTAGE, EN UN MOT — « −15 % » ou « −2 000 F ». Le pourcentage prime
    si les deux traînent : voir le commentaire du type. */
export const avantageDuCode = (c: CodePromo): { pct: number; xof: number } =>
  c.remisePct && c.remisePct > 0
    ? { pct: Math.round(c.remisePct), xof: 0 }
    : { pct: 0, xof: Math.max(0, Math.round(c.remiseXof ?? 0)) };

export type LigneRemisable = { serviceId: string; montantXof: number };

/** LA BASE SUR LAQUELLE LE CODE MORD.

    UN CODE SANS PRESTATION MORD SUR TOUT ; un code qui en nomme une ne mord
    que sur sa part. C'est la différence entre « −15 % sur votre rituel » et
    « −15 % sur le GBÈZÀ™ », et les deux se vendent — mais pas au même prix
    pour la Maison. */
export const baseDuCode = (c: CodePromo, lignes: readonly LigneRemisable[]): number =>
  lignes
    .filter((l) => !c.serviceId || l.serviceId === c.serviceId)
    .reduce((s, l) => s + Math.max(0, l.montantXof), 0);

/** CE QUE LE CODE RETIRE, EN FRANCS EXACTS.

    JAMAIS PLUS QUE SA BASE. Un code de 5 000 F sur une prestation de 3 000 F
    retire 3 000 F, pas 5 000 : la Maison ne doit pas d'argent à quelqu'un qui
    vient d'en dépenser. Le reste du bon n'est pas un avoir, il s'éteint —
    c'est une promotion, pas un crédit. */
export const remiseDuCode = (c: CodePromo, lignes: readonly LigneRemisable[]): number => {
  const base = baseDuCode(c, lignes);
  if (base <= 0) return 0;
  const { pct, xof } = avantageDuCode(c);
  const brut = pct > 0 ? Math.round((base * pct) / 100) : xof;
  return Math.max(0, Math.min(base, brut));
};

/* ══ LE CUMUL — décision du 14 septembre 2026 ════════════════════════

   « Proposé · elle ne s'ajoute pas, on garde la plus avantageuse, et l'écran
   le dit. » Deux remises qui s'empilent se défendent mal : une cliente au
   tarif famille de 15 % qui reçoit une promo de 15 % ne paierait plus que
   72 % du prix, ce que personne n'a décidé. On garde la plus généreuse, et
   on NOMME celle qu'on écarte — une remise qui disparaît en silence passe
   pour une erreur de caisse. */
export type Cumul = {
  /** Le pourcentage retenu, celui qui s'applique. */
  pct: number;
  /** D'où il vient — « le code ECLAT15-A7K » ou « la remise famille ». */
  source: string;
  /** Ce qui a été écarté, quand il y avait deux prétendants. */
  ecartee?: string;
};

export const laMeilleureRemise = (
  famillePct: number, codePct: number, nomDuCode: string,
): Cumul => {
  const f = Math.max(0, Math.round(famillePct));
  const c = Math.max(0, Math.round(codePct));
  if (c <= 0 && f <= 0) return { pct: 0, source: '' };
  if (c > f) return { pct: c, source: `le code ${nomDuCode}`, ecartee: f > 0 ? `la remise famille de ${f} %` : undefined };
  if (f > c) return { pct: f, source: 'la remise famille', ecartee: c > 0 ? `le code ${nomDuCode} (${c} %)` : undefined };
  /* ÉGALITÉ : la remise famille l'emporte, et le code RESTE ENTIER. Consommer
     un code qui n'apporte rien serait le voler à la cliente — elle pourra
     s'en servir une autre fois, tant qu'il vit. */
  return { pct: f, source: 'la remise famille', ecartee: c > 0 ? `le code ${nomDuCode}, qui vaut autant et reste utilisable` : undefined };
};

/** LE CODE A-T-IL SERVI ? Quand la remise famille l'emporte à égalité, le
    code n'est pas consommé : ce juge-là décide s'il faut le fermer. */
export const leCodeAServi = (cumul: Cumul, nomDuCode: string): boolean =>
  cumul.pct > 0 && cumul.source === `le code ${nomDuCode}`;

/** LA MÊME RÈGLE, EN FRANCS — pour la caisse.

    AU COMPTOIR, LA REMISE DÉJÀ POSÉE N'EST PAS UN POURCENTAGE : c'est ce
    qu'une main a retiré du ticket, en francs, d'un ou plusieurs gestes. Et un
    code peut lui-même valoir un montant plutôt qu'une part. Comparer deux
    pourcentages ne dirait donc rien de juste ; on compare ce qui sort
    réellement du tiroir.

    À ÉGALITÉ, CE QUI EST DÉJÀ POSÉ L'EMPORTE, et le code reste entier : le
    consommer sans qu'il apporte un franc de plus reviendrait à le voler à la
    cliente, qui pourra s'en servir une autre fois tant qu'il vit. */
export type CumulEnFrancs = {
  xof: number;
  source: string;
  ecartee?: string;
  /** Le code est-il consommé par cette pièce ? */
  codeConsomme: boolean;
};

export const laMeilleureEnFrancs = (
  dejaXof: number, codeXof: number, nomDuCode: string,
): CumulEnFrancs => {
  const d = Math.max(0, Math.round(dejaXof));
  const c = Math.max(0, Math.round(codeXof));
  if (c <= 0 && d <= 0) return { xof: 0, source: '', codeConsomme: false };
  if (c > d) {
    return {
      xof: c,
      source: `le code ${nomDuCode}`,
      ecartee: d > 0 ? `la remise déjà posée` : undefined,
      codeConsomme: true,
    };
  }
  return {
    xof: d,
    source: 'la remise déjà posée',
    ecartee: c > 0 ? `le code ${nomDuCode}, qui ne donnerait pas davantage et reste utilisable` : undefined,
    codeConsomme: false,
  };
};

/* ══ L'ÉCRITURE — un code se ferme une fois ══════════════════════════ */

export type Honneur = {
  parQui?: string;
  /** La pièce qui l'honore : « FA-2026-0431 », ou l'identifiant du rituel. */
  surPiece?: string;
  remiseReelleXof: number;
  maintenant?: string;
};

/** FERME LE CODE. Idempotent par construction : un code déjà utilisé revient
    tel quel. Deux caisses qui cliquent ensemble ne remisent pas deux fois. */
export const honoreLeCode = (c: CodePromo, h: Honneur): CodePromo =>
  estUtilise(c) ? c : {
    ...c,
    utiliseLe: h.maintenant ?? new Date().toISOString(),
    utilisePar: h.parQui,
    surPiece: h.surPiece,
    remiseReelleXof: Math.max(0, Math.round(h.remiseReelleXof)),
  };

/* ══ LE REGISTRE — ce que les promos ont coûté et rapporté ═══════════

   Un registre qui ne se lit que dans un sens ne sert à rien. Celui-ci
   répond aux deux questions que la Maison se pose vraiment : combien
   ai-je remisé ce mois-ci, et combien de promos envoyées ont fait revenir
   quelqu'un. Sans elles, une promotion est une dépense qu'on ne mesure
   jamais. */
export type BilanDesPromos = {
  envoyes: number;
  honores: number;
  /** Ce que les codes honorés ont réellement retiré, en francs. */
  remiseXof: number;
  /** Ceux qui sont morts sans servir — le coût zéro, mais l'effort perdu. */
  perimes: number;
  /** Ceux qui vivent encore et peuvent tomber demain. */
  enCours: number;
};

export const bilanDesPromos = (
  codes: readonly CodePromo[], maintenant: string,
): BilanDesPromos => codes.reduce<BilanDesPromos>((b, c) => {
  b.envoyes += 1;
  if (estUtilise(c)) { b.honores += 1; b.remiseXof += Math.max(0, c.remiseReelleXof ?? 0); }
  else if (estExpire(c, maintenant)) b.perimes += 1;
  else b.enCours += 1;
  return b;
}, { envoyes: 0, honores: 0, remiseXof: 0, perimes: 0, enCours: 0 });

/** LES CODES VIVANTS D'UNE TÊTE, du plus proche de sa fin au plus lointain.
    C'est l'ordre utile : celui qui va mourir se propose en premier. */
export const codesVivantsDe = (
  codes: readonly CodePromo[], clientId: string, maintenant: string, branchId?: string,
): CodePromo[] => codes
  .filter((c) => c.clientId === clientId && (!branchId || c.branchId === branchId)
    && !estUtilise(c) && !estExpire(c, maintenant))
  .sort((a, b) => a.expireLe.localeCompare(b.expireLe));

export const codesPromoStore = createStore<CodePromo[]>('mnd_codes_promo', []);
export const useCodesPromo = () => useStore(codesPromoStore);

bindCollection(codesPromoStore, 'codes_promo');
