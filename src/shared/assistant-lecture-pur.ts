/* ══ LA LECTURE DE L'ASSISTANT MAISON — 27 octobre 2026 ══════════════════
   Ce que l'Assistant lit autour de chaque cliente (fiches, RDV, Cadence,
   soucis, abonnées de Ma Couronne, envois de toutes les voix, pièces dues,
   foyers, cartes cadeaux, remises à son nom) et ce dont il a besoin autour
   d'elles (jours creux, deux places, plafond de la semaine).

   UNE LECTURE, DEUX PORTES. Le Trône l'appelle avec ses magasins
   (`gerard-donnees.ts`), la fonction serveur `assistant-maison` avec les
   lignes lues en base : le plan qu'elle dépose chaque matin est celui que
   la direction voit à l'écran, au même identifiant de ligne près. Pur :
   rien de la synchronisation, les murs de la Maison passent en argument
   (`ouverture`). `verifie-gerard` le prouve sur des fiches fabriquées. */
import type { Appointment } from './agenda';
import type { Client, Family } from './clients';
import type { Invoice } from './finance';
import type { Service } from './catalog';
import type { Signalement } from './entre-deux-pur';
import { apptPaidXof, dureeDuRendezVous, plagesBloquees, type FenetreDuJour, type MurPose } from './agenda-pur';
import { addDaysISO, predictNextVisitSelon, timeToMin } from './cadence-pur';
import { aDefaitSesLocks, estDePassage, estDiaspora, estMineur } from './clients-pur';
import { appelDe } from './civilite';
import { aAccepteLesNouvelles } from './audiences-pur';
import { souciOuvertDe } from './gerard-entre-deux-pur';
import { GESTES_EN_FRANCAIS, litLaMarqueWa } from './gestes-en-francais';
import { estUneVenue } from './previsions-pur';
import { rdvParJour, reperesDe, reperesParJour } from './objectifs-des-fauteuils-pur';
import { invoiceResteXof, invoiceTotal } from './finance-pur';
import { seRelance } from './relances-pur';
import { estEchue, etatDeLaCarte, type CarteCadeau } from './cartes-cadeaux-pur';
import { codesVivantsDe, fabriqueLeCode, type CodePromo } from './promos-pur';
import { deuxPlaces } from './processus-pur';
import { placesDuJour } from '../apps/trone/routes/clients/rdv-fluide-pur';
import { telDuRdv } from './numero-a-prevenir-pur';
import { attendUneReponse, derniersMessagesHorsService, dernieresRelancesDeFacture } from './dernier-message-pur';
import {
  GENRE_DIT, familleDuNom, joursCreux, plafondDeLaSemaine, reglagesLus, tracesDesEnvois,
  type ContexteDeGerard, type FamilleDeSoin, type FicheDeGerard, type Place, type Situation,
} from './gerard-pur';

const NOM_DE_LA_FAMILLE: Record<FamilleDeSoin, string> = {
  resserrage: 'resserrage des racines', couleur: 'couleur végétale', hydratation: 'soin hydratant',
  lavage: 'lavage rituel', coiffure: 'coiffure', autre: 'soin',
};

/** Le lundi de la semaine d'un jour. */
export const lundiDe = (j: string): string => { const d = new Date(`${j}T12:00:00Z`); const s = (d.getUTCDay() + 6) % 7; return addDaysISO(j, -s); };

/** Ce que la lecture reçoit : des lignes telles que les magasins (ou la base) les portent. */
export type EntreesDeLAssistant = {
  aujourdhui: string;
  maintenantMs: number;
  branche: { id: string; seats?: number };
  /** Les fiches et les RDV de la branche. */
  clients: readonly Client[];
  rdvs: readonly Appointment[];
  prestations: ReadonlyMap<string, Pick<Service, 'name' | 'durationMin' | 'dureeParLongueur'>>;
  signalements: readonly Signalement[];
  /** Les comptes abonnés aux notifications (fiche ou compte Ma Couronne). */
  abonnes: ReadonlySet<string>;
  envois: readonly unknown[];
  messages: readonly unknown[];
  pieces: readonly Invoice[];
  blocages: readonly MurPose[];
  familles: readonly Pick<Family, 'id' | 'payerClientId'>[];
  cartes: readonly CarteCadeau[];
  codes: readonly CodePromo[];
  /** Le document `mnd_gerard`, tel quel. */
  reglagesGerard: unknown;
  /** Les murs de la Maison un jour donné (semaine type et exceptions). */
  ouverture: (iso: string) => FenetreDuJour;
};

export type CerveauDeGerard = {
  fiches: FicheDeGerard[];
  ctx: ContexteDeGerard;
  nomDe: (id: string) => string;
  clientDe: (id: string) => Client | undefined;
  /** Le compte où elle reçoit ses notifications : sa fiche, ou son compte Ma Couronne. */
  compteDe: (id: string) => string;
  rdvAGarder: (clientId: string) => { id: string; date: string; time: string; numeroAPrevenir?: string } | undefined;
  /** LE NUMÉRO OÙ L'ÉCRIRE (27 octobre 2026) : « garder son RDV » part au
      parent qui a pris le rendez-vous (`telDuRdv`, comme la confirmation et
      le rappel de la veille) ; tout le reste, au premier numéro de la fiche. */
  telDe: (s: { clientId: string; genre: string }) => string;
  /** Le plafond de la semaine : remises faites, francs engagés, et ses deux bornes. */
  plafond: { faites: number; francs: number; restantes: number; remisesParSemaine: number; plafondFrancs: number };
};

/** LES FICHES QUE L'ASSISTANT LIT, et ce dont il a besoin autour d'elles. */
export function lisLAssistant(e: EntreesDeLAssistant): CerveauDeGerard {
  const today = e.aujourdhui;
  const { clients, rdvs: appts, prestations: byId, pieces, codes, abonnes } = e;
  const factures = new Set(pieces.filter((p) => p.apptId && p.kind === 'facture').map((p) => p.apptId as string));
  const parCliente = new Map<string, Appointment[]>();
  for (const a of appts) { const l = parCliente.get(a.clientId); if (l) l.push(a); else parCliente.set(a.clientId, [a]); }
  const nomDuService = (id: string) => byId.get(id)?.name ?? '';
  const ilYA60 = addDaysISO(today, -60);
  const traces = tracesDesEnvois(e.envois as Parameters<typeof tracesDesEnvois>[0]);
  const abonnee = (c: Client) => abonnes.has(c.id) || (!!c.authUserId && abonnes.has(c.authUserId));
  const maintenantIso = new Date(e.maintenantMs).toISOString();
  const rg = reglagesLus(e.reglagesGerard as Parameters<typeof reglagesLus>[0]);
  const estFerme = (iso: string) => e.ouverture(iso).closed;

  /* CE QUI LA FAIT TAIRE. */
  const resteDu = new Map<string, number>();
  for (const p of pieces) {
    if (!seRelance(p)) continue;
    const reste = invoiceResteXof(p);
    if (reste > 0) resteDu.set(p.clientId, (resteDu.get(p.clientId) ?? 0) + reste);
  }
  const envoisLus = e.envois as Parameters<typeof derniersMessagesHorsService>[0];
  const messagesLus = e.messages as NonNullable<Parameters<typeof derniersMessagesHorsService>[1]>;
  const dernierHorsService = derniersMessagesHorsService(envoisLus, messagesLus);
  const derniereRelance = dernieresRelancesDeFacture(envoisLus);
  const attend = attendUneReponse(messagesLus, e.maintenantMs);
  const payeurDe = new Map(e.familles.map((f) => [f.id, f.payerClientId]));
  const carteSurSaFiche = new Set(e.cartes
    .filter((k) => !!k.clientId && etatDeLaCarte(k, today) === 'sur-sa-fiche' && !estEchue(k, today))
    .map((k) => k.clientId as string));
  const signalementsDe = new Map<string, Signalement[]>();
  for (const s of e.signalements) { const l = signalementsDe.get(s.clientId); if (l) l.push(s); else signalementsDe.set(s.clientId, [s]); }

  const fiches: FicheDeGerard[] = clients.map((c) => {
    const siens = parCliente.get(c.id) ?? [];
    const rdvs = siens.map((a) => ({
      id: a.id, date: a.date, time: a.time, status: a.status, creeLe: a.creeLe,
      familles: (a.serviceIds ?? []).map((id) => familleDuNom(nomDuService(id))),
      venu: estUneVenue({ date: a.date, status: a.status, encaisse: apptPaidXof(a) > 0, facture: !!a.invoiceId || factures.has(a.id) }, today),
    }));
    const cad = siens.length ? predictNextVisitSelon(siens, c, c.id, today, estFerme) : null;
    /* Le nom de son soin habituel : celui de sa dernière venue, en français. */
    const derniere = siens.filter((a) => a.status === 'honoré').sort((x, y) => x.date.localeCompare(y.date)).pop();
    const premierNom = derniere ? nomDuService(derniere.serviceIds?.[0] ?? '') : '';
    const geste = GESTES_EN_FRANCAIS[litLaMarqueWa(premierNom).marque];
    const soinDit = geste ? geste.long.toLowerCase() : NOM_DE_LA_FAMILLE[familleDuNom(premierNom)];
    const sesSignalements = signalementsDe.get(c.id) ?? [];
    return {
      id: c.id,
      appel: appelDe(c),
      soinDit,
      birthday: c.birthday,
      birthdayGiftAt: c.birthdayGiftAt,
      accord: aAccepteLesNouvelles(c),
      stop: c.nouvelles?.par === 'stop' && c.nouvelles?.oui === false,
      couronne: abonnee(c),
      telephone: (c.phone ?? '').replace(/\D/g, '').length >= 8,
      ecartee: estDePassage(c) || estDiaspora(c) || aDefaitSesLocks(c) || !!c.archived,
      soucis: sesSignalements.filter((s) => (s.quand ?? '') >= ilYA60).flatMap((s) => s.soucis ?? []),
      souciOuvert: souciOuvertDe(sesSignalements),
      resteDu: resteDu.get(c.id) ?? 0,
      derniereRelanceLe: derniereRelance.get(c.id),
      dernierMessageHorsService: dernierHorsService.get(c.id),
      attendUneReponse: attend.has(c.id),
      /* Enfant d'un foyer : un autre paie pour elle, et rien ne dit qu'elle
         est majeure. Dans le doute, on n'écrit pas : le parent reçoit. */
      enfantDuFoyer: (() => {
        const payeur = c.familyId ? payeurDe.get(c.familyId) : undefined;
        return !!payeur && payeur !== c.id && !(c.birthday && !estMineur(c, today));
      })(),
      carteVivante: carteSurSaFiche.has(c.id),
      codesVivants: codesVivantsDe(codes, c.id, maintenantIso).length,
      jamais: rg.jamais[c.id] ?? [],
      rdvs,
      traces: traces.get(c.id) ?? [],
      /* La date ATTENDUE : pour une cliente en retard, la Cadence reporte
         sa date au cycle suivant ; l'Assistant lit la date manquée. */
      cadence: {
        iso: cad?.predicted ? (cad.overdueDays > 0 ? addDaysISO(today, -cad.overdueDays) : cad.iso) : null,
        rythmeJours: cad?.avgDays ?? (c.rythmeSemaines ? c.rythmeSemaines * 7 : null),
      },
    };
  });

  /* LE PLAFOND DE LA SEMAINE, TOUT COMPRIS : toutes les remises à son nom
     de la branche depuis lundi, et leurs francs (le ticket moyen des
     factures de 90 jours sert de base à un code encore vivant). */
  const lundi = lundiDe(today);
  const ilYA90 = addDaysISO(today, -90);
  const tickets = pieces.filter((p) => seRelance(p) && p.date >= ilYA90).map(invoiceTotal).filter((x) => x > 0);
  const ticketMoyenXof = tickets.length ? Math.round(tickets.reduce((a, b) => a + b, 0) / tickets.length) : 0;
  const plafond = plafondDeLaSemaine({
    codes: codes.filter((k) => k.branchId === e.branche.id), lundi, maintenantIso, ticketMoyenXof,
    remisesParSemaine: rg.remisesParSemaine, plafondFrancs: rg.plafondFrancs,
  });
  const remisesRestantes = plafond.restantes;

  /* Les jours creux : posés contre l'ordinaire de ce jour de la semaine. */
  const ouvertLe = (j: string) => !estFerme(j);
  const parJour = rdvParJour(appts.map((a) => ({ date: a.date, status: a.status })));
  const reperes = reperesParJour({ parJour, aujourdhui: today, ouvertLe });
  const creux = joursCreux({ aujourdhui: today, parJour, ordinaireDe: (j) => reperesDe(reperes, j).ordinaire, ouvertLe, remisesRestantes });

  /* Deux places pour elle : la durée et le maître de son dernier rituel. */
  const sieges = Math.max(0, e.branche.seats ?? 0);
  const occupesDu = (iso: string) => appts.filter((a) => a.date === iso && a.status !== 'annulé')
    .map((a) => ({ maitre: a.master, debutMin: timeToMin(a.time), dureeMin: dureeDuRendezVous(a, byId) }));
  const cache = new Map<string, Place[]>();
  const placesDe = (clientId: string, jour?: string): Place[] => {
    const dernier = (parCliente.get(clientId) ?? []).filter((a) => a.status === 'honoré').sort((x, y) => x.date.localeCompare(y.date)).pop();
    const duree = dernier ? Math.max(30, dureeDuRendezVous(dernier, byId)) : 120;
    const maitre = dernier?.master || 'Team';
    const cle = `${duree}|${maitre}|${jour ?? '7'}`;
    if (!cache.has(cle)) {
      const jours = jour ? [jour] : [1, 2, 3, 4, 5, 6, 7].map((k) => addDaysISO(today, k));
      cache.set(cle, deuxPlaces(jours.map((iso) => placesDuJour({
        iso, aujourdhui: today, maintenantMin: 0, ouverture: e.ouverture(iso), durationMin: duree,
        occupes: occupesDu(iso), bloques: plagesBloquees(e.blocages, e.branche.id, iso, maitre), sieges,
      }))));
    }
    return cache.get(cle)!;
  };

  const parId = new Map(clients.map((c) => [c.id, c]));
  const rdvAGarder = (clientId: string) => (parCliente.get(clientId) ?? [])
    .filter((a) => a.date === addDaysISO(today, 2) && a.status !== 'annulé' && a.status !== 'honoré')
    .map((a) => ({ id: a.id, date: a.date, time: a.time, numeroAPrevenir: a.numeroAPrevenir }))[0];
  return {
    fiches,
    ctx: { aujourdhui: today, creux, remisesRestantes, placesDe, eteintes: rg.eteintes },
    nomDe: (id: string) => parId.get(id)?.name ?? '',
    clientDe: (id: string) => parId.get(id),
    compteDe: (id: string) => { const c = parId.get(id); return c?.authUserId && abonnes.has(c.authUserId) ? c.authUserId : id; },
    rdvAGarder,
    telDe: (s: { clientId: string; genre: string }) => {
      const c = parId.get(s.clientId);
      const r = s.genre === 'garder' ? rdvAGarder(s.clientId) : undefined;
      return r ? telDuRdv(r, c) : (c?.phone ?? '').trim();
    },
    plafond: { ...plafond, remisesParSemaine: rg.remisesParSemaine, plafondFrancs: rg.plafondFrancs },
  };
}

/** Les heures d'un code jusqu'à la fin de son dernier jour (23 h 59 à Cotonou). */
export const heuresJusquA = (jour: string, maintenantMs: number): number =>
  Math.max(1, Math.ceil((Date.parse(`${jour}T23:59:00+01:00`) - maintenantMs) / 3_600_000));

/** LE CODE NOMINATIF d'une situation (jour creux, anniversaire), à son nom,
    signé « Assistant Maison ». Fabriqué au départ réel du message : par le
    toucher « Envoyer sur WhatsApp » au Trône, par la fonction serveur une
    fois la ligne partie. `deja` : les codes existants (aucun doublon). */
export function codeDeLaSituation(
  s: Pick<Situation, 'clientId' | 'genre' | 'code'>,
  o: { branchId: string; nom: string; maintenantMs: number },
  deja: readonly CodePromo[],
): CodePromo | undefined {
  if (!s.code) return undefined;
  return fabriqueLeCode({
    branchId: o.branchId, clientId: s.clientId, clientNom: o.nom, mot: s.code.mot, remisePct: s.code.pct,
    heures: heuresJusquA(s.code.jusquau, o.maintenantMs), parQui: 'Assistant Maison', note: GENRE_DIT[s.genre],
    maintenant: new Date(o.maintenantMs).toISOString(),
  }, deja);
}
