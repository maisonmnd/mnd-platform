/* ══ LES MODÈLES META — 5 novembre 2026 ═══════════════════════════════════
   « Je ne vois pas les listes des modèles Meta : combien de fois chaque
   modèle a été utilisé… », puis « est-ce possible de mettre des modèles en
   pause et que ça marche également sur Meta ? » (Yéman, 4 novembre 2026).
   Maquette « Ce qui va partir » (v3), deuxième onglet.

   CHAQUE MODÈLE : combien de fois il est parti, ce mois-ci, lus, non remis,
   le dernier envoi (lu du fil, `messages_wa`) ; les approuvés jamais partis,
   à zéro ; son état chez Meta (lu par la fonction `modeles-meta`, le jeton
   ne quitte jamais le serveur) ; et l'interrupteur « En service / En pause »
   (la direction seule) que la porte d'Opale fait respecter partout. Meta ne
   permet pas à une entreprise de mettre elle-même un modèle en pause : la
   pause vit chez nous ; quand Meta en a mis un en pause, « Reprendre chez
   Meta » le relance. Opale signale un modèle au deuxième « non remis » de
   suite et le met en pause au cinquième. */

import { useEffect, useMemo, useState } from 'react';
import { useAuth, useMaTete } from '../../../../shared/auth';
import { useMessagesWa } from '../../../../shared/conversations';
import { supabase } from '../../../../shared/supabase';
import { basculeLeModele, usePauses } from '../../../../shared/arrets-d-avance';
import { REGISTRE_DES_MODELES } from '../../../../shared/porte-des-modeles-pur';
import { NON_REMIS_EN_PAUSE_AU, NON_REMIS_SIGNALE_AU } from '../../../../shared/arret-d-avance-pur';
import {
  MODELES_CONNUS, QUALITE_DITE, chiffresDesModeles, etatMetaDit, jourDeCotonou, modeleDit, repriseChezMetaPossible,
} from '../../../../shared/ce-qui-va-partir-pur';
import { jourDit } from '../../../../shared/gerard-pur';
import { useEstDirection } from '../_vie';

type ModeleChezMeta = { id: string; nom: string; etat: string; categorie?: string; qualite?: string; motifDuRefus?: string };
type LectureMeta = { lusLe?: string; modeles: ModeleChezMeta[]; erreur?: string };

const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

/** L'ÉTAT CHEZ META : la fonction serveur d'abord ; si elle se tait, la dernière lecture gardée. */
function useEtatChezMeta(): { lecture: LectureMeta | null; relis: () => void; enCours: boolean } {
  const [lecture, setLecture] = useState<LectureMeta | null>(null);
  const [enCours, setEnCours] = useState(false);
  const [tour, setTour] = useState(0);
  useEffect(() => {
    const sb = supabase;
    if (!sb) return undefined;
    let vivant = true;
    setEnCours(true);
    void (async () => {
      try {
        const { data, error } = await sb.functions.invoke('modeles-meta', { body: { geste: 'lire' } });
        const rep = (data ?? {}) as LectureMeta;
        if (!error && Array.isArray(rep.modeles) && rep.modeles.length > 0) { if (vivant) setLecture(rep); return; }
        const { data: doc } = await sb.from('documents').select('data').eq('key', 'mnd_modeles_meta').maybeSingle();
        const garde = (doc?.data ?? null) as LectureMeta | null;
        if (vivant) setLecture(garde && Array.isArray(garde.modeles) ? { ...garde, erreur: rep.erreur ?? (error ? 'la fonction modeles-meta ne répond pas' : undefined) } : { modeles: [], erreur: rep.erreur ?? 'la fonction modeles-meta ne répond pas' });
      } finally {
        if (vivant) setEnCours(false);
      }
    })();
    return () => { vivant = false; };
  }, [tour]);
  return { lecture, relis: () => setTour((n) => n + 1), enCours };
}

export function ModelesMeta() {
  const { session } = useAuth();
  const { tete } = useMaTete();
  const direction = useEstDirection();
  const [messages] = useMessagesWa();
  const [pauses] = usePauses();
  const { lecture, relis, enCours } = useEtatChezMeta();
  const [mot, setMot] = useState('');
  const maintenantMs = Date.now();
  const qui = ((tete as { name?: string } | null)?.name ?? '').trim().split(/\s+/)[0]
    || (session?.user?.email ?? '').split('@')[0] || 'la direction';

  const chezMeta = useMemo(() => new Map((lecture?.modeles ?? []).map((m) => [m.nom, m])), [lecture]);
  /* Les approuvés jamais partis paraissent à zéro : ceux de Meta quand on les lit, sinon ceux que le code connaît. */
  const connus = useMemo(() => {
    const deMeta = (lecture?.modeles ?? []).filter((m) => m.etat === 'APPROVED' || m.etat === 'PAUSED').map((m) => m.nom);
    if (deMeta.length) return deMeta;
    return [...new Set(REGISTRE_DES_MODELES.flatMap((e) => e.modeles))];
  }, [lecture]);
  const lignes = useMemo(() => chiffresDesModeles(messages as never, maintenantMs, connus),
  // eslint-disable-next-line react-hooks/exhaustive-deps
    [messages, connus]);
  const pauseDe = useMemo(() => new Map(pauses.filter((p) => p.enPause === true).map((p) => [p.modele, p])), [pauses]);
  const moisDit = MOIS[Number(jourDeCotonou(maintenantMs).slice(5, 7)) - 1] ?? 'ce mois';
  const signales = lignes.filter((l) => l.veille !== 'rien');
  const jamais = lignes.filter((l) => l.envoyes === 0);

  const reprendsChezMeta = async (m: ModeleChezMeta) => {
    if (!supabase) return;
    setMot('');
    const { data, error } = await supabase.functions.invoke('modeles-meta', { body: { geste: 'reprendre', id: m.id } });
    const rep = (data ?? {}) as { repris?: boolean; motif?: string };
    setMot(error || !rep.repris ? `Meta n’a pas repris ${m.nom}${rep.motif ? ` : ${rep.motif}` : ''}.` : `${m.nom} : Meta l’a repris.`);
    relis();
  };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap', marginBottom: 8 }}>
        <span style={{ fontFamily: 'var(--font-serif)', fontSize: 21, color: 'var(--color-indigo)' }}>Chaque modèle, combien de fois</span>
        <span className="mnd-muted" style={{ fontSize: 12.5 }}>
          Lu du fil : chaque message parti sur WhatsApp avec un modèle Meta, et ce que Meta en a dit. Les notifications et les SMS n’y sont pas.
        </span>
        <button type="button" className="trc-chip" style={{ marginLeft: 'auto' }} disabled={enCours} onClick={relis}>
          {enCours ? 'Lecture chez Meta…' : 'Relire chez Meta'}
        </button>
      </div>
      {lecture?.erreur && <p className="mnd-muted" style={{ fontSize: 12.5, margin: '0 0 8px' }}>État chez Meta : {lecture.erreur}.</p>}
      {lecture?.lusLe && !lecture.erreur && (
        <p className="mnd-muted" style={{ fontSize: 12.5, margin: '0 0 8px' }}>État chez Meta lu le {jourDit(jourDeCotonou(Date.parse(lecture.lusLe)))}.</p>
      )}
      {mot && <p style={{ fontSize: 12.5, color: 'var(--copper-700)', margin: '0 0 8px' }}>{mot}</p>}

      <div className="trc-modeles">
        <table>
          <thead>
            <tr>
              <th>Modèle</th><th>À quoi il sert</th><th className="num">Envoyés</th><th className="num">En {moisDit}</th>
              <th className="num">Lus</th><th className="num">Non remis</th><th>Dernier envoi</th><th>Chez Meta</th><th>Chez nous</th>
            </tr>
          </thead>
          <tbody>
            {lignes.map((l) => {
              const meta = chezMeta.get(l.modele);
              const pause = pauseDe.get(l.modele);
              const alerte = l.veille !== 'rien' || (l.envoyes >= NON_REMIS_EN_PAUSE_AU && l.nonRemis === l.envoyes);
              return (
                <tr key={l.modele} className={alerte ? 'trc-modeles--alerte' : undefined} data-modele={l.modele}>
                  <td><code>{l.modele}</code><span className="mnd-muted" style={{ display: 'block', fontSize: 11.5 }}>{modeleDit(l.modele)}</span></td>
                  <td>{MODELES_CONNUS[l.modele]?.sert ?? ''}</td>
                  <td className="num">{l.envoyes}</td>
                  <td className="num">{l.ceMois}</td>
                  <td className="num">{l.lus}</td>
                  <td className="num trc-modeles__nonremis">{l.nonRemis}</td>
                  <td>{l.dernier ? jourDit(jourDeCotonou(Date.parse(l.dernier))) : 'jamais'}</td>
                  <td>
                    {meta ? `${etatMetaDit(meta.etat)}${meta.qualite ? `, qualité ${QUALITE_DITE[meta.qualite] ?? meta.qualite}` : ''}` : <span className="mnd-muted">non lu</span>}
                    {meta?.motifDuRefus && <span className="mnd-muted" style={{ display: 'block', fontSize: 11.5 }}>{meta.motifDuRefus}</span>}
                    {meta && direction && repriseChezMetaPossible(meta.etat) && (
                      <button type="button" className="trc-chip" style={{ display: 'block', marginTop: 4 }} onClick={() => void reprendsChezMeta(meta)}>Reprendre chez Meta</button>
                    )}
                  </td>
                  <td>
                    {direction ? (
                      <button
                        type="button" className="trc-modeles__bascule" aria-pressed={!!pause}
                        onClick={() => basculeLeModele({ modele: l.modele, enPause: !pause, par: qui })}
                      >
                        {pause ? 'En pause' : 'En service'}
                      </button>
                    ) : (pause ? 'En pause' : 'En service')}
                    {pause && (
                      <span className="mnd-muted" style={{ display: 'block', fontSize: 11.5 }}>
                        {pause.parOpale ? `Opale, ${pause.motif ?? ''}` : `par ${pause.par ?? 'la direction'}`}
                      </span>
                    )}
                    {!pause && l.veille === 'signale' && (
                      <span style={{ display: 'block', fontSize: 11.5, color: 'var(--color-brique, #96412E)' }}>Opale : {l.serie} non remis de suite</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div style={{ display: 'grid', gap: 6, marginTop: 12, fontSize: 12.5, lineHeight: 1.6 }} className="mnd-muted">
        {signales.length > 0 && (
          <p style={{ margin: 0 }}>
            Opale signale {signales.map((l) => `${l.modele} (${l.serie} non remis de suite)`).join(', ')} : un modèle est signalé au {NON_REMIS_SIGNALE_AU}e « non remis » de suite et mis en pause au {NON_REMIS_EN_PAUSE_AU}e.
          </p>
        )}
        {jamais.length > 0 && <p style={{ margin: 0 }}>Approuvés, jamais encore partis : {jamais.map((l) => l.modele).join(', ')}.</p>}
        <p style={{ margin: 0 }}>
          En pause chez nous, plus rien ne part avec ce modèle, d’aucune porte : la porte d’Opale le refuse ; la confirmation à liens part alors sous l’ancien modèle.
          Meta ne permet pas à une entreprise de mettre elle-même un modèle en pause : seul Meta le fait, quand la qualité baisse ; « Reprendre chez Meta » le relance.
        </p>
      </div>
    </div>
  );
}
