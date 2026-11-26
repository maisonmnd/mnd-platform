import { useEffect, useMemo, useState } from 'react';
import { toast } from '../../../../ds/components';
import { useBranch } from '../../../../shared/branches';
import { fmtMoney } from '../../../../shared/currency';
import { jourAn, momentDuSalon } from '../../../../shared/calendrier';
import { DEVISE_COMPLETE } from '../../../../shared/identite';
import { prenomDUsage } from '../../../../shared/civilite';
import { lienWaMe } from '../../../../shared/conversations';
import { estDiaspora } from '../../../../shared/clients-pur';
import { estAReprogrammer } from '../../../../shared/a-reprogrammer-pur';
import { fondeLaCouronne } from '../../../../shared/catalogue-pur';
import { nomEtEnClair } from '../../../../shared/en-clair-pur';
import { SUCCESSEURS } from '../../../../shared/bascule-de-janvier-pur';
import { heureDeDepart, reglesDepuis } from '../../../../shared/salle-des-envois';
import { documentDescendu, quandDocumentDescendu, quandTablePrete, tablePrete } from '../../../../shared/sync';
import { lisLAssistant } from '../../../../shared/assistant-lecture-pur';
import { estActif, ligneALaMain, ligneDeNotification, plusJours, type Situation } from '../../../../shared/gerard-pur';
import {
  CLE_DES_DIX_DU_LUNDI, MOTIF_DIT, PLUS_TARD_JOURS, RAISON_HORS_DITE, bilanDuLundi, choisisLesDix, cleDeLaListe, documentDuLundiLu,
  ecarteesParLesListes, encaisseDesRdvs, etatDeLaLigne, figeLaListe, leBonSoin, lundiDeLaSemaine, poseLeGeste, pourquoiElle,
  retireLeGeste, retourDuContact, semaineIso,
  type EtatDuLundi, type GesteDuLundi, type LigneDuLundi, type ListeDuLundi, type RaisonHors, type RdvDuRetour, type Retour,
} from '../../../../shared/les-dix-du-lundi-pur';
import { lesDixDuLundiStore, useLesDixDuLundi } from '../../../../shared/les-dix-du-lundi';
import type { Appointment } from '../../../../shared/agenda';
import { envoisStore, useAutoConfig } from '../equipe/data';
import { useEntreesDeLAssistant } from './gerard-donnees';
import { apptLabel, tarifDeLaTeteXof, useServicesById } from './_shared';
import type { PropsDUneVue } from './Gerard';
import './les-dix-du-lundi.css';

/* ══ LES DIX DU LUNDI, LA VUE — 26 novembre 2026 ══════════════════════════
   L'audit du Trône, point B2 (« Faire revenir celles qui ont glissé »),
   validé par Yéman. Une vue de Perle (`/gerard?vue=lundi`) : chaque lundi,
   dix clientes qui ont glissé, leur message prêt et le bon soin ; le
   résultat en francs. Les règles : `shared/les-dix-du-lundi-pur.ts`.

   LA LISTE SE FIGE UNE FOIS PAR SEMAINE, au jour du salon (`momentDuSalon`,
   jamais l'horloge du poste), et seulement quand les fiches, les rendez-vous,
   le journal des envois, les pièces et le document lui-même sont descendus :
   une liste figée sur un poste encore vide le resterait toute la semaine.

   « ENVOYER » est le geste de Perle, à l'identique : WhatsApp s'ouvre sur le
   message déjà écrit et la ligne `ligneALaMain` s'écrit au journal ; pour
   une cliente de Ma Couronne, la notification se dépose en salle d'attente
   et le facteur la porte à son heure. Perle en pause : rien ne part. */

const TABLES = ['clients', 'appointments', 'envois', 'invoices'] as const;
/** Les abonnements de Ma Couronne se lisent à part : on les attend au plus tant de millisecondes avant de figer. */
const ATTENTE_DES_ABONNEMENTS_MS = 8_000;

/** Tout ce que la liste lit est-il descendu ? */
function useToutEstDescendu(): boolean {
  const lu = () => TABLES.every((t) => tablePrete(t)) && documentDescendu(CLE_DES_DIX_DU_LUNDI);
  const [pret, setPret] = useState(lu);
  useEffect(() => {
    if (pret) return undefined;
    let vivant = true;
    const relis = () => { if (vivant && lu()) setPret(true); };
    for (const t of TABLES) quandTablePrete(t, relis);
    void quandDocumentDescendu(CLE_DES_DIX_DU_LUNDI).then(relis);
    return () => { vivant = false; };
  }, [pret]);
  return pret;
}

/** « 23 nov. 2026 » : une date de cliente porte toujours son année. */
const dateCourte = (iso: string) => jourAn(iso);

export default function LesDixDuLundi({ reglages, moi }: PropsDUneVue) {
  const { branch, currency } = useBranch();
  const entrees = useEntreesDeLAssistant();
  const byId = useServicesById();
  const [cfg] = useAutoConfig();
  const [brut] = useLesDixDuLundi();
  const doc = useMemo(() => documentDuLundiLu(brut), [brut]);
  /* L'horloge bat chaque minute : le jour du salon, et la semaine, se relisent. */
  const [tick, setTick] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setTick(Date.now()), 60_000);
    return () => window.clearInterval(t);
  }, []);
  const jour = momentDuSalon(tick).jour;
  const semaine = semaineIso(jour);
  const lundi = lundiDeLaSemaine(jour);
  const cle = cleDeLaListe(branch.id, semaine);
  const liste: ListeDuLundi | undefined = doc.listes[cle];
  const actif = estActif(reglages);

  /* La lecture de Perle, au jour du salon (le cerveau de la page lit le jour du poste). */
  const cerveau = useMemo(() => lisLAssistant({ ...entrees, aujourdhui: jour, maintenantMs: Date.now() }), [entrees, jour]);
  const ficheDe = useMemo(() => new Map(cerveau.fiches.map((f) => [f.id, f])), [cerveau]);
  const encaisse = useMemo(() => encaisseDesRdvs(entrees.rdvs, entrees.pieces), [entrees.rdvs, entrees.pieces]);
  const rdvsDe = useMemo(() => {
    const m = new Map<string, Appointment[]>();
    for (const a of entrees.rdvs) { const l = m.get(a.clientId); if (l) l.push(a); else m.set(a.clientId, [a]); }
    return m;
  }, [entrees.rdvs]);

  /* ── FIGER LA SEMAINE ── */
  const pret = useToutEstDescendu();
  const [attenteFinie, setAttenteFinie] = useState(false);
  useEffect(() => {
    const t = window.setTimeout(() => setAttenteFinie(true), ATTENTE_DES_ABONNEMENTS_MS);
    return () => window.clearTimeout(t);
  }, []);
  const abonnementsLus = entrees.abonnes.size > 0 || attenteFinie;
  useEffect(() => {
    if (!pret || !abonnementsLus || liste) return;
    const candidates = entrees.clients.map((c) => {
      const fiche = ficheDe.get(c.id);
      if (!fiche) return null;
      const apporteXof = (rdvsDe.get(c.id) ?? []).filter((a) => fiche.rdvs.some((r) => r.id === a.id && r.venu)).reduce((n, a) => n + (encaisse.get(a.id) ?? 0), 0);
      return {
        fiche,
        marques: {
          essai: c.essai === true, archivee: !!c.archived, diaspora: estDiaspora(c), passagePose: c.passagePose === true, locksDefaits: c.locksDefaits === true,
          aReprogrammer: (rdvsDe.get(c.id) ?? []).some((a) => estAReprogrammer(a)),
        },
        apporteXof,
      };
    }).filter((x): x is NonNullable<typeof x> => !!x);
    const choix = choisisLesDix(candidates, { aujourdhui: jour, eteintes: cerveau.ctx.eteintes, ecartees: ecarteesParLesListes(doc, branch.id, jour) });
    lesDixDuLundiStore.set((prev) => figeLaListe(documentDuLundiLu(prev), {
      branchId: branch.id, semaine, lundi, figeeLe: new Date().toISOString(), lignes: choix.lignes, vivier: choix.vivier, hors: choix.hors,
    }));
  }, [pret, abonnementsLus, liste, entrees.clients, ficheDe, rdvsDe, encaisse, jour, cerveau.ctx.eteintes, doc, branch.id, semaine, lundi]);

  /* ── LE RETOUR D'UNE LIGNE CONTACTÉE ── */
  const retourDe = (l: LigneDuLundi): Retour | null => {
    if (l.geste?.quoi !== 'envoye') return null;
    const rdvs: RdvDuRetour[] = (rdvsDe.get(l.clientId) ?? []).map((a) => ({ id: a.id, clientId: a.clientId, date: a.date, status: a.status, creeLe: a.creeLe, encaisseXof: encaisse.get(a.id) ?? 0 }));
    return retourDuContact({ contactLe: l.geste.le, rdvs, aujourdhui: jour });
  };
  const listesDeLaBranche = useMemo(
    () => Object.values(doc.listes).filter((l) => l.branchId === branch.id).sort((a, b) => b.semaine.localeCompare(a.semaine)),
    [doc, branch.id],
  );
  const bilanDe = (l: ListeDuLundi) => bilanDuLundi(l.lignes.map((x) => ({ geste: x.geste, retour: retourDe(x) })));
  const bilanSemaine = liste ? bilanDe(liste) : null;
  const bilanTotal = bilanDuLundi(listesDeLaBranche.flatMap((l) => l.lignes.map((x) => ({ geste: x.geste, retour: retourDe(x) }))));

  /* ── LES GESTES ── */
  const [ouverte, setOuverte] = useState<string | null>(null);
  const par = moi?.name ?? 'L’équipe';
  const pose = (clientId: string, geste: GesteDuLundi) => {
    lesDixDuLundiStore.set((prev) => poseLeGeste(documentDuLundiLu(prev), cle, clientId, geste));
  };
  /* ENVOYÉ : la ligne de Perle au journal (elle compte pour les quatorze
     jours, les relances et la promesse des deux par mois), puis le geste. */
  const noteLEnvoi = (l: LigneDuLundi, s: Situation) => {
    const maintenant = Date.now();
    const maintenantIso = new Date(maintenant).toISOString();
    const outils = { branchId: branch.id, aujourdhui: jour, maintenantIso, prenom: prenomDUsage(cerveau.clientDe(s.clientId)) };
    let ligne;
    if (s.canal === 'couronne') {
      const d = heureDeDepart(maintenant, reglesDepuis(cfg));
      ligne = ligneDeNotification(s, { ...outils, compte: cerveau.compteDe(s.clientId), partA: new Date(d.partA).toISOString(), calme: d.calme });
    } else {
      ligne = ligneALaMain(s, outils);
    }
    envoisStore.set((prev) => (prev.some((e) => e.id === ligne.id) ? prev : [...prev, ligne as unknown as (typeof prev)[number]]));
    pose(l.clientId, { quoi: 'envoye', le: maintenantIso, par, canal: s.canal, envoiId: ligne.id });
    if (s.canal === 'couronne') toast('Déposé sur Ma Couronne : le message part à l’heure de la salle.');
  };

  const lignes = liste?.lignes ?? [];
  const nomDe = (id: string) => cerveau.clientDe(id)?.name || prenomDUsage(cerveau.clientDe(id)) || 'Cliente';
  const horsDits = liste ? (Object.entries(liste.hors) as [RaisonHors, number][]).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]) : [];

  return (
    <section className="trc-dix" aria-label="Les dix du lundi">
      <div className="trc-dix__tete">
        <p className="trc-dix__semaine">
          {`Semaine du ${dateCourte(lundi)}`}
          {liste?.figeeLe ? ` · figée le ${dateCourte(momentDuSalon(Date.parse(liste.figeeLe)).jour)}` : ''}
        </p>
        <p className="trc-dix__dit">Dix clientes qui ont glissé, à recontacter cette semaine, chacune avec son message et le bon soin. La liste ne bouge plus jusqu’à lundi.</p>
      </div>

      {!liste ? (
        <p className="trc-ger__doux" role="status">{pret ? 'La liste de la semaine se prépare.' : 'Les fiches descendent : la liste de la semaine attend qu’elles soient toutes là.'}</p>
      ) : (
        <>
          <div className="trc-dix__chiffres" aria-label="Le résultat de la semaine">
            <div className="trc-dix__chiffre"><b>{bilanSemaine?.contactees ?? 0}</b><span>{`contactée${(bilanSemaine?.contactees ?? 0) > 1 ? 's' : ''} sur ${lignes.length}`}</span></div>
            <div className="trc-dix__chiffre"><b>{bilanSemaine?.revenues ?? 0}</b><span>{`revenue${(bilanSemaine?.revenues ?? 0) > 1 ? 's' : ''}${bilanSemaine?.rdvPris ? ` · ${bilanSemaine.rdvPris} rendez-vous pris` : ''}`}</span></div>
            <div className="trc-dix__chiffre trc-dix__chiffre--francs"><b>{fmtMoney(bilanSemaine?.francs ?? 0, currency)}</b><span>rapportés par celles de la semaine</span></div>
          </div>
          <p className="trc-dix__depuis">
            {`Depuis la première liste : ${bilanTotal.contactees} contactée${bilanTotal.contactees > 1 ? 's' : ''}, ${bilanTotal.revenues} revenue${bilanTotal.revenues > 1 ? 's' : ''}${bilanTotal.rdvPris ? `, ${bilanTotal.rdvPris} rendez-vous pris` : ''}, ${fmtMoney(bilanTotal.francs, currency)}.`}
            <small>Revenue : un rendez-vous pris après le message, honoré dans les 60 jours ; les francs sont ceux qu’elle a réglés.</small>
          </p>
          {!actif && <p className="trc-dix__pause" role="status">Perle est en pause : rien ne part tant qu’elle ne reprend pas.</p>}

          {lignes.length === 0 ? (
            <p className="trc-ger__doux">Personne cette semaine : aucune cliente qui a glissé ne peut recevoir de message.</p>
          ) : (
            <ol className="trc-auj__liste trc-dix__liste">
              {lignes.map((l, i) => {
                const f = ficheDe.get(l.clientId);
                const e: EtatDuLundi = etatDeLaLigne(l, f, { aujourdhui: jour, eteintes: cerveau.ctx.eteintes, placesDe: (id) => cerveau.ctx.placesDe(id) });
                const retour = retourDe(l);
                const ouvert = ouverte === l.clientId;
                const siens = rdvsDe.get(l.clientId) ?? [];
                const derniere = siens.filter((a) => a.status === 'honoré' && a.date.slice(0, 10) === l.derniereVenue)[0]
                  ?? siens.filter((a) => a.status === 'honoré').sort((x, y) => y.date.localeCompare(x.date))[0];
                const soin = leBonSoin({
                  rdvs: siens, clientId: l.clientId, aujourdhui: jour,
                  proposable: (id) => { const sv = byId.get(id); return !!sv && sv.archived !== true; },
                  successeur: (id) => SUCCESSEURS[id],
                  estCreation: (id) => { const sv = byId.get(id); return !!sv && fondeLaCouronne(sv); },
                  cadenceJours: f?.cadence.rythmeJours ?? null,
                });
                const soinDit = soin.length > 0
                  ? soin.map((id) => { const sv = byId.get(id); return sv ? nomEtEnClair(sv.name, sv.enClair) : ''; }).filter(Boolean).join(' + ')
                  : 'Son premier resserrage des racines';
                const prix = soin.length > 0
                  ? tarifDeLaTeteXof({ id: `lundi-${l.clientId}`, branchId: branch.id, clientId: l.clientId, clientName: '', date: jour, time: '10:00', status: 'confirmé', serviceIds: soin, longueur: derniere?.longueur, master: derniere?.master ?? '' } as unknown as Appointment, byId)
                  : undefined;
                const s = e.etat === 'a-faire' ? e.situation : null;
                const lien = s && s.canal === 'whatsapp' ? lienWaMe(cerveau.telDe(s), `${s.texte}\n${DEVISE_COMPLETE}`) : null;
                const peutEnvoyer = !!s && actif && (s.canal === 'couronne' || !!lien);
                return (
                  <li key={l.clientId} className={`trc-auj__rangee${ouvert ? ' est-ouverte' : ''}`}>
                    <div className="trc-auj__ligne">
                      <button type="button" className="trc-auj__ouvre" aria-expanded={ouvert} onClick={() => setOuverte(ouvert ? null : l.clientId)}>
                        <span className="trc-dix__rang" aria-hidden="true">{i + 1}</span>
                        <span className="trc-auj__qui">{nomDe(l.clientId)}</span>
                        <span className={`trc-auj__motif${l.motif === 'une-venue' ? ' trc-auj__motif--cuivre' : ''}`}>{MOTIF_DIT[l.motif]}</span>
                        <span className="trc-dix__dernier">{`${derniere ? apptLabel(derniere, byId) : 'Son dernier rituel'} · ${dateCourte(l.derniereVenue)}`}</span>
                      </button>
                      <span className="trc-auj__fin">
                        {s && peutEnvoyer && s.canal === 'whatsapp' && lien && (
                          <a className="trc-auj__btn trc-auj__btn--cuivre" href={lien} target="_blank" rel="noreferrer" onClick={() => noteLEnvoi(l, s)}>Envoyer</a>
                        )}
                        {s && peutEnvoyer && s.canal === 'couronne' && (
                          <button type="button" className="trc-auj__btn trc-auj__btn--cuivre" onClick={() => noteLEnvoi(l, s)}>Envoyer</button>
                        )}
                        {!peutEnvoyer && <small className={e.etat === 'envoye' && retour?.etat === 'revenue' ? 'trc-dix__revenue' : ''}>{etatCourt(e, retour, currency, actif)}</small>}
                      </span>
                    </div>
                    <div className="trc-dix__resume">
                      <span>{pourquoiElle(f, l, jour)}</span>
                      <span>{`Le bon soin : ${soinDit}${prix !== undefined ? ` · ${fmtMoney(prix, currency)}` : soin.length === 0 ? ' · le prix suit le comptage' : ''}`}</span>
                    </div>
                    {ouvert && (
                      <div className="trc-ger__panneau trc-auj__panneau trc-dix__panneau">
                        <p className="trc-ger__doux">{`${l.venues} venue${l.venues > 1 ? 's' : ''} · ${fmtMoney(l.apporteXof, currency)} réglés à la Maison${l.derniereVenue ? ` · dernière le ${dateCourte(l.derniereVenue)}` : ''}`}</p>
                        {s ? (
                          <div className="trc-ger__message">
                            <div className="trc-ger__bulle">
                              <span className="trc-ger__texte">{s.texte}</span>
                              <span className="trc-ger__pied">{DEVISE_COMPLETE}</span>
                            </div>
                            <small className="trc-ger__doux">
                              {s.canal === 'couronne' ? 'Ma Couronne : la notification part à l’heure de la salle.' : 'WhatsApp, à la main : « Envoyer » ouvre le message déjà écrit et le note au journal de Perle.'}
                            </small>
                          </div>
                        ) : (
                          <p className="trc-dix__etat">{etatLong(e, retour, currency)}</p>
                        )}
                        <div className="trc-am__gestes trc-dix__gestes">
                          {!l.geste && (
                            <>
                              <button type="button" className="trc-auj__btn" onClick={() => pose(l.clientId, { quoi: 'injoignable', le: new Date().toISOString(), par })}>Pas joignable</button>
                              <button type="button" className="trc-auj__btn" onClick={() => pose(l.clientId, { quoi: 'plus-tard', le: new Date().toISOString(), par, jusquau: plusJours(jour, PLUS_TARD_JOURS) })}>Plus tard</button>
                            </>
                          )}
                          {l.geste && l.geste.quoi !== 'envoye' && (
                            <button type="button" className="trc-auj__btn" onClick={() => lesDixDuLundiStore.set((prev) => retireLeGeste(documentDuLundiLu(prev), cle, l.clientId))}>Annuler</button>
                          )}
                        </div>
                      </div>
                    )}
                  </li>
                );
              })}
            </ol>
          )}

          {horsDits.length > 0 && (
            <details className="trc-dix__repli">
              <summary>{`Restées hors de la liste : ${horsDits.reduce((n, [, x]) => n + x, 0)}`}</summary>
              <ul className="trc-dix__hors">
                {horsDits.map(([r, n]) => <li key={r}><b>{n}</b><span>{RAISON_HORS_DITE[r]}</span></li>)}
              </ul>
            </details>
          )}
          {listesDeLaBranche.length > 1 && (
            <details className="trc-dix__repli">
              <summary>Les semaines passées</summary>
              <ul className="trc-dix__semaines">
                {listesDeLaBranche.filter((l) => l.semaine !== semaine).map((l) => {
                  const b = bilanDe(l);
                  return (
                    <li key={l.semaine}>
                      <span>{`Semaine du ${dateCourte(l.lundi || l.semaine)}`}</span>
                      <span>{`${b.contactees} contactée${b.contactees > 1 ? 's' : ''} · ${b.revenues} revenue${b.revenues > 1 ? 's' : ''}`}</span>
                      <b>{fmtMoney(b.francs, currency)}</b>
                    </li>
                  );
                })}
              </ul>
            </details>
          )}
        </>
      )}
    </section>
  );
}

/** L'état d'une ligne en deux ou trois mots, à droite. */
function etatCourt(e: EtatDuLundi, retour: Retour | null, currency: string, actif: boolean): string {
  if (e.etat === 'a-faire') return actif ? 'Numéro à vérifier' : 'En pause';
  if (e.etat === 'envoye') {
    if (retour?.etat === 'revenue') return `Revenue le ${dateCourte(retour.date)} · ${fmtMoney(retour.encaisseXof, currency)}`;
    if (retour?.etat === 'rdv-pris') return `Rendez-vous le ${dateCourte(retour.date)}`;
    return `Envoyé le ${dateCourte(momentDuSalon(Date.parse(e.geste.le)).jour)}`;
  }
  if (e.etat === 'injoignable') return 'Pas joignable';
  if (e.etat === 'plus-tard') return e.geste.quoi === 'plus-tard' ? `Plus tard · ${dateCourte(e.geste.jusquau)}` : 'Plus tard';
  if (e.etat === 'a-repris') return `Revenue seule · ${dateCourte(e.date)}`;
  if (e.etat === 'tue') return 'En attente';
  return '';
}

/** L'état d'une ligne, en une phrase, dans son panneau. */
function etatLong(e: EtatDuLundi, retour: Retour | null, currency: string): string {
  if (e.etat === 'envoye') {
    const qui = e.geste.par ? ` par ${e.geste.par}` : '';
    const ou = e.geste.quoi === 'envoye' && e.geste.canal === 'couronne' ? 'Déposé sur Ma Couronne' : 'Envoyé sur WhatsApp';
    const quand = `${ou} le ${dateCourte(momentDuSalon(Date.parse(e.geste.le)).jour)}${qui}.`;
    if (retour?.etat === 'revenue') return `${quand} Revenue le ${dateCourte(retour.date)} : ${fmtMoney(retour.encaisseXof, currency)} réglés.`;
    if (retour?.etat === 'rdv-pris') return `${quand} Rendez-vous pris pour le ${dateCourte(retour.date)}.`;
    return `${quand} Pas encore de rendez-vous.`;
  }
  if (e.etat === 'injoignable') return `Pas joignable, noté le ${dateCourte(momentDuSalon(Date.parse(e.geste.le)).jour)}${e.geste.par ? ` par ${e.geste.par}` : ''}. Elle peut revenir dans une liste dans quatre semaines.`;
  if (e.etat === 'plus-tard') return `Plus tard : hors des listes jusqu’au ${e.geste.quoi === 'plus-tard' ? dateCourte(e.geste.jusquau) : ''}.`;
  if (e.etat === 'a-repris') return `Elle a repris rendez-vous d’elle-même, pour le ${dateCourte(e.date)} : rien à envoyer.`;
  if (e.etat === 'tue') return `${e.dit} Rien ne part pour l’instant.`;
  return '';
}
