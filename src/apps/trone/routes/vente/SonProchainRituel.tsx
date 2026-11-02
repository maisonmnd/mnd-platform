/* ══ SON PROCHAIN RITUEL, AU MOMENT OÙ ELLE PAIE — 2 novembre 2026 ══════
   Maquette `public/maquette-remplir-les-fauteuils.html`, « Un · La Caisse »,
   validée par Yéman le 2 novembre 2026. L'écran de réussite de la Caisse ne
   montre plus seulement « Son prochain rendez-vous » (une fiche vide de
   date) : il propose son ou ses rituels habituels, au bon moment de son
   rythme, sur trois places réelles. Un toucher relit la place, puis la pose
   CONFIRMÉE (arbitrage 1) ; la confirmation WhatsApp habituelle part, comme
   depuis « Poser le rendez-vous ».

   Les règles vivent ailleurs, et ne sont pas réécrites ici :
   · le rituel, le rythme et les places : `shared/prochain-rituel-pur.ts`,
     qui lit `sesRituelsPasses`, la Cadence et `propositionsDuRdv` ;
   · le prix et la durée : `tarifsDuRituel`, `brutDuRituel` et
     `personalDurationMin`, ceux de la fenêtre du rendez-vous, avec la
     longueur travaillée ce jour (celle du ticket) ;
   · l'écriture : `poseUnRendezVous` (agenda.ts), le geste de la fenêtre.
   Ce que la fenêtre fait de plus (formule, remise famille, prix à convenir,
   séances incluses, salon privatisé, paliers stricts) ne se refait pas : un
   toucher ouvre alors sa fiche, posée sur la place choisie.

   Cet écran parle à l'équipe : le nom du maître s'y lit, rien ici ne part
   vers la cliente. */
import { useMemo, useState } from 'react';
import { Button } from '../../../../ds/components';
import { maitreParDefaut, useBranch } from '../../../../shared/branches';
import { fmtMoney } from '../../../../shared/currency';
import { estArchivee, fondeLaCouronne, LONGUEURS, suitLongueur, useCategories, useProducts, useServices, type LongueurId } from '../../../../shared/catalog';
import { remiseFamillePct, useClients, useFamilies } from '../../../../shared/clients';
import { appointmentsStore, momentDuRdv, poseUnRendezVous, useAppointments, type Appointment } from '../../../../shared/agenda';
import { blocagesStore, plagesBloquees, useBlocages, type Blocage } from '../../../../shared/blocages';
import { depositForServices, depositPctFor, openingForIso, settingsStore } from '../../../../shared/settings';
import { personalDurationMin, prixFerme, unGesteDansLePanier, useBandSets, useModelBands } from '../../../../shared/pricing';
import { jourFavoriDe, predictNextVisit } from '../../../../shared/cadence';
import { SUCCESSEURS } from '../../../../shared/bascule-de-janvier-pur';
import { numeroAPrevenirDuRdv, numerosDeLaFiche } from '../../../../shared/numero-a-prevenir-pur';
import { avertissementDHabilitation, plusHautDes, type Palier } from '../../../../shared/paliers';
import { sameName } from '../../../../shared/text';
import { uid } from '../../../../shared/store';
import { jourCourtAn, jourEnLettres } from '../../../../shared/calendrier';
import { heureDuMessage } from '../../../../shared/salle-des-envois';
import { contratPourLaDate, usePlans, useStaff, useSubscribers } from '../equipe/data';
import { useOffers } from '../../../../shared/offers';
import { ceQueRetireLeMercredi, ditLaPlusForte, laPlusForteDesDeux, offreDuJourDeLaVenue, poseLOffreDuJour } from '../../../../shared/offres-pur';
import { regimeTarifaire } from '../../../../shared/pricing';
import {
  apptDurationMin, brutDuRituel, fmtDureeCourte, tarifsDuRituel, timeToMin, todayISO, useServicesById, type RdvInitial,
} from '../clients/_shared';
import { heureHabituelle, placesDuJour, type Occupant } from '../clients/rdv-fluide-pur';
import {
  ceQuiDemandeSaFiche, laPlaceTient, leMaitreDuRituel, leRendezVousDuProchainRituel, leRituelDOffice,
  phraseDeLaPose, rythmeDit, sesProchainsRituels, sesTroisPlaces, versDit, type PlaceDuProchainRituel,
} from '../../../../shared/prochain-rituel-pur';

const NOMS_DES_JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
/** « mardi 17 novembre 2026 » : la date se dit avec son année. */
const jourDit = (iso: string) => jourEnLettres(iso).replace(/^./, (c) => c.toLowerCase());

export function SonProchainRituel({ clientId, serviceIds, jour, longueur, onALaMain }: {
  clientId: string;
  /** Les prestations qu'elle vient de régler. */
  serviceIds: readonly string[];
  /** Le jour de la vente (AAAA-MM-JJ). */
  jour: string;
  /** La longueur travaillée ce jour : celle du ticket. */
  longueur: LongueurId;
  /** Ouvre la fenêtre du rendez-vous, posée sur ce qu'on lui passe. */
  onALaMain: (initial: RdvInitial) => void;
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
  const aujourdhui = todayISO();
  const fiche = clients.find((c) => c.id === clientId);

  const siens = useMemo(() => tous.filter((a) => a.clientId === clientId), [tous, clientId]);
  /* Ses venues honorées : celles que lisent son heure et son jour habituels
     dans la fenêtre du rendez-vous (`sesVenues`). */
  const sesVenues = useMemo(() => siens.filter((a) => a.status === 'honoré'), [siens]);
  /* SA CADENCE GÉNÉRALE, CELLE QUE LIT PERLE (assistant-lecture-pur.ts :
     `rythmeJours`) : l'intervalle de `predictNextVisit` sur ses venues
     honorées (un rendez-vous déjà pris ne l'efface pas), sinon le rythme de
     sa fiche. */
  const cadenceJours = useMemo(() => {
    const c = predictNextVisit(sesVenues, clients, clientId, aujourdhui);
    return c.avgDays ?? (fiche?.rythmeSemaines ? fiche.rythmeSemaines * 7 : null);
  }, [sesVenues, clients, clientId, aujourdhui, fiche?.rythmeSemaines]);

  const rituels = useMemo(() => sesProchainsRituels({
    rdvs: siens,
    clientId,
    aujourdhui,
    proposable: (id) => { const sv = byId.get(id); return !!sv && !estArchivee(sv); },
    successeur: (id) => SUCCESSEURS[id],
    estCreation: (id) => { const sv = byId.get(id); return !!sv && fondeLaCouronne(sv); },
    payeAujourdhui: { date: jour, serviceIds },
    cadenceJours,
  }), [siens, clientId, aujourdhui, byId, jour, serviceIds, cadenceJours]);

  const [choisi, setChoisi] = useState<number | null>(null);
  const [ferme, setFerme] = useState(false);
  const [quandMeme, setQuandMeme] = useState(false);
  const [issue, setIssue] = useState<{ pose: boolean; texte: string; detail: string; prixXof?: number; offre?: string } | null>(null);
  const iChoisi = choisi !== null && choisi < rituels.length ? choisi : leRituelDOffice(rituels);
  const rituel = iChoisi >= 0 ? rituels[iChoisi] : undefined;

  /* LE TARIF D'UN RITUEL, COMME LA FENÊTRE DU RENDEZ-VOUS : son contexte
     (`tarifsDuRituel`, sa tête et la longueur du jour), son brut
     (`brutDuRituel`), sa durée (`personalDurationMin`, jamais moins de
     15 minutes), l'acompte des Paramètres, et la remise famille que la
     fenêtre poserait d'office (elle renvoie à la fiche). */
  const tarifDe = (ids: readonly string[]) => {
    const t = tarifsDuRituel({ serviceIds: [...ids], longueur }, {
      client: fiche, bands, sets, cats, byId, tousServices: services, produits,
    });
    const prixXof = brutDuRituel({ serviceIds: [...ids] }, byId, t);
    const famille = fiche?.familyId ? families.find((f) => f.id === fiche.familyId) : undefined;
    const famPct = unGesteDansLePanier(t.chosen, t.pricing) ? 0 : remiseFamillePct(famille, clients, aujourdhui);
    /* La part hors forfaits, comme la fenêtre fige la remise famille. */
    const forfaits = t.chosen.filter((sv) => regimeTarifaire(sv, cats).k === 'forfait').reduce((n, sv) => n + Math.round(t.prixPlein(sv) * (1 - t.gesteDe(sv) / 100)), 0);
    return {
      t,
      chosen: t.chosen,
      prixXof,
      /* Ce que la remise famille retirerait, en francs (la plus forte des deux). */
      familleXof: famPct > 0 ? Math.round(Math.max(0, prixXof - forfaits) * (famPct / 100)) : 0,
      dureeMin: Math.max(15, t.chosen.reduce((n, sv) => n + personalDurationMin(sv, t.pricing), 0) || 60),
      depositServiceIds: t.chosen.filter((s) => depositPctFor(s.id) > 0).map((s) => s.id),
      depositXof: Math.min(depositForServices(t.chosen, 0), prixXof),
      longueurPertinente: t.chosen.some(suitLongueur),
      prixLibre: t.chosen.some((sv) => !prixFerme(sv, t.pricing)),
      famPct,
    };
  };
  const tarifs = rituels.map((r) => tarifDe(r.ids));
  const tarif = iChoisi >= 0 ? tarifs[iChoisi] : undefined;
  const maitre = rituel && tarif
    ? leMaitreDuRituel({ habituel: rituel.maitre, noms: tarif.chosen.map((sv) => sv.name), maitres: branch.masters, parDefaut: maitreParDefaut(branch) })
    : '';

  /* LES PLACES D'UN JOUR, comme la fenêtre du rendez-vous (`placesDe`) : tout
     rendez-vous non annulé de la branche occupe un fauteuil pour sa durée,
     les murs posés pour son maître se respectent, l'ouverture du jour fait
     foi (jours fermés et exceptions d'horaires). Le carnet et les murs sont
     passés en argument : au toucher, on relit ceux du moment. */
  const sieges = Math.max(0, branch.seats ?? 0);
  const placesDe = (carnet: readonly Appointment[], murs: Blocage[], dureeMin: number, qui: string) => (iso: string) => {
    const m = new Date();
    const occupes: Occupant[] = carnet
      .filter((a) => a.branchId === branch.id && a.date === iso && a.status !== 'annulé')
      .map((a) => ({ maitre: a.master, debutMin: timeToMin(a.time), dureeMin: apptDurationMin(a, byId) }));
    return placesDuJour({
      iso,
      aujourdhui,
      maintenantMin: m.getHours() * 60 + m.getMinutes(),
      ouverture: openingForIso(iso),
      durationMin: dureeMin,
      occupes,
      bloques: plagesBloquees(murs, branch.id, iso, qui),
      sieges,
    });
  };
  const places = useMemo(() => {
    if (!rituel || !tarif) return [];
    const duJour = placesDe(tous, blocages, tarif.dureeMin, maitre);
    return sesTroisPlaces({
      vers: rituel.vers,
      aujourdhui,
      placesDe: (iso) => { const p = duJour(iso); return { ferme: p.ferme, heures: p.heures }; },
      heureHabituelle: heureHabituelle(sesVenues),
      jourHabituel: jourFavoriDe(sesVenues, clientId, aujourdhui)?.jour ?? null,
      jourDit,
      nomDuJour: (j) => NOMS_DES_JOURS[j],
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rituel?.vers, tarif?.dureeMin, maitre, tous, blocages, sesVenues, clientId, aujourdhui, sieges, branch.id, byId]);

  /* CE QUI DEMANDE SA FICHE : les gestes de la fenêtre que la Caisse ne
     refait pas. La formule se juge à la date de la place. */
  const casAPart = (iso: string): string | null => {
    if (!tarif) return null;
    const acte = tarif.chosen.reduce<Palier | null>((p, sv) => plusHautDes(p, sv.palier), null);
    const mains = equipe.filter((m) => sameName(m.name, maitre)).map((m) => ({ nom: m.name, palier: m.palier ?? null }));
    return ceQuiDemandeSaFiche({
      formule: !!contratPourLaDate(subs, clientId, iso, plans),
      remiseFamillePct: tarif.famPct,
      prixLibre: tarif.prixLibre,
      seancesIncluses: tarif.chosen.some((sv) => (sv.includes ?? []).some((i) => (i.afterWeeks ?? 0) > 0)),
      salonPrive: tarif.chosen.some((sv) => !!sv.privatise),
      paliersStricts: !!settingsStore.get().paliersStrict && !!avertissementDHabilitation({ acte, mains }),
    });
  };
  const raison = rituel ? casAPart(rituel.vers) : null;

  /* ══ LE MERCREDI DE LA MAISON SUR UNE PLACE — 2 novembre 2026 ══════════
     Une place un mercredi, dans la saison de l'offre, sur un rituel qu'elle
     couvre : son prix est celui du mercredi (−15 %, net au millier), la place
     le dit, et le toucher pose `codeOffre`, `offreId` et ses remises de
     ligne, le prix figé au net arrondi, comme la fenêtre du rendez-vous. Rien
     pour une formule à cette date. LA PLUS FORTE DES DEUX : une remise
     famille plus forte (ou égale) l'emporte, la place garde son prix, et le
     toucher ouvre la fiche, où la fenêtre fait le même choix. */
  const leMercrediDeLaPlace = (iso: string) => {
    if (!rituel || !tarif) return null;
    const offre = offreDuJourDeLaVenue(offres, {
      branchId: branch.id, dateIso: iso, serviceIds: rituel.ids,
      couvertParAbonnement: !!contratPourLaDate(subs, clientId, iso, plans),
    });
    const pose = poseLOffreDuJour(offre, rituel.ids.map((id) => {
      const sv = byId.get(id);
      const p = sv ? Math.round(tarif.t.prixPlein(sv) * (1 - tarif.t.gesteDe(sv) / 100)) : 0;
      return { id, prixXof: p, ferme: !!sv && p > 0 && prixFerme(sv, tarif.t.pricing) };
    }));
    if (!offre || !pose) return null;
    const du = ceQueRetireLeMercredi({
      sansLuiXof: tarif.prixXof,
      avecLuiXof: brutDuRituel({ serviceIds: [...rituel.ids], remisesLignes: pose.remisesLignes }, byId, tarif.t),
      brutNuXof: tarif.prixXof,
      arrondir: !tarif.prixLibre,
    });
    if (du.mercrediXof <= 0) return null;
    const duel = tarif.familleXof > 0 ? laPlusForteDesDeux({ familleXof: tarif.familleXof, mercrediXof: du.mercrediXof }) : null;
    if (duel?.retenue === 'famille') return null;
    return { offre, pose, netXof: du.netXof, mercrediXof: du.mercrediXof, phrase: duel ? ditLaPlusForte(duel, offre.title) : null };
  };

  /* UN TOUCHER : la place se relit sur le carnet du moment, puis le rendez-vous
     se construit (UNE fonction, `leRendezVousDuProchainRituel`) et s'écrit
     par le geste de la fenêtre. */
  const toucheLaPlace = (p: PlaceDuProchainRituel) => {
    if (!rituel || !tarif) return;
    if (casAPart(p.iso)) {
      onALaMain({ clientId, serviceIds: rituel.ids, date: p.iso, time: p.heure, master: maitre });
      return;
    }
    const fraiches = placesDe(appointmentsStore.get(), blocagesStore.get(), tarif.dureeMin, maitre)(p.iso);
    if (!laPlaceTient(fraiches, p.heure)) {
      setIssue({ pose: false, texte: `La place du ${jourDit(p.iso)} à ${heureDuMessage(p.heure)} vient de partir.`, detail: 'Les places sont relues : touchez-en une autre.' });
      return;
    }
    const numero = numeroAPrevenirDuRdv({ choisi: '', fiche, derniers: siens.filter((a) => a.branchId === branch.id) });
    /* Le mercredi de la Maison, relu pour CETTE place (2 novembre 2026). */
    const mercredi = leMercrediDeLaPlace(p.iso);
    const rdv = leRendezVousDuProchainRituel({
      id: uid(),
      branchId: branch.id,
      clientId,
      serviceIds: rituel.ids,
      place: { iso: p.iso, heure: p.heure },
      master: maitre,
      longueur: tarif.longueurPertinente ? longueur : undefined,
      dureeMin: tarif.dureeMin,
      priceXof: mercredi ? mercredi.netXof : tarif.prixXof,
      depositServiceIds: tarif.depositServiceIds,
      depositXof: mercredi ? Math.min(tarif.depositXof, mercredi.netXof) : tarif.depositXof,
      offreDuJour: mercredi?.pose ?? null,
      numeroAPrevenir: numero,
    });
    const pose = poseUnRendezVous(rdv);
    const nom = numerosDeLaFiche(fiche).find((n) => n.numero === numero)?.nom;
    /* Ce qui part vers elle, dit comme l'écran « posé » de la fenêtre. */
    setIssue({
      pose: true,
      texte: phraseDeLaPose(pose.date, pose.time),
      detail: momentDuRdv(pose) <= Date.now()
        ? 'Posé après son heure : ni confirmation ni rappel ne partiront.'
        : `La confirmation part sur WhatsApp${nom ? `, à ${nom}` : ''} ; la veille, son rappel suit.`,
      prixXof: rdv.priceXof,
      ...(mercredi ? { offre: `${mercredi.offre.title} : code ${mercredi.pose.codeOffre} posé sur le rendez-vous.` } : {}),
    });
  };

  /* Rien d'habituel à lui proposer (une première venue, une création) : la
     fenêtre du rendez-vous, comme avant. */
  if (!rituel || !tarif) {
    return (
      <div className="trv-prochain__gestes">
        <Button variant="ghost" onClick={() => onALaMain({ clientId, serviceIds: [...serviceIds] })}>Son prochain rendez-vous</Button>
      </div>
    );
  }

  const nomDe = (ids: readonly string[]) => ids.map((id) => byId.get(id)?.name.split(' · ')[0]).filter(Boolean).join(' + ');
  const longueurDite = LONGUEURS.find((l) => l.id === longueur)?.label ?? longueur;
  const mesures = rituels.filter((r) => r.source === 'rituel');
  /* Son prochain rendez-vous déjà posé (après aujourd'hui) se dit d'abord :
     on n'en pose pas un second sans le vouloir. */
  const dejaPose = siens
    .filter((a) => a.branchId === branch.id && a.status !== 'annulé' && a.status !== 'honoré' && a.date > aujourdhui)
    .sort((a, b) => a.date.localeCompare(b.date) || timeToMin(a.time) - timeToMin(b.time))[0];

  return (
    <section className="trv-prochain" aria-label="Son prochain rituel">
      <span className="trv-prochain__etiquette">Son prochain rituel</span>
      {issue?.pose ? (
        <div className="trv-prochain__issue" role="status">
          <b>{issue.texte}</b>
          <span>{[nomDe(rituel.ids), maitre ? `avec ${maitre}` : null, fmtDureeCourte(tarif.dureeMin), fmtMoney(issue.prixXof ?? tarif.prixXof, currency)].filter(Boolean).join(' · ')}</span>
          {issue.offre && <span className="trv-prochain__offre">{issue.offre}</span>}
          <span>{issue.detail}</span>
        </div>
      ) : ferme ? (
        <p className="trv-prochain__doux">Rien de posé. Perle le lui proposera avant sa date de cadence.</p>
      ) : dejaPose && !quandMeme ? (
        <>
          <p className="trv-prochain__doux">
            {`Elle a déjà son prochain rendez-vous : ${jourDit(dejaPose.date)} à ${heureDuMessage(dejaPose.time)}${nomDe(dejaPose.serviceIds) ? ` (${nomDe(dejaPose.serviceIds)})` : ''}.`}
          </p>
          <div className="trv-prochain__gestes">
            <Button variant="ghost" size="sm" onClick={() => setQuandMeme(true)}>En poser un autre</Button>
          </div>
        </>
      ) : (
        <>
          {mesures.length > 0 && (
            <p className="trv-prochain__doux">
              {`Son rythme, lu sur ses venues : ${mesures.map((r) => `${nomDe(r.ids)} ${rythmeDit(r.rythmeJours)}`).join(', ')}.`}
            </p>
          )}
          <div className="trv-prochain__rituels" role="group" aria-label="Quel rituel">
            {rituels.map((r, i) => (
              <button
                key={r.ids.join('|')}
                type="button"
                aria-pressed={i === iChoisi}
                className={`trv-prochain__rituel${i === iChoisi ? ' is-on' : ''}`}
                onClick={() => { setChoisi(i); setIssue(null); }}
              >
                <span className="trv-prochain__rituel-nom">{nomDe(r.ids)}</span>
                <small>
                  {[tarifs[i].longueurPertinente ? longueurDite : null, fmtMoney(tarifs[i].prixXof, currency), fmtDureeCourte(tarifs[i].dureeMin)].filter(Boolean).join(' · ')}
                </small>
              </button>
            ))}
          </div>
          <p className="trv-prochain__doux">{versDit(rituel, aujourdhui, jourDit)}</p>
          {raison && <p className="trv-prochain__note">{`${raison}. Un toucher sur une place ouvre sa fiche, posée sur cette place.`}</p>}
          {places.length > 0 ? (
            <div className="trv-prochain__places">
              {places.map((p) => {
                /* LE PRIX DE CETTE PLACE : celui du mercredi quand il la couvre. */
                const mercredi = leMercrediDeLaPlace(p.iso);
                return (
                  <button key={`${p.iso}-${p.heure}`} type="button" className={`trv-prochain__place${mercredi ? ' est-offre' : ''}`} data-iso={p.iso} data-heure={p.heure} onClick={() => toucheLaPlace(p)}>
                    <span className="trv-prochain__place-titre">{p.titre}</span>
                    <span className="trv-prochain__place-date">{`${jourCourtAn(p.iso)} · ${heureDuMessage(p.heure)}`}</span>
                    <span className="trv-prochain__place-prix">{fmtMoney(mercredi ? mercredi.netXof : tarif.prixXof, currency)}</span>
                    {mercredi && (
                      <span className="trv-prochain__place-offre">
                        {`${mercredi.offre.title} · −${mercredi.offre.discountPct ?? 0} %`}{mercredi.phrase ? ` · ${mercredi.phrase}` : ''}
                      </span>
                    )}
                    <span className="trv-prochain__place-pourquoi">{[p.pourquoi, maitre ? `Avec ${maitre}.` : null].filter(Boolean).join(' ')}</span>
                  </button>
                );
              })}
            </div>
          ) : (
            <p className="trv-prochain__note">{`Aucune place libre pour ${fmtDureeCourte(tarif.dureeMin)} autour de cette date : choisissez à la main.`}</p>
          )}
          {issue && !issue.pose && <p className="trv-prochain__note" role="alert">{`${issue.texte} ${issue.detail}`}</p>}
          <div className="trv-prochain__gestes">
            <Button variant="ghost" size="sm" onClick={() => setFerme(true)}>Pas maintenant</Button>
            <Button variant="ghost" size="sm" onClick={() => onALaMain({ clientId, serviceIds: rituel.ids })}>Choisir à la main</Button>
          </div>
        </>
      )}
    </section>
  );
}
