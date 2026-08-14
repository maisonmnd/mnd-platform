import { clientsStore, familiesStore, type Client } from './clients';
import { appointmentsStore } from './agenda';
import { invoicesStore, creditMovementsStore } from './finance';
import { bilansStore } from './bilans';
import { clientSessionsStore } from './activity';
import { enfantsDeclaresStore } from './enfants';

/* LA FUSION DE DEUX FICHES — le geste qui soude un doublon SANS SQL (14 août,
   demande de Yéman : « je peux faire la soudure moi-même »).

   D'où viennent les doublons : une cliente du carnet s'inscrit sur Ma
   Couronne AVANT que sa fiche ne porte son adresse — l'adoption est aveugle,
   une fiche neuve naît à côté de la vraie (Ruth, 14 août). La réparation
   passait par un SQL écrit à la main ; elle devient un geste du comptoir.

   La mécanique est CELLE DES SOUDURES éprouvées : l'absorbée sert de SOCLE
   (téléphone, histoire, famille), les champs REMPLIS du survivant passent
   par-dessus, l'historique suit (rendez-vous, factures, bilans, présence,
   déclarations d'enfants, familles, avoirs), la coquille s'efface. Le
   personnel a le droit d'écrire tout cela — la RLS le laisse passer, et la
   synchronisation pousse chaque ligne modifiée. */

/** Qui survit ? LA FICHE AU COMPTE — un compte de connexion ne déménage pas
    de fiche. Sans compte des deux côtés : celle que l'on tient ouverte.
    Deux comptes : refus — deux comptes ne se fondent pas d'ici. */
export function survivantDe(ouverte: Client, autre: Client):
  | { survivant: Client; absorbee: Client }
  | { erreur: string } {
  if (ouverte.authUserId && autre.authUserId) {
    return {
      erreur: 'Ces deux fiches portent chacune un compte de connexion — elles ne peuvent pas se fondre d’ici. Il faut d’abord supprimer l’un des deux comptes (Supabase → Authentication → Users), puis refaire ce geste.',
    };
  }
  if (autre.authUserId) return { survivant: autre, absorbee: ouverte };
  return { survivant: ouverte, absorbee: autre };
}

const estVide = (v: unknown): boolean =>
  v === undefined || v === null || (typeof v === 'string' && v.trim() === '');

/** Les champs REMPLIS d'une fiche — ce qui passe par-dessus le socle. */
const champsRemplis = (c: Client): Partial<Client> =>
  Object.fromEntries(Object.entries(c).filter(([, v]) => !estVide(v))) as Partial<Client>;

/** Un nom d'attente n'est pas un nom — le socle garde alors le sien. */
const nomDAttente = (n: string | undefined): boolean =>
  !n || !n.trim() || /cliente ma couronne/i.test(n);

export type BilanFusion = { rdv: number; factures: number; bilans: number };

/** Fusionne l'absorbée dans le survivant. Rend le compte de ce qui a suivi. */
export function fusionnerFiches(survivantId: string, absorbeeId: string): BilanFusion {
  const tous = clientsStore.get();
  const s = tous.find((c) => c.id === survivantId);
  const a = tous.find((c) => c.id === absorbeeId);
  if (!s || !a || s.id === a.id) return { rdv: 0, factures: 0, bilans: 0 };

  const bilan: BilanFusion = {
    rdv: appointmentsStore.get().filter((x) => x.clientId === a.id).length,
    factures: invoicesStore.get().filter((x) => x.clientId === a.id).length,
    bilans: bilansStore.get().filter((x) => x.clientId === a.id).length,
  };

  /* ── LA FICHE FUSIONNÉE : socle absorbée, champs remplis du survivant
     par-dessus — puis les règles qui ne se déduisent pas d'un simple
     recouvrement. ── */
  const fusion: Client = {
    ...a,
    ...champsRemplis(s),
    id: s.id,
    authUserId: s.authUserId ?? a.authUserId,
    name: nomDAttente(s.name) ? (a.name || s.name) : s.name,
    /* Les points s'additionnent — deux carnets, une seule fidélité. */
    loyaltyPoints: (s.loyaltyPoints ?? 0) + (a.loyaltyPoints ?? 0),
    /* Les segments s'unissent. */
    segments: Array.from(new Set([...(a.segments ?? []), ...(s.segments ?? [])])),
    /* La plus ancienne entrée à la maison fait foi. */
    since: [s.since, a.since].filter(Boolean).sort()[0] ?? s.since,
    crownSince: [s.crownSince, a.crownSince].filter(Boolean).sort()[0],
    familyId: s.familyId || a.familyId,
    /* De passage seulement si les DEUX l'étaient — une vraie venue efface la marque. */
    dePassage: s.dePassage && a.dePassage ? true : undefined,
  };

  /* ── Le carnet : la coquille sort, le survivant prend la fusion. ── */
  clientsStore.set((prev) => prev.filter((c) => c.id !== a.id).map((c) => (c.id === s.id ? fusion : c)));

  /* ── L'histoire suit, table par table. ── */
  appointmentsStore.set((prev) => prev.map((x) => {
    let y = x;
    if (y.clientId === a.id) y = { ...y, clientId: s.id, clientName: fusion.name };
    if (y.offertPar === a.id) y = { ...y, offertPar: s.id };
    return y;
  }));
  invoicesStore.set((prev) => prev.map((x) => (x.clientId === a.id ? { ...x, clientId: s.id } : x)));
  bilansStore.set((prev) => prev.map((x) => (x.clientId === a.id ? { ...x, clientId: s.id } : x)));
  clientSessionsStore.set((prev) => prev.map((x) => (x.clientId === a.id ? { ...x, clientId: s.id } : x)));
  enfantsDeclaresStore.set((prev) => prev.map((x) => {
    let y = x;
    if (y.clientId === a.id) y = { ...y, clientId: s.id };
    if (y.clientCreeId === a.id) y = { ...y, clientCreeId: s.id };
    return y;
  }));
  familiesStore.set((prev) => prev.map((f) => (f.payerClientId === a.id ? { ...f, payerClientId: s.id } : f)));
  creditMovementsStore.set((prev) => prev.map((m) =>
    m.holderType === 'client' && m.holderId === a.id ? { ...m, holderId: s.id } : m));

  return bilan;
}
