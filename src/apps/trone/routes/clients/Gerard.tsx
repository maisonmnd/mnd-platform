import { useMemo, useState } from 'react';
import { useBranch } from '../../../../shared/branches';
import { useStaff } from '../../../../shared/auth';
import { useSettings, openingForIso } from '../../../../shared/settings';
import { apptPaidXof } from '../../../../shared/agenda';
import { useInvoices } from '../../../../shared/finance';
import { predictNextVisit } from '../../../../shared/cadence';
import { aDefaitSesLocks, estDePassage, estDiaspora } from '../../../../shared/clients';
import { appelDe } from '../../../../shared/civilite';
import { DEVISE_COMPLETE } from '../../../../shared/identite';
import { aAccepteLesNouvelles } from '../../../../shared/audiences-pur';
import { useSignalements } from '../../../../shared/entre-deux';
import { useBlocages, plagesBloquees } from '../../../../shared/blocages';
import { GESTES_EN_FRANCAIS, litLaMarqueWa } from '../../../../shared/gestes-en-francais';
import { estUneVenue } from '../../../../shared/previsions-pur';
import { rdvParJour, reperesDe, reperesParJour } from '../../../../shared/objectifs-des-fauteuils-pur';
import {
  ENVIE_DITE, GENRE_DIT, MODELES_DE_GERARD, REMISES_PAR_SEMAINE, REMISE_ANNIV_PCT, REMISE_CREUX_PCT, REPONSE_FRANCHE, SIGNATURE,
  familleDuNom, filDeLaCliente, joursCreux, jourDit, planDuJour,
  type ContexteDeGerard, type FamilleDeSoin, type FicheDeGerard, type Place, type Situation,
} from '../../../../shared/gerard-pur';
import { ESSAI_MAX, basculeDansLEssai, changeLeMode, reglagesLus, useReglagesDeGerard, type ModeDeGerard } from '../../../../shared/gerard';
import { deuxPlaces } from '../../../../shared/processus-pur';
import { useAbonnesAuxNotifications } from '../equipe/useAudiences';
import { placesDuJour } from './rdv-fluide-pur';
import { addDaysISO, apptDurationMin, timeToMin, todayISO, useBranchAppointments, useBranchClients, useServicesById } from './_shared';
import { PageHead } from '../_ui';
import './gerard.css';

/* ══ GÉRARD — 26 octobre 2026, lot 1 ═════════════════════════════════════
   Maquette 4bPVFik1ABh3TRFZ5XbHiG, « construis » : le cerveau
   (`shared/gerard-pur.ts`) et sa rubrique. Chaque matin, une chose au plus
   par cliente : garder son RDV, son anniversaire, tout combiner, une envie
   du fil, un jour creux, Noël, ou une relance. Cet écran montre le plan du
   jour, le fil de chaque cliente, les jours creux, les réglages de l'essai
   et les modèles à déposer chez Meta.

   IL N'ÉCRIT PAS ENCORE. Sa fonction au serveur (lot 2) déposera le plan
   dans la salle d'attente des envois et fabriquera les codes ; Claude lira
   les réponses (lot 3). D'ici là, le plan est ce que Gérard écrirait. */

const NOM_DE_LA_FAMILLE: Record<FamilleDeSoin, string> = {
  resserrage: 'resserrage des racines', couleur: 'couleur végétale', hydratation: 'soin hydratant',
  lavage: 'lavage rituel', coiffure: 'coiffure', autre: 'soin',
};
const MODES: { v: ModeDeGerard; titre: string; dit: string }[] = [
  { v: 'eteint', titre: 'Éteint', dit: 'Il prépare son plan, il n’écrit à personne.' },
  { v: 'essai', titre: 'Essai', dit: `Deux semaines : il n’écrit qu’aux ${ESSAI_MAX} clientes de l’essai ; chaque échange se relit le soir.` },
  { v: 'ouvert', titre: 'Ouvert', dit: 'Il écrit et répond seul à toutes, avec son compte rendu chaque soir.' },
];

/** LES FICHES QUE GÉRARD LIT, et ce dont il a besoin autour d'elles. */
function useCerveauDeGerard(): { fiches: FicheDeGerard[]; ctx: ContexteDeGerard; nomDe: (id: string) => string } {
  const { branch } = useBranch();
  const appts = useBranchAppointments();
  const clients = useBranchClients();
  const byId = useServicesById();
  const signalements = useSignalements();
  const abonnes = useAbonnesAuxNotifications();
  const [pieces] = useInvoices();
  const [blocages] = useBlocages();
  const [reglages] = useSettings();
  const today = todayISO();

  return useMemo(() => {
    const factures = new Set(pieces.filter((p) => p.apptId && p.kind === 'facture').map((p) => p.apptId as string));
    const parCliente = new Map<string, typeof appts>();
    for (const a of appts) { const l = parCliente.get(a.clientId); if (l) l.push(a); else parCliente.set(a.clientId, [a]); }
    const nomDuService = (id: string) => byId.get(id)?.name ?? '';
    const ilYA60 = addDaysISO(today, -60);

    const fiches: FicheDeGerard[] = clients.map((c) => {
      const siens = parCliente.get(c.id) ?? [];
      const rdvs = siens.map((a) => ({
        id: a.id, date: a.date, time: a.time, status: a.status, creeLe: a.creeLe,
        familles: (a.serviceIds ?? []).map((id) => familleDuNom(nomDuService(id))),
        venu: estUneVenue({ date: a.date, status: a.status, encaisse: apptPaidXof(a) > 0, facture: !!a.invoiceId || factures.has(a.id) }, today),
      }));
      const cad = siens.length ? predictNextVisit(siens, [c], c.id, today) : null;
      /* Le nom de son soin habituel : celui de sa dernière venue, en français. */
      const derniere = siens.filter((a) => a.status === 'honoré').sort((x, y) => x.date.localeCompare(y.date)).pop();
      const premierNom = derniere ? nomDuService(derniere.serviceIds?.[0] ?? '') : '';
      const geste = GESTES_EN_FRANCAIS[litLaMarqueWa(premierNom).marque];
      const soinDit = geste ? geste.long.toLowerCase() : NOM_DE_LA_FAMILLE[familleDuNom(premierNom)];
      return {
        id: c.id,
        appel: appelDe(c),
        soinDit,
        birthday: c.birthday,
        birthdayGiftAt: c.birthdayGiftAt,
        accord: aAccepteLesNouvelles(c),
        stop: c.nouvelles?.par === 'stop' && c.nouvelles?.oui === false,
        couronne: abonnes.has(c.id),
        telephone: (c.phone ?? '').replace(/\D/g, '').length >= 8,
        ecartee: estDePassage(c) || estDiaspora(c) || aDefaitSesLocks(c) || !!c.archived,
        soucis: signalements.filter((s) => s.clientId === c.id && (s.quand ?? '') >= ilYA60).flatMap((s) => s.soucis ?? []),
        rdvs,
        /* Le journal de Gérard s'écrira au lot 2 (sa fonction au serveur). */
        traces: [],
        /* La date ATTENDUE : pour une cliente en retard, la Cadence reporte
           sa date au cycle suivant ; Gérard lit la date manquée. */
        cadence: {
          iso: cad?.predicted ? (cad.overdueDays > 0 ? addDaysISO(today, -cad.overdueDays) : cad.iso) : null,
          rythmeJours: cad?.avgDays ?? (c.rythmeSemaines ? c.rythmeSemaines * 7 : null),
        },
      };
    });

    /* Les jours creux : posés contre l'ordinaire de ce jour de la semaine. */
    const ouvertLe = (j: string) => !openingForIso(j).closed;
    const parJour = rdvParJour(appts.map((a) => ({ date: a.date, status: a.status })));
    const reperes = reperesParJour({ parJour, aujourdhui: today, ouvertLe });
    const creux = joursCreux({ aujourdhui: today, parJour, ordinaireDe: (j) => reperesDe(reperes, j).ordinaire, ouvertLe, remisesRestantes: REMISES_PAR_SEMAINE });

    /* Deux places pour elle : la durée et le maître de son dernier rituel. */
    const sieges = Math.max(0, branch.seats ?? 0);
    const occupesDu = (iso: string) => appts.filter((a) => a.date === iso && a.status !== 'annulé')
      .map((a) => ({ maitre: a.master, debutMin: timeToMin(a.time), dureeMin: apptDurationMin(a, byId) }));
    const cache = new Map<string, Place[]>();
    const placesDe = (clientId: string, jour?: string): Place[] => {
      const dernier = (parCliente.get(clientId) ?? []).filter((a) => a.status === 'honoré').sort((x, y) => x.date.localeCompare(y.date)).pop();
      const duree = dernier ? Math.max(30, apptDurationMin(dernier, byId)) : 120;
      const maitre = dernier?.master || 'Team';
      const cle = `${duree}|${maitre}|${jour ?? '7'}`;
      if (!cache.has(cle)) {
        const jours = jour ? [jour] : [1, 2, 3, 4, 5, 6, 7].map((k) => addDaysISO(today, k));
        cache.set(cle, deuxPlaces(jours.map((iso) => placesDuJour({
          iso, aujourdhui: today, maintenantMin: 0, ouverture: openingForIso(iso), durationMin: duree,
          occupes: occupesDu(iso), bloques: plagesBloquees(blocages, branch.id, iso, maitre), sieges,
        }))));
      }
      return cache.get(cle)!;
    };

    const noms = new Map(clients.map((c) => [c.id, c.name]));
    return { fiches, ctx: { aujourdhui: today, creux, remisesRestantes: REMISES_PAR_SEMAINE, placesDe }, nomDe: (id: string) => noms.get(id) ?? '' };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appts, clients, byId, signalements, abonnes, pieces, blocages, branch.id, branch.seats, today, reglages]);
}

/** Le pied de page des modèles : la devise seule (règle du 13 octobre 2026). */
const piedDeGerard = DEVISE_COMPLETE;
const canalDit = (c: Situation['canal']) => (c === 'couronne' ? 'Ma Couronne' : 'WhatsApp');
const codeDit = (s: Situation) => (s.code ? `−${s.code.pct} % · ${s.code.mot === 'CREUX' ? 'jour creux' : 'anniversaire'}` : '');

/** Le fil d'une cliente, en ruban : ce que le Trône écrit déjà, ce que Gérard ajoute. */
function LeFil({ fiche, aujourdhui }: { fiche: FicheDeGerard; aujourdhui: string }) {
  const points = filDeLaCliente(fiche, aujourdhui);
  if (points.length === 0) return <p className="trc-ger__doux">Pas de fil : il faut une dernière venue et une date de cadence.</p>;
  const fin = points[points.length - 1].jour || 1;
  return (
    <div className="trc-ger__ruban" role="img" aria-label="Son fil, de sa dernière venue à sa date de cadence">
      <div className="trc-ger__piste">
        <div className="trc-ger__trait" />
        {points.map((p, i) => (
          <div key={`${p.iso}-${i}`} className={`trc-ger__noeud${p.existant ? ' est-existant' : ' est-gerard'}${p.iso === aujourdhui ? ' est-aujourdhui' : ''}${i % 3 === 1 ? ' en-haut' : i % 3 === 2 ? ' en-bas' : ''}`}
            style={{ left: `${5 + 90 * p.jour / fin}%` }}>
            <i />
            <small><b>{p.quoi}</b>{jourDit(p.iso).replace(/^\S+ /, '')}</small>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Gerard() {
  const moi = useStaff();
  const direction = moi?.role === 'souverain' || moi?.role === 'gerant';
  const [brut] = useReglagesDeGerard();
  const reglages = reglagesLus(brut);
  const { fiches, ctx, nomDe } = useCerveauDeGerard();
  const plan = useMemo(() => planDuJour(fiches, ctx), [fiches, ctx]);
  const ficheDe = useMemo(() => new Map(fiches.map((f) => [f.id, f])), [fiches]);
  const [vue, setVue] = useState<'tout' | 'essai'>('tout');
  const [ouverte, setOuverte] = useState<string | null>(null);
  const [copie, setCopie] = useState<string | null>(null);

  const montres = vue === 'essai' ? plan.filter((s) => reglages.essai.includes(s.clientId)) : plan;
  const garder = plan.filter((s) => s.genre === 'garder').length;
  const remises = plan.filter((s) => s.genre === 'creux').length;
  const dansLeFil = fiches.filter((f) => filDeLaCliente(f, ctx.aujourdhui).length > 0).length;
  const parGenre = plan.reduce<Record<string, number>>((m, s) => ({ ...m, [s.genre]: (m[s.genre] ?? 0) + 1 }), {});

  const copier = (cle: string, texte: string) => {
    void navigator.clipboard?.writeText(texte).then(() => setCopie(cle), () => setCopie(null));
  };

  return (
    <div className="trc-ger">
      <PageHead
        eyebrow="Clientèle · Gérard"
        title="Gérard."
        actions={(
          <div className="trc-ger__chiffres">
            <span className="trc-ger__chiffre"><b>{plan.length}</b><small>à écrire aujourd’hui</small></span>
            <span className="trc-ger__chiffre"><b>{garder}</b><small>RDV à garder</small></span>
            <span className="trc-ger__chiffre"><b>{remises} / {REMISES_PAR_SEMAINE}</b><small>remises de jour creux</small></span>
            <span className="trc-ger__chiffre"><b>{dansLeFil}</b><small>clientes dans leur fil</small></span>
          </div>
        )}
      />

      <div className="trc-ger__etat" role="note">
        <b>{MODES.find((m) => m.v === reglages.mode)?.titre}.</b>
        <span>Gérard n’écrit pas encore : sa fonction au serveur et ses modèles chez Meta ne sont pas posés. Ce plan est ce qu’il écrirait aujourd’hui.</span>
      </div>

      <section className="trc-ger__carte">
        <div className="trc-ger__haut">
          <h3>Le plan du jour <span>une chose au plus par cliente</span></h3>
          <div className="trc-ger__onglets" role="tablist">
            <button type="button" role="tab" aria-selected={vue === 'tout'} className={vue === 'tout' ? 'est-choisi' : ''} onClick={() => setVue('tout')}>Toutes · {plan.length}</button>
            <button type="button" role="tab" aria-selected={vue === 'essai'} className={vue === 'essai' ? 'est-choisi' : ''} onClick={() => setVue('essai')}>L’essai · {plan.filter((s) => reglages.essai.includes(s.clientId)).length}</button>
          </div>
        </div>
        {Object.keys(parGenre).length > 0 && (
          <p className="trc-ger__doux">{Object.entries(parGenre).map(([g, n]) => `${GENRE_DIT[g as Situation['genre']]} ${n}`).join(' · ')}</p>
        )}
        {montres.length === 0 && <p className="trc-ger__vide">{vue === 'essai' ? 'Aucune cliente de l’essai n’a de message aujourd’hui.' : 'Personne à qui écrire aujourd’hui : chaque cliente est entre deux messages.'}</p>}
        <ul className="trc-ger__liste">
          {montres.map((s) => {
            const f = ficheDe.get(s.clientId);
            const ouvert = ouverte === s.clientId;
            const modele = MODELES_DE_GERARD[s.modele];
            const dansLEssai = reglages.essai.includes(s.clientId);
            return (
              <li key={s.clientId} className={`trc-ger__rangee${ouvert ? ' est-ouverte' : ''}`}>
                <button type="button" className="trc-ger__ligne" aria-expanded={ouvert} onClick={() => setOuverte(ouvert ? null : s.clientId)}>
                  <span className="trc-ger__qui">{nomDe(s.clientId)}{dansLEssai && <em>essai</em>}</span>
                  <span className={`trc-ger__genre trc-ger__genre--${s.genre}`}>{GENRE_DIT[s.genre]}{s.envie ? ` · ${ENVIE_DITE[s.envie]}` : ''}</span>
                  <span className="trc-ger__canal">{canalDit(s.canal)}{s.code ? ` · ${codeDit(s)}` : ''}</span>
                </button>
                {ouvert && f && (
                  <div className="trc-ger__panneau">
                    <div className="trc-ger__message">
                      <div className="trc-ger__bulle">
                        <span className="trc-ger__texte">{s.texte}</span>
                        {modele.boutons.length > 0 && <span className="trc-ger__boutons">{modele.boutons.map((b) => <i key={b}>{b}</i>)}</span>}
                        <span className="trc-ger__pied">{piedDeGerard}</span>
                      </div>
                      <small className="trc-ger__doux">Modèle {modele.nom} · {modele.categorie === 'UTILITY' ? 'utilitaire' : 'marketing'} · {canalDit(s.canal)}</small>
                      {direction && (
                        <button type="button" className="trc-ger__btn" onClick={() => basculeDansLEssai(s.clientId, moi?.name ?? 'La direction')}>
                          {dansLEssai ? 'Retirer de l’essai' : reglages.essai.length >= ESSAI_MAX ? `L’essai est plein (${ESSAI_MAX})` : 'Mettre dans l’essai'}
                        </button>
                      )}
                    </div>
                    <div className="trc-ger__pourquoi">
                      <table>
                        <thead><tr><th>Pourquoi il lui écrit</th><th className="d">Lu sur sa fiche</th></tr></thead>
                        <tbody>{s.pourquoi.map(([k, v]) => <tr key={k}><td>{k}</td><td className="d">{v}</td></tr>)}</tbody>
                      </table>
                      <LeFil fiche={f} aujourdhui={ctx.aujourdhui} />
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      <section className="trc-ger__deux">
        <div className="trc-ger__carte">
          <h3>Les jours creux <span>de 3 à 7 jours</span></h3>
          <p className="trc-ger__doux">Un jour est creux quand ses RDV posés sont sous l’ordinaire de ce jour de la semaine (les Prévisions). Gérard y ouvre autant de remises de {REMISE_CREUX_PCT} % qu’il manque de RDV, {REMISES_PAR_SEMAINE} par semaine au plus, d’abord aux clientes en retard.</p>
          <div className="mnd-scroll-x">
            <table>
              <thead><tr><th>Jour</th><th className="d">Posés</th><th className="d">Ordinaire</th><th className="d">Manque</th><th className="d">Remises</th></tr></thead>
              <tbody>
                {ctx.creux.length === 0 && <tr><td colSpan={5} className="trc-ger__doux">Aucun jour creux dans la semaine qui vient.</td></tr>}
                {ctx.creux.map((j) => <tr key={j.iso}><td>{jourDit(j.iso)}</td><td className="d">{j.poses}</td><td className="d">{j.ordinaire}</td><td className="d">{j.manque}</td><td className="d">{j.remises}</td></tr>)}
              </tbody>
            </table>
          </div>
        </div>
        <div className="trc-ger__carte">
          <h3>Son réglage <span>seul, après deux semaines d’essai</span></h3>
          <div className="trc-ger__modes" role="radiogroup" aria-label="Le mode de Gérard">
            {MODES.map((m) => (
              <button key={m.v} type="button" role="radio" aria-checked={reglages.mode === m.v} disabled={!direction}
                className={reglages.mode === m.v ? 'est-choisi' : ''} onClick={() => changeLeMode(m.v, moi?.name ?? 'La direction')}>
                <b>{m.titre}</b><span>{m.dit}</span>
              </button>
            ))}
          </div>
          <p className="trc-ger__doux">
            L’essai : {reglages.essai.length ? reglages.essai.map(nomDe).filter(Boolean).join(', ') : 'personne encore'} ({reglages.essai.length} sur {ESSAI_MAX}).
            {direction ? ' Ouvrez une ligne du plan pour y mettre une cliente.' : ' La direction choisit les clientes de l’essai.'}
          </p>
        </div>
      </section>

      <section className="trc-ger__carte">
        <h3>Ses règles <span>vos choix du 26 octobre 2026</span></h3>
        <div className="mnd-scroll-x">
          <table>
            <tbody>
              <tr><td>Le fil entre deux séances</td><td>Une envie par mois, d’après sa fiche : un soin si elle a dit « cheveux secs », une retouche si sa couleur a trois mois, midi et deux si elle vient à midi, une coiffure en fin d’année, un lavage si son rythme est long. Jamais la même deux fois ; refusée, elle attend trois mois.</td></tr>
              <tr><td>Tout combiner</td><td>Sept jours avant sa date de cadence, deux places ; avec un soin ajouté le même jour, la coiffure de sortie est offerte.</td></tr>
              <tr><td>Garder son RDV</td><td>Deux jours avant un RDV pris depuis plus d’une semaine ; la veille, le rappel habituel.</td></tr>
              <tr><td>Les relances</td><td>Dix jours après sa date de cadence si rien n’est posé, puis quatre semaines au plus entre deux ; une endormie trois fois, à six semaines d’écart, puis silence.</td></tr>
              <tr><td>Les remises</td><td>Jour creux {REMISE_CREUX_PCT} %, anniversaire {REMISE_ANNIV_PCT} % (30 jours), {REMISES_PAR_SEMAINE} remises de jour creux par semaine.</td></tr>
              <tr><td>Noël</td><td>Du 1er au 15 décembre, les places des fêtes et la carte cadeau, sans remise.</td></tr>
              <tr><td>Toujours</td><td>Jamais entre 20 h et 8 h, jamais deux messages en moins de deux semaines (hors garder son RDV), jamais de prix ni de civilité supposée ; les sollicitations vont d’abord à Ma Couronne, sinon sur WhatsApp avec l’accord des nouvelles.</td></tr>
              <tr><td>La question franche</td><td>Il signe « {SIGNATURE} » et n’annonce rien de lui-même ; à « c’est un robot ? », il répond : « {REPONSE_FRANCHE} »</td></tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="trc-ger__carte">
        <h3>Ses modèles chez Meta <span>à déposer maintenant : l’approbation prend du temps</span></h3>
        <p className="trc-ger__doux">Dans le gestionnaire WhatsApp de Meta, un modèle par ligne : le nom, la catégorie, le corps tel quel ({'{{1}}'}, {'{{2}}'}… sont les variables), le pied « {piedDeGerard} », et les boutons de réponse rapide.</p>
        <ul className="trc-ger__modeles">
          {Object.entries(MODELES_DE_GERARD).map(([cle, m]) => {
            const bloc = `${m.nom}\n${m.categorie}\n\n${m.corps}\n\n${piedDeGerard}\n\nBoutons : ${m.boutons.join(' · ')}`;
            return (
              <li key={cle}>
                <div><b>{m.nom}</b><small>{m.categorie === 'UTILITY' ? 'Utilitaire' : 'Marketing'} · {m.boutons.join(' · ')}</small></div>
                <p className="trc-ger__texte">{m.corps}</p>
                <button type="button" className="trc-ger__btn" onClick={() => copier(cle, bloc)}>{copie === cle ? 'Copié' : 'Copier'}</button>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
