/* ══ LA VOIX D'UN FIL DU SERVEUR : JAMAIS UNE FICHE D'ENFANT · 4 novembre 2026 ══
   « Une fiche d'ENFANT ne doit jamais être la voix d'un numéro WhatsApp »
   (Yéman, par le-trone-bf). Ce matin, la mère écrit du numéro que portent
   ses deux filles mineures : le webhook rangeait son message sur la fille,
   la réponse d'Opale aussi, et le Trône disait que la fille avait écrit.

   La règle est celle du Trône (`voix-du-numero-pur`, recopiée telle quelle
   dans les fonctions) : l'adulte qui porte le numéro, sinon le parent qui
   règle le compte famille des enfants (sans numéro à lui), sinon personne.
   Ici, ce qu'une fonction serveur en fait pour UN fil : elle lit les fiches
   du numéro par leurs identifiants (`lis`, la base ou le banc), et rend la
   fiche qui parle, ou le nom de la voix sans fiche, et les fiches qui
   portent le numéro sans y parler (les enfants : leurs rendez-vous restent
   les leurs, mais ce ne sont jamais elles qui écrivent). Recopié dans
   whatsapp-webhook et whatsapp-automate (⟨voix-du-fil⟩). */

import { muetteSousSonPayeur, parleSurCeNumero, voixDesNumeros, type FamillePayeuse, type FicheParlante } from './voix-du-numero-pur';
import { numeroWa } from './numero-wa-pur';

/* ⟨voix-du-fil⟩ */
/** Une ligne de la base telle qu'on la lit : `clients` ou `families`. */
export type LigneDeLaVoix = { id: string; data?: Record<string, unknown> | null };
/** Lit des lignes par leurs identifiants ; `null` : la base ne répond pas. */
export type LecteurDeLaVoix = (table: 'clients' | 'families', ids: readonly string[]) => Promise<readonly LigneDeLaVoix[] | null>;
/** La fiche qui parle, telle qu'un message la porte et qu'on l'appelle. */
export type FicheDeLaVoix = { id: string; name: string; branchId: string; civilite?: 'madame' | 'mademoiselle' | 'monsieur'; auMasculin?: boolean };
export type VoixDuFil = {
  /** L'adulte qui porte ce numéro, sinon le parent qui règle le compte des enfants. */
  fiche?: FicheDeLaVoix;
  /** La fiche qui parle est celle du parent payeur : elle ne porte pas ce numéro. */
  payeur?: boolean;
  /** Personne n'a de fiche : le nom que la fiche des enfants lui donne (« Maman d'A. »). */
  nom?: string;
  /** Les fiches qui portent ce numéro sans y parler : les enfants. */
  muettes: string[];
};

const texteDeLaVoix = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() ? v : undefined);
const ficheParlanteDe = (l: LigneDeLaVoix): FicheParlante => ({
  id: String(l.id),
  name: texteDeLaVoix(l.data?.name) ?? '',
  branchId: texteDeLaVoix(l.data?.branchId) ?? '',
  phone: texteDeLaVoix(l.data?.phone),
  phone2: texteDeLaVoix(l.data?.phone2),
  phoneNom: texteDeLaVoix(l.data?.phoneNom),
  phone2Nom: texteDeLaVoix(l.data?.phone2Nom),
  birthday: texteDeLaVoix(l.data?.birthday),
  familyId: texteDeLaVoix(l.data?.familyId),
  archived: l.data?.archived === true,
});
const ficheDeLaVoix = (f: FicheParlante, l: LigneDeLaVoix | undefined): FicheDeLaVoix => {
  const c = l?.data?.civilite;
  return {
    id: f.id, name: f.name, branchId: f.branchId,
    ...(c === 'madame' || c === 'mademoiselle' || c === 'monsieur' ? { civilite: c } : {}),
    ...(l?.data?.auMasculin === true ? { auMasculin: true } : {}),
  };
};

/** QUI PARLE SUR CE NUMÉRO, pour un fil du serveur. `ids` : les fiches que la
    base rattache au numéro (celles qui le portent, et leur famille). `null` :
    la base ne répond pas, et le fil n'est rattaché à personne. */
export async function laVoixDuFil(numero: string, ids: readonly string[], lis: LecteurDeLaVoix, aujourdhui: string): Promise<VoixDuFil | null> {
  const cle = (brut: string | undefined): string => {
    const d = numeroWa(brut);
    return d.length === 13 && d.startsWith('22901') ? `229${d.slice(5)}` : d;
  };
  const k = cle(numero);
  const uniques = [...new Set(ids.filter(Boolean))];
  if (!k || uniques.length === 0) return { muettes: [] };
  const lues = await lis('clients', uniques);
  if (!lues) return null;
  const lignes = new Map(lues.map((l) => [String(l.id), l]));
  const fiches = lues.map(ficheParlanteDe).filter((f) => !f.archived);
  const porte = (f: FicheParlante, champ: 'phone' | 'phone2'): boolean => cle(f[champ]) === k;
  const portent = fiches.filter((f) => porte(f, 'phone') || porte(f, 'phone2'));
  if (portent.length === 0) return { muettes: [] };
  /* Les comptes famille de celles qui le portent, et leurs payeurs : un
     enfant SANS DATE DE NAISSANCE se juge par eux (`muetteSousSonPayeur`). */
  const foyers = [...new Set(portent.map((f) => f.familyId).filter((x): x is string => !!x))];
  const familles: FamillePayeuse[] = foyers.length === 0 ? [] : ((await lis('families', foyers)) ?? [])
    .map((l) => ({ id: String(l.id), payerClientId: texteDeLaVoix(l.data?.payerClientId) }));
  const absents = [...new Set(familles.map((f) => f.payerClientId).filter((x): x is string => !!x && !lignes.has(x)))];
  const payeurs = absents.length === 0 ? [] : ((await lis('clients', absents)) ?? []);
  for (const l of payeurs) lignes.set(String(l.id), l);
  const connues = [...fiches, ...payeurs.map(ficheParlanteDe).filter((f) => !f.archived)];
  const parleIci = (f: FicheParlante): boolean => (['phone', 'phone2'] as const)
    .some((c) => porte(f, c) && parleSurCeNumero(f, c, aujourdhui) && !muetteSousSonPayeur(f, c, connues, familles, aujourdhui));
  const muettes = portent.filter((f) => !parleIci(f)).map((f) => f.id);
  const adulte = portent.find(parleIci);
  if (adulte) return { fiche: ficheDeLaVoix(adulte, lignes.get(adulte.id)), muettes };
  /* Seuls des enfants le portent : le parent qui règle leur compte famille. */
  const { voix } = voixDesNumeros({ fiches: connues, familles, aujourdhui });
  const v = voix.get(k);
  if (v?.genre === 'fiche') return { fiche: ficheDeLaVoix(v.fiche, lignes.get(v.fiche.id)), payeur: true, muettes };
  if (v?.genre === 'sans-fiche') return { nom: v.nom, muettes };
  return { muettes };
}
/* ⟨/voix-du-fil⟩ */
