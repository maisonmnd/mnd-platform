import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Appointment } from '../../../../shared/agenda';
import type { PieceEnvoyee } from '../../../../shared/avant-le-fauteuil-pur';
import { cheminDeLaConversation } from '../../../../shared/conversations';
import { adresseDeLaPiece, nomDuGenre, origineDite } from '../../../../shared/pieces-des-clientes';
import { frJourAn } from './_shared';
import { useLecteurAvantLeFauteuil } from './avant-le-fauteuil-lecture';

/* ══ AVANT LE FAUTEUIL, L'ÉCRAN · 31 octobre 2026 ════════════════════════
   « N'oublie pas de me faire un résumé de ce que je dois savoir avant un RDV
   d'un client. Credo vient le 13 novembre, il faut que je me souvienne de
   relire notre conversation. » (Yéman, 31 octobre 2026). Maquette
   Jx3pJY3ZkzWkr9a9RXUFf3, validée au sélecteur le même jour.

   Sous chaque rendez-vous à venir du Carnet, et dans Parcours (choix 1), une
   ligne cuivre repliée qui tient en cinq lignes (Elle a dit · Son compte ·
   Dernière note · Attention · À préparer), puis ce qu'elle a envoyé, puis
   deux gestes : Relire le fil, Sa fiche. Rien n'est envoyé à personne.

   CE COMPOSANT NE LIT AUCUN MAGASIN ET NE JUGE RIEN (tranché le 31 octobre
   2026). Le juge est `avantLeFauteuil`, pur ; sa seule prise sur le Trône est
   `useLecteurAvantLeFauteuil` (avant-le-fauteuil-lecture.ts), la même que la
   notification du soir et du matin. L'écran lisait d'abord les magasins
   lui-même, avec d'autres lectures que la notification : le téléphone
   pouvait dire « doit 8 000 F » et le Carnet autre chose. Il appelle
   désormais `lis(appt)` et ne garde que le rendu.

   LE TRÔNE NE DEVINE RIEN DE SON WHATSAPP PERSONNEL (choix 3) : ce que
   Yéman y a lu, Opale le pose en Note du carnet, et c'est cette note que la
   ligne « Elle a dit » relit en premier. */

type Props = { appt: Appointment };

/** D'où vient le rendez-vous, pour la ligne « Elle a dit » quand elle est vide. */
const sourceDite = (source: Appointment['source']): string =>
  source === 'couronne' ? ' Le rendez-vous vient de Ma Couronne.'
    : source === 'site' ? ' Le rendez-vous vient du site.'
      : source === 'whatsapp' ? ' Le rendez-vous vient de WhatsApp.'
        : source === 'consultation' ? ' Le rendez-vous vient de la consultation.'
          : '';

export function AvantLeFauteuil({ appt }: Props) {
  const navigate = useNavigate();
  const { aujourdhui: today, lis } = useLecteurAvantLeFauteuil();
  const { briefing: b, cliente, entree } = useMemo(() => lis(appt), [lis, appt]);

  /* REPLIÉ PAR DÉFAUT ; ouvert d'office le jour même quand il y a quelque
     chose à relire. Il s'ouvre seul, ne se referme jamais seul. */
  const ouvertDOffice = b.aRelire && appt.date === today;
  const [ouvert, setOuvert] = useState(ouvertDOffice);
  useEffect(() => { if (ouvertDOffice) setOuvert(true); }, [ouvertDOffice]);

  /* LES ADRESSES SIGNÉES DU COFFRE, demandées une fois, seulement quand le
     bloc est ouvert : un Carnet de cinquante rendez-vous ne signe pas
     cinquante adresses pour des blocs que personne n'ouvre. */
  const [adresses, setAdresses] = useState<Record<string, string>>({});
  const demandees = useRef(new Set<string>());
  useEffect(() => {
    if (!ouvert) return;
    const aDemander = b.pieces.filter((p) => p.chemin && !demandees.current.has(p.id));
    if (aDemander.length === 0) return;
    for (const p of aDemander) demandees.current.add(p.id);
    let vivant = true;
    void Promise.all(aDemander.map(async (p) => [p.id, await adresseDeLaPiece(p.chemin ?? '')] as const)).then((paires) => {
      if (!vivant) return;
      setAdresses((prev) => {
        const suite = { ...prev };
        for (const [id, u] of paires) if (u) suite[id] = u;
        return suite;
      });
    });
    return () => { vivant = false; };
  }, [ouvert, b.pieces]);

  /* « Elle a dit » vide, et le dit (choix 4) : la dernière venue se relit
     dans ce que le lecteur a tendu au juge, pas dans un magasin. */
  const derniereVenue = useMemo(() => entree.sesRdv
    .filter((a) => a.id !== entree.rdv.id && a.status === 'honoré' && a.date < entree.rdv.date)
    .sort((x, y) => y.date.localeCompare(x.date))[0], [entree.sesRdv, entree.rdv]);
  const rienDit = derniereVenue
    ? `Rien depuis le ${frJourAn(derniereVenue.date)}.${sourceDite(appt.source)}`
    : `Rien sur WhatsApp ni dans les Conversations.${sourceDite(appt.source)}`;

  const chemin = cheminDeLaConversation(cliente?.phone || cliente?.phone2);
  const n = b.pieces.length;

  return (
    /* Le bloc vit sous la rangée du Carnet, qui s'ouvre d'un clic : rien d'ici
       ne doit remonter jusqu'à elle. */
    <div className="trc-avant-rangee" onClick={(e) => e.stopPropagation()}>
      <details className="trc-avant" open={ouvert} onToggle={(e) => setOuvert(e.currentTarget.open)}>
        <summary>
          <span className="trc-avant__titre">Avant le fauteuil</span>
          <span className="trc-avant__n">{b.resume}</span>
        </summary>
        <dl className="trc-avant__dl">
          <dt>Elle a dit</dt>
          {b.elleADit.length === 0 ? (
            <dd className="est-vide">{rienDit}</dd>
          ) : (
            <dd>
              {b.elleADit.map((d, i) => (
                <span key={`${d.source}-${d.quand}-${i}`}>
                  {d.source === 'note'
                    ? <><span className="trc-avant__lu">Note du carnet</span>« {d.texte} »</>
                    : <>{frJourAn(d.quand)} dans les Conversations : « {d.texte} »</>}
                </span>
              ))}
            </dd>
          )}
          <dt>Son compte</dt>
          <dd>{b.compte.phrase}</dd>
          <dt>Dernière note</dt>
          {b.derniereNote
            ? <dd>{frJourAn(b.derniereNote.date)} : « {b.derniereNote.texte} »</dd>
            : <dd className="est-vide">Aucune note sur ses passages.</dd>}
          <dt>Attention</dt>
          {b.attention.length === 0
            ? <dd className="est-vide">Rien à signaler.</dd>
            : <dd className="est-attention">{b.attention.map((t) => <span key={t}>{t}</span>)}</dd>}
          <dt>À préparer</dt>
          <dd>{b.aPreparer.join(' ')}</dd>
        </dl>
        {n > 0 && (
          <div className="trc-avant__pieces">
            <p className="trc-avant__t">Ce qu’elle a envoyé · {n} {n > 1 ? 'pièces' : 'pièce'}</p>
            <div className="trc-avant__grille">
              {b.pieces.map((p) => <Piece key={p.id} p={p} adresse={adresses[p.id]} />)}
            </div>
          </div>
        )}
        <div className="trc-avant__gestes">
          <button
            type="button"
            className="trc-avant__geste est-plein"
            disabled={!chemin}
            title={chemin ? 'Sa conversation dans le Trône' : 'Sans numéro, pas de fil à relire'}
            onClick={() => { if (chemin) navigate(chemin); }}
          >
            Relire le fil
          </button>
          {appt.clientId && (
            <button type="button" className="trc-avant__geste" onClick={() => navigate(`/customers?id=${appt.clientId}`)}>
              Sa fiche
            </button>
          )}
        </div>
      </details>
    </div>
  );
}

/* ── UNE PIÈCE, EN VIGNETTE ──────────────────────────────────────────────
   Un lien s'ouvre dans un nouvel onglet avec son titre ; une photo se montre
   par son adresse signée ; une vidéo porte son icône et s'ouvre de même.
   Aucune image générée : seulement du SVG dessiné. */
function Piece({ p, adresse }: { p: PieceEnvoyee; adresse?: string }) {
  const href = p.kind === 'lien' ? p.url : adresse;
  const legende = `${nomDuGenre(p.kind)} · ${origineDite(p.origine)} · ${frJourAn(p.quand)}`;
  return (
    <a
      className="trc-avant__piece"
      href={href || undefined}
      target="_blank"
      rel="noopener noreferrer"
      title={href ? p.titre : `${p.titre} (adresse en attente)`}
      aria-disabled={!href}
      onClick={(e) => { if (!href) e.preventDefault(); }}
    >
      <span className={`trc-avant__vignette est-${p.kind}`} aria-label={`${nomDuGenre(p.kind)} : ${p.titre}`}>
        {p.kind === 'photo' && adresse ? (
          <img src={adresse} alt="" loading="lazy" />
        ) : p.kind === 'video' ? (
          <svg viewBox="0 0 30 30" aria-hidden="true"><circle cx="15" cy="15" r="14" fill="#F2EEE6" opacity=".92" /><path d="M12 9.5v11l9-5.5z" fill="#1E2150" /></svg>
        ) : p.kind === 'photo' ? (
          <svg viewBox="0 0 30 30" aria-hidden="true"><rect x="5" y="7" width="20" height="16" rx="2" fill="#F2EEE6" opacity=".95" /><circle cx="11" cy="12.5" r="2.2" fill="#8C5A33" /><path d="M7 21l6-6 4 4 3-3 3 5z" fill="#8C5A33" /></svg>
        ) : (
          <svg viewBox="0 0 30 30" aria-hidden="true" fill="none" stroke="#1E2150" strokeWidth="2.2" strokeLinecap="round">
            <path d="M12.5 17.5l5-5" />
            <path d="M14 10.5l2-2a4 4 0 0 1 5.6 5.6l-2 2" />
            <path d="M16 19.5l-2 2a4 4 0 0 1-5.6-5.6l2-2" />
          </svg>
        )}
      </span>
      <span className="trc-avant__legende">
        {p.titre}
        <small>{legende}</small>
      </span>
    </a>
  );
}
