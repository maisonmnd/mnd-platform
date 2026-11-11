import { createStore, useStore } from '../../../../shared/store';
import { bindDocument } from '../../../../shared/sync';
import type { FactureDEntreprise, JourDePaie, ValidationADate } from '../../../../shared/les-paiements-pur';
import type { Attente, EnvoiMtn, ItemAEnvoyer, LectureMtn, NomMtnVu } from '../../../../shared/paie-par-mtn-pur';
import { programmeLeRun } from './paie-par-mtn';

/* ══ LES PAIEMENTS, CE QUI S'ÉCRIT · 5 novembre 2026 ═════════════════════
   Les deux magasins de l'écran « Les paiements » (maquette
   maquette-les-paiements.html, v5) et la façon d'y confier un envoi. Les
   règles vivent dans `shared/les-paiements-pur`.

   Une entreprise payée sur facture EST un fournisseur : elle vit au carnet
   des fournisseurs (`mnd_fournisseurs_depenses`, bloc `paiement`) ; ici,
   seulement sa facture du mois.

   ⚠ CONFIDENTIALITÉ. Ces deux documents (`mnd_les_paiements`,
   `mnd_paiements_factures`) passent par la table `documents`, que la règle
   0130 ouvre à tout le personnel sauf les clés privées des RH. Ils doivent
   rejoindre `cles_rh_privees()` (une migration de la mise en ligne, hors de
   ce lot) avant que l'écran serve pour de vrai. */

/** Ce que le mois garde : les pourboires remis, les touchers, et la
    dernière lecture chez MTN (solde et noms). */
export type MoisDesPaiements = {
  remis?: Record<string, { par: string; le: string; montantXof: number }>;
  /** Les lignes à leur date validées, par clé de ligne. */
  validations?: Record<string, ValidationADate>;
  touchers?: { par: string; le: string; cles: string[]; annuleLe?: string; annulePar?: string }[];
  lectureMtn?: LectureMtn;
  /** Le montant d'un employé d'entreprise pour CE mois, par clé de ligne
      (11 nov. 2026) ; son mensuel ne bouge pas. */
  montants?: Record<string, number>;
};
export type RegistreDesPaiements = {
  /** La date de chaque prestataire, par clé de ligne : le 10 par défaut. */
  jours?: Record<string, JourDePaie>;
  /** L'heure de chaque prestataire, par clé de ligne : 18 h par défaut (11 nov. 2026). */
  heures?: Record<string, string>;
  /** « C'est bien son numéro », pour un prestataire (clé de ligne). */
  nomsVus?: Record<string, NomMtnVu>;
  mois?: Record<string, MoisDesPaiements>;
  /** Les montants du test, retouchés ligne à ligne. */
  test?: { montants?: Record<string, number> };
};

export const registreDesPaiementsStore = createStore<RegistreDesPaiements>('mnd_les_paiements', {});
bindDocument(registreDesPaiementsStore, 'mnd_les_paiements');
export const useRegistreDesPaiements = () => useStore(registreDesPaiementsStore);

/** Les factures du mois des entreprises, chacune pointant son fournisseur. */
export const facturesDEntreprisesStore = createStore<FactureDEntreprise[]>('mnd_paiements_factures', []);
bindDocument(facturesDEntreprisesStore, 'mnd_paiements_factures');
export const useFacturesDEntreprises = () => useStore(facturesDEntreprisesStore);

const objet = <T extends object>(v: unknown): T => (v && typeof v === 'object' && !Array.isArray(v) ? v as T : {} as T);

/** Écrit le mois `periode` du registre. */
export function ecrisLeMois(periode: string, change: (m: MoisDesPaiements) => MoisDesPaiements): void {
  registreDesPaiementsStore.set((prev) => {
    const r = objet<RegistreDesPaiements>(prev);
    const mois = objet<Record<string, MoisDesPaiements>>(r.mois);
    return { ...r, mois: { ...mois, [periode]: change(objet<MoisDesPaiements>(mois[periode])) } };
  });
}
export function ecrisLeRegistre(change: (r: RegistreDesPaiements) => RegistreDesPaiements): void {
  registreDesPaiementsStore.set((prev) => change(objet<RegistreDesPaiements>(prev)));
}
export const leMois = (r: RegistreDesPaiements | undefined, periode: string): MoisDesPaiements =>
  objet<MoisDesPaiements>(objet<Record<string, MoisDesPaiements>>(r?.mois)[periode]);

/** Programmer des lignes d'un même run, d'un seul geste, chacune à son
    heure : `programmeLeRun` de la paie par MTN (le tri : numéro, montant,
    envoi déjà vivant, nom chez MTN ; puis le serveur), une fois par heure de
    départ. `prevenir` (0164) : l'équipe salariée oui, prestataires et
    entreprises non. */
export async function programmeLesLignes(o: {
  runId: string;
  periode: string;
  items: readonly (ItemAEnvoyer & { partA: string })[];
  envois: EnvoiMtn[];
  lecture?: LectureMtn;
  vus: (id: string) => NomMtnVu | undefined;
  prevenir: boolean;
}) {
  const parHeure = new Map<string, ItemAEnvoyer[]>();
  for (const { partA, ...it } of o.items) parHeure.set(partA, [...(parHeure.get(partA) ?? []), it]);
  const sortie = {
    tri: { partent: [] as ItemAEnvoyer[], attendent: [] as Attente[] },
    inscrits: [] as string[],
    refuses: [] as { reference: string; erreur: string }[],
    erreur: undefined as string | undefined,
  };
  for (const [partA, items] of parHeure) {
    const r = await programmeLeRun({ runId: o.runId, periode: o.periode, partA, items, envois: o.envois, lecture: o.lecture, vus: o.vus, prevenir: o.prevenir });
    sortie.tri.partent.push(...r.tri.partent);
    sortie.tri.attendent.push(...r.tri.attendent);
    sortie.inscrits.push(...r.inscrits);
    sortie.refuses.push(...r.refuses);
    if (r.erreur) sortie.erreur = r.erreur;
  }
  return sortie;
}
