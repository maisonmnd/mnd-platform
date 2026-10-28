import { useMemo, useState } from 'react';
import { Button, Modal, toast } from '../../../../ds/components';
import { clientsStore, type Client } from '../../../../shared/clients';
import { CIVILITES, appelDe, civiliteNotee, civilitesAPoser, estMuette, ficheAvecCivilite, type Civilite } from '../../../../shared/civilite';
import { frShortAn, useBranchAppointments, useBranchClients } from './_shared';
import './clients.css';
import './civilites.css';

/* ══ LES CIVILITÉS À POSER — 28 octobre 2026 ════════════════════════════
   « Pour les messages, dire Mr ou Mme avant le prénom » (Yéman). Le 26
   octobre 2026, 287 fiches sur 301 ne disaient rien : leurs messages
   disaient le prénom seul, car la Maison ne suppose plus de civilité
   (13 octobre 2026). Elle a choisi au sélecteur un tri en une fenêtre, et les
   mêmes boutons sur chaque ligne de l'Assistant Maison. Un toucher pose la
   civilité sur la fiche (`ficheAvecCivilite`, comme sur la fiche cliente) ;
   la ligne reste en place, pour qu'un mauvais toucher se corrige d'un autre.
   Ouverte depuis l'Assistant Maison et depuis les Clientes. */

export function FenetreDesCivilites({ onClose }: { onClose: () => void }) {
  const fiches = useBranchClients();
  const rdvs = useBranchAppointments();
  const [toutes, setToutes] = useState(false);
  const [cherche, setCherche] = useState('');
  /* Les fiches posées pendant que la fenêtre est ouverte restent listées. */
  const [poseesIci, setPoseesIci] = useState<string[]>([]);

  const aujourdhui = (() => {
    const t = new Date();
    return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
  })();
  const { prochainRdv, derniereVenue } = useMemo(() => {
    const prochain = new Map<string, string>();
    const derniere = new Map<string, string>();
    for (const a of rdvs) {
      if (!a.clientId || a.status === 'annulé') continue;
      if (a.date >= aujourdhui && a.status !== 'honoré') {
        if (!prochain.has(a.clientId) || a.date < (prochain.get(a.clientId) ?? '')) prochain.set(a.clientId, a.date);
      } else if (a.status === 'honoré' && a.date > (derniere.get(a.clientId) ?? '')) derniere.set(a.clientId, a.date);
    }
    return { prochainRdv: prochain, derniereVenue: derniere };
  }, [rdvs, aujourdhui]);

  const muettes = useMemo(() => fiches.filter((c) => estMuette(c)), [fiches]);
  const avecNumero = muettes.filter((c) => !!c.phone?.trim()).length;
  const liste = useMemo(() => {
    const ici = new Set(poseesIci);
    const q = cherche.trim().toLowerCase();
    return civilitesAPoser({ fiches: fiches.filter((c) => estMuette(c) || ici.has(c.id)), prochainRdv, derniereVenue, avecNumero: !toutes })
      .filter((c) => !q || (c.name ?? '').toLowerCase().includes(q));
  }, [fiches, poseesIci, cherche, prochainRdv, derniereVenue, toutes]);

  const pose = (c: Client, civ: Civilite) => {
    clientsStore.set((prev) => prev.map((x) => (x.id === c.id ? { ...x, ...ficheAvecCivilite(civ) } : x)));
    setPoseesIci((p) => (p.includes(c.id) ? p : [...p, c.id]));
    toast(`Noté : ses messages diront « ${appelDe({ ...c, ...ficheAvecCivilite(civ) })} ».`);
  };

  return (
    <Modal title="Civilités à poser" onClose={onClose} width={620}>
      <div className="trc-civ">
        <div className="trc-civ__haut">
          <p className="trc-civ__dit">
            <b>{muettes.length}</b> fiche{muettes.length > 1 ? 's' : ''} sans civilité, dont <b>{avecNumero}</b> avec un numéro.
            Sans civilité, les messages disent le prénom seul ; posée, ils disent « M. Jean-Luc », « Mme Shadé ».
            Celles qui ont un rendez-vous à venir d’abord.
          </p>
          <div className="trc-civ__filtres">
            <input className="trc-civ__cherche" type="search" placeholder="Chercher un nom" value={cherche} onChange={(e) => setCherche(e.target.value)} aria-label="Chercher un nom" />
            <button type="button" className={`trc-chip ${!toutes ? 'is-active' : ''}`} onClick={() => setToutes(false)}>Avec un numéro</button>
            <button type="button" className={`trc-chip ${toutes ? 'is-active' : ''}`} onClick={() => setToutes(true)}>Toutes</button>
          </div>
        </div>
        {liste.length === 0 && <p className="trc-civ__vide">{muettes.length === 0 ? 'Chaque fiche a sa civilité.' : 'Aucune fiche ne répond à ce nom.'}</p>}
        <ul className="trc-civ__liste">
          {liste.map((c) => {
            const notee = civiliteNotee(c);
            const rdv = prochainRdv.get(c.id);
            const venue = derniereVenue.get(c.id);
            return (
              <li key={c.id} className={`trc-civ__ligne${notee ? ' est-posee' : ''}`}>
                <span className="trc-civ__qui">
                  <b>{c.name || 'Sans nom'}</b>
                  <small>
                    {rdv ? `RDV le ${frShortAn(rdv)}` : venue ? `venue le ${frShortAn(venue)}` : 'aucune venue'}
                    {c.phone?.trim() ? '' : ' · sans numéro'}
                  </small>
                </span>
                <span className="trc-civ__choix">
                  {CIVILITES.map((x) => (
                    <button key={x.cle} type="button" className={`trc-chip ${notee === x.cle ? 'is-active' : ''}`} onClick={() => pose(c, x.cle)}>{x.dit}</button>
                  ))}
                </span>
              </li>
            );
          })}
        </ul>
        <div className="trc-civ__pied">
          <Button variant="indigo" onClick={onClose}>Fermer</Button>
        </div>
      </div>
    </Modal>
  );
}
