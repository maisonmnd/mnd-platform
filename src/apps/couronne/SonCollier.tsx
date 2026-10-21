import { useMemo } from 'react';
import type { Appointment } from '../../shared/agenda';
import type { Client } from '../../shared/clients';
import { releveDuClub, COLLIER, type ServiceDuClub } from '../../shared/club-pur';
import { dateDansLaPhrase, leJour } from './releve';
import { t } from './i18n';
import './club.css';

/* ══ SON COLLIER — 21 octobre 2026 ═════════════════════════════════════
   Le Club des Petites Couronnes (programme choisi par Yéman, artefact
   PsdoECCZ), dans l'espace du parent, sur la tête de l'enfant qu'il porte :
   les cauris gagnés, le palier, ce qu'il manque, le cadeau qui l'attend, et
   l'anniversaire de sa couronne. Le parent est vouvoyé ; la ligne écrite pour
   l'enfant le tutoie, comme le carnet. Rien ne se compte ici : la règle est
   `releveDuClub` (club-pur.ts), la même que la fiche du Trône. */
export function SonCollier({ enfant, appts, services }: {
  enfant: Client;
  appts: readonly Appointment[];
  services: readonly { id: string; categoryId?: string }[];
}) {
  const jour = leJour();
  const r = useMemo(() => releveDuClub({
    jour,
    fiche: enfant,
    appts,
    services: new Map<string, ServiceDuClub>(services.map((s) => [s.id, { id: s.id, categoryId: s.categoryId }])),
  }), [jour, enfant, appts, services]);
  if (!r.membre) return null;
  const pts = Array.from({ length: COLLIER }, (_, i) => {
    const x = i / (COLLIER - 1);
    return [40 + x * 520, 34 + Math.sin(x * Math.PI) * 22] as const;
  });
  const prochain = r.prochain;
  const pourToi = r.plein
    ? t('Ton collier est plein : tu es une Petite Couronne.')
    : prochain
      ? prochain.manque > 1
        ? t('Encore {n} visites, et c’est {cadeau}.', { n: prochain.manque, cadeau: prochain.palier.cadeauPourToi })
        : t('Encore une visite, et c’est {cadeau}.', { cadeau: prochain.palier.cadeauPourToi })
      : '';
  return (
    <div className="mc-club">
      <div className="mc-club__label">{t('Son collier · le Club des Petites Couronnes')}</div>
      <div className="mc-club__titre">
        {r.cauris === 0 ? t('Son premier cauris l’attend.') : t('{n} cauris sur {total}', { n: r.surLeCollier, total: COLLIER })}
        {r.palier && <span className="mc-club__palier"> · {r.palier.nom}</span>}
      </div>
      <svg className="mc-club__collier" viewBox="0 0 600 110" role="img"
        aria-label={t('{n} cauris sur {total}', { n: r.surLeCollier, total: COLLIER })}>
        <path d="M12 22 Q300 96 588 22" className="mc-club__cordon" />
        {pts.map(([x, y], i) => (
          <g key={i}>
            <ellipse cx={x} cy={y + 6} rx="13" ry="18" className={i < r.surLeCollier ? 'mc-club__cauris is-plein' : 'mc-club__cauris'} />
            {i < r.surLeCollier && <path d={`M${x} ${y - 5}c-1.7 6-1.7 17 0 23 1.7-6 1.7-17 0-23z`} className="mc-club__fente" />}
          </g>
        ))}
      </svg>
      {/* La ligne de l'enfant, entre guillemets, sauf quand le cadeau porte déjà
          les siens (« Mon kit de couronne ») : pas de guillemets dans des guillemets. */}
      {pourToi && <p className="mc-club__toi">{pourToi.includes('«') ? pourToi : `« ${pourToi} »`}</p>}
      {r.cadeauxARemettre.map((c) => (
        <p key={c.palier.cauris} className="mc-club__cadeau">
          {t('Un cadeau l’attend à sa prochaine visite : {cadeau}.', { cadeau: c.palier.cadeau })}
        </p>
      ))}
      {r.anniversaire && (
        <p className="mc-club__anniv">
          {r.anniversaire.aujourdhui
            ? r.anniversaire.ans > 1
              ? t('C’est aujourd’hui l’anniversaire de sa couronne : {ans} ans.', { ans: r.anniversaire.ans })
              : t('C’est aujourd’hui l’anniversaire de sa couronne : un an.')
            : r.anniversaire.ans > 1
              ? t('Anniversaire de sa couronne le {date} : {ans} ans.', { date: dateDansLaPhrase(r.anniversaire.prochain), ans: r.anniversaire.ans })
              : t('Anniversaire de sa couronne le {date} : un an.', { date: dateDansLaPhrase(r.anniversaire.prochain) })}
        </p>
      )}
      {r.cauris === 0 && <p className="mc-club__anniv">{t('À sa première visite, la Maison lui donne son cordon, son carnet et son premier cauris.')}</p>}
    </div>
  );
}
