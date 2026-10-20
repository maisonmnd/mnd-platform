import { useMemo, useState, type KeyboardEvent, type ReactNode } from 'react';
import { useAppointments, apptDueXof, type Appointment } from '../../shared/agenda';
import { useServices } from '../../shared/catalog';
import { etatDeLaSeance, type ReleveDeLAbonnee } from '../../shared/abonnee-pur';
import { MONTHS } from './lib';
import { ETAT_SEANCE, dateCourte, dateSansJour, heureDite, seanceDuRelevé } from './releve';
import { t, prix } from './i18n';
import './abonnee.css';

/* ══ L'ONGLET RENDEZ-VOUS — 20 octobre 2026 ══════════════════════════════
   Maquette L0 validée, écran 4 (décision 8 : la barre Accueil · Rendez-vous ·
   Ma formule · Suivi · Profil). « Qu'ai-je fait, qu'ai-je de prévu ? »

   DEUX SECTIONS, À VENIR ET PASSÉS. Les passés forment l'historique complet,
   rangé par année puis par mois (les rendez-vous sont lus par pages par la
   synchronisation : jamais mille pile). Une séance future annulée reste dans
   « À venir », barrée, jusqu'à sa date : elle n'a pas eu lieu.

   CHAQUE CARTE DIT SON ÉTAT ET SON ARGENT, lus dans le relevé : « Incluse ·
   séance 3 sur 6 », « Manquée », « Reste 10 000 F ». Déplacer et Annuler
   ouvrent la fiche du rendez-vous, qui dit leur effet AVANT d'agir (« à moins
   de 24 h, la séance est comptée »). */

const VIVANTS = new Set(['a-confirmer', 'confirmee', 'proposee']);

export default function RendezVousTab({ releve, prenom, selecteur, onOpenRdv, onGeste, onReserver }: {
  releve: ReleveDeLAbonnee;
  prenom?: string;
  selecteur?: ReactNode;
  onOpenRdv: (id: string) => void;
  onGeste: (id: string, geste: 'annuler' | 'deplacer') => void;
  onReserver: () => void;
}) {
  const [appts] = useAppointments();
  const [services] = useServices();
  const [vue, setVue] = useState<'avenir' | 'passes'>('avenir');
  const [seulementFormule, setSeulementFormule] = useState(false);
  const jour = releve.jour;
  const abonnee = releve.contrats.length + releve.anciens.length > 0;

  const siens = useMemo(
    () => appts.filter((a) => a.clientId === releve.clientId)
      .sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`)),
    [appts, releve.clientId],
  );
  const etatDe = (a: Appointment) => etatDeLaSeance(a, jour);
  const aVenir = siens.filter((a) => a.date >= jour && (VIVANTS.has(etatDe(a)) || etatDe(a) === 'annulee'));
  const passes = siens.filter((a) => !aVenir.includes(a)).reverse();
  const filtre = (l: Appointment[]) => (seulementFormule ? l.filter((a) => !!seanceDuRelevé(releve, a.id)?.s.compte || a.coveredBySub) : l);
  const liste = filtre(vue === 'avenir' ? aVenir : passes);

  const noms = (a: Appointment) => a.serviceIds.map((id) => services.find((s) => s.id === id)?.name).filter(Boolean).join(' + ') || t('Rituel de la maison');

  /** L'étiquette d'argent : incluse (et son rang), ou ce qu'elle coûte. */
  const argent = (a: Appointment): { mot: string; cls: string } | null => {
    const x = seanceDuRelevé(releve, a.id);
    if (x && x.s.compte) {
      if (x.c.mode === 'cycle') return { mot: x.c.lune ? t('Incluse · lune du {date}', { date: dateSansJour(x.c.lune.du) }) : t('Incluse dans la lune'), cls: '' };
      return x.s.rang && x.s.total ? { mot: t('Incluse · séance {n} sur {total}', { n: x.s.rang, total: x.s.total }), cls: '' } : { mot: t('Incluse dans la formule'), cls: '' };
    }
    if (x && x.s.pourquoiPas === 'rendue') return { mot: t('Rendue par la Maison'), cls: 'ab-argent--hors' };
    if (a.coveredBySub) return { mot: t('Incluse'), cls: '' };
    if (a.priceXof == null) return null;
    const net = Math.max(0, Math.round(a.priceXof * (1 - (a.discountPct ?? 0) / 100)) - (a.discountXof ?? 0));
    const reste = apptDueXof(a, net);
    if (a.status === 'annulé') return null;
    if (a.date <= jour) return reste > 0 ? { mot: t('Reste {montant}', { montant: prix(reste) }), cls: 'ab-argent--reste' } : { mot: t('Réglée'), cls: 'ab-argent--hors' };
    return { mot: t('À la carte · {montant}', { montant: prix(net) }), cls: 'ab-argent--hors' };
  };

  const auClavier = (id: string) => (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpenRdv(id); }
  };

  const carte = (a: Appointment, avenir: boolean) => {
    const etat = etatDe(a);
    const e = ETAT_SEANCE[etat];
    const ar = argent(a);
    const annulee = etat === 'annulee';
    return (
      <div key={a.id} className={`ab-card ab-rdvc ${avenir ? '' : 'ab-rdvc--passe'} ${annulee ? 'ab-rdvc--annulee' : ''}`}>
        <div className="ab-rdvc__clic" role="button" tabIndex={0} onClick={() => onOpenRdv(a.id)} onKeyDown={auClavier(a.id)}>
          <div className="ab-card__top">
            <span className="ab-card__when">{t('{date} · {heure}', { date: dateCourte(a.date), heure: heureDite(a.time) })}</span>
            <span className={`mc-stchip ${e.cls}`}>{t(e.dit)}</span>
          </div>
          <div className="ab-card__svc">{noms(a)}</div>
          {ar && <span className={`ab-argent ${ar.cls}`}>{ar.mot}</span>}
        </div>
        {avenir && annulee && <p className="ab-rdvc__note">{t('Annulée. Elle reste ici, barrée, jusqu’à sa date.')}</p>}
        {avenir && !annulee && (
          <div className="ab-rdvc__acts">
            {etat === 'proposee' ? (
              <>
                <button type="button" className="mc-rdvact" onClick={() => onOpenRdv(a.id)}>{t('Confirmer')}</button>
                <button type="button" className="mc-rdvact" onClick={() => onGeste(a.id, 'deplacer')}>{t('Un autre moment')}</button>
              </>
            ) : (
              <>
                <button type="button" className="mc-rdvact" onClick={() => onGeste(a.id, 'deplacer')}>{t('Déplacer')}</button>
                <button type="button" className="mc-rdvact mc-rdvact--danger" onClick={() => onGeste(a.id, 'annuler')}>{t('Annuler')}</button>
              </>
            )}
          </div>
        )}
      </div>
    );
  };

  /* L'HISTORIQUE PAR ANNÉE PUIS PAR MOIS. */
  const passesRanges: ReactNode[] = [];
  let annee: number | null = null;
  let leMois: number | null = null;
  for (const a of liste) {
    const [y, m] = a.date.split('-').map(Number);
    if (vue === 'passes' && y !== annee) { passesRanges.push(<h3 key={`a${y}`} className="ab-annee">{y}</h3>); annee = y; leMois = null; }
    if (vue === 'passes' && m !== leMois) { passesRanges.push(<div key={`m${y}-${m}`} className="ab-mois">{`${MONTHS[m - 1]} ${y}`}</div>); leMois = m; }
    passesRanges.push(carte(a, vue === 'avenir'));
  }

  return (
    <div className="mc-fade">
      <div className="ab-tete">
        <div className="mc-micro-eyebrow">{t('Votre agenda · la Maison suit')}</div>
        <h1 className="ab-titre">{prenom ? t('Les rendez-vous de {prenom}.', { prenom }) : t('Mes rendez-vous.')}</h1>
      </div>
      <div className="ab-page">
        {selecteur}
        <div className="ab-segs" role="group" aria-label={t('À venir ou passés')}>
          <button type="button" className={`ab-segs__opt ${vue === 'avenir' ? 'is-on' : ''}`} aria-pressed={vue === 'avenir'} onClick={() => setVue('avenir')}>
            {t('À venir · {n}', { n: aVenir.length })}
          </button>
          <button type="button" className={`ab-segs__opt ${vue === 'passes' ? 'is-on' : ''}`} aria-pressed={vue === 'passes'} onClick={() => setVue('passes')}>
            {t('Passés · {n}', { n: passes.length })}
          </button>
        </div>
        {abonnee && (
          <button type="button" className={`ab-bascule ${seulementFormule ? 'is-on' : ''}`} aria-pressed={seulementFormule} onClick={() => setSeulementFormule(!seulementFormule)}>
            <span className="ab-bascule__rond" aria-hidden="true" />
            {prenom ? t('Seulement sa formule') : t('Seulement ma formule')}
          </button>
        )}
        {liste.length === 0 ? (
          <div className="ab-vide">
            <div className="ab-vide__g" aria-hidden="true">♛</div>
            <div className="ab-vide__t">{vue === 'avenir' ? t('Aucune séance à venir.') : t('Rien ici pour l’instant.')}</div>
            <p className="ab-vide__s">{vue === 'avenir'
              ? t('Réservez la prochaine : elle paraîtra ici, avec sa date et son état.')
              : t('Vos séances passées s’y rangeront, par année puis par mois.')}</p>
          </div>
        ) : passesRanges}
        <button type="button" className="mc-cta mc-cta--quiet" onClick={onReserver}>{t('Réserver une séance')}</button>
      </div>
    </div>
  );
}
