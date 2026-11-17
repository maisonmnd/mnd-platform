import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, Copy } from 'lucide-react';
import { Field, Input, Modal, toast } from '../../../../ds/components';
import { cheminDeLaConversation, lienWaMe, numeroWa } from '../../../../shared/conversations';
import { signeLeMessage } from '../../../../shared/identite';
import {
  QUESTIONS_DE_LA_ROUTINE, composeLaRoutine, messageDeLaRoutine, reponsesCompletes, touche,
  type ReponsesDeLaRoutine,
} from '../../../../shared/routine-de-soins-pur';
import { WaGlyph } from '../_ui';
import '../../shell/liens-a-envoyer.css';

/* ══ SA ROUTINE, REMISE AVEC LE RENDEZ-VOUS — 17 novembre 2026 ═══════════
   « Il ne faut pas permettre d'avoir des bilans sans prendre de RDV sinon
   tout le monde nous trichera » (Yéman). Le diagnostic en cinq questions du
   menu du site est fermé : le menu mène à la consultation, et la routine en
   trois temps se remet avec le rendez-vous, par la Maison.

   Les cinq questions et la composition sont celles du site, mot pour mot
   (`shared/routine-de-soins-pur`). La Maison les pose à la cliente, ou y
   répond d'après ce qu'elle a vu au fauteuil ; la routine se compose sous
   ses yeux, et part par les deux portes du Trône : « WhatsApp »
   (Conversations, le numéro de la Maison) ou « App » (l'application de
   l'appareil). La devise est posée par le code (`signeLeMessage`).
   Rien n'est écrit en base : c'est un message, pas une pièce. */

export default function LaRoutineDeSoins({ appel = '', numero = '', surFermer }: {
  /** Comment la saluer (« Awa », « Mme Awa ») ; vide : « Bonjour, ». */
  appel?: string;
  /** Son numéro, s'il est connu (depuis sa fiche). */
  numero?: string;
  surFermer: () => void;
}) {
  const navigate = useNavigate();
  const [salut, setSalut] = useState(appel);
  const [tel, setTel] = useState(numero);
  const [rep, setRep] = useState<ReponsesDeLaRoutine>({});
  const [copie, setCopie] = useState(false);

  const complet = reponsesCompletes(rep);
  const routine = complet ? composeLaRoutine(rep) : null;
  const texte = routine ? signeLeMessage(messageDeLaRoutine(routine, salut)) : '';
  const n = numeroWa(tel);

  const parLeTrone = () => {
    if (!texte) return;
    const vers = cheminDeLaConversation(tel, texte);
    if (!vers) { toast('Son numéro d’abord : Conversations s’ouvre sur un fil, et un fil, c’est un numéro.'); return; }
    surFermer();
    navigate(vers);
  };
  const copier = () => {
    if (!texte) return;
    void navigator.clipboard?.writeText(texte)
      .then(() => { setCopie(true); toast('Routine copiée.'); window.setTimeout(() => setCopie(false), 1600); })
      .catch(() => toast(texte, 9000));
  };

  return (
    <Modal title="Sa routine, en trois temps." onClose={surFermer} width={640}>
      <div className="trc-liens" data-routine={complet ? 'composee' : 'a-composer'}>
        <div className="tr-grid tr-grid--2">
          <Field label="Son prénom · facultatif">
            <Input value={salut} placeholder="Awa" autoComplete="off" onChange={(e) => setSalut(e.target.value)} />
          </Field>
          <Field label="Son numéro · facultatif">
            <Input value={tel} placeholder="01 97 00 00 00" type="tel" inputMode="tel" autoComplete="off" onChange={(e) => setTel(e.target.value)} />
          </Field>
        </div>

        {QUESTIONS_DE_LA_ROUTINE.map((q) => {
          const choisis = new Set(q.multi ? ((rep[q.cle] as string[] | undefined) ?? []) : [rep[q.cle] as string | undefined]);
          return (
            <div key={q.cle} role="group" aria-label={q.titre}>
              <div className="trc-liens__titre" style={{ marginBottom: 6 }}>{q.titre}{q.multi ? ' · plusieurs réponses' : ''}</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {q.reponses.map(([v, dit]) => (
                  <button key={v} type="button" className={`tre-chip${choisis.has(v) ? ' is-on' : ''}`} aria-pressed={choisis.has(v)} onClick={() => setRep((r) => touche(r, q, v))}>
                    {dit}
                  </button>
                ))}
              </div>
            </div>
          );
        })}

        <div className="trc-liens__apercu">
          <div className="trc-liens__titre">Le message</div>
          <pre>{texte || 'Les cinq réponses, et la routine se compose ici.'}</pre>
        </div>

        <div className="trc-liens__gestes" style={{ marginLeft: 0 }}>
          <button type="button" className={`trc-liens__copier${copie ? ' is-fait' : ''}`} title="Copier la routine" aria-label={copie ? 'Routine copiée' : 'Copier la routine'} disabled={!complet} onClick={copier}>
            {copie ? <Check size={15} /> : <Copy size={15} />}
          </button>
          <button
            type="button"
            className="trc-liens__porte trc-liens__porte--trone"
            aria-disabled={!n || !complet}
            title={n ? 'Ouvrir son fil dans Conversations, la routine posée. Elle part du numéro de la Maison.' : 'Son numéro d’abord.'}
            onClick={parLeTrone}
          >
            <WaGlyph /> WhatsApp
          </button>
          {complet && (
            <a
              className="trc-liens__porte trc-liens__porte--app"
              href={lienWaMe(tel, texte) ?? `https://wa.me/?text=${encodeURIComponent(texte)}`}
              target="_blank"
              rel="noreferrer"
              title="Ouvrir l’application WhatsApp. Ce qui s’y écrit n’entre pas dans le fil de la Maison."
            >
              App
            </a>
          )}
        </div>
      </div>
    </Modal>
  );
}
