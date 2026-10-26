import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, toast } from '../../../../ds/components';
import { useStaff } from '../../../../shared/auth';
import { useStore } from '../../../../shared/store';
import { jourCourtAn } from '../../../../shared/calendrier';
import { clientsStore } from '../../../../shared/clients';
import { useAppointments } from '../../../../shared/agenda';
import { idDeLAvis, jourLocalDe } from '../../../../shared/ia-avis-pur';
import {
  DEPART_DES_LIENS, chercheDesFiches, etatDuLien, fichesProposees, pourquoiProposee, type AvisDuReleve, type LienDAvis,
} from '../../../../shared/avis-fiches-pur';
import { delieLAvis, marqueSansFiche, relieLAvis, useLiensDesAvis, type IssueDuLien } from '../../../../shared/avis-fiches';
import { useEnvois } from '../equipe/data';

/* ══ LA FICHE D'UN AVIS — 20 octobre 2026, sortie de l'onglet le 26 ══════
   La fiche de la cliente qui a laissé l'avis : reliée, sans fiche, proposée
   (demande d'avis partie dans les 30 jours et même prénom, sinon venue dans
   les 30 jours), ou à chercher. Un toucher relie ; Claude ne lit jamais la
   fiche. Née dans l'onglet des Vitrines, elle vit depuis le 26 octobre 2026
   dans la rubrique « Les avis Google », sans changer de règles. */

/** Le prénom de qui fait le geste, pour « relié par Y. ». */
function useQui(): string {
  const staff = useStaff();
  return String(staff?.name ?? '').trim().split(/\s+/)[0] ?? '';
}

const ditLeGeste = (r: IssueDuLien) => {
  if (r === 'attente') toast('Les fiches des avis ne sont pas encore arrivées du serveur : réessayez dans un instant.');
};

/** LA FICHE DE L'AVIS : reliée, sans fiche, proposée, ou à chercher. */
export function FicheDeLAvis({ a, releveLe, peutRelier }: { a: AvisDuReleve; releveLe?: string; peutRelier: boolean }) {
  const navigate = useNavigate();
  const qui = useQui();
  const [liens] = useLiensDesAvis();
  const [clients] = useStore(clientsStore);
  const [envois] = useEnvois();
  const [rdvs] = useAppointments();
  const [cherche, setCherche] = useState(false);
  const [q, setQ] = useState('');
  const [choisi, setChoisi] = useState(0);
  const id = idDeLAvis(a);
  const lien: LienDAvis | undefined = liens[id];
  const etat = etatDuLien(a, lien, releveLe);
  const nomDe = (cid: string) => clients.find((c) => c.id === cid)?.name || 'une fiche effacée';
  const parQui = (l: LienDAvis) => `${l.par ? `par ${l.par} ` : ''}le ${jourCourtAn(jourLocalDe(l.le))}`;

  const props = useMemo(
    () => (etat === 'a-relier' ? fichesProposees(a, releveLe, { clients, envois, rdvs }) : []),
    [a, releveLe, clients, envois, rdvs, etat],
  );
  const trouvees = useMemo(() => (cherche ? chercheDesFiches(q, clients) : []), [cherche, q, clients]);

  if (etat === 'reliee' && lien?.clientId) {
    return (
      <div className="trc-avisg__cadre trc-avisg__cadre--fiche">
        <span className="trc-avisg__titre">La fiche</span>
        <span>Reliée à <b>{nomDe(lien.clientId)}</b> <span className="mnd-muted">· {parQui(lien)}</span></span>
        <span className="trc-avisg__gestes">
          <Button variant="ghost" size="sm" onClick={() => navigate(`/customers?id=${lien.clientId}`)}>Ouvrir sa fiche</Button>
          {peutRelier && <button type="button" className="trc-c360-linkbtn" onClick={() => ditLeGeste(delieLAvis(id))}>Ce n’est pas elle</button>}
        </span>
      </div>
    );
  }
  if (!peutRelier) {
    return etat === 'sans-fiche' ? <span className="mnd-muted" style={{ fontSize: 12 }}>Sans fiche, par choix de la Maison.</span> : null;
  }

  if (cherche) {
    return (
      <div className="trc-avisg__cadre trc-avisg__cadre--fiche">
        <span className="trc-avisg__titre">Une autre fiche</span>
        <input className="mnd-input" type="search" value={q} autoFocus placeholder="Prénom, nom ou numéro" aria-label="Chercher une cliente"
          onChange={(e) => setQ(e.target.value)} />
        <span className="trc-avisg__gestes">
          {trouvees.map((c) => (
            <Button key={c.id} variant="ghost" size="sm" onClick={() => { ditLeGeste(relieLAvis(id, c.id, qui)); setCherche(false); setQ(''); }}>{c.name}</Button>
          ))}
          {q.trim() && trouvees.length === 0 && <span className="mnd-muted" style={{ fontSize: 12 }}>Aucune cliente.</span>}
        </span>
        <span><button type="button" className="trc-c360-linkbtn" onClick={() => { setCherche(false); setQ(''); }}>Retour</button></span>
      </div>
    );
  }

  if (etat === 'sans-fiche' && lien) {
    return (
      <div className="trc-avisg__cadre trc-avisg__cadre--fiche">
        <span className="trc-avisg__titre">La fiche</span>
        <span className="mnd-muted">Aucune fiche, {parQui(lien)}.</span>
        <span><button type="button" className="trc-c360-linkbtn" onClick={() => setCherche(true)}>Relier quand même</button></span>
      </div>
    );
  }

  if (etat === 'ancien') {
    return (
      <div className="trc-avisg__cadre trc-avisg__cadre--fiche">
        <span className="trc-avisg__titre">La fiche</span>
        <span className="mnd-muted">Avis publié avant le {jourCourtAn(DEPART_DES_LIENS)} : pas de proposition.</span>
        <span><Button variant="ghost" size="sm" onClick={() => setCherche(true)}>Relier à une fiche</Button></span>
      </div>
    );
  }

  /* À relier : les fiches proposées, la première cochée. */
  const p = props[Math.min(choisi, Math.max(0, props.length - 1))];
  return (
    <div className="trc-avisg__cadre trc-avisg__cadre--fiche">
      <span className="trc-avisg__titre">{props.length > 0 ? 'La fiche proposée' : 'La fiche'}</span>
      {props.length === 0 && (
        <span className="mnd-muted" style={{ fontSize: 12.5 }}>
          Aucune cliente au même prénom n’a reçu la demande d’avis ni n’est venue dans les 30 jours d’avant.
        </span>
      )}
      {props.length > 1 && <span className="mnd-muted" style={{ fontSize: 12 }}>{props.length} clientes correspondent : choisissez.</span>}
      {props.length > 0 && (
        <span className="trc-avisg__props" role="radiogroup" aria-label="Fiches proposées">
          {props.map((x, i) => (
            <label key={x.clientId} className="trc-avisg__prop">
              <input type="radio" name={`fiche-${id}`} checked={i === choisi} onChange={() => setChoisi(i)} />
              <span><b>{x.nom}</b><span className="mnd-muted" style={{ display: 'block', fontSize: 11.5 }}>{pourquoiProposee(x, jourCourtAn)}</span></span>
            </label>
          ))}
        </span>
      )}
      <span className="trc-avisg__gestes">
        {p && <Button variant="indigo" size="sm" onClick={() => ditLeGeste(relieLAvis(id, p.clientId, qui))}>{props.length > 1 ? 'Relier à celle-ci' : 'C’est elle'}</Button>}
        <Button variant="ghost" size="sm" onClick={() => setCherche(true)}>{props.length > 0 ? 'Une autre fiche' : 'Chercher une fiche'}</Button>
        <button type="button" className="trc-c360-linkbtn" onClick={() => ditLeGeste(marqueSansFiche(id, qui))}>Aucune fiche</button>
      </span>
    </div>
  );
}
