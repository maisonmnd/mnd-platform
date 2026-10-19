import { createStore, useStore } from './store';
import { bindDocument } from './sync';
import { demandeAClaude } from './ia-maison';
import {
  CHANTIER_FICHE_DU_JOUR, JETONS_DE_LA_FICHE, LIGNE_PREMIERE_VENUE, SCHEMA_DE_LA_FICHE, USAGE_FICHE_DU_JOUR,
  aujourdhuiACotonou, consigneDeLaFiche, ficheValable, fichesPurgees, lectureDeLaFiche, matiereVide,
  type FicheGardee, type FichesDuJour, type MatiereDeLaFiche,
} from './ia-fiche-du-jour-pur';

/* ══ LA FICHE DU JOUR, CÔTÉ TRÔNE — 19 octobre 2026 ═══════════════════════
   Les règles vivent dans `ia-fiche-du-jour-pur` ; ici, le magasin et
   l'appel. Les fiches écrites vivent dans UN document synchronisé
   (`mnd_ia_fiches_du_jour`, table `documents`, lu et écrit par le seul
   personnel depuis 0130, hors de la liste publique) : le Carnet d'un poste
   et le Calendrier d'un autre lisent la même fiche, et personne ne paie
   deux fois la même journée.

   « Écrite à ce moment-là, gardée pour la journée. Rien ne tourne la nuit. »
   Ce module n'a ni minuterie ni réveil : il ne fait quelque chose que quand
   une fiche de rendez-vous s'ouvre, ou qu'on touche « Refaire ».

   LE VERROU VIT ICI, HORS DE L'ÉCRAN (reprise du 19 octobre 2026). Il tient
   quand la fiche du rendez-vous se ferme et se rouvre, et quand le Carnet et
   le Calendrier ouvrent le même rendez-vous ensemble :
     · une demande en cours est partagée (une seule promesse par rendez-vous) ;
     · une OUVERTURE ne demande qu'une fois par rendez-vous et par jour sur ce
       poste : si la fiche gardée s'est perdue en route (un autre poste a
       réécrit le document en même temps) ou si Claude a échoué, la
       réouverture montre la dernière réponse au lieu de repayer. Seul
       « Refaire » redemande. */

/* La clé s'écrit EN TOUTES LETTRES (le garde verifie-cles-uniques ne lit que
   les clés littérales) ; le banc la confronte à CLE_DES_FICHES_DU_JOUR. */
export const fichesDuJourStore = createStore<FichesDuJour>('mnd_ia_fiches_du_jour', {});
bindDocument(fichesDuJourStore, 'mnd_ia_fiches_du_jour');
export const useFichesDuJour = () => useStore(fichesDuJourStore);

export function gardeLaFiche(apptId: string, f: FicheGardee): void {
  fichesDuJourStore.set((prev) => ({ ...(prev && typeof prev === 'object' ? prev : {}), [apptId]: f }));
}

/** À l'ouverture : les fiches de plus de sept jours s'en vont. Rien à
    purger, rien n'est écrit. */
export function purgeLesFiches(aujourdhui: string = aujourdhuiACotonou()): void {
  const avant = fichesDuJourStore.get();
  const apres = fichesPurgees(avant, aujourdhui);
  if (apres !== avant) fichesDuJourStore.set(apres);
}

export type ReponseDeLaFiche =
  | { ok: true; fiche: FicheGardee }
  | { ok: false; message: string };

/** Les demandes en cours, par rendez-vous. */
const enCours = new Map<string, Promise<ReponseDeLaFiche>>();
/** La dernière réponse de la journée, par « rendez-vous|jour » : une
    ouverture qui la trouve ne redemande pas. */
const dejaDemandees = new Map<string, ReponseDeLaFiche>();
export const ficheEnCours = (apptId: string): boolean => enCours.has(apptId);

/** PRÉPARER LA FICHE D'UN RENDEZ-VOUS. `composer` n'est appelé que s'il faut
    vraiment écrire (la matière filtre tout le carnet). À l'ouverture : la
    fiche gardée du jour sert telle quelle ; une demande en cours est
    rejointe ; une demande déjà faite aujourd'hui rend sa réponse. « Refaire »
    rejoint une demande en cours, sinon redemande. `maintenant` : l'horloge,
    que le banc seul fixe. */
export function prepareLaFiche(
  apptId: string,
  jourDuRendezVous: string,
  composer: () => MatiereDeLaFiche,
  quand: 'ouverture' | 'refaire',
  maintenant?: Date,
): Promise<ReponseDeLaFiche> {
  const horloge = (): Date => maintenant ?? new Date();
  const aujourdhui = aujourdhuiACotonou(horloge());
  const gardees = fichesDuJourStore.get();
  const gardee = gardees && typeof gardees === 'object' ? gardees[apptId] : undefined;
  if (quand === 'ouverture' && gardee && ficheValable(gardee, jourDuRendezVous, aujourdhui)) return Promise.resolve({ ok: true, fiche: gardee });
  const deja = enCours.get(apptId);
  if (deja) return deja;
  const cle = `${apptId}|${aujourdhui}`;
  const derniere = dejaDemandees.get(cle);
  if (quand === 'ouverture' && derniere) return Promise.resolve(derniere);

  const p = (async (): Promise<ReponseDeLaFiche> => {
    const m = composer();
    if (matiereVide(m)) {
      /* Rien à lire : la Maison l'écrit elle-même, sans dépenser un appel. */
      const fiche: FicheGardee = { jour: jourDuRendezVous, lignes: [LIGNE_PREMIERE_VENUE], le: horloge().toISOString(), modele: 'maison' };
      gardeLaFiche(apptId, fiche);
      return { ok: true, fiche };
    }
    const r = await demandeAClaude<{ lignes?: unknown }>({
      chantier: CHANTIER_FICHE_DU_JOUR,
      usage: USAGE_FICHE_DU_JOUR,
      systeme: consigneDeLaFiche(),
      messages: [{ role: 'user', content: JSON.stringify(m) }],
      schema: SCHEMA_DE_LA_FICHE,
      maxTokens: JETONS_DE_LA_FICHE,
    });
    if (!r.ok) return { ok: false, message: r.message };
    /* Ce qui revient est RELU : le reste dû donné est le seul prix admis. */
    const fiche: FicheGardee = {
      jour: jourDuRendezVous,
      lignes: lectureDeLaFiche(r.data, m.reste.map((x) => x.xof)),
      le: horloge().toISOString(),
      modele: r.modele,
    };
    gardeLaFiche(apptId, fiche);
    return { ok: true, fiche };
  })()
    .catch((e: unknown): ReponseDeLaFiche => ({ ok: false, message: `La fiche n’a pas pu s’écrire : ${String((e as Error)?.message ?? e)}` }))
    .then((res) => { dejaDemandees.set(cle, res); return res; })
    .finally(() => { enCours.delete(apptId); });
  enCours.set(apptId, p);
  return p;
}
