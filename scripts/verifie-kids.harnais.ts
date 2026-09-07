/* MND KIDS, ÉPROUVÉ — `node scripts/verifie-kids.mjs`.

   « Dans les foyers, j'ai des enfants. J'aimerais une section de service
   shampoing retenue pour les MND Kids, où le total ne revient pas à plus de
   25 000 » puis « rajoute le SÍNSIN Kids et le VÈKPÈ Kids, donc le Kids dans
   les 4 ateliers » (Yéman, 2 et 3 septembre 2026).

   DEUX FAUTES SE PAIERAIENT DEVANT LA CLIENTE : un forfait qui déborde le
   plafond annoncé, et une section qui se refuse à un enfant dont la fiche ne
   porte pas de date de naissance. Le harnais tient les deux. */
import { AGE_MND_KIDS, estKids } from '../src/shared/accounts';
import {
  SERVICES_KIDS, FORFAIT_KIDS, FORFAIT_KIDS_NAISSANCE, TOUT_KIDS, kidsAbsents, CAT_KIDS, catalogueDeLaTete,
  metAJourLaSectionKids, empreinteKids,
  compositionDuForfait, gainDuForfait, detailDuForfait, kidsADepasser, pourQui,
} from '../src/shared/kids';
import {
  MODEL_BANDS_SEED, estProposable, personalPriceXof, prixDeBase, prixSelonLesLocks, pricingOf,
} from '../src/shared/pricing';
import { servicesStore, type Service } from '../src/shared/catalog';
import type { Client } from '../src/shared/clients';

let ko = 0;
const dit = (nom: string, attendu: unknown, obtenu: unknown) => {
  const ok = JSON.stringify(attendu) === JSON.stringify(obtenu);
  if (!ok) { ko++; process.exitCode = 1; }
  console.log(`${ok ? 'OK   ' : 'ÉCHEC'} ${nom} → ${JSON.stringify(obtenu)}`);
  if (!ok) console.log(`       attendu ${JSON.stringify(attendu)}`);
};

/* LA LISTE DE LA SECTION VIENT DU MODULE, jamais recopiée : trois copies
   locales en différaient déjà, et l'une d'elles ne connaissait pas le pack de
   naissance. Le harnais juge LA liste ou ne juge rien. */
const TOUT = TOUT_KIDS;

/* LES GESTES SE DÉSIGNENT PAR LEUR IDENTIFIANT — 7 septembre 2026. Ils se
   lisaient par leur rang dans le tableau : `SERVICES_KIDS[3]` était le
   shampoing jusqu'à ce que la Retouche Post Création s'insère en deuxième
   position, et trois assertions se sont mises à juger la mauvaise prestation
   sans rien dire de faux. Un rang n'est pas un nom. */
const geste = (id: string) => SERVICES_KIDS.find((x) => x.id === id)!;
const VEKPE = geste('sv-kids-vekpe');
const RETOUCHE = geste('sv-kids-retouche');
const SINSIN = geste('sv-kids-sinsin');
const GBIGBI = geste('sv-kids-gbigbi');
const KLOKLO = geste('sv-kids-kloklo');

const JOUR = '2026-09-03';
const neeEn = (annee: number): Client => ({ birthday: `${annee}-01-01` } as Client);

/* ── ① LA PORTE, C'EST L'ÂGE ───────────────────────────────────────
   Quinze ans est la limite retenue : la Maison compte les mineurs à 18 pour la
   remise du foyer, mais un tarif enfant à dix-sept ans ne se défend pas devant
   les autres clientes. */
dit('l’âge qui fait un Kids', 15, AGE_MND_KIDS);
dit('une tête de 9 ans est un Kids', 'oui', estKids(neeEn(2017), JOUR));
dit('une tête de 15 ans l’est encore', 'oui', estKids(neeEn(2011), JOUR));
dit('une tête de 16 ans ne l’est plus', 'non', estKids(neeEn(2010), JOUR));
/* TROIS RÉPONSES, PAS DEUX. Une fiche sans date de naissance n'est pas une
   adulte : c'est une INCONNUE. Répondre « non » lui refuserait le tarif enfant
   sans un mot, et la faute ne se verrait qu'à la caisse. */
dit('sans date de naissance, on ne sait pas', 'inconnu', estKids({} as Client, JOUR));
dit('sans fiche du tout, on ne sait pas non plus', 'inconnu', estKids(undefined, JOUR));

/* ── ② CE QUE LE JUGE LAISSE PASSER ────────────────────────────────
   `estProposable` refuse la section à une adulte, la donne à un enfant, et la
   laisse voir quand l'âge est inconnu — l'écran la signale alors. */
const pricing = {} as Parameters<typeof estProposable>[1];
const kidsSvc = VEKPE;
const ordinaire = { id: 'sv-x', categoryId: 'c', name: 'Rituel ordinaire' } as Service;

dit('la section se propose à un enfant', true, estProposable(kidsSvc, pricing, 9, false, 'oui'));
dit('… se refuse à une adulte', false, estProposable(kidsSvc, pricing, 9, false, 'non'));
dit('… et passe quand l’âge est inconnu', true, estProposable(kidsSvc, pricing, 9, false, 'inconnu'));
/* UNE PRESTATION ORDINAIRE NE SE FERME À PERSONNE : la porte des Kids ne
   s'applique qu'à ce qui la porte. */
dit('un rituel ordinaire reste ouvert à une adulte', true,
  estProposable(ordinaire, pricing, 9, false, 'non'));
/* PAR DÉFAUT, AUCUN APPELANT NE SE VOIT RIEN RETIRER : les écrans qui n'ont pas
   encore de tête (la caisse au comptoir) continuent de tout montrer. */
dit('sans verdict, la section reste visible', true, estProposable(kidsSvc, pricing, 9));

/* ── ③ LES QUATRE ATELIERS, ET LE PLATEAU ──────────────────────────
   Cinq gestes : la création, la reprise, la sublimation, le renfort, le
   shampoing. */
/* SIX GESTES ET DEUX PACKS. Un seul nombre écrit ici — celui de la décision ;
   tout le reste se dérive, pour qu'une fiche de plus ne fasse changer qu'une
   ligne. */
dit('six gestes dans la section', 6, SERVICES_KIDS.length);
dit('… et huit fiches en tout', 8, TOUT.length);
/* ══ LA CRÉATION SEULE, ET LE PACK QUI LA CONTIENT ═════════════════
   La couronne avait d'abord porté ses retouches elle-même ; l'écran du forfait
   a montré pourquoi cela ne tenait pas : une prestation ne peut pas figurer
   dans sa propre composition, et le Catalogue lisait 35 000 F de contenu sous
   un prix de 150 000 — « Majoration · −329 % ». */
dit('la couronne seule vaut cent vingt mille', 120_000, VEKPE.priceXof);
dit('… et ne contient plus rien', undefined, VEKPE.includes);
dit('… en une venue', 1, VEKPE.sessions);

const NAISSANCE = FORFAIT_KIDS_NAISSANCE;
dit('le pack de naissance vaut cent cinquante mille', 150_000, NAISSANCE.priceXof);
dit('… et contient la pose puis ses trois suites',
  ['sv-kids-vekpe', 'sv-kids-retouche', 'sv-kids-retouche', 'sv-kids-sinsin'],
  (NAISSANCE.includes ?? []).map((i) => i.serviceId));
/* UNE VENUE D'OUVERTURE, et la cadence dit les trois autres — voir la garde
   « la cadence et la série ne se cumulent pas », plus bas. */
dit('… en une venue d’ouverture', 1, NAISSANCE.sessions);
/* LES SEMAINES SE POSENT, ELLES NE SE LISENT PAS. La description dit « à 2 et à
   4 semaines », mais c'est `afterWeeks` que le comptoir lit pour poser les
   rendez-vous : la phrase se lit, le nombre se pose. Sans lui, un chemin écrit
   en toutes lettres ne sortirait jamais du carnet. */
dit('… la pose le jour même, puis aux semaines 2, 4 et 8', [undefined, 2, 4, 8],
  (NAISSANCE.includes ?? []).map((i) => i.afterWeeks));
/* LES RETOUCHES SE RAPPROCHENT, LA REPRISE S'ÉLOIGNE : une couronne neuve se
   détend là où on l'a posée, dans les premières semaines. On la rattrape tôt et
   deux fois, puis on laisse deux mois avant la première vraie reprise. */
dit('… et la phrase dit la même chose que les nombres', true,
  NAISSANCE.description.includes('2 et à 4 semaines')
  && NAISSANCE.description.includes('8 semaines'));
dit('… la retouche aussi', true, RETOUCHE.description.includes('semaines 2 et 4'));
/* LE PACK TOMBE PILE, comme tous les forfaits de la Maison : 120 + 10 + 10 + 15
   font 155 000 F de gestes pour 150 000 demandés. */
const gNaissance = gainDuForfait(NAISSANCE, SERVICES_KIDS, NAISSANCE.priceXof);
dit('le pack de naissance tombe juste', [155_000, 150_000, 5_000],
  [gNaissance.carteXof, gNaissance.prixXof, gNaissance.gainXof]);
/* ET IL SUIT LA TÊTE : au-delà de 250 locks, la reprise comprise vaut 20 000. */
const gNaissance400 = gainDuForfait(NAISSANCE, SERVICES_KIDS, NAISSANCE.priceXof, 400);
dit('… et suit la tête', [160_000, 150_000, 10_000],
  [gNaissance400.carteXof, gNaissance400.prixXof, gNaissance400.gainXof]);
/* LA RETOUCHE NE PORTE PAS LA MARCHE DES 250 LOCKS : elle ne parcourt pas
   toute la tête, seulement ce qui a lâché depuis la pose. */
dit('la retouche ne porte pas de marche', undefined, RETOUCHE.paliersDeLocks);

/* LA SUBLIMATION REVIENT À SON TARIF, sans rien de barré : annoncer une remise
   qu'on ne fait plus serait un geste imaginaire. */
dit('les deux gestes en un valent quinze mille', 15_000, geste('sv-kids-yekpe').priceXof);
dit('… et ne barrent plus rien', undefined, geste('sv-kids-yekpe').prixBarreXof);
/* C'EST LE RENFORT SEUL QUI PORTE LE CADEAU DU PACK, à sa place. */
dit('le renfort seul garde le geste', [5_000, 15_000], [GBIGBI.priceXof, GBIGBI.prixBarreXof]);
dit('… tous réservés aux Kids', true, SERVICES_KIDS.every((s) => s.reserveEnfants === true));
dit('… tous dans la catégorie MND Kids', true, SERVICES_KIDS.every((s) => s.categoryId === CAT_KIDS));
dit('… et les deux packs aussi', true,
  TOUT.every((x) => x.reserveEnfants === true && x.categoryId === CAT_KIDS));
/* ── ④ LE PLAFOND DE 25 000 F, ET CE QUE LA MAISON DONNE ───────────
   « Le total ne revient pas à plus de 25 000 », puis « j'aurais voulu que les
   parents voient qu'on les accompagne vraiment avec nos tarifs : shampoing Le
   Souffle −50 %, reprise essentielle 15 000, sublimation renfort durable 5 000
   (−10 000 F) » (Yéman, 2 et 4 septembre 2026). */
dit('le forfait vaut 25 000 F', 25_000, FORFAIT_KIDS.priceXof);
/* LA SOMME DES TARIFS ENFANTS TOMBE PILE SUR LE FORFAIT : 5 000 + 15 000 +
   5 000. Le geste n'est pas une remise de plus sur le paquet, il est DANS
   chaque ligne — c'est ce qui se raconte au parent. */
const compo = compositionDuForfait(FORFAIT_KIDS, SERVICES_KIDS);
dit('les trois lignes du rituel', ['sv-kids-kloklo', 'sv-kids-sinsin', 'sv-kids-gbigbi'],
  compo.map((l) => l.serviceId));
dit('… leurs tarifs enfants', [5_000, 15_000, 5_000], compo.map((l) => l.prixXof));
dit('… et leur somme fait le forfait', 25_000, compo.reduce((n, l) => n + l.prixXof, 0));
/* LE PRIX BARRÉ DIT CE QUE LA MAISON DONNE, ligne par ligne. */
dit('le shampoing est à moitié prix', 50, compo[0].pct);
dit('… la reprise n’a rien à barrer', undefined, compo[1].barreXof);
dit('… et la sublimation avec le renfort donne 10 000 F', 10_000, compo[2].gainXof);
/* AU TARIF DE LA MAISON, LE RITUEL VAUDRAIT 40 000 F. Une ligne sans geste vaut
   ce qu'elle coûte : la compter à zéro gonflerait le gain annoncé. */
const g = gainDuForfait(FORFAIT_KIDS, SERVICES_KIDS);
dit('au tarif de la Maison, 40 000 F', 40_000, g.carteXof);
dit('… la tête gagne 15 000 F', 15_000, g.gainXof);
dit('… soit 38 %', 38, g.pct);
dit('… et le plafond tient', true, FORFAIT_KIDS.priceXof <= 25_000);

/* LA CRÉATION N'EST PAS DANS LE PAQUET : elle se pose une fois, le rituel
   d'entretien revient. Les mettre ensemble ferait payer d'avance ce qui ne se
   consomme pas ensemble. */
dit('la création reste hors du forfait', false,
  compo.some((l) => l.serviceId === 'sv-kids-vekpe'));

/* ── ⑤ ON NE RÉÉCRIT JAMAIS CE QUI EXISTE ──────────────────────────
   Le souverain a pu renommer une prestation, changer son prix, la ranger
   ailleurs : repasser dessus effacerait sa décision, et c'est le genre de perte
   qu'on ne remarque qu'au moment de facturer. */
dit('catalogue vide : tout manque', TOUT.length, kidsAbsents([]));
dit('section complète : rien ne manque', 0, kidsAbsents(TOUT));
dit('un seul geste posé : les autres manquent', TOUT.length - 1, kidsAbsents([VEKPE]));
/* UNE PRESTATION RENOMMÉE PAR LA MAISON compte comme posée : c'est son
   identifiant qui fait foi, pas son nom. */
dit('renommée, elle compte toujours comme posée', TOUT.length - 1,
  kidsAbsents([{ ...VEKPE, name: 'La première couronne, autrement dite' }]));

/* -- 6. UNE TETE D'ENFANT NE VOIT QUE MND KIDS --------------------
   « Quand je veux prendre RDV pour un enfant, n'ouvrir que le catalogue MND
   Kids dans la modale de RDV » (Yeman, 3 septembre 2026).

   LA PORTE NE SUFFISAIT PAS : elle retirait la section aux adultes, mais
   l'enfant voyait encore TOUT le catalogue, MND Kids noye au milieu de trente
   rituels dont aucun n'est pour lui. Rien n'empechait de poser a un enfant de
   neuf ans un GBIGBI Profond a 120 000 F. */
const catalogueMele = [ordinaire, ...SERVICES_KIDS];
dit('un enfant ne voit que MND Kids', 6, catalogueDeLaTete(catalogueMele, 'oui').length);
dit('… et rien d’autre', true,
  catalogueDeLaTete(catalogueMele, 'oui').every((x) => x.reserveEnfants === true));
dit('une adulte voit le catalogue entier', 7, catalogueDeLaTete(catalogueMele, 'non').length);
/* UN AGE INCONNU NE RESTREINT RIEN. On ne sait pas, donc on ne retire rien :
   cacher le catalogue entier a une tete dont la fiche n'a pas de date de
   naissance serait la faute la plus couteuse de toutes. */
dit('un age inconnu ne restreint rien', 7, catalogueDeLaTete(catalogueMele, 'inconnu').length);
/* UNE SECTION PAS ENCORE POSEE NE RESTREINT RIEN NON PLUS : sans elle, l'enfant
   se retrouverait devant une liste vide, et l'ecran aurait l'air casse au lieu
   d'etre seulement incomplet. */
dit('sans section posee, l’enfant voit tout', 1, catalogueDeLaTete([ordinaire], 'oui').length);
dit('un catalogue vide reste vide', 0, catalogueDeLaTete([], 'oui').length);

/* ── UNE FICHE SUPPRIMÉE RESTE SUPPRIMÉE — 6 septembre 2026 ────────
   « Sur le bouton MND Kids aussi. » Même faute, même remède : le compte
   affiché ne doit pas réclamer ce que la Maison a écarté, sans quoi le bouton
   ne s'éteint jamais et un clic ressuscite. */
const kidsTombe = new Set([TOUT[0].id]);
dit('l’écartée ne manque plus', TOUT.length - 1, kidsAbsents([], kidsTombe));
dit('… sans tombale, elle manque', TOUT.length, kidsAbsents([], new Set()));
/* ELLE NE SE REMET PAS AU TARIF NON PLUS : la fiche n'existe plus, et la
   compter reviendrait à promettre un geste qui ne touchera rien. */
const kidsDevie = TOUT.map((sv) => ({ ...sv, priceXof: sv.priceXof + 1000 }));
dit('toutes ont dérivé', TOUT.length, kidsADepasser(kidsDevie, new Set()));
dit('… sauf l’écartée', TOUT.length - 1, kidsADepasser(kidsDevie, kidsTombe));


/* ══ CE QUE LE PARENT LIT, SUR LE RDV ET SUR LA FACTURE ═════════════
   « Il faut traduire et sur le RDV et sur la facture » (Yéman, 4 septembre
   2026). Les deux écrans lisent la MÊME fonction : deux formulations du même
   geste finiraient par se contredire, et c'est devant le parent que cela se
   verrait. */
const fr = (x: number) => `${x} F`;
const dit3 = detailDuForfait(FORFAIT_KIDS, SERVICES_KIDS, fr);
dit('trois gestes et le mot de la fin', 4, dit3.length);
dit('… le shampoing dit sa moitié',
  'KLƆKLƆ™ Kids · Le Shampoing « Le Souffle » · 5000 F au lieu de 10000 F, 50 % offerts', dit3[0]);
/* UNE LIGNE SANS GESTE NE PROMET RIEN. Écrire « au lieu de 15 000 » sur la
   reprise inventerait une remise que la Maison n'a pas faite. */
dit('… la reprise dit son prix, sans rien promettre',
  'SÍNSIN™ Kids · La Reprise Essentielle · 15000 F', dit3[1]);
/* ON NE DIT PAS « ELLE » À UN PÈRE VENU AVEC SON FILS. « Ayant filles et
   garçons en Kids, il faut écrire 25 000 F pour les Kids » (Yéman, 4 septembre
   2026). Le mot reste juste au comptoir, où la Maison coiffe des femmes. */
dit('… le mot de la fin dit le geste entier',
  '40000 F au tarif de la Maison, 25000 F pour les Kids, 15000 F offerts', dit3[3]);
dit('la section des petites têtes ne dit pas « elle »', 'pour les Kids', pourQui(FORFAIT_KIDS));
/* LE NOM DIT QUE C'EST UN PACK. « Corrige le MND Kids le rituel complet en
   PACK MND KIDS Le rituel complet » (Yéman, 4 septembre 2026) : le mot
   annonce un ensemble, là où « le rituel complet » pouvait passer pour une
   prestation de plus dans la liste. */
dit('le forfait s’annonce comme un pack', 'PACK MND KIDS · Le rituel complet', FORFAIT_KIDS.name);
/* ET UN FORFAIT RESTÉ À L'ANCIEN NOM SE VOIT, sinon la section garderait
   deux appellations selon l'ancienneté de la fiche. */
dit('un forfait resté à l’ancien nom se remet au tarif', 1,
  kidsADepasser([{ ...FORFAIT_KIDS, name: 'MND Kids · Le Rituel Complet' }]));
dit('… et le comptoir le garde', 'pour elle', pourQui({ reserveEnfants: false }));
/* LA MÊME FONCTION LIT UNE MAP — c'est ce que porte la modale du rituel
   (`byId`) et ce que porte l'écran des factures (un tableau). Deux chemins,
   une seule vérité. */
const parId = new Map(SERVICES_KIDS.map((x) => [x.id, x] as const));
dit('la carte se lit en tableau comme en registre', dit3, detailDuForfait(FORFAIT_KIDS, parId, fr));
/* UNE PRESTATION SEULE N'A RIEN À DÉTAILLER : le détail ne doit pas s'écrire
   sur toutes les lignes du monde. La couronne seule non plus, depuis qu'elle
   ne contient rien. */
dit('une prestation simple ne détaille rien', 0,
  detailDuForfait(KLOKLO, SERVICES_KIDS, fr).length);
dit('… la couronne seule non plus', 0, detailDuForfait(VEKPE, SERVICES_KIDS, fr).length);
/* LE PACK DE NAISSANCE, LUI, DÉTAILLE SES QUATRE LIGNES plus le geste. */
dit('le pack de naissance détaille ce qu’il emporte', 5,
  detailDuForfait(FORFAIT_KIDS_NAISSANCE, SERVICES_KIDS, fr, FORFAIT_KIDS_NAISSANCE.priceXof).length);
/* LA REPRISE COMPRISE PORTE SA MARCHE : au-delà de 250 locks elle vaut 20 000,
   et la ligne doit le dire — c'est ce que la Maison donne qui change, pas le
   prix du pack. */
dit('… et la reprise comprise suit la tête', true,
  detailDuForfait(FORFAIT_KIDS_NAISSANCE, SERVICES_KIDS, fr, FORFAIT_KIDS_NAISSANCE.priceXof, 400)
    .some((l) => l.includes('La Reprise Essentielle') && l.includes('20000')));

/* ══ LA SECTION QUI A DÉRIVÉ SE RECONNAÎT ═══════════════════════════
   La section a été posée le 3 septembre, ses tarifs décidés le 4 : sans un juge
   qui le voie, il faudrait rouvrir cinq fiches à la main. */
dit('aux tarifs de la Maison, rien à remettre', 0, kidsADepasser(SERVICES_KIDS));
dit('un prix qui a bougé se voit', 1,
  kidsADepasser([{ ...VEKPE, priceXof: 9_000 }, ...SERVICES_KIDS.slice(1)]));
/* Le renfort et le shampoing portent un barré, la Première Couronne non : le
   juge doit voir disparaître CE QUI EXISTE, pas ce qui n'a jamais été là. */
dit('un prix barré effacé aussi', 1,
  kidsADepasser([{ ...KLOKLO, prixBarreXof: undefined }]));
/* ET RIEN D'AUTRE QUE LA SECTION. Le juge sert à décider d'un geste qui
   RÉÉCRIT : s'il comptait une prestation d'un autre atelier, ce geste
   l'écraserait. */
dit('le reste du catalogue ne le regarde pas', 0,
  kidsADepasser([{ ...SERVICES_KIDS[0], id: 'sv-vekpe-classique', priceXof: 1 }]));

/* ══ LA MARCHE DES 250 LOCKS — 7 septembre 2026 ═══════════════════════
   « Le rituel complet pour les Kids de 25 000 F fonctionne quand le kids a
   moins de 250 locks. Dans les cas où le kids a plus de locks, le rituel
   complet passe à 30 000 F » (Yéman).

   CE N'EST NI UN CALIBRE NI UN TARIF AU LOCK, c'est un prix ferme qui connaît
   une marche : deux nombres qui s'annoncent au téléphone. */
const tete = (lockCount?: number) => ({
  band: undefined, clientCoef: 1, lockCount,
} as unknown as Parameters<typeof prixDeBase>[1]);

dit('le pack porte sa marche', [{ auDela: 250, prixXof: 30_000 }], FORFAIT_KIDS.paliersDeLocks);
dit('cent locks restent au tarif annoncé', 25_000, prixDeBase(FORFAIT_KIDS, tete(100)));
/* AU-DELÀ SE COMPTE STRICTEMENT : à exactement 250, on reste au prix bas. Au
   bord, la Maison tranche en faveur de la cliente — c'est un choix, et sans ce
   juge il se serait inversé au premier refactor. */
dit('deux cent quarante-neuf aussi', 25_000, prixDeBase(FORFAIT_KIDS, tete(249)));
dit('deux cent cinquante pile aussi', 25_000, prixDeBase(FORFAIT_KIDS, tete(250)));
dit('deux cent cinquante et un passent la marche', 30_000, prixDeBase(FORFAIT_KIDS, tete(251)));
dit('quatre cents également', 30_000, prixDeBase(FORFAIT_KIDS, tete(400)));
/* SANS COMPTAGE, LE PRIX ANNONCÉ. On ne facture pas plus cher sur une
   supposition : une fiche sans comptage se règle au tarif dit, et c'est
   l'écran de la tête qui signale ce qui manque. */
dit('sans comptage, le tarif annoncé', 25_000, prixDeBase(FORFAIT_KIDS, tete(undefined)));
dit('un comptage à zéro ne compte pas', 25_000, prixDeBase(FORFAIT_KIDS, tete(0)));

/* LA MARCHE LA PLUS HAUTE FRANCHIE GAGNE, quel que soit l'ordre de saisie : se
   fier à l'ordre du tableau ferait dépendre le prix d'une tête de la façon dont
   quelqu'un a rempli un écran. */
const deuxMarches = {
  paliersDeLocks: [{ auDela: 400, prixXof: 35_000 }, { auDela: 250, prixXof: 30_000 }],
};
dit('la marche la plus haute gagne', 35_000, prixSelonLesLocks(deuxMarches, 500));
dit('… et la première quand la seconde n’est pas franchie', 30_000,
  prixSelonLesLocks(deuxMarches, 300));
dit('… rien en dessous de tout', undefined, prixSelonLesLocks(deuxMarches, 100));
/* Une prestation sans marche ne change jamais de prix : la règle des Kids ne
   doit pas déborder sur le catalogue des grandes. */
dit('une prestation sans marche ne bouge pas', undefined, prixSelonLesLocks({}, 900));
dit('… et les autres gestes Kids non plus', 5_000, prixDeBase(KLOKLO, tete(400)));

/* CE QUE LA PIÈCE ANNONCE EST CE QUE LA CAISSE SONNE. Le gain se lisait sur le
   prix de la FICHE : sous une ligne facturée 30 000, le papier aurait écrit
   « 25 000 F pour les Kids, 15 000 F offerts » — un geste qui n'a pas été
   fait, noir sur blanc devant le parent. */
const g25 = gainDuForfait(FORFAIT_KIDS, SERVICES_KIDS);
dit('au tarif bas, quinze mille offerts', [40_000, 25_000, 15_000],
  [g25.carteXof, g25.prixXof, g25.gainXof]);
const g30 = gainDuForfait(FORFAIT_KIDS, SERVICES_KIDS, 30_000);
dit('au-delà de la marche, dix mille offerts', [40_000, 30_000, 10_000],
  [g30.carteXof, g30.prixXof, g30.gainXof]);
dit('… et la pièce l’écrit', true,
  detailDuForfait(FORFAIT_KIDS, SERVICES_KIDS, (x) => `${x} F`, 30_000)
    .some((l) => l.includes('30000 F pour les Kids') && l.includes('10000 F offerts')));

/* UNE SECTION DÉJÀ POSÉE DOIT POUVOIR RECEVOIR LA MARCHE : sans cela, les
   catalogues d'avant garderaient 25 000 F pour toutes les têtes, et le bouton
   de mise à jour dirait qu'il n'y a rien à faire. */
dit('un pack sans la marche se signale', 1,
  kidsADepasser([{ ...FORFAIT_KIDS, paliersDeLocks: undefined }]));
dit('… et avec elle, plus rien', 0, kidsADepasser([FORFAIT_KIDS]));

/* ── DE BOUT EN BOUT, COMME LE FAIT L'ECRAN ────────────────────────
   `prixDeBase` est l'entonnoir, mais le rendez-vous et la caisse appellent
   `personalPriceXof` : entre les deux il y a le forfait, le calibre, le tarif
   au lock et le Juste Prix. Verifier la marche sans les traverser laisserait
   passer le jour ou l'un d'eux la mange. */
const catKids = TOUT;
const parLaTete = (locks: number) =>
  personalPriceXof(FORFAIT_KIDS, pricingOf({ lockCount: locks }, MODEL_BANDS_SEED), catKids);
dit('au rendez-vous, cent locks paient le tarif annonce', 25_000, parLaTete(100));
dit('au rendez-vous, quatre cents locks paient la marche', 30_000, parLaTete(400));

/* ══ LE FORFAIT TOMBE PILE, AUX DEUX PALIERS — 7 septembre 2026 ═══════
   « Quand ce tarif apparaît, le contenu devrait changer à SÍNSIN Kids · La
   Reprise Essentielle 20 000 F pour que le calcul soit juste » (Yéman).

   C'EST TOUT LE PRINCIPE D'UN FORFAIT : sa composition fait son total, et le
   parent la lit ligne à ligne juste devant lui. Une composition lue au tarif
   de base affichait 5 000 + 15 000 + 5 000 sous un total de 30 000 F. */
const sommeDe = (locks?: number) =>
  compositionDuForfait(FORFAIT_KIDS, SERVICES_KIDS, locks).reduce((n, l) => n + l.prixXof, 0);
dit('sous la marche, la composition fait le prix', 25_000, sommeDe(100));
dit('au-delà, elle fait le nouveau prix', 30_000, sommeDe(400));
dit('sans comptage, les prix d’annonce', 25_000, sommeDe(undefined));
/* LA MARCHE EST SUR LA REPRISE, pas sur le shampoing : c'est le resserrage
   lock par lock qui s'allonge quand la couronne en compte trois cents. */
dit('la reprise porte la marche', 20_000,
  compositionDuForfait(FORFAIT_KIDS, SERVICES_KIDS, 400)
    .find((l) => l.serviceId === 'sv-kids-sinsin')?.prixXof);
dit('le shampoing ne bouge pas', 5_000,
  compositionDuForfait(FORFAIT_KIDS, SERVICES_KIDS, 400)
    .find((l) => l.serviceId === 'sv-kids-kloklo')?.prixXof);

/* SANS LA MARCHE SUR LA REPRISE, LE PACK SE CONTOURNE : les trois gestes pris
   séparément feraient 25 000 F là où le pack en demande 30 000, et personne ne
   le prendrait plus jamais sur une grande petite tête. */
const separement = (locks: number) => [KLOKLO, SINSIN, GBIGBI]
  .reduce((n, sv) => n + personalPriceXof(sv, pricingOf({ lockCount: locks }, MODEL_BANDS_SEED), catKids), 0);
dit('le pack ne se contourne pas, sous la marche', [25_000, 25_000],
  [separement(100), parLaTete(100)]);
dit('… ni au-delà', [30_000, 30_000], [separement(400), parLaTete(400)]);

/* CE QUE LA MAISON DONNE SUIT AUSSI : la reprise vaut 20 000 au tarif, donc la
   carte monte à 45 000 et le geste reste de 15 000. */
const g400 = gainDuForfait(FORFAIT_KIDS, SERVICES_KIDS, 30_000, 400);
dit('au-delà, la carte monte et le geste tient', [45_000, 30_000, 15_000],
  [g400.carteXof, g400.prixXof, g400.gainXof]);
dit('… et la pièce l’écrit ainsi', true,
  detailDuForfait(FORFAIT_KIDS, SERVICES_KIDS, (x) => `${x} F`, 30_000, 400)
    .some((l) => l.includes('45000 F au tarif de la Maison')
      && l.includes('30000 F pour les Kids') && l.includes('15000 F offerts')));

/* ══ CE QUE LA REVUE DU 7 SEPTEMBRE A APPRIS ══════════════════════════ */

/* AUCUN FORFAIT NE SE CONTIENT. La règle était écrite en prose trois fois et
   vérifiée nulle part : un pack qui se citerait dans sa propre composition se
   compterait à son propre prix, et la pièce annoncerait 155 000 F offerts. */
dit('aucun forfait ne se contient', true,
  TOUT.every((x) => !(x.includes ?? []).some((i) => i.serviceId === x.id)));

/* UNE SEULE MÉCANIQUE DE SUITES. Un forfait dont la cadence est écrite dans
   `afterWeeks` ne porte pas AUSSI `sessions > 1` : les deux tournaient sur le
   même rendez-vous, et « Poser la séance suivante » créait une seconde séance
   du pack entier puis trois suites de plus — sept visites pour quatre. */
dit('la cadence et la série ne se cumulent pas', true,
  TOUT.every((x) => !(x.includes ?? []).some((i) => (i.afterWeeks ?? 0) > 0) || (x.sessions ?? 1) <= 1));
dit('… le pack de naissance a donc une venue d’ouverture', 1, FORFAIT_KIDS_NAISSANCE.sessions);
/* … ET SA CADENCE DIT LES TROIS AUTRES. */
dit('… et trois suites dans sa cadence', [2, 4, 8],
  (FORFAIT_KIDS_NAISSANCE.includes ?? []).map((i) => i.afterWeeks).filter((w): w is number => !!w));

/* LA POSE NE PORTE PAS DE ZÉRO : l'éditeur du Catalogue l'efface, et une fiche
   que l'écran ne peut pas reproduire fait un bouton qui ne s'éteint jamais. */
dit('la ligne de la pose est sans semaine', undefined,
  (FORFAIT_KIDS_NAISSANCE.includes ?? [])[0]?.afterWeeks);
/* … et l'empreinte ne distingue pas 0 d'absent. */
dit('zéro et absent font la même empreinte', true,
  empreinteKids({ ...FORFAIT_KIDS_NAISSANCE, includes: [{ serviceId: 'sv-kids-vekpe', afterWeeks: 0 },
    ...(FORFAIT_KIDS_NAISSANCE.includes ?? []).slice(1)] }) === empreinteKids(FORFAIT_KIDS_NAISSANCE));

/* LA MIGRATION D'UNE FICHE POSÉE HIER. Le juge et le geste listaient chacun
   leurs champs : `sessions` et `description` n'étaient ni comparés ni
   recopiés. On pose ici la couronne telle qu'elle a été PUBLIÉE la veille —
   150 000 F, trois suites, quatre venues — et l'on demande à la Maison de la
   remettre au tarif. Après le geste, plus rien ne doit dépasser. */
const couronneDHier: Service = {
  ...VEKPE, priceXof: 150_000, sessions: 4,
  description: 'Inclus : deux retouches post création à 3 semaines et à 6 semaines.',
  includes: [{ serviceId: 'sv-kids-retouche' }, { serviceId: 'sv-kids-retouche' }, { serviceId: 'sv-kids-sinsin' }],
};
const retoucheDHier: Service = { ...RETOUCHE, description: 'Comprise dans La Première Couronne, aux semaines 2 et 4.' };
servicesStore.set(() => [couronneDHier, retoucheDHier, ...TOUT.filter((x) => x.id !== VEKPE.id && x.id !== RETOUCHE.id)]);
dit('avant le geste, deux fiches dépassent', 2, kidsADepasser(servicesStore.get()));
dit('le geste en touche deux', 2, metAJourLaSectionKids());
const apres = servicesStore.get();
dit('après le geste, plus rien ne dépasse', 0, kidsADepasser(apres));
const couronneApres = apres.find((x) => x.id === VEKPE.id)!;
dit('… la couronne est revenue à une venue', [120_000, 1, undefined],
  [couronneApres.priceXof, couronneApres.sessions, couronneApres.includes]);
dit('… et la retouche dit le pack', true,
  apres.find((x) => x.id === RETOUCHE.id)!.description.includes('PACK de naissance'));
/* CE QUE LA MAISON A AJOUTÉ ELLE-MÊME RESTE : un maître posé sur la fiche
   n'est pas au tarif, il est à la Maison. */
servicesStore.set(() => [{ ...couronneDHier, master: 'Gérard' }]);
metAJourLaSectionKids();
dit('… sans toucher à ce que la Maison avait posé', 'Gérard', servicesStore.get()[0].master);

/* ══ LA PORTE DE SORTIE EST LA DERNIÈRE LIGNE — 7 septembre 2026 ═════
   Elle avait glissé au milieu du fichier : des dizaines d'assertions
   s'exécutaient APRÈS « Tout passe. », et un échec s'y imprimait sans faire
   échouer la commande. La garantie était creuse. Deux gardes désormais : la
   porte est en dernier, et `dit` marque lui-même le code de sortie — un
   ajout posé derrière la porte ne pourra plus passer vert. */
console.log(ko === 0 ? '\nTout passe.' : `\n${ko} ÉCHEC(S).`);
process.exit(ko === 0 ? 0 : 1);
