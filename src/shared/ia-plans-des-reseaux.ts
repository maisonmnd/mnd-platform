/* LES PLANS DES RÉSEAUX DÉJÀ PRÉPARÉS — module ÉCRIT par
   scripts/extrais-les-plans-des-reseaux.mjs à partir des maquettes
   public/maquette-*.html. Ne pas le modifier à la main : refaire le script.
   Le banc `verifie-l-atelier-des-contenus` crie s’il n’est plus à jour. */

export type EntreeDePlan = { id: string; plan: string; date: string; plateformes: string[]; format: string; serie: string; sujet: string; description: string; accroche: string; legende: string; visuel: string; note: string };

export const PLANS_DES_RESEAUX: readonly { id: string; nom: string; nombre: number }[] = [
 {
  "id": "trente-jours",
  "nom": "Trente jours de réseaux (28 septembre au 27 octobre 2026)",
  "nombre": 22
 },
 {
  "id": "instagram-mois-2-3",
  "nom": "Instagram, mois deux et trois (28 octobre au 27 décembre 2026)",
  "nombre": 35
 },
 {
  "id": "linkedin-deux-mois",
  "nom": "LinkedIn, deux mois",
  "nombre": 9
 }
];

export const ENTREES_DES_PLANS: readonly EntreeDePlan[] = [
 {
  "id": "trente-jours-2026-09-28-01",
  "plan": "trente-jours",
  "date": "2026-09-28",
  "plateformes": [
   "instagram",
   "facebook",
   "linkedin"
  ],
  "format": "post",
  "serie": "Annonce",
  "sujet": "Le nouveau nom",
  "description": "Le portrait indigo, le monogramme au centre, une phrase. Épinglé en premier sur Instagram et Facebook.",
  "accroche": "",
  "legende": "M Natural Dreadlocks devient Maison MND.\nLe nom change, la Maison reste : les mêmes mains, la même méthode, la même adresse à Suru-Léré, depuis 2010.\nUn nouveau site vous attend, et vous y réservez votre entretien en trois pas, sans créer de compte : maisonmnd.com\n#MaisonMND #LocksCotonou #Dreadlocks #Cotonou #Bénin",
  "visuel": "Sur l’image : M Natural Dreadlocks devient Maison MND.",
  "note": "Le même matin : avatar, présentation, lien et couverture changés sur les quatre réseaux. Sur LinkedIn, le même visuel en indigo sur ivoire, avec la phrase de Yéman : « Seize ans après la première couronne, la Maison prend le nom qu'elle portait déjà entre nous. »"
 },
 {
  "id": "trente-jours-2026-09-29-02",
  "plan": "trente-jours",
  "date": "2026-09-29",
  "plateformes": [
   "instagram",
   "facebook"
  ],
  "format": "story",
  "serie": "Stories",
  "sujet": "Pourquoi ce nom, en trois stories",
  "description": "Texte sur indigo, pas de photo : c'est la Maison qui parle. La troisième porte le lien vers le site, enregistrée dans la bulle « La Maison ».",
  "accroche": "",
  "legende": "",
  "visuel": "Sur l’image : Une maison, pas un salon.",
  "note": ""
 },
 {
  "id": "trente-jours-2026-09-30-03",
  "plan": "trente-jours",
  "date": "2026-09-30",
  "plateformes": [
   "instagram",
   "tiktok"
  ],
  "format": "reel",
  "serie": "La Maison",
  "sujet": "La Maison, en trente secondes",
  "description": "Le premier Reel : l'atelier, les mains de Brice, la voix de Yéman, le monogramme à la fin. Scénarimage plus bas.",
  "accroche": "",
  "legende": "Trente secondes à la Maison. Les mains qui créent, réparent et entretiennent vos couronnes depuis 2010, à Cotonou. Nouveau nom, même Maison.\nRéservez votre entretien en ligne : maisonmnd.com\n#MaisonMND #LocksCotonou #Dreadlocks",
  "visuel": "Photo : brice.jpg. Sur l’image : La Maison, en trente secondes",
  "note": ""
 },
 {
  "id": "trente-jours-2026-10-01-04",
  "plan": "trente-jours",
  "date": "2026-10-01",
  "plateformes": [
   "instagram",
   "facebook"
  ],
  "format": "post",
  "serie": "Prendre soin",
  "sujet": "Le Lavage du mois",
  "description": "L'affiche déjà prête (dossier des affiches, formats carré et récit), épinglée en deuxième sur Instagram.",
  "accroche": "",
  "legende": "Le Lavage du mois. Votre KLƆKLƆ™ Le Lavage chaque mois, et la coiffure de sortie est offerte. Vous repartez prête pour la semaine.\nImpeccable, chaque mois. Dans la Maison, au règlement, une offre à la fois.\nRéservez votre lavage : maisonmnd.com/les-offres/?utm_source=instagram&utm_medium=post&utm_campaign=lavage-du-mois\n#MaisonMND #LeLavageDuMois #LocksCotonou",
  "visuel": "Photo : entretien.jpg. Sur l’image : Le Lavage du mois",
  "note": "Une seule fois par mois, jamais de rappel dans le fil ; la story et le statut WhatsApp suffisent."
 },
 {
  "id": "trente-jours-2026-10-02-05",
  "plan": "trente-jours",
  "date": "2026-10-02",
  "plateformes": [
   "instagram",
   "facebook"
  ],
  "format": "post",
  "serie": "Transformer",
  "sujet": "La Première Couronne",
  "description": "Le portrait de la porte du site, épinglé en troisième.",
  "accroche": "",
  "legende": "Vous n'avez jamais porté de locks. Vous n'avez pas besoin de tout savoir avant de commencer : nous choisissons la méthode ensemble, à la consultation, après avoir regardé vos cheveux de près.\nQuelques centimètres suffisent pour poser une base solide.\nLa Première Couronne : maisonmnd.com/premiere-couronne/?utm_source=instagram&utm_medium=post&utm_campaign=premiere-couronne\n#MaisonMND #PremiereCouronne #LocksCotonou",
  "visuel": "Photo : portrait-accueil.jpg. Sur l’image : Vous n'avez jamais porté de locks.",
  "note": ""
 },
 {
  "id": "trente-jours-2026-10-04-06",
  "plan": "trente-jours",
  "date": "2026-10-04",
  "plateformes": [
   "instagram"
  ],
  "format": "story",
  "serie": "La Maison",
  "sujet": "Dimanche à la Maison",
  "description": "Une story vraie, prise le jour même, sans gabarit : une seule ligne de texte en Jost ivoire, le monogramme en haut. Enregistrée dans la bulle « La Maison ».",
  "accroche": "",
  "legende": "",
  "visuel": "Sur l’image : Une photo prise le jour même.",
  "note": ""
 },
 {
  "id": "trente-jours-2026-10-05-07",
  "plan": "trente-jours",
  "date": "2026-10-05",
  "plateformes": [
   "instagram",
   "facebook"
  ],
  "format": "post",
  "serie": "Comprendre",
  "sujet": "Trois signes que vos racines demandent de l'attention",
  "description": "Cinq diapositives, tirées de l'article du Journal « Comment entretenir ses racines ? ».",
  "accroche": "",
  "legende": "Trois signes que vos racines demandent de l'attention, et un faux signe qui inquiète pour rien. Faites glisser.\nLe resserrage, à la Maison, s'appelle le SÍNSIN™. Il se réserve en ligne, en trois pas : maisonmnd.com/entretien-locks/?utm_source=instagram&utm_medium=post&utm_campaign=racines\n#MaisonMND #EntretienLocks #LocksCotonou",
  "visuel": "Sur l’image : Trois signes que vos racines demandent de l'attention",
  "note": ""
 },
 {
  "id": "trente-jours-2026-10-06-08",
  "plan": "trente-jours",
  "date": "2026-10-06",
  "plateformes": [
   "linkedin"
  ],
  "format": "post",
  "serie": "Transmettre",
  "sujet": "Seize ans de patience",
  "description": "Le premier texte long, signé Yéman depuis son profil, relayé par la page. Le visuel en indigo sur ivoire. Texte complet plus bas.",
  "accroche": "",
  "legende": "",
  "visuel": "Photo : fondateurs.jpg",
  "note": ""
 },
 {
  "id": "trente-jours-2026-10-07-09",
  "plan": "trente-jours",
  "date": "2026-10-07",
  "plateformes": [
   "instagram",
   "tiktok"
  ],
  "format": "reel",
  "serie": "Le geste",
  "sujet": "Le resserrage d'une racine, en vingt secondes",
  "description": "Un seul geste, du début à la fin, en plan serré sur les mains. Scénarimage plus bas.",
  "accroche": "",
  "legende": "Une racine, vingt secondes, un geste : le SÍNSIN™. On ne serre pas plus fort, on serre juste.\nVotre entretien se réserve en ligne : maisonmnd.com\n#MaisonMND #Sinsin #LocksCotonou",
  "visuel": "Photo : attention.jpg. Sur l’image : Le resserrage d'une racine, en vingt secondes",
  "note": ""
 },
 {
  "id": "trente-jours-2026-10-09-10",
  "plan": "trente-jours",
  "date": "2026-10-09",
  "plateformes": [
   "instagram",
   "facebook"
  ],
  "format": "post",
  "serie": "Prendre soin",
  "sujet": "Créées ailleurs ? Bienvenue quand même",
  "description": "La réponse à la question qui revient le plus.",
  "accroche": "",
  "legende": "Vos locks ont été créées ailleurs, ou par vous-même ? Bienvenue quand même. À la première visite, nous regardons la méthode, les sections, l'état des racines. Puis le soin est le même pour toutes les couronnes : Purifier, Nourrir, Sceller, Couronner.\nRéservez votre entretien : maisonmnd.com/entretien-locks/?utm_source=instagram&utm_medium=post&utm_campaign=creees-ailleurs\n#MaisonMND #EntretienLocks #LocksCotonou",
  "visuel": "Photo : trois-couronnes.jpg. Sur l’image : Créées ailleurs ? Bienvenue quand même.",
  "note": ""
 },
 {
  "id": "trente-jours-2026-10-11-11",
  "plan": "trente-jours",
  "date": "2026-10-11",
  "plateformes": [
   "instagram"
  ],
  "format": "story",
  "serie": "La Maison",
  "sujet": "Dimanche à la Maison",
  "description": "Les outils, la propreté, une ligne.",
  "accroche": "",
  "legende": "",
  "visuel": "Sur l’image : Une photo prise le jour même.",
  "note": ""
 },
 {
  "id": "trente-jours-2026-10-12-12",
  "plan": "trente-jours",
  "date": "2026-10-12",
  "plateformes": [
   "instagram",
   "facebook"
  ],
  "format": "post",
  "serie": "Comprendre",
  "sujet": "Laver ses locks : quatre choses qui comptent",
  "description": "Six diapositives, tirées de « Comment laver correctement ses dreadlocks ? ». La dernière ramène au Lavage du mois.",
  "accroche": "",
  "legende": "Laver ses locks : le rythme, le produit, le geste, et le séchage, qui est la moitié du lavage. Quatre choses qui comptent, à faire glisser.\nÀ la Maison, le lavage s'appelle le KLƆKLƆ™, et ce mois-ci la coiffure de sortie est offerte : maisonmnd.com/les-offres/?utm_source=instagram&utm_medium=post&utm_campaign=lavage\n#MaisonMND #LaverSesLocks #LocksCotonou",
  "visuel": "Sur l’image : Laver ses locks : quatre choses qui comptent",
  "note": ""
 },
 {
  "id": "trente-jours-2026-10-14-13",
  "plan": "trente-jours",
  "date": "2026-10-14",
  "plateformes": [
   "instagram",
   "tiktok"
  ],
  "format": "reel",
  "serie": "Le geste",
  "sujet": "Un lavage à la Maison, du début à la fin",
  "description": "Trente secondes, quatre temps : mouiller, laver, rincer, sécher. Scénarimage plus bas.",
  "accroche": "",
  "legende": "Un lavage à la Maison, du début à la fin, en trente secondes. Mouiller longuement, laver clair, rincer jusqu'à l'eau claire, sécher vraiment.\nLe KLƆKLƆ™ se réserve en ligne : maisonmnd.com\n#MaisonMND #Kloklo #LocksCotonou",
  "visuel": "Photo : entretien.jpg. Sur l’image : Un lavage à la Maison, du début à la fin",
  "note": ""
 },
 {
  "id": "trente-jours-2026-10-16-14",
  "plan": "trente-jours",
  "date": "2026-10-16",
  "plateformes": [
   "instagram",
   "facebook"
  ],
  "format": "post",
  "serie": "Prendre soin",
  "sujet": "MND Kids",
  "description": "La photo de la porte, avec l'accord de la mère inscrit au registre. Aucun prénom.",
  "accroche": "",
  "legende": "Un enfant a besoin de temps, de douceur, et d'une main qui ne tire pas. Vous restez à ses côtés, et la visite commence par un échange avec vous.\nMND Kids : maisonmnd.com/mnd-kids/?utm_source=instagram&utm_medium=post&utm_campaign=mnd-kids\n#MaisonMND #MNDKids #LocksEnfants #Cotonou",
  "visuel": "Photo : mnd-kids.jpg. Sur l’image : Ma couronne grandit avec moi.",
  "note": ""
 },
 {
  "id": "trente-jours-2026-10-18-15",
  "plan": "trente-jours",
  "date": "2026-10-18",
  "plateformes": [
   "instagram"
  ],
  "format": "story",
  "serie": "La Maison",
  "sujet": "Dimanche à la Maison",
  "description": "",
  "accroche": "",
  "legende": "",
  "visuel": "Sur l’image : Une photo prise le jour même.",
  "note": ""
 },
 {
  "id": "trente-jours-2026-10-19-16",
  "plan": "trente-jours",
  "date": "2026-10-19",
  "plateformes": [
   "instagram",
   "facebook"
  ],
  "format": "post",
  "serie": "Comprendre",
  "sujet": "Hydrater sans étouffer",
  "description": "Six diapositives, tirées de « Comment hydrater des locks ? ». Le carrousel qui s'enregistre le plus, à parier.",
  "accroche": "",
  "legende": "L'huile n'hydrate pas : elle retient l'eau. Eau d'abord, huile ensuite, et des huiles qui entrent plutôt que des beurres qui étouffent. La routine tient en deux gestes par semaine. Faites glisser.\nÀ la Maison, l'hydratation s'appelle le DÀNDÀN™ : maisonmnd.com/soins-locks/?utm_source=instagram&utm_medium=post&utm_campaign=hydratation\n#MaisonMND #HydraterSesLocks #LocksCotonou",
  "visuel": "Sur l’image : Hydrater sans étouffer : eau d'abord, huile ensuite",
  "note": ""
 },
 {
  "id": "trente-jours-2026-10-20-17",
  "plan": "trente-jours",
  "date": "2026-10-20",
  "plateformes": [
   "linkedin"
  ],
  "format": "post",
  "serie": "Transmettre",
  "sujet": "Transmettre la méthode",
  "description": "Le second texte long : MND Formation, pour celles et ceux qui feront des locks leur métier. Texte complet plus bas.",
  "accroche": "",
  "legende": "",
  "visuel": "Photo : brice.jpg",
  "note": ""
 },
 {
  "id": "trente-jours-2026-10-21-18",
  "plan": "trente-jours",
  "date": "2026-10-21",
  "plateformes": [
   "instagram",
   "tiktok"
  ],
  "format": "reel",
  "serie": "Le geste",
  "sujet": "Ce qu'on ne fait jamais à une couronne",
  "description": "Trois gestes montrés puis corrigés, en vingt-cinq secondes. Scénarimage plus bas.",
  "accroche": "",
  "legende": "Trois choses qu'on ne fait jamais à une couronne : serrer plus fort une racine qui tire, huiler une lock sèche, la laisser humide des heures. Et ce qu'on fait à la place.\nVotre entretien se réserve en ligne : maisonmnd.com\n#MaisonMND #EntretienLocks #LocksCotonou",
  "visuel": "Photo : regard.jpg. Sur l’image : Ce qu'on ne fait jamais à une couronne",
  "note": ""
 },
 {
  "id": "trente-jours-2026-10-23-19",
  "plan": "trente-jours",
  "date": "2026-10-23",
  "plateformes": [
   "instagram",
   "facebook"
  ],
  "format": "post",
  "serie": "Prendre soin",
  "sujet": "Deux couronnes, une venue",
  "description": "La première offre familles, telle qu'elle est écrite dans la maquette des offres. La remise se dit à la Maison, jamais dans la légende.",
  "accroche": "",
  "legende": "Deux couronnes, une venue. Venez à deux, une sœur, une amie, une mère : la seconde couronne est accompagnée, et vous repartez ensemble.\nLes offres de la Maison : maisonmnd.com/les-offres/?utm_source=instagram&utm_medium=post&utm_campaign=deux-couronnes\n#MaisonMND #OffresFamilles #LocksCotonou",
  "visuel": "Photo : fondateurs.jpg. Sur l’image : Deux couronnes, une venue.",
  "note": "À condition que l'offre soit créée et « en vitrine » dans Le Trône ce jour-là ; sinon, on publie le portrait « Je veux apprendre le métier » (brice.jpg) à sa place."
 },
 {
  "id": "trente-jours-2026-10-25-20",
  "plan": "trente-jours",
  "date": "2026-10-25",
  "plateformes": [
   "instagram"
  ],
  "format": "story",
  "serie": "La Maison",
  "sujet": "Dimanche à la Maison",
  "description": "",
  "accroche": "",
  "legende": "",
  "visuel": "Sur l’image : Une photo prise le jour même.",
  "note": ""
 },
 {
  "id": "trente-jours-2026-10-26-21",
  "plan": "trente-jours",
  "date": "2026-10-26",
  "plateformes": [
   "instagram",
   "facebook"
  ],
  "format": "post",
  "serie": "Comprendre",
  "sujet": "Avant la Première Couronne : quatre choses à savoir",
  "description": "Six diapositives, tirées de « Comment commencer ses dreadlocks ? ».",
  "accroche": "",
  "legende": "Avant la Première Couronne : la longueur qu'il faut (moins que vous ne pensez), la consultation, la création, et les premiers mois. Quatre choses à savoir, à faire glisser.\nRéservez votre consultation : maisonmnd.com/premiere-couronne/?utm_source=instagram&utm_medium=post&utm_campaign=premiere-couronne\n#MaisonMND #PremiereCouronne #Dreadlocks #Cotonou",
  "visuel": "Sur l’image : Avant la Première Couronne : quatre choses à savoir",
  "note": ""
 },
 {
  "id": "trente-jours-2026-10-27-22",
  "plan": "trente-jours",
  "date": "2026-10-27",
  "plateformes": [
   "instagram"
  ],
  "format": "bilan",
  "serie": "",
  "sujet": "Le point à trente jours, et une story de merci",
  "description": "Dix minutes : les réservations par campagne dans Le Trône, le carrousel le plus enregistré, le Reel le plus regardé jusqu'au bout, les avis Google du mois. Une décision : ce qu'on refait, ce qu'on arrête.",
  "accroche": "",
  "legende": "",
  "visuel": "Sur l’image : Merci.",
  "note": ""
 },
 {
  "id": "instagram-mois-2-3-2026-10-28-01",
  "plan": "instagram-mois-2-3",
  "date": "2026-10-28",
  "plateformes": [
   "instagram",
   "tiktok"
  ],
  "format": "reel",
  "serie": "Les gestes nommés",
  "sujet": "Le DÀNDÀN™, l'hydratation aux sept huiles",
  "description": "Une couronne propre, la brume d'eau, puis les huiles, une par une, celles qui entrent puis celles qui scellent. Trente secondes.",
  "accroche": "",
  "legende": "Le DÀNDÀN™ : l'hydratation aux sept huiles, sur une couronne propre. Eau d'abord, huile ensuite ; celles qui entrent dans la fibre, puis celles qui scellent.\nVotre soin se réserve en ligne : maisonmnd.com\n#MaisonMND #Dandan #LocksCotonou",
  "visuel": "Photo : attention.jpg. Sur l’image : Le DÀNDÀN™, en trente secondes",
  "note": "« L'huile n'hydrate pas, elle retient l'eau. Alors on commence par l'eau. »"
 },
 {
  "id": "instagram-mois-2-3-2026-10-30-02",
  "plan": "instagram-mois-2-3",
  "date": "2026-10-30",
  "plateformes": [
   "instagram",
   "facebook"
  ],
  "format": "post",
  "serie": "Transformer",
  "sujet": "Ma couronne a besoin d'attention",
  "description": "Le portrait de la porte Réparation, avec ce que le Journal dit d'une lock abîmée.",
  "accroche": "",
  "legende": "Une lock qui s'affine près de la racine et tient par quelques cheveux. Une lock cassée dont il reste un tronçon. Des racines qui se sont rejointes. Beaucoup se restaure : on ramène de la matière autour du point faible, on rattache, on sépare avec douceur. Nous regardons d'abord.\nLa réparation, à la Maison, s'appelle le FÍNFÍN™ : maisonmnd.com/reparation-locks/?utm_source=instagram&utm_medium=post&utm_campaign=reparation\n#MaisonMND #Finfin #ReparationLocks",
  "visuel": "Photo : attention.jpg. Sur l’image : Ma couronne a besoin d'attention.",
  "note": ""
 },
 {
  "id": "instagram-mois-2-3-2026-11-01-03",
  "plan": "instagram-mois-2-3",
  "date": "2026-11-01",
  "plateformes": [
   "instagram",
   "facebook"
  ],
  "format": "post",
  "serie": "Offre du mois",
  "sujet": "Le Lavage du mois de novembre",
  "description": "La même affiche, le mois changé. Elle remplace la story du dimanche et prend l'épingle de l'offre d'octobre.",
  "accroche": "",
  "legende": "Novembre : le Lavage du mois continue. Votre KLƆKLƆ™ Le Lavage chaque mois, et la coiffure de sortie est offerte. Impeccable, chaque mois.\nRéservez votre lavage : maisonmnd.com/les-offres/?utm_source=instagram&utm_medium=post&utm_campaign=lavage-novembre\n#MaisonMND #LeLavageDuMois #LocksCotonou",
  "visuel": "Photo : entretien.jpg. Sur l’image : Le Lavage du mois de novembre",
  "note": "Dans Le Trône : l'offre du mois reste active et « en vitrine » ; si ses dates sont bornées à octobre, on les prolonge la veille."
 },
 {
  "id": "instagram-mois-2-3-2026-11-02-04",
  "plan": "instagram-mois-2-3",
  "date": "2026-11-02",
  "plateformes": [
   "instagram",
   "facebook"
  ],
  "format": "post",
  "serie": "Comprendre",
  "sujet": "Locks fines : quatre précautions",
  "description": "Six diapositives, tirées de « Locks fines, quelles précautions ? ».",
  "accroche": "",
  "legende": "Une lock fine tient sur moins de cheveux : elle demande plus d'attention, pas plus de gestes. Quatre précautions, à faire glisser.\nVotre entretien se réserve en ligne : maisonmnd.com/entretien-locks/?utm_source=instagram&utm_medium=post&utm_campaign=locks-fines\n#MaisonMND #LocksFines #EntretienLocks",
  "visuel": "Sur l’image : Locks fines : quatre précautions",
  "note": ""
 },
 {
  "id": "instagram-mois-2-3-2026-11-04-05",
  "plan": "instagram-mois-2-3",
  "date": "2026-11-04",
  "plateformes": [
   "instagram",
   "tiktok"
  ],
  "format": "reel",
  "serie": "Le geste",
  "sujet": "Sécher vraiment",
  "description": "Vingt secondes : presser, pas frotter ; la serviette, l'air, le temps. Et ce qu'une lock humide des heures devient.",
  "accroche": "",
  "legende": "Le séchage est la moitié du lavage. Une lock humide à l'intérieur pendant des heures prend une odeur que le lavage suivant n'enlève pas. Voici comment on sèche à la Maison.\nLe KLƆKLƆ™ se réserve en ligne : maisonmnd.com\n#MaisonMND #Kloklo #LocksCotonou",
  "visuel": "Photo : entretien.jpg. Sur l’image : Sécher vraiment",
  "note": "« Ce n'est pas le lavage qui donne l'odeur. C'est l'eau qu'on a laissée dedans. »"
 },
 {
  "id": "instagram-mois-2-3-2026-11-06-06",
  "plan": "instagram-mois-2-3",
  "date": "2026-11-06",
  "plateformes": [
   "instagram",
   "facebook"
  ],
  "format": "post",
  "serie": "La saison",
  "sujet": "Vous rentrez à Cotonou en décembre ?",
  "description": "Le premier mot de la saison, un mois avant. Les créneaux de décembre partent en novembre.",
  "accroche": "",
  "legende": "Vous rentrez à Cotonou pour les fêtes ? Votre couronne peut vous attendre prête. Les créneaux de décembre se réservent en novembre, en ligne, en trois pas, depuis n'importe où : la Maison confirme sur WhatsApp.\nRéservez votre entretien : maisonmnd.com/reserver/?utm_source=instagram&utm_medium=post&utm_campaign=decembre\n#MaisonMND #Cotonou #LocksCotonou",
  "visuel": "Photo : cauris-accueil.jpg. Sur l’image : Vous rentrez à Cotonou en décembre ?",
  "note": ""
 },
 {
  "id": "instagram-mois-2-3-2026-11-08-07",
  "plan": "instagram-mois-2-3",
  "date": "2026-11-08",
  "plateformes": [
   "instagram"
  ],
  "format": "story",
  "serie": "La Maison",
  "sujet": "Dimanche à la Maison",
  "description": "Chaque dimanche de novembre, la story finit par la même ligne : « Décembre se réserve en novembre », avec le lien.",
  "accroche": "",
  "legende": "",
  "visuel": "Sur l’image : Une photo prise le jour même.",
  "note": ""
 },
 {
  "id": "instagram-mois-2-3-2026-11-09-08",
  "plan": "instagram-mois-2-3",
  "date": "2026-11-09",
  "plateformes": [
   "instagram",
   "facebook"
  ],
  "format": "post",
  "serie": "Comprendre",
  "sujet": "Ma couronne est-elle trop lourde ?",
  "description": "Six diapositives, tirées de « Comment savoir si mes locks sont trop lourdes ? ».",
  "accroche": "",
  "legende": "Une tension au sommet du crâne en fin de journée, un soulagement quand vous détachez : votre couronne pèse peut-être plus que votre cuir chevelu ne peut porter. Ce qu'on fait, sans rien perdre, à faire glisser.\nRéservez votre entretien : maisonmnd.com/entretien-locks/?utm_source=instagram&utm_medium=post&utm_campaign=poids\n#MaisonMND #EntretienLocks #LocksCotonou",
  "visuel": "Sur l’image : Ma couronne est-elle trop lourde ?",
  "note": ""
 },
 {
  "id": "instagram-mois-2-3-2026-11-11-09",
  "plan": "instagram-mois-2-3",
  "date": "2026-11-11",
  "plateformes": [
   "instagram",
   "tiktok"
  ],
  "format": "reel",
  "serie": "Les gestes nommés",
  "sujet": "Une lock amincie, renforcée : le FÍNFÍN™",
  "description": "Le point faible près de la racine, la matière qu'on ramène autour, la lock qui tient. Vingt-cinq secondes, mains seulement.",
  "accroche": "",
  "legende": "Une lock qui s'affine près de la racine tient par quelques cheveux. On ramène de la matière autour du point faible, au crochet, ou en la reliant à sa voisine. Le FÍNFÍN™, la restauration de la Maison.\nRéservez un diagnostic : maisonmnd.com\n#MaisonMND #Finfin #ReparationLocks",
  "visuel": "Photo : attention.jpg. Sur l’image : Une lock amincie, renforcée",
  "note": "Registre : la couronne filmée est celle d'une cliente qui a dit oui par écrit ; aucun visage, les mains et la lock seulement."
 },
 {
  "id": "instagram-mois-2-3-2026-11-13-10",
  "plan": "instagram-mois-2-3",
  "date": "2026-11-13",
  "plateformes": [
   "instagram",
   "facebook"
  ],
  "format": "post",
  "serie": "Transmettre",
  "sujet": "Je veux apprendre le métier",
  "description": "La transmission passe une fois par mois sur Instagram ; le reste vit sur LinkedIn.",
  "accroche": "",
  "legende": "Faire des locks votre métier, ou approfondir ce que vous savez déjà. MND Formation transmet la méthode de la Maison à trois entrées : Débutante, Professionnelle, Certifiante. Les gestes, et surtout le regard.\nLa prochaine session : date à fixer. Le programme : maisonmnd.com/formations/?utm_source=instagram&utm_medium=post&utm_campaign=formation\n#MNDFormation #MaisonMND #Formation",
  "visuel": "Photo : brice.jpg. Sur l’image : Je veux apprendre le métier.",
  "note": ""
 },
 {
  "id": "instagram-mois-2-3-2026-11-15-11",
  "plan": "instagram-mois-2-3",
  "date": "2026-11-15",
  "plateformes": [
   "instagram"
  ],
  "format": "story",
  "serie": "La Maison",
  "sujet": "Dimanche à la Maison",
  "description": "",
  "accroche": "",
  "legende": "",
  "visuel": "Sur l’image : Une photo prise le jour même.",
  "note": ""
 },
 {
  "id": "instagram-mois-2-3-2026-11-16-12",
  "plan": "instagram-mois-2-3",
  "date": "2026-11-16",
  "plateformes": [
   "instagram",
   "facebook"
  ],
  "format": "post",
  "serie": "Comprendre",
  "sujet": "Quelle méthode pour ses premières locks ?",
  "description": "Cinq diapositives, tirées de l'article du Journal du même nom.",
  "accroche": "",
  "legende": "Torsades, crochet, interlocking : votre texture oriente le choix, et la taille des sections se décide une fois pour longtemps. Vous n'avez pas à décider seule. Faites glisser.\nLa Première Couronne commence par une consultation : maisonmnd.com/premiere-couronne/?utm_source=instagram&utm_medium=post&utm_campaign=methode\n#MaisonMND #PremiereCouronne #Dreadlocks",
  "visuel": "Sur l’image : Quelle méthode pour ses premières locks ?",
  "note": ""
 },
 {
  "id": "instagram-mois-2-3-2026-11-18-13",
  "plan": "instagram-mois-2-3",
  "date": "2026-11-18",
  "plateformes": [
   "instagram",
   "tiktok"
  ],
  "format": "reel",
  "serie": "L'explication",
  "sujet": "Trois signes que vos locks sont trop lourdes",
  "description": "Les mains soupèsent une couronne, la voix nomme les signes. Vingt-cinq secondes.",
  "accroche": "",
  "legende": "La tension en fin de journée, le soulagement quand vous détachez, la racine qui porte plus qu'elle ne peut. Trois signes, et ce qu'on fait sans rien perdre : une coupe nette, en deux fois si vous hésitez.\nRéservez votre entretien : maisonmnd.com\n#MaisonMND #EntretienLocks #LocksCotonou",
  "visuel": "Photo : regard.jpg. Sur l’image : Trois signes que vos locks sont trop lourdes",
  "note": "« Une couronne se construit pour dix ans. On la porte, on ne la subit pas. »"
 },
 {
  "id": "instagram-mois-2-3-2026-11-20-14",
  "plan": "instagram-mois-2-3",
  "date": "2026-11-20",
  "plateformes": [
   "instagram",
   "facebook"
  ],
  "format": "post",
  "serie": "Prendre soin",
  "sujet": "Parent et enfant",
  "description": "La seconde offre familles, si elle est créée et « en vitrine » dans Le Trône ; sinon, le portrait MND Kids sans pastille.",
  "accroche": "",
  "legende": "Parent et enfant : vous venez ensemble, votre entretien et sa visite MND Kids dans la même venue, et la sienne est accompagnée. Vous restez à ses côtés du début à la fin.\nLes offres de la Maison : maisonmnd.com/les-offres/?utm_source=instagram&utm_medium=post&utm_campaign=parent-enfant\n#MaisonMND #MNDKids #OffresFamilles",
  "visuel": "Photo : mnd-kids.jpg. Sur l’image : Parent et enfant.",
  "note": ""
 },
 {
  "id": "instagram-mois-2-3-2026-11-22-15",
  "plan": "instagram-mois-2-3",
  "date": "2026-11-22",
  "plateformes": [
   "instagram"
  ],
  "format": "story",
  "serie": "La Maison",
  "sujet": "Dimanche à la Maison",
  "description": "",
  "accroche": "",
  "legende": "",
  "visuel": "Sur l’image : Une photo prise le jour même.",
  "note": ""
 },
 {
  "id": "instagram-mois-2-3-2026-11-23-16",
  "plan": "instagram-mois-2-3",
  "date": "2026-11-23",
  "plateformes": [
   "instagram",
   "facebook"
  ],
  "format": "post",
  "serie": "Comprendre",
  "sujet": "Réparer des locks abîmées : ce qu'on regarde d'abord",
  "description": "Six diapositives, tirées de « Réparer des locks abîmées ».",
  "accroche": "",
  "legende": "Amincie, cassée, jointe à sa voisine : une lock abîmée, ce sont des situations très différentes, et beaucoup se restaurent. Et quand il vaut mieux défaire, la Maison le dit aussi. Faites glisser.\nLe diagnostic se réserve en ligne : maisonmnd.com/reparation-locks/?utm_source=instagram&utm_medium=post&utm_campaign=reparation\n#MaisonMND #Finfin #ReparationLocks",
  "visuel": "Sur l’image : Réparer des locks abîmées : ce qu'on regarde d'abord",
  "note": ""
 },
 {
  "id": "instagram-mois-2-3-2026-11-25-17",
  "plan": "instagram-mois-2-3",
  "date": "2026-11-25",
  "plateformes": [
   "instagram",
   "tiktok"
  ],
  "format": "reel",
  "serie": "Les gestes nommés",
  "sujet": "La coiffure de sortie, en vingt secondes",
  "description": "Le quatrième temps, Couronner : une couronne propre, nourrie, tenue, et portée. Sans tension.",
  "accroche": "",
  "legende": "Couronner : le quatrième temps. Une coiffure de sortie qui tient sans tirer, relevée un jour, libre le lendemain. C'est celle qui est offerte avec le Lavage du mois.\nRéservez votre lavage : maisonmnd.com\n#MaisonMND #LocksCotonou #Couronner",
  "visuel": "Photo : regard.jpg. Sur l’image : La coiffure de sortie, en vingt secondes",
  "note": ""
 },
 {
  "id": "instagram-mois-2-3-2026-11-27-18",
  "plan": "instagram-mois-2-3",
  "date": "2026-11-27",
  "plateformes": [
   "instagram",
   "facebook"
  ],
  "format": "post",
  "serie": "La preuve",
  "sujet": "Ce que disent nos clientes",
  "description": "Le dernier vendredi du mois, un avis Google réel, mot pour mot, initiales seulement, en indigo sur ivoire. Le premier de la série.",
  "accroche": "",
  "legende": "« l'avis, mot pour mot » : ce que dit A. K. sur Google. Merci. Les avis de nos clientes sont sur la fiche Google de la Maison, et sur maisonmnd.com.\n#MaisonMND #LocksCotonou #Avis",
  "visuel": "Photo : trois-couronnes.jpg",
  "note": "En cuivre : l'avis se choisit sur la fiche Google la veille, le plus juste et le plus court ; on ne le retouche pas, on ne l'invente jamais. Les initiales sont celles de l'auteure. Le même jour, le point à soixante jours : réservations par campagne dans Le Trône, carrousel le plus enregistré, Reel le plus regardé jusqu'au bout, avis du mois."
 },
 {
  "id": "instagram-mois-2-3-2026-11-29-19",
  "plan": "instagram-mois-2-3",
  "date": "2026-11-29",
  "plateformes": [
   "instagram"
  ],
  "format": "story",
  "serie": "La Maison",
  "sujet": "Dimanche à la Maison",
  "description": "",
  "accroche": "",
  "legende": "",
  "visuel": "Sur l’image : Une photo prise le jour même.",
  "note": ""
 },
 {
  "id": "instagram-mois-2-3-2026-12-01-20",
  "plan": "instagram-mois-2-3",
  "date": "2026-12-01",
  "plateformes": [
   "instagram",
   "facebook"
  ],
  "format": "post",
  "serie": "Offre du mois",
  "sujet": "Le Lavage du mois de décembre",
  "description": "La même offre, avec la ligne de la saison : la coiffure de sortie est celle des fêtes. Épinglée à la place de novembre.",
  "accroche": "",
  "legende": "Décembre : le Lavage du mois, et la coiffure de sortie offerte est celle des fêtes. Votre KLƆKLƆ™ Le Lavage, puis vous repartez prête. Impeccable, chaque mois.\nRéservez votre lavage : maisonmnd.com/les-offres/?utm_source=instagram&utm_medium=post&utm_campaign=lavage-decembre\n#MaisonMND #LeLavageDuMois #LocksCotonou",
  "visuel": "Photo : entretien.jpg. Sur l’image : Le Lavage du mois de décembre",
  "note": ""
 },
 {
  "id": "instagram-mois-2-3-2026-12-02-21",
  "plan": "instagram-mois-2-3",
  "date": "2026-12-02",
  "plateformes": [
   "instagram",
   "tiktok"
  ],
  "format": "reel",
  "serie": "Les gestes nommés",
  "sujet": "La première heure d'une création : le VÈKPÈ™",
  "description": "Les sections qui se dessinent, la première lock, le geste long et précis. Trente-cinq secondes, avec l'accord de la cliente.",
  "accroche": "",
  "legende": "La création d'une couronne porte un nom à la Maison : le VÈKPÈ™. Un geste long, précis, qui demande de la patience de part et d'autre. Voici la première heure.\nLa Première Couronne commence par une consultation : maisonmnd.com\n#MaisonMND #Vekpe #PremiereCouronne",
  "visuel": "Photo : creation.jpg. Sur l’image : La première heure d'une création",
  "note": "« Ce qu'on décide en une heure, on le porte dix ans. Alors on prend l'heure. »"
 },
 {
  "id": "instagram-mois-2-3-2026-12-04-22",
  "plan": "instagram-mois-2-3",
  "date": "2026-12-04",
  "plateformes": [
   "instagram",
   "facebook"
  ],
  "format": "post",
  "serie": "La saison",
  "sujet": "Une couronne pour les fêtes",
  "description": "Le portrait de la saison, épinglé en second jusqu'au 27 décembre.",
  "accroche": "",
  "legende": "Une couronne pour les fêtes se prépare deux semaines avant : laver et hydrater à J-14, resserrer à J-7, coiffer la veille. Réservez avant le 15 décembre, la Maison confirme sur WhatsApp.\nRéserver : maisonmnd.com/reserver/?utm_source=instagram&utm_medium=post&utm_campaign=fetes\n#MaisonMND #LocksCotonou #Fetes",
  "visuel": "Photo : regard.jpg. Sur l’image : Une couronne pour les fêtes.",
  "note": ""
 },
 {
  "id": "instagram-mois-2-3-2026-12-06-23",
  "plan": "instagram-mois-2-3",
  "date": "2026-12-06",
  "plateformes": [
   "instagram"
  ],
  "format": "story",
  "serie": "La Maison",
  "sujet": "Dimanche à la Maison",
  "description": "",
  "accroche": "",
  "legende": "",
  "visuel": "Sur l’image : Une photo prise le jour même.",
  "note": ""
 },
 {
  "id": "instagram-mois-2-3-2026-12-07-24",
  "plan": "instagram-mois-2-3",
  "date": "2026-12-07",
  "plateformes": [
   "instagram",
   "facebook"
  ],
  "format": "post",
  "serie": "Comprendre",
  "sujet": "Les dreadlocks des enfants : cinq questions de parents",
  "description": "Sept diapositives, tirées de « Dreadlocks enfants, comment les entretenir ? ».",
  "accroche": "",
  "legende": "À partir de quel âge, quelle méthode, quels gestes à la maison, comment se passe la visite, et l'école : cinq questions que les parents nous posent, à faire glisser.\nMND Kids, pendant les vacances : maisonmnd.com/mnd-kids/?utm_source=instagram&utm_medium=post&utm_campaign=kids-vacances\n#MaisonMND #MNDKids #LocksEnfants",
  "visuel": "Sur l’image : Les dreadlocks des enfants : cinq questions de parents",
  "note": ""
 },
 {
  "id": "instagram-mois-2-3-2026-12-09-25",
  "plan": "instagram-mois-2-3",
  "date": "2026-12-09",
  "plateformes": [
   "instagram",
   "tiktok"
  ],
  "format": "reel",
  "serie": "La Maison",
  "sujet": "Une visite MND Kids, en trente secondes",
  "description": "On explique, on fait des pauses, on s'arrête si ça tire. Les mains de Brice, la voix de Yéman, l'enfant de dos ou de loin, jamais en gros plan, avec l'accord écrit des parents.",
  "accroche": "",
  "legende": "Une visite MND Kids : plus courte, plus douce, pensée pour lui. On explique à l'enfant ce qu'on va faire avant de le faire. On fait des pauses. On s'arrête si ça tire. Un enfant qui repart content revient volontiers.\nOrganiser votre visite : maisonmnd.com\n#MaisonMND #MNDKids #Cotonou",
  "visuel": "Photo : mnd-kids.jpg. Sur l’image : Une visite MND Kids, en trente secondes",
  "note": "« On ne finit pas coûte que coûte. Un enfant qui a eu mal se souvient longtemps. »"
 },
 {
  "id": "instagram-mois-2-3-2026-12-11-26",
  "plan": "instagram-mois-2-3",
  "date": "2026-12-11",
  "plateformes": [
   "instagram",
   "facebook"
  ],
  "format": "post",
  "serie": "Prendre soin",
  "sujet": "MND Kids : les vacances sont le bon moment",
  "description": "Le portrait de la porte, avec la ligne de la saison.",
  "accroche": "",
  "legende": "Les vacances sont le bon moment pour une première visite MND Kids : pas d'école le lendemain, du temps pour expliquer, et vous restez à ses côtés du début à la fin.\nLa visite commence par un échange avec vous : maisonmnd.com/mnd-kids/?utm_source=instagram&utm_medium=post&utm_campaign=kids-vacances\n#MaisonMND #MNDKids #LocksEnfants",
  "visuel": "Photo : mnd-kids.jpg. Sur l’image : Le bon moment.",
  "note": ""
 },
 {
  "id": "instagram-mois-2-3-2026-12-13-27",
  "plan": "instagram-mois-2-3",
  "date": "2026-12-13",
  "plateformes": [
   "instagram"
  ],
  "format": "story",
  "serie": "La Maison",
  "sujet": "Dimanche à la Maison",
  "description": "",
  "accroche": "",
  "legende": "",
  "visuel": "Sur l’image : Une photo prise le jour même.",
  "note": ""
 },
 {
  "id": "instagram-mois-2-3-2026-12-14-28",
  "plan": "instagram-mois-2-3",
  "date": "2026-12-14",
  "plateformes": [
   "instagram",
   "facebook"
  ],
  "format": "post",
  "serie": "Comprendre",
  "sujet": "Une couronne pour les fêtes : deux semaines avant",
  "description": "Six diapositives : les quatre temps, posés sur un calendrier.",
  "accroche": "",
  "legende": "Une couronne pour les fêtes, c'est la méthode de la Maison posée sur un calendrier : laver et hydrater à J-14, resserrer à J-7, coiffer la veille. Et ce qu'on évite. Faites glisser.\nLes derniers créneaux de décembre : maisonmnd.com/reserver/?utm_source=instagram&utm_medium=post&utm_campaign=fetes\n#MaisonMND #LocksCotonou #Fetes",
  "visuel": "Sur l’image : Une couronne pour les fêtes : deux semaines avant",
  "note": ""
 },
 {
  "id": "instagram-mois-2-3-2026-12-16-29",
  "plan": "instagram-mois-2-3",
  "date": "2026-12-16",
  "plateformes": [
   "instagram",
   "tiktok"
  ],
  "format": "reel",
  "serie": "La méthode",
  "sujet": "Les quatre temps, en quarante secondes",
  "description": "Dix secondes par temps, un mot en sous-titre à chaque changement. Le Reel que l'on épingle dans la bulle Entretien.",
  "accroche": "",
  "legende": "Purifier, Nourrir, Sceller, Couronner : les quatre temps de la Maison, dans l'ordre, en quarante secondes. L'ordre ne s'inverse jamais.\nVotre couronne pour les fêtes se réserve en ligne : maisonmnd.com\n#MaisonMND #LocksCotonou #QuatreTemps",
  "visuel": "Photo : attention.jpg. Sur l’image : Les quatre temps, en quarante secondes",
  "note": "« Inverser l'ordre, c'est sceller de la saleté. Alors on commence toujours par l'eau. »"
 },
 {
  "id": "instagram-mois-2-3-2026-12-18-30",
  "plan": "instagram-mois-2-3",
  "date": "2026-12-18",
  "plateformes": [
   "instagram",
   "facebook"
  ],
  "format": "post",
  "serie": "Transformer",
  "sujet": "Et quand il vaut mieux défaire",
  "description": "Le portrait le plus honnête du trimestre : le défaisage comme un geste de soin, avant une nouvelle année.",
  "accroche": "",
  "legende": "Il arrive qu'une couronne ait trop souffert, ou qu'elle ne corresponde plus à ce que vous voulez porter. Dans ce cas, la Maison propose le GBÀTÀ™, le défaisage. Ce n'est pas un échec. C'est un geste de soin comme les autres, qui rend à vos cheveux leur liberté et prépare, si vous le souhaitez, une nouvelle couronne.\nNous regardons d'abord : maisonmnd.com/reparation-locks/?utm_source=instagram&utm_medium=post&utm_campaign=gbata\n#MaisonMND #Gbata #LocksCotonou",
  "visuel": "Photo : hero.jpg. Sur l’image : Et quand il vaut mieux défaire.",
  "note": ""
 },
 {
  "id": "instagram-mois-2-3-2026-12-20-31",
  "plan": "instagram-mois-2-3",
  "date": "2026-12-20",
  "plateformes": [
   "instagram"
  ],
  "format": "story",
  "serie": "La Maison",
  "sujet": "Dimanche à la Maison",
  "description": "",
  "accroche": "",
  "legende": "",
  "visuel": "Sur l’image : Une photo prise le jour même.",
  "note": ""
 },
 {
  "id": "instagram-mois-2-3-2026-12-21-32",
  "plan": "instagram-mois-2-3",
  "date": "2026-12-21",
  "plateformes": [
   "instagram",
   "facebook"
  ],
  "format": "post",
  "serie": "Comprendre",
  "sujet": "Trois choses à éviter pendant les fêtes",
  "description": "Cinq diapositives, tirées de trois articles du Journal : les locks fines, l'hydratation, le lavage.",
  "accroche": "",
  "legende": "Pendant les fêtes, trois choses à éviter : la même coiffure serrée tous les jours, les huiles lourdes pour briller, dormir les locks humides. Et ce qu'on fait à la place. Faites glisser, et belles fêtes à votre couronne.\nmaisonmnd.com/journal/?utm_source=instagram&utm_medium=post&utm_campaign=fetes-eviter\n#MaisonMND #LocksCotonou #Fetes",
  "visuel": "Sur l’image : Trois choses à éviter pendant les fêtes",
  "note": ""
 },
 {
  "id": "instagram-mois-2-3-2026-12-23-33",
  "plan": "instagram-mois-2-3",
  "date": "2026-12-23",
  "plateformes": [
   "instagram",
   "tiktok"
  ],
  "format": "reel",
  "serie": "La Maison",
  "sujet": "Les mains de la Maison en 2026",
  "description": "Un montage des Reels du trimestre, trois secondes chacun, sans nouvelle prise : le geste, encore. Trente secondes, la voix à la fin.",
  "accroche": "",
  "legende": "Trois mois sous notre nouveau nom, et les mêmes mains. Merci pour vos couronnes, vos réservations, vos avis, vos messages. La Maison rouvre le date de reprise.\nmaisonmnd.com\n#MaisonMND #LocksCotonou #Merci",
  "visuel": "Photo : brice.jpg. Sur l’image : Les mains de la Maison en 2026",
  "note": "« Le nom a changé. Les mains, la méthode et l'adresse, non. Merci d'être venues. »"
 },
 {
  "id": "instagram-mois-2-3-2026-12-25-34",
  "plan": "instagram-mois-2-3",
  "date": "2026-12-25",
  "plateformes": [
   "instagram"
  ],
  "format": "story",
  "serie": "La Maison",
  "sujet": "Belles fêtes",
  "description": "Pas de publication dans le fil ; une story, une ligne, et la Maison se tait jusqu'au dimanche.",
  "accroche": "",
  "legende": "",
  "visuel": "Sur l’image : Belles fêtes.",
  "note": ""
 },
 {
  "id": "instagram-mois-2-3-2026-12-27-35",
  "plan": "instagram-mois-2-3",
  "date": "2026-12-27",
  "plateformes": [
   "instagram"
  ],
  "format": "bilan",
  "serie": "",
  "sujet": "Le point à quatre-vingt-dix jours, et une story de merci",
  "description": "Les quatre relevés, et une décision pour janvier : la série qu'on garde, celle qu'on change, le rythme qu'on tient.",
  "accroche": "",
  "legende": "",
  "visuel": "Sur l’image : Merci.",
  "note": ""
 },
 {
  "id": "linkedin-deux-mois-2026-09-28-01",
  "plan": "linkedin-deux-mois",
  "date": "2026-09-28",
  "plateformes": [
   "linkedin"
  ],
  "format": "post",
  "serie": "La Maison · Le lancement",
  "sujet": "Le nouveau nom",
  "description": "Le seul texte publié un lundi, le jour où tout change partout. Épinglé « À la une » sur la page.",
  "accroche": "Seize ans après la première couronne, notre maison prend le nom qu'elle portait déjà entre nous.",
  "legende": "Seize ans après la première couronne, notre maison prend le nom qu'elle portait déjà entre nous.\n\nEn 2010, nous avons ouvert à Cotonou un atelier de locks que nous avons appelé M Natural Dreadlocks. Le nom disait ce que nous faisions. Il ne disait pas ce que nous étions devenus.\n\nAujourd'hui, M Natural Dreadlocks devient Maison MND.\n\nUne maison, pas un salon : on y entre, on y revient, on y est reçue. On y apprend, aussi. Depuis quelques années, MND Formation transmet notre méthode à celles et ceux qui feront des locks leur métier.\n\nCe qui change : le nom, le monogramme, et un site où l'on réserve son entretien en trois pas, sans créer de compte.\n\nCe qui ne change pas : les mains de Brice, la méthode en quatre temps, l'adresse à Suru-Léré, le numéro WhatsApp, et la règle que nous tenons depuis le premier jour : rien ne commence sans une consultation, et rien ne commence sans votre oui.\n\nMerci à celles et ceux qui nous suivent depuis M Natural Dreadlocks. Vous êtes chez vous ici.\n\nLe site est en premier commentaire.\n\n#MaisonMND #LocksCotonou #Entrepreneuriat",
  "visuel": "Photo : fondateurs.jpg. Sur l’image : M Natural Dreadlocks devient Maison MND.",
  "note": "Premier commentaire : « Le site de la Maison, et la réservation en ligne : https://maisonmnd.com/?utm_source=linkedin&utm_medium=post&utm_campaign=nouveau-nom » · Visuel : le portrait des fondateurs, indigo sur ivoire, 1080 × 1350."
 },
 {
  "id": "linkedin-deux-mois-2026-10-06-02",
  "plan": "linkedin-deux-mois",
  "date": "2026-10-06",
  "plateformes": [
   "linkedin"
  ],
  "format": "post",
  "serie": "Seize ans",
  "sujet": "La patience",
  "description": "Le texte que vous aimiez, approfondi : trois leçons, une histoire pour chacune, et la raison pour laquelle une maison de locks ne peut pas être pressée.",
  "accroche": "Une cliente nous a demandé un jour de « finir » ses locks. Il nous a fallu du courage pour lui répondre qu'une lock ne se finit pas.",
  "legende": "Une cliente nous a demandé un jour de « finir » ses locks. Il nous a fallu du courage pour lui répondre qu'une lock ne se finit pas.\n\nElle se forme de l'intérieur, pendant des mois. Les premières semaines, elle bouge, elle gonfle, elle paraît irrégulière. C'est ce que nous appelons la Fondation, le premier des trois paliers d'une couronne. Ce n'est pas un défaut ; c'est le travail qui se fait.\n\nSeize ans de ce métier nous ont appris trois choses sur la patience.\n\nLa première : dire la vérité le premier jour coûte une cliente pressée et en garde dix. Celles qui reviennent nous voir dix ans plus tard sont celles à qui nous avons dit, à la consultation, ce que les six premiers mois seraient.\n\nLa deuxième : le geste le plus fréquent de la Maison, le resserrage des racines, ne consiste pas à serrer plus fort. Une racine qui repousse est une racine qui va bien. On la reprend quand la couronne le demande, pas avant, et pas plus. Nous l'appelons le SÍNSIN™, et c'est un geste de retenue autant que de main.\n\nLa troisième : une couronne se construit pour dix ans. La taille des sections, choisie à la consultation, tient compte de ce que le cuir chevelu pourra porter longtemps. Ce qu'on décide en une heure, on le porte une décennie.\n\nNous n'avons jamais trouvé le moyen d'aller plus vite. Nous avons trouvé le moyen de le dire.\n\n#MaisonMND #LocksCotonou #Artisanat",
  "visuel": "Photo : attention.jpg. Sur l’image : Ce que seize ans de locks nous ont appris sur la patience.",
  "note": "Premier commentaire : « Comment entretenir ses racines, sur le Journal de la Maison : https://maisonmnd.com/journal/entretenir-ses-racines/?utm_source=linkedin&utm_medium=post&utm_campaign=patience » · Visuel : la main sur le collier, indigo sur ivoire."
 },
 {
  "id": "linkedin-deux-mois-2026-10-13-03",
  "plan": "linkedin-deux-mois",
  "date": "2026-10-13",
  "plateformes": [
   "linkedin"
  ],
  "format": "document",
  "serie": "La méthode · Document",
  "sujet": "Quatre temps, pas un de plus",
  "description": "Le premier document à feuilleter : six pages, Purifier, Nourrir, Sceller, Couronner, et pourquoi l'ordre ne s'inverse jamais.",
  "accroche": "Toute couronne qui passe par la Maison reçoit les mêmes quatre temps, dans le même ordre. Voici pourquoi l'ordre ne s'inverse jamais.",
  "legende": "Toute couronne qui passe par la Maison reçoit les mêmes quatre temps, dans le même ordre. Voici pourquoi l'ordre ne s'inverse jamais.\n\nPurifier. Une lock est une matière dense qui retient ce qu'on y met, lavage après lavage. On lave clair, on mouille longuement, on rince jusqu'à l'eau claire, et on sèche vraiment. Le séchage est la moitié du lavage. Chez nous, ce temps s'appelle le KLƆKLƆ™.\n\nNourrir. L'huile n'hydrate pas : elle retient l'eau. Sur une lock sèche, l'huile ferme une porte sur une pièce vide. Eau d'abord, huile ensuite, et des huiles qui entrent dans la fibre plutôt que des beurres qui l'étouffent. C'est le DÀNDÀN™, l'hydratation aux sept huiles.\n\nSceller. Les racines. On ne les serre pas plus fort ; on les reprend quand elles le demandent. Le SÍNSIN™.\n\nCouronner. La coiffure de sortie, celle avec laquelle on repart. Une couronne propre, nourrie, tenue, et portée.\n\nInverser l'ordre, c'est sceller de la saleté, nourrir une fibre qui ne peut plus boire, coiffer ce qui n'est pas tenu. Les quatre temps sont une méthode parce qu'ils sont un ordre.\n\nLe document ci-joint les détaille, une page par temps. Il est le premier chapitre de ce que MND Formation enseigne.\n\n#MaisonMND #MNDFormation #LocksCotonou",
  "visuel": "",
  "note": "Le document : six pages 1080 × 1350 exportées en PDF : la couverture indigo, une page ivoire par temps (le numéro cuivre, le nom du geste, quatre lignes), une dernière page « Apprendre la méthode · maisonmnd.com/formations/ ». Premier commentaire : « Le programme de MND Formation : https://maisonmnd.com/formations/?utm_source=linkedin&utm_medium=post&utm_campaign=methode »."
 },
 {
  "id": "linkedin-deux-mois-2026-10-20-04",
  "plan": "linkedin-deux-mois",
  "date": "2026-10-20",
  "plateformes": [
   "linkedin"
  ],
  "format": "post",
  "serie": "Transmettre",
  "sujet": "Transmettre la méthode",
  "description": "Le second texte que vous aimiez, approfondi : les trois entrées de MND Formation, le référentiel, le certificat, et ce qui ne s'imprime pas.",
  "accroche": "On nous demande souvent comment on apprend à faire des locks. La réponse honnête tient en une phrase, et elle ne plaît pas à tout le monde.",
  "legende": "On nous demande souvent comment on apprend à faire des locks. La réponse honnête tient en une phrase, et elle ne plaît pas à tout le monde : en regardant longtemps des mains qui savent, puis en refaisant le geste jusqu'à ce qu'il soit juste.\n\nC'est ce que MND Formation transmet, à trois entrées.\n\nL'entrée Débutante, pour apprendre proprement, du premier geste. On n'y demande aucune expérience ; on y demande de la patience.\n\nL'entrée Professionnelle, pour celles et ceux qui pratiquent déjà et veulent se spécialiser, ou structurer leur activité : la tenue d'un salon fait partie du métier.\n\nL'entrée Certifiante, sur le référentiel MND, reconnu par la Maison. Elle se termine devant un jury, avec une mention, et un certificat numéroté délivré par la Maison.\n\nCe qu'on y apprend, ce sont les gestes : créer, restaurer, resserrer, laver, hydrater. Mais surtout le regard : celui qui voit une racine qui tire avant qu'elle ne casse, une couronne qui devient lourde avant qu'elle ne pèse, une lock qui reste humide avant qu'elle ne sente.\n\nChaque promotion repart avec un certificat, et avec une chose qui ne s'imprime pas : la patience de ne pas faire.\n\nLa prochaine session : dates à fixer. Le programme et la demande de rappel sont sur le site, en premier commentaire.\n\n#MNDFormation #MaisonMND #Formation",
  "visuel": "Photo : brice.jpg. Sur l’image : Transmettre la méthode.",
  "note": "Premier commentaire : « Le programme, les dates et l'inscription : https://maisonmnd.com/formations/?utm_source=linkedin&utm_medium=post&utm_campaign=formation » · Visuel : Brice au travail, indigo sur ivoire. En cuivre : la date de la prochaine session, à écrire avant de publier ; sans date, la phrase devient « Les prochaines sessions sont sur le site »."
 },
 {
  "id": "linkedin-deux-mois-2026-10-27-05",
  "plan": "linkedin-deux-mois",
  "date": "2026-10-27",
  "plateformes": [
   "linkedin"
  ],
  "format": "post",
  "serie": "La Maison · Une position",
  "sujet": "Pourquoi nous n'affichons aucun prix",
  "description": "Le texte qui fera parler. Une position tenue, expliquée sans arrogance, qui dit ce que la Maison est.",
  "accroche": "Sur notre site, aucun prix. Sur nos réseaux, aucun prix. On nous le reproche parfois. Voici pourquoi nous tenons.",
  "legende": "Sur notre site, aucun prix. Sur nos réseaux, aucun prix. On nous le reproche parfois. Voici pourquoi nous tenons.\n\nUne couronne n'est pas un produit. Deux personnes qui demandent « une création » n'ont ni la même texture, ni la même densité, ni le même cuir chevelu, ni le même projet pour les dix ans qui viennent. Un prix affiché promettrait la même chose à deux têtes qui n'ont rien en commun.\n\nAlors nous commençons par regarder. La consultation n'est pas une formalité : c'est le moment où l'on décide ensemble de la méthode, de la taille des sections, de ce que votre cuir chevelu pourra porter. Le devis vient après, et il vous est dit avant que quoi que ce soit ne commence. Rien ne commence sans votre oui.\n\nNous savons ce que cela coûte. Une cliente qui compare des grilles de tarifs ne nous trouve pas dans la comparaison. Nous préférons qu'elle nous trouve dans la consultation.\n\nUne chose est affichée, en revanche, et partout : ce qui est écrit est tenu, dans la Maison, au règlement. Une offre annoncée est une offre honorée. Un acompte, s'il est demandé, est dit avant.\n\nCe n'est pas une stratégie. C'est ce qu'une maison doit à celles qui lui confient dix ans de leur couronne.\n\n#MaisonMND #LocksCotonou #Artisanat",
  "visuel": "Photo : regard.jpg. Sur l’image : Pourquoi nous n'affichons aucun prix.",
  "note": "Premier commentaire : « Réserver une consultation, en trois pas : https://maisonmnd.com/reserver/?utm_source=linkedin&utm_medium=post&utm_campaign=aucun-prix » · Visuel : la couronne de près (regard.jpg), indigo sur ivoire. Les commentaires : ceux qui demandent un prix reçoivent la même phrase, calme : « Le devis se fait à la Maison, après avoir regardé votre couronne. Écrivez-nous, nous vous répondons. »"
 },
 {
  "id": "linkedin-deux-mois-2026-11-03-06",
  "plan": "linkedin-deux-mois",
  "date": "2026-11-03",
  "plateformes": [
   "linkedin"
  ],
  "format": "post",
  "serie": "Seize ans",
  "sujet": "Le jour où nous avons dit non",
  "description": "Un récit sur ce qu'une maison refuse : serrer plus fort, alourdir, créer sur un cuir chevelu qui ne pourra pas porter. Sans nommer personne.",
  "accroche": "Le geste le plus difficile de ce métier n'est pas un geste. C'est de ne pas le faire.",
  "legende": "Le geste le plus difficile de ce métier n'est pas un geste. C'est de ne pas le faire.\n\nUne cliente arrive avec une couronne mûre, au palier de la Souveraineté, et une tension au sommet du crâne en fin de journée. Elle demande qu'on resserre. La racine porte déjà plus qu'elle ne peut. Resserrer, ce jour-là, c'est casser dans six mois.\n\nNous disons non. Nous expliquons. Nous proposons de couper quelques centimètres, en deux fois si elle hésite, pour enlever du poids sans rien enlever à la couronne.\n\nUne autre demande une création sur un cuir chevelu qui ne pourra pas porter les sections qu'elle imagine. Nous disons non à ces sections-là, et oui à d'autres, plus nombreuses, plus fines, qu'elle portera dix ans.\n\nUne troisième, pressée, voudrait sauter la consultation. Non.\n\nChacun de ces non a coûté quelque chose ce jour-là. Chacun a construit ce que la Maison est : un endroit où l'on vous dit ce qui est bon pour votre couronne, même quand ce n'est pas ce que vous êtes venue chercher.\n\nSeize ans nous ont appris que les couronnes qui vieillissent le mieux sont celles à qui l'on a su dire non, au bon moment, avec des mots.\n\n#MaisonMND #LocksCotonou #Artisanat",
  "visuel": "Photo : creation.jpg. Sur l’image : Le jour où nous avons dit non.",
  "note": "Premier commentaire : « Comment savoir si mes locks sont trop lourdes, sur le Journal : https://maisonmnd.com/journal/locks-trop-lourdes/?utm_source=linkedin&utm_medium=post&utm_campaign=dire-non » · Visuel : les cauris, indigo sur ivoire. Aucun cas n'est identifiable : trois situations, aucune personne."
 },
 {
  "id": "linkedin-deux-mois-2026-11-10-07",
  "plan": "linkedin-deux-mois",
  "date": "2026-11-10",
  "plateformes": [
   "linkedin"
  ],
  "format": "document",
  "serie": "La méthode · Document",
  "sujet": "Trois paliers",
  "description": "Le second document : une couronne sur dix ans, palier par palier, et ce que la Maison fait à chacun.",
  "accroche": "Une couronne de locks a un âge, et chaque âge demande autre chose. Nous en distinguons trois.",
  "legende": "Une couronne de locks a un âge, et chaque âge demande autre chose. Nous en distinguons trois.\n\nLa Fondation. Les premiers mois. Les locks sont jeunes ; elles bougent, gonflent, paraissent irrégulières. Elles se forment de l'intérieur. On y demande de la patience, un lavage doux, et surtout : qu'on n'y touche pas trop.\n\nL'Élévation. Les années où la couronne prend sa forme, sa longueur, son caractère. C'est le temps du SÍNSIN™ régulier, de l'hydratation qui tient, des coiffures qui ne tirent pas. La plupart des erreurs se font ici : trop serrer, trop huiler, trop attacher.\n\nLa Souveraineté. Une couronne mûre, lourde de ses années. On y surveille le poids, on allège quand il faut, on protège les racines qui portent tout. C'est aussi le palier des plus belles couronnes que nous ayons vues.\n\nÀ chaque palier, les mêmes quatre temps, Purifier, Nourrir, Sceller, Couronner, mais pas les mêmes gestes ni le même rythme. Savoir à quel palier est une couronne, c'est la première chose qu'on apprend à voir, et la première chose que MND Formation enseigne à reconnaître.\n\nLe document ci-joint donne, pour chaque palier, ce qu'on fait et ce qu'on évite.\n\n#MaisonMND #MNDFormation #LocksCotonou",
  "visuel": "",
  "note": "Le document : six pages : la couverture, une page par palier (ce qu'on fait, ce qu'on évite), une page « les quatre temps à chaque palier », une dernière page vers les formations. Premier commentaire : « Le programme de MND Formation : https://maisonmnd.com/formations/?utm_source=linkedin&utm_medium=post&utm_campaign=paliers »."
 },
 {
  "id": "linkedin-deux-mois-2026-11-17-08",
  "plan": "linkedin-deux-mois",
  "date": "2026-11-17",
  "plateformes": [
   "linkedin"
  ],
  "format": "post",
  "serie": "Transmettre",
  "sujet": "Avant de confier une tête",
  "description": "Le chemin d'une élève à MND Formation, de la candidature au jury, tel qu'il existe dans Le Trône. Sans jargon interne.",
  "accroche": "À MND Formation, personne ne touche une vraie couronne avant d'avoir montré trois choses. Aucune des trois n'est un geste.",
  "legende": "À MND Formation, personne ne touche une vraie couronne avant d'avoir montré trois choses. Aucune des trois n'est un geste.\n\nLe chemin d'une élève tient en six pas. Une candidature, où l'on regarde moins l'expérience que la raison de venir. Une inscription, avec un livret que l'élève garde. Des séances, où l'on regarde des mains qui savent, longtemps, avant de refaire. Une pratique sur cliente, à la Maison, sous nos yeux, sur des couronnes dont les propriétaires ont dit oui. Des modules, qui s'évaluent. Et un jury.\n\nLes trois choses que nous demandons avant la pratique sur cliente : savoir dire à quel palier est une couronne ; savoir ce qu'on ne fait jamais, et pourquoi ; et savoir dire « je ne sais pas encore » plutôt que d'improviser sur une tête qui n'est pas la sienne.\n\nLe jury donne une mention : certifiée, ou Excellence. Le certificat porte un numéro, délivré par la Maison, sur le référentiel MND.\n\nNous ne formons pas vite. Nous formons des mains à qui l'on peut confier dix ans de couronne.\n\nLes trois entrées de MND Formation, Débutante, Professionnelle, Certifiante, sont sur le site, en premier commentaire.\n\n#MNDFormation #MaisonMND #Formation",
  "visuel": "Photo : trois-couronnes.jpg. Sur l’image : Ce que nous demandons à une élève avant de lui confier une tête.",
  "note": "Premier commentaire : « Les trois parcours et la demande de rappel : https://maisonmnd.com/formations/?utm_source=linkedin&utm_medium=post&utm_campaign=eleve » · Visuel : les trois couronnes, indigo sur ivoire. Registre : aucun prénom d'élève, aucun visage d'élève sans son accord écrit."
 },
 {
  "id": "linkedin-deux-mois-2026-11-24-09",
  "plan": "linkedin-deux-mois",
  "date": "2026-11-24",
  "plateformes": [
   "linkedin"
  ],
  "format": "post",
  "serie": "La Maison · À fixer",
  "sujet": "Nous recrutons, ou : deux mois sous notre nom",
  "description": "Si la Maison recrute, ce texte ; sinon, le second, plus bas.",
  "accroche": "Nous cherchons une personne. Pas un profil : une personne. Voici ce que nous lui demandons, et ce que nous lui promettons.",
  "legende": "Nous cherchons une personne. Pas un profil : une personne. Voici ce que nous lui demandons, et ce que nous lui promettons.\n\nLe poste : à fixer (locticienne confirmée, apprentie, ou accueil et réservations).\n\nCe que nous demandons : la patience de regarder avant de faire ; le respect d'une méthode qui a un ordre ; le vouvoiement avec chaque cliente ; et l'envie d'apprendre les gestes que nous nommons, ou de les transmettre.\n\nCe que nous promettons : une maison, pas un salon. Une méthode écrite, transmise chaque jour. Des mains qui savent, à côté des vôtres. Un contrat, une fiche de paie, une entreprise immatriculée à Cotonou depuis 2010. Et des clientes qui reviennent depuis dix ans, parce qu'on leur a dit la vérité le premier jour.\n\nÉcrivez-nous à contact@maisonmnd.com, avec trois lignes sur vous et une sur la raison. Pas de CV obligatoire ; si vous en avez un, joignez-le.\n\n#MaisonMND #Recrutement #Cotonou",
  "visuel": "Photo : hero.jpg. Sur l’image : Nous recrutons.",
  "note": "Deux textes, un seul publié. Le premier si vous recrutez (poste en cuivre) ; sinon le second, avec les vrais chiffres relevés dans Le Trône la veille, jamais des chiffres ronds. Premier commentaire : le site, campagne « recrutement » ou « deux-mois »."
 }
];
