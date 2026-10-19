/* LA PHOTO QUI REMPLIT LA DÉPENSE, ÉPROUVÉE — `node scripts/verifie-la-photo-du-recu.mjs`.

   19 octobre 2026, chantier `recu` des huit (maquette NKQMiMMY… validée :
   « Tout me va »). Le texte de la maquette : « Dans Dépenses, "Photographier
   le reçu". La photo reste jointe à la dépense. Les cases cuivrées viennent
   de la photo : vérifiez-les (Montant, Date, Fournisseur, Catégorie). Les
   articles sont repris en lignes. Même geste pour un chèque à l'encaissement :
   la banque et le numéro se lisent sur la photo, la trace est faite. »
   Sa décision : « Toute personne qui saisit une dépense : sa dépense attend
   votre validation, comme aujourd'hui. »

   LES ATTENTES SONT ÉCRITES À LA MAIN d'après ces mots, jamais déduites du
   code. Aucun appel à la vraie fonction : la lecture reçoit des sorties de
   Claude FABRIQUÉES, saines et abîmées. Données d'exemple. */
import { readFileSync } from 'node:fs';
import { DEPARTEMENTS_PAR_CHANTIER, peutDemander } from '../src/shared/ia-maison-pur';
import {
  CHAMPS_DU_RECU, CHANTIER_DU_RECU, LIBELLE_DU_RESTE, LIGNES_MAX, MONTANT_MAX_XOF, SCHEMA_DU_CHEQUE, SCHEMA_DU_RECU, TOLERANCE_DES_LIGNES, USAGE_DU_RECU,
  banqueReconnue, categorieLue, champsRemplis, chequeDit, consigneDuCheque, consigneDuRecu, cuivreSi, dateLue, formulaireDepuisLaLecture,
  lectureDuCheque, lectureDuRecu, lignesPourLaDepense, montantLu, moyenLu, type RecuLu,
} from '../src/shared/ia-recu-pur';
import { BANQUES_DU_BENIN } from '../src/shared/trace-du-moyen-pur';

let ko = 0;
const dit = (nom: string, attendu: unknown, obtenu: unknown) => {
  const a = JSON.stringify(attendu); const o = JSON.stringify(obtenu);
  if (a === o) console.log(`OK    ${nom}`);
  else { ko++; console.log(`ECHEC ${nom}\n       obtenu  ${o}\n       attendu ${a}`); }
};
const lis = (f: string) => readFileSync(f, 'utf8').split(String.fromCharCode(13)).join('');
const sansCommentaires = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '');
const AUJ = '2026-10-19';
const CATEGORIES = ['Local', 'Matières premières', 'Salaires', 'Marketing', 'Logistique', 'Équipement', 'Frais bancaires', 'Divers'];
const compteur = () => { let n = 0; return () => `l${++n}`; };

/* ── 1. LA RÈGLE : QUI, ET PAR QUELLE PORTE ─────────────────────────────── */
dit('le chantier est « recu », et il lit une image (le modèle fin)', ['recu', 'image'], [CHANTIER_DU_RECU, USAGE_DU_RECU]);
{
  /* Sa décision : toute personne qui saisit une dépense. La direction par son
     rôle ; un maître par n'importe lequel des départements que le contrat
     ouvre à `recu`. Une clef d'écran ou un ancien domaine n'ouvrent rien. */
  const departements = ['dept-vente-caisse', 'dept-finances', 'dept-atelier', 'dept-clientele', 'dept-equipe', 'dept-marketing', 'dept-academie', 'dept-systeme'];
  dit('le contrat ouvre « recu » à tous les départements de la barre (huit, la Direction passe par son rôle)', departements, [...DEPARTEMENTS_PAR_CHANTIER.recu]);
  dit('la direction demande ; un maître sans département, non ; un maître de chaque département, oui ; une clef d écran ou un vieux domaine, non',
    [true, true, false, ...departements.map(() => true), false, false, false],
    [peutDemander('souverain', 'recu', {}), peutDemander('gerant', 'recu', {}), peutDemander('maitre', 'recu', {}),
      ...departements.map((d) => peutDemander('maitre', 'recu', { [d]: true })),
      peutDemander('maitre', 'recu', { '/depenses': true }), peutDemander('maitre', 'recu', { finances: true }), peutDemander(undefined, 'recu', { 'dept-finances': true })]);
}
dit('ses bornes : 5 % entre lignes et total, 60 lignes au plus, un milliard de francs au plus', [0.05, 60, 1_000_000_000], [TOLERANCE_DES_LIGNES, LIGNES_MAX, MONTANT_MAX_XOF]);
dit('les quatre cases cuivrées de la maquette', ['montant', 'date', 'fournisseur', 'categorie'], [...CHAMPS_DU_RECU]);
dit('la teinte est cuivre, jamais obsidienne, et s efface quand on touche', [true, false, undefined],
  [/copper/.test(JSON.stringify(cuivreSi(true))), /obsidian/.test(JSON.stringify(cuivreSi(true))), cuivreSi(false)]);

/* ── 2. LA LECTURE : ON NE CROIT PAS CLAUDE ─────────────────────────────── */
dit('un montant : entier de francs, arrondi (12 500,5 devient 12 501), lu même écrit « 12 500 » ou « 12.500,50 » ; négatif, absurde ou texte : null',
  [12500, 12501, 12500, 12501, null, null, null, 0],
  [montantLu(12500), montantLu(12500.5), montantLu('12 500'), montantLu('12.500,50'), montantLu(-5), montantLu('abc'), montantLu(2_000_000_000), montantLu(0)]);
dit('une date : ISO avec l année, pas dans le futur ; « 18/10/2026 », le 30 février, 1999 : null ; une heure derrière ne gêne pas',
  ['2026-10-18', AUJ, null, null, null, null, '2026-10-18', '2026-10-20'],
  [dateLue('2026-10-18', AUJ), dateLue(AUJ, AUJ), dateLue('2026-10-20', AUJ), dateLue('18/10/2026', AUJ), dateLue('2026-02-30', AUJ), dateLue('1999-01-01', AUJ),
    dateLue('2026-10-18T10:00:00', AUJ), dateLue('2026-10-20', AUJ, { futurPermis: true })]);
dit('une catégorie : celle du Trône, telle qu il l écrit (accents et casse libres) ; hors liste : vide',
  ['Local', 'Local', 'Matières premières', '', '', ''],
  [categorieLue('Local', CATEGORIES), categorieLue('local ', CATEGORIES), categorieLue('matieres premieres', CATEGORIES), categorieLue('Courses', CATEGORIES), categorieLue(null, CATEGORIES), categorieLue('', CATEGORIES)]);
dit('le moyen : une énumération fermée', ['espèces', 'carte', 'mobile money', 'chèque', 'virement', null, null],
  [moyenLu('Espèces'), moyenLu('CB VISA'), moyenLu('MTN MoMo'), moyenLu('cheque'), moyenLu('Virement'), moyenLu('troc'), moyenLu(null)]);

const BRUT = {
  montant: '12 500', devise: null, date: '2026-10-18', fournisseur: '  Super U   Cotonou ', categorie: 'matières premières',
  lignes: [
    { libelle: 'Beurre de karité 1 kg', quantite: 2, montant: 8000 },
    { libelle: 'Huile de coco', quantite: 1, montant: 4500 },
    { libelle: 'TOTAL', quantite: 1, montant: 'abc' },
    { libelle: '', quantite: 1, montant: 100 },
  ],
  moyen: 'Espèces', confiance: 0.92,
};
const LU: RecuLu = {
  montant: 12500, date: '2026-10-18', fournisseur: 'Super U Cotonou', categorie: 'Matières premières',
  lignes: [{ libelle: 'Beurre de karité 1 kg', quantite: 2, montant: 8000 }, { libelle: 'Huile de coco', quantite: 1, montant: 4500 }],
  moyen: 'espèces', confiance: 0.92, avertissements: [],
};
dit('un reçu sain : total, date, enseigne nettoyée, catégorie du Trône, deux lignes (la ligne TOTAL et la ligne sans libellé tombent), moyen, confiance',
  LU, lectureDuRecu(BRUT, { categories: CATEGORIES, aujourdhui: AUJ }));
{
  const l = lectureDuRecu({ ...BRUT, lignes: [{ libelle: 'A', quantite: 1, montant: 7000 }, { libelle: 'B', quantite: 1, montant: 7000 }] }, { categories: CATEGORIES, aujourdhui: AUJ })!;
  dit('des lignes au-delà du total (14 000 pour 12 500, plus de 5 %) : on garde le total, aucune ligne, et on le dit',
    [12500, 0, true], [l.montant, l.lignes.length, /seul le total est repris/.test(l.avertissements.join(' '))]);
}
{
  const l = lectureDuRecu({ ...BRUT, montant: 10000, lignes: [{ libelle: 'A', quantite: 1, montant: 10300 }] }, { categories: CATEGORIES, aujourdhui: AUJ })!;
  dit('à 3 % au-dessus (dans la tolérance) : la ligne est lue, mais elle ne devient pas un article (la somme des articles fait loi dans la dépense)',
    [10000, 1, []], [l.montant, l.lignes.length, lignesPourLaDepense(l, compteur())]);
}
{
  const l = lectureDuRecu({ ...BRUT, montant: null }, { categories: CATEGORIES, aujourdhui: AUJ })!;
  dit('sans total lu, la somme des lignes fait le total, et on le dit', [12500, true], [l.montant, /somme des lignes/.test(l.avertissements.join(' '))]);
}
{
  const l = lectureDuRecu({ ...BRUT, date: '2026-10-20' }, { categories: CATEGORIES, aujourdhui: AUJ })!;
  dit('une date dans le futur est refusée, et dite', [null, true], [l.date, /dans le futur/.test(l.avertissements.join(' '))]);
  const l2 = lectureDuRecu({ ...BRUT, date: '18 octobre' }, { categories: CATEGORIES, aujourdhui: AUJ })!;
  dit('une date sans année est refusée, et dite', [null, true], [l2.date, /date complète/.test(l2.avertissements.join(' '))]);
}
{
  const l = lectureDuRecu({ ...BRUT, categorie: 'Courses' }, { categories: CATEGORIES, aujourdhui: AUJ })!;
  dit('une catégorie hors liste est vidée, et dite', ['', true], [l.categorie, /n’est pas une catégorie du Trône/.test(l.avertissements.join(' '))]);
}
{
  const l = lectureDuRecu({ ...BRUT, devise: 'eur' }, { categories: CATEGORIES, aujourdhui: AUJ })!;
  dit('un ticket en euros : le montant tel que lu, la devise dite', ['EUR', true], [l.devise, /en EUR/.test(l.avertissements.join(' '))]);
  const l2 = lectureDuRecu({ ...BRUT, confiance: 1.7 }, { categories: CATEGORIES, aujourdhui: AUJ })!;
  const l3 = lectureDuRecu({ ...BRUT, confiance: 'haute' }, { categories: CATEGORIES, aujourdhui: AUJ })!;
  dit('la confiance est bornée entre 0 et 1 ; un mot vaut 0', [1, 0], [l2.confiance, l3.confiance]);
}
dit('rien d utilisable : null (une réponse vide, un texte, un tableau, un objet sans total ni ligne ni enseigne)', [null, null, null, null, null],
  [lectureDuRecu(null, { categories: CATEGORIES, aujourdhui: AUJ }), lectureDuRecu('x', { categories: CATEGORIES, aujourdhui: AUJ }), lectureDuRecu([], { categories: CATEGORIES, aujourdhui: AUJ }),
    lectureDuRecu({}, { categories: CATEGORIES, aujourdhui: AUJ }), lectureDuRecu({ montant: null, date: null, fournisseur: '', categorie: null, lignes: [], moyen: null, confiance: 0 }, { categories: CATEGORIES, aujourdhui: AUJ })]);
{
  const trop = Array.from({ length: 80 }, (_, i) => ({ libelle: `A${i}`, quantite: 1, montant: 10 }));
  const l = lectureDuRecu({ ...BRUT, montant: 800, lignes: trop }, { categories: CATEGORIES, aujourdhui: AUJ })!;
  dit('les lignes sont bornées à 60', 60, l.lignes.length);
}
dit('les cases que la photo a remplies : les quatre ici ; sans total ni enseigne, deux',
  [['montant', 'date', 'fournisseur', 'categorie'], ['date', 'categorie']],
  [champsRemplis(LU), champsRemplis({ ...LU, montant: 0, fournisseur: '' })]);

/* ── 3. LES ARTICLES REPRIS EN LIGNES, ET LE FORMULAIRE ─────────────────── */
dit('les lignes deviennent des articles : quantité × prix quand la quantité n est pas 1, le total de ligne tel que lu',
  [{ id: 'l1', label: 'Beurre de karité 1 kg', amountXof: 8000, qty: 2, unitXof: 4000 }, { id: 'l2', label: 'Huile de coco', amountXof: 4500, unitXof: 4500 }],
  lignesPourLaDepense(LU, compteur()));
dit('des lignes sous le total : une ligne « Reste du ticket » porte la différence, la somme retrouve le ticket',
  [{ id: 'l1', label: 'A', amountXof: 9000, unitXof: 9000 }, { id: 'l2', label: LIBELLE_DU_RESTE, amountXof: 1000, unitXof: 1000 }],
  lignesPourLaDepense({ ...LU, montant: 10000, lignes: [{ libelle: 'A', quantite: 1, montant: 9000 }] }, compteur()));
dit('sans ligne, aucun article', [], lignesPourLaDepense({ ...LU, lignes: [] }, compteur()));
{
  const f = { amount: '', date: AUJ, label: '', category: 'Local', subcategory: 'Loyer', items: [] as { id: string; label: string; amountXof: number }[], porteur: 'Sandrine', cashbox: '' };
  dit('le formulaire reçoit le montant, la date, le bénéficiaire, la catégorie (la sous-catégorie retombe) et les articles ; porteur et caisse ne bougent pas (rien de présélectionné)',
    { amount: '12500', date: '2026-10-18', label: 'Super U Cotonou', category: 'Matières premières', subcategory: '',
      items: [{ id: 'l1', label: 'Beurre de karité 1 kg', amountXof: 8000, qty: 2, unitXof: 4000 }, { id: 'l2', label: 'Huile de coco', amountXof: 4500, unitXof: 4500 }], porteur: 'Sandrine', cashbox: '' },
    formulaireDepuisLaLecture(f, LU, CATEGORIES, compteur()));
  const vide: RecuLu = { ...LU, montant: null, date: null, fournisseur: '', categorie: '', lignes: [] };
  dit('une lecture vide n écrase rien de ce que la personne a écrit', f, formulaireDepuisLaLecture(f, vide, CATEGORIES, compteur()));
  dit('une catégorie que le Trône ne connaît plus ne se pose pas', 'Local', formulaireDepuisLaLecture(f, { ...LU, categorie: 'Jadis' }, CATEGORIES, compteur()).category);
}

/* ── 4. LA CONSIGNE ─────────────────────────────────────────────────────── */
{
  const c = consigneDuRecu({ categories: CATEGORIES, aujourdhui: AUJ });
  dit('la consigne porte les catégories du Trône (toutes), le jour, le franc, la date ISO avec l année, et dit de ne rien inventer',
    [true, true, true, true, true, true, true],
    [CATEGORIES.every((k) => c.includes(`« ${k} »`)), /Aujourd’hui : 2026-10-19/.test(c), /francs CFA/.test(c), /AAAA-MM-JJ/.test(c), /avec l’année/.test(c), /n’inventes rien/.test(c), /postérieure à aujourd’hui est une erreur/.test(c)]);
  dit('... elle refuse les noms de personnes et n en demande aucun ; l enseigne, pas la caissière ; jamais « salon », jamais de tiret long',
    [true, false, true, false, false],
    [/aucun nom de personne/.test(c), /(donne|indique|rel[eè]ve|rends|écris|lis)[^\n.]*nom (de la|du|d’une?) (caissi|client|personne)/i.test(c), /enseigne/.test(c), /salon/i.test(c), /—/.test(c)]);
  dit('... sans catégorie définie, elle le dit au lieu d en inventer', true, /aucune catégorie définie/.test(consigneDuRecu({ categories: [], aujourdhui: AUJ })));
  const s = SCHEMA_DU_RECU as { type: string; required: string[]; properties: { lignes: { items: { required: string[] } }; moyen: { enum: unknown[] } } };
  dit('le schéma : un objet, les sept champs requis, chaque ligne avec libellé, quantité, montant ; le moyen fermé',
    ['object', ['montant', 'date', 'fournisseur', 'categorie', 'lignes', 'moyen', 'confiance'], ['libelle', 'quantite', 'montant'], true],
    [s.type, s.required, s.properties.lignes.items.required, s.properties.moyen.enum.includes('espèces') && s.properties.moyen.enum.includes(null)]);
}

/* ── 5. LE CHÈQUE ───────────────────────────────────────────────────────── */
dit('la banque lue se ramène à la liste du Trône (Bank of Africa, Ecobank, SGB, UBA, BGFI) ; une inconnue reste telle quelle, hors liste ; rien, rien',
  [{ banque: 'BOA Bénin', horsListe: false }, { banque: 'Ecobank Bénin', horsListe: false }, { banque: 'Société Générale Bénin', horsListe: false }, { banque: 'Société Générale Bénin', horsListe: false },
    { banque: 'UBA Bénin', horsListe: false }, { banque: 'BGFIBank Bénin', horsListe: false }, { banque: 'Banque Rurale du Nord', horsListe: true }, { banque: '', horsListe: false }],
  [banqueReconnue('BANK OF AFRICA - BENIN', BANQUES_DU_BENIN), banqueReconnue('ecobank benin', BANQUES_DU_BENIN), banqueReconnue('Société Générale Bénin', BANQUES_DU_BENIN), banqueReconnue('SGB', BANQUES_DU_BENIN),
    banqueReconnue('UBA', BANQUES_DU_BENIN), banqueReconnue('BGFI Bank', BANQUES_DU_BENIN), banqueReconnue(' Banque Rurale  du Nord ', BANQUES_DU_BENIN), banqueReconnue(null, BANQUES_DU_BENIN)]);
{
  const o = { aujourdhui: AUJ, banques: BANQUES_DU_BENIN };
  const lu = lectureDuCheque({ banque: 'Bank of Africa', numero: '12 34567', montant: '30 000', tireur: ' K. Agossou ', date: '2026-10-18', confiance: 0.8 }, o)!;
  dit('un chèque sain : la banque de la liste, le numéro en chiffres, le montant entier, le tireur, la date',
    { banque: 'BOA Bénin', horsListe: false, numero: '1234567', montant: 30000, tireur: 'K. Agossou', date: '2026-10-18', confiance: 0.8, avertissements: [] }, lu);
  dit('... et se dit pour comparer', true, /^BOA Bénin · n° 1234567 · 30.000 F · K\. Agossou · daté du 2026-10-18$/.test(chequeDit(lu)));
  const l2 = lectureDuCheque({ banque: 'Banque Rurale', numero: '123', montant: -4, tireur: null, date: '2026-11-30', confiance: 0.5 }, o)!;
  dit('un numéro trop court est vidé et dit ; un montant négatif vaut null ; une banque hors liste est dite ; un chèque postdaté est gardé et dit',
    ['', null, 'Banque Rurale', true, '2026-11-30', true, true],
    [l2.numero, l2.montant, l2.banque, l2.horsListe, l2.date, /numéro de chèque/.test(l2.avertissements.join(' ')), /postdaté/.test(l2.avertissements.join(' '))]);
  dit('rien d utilisable : null', [null, null], [lectureDuCheque(null, o), lectureDuCheque({ banque: '', numero: '', montant: null, tireur: '', date: null, confiance: 0 }, o)]);
  const c = consigneDuCheque(o);
  dit('la consigne du chèque porte les banques du Trône, distingue le numéro du chèque du numéro de compte, la date ISO ; jamais « salon », jamais de tiret long',
    [true, true, true, false, false],
    [BANQUES_DU_BENIN.every((b) => c.includes(`« ${b} »`)), /pas le numéro de compte/.test(c), /AAAA-MM-JJ/.test(c), /salon/i.test(c), /—/.test(c)]);
  const s = SCHEMA_DU_CHEQUE as { type: string; required: string[] };
  dit('le schéma du chèque : banque, numéro, montant, tireur, date, confiance requis', ['object', ['banque', 'numero', 'montant', 'tireur', 'date', 'confiance']], [s.type, s.required]);
}

/* ── 6. LA STRUCTURE DES ÉCRANS ─────────────────────────────────────────── */
{
  const PHOTO = 'src/apps/trone/routes/finances/PhotoDuRecu.tsx';
  const DEP = 'src/apps/trone/routes/finances/Depenses.tsx';
  const TRACE = 'src/apps/trone/routes/vente/TraceDuMoyen.tsx';
  const CHQ = 'src/apps/trone/routes/vente/LireLaPhotoDuCheque.tsx';
  const PUR = 'src/shared/ia-recu-pur.ts';
  const p = sansCommentaires(lis(PHOTO));
  dit('le bouton « Photographier le reçu » se tait tant que la fonction n est pas posée ou que le département ne l ouvre pas', [true, true],
    [/const sait = useSaitIaMaison\(\);/.test(p), /if \(sait !== true \|\| !peutDemander\(role, CHANTIER_DU_RECU, acces\)\) return null;/.test(p)]);
  dit('... les crochets avant le retour anticipé', true, p.indexOf('return null;') > Math.max(p.lastIndexOf('useState<'), p.lastIndexOf('useRef<')));
  dit('... il demande à Claude par le chantier « recu », en image, avec la consigne et le schéma, et revalide la réponse', [true, true, true, true],
    [/chantier: CHANTIER_DU_RECU,\s*usage: USAGE_DU_RECU,/.test(p), /systeme: consigneDuRecu\(\{ categories, aujourdhui \}\)/.test(p), /schema: SCHEMA_DU_RECU,/.test(p), /lectureDuRecu\(r\.data, \{ categories, aujourdhui \}\)/.test(p)]);
  dit('... la photo part réduite chez Claude ET au coffre des pièces des dépenses (elle reste jointe même si Claude se tait), prise à l appareil', [true, true, true, true],
    [/photoPourClaude\(f\)/.test(p), /deposerFichier\(branchId, f, 'depense'\)/.test(p), /if \(piece\) onPhoto\(piece\);/.test(p), /capture="environment"/.test(p)]);
  dit('... le composant n inscrit RIEN : ni magasin, ni base, ni dépense', false, /setExpenses|expensesStore|useExpenses|\.set\(|supabase|\.insert\(|\.upsert\(/.test(p));
  dit('... la lecture se rend au formulaire et peut s écarter', [true, true, true], [/onLecture\(lecture\);/.test(p), /Écarter la lecture/.test(p), /onEcarter\(\);/.test(p)]);

  const d = sansCommentaires(lis(DEP));
  const montage = /<PhotoDuRecu[\s\S]*?\/>/.exec(d)?.[0] ?? '';
  dit('Dépenses monte le bouton une fois, dans la fenêtre d une nouvelle dépense, avec le rôle et les accès de la personne et les catégories du Trône', [1, true, true, true, true, true],
    [(d.match(/<PhotoDuRecu/g) ?? []).length, d.indexOf('<PhotoDuRecu') > d.indexOf("'Inscrire une dépense.'") && d.indexOf('<PhotoDuRecu') < d.indexOf('trf-pied'),
      /\{!editingId && \(\s*<PhotoDuRecu/.test(d), /role=\{monProfil\?\.role\}/.test(montage), /acces=\{mesDomaines\}/.test(montage), /categories=\{catNames\}/.test(montage)]);
  dit('... la photo se joint à la dépense (le champ `fichier`, celui de « Joindre le reçu »)', [true, true],
    [/onPhoto=\{\(pj\) => \{ setForm\(\(f\) => \(\{ \.\.\.f, fichier: pj \}\)\);/.test(montage), (d.match(/fichier: form\.fichier,/g) ?? []).length >= 2]);
  dit('... la lecture remplit le formulaire par le module pur et teinte les cases remplies ; « Écarter » rend le formulaire d avant', [true, true, true],
    [/formulaireDepuisLaLecture\(f, lu, catNames, uid\)/.test(montage), /setVenusDeLaPhoto\(new Set\(champsRemplis\(lu\)\)\)/.test(montage), /avantLaPhoto\.current = f;/.test(montage) && /if \(avant\) setForm\(\(f\) => \(\{ \.\.\.avant, fichier: f\.fichier \}\)\);/.test(montage)]);
  dit('... les quatre cases de la maquette se teintent cuivre, et chaque case touchée perd sa teinte', [true, true, true, true, 4],
    [/cuivreSi\(venusDeLaPhoto\.has\('montant'\)\)/.test(d), /cuivreSi\(venusDeLaPhoto\.has\('date'\)\)/.test(d), /cuivreSi\(venusDeLaPhoto\.has\('fournisseur'\)\)/.test(d), /cuivreSi\(venusDeLaPhoto\.has\('categorie'\)\)/.test(d),
      (d.match(/toucheLaCase\('(montant|date|fournisseur|categorie)'\)/g) ?? []).length]);
  dit('... la dépense passe par `save`, comme à la main : le statut vient du rôle (soumission pour un maître), une seule porte d écriture, le bouton ne reçoit aucun moyen d écrire', [1, 1, false],
    [(d.match(/validation: jeSoumets \? soumission\(monNom \|\| 'Sans nom', new Date\(\)\.toISOString\(\)\) : undefined,/g) ?? []).length,
      (d.match(/setExpenses\(\(prev\) => \[e, \.\.\.prev\]\)/g) ?? []).length, /setExpenses|save=/.test(montage)]);
  dit('... la teinte se remet à zéro quand la fenêtre s ouvre (nouvelle ou modifiée)', 2, (d.match(/setVenusDeLaPhoto\(new Set\(\)\); avantLaPhoto\.current = null;/g) ?? []).length);

  const t = sansCommentaires(lis(TRACE));
  dit('la trace du chèque offre « Lire la photo » dès qu une photo est prise, pour le chèque seulement', true,
    /\{famille === 'cheque' && <LireLaPhotoDuCheque chemin=\{t\.photo\.chemin\} onLu=\{poseLaLecture\} \/>\}/.test(t));
  dit('... la lecture pose la banque (hors liste : « Autre banque ») et le numéro, en cuivre jusqu au toucher, jamais « Au nom de »', [true, true, true, true, true, false],
    [/if \(lu\.banque\) \{ patch\.banque = lu\.banque; setAutreBanque\(lu\.horsListe\); \}/.test(t), /if \(lu\.numero\) patch\.numero = lu\.numero;/.test(t), /pose\(patch\);/.test(t),
      /cuivreSi\(lus\.has\('banque'\)\)/.test(t), /cuivreSi\(lus\.has\('numero'\)\)/.test(t), /auNomDe: lu\./.test(t)]);

  const c = sansCommentaires(lis(CHQ));
  dit('« Lire la photo » se tait sans fonction posée ou sans département ; crochets avant le retour', [true, true],
    [/if \(sait !== true \|\| !peutDemander\(moi\?\.role, CHANTIER_DU_RECU, acces\)\) return null;/.test(c), c.indexOf('return null;') > c.lastIndexOf('useState<')]);
  dit('... il donne à Claude le chemin de la photo déjà au coffre privé (jamais une seconde copie), par « recu », avec la consigne, le schéma, et revalide', [true, true, true, true, true],
    [/images: \[\{ coffre: COFFRE_DES_TRACES, chemin \}\]/.test(c), /chantier: CHANTIER_DU_RECU,\s*usage: USAGE_DU_RECU,/.test(c), /systeme: consigneDuCheque\(\{ aujourdhui, banques: BANQUES_DU_BENIN \}\)/.test(c), /schema: SCHEMA_DU_CHEQUE,/.test(c), /lectureDuCheque\(r\.data, \{ aujourdhui, banques: BANQUES_DU_BENIN \}\)/.test(c)]);
  dit('... et n inscrit rien lui-même', false, /\.set\(|supabase|\.insert\(|\.upsert\(|invoicesStore|deposeLaPhoto/.test(c));

  dit('aucun tiret long dans ce qui s affiche (les trois fichiers neufs et le module pur)', [false, false, false, false],
    [/—/.test(lis(PHOTO)), /—/.test(lis(CHQ)), /—/.test(sansCommentaires(lis(PUR)).replace(/^\s*\*.*$/gm, '')), /salon/i.test(lis(PHOTO) + lis(CHQ) + lis(PUR))]);
}

console.log(ko === 0 ? '\nTOUT VA BIEN : la photo remplit la dépense, et la Maison garde le dernier mot.' : `\n${ko} ÉCHEC(S)`);
if (ko) process.exitCode = 1;
