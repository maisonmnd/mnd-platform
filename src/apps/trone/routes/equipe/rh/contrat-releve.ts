import { metsAJour, nouvellePiece, secretariatStore, signatairesDe } from '../../../../../shared/secretariat';
import { nomEntierDuDossier, remplisLeContratDApprentissage } from '../../../../../shared/releve-pur';
import type { Candidature } from '../../../../../shared/rh-pur';

/* ══ LE CONTRAT D'APPRENTISSAGE, PRÉPARÉ AU SECRÉTARIAT — 15 octobre 2026 ══
   Comme les lettres des RH (`lettres.ts`) : le modèle du Secrétariat
   (`contrat-apprentissage`, « à faire relire »), rempli depuis le dossier
   de La Relève (nom, naissance, domicile, durée, allocation), et PRIVÉ :
   un contrat qui parle d'une personne ne se lit pas par toute l'équipe.
   Ce qui reste entre crochets (les parents, les dates, l'adresse, le jour du
   versement, la CNSS, le décret) se complète à la main ; l'éditeur le compte
   avant la signature. */
export function prepareLeContratDApprentissage(o: {
  c: Candidature; branchId: string; moi: string; duree: 2 | 3; allocations: readonly number[];
}): string {
  const sig = signatairesDe(secretariatStore.get()).find((s) => s.userId === o.moi);
  const p = nouvellePiece({
    branchId: o.branchId, entite: 'mnd', modele: 'contrat-apprentissage', auteurId: o.moi,
    signataires: sig ? [{ userId: sig.userId, nom: sig.nom, qualite: sig.qualite }] : [],
  });
  const d = o.c.releve?.dossier;
  const v = {
    nomEntier: d ? nomEntierDuDossier(d) : o.c.nom,
    naissance: d?.naissance ?? '',
    domicile: d?.quartier ?? '',
    duree: o.duree,
    allocations: o.allocations,
  };
  const l = metsAJour(p, { prive: true, corps: remplisLeContratDApprentissage(p.corps, v) });
  return l.id;
}
