import { useEffect, useMemo, useRef, useState } from 'react';
import { useBranch } from '../../../../shared/branches';
import { useClients } from '../../../../shared/clients';
import {
  useMessagesWa, useFilsPrives, useFilsArchives, filsDeLaMaison, tetesDeLaMaison,
  filsSansReponse, resteEnClair, lienDuFil, messagesQuiSonnent, TIROIRS, TIROIR_DIT,
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
   nouveaux messages viennent sur mon tableau de bord avec une alarme rouge
   tant que je ne réponds pas » (Yéman).

   CE QUI MANQUAIT N'ÉTAIT PAS LA RÉPONSE : la zone de saisie existe dès que
   la fenêtre est ouverte. Ce qui manquait, c'était DE LE SAVOIR À TEMPS. Une
   cliente a écrit le 16 à 18 h 01 pour annuler ; personne n'a ouvert l'écran
   des conversations avant la fermeture de sa fenêtre, le 17 à 18 h 01.

   ROUGE TANT QUE PERSONNE N'A RÉPONDU. Le juge est `filsSansReponse`, bâti sur
   celui de la cloche : répondre, même par un modèle, éteint l'alarme ; archiver
   aussi. Chaque ligne dit le temps qui reste pour répondre LIBREMENT, parce
   que c'est la seule chose qui se perd en attendant.

   ELLE SONNE, avec la sonnette de la Maison et selon ses règles : rien au
   chargement, une seule fois par rafale, jamais la nuit, jamais si la Maison
   a coupé la sonnette dans les Réglages. C'est le SON qu'on coupe la nuit, pas
   le rouge : l'alarme reste visible jusqu'à la réponse. */

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

const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet',
  'août', 'septembre', 'octobre', 'novembre', 'décembre'];

/** Ce qu'elle a écrit, en une ligne. Un fil privé ne se lit pas ici. */
const ceQuElleDit = (f: Fil): string => {
  if (f.prive) return 'Fil privé, ouvrez-le pour lire.';
  const m: MessageWa = f.dernier;
  const t = (m.texte ?? '').trim();
  if (t) return t;
  return CE_QUI_EST_ARRIVE[m.type ?? ''] ?? 'Un message';
};

/** « il y a 3 h 10 », puis la date quand on a passé la journée. */
const quandRecu = (iso: string, maintenant: number): string => {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return '';
  const ecart = maintenant - t;
  if (ecart < 60_000) return 'à l’instant';
  if (ecart < 24 * 60 * 60 * 1000) return `il y a ${resteEnClair(ecart)}`;
  const d = new Date(t);
  const h = `${String(d.getHours()).padStart(2, '0')} h ${String(d.getMinutes()).padStart(2, '0')}`;
  return `le ${d.getDate()} ${MOIS[d.getMonth()]} à ${h}`;
};

export default function AlarmeWhatsApp() {
  const { branch } = useBranch();
  const [clients] = useClients();
  const [messages] = useMessagesWa();
  const [prives] = useFilsPrives();
  const [archives] = useFilsArchives();
  const [equipe] = useEquipe();
  const [prestataires] = useProviders();
  const [fournisseurs] = useFournisseurs();
  const [reglages] = useSettings();
  const estDirection = useEstDirection();

  /* L'HORLOGE BAT, SINON LE COMPTE À REBOURS MENT : même règle que l'écran
     des conversations, relue chaque minute. */
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
    () => filsSansReponse(tous, archives, estDirection ? TIROIRS : ['clientes']),
    [tous, archives, estDirection],
  );

  /* LA SONNETTE — les quatre pièges sont jugés dans `messagesQuiSonnent`. Le
     tableau de bord n'a pas de fil ouvert : tout ce qui arrive sonne. */
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
          const pressant = f.fenetre.ouverte && f.fenetre.resteMs < PRESSANT_MS;
          return (
            <li key={f.numero} className={`trp-alarme__ligne${f.fenetre.ouverte ? '' : ' est-fermee'}${pressant ? ' est-pressante' : ''}`}>
              <div className="trp-alarme__qui">
                <div className="trp-alarme__nom">
                  {f.nom}
                  {f.tiroir !== 'clientes' && <span className="trp-alarme__tiroir">{TIROIR_DIT[f.tiroir]}</span>}
                </div>
                <div className="trp-alarme__dit">{ceQuElleDit(f)}</div>
              </div>
              <div className="trp-alarme__quand">
                <span className="trp-alarme__recu">Reçu {quandRecu(f.dernier.quand, tick)}</span>
                <span className="trp-alarme__fenetre">
                  {f.fenetre.ouverte
                    ? `${resteEnClair(f.fenetre.resteMs)} pour répondre librement`
                    : 'Fenêtre fermée : seul un modèle payant peut partir'}
                </span>
              </div>
              <a className="trp-alarme__repondre" href={lienDuFil(f.numero) ?? '#/conversations'}>Répondre</a>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
