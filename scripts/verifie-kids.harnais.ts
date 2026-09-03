/* MND KIDS, ÉPROUVÉ — `node scripts/verifie-kids.mjs`.

   « Dans les foyers, j'ai des enfants. J'aimerais une section de service
   shampoing retenue pour les MND Kids, où le total ne revient pas à plus de
   25 000 » puis « rajoute le SÍNSIN Kids et le VÈKPÈ Kids, donc le Kids dans
   les 4 ateliers » (Yéman, 2 et 3 septembre 2026).

   DEUX FAUTES SE PAIERAIENT DEVANT LA CLIENTE : un forfait qui déborde le
   plafond annoncé, et une section qui se refuse à un enfant dont la fiche ne
   porte pas de date de naissance. Le harnais tient les deux. */
import { AGE_MND_KIDS, estKids } from '../src/shared/accounts';
import { SERVICES_KIDS, FORFAIT_KIDS, kidsAbsents, CAT_KIDS } from '../src/shared/kids';
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
dit('cinq gestes dans la section', 5, SERVICES_KIDS.length);
dit('… tous réservés aux Kids', true, SERVICES_KIDS.every((s) => s.reserveEnfants === true));
dit('… tous dans la catégorie MND Kids', true, SERVICES_KIDS.every((s) => s.categoryId === CAT_KIDS));
dit('… et le forfait aussi', true, FORFAIT_KIDS.reserveEnfants === true && FORFAIT_KIDS.categoryId === CAT_KIDS);

/* ── ④ LE PLAFOND DE 25 000 F ──────────────────────────────────────
   « Le total ne revient pas à plus de 25 000 » : c'est le chiffre que Yéman a
   posé, et rien dans le code ne doit pouvoir le dépasser sans qu'on le voie. */
dit('le forfait vaut 25 000 F', 25_000, FORFAIT_KIDS.priceXof);
const prixDe = (id: string) => SERVICES_KIDS.find((s) => s.id === id)?.priceXof ?? 0;
const carte = (FORFAIT_KIDS.includes ?? []).reduce((n, i) => n + prixDe(i.serviceId), 0);
dit('la carte des trois gestes vaut 30 000 F', 30_000, carte);
dit('… le forfait ne dépasse jamais le plafond', true, FORFAIT_KIDS.priceXof <= 25_000);
dit('… et il fait gagner 5 000 F', 5_000, carte - FORFAIT_KIDS.priceXof);

/* LE FORFAIT NE PORTE QUE L'ENTRETIEN. La création se pose une fois, la reprise
   revient toutes les six semaines : les mettre au même paquet ferait payer
   d'avance ce qui ne se consomme pas ensemble. */
const dedans = (FORFAIT_KIDS.includes ?? []).map((i) => i.serviceId).sort();
dit('le forfait porte les trois gestes d’entretien',
  ['sv-kids-gbigbi', 'sv-kids-kloklo', 'sv-kids-yekpe'], dedans);
dit('… ni la création ni la reprise', false,
  dedans.includes('sv-kids-vekpe') || dedans.includes('sv-kids-sinsin'));

/* ── ⑤ ON NE RÉÉCRIT JAMAIS CE QUI EXISTE ──────────────────────────
   Le souverain a pu renommer une prestation, changer son prix, la ranger
   ailleurs : repasser dessus effacerait sa décision, et c'est le genre de perte
   qu'on ne remarque qu'au moment de facturer. */
dit('catalogue vide : les six manquent', 6, kidsAbsents([]));
dit('section complète : rien ne manque', 0,
  kidsAbsents([...SERVICES_KIDS, FORFAIT_KIDS]));
dit('un seul geste posé : cinq manquent', 5, kidsAbsents([SERVICES_KIDS[0]]));
/* UNE PRESTATION RENOMMÉE PAR LA MAISON compte comme posée : c'est son
   identifiant qui fait foi, pas son nom. */
dit('renommée, elle compte toujours comme posée', 5,
  kidsAbsents([{ ...SERVICES_KIDS[0], name: 'Le petit shampoing de la maison' }]));

console.log(ko === 0 ? '\nTout passe.' : `\n${ko} vérification(s) en échec.`);
if (ko > 0) process.exit(1);
