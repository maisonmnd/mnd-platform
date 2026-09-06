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

console.log(ko === 0 ? '\nTout passe.' : `\n${ko} ÉCHEC(S).`);
process.exit(ko === 0 ? 0 : 1);
