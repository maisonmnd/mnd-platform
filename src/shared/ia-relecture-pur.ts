import { niveauRetenu, type Niveau } from './ia-validation-pur';
import { sansCoordonnees } from './ia-anonymise-pur';

/* LA RELECTURE DE CE QUE CLAUDE RENVOIE — 11 octobre 2026.

   Le schéma fixe la forme ; la relecture tient le reste, quoi que le modèle
   ait écrit : les longueurs, les nombres d'éléments, aucun tiret cadratin,
   aucune coordonnée, des agents et des genres qui existent, et surtout LE
   NIVEAU : une tâche garde le plus exigeant entre celui proposé et celui de
   son genre. Un modèle qui propose un contrat « automatique » ne l'obtient
   pas.

   MODULE PUR. La fonction `centre-de-commande` en porte une copie entre ses
   repères (ses imports sont des modules purs, copiés dans le même fichier). */

const propre = (v: unknown, max: number): string =>
  sansCoordonnees(String(v ?? ''))
    .replace(/\s*[—]\s*/g, ', ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);

const liste = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

export type Proposition = { texte: string; agent: string; genre: string; niveau: Niveau };
export type BriefingRelu = {
  titre: string;
  resume: string;
  priorites: { texte: string; pourquoi: string }[];
  alertes: { texte: string }[];
  propositions: Proposition[];
};

export function relisLeBriefing(brut: unknown, agents: readonly string[], genres: readonly string[]): BriefingRelu {
  const b = (brut ?? {}) as Record<string, unknown>;
  return {
    titre: propre(b.titre, 120),
    resume: propre(b.resume, 600),
    priorites: liste(b.priorites).slice(0, 5).map((p) => {
      const x = (p ?? {}) as Record<string, unknown>;
      return { texte: propre(x.texte, 240), pourquoi: propre(x.pourquoi, 300) };
    }).filter((p) => p.texte),
    alertes: liste(b.alertes).slice(0, 4).map((a) => ({ texte: propre((a as Record<string, unknown>)?.texte, 240) })).filter((a) => a.texte),
    propositions: liste(b.propositions).slice(0, 5).map((p) => {
      const x = (p ?? {}) as Record<string, unknown>;
      const genre = genres.includes(String(x.genre)) ? String(x.genre) : 'brouillon';
      return {
        texte: propre(x.texte, 300),
        agent: agents.includes(String(x.agent)) ? String(x.agent) : 'orchestrateur',
        genre,
        niveau: niveauRetenu(genre, String(x.niveau)),
      };
    }).filter((p) => p.texte),
  };
}

export type TacheProposee = { titre: string; agent: string; genre: string; niveau: Niveau; echeanceJours: number; pourquoi: string };
export type MissionRelue = { titre: string; objectif: string; taches: TacheProposee[]; questions: string[] };

export function relisLaMission(brut: unknown, agents: readonly string[], genres: readonly string[]): MissionRelue {
  const b = (brut ?? {}) as Record<string, unknown>;
  return {
    titre: propre(b.titre, 120),
    objectif: propre(b.objectif, 400),
    taches: liste(b.taches).slice(0, 12).map((t) => {
      const x = (t ?? {}) as Record<string, unknown>;
      /* Un genre inconnu vaut une relecture : on ne devine pas vers le bas. */
      const genre = genres.includes(String(x.genre)) ? String(x.genre) : 'concept';
      const jours = Math.round(Number(x.echeanceJours));
      return {
        titre: propre(x.titre, 200),
        agent: agents.includes(String(x.agent)) ? String(x.agent) : 'orchestrateur',
        genre,
        niveau: niveauRetenu(genre, String(x.niveau)),
        echeanceJours: Number.isFinite(jours) ? Math.min(120, Math.max(0, jours)) : 7,
        pourquoi: propre(x.pourquoi, 300),
      };
    }).filter((t) => t.titre),
    questions: liste(b.questions).slice(0, 3).map((q) => propre(q, 240)).filter(Boolean),
  };
}

/* ── PHASE 2, LE CONTENU — 11 octobre 2026 ─────────────────────────────────
   Les mêmes garde-fous, sur des textes qui gardent leurs lignes (une légende,
   un article) : pas de tiret cadratin, aucune coordonnée, des listes fermées,
   des dates dans la période. */
const propreLong = (v: unknown, max: number): string =>
  sansCoordonnees(String(v ?? ''))
    .replace(/[ \t]*—[ \t]*/g, ', ')
    .split('\n').map((l) => l.replace(/[ \t]+/g, ' ').trim()).join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, max);

const dansLaListe = (v: unknown, liste: readonly string[], defaut: string): string => (liste.includes(String(v)) ? String(v) : defaut);

export type PublicationRelue = {
  date: string; heure: string; plateformes: string[]; format: string; pilier: string;
  objectif: string; sujet: string; accroche: string; legende: string; appel: string; visuel: string;
};

/** Les publications proposées, gardées dans la période et dans les listes. */
export function relisLeCalendrier(brut: unknown, du: string, au: string, l: { plateformes: readonly string[]; formats: readonly string[]; piliers: readonly string[] }): PublicationRelue[] {
  const b = (brut ?? {}) as Record<string, unknown>;
  return liste(b.publications).slice(0, 21).map((p) => {
    const x = (p ?? {}) as Record<string, unknown>;
    const date = /^\d{4}-\d{2}-\d{2}$/.test(String(x.date)) ? String(x.date) : '';
    return {
      date,
      heure: /^\d{1,2}:\d{2}$/.test(String(x.heure)) ? String(x.heure).padStart(5, '0') : '',
      plateformes: liste(x.plateformes).map(String).filter((v) => l.plateformes.includes(v)),
      format: dansLaListe(x.format, l.formats, 'post'),
      pilier: dansLaListe(x.pilier, l.piliers, ''),
      objectif: propre(x.objectif, 160),
      sujet: propre(x.sujet, 140),
      accroche: propre(x.accroche, 160),
      legende: propreLong(x.legende, 1500),
      appel: propre(x.appel, 140),
      visuel: propre(x.visuel, 400),
    };
  }).filter((p) => p.sujet && p.date && p.date >= du && p.date <= au && p.plateformes.length > 0);
}

export type ArticleRelu = { titre: string; description: string; motsCles: string[]; parcours: string; angle: string; plan: string[]; corps: string; aVerifier: string[] };

export function relisLArticle(brut: unknown, parcours: readonly string[]): ArticleRelu {
  const b = (brut ?? {}) as Record<string, unknown>;
  return {
    titre: propre(b.titre, 110),
    description: propre(b.description, 170),
    motsCles: liste(b.motsCles).slice(0, 7).map((m) => propre(m, 60)).filter(Boolean),
    parcours: dansLaListe(b.parcours, parcours, 'entretien'),
    angle: propre(b.angle, 300),
    plan: liste(b.plan).slice(0, 12).map((p) => propre(p, 120)).filter(Boolean),
    /* Le titre vient de l'en-tête : un « # » en tête du corps est retiré. */
    corps: propreLong(b.corps, 9000).replace(/^# .*\n+/, ''),
    aVerifier: liste(b.aVerifier).slice(0, 20).map((f) => propre(f, 240)).filter(Boolean),
  };
}

export type SeanceRelue = {
  objectif: string; concept: string; histoire: string; coiffure: string; tenue: string; accessoires: string; decor: string;
  lumiere: string; cadrage: string; poses: string; expressions: string; details: string;
  prises: { num: number; nom: string; consigne: string; format: string }[];
};

export function relisLaSeance(brut: unknown): SeanceRelue {
  const b = (brut ?? {}) as Record<string, unknown>;
  const champ = (k: string, max: number) => propre(b[k], max);
  return {
    objectif: champ('objectif', 300), concept: champ('concept', 400), histoire: champ('histoire', 500), coiffure: champ('coiffure', 300),
    tenue: champ('tenue', 300), accessoires: champ('accessoires', 200), decor: champ('decor', 300), lumiere: champ('lumiere', 200),
    cadrage: champ('cadrage', 300), poses: champ('poses', 400), expressions: champ('expressions', 300), details: champ('details', 400),
    prises: liste(b.prises).slice(0, 16).map((p) => {
      const x = (p ?? {}) as Record<string, unknown>;
      return { nom: propre(x.nom, 60), consigne: propre(x.consigne, 240), format: propre(x.format, 60) };
    }).filter((p) => p.nom).map((p, i) => ({ num: i + 1, ...p })),
  };
}

export type ScriptRelu = {
  accroche: string; histoire: string; valeur: string; emotion: string; appel: string;
  plans: { num: number; image: string; texteEcran: string; duree: number }[];
  transitions: string; musique: string; miniature: string; legende: string;
};

export function relisLeScript(brut: unknown): ScriptRelu {
  const b = (brut ?? {}) as Record<string, unknown>;
  return {
    accroche: propre(b.accroche, 200), histoire: propre(b.histoire, 600), valeur: propre(b.valeur, 600),
    emotion: propre(b.emotion, 400), appel: propre(b.appel, 200),
    plans: liste(b.plans).slice(0, 12).map((p) => {
      const x = (p ?? {}) as Record<string, unknown>;
      const d = Math.round(Number(x.duree));
      return { image: propre(x.image, 240), texteEcran: propre(x.texteEcran, 120), duree: Number.isFinite(d) ? Math.min(60, Math.max(1, d)) : 5 };
    }).filter((p) => p.image).map((p, i) => ({ num: i + 1, ...p })),
    transitions: propre(b.transitions, 240), musique: propre(b.musique, 160), miniature: propre(b.miniature, 200), legende: propreLong(b.legende, 1200),
  };
}
