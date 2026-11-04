import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from '../../../../ds/components';
import { demandeUnTexte } from '../../../../ds/demande';
import { useBranch } from '../../../../shared/branches';
import { useStaff as useMaTete } from '../../../../shared/auth';
import { appointmentsStore, type Appointment } from '../../../../shared/agenda';
import { useCategories, useServices, useProducts } from '../../../../shared/catalog';
import { useClients } from '../../../../shared/clients';
import { useModelBands, useBandSets } from '../../../../shared/pricing';
import { jourPropose } from '../../../../shared/caisse-du-soir-pur';
import { francsDits, type GesteDuComptoir } from '../../../../shared/cloture-du-jour-pur';
import { momentDit, tranche } from '../../../../shared/cloture-du-jour';
import { tarifsDuRituel, useBranchAppointments, useServicesById } from '../clients/_shared';
import { useClotureDuJour } from './useClotureDuJour';
import { honoreSansEncaisser, PayAppointmentModal } from '../clients/actions';
import { useEnvoiDeLaPiece } from '../vente/envoi-de-la-piece';
import { JournalDeCaisse } from './JournalDeCaisse';
import { todayISO } from './_shared';
import './la-journee.css';

/* ══ LA JOURNÉE — 4 novembre 2026 ════════════════════════════════════════
   « Tous les jours à 15 h et à 19 h, qu'Opale clôture toutes les factures…
   et qu'on puisse faire la caisse du jour », puis « relier ce travail avec
   la caisse du jour que nous tenons dans le Trône », puis « la caisse du
   jour en fin de page… combiner le travail et supprimer la barre de
   navigation de la caisse du jour » (Yéman ; maquette 9KCMgAb1…,
   « construis »).

   UNE SEULE PAGE, SANS BARRE D'ONGLETS :
     · EN HAUT, la clôture de Grenat : chaque rendez-vous du jour avec son
       état et le geste qui le règle d'un toucher (« Encaisser », « Honoré »,
       « Absente », « Annulée ») ; les alarmes ; ce que Grenat a fait seul ;
       le verdict. Elle se recalcule à l'écran avec LA MÊME RÈGLE que la
       fonction (`clotureDuJour`, cloture-du-jour-pur.ts) et dit le dernier
       passage de Grenat.
     · EN BAS, la caisse du jour (`JournalDeCaisse`, déplacé de la Caisse) :
       « Clôturer la caisse » ne s'allume que sur une journée close.

   Les gestes du comptoir passent par les MÊMES chemins que le Carnet
   (encaisser, terminer la séance, annuler) : deux chemins pour un geste
   finiraient par ne plus dire la même chose. Trancher une alarme ou un
   constat est réservé à la direction (souverain), la base le garde (0156). */

const ETAT_TON: Record<string, string> = {
  'a-venir': 'cuivre', 'en-cours': 'cuivre', 'a-encaisser': 'ko', 'sans-etat': 'ko', regle: 'cuivre', 'a-revoir': 'ko', clos: 'ok', annule: 'ok',
};
const GESTE_DIT: Record<GesteDuComptoir, string> = { encaisser: 'Encaisser', honore: 'Honoré', absente: 'Absente', annulee: 'Annulée' };

export default function LaJournee() {
  const navigate = useNavigate();
  const { branch } = useBranch();
  const me = useMaTete();
  const souverain = me?.role === 'souverain';
  const moi = me?.name?.trim() || 'La direction';
  const aujourdhui = todayISO();
  const [jour, setJour] = useState(() => jourPropose(new Date()));

  const appts = useBranchAppointments();
  const byId = useServicesById();
  const [clients] = useClients();
  const [categories] = useCategories();
  const [bands] = useModelBands();
  const [sets] = useBandSets();
  const [services] = useServices();
  const [produits] = useProducts();
  const envoiDeLaPiece = useEnvoiDeLaPiece();
  const [payAppt, setPayAppt] = useState<Appointment | null>(null);
  /* La même prise que la carte du tableau de bord (useClotureDuJour.ts). */
  const { cloture, passage, alarmes, close, pourquoiPasEncore, verdictDit } = useClotureDuJour(jour);
  const alarmesOuvertes = alarmes.filter((x) => x.ouverte);

  /* ── Les gestes du comptoir, par les chemins du Carnet ── */
  const rdvDe = (id: string) => appts.find((a) => a.id === id);
  const fais = (id: string, g: GesteDuComptoir) => {
    const a = rdvDe(id);
    if (!a) return;
    if (g === 'encaisser') { setPayAppt(a); return; }
    if (g === 'honore') {
      /* « Terminer la séance », comme le toucher du Carnet : le jour même, le
         reste dû part sur son WhatsApp ; un jour passé s'honore sans prévenir. */
      const h = honoreSansEncaisser(a, byId, tarifsDuRituel(a, {
        client: clients.find((c) => c.id === a.clientId), bands, sets, cats: categories, byId, tousServices: services, produits,
      }));
      if (h.honore && h.facture && !h.deja && a.date === aujourdhui) void envoiDeLaPiece.aRegler(h.facture.id, a.date, { memePasse: true });
      return;
    }
    /* « Absente » comme « Absente : marquer manquée » (la séance de la
       formule) ; « Annulée » comme le toucher du Carnet : le statut seul. */
    const absente = g === 'absente';
    appointmentsStore.set((prev) => prev.map((x) => (x.id === id && x.status !== 'honoré'
      ? { ...x, status: 'annulé', ...(absente ? { absente: { le: jour, par: moi } } : {}) }
      : x)));
    toast(absente ? 'Marquée absente : le rendez-vous est clos.' : 'Rendez-vous annulé : il est clos.');
  };
  const trancher = async (cle: string, dit: string) => {
    if (!souverain) { toast('La direction seule tranche.'); return; }
    const mot = await demandeUnTexte({
      quoi: 'La clôture de Grenat', titre: 'Trancher ce constat ?', dit,
      etiquette: 'Votre décision, en une phrase', gabarit: 'Les 2 000 F ont été reçus en espèces.',
      accepter: 'Trancher et fermer le constat', refuser: 'Laisser ouvert',
    });
    if (mot === null) return;
    tranche({ branchId: branch.id, cle, par: moi, mot });
    toast('Tranché : le constat est fermé, il reste au compte rendu.');
  };

  const jourDit = (() => {
    const s = new Date(`${jour}T12:00:00`).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    return s.charAt(0).toUpperCase() + s.slice(1);
  })();
  const fait = passage?.gestesFaits ?? [];
  const aRevoir = [
    ...cloture.rdvs.flatMap((r) => r.aRevoir.map((x) => ({ ...x, qui: `${r.qui} · ${r.heure}`, pieceId: r.pieceId }))),
    ...cloture.pieces.flatMap((p) => p.aRevoir.map((x) => ({ ...x, qui: p.numero, pieceId: p.id }))),
  ];

  return (
    <div className="mnd-rise lj">
      <div className="lj-tete">
        <div className="trv-sec-label trv-sec-label--copper">Finances · La journée · {jourDit}</div>
        <h2 className="lj-titre">La journée.</h2>
        <p className="lj-sous">La clôture de Grenat en haut, la caisse du jour en bas. Grenat relit chaque rendez-vous et chaque facture aux heures réglées ; ce qui est sûr, il le termine ; le reste attend votre geste.</p>
      </div>

      <section className="lj-carte" aria-label="La clôture de Grenat" data-lj="cloture">
        <div className="lj-carte__tete">
          <span className="lj-carte__titre">La clôture de Grenat</span>
          <span className="lj-passage" data-lj="passage">
            {passage
              ? `Dernier passage : ${momentDit(passage.moment)}, écrit à ${new Date(passage.ecritLe).toTimeString().slice(0, 5).replace(':', ' h ')}`
              : 'Grenat n’est pas encore passé ce jour-là : l’écran juge avec la même règle.'}
          </span>
        </div>
        <p className={`lj-verdict ${close ? 'ok' : 'ko'}`} data-lj="verdict">{close ? cloture.verdict.dit : verdictDit}</p>

        <div className="lj-bloc">
          <p className="lj-bloc__tete"><span>Les rendez-vous du jour</span><span>{cloture.rdvs.length}</span></p>
          {cloture.rdvs.length === 0 && <p className="lj-vide">{cloture.ferme ? 'La Maison est fermée ce jour.' : 'Aucun rendez-vous ce jour-là.'}</p>}
          {cloture.rdvs.map((r) => (
            <div className="lj-ligne" key={r.id} data-lj-rdv={r.id} data-etat={r.etat}>
              <span className="lj-heure">{r.heure}</span>
              <span className="lj-qui-dit">
                <span className="lj-qui">{r.qui}</span>
                <span className="lj-dit">{r.dit}</span>
                {r.libelle && <span className="lj-libelle">{r.libelle}</span>}
                {r.aRevoir.map((x) => <span className="lj-revoir" key={x.cle}>{x.dit}</span>)}
              </span>
              <span className={`lj-etat ${ETAT_TON[r.etat] ?? ''}`}>{r.etatDit}</span>
              {r.gestes.length > 0 && (
                <span className="lj-gestes">
                  {r.gestes.map((g, i) => (
                    <button type="button" key={g} className={`lj-g${i === 0 ? ' plein' : ''}`} onClick={() => fais(r.id, g)}>{GESTE_DIT[g]}</button>
                  ))}
                </span>
              )}
            </div>
          ))}
        </div>

        {alarmes.length > 0 && (
          <div className="lj-bloc lj-bloc--alarme" data-lj="alarmes">
            <p className="lj-bloc__tete"><span>Les pièces payées effacées</span><span>{alarmesOuvertes.length} à trancher</span></p>
            {alarmes.map((x) => (
              <div className="lj-ligne" key={x.cle}>
                <span className="lj-heure">{x.numero}</span>
                <span className="lj-qui-dit"><span className="lj-dit">{x.dit}</span>
                  {x.tranchee && <span className="lj-dit">Tranché par {x.tranchee.par}{x.tranchee.mot ? ` : « ${x.tranchee.mot} »` : ''}.</span>}
                </span>
                <span className={`lj-etat ${x.ouverte ? 'ko' : 'ok'}`}>{x.ouverte ? (x.sort === 'perdue' ? 'Argent perdu de vue' : 'À dire') : (x.sort === 'fondue' ? 'Fondue' : 'Tranché')}</span>
                {x.ouverte && (
                  <span className="lj-gestes">
                    {souverain && <button type="button" className="lj-g plein" onClick={() => void trancher(x.cle, x.dit)}>Trancher</button>}
                    {x.successeur && <button type="button" className="lj-g" onClick={() => navigate(`/factures?id=${x.successeur!.id}`)}>Voir {x.successeur.numero}</button>}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}

        {aRevoir.length > 0 && (
          <div className="lj-bloc" data-lj="a-revoir">
            <p className="lj-bloc__tete"><span>Les factures à revoir</span><span>{aRevoir.length}</span></p>
            {aRevoir.map((x) => (
              <div className="lj-ligne" key={x.cle}>
                <span className="lj-heure">{x.qui}</span>
                <span className="lj-qui-dit"><span className="lj-dit">{x.dit}</span></span>
                <span className="lj-etat ko">À revoir</span>
                <span className="lj-gestes">
                  {x.pieceId && <button type="button" className="lj-g" onClick={() => navigate(`/factures?id=${x.pieceId}`)}>Ouvrir la facture</button>}
                  {souverain && <button type="button" className="lj-g" onClick={() => void trancher(x.cle, x.dit)}>Trancher</button>}
                </span>
              </div>
            ))}
          </div>
        )}

        <div className="lj-bloc" data-lj="grenat">
          <p className="lj-bloc__tete"><span>Ce que Grenat fait seul</span><span>trois gestes sûrs</span></p>
          {fait.map((g) => <p className="lj-fait" key={g.cle}>Fait : {g.dit}</p>)}
          {cloture.gestes.map((g) => <p className="lj-fait lj-fait--attend" key={g.cle}>À son prochain passage : {g.dit}</p>)}
          {fait.length === 0 && cloture.gestes.length === 0 && (
            <p className="lj-vide">{passage ? `Grenat a tout relu à ${momentDit(passage.moment)} : rien à faire seul.` : 'Rien à faire seul pour l’instant.'}</p>
          )}
          <p className="lj-regle">Seul, Grenat envoie le papier pas encore parti (par la salle d’attente), passe « honoré » un rendez-vous réglé en entier encore « confirmé », et relie une facture à son rendez-vous quand il n’y a qu’un candidat. Jamais seul : une absence, un prix, une remise, un paiement, un effacement.</p>
        </div>

        <div className="lj-bloc" data-lj="caisse-resume">
          <p className="lj-bloc__tete"><span>La caisse du jour</span><span>par moyen et par tiroir</span></p>
          <div className="lj-caisse">
            {cloture.caisse.parMoyen.map((m) => <p className="lj-l" key={`m-${m.famille}`}><span>{m.famille}</span><b>{francsDits(m.totalXof)}</b></p>)}
            {cloture.caisse.parTiroir.map((t) => <p className="lj-l lj-l--tiroir" key={`t-${t.tiroir}`}><span>Tiroir · {t.tiroir}</span><b>{francsDits(t.totalXof)}</b></p>)}
            {cloture.caisse.rdvAEncaisser > 0 && <p className="lj-l"><span>Reste à encaisser ({cloture.caisse.rdvAEncaisser} rendez-vous)</span><b>{francsDits(cloture.caisse.resteAEncaisserXof)}</b></p>}
            {cloture.caisse.sortiDesComptesXof > 0 && <p className="lj-l lj-l--ko"><span>Encaissé puis sorti des comptes, toujours compté</span><b>{francsDits(cloture.caisse.sortiDesComptesXof)}</b></p>}
            {cloture.caisse.parMoyen.length === 0 && cloture.caisse.rdvAEncaisser === 0 && <p className="lj-vide">Aucun argent reçu ce jour-là.</p>}
          </div>
        </div>
      </section>

      {/* EN FIN DE PAGE, LA CAISSE DU JOUR — le journal déplacé de la Caisse. */}
      <section className="lj-journal" aria-label="La caisse du jour">
        <JournalDeCaisse
          jour={jour}
          onJour={setJour}
          aujourdhui={aujourdhui}
          clotureOuverteAuxGestes={close}
          pourquoiPasEncore={pourquoiPasEncore}
        />
      </section>

      {payAppt && <PayAppointmentModal appt={payAppt} onClose={() => setPayAppt(null)} />}
    </div>
  );
}
