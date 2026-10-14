# -*- coding: utf-8 -*-
"""Les pièces de l'équipement, leurs mesures et leurs cahiers des charges.

LES QUANTITÉS SE DÉDUISENT DE QUATRE HYPOTHÈSES, À CORRIGER ICI SEULEMENT :
le nombre de postes (un par atelier, I à IV), de bacs, de maîtres et de
clientes par jour. Le linge tourne sur trois jours : un jour servi, un jour au
lavage, un jour plié en réserve.
"""
import dessins as D

POSTES = 4
BACS = 2
MAITRES = 6
CLIENTES_JOUR = 12
ROTATION = 3


def arrondi_dizaine(n):
    return -(-int(n * 1.1) // 10) * 10


HYPOTHESES = [
    ('Postes de travail', POSTES, 'un par atelier, I à IV'),
    ('Bacs de lavage', BACS, ''),
    ('Maîtres', MAITRES, ''),
    ('Clientes par jour', CLIENTES_JOUR, 'aux jours pleins'),
]

PIECES = []


def piece(**k):
    PIECES.append(k)


# ══ LES TABLIERS ════════════════════════════════════════════════════════
piece(id='A1', famille='Tabliers', dessin=D.a1, w=700, h=1000, scene='mur',
      nom='Tablier du maître', name="Master's bib apron",
      dims_fr='70 × 90 cm, bavette de 29 cm, bretelles croisées réglables', dims_en='700 × 900 mm, bib 290 mm, adjustable cross-back straps',
      qte=2 * MAITRES, qte_fr=f'2 par maître ({MAITRES} maîtres)',
      source_fr='Un atelier de couture de Cotonou pour une petite série ; un fabricant de tabliers (Alibaba) au-delà de 50.',
      fr=dict(matiere='Toile de coton 340 g/m² indigo, apprêt déperlant sans PFAS. Bretelles en sangle cuivre de 25 mm, rivets cuivre.',
              marquage='Verrou debout brodé fil cuivre, 76 mm de large, centré sur la bavette. Prénom brodé ivoire sur la poche gauche (capitales de 9 mm, facultatif). Poche droite à trois compartiments.',
              entretien='40 °C, sans eau de Javel.',
              pourquoi='La tenue de l’équipe. Les crochets à locks, les peignes et les pinces ont chacun leur compartiment.'),
      en=dict(material='Indigo cotton canvas 340 g/m² (10 oz), PFAS-free water-repellent finish. 25 mm copper webbing straps, copper rivets.',
              branding='Stacked logo embroidered in copper thread, 76 mm wide (minimum 70 mm), centred on the bib. Optional first name in ivory on left pocket, 9 mm capitals. Right pocket split in 3 (crochet hooks, combs, clips).',
              care='40 °C, no bleach.'))

piece(id='A2', famille='Tabliers', dessin=D.a2, w=750, h=1100, scene='mur',
      nom='Tablier des couleurs (YÈKPÈ)', name='Colour apron, waterproof',
      dims_fr='75 × 100 cm, tour de cou réglable, liens à la taille', dims_en='750 × 1000 mm, adjustable neck strap, waist ties',
      qte=4, qte_fr='pour l’atelier III (couleur végétale)',
      source_fr='Un fabricant de tabliers enduits (Alibaba).',
      fr=dict(matiere='Polyester enduit PU, imperméable et essuyable, indigo profond.',
              marquage='Pictogramme cuivre en transfert, 80 mm. « YÈKPÈ · COULEUR VÉGÉTALE » en transfert cuivre au bas. Pas de broderie : ses trous laisseraient passer la teinture.',
              entretien='Rincer et essuyer après chaque couleur ; 30 °C.',
              pourquoi='Le henné et l’indigo tachent : un tablier qui s’essuie.'),
      en=dict(material='PU-coated polyester, waterproof and wipeable, deep indigo.',
              branding='Pictogram 80 mm, copper heat transfer. Text « YÈKPÈ · COULEUR VÉGÉTALE » copper heat transfer at hem. No embroidery (needle holes let dye through).',
              care='Rinse and wipe; 30 °C.'))

piece(id='A3', famille='Tabliers', dessin=D.a3, w=600, h=450, scene='mur',
      nom='Tablier de l’accueil', name='Front-desk waist apron',
      dims_fr='60 × 45 cm à la taille, liens de 80 cm', dims_en='600 × 450 mm waist apron, 800 mm ties',
      qte=2, qte_fr='pour l’accueil et la vente',
      source_fr='Un atelier de couture de Cotonou.',
      fr=dict(matiere='Toile coton et lin 220 g/m² ivoire, ceinture indigo de 44 mm, poche à deux compartiments.',
              marquage='Verrou couché brodé fil indigo, 140 mm de large (le couché se brode à 130 mm au moins).',
              entretien='40 °C.',
              pourquoi='L’accueil ne se salit pas : l’ivoire y tient, et le verrou couché s’y lit en entier.'),
      en=dict(material='Ivory cotton-linen canvas 220 g/m², 44 mm indigo waistband, 2-compartment pocket.',
              branding='Horizontal logo embroidered in indigo thread, 140 mm wide (minimum 130 mm).',
              care='40 °C.'))

# ══ LE LINGE ET LA CAPE ═════════════════════════════════════════════════
piece(id='K1', famille='Linge', dessin=D.k1, w=1400, h=1500, scene='mur',
      nom='Cape de lavage', name='Shampoo cape',
      dims_fr='140 × 150 cm, encolure réglable', dims_en='1400 × 1500 mm, adjustable neck',
      qte=BACS * 4 + 2, qte_fr=f'4 par bac ({BACS} bacs), plus 2 de réserve',
      source_fr='Un fabricant de capes de coiffure (Alibaba).',
      fr=dict(matiere='Polyester enduit PU, imperméable. Encolure souple, trois pressions cuivre.',
              marquage='Semis de pictogrammes indigo profond sur indigo, ton sur ton. Devant : le pictogramme ivoire de 130 mm, seul. Il est symétrique, il se lit pareil dans le miroir ; le verrou s’y lirait à l’envers.',
              entretien='Essuyée entre deux clientes, lavée chaque soir à 40 °C, séchée à plat.',
              pourquoi='La cliente se voit dans le miroir : la cape lui montre l’arche de la Maison, à l’endroit.'),
      en=dict(material='PU-coated polyester, waterproof. Soft adjustable neckband, 3 copper press studs.',
              branding='Tone-on-tone all-over pictogram pattern, deep indigo on indigo (repeat tile supplied). Front: ivory pictogram 130 mm, alone (it is symmetric and reads correctly in the mirror; no lettering on the front).',
              care='Wipe between clients, wash daily at 40 °C, dry flat.'))

piece(id='S1', famille='Linge', dessin=D.s1, w=500, h=900, scene='mur',
      nom='Serviette de lavage', name='Wash towel',
      dims_fr='50 × 90 cm', dims_en='500 × 900 mm',
      qte=arrondi_dizaine(CLIENTES_JOUR * 2 * ROTATION), qte_fr=f'2 par cliente, {CLIENTES_JOUR} clientes par jour, sur {ROTATION} jours',
      source_fr='Une filature d’éponge (Alibaba) pour le jacquard, à partir de quelques centaines ; brodée, dès 50.',
      fr=dict(matiere='Éponge 100 % coton peigné 550 g/m², teinte en fil indigo profond : l’eau colorée et les teintures végétales n’y marquent pas.',
              marquage='Deux bandes jacquard de 60 mm, tissées en fil cuivre à 9 cm des bords, avec une rangée de pictogrammes indigo profond de 34 mm. En petite série : le pictogramme brodé cuivre de 50 mm dans un coin.',
              entretien='60 °C, sans chlore (oxygène actif seulement), les premiers lavages à part.',
              pourquoi='Le linge du rituel KLƆKLƆ, celui que la cliente garde en mémoire.'),
      en=dict(material='100 % combed cotton terry 550 g/m², yarn-dyed deep indigo.',
              branding='Two 60 mm jacquard bands woven in copper yarn, 90 mm from each end, with a row of deep-indigo pictograms 34 mm wide at 62.5 mm pitch (artwork supplied). Small-run alternative: pictogram embroidered in copper, 50 mm, in one corner.',
              care='60 °C, chlorine-free (oxygen bleach only); wash separately at first.'))

piece(id='S2', famille='Linge', dessin=D.s2, w=720, h=300, scene='mur',
      nom='Turban de séchage', name='Microfibre hair wrap',
      dims_fr='65 × 25 cm, boucle et bouton', dims_en='650 × 250 mm, elastic loop and button',
      qte=arrondi_dizaine(CLIENTES_JOUR * ROTATION), qte_fr=f'1 par cliente sur {ROTATION} jours ; il peut aussi se vendre',
      source_fr='Un fabricant de turbans microfibre (Alibaba).',
      fr=dict(matiere='Microfibre 400 g/m² (80 % polyester, 20 % polyamide), indigo ; boucle élastique ivoire, bouton cuivre.',
              marquage='Pictogramme brodé cuivre, 40 mm, près de la boucle.',
              entretien='40 °C, sans adoucissant (il bouche la microfibre).',
              pourquoi='Les locks sèchent lentement. La microfibre boit plus vite que le coton et ne laisse pas l’humidité au cœur des locks.'),
      en=dict(material='Microfibre 400 g/m² (80/20 polyester/polyamide), indigo; ivory elastic loop, copper button.',
              branding='Pictogram embroidered in copper thread, 40 mm, near the loop.',
              care='40 °C, no fabric softener.'))

piece(id='S3', famille='Linge', dessin=D.s3, w=800, h=300, scene='mur',
      nom='Serviette de cou', name='Neck towel',
      dims_fr='80 × 30 cm', dims_en='800 × 300 mm',
      qte=arrondi_dizaine(CLIENTES_JOUR * ROTATION), qte_fr=f'1 par cliente sur {ROTATION} jours',
      source_fr='La même filature que la serviette de lavage.',
      fr=dict(matiere='Éponge coton 450 g/m² indigo, passepoil ivoire.',
              marquage='Pictogramme brodé cuivre, 36 mm, à une extrémité.',
              entretien='60 °C, sans chlore.',
              pourquoi='Sous la cape, elle garde la nuque et le t-shirt au sec.'),
      en=dict(material='Cotton terry 450 g/m², indigo, ivory piping.',
              branding='Pictogram embroidered in copper thread, 36 mm, at one end.',
              care='60 °C, chlorine-free.'))

# ══ LES FAUTEUILS ═══════════════════════════════════════════════════════
SULIN = 'catalogue Sulin (avril 2026)'
piece(id='F1', famille='Fauteuils', dessin=D.f1, w=1500, h=930, scene='sol',
      nom='Fauteuil de coiffage', name='Styling chair',
      dims_fr='65 × 48 cm, assise de 83 à 93 cm de haut, embase Ø 55 cm', dims_en='W 650 × seat depth 480 mm, height 830–930 mm, round base Ø 550 mm',
      qte=POSTES, qte_fr=f'1 par poste ({POSTES} postes)',
      source_fr=f'Guangzhou Sulin : dossier à carreaux type SL-8225 ({SULIN}, p. 42), gabarit p. 50, embase plaquée or rose p. 109 (SL-E03 ou SL-E24).',
      fr=dict(matiere='Simili-cuir PU ou microfibre indigo #1E2150, dossier à carreaux gaufrés. Pompe hydraulique, embase ronde et repose-pieds plaqués, au plus près du cuivre.',
              marquage='Pictogramme gaufré à sec (sans encre), 140 mm, au dos du dossier, à 9 cm du haut.',
              entretien='Nettoyant doux, jamais de solvant.',
              pourquoi='Vu de la salle, chaque dossier porte l’arche de la Maison.'),
      en=dict(material='Indigo PU or microfibre leather (#1E2150, send swatch), square-quilted backrest like SL-8225 (catalogue p. 42), frame 650 × 480 mm, height 830–930 (p. 50). Hydraulic pump; round base and footrest plated in the finish closest to copper #B97A4A (rose-gold plating as SL-E03 / SL-E24, p. 109; send sample).',
              branding='Blind deboss (no ink) of the pictogram, 140 mm wide, on the back of the backrest, 90 mm from the top.',
              care='Mild cleaner, no solvents.'))

piece(id='F2', famille='Fauteuils', dessin=D.f2, w=1750, h=1000, scene='sol',
      nom='Bac de lavage', name='Shampoo unit',
      dims_fr='175 × 70 cm environ, vasque profonde', dims_en='approx. 1750 × 700 mm, deep basin',
      qte=BACS, qte_fr=f'{BACS} bacs',
      source_fr=f'Guangzhou Sulin : bacs à coque ({SULIN}, p. 54 à 56).',
      fr=dict(matiere='Coque ivoire (pas noire), vasque céramique blanche de 20 cm de fond au moins, repose-nuque en silicone, mitigeur thermostatique et douchette. Garnissage indigo.',
              marquage='Médaillon cuivre Ø 120 mm sur le flanc, pictogramme gravé.',
              entretien='Vasque détartrée chaque semaine.',
              pourquoi='Des locks longues demandent une vasque profonde et une nuque bien tenue : le lavage KLƆKLƆ dure.'),
      en=dict(material='Shell type as catalogue p. 54–56. IVORY shell (not black), white ceramic basin at least 200 mm deep (long locks), silicone neck rest, thermostatic mixer and hand shower. Indigo upholstery.',
              branding='Copper medallion Ø 120 mm on the side panel, pictogram engraved (artwork supplied).',
              care='Descale weekly.'))

piece(id='F3', famille='Fauteuils', dessin=D.f3, w=720, h=800, scene='sol',
      nom='Fauteuil d’attente', name='Waiting armchair',
      dims_fr='72 × 72 × 80 cm', dims_en='720 × 720 × 800 mm',
      qte=4, qte_fr='à l’accueil',
      source_fr=f'Guangzhou Sulin ({SULIN}, p. 52, à confirmer) ou un tapissier de Cotonou.',
      fr=dict(matiere='Velours indigo (ou bouclette ivoire), pieds fuselés laiton finition cuivre de 16 cm.',
              marquage='Pictogramme brodé fil cuivre, 60 mm, en haut du dossier.',
              entretien='Brosse douce, détachant sans solvant.',
              pourquoi='La première chose qu’on touche en entrant.'),
      en=dict(material='Indigo velvet (or ivory bouclé), 160 mm tapered brass legs, copper finish.',
              branding='Pictogram embroidered in copper thread, 60 mm, top centre of the backrest (front).',
              care='Soft brush, solvent-free spot cleaner.'))

piece(id='F4', famille='Fauteuils', dessin=D.f4, w=460, h=740, scene='sol',
      nom='Tabouret du maître', name="Master's saddle stool",
      dims_fr='selle Ø 46 cm, hauteur de 52 à 72 cm', dims_en='saddle Ø 460 mm, height 520–720 mm',
      qte=MAITRES, qte_fr=f'1 par maître ({MAITRES} maîtres)',
      source_fr='À trouver : tabouret selle à roulettes (fabricants de mobilier de coiffure).',
      fr=dict(matiere='Selle PU indigo, vérin à gaz, piétement 5 branches plaqué cuivre, roulettes silencieuses.',
              marquage='Pictogramme gaufré à sec, 56 mm, à l’avant de la selle.',
              entretien='Nettoyant doux.',
              pourquoi='Une séance de locks dure des heures : la selle garde le dos du maître droit.'),
      en=dict(material='Indigo PU saddle seat, gas lift, 5-star base plated in copper finish, silent casters.',
              branding='Blind deboss of the pictogram, 56 mm, centred on the front of the seat.',
              care='Mild cleaner.'))

piece(id='F5', famille='Fauteuils', dessin=D.f5, w=400, h=400, scene='sol',
      nom='Rehausseur MND Kids', name='MND Kids booster seat',
      dims_fr='40 × 40 × 12 cm', dims_en='400 × 400 × 120 mm',
      qte=2, qte_fr='pour les enfants',
      source_fr='Un tapissier de Cotonou.',
      fr=dict(matiere='Mousse haute densité, housse PU sable déhoussable, passepoil cuivre, fond antidérapant.',
              marquage='Pictogramme cuivre 110 mm, MND indigo, KIDS cuivre, imprimés ou brodés.',
              entretien='Housse à 30 °C.',
              pourquoi='La ligne MND Kids a ses t-shirts ; elle a ici sa place au poste.'),
      en=dict(material='High-density foam, removable sand PU cover, copper piping, non-slip base.',
              branding='Copper pictogram 110 mm, « MND » in indigo, « KIDS » in copper (artwork supplied).',
              care='Cover 30 °C.'))

# ══ LES MIROIRS ═════════════════════════════════════════════════════════
MIROIRS = 'Mirror Catalog (avril 2026)'
SABLAGE_EN = (' Sandblasted (frosted) artwork is supplied AS SEEN FROM THE FRONT. If frosting is done on the back of the mirror '
              '(silver removed so the LED shines through), flip the file horizontally before production.')
piece(id='M1', famille='Miroirs', dessin=D.m1, w=700, h=1700, scene='mur', effet='halo',
      nom='Miroir arche de poste', name='Arched station mirror',
      dims_fr='70 × 170 × 4 cm, haut en arche', dims_en='700 × 1700 × 40 mm, arched top (radius 350 mm)',
      qte=POSTES, qte_fr=f'1 par poste ({POSTES} postes)',
      source_fr=f'Le fournisseur du {MIROIRS}, p. 2 à 5 (170 × 70 × 4 cm), au rayon de l’arche près.',
      fr=dict(matiere='Verre argenté 5 mm sans cuivre, film anti-éclats au dos. Cadre aluminium de 16 mm, cuivre brossé. Rétroéclairage LED blanc chaud 3000 K, interrupteur tactile et variateur.',
              marquage='Sablé et rétroéclairé : le pictogramme de 120 mm à 15 cm du haut ; en bas, « mi nyɔ́ ɖɛkpɛ » et « votre beauté est déjà là ». La cliente lit la devise dans son miroir.',
              entretien='Chiffon microfibre et eau, jamais d’ammoniaque sur le sablage.',
              pourquoi='L’arche du miroir est celle du pictogramme. Si la gravure se fait au dos, le fichier se retourne.'),
      en=dict(material='5 mm copper-free silvered glass, anti-shatter film. 16 mm aluminium frame, brushed copper finish. LED backlight WARM WHITE 3000 K (not cool white), touch switch with dimmer.',
              branding='Backlit sandblasted pictogram 120 mm wide, 150 mm below the top; the motto at the bottom (two lines, sizes in the file).' + SABLAGE_EN,
              care='Microfibre cloth and water; no ammonia on frosted areas.'))

piece(id='M2', famille='Miroirs', dessin=D.m2, w=800, h=800, scene='mur', effet='halo',
      nom='Miroir rond de la consultation', name='Round consultation mirror',
      dims_fr='Ø 80 cm', dims_en='Ø 800 mm',
      qte=1, qte_fr='pour KÒKÒ, la consultation',
      source_fr=f'Le fournisseur du {MIROIRS}, p. 6 (Ø 80 cm).',
      fr=dict(matiere='Verre argenté 5 mm, cadre cuivre brossé de 16 mm, LED 3000 K.',
              marquage='Pictogramme sablé de 90 mm en haut ; la devise entière sur le pourtour du bas.',
              entretien='Comme le miroir de poste.',
              pourquoi='Le rond de la consultation, où l’on parle avant de toucher.'),
      en=dict(material='5 mm silvered glass, 16 mm brushed copper frame, LED 3000 K.',
              branding='Sandblasted pictogram 90 mm at the top; the full motto along the lower edge.' + SABLAGE_EN,
              care='As M1.'))

piece(id='M3', famille='Miroirs', dessin=D.m3, w=880, h=2000, scene='sol', effet='halo',
      nom='Miroir double face sur socle', name='Double-sided floor mirror',
      dims_fr='80 × 200 cm, socle de 88 × 12 cm', dims_en='800 × 2000 mm, base 880 × 120 mm',
      qte=0, qte_fr='en option, selon le plan de la Maison',
      source_fr=f'Le fournisseur du {MIROIRS}, p. 19 et 22 (double face, 200 × 80 cm).',
      fr=dict(matiere='Deux faces identiques, cadre cuivre, socle marbre clair ou ivoire, LED 3000 K.',
              marquage='Sur chaque face, le pictogramme de 130 mm et la devise, comme le miroir de poste.',
              entretien='Comme le miroir de poste.',
              pourquoi='Deux postes dos à dos au milieu d’une pièce, si le plan le demande.'),
      en=dict(material='Two identical faces, copper frame, light marble or ivory base, LED 3000 K.',
              branding='Each face: pictogram 130 mm and the motto, as M1.' + SABLAGE_EN,
              care='As M1.'))

piece(id='M4', famille='Miroirs', dessin=D.m4, w=520, h=350, scene='mur',
      nom='Miroir à main', name='Hand mirror',
      dims_fr='Ø 22 cm, manche de 13 cm', dims_en='Ø 220 mm, handle 130 mm',
      qte=POSTES, qte_fr=f'1 par poste ({POSTES} postes)',
      source_fr='Un fabricant de miroirs à main en laiton (Alibaba).',
      fr=dict(matiere='Laiton finition cuivre (PVD), verre 3 mm.',
              marquage='Gravure laser au dos : le pictogramme de 60 mm au centre, « mi nyɔ́ ɖɛkpɛ » sur le haut du pourtour, « votre beauté est déjà là » sur le bas.',
              entretien='Chiffon doux.',
              pourquoi='Pour montrer à la cliente l’arrière de ses locks, et la devise quand elle le repose.'),
      en=dict(material='Brass with copper PVD finish, 3 mm glass.',
              branding='Laser engraving on the back: pictogram 60 mm in the centre, « mi nyɔ́ ɖɛkpɛ » on the upper ring, « votre beauté est déjà là » on the lower ring (artwork supplied). The Fon letters ɔ ɖ ɛ and the accent on ɔ́ are outlined in the file: never retype them.',
              care='Soft cloth.'))
