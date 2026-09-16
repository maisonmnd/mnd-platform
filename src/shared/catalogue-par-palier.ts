import { LONGUEURS, type LongueurId, type Service } from './catalog';
import { PALIERS, RANG_DU_PALIER, seuilsPropres, type Palier, type SeuilsDePalier } from './paliers';

/* ══ LE CATALOGUE PAR PALIER — 16 septembre 2026 ═════════════════════════
   Maquette `public/maquette-le-catalogue-par-palier.html`, validée.

   « Refais l'UI de la page Catalogue. Mets bien en évidence les différents
   paliers. Que ce soit visible et compréhensible » (Yéman).

   LE PALIER SE LIT AVANT LE PRIX. Ce fichier est pur : il dit comment le
   catalogue se LIT par palier, le chiffre romain, le seuil auquel une
   cliente y arrive, les longueurs d'une même prestation ramenées à une
   ligne, les prestations d'un atelier groupées par marche. L'écran dessine
   ce qu'il rend. Éprouvé par `verifie-catalogue-par-palier`. */

/** LE CHIFFRE ROMAIN DU PALIER, le même qu'à l'Académie (Palier I, II, III) :
    c'est la même échelle, côté main. */
export const CHIFFRE_DU_PALIER: Record<Palier, string> = { Fondation: 'I', 'Élévation': 'II', 'Souveraineté': 'III' };

const ordinal = (n: number): string => (n === 1 ? '1ᵉʳ' : `${n}ᵉ`);

/** LE SEUIL AUQUEL LA CLIENTE Y ARRIVE, dit comme la règle des paliers le
    juge (`palierDeLaCliente`), avec les seuils réglés dans Paramètres. La
    bande d'un palier le dit sous ce que l'acte exige : on lit d'un côté ce
    que la main doit savoir, de l'autre où en est la cliente qui le reçoit. */
export function seuilDit(p: Palier, seuils?: Partial<SeuilsDePalier>): string {
  const s = seuilsPropres(seuils);
  if (p === 'Fondation') return 'dès son premier rituel honoré';
  if (p === 'Élévation') return `au ${ordinal(s.elevationRituels)} rituel honoré, ou après ${s.elevationMois} mois de couronne`;
  return `au premier acte de Souveraineté honoré, ou après ${s.souveraineteMois} mois de couronne`;
}

/* ── LES LONGUEURS, SUR UNE LIGNE ────────────────────────────────────── */

/** LA LONGUEUR LUE AU BOUT DU NOM : « KLƆKLƆ™ Essentiel · « Le Souffle » ·
    Court ». La semence écrit les trois fiches d'une prestation ainsi, avec
    le libellé exact des longueurs du Trône ; on ne devine rien d'autre. */
export function longueurDuNom(name: string): { base: string; longueur?: LongueurId } {
  const m = name.match(/^(.*?)\s*·\s*(Court|Mi-Long|Long ou haute densité)\s*$/i);
  if (!m) return { base: name.trim() };
  const lab = m[2].toLowerCase();
  const l = LONGUEURS.find((x) => x.label.toLowerCase() === lab);
  return l ? { base: m[1].trim(), longueur: l.id } : { base: name.trim() };
}

/** LE NOM ET SON SOUS-TITRE : « KÒKÒ™ Origine · Avant Création » se lit en
    deux tons, le nom en serif, le reste en petit. */
export const nomEtSous = (base: string): { nom: string; sous?: string } => {
  const i = base.indexOf(' · ');
  return i < 0 ? { nom: base } : { nom: base.slice(0, i), sous: base.slice(i + 3) };
};

export type LigneDuCatalogue = {
  /** Une clé stable pour l'écran : celle de la première fiche. */
  cle: string;
  nom: string;
  sous?: string;
  palier: Palier;
  /** Les fiches de la ligne, dans l'ordre des longueurs quand elles en ont. */
  fiches: Service[];
  /** Les longueurs de la ligne, ou vide pour une fiche seule. */
  longueurs: { id: LongueurId; service: Service }[];
};

/** LES FICHES D'UN ATELIER, RAMENÉES À DES LIGNES. Trois fiches d'un même
    nom qui ne diffèrent que par la longueur se lisent sur une ligne, avec
    leurs trois prix ; ce n'est qu'une lecture, chaque fiche existe toujours.

    ON NE REGROUPE QUE CE QUI EST BIEN LA MÊME PRESTATION : même nom de base,
    même palier, même atelier, même nombre de séances, et des longueurs
    différentes. Une fiche isolée qui porte une longueur reste une ligne à
    elle, avec la longueur dans son nom : on ne prétend pas qu'elle a des
    sœurs. L'ordre est celui de la première fiche de chaque ligne. */
export function lignesDuCatalogue(services: readonly Service[]): LigneDuCatalogue[] {
  const lignes: LigneDuCatalogue[] = [];
  const parCle = new Map<string, LigneDuCatalogue>();
  for (const s of services) {
    const { base, longueur } = longueurDuNom(s.name);
    const cle = longueur ? `${s.categoryId}|${s.palier}|${s.sessions}|${base.toLowerCase()}` : `seule|${s.id}`;
    const existante = parCle.get(cle);
    if (existante && longueur && !existante.longueurs.some((l) => l.id === longueur)) {
      existante.longueurs.push({ id: longueur, service: s });
      existante.fiches.push(s);
      continue;
    }
    const { nom, sous } = nomEtSous(base);
    const ligne: LigneDuCatalogue = {
      cle: s.id, nom, sous, palier: s.palier, fiches: [s],
      longueurs: longueur ? [{ id: longueur, service: s }] : [],
    };
    lignes.push(ligne);
    if (!existante) parCle.set(cle, ligne);
  }
  const rang = (id: LongueurId) => LONGUEURS.findIndex((l) => l.id === id);
  for (const l of lignes) {
    if (l.longueurs.length <= 1) {
      /* Une longueur seule ne fait pas une ligne de longueurs : le nom
         complet reprend sa place, tel que la fiche l'écrit. */
      if (l.longueurs.length === 1) {
        const { nom, sous } = nomEtSous(l.fiches[0].name);
        l.nom = nom; l.sous = sous; l.longueurs = [];
      }
      continue;
    }
    l.longueurs.sort((a, b) => rang(a.id) - rang(b.id));
    l.fiches = l.longueurs.map((x) => x.service);
  }
  return lignes;
}

/* ── PAR PALIER, DANS L'ATELIER ──────────────────────────────────────── */

/** LES PRESTATIONS D'UN ATELIER, GROUPÉES PAR PALIER, du plus bas au plus
    haut, dans l'ordre saisi à l'intérieur de chaque marche. Les marches
    vides ne paraissent pas. */
export function parPalier<T extends { palier: Palier }>(items: readonly T[]): { palier: Palier; items: T[] }[] {
  return PALIERS
    .map((palier) => ({ palier, items: items.filter((x) => x.palier === palier) }))
    .filter((g) => g.items.length > 0);
}

/** LE COMPTE DE L'ÉCHELLE : prestations et catégories par palier. */
export function compteParPalier(
  services: readonly Pick<Service, 'palier' | 'categoryId'>[],
): Record<Palier, { prestations: number; categories: number }> {
  const out = {} as Record<Palier, { prestations: number; categories: number }>;
  for (const p of PALIERS) {
    const siennes = services.filter((s) => s.palier === p);
    out[p] = { prestations: siennes.length, categories: new Set(siennes.map((s) => s.categoryId)).size };
  }
  return out;
}

/** LE PALIER LE PLUS HAUT d'une liste, pour dire le rail d'une ligne à
    plusieurs fiches. */
export const plusHautPalier = (paliers: readonly Palier[]): Palier =>
  paliers.reduce((h, p) => (RANG_DU_PALIER[p] > RANG_DU_PALIER[h] ? p : h), 'Fondation' as Palier);
