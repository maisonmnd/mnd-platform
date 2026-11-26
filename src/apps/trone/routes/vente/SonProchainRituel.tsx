/* ══ SON PROCHAIN RITUEL, LA CARTE PARTAGÉE · 4 novembre 2026 ══════════════
   « Dans le parcours du rendez-vous des clients, quand on finit d'encaisser
   le paiement, j'aimerais voir la date du prochain rendez-vous à l'écran,
   qu'il soit validé, et pouvoir le modifier au besoin. Que ce soit vraiment
   bien fait » (Yéman). Maquette `public/maquette-prochain-rituel-a-l-encaissement.html`
   (v2), tranchée au sélecteur le 4 novembre 2026 :

   · PROPOSÉ, VALIDÉ D'UN TOUCHER : la date en grand, l'heure, la durée, le
     maître, les gestes, la raison du rythme, la place relue, une pastille.
     Rien n'est posé avant « Valider ce rendez-vous » ou le toucher d'une
     autre place ; terminer sans valider fait demander dans le pied ;
   · son heure prise chez son maître : même maître, l'heure libre la plus
     proche le même jour, sinon le jour libre suivant ; l'écran le dit ;
   · « Changer la date ou l'heure » : trois places et « Une autre date » (une
     bande de jours ouverts, puis les heures libres du jour) ; « Changer les
     gestes » ouvre la fenêtre du rendez-vous ; « Pas de prochain
     rendez-vous » se confirme dans le pied, rien ne part ;
   · UNE SEULE CONFIRMATION, À LA FERMETURE : la carte pose sans confirmation,
     déplace le même rendez-vous, et ne lève `sansConfirmation` qu'à
     « Terminer » (ou si l'écran disparaît) ; l'aperçu « Ce qu'elle reçoit »
     montre le message ;
   · la même carte dans « C'est réglé » (la fenêtre d'encaissement), à la
     Caisse après le paiement, et quand on marque un rituel honoré sans
     l'encaisser (Carnet, tableau de bord) ;
   · aucune remise ni code recopié du jour : le prochain se chiffre au tarif
     de sa tête, à sa date. Seules décident ce jour-là la règle « Places
     limitées » et la remise famille de sa tête, rejugées à la date.

   Ce qui vit ailleurs, et n'est pas réécrit ici :
   · la règle de la carte (états, gestes, effets, ce qu'elle dit) :
     `shared/carte-du-prochain-rituel-pur.ts` ; ses écritures :
     `shared/carte-du-prochain-rituel.ts` ;
   · le rituel, le rythme et les places : `shared/prochain-rituel-pur.ts`,
     qui lit `sesRituelsPasses`, la Cadence et `propositionsDuRdv` ;
   · le prix et la durée : `tarifsDuRituel`, `brutDuRituel` et
     `personalDurationMin`, ceux de la fenêtre du rendez-vous ;
   · l'écriture : `poseUnRendezVous` (agenda.ts), le geste de la fenêtre ;
   · après une création VÈKPÈ, La Retouche comprise (`laSuiteImposeeDuRituel`).
   Ce que la fenêtre fait de plus (formule, prix à convenir, séances
   incluses, salon privatisé, paliers stricts) ne se refait pas : valider
   ouvre alors sa fiche, posée sur la place choisie.

   Cet écran parle à l'équipe : le nom du maître s'y lit. Ce qui part vers
   la cliente se montre dans « Ce qu'elle reçoit ». */
import { remiseEnFrancsArrondie } from '../../../../shared/arrondi-des-remises-pur';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Button, Modal, toast } from '../../../../ds/components';
import { maitreParDefaut, useBranch } from '../../../../shared/branches';
import { fmtMoney } from '../../../../shared/currency';
import { estArchivee, fondeLaCouronne, LONGUEURS, suitLongueur, useCategories, useProducts, useServices, type LongueurId } from '../../../../shared/catalog';
import { aUnPrixConvenu, estDePassage, estDiaspora, remiseFamillePct, useClients, useFamilies } from '../../../../shared/clients';
import { appointmentsStore, poseUnRendezVous, useAppointments, type Appointment } from '../../../../shared/agenda';
import { blocagesStore, plagesBloquees, useBlocages, type Blocage } from '../../../../shared/blocages';
import { depositForServices, depositPctFor, openingForIso, settingsStore } from '../../../../shared/settings';
import { personalDurationMin, prixFerme, unGesteDansLePanier, useBandSets, useModelBands } from '../../../../shared/pricing';
import { jourFavoriDe, predictNextVisit } from '../../../../shared/cadence';
import { SUCCESSEURS } from '../../../../shared/bascule-de-janvier-pur';
import { numeroAPrevenirDuRdv, numerosDeLaFiche } from '../../../../shared/numero-a-prevenir-pur';
import { avertissementDHabilitation, plusHautDes, type Palier } from '../../../../shared/paliers';
import { sameName } from '../../../../shared/text';
import { etatDuModeleMeta, modelesMetaLus } from '../../../../shared/modeles-meta-pur';
import { uid } from '../../../../shared/store';
import { jourCourtAn, jourEnLettres, momentDuSalon } from '../../../../shared/calendrier';
import { heureDuMessage, momentDuMessage } from '../../../../shared/salle-des-envois';
import { contratPourLaDate, usePlans, useStaff, useSubscribers } from '../equipe/data';
import { useOffers } from '../../../../shared/offers';
import { ceQueRetireLeMercredi, gesteSansRemise, poseLOffreDuJour } from '../../../../shared/offres-pur';
import { ditLaPlaceDuRdv, famPctDeLaTete, lOffreDuJourAuTrone } from '../clients/places-au-trone-pur';
import { regimeTarifaire } from '../../../../shared/pricing';
import { prochainDejaPose } from '../../../../shared/reprise-nue';
import { appelDe } from '../../../../shared/civilite';
import { DEVISE_COMPLETE } from '../../../../shared/identite';
import { TexteFon } from '../../../../ds/fon';
import { referenceDuRendezVous, texteDeLaConfirmation } from '../../../../shared/lien-du-rdv-pur';
import {
  addDaysISO, apptDurationMin, apptNetXof, brutDuRituel, fmtDureeCourte, RdvModal, tarifsDuRituel, timeToMin, useServicesById, type RdvInitial,
} from '../clients/_shared';
import { laSuiteImposeeDuRituel } from '../clients/actions';
import { heureHabituelle, placesDuJour, type Occupant } from '../clients/rdv-fluide-pur';
import {
  ceQuiDemandeSaFiche, dureeDite, laPlaceTient, leMaitreDuRituel, leRendezVousDuProchainRituel, leRituelDOffice,
  sesProchainsRituels, sesTroisPlaces, type PlaceDuProchainRituel,
} from '../../../../shared/prochain-rituel-pur';
import {
  carteNeuve, ceQueDitLaPlace, ceQueDitLeRendezVousDejaLa, ceQuiPartVersElle, gesteSurLaCarte, issueDeLaFermeture, laPlaceDOffice,
  laRaisonDeLaDate, lesHeuresDuJour, lesJoursDUneAutreDate, memePlace, pastilleDeLaCarte, sansDateDOffice,
  type EffetDeLaCarte, type EtatDeLaCarte, type GesteDeLaCarte, type PlaceDeLaCarte,
} from '../../../../shared/carte-du-prochain-rituel-pur';
import { leveLaConfirmation, marqueLaSuggestion, remplaceLeRendezVousDeLaCarte, retireLeRendezVousDeLaCarte } from '../../../../shared/carte-du-prochain-rituel';
import {
  dansNSemaines, estSuggere, estUnJourSansPlace, laPlaceDeLaPuce, laPlaceDuJourChoisi, marqueDeLaPose, SEMAINES_DE_LA_SUITE, semaineDuRythme, texteDeLaProposition,
  type JourSansPlace, type PlaceDeLaPuce, type QuiAChoisi,
} from '../../../../shared/rendez-vous-suggere-pur';
import { estEnAttente, etatDeLAttente } from '../../../../shared/rendez-vous-en-attente-pur';
import { laPlaceDuSouhait, leRituelVoulu, phraseDuSouhait, type Souhait } from '../../../../shared/agent-des-rendez-vous-pur';
import { supabase } from '../../../../shared/supabase';
import { nomEtEnClair } from '../../../../shared/en-clair-pur';
import { estSaPremiereVisite, PREMIERE_VISITE_DIT, PREMIERE_VISITE_TITRE } from '../../../../shared/la-deuxieme-visite-pur';
import './son-prochain-rituel.css';

const NOMS_DES_JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
/** « mardi 17 novembre 2026 » : la date se dit avec son année. */
const jourDit = (iso: string) => jourEnLettres(iso).replace(/^./, (c) => c.toLowerCase());
/** « sam. 5 déc. 2026 à 10 h » */
const placeCourte = (p: PlaceDeLaCarte) => `${jourCourtAn(p.iso).replace(/^./, (c) => c.toLowerCase())} à ${heureDuMessage(p.heure)}`;
/** « 20 octobre 2026 » */
const dateSansJour = (iso: string) => {
  try { return new Date(`${iso}T12:00:00`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }); } catch { return iso; }
};
const morceauDuJour = (iso: string, forme: Intl.DateTimeFormatOptions) => {
  try { return new Date(`${iso}T12:00:00`).toLocaleDateString('fr-FR', forme); } catch { return ''; }
};
const memesGestes = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((x, i) => x === b[i]);

/** Ce que l'hôte reçoit pour poser la carte : la carte, le pied, et
    « Terminer », qui passe toujours par la carte. */
export type VueDeLaCarte = {
  carte: ReactNode;
  pied: ReactNode;
  terminer: () => void;
  /** Le bouton qui ferme est-il le bouton plein (validé, rien à poser, retiré) ? */
  plein: boolean;
  /* ── LA SECONDE ÉTAPE DE « C'EST RÉGLÉ » (15 novembre 2026) ── */
  /** « Poser la suggestion » : pose la place montrée et ferme (ou ferme, si c'est déjà posé). */
  poser: () => void;
  /** « Pas de prochain rendez-vous » : ferme sans rien poser, ou demande le retrait de ce qui est posé. */
  sansSuite: () => void;
  /** Le pied pose une question (terminer sans valider, retirer) : l'hôte la montre seule. */
  question: boolean;
  /** Ce que dit le bouton plein de la seconde étape. */
  libelleDuGeste: string;
  /** Un rendez-vous à venir existait déjà : rien de neuf ne se pose. */
  dejaLa: boolean;
  /** Sa date déjà posée, dite (« samedi 26 décembre 2026 à 13 h 30 »), quand elle l'est. */
  dejaLaDit: string | null;
  /* ── L'AGENT DES RENDEZ-VOUS (18 novembre 2026) ── */
  /** « Valider ce rendez-vous » : pose la place montrée, SANS fermer ; la
      confirmation part à « Terminer », comme toujours. */
  valider: () => void;
  /** Une place est montrée, rien n'est encore posé, et elle se pose ici
      (rien qui demande sa fiche) : l'agent peut la valider seul. */
  aPoser: boolean;
  /** LA DEUXIÈME VISITE (26 novembre 2026, l'audit, point B2) : ce rituel est sa première visite. */
  premiereVisite: boolean;
};

/** LE MODÈLE DE LA PROPOSITION EST-IL APPROUVÉ CHEZ META ? (15 novembre 2026)
    La dernière lecture que le Trône garde (`mnd_modeles_meta`, écrite par
    « Les modèles chez Meta »). `null` : on ne sait pas (hors ligne, jamais lu).
    Ses deux formes ensemble (18 novembre 2026) : la liste relue chez Meta, et
    les notes de « Ses modèles chez Meta » (`modelesMetaLus`) ; une note seule
    ne fait plus croire le modèle inconnu. */
function useModeleApprouve(nom: string): boolean | null {
  const [etat, setEtat] = useState<boolean | null>(null);
  useEffect(() => {
    const sb = supabase;
    if (!sb) return undefined;
    let vivant = true;
    void (async () => {
      try {
        const { data } = await sb.from('documents').select('data').eq('key', 'mnd_modeles_meta').maybeSingle();
        const lu = modelesMetaLus(data?.data);
        if (!vivant || (lu.liste.length === 0 && Object.keys(lu.notes).length === 0)) return;
        setEtat(etatDuModeleMeta(lu, nom) === 'approuve');
      } catch { /* hors ligne : on ne sait pas, la fenêtre n'en dit rien */ }
    })();
    return () => { vivant = false; };
  }, [nom]);
  return etat;
}

export function SonProchainRituel({ clientId, serviceIds, jour, longueur, rituelId, onALaMain, onFerme, souhait, children }: {
  clientId: string;
  /** Les prestations qu'elle vient de régler, ou du rituel honoré. */
  serviceIds: readonly string[];
  /** Le jour de la vente, ou du rituel (AAAA-MM-JJ). */
  jour: string;
  /** La longueur travaillée ce jour : celle du ticket ou du rendez-vous. */
  longueur: LongueurId;
  /** Le rendez-vous que ce règlement solde ou que l'on vient d'honorer :
      « un rituel, un seul prochain » (`prochainDejaPose`), et sa suite
      imposée après une création. */
  rituelId?: string;
  /** Ouvre la fenêtre du rendez-vous de l'hôte, posée sur ce qu'on lui passe
      (la Caisse). Sans elle, la carte ouvre la sienne. */
  onALaMain?: (initial: RdvInitial) => void;
  /** La carte a terminé : l'hôte ferme son écran. */
  onFerme?: () => void;
  /** L'AGENT DES RENDEZ-VOUS (18 novembre 2026) : ce que la phrase a
      demandé. Le rituel qui porte ces gestes (sinon ces gestes eux-mêmes),
      la première place de la fenêtre, TOUJOURS SUR TEAM (« c'est toujours
      Team », Yéman), et « elle l'a choisi avec nous ». Le reste de la carte
      (prix, acompte, offre du jour, un seul prochain, la confirmation à
      « Terminer ») ne change pas. */
  souhait?: Souhait & { gestes: readonly string[] };
  children?: (v: VueDeLaCarte) => ReactNode;
}) {
  const { branch, currency } = useBranch();
  const [clients] = useClients();
  const [families] = useFamilies();
  const [tous] = useAppointments();
  const [services] = useServices();
  const [cats] = useCategories();
  const [produits] = useProducts();
  const [bands] = useModelBands();
  const [sets] = useBandSets();
  const [blocages] = useBlocages();
  const [subs] = useSubscribers();
  const [plans] = usePlans();
  const [equipe] = useStaff();
  const [offres] = useOffers();
  const byId = useServicesById();
  /* Le jour du salon, pas celui du poste (20 novembre 2026, `momentDuSalon`). */
  const aujourdhui = momentDuSalon().jour;
  const demain = addDaysISO(aujourdhui, 1);
  const fiche = clients.find((c) => c.id === clientId);

  /* APRÈS UNE CRÉATION VÈKPÈ, LA RETOUCHE COMPRISE (10 octobre 2026) : lue
     une fois, sur le rituel tel qu'il était à l'ouverture de la carte. */
  const [imposee] = useState(() => {
    const r = rituelId ? appointmentsStore.get().find((a) => a.id === rituelId) : undefined;
    return r ? laSuiteImposeeDuRituel(r) : null;
  });

  const siens = useMemo(() => tous.filter((a) => a.clientId === clientId), [tous, clientId]);
  /* Ses venues honorées : celles que lisent son heure et son jour habituels
     dans la fenêtre du rendez-vous (`sesVenues`). */
  const sesVenues = useMemo(() => siens.filter((a) => a.status === 'honoré'), [siens]);
  /* LA DEUXIÈME VISITE SE JOUE AU FAUTEUIL (26 novembre 2026, l'audit, point B2) : sa première visite se dit en tête. */
  const premiereVisite = useMemo(() => estSaPremiereVisite({ rdvs: siens, jour, rituelId }), [siens, jour, rituelId]);
  /* SA CADENCE GÉNÉRALE, CELLE QUE LIT PERLE (assistant-lecture-pur.ts :
     `rythmeJours`) : l'intervalle de `predictNextVisit` sur ses venues
     honorées (un rendez-vous déjà pris ne l'efface pas), sinon le rythme de
     sa fiche. */
  const cadenceJours = useMemo(() => {
    const c = predictNextVisit(sesVenues, clients, clientId, aujourdhui);
    return c.avgDays ?? (fiche?.rythmeSemaines ? fiche.rythmeSemaines * 7 : null);
  }, [sesVenues, clients, clientId, aujourdhui, fiche?.rythmeSemaines]);

  const rituels = useMemo(() => (imposee ? [] : sesProchainsRituels({
    rdvs: siens,
    clientId,
    aujourdhui,
    proposable: (id) => { const sv = byId.get(id); return !!sv && !estArchivee(sv); },
    successeur: (id) => SUCCESSEURS[id],
    estCreation: (id) => { const sv = byId.get(id); return !!sv && fondeLaCouronne(sv); },
    payeAujourdhui: { date: jour, serviceIds },
    cadenceJours,
  })), [imposee, siens, clientId, aujourdhui, byId, jour, serviceIds, cadenceJours]);

  const [choisi, setChoisi] = useState<number | null>(null);
  /* LE SOUHAIT DE L'AGENT : le rituel qui porte les gestes nommés (ou un geste
     de leur famille). Des gestes qu'elle n'a jamais pris font un rituel à part,
     ces gestes-là eux-mêmes. */
  const voulus = souhait?.gestes ?? [];
  const iVoulu = !imposee && voulus.length > 0 ? leRituelVoulu(rituels, voulus, (id) => byId.get(id)?.categoryId) : -1;
  const horsDeSesRituels = !imposee && voulus.length > 0 && iVoulu < 0;
  const iChoisi = choisi !== null && choisi < rituels.length ? choisi
    : iVoulu >= 0 ? iVoulu
    : horsDeSesRituels ? -1
    : leRituelDOffice(rituels);
  const rituel = iChoisi >= 0 ? rituels[iChoisi] : undefined;
  const ids = imposee ? imposee.suite.serviceIds : rituel?.ids ?? (horsDeSesRituels ? [...voulus] : []);

  /* LE TARIF D'UN RITUEL, COMME LA FENÊTRE DU RENDEZ-VOUS : son contexte
     (`tarifsDuRituel`, sa tête et la longueur du jour), son brut
     (`brutDuRituel`), sa durée (`personalDurationMin`, jamais moins de
     15 minutes), l'acompte des Paramètres, et la remise famille de sa tête. */
  /* UNE SEULE REMISE (4 novembre 2026) : la remise famille de sa tête se juge
     à la date de la place (`famPctDeLaTete`) ; aux prix convenus ou abonnée,
     aucune. Un geste offert au panier la retire aussi. */
  const prixConvenus = !!fiche && aUnPrixConvenu(fiche);
  const familleDeLaTete = fiche?.familyId ? families.find((f) => f.id === fiche.familyId) : undefined;
  const famPctDuFoyer = remiseFamillePct(familleDeLaTete, clients, aujourdhui);
  const tarifDe = (ids: readonly string[]) => {
    const t = tarifsDuRituel({ serviceIds: [...ids], longueur }, {
      client: fiche, bands, sets, cats, byId, tousServices: services, produits,
    });
    const prixXof = brutDuRituel({ serviceIds: [...ids] }, byId, t);
    /* La part que la remise famille prendrait : ni les forfaits, ni un geste
       sans remise (le Rituel Sówà™). Nulle, il n'y a rien à poser. */
    const horsFamille = t.chosen
      .filter((sv) => regimeTarifaire(sv, cats).k === 'forfait' || gesteSansRemise(sv))
      .reduce((n, sv) => n + Math.round(t.prixPlein(sv) * (1 - t.gesteDe(sv) / 100)), 0);
    return {
      t,
      chosen: t.chosen,
      prixXof,
      baseFamilleXof: Math.max(0, prixXof - horsFamille),
      gesteAuPanier: unGesteDansLePanier(t.chosen, t.pricing),
      dureeMin: Math.max(15, t.chosen.reduce((n, sv) => n + personalDurationMin(sv, t.pricing), 0) || 60),
      depositServiceIds: t.chosen.filter((s) => depositPctFor(s.id) > 0).map((s) => s.id),
      depositXof: Math.min(depositForServices(t.chosen, 0), prixXof),
      longueurPertinente: t.chosen.some(suitLongueur),
      prixLibre: t.chosen.some((sv) => !prixFerme(sv, t.pricing)),
    };
  };
  /** La remise famille de sa tête à cette date, avant la règle du geste. */
  const famPctA = (iso: string): number =>
    famPctDeLaTete(famPctDuFoyer, { prixConvenus, abonnee: !!contratPourLaDate(subs, clientId, iso, plans) });
  const tarifs = rituels.map((r) => tarifDe(r.ids));
  const tarifBrut = imposee ? tarifDe(ids) : iChoisi >= 0 ? tarifs[iChoisi] : horsDeSesRituels ? tarifDe(ids) : undefined;
  /* La Retouche comprise garde la durée que sa création lui donne. */
  const tarif = tarifBrut && imposee?.suite.dureeMin ? { ...tarifBrut, dureeMin: imposee.suite.dureeMin } : tarifBrut;
  /* TOUJOURS TEAM POUR L'AGENT (18 novembre 2026) : le calendrier commun de
     la branche, jamais une personne choisie par lui. */
  const maitreDeTeam = branch.masters.find((m) => sameName(m, 'Team')) ?? maitreParDefaut(branch);
  const maitre = imposee
    ? (imposee.suite.master || maitreParDefaut(branch))
    : souhait && tarif
      ? maitreDeTeam
      : rituel && tarif
        ? leMaitreDuRituel({ habituel: rituel.maitre, noms: tarif.chosen.map((sv) => sv.name), maitres: branch.masters, parDefaut: maitreParDefaut(branch) })
        : '';
  /* La date visée : celle du souhait quand il en dit une, sinon celle de son rythme. */
  const duSouhait = souhait?.du ? (souhait.du < aujourdhui ? aujourdhui : souhait.du) : '';
  const vers = imposee ? (imposee.date < demain ? demain : imposee.date) : duSouhait || rituel?.vers || (horsDeSesRituels ? demain : undefined);

  /* LA CARTE : `null` tant qu'on n'y a pas touché, et elle se relit alors à
     chaque rendu (la place d'office, le rendez-vous déjà là). Au premier
     geste, elle se fige : ce qu'on a touché ne bouge plus tout seul. */
  const [carteTouchee, setCarte] = useState<EtatDeLaCarte | null>(null);
  /* Le rendez-vous que la carte a posé : il n'occupe pas sa propre place. */
  const laSienne = useRef<string | null>(null);
  laSienne.current = carteTouchee && !carteTouchee.dejaLa ? carteTouchee.rdvId : null;

  /* LES PLACES D'UN JOUR, comme la fenêtre du rendez-vous (`placesDe`) : tout
     rendez-vous non annulé de la branche occupe un fauteuil pour sa durée,
     les murs posés pour son maître se respectent, l'ouverture du jour fait
     foi (jours fermés et exceptions d'horaires). Le carnet et les murs sont
     passés en argument : au toucher, on relit ceux du moment. */
  const sieges = Math.max(0, branch.seats ?? 0);
  const placesDe = (carnet: readonly Appointment[], murs: Blocage[], dureeMin: number, qui: string) => (iso: string) => {
    const occupes: Occupant[] = carnet
      .filter((a) => a.branchId === branch.id && a.date === iso && a.status !== 'annulé')
      .filter((a) => a.id !== laSienne.current)
      .map((a) => ({ maitre: a.master, debutMin: timeToMin(a.time), dureeMin: apptDurationMin(a, byId) }));
    return placesDuJour({
      iso,
      aujourdhui,
      maintenantMin: momentDuSalon().minutes,
      ouverture: openingForIso(iso),
      durationMin: dureeMin,
      occupes,
      bloques: plagesBloquees(murs, branch.id, iso, qui),
      sieges,
    });
  };
  const jourHabituel = jourFavoriDe(sesVenues, clientId, aujourdhui)?.jour ?? null;
  const sonHeure = heureHabituelle(sesVenues);
  const places = useMemo(() => {
    if (!vers || !tarif) return [];
    const duJour = placesDe(tous, blocages, tarif.dureeMin, maitre);
    return sesTroisPlaces({
      vers,
      aujourdhui,
      placesDe: (iso) => { const p = duJour(iso); return { ferme: p.ferme, heures: p.heures }; },
      heureHabituelle: sonHeure,
      jourHabituel,
      jourDit,
      nomDuJour: (j) => NOMS_DES_JOURS[j],
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vers, tarif?.dureeMin, maitre, tous, blocages, sonHeure, jourHabituel, aujourdhui, sieges, branch.id, byId, carteTouchee?.rdvId]);

  /* UN RITUEL, UN SEUL PROCHAIN RENDEZ-VOUS (4 octobre 2026) : la suite de ce
     rituel, ou un rendez-vous à venir de la tête, se MONTRE ; on n'en pose
     pas un second (`prochainDejaPose`). Le jour même ne compte pas. */
  const dejaPose = useMemo(() => {
    const repere = { id: rituelId ?? `vente-${clientId}-${jour}`, clientId, date: jour };
    return prochainDejaPose(repere, tous.filter((a) => a.branchId === branch.id && (a.date > aujourdhui || a.repriseDe === repere.id)), aujourdhui);
  }, [rituelId, clientId, jour, tous, branch.id, aujourdhui]);

  /* PAS DE DATE EN GRAND quand son rythme ne se lit pas : trois places. */
  const sansDate = !imposee && !!rituel && sansDateDOffice({
    source: rituel.source, dePassage: !!fiche && estDePassage(fiche), diaspora: !!fiche && estDiaspora(fiche), rythmeSurLaFiche: !!fiche?.rythmeSemaines,
  });
  /* LA PLACE DU SOUHAIT : la première de la fenêtre demandée, au moment et à
     l'heure dits (sinon la plus proche), sur les places du « + RDV ». */
  const placeDuSouhait = useMemo(() => {
    if (!souhait?.du || !tarif) return null;
    const duJour = placesDe(tous, blocages, tarif.dureeMin, maitre);
    return laPlaceDuSouhait({ souhait, aujourdhui, heureHabituelle: sonHeure, placesDe: (iso) => { const p = duJour(iso); return { ferme: p.ferme, heures: p.heures }; } });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [souhait?.du, souhait?.au, souhait?.heure, souhait?.moment, tarif?.dureeMin, maitre, tous, blocages, sonHeure, aujourdhui, sieges, branch.id, byId, carteTouchee?.rdvId]);
  const departDOffice = souhait?.du || sansDate ? null : laPlaceDOffice(places, jourHabituel);
  const departProp: PlaceDeLaCarte | null = souhait?.du
    ? (placeDuSouhait ? { iso: placeDuSouhait.iso, heure: placeDuSouhait.heure } : null)
    : departDOffice;
  const initiale = carteNeuve({
    depart: departProp ? { iso: departProp.iso, heure: departProp.heure } : null,
    deja: dejaPose ? { id: dejaPose.id, iso: dejaPose.date, heure: dejaPose.time } : null,
  });
  const carte = carteTouchee ?? initiale;
  const carteRef = useRef(carte);
  carteRef.current = carte;

  const [autre, setAutre] = useState(false);
  const [jourChoisi, setJourChoisi] = useState<string | null>(null);
  const [alerte, setAlerte] = useState<string | null>(null);
  const [fenetre, setFenetre] = useState<{ appt?: Appointment; initial?: RdvInitial } | null>(null);

  /* ══ LE RENDEZ-VOUS SUGGÉRÉ · 15 novembre 2026 ══════════════════════════
     « Suggéré par la Maison » d'office : elle le confirme d'un toucher sur
     WhatsApp. « Elle l'a choisi avec nous » : au comptoir elle a dit oui,
     il est confirmé. Les puces 3, 4, 5, 6, 8 et 12 semaines (depuis cette
     séance) et « Ou choisir une date » changent la place montrée ; rien ne
     se pose avant « Poser la suggestion ». Maquette PeiD4o4yfCY4GajdGJ52Ez. */
  /* L'agent pose ce qu'on lui a demandé au comptoir : elle l'a choisi avec nous. */
  const [qui, setQui] = useState<QuiAChoisi>(souhait ? 'choisi' : 'suggere');
  const quiRef = useRef(qui);
  quiRef.current = qui;
  const [puce, setPuce] = useState<number | null>(null);
  const [dateLibre, setDateLibre] = useState('');
  const [notePuce, setNotePuce] = useState<string | null>(null);
  /* Le jour choisi à la main qui n'a pas de place (20 novembre 2026) : la
     carte ne bouge pas, l'écran le dit, le jour suivant se prend d'un toucher. */
  const [jourSansPlace, setJourSansPlace] = useState<(JourSansPlace & { suivante: PlaceDeLaPuce | null }) | null>(null);
  const modeleApprouve = useModeleApprouve('proposition_rituel');
  /* La proposition ne part que son modèle approuvé ; sans lecture, on n'en dit rien. */
  const sansModele = qui === 'suggere' && modeleApprouve === false;

  /* Le rendez-vous de la carte, relu au carnet : la fenêtre du rendez-vous a
     pu le changer (ses gestes, son heure) ou l'effacer. */
  const posee = carte.rdvId ? tous.find((a) => a.id === carte.rdvId) : undefined;
  useEffect(() => {
    const c = carteTouchee;
    if (!c || !c.rdvId || c.pied === 'termine') return;
    const lu = appointmentsStore.get().find((a) => a.id === c.rdvId);
    if (!lu || lu.status === 'annulé') {
      /* Effacé ou annulé ailleurs : la carte le dit, rien ne part. */
      setCarte(c.dejaLa ? null : { ...c, valide: false, rdvId: null, retire: true, modif: false, pied: 'rien' });
      return;
    }
    if (!c.place || lu.date !== c.place.iso || lu.time !== c.place.heure) setCarte({ ...c, place: { iso: lu.date, heure: lu.time } });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [posee?.date, posee?.time, posee?.status, !!posee]);

  /* L'ÉCRAN QUI DISPARAÎT SANS « TERMINER » (on navigue ailleurs, la fiche se
     ferme) : un rendez-vous validé ne reste pas muet. Sa confirmation part,
     une fois, comme à la fermeture. */
  useEffect(() => () => {
    const c = carteRef.current;
    if (c.valide && c.rdvId && !c.dejaLa && !c.retire && c.pied !== 'termine') leveLaConfirmation(c.rdvId);
  }, []);

  /* CE QUI DEMANDE SA FICHE : les gestes de la fenêtre que la carte ne refait
     pas. La formule se juge à la date de la place ; la remise famille, elle,
     se pose ici (4 novembre 2026). */
  const casAPart = (iso: string): string | null => {
    if (!tarif || imposee) return null;
    const acte = tarif.chosen.reduce<Palier | null>((p, sv) => plusHautDes(p, sv.palier), null);
    const mains = equipe.filter((m) => sameName(m.name, maitre)).map((m) => ({ nom: m.name, palier: m.palier ?? null }));
    return ceQuiDemandeSaFiche({
      formule: !!contratPourLaDate(subs, clientId, iso, plans),
      prixLibre: tarif.prixLibre,
      seancesIncluses: tarif.chosen.some((sv) => (sv.includes ?? []).some((i) => (i.afterWeeks ?? 0) > 0)),
      salonPrive: tarif.chosen.some((sv) => !!sv.privatise),
      paliersStricts: !!settingsStore.get().paliersStrict && !!avertissementDHabilitation({ acte, mains }),
    });
  };
  /** La remise famille de sa tête à cette date, en francs, comme la fenêtre
      la fige (rien sur un geste offert, un forfait, le Rituel Sówà™). */
  const familleXof = (iso: string): number => {
    if (!tarif || imposee) return 0;
    const pct = tarif.gesteAuPanier || tarif.baseFamilleXof <= 0 ? 0 : famPctA(iso);
    return pct > 0 ? remiseEnFrancsArrondie(tarif.baseFamilleXof, pct) : 0;
  };

  /* ══ LES PLACES LIMITÉES SUR UNE PLACE — 4 novembre 2026 ══════════════════
     Une place un jour de l'offre, vide, dans ses jours à l'avance, sur un rituel
     qu'elle couvre : son prix est celui de la remise (net au millier), la
     place dit le décompte (« Places limitées · Remise : il reste 2 places »),
     et le toucher pose la place. Le compte se tire du carnet, relu au toucher ;
     le rendez-vous de la carte, déplacé, ne compte pas deux fois (`relu`).
     UNE SEULE REMISE remplace « la plus forte des deux » : jamais pour une
     tête aux prix convenus, abonnée à cette date, de la famille d'un foyer
     remisé, ni sur un rituel qui porte un geste offert. Jamais sur La
     Retouche comprise, déjà offerte. */
  const leMercrediDeLaPlace = (iso: string, carnet: readonly Appointment[] = tous) => {
    if (!tarif || imposee || ids.length === 0) return null;
    const juge = lOffreDuJourAuTrone(offres, {
      branchId: branch.id, dateIso: iso, serviceIds: ids, aujourdhui,
      couvertParAbonnement: !!contratPourLaDate(subs, clientId, iso, plans),
      prixConvenus,
      autreRemise: famPctA(iso) > 0 || tarif.gesteAuPanier,
      rdvs: carnet,
      relu: laSienne.current ? carnet.find((a) => a.id === laSienne.current) ?? null : null,
    });
    const offre = juge?.offre ?? null;
    /* Le Rituel Sówà™ ne prend aucune remise (`sansRemise` au catalogue). */
    const pose = poseLOffreDuJour(offre, ids.map((id) => {
      const sv = byId.get(id);
      const p = sv ? Math.round(tarif.t.prixPlein(sv) * (1 - tarif.t.gesteDe(sv) / 100)) : 0;
      return { id, prixXof: p, ferme: !!sv && p > 0 && prixFerme(sv, tarif.t.pricing) && !gesteSansRemise(sv) };
    }));
    if (!offre || !pose || !juge) return null;
    const du = ceQueRetireLeMercredi({
      sansLuiXof: tarif.prixXof,
      avecLuiXof: brutDuRituel({ serviceIds: [...ids], remisesLignes: pose.remisesLignes }, byId, tarif.t),
      brutNuXof: tarif.prixXof,
      arrondir: !tarif.prixLibre,
    });
    if (du.mercrediXof <= 0) return null;
    return { offre, pose, netXof: du.netXof, mercrediXof: du.mercrediXof, aPlaces: juge.aPlaces, phrase: ditLaPlaceDuRdv(juge) };
  };

  /* LE RENDEZ-VOUS, CONSTRUIT EN UN SEUL ENDROIT (`leRendezVousDuProchainRituel`),
     POSÉ SANS CONFIRMATION tant que la carte est ouverte, relié à son rituel.
     L'offre du jour et la remise famille se relisent pour CETTE place, sur
     le carnet du moment. */
  const numero = numeroAPrevenirDuRdv({ choisi: '', fiche, derniers: siens.filter((a) => a.branchId === branch.id) });
  /* La confirmation-rdv écrit au numéro à prévenir, sinon au premier numéro de sa fiche (`telDuRdv`). */
  const aUnNumero = !!numero || /\d/.test(fiche?.phone ?? '');
  const construis = (p: PlaceDeLaCarte, id: string): Appointment | null => {
    if (!tarif) return null;
    if (imposee) {
      return { ...imposee.suite, id, date: p.iso, time: p.heure, sansConfirmation: true, numeroAPrevenir: imposee.suite.numeroAPrevenir ?? numero, ...marqueDeLaPose(quiRef.current, new Date().toISOString()) };
    }
    const mercredi = leMercrediDeLaPlace(p.iso, appointmentsStore.get());
    const rdv = leRendezVousDuProchainRituel({
      id,
      branchId: branch.id,
      clientId,
      serviceIds: ids,
      place: { iso: p.iso, heure: p.heure },
      master: maitre,
      longueur: tarif.longueurPertinente ? longueur : undefined,
      dureeMin: tarif.dureeMin,
      priceXof: mercredi ? mercredi.netXof : tarif.prixXof,
      depositServiceIds: tarif.depositServiceIds,
      depositXof: mercredi ? Math.min(tarif.depositXof, mercredi.netXof) : tarif.depositXof,
      offreDuJour: mercredi?.pose ?? null,
      numeroAPrevenir: numero,
      repriseDe: rituelId,
      sansConfirmation: true,
      ...marqueDeLaPose(quiRef.current, new Date().toISOString()),
      remiseFamilleXof: mercredi ? 0 : familleXof(p.iso),
    });
    return rdv;
  };

  /* LA FENÊTRE DU RENDEZ-VOUS, sur une place (ce qui demande sa fiche,
     « Changer les gestes » avant de valider) ou sur un rendez-vous posé. */
  const ouvreLaFenetre = (o: { appt?: Appointment; place?: PlaceDeLaCarte | null }) => {
    if (o.appt) { setFenetre({ appt: o.appt }); return; }
    const initial: RdvInitial = { clientId, serviceIds: [...ids], ...(o.place ? { date: o.place.iso, time: o.place.heure } : {}), ...(maitre ? { master: maitre } : {}) };
    if (onALaMain) onALaMain(initial); else setFenetre({ initial });
  };

  /* UN GESTE : la règle pure dit l'état et les effets ; une place se relit
     d'abord sur le carnet du moment (une autre main a pu la prendre), puis
     l'écran exécute. */
  const quiEst = fiche?.name ?? 'elle';
  const nomDuNumero = numerosDeLaFiche(fiche).find((n) => n.numero === numero)?.nom;
  const execute = (f: EffetDeLaCarte, apres: EtatDeLaCarte) => {
    if (f.genre === 'poser') {
      const rdv = construis(f.place, f.id);
      if (!rdv) return;
      const pose = poseUnRendezVous(rdv);
      laSienne.current = pose.id;
    } else if (f.genre === 'deplacer') {
      const lu = appointmentsStore.get().find((a) => a.id === f.rdvId);
      if (!lu) return;
      /* Ses gestes changés dans la fenêtre restent : seule la place bouge. */
      const neuf = memesGestes(lu.serviceIds, ids) ? construis(f.place, f.rdvId) : { ...lu, date: f.place.iso, time: f.place.heure };
      if (neuf) remplaceLeRendezVousDeLaCarte(neuf);
    } else if (f.genre === 'retirer') {
      retireLeRendezVousDeLaCarte(f.rdvId);
    } else if (f.genre === 'confirmer') {
      leveLaConfirmation(f.rdvId);
    } else if (f.genre === 'ouvrir') {
      const lu = appointmentsStore.get().find((a) => a.id === f.rdvId);
      if (lu) ouvreLaFenetre({ appt: lu });
    } else if (f.genre === 'fermer') {
      const sansNumero = apres.valide && !apres.dejaLa && !apres.retire && !aUnNumero;
      const suggere = quiRef.current === 'suggere';
      toast(sansNumero && apres.place
        ? (suggere
          ? `Fenêtre fermée. Suggestion posée au Carnet : ${momentDuMessage(apres.place.iso, apres.place.heure)}. Sa fiche n’a pas de numéro : aucune proposition ne part, dites-lui la date.`
          : `Fenêtre fermée. Rendez-vous posé, confirmé : ${momentDuMessage(apres.place.iso, apres.place.heure)}. Sa fiche n’a pas de numéro : aucune confirmation ne part.`)
        : issueDeLaFermeture(apres, { qui: nomDuNumero ? `${quiEst} (${nomDuNumero})` : quiEst, momentDit: (p) => momentDuMessage(p.iso, p.heure), suggere, sansModele: suggere && modeleApprouve === false }));
      onFerme?.();
    }
  };
  /* `resteOuvert` : le jour touché dans la bande garde « Une autre place »
     ouverte, pour en choisir l'heure (20 novembre 2026). */
  const fais = (g: GesteDeLaCarte, o: { resteOuvert?: boolean } = {}) => {
    const r = gesteSurLaCarte(carte, g);
    for (const f of r.effets) {
      if (f.genre !== 'poser' && f.genre !== 'deplacer') continue;
      const p = f.place;
      if (!tarif) return;
      if (casAPart(p.iso)) {
        const lu = f.genre === 'deplacer' ? appointmentsStore.get().find((a) => a.id === f.rdvId) : undefined;
        setAlerte(`${casAPart(p.iso)}. La fenêtre du rendez-vous s’ouvre, posée sur cette place.`);
        ouvreLaFenetre(lu ? { appt: lu } : { place: p });
        return;
      }
      const fraiches = placesDe(appointmentsStore.get(), blocagesStore.get(), tarif.dureeMin, maitre)(p.iso);
      if (!laPlaceTient(fraiches, p.heure)) {
        setAlerte(`La place du ${jourDit(p.iso)} à ${heureDuMessage(p.heure)} vient de partir. Les places sont relues : touchez-en une autre.`);
        return;
      }
    }
    setAlerte(null);
    setJourSansPlace(null);
    const etat = o.resteOuvert && !r.etat.dejaLa ? { ...r.etat, modif: true } : r.etat;
    setCarte(etat);
    for (const f of r.effets) execute(f, etat);
  };
  const terminer = () => fais({ genre: 'terminer' });
  const plein = carte.valide || !carte.place || carte.retire;

  /* ── LES SEMAINES DE LA SUITE (15 novembre 2026) ──────────────────────
     Chaque puce vise le jour de cette séance + n semaines, à son heure chez
     son maître (`laPlaceDeLaPuce`, sur les places du « + RDV ») ; un jour
     fermé ou plein passe au suivant, et la carte le dit. La puce de son
     rythme est marquée. Rien ne se pose : la place montrée change. */
  const rythmeEnJours = imposee ? imposee.semaines * 7 : rituel && rituel.source !== 'defaut' ? rituel.rythmeJours : null;
  const sonRythme = semaineDuRythme(rythmeEnJours);
  const placesDesPuces = useMemo(() => {
    if (!tarif || carte.dejaLa) return [];
    const duJour = placesDe(tous, blocages, tarif.dureeMin, maitre);
    const lit = (iso: string) => { const p = duJour(iso); return { ferme: p.ferme, heures: p.heures }; };
    return SEMAINES_DE_LA_SUITE.map((n) => ({ n, vise: dansNSemaines(jour, n), place: laPlaceDeLaPuce({ vise: dansNSemaines(jour, n), aujourdhui, placesDe: lit, heureHabituelle: sonHeure }) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tarif?.dureeMin, maitre, tous, blocages, sonHeure, jour, aujourdhui, carte.dejaLa, sieges, branch.id, carteTouchee?.rdvId]);
  const puceMontree = (() => {
    const montre = (n: number) => { const x = placesDesPuces.find((y) => y.n === n)?.place; return !!x && !!carte.place && memePlace(x, carte.place); };
    if (puce !== null && montre(puce)) return puce;
    return placesDesPuces.find((x) => montre(x.n))?.n ?? null;
  })();
  /** Les places d'un jour, relues sur le carnet et les murs du moment. */
  const lesPlacesDuMoment = (iso: string) => {
    if (!tarif) return { ferme: true, heures: [] as string[] };
    const p = placesDe(appointmentsStore.get(), blocagesStore.get(), tarif.dureeMin, maitre)(iso);
    return { ferme: p.ferme, heures: p.heures };
  };
  /** UNE PUCE « dans n semaines » : une distance ; un jour fermé ou plein
      passe au suivant, et l'étiquette de la puce le montre. */
  const vise = (o: { n: number }) => {
    if (!tarif) return;
    const cible = placesDesPuces.find((x) => x.n === o.n)?.place ?? null;
    if (!cible) {
      setAlerte(`Aucune place pour ${fmtDureeCourte(tarif.dureeMin)}${maitre ? ` chez ${maitre}` : ''} dans les quatre semaines qui suivent : choisissez une autre date.`);
      return;
    }
    setPuce(o.n);
    setDateLibre('');
    setNotePuce(cible.ecart === 'jour' ? `Le ${jourDit(cible.vise)} n’a pas de place pour sa durée : le ${jourDit(cible.iso)}, la première place qui suit.` : null);
    fais({ genre: 'viser', place: { iso: cible.iso, heure: cible.heure } });
  };
  /** UN JOUR CHOISI À LA MAIN (« Ou choisir une date », la bande « Une autre
      date ») : ce jour-là, jamais un autre (20 novembre 2026,
      `laPlaceDuJourChoisi`). Sans place, la carte ne bouge pas. */
  const choisitLeJour = (iso: string, o: { resteOuvert?: boolean } = {}) => {
    if (!tarif) return;
    const r = laPlaceDuJourChoisi({ iso, aujourdhui, heureHabituelle: sonHeure, placesDe: lesPlacesDuMoment });
    setPuce(null);
    if (estUnJourSansPlace(r)) {
      setDateLibre('');
      setNotePuce(null);
      setAlerte(null);
      setJourSansPlace({
        ...r,
        suivante: r.manque === 'passe' ? null : laPlaceDeLaPuce({ vise: addDaysISO(iso, 1), aujourdhui, heureHabituelle: sonHeure, placesDe: lesPlacesDuMoment }),
      });
      return;
    }
    setNotePuce(r.ecart === 'heure' && sonHeure ? `${heureDuMessage(sonHeure)} est prise le ${jourDit(iso)} : ${heureDuMessage(r.heure)}, l’heure libre la plus proche.` : null);
    fais({ genre: 'viser', place: { iso: r.iso, heure: r.heure } }, o);
  };
  const changeQui = (q: QuiAChoisi) => {
    setQui(q);
    if (carte.valide && carte.rdvId && !carte.dejaLa && !carte.retire) marqueLaSuggestion(carte.rdvId, q === 'suggere');
  };

  /* ── CE QUE LA CARTE MONTRE ───────────────────────────────────────────── */
  const nomDe = (l: readonly string[]) => l.map((id) => byId.get(id)?.name.split(' · ')[0]).filter(Boolean).join(' + ');
  const longueurDite = LONGUEURS.find((l) => l.id === longueur)?.label ?? longueur;
  const mercrediIci = carte.place && !posee ? leMercrediDeLaPlace(carte.place.iso) : null;
  const familleIci = carte.place && !posee && !mercrediIci ? familleXof(carte.place.iso) : 0;
  const rdvMontre = posee ?? (carte.dejaLa ? dejaPose ?? undefined : undefined);
  const gestesMontres = rdvMontre?.serviceIds ?? ids;
  const tarifDesGestes = memesGestes(gestesMontres, ids) ? tarif : gestesMontres.length > 0 ? tarifDe(gestesMontres) : undefined;
  const remisesMontrees = rdvMontre?.remisesLignes ?? imposee?.suite.remisesLignes;
  const lignesDesGestes = gestesMontres.map((id, k) => {
    const sv = byId.get(id);
    const prixDuGeste = sv && tarifDesGestes ? Math.round(tarifDesGestes.t.prixPlein(sv) * (1 - tarifDesGestes.t.gesteDe(sv) / 100)) : 0;
    const offert = (remisesMontrees?.[k]?.pct ?? 0) >= 100;
    return { id: `${id}-${k}`, nom: sv?.name ?? 'Prestation', prix: offert ? 'offert' : fmtMoney(prixDuGeste, currency) };
  });
  const netMontre = rdvMontre
    ? apptNetXof(rdvMontre, byId)
    : imposee && tarif
      ? brutDuRituel({ serviceIds: [...ids], remisesLignes: imposee.suite.remisesLignes }, byId, tarif.t)
      : tarif ? (mercrediIci ? mercrediIci.netXof : tarif.prixXof - familleIci) : 0;
  const dureeMontree = rdvMontre ? apptDurationMin(rdvMontre, byId) : tarif?.dureeMin ?? 60;
  const maitreMontre = rdvMontre?.master || maitre;
  const change = !carte.dejaLa && !!carte.place && !!carte.depart && !memePlace(carte.place, carte.depart);
  const raison = (() => {
    if (carte.dejaLa) return 'Un rituel, un seul prochain rendez-vous : celui-ci existait déjà, rien de plus n’a été créé.';
    if (change || !carte.place) return '';
    if (imposee) {
      return imposee.suite.retoucheComprise
        ? `Après sa création, La Retouche comprise, offerte, ${dureeDite(imposee.semaines * 7)} plus tard.`
        : `Après sa Retouche comprise, sa première venue, ${dureeDite(imposee.semaines * 7)} plus tard.`;
    }
    /* Ce que l'agent a lu, et l'écart s'il y en a un (« 10 h est prise ce jour-là »). */
    if (souhait?.du) return phraseDuSouhait({ souhait, place: placeDuSouhait, jourDit, heureDite: heureDuMessage });
    if (!rituel || !departDOffice) return '';
    return laRaisonDeLaDate({
      rituel, place: departDOffice, jourDit, sonJour: jourHabituel !== null ? NOMS_DES_JOURS[jourHabituel] : null,
    });
  })();
  const verifie = (() => {
    if (!carte.place) return null;
    /* Une place prise en ligne qui attend son oui (18 novembre 2026) se dit « en attente », pas « suggéré ». */
    if (carte.dejaLa) return { texte: ceQueDitLeRendezVousDejaLa({ creeLe: dejaPose?.creeLe, source: dejaPose?.source, status: estEnAttente(dejaPose) ? 'en attente' : dejaPose?.status, dateDite: dateSansJour, suggere: estSuggere(dejaPose) && etatDeLAttente(dejaPose) === null }), alerte: false };
    if (change || !tarif) return ceQueDitLaPlace({ place: carte.place, maitre: maitreMontre, nomDuJour: (iso) => NOMS_DES_JOURS[new Date(`${iso}T12:00:00`).getDay()] });
    return ceQueDitLaPlace({
      place: carte.place,
      heureHabituelle: sonHeure,
      ouverteCeJour: sonHeure ? placesDe([], [], tarif.dureeMin, maitre)(carte.place.iso).heures.includes(sonHeure) : undefined,
      maitre: maitreMontre,
      nomDuJour: (iso) => NOMS_DES_JOURS[new Date(`${iso}T12:00:00`).getDay()],
    });
  })();
  /* Un rendez-vous déjà là, venu du site, peut attendre sa confirmation : la pastille le dit. */
  const pastille = carte.dejaLa && (rdvMontre?.status === 'en attente' || estEnAttente(rdvMontre)) ? { texte: 'En attente', ton: 'vide' as const }
    : carte.dejaLa && estSuggere(rdvMontre) && etatDeLAttente(rdvMontre) === null ? { texte: 'Suggéré', ton: 'suggere' as const }
    : pastilleDeLaCarte(carte, { suggere: qui === 'suggere' });
  const message = ceQuiPartVersElle(carte, { aUnNumero, suggere: qui === 'suggere', sansModele });

  /* Les places : celles du rythme, ou la première venue sans date en grand. */
  const lesPlaces = (titre: string) => (
    places.length > 0 ? (
      <div className="trv-prochain__trois" role="group" aria-label={titre}>
        {places.map((p: PlaceDuProchainRituel) => {
          /* LE PRIX DE CETTE PLACE : celui des places limitées quand il la couvre. */
          const mercredi = leMercrediDeLaPlace(p.iso);
          const enGrand = !!carte.place && memePlace(carte.place, p) && !carte.retire;
          return (
            <button
              key={`${p.iso}-${p.heure}`}
              type="button"
              aria-pressed={enGrand}
              className={`trv-prochain__place${mercredi ? ' est-offre' : ''}`}
              data-iso={p.iso}
              data-heure={p.heure}
              onClick={() => fais({ genre: 'toucher', place: { iso: p.iso, heure: p.heure }, id: uid() })}
            >
              <span className="trv-prochain__place-titre">{p.titre}</span>
              <span className="trv-prochain__place-date">{`${jourCourtAn(p.iso)} · ${heureDuMessage(p.heure)}`}</span>
              <span className="trv-prochain__place-prix">{imposee ? 'offerte' : fmtMoney(mercredi ? mercredi.netXof : (tarif?.prixXof ?? 0) - familleXof(p.iso), currency)}</span>
              {mercredi && (
                <span className="trv-prochain__place-offre">
                  {`${mercredi.phrase} · −${mercredi.offre.discountPct ?? 0} %`}
                </span>
              )}
              <span className="trv-prochain__place-pourquoi">{[p.pourquoi, maitre ? `Avec ${maitre}.` : null].filter(Boolean).join(' ')}</span>
            </button>
          );
        })}
      </div>
    ) : (
      <p className="trv-prochain__note">{`Aucune place libre pour ${fmtDureeCourte(tarif?.dureeMin ?? 60)} autour de cette date : choisissez une autre date.`}</p>
    )
  );

  /* « UNE AUTRE DATE » : une bande de jours ouverts, puis les heures du jour. */
  const debutDesJours = (() => { const d = vers ? addDaysISO(vers, -3) : demain; return d < demain ? demain : d; })();
  const joursOuverts = autre && tarif
    ? lesJoursDUneAutreDate({ depuis: debutDesJours, placesDe: (iso) => { const p = placesDe(tous, blocages, tarif.dureeMin, maitre)(iso); return { ferme: p.ferme, heures: p.heures }; }, ajouteJours: addDaysISO, n: 10 })
    : [];
  const jourVu = jourChoisi && joursOuverts.includes(jourChoisi) ? jourChoisi
    : carte.place && joursOuverts.includes(carte.place.iso) ? carte.place.iso : joursOuverts[0] ?? null;
  const uneAutreDate = autre && tarif ? (
    joursOuverts.length > 0 && jourVu ? (
      <div className="trv-prochain__autre">
        <div className="trv-prochain__jours" role="group" aria-label="Les jours ouverts">
          {joursOuverts.map((iso) => (
            /* Le jour touché devient la date de la carte (20 novembre 2026) :
               il ne s'allume plus seul pendant que le geste plein pose l'autre. */
            <button key={iso} type="button" className="trv-prochain__jour" data-iso={iso} aria-pressed={iso === jourVu} onClick={() => { setJourChoisi(iso); choisitLeJour(iso, { resteOuvert: true }); }}>
              <small>{morceauDuJour(iso, { weekday: 'short' })}</small>
              <b>{morceauDuJour(iso, { day: 'numeric' })}</b>
              <small>{morceauDuJour(iso, { month: 'short' })}</small>
            </button>
          ))}
        </div>
        <p className="trv-prochain__aide">{`Les heures libres chez ${maitre || 'la Maison'}, le ${jourDit(jourVu)}, pour ${fmtDureeCourte(tarif.dureeMin)} :`}</p>
        <div className="trv-prochain__heures" role="group" aria-label="Les heures">
          {lesHeuresDuJour({
            toutes: placesDe([], [], tarif.dureeMin, maitre)(jourVu).heures,
            libres: placesDe(tous, blocages, tarif.dureeMin, maitre)(jourVu).heures,
          }).map((h) => (
            <button
              key={h.heure}
              type="button"
              data-heure={h.heure}
              disabled={!h.libre}
              aria-label={h.libre ? heureDuMessage(h.heure) : `${heureDuMessage(h.heure)}, prise`}
              aria-pressed={!!carte.place && carte.place.iso === jourVu && carte.place.heure === h.heure}
              onClick={() => fais({ genre: 'toucher', place: { iso: jourVu, heure: h.heure }, id: uid() })}
            >
              {heureDuMessage(h.heure)}
            </button>
          ))}
        </div>
      </div>
    ) : <p className="trv-prochain__note">Aucun jour ouvert avec une place pour sa durée dans les six semaines.</p>
  ) : null;

  /* LE JOUR CHOISI SANS PLACE (20 novembre 2026) : la carte reste où elle
     est, et le dit ; le jour suivant ne se prend que d'un toucher ; la
     fenêtre du rendez-vous pose quand même ce jour-là, si la Maison s'organise. */
  const leJourSansPlace = jourSansPlace && tarif ? (() => {
    const j = jourSansPlace;
    const reste = carte.place && !carte.retire ? `, la carte reste le ${jourDit(carte.place.iso)} à ${heureDuMessage(carte.place.heure)}` : '';
    const phrase = j.manque === 'ferme'
      ? `La Maison est fermée le ${jourDit(j.iso)} : la date n’a pas changé${reste}.`
      : j.manque === 'plein'
        ? `Le ${jourDit(j.iso)} est complet${maitre ? ` chez ${maitre}` : ''} pour ${fmtDureeCourte(tarif.dureeMin)} : la date n’a pas changé${reste}.`
        : `Le ${jourDit(j.iso)} est passé : la date n’a pas changé${reste}.`;
    const heureDeLaMain = sonHeure ?? placesDe([], [], tarif.dureeMin, maitre)(j.iso).heures[0] ?? '10:00';
    return (
      <div className="trv-prochain__jour-sans-place" role="alert">
        <p>{phrase}</p>
        <div className="trv-prochain__actions">
          {j.suivante && (
            <button type="button" className="trv-prochain__bouton" onClick={() => { const s = j.suivante; if (s) fais({ genre: 'viser', place: { iso: s.iso, heure: s.heure } }); }}>
              {`Prendre le ${jourDit(j.suivante.iso)} à ${heureDuMessage(j.suivante.heure)}`}
            </button>
          )}
          {j.manque !== 'passe' && (
            <button type="button" className="trv-prochain__lien" onClick={() => ouvreLaFenetre({ place: { iso: j.iso, heure: heureDeLaMain } })}>
              {`Le poser quand même le ${jourDit(j.iso)}`}
            </button>
          )}
        </div>
      </div>
    );
  })() : null;

  /* « Dans combien de temps » : six puces, et une date au choix. */
  const lesSemaines = !carte.dejaLa && tarif && placesDesPuces.length > 0 ? (
    <div className="trv-prochain__semaines">
      <span className="trv-prochain__etiquette" id={`trv-dans-combien-${clientId}`}>Dans combien de temps</span>
      <div className="trv-prochain__puces" role="group" aria-labelledby={`trv-dans-combien-${clientId}`}>
        {placesDesPuces.map((x) => (
          <button
            key={x.n}
            type="button"
            className="trv-prochain__puce"
            data-semaines={x.n}
            aria-pressed={puceMontree === x.n}
            disabled={!x.place}
            title={x.place && x.place.iso !== x.vise ? `${x.n} semaines tombent le ${jourDit(x.vise)}, sans place pour sa durée : le ${jourDit(x.place.iso)}.` : undefined}
            onClick={() => vise({ n: x.n })}
          >
            <span>{`${x.n} sem.`}</span>
            <small className={x.n === sonRythme ? 'est-rythme' : undefined}>{`${x.n === sonRythme ? 'son rythme · ' : ''}${morceauDuJour(x.place?.iso ?? x.vise, { day: 'numeric', month: 'short' })}`}</small>
          </button>
        ))}
      </div>
      <label className="trv-prochain__date-libre">
        <span className="trv-prochain__etiquette">Ou choisir une date</span>
        {/* Le champ ne montre que le jour que la carte porte : jamais un jour
            choisi qu'elle n'a pas pris (20 novembre 2026). */}
        <input
          type="date"
          min={demain}
          value={dateLibre && carte.place && !carte.retire && carte.place.iso === dateLibre ? dateLibre : ''}
          onChange={(e) => { const v = e.target.value; setDateLibre(v); if (/^\d{4}-\d{2}-\d{2}$/.test(v)) choisitLeJour(v); }}
        />
      </label>
      {notePuce && <p className="trv-prochain__note">{notePuce}</p>}
      {leJourSansPlace}
    </div>
  ) : null;

  /* « Qui a choisi cette date » : la Maison la suggère, ou elle l'a choisie avec nous. */
  const quiDecide = !carte.dejaLa && carte.place && !carte.retire ? (
    <div className="trv-prochain__qui" role="radiogroup" aria-label="Qui a choisi cette date">
      <label className={`trv-prochain__choix${qui === 'suggere' ? ' is-on' : ''}`}>
        <input type="radio" name={`qui-${clientId}`} value="suggere" checked={qui === 'suggere'} onChange={() => changeQui('suggere')} />
        <span><b>Suggéré par la Maison</b><span>Elle le confirme d’un toucher sur WhatsApp.</span></span>
      </label>
      <label className={`trv-prochain__choix${qui === 'choisi' ? ' is-on' : ''}`}>
        <input type="radio" name={`qui-${clientId}`} value="choisi" checked={qui === 'choisi'} onChange={() => changeQui('choisi')} />
        <span><b>Elle l’a choisi avec nous</b><span>Au comptoir, elle a dit oui : il est confirmé.</span></span>
      </label>
    </div>
  ) : null;

  const gestesDits = (() => {
    /* Le nom court et ses mots en clair (25 novembre 2026), comme le WhatsApp
       que confirmation-rdv envoie : « KLƆKLƆ™ Essentiel (lavage doux) ». */
    const noms = gestesMontres.map((id) => byId.get(id)).filter((s): s is NonNullable<typeof s> => !!s)
      .map((s) => nomEtEnClair(s.name.split(' · ')[0], s.enClair)).filter(Boolean);
    return noms.length > 1 ? `${noms.slice(0, -1).join(', ')} et ${noms[noms.length - 1]}` : noms[0] ?? 'votre rituel';
  })();

  const ceQuElleRecoit = (
    <div className="trv-prochain__message">
      <h4>{qui === 'suggere' && !carte.dejaLa ? 'Ce qu’elle reçoit en fermant' : 'Ce qu’elle reçoit'}</h4>
      <p className="trv-prochain__quand">{message.texte}</p>
      {qui === 'suggere' && !carte.dejaLa && carte.place && !carte.retire && message.genre !== 'sans-numero' && message.genre !== 'sans-modele' && (
        <div className="trv-prochain__wa">
          <div className="trv-prochain__bulle">
            <span>{texteDeLaProposition({ appel: appelDe(fiche), quand: momentDuMessage(carte.place.iso, carte.place.heure), gestes: gestesDits })}</span>
            <span className="trv-prochain__pied-wa"><TexteFon texte={DEVISE_COMPLETE} penche /></span>
            <span className="trv-prochain__boutons-wa"><span>Je confirme</span><span>Un autre moment</span></span>
          </div>
          {nomDuNumero && <p className="trv-prochain__quand">{`Sur le numéro de ${nomDuNumero}.`}</p>}
        </div>
      )}
      {qui !== 'suggere' && message.genre === 'part' && carte.place && carte.rdvId && (
        <div className="trv-prochain__wa">
          <div className="trv-prochain__bulle">
            <span>{texteDeLaConfirmation({ avecLiens: true, prenom: appelDe(fiche), quand: momentDuMessage(carte.place.iso, carte.place.heure), reference: referenceDuRendezVous(carte.rdvId) })}</span>
            <span className="trv-prochain__pied-wa"><TexteFon texte={DEVISE_COMPLETE} penche /></span>
            <span className="trv-prochain__boutons-wa"><span>Déplacer ou annuler</span><span>Ajouter à mon agenda</span></span>
          </div>
          {nomDuNumero && <p className="trv-prochain__quand">{`Sur le numéro de ${nomDuNumero}.`}</p>}
        </div>
      )}
    </div>
  );

  const sansRituel = !imposee && !rituel && !horsDeSesRituels && !carte.dejaLa;
  const corps = sansRituel ? (
    <section className="trv-prochain__carte" aria-label="Son prochain rituel">
      <div className="trv-prochain__haut"><span className="trv-prochain__etiquette">Son prochain rituel</span><span className="trv-prochain__pastille trv-prochain__pastille--vide">À poser</span></div>
      <p className="trv-prochain__date trv-prochain__date--petite">Rien à proposer d’office</p>
      <p className="trv-prochain__pourquoi">Ce rituel ne donne pas de suite à proposer d’ici (une création, ou des gestes hors de la carte) : ses gestes se choisissent dans la fenêtre du rendez-vous.</p>
      <div className="trv-prochain__actions">
        <Button variant="ghost" size="sm" onClick={() => ouvreLaFenetre({})}>Poser son prochain rendez-vous</Button>
      </div>
    </section>
  ) : carte.retire ? (
    <section className="trv-prochain__carte" aria-label="Son prochain rituel">
      <div className="trv-prochain__haut"><span className="trv-prochain__etiquette">Son prochain rituel</span><span className="trv-prochain__pastille trv-prochain__pastille--vide">{pastille.texte}</span></div>
      <p className="trv-prochain__date trv-prochain__date--petite">Pas de prochain rendez-vous</p>
      <p className="trv-prochain__pourquoi">Aucun prochain rendez-vous n’est posé, rien ne part vers elle. Perle le lui proposera avant la date de son rythme.</p>
      <div className="trv-prochain__actions">
        <button type="button" className="trv-prochain__bouton" onClick={() => fais({ genre: 'reposer' })}>En poser un</button>
      </div>
    </section>
  ) : !carte.place ? (
    <section className="trv-prochain__carte" aria-label="Son prochain rituel">
      <div className="trv-prochain__haut"><span className="trv-prochain__etiquette">Son prochain rituel</span><span className="trv-prochain__pastille trv-prochain__pastille--vide">{pastille.texte}</span></div>
      <p className="trv-prochain__date trv-prochain__date--petite">Rien n’est posé d’office</p>
      <p className="trv-prochain__pourquoi">
        {souhait?.du
          ? phraseDuSouhait({ souhait, place: null, jourDit, heureDite: heureDuMessage })
          : `${rituel && rituel.occurrences <= 1 ? 'C’est sa première venue' : 'Son rythme n’est pas encore lisible'} : pas de date en grand. Touchez une place, elle est validée et posée confirmée${maitre ? ` chez ${maitre}` : ''}.`}
      </p>
      {rituels.length > 1 && <LesRituels rituels={rituels} iChoisi={iChoisi} nomDe={nomDe} dit={(i) => [tarifs[i].longueurPertinente ? longueurDite : null, fmtMoney(tarifs[i].prixXof, currency), fmtDureeCourte(tarifs[i].dureeMin)].filter(Boolean).join(' · ')} onChoisir={(i) => { setChoisi(i); setCarte(null); setAutre(false); }} />}
      {lesSemaines}
      {lesPlaces('Trois places proposées')}
      <div className="trv-prochain__actions">
        <button type="button" className="trv-prochain__lien" onClick={() => setAutre((v) => !v)}>{autre ? 'Fermer le calendrier' : 'Une autre date'}</button>
        <button type="button" className="trv-prochain__lien" onClick={() => ouvreLaFenetre({})}>Changer les gestes</button>
      </div>
      {autre && <div className="trv-prochain__modif">{uneAutreDate}</div>}
      {alerte && <p className="trv-prochain__note" role="alert">{alerte}</p>}
    </section>
  ) : (
    <>
      <section className={`trv-prochain__carte${change && carte.valide ? ' est-change' : ''}`} aria-label="Son prochain rituel" data-pastille={pastille.ton}>
        <div className="trv-prochain__haut">
          <span className="trv-prochain__etiquette">Son prochain rituel</span>
          <span className={`trv-prochain__pastille trv-prochain__pastille--${pastille.ton}`}>{pastille.texte}</span>
        </div>
        {lesSemaines}
        <p className="trv-prochain__date">{jourEnLettres(carte.place.iso)}</p>
        <p className="trv-prochain__heure"><b>{heureDuMessage(carte.place.heure)}</b>{` · ${fmtDureeCourte(dureeMontree)}${maitreMontre ? ` · avec ${maitreMontre}` : ''}`}</p>
        {!carte.valide && !carte.dejaLa && rituels.length > 1 && (
          <LesRituels rituels={rituels} iChoisi={iChoisi} nomDe={nomDe} dit={(i) => [tarifs[i].longueurPertinente ? longueurDite : null, fmtMoney(tarifs[i].prixXof, currency), fmtDureeCourte(tarifs[i].dureeMin)].filter(Boolean).join(' · ')} onChoisir={(i) => { setChoisi(i); setCarte(null); setAutre(false); }} />
        )}
        <ul className="trv-prochain__lignes">
          {lignesDesGestes.map((l) => <li key={l.id}>{l.nom}<span>{l.prix}</span></li>)}
          {familleIci > 0 && <li>Remise famille<span>{`−${fmtMoney(familleIci, currency)}`}</span></li>}
          <li className="trv-prochain__total">
            {`${fmtDureeCourte(dureeMontree)}${maitreMontre ? ` avec ${maitreMontre}` : ''}`}
            <span>{fmtMoney(netMontre, currency)}<small>au tarif du jour venu</small></span>
          </li>
        </ul>
        {mercrediIci && (
          <p className="trv-prochain__offre-dite">{`${mercrediIci.phrase} · −${mercrediIci.offre.discountPct ?? 0} %, posée avec ce rendez-vous.`}</p>
        )}
        {raison && <p className="trv-prochain__pourquoi">{raison}</p>}
        {verifie && (
          <p className={`trv-prochain__verifie${verifie.alerte ? ' trv-prochain__verifie--alerte' : ''}`}>
            <span aria-hidden="true">{verifie.alerte ? '!' : '✓'}</span><span>{verifie.texte}</span>
          </p>
        )}
        {quiDecide}
        {!carte.valide && !carte.dejaLa && casAPart(carte.place.iso) && (
          <p className="trv-prochain__note">{`${casAPart(carte.place.iso)}. Valider ouvre sa fiche, posée sur cette place.`}</p>
        )}
        {alerte && <p className="trv-prochain__note" role="alert">{alerte}</p>}
        <div className="trv-prochain__actions">
          {!carte.valide && (
            <button type="button" className="trv-prochain__valider" onClick={() => fais({ genre: 'valider', id: uid() })}>Valider ce rendez-vous</button>
          )}
          {!carte.modif && (
            <button type="button" className="trv-prochain__bouton" onClick={() => fais({ genre: 'modifier' })}>Changer la date ou l’heure</button>
          )}
          <button
            type="button"
            className="trv-prochain__lien"
            onClick={() => (carte.dejaLa && dejaPose ? ouvreLaFenetre({ appt: dejaPose }) : posee ? ouvreLaFenetre({ appt: posee }) : ouvreLaFenetre({ place: carte.place }))}
          >
            Changer les gestes
          </button>
          {change && carte.depart && (
            <button type="button" className="trv-prochain__lien" onClick={() => fais({ genre: 'revenir' })}>
              {`Revenir à la proposition du ${placeCourte(carte.depart)}`}
            </button>
          )}
        </div>
      </section>
      {carte.modif && !carte.dejaLa && (
        <section className="trv-prochain__modif" aria-label="Changer la place">
          <h3>Une autre place</h3>
          <p className="trv-prochain__aide">{`${carte.valide ? 'Un toucher pose la nouvelle place, confirmée, et rend l’ancienne.' : 'Un toucher valide la place choisie : elle est posée confirmée.'} Même maître, mêmes gestes.`}</p>
          {lesPlaces('Trois places proposées')}
          <div className="trv-prochain__actions">
            <button type="button" className="trv-prochain__lien" onClick={() => setAutre((v) => !v)}>{autre ? 'Fermer le calendrier' : 'Une autre date'}</button>
          </div>
          {uneAutreDate}
          <div className="trv-prochain__actions">
            <button type="button" className="trv-prochain__bouton" onClick={() => { fais({ genre: 'garder' }); setAutre(false); }}>Garder ce rendez-vous</button>
          </div>
        </section>
      )}
      {ceQuElleRecoit}
    </>
  );

  const vue = (
    <div className="trv-prochain-carte" data-carte={carte.valide ? 'validee' : carte.dejaLa ? 'deja' : carte.retire ? 'retiree' : carte.place ? 'proposee' : 'a-poser'}>
      {premiereVisite && !carte.dejaLa && (
        <p className="trv-prochain__premiere" role="note"><b>{PREMIERE_VISITE_TITRE}</b><span>{PREMIERE_VISITE_DIT}</span></p>
      )}
      {corps}
      {fenetre && (
        <RdvModal
          title="Son prochain rendez-vous"
          appt={fenetre.appt}
          initial={fenetre.initial}
          onClose={() => {
            setFenetre(null);
            /* Posé dans la fenêtre : la carte le relit et le montre. */
            if (!carteRef.current.valide && !carteRef.current.dejaLa) setCarte(null);
          }}
        />
      )}
    </div>
  );

  const pied = (() => {
    if (carte.pied === 'demande-fin' && carte.place) {
      return (
        <div className="trv-prochain__question" role="group" aria-label="Terminer sans valider">
          <span>{`Le rendez-vous du ${placeCourte(carte.place)} n’est pas validé.`}</span>
          <button type="button" className="trv-prochain__valider" onClick={() => fais({ genre: 'valider-et-terminer', id: uid() })}>Le valider et terminer</button>
          <button type="button" className="trv-prochain__lien" onClick={() => fais({ genre: 'terminer-sans' })}>Terminer sans rendez-vous</button>
        </div>
      );
    }
    if (carte.pied === 'demande-retrait' && carte.place) {
      return (
        <div className="trv-prochain__question" role="group" aria-label="Retirer le rendez-vous">
          <span>{`Retirer le rendez-vous du ${placeCourte(carte.place)} ? Rien ne part vers elle.`}</span>
          <button type="button" className="trv-prochain__rouge" onClick={() => fais({ genre: 'retirer-oui' })}>Retirer</button>
          <button type="button" className="trv-prochain__lien" onClick={() => fais({ genre: 'retirer-non' })}>Le garder</button>
        </div>
      );
    }
    if (carte.valide && carte.place && !carte.retire && !carte.dejaLa) {
      return <button type="button" className="trv-prochain__lien" onClick={() => fais({ genre: 'retirer' })}>Pas de prochain rendez-vous</button>;
    }
    if (carte.place && !carte.retire && !carte.valide) return <p className="trv-prochain__pied-note">Rien n’est posé tant que vous ne le validez pas.</p>;
    return null;
  })();

  /* LA SECONDE ÉTAPE (15 novembre 2026) : « Poser la suggestion » pose la
     place montrée puis ferme ; « Pas de prochain rendez-vous » ferme sans
     rien poser, ou demande le retrait de ce que la carte a posé. */
  const poser = () => {
    if (carte.valide || carte.dejaLa || carte.retire || !carte.place) { terminer(); return; }
    fais({ genre: 'valider-et-terminer', id: uid() });
  };
  const sansSuite = () => {
    if (carte.dejaLa) { terminer(); return; }
    if (carte.valide && !carte.retire) { fais({ genre: 'retirer' }); return; }
    fais({ genre: 'terminer-sans' });
  };
  const question = carte.pied === 'demande-fin' || carte.pied === 'demande-retrait';
  /* LE GESTE PLEIN DIT CE QU'IL POSE (20 novembre 2026) : « Poser le
     rendez-vous · mar. 22 déc. 2026 à 11 h 30 ». La date se lit sur le
     bouton même, au moment de toucher. */
  const libelleDuGeste = carte.dejaLa || carte.retire || !carte.place
    ? (carte.valide && !carte.dejaLa && !carte.retire ? 'Terminer' : 'Fermer')
    : carte.valide ? 'Terminer' : `${qui === 'suggere' ? 'Poser la suggestion' : 'Poser le rendez-vous'} · ${placeCourte(carte.place)}`;
  const dejaLaDit = carte.dejaLa && carte.place ? momentDuMessage(carte.place.iso, carte.place.heure) : null;
  /* L'AGENT VALIDE SEUL, SANS FERMER : la carte reste ouverte, « Annuler »
     (pas de prochain rendez-vous) ne fait rien partir, « Terminer » confirme. */
  const valider = () => { if (carte.place && !carte.valide && !carte.dejaLa && !carte.retire) fais({ genre: 'valider', id: uid() }); };
  const aPoser = !!carte.place && !carte.valide && !carte.dejaLa && !carte.retire && !casAPart(carte.place.iso);

  if (children) return <>{children({ carte: vue, pied, terminer, plein, poser, sansSuite, question, libelleDuGeste, dejaLa: carte.dejaLa, dejaLaDit, valider, aPoser, premiereVisite })}</>;
  return (
    <section className="trv-prochain" aria-label="Son prochain rituel, à la Caisse">
      {vue}
      {pied && <div className="trv-prochain__pied">{pied}</div>}
    </section>
  );
}

/* Ses rituels habituels, quand elle en a plusieurs : avant de valider, on
   choisit lequel elle reprend (la date et les places suivent). */
function LesRituels({ rituels, iChoisi, nomDe, dit, onChoisir }: {
  rituels: readonly { ids: string[] }[];
  iChoisi: number;
  nomDe: (ids: readonly string[]) => string;
  dit: (i: number) => string;
  onChoisir: (i: number) => void;
}) {
  return (
    <div className="trv-prochain__rituels" role="group" aria-label="Quel rituel">
      {rituels.map((r, i) => (
        <button
          key={r.ids.join('|')}
          type="button"
          aria-pressed={i === iChoisi}
          className={`trv-prochain__rituel${i === iChoisi ? ' is-on' : ''}`}
          onClick={() => onChoisir(i)}
        >
          <span className="trv-prochain__rituel-nom">{nomDe(r.ids)}</span>
          <small>{dit(i)}</small>
        </button>
      ))}
    </div>
  );
}

/* ══ APRÈS « HONORÉ » SANS ENCAISSER · 4 novembre 2026 ═══════════════════
   Le Carnet et le tableau de bord ouvrent la même carte, dans sa fenêtre :
   proposée, validée d'un toucher, une confirmation à « Terminer ». */
export function FenetreDuProchainRituel({ rituelId, onClose }: { rituelId: string; onClose: () => void }) {
  const [tous] = useAppointments();
  const [clients] = useClients();
  const rituel = tous.find((a) => a.id === rituelId);
  const fiche = rituel ? clients.find((c) => c.id === rituel.clientId) : undefined;
  if (!rituel || !rituel.clientId) return null;
  return (
    <SonProchainRituel
      clientId={rituel.clientId}
      serviceIds={rituel.serviceIds}
      jour={rituel.date}
      longueur={rituel.longueur ?? fiche?.longueur ?? 'mi-long'}
      rituelId={rituel.id}
      onFerme={onClose}
    >
      {({ carte, pied, terminer, plein }) => (
        <Modal title="Son prochain rituel" onClose={terminer} width={760}>
          <div className="trv-regle trv-regle--seule">
            <p className="trv-regle__qui">{`${fiche?.name ?? rituel.clientName ?? 'Cliente'} · rituel du ${jourDit(rituel.date)} honoré${rituel.master ? ` · avec ${rituel.master}` : ''}`}</p>
            {carte}
            <div className="trv-regle__pied">
              <div className="trv-regle__pied-gauche">{pied}</div>
              <Button variant={plein ? 'copper' : 'ghost'} className="trv-regle__terminer" onClick={terminer}>Terminer</Button>
            </div>
          </div>
        </Modal>
      )}
    </SonProchainRituel>
  );
}
