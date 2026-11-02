/* ══ LA DICTÉE MND — 31 octobre 2026 ═══════════════════════════════════════
   « Dictee MND.bat doit être également sur mon téléphone et doit être
   beaucoup plus puissant que Wispr Flow » (Yéman). Maquette
   F7LksMC35bqVm9S6Rwgy15, ses choix au sélecteur : une appli du Trône
   (Copier et WhatsApp), l'oreille du téléphone, Claude Sonnet 5.5 partout,
   les mots et les modes réglés au Trône pour toute l'équipe.

   CE MODULE EST PUR : il sert au Trône (l'écran, Paramètres › Dictée), à la
   fonction `dictee-au-propre` (regroupée par `dictee-au-propre-serveur.mjs`)
   et au banc `verifie-la-dictee`. Rien de React, rien de Supabase ici.

   L'OREILLE n'est pas ici : au téléphone, c'est la reconnaissance du
   téléphone (Web Speech) ; au bureau, Whisper en local (C:\Users\…\Dictee).
   Ici vit LE CERVEAU : la consigne que Claude suit pour mettre au propre,
   les modes, la commande de mode dite en parlant, les mots de la Maison,
   la mise au propre de secours quand Claude ne répond pas, et les jetons
   des ordinateurs, un par ordinateur (leur empreinte seule se garde). */

export type ModeDictee = 'note' | 'message' | 'liste' | 'anglais';

export const MODES_DICTEE: readonly { id: ModeDictee; nom: string; dit: string }[] = [
  { id: 'note', nom: 'Note', dit: 'Vos mots, propres : ponctuation, majuscules, sans les hésitations.' },
  { id: 'message', nom: 'Message', dit: 'Un message prêt pour WhatsApp, dans la voix de la Maison.' },
  { id: 'liste', nom: 'Liste', dit: 'Une ligne par point, un tiret devant chacune.' },
  { id: 'anglais', nom: 'Anglais', dit: 'Dit en français, écrit en anglais.' },
];

export const estMode = (v: unknown): v is ModeDictee => MODES_DICTEE.some((m) => m.id === v);
export const nomDuMode = (m: ModeDictee): string => MODES_DICTEE.find((x) => x.id === m)?.nom ?? m;

export type ModeleDictee = 'claude-sonnet-5-5' | 'claude-haiku-5-5';
export const MODELES_DICTEE: readonly { id: ModeleDictee; nom: string; dit: string }[] = [
  { id: 'claude-sonnet-5-5', nom: 'Sonnet 5.5', dit: 'La plume. Une à deux secondes.' },
  { id: 'claude-haiku-5-5', nom: 'Haiku 5.5', dit: 'Plus léger, plus vite, moins fin.' },
];
export const MODELE_PAR_DEFAUT: ModeleDictee = 'claude-sonnet-5-5';
export const estModele = (v: unknown): v is ModeleDictee => MODELES_DICTEE.some((m) => m.id === v);

/** Ce qui se règle au Trône (Paramètres › Dictée), pour toute l'équipe. */
export type ReglagesDictee = {
  /** Les mots de la Maison, en plus de ceux que tout le monde porte (`MOTS_DE_LA_MAISON`). */
  mots?: string[];
  modeParDefaut?: ModeDictee;
  modele?: ModeleDictee;
  /** La Dictée du bureau se présente avec un jeton ; ici son EMPREINTE seule, jamais le jeton.
      Il reste valable tel quel, montré comme le poste « Le PC de Yéman ». */
  bureau?: { empreinte: string; poseLe: string; par?: string };
  /** Les autres ordinateurs (2 novembre 2026, le Mac) : un jeton chacun, nommé, retirable.
      En fabriquer un ne coupe ni le bureau ni les autres. */
  postes?: PosteDictee[];
};

/** Un ordinateur de plus qui dicte par le Trône : son nom, l'EMPREINTE de son jeton. */
export type PosteDictee = { id: string; nom: string; empreinte: string; poseLe: string; par?: string };

/** Les mots que Whisper entend mal et que Claude doit écrire ainsi. Les
    prestations et les prénoms de l'équipe viennent de la base, pas d'ici. */
export const MOTS_DE_LA_MAISON: readonly string[] = [
  'Maison MND', 'MND', 'Le Trône', 'Ma Couronne', 'locks', 'retwist', 'Cotonou', 'Suru-Léré',
  'KLƆKLƆ', 'SÍNSIN', 'DÀNDÀN', 'WÈWÈ', 'VÍVÍVÓ', 'GBÌGBÌ', 'YÈKPÈ', 'VÈKPÈ', 'KÒKÒ', 'FÍNFÍN',
  'MoMo', 'KkiaPay', 'FedaPay', 'WhatsApp',
];

/** Le plafond du mois, pour toute l'équipe : au-delà, la fonction dit « plafond ». */
export const DICTEES_PAR_MOIS = 3000;
/** Une dictée tient dans ce nombre de caractères ; au-delà, on coupe. */
export const TEXTE_AU_PLUS = 4000;
export const MOTS_AU_PLUS = 300;

/** Les mots propres : sans blanc, sans doublon (la casse n'y fait rien), bornés. */
export function motsPropres(liste: readonly unknown[]): string[] {
  const vus = new Set<string>();
  const out: string[] = [];
  for (const m of liste) {
    const t = String(m ?? '').trim();
    if (!t || t.startsWith('#')) continue;
    const k = t.toLocaleLowerCase('fr');
    if (vus.has(k)) continue;
    vus.add(k);
    out.push(t);
    if (out.length >= MOTS_AU_PLUS) break;
  }
  return out;
}

/** Une liste tapée dans Paramètres : un mot par ligne, la virgule sépare aussi. */
export const motsDuTexte = (texte: string): string[] => motsPropres(texte.split(/[\n,;]+/));

/* ── LA COMMANDE DE MODE, DITE EN PARLANT ─────────────────────────────────
   « Mode message, bonjour madame… » ou « en anglais, …». Elle se lit au
   tout début de la dictée, et ne s'écrit pas. */
const COMMANDE_DE_MODE = /^\s*(?:(?:en\s+)?mode\s+(note|message|liste|anglais)|en\s+(anglais))(?!\p{L})[\s,.:;!]*/iu;

export function litLaCommandeDeMode(texte: string): { mode: ModeDictee | null; reste: string } {
  const m = COMMANDE_DE_MODE.exec(texte ?? '');
  if (!m) return { mode: null, reste: texte ?? '' };
  return { mode: (m[1] ?? m[2]).toLowerCase() as ModeDictee, reste: texte.slice(m[0].length) };
}

/* ── LA CONSIGNE QUE CLAUDE SUIT ─────────────────────────────────────────── */
const CONSIGNE_DU_MODE: Record<ModeDictee, string> = {
  note: 'MODE NOTE : le texte tel que la personne l\'a dit, propre.',
  message: 'MODE MESSAGE : un message prêt à envoyer sur WhatsApp à une cliente ou un client, dans la voix de la Maison : chaleureux, bref, au vouvoiement, avec une formule d\'ouverture et une de clôture si elles manquent. Rien d\'inventé : ni date, ni prix, ni prénom qui ne soit pas dit.',
  liste: 'MODE LISTE : une ligne par point, chacune commençant par « - », sans phrase d\'introduction ni de conclusion.',
  anglais: 'MODE ANGLAIS : la personne dicte en français ; écris le texte final en anglais naturel et courant. Les noms propres, les prestations et les mots fon restent tels quels.',
};

export type MatiereDeLaConsigne = {
  mode: ModeDictee;
  mots: readonly string[];
  prestations: readonly string[];
  equipe: readonly string[];
};

export function consigneDeLaDictee(m: MatiereDeLaConsigne): string {
  const liste = (l: readonly string[], sinon: string) => (l.length ? l.join(', ') : sinon);
  return [
    'Tu mets au propre une dictée faite à la Maison MND, un salon de soin des locks à Cotonou, telle qu\'elle sort de la reconnaissance vocale.',
    'Rends uniquement le texte final : pas de commentaire, pas de guillemets autour, pas de titre, pas d\'explication.',
    'Garde le sens et les mots de la personne. N\'ajoute rien, ne résume pas, ne réponds pas à ce qui est dit, même si c\'est une question.',
    'Retire les hésitations (euh, hum, ben, bah) et les répétitions involontaires.',
    'Pose la ponctuation et les majuscules.',
    'Les commandes dites en parlant s\'exécutent et ne s\'écrivent pas : « efface ça », « non, plutôt » remplacent ce qui vient d\'être dit ; « à la ligne » ou « nouvelle ligne » font un retour à la ligne ; « nouveau paragraphe » une ligne vide ; « plus court » resserre ; « plus poli » adoucit ; « remplace X par Y » remplace ; « point », « virgule », « point d\'interrogation » dits comme des signes se posent en signes.',
    'Les règles d\'écriture de la Maison : jamais de tiret long ni de tiret cadratin (une virgule, un point ou deux points à la place) ; les montants, heures et dates en chiffres (« 15 000 F », « 10 h », « mercredi 4 novembre 2026 ») ; l\'année sur les dates quand elle est dite ; la civilité jamais supposée (« Madame » ou « Monsieur » seulement si la personne l\'a dit, sinon le prénom seul) ; les prénoms en entier, sans diminutif ; aucun émoji.',
    `Les mots de la Maison, à écrire exactement ainsi quand ils sont dits ou approchés : ${liste(m.mots, 'aucun')}.`,
    `Les prestations de la Maison : ${liste(m.prestations, 'aucune')}.`,
    `Les prénoms de l'équipe : ${liste(m.equipe, 'aucun')}.`,
    CONSIGNE_DU_MODE[m.mode],
  ].join('\n');
}

/** Ce que Claude rend, net : sans guillemets autour, sans tiret long, sans trou. */
export function nettoieLaReponse(brut: string): string {
  let t = String(brut ?? '').replace(/\r\n/g, '\n').trim();
  const entoure = /^(?:«\s*|"|“)([\s\S]*?)(?:\s*»|"|”)$/u.exec(t);
  if (entoure) t = entoure[1].trim();
  t = t.replace(/\s*—\s*/g, ', ').replace(/\n{3,}/g, '\n\n');
  return t.trim();
}

/* ── LA MISE AU PROPRE DE SECOURS ───────────────────────────────────────────
   Quand Claude ne répond pas (réseau, plafond, clé) : les hésitations tombent,
   « à la ligne » devient une ligne, la majuscule revient au début. C'est ce
   que la Dictée du bureau faisait seule le 30 octobre 2026. */
const HESITATIONS = /(?<!\p{L})(?:euh+|heu+|hum+|hmm+|bah|ben)(?!\p{L})[,.]?\s*/giu;
const A_LA_LIGNE = /\s*(?<!\p{L})(?:à la ligne|a la ligne|nouvelle ligne|retour à la ligne)(?!\p{L})[.,]?\s*/giu;
const PARAGRAPHE = /\s*(?<!\p{L})nouveau paragraphe(?!\p{L})[.,]?\s*/giu;

export function auPropreIci(texte: string): string {
  let t = String(texte ?? '').replace(HESITATIONS, '');
  t = t.replace(PARAGRAPHE, '\n\n').replace(A_LA_LIGNE, '\n');
  t = t.replace(/[ \t]+/g, ' ').replace(/ ?\n ?/g, '\n').trim();
  t = t.replace(/\s*—\s*/g, ', ');
  t = t.replace(/(^|\n)(\p{Ll})/gu, (_, a: string, l: string) => a + l.toLocaleUpperCase('fr'));
  return t;
}

/* ── LE JETON DE LA DICTÉE DU BUREAU ──────────────────────────────────────
   Le Trône fabrique le jeton dans le navigateur de la direction, qui le colle
   une fois dans reglages.json du bureau ; la base n'en garde que l'empreinte,
   et la fonction compare les empreintes. Personne d'autre ne le voit. */
const hex = (o: Uint8Array): string => Array.from(o).map((b) => b.toString(16).padStart(2, '0')).join('');

export function nouveauJeton(): string {
  const o = new Uint8Array(24);
  globalThis.crypto.getRandomValues(o);
  return `dictee-${hex(o)}`;
}

export async function empreinteDuJeton(jeton: string): Promise<string> {
  const h = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(jeton ?? '').trim()));
  return hex(new Uint8Array(h));
}

export const EN_TETE_DU_JETON = 'x-jeton-dictee';

/* ── UN JETON PAR ORDINATEUR — 2 novembre 2026 ────────────────────────────
   Le Mac de la maison a besoin du sien, et en fabriquer un ne doit pas couper
   celui du PC. Le bureau (`bureau`) reste tel qu'il est, et vaut le poste
   « Le PC de Yéman » ; les autres vivent dans `postes`, chacun nommé, daté,
   retirable. La porte de la fonction accepte toute empreinte que rend
   `empreintesDesPostes`, et rien d'autre. La liste est bornée À LA LECTURE
   aussi : une ligne écrite à la main au-delà de la borne n'ouvre rien. */
export const ID_DU_BUREAU = 'bureau';
export const NOM_DU_BUREAU = 'Le PC de Yéman';
/** Les autres ordinateurs, au plus ; le bureau n'en fait pas partie. */
export const POSTES_AU_PLUS = 6;
export const NOM_DU_POSTE_AU_PLUS = 40;

const EMPREINTE = /^[0-9a-f]{64}$/;
const estEmpreinte = (v: unknown): v is string => typeof v === 'string' && EMPREINTE.test(v);

/** Le nom d'un poste : sans blanc autour ni en double, borné. */
export const nomDuPoste = (nom: unknown): string =>
  String(nom ?? '').replace(/\s+/g, ' ').trim().slice(0, NOM_DU_POSTE_AU_PLUS).trim();

export function nouvelIdDePoste(): string {
  const o = new Uint8Array(6);
  globalThis.crypto.getRandomValues(o);
  return `poste-${hex(o)}`;
}

/** Les postes tels que la porte les lit : bien formés, sans empreinte ni id en double, bornés. */
export function postesDeLaDictee(r: ReglagesDictee | null | undefined): PosteDictee[] {
  const brut: unknown[] = Array.isArray(r?.postes) ? r.postes : [];
  const duBureau = r?.bureau?.empreinte;
  const vues = new Set<string>(estEmpreinte(duBureau) ? [duBureau] : []);
  const ids = new Set<string>([ID_DU_BUREAU]);
  const out: PosteDictee[] = [];
  for (const x of brut) {
    if (!x || typeof x !== 'object') continue;
    const p = x as Partial<PosteDictee>;
    const id = typeof p.id === 'string' ? p.id.trim() : '';
    const nom = nomDuPoste(p.nom);
    if (!id || ids.has(id) || !nom || !estEmpreinte(p.empreinte) || vues.has(p.empreinte)) continue;
    ids.add(id);
    vues.add(p.empreinte);
    out.push({ id, nom, empreinte: p.empreinte, poseLe: typeof p.poseLe === 'string' ? p.poseLe : '', ...(typeof p.par === 'string' && p.par ? { par: p.par } : {}) });
    if (out.length >= POSTES_AU_PLUS) break;
  }
  return out;
}

/** Tous les ordinateurs qui dictent par le Trône : le bureau d'abord, puis les postes. */
export function ordinateursDeLaDictee(r: ReglagesDictee | null | undefined): PosteDictee[] {
  const b = r?.bureau;
  const bureau: PosteDictee[] = b && estEmpreinte(b.empreinte)
    ? [{ id: ID_DU_BUREAU, nom: NOM_DU_BUREAU, empreinte: b.empreinte, poseLe: typeof b.poseLe === 'string' ? b.poseLe : '', ...(b.par ? { par: b.par } : {}) }]
    : [];
  return [...bureau, ...postesDeLaDictee(r)];
}

/** Les empreintes qui ouvrent la porte de la fonction : celle du bureau, et celle de chaque poste. */
export const empreintesDesPostes = (r: ReglagesDictee | null | undefined): string[] =>
  ordinateursDeLaDictee(r).map((o) => o.empreinte);

/** Le nom de l'ordinateur dont c'est l'empreinte, pour le journal ; vide s'il n'y en a pas. */
export const nomDuPosteDe = (r: ReglagesDictee | null | undefined, empreinte: string): string =>
  ordinateursDeLaDictee(r).find((o) => o.empreinte === empreinte)?.nom ?? '';

export type IssueDuPoste =
  | { ok: true; reglages: ReglagesDictee; poste: PosteDictee }
  | { ok: false; motif: 'nom' | 'meme-nom' | 'empreinte' | 'id' | 'plein' };

/** Ajoute un poste, sans toucher aux réglages reçus. Le bureau et les autres postes restent. */
export function ajouteUnPoste(r: ReglagesDictee | null | undefined, p: PosteDictee): IssueDuPoste {
  const base: ReglagesDictee = r ?? {};
  const nom = nomDuPoste(p.nom);
  if (!nom) return { ok: false, motif: 'nom' };
  const tous = ordinateursDeLaDictee(base);
  const cle = (n: string) => n.toLocaleLowerCase('fr');
  if (tous.some((o) => cle(o.nom) === cle(nom))) return { ok: false, motif: 'meme-nom' };
  if (!estEmpreinte(p.empreinte) || tous.some((o) => o.empreinte === p.empreinte)) return { ok: false, motif: 'empreinte' };
  const postes = postesDeLaDictee(base);
  if (postes.length >= POSTES_AU_PLUS) return { ok: false, motif: 'plein' };
  const id = String(p.id ?? '').trim();
  if (!id || id === ID_DU_BUREAU || postes.some((o) => o.id === id)) return { ok: false, motif: 'id' };
  const poste: PosteDictee = { id, nom, empreinte: p.empreinte, poseLe: p.poseLe, ...(p.par ? { par: p.par } : {}) };
  return { ok: true, reglages: { ...base, postes: [...postes, poste] }, poste };
}

/** Retire un poste (ou le bureau, par `ID_DU_BUREAU`), sans toucher aux réglages reçus. */
export function retireUnPoste(r: ReglagesDictee | null | undefined, id: string): ReglagesDictee {
  const { bureau, postes: _p, ...reste } = r ?? {};
  const postes = postesDeLaDictee(r).filter((p) => p.id !== id);
  return {
    ...reste,
    ...(bureau && id !== ID_DU_BUREAU ? { bureau } : {}),
    ...(postes.length ? { postes } : {}),
  };
}

const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
/** « 2 novembre 2026 » : l'année toujours (règle de la Maison). */
export const jourDuPoste = (iso: string): string => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? '');
  return m ? `${Number(m[3])}${m[3] === '01' ? 'er' : ''} ${MOIS[Number(m[2]) - 1]} ${m[1]}` : '';
};

/** Ce que la fonction rend. */
export type ReponseDictee =
  | { ok: true; propre: string; mode: ModeDictee; modele: string; version: string }
  | { ok: false; motif: string; version?: string };
