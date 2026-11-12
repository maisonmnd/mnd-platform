import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { BookOpen, CalendarPlus, ClipboardList, FileText, Gift, Link2, PhoneIncoming, Plus, ReceiptText, Repeat, UserRound, Wallet, type LucideIcon } from 'lucide-react';
import { peutVoir } from '../routes/index';
import { staffAccessStore } from '../routes/equipe/data';
import { useStore } from '../../../shared/store';
import { useStaff } from '../../../shared/auth';
import './menu-creer.css';

/* ══ LE BOUTON « + CRÉER » — 10 novembre 2026 ══════════════════════════
   Un seul bouton pour tout créer : rendez-vous, cliente, appel reçu, facture,
   devis, encaisser, dépense, carte cadeau, abonnement, prestation. Il remplace
   les trois boutons « + Dépense », « + RDV » et « + Encaisser » éparpillés dans
   la barre du haut.

   LES ACCÈS SONT RESPECTÉS, ligne par ligne : chaque entrée qui ouvre un écran
   passe par `peutVoir` — le même juge que la barre latérale. Rendez-vous, appel
   reçu et encaisser restent toujours proposés, comme l'étaient les anciens
   boutons (la garde d'écran et la RLS les protègent ensuite).

   LE LIEN DE RÉSERVATION (12 novembre 2026) : en tête de Clientèle, pour
   toute l'équipe (un lien du site public n'a rien de privé). Il ouvre la
   fenêtre des liens à envoyer (`LiensAEnvoyer`).

   LE MENU S'OUVRE PAR-DESSUS LA PAGE (12 novembre 2026, « le bouton Créer
   ne marche pas sur la version mobile téléphone », Yéman). Au téléphone, la
   barre du haut est une rangée qui glisse au doigt (`overflow-x: auto`,
   `overflow-y: hidden`, trone.css, 5 novembre 2026) : un menu posé SOUS le
   bouton, à l'intérieur de la barre, était coupé net, invisible. Le toucher
   l'ouvrait pour rien. Comme la Recherche et Trouver, il passe désormais par
   un portail, en position fixe, placé sous le bouton au moment de l'ouvrir ;
   au téléphone, il prend la largeur de l'écran. */

type Entree = { id: string; label: string; sub: string; Icon: LucideIcon; act: () => void; ou?: string };

export default function MenuCreer({ onRendezVous, onAppelRecu, onLiens }: {
  onRendezVous: () => void;
  onAppelRecu: () => void;
  onLiens: () => void;
}) {
  const navigate = useNavigate();
  const staff = useStaff();
  const acces = useStore(staffAccessStore)[0];
  const mesDomaines = acces[staff?.user_id ?? ''] ?? {};
  const role = staff?.role;
  const [ouvert, setOuvert] = useState(false);
  const racine = useRef<HTMLDivElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  /* Où poser le menu : sous le bouton, aligné sur son bord droit. */
  const [place, setPlace] = useState({ haut: 64, droite: 12 });
  const bascule = () => {
    if (!ouvert) {
      const r = racine.current?.getBoundingClientRect();
      if (r) setPlace({ haut: Math.round(r.bottom + 8), droite: Math.max(12, Math.round(window.innerWidth - r.right)) });
    }
    setOuvert((v) => !v);
  };

  const peut = (p: string) => peutVoir(role, p, mesDomaines);
  const lance = (act: () => void) => { setOuvert(false); act(); };

  const groupes: { nom: string; entrees: Entree[] }[] = [
    {
      nom: 'Clientèle',
      entrees: [
        { id: 'liens', label: 'Lien de réservation', sub: 'réserver, ou venir au salon', Icon: Link2, act: onLiens },
        { id: 'rdv', label: 'Rendez-vous', sub: 'poser une venue au Carnet', Icon: CalendarPlus, act: onRendezVous },
        { id: 'cliente', label: 'Cliente', sub: 'une nouvelle fiche', Icon: UserRound, act: () => navigate('/customers?nouvelle=1'), ou: '/customers' },
        { id: 'appel', label: 'Appel reçu', sub: 'noter un appel WhatsApp', Icon: PhoneIncoming, act: onAppelRecu },
      ],
    },
    {
      nom: 'Argent',
      entrees: [
        { id: 'facture', label: 'Facture', sub: 'émettre une facture', Icon: FileText, act: () => navigate('/factures?nouveau=facture'), ou: '/factures' },
        { id: 'devis', label: 'Devis', sub: 'émettre un devis', Icon: ClipboardList, act: () => navigate('/factures?nouveau=devis'), ou: '/factures' },
        { id: 'encaisser', label: 'Encaisser', sub: 'à la Caisse POS', Icon: Wallet, act: () => navigate('/caisse') },
        { id: 'depense', label: 'Dépense', sub: 'inscrire une dépense', Icon: ReceiptText, act: () => navigate('/depenses?nouvelle=1'), ou: '/depenses' },
      ],
    },
    {
      nom: 'Comptoir & catalogue',
      entrees: [
        { id: 'carte', label: 'Carte cadeau', sub: 'une carte à offrir', Icon: Gift, act: () => navigate('/cartes-cadeaux'), ou: '/cartes-cadeaux' },
        { id: 'abo', label: 'Abonnement', sub: 'une formule', Icon: Repeat, act: () => navigate('/abonnements'), ou: '/abonnements' },
        { id: 'presta', label: 'Prestation', sub: 'au catalogue', Icon: BookOpen, act: () => navigate('/catalogue'), ou: '/catalogue' },
      ],
    },
  ];

  const visibles = groupes
    .map((g) => ({ ...g, entrees: g.entrees.filter((e) => !e.ou || peut(e.ou)) }))
    .filter((g) => g.entrees.length > 0);

  useEffect(() => {
    if (!ouvert) return;
    /* Le menu vit hors du bouton (portail) : un toucher DANS le menu ne le
       ferme pas, un toucher ailleurs, oui. */
    const dedans = (t: EventTarget | null) => !!t && ((racine.current?.contains(t as Node) ?? false) || (menu.current?.contains(t as Node) ?? false));
    const auClic = (e: MouseEvent) => { if (!dedans(e.target)) setOuvert(false); };
    const auTouche = (e: KeyboardEvent) => { if (e.key === 'Escape') setOuvert(false); };
    /* Posé en position fixe, il ne suivrait pas la page qui défile ni la barre
       qui glisse : il se referme plutôt que de flotter ailleurs. Défiler DANS
       le menu (long, au téléphone) ne le ferme pas. */
    const auDefilement = (e: Event) => { if (!dedans(e.target)) setOuvert(false); };
    /* La barre d'adresse du téléphone qui se replie redimensionne aussi la
       fenêtre, en hauteur seulement : seul un vrai changement de largeur
       (téléphone tourné, fenêtre élargie) le referme. */
    const largeur = window.innerWidth;
    const auRedimensionnement = () => { if (window.innerWidth !== largeur) setOuvert(false); };
    document.addEventListener('mousedown', auClic);
    document.addEventListener('keydown', auTouche);
    document.addEventListener('scroll', auDefilement, true);
    window.addEventListener('resize', auRedimensionnement);
    return () => {
      document.removeEventListener('mousedown', auClic);
      document.removeEventListener('keydown', auTouche);
      document.removeEventListener('scroll', auDefilement, true);
      window.removeEventListener('resize', auRedimensionnement);
    };
  }, [ouvert]);

  return (
    <div className="trc-creer" ref={racine}>
      <button
        type="button"
        className="trc-creer__bouton"
        aria-haspopup="menu"
        aria-expanded={ouvert}
        title="Créer : rendez-vous, cliente, facture, devis, dépense…"
        onClick={bascule}
      >
        <Plus size={15} />
        Créer
      </button>
      {ouvert && createPortal(
        <div
          ref={menu}
          className="trc-creer__menu"
          role="menu"
          aria-label="Créer"
          style={{ '--trc-creer-haut': `${place.haut}px`, '--trc-creer-droite': `${place.droite}px` } as CSSProperties}
        >
          {visibles.map((g) => (
            <div key={g.nom}>
              <div className="trc-creer__groupe">{g.nom}</div>
              {g.entrees.map((e) => {
                const Icon = e.Icon;
                return (
                  <button key={e.id} type="button" role="menuitem" className="trc-creer__item" onClick={() => lance(e.act)}>
                    <span className="trc-creer__ic"><Icon size={15} /></span>
                    <span className="trc-creer__txt"><b>{e.label}</b><span>{e.sub}</span></span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>,
        document.body,
      )}
    </div>
  );
}
