/* LES ENGAGEMENTS, ÉPROUVÉS — `node scripts/verifie-engagements.mjs`.

   « Un prestataire menuisier veut me réaliser un devis immobilier pour le
   salon. Où stocker mes devis, mes validations et les avances avec signature
   et décharge » (Yéman, 15 septembre 2026).

   Quatre fautes coûteraient cher, et se lisent toutes ici : un reste à payer
   faux, une somme en lettres qui ne dit pas la même chose que les chiffres,
   une avance qui passe pour prouvée sans décharge, et une pièce d'identité
   qu'on garde au-delà de ce qui sert. */
import { nombreEnLettres, nombreEnChiffres, sommeEnLettres, sommeEnChiffres, arrondiDans, decimalesDe } from '../src/shared/lettres';
import { fmtMoney, rateToXof } from '../src/shared/currency';
import {
  jourLongDit, decaleLeJour, numeroEngagementSuivant,
  retenuXof, devisDeBase, depassementXof, devisExpire, devisExpireBientot,
  pourquoiOnNeRetientPas, avertitAvantDeRetenir, retenirLeDevis,
  verseXof, resteXof, tropVerseXof, pourquoiOnNeVersePas, avertitAvantDeVerser,
  dechargeInvalide, versementsSansDecharge, texteDeLaDecharge,
  etatDuDossier, fermeLe, effacementDeLIdentite, identiteAEffacer,
  libelleDeLaDepense, depenseDuVersement, CATEGORIE_PROPOSEE,
  litLesDossiers, bilanDesEngagements,
  lisLeNombre, quantiteDite, totalDeLaLigne, totalDesLignes, pourquoiLaLigneNeVautPas,
  ligneDeLaSaisie, lignesDeLaSaisie, LIGNE_VIDE,
  pourquoiOnNeModifiePas, avertitAvantDeCorriger, corrigeLeDevis,
  pourquoiLaDechargeNePeutPasSeFaire, travauxAVenir,
  argentDuVersement, pourquoiLaDeviseNeChangePas, sommeDite, restesDits,
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
dit('le bilan du Tableau de bord', [1, [{ devise: 'XOF', montant: 1090000 }], 1, 1],
  [bilan.enCours, bilan.restes, bilan.sansDecharge, bilan.devisQuiExpirent.length]);

/* ══ LES LIGNES D'UN DEVIS ═══════════════════════════════════════════
   « Description, quantité et prix avec un calcul total » (Yéman). Le
   menuisier écrivait « 2 madrier 25000*2 » dans une case de texte. */
dit('un nombre à la française', 25000, lisLeNombre('25 000'));
dit('… avec l’espace fine que colle un tableur', 25000, lisLeNombre('25 000'));
dit('… avec sa virgule', 3.5, lisLeNombre('3,5'));
dit('… avec sa monnaie', 25000, lisLeNombre('25 000 F'));
dit('… une remise, négative', -5000, lisLeNombre('-5 000'));
dit('une case vide vaut zéro', 0, lisLeNombre(''));
/* UN CALCUL N'EST PAS UN NOMBRE : on ne devine pas ce qu'il voulait dire. */
dit('un calcul ne se lit pas', true, Number.isNaN(lisLeNombre('25000*2')));
/* LE POINT DES MILLIERS, à la française : « 25.000 » est vingt-cinq mille. */
dit('le point qui sépare les milliers', 25000, lisLeNombre('25.000'));
dit('… même plusieurs', 1234567, lisLeNombre('1.234.567'));
dit('… avec des décimales à la virgule', 1234.5, lisLeNombre('1.234,50'));
dit('un point suivi d’un seul chiffre reste une décimale', 12.5, lisLeNombre('12.5'));
/* UN ZÉRO TAPÉ EN LETTRE NE DEVIENT PAS DOUZE. */
dit('des lettres collées au nombre ne se lisent pas', true, Number.isNaN(lisLeNombre('12ooo')));
dit('… sauf une monnaie que la Maison connaît', 700, lisLeNombre('700 EUR'));
dit('des lettres seules ne se lisent pas', true, Number.isNaN(lisLeNombre('abc')));
dit('la quantité se dit à la française', '3,5', quantiteDite(3.5));

const madriers = ligneDeLaSaisie({ description: ' Madrier ', quantite: '2', prix: '25 000' });
dit('la ligne tapée devient une ligne lue', { description: 'Madrier', quantite: 2, prixUnitaireXof: 25000 }, madriers);
dit('deux madriers à 25 000', 50000, totalDeLaLigne(madriers));
dit('une quantité vide vaut un', 1, ligneDeLaSaisie({ description: 'Porte', quantite: '', prix: '40000' }).quantite);
dit('le franc n’a pas de centimes', 833, totalDeLaLigne({ description: 'Baguette', quantite: 2.5, prixUnitaireXof: 333 }));
dit('le prix s’arrondit au franc dès la saisie', 1251, ligneDeLaSaisie({ description: 'Vis', quantite: '1', prix: '1250,6' }).prixUnitaireXof);

const saisies = [
  { description: 'Madrier', quantite: '2', prix: '25000' },
  LIGNE_VIDE,
  { description: 'Contreplaqué', quantite: '3,5', prix: '12 000' },
  { description: 'Remise', quantite: '1', prix: '-2 000' },
];
const lues = lignesDeLaSaisie(saisies);
/* UNE LIGNE AJOUTÉE PUIS LAISSÉE NE COMPTE PAS, et ne bloque rien. */
dit('la ligne laissée vide ne compte pas', ['Madrier', 'Contreplaqué', 'Remise'], lues.map((x) => x.description));
dit('le total du devis, remise déduite', 90000, totalDesLignes(lues));

dit('une ligne juste vaut', null, pourquoiLaLigneNeVautPas(madriers));
dit('une ligne sans description', 'nommez ce qu’elle comprend.',
  pourquoiLaLigneNeVautPas({ description: ' ', quantite: 2, prixUnitaireXof: 25000 }));
dit('une quantité écrite en calcul', 'la quantité ne se lit pas. Écrivez un nombre, sans calcul.',
  pourquoiLaLigneNeVautPas(ligneDeLaSaisie({ description: 'Madrier', quantite: '2*2', prix: '25000' })));
dit('une quantité nulle', 'la quantité doit dépasser zéro.',
  pourquoiLaLigneNeVautPas({ description: 'Madrier', quantite: 0, prixUnitaireXof: 25000 }));
dit('un prix écrit en calcul', 'le prix ne se lit pas. Écrivez un nombre, sans calcul.',
  pourquoiLaLigneNeVautPas(ligneDeLaSaisie({ description: 'Madrier', quantite: '2', prix: '25000*2' })));
dit('une description sans prix', 'la ligne n’a pas de prix.',
  pourquoiLaLigneNeVautPas(ligneDeLaSaisie({ description: 'Madrier', quantite: '2', prix: '' })));
dit('une ligne illisible ne pèse rien dans le total', 50000,
  totalDesLignes([madriers, ligneDeLaSaisie({ description: 'Madrier', quantite: '2', prix: '25000*2' })]));

/* ══ CORRIGER UN DEVIS ═══════════════════════════════════════════════
   « Modifier un devis accepté » (Yéman) : la direction corrige, et l'écran
   dit ce que ça change à l'argent avant d'enregistrer. */
const k2Retenu = e1Retenu.find((d) => d.id === 'k2') as DevisRecu;
dit('le comptoir ne corrige pas un devis retenu', 'Ce devis est retenu : la direction seule le corrige.',
  pourquoiOnNeModifiePas({ devis: k2Retenu, estDirection: false }));
dit('la direction le corrige', null, pourquoiOnNeModifiePas({ devis: k2Retenu, estDirection: true }));
/* UN DEVIS PAS ENCORE RETENU se corrige par qui l'a saisi. */
dit('un devis à trancher se corrige par tous', null, pourquoiOnNeModifiePas({ devis: k1, estDirection: false }));

dit('corriger à la hausse dit le nouveau reste',
  'Le retenu passe de 1 850 000 F à 1 900 000 F. Reste à payer : 1 160 000 F.',
  avertitAvantDeCorriger({ devis: k2Retenu, nouveauMontantXof: 1900000, tous: e1Retenu, versements }));
/* BAISSER APRÈS UNE AVANCE PEUT FAIRE QU'ON A TROP VERSÉ : le dire maintenant. */
dit('corriger sous l’avance déjà versée dit le trop-versé',
  'Le retenu passe de 1 850 000 F à 700 000 F. 40 000 F auront été versés au-delà : à récupérer ou à déduire.',
  avertitAvantDeCorriger({ devis: k2Retenu, nouveauMontantXof: 700000, tous: e1Retenu, versements }));
dit('un montant inchangé n’avertit de rien', null,
  avertitAvantDeCorriger({ devis: k2Retenu, nouveauMontantXof: 1850000, tous: e1Retenu, versements }));
dit('un devis non retenu n’engage rien à corriger', null,
  avertitAvantDeCorriger({ devis: k1, nouveauMontantXof: 1, tous: e1Retenu, versements }));
dit('l’avenant retenu compte dans le nouveau retenu',
  'Le retenu passe de 2 050 000 F à 2 100 000 F. Reste à payer : 1 360 000 F.',
  avertitAvantDeCorriger({ devis: k2Retenu, nouveauMontantXof: 1900000, tous: avecAvenant, versements }));

const corriges = corrigeLeDevis(e1Retenu, 'k2', {
  montantXof: 1900000, valableJusquau: undefined,
  lignes: [{ description: 'Agencement', quantite: 1, prixUnitaireXof: 1900000 }],
}, 'Y. B.', AUJ);
const k2Corrige = corriges.find((d) => d.id === 'k2') as DevisRecu;
dit('la correction change le contenu', [1900000, 1], [k2Corrige.montantXof, k2Corrige.lignes?.length]);
/* CORRIGER N'EST PAS REDONNER UN OUI. */
dit('le devis reste retenu, par la même main', ['retenu', 'yeman', '2026-09-12'],
  [k2Corrige.etat, k2Corrige.retenuPar, k2Corrige.retenuLe]);
dit('elle porte qui l’a corrigé et quand', ['Y. B.', AUJ], [k2Corrige.corrigePar, k2Corrige.corrigeLe]);
dit('une validité retirée s’efface', false, 'valableJusquau' in JSON.parse(JSON.stringify(k2Corrige)));
dit('les autres devis ne bougent pas', JSON.stringify(e1Retenu.filter((d) => d.id !== 'k2')),
  JSON.stringify(corriges.filter((d) => d.id !== 'k2')));
dit('un devis retenu ne devient pas un avenant par correction', undefined,
  corrigeLeDevis(e1Retenu, 'k2', { avenant: true }, 'Y. B.', AUJ).find((d) => d.id === 'k2')?.avenant);

/* ══ LA PIÈCE D'IDENTITÉ SUR LA DÉCHARGE ═════════════════════════════
   « Toujours inclure la photo de sa pièce sur la décharge » (Yéman). */
const photo = { type: 'image/jpeg' };
dit('pas de décharge sans pièce déposée', 'Sa pièce d’identité figure sur chaque décharge : déposez-la d’abord.',
  pourquoiLaDechargeNePeutPasSeFaire({ identite: undefined, estDirection: true }));
/* LA DIRECTION SEULE OUVRE LA PIÈCE : c'est donc elle qui fait la décharge. */
dit('le comptoir ne fait pas la décharge', 'La décharge porte sa pièce d’identité, que seule la direction ouvre : c’est la direction qui la fait.',
  pourquoiLaDechargeNePeutPasSeFaire({ identite: photo, estDirection: false }));
dit('la direction la fait, pièce en photo', null, pourquoiLaDechargeNePeutPasSeFaire({ identite: photo, estDirection: true }));
dit('… en PNG aussi', null, pourquoiLaDechargeNePeutPasSeFaire({ identite: { type: 'image/png' }, estDirection: true }));
dit('une pièce en PDF ne se pose pas sur la décharge',
  'Sa pièce d’identité n’est pas une photo que la décharge sait montrer : déposez-la en JPEG ou en PNG.',
  pourquoiLaDechargeNePeutPasSeFaire({ identite: { type: 'application/pdf' }, estDirection: true }));
dit('… ni en HEIC',
  'Sa pièce d’identité n’est pas une photo que la décharge sait montrer : déposez-la en JPEG ou en PNG.',
  pourquoiLaDechargeNePeutPasSeFaire({ identite: { type: 'image/heic' }, estDirection: true }));
dit('une pièce ancienne sans type n’est pas refusée d’avance', null,
  pourquoiLaDechargeNePeutPasSeFaire({ identite: { type: '' }, estDirection: true }));

/* ══ LES TRAVAUX À VENIR ═════════════════════════════════════════════
   « Besoin de voir les notes sur le devis, le résumé des travaux à venir »
   (Yéman). Ce qui va se faire, c'est ce qui a été retenu. */
const avecResumes = avecAvenant.map((d) => (
  d.id === 'k2' ? { ...d, description: ' Agencement complet, six semaines ' }
    : d.id === 'av' ? { ...d, description: 'Plan de travail en bois dur' }
      : d.id === 'b1' ? { ...d, description: 'Hors plan de travail' }
        : d));
dit('le devis retenu d’abord, puis ses avenants', ['Agencement complet, six semaines', 'Plan de travail en bois dur'],
  travauxAVenir(avecResumes).map((x) => x.texte));
dit('un devis écarté ne dit pas ce qui va se faire', false,
  travauxAVenir(avecResumes).some((x) => x.devis.id === 'b1'));
dit('sans devis retenu, rien à venir', [], travauxAVenir([k1, b1]));
dit('un résumé vide ne compte pas', [], travauxAVenir([{ ...k2Retenu, description: '  ' }]));
dit('le résumé se corrige comme le reste', 'Deux étagères et portes moustiquaires',
  corrigeLeDevis(e1Retenu, 'k2', { description: 'Deux étagères et portes moustiquaires' }, 'Y. B.', AUJ)
    .find((d) => d.id === 'k2')?.description);

/* ══ PAYER EN DEVISES ════════════════════════════════════════════════
   « Me permettre de payer des prestataires en devises, pas seulement en
   CFA » (Yéman). Tranché : le dossier vit dans sa devise. */

/* ── LA SOMME, DANS SA MONNAIE ─────────────────────────────────────── */
dit('le franc CFA ne change pas de phrase', 'sept cent quarante mille francs CFA', sommeEnLettres(740000, 'XOF'));
dit('… ni de chiffres', '740 000 F', sommeEnChiffres(740000, 'XOF'));
dit('un million de francs CFA', 'un million de francs CFA', sommeEnLettres(1000000, 'XOF'));
dit('le franc n’a pas de centimes', 'douze francs CFA', sommeEnLettres(12.4, 'XOF'));
dit('des euros et des centimes', 'sept cent quarante euros et cinquante centimes', sommeEnLettres(740.5, 'EUR'));
dit('… en chiffres', '740,50 €', sommeEnChiffres(740.5, 'EUR'));
dit('pas de « ,00 » quand il n’y a pas de centimes', '1 250 €', sommeEnChiffres(1250, 'EUR'));
dit('un euro, au singulier', 'un euro', sommeEnLettres(1, 'EUR'));
dit('deux millions d’euros, avec l’élision', 'deux millions d’euros', sommeEnLettres(2000000, 'EUR'));
dit('des centimes seuls', 'vingt-neuf cents', sommeEnLettres(0.29, 'USD'));
dit('la livre est féminine', 'vingt et une livres sterling', sommeEnLettres(21, 'GBP'));
dit('le dollar dit d’où il vient', '1 000 $ US', sommeEnChiffres(1000, 'USD'));
dit('arrondir au centime', 37.05, arrondiDans(3 * 12.35, 'EUR'));
dit('arrondir au franc', 3, arrondiDans(2.5, 'XOF'));
/* UNE MONNAIE QUE LA MAISON NE SAIT PAS NOMMER suit la liste des monnaies
   sans centimes de l'affichage : le franc guinéen n'a pas de centimes ici
   et pas là. */
dit('le franc guinéen n’a pas de centimes', 0, decimalesDe('GNF'));
dit('… un code inconnu à centimes en garde deux', 2, decimalesDe('KES'));

/* ── LA SOMME À L'ÉCRAN — la même que sur la décharge ──────────────── */
dit('en francs, l’écran passe par fmtMoney, comme tout le Trône', fmtMoney(90000, 'XOF'), sommeDite(90000, 'XOF', 'XOF'));
dit('en devise, l’écran garde les centimes de la décharge', '1 250,50 €', sommeDite(1250.5, 'EUR', 'XOF'));
dit('le reste se dit devise par devise', `${fmtMoney(1090000, 'XOF')} · 700,50 €`,
  restesDits([{ devise: 'XOF', montant: 1090000 }, { devise: 'EUR', montant: 700.5 }], 'XOF'));
dit('sans reste, zéro franc', fmtMoney(0, 'XOF'), restesDits([], 'XOF'));

/* ── LES LIGNES ET LES SOMMES, AU CENTIME ──────────────────────────── */
dit('une ligne en euros garde ses centimes', 37.05,
  totalDeLaLigne(ligneDeLaSaisie({ description: 'Vis inox', quantite: '3', prix: '12,35' }, 'EUR'), 'EUR'));
dit('le prix en euros se lit avec son signe', 12.35, lisLeNombre('12,35 €', 'EUR'));
dit('… et avec son code', 700, lisLeNombre('700 EUR', 'EUR'));
dit('le franc se lit avec son F', 25000, lisLeNombre('25 000 F', 'XOF'));
/* « 700 USD » DANS UN DOSSIER EN EUROS N'EST PAS SEPT CENTS EUROS. */
dit('une autre monnaie que celle du dossier ne se lit pas', true, Number.isNaN(lisLeNombre('700 USD', 'EUR')));
/* 0,1 + 0,2 NE FAIT PAS 0,3 POUR UNE MACHINE : sans l'arrondi, ce dossier
   resterait « en cours » pour une poussière. */
dit('un dossier en euros se solde au centime près', 'solde',
  etatDuDossier({}, [
    dv({ id: 'eu1', montantXof: 0.1, etat: 'retenu' }),
    dv({ id: 'eu2', montantXof: 0.2, etat: 'retenu', avenant: true }),
  ], [vs({ id: 'eu3', montantXof: 0.3, verseLe: AUJ })]));

/* ── LE TEXTE DE LA DÉCHARGE, EN EUROS ─────────────────────────────── */
dit('la décharge dit la devise du dossier',
  'Je soussigné(e) K. A., reconnais avoir reçu de L’atelier MND la somme de '
  + 'sept cent quarante euros et cinquante centimes (740,50 €), à titre de solde.',
  texteDeLaDecharge({ prestataire: 'K. A.', maison: 'L’atelier MND', montantXof: 740.5, libelle: 'Solde', devise: 'EUR' }));
dit('verser au-delà dit la devise', 'Ce versement dépasse le devis retenu de 50 €.',
  avertitAvantDeVerser({ montantXof: 600, retenuXof: 1000, dejaVerseXof: 450, devise: 'EUR' }));

/* ── LES TROIS MONNAIES D'UN VERSEMENT ─────────────────────────────── */
const taux = (c: string) => ({ XOF: 1, EUR: 655.96, USD: 601 } as Record<string, number>)[c] ?? 0;
const enFrancsSeuls = argentDuVersement({ montant: 740000, devise: 'XOF', deviseDuTiroir: 'XOF', tauxIndicatif: taux });
dit('tout en francs : rien à demander', [740000, false, false, 740000, undefined],
  [enFrancsSeuls.coutXof, enFrancsSeuls.demandeLeCout, enFrancsSeuls.demandeLeTiroir, enFrancsSeuls.tiroir, enFrancsSeuls.fx]);

const euroParEuro = argentDuVersement({ montant: 700, devise: 'EUR', deviseDuTiroir: 'EUR', tauxIndicatif: taux });
dit('un dossier en euros payé en euros : le coût est proposé au taux indicatif', [459172, true, false, 700],
  [euroParEuro.coutXof, euroParEuro.demandeLeCout, euroParEuro.demandeLeTiroir, euroParEuro.tiroir]);
dit('… et le tiroir en euros le sait', ['EUR', 700, 655.96],
  [euroParEuro.fx?.code, euroParEuro.fx?.amount, euroParEuro.fx?.rate]);
/* LE TAUX INDICATIF EST UN POINT DE DÉPART : la main fait foi. */
dit('le taux réellement pratiqué remplace l’indicatif', 462000,
  argentDuVersement({ montant: 700, devise: 'EUR', deviseDuTiroir: 'EUR', coutSaisi: 462000, tauxIndicatif: taux }).coutXof);
/* UN ZÉRO OU UN GRIBOUILLIS TAPÉ N'EST PAS REMPLACÉ EN DOUCE PAR LA
   SUGGESTION : il donne zéro, et zéro se refuse. */
dit('un zéro tapé ne redevient pas la suggestion', 0,
  argentDuVersement({ montant: 700, devise: 'EUR', deviseDuTiroir: 'EUR', coutSaisi: 0, tauxIndicatif: taux }).coutXof);
dit('un coût illisible donne zéro', 0,
  argentDuVersement({ montant: 700, devise: 'EUR', deviseDuTiroir: 'EUR', coutSaisi: NaN, tauxIndicatif: taux }).coutXof);
dit('… et se refuse', 'Dites ce que ce versement coûte à la Maison, en francs.',
  pourquoiOnNeVersePas({ montantXof: 700, estDirection: true, retenuXof: 1000, cashbox: 'EUR', coutXof: 0 }));

const euroParFrancs = argentDuVersement({ montant: 700, devise: 'EUR', deviseDuTiroir: 'XOF', coutSaisi: 462000, tauxIndicatif: taux });
dit('un dossier en euros payé d’une caisse en francs : ce qui sort, c’est le coût', [462000, 462000, false, undefined],
  [euroParFrancs.coutXof, euroParFrancs.tiroir, euroParFrancs.demandeLeTiroir, euroParFrancs.fx]);

const francsParDollars = argentDuVersement({ montant: 601000, devise: 'XOF', deviseDuTiroir: 'USD', tauxIndicatif: taux });
dit('un dossier en francs payé en dollars : on demande ce qui sort du tiroir', [601000, false, true, 1000, 'USD'],
  [francsParDollars.coutXof, francsParDollars.demandeLeCout, francsParDollars.demandeLeTiroir, francsParDollars.tiroir, francsParDollars.fx?.code]);

const troisMonnaies = argentDuVersement({ montant: 700, devise: 'EUR', deviseDuTiroir: 'USD', tiroirSaisi: 760, tauxIndicatif: taux });
dit('euros dus, dollars sortis, francs comptés : les trois se demandent', [true, true, 764.01, 760, 459172],
  [troisMonnaies.demandeLeCout, troisMonnaies.demandeLeTiroir, troisMonnaies.suggestionTiroir, troisMonnaies.tiroir, troisMonnaies.coutXof]);

/* UNE CAISSE DANS UNE MONNAIE SANS TAUX CONNU PROPOSE ZÉRO, et zéro n'est
   pas ce qu'elle a perdu : le versement le réclame. `rateToXof` est ce que
   l'écran injecte, et il rend zéro pour ce qu'il ne connaît pas. */
const sansTaux = argentDuVersement({ montant: 700, devise: 'EUR', deviseDuTiroir: 'GNF', tauxIndicatif: rateToXof });
dit('une caisse dans une monnaie sans taux ne propose rien', [0, undefined], [sansTaux.tiroir, sansTaux.fx]);
dit('… et le versement le réclame', 'Dites ce qui sort du tiroir, dans sa monnaie.',
  pourquoiOnNeVersePas({ montantXof: 700, estDirection: true, retenuXof: 1000, cashbox: 'GNF', coutXof: 459172, tiroir: 0 }));

/* ── LA DÉPENSE, EN FRANCS, AVEC SA DEVISE AU LIBELLÉ ─────────────── */
const depEnEuros = depenseDuVersement(eng, { ...avance, montantXof: 700 }, { category: 'Équipement' },
  { coutXof: 459172, fx: { code: 'EUR', rate: 655.96, amount: 700 }, devise: 'EUR' });
dit('la dépense porte le coût en francs, le tiroir et la devise au libellé',
  [459172, 700, 'ENG-2026-004 · Menuiserie K. · Avance à la commande · 700 €'],
  [depEnEuros.amountXof, depEnEuros.fx?.amount, depEnEuros.label]);
/* EN FRANCS, LA DÉPENSE NE CHANGE PAS DE FORME : ni suffixe, ni fx. */
dit('en francs, rien de plus qu’avant', [740000, false, 'ENG-2026-004 · Menuiserie K. · Avance à la commande'],
  [dep.amountXof, 'fx' in dep, dep.label]);

/* ── LE DOSSIER, SA DEVISE, SON BILAN ──────────────────────────────── */
dit('un dossier sans devise est en francs', 'XOF',
  litLesDossiers([dossiers[2]], [], [], 'b1', AUJ)[0].devise);
dit('un dossier en euros le dit', 'EUR',
  litLesDossiers([{ ...dossiers[2], devise: 'EUR' }], [], [], 'b1', AUJ)[0].devise);
const miroirs: Engagement = { id: 'e5', branchId: 'b1', numero: 'ENG-2026-006', prestataire: 'Atelier P.', objet: 'miroirs', creeLe: AUJ, devise: 'EUR' };
const bilanDeuxDevises = bilanDesEngagements(litLesDossiers(
  [...dossiers, miroirs],
  [...e1Retenu, enseigne, dv({ id: 'm1', engagementId: 'e5', montantXof: 700.5, etat: 'retenu' })],
  [...versements, sansPreuve], 'b1', AUJ,
));
/* ON N'ADDITIONNE PAS DES EUROS ET DES FRANCS. */
dit('le reste se dit devise par devise, le franc d’abord',
  [{ devise: 'XOF', montant: 1090000 }, { devise: 'EUR', montant: 700.5 }], bilanDeuxDevises.restes);
dit('la devise se choisit tant que le dossier est vide', null, pourquoiLaDeviseNeChangePas({ devis: [], versements: [] }));
dit('elle ne change plus après le premier devis',
  'Des montants sont déjà rangés dans cette devise : la monnaie d’un dossier ne change plus après son premier devis ou son premier versement.',
  pourquoiLaDeviseNeChangePas({ devis: [k1], versements: [] }));
dit('… ni après un versement seulement prévu', true,
  pourquoiLaDeviseNeChangePas({ devis: [], versements: [prevu] }) !== null);

if (ko) {
  console.error(`\n${ko} vérification(s) en échec.`);
  process.exit(1);
}
console.log('\nLes engagements tiennent.');
