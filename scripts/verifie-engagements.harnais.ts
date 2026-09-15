/* LES ENGAGEMENTS, ÉPROUVÉS — `node scripts/verifie-engagements.mjs`.

   « Un prestataire menuisier veut me réaliser un devis immobilier pour le
   salon. Où stocker mes devis, mes validations et les avances avec signature
   et décharge » (Yéman, 15 septembre 2026).

   Quatre fautes coûteraient cher, et se lisent toutes ici : un reste à payer
   faux, une somme en lettres qui ne dit pas la même chose que les chiffres,
   une avance qui passe pour prouvée sans décharge, et une pièce d'identité
   qu'on garde au-delà de ce qui sert. */
import { nombreEnLettres, nombreEnChiffres } from '../src/shared/lettres';
import {
  jourLongDit, decaleLeJour, numeroEngagementSuivant,
  retenuXof, devisDeBase, depassementXof, devisExpire, devisExpireBientot,
  pourquoiOnNeRetientPas, avertitAvantDeRetenir, retenirLeDevis,
  verseXof, resteXof, tropVerseXof, pourquoiOnNeVersePas, avertitAvantDeVerser,
  dechargeInvalide, versementsSansDecharge, texteDeLaDecharge,
  etatDuDossier, fermeLe, effacementDeLIdentite, identiteAEffacer,
  libelleDeLaDepense, depenseDuVersement, CATEGORIE_PROPOSEE,
  litLesDossiers, bilanDesEngagements,
  type DevisRecu, type Engagement, type Versement,
} from '../src/shared/engagements';

let ko = 0;
const dit = (nom: string, attendu: unknown, obtenu: unknown) => {
  const ok = JSON.stringify(attendu) === JSON.stringify(obtenu);
  if (!ok) ko++;
  console.log(`${ok ? 'OK   ' : 'ÉCHEC'} ${nom} → ${JSON.stringify(obtenu)}`);
  if (!ok) console.log(`       attendu ${JSON.stringify(attendu)}`);
};

const AUJ = '2026-09-15';

/* ══ LA SOMME EN LETTRES ═════════════════════════════════════════════
   Un chiffre se rature, une somme écrite se conteste. Les règles sont
   celles qu'un notaire écrit encore. */
dit('zéro', 'zéro', nombreEnLettres(0));
dit('vingt et un, avec son « et »', 'vingt et un', nombreEnLettres(21));
dit('soixante et onze', 'soixante et onze', nombreEnLettres(71));
dit('quatre-vingt-un, sans « et »', 'quatre-vingt-un', nombreEnLettres(81));
dit('quatre-vingt-onze', 'quatre-vingt-onze', nombreEnLettres(91));
dit('quatre-vingts prend son s en fin de nombre', 'quatre-vingts', nombreEnLettres(80));
dit('… et le perd devant mille', 'quatre-vingt mille', nombreEnLettres(80000));
dit('deux cents prend son s en fin de nombre', 'deux cents', nombreEnLettres(200));
dit('… et le perd devant mille', 'deux cent mille', nombreEnLettres(200000));
dit('mille ne prend jamais d’un', 'mille', nombreEnLettres(1000));
dit('l’avance du menuisier', 'sept cent quarante mille', nombreEnLettres(740000));
dit('le devis retenu', 'un million huit cent cinquante mille', nombreEnLettres(1850000));
dit('deux millions prend son s', 'deux millions', nombreEnLettres(2000000));
dit('les chiffres, séparés d’une espace ordinaire', '1 850 000', nombreEnChiffres(1850000));
dit('un petit nombre reste nu', '740', nombreEnChiffres(740));

/* ══ LES DATES ═══════════════════════════════════════════════════════ */
dit('une décharge porte l’année', '12 septembre 2026', jourLongDit('2026-09-12'));
dit('un an plus tard', '2027-09-12', decaleLeJour('2026-09-12', 365));
dit('trois jours plus tard, à travers le mois', '2026-10-02', decaleLeJour('2026-09-29', 3));

/* ══ LE NUMÉRO ═══════════════════════════════════════════════════════ */
dit('le premier de l’année', 'ENG-2026-001', numeroEngagementSuivant([], 2026));
dit('le suivant du plus grand', 'ENG-2026-005',
  numeroEngagementSuivant([{ numero: 'ENG-2026-004' }, { numero: 'ENG-2026-002' }], 2026));
/* UN NUMÉRO NE SE RÉUTILISE PAS : un trou reste un trou. */
dit('un trou n’est pas comblé', 'ENG-2026-005',
  numeroEngagementSuivant([{ numero: 'ENG-2026-001' }, { numero: 'ENG-2026-004' }], 2026));
dit('une autre année recommence', 'ENG-2027-001',
  numeroEngagementSuivant([{ numero: 'ENG-2026-009' }], 2027));

/* ══ LES DEVIS ═══════════════════════════════════════════════════════ */
const dv = (o: Partial<DevisRecu> & { id: string }): DevisRecu => ({
  branchId: 'b1', engagementId: 'e1', recuLe: '2026-09-10', montantXof: 0, etat: 'recu', ...o,
} as DevisRecu);

const k1 = dv({ id: 'k1', montantXof: 2100000, recuLe: '2026-09-04', valableJusquau: '2026-10-04' });
const b1 = dv({ id: 'b1', montantXof: 1640000, recuLe: '2026-09-10', valableJusquau: '2026-09-14' });
const k2 = dv({ id: 'k2', montantXof: 1850000, recuLe: '2026-09-12', valableJusquau: '2026-10-12' });
const ailleurs = dv({ id: 'x', engagementId: 'e2', montantXof: 99 });
const tous = [k1, b1, k2, ailleurs];

dit('rien de retenu, rien d’engagé', 0, retenuXof(tous.filter((d) => d.engagementId === 'e1')));
dit('un devis passé sa date, non retenu, est expiré', true, devisExpire(b1, AUJ));
dit('un devis encore valable ne l’est pas', false, devisExpire(k2, AUJ));
dit('il expire bientôt à trois jours', true, devisExpireBientot(dv({ id: 'z', valableJusquau: '2026-09-17' }), AUJ));
dit('… mais pas à un mois', false, devisExpireBientot(k2, AUJ));
/* UN DEVIS RETENU N'EXPIRE PLUS : le oui a été donné pendant qu'il valait. */
dit('un devis retenu n’expire plus', false, devisExpire({ ...b1, etat: 'retenu' }, AUJ));

/* ── QUI RETIENT ─────────────────────────────────────────────────── */
dit('le comptoir ne retient pas',
  'Retenir un devis engage la Maison : la direction seule le fait.',
  pourquoiOnNeRetientPas({ devis: k2, tous, estDirection: false }));
dit('la direction retient', null, pourquoiOnNeRetientPas({ devis: k2, tous, estDirection: true }));
dit('un devis sans montant ne s’engage pas', 'Un devis sans montant ne s’engage pas.',
  pourquoiOnNeRetientPas({ devis: dv({ id: 'v' }), tous, estDirection: true }));
dit('un avenant avant le devis de base est refusé',
  'Un avenant s’ajoute à un devis retenu : retenez d’abord le devis de base.',
  pourquoiOnNeRetientPas({ devis: dv({ id: 'a', montantXof: 200000, avenant: true }), tous, estDirection: true }));
/* UN DEVIS EXPIRÉ SE RETIENT QUAND MÊME : un prestataire de bonne foi peut
   l'honorer. L'écran avertit, il n'empêche pas. */
dit('retenir un devis expiré avertit', 'Ce devis a expiré le 14 septembre 2026. Vérifiez qu’il tient toujours.',
  avertitAvantDeRetenir(b1, AUJ));
dit('retenir un devis valable n’avertit de rien', null, avertitAvantDeRetenir(k2, AUJ));

/* ── CE QUE LE OUI FAIT AUX AUTRES ───────────────────────────────── */
const apresK1 = retenirLeDevis(tous, 'k1', 'yeman', '2026-09-05');
dit('retenir le premier écarte les autres reçus', ['retenu', 'ecarte', 'ecarte', 'recu'],
  apresK1.map((d) => d.etat));
/* UN AUTRE DOSSIER N'EST JAMAIS TOUCHÉ. */
dit('un autre dossier reste intact', 'recu', apresK1.find((d) => d.id === 'x')?.etat);

/* On change d'avis : K. refait une version, et elle remplace la première. */
const k2Recu = apresK1.map((d) => (d.id === 'k2' ? { ...d, etat: 'recu' as const } : d));
const apresK2 = retenirLeDevis(k2Recu, 'k2', 'yeman', '2026-09-12');
dit('retenir un nouveau devis REMPLACE l’ancien retenu', ['remplace', 'ecarte', 'retenu', 'recu'],
  apresK2.map((d) => d.etat));
dit('il porte qui l’a retenu et quand', ['yeman', '2026-09-12'],
  [apresK2.find((d) => d.id === 'k2')?.retenuPar, apresK2.find((d) => d.id === 'k2')?.retenuLe]);
/* RIEN NE S'EFFACE : l'écarté est la preuve qu'on a comparé. */
dit('rien ne disparaît', 4, apresK2.length);

const e1Retenu = apresK2.filter((d) => d.engagementId === 'e1');
dit('le retenu est le devis de base', 1850000, retenuXof(e1Retenu));
dit('le devis de base est bien K. deuxième version', 'k2', devisDeBase(e1Retenu)?.id);
dit('aucun dépassement encore', 0, depassementXof(e1Retenu));

/* ── L'AVENANT S'AJOUTE ──────────────────────────────────────────── */
const avenant = dv({ id: 'av', montantXof: 200000, avenant: true, recuLe: '2026-10-01' });
const avecAvenant = retenirLeDevis([...e1Retenu, avenant], 'av', 'yeman', '2026-10-01');
dit('un avenant ne touche à personne', ['remplace', 'ecarte', 'retenu', 'retenu'],
  avecAvenant.map((d) => d.etat));
dit('le retenu devient la somme des deux', 2050000, retenuXof(avecAvenant));
dit('et l’écran sait de combien on a dépassé', 200000, depassementXof(avecAvenant));

/* ══ LES VERSEMENTS ══════════════════════════════════════════════════ */
const vs = (o: Partial<Versement> & { id: string }): Versement => ({
  branchId: 'b1', engagementId: 'e1', libelle: 'versement', montantXof: 0, ...o,
} as Versement);

const signature = { at: '2026-09-12', signePar: 'K. A.', signature: 'data:image/png;base64,' + 'A'.repeat(80), version: 'decharge-v1' };
const avance = vs({
  id: 'v1', libelle: 'Avance à la commande', montantXof: 740000, verseLe: '2026-09-12',
  cashbox: 'Salon', decharge: { mode: 'ecran', signature },
});
const prevu = vs({ id: 'v2', libelle: 'Deuxième versement', montantXof: 555000, prevuLe: '2026-10-10' });
const versements = [avance, prevu];

dit('seul ce qui est versé compte', 740000, verseXof(versements));
dit('le reste à payer', 1110000, resteXof(e1Retenu, versements));
dit('aucun trop-versé', 0, tropVerseXof(e1Retenu, versements));
/* UN TROP-VERSÉ SE DIT : le taire ferait perdre cet argent. */
dit('un trop-versé se compte', 50000,
  tropVerseXof(e1Retenu, [vs({ id: 't', montantXof: 1900000, verseLe: '2026-09-20' })]));
dit('le reste ne devient jamais négatif', 0,
  resteXof(e1Retenu, [vs({ id: 't', montantXof: 1900000, verseLe: '2026-09-20' })]));

/* ── QUI VERSE ───────────────────────────────────────────────────── */
const base = { montantXof: 555000, estDirection: true, retenuXof: 1850000, cashbox: 'Salon' };
dit('la direction verse', null, pourquoiOnNeVersePas(base));
dit('le comptoir ne verse pas', 'Verser engage la Maison : la direction seule le fait.',
  pourquoiOnNeVersePas({ ...base, estDirection: false }));
dit('sans montant, rien', 'Un versement sans montant ne se pose pas.',
  pourquoiOnNeVersePas({ ...base, montantXof: 0 }));
/* ON NE VERSE PAS AVANT D'AVOIR DIT OUI. */
dit('pas de versement sans devis retenu', 'Aucun devis n’est retenu : on ne verse pas avant d’avoir dit oui.',
  pourquoiOnNeVersePas({ ...base, retenuXof: 0 }));
dit('la caisse est nommée', 'Nommez la caisse d’où sort l’argent.',
  pourquoiOnNeVersePas({ ...base, cashbox: '  ' }));
dit('verser au-delà du devis avertit', 'Ce versement dépasse le devis retenu de 100 000 F.',
  avertitAvantDeVerser({ montantXof: 1210000, retenuXof: 1850000, dejaVerseXof: 740000 }));
dit('verser dans le devis n’avertit de rien', null,
  avertitAvantDeVerser({ montantXof: 555000, retenuXof: 1850000, dejaVerseXof: 740000 }));

/* ══ LA DÉCHARGE ═════════════════════════════════════════════════════
   Une avance sans décharge n'est pas une avance. */
dit('une signature à l’écran vaut', undefined, dechargeInvalide(avance.decharge));
dit('pas de décharge, pas de preuve', 'Aucune décharge.', dechargeInvalide(undefined));
/* UN TRAIT DE DEUX PIXELS N'EST PAS UNE SIGNATURE. */
dit('un doigt posé par erreur ne signe pas', 'Sans signature, ce n’est pas un contrat.',
  dechargeInvalide({ mode: 'ecran', signature: { ...signature, signature: 'data:x' } }));
dit('une décharge papier sans photo ne vaut pas', 'La photo de la décharge manque.',
  dechargeInvalide({ mode: 'papier', photo: { chemin: '', nom: '', type: '', taille: 0 }, recueLe: AUJ }));
dit('une décharge papier photographiée vaut', undefined,
  dechargeInvalide({ mode: 'papier', photo: { chemin: 'b1/pieces/e1/x.jpg', nom: 'x.jpg', type: 'image/jpeg', taille: 9 }, recueLe: AUJ }));
dit('le versement parti sans décharge est réclamé', ['v3'],
  versementsSansDecharge([...versements, vs({ id: 'v3', montantXof: 10000, verseLe: AUJ })]).map((v) => v.id));
/* UN VERSEMENT PRÉVU N'A PAS ENCORE BESOIN DE DÉCHARGE. */
dit('un versement prévu ne réclame rien', [], versementsSansDecharge([prevu]).map((v) => v.id));

dit('le texte de la décharge',
  'Je soussigné(e) K. A., menuisier, reconnais avoir reçu de L’atelier MND la somme de '
  + 'sept cent quarante mille francs CFA (740 000 F), à titre d’avance à la commande'
  + ' sur le devis DV-MK-0231 du 12 septembre 2026, pour « agencement du salon ».',
  texteDeLaDecharge({
    prestataire: 'K. A.', metier: 'menuisier', maison: 'L’atelier MND', montantXof: 740000,
    libelle: 'Avance à la commande', objet: 'agencement du salon',
    devisNumero: 'DV-MK-0231', devisDate: '2026-09-12',
  }));
dit('sans métier ni devis, elle reste juste',
  'Je soussigné(e) K. A., reconnais avoir reçu de L’atelier MND la somme de '
  + 'mille francs CFA (1 000 F), à titre de solde.',
  texteDeLaDecharge({ prestataire: 'K. A.', maison: 'L’atelier MND', montantXof: 1000, libelle: 'Solde' }));

/* ══ L'ÉTAT DU DOSSIER — dérivé, jamais écrit ════════════════════════ */
dit('sans devis retenu, on choisit encore', 'devis', etatDuDossier({}, [k1, b1], []));
dit('retenu et pas soldé, en cours', 'en-cours', etatDuDossier({}, e1Retenu, versements));
const toutVerse = [avance, vs({ id: 'v4', montantXof: 1110000, verseLe: '2026-11-02' })];
dit('le dernier franc solde le dossier', 'solde', etatDuDossier({}, e1Retenu, toutVerse));
/* UN AVENANT ROUVRE UN DOSSIER SOLDÉ : c'est pourquoi l'état ne s'écrit pas. */
dit('un avenant rouvre un dossier soldé', 'en-cours', etatDuDossier({}, avecAvenant, toutVerse));
dit('un abandon l’emporte sur tout', 'abandonne', etatDuDossier({ abandonneLe: AUJ }, e1Retenu, toutVerse));
dit('il s’est fermé au dernier franc', '2026-11-02', fermeLe({}, e1Retenu, toutVerse));
dit('un dossier en cours n’est pas fermé', undefined, fermeLe({}, e1Retenu, versements));

/* ══ LA PIÈCE D'IDENTITÉ — gardée parce qu'elle sert, et pas plus ════ */
dit('elle s’efface un an après la fermeture', '2027-11-02', effacementDeLIdentite({}, e1Retenu, toutVerse));
dit('un dossier en cours la garde', undefined, effacementDeLIdentite({}, e1Retenu, versements));
const carte = { chemin: 'b1/identite/e1/c.jpg', nom: 'c.jpg', type: 'image/jpeg', taille: 9, deposeLe: '2026-09-12' };
dit('avant son terme, on la garde', false, identiteAEffacer({ identite: carte }, e1Retenu, toutVerse, '2027-11-01'));
dit('à son terme, on l’efface', true, identiteAEffacer({ identite: carte }, e1Retenu, toutVerse, '2027-11-02'));
dit('sans carte, rien à effacer', false, identiteAEffacer({}, e1Retenu, toutVerse, '2030-01-01'));
dit('un abandon ancre aussi le terme', true,
  identiteAEffacer({ identite: carte, abandonneLe: '2025-01-01' }, [k1], [], AUJ));

/* ══ LA DÉPENSE QUI PORTE LE VERSEMENT ═══════════════════════════════
   L'argent sort par la porte des Dépenses, pas par une porte à part. */
const eng = { numero: 'ENG-2026-004', prestataire: 'Menuiserie K.', fournisseurId: 'f9', branchId: 'b1' };
dit('le libellé nomme le dossier', 'ENG-2026-004 · Menuiserie K. · Avance à la commande',
  libelleDeLaDepense(eng, avance));
const dep = depenseDuVersement(eng, avance, { category: 'Équipement', subcategory: 'Mobilier' });
dit('la dépense porte le montant, la date, la caisse et son rangement',
  [740000, '2026-09-12', 'Salon', 'Équipement', 'Mobilier', 'f9'],
  [dep.amountXof, dep.date, dep.cashbox, dep.category, dep.subcategory, dep.fournisseurId]);
dit('sans fiche fournisseur, pas de lien inventé', false,
  'fournisseurId' in depenseDuVersement({ ...eng, fournisseurId: undefined }, avance, { category: 'Équipement' }));
/* UNE CATÉGORIE VIDE N'INVENTE RIEN : elle retombe sur celle que l'écran propose. */
dit('une catégorie vide retombe sur la proposée', CATEGORIE_PROPOSEE,
  depenseDuVersement(eng, avance, { category: '  ' }).category);
dit('une sous-catégorie vide ne s’écrit pas', false,
  'subcategory' in depenseDuVersement(eng, avance, { category: 'Marketing', subcategory: ' ' }));

/* ══ LES DOSSIERS, LUS D'UN COUP ═════════════════════════════════════
   Un seul lecteur pour l'écran, la cloche et le Tableau de bord. */
const dossiers: Engagement[] = [
  { id: 'e3', branchId: 'b1', numero: 'ENG-2026-003', prestataire: 'Atelier B.', objet: 'étagères', creeLe: '2026-08-01', abandonneLe: '2026-08-20' },
  { id: 'e2', branchId: 'b1', numero: 'ENG-2026-005', prestataire: 'Imprimerie S.', objet: 'enseigne', creeLe: '2026-09-10' },
  { id: 'e1', branchId: 'b1', numero: 'ENG-2026-004', prestataire: 'Menuiserie K.', objet: 'agencement', creeLe: '2026-09-04' },
  { id: 'e4', branchId: 'b2', numero: 'ENG-2026-001', prestataire: 'Ailleurs', objet: 'autre branche', creeLe: '2026-08-01' },
];
const enseigne = dv({ id: 's1', engagementId: 'e2', montantXof: 300000, valableJusquau: '2026-09-17' });
const sansPreuve = vs({ id: 'v9', montantXof: 20000, verseLe: AUJ });
const lectures = litLesDossiers(dossiers, [...e1Retenu, enseigne], [...versements, sansPreuve], 'b1', AUJ);
dit('en cours d’abord, puis à choisir, puis fermé ; jamais une autre branche', ['e1', 'e2', 'e3'],
  lectures.map((l) => l.engagement.id));
dit('le dossier lu porte son reste', 1090000, lectures[0].resteXof);
dit('et le versement qui manque de preuve', ['v9'], lectures[0].sansDecharge.map((v) => v.id));
dit('le devis qui expire bientôt est vu', ['s1'], lectures[1].expirentBientot.map((d) => d.id));
dit('un dossier abandonné ne fait plus sonner ses devis', [],
  litLesDossiers([{ ...dossiers[1], abandonneLe: AUJ }], [enseigne], [], 'b1', AUJ)[0].expirentBientot);
const bilan = bilanDesEngagements(lectures);
dit('le bilan du Tableau de bord', [1, 1090000, 1, 1],
  [bilan.enCours, bilan.resteXof, bilan.sansDecharge, bilan.devisQuiExpirent.length]);

if (ko) {
  console.error(`\n${ko} vérification(s) en échec.`);
  process.exit(1);
}
console.log('\nLes engagements tiennent.');
