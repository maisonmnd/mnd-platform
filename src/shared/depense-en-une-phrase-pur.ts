/* ══ UNE DÉPENSE EN UNE PHRASE · 5 novembre 2026 ══════════════════════════
   « How can we automate Grenat's expenses? », puis « et aussi un message
   direct dans le Trône pour enregistrer une dépense » (Yéman). Maquette
   « Les dépenses préparées par Grenat » (FyXznPQfTLKnL5MQgbn4C1), validée :
   « construis, dans cet ordre ». Première étape : le message au Trône, puis
   les engagements de chaque mois (engagements-du-mois-pur.ts).

   LA PHRASE SE LIT SANS IA PAYANTE. Des règles, rien d'autre : le montant
   (« 3 000 F », « 3000 », « 3 mille »), la caisse ou le moyen (« espèces »,
   « MoMo », le nom d'une caisse), qui a payé (« payé par Brice »), le jour
   (« hier », « aujourd'hui », une date), la catégorie devinée par ses mots
   (les vraies catégories de `expense_categories`), le libellé = le reste.

   GRENAT MONTRE CE QU'IL A LU AVANT DE POSER. Ce qu'il ne comprend pas, il le
   demande (pas de montant, deux montants, une caisse inconnue, quelqu'un qui
   n'achète pas pour la Maison, un jour dans l'avenir) ; il ne devine jamais
   un montant. Il refuse un prestataire (sa mission naît du rituel honoré),
   une dépense de la famille (elle reste à Cristal, hors du Trône) et le
   doublon du jour (même montant, même jour, même bénéficiaire).

   QUI ÉCRIT DÉCIDE DE L'ÉTAT (son choix, 5 novembre 2026) : écrite par la
   direction (souverain ou gérant), la dépense est enregistrée acquise, c'est
   déjà son oui ; écrite par l'équipe, elle attend la validation de toujours
   (`validation.etat: 'attente'`, `soumisPar` son nom), et Grenat la met sous
   les yeux à la clôture du soir.

   CE FICHIER EST PUR : ni magasin, ni base. L'écran lit, ce module tranche. */

import {
  CAISSE_PAR_DEFAUT, JOURS_EN_ARRIERE, MONTANT_AU_PLUS_XOF, doublonDeLaDepense, porteurConnu, prestataireNomme,
  type DepenseExistante,
} from './assistants-depenses-pur';

export { CAISSE_PAR_DEFAUT };

/** Une phrase de plus de deux cents signes ne se lit pas : elle se saisit par « + Dépense ». */
export const PHRASE_AU_PLUS = 200;

/** Sans accents, en minuscules, l'apostrophe droite, les espaces insécables rendus. */
export const plat = (s: string): string => String(s ?? '')
  .normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/[’`´]/g, "'").replace(/[  \t]/g, ' ');

const MOIS = ['janvier', 'fevrier', 'mars', 'avril', 'mai', 'juin', 'juillet', 'aout', 'septembre', 'octobre', 'novembre', 'decembre'];
const MOIS_ECRITS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const JOURS_SEMAINE = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];

/** « 3 novembre 2026 », « 1er novembre 2026 » : la date dite, l'année toujours. */
export const dateEcrite = (iso: string): string => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  const j = Number(m[3]);
  return `${j}${j === 1 ? 'er' : ''} ${MOIS_ECRITS[Number(m[2]) - 1] ?? ''} ${m[1]}`;
};

/** Les francs dits, comme la Maison les écrit : « 3 000 F ». */
export const francs = (n: number): string => `${String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} F`;

const isoDe = (d: Date): string => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
const jourDe = (iso: string): Date => new Date(`${iso}T12:00:00Z`);
const decale = (iso: string, jours: number): string => { const d = jourDe(iso); d.setUTCDate(d.getUTCDate() + jours); return isoDe(d); };
const dateValide = (a: number, m: number, j: number): string | null => {
  if (!(m >= 1 && m <= 12 && j >= 1 && j <= 31)) return null;
  const d = new Date(Date.UTC(a, m - 1, j, 12));
  return d.getUTCMonth() === m - 1 ? isoDe(d) : null;
};

/* ── LES MOTS DE LA PHRASE ───────────────────────────────────────────────── */

type Jeton = { brut: string; p: string; genre: 'nombre' | 'date' | 'mot' | 'signe'; valeur?: number; pris?: boolean };

/** Un nombre groupé (« 3 000 », « 300 000 », « 3.000 »), une date (« 03/11/2026 », « 2026-11-03 »),
    un nombre simple (« 2500 », « 2,5 »), un mot (« aujourd'hui », « d'eau »), un signe. */
const DECOUPE = /\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}(?:\/\d{2,4})?|\d{1,3}(?:[   .]\d{3})+(?!\d)|\d+(?:,\d+)?|\p{L}+(?:['’]\p{L}+)*|[^\s\p{L}\d]/gu;

function decoupe(phrase: string): Jeton[] {
  const jetons: Jeton[] = [];
  for (const m of phrase.matchAll(DECOUPE)) {
    const brut = m[0];
    const p = plat(brut);
    if (/^\d{4}-\d{2}-\d{2}$/.test(brut) || /^\d{1,2}\/\d{1,2}(?:\/\d{2,4})?$/.test(brut)) jetons.push({ brut, p, genre: 'date' });
    else if (/^\d/.test(brut)) jetons.push({ brut, p, genre: 'nombre', valeur: Number(brut.replace(/[   .]/g, '').replace(',', '.')) });
    else if (/^\p{L}/u.test(brut)) jetons.push({ brut, p, genre: 'mot' });
    else jetons.push({ brut, p, genre: 'signe' });
  }
  return jetons;
}

const NOMBRES_DITS: Record<string, number> = {
  un: 1, une: 1, deux: 2, trois: 3, quatre: 4, cinq: 5, six: 6, sept: 7, huit: 8, neuf: 9, dix: 10,
  onze: 11, douze: 12, treize: 13, quatorze: 14, quinze: 15, seize: 16, vingt: 20, trente: 30,
  quarante: 40, cinquante: 50, soixante: 60, cent: 100,
};
const MARQUES_DE_FRANCS = new Set(['f', 'fr', 'frs', 'franc', 'francs', 'fcfa', 'cfa', 'xof']);

/* ── LE CONTEXTE ET LA LECTURE ───────────────────────────────────────────── */

export type ContexteDeLaPhrase = {
  /** Le jour d'aujourd'hui, aaaa-mm-jj. */
  aujourdhui: string;
  /** Les caisses que CE compte peut choisir (une caisse d'équipe, ou toutes pour la direction). */
  caisses: readonly string[];
  /** La caisse des espèces (la caisse par défaut), celle de MoMo et de MoMo Privé, si elles sont parmi `caisses`. */
  caisseDesEspeces?: string;
  caisseMomo?: string;
  caisseMomoPrive?: string;
  /** Ceux qui achètent pour la Maison (`mnd_porteurs`). */
  porteurs: readonly string[];
  /** Les catégories de la Maison (`expense_categories`). */
  categories: readonly { name: string; subs?: readonly string[] }[];
  /** Un compte de l'équipe signe de son nom : son porteur ne se choisit pas. */
  signeDe?: string;
};

export type LectureDeLaPhrase = {
  phrase: string;
  montantXof?: number;
  /** Les montants vus quand il y en a plusieurs (Grenat demande lequel). */
  montantsVus: number[];
  date: string;
  /** Comment le jour s'est dit : « aujourd'hui » quand rien n'est dit. */
  jourDit: 'aujourdhui' | 'hier' | 'avant-hier' | 'date' | 'rien';
  caisse?: string;
  /** Comment la caisse s'est dite. */
  caisseDite: 'especes' | 'momo' | 'momo-prive' | 'nom' | 'defaut' | 'rien';
  porteur?: string;
  /** « payé par X », X inconnu de la Maison. */
  porteurInconnu?: string;
  laMaisonAPaye: boolean;
  avancee: boolean;
  categorie: string;
  sousCategorie?: string;
  /** La catégorie vient d'un mot de la phrase (sinon : la catégorie de repli, Divers). */
  categorieDevinee: boolean;
  libelle: string;
  /** Ce que Grenat demande avant de poser. Vide : la dépense peut se poser. */
  questions: string[];
};

const MOTS_DES_ESPECES = new Set(['especes', 'espece', 'cash', 'liquide']);
const MOTS_DE_MOMO = new Set(['momo', 'momopay', 'mtn']);
const MOTS_DU_PRIVE = new Set(['prive', 'privee', 'perso', 'personnel']);
/** Les caisses au nom d'un mot courant ne se lisent qu'après « caisse ». */
const NOMS_COMMUNS = new Set(['autres', 'carte', 'cheque', 'cheques', 'especes', 'principale']);

/* LES MOTS DES CATÉGORIES : le premier mot reconnu dans la phrase décide
   (« transport des produits » est de la Logistique). Ces catégories sont
   celles de la Maison ; une catégorie absente de sa liste ne se propose pas. */
const MOTS_DES_CATEGORIES: readonly { cat: string; mots: RegExp; sous?: readonly [RegExp, string][] }[] = [
  { cat: 'Logistique', mots: /^(transports?|taxis?|zems?|zemidjans?|motos?|essence|carburant|gasoil|livraisons?|livreurs?|coursiers?|gozem|uber|deplacements?|voyages?|bus|colis|expeditions?|dhl|stockage)$/,
    sous: [[/^(livraisons?|livreurs?|colis|expeditions?|dhl)$/, 'Livraisons'], [/^coursiers?$/, 'Coursiers'], [/^stockage$/, 'Stockage']] },
  { cat: 'Local', mots: /^(loyers?|bail|electricite|courant|sbee|soneb|internet|wifi|fibre|telephone|forfait|gardien|gardiennage|menage|nettoyage|entretien|reparations?|peinture)$/,
    sous: [[/^(loyers?|bail)$/, 'Loyer'], [/^(electricite|courant|sbee|soneb)$/, 'Énergie'], [/^(internet|wifi|fibre|telephone|forfait)$/, 'Internet & téléphone'], [/^(menage|nettoyage|entretien|reparations?|peinture)$/, 'Entretien des lieux']] },
  { cat: 'Matières premières', mots: /^(meches?|beurres?|karite|huiles?|plantes?|aloe|cire|shampoings?|pots?|flacons?|contenants?|emballages?|packaging|poudres?|cristaux|extensions?|gels?)$/,
    sous: [[/^(beurres?|karite)$/, 'Beurres'], [/^(plantes?|aloe)$/, 'Plantes & actifs'], [/^(pots?|flacons?|contenants?|emballages?|packaging)$/, 'Contenants & packaging'], [/^(poudres?|cristaux)$/, 'Cristaux & poudres']] },
  { cat: 'Sous-traitance', mots: /^(sous-traitance|soustraitance|tresseuses?|couturieres?|menuisiers?|electriciens?|plombiers?|macons?|artisans?)$/ },
  { cat: 'Marketing', mots: /^(publicites?|pub|sponsorisation|flyers?|affiches?|banderoles?|shooting|photographes?|influenceuses?|influenceurs?|impressions?)$/ },
  { cat: 'Équipement', mots: /^(fauteuils?|miroirs?|ciseaux|tondeuses?|outils?|ordinateurs?|imprimantes?|mobilier|chaises?|ventilateurs?|climatiseurs?)$/ },
  { cat: 'Frais bancaires', mots: /^(agios|commissions?)$/ },
];
const CATEGORIE_DE_REPLI = 'Divers';

/** RIEN DE LA FAMILLE : les factures et frais du foyer restent à Cristal, hors du Trône. */
const MOTS_DE_LA_FAMILLE = /^(ecoles?|scolarite|scolaires?|cantine|creche|pediatre|nounou)$/;

/* Les petits mots qui restent au bord du libellé une fois le reste lu. */
const BORDS = new Set(['paye', 'payee', 'payes', 'payees', 'en', 'par', 'de', 'du', 'des', 'le', 'la', 'les', 'pour', 'avec', 'et', 'a', 'au', 'sur', 'caisse', 'via', 'dans', 'depuis', 'ce', 'cet', 'cette']);

function laCategorie(jetons: readonly Jeton[], categories: ContexteDeLaPhrase['categories']): { categorie: string; sous?: string; devinee: boolean } {
  const connue = (nom: string) => categories.find((c) => plat(c.name) === plat(nom));
  for (const j of jetons) {
    if (j.genre !== 'mot') continue;
    for (const r of MOTS_DES_CATEGORIES) {
      if (!r.mots.test(j.p)) continue;
      const c = connue(r.cat);
      if (!c) continue;
      const sous = r.sous?.find(([re]) => re.test(j.p))?.[1];
      return { categorie: c.name, ...(sous && c.subs?.includes(sous) ? { sous } : {}), devinee: true };
    }
  }
  const repli = connue(CATEGORIE_DE_REPLI) ?? categories[0];
  return { categorie: repli?.name ?? CATEGORIE_DE_REPLI, devinee: false };
}

/** LA PHRASE, LUE. Pure : la même phrase, le même jour, les mêmes listes rendent la même lecture. */
export function lisLaPhrase(phraseBrute: string, ctx: ContexteDeLaPhrase): LectureDeLaPhrase {
  const phrase = String(phraseBrute ?? '').replace(/\s+/g, ' ').trim();
  const questions: string[] = [];
  const jetons = decoupe(phrase.slice(0, PHRASE_AU_PLUS));
  const n = jetons.length;
  const mot = (i: number): string => (i >= 0 && i < n && jetons[i].genre === 'mot' ? jetons[i].p : '');
  const prends = (...is: number[]) => { for (const i of is) if (i >= 0 && i < n) jetons[i].pris = true; };

  /* ① LE JOUR. « aujourd'hui », « hier », « avant-hier », un jour de la
     semaine (le plus récent, aujourd'hui compris), « le 3 novembre (2026) »,
     « le 3 », « 03/11(/2026) », « 2026-11-03 ». Un mois seul (« loyer
     novembre ») n'est pas un jour : il reste au libellé. */
  let date = ctx.aujourdhui;
  let jourDit: LectureDeLaPhrase['jourDit'] = 'rien';
  const [ay, am] = ctx.aujourdhui.split('-').map(Number);
  /* Une date sans année est celle de cette année ; loin dans l'avenir (plus
     de deux mois), c'est celle de l'an passé (« le 20 décembre » dit en
     janvier). Proche, elle reste à venir, et Grenat le dit. */
  const dansLePasse = (iso: string | null, unAnAvant: () => string | null): string | null =>
    (iso && iso > ctx.aujourdhui && (jourDe(iso).getTime() - jourDe(ctx.aujourdhui).getTime()) / 86_400_000 > 62 ? unAnAvant() : iso);
  for (let i = 0; i < n && jourDit === 'rien'; i++) {
    const j = jetons[i];
    if (j.genre === 'mot') {
      if (j.p === "aujourd'hui" || (j.p === 'ce' && /^(jour|matin|soir|midi)$/.test(mot(i + 1)))) {
        jourDit = 'aujourdhui'; prends(i); if (j.p === 'ce') prends(i + 1); break;
      }
      if (j.p === 'avant' && mot(i + 1) === 'hier') { date = decale(ctx.aujourdhui, -2); jourDit = 'avant-hier'; prends(i, i + 1); break; }
      if (j.p === 'avant' && jetons[i + 1]?.p === '-' && mot(i + 2) === 'hier') { date = decale(ctx.aujourdhui, -2); jourDit = 'avant-hier'; prends(i, i + 1, i + 2); break; }
      if (j.p === "avant-hier") { date = decale(ctx.aujourdhui, -2); jourDit = 'avant-hier'; prends(i); break; }
      if (j.p === 'hier') { date = decale(ctx.aujourdhui, -1); jourDit = 'hier'; prends(i); break; }
      const js = JOURS_SEMAINE.indexOf(j.p);
      if (js >= 0) {
        const d = jourDe(ctx.aujourdhui);
        const recul = (d.getUTCDay() - js + 7) % 7;
        date = decale(ctx.aujourdhui, -recul); jourDit = recul === 0 ? 'aujourdhui' : recul === 1 ? 'hier' : 'date';
        prends(i); if (mot(i + 1) === 'dernier') prends(i + 1);
        break;
      }
    }
    if (j.genre === 'date') {
      const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(j.brut);
      const fr = /^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/.exec(j.brut);
      let trouvee: string | null = null;
      if (iso) trouvee = dateValide(Number(iso[1]), Number(iso[2]), Number(iso[3]));
      else if (fr) {
        const a = fr[3] ? (fr[3].length === 2 ? 2000 + Number(fr[3]) : Number(fr[3])) : ay;
        trouvee = fr[3] ? dateValide(a, Number(fr[2]), Number(fr[1])) : dansLePasse(dateValide(a, Number(fr[2]), Number(fr[1])), () => dateValide(a - 1, Number(fr[2]), Number(fr[1])));
      }
      if (trouvee) { date = trouvee; jourDit = 'date'; prends(i); if (mot(i - 1) === 'le') prends(i - 1); }
      else { questions.push(`La date « ${j.brut} » ne se lit pas : quel jour ?`); prends(i); jourDit = 'date'; date = ''; }
      break;
    }
    /* « le 3 novembre 2026 », « 1er novembre », « le 3 » */
    if (j.genre === 'nombre' && Number.isInteger(j.valeur) && j.valeur! >= 1 && j.valeur! <= 31) {
      const suivant = mot(i + 1);
      const avecEr = suivant === 'er' ? 1 : 0;
      const mois = MOIS.indexOf(mot(i + 1 + avecEr));
      if (mois >= 0) {
        const anJ = jetons[i + 2 + avecEr];
        const an = anJ && anJ.genre === 'nombre' && /^\d{4}$/.test(anJ.brut) ? Number(anJ.brut) : null;
        const trouvee = an ? dateValide(an, mois + 1, j.valeur!) : dansLePasse(dateValide(ay, mois + 1, j.valeur!), () => dateValide(ay - 1, mois + 1, j.valeur!));
        prends(i, i + 1 + avecEr); if (avecEr) prends(i + 1); if (an) prends(i + 2 + avecEr); if (mot(i - 1) === 'le') prends(i - 1);
        if (trouvee) { date = trouvee; jourDit = 'date'; }
        else { questions.push('Cette date n’existe pas : quel jour ?'); date = ''; jourDit = 'date'; }
        break;
      }
      const precedent = mot(i - 1);
      const marqueApres = MARQUES_DE_FRANCS.has(mot(i + 1)) || /^(mille|million|millions|k)$/.test(mot(i + 1));
      if (precedent === 'le' && !marqueApres) {
        const trouvee = dansLePasse(dateValide(ay, am, j.valeur!), () => {
          const d = jourDe(`${ay}-${String(am).padStart(2, '0')}-01`); d.setUTCMonth(d.getUTCMonth() - 1);
          return dateValide(d.getUTCFullYear(), d.getUTCMonth() + 1, j.valeur!);
        });
        prends(i - 1, i);
        if (trouvee) { date = trouvee; jourDit = 'date'; } else { questions.push('Ce jour n’existe pas ce mois-ci : quel jour ?'); date = ''; jourDit = 'date'; }
        break;
      }
    }
  }
  if (date) {
    if (date > ctx.aujourdhui) questions.push(`Le ${dateEcrite(date)} est à venir : une dépense se saisit le jour où elle est faite.`);
    else if ((jourDe(ctx.aujourdhui).getTime() - jourDe(date).getTime()) / 86_400_000 > JOURS_EN_ARRIERE) {
      questions.push(`Le ${dateEcrite(date)} a plus de ${JOURS_EN_ARRIERE} jours : saisissez-la par « + Dépense ».`);
    }
  }

  /* ② LE MONTANT. Un nombre qui dit ses francs (« F », « FCFA », « francs »)
     ou ses milliers (« 3 mille ») passe devant un nombre nu ; deux montants
     également possibles, Grenat demande lequel. */
  type Candidat = { valeur: number; marque: boolean; de: number; a: number };
  const candidats: Candidat[] = [];
  for (let i = 0; i < n; i++) {
    const j = jetons[i];
    if (j.pris) continue;
    let base: number | null = null;
    if (j.genre === 'nombre') base = j.valeur ?? null;
    else if (j.genre === 'mot' && NOMBRES_DITS[j.p] !== undefined && /^(mille|million|millions)$/.test(mot(i + 1))) base = NOMBRES_DITS[j.p];
    if (base === null || !Number.isFinite(base)) continue;
    /* « vingt-cinq mille », « deux cent mille » : des mots composés que la
       règle ne lit pas d'un trait. Elle demande les chiffres plutôt que de
       lire « cinq mille ». */
    if (j.genre === 'mot') {
      const avant = mot(i - 1);
      const compose = NOMBRES_DITS[avant] !== undefined || avant === 'et'
        || (jetons[i - 1]?.brut === '-' && NOMBRES_DITS[mot(i - 2)] !== undefined);
      if (compose) { prends(i); questions.push('Dites le montant en chiffres, par exemple 25 000 F.'); continue; }
    }
    let a = i;
    let valeur = base;
    let marque = false;
    if (/^(mille|k)$/.test(mot(a + 1))) { valeur *= 1000; a += 1; marque = true; } else if (/^(million|millions)$/.test(mot(a + 1))) { valeur *= 1_000_000; a += 1; marque = true; }
    if (MARQUES_DE_FRANCS.has(mot(a + 1))) { a += 1; marque = true; }
    /* « 1er » n'est pas un montant ; un numéro de téléphone non plus. */
    if (mot(i + 1) === 'er') continue;
    if (j.genre === 'nombre' && j.brut.replace(/\D/g, '').length >= 8) { prends(i); questions.push('Ce long numéro ressemble à un téléphone, pas à un montant : combien ?'); continue; }
    candidats.push({ valeur: Math.round(valeur), marque, de: i, a });
  }
  /* « mille » seul : mille francs. */
  for (let i = 0; i < n; i++) {
    if (jetons[i].pris || mot(i) !== 'mille' || candidats.some((c) => i >= c.de && i <= c.a)) continue;
    const a = MARQUES_DE_FRANCS.has(mot(i + 1)) ? i + 1 : i;
    candidats.push({ valeur: 1000, marque: true, de: i, a });
  }
  const marques = candidats.filter((c) => c.marque);
  const retenus = marques.length > 0 ? marques : candidats;
  let montantXof: number | undefined;
  const montantsVus = [...new Set(retenus.map((c) => c.valeur))];
  if (retenus.length === 1 || (retenus.length > 1 && montantsVus.length === 1)) {
    const c = retenus[0];
    for (const r of retenus) for (let k = r.de; k <= r.a; k++) prends(k);
    if (c.valeur <= 0) questions.push('Le montant est nul : combien ?');
    else if (c.valeur > MONTANT_AU_PLUS_XOF) questions.push(`Plus de ${francs(MONTANT_AU_PLUS_XOF)} : saisissez-la par « + Dépense ».`);
    else montantXof = c.valeur;
  } else if (retenus.length > 1) {
    questions.push(`Quel est le montant : ${montantsVus.map(francs).join(' ou ')} ?`);
  } else {
    questions.push('Combien ? Je ne lis pas de montant dans la phrase.');
  }

  /* ③ LA CAISSE. Le nom d'une caisse passe devant le moyen ; « espèces »
     mène à la caisse par défaut, « MoMo » à la caisse MoMo. Rien dit : la
     caisse par défaut, et Grenat le dit. */
  let caisse: string | undefined;
  let caisseDite: LectureDeLaPhrase['caisseDite'] = 'rien';
  const noms = [...ctx.caisses].map((c) => ({ c, mots: plat(c).split(/[^a-z0-9]+/).filter(Boolean) }))
    .filter((x) => x.mots.length > 0).sort((a, b) => b.mots.length - a.mots.length);
  for (let i = 0; i < n && !caisse; i++) {
    for (const x of noms) {
      if (x.mots.every((m, k) => mot(i + k) === m)) {
        const apresCaisse = mot(i - 1) === 'caisse';
        if (x.mots.length === 1 && NOMS_COMMUNS.has(x.mots[0]) && !apresCaisse) continue;
        caisse = x.c; caisseDite = 'nom';
        prends(...x.mots.map((_, k) => i + k)); if (apresCaisse) prends(i - 1);
        break;
      }
    }
  }
  for (let i = 0; i < n; i++) {
    const m = mot(i);
    const momo = MOTS_DE_MOMO.has(m) || (m === 'mobile' && mot(i + 1) === 'money');
    if (MOTS_DES_ESPECES.has(m)) {
      prends(i); if (mot(i - 1) === 'en') prends(i - 1);
      if (!caisse) { caisse = ctx.caisseDesEspeces; caisseDite = 'especes'; }
    } else if (momo) {
      const fin = m === 'mobile' ? i + 1 : i;
      const prive = MOTS_DU_PRIVE.has(mot(fin + 1));
      prends(i, fin); if (prive) prends(fin + 1); if (mot(i - 1) === 'par' || mot(i - 1) === 'en') prends(i - 1);
      if (!caisse) { caisse = prive ? ctx.caisseMomoPrive : ctx.caisseMomo; caisseDite = prive ? 'momo-prive' : 'momo'; }
    }
  }

  /* ④ QUI A PAYÉ. « payé par X », « X a payé », « avancé par X », « de la
     poche de X », « la Maison a payé ». X doit être de ceux qui achètent pour
     la Maison ; inconnu, Grenat le demande. Un compte de l'équipe signe de
     son nom. */
  let porteur: string | undefined;
  let porteurInconnu: string | undefined;
  let laMaisonAPaye = false;
  let avancee = false;
  const lisUnNom = (i: number): { nom: string; fin: number } | null => {
    if (!jetons[i] || jetons[i].pris) return null;
    if (mot(i) === 'la' && mot(i + 1) === 'maison') return { nom: '__maison__', fin: i + 1 };
    if (mot(i) === 'maison') return { nom: '__maison__', fin: i };
    const deux = jetons[i] && jetons[i + 1] && jetons[i].genre === 'mot' && jetons[i + 1].genre === 'mot' ? `${jetons[i].brut} ${jetons[i + 1].brut}` : '';
    if (deux) { const c = porteurConnu(deux, ctx.porteurs); if (c) return { nom: c, fin: i + 1 }; }
    if (jetons[i]?.genre === 'mot') {
      const c = porteurConnu(jetons[i].brut, ctx.porteurs);
      if (c) return { nom: c, fin: i };
      return { nom: `?${jetons[i].brut}`, fin: i };
    }
    return null;
  };
  const retiens = (r: { nom: string; fin: number }, de: number, aSaPoche: boolean, exigeConnu: boolean): boolean => {
    if (r.nom === '__maison__') { laMaisonAPaye = true; prends(...Array.from({ length: r.fin - de + 1 }, (_, k) => de + k)); return true; }
    if (r.nom.startsWith('?')) {
      if (exigeConnu) return false;
      porteurInconnu = r.nom.slice(1);
      prends(...Array.from({ length: r.fin - de + 1 }, (_, k) => de + k));
      return true;
    }
    porteur = r.nom; avancee = aSaPoche;
    prends(...Array.from({ length: r.fin - de + 1 }, (_, k) => de + k));
    return true;
  };
  for (let i = 0; i < n && !porteur && !porteurInconnu && !laMaisonAPaye; i++) {
    const m = mot(i);
    if (/^(paye|payee|payes|payees|regle|reglee)$/.test(m) && mot(i + 1) === 'par') {
      const r = lisUnNom(i + 2); if (r) retiens(r, i, false, false);
    } else if (/^(avance|avancee)$/.test(m) && mot(i + 1) === 'par') {
      const r = lisUnNom(i + 2); if (r) retiens(r, i, true, false);
    } else if (m === 'poche' && mot(i + 1) === 'de') {
      const r = lisUnNom(i + 2); if (r) { const de = mot(i - 2) === 'de' && mot(i - 1) === 'la' ? i - 2 : mot(i - 1) === 'la' || mot(i - 1) === 'sa' ? i - 1 : i; retiens(r, de, true, false); }
    } else if (m === 'par') {
      const r = lisUnNom(i + 1); if (r) retiens(r, i, false, true);
    } else if (m === 'a' && /^(paye|avance)$/.test(mot(i + 1)) && i > 0) {
      /* « Brice a payé », « Sandrine a avancé » : le nom juste avant. */
      const deux = i >= 2 ? porteurConnu(`${jetons[i - 2].brut} ${jetons[i - 1].brut}`, ctx.porteurs) : null;
      const un = porteurConnu(jetons[i - 1].brut, ctx.porteurs);
      if (mot(i - 1) === 'maison') { laMaisonAPaye = true; prends(i - 1, i, i + 1); if (mot(i - 2) === 'la') prends(i - 2); }
      else if (deux) { porteur = deux; avancee = mot(i + 1) === 'avance'; prends(i - 2, i - 1, i, i + 1); }
      else if (un) { porteur = un; avancee = mot(i + 1) === 'avance'; prends(i - 1, i, i + 1); }
    }
  }
  if (porteurInconnu) questions.push(`« ${porteurInconnu} » n’est pas parmi ceux qui achètent pour la Maison : qui a payé ?`);
  if (ctx.signeDe) { porteur = ctx.signeDe; laMaisonAPaye = false; porteurInconnu = undefined; }
  else if (!porteur && !porteurInconnu && !laMaisonAPaye && caisse) laMaisonAPaye = true;

  if (!caisse) {
    if (caisseDite === 'especes' || caisseDite === 'momo' || caisseDite === 'momo-prive') {
      questions.push(`Je ne trouve pas la caisse ${caisseDite === 'especes' ? 'des espèces' : caisseDite === 'momo' ? 'MoMo' : 'MoMo Privé'} parmi les vôtres : de quelle caisse ?`);
    } else if (avancee) {
      /* Avancée de sa poche : aucun tiroir ne bouge, la caisse ne se réclame pas. */
    } else if (ctx.caisseDesEspeces) { caisse = ctx.caisseDesEspeces; caisseDite = 'defaut'; if (!porteur && !ctx.signeDe) laMaisonAPaye = true; }
    else questions.push('De quelle caisse sort cet argent ?');
  }

  /* ⑤ LA CATÉGORIE, puis LE LIBELLÉ : ce qui reste, sans ses petits mots de bord. */
  const restants = jetons.filter((j) => !j.pris);
  const cat = laCategorie(restants, ctx.categories);
  const garde = restants.filter((j) => j.genre !== 'signe' || /^[&+/'-]$/.test(j.brut));
  while (garde.length && (garde[0].genre === 'signe' || BORDS.has(garde[0].p))) garde.shift();
  while (garde.length && (garde[garde.length - 1].genre === 'signe' || BORDS.has(garde[garde.length - 1].p))) garde.pop();
  /* Un mois sans son année le reçoit : « loyer novembre » → « Loyer novembre 2026 ». */
  const anDuJour = Number((date || ctx.aujourdhui).slice(0, 4));
  const moisDuJour = Number((date || ctx.aujourdhui).slice(5, 7));
  const morceaux: string[] = [];
  garde.forEach((j, k) => {
    morceaux.push(j.brut);
    const im = MOIS.indexOf(j.p);
    const suivant = garde[k + 1];
    if (im >= 0 && !(suivant && /^\d{4}$/.test(suivant.brut))) {
      const an = im + 1 - moisDuJour > 6 ? anDuJour - 1 : moisDuJour - (im + 1) > 6 ? anDuJour + 1 : anDuJour;
      morceaux.push(String(an));
    }
  });
  let libelle = morceaux.join(' ').replace(/\s+([,.;:])/g, '$1').replace(/\s*'\s*/g, "'").replace(/\s+/g, ' ').trim();
  libelle = libelle ? libelle.charAt(0).toUpperCase() + libelle.slice(1) : '';
  if (!libelle) questions.push('Pour quoi ? Dites ce qui a été payé.');

  return {
    phrase,
    ...(montantXof !== undefined ? { montantXof } : {}),
    montantsVus,
    date,
    jourDit: jourDit === 'rien' ? 'aujourdhui' : jourDit,
    ...(caisse ? { caisse } : {}),
    caisseDite,
    ...(porteur ? { porteur } : {}),
    ...(porteurInconnu ? { porteurInconnu } : {}),
    laMaisonAPaye,
    avancee,
    categorie: cat.categorie,
    ...(cat.sous ? { sousCategorie: cat.sous } : {}),
    categorieDevinee: cat.devinee,
    libelle,
    questions,
  };
}

/** « Grenat lit : 3 000 F · Logistique · Caisse Principale (espèces) · payé par Brice · aujourd’hui. » */
export function ditLaLecture(l: LectureDeLaPhrase, aujourdhui: string): string {
  const morceaux: string[] = [];
  morceaux.push(l.montantXof !== undefined ? francs(l.montantXof) : 'montant à dire');
  morceaux.push(l.sousCategorie ? `${l.categorie}, ${l.sousCategorie}` : l.categorie);
  if (l.avancee && !l.caisse) morceaux.push('sans caisse, avancé de sa poche');
  else if (l.caisse) {
    const comment = l.caisseDite === 'especes' ? ' (espèces)' : l.caisseDite === 'momo' || l.caisseDite === 'momo-prive' ? ' (MoMo)' : l.caisseDite === 'defaut' ? ', la caisse par défaut' : '';
    morceaux.push(`${l.caisse}${comment}`);
  } else morceaux.push('caisse à dire');
  if (l.porteur) morceaux.push(l.avancee ? `avancé par ${l.porteur}` : `payé par ${l.porteur}`);
  else if (l.laMaisonAPaye) morceaux.push('payé par la Maison');
  if (!l.date) morceaux.push('jour à dire');
  else if (l.date === aujourdhui) morceaux.push('aujourd’hui');
  else if (l.date === decale(aujourdhui, -1)) morceaux.push(`hier, ${dateEcrite(l.date)}`);
  else morceaux.push(`le ${dateEcrite(l.date)}`);
  return `Grenat lit : ${l.libelle ? `${l.libelle} · ` : ''}${morceaux.join(' · ')}.`;
}

/* ── LE JUGEMENT AVANT DE POSER ──────────────────────────────────────────── */

export type JugementDeLaPhrase =
  | { ok: true }
  | { ok: false; pourquoi: 'questions' | 'prestataire' | 'famille' | 'doublon'; dit: string; deja?: DepenseExistante };

/** CE QUI EMPÊCHE DE POSER : une question restée sans réponse, un prestataire,
    la famille, le doublon du jour (même maison, même jour, même montant, un
    bénéficiaire voisin, non refusé). */
export function jugeLaPhrase(
  l: LectureDeLaPhrase,
  o: { branchId: string; existantes: readonly DepenseExistante[]; prestataires: readonly { name?: unknown; archived?: unknown }[] },
): JugementDeLaPhrase {
  if (plat(l.phrase).split(/[^a-z0-9-]+/).some((m) => MOTS_DE_LA_FAMILLE.test(m))) {
    return { ok: false, pourquoi: 'famille', dit: 'Une dépense de la famille reste à Cristal, hors du Trône. Rien n’est posé.' };
  }
  const prestataire = prestataireNomme([l.libelle, l.porteur, l.porteurInconnu], o.prestataires);
  if (prestataire) {
    return { ok: false, pourquoi: 'prestataire', dit: `${prestataire} est une prestataire : sa mission naît du rituel honoré, et son paiement fait la dépense. Rien n’est posé.` };
  }
  if (l.questions.length) return { ok: false, pourquoi: 'questions', dit: l.questions[0] };
  const deja = doublonDeLaDepense({ branchId: o.branchId, date: l.date, amountXof: l.montantXof ?? 0, label: l.libelle }, o.existantes);
  if (deja) {
    const qui = String(deja.validation?.soumisPar ?? '').trim() || String(deja.porteur ?? '').trim();
    return { ok: false, pourquoi: 'doublon', deja,
      dit: `Déjà saisie : « ${String(deja.label ?? '').trim()} », ${francs(Number(deja.amountXof) || 0)}, le ${dateEcrite(String(deja.date ?? ''))}${qui ? `, par ${qui}` : ''}. Rien n’est posé deux fois.` };
  }
  return { ok: true };
}

/** La direction enregistre (son oui est donné) ; tout autre rôle soumet. */
export const enregistreeAcquise = (role: string | undefined): boolean => role === 'souverain' || role === 'gerant';

/** La marque d'une dépense préparée par Grenat (un champ de plus dans `data`, sans migration). */
export type MarqueDeGrenat = {
  par: 'Grenat';
  source: 'phrase' | 'engagement';
  /** La phrase telle qu'elle a été écrite ou dictée, ou la clé de l'engagement. */
  phrase?: string;
  cle?: string;
  engagementId?: string;
};

/** LA DÉPENSE DE LA PHRASE, prête à rejoindre le magasin des dépenses. */
export function depenseDeLaPhrase(l: LectureDeLaPhrase, o: {
  id: string; branchId: string; role: string | undefined; nom: string; maintenantISO: string;
  fichier?: { chemin: string; nom: string; type: string; taille: number };
}) {
  const acquise = enregistreeAcquise(o.role);
  return {
    id: o.id,
    branchId: o.branchId,
    label: l.libelle,
    amountXof: l.montantXof ?? 0,
    date: l.date,
    cashbox: l.caisse ?? '',
    category: l.categorie,
    ...(l.sousCategorie ? { subcategory: l.sousCategorie } : {}),
    ...(l.porteur ? { porteur: l.porteur } : {}),
    ...(l.laMaisonAPaye && !l.porteur ? { laMaisonAPaye: true } : {}),
    ...(l.avancee && l.porteur ? { avancee: true } : {}),
    ...(o.fichier ? { fichier: o.fichier } : {}),
    recurring: null,
    ...(acquise ? {} : { validation: { etat: 'attente' as const, soumisLe: o.maintenantISO, soumisPar: o.nom.trim() || 'Sans nom' } }),
    preparee: { par: 'Grenat', source: 'phrase', phrase: l.phrase.slice(0, PHRASE_AU_PLUS) } as MarqueDeGrenat,
  };
}

/* ── D'OÙ VIENT UNE DÉPENSE PRÉPARÉE ─────────────────────────────────────── */

const ASSISTANTS = new Set(['opale', 'onyx']);

/** L'ÉTIQUETTE DE LA LISTE « N dépenses préparées » : l'engagement, le
    message au Trône, l'assistant qui l'a posée, ou la saisie de l'équipe. */
export function origineDeLaDepense(e: { id?: string; preparee?: { source?: string } | null; validation?: { soumisPar?: string } | null }): string {
  if (e.preparee?.source === 'engagement') return 'Engagement';
  if (e.preparee?.source === 'phrase') return 'Message au Trône';
  const qui = String(e.validation?.soumisPar ?? '').trim();
  if (ASSISTANTS.has(plat(qui))) return `Posée par ${qui}`;
  return qui ? 'Saisie de l’équipe' : 'Saisie';
}
