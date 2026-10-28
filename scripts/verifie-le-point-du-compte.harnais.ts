/* LE POINT DU COMPTE, EPROUVE — 28 octobre 2026.
   `node scripts/verifie-le-point-du-compte.mjs` (et `--prouve`).

   « Merline et sa soeur ont plusieurs factures en instance : comment envoyer
   le point a leur pere, avec un lien de paiement ? Des clients accumulent 4
   ou 5 factures avant de payer » (Yeman). Ses choix : le point pour tout
   compte des deux factures (famille ou cliente seule), en un toucher (le PDF
   et le lien), un bouton sur la fiche, au Carnet et dans Factures. Les regles :
   src/shared/point-du-compte-pur.ts. TOUS LES ATTENDUS SONT ECRITS A LA MAIN.
   Les tetes sont inventees. Sortie ASCII : la console de Windows. */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  payeurDuCompte, tetesDuCompte, piecesDuPoint, etendueDite, phraseDuPoint, prenomsDuPoint, motDuPoint,
  cleDuPoint, variablesDuPoint, MODELE_DU_POINT, SEUIL_DU_POINT, type TeteDuPoint, type CompteDuPoint, type PieceDuPoint,
} from '../src/shared/point-du-compte-pur';
import { envoieLePointDuCompte } from '../src/shared/facture-whatsapp';

declare const __FAUTE__: { fichier: string; avant: string; apres: string } | null;

const ascii = (s: string) => s.replace(/[^\x20-\x7e]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);
const dit = (n: number, nom: string, attendu: unknown, obtenu: unknown) => {
  const ok = JSON.stringify(attendu) === JSON.stringify(obtenu);
  if (!ok) process.exitCode = 1;
  console.log(ascii(`${ok ? 'OK   ' : 'ECHEC'} #${n} ${nom} -> ${JSON.stringify(obtenu)?.slice(0, 230)}`));
  if (!ok) console.log(ascii(`       attendu ${JSON.stringify(attendu)?.slice(0, 230)}`));
};
const racine = process.cwd();
const sansCommentaires = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
const source = (rel: string): string => {
  let s = readFileSync(path.join(racine, rel), 'utf8').replace(/\r\n/g, '\n');
  if (__FAUTE__ && __FAUTE__.fichier === rel) s = s.split(__FAUTE__.avant).join(__FAUTE__.apres);
  return sansCommentaires(s);
};
const fois = (s: string, motif: string) => s.split(motif).length - 1;

/* Un compte famille paye par le pere (ajoute apres coup, sans en etre
   membre), deux filles, une archivee ; une cliente seule ; une voisine. */
const tetes: TeteDuPoint[] = [
  { id: 'pere', name: 'Paul D.', phone: '+229 01 90 00 00 01' },
  { id: 'merline', name: 'Merline Kit D.', familyId: 'f-d', phone: '+229 01 90 00 00 02' },
  { id: 'djidjoho', name: 'Djidjoho D.', familyId: 'f-d' },
  { id: 'ancienne', name: 'Ancienne D.', familyId: 'f-d', archived: true },
  { id: 'sarah', name: 'Sarah K.', phone: '+229 01 90 00 00 03' },
  { id: 'voisine', name: 'Voisine V.', phone: '+229 01 90 00 00 04' },
];
const comptes: CompteDuPoint[] = [{ id: 'f-d', name: 'Famille D.', payerClientId: 'pere' }];
type P = PieceDuPoint & { reste: number; number: string };
const pieces: P[] = [
  { id: 'i1', number: 'MND-R-0264', kind: 'facture', clientId: 'merline', branchId: 'b', date: '2026-06-13', apptId: 'r1', reste: 20000 },
  { id: 'i2', number: 'MND-R-0292', kind: 'facture', clientId: 'merline', forClientId: 'djidjoho', branchId: 'b', date: '2026-07-04', apptId: 'r2', reste: 17000 },
  { id: 'i3', number: 'MND-R-0290', kind: 'facture', clientId: 'merline', branchId: 'b', date: '2026-07-04', apptId: 'r3', reste: 17000 },
  { id: 'i4', number: 'MND-2026-0151', kind: 'facture', clientId: 'merline', branchId: 'b', date: '2026-09-01', apptId: 'r4', reste: 30000 },
  { id: 'i5', number: 'MND-2026-0200', kind: 'facture', clientId: 'merline', branchId: 'b', date: '2026-09-02', reste: 0 },
  { id: 'i6', number: 'MND-2026-0201', kind: 'devis', clientId: 'merline', branchId: 'b', date: '2026-09-03', reste: 9000 },
  { id: 'i7', number: 'MND-2026-0202', kind: 'facture', clientId: 'merline', branchId: 'autre', date: '2026-09-04', reste: 9000 },
  { id: 'i8', number: 'MND-2026-0203', kind: 'facture', clientId: 'ancienne', branchId: 'b', date: '2026-09-05', reste: 9000 },
  { id: 'i9', number: 'MND-2026-0204', kind: 'facture', clientId: 'voisine', branchId: 'b', date: '2026-09-06', reste: 9000 },
  /* Payee par une tante hors du compte, pour Djidjoho : elle est du point du pere. */
  { id: 'i10', number: 'MND-2026-0205', kind: 'facture', clientId: 'tante', forClientId: 'djidjoho', branchId: 'b', date: '2026-09-10', apptId: 'r10', reste: 5000 },
  { id: 's1', number: 'MND-2026-0300', kind: 'facture', clientId: 'sarah', branchId: 'b', date: '2026-01-03', apptId: 'rs1', reste: 25000 },
  { id: 's2', number: 'MND-V-0301', kind: 'facture', clientId: 'sarah', branchId: 'b', date: '2026-09-05', reste: 37500 },
];
const du = (payeurId: string) => piecesDuPoint({ payeurId, tetes, comptes, pieces, branchId: 'b', resteDe: (p) => p.reste }).map((p) => p.id);

/* == #1 -- LE PAYEUR DU COMPTE : celui de la famille, meme s'il n'en est pas membre ; sinon elle-meme == */
dit(1, 'le payeur : la fille et le pere menent au pere ; la cliente seule et la voisine a elles-memes',
  ['pere', 'pere', 'pere', 'sarah', 'voisine'],
  [payeurDuCompte('merline', tetes, comptes), payeurDuCompte('djidjoho', tetes, comptes), payeurDuCompte('pere', tetes, comptes),
    payeurDuCompte('sarah', tetes, comptes), payeurDuCompte('voisine', tetes, comptes)]);

/* == #2 -- LES TETES DU COMPTE : la famille sans l'archivee, le payeur compris ; une seule sinon == */
dit(2, 'les tetes : le pere, Merline, Djidjoho (pas l archivee) ; Sarah seule',
  [['djidjoho', 'merline', 'pere'], ['sarah']],
  [[...tetesDuCompte('pere', tetes, comptes)].sort(), [...tetesDuCompte('sarah', tetes, comptes)].sort()]);

/* == #3 -- LES FACTURES DU POINT : au nom de la tete soignee ou de la payeuse, la branche, ce qui doit encore, par date == */
dit(3, 'les factures : celles de Merline et de Djidjoho (meme ecrites au nom de Merline, ou payees par une tante), dans la branche, qui doivent, par date ; ni devis, ni soldee, ni archivee, ni voisine',
  [['i1', 'i2', 'i3', 'i4', 'i10'], ['s1', 's2'], ['i9']],
  [du('pere'), du('sarah'), du('voisine')]);

/* == #4 -- L'ETENDUE DES JOURS, AVEC L'ANNEE == */
dit(4, 'l etendue : la meme annee, deux annees, un seul jour (le 1er se dit 1er), le meme mois dit une fois',
  ['du 13 juin au 1er septembre 2026', 'du 20 décembre 2025 au 5 janvier 2026', 'du 5 septembre 2026', '', 'du 1er au 20 octobre 2026'],
  [etendueDite(['2026-09-01', '2026-06-13', '2026-07-04']), etendueDite(['2026-01-05', '2025-12-20']), etendueDite(['2026-09-05', '2026-09-05']), etendueDite([]), etendueDite(['2026-10-20', '2026-10-01'])]);

/* == #5 -- CE QUE LE POINT COUVRE : des rituels, ou des factures quand l'une n'en est pas un == */
const lesQuatre = pieces.filter((p) => ['i1', 'i2', 'i3', 'i4'].includes(p.id));
dit(5, 'la phrase : 4 rituels ; 2 factures quand une vente s y mele ; un rituel seul',
  ['4 rituels, du 13 juin au 1er septembre 2026', '2 factures, du 3 janvier au 5 septembre 2026', '1 rituel, du 13 juin 2026'],
  [phraseDuPoint(lesQuatre), phraseDuPoint(pieces.filter((p) => p.clientId === 'sarah')), phraseDuPoint([lesQuatre[0]])]);

/* == #6 -- LES PRENOMS, CHACUN UNE FOIS == */
dit(6, 'les prenoms : Merline et Djidjoho, une fois chacun, dans l ordre des factures', ['Merline', 'Djidjoho'], prenomsDuPoint(lesQuatre, tetes));

/* == #7 -- LE MOT : « votre compte » ou « le compte de ... », le jour, le total, le lien ; aucun numero de piece == */
const motPere = motDuPoint({ appel: 'Monsieur Paul', quand: 'mercredi 28 octobre 2026', prenoms: ['Merline', 'Djidjoho'], payeurParmiLesTetes: false,
  phrase: '4 rituels, du 13 juin au 1er septembre 2026', totalDit: '84 000 F', lien: 'L', enLigne: true });
const motSarah = motDuPoint({ appel: 'Madame Sarah', quand: 'mercredi 28 octobre 2026', prenoms: ['Sarah'], payeurParmiLesTetes: true,
  phrase: '2 factures, du 3 janvier au 5 septembre 2026', totalDit: '62 500 F', lien: 'L' });
dit(7, 'le mot : le pere lit le compte de Merline et Djidjoho, Sarah lit son compte ; le lien Regler ou Mobile Money ; jamais un numero de piece',
  [true, true, true, true, false],
  [motPere.startsWith('Bonjour Monsieur Paul, voici le point du compte de Merline et Djidjoho au mercredi 28 octobre 2026 : 4 rituels, du 13 juin au 1er septembre 2026, 84 000 F à régler.'),
    motSarah.startsWith('Bonjour Madame Sarah, voici le point de votre compte au mercredi 28 octobre 2026 : 2 factures'),
    /\(MTN, Moov, Celtiis ou carte\), touchez ce lien :\nL$/.test(motPere),
    /votre téléphone compose le numéro de paiement, frais compris\.\nL$/.test(motSarah),
    /MND-|F-20/.test(motPere + motSarah)]);

/* == #8 -- LA CLE, LE MODELE, SES VARIABLES == */
dit(8, 'la cle : un jour, les chiffres du numero ; le modele point_du_compte et ses quatre variables dans l ordre ; deux factures font un point',
  ['point-2026-10-28-2290190000001', 'point_du_compte', ['Monsieur Paul', 'mercredi 28 octobre 2026', '4 rituels', '84 000 F'], 2],
  [cleDuPoint('2026-10-28', '+229 01 90 00 00 01'), MODELE_DU_POINT, variablesDuPoint('Monsieur Paul', 'mercredi 28 octobre 2026', '4 rituels', '84 000 F'), SEUIL_DU_POINT]);

/* == #9 -- L'ENVOI : le mot et le PDF dans la fenetre ; sinon le modele ; refuse, le lien seul ; sans numero, rien == */
type Appel = { modele?: string; enTete?: string; variables?: string[]; boutonUrl?: string; cleUnique?: string; texte?: string; piece?: unknown };
const pdf = { kind: 'releve', titre: 'POINT DU COMPTE', nomDuFichier: 'Point-du-compte', number: '20261028-0001', houseName: 'Une Maison', date: '28 octobre 2026',
  clientName: 'Famille D.', lines: [{ label: 'Merline · 13 juin 2026', qty: 1, unit: '20 000 F', total: '20 000 F' }], subtotal: '20 000 F', total: '20 000 F' } as never;
const lePere = { id: 'pere', name: 'Paul D.', phone: '+229 01 90 00 00 01', branchId: 'b' };
const essai = async (reponses: ({ ok: true } | { ok: false; erreur: string })[], o: { sansNumero?: boolean; sansTapGo?: boolean } = {}) => {
  const appels: Appel[] = [];
  const r = await envoieLePointDuCompte({
    client: o.sansNumero ? { ...lePere, phone: '' } : lePere, pdf, prenoms: ['Merline', 'Djidjoho'], payeurParmiLesTetes: false,
    phrase: '4 rituels, du 13 juin au 1er septembre 2026', totalDit: '84 000 F', jourIso: '2026-10-28',
    tapgo: o.sansTapGo ? undefined : { parametre: 'r-abc', lien: 'https://x/payer.html?tg=r-abc', totalDit: '84 000 F' }, enLigne: true,
    cle: 'point-2026-10-28-2290190000001',
    envoie: (async (e: Appel) => { appels.push(e); return reponses[appels.length - 1] ?? { ok: false, erreur: 'plus de reponse' }; }) as never,
  });
  return { r, appels };
};
(async () => {
  const dansLaFenetre = await essai([{ ok: true }]);
  const horsFenetre = await essai([{ ok: false, erreur: 'la fenêtre de 24 heures est fermée' }, { ok: true }]);
  const refuse = await essai([{ ok: false, erreur: 'la fenêtre de 24 heures est fermée' }, { ok: false, erreur: '(#132001) Template name does not exist' }, { ok: true }]);
  const sansNumero = await essai([{ ok: true }], { sansNumero: true });
  const sansTapGo = await essai([{ ok: false, erreur: 'la fenêtre de 24 heures est fermée' }], { sansTapGo: true });
  dit(9, 'l envoi : dans la fenetre, un seul message avec le PDF et le mot ; hors fenetre, le modele point_du_compte (PDF en tete, 4 variables, le bouton) ; refuse, le lien seul ; sans numero ni Tap & Go, rien ne part',
    [[1, true, true, 'point-2026-10-28-2290190000001-mot'],
      [2, 'point_du_compte', 'document', true, 4, 'r-abc', 'point-2026-10-28-2290190000001-modele'],
      [3, 'paiement_en_attente', 'lien', 'point-2026-10-28-2290190000001-lien'],
      [0, false], [1, false]],
    [[dansLaFenetre.appels.length, !!dansLaFenetre.appels[0]?.piece, /point du compte\n/.test(dansLaFenetre.appels[0]?.texte ?? ''), dansLaFenetre.appels[0]?.cleUnique],
      [horsFenetre.appels.length, horsFenetre.appels[1]?.modele, horsFenetre.appels[1]?.enTete, !!horsFenetre.appels[1]?.piece, horsFenetre.appels[1]?.variables?.length, horsFenetre.appels[1]?.boutonUrl, horsFenetre.appels[1]?.cleUnique],
      [refuse.appels.length, refuse.appels[2]?.modele, refuse.r.ok ? (refuse.r as { repli?: string }).repli : 'echec', refuse.appels[2]?.cleUnique],
      [sansNumero.appels.length, sansNumero.r.ok], [sansTapGo.appels.length, sansTapGo.r.ok]]);

  /* == #10 -- LES TROIS ENTREES ET LA FENETRE == */
  const fen = source('src/apps/trone/routes/vente/FenetreDuPoint.tsx');
  const fac = source('src/apps/trone/routes/vente/Factures.tsx');
  const car = source('src/apps/trone/routes/clients/Carnet.tsx');
  const fic = source('src/apps/trone/routes/clients/Customers.tsx');
  dit(10, 'les entrees : Factures (a la place du lien du foyer), le Carnet, la fiche ; la fenetre lit le payeur du compte, deux factures au moins, l envoi en un toucher',
    [1, 1, 1, 1, 1, 1, 1, 1, 0, 1],
    [fois(fac, '<BoutonDuPoint teteId={selected.forClientId ?? selected.clientId} onOpen={setPointDe} />'),
      fois(fac, '<FenetreDuPoint teteId={pointDe}'),
      fois(car, 'teteId={a.clientId} className="" libelle="Envoyer le point du compte"'),
      fois(car, '<FenetreDuPoint teteId={pointDe}'),
      fois(fic, '<BoutonDuPoint teteId={client.id}'),
      fois(fen, 'const payeurId = payeurDuCompte(teteId, clients, families);'),
      fois(fen, 'ouvert: pieces.length >= SEUIL_DU_POINT'),
      fois(fen, 'const r = await envoi.point(payeurId, prises.map((p) => p.id), { renvoi: true });'),
      fois(fac, 'Un seul lien pour le foyer'),
      fois(fic, '<FenetreDuPoint teteId={pointDe}')]);

  /* == #11 -- L'ENVOI DU TRONE : le payeur d'aujourd'hui, une seule part seule, Regler selon les jours, le papier des factures == */
  const tout = source('src/apps/trone/routes/vente/envoi-de-la-piece.ts');
  const point = tout.slice(tout.indexOf('const point = async'));
  dit(11, 'point : une facture seule part comme avant ; le payeur passe par sa fiche ; Regler un jour = foyer, plusieurs = point ; le PDF POINT DU COMPTE ; la cle du point',
    [1, 1, 1, 1, 1, 1],
    [fois(point, 'if (ouvertes.length === 1) { await aRegler(ouvertes[0].id, ouvertes[0].date, { memePasse: true, renvoi: o?.renvoi }); return null; }'),
      fois(point, 'const payeur = clients.find((c) => c.id === payeurId);'),
      fois(point, '(unSeulJour ? saitReglerLeFoyer(version) : saitReglerLePoint(version)) ? poseLeLienDuFoyer(rdvs) : null'),
      fois(point, "titre: 'POINT DU COMPTE',"),
      fois(point, 'cle: `${cleDuPoint(jour, payeur.phone)}'),
      fois(point, 'payeurParmiLesTetes: ouvertes.some((p) => (p.forClientId ?? p.clientId) === payeur.id),')]);

  if (process.exitCode) console.log('Le point du compte ne tient pas.');
  else console.log('Le point du compte tient : un compte, un papier, un lien, un total.');
})();
