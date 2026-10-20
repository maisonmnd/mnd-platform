/* ══ LES GESTES SUR UN CONTRAT ET SUR UNE SÉANCE — 20 octobre 2026 ═════════
   Maquette « Le parcours de l'abonnée » (Fs84PGHA…), validée : au Trône,
   chaque geste DIT SON EFFET AVANT D'AGIR, en chiffres, et ce que la cliente
   lira ensuite dans Ma Couronne. Les effets se lisent dans le juge unique
   (`shared/abonnee-pur`) appliqué au contrat tel qu'il SERAIT : l'écran ne
   calcule rien de son côté, il montre le relevé d'après.

   L'ARGENT D'UN CONTRAT NE S'ÉCRIT PAS ICI. Un versement passe par le
   serveur (`verse_sur_l_abonnement`, 0138), qui écrit le contrat ET sa pièce
   sous le même identifiant, dans la même transaction. Hors ligne, on refuse
   et on le dit : un contrat réécrit sur l'appareil ferait renaître le double
   registre que cette fonction referme.

   Les autres gestes (dates, motifs, faits d'une séance) s'écrivent par les
   magasins, comme tout geste du Trône, et la base les trace. */
import { supabase } from '../../../../shared/supabase';
import { estHorsLigne } from '../../../../shared/appels-en-attente';
import {
  subscribersStore, releveDuContrat, revoitLePrixConvenu, type ContexteDuJuge, type Plan, type Subscriber,
} from '../../../../shared/abonnements';
import { appointmentsStore, type Appointment } from '../../../../shared/agenda';
import {
  debutDuContratLu, francs, jourDitAvecLAnnee, jourOuvre, joursEntre, type ReleveDuContrat, type SeanceDuContrat,
} from '../../../../shared/abonnee-pur';
import { decaleLeJour, jourDeCotonou } from '../../../../shared/ia-faits-pur';
import { construitEcheancier, type Echeance } from '../../../../shared/echeancier';

/** Ce que l'écran annonce avant le geste : des lignes, et ce que la cliente lira. */
export type Effet = { lignes: string[]; laClienteLit?: string; refus?: string };

const dit = (iso: string | null | undefined): string => (iso ? jourDitAvecLAnnee(iso) : 'sans date');

/** Le contrat tel qu'il serait, relu par le juge (le jour peut être futur). */
const releveApres = (
  sub: Subscriber, plan: Plan | undefined, appts: readonly Appointment[], ctx: ContexteDuJuge,
): ReleveDuContrat | undefined => releveDuContrat(sub, plan, appts, ctx);

/* ── RÉSILIER, DATÉ ───────────────────────────────────────────────────── */

/** RÉSILIER (décision 9) : ce qui a été réglé au-delà des séances comptées
    devient un avoir, au prorata, arrondi au franc ; le consommé au-delà du
    réglé reste dû à la date de résiliation. Les échéances à venir sont
    annulées ; les séances posées après la date ne comptent plus. */
export function effetDeLaResiliation(
  sub: Subscriber, plan: Plan | undefined, appts: readonly Appointment[], ctx: ContexteDuJuge, le: string,
): Effet {
  if (!le) return { lignes: [], refus: 'Choisissez la date de résiliation.' };
  const aujourdhui = ctx.jour ?? jourDeCotonou();
  if (le < debutDuContratLu(sub)) return { lignes: [], refus: 'La résiliation ne peut pas précéder la signature.' };
  const jour = le > aujourdhui ? le : aujourdhui;
  const avant = releveApres(sub, plan, appts, { ...ctx, jour });
  const apres = releveApres({ ...sub, status: 'churn', resilieeLe: le }, plan, appts, { ...ctx, jour });
  if (!apres) return { lignes: [], refus: 'Contrat introuvable.' };
  const lignes: string[] = [];
  const p = apres.argent.prorata;
  if (p) {
    lignes.push(`Séances comptées au ${dit(le)} : ${p.comptees} sur ${p.seances} (faites et manquées).`);
    lignes.push(`Consommé : ${francs(p.consommeXof)} · réglé : ${francs(apres.argent.regleXof)}.`);
    if (p.avoirXof > 0) lignes.push(`Avoir de ${francs(p.avoirXof)}, à part dans Mon solde, jamais retranché en silence.`);
    if (p.resteXof > 0) lignes.push(`Consommé au-delà du réglé : ${francs(p.resteXof)} dus le ${dit(p.dueIso)}, relancés comme une échéance.`);
    if (p.avoirXof === 0 && p.resteXof === 0) lignes.push('Rien à rendre, rien à réclamer.');
  } else {
    /* UNE CHAQUE LUNE RÉSILIÉE NE DONNE PAS D'AVOIR : la lune réglée court
       jusqu'à son terme (Yéman, 20 octobre 2026), puis la formule s'arrête. */
    const jusquau = apres.courtJusquau ?? (apres.lune ? decaleLeJour(apres.lune.au, -1) : le);
    lignes.push(`Formule à la lune : pas d’avoir. La lune réglée court jusqu’à son terme, le ${dit(jusquau > le ? jusquau : le)} : ses séances incluses s’y réservent encore, puis la formule s’arrête, sans dette.`);
  }
  const annulees = (avant?.argent.echeances ?? []).filter((e) => e.resteXof > 0 && e.statut !== 'reglee').length;
  if (annulees > 0) lignes.push(`${annulees} échéance${annulees > 1 ? 's' : ''} non réglée${annulees > 1 ? 's' : ''} annulée${annulees > 1 ? 's' : ''}.`);
  const apresLaDate = apres.attribuees.filter((s) => s.date > le && s.etat !== 'annulee' && s.etat !== 'faite');
  if (apresLaDate.length > 0) {
    lignes.push(`${apresLaDate.length} séance${apresLaDate.length > 1 ? 's' : ''} posée${apresLaDate.length > 1 ? 's' : ''} après le ${dit(le)} : ${apresLaDate.length > 1 ? 'elles ne comptent plus' : 'elle ne compte plus'} sur la formule (à annuler ou à facturer au comptoir).`);
  }
  return {
    lignes,
    laClienteLit: `Résiliée le ${dit(le)}${apres.courtJusquau ? ` · sa lune court jusqu’au ${dit(apres.courtJusquau)}` : ''}${p && p.avoirXof > 0 ? `, avoir de ${francs(p.avoirXof)} dans Mon solde` : ''}${p && p.resteXof > 0 ? `, ${francs(p.resteXof)} à régler le ${dit(p.dueIso)}` : ''}.`,
  };
}

export function resilie(subId: string, le: string, motif: string, aujourdhui = jourDeCotonou()): void {
  subscribersStore.set((prev) => prev.map((s) => (s.id === subId
    ? {
      ...s,
      /* Le statut d'avant suit pour les écrans qui le lisent encore ; une date
         future attend son jour (le juge lit `resilieeLe`). */
      ...(le <= aujourdhui ? { status: 'churn' as const } : {}),
      resilieeLe: le,
      motifDeResiliation: motif.trim(),
    }
    : s)));
}

/* ── POSER L'ÉCHÉANCIER ───────────────────────────────────────────────── */

/* UN CONTRAT SANS ÉCHÉANCIER N'EST JAMAIS EN RETARD (Yéman, 20 octobre
   2026) : rien n'a été convenu, rien n'est échu. Le reste se dit « Échéancier
   à poser », et le comptoir le pose. Le juge le dit (`argent.echeancierAPoser`,
   `argent.aConvenirXof`) : on le lit, on ne le devine plus. */
export type EcheancierAPoser = { resteXof: number; regleXof: number; prixXof: number };
export function echeancierAPoser(c: ReleveDuContrat | undefined): EcheancierAPoser | null {
  if (!c) return null;
  if (!c.argent.echeancierAPoser) return null;
  const reste = c.argent.aConvenirXof ?? 0;
  return reste > 0 ? { resteXof: reste, regleXof: c.argent.regleXof, prixXof: c.argent.prixVenduXof } : null;
}

/** L'ÉCHÉANCIER À ÉCRIRE : ce qui est réglé reste une première tranche datée
    de la signature (déjà soldée), le reste se découpe en `parts` tranches à
    30 jours d'écart depuis `premiereIso`, chacune le lundi si elle tombe un
    dimanche. Le franc de plus va sur la première du reste. */
export function echeancierAEcrire(c: ReleveDuContrat, parts: 1 | 2 | 3, premiereIso: string): Echeance[] {
  const ap = echeancierAPoser(c);
  if (!ap || !premiereIso) return [];
  const tranches: { dueIso: string; amountXof: number }[] = [];
  if (ap.regleXof > 0) tranches.push({ dueIso: c.debutIso, amountXof: ap.regleXof });
  const decoupe = parts === 1
    ? [{ numero: 1, dueIso: premiereIso, amountXof: ap.resteXof }]
    : construitEcheancier(ap.resteXof, parts, premiereIso);
  for (const e of decoupe) tranches.push({ dueIso: jourOuvre(e.dueIso), amountXof: e.amountXof });
  return tranches.map((t, i) => ({ numero: i + 1, ...t }));
}

export function effetDePoserLEcheancier(c: ReleveDuContrat, parts: 1 | 2 | 3, premiereIso: string): Effet {
  const ap = echeancierAPoser(c);
  if (!ap) return { lignes: [], refus: 'Ce contrat a déjà son échéancier, ou ne doit rien.' };
  if (!premiereIso) return { lignes: [], refus: 'Choisissez la date de la première échéance.' };
  const ech = echeancierAEcrire(c, parts, premiereIso);
  const rang = (n: number) => (n === 1 ? '1re' : `${n}e`);
  return {
    lignes: [
      ...ech.map((e, i) => (i === 0 && ap.regleXof > 0
        ? `${rang(e.numero)} échéance, déjà réglée : ${francs(e.amountXof)}.`
        : `${rang(e.numero)} échéance le ${dit(e.dueIso)} : ${francs(e.amountXof)}.`)),
      'Une échéance qui tombe un dimanche passe au lundi. Un rappel WhatsApp part la veille de chacune.',
      'Rien n’est en retard avant la première date posée.',
    ],
    laClienteLit: `Votre échéancier : ${ech.filter((_, i) => !(i === 0 && ap.regleXof > 0)).map((e) => `${francs(e.amountXof)} le ${dit(e.dueIso)}`).join(', ')}.`,
  };
}

export function poseLEcheancier(subId: string, echeances: readonly Echeance[]): void {
  if (!echeances.length) return;
  subscribersStore.set((prev) => prev.map((s) => (s.id === subId ? { ...s, echeances: echeances.map((e) => ({ ...e })) } : s)));
}

/* ── PROLONGER ────────────────────────────────────────────────────────── */

export function effetDeLaProlongation(sub: Subscriber, releve: ReleveDuContrat | undefined, aIso: string): Effet {
  if (!aIso) return { lignes: [], refus: 'Choisissez la nouvelle date de fin.' };
  const fin = sub.expiresIso ?? null;
  if (fin && aIso <= fin) return { lignes: [], refus: `La nouvelle fin doit tomber après le ${dit(fin)}.` };
  const dispo = (releve?.seances ?? []).filter((l) => l.disponibles !== null).map((l) => l.disponibles as number);
  return {
    lignes: [
      `Fin : ${dit(fin)} → ${dit(aIso)}${fin ? ` (${joursEntre(fin, aIso)} jours de plus)` : ''}.`,
      dispo.length ? `Séances disponibles inchangées : ${Math.min(...dispo)}.` : 'Rien d’autre ne bouge.',
      'Le motif reste au Trône, avec la date et qui l’a posé.',
    ],
    laClienteLit: `Valable jusqu’au ${dit(aIso)}.`,
  };
}

export function prolonge(subId: string, aIso: string, motif: string, par?: string, aujourdhui = jourDeCotonou()): void {
  subscribersStore.set((prev) => prev.map((s) => (s.id === subId
    ? {
      ...s,
      expiresIso: aIso,
      prolongations: [...(s.prolongations ?? []), { le: aujourdhui, deIso: s.expiresIso ?? null, aIso, motif: motif.trim(), ...(par ? { par } : {}) }],
    }
    : s)));
}

/* ── SUSPENDRE ────────────────────────────────────────────────────────── */

/** SUSPENDRE : la formule est « En pause jusqu'au … » à la demande de la
    Maison ou de la cliente ; la fin (ou la prochaine lune) recule d'autant. */
export function effetDeLaSuspension(sub: Subscriber, plan: Plan | undefined, du: string, au: string): Effet {
  if (!du || !au) return { lignes: [], refus: 'Choisissez le début et la fin de la pause.' };
  if (au < du) return { lignes: [], refus: 'La reprise doit tomber après le début de la pause.' };
  const n = joursEntre(du, au) + 1;
  const paquet = plan?.mode === 'pack';
  const lignes = [`En pause du ${dit(du)} au ${dit(au)} (${n} jour${n > 1 ? 's' : ''}) : aucune séance incluse ne se réserve pendant ce temps.`];
  if (paquet && sub.expiresIso) lignes.push(`Fin reculée : ${dit(sub.expiresIso)} → ${dit(decaleLeJour(sub.expiresIso, n))}.`);
  if (!paquet && sub.nextIso) lignes.push(`Prochaine lune reculée : ${dit(sub.nextIso)} → ${dit(decaleLeJour(sub.nextIso, n))}, sans dette.`);
  return {
    lignes,
    laClienteLit: `En pause jusqu’au ${dit(au)}, à la demande de la Maison ou la vôtre${paquet && sub.expiresIso ? ` ; fin reculée au ${dit(decaleLeJour(sub.expiresIso, n))}` : ''}.`,
  };
}

export function suspend(subId: string, du: string, au: string, motif: string, plan: Plan | undefined): void {
  const n = joursEntre(du, au) + 1;
  subscribersStore.set((prev) => prev.map((s) => (s.id === subId
    ? {
      ...s,
      suspendue: { du, au, ...(motif.trim() ? { motif: motif.trim() } : {}) },
      ...(plan?.mode === 'pack' && s.expiresIso ? { expiresIso: decaleLeJour(s.expiresIso, n) } : {}),
      ...(plan?.mode !== 'pack' && s.nextIso ? { nextIso: decaleLeJour(s.nextIso, n) } : {}),
    }
    : s)));
}

/* ── REVOIR LE PRIX APRÈS LE COMPTAGE ─────────────────────────────────── */

export function effetDuPrixRevu(
  sub: Subscriber, plan: Plan | undefined, ctx: ContexteDuJuge, nouveauXof: number,
): Effet & { ok: boolean } {
  if (!(nouveauXof > 0)) return { ok: false, lignes: [], refus: 'Saisissez le prix du calibre compté.' };
  const r = revoitLePrixConvenu(sub, plan, nouveauXof, ctx);
  if (!r.ok) return { ok: false, lignes: [], refus: r.refus };
  const lignes = [`Prix : ${francs(r.ancienXof)} → ${francs(r.nouveauXof)} (écart ${r.ecartXof > 0 ? '+' : ''}${francs(r.ecartXof)}).`];
  if (r.ecartXof === 0) lignes.push('Le prix ne bouge pas.');
  if (r.nouvelle) lignes.push(`Il ne restait aucune échéance : une échéance neuve de ${francs(r.nouvelle.amountXof)} le ${dit(r.nouvelle.dueIso)}, avec son rappel la veille.`);
  else if (r.porteeSur !== undefined && r.echeances) {
    const e = r.echeances.find((x) => x.numero === r.porteeSur);
    if (e) lignes.push(`L’écart va sur l’échéance du ${dit(jourOuvre(e.dueIso))} : elle passe à ${francs(e.amountXof)}.`);
  }
  if (!r.echeances) lignes.push('Formule à la lune : le nouveau prix vaut dès la lune suivante.');
  if (r.avoirXof > 0) lignes.push(`En sa faveur au-delà de la prochaine échéance : avoir de ${francs(r.avoirXof)}.`);
  lignes.push('Ma Couronne l’annonce à l’accueil quatorze jours ; le WhatsApp « prix revu » part avec le lot des messages.');
  return {
    ok: true, lignes,
    laClienteLit: `Votre calibre a été compté le ${dit(ctx.jour ?? jourDeCotonou())} : votre prix passe de ${francs(r.ancienXof)} à ${francs(r.nouveauXof)}.`,
  };
}

export function revoitLePrix(
  sub: Subscriber, plan: Plan | undefined, ctx: ContexteDuJuge, nouveauXof: number, calibre?: string,
): boolean {
  const r = revoitLePrixConvenu(sub, plan, nouveauXof, ctx);
  if (!r.ok) return false;
  const jour = ctx.jour ?? jourDeCotonou();
  subscribersStore.set((prev) => prev.map((s) => (s.id === sub.id
    ? {
      ...s,
      prixConvenuXof: r.nouveauXof,
      ...(r.echeances ? { echeances: r.echeances } : {}),
      ...(calibre ? { calibreVendu: calibre } : {}),
      prixRevu: { le: jour, ancienXof: r.ancienXof, nouveauXof: r.nouveauXof, ...(calibre ? { calibre } : {}) },
    }
    : s)));
  return true;
}

/* ── VERSER : LE SEUL CHEMIN DE L'ARGENT D'UN CONTRAT ─────────────────── */

/** Ce que le comptoir tend au serveur (`verse_sur_l_abonnement`, 0138). Le
    serveur crée la pièce au premier versement et avance lui-même la lune
    d'une Chaque Lune : le Trône ne calcule ni `nextIso` ni la pièce. */
export type VersementDuComptoir = {
  id: string;
  montantXof: number;
  date?: string;
  moyen?: string;
  cashbox?: string;
  encaissePar?: string;
  note?: string;
  source?: 'comptoir' | 'en-ligne' | 'lien' | 'mnd-pay';
};

export type IssueDuVersement =
  | { ok: true; pieceId?: string; deja?: boolean; enAttente?: boolean }
  | { ok: false; erreur: string };

const RAISONS: Record<string, string> = {
  reserve_au_personnel: 'Ce geste est réservé au personnel connecté.',
  versement_sans_identifiant: 'Le versement n’a pas d’identifiant : rien n’a été écrit.',
  montant_invalide: 'Le montant n’est pas valable.',
  montant_hors_plafond: 'Le montant dépasse ce que le contrat peut recevoir.',
  contrat_introuvable: 'Le serveur ne trouve pas ce contrat : la fiche n’est peut-être pas encore partie.',
};

/* ══ HORS LIGNE, LE VERSEMENT ATTEND, IL NE S'ÉCRIT JAMAIS SUR L'APPAREIL ══
   L'argent est dans la main : refuser obligerait à le noter ailleurs, et
   c'est ainsi qu'il se perd. Le versement se GARDE sur l'appareil, tel quel,
   et part au retour du réseau, le plus ancien d'abord. Le serveur est
   idempotent par identifiant : rejoué, il ne verse jamais deux fois. Le
   contrat, lui, n'est pas touché ici : il ne se réécrit que par le serveur. */
type VersementEnAttente = { subId: string; versement: VersementDuComptoir; at: string };
const CLE_ATTENTE = 'trone::versements-en-attente';
const CLE_REFUS = 'trone::versements-refuses';
const lisLaFile = (): VersementEnAttente[] => {
  try { return JSON.parse(localStorage.getItem(CLE_ATTENTE) || '[]') as VersementEnAttente[]; } catch { return []; }
};
const ecrisLaFile = (l: readonly VersementEnAttente[]): boolean => {
  try { if (l.length) localStorage.setItem(CLE_ATTENTE, JSON.stringify(l)); else localStorage.removeItem(CLE_ATTENTE); return true; } catch { return false; }
};
/** Les versements gardés sur cet appareil, en attente du réseau. */
export const versementsEnAttente = (): VersementEnAttente[] => lisLaFile();
/** GARDER UN VERSEMENT : une fois par identifiant, jamais deux. */
export function gardeUnVersement(subId: string, versement: VersementDuComptoir, at = new Date().toISOString()): boolean {
  const file = lisLaFile();
  if (file.some((x) => x.versement.id === versement.id)) return true;
  return ecrisLaFile([...file, { subId, versement, at }]);
}

const appelle = async (subId: string, versement: VersementDuComptoir): Promise<IssueDuVersement | 'coupure'> => {
  if (!supabase) return { ok: false, erreur: 'Pas de connexion à la Maison : le versement d’une formule passe par le serveur.' };
  try {
    const { data, error } = await supabase.rpc('verse_sur_l_abonnement', { p_sub_id: subId, p_versement: versement });
    if (error) {
      if (estHorsLigne(error)) return 'coupure';
      const absent = /could not find the function|PGRST202|does not exist/i.test(error.message ?? '');
      return {
        ok: false,
        erreur: absent
          ? 'La fonction du serveur n’est pas encore posée (migration 0138) : le versement attend sa pose.'
          : `Le serveur a refusé : ${error.message}`,
      };
    }
    const r = (data ?? {}) as { ok?: boolean; pieceId?: string; dejaVerse?: boolean; raison?: string; erreur?: string };
    if (r.ok === false) return { ok: false, erreur: (r.raison && RAISONS[r.raison]) || r.erreur || r.raison || 'Le serveur a refusé ce versement.' };
    return { ok: true, ...(r.pieceId ? { pieceId: r.pieceId } : {}), ...(r.dejaVerse ? { deja: true } : {}) };
  } catch (err) {
    if (estHorsLigne(err)) return 'coupure';
    return { ok: false, erreur: String((err as { message?: string })?.message ?? err) };
  }
};

/** VERSER SUR L'ABONNEMENT. Le serveur écrit le contrat et sa pièce sous le
    même identifiant ; rejoué, il ne verse pas deux fois. Hors ligne, le
    versement se garde et part au retour du réseau (`enAttente`). */
export async function verseSurLAbonnement(subId: string, versement: VersementDuComptoir): Promise<IssueDuVersement> {
  if (!supabase) return { ok: false, erreur: 'Pas de connexion à la Maison : le versement d’une formule passe par le serveur.' };
  const garde = (): IssueDuVersement => (gardeUnVersement(subId, versement)
    ? { ok: true, enAttente: true }
    : { ok: false, erreur: 'Hors ligne, et cet appareil n’a pas pu garder le versement : notez-le, et encaissez-le au retour du réseau.' });
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return garde();
  const r = await appelle(subId, versement);
  return r === 'coupure' ? garde() : r;
}

/** LE DÉPART AU RETOUR DU RÉSEAU : un à un, le plus ancien d'abord. Une
    coupure arrête le tour ; un refus du serveur sort le versement de la file
    et le note, pour qu'on sache qu'il n'est pas parti. */
let videEnCours = false;
export async function videLesVersements(): Promise<number> {
  if (!supabase || videEnCours) return 0;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return 0;
  videEnCours = true;
  let partis = 0;
  try {
    for (;;) {
      const x = lisLaFile()[0];
      if (!x) break;
      const r = await appelle(x.subId, x.versement);
      if (r === 'coupure') break;
      ecrisLaFile(lisLaFile().filter((y) => y.versement.id !== x.versement.id));
      if (r.ok) partis += 1;
      else {
        try {
          const refus = JSON.parse(localStorage.getItem(CLE_REFUS) || '[]') as unknown[];
          localStorage.setItem(CLE_REFUS, JSON.stringify([{ ...x, refus: r.erreur, le: new Date().toISOString() }, ...refus].slice(0, 50)));
        } catch { /* l'appareil est plein : le refus se dit dans la console */ }
        console.warn('[versement en attente] refusé :', r.erreur);
      }
    }
  } finally {
    videEnCours = false;
  }
  return partis;
}

if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
  window.addEventListener('online', () => { void videLesVersements(); });
  /* À l'ouverture : ce qui attendait d'une séance d'avant repart. */
  const t = setTimeout(() => { void videLesVersements(); }, 5000) as unknown as { unref?: () => void };
  t.unref?.();
}

/** CE QUE LA FICHE DIT DE LA SÉANCE. Le rang ne se dit que pour une séance qui
    COMPTE : une annulée, une rendue, une séance posée après la résiliation ne
    prennent aucun crédit, et « séance 0 sur 6 » ne s'écrit jamais. */
export function ditLaSeance(
  c: ReleveDuContrat, s: SeanceDuContrat, a: Pick<Appointment, 'annuleeLe' | 'annuleePar'>,
): { titre: string; resteDit: string } {
  const ligne = c.seances.find((l) => s.serviceIds.includes(l.serviceId));
  const dispo = ligne?.disponibles;
  const rang = s.compte && s.rang && s.total ? `séance ${s.rang} sur ${s.total}` : '';
  let titre: string;
  if (s.pourquoiPas === 'apres-resiliation') {
    titre = `Hors formule : posée après la résiliation du ${jourDitAvecLAnnee(c.sub.resilieeLe ?? '')}`;
  } else if (s.etat === 'annulee') {
    titre = `Annulée${a.annuleePar === 'maison' ? ' par la Maison' : a.annuleeLe ? ' plus de 24 h avant' : ''} · la séance revient à la formule ${c.reference}`;
  } else if (s.etat === 'manquee') {
    titre = s.rendue || !rang
      ? `Manquée, rendue par la Maison · la séance revient à la formule ${c.reference}`
      : `Manquée · ${rang} comptée sur ${c.reference}`;
  } else {
    titre = rang ? `Incluse · ${rang} · formule ${c.reference}` : `Couverte par la formule ${c.reference}`;
  }
  const resteDit = dispo === null || dispo === undefined
    ? 'sans limite'
    : c.mode === 'pack' ? `reste ${dispo} sur ${ligne?.incluses}` : `reste ${dispo} cette lune`;
  return { titre, resteDit };
}

/* ── LES GESTES D'UNE SÉANCE ──────────────────────────────────────────── */

/** Ce qu'une séance fait à la ligne de sa formule, avant et après le geste. */
const ligneDe = (c: ReleveDuContrat | undefined, s: SeanceDuContrat | undefined) =>
  (c && s ? c.seances.find((l) => s.serviceIds.includes(l.serviceId)) : undefined);

export function effetDeMarquerFaite(c: ReleveDuContrat | undefined, s: SeanceDuContrat | undefined): Effet {
  const l = ligneDe(c, s);
  if (!s || !l) return { lignes: ['La séance se clôt honorée : 0 F, couverte par la formule.'] };
  return {
    lignes: [
      `${l.faites} faite${l.faites > 1 ? 's' : ''} → ${l.faites + 1} ; ${l.reservees} réservée${l.reservees > 1 ? 's' : ''} → ${Math.max(0, l.reservees - 1)}.`,
      'Rien à encaisser : la séance est couverte. Sa reprise se pose comme pour tout rituel honoré.',
    ],
    laClienteLit: 'Faite.',
  };
}

export function effetDeMarquerAbsente(c: ReleveDuContrat | undefined, s: SeanceDuContrat | undefined): Effet {
  const l = ligneDe(c, s);
  const rang = s?.rang && s.total ? `séance ${s.rang} sur ${s.total} ` : '';
  return {
    lignes: [
      `${rang ? `${rang[0].toUpperCase()}${rang.slice(1)}` : 'La séance '}comptée, marquée « Manquée »${l ? ` : réservées ${l.reservees} → ${Math.max(0, l.reservees - 1)}, manquées ${l.manquees} → ${l.manquees + 1}, disponibles ${l.disponibles ?? 'sans limite'} inchangées` : ''}.`,
      'Elle sort du calendrier ; aucun chiffre de fauteuil ne la compte.',
      'Pour un motif justifié, « Rendre la séance » la rend ensuite.',
    ],
    laClienteLit: 'Manquée · comptée.',
  };
}

export function effetDeRendre(c: ReleveDuContrat | undefined, s: SeanceDuContrat | undefined): Effet {
  const l = ligneDe(c, s);
  return {
    lignes: [
      `La séance revient à la formule${l && l.disponibles !== null ? ` : disponibles ${l.disponibles} → ${l.disponibles + 1}` : ''}.`,
      'Le motif reste au Trône ; la séance garde sa trace « Manquée, rendue ».',
    ],
    laClienteLit: 'Manquée, rendue par la Maison : la séance revient à votre formule.',
  };
}

/** À MOINS DE 24 H, une annulation de la cliente compte la séance. */
export function effetDeLAnnulation(a: Appointment, par: 'cliente' | 'maison', maintenant: Date = new Date()): Effet {
  const debut = Date.parse(`${a.date}T${(a.time || '00:00').padStart(5, '0')}:00+01:00`);
  const heures = (debut - maintenant.getTime()) / 3_600_000;
  if (par === 'maison') {
    return { lignes: ['Annulée par la Maison : la séance ne compte jamais, elle revient à la formule.'], laClienteLit: 'Annulée par la Maison.' };
  }
  return heures < 24
    ? { lignes: [`Annulée à moins de 24 h (${Math.max(0, Math.round(heures))} h avant) : la séance est COMPTÉE, marquée « Manquée ».`, 'Pour un motif justifié, « Rendre la séance » la rend ensuite.'], laClienteLit: 'Manquée · comptée.' }
    : { lignes: [`Annulée plus de 24 h avant : la séance revient à la formule.`], laClienteLit: 'Annulée, la séance revient à votre formule.' };
}

const metsAJour = (id: string, f: (a: Appointment) => Appointment): void =>
  appointmentsStore.set((prev) => prev.map((a) => (a.id === id ? f(a) : a)));

/** ABSENTE : la séance sort du calendrier et compte, « Manquée ». */
export function marqueAbsente(apptId: string, par?: string, aujourdhui = jourDeCotonou()): void {
  metsAJour(apptId, (a) => ({ ...a, status: 'annulé', absente: { le: aujourdhui, ...(par ? { par } : {}) } }));
}

/** RENDRE LA SÉANCE : une manquée que la Maison redonne, avec son motif. */
export function rendLaSeance(apptId: string, motif: string, par?: string, aujourdhui = jourDeCotonou()): void {
  metsAJour(apptId, (a) => ({ ...a, rendue: { le: aujourdhui, motif: motif.trim(), ...(par ? { par } : {}) } }));
}

/** ANNULER, EN DISANT QUI : l'instant est écrit, le juge décide si elle compte. */
export function annuleLaSeance(apptId: string, par: 'cliente' | 'maison', maintenant: Date = new Date()): void {
  metsAJour(apptId, (a) => ({ ...a, status: 'annulé', annuleeLe: maintenant.toISOString(), annuleePar: par }));
}
