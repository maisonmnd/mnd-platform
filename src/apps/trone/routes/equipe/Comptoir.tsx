import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useBranch } from '../../../../shared/branches';
import { usePointageConfig, assurerCodeDuJour } from './payroll';
import './equipe.css';

/* ═══════════════════════════════════════════════════════════════════════════
   LE COMPTOIR — l'écran posé au salon, et rien d'autre.

   Il affiche le code du jour en grand, et se renouvelle seul. C'est la
   réponse à une question simple : comment prouver qu'une personne est
   physiquement là quand son téléphone refuse de donner sa position ?

   La preuve ne peut pas venir de l'application elle-même. Tout ce que le
   logiciel envoie au téléphone, le téléphone peut l'obtenir de son lit. Ce
   qu'on vérifie ici est d'un autre ordre : il a fallu se tenir DEVANT cet
   écran pour lire ces quatre chiffres. La preuve est dans le déplacement,
   pas dans la donnée.

   CET ÉCRAN NE S'OUVRE PAS DEPUIS UN COMPTE DE MAÎTRE. Le laisser à ceux qui
   pointent le viderait de son sens le jour même. Il vit avec les Paramètres :
   la Souveraine et le gérant, c'est-à-dire l'appareil du salon.

   Aucune barre latérale, aucun menu : on le pose sur une tablette le matin et
   on n'y touche plus. Le passage de minuit est surveillé — un écran resté
   allumé toute la nuit affiche le bon code au réveil de l'équipe. */

const iso = (d: Date) => d.toISOString().slice(0, 10);

const JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin',
  'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

const enToutesLettres = (d: Date) =>
  `${JOURS[d.getDay()]} ${d.getDate()} ${MOIS[d.getMonth()]}`;

export default function Comptoir() {
  const { branch } = useBranch();
  const [preuve, setPreuve] = usePointageConfig();
  const [jour, setJour] = useState(() => iso(new Date()));
  const navigate = useNavigate();

  /* MINUIT PASSE SANS QU'ON RECHARGE. On regarde la date chaque minute :
     l'écran reste des jours allumés, et personne ne viendra le rafraîchir. */
  useEffect(() => {
    const t = setInterval(() => {
      const d = iso(new Date());
      setJour((prev) => (prev === d ? prev : d));
    }, 60000);
    return () => clearInterval(t);
  }, []);

  /* LE CODE NAÎT ICI s'il n'existe pas encore pour aujourd'hui. Écrire pendant
     le rendu déclencherait une boucle ; on attend que React ait fini. */
  useEffect(() => {
    assurerCodeDuJour(preuve, jour, setPreuve);
  }, [jour, preuve, setPreuve]);

  const code = preuve.codeDate === jour ? preuve.codeValeur : undefined;

  return (
    <div className="cpt">
      {/* LA SORTIE RESTE DISCRÈTE MAIS EXISTE. Un écran plein qu'on ne peut
          pas quitter est un piège, et c'est une tablette partagée. */}
      <button className="cpt__sortie" onClick={() => navigate('/parametres')} aria-label="Quitter l'affichage">
        ✕
      </button>

      <div className="cpt__marque">{branch?.name ?? 'Maison MND'}</div>
      <div className="cpt__jour">{enToutesLettres(new Date(`${jour}T12:00:00`))}</div>

      <div className="cpt__code" aria-label="Code du jour">
        {code ? code.split('').map((c, i) => <span key={i} className="cpt__chiffre">{c}</span>)
          : <span className="cpt__attente">…</span>}
      </div>

      <div className="cpt__pied">
        Code du jour · à saisir au pointage
      </div>

      {!preuve.exigerPreuve && (
        <div className="cpt__dormant">
          La vérification de présence est désactivée — ce code ne sert à rien tant
          qu'elle l'est. Système → Paramètres → Preuve de présence.
        </div>
      )}
    </div>
  );
}
