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
