/* ══ LA VOIX D'UN NUMÉRO : JAMAIS UNE FICHE D'ENFANT · 4 novembre 2026 ══
   « A. ne peut pas écrire dans WhatsApp car c'est un compte enfant. C'est
   toujours son père ou sa mère qui nous écrirait. Il ne faut pas que les
   fiches des enfants se mélangent dans WhatsApp pour ne pas répondre à la
   fiche de l'enfant sur le numéro du parent. La même chose que J. : le
   logiciel dit que c'est J. qui a écrit ce matin, mais c'est la mère qui
   écrit » (Yéman). Le Trône prenait la PREMIÈRE fiche qui porte le numéro :
   une enfant de sept ans, sur le téléphone de sa mère.

   LA RÈGLE, une fois pour toutes :
   · une fiche d'ENFANT ne prête jamais son numéro à un fil WhatsApp. Elle est
     enfant pour ce numéro si elle est mineure (`estMineur`, sa date de
     naissance), ou si la fiche nomme ce numéro comme celui d'un parent
     (« Maman », « Papa », `phoneNom` / `phone2Nom`) ;
   · la VOIX du numéro est l'adulte qui le porte ; sinon le parent qui règle
     le compte famille des enfants, quand sa fiche n'a pas de numéro à elle ;
   · sinon une voix SANS FICHE, nommée comme la fiche la nomme : « Maman d'A. et
     N. », « Parent de J. et F. ».
   SANS DATE DE NAISSANCE (revue du 4 novembre 2026) : une fiche du compte
   famille qu'une AUTRE fiche règle ne parle pas sur le numéro de ce payeur,
   ni sur aucun numéro quand le payeur n'en a pas à lui. On ne devine pas
   l'âge : le payeur parle. Sur un numéro bien à elle, elle parle.
   Pur, sans magasin : le Trône le lit (`tetesDeLaMaison`), une fonction
   serveur peut le recopier. `scripts/verifie-la-voix-du-numero.mjs` le
   prouve (et `--prouve`). */

import { ageDe, estMineur } from './clients-pur';
import { prenomDe, prenomsDits } from './foyer-pur';
import { numeroWa } from './numero-wa-pur';

/* ⟨voix-du-numero⟩ */
/** La clé de comparaison d'un numéro (229 01 97… et 229 97… sont le même). */
const cleDuNumero = (brut: string | undefined): string => {
  const d = numeroWa(brut);
  return d.length === 13 && d.startsWith('22901') ? `229${d.slice(5)}` : d;
};

/** Le nom qu'une fiche donne à l'un de ses numéros, quand c'est celui d'un parent. */
export const LIBELLE_PARENTAL = /^\s*(maman|papa|m[èe]re|p[èe]re|parents?|tuteur|tutrice)\b/i;

export type FicheParlante = {
  id: string;
  name: string;
  branchId: string;
  phone?: string;
  phone2?: string;
  phoneNom?: string;
  phone2Nom?: string;
  birthday?: string;
  familyId?: string;
  archived?: boolean;
};
export type FamillePayeuse = { id: string; payerClientId?: string };

/** LA FICHE PARLE-T-ELLE SUR CE NUMÉRO ? Non si elle est mineure, ou si elle
    nomme ce numéro comme celui d'un parent. */
export function parleSurCeNumero(f: FicheParlante, champ: 'phone' | 'phone2', aujourdhui: string): boolean {
  if (estMineur(f, aujourdhui)) return false;
  const nom = champ === 'phone' ? f.phoneNom : f.phone2Nom;
  return !LIBELLE_PARENTAL.test(nom ?? '');
}

/** SANS DATE DE NAISSANCE, SOUS UN PAYEUR : la fiche ne parle pas sur le
    numéro du parent qui règle son compte famille, ni sur aucun numéro quand
    ce parent n'en a pas. `fiches` : celles qu'on connaît (le payeur parmi
    elles, sinon on ne juge pas). */
export function muetteSousSonPayeur(
  f: FicheParlante, champ: 'phone' | 'phone2', fiches: readonly FicheParlante[],
  familles: readonly FamillePayeuse[] | undefined, aujourdhui: string,
): boolean {
  if (ageDe(f.birthday, aujourdhui) !== undefined || !f.familyId) return false;
  const payeurId = (familles ?? []).find((fa) => fa.id === f.familyId)?.payerClientId;
  if (!payeurId || payeurId === f.id) return false;
  const payeur = fiches.find((x) => x.id === payeurId && !x.archived);
  if (!payeur) return false;
  const k = cleDuNumero(f[champ]);
  const p1 = cleDuNumero(payeur.phone);
  const p2 = cleDuNumero(payeur.phone2);
  return (!p1 && !p2) || (!!k && (p1 === k || p2 === k));
}

export type VoixDuNumero =
  /** Une fiche adulte parle sur ce numéro (elle le porte, ou elle règle le compte des enfants qui le portent). */
  | { genre: 'fiche'; numero: string; fiche: FicheParlante; enfants: string[] }
  /** Personne n'a de fiche pour ce numéro : la voix porte le nom que les enfants lui donnent. */
  | { genre: 'sans-fiche'; numero: string; nom: string; branchId: string; enfants: string[] };

/** LES VOIX DES NUMÉROS QUE SEULS DES ENFANTS PORTENT (clé du numéro → voix),
    et, pour chaque fiche, les numéros sur lesquels elle parle. Un numéro porté
    par un adulte n'a pas d'entrée ici : il parle déjà par sa fiche. */
export function voixDesNumeros(o: {
  fiches: readonly FicheParlante[];
  familles?: readonly FamillePayeuse[];
  aujourdhui: string;
}): { voix: Map<string, VoixDuNumero>; parle: (f: FicheParlante, champ: 'phone' | 'phone2') => boolean } {
  const vivantes = o.fiches.filter((f) => !f.archived);
  const parle = (f: FicheParlante, champ: 'phone' | 'phone2') =>
    parleSurCeNumero(f, champ, o.aujourdhui) && !muetteSousSonPayeur(f, champ, vivantes, o.familles, o.aujourdhui);
  const adultes = new Set<string>();
  const enfants = new Map<string, { brut: string; fiche: FicheParlante; libelle?: string }[]>();
  for (const f of vivantes) {
    for (const champ of ['phone', 'phone2'] as const) {
      const brut = f[champ];
      const k = cleDuNumero(brut);
      if (!k || !brut) continue;
      if (parle(f, champ)) { adultes.add(k); continue; }
      const liste = enfants.get(k) ?? [];
      if (!liste.some((x) => x.fiche.id === f.id)) liste.push({ brut, fiche: f, libelle: champ === 'phone' ? f.phoneNom : f.phone2Nom });
      enfants.set(k, liste);
    }
  }
  const voix = new Map<string, VoixDuNumero>();
  for (const [k, liste] of enfants) {
    if (adultes.has(k)) continue;
    const ids = liste.map((x) => x.fiche.id);
    const famille = (o.familles ?? []).find((fa) => liste.some((x) => x.fiche.familyId && x.fiche.familyId === fa.id));
    const payeur = famille?.payerClientId ? vivantes.find((f) => f.id === famille.payerClientId) : undefined;
    /* Le payeur parle sur ce numéro s'il n'en a pas à lui : la mère qui règle
       le compte de ses filles écrit du téléphone que portent les filles. */
    const payeurSansNumero = !!payeur && !cleDuNumero(payeur.phone) && !cleDuNumero(payeur.phone2);
    if (payeur && payeurSansNumero && !ids.includes(payeur.id)) {
      voix.set(k, { genre: 'fiche', numero: liste[0].brut, fiche: payeur, enfants: ids });
      continue;
    }
    const libelle = (liste.find((x) => LIBELLE_PARENTAL.test(x.libelle ?? ''))?.libelle ?? '').trim();
    const qui = libelle ? `${libelle[0].toUpperCase()}${libelle.slice(1).toLowerCase()}` : 'Parent';
    const prenoms = prenomsDits([...new Set(liste.map((x) => prenomDe(x.fiche.name)).filter(Boolean))]);
    /* « Maman d'A. », « Parent de J. » : l'élision devant une voyelle. */
    const de = /^[aeiouyàâäéèêëîïôöûüh]/i.test(prenoms) ? 'd’' : 'de ';
    voix.set(k, { genre: 'sans-fiche', numero: liste[0].brut, nom: `${qui} ${de}${prenoms}`, branchId: liste[0].fiche.branchId, enfants: ids });
  }
  return { voix, parle };
}
/* ⟨/voix-du-numero⟩ */
