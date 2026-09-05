import type { Service } from './catalog';

/* ═══════════════════════════════════════════════════════════════════
   L'ARBORESCENCE DES SERVICES v6 — le catalogue de la Maison.

   Deux maisons, quatre ateliers, trois axes Studio, un plateau technique
   commun. Les catégories vivent dans `CATEGORIES_SEED` (catalog.ts) ;
   ce fichier ne porte que les prestations.

   ── TROIS RÉGIMES DE PRIX, ET UN SEUL PAR LIGNE ──────────────────
   ① AU LOCK — `ratePerLock` × nombre de locks, jamais sous le plancher
      du calibre (`priceFloors`). Réservé à ce que la densité fait varier :
      la création VÈKPÈ™, le resserrage SÍNSIN™, le démontage PLT·70.
   ② TROIS NIVEAUX — une ligne par longueur (·C ·M ·L) ou par intensité,
      à prix ferme. C'est la réponse aux « fourchettes » du document v6 :
      un catalogue qui annonce « de 35 000 à 100 000 F » ne permet pas
      d'encaisser, et la règle 2 interdit de discuter le prix en caisse.
   ③ FERME — un seul prix, rien ne le module.

   ── CE QUI A ÉTÉ TRANCHÉ EN CHEMIN ───────────────────────────────
   · SÍNSIN™ : les 10 lignes de v6 (5 calibres × 2 niveaux) se réduisent
     à DEUX prestations portant chacune sa table de planchers. Le moteur
     lit le calibre de la fiche cliente ; le catalogue reste lisible.
   · STUDIO : « Nuage » (+5 000 F) et « Tout inclus » (+6 000 F) sont des
     SUPPLÉMENTS, pas des prestations — c'est le document qui le dit. Sans
     ça, les tresses passaient de 9 à 45 lignes.
   · Les prix marqués À VALIDER sont extrapolés faute de donnée : le
     document v6 ne les fournit pas et l'ancien ERP ne les a jamais vendus.
   ═══════════════════════════════════════════════════════════════════ */

/** Identifiants des calibres — voir MODEL_BANDS_SEED (pricing.ts). */
const JUM = 'cal-jumbo', MED = 'cal-medium', MIN = 'cal-mini',
      MIC = 'cal-micro', NAN = 'cal-nano', GAL = 'cal-galaxy';

type Base = {
  code: string;
  name: string;
  cat: string;
  desc?: string;
  palier?: Service['palier'];
  sessions?: number;
};

/** Prestation à prix ferme. */
const ferme = (b: Base, prix: number, dureeMin: number, dureeMax?: number): Service => ({
  id: idOf(b.code),
  code: b.code,
  categoryId: b.cat,
  name: b.name,
  description: b.desc,
  palier: b.palier ?? 'Fondation',
  priceXof: prix,
  hidePrice: false,
  priceMode: 'fixe',
  sessions: b.sessions ?? 1,
  master: '',
  durationMin: dureeMin,
  durationMaxMin: dureeMax,
  order: 0,
});

/** Prestation AU LOCK — le prix se compte lock par lock, plancher par calibre. */
const auLock = (b: Base, rate: number, floors: Record<string, number>, dureeMin: number, dureeMax?: number): Service => ({
  ...ferme(b, floors[MED] ?? Math.min(...Object.values(floors)), dureeMin, dureeMax),
  priceMode: 'variable',
  /* rate = 0 : la prestation se facture AU CALIBRE, le plancher de la tranche
     est son prix. On n'ecrit pas un tarif au lock nul, qui laisserait croire
     qu'un comptage entre dans le calcul. */
  ...(rate > 0 ? { ratePerLock: rate } : {}),
  priceFloors: floors,
  scalesWithModel: true,
  /* Un seul plancher = la prestation n'existe QUE dans ce calibre (les cinq
     créations VÈKPÈ™). Plusieurs planchers = elle sert tous les calibres
     (SÍNSIN™, le défaisage). */
  ...(Object.keys(floors).length === 1 ? { bandId: Object.keys(floors)[0] } : {}),
});

/** Trois niveaux de longueur — Court · Mi-Long · Long. La fourchette du
    document devient trois prix fermes : le bas, un palier intermédiaire, le haut. */
const troisLongueurs = (
  b: Base,
  prix: [number, number, number],
  durees: [number, number, number],
): Service[] => ['C', 'M', 'L'].map((s, i) =>
  ferme(
    { ...b, code: `${b.code}·${s}`, name: `${b.name} · ${['Court', 'Mi-Long', 'Long ou haute densité'][i]}` },
    prix[i], durees[i],
  ));

/** Identifiant stable dérivé du code ERP : `ATL·II·MIN·E` → `sv-atl-ii-min-e`.
    Le code est la seule chose qui ne bougera pas — un renommage de prestation
    ne doit jamais casser le lien d'un rendez-vous. */
function idOf(code: string): string {
  return `sv-${code.toLowerCase().replace(/[·\s]+/g, '-').replace(/[^a-z0-9-]/g, '')}`;
}

/* ─────────────────────────────────────────────────────────────────
   KÒKÒ™ — LE DIAGNOSTIC. Prestation autonome et payante, jamais offerte,
   déductible du rituel s'il est réalisé sous 45 jours.
   ───────────────────────────────────────────────────────────────── */
const KOKO: Service[] = [
  ferme({ code: 'KOKO·ORI', name: 'KÒKÒ™ Origine · Avant Création', cat: 'koko',
    desc: 'Pour la cliente sans locks. Analyse texture, cuir chevelu, morphologie, historique capillaire. Détermination du calibre recommandé. Fiche d’orientation remise.' }, 15000, 45),
  ferme({ code: 'KOKO·SUI', name: 'KÒKÒ™ Suivi · Locks Externes', cat: 'koko',
    desc: 'Pour les locks créées ailleurs. Évaluation du calibre, de la densité et de l’état. Ouverture de la fiche cliente MND, orientation vers l’Atelier approprié.' }, 10000, 30),
  ferme({ code: 'KOKO·PRE', name: 'KÒKÒ™ Prestige · Cas Complexes', cat: 'koko',
    desc: 'Locks en souffrance relevant de FÍNFÍN™ : collées, cassantes, post chimie, longue absence. Bilan écrit, pronostic, protocole rédigé. Obligatoire avant tout devis de restauration.',
    palier: 'Élévation' }, 20000, 60),
];

/* ─────────────────────────────────────────────────────────────────
   ATL·I — VÈKPÈ™ · LA NAISSANCE. Cinq créations, une par calibre.
   Le prix suit la finesse : 1 100 F par lock, vérifié sur les créations
   réellement facturées (430 locks → 473 000 F, 455 → 500 500 F). Le
   plancher de chaque ligne est le prix d'entrée annoncé par v6.
   ───────────────────────────────────────────────────────────────── */
const RATE_VEKPE = 1100;
const VEKPE: Service[] = [
  auLock({ code: 'ATL·I·JUM', name: 'VÈKPÈ™ Jumbo · La Racine Libre', cat: 'atl-i-vekpe',
    desc: '50 à 100 locks larges. Crochet ou torsion selon texture. Le format le plus rapide, idéal première expérience. Inclus : shampoing de préparation, Prélude si nécessaire, Retouches Post Création à 4 semaines.' },
    RATE_VEKPE, { [JUM]: 80000 }, 180, 240),
  auLock({ code: 'ATL·I·MED', name: 'VÈKPÈ™ Medium · La Naissance Classique', cat: 'atl-i-vekpe',
    desc: '100 à 180 locks. L’équilibre entre volume et facilité d’entretien. Le choix le plus fréquent. Inclus : shampoing de préparation, DÀNDÀN™ post pose, styling signature de sortie.' },
    RATE_VEKPE, { [MED]: 150000 }, 240, 330),
  auLock({ code: 'ATL·I·MIN', name: 'VÈKPÈ™ Mini · La Naissance Fine', cat: 'atl-i-vekpe',
    desc: '180 à 250 locks. Pose précision lock par lock. Définition élevée, tombé fluide. Inclus : DÀNDÀN™ post pose, 1 SÍNSIN™ Essentielle offert à 6 semaines, styling signature de sortie.',
    palier: 'Élévation' }, RATE_VEKPE, { [MIN]: 200000 }, 330, 420),
  auLock({ code: 'ATL·I·MIC', name: 'VÈKPÈ™ Micro · La Haute Précision', cat: 'atl-i-vekpe',
    desc: '250 à 400 locks. Travail sur 2 jours. Réservé aux clientes diagnostiquées aptes au KÒKÒ™ Origine. Inclus : DÀNDÀN™ + GBÌGBÌ™ post pose, 1 Retouches Post Création à 4 semaines, coiffure signature de sortie.',
    palier: 'Élévation', sessions: 2 }, RATE_VEKPE, { [MIC]: 350000 }, 600, 600),
  auLock({ code: 'ATL·I·NAN', name: 'VÈKPÈ™ Nano · La Couronne KPÒKPÒ™', cat: 'atl-i-vekpe',
    desc: '400 à 600 locks ultra fines. Le sommet de la création MND. Travail sur 2 jours, engagement d’entretien expliqué et validé avant pose. Inclus : DÀNDÀN™ + GBÌGBÌ™ post pose, 1 SÍNSIN™ Nano Essentielle offert à 6 semaines, coiffure signature de sortie, huile Kòfí™ 100 ml.',
    palier: 'Souveraineté', sessions: 2 }, /* Au-dela de 600 locks, la couronne existe (une cliente en porte 700) mais
       aucune creation ne la servait : elle disparaissait de la caisse, de la
       reservation et du carnet. On etend la ligne Nano plutot que d'ouvrir une
       sixieme creation — le plancher Galaxy prend le relais la ou le Nano
       s'arrete (600 x 1 100 = 660 000 F), sans rupture de prix. */
    RATE_VEKPE, { [NAN]: 500000, [GAL]: 660000 }, 720, 720),
];

/* ─────────────────────────────────────────────────────────────────
   ATL·II — GBÈJÍ™ · LA VIE. Le resserrage suit le calibre inscrit sur la
   fiche cliente : deux prestations, pas dix. Chacune porte sa table de
   planchers, reprise ligne à ligne du document v6 ; GALAXY, absent de v6,
   est calé sur le seul cas réel connu (700 locks facturés 70 000 F).
   Les tarifs au lock (100 et 125 F) viennent de l'ancien ERP, vérifiés
   sur 13 rendez-vous au franc près.
   ───────────────────────────────────────────────────────────────── */
const SINSIN: Service[] = [
  auLock({ code: 'ATL·II·E', name: 'SÍNSIN™ Essentielle · La Reprise', cat: 'atl-ii-gbeji',
    desc: 'Le resserrage seul, net et efficace. Diagnostic KÒKÒ™ intégré, resserrage lock par lock, contrôle d’uniformité, mise à jour de la fiche cliente. Styling de sortie inclus, au choix : chignon, demi-attache ou détaché structuré.' },
    100, { [JUM]: 20000, [MED]: 25000, [MIN]: 35000, [MIC]: 45000, [NAN]: 55000, [GAL]: 70000 }, 45, 240),
  auLock({ code: 'ATL·II·L', name: 'SÍNSIN™ Élaborée · La Reprise Longue Durée', cat: 'atl-ii-gbeji',
    desc: 'Reprise plus minutieuse, scellement renforcé, tenue prolongée, elle espace les visites. Styling de sortie inclus.',
    palier: 'Élévation' },
    125, { [JUM]: 25000, [MED]: 35000, [MIN]: 45000, [MIC]: 55000, [NAN]: 70000, [GAL]: 90000 }, 60, 270),
];

/* ─────────────────────────────────────────────────────────────────
   ATL·III — YÈKPÈ™ · LA LUMIÈRE. Réservé aux locks saines.
   ───────────────────────────────────────────────────────────────── */
const YEKPE: Service[] = [
  ...troisLongueurs({ code: 'ATL·III·COU', name: 'YÈKPÈ™ Couleur · La Révélation Végétale', cat: 'atl-iii-yekpe',
    desc: '100 % végétale : henné, indigo, plantes africaines. Sans ammoniaque. Test colorimétrique sur mèche obligatoire. Inclus : DÀNDÀN™ post couleur, carte colorimétrique personnelle, styling signature de sortie.',
    palier: 'Élévation' }, [35000, 65000, 100000], [150, 195, 240]),
  ...troisLongueurs({ code: 'ATL·III·LUM', name: 'YÈKPÈ™ Lumière · La Brillance Signature', cat: 'atl-iii-yekpe',
    desc: 'Lissage cuticule, effet miroir. Protéines de soie, finition huile Kòfí™ MND. Tenue 3 à 4 semaines. Inclus : séchage et styling personnalisé.' },
    [25000, 40000, 55000], [60, 75, 90]),
  /* LE RAVIVEUR — 5 septembre 2026, nommé par la Maison.

     « Comment j'appelle le service pour raviver la couleur d'une
     coloration ? » La couleur ternit vers la sixième semaine, et le protocole
     s'arrêtait à J+45 : plus rien ne la ramenait, et c'est le moment où elle
     regarde ailleurs.

     DEUX MOTS ÉTAIENT PRIS. « Reprise » est SÍNSIN, le resserrage, partout
     dans le carnet et sur les pièces. « Retouches » vit au Plateau, avec le
     styling — y ranger un geste de couleur le sortirait de YÈKPÈ, là où la
     cliente le cherche.

     LES PRIX SONT UNE PROPOSITION : sous la Couleur, près de la Lumière. Ils
     se corrigent au Catalogue comme n'importe quel autre. */
  ...troisLongueurs({ code: 'ATL·III·ECL', name: 'YÈKPÈ™ Éclat · Le Raviveur de Couleur', cat: 'atl-iii-yekpe',
    desc: 'Rappel de couleur végétale entre deux colorations. Henné et plantes, sans ammoniaque, sur une couleur déjà posée. Ravive le ton et referme la cuticule. Inclus : DÀNDÀN™ post couleur et styling de sortie.' },
    [20000, 32000, 45000], [75, 90, 120]),
  ...troisLongueurs({ code: 'ATL·III·SUB', name: 'YÈKPÈ™ Sublimation · La Transformation Totale', cat: 'atl-iii-yekpe',
    desc: 'Couleur + Lumière + SÍNSIN™ le même jour. Consultation créative 30 min incluse. Inclus : coiffure signature événement avec ornement au choix, 1 Retouches Post Création à 3 semaines.',
    palier: 'Souveraineté' }, [80000, 130000, 180000], [240, 300, 360]),
];

/* ─────────────────────────────────────────────────────────────────
   ATL·IV — FÍNFÍN™ · LA RENAISSANCE. Porte d'entrée unique : KÒKÒ™ Prestige.
   Aucun devis définitif sans lui.
   ───────────────────────────────────────────────────────────────── */
const FINFIN: Service[] = [
  ...troisLongueurs({ code: 'ATL·IV·GBE', name: 'GBÌGBÌ™ Essentiel · La Reconstruction', cat: 'atl-iv-finfin',
    desc: 'Locks fragilisées ou post chimiques, récupérables. Deux phases : WÈWÈ™ puis GBÌGBÌ™, resserrage des zones critiques. Inclus : plan de soin 3 mois rédigé, 1 Retouches Post Restauration offerte à 4 semaines.',
    palier: 'Élévation' }, [40000, 60000, 80000], [120, 150, 180]),
  ...troisLongueurs({ code: 'ATL·IV·GBP', name: 'GBÌGBÌ™ Profond · La Reconstruction Intensive', cat: 'atl-iv-finfin',
    desc: 'Locks très abîmées. Fermeture de locks ouvertes, anti-casse intensif, protocole multi-séances. Prix de la séance 1. Inclus : bilan écrit, 2 Retouches Post Restauration sur 6 semaines, 1 DÀNDÀN™ offert entre les séances.',
    palier: 'Souveraineté' }, [90000, 120000, 150000], [180, 240, 300]),
  ...troisLongueurs({ code: 'ATL·IV·ALA', name: 'ÀLÀLÀ™ · La Grande Renaissance', cat: 'atl-iv-finfin',
    desc: 'Le rituel le plus complet. Séparation et démêlage de locks collées, reconstruction totale, repose partielle si nécessaire. Engagement 3 séances minimum. Inclus : 3 GBÌGBÌ™ + 3 DÀNDÀN™ répartis, plan de soin 6 mois, 2 Retouches Post Restauration aux semaines 4 et 10, coiffure signature de sortie à la séance 3.',
    palier: 'Souveraineté', sessions: 3 }, [150000, 200000, 250000], [720, 900, 1080]),
];

/* ─────────────────────────────────────────────────────────────────
   LE PLATEAU TECHNIQUE — sans maison, vendable des deux côtés.
   ───────────────────────────────────────────────────────────────── */
const PLATEAU: Service[] = [
  /* PLT·05 · KLƆKLƆ™ — Le Lavage Rituel. Trois profondeurs, et la longueur
     pilote la fourchette de chacune. Remplace le GBÈZÀ™ de l'ancien ERP,
     vendu 315 fois — la famille la plus vendue après le resserrage. */
  ...troisLongueurs({ code: 'PLT·05·ESS', name: 'KLƆKLƆ™ Essentiel · « Le Souffle »', cat: 'plt-05',
    desc: 'Nettoyage express du cuir chevelu et des longueurs, rinçage soigné, séchage léger. Le lavage d’entretien entre deux rituels.' },
    [8000, 10000, 12000], [30, 35, 40]),
  ...troisLongueurs({ code: 'PLT·05·SIG', name: 'KLƆKLƆ™ Signature · « L’Ancrage »', cat: 'plt-05',
    desc: 'Double shampoing, massage crânien 10 min, soin démêlant et hydratant, séchage soigné. Le lavage complet le plus demandé.' },
    [15000, 18000, 20000], [50, 60, 70]),
  ...troisLongueurs({ code: 'PLT·05·PRE', name: 'KLƆKLƆ™ Prestige · « La Dépose »', cat: 'plt-05',
    desc: 'Bain d’huile pré-shampoing, double lavage, massage prolongé, masque profond sous chaleur douce, séchage et styling de sortie. Le rituel cérémonial complet.',
    palier: 'Élévation' }, [28000, 33000, 38000], [75, 82, 90]),

  /* PLT·10 · DÀNDÀN™ */
  ...troisLongueurs({ code: 'PLT·10', name: 'DÀNDÀN™ · Le Soin Hydratant', cat: 'plt-10',
    desc: 'Hydratation profonde aux huiles végétales béninoises. Masque aux 7 huiles. Adapté à toute texture, lockée ou libre.' },
    [15000, 22000, 30000], [45, 70, 90]),

  /* PLT·20 · WÈWÈ™ */
  ...troisLongueurs({ code: 'PLT·20', name: 'WÈWÈ™ · La Purification', cat: 'plt-20',
    desc: 'Détox profond du cuir chevelu et de la fibre capillaire. Tous les 3 mois, ou avant tout soin réparateur.' },
    [20000, 28000, 38000], [60, 75, 90]),

  /* PLT·30 · VÍVÍVÓ™ */
  ...troisLongueurs({ code: 'PLT·30', name: 'VÍVÍVÓ™ · L’Activateur de Pousse', cat: 'plt-30',
    desc: 'Ail noir, moringa, gingembre, cannelle. Massage crânien 20 min. Stimule la pousse et densifie les zones de faiblesse.' },
    [18000, 25000, 32000], [60, 70, 75]),
  ferme({ code: 'PLT·30·CUR', name: 'Cure VÍVÍVÓ™ × 3 séances', cat: 'plt-30',
    desc: 'Trois séances de l’activateur de pousse. La seule cure du plateau dont le prix multi-séances est fixé.',
    sessions: 3 }, 65000, 210),

  /* PLT·40 · GBÌGBÌ™ Module */
  ...troisLongueurs({ code: 'PLT·40', name: 'GBÌGBÌ™ Module · Soin Reconstruction', cat: 'plt-40',
    desc: 'Version modulaire du reconstituant, ajoutable hors Atelier IV. Anti-casse, fermeture de fibre, renfort structurel.' },
    [22000, 30000, 40000], [60, 80, 95]),

  /* PLT·50 · Styling & Coiffures Signature — les livrables physiques. */
  ferme({ code: 'PLT·50·STY·E', name: 'Styling · sortie soignée', cat: 'plt-50',
    desc: 'Chignon, demi-attache ou détaché structuré, avec huile parfumée. À ajouter à tout SÍNSIN™ ou soin.' }, 2000, 20),
  ferme({ code: 'PLT·50·STY·S', name: 'Styling Signature · sortie élaborée', cat: 'plt-50',
    desc: 'Coiffure de sortie travaillée : volume, séparation nette, finition longue tenue.' }, 5000, 30),
  ...troisLongueurs({ code: 'PLT·50·EVE', name: 'Coiffure Signature Événement', cat: 'plt-50',
    desc: 'Attaché sophistiqué, ornement au choix : dorures, foulard, perles. Tient toute la journée et la soirée.' },
    [18000, 24000, 30000], [45, 52, 60]),
  ...troisLongueurs({ code: 'PLT·50·RET·C', name: 'Retouches Post Création', cat: 'plt-50',
    desc: 'Reprise des contours, rafraîchissement des baby hairs, correction de définition. À 3 ou 4 semaines après une création VÈKPÈ™ ou une pose Studio. Incluse dans plusieurs rituels et forfaits, elle apparaît alors à 0 F sur la facture.' },
    [12000, 15000, 18000], [30, 38, 45]),
  ...troisLongueurs({ code: 'PLT·50·RET·R', name: 'Retouches Post Restauration', cat: 'plt-50',
    desc: 'Contrôle des zones reconstruites, resserrage ciblé, ajustement après un rituel FÍNFÍN™. À 4 à 6 semaines.' },
    [15000, 20000, 25000], [45, 67, 90]),

  /* PLT·60 · Combinaisons officielles — lignes autonomes à prix propre. */
  ...troisLongueurs({ code: 'PLT·60·WD', name: 'WÈWÈ™ + DÀNDÀN™ · la combinaison trimestrielle', cat: 'plt-60' },
    [42000, 51000, 60000], [120, 135, 150]),
  ...troisLongueurs({ code: 'PLT·60·CL', name: 'YÈKPÈ™ Couleur + Lumière · la combinaison complète', cat: 'plt-60',
    palier: 'Élévation' }, [55000, 100000, 145000], [210, 255, 300]),

  /* PLT·45 · GBÀTÀ™ · LE DÉFAISAGE — l'acte inverse de la création : on défait
     ce que VÈKPÈ™ a posé. Le ranger sous « La Naissance » était un contresens.
     Deux niveaux, et un prix SUR DEVIS au KÒKÒ™ : le document le dit
     explicitement, parce que le temps réel varie énormément d'une tête à
     l'autre et que l'Intégral mobilise quatre prestataires. On n'invente donc
     pas un tarif au lock — le prix affiché est un point de départ. */
  { ...ferme({ code: 'PLT·45·STD', name: 'GBÀTÀ™ Standard · Le Défaisage', cat: 'plt-45',
      desc: 'Locks récentes ou larges, moins de 2 ans. Équipe de 2 à 3 prestataires. Défaisage à l’aiguille, lock par lock, pour préserver la fibre. KLƆKLƆ™ et hydratation en sortie inclus.',
      palier: 'Élévation' }, 80000, 300, 420), priceMode: 'variable' as const, priceToXof: 120000 },
  { ...ferme({ code: 'PLT·45·INT', name: 'GBÀTÀ™ Intégral · Le Défaisage', cat: 'plt-45',
      desc: 'Locks anciennes, fines ou très denses. Équipe de 4 prestataires. Défaisage mèche par mèche, reconstruction et soin du cheveu retrouvé inclus.',
      palier: 'Souveraineté' }, 120000, 480, 600), priceMode: 'variable' as const, priceToXof: 180000 },

  /* PLT·55 · LA REPRISE FRONTALE — absente du document v6, créée sur décision
     de la Maison : l'ancien ERP l'a vendue 5 fois (« SÍNSIN™ Réveil Frontal »
     et « Réveil Frontal + »). Une reprise partielle du contour, à prix ferme :
     la zone est petite et ne suit pas la densité de la tête. */
  ferme({ code: 'PLT·55·E', name: 'La Reprise Frontale · Essentielle', cat: 'plt-55',
    desc: 'Reprise du contour et des tempes seules, entre deux resserrages complets.' }, 4000, 30, 45),
  ferme({ code: 'PLT·55·L', name: 'La Reprise Frontale · Élaborée', cat: 'plt-55',
    desc: 'Reprise du contour avec scellement renforcé et finition longue durée.',
    palier: 'Élévation' }, 15000, 60, 90),

  /* PLT·70 · SOINS ANNEXES — beauté & bien-être, à la demande ou pendant un
     long rituel. Peu de créneaux, sur réservation. */
  ...troisLongueurs({ code: 'PLT·70·MAN', name: 'Manucure', cat: 'plt-70',
    desc: 'Soin des mains, limage, cuticules, pose vernis. Semi-permanent en supplément.' },
    [8000, 16000, 25000], [45, 67, 90]),
  ...troisLongueurs({ code: 'PLT·70·PED', name: 'Pédicure', cat: 'plt-70',
    desc: 'Bain, gommage, soin des pieds, pose vernis. Semi-permanent en supplément.' },
    [12000, 21000, 30000], [60, 82, 105]),
  { ...ferme({ code: 'PLT·70·PAR', name: 'Pendant le Rituel · manucure ou pédicure', cat: 'plt-70',
      desc: 'Réalisée en parallèle d’un long rituel Atelier, sans allonger la visite. Remise de 15 % sur le soin choisi.' }, 0, 0),
    priceMode: 'devis' as const, hidePrice: true },

  /* DDS · DROIT DE SERVICE — règle 6. La cliente qui apporte son produit ne
     paie pas le produit, mais elle règle LE GESTE : le temps, le poste, le bac,
     l'eau chaude, le savoir-faire. Le droit de service REMPLACE le prix produit,
     il ne s'y ajoute pas — et il est toujours facturé, sans exception. */
  ferme({ code: 'DDS·SHP·E', name: 'Droit de service · Shampoing apporté · Essentiel', cat: 'dds',
    desc: 'Lavage réalisé avec le shampoing de la cliente, au niveau KLƆKLƆ™ correspondant, moins la part produit.' }, 6000, 30, 40),
  ferme({ code: 'DDS·SHP·S', name: 'Droit de service · Shampoing apporté · Signature', cat: 'dds' }, 12000, 50, 70),
  ferme({ code: 'DDS·SHP·P', name: 'Droit de service · Shampoing apporté · Prestige', cat: 'dds' }, 28000, 75, 90),
  ...troisLongueurs({ code: 'DDS·COL', name: 'Droit de service · Couleur apportée', cat: 'dds',
    desc: 'Application d’une coloration fournie par la cliente. Le geste technique, la protection, le temps de pose et le rinçage restent dus. Décharge de responsabilité signée sur le résultat.',
    palier: 'Élévation' }, [25000, 47000, 70000], [150, 195, 240]),
  ferme({ code: 'DDS·DEC', name: 'Droit de service · Décapant apporté', cat: 'dds',
    desc: 'Shampoing clarifiant ou décapant fourni par la cliente, appliqué par MND sur locks longues.' }, 10000, 60, 80),
  ...troisLongueurs({ code: 'DDS·SOI', name: 'Droit de service · Soin ou masque apporté', cat: 'dds',
    desc: 'Application d’un soin, masque ou huile fourni par la cliente.' }, [8000, 14000, 20000], [45, 60, 90]),

  /* SUP · Préparation & suppléments. Le niveau de Prélude est constaté au KÒKÒ™. */
  ferme({ code: 'SUP·01', name: 'Prélude Express · cheveu prêt à travailler', cat: 'sup' }, 0, 15),
  ...troisLongueurs({ code: 'SUP·02', name: 'Prélude Complet · cheveux lisses, bouclés 3A à 3C', cat: 'sup' },
    [5000, 6000, 8000], [30, 38, 45]),
  ...troisLongueurs({ code: 'SUP·03', name: 'Prélude Intensif · très emmêlé, transition, cheveu lisse', cat: 'sup' },
    [8000, 10000, 12000], [45, 60, 75]),
  ferme({ code: 'SUP·10', name: 'Shampoing décapant · locks longues 40 cm et plus', cat: 'sup' }, 18000, 60, 80),
  ...troisLongueurs({ code: 'SUP·20', name: 'Démontage ancienne coiffure', cat: 'sup' },
    [3000, 4000, 5000], [45, 67, 90]),
  ferme({ code: 'SUP·30', name: 'Lock Test · Essai de Calibre', cat: 'sup',
    desc: 'Pose de 2 à 3 locks témoins dans le calibre envisagé, portées quelques jours pour valider le choix avant la création VÈKPÈ™. Déductible de la création si elle est réalisée sous 45 jours.' }, 5000, 20, 30),
  ferme({ code: 'SUP·40', name: 'Supplément longueur XXL', cat: 'sup' }, 3000, 0),
  /* Les deux options du Studio, portées ici parce qu'elles s'ajoutent à une
     prestation au lieu d'en être une. Sans elles, la matrice des tresses
     passait de 9 à 45 lignes. */
  ferme({ code: 'SUP·50', name: 'Option Nuage · technique knotless', cat: 'sup',
    desc: 'Pose sans nœud à la racine. S’ajoute à toute prestation Coiffer.' }, 5000, 0),
  ferme({ code: 'SUP·60', name: 'Option Tout inclus · mèches premium fournies', cat: 'sup',
    desc: 'La Maison fournit les mèches. S’ajoute à toute prestation Coiffer.' }, 6000, 0),
];

/* ─────────────────────────────────────────────────────────────────
   STUDIO MND · ACƆ™ — le cheveu afro dans tous ses styles.
   Ne touche jamais aux locks. Les prix sont ceux de la POSE SEULE, en
   Liberté : les options Nuage (+5 000) et Tout inclus (+6 000) s'ajoutent.
   ───────────────────────────────────────────────────────────────── */
const STUDIO: Service[] = [
  /* STU·A · COIFFER — trois calibres de tresses × trois longueurs. */
  ...['JUM', 'MOY', 'FIN'].flatMap((cal, i) => {
    const nom = ['Jumbo', 'Moyennes', 'Fines'][i];
    const prix: [number, number, number][] = [[15000, 18000, 22000], [22000, 26000, 30000], [30000, 35000, 40000]];
    const dur: [number, number, number][] = [[180, 225, 270], [240, 300, 360], [330, 405, 450]];
    return ['EPA', 'DOS', 'REI'].map((lg, j) =>
      ferme({ code: `STU·A·LIB·${cal}·${lg}`, cat: 'stu-a',
        name: `Tresses ${nom} · ${['Épaules', 'Mi-dos', 'Reins'][j]}`,
        desc: 'Pose seule, gamme Liberté. Baby hairs et finition contours inclus, plus une Retouches Post Création offerte à 2 semaines.',
        palier: i === 2 ? 'Élévation' : 'Fondation' }, prix[i][j], dur[i][j]));
  }),
  ...troisLongueurs({ code: 'STU·A·VAN', name: 'Vanilles Signature', cat: 'stu-a',
    desc: 'Sans rajouts ou avec, selon la longueur souhaitée.' }, [12000, 18000, 25000], [120, 195, 270]),
  ...troisLongueurs({ code: 'STU·A·NAT', name: 'Nattes Couronne', cat: 'stu-a',
    desc: 'Simples, classiques ou artistiques.' }, [8000, 13000, 18000], [60, 105, 150]),
  ...troisLongueurs({ code: 'STU·A·VOL', name: 'Volume Express · crochet', cat: 'stu-a' },
    [12000, 18000, 25000], [90, 135, 180]),

  /* STU·B · RÉVÉLER — l'axe qui convertit vers l'Atelier. */
  ferme({ code: 'STU·B·DIA', name: 'Diagnostic Cheveu Naturel', cat: 'stu-b',
    desc: 'Porosité, densité, objectifs. Fiche d’orientation remise. Déductible du premier service dans les 45 jours.' }, 8000, 20),
  ...troisLongueurs({ code: 'STU·B·EVE', name: 'Éveil Studio', cat: 'stu-b',
    desc: 'Wash, définition boucles, styling.' }, [8000, 11000, 15000], [60, 75, 90]),
  ...troisLongueurs({ code: 'STU·B·CPF', name: 'Coupe & Forme', cat: 'stu-b',
    desc: 'Structuration, pointes, mise en forme.' }, [10000, 14000, 18000], [45, 60, 75]),
  ferme({ code: 'STU·B·TRA', name: 'Programme Transition', cat: 'stu-b',
    desc: 'Retour au naturel accompagné. 3 séances sur 8 à 10 semaines, bilan inclus, 1 coiffure signature de clôture à la 3ᵉ séance.',
    palier: 'Élévation', sessions: 3 }, 45000, 180),

  /* STU·C · SUBLIMER — les grands jours. */
  ...troisLongueurs({ code: 'STU·C·EVE', name: 'Coiffure Événement', cat: 'stu-c',
    desc: 'Cérémonie, gala, occasion. Chignon ou styling sophistiqué.' }, [15000, 22000, 30000], [60, 90, 120]),
  ...troisLongueurs({ code: 'STU·C·SIK·1', name: 'Sika Day · Formule Essentielle', cat: 'stu-c',
    desc: 'Coiffure du jour J, en salon. Sans essai préalable.' }, [20000, 24000, 28000], [60, 75, 90]),
  ...troisLongueurs({ code: 'STU·C·SIK·2', name: 'Sika Day · Formule Signature', cat: 'stu-c',
    desc: 'Essai en amont puis coiffure du jour J, les deux rendez-vous en salon.',
    palier: 'Élévation', sessions: 2 }, [35000, 40000, 45000], [135, 142, 150]),
];

/* ─────────────────────────────────────────────────────────────────
   LES FORFAITS — code et prix propres, jamais un calcul de remise manuel.
   Les inclusions apparaissent en lignes à 0 F sur la facture (règle 4).

   ⚠ Les « économies » annoncées par v6 ne sont PAS reprises : recalculées
   sur tes propres tarifs, trois de ces forfaits coûtaient plus cher que
   l'achat à la carte au bas des fourchettes, et aucune économie n'était
   reproductible. Les prix, eux, sont repris tels quels.
   ───────────────────────────────────────────────────────────────── */
const FORFAITS: Service[] = [
  ferme({ code: 'FFT·I·01', name: 'VÈKPÈ™ Initiation · La Naissance + Trousse MND™', cat: 'atl-i-vekpe',
    desc: 'VÈKPÈ™ Medium · Kit Home Rituals™ 3 produits · guide d’entretien · 1 SÍNSIN™ Essentielle offert à 6 semaines · 1 Retouches Post Création à 3 semaines.',
    palier: 'Élévation' }, 175000, 330),
  ferme({ code: 'FFT·I·02', name: 'VÈKPÈ™ × GBÈJÍ™ · La Naissance + Les 3 Premiers Entretiens', cat: 'atl-i-vekpe',
    desc: 'VÈKPÈ™ Mini · 3 SÍNSIN™ Essentielle aux semaines 6, 10 et 14 · 2 DÀNDÀN™ · 1 coiffure signature à 3 mois.',
    palier: 'Souveraineté', sessions: 4 }, 380000, 420),
  ferme({ code: 'FFT·II·01', name: 'GBÈJÍ™ Trimestriel · Le Cycle de Vie, 3 mois', cat: 'atl-ii-gbeji',
    desc: '3 SÍNSIN™ Essentielle au calibre · 1 WÈWÈ™ · 1 DÀNDÀN™ · 1 coiffure signature au 3ᵉ mois · accès prioritaire planning.',
    palier: 'Élévation', sessions: 5 }, 130000, 105),
  ferme({ code: 'FFT·II·02', name: 'GBÈJÍ™ Annuel · Le Cycle de Vie, 12 mois', cat: 'atl-ii-gbeji',
    desc: '12 SÍNSIN™ Essentielle · 4 WÈWÈ™ · 4 DÀNDÀN™ · 2 VÍVÍVÓ™ · 2 coiffures signature semestrielles · 1 YÈKPÈ™ Lumière offert · créneau réservé annuel.',
    palier: 'Souveraineté', sessions: 24 }, 480000, 105),
  ferme({ code: 'FFT·III·01', name: 'YÈKPÈ™ × 3 · Le Cycle de Transformation, 3 mois', cat: 'atl-iii-yekpe',
    desc: '3 YÈKPÈ™ Lumière mensuels · 1 YÈKPÈ™ Couleur trimestriel · 3 SÍNSIN™ inclus · 1 coiffure signature événement à activer sur date choisie · créneau prioritaire.',
    palier: 'Élévation', sessions: 7 }, 220000, 90),
  ferme({ code: 'FFT·IV·01', name: 'Cure GBÌGBÌ™ Profond × 3 · La Reconstruction Suivie', cat: 'atl-iv-finfin',
    desc: '3 séances GBÌGBÌ™ Profond espacées de 3 semaines · 1 WÈWÈ™ en ouverture · plan de soin 6 mois · 1 Retouches Post Restauration · 1 coiffure signature de clôture.',
    palier: 'Souveraineté', sessions: 3 }, 270000, 240),
  ferme({ code: 'FFT·IV·02', name: 'FÍNFÍN™ × GBÈJÍ™ · La Renaissance + 6 Mois d’Entretien', cat: 'atl-iv-finfin',
    desc: 'ÀLÀLÀ™ complet · 6 SÍNSIN™ Essentielle mensuels au calibre · 3 DÀNDÀN™ trimestriels · 1 coiffure signature de clôture · créneau prioritaire 6 mois.',
    palier: 'Souveraineté', sessions: 10 }, 425000, 900),
];

/* ──────────────────────────────────────────────────────────────
   PILIER 3 · MND ACADÉMIE — la transmission.
   Vendue au comptoir comme une prestation (l'ancien ERP a encaissé 450 000 F
   de formation), mais SUIVIE dans le module Académie du Trône, qui tient les
   apprenants, les parcours et les certifications. Le catalogue porte le prix ;
   l'Académie porte l'élève.
   ────────────────────────────────────────────────────────────── */
const ACADEMIE: Service[] = [
  ferme({ code: 'ACA·INI·DEC', name: 'Séance Découverte · Laver & Hydrater', cat: 'aca-ini',
    desc: 'Individuel 1 à 1. Apprendre à laver, hydrater et rafraîchir ses locks correctement à la maison. Fiche routine remise.' }, 25000, 120),
  ferme({ code: 'ACA·INI·RES', name: 'Séance Resserrage · Les Racines', cat: 'aca-ini',
    desc: 'Individuel 1 à 1. Apprendre le geste du resserrage sur ses propres racines, en toute sécurité pour la fibre.' }, 35000, 180),
  ferme({ code: 'ACA·INI·AUT', name: 'Pack Autonomie · 3 séances', cat: 'aca-ini',
    desc: 'Découverte + Resserrage + séance de perfectionnement. Pour être totalement autonome sur l’entretien courant.',
    palier: 'Élévation', sessions: 3 }, 85000, 480),
  ferme({ code: 'ACA·PRO·CRE', name: 'Module Création', cat: 'aca-pro',
    desc: 'Poser des locks : les 5 calibres, techniques crochet et torsion, gestion des textures, diagnostic KÒKÒ™. La naissance VÈKPÈ™ enseignée.',
    palier: 'Élévation', sessions: 3 }, 180000, 1440),
  ferme({ code: 'ACA·PRO·ENT', name: 'Module Entretien & Restauration', cat: 'aca-pro',
    desc: 'Resserrage par calibre, soins du plateau, réparation des locks abîmées. GBÈJÍ™ et FÍNFÍN™ enseignés.',
    palier: 'Élévation', sessions: 3 }, 130000, 1440),
  ferme({ code: 'ACA·PRO·BIZ', name: 'Module Business du Salon', cat: 'aca-pro',
    desc: 'Tarification par calibre, fiche cliente, forfaits, fidélisation, gestion des produits apportés. Le système commercial MND.',
    palier: 'Élévation', sessions: 2 }, 90000, 960),
  ferme({ code: 'ACA·PRO·CERT', name: 'Cursus Certifiant Complet · KPLƆ̌N™', cat: 'aca-pro',
    desc: 'Les 3 modules réunis, certification MND remise, kit de démarrage professionnel, et droit de mention « Formée par MND ». Suivi post-formation 1 mois. Le sceau de la maison.',
    palier: 'Souveraineté', sessions: 8 }, 380000, 3840),
];

/** Le catalogue v6 complet, ordonné. `order` est réattribué ici pour que
    l'écran suive l'arborescence du document sans que chaque ligne ait à le dire. */
export const CATALOG_V6: Service[] = [...KOKO, ...VEKPE, ...SINSIN, ...YEKPE, ...FINFIN, ...PLATEAU, ...STUDIO, ...ACADEMIE, ...FORFAITS]
  .map((s, i) => ({ ...s, order: i }));

/* ═══════════════════════════════════════════════════════════════════
   LA GAMME — reprise de la gamme réellement vendue, avec ses prix et
   ses stocks au 2 août 2026.

   Trois décisions prises en la reprenant :
   ① « Vapo Hydra Mist 200ML » et « Vapo Hydra Mist 200 ml » étaient DEUX
      fiches du même produit — l'une vendue 8 fois, l'autre jamais. Elles
      sont fusionnées, stocks additionnés (2 + 6 = 8). Deux fiches pour un
      produit, c'est un stock qui ment et un réassort qu'on rate.
   ② Les mèches et extensions sortent de HOME RITUALS™ : ce ne sont pas des
      soins à emporter, ce sont des fournitures de pose. Elles ont leur
      propre ligne, et c'est elle que consomme l'option « Tout inclus ».
   ③ « Formation MND Parcours 3 » (450 000 F) N'EST PAS un produit : c'est
      un parcours de l'Académie, qui a son propre module au Trône. La
      laisser ici gonflerait le chiffre de la Gamme d'un demi-million.
   ═══════════════════════════════════════════════════════════════════ */

export type ProductV6 = { id: string; categoryId: string; name: string; priceXof: number; stock: number; order: number };

const prod = (n: number, categoryId: string, name: string, priceXof: number, stock: number): ProductV6 =>
  ({ id: `pr-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`, categoryId, name, priceXof, stock, order: n });

export const PRODUCTS_V6: ProductV6[] = [
  /* HOME RITUALS™ — le soin à la maison. */
  prod(0, 'home-rituals', 'Vapo Hydra Mist 350 ml', 10000, 1),
  /* Deux références distinctes, décision de la Maison : elles portaient le même
     nom à une casse près (« 200ML » / « 200 ml ») et devenaient impossibles à
     distinguer au comptoir comme au réassort. Numérotées, elles gardent chacune
     son stock et son historique. */
  prod(1, 'home-rituals', 'Vapo Hydra Mist 1', 8000, 2),
  prod(2, 'home-rituals', 'Vapo Hydra Mist 2', 8000, 6),
  prod(3, 'home-rituals', 'Spray Bottle', 5000, 7),
  prod(4, 'home-rituals', 'Mini Spray Bottle', 1000, 5),
  prod(5, 'home-rituals', 'Bonnet Silk XL', 8000, 5),
  prod(6, 'home-rituals', 'Bonnet en Soie L', 7000, 9),
  prod(7, 'home-rituals', 'Bonnet Standard', 4000, 6),
  prod(8, 'home-rituals', 'Durag en Soie', 5000, 4),
  prod(9, 'home-rituals', 'Henné en Poudre', 10000, 12),
  prod(10, 'home-rituals', 'Perfectodil 5 %', 25000, 8),
  prod(11, 'home-rituals', 'T444Z', 25000, 1),
  prod(12, 'home-rituals', 'Revlon Colorsilk', 10000, 2),

  /* MÈCHES & EXTENSIONS — fournitures de pose, pas du soin à emporter. */
  prod(13, 'meches', 'Cheveux naturels', 25000, 10),
  prod(14, 'meches', 'Natural Hair 20"', 20000, 0),
  prod(15, 'meches', 'Extensions naturelles', 15000, 11),
  prod(16, 'meches', 'Extensions synthétiques', 10000, 10),
];
