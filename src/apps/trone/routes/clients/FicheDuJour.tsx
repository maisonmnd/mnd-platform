import { useEffect, useRef, useState } from 'react';
import { Button } from '../../../../ds/components';
import { useStaff as useMaTete } from '../../../../shared/auth';
import { useStore } from '../../../../shared/store';
import { staffAccessStore, useStaff as useEquipe } from '../equipe/data';
import { useSaitIaMaison } from '../../../../shared/ia-maison';
import { peutDemander } from '../../../../shared/ia-maison-pur';
import { noteDeLaMaison, useAppointments, type Appointment } from '../../../../shared/agenda';
import { useBilans } from '../../../../shared/bilans';
import { useSignalements } from '../../../../shared/entre-deux';
import { souciDe } from '../../../../shared/entre-deux-pur';
import { useMessagesWa } from '../../../../shared/conversations';
import type { Client } from '../../../../shared/clients';
import type { Service } from '../../../../shared/catalog';
import { prenomSeul } from '../../../../shared/civilite';
import {
  CHANTIER_FICHE_DU_JOUR, LIGNE_PREMIERE_VENUE, aPreparer, ficheValable, heureDite, jourLocal, matiere, matiereVide,
  type MatiereDeLaFiche, type MessagePourLaFiche,
} from '../../../../shared/ia-fiche-du-jour-pur';
import { demandeLaFiche, ficheEnCours, gardeLaFiche, purgeLesFiches, useFichesDuJour } from '../../../../shared/ia-fiche-du-jour';

/* ══ « AVANT DE LA RECEVOIR » — LA FICHE DU JOUR, DANS LE RENDEZ-VOUS ════
   19 octobre 2026, chantier 7 des huit. « Trois lignes, jamais plus : où en
   sont ses locks, ce qu'il faut lui dire, ce qu'elle doit encore. Pour le
   maître et pour l'accueil. » Sa décision : « En ouvrant le rendez-vous :
   écrite à ce moment-là, gardée pour la journée. Rien ne tourne la nuit. »

   LE BLOC VIT DANS LA FICHE DU RENDEZ-VOUS (RdvModal), posé d'une ligne,
   pour un rendez-vous du jour ou à venir seulement : un rituel passé n'a
   rien à préparer. Il se remplit tout seul à l'ouverture, UNE fois : la
   fiche gardée du jour sert telle quelle, un verrou empêche de redemander
   pendant que Claude écrit, et « Refaire » reste à portée.

   CE QUE CLAUDE REND EST UNE PROPOSITION, teintée cuivre « à vérifier ».
   Rien ne s'inscrit sur la fiche cliente, rien ne part : on lit, on reçoit
   la cliente. La porte : la fonction posée (`useSaitIaMaison`) et le
   département de la personne (`peutDemander`, direction, Clientèle, Atelier). */

const etiquette: React.CSSProperties = { fontSize: 10.5, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--copper-700)' };
const pastille: React.CSSProperties = {
  fontSize: 11, padding: '2px 9px', borderRadius: 999, whiteSpace: 'nowrap',
  background: 'var(--copper-100, #F6EADF)', color: 'var(--copper-700)', border: '1px solid var(--copper-300)',
};
const cadre: React.CSSProperties = {
  border: '1px solid var(--copper-300)', borderLeft: '3px solid var(--color-copper)', borderRadius: 'var(--radius-md)',
  background: 'var(--copper-50)', padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 8,
};

export function FicheDuJour({ appt, client, byId, resteDu }: {
  appt: Appointment;
  client: Client | undefined;
  byId: Map<string, Service>;
  /** Le reste à encaisser d'un rituel passé, calculé par la fiche (apptDueXof). */
  resteDu: (a: Appointment) => number;
}) {
  /* Tous les crochets AVANT le premier retour (verifie-l-ordre-des-crochets). */
  const moi = useMaTete();
  const acces = useStore(staffAccessStore)[0][moi?.user_id ?? ''];
  const sait = useSaitIaMaison();
  const [equipe] = useEquipe();
  const [appts] = useAppointments();
  const [bilans] = useBilans();
  const signalements = useSignalements();
  const [messagesWa] = useMessagesWa();
  const [fiches] = useFichesDuJour();
  const [etat, setEtat] = useState<{ quoi: 'repos' | 'en-cours' | 'erreur'; message?: string }>({ quoi: 'repos' });
  /* Le verrou de CE bloc : on ne redemande pas pendant que Claude écrit. */
  const enCours = useRef(false);

  const aujourdhui = jourLocal(new Date());
  const peut = !!moi && peutDemander(moi.role, CHANTIER_FICHE_DU_JOUR, acces);
  const preparable = aPreparer(appt, aujourdhui);
  const gardee = fiches && typeof fiches === 'object' ? fiches[appt.id] : undefined;
  const valable = ficheValable(gardee, appt.date, aujourdhui);
  const actif = sait === true && peut && preparable && !!client;

  const prenomDuMaitre = (id?: string): string | undefined => prenomSeul(equipe.find((m) => m.id === id)?.name) || undefined;
  const prestationsDe = (a: Appointment): string[] => a.serviceIds.map((id) => byId.get(id)?.name ?? '').filter(Boolean);

  /** LA MATIÈRE, composée au moment de demander (jamais à chaque rendu : le
      carnet entier se filtre ici). Le module pur anonymise et borne. */
  const composeLaMatiere = (c: Client): MatiereDeLaFiche => {
    const siens = appts.filter((a) => a.clientId === c.id && a.id !== appt.id);
    const rituels = siens.map((a) => ({
      date: a.date, time: a.time, status: a.status, prestations: prestationsDe(a), maitre: prenomDuMaitre(a.master), note: noteDeLaMaison(a.note),
    }));
    const sesBilans = bilans.filter((b) => b.clientId === c.id).map((b) => ({
      date: b.date, prestation: b.prestation, diagnostic: b.diagnostic, sens: b.sens, solutions: b.solutions,
      points: b.points, resume: b.resume, prochaineVisite: b.prochaineVisite,
    }));
    const messages: MessagePourLaFiche[] = [
      ...signalements.filter((s) => s.clientId === c.id).map((s) => ({
        canal: 'entre-deux' as const, quand: s.quand, texte: s.texte, bien: s.bien,
        soucis: (s.soucis ?? []).map((cle) => souciDe(cle)?.dit ?? cle),
      })),
      ...messagesWa.filter((m) => m.clientId === c.id && m.sens === 'entrant' && m.texte).map((m) => ({
        canal: 'whatsapp' as const, quand: m.quand, texte: m.texte,
      })),
    ];
    const reste = siens.filter((a) => a.status === 'honoré').map((a) => ({ xof: resteDu(a), rituelDu: a.date }));
    return matiere(
      { name: c.name, since: c.since },
      rituels, sesBilans, messages, reste,
      { date: appt.date, time: appt.time, prestations: prestationsDe(appt), maitre: prenomDuMaitre(appt.master) },
    );
  };

  const prepare = async () => {
    if (!client || enCours.current) return;
    enCours.current = true;
    setEtat({ quoi: 'en-cours' });
    try {
      const m = composeLaMatiere(client);
      const le = new Date().toISOString();
      if (matiereVide(m)) {
        /* Rien à lire : la Maison l'écrit elle-même, sans dépenser un appel. */
        gardeLaFiche(appt.id, { jour: appt.date, lignes: [LIGNE_PREMIERE_VENUE], le, modele: 'maison' });
        setEtat({ quoi: 'repos' });
        return;
      }
      const r = await demandeLaFiche(appt.id, m);
      if (!r.ok) { setEtat({ quoi: 'erreur', message: r.message }); return; }
      gardeLaFiche(appt.id, { jour: appt.date, lignes: r.lignes, le: new Date().toISOString(), modele: r.modele });
      setEtat({ quoi: 'repos' });
    } finally {
      enCours.current = false;
    }
  };

  /* À L'OUVERTURE, UNE FOIS : la purge des vieilles fiches, puis la demande
     si la fiche du jour manque. Aucune minuterie, aucun réveil. */
  useEffect(() => {
    if (!actif) return;
    purgeLesFiches(aujourdhui);
    if (valable || enCours.current || ficheEnCours(appt.id)) return;
    void prepare();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actif, valable, appt.id]);

  if (!actif) return null;

  const occupe = etat.quoi === 'en-cours' || ficheEnCours(appt.id);
  const lignes = valable && gardee ? gardee.lignes : [];
  const ecriteA = valable && gardee ? heureDite(new Date(gardee.le).toTimeString().slice(0, 5)) : '';

  return (
    <div style={cadre} data-fiche-du-jour>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
        <span style={etiquette}>Avant de la recevoir</span>
        <span style={pastille}>Claude · à vérifier</span>
      </div>
      {occupe && <div className="mnd-muted" style={{ fontSize: 13 }}>Claude prépare la fiche…</div>}
      {!occupe && etat.quoi === 'erreur' && (
        <div style={{ fontSize: 13, color: 'var(--copper-700)' }}>{etat.message || 'Claude n’a pas répondu.'}</div>
      )}
      {!occupe && etat.quoi !== 'erreur' && valable && (
        lignes.length
          ? (
            <ol style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13.5, lineHeight: 1.45, color: 'var(--ink)' }}>
              {lignes.map((l, i) => <li key={i}>{l}</li>)}
            </ol>
          )
          : <div className="mnd-muted" style={{ fontSize: 13 }}>Rien à préparer.</div>
      )}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span className="mnd-muted" style={{ fontSize: 11.5 }}>
          Tiré de son historique, de ses bilans et de ses messages.{ecriteA ? ` Écrite à ${ecriteA}.` : ''}
        </span>
        <Button variant="ghost" size="sm" onClick={() => void prepare()} disabled={occupe}>Refaire</Button>
      </div>
    </div>
  );
}
