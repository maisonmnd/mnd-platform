import { useMemo, useState } from 'react';
import { supabase } from '../../shared/supabase';
import { openingForIso } from '../../shared/settings';
import { momentDuSalon } from '../../shared/calendrier';
import { joursCompletsAProposer } from '../../shared/liste-d-attente-pur';
import { t, locale } from './i18n';
import './attente.css';

/* ══ « PRÉVENEZ-MOI SI UNE PLACE SE LIBÈRE CE JOUR-LÀ » — 26 novembre 2026 ══
   Audit du Trône, point B3 (validé par Yéman, « construis »), dans Ma
   Couronne. Sous le mois de la réservation, les jours complets pour ce
   rituel (ni fermés ni passés, jour de Cotonou) se touchent ; un toucher de
   plus et la demande part à `demande-submit` (`{ prevenir: 'place',
   couronne: true }`) avec sa session : son prénom et son numéro se lisent sur
   SA fiche au serveur, jamais sur l'appareil. L'équipe la prévient par
   WhatsApp si une place se libère.

   Posé dans la réservation par UNE ligne ; une séance seule (une série se
   choisit séance par séance, et la file ne sait pas attendre une série). */

export default function PrevenezMoi({ actif, cellules, pour, branchId, serviceIds, dureeMin, lourde }: {
  actif: boolean;
  cellules: readonly { iso?: string; free: boolean }[];
  pour: string | null | undefined;
  branchId: string;
  serviceIds: readonly string[];
  dureeMin: number;
  lourde: boolean;
}) {
  const [jour, setJour] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState<'repos' | 'part' | 'fait'>('repos');
  const [dit, setDit] = useState<{ ok: boolean; texte: string } | null>(null);
  const aujourdhui = momentDuSalon().jour;

  const complets = useMemo(() => (actif && serviceIds.length > 0
    ? joursCompletsAProposer(cellules.map((c) => ({ iso: c.iso, complet: !!c.iso && !c.free && !openingForIso(c.iso).closed })), aujourdhui, 8)
    : []), [actif, cellules, serviceIds.length, aujourdhui]);

  if (!pour || complets.length === 0) return null;

  const jourDit = (iso: string): string => new Date(`${iso}T12:00:00Z`).toLocaleDateString(locale(), { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });

  const envoyer = async () => {
    if (!jour || envoi === 'part' || !supabase) return;
    setEnvoi('part');
    setDit(null);
    let r: { ok?: unknown; deja?: unknown; error?: unknown } | null = null;
    try {
      const { data, error } = await supabase.functions.invoke('demande-submit', {
        body: { prevenir: 'place', couronne: true, data: { jour, pour, branchId, serviceIds, dureeMin, lourde } },
      });
      if (!error) r = data as typeof r;
      else {
        const rep = (error as { context?: Response } | null)?.context;
        r = rep && typeof rep.json === 'function' ? await rep.json().catch(() => null) : null;
      }
    } catch { /* la phrase de panne suit */ }
    if (r?.ok === true) {
      setDit({ ok: true, texte: r.deja === true
        ? t('Vous êtes déjà sur la liste de ce jour. Nous vous écrirons sur WhatsApp si une place se libère.')
        : t('C’est noté. Si une place se libère ce jour-là, nous vous écrirons sur WhatsApp.') });
      setEnvoi('fait');
      return;
    }
    const e = String(r?.error ?? '');
    setDit({ ok: false, texte: e === 'telephone' ? t('Votre fiche n’a pas de numéro : écrivez-nous sur WhatsApp.')
      : e === 'trop' ? t('Vous attendez déjà une place sur trois jours. Écrivez-nous sur WhatsApp pour un autre.')
      : e === 'rate_limited' ? t('Trop d’envois d’un coup. Réessayez dans quelques minutes.')
      : t('La demande n’est pas partie. Réessayez, ou écrivez-nous sur WhatsApp.') });
    setEnvoi('repos');
  };

  return (
    <div className="mc-attente">
      <div className="mc-micro-eyebrow mc-stepkicker">{t('Un jour complet ?')}</div>
      <p className="mc-attente__aide">{t('Touchez-le : si une place s’y libère, nous vous écrivons sur WhatsApp.')}</p>
      <div className="mc-attente__jours">
        {complets.map((iso) => (
          <button key={iso} type="button" className={`mc-attente__jour${jour === iso ? ' is-sel' : ''}`} aria-pressed={jour === iso} disabled={envoi === 'fait'} onClick={() => { setJour(iso); setDit(null); }}>
            {jourDit(iso)}
          </button>
        ))}
      </div>
      {jour && envoi !== 'fait' && (
        <button type="button" className="mc-attente__envoyer" disabled={envoi === 'part'} onClick={() => void envoyer()}>
          {t('Prévenez-moi si une place se libère ce jour-là')}
        </button>
      )}
      {dit && <div className={`mc-attente__dit${dit.ok ? '' : ' is-ko'}`} role={dit.ok ? 'status' : 'alert'}>{dit.texte}</div>}
    </div>
  );
}
