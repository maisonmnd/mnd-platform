import { metsAJour, nouvellePiece, secretariatStore, signatairesDe } from '../../../../../shared/secretariat';
import { remplisDepuisEquipe } from '../../../../../shared/secretariat-modeles';
import type { StaffMember } from '../data';

/* ══ UNE LETTRE DES RH, PRÉPARÉE AU SECRÉTARIAT — 14 octobre 2026 ═══════
   Certificat de travail, acceptation de démission, convocation, demande
   d'explication, avertissement : le modèle du Secrétariat, rempli depuis la
   fiche (nom, poste, date d'entrée, contrat), et PRIVÉ (0122) : une lettre
   qui parle d'une personne ne se lit pas par toute l'équipe. Elle s'ouvre
   dans l'éditeur ; on la relit, on la signe. */
export type ModeleRh = 'certificat-fin-contrat' | 'acceptation-demission' | 'convocation-entretien' | 'demande-explication' | 'avertissement' | 'contrat-travail';

export function prepareLaLettre(o: { modele: ModeleRh; fiche: StaffMember; branchId: string; moi: string }): string {
  const sig = signatairesDe(secretariatStore.get()).find((s) => s.userId === o.moi);
  const p = nouvellePiece({
    branchId: o.branchId, entite: 'mnd', modele: o.modele, auteurId: o.moi,
    signataires: sig ? [{ userId: sig.userId, nom: sig.nom, qualite: sig.qualite }] : [],
  });
  const entree = o.fiche.entreeLe ?? o.fiche.since;
  const v = {
    name: o.fiche.name, role: o.fiche.role, contrat: o.fiche.contractType ?? '',
    entree: entree ? new Date(entree).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) : '',
  };
  const l = metsAJour(p, {
    prive: true,
    corps: remplisDepuisEquipe(p.corps, v),
    destinataire: remplisDepuisEquipe(p.destinataire, v),
    objet: remplisDepuisEquipe(p.objet, v),
  });
  return l.id;
}
