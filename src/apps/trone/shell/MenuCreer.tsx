import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BookOpen, CalendarPlus, ClipboardList, FileText, Gift, PhoneIncoming, Plus, ReceiptText, Repeat, UserRound, Wallet, type LucideIcon } from 'lucide-react';
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
   boutons (la garde d'écran et la RLS les protègent ensuite). */

type Entree = { id: string; label: string; sub: string; Icon: LucideIcon; act: () => void; ou?: string };

export default function MenuCreer({ onRendezVous, onAppelRecu }: {
  onRendezVous: () => void;
  onAppelRecu: () => void;
}) {
  const navigate = useNavigate();
  const staff = useStaff();
  const acces = useStore(staffAccessStore)[0];
  const mesDomaines = acces[staff?.user_id ?? ''] ?? {};
  const role = staff?.role;
  const [ouvert, setOuvert] = useState(false);
  const racine = useRef<HTMLDivElement>(null);

  const peut = (p: string) => peutVoir(role, p, mesDomaines);
  const lance = (act: () => void) => { setOuvert(false); act(); };

  const groupes: { nom: string; entrees: Entree[] }[] = [
    {
      nom: 'Clientèle',
      entrees: [
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
    const auClic = (e: MouseEvent) => { if (racine.current && !racine.current.contains(e.target as Node)) setOuvert(false); };
    const auTouche = (e: KeyboardEvent) => { if (e.key === 'Escape') setOuvert(false); };
    document.addEventListener('mousedown', auClic);
    document.addEventListener('keydown', auTouche);
    return () => { document.removeEventListener('mousedown', auClic); document.removeEventListener('keydown', auTouche); };
  }, [ouvert]);

  return (
    <div className="trc-creer" ref={racine}>
      <button
        type="button"
        className="trc-creer__bouton"
        aria-haspopup="menu"
        aria-expanded={ouvert}
        title="Créer : rendez-vous, cliente, facture, devis, dépense…"
        onClick={() => setOuvert((v) => !v)}
      >
        <Plus size={15} />
        Créer
      </button>
      {ouvert && (
        <div className="trc-creer__menu" role="menu" aria-label="Créer">
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
        </div>
      )}
    </div>
  );
}
