/* ══ LE TPE DE POCHE — 25 novembre 2026 ════════════════════════════════
   « Create a terminal of payment for the Trône, a TPE, and I can give the
   access to certain employees to activate it on their phone and collect
   payment from customers » (Yéman). Maquette RsVNQvgB85ZvDVjaKuMrqP, lot 1
   lancé au sélecteur (« Construire le lot 1 maintenant »).

   LE CHEMIN. La direction coche « Peut encaisser » pour un membre de
   l'équipe, puis « Activer un téléphone » : un code de huit signes, valable
   dix minutes, s'affiche en QR. Le téléphone l'ouvre (tpe.html), la fonction
   `tpe-de-poche` lui rend un jeton d'appareil (32 octets, gardé ici en
   empreinte seulement), et le téléphone choisit son code à quatre chiffres.
   Il voit alors les rendez-vous du jour de sa branche ; « Encaisser » ouvre
   la page « Régler » du rendez-vous, celle que la cliente reçoit déjà sur
   WhatsApp, en mode TPE. L'argent ne s'écrit qu'à la confirmation de MTN ou
   de KkiaPay, par `regler-la-seance` et `collecte-mtn`, comme avant.

   LE LOT 1 N'ENCAISSE QUE LES SÉANCES QUI ONT LEUR PIÈCE (le Trône l'écrit à
   « Terminer ») : la page « Régler » n'encaisse un rendez-vous sans pièce que
   si Ma Couronne l'a ouvert. Une séance pas encore terminée se dit, et ne
   s'ouvre pas.

   ENTRE SES REPÈRES ⟨tpe-de-poche⟩, CE MODULE SE RECOPIE TEL QUEL dans la
   fonction `tpe-de-poche` ; `scripts/verifie-le-tpe-de-poche.mjs` tient la
   copie caractère pour caractère. Pur, sans import. */

/* ⟨tpe-de-poche⟩ */
/** L'alphabet des codes d'activation : sans 0, o, 1, i ni l (lus à voix haute). */
export const ALPHABET_DU_TPE = '23456789abcdefghjkmnpqrstuvwxyz';
/** Huit signes : 31⁸ ≈ 8,5 × 10¹¹ codes, pour dix minutes de vie. */
export const LONGUEUR_DU_CODE_DU_TPE = 8;
/** Un code d'activation vit dix minutes. */
export const DUREE_DU_CODE_DU_TPE_MS = 10 * 60_000;
/** Cotonou : UTC+1 toute l'année. */
export const DECALAGE_DU_TPE_MS = 3_600_000;
/** Le téléphone se verrouille après deux minutes sans un toucher. */
export const VERROU_DU_TPE_MS = 2 * 60_000;

/** Le code tel qu'on l'a tapé ou scanné : minuscules, sans espace ni tiret. */
export const codeDuTpePropre = (s: unknown): string => String(s ?? '').toLowerCase().replace(/[\s-]+/g, '');

/** Un code bien formé : huit signes de l'alphabet. */
export const estUnCodeDuTpe = (s: unknown): boolean =>
  typeof s === 'string' && s.length === LONGUEUR_DU_CODE_DU_TPE && [...s].every((c) => ALPHABET_DU_TPE.includes(c));

/** Le code dit à l'écran : « 4k7m-9q2x ». */
export const codeDuTpeDit = (code: string): string => `${code.slice(0, 4)}-${code.slice(4)}`;

/** Un code tiré de huit nombres aléatoires (crypto.getRandomValues). */
export function tireUnCodeDuTpe(aleas: ArrayLike<number>): string {
  let s = '';
  for (let i = 0; i < LONGUEUR_DU_CODE_DU_TPE; i++) s += ALPHABET_DU_TPE[(Number(aleas[i]) >>> 0) % ALPHABET_DU_TPE.length];
  return s;
}

/** Le jeton d'un téléphone : 32 octets en base64url, 43 signes. */
export const estUnJetonDAppareil = (s: unknown): boolean => typeof s === 'string' && /^[A-Za-z0-9_-]{43}$/.test(s);

/** Le jour de Cotonou d'un instant : « 2026-11-25 ». */
export const jourDuTpe = (ms: number): string => new Date(ms + DECALAGE_DU_TPE_MS).toISOString().slice(0, 10);

/** La clé d'une ligne : une branche, un membre de l'équipe. */
export const idDuTpe = (branchId: string, membreId: string): string => `${branchId}:${membreId}`;

/** Le nom d'un téléphone, tel qu'il se présente, court et sans balise. */
export const nomDAppareil = (s: unknown): string => String(s ?? '').replace(/[<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 60);

/** La ligne de la table `tpe_de_poche`, telle que la base la rend. */
export type LigneDuTpe = {
  id: string; branch_id: string; membre_id: string; nom: string; autorise: boolean;
  appareil_empreinte?: string | null; appareil_nom?: string | null; active_le?: string | null; coupe_le?: string | null;
  activation_empreinte?: string | null; activation_expire_le?: string | null; derniere_vue_le?: string | null;
  /** Le lot 2 : la direction lui ouvre les espèces (fermées par défaut). */
  especes?: boolean | null;
};

/** Où en est le TPE d'un membre :
    `sans` (pas autorisé), `pret` (autorisé, aucun téléphone), `code` (un code
    attend d'être scanné), `actif` (un téléphone encaisse), `coupe` (la
    direction l'a arrêté ; « Activer » le rouvre). */
export type EtatDuTpe = 'sans' | 'pret' | 'code' | 'actif' | 'coupe';
export function etatDuTpe(l: Pick<LigneDuTpe, 'autorise' | 'appareil_empreinte' | 'activation_empreinte' | 'activation_expire_le' | 'coupe_le'> | null | undefined, maintenantMs: number): EtatDuTpe {
  if (!l || !l.autorise) return 'sans';
  if (l.appareil_empreinte) return 'actif';
  if (l.activation_empreinte && Date.parse(String(l.activation_expire_le ?? '')) > maintenantMs) return 'code';
  if (l.coupe_le) return 'coupe';
  return 'pret';
}

/** Un code d'activation encore bon pour cette ligne. */
export const codeEncoreBon = (l: Pick<LigneDuTpe, 'autorise' | 'activation_expire_le'> | null | undefined, maintenantMs: number): boolean =>
  !!l && l.autorise === true && Date.parse(String(l.activation_expire_le ?? '')) > maintenantMs;

/** La marque qu'un TPE pose sur le lien de règlement du rendez-vous qu'il
    ouvre : qui, et quand. Le Trône en tire son journal du jour. */
export type MarqueDuTpe = { nom: string; membreId: string; le: string; /** Le reste à l'ouverture : le plafond du jour s'y lit (lot 2). */ montantXof?: number };

/** Le rendez-vous tel que le TPE le lit. */
export type RdvDuTpe = {
  id: string; date?: string; time?: string; status?: string; clientId?: string; clientName?: string;
  serviceIds?: string[];
  lienDeReglement?: { jeton?: string; payeLe?: string; tpe?: MarqueDuTpe } | null;
  payments?: { amountXof?: number }[];
};

/** Les rendez-vous d'un jour qu'un TPE montre : ce jour-là, jamais un
    annulé, dans l'ordre de l'heure. */
export function rdvsDuJourAuTpe<R extends RdvDuTpe>(rdvs: readonly R[], jour: string): R[] {
  return rdvs
    .filter((r) => r && String(r.date ?? '').slice(0, 10) === jour && r.status !== 'annulé')
    .sort((a, b) => String(a.time ?? '').localeCompare(String(b.time ?? '')) || String(a.id).localeCompare(String(b.id)));
}

/** Ce qu'un rendez-vous permet au TPE : encaisser (il a sa pièce et doit
    encore), rien (réglé), attendre que le Trône termine la séance, ou
    rien encore (des espèces sont déclarées, à remettre le soir). */
export type EtatAuTpe = 'a-encaisser' | 'reglee' | 'pas-terminee' | 'especes';
export function etatAuTpe(aUnePiece: boolean, resteXof: number | null, especesDeclarees = false): EtatAuTpe {
  if (!aUnePiece) return 'pas-terminee';
  if (especesDeclarees) return 'especes';
  return resteXof !== null && resteXof <= 0 ? 'reglee' : 'a-encaisser';
}

/** Ce que le téléphone reçoit d'un rendez-vous : rien d'autre que ce qu'il
    affiche. Ni numéro, ni nom de famille. */
export type LigneDuJourAuTpe = {
  id: string; heure: string; prenom: string; prestations: string; etat: EtatAuTpe; resteXof: number | null; essai: boolean;
};

/** Le téléphone se verrouille-t-il ? Deux minutes sans un toucher. */
export const tpeAVerrouiller = (dernierToucherMs: number, maintenantMs: number): boolean =>
  !(dernierToucherMs > 0) || maintenantMs - dernierToucherMs >= VERROU_DU_TPE_MS;

/** Un code à quatre chiffres. */
export const estUnCodeSecretDuTpe = (s: unknown): boolean => typeof s === 'string' && /^\d{4}$/.test(s);

/* ── LE LOT 2 (26 novembre 2026, « construis le lot 2 de la TPE », Yéman) ──
   Les plafonds et les espèces de la maquette, retenus tels qu'elle les
   proposait. L'attribution sur le paiement lui-même et « Autre montant »
   suivent (2b) : ils touchent aux fonctions qui inscrivent l'argent. */

/** Les plafonds : un paiement, et une journée, par TPE. Au-delà, la séance se
    règle au comptoir. */
export const PLAFOND_PAR_PAIEMENT_XOF = 300_000;
export const PLAFOND_PAR_JOUR_XOF = 1_000_000;

/** Ce qu'un TPE a engagé aujourd'hui. Une séance compte UNE fois, au plus
    haut de ses montants (rouverte, ou ouverte puis payée en espèces), et
    une séance ouverte mais pas encore payée compte déjà : le plafond se juge
    à l'ouverture, jamais après coup. */
export type EngagementDuTpe = { rdvId: string; montantXof: number };
export function engageDuJour(engagements: readonly EngagementDuTpe[], saufRdvId = ''): number {
  const parRdv = new Map<string, number>();
  for (const e of engagements) {
    if (!e || !e.rdvId || e.rdvId === saufRdvId) continue;
    const m = Math.max(0, Math.round(Number(e.montantXof) || 0));
    parRdv.set(e.rdvId, Math.max(parRdv.get(e.rdvId) ?? 0, m));
  }
  let total = 0;
  for (const m of parRdv.values()) total += m;
  return total;
}

/** Ce montant peut-il s'encaisser sur ce TPE ? */
export type VerdictDuPlafond = { ok: true } | { ok: false; raison: 'plafond-paiement' | 'plafond-jour'; resteDuJourXof: number };
export function plafondDuTpe(montantXof: number, dejaEngageXof: number): VerdictDuPlafond {
  const m = Math.max(0, Math.round(Number(montantXof) || 0));
  const deja = Math.max(0, Math.round(Number(dejaEngageXof) || 0));
  const resteDuJourXof = Math.max(0, PLAFOND_PAR_JOUR_XOF - deja);
  if (m > PLAFOND_PAR_PAIEMENT_XOF) return { ok: false, raison: 'plafond-paiement', resteDuJourXof };
  if (m > resteDuJourXof) return { ok: false, raison: 'plafond-jour', resteDuJourXof };
  return { ok: true };
}

/** LES ESPÈCES. Fermées par défaut, ouvertes par la direction, membre par
    membre. L'employée DÉCLARE les billets reçus pour une séance : ce n'est
    pas encore l'argent de la Maison, rien ne s'inscrit sur la pièce. Elle
    les remet le soir ; la direction les reçoit au Trône et les encaisse par
    son écran d'encaissement habituel (« Reçu »), ou dit « Pas reçu ». */
export type StatutDesEspeces = 'a-remettre' | 'recue' | 'refusee';
export type LigneDesEspeces = {
  id: string; branch_id: string; membre_id: string; nom: string; rdv_id: string; piece_id: string; montant_xof: number;
  prenom?: string | null; prestations?: string | null; declare_le: string; statut: StatutDesEspeces;
  traite_le?: string | null; traite_par?: string | null; encaissement_id?: string | null;
};
/** L'identifiant d'une déclaration : la séance, et l'instant. */
export const idDesEspeces = (rdvId: string, ms: number): string => `esp-${rdvId}-${Math.max(0, Math.floor(ms)).toString(36)}`;
/** Un statut que la direction peut donner : reçue, ou refusée. */
export const estUnStatutTraite = (s: unknown): s is 'recue' | 'refusee' => s === 'recue' || s === 'refusee';

/** Les espèces déclarées aujourd'hui par un TPE, pas refusées, en engagements. */
export function engagementsDesEspeces(lignes: readonly Pick<LigneDesEspeces, 'rdv_id' | 'montant_xof' | 'membre_id' | 'declare_le' | 'statut'>[], membreId: string, jour: string): EngagementDuTpe[] {
  return lignes
    .filter((l) => l && l.membre_id === membreId && l.statut !== 'refusee' && jourDuTpe(Date.parse(l.declare_le)) === jour)
    .map((l) => ({ rdvId: l.rdv_id, montantXof: l.montant_xof }));
}

/** Les séances qu'un TPE a ouvertes aujourd'hui, en engagements (au montant de leur ouverture). */
export function engagementsDesOuvertures(rdvs: readonly RdvDuTpe[], membreId: string, jour: string): EngagementDuTpe[] {
  return rdvs
    .filter((r) => r?.lienDeReglement?.tpe?.membreId === membreId && jourDuTpe(Date.parse(String(r.lienDeReglement.tpe.le))) === jour)
    .map((r) => ({ rdvId: r.id, montantXof: Number(r.lienDeReglement?.tpe?.montantXof) || 0 }));
}

/* ── « AUTRE MONTANT » (lot 2b, 26 novembre 2026, « construis le lot 2b ») ──
   La maquette : « Autre montant sert à un produit de la Gamme ou à un
   acompte, avec un motif », pour une cliente de passage. Le téléphone le
   PRÉPARE sous les plafonds, la cliente paie dans la fenêtre KkiaPay, et la
   transaction confirmée entre au registre. Le comptoir range ensuite la vente
   ou l'acompte (« C'est son paiement »). */
export const MOTIFS_DE_L_AUTRE_MONTANT = [
  { cle: 'gamme', dit: 'Produit de la Gamme' },
  { cle: 'acompte', dit: 'Acompte d’un rendez-vous' },
  { cle: 'autre', dit: 'Autre, à expliquer' },
] as const;
export type MotifDeLAutreMontant = (typeof MOTIFS_DE_L_AUTRE_MONTANT)[number]['cle'];
export const motifDit = (m: unknown): string => MOTIFS_DE_L_AUTRE_MONTANT.find((x) => x.cle === m)?.dit ?? 'Autre montant';
/** Le préfixe de la référence d'un autre montant : il dit au registre et au comptoir d'où vient le paiement. */
export const PREFIXE_DE_L_AUTRE_MONTANT = 'tpa-';
export const estUnAutreMontant = (id: unknown): boolean => typeof id === 'string' && /^tpa-[0-9a-z]{4,20}-[0-9a-z]{4,12}$/.test(id);
/** La référence : l'instant et un hasard, en base 36. */
export const idDeLAutreMontant = (ms: number, alea: number): string =>
  `${PREFIXE_DE_L_AUTRE_MONTANT}${Math.max(0, Math.floor(ms)).toString(36)}-${(Math.max(0, Math.floor(alea)) % 2_176_782_336).toString(36).padStart(6, '0')}`;
/** Le petit texte qui l'accompagne : court, sans balise. */
export const precisionPropre = (s: unknown): string => String(s ?? '').replace(/[<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 80);

/** Un autre montant bien formé : un montant d'au moins 100 F, un motif connu,
    et une précision quand le motif est « autre ». */
export type VerdictDeLAutreMontant = { ok: true; montantXof: number; motif: MotifDeLAutreMontant; precision: string } | { ok: false; raison: 'montant' | 'motif' | 'precision' };
export function autreMontantValide(o: { montantXof?: unknown; motif?: unknown; precision?: unknown }): VerdictDeLAutreMontant {
  const m = Math.round(Number(o.montantXof));
  if (!Number.isFinite(m) || m < 100) return { ok: false, raison: 'montant' };
  const motif = MOTIFS_DE_L_AUTRE_MONTANT.find((x) => x.cle === o.motif)?.cle;
  if (!motif) return { ok: false, raison: 'motif' };
  const precision = precisionPropre(o.precision);
  if (motif === 'autre' && precision.length < 3) return { ok: false, raison: 'precision' };
  return { ok: true, montantXof: m, motif, precision };
}

/** La ligne de la table `tpe_autres` (0248), telle que la base la rend. */
export type StatutDeLAutreMontant = 'en-cours' | 'payee' | 'abandonnee';
export type LigneDeLAutreMontant = {
  id: string; branch_id: string; membre_id: string; nom: string; montant_xof: number; motif: string; precision?: string | null;
  cree_le: string; statut: StatutDeLAutreMontant; transaction_id?: string | null; paye_le?: string | null; frais_xof?: number | null;
};

/** Les autres montants d'un TPE aujourd'hui, en engagements : préparés ou payés, jamais abandonnés. */
export function engagementsDesAutres(lignes: readonly Pick<LigneDeLAutreMontant, 'id' | 'montant_xof' | 'membre_id' | 'cree_le' | 'statut'>[], membreId: string, jour: string): EngagementDuTpe[] {
  return lignes
    .filter((l) => l && l.membre_id === membreId && l.statut !== 'abandonnee' && jourDuTpe(Date.parse(l.cree_le)) === jour)
    .map((l) => ({ rdvId: l.id, montantXof: l.montant_xof }));
}

/** Le paiement de KkiaPay règle-t-il cet autre montant ? Réussi, et au moins
    le montant préparé (à un franc près). */
export const kkiapayReglaLAutre = (tx: { status?: unknown; amount?: unknown } | null | undefined, montantXof: number): boolean =>
  !!tx && String(tx.status ?? '').toUpperCase() === 'SUCCESS' && Math.round(Number(tx.amount ?? 0)) + 1 >= Math.round(Number(montantXof) || 0);

/** LE TOTAL DU SOIR d'un TPE : ce que KkiaPay ou MTN ont confirmé sur les
    séances qu'il a ouvertes (le dernier paiement, venu après l'ouverture), les
    espèces déclarées (à remettre ou reçues), et ses autres montants payés. */
export type TotalDuSoir = { encaisseXof: number; especesXof: number; especesARemettreXof: number; autresXof: number; seances: number };
export function totalDuSoir(
  rdvs: readonly RdvDuTpe[],
  especes: readonly Pick<LigneDesEspeces, 'montant_xof' | 'membre_id' | 'declare_le' | 'statut'>[],
  membreId: string, jour: string,
  autres: readonly Pick<LigneDeLAutreMontant, 'montant_xof' | 'membre_id' | 'cree_le' | 'statut'>[] = [],
): TotalDuSoir {
  let encaisseXof = 0; let especesXof = 0; let especesARemettreXof = 0; let autresXof = 0; let seances = 0;
  for (const a of autres) {
    if (!a || a.membre_id !== membreId || a.statut !== 'payee' || jourDuTpe(Date.parse(a.cree_le)) !== jour) continue;
    autresXof += Math.max(0, Math.round(Number(a.montant_xof) || 0));
    seances += 1;
  }
  for (const r of rdvs) {
    const t = r?.lienDeReglement?.tpe;
    if (!t || t.membreId !== membreId || jourDuTpe(Date.parse(String(t.le))) !== jour) continue;
    const paye = r.lienDeReglement?.payeLe;
    if (!paye || Date.parse(paye) < Date.parse(t.le) - 60_000) continue;
    const liste = Array.isArray(r.payments) ? r.payments : [];
    const dernier = liste[liste.length - 1];
    encaisseXof += Math.max(0, Math.round(Number(dernier?.amountXof) || 0));
    seances += 1;
  }
  for (const e of especes) {
    if (!e || e.membre_id !== membreId || e.statut === 'refusee' || jourDuTpe(Date.parse(e.declare_le)) !== jour) continue;
    const m = Math.max(0, Math.round(Number(e.montant_xof) || 0));
    especesXof += m;
    if (e.statut === 'a-remettre') especesARemettreXof += m;
    seances += 1;
  }
  return { encaisseXof, especesXof, especesARemettreXof, autresXof, seances };
}
/* ⟨/tpe-de-poche⟩ */

/** OÙ VIT TRÔNE TERMINAL — 26 novembre 2026 : sur le site du portail, hors de
    la portée de l'app Le Trône (qui captait /trone/ sur Android). Un chemin
    relatif à l'origine, comme tous les liens entre sœurs ; en développement,
    tout vit à la racine. */
export const CHEMIN_DU_TERMINAL = '/mnd-platform/';

/** L'adresse que le QR d'activation porte, à côté du Trône servi : aucun nom
    de domaine écrit ici (la règle de la Maison), l'origine et le chemin
    viennent de la page qui l'affiche. */
export function adresseDActivation(origine: string, cheminDuTrone: string, code: string): string {
  const base = cheminDuTrone.endsWith('/') ? cheminDuTrone : `${cheminDuTrone}/`;
  return `${origine}${base}tpe.html?a=${encodeURIComponent(code)}`;
}

/** L'adresse de la page « Régler » d'un lien, en mode TPE (`tpe=1`), à côté
    de la page qui la demande. */
export function adresseDuReglementAuTpe(cheminDuSite: string, jetonDuLien: string): string {
  const base = cheminDuSite.endsWith('/') ? cheminDuSite : `${cheminDuSite}/`;
  return `${base}payer.html?tg=r-${encodeURIComponent(jetonDuLien)}&tpe=1`;
}

/** OÙ EN EST UN AUTRE MONTANT, AU TRÔNE (lot 2b, 26 novembre 2026).
    « rangé » : une pièce porte sa transaction (le comptoir a choisi « C'est
    son paiement ») ; « à ranger » : KkiaPay l'a reçu, aucune pièce encore ;
    « en cours » : la fenêtre est ouverte, ou le téléphone n'a rien confirmé ;
    « abandonné » : la fenêtre s'est fermée sans paiement. Le registre fait
    foi même quand le téléphone a perdu le réseau avant de confirmer. */
export type EtatDeLAutreMontant = 'range' | 'a-ranger' | 'en-cours' | 'abandonnee';
export function etatDeLAutreMontant(
  l: Pick<LigneDeLAutreMontant, 'id' | 'statut' | 'transaction_id'>,
  recuAuRegistre: ReadonlyMap<string, string>,
  refsPrises: ReadonlySet<string>,
): { etat: EtatDeLAutreMontant; ref?: string } {
  const ref = String(l.transaction_id ?? '').trim() || recuAuRegistre.get(l.id) || '';
  if (ref && refsPrises.has(ref)) return { etat: 'range', ref };
  if (l.statut === 'payee' || ref) return { etat: 'a-ranger', ...(ref ? { ref } : {}) };
  if (l.statut === 'abandonnee') return { etat: 'abandonnee' };
  return { etat: 'en-cours' };
}
