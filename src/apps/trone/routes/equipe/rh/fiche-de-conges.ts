/* LA FICHE DE CONGÉS : ce qu'elle dit, où elle se range · 6 novembre 2026.
   Le texte vient des règles (shared/vacances-pur), le dessin de
   `fiche-de-conges-pdf`, le rangement du coffre (shared/engagements-coffre).
   Ici, seulement les relier, avec les heures de la Maison du moment. */
import { deposeLaFicheDeConges } from '../../../../../shared/engagements-coffre';
import { maisonNom } from '../../../../../shared/identite';
import { exceptionsHorairesStore, settingsStore } from '../../../../../shared/settings';
import {
  droitDeLAnnee, ficheDeConges, joursCalendaires, moisDit, nomDeLaFiche, periodesDeLAnnee, repriseApres, totalDesJours,
  type CongeLu, type FicheDeConges,
} from '../../../../../shared/vacances-pur';
import { ficheDeCongesPdf } from './fiche-de-conges-pdf';

export type QuiPourLaFiche = { id: string; name: string; since?: string };
export const prenomDe = (nom: string): string => nom.trim().split(/\s+/)[0] || nom;

const lesHeures = () => ({
  semaine: settingsStore.get().hours ?? [],
  exceptions: (exceptionsHorairesStore.get() ?? []) as { date: string; staffId?: string; closed?: boolean; open?: string; close?: string }[],
});

/** LA FICHE DE L'ANNÉE : tous ses congés et vacances de l'année, le droit, le reste. */
export function ficheDeLAnnee(o: { m: QuiPourLaFiche; annee: number; conges: readonly CongeLu[]; joursParMois: number }): { fiche: FicheDeConges; nom: string } {
  const { semaine, exceptions } = lesHeures();
  const periodes = periodesDeLAnnee({ conges: o.conges, employeeId: o.m.id, annee: o.annee, semaine, exceptions });
  const prenom = prenomDe(o.m.name);
  return {
    fiche: ficheDeConges({ prenom, periode: String(o.annee), periodes, droit: droitDeLAnnee(o.m.since, o.annee, o.joursParMois) }),
    nom: nomDeLaFiche(String(o.annee), prenom),
  };
}

/** LA FICHE D'UN CONGÉ ACCORDÉ : ce congé-là, et ce qui reste de l'année. */
export function ficheDuConge(o: { m: QuiPourLaFiche; conge: CongeLu; conges: readonly CongeLu[]; joursParMois: number }): { fiche: FicheDeConges; nom: string } {
  const { semaine, exceptions } = lesHeures();
  const annee = Number(o.conge.startDate.slice(0, 4));
  const tous = periodesDeLAnnee({ conges: o.conges, employeeId: o.m.id, annee, semaine, exceptions });
  const prenom = prenomDe(o.m.name);
  const mois = moisDit(o.conge.startDate);
  return {
    fiche: ficheDeConges({
      prenom, periode: mois,
      periodes: [{
        id: o.conge.id, du: o.conge.startDate, au: o.conge.endDate, jours: joursCalendaires(o.conge.startDate, o.conge.endDate),
        reprise: repriseApres(o.conge.endDate, semaine, exceptions), genre: 'conge',
      }],
      droit: droitDeLAnnee(o.m.since, annee, o.joursParMois), prisDansLAnnee: totalDesJours(tous),
    }),
    nom: nomDeLaFiche(mois, prenom),
  };
}

/** Fabrique le PDF. */
export const pdfDeLaFiche = (f: FicheDeConges): Promise<Blob> => ficheDeCongesPdf(f, { maison: maisonNom() });

/** RANGE la fiche au dossier ; `false` si le coffre l'a refusée. */
export async function rangeLaFiche(staffId: string, f: FicheDeConges, nom: string): Promise<boolean> {
  try {
    const blob = await pdfDeLaFiche(f);
    return !!(await deposeLaFicheDeConges(staffId, blob, nom));
  } catch {
    return false;
  }
}

/** TÉLÉCHARGE la fiche, sans rien ranger (Mon espace, ou pour l'imprimer). */
export async function telechargeLaFiche(f: FicheDeConges, nom: string): Promise<void> {
  const blob = await pdfDeLaFiche(f);
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = nom;
  document.body.appendChild(a); a.click(); a.remove();
  window.setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
