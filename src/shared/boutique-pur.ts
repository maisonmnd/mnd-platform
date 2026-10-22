/* ══ LA BOUTIQUE DE LA MAISON — 22 octobre 2026 ══════════════════════════
   « Construis la boutique de la Maison avec ses produits », puis « rajoute la
   collection des habits MND kids et les t-shirts de la marque » (Yéman).
   Maquette validée : https://claude.ai/artifact/8dE2BEatDd94pn2CfWZRaP.

   CE FICHIER EST LE SEUL JUGE. Le site, Ma Couronne, le Trône et la fonction
   `boutique` lisent tous ici ce qu'est un article, quand la Boutique est
   ouverte, ce qui se vend et combien coûte une commande. La fonction Edge en
   porte une COPIE (Deno ne lit pas `src/`) : le banc `verifie-la-boutique`
   compare les deux, mot pour mot.

   Les arbitrages, tous tranchés par elle au sélecteur :
   · un seul catalogue, tenu au Trône, vendu sur le site ET dans Ma Couronne ;
   · deux portes : KkiaPay tout de suite, ou « je règle au retrait » ;
   · retrait à la Maison offert, ou livraison dans Cotonou ;
   · un article sans prix, sans stock ou retiré de la vente reste visible,
     « Bientôt », avec « Me prévenir » ; la Maison écrit une fois ;
   · les éditions de saison se vendent le mois d'avant et leur mois ;
   · XS à XXL, et 3-4 ans à 13-14 ans pour MND Kids ;
   · la Boutique est INVISIBLE du public jusqu'à la date d'ouverture, qu'elle
     déplace quand elle veut. Sans date posée, elle est fermée.

   Rien ici ne lit un magasin ni le réseau : des fonctions pures, que les
   bancs rejouent. */

/* ── Les rayons, dans l'ordre de la vitrine ─────────────────────────────── */
export type RayonId = 'quotidien' | 'soin' | 'accessoires' | 'coffrets' | 'maison' | 'mnd229' | 'kids';

export const RAYONS: { id: RayonId; titre: string; dit: string; court: string; filtre: string }[] = [
  { id: 'quotidien', titre: 'Le quotidien', dit: 'à racheter toutes les 2 à 4 semaines', court: 'Toutes les 2 à 4 sem.', filtre: 'Toutes les 2 à 4 semaines' },
  { id: 'soin', titre: 'Le soin', dit: 'à racheter tous les 1 à 2 mois', court: 'Tous les 1 à 2 mois', filtre: 'Tous les 1 à 2 mois' },
  { id: 'accessoires', titre: 'Les accessoires', dit: 'la nuit et le retwist', court: 'Accessoire', filtre: 'Les accessoires' },
  { id: 'coffrets', titre: 'Coffrets et formats', dit: 'pour voyager, offrir ou remplir', court: 'Coffret ou format', filtre: 'Coffrets et formats' },
  { id: 'maison', titre: 'Les t-shirts de la Maison', dit: 'le Vestiaire, du XS au XXL', court: 'T-shirt de la Maison', filtre: 'T-shirts de la Maison' },
  { id: 'mnd229', titre: 'MND 229', dit: 'la ligne du Bénin, du XS au XXL', court: 'MND 229', filtre: 'MND 229' },
  { id: 'kids', titre: 'MND Kids', dit: 'les habits du Club, de 3 à 14 ans', court: 'MND Kids', filtre: 'MND Kids' },
];
export const rayonDe = (id: RayonId | undefined) => RAYONS.find((r) => r.id === id);

export const ADULTE = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];
export const ENFANT = ['3-4 ans', '5-6 ans', '7-8 ans', '9-10 ans', '11-12 ans', '13-14 ans'];

export const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

/** La catégorie du catalogue qui porte les articles : une LIGNE DE PRODUITS
    (`produits: true`), visible au Trône dans « Stock & Achats › La Gamme ». */
export const CATEGORIE_BOUTIQUE = 'ligne-boutique';
export const CATEGORIE_BOUTIQUE_SEMENCE = {
  id: CATEGORIE_BOUTIQUE, code: 'BTQ', fon: 'MAISON MND', label: 'La Boutique', enabled: true, produits: true, order: 32,
};

/** Préfixe des articles : un identifiant stable, jamais renuméroté. */
export const PREFIXE = 'bq-';

/* ── La fiche d'un article ───────────────────────────────────────────────
   Elle voyage DANS le produit du catalogue (`Product.boutique`) : une ligne
   par produit, lisible par le site sans compte. Le prix et le stock restent
   ceux du produit, tenus au Trône. */
export type FicheBoutique = {
  rayon: RayonId;
  /** Le nom montré à la cliente quand il diffère du nom du catalogue
      (« Le Quotidien » pour « T-shirt Le Quotidien »). */
  titre?: string;
  /** La ligne sous le titre : ingrédients, couleurs. */
  sous?: string;
  /** Format ou tailles : « 250 ml », « Du XS au XXL ». */
  format: string;
  /** Ce qu'on en fait, ou ce que montre le devant. */
  usage: string;
  /** Le flacon, le dos, la matière. */
  detail?: string;
  /** Fichiers sous /assets/boutique/ (jamais une adresse entière). */
  image: string;
  dos?: string;
  /** Le short assorti : son image ici, son PRODUIT à part (`shortDe`). */
  short?: string;
  /** Sur un short : l'identifiant de son t-shirt. Un short n'a pas de carte,
      il se choisit dans la fiche de son t-shirt. */
  shortDe?: string;
  tailles?: string[];
  /** « Édition d'octobre » : le mois se lit dans le nom. */
  edition?: string;
  /** Le t-shirt Nom de couronne : la commande porte le nom tapé. */
  perso?: boolean;
  /** Retiré de la vente par la Maison : visible, « Bientôt ». Absent = en vente. */
  enVente?: boolean;
  ordre: number;
};

/** Ce que les règles lisent d'un produit : la forme du catalogue, sans plus. */
export type ArticleLu = { id: string; name: string; priceXof: number; stock: number; boutique?: FicheBoutique };

export const titreDe = (a: ArticleLu): string => a.boutique?.titre || a.name;

/* ── Le temps de Cotonou ─────────────────────────────────────────────────
   Le Bénin vit à UTC+1, sans heure d'été : l'heure et le mois se lisent
   pareil sur le serveur, au Trône et sur le téléphone d'une cliente à Paris. */
const DECALAGE_COTONOU_MS = 60 * 60 * 1000;
export const moisDeCotonou = (maintenant: Date): number => new Date(maintenant.getTime() + DECALAGE_COTONOU_MS).getUTCMonth() + 1;

/** « 2026-12-01T09:00 » tapé au Trône, heure de Cotonou → instant ISO. */
export const ouvertureDepuisSaisie = (saisie: string): string => {
  const v = saisie.trim();
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v)) return '';
  return `${v}:00+01:00`;
};
/** L'inverse, pour remplir le champ. */
export const saisieDepuisOuverture = (ouverture: string | undefined): string => {
  const t = Date.parse(ouverture ?? '');
  if (!Number.isFinite(t)) return '';
  return new Date(t + DECALAGE_COTONOU_MS).toISOString().slice(0, 16);
};

/** OUVERTE = une date posée ET passée. Sans date, la Boutique est fermée. */
export function boutiqueOuverte(ouverture: string | undefined, maintenant: Date): boolean {
  const t = Date.parse(ouverture ?? '');
  return Number.isFinite(t) && t <= maintenant.getTime();
}

/* ── Les saisons ─────────────────────────────────────────────────────────
   Une édition se vend le mois d'avant et son mois (choix du 22 octobre) :
   Octobre Rose en septembre et octobre, Noël en novembre et décembre. */
export function moisDeLEdition(edition: string | undefined): number {
  if (!edition) return 0;
  const i = MOIS.findIndex((m) => edition.includes(m));
  return i + 1;
}
export const enSaison = (mois: number, moisVu: number): boolean => !mois || moisVu === mois || moisVu === ((mois + 10) % 12) + 1;
export const moisAvant = (mois: number): string => MOIS[(mois + 10) % 12];

/* ── L'état d'un article ─────────────────────────────────────────────────
   · cache : hors saison, ou un short (il vit dans la fiche de son t-shirt) ;
   · bientot : retiré de la vente, sans prix, ou sans stock — « Me prévenir » ;
   · vendable : tout le reste. Le stock d'un habit est celui du produit, toutes
     tailles confondues ; la Maison confirme la taille en préparant. */
export type EtatArticle = 'vendable' | 'bientot' | 'cache';
export function etatDeLArticle(a: ArticleLu, maintenant: Date): EtatArticle {
  const f = a.boutique;
  if (!f || f.shortDe) return 'cache';
  if (!enSaison(moisDeLEdition(f.edition), moisDeCotonou(maintenant))) return 'cache';
  if (f.enVente === false || !(a.priceXof > 0) || !(a.stock > 0)) return 'bientot';
  return 'vendable';
}
/** Un short se vend si son t-shirt est en vente et lui-même a prix et stock. */
export function shortVendable(short: ArticleLu | undefined, tshirt: ArticleLu, maintenant: Date): boolean {
  if (!short?.boutique) return false;
  if (etatDeLArticle(tshirt, maintenant) === 'cache') return false;
  return short.boutique.enVente !== false && short.priceXof > 0 && short.stock > 0;
}
export const articlesDuRayon = (tous: ArticleLu[], rayon: RayonId, maintenant: Date): ArticleLu[] =>
  tous
    .filter((a) => a.boutique?.rayon === rayon && etatDeLArticle(a, maintenant) !== 'cache')
    .sort((x, y) => (x.boutique!.ordre - y.boutique!.ordre) || x.id.localeCompare(y.id));
export const shortDe = (tous: ArticleLu[], tshirtId: string): ArticleLu | undefined =>
  tous.find((a) => a.boutique?.shortDe === tshirtId);

/* ── Une commande ────────────────────────────────────────────────────────
   Le prix vient du CATALOGUE, jamais du navigateur. La fonction refait ce
   calcul avant d'écrire la pièce, puis avant d'accepter un paiement. */
export type LigneDemandee = { id: string; qte: number; taille?: string; perso?: string };
export type Remise = 'retrait' | 'livraison';

export type RefusDeCommande =
  | 'fermee' | 'vide' | 'trop' | 'inconnu' | 'pas-en-vente' | 'stock' | 'taille' | 'perso' | 'adresse';

export const MAX_LIGNES = 20;
export const MAX_QTE = 10;

/** Valide les lignes et rend la commande chiffrée, ou le premier refus. */
export function chiffreLaCommande(o: {
  lignes: LigneDemandee[];
  catalogue: ArticleLu[];
  remise: Remise;
  adresse?: string;
  fraisLivraisonXof: number;
  ouverture: string | undefined;
  maintenant: Date;
}): { ok: true; lignes: { article: ArticleLu; qte: number; taille?: string; perso?: string; unitXof: number }[]; produitsXof: number; fraisXof: number; totalXof: number } | { ok: false; refus: RefusDeCommande; id?: string } {
  if (!boutiqueOuverte(o.ouverture, o.maintenant)) return { ok: false, refus: 'fermee' };
  if (!Array.isArray(o.lignes) || o.lignes.length === 0) return { ok: false, refus: 'vide' };
  if (o.lignes.length > MAX_LIGNES) return { ok: false, refus: 'trop' };
  const parId = new Map(o.catalogue.map((a) => [a.id, a]));
  const voulu = new Map<string, number>();
  const sortie: { article: ArticleLu; qte: number; taille?: string; perso?: string; unitXof: number }[] = [];
  for (const l of o.lignes) {
    const qte = Math.floor(Number(l?.qte));
    if (!(qte >= 1 && qte <= MAX_QTE)) return { ok: false, refus: 'trop', id: l?.id };
    const a = parId.get(String(l?.id ?? ''));
    if (!a?.boutique) return { ok: false, refus: 'inconnu', id: l?.id };
    const f = a.boutique;
    const tshirt = f.shortDe ? parId.get(f.shortDe) : undefined;
    if (f.shortDe ? !tshirt || !shortVendable(a, tshirt, o.maintenant) : etatDeLArticle(a, o.maintenant) !== 'vendable') {
      return { ok: false, refus: 'pas-en-vente', id: a.id };
    }
    const tailles = f.tailles ?? [];
    const taille = String(l.taille ?? '').trim();
    if (tailles.length ? !tailles.includes(taille) : taille !== '') return { ok: false, refus: 'taille', id: a.id };
    const perso = String(l.perso ?? '').trim().slice(0, 24);
    if (f.perso && !perso) return { ok: false, refus: 'perso', id: a.id };
    voulu.set(a.id, (voulu.get(a.id) ?? 0) + qte);
    if ((voulu.get(a.id) ?? 0) > a.stock) return { ok: false, refus: 'stock', id: a.id };
    sortie.push({ article: a, qte, ...(taille ? { taille } : {}), ...(f.perso ? { perso } : {}), unitXof: Math.round(a.priceXof) });
  }
  if (o.remise === 'livraison' && !String(o.adresse ?? '').trim()) return { ok: false, refus: 'adresse' };
  const produitsXof = sortie.reduce((n, l) => n + l.unitXof * l.qte, 0);
  const fraisXof = o.remise === 'livraison' ? Math.max(0, Math.round(o.fraisLivraisonXof)) : 0;
  return { ok: true, lignes: sortie, produitsXof, fraisXof, totalXof: produitsXof + fraisXof };
}

/** Le libellé d'une ligne de pièce : « Brume hydratante », « T-shirt Le
    Quotidien · M », « MND Kids · T-shirt Nom de couronne · 5-6 ans · « le Lion
    du matin » ». */
export const libelleDeLigne = (a: ArticleLu, taille?: string, perso?: string): string =>
  [a.name, taille, perso ? `« ${perso} »` : ''].filter(Boolean).join(' · ');

export const LIBELLE_LIVRAISON = 'Livraison dans Cotonou';

/** Ce que doit une pièce de la Boutique au moment de payer : chaque ligne au
    plus haut de son prix écrit et du prix du catalogue (une ligne retouchée
    à la baisse ne fait pas payer moins), plus la livraison écrite. */
export function duDeLaPiece(lignes: { produitId?: string; label?: string; qty: number; unitXof: number }[], prixDuCatalogue: (id: string) => number): number {
  let du = 0;
  for (const l of lignes) {
    const q = Math.max(0, Math.round(Number(l.qty) || 0));
    const ecrit = Math.max(0, Math.round(Number(l.unitXof) || 0));
    const cat = l.produitId ? Math.max(0, Math.round(prixDuCatalogue(l.produitId) || 0)) : 0;
    du += q * Math.max(ecrit, cat);
  }
  return du;
}

/** Le numéro d'une commande : CMD-2026-XXXX, comme celles de Ma Couronne. */
export const numeroDeCommande = (annee: number, tirage: number): string => `CMD-${annee}-${String(Math.abs(Math.floor(tirage)) % 10000).padStart(4, '0')}`;

/** La référence KkiaPay d'une commande : la fonction de rappel garde au
    registre toute transaction, et le Trône la rapproche par ce préfixe. */
export const PREFIXE_PAIEMENT = 'cmd-';
export const referenceDePaiement = (commandeId: string): string => `${PREFIXE_PAIEMENT}${commandeId}`;
export const commandeDeLaReference = (ref: string | undefined): string =>
  ref && ref.startsWith(PREFIXE_PAIEMENT) ? ref.slice(PREFIXE_PAIEMENT.length) : '';

/** La clé d'un numéro : ses huit derniers chiffres (01 51 99 77 99, +229 01…). */
export const cleDuNumero = (numero: string | undefined): string => String(numero ?? '').replace(/\D/g, '').slice(-8);
export const numeroValable = (numero: string | undefined): boolean => cleDuNumero(numero).length === 8;

/* ── LES ARTICLES À POSER ────────────────────────────────────────────────
   73 produits : 13 soins, 12 t-shirts de la Maison, 8 MND 229, 16 MND Kids et
   24 shorts. Les dix prix tapés par elle dans la maquette (22 octobre) ; les
   autres restent à 0 : « Bientôt » tant que le Trône n'a pas posé le sien.
   `articlesAPoser` ne rend que ce qui MANQUE : un prix, un stock ou une
   fiche retouchés au Trône ne s'écrasent jamais. */
type Semence = { id: string; name: string; priceXof?: number; boutique: FicheBoutique };

const SOINS: Semence[] = [
  { id: 'brume', name: 'Brume hydratante', priceXof: 6000, boutique: { rayon: 'quotidien', sous: 'Rose et aloe vera', format: '250 ml', usage: 'Tous les jours, sur les locks et le cuir chevelu.', detail: 'Flacon galet en verre indigo dépoli, brumisateur cuivre.', image: 'soin-brume.webp', ordre: 1 } },
  { id: 'huile', name: 'Huile cuir chevelu', priceXof: 12000, boutique: { rayon: 'quotidien', sous: 'Ricin et nigelle', format: '50 ml', usage: 'Tous les 2 à 3 jours, quelques gouttes entre les locks.', detail: 'Verre ambré, manchon indigo, pipette cuivre.', image: 'soin-huile.webp', ordre: 2 } },
  { id: 'shampoing', name: 'Shampoing clarifiant', priceXof: 10000, boutique: { rayon: 'quotidien', sous: 'Sans résidu', format: '500 ml', usage: 'Toutes les 1 à 2 semaines. Rince sans laisser de résidu.', detail: 'Flacon haut indigo mat, pompe cuivre.', image: 'soin-shampoing.webp', ordre: 3 } },
  { id: 'rafraichissant', name: 'Rafraîchissant', priceXof: 8000, boutique: { rayon: 'quotidien', sous: 'Entre deux lavages', format: '100 ml', usage: 'Entre deux lavages, contre les odeurs et la chaleur.', detail: 'Cylindre ivoire, bague indigo, bouchon cuivre.', image: 'soin-rafraichissant.webp', ordre: 4 } },
  { id: 'apres-shampoing', name: 'Après-shampoing léger', priceXof: 6000, boutique: { rayon: 'soin', sous: 'Non gras', format: '250 ml', usage: 'Après chaque lavage. N’alourdit pas les locks.', detail: 'Tube ivoire debout sur son bouchon cuivre.', image: 'soin-apres-shampoing.webp', ordre: 1 } },
  { id: 'gel-retwist', name: 'Gel de retwist', priceXof: 5000, boutique: { rayon: 'soin', sous: 'Tenue des racines', format: '200 ml', usage: 'Au resserrage des racines, entre deux rendez-vous.', detail: 'Pot bas en verre indigo, couvercle cuivre.', image: 'soin-gel-retwist.webp', ordre: 2 } },
  { id: 'spray-apaisant', name: 'Spray apaisant', priceXof: 5500, boutique: { rayon: 'soin', sous: 'Menthe et tea tree', format: '100 ml', usage: 'Quand le cuir chevelu démange.', detail: 'Verre ivoire dépoli, étiquette indigo, brumisateur cuivre.', image: 'soin-spray-apaisant.webp', ordre: 3 } },
  { id: 'baume', name: 'Baume pointes et bords', priceXof: 6000, boutique: { rayon: 'soin', sous: 'Karité et ricin', format: '60 ml', usage: 'Sur les pointes et les bords, au besoin.', detail: 'Boîte cuivre, couvercle indigo gravé, petite brosse.', image: 'soin-baume.webp', ordre: 4 } },
  { id: 'satin', name: 'Bonnet et foulard satin', priceXof: 4000, boutique: { rayon: 'accessoires', sous: 'Pour la nuit', format: 'Taille unique', usage: 'Chaque nuit, pour protéger les locks. À renouveler quand le satin s’use.', detail: 'Satin indigo, étiquette cuivre MND.', image: 'soin-satin.webp', ordre: 1 } },
  { id: 'pinces-lingettes', name: 'Pinces et lingettes', priceXof: 2500, boutique: { rayon: 'accessoires', sous: 'Le retwist à la maison', format: 'Lot', usage: 'Les pinces tiennent le retwist, les lingettes nettoient le cuir chevelu.', detail: 'Pinces cuivre sur plateau ivoire, sachet de lingettes indigo.', image: 'soin-pinces-lingettes.webp', ordre: 2 } },
  { id: 'mini-voyage', name: 'Mini-formats voyage', boutique: { rayon: 'coffrets', sous: 'Brume, huile, shampoing', format: '3 × 30 ml', usage: 'Pour les voyages, ou pour découvrir la gamme.', detail: 'Les trois en mini, dans une trousse transparente.', image: 'soin-mini-voyage.webp', ordre: 1 } },
  { id: 'kit', name: 'Kit post-rendez-vous', boutique: { rayon: 'coffrets', sous: 'Le rituel d’entretien', format: 'Coffret', usage: 'Proposé à la fin du rendez-vous, et ici pour l’offrir.', detail: 'Coffret indigo : brume, huile, gel et bonnet.', image: 'soin-kit.webp', ordre: 2 } },
  { id: 'recharges', name: 'Recharges', boutique: { rayon: 'coffrets', sous: 'Format éco', format: '1 L', usage: 'Pour remplir les flacons à la maison, moins cher au litre.', detail: 'Doypacks indigo à bec cuivre.', image: 'soin-recharges.webp', ordre: 3 } },
];

/* Le Vestiaire (« 04 · Vestiaire et MND 229 »). 05 L'Atelier reste à l'équipe. */
const VESTIAIRE: [string, string, string, string, string, string?][] = [
  ['01', 'Le Quotidien', 'Ivoire, col et poignets indigo', 'Le verrou couché sur la poitrine.', 'L’arche sous la nuque.'],
  ['02', 'L’Allover', 'Indigo, semis d’arches ivoire', 'Les arches de la Maison sur toute la surface.', 'Le même semis d’arches.'],
  ['03', 'Sable & Médaillon', 'Sable, manches argile', 'Le médaillon entier en bas à droite, l’arche au cœur.', 'Le médaillon entier, en bas à gauche.'],
  ['04', 'La Bande', 'Cuivre, bande indigo', 'Une bande indigo à colonne d’arches, le verrou ivoire.', 'La bande indigo de l’autre côté, l’arche sous la nuque.'],
  ['06', 'Octobre Rose', 'Rose, médaillon framboise', '« Octobre Rose, ensemble, prenons soin », les arches qui s’effacent à l’ourlet.', '« Octobre Rose » sous la nuque, les arches qui s’effacent à l’ourlet.', 'Édition d’octobre'],
  ['07', 'Noël', 'Vert sapin, or', 'Un sapin de 21 arches et « Joyeux Noël ».', 'Le verrou or, dans une poudre d’arches.', 'Édition de décembre'],
  ['08', 'Nouvel An', 'Indigo profond, or', '« 2027, Bonne année » dans des confettis d’arches.', '« Maison MND · 2027 » sous la nuque, dans les confettis d’arches.', 'Édition de janvier'],
  ['09', 'Harmattan', 'Argile et sable', 'Des arches emportées par le vent, le verrou au bas du ventre.', 'Le vent continue, l’arche sous la nuque.'],
  ['10', 'Saison des pluies', 'Bleu pluie, col indigo', 'Une pluie d’arches, l’arche ivoire au cœur.', 'Le verrou ivoire, sous une pluie d’arches.'],
  ['12', 'La Devise', 'Indigo, médaillon cuivre', 'La devise de la Maison : « mi nyɔ́ ɖɛkpɛ, votre beauté est déjà là ».', 'Le grand médaillon cuivre, « Maison MND » sous la nuque, une rangée d’arches à l’ourlet.'],
  ['13', 'Saint-Valentin', 'Ivoire, col bordeaux', 'Un cœur d’arches et « de tout cœur ».', 'Un petit cœur d’arches sous la nuque, des arches semées.', 'Édition de février'],
  ['14', 'Noël rouge et blanc', 'Rouge, jacquard d’arches', 'Le jacquard d’arches et de médaillons, « Joyeux Noël ».', 'Le même jacquard, des médaillons semés plus bas.', 'Édition de décembre'],
];

/* MND 229, la ligne du Bénin (B01 à B08). */
const LIGNE_229: [string, string, string, string, string, string?][] = [
  ['01', 'Le Tampon', 'Ivoire, tampon tricolore', 'Le tampon du 229 aux couleurs du drapeau, sur la poitrine.', 'Le petit tampon vert sous la nuque.'],
  ['02', '1er Août', 'Le drapeau porté', 'Bandes verte et rouge, le tampon ivoire, « 1er août 1960 · Fraternité, Justice, Travail ».', '« Depuis 1960, libres, et fiers de l’être », et BÉNIN.', 'Édition d’août'],
  ['03', 'Deux Deux Neuf', 'Ivoire, 229 tricolore', '« 229 » en vert, jaune et rouge, « +229 · l’indicatif du cœur ».', '« Réseau : Bénin, signal plein, toute l’année ».'],
  ['04', 'BJ', 'Indigo, trait tricolore', '« BJ » en grand et « Deux lettres, tout un pays. »', '« BJ · BEN · +229 · .bj, tous les noms d’un même pays ».'],
  ['05', 'Kwabɔ', 'Sable, six villes tamponnées', 'Le carnet de voyage : Cotonou, Ouidah, Abomey, Ganvié, Porto-Novo, Grand-Popo, « Kwabɔ, bienvenue au 229 ».', '« J’ai visité le 229, et j’y reviens ».'],
  ['06', 'Carte d’embarquement', 'Ivoire, indigo', 'Une carte d’embarquement : de vous à COO, porte 229, siège BJ, classe Hospitalité.', '« Bon voyage au 229 » et un code-barres.'],
  ['07', 'Fête du Vodoun', 'Blanc, médaillon indigo', 'Le grand médaillon, « Ouidah · 10 janvier, Fête du Vodoun ».', '« Kwabɔ » sous la nuque, un semis de médaillons à l’ourlet.', 'Édition de janvier'],
  ['08', 'Nuit de Ouidah', 'Indigo profond, blanc', 'Le tampon « Ouidah 10.01 » et « Fête du Vodoun ».', '« Ouidah · Bénin » sous la nuque, un semis de médaillons blancs.', 'Édition de janvier'],
];

/* MND Kids : la page des accessoires du 21 octobre (T1 à T10, P1, P2). */
const KIDS: [string, string, string, string, string, string?, boolean?, string[]?][] = [
  ['t-petit-verrou', 'Le t-shirt Petit verrou', 'Ivoire, indigo ou cuivre', 'Un t-shirt uni, le verrou brodé petit sur le cœur.', 'Jersey de coton, col côtelé'],
  ['t-grand-verrou', 'Le t-shirt Grand verrou', 'Indigo, cuivre', 'Le verrou en grand et « Petite Couronne » dessous.', 'Jersey de coton, impression à l’eau'],
  ['t-allover', 'Le t-shirt Allover', 'Allover indigo et ivoire', 'L’allover de la Maison partout, manches et col indigo unis.', 'Jersey de coton, impression sur toute la surface'],
  ['t-bande', 'Le t-shirt Bande cuivre', 'Indigo, bande cuivre', 'Une bande cuivre sur la poitrine, le petit verrou ivoire au-dessus.', 'Jersey de coton, bande tricotée'],
  ['t-badge', 'Le t-shirt Badge rond', 'Sable, indigo', 'Un grand badge rond : le verrou au centre, « Maison MND » et « Petites Couronnes » autour.', 'Jersey de coton, impression à l’eau'],
  ['t-cadre', 'Le t-shirt Verrou encadré', 'Ivoire, cuivre, allover indigo', 'Le verrou cuivre qui sort de son cadre.', 'Jersey de coton'],
  ['t-nom', 'Le t-shirt Nom de couronne', 'Indigo, cauris', 'Son nom de couronne, celui de son carnet, écrit en grand sous un arc de cauris.', 'Jersey de coton, personnalisé à la Maison', undefined, true],
  ['t-collier', 'Le t-shirt Collier de cauris', 'Ivoire, cauris cuivre', 'Le collier de cauris du Club et « Petite Couronne ».', 'Jersey de coton'],
  ['t-bouh', 'Le t-shirt Bouh !', 'Nuit, encre qui brille', 'Un petit fantôme à locks, « Bouh ! » en cuivre. Il brille dans le noir.', 'Jersey de coton', 'Édition d’octobre', false, ENFANT.slice(0, 4)],
  ['polo', 'Le polo à col liseré', 'Indigo, liseré cuivre', 'Le polo des grands jours, le verrou brodé sur le cœur.', 'Piqué de coton'],
  ['pyj-court', 'Le pyjama court', 'Allover ivoire et cuivre', 'Haut à manches courtes et short, passepoil indigo, le verrou sur la poche.', 'Coton léger'],
  ['pyj-long', 'Le pyjama long', 'Allover indigo, passepoil cuivre', 'Chemise boutonnée et pantalon, assortis au bonnet de nuit du Club.', 'Satin doux ou coton'],
];
/* Les quatre enfants du Vestiaire (29 septembre), avec leur short. */
const KIDS_VESTIAIRE: [string, string, string, string][] = [
  ['11', 'Le t-shirt Médaillon MND Kids', 'Sable, manches cuivre', 'Le médaillon cuivre et « MND Kids ».'],
  ['15', 'Le t-shirt Arc-en-ciel', 'Ivoire, col bleu', 'Un arc-en-ciel d’arches et « MND Kids ».'],
  ['16', 'Le t-shirt Rayons de soleil', 'Jaune soleil, col orange', 'Un soleil d’arches autour du médaillon, « Bonjour soleil ».'],
  ['17', 'Le t-shirt On joue ?', 'Turquoise, manches jaunes', 'Une marelle d’arches et « On joue ? ».'],
];

const borneAge = (t: string[]): string => `De ${t[0].split('-')[0]} à ${t[t.length - 1].split('-')[1]}`;
const sansLeTshirt = (t: string): string => t.replace(/^Le t-shirt /, '');

function semences(): Semence[] {
  const out: Semence[] = SOINS.map((s) => ({ ...s, id: PREFIXE + s.id }));
  const avecShort = (base: Semence, imageShort: string, nomShort: string) => {
    out.push(base);
    out.push({
      id: `${base.id}-short`,
      name: nomShort,
      boutique: { rayon: base.boutique.rayon, titre: `Le short ${sansLeTshirt(base.boutique.titre ?? base.name)}`, format: base.boutique.format, usage: 'Le short assorti.', image: imageShort, shortDe: base.id, tailles: base.boutique.tailles, ordre: base.boutique.ordre },
    });
  };
  VESTIAIRE.forEach(([n, titre, sous, devant, dos, edition], i) => avecShort({
    id: `${PREFIXE}vest-${n}`, name: `T-shirt ${titre}`,
    boutique: { rayon: 'maison', titre, sous, format: 'Du XS au XXL', usage: devant, detail: dos, image: `vest-${n}-devant.webp`, dos: `vest-${n}-dos.webp`, short: `vest-${n}-short.webp`, tailles: ADULTE, ...(edition ? { edition } : {}), ordre: i + 1 },
  }, `vest-${n}-short.webp`, `Short ${titre}`));
  LIGNE_229.forEach(([n, titre, sous, devant, dos, edition], i) => avecShort({
    id: `${PREFIXE}mnd229-${n}`, name: `T-shirt MND 229 ${titre}`,
    boutique: { rayon: 'mnd229', titre, sous, format: 'Du XS au XXL', usage: devant, detail: dos, image: `mnd229-${n}-devant.webp`, dos: `mnd229-${n}-dos.webp`, short: `mnd229-${n}-short.webp`, tailles: ADULTE, ...(edition ? { edition } : {}), ordre: i + 1 },
  }, `mnd229-${n}-short.webp`, `Short MND 229 ${titre}`));
  KIDS.forEach(([k, titre, sous, usage, matiere, edition, perso, tailles], i) => {
    const t = tailles ?? ENFANT;
    out.push({
      id: `${PREFIXE}kids-${k}`, name: `MND Kids · ${titre.replace(/^Le /, '')}`,
      boutique: { rayon: 'kids', titre, sous, format: borneAge(t), usage, detail: matiere, image: `kids-${k}.webp`, tailles: t, ...(edition ? { edition } : {}), ...(perso ? { perso: true } : {}), ordre: i + 1 },
    });
  });
  KIDS_VESTIAIRE.forEach(([n, titre, sous, usage], i) => avecShort({
    id: `${PREFIXE}vest-${n}`, name: `MND Kids · ${titre.replace(/^Le /, '')}`,
    boutique: { rayon: 'kids', titre, sous, format: borneAge(ENFANT), usage, detail: 'Jersey de coton, imprimé', image: `vest-${n}-devant.webp`, dos: `vest-${n}-dos.webp`, short: `vest-${n}-short.webp`, tailles: ENFANT, ordre: KIDS.length + i + 1 },
  }, `vest-${n}-short.webp`, `MND Kids · Short ${sansLeTshirt(titre)}`));
  return out;
}
export const ARTICLES: Semence[] = /* @__PURE__ */ semences();

/** Les produits du catalogue qui MANQUENT, prêts à poser. Rien d'existant ne
    se réécrit : ni un prix retouché, ni un stock, ni une fiche. */
export function articlesAPoser<T extends { id: string; order: number }>(existants: T[]): { id: string; categoryId: string; name: string; priceXof: number; stock: number; order: number; boutique: FicheBoutique }[] {
  const deja = new Set(existants.map((p) => p.id));
  let ordre = existants.reduce((m, p) => Math.max(m, Number(p.order) || 0), 0);
  return ARTICLES.filter((s) => !deja.has(s.id)).map((s) => ({
    id: s.id,
    categoryId: CATEGORIE_BOUTIQUE,
    name: s.name,
    priceXof: s.priceXof ?? 0,
    stock: 0,
    order: ++ordre,
    boutique: s.boutique,
  }));
}
