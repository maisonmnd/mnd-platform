import { VILLES_PROPOSEES } from '../../../../shared/classement-pur';

/* LES VILLES PROPOSÉES — 20 novembre 2026 (« Rajoute des villes pré-remplies
   dans la rubrique de la ville dans le profil », Yéman). Une liste que le
   champ « Ville » propose en tapant (`list="villes-proposees"`) ; on peut
   toujours écrire autre chose. Rangées comme le classement les lit : Cotonou
   et ses quartiers, Hors Cotonou, la diaspora. */
export const ID_DES_VILLES = 'villes-proposees';

export function ListeDesVilles() {
  return (
    <datalist id={ID_DES_VILLES}>
      {VILLES_PROPOSEES.flatMap((g) => g.villes.map((v) => <option key={`${g.groupe}-${v}`} value={v} label={g.groupe} />))}
    </datalist>
  );
}
