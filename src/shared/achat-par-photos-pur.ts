import type { ChantierIa, UsageIa } from './ia-maison-pur';
import { ditCeQuiManque } from './depenses-saisie';

/* ══ L'ACHAT SAISI PAR PHOTOS — 1er novembre 2026 ═════════════════════════
   Maquette « Dépenses du jour et achats » (GSJcvg4AEYPNWiQ9ku2PAh), validée
   par « construis » avec ses quatre choix. Pour l'achat :
     · Claude lit les photos prises chez le fournisseur et propose, produit
       par produit, le nom, la famille, la quantité visible et le cadre ;
       elle corrige ; les prix sont à elle ;
     · le bon d'un achat payé et emporté NAÎT REÇU, en un geste : fournisseur,
       fiches, bon, entrées au stock, dépense Matières premières liée, photos.

   Le 31 octobre 2026, l'achat chez un fournisseur d'Akpakpa (19 articles) a
   été rempli sur une page à part, puis recopié écran par écran : fournisseur,
   douze fiches, bon, dix-neuf réceptions, dépense. Une réception en boucle
   a même reçu vingt-cinq fois la première ligne. Ici, un seul geste écrit
   tout, et une seule fois.

   CE MODULE NE FAIT CONFIANCE À RIEN de ce que Claude rend : une famille est
   l'une des quatre du stock, une quantité un entier de 1 à 999, un cadre
   reste dans sa photo, une fiche proposée existe. Il n'écrit rien : l'écran
   montre, `achat-par-photos.ts` écrit. MODULE PUR. */

export const CHANTIER_DE_L_ACHAT: ChantierIa = 'achat';
export const USAGE_DE_L_ACHAT: UsageIa = 'image';
/** Six photos par lecture : le plafond de la fonction ia-maison. */
export const PHOTOS_MAX = 6;
export const PRODUITS_MAX = 40;
export const QUANTITE_MAX = 999;
export const CATEGORIE_DE_L_ACHAT = 'Matières premières';

export type FamilleLue = 'consommable' | 'meches' | 'revente' | 'jetable';
export const FAMILLES_LUES: readonly FamilleLue[] = ['consommable', 'meches', 'revente', 'jetable'];
export const FAMILLE_DITE: Record<FamilleLue, string> = {
  consommable: 'Consommable', meches: 'Mèches', revente: 'Revente', jetable: 'Jetable',
};

/** Le cadre d'un produit dans sa photo, en fractions de la largeur et de la hauteur. */
export type CadreLu = { x: number; y: number; l: number; h: number };

export type ProduitLu = {
  photo: number;
  nom: string;
  famille: FamilleLue;
  quantite: number;
  unite: string;
  cadre: CadreLu | null;
  /** Une fiche du stock reconnue, ou vide : une fiche nouvelle. */
  ficheId: string;
};

export type AchatLu = { produits: ProduitLu[]; fournisseur: string; avertissements: string[] };

export type FicheConnue = { id: string; nom: string; famille: string; prixAchatXof?: number; actif?: boolean };

/** Un nom comparable : sans accents, sans casse, sans ponctuation. */
export const nomComparable = (s: string): string =>
  String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/* ── LA CONSIGNE ───────────────────────────────────────────────────────── */
export function consigneDeLAchat(o: { fiches: readonly FicheConnue[] }): string {
  const fiches = o.fiches.filter((f) => f.actif !== false).slice(0, 200);
  return [
    'Tu lis les photos d’un achat de la Maison MND, maison de soin et de création de locks à Cotonou, prises chez un fournisseur. Plusieurs produits peuvent figurer sur une même photo.',
    'Pour chaque produit distinct, rends une ligne :',
    '- photo : le numéro de la photo où il se voit le mieux (la première photo est 0) ;',
    '- nom : ce qui est écrit sur l’étiquette, marque, produit et contenance (« Elan shampoing mentholé 1 L ») ; sinon une description courte et exacte ;',
    '- famille : "consommable" (utilisé pendant les soins : shampoing, gel, huile, après-shampoing), "meches" (mèches et extensions), "jetable" (gants, élastiques, aiguilles, coton, petit matériel qui part vite), "revente" (seulement si c’est visiblement un produit à revendre tel quel) ; dans le doute, "consommable" ;',
    '- quantite : le nombre d’unités identiques que tu vois, entier ; dans le doute, 1, et dis-le dans les remarques ;',
    '- unite : "pièce", "flacon", "pot", "paquet" ou "sachet" ;',
    '- cadre : le rectangle qui entoure ce produit dans sa photo, en fractions de la largeur et de la hauteur (x et y du coin haut gauche, l la largeur, h la hauteur, chacun entre 0 et 1) ; pour plusieurs unités identiques, le rectangle qui les entoure toutes ;',
    '- ficheId : l’identifiant d’une fiche ci-dessous si c’est EXACTEMENT le même produit, sinon une chaîne vide.',
    'Un même produit vu sur deux photos ne fait qu’une ligne. N’invente aucun prix, aucun produit que tu ne vois pas. Le fournisseur : son nom s’il est écrit sur une photo (enseigne, reçu), sinon vide.',
    '',
    fiches.length ? 'LES FICHES DU STOCK DE LA MAISON :' : 'Le stock de la Maison n’a encore aucune fiche : ficheId est toujours vide.',
    ...fiches.map((f) => `- ${f.id} : ${f.nom} (${f.famille})`),
  ].join('\n');
}

export const SCHEMA_DE_L_ACHAT: Record<string, unknown> = {
  type: 'object',
  properties: {
    produits: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          photo: { type: 'integer' },
          nom: { type: 'string' },
          famille: { type: 'string', enum: [...FAMILLES_LUES] },
          quantite: { type: 'integer' },
          unite: { type: 'string' },
          cadre: { type: 'object', properties: { x: { type: 'number' }, y: { type: 'number' }, l: { type: 'number' }, h: { type: 'number' } }, required: ['x', 'y', 'l', 'h'] },
          ficheId: { type: 'string' },
        },
        required: ['photo', 'nom', 'famille', 'quantite', 'unite', 'cadre', 'ficheId'],
      },
    },
    fournisseur: { type: 'string' },
    remarques: { type: 'array', items: { type: 'string' } },
  },
  required: ['produits', 'fournisseur', 'remarques'],
};

/* ── LA LECTURE DE CE QUE CLAUDE A RENDU ───────────────────────────────── */
const UNITES = ['pièce', 'flacon', 'pot', 'paquet', 'sachet'] as const;
const borne = (v: unknown): number | null => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : null;
};

/** Le cadre gardé dans sa photo ; trop petit ou illisible : rien. */
export function cadreLu(v: unknown): CadreLu | null {
  if (!v || typeof v !== 'object') return null;
  const c = v as Record<string, unknown>;
  const x = borne(c.x); const y = borne(c.y); const l0 = borne(c.l); const h0 = borne(c.h);
  if (x === null || y === null || l0 === null || h0 === null) return null;
  const l = Math.min(l0, 1 - x); const h = Math.min(h0, 1 - y);
  if (l < 0.02 || h < 0.02) return null;
  const r = (n: number) => Math.round(n * 1000) / 1000;
  return { x: r(x), y: r(y), l: r(l), h: r(h) };
}

export function lectureDeLAchat(brut: unknown, o: { photos: number; fiches: readonly FicheConnue[] }): AchatLu | null {
  if (!brut || typeof brut !== 'object') return null;
  const b = brut as { produits?: unknown; fournisseur?: unknown; remarques?: unknown };
  if (!Array.isArray(b.produits)) return null;
  const avertissements: string[] = (Array.isArray(b.remarques) ? b.remarques : [])
    .filter((x): x is string => typeof x === 'string' && x.trim().length > 0).map((x) => x.trim().slice(0, 200)).slice(0, 8);
  const ids = new Set(o.fiches.map((f) => f.id));
  const parNom = new Map(o.fiches.filter((f) => f.actif !== false).map((f) => [nomComparable(f.nom), f.id]));
  const produits: ProduitLu[] = [];
  for (const brutP of b.produits.slice(0, PRODUITS_MAX)) {
    if (!brutP || typeof brutP !== 'object') continue;
    const p = brutP as Record<string, unknown>;
    const nom = String(p.nom ?? '').replace(/\s+/g, ' ').trim().slice(0, 80);
    if (!nom) continue;
    let famille = p.famille as FamilleLue;
    if (!FAMILLES_LUES.includes(famille)) { famille = 'consommable'; avertissements.push(`« ${nom} » : famille illisible, mise en Consommable.`); }
    let quantite = Number(p.quantite);
    if (!Number.isInteger(quantite) || quantite < 1 || quantite > QUANTITE_MAX) { quantite = 1; avertissements.push(`« ${nom} » : quantité illisible, mise à 1.`); }
    const unite = UNITES.includes(p.unite as (typeof UNITES)[number]) ? String(p.unite) : 'pièce';
    const photo = Number.isInteger(p.photo) && (p.photo as number) >= 0 && (p.photo as number) < o.photos ? p.photo as number : 0;
    const proposee = String(p.ficheId ?? '');
    const ficheId = ids.has(proposee) ? proposee : (parNom.get(nomComparable(nom)) ?? '');
    const deja = produits.find((x) => nomComparable(x.nom) === nomComparable(nom) && x.ficheId === ficheId);
    if (deja) { deja.quantite = Math.min(QUANTITE_MAX, deja.quantite + quantite); avertissements.push(`« ${nom} » vu deux fois : une seule ligne, quantités additionnées.`); continue; }
    produits.push({ photo, nom, famille, quantite, unite, cadre: cadreLu(p.cadre), ficheId });
  }
  const fournisseur = String(b.fournisseur ?? '').replace(/\s+/g, ' ').trim().slice(0, 80);
  return { produits, fournisseur, avertissements };
}

/* ── LES LIGNES DE L'ÉCRAN ─────────────────────────────────────────────── */
export type LigneDAchat = {
  id: string;
  nom: string;
  famille: FamilleLue;
  unite: string;
  quantite: number;
  /** Le prix unitaire payé, en francs ; null tant qu'il n'est pas écrit. */
  prix: number | null;
  /** Une fiche du stock, ou vide : une fiche nouvelle naîtra. */
  ficheId: string;
  photo?: number;
  cadre?: CadreLu | null;
};

/** Les lignes que la lecture propose. Une fiche connue prête son dernier prix
    d'achat comme point de départ ; une fiche nouvelle attend le sien. */
export function lignesDepuisLaLecture(lu: AchatLu, fiches: readonly FicheConnue[], nouvelId: () => string): LigneDAchat[] {
  const parId = new Map(fiches.map((f) => [f.id, f]));
  return lu.produits.map((p) => {
    const f = p.ficheId ? parId.get(p.ficheId) : undefined;
    return {
      id: nouvelId(), nom: f?.nom ?? p.nom, famille: p.famille, unite: p.unite, quantite: p.quantite,
      prix: f && (f.prixAchatXof ?? 0) > 0 ? Math.round(f.prixAchatXof as number) : null,
      ficheId: p.ficheId, photo: p.photo, cadre: p.cadre,
    };
  });
}

export const totalDeLaLigne = (l: Pick<LigneDAchat, 'quantite' | 'prix'>): number =>
  Math.max(0, Math.round(l.quantite)) * Math.max(0, Math.round(l.prix ?? 0));
export const totalDesLignes = (lignes: readonly Pick<LigneDAchat, 'quantite' | 'prix'>[]): number =>
  lignes.reduce((n, l) => n + totalDeLaLigne(l), 0);

const fr = (n: number): string => `${String(Math.round(Math.abs(n))).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} F`;

export type Compteur = { totalXof: number; payeXof: number; ecartXof: number; juste: boolean; dit: string };

/** LE COMPTEUR : les lignes contre ce qui a été payé. Il ne tombe juste que
    si chaque prix est écrit et que l'écart est nul. */
export function compteurDeLAchat(lignes: readonly LigneDAchat[], payeXof: number): Compteur {
  const totalXof = totalDesLignes(lignes);
  const paye = Math.max(0, Math.round(payeXof || 0));
  const ecartXof = paye - totalXof;
  const sansPrix = lignes.filter((l) => l.prix === null).length;
  let dit: string;
  if (lignes.length === 0) dit = 'Aucune ligne : lisez les photos, ou ajoutez un produit.';
  else if (sansPrix > 0) dit = sansPrix === 1 ? 'Un prix reste à écrire.' : `${sansPrix} prix restent à écrire.`;
  else if (paye === 0) dit = 'Écrivez le montant payé.';
  else if (ecartXof === 0) dit = 'Le compte tombe juste : vous pouvez saisir.';
  else if (ecartXof > 0) dit = `Il manque ${fr(ecartXof)} de lignes : un article oublié, ou un prix à corriger.`;
  else dit = `Les lignes dépassent le payé de ${fr(-ecartXof)} : une remise du fournisseur, ou un prix à corriger.`;
  return { totalXof, payeXof: paye, ecartXof, juste: lignes.length > 0 && sansPrix === 0 && paye > 0 && ecartXof === 0, dit };
}

/* ── CE QUI MANQUE AVANT « C'EST SAISI » ───────────────────────────────── */
export type SaisieDAchat = {
  /** L'identifiant de cette saisie : un second « C'est saisi » ne refait rien. */
  saisieId: string;
  fournisseurId: string;
  /** Un fournisseur nouveau, quand `fournisseurId` est vide. */
  nouveauFournisseur?: { nom: string; telephone?: string };
  date: string;
  payeXof: number;
  /** La caisse d'où l'argent est sorti ; vide quand il a été avancé de sa poche. */
  caisse: string;
  avancee: boolean;
  porteur: string;
  lignes: LigneDAchat[];
};

export function ceQuiManqueALAchat(s: SaisieDAchat, aujourdhui: string): string[] {
  const m: string[] = [];
  if (!s.fournisseurId && !(s.nouveauFournisseur?.nom ?? '').trim()) m.push('le fournisseur');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s.date) || s.date > aujourdhui) m.push('la date de l’achat');
  if (!(s.payeXof > 0)) m.push('le montant payé');
  if (s.lignes.length === 0) m.push('au moins un produit');
  if (s.lignes.some((l) => !l.nom.trim())) m.push('le nom de chaque produit');
  if (s.lignes.some((l) => !(l.quantite > 0))) m.push('la quantité de chaque produit');
  if (s.lignes.some((l) => l.prix === null || !(l.prix >= 0))) m.push('le prix de chaque produit');
  if (!s.avancee && !s.caisse.trim()) m.push('la caisse');
  if (!s.porteur.trim()) m.push('qui a fait l’achat');
  if (m.length === 0 && compteurDeLAchat(s.lignes, s.payeXof).ecartXof !== 0) m.push('des lignes qui font le montant payé');
  return m;
}

export const ditCeQuiManqueALAchat = (m: readonly string[]): string => ditCeQuiManque(m);

/* ── LE PLAN D'ÉCRITURE ────────────────────────────────────────────────── */
export type PlanDeLAchat = {
  fournisseur: { id: string; nom: string } | { creer: { nom: string; telephone?: string } };
  nouvellesFiches: { ligneId: string; nom: string; famille: FamilleLue; unite: string; prixAchatXof: number }[];
  prixMisAJour: { ficheId: string; nom: string; avantXof: number; apresXof: number }[];
  lignesDuBon: { ligneId: string; ficheId: string; quantite: number; prixUnitaireXof: number }[];
  totalXof: number;
  unites: number;
  articles: { label: string; qty: number; unitXof: number; amountXof: number }[];
};

/** Ce que « C'est saisi » écrira, sans rien écrire. Une fiche connue garde
    son nom ; son prix d'achat devient celui du jour s'il a changé. Une ligne
    sans fiche fait naître la sienne. */
export function planDeLAchat(s: SaisieDAchat, o: { fiches: readonly FicheConnue[]; fournisseurs: readonly { id: string; nom: string }[] }): PlanDeLAchat {
  const parId = new Map(o.fiches.map((f) => [f.id, f]));
  const four = s.fournisseurId ? o.fournisseurs.find((f) => f.id === s.fournisseurId) : undefined;
  const fournisseur: PlanDeLAchat['fournisseur'] = four
    ? { id: four.id, nom: four.nom }
    : { creer: { nom: (s.nouveauFournisseur?.nom ?? '').trim(), ...(s.nouveauFournisseur?.telephone?.trim() ? { telephone: s.nouveauFournisseur.telephone.trim() } : {}) } };
  const nouvellesFiches: PlanDeLAchat['nouvellesFiches'] = [];
  const prixMisAJour: PlanDeLAchat['prixMisAJour'] = [];
  const lignesDuBon: PlanDeLAchat['lignesDuBon'] = [];
  for (const l of s.lignes) {
    const prix = Math.max(0, Math.round(l.prix ?? 0));
    const q = Math.max(1, Math.round(l.quantite));
    const f = l.ficheId ? parId.get(l.ficheId) : undefined;
    if (f) {
      if (Math.round(f.prixAchatXof ?? 0) !== prix && !prixMisAJour.some((p) => p.ficheId === f.id)) {
        prixMisAJour.push({ ficheId: f.id, nom: f.nom, avantXof: Math.round(f.prixAchatXof ?? 0), apresXof: prix });
      }
      lignesDuBon.push({ ligneId: l.id, ficheId: f.id, quantite: q, prixUnitaireXof: prix });
    } else {
      nouvellesFiches.push({ ligneId: l.id, nom: l.nom.trim(), famille: l.famille, unite: l.unite.trim() || 'pièce', prixAchatXof: prix });
      lignesDuBon.push({ ligneId: l.id, ficheId: '', quantite: q, prixUnitaireXof: prix });
    }
  }
  const articles = s.lignes.map((l) => {
    const qty = Math.max(1, Math.round(l.quantite)); const unitXof = Math.max(0, Math.round(l.prix ?? 0));
    const f = l.ficheId ? parId.get(l.ficheId) : undefined;
    return { label: (f?.nom ?? l.nom).trim(), qty, unitXof, amountXof: qty * unitXof };
  });
  return {
    fournisseur, nouvellesFiches, prixMisAJour, lignesDuBon,
    totalXof: articles.reduce((n, a) => n + a.amountXof, 0),
    unites: articles.reduce((n, a) => n + a.qty, 0),
    articles,
  };
}

/** Ce que l'écran dit après « C'est saisi ». */
export function resumeDeLAchat(p: PlanDeLAchat, o: { numero: string; nomFournisseur: string; caisse: string; avancee: boolean; porteur: string; photos: number; enAttente: boolean }): string[] {
  const n = p.nouvellesFiches.length; const c = p.lignesDuBon.length - n;
  return [
    'creer' in p.fournisseur ? `Le fournisseur ${o.nomFournisseur}, créé au répertoire.` : `Le fournisseur ${o.nomFournisseur}, déjà au répertoire.`,
    `${n} fiche${n > 1 ? 's' : ''} produit${n > 1 ? 's' : ''} nouvelle${n > 1 ? 's' : ''}, ${c} fiche${c > 1 ? 's' : ''} existante${c > 1 ? 's' : ''}${p.prixMisAJour.length ? `, dont ${p.prixMisAJour.length} au prix d’achat du jour` : ''}.`,
    `Le bon ${o.numero}, né reçu : ${p.lignesDuBon.length} ligne${p.lignesDuBon.length > 1 ? 's' : ''}, ${fr(p.totalXof)}.`,
    `${p.unites} unité${p.unites > 1 ? 's' : ''} entrée${p.unites > 1 ? 's' : ''} au stock, en ${p.lignesDuBon.length} mouvement${p.lignesDuBon.length > 1 ? 's' : ''}.`,
    `Une dépense ${CATEGORIE_DE_L_ACHAT} de ${fr(p.totalXof)}, ${o.avancee ? `avancée par ${o.porteur}` : `${o.caisse}, portée par ${o.porteur}`}${o.enAttente ? ', à valider par la direction' : ''}.`,
    o.photos > 0 ? `${o.photos === 1 ? 'La photo jointe' : `Les ${o.photos} photos jointes`} au bon et à la dépense.` : 'Aucune photo jointe.',
  ];
}
