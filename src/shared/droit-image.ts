/* ══ LE DROIT À L'IMAGE — 6 septembre 2026 ═══════════════════════════

   « Quand la cliente accepte de montrer sa photo, où est le contrat du droit à
   l'image signé par la cliente ? » (Yéman).

   NULLE PART, ET C'ÉTAIT LE DÉFAUT. La fiche portait une date posée par la
   Maison : c'est la Maison qui déclarait avoir demandé, pas la cliente qui
   avait accepté. Devant un litige, une case cochée par celui qui en profite ne
   vaut rien.

   UN ACCORD EST UN DOCUMENT, PAS UN BOOLÉEN. Il nomme QUI, QUELLES photos,
   POUR QUOI, POUR COMBIEN DE TEMPS, et il rappelle qu'elle peut le retirer. Il
   porte sa signature et la date. Il est remis. Sans l'un de ces morceaux, ce
   n'est pas un accord, c'est une note.

   LE TEXTE PORTE SA VERSION. Une formulation change avec le temps ; sans le
   numéro de celle qu'elle a signée, on ne saurait plus, dans deux ans, à quoi
   elle avait dit oui. C'est la première chose qu'un juriste demande.

   POUR UNE MINEURE, C'EST LE PARENT QUI SIGNE. Le Trône connaît le foyer : le
   document le nomme, et l'accord d'une enfant sans nom de parent n'est pas
   valide. Ce n'est pas une option, et cela n'a pas été demandé — cela va de soi.

   CE FICHIER N'EST PAS UN AVIS JURIDIQUE. La mécanique est juste ; la
   formulation devrait être relue par quelqu'un qui connaît le droit béninois. */

import { DEVISE_COMPLETE } from './identite';

/** LA VERSION DU TEXTE SIGNÉ. À incrémenter dès qu'un mot du contrat change,
    jamais autrement : c'est elle qui dit à quoi elle a dit oui. */
export const VERSION_DU_TEXTE = 'v2 · 6 septembre 2026';

export type CleUsage = 'vitrine' | 'reseaux' | 'couronne' | 'simulation';

/** LES USAGES SE COCHENT UN PAR UN. Un accord global ferait dire oui à ce
    qu'elle n'a pas lu : paraître au salon et voir son visage partir vers un
    service d'images à l'étranger ne se demandent pas ensemble. */
export const USAGES: { cle: CleUsage; mot: string; dit: string }[] = [
  { cle: 'vitrine', mot: 'La vitrine du salon', dit: 'être montrée dans le salon et sur le site de la Maison' },
  { cle: 'reseaux', mot: 'Les réseaux', dit: 'paraître sur les pages publiques de la Maison' },
  { cle: 'couronne', mot: 'Ma Couronne', dit: 'illustrer les styles proposés aux autres têtes couronnées' },
  { cle: 'simulation', mot: 'Simulation de coiffure', dit: 'servir à une simulation, ce qui suppose que la photo soit transmise à un prestataire technique hors de la Maison' },
];

/** LE TERME DES ACCORDS SIGNÉS AUJOURD'HUI — cinq ans (demande de Yéman).

    IL NE S'APPLIQUE PAS AUX ACCORDS DÉJÀ SIGNÉS, et c'est la seule façon
    honnête de le changer : celles qui ont signé pour deux ans ont accepté deux
    ans. Étendre leur terme en modifiant une constante les tiendrait trois ans
    de plus sans qu'elles aient rien dit, et personne ne s'en apercevrait.

    CHAQUE ACCORD PORTE DONC LE SIEN (`AccordImage.mois`), et `expireLe` lit
    celui-là. La constante ne sert plus qu'à ce qui se signe maintenant. */
export const MOIS_DE_VALIDITE = 60;

/** Le terme des accords signés avant que le champ existe : ceux du texte v1
    disaient vingt-quatre mois, et ils les gardent. */
export const MOIS_AVANT_LE_CHAMP = 24;

export type AccordImage = {
  /** Le jour de la signature (ISO). */
  at: string;
  /** Ce qu'elle a coché, et rien d'autre. */
  usages: CleUsage[];
  /** Le nom écrit sur le document — le sien, ou celui du parent. */
  signePar: string;
  /** Renseigné quand la tête est mineure : le lien du signataire. */
  pourEnfant?: string;
  /** Le tracé de sa signature, en image. Un dessin au trait pèse quelques
      kilo-octets : il peut vivre sur la fiche, contrairement à une photo. */
  signature: string;
  /** La version du texte qu'elle a signée. */
  version: string;
  /** LE TERME QU'ELLE A SIGNÉ, en mois. Gardé sur l'accord et non lu dans une
      constante : sinon changer la règle de la Maison rallongerait, en silence,
      des consentements déjà donnés. */
  mois?: number;
  /** Le jour où elle a retiré son accord (ISO). Le document RESTE : un accord
      retiré n'est pas un accord effacé, et savoir qu'il a existé compte autant
      que savoir qu'il ne vaut plus. */
  retireLe?: string;
};

/** L'ÂGE DE LA TÊTE AU JOUR DIT — pour savoir qui doit signer. */
export function ageAu(birthday: string | undefined, jourIso: string): number | undefined {
  if (!birthday) return undefined;
  const [a, m, j] = birthday.split('-').map((x) => parseInt(x, 10));
  const [a2, m2, j2] = jourIso.split('-').map((x) => parseInt(x, 10));
  if (!a || !a2) return undefined;
  let age = a2 - a;
  if (m2 < m || (m2 === m && j2 < j)) age -= 1;
  return age;
}

export const MAJORITE = 18;

export const estMineure = (birthday: string | undefined, jourIso: string): boolean => {
  const age = ageAu(birthday, jourIso);
  return age !== undefined && age < MAJORITE;
};

/** CE QUI REND UN ACCORD VALIDE. Quatre morceaux, et il en manque un dès qu'on
    se dépêche : c'est pour ça qu'ils se jugent ici plutôt qu'à l'écran. */
export function pourquoiInvalide(a: Partial<AccordImage> | undefined, o: {
  mineure?: boolean;
} = {}): string | undefined {
  if (!a) return 'Aucun document signé.';
  if (!a.usages || a.usages.length === 0) return 'Aucun usage coché : elle n’a accordé rien du tout.';
  if (!a.signature || a.signature.length < 64) return 'Sans signature, ce n’est pas un accord.';
  if (!(a.signePar ?? '').trim()) return 'Le document ne nomme personne.';
  if (o.mineure && !(a.pourEnfant ?? '').trim()) return 'Une tête mineure ne signe pas pour elle-même : le parent doit être nommé.';
  if (!a.at) return 'Un accord sans date ne se défend pas.';
  return undefined;
}

export const estValide = (a: AccordImage | undefined, o: { mineure?: boolean } = {}): boolean =>
  !!a && !a.retireLe && pourquoiInvalide(a, o) === undefined;

/** A-T-ELLE ACCORDÉ CET USAGE-LÀ ? Le seul juge, et tout ce qui publiera ou
    simulera doit y passer. Un écran qui lirait `usages` directement oublierait
    le retrait, ou la signature manquante. */
export const accordePour = (
  a: AccordImage | undefined,
  quoi: CleUsage,
  o: { mineure?: boolean } = {},
): boolean => estValide(a, o) && (a!.usages ?? []).includes(quoi);

/** LE JOUR OÙ L'ACCORD S'ÉTEINT. Un consentement sans terme se retourne contre
    celui qui s'en sert : deux ans, puis on redemande. */
export function expireLe(a: AccordImage): string {
  const [y, m, d] = a.at.split('-').map((x) => parseInt(x, 10));
  const t = new Date(y, (m - 1) + (a.mois ?? MOIS_AVANT_LE_CHAMP), d);
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
}

export const estExpire = (a: AccordImage, jourIso: string): boolean => expireLe(a) < jourIso;

/* ── LE TEXTE DU DOCUMENT ────────────────────────────────────────────
   « Écris un texte solide et complet » (Yéman).

   COMPLET, DONC LONG, ET C'EST LE SEUL ENDROIT OÙ C'EST JUSTE. Partout
   ailleurs la Maison veut moins de lecture ; ici, ce qui n'est pas écrit est ce
   qu'elle n'a pas accordé, et un contrat court est un contrat qui laisse le
   doute à celui qui l'a rédigé.

   EN ARTICLES NUMÉROTÉS, en français simple, phrases courtes. Un consentement
   qu'on ne lit pas parce qu'il est illisible n'est pas éclairé, quoi qu'il
   contienne.

   CE N'EST PAS UN AVIS JURIDIQUE. La mécanique tient ; la formulation doit
   être relue par quelqu'un qui connaît le droit béninois avant d'être
   présentée à une cliente. */

export type ArticleDuContrat = { n: string; titre: string; lignes: string[] };

/** « CINQ ANS », PAS « 60 MOIS ». Un terme qu'on doit diviser de tête pour le
    comprendre n'est pas un terme qu'on a compris. */
export function dureeEnClair(mois: number): string {
  if (mois % 12 === 0) {
    const ans = mois / 12;
    return ans === 1 ? 'un an' : `${['', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf', 'dix'][ans] ?? ans} ans`;
  }
  return `${mois} mois`;
}

export function texteDuContrat(o: {
  maison: string;
  raison?: string;
  ville?: string;
  tete: string;
  signataire: string;
  pourEnfant?: string;
  usages: CleUsage[];
  jourIso: string;
}): { titre: string; entete: string[]; articles: ArticleDuContrat[]; pied: string } {
  const cochés = USAGES.filter((u) => o.usages.includes(u.cle));
  const dehors = USAGES.filter((u) => !o.usages.includes(u.cle));
  const simulation = o.usages.includes('simulation');
  const jour = o.jourIso.split('-').reverse().join('/');
  const maison = o.raison?.trim() ? `${o.maison} (${o.raison.trim()})` : o.maison;

  const entete = o.pourEnfant
    ? [
      `Entre ${maison}, ci-après « la Maison »,`,
      `et ${o.signataire}, agissant en qualité de parent ou de représentant légal `
      + `de ${o.pourEnfant}, ci-après « la personne photographiée ».`,
    ]
    : [
      `Entre ${maison}, ci-après « la Maison »,`,
      `et ${o.signataire}, ci-après « la personne photographiée ».`,
    ];

  const articles: ArticleDuContrat[] = [
    {
      n: '1', titre: 'Ce sur quoi porte cette autorisation',
      lignes: [
        'La Maison photographie et filme le travail réalisé sur les cheveux de la personne '
        + 'photographiée : la coiffure, les locks, les gestes du soin, avant, pendant et après '
        + 'la séance.',
        'Ces images peuvent montrer la nuque, le profil, le dessus de la tête, et parfois le '
        + 'visage en entier ou en partie.',
        'Cette autorisation ne porte que sur les images prises dans les locaux de la Maison, '
        + 'ou lors d’un événement organisé par elle, pendant la durée dite à l’article 4.',
      ],
    },
    {
      n: '2', titre: 'Ce que la personne photographiée autorise',
      lignes: [
        'La personne photographiée autorise la Maison à utiliser ces images pour les seuls '
        + 'usages suivants, qu’elle a cochés elle-même :',
        ...(cochés.length
          ? cochés.map((u) => `· ${u.mot} : ${u.dit}.`)
          : ['· aucun usage n’a été coché ; aucune image ne peut donc être utilisée.']),
        ...(dehors.length
          ? [
            'Les usages suivants n’ont pas été accordés, et sont donc interdits :',
            ...dehors.map((u) => `· ${u.mot}.`),
          ]
          : []),
        'Aucun autre usage n’est autorisé. Un usage nouveau demandera un nouvel accord écrit.',
      ],
    },
    {
      n: '3', titre: 'Les supports et le territoire',
      lignes: [
        'Dans la limite des usages cochés, les images peuvent paraître sur les supports '
        + 'imprimés de la Maison, ses écrans en salon, son site, son application Ma Couronne, '
        + 'et ses pages publiques.',
        'Les réseaux étant consultables partout, la personne photographiée comprend que la '
        + 'diffusion n’a pas de frontière et qu’elle ne peut pas être limitée à un pays.',
      ],
    },
    {
      n: '4', titre: 'La durée',
      lignes: [
        `Cette autorisation est donnée pour ${dureeEnClair(MOIS_DE_VALIDITE)} à compter du ${jour}.`,
        'Passé ce terme, elle cesse d’elle-même. La Maison devra en demander une nouvelle '
        + 'pour continuer à utiliser les images.',
        'Ce terme est long : la personne photographiée est invitée à retenir qu’elle peut, à '
        + 'tout moment et sans se justifier, retirer son autorisation comme il est dit à '
        + 'l’article 5. La durée n’enferme personne.',
        'Les images déjà imprimées avant le terme peuvent rester en circulation le temps de '
        + 'leur épuisement naturel.',
      ],
    },
    {
      n: '5', titre: 'Le retrait',
      lignes: [
        'La personne photographiée peut retirer son autorisation à tout moment, sans avoir à '
        + 'se justifier, par simple demande à la Maison, oralement ou par écrit.',
        'Le retrait vaut pour l’avenir. La Maison cesse aussitôt toute nouvelle utilisation, '
        + 'et retire les images de ses supports en ligne dans un délai raisonnable.',
        'La Maison ne peut pas garantir le retrait de ce qui a été copié, repartagé ou '
        + 'enregistré par des tiers, et le dit franchement.',
        'Le retrait ne donne lieu à aucune indemnité, dans un sens comme dans l’autre.',
      ],
    },
    {
      n: '6', titre: 'Ce que la Maison s’interdit',
      lignes: [
        'Les images ne seront ni vendues, ni louées, ni cédées à un tiers pour son propre usage.',
        'Elles ne seront associées à aucun propos dégradant, ni à aucun sujet étranger au '
        + 'travail de la Maison.',
        'Elles ne seront pas déformées ni modifiées d’une manière qui porterait atteinte à la '
        + 'personne photographiée. Le recadrage, la lumière et la couleur restent permis.',
        'Le nom, le prénom et toute autre donnée d’identification de la personne photographiée '
        + 'ne seront pas publiés à côté de son image sans un accord séparé et écrit.',
      ],
    },
    ...(simulation ? [{
      n: '7', titre: 'La simulation de coiffure',
      lignes: [
        'La simulation consiste à produire, à partir d’une photographie de la personne '
        + 'photographiée, une image montrant une coiffure qu’elle n’a pas encore portée.',
        'Cette image est une SIMULATION. Ce n’est pas une photographie de la personne, et le '
        + 'résultat réel peut en différer. Elle porte cette mention de façon visible.',
        'Pour être produite, la photographie est transmise à un prestataire technique qui peut '
        + 'se trouver hors du Bénin. La Maison choisit un prestataire qui s’engage à ne pas '
        + 'réutiliser les images à ses propres fins.',
        'Une simulation n’est jamais publiée : elle est montrée à la personne photographiée, '
        + 'et à elle seule, pour l’aider à choisir.',
      ],
    }] : []),
    {
      n: simulation ? '8' : '7', titre: 'Les images et les données',
      lignes: [
        'Les images sont conservées par la Maison dans son système de gestion, protégé par mot '
        + 'de passe, et accessible au seul personnel qui en a besoin.',
        'La personne photographiée peut demander à tout moment la liste des images la '
        + 'concernant, une copie de celles-ci, leur correction ou leur effacement.',
        'La Maison efface les images à l’expiration de l’autorisation, sauf celles qu’elle doit '
        + 'garder pour un motif légitime, notamment la preuve de son travail en cas de '
        + 'contestation.',
      ],
    },
    {
      n: simulation ? '9' : '8', titre: 'Gratuité',
      lignes: [
        'Cette autorisation est donnée gratuitement. La personne photographiée ne perçoit ni '
        + 'rémunération, ni contrepartie d’aucune sorte, et n’en réclamera aucune.',
        'La Maison ne conditionne aucune prestation, aucun prix et aucun avantage à cette '
        + 'autorisation. La refuser ne change rien à la façon dont la personne est reçue.',
      ],
    },
    ...(o.pourEnfant ? [{
      n: simulation ? '10' : '9', titre: 'Personne mineure',
      lignes: [
        `${o.pourEnfant} étant mineure au jour de la signature, la présente autorisation est `
        + 'donnée par son parent ou représentant légal, qui déclare en avoir le pouvoir.',
        'La Maison recueille en outre l’assentiment de l’enfant, et renonce à photographier '
        + 'si l’enfant s’y oppose, quel que soit l’accord du parent.',
        'L’autorisation cesse de plein droit si le parent la retire, et l’enfant pourra la '
        + 'retirer elle-même à sa majorité.',
      ],
    }] : []),
    {
      n: o.pourEnfant ? (simulation ? '11' : '10') : (simulation ? '10' : '9'),
      titre: 'Droit applicable',
      lignes: [
        'La présente autorisation est régie par le droit béninois.',
        'En cas de difficulté, les parties chercheront d’abord une solution amiable avant '
        + 'toute autre démarche.',
        'Un exemplaire signé est remis à la personne photographiée le jour de la signature.',
      ],
    },
  ];

  return {
    titre: 'Autorisation de droit à l’image',
    entete,
    articles,
    pied: `${o.maison}${o.ville ? ` · ${o.ville}` : ''} · ${DEVISE_COMPLETE} · texte ${VERSION_DU_TEXTE}`,
  };
}

/** Ce qui se lit sur la fiche, en une ligne. */
export function ditLAccord(a: AccordImage | undefined, jourIso: string, mineure = false): string {
  if (!a) return 'Aucun document signé. Sa photo ne sort pas de sa fiche.';
  if (a.retireLe) return `Accord retiré le ${a.retireLe.split('-').reverse().join('/')}. Le document reste au dossier.`;
  const pourquoi = pourquoiInvalide(a, { mineure });
  if (pourquoi) return pourquoi;
  const mots = USAGES.filter((u) => a.usages.includes(u.cle)).map((u) => u.mot).join(' · ');
  const fin = expireLe(a);
  return estExpire(a, jourIso)
    ? `Signé le ${a.at.split('-').reverse().join('/')}, expiré depuis le ${fin.split('-').reverse().join('/')}. À refaire signer.`
    : `${mots}. Signé par ${a.signePar} le ${a.at.split('-').reverse().join('/')}, valable jusqu’au ${fin.split('-').reverse().join('/')}.`;
}
