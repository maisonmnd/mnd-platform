/* LE SECRÉTARIAT QUI RÉDIGE, ÉPROUVÉ — `node scripts/verifie-le-secretariat-qui-redige.mjs`.

   19 octobre 2026, chantier 8 des huit (maquette NKQMiMMY… validée) : « Une
   phrase et la lettre sort au bon registre, sur le papier à en-tête,
   numérotée et prête à signer comme aujourd'hui. Boutons : Garder et
   numéroter / Retoucher. Les papiers de la famille ne passent jamais par
   Claude. » Décision : la direction seule.

   LES ATTENTES SONT ÉCRITES À LA MAIN d'après cette décision, jamais
   déduites du code. On n'appelle jamais la vraie fonction : la consigne, le
   schéma, la lecture et le garde-fou se jugent à sec, et la structure de
   l'écran se lit dans les fichiers. */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import {
  CLES_DES_REGISTRES, EXEMPLE_DE_PHRASE, FORMULE_MAX, LIGNES_DU_DESTINATAIRE_MAX, MOTS_DE_LA_FAMILLE, MOTS_MAX, MOT_DU_REFUS_FAMILLE, OBJET_MAX, PARAGRAPHES_MAX, PHRASE_MAX,
  REGISTRE_PAR_DEFAUT, REGISTRES_DE_LA_LETTRE, SCHEMA_DE_LA_LETTRE, anneeAPreciser, champsDeLaLettre, civiliteNonSupposee, consigneDeLaLettre, contientSalon, defautDeLaPhrase,
  lectureDeLaLettre, parleDeLaFamille, phraseDitLaCivilite, registreLu, sansTiretLong,
} from '../src/shared/ia-lettre-pur';
import { CHANTIERS_IA, DEPARTEMENTS_PAR_CHANTIER, defautDeLaDemande, peutDemander } from '../src/shared/ia-maison-pur';
import { aCompleter, modeleDe, MODELES } from '../src/shared/secretariat-modeles';

let ko = 0;
const dit = (nom: string, attendu: unknown, obtenu: unknown) => {
  const a = JSON.stringify(attendu); const o = JSON.stringify(obtenu);
  if (a === o) console.log(`OK    ${nom}`);
  else { ko++; console.log(`ECHEC ${nom}\n       obtenu  ${o}\n       attendu ${a}`); }
};
const lis = (f: string) => readFileSync(f, 'utf8').split(String.fromCharCode(13)).join('');
const sansCommentaires = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '');
const PUR = 'src/shared/ia-lettre-pur.ts';
const COMPOSANT = 'src/apps/trone/routes/pilotage/secretariat/RedigerDUnePhrase.tsx';
const ECRAN = 'src/apps/trone/routes/pilotage/Secretariat.tsx';
const EDITEUR = 'src/apps/trone/routes/pilotage/secretariat/Editeur.tsx';
const SEC_PUR = 'src/shared/secretariat-pur.ts';
const CSS = 'src/apps/trone/routes/pilotage/secretariat/rediger.css';

/* ── 1. LA RÈGLE : LA DIRECTION SEULE, LES REGISTRES, LES BORNES ─────── */
dit('le chantier « lettre » est l un des huit', true, CHANTIERS_IA.includes('lettre'));
dit('la direction seule : aucun département n ouvre la lettre (sa décision)', [], DEPARTEMENTS_PAR_CHANTIER.lettre);
{
  const tous = Object.fromEntries(['dept-clientele', 'dept-vente-caisse', 'dept-finances', 'dept-atelier', 'dept-equipe', 'dept-marketing', 'dept-academie', 'dept-systeme', 'dept-direction'].map((d) => [d, true]));
  dit('qui peut demander une lettre : Yéman et Brice ; un maître jamais, même tous départements ouverts', [true, true, false, false, false],
    [peutDemander('souverain', 'lettre', {}), peutDemander('gerant', 'lettre', {}), peutDemander('maitre', 'lettre', tous), peutDemander('maitre', 'lettre', {}), peutDemander(undefined, 'lettre', tous)]);
}
dit('les bornes de la décision : 1 à 8 paragraphes, 1 200 mots, une phrase de 600 signes', [8, 1200, 600, 5], [PARAGRAPHES_MAX, MOTS_MAX, PHRASE_MAX, LIGNES_DU_DESTINATAIRE_MAX]);
dit('les registres : des lettres et des attestations du Secrétariat, par leur clef', true,
  ['lettre', 'demande', 'reclamation', 'relance-paiement', 'remerciement-cliente', 'reponse-reclamation', 'demande-devis', 'convocation-entretien', 'avertissement', 'demande-explication', 'felicitations', 'certificat-fin-contrat', 'attestation-travail', 'attestation-stage', 'attestation-formation', 'attestation-paiement', 'note-interne', 'ouverture-compte']
    .every((k) => CLES_DES_REGISTRES.includes(k)));
dit('... jamais un contrat, le dossier OAPI, une pièce juridique, la lettre personnelle, la page libre, un procès-verbal ni le règlement', [],
  ['contrat-prestation', 'contrat-travail', 'contrat-apprentissage', 'avenant', 'oapi-depot', 'oapi-pouvoir', 'procuration', 'mise-en-demeure', 'honneur', 'lettre-perso', 'libre', 'proces-verbal', 'reglement-interieur'].filter((k) => CLES_DES_REGISTRES.includes(k)));
dit('... chaque registre est un modèle connu du Secrétariat, et la lettre officielle est le repli', [[], 'lettre', true],
  [REGISTRES_DE_LA_LETTRE.filter((m) => !MODELES.some((x) => x.cle === m.cle)).map((m) => m.cle), REGISTRE_PAR_DEFAUT, CLES_DES_REGISTRES.includes(REGISTRE_PAR_DEFAUT)]);
dit('l exemple de la maquette, mot pour mot', 'Attestation de stage pour Awa K., du 1er au 30 septembre 2026, pose et entretien de locks.', EXEMPLE_DE_PHRASE);

/* ── 2. LE GARDE-FOU DE LA FAMILLE, AVANT TOUT APPEL ──────────────────── */
dit('les mots de la famille sont GÉNÉRIQUES : ceux-là, et aucun prénom',
  ['bourse', 'scolaire', 'scolarite', 'passeport', 'visa', 'carte d identite', 'piece d identite', 'cip', 'acte de naissance', 'livret de famille', 'certificat de nationalite', 'hebergement',
    'mon fils', 'ma fille', 'mes enfants', 'mon mari', 'mon epoux', 'ma femme', 'mon epouse'],
  MOTS_DE_LA_FAMILLE);
dit('... en minuscules sans accent, sans majuscule qui dirait un nom propre', [], MOTS_DE_LA_FAMILLE.filter((m) => !/^[a-z ]+$/.test(m)));
dit('bourse, passeport, CIP, visa, pièce d identité, acte de naissance, « mon fils » : refusés sans appel', [true, true, true, true, true, true, true, true],
  [parleDeLaFamille('Attestation pour la bourse scolaire de la rentrée'), parleDeLaFamille('Renouvellement du passeport'), parleDeLaFamille('Lettre pour la CIP'),
    parleDeLaFamille('Attestation d’hébergement pour le visa'), parleDeLaFamille('Copie de la Pièce d’Identité'), parleDeLaFamille('Demande d’acte de naissance'),
    parleDeLaFamille('Attestation de prise en charge de mon fils'), parleDeLaFamille('Frais de scolarité')]);
dit('... la phrase de la maquette, un devis, une cliente et sa fille : la Maison, pas la famille', [false, false, false, false],
  [parleDeLaFamille(EXEMPLE_DE_PHRASE), parleDeLaFamille('Demande de devis pour six fauteuils de séance'), parleDeLaFamille('Remerciement à Mme D. et sa fille pour leur fidélité'), parleDeLaFamille('')]);
dit('le mot du refus dit que les papiers de la famille ne passent jamais par Claude', true, /papiers de la famille ne passent jamais par Claude/.test(MOT_DU_REFUS_FAMILLE));
dit('une phrase vide ou une page entière ne partent pas ; la phrase de la maquette, oui', [true, true, null],
  [defautDeLaPhrase('   ') !== null, defautDeLaPhrase('x'.repeat(PHRASE_MAX + 1)) !== null, defautDeLaPhrase(EXEMPLE_DE_PHRASE)]);

/* ── 3. LA CONSIGNE ───────────────────────────────────────────────────── */
{
  const c = consigneDeLaLettre({ auNomDe: 'Maison MND', dateDuJour: '2026-10-19' });
  dit('la consigne : au nom de la Maison MND, à Cotonou, français administratif, vouvoiement', [true, true, true, true],
    [/Maison MND/.test(c), /Cotonou \(Bénin\)/.test(c), /français administratif sobre et juste/.test(c), /vouvoiement/.test(c)]);
  dit('... jamais « salon », jamais de tiret long, et elle n en porte pas elle-même', [true, true, false],
    [/jamais le mot « salon » \(on dit « la Maison »\)/.test(c), /jamais de tiret long/.test(c), c.includes('—')]);
  dit('... n invente ni date, ni montant, ni numéro de pièce d identité ; ce qui manque s écrit [À COMPLÉTER]', [true, true, true],
    [/Ni date, ni montant, ni numéro de pièce d’identité/.test(c), /s’écrit \[À COMPLÉTER\]/.test(c), /aucune donnée que la phrase ne donne pas/.test(c)]);
  dit('... les noms restent comme la phrase les écrit', true, /Les noms de personnes s’écrivent comme la phrase les écrit/.test(c));
  dit('... « Fait à Cotonou, le » avec la date du jour ET son année, et le papier l imprime', [true, true, true],
    [/faite à Cotonou, le 19 octobre 2026/.test(c), /\(2026-10-19\)/.test(c), /ne l’écris pas dans le corps/.test(c)]);
  dit('... toute date porte son année', true, /Toute date que tu écris porte son année/.test(c));
  dit('... le ton selon le registre : attestation en « je soussigné », lettre en « nous », convocation ferme, remerciement chaleureux', [true, true, true, true],
    [/Je soussigné\(e\) \{signataire\}, \{qualite\} de \{entreprise\}/.test(c), /parle en « nous » au nom de Maison MND/.test(c), /convocation, un avertissement, une demande d’explication, une relance : fermes et courtois/.test(c), /remerciement, des félicitations : chaleureux/.test(c)]);
  dit('... les registres sont listés par leur clef et leur titre', [true, true, true],
    [/ · attestation-stage : Attestation de stage/.test(c), / · lettre : Lettre officielle/.test(c), /Si rien ne convient, « lettre »/.test(c)]);
  dit('... la famille : refus = « famille », rien d autre', true, /membre de la famille de la direction, d’une bourse scolaire, d’un passeport, d’un visa, d’une pièce d’identité[\s\S]*rends refus = « famille », et laisse tous les autres champs vides/.test(c));
  dit('... la forme : 1 à 8 paragraphes, 1200 mots, la formule entière ou vide', [true, true, true], [/1 à 8 paragraphes/.test(c), /1200 mots au plus/.test(c), /formule = la phrase de politesse entière, ou vide/.test(c)]);
  dit('... la civilité jamais supposée d après un prénom : le nom seul, « Madame, Monsieur » pour s adresser', [true, true, true],
    [/LA CIVILITÉ : ne la suppose jamais d’après un prénom/.test(c), /nomme la personne par son nom tel qu’il est écrit, sans civilité/.test(c), /adresse-toi à « Madame, Monsieur »/.test(c)]);
  dit('... pas d appel en tête du corps : le papier l imprime à part', true, /pas de formule d’appel \(« Madame, Monsieur, »\) en tête du corps/.test(c));
  dit('... la consigne et la phrase tiennent dans une demande recevable', null,
    defautDeLaDemande({ chantier: 'lettre', usage: 'texte', systeme: c, messages: [{ role: 'user', content: EXEMPLE_DE_PHRASE }], schema: SCHEMA_DE_LA_LETTRE }));
  const autre = consigneDeLaLettre({ auNomDe: 'ACIA 1', dateDuJour: '2026-10-19', ville: 'Porto-Novo', registreImpose: 'attestation-stage' });
  dit('« Une autre » : le registre est imposé, la liste ne s offre plus ; une autre ville se dit', [true, false, true],
    [/déjà choisi : « attestation-stage » \(Attestation de stage\)/.test(autre), / · lettre : Lettre officielle/.test(autre), /faite à Porto-Novo/.test(autre)]);
  dit('un registre imposé inconnu : la liste revient', true, / · lettre : Lettre officielle/.test(consigneDeLaLettre({ auNomDe: 'x', dateDuJour: '2026-10-19', registreImpose: 'contrat-travail' })));
}

/* ── 4. LE SCHÉMA ─────────────────────────────────────────────────────── */
{
  const s = SCHEMA_DE_LA_LETTRE as { type: string; required: string[]; properties: Record<string, { type: string; enum?: string[]; maxItems?: number }> };
  dit('le schéma : un objet, les cinq champs exigés, le refus facultatif', ['object', ['registre', 'destinataire', 'objet', 'corps', 'formule'], false],
    [s.type, s.required, s.required.includes('refus')]);
  dit('... le registre est une énumération fermée, le refus ne dit que « famille », le corps est borné à 8', [CLES_DES_REGISTRES, ['famille'], 8, 'array'],
    [s.properties.registre.enum, s.properties.refus.enum, s.properties.corps.maxItems, s.properties.corps.type]);
}

/* ── 5. LA LECTURE : ON NE FAIT PAS CONFIANCE À LA SORTIE ─────────────── */
const BONNE = {
  registre: 'attestation-stage', destinataire: '', objet: 'Attestation de stage',
  corps: ['Je soussigné(e) {signataire}, {qualite} de {entreprise}, atteste que Awa K. a effectué un stage au sein de notre structure du 1er au 30 septembre 2026, en qualité de [À COMPLÉTER].',
    'Durant ce stage, elle s’est formée à la pose et à l’entretien des locks.', 'La présente attestation lui est délivrée pour servir et valoir ce que de droit.'],
  formule: '',
};
dit('une bonne proposition passe telle quelle', BONNE, lectureDeLaLettre(BONNE));
dit('9 paragraphes : refusés ; 8 : gardés', [null, 8],
  [lectureDeLaLettre({ ...BONNE, corps: Array.from({ length: 9 }, (_, i) => `Paragraphe ${i + 1}.`) }), lectureDeLaLettre({ ...BONNE, corps: Array.from({ length: 8 }, (_, i) => `Paragraphe ${i + 1}.`) })?.corps.length]);
dit('1 201 mots : refusés ; 1 200 : gardés', [null, true],
  [lectureDeLaLettre({ ...BONNE, corps: [Array(1201).fill('mot').join(' ')] }), lectureDeLaLettre({ ...BONNE, corps: [Array(1200).fill('mot').join(' ')] }) !== null]);
dit('le tiret long devient une virgule, dans le corps, l objet, la formule et le destinataire',
  ['La Maison, à Cotonou, vous remercie.', 'Votre courrier, reçu', 'Avec nos remerciements, bien cordialement.', 'Moov Africa, Service clientèle'],
  (() => { const l = lectureDeLaLettre({ ...BONNE, registre: 'lettre', destinataire: 'Moov Africa — Service clientèle', objet: 'Votre courrier — reçu', corps: ['La Maison — à Cotonou — vous remercie.'], formule: 'Avec nos remerciements — bien cordialement.' }); return [l?.corps[0], l?.objet, l?.formule, l?.destinataire]; })());
dit('le demi-cadratin aussi', 'Du 1er au 30 septembre 2026, à la Maison.', sansTiretLong('Du 1er au 30 septembre 2026 – à la Maison.'));
dit('« salon » : refusé, où qu il soit, singulier, pluriel, majuscule', [null, null, null, null, true],
  [lectureDeLaLettre({ ...BONNE, corps: ['Bienvenue au salon.'] }), lectureDeLaLettre({ ...BONNE, objet: 'Nos Salons' }), lectureDeLaLettre({ ...BONNE, registre: 'lettre', formule: 'Le salon vous salue.' }),
    lectureDeLaLettre({ ...BONNE, destinataire: 'Salon Beauté\nCotonou' }), contientSalon('Salonique') === false]);
dit('refus : « famille » compris, et rien n est rédigé ; un autre refus ne se lit pas', [{ registre: 'lettre', destinataire: '', objet: '', corps: [], formule: '', refus: 'famille' }, null, true],
  [lectureDeLaLettre({ refus: 'famille' }), lectureDeLaLettre({ ...BONNE, refus: 'autre' }), lectureDeLaLettre({ ...BONNE, refus: '' }) !== null]);
dit('un registre inconnu ou mal écrit retombe sur la lettre officielle ; la casse pardonne', ['lettre', 'lettre', 'attestation-stage', 'lettre'],
  [registreLu('attestation_de_stage'), registreLu(42), registreLu(' ATTESTATION-STAGE '), lectureDeLaLettre({ ...BONNE, registre: 'contrat-travail' })?.registre]);
dit('« Objet : » s efface ; un objet vide prend le titre du modèle ; l objet et la formule sont bornés', ['Attestation de stage', 'Attestation de stage', OBJET_MAX, FORMULE_MAX],
  [lectureDeLaLettre({ ...BONNE, objet: 'Objet : Attestation de stage' })?.objet, lectureDeLaLettre({ ...BONNE, objet: '' })?.objet,
    lectureDeLaLettre({ ...BONNE, objet: 'o'.repeat(500) })?.objet.length, lectureDeLaLettre({ ...BONNE, registre: 'lettre', formule: 'f'.repeat(900) })?.formule.length]);
dit('le destinataire : cinq lignes au plus, les vides sautées, CRLF compris', ['A\nB\nC\nD\nE', 'Moov Africa\nCotonou, Bénin'],
  [lectureDeLaLettre({ ...BONNE, destinataire: 'A\nB\n\nC\nD\nE\nF\nG' })?.destinataire, lectureDeLaLettre({ ...BONNE, destinataire: 'Moov Africa\r\nCotonou, Bénin' })?.destinataire]);
dit('« Fait à Cotonou, le … » en double : le papier l imprime déjà, le paragraphe tombe', ['Un paragraphe.'],
  lectureDeLaLettre({ ...BONNE, corps: ['Un paragraphe.', 'Fait à Cotonou, le 19 octobre 2026.'] })?.corps);
dit('rien de lisible : pas un objet, pas de corps, corps vide, corps qui n est pas une liste', [null, null, null, null, null, null],
  [lectureDeLaLettre(null), lectureDeLaLettre('texte'), lectureDeLaLettre([BONNE]), lectureDeLaLettre({ ...BONNE, corps: undefined }), lectureDeLaLettre({ ...BONNE, corps: [] }), lectureDeLaLettre({ ...BONNE, corps: 'un seul texte' })]);
dit('un paragraphe qui n est pas une chaîne est ignoré, les blancs s aplatissent', ['Un paragraphe propre.'],
  lectureDeLaLettre({ ...BONNE, corps: [42, '  Un   paragraphe\n propre. ', null] })?.corps);

/* LA CIVILITÉ (règle du 13 octobre 2026 : fiche muette = le nom seul, rien
   de connu = « Madame, Monsieur »). La phrase de la maquette n'en dit aucune. */
dit('la phrase de la maquette ne dit pas de civilité ; « Mme D. », « Monsieur K. » en disent une', [false, true, true],
  [phraseDitLaCivilite(EXEMPLE_DE_PHRASE), phraseDitLaCivilite('Lettre à Mme D. pour sa fidélité'), phraseDitLaCivilite('Convocation de Monsieur K. à un entretien')]);
{
  const devinee = lectureDeLaLettre({
    ...BONNE, registre: 'lettre', destinataire: 'Madame Awa K.\nCotonou, Bénin',
    corps: ['Nous attestons que Mademoiselle Awa K. a suivi le stage.', 'Nous vous remercions, Madame, de votre assiduité.'],
    formule: 'Veuillez agréer, Madame, l’assurance de nos sentiments respectueux.',
  }, EXEMPLE_DE_PHRASE);
  dit('Claude devine « Madame » d après « Awa » : la civilité devant le nom tombe, l adresse devient « Madame, Monsieur »',
    ['Awa K.\nCotonou, Bénin', 'Nous attestons que Awa K. a suivi le stage.', 'Nous vous remercions, Madame, Monsieur, de votre assiduité.', 'Veuillez agréer, Madame, Monsieur, l’assurance de nos sentiments respectueux.'],
    [devinee?.destinataire, devinee?.corps[0], devinee?.corps[1], devinee?.formule]);
  const dite = lectureDeLaLettre({ ...BONNE, registre: 'lettre', destinataire: 'Madame D.\nCotonou, Bénin', corps: ['Madame D. est une cliente fidèle de la Maison.'] }, 'Remerciement à Madame D. pour sa fidélité');
  dit('... la phrase dit « Madame » : la direction a parlé, rien ne bouge', ['Madame D.\nCotonou, Bénin', 'Madame D. est une cliente fidèle de la Maison.'], [dite?.destinataire, dite?.corps[0]]);
}
dit('... un titre et la paire « Madame, Monsieur » restent tels quels', ['À Madame la Directrice de l’ANPE', 'Monsieur le Directeur général', 'Madame, Monsieur, nous vous écrivons.'],
  [civiliteNonSupposee('À Madame la Directrice de l’ANPE'), civiliteNonSupposee('Monsieur le Directeur général'), civiliteNonSupposee('Madame, Monsieur, nous vous écrivons.')]);
dit('l appel seul dans un paragraphe tombe : le papier l imprime au-dessus du corps', ['Nous accusons réception de votre courrier.'],
  lectureDeLaLettre({ ...BONNE, registre: 'lettre', corps: ['Madame, Monsieur,', 'Nous accusons réception de votre courrier.', 'Chère Madame,'] })?.corps);

/* L'ANNÉE SUR CHAQUE DATE : une date sans son année se marque [ANNÉE], et le
   crochet compte parmi les éléments à compléter (la pièce ne se signe pas avant). */
dit('une date sans son année est marquée ; avec son année, ou l année dite juste après, elle ne bouge pas',
  ['Le 3 octobre [ANNÉE], vous étiez absente.', 'du 1er au 30 septembre 2026', 'du 1er septembre au 30 septembre 2026', 'le 14 juillet 2026', 'mais 2 mais', 'Le 12 mars [ANNÉE].'],
  [anneeAPreciser('Le 3 octobre, vous étiez absente.'), anneeAPreciser('du 1er au 30 septembre 2026'), anneeAPreciser('du 1er septembre au 30 septembre 2026'),
    anneeAPreciser('le 14 juillet 2026'), anneeAPreciser('mais 2 mais'), anneeAPreciser('Le 12 mars.')]);
{
  const l = lectureDeLaLettre({ ...BONNE, registre: 'convocation-entretien', objet: 'Entretien du 23 octobre', corps: ['Nous vous convoquons le 23 octobre à 10 h.'] });
  dit('... dans le corps et l objet de la proposition, et l éditeur le compte « à compléter »', ['Entretien du 23 octobre [ANNÉE]', 'Nous vous convoquons le 23 octobre [ANNÉE] à 10 h.', 2],
    [l?.objet, l?.corps[0], l ? aCompleter(l.destinataire, l.objet, champsDeLaLettre(l).corps) : -1]);
}

/* ── 6. CE QUI REMPLIT LE BROUILLON ───────────────────────────────────── */
{
  const a = champsDeLaLettre(BONNE);
  dit('une attestation : le modèle du registre, son titre, ni appel ni politesse, les paragraphes séparés d une ligne vide',
    ['attestation-stage', 'Attestation de stage', '', '', 2, true],
    [a.modele, a.titre, a.appel, a.cloture, (a.corps.match(/\n\n/g) ?? []).length, a.aRelire === undefined]);
  const l = champsDeLaLettre({ ...BONNE, registre: 'lettre', destinataire: 'Moov Africa\nCotonou, Bénin', formule: 'Nous vous prions d’agréer, Madame, Monsieur, l’expression de nos salutations distinguées.' });
  dit('une lettre : la formule de Claude devient la politesse, l appel du modèle n est pas touché', ['Nous vous prions d’agréer, Madame, Monsieur, l’expression de nos salutations distinguées.', false],
    [l.cloture, 'appel' in l]);
  dit('... sans formule rendue, la politesse du modèle reste (le champ n est pas touché)', false, 'cloture' in champsDeLaLettre({ ...BONNE, registre: 'lettre', formule: '' }));
  dit('un registre « à faire relire » le reste', true, champsDeLaLettre({ ...BONNE, registre: 'rappel-avant-demeure' }).aRelire === modeleDe('rappel-avant-demeure').aRelire && modeleDe('rappel-avant-demeure').aRelire === true);
}

/* ── 7. LA STRUCTURE : L ÉCRAN, LE CHEMIN EXISTANT, LA DIRECTION SEULE ── */
{
  const pur = sansCommentaires(lis(PUR));
  dit('le module pur ne touche ni réseau ni magasin, et n importe rien du dossier de bourse', [false, false], [/supabase|fetch\(|localStorage|demandeAClaude/.test(pur), /from '[^']*bourse[^']*'/.test(pur)]);
  /* Le seul tiret long du module vit dans la classe de caractères qui le remplace. */
  dit('... pas de tiret long dans ce qu il affiche', false, pur.replace(/\[—–\]/g, '').includes('—'));
  const c = sansCommentaires(lis(COMPOSANT));
  dit('le composant : la direction (useEstDirection ET peutDemander du contrat), la fonction posée (useSaitIaMaison)', true,
    /const direction = useEstDirection\(\);/.test(c) && /const sait = useSaitIaMaison\(\);/.test(c) && /return direction && sait === true && peutDemander\(tete\?\.role, 'lettre', acces\[tete\?\.user_id \?\? ''\]\);/.test(c));
  dit('... sans ce droit, rien ne se montre', [true, true], [/const peut = usePeutRediger\(\);/.test(c), /if \(!peut\) return null;/.test(c)]);
  const i = (s: string) => c.indexOf(s);
  dit('... le garde-fou de la famille passe AVANT l appel, dans la même fonction, et refuse sans appeler', true,
    i('if (parleDeLaFamille(o.phrase)) return { message: MOT_DU_REFUS_FAMILLE };') > 0 && i('if (parleDeLaFamille(o.phrase))') < i('await demandeAClaude<unknown>({'));
  dit('... la demande : chantier « lettre », usage « texte », la consigne du module, le schéma, la phrase passée par pourClaude', [true, true, true, true, true],
    [/chantier: 'lettre',/.test(c), /usage: 'texte',/.test(c), /systeme: consigneDeLaLettre\(\{/.test(c), /schema: SCHEMA_DE_LA_LETTRE,/.test(c), /content: pourClaude\(o\.phrase\.trim\(\)\)/.test(c)]);
  dit('... la sortie de Claude est relue avant d être montrée (avec la phrase, pour la civilité), et le refus famille se dit', [true, true],
    [/const lettre = lectureDeLaLettre\(r\.data, o\.phrase\);/.test(c), /if \(lettre\.refus\) return \{ message: MOT_DU_REFUS_FAMILLE \};/.test(c)]);
  dit('... Claude n est demandé que sur un geste : « Rédiger » et « Une autre », jamais à l ouverture, jamais d envoi', [2, false, false],
    [(c.match(/await demandeLaLettre\(\{/g) ?? []).length, /useEffect\(\(\) => \{[^}]*demande/.test(c), /envoieSurWhatsApp|ouvreWhatsApp|functions\.invoke/.test(c)]);
  dit('... la fenêtre fermée pendant la rédaction : la réponse tombe, aucun brouillon ne naît', true,
    c.indexOf('if (!vivant.current) return;') > c.indexOf('const r = await demandeLaLettre({ phrase, auNomDe, ville });')
    && c.indexOf('if (!vivant.current) return;') < c.indexOf('surLettre(r.lettre, phrase);')
    && /useEffect\(\(\) => \{ vivant\.current = true; return \(\) => \{ vivant\.current = false; \}; \}, \[\]\);/.test(c));
  dit('... « Une autre » remplit la pièce telle qu elle est MAINTENANT, et pas une pièce signée entre-temps', [true, true],
    [/const actuelle = pieces\(secretariatStore\.get\(\)\)\.find\(\(x\) => x\.id === p\.id\);/.test(c), /if \(!actuelle \|\| !modifiable\(actuelle\)\) \{[^\n]*return; \}\s*remplisLaPiece\(actuelle, r\.lettre, phrase, \{ texteSeul: true \}\);/.test(c)]);
  dit('... « Écarter » efface le brouillon : la direction seule, un brouillon seulement, par le chemin existant', [true, true],
    [/\{direction && supprimable\(p\) && surEcarte && <Button[^\n]*onClick=\{ecarte\}/.test(c), /if \(effaceLaPiece\(p\)\) \{/.test(c)]);
  dit('... le composant ne numérote rien, ne signe rien, ne finalise rien : il remplit un brouillon par metsAJour', [false, true],
    [/prochainNumero|signeLaPiece|finalise\(|\bnumero\b|nouvellePiece/.test(c), /return metsAJour\(p, \{ \.\.\.patch, proposition: \{ par: 'claude', phrase: phrase\.trim\(\), le: new Date\(\)\.toISOString\(\) \} \}\);/.test(c)]);
  dit('... le bandeau de l éditeur ne vit que sur un brouillon marqué, « Une autre » garde le registre', [true, true],
    [/if \(!p\.proposition \|\| !modifiable\(p\)\) return null;/.test(c), /registreImpose: p\.modele/.test(c) && /\{ texteSeul: true \}/.test(c)]);
  dit('... il n importe rien du dossier de bourse ni des papiers de la famille', false, /from '[^']*(bourse|Bourse|Papiers|papiers)[^']*'|DossierBourse|LeDossierDeBourse/.test(c));
  dit('... pas de tiret long affiché', false, c.includes('—'));

  const e = sansCommentaires(lis(ECRAN));
  dit('Nouveau document monte le champ, jamais pour une lettre personnelle, et pour une autre entreprise une fois choisie', true,
    /\{entite !== 'perso' && \(entite !== 'autre' \|\| !!entrepriseChoisie\) && <RedigerDUnePhrase auNomDe=\{nomAuNomDe\} surLettre=\{\(lettre, phrase\) => choisis\(lettre\.registre, \{ lettre, phrase \}\)\} \/>\}/.test(e));
  dit('... la proposition passe par le chemin existant : nouvellePiece d abord, le remplissage ensuite, puis l éditeur', true,
    e.indexOf('const p = nouvellePiece({ branchId, entite: auNomDe,') > 0
    && e.indexOf('const p = nouvellePiece({ branchId, entite: auNomDe,') < e.indexOf('if (proposition) remplisLaPiece(p, proposition.lettre, proposition.phrase);')
    && e.indexOf('if (proposition) remplisLaPiece(p, proposition.lettre, proposition.phrase);') < e.indexOf('surCree(p.id);'));
  dit('... au nom de qui : la Maison, ACIA 1 ou l entreprise choisie', true, /const nomAuNomDe = entite === 'mnd' \? maisonNom\(\) : entite === 'acia' \? ACIA\.nom :/.test(e));

  const ed = sansCommentaires(lis(EDITEUR));
  dit('l éditeur montre le bandeau, et teinte cuivre les champs tant que la proposition est un brouillon', [true, true],
    [/<BandeauDeLaProposition p=\{p\} auNomDe=\{r\?\.enTete\.nom \?\? maisonNom\(\)\} ville=\{r\?\.enTete\.ville\} surEcarte=\{onClose\} \/>/.test(ed), /className=\{p\.proposition && ouvert \? 'sec-a-verifier' : undefined\}/.test(ed)]);
  dit('... « Garder et numéroter » EST le bouton Signer d aujourd hui : la signature du compte, le numéro par le chemin existant', [true, 2],
    [/signeLaPiece\(p, moi, image\)/.test(ed), (ed.match(/signeLaPiece\(/g) ?? []).length]);

  const sp = lis(SEC_PUR);
  dit('la pièce porte sa proposition (qui, la phrase, quand), rien de plus', true, /proposition\?: \{ par: 'claude'; phrase: string; le: string \};/.test(sp));
  const css = lis(CSS);
  dit('la teinte « à vérifier » est cuivre, jamais obsidienne', [true, false], [/\.sec-a-verifier \.mnd-input[^\n]*--copper-500[^\n]*--copper-50/.test(css), /obsidian/.test(css)]);

  /* Qui monte la rédaction : Nouveau document et l'éditeur, rien d'autre.
     Ni l'onglet Bourse scolaire, ni les papiers : la famille n'y passe pas. */
  const fichiers: string[] = [];
  const parcours = (d: string) => {
    for (const n of readdirSync(d)) {
      const f = path.join(d, n);
      if (statSync(f).isDirectory()) parcours(f);
      else if (/\.(tsx?|jsx?)$/.test(n)) fichiers.push(f.split(path.sep).join('/'));
    }
  };
  parcours('src');
  dit('seuls Nouveau document et l éditeur importent la rédaction d une phrase', [EDITEUR, ECRAN].sort(),
    fichiers.filter((f) => f !== COMPOSANT && /from '[^']*RedigerDUnePhrase'/.test(lis(f))).sort());
  dit('... et seul le composant demande une lettre à Claude', [COMPOSANT],
    fichiers.filter((f) => /chantier: 'lettre'/.test(sansCommentaires(lis(f)))));
}

console.log(ko === 0 ? '\nTOUT VA BIEN : le Secrétariat qui rédige tient ses promesses.' : `\n${ko} ÉCHEC(S)`);
if (ko) process.exitCode = 1;
