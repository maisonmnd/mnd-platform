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
  SERVICES_KIDS, FORFAIT_KIDS, kidsAbsents, CAT_KIDS, catalogueDeLaTete,
  compositionDuForfait, gainDuForfait, detailDuForfait, kidsADepasser,
} from '../src/shared/kids';
import { estProposable } from '../src/shared/pricing';
import type { Service } from '../src/shared/catalog';
import type { Client } from '../src/shared/clients';

let ko = 0;
const dit = (nom: string, attendu: unknown, obtenu: unknown) => {
  const ok = JSON.stringify(attendu) === JSON.stringify(obtenu);
  if (!ok) ko++;
  console.log(`${ok ? 'OK   ' : 'ÉCHEC'} ${nom} → ${JSON.stringify(obtenu)}`);
  if (!ok) console.log(`       attendu ${JSON.stringify(attendu)}`);
};

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
const kidsSvc = SERVICES_KIDS[0];
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
dit('quatre gestes dans la section', 4, SERVICES_KIDS.length);
dit('… tous réservés aux Kids', true, SERVICES_KIDS.every((s) => s.reserveEnfants === true));
dit('… tous dans la catégorie MND Kids', true, SERVICES_KIDS.every((s) => s.categoryId === CAT_KIDS));
dit('… et le forfait aussi', true, FORFAIT_KIDS.reserveEnfants === true && FORFAIT_KIDS.categoryId === CAT_KIDS);

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
dit('les trois lignes du rituel', ['sv-kids-kloklo', 'sv-kids-sinsin', 'sv-kids-yekpe'],
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
dit('catalogue vide : les cinq manquent', 5, kidsAbsents([]));
dit('section complète : rien ne manque', 0,
  kidsAbsents([...SERVICES_KIDS, FORFAIT_KIDS]));
dit('un seul geste posé : quatre manquent', 4, kidsAbsents([SERVICES_KIDS[0]]));
/* UNE PRESTATION RENOMMÉE PAR LA MAISON compte comme posée : c'est son
   identifiant qui fait foi, pas son nom. */
dit('renommée, elle compte toujours comme posée', 4,
  kidsAbsents([{ ...SERVICES_KIDS[0], name: 'Le petit shampoing de la maison' }]));

/* -- 6. UNE TETE D'ENFANT NE VOIT QUE MND KIDS --------------------
   « Quand je veux prendre RDV pour un enfant, n'ouvrir que le catalogue MND
   Kids dans la modale de RDV » (Yeman, 3 septembre 2026).

   LA PORTE NE SUFFISAIT PAS : elle retirait la section aux adultes, mais
   l'enfant voyait encore TOUT le catalogue, MND Kids noye au milieu de trente
   rituels dont aucun n'est pour lui. Rien n'empechait de poser a un enfant de
   neuf ans un GBIGBI Profond a 120 000 F. */
const catalogueMele = [ordinaire, ...SERVICES_KIDS];
dit('un enfant ne voit que MND Kids', 4, catalogueDeLaTete(catalogueMele, 'oui').length);
dit('… et rien d’autre', true,
  catalogueDeLaTete(catalogueMele, 'oui').every((x) => x.reserveEnfants === true));
dit('une adulte voit le catalogue entier', 5, catalogueDeLaTete(catalogueMele, 'non').length);
/* UN AGE INCONNU NE RESTREINT RIEN. On ne sait pas, donc on ne retire rien :
   cacher le catalogue entier a une tete dont la fiche n'a pas de date de
   naissance serait la faute la plus couteuse de toutes. */
dit('un age inconnu ne restreint rien', 5, catalogueDeLaTete(catalogueMele, 'inconnu').length);
/* UNE SECTION PAS ENCORE POSEE NE RESTREINT RIEN NON PLUS : sans elle, l'enfant
   se retrouverait devant une liste vide, et l'ecran aurait l'air casse au lieu
   d'etre seulement incomplet. */
dit('sans section posee, l’enfant voit tout', 1, catalogueDeLaTete([ordinaire], 'oui').length);
dit('un catalogue vide reste vide', 0, catalogueDeLaTete([], 'oui').length);

console.log(ko === 0 ? '\nTout passe.' : `\n${ko} vérification(s) en échec.`);
if (ko > 0) process.exit(1);

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
dit('… le mot de la fin dit le geste entier',
  '40000 F au tarif de la Maison, 25000 F pour elle, 15000 F offerts', dit3[3]);
/* LA MÊME FONCTION LIT UNE MAP — c'est ce que porte la modale du rituel
   (`byId`) et ce que porte l'écran des factures (un tableau). Deux chemins,
   une seule vérité. */
const parId = new Map(SERVICES_KIDS.map((x) => [x.id, x] as const));
dit('la carte se lit en tableau comme en registre', dit3, detailDuForfait(FORFAIT_KIDS, parId, fr));
/* UNE PRESTATION SEULE N'A RIEN À DÉTAILLER : le détail ne doit pas s'écrire
   sur toutes les lignes du monde. */
dit('une prestation simple ne détaille rien', 0,
  detailDuForfait(SERVICES_KIDS[0], SERVICES_KIDS, fr).length);

/* ══ LA SECTION QUI A DÉRIVÉ SE RECONNAÎT ═══════════════════════════
   La section a été posée le 3 septembre, ses tarifs décidés le 4 : sans un juge
   qui le voie, il faudrait rouvrir cinq fiches à la main. */
dit('aux tarifs de la Maison, rien à remettre', 0, kidsADepasser(SERVICES_KIDS));
dit('un prix qui a bougé se voit', 1,
  kidsADepasser([{ ...SERVICES_KIDS[0], priceXof: 9_000 }, ...SERVICES_KIDS.slice(1)]));
/* Le shampoing porte un barré, la Première Couronne non : le juge doit voir
   disparaître CE QUI EXISTE, pas ce qui n'a jamais été là. */
dit('un prix barré effacé aussi', 1,
  kidsADepasser([...SERVICES_KIDS.slice(0, 3), { ...SERVICES_KIDS[3], prixBarreXof: undefined }]));
/* ET RIEN D'AUTRE QUE LA SECTION. Le juge sert à décider d'un geste qui
   RÉÉCRIT : s'il comptait une prestation d'un autre atelier, ce geste
   l'écraserait. */
dit('le reste du catalogue ne le regarde pas', 0,
  kidsADepasser([{ ...SERVICES_KIDS[0], id: 'sv-vekpe-classique', priceXof: 1 }]));
