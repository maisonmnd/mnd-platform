/* LE PARENT QUI A PRIS LE RENDEZ-VOUS — 27 octobre 2026.

   « Quand les enfants ont besoin d'un rendez-vous, parfois c'est le papa qui
   le prend, parfois la maman : j'ai deux numéros dans le profil de l'enfant.
   La personne qui a pris le RDV reçoit la confirmation et le rappel ; la
   facture va sur le numéro du parent payant » (Yéman).

   Une fiche à deux numéros (`phone`, `phone2`) : le rendez-vous retient celui
   à prévenir (`Appointment.numeroAPrevenir`). Par défaut, celui de son
   dernier rendez-vous (le parent qui prend d'habitude), sinon le premier
   numéro. Une fiche à un seul numéro ne retient rien : tout part au premier,
   comme avant. La facture, elle, ne lit pas ce champ : elle part au payeur
   du compte famille, sinon au premier numéro de la fiche
   (vente/envoi-de-la-piece.ts) ; le premier numéro est donc celui du parent
   qui paie.

   `telDuRdv` est recopiée telle quelle dans les fonctions confirmation-rdv
   et rappels-j1 (le banc verifie-le-numero-a-prevenir vérifie la copie). */

export type FicheAuxNumeros = { phone?: string; phone2?: string; phoneNom?: string; phone2Nom?: string };

const chiffres = (s?: string): string => (s ?? '').replace(/\D/g, '');

/** Les numéros de la fiche, avec le nom que la Maison leur a donné. */
export function numerosDeLaFiche(f: FicheAuxNumeros | undefined): { numero: string; nom: string }[] {
  if (!f) return [];
  const out: { numero: string; nom: string }[] = [];
  if (chiffres(f.phone)) out.push({ numero: (f.phone ?? '').trim(), nom: f.phoneNom?.trim() || 'Numéro 1' });
  if (chiffres(f.phone2) && chiffres(f.phone2) !== chiffres(f.phone)) out.push({ numero: (f.phone2 ?? '').trim(), nom: f.phone2Nom?.trim() || 'Numéro 2' });
  return out;
}

/** Le numéro tel que la fiche l'écrit, quand `n` en est un (les espaces et
    les points ne comptent pas). */
const surLaFiche = (n: string | undefined, f: FicheAuxNumeros): string | undefined =>
  numerosDeLaFiche(f).find((x) => !!chiffres(n) && chiffres(x.numero) === chiffres(n))?.numero;

/** LE NUMÉRO À PRÉVENIR POUR CE RENDEZ-VOUS : celui qu'on a touché, s'il est
    sur la fiche ; sinon celui de son dernier rendez-vous qui en portait un ;
    sinon le premier numéro. Une fiche à un seul numéro : rien. */
export function numeroAPrevenirDuRdv(o: {
  choisi?: string;
  fiche?: FicheAuxNumeros;
  derniers?: readonly { numeroAPrevenir?: string; date: string; time?: string }[];
}): string | undefined {
  const f = o.fiche;
  if (!f || numerosDeLaFiche(f).length < 2) return undefined;
  const choisi = surLaFiche(o.choisi, f);
  if (choisi) return choisi;
  const dernier = [...(o.derniers ?? [])]
    .filter((r) => !!surLaFiche(r.numeroAPrevenir, f))
    .sort((a, b) => `${b.date} ${b.time ?? ''}`.localeCompare(`${a.date} ${a.time ?? ''}`))[0];
  return (dernier && surLaFiche(dernier.numeroAPrevenir, f)) || numerosDeLaFiche(f)[0].numero;
}

/** À QUI ÉCRIRE POUR UN RENDEZ-VOUS (confirmation, rappel) : son numéro à
    prévenir, sinon le premier numéro de la fiche. */
export const telDuRdv = (a: { numeroAPrevenir?: string }, fiche?: { phone?: string }): string =>
  (a.numeroAPrevenir ?? '').trim() || (fiche?.phone ?? '').trim();
