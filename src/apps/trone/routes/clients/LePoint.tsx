import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { PageHead } from '../_ui';
import { Button, toast } from '../../../../ds/components';
import { fmtMoney } from '../../../../shared/currency';
import { appointmentsStore, apptPayeurId, type Appointment } from '../../../../shared/agenda';
import { invoicesStore, invoiceResteXof, nouvelleFacture, quiEncaisse, type Invoice } from '../../../../shared/finance';
import { personalDurationMin } from '../../../../shared/pricing';
import { arreteLePlan, decaleLaProchaine, planLu, sauteLaProchaine, PAS_DES_RELANCES_PROGRAMMEES, horsDuDimanche, jourPlusR } from '../../../../shared/relances-pur';
import {
  FILTRES_DU_POINT, LIBELLE_DU_RESTE, MOT_DU_REGLEMENT, ajouteLaLigne, resteAJour, attendLeModeleDuPoint, idDuPlan, lignesChangees, nouveauPlan, passeLeFiltre,
  poseLaRemiseDeLigne, remiseAjouteeXof, remiseLue, retireLaLigne,
  type EtatDuPlan, type FiltreDuPoint, type LignesDuRituel,
} from '../../../../shared/le-point-pur';
import { useEnvoiDeLaPiece } from '../vente/envoi-de-la-piece';
import { factureAEnvoyer } from './actions';
import {
  RdvModal, alignerFacturesDuRituel, apptDueXof, apptNetXof, arrondiDuCodeAuRdv, brutDuRituel, frShortAn, lignesAuTarif, tarifsDuRituel,
} from './_shared';
import { useLePoint, type LigneDuPoint, type PasDeLHistorique } from './le-point-donnees';
import ChoisirPourLePoint from './ChoisirPourLePoint';
import './le-point.css';

/* ══ LE POINT FINANCIER D'UNE CLIENTE — 21 novembre 2026 ═════════════════
   Maquette GqBogAWn…, « construis ». Une page, ouverte par « Le point » sur la
   fiche : ce qu'elle doit, chacun de ses rendez-vous et de ses factures (le
   statut, la pièce, le suivi WhatsApp, le reste), et trois gestes :
     · OUVRIR UNE LIGNE : changer ses prestations, poser des remises, et voir
       le rituel et ce qu'elle doit bouger avant d'enregistrer. Les règles de
       prix sont celles de la fenêtre du rendez-vous et de la Caisse ; ce que
       la page ne sait pas faire (date, maître, foyer, statut, forfait) reste
       dans « Ouvrir le rendez-vous complet » ;
     · COCHER des factures : envoyer le point maintenant (un PDF, un lien), ou
       PROGRAMMER sa relance (la tournée de 10 h la porte, même Trône fermé) ;
     · LE SUIVI : le plan de relance et ses jours (sauter, décaler, arrêter),
       et tout ce qui est parti et arrivé. Rien de cette page n'écrit dans la
       base hors des pièces et des rendez-vous, par leurs magasins. */

const JOURS = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'];
const MOIS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
const jourCourt = (iso: string): string => {
  const d = new Date(`${iso.slice(0, 10)}T12:00:00Z`);
  return Number.isNaN(d.getTime()) ? iso : `${JOURS[d.getUTCDay()]} ${d.getUTCDate()} ${MOIS[d.getUTCMonth()]}`;
};
const heureDite = (hhmm?: string): string => {
  const m = /^(\d{1,2}):(\d{2})/.exec(hhmm ?? '');
  return m ? (m[2] === '00' ? `${Number(m[1])} h` : `${Number(m[1])} h ${m[2]}`) : '';
};
const instantDit = (iso: string): string => {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return iso;
  const cot = new Date(t + 3_600_000);
  return `${jourCourt(cot.toISOString())} · ${cot.getUTCHours()} h ${String(cot.getUTCMinutes()).padStart(2, '0')}`;
};
const MOT_DU_SUIVI: Record<string, string> = {
  'en-attente': 'En attente', envoye: 'Envoyée', remis: 'Remise', lu: 'Lue', 'non-remis': 'Non remise', echec: 'Pas partie', ecarte: 'Écartée', regle: 'Arrivé', partiel: 'Arrivé',
};

export default function LePoint() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const clientId = params.get('id') ?? '';
  const [portee, setPortee] = useState<'sienne' | 'foyer'>('sienne');
  const p = useLePoint(clientId, portee);
  const currency = p.branch.currency;
  const f = (n: number) => fmtMoney(n, currency);
  const envoi = useEnvoiDeLaPiece();
  const [filtre, setFiltre] = useState<FiltreDuPoint>('tout');
  const [ouverte, setOuverte] = useState('');
  const [cochees, setCochees] = useState<string[]>([]);
  const [programmer, setProgrammer] = useState(false);
  const [enCours, setEnCours] = useState(false);
  const [fenetre, setFenetre] = useState<Appointment | null>(null);
  const demain = horsDuDimanche(jourPlusR(p.aujourdhui, 1));
  const [prog, setProg] = useState<{ debut: string; pas: number }>({ debut: demain, pas: 7 });
  /* Ce que l'éditeur ouvert ferait du dû, pour l'annoncer en tête avant d'enregistrer. */
  const [ecart, setEcart] = useState(0);

  /* Ouvert par le menu, sans cliente : on la choisit (25 novembre 2026). */
  if (!clientId) return <ChoisirPourLePoint />;
  if (!p.client) {
    return (
      <div className="trp-point">
        <PageHead eyebrow="Le Trône · Clientèle" title="Le point" sub="Cette cliente est introuvable dans la branche." />
        <Link to="/point">Choisir une autre cliente</Link>
      </div>
    );
  }
  const client = p.client;
  const prenom = (client.name || '').trim().split(/\s+/)[0] || 'Elle';
  const passees = p.lignes.filter((l) => l.etat !== 'a-venir' && l.etat !== 'annule');
  const du = passees.reduce((s, l) => s + l.resteXof, 0);
  const encaisse = passees.reduce((s, l) => s + l.verseXof, 0);
  const aVenir = p.lignes.filter((l) => l.etat === 'a-venir');
  const impayees = passees.filter((l) => l.resteXof > 0).sort((a, b) => a.date.localeCompare(b.date));
  const plusVieille = impayees[0];
  const depuis = plusVieille ? Math.max(0, Math.round((Date.parse(`${p.aujourdhui}T12:00:00Z`) - Date.parse(`${plusVieille.date}T12:00:00Z`)) / 86_400_000)) : 0;
  const vivants = p.plans.filter((x) => x.vivant);
  const prochaine = vivants.map((x) => x.prochaine).filter((x): x is string => !!x).sort()[0];
  const visibles = p.lignes.filter((l) => passeLeFiltre(l, filtre));

  /* ── LA SÉLECTION ── */
  const choisies = p.lignes.filter((l) => cochees.includes(l.cle) && l.cochable);
  const totalChoisi = choisies.reduce((s, l) => s + l.resteXof, 0);
  const bascule = (cle: string) => setCochees((c) => (c.includes(cle) ? c.filter((x) => x !== cle) : [...c, cle]));

  /** Les pièces des lignes choisies : la facture qui réclame, ou celle qu'on émet pour un rituel qui n'en a pas (choix 2).
      Un rituel déjà payé en partie reçoit la pièce de SON RESTE (`LIBELLE_DU_RESTE`), jamais une seconde pièce au prix entier. */
  const assureLesPieces = (ls: readonly LigneDuPoint[]): string[] => {
    const ids: string[] = [];
    for (const l of ls) {
      if (l.aRegler) { ids.push(l.aRegler.id); continue; }
      if (!l.appt) continue;
      if (l.verseXof > 0) {
        const inv = nouvelleFacture({
          branchId: l.appt.branchId, serie: 'MND', status: 'envoyée', date: l.appt.date || undefined,
          clientId: apptPayeurId(l.appt), clientName: l.appt.clientName,
          lines: [{ id: `l-${Date.now().toString(36)}`, label: LIBELLE_DU_RESTE(l.quoi), qty: 1, unitXof: l.resteXof, discountPct: 0 }],
          theme: 'Aube', master: l.appt.master,
          note: `Rituel du ${frShortAn(l.date)} · déjà réglé ${f(l.verseXof)}, reste ${f(l.resteXof)}.`,
        });
        invoicesStore.set((prev) => [{ ...inv, apptId: l.appt!.id }, ...prev]);
        ids.push(inv.id);
        continue;
      }
      const t = tarifsDuRituel(l.appt, p.ctxDe(p.ficheDe(l.appt.clientId)));
      const r = factureAEnvoyer(l.appt, p.byId, l.appt.branchId, t.prixPlein, t.gesteDe);
      if (r.ok) ids.push(r.inv.id);
      else toast(`Pas de facture pour le rituel du ${frShortAn(l.date)} : ${r.erreur}`);
    }
    return ids;
  };

  const envoyerLePoint = async (ids: readonly string[]) => {
    if (enCours || !ids.length) return;
    setEnCours(true);
    try { await envoi.point(p.payeurId, ids, { renvoi: true }); } finally { setEnCours(false); }
  };

  const programmerLaRelance = () => {
    if (!choisies.length) return;
    const ids = assureLesPieces(choisies);
    const plan = nouveauPlan({ id: idDuPlan(Date.now(), Math.random().toString(36).slice(2)), debut: prog.debut, pas: prog.pas, le: new Date().toISOString(), par: quiEncaisse() });
    if (!plan || !ids.length) { toast('La relance n’est pas programmée : le jour n’est pas valable.'); return; }
    invoicesStore.set((prev) => prev.map((i) => (ids.includes(i.id) ? { ...i, relanceProgrammee: plan } : i)));
    setProgrammer(false);
    setCochees([]);
    toast(`Relance programmée : ${jourCourt(plan.jours[0])} à 10 h${plan.jours.length > 1 ? `, puis ${plan.jours.slice(1).map(jourCourt).join(', ')}, tant que ce n’est pas réglé` : ''}.`);
  };

  /** Un geste sur un plan : chacune de ses pièces reçoit le plan changé. */
  const surLePlan = (e: EtatDuPlan, geste: (pl: NonNullable<ReturnType<typeof planLu>>) => NonNullable<ReturnType<typeof planLu>>) => {
    invoicesStore.set((prev) => prev.map((i) => {
      if (!e.pieceIds.includes(i.id)) return i;
      const pl = planLu(i.relanceProgrammee);
      return pl ? { ...i, relanceProgrammee: geste(pl) } : i;
    }));
  };

  const datesChoisies = choisies.map((l) => l.aRegler?.date ?? l.date);
  const attend = choisies.length > 1 && attendLeModeleDuPoint(datesChoisies, p.modelePoint);

  return (
    <div className="trp-point">
      <PageHead
        eyebrow={`Le Trône · Clientèle · ${client.name}`}
        title={`Le point de ${prenom}`}
        sub="Ses rendez-vous et ses factures, ce qu’elle doit, ce qui est parti sur WhatsApp et ce qui partira."
      />
      <div className="trp-point__haut">
        <Link to={`/customers?id=${client.id}`} className="trp-point__retour">Retour à sa fiche</Link>
        {p.tetes.length > 1 && (
          <div className="trp-point__portee" role="group" aria-label="Portée">
            <button type="button" aria-pressed={portee === 'sienne'} className={portee === 'sienne' ? 'is-on' : ''} onClick={() => setPortee('sienne')}>Ses mouvements</button>
            <button type="button" aria-pressed={portee === 'foyer'} className={portee === 'foyer' ? 'is-on' : ''} onClick={() => setPortee('foyer')}>{`Tout le foyer · ${p.tetes.length} têtes`}</button>
          </div>
        )}
      </div>

      <div className="trp-point__phrase">
        <p className="trp-point__grand">
          {du > 0
            ? <>{prenom} doit <span className="is-du">{f(du)}</span> à la Maison.</>
            : <>{prenom} ne doit rien à la Maison.</>}
        </p>
        <p className="trp-point__sous">
          {plusVieille ? `Depuis ${depuis} jour${depuis > 1 ? 's' : ''} · ${plusVieille.quoi} du ${frShortAn(plusVieille.date)}, pas encore soldé.` : 'Tout ce qui a eu lieu est réglé.'}
        </p>
        {ecart !== 0 && <p className="trp-point__apres">{`${f(Math.max(0, du - ecart))} si vous enregistrez la modification en cours.`}</p>}
      </div>

      <div className="trp-point__chiffres">
        <div className="is-du"><span>Elle doit aujourd’hui</span><b>{f(du)}</b><small>{impayees.length ? `${impayees.length} ligne${impayees.length > 1 ? 's' : ''} à régler` : 'rien à régler'}</small></div>
        <div><span>Déjà encaissé</span><b>{f(encaisse)}</b><small>sur ce qui a eu lieu</small></div>
        <div><span>Prochaine relance</span><b>{prochaine ? jourCourt(prochaine) : 'Aucune'}</b><small>{prochaine ? 'à 10 h, tant que ce n’est pas réglé' : 'rien de programmé'}</small></div>
        <div><span>À venir</span><b>{f(aVenir.reduce((s, l) => s + l.totalXof, 0))}</b><small>{`${aVenir.length} rendez-vous`}</small></div>
        {p.avoir > 0 && <div><span>Avoir sur son compte</span><b>{f(p.avoir)}</b><small>il se consomme au prochain règlement</small></div>}
      </div>

      <div className="trp-point__filtres" role="group" aria-label="Filtrer la liste">
        {FILTRES_DU_POINT.map(({ k, dit }) => (
          <button key={k} type="button" aria-pressed={filtre === k} className={filtre === k ? 'is-on' : ''} onClick={() => setFiltre(k)}>{`${dit} · ${p.comptes[k]}`}</button>
        ))}
      </div>

      <div className="trp-point__liste" role="table" aria-label="Ses rendez-vous et ses factures">
        <div className="trp-point__entete" role="row">
          <span role="columnheader" aria-label="Choisir" />
          <span role="columnheader">Date</span><span role="columnheader">Ce qui a été fait</span><span role="columnheader">Le rendez-vous</span>
          <span role="columnheader">La pièce et son suivi</span>
          <span role="columnheader" className="is-nb">Total</span><span role="columnheader" className="is-nb">Reste</span>
        </div>
        {visibles.length === 0 && <p className="trp-point__vide">Rien dans ce filtre.</p>}
        {visibles.map((l) => {
          const ouverteIci = ouverte === l.cle;
          const piece = l.aRegler ?? l.pieces[0];
          const plan = p.plans.find((x) => x.vivant && l.pieces.some((i) => x.pieceIds.includes(i.id)));
          const pas = p.historique.find((h) => h.genre !== 'versement' && piece && h.detail.split(', ').includes(piece.number ?? '§'));
          return (
            <div key={l.cle} className={`trp-point__ligne${ouverteIci ? ' is-ouverte' : ''}`} role="row">
              <span className="trp-point__case">
                {l.cochable && (
                  <input type="checkbox" checked={cochees.includes(l.cle)} onChange={() => bascule(l.cle)} aria-label={`Choisir ${l.quoi} du ${frShortAn(l.date)} pour le point`} />
                )}
              </span>
              <button type="button" className="trp-point__corps" aria-expanded={ouverteIci} onClick={() => { setOuverte(ouverteIci ? '' : l.cle); setEcart(0); }}>
                <span className="trp-point__c"><span>{frShortAn(l.date)}</span><small>{heureDite(l.heure) || (l.genre === 'facture' ? 'Caisse' : '')}</small></span>
                <span className="trp-point__c is-quoi"><span>{l.quoi}</span><small>{l.sous}</small></span>
                <span className="trp-point__c"><span className={`trp-point__statut is-${l.ton}`}>{l.statut}</span></span>
                {/* La pièce, son état, puis ce qui est parti sur WhatsApp et la prochaine relance. */}
                <span className="trp-point__c"><span>{piece?.number ?? (l.etat === 'a-venir' || l.etat === 'annule' ? '—' : 'Pas encore de pièce')}</span><small className={`is-${l.etat}`}>{MOT_DU_REGLEMENT[l.etat]}</small>
                  {(pas || piece?.whatsapp?.partieLe) && <small className="is-suivi">{pas ? `${pas.quoi === 'Relance programmée' || pas.quoi === 'Relance de la tournée' ? 'Relancée' : 'Envoyée'} le ${jourCourt(pas.quand)}${pas.etat === 'lu' ? ' · lue' : ''}` : `Envoyée le ${jourCourt(piece!.whatsapp!.partieLe!)}`}</small>}
                  {plan?.prochaine && <small className="is-plan">{`Relance programmée le ${jourCourt(plan.prochaine)}`}</small>}</span>
                <span className="trp-point__c is-nb"><span>{f(l.totalXof)}</span></span>
                <span className="trp-point__c is-nb"><span className={l.etat === 'du' || l.etat === 'partiel' ? 'is-du' : l.etat === 'regle' ? 'is-ok' : ''}>{l.etat === 'a-venir' ? `${f(l.resteXof)} le jour` : l.resteXof > 0 ? f(l.resteXof) : l.etat === 'annule' ? '—' : 'soldé'}</span>
                  {l.verseXof > 0 && <small>{`${f(l.verseXof)} versés`}</small>}</span>
              </button>
              {ouverteIci && l.appt && (l.geste === 'tout' || l.geste === 'remises' || l.geste === 'ajout') && (
                <EditeurDuRituel
                  key={l.appt.id}
                  ligne={l}
                  appt={l.appt}
                  point={p}
                  duAvant={du}
                  f={f}
                  onEcart={setEcart}
                  onFenetre={() => setFenetre(l.appt ?? null)}
                  onFini={() => { setEcart(0); }}
                />
              )}
              {ouverteIci && !(l.appt && (l.geste === 'tout' || l.geste === 'remises' || l.geste === 'ajout')) && (
                <div className="trp-point__lecture">
                  <p>{l.genre === 'facture'
                    ? (l.resteXof > 0 ? 'Une facture de la Caisse : elle se corrige depuis Factures & devis.' : 'Une vente réglée : elle se corrige par un avoir, depuis sa facture.')
                    : l.etat === 'annule' ? 'Annulé : rien n’est dû.'
                      : 'Ce rendez-vous se change dans sa fenêtre (forfait, formule, séance de suite, prestation sur devis, ou déjà soldé).'}</p>
                  {l.appt ? <Button variant="ghost" size="sm" onClick={() => setFenetre(l.appt ?? null)}>Ouvrir le rendez-vous complet</Button>
                    : <Button variant="ghost" size="sm" onClick={() => navigate('/factures')}>Ouvrir Factures & devis</Button>}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="trp-point__selection" aria-live="polite">
        <div className="trp-point__selection-haut">
          <div>
            <b>{choisies.length ? `${choisies.length} ligne${choisies.length > 1 ? 's' : ''} choisie${choisies.length > 1 ? 's' : ''} · ${f(totalChoisi)}` : 'Cochez une ou plusieurs lignes à régler'}</b>
            <small>{choisies.length ? 'en un seul message, un seul PDF, un seul lien « Régler »' : 'pour envoyer le point maintenant, ou programmer sa relance'}</small>
          </div>
          <div className="trp-point__gestes">
            <Button variant="copper" disabled={!choisies.length || enCours} onClick={() => { void envoyerLePoint(assureLesPieces(choisies)); }}>{enCours ? 'Envoi…' : 'Envoyer le point maintenant'}</Button>
            <Button variant="ghost" disabled={!choisies.length} aria-expanded={programmer} onClick={() => setProgrammer((x) => !x)}>Programmer une relance</Button>
          </div>
        </div>
        {programmer && choisies.length > 0 && (
          <div className="trp-point__programmer">
            <div className="trp-point__programmer-champs">
              <label htmlFor="trp-point-jour">Le premier jour</label>
              <input id="trp-point-jour" type="date" min={demain} value={prog.debut} onChange={(e) => setProg((x) => ({ ...x, debut: e.target.value || x.debut }))} />
              <span className="trp-point__note">{`${jourCourt(horsDuDimanche(prog.debut))} à 10 h, l’heure de la tournée${horsDuDimanche(prog.debut) !== prog.debut ? ' (jamais le dimanche : le lundi)' : ''}`}</span>
              <span className="trp-point__etiquette">Répéter</span>
              <div className="trp-point__puces" role="group" aria-label="Répéter">
                {PAS_DES_RELANCES_PROGRAMMEES.map((pas) => (
                  <button key={pas} type="button" aria-pressed={prog.pas === pas} className={prog.pas === pas ? 'is-on' : ''} onClick={() => setProg((x) => ({ ...x, pas }))}>
                    {pas === 0 ? 'Une fois' : `Tous les ${pas} jours`}
                  </button>
                ))}
              </div>
              <p className="trp-point__note">Quatre relances au plus, jamais un dimanche. Tout s’arrête dès qu’elle règle ou qu’elle vous écrit : la conversation passe alors à l’équipe.</p>
              {attend && <p className="trp-point__alerte">Ces factures sont de jours différents : leur rappel groupé attend que Meta approuve le modèle du point. D’ici là, la relance ne partira pas ; « Envoyer le point maintenant » part, lui.</p>}
              {!p.relancesPossibles && <p className="trp-point__alerte">Le paiement en ligne ou Tap &amp; Go est éteint (Paramètres) : une relance n’aurait pas de bouton « Régler », la tournée ne la portera pas.</p>}
              <div className="trp-point__gestes">
                <Button variant="copper" disabled={prog.debut < demain} onClick={programmerLaRelance}>Programmer</Button>
                <Button variant="ghost" onClick={() => setProgrammer(false)}>Fermer</Button>
              </div>
            </div>
          </div>
        )}
      </div>

      <section className="trp-point__suivi" aria-label="Le suivi">
        <h2>Le suivi</h2>
        {p.plans.filter((x) => x.vivant || x.jours.some((j) => j.etat === 'partie')).slice(0, 4).map((e) => (
          <CarteDuPlan
            key={e.plan.plan}
            e={e}
            pieces={p.piecesDuCompte}
            aujourdhui={p.aujourdhui}
            f={f}
            envoyer={(ids) => { void envoyerLePoint(ids); }}
            geste={(g) => surLePlan(e, g)}
          />
        ))}
        <Historique pas={p.historique} f={f} />
      </section>

      {fenetre && <RdvModal appt={fenetre} onClose={() => setFenetre(null)} />}
    </div>
  );
}

/* ── L'ÉDITEUR D'UN RITUEL, SUR LA PAGE ────────────────────────────────────
   Le brouillon ne touche à rien avant « Enregistrer ». À l'enregistrement :
   les lignes (prestations, remises de ligne, mains), le prix relu au tarif
   de sa tête quand les lignes ont changé (comme la fenêtre), la remise
   ajoutée en francs, puis les factures liées qui suivent
   (`alignerFacturesDuRituel`). */
function EditeurDuRituel({ ligne, appt, point, duAvant, f, onEcart, onFenetre, onFini }: {
  ligne: LigneDuPoint;
  appt: Appointment;
  point: ReturnType<typeof useLePoint>;
  duAvant: number;
  f: (n: number) => string;
  onEcart: (x: number) => void;
  onFenetre: () => void;
  onFini: () => void;
}) {
  const geste = ligne.geste;
  const [lignes, setLignes] = useState<LignesDuRituel>({ serviceIds: [...appt.serviceIds], remisesLignes: appt.remisesLignes ? [...appt.remisesLignes] : undefined, mains: appt.mains });
  const [saisie, setSaisie] = useState('');
  const [unite, setUnite] = useState<'%' | 'F'>('F');
  const [ajouter, setAjouter] = useState('');
  /* Le tarif de SA tête (calibre, Juste Prix, longueur figée), comme la fenêtre du rendez-vous. */
  const ctx = point.ctxDe(point.ficheDe(appt.clientId));
  const brouillon = { ...appt, ...lignes };
  const tarifs = tarifsDuRituel(brouillon, ctx);
  const auTarif = lignesAuTarif(brouillon, point.byId, tarifs);
  const change = lignesChangees(appt, lignes);
  const brut = brutDuRituel(brouillon, point.byId, tarifs);
  const priceXof = change ? brut + arrondiDuCodeAuRdv({ ...brouillon, priceXof: undefined }, point.byId, brut) : appt.priceXof;
  const sansAjout: Appointment = { ...brouillon, priceXof };
  const netSans = apptNetXof(sansAjout, point.byId);
  const plafond = geste === 'ajout' && ligne.verseXof > 0 ? apptDueXof(appt, point.byId) : netSans;
  const ajout = remiseAjouteeXof(netSans, Number(saisie), unite, plafond);
  const apercu: Appointment = { ...sansAjout, discountXof: (appt.discountXof ?? 0) + ajout || undefined };
  const netAvant = apptNetXof(appt, point.byId);
  const netApres = apptNetXof(apercu, point.byId);
  const resteAvant = apptDueXof(appt, point.byId);
  const resteApres = apptDueXof(apercu, point.byId);
  const passe = ligne.etat !== 'a-venir';
  const ecart = passe ? resteAvant - resteApres : 0;
  const bouge = change || ajout > 0;
  /* Le chiffre en tête de page suit l'éditeur ; il retombe quand l'éditeur se ferme. */
  useEffect(() => { onEcart(ecart); }, [ecart, onEcart]);
  useEffect(() => () => onEcart(0), [onEcart]);

  const enregistrer = () => {
    if (!bouge) return;
    const tarifsFinaux = tarifsDuRituel(brouillon, ctx);
    const duree = Math.max(15, tarifsFinaux.chosen.reduce((n, sv) => n + personalDurationMin(sv, tarifsFinaux.pricing), 0) || 0);
    appointmentsStore.set((prev) => prev.map((x) => (x.id === appt.id ? {
      ...x,
      ...(change ? { serviceIds: lignes.serviceIds, remisesLignes: lignes.remisesLignes, mains: lignes.mains, priceXof } : {}),
      /* Un rituel passé dont les prestations changent garde le compte rendu de sa durée (la fenêtre fait de même). */
      ...(change && geste === 'tout' && typeof x.dureeMin === 'number' ? { dureeMin: duree } : {}),
      ...(ajout > 0 ? { discountXof: (x.discountXof ?? 0) + ajout } : {}),
    } : x)));
    const maj = appointmentsStore.get().find((x) => x.id === appt.id);
    if (maj) alignerFacturesDuRituel(maj, point.byId, tarifsFinaux.prixPlein, point.produits, tarifsFinaux.gesteDe, { argent: f, lockCount: tarifsFinaux.pricing.lockCount });
    /* LA PIÈCE DU RESTE suit le nouveau reste : l'alignement n'en touche que le libellé. */
    if (maj) {
      const du = apptDueXof(maj, point.byId);
      invoicesStore.set((prev) => {
        let touche = false;
        const suite = prev.map((i) => {
          if (i.apptId !== maj.id || i.status === 'payée') return i;
          const r = resteAJour(i, du);
          if (r) touche = true;
          return r ?? i;
        });
        return touche ? suite : prev;
      });
    }
    toast(`Enregistré : ce rituel passe de ${f(netAvant)} à ${f(netApres)}${passe ? `, il reste ${f(resteApres)} à régler` : ''}.`);
    setSaisie('');
    onFini();
  };
  const annuler = () => {
    setLignes({ serviceIds: [...appt.serviceIds], remisesLignes: appt.remisesLignes ? [...appt.remisesLignes] : undefined, mains: appt.mains });
    setSaisie('');
  };
  const autres = point.services.filter((s) => !s.archived && !lignes.serviceIds.includes(s.id)).sort((a, b) => a.name.localeCompare(b.name, 'fr'));

  return (
    <div className="trp-point__editeur">
      <div className="trp-point__editeur-gauche">
        <p className="trp-point__titre">
          {geste === 'ajout' ? `Une remise sur ce qui reste · ${frShortAn(appt.date)}` : geste === 'remises' ? `Les remises de ce rendez-vous · ${frShortAn(appt.date)}` : `Modifier ce rituel · ${frShortAn(appt.date)}`}
        </p>
        {geste === 'ajout' && (
          <p className="trp-point__cadre">{ligne.verseXof > 0
            ? `Ce rituel a déjà reçu ${f(ligne.verseXof)} : ses prestations restent telles qu’elles ont été payées. Une remise se pose sur ce qui reste ; ce qui est versé ne bouge pas.`
            : 'Ce rituel porte une remise famille : ses prestations se changent dans le rendez-vous complet, qui la recalcule. Ici, une remise en plus.'}</p>
        )}
        {geste === 'remises' && <p className="trp-point__cadre">Un rendez-vous à venir : ses prestations (et donc sa durée au Carnet) se changent dans le rendez-vous complet. Ici, ses remises.</p>}
        <div className="trp-point__lignes">
          <div className="trp-point__lignes-entete"><span>Prestation</span><span className="is-nb">Prix</span><span>Remise</span><span className="is-nb">Net</span><span /></div>
          {(geste === 'ajout' ? auTarif.map((x) => ({ ...x, figee: true })) : auTarif.map((x) => ({ ...x, figee: false }))).map((x) => {
            const r = remiseLue(lignes, x.i);
            return (
              <div key={`${x.i}-${x.sv.id}`} className="trp-point__l">
                <span>{x.sv.name}{x.gestePct > 0 ? <small>{` · geste de la Maison −${x.gestePct} %`}</small> : null}</span>
                <span className="is-nb">{f(x.plein)}</span>
                {x.figee ? <span className="trp-point__note">telle qu’elle a été posée</span> : (
                  <span className="trp-point__remise">
                    <input
                      type="number" min={0} inputMode="numeric" placeholder="0" value={r.valeur || ''}
                      aria-label={`Remise sur ${x.sv.name}`}
                      onChange={(e) => setLignes((a) => poseLaRemiseDeLigne(a, x.i, Number(e.target.value), r.unite))}
                    />
                    <button type="button" aria-pressed={r.unite === '%'} className={r.unite === '%' ? 'is-on' : ''} onClick={() => setLignes((a) => poseLaRemiseDeLigne(a, x.i, r.valeur, '%'))}>%</button>
                    <button type="button" aria-pressed={r.unite === 'F'} className={r.unite === 'F' ? 'is-on' : ''} onClick={() => setLignes((a) => poseLaRemiseDeLigne(a, x.i, r.valeur, 'F'))}>F</button>
                  </span>
                )}
                <span className="is-nb">{f(x.net)}</span>
                {geste === 'tout' && lignes.serviceIds.length > 1
                  ? <button type="button" className="trp-point__retirer" aria-label={`Retirer ${x.sv.name}`} onClick={() => setLignes((a) => retireLaLigne(a, x.i))}>Retirer</button>
                  : <span />}
              </div>
            );
          })}
          {geste === 'tout' && (
            <div className="trp-point__ajouter">
              <label htmlFor={`trp-point-ajout-${appt.id}`}>Ajouter une prestation</label>
              <select id={`trp-point-ajout-${appt.id}`} value={ajouter} onChange={(e) => setAjouter(e.target.value)}>
                <option value="">Choisir…</option>
                {autres.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
              <Button variant="ghost" size="sm" disabled={!ajouter} onClick={() => { setLignes((a) => ajouteLaLigne(a, ajouter)); setAjouter(''); }}>Ajouter</Button>
            </div>
          )}
        </div>
        <div className="trp-point__remise-g">
          <label htmlFor={`trp-point-remise-${appt.id}`}>{geste === 'ajout' && ligne.verseXof > 0 ? 'Remise sur ce qui reste' : 'Ajouter une remise sur le rituel'}</label>
          <input id={`trp-point-remise-${appt.id}`} type="number" min={0} inputMode="numeric" placeholder="0" value={saisie} onChange={(e) => setSaisie(e.target.value)} />
          <button type="button" aria-pressed={unite === '%'} className={unite === '%' ? 'is-on' : ''} onClick={() => setUnite('%')}>%</button>
          <button type="button" aria-pressed={unite === 'F'} className={unite === 'F' ? 'is-on' : ''} onClick={() => setUnite('F')}>F</button>
          <span className="trp-point__note">{(appt.discountXof ?? 0) > 0 || (appt.discountPct ?? 0) > 0
            ? `déjà sur ce rituel : ${[appt.discountPct ? `−${appt.discountPct} %` : '', appt.discountXof ? `−${f(appt.discountXof)}` : ''].filter(Boolean).join(', ')}`
            : 'les remises de ligne d’abord, celle du rituel ensuite'}</span>
        </div>
        <button type="button" className="trp-point__lien" onClick={onFenetre}>Ouvrir le rendez-vous complet (date, maître, foyer, statut)</button>
      </div>

      <div className="trp-point__si">
        <span className="trp-point__etiquette">Si vous enregistrez</span>
        <div><small>Ce rituel</small><p>{netApres !== netAvant && <s>{f(netAvant)}</s>}<b>{f(netApres)}</b></p></div>
        <div><small>{passe ? 'Ce qu’elle doit en tout' : 'Restera à payer le jour'}</small>
          <p>{passe ? (ecart !== 0 && <s>{f(duAvant)}</s>) : (resteApres !== resteAvant && <s>{f(resteAvant)}</s>)}<b className="is-du">{f(passe ? Math.max(0, duAvant - ecart) : resteApres)}</b></p></div>
        <p className="trp-point__note">{ligne.pieces.length ? `La facture ${ligne.pieces.map((i) => i.number).join(', ')} suit ; ce qui est déjà versé ne bouge pas.` : 'Le Carnet, la Caisse et son compte suivent la même règle.'}</p>
        <div className="trp-point__gestes">
          <Button variant="copper" disabled={!bouge} onClick={enregistrer}>Enregistrer</Button>
          <Button variant="ghost" disabled={!bouge} onClick={annuler}>Annuler</Button>
        </div>
      </div>
    </div>
  );
}

/* ── LE PLAN DE RELANCE ── */
function CarteDuPlan({ e, pieces, aujourdhui, f, envoyer, geste }: {
  e: EtatDuPlan; pieces: readonly Invoice[]; aujourdhui: string; f: (n: number) => string;
  envoyer: (ids: string[]) => void;
  geste: (g: (pl: NonNullable<ReturnType<typeof planLu>>) => NonNullable<ReturnType<typeof planLu>>) => void;
}) {
  const siennes = pieces.filter((i) => e.pieceIds.includes(i.id));
  const quiDoivent = siennes.filter((i) => invoiceResteXof(i) > 0);
  const total = quiDoivent.reduce((s, i) => s + invoiceResteXof(i), 0);
  const [decale, setDecale] = useState('');
  return (
    <div className={`trp-point__plan${e.vivant ? '' : ' is-fini'}`}>
      <div className="trp-point__plan-haut">
        <b>{`Relance · ${siennes.map((i) => i.number).join(' et ')}`}</b>
        <span className={`trp-point__statut is-${e.vivant ? 'suggere' : 'annule'}`}>{e.vivant ? 'Programmée' : e.arrete ? 'Arrêtée' : quiDoivent.length ? 'Terminée' : 'Réglée'}</span>
      </div>
      <p className="trp-point__note">{`${e.plan.jours.length > 1 ? `${e.plan.jours.length} relances à 10 h` : 'Une relance à 10 h'} · ${f(total)} restent à régler${e.plan.par ? ` · programmée par ${e.plan.par}` : ''} · s’arrête dès qu’elle règle ou vous écrit.`}</p>
      <div className="trp-point__jours">
        {e.jours.map((j) => (
          <span key={j.jour} className={`trp-point__jour is-${j.etat}`}>
            {`${jourCourt(j.jour)}${j.etat === 'partie' ? ` · ${MOT_DU_SUIVI[j.envoi ?? 'envoye'].toLowerCase()}` : j.etat === 'sautee' ? ' · sautée' : j.etat === 'prochaine' ? ' · 10 h' : j.etat === 'sans-depart' ? ' · pas partie' : ''}`}
          </span>
        ))}
      </div>
      {e.vivant && (
        <div className="trp-point__gestes">
          <Button variant="ghost" size="sm" disabled={!quiDoivent.length} onClick={() => envoyer(quiDoivent.map((i) => i.id))}>Envoyer maintenant</Button>
          <Button variant="ghost" size="sm" onClick={() => geste((pl) => sauteLaProchaine(pl, aujourdhui))}>Sauter la prochaine</Button>
          <span className="trp-point__decaler">
            <label htmlFor={`trp-point-decale-${e.plan.plan}`}>Décaler la prochaine au</label>
            <input id={`trp-point-decale-${e.plan.plan}`} type="date" min={jourPlusR(aujourdhui, 1)} value={decale} onChange={(x) => setDecale(x.target.value)} />
            <Button variant="ghost" size="sm" disabled={!decale} onClick={() => { geste((pl) => decaleLaProchaine(pl, aujourdhui, decale)); setDecale(''); }}>Décaler</Button>
          </span>
          <button type="button" className="trp-point__arreter" onClick={() => geste((pl) => arreteLePlan(pl, new Date().toISOString()))}>Arrêter les relances</button>
        </div>
      )}
    </div>
  );
}

/* ── L'HISTORIQUE ── */
function Historique({ pas, f }: { pas: readonly PasDeLHistorique[]; f: (n: number) => string }) {
  if (!pas.length) return <p className="trp-point__note">Rien n’est encore parti sur WhatsApp pour ces factures.</p>;
  return (
    <div className="trp-point__histo">
      {pas.map((h, k) => {
        const versement = h.genre === 'versement';
        const [montant, sur] = versement ? h.detail.split('|') : ['', h.detail];
        return (
          <div key={`${h.quand}-${k}`} className="trp-point__h">
            <span className="trp-point__note">{h.quand.length > 10 ? instantDit(h.quand) : jourCourt(h.quand)}</span>
            <span>{versement ? `${h.quoi} · ${f(Number(montant))}` : h.quoi}<small>{sur}</small></span>
            <span className={`trp-point__statut is-${versement ? 'honore' : h.etat === 'lu' ? 'lu' : h.etat === 'echec' || h.etat === 'non-remis' ? 'annule' : 'avenir'}`}>{MOT_DU_SUIVI[h.etat] ?? h.etat}</span>
          </div>
        );
      })}
    </div>
  );
}
