import type { OnlineConsultation } from './bridges';

/* ══ LA MESURE DE LA CONSULTATION — 13 novembre 2026 (la Consultation, lot 4) ══
   Maquette, livrable 10 et lot 4 : « On sait ce que la consultation
   rapporte. » Sur une fenêtre (90 jours par défaut) :
     · A, les consultations gratuites déposées sur le site ;
     · B, les visios réservées, tenues, manquées ;
     · C, les consultations privées réglées en ligne, et ce qu'elles ont encaissé ;
     · les devis nés d'une consultation : estimés → confirmés → payés ;
     · L'ÉCART entre l'estimation du site (le milieu de sa fourchette) et le
       prix ferme du devis (consultation déduite rajoutée : on compare des
       prestations à des prestations). C'est lui qui dira si les fourchettes
       mentent, et où corriger les seuils (risque nommé dans la maquette).
   MODULE PUR. */

export type DevisMesure = {
  id: string;
  kind: string;
  status: string;
  date: string;
  consultationId?: string;
  /** Le total de la pièce, remises comprises. */
  totalXof: number;
  /** La consultation déduite (remise nommée), rajoutée pour comparer. */
  deduitXof?: number;
};
export type VisioMesure = { debut: string; statut: string };

export type MesureDeLaConsultation = {
  gratuites: number;
  visios: { reservees: number; tenues: number; manquees: number };
  reglees: number;
  encaisseXof: number;
  devis: { estimes: number; confirmes: number; payes: number };
  ecart: { n: number; moyennePct: number | null; dansLaFourchette: number };
};

const CONFIRMES = new Set(['acceptée', 'confirmé', 'payée']);
const FERMES = new Set(['à valider', 'envoyée', 'acceptée', 'confirmé', 'payée']);

/** La consultation d'un nom de remise : celle que pose le devis ferme (lot 3). */
export const LIBELLE_DE_LA_DEDUCTION = 'Consultation privée, déduite';

export function mesureDeLaConsultation(
  consultations: readonly OnlineConsultation[],
  devis: readonly DevisMesure[],
  visios: readonly VisioMesure[],
  depuisMs: number,
): MesureDeLaConsultation {
  const dans = (iso: string | undefined) => !!iso && Date.parse(iso) >= depuisMs;
  const gratuites = consultations.filter((c) => c.modalite === 'auto' && dans(c.createdAt));
  const ids = new Set(gratuites.map((c) => c.id));
  const reglees = gratuites.filter((c) => c.paidXof > 0);
  const lies = devis.filter((d) => d.kind === 'devis' && d.status !== 'brouillon' && !!d.consultationId && ids.has(d.consultationId));
  const v = visios.filter((x) => dans(x.debut));

  /* L'écart : pour chaque consultation estimée, son dernier devis ferme. */
  const ecarts: number[] = [];
  let dansLaFourchette = 0;
  for (const c of gratuites) {
    const e = c.estimation;
    if (!e || !(e.max > 0)) continue;
    const ferme = lies.filter((d) => d.consultationId === c.id && FERMES.has(d.status))
      .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id))[0];
    if (!ferme) continue;
    const prix = ferme.totalXof + (ferme.deduitXof ?? 0);
    const milieu = (e.min + e.max) / 2;
    if (!(milieu > 0)) continue;
    ecarts.push(((prix - milieu) / milieu) * 100);
    if (prix >= e.min && prix <= e.max) dansLaFourchette += 1;
  }

  return {
    gratuites: gratuites.length,
    visios: {
      reservees: v.filter((x) => x.statut !== 'annulée').length,
      tenues: v.filter((x) => x.statut === 'tenue').length,
      manquees: v.filter((x) => x.statut === 'manquée').length,
    },
    reglees: reglees.length,
    encaisseXof: reglees.reduce((n, c) => n + Math.max(0, Math.round(c.paidXof)), 0),
    /* Par CONSULTATION, pas par pièce : un devis estimé puis un devis ferme
       pour la même cliente ne comptent qu'une fois. */
    devis: {
      estimes: new Set(lies.map((d) => d.consultationId)).size,
      confirmes: new Set(lies.filter((d) => CONFIRMES.has(d.status)).map((d) => d.consultationId)).size,
      payes: new Set(lies.filter((d) => d.status === 'payée').map((d) => d.consultationId)).size,
    },
    ecart: {
      n: ecarts.length,
      moyennePct: ecarts.length ? Math.round(ecarts.reduce((a, b) => a + b, 0) / ecarts.length) : null,
      dansLaFourchette,
    },
  };
}

/** « +8 % », « −12 % », « 0 % ». */
export const pourcentDit = (p: number): string => (p > 0 ? `+${p} %` : p < 0 ? `−${Math.abs(p)} %` : '0 %');
