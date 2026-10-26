/* ══ GÉRARD SAIT « ENTRE DEUX SÉANCES » — 26 octobre 2026 ══════════════════
   « Toutes les rubriques entre deux séances, et les réponses qui sont entre
   deux séances, ce que les clients disent : essaye d'intégrer ce module dans
   l'assistant IA » (Yéman) ; au sélecteur : dans GÉRARD, et « leurs mots
   lisibles par Claude, sans nom ni numéro ».

   CE QUE GÉRARD EN TIRE, QUATRE CHOSES :
     · il connaît les huit rubriques, leur niveau et le délai de la Maison ;
     · il ne répond qu'avec la réponse VALIDÉE par la direction ; sans elle,
       un simple accusé ; en Santé JAMAIS un conseil écrit, l'accusé santé, et
       l'équipe est prévenue (les règles d'Entre deux séances, inchangées) ;
     · il se tait quand une cliente a un souci À voir ou Santé encore ouvert :
       ni envie ni remise, seulement son rendez-vous gardé (on ne vend pas à
       une cliente qui attend qu'on la rappelle) ;
     · il sait ce que disent les clientes, rubrique par rubrique, en leurs
       mots, SANS NOM NI NUMÉRO : tout nom de cliente connu sort du texte, les
       numéros et adresses aussi, avant que Claude ne le lise.

   Les brouillons ne sortent jamais d'ici : Claude ne lit que les réponses
   validées. Module pur (banc verifie-gerard-entre-deux). */
import {
  ACCUSE, ACCUSE_SANTE, DELAI_HEURES, NIVEAUX, SOUCIS, enRetard, niveauDe, proposeDAvancer,
  reponseAuSignalement, soucisDuTexte, type CleDeSouci, type Niveau, type Signalement,
} from './entre-deux-pur';
import { sansCoordonnees } from './ia-anonymise-pur';

/** Ce que Gérard relit : les soixante derniers jours (comme sa fiche). */
export const JOURS_LUS = 60;
/** Les mots gardés par rubrique, les plus récents d'abord. */
export const MOTS_PAR_RUBRIQUE = 5;
/** Une phrase de cliente, au plus. */
export const MOTS_LONGUEUR = 160;

type SignalementLu = Pick<Signalement, 'clientId' | 'soucis' | 'texte' | 'quand' | 'etat' | 'bien'>;

const sansAccents = (t: string): string => String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const echappe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Les mots des noms des clientes connues (trois lettres au moins), pour les
    retirer d'un texte. Un prénom qui est aussi un mot courant sort aussi :
    mieux vaut un mot de trop retiré qu'un nom qui part. */
export function motsDesNoms(noms: readonly string[]): string[] {
  const s = new Set<string>();
  for (const n of noms) for (const m of sansAccents(n).split(/[^a-zÀ-ɏ]+/)) if (m.length >= 3) s.add(m);
  return [...s].sort((a, b) => b.length - a.length);
}

/** SES MOTS, SANS NOM NI NUMÉRO : chaque nom connu devient « … », chaque
    numéro « [numéro] », chaque adresse « [adresse] » ; la phrase est coupée
    à MOTS_LONGUEUR. `motsDeNoms` vient de `motsDesNoms`. */
export function motsSansNom(texte: string, motsDeNoms: readonly string[]): string {
  let t = sansCoordonnees(String(texte ?? '')).replace(/\s+/g, ' ').trim();
  if (motsDeNoms.length) {
    const nu = sansAccents(t);
    /* On cherche dans le texte sans accents, on remplace dans le vrai : les
       deux ont la même longueur lettre à lettre (NFD puis retrait des marques
       ne change pas le compte des lettres de base), on travaille donc sur la
       forme sans accents et l'on recolle le texte d'origine hors des noms. */
    const motif = new RegExp(`(^|[^a-z\\u00c0-\\u024f])(${motsDeNoms.map(echappe).join('|')})(?=$|[^a-z\\u00c0-\\u024f])`, 'g');
    if (nu.length === t.length) {
      let sortie = '';
      let i = 0;
      for (const m of nu.matchAll(motif)) {
        const debut = (m.index ?? 0) + m[1].length;
        sortie += `${t.slice(i, debut)}…`;
        i = debut + m[2].length;
      }
      t = sortie + t.slice(i);
    } else {
      t = nu.replace(motif, (_x, avant: string) => `${avant}…`);
    }
  }
  return t.length > MOTS_LONGUEUR ? `${t.slice(0, MOTS_LONGUEUR - 1).trimEnd()}…` : t;
}

/* ── CE QUE GÉRARD SAIT ─────────────────────────────────────────────────── */

export type RubriqueSue = {
  cle: CleDeSouci;
  dit: string;
  niveau: Niveau;
  niveauDit: string;
  delaiHeures: number;
  /** Ce que Gérard répond : la réponse validée ; en Santé, l'accusé santé ;
      null = pas encore validée (il n'envoie qu'un accusé). */
  reponse: string | null;
  /** Ce qui peut suivre, à proposer pour la prochaine séance (sans prix). */
  suite: string;
  avancer: boolean;
  dits: number;
  ouverts: number;
  enRetard: number;
  /** Leurs mots, sans nom ni numéro, les plus récents d'abord. */
  mots: string[];
};

export type CeQueGerardSait = {
  depuis: string;
  rubriques: RubriqueSue[];
  total: { dits: number; ouverts: number; enRetard: number; toutVaBien: number; sansReponse: number };
};

const ilYA = (maintenant: string, jours: number) => new Date(Date.parse(maintenant) - jours * 86_400_000).toISOString().slice(0, 10);

export function ceQueGerardSait(o: {
  signalements: readonly SignalementLu[];
  /** Les réponses VALIDÉES, par rubrique (`texteValide`). */
  validees: Partial<Record<string, string>>;
  /** Les noms des clientes connues, pour les retirer de leurs mots. */
  noms: readonly string[];
  maintenant: string;
  jours?: number;
}): CeQueGerardSait {
  const depuis = ilYA(o.maintenant, o.jours ?? JOURS_LUS);
  const lus = o.signalements.filter((s) => (s.quand ?? '').slice(0, 10) >= depuis);
  const soucis = lus.filter((s) => !s.bien && (s.soucis ?? []).length > 0);
  const noms = motsDesNoms(o.noms);
  const rubriques: RubriqueSue[] = SOUCIS.map((r) => {
    const siens = soucis.filter((s) => s.soucis.includes(r.cle)).sort((a, b) => b.quand.localeCompare(a.quand));
    const validee = (o.validees[r.cle] ?? '').trim();
    return {
      cle: r.cle,
      dit: r.dit,
      niveau: r.niveau,
      niveauDit: NIVEAUX[r.niveau],
      delaiHeures: DELAI_HEURES[r.niveau],
      reponse: r.niveau === 'sante' ? ACCUSE_SANTE : (validee || null),
      suite: r.suite,
      avancer: !!r.avancer,
      dits: siens.length,
      ouverts: siens.filter((s) => s.etat === 'ouvert').length,
      enRetard: siens.filter((s) => enRetard(s, o.maintenant)).length,
      mots: siens.map((s) => motsSansNom(s.texte ?? '', noms)).filter(Boolean).slice(0, MOTS_PAR_RUBRIQUE),
    };
  });
  return {
    depuis,
    rubriques,
    total: {
      dits: soucis.length,
      ouverts: soucis.filter((s) => s.etat === 'ouvert').length,
      enRetard: soucis.filter((s) => enRetard(s, o.maintenant)).length,
      toutVaBien: lus.filter((s) => s.bien).length,
      sansReponse: rubriques.filter((r) => r.reponse === null).length,
    },
  };
}

/* ── QUAND ELLE LUI PARLE DE SES CHEVEUX ─────────────────────────────────── */

export type ReponseDeGerard = {
  soucis: CleDeSouci[];
  niveau: Niveau;
  /** Les textes qu'il envoie : les réponses validées, sinon l'accusé ; en Santé l'accusé santé seul. */
  textes: string[];
  /** La Maison propose d'avancer son rendez-vous (cassantes, inégales, pousse). */
  avancer: boolean;
  /** À voir et Santé : un signalement s'ouvre et sa maîtresse est prévenue. */
  prevenirLEquipe: boolean;
};

/** Ce que Gérard répond quand une cliente lui écrit un souci (son lot 3, les
    conversations). Rien si le message ne parle pas de ses cheveux. */
export function gerardRepondAuSouci(texte: string, validees: Partial<Record<string, string>>): ReponseDeGerard | null {
  const soucis = soucisDuTexte(texte);
  if (!soucis.length) return null;
  const niveau = niveauDe(soucis);
  return {
    soucis,
    niveau,
    textes: reponseAuSignalement(soucis, validees),
    avancer: niveau !== 'sante' && proposeDAvancer(soucis),
    prevenirLEquipe: niveau !== 'conseil',
  };
}

/* ── QUAND GÉRARD SE TAIT ────────────────────────────────────────────────── */

/** Le souci encore ouvert le plus grave d'une cliente : Santé, puis À voir.
    Un conseil ouvert ne l'arrête pas (son envie suit déjà ses soucis). */
export type SouciOuvert = 'sante' | 'a-voir';
export function souciOuvertDe(siens: readonly Pick<Signalement, 'soucis' | 'etat' | 'bien'>[]): SouciOuvert | undefined {
  const ouverts = siens.filter((s) => s.etat === 'ouvert' && !s.bien && (s.soucis ?? []).length > 0).map((s) => niveauDe(s.soucis));
  if (ouverts.includes('sante')) return 'sante';
  if (ouverts.includes('voir')) return 'a-voir';
  return undefined;
}

/** Gérard ne propose ni envie ni remise à une cliente qui attend qu'on la
    rappelle ; il garde seulement son rendez-vous. */
export const gerardSeTait = (f: { souciOuvert?: SouciOuvert }): boolean => !!f.souciOuvert;

/* ── LA CONSIGNE QUE CLAUDE LIRA ─────────────────────────────────────────── */

/** Le bloc « Entre deux séances » de la consigne de Gérard : les rubriques,
    les seules réponses validées, les règles, et ce que disent les clientes
    sans nom. Aucun brouillon, aucun nom, aucun numéro. */
export function consigneEntreDeux(sait: CeQueGerardSait): string {
  const lignes = sait.rubriques.map((r) => {
    if (r.niveau === 'sante') return `- ${r.dit} (Santé) : jamais de conseil écrit. Réponds exactement : « ${ACCUSE_SANTE} » et préviens l'équipe.`;
    const quoi = r.reponse ? `réponds : « ${r.reponse} »` : `pas encore de réponse validée, réponds seulement : « ${ACCUSE} »`;
    const voir = r.niveau === 'voir' ? `, sa maîtresse rappelle sous ${r.delaiHeures} h` : '';
    const avancer = r.avancer ? ' Propose d’avancer son rendez-vous, elle choisit l’heure.' : '';
    return `- ${r.dit} (${r.niveauDit}${voir}) : ${quoi}${avancer} Pour la prochaine séance, sans prix : ${r.suite}.`;
  });
  const dits = sait.rubriques.filter((r) => r.mots.length).map((r) => `- ${r.dit} (${r.dits}) : ${r.mots.map((m) => `« ${m} »`).join(' ; ')}`);
  return [
    'ENTRE DEUX SÉANCES. Une cliente peut te parler de ses cheveux entre deux rendez-vous. Voici les rubriques de la Maison et ce que tu réponds, mot pour mot :',
    ...lignes,
    'Tu ne poses jamais de diagnostic, tu ne promets aucun résultat, tu ne cites aucun produit hors de ces réponses, jamais de prix. Si tu hésites entre deux rubriques, prends la plus grave.',
    'Tant qu’un souci À voir ou Santé est ouvert pour elle, tu ne lui proposes ni envie ni remise : tu gardes seulement son rendez-vous.',
    ...(dits.length ? [`Ce que disent les clientes depuis le ${sait.depuis} (sans nom) :`, ...dits] : []),
  ].join('\n');
}
