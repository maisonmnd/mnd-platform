import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useBranch } from '../../../../shared/branches';
import { useBlocages, plagesBloquees } from '../../../../shared/blocages';
import { openingForIso } from '../../../../shared/settings';
import { momentDuSalon } from '../../../../shared/calendrier';
import { cheminDeLaConversation, lienWaMe } from '../../../../shared/conversations';
import { signeLeMessage } from '../../../../shared/identite';
import { telephoneNormalise } from '../../../../shared/demandes';
import { useStaff } from '../../../../shared/auth';
import { useListeDAttente, noteLAttente } from '../../../../shared/liste-d-attente';
import {
  apresLeGeste, etatDeLAttenteDit, heureDiteDeLAttente, joursQuiAttendent, jourDitDeLAttente, laPlaceAOffrir,
  messageDeLaPlaceLiberee, phraseDeLaFile, type DemandeDAttente, type GesteDeLAttente,
} from '../../../../shared/liste-d-attente-pur';
import { placesDuJour } from './rdv-fluide-pur';
import { RdvModal, apptDurationMin, timeToMin, useBranchAppointmentsAvecEssais, useBranchClients, useServicesById, type RdvInitial } from './_shared';
import './liste-d-attente.css';

/* ══ LA LISTE D'ATTENTE, AU CALENDRIER — 26 novembre 2026 (audit B3) ══════
   « Quand un jour est plein, la cliente demande à être prévenue ; une place
   libérée se propose d'abord à la première de la file » (audit validé par
   Yéman). Le Calendrier est l'écran où l'équipe voit ses jours : la file y
   paraît, au-dessus de la grille, dès qu'une cliente attend.

   UNE PLACE LIBRE SE CONSTATE, ELLE NE S'ANNONCE PAS : qu'elle vienne d'une
   annulation, d'un déplacement ou d'un « à reprogrammer », la règle des
   places du Trône (`placesDuJour`, les fauteuils de la branche, les murs de
   la Maison) dit si la durée de la première de la file tient encore ce
   jour-là, et à quelle heure. Alors : « Lui proposer 14 h sur WhatsApp »,
   un message prêt, envoyé PAR LA MAIN (lot 1 : rien ne part tout seul), puis
   « Elle l'a prise » (la fenêtre du rendez-vous s'ouvre, pré-remplie),
   « Pas intéressée », « Pas de réponse, à la suivante ».

   Posé dans le Calendrier par UNE ligne ; tout vit ici. */

const s = (n: number) => (n > 1 ? 's' : '');

export function ListeDAttente({ sansPrix }: { sansPrix?: boolean }) {
  const { branch } = useBranch();
  const [attentes] = useListeDAttente();
  const rdvs = useBranchAppointmentsAvecEssais();
  const clients = useBranchClients();
  const byId = useServicesById();
  const [blocages] = useBlocages();
  const moi = useStaff();
  const navigate = useNavigate();
  const [aPoser, setAPoser] = useState<RdvInitial | null>(null);
  const { jour: aujourdhui, minutes: maintenantMin } = momentDuSalon();

  const jours = useMemo(() => joursQuiAttendent(attentes, aujourdhui, branch.id), [attentes, aujourdhui, branch.id]);

  /* La place libre de chaque jour, pour la durée de la PREMIÈRE de la file. */
  const lus = useMemo(() => jours.map(({ jour, file }) => {
    const premiere = file[0];
    const duree = premiere.dureeMin && premiere.dureeMin > 0
      ? premiere.dureeMin
      : Math.max(60, premiere.serviceIds.reduce((t, id) => t + (byId.get(id)?.durationMin ?? 60), 0));
    const occupes = rdvs
      .filter((a) => a.date === jour && a.status !== 'annulé')
      .map((a) => ({ maitre: a.master, debutMin: timeToMin(a.time), dureeMin: apptDurationMin(a, byId) }));
    const places = placesDuJour({
      iso: jour, aujourdhui, maintenantMin, ouverture: openingForIso(jour), durationMin: duree,
      occupes, bloques: plagesBloquees(blocages, branch.id, jour, ''), sieges: Math.max(0, branch.seats ?? 0),
    });
    return { jour, file, premiere, heure: laPlaceAOffrir(places.heures) };
  }), [jours, rdvs, byId, blocages, branch.id, branch.seats, aujourdhui, maintenantMin]);

  if (lus.length === 0) return null;

  const total = lus.reduce((n, j) => n + j.file.length, 0);
  const aAgir = lus.filter((j) => j.heure !== null || j.premiere.statut === 'proposee');
  const enAttente = lus.filter((j) => !aAgir.includes(j));
  const gestes = moi?.name ?? '';
  const note = (a: DemandeDAttente, g: GesteDeLAttente) => noteLAttente(apresLeGeste(a, g, gestes, new Date().toISOString()));
  const ficheDe = (a: DemandeDAttente) => a.clientId
    ? clients.find((c) => c.id === a.clientId)
    : clients.find((c) => telephoneNormalise(c.phone ?? '') === a.telephone);
  const gestesDits = (a: DemandeDAttente) => a.serviceIds.map((id) => byId.get(id)?.name).filter(Boolean).join(' · ') || 'Rituel';

  return (
    <section className="tr-attente" aria-label="Liste d’attente">
      <h3>Liste d’attente <span>{total} cliente{s(total)}</span></h3>
      {aAgir.map(({ jour, file, premiere, heure }) => {
        const heureProposee = premiere.statut === 'proposee' ? premiere.proposee?.heure ?? heure : heure;
        const texte = heureProposee ? signeLeMessage(messageDeLaPlaceLiberee(premiere, heureProposee)) : '';
        const versLeFil = heureProposee ? cheminDeLaConversation(premiere.telephone, texte) : null;
        const versLApp = heureProposee ? lienWaMe(premiere.telephone, texte) : null;
        const fiche = ficheDe(premiere);
        return (
          <div key={jour} className="tr-attente__jour">
            <p className="tr-attente__phrase">
              {phraseDeLaFile(file.length, jour)}{' '}
              {heure ? <b>Une place est libre à {heureDiteDeLAttente(heure)}.</b> : <span>Plus de place libre pour l’instant.</span>}
            </p>
            <div className="tr-attente__carte">
              <div className="tr-attente__qui">
                <b>{fiche?.name ?? premiere.prenom}</b>
                <span>{gestesDits(premiere)}</span>
                <span className="tr-attente__etat">La première de la file · {etatDeLAttenteDit(premiere)}</span>
              </div>
              <div className="tr-attente__gestes">
                {premiere.statut === 'attend' && heure && versLeFil && (
                  <button type="button" className="tr-attente__btn tr-attente__btn--plein" onClick={() => { note(premiere, { k: 'proposer', heure }); navigate(versLeFil); }}>
                    Lui proposer {heureDiteDeLAttente(heure)} sur WhatsApp
                  </button>
                )}
                {premiere.statut === 'attend' && heure && versLApp && (
                  <a className="tr-attente__btn" href={versLApp} target="_blank" rel="noopener noreferrer" onClick={() => note(premiere, { k: 'proposer', heure })}>
                    Par l’application
                  </a>
                )}
                {premiere.statut === 'proposee' && (
                  <>
                    <button type="button" className="tr-attente__btn tr-attente__btn--plein" onClick={() => {
                      note(premiere, { k: 'prise' });
                      setAPoser({
                        date: jour, time: premiere.proposee?.heure ?? heure ?? undefined, serviceIds: premiere.serviceIds,
                        ...(fiche ? { clientId: fiche.id } : {}),
                        note: `Liste d’attente : ${premiere.prenom}`,
                      });
                    }}>Elle l’a prise</button>
                    <button type="button" className="tr-attente__btn" onClick={() => note(premiere, { k: 'pas-interessee' })}>Pas intéressée</button>
                    <button type="button" className="tr-attente__btn" onClick={() => note(premiere, { k: 'sans-reponse' })}>Pas de réponse, à la suivante</button>
                    {versLeFil && <button type="button" className="tr-attente__btn" onClick={() => navigate(versLeFil)}>Son fil</button>}
                  </>
                )}
              </div>
            </div>
            {file.length > 1 && <p className="tr-attente__suite">Puis : {file.slice(1).map((a) => a.prenom).join(', ')}.</p>}
          </div>
        );
      })}
      {enAttente.length > 0 && (
        <p className="tr-attente__complets">
          Complets pour l’instant : {enAttente.map(({ jour, file }) => `${jourDitDeLAttente(jour)} (${file.length})`).join(', ')}.
        </p>
      )}
      {aPoser && <RdvModal onClose={() => setAPoser(null)} initial={aPoser} sansPrix={sansPrix} />}
    </section>
  );
}
