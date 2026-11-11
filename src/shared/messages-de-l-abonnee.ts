import { supabase } from './supabase';
import { numeroWa } from './conversations';
import { REGLES_PAR_DEFAUT, facteurVivant } from './salle-des-envois';
import { appointmentsStore, type Appointment } from './agenda';
import { clientsStore, joursDeLaTete } from './clients';
import { plansStore, prixVenduXof, subscribersStore, type Subscriber } from './abonnements';
import { invoicesStore } from './finance';
import { servicesStore } from './catalog';
import { branchesStore } from './branches';
import { blocagesStore } from './blocages';
import { openingForIso } from './settings';
import { etatDuModele, modelesMetaStore, registreLu } from './modeles-meta';
import { appelDe, prenomDUsage } from './civilite';
import { contratDeLaSeance, inclusALaDate, peutPorter, releveDeLAbonnee } from './abonnee-pur';
import { cadenceObservee } from './cadence-pur';
import { jourFavoriDe } from './cadence';
import { dureeDesPrestations, plagesBloquees } from './agenda-pur';
import { jourDeCotonou } from './ia-faits-pur';
import { telDuRdv } from './numero-a-prevenir-pur';
import { heureHabituelle, placesDuJour, type Occupant } from '../apps/trone/routes/clients/rdv-fluide-pur';
import {
  MODELE_PROCHAINE_SEANCE, idDeLaProchaineSeance, jourPlus, ligneDeLaProchaineSeance, placeProposee, pourquoiPasDeProchaineSeance,
  rythmeDeLaProchaine, type RaisonDuSilence,
} from './messages-de-l-abonnee-pur';

/* ══ LA PROCHAINE SÉANCE, DÉPOSÉE EN SALLE PAR LE TRÔNE — 8 novembre 2026 ══
   Lot 4 de l'abonnement refait (maquette `public/maquette-l-abonnement-
   refait.html`, « Après la séance » : « Merci, Awa. Votre prochaine séance :
   samedi 23 janvier 2027 à 9 h ? », « Son jour et son heure d'habitude,
   jamais avant l'ouverture »). « Un message qui vient ce jour-là parce
   qu'ils nous font confiance » (Yéman).

   QUAND : à l'instant où le Trône marque une séance de formule honorée
   (`honorAppointment`, clients/actions.tsx), par tous ses chemins : le
   comptoir, la Caisse, « Marquer faite », la fin déclarée par la cliente, la
   main de Grenat. La règle (`pourquoiPasDeProchaineSeance`, `placeProposee`)
   vit dans messages-de-l-abonnee-pur.ts ; ce fichier la branche sur les
   magasins et dépose. COMME LE MERCI À LA MARRAINE (merci-en-salle.ts) : une
   ligne INSÉRÉE dans `envois`, statut « en-attente », dix minutes de salle,
   jamais la nuit ; la clé primaire `prochaine-seance-<rdvId>` ne se prend
   qu'une fois (`deja`), quel que soit le poste ou le nombre de fois où la
   séance est ré-honorée. Jamais un envoi direct : sans facteur vivant, rien
   ne part et le journal du navigateur le dit (il n'y a pas d'« avant » à ce
   message).

   LE MODÈLE DOIT ÊTRE APPROUVÉ : `prochaine_seance` noté « approuvé » par la
   direction dans le registre des modèles (modeles-meta.ts ; Conversations ›
   Perle › « Ce que ça rapporte » › Ses modèles chez Meta › Les autres
   modèles de la Maison). Un modèle jamais noté est « à déposer » : rien ne
   part, sans bruit. Le Trône ne lit aucun secret de fonction.

   UNE SÉANCE DU JOUR OU DE LA VEILLE SEULEMENT (`seance-ancienne`) : un
   honneur de rattrapage ne fait rien partir. Et au départ, le facteur relit
   (envois-partent, ⟨deja-un-suivant⟩) : la suite posée pendant les dix
   minutes de salle, ou une séance qui n'est plus marquée faite, et la ligne
   ne part pas.

   LA PLACE : ses jours (la fiche, sinon ses venues, sinon le jour de la
   séance), son heure (ses venues, sinon celle de la séance), le rythme de sa
   fiche ou de ses venues, les places libres aux fauteuils de la branche pour
   la durée de la prestation incluse, les murs de son maître, l'ouverture du
   jour (jours fermés et exceptions), et le juge de l'abonnée `peutPorter`
   (vie du contrat, lune réglée, crédit libre). Une Chaque Lune dont la lune
   suivante n'est pas encore réglée n'a donc pas de date à proposer : rien ne
   part, elle réserve quand sa lune est réglée. */

export type IssueDuDepot = 'depose' | 'deja' | 'repli' | 'facteur-muet' | RaisonDuSilence;

/** Le modèle `prochaine_seance` est-il noté approuvé chez Meta ? */
export const modeleProchaineSeanceApprouve = (): boolean =>
  etatDuModele(registreLu(modelesMetaStore.get()), MODELE_PROCHAINE_SEANCE) === 'approuve';

/** LE DÉPÔT. Rend ce qui s'est passé, pour le journal du navigateur et le banc ; ne lève jamais. */
export async function deposeLaProchaineSeance(apptId: string, o: { maintenantMs?: number } = {}): Promise<IssueDuDepot> {
  const sb = supabase;
  const maintenant = o.maintenantMs ?? Date.now();
  const appts = appointmentsStore.get();
  const seance = appts.find((a) => a.id === apptId);
  if (!seance || !seance.clientId) return 'pas-une-formule';
  const fiche = clientsStore.get().find((c) => c.id === seance.clientId);
  /* LE NUMÉRO, COMME LE RAPPEL DE LA VEILLE ET LA CONFIRMATION (`telDuRdv`) :
     le numéro à prévenir de la séance, sinon celui de sa fiche. Jamais un
     second numéro de la fiche : il peut être celui d'une autre personne.
     Une fiche d'essai reçoit donc à SON numéro, comme partout (essai-pur). */
  const numero = numeroWa(telDuRdv(seance, fiche));
  const jour = jourDeCotonou(new Date(maintenant));
  const silence = pourquoiPasDeProchaineSeance({
    seance, rdvs: appts, numero, stop: fiche?.nouvelles?.par === 'stop', modeleApprouve: modeleProchaineSeanceApprouve(), jour,
  });
  if (silence) return silence;
  if (!sb || !seance.branchId) return 'repli';

  /* LA FORMULE ET SA PRESTATION : le contrat que nomme la séance, lu par le
     juge unique du relevé ; la prestation incluse qu'elle portait. */
  const siens = subscribersStore.get().filter((s) => s.clientId === seance.clientId);
  const plans = plansStore.get();
  const sub = contratDeLaSeance(seance, siens, plans);
  if (!sub) return 'sans-contrat';
  const releve = releveDeLAbonnee({
    jour, clientId: seance.clientId, subs: siens, plans, appts: appts.filter((a) => a.clientId === seance.clientId), invoices: invoicesStore.get(),
    prixDuContrat: (s, p) => prixVenduXof(s as Subscriber, p, s.cycle ?? 'mensuel'),
  });
  const contrat = releve.contrats.find((c) => c.sub.id === sub.id);
  if (!contrat) return 'sans-contrat';
  const inclus = inclusALaDate(contrat.sub, contrat.plan, seance.date).map((i) => i.serviceId);
  const serviceId = seance.serviceIds.find((id) => inclus.includes(id));
  if (!serviceId) return 'sans-prestation';

  /* SES HABITUDES : ses venues honorées, hors celle-ci. */
  const venues = appts.filter((a) => a.clientId === seance.clientId && a.status === 'honoré');
  const jours = (() => {
    const notes = fiche ? joursDeLaTete(fiche) : [];
    if (notes.length > 0) return notes;
    const lu = jourFavoriDe(venues, seance.clientId, jour)?.jours;
    return lu && lu.length > 0 ? lu : [new Date(`${seance.date}T12:00:00Z`).getUTCDay()];
  })();
  const heure = heureHabituelle(venues.filter((a) => a.id !== seance.id)) ?? seance.time;
  const ligneIncluse = contrat.seances.find((l) => l.serviceId === serviceId);
  const rythmeJours = rythmeDeLaProchaine({
    rythmeSemaines: fiche?.rythmeSemaines ?? null,
    cadenceJours: cadenceObservee(appts, seance.clientId)?.jours ?? null,
    carnet: contrat.mode === 'pack' ? { validiteJours: contrat.plan?.validityDays ?? null, seances: ligneIncluse?.incluses ?? null } : null,
  });

  /* LES PLACES, comme la fenêtre du rendez-vous et la carte « Son prochain
     rituel » : les fauteuils de la branche, les murs de son maître, l'ouverture. */
  const branch = branchesStore.get().find((b) => b.id === seance.branchId);
  const sieges = Math.max(0, branch?.seats ?? 0);
  const murs = blocagesStore.get();
  const dureeMin = dureeDesPrestations([serviceId], servicesStore.get());
  const placesLibres = (iso: string): readonly string[] => {
    const occupes: Occupant[] = appts
      .filter((a) => a.branchId === seance.branchId && a.date === iso && a.status !== 'annulé')
      .map((a) => ({ maitre: a.master, debutMin: minutesDe(a.time), dureeMin: a.dureeMin && a.dureeMin > 0 ? a.dureeMin : dureeDesPrestations(a.serviceIds, servicesStore.get()) }));
    return placesDuJour({
      iso, aujourdhui: jour, maintenantMin: 0, ouverture: openingForIso(iso), durationMin: dureeMin, occupes,
      bloques: plagesBloquees(murs, seance.branchId as string, iso, seance.master ?? ''), sieges,
    }).heures;
  };
  const place = placeProposee({
    derniere: seance.date, rythmeJours, demain: jourPlus(jour, 1), jours, heure,
    estFerme: (iso) => openingForIso(iso).closed,
    peutPorter: (iso) => peutPorter(contrat, serviceId, iso),
    placesLibres,
  });
  if (!place) return 'aucune-date';

  /* LA SALLE : le facteur doit être vivant, c'est lui seul qui porte. */
  const { data: facteur } = await sb.from('documents').select('data').eq('key', 'mnd_facteur').maybeSingle();
  if (!facteurVivant((facteur?.data as { vuLe?: string } | null)?.vuLe, maintenant)) {
    console.warn('[mnd-prochaine-seance] le facteur se tait : rien n’est déposé pour', seance.id);
    return 'facteur-muet';
  }
  const ligne = ligneDeLaProchaineSeance({
    seance: { id: seance.id, branchId: seance.branchId, clientId: seance.clientId, date: seance.date },
    prenom: prenomDUsage(fiche, seance.clientName),
    appel: appelDe(fiche, seance.clientName),
    numero,
    proposition: { subId: contrat.sub.id, serviceId, date: place.date, time: place.time, clientId: seance.clientId },
    maintenantMs: maintenant,
    regles: REGLES_PAR_DEFAUT,
  });
  const { error } = await sb.from('envois').insert({ id: idDeLaProchaineSeance(seance.id), branch_id: seance.branchId, data: ligne });
  if (!error) return 'depose';
  return (error as { code?: string }).code === '23505' ? 'deja' : 'repli';
}

const minutesDe = (hhmm: string): number => { const [h, m] = String(hhmm ?? '').split(':').map(Number); return (h || 0) * 60 + (m || 0); };

/** Le geste du Trône au moment de l'honneur : seulement pour une séance de
    formule, sans jamais retarder le comptoir ni lever. */
export function proposeLaProchaineSeanceApresLHonneur(appt: Pick<Appointment, 'id' | 'coveredBySub' | 'coverKind'>): void {
  if (appt.coveredBySub !== true || appt.coverKind === 'forfait') return;
  void deposeLaProchaineSeance(appt.id).then(
    (issue) => { if (issue === 'repli') console.warn('[mnd-prochaine-seance] dépôt impossible pour', appt.id); },
    (e) => console.warn('[mnd-prochaine-seance]', String(e)),
  );
}
