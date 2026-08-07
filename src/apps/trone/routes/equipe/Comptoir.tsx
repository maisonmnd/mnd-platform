import { useEffect, useMemo, useState } from 'react';
import qrcode from 'qrcode-generator';
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

/* LE LIEN QUE PORTE LE QR. Chemin relatif à l'origine servie, jamais un
   domaine en dur : changer de compte GitHub ne doit rien casser. */
export const lienDuJour = (code: string) =>
  `${window.location.origin}${window.location.pathname}#/mon-mois?code=${code}`;

/* LE QR, DESSINÉ À LA MAIN en SVG depuis la matrice — comme les graphiques de
   cette maison. Un seul chemin pour tous les modules noirs : le navigateur en
   redessine des centaines à chaque rendu sinon, et l'écran reste allumé
   des journées entières. */
function QrSvg({ valeur }: { valeur: string }) {
  const d = useMemo(() => {
    const qr = qrcode(0, 'M');
    qr.addData(valeur);
    qr.make();
    const n = qr.getModuleCount();
    let path = '';
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        if (qr.isDark(r, c)) path += `M${c} ${r}h1v1h-1z`;
      }
    }
    return { path, n };
  }, [valeur]);

  return (
    <svg viewBox={`-2 -2 ${d.n + 4} ${d.n + 4}`} className="cpt__qrsvg" role="img" aria-label="Code du jour à scanner">
      <rect x={-2} y={-2} width={d.n + 4} height={d.n + 4} fill="#f6f1e8" />
      <path d={d.path} fill="#1b1f3b" shapeRendering="crispEdges" />
    </svg>
  );
}

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

      {/* LE QR D'ABORD. L'appareil photo natif de n'importe quel téléphone le
          lit — aucune application à installer, aucun chiffre à recopier. Il
          ouvre « Mon mois » avec le code déjà porté : il ne reste qu'à pointer.

          CE QU'IL PROUVE RESTE LE MÊME : il a fallu se tenir devant cet écran.
          Un QR photographié la veille ne vaut rien, le code change chaque nuit. */}
      {code && (
        <div className="cpt__qr">
          <QrSvg valeur={lienDuJour(code)} />
        </div>
      )}

      <div className="cpt__code" aria-label="Code du jour">
        {code ? code.split('').map((c, i) => <span key={i} className="cpt__chiffre">{c}</span>)
          : <span className="cpt__attente">…</span>}
      </div>

      <div className="cpt__pied">
        Scanne le carré · ou saisis ces quatre chiffres
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
