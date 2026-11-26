import { useState } from 'react';
import { clientsStore, type Client } from '../../../../shared/clients';
import { momentDuSalon } from '../../../../shared/calendrier';
import { QUESTION_DE_L_ACCORD } from '../../../../shared/accord-whatsapp-pur';
import {
  accordAPoser, correctionDeLAccord, estUneTeteDEnfant, jourCourtDeLAccord, laQuestionSePose, reponseDite, type AccordPose,
} from '../../../../shared/accord-des-nouvelles-pur';
import './clients.css';

/* ══ L'ACCORD DES NOUVELLES, AU COMPTOIR — 26 novembre 2026 ══════════════
   L'audit du Trône (B1, « construis » de Yéman) : sans « oui » noté, aucune
   campagne WhatsApp ne part, ni les relances de Perle, ni les parcours ; et
   une poignée de fiches seulement avait répondu. Pendant la visite, là où
   l'équipe a la cliente devant elle, une ligne le dit tant que la fiche n'a
   pas répondu : « Nouvelles de la Maison : pas encore demandé », « Oui »,
   « Non ». Elle se pose dans la fiche du rendez-vous DU JOUR (jamais un
   rendez-vous passé, à venir ou annulé : on ne coche pas sans demander) et
   au « C'est réglé » de l'encaissement. Un toucher écrit la réponse, source
   `comptoir`, au jour du salon (Cotonou, jamais l'horloge du poste), puis la
   ligne disparaît. Jamais pour un enfant ni une fiche archivée, jamais
   par-dessus une réponse : la règle est shared/accord-des-nouvelles-pur.

   LA FICHE CLIENTE est le seul endroit où la réponse se lit et se corrige
   (`AccordSurLaFiche`) : oui ou non, le jour, d'où elle vient (comptoir,
   page « Régler », Ma Couronne, WhatsApp, STOP). Réinscrire une fiche qui a
   répondu STOP demande un second toucher. */

/** Écrit la réponse sur la fiche relue dans le magasin à l'instant du geste
    (jamais sur une copie tenue en main). Rien quand la règle refuse. */
function ecrisLAccord(clientId: string, choisir: (f: Client) => AccordPose | null): AccordPose | null {
  const f = clientsStore.get().find((c) => c.id === clientId);
  if (!f) return null;
  const accord = choisir(f);
  if (!accord) return null;
  clientsStore.set((prev) => prev.map((c) => (c.id === clientId ? { ...c, nouvelles: accord } : c)));
  return accord;
}

const ligne: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', fontSize: 12.5, color: 'var(--ink-soft)' };
const nom: React.CSSProperties = { fontWeight: 500, color: 'var(--color-indigo)' };
const AIDE = `À lui demander : « ${QUESTION_DE_L_ACCORD} » Les rappels et les confirmations partent dans tous les cas.`;

/** LA LIGNE DU COMPTOIR. `rdv` : la ligne ne paraît que pour un rendez-vous
    du jour, pas annulé ; sans `rdv` (le « C'est réglé »), elle
    paraît dès que la fiche n'a pas répondu. */
export function AccordAuComptoir({ client, rdv }: { client: Client | null | undefined; rdv?: { date: string; status?: string } | null }) {
  /* Le « noté » suit SA fiche : la fiche du rendez-vous peut passer à une autre sans se refermer. */
  const [note, setNote] = useState<{ id: string; oui: boolean } | null>(null);
  const jour = momentDuSalon().jour;
  if (note && client && note.id === client.id) {
    return <div style={ligne} aria-live="polite"><span><span style={nom}>Nouvelles de la Maison</span> : {note.oui ? 'oui' : 'non'}, noté.</span></div>;
  }
  if (!client || !laQuestionSePose(client, jour)) return null;
  if (rdv && (String(rdv.date).slice(0, 10) !== jour || rdv.status === 'annulé')) return null;
  const reponds = (oui: boolean) => {
    const pose = ecrisLAccord(client.id, (f) => accordAPoser(f, oui, momentDuSalon().jour, 'comptoir'));
    if (pose) setNote({ id: client.id, oui: pose.oui });
  };
  return (
    <div style={ligne} role="group" aria-label="Nouvelles de la Maison" title={AIDE} data-accord="comptoir">
      <span><span style={nom}>Nouvelles de la Maison</span> : pas encore demandé</span>
      <button type="button" className="trc-chip" onClick={() => reponds(true)}>Oui</button>
      <button type="button" className="trc-chip" onClick={() => reponds(false)}>Non</button>
    </div>
  );
}

/** LA FICHE CLIENTE : la réponse, dite sans supposer la civilité, et la
    seule correction possible. */
export function AccordSurLaFiche({ client }: { client: Client }) {
  const [corrige, setCorrige] = useState(false);
  const [leverLeStop, setLeverLeStop] = useState(false);
  const jour = momentDuSalon().jour;
  const enfant = estUneTeteDEnfant(client, jour);
  const n = client.nouvelles;

  const poseLaReponse = (oui: boolean) => {
    ecrisLAccord(client.id, (f) => accordAPoser(f, oui, momentDuSalon().jour, 'comptoir'));
  };
  const corrigeLaReponse = (oui: boolean, stopLeve = false) => {
    const c = correctionDeLAccord(clientsStore.get().find((x) => x.id === client.id), oui, momentDuSalon().jour);
    if (!c) { setCorrige(false); return; }
    if (c.leveUnStop && !stopLeve) { setLeverLeStop(true); return; }
    ecrisLAccord(client.id, () => c.accord);
    setLeverLeStop(false);
    setCorrige(false);
  };

  return (
    <div data-accord="fiche">
      <span className="trc-microlabel">Nouvelles de la Maison</span>
      {enfant && !n ? (
        <div className="trc-sub" style={{ lineHeight: 1.5 }}>Fiche d’enfant : l’accord se donne sur la fiche du parent.</div>
      ) : !n ? (
        <>
          {laQuestionSePose(client, jour) && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }} title={AIDE}>
              <button type="button" className="trc-chip" onClick={() => poseLaReponse(true)}>Oui</button>
              <button type="button" className="trc-chip" onClick={() => poseLaReponse(false)}>Non</button>
            </div>
          )}
          <div className="trc-sub" style={{ marginTop: 8, lineHeight: 1.5 }}>{reponseDite(client)}</div>
        </>
      ) : (
        <>
          <div className="trc-sub" style={{ lineHeight: 1.5 }}>
            {reponseDite(client)}{' '}
            {!corrige && <button type="button" onClick={() => setCorrige(true)} style={{ background: 'none', border: 0, padding: 0, font: 'inherit', color: 'var(--copper-700)', textDecoration: 'underline', cursor: 'pointer' }}>Corriger</button>}
          </div>
          {corrige && !leverLeStop && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
              <button type="button" className={`trc-chip ${n.oui === true ? 'is-active' : ''}`} aria-pressed={n.oui === true} onClick={() => corrigeLaReponse(true)}>Oui</button>
              <button type="button" className={`trc-chip ${n.oui !== true ? 'is-active' : ''}`} aria-pressed={n.oui !== true} onClick={() => corrigeLaReponse(false)}>Non</button>
              <button type="button" className="trc-chip" onClick={() => setCorrige(false)}>Laisser</button>
            </div>
          )}
          {leverLeStop && (
            <div className="trc-sub" role="alert" style={{ marginTop: 8, lineHeight: 1.5 }}>
              Cette fiche a répondu STOP{jourCourtDeLAccord(n.le) ? ` le ${jourCourtDeLAccord(n.le)}` : ''}. Ne la réinscrivez que si la personne vous le demande elle-même.
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
                <button type="button" className="trc-chip" onClick={() => corrigeLaReponse(true, true)}>À sa demande : réinscrire</button>
                <button type="button" className="trc-chip" onClick={() => { setLeverLeStop(false); setCorrige(false); }}>Laisser le STOP</button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
