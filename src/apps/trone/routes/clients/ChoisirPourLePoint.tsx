import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search } from 'lucide-react';
import { PageHead } from '../_ui';
import { Input } from '../../../../ds/components';
import { useBranch } from '../../../../shared/branches';
import { fmtMoney } from '../../../../shared/currency';
import { normName } from '../../../../shared/text';
import { momentDuSalon } from '../../../../shared/calendrier';
import { creancesDeLaMaison, type Creance } from '../../../../shared/compte';
import { apptDueXof, useBranchAppointments, useBranchClients, useClefDuTarif, useServicesById } from './_shared';
import './clients.css';
import './le-point.css';

/* ══ LE POINT, OUVERT DEPUIS LE MENU — 25 novembre 2026 ══════════════════
   « Oui ajoute le point dans le menu » (Yéman). Le point se lisait d'une
   seule fiche (`/point?id=…`) ; ouvert par la barre, il n'a pas encore de
   cliente : on la choisit ici.

   EN TÊTE, CELLES QUI DOIVENT. La liste est celle des Créances, par le même
   juge (`creancesDeLaMaison` sur le dû du Carnet) : la plus ancienne dette
   d'abord. Une recherche ouvre toutes les clientes de la branche, celles qui
   doivent toujours devant. */

const PLAFOND_DE_LA_RECHERCHE = 30;

export const depuisDit = (jours: number): string =>
  jours <= 0 ? 'depuis aujourd’hui' : jours === 1 ? 'depuis 1 jour' : `depuis ${jours} jours`;

export default function ChoisirPourLePoint() {
  const { branch, currency } = useBranch();
  const navigate = useNavigate();
  const appts = useBranchAppointments();
  const clients = useBranchClients();
  const byId = useServicesById();
  const clefDuTarif = useClefDuTarif();
  const aujourdhui = momentDuSalon().jour;
  const [q, setQ] = useState('');

  const creances = useMemo(
    () => creancesDeLaMaison({ appts, aujourdhui, dûDuRituel: (a) => apptDueXof(a, byId) }),
    [appts, aujourdhui, byId, clefDuTarif],
  );
  const dette = useMemo(() => new Map<string, Creance>(creances.map((c) => [c.clientId, c])), [creances]);
  const total = creances.reduce((s, c) => s + c.duXof, 0);
  const nomDe = (id: string) => clients.find((c) => c.id === id)?.name ?? '';

  const needle = normName(q);
  const lignes: { id: string; nom: string; c?: Creance }[] = needle
    ? clients
      .filter((c) => normName(c.name ?? '').includes(needle))
      .map((c) => ({ id: c.id, nom: c.name ?? '', c: dette.get(c.id) }))
      .sort((a, b) => (a.c ? 0 : 1) - (b.c ? 0 : 1) || (b.c?.depuisJours ?? 0) - (a.c?.depuisJours ?? 0) || a.nom.localeCompare(b.nom, 'fr'))
      .slice(0, PLAFOND_DE_LA_RECHERCHE)
    : creances.filter((c) => nomDe(c.clientId)).map((c) => ({ id: c.clientId, nom: nomDe(c.clientId), c }));

  const ouvre = (id: string) => navigate(`/point?id=${encodeURIComponent(id)}`);

  return (
    <div className="trp-point">
      <PageHead
        eyebrow={`Vente & Caisse · ${branch.city}`}
        title="Le point."
        sub={creances.length === 0
          ? 'Choisissez une cliente. Aucune ne doit rien sur ses rendez-vous.'
          : `Choisissez une cliente. ${creances.length} doi${creances.length > 1 ? 'vent' : 't'} encore, ${fmtMoney(total, currency)} en tout.`}
      />

      <div className="trc-toolbar">
        <div className="trc-searchwrap">
          <Search size={17} aria-hidden="true" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Chercher une cliente…" aria-label="Chercher une cliente pour son point" autoFocus />
        </div>
      </div>

      {!needle && creances.length > 0 && <p className="trp-point__note">Elles doivent encore, la plus ancienne dette d’abord.</p>}

      {lignes.length === 0 ? (
        <p className="trp-point__vide trp-point__choix-vide">
          {needle ? 'Aucune cliente de la branche ne porte ce nom.' : 'Tout est réglé : cherchez une cliente par son nom.'}
        </p>
      ) : (
        <ul className="trp-point__choix" aria-label="Clientes">
          {lignes.map((l) => (
            <li key={l.id}>
              <button type="button" onClick={() => ouvre(l.id)}>
                <span className="trp-point__choix-nom">
                  <b>{l.nom || 'Sans nom'}</b>
                  <small className={l.c ? 'is-du' : undefined}>{l.c ? `impayé ${depuisDit(l.c.depuisJours)}` : 'rien à régler sur ses rendez-vous'}</small>
                </span>
                {l.c && <span className="trp-point__choix-du">{fmtMoney(l.c.duXof, currency)}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
      {needle && lignes.length === PLAFOND_DE_LA_RECHERCHE && (
        <p className="trp-point__note">Les {PLAFOND_DE_LA_RECHERCHE} premières : précisez le nom pour la trouver.</p>
      )}
    </div>
  );
}
