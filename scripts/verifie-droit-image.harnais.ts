/* LE DROIT À L'IMAGE, ÉPROUVÉ — `node scripts/verifie-droit-image.mjs`.

   C'est le seul fichier de la Maison qui puisse se retrouver devant un
   tribunal. Une règle fausse ici ne se voit pas à l'écran : elle se découvre le
   jour où quelqu'un conteste une photo publiée, et il est trop tard. */
import {
  USAGES, VERSION_DU_TEXTE, MOIS_DE_VALIDITE, MOIS_AVANT_LE_CHAMP, MAJORITE, dureeEnClair,
  ageAu, estMineure, pourquoiInvalide, estValide, accordePour, expireLe, estExpire,
  texteDuContrat, exemplaireDe, ditLAccord, type AccordImage,
} from '../src/shared/droit-image';

let ko = 0;
const dit = (nom: string, attendu: unknown, obtenu: unknown) => {
  const ok = JSON.stringify(attendu) === JSON.stringify(obtenu);
  if (!ok) ko++;
  console.log(`${ok ? 'OK   ' : 'ÉCHEC'} ${nom} → ${JSON.stringify(obtenu)}`);
  if (!ok) console.log(`       attendu ${JSON.stringify(attendu)}`);
};

const TRAIT = 'data:image/png;base64,' + 'x'.repeat(120);
const bon = (p: Partial<AccordImage> = {}): AccordImage => ({
  at: '2026-09-06', usages: ['vitrine'], signePar: 'Adjaratou L.',
  signature: TRAIT, version: VERSION_DU_TEXTE, ...p,
});

/* ── ① CE QUI N'EST PAS UN ACCORD ──────────────────────────────────
   Quatre morceaux, et il en manque toujours un quand on se dépêche. C'est
   pour ça qu'ils se jugent ici, et pas à l'écran. */
dit('rien du tout', 'Aucun document signé.', pourquoiInvalide(undefined));
dit('aucun usage coché', 'Aucun usage coché : elle n’a accordé rien du tout.',
  pourquoiInvalide(bon({ usages: [] })));
dit('sans signature', 'Sans signature, ce n’est pas un accord.',
  pourquoiInvalide(bon({ signature: '' })));
/* UN TRAIT DE DEUX PIXELS N'EST PAS UNE SIGNATURE : un doigt posé par erreur
   sur l'écran produit une image, et elle vaudrait accord. */
dit('un trait trop court non plus', 'Sans signature, ce n’est pas un accord.',
  pourquoiInvalide(bon({ signature: 'data:image/png;base64,AA' })));
dit('sans nom', 'Le document ne nomme personne.', pourquoiInvalide(bon({ signePar: '  ' })));
dit('sans date', 'Un accord sans date ne se défend pas.', pourquoiInvalide(bon({ at: '' })));
dit('complet, rien à redire', undefined, pourquoiInvalide(bon()));

/* ── ② LA MINEURE ──────────────────────────────────────────────────
   Elle ne signe pas pour elle-même. Ce n'est pas une option de confort : un
   accord d'enfant sans parent nommé ne vaut rien, et la Maison publierait
   en croyant avoir le droit. */
dit('mineure sans parent nommé',
  'Une tête mineure ne signe pas pour elle-même : le parent doit être nommé.',
  pourquoiInvalide(bon(), { mineure: true }));
dit('mineure avec son parent', undefined,
  pourquoiInvalide(bon({ pourEnfant: 'Ezra' }), { mineure: true }));
dit('douze ans, c’est mineur', true, estMineure('2014-03-02', '2026-09-06'));
dit('dix-huit ans tout juste, non', false, estMineure('2008-09-06', '2026-09-06'));
/* LA VEILLE DE SES DIX-HUIT ANS, ELLE L'EST ENCORE. Une majorité arrondie au
   mois publierait la photo d'une enfant. */
dit('la veille, elle l’est encore', true, estMineure('2008-09-07', '2026-09-06'));
dit('l’âge se compte juste', 17, ageAu('2008-09-07', '2026-09-06'));
dit('sans date de naissance, on ne suppose rien', undefined, ageAu(undefined, '2026-09-06'));
dit('… et elle n’est pas déclarée mineure', false, estMineure(undefined, '2026-09-06'));
dit('la majorité est dite', 18, MAJORITE);

/* ── ③ CE QU'ELLE A ACCORDÉ, ET RIEN D'AUTRE ───────────────────────
   Le juge unique. Tout ce qui publiera ou simulera doit y passer : un écran
   qui lirait `usages` directement oublierait le retrait. */
const vitrineSeule = bon({ usages: ['vitrine'] });
dit('la vitrine, oui', true, accordePour(vitrineSeule, 'vitrine'));
dit('les réseaux, non', false, accordePour(vitrineSeule, 'reseaux'));
dit('la simulation, non', false, accordePour(vitrineSeule, 'simulation'));
dit('rien de signé, rien d’accordé', false, accordePour(undefined, 'vitrine'));

/* ── ④ LE RETRAIT ──────────────────────────────────────────────────
   Un accord retiré n'est pas un accord effacé : le document reste, parce que
   savoir qu'il a existé compte autant que savoir qu'il ne vaut plus. */
const retire = bon({ retireLe: '2026-10-01' });
dit('retiré, plus rien n’est accordé', false, accordePour(retire, 'vitrine'));
dit('… et il n’est plus valide', false, estValide(retire));
dit('… mais le document reste lisible', true, ditLAccord(retire, '2026-10-02').includes('reste au dossier'));

/* ── ⑤ LE TERME ────────────────────────────────────────────────────
   Un consentement sans terme se retourne contre celui qui s'en sert.

   IL VOYAGE AVEC L'ACCORD, jamais dans une constante globale : la Maison est
   passée de deux ans à cinq le 6 septembre, et celles qui avaient signé pour
   deux ans auraient été tenues trois ans de plus sans avoir rien dit. Une
   règle qui rallonge un consentement déjà donné est une règle qui le fabrique. */
dit('cinq ans pour ce qui se signe aujourd’hui', 60, MOIS_DE_VALIDITE);
dit('cinq ans, dit en clair', 'cinq ans', dureeEnClair(60));
dit('… et le contrat ne dit pas « 60 mois »', true,
  texteDuContrat({ maison: 'M', tete: 'T', signataire: 'T', usages: ['vitrine'], jourIso: '2026-09-06' })
    .articles.find((x) => x.n === '4')!.lignes[0].includes('cinq ans'));
dit('un accord signé pour cinq ans', '2031-09-06', expireLe(bon({ mois: 60 })));
dit('la veille, il vaut encore', false, estExpire(bon({ mois: 60 }), '2031-09-05'));
dit('le lendemain, non', true, estExpire(bon({ mois: 60 }), '2031-09-07'));
dit('… et la fiche le dit', true, ditLAccord(bon({ mois: 60 }), '2031-09-07').includes('À refaire signer'));
/* CELLES QUI ONT SIGNÉ POUR DEUX ANS GARDENT DEUX ANS. C'est l'assertion qui
   compte : sans elle, allonger la durée de la Maison rallongerait en silence
   des accords donnés sous un autre texte. */
dit('un accord d’avant le champ garde deux ans', '2028-09-06', expireLe(bon()));
dit('… et il expire quand il doit', true, estExpire(bon(), '2028-09-07'));
dit('deux ans, c’est ce que disait le texte d’avant', 24, MOIS_AVANT_LE_CHAMP);
/* LE TEXTE A CHANGÉ, DONC SA VERSION : sans ça, on ne saurait pas si elle a
   signé pour deux ans ou pour cinq. */
dit('la version a suivi le changement de durée', true, VERSION_DU_TEXTE.startsWith('v2'));

/* ── ⑥ LE TEXTE SIGNÉ ──────────────────────────────────────────────
   Il porte SA VERSION : une formulation change avec le temps, et sans le
   numéro on ne saurait plus, dans deux ans, à quoi elle avait dit oui. */
const t = texteDuContrat({
  maison: 'L’atelier MND', tete: 'Adjaratou L.', signataire: 'Adjaratou L.',
  usages: ['vitrine', 'reseaux'], jourIso: '2026-09-06',
});
dit('la version est au pied', true, t.pied.includes(VERSION_DU_TEXTE));
dit('les deux parties sont nommées', 2, t.entete.length);
/* CE QUI N'EST PAS COCHÉ EST ÉCRIT COMME INTERDIT, pas seulement omis : un
   silence se relit comme une permission par celui que ça arrange. */
const corps = t.articles.map((a) => a.lignes.join(' ')).join(' ');
dit('les usages refusés sont dits interdits', true, corps.includes('n’ont pas été accordés'));
dit('la gratuité est écrite', true, corps.includes('gratuitement'));
dit('le retrait est écrit', true, corps.includes('retirer son autorisation à tout moment'));
dit('et ce qu’on ne peut pas retirer aussi', true, corps.includes('copié, repartagé'));
dit('refuser ne change rien à son accueil', true, corps.includes('ne change rien à la façon dont la personne est reçue'));

/* SANS SIMULATION COCHÉE, PAS D'ARTICLE SUR LA SIMULATION : un contrat qui
   parle d'un usage non accordé brouille ce qu'il accorde. */
dit('pas de simulation, pas son article', false,
  t.articles.some((a) => a.titre.includes('simulation')));
const tSim = texteDuContrat({
  maison: 'L’atelier MND', tete: 'A.', signataire: 'A.',
  usages: ['simulation'], jourIso: '2026-09-06',
});
dit('avec elle, l’article est là', true, tSim.articles.some((a) => a.titre.includes('simulation')));
dit('… et il dit que ça sort du pays', true,
  tSim.articles.map((a) => a.lignes.join(' ')).join(' ').includes('hors du Bénin'));
dit('… et que ce n’est pas une photo d’elle', true,
  tSim.articles.map((a) => a.lignes.join(' ')).join(' ').includes('Ce n’est pas une photographie de la personne'));

const tEnfant = texteDuContrat({
  maison: 'L’atelier MND', tete: 'Ezra', signataire: 'Adjaratou L.', pourEnfant: 'Ezra',
  usages: ['vitrine'], jourIso: '2026-09-06',
});
dit('l’enfant a son article', true, tEnfant.articles.some((a) => a.titre === 'Personne mineure'));
dit('… et l’enfant peut s’y opposer', true,
  tEnfant.articles.map((a) => a.lignes.join(' ')).join(' ').includes('renonce à photographier'));

/* ── ⑦ LES NUMÉROS D'ARTICLES SE SUIVENT ───────────────────────────
   Ils sont calculés, puisque deux articles paraissent ou non. Un contrat qui
   saute de 7 à 9 se fait renvoyer par le premier juriste qui le lit. */
const suite = (x: ReturnType<typeof texteDuContrat>) =>
  x.articles.map((a) => Number(a.n)).every((n, i) => n === i + 1);
dit('numérotation continue, cas simple', true, suite(t));
dit('… avec la simulation', true, suite(tSim));
dit('… avec l’enfant', true, suite(tEnfant));
dit('… avec les deux', true, suite(texteDuContrat({
  maison: 'M', tete: 'E', signataire: 'P', pourEnfant: 'E',
  usages: ['vitrine', 'simulation'], jourIso: '2026-09-06',
})));

/* ── ⑧ L'EXEMPLAIRE SE REJOUE À L'IDENTIQUE — 6 septembre 2026 ────
   « Je veux aussi la version PDF à imprimer et remettre au client » (Yéman).
   Réimprimer doit rendre LE TEXTE QU'ELLE A SIGNÉ : un exemplaire produit en
   2029 qui dirait cinq ans sous une signature donnée pour deux serait un faux.

   C'est pour ça que le texte ne dépend que de ce que l'accord porte. */
const maison = { maison: 'L’atelier MND', ville: 'Cotonou', tete: 'Adjaratou L.' };
const vieux = bon({ mois: 24, version: 'v1 · 6 septembre 2026', usages: ['vitrine'] });
const neuf = bon({ mois: 60, usages: ['vitrine'] });

const art4 = (x: ReturnType<typeof exemplaireDe>) => x.articles.find((a) => a.n === '4')!;
dit('un accord de deux ans se rejoue en deux ans', true,
  art4(exemplaireDe(vieux, maison)).lignes[0].includes('deux ans'));
dit('un accord de cinq ans, en cinq ans', true,
  art4(exemplaireDe(neuf, maison)).lignes[0].includes('cinq ans'));
/* LE RAPPEL DU TERME LONG N'EXISTAIT PAS DANS LE TEXTE DE DEUX ANS : sans
   cette condition, un accord v1 se rejouerait avec une phrase qu'il n'a jamais
   portée, et l'exemplaire ne serait plus celui qu'elle a signé. */
dit('le rappel du terme long n’est pas dans le texte court', 3, art4(exemplaireDe(vieux, maison)).lignes.length);
dit('… mais il est dans le long', 4, art4(exemplaireDe(neuf, maison)).lignes.length);
/* LE PIED PORTE LA VERSION DE L'ACCORD, pas celle du code : c'est elle qui dit
   à quoi elle a dit oui. */
dit('le pied garde la version signée', true, exemplaireDe(vieux, maison).pied.includes('v1'));
dit('… et la version du jour pour le neuf', true, exemplaireDe(neuf, maison).pied.includes(VERSION_DU_TEXTE));
/* UN ACCORD RETIRÉ SE RÉIMPRIME QUAND MÊME : c'est justement là qu'on a besoin
   de relire ce qui avait été signé. */
dit('un accord retiré garde son exemplaire', true,
  exemplaireDe(bon({ retireLe: '2026-10-01' }), maison).articles.length > 0);
dit('l’exemplaire nomme le signataire', 'Adjaratou L.', exemplaireDe(neuf, maison).entete[1].split(',')[0].replace('et ', ''));

dit('quatre usages proposés', 4, USAGES.length);

console.log(ko === 0 ? '\nTout passe.' : `\n${ko} ÉCHEC(S).`);
process.exit(ko === 0 ? 0 : 1);
