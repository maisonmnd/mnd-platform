/* L'ASSISTANT DES BILANS, SES RÈGLES — 4 octobre 2026.

   « J'ai besoin d'un assistant AI qui va pouvoir faire les résumés des bilans
   des clients… individuel… solutions… routine à partir de conseils
   d'ingrédients… une section au niveau du rendez-vous… un bilan en bonne et
   due forme pour la Maison MND, super professionnel… qui se retrouve ensuite
   au niveau de la Couronne » (Yéman). Maquette 2n4fqCnnhG2vYrMbwngPcr,
   validée, cheveux métissés compris.

   CE FICHIER NE TOUCHE À RIEN : ni magasin, ni réseau. Il dit ce que le maître
   coche, ce qui part à l'assistant, et comment on relit ce qui en revient.
   C'est lui que le harnais éprouve ; l'écran et la fonction Edge le suivent.

   TROIS RÈGLES TIENNENT TOUT LE RESTE :
   — l'assistant PROPOSE, le maître SIGNE : rien ne quitte le Trône sans lui ;
   — il ne choisit que dans les listes de la Maison (prestations, ingrédients,
     formules, produits) ;
   — il reçoit le MINIMUM : la civilité et le prénom, et ce qui touche à ses
     cheveux. Jamais son téléphone, jamais son courriel, jamais son nom. */

/* ══ CE QUE LE MAÎTRE COCHE ══════════════════════════════════════════ */

export type NatureDuCheveu = 'afro' | 'metisse' | 'boucle' | 'lisse';

export const NATURES_DU_CHEVEU: readonly { cle: NatureDuCheveu; dit: string }[] = [
  { cle: 'afro', dit: 'Afro' },
  { cle: 'metisse', dit: 'Métissé' },
  { cle: 'boucle', dit: 'Bouclé' },
  { cle: 'lisse', dit: 'Lisse ou ondulé' },
];

export const natureDite = (n?: NatureDuCheveu): string =>
  NATURES_DU_CHEVEU.find((x) => x.cle === n)?.dit ?? '';

/** Ce que je vois, sur toute tête. Les mots de la Maison. */
export const SIGNES_VUS: readonly string[] = [
  'Sécheresse', 'Casse aux racines', 'Pellicules', 'Démangeaisons',
  'Amincissement', 'Locks qui fusionnent', 'Odeur', 'Pousse lente',
];

/** LE CHEVEU MÉTISSÉ A SES PROBLÈMES PROPRES — ajout du 4 octobre au soir,
    « rajoute les problèmes du cheveu métissé sur le bilan de la séance ».
    Ils ne paraissent que si la nature cochée est « Métissé ». */
export const SIGNES_METISSE: readonly string[] = [
  'Plusieurs textures sur une même tête', 'Locks qui se défont aux racines',
  'Locks lentes à se former', 'Frisottis', 'Nœuds et emmêlements',
  'Cheveu fin et fragile', 'Pointes sèches', 'Porosité élevée', 'Cuir chevelu sensible',
];

/** LA NOTE DE SÉANCE — ce que le maître a vu et ce qu'il attend du bilan.

    ELLE NE VIT PAS DANS LE RENDEZ-VOUS. La cliente lit ses rendez-vous dans
    Ma Couronne (RLS 0035) : « elle se lave trop souvent avec un shampoing du
    commerce » y serait lisible par elle, mot pour mot. La note vit dans sa
    propre table, réservée au personnel (0115), et ne rejoint la cliente que
    transformée en bilan, relu et signé. */
export type NoteDeSeance = {
  id: string; // `nds-<apptId>` : une note par séance, jamais deux
  apptId: string;
  clientId: string;
  branchId: string;
  nature?: NatureDuCheveu;
  vu: string[];
  metisse: string[];
  /** « Ce que j'attends » — en ses mots, vite, au comptoir ou au fauteuil. */
  attendu: string;
  /** « Ce que je veux qu'elle retienne. » */
  retenir: string;
  /** LE BROUILLON DE L'ASSISTANT, gardé : rouvrir la fiche ne repaie pas un
      appel. Il s'efface à la signature (le bilan signé le remplace). */
  brouillon?: BrouillonDeBilan;
  brouillonLe?: string;
  /** Le bilan signé de cette séance, quand il existe. */
  bilanId?: string;
  ecritLe: string;
};

export const idDeLaNote = (apptId: string): string => `nds-${apptId}`;

/** Les cases métissées ne comptent que sur une tête métissée : décocher la
    nature les retire de ce qui part, sans effacer le geste du maître. */
export const signesRetenus = (n: Pick<NoteDeSeance, 'nature' | 'vu' | 'metisse'>): string[] =>
  [...n.vu, ...(n.nature === 'metisse' ? n.metisse : [])];

export const noteVide = (n: Pick<NoteDeSeance, 'nature' | 'vu' | 'metisse' | 'attendu' | 'retenir'> | undefined): boolean =>
  !n || (!n.nature && signesRetenus(n).length === 0 && !n.attendu.trim() && !n.retenir.trim());

/* ══ CE QUI REVIENT DE L'ASSISTANT ═══════════════════════════════════ */

export const QUATRE_TEMPS = ['Purifier', 'Nourrir', 'Sceller', 'Couronner'] as const;
export type NomDuTemps = (typeof QUATRE_TEMPS)[number];

export const QUATRE_JAUGES = ['Cuir chevelu', 'Racines', 'Hydratation', 'Densité & tenue'] as const;

export type PropositionDuBilan = {
  /** Toujours une prestation du catalogue : c'est elle que « Réserver » ouvre. */
  serviceId: string;
  nom: string;
  quand: string; // « à votre prochaine venue », « dans six semaines »
};

export type BrouillonDeBilan = {
  diagnostic: string; // Ce que nous avons vu
  sens: string; // Ce que cela veut dire
  solutions: string; // Ce que la Maison vous propose, en phrases
  propositions: PropositionDuBilan[];
  rituel: { nom: NomDuTemps; cadence: string; texte: string; ingredients: string[] }[];
  jauges: { nom: string; valeur: number; note: string }[];
  points: string[];
  prochaineVisite: string;
  /** Trois phrases : ce que Ma Couronne montre d'abord. */
  resume: string;
  /** Le mot qui accompagne le PDF sur WhatsApp. */
  message: string;
  /** Un signe qui ressemble à une maladie du cuir chevelu : la phrase qui
      recommande un dermatologue, sinon vide. Le maître la voit en tête. */
  alerteMedicale: string;
};

/* ══ CE QUI PART À L'ASSISTANT ═══════════════════════════════════════ */

export type FicheMinimale = {
  name: string;
  civilite?: 'madame' | 'mademoiselle' | 'monsieur';
  auMasculin?: boolean;
  crownStyle?: string;
  longueur?: string;
  lockCount?: number;
  crownSince?: string;
  notes?: string;
};

export type BilanPasse = {
  date: string;
  prestation?: string;
  diagnostic?: string;
  points: string[];
  jauges: { nom: string; valeur: number; note: string }[];
};

export type ContexteDuBilan = {
  appel: string; // « Madame Awa »
  seance: { date: string; prestations: string[]; praticien: string };
  cheveu: {
    nature: string;
    style?: string;
    longueur?: string;
    locks?: number;
    couronneDepuis?: string;
    consultation?: string;
  };
  vu: string[];
  attendu: string;
  retenir: string;
  bilansPasses: BilanPasse[];
};

const DIT_CIV = { madame: 'Madame', mademoiselle: 'Mademoiselle', monsieur: 'Monsieur' } as const;

/** LE MINIMUM QUI PART. Construit champ par champ, jamais par copie de la
    fiche : un champ ajouté demain à la fiche (un téléphone de plus, une
    adresse) ne partira jamais par mégarde. */
export function contexteDuBilan(o: {
  fiche: FicheMinimale;
  note: Pick<NoteDeSeance, 'nature' | 'vu' | 'metisse' | 'attendu' | 'retenir'>;
  seance: { date: string; prestations: string[]; praticien: string };
  bilansPasses: BilanPasse[];
}): ContexteDuBilan {
  const f = o.fiche;
  const civ = f.civilite && DIT_CIV[f.civilite] ? DIT_CIV[f.civilite] : f.auMasculin ? 'Monsieur' : 'Madame';
  const prenom = (f.name ?? '').trim().split(/\s+/)[0] ?? '';
  return {
    appel: prenom ? `${civ} ${prenom}` : civ,
    seance: { date: o.seance.date, prestations: o.seance.prestations.slice(0, 6), praticien: o.seance.praticien },
    cheveu: {
      nature: natureDite(o.note.nature) || 'non précisée',
      ...(f.crownStyle ? { style: f.crownStyle } : {}),
      ...(f.longueur ? { longueur: f.longueur } : {}),
      ...(f.lockCount ? { locks: f.lockCount } : {}),
      ...(f.crownSince ? { couronneDepuis: f.crownSince.slice(0, 7) } : {}),
      ...(f.notes?.trim() ? { consultation: sansCoordonnees(f.notes).slice(0, 600) } : {}),
    },
    vu: signesRetenus(o.note),
    attendu: sansCoordonnees(o.note.attendu).slice(0, 800),
    retenir: sansCoordonnees(o.note.retenir).slice(0, 400),
    bilansPasses: o.bilansPasses.slice(0, 2).map((b) => ({
      date: b.date,
      ...(b.prestation ? { prestation: b.prestation } : {}),
      ...(b.diagnostic ? { diagnostic: b.diagnostic.slice(0, 400) } : {}),
      points: b.points.slice(0, 3),
      jauges: b.jauges.slice(0, 4),
    })),
  };
}

/** Un numéro ou une adresse glissés dans une note libre ne partent pas non
    plus : on les retire du texte avant l'envoi. */
export function sansCoordonnees(s: string): string {
  return (s ?? '')
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '[adresse retirée]')
    .replace(/(?:\+|00)?\d[\d\s.-]{6,}\d/g, '[numéro retiré]');
}

/* ══ RELIRE CE QUI REVIENT ═══════════════════════════════════════════ */

/** LA VOIX DE LA MAISON, TENUE À LA SORTIE AUSSI. L'assistant est prié de ne
    pas écrire de tiret long ; s'il en écrit un, il devient une virgule. */
export const sansTiretLong = (s: string): string =>
  (s ?? '').replace(/\s*—\s*/g, ', ').replace(/,\s*,/g, ',').trim();

/** CE QUE LE MAÎTRE DOIT REPRENDRE AVANT DE SIGNER. On ne corrige pas en
    silence ce qui demande un jugement : un prix, le mot « salon », une
    promesse chiffrée. L'écran le dit, la main décide. */
export function alertesDuTexte(texte: string): string[] {
  const t = texte ?? '';
  const a: string[] = [];
  if (/\b\d[\d\s .]*\s?(?:F\b|FCFA|F CFA|XOF|francs?\b|€|\$)/i.test(t)) a.push('Un prix apparaît : la Maison n’en écrit jamais dans un bilan.');
  if (/\bsalons?\b/i.test(t)) a.push('Le mot « salon » apparaît : écrivez « la Maison ».');
  if (/\b\d+\s?%|\bgaranti/i.test(t)) a.push('Une promesse chiffrée ou garantie apparaît : à adoucir.');
  if (/\btu\b|\bton\b|\bta\b|\btes\b/i.test(t)) a.push('Le tutoiement apparaît : la Maison vouvoie.');
  return a;
}

export const texteDuBrouillon = (b: BrouillonDeBilan): string =>
  [b.diagnostic, b.sens, b.solutions, b.resume, b.message, b.prochaineVisite,
    ...b.points, ...b.rituel.map((r) => `${r.cadence} ${r.texte}`),
    ...b.propositions.map((p) => p.quand), ...b.jauges.map((j) => j.note)].join('\n');

const borne = (n: unknown, bas: number, haut: number, defaut: number): number => {
  const v = typeof n === 'number' && Number.isFinite(n) ? Math.round(n) : defaut;
  return Math.min(haut, Math.max(bas, v));
};
const chaine = (s: unknown, max = 900): string => sansTiretLong(typeof s === 'string' ? s : '').slice(0, max);

/** RELIT UN BROUILLON BRUT — ceinture et bretelles. Le schéma de la fonction
    contraint déjà le modèle ; on revérifie ici, parce qu'une prestation
    retirée du catalogue entre l'appel et la remise ne doit pas devenir un
    bouton « Réserver » qui mène nulle part.

    — une proposition hors catalogue tombe ;
    — un ingrédient hors des sept tombe ;
    — les Quatre Temps sortent TOUJOURS au complet et dans l'ordre (le temps
      manquant reprend le texte de la Maison) ;
    — les jauges restent entre 1 et 5. */
export function brouillonRelu(
  brut: unknown,
  listes: {
    prestations: readonly { id: string; nom: string }[];
    ingredients: readonly string[];
    rituelDefaut: readonly { nom: string; cadence: string; texte: string }[];
  },
): BrouillonDeBilan {
  const b = (brut && typeof brut === 'object' ? brut : {}) as Record<string, unknown>;
  const parId = new Map(listes.prestations.map((p) => [p.id, p.nom]));
  const ingr = new Set(listes.ingredients);

  const propositions: PropositionDuBilan[] = [];
  for (const p of Array.isArray(b.propositions) ? b.propositions : []) {
    const id = (p as { serviceId?: unknown })?.serviceId;
    if (typeof id !== 'string' || !parId.has(id) || propositions.some((x) => x.serviceId === id)) continue;
    propositions.push({ serviceId: id, nom: parId.get(id)!, quand: chaine((p as { quand?: unknown }).quand, 120) });
    if (propositions.length === 3) break;
  }

  const recus = Array.isArray(b.rituel) ? (b.rituel as Record<string, unknown>[]) : [];
  const rituel = QUATRE_TEMPS.map((nom) => {
    const r = recus.find((x) => x?.nom === nom);
    const defaut = listes.rituelDefaut.find((x) => x.nom === nom);
    const texte = chaine(r?.texte, 400) || defaut?.texte || '';
    return {
      nom,
      cadence: chaine(r?.cadence, 60) || defaut?.cadence || '',
      texte,
      ingredients: (Array.isArray(r?.ingredients) ? (r!.ingredients as unknown[]) : [])
        .filter((i): i is string => typeof i === 'string' && ingr.has(i)),
    };
  });

  const jaugesRecues = Array.isArray(b.jauges) ? (b.jauges as Record<string, unknown>[]) : [];
  const jauges = QUATRE_JAUGES.map((nom) => {
    const j = jaugesRecues.find((x) => x?.nom === nom);
    return { nom, valeur: borne(j?.valeur, 1, 5, 3), note: chaine(j?.note, 40) };
  });

  return {
    diagnostic: chaine(b.diagnostic),
    sens: chaine(b.sens),
    solutions: chaine(b.solutions),
    propositions,
    rituel,
    jauges,
    points: (Array.isArray(b.points) ? b.points : []).map((p) => chaine(p, 300)).filter(Boolean).slice(0, 3),
    prochaineVisite: chaine(b.prochaineVisite, 120),
    resume: chaine(b.resume, 600),
    message: chaine(b.message, 700),
    alerteMedicale: chaine(b.alerteMedicale, 400),
  };
}
