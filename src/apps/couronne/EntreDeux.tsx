import { useEffect, useMemo, useState } from 'react';
import type { Appointment } from '../../shared/agenda';
import type { Client } from '../../shared/clients';
import { t, locale } from './i18n';
import {
  SOUCIS, derniereEtProchaine, pointDuJour, proposeDAvancer, souciDe,
  type CleDeSouci, type PointDEtape, type Signalement,
} from '../../shared/entre-deux-pur';
import { BONNE_NOUVELLE, deposeLaPhoto, deposeUnSignalement, lisLesReponsesValidees, lisMesSignalements } from '../../shared/entre-deux-couronne';

/* ══ ENTRE DEUX SÉANCES, DANS MA COURONNE — 15 octobre 2026 ═════════════
   Maquette EfhgzxjA… validée. Une semaine après la séance, et une semaine
   avant la suivante, la question « Comment vont vos locks ? » ; à tout
   moment, « Un souci ? ». La cliente touche ce qui lui arrive, ajoute un mot
   ou une photo, et reçoit tout de suite la réponse VALIDÉE de la Maison (en
   Santé, jamais un conseil : on la rappelle). Ce qui part à la Maison reste
   en français ; ce qu'elle lit passe par t(). */

const aujourdhui = (): string => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const CLE_NOTIF = 'mnd_mc_point_notifie';
/** « 6 octobre 2026 » : l'année toujours (règle de la Maison), dans la langue de l'app. */
const dateLisible = (iso: string): string => {
  const d = new Date(`${iso}T12:00:00`);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString(locale(), { day: 'numeric', month: 'long', year: 'numeric' });
};

export function EntreDeux({ client, appts, onAvancer }: { client: Client; appts: Appointment[]; onAvancer: () => void }) {
  const [validees, setValidees] = useState<Partial<Record<string, string>>>({});
  const [miens, setMiens] = useState<Signalement[]>([]);
  const [ouvert, setOuvert] = useState(false);
  const [pris, setPris] = useState<CleDeSouci[]>([]);
  const [mot, setMot] = useState('');
  const [photo, setPhoto] = useState<File | null>(null);
  const [etat, setEtat] = useState<'saisie' | 'envoi' | 'envoye' | 'refus'>('saisie');
  const [recu, setRecu] = useState<string[]>([]);
  const [avancer, setAvancer] = useState(false);

  const relire = () => { void lisMesSignalements().then((l) => setMiens(l.filter((s) => s.clientId === client.id))); };
  useEffect(() => { void lisLesReponsesValidees().then(setValidees); relire(); }, [client.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const seances = useMemo(() => appts.map((a) => ({ id: a.id, date: a.date, status: a.status, master: a.master })), [appts]);
  const repondus = useMemo(() => new Set(miens.map((s) => s.point).filter(Boolean) as string[]), [miens]);
  const point: PointDEtape | undefined = pointDuJour(seances, aujourdhui(), repondus);
  const { derniere } = derniereEtProchaine(seances, aujourdhui());

  /* Une notification sur le téléphone, une seule fois par point d'étape. */
  useEffect(() => {
    if (!point) return;
    try {
      if (localStorage.getItem(CLE_NOTIF) === point.cle) return;
      if (!('Notification' in window) || Notification.permission !== 'granted') return;
      new Notification(t('Comment vont vos locks ?'), { body: t('Une touche pour le dire à votre maîtresse.') });
      localStorage.setItem(CLE_NOTIF, point.cle);
    } catch { /* sans notification, la carte suffit */ }
  }, [point?.cle]); // eslint-disable-line react-hooks/exhaustive-deps

  const envoie = async (bien: boolean) => {
    if (etat === 'envoi') return;
    if (!bien && pris.length === 0 && !mot.trim()) return;
    setEtat('envoi');
    const chemin = !bien && photo ? await deposeLaPhoto(client.id, photo) : null;
    const r = await deposeUnSignalement({
      branchId: client.branchId, clientId: client.id, soucis: bien ? [] : (pris.length ? pris : ['autre']), texte: bien ? undefined : mot,
      ...(chemin ? { photo: chemin } : {}), ...(point ? { point: point.cle } : {}), bien,
      ...(derniere ? { apptId: derniere.id, ...(derniere.master ? { maitre: derniere.master } : {}) } : {}),
      validees,
    });
    if (!r) { setEtat('refus'); return; }
    setRecu(bien ? [t(BONNE_NOUVELLE)] : r.reponse);
    setAvancer(!bien && proposeDAvancer(pris));
    setEtat('envoye'); setOuvert(false); setPris([]); setMot(''); setPhoto(null);
    relire();
  };
  const bascule = (c: CleDeSouci) => setPris((x) => (x.includes(c) ? x.filter((y) => y !== c) : [...x, c]));

  return (
    <div className="mc-ed">
      {etat === 'envoye' ? (
        <div className="mc-ed-carte">
          <div className="mc-micro-eyebrow">{t('Votre maîtresse l’a reçu')}</div>
          {recu.map((p) => <p key={p} className="mc-ed-texte">{t(p)}</p>)}
          {avancer && <button type="button" className="mc-cta mc-cta--copper" onClick={onAvancer}>{t('Avancer mon rendez-vous')}</button>}
          <button type="button" className="mc-cta mc-cta--outline" onClick={() => setEtat('saisie')}>{t('Fermer')}</button>
        </div>
      ) : ouvert ? (
        <div className="mc-ed-carte">
          <div className="mc-micro-eyebrow">{t('Comment vont vos locks ?')}</div>
          <p className="mc-ed-doux">{t('Touchez ce qui vous arrive. Vous pouvez en choisir plusieurs.')}</p>
          <div className="mc-ed-puces" role="group" aria-label={t('Ce qui vous arrive')}>
            {SOUCIS.map((s) => (
              <button key={s.cle} type="button" className={`mc-ed-puce${pris.includes(s.cle) ? ' est-prise' : ''}`} aria-pressed={pris.includes(s.cle)} onClick={() => bascule(s.cle)}>{t(s.dit)}</button>
            ))}
          </div>
          <label className="mc-ed-champ"><span>{t('Un mot, si vous voulez')}</span>
            <textarea id="mc-ed-mot" rows={3} value={mot} onChange={(e) => setMot(e.target.value)} />
          </label>
          <label className="mc-ed-champ"><span>{t('Une photo, si vous voulez')}</span>
            <input id="mc-ed-photo" type="file" accept="image/*" onChange={(e) => setPhoto(e.target.files?.[0] ?? null)} />
          </label>
          {etat === 'refus' && <p className="mc-ed-erreur" role="alert">{t('Votre message n’est pas parti. Réessayez dans un moment.')}</p>}
          <button type="button" className="mc-cta mc-cta--copper" disabled={etat === 'envoi' || (pris.length === 0 && !mot.trim())} onClick={() => void envoie(false)}>
            {etat === 'envoi' ? t('Envoi en cours') : t('Envoyer à ma maîtresse')}
          </button>
          <button type="button" className="mc-cta mc-cta--outline" onClick={() => setOuvert(false)}>{t('Plus tard')}</button>
        </div>
      ) : point ? (
        <div className="mc-ed-carte">
          <div className="mc-micro-eyebrow">{point.type === 'apres'
            ? t('Depuis votre séance du {date}', { date: dateLisible(point.seance) })
            : t('Avant votre séance du {date}', { date: dateLisible(point.seance) })}</div>
          <p className="mc-ed-titre">{t('Comment vont vos locks ?')}</p>
          <div className="mc-ed-deux">
            <button type="button" className="mc-cta mc-cta--outline" disabled={etat === 'envoi'} onClick={() => void envoie(true)}>{t('Tout va bien')}</button>
            <button type="button" className="mc-cta mc-cta--copper" onClick={() => setOuvert(true)}>{t('J’ai un souci')}</button>
          </div>
        </div>
      ) : (
        <button type="button" className="mc-ed-lien" onClick={() => setOuvert(true)}>{t('Un souci avec vos locks ? Dites-le à votre maîtresse.')}</button>
      )}

      {miens.filter((s) => !s.bien).length > 0 && (
        <div className="mc-ed-histoire">
          <div className="mc-sectionlabel" style={{ margin: '18px 0 8px' }}>{t('Ce que vous nous avez dit')}</div>
          {miens.filter((s) => !s.bien).slice(0, 5).map((s) => (
            <div key={s.id} className="mc-ed-ligne">
              <span className="mc-ed-date">{dateLisible(s.quand.slice(0, 10))}</span>
              <span>{s.soucis.map((c) => t(souciDe(c)?.dit ?? c)).join(', ')}</span>
              <span className={`mc-ed-etat${s.etat === 'traite' ? ' est-traite' : ''}`}>{s.etat === 'traite' ? t('La Maison vous a répondu') : t('Votre maîtresse vous répond')}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
