/* LES CONTRATS DE LA MAISON, ÉPROUVÉS — `node scripts/verifie-contrats.mjs`.

   Prestataire et formation. Comme le droit à l'image, ce sont des papiers qui
   peuvent finir devant un tribunal : une clause absente ne se voit pas à
   l'écran, elle se découvre le jour où quelqu'un conteste. */
import {
  numerote, signatureInvalide, dureeEnClair, sommeLisible, entreLesParties,
} from '../src/shared/contrats';
import {
  texteContratPrestataire, VERSION_PRESTATAIRE, MOIS_NON_DEMARCHAGE, JOURS_DE_REGLEMENT,
} from '../src/shared/contrat-prestataire';
import {
  texteContratFormation, VERSION_FORMATION, MOIS_AVANT_LICENCE,
} from '../src/shared/contrat-formation';
import {
  aChangeDe, aTravaillerDe, enVigueurDe, prochaineVersionDe, publieDe, type Versionne,
} from '../src/shared/textes';
import {
  BORNES, FORMATION_V1, IMAGE_V1, PRESTATAIRE_V1, pourquoiFormationImpossible,
  pourquoiImageImpossible, pourquoiPrestataireImpossible, type ReglageImage,
} from '../src/shared/reglages-contrats';

let ko = 0;
const dit = (nom: string, attendu: unknown, obtenu: unknown) => {
  const ok = JSON.stringify(attendu) === JSON.stringify(obtenu);
  if (!ok) ko++;
  console.log(`${ok ? 'OK   ' : 'ÉCHEC'} ${nom} → ${JSON.stringify(obtenu)}`);
  if (!ok) console.log(`       attendu ${JSON.stringify(attendu)}`);
};

const MAISON = { maison: 'L’atelier MND', raison: 'MND SARL', ville: 'Cotonou' };
const corps = (c: { articles: { lignes: string[] }[] }) =>
  c.articles.map((a) => a.lignes.join(' ')).join(' ');
const art = (c: { articles: { titre: string; lignes: string[] }[] }, mot: string) =>
  c.articles.find((a) => a.titre.toLowerCase().includes(mot));

/* ── ① LA NUMÉROTATION SE CALCULE ──────────────────────────────────
   Une clause qui n'existe que dans certains cas déplace toutes celles d'après.
   Les compter à la main est la faute qui arrive au troisième contrat. */
dit('les articles se numérotent', ['1', '2', '3'],
  numerote([{ titre: 'a', lignes: [] }, null, { titre: 'b', lignes: [] }, false, { titre: 'c', lignes: [] }])
    .map((a) => a.n));
dit('un contrat sans article ne casse pas', 0, numerote([null, undefined, false]).length);

/* ── ② LA SIGNATURE, LE MÊME JUGE POUR LES TROIS ───────────────────
   Trois vérifications séparées finiraient par diverger, et l'une accepterait
   ce que l'autre refuse. */
const TRAIT = 'data:image/png;base64,' + 'x'.repeat(120);
const bonne = { at: '2026-09-06', signePar: 'Kossi A.', signature: TRAIT, version: 'v1' };
dit('rien du tout', 'Aucun document signé.', signatureInvalide(undefined));
dit('un trait trop court n’est pas une signature', 'Sans signature, ce n’est pas un contrat.',
  signatureInvalide({ ...bonne, signature: 'data:image/png;base64,AA' }));
dit('sans nom', 'Le document ne nomme personne.', signatureInvalide({ ...bonne, signePar: ' ' }));
dit('sans date', 'Un contrat sans date ne se défend pas.', signatureInvalide({ ...bonne, at: '' }));
dit('complète', undefined, signatureInvalide(bonne));
/* QUAND ON SIGNE POUR QUELQU'UN, IL FAUT LE NOMMER : un parent, un employeur.
   Un contrat qui ne dit pas pour qui l'on signe n'engage personne. */
dit('pour autrui sans nommer', 'Le document doit nommer la personne pour qui l’on signe.',
  signatureInvalide(bonne, { pourAutrui: true }));
dit('pour autrui, nommée', undefined,
  signatureInvalide({ ...bonne, pourQui: 'Ezra' }, { pourAutrui: true }));

/* ── ③ LE PRESTATAIRE N'EST PAS UN SALARIÉ ─────────────────────────
   Tout le contrat tient à cette phrase : sans elle, la relation se requalifie
   en contrat de travail, avec les cotisations et les indemnités qui suivent. */
const p = texteContratPrestataire({
  ...MAISON, nom: 'Kossi A.', specialite: 'coloriste', mode: 'pourcentage', taux: 40,
  joursDeReglement: JOURS_DE_REGLEMENT, jourIso: '2026-09-06',
});
dit('l’indépendance est écrite', true, corps(p).includes('aucun lien de subordination'));
dit('… et il n’est ni salarié ni agent', true, corps(p).includes('ni salarié, ni agent'));
dit('… et il fait ses propres déclarations', true, corps(p).includes('cotisations'));

/* LES TROIS PROTECTIONS DEMANDÉES (arbitrage de Yéman). */
dit('la clientèle est protégée', true, !!art(p, 'clientèle'));
dit('… avec un terme, pas à vie', true, corps(p).includes(dureeEnClair(MOIS_NON_DEMARCHAGE)));
/* UNE CLAUSE QU'UN JUGE TROUVE EXCESSIVE TOMBE EN ENTIER, et ne protège plus
   rien : le contrat dit donc ce qu'elle N'interdit PAS. */
dit('… et elle n’interdit pas d’exercer', true, corps(p).includes('pas d’une interdiction d’exercer'));
dit('les gestes de la Maison sont protégés', true, !!art(p, 'gestes'));
dit('… mais pas ce qu’il savait déjà', true, corps(p).includes('avant d’entrer à la Maison lui reste acquis'));
dit('la discrétion est protégée', true, !!art(p, 'discrétion'));
dit('… et elle n’a pas de terme', true, corps(p).includes('n’a pas de terme'));
/* CE QUI SURVIT À LA FIN DOIT ÊTRE DIT : une clause de survie oubliée rend les
   trois protections caduques le jour du départ, c'est-à-dire quand elles
   servent. */
dit('les trois survivent à la fin', true, corps(p).includes('survivent à la fin du contrat'));

/* LA TENUE — 6 septembre 2026, demande de Yéman. La moitié de ces règles sont
   des règles de SÉCURITÉ déguisées en règles d'allure : une bague accroche une
   lock, un parfum lourd finit sur un cuir chevelu ouvert. */
dit('la tenue a son article', true, !!art(p, 'tenue'));
dit('… les mains, d’abord', true, corps(p).includes('ongles courts'));
dit('… les bagues qui accrochent', true, corps(p).includes('accrochent une lock'));
dit('… et le parfum', true, corps(p).includes('parfum lourd'));
/* ELLE NE VAUT QUE PENDANT LA MISSION. Dicter son apparence en dehors du salon
   serait un lien de subordination, et ferait tomber l'article d'indépendance —
   c'est-à-dire tout le contrat. */
dit('… mais seulement pendant la mission', true,
  corps(p).includes('ne vaut que pendant les heures de mission'));
dit('… et hors de là, il fait comme il veut', true, corps(p).includes('comme il l’entend'));
/* DEUX SENS DU MOT « TENIR » À TROIS LIGNES L'UN DE L'AUTRE, et l'on ne sait
   plus lequel on lit : l'article des engagements a été renommé. */
dit('plus de « s’engage à tenir »', false,
  p.articles.some((a) => a.titre.includes('s’engage à tenir')));

dit('le taux se dit en pourcentage', true, corps(p).includes('40 %'));
const pf = texteContratPrestataire({
  ...MAISON, nom: 'Kossi A.', mode: 'forfait', taux: 25000,
  joursDeReglement: 7, jourIso: '2026-09-06',
});
dit('… ou en francs', true, corps(pf).includes(sommeLisible(25000)));
/* SANS TAUX CONNU, ON N'INVENTE PAS DE CHIFFRE : le contrat dit qu'il se
   convient avant chaque mission. */
const ps = texteContratPrestataire({
  ...MAISON, nom: 'Kossi A.', mode: 'prestation',
  joursDeReglement: 7, jourIso: '2026-09-06',
});
dit('sans taux, rien n’est inventé', true, corps(ps).includes('convenu avant chaque mission'));
dit('le pied porte la version', true, p.pied.includes(VERSION_PRESTATAIRE));

/* ── ④ LA FORMATION ────────────────────────────────────────────────
   Deux arbitrages fermes de Yéman : le prix est dû en entier, et la méthode
   s'enseigne sous licence. */
const f = texteContratFormation({
  ...MAISON, apprenante: 'Adjaratou L.', formation: 'Le Geste Fondateur',
  prixXof: 450000, echeances: 3, semaines: 12, debutIso: '2026-10-05', jourIso: '2026-09-06',
});
dit('le prix est écrit', true, corps(f).includes(sommeLisible(450000)));
dit('… et l’échéance aussi', true, corps(f).includes(sommeLisible(150000)));
dit('trois versements', true, corps(f).includes('3 versements'));
const comptant = texteContratFormation({
  ...MAISON, apprenante: 'A.', formation: 'F', prixXof: 100000, echeances: 1, jourIso: '2026-09-06',
});
dit('un seul versement se dit « comptant »', true, corps(comptant).includes('comptant'));

/* L'ABANDON : LA CLAUSE LA PLUS DURE DU LOT. Elle est écrite telle qu'elle a
   été décidée, avec SA RAISON — une clause dont la raison est écrite se
   défend, une clause nue se casse. */
dit('le prix reste dû en entier', true, corps(f).includes('reste dû en entier'));
dit('… et la raison est écrite', true, corps(f).includes('réserve pour l’apprenante une place'));
dit('… et la Maison peut arranger', true, corps(f).includes('consentir un arrangement'));
/* L'INVERSE AUSSI : si c'est la Maison qui interrompt, elle rembourse. Un
   contrat qui n'engage qu'un côté se fait renvoyer. */
dit('si la Maison interrompt, elle rembourse', true, corps(f).includes('rembourse les modules non dispensés'));

dit('la certification ne s’achète pas', true, corps(f).includes('n’est pas acquise du seul fait d’avoir payé'));
dit('un ajournement se rattrape', true, corps(f).includes('se représenter une fois'));

/* LA MÉTHODE : EXERCER LIBREMENT, ENSEIGNER SOUS LICENCE. */
dit('elle exerce librement', true, corps(f).includes('exerce librement'));
dit('… et peut enseigner sous licence', true, corps(f).includes('sous licence'));
dit('… avec un délai avant de la demander', true, corps(f).includes(`${MOIS_AVANT_LICENCE} mois`));
dit('… et sans licence, pas au nom de la Maison', true, corps(f).includes('Sans cette licence'));
/* SON IMAGE SE DEMANDE À PART. Confondre les travaux et le visage ferait
   signer, dans un contrat de formation, un droit à l'image qui n'y est pas. */
dit('son image se signe à part', true, corps(f).includes('autorisation écrite distincte'));

/* ── ⑤ QUAND QUELQU'UN SIGNE POUR ELLE ─────────────────────────────
   Un employeur qui finance, un parent. L'article ne paraît que dans ce cas,
   et la numérotation reste continue. */
const fp = texteContratFormation({
  ...MAISON, apprenante: 'Ezra', formation: 'F', prixXof: 100000, echeances: 1,
  pourQui: 'Adjaratou L.', qualiteSignataire: 'sa mère', jourIso: '2026-09-06',
});
dit('l’article du signataire paraît', true, !!art(fp, 'signataire'));
dit('… et il répond du règlement', true, corps(fp).includes('répond du règlement'));
dit('… mais l’assiduité reste celle de l’apprenante', true,
  corps(fp).includes('restent ceux de l’apprenante'));
dit('sans signataire, pas l’article', false, !!art(f, 'signataire'));
const suite = (c: { articles: { n: string }[] }) =>
  c.articles.map((a) => Number(a.n)).every((n, i) => n === i + 1);
dit('numérotation continue, formation simple', true, suite(f));
dit('… avec un signataire', true, suite(fp));
dit('… et pour le prestataire', true, suite(p));
dit('le pied porte la version', true, f.pied.includes(VERSION_FORMATION));

/* ── ⑥ LES DEUX PARTIES SONT TOUJOURS NOMMÉES ──────────────────────
   Un contrat dont on ne sait pas qui l'a passé ne vaut rien, quelle que soit
   la qualité de ses clauses. */
dit('deux parties, toujours', 2, p.entete.length);
dit('la Maison est nommée', true, p.entete[0].includes('L’atelier MND'));
dit('le siège aussi', true, p.entete[0].includes('Cotonou'));
dit('la qualité de chacun est dite', true, p.entete[1].includes('le prestataire'));
dit('et le « pour qui » quand il y en a un', true,
  entreLesParties({ maison: 'M', autre: 'A', qualiteAutre: 'le signataire', pourQui: 'E' })[1]
    .includes('agissant pour E'));

/* ── LES RÉGLAGES DE LA MAISON — 7 septembre 2026 ──────────────────
   « Dans les textes de la Maison il manque les contrats » (Yéman). Quatre
   nombres sortent du code et se règlent à l'écran. */

/* CE QUE LE TEXTE DIT SUIT LE RÉGLAGE, sans qu'on ait rien recopié : la durée
   vivait dans une constante lue au fond du fichier, et la régler à l'écran
   n'aurait rien changé au papier. */
const avecDuree = (mois: number) => texteContratPrestataire({
  maison: 'M', nom: 'N', mode: 'prestation', jourIso: '2026-09-07', moisNonDemarchage: mois,
}).articles.flatMap((a) => a.lignes).join(' ');
dit('le non-démarchage suit le réglage', true, avecDuree(6).includes(dureeEnClair(6)));
dit('… et sans réglage, celui de la Maison', true,
  texteContratPrestataire({ maison: 'M', nom: 'N', mode: 'prestation', jourIso: '2026-09-07' })
    .articles.flatMap((a) => a.lignes).join(' ').includes(dureeEnClair(MOIS_NON_DEMARCHAGE)));
const avecLicence = (mois: number) => texteContratFormation({
  maison: 'M', apprenante: 'A', formation: 'F', prixXof: 0, echeances: 1,
  jourIso: '2026-09-07', moisAvantLicence: mois,
}).articles.flatMap((a) => a.lignes).join(' ');
dit('la licence suit le réglage', true, avecLicence(18).includes('dès 18 mois'));
dit('… et sans réglage, celui de la Maison', true,
  avecLicence(MOIS_AVANT_LICENCE).includes(`dès ${MOIS_AVANT_LICENCE} mois`));

/* LES BORNES NE SONT PAS DE LA COQUETTERIE DE SAISIE. Un droit à l'image sans
   terme réel n'est pas un consentement ; un non-démarchage excessif tombe en
   entier, et la Maison perd la protection qu'elle croyait acheter. */
dit('cinq ans d’image passent', undefined, pourquoiImageImpossible({ mois: 60 }));
dit('… quatre-vingt-dix-neuf ans, non', true, !!pourquoiImageImpossible({ mois: 1188 }));
dit('… et zéro non plus', true, !!pourquoiImageImpossible({ mois: 0 }));
dit('un an de non-démarchage passe', undefined,
  pourquoiPrestataireImpossible({ moisNonDemarchage: 12, joursDeReglement: 7 }));
dit('… cinq ans, non', true,
  !!pourquoiPrestataireImpossible({ moisNonDemarchage: 60, joursDeReglement: 7 }));
/* AUCUN NON-DÉMARCHAGE EST UN CHOIX VALIDE : la Maison peut décider de ne pas
   en poser. Le refuser ferait imposer une clause par la mécanique. */
dit('… aucun non-démarchage est permis', undefined,
  pourquoiPrestataireImpossible({ moisNonDemarchage: 0, joursDeReglement: 7 }));
dit('… mais pas quatre-vingt-dix jours de règlement', true,
  !!pourquoiPrestataireImpossible({ moisNonDemarchage: 12, joursDeReglement: 90 }));
dit('la licence tient dans ses bornes', undefined, pourquoiFormationImpossible({ moisAvantLicence: 12 }));
dit('… pas au-delà', true, !!pourquoiFormationImpossible({ moisAvantLicence: 999 }));
/* UN CHAMP VIDÉ REND `NaN`, PAS ZÉRO : sans ce filet, la borne laisserait
   passer un contrat dont le terme ne se lit pas. */
dit('un champ vidé se refuse', true, !!pourquoiImageImpossible({ mois: Number.NaN }));
dit('les bornes sont écrites', true, BORNES.imageMois.max === 120 && BORNES.nonDemarchageMois.max === 24);

/* ── LA MÉCANIQUE DES VERSIONS, PARTAGÉE ───────────────────────────
   La même pour le règlement et pour les trois contrats. L'écrire deux fois lui
   aurait donné deux comportements au premier correctif. */
const e0: Versionne<ReglageImage> = { publies: [IMAGE_V1] };
dit('la dernière publiée est en vigueur', IMAGE_V1.version, enVigueurDe(e0, IMAGE_V1).version);
dit('un magasin vide retombe sur la Maison', IMAGE_V1.version,
  enVigueurDe({ publies: [] }, IMAGE_V1).version);
/* LE NUMÉRO SE COMPTE DEPUIS CELLE EN VIGUEUR. Le droit à l'image était déjà
   en v2 en entrant dans le magasin : compter les lignes gardées aurait produit
   une SECONDE v2, et deux accords signés auraient porté le même nom sans dire
   la même chose. */
dit('la prochaine se compte depuis celle en vigueur', 'v3 · 7 septembre 2026',
  prochaineVersionDe(e0, '2026-09-07', IMAGE_V1));
dit('… et une v1 donne bien une v2', 'v2 · 7 septembre 2026',
  prochaineVersionDe({ publies: [FORMATION_V1] }, '2026-09-07', FORMATION_V1));
dit('sans brouillon, rien n’a changé', false, aChangeDe(e0, IMAGE_V1));
/* LE BROUILLON PART DE CE QUI EST EN VIGUEUR, sans sa version : recopier le
   numéro dans le brouillon ferait publier v1 une seconde fois. */
dit('le brouillon part du texte en vigueur, sans son numéro',
  { mois: IMAGE_V1.mois }, aTravaillerDe(e0, IMAGE_V1));
const e1: Versionne<ReglageImage> = { publies: [IMAGE_V1], brouillon: { mois: 36 } };
dit('un brouillon différent se voit', true, aChangeDe(e1, IMAGE_V1));
dit('… et il ne s’applique à personne', IMAGE_V1.mois, enVigueurDe(e1, IMAGE_V1).mois);
const e2 = publieDe(e1, IMAGE_V1, '2026-09-07');
dit('publier garde l’ancienne', 2, e2.publies.length);
dit('… la nouvelle porte le réglage', 36, enVigueurDe(e2, IMAGE_V1).mois);
dit('… et son numéro', 'v3 · 7 septembre 2026', enVigueurDe(e2, IMAGE_V1).version);
dit('… le brouillon s’efface', undefined, e2.brouillon);
/* RIEN NE S'ÉCRASE JAMAIS : une signature d'hier désigne sa version, et sans
   elle on ne saurait plus à quoi cette personne a dit oui. */
dit('… et l’ancienne reste lisible', IMAGE_V1.mois, e2.publies[0].mois);

/* CHACUN SA VERSION : changer le délai d'un prestataire n'a aucune raison de
   renuméroter le droit à l'image d'une cliente. */
dit('les trois partent de leur propre version',
  [VERSION_PRESTATAIRE, VERSION_FORMATION],
  [PRESTATAIRE_V1.version, FORMATION_V1.version]);
dit('… et le prestataire porte ses deux nombres',
  [MOIS_NON_DEMARCHAGE, JOURS_DE_REGLEMENT],
  [PRESTATAIRE_V1.moisNonDemarchage, PRESTATAIRE_V1.joursDeReglement]);

console.log(ko === 0 ? '\nTout passe.' : `\n${ko} ÉCHEC(S).`);
process.exit(ko === 0 ? 0 : 1);
