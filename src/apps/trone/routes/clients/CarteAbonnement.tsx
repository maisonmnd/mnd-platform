import { useMemo, useState, type ReactNode } from 'react';
import { Button, toast } from '../../../../ds/components';
import { useBranch } from '../../../../shared/branches';
import { fmtMoney } from '../../../../shared/currency';
import { uid } from '../../../../shared/store';
import { useSubscribers, usePlans, prixVenduXof, ETAT_LABEL, type Subscriber } from '../../../../shared/abonnements';
import { useServices } from '../../../../shared/catalog';
import { useModelBands, useBandSets, bandsAbonnements, sortedBands, bandLabel } from '../../../../shared/pricing';
import {
  usePaymentMethods, useCashboxes, caisseParDefaut, quiEncaisse, type Invoice,
} from '../../../../shared/finance';
import type { Appointment } from '../../../../shared/agenda';
import type { Client } from '../../../../shared/clients';
import { appelDe } from '../../../../shared/civilite';
import {
  releveDeLAbonnee, jourDitAvecLAnnee, francs,
  type ReleveDuContrat, type LigneDeSeances, type SeanceDuContrat,
} from '../../../../shared/abonnee-pur';
import { decaleLeJour, jourDeCotonou } from '../../../../shared/ia-faits-pur';
import { LienMndPay } from '../vente/LienMndPay';
import {
  effetDeLaResiliation, resilie, effetDeLaProlongation, prolonge, effetDeLaSuspension, suspend,
  effetDuPrixRevu, revoitLePrix, verseSurLAbonnement, effetDeRendre, rendLaSeance, type Effet, type VersementDuComptoir,
  echeancierAPoser, echeancierAEcrire, effetDePoserLEcheancier, poseLEcheancier,
} from './gestes-de-l-abonnement';
import './abonnement.css';

/* ══ LA CARTE ABONNEMENT DE LA FICHE 360 — 20 octobre 2026 ═════════════════
   Maquette « Le parcours de l'abonnée » (validée). La pastille « ★ Abonnée »
   disait qu'elle l'était, rien d'autre : ni où elle en était, ni ce qu'elle
   devait, ni ce que la Maison pouvait faire. La carte dit tout cela, et ne
   calcule RIEN : elle lit le relevé du juge unique (`releveDeLAbonnee`), le
   même que Ma Couronne lit pour elle.

   PLUSIEURS FORMULES PEUVENT COURIR (« Deux en même temps ») : une carte par
   formule qui court, celle qui finit le plus tôt d'abord ; les terminées se
   lisent dans la ligne de vie, repliée.

   CHAQUE GESTE DIT SON EFFET AVANT D'AGIR, et ce que la cliente lira. Un seul
   panneau ouvert à la fois. */

type Geste = 'encaisser' | 'lien' | 'prolonger' | 'suspendre' | 'resilier' | 'rendre' | 'revoir' | 'poser';

const MOTIFS = ['Maladie', 'Voyage', 'Empêchement de la Maison', 'Geste de la Maison', 'Autre'];

const dit = (iso: string | null | undefined): string => (iso ? jourDitAvecLAnnee(iso) : 'sans date');
const pluriel = (n: number, un: string, plusieurs: string): string => `${n} ${n > 1 ? plusieurs : un}`;

function BarreDesSeances({ l }: { l: LigneDeSeances }) {
  if (l.incluses === null) return <span className="trc-abo__barre trc-abo__barre--libre" aria-hidden="true" />;
  const t = Math.max(1, l.incluses);
  const reservees = l.reservees;
  return (
    <span className="trc-abo__barre" aria-hidden="true">
      <i className="faite" style={{ width: `${(l.faites / t) * 100}%` }} />
      <i className="reservee" style={{ width: `${(reservees / t) * 100}%` }} />
      <i className="manquee" style={{ width: `${(l.manquees / t) * 100}%` }} />
    </span>
  );
}

function PanneauDEffet({ effet, children, sensible }: { effet: Effet; children?: ReactNode; sensible?: boolean }) {
  return (
    <div className={`trc-abo__effet ${sensible ? 'is-sensible' : ''}`}>
      {effet.refus ? <p className="trc-abo__refus" role="alert">{effet.refus}</p> : (
        <ul>
          {effet.lignes.map((x) => <li key={x}>{x}</li>)}
          {effet.laClienteLit && <li>La cliente lit dans Ma Couronne : « {effet.laClienteLit} »</li>}
        </ul>
      )}
      {children}
    </div>
  );
}

export function CarteAbonnement({ client, appts, invoices }: {
  client: Client;
  appts: readonly Appointment[];
  invoices: readonly Invoice[];
}) {
  const { branch, currency } = useBranch();
  const [subs] = useSubscribers();
  const [plans] = usePlans();
  const [services] = useServices();
  const [methods] = usePaymentMethods();
  const [cashboxes] = useCashboxes();
  const jour = jourDeCotonou();

  /* LE RELEVÉ DE SA TÊTE : toutes ses formules, l'argent par contrat. Le prix
     vendu se relit au calibre (`prixVenduXof`), comme partout au Trône. */
  const releve = useMemo(() => releveDeLAbonnee({
    jour, clientId: client.id, subs, plans, appts, invoices,
    prixDuContrat: (s, p) => prixVenduXof(s as Subscriber, p, s.cycle ?? 'mensuel'),
  }), [jour, client.id, subs, plans, appts, invoices]);

  const [ouvert, setOuvert] = useState<{ sub: string; geste: Geste } | null>(null);
  const [vieOuverte, setVieOuverte] = useState(false);
  const [motif, setMotif] = useState(MOTIFS[0]);
  const [date, setDate] = useState('');
  const [jours, setJours] = useState(30);
  const [prixCompte, setPrixCompte] = useState('');
  const [calibreCompte, setCalibreCompte] = useState('');
  const [bandes] = useModelBands();
  const [jeux] = useBandSets();
  const calibres = useMemo(() => sortedBands(bandsAbonnements(jeux, bandes)), [jeux, bandes]);
  const [montant, setMontant] = useState('');
  const [moyen, setMoyen] = useState('');
  const [occupe, setOccupe] = useState(false);
  const [parts, setParts] = useState<1 | 2 | 3>(1);

  const nomDuService = (id: string) => services.find((s) => s.id === id)?.name ?? 'Prestation retirée';
  const ouvre = (sub: string, geste: Geste, montantDu?: number) => {
    if (ouvert?.sub === sub && ouvert.geste === geste) { setOuvert(null); return; }
    setOuvert({ sub, geste });
    setMotif(MOTIFS[0]);
    const c0 = releve.contrats.find((x) => x.sub.id === sub);
    setDate(geste === 'resilier'
      ? (c0 && c0.mode === 'cycle' && c0.lune && decaleLeJour(c0.lune.au, -1) > jour ? decaleLeJour(c0.lune.au, -1) : jour)
      : '');
    setJours(30);
    setParts(1);
    setPrixCompte('');
    setCalibreCompte('');
    setMontant(montantDu ? String(montantDu) : '');
    setMoyen(methods[0] ?? 'Espèces');
  };

  const tousLesContrats = [...releve.contrats, ...releve.anciens];
  if (tousLesContrats.length === 0) {
    return (
      <section className="trc-abo" aria-label="Abonnement">
        <div className="trc-abo__tete">
          <div>
            <span className="trc-abo__eyebrow">Abonnement</span>
            <div className="trc-abo__nom">Aucun abonnement</div>
          </div>
          <span className="trc-abo__chip">Sans formule</span>
        </div>
      </section>
    );
  }

  const ctx = { jour, subs, plans, invoices };
  const faitesEnTout = tousLesContrats.reduce((n, c) => n + c.attribuees.filter((s) => s.compte && s.etat === 'faite').length, 0);
  const verseEnTout = tousLesContrats.reduce((n, c) => n + c.argent.regleXof, 0);

  const encaisse = async (c: ReleveDuContrat) => {
    const n = parseInt(montant.replace(/[^0-9]/g, ''), 10) || 0;
    if (n <= 0) { toast('Saisissez le montant encaissé.'); return; }
    if (occupe) return;
    setOccupe(true);
    const boite = caisseParDefaut(cashboxes, branch.id, currency)?.name;
    const v: VersementDuComptoir = {
      id: `pay-${uid()}`, date: jour, montantXof: n, moyen: moyen || (methods[0] ?? 'Espèces'),
      ...(boite ? { cashbox: boite } : {}), note: 'Abonnement', source: 'comptoir',
      ...(quiEncaisse() ? { encaissePar: quiEncaisse() } : {}),
    };
    const r = await verseSurLAbonnement(c.sub.id, v);
    setOccupe(false);
    if (!r.ok) { toast(r.erreur); return; }
    setOuvert(null);
    toast(r.enAttente
      ? `Hors ligne : ${fmtMoney(n, currency)} gardés sur cet appareil, ils s’inscrivent au contrat ${c.reference} au retour du réseau, une seule fois.`
      : r.deja ? 'Ce versement était déjà inscrit : rien n’a été écrit deux fois.'
      : `${fmtMoney(n, currency)} encaissés : inscrits au contrat ${c.reference} et sur sa pièce.`);
  };

  return (
    <section className="trc-abo" aria-label="Abonnement" id="carte-abonnement">
      <div className="trc-abo__bandeau">
        <div><span>Contrats</span><b>{tousLesContrats.length}</b><small>depuis le premier</small></div>
        <div><span>Versé en tout</span><b>{fmtMoney(verseEnTout, currency)}</b><small>sur ses formules</small></div>
        <div className={releve.solde.dontEnRetardXof > 0 ? 'is-retard' : ''}>
          <span>À régler aujourd’hui</span>
          <b>{fmtMoney(releve.solde.parContrat.reduce((n, x) => n + x.aRegleAujourdhuiXof, 0), currency)}</b>
          <small>{releve.solde.dontEnRetardXof > 0 ? `dont ${fmtMoney(releve.solde.dontEnRetardXof, currency)} en retard` : 'échéances échues'}</small>
        </div>
        <div><span>Séances faites</span><b>{faitesEnTout}</b><small>toutes formules</small></div>
      </div>

      {releve.contrats.map((c) => {
        const p = c.plan;
        const paquet = c.mode === 'pack';
        const argent = c.argent;
        /* UN CONTRAT SANS ÉCHÉANCIER N'EST JAMAIS EN RETARD : son reste se dit
           « Échéancier à poser », et le comptoir le pose. */
        const aPoser = echeancierAPoser(c);
        const du = aPoser ? undefined : argent.echeances.find((e) => e.statut === 'en-retard' || e.statut === 'a-regler-aujourdhui');
        const montantDu = du ? argent.aRegleAujourdhuiXof : aPoser ? 0 : argent.pourOuvrir?.montantXof ?? argent.luneARegler?.montantXof ?? 0;
        const vivant = c.etat === 'en-cours' || c.etat === 'en-pause';
        const manquees = c.attribuees.filter((s) => s.etat === 'manquee' && !s.rendue);
        const g = ouvert?.sub === c.sub.id ? ouvert.geste : null;
        const alertes = releve.alertes.filter((a) => a.subId === c.sub.id);
        return (
          <article key={c.sub.id} className="trc-abo__contrat">
            <div className="trc-abo__tete">
              <div>
                <span className="trc-abo__eyebrow">Abonnement · {releve.contrats.length > 1 ? 'formule qui court' : 'contrat en cours'}</span>
                <div className="trc-abo__nom">{c.nom}</div>
                <div className="trc-abo__ref">
                  <b>{c.reference}</b>
                  {' · '}{c.sub.origine === 'couronne' ? `pris en ligne le ${dit(c.debutIso)}` : `depuis le ${dit(c.debutIso)}`}
                  {c.finIso ? ` · valable jusqu’au ${dit(c.finIso)}` : ''}
                  {c.lune ? ` · lune du ${dit(c.lune.du)} au ${dit(decaleLeJour(c.lune.au, -1))}` : ''}
                </div>
              </div>
              <div className="trc-abo__chips">
                <span className={`trc-abo__chip is-${c.etat}`}>{ETAT_LABEL[c.etat]}</span>
                {aPoser && <span className="trc-abo__chip is-jour">Échéancier à poser · reste {fmtMoney(aPoser.resteXof, currency)}</span>}
                {du && (
                  <span className={`trc-abo__chip ${du.statut === 'en-retard' ? 'is-retard' : 'is-jour'}`}>
                    {fmtMoney(argent.aRegleAujourdhuiXof, currency)}{du.statut === 'en-retard' ? ` en retard · ${pluriel(du.retardJours, 'jour', 'jours')}` : ' à régler aujourd’hui'}
                  </span>
                )}
              </div>
            </div>

            {alertes.length > 0 && !aPoser && (
              <ul className="trc-abo__alertes">
                {alertes.map((a) => <li key={`${a.genre}-${a.dueIso ?? ''}-${a.seanceId ?? ''}`}>Ma Couronne lui dit : « {a.texte} »</li>)}
              </ul>
            )}

            <div className="trc-abo__grille">
              <section>
                <p className="trc-abo__h">Séances par prestation{paquet ? '' : ' · lune en cours'}</p>
                {c.seances.length === 0 && <p className="trc-abo__note">Aucune prestation incluse.</p>}
                {c.seances.map((l) => (
                  <div key={l.serviceId} className="trc-abo__presta">
                    <span className="trc-abo__presta-n">{nomDuService(l.serviceId)}</span>
                    <BarreDesSeances l={l} />
                    <span className="trc-abo__presta-c">
                      {l.incluses === null
                        ? <>sans limite · <b>{l.faites}</b> {l.faites > 1 ? 'faites' : 'faite'}</>
                        : <>
                          <b>{l.faites}</b> {l.faites > 1 ? 'faites' : 'faite'}
                          {l.manquees > 0 && <> · <b>{l.manquees}</b> {l.manquees > 1 ? 'manquées' : 'manquée'}</>}
                          {' · '}<b>{l.reservees}</b> {l.reservees > 1 ? 'réservées' : 'réservée'}
                          {l.aCloturer > 0 && <> (dont {l.aCloturer} à clôturer)</>}
                          {' · '}<b>{l.disponibles}</b> {(l.disponibles ?? 0) > 1 ? 'disponibles' : 'disponible'} sur {l.incluses}
                        </>}
                    </span>
                  </div>
                ))}
                <p className="trc-abo__note">Barre pleine : faite ; hachurée : réservée ; brique : manquée ; vide : disponible.</p>
                {c.sub.prixRevu && (
                  <p className="trc-abo__note">
                    Prix revu le {dit(c.sub.prixRevu.le)} après le comptage : {francs(c.sub.prixRevu.ancienXof)} → {francs(c.sub.prixRevu.nouveauXof)}.
                  </p>
                )}
                {c.couvertsHorsFormule.length > 0 && (
                  <p className="trc-abo__note is-alerte">
                    {pluriel(c.couvertsHorsFormule.length, 'séance couverte', 'séances couvertes')} sans prestation de la formule : à revoir au rendez-vous.
                  </p>
                )}
              </section>
              <section>
                <p className="trc-abo__h">Échéancier</p>
                {aPoser && (
                  <p className="trc-abo__note is-alerte">
                    Échéancier à poser · reste {fmtMoney(aPoser.resteXof, currency)} : rien n’est convenu, donc rien n’est en retard. Posez les dates avec elle.
                  </p>
                )}
                {!aPoser && argent.echeances.length === 0 && !argent.luneARegler && !argent.aVenir.length && (
                  <p className="trc-abo__note">Aucune échéance écrite.</p>
                )}
                {!aPoser && argent.echeances.map((e) => (
                  <div key={e.numero} className={`trc-abo__ech is-${e.statut}`}>
                    <i aria-hidden="true" />
                    <span>
                      {e.numero === 1 ? '1re' : `${e.numero}e`} échéance
                      <small>
                        {e.statut === 'reglee' ? `réglée${e.regleeLe ? ` le ${dit(e.regleeLe)}` : ''}`
                          : e.statut === 'en-retard' ? `en attente depuis le ${dit(e.dueIso)} · ${pluriel(e.retardJours, 'jour', 'jours')} de retard`
                          : e.statut === 'a-regler-aujourdhui' ? 'à régler aujourd’hui'
                          : e.statut === 'retenue' ? `ouvre la formule, avant le ${dit(argent.pourOuvrir?.avantIso)}`
                          : e.statut === 'annulee' ? 'annulée'
                          : `à régler le ${dit(e.dueIso)}`}
                        {e.dueEcriteIso !== e.dueIso ? ` (écrite au ${dit(e.dueEcriteIso)} : porte close, elle passe au lundi)` : ''}
                      </small>
                    </span>
                    <b>{fmtMoney(e.statut === 'reglee' ? e.amountXof : e.resteXof || e.amountXof, currency)}</b>
                  </div>
                ))}
                {argent.luneARegler && (
                  <div className="trc-abo__ech is-a-regler-aujourdhui">
                    <i aria-hidden="true" />
                    <span>Lune suivante<small>non réglée depuis le {dit(argent.luneARegler.depuisIso)} : en pause, sans dette</small></span>
                    <b>{fmtMoney(argent.luneARegler.montantXof, currency)}</b>
                  </div>
                )}
                {argent.aVenir.filter((v) => v.genre === 'lune').map((v) => (
                  <div key={v.dueIso} className="trc-abo__ech is-a-venir">
                    <i aria-hidden="true" />
                    <span>Lune suivante<small>à régler avant le {dit(v.dueIso)}</small></span>
                    <b>{fmtMoney(v.montantXof, currency)}</b>
                  </div>
                ))}
                <p className="trc-abo__prix">
                  Réglé <b>{fmtMoney(argent.regleXof, currency)}</b>{paquet ? <> sur <b>{fmtMoney(argent.prixVenduXof, currency)}</b></> : null}
                  {argent.resteXof > 0 ? <> · reste <b>{fmtMoney(argent.resteXof, currency)}</b></> : null}
                  {argent.avoirXof > 0 ? <> · avoir <b>{fmtMoney(argent.avoirXof, currency)}</b></> : null}
                </p>
              </section>
            </div>

            <div className="trc-abo__gestes">
              {aPoser && (
                <button type="button" className="trc-abo__btn is-plein" aria-pressed={g === 'poser'} onClick={() => ouvre(c.sub.id, 'poser')}>
                  Poser l’échéancier
                </button>
              )}
              {montantDu > 0 && (
                <>
                  <button type="button" className="trc-abo__btn is-plein" aria-pressed={g === 'encaisser'} onClick={() => ouvre(c.sub.id, 'encaisser', montantDu)}>
                    Encaisser {fmtMoney(montantDu, currency)}
                  </button>
                  <button type="button" className="trc-abo__btn" aria-pressed={g === 'lien'} onClick={() => ouvre(c.sub.id, 'lien')}>
                    Envoyer un lien MND PAY
                  </button>
                </>
              )}
              <button type="button" className="trc-abo__btn" aria-pressed={g === 'prolonger'} disabled={!paquet || !vivant} onClick={() => ouvre(c.sub.id, 'prolonger')}>Prolonger</button>
              <button type="button" className="trc-abo__btn" aria-pressed={g === 'suspendre'} disabled={!vivant} onClick={() => ouvre(c.sub.id, 'suspendre')}>Suspendre</button>
              <button type="button" className="trc-abo__btn is-sensible" aria-pressed={g === 'resilier'} disabled={c.etat === 'retenue'} onClick={() => ouvre(c.sub.id, 'resilier')}>Résilier daté</button>
              <button type="button" className="trc-abo__btn is-sensible" aria-pressed={g === 'rendre'} disabled={manquees.length === 0} onClick={() => ouvre(c.sub.id, 'rendre')}>Rendre la séance</button>
              <button type="button" className="trc-abo__btn is-sensible" aria-pressed={g === 'revoir'} disabled={!paquet || !vivant} onClick={() => ouvre(c.sub.id, 'revoir')}>Revoir le prix après le comptage</button>
            </div>

            {g === 'poser' && (() => {
              const premiere = date || jour;
              const effet = effetDePoserLEcheancier(c, parts, premiere);
              return (
                <PanneauDEffet effet={effet}>
                  <div className="trc-abo__champs">
                    <label>Le reste, en<select value={parts} onChange={(e) => setParts(Number(e.target.value) as 1 | 2 | 3)}>
                      <option value={1}>1 fois</option><option value={2}>2 fois</option><option value={3}>3 fois</option>
                    </select></label>
                    <label>Première échéance<input type="date" value={premiere} min={jour} onChange={(e) => setDate(e.target.value)} /></label>
                  </div>
                  <Button variant="copper" size="sm" disabled={!!effet.refus} onClick={() => {
                    poseLEcheancier(c.sub.id, echeancierAEcrire(c, parts, premiere));
                    setOuvert(null);
                    toast('Échéancier posé : la cliente le lit dans Mon solde, avec un rappel la veille de chaque échéance.');
                  }}>
                    Poser l’échéancier
                  </Button>
                </PanneauDEffet>
              );
            })()}

            {g === 'encaisser' && (
              <PanneauDEffet effet={{
                lignes: [
                  `Inscrit au contrat ${c.reference} et sur sa pièce, sous le même identifiant : une seule écriture, par le serveur.`,
                  'Les relances de cette échéance s’arrêtent.',
                  c.etat === 'retenue' ? 'Le premier règlement ouvre la formule : ses séances incluses se réservent aussitôt.' : 'La cliente le lit aussitôt dans Mon solde.',
                ],
              }}>
                <div className="trc-abo__champs">
                  <label>Montant (F CFA)<input inputMode="numeric" value={montant} onChange={(e) => setMontant(e.target.value)} /></label>
                  <label>Moyen<select value={moyen} onChange={(e) => setMoyen(e.target.value)}>{methods.map((m) => <option key={m}>{m}</option>)}</select></label>
                </div>
                <Button variant="copper" size="sm" disabled={occupe} onClick={() => void encaisse(c)}>
                  {occupe ? 'Inscription…' : `Encaisser ${fmtMoney(parseInt(montant.replace(/[^0-9]/g, ''), 10) || 0, currency)}`}
                </Button>
              </PanneauDEffet>
            )}

            {g === 'lien' && (() => {
              const piece = c.sub.invoiceId ? invoices.find((i) => i.id === c.sub.invoiceId) : undefined;
              return (
                <PanneauDEffet effet={{
                  lignes: [
                    `Un lien MND PAY de ${fmtMoney(montantDu, currency)} part sur son WhatsApp : le message dit le montant, jamais le numéro de la pièce.`,
                    'Réglé, il s’inscrit au contrat et sur sa pièce, comme au comptoir.',
                  ],
                }}>
                  {piece && client.phone
                    ? (
                      <LienMndPay
                        branchId={piece.branchId} pieceId={piece.id} pieceNumero={piece.number} clientId={client.id}
                        telephone={client.phone.replace(/\D/g, '')} appel={appelDe(client)} resteXof={montantDu} currency={currency}
                      />
                    )
                    : (
                      <p className="trc-abo__refus">
                        {!client.phone
                          ? 'Pas de numéro sur sa fiche : le lien ne peut pas partir.'
                          : 'Ce contrat n’a pas encore de pièce : elle naît au premier règlement. Encaissez au comptoir, ou passez par KkiaPay depuis Ma Couronne.'}
                      </p>
                    )}
                </PanneauDEffet>
              );
            })()}

            {g === 'prolonger' && (() => {
              const aIso = c.finIso ? decaleLeJour(c.finIso, jours) : '';
              const effet = effetDeLaProlongation(c.sub as Subscriber, c, aIso);
              return (
                <PanneauDEffet effet={effet}>
                  <div className="trc-abo__champs">
                    <label>Repousser la fin de<select value={jours} onChange={(e) => setJours(Number(e.target.value))}>{[15, 30, 60, 90].map((n) => <option key={n} value={n}>{n} jours</option>)}</select></label>
                    <label>Motif<select value={motif} onChange={(e) => setMotif(e.target.value)}>{MOTIFS.map((m) => <option key={m}>{m}</option>)}</select></label>
                  </div>
                  <Button variant="copper" size="sm" disabled={!!effet.refus || !aIso} onClick={() => {
                    prolonge(c.sub.id, aIso, motif, quiEncaisse());
                    setOuvert(null);
                    toast(`Prolongée jusqu’au ${dit(aIso)}.`);
                  }}>
                    Prolonger jusqu’au {dit(aIso)}
                  </Button>
                </PanneauDEffet>
              );
            })()}

            {g === 'suspendre' && (() => {
              const au = decaleLeJour(jour, jours - 1);
              const effet = effetDeLaSuspension(c.sub as Subscriber, p, jour, au);
              return (
                <PanneauDEffet effet={effet}>
                  <div className="trc-abo__champs">
                    <label>Suspendre dès aujourd’hui, pendant<select value={jours} onChange={(e) => setJours(Number(e.target.value))}>{[15, 30, 60].map((n) => <option key={n} value={n}>{n} jours</option>)}</select></label>
                    <label>Motif<select value={motif} onChange={(e) => setMotif(e.target.value)}>{MOTIFS.map((m) => <option key={m}>{m}</option>)}</select></label>
                  </div>
                  <Button variant="copper" size="sm" disabled={!!effet.refus} onClick={() => {
                    suspend(c.sub.id, jour, au, motif, p);
                    setOuvert(null);
                    toast(`En pause jusqu’au ${dit(au)}.`);
                  }}>
                    Suspendre jusqu’au {dit(au)}
                  </Button>
                </PanneauDEffet>
              );
            })()}

            {g === 'resilier' && (() => {
              const effet = effetDeLaResiliation(c.sub as Subscriber, p, appts, ctx, date);
              /* UNE CHAQUE LUNE se résilie au terme de sa lune réglée : elle
                 court jusque-là, sans avoir (Yéman, 20 octobre 2026). */
              const finDeLune = c.lune ? decaleLeJour(c.lune.au, -1) : jour;
              const dates = paquet
                ? [jour, decaleLeJour(jour, 7), c.finIso ?? decaleLeJour(jour, 30)].filter((d, i, t) => t.indexOf(d) === i)
                : [finDeLune < jour ? jour : finDeLune];
              return (
                <PanneauDEffet effet={effet} sensible>
                  <div className="trc-abo__champs">
                    <label>Date de la résiliation
                      <select value={date} onChange={(e) => setDate(e.target.value)}>
                        {dates.map((d) => <option key={d} value={d}>{d === jour ? 'Aujourd’hui, ' : !paquet ? 'Au terme de la lune réglée, ' : ''}{dit(d)}</option>)}
                      </select>
                    </label>
                    <label>Motif<select value={motif} onChange={(e) => setMotif(e.target.value)}>{MOTIFS.map((m) => <option key={m}>{m}</option>)}</select></label>
                  </div>
                  <Button variant="copper" size="sm" disabled={!!effet.refus} onClick={() => {
                    resilie(c.sub.id, date, motif, jour);
                    setOuvert(null);
                    toast(`Résiliée au ${dit(date)}.`);
                  }}>
                    Résilier au {dit(date)}
                  </Button>
                </PanneauDEffet>
              );
            })()}

            {g === 'rendre' && (
              <div className="trc-abo__effet is-sensible">
                <p>Séances manquées sur ce contrat :</p>
                <div className="trc-abo__champs">
                  <label>Motif<select value={motif} onChange={(e) => setMotif(e.target.value)}>{MOTIFS.map((m) => <option key={m}>{m}</option>)}</select></label>
                </div>
                {manquees.map((s: SeanceDuContrat) => {
                  const effet = effetDeRendre(c, s);
                  return (
                    <div key={s.id} className="trc-abo__rendre">
                      <span>Le {dit(s.date)}{s.rang && s.total ? ` · séance ${s.rang} sur ${s.total}` : ''}</span>
                      <small>{effet.lignes[0]}</small>
                      <Button variant="ghost" size="sm" onClick={() => {
                        rendLaSeance(s.id, motif, quiEncaisse(), jour);
                        toast('Séance rendue : elle revient à la formule.');
                      }}>
                        Rendre la séance du {dit(s.date)}
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}

            {g === 'revoir' && (() => {
              const voulu = parseInt(prixCompte.replace(/[^0-9]/g, ''), 10) || 0;
              const effet = effetDuPrixRevu(c.sub as Subscriber, p, ctx, voulu);
              return (
                <PanneauDEffet effet={effet} sensible>
                  <div className="trc-abo__champs">
                    {/* LE CALIBRE COMPTÉ AU FAUTEUIL : le prix se relit sur la grille
                        (même juge que la vente) ; il reste corrigeable à la main. */}
                    <label>Calibre compté au fauteuil
                      <select value={calibreCompte} onChange={(e) => {
                        const id = e.target.value;
                        setCalibreCompte(id);
                        if (id) {
                          const { prixConvenuXof: _p, ...sansPrix } = c.sub as Subscriber;
                          setPrixCompte(String(prixVenduXof({ ...sansPrix, calibreVendu: id } as Subscriber, p, c.sub.cycle ?? 'mensuel')));
                        }
                      }}>
                        <option value="">Choisir le calibre</option>
                        {calibres.map((b) => <option key={b.id} value={b.id}>{bandLabel(b, calibres)}</option>)}
                      </select>
                    </label>
                    <label>Prix du calibre compté (F CFA)
                      <input inputMode="numeric" value={prixCompte} placeholder={String(argent.prixVenduXof)} onChange={(e) => setPrixCompte(e.target.value)} />
                    </label>
                  </div>
                  <Button variant="copper" size="sm" disabled={!effet.ok || voulu === argent.prixVenduXof} onClick={() => {
                    if (revoitLePrix(c.sub as Subscriber, p, ctx, voulu, calibreCompte || undefined)) {
                      setOuvert(null);
                      toast(`Prix revu : ${fmtMoney(voulu, currency)}. Ma Couronne l’annonce à la cliente.`);
                    }
                  }}>
                    Revoir le prix
                  </Button>
                </PanneauDEffet>
              );
            })()}
          </article>
        );
      })}

      {releve.anciens.length > 0 && (
        <div className="trc-abo__vie">
          <button type="button" className="trc-abo__vie-btn" aria-expanded={vieOuverte} onClick={() => setVieOuverte(!vieOuverte)}>
            {vieOuverte ? '−' : '+'} Sa ligne de vie · {pluriel(releve.anciens.length, 'formule passée', 'formules passées')}
          </button>
          {vieOuverte && (
            <ol>
              {releve.anciens.map((c) => (
                <li key={c.sub.id}>
                  <span>{dit(c.debutIso)}</span>
                  <span><b>{c.nom}</b> · {c.reference}</span>
                  <span>
                    {c.etat === 'resiliee' && c.resilieeLe ? `Résiliée le ${dit(c.resilieeLe)}`
                      : c.etat === 'effacee' ? `Retenue non réglée, effacée le ${dit(c.effaceeLe)}`
                      : `Terminée${c.finIso ? ` le ${dit(c.finIso)}` : ''}`}
                    {' · '}{pluriel(c.attribuees.filter((s) => s.compte && s.etat === 'faite').length, 'séance faite', 'séances faites')}
                    {c.argent.resteXof > 0 ? ` · reste ${fmtMoney(c.argent.resteXof, currency)}` : ''}
                    {c.argent.avoirXof > 0 ? ` · avoir ${fmtMoney(c.argent.avoirXof, currency)}` : ''}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </section>
  );
}
