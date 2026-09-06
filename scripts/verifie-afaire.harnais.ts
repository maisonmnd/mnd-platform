/* À FAIRE, ÉPROUVÉ — `node scripts/verifie-afaire.mjs`.

   Cette page dit à la Maison OÙ METTRE SON TEMPS. Un compte faux n'envoie pas
   au mauvais écran, il envoie au mauvais travail — et l'on découvre l'erreur
   après avoir passé une semaine dessus. */
import {
  leTravail, manquesDeLaTete, tetesDuGeste, motPourDemander, SE_DEMANDE,
  type TeteLue, type RituelLu,
} from '../src/shared/afaire';

let ko = 0;
const dit = (nom: string, attendu: unknown, obtenu: unknown) => {
  const ok = JSON.stringify(attendu) === JSON.stringify(obtenu);
  if (!ok) ko++;
  console.log(`${ok ? 'OK   ' : 'ÉCHEC'} ${nom} → ${JSON.stringify(obtenu)}`);
  if (!ok) console.log(`       attendu ${JSON.stringify(attendu)}`);
};

const B = 'br-1';
const tete = (id: string, p: Partial<TeteLue> = {}): TeteLue => ({ id, branchId: B, ...p });
const rdv = (id: string, clientId: string, p: Partial<RituelLu> = {}): RituelLu =>
  ({ id, branchId: B, clientId, status: 'honoré', ...p });

const combien = (t: ReturnType<typeof leTravail>, cle: string) =>
  t.gestes.find((g) => g.cle === cle)?.combien;
const jauge = (t: ReturnType<typeof leTravail>, cle: string) =>
  t.jauges.find((j) => j.cle === cle)?.pct;

/* ── ① QUI ENTRE DANS LE COMPTE ───────────────────────────────────
   UNE PROSPECTE N'A PAS DE COMPTAGE MANQUANT : elle n'est jamais venue. La
   prendre dans le dénominateur ferait paraître la Maison en retard sur un
   travail qui n'existe pas. */
const sansVenue = leTravail({
  branchId: B,
  tetes: [tete('cl-1'), tete('cl-2')],
  rituels: [],
  bilans: [], stock: [], duXof: () => 0,
});
dit('une tête jamais venue ne compte pas', 0, combien(sansVenue, 'locks'));
dit('… et la Maison n’est pas en retard', 100, jauge(sansVenue, 'facturer'));

/* UN RITUEL NON HONORÉ NE SERT PAS DE VENUE : il n'a pas eu lieu. */
dit('un rituel confirmé ne sert pas de venue', 0, combien(leTravail({
  branchId: B,
  tetes: [tete('cl-1')],
  rituels: [rdv('a1', 'cl-1', { status: 'confirmé' })],
  bilans: [], stock: [], duXof: () => 0,
}), 'locks'));

/* UNE TÊTE ARCHIVÉE SORT DU TRAVAIL, et celle d'une autre maison aussi. */
dit('l’archivée sort', 0, combien(leTravail({
  branchId: B,
  tetes: [tete('cl-1', { archived: true })],
  rituels: [rdv('a1', 'cl-1')],
  bilans: [], stock: [], duXof: () => 0,
}), 'locks'));
dit('la maison voisine sort', 0, combien(leTravail({
  branchId: B,
  tetes: [{ id: 'cl-9', branchId: 'br-2' }],
  rituels: [{ id: 'a9', branchId: 'br-2', clientId: 'cl-9', status: 'honoré' }],
  bilans: [], stock: [], duXof: () => 0,
}), 'locks'));

/* ── ② LES SEUILS ─────────────────────────────────────────────────
   TROIS MESURES OUVRENT LA COURBE DE POUSSE, deux bilans celle des jauges :
   ce sont les seuils des courbes elles-mêmes. Compter autrement enverrait
   mesurer une tête qui a déjà sa courbe. */
const t2 = leTravail({
  branchId: B,
  tetes: [
    tete('cl-1', { comptages: [{ longueurCm: 12 }, { longueurCm: 13 }, { longueurCm: 14 }] }),
    tete('cl-2', { comptages: [{ longueurCm: 12 }, { longueurCm: 13 }] }),
    tete('cl-3', { comptages: [{}, {}, {}] }),
  ],
  rituels: [rdv('a1', 'cl-1'), rdv('a2', 'cl-2'), rdv('a3', 'cl-3')],
  bilans: [{ clientId: 'cl-1' }, { clientId: 'cl-1' }, { clientId: 'cl-2' }],
  stock: [], duXof: () => 0,
});
dit('trois mèches suffisent, deux non', 2, combien(t2, 'meche'));
dit('un comptage sans cm ne compte pas', true, (t2.gestes.find((g) => g.cle === 'meche')?.combien ?? 0) >= 2);
dit('deux bilans suffisent, un non', 2, combien(t2, 'bilan'));
dit('… la jauge suit', 33, jauge(t2, 'fideliser'));

/* ── ③ CE QUI SE COMPTE EN RITUELS, PAS EN TÊTES ──────────────────
   Les mains et les impayés vivent sur le rendez-vous : les compter par tête
   effacerait celle qui doit trois rituels. */
const t3 = leTravail({
  branchId: B,
  tetes: [tete('cl-1')],
  rituels: [
    rdv('a1', 'cl-1', { mains: [['m1']] }),
    rdv('a2', 'cl-1'),
    rdv('a3', 'cl-1', { mains: [[]] }),
  ],
  bilans: [], stock: [],
  duXof: (a) => (a.id === 'a2' ? 20000 : 0),
});
dit('deux rituels sans mains', 2, combien(t3, 'mains'));
/* DES MAINS VIDES NE SONT PAS DES MAINS : un tableau vide se compte comme
   absent, sinon on croirait la commission tenue. */
dit('un rituel dû', 1, combien(t3, 'solde'));
dit('… avec sa somme', 20000, t3.gestes.find((g) => g.cle === 'solde')?.xof);
dit('la jauge des mains', 33, jauge(t3, 'rentabilite'));
dit('la jauge d’encaissement', 67, jauge(t3, 'encaisser'));

/* ── ④ LE POSITIONNEMENT DEMANDE LES DEUX ─────────────────────────
   Ce qu'on peut MONTRER et ce qu'on sait DIRE. L'un sans l'autre ne suffit
   pas : une photo sans persona ne se raconte pas, un persona sans photo ne
   se voit pas. */
const t4 = leTravail({
  branchId: B,
  tetes: [
    tete('cl-1', { photo: 'p', persona: 'x' }),
    tete('cl-2', { photo: 'p' }),
    tete('cl-3', { persona: 'x' }),
  ],
  rituels: [rdv('a1', 'cl-1'), rdv('a2', 'cl-2'), rdv('a3', 'cl-3')],
  bilans: [], stock: [], duXof: () => 0,
});
dit('la photo seule ne suffit pas', 33, jauge(t4, 'positionner'));

/* ── ⑤ LE PRIX D'ACHAT ────────────────────────────────────────────
   Sans lui, la Gamme n'a pas de marge : on vend sans savoir ce qu'on gagne. */
dit('les fiches sans prix d’achat', 2, combien(leTravail({
  branchId: B, tetes: [], rituels: [], bilans: [],
  stock: [{ branchId: B, prixAchatXof: 1200 }, { branchId: B, prixAchatXof: 0 }, { branchId: B }],
  duXof: () => 0,
}), 'achat'));

/* ── ⑥ L'ORDRE ────────────────────────────────────────────────────
   LE NOMBRE DE TÊTES EST LE SEUL CLASSEMENT HONNÊTE : trier par mon avis sur
   l'importance ferait passer mes idées pour celles de la Maison. */
const t6 = leTravail({
  branchId: B,
  tetes: [tete('cl-1'), tete('cl-2'), tete('cl-3')],
  rituels: [rdv('a1', 'cl-1'), rdv('a2', 'cl-2'), rdv('a3', 'cl-3')],
  bilans: [], stock: [], duXof: () => 0,
});
dit('le plus large passe devant', true,
  (t6.gestes[0].combien ?? 0) >= (t6.gestes[t6.gestes.length - 1].combien ?? 0));
dit('neuf gestes, toujours les mêmes', 9, t6.gestes.length);
dit('six jauges', 6, t6.jauges.length);

/* ── ⑦ LES MANQUES D'UNE SEULE TÊTE — 6 septembre 2026 ────────────
   « Dès qu'un rendez-vous arrive et que cette tête est dans cette liste, il
   faut nous demander de remplir cette information. » Une liste de trois cents
   têtes ne se travaille pas ; elle se travaille tête par tête, au moment où
   elle est là. */
const complete = tete('cl-1', {
  email: 'a@b.c', lockCount: 300, longueur: 'mi-long', rythmeSemaines: 8,
  comptages: [{ longueurCm: 1 }, { longueurCm: 2 }, { longueurCm: 3 }],
});
dit('une tête complète n’attend rien', [], manquesDeLaTete({ tete: complete, bilans: 2 }));
dit('une tête nue attend tout', ['meche', 'bilan', 'cadence', 'longueur', 'email', 'locks'],
  manquesDeLaTete({ tete: tete('cl-2'), bilans: 0 }));
dit('un seul manque se dit seul', ['email'],
  manquesDeLaTete({ tete: { ...complete, email: '  ' }, bilans: 2 }));
/* LES MAINS ET LES IMPAYÉS NE SONT PAS DES MANQUES DE TÊTE : ils vivent sur
   un rendez-vous, et se règlent au comptoir, pas au fauteuil. */
dit('les gestes de rituel n’y sont pas', false,
  manquesDeLaTete({ tete: tete('cl-3'), bilans: 0 }).some((c) => c === 'mains' || c === 'solde'));

/* ── ⑧ CE QUI SE DEMANDE À LA CLIENTE ─────────────────────────────
   Envoyer un WhatsApp pour demander sa longueur travaillée serait absurde :
   c'est la Maison qui la constate. */
dit('l’e-mail se demande', true, SE_DEMANDE.email);
dit('le bilan se remet', true, SE_DEMANDE.bilan);
dit('la longueur ne se demande pas', false, SE_DEMANDE.longueur);
dit('la mèche non plus', false, SE_DEMANDE.meche);
dit('le mot dit pourquoi', true, motPourDemander('email', 'Shadé').includes('Ma Couronne'));
dit('… et nomme la tête', true, motPourDemander('bilan', 'Shadé').startsWith('Shadé,'));
dit('… même sans prénom', true, motPourDemander('email', '  ').startsWith('Chère tête couronnée,'));
dit('ce qui ne se demande pas n’a pas de mot', '', motPourDemander('longueur', 'Shadé'));

/* ── ⑨ LA LISTE D'UN GESTE ────────────────────────────────────────
   RANGÉE PAR LA PROCHAINE VENUE : celle qui vient demain se traite
   aujourd'hui. Une liste alphabétique ferait travailler dans le désordre. */
const liste = tetesDuGeste({
  branchId: B, cle: 'email',
  tetes: [tete('cl-1'), tete('cl-2'), tete('cl-3'), tete('cl-4', { email: 'a@b.c' })],
  rituels: [rdv('a1', 'cl-1'), rdv('a2', 'cl-2'), rdv('a3', 'cl-3'), rdv('a4', 'cl-4')],
  bilans: [],
  prochaineDe: (id) => (id === 'cl-2' ? '2026-09-08' : id === 'cl-3' ? '2026-09-07' : undefined),
});
dit('celle qui a son e-mail sort', ['cl-3', 'cl-2', 'cl-1'], liste.map((x) => x.tete.id));
dit('… et la prochaine venue suit', '2026-09-07', liste[0].prochaineIso);

/* ── ⑩ LA DIASPORA SORT DU FAUTEUIL — 6 septembre 2026 ────────────
   « Les têtes à compter, Diaspora : je n'ai pas besoin de garder des fiches et
   des cadences » (Yéman). Compter des locks, constater une longueur, poser une
   mèche, tenir une cadence : rien de tout cela ne se fait à distance. Les
   réclamer d'une tête qui vit ailleurs noie celles du pays. */
const loin = tete('cl-loin', { diaspora: true });
dit('la diaspora ne doit ni compte ni cadence', ['bilan', 'email'],
  manquesDeLaTete({ tete: loin, bilans: 0 }));
/* LE SEGMENT VAUT LE CHAMP : la notion a vécu à deux endroits, et une fiche
   marquée d'un côté est de la diaspora. */
dit('le segment « Diaspora » vaut le champ', ['bilan', 'email'],
  manquesDeLaTete({ tete: tete('cl-seg', { segments: ['VIP', 'diaspora'] }), bilans: 0 }));
/* L'E-MAIL ET LE BILAN RESTENT : Ma Couronne est le seul fil qui tient entre
   deux voyages. Les retirer couperait ce qui relie la diaspora à la Maison. */
dit('son e-mail reste dû', true, manquesDeLaTete({ tete: loin, bilans: 0 }).includes('email'));
dit('son bilan aussi', true, manquesDeLaTete({ tete: loin, bilans: 0 }).includes('bilan'));
/* LA PASSANTE RESTE DANS TOUTES LES LISTES (arbitrage de Yéman) : la Maison a
   une règle qui la promeut à la troisième venue, et la compter en retard est
   peut-être ce qui déclenche le geste. L'exemption ne lit donc QUE la
   diaspora — `TeteLue` ne porte même pas `dePassage`, et c'est voulu. */
dit('une tête d’ici doit toujours tout', ['meche', 'bilan', 'cadence', 'longueur', 'email', 'locks'],
  manquesDeLaTete({ tete: tete('cl-pass'), bilans: 0 }));

const t10 = leTravail({
  branchId: B,
  tetes: [tete('cl-1'), loin, tete('cl-seg2', { segments: ['Diaspora'] })],
  rituels: [rdv('a1', 'cl-1'), rdv('a2', 'cl-loin'), rdv('a3', 'cl-seg2')],
  bilans: [], stock: [], duXof: () => 0,
});
dit('une seule tête à compter', 1, combien(t10, 'locks'));
dit('une seule à cadencer', 1, combien(t10, 'cadence'));
/* MAIS LES TROIS DOIVENT LEUR E-MAIL. */
dit('trois e-mails à demander', 3, combien(t10, 'email'));
/* LE COMPTE ET LA LISTE DISENT LE MÊME NOMBRE. Les prédicats vivaient à deux
   endroits ; le jour où l'un a gagné une exception, la ligne annonçait 66 et
   la liste en ouvrait 12, sans que rien ne dise lequel avait raison. */
dit('la liste dit le même nombre', 1, tetesDuGeste({
  branchId: B, cle: 'locks',
  tetes: [tete('cl-1'), loin, tete('cl-seg2', { segments: ['Diaspora'] })],
  rituels: [rdv('a1', 'cl-1'), rdv('a2', 'cl-loin'), rdv('a3', 'cl-seg2')],
  bilans: [], prochaineDe: () => undefined,
}).length);
/* ET L'ÉCRAN SAIT COMBIEN VIVENT AILLEURS : un nombre qui baisse sans raison
   visible se lit comme une perte de données. */
dit('deux têtes vivent ailleurs', 2, t10.diaspora);
/* LA JAUGE SUIT : ce qu'on ne doit pas n'est pas un retard. Une seule tête sur
   trois manque à l'appel, au lieu des trois d'avant. */
dit('la jauge ne compte plus leur retard', 67, jauge(t10, 'facturer'));

console.log(ko === 0 ? '\nTout passe.' : `\n${ko} ÉCHEC(S).`);
process.exit(ko === 0 ? 0 : 1);
