import { useEffect, useState } from 'react';
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
import { estFilPrive, useFilsPrives, useMessagesWa } from '../../../../shared/conversations';
import type { Client } from '../../../../shared/clients';
import type { Service } from '../../../../shared/catalog';
import { prenomSeul } from '../../../../shared/civilite';
import {
  CHANTIER_FICHE_DU_JOUR, aPreparer, aujourdhuiACotonou, ficheValable, heureDeLInstant, lignesGardees, matiere,
  type FicheGardee, type MatiereDeLaFiche, type MessagePourLaFiche,
} from '../../../../shared/ia-fiche-du-jour-pur';
import { prepareLaFiche, purgeLesFiches, useFichesDuJour } from '../../../../shared/ia-fiche-du-jour';

/* ══ « AVANT DE LA RECEVOIR » — LA FICHE DU JOUR, DANS LE RENDEZ-VOUS ════
   19 octobre 2026, chantier 7 des huit. « Trois lignes, jamais plus : où en
   sont ses locks, ce qu'il faut lui dire, ce qu'elle doit encore. Pour le
   maître et pour l'accueil. » Sa décision : « En ouvrant le rendez-vous :
   écrite à ce moment-là, gardée pour la journée. Rien ne tourne la nuit. »

   LE BLOC VIT DANS LA FICHE DU RENDEZ-VOUS (RdvModal), posé d'une ligne,
   pour un rendez-vous du jour ou à venir seulement : un rituel passé n'a
   rien à préparer. Il se remplit tout seul à l'ouverture, UNE fois : la
   fiche gardée du jour sert telle quelle, le verrou du magasin
   (`prepareLaFiche`) empêche de redemander, et « Refaire » reste à portée.

   CE QUE CLAUDE REND EST UNE PROPOSITION, teintée cuivre « à vérifier ».
   Rien ne s'inscrit sur la fiche cliente, rien ne part : on lit, on reçoit
   la cliente. La porte : la fonction posée (`useSaitIaMaison`) et le
   département de la personne (`peutDemander`, direction, Clientèle, Atelier).

   UN FIL MARQUÉ PRIVÉ NE SE LIT PAS (reprise du 19 octobre 2026). Le
   drapeau ferme l'écran des Conversations sur ce poste ; la fiche, elle,
   voyage vers tous les postes. Un message d'un fil privé n'entre donc pas
   dans la matière : il ne se retrouverait pas, résumé, sous les yeux de
   l'Atelier. */

const etiquette: React.CSSProperties = { fontSize: 10.5, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--copper-700)' };
const pastille: React.CSSProperties = {
  fontSize: 11, padding: '2px 9px', borderRadius: 999, whiteSpace: 'nowrap',
  background: 'var(--copper-100, #F6EADF)', color: 'var(--copper-700)', border: '1px solid var(--copper-300)',
};
const cadre: React.CSSProperties = {
  border: '1px solid var(--copper-300)', borderLeft: '3px solid var(--color-copper)', borderRadius: 'var(--radius-md)',
  background: 'var(--copper-50)', padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 8,
};

type Etat =
  | { quoi: 'repos' }
  | { quoi: 'en-cours' }
  /* `pour` : le rendez-vous lu. La fiche du rendez-vous peut passer d'un
     rendez-vous à l'autre sans se refermer ; une réponse ne se montre que
     sous le sien. */
  | { quoi: 'lue'; pour: string; fiche: FicheGardee }
  | { quoi: 'erreur'; pour: string; message: string };

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
  const [prives] = useFilsPrives();
  const [fiches] = useFichesDuJour();
  const [etat, setEtat] = useState<Etat>({ quoi: 'repos' });

  const aujourdhui = aujourdhuiACotonou();
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
      points: b.points, prochaineVisite: b.prochaineVisite,
    }));
    const messages: MessagePourLaFiche[] = [
      ...signalements.filter((s) => s.clientId === c.id).map((s) => ({
        canal: 'entre-deux' as const, quand: s.quand, texte: s.texte, bien: s.bien,
        soucis: (s.soucis ?? []).map((cle) => souciDe(cle)?.dit ?? cle),
      })),
      ...messagesWa.filter((m) => m.clientId === c.id && m.sens === 'entrant' && m.texte && !estFilPrive(m.numero, prives)).map((m) => ({
        canal: m.canal === 'site' ? 'site' as const : 'whatsapp' as const, quand: m.quand, texte: m.texte,
      })),
    ];
    const reste = siens.filter((a) => a.status === 'honoré').map((a) => ({ xof: resteDu(a), rituelDu: a.date }));
    return matiere(
      { name: c.name, since: c.since },
      rituels, sesBilans, messages, reste,
      { date: appt.date, time: appt.time, prestations: prestationsDe(appt), maitre: prenomDuMaitre(appt.master) },
    );
  };

  /** Le seul chemin vers Claude : le magasin tient le verrou. */
  const prepare = (quand: 'ouverture' | 'refaire') => {
    if (!client) return;
    const c = client;
    setEtat({ quoi: 'en-cours' });
    void prepareLaFiche(appt.id, appt.date, () => composeLaMatiere(c), quand).then((r) => {
      setEtat(r.ok ? { quoi: 'lue', pour: appt.id, fiche: r.fiche } : { quoi: 'erreur', pour: appt.id, message: r.message });
    });
  };

  /* À L'OUVERTURE, UNE FOIS : la purge des vieilles fiches, puis la fiche du
     jour si elle manque. Aucune minuterie, aucun réveil. */
  useEffect(() => {
    if (!actif) return;
    purgeLesFiches(aujourdhui);
    if (valable) return;
    prepare('ouverture');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actif, valable, appt.id]);

  if (!actif) return null;

  const occupe = etat.quoi === 'en-cours';
  /* La fiche gardée fait foi ; sinon la dernière réponse lue par ce bloc. */
  const fiche = valable ? gardee : etat.quoi === 'lue' && etat.pour === appt.id && ficheValable(etat.fiche, appt.date, aujourdhui) ? etat.fiche : undefined;
  const lignes = lignesGardees(fiche);
  const ecriteA = fiche ? heureDeLInstant(fiche.le) : '';

  return (
    <div style={cadre} data-fiche-du-jour>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
        <span style={etiquette}>Avant de la recevoir</span>
        <span style={pastille}>Claude · à vérifier</span>
      </div>
      {occupe && <div className="mnd-muted" style={{ fontSize: 13 }}>Claude prépare la fiche…</div>}
      {!occupe && etat.quoi === 'erreur' && etat.pour === appt.id && (
        <div style={{ fontSize: 13, color: 'var(--copper-700)' }}>{etat.message || 'Claude n’a pas répondu.'}</div>
      )}
      {!occupe && fiche && (
        lignes.length
          ? (
            <ol style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13.5, lineHeight: 1.45, color: 'var(--ink)' }}>
              {lignes.map((l, i) => <li key={i}>{l}</li>)}
            </ol>
          )
          : <div className="mnd-muted" style={{ fontSize: 13 }}>Rien de sûr à en dire. « Refaire » pour une autre lecture.</div>
      )}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span className="mnd-muted" style={{ fontSize: 11.5 }}>
          Tiré de son historique, de ses bilans et de ses messages.{ecriteA ? ` Écrite à ${ecriteA}.` : ''}
        </span>
        <Button variant="ghost" size="sm" onClick={() => prepare('refaire')} disabled={occupe}>Refaire</Button>
      </div>
    </div>
  );
}
