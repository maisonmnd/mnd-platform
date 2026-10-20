import { useMemo } from 'react';
import {
  releveDeLAbonnee, jourDitAvecLAnnee,
  type ReleveDeLAbonnee, type ReleveDuContrat, type ResteHorsFormule, type ContratLu, type SeanceLue,
  type EtatSeance, type EtatFormule, type SeanceDuContrat,
} from '../../shared/abonnee-pur';
import { jourDeCotonou } from '../../shared/ia-faits-pur';
import { prixVenduXof, usePlans, useSubscribers } from '../../shared/abonnements';
import { apptDueXof, useAppointments, type Appointment } from '../../shared/agenda';
import { invoiceTotal, useInvoices, type Invoice } from '../../shared/finance';
import { supabase } from '../../shared/supabase';

/* ══ LE RELEVÉ DE LA TÊTE, LU PAR MA COURONNE — 20 octobre 2026 ═════════
   « Repenser entièrement l'expérience des clients abonnés » (Yéman). Maquette
   L0 validée le 20 octobre 2026 : « construis c'est bon comme ça ».

   UN SEUL JUGE, ET IL N'EST PAS ICI. Tous les écrans de l'abonnée (Accueil,
   Rendez-vous, Ma formule, Mon solde, Réserver, Acheter) lisent ce que rend
   `releveDeLAbonnee` (shared/abonnee-pur), le même relevé que le Trône. Aucun
   écran ne recompte : « il vous reste 4 sur 6 » était le plus petit reste
   d'une prestation posé sur le plus grand quota d'une autre, et c'est ce
   genre de recompte qui faisait dire deux chiffres à deux écrans.

   CE FICHIER NE FAIT QUE RASSEMBLER : les magasins (lus par pages par la
   synchronisation), le jour de Cotonou, le prix vendu relu au calibre, et ce
   qu'elle doit hors formule. */

/** Le jour à Cotonou : jamais celui de l'appareil, jamais `toISOString`. */
export const leJour = (): string => jourDeCotonou();

/** CE QU'ELLE DOIT HORS FORMULE : les rituels passés non couverts qui gardent
    un reste, et les factures hors abonnement non soldées. Le prix d'un rituel
    n'est lu que s'il a été figé (`priceXof`) : un rituel sans prix figé se
    règle au comptoir, et l'écran ne l'invente pas. */
export function restesHorsFormuleDe(
  teteId: string, appts: readonly Appointment[], invoices: readonly Invoice[], subs: readonly ContratLu[], jour: string,
): ResteHorsFormule[] {
  const out: ResteHorsFormule[] = [];
  const piecesDeContrat = new Set(subs.map((s) => s.invoiceId).filter((x): x is string => !!x));
  const rituels = new Set<string>();
  for (const a of appts) {
    if (a.clientId !== teteId || a.status === 'annulé' || a.coveredBySub || a.date > jour) continue;
    if (a.priceXof == null) continue;
    const net = Math.max(0, Math.round(a.priceXof * (1 - (a.discountPct ?? 0) / 100)) - (a.discountXof ?? 0));
    const reste = apptDueXof(a, net);
    if (reste <= 0) continue;
    rituels.add(a.id);
    out.push({ id: a.id, genre: 'rituel', date: a.date, resteXof: reste });
  }
  for (const i of invoices) {
    if (i.kind !== 'facture' || i.status === 'payée' || i.clientId !== teteId) continue;
    if (piecesDeContrat.has(i.id) || (i.apptId && rituels.has(i.apptId))) continue;
    const reste = invoiceTotal(i) - (i.payments ?? []).reduce((s, p) => s + (Number(p.amountXof) || 0), 0) - (i.avoirXof ?? 0);
    if (reste > 0) out.push({ id: i.id, genre: 'piece', date: i.date, resteXof: reste, libelle: i.lines[0]?.label });
  }
  return out;
}

/** LE RELEVÉ DE CETTE TÊTE (elle, ou l'enfant qu'elle porte). `null` tant
    qu'aucune tête n'est connue. */
export function useReleve(teteId: string | undefined): ReleveDeLAbonnee | null {
  const [subs] = useSubscribers();
  const [plans] = usePlans();
  const [appts] = useAppointments();
  const [invoices] = useInvoices();
  const jour = leJour();
  return useMemo(() => {
    if (!teteId) return null;
    const siens = subs.filter((s) => s.clientId === teteId) as ContratLu[];
    return releveDeLAbonnee({
      jour,
      clientId: teteId,
      subs: siens,
      plans,
      appts: appts as SeanceLue[],
      invoices,
      prixDuContrat: (sub, plan) => prixVenduXof(sub, plan, sub.cycle ?? 'mensuel'),
      restesHorsFormule: restesHorsFormuleDe(teteId, appts, invoices, siens, jour),
    });
  }, [teteId, subs, plans, appts, invoices, jour]);
}

/** LES RELEVÉS DE PLUSIEURS TÊTES À LA FOIS (elle et les enfants qu'elle
    porte) : la liste de ses rendez-vous mêle les têtes du foyer. */
export function useRelevesDe(ids: readonly string[]): Map<string, ReleveDeLAbonnee> {
  const [subs] = useSubscribers();
  const [plans] = usePlans();
  const [appts] = useAppointments();
  const [invoices] = useInvoices();
  const jour = leJour();
  const cle = ids.join('|');
  return useMemo(() => {
    const out = new Map<string, ReleveDeLAbonnee>();
    for (const id of cle ? cle.split('|') : []) {
      if (!id || out.has(id)) continue;
      const siens = subs.filter((s) => s.clientId === id) as ContratLu[];
      out.set(id, releveDeLAbonnee({
        jour, clientId: id, subs: siens, plans, appts: appts as SeanceLue[], invoices,
        prixDuContrat: (sub, plan) => prixVenduXof(sub, plan, sub.cycle ?? 'mensuel'),
        restesHorsFormule: restesHorsFormuleDe(id, appts, invoices, siens, jour),
      }));
    }
    return out;
  }, [cle, subs, plans, appts, invoices, jour]);
}

/* ── LES MOTS DU RELEVÉ, à l'écran (les mêmes que le Trône) ───────────── */

/** L'état d'une séance : un mot autant qu'une couleur. « À clôturer » ne se
    lit que côté Maison : chez elle, une séance passée restée confirmée se dit
    « Passée », jamais « Faite ». */
export const ETAT_SEANCE: Record<EtatSeance, { dit: string; cls: string }> = {
  'a-confirmer': { dit: 'À confirmer', cls: 'mc-stchip--wait' },
  confirmee: { dit: 'Confirmée', cls: 'mc-stchip--ok' },
  proposee: { dit: 'Proposée par la Maison', cls: 'mc-stchip--proposee' },
  faite: { dit: 'Faite', cls: 'mc-stchip--info' },
  annulee: { dit: 'Annulée', cls: '' },
  manquee: { dit: 'Manquée', cls: 'mc-stchip--off' },
  'a-cloturer': { dit: 'Passée', cls: '' },
};

/** L'état d'une formule. L'effacée n'a pas de pastille : elle se dit en clair. */
export const ETAT_FORMULE: Record<EtatFormule, { dit: string; cls: string }> = {
  retenue: { dit: 'Retenue, à régler', cls: 'mc-stchip--wait' },
  'en-cours': { dit: 'En cours', cls: 'mc-stchip--ok' },
  'en-pause': { dit: 'En pause', cls: 'mc-stchip--pause' },
  epuisee: { dit: 'Épuisée', cls: '' },
  terminee: { dit: 'Terminée', cls: '' },
  resiliee: { dit: 'Résiliée', cls: 'mc-stchip--off' },
  effacee: { dit: 'Retenue non réglée, effacée', cls: '' },
};

const MOIS_COURTS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
const JOURS_COURTS = ['Dim.', 'Lun.', 'Mar.', 'Mer.', 'Jeu.', 'Ven.', 'Sam.'];

/** « Lundi 2 novembre 2026 » : la date entière, l'année toujours. */
export const dateLongue = (iso: string): string => {
  const s = jourDitAvecLAnnee(iso);
  return s.charAt(0).toUpperCase() + s.slice(1);
};
/** « lundi 2 novembre 2026 », dans une phrase. */
export const dateDansLaPhrase = (iso: string): string => jourDitAvecLAnnee(iso);
/** « Mar. 3 nov. 2026 » : la date d'une carte, l'année toujours. */
export const dateCourte = (iso: string): string => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  const [a, m, j] = iso.split('-').map(Number);
  return `${JOURS_COURTS[new Date(`${iso}T12:00:00Z`).getUTCDay()]} ${j === 1 ? '1er' : j} ${MOIS_COURTS[m - 1]} ${a}`;
};
/** « 3 nov. 2026 », sans le jour de la semaine. */
export const dateSansJour = (iso: string): string => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  const [a, m, j] = iso.split('-').map(Number);
  return `${j === 1 ? '1er' : j} ${MOIS_COURTS[m - 1]} ${a}`;
};
/** « 10 h », « 13 h 30 ». */
export const heureDite = (hm: string): string => {
  const h = /^(\d{1,2}):(\d{2})$/.exec(hm ?? '');
  return h ? `${Number(h[1])} h${h[2] === '00' ? '' : ` ${h[2]}`}` : hm;
};
/** « 1re », « 2e » : le rang d'une échéance. */
export const rangDit = (n: number): string => (n === 1 ? '1re' : `${n}e`);
/** « 1 séance », « 3 séances ». */
export const pluriel = (n: number, un: string, plusieurs: string): string => `${n} ${n > 1 ? plusieurs : un}`;

/** La séance que ce rendez-vous est, dans le relevé : son contrat et son rang. */
export function seanceDuRelevé(releve: ReleveDeLAbonnee | null, apptId: string): { c: ReleveDuContrat; s: SeanceDuContrat } | null {
  if (!releve) return null;
  for (const c of [...releve.contrats, ...releve.anciens]) {
    const s = c.attribuees.find((x) => x.id === apptId);
    if (s) return { c, s };
  }
  return null;
}

/* ── LA MAISON RÉPOND : les gestes que le serveur tient ───────────────── */

export type ReponseDeLaMaison<T> =
  | { ok: true; data: T }
  | { ok: false; absente: boolean; raison?: string };

/** APPELER UNE FONCTION DU SERVEUR, ET DIRE VRAI SUR SON ABSENCE. Une
    fonction pas encore posée en base (`absente`) n'est pas un refus : l'écran
    le dit en clair au lieu de rester blanc. */
export async function appelleLaMaison<T extends { ok?: boolean; raison?: string; erreur?: string }>(
  nom: string, params: Record<string, unknown>,
): Promise<ReponseDeLaMaison<T>> {
  if (!supabase) return { ok: false, absente: true };
  try {
    const { data, error } = await supabase.rpc(nom, params);
    if (error) {
      const code = (error as { code?: string }).code ?? '';
      const message = String((error as { message?: string }).message ?? '');
      const absente = code === 'PGRST202' || code === '42883' || /could not find the function|does not exist/i.test(message);
      return { ok: false, absente, raison: absente ? undefined : message };
    }
    const r = (data ?? {}) as T;
    if (r.ok === false || r.erreur) return { ok: false, absente: false, raison: r.raison ?? r.erreur };
    return { ok: true, data: r };
  } catch {
    return { ok: false, absente: false };
  }
}
