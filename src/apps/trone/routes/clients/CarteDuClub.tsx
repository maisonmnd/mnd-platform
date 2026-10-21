import { useMemo } from 'react';
import { toast } from '../../../../ds/components';
import { useAppointments, type Appointment } from '../../../../shared/agenda';
import { useServices } from '../../../../shared/catalog';
import { useClients, poseLeCadeauDuClub, type Client } from '../../../../shared/clients';
import { quiEncaisse } from '../../../../shared/finance';
import { jourDitAvecLAnnee } from '../../../../shared/abonnee-pur';
import { jourDeCotonou } from '../../../../shared/ia-faits-pur';
import {
  releveDuClub, caurisDuRdv, phraseDuPalier, rangDit, COLLIER,
  type ReleveDuClub, type ServiceDuClub,
} from '../../../../shared/club-pur';
import './club.css';

/* ══ LE CLUB DES PETITES COURONNES AU TRÔNE — 21 octobre 2026 ═══════════
   Programme choisi par Yéman (artefact PsdoECCZ). La fiche d'un enfant porte
   son collier : dix cauris, un par venue honorée, le palier, ce qu'il manque,
   le cadeau à remettre et son geste « Remis », et l'anniversaire de sa
   couronne. La carte ne compte rien : elle lit `releveDuClub` (club-pur.ts),
   le même que Ma Couronne lit pour les parents. Un adulte n'y paraît jamais. */

/** LE COLLIER DESSINÉ : dix cauris sur un cordon, les gagnés pleins. */
export function CollierDeCauris({ n, taille = 'normal' }: { n: number; taille?: 'normal' | 'petit' }) {
  const pts = Array.from({ length: COLLIER }, (_, i) => {
    const t = i / (COLLIER - 1);
    return [40 + t * 520, 34 + Math.sin(t * Math.PI) * 22] as const;
  });
  return (
    <svg className={`trc-club__collier${taille === 'petit' ? ' is-petit' : ''}`} viewBox="0 0 600 110" role="img"
      aria-label={`${Math.min(n, COLLIER)} cauris sur ${COLLIER}`}>
      <path d="M12 22 Q300 96 588 22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="trc-club__cordon" />
      {pts.map(([x, y], i) => {
        const plein = i < n;
        return (
          <g key={i}>
            <ellipse cx={x} cy={y + 6} rx="12" ry="17" className={plein ? 'trc-club__cauris is-plein' : 'trc-club__cauris'} />
            {plein && <path d={`M${x} ${y - 5}c-1.6 6-1.6 16 0 22 1.6-6 1.6-16 0-22z`} className="trc-club__fente" />}
          </g>
        );
      })}
    </svg>
  );
}

const servicesDuClub = (services: readonly { id: string; categoryId?: string }[]): Map<string, ServiceDuClub> =>
  new Map(services.map((s) => [s.id, { id: s.id, categoryId: s.categoryId }]));

/** LA CARTE DE LA FICHE 360. Rien pour une tête qui n'est pas du Club. */
export function CarteDuClub({ client, appts }: { client: Client; appts: readonly Appointment[] }) {
  const [services] = useServices();
  const jour = jourDeCotonou();
  const r: ReleveDuClub = useMemo(
    () => releveDuClub({ jour, fiche: client, appts, services: servicesDuClub(services) }),
    [jour, client, appts, services],
  );
  if (!r.membre) return null;
  const prenom = client.name.split(' ')[0] || client.name;

  const remis = (palier: number) => {
    poseLeCadeauDuClub(client.id, palier, jour, quiEncaisse());
    toast('Cadeau marqué remis.');
  };

  return (
    <section className="trc-club" id="carte-du-club" aria-label="Le Club des Petites Couronnes">
      <div className="trc-club__tete">
        <div>
          <div className="trc-club__eyebrow">MND Kids · le Club des Petites Couronnes</div>
          <div className="trc-club__nom">
            {r.cauris === 0 ? 'Pas encore de cauris' : `${r.surLeCollier} cauris sur ${COLLIER}`}
            {r.palier && <span className="trc-club__palier"> · {r.palier.nom}</span>}
          </div>
          <div className="trc-club__ligne">
            {r.cauris === 0
              ? `Le premier cauris, à la première venue de ${prenom}.`
              : r.plein
                ? `Collier plein : ${prenom} est une Petite Couronne${r.cauris > COLLIER ? ` (${r.cauris} venues).` : '.'}`
                : r.prochain
                  ? `Encore ${r.prochain.manque} pour « ${r.prochain.palier.nom} » : ${r.prochain.palier.cadeau}.`
                  : ''}
          </div>
        </div>
        {r.anniversaire && (
          <div className="trc-club__anniv">
            <span>Anniversaire de couronne</span>
            <b>{jourDitAvecLAnnee(r.anniversaire.prochain)}</b>
            <small>{r.anniversaire.aujourdhui ? `c’est aujourd’hui : ${r.anniversaire.ans} an${r.anniversaire.ans > 1 ? 's' : ''}` : `${r.anniversaire.ans} an${r.anniversaire.ans > 1 ? 's' : ''} de couronne · Première Couronne le ${jourDitAvecLAnnee(r.anniversaire.premiereCouronne)}`}</small>
          </div>
        )}
      </div>
      <CollierDeCauris n={r.surLeCollier} />
      {r.cadeauxARemettre.length > 0 && (
        <div className="trc-club__cadeaux">
          {r.cadeauxARemettre.map((c) => (
            <div key={c.palier.cauris} className="trc-club__cadeau">
              <span>
                <b>À remettre :</b> {c.palier.cadeau}
                <small>{c.avantLeClub
                  ? c.palier.cauris === 1
                    ? ' · le kit de bienvenue, dû à chaque membre du Club'
                    : ` · palier « ${c.palier.nom} » atteint avant le Club, le ${jourDitAvecLAnnee(c.atteintLe)} : le cadeau de son passé`
                  : ` · ${rangDit(c.palier.cauris)}, le ${jourDitAvecLAnnee(c.atteintLe)}`}</small>
              </span>
              <button type="button" className="trc-abo__btn" onClick={() => remis(c.palier.cauris)}>Remis</button>
            </div>
          ))}
        </div>
      )}
      {r.cadeaux.some((c) => c.remis) && (
        <div className="trc-club__remis">
          {r.cadeaux.filter((c) => c.remis).map((c) => (
            <span key={c.palier.cauris}>{c.palier.nom} : remis le {jourDitAvecLAnnee(c.remis!.le)}{c.remis!.par ? ` par ${c.remis!.par}` : ''}</span>
          ))}
        </div>
      )}
    </section>
  );
}

/** LE SIGNAL SUR LA FICHE DU RENDEZ-VOUS : ce que cette venue fait au
    collier (« 3e cauris : le foulard de nuit est à remettre »), et les
    cadeaux qui attendent déjà. Rien pour un adulte ni pour un rendez-vous
    annulé. */
export function SignalDuClub({ appt }: { appt: Appointment }) {
  const [services] = useServices();
  const [tous] = useAppointments();
  const [clients] = useClients();
  const fiche = clients.find((c) => c.id === appt.clientId);
  const jour = jourDeCotonou();
  const lu = useMemo(() => {
    if (!fiche) return null;
    const svc = servicesDuClub(services);
    const effet = caurisDuRdv(appt, fiche, tous, svc);
    if (!effet) return null;
    const r = releveDuClub({ jour, fiche, appts: tous, services: svc });
    return { effet, attente: r.cadeauxARemettre.filter((c) => c.palier.cauris !== effet.palier?.cauris) };
  }, [fiche, services, appt, tous, jour]);
  if (!lu) return null;
  const { effet, attente } = lu;
  const deja = effet.palier && fiche?.clubCadeaux?.[String(effet.palier.cauris)];
  return (
    <div className="trc-club__signal" role="note">
      <b>Club des Petites Couronnes</b>
      <span>
        {effet.palier && !deja
          ? phraseDuPalier(effet.rang, effet.palier)
          : effet.dejaCompte ? `Cette venue a donné son ${rangDit(effet.rang)}.` : `Cette venue donnera son ${rangDit(effet.rang)}.`}
        {' '}Un tampon dans son carnet, un cauris sur son cordon.
      </span>
      {attente.map((c) => <span key={c.palier.cauris}>Aussi à remettre : {c.palier.aRemettre}.</span>)}
    </div>
  );
}
