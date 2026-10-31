/* ══ LA MISSION NAÎT DU RITUEL — 1er novembre 2026 ═══════════════════════
   « Quand Hermine ou Ziadath travaille, c'est forcément une mission qu'elle a
   prise. Il faut créer la mission et le paiement, qui sont transférés en
   dépenses » (Yéman).

   Jusqu'ici la mission d'un prestataire extérieur se saisissait à la main
   (« + Mission »), après coup, quand on y pensait : au 31 octobre 2026, cinq
   missions de septembre attendaient encore, et rien n'était passé en Dépenses.

   LA RÈGLE, tranchée au sélecteur le 1er novembre 2026 :
   · la fiche du prestataire dit SES PRESTATIONS du catalogue et le PRIX
     CONVENU de chacune (une grille, comme pour une prestataire de l'équipe) ;
   · quand un rituel est HONORÉ (encaissé, ou « Honoré » au Carnet), chaque
     prestataire dont une prestation figure au rituel reçoit sa mission, UNE
     FOIS par rendez-vous : ré-honorer ne redonne rien ;
   · le montant est la somme des prix convenus des lignes qu'elle a faites ;
     une ligne sans prix donne une mission SANS MONTANT, à écrire avant de la
     payer (elle le dit dans sa note) ;
   · le paiement suit le réglage de la fiche : « à payer » (le bouton Payer
     fait naître la dépense, de la caisse choisie) ou « payée le jour même »
     (la mission naît payée, la dépense sort de la caisse de l'encaissement) ;
   · dés-honorer le rituel retire les missions nées de lui qui ne sont pas
     payées ; une mission payée reste, l'argent est sorti.

   Pur : aucune lecture de magasin. Le banc verifie-les-missions-des-prestataires
   le rejoue dans les deux sens. */

export const CHARGE_CATEGORY = 'Sous-traitance';
export const ID_CATEGORIE_CHARGE = 'ec-sous-traitance';

export type ReglementDuPrestataire = 'a-payer' | 'jour-meme';

export type MissionDuPrestataire = {
  id: string;
  branchId: string;
  providerId: string;
  label: string;
  date: string;
  qty?: number;
  amountXof: number;
  paidAt?: string;
  byName?: string;
  method?: string;
  note?: string;
  expenseId?: string;
  /** Le rendez-vous dont elle est née, quand elle n'a pas été saisie à la main. */
  rdvId?: string;
  /** Née d'elle-même à l'honneur du rituel. Absent = saisie à la main. */
  nee?: 'rituel';
};

export type PrestatairePourMissions = {
  id: string;
  branchId: string;
  name: string;
  archived?: boolean;
  prestations?: readonly string[];
  grille?: Readonly<Record<string, number>>;
  reglement?: ReglementDuPrestataire;
};

export type RituelPourMissions = {
  id: string;
  branchId: string;
  date: string;
  serviceIds: readonly string[];
  clientName?: string;
};

export type MissionNee = {
  mission: MissionDuPrestataire;
  prestataire: PrestatairePourMissions;
  /** Les prestations faites sans prix convenu sur la fiche (noms). */
  sansPrix: string[];
  /** La fiche dit « payée le jour même » : l'appelant la paie et écrit la charge. */
  payeeLeJourMeme: boolean;
};

export const prenomDe = (nom: string | undefined): string => (nom ?? '').trim().split(/\s+/)[0] ?? '';

/** Les prestations de ce rituel que cette fiche réalise (dans l'ordre du rituel). */
export const lignesDuPrestataire = (rdv: RituelPourMissions, p: PrestatairePourMissions): string[] => {
  const siennes = new Set(p.prestations ?? []);
  if (siennes.size === 0) return [];
  return rdv.serviceIds.filter((id) => siennes.has(id));
};

/** Les missions que ce rituel fait naître, une par prestataire concerné et
    pas encore servi pour ce rendez-vous. `nomDe` donne le nom d'une prestation
    du catalogue ; `idDeMission` fabrique l'identifiant (le magasin le fournit). */
export function missionsNeesDuRituel(
  rdv: RituelPourMissions,
  prestataires: readonly PrestatairePourMissions[],
  dejaLa: readonly Pick<MissionDuPrestataire, 'rdvId' | 'providerId'>[],
  nomDe: (serviceId: string) => string | undefined,
  idDeMission: () => string,
): MissionNee[] {
  const nees: MissionNee[] = [];
  for (const p of prestataires) {
    if (p.archived || p.branchId !== rdv.branchId) continue;
    const lignes = lignesDuPrestataire(rdv, p);
    if (lignes.length === 0) continue;
    if (dejaLa.some((m) => m.rdvId === rdv.id && m.providerId === p.id)) continue;
    const grille = p.grille ?? {};
    let amountXof = 0;
    const sansPrix: string[] = [];
    const noms: string[] = [];
    for (const id of lignes) {
      const nom = nomDe(id) ?? 'Prestation';
      if (!noms.includes(nom)) noms.push(nom);
      const prix = grille[id];
      if (typeof prix === 'number' && Number.isFinite(prix)) amountXof += Math.max(0, Math.round(prix));
      else if (!sansPrix.includes(nom)) sansPrix.push(nom);
    }
    const prenom = prenomDe(rdv.clientName);
    const label = `${noms.join(' + ')}${prenom ? ` · ${prenom}` : ''}`;
    const note = sansPrix.length ? `Montant à écrire : ${sansPrix.join(', ')} sans prix convenu sur sa fiche.` : undefined;
    nees.push({
      prestataire: p,
      sansPrix,
      payeeLeJourMeme: p.reglement === 'jour-meme',
      mission: {
        id: idDeMission(),
        branchId: rdv.branchId,
        providerId: p.id,
        label,
        date: rdv.date,
        qty: lignes.length,
        amountXof,
        ...(note ? { note } : {}),
        rdvId: rdv.id,
        nee: 'rituel',
      },
    });
  }
  return nees;
}

/** Les missions nées de ce rendez-vous qui s'effacent quand on le dés-honore :
    celles qui ne sont pas payées. Une mission payée reste (l'argent est sorti),
    une mission saisie à la main aussi (elle ne vient pas de l'honneur). */
export const missionsARetirerAuDeshonneur = (rdvId: string, missions: readonly MissionDuPrestataire[]): MissionDuPrestataire[] =>
  missions.filter((m) => m.nee === 'rituel' && m.rdvId === rdvId && !m.paidAt);

export type ChargeDeMission = {
  id: string;
  branchId: string;
  label: string;
  amountXof: number;
  date: string;
  cashbox: string;
  category: string;
  fx?: { code: string; rate: number; amount: number };
};

/** La charge qu'une mission payée écrit dans les Dépenses : toujours le même
    identifiant pour la même mission (`exp-ms-<mission>`), donc payer deux fois
    ne double rien. Le libellé est celui que l'écran écrivait depuis août 2026. */
export function chargeDeLaMission(
  m: Pick<MissionDuPrestataire, 'id' | 'branchId' | 'label' | 'amountXof'>,
  nomDuPrestataire: string,
  caisse: string,
  dateIso: string,
  fx?: ChargeDeMission['fx'],
): ChargeDeMission {
  return {
    id: `exp-ms-${m.id}`,
    branchId: m.branchId,
    label: `Prestataire · ${nomDuPrestataire}, ${m.label}`,
    amountXof: m.amountXof,
    date: dateIso,
    cashbox: caisse,
    category: CHARGE_CATEGORY,
    ...(fx ? { fx } : {}),
  };
}

/** La caisse d'où sort l'argent d'une mission payée le jour même : celle de
    l'encaissement quand on la connaît, sinon la caisse courante de la Maison
    (« Caisse du mois », puis « Caisse principale », puis la première), et
    « Caisse principale » quand la branche n'en a aucune. */
export function caisseDeLaMission(
  caisseDeLEncaissement: string | undefined,
  caissesDeLaBranche: readonly { name: string }[],
): string {
  if (caisseDeLEncaissement && caissesDeLaBranche.some((c) => c.name === caisseDeLEncaissement)) return caisseDeLEncaissement;
  return (caissesDeLaBranche.find((c) => c.name === 'Caisse du mois')
    ?? caissesDeLaBranche.find((c) => c.name === 'Caisse principale')
    ?? caissesDeLaBranche[0])?.name ?? 'Caisse principale';
}

const fr = (n: number): string => `${String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} F`;

/** Ce que l'écran dit quand des missions sont nées, en une ligne. */
export function ditLesMissionsNees(nees: readonly MissionNee[], caissePayee?: string): string {
  if (nees.length === 0) return '';
  const parts = nees.map((n) => {
    const qui = prenomDe(n.prestataire.name) || n.prestataire.name;
    if (n.mission.amountXof <= 0) return `mission de ${qui} notée, montant à écrire`;
    if (n.payeeLeJourMeme) return `mission de ${qui} payée, ${fr(n.mission.amountXof)}${caissePayee ? ` de la ${caissePayee}` : ''}, en Dépenses`;
    return `mission de ${qui} notée, ${fr(n.mission.amountXof)} à payer`;
  });
  return `${parts.join(' · ')}.`;
}

/** Ce que l'écran dit du retrait, pour `ditLeRetrait`. */
export const ditLesMissionsRetirees = (n: number): string =>
  n === 0 ? '' : n === 1 ? 'la mission du prestataire née de ce rituel est retirée' : `les ${n} missions de prestataires nées de ce rituel sont retirées`;
