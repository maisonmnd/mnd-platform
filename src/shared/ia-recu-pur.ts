import type { ChantierIa, UsageIa } from './ia-maison-pur';

/* ══ LA PHOTO QUI REMPLIT LA DÉPENSE — 19 octobre 2026 ══════════════════
   Chantier `recu` des huit (maquette NKQMiMMY… validée : « Tout me va »).
   Le texte de la maquette, mot pour mot :
     « Dans Dépenses, "Photographier le reçu". La photo reste jointe à la
     dépense. Les cases cuivrées viennent de la photo : vérifiez-les
     (Montant, Date, Fournisseur, Catégorie). Les articles sont repris en
     lignes. Même geste pour un chèque à l'encaissement : la banque et le
     numéro se lisent sur la photo, la trace est faite. »
   Sa décision sur l'accès : « Toute personne qui saisit une dépense : sa
   dépense attend votre validation, comme aujourd'hui. »

   CE MODULE NE FAIT CONFIANCE À RIEN. Claude propose, la lecture revalide :
   un montant est un entier de francs ≥ 0 ; une date est ISO, porte son année
   et n'est pas dans le futur ; une catégorie est l'une de celles du Trône ou
   rien ; des lignes qui dépassent le total ne sont pas des lignes. Ce qui ne
   tient pas devient null ou vide, et se dit dans `avertissements`.

   RIEN NE S'INSCRIT ICI : le module rend une proposition que l'écran montre
   en cases cuivre ; seul « Enregistrer » (ou « Soumettre ») de la dépense
   inscrit, par le chemin de la saisie à la main. MODULE PUR. */

export const CHANTIER_DU_RECU: ChantierIa = 'recu';
export const USAGE_DU_RECU: UsageIa = 'image';

/** Les lignes d'un ticket, au plus : au-delà, ce n'est plus un reçu qu'on saisit. */
export const LIGNES_MAX = 60;
/** La tolérance entre le total lu et la somme des lignes (sa règle : 5 %). */
export const TOLERANCE_DES_LIGNES = 0.05;
/** Un total au-delà n'est pas une dépense de la Maison : la lecture a déraillé. */
export const MONTANT_MAX_XOF = 1_000_000_000;

export const MOYENS_LUS = ['espèces', 'carte', 'mobile money', 'chèque', 'virement'] as const;
export type MoyenLu = (typeof MOYENS_LUS)[number];

export type LigneDuRecu = { libelle: string; quantite: number; montant: number };

export type RecuLu = {
  /** Le total du ticket, entier, en francs. null : illisible. */
  montant: number | null;
  /** La devise lue si ce n'est pas le franc (« EUR », « USD ») : le montant reste tel que lu, et l'écran le dit. */
  devise?: string;
  /** AAAA-MM-JJ, jamais dans le futur. null : illisible. */
  date: string | null;
  /** L'enseigne imprimée sur le ticket, jamais une personne. */
  fournisseur: string;
  /** Une catégorie du Trône, exactement, ou vide. */
  categorie: string;
  lignes: LigneDuRecu[];
  moyen: MoyenLu | null;
  /** 0 à 1, telle que Claude la dit ; l'écran la montre, elle ne décide rien. */
  confiance: number;
  /** Ce que la lecture a corrigé ou refusé, dit à la personne. */
  avertissements: string[];
};

/** Les quatre cases cuivrées de la maquette. */
export const CHAMPS_DU_RECU = ['montant', 'date', 'fournisseur', 'categorie'] as const;
export type ChampDuRecu = (typeof CHAMPS_DU_RECU)[number];

/** LA TEINTE DES CASES « À VÉRIFIER » : cuivre pâle, jamais obsidienne. Elle
    s'efface dès que la personne touche la case : ce qu'elle a relu est à elle. */
export const TEINTE_CUIVRE = {
  background: 'var(--copper-50)', borderColor: 'var(--copper-400)', boxShadow: 'inset 0 0 0 1px var(--copper-300)',
} as const;
export const cuivreSi = (oui: boolean): typeof TEINTE_CUIVRE | undefined => (oui ? TEINTE_CUIVRE : undefined);

/* ── LA CONSIGNE ───────────────────────────────────────────────────────── */

/** La consigne de lecture d'un reçu. Elle PORTE les catégories du Trône (la
    liste vivante, pas une liste figée ici) et le jour d'aujourd'hui, pour
    qu'une date sans année ou dans le futur se refuse. Elle ne demande AUCUN
    nom de personne : un ticket porte parfois le prénom d'une caissière, et il
    ne regarde pas la Maison. */
export function consigneDuRecu(o: { categories: readonly string[]; aujourdhui: string }): string {
  const categories = o.categories.map((c) => c.trim()).filter(Boolean);
  const listeDesCategories = categories.length ? categories.map((c) => `« ${c} »`).join(', ') : '(aucune catégorie définie : laisse la catégorie à null)';
  return [
    'Tu lis la photo d’un reçu, d’un ticket de caisse ou d’une facture de fournisseur pour la Maison MND, à Cotonou (Bénin). Tu rends uniquement ce qui est ÉCRIT sur la photo, dans la forme demandée ; tu n’inventes rien, et ce que tu ne lis pas avec certitude vaut null.',
    `Aujourd’hui : ${o.aujourdhui}.`,
    'montant : le total payé (TTC, après remise), un nombre entier de francs CFA ; si le ticket est dans une autre monnaie, donne le nombre tel qu’il est écrit et dis la monnaie dans devise (code ISO, par exemple EUR). Si le total n’est pas lisible, null.',
    'date : la date du ticket au format AAAA-MM-JJ, avec l’année. Si l’année n’est pas imprimée ou si la date n’est pas lisible, null. Une date postérieure à aujourd’hui est une erreur de lecture : null.',
    'fournisseur : le nom de l’enseigne ou de l’entreprise imprimé en tête du ticket (le magasin, la pharmacie, la station). Jamais le nom d’une personne : ne relève aucun nom de personne, ni caissier ni cliente ; si seul un nom de personne figure, laisse fournisseur vide.',
    `categorie : choisis UNE catégorie dans cette liste, écrite exactement comme ici : ${listeDesCategories}. Si aucune ne convient clairement, null.`,
    'lignes : chaque article du ticket, dans l’ordre, avec libelle (tel qu’imprimé), quantite (1 si rien n’est écrit) et montant (le total de la ligne, en francs, entier). Pas plus de 60 lignes ; les lignes de sous-total, de remise, de TVA ou de rendu monnaie ne sont pas des articles.',
    'moyen : le mode de paiement s’il est imprimé, parmi espèces, carte, mobile money, chèque, virement ; sinon null.',
    'confiance : entre 0 et 1, ta certitude sur l’ensemble.',
    'Si la photo n’est pas un reçu (une personne, un paysage, un écran), rends montant null, lignes vides et confiance 0.',
  ].join('\n');
}

/** La forme attendue, donnée à Claude comme un outil à appeler. */
export const SCHEMA_DU_RECU: Record<string, unknown> = {
  type: 'object',
  properties: {
    montant: { type: ['number', 'null'], description: 'Le total payé, entier, en francs CFA.' },
    devise: { type: ['string', 'null'], description: 'Le code ISO de la monnaie si ce n’est pas le franc CFA.' },
    date: { type: ['string', 'null'], description: 'AAAA-MM-JJ, avec l’année.' },
    fournisseur: { type: ['string', 'null'], description: 'L’enseigne imprimée, jamais une personne.' },
    categorie: { type: ['string', 'null'], description: 'Une catégorie de la liste, exactement.' },
    lignes: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          libelle: { type: 'string' },
          quantite: { type: 'number' },
          montant: { type: 'number' },
        },
        required: ['libelle', 'quantite', 'montant'],
      },
    },
    moyen: { type: ['string', 'null'], enum: [...MOYENS_LUS, null] },
    confiance: { type: 'number' },
  },
  required: ['montant', 'date', 'fournisseur', 'categorie', 'lignes', 'moyen', 'confiance'],
};

/* ── LA LECTURE : ON REVALIDE TOUT ─────────────────────────────────────── */

const propre = (v: unknown, max: number): string =>
  (typeof v === 'string' ? v : '').replace(/\s+/g, ' ').trim().slice(0, max);

const sansAccents = (s: string): string => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/** Un nombre tel que Claude le rend : 12500, 12500.5, « 12 500 », « 12.500,50 ». Entier ≥ 0, ou null. */
export function montantLu(v: unknown): number | null {
  let n: number;
  if (typeof v === 'number') n = v;
  else if (typeof v === 'string') {
    const t = v.replace(/[\s ]/g, '').replace(/F(CFA)?$/i, '');
    /* « 12.500,50 » : le point sépare les milliers, la virgule les décimales. */
    const fr = /^\d{1,3}(\.\d{3})+(,\d+)?$/.test(t) ? t.replace(/\./g, '').replace(',', '.') : t.replace(',', '.');
    n = parseFloat(fr);
  } else return null;
  if (!Number.isFinite(n) || n < 0 || n > MONTANT_MAX_XOF) return null;
  return Math.round(n);
}

/** Une date ISO plausible, avec son année, et pas dans le futur sauf permission. */
export function dateLue(v: unknown, aujourdhui: string, o: { futurPermis?: boolean } = {}): string | null {
  if (typeof v !== 'string') return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v.trim());
  if (!m) return null;
  const [, a, mo, j] = m;
  const an = Number(a); const mois = Number(mo); const jour = Number(j);
  if (an < 2000 || an > 2100 || mois < 1 || mois > 12 || jour < 1 || jour > 31) return null;
  const d = new Date(an, mois - 1, jour);
  if (d.getFullYear() !== an || d.getMonth() !== mois - 1 || d.getDate() !== jour) return null;
  const iso = `${a}-${mo}-${j}`;
  if (!o.futurPermis && iso > aujourdhui) return null;
  return iso;
}

/** La catégorie telle que le Trône l'écrit, ou vide si elle n'est pas de la liste. */
export function categorieLue(v: unknown, categories: readonly string[]): string {
  const voulue = sansAccents(propre(v, 80));
  if (!voulue) return '';
  return categories.find((c) => sansAccents(c) === voulue) ?? '';
}

export function moyenLu(v: unknown): MoyenLu | null {
  const t = sansAccents(propre(v, 30));
  if (!t) return null;
  if (/^esp/.test(t) || /cash|liquide/.test(t)) return 'espèces';
  if (/carte|cb|visa|mastercard/.test(t)) return 'carte';
  if (/mobile|momo|mtn|moov|celtiis|flooz/.test(t)) return 'mobile money';
  if (/ch[eè]que/.test(t)) return 'chèque';
  if (/virement|transfert/.test(t)) return 'virement';
  return null;
}

function lignesLues(v: unknown): LigneDuRecu[] {
  if (!Array.isArray(v)) return [];
  const out: LigneDuRecu[] = [];
  for (const l of v.slice(0, LIGNES_MAX)) {
    if (!l || typeof l !== 'object') continue;
    const o = l as Record<string, unknown>;
    const libelle = propre(o.libelle, 80);
    const montant = montantLu(o.montant);
    if (!libelle || montant === null) continue;
    const q = typeof o.quantite === 'number' ? o.quantite : typeof o.quantite === 'string' ? parseFloat(o.quantite.replace(',', '.')) : 1;
    const quantite = Number.isFinite(q) && q > 0 ? Math.round(q * 1000) / 1000 : 1;
    out.push({ libelle, quantite, montant });
  }
  return out;
}

export const sommeDesLignes = (lignes: readonly LigneDuRecu[]): number => lignes.reduce((n, l) => n + l.montant, 0);

const francs = (n: number): string => `${n.toLocaleString('fr-FR')} F`;

/** LA LECTURE D'UN REÇU. Rend null si Claude n'a rien rendu d'utilisable
    (ni total, ni lignes, ni enseigne) : l'écran dit alors « saisissez à la
    main », et la photo reste jointe. */
export function lectureDuRecu(brut: unknown, o: { categories: readonly string[]; aujourdhui: string }): RecuLu | null {
  if (!brut || typeof brut !== 'object' || Array.isArray(brut)) return null;
  const b = brut as Record<string, unknown>;
  const avertissements: string[] = [];

  let montant = montantLu(b.montant);
  if (b.montant !== null && b.montant !== undefined && montant === null) avertissements.push('Le total lu n’est pas un montant : vérifiez-le sur le ticket.');

  const date = dateLue(b.date, o.aujourdhui);
  if (typeof b.date === 'string' && b.date.trim() && date === null) {
    avertissements.push(/^\d{4}-\d{2}-\d{2}/.test(b.date.trim()) && b.date.trim().slice(0, 10) > o.aujourdhui
      ? 'La date lue est dans le futur : la date du jour est gardée.'
      : 'La date lue n’est pas une date complète : la date du jour est gardée.');
  }

  const fournisseur = propre(b.fournisseur, 80);

  const categorie = categorieLue(b.categorie, o.categories);
  if (propre(b.categorie, 80) && !categorie) avertissements.push(`« ${propre(b.categorie, 40)} » n’est pas une catégorie du Trône : choisissez-la.`);

  let lignes = lignesLues(b.lignes);
  const somme = sommeDesLignes(lignes);
  if (lignes.length && montant !== null && somme > montant * (1 + TOLERANCE_DES_LIGNES)) {
    avertissements.push(`Les ${lignes.length} lignes totalisent ${francs(somme)}, le ticket dit ${francs(montant)} : seul le total est repris.`);
    lignes = [];
  } else if (lignes.length && montant === null) {
    montant = somme;
    avertissements.push('Le total n’a pas été lu : il est pris comme la somme des lignes, vérifiez-le.');
  }

  const devise = propre(b.devise, 3).toUpperCase();
  const deviseEtrangere = /^[A-Z]{3}$/.test(devise) && devise !== 'XOF' && devise !== 'CFA';
  if (deviseEtrangere) avertissements.push(`Le ticket est en ${devise} : le montant est repris tel que lu, convertissez-le.`);

  const moyen = moyenLu(b.moyen);
  const c = typeof b.confiance === 'number' && Number.isFinite(b.confiance) ? Math.min(1, Math.max(0, b.confiance)) : 0;

  if (montant === null && !lignes.length && !fournisseur) return null;
  return {
    montant, ...(deviseEtrangere ? { devise } : {}), date, fournisseur, categorie, lignes, moyen,
    confiance: Math.round(c * 100) / 100, avertissements,
  };
}

/** Les cases que la photo a remplies : celles-là se teintent cuivre. */
export const champsRemplis = (l: RecuLu): ChampDuRecu[] => CHAMPS_DU_RECU.filter((c) => (
  c === 'montant' ? l.montant !== null && l.montant > 0
    : c === 'date' ? !!l.date
      : c === 'fournisseur' ? !!l.fournisseur
        : !!l.categorie));

/* ── LES LIGNES DE LA DÉPENSE ──────────────────────────────────────────── */

/** Le libellé de la ligne qui porte ce que le ticket ne détaille pas (taxes,
    frais, arrondi) : la somme des articles fait loi dans la dépense, elle doit
    donc retrouver le total du ticket. */
export const LIBELLE_DU_RESTE = 'Reste du ticket (taxes, frais, arrondi)';

export type LigneDeDepense = { id: string; label: string; amountXof: number; qty?: number; unitXof?: number };

/** LES ARTICLES REPRIS EN LIGNES. Dans la dépense, la somme des articles fait
    loi ; on ne reprend donc les lignes que si leur somme retrouve le total :
      · égale au total : telles quelles ;
      · en dessous : plus une ligne « Reste du ticket » pour la différence ;
      · au-dessus (dans la tolérance) : aucune, le total seul vaut.
    Sans total lu, les lignes font le total. */
export function lignesPourLaDepense(l: RecuLu, nouvelId: () => string): LigneDeDepense[] {
  if (!l.lignes.length) return [];
  const somme = sommeDesLignes(l.lignes);
  const total = l.montant ?? somme;
  if (somme > total) return [];
  const lignes: LigneDeDepense[] = l.lignes.map((x) => ({
    id: nouvelId(), label: x.libelle, amountXof: x.montant,
    ...(x.quantite !== 1 ? { qty: x.quantite, unitXof: Math.round(x.montant / x.quantite) } : { unitXof: x.montant }),
  }));
  if (somme < total) lignes.push({ id: nouvelId(), label: LIBELLE_DU_RESTE, amountXof: total - somme, unitXof: total - somme });
  return lignes;
}

/** CE QUE LA LECTURE POSE DANS LE FORMULAIRE, et rien d'autre : le montant,
    la date, le bénéficiaire, la catégorie, les lignes. Le porteur, la caisse
    et la sous-catégorie restent à la main (« rien de présélectionné », 13
    septembre 2026). Une case déjà écrite par la personne n'est pas écrasée
    par une case vide de la lecture. */
export function formulaireDepuisLaLecture<F extends { amount: string; date: string; label: string; category: string; subcategory: string; items: LigneDeDepense[] }>(
  f: F, l: RecuLu, categories: readonly string[], nouvelId: () => string,
): F {
  const lignes = lignesPourLaDepense(l, nouvelId);
  const categorie = l.categorie && categories.includes(l.categorie) ? l.categorie : '';
  return {
    ...f,
    amount: l.montant !== null && l.montant > 0 ? String(l.montant) : f.amount,
    date: l.date ?? f.date,
    label: l.fournisseur || f.label,
    category: categorie || f.category,
    subcategory: categorie && categorie !== f.category ? '' : f.subcategory,
    items: lignes.length ? lignes : f.items,
  };
}

/* ── LE CHÈQUE ─────────────────────────────────────────────────────────── */

export type ChequeLu = {
  /** La banque, telle que la liste du Trône l'écrit si on l'y reconnaît. */
  banque: string;
  /** Vrai quand la banque lue n'est pas de la liste (l'écran passe en « Autre banque »). */
  horsListe: boolean;
  /** Le numéro du chèque, chiffres seuls (cinq au moins), ou vide. */
  numero: string;
  montant: number | null;
  /** Le nom imprimé ou écrit du tireur, tel que lu. */
  tireur: string;
  /** AAAA-MM-JJ ; un chèque peut être postdaté, on le dit sans le refuser. */
  date: string | null;
  confiance: number;
  avertissements: string[];
};

export function consigneDuCheque(o: { aujourdhui: string; banques: readonly string[] }): string {
  return [
    'Tu lis la photo d’un chèque remis à la Maison MND, à Cotonou (Bénin). Tu rends uniquement ce qui est écrit, dans la forme demandée ; ce que tu ne lis pas avec certitude vaut null ou vide.',
    `Aujourd’hui : ${o.aujourdhui}.`,
    `banque : la banque qui a émis le chèque, telle qu’imprimée. Si elle correspond à l’une de celles-ci, écris-la exactement ainsi : ${o.banques.map((b) => `« ${b} »`).join(', ')}. Sinon, son nom tel qu’imprimé.`,
    'numero : le numéro du chèque (en général sept chiffres, imprimé en haut et répété en bas dans la ligne magnétique, en premier groupe). Chiffres seuls. Ce n’est pas le numéro de compte ni le code banque.',
    'montant : la somme en chiffres, nombre entier de francs CFA ; null si illisible.',
    'tireur : le nom du titulaire du compte tel qu’imprimé ou écrit sur le chèque ; vide si illisible.',
    'date : la date écrite, au format AAAA-MM-JJ avec l’année ; null si illisible.',
    'confiance : entre 0 et 1.',
    'Si la photo n’est pas un chèque, rends tout vide ou null et confiance 0.',
  ].join('\n');
}

export const SCHEMA_DU_CHEQUE: Record<string, unknown> = {
  type: 'object',
  properties: {
    banque: { type: ['string', 'null'] },
    numero: { type: ['string', 'null'], description: 'Chiffres seuls.' },
    montant: { type: ['number', 'null'] },
    tireur: { type: ['string', 'null'] },
    date: { type: ['string', 'null'], description: 'AAAA-MM-JJ.' },
    confiance: { type: 'number' },
  },
  required: ['banque', 'numero', 'montant', 'tireur', 'date', 'confiance'],
};

/** Les façons dont une banque s'écrit sur un chèque, ramenées à la liste du Trône. */
const ALIAS_DES_BANQUES: readonly [RegExp, string][] = [
  [/\bbank of africa\b|\bboa\b/, 'boa'],
  [/\becobank\b/, 'ecobank'],
  [/\borabank\b/, 'orabank'],
  [/\bbiic\b|banque internationale pour l'industrie et le commerce/, 'biic'],
  [/\buba\b|united bank for africa/, 'uba'],
  [/\bnsia\b/, 'nsia'],
  [/\bcoris\b/, 'coris'],
  [/\bbgfi/, 'bgfibank'],
  [/\batlantique\b/, 'banque atlantique'],
  [/\bccei\b/, 'ccei'],
  [/\bbsic\b/, 'bsic'],
  [/societe generale|\bsgb\b|\bsg\b/, 'societe generale'],
];

/** La banque reconnue dans la liste du Trône, ou le texte lu tel quel (hors liste). */
export function banqueReconnue(texte: unknown, banques: readonly string[]): { banque: string; horsListe: boolean } {
  const lu = propre(texte, 60);
  if (!lu) return { banque: '', horsListe: false };
  const n = sansAccents(lu).replace(/[’']/g, "'");
  const exacte = banques.find((b) => sansAccents(b) === n);
  if (exacte) return { banque: exacte, horsListe: false };
  for (const [motif, racine] of ALIAS_DES_BANQUES) {
    if (!motif.test(n)) continue;
    const dansLaListe = banques.find((b) => sansAccents(b).startsWith(racine));
    if (dansLaListe) return { banque: dansLaListe, horsListe: false };
  }
  return { banque: lu, horsListe: true };
}

export function lectureDuCheque(brut: unknown, o: { aujourdhui: string; banques: readonly string[] }): ChequeLu | null {
  if (!brut || typeof brut !== 'object' || Array.isArray(brut)) return null;
  const b = brut as Record<string, unknown>;
  const avertissements: string[] = [];
  const { banque, horsListe } = banqueReconnue(b.banque, o.banques);
  if (horsListe) avertissements.push(`« ${banque} » n’est pas dans la liste des banques : vérifiez son nom.`);
  const chiffres = (typeof b.numero === 'string' ? b.numero : typeof b.numero === 'number' ? String(b.numero) : '').replace(/\D/g, '');
  const numero = chiffres.length >= 5 && chiffres.length <= 20 ? chiffres : '';
  if (chiffres && !numero) avertissements.push('Le numéro lu n’a pas la forme d’un numéro de chèque : relisez-le.');
  const montant = montantLu(b.montant);
  const tireur = propre(b.tireur, 80);
  const date = dateLue(b.date, o.aujourdhui, { futurPermis: true });
  if (date && date > o.aujourdhui) avertissements.push(`Le chèque est daté du ${date}, après aujourd’hui : il est postdaté.`);
  const c = typeof b.confiance === 'number' && Number.isFinite(b.confiance) ? Math.min(1, Math.max(0, b.confiance)) : 0;
  if (!banque && !numero && montant === null && !tireur) return null;
  return { banque, horsListe, numero, montant, tireur, date, confiance: Math.round(c * 100) / 100, avertissements };
}

/** « BOA Bénin · n° 1234567 · 30 000 F · K. Agossou · daté du 2026-10-18 » : ce que la photo a dit, pour comparer. */
export function chequeDit(l: ChequeLu): string {
  const m: string[] = [];
  if (l.banque) m.push(l.banque);
  if (l.numero) m.push(`n° ${l.numero}`);
  if (l.montant !== null) m.push(francs(l.montant));
  if (l.tireur) m.push(l.tireur);
  if (l.date) m.push(`daté du ${l.date}`);
  return m.join(' · ');
}
