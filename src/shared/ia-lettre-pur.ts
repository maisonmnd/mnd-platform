import { MODELES, modeleDe, type Modele } from './secretariat-modeles';
import { dateDite } from './secretariat-pur';

/* ══ LE SECRÉTARIAT QUI RÉDIGE — 19 octobre 2026 (chantier 8 des huit) ═══
   Maquette NKQMiMMY… validée par Yéman : « Nouvelle lettre, papier à
   en-tête. Une phrase (« Attestation de stage pour Awa K., du 1er au
   30 septembre 2026, pose et entretien de locks. ») et la lettre sort au bon
   registre, sur le papier à en-tête, numérotée et prête à signer comme
   aujourd'hui. Boutons : Garder et numéroter / Retoucher. Les papiers de la
   famille ne passent jamais par Claude. » Décision : « La direction seule
   (Yéman et Brice). »

   CE QUE CLAUDE REND EST UNE PROPOSITION. Elle remplit les champs existants
   d'un brouillon du Secrétariat (destinataire, objet, corps, formule),
   teintés cuivre « à vérifier » ; le numéro vient de la signature, par le
   chemin de toujours (secretariat.ts, `numerote`). Rien n'est numéroté ni
   gardé sans ce geste : « Garder et numéroter » EST le bouton « Signer »
   d'aujourd'hui ; « Retoucher », c'est éditer les champs.

   LA PHRASE DE YÉMAN passe par `pourClaude` (ia-anonymise-pur) : un numéro
   de téléphone ou une adresse glissés dedans ne partent pas. Les NOMS
   qu'elle écrit restent tels quels : c'est une lettre officielle, elle les
   choisit, et la liste des clientes n'est pas donnée à l'anonymiseur.

   MODULE PUR : ni écran, ni réseau. */

/* ── LES REGISTRES ──────────────────────────────────────────────────────
   Ce que Claude peut rédiger d'une phrase : les modèles du Secrétariat qui
   sont une lettre ou une attestation. Pas les contrats (plusieurs pages,
   quatre exemplaires, un juriste), pas le dossier OAPI, pas les pièces
   juridiques (procuration, mise en demeure : un juriste relit), pas la
   lettre personnelle (elle n'est pas au nom de la Maison), pas la page
   libre, ni le procès-verbal ni le règlement (ce ne sont pas des lettres). */
const FAMILLES_HORS_REDACTION: ReadonlySet<string> = new Set(['contrats', 'oapi', 'juridiques', 'perso', 'libre']);
const MODELES_HORS_REDACTION: ReadonlySet<string> = new Set(['proces-verbal', 'reglement-interieur']);
export const REGISTRES_DE_LA_LETTRE: readonly Modele[] = MODELES.filter((m) => !FAMILLES_HORS_REDACTION.has(m.famille) && !MODELES_HORS_REDACTION.has(m.cle));
export const CLES_DES_REGISTRES: readonly string[] = REGISTRES_DE_LA_LETTRE.map((m) => m.cle);
/** Un registre que Claude nomme mal retombe sur la lettre officielle. */
export const REGISTRE_PAR_DEFAUT = 'lettre';

/* ── LES BORNES ───────────────────────────────────────────────────────── */
export const PARAGRAPHES_MAX = 8;
export const MOTS_MAX = 1200;
export const LIGNES_DU_DESTINATAIRE_MAX = 5;
export const OBJET_MAX = 160;
export const FORMULE_MAX = 300;
/** Une phrase, pas une page. */
export const PHRASE_MAX = 600;

/** L'exemple de la maquette, montré en filigrane dans le champ. */
export const EXEMPLE_DE_PHRASE = 'Attestation de stage pour Awa K., du 1er au 30 septembre 2026, pose et entretien de locks.';

export const MOT_DU_REFUS_FAMILLE = 'Les papiers de la famille ne passent jamais par Claude : écrivez cette pièce à la main.';

/** Ce que Claude rend, une fois relu par `lectureDeLaLettre`. */
export type LettreProposee = {
  /** Une clef de REGISTRES_DE_LA_LETTRE (un modèle du Secrétariat). */
  registre: string;
  /** Une à cinq lignes, séparées par un saut de ligne ; vide pour une attestation. */
  destinataire: string;
  objet: string;
  /** 1 à 8 paragraphes. */
  corps: string[];
  /** La formule de politesse entière ; vide pour une attestation. */
  formule: string;
  /** La phrase parlait des papiers de la famille : rien n'a été rédigé. */
  refus?: 'famille';
};

/* ── LE GARDE-FOU DE LA FAMILLE, CÔTÉ TRÔNE, AVANT TOUT APPEL ──────────
   « Les papiers de la famille ne passent jamais par Claude. » Des mots
   GÉNÉRIQUES seulement : aucun prénom de la famille ne vit dans le code
   (il y serait lisible de tous, dépôt public). Les possessifs à la première
   personne (« mon fils », « ma fille ») disent la famille de qui écrit ;
   « sa fille » (une cliente et sa fille) ne déclenche rien. L'attestation
   d'hébergement est le papier classique d'un visa. */
export const MOTS_DE_LA_FAMILLE: readonly string[] = [
  'bourse', 'scolaire', 'scolarite', 'passeport', 'visa', 'carte d identite', 'piece d identite', 'cip',
  'acte de naissance', 'livret de famille', 'certificat de nationalite', 'hebergement',
  'mon fils', 'ma fille', 'mes enfants', 'mon mari', 'mon epoux', 'ma femme', 'mon epouse',
];

/** Minuscules, sans accent, apostrophes et blancs aplatis : pour comparer. */
const aPlat = (s: string): string =>
  String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[’'`]/g, ' ').replace(/\s+/g, ' ').trim();
const echappe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function parleDeLaFamille(phrase: string): boolean {
  const t = aPlat(phrase);
  if (!t) return false;
  return MOTS_DE_LA_FAMILLE.some((m) => new RegExp(`(^|[^a-z0-9])${echappe(aPlat(m))}s?(?=$|[^a-z0-9])`).test(t));
}

/** La phrase est-elle recevable ? `null` : oui ; sinon, ce qu'on lui dit. */
export function defautDeLaPhrase(phrase: string): string | null {
  const t = String(phrase ?? '').trim();
  if (!t) return 'Écrivez une phrase : ce que la pièce doit dire, et pour qui.';
  if (t.length > PHRASE_MAX) return `Une phrase, pas une page : ${PHRASE_MAX} signes au plus.`;
  return null;
}

/* ── LA CONSIGNE ──────────────────────────────────────────────────────── */
export function consigneDeLaLettre(o: { auNomDe: string; dateDuJour: string; ville?: string; registreImpose?: string }): string {
  const ville = (o.ville ?? '').trim() || 'Cotonou';
  const nom = (o.auNomDe ?? '').trim() || 'la Maison MND';
  const registres = REGISTRES_DE_LA_LETTRE.map((m) => ` · ${m.cle} : ${m.titre}`).join('\n');
  const impose = o.registreImpose && CLES_DES_REGISTRES.includes(o.registreImpose) ? modeleDe(o.registreImpose) : null;
  return [
    `Tu rédiges pour ${nom}, à ${ville} (Bénin), une pièce officielle qui sortira sur son papier à en-tête, numérotée et signée par la direction. Tu reçois une seule phrase ; tu rends la pièce complète, et rien d’autre.`,
    '',
    impose
      ? `LE REGISTRE est déjà choisi : « ${impose.cle} » (${impose.titre}). Garde-le, et rédige une autre version.`
      : `LE REGISTRE : choisis-le dans cette liste, par sa clef, selon ce que la phrase demande :\n${registres}\nSi rien ne convient, « ${REGISTRE_PAR_DEFAUT} » (Lettre officielle).`,
    '',
    `LE TON : un français administratif sobre et juste, au vouvoiement. Une attestation se rédige à la première personne (« Je soussigné(e) {signataire}, {qualite} de {entreprise}, atteste que… »), sans formule d’appel ni de politesse, et finit par « La présente attestation lui est délivrée pour servir et valoir ce que de droit. ». Une lettre parle en « nous » au nom de ${nom}, et se ferme par une formule de politesse (champ « formule »). Une convocation, un avertissement, une demande d’explication, une relance : fermes et courtois. Un remerciement, des félicitations : chaleureux et brefs.`,
    '',
    'LES JETONS : écris {entreprise}, {signataire}, {qualite} et {ville} tels quels, entre accolades : le Trône les remplit (le nom de la Maison, qui signe, sa qualité, la ville).',
    '',
    'CE QUE TU N’INVENTES JAMAIS : aucune donnée que la phrase ne donne pas. Ni date, ni montant, ni numéro de pièce d’identité, ni numéro de dossier, de facture ou de contrat, ni adresse, ni poste, ni durée. Ce que la pièce exige et que la phrase ne dit pas s’écrit [À COMPLÉTER], entre crochets, tel quel : la direction le remplira avant de signer. Les noms de personnes s’écrivent comme la phrase les écrit, sans les compléter ni les deviner.',
    '',
    'LES INTERDITS : jamais le mot « salon » (on dit « la Maison ») ; jamais de tiret long (une virgule à la place) ; aucun numéro de téléphone ; pas de « Objet : » dans le champ objet ; pas de signature, pas de nom de signataire, pas de lieu ni de date de signature dans le corps.',
    '',
    `LA DATE ET LE LIEU : la pièce est faite à ${ville}, le ${dateDite(o.dateDuJour)} (${o.dateDuJour}). Le papier l’imprime en tête, avec la zone de signature : ne l’écris pas dans le corps. Toute date que tu écris porte son année, en toutes lettres pour le mois (« 1er au 30 septembre 2026 »).`,
    '',
    'LES PAPIERS DE LA FAMILLE : si la phrase parle d’un membre de la famille de la direction, d’une bourse scolaire, d’un passeport, d’un visa, d’une pièce d’identité ou d’un acte d’état civil, tu ne rédiges rien : rends refus = « famille », et laisse tous les autres champs vides.',
    '',
    `LA FORME : destinataire sur une à ${LIGNES_DU_DESTINATAIRE_MAX} lignes (nom, service ou qualité, ville), vide pour une attestation ; objet en une ligne ; corps en 1 à ${PARAGRAPHES_MAX} paragraphes (chaque paragraphe une chaîne, sans ligne vide dedans), ${MOTS_MAX} mots au plus en tout ; formule = la phrase de politesse entière, ou vide.`,
  ].join('\n');
}

/** La forme attendue, donnée à la fonction comme un outil à appeler. */
export const SCHEMA_DE_LA_LETTRE: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  properties: {
    registre: { type: 'string', enum: [...CLES_DES_REGISTRES], description: 'La clef du registre choisi.' },
    destinataire: { type: 'string', description: 'Une à cinq lignes séparées par un saut de ligne ; vide pour une attestation.' },
    objet: { type: 'string', description: 'Une ligne, sans « Objet : ».' },
    corps: { type: 'array', items: { type: 'string' }, maxItems: PARAGRAPHES_MAX, description: 'Les paragraphes, un par entrée.' },
    formule: { type: 'string', description: 'La formule de politesse entière ; vide pour une attestation.' },
    refus: { type: 'string', enum: ['famille'], description: 'Seulement si la phrase parle des papiers de la famille.' },
  },
  required: ['registre', 'destinataire', 'objet', 'corps', 'formule'],
};

/* ── LA LECTURE : ON NE FAIT PAS CONFIANCE À LA SORTIE ─────────────────── */

/** Le tiret long (et le demi-cadratin) devient une virgule, blancs compris. */
export const sansTiretLong = (s: string): string => String(s ?? '').replace(/\s*[—–]\s*/g, ', ');
/** « salon », au singulier ou au pluriel, quelle que soit la casse. */
export const contientSalon = (s: string): boolean => /(^|[^\p{L}])salons?(?=$|[^\p{L}])/iu.test(String(s ?? ''));
const nombreDeMots = (s: string): number => s.trim().split(/\s+/).filter(Boolean).length;
/** Un texte d'une ligne : sans tiret long, blancs aplatis, borné. */
const texteLu = (x: unknown, max: number): string =>
  typeof x === 'string' ? sansTiretLong(x).replace(/\s+/g, ' ').trim().slice(0, max).trim() : '';

/** Le registre, s'il est connu ; sinon la lettre officielle. */
export function registreLu(x: unknown): string {
  const k = typeof x === 'string' ? x.trim().toLowerCase() : '';
  return CLES_DES_REGISTRES.includes(k) ? k : REGISTRE_PAR_DEFAUT;
}

export function lectureDeLaLettre(x: unknown): LettreProposee | null {
  if (!x || typeof x !== 'object' || Array.isArray(x)) return null;
  const o = x as Record<string, unknown>;
  /* Le refus d'abord : la phrase parlait de la famille, il n'y a rien à lire. */
  if (o.refus === 'famille') return { registre: REGISTRE_PAR_DEFAUT, destinataire: '', objet: '', corps: [], formule: '', refus: 'famille' };
  if (o.refus !== undefined && o.refus !== null && o.refus !== '') return null;
  const registre = registreLu(o.registre);
  const destinataire = typeof o.destinataire === 'string'
    ? o.destinataire.replace(/\r\n/g, '\n').split('\n').map((l) => texteLu(l, 120)).filter(Boolean).slice(0, LIGNES_DU_DESTINATAIRE_MAX).join('\n')
    : '';
  const objet = texteLu(o.objet, OBJET_MAX).replace(/^objet\s*:\s*/i, '').trim();
  const formule = texteLu(o.formule, FORMULE_MAX);
  if (!Array.isArray(o.corps)) return null;
  const corps = o.corps
    .filter((p): p is string => typeof p === 'string')
    .map((p) => sansTiretLong(p).replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    /* « Fait à Cotonou, le … » : le papier l'imprime déjà ; en double, non. */
    .filter((p) => !/^fait [àa] /i.test(p));
  if (corps.length < 1 || corps.length > PARAGRAPHES_MAX) return null;
  if (nombreDeMots(corps.join(' ')) > MOTS_MAX) return null;
  if ([destinataire, objet, formule, ...corps].some(contientSalon)) return null;
  return { registre, destinataire, objet: objet || modeleDe(registre).titre, corps, formule };
}

/* ── CE QUI REMPLIT LE BROUILLON ──────────────────────────────────────── */

/** Les champs d'une pièce du Secrétariat que la proposition remplit. Le
    modèle décide des formules : une attestation n'a ni appel ni politesse,
    quoi que Claude ait rendu ; une lettre dont Claude n'a pas donné la
    formule garde celle du modèle (le champ n'est pas touché). */
export function champsDeLaLettre(l: LettreProposee): { modele: string; titre: string; aRelire?: boolean; destinataire: string; objet: string; corps: string; appel?: string; cloture?: string } {
  const m = modeleDe(l.registre);
  return {
    modele: m.cle,
    titre: m.titre,
    aRelire: m.aRelire,
    destinataire: l.destinataire,
    objet: l.objet,
    corps: l.corps.join('\n\n'),
    ...(m.appel < 0 ? { appel: '' } : {}),
    ...(m.cloture < 0 ? { cloture: '' } : l.formule ? { cloture: l.formule } : {}),
  };
}
