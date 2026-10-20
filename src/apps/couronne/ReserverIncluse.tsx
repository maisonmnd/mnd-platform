import { useMemo, useState } from 'react';
import { useBranch } from '../../shared/branches';
import { useAppointments } from '../../shared/agenda';
import { useServices } from '../../shared/catalog';
import { pushNotifyStaff } from '../../shared/push';
import { decaleLeJour } from '../../shared/ia-faits-pur';
import {
  formuleProposeePourReserver, peutPorter, type ReleveDeLAbonnee, type ReleveDuContrat,
} from '../../shared/abonnee-pur';
import { DOW_LETTERS, MONTHS, dayLabelIsoFr, freeSlots, pad2, useCreneauxOccupes } from './lib';
import { appelleLaMaison, dateDansLaPhrase, dateLongue, heureDite } from './releve';
import { t } from './i18n';
import './abonnee.css';

/* ══ RÉSERVER UNE SÉANCE DE MA FORMULE — 20 octobre 2026 ════════════════
   Maquette L0 validée, écran 3. Décision 2 (« couverte d'office ») : une
   séance incluse réservée ici naît COUVERTE par le serveur, à 0 F, sans
   acompte, le crédit vérifié sous verrou. Le comptoir peut la décocher.

   CINQ TEMPS : le choix (de ma formule, ou un autre soin, qui reste le tunnel
   d'aujourd'hui), quoi (seulement ce qui a encore un crédit), quand (le
   calendrier s'arrête à la date de fin du contrat), le récapitulatif (« Incluse
   dans votre formule : 0 F », et ce qu'il restera), la fin (« Confirmée » ou
   « À confirmer par la Maison », jamais « scellé »).

   DEUX FORMULES EN MÊME TEMPS (tranché au sélecteur le 20 octobre 2026) :
   celle qui finit le plus tôt est proposée d'office ; l'autre se choisit
   d'une touche. Le relevé décide (`formuleProposeePourReserver`), l'écran
   ne compte rien.

   L'ÉCRITURE EST AU SERVEUR (`reserver_une_seance_incluse`). Tant qu'elle
   n'est pas posée en base, l'écran le dit et propose l'autre chemin : il ne
   pose JAMAIS une séance au prix plein en se croyant incluse. */

type Temps = 'choix' | 'quoi' | 'quand' | 'recap' | 'fin';
type Posee = { apptId: string; etat: 'a-confirmer' | 'confirmee'; disponiblesApres?: number };

const RAISONS: Record<string, string> = {
  quota: 'Il ne reste plus de séance de ce soin sur la formule.',
  pause: 'La formule est en pause : réglez la lune, puis réservez.',
  retenue: 'Aucune séance incluse avant le premier règlement.',
  fin: 'Cette date est après la fin de votre formule.',
  retard: 'Une échéance attend : réglez-la, la réservation se rouvre aussitôt.',
  place: 'Ce moment vient d’être pris. Choisissez-en un autre.',
  ferme: 'La Maison est fermée ce jour-là.',
};

export default function ReserverIncluse({ releve, prenom, teteId, estElle, debut = 'choix', onClose, onAutreSoin, onVoirRdv, toast }: {
  releve: ReleveDeLAbonnee;
  prenom?: string;
  teteId: string;
  /** La tête est la cliente elle-même (et non une tête portée). */
  estElle: boolean;
  debut?: Temps;
  onClose: () => void;
  onAutreSoin: () => void;
  onVoirRdv: (id: string) => void;
  toast: (m: string) => void;
}) {
  const { branch } = useBranch();
  const [services] = useServices();
  const [appts] = useAppointments();
  const jour = releve.jour;
  const nomDe = (id: string) => services.find((s) => s.id === id)?.name ?? t('Prestation retirée');

  const ouverts = releve.contrats.filter((c) => c.porte.peutReserverIncluse);
  const [temps, setTemps] = useState<Temps>(ouverts.length ? debut : 'choix');
  const [serviceId, setServiceId] = useState<string | null>(null);
  const [iso, setIso] = useState<string | null>(null);
  const [heure, setHeure] = useState<string | null>(null);
  const [choisi, setChoisi] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const [mot, setMot] = useState('');
  const [posee, setPosee] = useState<Posee | null>(null);
  const [mois, setMois] = useState(0);

  /* CE QUI A ENCORE UN CRÉDIT, toutes formules ouvertes réunies. */
  const soins = useMemo(() => {
    const parSoin = new Map<string, { serviceId: string; disponibles: number | null; total: number | null }>();
    for (const c of ouverts) {
      for (const l of c.seances) {
        if (l.disponibles !== null && l.disponibles <= 0) continue;
        const deja = parSoin.get(l.serviceId);
        parSoin.set(l.serviceId, {
          serviceId: l.serviceId,
          disponibles: deja?.disponibles === null || l.disponibles === null ? null : (deja?.disponibles ?? 0) + l.disponibles,
          total: deja?.total === null || l.incluses === null ? null : (deja?.total ?? 0) + l.incluses,
        });
      }
    }
    return [...parSoin.values()];
  }, [ouverts]);

  /* LA DATE DE FIN : celle de la formule qui peut porter ce soin le plus tard. */
  const finMax = useMemo(() => {
    const fins = ouverts.filter((c) => !serviceId || c.seances.some((l) => l.serviceId === serviceId)).map((c) => c.finIso ?? decaleLeJour(jour, 120));
    return fins.length ? fins.sort().reverse()[0] : decaleLeJour(jour, 120);
  }, [ouverts, serviceId, jour]);

  const service = serviceId ? services.find((s) => s.id === serviceId) : undefined;
  const duree = service?.durationMin ?? 60;
  const maitre = service?.master ?? '';

  /* LES MOIS DU CALENDRIER : d'aujourd'hui à la fin du contrat, six au plus. */
  const lesMois = useMemo(() => {
    const [a0, m0] = jour.split('-').map(Number);
    const [a1, m1] = finMax.split('-').map(Number);
    const n = Math.min(6, (a1 - a0) * 12 + (m1 - m0) + 1);
    return Array.from({ length: Math.max(1, n) }, (_, k) => {
      const d = new Date(Date.UTC(a0, m0 - 1 + k, 1));
      return { y: d.getUTCFullYear(), m: d.getUTCMonth() };
    });
  }, [jour, finMax]);
  const leMois = lesMois[Math.min(mois, lesMois.length - 1)];
  const fenetre = useMemo(() => {
    const p = lesMois[0];
    const d = lesMois[lesMois.length - 1];
    return { du: `${p.y}-${pad2(p.m + 1)}-01`, au: `${d.y}-${pad2(d.m + 1)}-${pad2(new Date(Date.UTC(d.y, d.m + 1, 0)).getUTCDate())}` };
  }, [lesMois]);
  const occupes = useCreneauxOccupes(branch.id, fenetre.du, fenetre.au);

  /** Un jour se propose s'il est avant la fin, qu'une formule peut le porter,
      et qu'il reste une heure libre. */
  const jourOuvert = (x: string): boolean => {
    if (!serviceId || x < jour || x > finMax) return false;
    if (!formuleProposeePourReserver(releve, serviceId, x).proposee) return false;
    return freeSlots(x, maitre, duree, appts, services, branch.id, occupes).length > 0;
  };
  const cases = useMemo(() => {
    if (!serviceId) return [];
    const premier = new Date(Date.UTC(leMois.y, leMois.m, 1));
    const n = new Date(Date.UTC(leMois.y, leMois.m + 1, 0)).getUTCDate();
    const out: { cle: string; jour: number | null; iso?: string; libre: boolean; apres: boolean }[] = [];
    for (let i = 0; i < premier.getUTCDay(); i += 1) out.push({ cle: `v${i}`, jour: null, libre: false, apres: false });
    for (let d = 1; d <= n; d += 1) {
      const x = `${leMois.y}-${pad2(leMois.m + 1)}-${pad2(d)}`;
      out.push({ cle: x, jour: d, iso: x, libre: jourOuvert(x), apres: x > finMax });
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serviceId, leMois, finMax, appts, services, occupes, releve]);
  const heures = iso && serviceId ? freeSlots(iso, maitre, duree, appts, services, branch.id, occupes) : [];

  /* LA FORMULE QUI COMPTE LA SÉANCE : proposée d'office, l'autre au choix. */
  const proposition = serviceId && iso ? formuleProposeePourReserver(releve, serviceId, iso) : { autres: [] as ReleveDuContrat[] };
  const possibles = [proposition.proposee, ...proposition.autres].filter((c): c is ReleveDuContrat => !!c);
  const contrat = possibles.find((c) => c.sub.id === choisi) ?? proposition.proposee;
  const ligne = contrat && serviceId ? contrat.seances.find((l) => l.serviceId === serviceId) : undefined;
  const apres = ligne && ligne.disponibles !== null ? Math.max(0, ligne.disponibles - 1) : null;

  const reserver = async () => {
    if (!contrat || !serviceId || !iso || !heure || envoi) return;
    if (!peutPorter(contrat, serviceId, iso)) { setMot(t('Cette formule ne peut plus porter cette séance. Choisissez un autre jour.')); return; }
    setEnvoi(true);
    setMot('');
    const r = await appelleLaMaison<{ ok?: boolean; apptId?: string; etat?: 'a-confirmer' | 'confirmee'; disponiblesApres?: number; raison?: string }>(
      'reserver_une_seance_incluse',
      { p_sub_id: contrat.sub.id, p_service_id: serviceId, p_date: iso, p_time: heure, p_extras: [], p_client_id: estElle ? null : teteId },
    );
    setEnvoi(false);
    if (!r.ok) {
      setMot(r.absente
        ? t('La réservation d’une séance de votre formule ouvre très bientôt. En attendant, réservez un autre soin, ou écrivez à la Maison.')
        : r.raison && RAISONS[r.raison] ? t(RAISONS[r.raison]) : t('La Maison n’a pas pu poser cette séance. Réessayez, ou écrivez-lui.'));
      return;
    }
    const d = r.data;
    setPosee({ apptId: d.apptId ?? '', etat: d.etat === 'confirmee' ? 'confirmee' : 'a-confirmer', disponiblesApres: d.disponiblesApres });
    setTemps('fin');
    void pushNotifyStaff(
      'Séance de formule réservée · Ma Couronne',
      `${contrat.reference} · ${nomDe(serviceId)} · ${dayLabelIsoFr(iso)} à ${heure}, incluse`,
      '/trone/#/calendrier',
    );
    toast(d.etat === 'confirmee' ? t('Séance réservée et confirmée.') : t('Séance réservée, la Maison la confirme.'));
  };

  const ETAPES: Temps[] = ['choix', 'quoi', 'quand', 'recap'];
  const rang = ETAPES.indexOf(temps);
  const retour = () => {
    if (temps === 'quoi') setTemps('choix');
    else if (temps === 'quand') { setTemps('quoi'); setIso(null); setHeure(null); }
    else if (temps === 'recap') setTemps('quand');
    else onClose();
  };
  const TITRES: Record<Temps, string> = {
    choix: t('Réserver.'), quoi: t('La séance.'), quand: t('Le moment.'), recap: t('Récapitulatif.'), fin: t('C’est posé.'),
  };

  return (
    <div className="mc-overlayscreen mc-slide" style={{ zIndex: 43 }}>
      <div className="mc-flowhead">
        <div className="mc-flowhead__row">
          {temps === 'fin' ? <span /> : <button type="button" className="mc-linkback" onClick={retour}>← {t('Retour')}</button>}
          <button type="button" className="mc-x" aria-label={t('Fermer')} onClick={onClose}>✕</button>
        </div>
        {rang >= 0 && <div className="mc-progress"><div style={{ width: `${((rang + 1) / 4) * 100}%` }} /></div>}
        <div className="mc-flowhead__titles">
          <div>
            <div className="mc-micro-eyebrow">{prenom ? t('Réserver · une séance de sa formule') : t('Réserver · une séance de ma formule')}</div>
            <h1 className="mc-flowhead__h1">{TITRES[temps]}</h1>
          </div>
          {rang >= 0 && <span className="mc-flowhead__count">{t('{n} / 4', { n: rang + 1 })}</span>}
        </div>
      </div>

      <div className="mc-scroll mc-flowbody">
        <div className="ab-page" style={{ padding: 0 }}>
          {temps === 'choix' && (
            <>
              <button type="button" className="ab-choix" disabled={!ouverts.length} onClick={() => setTemps('quoi')}>
                <span className="ab-choix__n">{prenom ? t('Une séance de sa formule') : t('Une séance de ma formule')}</span>
                <span className="ab-choix__s">{ouverts.length
                  ? t('Incluse : 0 F, sans acompte. {nom}, jusqu’au {date}.', { nom: ouverts[0].nom, date: ouverts[0].finIso ? dateDansLaPhrase(ouverts[0].finIso) : t('sans date de fin') })
                  : releve.porte.raison === 'pause' ? t('La formule est en pause : réglez la lune, puis réservez.')
                    : releve.porte.raison === 'retenue' ? t('Aucune séance incluse avant le premier règlement.')
                      : releve.porte.raison === 'retard' ? t('Une échéance attend : réglez-la, la réservation se rouvre aussitôt.')
                        : t('Toutes les séances de la formule sont faites ou réservées.')}</span>
              </button>
              <button type="button" className="ab-choix" onClick={onAutreSoin}>
                <span className="ab-choix__n">{t('Un autre soin')}</span>
                <span className="ab-choix__s">{t('Hors formule, au prix de votre tête, comme aujourd’hui.')}</span>
              </button>
            </>
          )}

          {temps === 'quoi' && (
            <>
              <p className="ab-meta">{t('Seulement ce que votre formule porte encore.')}</p>
              {soins.map((s) => (
                <button key={s.serviceId} type="button" className={`ab-choix ${serviceId === s.serviceId ? 'is-on' : ''}`}
                  onClick={() => { setServiceId(s.serviceId); setIso(null); setHeure(null); setMois(0); setTemps('quand'); }}>
                  <span className="ab-choix__haut">
                    <span className="ab-choix__n">{nomDe(s.serviceId)}</span>
                    <span className="ab-choix__m">{s.disponibles === null ? t('sans limite') : s.total
                      ? t('{n} sur {total}', { n: s.disponibles, total: s.total }) : String(s.disponibles)}</span>
                  </span>
                  <span className="ab-choix__s">{s.disponibles === null ? t('Incluse, sans limite.') : (s.disponibles ?? 0) > 1
                    ? t('{n} disponibles, incluses dans votre formule.', { n: s.disponibles ?? 0 })
                    : t('{n} disponible, incluse dans votre formule.', { n: s.disponibles ?? 0 })}</span>
                </button>
              ))}
              {!soins.length && <p className="ab-meta">{t('Toutes les séances de la formule sont faites ou réservées.')}</p>}
            </>
          )}

          {temps === 'quand' && serviceId && (
            <>
              <div className="mc-calnav">
                <button type="button" onClick={() => setMois(Math.max(0, mois - 1))} disabled={mois === 0} aria-label={t('Mois précédent')}>‹</button>
                <span>{`${MONTHS[leMois.m]} ${leMois.y}`}</span>
                <button type="button" onClick={() => setMois(Math.min(lesMois.length - 1, mois + 1))} disabled={mois >= lesMois.length - 1} aria-label={t('Mois suivant')}>›</button>
              </div>
              <div className="mc-calgrid mc-calgrid--dows">{DOW_LETTERS.map((d, i) => <div key={i}>{d}</div>)}</div>
              <div className="mc-calgrid">
                {cases.map((c) => (c.jour === null ? <span key={c.cle} /> : (
                  <button key={c.cle} type="button"
                    className={`mc-calday ${c.iso === iso ? 'is-sel' : ''} ${c.libre ? 'is-free' : 'is-off'} ${c.apres ? 'ab-calday-apres' : ''}`}
                    onClick={() => { if (!c.libre) { toast(t('Aucune place ce jour pour votre formule.')); return; } setIso(c.iso!); setHeure(null); setChoisi(null); }}>
                    {c.jour}
                    {c.libre && c.iso !== iso && <i />}
                  </button>
                )))}
              </div>
              <p className="ab-calbas">{t('Porte close le dimanche. Votre formule court jusqu’au {date} : le calendrier s’arrête là.', { date: dateDansLaPhrase(finMax) })}</p>
              {iso && (
                <>
                  <div className="ab-lab">{dateLongue(iso)}</div>
                  <div className="ab-heures">
                    {heures.map((h) => (
                      <button key={h} type="button" className={`ab-heure ${heure === h ? 'is-on' : ''}`} onClick={() => setHeure(h)}>{heureDite(h)}</button>
                    ))}
                  </div>
                  {!heures.length && <p className="ab-meta">{t('Plus de place ce jour, choisissez un autre jour.')}</p>}
                </>
              )}
              <div className={`ab-barre-bas ${heure ? '' : 'ab-barre-bas--vide'}`}>
                <div>
                  <span className="ab-barre-bas__n">{iso && heure ? t('{date} · {heure}', { date: dateLongue(iso), heure: heureDite(heure) }) : t('Choisissez un jour, puis une heure.')}</span>
                </div>
                {iso && heure && <button type="button" className="mc-cta mc-cta--copper" onClick={() => setTemps('recap')}>{t('Continuer')}</button>}
              </div>
            </>
          )}

          {temps === 'recap' && serviceId && iso && heure && contrat && (
            <>
              {possibles.length > 1 && (
                <div className="ab-compter" role="group" aria-label={t('Compter sur')}>
                  <span>{t('Compter sur :')}</span>
                  {possibles.map((c) => (
                    <button key={c.sub.id} type="button" className={contrat.sub.id === c.sub.id ? 'is-on' : ''} onClick={() => setChoisi(c.sub.id)}>
                      {c.finIso ? t('{nom} · finit le {date}', { nom: c.nom, date: dateDansLaPhrase(c.finIso) }) : c.nom}
                    </button>
                  ))}
                </div>
              )}
              <div className="ab-recap">
                <div className="ab-recap__l"><span>{t('La séance')}</span><span>{nomDe(serviceId)}</span></div>
                <div className="ab-recap__l"><span>{t('Le moment')}</span><span>{t('{date} · {heure}', { date: dateLongue(iso), heure: heureDite(heure) })}</span></div>
                <div className="ab-recap__l"><span>{t('La formule')}</span><span>{t('{nom} · {reference}', { nom: contrat.nom, reference: contrat.reference })}</span></div>
                {prenom && <div className="ab-recap__l"><span>{t('Pour')}</span><span>{prenom}</span></div>}
                {ligne && ligne.incluses !== null && apres !== null && (
                  <div className="ab-recap__l"><span>{t('Après cette séance')}</span><span>{t('{n} disponibles sur {total}', { n: apres, total: ligne.incluses })}</span></div>
                )}
                <div className="ab-recap__total"><span>{t('Incluse dans votre formule')}</span><span>0 F</span></div>
              </div>
              <p className="ab-meta">{t('Sans acompte. Plus de 24 h avant, vous la déplacez ou l’annulez sans que rien ne soit compté ; à moins de 24 h, ou absente, elle est comptée et marquée « Manquée ».')}</p>
              {mot && <p className="ab-meta" role="status" style={{ color: 'var(--mc-error)' }}>{mot}</p>}
              <button type="button" className="mc-cta mc-cta--copper" disabled={envoi} onClick={() => void reserver()}>
                {envoi ? t('Un instant…') : t('Réserver cette séance')}
              </button>
              <button type="button" className="mc-cta mc-cta--quiet" onClick={onAutreSoin}>{t('Réserver un autre soin')}</button>
            </>
          )}

          {temps === 'fin' && posee && serviceId && iso && heure && (
            <div className="mc-confirm">
              <h2>{posee.etat === 'confirmee' ? t('Confirmée.') : t('À confirmer par la Maison.')}</h2>
              <p className="ab-meta">{posee.etat === 'confirmee'
                ? t('La Maison vous attend. Vous recevrez un rappel la veille.')
                : t('La Maison la confirme très vite ; vous le lirez ici et sur WhatsApp.')}</p>
              <div className="ab-recap" style={{ width: '100%', textAlign: 'left' }}>
                <div className="ab-recap__l"><span>{t('La séance')}</span><span>{nomDe(serviceId)}</span></div>
                <div className="ab-recap__l"><span>{t('Le moment')}</span><span>{t('{date} · {heure}', { date: dateLongue(iso), heure: heureDite(heure) })}</span></div>
                {posee.disponiblesApres != null && (
                  <div className="ab-recap__l"><span>{t('Il vous reste')}</span><span>{posee.disponiblesApres > 1
                    ? t('{n} séances disponibles', { n: posee.disponiblesApres })
                    : t('{n} séance disponible', { n: posee.disponiblesApres })}</span></div>
                )}
                <div className="ab-recap__total"><span>{t('Incluse dans votre formule')}</span><span>0 F</span></div>
              </div>
              {posee.apptId && <button type="button" className="mc-cta mc-cta--copper" onClick={() => onVoirRdv(posee.apptId)}>{t('Voir mon rendez-vous')}</button>}
              <button type="button" className="mc-cta mc-cta--quiet" onClick={onClose}>{t('Revenir à l’accueil')}</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
