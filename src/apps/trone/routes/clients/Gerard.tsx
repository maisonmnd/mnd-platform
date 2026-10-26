import { useEffect, useMemo, useState } from 'react';
import { useBranch } from '../../../../shared/branches';
import { useStaff } from '../../../../shared/auth';
import { DEVISE_COMPLETE } from '../../../../shared/identite';
import { prenomSeul } from '../../../../shared/civilite';
import { lienWaMe } from '../../../../shared/conversations';
import { DEVENU_DIT, devenuDe } from '../../../../shared/envois';
import {
  ENVIE_DITE, GENRE_DIT, MODELES_DE_GERARD, REMISE_ANNIV_PCT, REMISE_CREUX_PCT, REPONSE_FRANCHE, SIGNATURE,
  filDeLaCliente, jourDit, ligneALaMain, planDuJour, servie,
  type FicheDeGerard, type Situation,
} from '../../../../shared/gerard-pur';
import { changeLePlafond, estActif, metEnPause, reglagesLus, useReglagesDeGerard } from '../../../../shared/gerard';
import { envoisStore, useEnvois } from '../equipe/data';
import { fabriqueLeCodeDe, useCerveauDeGerard, useLePassageDeGerard } from './gerard-donnees';
import { PageHead } from '../_ui';
import { GerardEntreDeux } from './GerardEntreDeux';
import './gerard.css';

/* ══ GÉRARD — 26 octobre 2026, lot 1 ═════════════════════════════════════
   Maquette 4bPVFik1ABh3TRFZ5XbHiG, « construis » : le cerveau
   (`shared/gerard-pur.ts`) et sa rubrique. Chaque matin, une chose au plus
   par cliente : garder son RDV, son anniversaire, tout combiner, une envie
   du fil, un jour creux, Noël, ou une relance. Cet écran montre le plan du
   jour, le fil de chaque cliente, les jours creux, les réglages de l'essai
   et les modèles à déposer chez Meta.

   MAQUETTE V4 (« construis », 26 octobre 2026) : l'essai à cinq clientes
   laisse place à un seul interrupteur, Pause ou Actif ; le plafond de la
   semaine compte toutes les remises à son nom, en nombre et en francs ; les
   modèles passent de quatorze à sept plus un.

   IL COMMENCE LE 26 OCTOBRE 2026 AU SOIR (« on commence immédiatement ») :
   le passage du jour (`gerard-donnees.ts`) dépose les notifications Ma
   Couronne en salle d'attente ; les lignes WhatsApp ont leur bouton, un
   toucher par cliente, jusqu'à l'approbation de ses modèles chez Meta.
   Claude lira les réponses plus tard. Le plan montre ce qui reste à faire
   aujourd'hui ; « Aujourd'hui » montre ce qui est parti. */

const MODES: { pause: boolean; titre: string; dit: string }[] = [
  { pause: true, titre: 'Pause', dit: 'Il prépare son plan, il n’écrit à personne.' },
  { pause: false, titre: 'Actif', dit: 'Il écrit chaque jour, sous ses règles et son plafond.' },
];
const francsDits = (n: number) => `${n.toLocaleString('fr-FR')} F`;

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
            style={{ left: `${10 + 80 * p.jour / fin}%` }}>
            <i />
            <small><b>{p.quoi}</b>{jourDit(p.iso).replace(/^\S+ /, '')}</small>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Gerard() {
  const { branch } = useBranch();
  const moi = useStaff();
  const direction = moi?.role === 'souverain' || moi?.role === 'gerant';
  const [brut] = useReglagesDeGerard();
  const reglages = reglagesLus(brut);
  const cerveau = useCerveauDeGerard();
  const { fiches, ctx, nomDe } = cerveau;
  const plan = useMemo(() => planDuJour(fiches, ctx), [fiches, ctx]);
  useLePassageDeGerard(cerveau, plan);
  const [envois] = useEnvois();
  /* Ce qui est parti aujourd'hui : le journal du jour. */
  const duJour = useMemo(() => (envois as unknown as (Record<string, unknown> & { id: string; type?: string; clientId?: string; statut: string; etat?: string; deposeLe?: string; quand?: string })[])
    .filter((e) => e.type === 'gerard' && (e.deposeLe ?? e.quand ?? '').slice(0, 10) === ctx.aujourdhui)
    .sort((x, y) => String(x.deposeLe ?? '').localeCompare(String(y.deposeLe ?? ''))), [envois, ctx.aujourdhui]);
  /* UN TOUCHER : le message s'ouvre dans WhatsApp, déjà écrit ; il est noté au journal, et son code fabriqué. */
  const noteALaMain = (s: Situation) => {
    const c = cerveau.clientDe(s.clientId);
    const maintenant = Date.now();
    const codePromo = fabriqueLeCodeDe(s, { branchId: branch.id, nom: c?.name ?? '', maintenantMs: maintenant });
    const ligne = ligneALaMain(s, {
      branchId: branch.id, aujourdhui: ctx.aujourdhui, maintenantIso: new Date(maintenant).toISOString(), prenom: prenomSeul(c?.name),
      rdv: s.genre === 'garder' ? cerveau.rdvAGarder(s.clientId) : undefined, codePromo,
    });
    envoisStore.set((prev) => [...prev.filter((e) => e.id !== ligne.id), ligne as unknown as (typeof prev)[number]]);
  };
  const ficheDe = useMemo(() => new Map(fiches.map((f) => [f.id, f])), [fiches]);
  const [ouverte, setOuverte] = useState<string | null>(null);
  const [copie, setCopie] = useState<string | null>(null);
  const actif = estActif(reglages);
  const { plafond } = cerveau;
  /* Le plafond se tape puis s'écrit à la sortie du champ. */
  const [nombre, setNombre] = useState(String(reglages.remisesParSemaine));
  const [francs, setFrancs] = useState(String(reglages.plafondFrancs));
  useEffect(() => { setNombre(String(reglages.remisesParSemaine)); }, [reglages.remisesParSemaine]);
  useEffect(() => { setFrancs(String(reglages.plafondFrancs)); }, [reglages.plafondFrancs]);
  const posePlafond = () => {
    /* Un champ vidé ne vaut pas zéro : il garde le plafond d'avant. */
    const lu = (x: string) => { const d = x.replace(/\D/g, ''); return d ? Number(d) : undefined; };
    changeLePlafond({ remisesParSemaine: lu(nombre), plafondFrancs: lu(francs) }, moi?.name ?? 'La direction');
  };

  const montres = plan;
  const garder = plan.filter((s) => s.genre === 'garder').length;
  const parGenre = plan.reduce<Record<string, number>>((m, s) => ({ ...m, [s.genre]: (m[s.genre] ?? 0) + 1 }), {});

  const copier = (cle: string, texte: string) => {
    void navigator.clipboard?.writeText(texte).then(() => setCopie(cle), () => setCopie(null));
  };

  return (
    <div className="trc-ger">
      <PageHead
        eyebrow="Clientèle · Gérard, l’assistant de la Maison"
        title="Assistant Maison."
        actions={(
          <div className="trc-ger__chiffres">
            <span className="trc-ger__chiffre"><b>{plan.length}</b><small>à écrire aujourd’hui</small></span>
            <span className="trc-ger__chiffre"><b>{duJour.length}</b><small>partis aujourd’hui</small></span>
            <span className="trc-ger__chiffre"><b>{garder}</b><small>RDV à garder</small></span>
            <span className="trc-ger__chiffre"><b>{plafond.faites} / {plafond.remisesParSemaine}</b><small>remises de la semaine</small></span>
            <span className="trc-ger__chiffre"><b>{francsDits(plafond.francs)}</b><small>sur {francsDits(plafond.plafondFrancs)}</small></span>
          </div>
        )}
      />

      <div className="trc-ger__etat" role="note">
        <b>{actif ? 'Actif' : 'Pause'}.</b>
        {!actif
          ? <span>Il prépare son plan, il n’écrit à personne.</span>
          : <span>Chaque jour, quand la direction ouvre le Trône entre 8 h et 20 h, Gérard dépose les notifications Ma Couronne de son plan ; le facteur les porte, jamais entre 20 h et 8 h. WhatsApp : « Envoyer sur WhatsApp », un toucher par cliente, jusqu’à l’approbation de ses modèles chez Meta.{reglages.dernierPassage ? ` Dernier passage : ${reglages.dernierPassage === ctx.aujourdhui ? 'aujourd’hui' : jourDit(reglages.dernierPassage)}.` : ''}</span>}
      </div>

      <section className="trc-ger__carte">
        <div className="trc-ger__haut">
          <h3>Le plan du jour <span>ce qui reste à écrire aujourd’hui</span></h3>
        </div>
        {Object.keys(parGenre).length > 0 && (
          <p className="trc-ger__doux">{Object.entries(parGenre).map(([g, n]) => `${GENRE_DIT[g as Situation['genre']]} ${n}`).join(' · ')}</p>
        )}
        {montres.length === 0 && <p className="trc-ger__vide">Plus rien à écrire aujourd’hui : chaque cliente est entre deux messages.</p>}
        <ul className="trc-ger__liste">
          {montres.map((s) => {
            const f = ficheDe.get(s.clientId);
            const ouvert = ouverte === s.clientId;
            const modele = MODELES_DE_GERARD[s.modele];
            return (
              <li key={s.clientId} className={`trc-ger__rangee${ouvert ? ' est-ouverte' : ''}`}>
                <button type="button" className="trc-ger__ligne" aria-expanded={ouvert} onClick={() => setOuverte(ouvert ? null : s.clientId)}>
                  <span className="trc-ger__qui">{nomDe(s.clientId)}</span>
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
                      {s.canal === 'whatsapp' && servie(reglages, s.clientId) && (() => {
                        const lien = lienWaMe(cerveau.clientDe(s.clientId)?.phone, `${s.texte}\n${DEVISE_COMPLETE}`);
                        return lien ? (
                          <a className="trc-ger__btn trc-ger__btn--cuivre" href={lien} target="_blank" rel="noreferrer" onClick={() => noteALaMain(s)}>Envoyer sur WhatsApp</a>
                        ) : null;
                      })()}
                      {s.canal === 'couronne' && actif && <small className="trc-ger__doux">Notification Ma Couronne : elle part au passage du jour.</small>}
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

      <section className="trc-ger__carte">
        <h3>Aujourd’hui <span>ce qui est parti</span></h3>
        {duJour.length === 0 && <p className="trc-ger__doux">Rien encore aujourd’hui.</p>}
        {duJour.length > 0 && (
          <div className="mnd-scroll-x">
            <table>
              <thead><tr><th>Cliente</th><th>Pourquoi</th><th>Par où</th><th>Où il en est</th><th>Code</th></tr></thead>
              <tbody>
                {duJour.map((e) => (
                  <tr key={e.id}>
                    <td>{nomDe(e.clientId ?? '')}</td>
                    <td>{GENRE_DIT[e.genre as Situation['genre']] ?? ''}{e.envie ? ` · ${ENVIE_DITE[e.envie as NonNullable<Situation['envie']>]}` : ''}</td>
                    <td>{e.canal === 'push' ? 'Ma Couronne' : 'WhatsApp, à la main'}</td>
                    <td>{DEVENU_DIT[devenuDe({ statut: e.statut, etat: e.etat })]}</td>
                    <td>{typeof e.codePromo === 'string' ? e.codePromo : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="trc-ger__deux">
        <div className="trc-ger__carte">
          <h3>Les jours creux <span>de 3 à 7 jours</span></h3>
          <p className="trc-ger__doux">Un jour est creux quand ses RDV posés sont sous l’ordinaire de ce jour de la semaine (les Prévisions). Gérard y ouvre autant de remises de {REMISE_CREUX_PCT} % qu’il manque de RDV, dans le plafond de la semaine, d’abord aux clientes en retard.</p>
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
          <h3>Son réglage <span>Pause ou Actif</span></h3>
          <div className="trc-ger__modes" role="radiogroup" aria-label="Pause ou Actif">
            {MODES.map((m) => (
              <button key={m.titre} type="button" role="radio" aria-checked={actif !== m.pause} disabled={!direction}
                className={actif !== m.pause ? 'est-choisi' : ''} onClick={() => metEnPause(m.pause, moi?.name ?? 'La direction')}>
                <b>{m.titre}</b><span>{m.dit}</span>
              </button>
            ))}
          </div>
          <div className="trc-ger__plafond">
            <label>
              <span>Remises par semaine, tout compris</span>
              <input type="text" inputMode="numeric" value={nombre} disabled={!direction}
                onChange={(e) => setNombre(e.target.value)} onBlur={posePlafond} />
            </label>
            <label>
              <span>Plafond en francs par semaine</span>
              <input type="text" inputMode="numeric" value={francs} disabled={!direction}
                onChange={(e) => setFrancs(e.target.value)} onBlur={posePlafond} />
            </label>
          </div>
          <p className="trc-ger__doux">
            Cette semaine : {plafond.faites} remise{plafond.faites > 1 ? 's' : ''} à son nom, {francsDits(plafond.francs)} engagés (jour creux, anniversaire, offre flash et remises de la direction comptent ensemble). À l’une des deux bornes, plus aucune remise : il écrit sans elle.
          </p>
        </div>
      </section>

      <GerardEntreDeux />

      <section className="trc-ger__carte">
        <h3>Ses règles <span>vos choix du 26 octobre 2026</span></h3>
        <div className="mnd-scroll-x">
          <table>
            <tbody>
              <tr><td>Le fil entre deux séances</td><td>Une envie par mois, d’après sa fiche : un soin si elle a dit « cheveux secs », une retouche si sa couleur a trois mois, midi et deux si elle vient à midi, une coiffure en fin d’année, un lavage si son rythme est long. Jamais la même deux fois ; refusée, elle attend trois mois.</td></tr>
              <tr><td>La saison des fêtes</td><td>Du 1er novembre au 24 décembre : une envie toutes les trois semaines, les relances toutes les deux semaines, le message de Noël dès le 15 novembre. Retour au rythme ordinaire le 25 décembre.</td></tr>
              <tr><td>Avant sa date</td><td>Sept jours avant sa date de cadence, il lui propose de réserver ; avec un soin ajouté le même jour, la coiffure de sortie est offerte.</td></tr>
              <tr><td>Garder son RDV</td><td>Deux jours avant un RDV pris depuis plus d’une semaine ; la veille, le rappel habituel.</td></tr>
              <tr><td>Les relances</td><td>Dix jours après sa date de cadence si rien n’est posé, puis quatre semaines au plus entre deux ; une endormie trois fois, à six semaines d’écart, puis silence.</td></tr>
              <tr><td>Les remises</td><td>Jour creux {REMISE_CREUX_PCT} %, anniversaire {REMISE_ANNIV_PCT} % (30 jours), notées à son nom et proposées à la Caisse ; {plafond.remisesParSemaine} par semaine tout compris et {francsDits(plafond.plafondFrancs)} au plus ; jamais deux à la fois.</td></tr>
              <tr><td>Le silence</td><td>Rien qu’à garder son RDV si elle doit de l’argent, si une relance de facture est partie il y a moins de sept jours, si elle a écrit depuis moins de 48 heures sans réponse, si un souci est ouvert ; jamais rien à un enfant d’un foyer (le parent reçoit).</td></tr>
              <tr><td>Noël</td><td>Du 15 novembre au 15 décembre, les places des fêtes et la carte cadeau, sans remise.</td></tr>
              <tr><td>Toujours</td><td>Jamais entre 20 h et 8 h, jamais deux messages en moins de deux semaines, toutes voix de la Maison comptées (hors garder son RDV et les services), jamais de prix ni de civilité supposée ; Ma Couronne d’abord (gratuite), sinon WhatsApp, avec l’accord des nouvelles pour une sollicitation.</td></tr>
              <tr><td>La question franche</td><td>Ses messages sont signés « {SIGNATURE} » et il n’annonce rien de lui-même ; à « c’est un robot ? », il répond : « {REPONSE_FRANCHE} »</td></tr>
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
