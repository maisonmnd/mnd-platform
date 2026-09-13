import { Fragment, useEffect, useMemo, useState } from 'react';
import { Modal } from '../../../ds/components';
import { useBranch } from '../../../shared/branches';
import { fmtMoney } from '../../../shared/currency';
import { useServices } from '../../../shared/catalog';
import { useStaff as useMaTete } from '../../../shared/auth';
import { useInvoices, type Invoice } from '../../../shared/finance';
import { useAppointments, type Appointment } from '../../../shared/agenda';
import { useStaff } from './equipe/data';
import {
  PORTE_DITE, appareilDit, heureDe, initiales, jourCourtDe, litLeGeste, litLesTracesDesPieces, momentLongDe,
  nomDeLaMain, piecesDeLaFacture, piecesDuRendezVous, estAutomatique,
  type ContexteDeLecture, type GesteLu, type PieceTracee, type Trace,
} from '../../../shared/traces';
import './_vie.css';

/* ══ LA VIE D'UNE PIÈCE — 13 septembre 2026 ══════════════════════════════
   « Quand je clique un rendez-vous, je dois retrouver quand il a été créé,
   par qui, comment il a été tamponné, tout » (Yéman).

   CE QUI S'AFFICHE ICI A ÉTÉ ÉCRIT PAR LA BASE (migration 0092), jamais par
   un écran. Seuls le souverain et le gérant la lisent : la base refuse les
   autres, et l'écran ne leur montre rien. */

export const useEstDirection = (): boolean => {
  const me = useMaTete();
  return me?.role === 'souverain' || me?.role === 'gerant';
};

export function useContexteDeLecture(): ContexteDeLecture {
  const { currency } = useBranch();
  const [services] = useServices();
  const [equipe] = useStaff();
  return useMemo(() => {
    const sv = new Map(services.map((s) => [s.id, s.name]));
    const eq = new Map(equipe.map((m) => [m.id, m.name]));
    return {
      nomDePrestation: (id: string) => sv.get(id),
      nomDeMembre: (id: string) => eq.get(id),
      argent: (n: number) => fmtMoney(n, currency),
    };
  }, [services, equipe, currency]);
}

export type EtatDeLaVie = { etat: 'charge' | 'pret' | 'fermee'; traces: Trace[] };

export function useVieDesPieces(pieces: readonly PieceTracee[], actif: boolean): EtatDeLaVie {
  const cle = pieces.map((p) => `${p.table}:${p.id}`).sort().join('|');
  const [etat, setEtat] = useState<EtatDeLaVie>({ etat: 'charge', traces: [] });
  useEffect(() => {
    if (!actif || !cle) return;
    let vivant = true;
    setEtat((e) => ({ ...e, etat: 'charge' }));
    void litLesTracesDesPieces(pieces).then((r) => {
      if (!vivant) return;
      setEtat(r === null ? { etat: 'fermee', traces: [] } : { etat: 'pret', traces: r });
    });
    return () => { vivant = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cle, actif]);
  return etat;
}

export function useVieDuRendezVous(appt: Appointment | undefined, actif: boolean): EtatDeLaVie {
  const [invoices] = useInvoices();
  const pieces = useMemo(() => (appt ? piecesDuRendezVous(appt, invoices) : []), [appt, invoices]);
  return useVieDesPieces(pieces, actif && !!appt);
}

/** Combien de gestes de fond — les mises à jour automatiques ne comptent pas. */
export const nombreDeGestes = (vie: EtatDeLaVie): number => vie.traces.filter((t) => !estAutomatique(t)).length;

/* ---------- Le tampon de naissance ---------- */
export function TamponDeNaissance({ vie, principal, creeLe, feminin, onVoir }: {
  vie: EtatDeLaVie;
  principal: PieceTracee;
  /** La date de pose écrite par l'appareil, pour une pièce née avant la trace. */
  creeLe?: string;
  feminin?: boolean;
  onVoir?: () => void;
}) {
  const ne = feminin ? 'Née' : 'Né';
  const cree = feminin ? 'Créée' : 'Créé';
  if (vie.etat === 'charge') {
    return <div className="tvie-tampon est-muet"><div className="tvie-tampon__dit">Lecture de sa naissance…</div></div>;
  }
  if (vie.etat === 'fermee') {
    return (
      <div className="tvie-tampon est-muet">
        <div className="tvie-tampon__dit">
          La trace de la base ne répond pas : la migration 0092 n’est pas encore passée, ou ce compte n’a pas le rang
          de la direction.
        </div>
      </div>
    );
  }
  const naissance = vie.traces.find((t) => t.table === principal.table && t.pieceId === principal.id && t.operation === 'pose');
  const n = nombreDeGestes(vie);
  if (!naissance) {
    return (
      <div className="tvie-tampon est-muet">
        <div className="tvie-tampon__dit">
          <span className="tvie-tampon__lab">{ne} avant la trace de la base</span>
          {creeLe ? `Posé${feminin ? 'e' : ''} le ${momentLongDe(creeLe)}, selon l’horloge de l’appareil. ` : ''}
          Ni son auteur ni son appareil n’ont été écrits à sa naissance, et rien ne peut les reconstituer.
          {n > 0 && ' Ce qui lui est arrivé depuis est signé par la base.'}
        </div>
        {onVoir && n > 0 && <button type="button" className="tvie-voir" onClick={onVoir}>Voir sa vie · {n}</button>}
      </div>
    );
  }
  return (
    <div className="tvie-tampon">
      <div className="tvie-tampon__dit">
        <span className="tvie-tampon__lab">{ne} le {momentLongDe(naissance.faitLe)}</span>
        {cree} par <b>{nomDeLaMain(naissance)}</b>
        {naissance.compteMail ? ` (compte ${naissance.compteMail})` : ''}, depuis <b>{PORTE_DITE[naissance.porte]}</b>,
        sur <b>{appareilDit(naissance.appareil)}</b>.
        <span className="tvie-sceau">signé par la base</span>
      </div>
      {onVoir && <button type="button" className="tvie-voir" onClick={onVoir}>Voir sa vie · {n} geste{n > 1 ? 's' : ''}</button>}
    </div>
  );
}

/* ---------- Un geste ---------- */
export function GesteDeLaVie({ t, lu, montrePiece, onOuvre }: {
  t: Trace;
  lu: GesteLu;
  montrePiece?: boolean;
  onOuvre?: () => void;
}) {
  const nom = nomDeLaMain(t);
  return (
    <li
      className={`tvie-geste ${lu.sensible ? 'est-sensible' : ''} ${onOuvre ? 'est-cliquable' : ''}`}
      onClick={onOuvre}
      onKeyDown={onOuvre ? (e) => { if (e.key === 'Enter') onOuvre(); } : undefined}
      tabIndex={onOuvre ? 0 : undefined}
    >
      <span className="tvie-h"><b>{heureDe(t.faitLe)}</b>{jourCourtDe(t.faitLe)}</span>
      <span className={`tvie-qui ${t.porte !== 'trone' ? 'dehors' : ''}`} aria-hidden="true">
        {t.porte === 'trone' ? initiales(nom) : '·'}
      </span>
      <span className="tvie-dit">
        <span className={`tvie-verbe ${lu.famille}`}>{lu.verbe}</span>
        <b>{nom}</b> {lu.phrase}
        {montrePiece && <> · <b>{lu.piece}</b></>}
        <span className="tvie-ou">
          {PORTE_DITE[t.porte]} · {appareilDit(t.appareil)}
          {t.compteMail ? ` · compte ${t.compteMail}` : ''}
          {!montrePiece && t.table === 'invoices' ? ` · ${lu.piece}` : ''}
        </span>
        {lu.diff.length > 0 && (
          <span className="tvie-diff">
            {lu.diff.map((d, i) => (
              <Fragment key={i}>
                <span className="tvie-diff__champ">{d.champ}</span>
                <span className="tvie-diff__avant">{d.avant ?? ''}</span>
                <span className="tvie-diff__apres">{d.apres ?? ''}</span>
              </Fragment>
            ))}
          </span>
        )}
        {!onOuvre && (
          <details className="tvie-brut">
            <summary>Voir la pièce exacte, telle que la base l’a reçue</summary>
            <pre>{JSON.stringify(
              t.operation === 'modifie' ? { avant: t.avant, apres: t.apres } : (t.operation === 'efface' ? t.avant : t.apres),
              null, 2,
            )}</pre>
          </details>
        )}
      </span>
    </li>
  );
}

/* ---------- Sa vie ---------- */
type Filtre = 'tout' | 'piece' | 'argent' | 'sensibles';

export function SaVie({ vie, principal }: { vie: EtatDeLaVie; principal: PieceTracee }) {
  const ctx = useContexteDeLecture();
  const [filtre, setFiltre] = useState<Filtre>('tout');
  const [autos, setAutos] = useState(false);
  const lus = useMemo(() => vie.traces.map((t) => ({ t, lu: litLeGeste(t, ctx) })), [vie.traces, ctx]);
  if (vie.etat === 'charge') return <div className="tvie-note">Lecture de sa vie…</div>;
  if (vie.etat === 'fermee') {
    return (
      <div className="tvie-note">
        La trace de la base ne répond pas : la migration 0092 n’est pas encore passée, ou ce compte n’a pas le rang de la
        direction.
      </div>
    );
  }
  const nbAutos = lus.filter(({ lu }) => lu.automatique).length;
  const nbSensibles = lus.filter(({ lu }) => lu.sensible).length;
  const nomPiece = principal.table === 'invoices' ? 'La facture' : principal.table === 'appointments' ? 'Le rendez-vous' : 'La pièce';
  const vus = lus.filter(({ t, lu }) => (autos || !lu.automatique)
    && (filtre === 'tout'
      || (filtre === 'piece' && t.table === principal.table)
      || (filtre === 'argent' && (lu.famille === 'argent' || lu.encaisseXof > 0 || t.table !== 'appointments'))
      || (filtre === 'sensibles' && lu.sensible)));

  return (
    <div className="tvie-corps">
      <div className="tvie-filtres">
        {([['tout', 'Tout'], ['piece', nomPiece], ['argent', 'Argent']] as [Filtre, string][]).map(([k, l]) => (
          <button key={k} type="button" className={`tvie-puce ${filtre === k ? 'actif' : ''}`} onClick={() => setFiltre(k)}>{l}</button>
        ))}
        <button type="button" className={`tvie-puce alerte ${filtre === 'sensibles' ? 'actif' : ''}`} onClick={() => setFiltre('sensibles')}>
          Sensibles · {nbSensibles}
        </button>
      </div>
      {vus.length === 0 ? (
        <div className="tvie-note">
          {vie.traces.length === 0
            ? 'Aucun geste signé par la base sur cette pièce. Elle est née avant la mise en service de la trace, et personne n’y a touché depuis.'
            : 'Aucun geste ne répond à ce filtre.'}
        </div>
      ) : (
        <ol className="tvie-liste">
          {vus.map(({ t, lu }) => <GesteDeLaVie key={t.id} t={t} lu={lu} />)}
        </ol>
      )}
      {nbAutos > 0 && (
        <button type="button" className="tvie-lien" style={{ alignSelf: 'flex-start' }} onClick={() => setAutos(!autos)}>
          {autos ? 'Cacher' : 'Montrer'} {nbAutos} mise{nbAutos > 1 ? 's' : ''} à jour automatique{nbAutos > 1 ? 's' : ''}
        </button>
      )}
      <div className="tvie-note">
        Chaque ligne est écrite par la base au moment du geste : le compte connecté, l’heure du serveur, l’appareil et ce qui
        a changé. Personne ne peut la modifier ni l’effacer. Une mise à jour automatique est une réécriture faite par Le
        Trône sous le compte connecté (persona, passage) : elle ne compte pas comme un geste de la personne.
      </div>
    </div>
  );
}

/* ---------- La vie d'une pièce, dans une fenêtre ---------- */
export function usePiecesLiees(principal: PieceTracee): PieceTracee[] {
  const [appts] = useAppointments();
  const [invoices] = useInvoices();
  return useMemo(() => {
    if (principal.table === 'appointments') {
      const a = appts.find((x) => x.id === principal.id);
      return a ? piecesDuRendezVous(a, invoices) : [principal];
    }
    if (principal.table === 'invoices') {
      const i = invoices.find((x) => x.id === principal.id);
      return i ? piecesDeLaFacture(i, appts) : [principal];
    }
    return [principal];
  }, [principal, appts, invoices]);
}

export function ModaleDeLaVie({ principal, titre, onClose }: { principal: PieceTracee; titre: string; onClose: () => void }) {
  const pieces = usePiecesLiees(principal);
  const vie = useVieDesPieces(pieces, true);
  return (
    <Modal title={titre} onClose={onClose} width={720}>
      <div className="tvie-corps">
        <TamponDeNaissance vie={vie} principal={principal} feminin={principal.table !== 'appointments'} />
        <SaVie vie={vie} principal={principal} />
      </div>
    </Modal>
  );
}

/* ---------- La facture ---------- */
export function VieDeLaFacture({ invoice }: { invoice: Invoice }) {
  const estDirection = useEstDirection();
  const [appts] = useAppointments();
  const pieces = useMemo(() => piecesDeLaFacture(invoice, appts), [invoice, appts]);
  const vie = useVieDesPieces(pieces, estDirection);
  const [ouverte, setOuverte] = useState(false);
  if (!estDirection) return null;
  const principal = { table: 'invoices', id: invoice.id };
  return (
    <>
      <TamponDeNaissance vie={vie} principal={principal} feminin onVoir={() => setOuverte(true)} />
      {ouverte && (
        <Modal title={`${invoice.number} · sa vie`} onClose={() => setOuverte(false)} width={720}>
          <SaVie vie={vie} principal={principal} />
        </Modal>
      )}
    </>
  );
}
