/* LE DIAGNOSTIC PHOTO DES LOCKS, ÉPROUVÉ — `node scripts/verifie-le-diagnostic-photo.mjs`.

   19 octobre 2026. Décisions de Yéman (14 octobre, confirmées « tel quel »
   le 19) : La Consultation (payée) ET Ma Couronne ; la cliente lit sa
   lecture tout de suite, « à confirmer en consultation » ; un maître relit
   dans la journée (la direction et l'Atelier) ; les produits conseillés se
   retirent à la Maison ; photos effacées à 90 jours ; Claude Sonnet, repli
   Haiku ; une peau qui inquiète = aucun produit, le médecin ou le
   dermatologue, l'équipe prévenue ; jamais un diagnostic médical ; une
   photo ne mesure pas la porosité ; une table « observation → rituel →
   produit » par défaut, à valider ; FERMÉ tant que la direction ne
   l'allume pas ; 20 $ par mois à part ; cinq lectures par dix minutes.

   Les attentes viennent de ces choix, écrites à la main, jamais tirées du
   code. Le vrai code du serveur (sa règle recopiée, ses gestes, sa vraie
   base et sa vraie porte) est rejoué sur une fausse base Supabase.
   Données d'exemple, personnes inventées. */
import { readFileSync } from 'node:fs';
import { transformSync } from 'esbuild';
import {
  CLE_DE_LA_TABLE_DU_DIAGNOSTIC, CLE_DU_COMPTEUR_DU_DIAGNOSTIC, COFFRE_DES_PHOTOS_DU_DIAGNOSTIC, GARDE_DES_PHOTOS_JOURS,
  MODELES_DU_DIAGNOSTIC, MOT_A_CONFIRMER, MOT_PEAU, MOT_RELU, MOT_SANS_LECTURE, MOTS_DES_REFUS, OCTETS_MAX_PAR_PHOTO,
  PHOTOS_MAX, PHOTOS_MIN, PHRASE_DE_L_ACCORD, PLAFOND_DU_DIAGNOSTIC_USD, PRODUITS_MAX, RITUELS_MAX, SCHEMA_DE_LA_LECTURE,
  SEAU_DU_DIAGNOSTIC, TABLE_DES_DIAGNOSTICS, TABLE_PAR_DEFAUT,
  consigneDuDiagnostic, dateDuDiagnostic, defautDeLEnvoi, diagnosticsAuxPhotosAEffacer, ecarte, formatDePhotoPermis,
  lectureDuDiagnostic, motDeLEtat, motDuRefus, motSimple, peutRelire, recommande, relecture, resumeDepuisLesObservations,
  tableEstValidee, tableValide, texteMontre, texteSansPromesse, type Catalogue, type Lecture,
} from '../src/shared/ia-diagnostic-pur';

let ko = 0;
const dit = (nom: string, attendu: unknown, obtenu: unknown) => {
  const a = JSON.stringify(attendu); const o = JSON.stringify(obtenu);
  if (a === o) console.log(`OK    ${nom}`);
  else { ko++; console.log(`ECHEC ${nom}\n       obtenu  ${o}\n       attendu ${a}`); }
};
const lis = (f: string) => readFileSync(f, 'utf8').split(String.fromCharCode(13)).join('');
/* « image/* » (un accept de fichier) n'ouvre pas un commentaire : sans ce
   garde, il avalait le JSX jusqu'au commentaire suivant, et un contrôle
   mourait en silence (vu le 19 octobre, dans La Consultation). */
const sansCommentaires = (t: string) => t.replace(/image\/\*/g, 'image/tout').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const sqlSansCommentaires = (t: string) => t.replace(/--.*$/gm, '');
const SERVEUR = 'supabase/functions/diagnostic-locks/index.ts';
const MIGRATION = 'supabase/migrations/0137_les_photos_du_diagnostic.sql';
const T0 = Date.parse('2026-10-19T10:00:00Z');
const JOUR = 86_400_000;
const iso = (ms: number) => new Date(ms).toISOString();

/* ── LE CATALOGUE D'EXEMPLE, À L'IMAGE DU VRAI ───────────────────────────
   Ses ateliers et son plateau (catalog.ts), et des rituels qui portent ou
   non les mots de la table ; certains sont exclus par sa règle (consultation,
   défaisage, Académie, Studio, archivé), même s'ils portent le bon mot. */
const CATALOGUE: Catalogue = {
  categories: [
    { id: 'atl-ii-gbeji', fon: 'GBÈJÍ™', label: 'La Vie' },
    { id: 'sinsin', fon: 'SÍNSIN™', label: 'Les reprises', parentId: 'atl-ii-gbeji' },
    { id: 'plt-05', fon: 'KLƆKLƆ™', label: 'Le Lavage Rituel' },
    { id: 'plt-10', fon: 'DÀNDÀN™', label: 'Le Soin Hydratant' },
    { id: 'plt-20', fon: 'WÈWÈ™', label: 'La Purification' },
    { id: 'plt-40', fon: 'GBÌGBÌ™ Module', label: 'Soin Reconstruction' },
    { id: 'plt-45', fon: 'GBÀTÀ™', label: 'Le Défaisage' },
    { id: 'plt-70', fon: 'SOINS ANNEXES', label: 'Beauté & Bien-être' },
    { id: 'doto', fon: 'ÐÓTÓ™', label: 'Consultation & conseil' },
    { id: 'aca-ini', fon: 'L’INITIÉE', label: 'Particuliers · entretenir ses propres locks' },
    { id: 'stu-b', fon: 'RÉVÉLER', label: 'Le Cheveu Naturel Libre' },
  ],
  services: [
    { id: 'sv-annexe', name: 'Massage du cuir chevelu', categoryId: 'plt-70' },
    { id: 'sv-sinsin', name: 'SÍNSIN · Reprise intégrale', categoryId: 'sinsin' },
    { id: 'sv-dandan', name: 'DÀNDÀN · Long', categoryId: 'plt-10' },
    { id: 'sv-kloklo', name: 'KLƆKLƆ · Lavage', categoryId: 'plt-05' },
    { id: 'sv-wewe', name: 'WÈWÈ · Détox', categoryId: 'plt-20' },
    { id: 'sv-gbigbi', name: 'GBÌGBÌ · Module', categoryId: 'plt-40' },
    { id: 'sv-defaisage', name: 'Défaisage hydratant', categoryId: 'plt-45' },
    { id: 'sv-consult', name: 'Consultation hydratant', categoryId: 'doto' },
    { id: 'sv-aca', name: 'Atelier hydratant pour soi', categoryId: 'aca-ini' },
    { id: 'sv-studio', name: 'Soin hydratant cheveu libre', categoryId: 'stu-b' },
    { id: 'sv-ancien', name: 'Ancien DÀNDÀN', categoryId: 'plt-10', archived: true },
  ],
  products: [
    { id: 'pr-huile', name: 'Huile Couronne', priceXof: 12000, stock: 4 },
    { id: 'pr-beurre', name: 'Beurre Locks', priceXof: 9500, stock: 0 },
    { id: 'pr-serum', name: 'Sérum Racines', priceXof: 14000, stock: 3 },
    { id: 'pr-shampoing', name: 'Shampoing Moringa', priceXof: 8000, stock: 2 },
    { id: 'pr-bonnet', name: 'Bonnet satin', priceXof: 5000, stock: 9 },
  ],
};
const noms = (l: { nom: string }[]) => l.map((x) => x.nom);
const LECTURE_A: Lecture = {
  observations: [{ cle: 'secheresse', zone: 'longueurs', intensite: 'forte' }, { cle: 'frisottis', zone: 'racines', intensite: 'legere' }],
  calibre: 'fin', longueur: 'mi-long', peau: [], qualite: 'bonne', resume: 'Vos longueurs semblent sèches et vos racines ont un peu de repousse.',
};

/* ── 1. LA RÈGLE ──────────────────────────────────────────────────────── */
const regle = () => {
  dit('ses choix : une à quatre photos, 90 jours, 20 $ par mois, cinq lectures par dix minutes', [1, 4, 90, 20, 5],
    [PHOTOS_MIN, PHOTOS_MAX, GARDE_DES_PHOTOS_JOURS, PLAFOND_DU_DIAGNOSTIC_USD, SEAU_DU_DIAGNOSTIC]);
  dit('Claude Sonnet lit, Haiku prend le relais', ['claude-sonnet-5-5', 'claude-haiku-5-5'], MODELES_DU_DIAGNOSTIC);
  dit('le coffre, la table, la table de la direction et le compteur à part ont leur nom',
    ['photos-du-diagnostic', 'diagnostics', 'mnd_diagnostic_table', 'mnd_ia_compteur_diagnostic'],
    [COFFRE_DES_PHOTOS_DU_DIAGNOSTIC, TABLE_DES_DIAGNOSTICS, CLE_DE_LA_TABLE_DU_DIAGNOSTIC, CLE_DU_COMPTEUR_DU_DIAGNOSTIC]);
  dit('une lecture propose, elle ne vend pas : trois rituels et deux produits au plus', [3, 2], [RITUELS_MAX, PRODUITS_MAX]);
  dit('4 Mo par photo en clair', 4_000_000, OCTETS_MAX_PAR_PHOTO);

  /* La table par défaut et celle de la direction. */
  const huit = ['secheresse', 'frisottis', 'racines-laches', 'amincissement', 'pellicules', 'residus', 'pointes-abimees', 'casse'];
  dit('la table par défaut porte une ligne par observation, dans l ordre', huit, TABLE_PAR_DEFAUT.map((l) => l.observation));
  dit('... la repousse et les racines lâches ne proposent aucun produit (elles se reprennent au fauteuil)', [[], []],
    [TABLE_PAR_DEFAUT.find((l) => l.observation === 'frisottis')?.produits, TABLE_PAR_DEFAUT.find((l) => l.observation === 'racines-laches')?.produits]);
  dit('... ses produits ne se reconnaissent que par huile, shampoing, beurre, sérum', true,
    TABLE_PAR_DEFAUT.every((l) => l.produits.every((p) => ['huile', 'shampoing', 'beurre', 'sérum'].includes(p))));
  dit('absente ou abîmée, la table de la direction retombe sur le défaut', [true, true, true],
    [null, 'n importe quoi', { lignes: 'x' }].map((b) => JSON.stringify(tableValide(b)) === JSON.stringify(TABLE_PAR_DEFAUT)));
  {
    const t = tableValide({ lignes: [{ observation: 'secheresse', rituel: 'vivivo, ab, beurre', produits: ['sérum'] }, { observation: 'inventee', rituel: ['x'] }] });
    dit('sa ligne remplace la ligne par défaut, mots nettoyés (« ab » trop court) ; une observation inventée ne compte pas',
      [8, { observation: 'secheresse', rituel: ['vivivo', 'beurre'], produits: ['sérum'] }, TABLE_PAR_DEFAUT[1]],
      [t.length, t[0], t[1]]);
    dit('... la liste nue se lit comme { lignes }', JSON.stringify(t), JSON.stringify(tableValide([{ observation: 'secheresse', rituel: 'vivivo, ab, beurre', produits: ['sérum'] }])));
  }
  dit('la table reste « à valider » tant que la direction ne l a pas validée', [false, false, true],
    [tableEstValidee(null), tableEstValidee({ lignes: [] }), tableEstValidee({ lignes: [], valideeLe: '2026-10-20T09:00:00.000Z' })]);

  /* La recommandation, depuis le catalogue vivant. */
  {
    const r = recommande(LECTURE_A, TABLE_PAR_DEFAUT, CATALOGUE);
    dit('sécheresse forte puis repousse : le soin hydratant, la reprise ; l huile en stock, pas le beurre épuisé',
      [['DÀNDÀN · Long', 'SÍNSIN · Reprise intégrale'], ['Huile Couronne'], false, MOT_A_CONFIRMER],
      [noms(r.rituels), noms(r.produits), r.peauInquiete, r.mot]);
    dit('... le prix vient du catalogue, entier', [12000], r.produits.map((p) => p.prixXof));
  }
  {
    const lourde: Lecture = { ...LECTURE_A, observations: [
      { cle: 'pellicules', zone: 'cuir-chevelu', intensite: 'legere' }, { cle: 'casse', zone: 'pointes', intensite: 'forte' },
      { cle: 'amincissement', zone: 'longueurs', intensite: 'marquee' }, { cle: 'residus', zone: 'racines', intensite: 'legere' },
      { cle: 'secheresse', zone: 'longueurs', intensite: 'legere' },
    ] };
    const r = recommande(lourde, TABLE_PAR_DEFAUT, CATALOGUE);
    dit('les plus fortes d abord ; trois rituels, deux produits, chacun une fois',
      [['GBÌGBÌ · Module', 'KLƆKLƆ · Lavage', 'WÈWÈ · Détox'], ['Huile Couronne', 'Sérum Racines']], [noms(r.rituels), noms(r.produits).sort()]);
  }
  {
    const r = recommande({ ...LECTURE_A, observations: [{ cle: 'secheresse', zone: 'longueurs', intensite: 'forte' }] }, TABLE_PAR_DEFAUT, CATALOGUE);
    dit('jamais une consultation, un défaisage, l Académie, le Studio ni un rituel archivé, même au bon mot', ['DÀNDÀN · Long'], noms(r.rituels));
  }
  {
    const t = tableValide({ lignes: [{ observation: 'pellicules', rituel: ['kloklo'], produits: [] }] });
    const r = recommande({ ...LECTURE_A, observations: [{ cle: 'pellicules', zone: 'cuir-chevelu', intensite: 'forte' }] }, t, CATALOGUE);
    dit('la ligne de la direction fait foi ; « kloklo » reconnaît KLƆKLƆ™ ; une case produit vide n en propose aucun',
      [['KLƆKLƆ · Lavage'], []], [noms(r.rituels), noms(r.produits)]);
    dit('... les lettres du fon se lisent', ['kloklo', 'dandan', 'wewe'], [motSimple('KLƆKLƆ™').replace('™', ''), motSimple('DÀNDÀN'), motSimple('WÈWÈ')]);
  }
  {
    const r = recommande({ ...LECTURE_A, peau: ['rougeur'] }, TABLE_PAR_DEFAUT, CATALOGUE);
    dit('UNE PEAU QUI INQUIÈTE : aucun rituel, aucun produit, le mot du médecin', [[], [], true, MOT_PEAU], [r.rituels, r.produits, r.peauInquiete, r.mot]);
    dit('... le mot dit médecin ou dermatologue, et que l équipe est prévenue', [true, true, true], [/médecin/.test(MOT_PEAU), /dermatologue/.test(MOT_PEAU), /équipe est prévenue/.test(MOT_PEAU)]);
  }

  /* La lecture de Claude, avant qu'on y croie. */
  dit('ni objet, ni liste d observations : aucune lecture', [null, null, null, null],
    [lectureDuDiagnostic(null), lectureDuDiagnostic('Vos locks sont sèches.'), lectureDuDiagnostic([]), lectureDuDiagnostic({ observations: 'x' })]);
  dit('ce qui sort des listes fermées tombe ; l inconnu devient « incertain » ; un drapeau inventé ne compte pas ; un doublon non plus',
    { observations: [{ cle: 'secheresse', zone: 'longueurs', intensite: 'forte' }], calibre: 'incertain', longueur: 'long', peau: ['rougeur'], qualite: 'moyenne', resume: '' },
    lectureDuDiagnostic({
      observations: [{ cle: 'secheresse', zone: 'longueurs', intensite: 'forte' }, { cle: 'teigne', zone: 'racines', intensite: 'forte' },
        { cle: 'secheresse', zone: 'longueurs', intensite: 'legere' }, { cle: 'casse', zone: 'ailleurs', intensite: 'forte' }, null],
      calibre: 'enorme', longueur: 'long', peau: ['rougeur', 'cancer', 'rougeur'], qualite: 'parfaite', resume: 42,
    }));
  {
    const toutes = ['secheresse', 'frisottis', 'casse', 'residus'].flatMap((cle) => ['racines', 'longueurs', 'pointes', 'cuir-chevelu'].map((zone) => ({ cle, zone, intensite: 'legere' })));
    dit('huit observations au plus', 8, lectureDuDiagnostic({ observations: toutes })?.observations.length);
  }

  /* Ce que la cliente lit. */
  dit('le texte de Claude passe, et finit toujours par « À confirmer en consultation. »',
    'Vos longueurs semblent sèches et vos racines ont un peu de repousse. À confirmer en consultation.', texteSansPromesse(LECTURE_A.resume));
  dit('un prix, « salon », une maladie, un traitement : rien ne passe', ['', '', '', '', '', ''],
    [texteSansPromesse('Un rituel à 15 000 F suffira.'), texteSansPromesse('Comptez 20000 FCFA.'), texteSansPromesse('Passez au salon.'),
      texteSansPromesse('On dirait de la teigne.'), texteSansPromesse('Un traitement serait utile.'), texteSansPromesse('Une alopécie débutante.')]);
  dit('une promesse ou la porosité : la phrase tombe, le reste passe',
    ['Vos locks sont sèches. À confirmer en consultation.', 'Les pointes semblent abîmées. À confirmer en consultation.'],
    [texteSansPromesse('Vos locks sont sèches. Nous garantissons un résultat en 3 semaines.'), texteSansPromesse('La porosité est forte. Les pointes semblent abîmées.')]);
  dit('le tiret long devient une virgule ; une fin déjà dite ne se répète pas',
    ['Vos racines, un peu lâches. À confirmer en consultation.', 'Locks sèches. À confirmer en consultation.'],
    [texteSansPromesse('Vos racines — un peu lâches'), texteSansPromesse('Locks sèches. À confirmer en consultation.')]);
  dit('le résumé composé des listes, quand le texte ne passe pas',
    'Vos photos montrent : sécheresse forte sur les longueurs, frisottis et repousse légère sur les racines. Calibre estimé : fin. Longueur estimée : mi-long. À confirmer en consultation.',
    resumeDepuisLesObservations(LECTURE_A));
  dit('... une peau qui inquiète : le mot du médecin seul ; une photo insuffisante : la reprendre', [MOT_PEAU, true],
    [resumeDepuisLesObservations({ ...LECTURE_A, peau: ['plaie'] }), /reprenez-les à la lumière du jour/.test(resumeDepuisLesObservations({ ...LECTURE_A, observations: [], qualite: 'insuffisante' }))]);
  dit('sous la lecture : « à confirmer », puis « relu par la Maison » ; la peau garde le mot du médecin',
    ['À confirmer en consultation.', 'Relu par la Maison.', MOT_PEAU, 'La Maison relit vos photos et vous répond dans la journée.'],
    [motDeLEtat('a-relire'), motDeLEtat('relu'), motDeLEtat('relu', true), MOT_SANS_LECTURE]);
  dit('relu et corrigé : elle lit le mot du maître ; pas encore relu, le texte', ['Le mot du maître', 'Le texte'],
    [texteMontre({ etat: 'relu', texte: 'Le texte', correction: 'Le mot du maître' }), texteMontre({ etat: 'a-relire', texte: 'Le texte', correction: 'Le mot du maître' })]);

  /* La consigne et la forme. */
  {
    const c = consigneDuDiagnostic({ appel: 'Awa D.', nbPhotos: 3 });
    dit('la consigne : jamais de diagnostic médical, ni la porosité, ni un prix, ni « salon » ; le médecin pour la peau ; son prénom et 3 photos',
      [true, true, true, true, true, true, true],
      [/JAMAIS de diagnostic médical/.test(c), /ne mesure pas la porosité/.test(c), /JAMAIS de prix/.test(c), /jamais « salon »/.test(c),
        /médecin ou un dermatologue/.test(c), /Awa D\./.test(c), /3 photo\(s\)/.test(c)]);
  }
  {
    const s = SCHEMA_DE_LA_LECTURE as { additionalProperties: boolean; required: string[]; properties: Record<string, { enum?: string[]; maxItems?: number; items?: { additionalProperties?: boolean; enum?: string[]; properties?: Record<string, { enum: string[] }> } }> };
    const o = s.properties.observations;
    dit('la forme est fermée : rien en plus, six champs, des listes fermées', [false, ['observations', 'calibre', 'longueur', 'peau', 'qualite', 'resume'], false, 8],
      [s.additionalProperties, s.required, o.items?.additionalProperties, o.maxItems]);
    dit('... les observations, zones, intensités, calibres, longueurs, drapeaux et qualités de sa décision',
      [['secheresse', 'frisottis', 'racines-laches', 'amincissement', 'pellicules', 'residus', 'pointes-abimees', 'casse'],
        ['racines', 'longueurs', 'pointes', 'cuir-chevelu'], ['legere', 'marquee', 'forte'], ['micro', 'fin', 'moyen', 'epais', 'incertain'],
        ['court', 'mi-long', 'long', 'incertain'], ['rougeur', 'plaie', 'croutes', 'chute-en-plaques'], ['bonne', 'moyenne', 'insuffisante']],
      [o.items?.properties?.cle.enum, o.items?.properties?.zone.enum, o.items?.properties?.intensite.enum, s.properties.calibre.enum,
        s.properties.longueur.enum, s.properties.peau.items?.enum, s.properties.qualite.enum]);
  }

  /* Qui relit, ce qui part, ce qui s'efface. */
  {
    const cas: [string | undefined, Record<string, boolean>][] = [['souverain', {}], ['gerant', {}], ['maitre', {}], ['maitre', { 'dept-atelier': true }],
      ['maitre', { 'dept-clientele': true }], ['maitre', { '/consultations': true }], [undefined, { 'dept-atelier': true }]];
    dit('qui relit : la direction et l Atelier, personne d autre', [true, true, false, true, false, false, false], cas.map(([r, a]) => peutRelire(r, a)));
  }
  dit('JPEG, PNG, WebP se gardent ; le reste non', [true, true, true, false, false, false],
    ['image/jpeg', 'image/png; q=1', 'IMAGE/WEBP', 'image/gif', 'image/heic', 'application/pdf'].map(formatDePhotoPermis));
  dit('rien ne part sans une photo, au-delà de quatre, ni sans l accord coché', ['Choisissez au moins une photo.', 'Quatre photos au plus.', 'Cochez l’accord pour que la Maison garde vos photos.', null],
    [defautDeLEnvoi(0, true), defautDeLEnvoi(5, true), defautDeLEnvoi(2, false), defautDeLEnvoi(2, true)]);
  dit('l accord, mot pour mot', 'J’accepte que la Maison garde ces photos 90 jours pour relire ma lecture.', PHRASE_DE_L_ACCORD);
  {
    const l = [
      { id: 'vieux', cree_le: iso(T0 - 91 * JOUR), data: { photos: ['a'] } },
      { id: 'jeune', cree_le: iso(T0 - 89 * JOUR), data: { photos: ['b'] } },
      { id: 'deja', cree_le: iso(T0 - 120 * JOUR), data: { photos: ['c'], photosEffaceesLe: '2026-07-01' } },
      { id: 'vide', cree_le: iso(T0 - 120 * JOUR), data: { photos: [] } },
      { id: 'sans-date', cree_le: 'hier', data: { photos: ['d'] } },
    ];
    dit('à 90 jours, les photos partent ; avant, non ; une fois effacées, plus jamais', ['vieux'], diagnosticsAuxPhotosAEffacer(l, T0).map((d) => d.id));
  }
  dit('les refus se disent sans parler de Claude, d argent, de « salon » ni de tiret long', [],
    Object.entries(MOTS_DES_REFUS).filter(([, m]) => /claude|anthropic|\$|dollar|\bsalon|—/i.test(m)).map(([k]) => k));
  dit('... chaque refus de la fonction a son mot, l inconnu le mot d erreur', [true, MOTS_DES_REFUS.erreur],
    [['ferme', 'porte', 'personnel', 'consentement', 'photos', 'format', 'too_large', 'budget', 'rate_limited', 'reseau', 'erreur'].every((k) => !!MOTS_DES_REFUS[k]), motDuRefus('inconnu')]);
  {
    const L = lectureDuDiagnostic(LECTURE_A);
    const data = { texte: 'Le texte', lecture: L, correction: 'un vieux mot', recommandation: { rituels: [{ id: 'a', nom: 'A' }, { id: 'b', nom: 'B' }], produits: [{ id: 'p', nom: 'P', prixXof: 1 }, { id: 'q', nom: 'Q', prixXof: 2 }], peauInquiete: false, mot: 'm' } };
    const r = relecture(data, { correction: 'Vos locks — sèches.', rituelsRetires: ['b'], produitsRetires: ['p'], par: 'u-maitre', leIso: '2026-10-19T12:00:00.000Z' });
    dit('la relecture : « relu », qui et quand, le mot du maître sans tiret long, ce qu il retire n est plus proposé, la lecture de Claude intacte',
      ['relu', 'u-maitre', '2026-10-19T12:00:00.000Z', 'Vos locks, sèches.', ['a'], ['q'], true, 'Le texte'],
      [r.etat, r.relu_par, r.relu_le, r.data.correction, r.data.recommandation?.rituels.map((x) => x.id), r.data.recommandation?.produits.map((x) => x.id), JSON.stringify(r.data.lecture) === JSON.stringify(L), r.data.texte]);
    dit('... sans mot, l ancien mot ne reste pas', false, 'correction' in relecture(data, { par: 'u', leIso: 'x' }).data);
    dit('écarter : « fermé », qui et quand', { etat: 'ferme', relu_par: 'u', relu_le: 'x' }, ecarte('u', 'x'));
  }
  dit('une date de cliente porte toujours l année, à l heure de Cotonou', ['19 octobre 2026', '20 octobre 2026', ''],
    [dateDuDiagnostic('2026-10-19T10:00:00Z'), dateDuDiagnostic('2026-10-19T23:30:00Z'), dateDuDiagnostic('hier')]);
};

/* ── 2. LES COPIES DANS LA FONCTION ──────────────────────────────────── */
const bloc = (t: string) => { const m = /\/\* ⟨diagnostic-locks⟩ \*\/[\s\S]*?\/\* ⟨\/diagnostic-locks⟩ \*\//.exec(t); return m ? m[0] : 'absent'; };
function morceau(src: string, debut: string, fin: string): string {
  const i = src.indexOf(debut);
  const k = src.indexOf(fin, i + debut.length);
  if (i < 0 || k < 0) throw new Error(`morceau introuvable : ${debut}`);
  return src.slice(i, k + fin.length);
}
const copieDe = (src: string, original: string) => {
  const debut = `// ── DÉBUT DE LA COPIE : ${original} ──`;
  const i = src.indexOf(debut);
  const k = src.indexOf('// ── FIN DE LA COPIE ──', i);
  return i < 0 || k < 0 ? 'absente' : src.slice(i + debut.length, k).trim();
};
const copies = () => {
  const src = lis(SERVEUR);
  dit('la fonction porte le bloc de la règle, caractère pour caractère', bloc(lis('src/shared/ia-diagnostic-pur.ts')), bloc(src));
  for (const f of ['src/shared/ia-budget-pur.ts', 'src/shared/ia-anonymise-pur.ts']) {
    dit(`la fonction porte ${f}, sans ses export`, lis(f).replace(/^export /gm, '').trim(), copieDe(src, f));
  }
};

/* ── 3. LE VRAI CODE DU SERVEUR, SUR UNE FAUSSE BASE ─────────────────── */
type Ligne = Record<string, unknown>;
type Tables = Record<string, Ligne[]>;
/** Une fausse base Supabase : les filtres que la fonction emploie, un
    coffre, des comptes, et un journal des gestes dans l'ordre. */
function fausseBase(tables: Tables, comptes: Record<string, string>, coffre: Map<string, string>, pannes: { uploadsPermis?: number; insertRefuse?: boolean } = {}) {
  const journal: string[] = [];
  const valeur = (r: Ligne, col: string): unknown => {
    const m = /^(\w+)->>(\w+)$/.exec(col);
    if (!m) return r[col];
    const v = (r[m[1]] as Record<string, unknown> | undefined)?.[m[2]];
    return v === undefined || v === null ? null : String(v);
  };
  const from = (nom: string) => {
    const lignes = (tables[nom] ??= []);
    const filtres: ((r: Ligne) => boolean)[] = [];
    let tete = false; let borne = Infinity; let op: 'select' | 'update' = 'select'; let champs: Ligne = {};
    const choisies = () => lignes.filter((r) => filtres.every((f) => f(r)));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const q: any = {
      select(_c?: string, o?: { head?: boolean }) { if (o?.head) tete = true; return q; },
      eq(c: string, v: unknown) { filtres.push((r) => valeur(r, c) === v); return q; },
      gte(c: string, v: string) { filtres.push((r) => String(valeur(r, c) ?? '') >= v); return q; },
      lt(c: string, v: string) { filtres.push((r) => String(valeur(r, c) ?? '') < v); return q; },
      is(c: string, v: unknown) { filtres.push((r) => (valeur(r, c) ?? null) === v); return q; },
      in(c: string, vs: unknown[]) { filtres.push((r) => vs.includes(valeur(r, c))); return q; },
      order() { return q; },
      limit(n: number) { borne = n; return q; },
      maybeSingle() { return Promise.resolve({ data: structuredClone(choisies()[0] ?? null), error: null }); },
      insert(l: Ligne) {
        journal.push(`insert ${nom}`);
        if (nom === 'diagnostics' && pannes.insertRefuse) return Promise.resolve({ error: { message: 'refus' } });
        lignes.push({ at: new Date().toISOString(), ...structuredClone(l) });
        return Promise.resolve({ error: null });
      },
      upsert(l: Ligne) {
        journal.push(`upsert ${nom} ${String(l.key ?? '')}`);
        const i = lignes.findIndex((r) => r.key === l.key);
        if (i >= 0) lignes[i] = structuredClone(l); else lignes.push(structuredClone(l));
        return Promise.resolve({ error: null });
      },
      update(c: Ligne) { op = 'update'; champs = c; return q; },
      then(ok: (v: unknown) => unknown, nok: (e: unknown) => unknown) {
        if (op === 'update') {
          journal.push(`update ${nom}`);
          for (const r of choisies()) Object.assign(r, structuredClone(champs));
          return Promise.resolve({ error: null }).then(ok, nok);
        }
        const rs = choisies().slice(0, borne);
        return Promise.resolve(tete ? { count: rs.length, data: null, error: null } : { data: structuredClone(rs), error: null }).then(ok, nok);
      },
    };
    return q;
  };
  const admin = {
    from,
    auth: { getUser: async (jwt: string) => (comptes[jwt] ? { data: { user: { id: comptes[jwt] } }, error: null } : { data: { user: null }, error: { message: 'invalid JWT' } }) },
    storage: {
      from: (seau: string) => ({
        upload: async (chemin: string, octets: Uint8Array, o: { contentType: string }) => {
          journal.push(`upload ${seau}/${chemin}`);
          if (pannes.uploadsPermis !== undefined) { if (pannes.uploadsPermis <= 0) return { error: { message: 'coffre plein' } }; pannes.uploadsPermis -= 1; }
          coffre.set(`${seau}/${chemin}`, `${o.contentType} ${octets.length}`);
          return { error: null };
        },
        remove: async (chemins: string[]) => { journal.push(`remove ${chemins.join(',')}`); for (const c of chemins) coffre.delete(`${seau}/${c}`); return { error: null }; },
      }),
    },
  };
  return { admin, journal };
}

type Rendu = [number, Record<string, unknown>];
type Serveur = {
  lirePhotos: (o: unknown, r: unknown) => Promise<Rendu>; lire: (o: unknown, r: unknown) => Promise<Rendu>;
  etatDuDiagnostic: (o: unknown) => Promise<Rendu>; base: unknown; porte: (r: unknown) => Promise<unknown>;
  allowRate: (ip: string, seau: string, plafond: number) => Promise<boolean>; coutDeLAppel: (m: string, e: number, s: number) => number;
};
/** Le vrai code : les copies, la règle, les gestes, la vraie base et la
    vraie porte, la limite de débit. Rien d'autre (ni Deno, ni le réseau). */
function serveur(admin: unknown): Serveur {
  const src = lis(SERVEUR);
  const code = [
    copieDe(src, 'src/shared/ia-budget-pur.ts'),
    copieDe(src, 'src/shared/ia-anonymise-pur.ts'),
    bloc(src).replace(/^export /gm, ''),
    morceau(src, '// ── DEBUT diagnostic', '// ── FIN diagnostic'),
    morceau(src, 'async function allowRate(', '\n}\n'),
    morceau(src, '/* ══ LES VRAIS OUTILS', '/** QUI SONNE').slice(0, -'/** QUI SONNE'.length),
  ].join('\n');
  const js = transformSync(code, { loader: 'ts', format: 'cjs' }).code;
  // eslint-disable-next-line no-new-func
  return new Function('admin', `${js}; return { lirePhotos, lire, etatDuDiagnostic, base, porte, allowRate, coutDeLAppel };`)(admin) as Serveur;
}

const PHOTO = { base64: Buffer.alloc(600, 1).toString('base64'), mime: 'image/jpeg' };
const ANON = 'cle.publique.anon';
const COMPTES = { 'jwt.awa.x': 'u-awa', 'jwt.staff.x': 'u-staff', 'jwt.inconnue.x': 'u-x', 'jwt.archivee.x': 'u-arch' };
type Reponse = { brut: unknown; modele: string; entree: number; sortie: number } | null;

function monde(o: { allume?: boolean; table?: unknown; compteur?: unknown; diagnostics?: Ligne[]; claude?: Reponse | 'panne'; pannes?: { uploadsPermis?: number; insertRefuse?: boolean } } = {}) {
  const tables: Tables = {
    documents: [
      { key: 'mnd_auto_config', data: { momoLink: '', ...(o.allume === undefined ? { diagnosticPhoto: true } : o.allume === null ? {} : { diagnosticPhoto: o.allume }) } },
      ...(o.table !== undefined ? [{ key: 'mnd_diagnostic_table', data: o.table }] : []),
      ...(o.compteur !== undefined ? [{ key: 'mnd_ia_compteur_diagnostic', data: o.compteur }] : []),
    ],
    staff: [{ user_id: 'u-staff', role: 'maitre' }],
    clients: [
      { id: 'c-awa', branch_id: 'br-cot', data: { name: 'Awa Dossou', authUserId: 'u-awa', branchId: 'br-cot', phone: '+2290197000000' } },
      { id: 'c-zoe', branch_id: 'br-cot', data: { name: 'Zoé Kpade', authUserId: 'u-arch', archived: true } },
    ],
    payments: [
      { id: 'tx-ok', branch_id: 'br-cot', data: { partnerId: 'cons-1', status: 'success', branchId: 'br-cot' } },
      { id: 'tx-echec', branch_id: 'br-cot', data: { partnerId: 'cons-2', status: 'failed' } },
    ],
    consultations_queue: [{ id: 'cons-1', data: { client: { name: 'Mariam Bello', phone: '+229 01 97 11 22 33' } } }],
    catalog_services: CATALOGUE.services.map(({ id, ...d }) => ({ id, data: d })),
    catalog_categories: CATALOGUE.categories.map(({ id, ...d }) => ({ id, data: d })),
    catalog_products: CATALOGUE.products.map(({ id, ...d }) => ({ id, data: d })),
    diagnostics: structuredClone(o.diagnostics ?? []),
    edge_rate_limits: [],
  };
  const coffre = new Map<string, string>();
  for (const d of o.diagnostics ?? []) for (const c of ((d.data as { photos?: string[] })?.photos ?? [])) coffre.set(`photos-du-diagnostic/${c}`, 'image/jpeg');
  const { admin, journal } = fausseBase(tables, COMPTES, coffre, o.pannes ?? {});
  const s = serveur(admin);
  const claudes: { consigne: string; n: number; schema: unknown }[] = [];
  const alertes: { titre: string; corps: string; diagnosticId: string; urgent: boolean }[] = [];
  const fonds: Promise<unknown>[] = [];
  let n = 0;
  const reponse: Reponse | 'panne' = o.claude === undefined ? { brut: LECTURE_A, modele: 'claude-sonnet-5-5', entree: 3000, sortie: 500 } : o.claude;
  const outils = {
    base: s.base,
    maintenant: () => T0,
    nouvelId: () => `diag-${++n}`,
    porte: s.porte,
    claude: async (consigne: string, photos: unknown[], schema: unknown) => {
      journal.push('claude');
      claudes.push({ consigne, n: photos.length, schema });
      if (reponse === 'panne') throw new Error('réseau');
      return reponse;
    },
    alerte: async (a: { titre: string; corps: string; diagnosticId: string; urgent: boolean }) => { alertes.push(a); return 1; },
    fond: (p: Promise<unknown>) => { fonds.push(p); },
  };
  const envoie = async (r: { jwt?: string; body: Record<string, unknown> }) => {
    const rendu = await s.lirePhotos(outils, { jwt: r.jwt ?? '', body: r.body });
    await Promise.all(fonds);
    return rendu;
  };
  const etat = async () => { const rendu = await s.etatDuDiagnostic(outils); await Promise.all(fonds); return rendu; };
  return { s, outils, tables, coffre, journal, claudes, alertes, envoie, etat };
}
const AWA = (body: Record<string, unknown> = {}) => ({ jwt: 'jwt.awa.x', body: { consentement: 'oui', photos: [PHOTO, PHOTO], ...body } });
const MARIAM = (body: Record<string, unknown> = {}) => ({ jwt: ANON, body: { consentement: 'oui', photos: [PHOTO], consultationId: 'cons-1', transactionId: 'tx-ok', ...body } });
const diag = (m: ReturnType<typeof monde>, id = 'diag-1') => m.tables.diagnostics.find((d) => d.id === id) as (Ligne & { data: Record<string, unknown> }) | undefined;

const essais = async () => {
  /* L'interrupteur. */
  {
    const m = monde({ allume: false });
    const r = await m.envoie(AWA());
    dit('FERMÉ tant que la direction ne l allume pas : 403 « ferme », rien au coffre, Claude jamais appelé', [403, 'ferme', [], 0],
      [r[0], r[1].error, m.journal.filter((j) => j.startsWith('upload')), m.claudes.length]);
    dit('... absent du document, il est éteint aussi ; « etat » le dit', [[403, 'ferme'], false],
      [await monde({ allume: null }).envoie(AWA()).then(([a, b]) => [a, b.error]), (await m.s.etatDuDiagnostic(m.outils))[1].ouvert]);
    const m2 = monde();
    dit('allumé, « etat » répond ouvert, avec la version', [200, true, '2026-10-19-a'], await m2.s.etatDuDiagnostic(m2.outils).then(([a, b]) => [a, b.ouvert, b.version]));
  }

  /* La porte. */
  {
    const cas: [string, { jwt?: string; body: Record<string, unknown> }, [number, unknown]][] = [
      ['sans session ni consultation', { jwt: '', body: { consentement: 'oui', photos: [PHOTO] } }, [403, 'porte']],
      ['le personnel (sa session du Trône)', { jwt: 'jwt.staff.x', body: { consentement: 'oui', photos: [PHOTO] } }, [403, 'personnel']],
      ['une consultation payée (clé publique)', MARIAM(), [200, undefined]],
      ['une transaction échouée', MARIAM({ consultationId: 'cons-2', transactionId: 'tx-echec' }), [403, 'porte']],
      ['une transaction d une autre consultation', MARIAM({ transactionId: 'tx-echec' }), [403, 'porte']],
      ['une transaction inconnue', MARIAM({ transactionId: 'tx-inventee' }), [403, 'porte']],
      ['une session Ma Couronne', AWA(), [200, undefined]],
      ['une session sans fiche, seule', { jwt: 'jwt.inconnue.x', body: { consentement: 'oui', photos: [PHOTO] } }, [403, 'porte']],
      ['une session sans fiche, mais la consultation payée', MARIAM({}), [200, undefined]],
      ['une fiche archivée', { jwt: 'jwt.archivee.x', body: { consentement: 'oui', photos: [PHOTO] } }, [403, 'porte']],
    ];
    cas[8][1].jwt = 'jwt.inconnue.x';
    const rendus = [];
    for (const [, req] of cas) rendus.push(await monde().envoie(req).then(([a, b]) => [a, b.error]));
    dit('la porte : une session Ma Couronne ou une consultation payée, jamais le personnel ni un paiement qui n est pas le sien',
      cas.map(([nom, , att]) => `${nom} → ${JSON.stringify(att)}`), cas.map(([nom], i) => `${nom} → ${JSON.stringify(rendus[i])}`));
  }

  /* L'accord et les photos. */
  {
    const cas: [string, Record<string, unknown>, [number, string]][] = [
      ['sans l accord', { consentement: undefined }, [400, 'consentement']],
      ['un accord qui n est pas « oui »', { consentement: true }, [400, 'consentement']],
      ['aucune photo', { photos: [] }, [400, 'photos']],
      ['cinq photos', { photos: [PHOTO, PHOTO, PHOTO, PHOTO, PHOTO] }, [400, 'photos']],
      ['un GIF', { photos: [{ ...PHOTO, mime: 'image/gif' }] }, [415, 'format']],
      ['une photo vide', { photos: [{ base64: 'abc', mime: 'image/png' }] }, [400, 'photos']],
      ['une photo trop lourde', { photos: [{ base64: 'A'.repeat(5_500_000), mime: 'image/jpeg' }] }, [413, 'too_large']],
    ];
    const rendus = [];
    for (const [, b] of cas) { const m = monde(); rendus.push(await m.envoie(AWA(b)).then(([a, x]) => [a, x.error, m.journal.filter((j) => j.startsWith('upload')).length])); }
    dit('rien ne part sans l accord « oui », ni hors d une à quatre photos JPEG, PNG, WebP de 4 Mo ; rien au coffre',
      cas.map(([nom, , a]) => `${nom} → ${JSON.stringify([...a, 0])}`), cas.map(([nom], i) => `${nom} → ${JSON.stringify(rendus[i])}`));
    const quatre = monde();
    dit('quatre photos passent', 200, (await quatre.envoie(AWA({ photos: [PHOTO, PHOTO, PHOTO, PHOTO] })))[0]);
  }

  /* Le plafond, à part : 20 $ par mois. */
  {
    const plein = monde({ compteur: { '2026-10': { usd: 20, appels: 900, entree: 1, sortie: 1 } } });
    const r = await plein.envoie(AWA());
    dit('à 20 $ ce mois-ci : 429 « budget », rien au coffre, Claude jamais appelé', [429, 'budget', 0, 0],
      [r[0], r[1].error, plein.journal.filter((j) => j.startsWith('upload')).length, plein.claudes.length]);
    dit('à 15 $ (au-delà du plafond des agents) et le mois d après un mois plein : la lecture part', [200, 200],
      [(await monde({ compteur: { '2026-10': { usd: 15, appels: 1, entree: 1, sortie: 1 } } }).envoie(AWA()))[0],
        (await monde({ compteur: { '2026-09': { usd: 50, appels: 1, entree: 1, sortie: 1 } } }).envoie(AWA()))[0]]);
  }

  /* Une lecture, de bout en bout (Ma Couronne). */
  {
    const m = monde({ diagnostics: [] });
    const [st, r] = await m.envoie(AWA());
    dit('les photos au coffre AVANT Claude, puis la ligne', ['upload photos-du-diagnostic/br-cot/diag-1/1.jpg', 'upload photos-du-diagnostic/br-cot/diag-1/2.jpg', 'claude', 'insert diagnostics'],
      m.journal.filter((j) => /^(upload|claude|insert diagnostics)/.test(j)));
    dit('... gardées en JPEG dans le coffre privé', ['photos-du-diagnostic/br-cot/diag-1/1.jpg', 'photos-du-diagnostic/br-cot/diag-1/2.jpg'], [...m.coffre.keys()]);
    const c = m.claudes[0]?.consigne ?? '';
    dit('Claude : la consigne avec « Awa D. », jamais son nom ni son numéro ; deux photos ; la forme fermée', [true, false, false, 2, true],
      [/Awa D\./.test(c), /Dossou/.test(c), /97 00 00 00|2290197/.test(c), m.claudes[0]?.n, JSON.stringify(m.claudes[0]?.schema) === JSON.stringify(SCHEMA_DE_LA_LECTURE)]);
    const d = diag(m);
    dit('la ligne : « à relire », Ma Couronne, sa fiche, sa branche, ses photos, l heure de son accord', ['a-relire', 'couronne', 'c-awa', 'br-cot', ['br-cot/diag-1/1.jpg', 'br-cot/diag-1/2.jpg'], iso(T0), iso(T0)],
      [d?.etat, d?.source, d?.client_id, d?.branch_id, d?.data.photos, d?.data.consentementLe, d?.cree_le]);
    const reco = d?.data.recommandation as { rituels: { nom: string }[]; produits: { nom: string }[] } | undefined;
    dit('... la recommandation du catalogue vivant, la table par défaut', [['DÀNDÀN · Long', 'SÍNSIN · Reprise intégrale'], ['Huile Couronne']],
      [reco ? noms(reco.rituels) : null, reco ? noms(reco.produits) : null]);
    dit('... le texte de Claude, terminé par « À confirmer en consultation. »', 'Vos longueurs semblent sèches et vos racines ont un peu de repousse. À confirmer en consultation.', d?.data.texte);
    dit('le compteur à part se tient : 3 000 jetons lus, 500 écrits au prix de Sonnet', [{ '2026-10': { usd: 0.0165, appels: 1, entree: 3000, sortie: 500 } }, 0.0165],
      [m.tables.documents.find((x) => x.key === 'mnd_ia_compteur_diagnostic')?.data, d?.data.coutUsd]);
    dit('l équipe l apprend : à relire, « Awa D. · 2 photos », pas d urgence', [1, 'Diagnostic photo à relire', 'Awa D. · 2 photos', false, 'diag-1'],
      [m.alertes.length, m.alertes[0]?.titre, m.alertes[0]?.corps, m.alertes[0]?.urgent, m.alertes[0]?.diagnosticId]);
    dit('elle lit tout de suite sa lecture, « à confirmer en consultation »', [200, 'diag-1', 'a-relire', MOT_A_CONFIRMER, true],
      [st, r.id, r.etat, r.mot, typeof r.texte === 'string' && (r.texte as string).length > 20]);
    dit('... la phrase brute de Claude ne voyage pas jusqu à son téléphone ; le Trône la garde', ['', LECTURE_A.resume],
      [(r.lecture as Lecture | null)?.resume, (d?.data.lecture as Lecture | undefined)?.resume]);
  }
  {
    const m = monde();
    await m.envoie(MARIAM());
    const d = diag(m);
    dit('La Consultation : sa consultation, sa branche, pas de fiche ; « Mariam B. » chez Claude, jamais son numéro', ['consultation', 'cons-1', null, 'br-cot', true, false],
      [d?.source, d?.data.consultationId, d?.client_id, d?.branch_id, /Mariam B\./.test(m.claudes[0]?.consigne ?? ''), /Bello|97 11 22 33/.test(m.claudes[0]?.consigne ?? '')]);
  }

  /* La peau, et Claude qui ne lit pas. */
  {
    const m = monde({ claude: { brut: { ...LECTURE_A, peau: ['croutes'] }, modele: 'claude-sonnet-5-5', entree: 100, sortie: 10 } });
    const [, r] = await m.envoie(AWA());
    const reco = diag(m)?.data.recommandation as { rituels: unknown[]; produits: unknown[]; peauInquiete: boolean } | undefined;
    dit('une peau qui inquiète : aucun produit ni rituel, le mot du médecin, l équipe prévenue en urgence',
      [[], [], true, MOT_PEAU, true, 'Diagnostic photo · une peau à regarder'],
      [reco?.rituels, reco?.produits, reco?.peauInquiete, r.mot, m.alertes[0]?.urgent, m.alertes[0]?.titre]);
  }
  {
    const m = monde({ claude: { brut: 'Je vois des locks.', modele: 'claude-sonnet-5-5', entree: 100, sortie: 10 } });
    const [st, r] = await m.envoie(AWA());
    const d = diag(m);
    dit('Claude rend n importe quoi : aucune lecture, la Maison relit à la main, la ligne et les photos restent ; le coût est compté',
      [200, null, true, MOT_SANS_LECTURE, true, 1, 2],
      [st, r.lecture, d?.data.sansLecture, r.mot, /à lire à la main/.test(m.alertes[0]?.corps ?? ''),
        (m.tables.documents.find((x) => x.key === 'mnd_ia_compteur_diagnostic')?.data as Record<string, { appels: number }> | undefined)?.['2026-10']?.appels, (d?.data.photos as string[]).length]);
  }
  {
    const m = monde({ claude: 'panne' });
    const [st, r] = await m.envoie(AWA());
    dit('Claude en panne : la lecture attend la Maison, rien n est compté', [200, MOT_SANS_LECTURE, true, false],
      [st, r.mot, diag(m)?.data.sansLecture, m.tables.documents.some((x) => x.key === 'mnd_ia_compteur_diagnostic')]);
  }
  {
    const prix = monde({ claude: { brut: { ...LECTURE_A, resume: 'Un rituel à 15 000 F suffira.' }, modele: 'claude-sonnet-5-5', entree: 1, sortie: 1 } });
    await prix.envoie(AWA());
    const salon = monde({ claude: { brut: { ...LECTURE_A, resume: 'Passez au salon pour vos racines.' }, modele: 'claude-sonnet-5-5', entree: 1, sortie: 1 } });
    await salon.envoie(AWA());
    dit('Claude donne un prix ou dit « salon » : elle lit le résumé composé des listes, jamais sa phrase', [resumeDepuisLesObservations(LECTURE_A), resumeDepuisLesObservations(LECTURE_A)],
      [diag(prix)?.data.texte, diag(salon)?.data.texte]);
  }

  /* Le coffre qui refuse, la base qui refuse. */
  {
    const m = monde({ pannes: { uploadsPermis: 1 } });
    const r = await m.envoie(AWA());
    dit('le coffre refuse la deuxième photo : la première repart, aucune ligne, Claude jamais appelé', [500, 'coffre', ['remove br-cot/diag-1/1.jpg'], 0, 0],
      [r[0], r[1].error, m.journal.filter((j) => j.startsWith('remove')), m.tables.diagnostics.length, m.claudes.length]);
  }
  {
    const m = monde({ pannes: { insertRefuse: true } });
    const r = await m.envoie(AWA());
    dit('la base refuse la ligne : les photos repartent toutes', [500, 'insert_failed', ['remove br-cot/diag-1/1.jpg,br-cot/diag-1/2.jpg'], 0],
      [r[0], r[1].error, m.journal.filter((j) => j.startsWith('remove')), m.coffre.size]);
  }

  /* La table de la direction, lue par la fonction. */
  {
    const m = monde({ table: { lignes: [{ observation: 'secheresse', rituel: ['vivivo'], produits: ['sérum'] }] } });
    await m.envoie(AWA());
    const reco = diag(m)?.data.recommandation as { rituels: { nom: string }[]; produits: { nom: string }[] };
    dit('la fonction suit la table de la direction ; le reste garde la ligne par défaut', [['SÍNSIN · Reprise intégrale'], ['Sérum Racines']], [noms(reco.rituels), noms(reco.produits)]);
  }

  /* Les 90 jours. */
  {
    const vieux = { id: 'diag-vieux', branch_id: 'br-cot', client_id: 'c-awa', source: 'couronne', etat: 'relu', cree_le: iso(T0 - 91 * JOUR), data: { photos: ['br-cot/diag-vieux/1.jpg'], texte: 'Vieux' } };
    const jeune = { id: 'diag-jeune', branch_id: 'br-cot', client_id: 'c-awa', source: 'couronne', etat: 'relu', cree_le: iso(T0 - 89 * JOUR), data: { photos: ['br-cot/diag-jeune/1.jpg'], texte: 'Jeune' } };
    const m = monde({ diagnostics: [vieux, jeune] });
    await m.envoie(AWA());
    dit('à 90 jours, les photos partent du coffre, en passant ; les plus jeunes restent', [false, true],
      [m.coffre.has('photos-du-diagnostic/br-cot/diag-vieux/1.jpg'), m.coffre.has('photos-du-diagnostic/br-cot/diag-jeune/1.jpg')]);
    dit('... la lecture reste et dit quand ses photos sont parties', [[], iso(T0), 'Vieux', ['br-cot/diag-jeune/1.jpg']],
      [diag(m, 'diag-vieux')?.data.photos, diag(m, 'diag-vieux')?.data.photosEffaceesLe, diag(m, 'diag-vieux')?.data.texte, diag(m, 'diag-jeune')?.data.photos]);
    const eteint = monde({ allume: false, diagnostics: [vieux, jeune] });
    await eteint.etat();
    dit('... et à chaque ouverture des applications (l état), même interrupteur éteint', [false, true],
      [eteint.coffre.has('photos-du-diagnostic/br-cot/diag-vieux/1.jpg'), eteint.coffre.has('photos-du-diagnostic/br-cot/diag-jeune/1.jpg')]);
  }

  /* Ce qu'elle relit. */
  {
    const ligne = (id: string, client: string | null, consultation: string | null, etat: string, data: Record<string, unknown> = {}) =>
      ({ id, branch_id: 'br-cot', client_id: client, source: client ? 'couronne' : 'consultation', etat, cree_le: iso(T0 - JOUR), relu_par: etat === 'relu' ? 'u-maitre' : null, relu_le: etat === 'relu' ? iso(T0) : null,
        data: { appel: 'x', consultationId: consultation, photos: ['p'], texte: `texte ${id}`, sansLecture: false, ...data } });
    const m = monde({ diagnostics: [
      ligne('d-relu', 'c-awa', null, 'relu', { correction: 'Le mot du maître', lecture: { ...LECTURE_A, resume: 'Passez au salon, 15 000 F.' } }), ligne('d-sans', 'c-awa', null, 'a-relire', { sansLecture: true }),
      ligne('d-autre', 'c-autre', null, 'a-relire'), ligne('d-cons', null, 'cons-1', 'a-relire'),
    ] });
    const [st, r] = await m.s.lire(m.outils, { jwt: 'jwt.awa.x', body: {} });
    const lus = r.diagnostics as Record<string, unknown>[];
    dit('Ma Couronne : seulement les siennes', [200, ['d-relu', 'd-sans']], [st, lus.map((d) => d.id).sort()]);
    dit('... jamais qui a relu, ni le chemin des photos', ['correction', 'cree_le', 'etat', 'id', 'lecture', 'mot', 'photosEffaceesLe', 'recommandation', 'relu_le', 'texte'],
      Object.keys(lus[0] ?? {}).sort());
    dit('... relue : « Relu par la Maison. » et le mot du maître ; sans lecture : la Maison relit', [MOT_RELU, 'Le mot du maître', MOT_SANS_LECTURE],
      [lus.find((d) => d.id === 'd-relu')?.mot, lus.find((d) => d.id === 'd-relu')?.correction, lus.find((d) => d.id === 'd-sans')?.mot]);
    dit('... sans la phrase brute de Claude', ['', 'fin'],
      [(lus.find((d) => d.id === 'd-relu')?.lecture as Lecture | undefined)?.resume, (lus.find((d) => d.id === 'd-relu')?.lecture as Lecture | undefined)?.calibre]);
    const [, c] = await m.s.lire(m.outils, { jwt: ANON, body: { consultationId: 'cons-1', transactionId: 'tx-ok' } });
    dit('La Consultation : seulement celle de sa consultation payée ; sans preuve, rien', [['d-cons'], 403],
      [(c.diagnostics as { id: string }[]).map((d) => d.id), (await m.s.lire(m.outils, { jwt: ANON, body: { consultationId: 'cons-1', transactionId: 'tx-echec' } }))[0]]);
  }

  /* Le seau : cinq lectures par dix minutes et par adresse. */
  {
    const tables: Tables = { edge_rate_limits: [{ bucket: 'diagnostic_photos', ip: '1.1.1.1', at: new Date(Date.now() - 11 * 60_000).toISOString() }] };
    const { admin } = fausseBase(tables, {}, new Map());
    const s = serveur(admin);
    const suite: boolean[] = [];
    for (let i = 0; i < 6; i++) suite.push(await s.allowRate('1.1.1.1', 'diagnostic_photos', SEAU_DU_DIAGNOSTIC));
    dit('cinq lectures par dix minutes et par adresse, la sixième attend ; une autre adresse passe ; une vieille trace ne compte pas',
      [[true, true, true, true, true, false], true], [suite, await s.allowRate('2.2.2.2', 'diagnostic_photos', SEAU_DU_DIAGNOSTIC)]);
    dit('le coût d un appel inconnu se compte au plus cher (jamais sous la vraie facture)', true, s.coutDeLAppel('claude-haiku-5-5', 1_000_000, 0) >= s.coutDeLAppel('claude-sonnet-5-5', 1_000_000, 0));
  }
};

/* ── 4. LA FONCTION, LA MIGRATION, LES ÉCRANS ────────────────────────── */
const structure = () => {
  const f = sansCommentaires(lis(SERVEUR));
  dit('la fonction dit sa version et répond 405 à un GET', [true, true], [/const VERSION = '2026-10-19-a/.test(f), /json\(\{ error: 'method', version: VERSION \}, 405\)/.test(f)]);
  dit('trois gestes, chacun son seau ; la lecture des photos, cinq par dix minutes', [true, true, true],
    [/allowRate\(ip, 'diagnostic_photos', SEAU_DU_DIAGNOSTIC\)\)\) return json\(\{ error: 'rate_limited' \}, 429\);\s*r = await lirePhotos\(outils/.test(f),
      /allowRate\(ip, 'diagnostic_lire', 30\)/.test(f), /allowRate\(ip, 'diagnostic_etat', 60\)/.test(f)]);
  dit('... sur dix minutes de fenêtre', true, /Date\.now\(\) - 10 \* 60_000/.test(morceau(f, 'async function allowRate(', '\n}\n')));
  dit('Claude : un outil forcé, Sonnet puis Haiku, quarante secondes au plus', [true, true, true],
    [/tool_choice: \{ type: 'tool', name: 'lecture' \}/.test(f), /for \(const model of MODELES_DU_DIAGNOSTIC\)/.test(f), /setTimeout\(\(\) => arret\.abort\(\), 40_000\)/.test(f)]);
  dit('l alerte sonne pour qui relit (la direction et l Atelier) et ouvre le diagnostic au Trône', [true, true],
    [/\.filter\(\(s\) => peutRelire\(s\.role, acces\[s\.user_id\]\)\)/.test(f), /url: `\/trone\/#\/consultations\?diagnostic=\$\{o\.diagnosticId\}`/.test(f)]);
  dit('la fonction ne passe pas par ia-maison (les clientes n ont pas de compte du personnel)', false, /ia-maison/.test(f));

  const m = sqlSansCommentaires(lis(MIGRATION));
  dit('0137 : un coffre PRIVÉ, 4 Mo, JPEG, PNG, WebP', true,
    /'photos-du-diagnostic', 'photos-du-diagnostic', false, 4000000,\s*array\['image\/jpeg', 'image\/png', 'image\/webp'\]/.test(m));
  dit('... le personnel voit, la direction efface ; AUCUNE écriture du navigateur au coffre', [true, true, 0],
    [/diagnostic_photos_voir on storage\.objects for select to authenticated\s+using \(bucket_id = 'photos-du-diagnostic' and public\.is_staff\(\)\)/.test(m),
      /diagnostic_photos_effacer on storage\.objects for delete to authenticated\s+using \(bucket_id = 'photos-du-diagnostic' and public\.est_direction\(\)\)/.test(m),
      (m.match(/on storage\.objects for (insert|update|all)/g) ?? []).length]);
  dit('... la table : RLS, le personnel lit et relit, la direction efface, personne ne crée par le navigateur', [true, true, true, true, 0],
    [/alter table public\.diagnostics enable row level security/.test(m),
      /diagnostics_lire on public\.diagnostics for select to authenticated\s+using \(public\.is_staff\(\)\)/.test(m),
      /diagnostics_relire on public\.diagnostics for update to authenticated\s+using \(public\.is_staff\(\)\) with check \(public\.is_staff\(\)\)/.test(m),
      /diagnostics_effacer on public\.diagnostics for delete to authenticated\s+using \(public\.est_direction\(\)\)/.test(m),
      (m.match(/on public\.diagnostics for (insert|all)/g) ?? []).length]);
  dit('... aucun droit au site (ni anon ni public)', false, /\bto (anon|public)\b/.test(m));
  dit('... états et sources fermés, en direct', [true, true, true],
    [/check \(etat in \('a-relire', 'relu', 'ferme'\)\)/.test(m), /check \(source in \('consultation', 'couronne'\)\)/.test(m), /alter publication supabase_realtime add table public\.diagnostics/.test(m)]);
  dit('... la table et l interrupteur sont à la direction ; un interrupteur qui n est pas un booléen tombe', [true, true, true],
    [/if new\.key = 'mnd_diagnostic_table' then\s+if auth\.uid\(\) is not null and not public\.est_direction\(\) then\s+raise exception/.test(m),
      /if auth\.uid\(\) is not null and not public\.est_direction\(\) then\s+new\.data := new\.data - 'diagnosticPhoto';/.test(m),
      /jsonb_typeof\(new\.data->'diagnosticPhoto'\) <> 'boolean' then\s+new\.data := new\.data - 'diagnosticPhoto';/.test(m)]);
  dit('la fonction ne lit l interrupteur qu allumé pour de vrai (true, jamais « oui »)', true, /return cfg\?\.diagnosticPhoto === true;/.test(f));

  /* Les écrans des clientes. */
  const appel = sansCommentaires(lis('src/shared/diagnostic-locks.ts'));
  dit('l appel des clientes : le geste porte l accord « oui » ; La Consultation n envoie jamais une session ; sans ia-maison', [true, true, true, false],
    [/action: 'lire-photos', consentement: 'oui'/.test(appel), /appelle\(\{ action: 'lire-photos', consentement: 'oui', photos, \.\.\.\(preuve \?\? \{\}\) \}, !preuve\)/.test(appel), /\/functions\/v1\/\$\{FONCTION\}/.test(appel), /ia-maison/.test(appel)]);
  const cons = sansCommentaires(lis('src/apps/consultation/DiagnosticPhoto.tsx'));
  const app = sansCommentaires(lis('src/apps/consultation/App.tsx'));
  dit('La Consultation : rien sans l interrupteur, sans consultation ni paiement vérifié', [true, true],
    [/const ouvert = useDiagnosticOuvert\(\);/.test(cons), /if \(!ouvert \|\| !consultationId \|\| !transactionId\) return null;/.test(cons)]);
  dit('... le paiement vérifié par le serveur seul ouvre le bloc', true, /<DiagnosticPhoto consultationId=\{access\.consultationId\} transactionId=\{access\.paid \? access\.ref : null\}/.test(app));
  dit('... l accord coché, mot pour mot ; envoyer au toucher, jamais sans', [true, true, true, 1],
    [/\{PHRASE_DE_L_ACCORD\}/.test(cons), /if \(etat === 'envoi' \|\| defaut\) return;/.test(cons), /onClick=\{\(\) => void envoie\(\)\}/.test(cons), (cons.match(/envoieLesPhotos\(/g) ?? []).length]);
  dit('... sans ia-maison, sans dépôt direct au coffre, la Consultation garde sa règle des photos', [false, false, false, true],
    [/ia-maison/.test(cons), /\.storage\s*\.\s*from\(/.test(cons + app), /consultationsQueueStore/.test(cons), /restent sur votre t[ée]l[ée]phone/.test(app)]);
  const mc = sansCommentaires(lis('src/apps/couronne/MonDiagnosticPhoto.tsx'));
  dit('Ma Couronne : rien sans l interrupteur ; sa couronne à elle seulement ; l accord coché ; envoyer au toucher', [true, true, true, true, true, false],
    [/const ouvert = useDiagnosticOuvert\(\);/.test(mc), /if \(!ouvert\) return null;/.test(mc), /\{client && !regard && <MonDiagnosticPhoto \/>\}/.test(sansCommentaires(lis('src/apps/couronne/Tabs.tsx'))),
      /t\(PHRASE_DE_L_ACCORD\)/.test(mc), /if \(envoi \|\| defaut\) return;/.test(mc), /ia-maison/.test(mc)]);
  {
    const montres = `${cons}\n${mc}`;
    dit('ce que lisent les clientes : jamais « salon », jamais de tiret long, jamais « intelligence », toujours « à confirmer en consultation »', [false, false, false, true],
      [/\bsalons?\b/i.test(montres), /—/.test(montres), /intelligence/i.test(montres), /MOT_A_CONFIRMER|À confirmer en consultation\./.test(montres) || /rendu\.mot/.test(cons)]);
    dit('... avant d envoyer, elles lisent que la lecture est automatique, relue par un maître, et pas un examen médical', [true, true, true, true],
      [/lecture, automatique/.test(cons) && /un maître de la Maison la relit/.test(cons), /pas un examen médical/.test(cons),
        /lecture, automatique/.test(mc) && /un maître de la Maison la relit/.test(mc), /pas un examen médical/.test(mc)]);
  }

  /* Le Trône. */
  const panneau = sansCommentaires(lis('src/apps/trone/routes/clients/DiagnosticsARelire.tsx'));
  const donnees = sansCommentaires(lis('src/shared/diagnostics-au-trone.ts'));
  dit('Consultations porte les diagnostics à relire, pour qui relit seulement', [true, true, true],
    [/<DiagnosticsARelire \/>/.test(sansCommentaires(lis('src/apps/trone/routes/clients/Consultations.tsx'))),
      /const peut = peutRelire\(moi\?\.role, acces\[moi\?\.user_id \?\? ''\]\);/.test(panneau), /if \(!peut\) return null;/.test(panneau)]);
  dit('... la lecture de Claude est une proposition teintée cuivre « à vérifier », modifiable', [true, true, true],
    [/data-proposition="a-verifier"/.test(panneau), /À vérifier/.test(panneau), /<Textarea value=\{mot\}/.test(panneau)]);
  dit('... confirmer et écarter au toucher ; rien ne part (aucun message, encaissement, rendez-vous)', [true, true, false],
    [/onClick=\{\(\) => void confirme\(\)\}/.test(panneau), /onClick=\{\(\) => void ecarte\(\)\}/.test(panneau),
      /whatsapp|wa\.me|pushNotify|functions\.invoke|invoicesStore|appointmentsStore|envoisStore/i.test(panneau + donnees)]);
  dit('... l écoute est directe, les photos par une adresse de dix minutes, jamais par la synchro des magasins ; le Trône ne crée aucune ligne', [true, true, false, false],
    [/postgres_changes/.test(donnees), /createSignedUrl\(chemin, 600\)/.test(donnees), /bindCollection|bindDocument|createStore/.test(donnees), /\.insert\(/.test(donnees)]);
  const carte = sansCommentaires(lis('src/apps/trone/routes/systeme/CarteDiagnosticPhoto.tsx'));
  dit('Paramètres : l interrupteur et la table, à la direction ; « à valider » tant qu elle ne l a pas validée', [true, true, true, true, true],
    [/<CarteDiagnosticPhoto \/>/.test(sansCommentaires(lis('src/apps/trone/routes/systeme/Parametres.tsx'))),
      /if \(!estDirection\) \{ toast\('Ce réglage appartient à la direction\.'\); return; \}\s*setCfg\(\(c\) => \(\{ \.\.\.c, diagnosticPhoto: !allume \}/.test(carte),
      /if \(!estDirection\) \{ toast\('La table du diagnostic appartient à la direction\.'\); return; \}/.test(carte), />À valider</.test(carte), /tableEstValidee\(doc\)/.test(carte)]);
  dit('pas de rubrique de plus dans la barre', false, /path: '\/diagnostic/.test(lis('src/apps/trone/routes/index.tsx')));
};

regle();
copies();
await essais();
structure();
console.log(ko === 0 ? '\nTOUT VA BIEN : le diagnostic photo tient ses promesses.' : `\n${ko} ÉCHEC(S)`);
if (ko) process.exitCode = 1;
