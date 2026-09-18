import { useEffect, useMemo, useRef, useState } from 'react';
import { useBranch } from '../../../../shared/branches';
import { useClients } from '../../../../shared/clients';
import {
  useMessagesWa, useFilsPrives, useFilsArchives, useAlarmeRetires, filsDeLaMaison, tetesDeLaMaison,
  filsSansReponse, resteEnClair, lienDuFil, messagesQuiSonnent, numeroWa, TIROIRS, TIROIR_DIT,
  type Fil, type MessageWa,
} from '../../../../shared/conversations';
import { useProviders } from '../../../../shared/prestataires';
import { useFournisseurs } from '../../../../shared/stock';
import { useSettings } from '../../../../shared/settings';
import { armeLaSonnette, sonne, cestLaNuit } from '../../../../shared/sonnette';
import { useStaff as useEquipe } from '../equipe/data';
import { useEstDirection } from '../_vie';
import { heuresDuJour } from '../clients/_heures';

/* ══ L'ALARME DES MESSAGES SANS RÉPONSE — 18 septembre 2026 ═════════════

   « Quand je reçois des messages WhatsApp dans conversations il faut
   absolument pouvoir répondre dans la fenêtre de 24 h. Je veux que tous les
   nouveaux messages viennent sur mon tableau de bord avec une alarme […]
   tant que je ne réponds pas » (Yéman).

   CE QUI MANQUAIT N'ÉTAIT PAS LA RÉPONSE : la zone de saisie existe dès que
   la fenêtre est ouverte. Ce qui manquait, c'était DE LE SAVOIR À TEMPS.

   RÉVISÉE LE MÊME JOUR, sur la capture de l'alarme en ligne :
   · « Le rouge n'existe pas dans la charte de la Maison. Mets la couleur
     cuivre de la charte. » L'alarme est cuivre (`pilotage.css`).
   · « Quand la fenêtre est fermée je ne peux plus rien faire. Faire
     apparaître les messages qui ont une fenêtre ouverte de 24 h. » Une
     fenêtre fermée quitte l'alarme d'elle-même ; le fil reste dans l'écran
     des conversations, et la cloche le compte toujours.
   · « Tu peux me donner la main pour enlever le message. » Le bouton
     Retirer : il ne touche QUE l'alarme, et un mot de plus le ramène.

   Le juge est `filsSansReponse`, bâti sur celui de la cloche : répondre,
   même par un modèle, éteint la ligne ; archiver aussi.

   ELLE SONNE, avec la sonnette de la Maison et selon ses règles : rien au
   chargement, une seule fois par rafale, jamais la nuit, jamais si la Maison
   a coupé la sonnette dans les Réglages. */

/** Sous deux heures, une fenêtre ouverte devient pressante. */
const PRESSANT_MS = 2 * 60 * 60 * 1000;

const CE_QUI_EST_ARRIVE: Record<string, string> = {
  image: 'Une photo',
  audio: 'Un message vocal',
  video: 'Une vidéo',
  document: 'Un document',
  sticker: 'Un autocollant',
  location: 'Une position',
};

/** Ce qu'elle a écrit, en une ligne. Un fil privé ne se lit pas ici. */
const ceQuElleDit = (f: Fil): string => {
  if (f.prive) return 'Fil privé, ouvrez-le pour lire.';
  const m: MessageWa = f.dernier;
  const t = (m.texte ?? '').trim();
  if (t) return t;
  return CE_QUI_EST_ARRIVE[m.type ?? ''] ?? 'Un message';
};

/** « il y a 3 h 10 ». Une fenêtre ouverte a toujours moins de 24 h. */
const quandRecu = (iso: string, maintenant: number): string => {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return '';
  const ecart = maintenant - t;
  return ecart < 60_000 ? 'à l’instant' : `il y a ${resteEnClair(ecart)}`;
};

export default function AlarmeWhatsApp() {
  const { branch } = useBranch();
  const [clients] = useClients();
  const [messages] = useMessagesWa();
  const [prives] = useFilsPrives();
  const [archives] = useFilsArchives();
  const [retires, setRetires] = useAlarmeRetires();
  const [equipe] = useEquipe();
  const [prestataires] = useProviders();
  const [fournisseurs] = useFournisseurs();
  const [reglages] = useSettings();
  const estDirection = useEstDirection();

  /* L'HORLOGE BAT : une fenêtre qui se ferme doit quitter l'alarme à la
     minute près, et le compte à rebours ne doit pas vieillir. */
  const [tick, setTick] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setTick(Date.now()), 60_000);
    return () => window.clearInterval(t);
  }, []);

  /* LES MÊMES TÊTES ET LES MÊMES FILS QUE L'ÉCRAN DES CONVERSATIONS. */
  const tetes = useMemo(
    () => tetesDeLaMaison({ clientes: clients, equipe, prestataires, fournisseurs }),
    [clients, equipe, prestataires, fournisseurs],
  );
  const tous = useMemo(
    () => filsDeLaMaison(messages, tetes, prives, tick, branch.id),
    [messages, tetes, prives, tick, branch.id],
  );
  const enAttente = useMemo(
    () => filsSansReponse(tous, archives, estDirection ? TIROIRS : ['clientes'], retires),
    [tous, archives, estDirection, retires],
  );

  /* RETIRER : l'instant du retrait. Tant qu'aucun message n'est plus récent,
     la ligne reste retirée ; un nouveau mot d'elle la ramène d'elle-même. */
  const retirer = (f: Fil) =>
    setRetires({ ...retires, [numeroWa(f.numero)]: { le: new Date().toISOString() } });

  /* LA SONNETTE — les quatre pièges sont jugés dans `messagesQuiSonnent`. */
  const vus = useRef<{ ids: string[]; premiere: boolean }>({ ids: [], premiere: true });
  useEffect(() => {
    const sonnants = messagesQuiSonnent({
      avant: vus.current.ids.map((id) => ({ id })),
      apres: messages,
      premiereLecture: vus.current.premiere,
    });
    vus.current = { ids: messages.map((m) => m.id), premiere: false };
    if (sonnants.length === 0 || reglages.sonnette === false) return;
    const [ouvre, ferme] = heuresDuJour();
    if (cestLaNuit(new Date(), ouvre, ferme)) return;
    sonne();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages]);

  /* Le navigateur ne laisse sonner qu'après un geste : on arme au premier. */
  useEffect(() => {
    const arme = () => armeLaSonnette();
    window.addEventListener('pointerdown', arme);
    window.addEventListener('keydown', arme);
    return () => {
      window.removeEventListener('pointerdown', arme);
      window.removeEventListener('keydown', arme);
    };
  }, []);

  /* RIEN QUI ATTEND, RIEN À DIRE : l'alarme disparaît avec la dernière
     réponse, et ne laisse pas de cadre vide derrière elle. */
  if (enAttente.length === 0) return null;

  const n = enAttente.length;
  return (
    <section className="trp-alarme" aria-label="Messages WhatsApp sans réponse">
      <div className="trp-alarme__tete">
        <span className="trp-alarme__voyant" aria-hidden="true" />
        <span className="trp-alarme__titre">
          {n === 1 ? 'Un message WhatsApp attend votre réponse' : `${n} messages WhatsApp attendent votre réponse`}
        </span>
        <a className="trp-alarme__tout" href="#/conversations">Ouvrir les conversations →</a>
      </div>
      <ul className="trp-alarme__liste">
        {enAttente.map((f) => {
          const pressant = f.fenetre.resteMs < PRESSANT_MS;
          return (
            <li key={f.numero} className={`trp-alarme__ligne${pressant ? ' est-pressante' : ''}`}>
              <div className="trp-alarme__qui">
                <div className="trp-alarme__nom">
                  {f.nom}
                  {f.tiroir !== 'clientes' && <span className="trp-alarme__tiroir">{TIROIR_DIT[f.tiroir]}</span>}
                </div>
                <div className="trp-alarme__dit">{ceQuElleDit(f)}</div>
              </div>
              <div className="trp-alarme__quand">
                <span className="trp-alarme__recu">Reçu {quandRecu(f.dernier.quand, tick)}</span>
                <span className="trp-alarme__fenetre">{resteEnClair(f.fenetre.resteMs)} pour répondre librement</span>
              </div>
              <div className="trp-alarme__gestes">
                <a className="trp-alarme__repondre" href={lienDuFil(f.numero) ?? '#/conversations'}>Répondre</a>
                <button
                  type="button"
                  className="trp-alarme__retirer"
                  onClick={() => retirer(f)}
                  title="Retirer de l’alarme sans répondre. Un nouveau message le fera revenir."
                >
                  Retirer
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
